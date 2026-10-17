import { describe, expect, it } from 'vitest';
import { moodOf, type NeedCtx, type Needs, startNeeds, stepNeeds } from '../../src/sim/needs.ts';

const idle = (temp: number): NeedCtx => ({ temp, fire: false, asleep: false, busy: false });
const hours = (n: Needs, ctx: NeedCtx, h: number) => {
  // tak jak w symulacji: małe kroki co półtorej minuty gry
  for (let k = 0; k < h * 40; k++) stepNeeds(n, ctx, 1 / 40);
};
const with_ = (p: Partial<Needs>): Needs => ({ ...startNeeds(), ...p });

describe('potrzeby rdzenia', () => {
  it('ciepło spada w zimnie, rośnie w cieple, najszybciej przy palącej się kozie', () => {
    const cold = with_({ warm: 50 });
    hours(cold, idle(9), 1);
    expect(cold.warm).toBeLessThan(45);
    const frost = with_({ warm: 50 });
    hours(frost, idle(0), 1);
    expect(frost.warm).toBeLessThan(cold.warm);
    const warm = with_({ warm: 50 });
    hours(warm, idle(21), 1);
    expect(warm.warm).toBeGreaterThan(55);
    const fire = with_({ warm: 50 });
    hours(fire, { ...idle(12), fire: true }, 1);
    expect(fire.warm).toBeGreaterThan(warm.warm);
    expect(fire.warm).toBeGreaterThan(75);
  });

  it('głód i zmęczenie rosną z czasem, ciężka praca męczy bardziej, sen przywraca siły', () => {
    const awake = with_({ food: 80, rest: 80 });
    hours(awake, idle(18), 5);
    expect(awake.food).toBeLessThan(70);
    expect(awake.food).toBeGreaterThan(50);
    expect(awake.rest).toBeLessThan(70);
    const busy = with_({ food: 80, rest: 80 });
    hours(busy, { ...idle(18), busy: true }, 5);
    expect(busy.rest).toBeLessThan(awake.rest);
    const asleep = with_({ food: 80, rest: 30 });
    hours(asleep, { ...idle(18), asleep: true }, 5);
    expect(asleep.rest).toBeGreaterThan(70);
    expect(asleep.food).toBeGreaterThan(awake.food);
  });

  it('nastrój wynika z pozostałych potrzeb', () => {
    const n = with_({ food: 80, warm: 80, rest: 80, health: 80 });
    expect(Math.abs(moodOf(n) - 80)).toBeLessThan(1);
    const hungry = { ...n, food: 10 };
    expect(moodOf(hungry)).toBeLessThan(moodOf(n) - 20);
    const s = with_({ food: 40, warm: 30, rest: 60 });
    hours(s, idle(12), 1);
    expect(s.mood).toBe(moodOf(s));
  });

  it('zdrowie spada przy mrozie i głodzie, wraca w cieple i po jedzeniu', () => {
    const n = with_({ warm: 5, food: 5, health: 100 });
    hours(n, idle(-5), 10);
    expect(n.health).toBeLessThan(90);
    const sick = n.health;
    Object.assign(n, { warm: 90, food: 90, rest: 90 });
    hours(n, idle(21), 10);
    expect(n.health).toBeGreaterThan(sick);
  });

  it('wszystkie potrzeby zostają w zakresie 0–100', () => {
    const a = startNeeds();
    hours(a, idle(-20), 100);
    const b = startNeeds();
    hours(b, { temp: 25, fire: true, asleep: true, busy: false }, 100);
    for (const n of [a, b])
      for (const v of Object.values(n)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
  });
});
