/* Bot nowej symulacji: gra bez przeglądarki przez 45 dni i wypisuje dzienne liczby, potem scenariusz
   „pierwsze trzy minuty”: polecenie ścięcia suchego drzewa i czasy kolejnych kroków aż do ciepłej kuchni,
   a dalej trzy doby zarządu bez poleceń. Gospodarka z 0.3 wejdzie w M3; jej wzorzec liczy npm run bot:v03.
   Dopóki świat z OSM nie ma wnętrza siedziby (gałąź wnętrza), scenariusz biegnie na sztucznych światach
   z atrapą wnętrza z testów; kiedy wnętrze jest, bierze prawdziwą siedzibę.
   Uruchomienie: npm run bot [-- ziarno [dni [tłum]]] */

import fs from 'node:fs';
import path from 'node:path';
import { nextRandom } from '../src/core/rng.ts';
import { clockOf, dayOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { dryTreeOf, houseOf } from '../src/sim/house.ts';
import { commandFor, jobText } from '../src/sim/orders.ts';
import { createSim, Sim, woodFrom } from '../src/sim/sim.ts';
import { TUT_STEPS, type TutStep } from '../src/sim/tutorial.ts';
import { buildWorld, type World } from '../src/world/world.ts';
import { mockBlock, mockHouse } from '../tests/unit/interior-mock.ts';

const SEED = Number(process.argv[2]) || 1;
const DAYS = Number(process.argv[3]) || 45;
const CROWD = Number(process.argv[4]) || 40;

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../public/demo/przymorze.json'), 'utf8'));
const t0 = performance.now();
const world = buildWorld(demo.geo, { seed: SEED, street: demo.street });
const sim = new Sim(world, createSim(world, SEED, { core: 4, crowd: CROWD }));
console.log(
  `Bot 0.4, ${demo.name}: ${world.buildings.length} budynków, ${world.trees.length} drzew, świat w ${Math.round(performance.now() - t0)} ms`,
);
console.log(`Rdzeń: ${sim.st.people.map((p) => `${p.name} (${p.prof.toLowerCase()})`).join(', ')}; tłum: ${CROWD}`);
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
  // dalej bez poleceń do końca trzeciej doby: zarząd sam pilnuje kozy, je i śpi
  console.log('  Dalej bez poleceń (kuchnia i ogień w ciągu doby, zapasy i średnie potrzeby zarządu o północy):');
  console.log('  dzień  kuchnia °C   ogień  jedzenie  drewno  najedzenie  ciepło  siły  zdrowie  nastrój');
  for (let d = 1; d <= 3; d++) {
    let lo = 99;
    let hi = -99;
    let fire = 0;
    for (; dayOf(st.tick) === d; s.step()) {
      if (st.tick % 20 || kitchen < 0) continue;
      lo = Math.min(lo, st.temps[kitchen]);
      hi = Math.max(hi, st.temps[kitchen]);
      if ((st.things.find((t) => t.kind === 'koza')?.fuel ?? 0) > 0) fire += 20;
    }
    const core = st.pawns.filter((p) => p.kind === 'core');
    const avg = (k: 'food' | 'warm' | 'rest' | 'health' | 'mood', w: number) =>
      String(Math.round(core.reduce((a, p) => a + p.needs![k], 0) / core.length)).padStart(w);
    const food = st.things.find((t) => t.kind === 'jedzenie')?.n ?? 0;
    const wood = st.things.filter((t) => t.kind === 'drewno').reduce((a, t) => a + t.n, 0);
    const temps = `${lo.toFixed(1)}–${hi.toFixed(1)}`;
    console.log(
      `  ${String(d).padStart(5)}  ${temps.padStart(10)}  ${(fire / TICKS_PER_HOUR).toFixed(1).padStart(4)} h  ${String(food).padStart(8)}  ${String(wood).padStart(6)}  ${avg('food', 10)}  ${avg('warm', 6)}  ${avg('rest', 4)}  ${avg('health', 7)}  ${avg('mood', 7)}`,
    );
  }
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
if (fail) process.exit(1);
