import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { mockBlockM2 } from './interior-mock.ts';

/* Przyjmowanie ludzi (po graniu na żywo: „przyjmujemy ludzi, ale ich nie widzę”): przyjęci przychodzą zza bramy,
   nikt nie znika, kto nie ma łóżka, śpi na podłodze z karą do sił i nastroju, liczba u zarządu zgadza się z pionkami. */

const w = mockBlockM2();
const size = w.size;
const h = w.interior;
const residents = (st: SimState) => st.pawns.filter((p) => p.kind === 'resident');
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const atHour = (day: number, hh: number) => Math.round(((day - 1) * 24 + hh - 15) * 800);
const admit = (st: SimState, n: number) => {
  const fx = emptyEffects();
  fx.residents = n;
  applyGov(st, w, fx);
};
const gate = w.fence.gate;
const isGate = (i: number) => {
  const x = i % size;
  const y = Math.floor(i / size);
  return x >= gate.x && x < gate.x + gate.w && y >= gate.y && y < gate.y + gate.h;
};

describe('przyjmowanie ludzi', () => {
  it('przyjęcie 5 osób przy pełnych miejscach: 5 nowych pionków, każdy dochodzi zza bramy, zarząd liczy tylu samo', () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(1, 16);
    const sim = new Sim(w, st);
    const before = residents(st).length;
    expect(before).toBeGreaterThanOrEqual(st.cap);
    admit(st, 5);
    const fresh = residents(st).slice(before);
    expect(fresh).toHaveLength(5);
    expect(govInput(st, w, 0).residents).toBe(before + 5);
    // zaczynają za siatką, poza budynkami
    for (const p of fresh) {
      const i = tileOf(p);
      expect(w.fence.yard.includes(i) || w.bid[i] >= 0).toBe(false);
    }
    const passed = new Set<number>();
    while (st.tick < atHour(1, 20) && fresh.some((p) => p.job?.t === 'arrive')) {
      sim.step();
      for (const p of fresh) if (isGate(tileOf(p))) passed.add(p.id);
    }
    expect(fresh.every((p) => p.job?.t !== 'arrive')).toBe(true);
    expect(passed.size).toBe(5);
    // są już po naszej stronie: na podwórku albo w budynku
    for (const p of fresh) {
      const i = tileOf(p);
      expect(w.fence.yard.includes(i) || w.bid[i] >= 0).toBe(true);
    }
    expect(residents(st)).toHaveLength(before + 5);
  });

  it('kto nie ma łóżka, śpi na podłodze: rano nastrój „Spanie na podłodze” i mniej sił, z łóżkiem bez kary', () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(1, 18);
    const sim = new Sim(w, st);
    admit(st, 3);
    const floor = new Set<number>();
    const bed = new Set<number>();
    while (st.tick < atHour(2, 7)) {
      sim.step();
      for (const p of residents(st))
        if (p.job?.t === 'sleep' && p.job.phase === 1) (p.job.target < 0 ? floor : bed).add(p.id);
    }
    expect(floor.size).toBeGreaterThanOrEqual(3);
    expect(bed.size).toBeGreaterThanOrEqual(1);
    for (const p of residents(st)) {
      const sad = p.moods.some((m) => m.why === 'Spanie na podłodze');
      if (floor.has(p.id) && !bed.has(p.id)) {
        expect(sad).toBe(true);
        expect(p.needs!.rest).toBeLessThan(70);
      }
      if (bed.has(p.id) && !floor.has(p.id)) expect(sad).toBe(false);
    }
  });

  it('śpiący na podłodze przeprowadza się rano do zajętego i naprawionego mieszkania z wolnym łóżkiem', () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(1, 18);
    const sim = new Sim(w, st);
    admit(st, 3);
    // mieszkanie 3: zajęte i naprawione, jedno całe łóżko (wersalka zepsuta)
    st.apts[3].ours = true;
    for (const d of st.damage) if (d.apt === 3) d.fixed = true;
    while (st.tick < atHour(2, 8)) sim.step();
    const moved = residents(st).filter((p) => p.apt === 3);
    expect(moved).toHaveLength(1);
    const bed3 = st.things.find(
      (t) => t.kind === 'lozko' && !t.broken && h.rooms[h.room[t.y * size + t.x]]?.apt === 3,
    )!;
    expect(bed3.owner).toBe(moved[0].id);
  });

  it('bez mieszkań mieszkańców przy podwórku gra idzie bez mieszkańców, a przyjęci nocują w klatce', () => {
    const empty = {
      ...w,
      apts: w.apts.map((a) => (a.apt === 1 ? { ...a, state: 'puste', why: 'wyjazd', year: 2030 } : a)),
    } as typeof w;
    const st = createSim(empty, 3, { core: 2 });
    expect(residents(st)).toHaveLength(0);
    st.tick = atHour(1, 17);
    const sim = new Sim(empty, st);
    for (let k = 0; k < 3000; k++) sim.step();
    expect(govInput(st, empty, 0).residents).toBe(0);
    const fx = emptyEffects();
    fx.residents = 2;
    applyGov(st, empty, fx);
    expect(residents(st)).toHaveLength(2);
    let inStairs = 0;
    while (st.tick < atHour(2, 2)) {
      sim.step();
      for (const p of residents(st)) {
        const r = h.room[tileOf(p)];
        if (p.job?.t === 'sleep' && p.job.phase === 1 && r >= 0 && h.rooms[r].kind === 'klatka') inStairs++;
      }
    }
    expect(inStairs).toBeGreaterThan(0);
  });

  it('fx.join: nowa osoba zarządu czeka za bramą i dochodzi do siedziby', () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 10);
    const sim = new Sim(w, st);
    const person = makePerson(mulberry(9), new Set(), () => 101);
    const fx = emptyEffects();
    fx.join.push(person);
    applyGov(st, w, fx);
    const np = st.pawns.find((q) => q.kind === 'core' && st.people[q.person].id === person.id)!;
    // zaczyna za siatką, poza budynkami, w pracy „arrive”
    expect(np.job?.t).toBe('arrive');
    const start = tileOf(np);
    expect(w.fence.yard.includes(start) || w.bid[start] >= 0).toBe(false);
    // nikt inny z zarządu nie dostał pracy „arrive”
    expect(st.pawns.filter((q) => q.kind === 'core' && q.job?.t === 'arrive')).toEqual([np]);
    let passed = false;
    for (let k = 0; k < 2 * 800 && (np.job?.t === 'arrive' || !passed); k++) {
      sim.step();
      if (isGate(tileOf(np))) passed = true;
    }
    expect(passed).toBe(true);
    expect(np.job?.t).not.toBe('arrive');
    // po drugiej godzinie jest już po naszej stronie, przy siedzibie, i żyje jak reszta zarządu
    for (let k = 0; k < 800; k++) sim.step();
    const i = tileOf(np);
    expect(w.fence.yard.includes(i) || w.bid[i] >= 0).toBe(true);
    const door = w.buildings[w.hq].entrances[0].out;
    expect(Math.hypot((i % size) - (door % size), Math.floor(i / size) - Math.floor(door / size))).toBeLessThan(25);
    expect(np.needs).toBeTruthy();
  });
});
