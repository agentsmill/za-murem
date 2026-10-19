/* Geo kwadratu z kafelków (miasto z kwadratów, etap 1, projekt docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md,
   sekcja „Dane kwadratu”). To samo co `toGeoT` dla domu, ale filtr bliskości (LOAD_RADIUS + 30 m) i promień miejsc
   (720 m) liczą się od środka kwadratu zamiast od adresu, a budowla, którą filtr złapał, trafia do geo w całości
   (wszystkie kawałki z pobranych kafelków, także dalekie i maleńkie), żeby jej prostowanie było w każdym kwadracie
   takie samo. Współrzędne zostają w metrach od adresu (układ domu, bez obrotu) i z tym samym zaokrągleniem do 0,5 m,
   a tagi `zm:klucz` i `zm:os` liczą się z całych budowli jak dla domu.
   Kafelki do pobrania dla kwadratu podaje `kafelkiKwadratu` (kwadraty.ts). Geo domu (0, 0) buduje zwykłe `toGeoT`
   bez tych opcji i nie przechodzi przez tę funkcję: dom ma zostać bit w bit taki, jaki jest. */

import type { Geo } from './geo.ts';
import { srodekKwadratu, type Uklad } from './kwadraty.ts';
import { type DecodedTile, toGeoT } from './mvt.ts';
import { LOAD_RADIUS } from './world.ts';

export function geoKwadratu(tiles: DecodedTile[], u: Uklad, sx: number, sy: number): Geo {
  return toGeoT(tiles, u.c[0], u.c[1], LOAD_RADIUS, { srodek: srodekKwadratu(u, sx, sy), caleBudynki: true });
}
