/* Pomocnik testów wydarzeń z miejsca: światy demo z ziarnem z adresu (jak w przeglądarce) i małe światy
   z kilku budynków do sprawdzania opisu miejsca. */

import fs from 'node:fs';
import path from 'node:path';
import { hashString } from '../../src/core/rng.ts';
import type { PlaceWorld } from '../../src/gov/miejsce.ts';
import { buildWorld, type World, type WorldBuilding } from '../../src/world/world.ts';

/** słowa, których w domu jednorodzinnym nie ma w tekstach zarządu: klatka, piętro, blok, spółdzielnia, pawilon… */
export const FORBIDDEN_DOM = /klatk|piętr|spółdziel|pawilon|szlaban|świetlic|czynsz|blok|mieszkani/i;

const cache = new Map<string, { w: World; seed: number }>();

/** świat demo z public/demo z ziarnem z adresu */
export function demoWorld(key: string): { w: World; seed: number } {
  let c = cache.get(key);
  if (!c) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
    c = { w: buildWorld(d.geo, { seed, street: d.street }), seed };
    cache.set(key, c);
  }
  return c;
}

/** budynek o środku (x, y) w metrach, bok 10 m */
export function bud(
  id: number,
  cls: WorldBuilding['cls'],
  x: number,
  y: number,
  o: { levels?: number; area?: number } = {},
): WorldBuilding {
  return {
    id,
    cls,
    levels: o.levels ?? 1,
    name: `${cls} ${id}`,
    area: o.area ?? 100,
    tiles: 100,
    x0: x - 5,
    y0: y - 5,
    x1: x + 5,
    y1: y + 5,
    cats: [],
    entrances: [],
    tags: {},
  };
}

/** mały świat: siedziba to pierwszy budynek, mieszkań siedziby tyle, ile podano */
export function placeWorld(buildings: WorldBuilding[], apts = 1, pois: PlaceWorld['pois'] = []): PlaceWorld {
  return {
    buildings,
    hq: buildings[0].id,
    pois,
    apts: Array.from({ length: apts }, (_, k) => ({
      bid: buildings[0].id,
      apt: k,
      state: k ? 'mieszkancy' : 'zarzad',
    })),
  };
}
