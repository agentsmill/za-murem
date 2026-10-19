/* Pomoce testów kwadratów w rysowaniu: mała scena bez budynków (2 × 2 kawałki), z ziarnem w świecie. */

import { buildScene, type Scene } from '../../src/render/art/scene.ts';
import { T } from '../../src/world/terrain.ts';
import type { World } from '../../src/world/world.ts';

/** mała scena size × size (domyślnie 64, czyli 2 × 2 kawałki) z samą trawą; opcja budynki dokłada prostokąty */
export function malaScena(
  seed = 1,
  size = 64,
  budynki: Array<{ x0: number; y0: number; x1: number; y1: number; levels?: number }> = [],
): Scene {
  const terr = new Uint8Array(size * size).fill(T.GRASS);
  const bid = new Int32Array(size * size).fill(-1);
  const buildings = budynki.map((b, id) => {
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        terr[y * size + x] = T.BUILDING;
        bid[y * size + x] = id;
      }
    return {
      id,
      cls: 'blok',
      levels: b.levels ?? 4,
      name: `b${id}`,
      area: (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1),
      tiles: (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1),
      x0: b.x0,
      y0: b.y0,
      x1: b.x1,
      y1: b.y1,
      cats: [],
      entrances: [],
      tags: {},
    };
  });
  const w = {
    size,
    angle: 0,
    terr,
    bid,
    blocked: new Uint8Array(size * size),
    buildings,
    trees: [],
    pois: [],
    hq: -1,
    seed,
    dryTree: -1,
    props: [],
    apts: [],
    damage: [],
  } as unknown as World;
  return buildScene(w);
}
