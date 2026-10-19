/* Etap 1 pięter nie dotyka symulacji (docs/superpowers/specs/2026-10-18-pietra-design.md, „Ograniczenia”): ta sama gra
   na demie z flagą `pietra` i bez niej ma ten sam skrót stanu (`sim.hash()`) na starcie i po dobie bez poleceń. Awans
   domów zmienia tylko `WorldBuilding.levels`, które czyta liczenie pięter do przeszukania i rysowanie, a nie ta część
   symulacji. Liczby z flagą są zapisane w docs/POSTEP.md (wpis o piętrach). */

import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { demoSwiat } from './pietra-pomoc.ts';

const SEED = 5;

describe.each(['przymorze', 'lanciego', 'zielonki'] as const)('symulacja z flagą pięter i bez: %s', (klucz) => {
  const gra = (pietra: boolean) => {
    const w = demoSwiat(klucz, pietra);
    return new Sim(w, createSim(w, SEED, { core: 4 }));
  };

  it('skrót stanu na starcie i po dobie bez poleceń jest ten sam', () => {
    const bez = gra(false);
    const z = gra(true);
    expect(z.hash()).toBe(bez.hash());
    for (let i = 0; i < TICKS_PER_HOUR * 24; i++) {
      bez.step();
      z.step();
    }
    expect(z.hash()).toBe(bez.hash());
  });
});
