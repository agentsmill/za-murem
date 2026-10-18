/* Za Murem 0.4: start (z panelem „Wasz zarząd”: liczba osób i własna drużyna), wczytanie osiedla, pętla gry
   z zarządem (uchwały, karta nocy, wydarzenia, raport), zapis i sterowanie. */

import './style.css';
import { LORE, LORE_ZOMBIE } from './content/data.ts';
import { hashString } from './core/rng.ts';
import { nightAdvice } from './gov/noc.ts';
import type { GovInput, GovState, Prompt } from './gov/typy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  setNight,
  signLaw,
} from './gov/zarzad.ts';
import { buildScene, TILE } from './render/art/scene.ts';
import { gameLights, strangerVisibility } from './render/game.ts';
import { type Light, lightAt } from './render/light.ts';
import { sectionOf, type ThingLike } from './render/section.ts';
import { GameView } from './render/view.ts';
import { WEAPONS, type WeaponId } from './sim/bron.ts';
import { BUILDS, type BuildKind, canPlace, footprint } from './sim/budowle.ts';
import { clockOf, dayOf, SPEEDS, START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from './sim/clock.ts';
import { applyGov, govInput, lawsFrom } from './sim/gov.ts';
import type { AptGame } from './sim/mieszkania.ts';
import { commandsAt, type MenuItem } from './sim/orders.ts';
import { addResidents, createSim, Sim } from './sim/sim.ts';
import { type SimPerson, type SimSnapshot, snapshot } from './sim/snapshot.ts';
import { type GameMode, modeOf, parseMode } from './sim/tryb.ts';
import { TUT_STEPS } from './sim/tutorial.ts';
import { allowedAnchors, availableOf, buildItems, buildMenu, buildSheet, okTilesOf, type Rot } from './ui/budowa.ts';
import { currentGoal, DAY2_WOOD, goalsDay2, goalsOf, isDay2, markTree, NIGHT_WOOD } from './ui/cele.ts';
import { Druzyna } from './ui/druzyna.ts';
import { groupCard, personCard } from './ui/karta.ts';
import { ContextMenu } from './ui/menu.ts';
import { aptAt, aptCard, aptState, aptView } from './ui/mieszkania.ts';
import {
  burnSheet,
  confirmSheet,
  endSheet,
  eventSheet,
  helpSheet,
  lawSheet,
  menuSheet,
  nightOdds,
  nightSheet,
  oddsHtml,
  optionDetail,
  reportSheet,
} from './ui/okna.ts';
import { Modal } from './ui/okno.ts';
import { renderStats, statsOf } from './ui/pasek.ts';
import { arriving, comingText } from './ui/przybycie.ts';
import { govFence } from './ui/siatka.ts';
import { pointerButton, wheelKind, zoomFactor } from './ui/sterowanie.ts';
import { esc } from './ui/tekst.ts';
import { clearSave, readSave, type Save, saveLabel, worldKey, writeSave } from './ui/zapis.ts';
import { crownOf, type MarkSpot, markSpot } from './ui/znacznik.ts';
import { demoList, type Loaded, loadAddress, loadDemo } from './world/load.ts';
import { buildWorld, T, type World } from './world/world.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const touchUI = matchMedia('(pointer: coarse)').matches;

declare global {
  interface Window {
    /** do testów i pomiarów (Playwright) */
    zm?: {
      ready: boolean;
      sim: Sim | null;
      gov: GovState | null;
      view: GameView;
      fps: () => number;
      setCam: (x: number, y: number, zoom: number) => void;
      chunksPending: () => number;
      idle: () => boolean;
      /** krok zarządu teraz (jakby minęła sekunda przy ekranie); zwraca rodzaj decyzji, która czeka */
      govTick: () => string | null;
      /** przewija grę o tyle minut gry (czas przy ekranie jak w tempie mult, domyślnie 1×); staje na decyzji
          zarządu i zwraca jej rodzaj */
      ff: (minutes: number, mult?: number) => string | null;
      /** punkt na ekranie dla miejsca w metrach (kafelkach) */
      screenOf: (x: number, y: number) => [number, number];
      save: () => boolean;
      /** sekundy przy ekranie bez pauzy i bieżące tempo (do pomiarów rytmu gry) */
      screen: () => number;
      speed: () => number;
      /** płynny przejazd kamery do miejsca w metrach (do nagrań) */
      fly: (x: number, y: number, zoom: number, ms: number) => void;
      /** tryb stawiania (do testów): plan pod kursorem, czy wolno, ile dozwolonych miejsc i pierwsze z nich */
      placing: () => {
        kind: BuildKind;
        x: number;
        y: number;
        rot: number;
        ok: boolean;
        why?: string;
        allowed: number;
        first: number;
      } | null;
      /** stan mieszkań siedziby w grze (st.apts) */
      apts: () => AptGame[];
      /** przyjęcie n osób zza bramy jak po decyzji zarządu (do zrzutów); zwraca, ilu przybyło */
      admit: (n: number) => number;
    };
  }
}

const view = new GameView();
let sim: Sim | null = null;
let gov: GovState | null = null;
let loaded: Loaded | null = null;
let seed = 0;
let hqName = '';
let fenceIn: GovInput['fence'];
/** sekundy przy ekranie bez pauzy (dla zarządu: tempo wydarzeń) i chwila ostatniego kroku zarządu */
let screen = 0;
let govAt = 0;
let speed = 1;
/** tempo sprzed okna, które zatrzymało grę */
let hold: number | null = null;
/** noc po karcie biegnie w tym tempie (indeks SPEEDS: 6×), rano wraca tempo dnia */
const NIGHT_PACE = 3;
let dayPace: number | null = null;
/** napad, o którym warta już dała znać (tick z planu), i tempo nocy sprzed zwolnienia na czas napadu */
let raidSeen = -1;
let raidHeard = -1;
let raidHold: number | null = null;
let acc = 0;
let savedHour = -1;
const selected = new Set<number>();
let hint = '';
let hintUntil = 0;
const modal = new Modal($('modal'), $('sheet'));
const ctx = new ContextMenu($('ctx'));

/* ---------- ekran startowy ---------- */
/* tryb gry: przełącznik na ekranie startowym albo ?tryb=zombie; wstęp zmienia się razem z nim */
let mode: GameMode = parseMode(params.get('tryb'));
const setMode = (m: GameMode) => {
  mode = m;
  $('lore').textContent = m === 'zombie' ? LORE_ZOMBIE : LORE;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name=tryb]')) r.checked = r.value === m;
};
setMode(mode);
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=tryb]'))
  r.addEventListener('change', () => r.checked && setMode(parseMode(r.value)));
/* „Wasz zarząd”: liczba osób i własna drużyna (src/ui/druzyna.ts), zwinięte do jednej linijki, dopóki gracz nie otworzy;
   bez bloku #druzyna w index.html gra startuje z zarządem z adresu jak dawniej */
const druzynaEl = document.getElementById('druzyna');
const druzyna = druzynaEl ? new Druzyna(druzynaEl) : null;
const status = (t: string) => {
  $('startStatus').textContent = t;
};
demoList().then((list) => {
  const box = $('demos');
  for (const d of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = `Przykład: ${d.name}`;
    b.title = d.label;
    b.onclick = () => start(() => loadDemo(d.key));
    box.appendChild(b);
  }
});
$('startForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $<HTMLInputElement>('addr').value.trim();
  if (q) start(() => loadAddress(q, status));
});
const resume = readSave();
if (resume) {
  $('resume').hidden = false;
  $('btnResume').textContent = `Kontynuuj: ${saveLabel(resume)}`;
  $('btnResume').onclick = () => start(async () => resume.data, resume);
  // usunięcie zapisu w dwóch krokach, bez natywnego confirm
  let armed = 0;
  $('btnForget').onclick = () => {
    if (performance.now() - armed > 4000) {
      armed = performance.now();
      $('btnForget').textContent = 'Na pewno? Usuń';
      setTimeout(() => {
        if (!$('resume').hidden) $('btnForget').textContent = 'Usuń zapis';
      }, 4000);
      return;
    }
    clearSave();
    $('resume').hidden = true;
  };
}

let busy = false;
async function start(get: () => Promise<Loaded>, saved?: Save) {
  if (busy) return;
  busy = true;
  try {
    const data = await get();
    status('Rysuję osiedle…');
    await new Promise((r) => setTimeout(r, 0));
    await enter(data, saved);
    status('');
  } catch (err) {
    const m = (err as Error)?.message || '';
    const net = err instanceof TypeError || (err as Error)?.name === 'AbortError';
    status(
      `${net ? 'Nie mogę połączyć się z serwerami map: brak sieci albo serwery są przeciążone.' : m || 'Coś poszło nie tak.'} Możecie zagrać na przykładowym osiedlu.`,
    );
    console.error(err);
  }
  busy = false;
}

let preview: { things: ThingLike[]; lights: Light[] } | null = null;

