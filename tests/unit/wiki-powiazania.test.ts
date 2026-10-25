/* Wiki a reszta interfejsu: paski potrzeb na karcie osoby i szczegóły budowli w panelu budowy niosą `data-wiki` z identyfikatorem
   artykułu, który istnieje (obsługa kliknięcia jest jedna, na dokumencie, w src/ui/wiki-okno.ts). */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { BLOK, wordsEn, wordsOf } from '../../src/gov/miejsce.ts';
import { BUILDS } from '../../src/sim/budowle.ts';
import type { SimPerson } from '../../src/sim/snapshot.ts';
import { buildMenu, buildPanelHtml } from '../../src/ui/budowa.ts';
import { NEED_ORDER, personCard } from '../../src/ui/karta.ts';
import { maArtykul } from '../../src/ui/wiki.ts';

afterEach(() => ustawJezyk('pl'));

const osoba = {
  pawn: 1,
  osoba: 0,
  id: 's1',
  name: 'Anna Kowalska',
  first: 'Anna',
  f: true,
  age: 40,
  prof: 'Hydraulik',
  skills: { cieplo: 4 },
  traits: ['pracowity'],
  needs: { food: 80, warm: 60, rest: 70, health: 90, safe: 55, mood: 65 },
  moods: [],
  bite: null,
  weapon: null,
  ammo: null,
  doing: 'Czeka.',
  sam: false,
  praca: { stale: null, zaSiatke: true },
} as unknown as SimPerson;

describe('karta osoby', () => {
  it('każdy pasek potrzeby otwiera artykuł o tej potrzebie', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const html = personCard(osoba, 0);
      for (const k of NEED_ORDER) {
        expect(html, `${lang} ${k}`).toContain(`data-wiki="potrzeba:${k}"`);
        expect(maArtykul(`potrzeba:${k}`), k).toBe(true);
      }
    }
  });
});

describe('panel budowy', () => {
  it('szczegóły każdej budowli mają znaczek „i” z artykułem o niej, bez polskiego słowa w angielskim tekście', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const menu = buildMenu({}, () => true, wordsOf(BLOK), wordsEn(BLOK), { showLocked: true });
      const html = menu.map((c) => buildPanelHtml(menu, { tab: c.key, kind: null }, false).body).join('');
      for (const kind of Object.keys(BUILDS)) {
        if (!menu.some((c) => c.items.some((b) => b.kind === kind))) continue;
        expect(html, `${lang} ${kind}`).toContain(`data-wiki="budowla:${kind}"`);
        expect(maArtykul(`budowla:${kind}`), kind).toBe(true);
      }
    }
  });
});
