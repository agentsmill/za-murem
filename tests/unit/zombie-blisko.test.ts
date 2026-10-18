/* Szwendacze blisko osiedla na prawdziwej mapie (Przymorze, 384 m): za dnia kręcą się w pasie przy siatce, gdzie widać
   ich z podwórka, a nie po całej mapie; stado nocą wychodzi z okolicy i dochodzi do siatki przed północą. */

import { describe, expect, it } from 'vitest';
import { createSim, type Pawn, Sim, type SimState } from '../../src/sim/sim.ts';
import { ambientCount, NEAR } from '../../src/sim/zombie.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const a = ADDRESSES.find((x) => x.key === 'przymorze')!;
const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const zombies = (st: SimState) => st.pawns.filter((p) => p.kind === 'zombie');
const fenceDist = (p: Pawn) =>
  Math.min(...w.fence.tiles.map((t) => Math.hypot((t % size) + 0.5 - p.x, Math.floor(t / size) + 0.5 - p.y)));
const runTo = (sim: Sim, tick: number, each?: () => void) => {
  while (sim.st.tick < tick) {
    sim.step();
    each?.();
  }
};

describe('szwendacze blisko osiedla', () => {
  it('za dnia snują się w pasie do NEAR metrów od siatki, za siatką, przez całe popołudnie', () => {
    const st = createSim(w, 1, { core: 4, mode: 'zombie' });
    const sim = new Sim(w, st);
    sim.step();
    expect(zombies(st)).toHaveLength(ambientCount(1));
    for (let h = 16; h <= 20; h++) {
      runTo(sim, atHour(1, h));
      for (const z of zombies(st)) {
        expect(yard.has(Math.floor(z.y) * size + Math.floor(z.x)), `${h}:00`).toBe(false);
        expect(fenceDist(z), `${h}:00`).toBeLessThanOrEqual(NEAR + 2);
      }
    }
    // ściągają się pod siatkę: wieczorem większość stoi przy niej
    expect(zombies(st).filter((z) => fenceDist(z) <= 10).length).toBeGreaterThanOrEqual(ambientCount(1) / 2);
  });

  it('stado wychodzi z okolicy (do 85 m od siatki), a pierwsze grupy napierają na siatkę przed 23:00', () => {
    const st = createSim(w, 1, { core: 4, mode: 'zombie' });
    st.tick = atHour(3, 20.9);
    const sim = new Sim(w, st);
    const born = new Map<number, number>();
    runTo(sim, atHour(4, 1.5), () => {
      for (const z of zombies(st)) if (!born.has(z.id)) born.set(z.id, fenceDist(z));
      if (st.tick === atHour(3, 23)) {
        const pressing = zombies(st).filter((z) => z.job?.phase === 2 || fenceDist(z) <= 2).length;
        expect(pressing).toBeGreaterThanOrEqual(3);
      }
    });
    expect(born.size).toBeGreaterThan(8);
    for (const d of born.values()) expect(d).toBeLessThanOrEqual(85);
  });
});
