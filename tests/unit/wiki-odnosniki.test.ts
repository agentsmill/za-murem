/* Wiki w grze po zejściu obu gałęzi (wiki: kategorie 1–8, wiki-2: kategorie 9–13): każdy odnośnik „Zobacz też”, każdy
   czip paska i każdy uzgodniony między sesjami identyfikator prowadzi do istniejącego artykułu, bez wyjątków. Silnik
   (src/ui/wiki.ts) po cichu wycina z HTML odnośniki do nieznanych artykułów, więc bez tego testu literówka w identyfikatorze
   znikałaby bez śladu. Sprawdzane we wszystkich przypadkach: blok i dom, polski i angielski, mysz i dotyk. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { CZIPY, KATEGORIE, maArtykul, rejestr } from '../../src/ui/wiki.ts';
import { PRZYPADKI, UZGODNIONE, zbuduj } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

describe('odnośniki wiki po scaleniu', () => {
  for (const p of PRZYPADKI) {
    it(`każdy „Zobacz też” prowadzi do istniejącego artykułu (${p.opis})`, () => {
      const { artykuly } = zbuduj(p);
      const zle = artykuly.flatMap((a) => a.zobacz.filter((z) => !maArtykul(z)).map((z) => `${a.id} → ${z}`));
      expect(zle).toEqual([]);
    });
  }

  it('identyfikatory uzgodnione między sesjami istnieją', () => {
    expect([...UZGODNIONE].filter((id) => !maArtykul(id))).toEqual([]);
  });

  it('każdy czip paska otwiera istniejący artykuł', () => {
    expect(Object.entries(CZIPY).filter(([, id]) => !maArtykul(id))).toEqual([]);
  });

  it('każda kategoria ma artykuły', () => {
    const kat = new Set(rejestr().map((d) => d.kat));
    expect(KATEGORIE.filter((k) => !kat.has(k))).toEqual([]);
  });
});
