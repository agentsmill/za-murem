/* Dane testowe offline: kafelki OpenFreeMap (z=14) dla trzech adresów i przykład z Overpass. */

import fs from 'node:fs';
import path from 'node:path';
import type { Geo } from '../../src/world/geo.ts';
import { geoKwadratu } from '../../src/world/geoKwadratu.ts';
import { type Uklad, ukladZGeo } from '../../src/world/kwadraty.ts';
import { type DecodedTile, decode, toGeoT, WANT } from '../../src/world/mvt.ts';
import { LOAD_RADIUS } from '../../src/world/world.ts';

export const FIX = path.resolve(import.meta.dirname, '../fixtures');

export interface Address {
  key: string;
  label: string;
  lat: number;
  lon: number;
  tiles: [number, number][];
}

export const ADDRESSES: Address[] = [
  {
    key: 'przymorze',
    label: 'Obrońców Wybrzeża, Gdańsk (falowiec, wielka płyta)',
    lat: 54.4093,
    lon: 18.5991,
    tiles: [
      [9037, 5228],
      [9038, 5228],
      [9037, 5229],
      [9038, 5229],
    ],
  },
  {
    key: 'lanciego',
    label: 'Lanciego 10G, Warszawa Ursynów (bloki i szeregowce)',
    lat: 52.144625,
    lon: 21.0579432,
    tiles: [
      [9149, 5400],
      [9150, 5400],
      [9149, 5401],
      [9150, 5401],
    ],
  },
  {
    key: 'zielonki',
    label: 'Spacerowa 10, Batowice, gm. Zielonki (domy jednorodzinne)',
    lat: 50.1125175,
    lon: 20.02278,
    tiles: [
      [9102, 5548],
      [9103, 5548],
      [9102, 5549],
      [9103, 5549],
    ],
  },
];

export function tileBytes(x: number, y: number): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIX, 'mvt', `t_${x}_${y}.pbf`)));
}

export function decodedTiles(a: Address, want = WANT): DecodedTile[] {
  return a.tiles.map(([x, y]) => ({ x, y, L: decode(tileBytes(x, y), want) }));
}

/* Kwadraty obok domu z kafelków testowych (miasto z kwadratów). Kafelki każdego adresu pokrywają co najmniej ±720 m
   wokół niego, więc dane (zapas 318 m wokół środka kwadratu) starczają na dom i ośmiu sąsiadów przy kątach obrotu trzech
   adresów (najmniejszy zapas na brzegu danych to 45,8 m). Kafelki, które kafelkiKwadratu podaje dla sąsiada, bywają
   szersze niż te cztery, więc kilka budynków przy brzegu danych (osiem w sąsiadach Przymorza) ma obrys uciętego kafelka
   i klucz inny niż przy pełnych danych. Dekodowanie czterech kafelków trwa dziesiątki milisekund, więc robimy je raz na
   proces. Geo liczy się za każdym razem od nowa, bo testy czasem je zmieniają. */

const kafelkiAdresow = new Map<string, DecodedTile[]>();
/** kafelki adresu zdekodowane raz na proces (tylko do odczytu) */
export function kafelkiAdresu(a: Address): DecodedTile[] {
  let t = kafelkiAdresow.get(a.key);
  if (!t) kafelkiAdresow.set(a.key, (t = decodedTiles(a)));
  return t;
}

/** geo domu z kafelków, takie jak w grze (load): promień LOAD_RADIUS wokół adresu, bez opcji */
export function geoDomuTestowego(a: Address): Geo {
  return toGeoT(kafelkiAdresu(a), a.lat, a.lon, LOAD_RADIUS);
}

const ukladyAdresow = new Map<string, Uklad>();
/** układ domu adresu: środek, kąt obrotu liczony jak w buildWorld i bok 384 */
export function ukladTestowy(a: Address): Uklad {
  let u = ukladyAdresow.get(a.key);
  if (!u) ukladyAdresow.set(a.key, (u = ukladZGeo(geoDomuTestowego(a))));
  return u;
}

/** geo kwadratu (sx, sy) z kafelków testowych adresu: geoKwadratu w układzie domu tego adresu */
export function geoKwadratuTestowego(a: Address, sx: number, sy: number): Geo {
  return geoKwadratu(kafelkiAdresu(a), ukladTestowy(a), sx, sy);
}

export function overpassJson(): { elements: unknown[] } {
  return JSON.parse(fs.readFileSync(path.join(FIX, 'overpass', 'przymorze.json'), 'utf8'));
}
