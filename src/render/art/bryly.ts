/* Bryły i raster sprite'ów rysowanych kodem (grafika zastępcza): prostopadłościany rzutowane jak
   fasady (wierzch przesunięty w górę o wysokość, ściana od południa pod nim), bufor głębokości,
   linie na stykach brył, obrys sylwetki i półprzezroczysty cień. Wspólne dla mebli (rzeczy.ts)
   i podwórka (podworko.ts). Czyste funkcje bez DOM. */

import { h2 } from './hash.ts';
import { C, mix, rgba, shade } from './palette.ts';

export const PX = 32; // pikseli grafiki na metr w poziomie (TILE ze scene.ts)

export interface Sprite {
  w: number;
  h: number;
  /** kotwica w pikselach sprite'a: środek dolnej krawędzi podstawy (dla drzew podstawa pnia) */
  ax: number;
  ay: number;
  /** piksele rgba() z palette.ts wiersz po wierszu; 0 to przezroczysty */
  px: Uint32Array;
}

/** przy której ścianie stoi mebel (tyłem do niej): 0 góra, 1 prawo, 2 dół, 3 lewo */
export type Rot = 0 | 1 | 2 | 3;

/** klatki ognia (koza, ognisko) */
export const FIRE_FRAMES = 3;

// ---------------------------------------------------------------- kolory

export const M = {
  iron: 0x37332f,
  ironD: 0x262321,
  ironHi: 0x5a544d,
  ironDark: 0x15120f,
  rust: 0x7a4a2e,
  pipe: 0x4a4b4c,
  tin: 0x9fa2a1,
  fire0: 0xffe08a,
  fire1: 0xf5a142,
  fire2: 0xd2552a,
  ember: 0xb8401f,
  emberHi: 0xe8702c,
  enamel: 0xe2dccb,
  enamelD: 0xb9b2a2,
  burner: 0x23201d,
  steel: 0xa9aeb1,
  steelD: 0x7f8487,
  white: 0xdcdbd4,
  screen: 0x14181b,
  screenHi: 0x323e48,
  wood: 0x8f6643,
  woodD: 0x6a4a30,
  walnut: 0x5d3d29,
  linen: 0xe4dfd2,
  linenD: 0xc9c2b2,
  fiber: 0x8a6a4c,
  glass: 0x8aa6b1,
  crystal: 0xe8f1f2,
  brass: 0xb59a52,
  note: 0xe6d36a,
  gas: 0xc9a63a,
  bark: 0x4a3a2c,
  barkD: 0x33281f,
  barkHi: 0x66523f,
  cut: 0xcdab79,
  cutD: 0xa9875b,
  cutC: 0x7e6142,
  split: 0xd8bd8e,
  dead: 0x6e6255,
  deadHi: 0x928473,
  deadD: 0x4a4037,
  deadO: 0x2a231d,
  concrete: 0x8a877f,
} as const;

export const WOODS = [0x8f6643, 0x6f4c32, 0xa57d52] as const;

export const LIT = 0x1000000; // kolor świeci: bez cieniowania ścian i bez linii krawędzi
export const HOLE = -1; // farba zwraca dziurę
const FRONT_SHADE = 0.84;
const OUTLINE = 0x1a1512;
const SHADOW_A = 88;

