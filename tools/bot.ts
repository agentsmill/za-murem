/* Bot nowej symulacji: gra bez przeglądarki przez 45 dni i wypisuje dzienne liczby, potem scenariusz
   „pierwsze trzy minuty”: polecenie ścięcia suchego drzewa i czasy kolejnych kroków aż do ciepłej kuchni,
   a dalej trzy doby zarządu bez poleceń. Gospodarka z 0.3 wejdzie w M3; jej wzorzec liczy npm run bot:v03.
   Dopóki świat z OSM nie ma wnętrza siedziby (gałąź wnętrza), scenariusz biegnie na sztucznych światach
   z atrapą wnętrza z testów; kiedy wnętrze jest, bierze prawdziwą siedzibę. Po samouczku kronika pierwszego
   wieczoru: gotowanie, kolacja, koniec opału i decyzja bota (spala meblościankę), sen; potem trzy doby.
   Na koniec gra z zarządem (src/gov) dwiema politykami karty nocy, zawsze warta i nigdy warty: decyzje na minutę
   przy ekranie w pierwszych 10 minutach (okna zarządu, zmiany na karcie, polecenia, których wymaga gra) i skutki
   napadów, a potem noce z dyżurem przy kozie i bez niego (temperatura w kuchni o 6:00, jak długo pali się koza)
   i trzy doby z uchwałami o jedzeniu (racje, wspólny kocioł) i bez nich: zapasy, najedzenie, nastrój, gotowanie.
   Fala 1 M2: dni 2–5 z przeszukiwaniem pustych mieszkań, rozbiórką, naprawami i budową, a dla porównania bez
   przeszukiwania; ile budowli stoi do końca dnia 2 i 3 i ile decyzji na minutę daje dzień 2 i 3.
   Tłum za siatką jest już tylko do pomiaru wydajności (npm run perf), w grze są mieszkańcy siedziby.
   Z flagą --mieszkancy (gdziekolwiek wśród argumentów) cały bot gra na świecie z mieszkańcami siedziby z generatora
   (tools/bot-mieszkancy.ts, jak w grze): zarząd i lokatorzy z osobami z generatora, stany mieszkań siedziby z niego;
   po linijce „Rdzeń” pojawia się jedna o mieszkańcach z adresu. Bez flagi wyjście i skróty bez zmian.
   Z flagą --sasiedzi na końcu dochodzi fala 2 M2: gracz fali 1, a od dnia 2 jedna osoba u sąsiadów (otwiera najbliższy
   budynek, przeszukuje pomieszczenia i piętra, nosi łup, rozmawia z lokatorami); liczy, ile u nich zrobiła, spotkania,
   rany i ugryzienia, zapasy po 5 dniach i głód. Bez flagi wyjście i skróty bez zmian.
   Z flagą --miasto na końcu dochodzi mapa miasta: gracz fali 1, a od dnia 2 za dnia (7–17) dwie najzdrowsze osoby idą do najbliższego
   niewyczerpanego miejsca z okolicy poza mapą lokalną (tests/unit/miasto-play.ts: brak jedzenia to sklep spożywczy, brak
   drewna stacja, co trzeci dzień szkoła; jedna wyprawa naraz); liczy wyprawy, łup, rannych, ugryzionych, najdalszą
   wyprawę po dniach i zapasy po 10 dniach obok gry bez wypraw. Bez flagi wyjście i skróty bez zmian.
   Z flagą --zwyciestwo na końcu dochodzą warunki zwycięstwa (docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md):
   gracz fali 1 z drogami włączonymi w zarządzie (`wlaczZwyciestwo`) przez 30 dni na ziarnach zarządu; drukuje po dniach
   ludność, cel drogi ludnościowej i zaliczone kamienie każdej drogi (pierwsze ziarno dzień po dniu, potem podsumowanie
   wszystkich) i sprawdza, że kamienie nie maleją, każdy ma jeden wpis w kronice, licznik celu nie przekracza 7 dni, a ta sama
   droga nie wygrywa dwa razy. Cel ludności liczy się jak w grze: z ludności kwadratu domu z 2021 roku z tabel mieszkańców
   (`ludnoscDema` w tools/bot-mieszkancy.ts, jak `ludnoscSpisu2021` w main.ts), a bez tabel to 250, co nagłówek sekcji
   mówi wprost. Bez flagi wyjście i skróty bez zmian.
   Z flagą --badania bot robi tylko pomiar tempa badań (tools/bot-badania.ts) zamiast reszty: gra z zarządem przez pierwszą
   zimę na ziarnach 1–5 (albo jednym podanym jako pierwszy argument; drugi argument to liczba dni, domyślnie 21), z polityką
   badań gracza i bez niej, i wypisuje dzień każdej technologii, liczbę technologii w dniu 11 i 16, zgony, jedzenie,
   drewno i temperatury zimy. Wolno jej dołożyć --mieszkancy (wzorzec tempa), --demo=NAZWA (przymorze, lanciego,
   zielonki), --sasiedzi (wyprawy do sąsiadów) i --jedzenie (jedzenie z niczego, bez głodu zimy). Bez flagi wyjście i skróty
   bez zmian.
   Uruchomienie: npm run bot [-- ziarno [dni [tłum]]] [--mieszkancy] [--sasiedzi] [--miasto] [--zwyciestwo]
                 npm run bot -- --badania [ziarno [dni]] [--mieszkancy] [--demo=NAZWA] [--sasiedzi] [--jedzenie] */

