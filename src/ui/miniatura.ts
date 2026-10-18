/* Miniatury budowli w menu budowy: ten sam sprite, który rysuje mapa (rzeczSprite, więc z nakładką PixelLab,
   gdy ją dostanie), przycięty do pikseli i dopasowany do pudełka najbliższym sąsiadem. thumbPixels jest czysta i
   działa w Node; thumbUrl rysuje wynik na <canvas> i trzyma gotowy data: URL po rodzaju budowli (pamięć
   podręczna przepada razem z grafiką: clearThumbs). */

import type { Sprite } from '../render/art/bryly.ts';
import type { BuildKind } from '../render/art/budowle.ts';
import { type Grafika, rzeczSprite } from '../render/art/pixellab.ts';

/** bok pudełka miniatury w px (kafelek panelu ma ok. 90 px szerokości) */
export const THUMB_BOX = 56;

/** Piksele miniatury (RGBA bajt po bajcie): prostokąt sprite'a z alfa > 0 skalowany tak, żeby dłuższy bok miał box,
    proporcje zachowane; null dla pustego sprite'a. Piksele sprite'a to Uint32 0xAABBGGRR, więc na platformach
    little-endian (każda przeglądarka) bajty leżą w kolejności R, G, B, A, jak w ImageData (tak samo view.ts). */
export function thumbPixels(
  sp: Sprite,
  box: number,
): { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> } | null {
  let x0 = sp.w;
  let y0 = sp.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++)
      if (sp.px[y * sp.w + x] >>> 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const scale = box / Math.max(cw, ch);
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = y0 + Math.min(ch - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < w; x++)
      out[y * w + x] = sp.px[sy * sp.w + x0 + Math.min(cw - 1, Math.floor((x + 0.5) / scale))];
  }
  return { w, h, data: new Uint8ClampedArray(out.buffer as ArrayBuffer) };
}

let cacheFor: Grafika | null | undefined;
const cache = new Map<string, string>();

/** data: URL miniatury budowli (rot 0, stałe ziarno, bez uszkodzeń); '' dla pustego sprite'a. Tylko w oknie. */
export function thumbUrl(kind: BuildKind, g: Grafika | null, box = THUMB_BOX): string {
  if (cacheFor !== g) {
    cache.clear();
    cacheFor = g;
  }
  const key = `${kind}|${box}`;
  let url = cache.get(key);
  if (url === undefined) {
    const r = thumbPixels(rzeczSprite({ kind, rot: 0, seed: 1 }, g), box);
    url = '';
    if (r) {
      const c = document.createElement('canvas');
      c.width = r.w;
      c.height = r.h;
      c.getContext('2d')?.putImageData(new ImageData(r.data, r.w, r.h), 0, 0);
      url = c.toDataURL();
    }
    cache.set(key, url);
  }
  return url;
}

/** zapomina gotowe miniatury (po zmianie grafiki) */
export function clearThumbs(): void {
  cache.clear();
  cacheFor = undefined;
}
