/* Kanał książek w atrapie symulacji zarządu (tests/unit/gov-atrapa.ts): skutki GovEffects.books trafiają na półkę
   atrapy jak w applyGov (najwyżej 2 na dziedzinę, trzecia to +1 drewna), a wejście zarządu ma `books` i `know` jak
   govInput (wiedza = najlepsza osoba na miejscu plus najwyżej 2 książki z dziedziny). */

import { describe, expect, it } from 'vitest';
import type { TechDom } from '../../src/content/data.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { Atrapa } from './gov-atrapa.ts';

const fxKsiazki = (...books: TechDom[]) => ({ ...emptyEffects(), books });

/** atrapa z umiejętnościami ustawionymi na sztywno (generator daje ludziom losowe) */
function atrapa(...skills: Atrapa['people'][number]['skills'][]): Atrapa {
  const atr = new Atrapa(1);
  atr.people.forEach((p, k) => {
    p.skills = skills[k] ?? {};
  });
  return atr;
}

describe('atrapa zarządu: książki i wiedza', () => {
  it('półka przyjmuje dwie książki z dziedziny, trzecia to drewno', () => {
    const atr = new Atrapa(1);
    const drewno = atr.woodLoose;
    atr.apply(fxKsiazki('bud', 'cieplo', 'bud'));
    expect(atr.input().books).toEqual({ bud: 2, cieplo: 1 });
    expect(atr.woodLoose).toBe(drewno);
    atr.apply(fxKsiazki('bud', 'bud'));
    expect(atr.input().books).toEqual({ bud: 2, cieplo: 1 });
    expect(atr.woodLoose).toBe(drewno + 2);
  });

  it('wejście nie dzieli półki z atrapą: zmiana kopii nic nie rusza', () => {
    const atr = new Atrapa(1);
    atr.apply(fxKsiazki('med'));
    const i = atr.input();
    i.books!.med = 9;
    expect(atr.books.med).toBe(1);
  });

  it('wiedza to najlepsza osoba na miejscu plus najwyżej 2 książki z dziedziny', () => {
    const atr = atrapa({ bud: 3 }, { bud: 1, med: 2 });
    expect(atr.input().know).toMatchObject({ bud: 3, med: 2, uprawa: 0 });
    atr.apply(fxKsiazki('bud', 'bud', 'bud', 'uprawa'));
    expect(atr.input().know).toMatchObject({ bud: 5, med: 2, uprawa: 1 });
    // ręcznie wstawiona nadwyżka na półce też liczy się najwyżej za dwie
    atr.books.med = 5;
    expect(atr.input().know?.med).toBe(2 + 2);
  });

  it('osoba na wyprawie nie liczy się do wiedzy', () => {
    const atr = atrapa({ bud: 3 }, { bud: 1 });
    atr.away[atr.people[0].id] = 99999;
    expect(atr.input().know?.bud).toBe(1);
    delete atr.away[atr.people[0].id];
    expect(atr.input().know?.bud).toBe(3);
  });
});
