import { describe, expect, it } from 'vitest';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

/* Wartownik po nocy (uwaga z grania na żywo): spał do południa z najedzeniem 0. Głodny najpierw coś je, potem
   odsypia; śpiący za dnia wstaje na posiłek, kiedy jest co zjeść, i wraca do snu. */

const w = mockBlock();
const atHour = (day: number, hh: number) => Math.round(((day - 1) * 24 + hh - 15) * 800);
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

describe('wartownik po nocy', () => {
  it('głodny po warcie najpierw je, potem odsypia; najedzenie nie spada do zera', () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const [g] = core(st);
    // po całej nocy na warcie rano wyczerpany (siły poniżej TIRED) i głodny, ale jeszcze nie na zerze
    g.needs!.food = 45;
    g.needs!.rest = 40;
    sim.push({ t: 'guard', ids: [g.id], post: 'brama' });
    while (st.tick < atHour(2, 5.5)) sim.step();
    expect(g.job?.t).toBe('guard');
    expect(g.needs!.food).toBeGreaterThan(0);
    const meal0 = g.lastMeal;
    let ate = -1;
    let napAfter = false;
    let minFood = 100;
    while (st.tick < atHour(2, 12)) {
      sim.step();
      if (st.tick < atHour(2, 6)) continue;
      minFood = Math.min(minFood, g.needs!.food);
      if (ate < 0 && g.lastMeal !== meal0) ate = st.tick;
      if (ate >= 0 && g.job?.t === 'sleep' && g.job.phase === 1) napAfter = true;
    }
    // zjadł w ciągu półtorej godziny po zejściu z warty, a potem spał
    expect(ate).toBeGreaterThanOrEqual(0);
    expect(ate).toBeLessThan(atHour(2, 7.5));
    expect(napAfter).toBe(true);
    expect(minFood).toBeGreaterThan(0);
  });

  it('śpiący za dnia wstaje na ciepły posiłek i wraca do snu', () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(2, 9);
    const sim = new Sim(w, st);
    const [p] = core(st);
    p.needs!.rest = 8;
    p.needs!.food = 30;
    // zasypia z wyczerpania
    while (st.tick < atHour(2, 9.5) && !(p.job?.t === 'sleep' && p.job.phase === 1)) sim.step();
    expect(p.job?.t).toBe('sleep');
    // ktoś ugotował: garnek na stole
    const food = st.things.find((t) => t.kind === 'jedzenie')!;
    st.things.push({ ...food, id: st.nextThing++, kind: 'posilek', n: 3 });
    const meal0 = p.lastMeal;
    let ate = false;
    let backToSleep = false;
    while (st.tick < atHour(2, 11)) {
      sim.step();
      if (!ate && p.lastMeal !== meal0) ate = true;
      if (ate && p.job?.t === 'sleep' && p.job.phase === 1) backToSleep = true;
    }
    expect(ate).toBe(true);
    expect(backToSleep).toBe(true);
  });
});
