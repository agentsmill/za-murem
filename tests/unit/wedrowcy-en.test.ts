/* Wędrowcy po angielsku: wieść zostaje w stanie po polsku, a wiescEn daje dokładnie angielską wersję z gossip()
   i przeszukali (dla wielu losowań i stanów), ogłoszenia mają angielską listę o tej samej długości, a linia
   o napaści w kronice mówi słowami miejsca (the board przy the gate, w domu the street committee i the garden gate). */

import { describe, expect, it } from 'vitest';
import { ADS_EN } from '../../src/content/data.en.ts';
import { ADS } from '../../src/content/data.ts';
import { BLOK, wordsEn, wordsOf } from '../../src/gov/miejsce.ts';
import { WIESC } from '../../src/gov/wiesci.ts';
import { gossip, gossipText, NAPISY, wiescEn } from '../../src/sim/wedrowcy.ts';
import { POLSKIE } from './po-angielsku.ts';

describe('wędrowcy po angielsku', () => {
  it('ogłoszenia ze słupa: ta sama liczba i bez polskich liter', () => {
    expect(ADS_EN).toHaveLength(ADS.length);
    for (const a of ADS_EN) expect(POLSKIE.test(a), a).toBe(false);
  });

  it('wiescEn tłumaczy każdą wieść z rozmowy i o ekipie przy wraku tak jak gossip po angielsku', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const rng = { s: seed * 7919 };
      const ctx = { traderIn: (seed % 6) - 1, wrecksLeft: seed % 9 };
      const n = gossip(ctx, rng);
      expect(wiescEn(n.pl)).toBe(n.en);
      expect(POLSKIE.test(n.en.replace(/“.*”/, '')), n.en).toBe(false);
      seen.add(n.pl.slice(0, 40));
    }
    // wszystkie cztery rodzaje wieści się trafiły
    expect(seen.size).toBeGreaterThanOrEqual(4);
    for (const model of ['maluch', 'polonez']) {
      const n = NAPISY.przeszukali(model);
      expect(wiescEn(n.pl)).toBe(n.en);
    }
    expect(wiescEn('Coś, czego nie ma w słowniku.')).toBe('Coś, czego nie ma w słowniku.');
  });

  it('jedno auto i kilka aut po angielsku', () => {
    expect(gossipText(1, { traderIn: 0, wrecksLeft: 1 }, 0).en).toBe(
      'The wanderer says there is still 1 car by the road that nobody has searched.',
    );
    expect(gossipText(1, { traderIn: 0, wrecksLeft: 3 }, 0).en).toBe(
      'The wanderer says there are still 3 cars by the road that nobody has searched.',
    );
  });

  it('wieść o napaści w kronice ze słowami miejsca', () => {
    const blok = WIESC.handlarz(wordsOf(BLOK).Zarzad, wordsOf(BLOK).brama.pod, wordsEn(BLOK));
    expect(blok.en).toBe('Word gets around: the board robbed the trader at the gate. People are asking who’s next.');
    const dom = { ...BLOK, kind: 'dom' as const, near: 'domy' as const };
    const w = wordsOf(dom);
    const e = WIESC.handlarz(w.Zarzad, w.brama.pod, wordsEn(dom));
    expect(e.en).toBe(
      'Word gets around: the street committee robbed the trader at the garden gate. People are asking who’s next.',
    );
    expect(e.pl).toContain('komitet ulicy napadł na handlarza');
    expect(WIESC.wedrowiec(w.Zarzad, w.brama.pod, wordsEn(dom)).en).toBe(
      'Word gets around: the street committee robbed a wanderer. People are shaking their heads.',
    );
  });
});