async function enter(data: Loaded, saved?: Save) {
  // ziarno z adresu: to samo osiedle zawsze ma tych samych ludzi, inne osiedle innych
  seed = saved?.seed ?? (Number(params.get('seed')) || Number.parseInt(hashString(data.addr), 16) || 2051);
  const t0 = performance.now();
  const world = buildWorld(data.geo, { seed, street: data.street });
  const scene = buildScene(world);
  // przekrój siedziby z wnętrzem ze świata; ?przekroj=0 zostawia dach (do porównań)
  if (params.get('przekroj') !== '0') scene.section = sectionOf(world);
  console.info(`świat ${Math.round(performance.now() - t0)} ms, budynków ${world.buildings.length}`);
  // zapis z innej wersji świata (po zmianie generatora) nie pasuje do stanu: to samo osiedle od nowa
  const stale = !!saved && saved.world !== worldKey(world);
  if (stale) saved = undefined;
  // tłum obcych tylko do pomiarów (?perf=150); w grze są mieszkańcy siedziby, których dokłada symulacja
  const crowd = params.has('perf') ? Number(params.get('perf')) : 0;
  // wszystko, co może się nie udać, przed przełączeniem ekranu: błąd zostaje na ekranie startowym
  // zarząd z panelu „Wasz zarząd”: bez ruszania go 4 osoby z adresu, jak zawsze
  const st = saved ? saved.sim : createSim(world, seed, { ...(druzyna?.opcje() ?? { core: 4 }), crowd, mode });
  const zombie = modeOf(st) === 'zombie';
  $('start').hidden = true;
  $('app').hidden = false;
  // płótno mierzy element; był ukryty, więc trzeba przeliczyć rozmiar po odsłonięciu
  view.app.resize();
  view.setScene(scene);
  // ?godzina=22 (albo ?hour=22, także z ułamkiem: 18.5 to 18:30): pora dnia na start
  const hour = params.get('godzina') ?? params.get('hour');
  if (hour !== null && !saved)
    st.tick = Math.round(
      (((((Number(hour) * 60 - START_MINUTES) / 60) * TICKS_PER_HOUR) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY,
    );
  sim = new Sim(world, st);
  placing = null;
  aptFocus = -1;
  residentFocus = -1;
  // uchwały są w stanie symulacji (zapis je ma); do symulacji idą tylko po podpisaniu
  gov = saved ? saved.gov : newGov(seed, modeOf(st));
  // ?stado=N: od razu N szwendaczy pod siatką przy siedzibie (podgląd i zrzuty)
  const herd = Number(params.get('stado'));
  if (!saved && zombie && herd > 0) sim.spawnAtFence(herd, world.buildings[world.hq]?.entrances[0]?.out ?? 0);
  // pasek: w trybie zombie siatka i stado zamiast temperatury na dworze
  $('sOut').hidden = zombie;
  $('sFence').hidden = !zombie;
  $('sHorde').hidden = !zombie;
  document.body.classList.toggle('zombie', zombie);
  screen = saved?.screen ?? 0;
  govAt = screen;
  loaded = data;
  hqName = world.buildings[world.hq]?.name ?? '';
  fenceIn = govFence(world);
  savedHour = Math.floor(st.tick / TICKS_PER_HOUR);
  $('osName').textContent = data.name;
  document.title = `Za Murem · ${data.name}`;
  const hq = world.buildings[world.hq];
  // kamera na drzwi siedziby, przy których stoi zarząd (środek rdzenia)
  const core = st.pawns.filter((p) => p.kind === 'core');
  const hx = core.length ? (core.reduce((a, p) => a + p.x, 0) / core.length) * TILE : ((hq.x0 + hq.x1 + 1) / 2) * TILE;
  const hy = core.length ? (core.reduce((a, p) => a + p.y, 0) / core.length) * TILE : ((hq.y0 + hq.y1 + 1) / 2) * TILE;
  const cam = params.get('cam');
  if (saved?.cam) Object.assign(view.cam, saved.cam);
  else if (cam) {
    // cam=x,y,zoom w kafelkach albo cam=hq,zoom (siedziba) albo cam=all (całe osiedle)
    const parts = cam.split(',');
    if (parts[0] === 'all')
      Object.assign(view.cam, { x: (world.size * TILE) / 2, y: (world.size * TILE) / 2, zoom: view.minZoom });
    else if (parts[0] === 'hq') Object.assign(view.cam, { x: hx, y: hy, zoom: Number(parts[1]) || 1 });
    else {
      const [x, y, z] = parts.map(Number);
      Object.assign(view.cam, { x: x * TILE, y: y * TILE, zoom: z || 1 });
    }
  } else {
    // najpierw całe osiedle, potem zjazd do siedziby
    Object.assign(view.cam, { x: (world.size * TILE) / 2, y: (world.size * TILE) / 2, zoom: view.minZoom });
    flyTo(hx, hy, 1, 2400);
  }
  // ?swiatla=test zapala kozę i stawia przy zarządzie ognisko i lampę warty, ze światłami
  preview = params.get('swiatla') === 'test' ? previewNight(world, hx / TILE, hy / TILE) : null;
  drawState();
  if (params.has('speed')) speed = Number(params.get('speed'));
  // z samouczkiem pierwszy krok to zaznaczenie kogoś, bez niego zaznaczony jest pierwszy z zarządu
  const first = st.pawns[0];
  if (first && st.tut.step < 0 && !saved) selected.add(first.id);
  if (stale) say('Zapis był z innej wersji osiedla, więc gra zaczyna się od nowa.', 9000);
  else if (!saved && zombie)
    say(
      'Za siatką snują się szwendacze, a nocą przyjdzie stado. Dzida sięga przez siatkę, strzał ściąga następnych.',
      9000,
    );
  else if (!saved)
    say(
      touchUI
        ? 'To wasz zarząd. Jednym palcem przesuwacie mapę, dwoma przybliżacie. Cele są pod paskiem u góry.'
        : 'To wasz zarząd. Przeciąganie przesuwa mapę, kółko przybliża. Cele pierwszego dnia są po lewej.',
      9000,
    );
  renderSpeed();
  if (window.zm) {
    window.zm.sim = sim;
    window.zm.gov = gov;
  }
  // z zapisu: raport albo karta, które czekały
  if (saved) nextPrompt();
}

/**
 * Podgląd nocy przy zarządzie stojącym w (x, y) metrów: ognisko i lampa warty na najbliższych
 * wolnych kafelkach trawy, paląca się koza w mieszkaniu zarządu, do tego ich światła (promienie
 * jak na arkuszu grafiki: ognisko 5,5 m, lampa 3 m, koza w pokoju 4 m).
 */
function previewNight(w: World, x: number, y: number): { things: ThingLike[]; lights: Light[] } {
  const size = w.size;
  const taken = new Set<number>();
  const spot = (offs: [number, number][]) => {
    for (const [dx, dy] of offs) {
      const tx = Math.floor(x + dx);
      const ty = Math.floor(y + dy);
      const i = ty * size + tx;
      if (tx < 0 || ty < 0 || tx >= size || ty >= size || taken.has(i)) continue;
      if (w.blocked[i] || w.bid[i] >= 0 || (w.terr[i] !== T.GRASS && w.terr[i] !== T.PARK)) continue;
      taken.add(i);
      return [tx, ty] as const;
    }
    return null;
  };
  const ring = (r: number): [number, number][] =>
    Array.from({ length: 16 }, (_, k) => [
      Math.round(Math.cos((k / 16) * 6.283) * r),
      Math.round(Math.sin((k / 16) * 6.283) * r - 1),
    ]);
  const things: ThingLike[] = [];
  const lights: Light[] = [];
  const fire = spot([...ring(4), ...ring(5), ...ring(6)]);
  if (fire) {
    things.push({ kind: 'ognisko', x: fire[0], y: fire[1], w: 1, h: 1, rot: 0, fuel: 1 });
    lights.push({ x: fire[0] + 0.5, y: fire[1] + 0.6, r: 5.5, color: 0xff8a30, strength: 1.1, flicker: 0.35 });
  }
  // lampa warty po drugiej stronie zarządu niż ognisko, żeby światła się nie zlewały
  const lamp = spot([...ring(3), ...ring(4)].reverse());
  if (lamp) {
    things.push({ kind: 'lampa', x: lamp[0], y: lamp[1], w: 1, h: 1, rot: 0, spec: { kind: 'lampa', lit: true } });
    lights.push({ x: lamp[0] + 0.5, y: lamp[1] + 0.6, r: 3, color: 0xffb060, strength: 0.75, flicker: 0.08 });
  }
  const koza = w.interior.furniture.find((f) => f.kind === 'koza');
  if (koza)
    lights.push({ x: koza.x + 0.5, y: koza.y + 0.5, r: 4, color: 0xff8a30, strength: 1, flicker: 0.3, inside: true });
  return { things, lights };
}

/** stan gry na ekranie: rzeczy, ścięte drzewa, światła i siatka ze stanu symulacji (syncGame z src/render) */
function drawState() {
  if (!sim) return;
  view.syncGame(sim);
  // ?swiatla=test: światła podglądu nocy zamiast świateł z gry
  if (preview) view.lights = preview.lights;
}

/* ---------- zarząd ---------- */
function input(): GovInput {
  const s = sim!;
  const i = govInput(s.st, s.w, Math.floor(screen), hqName);
  // stan dziur (łaty, wielkość) jest w symulacji, a nazwy z kierunku od środka podwórka daje interfejs
  const names = new Map(s.w.fence?.hole.map((t, k) => [t, fenceIn?.holes[k]?.name]) ?? []);
  for (const h of i.fence?.holes ?? []) {
    const tiles = s.st.fence?.holes.find((x) => x.id === h.id)?.tiles ?? [];
    h.name ??= tiles.map((t) => names.get(t)).find(Boolean);
  }
  // warta i dyżur przy kozie, które stoją (także z menu), zarząd bierze z posterunków osób (people[].post)
  return i;
}

/** skutki zarządu do symulacji; ostatni wpis kroniki jako podpowiedź (bez niej, gdy zaraz otworzy się okno) */
function applyFx(fx: ReturnType<typeof govUpdate>, hint = true): string {
  if (!sim) return '';
  applyGov(sim.st, sim.w, fx);
  const last = fx.log[fx.log.length - 1] ?? '';
  if (last && hint) say(last, 7000);
  return last;
}

/** krok zarządu: skutki do symulacji, potem decyzja do pokazania (show: od razu okno) */
function govStep(show: boolean): Prompt | null {
  if (!sim || !gov || gov.over) return null;
  const i = input();
  // bez ludzi zarząd kończy grę (pustka), więc dopiero po powstaniu pionków albo gdy ostatni zginął
  if (!i.people.length && !(sim.st.dead ?? []).some((d) => d.kind === 'core')) return null;
  const fx = govUpdate(gov, i);
  const p = gov.over ? null : pending(gov, i);
  applyFx(fx, !p);
  if (gov.over) {
    if (show) showEnd();
    return null;
  }
  if (p && show && !modal.open) showPrompt(p);
  return p;
}

function pauseGame() {
  if (hold === null) hold = speed;
  speed = 0;
  renderSpeed();
}
function resumeGame() {
  if (hold === null) return;
  speed = hold;
  hold = null;
  renderSpeed();
}

/** po zamknięciu okna: następna decyzja zarządu albo powrót do gry w tym samym tempie */
function nextPrompt() {
  if (!sim || !gov) return resumeGame();
  if (gov.over) return showEnd();
  const p = pending(gov, input());
  if (p) showPrompt(p);
  else resumeGame();
}

function decided() {
  modal.close();
  save();
  nextPrompt();
}

function showPrompt(p: Prompt) {
  if (!gov) return;
  const g = gov;
  pauseGame();
  ctx.close();
  if (p.k === 'raport')
    modal.show(reportSheet(p.report), (act) => {
      if (act !== 'report-ok') return;
      ackReport(g, input());
      if (dayPace !== null) {
        hold = dayPace;
        dayPace = null;
      }
      decided();
    });
  else if (p.k === 'uchwala')
    modal.show(lawSheet(p), (act, arg) => {
      if (act === 'law') applyFx(signLaw(g, input(), arg));
      else if (act === 'law-skip') applyFx(signLaw(g, input(), null));
      else return;
      sim?.setLaws(lawsFrom(lawEffects(g)));
      decided();
    });
  else if (p.k === 'karta') showNight(p);
  else
    modal.show(eventSheet(p), (act, arg) => {
      if (act !== 'event') return;
      applyFx(chooseEvent(g, input(), Number(arg)));
      decided();
    });
}

function showNight(p: Extract<Prompt, { k: 'karta' }>) {
  const g = gov!;
  const card = p.card;
  const names = Object.fromEntries(card.people.map((c) => [c.id, c.name]));
  const i = input();
  const assign = () => g.night?.assign ?? p.assign;
  modal.show(nightSheet(card, assign(), nightOdds(g, i, card, assign())), (act, arg, el) => {
    if (act === 'select') {
      const id = el.dataset.id ?? '';
      if (!setNight(g, id, arg)) {
        (el as HTMLSelectElement).value = assign()[id] ?? 'sen';
        return;
      }
      const odds = modal.find('[data-odds]');
      if (odds) odds.innerHTML = oddsHtml(card, assign(), nightOdds(g, i, card, assign()), names);
      const advice = modal.find('[data-advice]');
      if (advice) advice.textContent = nightAdvice(i, card, assign());
      const o = card.people.find((c) => c.id === id)?.options.find((q) => q.key === arg);
      const line = modal.find(`.opt[data-for="${CSS.escape(id)}"]`);
      if (line && o) line.textContent = optionDetail(o);
    } else if (act === 'night-reset') {
      for (const c of card.people) setNight(g, c.id, c.proposal);
      showNight(p);
    } else if (act === 'night-go') {
      const line = applyFx(confirmNight(g, input()));
      // zarząd idzie spać: do rana czas płynie szybciej, potem wraca tempo dnia (chyba że gracz sam je zmieni)
      if (hold !== null && hold > 0 && hold < NIGHT_PACE) {
        dayPace = hold;
        hold = NIGHT_PACE;
        say(`${line ? `${line} ` : ''}Do rana czas płynie szybciej (6×).`, 9000);
      }
      decided();
    }
  });
}

function showEnd() {
  if (!gov?.over) return;
  pauseGame();
  clearSave();
  modal.show(endSheet(gov.over), (act) => {
    if (act === 'end-start') location.href = location.pathname;
  });
}

function save(): boolean {
  if (!sim || !gov || !loaded || gov.over) return false;
  return writeSave({
    v: 1,
    at: Date.now(),
    data: loaded,
    seed,
    sim: sim.st,
    gov,
    screen,
    cam: { ...view.cam },
    world: worldKey(sim.w),
  });
}
window.addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

/**
 * Napad w nocy: kiedy szabrownicy czają się za siatką, a ktoś z zarządu stoi na warcie, warta to słyszy i gra mówi
 * gdzie. Jeśli są w świetle (lampa warty, ognisko), kamera jedzie na miejsce, a gdy tempo nocy ustawiła gra (6× po
 * karcie), noc zwalnia do 1× do końca napadu. Bez warty nikt nic nie słyszy: o napadzie mówi kronika i raport.
 */
/** od tej widoczności (jak w rysowaniu obcych: 0 ciemność, 1 pełne światło) warta „widzi” szabrowników */
const SEEN = 0.25;
function watchRaid() {
  if (!sim) return;
  const r = sim.st.raid;
  if (raidHold !== null && (!r || r.phase >= 3)) {
    // po napadzie noc znowu biegnie szybciej
    if (!modal.open) {
      speed = raidHold;
      renderSpeed();
    } else hold = raidHold;
    raidHold = null;
    say('Szabrownicy odeszli. Do rana znowu szybciej (6×).', 5000);
  }
  if (r?.phase !== 1 || raidSeen === r.at || modal.open) return;
  const st = sim.st;
  const lamps = st.pawns.filter((p) => p.kind === 'core' && !p.away && p.job?.t === 'guard' && p.job.phase === 1);
  const them = st.pawns.filter((p) => p.kind === 'szabrownik');
  if (!lamps.length || !them.length) return;
  // widać ich tak, jak rysuje widok: światło latarni warty i ogniska w ich miejscu (sam zasięg z symulacji,
  // LAMP_REACH 5 m, jest większy niż rysowana latarnia, 3 m, więc kamera przyjeżdżała do ciemności)
  const lights = gameLights({ st, light: [] }, []).filter((l) => !l.inside);
  const time = performance.now() / 1000;
  const lit = them.some((q) => strangerVisibility(view.darkness, lightAt(q.x, q.y - 0.5, lights, time)) >= SEEN);
  const where = () => {
    const hole = input().fence?.holes.find((h) => `d${h.id}` === r.post);
    return r.post === 'brama' ? 'przy bramie' : `przy dziurze ${hole?.name ?? 'w siatce'}`;
  };
  // w ciemności warta tylko słyszy (raz); patrzymy dalej, bo zaraz mogą wejść w światło lampy
  if (!lit) {
    if (raidHeard !== r.at) {
      raidHeard = r.at;
      say(`Warta słyszy coś ${where()}, ale tam ciemno. Światło przy siatce pokazałoby, kto to.`, 8000);
    }
    return;
  }
  raidSeen = r.at;
  const slow = dayPace !== null && speed > 1;
  if (slow) {
    raidHold = speed;
    speed = 1;
    renderSpeed();
  }
  say(`Warta widzi szabrowników ${where()}.${slow ? ' Czas zwalnia do 1×.' : ''}`, 9000);
  const x = them.reduce((a, p) => a + p.x, 0) / them.length;
  const y = them.reduce((a, p) => a + p.y, 0) / them.length;
  // bez zmiany przybliżenia: kamera tylko przesuwa się na miejsce
  flyTo(x * TILE, y * TILE, view.cam.zoom, 1200);
}

/* ---------- kamera ---------- */
let fly: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t0: number; ms: number } | null =
  null;
/** przejazd kamery do (x, y) w pikselach świata; wait: ile ms odczekać przed ruszeniem (przy alarmie chwila,
    żeby gracz przeczytał napis, a po przycisku od razu) */
function flyTo(x: number, y: number, zoom: number, ms: number, wait = 500) {
  fly = { x0: view.cam.x, y0: view.cam.y, z0: view.cam.zoom, x1: x, y1: y, z1: zoom, t0: performance.now() + wait, ms };
}
function stepFly(now: number) {
  if (!fly) return;
  const t = Math.min(1, Math.max(0, (now - fly.t0) / fly.ms));
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  view.cam.x = fly.x0 + (fly.x1 - fly.x0) * e;
  view.cam.y = fly.y0 + (fly.y1 - fly.y0) * e;
  view.cam.zoom = fly.z0 * (fly.z1 / fly.z0) ** e;
  if (t >= 1) fly = null;
}
const screenOf = (x: number, y: number): [number, number] => [
  (x * TILE - view.cam.x) * view.cam.zoom + view.width / 2,
  (y * TILE - view.cam.y) * view.cam.zoom + view.height / 2,
];

/* ---------- pętla ---------- */
let fpsFrames = 0;
let fpsT = performance.now();
let fps = 0;
let hudT = 0;
const keys = new Set<string>();

function frame(now: number, dtMs: number) {
  if (!sim) return;
  stepFly(now);
  // klawiatura: przesuwanie mapy
  const pan = (900 * dtMs) / 1000 / view.cam.zoom;
  if (keys.has('KeyW') || keys.has('ArrowUp')) view.cam.y -= pan;
  if (keys.has('KeyS') || keys.has('ArrowDown')) view.cam.y += pan;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) view.cam.x -= pan;
  if (keys.has('KeyD') || keys.has('ArrowRight')) view.cam.x += pan;
  view.clampCam();
  // stały krok symulacji
  const mult = SPEEDS[speed];
  const dt = Math.min(dtMs, 100) / 1000;
  acc += dt * TICKS_PER_SECOND * mult;
  let n = 0;
  while (acc >= 1 && n < 40) {
    view.beforeStep(sim.st);
    sim.step();
    acc -= 1;
    n++;
  }
  if (n === 40) acc = 0;
  // czas przy ekranie płynie tylko w grze bez pauzy, niezależnie od tempa
  if (mult && !modal.open) screen += dt;
  if (screen - govAt >= 1) {
    govAt = screen;
    govStep(true);
  }
  watchRaid();
  drawState();
  view.render(sim.st, mult ? acc : 1, selected);
  placeMarker();
  placeGhost();
  // zapis co godzinę gry
  const h = Math.floor(sim.st.tick / TICKS_PER_HOUR);
  if (h !== savedHour) {
    savedHour = h;
    save();
  }
  fpsFrames++;
  if (now - fpsT >= 1000) {
    fps = (fpsFrames * 1000) / (now - fpsT);
    fpsFrames = 0;
    fpsT = now;
  }
  if (now - hudT > 200) {
    hudT = now;
    hud(now);
  }
}

