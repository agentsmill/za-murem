/* Mapa znaczeń 1 px = 1 m: każdy rodzaj terenu jednym kolorem. Do podglądu rasteryzacji
   i jako obraz startowy do pocztówki z osiedla (PixelLab, docs/PIXELLAB.md). */

import { T, type World } from './world.ts';

export const SEMANTIC_COLORS: Record<number, [number, number, number]> = {
  [T.GRASS]: [104, 132, 64],
  [T.PARK]: [92, 128, 58],
  [T.WOOD]: [52, 92, 44],
  [T.ROAD]: [58, 60, 64],
  [T.SIDEWALK]: [168, 164, 152],
  [T.PATH]: [150, 120, 84],
  [T.PARKING]: [90, 92, 96],
  [T.WATER]: [60, 104, 160],
  [T.PLAY]: [214, 190, 130],
  [T.PITCH]: [80, 150, 90],
  [T.ALLOT]: [120, 90, 60],
  [T.BUILDING]: [190, 186, 176],
};

/** RGBA w skali 1 px na kafelek; drzewa jako ciemniejsze plamy, siedziba na czerwono */
export function semanticRgba(w: World): Uint8Array {
  const out = new Uint8Array(w.size * w.size * 4);
  for (let i = 0; i < w.terr.length; i++) {
    let c = SEMANTIC_COLORS[w.terr[i]] ?? [255, 0, 255];
    if (w.bid[i] >= 0 && w.bid[i] === w.hq) c = [200, 70, 60];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  for (const t of w.trees) {
    const r = Math.max(1, Math.round(t.r));
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.floor(t.x) + dx;
        const y = Math.floor(t.y) + dy;
        if (x < 0 || y < 0 || x >= w.size || y >= w.size) continue;
        const i = (y * w.size + x) * 4;
        if (w.terr[y * w.size + x] === T.BUILDING) continue;
        out[i] = 40;
        out[i + 1] = t.kind === 1 ? 70 : 84;
        out[i + 2] = 36;
      }
  }
  return out;
}
