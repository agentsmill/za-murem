/* Styk fali 1 M2 z trybem zombie (przegląd połączenia w pelna-gra, 18.10.2026): zasieki niszczone przez napór,
   lek ze sterty przy amputacji, odsypianie po warcie i budowa przy szwendaczu na podwórku, krew pod planem budowy,
   wydarzenia ulicy i cel drugiego dnia w trybie zombie, poza wzmacniania siatki. Każdy test padał przed poprawką. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { fitsMode } from '../../src/gov/wydarzenia.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { type PawnLike, poseOf } from '../../src/render/poses.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { applyGov } from '../../src/sim/gov.ts';
import { createSim, infect, type Pawn, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { goalsDay2 } from '../../src/ui/cele.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const world = (seed = 1): World => buildWorld(demo.geo, { seed, street: demo.street });

/** gra w trybie zombie do dnia day, godziny hour (start o 15:00 pierwszego dnia) */
function play(seed: number, day: number, hour: number): { w: World; st: SimState; sim: Sim } {
  const w = world(seed);
  const st = createSim(w, seed, { core: 4, mode: 'zombie' });
  const sim = new Sim(w, st);
  const end = ((day - 1) * 24 + hour - 15) * TICKS_PER_HOUR;
  while (st.tick < end) sim.step();
  return { w, st, sim };
}

const sumOf = (st: SimState, kind: string) => st.things.filter((t) => t.kind === kind).reduce((a, t) => a + t.n, 0);