let cardHtml = '';
/** historia rozwinięta na karcie tej osoby (pionek); inna osoba na karcie to historia znowu w jednej linijce */
let storyOf = -1;
/** karta przerysowana tylko po zmianie treści, inaczej dymki z opisem cech nigdy się nie pokażą */
function setCard(html: string) {
  if (html === cardHtml) return;
  cardHtml = html;
  $('card').innerHTML = html;
}

/** co osoba robi tej nocy według karty nocy (propozycja albo zatwierdzony przydział), a bez karty posterunek
    z symulacji (warta albo dyżur przy kozie z menu trwa do rana) */
function tonight(p: SimPerson): string | undefined {
  const n = gov?.night;
  const key = n?.assign[p.id];
  if (n && key && key !== 'sen') {
    const label = n.card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key)?.label ?? key;
    return `Tej nocy: ${label.toLowerCase()}${n.confirmed ? '' : ' (propozycja)'}.`;
  }
  if (p.post === 'koza') return 'Do rana: czuwa przy kozie.';
  if (p.post)
    return `Do rana: warta ${p.post === 'brama' ? 'przy bramie' : p.post === 'siatka' ? 'przy siatce' : 'przy dziurze w siatce'}.`;
  return undefined;
}

function hud(now: number) {
  if (!sim) return;
  const st = sim.st;
  $('hDay').textContent = `Dzień ${dayOf(st.tick)}`;
  $('hTime').textContent = clockOf(st.tick);
  $('fps').textContent = `${Math.round(fps)} kl/s`;
  const snap = snapshot(st, sim.w);
  // koza wygasła po samouczku, a drewna nie ma: decyzja gracza (drzewo albo mebel), więc ostrzeżenie wisi,
  // dopóki problem trwa (w dzień, kiedy zarząd nie śpi), i ma pierwszeństwo przed zwykłymi podpowiedziami
  const wood = snap.stock.woodSklad + snap.stock.woodLoose + snap.stock.woodCarried;
  const afterKoza = st.tut.step < 0 || st.tut.step > TUT_STEPS.indexOf('koza');
  const cold = afterKoza && !snap.kozaLit && !wood && snap.hour >= 6 && snap.hour < 22;
  // gorączka po ugryzieniu: niecałe 2 godziny do śmierci, a zmarły wstaje, więc ktoś z bronią powinien być przy nim
  const dying = snap.people.find((p) => p.bite && p.bite.left < 2 * TICKS_PER_HOUR);
  const fever = dying
    ? `${dying.name} umiera w gorączce. Po śmierci wstanie: niech ktoś z bronią będzie obok, żeby dobić.`
    : '';
  const warn = fever
    ? fever
    : cold
      ? touchUI
        ? 'Koza wygasła, a drewna nie ma. Zetnijcie drzewo albo spalcie mebel (przytrzymajcie na nim palec).'
        : 'Koza wygasła, a drewna nie ma. Zetnijcie drzewo albo spalcie mebel (prawy przycisk na meblu).'
      : '';
  $('hint').textContent = warn || (now < hintUntil ? hint : '');
  $('hint').classList.toggle('warn', !!warn);
  renderStats(statsOf(snap, gov));
  renderGoals(snap);
  // przyjęci idą zza bramy: komunikat z przyciskiem „Pokaż”, dopóki ktoś jeszcze idzie
  const coming = arriving(st).length;
  $('arrive').hidden = !coming;
  if (coming && $('arriveText').textContent !== comingText(coming)) $('arriveText').textContent = comingText(coming);
  const card = $('card');
  // karta mieszkańca z osobą (kliknięty): do odczytu, zasłania kartę zaznaczonego z zarządu, dopóki jest wybrana
  const lok = residentFocus >= 0 ? snap.lokatorzy.find((p) => p.pawn === residentFocus) : undefined;
  if (residentFocus >= 0 && !lok) residentFocus = -1;
  if (lok) {
    card.hidden = false;
    setCard(personCard(lok, st.tick, undefined, storyOf === lok.pawn, { lokator: true }));
    return;
  }
  const sel = snap.people.filter((p) => selected.has(p.pawn));
  if (!sel.length) {
    // karta mieszkania po kliknięciu w mieszkanie siedziby
    const apt = aptFocus >= 0 ? aptView(st, sim.w, aptFocus, snap.apts) : null;
    card.hidden = !apt;
    if (apt) setCard(aptCard(apt, touchUI));
    return;
  }
  card.hidden = false;
  if (sel.length > 1)
    setCard(
      groupCard(
        sel.map((p) => p.name),
        touchUI,
      ),
    );
  else setCard(personCard(sel[0], st.tick, tonight(sel[0]), storyOf === sel[0].pawn));
}

