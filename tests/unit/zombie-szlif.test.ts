/* Szlif trybu zombie (18.10.2026): szwendacz w łatanej dziurze zostaje po stronie ulicy. */

import { describe, expect, it } from 'vitest';
import { createSim, type Pawn, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
const runTo = (sim: Sim, tick: number, each?: () => void) => {
  while (sim.st.tick < tick) {
    sim.step();
    each?.();
  }
};
const zombieDay = (core = 2) => {
  const st = createSim(w, 3, { core, mode: 'zombie' });
  st.tick = atHour(2, 10);
  return { st, sim: new Sim(w, st) };
};
const near4 = (t: number) => [t - size, t + size, t - 1, t + 1];
const indoor = (t: number) => w.interior.room[t] >= 0 || w.interior.doors.includes(t);

/** Kafelki siatki z wolnym miejscem po obu stronach: od ulicy dla szwendacza, od podwórka dla zarządu; co trzeci,
    żeby test nie trwał za długo. Zwraca kafelek siatki, sąsiada od ulicy i sąsiada od podwórka. */
function holeSpots(sim: Sim): { tile: number; out: number; inn: number }[] {
  const spots: { tile: number; out: number; inn: number }[] = [];
  for (const [k, tile] of w.fence.tiles.entries()) {
    if (k % 3) continue;
    const out = near4(tile).find((n) => !yard.has(n) && !indoor(n) && sim.canWalk('zombie', n));
    const inn = near4(tile).find((n) => yard.has(n) && sim.canWalk('zombie', n) && sim.canWalk('core', n));
    if (out !== undefined && inn !== undefined) spots.push({ tile, out, inn });
  }
  return spots;
}

/** nowa dziura w siatce (napór zbił kafelek do zera) */
function openHole(st: SimState, sim: Sim, tile: number): void {
  sim.damageFence(tile, 200);
  expect(st.fence!.holes.some((h) => h.tiles.includes(tile) && !h.patch)).toBe(true);
  expect(sim.canWalk('zombie', tile)).toBe(true);
}

describe('szwendacz w łatanej dziurze', () => {
  it('kto stoi w dziurze, kiedy ją łatają, zostaje po stronie ulicy', () => {
    const spots = holeSpots(zombieDay().sim);
    expect(spots.length).toBeGreaterThan(5);
    for (const { tile } of spots) {
      const { st, sim } = zombieDay();
      openHole(st, sim, tile);
      const z = spawnZombie(st, w, tile, 3);
      // łaty z zarządu: największa otwarta dziura od razu załatana
      sim.push({ t: 'mend', ids: [], n: 1 });
      let inYard = false;
      runTo(sim, st.tick + 2000, () => {
        if (yard.has(tileOf(z))) inYard = true;
      });
      expect(inYard, `dziura ${tile}`).toBe(false);
      expect(sim.canWalk('zombie', tile), `dziura ${tile}`).toBe(false);
    }
  });

  it('kto idzie przez dziurę na hałas z podwórka, staje przed łatą', () => {
    const spots = holeSpots(zombieDay().sim);
    let crossing = 0;
    for (const { tile, out, inn } of spots) {
      const { st, sim } = zombieDay();
      openHole(st, sim, tile);
      const z = spawnZombie(st, w, out, 3);
      // hałas tuż za dziurą od strony podwórka: szwendacz idzie na niego przez dziurę
      st.noise!.push({ x: (inn % size) + 0.5, y: Math.floor(inn / size) + 0.5, r: 10, until: st.tick + 400 });
      runTo(sim, st.tick + 40);
      if (!z.path.slice(z.pi).includes(tile)) continue;
      crossing++;
      sim.push({ t: 'mend', ids: [], n: 1 });
      let inYard = false;
      runTo(sim, st.tick + 2000, () => {
        if (yard.has(tileOf(z))) inYard = true;
      });
      expect(inYard, `dziura ${tile}`).toBe(false);
    }
    // test ma sens tylko wtedy, gdy szwendacze naprawdę szli przez dziurę
    expect(crossing).toBeGreaterThan(3);
  });
});
