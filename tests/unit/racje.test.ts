import { describe, expect, it } from 'vitest';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { lawsFrom } from '../../src/sim/gov.ts';
import { createSim, type Laws, Sim, type SimState } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const residents = (st: SimState) => st.pawns.filter((p) => p.kind === 'resident');
const sklad = w.interior.sklad;
const home = w.interior.home;
const aptOf = (i: number) => w.interior.rooms[w.interior.room[i]]?.apt ?? -1;
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const supplies = (st: SimState) =>
  st.things.filter((t) => t.kind === 'jedzenie' || t.kind === 'posilek').reduce((a, t) => a + t.n, 0);

/** trzy doby z uchwałą: drewno w składzie dokładane co rano (koza się pali), zapasy jedzenia na start 40 porcji */
function threeDays(laws: Partial<Laws>) {
  const st = createSim(w, 3, { core: 4 });
  const food = st.things.find((t) => t.kind === 'jedzenie')!;
  food.n = 40;
  const sim = new Sim(w, st);
  sim.setLaws(laws);
  let cooks = 0;
  let wasCooking = false;
  let foodSum = 0;
  let moodSum = 0;
  let n = 0;
  let minFood = 100;
  const moods = new Set<string>();
  for (let day = 1; day <= 3; day++) {
    for (const i of sklad) {
      const pile = st.things.find((t) => t.kind === 'drewno' && t.y * size + t.x === i);
      if (pile) pile.n = 10;
      else
        st.things.push({
          id: st.nextThing++,
          kind: 'drewno',
          x: i % size,
          y: Math.floor(i / size),
          w: 1,
          h: 1,
          rot: 0,
          n: 10,
          fuel: 0,
          by: -1,
          owner: -1,
        });
    }
    while (st.tick < atHour(day + 1, 6)) {
      sim.step();
      const cooking = core(st).some((p) => p.job?.t === 'cook' && p.job.phase === 1);
      if (cooking && !wasCooking) cooks++;
      wasCooking = cooking;
      if (st.tick % 200) continue;
      for (const p of core(st)) {
        for (const m of p.moods) moods.add(m.why);
        foodSum += p.needs!.food;
        moodSum += p.needs!.mood;
        n++;
        minFood = Math.min(minFood, p.needs!.food);
      }
    }
  }
  return {
    st,
    sim,
    supplies: supplies(st),
    eaten: 40 - supplies(st),
    food: foodSum / n,
    mood: moodSum / n,
    cooks,
    minFood,
    moods,
  };
}

describe('uchwały o jedzeniu w symulacji', () => {
  const base = threeDays({});

  it('racje: mniejsze porcje, zapasy starczają dłużej, najedzenie i nastrój niżej, ale nikt nie głoduje do zera', () => {
    const r = threeDays({ foodMult: 0.75 });
    // zjedzone mniej niż bez uchwały, najedzenie i nastrój niżej; od nocnego posiłku przy wielkim głodzie (glod-w-nocy.test.ts)
    // oszczędność to około 7% (13 porcji wobec 14 w trzy doby), wcześniej co najmniej 15%, bo racje głodziły śpiących do rana
    expect(r.eaten).toBeLessThan(base.eaten);
    expect(r.food).toBeLessThan(base.food - 5);
    expect(r.mood).toBeLessThan(base.mood - 2);
    expect(r.minFood).toBeGreaterThan(3);
    expect(r.moods.has('Głodowe racje')).toBe(true);
    expect(base.moods.has('Głodowe racje')).toBe(false);
  });

  it('kocioł: większe porcje i wspólne posiłki, zapasy schodzą szybciej, nastrój wyżej, gotowania mniej', () => {
    const k = threeDays({ foodMult: 1.1, sharedMeals: true });
    // zjedzone co najmniej o 15% więcej, gotowanie raz dziennie
    expect(k.eaten).toBeGreaterThanOrEqual(base.eaten * 1.15);
    expect(k.mood).toBeGreaterThan(base.mood + 2);
    expect(k.cooks).toBeLessThan(base.cooks);
    expect(k.cooks).toBeGreaterThanOrEqual(2);
  });

  it('racje: głód wraca szybciej (najedzenie spada o 10% szybciej niż bez uchwały)', () => {
    const drop = (laws: Partial<Laws>) => {
      const st = createSim(w, 3, { core: 1 });
      st.tick = atHour(2, 9);
      const sim = new Sim(w, st);
      sim.setLaws(laws);
      const [p] = core(st);
      p.needs!.food = 95;
      // dwie godziny bez jedzenia (najedzony nie je)
      for (let k = 0; k < 1600; k++) sim.step();
      return 95 - p.needs!.food;
    };
    const normal = drop({});
    expect(drop({ foodMult: 0.75 })).toBeCloseTo(normal * 1.1, 1);
  });

  it('wspólny posiłek o 13:00: zarząd i mieszkańcy przy stole zarządu, potem nastrój „Wspólny posiłek”; poza porą posiłku mieszkańcy do mieszkania zarządu nie wchodzą', () => {
    const st = createSim(w, 3, { core: 4 });
    st.tick = atHour(2, 11);
    const sim = new Sim(w, st);
    sim.setLaws({ foodMult: 1.1, sharedMeals: true });
    let inHomeOutside = false;
    let together = 0;
    while (st.tick < atHour(2, 15)) {
      sim.step();
      const h = 15 + st.tick / 800 - 24;
      const rs = residents(st);
      const atTable = rs.filter((p) => aptOf(tileOf(p)) === home).length;
      if ((h < 12.5 || h >= 14.5) && atTable > 0) inHomeOutside = true;
      const eating = core(st).filter((p) => p.job?.t === 'eat' && p.job.phase === 1).length;
      if (atTable >= Math.min(3, rs.length) && eating >= 2) together++;
    }
    expect(inHomeOutside).toBe(false);
    expect(together).toBeGreaterThan(0);
    for (const p of [...core(st), ...residents(st)])
      expect(p.moods.some((m) => m.why === 'Wspólny posiłek')).toBe(true);
    // o 15:00 mieszkańcy znów na podwórku albo w drodze, nie w mieszkaniu zarządu
    for (const p of residents(st)) expect(aptOf(tileOf(p))).not.toBe(home);
  });

  it('zapis i wczytanie w trakcie wspólnego posiłku daje ten sam dalszy przebieg', () => {
    const st = createSim(w, 3, { core: 4 });
    st.tick = atHour(2, 12);
    const sim = new Sim(w, st);
    sim.setLaws({ foodMult: 1.1, sharedMeals: true });
    while (st.tick < atHour(2, 13.2)) sim.step();
    const copy = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (let k = 0; k < 2500; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });

  it('lawsFrom przenosi racje i wspólny kocioł z zarządu', () => {
    const fx = emptyEffects();
    void fx;
    expect(lawsFrom({ foodMult: 0.825, burnMood: 1, sharedMeals: true, workStart: 8, gateClosed: false })).toEqual({
      foodMult: 0.825,
      sharedMeals: true,
      burnMood: 1,
      workStart: 8,
      gateClosed: false,
    });
  });
});