let goalsHtml = '';
/** zapas drewna na noc był choć raz (cel się nie cofa, kiedy koza zje drewno); drugi dzień osobno */
let woodReady = false;
let woodReady2 = false;
function renderGoals(snap: SimSnapshot) {
  const el = $('goals');
  if (!sim) return;
  const wood = snap.stock.woodSklad + snap.stock.woodLoose + snap.stock.woodCarried;
  if (wood >= NIGHT_WOOD && sim.st.tut.step >= TUT_STEPS.length) woodReady = true;
  let list = goalsOf(sim.st, gov, {
    touch: touchUI,
    kitchen: snap.kitchen,
    hour: snap.hour,
    selected: snap.people.some((p) => selected.has(p.pawn)),
    wood,
    woodReady,
  });
  let cur = currentGoal(list);
  let title = 'Pierwszy dzień';
  // po pierwszej nocy cele drugiego dnia: przeszukać, warsztat, obwód, drewno na noc
  if (!cur && isDay2(gov)) {
    if (wood >= DAY2_WOOD) woodReady2 = true;
    list = goalsDay2(sim.st, gov, { touch: touchUI, wood, woodReady: woodReady2, holes: snap.fence.holes.length });
    cur = currentGoal(list);
    title = 'Drugi dzień';
  }
  // po drugiej nocy lista znika
  if (!cur) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const done = list.filter((g) => g.done).length;
  const html = `<button type="button" class="goals-head" aria-expanded="${el.classList.contains('open')}"><span>${title}</span><b class="goals-n">${done}/${list.length}</b></button><ol class="goal-list">${list
    .map(
      (g, k) =>
        `<li class="goal${g.missed ? ' missed' : g.done ? ' done' : g === cur ? ' now' : ''}" data-n="${k + 1}">${esc(g.text)}${
          g === cur ? `<small class="goal-how">${esc(g.how)}</small>` : ''
        }</li>`,
    )
    .join('')}</ol>`;
  if (html === goalsHtml) return;
  goalsHtml = html;
  el.innerHTML = html;
}
// na telefonie lista celów zwija się do bieżącego celu
$('goals').addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.goals-head')) return;
  $('goals').classList.toggle('open');
  goalsHtml = '';
  if (sim) renderGoals(snapshot(sim.st, sim.w));
});

