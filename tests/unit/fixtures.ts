/* Dane testowe offline: kafelki OpenFreeMap (z=14) dla trzech adresów i przykład z Overpass. */

import fs from 'node:fs';
import path from 'node:path';
import { type DecodedTile, decode, WANT } from '../../src/world/mvt.ts';

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

export function overpassJson(): { elements: unknown[] } {
  return JSON.parse(fs.readFileSync(path.join(FIX, 'overpass', 'przymorze.json'), 'utf8'));
}
