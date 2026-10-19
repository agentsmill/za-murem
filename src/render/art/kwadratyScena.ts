/* Opcje sceny kwadratu miasta obok domu (miasto z kwadratów, etap 1): `opcjeSceny` składa to, co buildScene dostaje poza
   światem kwadratu. Początek kwadratu w układzie miasta (szum i wzory liczą się od współrzędnych miasta, więc łączą się
   przez szew). Ziarno stylu budynku z jego klucza (zm:klucz) i ziarna gry, nie z numeru w kwadracie: ten sam budynek po
   obu stronach szwu ma ten sam kolor ściany, szum dachu i zapalone okna. Dom wygrywa na szwie: kawałek budynku
   sąsiadującego kafelkami z budynkiem domu dostaje styl tego budynku z jego sceny (przesunięty do układu kwadratu,
   przesunStyl), więc fasada, grzbiet dachu i kolor idą przez granicę bez załamania, a wygląd domu się nie zmienia.
   Budynek bez klucza i bez sąsiada w domu dostaje styl jak zawsze (z numeru w kwadracie). Bez PixiJS i DOM. */

import { kluczBudynku } from '../../world/klucze.ts';
import { budynkiZDomem } from '../../world/kwadraty.ts';
import type { World } from '../../world/world.ts';
import { type OpcjeSceny, przesunStyl, type Scene, TILE, ziarnoStyluZKlucza } from './scene.ts';

export interface DaneOpcji {
  /** świat kwadratu (buildKwadrat) */
  swiat: Pick<World, 'size' | 'bid'>;
  /** świat domu (do sąsiedztwa budynków przez szew) */
  dom: Pick<World, 'size' | 'bid'>;
  /** scena domu: jej style są stylami budynków domu */
  sceneDomu: Pick<Scene, 'styles'>;
  /** położenie kwadratu w kwadratach od domu */
  sx: number;
  sy: number;
  /** ziarno gry */
  seed: number;
}

/** Opcje sceny (poczatek, ziarnoStylu, stylDomu) kwadratu (sx, sy) obok domu. */
export function opcjeSceny(d: DaneOpcji): OpcjeSceny {
  const bok = d.swiat.size * TILE;
  const zDomem = budynkiZDomem(d.dom, d.swiat, d.sx, d.sy);
  return {
    poczatek: { x: d.sx * bok, y: d.sy * bok },
    ziarnoStylu: (b) => {
      const k = kluczBudynku(b);
      return k ? ziarnoStyluZKlucza(d.seed, k) : undefined;
    },
    stylDomu: (b) => {
      const hb = zDomem.get(b.id);
      return hb === undefined ? undefined : przesunStyl(d.sceneDomu.styles[hb], d.sx * bok, d.sy * bok);
    },
  };
}