/** miejsce etykiety suchego drzewa, liczone raz dla świata i układu ekranu (etykieta jedzie z mapą i nie
    skacze; na wąskim ekranie tylko nad koroną albo pod pniem) */
let markWorld: World | null = null;
let markNarrow = false;
let markAt: MarkSpot | null = null;
/** szerokość napisu w pikselach (mierzona po zmianie tekstu, nie co klatkę) */
let markW = 120;
/** węższy ekran (telefon): napis z boku korony się nie mieści */
const NARROW = 640;

/** znacznik z boku korony suchego drzewa (tam, gdzie nie zasłania bramy, siatki ani rzeczy), a gdy drzewo
    jest poza ekranem, przy krawędzi ze strzałką w jego stronę */
function placeMarker() {
  const el = $('treeMark');
  const w = sim?.w;
  if (!sim || !w || w.dryTree < 0 || !markTree(sim.st) || modal.open) {
    el.hidden = true;
    return;
  }
  const narrow = view.width < NARROW;
  if (markWorld !== w || markNarrow !== narrow) {
    markWorld = w;
    markNarrow = narrow;
    markAt = markSpot(w, narrow ? ['n', 's'] : undefined);
  }
  const crown = crownOf(w);
  if (!markAt || !crown) {
    el.hidden = true;
    return;
  }
  const side = markAt.side;
  const [sx, sy] = screenOf(markAt.x, markAt.y);
  // lewy brzeg napisu: z boku obok punktu, nad koroną i pod pniem na środku
  const x0 = side === 'w' ? sx - 10 - markW : side === 'e' ? sx + 10 : sx - markW / 2;
  // pod paskiem, a nad listą celów pod nią (lewy brzeg napisu na jej szerokości)
  const bar = $('top').getBoundingClientRect().bottom;
  const goals = $('goals');
  const g = goals.hidden ? null : goals.getBoundingClientRect();
  // komunikat o przybyszach stoi pod paskiem (na telefonie pod listą celów): napis, który na niego wchodzi, idzie pod spód
  const notice = $('arrive');
  const n = notice.hidden ? null : notice.getBoundingClientRect();
  const under = (left: number) => {
    const t = g && left < g.right ? Math.max(bar, g.bottom) : bar;
    return n && left < n.right && left + markW > n.left ? Math.max(t, n.bottom) : t;
  };
  let top = under(x0);
  // poza ekranem (punkt, w który celuje ogonek): przy krawędzi ze strzałką, napis wyśrodkowany w cx
  const edge = sx < 70 || sx > view.width - 70 || sy < top + 30 || sy > view.height - 70;
  const cx = edge ? Math.max(70, Math.min(view.width - 70, sx)) : sx;
  if (edge) top = under(cx - markW / 2);
  const cy = edge ? Math.max(top + 30, Math.min(view.height - 70, sy)) : sy;
  // napis wystający za ekran przesuwa się płynnie do środka (bez skoku na inną stronę)
  const shift = edge ? 0 : Math.max(4 - x0, Math.min(0, view.width - 4 - (x0 + markW)));
  el.hidden = false;
  el.classList.toggle('edge', edge);
  el.dataset.side = edge ? '' : side;
  el.style.setProperty('--shift', `${Math.round(shift)}px`);
  // kreska od ogonka do korony, gdy napis stoi dalej od drzewa
  el.style.setProperty('--lead', `${Math.round(markAt.lead * TILE * view.cam.zoom)}px`);
  el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
  // poza ekranem: strzałka w stronę korony (osiem kierunków)
  const [tx, ty] = screenOf(crown.x, crown.y);
  const arrow = edge ? `${ARROWS[(Math.round(Math.atan2(ty - cy, tx - cx) / (Math.PI / 4)) + 8) % 8]} ` : '';
  const label = el.firstElementChild as HTMLElement;
  if (label.textContent !== `${arrow}Suche drzewo`) {
    label.textContent = `${arrow}Suche drzewo`;
    markW = label.offsetWidth || markW;
  }
}
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

function say(t: string, ms = 4000) {
  hint = t;
  hintUntil = performance.now() + ms;
}

function renderSpeed() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button'))
    b.setAttribute('aria-pressed', String(Number(b.dataset.s) === speed));
}
$('speed').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  speed = Number(b.dataset.s);
  hold = null;
  dayPace = null;
  raidHold = null;
  renderSpeed();
});
$('zIn').onclick = () => view.zoomAt(view.width / 2, view.height / 2, 1.5);
$('zOut').onclick = () => view.zoomAt(view.width / 2, view.height / 2, 1 / 1.5);
$('zHome').onclick = () => {
  if (!sim) return;
  const hq = sim.w.buildings[sim.w.hq];
  flyTo(((hq.x0 + hq.x1 + 1) / 2) * TILE, ((hq.y0 + hq.y1 + 1) / 2) * TILE + 120, Math.max(1, view.cam.zoom), 700);
};

/* ---------- menu gry (zamiast natywnego confirm) ---------- */
function showMenu() {
  const note = readSave()
    ? `Gra zapisuje się sama co godzinę gry i przy zamknięciu karty. Ostatni zapis: ${saveLabel(readSave()!)}.`
    : 'Gra zapisuje się sama co godzinę gry i przy zamknięciu karty.';
  modal.show(
    menuSheet(note),
    (act) => {
      if (act === 'menu-back') {
        modal.close();
        nextPrompt();
      } else if (act === 'menu-help')
        modal.show(
          helpSheet(touchUI, !!sim && modeOf(sim.st) === 'zombie'),
          (a) => {
            if (a === 'help-back') showMenu();
          },
          nextPrompt,
        );
      else if (act === 'menu-v03') save();
      else if (act === 'menu-start') {
        save();
        location.href = location.pathname;
      }
    },
    nextPrompt,
  );
}
$('btnMenu').onclick = () => {
  if (!sim || modal.open) return;
  pauseGame();
  ctx.close();
  showMenu();
};

/* ---------- broń i alarm ---------- */
$('btnAlarm').onclick = () => {
  if (!sim || modal.open) return;
  const core = sim.st.pawns.filter((p) => p.kind === 'core' && !p.away).map((p) => p.id);
  sim.push({ t: 'alarm', ids: core });
  say(
    modeOf(sim.st) === 'zombie'
      ? 'Do broni! Wszyscy zdolni na wartę przy siatce.'
      : 'Do broni! Wszyscy zdolni na wartę przy bramie.',
    4000,
  );
};

/** kolejność broni przy „Zmień”: najpierw to, co sięga przez siatkę */
const ARM_ORDER: readonly WeaponId[] = ['dzida', 'rewolwer', 'strzelba', 'kusza', 'siekiera', 'lom', 'kij', 'noz'];
$('card').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-card]');
  if (!b || !sim) return;
  const st = sim.st;
  // karta mieszkańca jest tylko do odczytu: z jej przycisków działa historia; zmiana imienia (data-card="imie", na
  // kartach zarządu i mieszkańca) dostaje obsługę w kroku 6, na razie przycisk nic nie robi
  if (residentFocus >= 0) {
    if (b.dataset.card === 'story') {
      storyOf = storyOf === residentFocus ? -1 : residentFocus;
      hud(performance.now());
    }
    return;
  }
  const sel = st.pawns.filter((p) => p.kind === 'core' && selected.has(p.id));
  if (sel.length !== 1) return;
  const p = sel[0];
  if (b.dataset.card === 'story') {
    // historia z drużyny: jedna linijka albo cała, od razu na karcie
    storyOf = storyOf === p.id ? -1 : p.id;
    hud(performance.now());
  } else if (b.dataset.card === 'arm') {
    // następna broń z magazynu w ustalonej kolejności, a gdy nie ma żadnej: odłożyć to, co w rękach
    const have = new Set(st.store.arms ?? []);
    const list = ARM_ORDER.filter((w) => have.has(w) && w !== p.weapon);
    const at = p.weapon ? ARM_ORDER.indexOf(p.weapon) : -1;
    const next = list.find((w) => ARM_ORDER.indexOf(w) > at) ?? list[0] ?? null;
    if (next === null && !p.weapon) return say('W magazynie nie ma broni.', 2500);
    sim.push({ t: 'arm', ids: [p.id], weapon: next });
    say(next ? `Bierze ${WEAPONS[next].acc}.` : 'Odkłada broń do magazynu.', 2500);
  } else if (b.dataset.card === 'amputate') {
    // amputuje ten z zarządu, kto najlepiej zna się na medycynie
    const doc = st.pawns
      .filter((q) => q.kind === 'core' && q !== p && !q.away && (q.needs?.health ?? 0) > 20)
      .sort((a, c) => (st.people[c.person].skills.med ?? 0) - (st.people[a.person].skills.med ?? 0) || a.id - c.id)[0];
    if (!doc) return say('Nie ma komu amputować.', 3000);
    sim.push({ t: 'amputate', ids: [doc.id], patient: p.id });
    say(`${st.people[doc.person].first} amputuje. Pół godziny, nie zawsze się udaje.`, 4000);
  }
});

