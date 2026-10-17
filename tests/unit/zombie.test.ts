import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { createSim, type Pawn, Sim, type SimState, STAY_YARD, spawnZombie } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { ambientCount, distField, hordeSize, MAX_ZOMBIES, ZOMBIE_HP } from '../../src/sim/zombie.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
const zombies = (st: SimState) => st.pawns.filter((p) => p.kind === 'zombie');
const fenceDist = (p: Pawn) =>
  Math.min(...w.fence.tiles.map((t) => Math.hypot((t % size) + 0.5 - p.x, Math.floor(t / size) + 0.5 - p.y)));
const zombieSim = (h = 15, day = 1) => {
  const st = createSim(w, 3, { core: 2, mode: 'zombie' });
  st.tick = atHour(day, h);
  return { st, sim: new Sim(w, st) };
};
const runTo = (sim: Sim, tick: number, each?: () => void) => {
  while (sim.st.tick < tick) {
    sim.step();
    each?.();
  }
};

describe('szwendacze', () => {
  it('liczebność: za dnia min(30, 6 + 2·dzień), stado min(60, 8 + 6·(dzień − 1)), najwyżej 80', () => {
    expect([1, 2, 12, 20].map(ambientCount)).toEqual([8, 10, 30, 30]);
    expect([1, 2, 9, 10, 30].map(hordeSize)).toEqual([8, 14, 56, 60, 60]);
    expect(MAX_ZOMBIES).toBe(80);
    expect(ZOMBIE_HP).toBe(60);
  });

  it('pole odległości: BFS od kafelków startowych po przechodnich kafelkach, −1 tam, gdzie nie dojść', () => {
    // 4 × 4, ściana w środku drugiego wiersza, kafelek w rogu zamknięty
    const blocked = new Uint8Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(distField(blocked, 4, [0]))).toEqual([0, 1, 2, 3, 1, -1, -1, 4, 2, 3, 4, 5, 3, 4, 5, 6]);
    blocked[15] = 1;
    expect(distField(blocked, 4, [0])[15]).toBe(-1);
  });

  it('w trybie zombie siatka jest cała i wzmocniona, brama zamknięta, szwendacze nie przechodzą', () => {
    const { st, sim } = zombieSim();
    const f = st.fence!;
    expect(f.reinforced).toBe(true);
    expect(f.gateOpen).toBe(false);
    expect(f.hp.every((v) => v === 100)).toBe(true);
    expect(f.holes.every((h) => h.patch === 100)).toBe(true);
    for (const t of w.fence.tiles) expect(sim.canWalk('zombie', t)).toBe(false);
    for (let y = w.fence.gate.y; y < w.fence.gate.y + w.fence.gate.h; y++)
      for (let x = w.fence.gate.x; x < w.fence.gate.x + w.fence.gate.w; x++)
        expect(sim.canWalk('zombie', y * size + x)).toBe(false);
    // do pomieszczeń siedziby szwendacz nie wejdzie
    for (let i = 0; i < size * size; i++) if (w.interior.room[i] >= 0) expect(sim.canWalk('zombie', i)).toBe(false);
  });

  it('w zwykłym trybie szwendaczy nie ma', () => {
    const st = createSim(w, 3, { core: 2 });
    const sim = new Sim(w, st);
    runTo(sim, atHour(2, 7));
    expect(zombies(st)).toEqual([]);
  });

  it('za dnia snuje się ambientCount(dzień) szwendaczy daleko od siatki, za siatką', () => {
    const { st, sim } = zombieSim();
    sim.step();
    expect(zombies(st)).toHaveLength(ambientCount(1));
    for (const z of zombies(st)) {
      expect(z.hp).toBe(ZOMBIE_HP);
      expect(yard.has(tileOf(z))).toBe(false);
      expect(fenceDist(z)).toBeGreaterThanOrEqual(15);
    }
    runTo(sim, atHour(1, 20.9));
    expect(zombies(st)).toHaveLength(ambientCount(1));
    expect(snapshot(st, w).zombies.all).toBe(ambientCount(1));
  });

  it('od 21:00 do 1:00 przychodzi stado i napiera na siatkę, która traci wytrzymałość', () => {
    const { st, sim } = zombieSim(20.9);
    sim.step();
    const before = zombies(st).length;
    runTo(sim, atHour(2, 1.5));
    expect(st.horde?.left).toBe(0);
    expect(zombies(st).length).toBe(before + hordeSize(1));
    runTo(sim, atHour(2, 3));
    expect(zombies(st).some((z) => z.job?.t === 'zombie' && z.job.phase === 2)).toBe(true);
    expect(st.fence!.hp.some((v) => v < 100)).toBe(true);
    expect(snapshot(st, w).zombies.pressing).toBeGreaterThan(0);
    expect(snapshot(st, w).fence.durability).toBeLessThan(1);
  });

  it('kafelek siatki z wytrzymałością 0 staje się dziurą: szwendacze wchodzą na podwórko, ale nie do budynków', () => {
    const { st, sim } = zombieSim(20.9);
    runTo(sim, atHour(2, 2));
    const holes0 = st.fence!.holes.length;
    st.fence!.hp = st.fence!.hp.map(() => 0.002);
    let inYard = false;
    runTo(sim, atHour(2, 4), () => {
      for (const z of zombies(st)) {
        const t = tileOf(z);
        expect(w.interior.room[t] >= 0 || w.interior.doors.includes(t)).toBe(false);
        if (yard.has(t)) inYard = true;
      }
    });
    expect(st.fence!.holes.length).toBeGreaterThan(holes0);
    expect(st.tally!.breaches).toBeGreaterThan(0);
    expect(inYard).toBe(true);
  });

  it('nową dziurę łata się jak starą', () => {
    const { st, sim } = zombieSim(9, 2);
    const k = Math.floor(w.fence.tiles.length / 2);
    const tile = w.fence.tiles[k];
    sim.damageFence(tile, 200);
    const hole = st.fence!.holes.find((h) => h.tiles.includes(tile))!;
    expect(hole).toBeTruthy();
    expect(hole.patch).toBe(0);
    expect(sim.canWalk('zombie', tile)).toBe(true);
    const a = st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'patch', ids: [a.id], hole: hole.id });
    runTo(sim, st.tick + 3000);
    expect(hole.patch).toBeGreaterThan(0);
    expect(sim.canWalk('zombie', tile)).toBe(false);
  });

  it('nigdy więcej niż 80 szwendaczy naraz', () => {
    const { st, sim } = zombieSim(15, 20);
    let peak = 0;
    runTo(sim, atHour(21, 2), () => {
      peak = Math.max(peak, zombies(st).length);
    });
    expect(peak).toBe(MAX_ZOMBIES);
  });

  it('szwendacz na podwórku: mieszkańcy zostają w domu, a ci na podwórku do niego wracają', () => {
    const { st, sim } = zombieSim(10, 2);
    runTo(sim, st.tick + 400);
    const working = () =>
      st.pawns.filter((p) => p.kind === 'resident' && p.job?.t === 'stay' && p.job.target === STAY_YARD);
    expect(working().length).toBeGreaterThan(0);
    // szwendacz w najdalszym od wejść kącie podwórka
    const door = w.buildings[w.hq].entrances[0].out;
    const far = [...w.fence.yard]
      .filter((i) => sim.canWalk('zombie', i))
      .sort(
        (a, b) =>
          Math.hypot((b % size) - (door % size), Math.floor(b / size) - Math.floor(door / size)) -
          Math.hypot((a % size) - (door % size), Math.floor(a / size) - Math.floor(door / size)),
      )[0];
    spawnZombie(st, w, far, 3);
    const t1 = st.tick;
    // póki szwendacz jest na podwórku, nikt nie zaczyna tam nowej pracy (także po powrocie do domu)
    let started = 0;
    runTo(sim, t1 + 3000, () => {
      if (!st.pawns.some((p) => p.kind === 'zombie' && yard.has(tileOf(p)))) return;
      for (const r of working()) if (r.job!.t0 > t1) started++;
    });
    expect(started).toBe(0);
  });

  it('zapis w środku stada: ta sama dalsza gra', () => {
    const { st, sim } = zombieSim(20.9);
    runTo(sim, atHour(1, 23.5));
    expect(zombies(st).length).toBeGreaterThan(0);
    const copy = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (let k = 0; k < 2000; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });

  it('o 6:00 stado się rozchodzi: nikt już nie należy do stada', () => {
    const { st, sim } = zombieSim(20.9);
    runTo(sim, atHour(2, 5.9));
    expect(zombies(st).some((z) => z.job?.what === 'stado')).toBe(true);
    runTo(sim, atHour(2, 6) + TICKS_PER_HOUR / 4);
    expect(zombies(st).some((z) => z.job?.what === 'stado')).toBe(false);
  });
});
