import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import type { GovEffects } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { applyGov, govInput, lawsFrom } from '../../src/sim/gov.ts';
import { jobText } from '../../src/sim/orders.ts';
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
    const rest0 = a.needs!.rest;
    applyGov(
      st,
      w,
      fx((e) => {
        e.needs.push({ id: idOf(st, 0), d: { rest: -30, health: -200 } });
        e.moods.push({ id: idOf(st, 1), why: 'Przegoniliśmy szabrowników', d: 6, hours: 12 });
      }),
    );
    expect(a.needs!.rest).toBe(rest0 - 30);
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

  it('nowa osoba dochodzi do zarządu, odchodząca znika, mieszkańców przybywa i ubywa tylu, ilu podał zarząd', () => {
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
    // przyjęci nie znikają przy pełnych miejscach (kto nie ma łóżka, śpi na podłodze)
    expect(s.residents).toBe(r0 + 1);
    applyGov(
      st,
      w,
      fx((e) => (e.residents = -2)),
    );
    expect(snapshot(st, w).residents).toBe(r0 + 1 - 2);
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
    for (const t of holes[0].tiles) expect(sim.canWalk('szabrownik', t)).toBe(false);
  });

  /** jawny wynik napadu, jak go daje zarząd w minucie napadu */
  const result = (
    outcome: 'odparty' | 'wtargnięcie',
    stolen: Partial<Record<'wood' | 'supplies' | 'scrap', number>> = {},
    slept: string[] = [],
  ) => ({
    day: 1,
    outcome,
    post: 'brama',
    where: { pl: 'przy bramie', en: 'przy bramie' },
    attack: 3,
    defense: 2,
    stolen: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0, ...stolen },
    slept,
  });

  it('napad z jawnym wynikiem: przy wtargnięciu szabrownicy wynoszą dokładnie stolen, nic nie znika podwójnie', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, w.fence.yard[40], 5);
    pile(st, sklad[0], 10);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const hole = st.fence!.holes[0];
    applyGov(
      st,
      w,
      fx(
        (e) =>
          (e.raid = {
            day: 1,
            at: minuteOf(1, 23),
            post: `d${hole.id}`,
            where: { pl: 'przy garażach', en: 'przy garażach' },
            attack: 3.5,
            people: 2,
          }),
      ),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    expect(st.pawns.filter((p) => p.kind === 'szabrownik')).toHaveLength(2);
    const wood0 = sum(st, 'drewno');
    const food0 = sum(st, 'jedzenie');
    applyGov(
      st,
      w,
      fx((e) => {
        e.stock.wood = -7;
        e.stock.supplies = -4;
        e.raidResult = result('wtargnięcie', { wood: 7, supplies: 4 });
      }),
    );
    // od razu nic nie znika: wyniosą to szabrownicy
    expect(st.raid!.outcome).toBe('wtargnięcie');
    expect(sum(st, 'drewno')).toBe(wood0);
    while (st.tick < atHour(2, 3)) sim.step();
    expect(st.pawns.some((p) => p.kind === 'szabrownik')).toBe(false);
    expect(sum(st, 'drewno')).toBe(wood0 - 7);
    expect(sum(st, 'jedzenie')).toBe(food0 - 4);
    expect(st.raid!.took).toEqual({ wood: 7, supplies: 4, scrap: 0 });
  });

  it('napad odparty według zarządu: uciekają spod siatki, nic nie ginie', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, w.fence.yard[40], 5);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    applyGov(
      st,
      w,
      fx(
        (e) =>
          (e.raid = { day: 1, at: minuteOf(1, 23), post: 'brama', where: { pl: 'przy bramie', en: 'przy bramie' } }),
      ),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    const wood0 = sum(st, 'drewno');
    applyGov(
      st,
      w,
      fx((e) => (e.raidResult = result('odparty'))),
    );
    const yard = new Set(w.fence.yard);
    let inYard = false;
    while (st.tick < atHour(2, 2)) {
      sim.step();
      for (const p of st.pawns)
        if (p.kind === 'szabrownik' && yard.has(Math.floor(p.y) * size + Math.floor(p.x))) inYard = true;
    }
    expect(st.raid!.outcome).toBe('odparty');
    expect(inYard).toBe(false);
    expect(sum(st, 'drewno')).toBe(wood0);
  });

  it('bez jawnego wyniku nic nie zgaduje: kronika i ślady w potrzebach nie rozstrzygają, straty znikają raz', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, w.fence.yard[40], 20);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    applyGov(
      st,
      w,
      fx(
        (e) =>
          (e.raid = { day: 1, at: minuteOf(1, 23), post: 'brama', where: { pl: 'przy bramie', en: 'przy bramie' } }),
      ),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    const wood0 = sum(st, 'drewno');
    applyGov(
      st,
      w,
      fx((e) => {
        e.stock.wood = -7;
        for (const p of core(st)) e.needs.push({ id: st.people[p.person].id, d: { safe: -25 } });
        e.log.push({
          pl: 'Szabrownicy weszli przy bramie i zabrali: Drewno 7.',
          en: 'Looters got in at the gate and took 7 wood.',
        });
      }),
    );
    expect(st.raid!.outcome).toBe('');
    expect(sum(st, 'drewno')).toBe(wood0 - 7);
    // zarząd nie dał wyniku: po godzinie szabrownicy odchodzą bez łupu
    while (st.tick < atHour(2, 1)) sim.step();
    expect(st.raid!.outcome).toBe('odparty');
    expect(st.raid!.took).toEqual({ wood: 0, supplies: 0, scrap: 0 });
  });

  it('tylu szabrowników, ilu w planie zarządu, i siła napadu w stanie', () => {
    for (const people of [1, 3]) {
      const st = createSim(w, 3, { core: 2 });
      st.tick = atHour(1, 21);
      const sim = new Sim(w, st);
      applyGov(
        st,
        w,
        fx(
          (e) =>
            (e.raid = {
              day: 1,
              at: minuteOf(1, 23),
              post: 'brama',
              where: { pl: 'przy bramie', en: 'przy bramie' },
              attack: 4.6,
              people,
            }),
        ),
      );
      while (st.tick < atHour(1, 23)) sim.step();
      expect(st.pawns.filter((p) => p.kind === 'szabrownik')).toHaveLength(people);
      expect(st.raid!.n).toBe(people);
      expect(st.raid!.attack).toBe(4.6);
    }
  });

  it('wartownik, który według zarządu zasnął, przysypia na posterunku bez lampy, reszta dalej stoi', () => {
    const st = createSim(w, 3, { core: 3 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const [a, b] = core(st);
    sim.push({ t: 'guard', ids: [a.id, b.id], post: 'brama' });
    applyGov(
      st,
      w,
      fx(
        (e) =>
          (e.raid = {
            day: 1,
            at: minuteOf(1, 23),
            post: 'brama',
            where: { pl: 'przy bramie', en: 'przy bramie' },
            people: 1,
          }),
      ),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    expect(a.job?.phase).toBe(1);
    applyGov(
      st,
      w,
      fx((e) => (e.raidResult = result('wtargnięcie', {}, [idOf(st, 0)]))),
    );
    for (let k = 0; k < 40; k++) sim.step();
    expect(a.job?.t).toBe('guard');
    expect(a.job?.phase).toBe(4);
    expect(jobText(st, w, a)).toBe('Przysypia na warcie.');
    expect(b.job?.phase).toBe(1);
    const s = snapshot(st, w);
    expect(s.people.find((p) => p.pawn === a.id)!.asleep).toBe(true);
    expect(s.people.find((p) => p.pawn === b.id)!.asleep).toBe(false);
    // lampę ma tylko ten, który nie śpi; zarząd widzi w warcie tylko jego
    expect(govInput(st, w, 0).guards).toEqual([{ id: idOf(st, 1), post: 'brama' }]);
    // rano oboje schodzą z warty
    while (st.tick < atHour(2, 6.5)) sim.step();
    expect(a.job?.t).not.toBe('guard');
    expect(b.job?.t).not.toBe('guard');
  });

  it('wynik napadu i powrót wyprawy w jednym kroku: szabrownicy wynoszą stolen, wyprawa przynosi swoje', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, sklad[0], 10);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    applyGov(
      st,
      w,
      fx(
        (e) =>
          (e.raid = {
            day: 1,
            at: minuteOf(1, 23),
            post: 'brama',
            where: { pl: 'przy bramie', en: 'przy bramie' },
            people: 2,
          }),
      ),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    const wood0 = sum(st, 'drewno');
    applyGov(
      st,
      w,
      fx((e) => {
        // wyprawa przyniosła 8, szabrownicy zabrali 5: netto +3
        e.stock.wood = 3;
        e.raidResult = result('wtargnięcie', { wood: 5 });
      }),
    );
    expect(sum(st, 'drewno')).toBe(wood0 + 8);
    while (st.tick < atHour(2, 3)) sim.step();
    expect(st.raid!.took).toEqual({ wood: 5, supplies: 0, scrap: 0 });
    expect(sum(st, 'drewno')).toBe(wood0 + 3);
  });

  it('zarząd widzi wartę, która stoi: z menu, przy kozie i z karty; bez wyprawy', () => {
    const st = createSim(w, 3, { core: 4 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const [a, b, c, d] = core(st);
    const hole = st.fence!.holes[0];
    sim.push({ t: 'guard', ids: [a.id], post: 'brama' });
    sim.push({ t: 'guard', ids: [b.id], post: `d${hole.id}` });
    sim.push({ t: 'guard', ids: [c.id], post: 'koza' });
    sim.push({ t: 'away', ids: [d.id] });
    for (let k = 0; k < 800; k++) sim.step();
    const g = govInput(st, w, 0).guards!;
    expect(g).toEqual([
      { id: idOf(st, 0), post: 'brama' },
      { id: idOf(st, 1), post: `d${hole.id}` },
      { id: idOf(st, 2), post: 'koza' },
    ]);
    // za dnia, bez warty: pusto
    expect(govInput(createSim(w, 3, { core: 2 }), w, 0).guards).toEqual([]);
  });

  it('zapis i wczytanie w trakcie napadu z jawnym wynikiem daje ten sam dalszy przebieg', () => {
    const st = createSim(w, 3, { core: 2 });
    pile(st, w.fence.yard[40], 20);
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    applyGov(
      st,
      w,
      fx(
        (e) =>
          (e.raid = {
            day: 1,
            at: minuteOf(1, 23),
            post: 'brama',
            where: { pl: 'przy bramie', en: 'przy bramie' },
            people: 3,
          }),
      ),
    );
    while (st.tick < atHour(1, 23)) sim.step();
    applyGov(
      st,
      w,
      fx((e) => {
        e.stock.wood = -4;
        e.raidResult = result('wtargnięcie', { wood: 4 });
      }),
    );
    for (let k = 0; k < 60; k++) sim.step();
    const copy = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (let k = 0; k < 3000; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
    expect(st.raid!.took.wood).toBe(4);
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
      foodMult: 0.8,
      sharedMeals: true,
    });
  });
});
