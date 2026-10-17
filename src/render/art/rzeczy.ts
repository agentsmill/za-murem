/* Rzeczy rysowane kodem (grafika zastępcza): meble wnętrza w czterech ustawieniach, stos drewna,
   pień po ściętym drzewie, suche drzewo i trzepak. Meble składam z brył (prostopadłościanów)
   rzutowanych jak fasady: wierzch przesunięty w górę o wysokość, pod nim ściana od południa.
   Bufor głębokości rozstrzyga, co zasłania co, więc cztery ustawienia wychodzą z jednego modelu.
   Czyste funkcje bez DOM: sprite { w, h, ax, ay, px } z pikselami rgba() (0 = przezroczysty)
   i kotwicą na środku dolnej krawędzi podstawy, do sortowania po y z pionkami. Rozmiar i kotwica
   zależą tylko od rodzaju i ustawienia, ziarno zmienia kolory i drobiazgi. */

import type { Tree } from '../../world/world.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, rgba, shade } from './palette.ts';

const PX = 32; // pikseli grafiki na metr w poziomie (TILE ze scene.ts)
/** pikseli ekranu na metr wysokości: połowa skali poziomej, jak w niskim rzucie z góry */
export const ZPX = 16;

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
export type FurnitureKind =
  | 'koza'
  | 'stol'
  | 'krzeslo'
  | 'kuchenka'
  | 'lodowka'
  | 'lozko'
  | 'wersalka'
  | 'mebloscianka'
  | 'wanna'
  | 'sedes'
  | 'umywalka';
export const FURNITURE_KINDS: readonly FurnitureKind[] = [
  'koza',
  'stol',
  'krzeslo',
  'kuchenka',
  'lodowka',
  'lozko',
  'wersalka',
  'mebloscianka',
  'wanna',
  'sedes',
  'umywalka',
];
/** podstawa w kafelkach przy rot 0: szerokość wzdłuż ściany × głębokość od ściany (FURNITURE_SIZE wnętrza) */
export const BASE: Record<FurnitureKind, readonly [number, number]> = {
  koza: [1, 1],
  stol: [2, 1],
  krzeslo: [1, 1],
  kuchenka: [1, 1],
  lodowka: [1, 1],
  lozko: [1, 2],
  wersalka: [2, 1],
  mebloscianka: [3, 1],
  wanna: [2, 1],
  sedes: [1, 1],
  umywalka: [1, 1],
};
/** klatki ognia w palącej się kozie */
export const FIRE_FRAMES = 3;

/**
 * Opis rzeczy.
 * - meble: rot przy której ścianie stoją (krzesło: strona oparcia); koza z fire 0..FIRE_FRAMES-1
 *   pali się (klatka ognia), bez fire jest zimna; rura kozy wychodzi przez okno w ścianie rot;
 * - drewno i jedzenie: zapas w trzech wielkościach na kafelku 1×1;
 * - pien: pień po ściętym drzewie o promieniu korony r (jak Tree.r), na kafelku pnia;
 * - trzepak: 3×1 m przy rot 0 i 2, 1×3 przy rot 1 i 3.
 */
export type ThingSpec =
  | { kind: FurnitureKind; rot: Rot; seed?: number; fire?: number }
  | { kind: 'drewno'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'jedzenie'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'pien'; r?: number; seed?: number }
  | { kind: 'trzepak'; rot: Rot; seed?: number };

/** podstawa rzeczy w kafelkach (w × h na mapie) */
export function footprint(spec: ThingSpec): { w: number; h: number } {
  if (spec.kind === 'drewno' || spec.kind === 'jedzenie' || spec.kind === 'pien') return { w: 1, h: 1 };
  const [a, b] = spec.kind === 'trzepak' ? [3, 1] : BASE[spec.kind];
  return spec.rot & 1 ? { w: b, h: a } : { w: a, h: b };
}

// ---------------------------------------------------------------- kolory

