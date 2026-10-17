import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import type { GovEffects } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { applyGov, govInput, lawsFrom } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const minuteOf = (day: number, h: number) => (day - 1) * 1440 + h * 60;
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const idOf = (st: SimState, k: number) => st.people[core(st)[k].person].id;
const fx = (f: (e: GovEffects) => void): GovEffects => {
  const e = emptyEffects();
  f(e);
  return e;
};
const sklad = w.interior.sklad;
const pile = (st: SimState, i: number, n: number) =>
  st.things.push({
    id: st.nextThing++,
    kind: 'drewno',
    x: i % size,
    y: Math.floor(i / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  });
const sum = (st: SimState, kind: string) => st.things.filter((t) => t.kind === kind).reduce((a, t) => a + t.n, 0);

describe('applyGov: skutki zarządu w symulacji', () => {
  it('zapasy: łup z wyprawy ląduje na podwórku i w kuchni, wydatki znikają najpierw z drewna luzem', () => {
    const st = createSim(w, 3, { core: 2 });
    const looseAt = w.fence.yard[40];
    pile(st, looseAt, 4);
    pile(st, sklad[0], 6);
    const food0 = sum(st, 'jedzenie');
    const zlom0 = sum(st, 'zlom');
    applyGov(
      st,
      w,
      fx((e) => Object.assign(e.stock, { wood: 7, supplies: 5, scrap: 2, parts: 1, meds: 2 })),
    );
    expect(sum(st, 'drewno')).toBe(17);
    expect(sum(st, 'jedzenie')).toBe(food0 + 5);
    expect(sum(st, 'zlom')).toBe(zlom0 + 2);
    // nowe drewno leży na podwórku, nie w składzie (zarząd sam zaniesie)
    const yard = new Set(w.fence.yard);
    for (const t of st.things.filter((t) => t.kind === 'drewno' && t.id > 2 && t.n !== 4 && t.n !== 6))
      expect(yard.has(t.y * size + t.x)).toBe(true);
    const s = snapshot(st, w);
    expect(s.stock.parts).toBe(1);
    expect(s.stock.meds).toBe(2);
    expect(s.stock.scrap).toBe(zlom0 + 2);
    // wydatek: najpierw drewno luzem, potem skład
    applyGov(
      st,
      w,
      fx((e) => Object.assign(e.stock, { wood: -9, supplies: -3, parts: -5 })),
    );
    expect(sum(st, 'drewno')).toBe(8);
    expect(
      st.things.filter((t) => t.kind === 'drewno' && sklad.includes(t.y * size + t.x)).reduce((a, t) => a + t.n, 0),
    ).toBe(6);
    expect(sum(st, 'jedzenie')).toBe(food0 + 2);
    expect(snapshot(st, w).stock.parts).toBe(0);
  });

  it('potrzeby i nastroje trafiają do właściwych osób, wartości zostają w 0–100', () => {
    const st = createSim(w, 3, { core: 3 });
    const [a, b] = core(st);
    const safe0 = b.needs!.safe;
    applyGov(
      st,
      w,
      fx((e) => {
        e.needs.push({ id: idOf(st, 0), d: { rest: -30, health: -200 } });
        e.moods.push({ id: idOf(st, 1), why: 'Przegoniliśmy szabrowników', d: 6, hours: 12 });
      }),
    );
    expect(a.needs!.rest).toBe(35);
    expect(a.needs!.health).toBe(0);
    expect(b.needs!.safe).toBe(safe0);
    expect(b.moods).toEqual([{ why: 'Przegoniliśmy szabrowników', d: 6, until: st.tick + 12 * 800 }]);
  });

  it('karta nocy: warta staje przy posterunku, wyprawa wychodzi bramą i wraca, kiedy zarząd powie', () => {
    const st = createSim(w, 3, { core: 3 });
    st.tick = atHour(1, 20);
    const sim = new Sim(w, st);
    applyGov(
      st,
      w,
      fx((e) => {
        e.guards.push({ id: idOf(st, 0), post: 'brama' });
        e.away.push({ id: idOf(st, 1), day: 2, hour: 7 });
      }),
    );
    for (let k = 0; k < 2000; k++) sim.step();
    const [g, x] = core(st);
    expect(g.job?.t).toBe('guard');
    expect(g.job?.phase).toBe(1);
    expect(x.away).toBe(true);
    applyGov(
      st,
      w,
      fx((e) => e.back.push(idOf(st, 1))),
    );
    sim.step();
    expect(x.away).toBe(false);
  });

  it('nowa osoba dochodzi do zarządu, odchodząca znika, mieszkańców przybywa i ubywa w granicach miejsc', () => {
    const st = createSim(w, 3, { core: 2 });
    const r0 = st.pawns.filter((p) => p.kind === 'resident').length;
    const p = makePerson(mulberry(9), new Set(), () => 101);
    const gone = idOf(st, 0);
    applyGov(
      st,
      w,
      fx((e) => {
        e.join.push(p);
        e.leave.push(gone);
        e.residents = 1;
      }),
    );
    const s = snapshot(st, w);
    expect(s.people.map((q) => q.id)).toContain(p.id);
    expect(s.people.map((q) => q.id)).not.toContain(gone);
    expect(s.people).toHaveLength(2);
    expect(s.residents).toBe(Math.min(st.cap, r0 + 1));
    applyGov(
      st,
      w,
      fx((e) => (e.residents = -2)),
    );
    expect(snapshot(st, w).residents).toBe(Math.min(st.cap, r0 + 1) - 2);
    // nowa osoba żyje w symulacji: ma potrzeby i chodzi
    const sim = new Sim(w, st);
    for (let k = 0; k < 400; k++) sim.step();
    const np = st.pawns.find((q) => q.kind === 'core' && st.people[q.person].id === p.id)!;
    expect(np.needs).toBeTruthy();
  });

  it('łaty z zarządu zamykają najpierw największe dziury', () => {
    const st = createSim(w, 3, { core: 2 });
    const sim = new Sim(w, st);
    const holes = [...st.fence!.holes].sort((a, b) => b.size - a.size || a.id - b.id);
    applyGov(
      st,
      w,
      fx((e) => (e.patch = 2)),
    );
    sim.step();
    expect(holes[0].patch).toBeGreaterThan(0);
    expect(holes[1].patch).toBeGreaterThan(0);
    for (const h of holes.slice(2)) expect(h.patch).toBe(0);
    for (const t of holes[0].tiles) expect(sim.canWalk('stranger', t)).toBe(false);
  });

  it('napad z planu: rozstrzyga zarząd, a przy wtargnięciu znika dokładnie tyle, ile policzył (bez podwójnej straty)', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, w.fence.yard[40], 5);
    pile(st, sklad[0], 10);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const hole = st.fence!.holes[0];
    applyGov(
      st,
      w,
      fx((e) => (e.raid = { day: 1, at: minuteOf(1, 23), post: `d${hole.id}`, where: 'przy garażach' })),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    expect(st.pawns.some((p) => p.kind === 'stranger')).toBe(true);
    const wood0 = sum(st, 'drewno');
    const food0 = sum(st, 'jedzenie');
    // rozstrzygnięcie zarządu w minucie napadu: wtargnięcie, zabrali 7 drewna i 4 porcje
    applyGov(
      st,
      w,
      fx((e) => {
        e.stock.wood = -7;
        e.stock.supplies = -4;
        for (const p of core(st)) e.needs.push({ id: st.people[p.person].id, d: { safe: -25 } });
        e.log.push('Szabrownicy weszli przy garażach i zabrali: Drewno 7, Jedzenie 4.');
      }),
    );
    // od razu nic nie znika: wyniosą to szabrownicy
    expect(sum(st, 'drewno')).toBe(wood0);
    while (st.tick < atHour(2, 3)) sim.step();
    expect(st.raid!.outcome).toBe('wtargnięcie');
    expect(st.pawns.some((p) => p.kind === 'stranger')).toBe(false);
    expect(sum(st, 'drewno')).toBe(wood0 - 7);
    expect(sum(st, 'jedzenie')).toBe(food0 - 4);
    expect(st.raid!.took).toEqual({ wood: 7, supplies: 4, scrap: 0 });
  });

  it('napad odparty przez zarząd: uciekają spod siatki, nic nie ginie', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, w.fence.yard[40], 5);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    applyGov(
      st,
      w,
      fx((e) => (e.raid = { day: 1, at: minuteOf(1, 23), post: 'brama', where: 'przy bramie' })),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    const wood0 = sum(st, 'drewno');
    applyGov(
      st,
      w,
      fx((e) => {
        for (const p of core(st)) e.needs.push({ id: st.people[p.person].id, d: { safe: 8 } });
      }),
    );
    const yard = new Set(w.fence.yard);
    let inYard = false;
    while (st.tick < atHour(2, 2)) {
      sim.step();
      for (const p of st.pawns)
        if (p.kind === 'stranger' && yard.has(Math.floor(p.y) * size + Math.floor(p.x))) inYard = true;
    }
    expect(st.raid!.outcome).toBe('odparty');
    expect(inYard).toBe(false);
    expect(sum(st, 'drewno')).toBe(wood0);
  });

  it('odczyt dla zarządu ma kształt GovInput i zarząd na nim działa; uchwały przechodzą do symulacji', () => {
    const st = createSim(w, 3, { core: 4 });
    const i = govInput(st, w, 12);
    expect(i.screen).toBe(12);
    expect(i.people).toHaveLength(4);
    expect(i.fence!.holes.length).toBe(st.fence!.holes.length);
    expect(i.stock.scrap).toBe(sum(st, 'zlom'));
    expect(i.residents).toBe(st.pawns.filter((p) => p.kind === 'resident').length);
    const gov = newGov(3);
    const out = govUpdate(gov, i);
    expect(out.stock).toBeTruthy();
    expect(lawsFrom({ foodMult: 0.8, burnMood: 0.5, sharedMeals: true, workStart: 9, gateClosed: true })).toEqual({
      burnMood: 0.5,
      workStart: 9,
      gateClosed: true,
    });
  });
});
