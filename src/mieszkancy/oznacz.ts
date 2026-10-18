/* Oznaczanie mapy budynkami generatora: każdy segment `geo.b`, który wszedł do budynku z `budynkiZCzlonkami`, dostaje
   tag `zm:bud` równy `Budynek.klucz`. Tag jedzie z `GeoBuilding.t` do świata gry (`WorldBuilding.tags`), więc
   budynek świata odnajduje swój budynek generatora bez dopasowywania po geometrii. Czysta funkcja: wejście zostaje
   nietknięte, bez losowości i zegara. */

import type { Geo } from '../world/geo.ts';
import type { BudynekZCzlonkami } from './budynki.ts';

/** Nazwa tagu z kluczem budynku generatora (`Budynek.klucz`) na każdym członku. */
export const TAG_BUDYNKU = 'zm:bud';

/** Kopia `geo`, w której `b[i].t['zm:bud']` to klucz budynku dla każdego członka `i` każdej pary. Kopia jest płytka:
    zmienione są tylko członkowie (nowy obiekt `GeoBuilding` z nowym `t`), a pozostałe budynki i reszta mapy
    (drogi, tereny, punkty) są te same obiekty co w `geo`. Indeks poza mapą jest pomijany; gdy ten sam indeks wystąpi
    w kilku parach, wygrywa ostatnia. Wcześniej nadany `zm:bud` na budynkach spoza par zostaje. */
export function oznaczGeo(geo: Geo, pary: readonly BudynekZCzlonkami[]): Geo {
  const klucze = new Map<number, string>();
  for (const { budynek, czlonkowie } of pary) {
    for (const i of czlonkowie) {
      if (Number.isInteger(i) && i >= 0 && i < geo.b.length) klucze.set(i, budynek.klucz);
    }
  }
  return {
    ...geo,
    b: geo.b.map((b, i) => {
      const klucz = klucze.get(i);
      return klucz === undefined ? b : { ...b, t: { ...b.t, [TAG_BUDYNKU]: klucz } };
    }),
  };
}
