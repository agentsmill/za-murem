/* Płótno do arkuszy grafiki w Node: bufor rgba() z palette.ts, wklejanie sprite'ów z przezroczystością,
   podpisy małym fontem 3×5 z polskimi literami i zapis PNG (także w powiększeniu). Do tego atrapa
   <canvas>, żeby w Node narysować drzewa z trees.ts i ludzi z people.ts dla porównania skali. */

import fs from 'node:fs';
import { rgba } from '../src/render/art/palette.ts';
import { encodePng } from './png.ts';

export interface Pix {
  w: number;
  h: number;
  px: Uint32Array;
}

export class Plotno implements Pix {
  w: number;
  h: number;
  px: Uint32Array;
  constructor(w: number, h: number, bg: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h).fill(rgba(bg));
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    const v = rgba(c);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.px[j * this.w + i] = v;
  }

  /** obrys prostokąta */
  frame(x: number, y: number, w: number, h: number, c: number): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  /** wklejenie obrazu z mieszaniem przezroczystości */
  blit(src: Pix, x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = 0; j < src.h; j++) {
      const ty = y + j;
      if (ty < 0 || ty >= this.h) continue;
      for (let i = 0; i < src.w; i++) {
        const tx = x + i;
        if (tx < 0 || tx >= this.w) continue;
        const s = src.px[j * src.w + i];
        const a = s >>> 24;
        if (a === 0) continue;
        const o = ty * this.w + tx;
        if (a === 255) {
          this.px[o] = s;
          continue;
        }
        const d = this.px[o];
        const t = a / 255;
        const ch = (k: number) => Math.round(((s >> k) & 255) * t + ((d >> k) & 255) * (1 - t));
        this.px[o] = (0xff000000 | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
      }
    }
  }

  /** podpis wielkimi literami; zwraca szerokość w pikselach */
  text(x: number, y: number, s: string, c: number): number {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = glyph(ch);
      let gw = 3;
      if (g)
        for (const [gx, gy] of g) {
          this.rect(cx + gx, y + gy, 1, 1, c);
          gw = Math.max(gw, gx + 1);
        }
      cx += gw + 1;
    }
    return cx - x;
  }

  save(file: string, scale = 1): void {
    const W = this.w * scale;
    const H = this.h * scale;
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = this.px[Math.floor(y / scale) * this.w + Math.floor(x / scale)];
        const o = (y * W + x) * 4;
        out[o] = v & 255;
        out[o + 1] = (v >> 8) & 255;
        out[o + 2] = (v >> 16) & 255;
        out[o + 3] = v >>> 24;
      }
    fs.writeFileSync(file, encodePng(W, H, out));
  }

  /** wycinek (do oglądania szczegółów) */
  crop(x: number, y: number, w: number, h: number): Plotno {
    const p = new Plotno(w, h, 0);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const sx = x + i;
        const sy = y + j;
        if (sx >= 0 && sy >= 0 && sx < this.w && sy < this.h) p.px[j * w + i] = this.px[sy * this.w + sx];
      }
    return p;
  }
}

// ---------------------------------------------------------------- font 3×5

const G: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '(': ['.#.', '#..', '#..', '#..', '.#.'],
  ')': ['.#.', '..#', '..#', '..#', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '×': ['...', '#.#', '.#.', '#.#', '...'],
  '=': ['...', '###', '...', '###', '...'],
  '°': ['###', '#.#', '###', '...', '...'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
};
// litery z kreską, kropką albo ogonkiem: [podstawa, dodatki]
const PL: Record<string, [string, [number, number][]]> = {
  Ą: ['A', [[2, 5]]],
  Ę: ['E', [[2, 5]]],
  Ć: ['C', [[2, -1]]],
  Ń: ['N', [[2, -1]]],
  Ó: ['O', [[2, -1]]],
  Ś: ['S', [[2, -1]]],
  Ź: ['Z', [[2, -1]]],
  Ż: ['Z', [[1, -1]]],
  Ł: ['L', [[1, 2]]],
};

function bits(rows: string[]): [number, number][] {
  const p: [number, number][] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === '#') p.push([x, y]);
  });
  return p;
}