/* ---------- polecenia ---------- */
const FEEDBACK: Record<MenuItem['cmd']['t'], [string, string]> = {
  move: ['Idzie.', 'Idą.'],
  select: ['', ''],
  chop: ['Idzie ściąć drzewo.', 'Idą ściąć drzewo.'],
  haul: ['Zaniesie drewno do składu.', 'Zaniosą drewno do składu.'],
  refuel: ['Dołoży do kozy.', 'Dołożą do kozy.'],
  burn: ['Rozbierze mebel na opał.', 'Rozbiorą mebel na opał.'],
  cook: ['Ugotuje coś z zapasów.', 'Ugotują coś z zapasów.'],
  gate: ['Idzie do bramy.', 'Idą do bramy.'],
  guard: ['Stanie na warcie.', 'Staną na warcie.'],
  patch: ['Załata dziurę w siatce.', 'Załatają dziurę w siatce.'],
  campfire: ['Rozpali ognisko.', 'Rozpalą ognisko.'],
  // polecenia zarządu i symulacji, nie z menu
  away: ['', ''],
  back: ['', ''],
  laws: ['', ''],
  raid: ['', ''],
  mend: ['', ''],
  arm: ['', ''],
  attack: ['Atakuje.', 'Atakują.'],
  finish: ['Dobije zwłoki.', 'Dobiją zwłoki.'],
  amputate: ['Amputuje.', 'Amputują.'],
  craft: ['Zrobi dzidę.', 'Zrobią dzidę.'],
  brace: ['Wzmocni siatkę.', 'Wzmocnią siatkę.'],
  alarm: ['Do broni!', 'Do broni!'],
  build: ['Weźmie się do budowy.', 'Jedna osoba weźmie się do budowy.'],
  unbuild: ['', ''],
  search: ['Przeszuka pomieszczenie.', 'Jedna osoba przeszuka pomieszczenie.'],
  dismantle: ['Rozbierze to na materiał.', 'Jedna osoba rozbierze to na materiał.'],
  repair: ['Przyniesie materiał i naprawi.', 'Jedna osoba przyniesie materiał i naprawi.'],
  claim: ['Zajmie mieszkanie dla zarządu.', 'Jedna osoba zajmie mieszkanie dla zarządu.'],
};

function run(m: MenuItem) {
  if (!sim) return;
  sim.push(m.cmd);
  const f = FEEDBACK[m.cmd.t][m.cmd.ids.length > 1 ? 1 : 0];
  if (f) say(f, 1800);
}

/** polecenie z potwierdzeniem: palenie mebli ma własne okno, reszta (rozbiórka, zajęcie) ogólne */
function askConfirm(m: MenuItem) {
  if (m.cmd.t === 'burn') {
    askBurn(m);
    return;
  }
  pauseGame();
  modal.show(
    confirmSheet(m.label),
    (act) => {
      if (act !== 'confirm-yes' && act !== 'confirm-no') return;
      if (act === 'confirm-yes') run(m);
      modal.close();
      nextPrompt();
    },
    nextPrompt,
  );
}

function askBurn(m: MenuItem) {
  const c = m.cmd;
  if (!sim || c.t !== 'burn') return;
  const thing = sim.st.things.find((t) => t.id === c.thing);
  if (!thing) return;
  const owner = sim.st.pawns.find((p) => p.id === thing.owner);
  // imię tylko dla mebla kogoś z zarządu (tekst mówi o „reszcie zarządu”); mieszkaniec z osobą nie jest z zarządu
  const name = owner?.kind === 'core' ? (sim.st.people[owner.person]?.name ?? null) : null;
  const softer = !!gov && lawEffects(gov).burnMood < 1;
  pauseGame();
  modal.show(
    burnSheet(thing.kind, name, softer),
    (act) => {
      if (act !== 'burn-yes' && act !== 'burn-no') return;
      if (act === 'burn-yes') run(m);
      modal.close();
      nextPrompt();
    },
    nextPrompt,
  );
}

/** polecenie w miejscu (sx, sy): menu (prawy przycisk, przytrzymanie) albo od razu domyślne (stuknięcie) */
function orderAt(sx: number, sy: number, menu: boolean) {
  // w trybie stawiania stuknięcie i przytrzymanie należą do planu budowy
  if (!sim || placing) return;
  const ids = [...selected];
  const tile = view.tileAt(sx, sy);
  const items = commandsAt(sim.st, sim.w, ids, tile);
  if (!items.length) {
    say(touchUI ? 'Najpierw stuknijcie kogoś z zarządu.' : 'Najpierw zaznaczcie kogoś z zarządu.', 2500);
    return;
  }
  // plan budowy albo gotowa budowla pod kursorem: jej polecenia przed „Idź tu”, polecenia symulacji pierwsze
  const snap = snapshot(sim.st, sim.w);
  const extra = buildItems(sim.st, sim.w, ids, tile, snap.stock);
  const go = items.findIndex((x) => x.cmd.t === 'move');
  items.splice(go < 0 ? items.length : go, 0, ...extra);
  if (!menu) {
    const q = items.find((x) => x.quick);
    if (q) run(q);
    return;
  }
  // samo „Idź tu”: bez menu
  if (items.length === 1) {
    run(items[0]);
    return;
  }
  const who = sim.st.pawns
    .filter((p) => selected.has(p.id) && p.kind === 'core')
    .map((p) => sim!.st.people[p.person]?.first ?? '');
  const head = who.length > 2 ? `Zarząd (${who.length})` : who.join(' i ');
  // w mieszkaniu siedziby nagłówek mówi, które to mieszkanie i w jakim stanie
  const apt = aptAt(sim.w, tile);
  const v = apt >= 0 ? aptView(sim.st, sim.w, apt, snap.apts) : null;
  const where = v ? ` · mieszkanie ${apt + 1}, ${aptState(v).toLowerCase()}` : '';
  ctx.show(items, sx, sy, `${head}${where}`, (x) => (x.confirm ? askConfirm(x) : run(x)));
}

/** zaznaczenie ludzi z zarządu prowadzi pierwszy krok samouczka */
function selectedChanged() {
  // zaznaczenie kogoś zamyka kartę mieszkania i kartę mieszkańca
  aptFocus = -1;
  residentFocus = -1;
  if (sim?.st.tut.step !== 0 || !selected.size) return;
  sim.push({ t: 'select', ids: [...selected] });
}

/* ---------- budowa: menu i tryb stawiania ---------- */
/** plan pod kursorem: rodzaj, lewy górny kafelek, obrót, czy wolno postawić i dozwolone miejsca */
let placing: {
  kind: BuildKind;
  rot: Rot;
  x: number;
  y: number;
  ok: boolean;
  why?: string;
  allowed: number[];
  /** kafelki, na których ta budowla może stanąć (suma podstaw z dozwolonych zakotwiczeń) */
  okTiles: number[];
} | null = null;
/** mieszkanie na karcie (klik w mieszkanie siedziby, gdy nikt nie jest zaznaczony) albo −1 */
let aptFocus = -1;
/** mieszkaniec z osobą na karcie do odczytu (id pionka po kliknięciu w niego) albo −1 */
let residentFocus = -1;

/** podgląd stawiania w rysowaniu (view.setPlacement, robi sesja rysowania); bez niego duch z DOM */
/** kształt podglądu od rysowania: kafelki jako indeksy y * size + x; bad zostaje puste, bo duch i tak jest czerwony */
type PlacementView = {
  kind: BuildKind;
  x: number;
  y: number;
  rot: Rot;
  ok: boolean;
  tiles?: { ok?: number[]; bad?: number[] };
} | null;
let placementKey = '';
function setPlacementView(p: PlacementView): boolean {
  const fn = (view as unknown as { setPlacement?: (p: PlacementView) => void }).setPlacement;
  if (typeof fn !== 'function') return false;
  const key = p ? `${p.kind},${p.x},${p.y},${p.rot},${p.ok},${p.tiles?.ok?.length ?? 0}` : '';
  if (key !== placementKey) {
    placementKey = key;
    fn.call(view, p);
  }
  return true;
}

/** menu budowy: przycisk „Budowa” i klawisz B */
function openBuild() {
  if (!sim || modal.open) return;
  const s = sim;
  cancelPlacing(false);
  ctx.close();
  const room = (k: BuildKind) =>
    allowedAnchors(s.st, s.w, k, 0).length > 0 || allowedAnchors(s.st, s.w, k, 1).length > 0;
  // materiały bez tego, co plany jeszcze zabiorą ze składu
  modal.show(buildSheet(buildMenu(availableOf(s.st, snapshot(s.st, s.w).stock), room), touchUI), (act, arg) => {
    if (act === 'build') {
      modal.close();
      startPlacing(arg as BuildKind);
      nextPrompt();
    } else if (act === 'build-close') {
      modal.close();
      nextPrompt();
    }
  });
}

function startPlacing(kind: BuildKind) {
  if (!sim) return;
  const allowed = allowedAnchors(sim.st, sim.w, kind, 0);
  placing = { kind, rot: 0, x: 0, y: 0, ok: false, allowed, okTiles: okTilesOf(allowed, kind, 0, sim.w.size) };
  // plan na środku ekranu, dopóki kursor albo palec nie pokaże miejsca
  aimAt(view.width / 2, view.height / 2);
  $('placeBar').hidden = false;
}

