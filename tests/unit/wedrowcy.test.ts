import { describe, expect, it } from 'vitest';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { dayOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { createSim, type Pawn, Sim, type SimState } from '../../src/sim/sim.ts';
import { wreckStage } from '../../src/sim/surowce.ts';
import { CREW_SEARCH_TICKS } from '../../src/sim/wedrowcy.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { pl } from './po-angielsku.ts';
import { wylaczAutomat } from './praca-pomoc.ts';

const w = mockBlockM2();
const size = w.size;
const yard = new Set(w.fence.yard);
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const mat = (st: SimState, k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
const kind = (st: SimState, k: string): Pawn[] => st.pawns.filter((p) => p.kind === k);
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const run = (sim: Sim, ok: () => boolean, max = 20000) => {
  let k = 0;
  for (; k < max && !ok(); k++) sim.step();
  return k;
};
const FAR = tickAt(30, 10);
/** gra z obcymi o danej godzinie: tylko to, co włączone w who, przychodzi teraz, reszta nigdy w czasie testu */
const game = (day: number, hour: number, who: 'wedrowiec' | 'obcy' | 'handlarz', seed = 3) => {
  const st = createSim(w, seed, { core: 2, obcy: true });
  const sim = new Sim(w, st);
  st.tick = tickAt(day, hour);
  const o = st.obcy!;
  o.next = who === 'handlarz' ? st.tick : FAR;
  o.wnext = who === 'wedrowiec' ? st.tick : FAR;
  o.enext = who === 'obcy' ? st.tick : FAR;
  for (const p of core(st)) {
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
  }
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 20 * TICKS_PER_HOUR;
  return sim;
};
const menuOn = (st: SimState, p: Pawn) =>
  commandsAt(
    st,
    w,
    core(st).map((q) => q.id),
    tileOf(p),
  );

describe('Wędrowcy', () => {
  it('bez opcji nie ma pól; stary zapis z handlarzem dostaje terminy wędrowca i ekipy bez losowania', () => {
    const plain = createSim(w, 3, { core: 2 });
    expect('obcy' in plain).toBe(false);
    const st = createSim(w, 3, { core: 2, obcy: true });
    expect(dayOf(st.obcy!.wnext!)).toBe(2);
    expect(dayOf(st.obcy!.enext!)).toBeGreaterThanOrEqual(3);
    const old = JSON.parse(JSON.stringify(st)) as SimState;
    delete old.obcy!.wnext;
    delete old.obcy!.enext;
    const rng = old.rng.s;
    const sim = new Sim(w, old);
    expect(sim.st.obcy!.wnext).toBe(tickAt(dayOf(old.tick) + 1, 9));
    expect(sim.st.obcy!.enext).toBe(tickAt(dayOf(old.tick) + 2, 10));
    expect(sim.st.rng.s).toBe(rng);
  });

  it('przychodzi za dnia, przystaje przy siatce od strony ulicy, odchodzi i znika; następny później', () => {
    const sim = game(2, 10, 'wedrowiec');
    const st = sim.st;
    sim.step();
    const p = kind(st, 'wedrowiec')[0];
    expect(p).toBeDefined();
    run(sim, () => p.job?.phase === 1);
    expect(yard.has(tileOf(p))).toBe(false);
    const near = w.fence.tiles.some(
      (t) => Math.abs((t % size) - Math.floor(p.x)) + Math.abs(Math.floor(t / size) - Math.floor(p.y)) <= 2,
    );
    expect(near).toBe(true);
    expect(jobText(st, w, p)).toBe('Przystanął przy siatce.');
    run(sim, () => !kind(st, 'wedrowiec').length);
    expect(st.obcy!.wnext!).toBeGreaterThan(tickAt(2, 10));
  });

  it('zagadać: rozmowa przez siatkę, wieść, nastrój, drugi raz nie', () => {
    const sim = game(2, 10, 'wedrowiec');
    const st = sim.st;
    sim.step();
    const t = kind(st, 'wedrowiec')[0];
    run(sim, () => t.job?.phase === 1);
    const menu = menuOn(st, t);
    const talk = menu.find((m) => m.cmd.t === 'talk')!;
    expect(talk.label).toBe('Zagadać');
    expect(menu.find((m) => m.cmd.t === 'mug')).toMatchObject({ label: 'Napaść na wędrowca', confirm: true });
    const p = core(st)[0];
    sim.push({ t: 'talk', ids: [p.id], target: t.id });
    run(sim, () => p.job?.t === 'talk' && p.job.phase === 1);
    expect(yard.has(tileOf(p))).toBe(true);
    expect(jobText(st, w, p)).toBe('Rozmawia przez siatkę.');
    run(sim, () => p.job?.t !== 'talk');
    expect(st.obcy!.wiesc?.text.startsWith('Wędrowiec mówi')).toBe(true);
    expect(p.moods.find((m) => m.why === 'Wieści ze świata')?.d).toBe(3);
    expect(t.job?.what).toBe('zagadany');
    expect(menuOn(st, t).some((m) => m.cmd.t === 'talk')).toBe(false);
  });

  it('napaść: pościg, cios, worek za siatką, ucieczka, nastroje i zaufanie raz na napaść', () => {
    const sim = game(2, 10, 'wedrowiec');
    const st = sim.st;
    sim.step();
    const t = kind(st, 'wedrowiec')[0];
    run(sim, () => t.job?.phase === 1);
    const gov = newGov(3);
    govUpdate(gov, govInput(st, w, 0));
    const trust = gov.trust;
    const anger = gov.anger;
    const food = mat(st, 'jedzenie');
    const p = core(st)[0];
    sim.push({ t: 'mug', ids: [p.id], target: t.id });
    run(sim, () => (st.obcy!.napady?.length ?? 0) > 0);
    expect(st.obcy!.napady).toEqual([{ kto: 'wedrowiec', tick: expect.any(Number) }]);
    expect(t.job?.phase).toBe(3);
    expect(mat(st, 'jedzenie') - food).toBeGreaterThanOrEqual(1);
    expect(p.moods.find((m) => m.why === 'Napadliśmy na wędrowca')?.d).toBe(-4);
    expect(core(st)[1].moods.find((m) => m.why === 'Napadliśmy na wędrowca')?.d).toBe(-2);
    govUpdate(gov, govInput(st, w, 1));
    expect(gov.trust).toBeCloseTo(trust - 3, 5);
    expect(gov.anger).toBeCloseTo(anger + 2, 5);
    expect(pl(gov.log.at(-1)!.txt)).toContain('napadł na wędrowca');
    govUpdate(gov, govInput(st, w, 2));
    expect(gov.trust).toBeCloseTo(trust - 3, 5);
    run(sim, () => !kind(st, 'wedrowiec').length);
  });

  it('napaść na handlarza kosztuje zaufanie −6 i wkurzenie +4, z wieścią w kronice', () => {
    const sim = game(2, 10, 'handlarz');
    const st = sim.st;
    run(sim, () => kind(st, 'handlarz')[0]?.job?.phase === 1);
    const gov = newGov(3);
    govUpdate(gov, govInput(st, w, 0));
    expect('napadN' in gov).toBe(false);
    const trust = gov.trust;
    const anger = gov.anger;
    const p = core(st)[0];
    sim.push({ t: 'rob', ids: [p.id] });
    run(sim, () => st.obcy!.napad >= 0);
    govUpdate(gov, govInput(st, w, 1));
    expect(gov.trust).toBeCloseTo(trust - 6, 5);
    expect(gov.anger).toBeCloseTo(anger + 4, 5);
    expect(gov.napadN).toBe(1);
    expect(pl(gov.log.at(-1)!.txt)).toContain('napadł na handlarza');
  });
});

describe('Obce ekipy', () => {
  it('dwie osoby przeszukują nieprzeszukany wrak, łup przepada, wrak przeszukany; w tym czasie zarząd go nie zacznie', () => {
    const sim = game(3, 10, 'obcy');
    // automat pracy ludzi (w zwykłym trybie za dnia także za siatką) ściąłby w tym czasie drzewo i dołożył stertę, a test
    // liczy tylko łup ekipy
    wylaczAutomat(sim);
    const st = sim.st;
    sim.step();
    const crew = kind(st, 'obcy');
    expect(crew).toHaveLength(2);
    const t = crew[0].job!.target;
    expect(wreckStage(st.wraki, t)).toBe(0);
    run(sim, () => crew.every((q) => q.job?.phase === 1));
    const ids = core(st).map((p) => p.id);
    const item = commandsAt(st, w, ids, t).find((m) => m.cmd.t === 'wreck')!;
    expect(item.off).toBe('przy aucie są obcy');
    sim.push({ t: 'wreck', ids: [ids[0]], tile: t, how: 'szukaj' });
    sim.step();
    expect(core(st)[0].job?.t).not.toBe('wreck');
    const heaps = st.things.length;
    const t0 = st.tick;
    run(sim, () => wreckStage(st.wraki, t) === 1);
    expect(st.tick - t0).toBeLessThanOrEqual(CREW_SEARCH_TICKS + 1);
    expect(st.obcy!.wiesc?.text.startsWith('Obcy przeszukali')).toBe(true);
    expect(st.things.length).toBe(heaps);
    run(sim, () => !kind(st, 'obcy').length);
    expect(dayOf(st.obcy!.enext!) - 3).toBeGreaterThanOrEqual(2);
  });

  it('przegonić: osoba podchodzi, obaj uciekają, wrak zostaje nieprzeszukany, bez ceny w zaufaniu', () => {
    const sim = game(3, 10, 'obcy');
    const st = sim.st;
    sim.step();
    const crew = kind(st, 'obcy');
    const t = crew[0].job!.target;
    run(sim, () => crew.every((q) => q.job?.phase === 1));
    const item = menuOn(st, crew[1]).find((m) => m.cmd.t === 'shoo')!;
    expect(item.label).toBe('Przegonić');
    const p = core(st)[0];
    sim.push(item.cmd);
    run(sim, () => crew.every((q) => (q.job?.phase ?? 4) >= 3));
    expect(jobText(st, w, crew[0])).toBe('Ucieka.');
    run(sim, () => !kind(st, 'obcy').length);
    expect(wreckStage(st.wraki, t)).toBe(0);
    expect(st.obcy!.napady).toBeUndefined();
    expect(p.job?.t).not.toBe('shoo');
  });

  it('zapis i wczytanie w trakcie przeszukiwania przez ekipę nie zmienia przebiegu', () => {
    const sim = game(3, 10, 'obcy');
    sim.step();
    run(sim, () => kind(sim.st, 'obcy').every((q) => q.job?.phase === 1));
    const copy = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});
