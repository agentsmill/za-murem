import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import {
  AMPUTATE_WINDOW,
  BITE_INFECT,
  createSim,
  FEVER_TICKS,
  infect,
  type Pawn,
  RISE_TICKS,
  SIATKA_POST,
  Sim,
  type SimState,
  STAY_YARD,
  spawnZombie,
} from '../../src/sim/sim.ts';
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

describe('ugryzienia, gorączka, wstawanie, dobijanie, amputacja', () => {
  const coreOf = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

  it('zakażony słabnie i umiera dokładnie po FEVER_TICKS, a po RISE_TICKS w miejscu zwłok wstaje szwendacz', () => {
    const { st, sim } = zombieSim(10, 2);
    const [p, q] = coreOf(st);
    const t0 = st.tick;
    infect(st, p, false);
    expect(p.bite).toBe(t0);
    runTo(sim, t0 + FEVER_TICKS / 2);
    expect(p.needs!.health).toBeLessThanOrEqual(51);
    expect(p.needs!.health).toBeGreaterThan(0);
    runTo(sim, t0 + FEVER_TICKS);
    expect(st.pawns.includes(p)).toBe(true);
    sim.step();
    expect(st.pawns.includes(p)).toBe(false);
    const d = st.dead!.at(-1)!;
    expect(d.cause).toBe('gorączka');
    expect(d.id).toBe(st.people[p.person].id);
    expect(q.moods.some((m) => m.why.startsWith('Śmierć'))).toBe(true);
    const body = st.things.find((t) => t.kind === 'zwloki')!;
    expect(body.fuel).toBe(t0 + FEVER_TICKS + RISE_TICKS);
    const z0 = zombies(st).length;
    runTo(sim, body.fuel);
    sim.step();
    expect(st.things.includes(body)).toBe(false);
    expect(zombies(st).length).toBe(z0 + 1);
    const nz = zombies(st).at(-1)!;
    expect(Math.floor(nz.x)).toBe(body.x);
    expect(Math.floor(nz.y)).toBe(body.y);
    expect(nz.look).toBe(p.look);
  });

  it('dobicie przed wstaniem: zwłoki już nie wstaną', () => {
    const { st, sim } = zombieSim(10, 2);
    const [p, q] = coreOf(st);
    infect(st, p, false);
    runTo(sim, st.tick + FEVER_TICKS + 1);
    const body = st.things.find((t) => t.kind === 'zwloki')!;
    expect(body.fuel).toBeGreaterThan(0);
    const menu = commandsAt(st, w, [q.id], body.y * size + body.x);
    expect(menu[0].cmd).toEqual({ t: 'finish', ids: [q.id], thing: body.id });
    sim.push(menu[0].cmd);
    const z0 = zombies(st).length;
    runTo(sim, st.tick + 600);
    expect(body.fuel).toBe(0);
    runTo(sim, st.tick + RISE_TICKS + 100);
    expect(st.things.includes(body)).toBe(true);
    expect(zombies(st).length).toBeLessThanOrEqual(z0);
  });

  it('amputacja w oknie: z med 2 bywa sukces (bez zakażenia, −35 zdrowia, kikut) i porażka (śmierć)', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12 && outcomes.size < 2; seed++) {
      const st = createSim(w, seed, { core: 2, mode: 'zombie' });
      st.tick = atHour(2, 10);
      const sim = new Sim(w, st);
      const [p, q] = coreOf(st);
      st.people[q.person].skills.med = 2;
      p.needs!.health = 80;
      infect(st, p, true);
      sim.push({ t: 'amputate', ids: [q.id], patient: p.id });
      runTo(sim, st.tick + 1500);
      if (st.pawns.includes(p)) {
        expect(p.bite).toBeUndefined();
        expect(p.maimed).toBe(true);
        expect(p.needs!.health).toBeLessThanOrEqual(45);
        expect(p.needs!.health).toBeGreaterThanOrEqual(10);
        outcomes.add('sukces');
      } else {
        expect(st.dead!.at(-1)!.cause).toBe('amputacja');
        outcomes.add('porażka');
      }
    }
    expect([...outcomes].sort()).toEqual(['porażka', 'sukces']);
  });

  it('amputacja po oknie albo przy ugryzieniu w tułów nic nie robi', () => {
    for (const late of [true, false]) {
      const { st, sim } = zombieSim(10, 2);
      const [p, q] = coreOf(st);
      infect(st, p, late);
      if (late) runTo(sim, st.tick + AMPUTATE_WINDOW + 10);
      sim.push({ t: 'amputate', ids: [q.id], patient: p.id });
      sim.step();
      expect(q.job?.t).not.toBe('amputate');
      expect(p.bite).toBeDefined();
    }
  });

  it('ugryzienie przy trafieniu zaraża w części przypadków (tylko w trybie zombie)', () => {
    const { st, sim } = zombieSim(10, 2);
    const victims = coreOf(st);
    // szwendacz tuż obok kogoś z zarządu na podwórku
    let bitten = 0;
    for (let k = 0; k < 40; k++) {
      const p = victims[0];
      if (!st.pawns.includes(p)) break;
      p.needs!.health = 100;
      delete p.bite;
      const spot = w.fence.yard.find((i) => sim.canWalk('core', i) && sim.canWalk('zombie', i))!;
      Object.assign(p, { x: (spot % size) + 0.5, y: Math.floor(spot / size) + 0.5, path: [], pi: 0, weapon: null });
      const z = spawnZombie(st, w, spot, 1);
      z.job!.phase = 3;
      z.job!.target = p.id;
      for (let s = 0; s < 40 && p.bite === undefined; s++) sim.step();
      if (p.bite !== undefined) bitten++;
      st.pawns = st.pawns.filter((x) => x !== z);
    }
    expect(bitten).toBeGreaterThan(0);
    expect(bitten).toBeLessThan(40);
    expect(BITE_INFECT).toBe(0.35);
  });
});

