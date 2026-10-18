/* Poprawki z przeglądu gałęzi trybu zombie: walka przez siatkę bez wychodzenia na ulicę, odruchowe dobijanie po swojej
   stronie, ugryziony na wyprawie, ?stado=N, łup zabitego szabrownika, dzida przerwana w trakcie. */

import { describe, expect, it } from 'vitest';
import { makeCard } from '../../src/gov/noc.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, FEVER_TICKS, infect, type Pawn, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';
import { pl } from './po-angielsku.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
const coreOf = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const inside = (t: number) => yard.has(t) || w.interior.room[t] >= 0 || w.interior.doors.includes(t);
const runTo = (sim: Sim, tick: number, each?: () => void) => {
  while (sim.st.tick < tick) {
    sim.step();
    each?.();
  }
};

/** kafelki tuż za siatką (po stronie ulicy), przechodnie dla szwendaczy */
function outsideSpots(sim: Sim): number[] {
  const out: number[] = [];
  for (const t of w.fence.tiles)
    for (const n of [t - size, t + size, t - 1, t + 1])
      if (!yard.has(n) && !inside(n) && sim.canWalk('zombie', n) && !out.includes(n)) out.push(n);
  return out;
}

describe('poprawki z przeglądu', () => {
  it('atak na szwendacza za siatką: nikt nie wychodzi za siatkę, dzida bije z podwórka, bez niej ataku w menu nie ma', () => {
    for (const weapon of ['dzida', 'lom'] as const)
      for (const spot of outsideSpots(new Sim(w, createSim(w, 3, { core: 2, mode: 'zombie' }))).filter(
        (_, k) => k % 7 === 3,
      )) {
        const st = createSim(w, 3, { core: 2, mode: 'zombie' });
        st.tick = atHour(2, 10);
        const sim = new Sim(w, st);
        const a = coreOf(st)[0];
        a.weapon = weapon;
        coreOf(st)[1].weapon = null;
        const z = spawnZombie(st, w, spot, 3);
        z.job!.phase = 2;
        const menu = commandsAt(st, w, [a.id], spot);
        const attack = menu.find((m) => m.cmd.t === 'attack');
        if (weapon === 'lom') {
          expect(attack, `łom ${spot}`).toBeUndefined();
          continue;
        }
        expect(attack, `dzida ${spot}`).toBeTruthy();
        sim.push(attack!.cmd);
        let left = false;
        runTo(sim, st.tick + 1200, () => {
          if (st.pawns.includes(a) && !inside(tileOf(a))) left = true;
        });
        expect(left, `dzida ${spot}`).toBe(false);
      }
  });

  it('uzbrojony nie wychodzi za siatkę dobijać zwłok po drugiej stronie, a kto zostanie za siatką bez zajęcia, wraca', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(2, 10);
    const sim = new Sim(w, st);
    const [p, q] = coreOf(st);
    q.weapon = 'noz';
    // zwłoki tuż za siatką
    const spot = outsideSpots(sim)[0];
    st.things.push({
      id: st.nextThing++,
      kind: 'zwloki',
      x: spot % size,
      y: Math.floor(spot / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 2,
      fuel: st.tick + 5000,
      by: -1,
      owner: -1,
    });
    // q stoi na podwórku przy siatce, kilka metrów od zwłok, syty i wyspany
    const near = w.fence.yard.find((i) => {
      const d = Math.hypot((i % size) - (spot % size), Math.floor(i / size) - Math.floor(spot / size));
      return sim.canWalk('core', i) && d >= 2 && d <= 4;
    })!;
    Object.assign(q, { x: (near % size) + 0.5, y: Math.floor(near / size) + 0.5, path: [], pi: 0, job: null, wait: 0 });
    Object.assign(q.needs!, { food: 95, warm: 95, rest: 95 });
    Object.assign(p.needs!, { food: 95, warm: 95, rest: 95 });
    let left = false;
    runTo(sim, st.tick + 1500, () => {
      if (!inside(tileOf(q))) left = true;
    });
    expect(left).toBe(false);
    // ktoś z zarządu bez zajęcia za siatką wraca na podwórko
    Object.assign(p, { x: (spot % size) + 0.5, y: Math.floor(spot / size) + 0.5, path: [], pi: 0, job: null, wait: 0 });
    runTo(sim, st.tick + 1500);
    expect(inside(tileOf(p))).toBe(true);
  });

  it('ugryziony na wyprawie choruje dalej i umiera tam, bez zwłok przy bramie; karta nie wysyła ugryzionych', () => {
    const st = createSim(w, 3, { core: 3, mode: 'zombie' });
    st.tick = atHour(2, 10);
    const sim = new Sim(w, st);
    const [p] = coreOf(st);
    infect(st, p, false);
    sim.push({ t: 'away', ids: [p.id] });
    runTo(sim, st.tick + 1500);
    expect(p.away).toBe(true);
    const card = makeCard(newGov(3, 'zombie'), govInput(st, w, 0)).card;
    const opts = card.people.find((c) => c.id === st.people[p.person].id)!.options;
    for (const o of opts.filter((x) => x.key.startsWith('wyprawa:'))) {
      expect(o.ok).toBe(false);
      expect(pl(o.why)).toMatch(/ugryzion/i);
    }
    runTo(sim, p.bite! + FEVER_TICKS + 10);
    expect(st.pawns.includes(p)).toBe(false);
    expect(st.dead!.at(-1)).toMatchObject({ id: st.people[p.person].id, cause: 'gorączka' });
    expect(st.things.some((t) => t.kind === 'zwloki')).toBe(false);
  });

  it('?stado=N: spawnAtFence stawia dokładnie N szwendaczy (do limitu 80)', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    const sim = new Sim(w, st);
    expect(sim.spawnAtFence(60, 0)).toBe(60);
    expect(st.pawns.filter((p) => p.kind === 'zombie')).toHaveLength(60);
    expect(sim.spawnAtFence(60, 0)).toBe(20);
  });

  it('zabity szabrownik zostawia łup takim, jaki był (drewno i jedzenie osobno), i nie liczy się już jako skradziony', () => {
    let checked = 0;
    for (const seed of [2, 5, 7]) {
      const st = createSim(w, seed, { core: 2 });
      st.tick = atHour(1, 22);
      const sim = new Sim(w, st);
      const hole = st.fence!.holes[0];
      // drewno luzem na podwórku i jedzenie w kuchni
      const loose = w.fence.yard.find((i, k) => k > 30 && !w.blocked[i])!;
      st.things.push({
        id: st.nextThing++,
        kind: 'drewno',
        x: loose % size,
        y: Math.floor(loose / size),
        w: 1,
        h: 1,
        rot: 0,
        n: 3,
        fuel: 0,
        by: -1,
        owner: -1,
      });
      sim.push({ t: 'raid', ids: [], at: atHour(1, 23), post: `d${hole.id}` });
      let thief: Pawn | undefined;
      while (!thief && st.tick < atHour(2, 3)) {
        sim.step();
        thief = st.pawns.find((p) => p.kind === 'szabrownik' && (p.sack?.wood ?? 0) > 0 && (p.sack?.supplies ?? 0) > 0);
      }
      if (!thief) continue;
      checked++;
      const sack = { ...thief.sack! };
      const took = { ...st.raid!.took };
      const sum = (k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
      const wood0 = sum('drewno');
      const food0 = sum('jedzenie');
      sim.wound(thief, 1000);
      sim.step();
      expect(sum('drewno') - wood0).toBe(sack.wood);
      expect(sum('jedzenie') - food0).toBe(sack.supplies);
      expect(st.raid!.took.wood).toBe(took.wood - (sack.wood ?? 0));
      expect(st.raid!.took.supplies).toBe(took.supplies - (sack.supplies ?? 0));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('przerwane robienie dzidy nie zjada materiału; bez złomu deski zostają', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(2, 9);
    const sim = new Sim(w, st);
    const a = coreOf(st)[0];
    const sum = (k: string) => st.things.filter((t) => t.kind === k).reduce((acc, t) => acc + t.n, 0);
    const d0 = sum('deski');
    const z0 = sum('zlom');
    const heap = st.things.find((t) => t.kind === 'deski')!;
    sim.push(commandsAt(st, w, [a.id], heap.y * size + heap.x).find((m) => m.cmd.t === 'craft')!.cmd);
    runTo(sim, st.tick + 600, () => {
      if (a.job?.t === 'craft' && a.job.phase === 1 && st.tick % 40 === 0)
        sim.push({ t: 'alarm', ids: coreOf(st).map((p) => p.id) });
    });
    expect(a.job?.t).not.toBe('craft');
    expect(sum('deski')).toBe(d0);
    expect(sum('zlom')).toBe(z0);
    // bez złomu: dzidy się nie zaczyna, deski zostają
    st.things = st.things.filter((t) => t.kind !== 'zlom');
    const b = coreOf(st)[1];
    b.job = null;
    sim.push({ t: 'craft', ids: [b.id], item: 'dzida' });
    runTo(sim, st.tick + 1500);
    expect(sum('deski')).toBe(d0);
  });
});