export const rgbaA = (c: number, a: number): number =>
  (((a & 255) << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
export const pick = <T>(arr: readonly T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

// ---------------------------------------------------------------- bryły i raster

/** farba ściany bryły: (u, v) od lewego górnego rogu ściany widzianej z zewnątrz; w, h wymiary ściany */
export type Paint = (u: number, v: number, w: number, h: number) => number;

export interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** kolor bez farby */
  c: number;
  /** wierzch: u wzdłuż x, v od tyłu (y0) do przodu */
  top?: Paint;
  /** ściany: przód (y1), tył (y0), lewa (x0), prawa (x1) */
  front?: Paint;
  back?: Paint;
  left?: Paint;
  right?: Paint;
  /** walec (rura): jaśniej z lewej, ciemniej z prawej */
  round?: boolean;
  /** nie rzuca cienia */
  flat?: boolean;
  /** drobiazg zależny od ziarna: nie wpływa na rozmiar sprite'a (przycinany do niego) */
  opt?: boolean;
}

export const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  c: number,
  o: Partial<Box> = {},
): Box => ({
  x0,
  y0,
  z0,
  x1,
  y1,
  z1,
  c,
  ...o,
});

/** bryła po obrocie: prostokąt na podłodze w pikselach świata względem lewego górnego rogu podstawy */
export interface Placed {
  b: Box;
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
}

export function place(b: Box, rot: Rot, W: number, D: number): Placed {
  switch (rot) {
    case 1:
      return { b, X0: D - b.y1, X1: D - b.y0, Y0: b.x0, Y1: b.x1 };
    case 2:
      return { b, X0: W - b.x1, X1: W - b.x0, Y0: D - b.y1, Y1: D - b.y0 };
    case 3:
      return { b, X0: b.y0, X1: b.y1, Y0: W - b.x1, Y1: W - b.x0 };
    default:
      return { b, X0: b.x0, X1: b.x1, Y0: b.y0, Y1: b.y1 };
  }
}

/** punkt świata (X, Y) z powrotem do układu modelu */
export function unplace(rot: Rot, W: number, D: number, X: number, Y: number): [number, number] {
  switch (rot) {
    case 1:
      return [Y, D - X];
    case 2:
      return [W - X, D - Y];
    case 3:
      return [W - Y, X];
    default:
      return [X, Y];
  }
}

export const shadowOff = (z1: number) => (z1 >= 24 ? 3 : z1 >= 10 ? 2 : 1);

function roundShade(c: number, u: number, n: number): number {
  if (c & LIT) return c;
  const t = (u + 0.5) / n;
  return t < 0.34 ? shade(c, 1.18) : t > 0.67 ? shade(c, 0.72) : c;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const grow = (b: Bounds, x0: number, y0: number, x1: number, y1: number) => {
  b.x0 = Math.min(b.x0, Math.floor(x0));
  b.y0 = Math.min(b.y0, Math.floor(y0));
  b.x1 = Math.max(b.x1, Math.ceil(x1));
  b.y1 = Math.max(b.y1, Math.ceil(y1));
};

/** płótno sprite'a: kolor, głębokość (wysokość punktu na linii wzroku), numer bryły, cień */
export class Raster {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly col: Uint32Array;
  readonly zb: Float32Array;
  readonly id: Int32Array;
  readonly lit: Uint8Array;
  readonly sh: Uint8Array;
  constructor(b: Bounds) {
    // 1 px zapasu na obrys
    this.ox = 1 - b.x0;
    this.oy = 1 - b.y0;
    this.w = b.x1 - b.x0 + 2;
    this.h = b.y1 - b.y0 + 2;
    const n = this.w * this.h;
    this.col = new Uint32Array(n);
    this.zb = new Float32Array(n).fill(Number.NEGATIVE_INFINITY);
    this.id = new Int32Array(n).fill(-1);
    this.lit = new Uint8Array(n);
    this.sh = new Uint8Array(n);
  }

  frag(sx: number, sy: number, z: number, c: number, k: number): void {
    const x = sx + this.ox;
    const y = sy + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (z < this.zb[i]) return;
    this.zb[i] = z;
    this.col[i] = c & 0xffffff;
    this.lit[i] = c & LIT ? 1 : 0;
    this.id[i] = k;
  }

  shadow(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = Math.max(0, y0 + this.oy); y < Math.min(this.h, y1 + this.oy); y++)
      for (let x = Math.max(0, x0 + this.ox); x < Math.min(this.w, x1 + this.ox); x++) this.sh[y * this.w + x] = 1;
  }

  box(p: Placed, k: number, rot: Rot, W: number, D: number): void {
    const { b, X0, X1, Y0, Y1 } = p;
    const bw = b.x1 - b.x0;
    const bd = b.y1 - b.y0;
    const bh = b.z1 - b.z0;
    // wierzch
    for (let sy = Y0 - b.z1; sy < Y1 - b.z1; sy++)
      for (let sx = X0; sx < X1; sx++) {
        const [lx, ly] = unplace(rot, W, D, sx + 0.5, sy + b.z1 + 0.5);
        const u = Math.floor(lx - b.x0);
        const v = Math.floor(ly - b.y0);
        let c = b.top ? b.top(u, v, bw, bd) : b.c;
        if (c === HOLE) continue;
        if (b.round) c = roundShade(c, u, bw);
        if (!(c & LIT) && sy === Y1 - b.z1 - 1 && bh > 1) c = shade(c, 1.1); // oświetlona przednia krawędź
        this.frag(sx, sy, b.z1, c, k);
      }
    // ściana od południa
    const paint = [b.front, b.right, b.back, b.left][rot];
    const fw = X1 - X0;
    for (let sy = Y1 - b.z1; sy < Y1 - b.z0; sy++)
      for (let sx = X0; sx < X1; sx++) {
        const u = sx - X0;
        let c = paint ? paint(u, sy - (Y1 - b.z1), fw, bh) : b.c;
        if (c === HOLE) continue;
        if (b.round) c = roundShade(c, u, fw);
        if (!(c & LIT)) c = shade(c, FRONT_SHADE);
        this.frag(sx, sy, Y1 - sy - 0.5, c, k);
      }
  }

  /** wynik: linie na stykach brył, obrys sylwetki, półprzezroczysty cień */
  finish(ax: number, ay: number): Sprite {
    const { w, h, col, zb, id } = this;
    const px = new Uint32Array(w * h);
    const nb = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (id[i] < 0) continue;
        let c = col[i];
        if (!this.lit[i])
          for (const j of [nb(x, y - 1), nb(x - 1, y), nb(x + 1, y), nb(x, y + 1)])
            if (j >= 0 && id[j] >= 0 && id[j] !== id[i] && zb[j] > zb[i] + 1.5) {
              c = shade(c, 0.72);
              break;
            }
        px[i] = rgba(c);
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (id[i] >= 0) continue;
        for (const j of [nb(x, y + 1), nb(x, y - 1), nb(x - 1, y), nb(x + 1, y)])
          if (j >= 0 && id[j] >= 0) {
            px[i] = rgba(mix(col[j], OUTLINE, 0.72));
            break;
          }
        if (px[i] === 0 && this.sh[i]) px[i] = rgbaA(C.shadow, SHADOW_A);
      }
    return { w, h, ax, ay, px };
  }
}