const glyphCache = new Map<string, [number, number][] | null>();
function glyph(ch: string): [number, number][] | null {
  if (glyphCache.has(ch)) return glyphCache.get(ch)!;
  let g: [number, number][] | null = null;
  if (G[ch]) g = bits(G[ch]);
  else if (PL[ch]) {
    const [base, extra] = PL[ch];
    g = [...bits(G[base]), ...extra];
  }
  glyphCache.set(ch, g);
  return g;
}

// ---------------------------------------------------------------- atrapa <canvas>

/** obsługuje tylko to, czego używają trees.ts i people.ts */
class FakeCtx {
  c: FakeCanvas;
  style = [0, 0, 0, 1];
  path: [number, number, number, number][] = [];
  constructor(c: FakeCanvas) {
    this.c = c;
  }
  set fillStyle(v: string) {
    if (v.startsWith('#')) {
      const n = Number.parseInt(v.slice(1, 7), 16);
      const a = v.length === 9 ? Number.parseInt(v.slice(7, 9), 16) / 255 : 1;
      this.style = [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    } else {
      const m = v.match(/rgba?\(([^)]+)\)/);
      const p = m ? m[1].split(',').map(Number) : [255, 0, 255, 1];
      this.style = [p[0], p[1], p[2], p[3] ?? 1];
    }
  }
  private plot(x: number, y: number) {
    const c = this.c;
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
    const o = (y * c.width + x) * 4;
    const [r, g, b, a] = this.style;
    const d = c.data;
    const da = d[o + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[o] = (r * a + d[o] * da * (1 - a)) / oa;
    d[o + 1] = (g * a + d[o + 1] * da * (1 - a)) / oa;
    d[o + 2] = (b * a + d[o + 2] * da * (1 - a)) / oa;
    d[o + 3] = oa * 255;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    for (let j = Math.round(y); j < Math.round(y + h); j++)
      for (let i = Math.round(x); i < Math.round(x + w); i++) this.plot(i, j);
  }
  beginPath() {
    this.path = [];
  }
  moveTo() {}
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.path.push([x, y, rx, ry]);
  }
  fill() {
    for (const [x, y, rx, ry] of this.path)
      for (let j = Math.floor(y - ry); j <= Math.ceil(y + ry); j++)
        for (let i = Math.floor(x - rx); i <= Math.ceil(x + rx); i++)
          if (((i + 0.5 - x) / rx) ** 2 + ((j + 0.5 - y) / ry) ** 2 <= 1) this.plot(i, j);
  }
  createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
    for (let j = 0; j < img.height; j++)
      for (let i = 0; i < img.width; i++) {
        const s = (j * img.width + i) * 4;
        const d = ((y + j) * this.c.width + x + i) * 4;
        for (let k = 0; k < 4; k++) this.c.data[d + k] = img.data[s + k];
      }
  }
}

export class FakeCanvas {
  private _w = 0;
  private _h = 0;
  data = new Uint8ClampedArray(0);
  get width() {
    return this._w;
  }
  set width(v: number) {
    this._w = v;
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
  }
  get height() {
    return this._h;
  }
  set height(v: number) {
    this._h = v;
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
  }
  getContext() {
    return new FakeCtx(this);
  }
  /** do wklejania na Plotno */
  toPix(): Pix {
    const px = new Uint32Array(this._w * this._h);
    for (let i = 0; i < px.length; i++)
      px[i] =
        ((this.data[i * 4 + 3] << 24) |
          (this.data[i * 4 + 2] << 16) |
          (this.data[i * 4 + 1] << 8) |
          this.data[i * 4]) >>>
        0;
    return { w: this._w, h: this._h, px };
  }
}

/** podstawia document.createElement('canvas') atrapą (tylko w narzędziach) */
export function fakeDocument(): void {
  (globalThis as { document?: unknown }).document = { createElement: () => new FakeCanvas() };
}
