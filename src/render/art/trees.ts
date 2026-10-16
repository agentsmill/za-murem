/* Drzewa rysowane kodem (grafika zapasowa): korona z kilku plam, światło z dołu i z lewej
   strony (od południa), ciemny obrys, jesienne kolory. Sprite'y w pamięci podręcznej. */

import type { Tree } from '../../world/world.ts';
import { h2 } from './hash.ts';
import { C, shade } from './palette.ts';

export interface TreeSprite {
  canvas: HTMLCanvasElement;
  /** punkt zaczepienia (pień) w pikselach sprite'a */
  ax: number;
  ay: number;
}

const cache = new Map<string, TreeSprite>();
const PX = 32;

/** schemat kolorów korony: 0 zielony, 1 żółknący, 2 rudy */
function scheme(t: Tree): number {
  if (t.kind === 1) return 0;
  const r = h2(t.seed, 3, 1);
  return r < 0.45 ? 0 : r < 0.8 ? 1 : 2;
}

function colors(kind: number, sch: number): [number, number, number, number] {
  if (kind === 1) return [C.pine0, C.pine1, C.pine2, 0x4d7a4f];
  if (sch === 1) return [C.autumn0, C.autumn1, C.autumn2, 0xe0b85a];
  if (sch === 2) return [0x6b2f1c, 0x8f4426, 0xb05e2e, 0xcf8a45];
  return [C.canopy0, C.canopy1, C.canopy2, C.canopyHi];
}

export function treeSprite(t: Tree): TreeSprite {
  const variant = t.seed % 6;
  const rb = Math.round(t.r * 4) / 4;
  const sch = scheme(t);
  const key = `${t.kind}:${rb}:${variant}:${sch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const R = rb * PX;
  const lift = t.kind === 2 ? 0.3 * PX : 1.2 * PX; // korona nad pniem
  const W = Math.ceil(R * 2 + 8);
  const H = Math.ceil(R * 2 + lift + 12);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const out = new Uint32Array(img.data.buffer);
  const cx = W / 2;
  const cy = R + 4;
  const [c0, c1, c2, c3] = colors(t.kind, sch);
  // plamy korony
  const blobs: [number, number, number][] = [[0, 0, R * 0.72]];
  const nb = t.kind === 1 ? 7 : 6;
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * Math.PI * 2 + h2(variant, k, 7) * 0.8;
    const d = R * (0.38 + h2(variant, k, 8) * 0.12);
    blobs.push([Math.cos(a) * d, Math.sin(a) * d, R * (0.42 + h2(variant, k, 9) * 0.14)]);
  }
  const inside = (x: number, y: number) => {
    for (const [bx, by, br] of blobs) if ((x - bx) ** 2 + (y - by) ** 2 <= br * br) return true;
    return false;
  };
  const pix = (x: number, y: number, c: number) => {
    out[y * W + x] = (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
  };
  // pień (widać pod koroną)
  if (t.kind !== 2) {
    const tw = Math.max(4, Math.round(R * 0.16));
    for (let y = Math.round(cy + R * 0.5); y < Math.round(cy + lift + 2); y++)
      for (let x = Math.round(cx - tw / 2); x < Math.round(cx + tw / 2); x++)
        if (x >= 0 && y >= 0 && x < W && y < H) pix(x, y, x < cx - tw / 6 ? shade(C.trunk, 0.8) : C.trunk);
  }
  // korona: piksele 2×2 dla wyraźniejszej faktury
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const lx = x + 1 - cx;
      const ly = y + 1 - cy;
      if (!inside(lx, ly)) continue;
      // obrys: brzeg korony
      const edge = !inside(lx + 3, ly) || !inside(lx - 3, ly) || !inside(lx, ly + 3) || !inside(lx, ly - 3);
      // światło od dołu-lewej
      const light = (-lx * 0.4 + ly * 0.6) / R + (h2(x >> 1, y >> 1, variant * 13 + sch) - 0.5) * 0.7;
      let c = light < -0.35 ? c0 : light < 0.15 ? c1 : light < 0.55 ? c2 : c3;
      if (edge) c = shade(c0, 0.8);
      // plamki liści
      if (!edge && h2(x, y, variant + 101) < 0.05) c = shade(c, 1.15);
      if (t.kind === 1 && !edge && ((x >> 1) + (y >> 1)) % 5 === 0) c = shade(c, 0.85);
      pix(x, y, c);
      if (x + 1 < W) pix(x + 1, y, c);
      if (y + 1 < H) {
        pix(x, y + 1, c);
        if (x + 1 < W) pix(x + 1, y + 1, c);
      }
    }
  ctx.putImageData(img, 0, 0);
  const sp = { canvas, ax: cx, ay: cy + lift };
  cache.set(key, sp);
  return sp;
}
