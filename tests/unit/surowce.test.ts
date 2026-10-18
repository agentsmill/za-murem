import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { commandFor, commandsAt, jobText } from '../../src/sim/orders.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import {
  RECIPES,
  WRECK_SEARCH_TICKS,
  WRECK_STRIP,
  WRECK_STRIP_TICKS,
  wreckAt,
  wreckLoot,
  wreckRng,
  wreckStripTicks,
  wrecksOf,
  wreckTile,
} from '../../src/sim/surowce.ts';
import type { Wreck } from '../../src/world/wrecks.ts';
import { mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const size = w.size;
const h = w.interior;
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const mat = (st: SimState, k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
const yard = new Set(w.fence.yard);
const inYard = (t: Thing) => yard.has(t.y * size + t.x);
const run = (sim: Sim, ok: () => boolean, max = 20000) => {
  let k = 0;
  for (; k < max && !ok(); k++) sim.step();
  return k;
};
/** wrak najbliżej bramy (najkrótsza droga w testach) */
const gx = w.fence.gate.x;
const gy = w.fence.gate.y;
const wrecks = wrecksOf(w).sort((a, b) => Math.hypot(a.x - gx, a.y - gy) - Math.hypot(b.x - gx, b.y - gy));
const near: Wreck = wrecks[0];
const nearTile = wreckTile(near, size);
/** gra o 9:00 dnia 2 (dzień, wypoczęci), zarząd syty i ciepły, żeby pilne potrzeby nie przerywały pracy */
const fresh = (seed = 3) => {
  const st = createSim(w, seed, { core: 2 });
  const sim = new Sim(w, st);
  for (const p of core(st)) {
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
  }
  // koza pali się do wieczora: nikt nie bierze drewna do kozy w trakcie testu
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 10 * TICKS_PER_HOUR;
  return sim;
};

describe('Surowce: tabele', () => {
  it('łup wraku z ziarna gry i kafelka: ten sam przy tych samych, zwykle inny przy innym kafelku', () => {
    const a = wreckLoot('polonez', wreckRng(3, 1234));
    expect(wreckLoot('polonez', wreckRng(3, 1234))).toEqual(a);
    const all = Array.from({ length: 200 }, (_, k) => wreckLoot('maluch', wreckRng(3, k)));
    expect(all.filter((l) => l.czesci).length).toBeGreaterThan(90);
    expect(all.filter((l) => l.czesci).length).toBeLessThan(150);
    for (const l of all) for (const v of Object.values(l)) expect(v).toBeGreaterThan(0);
  });

  it('wrak pod kafelkiem albo tuż obok, rozbiórka z łomem o połowę krócej', () => {
    expect(wreckAt(w, nearTile)).toBe(near);
    expect(wreckAt(w, (near.y - 1) * size + near.x)).toBe(near);
    expect(wreckAt(w, (near.y - 3) * size + near.x)).toBeUndefined();
    // tuż obok auta przeszukanie jest w menu, ale kliknięcie znaczy „idź”
    const st = createSim(w, 3, { core: 1 });
    const ids = core(st).map((p) => p.id);
    const beside = (near.y - 1) * size + near.x;
    expect(commandsAt(st, w, ids, beside).some((m) => m.cmd.t === 'wreck')).toBe(true);
    expect(commandFor(st, w, ids, beside)?.t).toBe('move');
    expect(wreckStripTicks('polonez', true)).toBe(WRECK_STRIP_TICKS.polonez / 2);
  });
});

describe('Surowce: wraki w grze', () => {
  it('bez poleceń stan nie ma pola wraki, a menu wraku daje przeszukanie jako domyślne', () => {
    const sim = fresh();
    for (let k = 0; k < 200; k++) sim.step();
    expect('wraki' in sim.st).toBe(false);
    const ids = core(sim.st).map((p) => p.id);
    const menu = commandsAt(sim.st, w, ids, nearTile);
    expect(menu[0].label).toBe(near.model === 'polonez' ? 'Przeszukać poloneza' : 'Przeszukać malucha');
    expect(commandFor(sim.st, w, ids, nearTile)).toEqual({ t: 'wreck', ids, tile: nearTile, how: 'szukaj' });
    expect(menu.some((m) => m.label.startsWith('Rozebrać'))).toBe(false);
  });

  it('przeszukanie: pół godziny przy wraku, łup z tabeli niesiony na podwórko, potem rozbiórka w menu', () => {
    const sim = fresh();
    const st = sim.st;
    const p = core(st)[0];
    const before = {
      czesci: mat(st, 'czesci'),
      zlom: mat(st, 'zlom'),
      leki: mat(st, 'leki'),
      jedzenie: mat(st, 'jedzenie'),
    };
    sim.push({ t: 'wreck', ids: [p.id], tile: nearTile, how: 'szukaj' });
    run(sim, () => p.job?.t === 'wreck' && p.job.phase === 1);
    expect(jobText(st, w, p)).toBe('Przeszukuje wrak.');
    const t0 = st.tick;
    run(sim, () => p.job?.t !== 'wreck');
    expect(st.tick - t0).toBeGreaterThanOrEqual(WRECK_SEARCH_TICKS - 1);
    expect(st.wraki).toEqual([{ t: nearTile, s: 1 }]);
    const loot = wreckLoot(near.model, wreckRng(st.seed, nearTile));
    // łup idzie na podwórko (kurs za kursem), aż przy wraku nic nie zostanie
    run(sim, () => !p.job);
    for (const [k, v] of Object.entries(loot)) expect(mat(st, k) - before[k as keyof typeof before]).toBe(v);
    const outside = st.things.filter((t) => ['czesci', 'zlom', 'leki'].includes(t.kind) && !inYard(t));
    const near3 = outside.filter((t) => Math.abs(t.x - near.x) <= near.w + 3 && Math.abs(t.y - near.y) <= near.h + 3);
    expect(near3).toEqual([]);
    const ids = [p.id];
    const menu = commandsAt(st, w, ids, nearTile).map((m) => m.label);
    expect(menu).toContain(near.model === 'polonez' ? 'Rozebrać poloneza' : 'Rozebrać malucha');
    expect(menu.some((l) => l.startsWith('Przeszukać'))).toBe(false);
    // drugi raz przeszukać się nie da
    sim.push({ t: 'wreck', ids, tile: nearTile, how: 'szukaj' });
    sim.step();
    expect(p.job?.t).not.toBe('wreck');
  });

  it('rozbiórka dopiero po przeszukaniu, hałasuje, z łomem krócej, daje złom i zostawia szkielet, który blokuje', () => {
    const sim = fresh();
    const st = sim.st;
    const p = core(st)[0];
    sim.push({ t: 'wreck', ids: [p.id], tile: nearTile, how: 'rozbierz' });
    sim.step();
    expect(p.job?.t).not.toBe('wreck');
    st.wraki = [{ t: nearTile, s: 1 }];
    p.weapon = 'lom';
    const zlom = mat(st, 'zlom');
    sim.push({ t: 'wreck', ids: [p.id], tile: nearTile, how: 'rozbierz' });
    run(sim, () => p.job?.t === 'wreck' && p.job.phase === 1);
    const t0 = st.tick;
    let noisy = false;
    run(sim, () => {
      if (st.noise!.some((n) => n.r >= 20)) noisy = true;
      return p.job?.t !== 'wreck';
    });
    expect(noisy).toBe(true);
    const took = st.tick - t0;
    expect(took).toBeGreaterThanOrEqual(WRECK_STRIP_TICKS[near.model] / 2 - 1);
    expect(took).toBeLessThan(WRECK_STRIP_TICKS[near.model]);
    expect(st.wraki).toEqual([{ t: nearTile, s: 2 }]);
    run(sim, () => !p.job);
    expect(mat(st, 'zlom') - zlom).toBe(WRECK_STRIP[near.model].zlom);
    expect(sim.blocked[nearTile]).toBe(1);
    expect(
      commandsAt(st, w, [p.id], nearTile).every((m) => !m.label.includes('poloneza') && !m.label.includes('malucha')),
    ).toBe(true);
  });

  it('przerwana rozbiórka idzie dalej od miejsca, w którym stanęła', () => {
    const sim = fresh();
    const st = sim.st;
    const p = core(st)[0];
    st.wraki = [{ t: nearTile, s: 1 }];
    sim.push({ t: 'wreck', ids: [p.id], tile: nearTile, how: 'rozbierz' });
    run(sim, () => p.job?.t === 'wreck' && p.job.phase === 1);
    for (let k = 0; k < TICKS_PER_HOUR; k++) sim.step();
    sim.push({ t: 'move', ids: [p.id], to: w.fence.yard[0] });
    sim.step();
    const done = st.wraki[0].w!;
    expect(done).toBeGreaterThanOrEqual(TICKS_PER_HOUR - 2);
    sim.push({ t: 'wreck', ids: [p.id], tile: nearTile, how: 'rozbierz' });
    run(sim, () => p.job?.t === 'wreck' && p.job.phase === 1);
    const t0 = st.tick;
    run(sim, () => p.job?.t !== 'wreck');
    expect(st.tick - t0).toBeLessThanOrEqual(WRECK_STRIP_TICKS[near.model] - done + 1);
    expect(st.wraki).toEqual([{ t: nearTile, s: 2 }]);
  });

  it('dwie osoby na jednym wraku: druga nie zaczyna', () => {
    const sim = fresh();
    const [a, b] = core(sim.st);
    sim.push({ t: 'wreck', ids: [a.id], tile: nearTile, how: 'szukaj' });
    sim.step();
    sim.push({ t: 'wreck', ids: [b.id], tile: nearTile, how: 'szukaj' });
    sim.step();
    expect(a.job?.t).toBe('wreck');
    expect(b.job?.t).not.toBe('wreck');
  });

  it('zapis i wczytanie w trakcie rozbiórki nie zmienia przebiegu', () => {
    const sim = fresh();
    const p = core(sim.st)[0];
    sim.st.wraki = [{ t: nearTile, s: 1 }];
    sim.push({ t: 'wreck', ids: [p.id], tile: nearTile, how: 'rozbierz' });
    run(sim, () => p.job?.t === 'wreck' && p.job.phase === 1);
    for (let k = 0; k < 300; k++) sim.step();
    const copy = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    for (let k = 0; k < 3 * TICKS_PER_HOUR; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});

describe('Surowce: noszenie łupu', () => {
  it('„Zanieść na podwórko” na stercie za siatką: wszystko z okolicy trafia na podwórko, z dala od bramy', () => {
    const sim = fresh();
    const st = sim.st;
    const p = core(st)[0];
    // dwie sterty przy wraku, 9 złomu i 2 części
    const put = (kind: string, x: number, y: number, n: number) =>
      st.things.push({ id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 });
    put('zlom', near.x, near.y - 1, 9);
    put('czesci', near.x + 1, near.y - 1, 2);
    const heap = st.things[st.things.length - 2];
    const ids = [p.id];
    const menu = commandsAt(st, w, ids, heap.y * size + heap.x);
    const item = menu.find((m) => m.cmd.t === 'carry');
    expect(item).toEqual({ cmd: { t: 'carry', ids, thing: heap.id }, label: 'Zanieść na podwórko', quick: true });
    expect(commandFor(st, w, ids, heap.y * size + heap.x)).toEqual(item!.cmd);
    const zlom = mat(st, 'zlom');
    sim.push(item!.cmd);
    run(sim, () => p.job?.t === 'carry' && p.job.phase === 1);
    expect(p.job!.n).toBe(6);
    expect(jobText(st, w, p)).toBe('Niesie łup na podwórko.');
    run(sim, () => !p.job);
    expect(mat(st, 'zlom')).toBe(zlom);
    const out = st.things.filter((t) => (t.kind === 'zlom' || t.kind === 'czesci') && !inYard(t));
    expect(out.filter((t) => Math.abs(t.y - near.y) < 4 && Math.abs(t.x - near.x) < 6)).toEqual([]);
    const gate = new Set<number>();
    for (let y = gy - 1; y <= gy + w.fence.gate.h; y++)
      for (let x = gx - 1; x <= gx + w.fence.gate.w; x++) gate.add(y * size + x);
    for (const t of st.things.filter((q) => q.kind === 'czesci')) expect(gate.has(t.y * size + t.x)).toBe(false);
  });

  it('na podwórku nie ma „Zanieść na podwórko”', () => {
    const sim = fresh();
    const st = sim.st;
    const i = w.fence.yard.find((k) => !st.things.some((t) => t.x === k % size && t.y === Math.floor(k / size)))!;
    st.things.push({
      id: st.nextThing++,
      kind: 'czesci',
      x: i % size,
      y: Math.floor(i / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 2,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    const labels = commandsAt(st, w, [core(st)[0].id], i).map((m) => m.label);
    expect(labels).not.toContain('Zanieść na podwórko');
  });
});

describe('Surowce: warsztat', () => {
  /** warsztat w pokoju zarządu i drewno albo złom na podwórku */
  const withWorkshop = (sim: Sim, kind: string, n: number) => {
    const st = sim.st;
    const room = h.rooms.find((r) => r.apt === 0 && r.kind === 'pokoj')!.id;
    let at = -1;
    for (let i = 0; i < size * size && at < 0; i++)
      if (
        h.room[i] === room &&
        h.room[i + 1] === room &&
        !w.blocked[i] &&
        !w.blocked[i + 1] &&
        !st.things.some((t) =>
          [i, i + 1].some(
            (k) =>
              k % size >= t.x &&
              k % size < t.x + t.w &&
              Math.floor(k / size) >= t.y &&
              Math.floor(k / size) < t.y + t.h,
          ),
        )
      )
        at = i;
    const ws: Thing = {
      id: st.nextThing++,
      kind: 'warsztat',
      x: at % size,
      y: Math.floor(at / size),
      w: 2,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    st.things.push(ws);
    const free = w.fence.yard.filter((k) => !st.things.some((t) => t.x === k % size && t.y === Math.floor(k / size)));
    for (let left = n, k = 0; left > 0; k++) {
      const i = free[k];
      st.things.push({
        id: st.nextThing++,
        kind,
        x: i % size,
        y: Math.floor(i / size),
        w: 1,
        h: 1,
        rot: 0,
        n: Math.min(10, left),
        fuel: 0,
        by: -1,
        owner: -1,
      });
      left -= 10;
    }
    return ws;
  };

  it('menu warsztatu: deska i kilka desek z drewna, części ze złomu tylko przy materiale', () => {
    const sim = fresh();
    const st = sim.st;
    for (const t of st.things.filter((q) => q.kind === 'zlom')) t.n = 0;
    st.things = st.things.filter((t) => !(t.kind === 'zlom' && t.n <= 0));
    const ws = withWorkshop(sim, 'drewno', 7);
    const ids = [core(st)[0].id];
    const labels = commandsAt(st, w, ids, ws.y * size + ws.x).map((m) => m.label);
    expect(labels).toContain('Piłować deskę z drewna');
    expect(labels).toContain('Piłować 3 deski');
    expect(labels.some((l) => l.includes('złomu'))).toBe(false);
  });

  it('piłowanie: 2 drewna na deskę, 20 minut za sztukę, deski obok warsztatu; bez drewna praca się kończy', () => {
    const sim = fresh();
    const st = sim.st;
    const ws = withWorkshop(sim, 'drewno', 5);
    const p = core(st)[0];
    const wood = mat(st, 'drewno');
    const boards = mat(st, 'deski');
    sim.push({ t: 'saw', ids: [p.id], what: 'deski', n: 5 });
    run(sim, () => p.job?.t === 'saw' && p.job.phase === 1);
    expect(jobText(st, w, p)).toBe('Piłuje deski (jeszcze 5).');
    const t0 = st.tick;
    run(sim, () => p.job?.t !== 'saw');
    // drewna starczyło na dwie deski (5 sztuk: 2 + 2, jedna zostaje)
    expect(mat(st, 'deski') - boards).toBe(2);
    expect(wood - mat(st, 'drewno')).toBe(4);
    expect(st.tick - t0).toBeGreaterThanOrEqual(2 * RECIPES.deski.work - 1);
    expect(ws.by).toBe(-1);
  });

  it('przerwana przeróbka nic nie zjada', () => {
    const sim = fresh();
    const st = sim.st;
    withWorkshop(sim, 'zlom', 4);
    const p = core(st)[0];
    const zlom = mat(st, 'zlom');
    sim.push({ t: 'saw', ids: [p.id], what: 'czesci', n: 1 });
    run(sim, () => p.job?.t === 'saw' && p.job.phase === 1);
    for (let k = 0; k < RECIPES.czesci.work / 2; k++) sim.step();
    sim.push({ t: 'move', ids: [p.id], to: w.fence.yard[0] });
    sim.step();
    expect(mat(st, 'zlom')).toBe(zlom);
    expect(mat(st, 'czesci')).toBe(0);
  });
});
