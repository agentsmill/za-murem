/* Bot nowej symulacji: gra bez przeglądarki przez 45 dni i wypisuje dzienne liczby.
   Na razie (prototyp M1) symulacja to ruch: rdzeń dostaje polecenia, tłum chodzi po osiedlu.
   Gospodarka z 0.3 wejdzie w M3; jej wzorzec liczy npm run bot:v03.
   Uruchomienie: npm run bot [-- ziarno [dni [tłum]]] */

import fs from 'node:fs';
import path from 'node:path';
import { nextRandom } from '../src/core/rng.ts';
import { clockOf, dayOf, TICKS_PER_DAY } from '../src/sim/clock.ts';
import { createSim, Sim } from '../src/sim/sim.ts';
import { buildWorld } from '../src/world/world.ts';

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