import fs from 'node:fs';
import path from 'node:path';
import { nextRandom } from '../src/core/rng.ts';
import { celLudnosci, DROGI, type Droga, ocenDrogi } from '../src/gov/zwyciestwo.ts';
import { BUILDS, type Mat } from '../src/sim/budowle.ts';
import { clockOf, dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { dryTreeOf, houseOf, inHomeApt } from '../src/sim/house.ts';
import { MAT_ACC } from '../src/sim/mieszkania.ts';
import { HUNGRY } from '../src/sim/needs.ts';
import { commandFor, commandsAt, jobText } from '../src/sim/orders.ts';
import { BURNABLE, createSim, FOOD_START, type Laws, REST_UNTIL, Sim, type SimOpts, woodFrom } from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { TUT_STEPS, type TutStep } from '../src/sim/tutorial.ts';
import { naMapieLokalnej } from '../src/world/miasto.ts';
import { buildWorld, type World } from '../src/world/world.ts';
import {
  type Decision,
  type Hunger,
  type NightLog,
  type Policy,
  playLaws,
  playWithGov,
} from '../tests/unit/gov-play.ts';
import { mockBlock, mockHouse } from '../tests/unit/interior-mock.ts';
import { type M2Log, m2Player } from '../tests/unit/m2-play.ts';
import { miastoPlayer, okolicaZGeo } from '../tests/unit/miasto-play.ts';
import { type SasiedziLog, sasiedziPlayer } from '../tests/unit/sasiedzi-play.ts';
import { pomiarBadan } from './bot-badania.ts';
import {
  ARGUMENTY,
  BADANIA,
  bezBadan,
  bezMiasta,
  bezZwyciestwa,
  ludnoscDema,
  MIASTO,
  MIESZKANCY,
  opisMieszkancow,
  SASIEDZI,
  swiatMieszkancow,
  tylkoZombie,
  ZWYCIESTWO,
} from './bot-mieszkancy.ts';

tylkoZombie('bot', BADANIA);
bezBadan('bot', true);
// --badania: sam pomiar tempa badań, bez reszty bota (pierwszy argument to ziarno, drugi liczba dni); --miasto
// i --zwyciestwo należą do reszty bota, więc razem z pomiarem kończą się błędem zamiast cicho przepaść
if (BADANIA) {
  bezMiasta('bot -- --badania');
  bezZwyciestwa('bot -- --badania');
  const ziarno = Number(ARGUMENTY[0]);
  await pomiarBadan(ziarno ? [ziarno] : [1, 2, 3, 4, 5], Number(ARGUMENTY[1]) || 21);
  process.exit(0);
}
const SEED = Number(ARGUMENTY[0]) || 1;
const DAYS = Number(ARGUMENTY[1]) || 45;
const CROWD = Number(ARGUMENTY[2]) || 0;

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../public/demo/przymorze.json'), 'utf8'));
const t0 = performance.now();
// z flagą --mieszkancy świat i opcja `mieszkancy` dla createSim z generatora mieszkańców (tools/bot-mieszkancy.ts)
const osiedle = MIESZKANCY ? await swiatMieszkancow(demo, SEED, 4) : null;
const world = osiedle ? osiedle.world : buildWorld(demo.geo, { seed: SEED, street: demo.street });
/** opcje createSim z mieszkańcami z adresu dla świata `w` (tylko dla świata z generatora; bez flagi puste) */
const zAdresu = (w: World): Pick<SimOpts, 'mieszkancy'> =>
  osiedle && w === osiedle.world ? { mieszkancy: osiedle.mieszkancy } : {};
const sim = new Sim(world, createSim(world, SEED, { core: 4, crowd: CROWD, ...zAdresu(world) }));
console.log(
  `Bot 0.4, ${demo.name}: ${world.buildings.length} budynków, ${world.trees.length} drzew, świat w ${Math.round(performance.now() - t0)} ms`,
);
// zarząd to osoby pionków rdzenia (z generatora w state.people są też mieszkańcy)
const rdzen = sim.st.pawns.filter((p) => p.kind === 'core').map((p) => sim.st.people[p.person]);
console.log(
  `Rdzeń: ${rdzen.map((p) => `${p.name} (${p.prof.toLowerCase()})`).join(', ')}; mieszkańców ${sim.st.pawns.filter((p) => p.kind === 'resident').length}, tłum: ${CROWD}`,
);
if (osiedle) console.log(opisMieszkancow(sim.st));
console.log(' dzień  ścieżki  nieudane  zamienione  węzłów/ścieżkę  ms/dzień  idzie');

// polecenia bota: co dwie godziny gry losowy cel dla losowej osoby z rdzenia (z ziarnem bota)
const brng = { s: SEED * 7919 };
const size = world.size;
let lastP = 0;
let lastF = 0;
let lastN = 0;
let lastS = 0;
for (let d = 1; d <= DAYS; d++) {
  const start = performance.now();
  const end = d * TICKS_PER_DAY;
  while (sim.st.tick < end) {
    if (sim.st.tick % 1600 === 0) {
      const core = sim.st.pawns.filter((p) => p.kind === 'core');
      const who = core[Math.floor(nextRandom(brng) * core.length)];
      const to = Math.floor(nextRandom(brng) * size) * size + Math.floor(nextRandom(brng) * size);
      sim.push({ t: 'move', ids: [who.id], to });
    }
    sim.step();
  }
  const s = sim.stats;
  const n = s.paths - lastP;
  const moving = sim.st.pawns.filter((p) => p.pi < p.path.length).length;
  console.log(
    `${String(dayOf(sim.st.tick) - 1).padStart(6)} ${String(n).padStart(8)} ${String(s.failed - lastF).padStart(9)} ${String(s.substituted - lastS).padStart(11)} ${String(Math.round((s.nodes - lastN) / Math.max(1, n))).padStart(15)} ${String(Math.round(performance.now() - start)).padStart(9)} ${String(moving).padStart(6)}`,
  );
  lastP = s.paths;
  lastF = s.failed;
  lastN = s.nodes;
  lastS = s.substituted;
}
console.log(`Koniec: dzień ${dayOf(sim.st.tick)} ${clockOf(sim.st.tick)}, skrót stanu ${sim.hash()}`);

/* ---------- scenariusz „pierwsze trzy minuty” ---------- */

const STEP_TEXT: Record<TutStep, string> = {
  zaznacz: 'zaznaczenie kogoś z zarządu',
  rozkaz: 'polecenie „ścinaj suche drzewo”',
  sciete: 'suche drzewo ścięte',
  sklad: 'drewno w składzie',
  koza: 'koza się pali',
  cieplo: 'kuchnia ma 18°C',
};
/** limit: pięć minut realnych przy 1× */
const LIMIT = 5 * 60 * TICKS_PER_SECOND;

function firstMinutes(name: string, w: World): boolean {
  const s = new Sim(w, createSim(w, SEED, { core: 4, crowd: 8, ...zAdresu(w) }));
  const st = s.st;
  const h = houseOf(w)!;
  const dry = dryTreeOf(w);
  const tree = w.trees[dry];
  const koza = st.things.find((t) => t.kind === 'koza');
  const kitchen = koza ? h.room[koza.y * w.size + koza.x] : -1;
  const [who] = st.pawns.filter((p) => p.kind === 'core');
  console.log(
    `\nPierwsze trzy minuty, ${name}: suche drzewo z koroną ${tree.r} m (drewna ${woodFrom(tree)}), na zewnątrz ${s.outdoor()}°C, w kuchni ${kitchen >= 0 ? st.temps[kitchen] : '?'}°C`,
  );
  s.push({ t: 'select', ids: [who.id] });
  const cmd = commandFor(st, w, [who.id], Math.floor(tree.y) * w.size + Math.floor(tree.x));
  if (cmd?.t !== 'chop') {
    console.log(`  kliknięcie w suche drzewo nie dało polecenia ścięcia, tylko ${cmd?.t}`);
    return false;
  }
  s.push(cmd);
  let walked = 0;
  while (st.tut.step < TUT_STEPS.length && st.tick < LIMIT) {
    if (who.job?.t === 'chop' && who.job.phase === 0 && who.pi < who.path.length) walked = who.path.length;
    s.step();
  }
  for (let k = 0; k < TUT_STEPS.length; k++) {
    const at = st.tut.at[k];
    console.log(
      `  ${STEP_TEXT[TUT_STEPS[k]].padEnd(34)} ${at < 0 ? '      —' : `${(at / TICKS_PER_SECOND).toFixed(1).padStart(6)} s`}  ${at < 0 ? '' : clockOf(at)}`,
    );
  }
  const ok = st.tut.step === TUT_STEPS.length;
  console.log(
    `  ${ok ? 'Łańcuch zamknięty' : 'Łańcuch NIE zamknięty'} po ${(st.tick / TICKS_PER_SECOND).toFixed(0)} s przy 1×; do drzewa ${walked} m drogi; ${st.pawns
      .filter((p) => p.kind === 'core')
      .map((p) => `${st.people[p.person].first}: ${jobText(st, w, p).toLowerCase().replace(/\.$/, '')}`)
      .join(', ')}`,
  );
  if (!ok) return false;
  const core = st.pawns.filter((p) => p.kind === 'core');
  const first = (p: (typeof core)[number]) => st.people[p.person].first;
  // wieczór pierwszego dnia: kronika zdarzeń; gdy skończy się opał, bot jako gracz pali meblościankę
  console.log('  Kronika do północy (bez poleceń poza jedną decyzją bota, gdy skończy się opał):');
  const note = (t: string) => console.log(`    ${clockOf(st.tick)}  ${t}`);
  const seen = new Set<string>();
  const once = (key: string, cond: boolean, text: () => string) => {
    if (!cond || seen.has(key)) return;
    seen.add(key);
    note(text());
  };
  const rows: string[] = [];
  let lo = 99;
  let hi = -99;
  let fire = 0;
  const row = (d: number) => {
    const snap = snapshot(st, w);
    const avg = (k: 'food' | 'warm' | 'rest' | 'health' | 'safe' | 'mood', width: number) =>
      String(Math.round(snap.people.reduce((a, p) => a + p.needs[k], 0) / snap.people.length)).padStart(width);
    const temps = `${lo.toFixed(1)}–${hi.toFixed(1)}`;
    rows.push(
      `  ${String(d).padStart(5)}  ${temps.padStart(10)}  ${(fire / TICKS_PER_HOUR).toFixed(1).padStart(4)} h  ${String(snap.stock.supplies).padStart(6)}  ${String(snap.stock.meals).padStart(7)}  ${String(snap.stock.gasCooks).padStart(3)}  ${String(snap.stock.wood).padStart(6)}  ${avg('food', 7)}  ${avg('warm', 6)}  ${avg('rest', 4)}  ${avg('health', 7)}  ${avg('safe', 5)}  ${avg('mood', 7)}`,
    );
    lo = 99;
    hi = -99;
    fire = 0;
  };
  const track = () => {
    if (st.tick % 20 || kitchen < 0) return;
    lo = Math.min(lo, st.temps[kitchen]);
    hi = Math.max(hi, st.temps[kitchen]);
    if ((st.things.find((t) => t.kind === 'koza')?.fuel ?? 0) > 0) fire += 20;
  };
  for (; dayOf(st.tick) === 1; s.step()) {
    track();
    const cook = core.find((p) => p.job?.t === 'cook' && p.job.phase === 1);
    once('cook', !!cook, () => `${first(cook!)}: ${jobText(st, w, cook!).toLowerCase()}`);
    once(
      'meal',
      st.things.some((t) => t.kind === 'posilek'),
      () => `w garnku na stole ${st.things.find((t) => t.kind === 'posilek')!.n} porcje`,
    );
    once(
      'eat',
      core.some((p) => p.job?.t === 'eat' && p.job.phase === 1),
      () => 'kolacja przy stole',
    );
    const kz = st.things.find((t) => t.kind === 'koza');
    const woodLeft = st.things.some((t) => t.kind === 'drewno') || core.some((p) => p.carry > 0);
    if (kz && kz.fuel === 0 && !woodLeft && !seen.has('out')) {
      seen.add('out');
      note(`opał się skończył, koza gaśnie; w kuchni ${st.temps[kitchen].toFixed(1)}°C, na dworze ${s.outdoor()}°C`);
      const mine = (t: (typeof st.things)[number]) => inHomeApt(h, t.y * w.size + t.x);
      const shelf =
        st.things.find((t) => t.kind === 'mebloscianka' && mine(t)) ??
        st.things.find((t) => BURNABLE[t.kind] && mine(t));
      const burn = shelf && commandsAt(st, w, [who.id], shelf.y * w.size + shelf.x).find((m) => m.cmd.t === 'burn');
      if (burn) {
        s.push(burn.cmd);
        note(`decyzja bota: ${burn.label.toLowerCase()} (${first(who)}; w menu z potwierdzeniem)`);
      }
    }
    once(
      'burned',
      st.burned.length > 0,
      () =>
        `spalone, nastroje: ${core.map((p) => `${first(p)} ${p.moods.map((m) => `${m.why} ${m.d}`).join(', ')}`).join('; ')}`,
    );
    once(
      'relit',
      seen.has('burned') && (kz?.fuel ?? 0) > 0,
      () => `koza znowu się pali (${((kz?.fuel ?? 0) / TICKS_PER_HOUR).toFixed(1)} h ognia)`,
    );
    once(
      'sleep',
      core.every((p) => p.job?.t === 'sleep' && p.job.phase === 1),
      () =>
        `wszyscy śpią; bezpieczeństwo średnio ${Math.round(core.reduce((a, p) => a + p.needs!.safe, 0) / core.length)}`,
    );
  }
  row(1);
  for (let d = 2; d <= 3; d++) {
    for (; dayOf(st.tick) === d; s.step()) track();
    row(d);
  }
  console.log('  Doby (kuchnia i ogień w ciągu doby, zapasy i średnie potrzeby zarządu o północy):');
  console.log(
    '  dzień  kuchnia °C   ogień  zapasy  posiłki  gaz  drewno  najedz.  ciepło  siły  zdrowie  bezp.  nastrój',
  );
  for (const r of rows) console.log(r);
  console.log(`  skrót stanu po 3 dobach ${s.hash()}`);
  return true;
}

const real = houseOf(world) && dryTreeOf(world) >= 0;
const worlds: [string, World][] = real
  ? [[`${demo.name} (prawdziwe wnętrze)`, world]]
  : [
      ['sztuczny blok z atrapą wnętrza', mockBlock(SEED)],
      ['sztuczny dom z atrapą wnętrza', mockHouse(SEED)],
    ];
let fail = false;
for (const [name, w] of worlds) if (!firstMinutes(name, w)) fail = true;

/* ---------- gra z zarządem: decyzje na minutę i napady ---------- */

const GOV_SEEDS = [1, 2, 3, 4, 5].map((k) => SEED * 10 + k);
const GOV_DAYS = 6;
const [govName, govWorld] = worlds[0];
console.log(
  `\nGra z zarządem, ${govName}: ${GOV_SEEDS.length} ziaren × ${GOV_DAYS} dni, zarząd co sekundę przy ekranie (1×)`,
);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (v: number) => v.toFixed(1);
for (const policy of ['zawsze-warta', 'nigdy-warty'] as Policy[]) {
  const t1 = performance.now();
  const runs = GOV_SEEDS.map((seed) => playWithGov(govWorld, seed, policy, GOV_DAYS, 4, zAdresu(govWorld)));
  const first = (r: { decisions: Decision[] }) => r.decisions.filter((d) => d.s < 600);
  const perMin = runs.map((r) => first(r).length / 10);
  const kinds = (k: (d: Decision) => boolean) => mean(runs.map((r) => first(r).filter(k).length));
  const nights: NightLog[] = runs.flatMap((r) => r.nights);
  const raided = nights.filter((n) => n.raid);
  const entered = raided.filter((n) => n.raid!.outcome === 'wtargnięcie');
  const repelled = raided.filter((n) => n.raid!.outcome === 'odparty');
  const quiet = nights.filter((n) => !n.raid);
  // zgodność: wynik i łup jak w raporcie, tylu szabrowników, ilu wynika z siły, uśpiona warta przysypia na ekranie
  const mismatch = nights.filter(
    (n) =>
      (n.report === 'brak') !== !n.raid ||
      (n.raid && n.report !== n.raid.outcome) ||
      (n.report === 'wtargnięcie' && JSON.stringify(n.raid!.took) !== JSON.stringify(n.stolen)) ||
      (n.raid && n.result && n.raid.n !== n.result.people) ||
      (n.result && n.result.dozing !== n.result.slept),
  ).length;
  const slept = nights.reduce((a, n) => a + (n.result?.slept ?? 0), 0);
  console.log(`  ${policy} (${Math.round(performance.now() - t1)} ms):`);
  console.log(
    `    decyzje na minutę w pierwszych 10 min: średnio ${f1(mean(perMin))} (od ${f1(Math.min(...perMin))} do ${f1(Math.max(...perMin))}); w tym okna zarządu ${f1(kinds((d) => d.kind !== 'polecenie' && d.kind !== 'przydział'))}, zmiany na karcie ${f1(kinds((d) => d.kind === 'przydział'))}, polecenia w grze ${f1(kinds((d) => d.kind === 'polecenie'))} (na 10 min)`,
  );
  console.log(
    `    noce ${nights.length}, napady ${raided.length}: odparte ${repelled.length}, wtargnięcia ${entered.length}; szabrowników średnio ${f1(mean(raided.map((n) => n.raid!.n)))}`,
  );
  if (entered.length)
    console.log(
      `    na wtargnięcie wynieśli średnio drewna ${f1(mean(entered.map((n) => n.raid!.took.wood)))}, jedzenia ${f1(mean(entered.map((n) => n.raid!.took.supplies)))}, złomu ${f1(mean(entered.map((n) => n.raid!.took.scrap)))}`,
    );
  const safe = (list: NightLog[]) =>
    list.length
      ? `zarząd ${Math.round(mean(list.map((n) => n.safeCore)))}, mieszkańcy ${Math.round(mean(list.map((n) => n.safeRes)))}`
      : '—';
  console.log(
    `    bezpieczeństwo rano o 7:00: po wtargnięciu ${safe(entered)}; po odparciu ${safe(repelled)}; po spokojnej nocy ${safe(quiet)}`,
  );
  console.log(
    `    raport zarządu a to, co odegrała symulacja (wynik, łup, liczba szabrowników, ${slept} uśpionych wartowników): ${mismatch ? `${mismatch} niezgodnych nocy` : 'zgodne w każdej nocy'}`,
  );
  if (mismatch) fail = true;
  // przyjęcia: każdy przyjęty przez zarząd przybywa jako pionek (bez miejsca śpi na podłodze)
  const asked = runs.reduce((a, r) => a + r.admitted.asked, 0);
  const added = runs.reduce((a, r) => a + r.admitted.added, 0);
  console.log(
    `    przyjęcia: zarząd przyjął ${asked} osób, przybyło ${added} pionków mieszkańców${asked === added ? ' (zgodne)' : ''}; mieszkańców na koniec średnio ${f1(mean(runs.map((r) => r.st.pawns.filter((p) => p.kind === 'resident').length)))} przy miejscach ${f1(mean(runs.map((r) => r.st.cap)))}`,
  );
  if (asked !== added) {
    console.log('    BŁĄD: przyjętych przez zarząd i nowych pionków jest różnie');
    fail = true;
  }
  // głód zarządu: poranki, w których jedzenia brakło dla głodnych, i czas z najedzeniem poniżej 10
  const hun = (k: keyof Hunger) => runs.reduce((a, r) => a + r.hunger[k], 0);
  console.log(
    `    jedzenie zarządu (bez przeszukiwania, tylko wydarzenia): rano brakło dla głodnych w ${hun('short')} z ${hun('mornings')} poranków, ktoś głodny (najedzenie < 10) przez ${Math.round((100 * hun('starving')) / Math.max(1, hun('samples')))}% czasu`,
  );
  // wartownik po nocy: głodny najpierw je, potem odsypia; liczą się poranki, w których jedzenia starczało dla
  // wszystkich głodnych w zarządzie (przy niedoborze zjadają inni, to sprawa gospodarki, nie wartownika)
  const morns = runs.flatMap((r) => r.mornings);
  const fed = morns.filter((m) => m.food6 < HUNGRY && m.stock6 >= m.hungry6);
  const ateAt = fed.filter((m) => m.ateAt >= 0).map((m) => m.ateAt);
  // zjadł przed 8:00 albo nie głodował (najedzenie co najmniej 15, czekał na ciepły posiłek)
  const late = fed.filter((m) => (m.ateAt < 0 || m.ateAt >= 8) && m.minFood < 15).length;
  const tiredFed = fed.filter((m) => m.rest6 < REST_UNTIL);
  const napped = tiredFed.filter((m) => m.napped).length;
  const hhmm = (v: number) => {
    const m = Math.round(v * 60);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  };
  console.log(
    `    wartownicy rano (6–14): ${morns.length} poranków, głodnych przy jedzeniu dla wszystkich ${fed.length}: zjedli przed 8:00 ${fed.filter((m) => m.ateAt >= 0 && m.ateAt < 8).length}, później bez głodowania ${fed.filter((m) => !(m.ateAt >= 0 && m.ateAt < 8) && m.minFood >= 15).length}, głodowali ${late} (pierwszy posiłek średnio o ${ateAt.length ? hhmm(mean(ateAt)) : '—'}), zmęczeni po posiłku odsypiali ${napped} z ${tiredFed.length}; przy niedoborze ${morns.filter((m) => m.food6 < HUNGRY && m.stock6 < m.hungry6).length}`,
  );
  if (late || napped < tiredFed.length) {
    console.log('    BŁĄD: głodny wartownik ma rano najpierw zjeść, a potem odsypiać');
    fail = true;
  }
  const r0 = runs[0];
  console.log(`    pierwsze 10 min, ziarno ${GOV_SEEDS[0]}:`);
  for (const d of first(r0)) console.log(`      ${f1(d.s).padStart(6)} s  ${d.kind.padEnd(10)} ${d.text.slice(0, 90)}`);
}

/* ---------- noc przy kozie: dyżur z menu kozy (w karcie przyszły klucz 'warta:koza') i bez niego ---------- */

const KOZA_DAYS = 3;
console.log(
  `\nNoc przy kozie, ${govName}: ${GOV_SEEDS.length} ziaren × ${KOZA_DAYS} noce, zawsze warta, wieczorem 16 sztuk drewna w zapasie`,
);
const kozaRuns = (koza: boolean) =>
  GOV_SEEDS.flatMap(
    (seed) =>
      playWithGov(govWorld, seed, 'zawsze-warta', KOZA_DAYS, 4, { koza, evening: 16, ...zAdresu(govWorld) }).nights,
  );
const withDuty = kozaRuns(true);
const without = kozaRuns(false);
const k6 = (list: NightLog[]) => list.map((n) => n.kitchen6 ?? 0);
for (const [name, list] of [
  ['z dyżurem przy kozie', withDuty],
  ['bez dyżuru', without],
] as const)
  console.log(
    `  ${name.padEnd(21)} kuchnia o 6:00 średnio ${f1(mean(k6(list)))}°C (od ${f1(Math.min(...k6(list)))} do ${f1(Math.max(...k6(list)))}), koza paliła się przez ${Math.round(100 * mean(list.map((n) => n.fire)))}% nocy 22–6`,
  );
const warm = mean(k6(withDuty));
const cold = mean(k6(without));
if (warm < 18 || cold > warm - 3) {
  console.log('  BŁĄD: z dyżurem rano nie jest wyraźnie cieplej niż bez niego');
  fail = true;
}

/* ---------- uchwały o jedzeniu: racje, wspólny kocioł i bez nich ---------- */

const LAW_DAYS = 3;
console.log(
  `\nUchwały o jedzeniu, ${govName}: ${GOV_SEEDS.length} ziaren × ${LAW_DAYS} doby bez zarządu, zapasy na start ${FOOD_START} porcji`,
);
console.log('  uchwała                 zapasy  najedz.  nastrój  nastrój miesz.  gotowania  posiłki  koniec zapasów');
const lawRuns: [string, Partial<Laws>][] = [
  ['bez uchwały', {}],
  ['racje głodowe', { foodMult: 0.75 }],
  ['wspólny kocioł', { foodMult: 1.1, sharedMeals: true }],
  ['racje i kocioł', { foodMult: 0.825, sharedMeals: true }],
];
const lawStats = lawRuns.map(([name, laws]) => {
  const runs = GOV_SEEDS.map((seed) => playLaws(govWorld, seed, laws, LAW_DAYS, zAdresu(govWorld).mieszkancy));
  const empty = runs.filter((r) => r.emptyDay !== null).map((r) => r.emptyDay as number);
  const row = {
    supplies: mean(runs.map((r) => r.supplies)),
    food: mean(runs.map((r) => r.food)),
    mood: mean(runs.map((r) => r.mood)),
    resMood: mean(runs.map((r) => r.resMood)),
    cooks: mean(runs.map((r) => r.cooks)),
    meals: mean(runs.map((r) => r.meals)),
  };
  console.log(
    `  ${name.padEnd(22)} ${f1(row.supplies).padStart(6)}  ${f1(row.food).padStart(7)}  ${f1(row.mood).padStart(7)}  ${f1(row.resMood).padStart(14)}  ${f1(row.cooks).padStart(9)}  ${f1(row.meals).padStart(7)}  ${empty.length ? `w ${empty.length} z ${runs.length} (dzień ${Math.min(...empty)}–${Math.max(...empty)})` : 'starczyło'}`,
  );
  return row;
});
const [none, rations, cauldron] = lawStats;
if (
  !(
    rations.supplies > none.supplies &&
    rations.mood < none.mood &&
    cauldron.supplies < none.supplies &&
    cauldron.mood > none.mood
  )
) {
  console.log('  BŁĄD: racje mają oszczędzać i obniżać nastrój, a kocioł zjadać więcej i podnosić nastrój');
  fail = true;
}

/* ---------- fala 1 M2: dni 2–5 z przeszukiwaniem, rozbiórką i budową, dla porównania bez przeszukiwania ---------- */

const M2_DAYS = 5;
/** koniec dnia d (północ; dzień 1 zaczyna się o 15:00) */
const endOf = (d: number) => (d - 1) * TICKS_PER_DAY + 9 * TICKS_PER_HOUR;
{
  const w0 = govWorld;
  const st0 = createSim(w0, GOV_SEEDS[0], { core: 4, ...zAdresu(w0) });
  const h0 = houseOf(w0)!;
  const empty = st0.apts.filter((a) => a.state === 'puste');
  const heaps = st0.things.filter((t) => t.kind === 'smieci');
  console.log(
    `\nFala 1 M2, ${govName}: ${GOV_SEEDS.length} ziaren × ${M2_DAYS} dni, zawsze warta; od rana dnia 2 gracz co 5 s daje wolnym osobom prace przy pustych mieszkaniach i stawia plany budowli`,
  );
  console.log(
    `  stany mieszkań ze świata (World.apts); ziarno ${GOV_SEEDS[0]}: mieszkań ${st0.apts.length}, pustych ${empty.length} (${empty.map((a) => a.why).join(', ')}), pomieszczeń do przeszukania ${h0.rooms.filter((r) => empty.some((a) => a.apt === r.apt)).length}, sterty śmieci ${heaps.length} (${heaps.reduce((a, t) => a + t.n, 0)} szt.), zepsute meble ${st0.things.filter((t) => t.broken).length}, uszkodzenia ${st0.damage.length}, miejsca dla mieszkańców ${st0.cap}`,
  );
  console.log(
    `  koszty: ${Object.values(BUILDS)
      .map(
        (b) =>
          `${b.name.toLowerCase()} ${Object.entries(b.cost)
            .map(([m, n]) => `${n} ${MAT_ACC[m as Mat]}`)
            .join(' + ')}`,
      )
      .join('; ')}`,
  );
}
/** decyzje w dniach 2–3 od 7:00 do godziny `until` przy ekranie (1×): ile na minutę, w ilu minutach co najmniej
    jedna, najdłuższa przerwa w ciągu dnia (s) */
function cover(decisions: Decision[], until: number) {
  const inside = (s: number) => {
    const t = s * TICKS_PER_SECOND;
    return (dayOf(t) === 2 || dayOf(t) === 3) && hourOf(t) >= 7 && hourOf(t) < until;
  };
  const mins = new Set<number>();
  for (let s = endOf(1) / TICKS_PER_SECOND; s < endOf(3) / TICKS_PER_SECOND; s++)
    if (inside(s)) mins.add(Math.floor(s / 60));
  const ds = decisions.map((d) => d.s).filter(inside);
  let gap = 0;
  for (let k = 1; k < ds.length; k++)
    if (dayOf(ds[k] * TICKS_PER_SECOND) === dayOf(ds[k - 1] * TICKS_PER_SECOND)) gap = Math.max(gap, ds[k] - ds[k - 1]);
  return {
    perMin: ds.length / Math.max(1, mins.size),
    covered: new Set(ds.map((s) => Math.floor(s / 60))).size / Math.max(1, mins.size),
    gap,
  };
}
const m2Runs = (search: boolean) =>
  GOV_SEEDS.map((seed) => {
    const { player, log } = m2Player({ search, furniture: true });
    const w = govWorld;
    const r = playWithGov(w, seed, 'zawsze-warta', M2_DAYS, 4, { player, ...zAdresu(w) });
    return {
      log,
      by: (d: number) => log.built.filter((b) => b.tick < endOf(d)).length,
      work: cover(r.decisions, 21),
      evening: cover(r.decisions, 22),
      mats: snapshot(r.st, w).stock.mats,
      hunger: r.hunger,
    };
  });
const range = (a: number[]) => `${f1(mean(a))} (${Math.min(...a)}–${Math.max(...a)})`;
const m2Line = (name: string, runs: ReturnType<typeof m2Runs>) => {
  const sum = (k: keyof Omit<M2Log, 'built' | 'plans'>) => f1(mean(runs.map((r) => r.log[k])));
  console.log(
    `  ${name}: budowle do końca dnia 2: ${range(runs.map((r) => r.by(2)))}, dnia 3: ${range(runs.map((r) => r.by(3)))}, dnia 5: ${range(runs.map((r) => r.by(5)))}`,
  );
  console.log(
    `    przeszukane pomieszczenia ${sum('searched')}, rozbiórki ${sum('dismantled')}, naprawy ${sum('repaired')}, zajęte mieszkania ${sum('claimed')}; po 5 dniach zostaje desek ${f1(mean(runs.map((r) => r.mats.deski)))}, złomu ${f1(mean(runs.map((r) => r.mats.zlom)))}, części ${f1(mean(runs.map((r) => r.mats.czesci)))}`,
  );
  const pct = (a: number[]) => `${Math.round(100 * mean(a))}% (najmniej ${Math.round(100 * Math.min(...a))}%)`;
  console.log(
    `    decyzje w dniach 2–3 od 7:00 do 21:00: ${f1(mean(runs.map((r) => r.work.perMin)))} na minutę, minut z decyzją ${pct(runs.map((r) => r.work.covered))}, najdłuższa przerwa ${Math.round(Math.max(...runs.map((r) => r.work.gap)))} s; z wieczorem do 22:00 (zarząd zmęczony idzie spać, warta na posterunku) minut z decyzją ${pct(runs.map((r) => r.evening.covered))}`,
  );
  const hs = (k: keyof Hunger) => runs.reduce((a, r) => a + r.hunger[k], 0);
  console.log(
    `    jedzenie zarządu: rano brakło dla głodnych w ${hs('short')} z ${hs('mornings')} poranków, ktoś głodny (najedzenie < 10) przez ${Math.round((100 * hs('starving')) / Math.max(1, hs('samples')))}% czasu`,
  );
  const r0 = runs[0];
  console.log(
    `    ziarno ${GOV_SEEDS[0]}: ${r0.log.built.map((b) => `${BUILDS[b.kind].name.toLowerCase()} (dzień ${dayOf(b.tick)} ${clockOf(b.tick)})`).join(', ') || 'nic'}`,
  );
};
const t2 = performance.now();
const m2With = m2Runs(true);
const m2Without = m2Runs(false);
m2Line('z przeszukiwaniem', m2With);
m2Line('bez przeszukiwania', m2Without);
console.log(`  (${Math.round(performance.now() - t2)} ms)`);
// cel z docs/M2-fala-1.md: przy przeszukiwaniu 2–3 budowle do trzeciego dnia, bez niego nie; decyzja co minutę
const by3 = m2With.map((r) => r.by(3));
if (Math.min(...by3) < 2 || mean(by3) > 3.5 || Math.max(...m2Without.map((r) => r.by(3))) >= 2) {
  console.log('  BŁĄD: z przeszukiwaniem ma stanąć 2–3 budowle do końca dnia 3, bez niego mniej niż 2');
  fail = true;
}
// jedzenie: z przeszukiwaniem (konserwy z kuchni) zarząd głoduje najwyżej 15% czasu
const starving =
  m2With.reduce((a, r) => a + r.hunger.starving, 0) /
  Math.max(
    1,
    m2With.reduce((a, r) => a + r.hunger.samples, 0),
  );
if (starving > 0.15) {
  console.log(`  BŁĄD: z przeszukiwaniem zarząd głoduje przez ${Math.round(100 * starving)}% czasu (najwyżej 15%)`);
  fail = true;
}
if (mean(m2With.map((r) => r.work.perMin)) < 1 || Math.min(...m2With.map((r) => r.work.covered)) < 0.9) {
  console.log('  BŁĄD: dzień 2 i 3 mają dawać decyzję co minutę');
  fail = true;
}

/* ---------- fala 2 M2 (--sasiedzi): gracz fali 1 i jedna osoba u sąsiadów od dnia 2 ---------- */
if (SASIEDZI) {
  const t3 = performance.now();
  console.log(
    `\nFala 2 M2 (--sasiedzi), ${govName}: ${GOV_SEEDS.length} ziaren × ${M2_DAYS} dni, gracz fali 1 z przeszukiwaniem, a od dnia 2 ostatnia osoba z zarządu otwiera najbliższy budynek, przeszukuje pomieszczenia i piętra, nosi łup i rozmawia z lokatorami`,
  );
  const runs = GOV_SEEDS.map((seed) => {
    const m2 = m2Player({ search: true, furniture: true });
    const nb = sasiedziPlayer();
    const w = govWorld;
    const r = playWithGov(w, seed, 'zawsze-warta', M2_DAYS, 4, {
      player: (sim, ww, s, order) => {
        nb.player(sim, ww, s, order);
        m2.player(sim, ww, s, order);
      },
      ...zAdresu(w),
    });
    const sn = snapshot(r.st, w).stock;
    return { log: nb.log, mats: sn.mats, food: sn.supplies, hunger: r.hunger, built: m2.log.built.length };
  });
  const sum = (k: keyof SasiedziLog) => f1(mean(runs.map((r) => r.log[k])));
  console.log(
    `  u sąsiadów: otwarte budynki ${sum('opened')}, przeszukane pomieszczenia ${sum('rooms')}, piętra ${sum('floors')}, spotkania ${sum('meetings')}, rany ${sum('wounds')}, ugryzienia ${sum('bites')}`,
  );
  console.log(
    `  po ${M2_DAYS} dniach: budowle ${f1(mean(runs.map((r) => r.built)))}, jedzenie ${f1(mean(runs.map((r) => r.food)))}, desek ${f1(mean(runs.map((r) => r.mats.deski)))}, złomu ${f1(mean(runs.map((r) => r.mats.zlom)))}, części ${f1(mean(runs.map((r) => r.mats.czesci)))} (bez sąsiadów wyżej: z przeszukiwaniem)`,
  );
  const hs = (k: keyof Hunger) => runs.reduce((a, r) => a + r.hunger[k], 0);
  console.log(
    `  jedzenie zarządu: rano brakło dla głodnych w ${hs('short')} z ${hs('mornings')} poranków, ktoś głodny przez ${Math.round((100 * hs('starving')) / Math.max(1, hs('samples')))}% czasu (${Math.round(performance.now() - t3)} ms)`,
  );
  if (mean(runs.map((r) => r.log.rooms)) < 1) {
    console.log('  BŁĄD: gracz z sąsiadami nic u nich nie przeszukał');
    fail = true;
  }
}

/* ---------- mapa miasta (--miasto): wyprawy dzienne do miejsc z okolicy ---------- */
if (MIASTO) {
  const t4 = performance.now();
  const MIASTO_DAYS = 10;
  const w = govWorld;
  // jak w grze: okolica z geo osiedla (klucze miejsc z położenia, nazwy bez tabel mieszkańców, same kategorie)
  const okolica = okolicaZGeo(demo.geo);
  const poza = okolica.filter((m) => !naMapieLokalnej(m)).length;
  console.log(
    `\nMapa miasta (--miasto), ${govName}: ${GOV_SEEDS.length} ziaren × ${MIASTO_DAYS} dni, gracz fali 1 z przeszukiwaniem, a od dnia 2 za dnia (7–17) dwie najzdrowsze osoby idą do najbliższego niewyczerpanego miejsca poza mapą lokalną (192 m, do 2000 m): brak jedzenia (poniżej 2 porcji na osobę) to sklep spożywczy, brak drewna (poniżej 4) stacja, co trzeci dzień szkoła; jedna wyprawa naraz`,
  );
  console.log(
    `  okolica: ${okolica.length} miejsc, w tym poza mapą lokalną ${poza} (najdalej ${Math.round(Math.max(...okolica.map((m) => m.odl)))} m)`,
  );
  const kats = ['spozywczy', 'stacja', 'szkola'];
  const mc = (zMiastem: boolean) =>
    GOV_SEEDS.map((seed) => {
      const m2 = m2Player({ search: true, furniture: true });
      const mp = miastoPlayer();
      const r = playWithGov(w, seed, 'zawsze-warta', MIASTO_DAYS, 4, {
        player: m2.player,
        ...(zMiastem ? { miasto: { okolica, krok: mp.krok, po: mp.po } } : {}),
        ...zAdresu(w),
      });
      return {
        log: mp.log,
        wysylki: mp.wysylki,
        stock: snapshot(r.st, w).stock,
        hunger: r.hunger,
        built: m2.log.built.length,
        zabrano: Object.values(r.gov.miasto?.zabrano ?? {}).reduce((a, b) => a + b, 0),
        // z miejsc wyniesiono (po kłopotach i udźwigu) i ile razy wróciła stamtąd wyprawa, po kategoriach
        wynos: kats.map((k) => {
          const klucze = okolica.filter((m) => m.kat === k).map((m) => m.klucz);
          return {
            zabrano: klucze.reduce((a, c) => a + (r.gov.miasto?.zabrano[c] ?? 0), 0),
            wizyty: klucze.reduce((a, c) => a + (r.gov.miasto?.wizyty[c] ?? 0), 0),
          };
        }),
      };
    });
  const z = mc(true);
  const bez = mc(false);
  console.log(
    `  wyprawy: średnio ${range(z.map((r) => r.log.wyprawy))} na grę, w tym ${kats.map((k) => `${k} ${f1(mean(z.map((r) => r.wysylki.filter((x) => x.kat === k).length)))}`).join(', ')}; z miejsc wyniesiono średnio ${f1(mean(z.map((r) => r.zabrano)))} sztuk`,
  );
  console.log(
    `  z miejsca wynosi wyprawa średnio (sztuk): ${kats
      .map((k, n) => {
        const wiz = z.reduce((a, r) => a + r.wynos[n].wizyty, 0);
        return `${k} ${wiz ? f1(z.reduce((a, r) => a + r.wynos[n].zabrano, 0) / wiz) : '—'}`;
      })
      .join(', ')}`,
  );
  const lup = (k: keyof (typeof z)[number]['log']['lup']) => f1(mean(z.map((r) => r.log.lup[k])));
  console.log(
    `  łup z powrotów (średnio na grę): jedzenie ${lup('supplies')}, drewno ${lup('wood')}, złom ${lup('scrap')}, części ${lup('parts')}, leki ${lup('meds')}; ranni ${f1(mean(z.map((r) => r.log.ranni)))}, ugryzieni ${f1(mean(z.map((r) => r.log.ugryzieni)))}`,
  );
  const dni = Array.from({ length: MIASTO_DAYS + 1 }, (_, k) => {
    const m = Math.max(...z.map((r) => r.log.maxOdl[k] ?? 0));
    return `${k + 1}: ${m ? Math.round(m) : '—'}`;
  });
  console.log(`  najdalsza wyprawa po dniach (największa z ziaren, m): ${dni.join(', ')}`);
  const hz = (rs: typeof z, k: keyof Hunger) => rs.reduce((a, r) => a + r.hunger[k], 0);
  const gl = (rs: typeof z) => Math.round((100 * hz(rs, 'starving')) / Math.max(1, hz(rs, 'samples')));
  const zap = (rs: typeof z, k: 'supplies' | 'wood' | 'meals') => range(rs.map((r) => r.stock[k] ?? 0));
  for (const [nazwa, rs] of [
    ['z wyprawami', z],
    ['bez wypraw', bez],
  ] as const)
    console.log(
      `  po ${MIASTO_DAYS} dniach, ${nazwa}: jedzenie ${zap(rs, 'supplies')}, garnek ${zap(rs, 'meals')}, drewno ${zap(rs, 'wood')}, budowle ${f1(mean(rs.map((r) => r.built)))}; rano brakło jedzenia dla głodnych w ${hz(rs, 'short')} z ${hz(rs, 'mornings')} poranków, ktoś głodny przez ${gl(rs)}% czasu`,
    );
  console.log(`  (${Math.round(performance.now() - t4)} ms)`);
  if (mean(z.map((r) => r.log.wyprawy)) < 1) {
    console.log('  BŁĄD: gracz z mapą miasta nie wysłał żadnej wyprawy');
    fail = true;
  }
  const jedz = mean(z.map((r) => r.stock.supplies + (r.stock.meals ?? 0)));
  const jedzBez = mean(bez.map((r) => r.stock.supplies + (r.stock.meals ?? 0)));
  if (jedz < 0.5 * jedzBez || gl(z) > gl(bez) + 10)
    console.log(
      `  UWAGA: zarząd z wyprawami ma po ${MIASTO_DAYS} dniach wyraźnie mniej jedzenia (${f1(jedz)} wobec ${f1(jedzBez)}) albo głoduje dłużej (${gl(z)}% wobec ${gl(bez)}%): do strojenia liczb w src/gov/wyprawy.ts`,
    );
}

/* ---------- warunki zwycięstwa (--zwyciestwo): kamienie dróg po dniach ---------- */
if (ZWYCIESTWO) {
  const t5 = performance.now();
  const ZW_DAYS = 30;
  const w = govWorld;
  // cel drogi ludnościowej jak w grze: z ludności kwadratu domu z 2021 roku z tabel mieszkańców, bez tabel 250
  const spis = await ludnoscDema(demo);
  const cel = celLudnosci({ ludnosc2021: spis.ludnosc2021 }, 'zwykly');
  const skadCel = !spis.tabele
    ? 'BEZ TABEL MIESZKAŃCÓW: brak public/data/mieszkancy/, ludnosc2021 nie podane, cel jak bez danych'
    : spis.ludnosc2021 === undefined
      ? 'tabele są, ale spis nic nie dał: ludnosc2021 nie podane, cel jak bez danych'
      : `połowa z ${spis.ludnosc2021} osób mieszkających w kwadracie domu w 2021 roku, w przedziale 120–500, z tabel mieszkańców`;
  console.log(
    `\nWarunki zwycięstwa (--zwyciestwo), ${govName}: ${GOV_SEEDS.length} ziaren × ${ZW_DAYS} dni, gracz fali 1 z przeszukiwaniem, zarząd z włączonymi drogami (wlaczZwyciestwo)`,
  );
  console.log(`  cel drogi ludnościowej: ${cel} osób (${skadCel}); potem 7 dni bez głodu przy zaufaniu co najmniej 50`);
  /** stan na koniec doby: ludzie pod zarządem, cel, kamienie dróg (w kolejności ekranu), licznik celu, zwycięstwa */
  interface DzienZw {
    ludzie: number;
    cel: number;
    kamienie: number[];
    dniCelu: number;
    wygrane: number;
  }
  const kolejnosc: Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];
  const zwRuns = GOV_SEEDS.map((seed) => {
    const m2 = m2Player({ search: true, furniture: true });
    const dni = new Map<number, DzienZw>();
    let wpisy = 0;
    const r = playWithGov(w, seed, 'zawsze-warta', ZW_DAYS, 4, {
      player: m2.player,
      zwyciestwo: {
        ludnosc2021: spis.ludnosc2021,
        po: (gov, i, fx) => {
          // wpisy o kamieniach z każdego kroku (kronika w stanie trzyma tylko 300 ostatnich)
          wpisy += fx.log.filter((t) => t.pl.startsWith('Droga „')).length;
          const o = ocenDrogi(gov, i);
          const z = gov.zwyciestwo!;
          const lud = o.find((d) => d.droga === 'ludnosc')!;
          // ostatnia obserwacja doby zostaje w mapie
          dni.set(i.day, {
            ludzie: lud.postep!.ile,
            cel: lud.postep!.cel,
            kamienie: kolejnosc.map((d) => o.find((x) => x.droga === d)!.zaliczone),
            dniCelu: z.dniCelu,
            wygrane: z.wygrane.length,
          });
        },
      },
      ...zAdresu(w),
    });
    return { seed, dni, wpisy, gov: r.gov, hunger: r.hunger };
  });
  const sumaKamieni = (d: DzienZw) => d.kamienie.reduce((a, b) => a + b, 0);
  const ostatni = (r: (typeof zwRuns)[number]) => r.dni.get(Math.max(...r.dni.keys()))!;
  // pierwsze ziarno dzień po dniach (stan na koniec doby; kamienie zaliczone z ilu)
  const r0 = zwRuns[0];
  console.log(
    `  ziarno ${r0.seed}, stan na koniec doby (kamienie zaliczone / wszystkie; dzień 1 zaczyna się o 15:00, ostatni wiersz to koniec biegu o 15:00):`,
  );
  console.log(
    `   dzień  ludność  ${'cel'.padStart(4)}  licznik  ${kolejnosc.map((d) => d.padStart(11)).join(' ')}  zwycięstwa`,
  );
  for (const [dzien, d] of [...r0.dni].sort((a, b) => a[0] - b[0]))
    console.log(
      `  ${String(dzien).padStart(6)}  ${String(d.ludzie).padStart(7)}  ${String(d.cel).padStart(4)}  ${String(d.dniCelu).padStart(7)}  ${kolejnosc.map((droga, k) => `${d.kamienie[k]}/${DROGI[droga].kamienie.length}`.padStart(11)).join(' ')}  ${String(d.wygrane).padStart(10)}`,
    );
  // podsumowanie wszystkich ziaren: ludzie i kamienie ludności po ZW_DAYS dniach, dzień każdego kamienia ludności
  const ludzie = zwRuns.map((r) => ostatni(r).ludzie);
  console.log(
    `  po ${ZW_DAYS} dniach (${GOV_SEEDS.length} ziaren): ludzie średnio ${f1(mean(ludzie))} (od ${Math.min(...ludzie)} do ${Math.max(...ludzie)}) przy celu ${cel}; licznik celu najwyżej ${Math.max(...zwRuns.map((r) => Math.max(...[...r.dni.values()].map((d) => d.dniCelu))))} z 7; zwycięstwa ${zwRuns.reduce((a, r) => a + ostatni(r).wygrane, 0)} w ${zwRuns.length} grach`,
  );
  const iLud = kolejnosc.indexOf('ludnosc');
  const dzienKamienia = (r: (typeof zwRuns)[number], k: number) =>
    [...r.dni].sort((a, b) => a[0] - b[0]).find(([, d]) => d.kamienie[iLud] > k)?.[0];
  console.log(
    `  droga ludnościowa, dzień zaliczenia kamienia (po ziarnach, — gdy nie zaliczono): ${DROGI.ludnosc.kamienie
      .map((kam, k) => `${kam.pl}: ${zwRuns.map((r) => dzienKamienia(r, k) ?? '—').join(', ')}`)
      .join('; ')}`,
  );
  console.log(
    `  pozostałe drogi (technologia, teren, lek, cuda): ten gracz nie buduje pracowni ani wspólnego płotu, a lek i cuda czekają na projekty, na których stoją; kamieni zaliczonych ${kolejnosc
      .filter((d) => d !== 'ludnosc')
      .map((d) => `${d} ${zwRuns.reduce((a, r) => a + ostatni(r).kamienie[kolejnosc.indexOf(d)], 0)}`)
      .join(', ')}`,
  );
  const hz = (k: keyof Hunger) => zwRuns.reduce((a, r) => a + r.hunger[k], 0);
  console.log(
    `  jedzenie zarządu: rano brakło dla głodnych w ${hz('short')} z ${hz('mornings')} poranków, ktoś głodny przez ${Math.round((100 * hz('starving')) / Math.max(1, hz('samples')))}% czasu (${Math.round(performance.now() - t5)} ms)`,
  );
  // zgodność: kamienie nie maleją, każdy ma jeden wpis w kronice, licznik celu do 7, droga wygrywa najwyżej raz
  for (const r of zwRuns) {
    const dni = [...r.dni].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
    const maleja = dni.some((d, k) => k > 0 && d.kamienie.some((n, j) => n < dni[k - 1].kamienie[j]));
    if (maleja) {
      console.log(`  BŁĄD: ziarno ${r.seed}: liczba kamieni dróg zmalała między dobami`);
      fail = true;
    }
    const kamieni = sumaKamieni(ostatni(r));
    if (r.wpisy !== kamieni) {
      console.log(
        `  BŁĄD: ziarno ${r.seed}: ${kamieni} kamieni, a w kronice ${r.wpisy} wpisów o kamieniach (ma być po jednym)`,
      );
      fail = true;
    }
    const z = r.gov.zwyciestwo!;
    if (dni.some((d) => d.dniCelu > 7) || new Set(z.wygrane.map((x) => x.droga)).size !== z.wygrane.length) {
      console.log(`  BŁĄD: ziarno ${r.seed}: licznik celu ponad 7 albo ta sama droga wygrała dwa razy`);
      fail = true;
    }
    if (z.epilogi.length) {
      console.log(`  BŁĄD: ziarno ${r.seed}: epilog czeka po „Graj dalej” bota (${z.epilogi.join(', ')})`);
      fail = true;
    }
  }
}
if (fail) process.exit(1);
