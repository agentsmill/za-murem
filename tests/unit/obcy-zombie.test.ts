import { describe, expect, it } from 'vitest';
import { dayOf, hourOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { tickAt, WAIT_ZOMBIE } from '../../src/sim/handlarz.ts';
import { createSim, type Pawn, Sim, type SimState } from '../../src/sim/sim.ts';
import { wreckStage } from '../../src/sim/surowce.ts';
import { PAUSE_ZOMBIE_MAX } from '../../src/sim/wedrowcy.ts';
import { mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const size = w.size;
const FAR = tickAt(30, 10);
const kind = (st: SimState, k: string): Pawn[] => st.pawns.filter((p) => p.kind === k);
const run = (sim: Sim, ok: () => boolean, max = 20000) => {
  let k = 0;
  for (; k < max && !ok(); k++) sim.step();
  return k;
};
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
/** przewijanie bez szwendaczy, które tryb zombie sam stawia za dnia (przygotowanie sceny w teście) */
const calm = (sim: Sim, ok: () => boolean, max = 20000) =>
  run(
    sim,
    () => {
      sim.st.pawns = sim.st.pawns.filter((p) => p.kind !== 'zombie');
      return ok();
    },
    max,
  );
/** tryb zombie z obcymi, o danej porze; tylko who przychodzi teraz; bez szwendaczy na mapie (dokłada je test) */
const game = (day: number, hour: number, who: 'handlarz' | 'wedrowiec' | 'obcy', seed = 3) => {
  const st = createSim(w, seed, { core: 2, mode: 'zombie', obcy: true });
  const sim = new Sim(w, st);
  st.tick = tickAt(day, hour);
  st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  const o = st.obcy!;
  o.next = who === 'handlarz' ? st.tick : FAR;
  o.wnext = who === 'wedrowiec' ? st.tick : FAR;
  o.enext = who === 'obcy' ? st.tick : FAR;
  for (const p of kind(st, 'core')) {
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
  }
  return sim;
};
const gateOut = () => {
  const g = w.fence.gate;
  return (g.y + g.h) * size + g.x;
};

describe('Tryb zombie: handlarz rzadko i na chwilę, jak w The Walking Dead', () => {
  it('z opcją: handlarz czwartego dnia, ocaleni od drugiego, ekipy od trzeciego do piątego', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie', obcy: true });
    expect(dayOf(st.obcy!.next)).toBe(4);
    expect(dayOf(st.obcy!.wnext!)).toBe(2);
    expect(dayOf(st.obcy!.enext!)).toBeGreaterThanOrEqual(3);
    expect(dayOf(st.obcy!.enext!)).toBeLessThanOrEqual(5);
  });

  it('część wizyt nie dochodzi do skutku, a ta, która dochodzi, trwa najwyżej 45 minut; następna za 5–7 dni', () => {
    let came = 0;
    let none = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = game(4, 10, 'handlarz', seed);
      const st = sim.st;
      sim.step();
      if (!kind(st, 'handlarz').length) {
        none++;
        expect(dayOf(st.obcy!.next) - 4).toBeGreaterThanOrEqual(5);
        continue;
      }
      came++;
      const t = kind(st, 'handlarz')[0];
      calm(sim, () => t.job?.phase === 1);
      const t0 = st.tick;
      calm(sim, () => t.job?.phase !== 1);
      expect(st.tick - t0).toBeLessThanOrEqual(WAIT_ZOMBIE + 1);
      calm(sim, () => !kind(st, 'handlarz').length);
      expect(dayOf(st.obcy!.next) - 4).toBeGreaterThanOrEqual(5);
      expect(dayOf(st.obcy!.next) - 4).toBeLessThanOrEqual(8);
    }
    expect(came).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(0);
  });

  it('szwendacze przy bramie: handlarz przychodzi później; szwendacz podchodzi w czasie wizyty: odchodzi z wózkiem', () => {
    const sim = game(4, 10, 'handlarz');
    const st = sim.st;
    sim.spawnAtFence(3, gateOut());
    const next = st.obcy!.next;
    sim.step();
    expect(kind(st, 'handlarz')).toHaveLength(0);
    expect(st.obcy!.next).toBeGreaterThan(next);
    // bez szwendaczy, do skutku (pierwsze ziarno, na którym handlarz przychodzi)
    for (let seed = 1; seed <= 12; seed++) {
      const s2 = game(4, 10, 'handlarz', seed);
      s2.step();
      const t = kind(s2.st, 'handlarz')[0];
      if (!t) continue;
      calm(s2, () => t.job?.phase === 1);
      s2.spawnAtFence(4, tileOf(t));
      run(s2, () => t.job?.phase !== 1, TICKS_PER_HOUR);
      expect(t.job?.phase).toBe(2);
      expect(s2.st.things.some((q) => q.kind === 'wozek')).toBe(false);
      expect(s2.st.obcy!.wiesc?.text).toBe('Handlarz odszedł, bo pod bramę podeszły szwendacze.');
      return;
    }
    throw new Error('na żadnym ziarnie handlarz nie przyszedł');
  });

  it('zagryziony handlarz zostawia pod bramą wózek z towarem', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = game(4, 10, 'handlarz', seed);
      sim.step();
      const t = kind(sim.st, 'handlarz')[0];
      if (!t) continue;
      calm(sim, () => t.job?.phase === 1);
      const goods = sim.st.obcy!.offers.reduce(
        (a, o) => a + Object.values(o.give).reduce((x, n) => x + n * o.left, 0),
        0,
      );
      const before = sim.st.things.reduce(
        (a, q) => a + (['deski', 'zlom', 'czesci', 'jedzenie', 'leki'].includes(q.kind) ? q.n : 0),
        0,
      );
      (sim as unknown as { traderKilled(p: Pawn, by: Pawn | null): void }).traderKilled(t, { kind: 'zombie' } as Pawn);
      const after = sim.st.things.reduce(
        (a, q) => a + (['deski', 'zlom', 'czesci', 'jedzenie', 'leki'].includes(q.kind) ? q.n : 0),
        0,
      );
      expect(after - before).toBe(goods);
      expect(sim.st.obcy!.wiesc?.text).toBe('Szwendacze dopadły handlarza pod bramą. Jego wózek został.');
      return;
    }
    throw new Error('na żadnym ziarnie handlarz nie przyszedł');
  });
});