/** plan tak, żeby punkt ekranu (sx, sy) wypadł w środku budowli */
function aimAt(sx: number, sy: number) {
  if (!sim || !placing) return;
  const t = view.tileAt(sx, sy);
  const { w: fw, h: fh } = footprint(placing.kind, placing.rot);
  placing.x = (t % sim.w.size) - Math.floor((fw - 1) / 2);
  placing.y = Math.floor(t / sim.w.size) - Math.floor((fh - 1) / 2);
  const c = canPlace(sim.st, sim.w, placing.kind, placing.x, placing.y, placing.rot);
  placing.ok = c.ok;
  placing.why = c.why;
  placeInfo();
}

function rotatePlacing() {
  if (!sim || !placing) return;
  const { w: fw, h: fh } = footprint(placing.kind, placing.rot);
  // obrót wokół środka planu
  const cx = placing.x + Math.floor((fw - 1) / 2);
  const cy = placing.y + Math.floor((fh - 1) / 2);
  placing.rot = ((placing.rot + 1) % 4) as Rot;
  placing.allowed = allowedAnchors(sim.st, sim.w, placing.kind, placing.rot);
  placing.okTiles = okTilesOf(placing.allowed, placing.kind, placing.rot, sim.w.size);
  const [sx, sy] = screenOf(cx + 0.5, cy + 0.5);
  aimAt(sx, sy);
}

function cancelPlacing(tell = true) {
  if (!placing) return;
  placing = null;
  $('placeBar').hidden = true;
  $('ghost').hidden = true;
  setPlacementView(null);
  if (tell) say('Budowa anulowana.', 1500);
}

/** klik albo stuknięcie w trybie stawiania: lewy klik i stuknięcie stawiają, prawy klik anuluje;
    z Shiftem plan zostaje do następnej budowli. Zwraca true, gdy klik należał do planu. */
function placeClick(sx: number, sy: number, button: number, type: string, shift: boolean): boolean {
  if (!sim || !placing) return false;
  if (type === 'mouse' && button === 2) {
    cancelPlacing();
    return true;
  }
  if (type === 'mouse' && button !== 0) return false;
  aimAt(sx, sy);
  if (!placing.ok) {
    say(placing.why ?? 'Tu nie da się postawić.', 2500);
    return true;
  }
  const { kind, x, y, rot } = placing;
  // kto buduje: zaznaczeni z zarządu, a bez zaznaczenia zarząd wybiera sam
  const ids = sim.st.pawns.filter((p) => selected.has(p.id) && p.kind === 'core').map((p) => p.id);
  sim.push({ t: 'build', ids, kind, x, y, rot });
  say(`Plan: ${BUILDS[kind].name}. Zarząd przyniesie materiały i zbuduje.`, 3000);
  if (shift && type === 'mouse') {
    placing.allowed = allowedAnchors(sim.st, sim.w, kind, rot);
    placing.okTiles = okTilesOf(placing.allowed, kind, rot, sim.w.size);
    aimAt(sx, sy);
  } else cancelPlacing(false);
  return true;
}

/** napis na pasku trybu stawiania: co, czy wolno i jak sterować */
function placeInfo() {
  if (!placing) return;
  const name = BUILDS[placing.kind].name;
  const state = placing.ok ? 'tu można postawić' : (placing.why ?? 'tu nie da się postawić').replace(/\.$/, '');
  const how = touchUI ? 'Stuknięcie stawia plan.' : 'Lewy klik stawia, R obraca, prawy klik albo Esc anuluje.';
  const text = `${name}: ${state.charAt(0).toLowerCase()}${state.slice(1)}. ${how}`;
  const el = $('placeText');
  if (el.textContent !== text) el.textContent = text;
  $('placeBar').classList.toggle('bad', !placing.ok);
}

/** duch planu co klatkę (kamera się rusza); rysowanie z setPlacement robi to samo w mapie */
function placeGhost() {
  const g = $('ghost');
  if (!placing || modal.open) {
    g.hidden = true;
    if (!placing) setPlacementView(null);
    return;
  }
  // na dotyku nie ma kursora: plan stoi na środku ekranu jak celownik, a mapa przesuwa się pod nim
  if (touchUI) aimAt(view.width / 2, view.height / 2);
  const p = placing;
  if (setPlacementView({ kind: p.kind, x: p.x, y: p.y, rot: p.rot, ok: p.ok, tiles: { ok: p.okTiles } })) {
    g.hidden = true;
    return;
  }
  const { w: fw, h: fh } = footprint(p.kind, p.rot);
  const [x0, y0] = screenOf(p.x, p.y);
  const [x1, y1] = screenOf(p.x + fw, p.y + fh);
  g.hidden = false;
  g.classList.toggle('bad', !p.ok);
  g.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
  g.style.width = `${Math.round(x1 - x0)}px`;
  g.style.height = `${Math.round(y1 - y0)}px`;
  const t = $('ghostText');
  const name = BUILDS[p.kind].name;
  if (t.textContent !== name) t.textContent = name;
}

$('btnBuild').addEventListener('click', () => openBuild());
// „Pokaż” przy przybyszach: kamera od razu jedzie na środek grupy, bez zmiany przybliżenia
$('arriveShow').addEventListener('click', () => {
  const coming = sim ? arriving(sim.st) : [];
  if (!coming.length) return;
  const x = coming.reduce((a, p) => a + p.x, 0) / coming.length;
  const y = coming.reduce((a, p) => a + p.y, 0) / coming.length;
  flyTo(x * TILE, y * TILE, view.cam.zoom, 900, 0);
});
$('placeBar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-place]');
  if (!b) return;
  if (b.dataset.place === 'rot') rotatePlacing();
  else cancelPlacing();
});

/* ---------- mysz i dotyk ---------- */
const stage = $('stage');
const pointers = new Map<number, { x: number; y: number }>();
/** palce i rysik na mapie: przy nich szczypanie robi pointermove, a gesty Safari tylko blokują przybliżanie strony */
const fingers = new Set<number>();
let drag: {
  id: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  button: number;
  type: string;
  /** Shift przy wciśnięciu: przeciąganie lewym przyciskiem rysuje ramkę zamiast przesuwać mapę */
  shift: boolean;
  moved: boolean;
} | null = null;
let pinch: { d: number; z: number; mx: number; my: number } | null = null;
/** przytrzymany palec: po pół sekundy menu poleceń zamiast stuknięcia */
let press: { id: number; timer: number; fired: boolean } | null = null;
/** wskaźnik, który tylko zamknął menu (bez polecenia i bez odznaczania) */
let swallow = -1;
const box = $('box');