/**
 * Sprite z brył modelu W×D (px) w ustawieniu rot. env to bryły niewidoczne, które tylko poszerzają
 * granice: rzecz w różnych stanach (ogień, otwarta brama) ma wtedy ten sam rozmiar i kotwicę.
 */
export function renderBoxes(boxes: Box[], W: number, D: number, rot: Rot, env: Box[] = []): Sprite {
  const fw = rot & 1 ? D : W;
  const fh = rot & 1 ? W : D;
  const placed = boxes.map((b) => place(b, rot, W, D));
  const bounds: Bounds = { x0: 0, y0: 0, x1: fw, y1: fh };
  for (const p of [...placed, ...env.map((b) => place(b, rot, W, D))]) {
    if (p.b.opt) continue;
    grow(bounds, p.X0, p.Y0 - p.b.z1, p.X1, p.Y1 - p.b.z0);
    if (!p.b.flat) {
      const d = shadowOff(p.b.z1);
      grow(bounds, p.X0 + d, p.Y0 - d, p.X1 + d, p.Y1 - d);
    }
  }
  const r = new Raster(bounds);
  placed.forEach((p, k) => {
    r.box(p, k, rot, W, D);
  });
  for (const p of placed) {
    if (p.b.flat || p.b.opt) continue;
    const d = shadowOff(p.b.z1);
    r.shadow(p.X0 + d, p.Y0 - d, p.X1 + d, p.Y1 - d);
  }
  return r.finish(r.ox + fw / 2, r.oy + fh);
}

/** losowanie z ziarna: liczba z [0, 1) dla klucza k */
export const rnd = (seed: number, salt: number) => (k: number) => h2(seed, k, salt);

export function fireColor(u: number, v: number, f: number): number {
  const r = h2(u, v * 3 + f * 17, 4242);
  const hot = r + (v & 1 ? 0.15 : 0) - f * 0.05;
  return (hot > 0.7 ? M.fire0 : hot > 0.35 ? M.fire1 : M.fire2) | LIT;
}