describe('praca za dnia i alarm', () => {
  const coreOf = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
  const heap = (st: SimState, kind: string) => st.things.filter((t) => t.kind === kind).reduce((a, t) => a + t.n, 0);

  it('dzida z 2 desek i 1 złomu: godzina pracy, potem w magazynie', () => {
    const { st, sim } = zombieSim(9, 2);
    const a = coreOf(st)[0];
    const deski = st.things.find((t) => t.kind === 'deski')!;
    const menu = commandsAt(st, w, [a.id], deski.y * size + deski.x);
    const craft = menu.find((m) => m.cmd.t === 'craft');
    expect(craft?.cmd).toEqual({ t: 'craft', ids: [a.id], item: 'dzida' });
    expect(craft?.label).toBe('Zrobić dzidę');
    const arms0 = st.store.arms!.filter((x) => x === 'dzida').length;
    const d0 = heap(st, 'deski');
    const z0 = heap(st, 'zlom');
    sim.push(craft!.cmd);
    runTo(sim, st.tick + TICKS_PER_HOUR + 600);
    expect(st.store.arms!.filter((x) => x === 'dzida').length).toBe(arms0 + 1);
    expect(heap(st, 'deski')).toBe(d0 - 2);
    expect(heap(st, 'zlom')).toBe(z0 - 1);
  });

  it('wzmocnienie siatki: 2 deski albo 2 złomu, +50 wytrzymałości', () => {
    const { st, sim } = zombieSim(9, 2);
    const a = coreOf(st)[0];
    const k = Math.floor(w.fence.tiles.length / 3);
    const tile = w.fence.tiles[k];
    sim.damageFence(tile, 60);
    expect(st.fence!.hp[k]).toBe(40);
    const brace = commandsAt(st, w, [a.id], tile).find((m) => m.cmd.t === 'brace');
    expect(brace?.cmd).toEqual({ t: 'brace', ids: [a.id], tile });
    expect(brace?.label).toBe('Wzmocnić siatkę');
    const m0 = heap(st, 'deski') + heap(st, 'zlom');
    sim.push(brace!.cmd);
    runTo(sim, st.tick + 2500);
    expect(st.fence!.hp[k]).toBe(90);
    expect(heap(st, 'deski') + heap(st, 'zlom')).toBe(m0 - 2);
    // cała siatka: nic do wzmocnienia
    const fresh = w.fence.tiles[k + 1];
    expect(commandsAt(st, w, [a.id], fresh).some((m) => m.cmd.t === 'brace')).toBe(false);
  });

  it('alarm: cały zdolny zarząd na wartę przy siatce (zombie) albo przy bramie (zwykły tryb)', () => {
    for (const mode of ['zombie', 'zwykly'] as const) {
      const st = createSim(w, 3, { core: 3, mode });
      const sim = new Sim(w, st);
      const all = coreOf(st);
      all[2].needs!.health = 20;
      sim.push({ t: 'alarm', ids: all.map((p) => p.id) });
      sim.step();
      expect(all[0].job?.t).toBe('guard');
      expect(all[1].job?.t).toBe('guard');
      expect(all[2].job?.t).not.toBe('guard');
      expect(all[0].job?.target).toBe(mode === 'zombie' ? SIATKA_POST : 0);
      expect(snapshot(st, w).people[0].post).toBe(mode === 'zombie' ? 'siatka' : 'brama');
    }
  });

  it('warta przy siatce przechodzi tam, gdzie napierają szwendacze', () => {
    const { st, sim } = zombieSim(23);
    const g = coreOf(st)[0];
    // gołe ręce nie sięgają przez siatkę: warta ich nie wybije, więc widać, gdzie stanie
    g.weapon = null;
    // kafelek siatki najdalej od bramy i kafelek tuż za nim po stronie ulicy
    const gx = w.fence.gate.x;
    const gy = w.fence.gate.y;
    const far = [...w.fence.tiles].sort(
      (a, b) =>
        Math.hypot((b % size) - gx, Math.floor(b / size) - gy) - Math.hypot((a % size) - gx, Math.floor(a / size) - gy),
    );
    let out = -1;
    for (const t of far) {
      out = [t - size, t + size, t - 1, t + 1].find((n) => !yard.has(n) && sim.canWalk('zombie', n)) ?? -1;
      if (out >= 0) break;
    }
    expect(out).toBeGreaterThanOrEqual(0);
    sim.push({ t: 'guard', ids: [g.id], post: 'siatka' });
    for (let k = 0; k < 3; k++) spawnZombie(st, w, out, k, true);
    runTo(sim, st.tick + 1200);
    const pressing = zombies(st).filter((z) => z.job?.phase === 2);
    expect(pressing.length).toBeGreaterThan(0);
    const d = Math.min(...pressing.map((z) => Math.hypot(z.x - g.x, z.y - g.y)));
    expect(d).toBeLessThanOrEqual(3);
    expect(g.job?.t).toBe('guard');
  });
});