const M = {
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

const WOODS = [0x8f6643, 0x6f4c32, 0xa57d52] as const;
const VENEER = [0x5d3d29, 0x7a5236, 0x8c5f36] as const;
const FABRIC = [0x8a5a3c, 0xa8873a, 0x5f6e45, 0x7b3a38, 0x4a5c78] as const;
const BLANKET: readonly (readonly [number, number])[] = [
  [0x8b3b32, 0xd2b27a],
  [0x4f6b45, 0xd2c39a],
  [0x3f4f6e, 0xb7aa8a],
  [0x6b4a32, 0xc9b48c],
];
const OILCLOTH: readonly (readonly [number, number])[] = [
  [0xb8443a, 0xe6e0d2],
  [0x3d5f8f, 0xe6e0d2],
  [0x4f7a45, 0xe6e0d2],
];
const VINYL = [0x7a2f2a, 0x5a4030, 0x3d4a5a] as const;
const BOOKS = [0x7a2f2f, 0x2f4a6a, 0x5a6b3a, 0xb59a52, 0x6b4a32, 0xd8cfb8, 0x8a6a9a] as const;
const RACK = [0x4f6b45, 0x8b3a32, 0x3f5f7f, 0xb39a3e] as const;
/** słoiki: ogórki, dżem, kompot, smalec */
const JARS = [0x6b7a3a, 0x8a2a2a, 0xc0782a, 0xdcd6c2] as const;

const LIT = 0x1000000; // kolor świeci: bez cieniowania ścian i bez linii krawędzi
const HOLE = -1; // farba zwraca dziurę
const FRONT_SHADE = 0.84;
const OUTLINE = 0x1a1512;
const SHADOW_A = 88;

const rgbaA = (c: number, a: number): number =>
  (((a & 255) << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const pick = <T>(arr: readonly T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

// ---------------------------------------------------------------- bryły i raster

/** farba ściany bryły: (u, v) od lewego górnego rogu ściany widzianej z zewnątrz; w, h wymiary ściany */
type Paint = (u: number, v: number, w: number, h: number) => number;

interface Box {
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

const box = (
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
interface Placed {
  b: Box;
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
}

function place(b: Box, rot: Rot, W: number, D: number): Placed {
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
function unplace(rot: Rot, W: number, D: number, X: number, Y: number): [number, number] {
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

const shadowOff = (z1: number) => (z1 >= 24 ? 3 : z1 >= 10 ? 2 : 1);

function roundShade(c: number, u: number, n: number): number {
  if (c & LIT) return c;
  const t = (u + 0.5) / n;
  return t < 0.34 ? shade(c, 1.18) : t > 0.67 ? shade(c, 0.72) : c;
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const grow = (b: Bounds, x0: number, y0: number, x1: number, y1: number) => {
  b.x0 = Math.min(b.x0, Math.floor(x0));
  b.y0 = Math.min(b.y0, Math.floor(y0));
  b.x1 = Math.max(b.x1, Math.ceil(x1));
  b.y1 = Math.max(b.y1, Math.ceil(y1));
};

/** płótno sprite'a: kolor, głębokość (wysokość punktu na linii wzroku), numer bryły, cień */
class Raster {
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

/** sprite z brył modelu W×D (px) w ustawieniu rot */
function renderBoxes(boxes: Box[], W: number, D: number, rot: Rot): Sprite {
  const fw = rot & 1 ? D : W;
  const fh = rot & 1 ? W : D;
  const placed = boxes.map((b) => place(b, rot, W, D));
  const bounds: Bounds = { x0: 0, y0: 0, x1: fw, y1: fh };
  for (const p of placed) {
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

// ---------------------------------------------------------------- meble

/** losowanie z ziarna: liczba z [0, 1) dla klucza k */
const rnd = (seed: number, salt: number) => (k: number) => h2(seed, k, salt);

function fireColor(u: number, v: number, f: number): number {
  const r = h2(u, v * 3 + f * 17, 4242);
  const hot = r + (v & 1 ? 0.15 : 0) - f * 0.05;
  return (hot > 0.7 ? M.fire0 : hot > 0.35 ? M.fire1 : M.fire2) | LIT;
}

function koza(rot: Rot, seed: number, fire: number): Box[] {
  const burning = fire >= 0;
  const f = burning ? fire % FIRE_FRAMES : 0;
  const rust = (u: number, v: number, c: number) => (h2(u, v, seed + 11) < 0.07 ? M.rust : c);
  const side: Paint = (u, v, w, h) => {
    if ((u === 1 || u === w - 2) && (v === 1 || v === h - 2)) return M.ironHi; // nity
    if (burning && v >= h - 4 && h2(u, v + f, 77) < 0.25) return M.ember; // żar prześwituje u dołu
    return rust(u, v, M.iron);
  };
  const front: Paint = (u, v, w, h) => {
    // drzwiczki z rusztem
    if (u >= 3 && u <= 12 && v >= 2 && v <= 9) {
      if (u === 3 || u === 12 || v === 2 || v === 9) return M.ironHi;
      if (v % 2 === 0 && u >= 5 && u <= 10) return burning ? fireColor(u, v, f) : M.ironDark;
      return M.iron;
    }
    if (u === 13 && v === 6) return M.tin; // zasuwka
    return side(u, v, w, h);
  };
  const top: Paint = (u, v, w, h) => {
    const dx = u - (w - 1) / 2;
    const dy = v - (h - 1) / 2 + 1;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 4) return burning ? (f === 1 ? M.emberHi : M.ember) | LIT : M.ironDark; // fajerka
    if (d2 <= 12) return d2 > 7 ? M.ironDark : M.ironHi;
    if (u === 0 || v === 0 || u === w - 1 || v === h - 1) return M.ironHi;
    return rust(u, v, M.iron);
  };
  const b: Box[] = [];
  for (const [x, y] of [
    [9, 11],
    [21, 11],
    [9, 21],
    [21, 21],
  ])
    b.push(box(x, y, 0, x + 2, y + 2, 3, M.ironD));
  b.push(box(8, 10, 3, 24, 24, 15, M.iron, { front, back: side, left: side, right: side }));
  b.push(box(7, 9, 15, 25, 25, 16, M.iron, { top }));
  // rura przez okno w ścianie za kozą, blacha zamiast szyby
  const pipe = { round: true };
  if (rot === 0) {
    b.push(box(14, 11, 16, 18, 15, 23, M.pipe, pipe));
    b.push(box(14, -1, 19, 18, 11, 23, M.pipe, pipe));
    b.push(box(10, -3, 16, 22, -1, 26, M.tin, { flat: true }));
  } else if (rot === 2) {
    b.push(box(14, -25, 9, 18, 10, 13, M.pipe, pipe));
    b.push(box(10, -27, 6, 22, -25, 16, M.tin, { flat: true }));
  } else {
    b.push(box(14, -24, 9, 18, 10, 13, M.pipe, pipe));
    b.push(box(11, -26, 6, 21, -24, 16, M.tin, { flat: true }));
  }
  return b;
}

function stol(seed: number): Box[] {
  const r = rnd(seed, 911);
  const wood = pick(WOODS, r(1));
  const cloth = r(2) < 0.6 ? pick(OILCLOTH, r(3)) : null;
  const grain = (u: number, v: number, c: number) => {
    const g = vnoise(u * 2, v * 9, 14, seed + 12);
    return g > 0.72 ? shade(c, 0.88) : g < 0.15 ? shade(c, 1.07) : c;
  };
  // plamy: krążki po kubkach
  const rings: [number, number, number][] = [];
  for (let k = 0; k < 3; k++) if (r(10 + k) < 0.6) rings.push([6 + r(20 + k) * 44, 4 + r(30 + k) * 14, 2.5]);
  const stain = (u: number, v: number) =>
    rings.some(([cx, cy, rr]) => Math.abs(Math.hypot(u + 0.5 - cx, v + 0.5 - cy) - rr) < 0.6);
  const top: Paint = (u, v) => {
    if (cloth) {
      const check = ((u >> 2) + (v >> 2)) & 1;
      const c = check ? cloth[0] : cloth[1];
      return stain(u, v) ? shade(c, 0.8) : (u >> 2) % 2 === 0 && (v >> 2) % 2 === 0 ? shade(cloth[0], 0.85) : c;
    }
    return stain(u, v) ? shade(wood, 0.78) : grain(u, v, wood);
  };
  const edge: Paint = (u, v) => {
    if (cloth) return v === 0 ? cloth[1] : (u >> 1) & 1 ? cloth[0] : cloth[1]; // cerata zwisa
    return grain(u, v, shade(wood, 0.9));
  };
  const apron: Paint = (u, v, w) => {
    // szuflada
    const mid = w >> 1;
    if (v >= 1 && Math.abs(u - mid) <= 8) {
      if (Math.abs(u - mid) === 8 || v === 1) return shade(wood, 0.7);
      if (u === mid && v === 2) return M.brass;
    }
    return grain(u, v * 5, shade(wood, 0.92));
  };
  const leg = shade(wood, 0.8);
  const b: Box[] = [];
  for (const [x, y] of [
    [8, 7],
    [53, 7],
    [8, 22],
    [53, 22],
  ])
    b.push(box(x, y, 0, x + 3, y + 3, 9, leg));
  b.push(box(7, 6, 7, 57, 26, 10, wood, { front: apron, back: apron, left: apron, right: apron }));
  b.push(box(4, 4, 10, 60, 28, 12, wood, { top, front: edge, back: edge, left: edge, right: edge }));
  // na stole: emaliowany kubek, czasem świeczka w słoiku
  if (r(40) < 0.7) {
    const mx = 16 + Math.floor(r(41) * 24);
    const mug: Paint = (u, v) => (v === 0 ? 0xeeeae0 : u === 1 && v === 2 ? 0x2f4a6a : 0xe7e2d6);
    const inside: Paint = (u, v) => (u > 0 && u < 3 && v > 0 && v < 3 ? 0x6b4a30 : 0xeeeae0);
    b.push(
      box(mx, 11, 12, mx + 4, 15, 16, 0xe7e2d6, {
        top: inside,
        front: mug,
        left: mug,
        right: mug,
        back: mug,
        opt: true,
      }),
    );
  }
  if (r(42) < 0.5) {
    b.push(box(44, 14, 12, 47, 17, 15, 0xc2cfd2, { opt: true }));
    b.push(box(45, 15, 15, 46, 16, 17, 0xe9e4d6, { top: () => 0xffd27a | LIT, opt: true }));
  }
  return b;
}

function krzeslo(seed: number): Box[] {
  const r = rnd(seed, 912);
  const wood = pick(WOODS, r(1));
  const seat = r(2) < 0.6 ? pick(VINYL, r(3)) : wood;
  const legC = shade(wood, 0.85);
  const b: Box[] = [];
  for (const [x, y] of [
    [10, 22],
    [20, 22],
  ])
    b.push(box(x, y, 0, x + 2, y + 2, 7, legC));
  // tylne nogi przechodzą w oparcie
  b.push(box(9, 11, 0, 11, 13, 19, legC));
  b.push(box(21, 11, 0, 23, 13, 19, legC));
  const back: Paint = (u, v) => (v >= 3 && v <= 4 && u >= 2 && u <= 7 ? HOLE : v === 0 ? shade(wood, 1.1) : wood);
  b.push(box(11, 11, 12, 21, 13, 19, wood, { front: back, back }));
  const top: Paint = (u, v, w, h) =>
    u === 0 || v === 0 || u === w - 1 || v === h - 1 ? shade(seat, 0.85) : (u + v) % 7 === 0 ? shade(seat, 1.1) : seat;
  b.push(box(9, 12, 7, 23, 25, 9, seat, { top }));
  return b;
}

function kuchenka(seed: number): Box[] {
  const r = rnd(seed, 913);
  const dirt = (u: number, v: number, c: number) => (h2(u, v, seed + 21) < 0.05 ? shade(c, 0.86) : c);
  const top: Paint = (u, v) => {
    for (const [cx, cy] of [
      [5, 5],
      [14, 5],
      [5, 13],
      [14, 13],
    ]) {
      const dx = u - cx;
      const dy = v - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 10) {
        if (d2 <= 1) return shade(M.burner, 1.8); // kołpak palnika
        if (dx === 0 || dy === 0 || d2 >= 8) return M.burner; // ruszt i pierścień
        return shade(M.enamel, 0.72);
      }
    }
    return dirt(u, v, M.enamel);
  };
  const front: Paint = (u, v, w) => {
    if (v <= 1) {
      // pokrętła
      for (const k of [3, 7, 12, 16]) if (u === k || u === k + 1) return v === 0 ? M.burner : shade(M.burner, 1.5);
      return shade(M.enamel, 0.94);
    }
    if (v === 2) return M.enamelD;
    if (v === 3 && u >= 4 && u <= w - 5) return M.steel; // uchwyt
    if (v >= 3 && v <= 10 && u >= 2 && u <= w - 3) {
      if (u === 2 || u === w - 3 || v === 10) return M.enamelD;
      if (v >= 5 && v <= 8 && u >= 6 && u <= w - 7) return v === 5 && u < 9 ? M.screenHi : M.screen; // szybka piekarnika
      return dirt(u, v, M.enamel);
    }
    if (v === 11) return M.enamelD;
    return v >= 13 ? shade(M.burner, 1.4) : dirt(u, v, M.enamel);
  };
  const plain: Paint = (u, v) => dirt(u, v, M.enamel);
  const b: Box[] = [box(6, 6, 0, 26, 25, 14, M.enamel, { top, front, back: plain, left: plain, right: plain })];
  // podniesiona pokrywa przy ścianie
  b.push(box(6, 4, 14, 26, 6, 21, M.enamel, { front: (u, v) => (v === 0 ? M.white : dirt(u, v, M.enamel)) }));
  // żółta rura gazowa z tyłu
  b.push(box(20, 2, 2, 22, 4, 12, M.gas, { round: true, flat: true }));
  // czajnik na palniku
  const kettle: Paint = (u, v) => (u === 0 || v === 0 ? 0x5a5c5e : 0x2c2e30);
  if (r(1) < 0.5) b.push(box(8, 15, 14, 13, 20, 17, 0x3d3f42, { top: kettle, opt: true }));
  return b;
}

function lodowka(seed: number): Box[] {
  const r = rnd(seed, 914);
  const body = r(1) < 0.5 ? M.steel : M.white;
  const note = r(2) < 0.6;
  const front: Paint = (u, v, w) => {
    if (v === 19) return shade(body, 0.6); // podział zamrażarki
    // martwy ekranik: zgaszony, z odbiciem
    if (u >= 3 && u <= 10 && v >= 4 && v <= 9) {
      if (u === 3 || u === 10 || v === 4 || v === 9) return 0x0c0e10;
      return (u + v) % 6 === 0 ? M.screenHi : M.screen;
    }
    if (u === 12 && v === 5) return 0x4a1a18; // dioda
    // kod QR do abonamentu
    if (u >= 12 && u <= 14 && v >= 8 && v <= 10)
      return ((u + v * 3) & 1) === 0 || (u === 12 && v === 8) ? 0x15181a : 0xf0efe8;
    if (note && u >= 3 && u <= 6 && v >= 12 && v <= 15) return v === 12 ? shade(M.note, 0.85) : M.note;
    if (v >= 27 && u >= 2 && u <= w - 3) return v % 2 ? 0x2a2c2e : shade(body, 0.8); // kratka wentylacji
    return u === 0 ? shade(body, 1.08) : body;
  };
  const back: Paint = (u, v, w) => {
    if (u >= 2 && u <= w - 3 && v >= 2 && v <= 24) return v % 2 ? 0x2c2c2c : 0x404040; // skraplacz
    if (u >= 5 && u <= w - 6 && v >= 25 && v <= 29) return 0x232323; // sprężarka
    return shade(body, 0.9);
  };
  const side: Paint = (u, v) => (u === 2 ? shade(body, 0.7) : v === 19 && u <= 2 ? shade(body, 0.7) : body);
  const top: Paint = (u, v) => (h2(u, v, seed + 31) < 0.08 ? shade(body, 0.9) : body);
  return [
    box(7, 4, 0, 25, 23, 30, body, { top, front, back, left: side, right: side }),
    box(20, 23, 6, 22, 24, 26, M.steelD, { flat: true }),
  ];
}

function lozko(seed: number): Box[] {
  const r = rnd(seed, 915);
  const wood = pick(WOODS, r(1));
  const [b0, b1] = pick(BLANKET, r(2));
  const mid = mix(b0, b1, 0.45);
  const plaid = (u: number, v: number) => {
    const a = (u + 2) % 9 < 3;
    const bb = (v + 4) % 9 < 3;
    if (a && bb) return b1;
    if (a || bb) return (u + v) % 2 ? mid : shade(mid, 0.94);
    return (u + 1) % 9 === 5 || (v + 4) % 9 === 6 ? shade(b0, 0.85) : b0;
  };
  const top: Paint = (u, v, w) => {
    // poduszka, wywinięte prześcieradło, koc w kratę
    if (v >= 1 && v <= 11 && u >= 3 && u <= w - 4) {
      if (v === 1 || v === 11 || u === 3 || u === w - 4) return M.linenD;
      return v === 6 && u > 6 && u < w - 7 ? M.linenD : M.linen;
    }
    if (v <= 13) return M.linen;
    if (v === 14) return M.linenD;
    return plaid(u, v);
  };
  const hang: Paint = (u, v) => (v <= 2 ? plaid(u, v + 4) : shade(wood, 0.9)); // koc zwisa z boku
  const board: Paint = (u, v, w, h) =>
    u === 1 || u === w - 2 || v === 1 || v === h - 2 ? shade(wood, 0.82) : v === 0 ? shade(wood, 1.1) : wood;
  const b: Box[] = [];
  for (const [x, y] of [
    [2, 4],
    [28, 4],
    [2, 59],
    [28, 59],
  ])
    b.push(box(x, y, 0, x + 2, y + 2, 2, shade(wood, 0.75)));
  b.push(box(2, 3, 2, 30, 62, 6, wood));
  b.push(box(3, 4, 6, 29, 61, 9, b0, { top, front: hang, back: hang, left: hang, right: hang }));
  b.push(box(2, 0, 0, 30, 3, 18, wood, { front: board, back: board }));
  b.push(box(2, 61, 0, 30, 64, 11, wood, { front: board, back: board }));
  return b;
}

function wersalka(seed: number): Box[] {
  const r = rnd(seed, 916);
  const fab = pick(FABRIC, r(1));
  const wood = pick(WOODS, r(2));
  const tex = (u: number, v: number) =>
    (u + v * 2) % 5 === 0 ? shade(fab, 0.9) : (u * 3 + v) % 11 === 0 ? shade(fab, 1.08) : fab;
  const seatTop: Paint = (u, v, w) =>
    u === w >> 1 || u === 0 || u === w - 1 ? shade(fab, 0.78) : v === 0 ? shade(fab, 0.85) : tex(u, v);
  const seatFront: Paint = (u, v, w) => (v === 0 ? shade(fab, 1.12) : u === w >> 1 ? shade(fab, 0.8) : tex(u, v));
  const backFront: Paint = (u, v, w) => {
    const k = Math.floor(w / 3);
    if (u % k === 0 && u > 0 && u < w - 2) return shade(fab, 0.75);
    return v === 0 ? shade(fab, 1.12) : tex(u, v);
  };
  const arm: Paint = (_u, v) => (v === 0 ? shade(wood, 1.12) : wood);
  return [
    box(3, 6, 0, 61, 29, 3, shade(wood, 0.8)),
    box(3, 8, 3, 61, 29, 9, fab, {
      top: seatTop,
      front: seatFront,
      back: seatFront,
      left: seatFront,
      right: seatFront,
    }),
    box(5, 4, 9, 59, 11, 17, fab, { top: (u, v) => tex(u, v), front: backFront, back: backFront }),
    box(1, 4, 0, 5, 29, 12, wood, { top: arm, front: arm, back: arm, left: arm, right: arm }),
    box(59, 4, 0, 63, 29, 12, wood, { top: arm, front: arm, back: arm, left: arm, right: arm }),
  ];
}

function mebloscianka(seed: number): Box[] {
  const r = rnd(seed, 917);
  const ven = pick(VENEER, r(1));
  const grain = (u: number, v: number, c: number) => {
    const g = vnoise(u * 7, v, 12, seed + 41);
    return g > 0.7 ? shade(c, 0.9) : g < 0.15 ? shade(c, 1.07) : c;
  };
  const front: Paint = (u, v, _w, h) => {
    if (v <= 1) return shade(ven, v === 0 ? 1.1 : 0.75); // gzyms
    if (v >= h - 2) return shade(ven, 0.6); // cokół
    const seg = Math.floor(u / 24);
    const su = u % 24;
    if (su === 0 || su === 23) return shade(ven, 0.7);
    switch (seg) {
      case 0: {
        // szafa na ubrania: dwoje drzwi
        if (su === 12) return shade(ven, 0.7);
        if ((su === 10 || su === 14) && v >= 15 && v <= 18) return M.brass;
        return grain(u, v, ven);
      }
      case 1: {
        // witryna z kryształami
        if (v >= 3 && v <= 17 && su >= 2 && su <= 21) {
          if (v === 3 || v === 17 || su === 2 || su === 21) return shade(ven, 0.75);
          if (v === 10) return shade(ven, 1.15); // szklana półka
          const shelfV = v < 10 ? v - 4 : v - 11;
          const vase = (Math.floor(su / 3) + (v < 10 ? 0 : 1)) % 2 === 0 && shelfV >= 2;
          if (vase && h2(Math.floor(su / 3), v < 10 ? 1 : 2, seed + 42) < 0.8)
            return (su + v) % 3 === 0 ? 0xffffff : M.crystal;
          return (u + v) % 9 === 0 ? 0xb6ccd4 : M.glass;
        }
        if (v >= 19) {
          if (v === 19 || su === 12) return shade(ven, 0.7);
          if ((su === 10 || su === 14) && v === 24) return M.brass;
        }
        return grain(u, v, ven);
      }
      case 2: {
        // półki z książkami, niżej szuflady
        if (v >= 3 && v <= 19) {
          if (v === 11 || v === 19) return shade(ven, 1.15);
          const shelf = v < 11 ? 0 : 1;
          const bottom = shelf ? 18 : 10;
          const spine = Math.floor(su / 2);
          const hgt = 4 + Math.floor(h2(spine, shelf, seed + 43) * 4);
          const gap = h2(spine, shelf, seed + 44) < 0.12;
          if (!gap && su >= 2 && su <= 21 && bottom - v < hgt) {
            const bc = pick(BOOKS, h2(spine, shelf, seed + 45));
            return su % 2 === 0 ? bc : shade(bc, 0.8);
          }
          return shade(ven, 0.45); // głąb półki
        }
        if (v >= 21) {
          if (v === 21 || v === 26) return shade(ven, 0.7);
          if (su === 12 && (v === 23 || v === 29)) return M.brass;
        }
        return grain(u, v, ven);
      }
      default: {
        // wnęka z martwym telewizorem
        if (v >= 5 && v <= 19 && su >= 2 && su <= 21) {
          if (su >= 4 && su <= 19 && v >= 7 && v <= 17) {
            if (su === 4 || su === 19 || v === 7 || v === 17) return 0x2a2c2e;
            return (su + v) % 7 === 0 ? 0x2e363c : 0x15191b;
          }
          return shade(ven, 0.45);
        }
        if (v >= 21) {
          if (v === 21 || v === 26) return shade(ven, 0.7);
          if (su === 12 && (v === 23 || v === 29)) return M.brass;
        }
        return grain(u, v, ven);
      }
    }
  };
  const back: Paint = (u, v) => {
    if (u >= 40 && u <= 49 && v >= 10 && v <= 14) return v === 12 && u > 41 && u < 48 ? 0x8a8170 : 0xd8d0b8; // naklejka z fabryki
    return h2(u, v, seed + 46) < 0.1 ? shade(M.fiber, 0.9) : M.fiber;
  };
  const side: Paint = (u, v, w, h) =>
    u === 0 || u === w - 1 || v === 0 || v === h - 1 ? shade(ven, 0.8) : grain(v, u, ven);
  const top: Paint = (u, v) => (h2(u, v, seed + 47) < 0.06 ? shade(ven, 1.12) : grain(u, v, ven));
  return [box(0, 2, 0, 96, 17, 34, ven, { top, front, back, left: side, right: side })];
}

function wanna(seed: number): Box[] {
  const r = rnd(seed, 918);
  const en = M.white;
  const top: Paint = (u, v, w, h) => {
    if (u <= 1 || v <= 1 || u >= w - 2 || v >= h - 2) return u === 0 || v === 0 ? shade(en, 1.06) : en; // rant
    if (u <= 3 || v <= 3 || u >= w - 4 || v >= h - 4) {
      // wewnętrzne ścianki: zachodnia w cieniu, północna oświetlona
      if (u <= 3) return shade(en, 0.8);
      if (v <= 3) return shade(en, 1.04);
      return shade(en, 0.9);
    }
    if (u >= 7 && u <= 8 && v >= 10 && v <= 11) return 0x2a2826; // odpływ
    if (v >= 10 && v <= 12 && u > 8 && u < 8 + 12 * r(1) + 6 && h2(u, v, seed + 51) < 0.7) return 0xa8754a; // rdzawy zaciek
    return shade(en, 0.93);
  };
  const side: Paint = (u, v) => (v === 0 ? shade(en, 1.06) : h2(u, v, seed + 52) < 0.025 ? 0x2e2b28 : en);
  return [
    box(4, 5, 0, 60, 28, 9, en, { top, front: side, back: side, left: side, right: side }),
    box(6, 14, 9, 9, 19, 12, M.steel, { flat: true }),
  ];
}

function sedes(seed: number): Box[] {
  const r = rnd(seed, 919);
  const cer = M.white;
  const seat = r(1) < 0.6 ? 0x2b2826 : 0xd9d2c0; // deska z bakelitu albo kremowa
  const scale = r(2) < 0.6; // osad kamienia
  const bowl: Paint = (u, v, w, h) => {
    const e = ((u + 0.5 - w / 2) / (w / 2)) ** 2 + ((v + 0.5 - h / 2) / (h / 2)) ** 2;
    if (e > 1) return HOLE;
    if (e > 0.6) return u + v < w / 2 ? shade(seat, 1.2) : seat;
    if (e > 0.45) return shade(cer, 0.9);
    if (scale && e > 0.3 && e < 0.38) return 0x9a7a4a;
    return e < 0.1 ? 0x56676a : 0x86999c; // woda
  };
  const tank: Paint = (u, v, w) =>
    u >= w / 2 - 1 && u <= w / 2 && v >= 2 && v <= 3 ? M.steel : v === 0 ? shade(cer, 1.05) : cer;
  return [
    box(14, 0, 2, 18, 3, 8, shade(cer, 0.9), { round: true }),
    box(9, 2, 8, 23, 8, 21, cer, { top: tank, front: (_u, v) => (v === 0 ? shade(cer, 1.05) : cer) }),
    box(11, 6, 0, 21, 12, 7, cer),
    box(10, 8, 7, 22, 24, 9, cer, { top: bowl, front: (_u, v) => (v === 0 ? seat : cer) }),
  ];
}

function umywalka(rot: Rot, seed: number): Box[] {
  const r = rnd(seed, 920);
  const cer = M.white;
  const basin: Paint = (u, v, w, h) => {
    const e = ((u + 0.5 - w / 2) / (w / 2 - 1.5)) ** 2 + ((v + 0.5 - h / 2 - 1) / (h / 2 - 2)) ** 2;
    if (e > 1) return u === 0 || v === 0 ? shade(cer, 1.06) : cer;
    if (e < 0.06) return 0x2a2826; // odpływ
    if (r(1) < 0.5 && e < 0.4 && u > w / 2) return 0xa8865a; // zaciek
    return v < h / 2 - 1 ? shade(cer, 0.84) : shade(cer, 0.94);
  };
  const b: Box[] = [
    box(13, 3, 0, 19, 10, 12, cer, { round: true }),
    box(6, 2, 12, 26, 15, 16, cer, { top: basin }),
    box(15, 2, 16, 17, 6, 19, M.steel, { flat: true }),
  ];
  // lustro nad umywalką widać tylko na ścianie północnej
  if (rot === 0) {
    const mirror: Paint = (u, v, w, h) =>
      u === 0 || v === 0 || u === w - 1 || v === h - 1 ? 0x6b6a66 : (u - v + 20) % 9 < 2 ? 0xd2dde0 : 0x9fb3b9;
    b.push(box(10, 0, 21, 22, 1, 31, 0x9fb3b9, { front: mirror, flat: true }));
  }
  return b;
}

function furniture(kind: FurnitureKind, rot: Rot, seed: number, fire: number): Box[] {
  switch (kind) {
    case 'koza':
      return koza(rot, seed, fire);
    case 'stol':
      return stol(seed);
    case 'krzeslo':
      return krzeslo(seed);
    case 'kuchenka':
      return kuchenka(seed);
    case 'lodowka':
      return lodowka(seed);
    case 'lozko':
      return lozko(seed);
    case 'wersalka':
      return wersalka(seed);
    case 'mebloscianka':
      return mebloscianka(seed);
    case 'wanna':
      return wanna(seed);
    case 'sedes':
      return sedes(seed);
    default:
      return umywalka(rot, seed);
  }
}

// ---------------------------------------------------------------- rzeczy na mapie

function trzepak(rot: Rot, seed: number): Sprite {
  const r = rnd(seed, 921);
  const paint = pick(RACK, r(1));
  const rusty = (u: number, v: number) => (h2(u, v, seed + 61) < 0.18 ? M.rust : paint);
  const pipe: Partial<Box> = { round: true, top: rusty, front: rusty, back: rusty, left: rusty, right: rusty };
  const b: Box[] = [
    // betonowe stopy
    box(2, 12, 0, 9, 19, 1, M.concrete),
    box(87, 12, 0, 94, 19, 1, M.concrete),
    // słupki i drążek
    box(4, 14, 0, 7, 17, 26, paint, pipe),
    box(89, 14, 0, 92, 17, 26, paint, pipe),
    box(4, 14, 24, 92, 17, 27, paint, pipe),
  ];
  if (r(2) < 0.5) b.push(box(7, 14, 12, 89, 16, 14, paint, pipe)); // niższy drążek
  return renderBoxes(b, 96, 32, rot);
}

/** stos drewna: okrąglaki i polana czołami na południe, w rzędach od dołu */
function drewno(size: 1 | 2 | 3, seed: number): Sprite {
  const rows = size === 1 ? [2, 1] : size === 2 ? [3, 2, 1] : [4, 3, 2, 1];
  const rx = 4;
  const rz = 3;
  const Y0 = 13;
  const Y1 = 27;
  const MAXLEN = 2; // czoła wysunięte nierówno, najwyżej o tyle
  const logs: { xc: number; zc: number; split: boolean; k: number; len: number }[] = [];
  let k = 0;
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const xc = 16 + (i - (n - 1) / 2) * 8;
      const len = Math.floor(h2(k, 1, seed + 71) * (MAXLEN + 1));
      logs.push({ xc, zc: rz + row * 5, split: h2(k, 2, seed + 72) < 0.35, k: k++, len });
    }
  });
  const bounds: Bounds = { x0: 0, y0: 0, x1: 32, y1: 32 };
  // granice z największego wysunięcia, żeby rozmiar nie zależał od ziarna
  for (const l of logs) {
    grow(bounds, l.xc - rx, Y0 - l.zc - rz - 1, l.xc + rx, Y1 + MAXLEN - l.zc + rz + 1);
    grow(bounds, l.xc - rx + 2, Y0 - 2, l.xc + rx + 2, Y1 + MAXLEN - 2);
  }
  const R = new Raster(bounds);
  for (const l of logs) {
    const y1 = Y1 + l.len - 2; // czoła nierówno
    // kora z wierzchu (albo płaska powierzchnia łupania)
    for (let sx = Math.floor(l.xc - rx); sx < Math.ceil(l.xc + rx); sx++) {
      const dx = (sx + 0.5 - l.xc) / rx;
      if (Math.abs(dx) > 1) continue;
      const zs = l.split ? l.zc + 1 : l.zc + rz * Math.sqrt(1 - dx * dx);
      for (let sy = Math.floor(Y0 - zs); sy < Math.floor(y1 - zs); sy++) {
        let c: number;
        if (l.split) c = h2(sx, sy >> 1, seed + 73) < 0.3 ? shade(M.split, 0.9) : M.split;
        else {
          c = dx < -0.4 ? M.barkHi : dx > 0.45 ? M.barkD : M.bark;
          if (h2(sx, sy >> 2, seed + 74 + l.k) < 0.2) c = shade(c, 0.85);
        }
        R.frag(sx, sy, zs, c, l.k);
      }
    }
    // czoło: słoje
    for (let sy = Math.floor(y1 - l.zc - rz - 1); sy <= Math.ceil(y1 - l.zc + rz); sy++)
      for (let sx = Math.floor(l.xc - rx); sx < Math.ceil(l.xc + rx); sx++) {
        const dx = (sx + 0.5 - l.xc) / rx;
        const dz = (y1 - sy - 0.5 - l.zc) / rz;
        const e = Math.sqrt(dx * dx + dz * dz);
        if (e > 1 || (l.split && dz > 0.15)) continue;
        let c: number;
        if (e > 0.78) c = M.barkD;
        else if (e < 0.22) c = M.cutC;
        else c = Math.floor(e * 5) % 2 ? M.cutD : M.cut;
        R.frag(sx, sy, l.zc + dz * rz, c, l.k);
      }
    R.shadow(Math.floor(l.xc - rx) + 2, Y0 - 2, Math.ceil(l.xc + rx) + 2, y1 - 2);
  }
  return R.finish(R.ox + 16, R.oy + 32);
}

/** zapas jedzenia: słoiki z piwnicy, skrzynka ziemniaków, worek */
function jedzenie(size: 1 | 2 | 3, seed: number): Sprite {
  const r = rnd(seed, 941);
  const b: Box[] = [];
  let k = 0;
  const jar = (x: number, y: number) => {
    const fill = pick(JARS, r(k++));
    const glass: Paint = (u, v) =>
      v <= 1 ? 0xc29a3a : u === 0 ? shade(fill, 1.3) : v === 2 ? shade(fill, 1.15) : fill;
    b.push(
      box(x, y, 0, x + 4, y + 4, 7, fill, {
        top: (u, v) => ((u + v) % 3 === 0 ? 0xd9b04a : 0xc29a3a),
        front: glass,
        back: glass,
        left: glass,
        right: glass,
      }),
    );
  };
  const wood = pick(WOODS, r(20));
  const crate = (x: number, y: number) => {
    const slats: Paint = (_u, v) => (v % 3 === 2 ? shade(wood, 0.6) : v % 3 === 0 ? shade(wood, 1.1) : wood);
    const top: Paint = (u, v, w, h) => {
      if (u <= 1 || v <= 1 || u >= w - 2 || v >= h - 2) return shade(wood, 1.12);
      // ziemniaki: bulwy rozrzucone po siatce, najbliższa wygrywa
      let best = 9;
      let lit = 0;
      const cu = Math.floor(u / 4);
      const cv = Math.floor(v / 3);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gu = cu + i;
          const gv = cv + j;
          const dx = (u + 0.5 - (gu * 4 + 2 + (h2(gu, gv, seed + 944) - 0.5) * 1.6)) / 2.1;
          const dy = (v + 0.5 - (gv * 3 + 1.5 + (h2(gu, gv, seed + 945) - 0.5) * 1.2)) / 1.6;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            lit = -dx - dy;
          }
        }
      if (best > 1) return 0x4a3a24;
      return lit > 0.5 ? 0xc9a463 : best > 0.6 ? 0x8a6534 : 0xa47e40;
    };
    b.push(box(x, y, 0, x + 17, y + 14, 8, wood, { top, front: slats, back: slats, left: slats, right: slats }));
  };
  if (size === 1) {
    jar(6, 15);
    jar(12, 16);
    jar(18, 15);
    b.push(
      box(23, 17, 0, 27, 21, 5, M.steel, { round: true, top: (u, v) => (u === 0 || v === 0 ? 0xc9cdd0 : M.steel) }),
    );
  } else {
    crate(3, 9);
    jar(22, 14);
    jar(23, 20);
    if (size === 3) {
      const burlap = 0xa08a5c;
      const sack: Paint = (u, v) => (h2(u, v, seed + 943) < 0.2 ? shade(burlap, 0.88) : burlap);
      b.push(
        box(19, 2, 0, 30, 13, 13, burlap, { round: true, top: sack, front: sack, back: sack, left: sack, right: sack }),
      );
      b.push(box(23, 6, 13, 26, 9, 15, shade(burlap, 0.8)));
      jar(4, 23);
      jar(9, 24);
    }
  }
  return renderBoxes(b, PX, PX, 0);
}

// ---------------------------------------------------------------- drzewa

/** wymiary jak w treeSprite z trees.ts, żeby suche drzewo i pień stały tam, gdzie żywe drzewo */
function treeFrame(t: Tree) {
  const rb = Math.round(t.r * 4) / 4;
  const R = rb * PX;
  const lift = t.kind === 2 ? 0.3 * PX : 1.2 * PX;
  const W = Math.ceil(R * 2 + 8);
  const H = Math.ceil(R * 2 + lift + 12);
  return { R, lift, W, H, cx: W / 2, cy: R + 4, tw: Math.max(4, Math.round(R * 0.16)) };
}

const STUMP_H = 7; // wysokość pnia w pikselach ekranu

/** promień pnia z odziomkiem dla drzewa o promieniu korony r (grubość pnia jak w treeSprite) */
const stumpRadius = (r: number) => Math.round(treeFrame({ x: 0, y: 0, kind: 0, r, seed: 0 }).tw * 0.6) + 2;

/**
 * Pień: niski walec z jasnym przekrojem i słojami, korzenie na boki. (cx, cyb) to środek podstawy
 * w pikselach podłogi, (ax, ay) kotwica; granice obejmują też podstawę 0..fw × 0..fh.
 */
function stump(
  rr: number,
  seed: number,
  cx: number,
  cyb: number,
  fw: number,
  fh: number,
  ax: number,
  ay: number,
): Sprite {
  const hz = STUMP_H;
  const bounds: Bounds = { x0: 0, y0: 0, x1: fw, y1: fh };
  grow(bounds, cx - rr - 5, cyb - hz - rr - 2, cx + rr + 6, cyb + rr + 3);
  const R = new Raster(bounds);
  // korzenie
  for (const [a, len] of [
    [-0.15, 4],
    [Math.PI + 0.25, 4],
    [Math.PI / 2 + 0.6, 3],
    [Math.PI / 2 - 0.7, 3],
  ]) {
    const ex = cx + Math.cos(a) * (rr + len);
    const ey = cyb + Math.sin(a) * (rr + len) * 0.8;
    for (let s = 0; s <= 1; s += 0.1) {
      const x = Math.round(cx + (ex - cx) * s);
      const y = Math.round(cyb + (ey - cyb) * s);
      const z = (1 - s) * 3;
      for (let k = 0; k < 2; k++) R.frag(x, y - Math.round(z) + k, z, k ? M.barkD : M.bark, 0);
    }
  }
  // bok pnia
  for (let sx = cx - rr; sx < cx + rr; sx++) {
    const dx = sx + 0.5 - cx;
    if (Math.abs(dx) > rr) continue;
    const yf = cyb + Math.sqrt(rr * rr - dx * dx);
    for (let sy = Math.floor(yf - hz); sy < Math.floor(yf); sy++) {
      const t2 = (dx + rr) / (2 * rr);
      let c: number = t2 < 0.3 ? M.barkHi : t2 > 0.7 ? M.barkD : M.bark;
      if (h2(sx, sy >> 1, seed + 81) < 0.25) c = shade(c, 0.82);
      R.frag(sx, sy, yf - sy - 0.5, c, 1);
    }
  }
  // przekrój
  const crack = h2(seed, 1, 82) * Math.PI * 2;
  for (let sy = cyb - hz - rr - 1; sy <= cyb - hz + rr + 1; sy++)
    for (let sx = cx - rr - 1; sx <= cx + rr + 1; sx++) {
      const dx = sx + 0.5 - cx;
      const dy = sy + 0.5 - (cyb - hz);
      const d = Math.hypot(dx, dy);
      if (d > rr) continue;
      let c: number;
      if (d > rr - 1.2) c = M.barkD;
      else if (d < 1.2) c = M.cutC;
      else c = Math.floor(d / 1.6) % 2 ? M.cutD : M.cut;
      const ang = Math.atan2(dy, dx);
      if (d > 1.5 && d < rr - 1.5 && Math.abs(((ang - crack + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.12)
        c = shade(M.cutC, 0.8); // pęknięcie
      R.frag(sx, sy, hz, c, 2);
    }
  R.shadow(cx - rr + 2, cyb - rr - 2, cx + rr + 2, cyb + rr - 2);
  return R.finish(R.ox + ax, R.oy + ay);
}

/**
 * Pień po ściętym drzewie t, w miejscu pnia: kotwica na przedniej krawędzi pnia, więc rysuje się
 * go w (t.x, t.y) tak samo jak treeSprite. Pień jako rzecz na kafelku daje thingSprite({ kind: 'pien' }).
 */
export function stumpSprite(t: Tree): Sprite {
  const rr = stumpRadius(t.r);
  return stump(rr, t.seed | 0, 0, -rr, 0, 0, 0, 0);
}

/**
 * Suche drzewo bez liści, w tej samej ramce co treeSprite z trees.ts (te same w, h, ax, ay dla tego
 * samego Tree), więc można je podmienić w miejscu żywego drzewa. Gałęzie z ziarna drzewa.
 */
export function deadTreeSprite(t: Tree): Sprite {
  const { R, lift, W, H, cx, cy, tw } = treeFrame(t);
  const seed = t.seed | 0;
  const px = new Uint32Array(W * H);
  const thick = new Uint8Array(W * H);
  let n = 0;
  const rn = () => h2(seed, n++, 931);
  const baseY = cy + lift;
  const segs: [number, number, number, number, number][] = [];
  // gałęzie mieszczą się w kole korony
  const clip = (x: number, y: number): [number, number] => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    const m = R * 0.96;
    return d <= m ? [x, y] : [cx + (dx / d) * m, cy + (dy / d) * m];
  };
  const branch = (x: number, y: number, ang: number, len: number, th: number, depth: number) => {
    const [x2, y2] = clip(x + Math.cos(ang) * len, y - Math.sin(ang) * len);
    segs.push([x, y, x2, y2, th]);
    if (depth <= 0 || len < 5) return;
    const k = 2 + (rn() < 0.3 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const spread = (i - (k - 1) / 2) * (0.5 + rn() * 0.3) + (rn() - 0.5) * 0.3;
      branch(x2, y2, ang + spread, len * (0.62 + rn() * 0.16), Math.max(1, th * 0.62), depth - 1);
    }
  };
  if (t.kind === 1) {
    // suchy świerk: pień do czubka, gałęzie opadają, krótsze ku górze
    const topY = cy - R * 0.92;
    segs.push([cx, baseY + 1, cx, topY, tw * 0.7]);
    let side = rn() < 0.5 ? -1 : 1;
    for (let y = cy + R * 0.55; y > topY + 4; y -= 4 + rn() * 3) {
      const span = ((y - topY) / (baseY - topY)) * R * 1.1;
      const ang = side < 0 ? Math.PI + 0.25 + rn() * 0.25 : -0.25 - rn() * 0.25;
      branch(cx, y, ang, span * (0.7 + rn() * 0.3), 2, 1);
      side = -side;
    }
  } else if (t.kind === 2) {
    // suchy krzak: pęk cienkich łodyg z ziemi
    const k = 7 + Math.floor(rn() * 4);
    for (let i = 0; i < k; i++) {
      const ang = Math.PI * (0.18 + (0.64 * (i + rn() * 0.6)) / k);
      branch(cx + (rn() - 0.5) * 4, baseY, ang, R * (0.55 + rn() * 0.3), 2, 2);
    }
  } else {
    // suche liściaste: pień, trzy, cztery konary, rozwidlenia
    const lean = (rn() - 0.5) * R * 0.15;
    const fork = cy + R * 0.12;
    segs.push([cx, baseY + 1, cx + lean, fork, tw]);
    const k = 3 + (rn() < 0.5 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const ang = Math.PI * (0.2 + (0.6 * (i + 0.2 + rn() * 0.6)) / k);
      branch(cx + lean, fork, ang, R * (0.42 + rn() * 0.18), Math.max(2, tw * 0.6), 3);
    }
    // konar odrastający niżej z pnia
    if (rn() < 0.7) {
      const side = rn() < 0.5 ? 0.35 : Math.PI - 0.35;
      branch(cx + lean * 0.5, cy + R * 0.5, side + (rn() - 0.5) * 0.2, R * 0.45, Math.max(2, tw * 0.45), 2);
    }
  }
  // grube na końcu, żeby pień przykrywał gałązki
  segs.sort((a, b) => a[4] - b[4]);
  for (const [x0, y0, x1, y1, th] of segs) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const half = th / 2;
    const nx = -dy / Math.sqrt(L2);
    const ny = dx / Math.sqrt(L2);
    for (let y = Math.floor(Math.min(y0, y1) - half - 1); y <= Math.ceil(Math.max(y0, y1) + half + 1); y++)
      for (let x = Math.floor(Math.min(x0, x1) - half - 1); x <= Math.ceil(Math.max(x0, x1) + half + 1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const qx = x + 0.5 - x0;
        const qy = y + 0.5 - y0;
        const s = Math.max(0, Math.min(1, (qx * dx + qy * dy) / L2));
        const ex = qx - s * dx;
        const ey = qy - s * dy;
        const d = Math.hypot(ex, ey);
        if (d > Math.max(0.55, half)) continue;
        // światło z dołu i z lewej
        const side = th < 2 ? 0 : ex * nx + ey * ny;
        const lightSide = nx * -0.7 + ny * 0.7 > 0 ? side > 0 : side < 0;
        let c: number = th < 2 ? M.dead : d > half - 1 ? (lightSide ? M.deadHi : M.deadD) : M.dead;
        if (th >= 3 && h2(x, y >> 1, seed + 932) < 0.12) c = shade(c, 0.85); // spękana kora
        const i = y * W + x;
        px[i] = rgba(c);
        if (th >= 2) thick[i] = 1;
      }
  }
  // obrys pnia i konarów
  const out = new Uint32Array(px);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (px[i]) continue;
      if (
        (x > 0 && thick[i - 1]) ||
        (x < W - 1 && thick[i + 1]) ||
        (y > 0 && thick[i - W]) ||
        (y < H - 1 && thick[i + W])
      )
        out[i] = rgba(M.deadO);
    }
  return { w: W, h: H, ax: cx, ay: cy + lift, px: out };
}

// ---------------------------------------------------------------- wejście

/** sprite rzeczy; te same argumenty dają te same piksele */
export function thingSprite(spec: ThingSpec): Sprite {
  const seed = (spec.seed ?? 0) | 0;
  if (spec.kind === 'drewno') return drewno(spec.size, seed);
  if (spec.kind === 'jedzenie') return jedzenie(spec.size, seed);
  if (spec.kind === 'pien') {
    // na środku kafelka, kotwica na dolnej krawędzi kafelka jak u innych rzeczy
    const rr = Math.min(12, stumpRadius(spec.r ?? 2.2));
    return stump(rr, seed, PX / 2, PX / 2 + 2, PX, PX, PX / 2, PX);
  }
  if (spec.kind === 'trzepak') return trzepak(spec.rot, seed);
  const [a, b] = BASE[spec.kind];
  const fire = spec.kind === 'koza' && spec.fire !== undefined && spec.fire >= 0 ? spec.fire : -1;
  return renderBoxes(furniture(spec.kind, spec.rot, seed, fire), a * PX, b * PX, spec.rot);
}