const heap = (st: SimState, kind: string, tile: number, size: number, n: number) =>
  st.things.push({
    id: st.nextThing++,
    kind,
    x: tile % size,
    y: Math.floor(tile / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  });

describe('styk M2 i trybu zombie', () => {
  it('zasieki, pod którymi napór zbił siatkę do zera, znikają bez zwrotu materiału, a w ich miejscu jest dziura', () => {
    const { w, st, sim } = play(1, 2, 9);
    const size = w.size;
    const f = w.fence!;
    const hole = new Set(f.hole);
    const tile = f.tiles.find(
      (t) => !hole.has(t) && canPlace(st, w, 'zasieki', t % size, Math.floor(t / size), 0).ok,
    ) as number;
    const near = (i: number) => Math.hypot((i % size) - (tile % size), Math.floor(i / size) - Math.floor(tile / size));
    const yard = f.yard.filter((i) => !w.blocked[i]).sort((a, b) => near(a) - near(b));
    heap(st, 'zlom', yard[3], size, 12);
    const core = st.pawns.find((p) => p.kind === 'core')!;
    // ciepło i jedzenie w porządku: zimny zarząd (koza wygasa) miałby pracę przerywaną pilną potrzebą, a dalej budowałby
    // sam tylko w pętli „start, przerwanie” (przy szwendaczu bliżej niż 10 m zarząd bez polecenia przy siatce nie buduje)
    for (const q of st.pawns) if (q.kind === 'core') Object.assign(q.needs!, { warm: 90, food: 90, rest: 90 });
    sim.push({ t: 'build', ids: [core.id], kind: 'zasieki', x: tile % size, y: Math.floor(tile / size), rot: 0 });
    const t0 = st.tick;
    while (st.tick < t0 + 4 * TICKS_PER_HOUR && !st.things.some((t) => t.kind === 'zasieki')) sim.step();
    expect(st.things.some((t) => t.kind === 'zasieki')).toBe(true);
    const scrap = sumOf(st, 'zlom');
    sim.damageFence(tile, 1000);
    expect(st.things.some((t) => t.kind === 'zasieki')).toBe(false);
    expect(st.fence!.holes.some((h) => h.tiles.includes(tile))).toBe(true);
    expect(sim.canWalk('zombie', tile)).toBe(true);
    expect(sumOf(st, 'zlom')).toBe(scrap);
  });

  it('amputacja bierze lek ze sterty leków na mapie, kiedy zapas zarządu jest pusty', () => {
    const { w, st, sim } = play(1, 2, 10);
    const fx = emptyEffects();
    fx.stock.meds = 2;
    applyGov(st, w, fx);
    expect(st.store.meds).toBe(0);
    expect(sumOf(st, 'leki')).toBe(2);
    const [q, doc] = st.pawns.filter((p) => p.kind === 'core');
    infect(st, q, true);
    sim.push({ t: 'amputate', ids: [doc.id], patient: q.id });
    sim.step();
    expect(doc.job?.t).toBe('amputate');
    const t0 = st.tick;
    while (st.tick < t0 + 2 * TICKS_PER_HOUR && doc.job?.t === 'amputate') sim.step();
    expect(doc.job?.t).not.toBe('amputate');
    expect(sumOf(st, 'leki')).toBe(1);
  });

  it('odsypiający po warcie idzie spać także przy szwendaczu na podwórku', () => {
    const { w, st, sim } = play(1, 3, 7);
    for (const p of st.pawns) if (p.kind === 'core') p.weapon = null;
    const q = st.pawns.find((p) => p.kind === 'core')!;
    q.nap = true;
    q.needs!.rest = 40;
    q.needs!.food = 90;
    q.job = null;
    q.path = [];
    q.pi = 0;
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    for (const h of st.fence!.holes) h.patch = 100;
    st.fence!.hp = st.fence!.hp.map(() => 100);
    sim.push({ t: 'mend', ids: [], n: 0 });
    const yard = w.fence!.yard.filter((i) => !w.blocked[i]);
    spawnZombie(st, w, yard[Math.floor(yard.length / 2)], 2, false);
    let slept = false;
    const end = st.tick + TICKS_PER_HOUR;
    while (st.tick < end && !slept) {
      sim.step();
      // q.job wyzerowane wyżej: bez rzutowania TypeScript zawęża je do null
      slept = (q.job as Pawn['job'])?.t === 'sleep';
    }
    expect(slept).toBe(true);
  });

  it('budowa, do której zarząd wziął się sam, ustępuje szwendaczowi na podwórku', () => {
    const { w, st, sim } = play(1, 2, 9);
    const size = w.size;
    const yard = w.fence!.yard;
    // plan dalej niż 4 kafelki od siatki: przy siatce zarząd bez polecenia nie buduje, gdy szwendacz jest bliżej niż 10 m
    const odSiatki = (i: number) =>
      w.fence!.tiles.every(
        (t) => Math.max(Math.abs((t % size) - (i % size)), Math.abs(Math.floor(t / size) - Math.floor(i / size))) > 4,
      );
    const spot = yard.find(
      (i) => odSiatki(i) && canPlace(st, w, 'ogrodek', i % size, Math.floor(i / size), 0).ok,
    ) as number;
    const sx = spot % size;
    const sy = Math.floor(spot / size);
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: sx, y: sy, rot: 0 });
    const d = (i: number) => Math.hypot((i % size) - sx, Math.floor(i / size) - sy);
    const at = yard.filter((i) => !w.blocked[i] && d(i) > 4).sort((a, b) => d(a) - d(b))[0];
    heap(st, 'deski', at, size, 14);
    for (const p of st.pawns) if (p.kind === 'core') p.weapon = null;
    let builder = st.pawns.find((p) => p.job?.t === 'build');
    const t0 = st.tick;
    while (st.tick < t0 + 2 * TICKS_PER_HOUR && !builder) {
      sim.step();
      builder = st.pawns.find((p) => p.job?.t === 'build');
    }
    expect(builder?.job?.order).toBe(false);
    const b = builder!;
    const far = yard.filter((i) => {
      const dist = Math.hypot((i % size) + 0.5 - b.x, Math.floor(i / size) + 0.5 - b.y);
      return !w.blocked[i] && dist > 8 && dist < 12;
    });
    spawnZombie(st, w, far[0] ?? yard[yard.length - 1], 2, false);
    let stopped = false;
    const t1 = st.tick;
    while (st.tick < t1 + TICKS_PER_HOUR / 6 && !stopped) {
      sim.step();
      stopped = b.job?.t !== 'build';
    }
    expect(stopped).toBe(true);
  });

  it('krew, trupy i zwłoki nie blokują planu budowy, tak jak nie blokują ogniska', () => {
    const w = world(1);
    const size = w.size;
    const st = createSim(w, 1, { core: 4, mode: 'zombie' });
    const at = w.fence!.yard.find((i) => canPlace(st, w, 'ogrodek', i % size, Math.floor(i / size), 0).ok) as number;
    for (const kind of ['krew', 'trup', 'zwloki']) {
      heap(st, kind, at, size, 0);
      expect(canPlace(st, w, 'ogrodek', at % size, Math.floor(at / size), 0), kind).toEqual({ ok: true });
      st.things.pop();
    }
    heap(st, 'deski', at, size, 3);
    expect(canPlace(st, w, 'ogrodek', at % size, Math.floor(at / size), 0).ok).toBe(false);
  });

  it('w trybie zombie nie ma wydarzeń ulicy (żywi sąsiedzi, wyjścia bez ryzyka), w zwykłym są', () => {
    for (const id of ['jablka', 'kury', 'kosiarka', 'szopa', 'plot', 'panele', 'przychodnia']) {
      expect(fitsMode({ mode: 'zombie' }, id), id).toBe(false);
      expect(fitsMode({ mode: 'zwykly' }, id), id).toBe(true);
    }
    expect(fitsMode({ mode: 'zombie' }, 'wedrowiec')).toBe(true);
  });

  it('cel drugiego dnia w trybie zombie to dzida dla warty, a w zwykłym obwód', () => {
    const w = world(1);
    const o = { touch: false, wood: 0, woodReady: false, holes: 0 };
    const z = createSim(w, 1, { core: 4, mode: 'zombie' });
    const keys = (st: SimState, mode: 'zombie' | 'zwykly') => goalsDay2(st, newGov(1, mode), o).map((g) => g.key);
    expect(keys(z, 'zombie')).toContain('dzida');
    expect(keys(z, 'zombie')).not.toContain('obwod');
    const goal = () => goalsDay2(z, newGov(1, 'zombie'), o).find((g) => g.key === 'dzida')!;
    expect(goal().done).toBe(false);
    z.store.arms!.push('dzida');
    expect(goal().done).toBe(true);
    const n = createSim(w, 1, { core: 4 });
    expect(keys(n, 'zwykly')).toContain('obwod');
  });

  it('wzmacnianie siatki ma materiał w rękach w drodze i młotek przy siatce', () => {
    const pawn = (phase: number, moving: boolean): PawnLike => ({
      id: 1,
      kind: 'core',
      x: 10.5,
      y: 10.5,
      dir: 0,
      walk: 1,
      pi: 0,
      path: { length: moving ? 3 : 0 },
      carry: 0,
      job: { t: 'brace', phase, target: 100, n: 2, what: 'deski' },
    });
    expect(poseOf(pawn(0, true), 1, []).pose).toBe('planks');
    expect(poseOf(pawn(2, false), 1, []).pose).toBe('hammer');
  });
});
