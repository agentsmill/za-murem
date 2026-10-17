import { describe, expect, it } from 'vitest';
import { outdoorTemp } from '../../src/sim/clock.ts';
import type { PropLike } from '../../src/sim/house.ts';
import { BURN_TICKS, createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock, plainBlock } from './interior-mock.ts';

const w = mockBlock();
/** sztuki w stertach danego rodzaju na podwórku świata */
const heap = (kind: string) =>
  (w.props as readonly PropLike[]).filter((p) => p.kind === kind).reduce((a, p) => a + (p.n ?? 0), 0);

describe('odczyt stanu dla modułu zarządu', () => {
  it('na starcie: czas, ludzie zarządu z potrzebami i umiejętnościami, zapasy', () => {
    const st = createSim(w, 3, { core: 4, crowd: 5 });
    const s = snapshot(st, w);
    expect(s).toMatchObject({ tick: 0, day: 1, hour: 15, minute: 0, clock: '15:00', season: 0, night: false });
    expect(s.seasonName).toBe('jesień');
    expect(s.outdoor).toBe(outdoorTemp(3, 0));
    expect(s.kitchen).toBe(9);
    expect(s.kozaLit).toBe(false);
    expect(s.people).toHaveLength(4);
    for (const p of s.people) {
      expect(Object.keys(p.needs).sort()).toEqual(['food', 'health', 'mood', 'rest', 'safe', 'warm']);
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.prof.length).toBeGreaterThan(2);
      expect(Object.keys(p.skills).length).toBeGreaterThan(0);
      expect(p).toMatchObject({ job: null, doing: 'Stoi i czeka na polecenie.', asleep: false, inside: true });
    }
    expect(s.stock).toEqual({
      woodSklad: 0,
      woodLoose: 0,
      woodCarried: 0,
      fireHours: 0,
      wood: 0,
      supplies: 24,
      meals: 0,
      gasCooks: 6,
      // sterty ze świata (prawdziwe albo z atrapy, gdy świat ich nie ma)
      scrap: heap('zlom'),
      boards: heap('deski'),
      parts: 0,
      meds: 0,
    });
    expect(s.burned).toEqual([]);
  });

  it('w trakcie gry: praca, drewno i ogień liczone razem', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 4 }));
    const [m] = sim.st.pawns;
    sim.push({ t: 'chop', ids: [m.id], tree: w.dryTree });
    for (let k = 0; k < 200; k++) sim.step();
    const s1 = snapshot(sim.st, w);
    expect(s1.people[0]).toMatchObject({ job: 'chop', inside: false });
    expect(s1.people[0].doing).toMatch(/suchego drzewa|Rąbie/);
    while (sim.st.tut.at[4] < 0) sim.step();
    const s2 = snapshot(sim.st, w);
    const koza = sim.st.things.find((t) => t.kind === 'koza')!;
    expect(s2.kozaLit).toBe(true);
    expect(s2.stock.fireHours).toBeCloseTo(koza.fuel / 800, 6);
    expect(s2.stock.wood).toBe(
      s2.stock.woodSklad + s2.stock.woodLoose + s2.stock.woodCarried + Math.ceil(koza.fuel / BURN_TICKS),
    );
  });

  it('zwraca kopie: zmiany w odczycie nie ruszają symulacji, a sam odczyt niczego nie zmienia', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    for (let k = 0; k < 100; k++) sim.step();
    const before = sim.hash();
    const s = snapshot(sim.st, w);
    s.people[0].needs.food = 0;
    s.people[0].moods.push({ why: 'test', d: -50, until: 1e9 });
    s.people[0].skills.med = 99;
    expect(sim.hash()).toBe(before);
    expect(snapshot(sim.st, w)).toEqual(snapshot(sim.st, w));
    expect(JSON.parse(JSON.stringify(snapshot(sim.st, w)))).toStrictEqual(snapshot(sim.st, w));
  });

  it('świat bez wnętrza: bez kuchni i zapasów, ludzie dalej są', () => {
    const p = plainBlock();
    const s = snapshot(createSim(p, 3, { core: 4 }), p);
    expect(s.people).toHaveLength(4);
    expect(s.kitchen).toBeNull();
    expect(s.stock.supplies).toBe(0);
    expect(s.people.every((q) => !q.inside)).toBe(true);
  });
});
