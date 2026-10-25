/* Sondy wiki (src/ui/wiki-sondy.ts): małe wejścia do czystych funkcji gry, z których wiki odczytuje progi i tempa zamiast je
   przepisywać. Każda sonda jest tu porównana z bezpośrednim wywołaniem funkcji gry po obu stronach progu. */

import { describe, expect, it } from 'vitest';
import { canGo } from '../../src/gov/noc.ts';
import { moodOf, type NeedCtx, type Needs, stepNeeds } from '../../src/sim/needs.ts';
import {
  granica,
  karaNastroju,
  odKtorej,
  progiKarty,
  progiZdrowia,
  sondaOsoba,
  sondaStan,
  sondaStanZUchwalami,
  sondaWejscie,
  stawka,
} from '../../src/ui/wiki-sondy.ts';

const CTX: NeedCtx = { temp: 20, fire: false, asleep: false, busy: false, dark: false, inside: true, company: 2 };

describe('granica i odKtorej', () => {
  it('granica znajduje próg rosnący i malejący i zaokrągla do liczby całkowitej', () => {
    expect(granica((v) => v >= 42.4)).toBe(42);
    expect(granica((v) => v < 15)).toBe(15);
    expect(granica((v) => v > 70)).toBe(70);
  });

  it('odKtorej daje pierwszą liczbę całkowitą, od której warunek jest prawdziwy', () => {
    expect(odKtorej((v) => v >= 25)).toBe(25);
    expect(odKtorej((v) => v > 25)).toBe(26);
    expect(odKtorej(() => false)).toBe(100);
  });
});

describe('stawka', () => {
  it('to zmiana potrzeby w godzinie gry, zaokrąglona do 0,1', () => {
    const n: Needs = { food: 60, warm: 60, rest: 60, health: 60, safe: 60, mood: 60 };
    stepNeeds(n, CTX, 1);
    expect(stawka('food')).toBe(n.food - 60);
    expect(stawka('rest')).toBe(Math.round((n.rest - 60) * 10) / 10);
    expect(stawka('food', { asleep: true })).toBe(-2);
  });
});

describe('progiZdrowia', () => {
  /** zmiana zdrowia na godzinę w bardzo krótkim kroku, wprost z funkcji gry */
  const dh = (start: Partial<Needs>): number => {
    const n: Needs = { food: 100, warm: 100, rest: 100, health: 80, safe: 60, mood: 60, ...start };
    stepNeeds(n, CTX, 1e-6);
    return (n.health - 80) / 1e-6;
  };

  it('zimno, głód i zmęczenie zabierają zdrowie poniżej progów, a ciepło i najedzenie przywracają je powyżej', () => {
    const p = progiZdrowia();
    expect(dh({ warm: p.zimno - 0.5 })).toBeLessThan(0);
    expect(dh({ warm: p.zimno + 0.5 })).toBeGreaterThanOrEqual(0);
    expect(dh({ food: p.glod - 0.5 })).toBeLessThan(0);
    expect(dh({ food: p.glod + 0.5 })).toBeGreaterThanOrEqual(0);
    expect(dh({ rest: p.zmeczenie - 0.5 })).toBeLessThan(0);
    expect(dh({ rest: p.zmeczenie + 0.5 })).toBeGreaterThanOrEqual(0);
    expect(dh({ warm: p.powrotCiepla - 0.5 })).toBeLessThanOrEqual(0);
    expect(dh({ warm: p.powrotCiepla + 0.5 })).toBeGreaterThan(0);
    expect(dh({ food: p.powrotJedzenia - 0.5 })).toBeLessThanOrEqual(0);
    expect(dh({ food: p.powrotJedzenia + 0.5 })).toBeGreaterThan(0);
  });
});

describe('karaNastroju', () => {
  it('potrzeba poniżej progu odejmuje punkty od nastroju', () => {
    const { prog, punkty } = karaNastroju();
    const n = (food: number): Needs => ({ food, warm: 50, rest: 50, health: 50, safe: 50, mood: 0 });
    const liniowo = (v: number) => moodOf(n(50)) + (v - 50) * 0.25;
    expect(moodOf(n(prog - 1))).toBeCloseTo(liniowo(prog - 1) - punkty, 6);
    expect(moodOf(n(prog))).toBeCloseTo(liniowo(prog), 6);
  });
});

describe('progiKarty', () => {
  it('zgadza się z canGo i z opcjami karty nocy po obu stronach progu', () => {
    const p = progiKarty();
    const osoba = (needs: Partial<Needs>) => sondaOsoba({ needs: needs as Needs });
    expect(canGo(osoba({ rest: p.blisko.rest - 1 }), { range: 'blisko' })).toBe(false);
    expect(canGo(osoba({ rest: p.blisko.rest }), { range: 'blisko' })).toBe(true);
    expect(canGo(osoba({ health: p.blisko.health - 1 }), { range: 'blisko' })).toBe(false);
    expect(canGo(osoba({ health: p.blisko.health }), { range: 'blisko' })).toBe(true);
    expect(canGo(osoba({ rest: p.daleko.rest - 1 }), { range: 'daleko' })).toBe(false);
    expect(canGo(osoba({ rest: p.daleko.rest }), { range: 'daleko' })).toBe(true);
    expect(canGo(osoba({ health: p.daleko.health - 1 }), { range: 'daleko' })).toBe(false);
    expect(canGo(osoba({ health: p.daleko.health }), { range: 'daleko' })).toBe(true);
    // warta i dyżur przy kozie: tylko progi zdrowia, w kolejności rosnącej
    expect(p.warta).toBeLessThan(p.koza);
    expect(p.koza).toBeLessThanOrEqual(p.blisko.health);
  });
});

describe('osoba, wejście i stan z sond', () => {
  it('częściowe potrzeby dopełniają się do pełnych', () => {
    const o = sondaOsoba({ needs: { health: 30 } as Needs });
    expect(o.needs).toEqual({ food: 100, warm: 100, rest: 100, health: 30, safe: 100, mood: 100 });
  });

  it('wejście ma godzinę 20:00 dnia 1 i siatkę bez dziur, a uchwały wpisują się do stanu', () => {
    const i = sondaWejscie();
    expect([i.day, i.hour, i.minute]).toEqual([1, 20, 0]);
    expect(i.fence?.holes).toEqual([]);
    const st = sondaStanZUchwalami('u_warty', 'u_brama');
    expect(st.laws.signed).toEqual({ u_warty: true, u_brama: true });
    expect(sondaStan().laws.signed).toEqual({});
  });
});