const endPress = () => {
  if (press) clearTimeout(press.timer);
};
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (e.pointerType !== 'mouse') fingers.add(e.pointerId);
  fly = null;
  // Ctrl+klik to prawy przycisk (Mac: gładzik i mysz z jednym przyciskiem; macOS daje wtedy button 0 z ctrlKey)
  const button = pointerButton(e);
  if (ctx.open) {
    ctx.close();
    // lewy klik albo stuknięcie obok tylko zamyka menu; prawy od razu otwiera nowe w nowym miejscu
    if (button !== 2) {
      swallow = e.pointerId;
      return;
    }
  }
  endPress();
  press = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.cam.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    drag = null;
    return;
  }
  drag = {
    id: e.pointerId,
    x: e.offsetX,
    y: e.offsetY,
    cx: view.cam.x,
    cy: view.cam.y,
    button,
    type: e.pointerType,
    shift: e.shiftKey,
    moved: false,
  };
  if (e.pointerType !== 'mouse') {
    const x = e.offsetX;
    const y = e.offsetY;
    const p = { id: e.pointerId, fired: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      if (press !== p || !drag || drag.moved || pointers.size !== 1) return;
      p.fired = true;
      orderAt(x, y, true);
    }, 520);
    press = p;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const target = (pinch.z * d) / pinch.d;
    view.zoomAt(mx, my, target / view.cam.zoom);
    // dwa palce przesuwają też mapę
    view.cam.x -= (mx - pinch.mx) / view.cam.zoom;
    view.cam.y -= (my - pinch.my) / view.cam.zoom;
    view.clampCam();
    pinch.mx = mx;
    pinch.my = my;
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.offsetX - drag.x;
  const dy = e.offsetY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) {
    drag.moved = true;
    endPress();
  }
  if (!drag.moved) return;
  // przeciąganie przesuwa mapę (jak podpowiedź), ramka tylko z Shiftem
  const boxSelect = drag.type === 'mouse' && drag.button === 0 && drag.shift;
  if (boxSelect) {
    box.hidden = false;
    Object.assign(box.style, {
      left: `${Math.min(drag.x, e.offsetX)}px`,
      top: `${Math.min(drag.y, e.offsetY)}px`,
      width: `${Math.abs(dx)}px`,
      height: `${Math.abs(dy)}px`,
    });
  } else {
    view.cam.x = drag.cx - dx / view.cam.zoom;
    view.cam.y = drag.cy - dy / view.cam.zoom;
    view.clampCam();
  }
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  fingers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  const held = press?.id === e.pointerId && press.fired;
  if (press?.id === e.pointerId) {
    endPress();
    press = null;
  }
  if (swallow === e.pointerId || held || !drag || drag.id !== e.pointerId || !sim) {
    if (swallow === e.pointerId) swallow = -1;
    drag = null;
    return;
  }
  const d = drag;
  drag = null;
  box.hidden = true;
  if (e.type === 'pointercancel') return;
  if (d.moved) {
    if (d.type === 'mouse' && d.button === 0 && d.shift) {
      // ramka z Shiftem: zaznacza ludzi z rdzenia
      const [x0, y0] = view.toWorld(Math.min(d.x, e.offsetX), Math.min(d.y, e.offsetY));
      const [x1, y1] = view.toWorld(Math.max(d.x, e.offsetX), Math.max(d.y, e.offsetY));
      if (!e.shiftKey) selected.clear();
      for (const p of sim.st.pawns)
        if (p.kind === 'core' && p.x * TILE >= x0 && p.x * TILE <= x1 && p.y * TILE >= y0 && p.y * TILE <= y1)
          selected.add(p.id);
      selectedChanged();
    }
    return;
  }
  const hit = view.pick(sim.st, e.offsetX, e.offsetY);
  if (placing && placeClick(e.offsetX, e.offsetY, d.button, d.type, e.shiftKey)) return;
  if (d.button === 2) {
    orderAt(e.offsetX, e.offsetY, true);
    return;
  }
  if (hit) {
    if (!e.shiftKey) selected.clear();
    selected.add(hit.id);
    selectedChanged();
    return;
  }
  // mieszkaniec z osobą: karta do odczytu, bez zmiany zaznaczenia i bez poleceń (zarząd miał pierwszeństwo wyżej)
  const lok = view.pickResident(sim.st, e.offsetX, e.offsetY);
  if (lok) {
    residentFocus = lok.id;
    aptFocus = -1;
    return;
  }
  residentFocus = -1;
  if (d.type !== 'mouse') {
    if (selected.size) orderAt(e.offsetX, e.offsetY, false);
    else aptFocus = aptAt(sim.w, view.tileAt(e.offsetX, e.offsetY));
    return;
  }
  if (d.button === 0) {
    selected.clear();
    aptFocus = aptAt(sim.w, view.tileAt(e.offsetX, e.offsetY));
  }
};
stage.addEventListener('pointerup', endPointer);
// tryb stawiania: plan idzie za kursorem myszy (dotyk stawia stuknięciem)
stage.addEventListener('pointermove', (e) => {
  if (placing && e.pointerType === 'mouse') aimAt(e.offsetX, e.offsetY);
});
stage.addEventListener('pointercancel', endPointer);
/** chwila ostatniego zdarzenia wheel z gładzika (rozpoznanie w src/ui/sterowanie.ts) */
let lastPan = -1e9;
stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    fly = null;
    ctx.close();
    const now = performance.now();
    const kind = wheelKind(e, now, lastPan);
    if (kind === 'pan') {
      // dwa palce na gładziku przesuwają mapę jak w mapach
      lastPan = now;
      const k = e.deltaMode === 1 ? 40 : 1;
      view.cam.x += (e.deltaX * k) / view.cam.zoom;
      view.cam.y += (e.deltaY * k) / view.cam.zoom;
      view.clampCam();
      return;
    }
    // szczypanie (wheel z ctrlKey w Chrome i Firefoksie) albo kółko myszy przybliżają
    view.zoomAt(e.offsetX, e.offsetY, zoomFactor(kind, e));
  },
  { passive: false },
);
// Safari na macOS: szczypanie to gesturestart, gesturechange i gestureend z polem scale (bez preventDefault
// przybliżałaby się cała strona). iPhone i iPad wysyłają te gesty razem z dotykiem, a dwa palce przybliżają już
// w pointermove, więc przy palcach na mapie gest tylko blokuje stronę.
let gesture: { z: number } | null = null;
const gestureAt = (e: Event): [number, number] => {
  const g = e as Event & { clientX?: number; clientY?: number };
  const r = stage.getBoundingClientRect();
  return g.clientX === undefined || g.clientY === undefined
    ? [view.width / 2, view.height / 2]
    : [g.clientX - r.left, g.clientY - r.top];
};
stage.addEventListener('gesturestart', (e) => {
  e.preventDefault();
  fly = null;
  ctx.close();
  gesture = { z: view.cam.zoom };
});
stage.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  if (fingers.size) return;
  const scale = (e as Event & { scale?: number }).scale;
  if (!scale) return;
  gesture ??= { z: view.cam.zoom };
  const [x, y] = gestureAt(e);
  view.zoomAt(x, y, (gesture.z * scale) / view.cam.zoom);
});
stage.addEventListener('gestureend', (e) => {
  e.preventDefault();
  gesture = null;
});
// poza mapą (pasek, okna) szczypanie w Safari też nie przybliża całej strony gry
for (const t of ['gesturestart', 'gesturechange'])
  document.addEventListener(t, (e) => {
    if (!$('app').hidden) e.preventDefault();
  });
window.addEventListener('keydown', (e) => {
  // klawisze gry tylko w grze, bez otwartego okna i nie na polach ani przyciskach (spacja ma działać na przyciskach)
  const tag = (e.target as HTMLElement).tagName;
  if (!sim || $('app').hidden || modal.open || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (ctx.open) return;
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    speed = speed ? 0 : 1;
    hold = null;
    dayPace = null;
    raidHold = null;
    renderSpeed();
  }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
    speed = Number(e.code.slice(-1));
    hold = null;
    dayPace = null;
    raidHold = null;
    renderSpeed();
  }
  if (e.code === 'KeyB') openBuild();
  if (e.code === 'KeyR' && placing) rotatePlacing();
  if (e.code === 'Escape') {
    if (placing) cancelPlacing();
    else {
      selected.clear();
      aptFocus = -1;
      residentFocus = -1;
    }
  }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') view.zoomAt(view.width / 2, view.height / 2, 1.25);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.zoomAt(view.width / 2, view.height / 2, 0.8);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// wysokość górnego paska i listy celów dla przycisków mapy i podpowiedzi (pasek zawija się na telefonie)
const bars = new ResizeObserver(() => {
  const root = document.documentElement.style;
  root.setProperty('--top-h', `${Math.round($('top').getBoundingClientRect().height)}px`);
  root.setProperty('--goals-h', `${$('goals').hidden ? 0 : Math.round($('goals').getBoundingClientRect().height)}px`);
  root.setProperty('--card-h', `${$('card').hidden ? 0 : Math.round($('card').getBoundingClientRect().height)}px`);
  // pasek trybu stawiania: na telefonie podpowiedź (np. czemu tu nie wolno) idzie nad niego, a nie pod spód
  const place = $('placeBar');
  root.setProperty('--place-lift', `${place.hidden ? 0 : Math.round(place.getBoundingClientRect().height) + 20}px`);
});
bars.observe($('top'));
bars.observe($('goals'));
bars.observe($('card'));
bars.observe($('placeBar'));

/* ---------- start ---------- */
(async () => {
  window.zm = {
    ready: false,
    sim: null,
    gov: null,
    view,
    fps: () => fps,
    setCam: (x, y, zoom) => {
      fly = null;
      Object.assign(view.cam, { x: x * TILE, y: y * TILE, zoom });
    },
    chunksPending: () => view.pendingFar,
    idle: () => view.complete && view.pendingFar === 0,
    govTick: () => {
      screen = Math.max(screen, govAt + 1);
      govAt = screen;
      return govStep(true)?.k ?? null;
    },
    ff: (minutes, mult = 1) => {
      if (!sim || !gov || modal.open) return modal.tone;
      const ticks = Math.round((minutes / 60) * TICKS_PER_HOUR);
      const perSecond = Math.max(1, Math.round(TICKS_PER_SECOND * mult));
      let p: Prompt | null = null;
      for (let k = 1; k <= ticks && !p && !gov.over; k++) {
        view.beforeStep(sim.st);
        sim.step();
        if (k % perSecond === 0) {
          screen += 1;
          govAt = screen;
          p = govStep(false);
        }
      }
      drawState();
      hudT = performance.now();
      hud(hudT);
      if (gov.over) showEnd();
      else if (p) showPrompt(p);
      return p?.k ?? null;
    },
    screenOf,
    save,
    screen: () => screen,
    speed: () => speed,
    fly: (x, y, zoom, ms) => flyTo(x * TILE, y * TILE, zoom, ms),
    placing: () =>
      placing
        ? {
            kind: placing.kind,
            x: placing.x,
            y: placing.y,
            rot: placing.rot,
            ok: placing.ok,
            why: placing.why,
            allowed: placing.allowed.length,
            first: placing.allowed[0] ?? -1,
          }
        : null,
    apts: () => sim?.st.apts ?? [],
    admit: (n) => (sim ? addResidents(sim.st, sim.w, n, true) : 0),
  };
  // ?worker=0: kawałki mapy rysuje główny wątek (zapas dla przeglądarek bez OffscreenCanvas w workerze)
  await view.init($('stage'), { workers: params.get('worker') !== '0' });
  view.app.ticker.add((t) => frame(performance.now(), t.deltaMS));
  const demo = params.get('demo');
  if (demo) await start(() => loadDemo(demo));
  window.zm.ready = true;
})();
