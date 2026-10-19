/* Premie z badań w pracy ludzi (src/sim/surowce.ts `pracaPrzepisu`, src/sim/praca.ts `tempoPracy`), po scaleniu `praca-ludzi`
   z `noc-integracja` f13ad36: czas pracy w warsztacie składa się z dwóch niezależnych przyspieszeń, które się mnożą:
   t_spawanie (części 1,5 raza szybciej, w `pracaPrzepisu`) i umiejętność osoby (`1 + 0,1 · poziom`, w `tempoPracy`, od
   pierwszego rana). `sawWork` liczy je razem: `czasPracy(p, 'warsztat', pracaPrzepisu(...))`. Sim na atrapie bloku. */

import { describe, expect, it } from 'vitest';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { RECIPES } from '../../src/sim/surowce.ts';
import { mockBlock } from './interior-mock.ts';
import { skonczSamouczek } from './praca-pomoc.ts';

const block = mockBlock();
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - START_MINUTES / 60) * TICKS_PER_HOUR);

function rzecz(st: SimState, kind: string, x: number, y: number, over: Partial<Thing> = {}): Thing {
  const t: Thing = { id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n: 0, fuel: 0, by: -1, owner: -1, ...over };
  st.things.push(t);
  return t;
}

/** czas jednej części z polecenia „piłuj” (j.until − j.t0): dzień i godzina gry, techDone i umiejętność osoby */
function czasCzesci(o: { dzien: number; godzina: number; tech?: string[]; elek?: number }): number {
  const st = createSim(block, 5, { core: 1 });
  if (o.tech) st.techDone = [...o.tech];
  const sim = new Sim(block, st);
  skonczSamouczek(sim);
  st.tick = atHour(o.dzien, o.godzina);
  const p = st.pawns.find((q) => q.kind === 'core')!;
  st.people[p.person].skills = o.elek ? { elek: o.elek } : {};
  Object.assign(p.needs!, { food: 100, warm: 100, rest: 100 });
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 10 * TICKS_PER_HOUR;
  rzecz(st, 'warsztat', 60, 61, { w: 2, h: 1 });
  rzecz(st, 'zlom', 56, 61, { n: 4 });
  p.job = null;
  p.wait = st.tick;
  sim.push({ t: 'saw', ids: [p.id], what: 'czesci', n: 1 });
  for (let k = 0; k < 4000 && !(p.job?.t === 'saw' && p.job.phase === 1); k++) sim.step();
  expect(p.job?.t).toBe('saw');
  return p.job!.until - p.job!.t0;
}

describe('warsztat: t_spawanie i umiejętność mnożą się', () => {
  const praca = RECIPES.czesci.work;

  it('od pierwszego rana: praca / 1,5 (spawanie) / 1,4 (elek 4), każde z osobna i oba naraz', () => {
    // czas bez zaokrąglenia (tempo 1) liczy się z dokładnością odejmowania liczb zmiennoprzecinkowych przy dużym ticku
    expect(czasCzesci({ dzien: 2, godzina: 9 })).toBeCloseTo(praca, 6);
    expect(czasCzesci({ dzien: 2, godzina: 9, tech: ['t_spawanie'] })).toBeCloseTo(praca / 1.5, 6);
    expect(czasCzesci({ dzien: 2, godzina: 9, elek: 4 })).toBe(Math.round(praca / 1.4));
    expect(czasCzesci({ dzien: 2, godzina: 9, elek: 4, tech: ['t_spawanie'] })).toBe(Math.round(praca / 1.5 / 1.4));
  });

  it('przed pierwszym rankiem umiejętność nic nie zmienia, a spawanie działa od razu', () => {
    expect(czasCzesci({ dzien: 1, godzina: 16, elek: 4 })).toBeCloseTo(praca, 6);
    expect(czasCzesci({ dzien: 1, godzina: 16, elek: 4, tech: ['t_spawanie'] })).toBeCloseTo(praca / 1.5, 6);
  });

  it('cudze badanie (t_okna) nie przyspiesza warsztatu', () => {
    expect(czasCzesci({ dzien: 2, godzina: 9, elek: 4, tech: ['t_okna'] })).toBe(Math.round(praca / 1.4));
  });
});
