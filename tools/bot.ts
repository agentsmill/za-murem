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
   Uruchomienie: npm run bot [-- ziarno [dni [tłum]]] */

import fs from 'node:fs';
import path from 'node:path';
import { nextRandom } from '../src/core/rng.ts';
import { BUILDS, type Mat } from '../src/sim/budowle.ts';
import { clockOf, dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { dryTreeOf, houseOf, inHomeApt } from '../src/sim/house.ts';
import { MAT_ACC } from '../src/sim/mieszkania.ts';
import { HUNGRY } from '../src/sim/needs.ts';
import { commandFor, commandsAt, jobText } from '../src/sim/orders.ts';
import { BURNABLE, createSim, FOOD_START, type Laws, REST_UNTIL, Sim, woodFrom } from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { TUT_STEPS, type TutStep } from '../src/sim/tutorial.ts';
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

const SEED = Number(process.argv[2]) || 1;
const DAYS = Number(process.argv[3]) || 45;
const CROWD = Number(process.argv[4]) || 0;

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../public/demo/przymorze.json'), 'utf8'));
const t0 = performance.now();
const world = buildWorld(demo.geo, { seed: SEED, street: demo.street });
const sim = new Sim(world, createSim(world, SEED, { core: 4, crowd: CROWD }));
console.log(
  `Bot 0.4, ${demo.name}: ${world.buildings.length} budynków, ${world.trees.length} drzew, świat w ${Math.round(performance.now() - t0)} ms`,
);
console.log(
  `Rdzeń: ${sim.st.people.map((p) => `${p.name} (${p.prof.toLowerCase()})`).join(', ')}; mieszkańców ${sim.st.pawns.filter((p) => p.kind === 'resident').length}, tłum: ${CROWD}`,
);
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
  const s = new Sim(w, createSim(w, SEED, { core: 4, crowd: 8 }));
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
  const runs = GOV_SEEDS.map((seed) => playWithGov(govWorld, seed, policy, GOV_DAYS));
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
  GOV_SEEDS.flatMap((seed) => playWithGov(govWorld, seed, 'zawsze-warta', KOZA_DAYS, 4, { koza, evening: 16 }).nights);
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
  const runs = GOV_SEEDS.map((seed) => playLaws(govWorld, seed, laws, LAW_DAYS));
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
  const st0 = createSim(w0, GOV_SEEDS[0], { core: 4 });
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
    const r = playWithGov(w, seed, 'zawsze-warta', M2_DAYS, 4, { player });
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
  const sum = (k: keyof Omit<M2Log, 'built'>) => f1(mean(runs.map((r) => r.log[k])));
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
if (fail) process.exit(1);
