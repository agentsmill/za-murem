/* Pomocniki testów pracy ludzi: Lanciego z prawdziwym wspólnym płotem wokół Bloku nr 10F. Budynek za takim płotem jest
   nasz (`st.plot.bids`), a korytarz łączy go z podwórkiem, więc można do niego dojść bez wychodzenia na ulicę. Sztuczne
   `st.plot = { bids }` bez korytarza takiej łączności nie daje (budynek jest wtedy osobnym obszarem naszego terenu).
   Świat jest świeży (płot zmienia siatkę w miejscu), a symulacja zwykła (`zwykly`, 4 osoby), bez żadnej losowości poza
   ziarnem gry. */

import fs from 'node:fs';
import path from 'node:path';
import { hashString } from '../../src/core/rng.ts';
import { kosztPlotu, plotDla } from '../../src/sim/sasiedzi.ts';
import { createSim, type Pawn, Sim } from '../../src/sim/sim.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { core, pusto, until } from './sasiedzi-pomoc.ts';

/** świeży świat dema (bez pamięci: płot zmieni w nim siatkę) */
export function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** Lanciego z otwartym Blokiem nr 10F (łom, drzwi otwarte albo wyważone), materiałem na płot na podwórku i planem płotu
    zaczętym przez gracza (jak w plot.test.ts); `pustyBlok`: lokatorów w budynkach nie ma. */
export function graZPlanem(pustyBlok = false) {
  const w = swiezy('lanciego');
  const sim = new Sim(w, createSim(w, 5, { core: 4, mode: 'zwykly' }));
  if (pustyBlok) sim.lokatorzy = pusto(w);
  const b = w.buildings.find((x) => x.name === 'Blok nr 10F')!;
  const p = core(sim)[0];
  p.weapon = 'lom';
  const door = b.entrances[0].tile;
  for (const t of ['open', 'force'] as const) {
    sim.push({ t, ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door', 8000);
    if (sim.st.sasiedzi?.budynki.find((x) => x.bid === b.id)?.otwarty) break;
  }
  const r = plotDla(sim.st, w, b.id);
  if (!r?.ok) throw new Error('10F bez płotu');
  const { need } = kosztPlotu(r);
  const free = w.fence.yard.filter((i) => !w.blocked[i] && !sim.st.things.some((t) => t.y * w.size + t.x === i));
  let k = 0;
  for (const [m, n] of Object.entries(need) as [string, number][])
    for (let left = n + 4; left > 0; left -= 10) {
      const i = free[k++];
      sim.st.things.push({
        id: sim.st.nextThing++,
        kind: m,
        x: i % w.size,
        y: Math.floor(i / w.size),
        w: 1,
        h: 1,
        rot: 0,
        n: Math.min(10, left),
        fuel: 0,
        by: -1,
        owner: -1,
      });
    }
  sim.push({ t: 'enclose', ids: [p.id], bid: b.id });
  sim.step();
  if (sim.st.plot?.plan?.bid !== b.id) throw new Error('plan płotu nie powstał');
  return { w, sim, b, p, r };
}

/** Buduje zaczęty plan płotu do końca (osoba `p` z poleceniem, potrzeby uzupełniane co sekundę gry); płot stoi, gdy
    `st.plot.bids` zawiera budynek. Rzuca, gdy się nie udało. */
export function zbudujPlot(g: { sim: Sim; b: { id: number }; p: Pawn }): void {
  const { sim, b, p } = g;
  for (let n = 0; n < 60000 && !sim.st.plot?.bids.includes(b.id); n++) {
    sim.step();
    if (n % 100 === 0)
      for (const q of core(sim)) Object.assign(q.needs!, { food: 90, rest: 90, warm: 60, health: 100 });
    if (n % 400 === 0 && sim.st.plot?.plan && p.job?.t !== 'plot' && !sim.st.cmds.length)
      sim.push({ t: 'enclose', ids: [p.id], bid: b.id });
  }
  if (!sim.st.plot?.bids.includes(b.id)) throw new Error('płot nie stanął');
}