describe('Tryb zombie: ocaleni i ekipy', () => {
  it('ocalały przystaje przy siatce tylko na chwilę, a przed szwendaczem ucieka', () => {
    const sim = game(2, 10, 'wedrowiec');
    const st = sim.st;
    sim.step();
    const p = kind(st, 'wedrowiec')[0];
    expect(p).toBeDefined();
    calm(sim, () => p.job?.phase === 1);
    expect(p.job!.until - st.tick).toBeLessThanOrEqual(PAUSE_ZOMBIE_MAX);
    sim.spawnAtFence(3, tileOf(p));
    run(sim, () => (p.job?.phase ?? 4) >= 3, TICKS_PER_HOUR);
    expect(p.job?.phase).toBe(3);
  });

  it('wieść od ocalałego jest w klimacie trybu zombie', () => {
    const sim = game(2, 10, 'wedrowiec');
    const st = sim.st;
    sim.step();
    const t = kind(st, 'wedrowiec')[0];
    calm(sim, () => t.job?.phase === 1);
    const p = kind(st, 'core')[0];
    sim.push({ t: 'talk', ids: [p.id], target: t.id });
    calm(sim, () => !!st.obcy!.wiesc, TICKS_PER_HOUR);
    expect(st.obcy!.wiesc?.text.startsWith('Ocalały mówi')).toBe(true);
  });

  it('ekipa przy wraku ucieka przed szwendaczami, wrak zostaje nieprzeszukany', () => {
    const sim = game(3, 10, 'obcy');
    const st = sim.st;
    sim.step();
    const crew = kind(st, 'obcy');
    expect(crew).toHaveLength(2);
    const t = crew[0].job!.target;
    calm(sim, () => crew.every((q) => q.job?.phase === 1));
    sim.spawnAtFence(4, tileOf(crew[0]));
    run(sim, () => crew.every((q) => (q.job?.phase ?? 4) >= 3), TICKS_PER_HOUR);
    expect(crew.every((q) => (q.job?.phase ?? 4) >= 3)).toBe(true);
    expect(wreckStage(st.wraki, t)).toBe(0);
    expect(hourOf(st.tick)).toBeLessThan(14);
  });
});
