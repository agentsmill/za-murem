/* Rzeczy rysowane kodem (grafika zastępcza): meble wnętrza w czterech ustawieniach, stos drewna,
   pień po ściętym drzewie, suche drzewo i trzepak. Meble składam z brył (prostopadłościanów)
   rzutowanych jak fasady: wierzch przesunięty w górę o wysokość, pod nim ściana od południa.
   Bufor głębokości rozstrzyga, co zasłania co, więc cztery ustawienia wychodzą z jednego modelu.
   Czyste funkcje bez DOM: sprite { w, h, ax, ay, px } z pikselami rgba() (0 = przezroczysty)
   i kotwicą na środku dolnej krawędzi podstawy, do sortowania po y z pionkami. Rozmiar i kotwica
   zależą tylko od rodzaju i ustawienia, ziarno zmienia kolory i drobiazgi. */

import type { Tree } from '../../world/world.ts';
import {
  type Bounds,
  type Box,
  box,
  FIRE_FRAMES,
  fireColor,
  grow,
  HOLE,
  LIT,
  M,
  type Paint,
  PX,
  pick,
  Raster,
  type Rot,
  renderBoxes,
  rnd,
  type Sprite,
  WOODS,
} from './bryly.ts';
import {
  BUILD_BASE,
  BUILD_KINDS,
  type BuildKind,
  brokenSprite,
  buildSprite,
  burntSprite,
  smieciBoxes,
  smieciEnv,
} from './budowle.ts';
import { h2, vnoise } from './hash.ts';
import { budaSprite, hustawkaSprite, kompostSprite, lawkaSprite, sznurSprite } from './ogrod.ts';
import { mix, rgba, shade } from './palette.ts';
import {
  armchairSprite,
  boothSprite,
  campfireSprite,
  cartSprite,
  type FenceState,
  type FireStyle,
  fenceSprite,
  gateSprite,
  lampSprite,
  pileSprite,
} from './podworko.ts';
import { WRECK_BASE, type WreckModel, wreckSprite } from './wraki.ts';

export type { Rot, Sprite } from './bryly.ts';
export { FIRE_FRAMES } from './bryly.ts';
export { BUILD_BASE, BUILD_KINDS, type BuildKind } from './budowle.ts';
export { FENCE_H, FENCE_X, FENCE_Y, type FenceState, type FireStyle, type Pile } from './podworko.ts';
export { WRECK_BASE, WRECK_MODELS, type WreckModel } from './wraki.ts';

/** pikseli ekranu na metr wysokości: połowa skali poziomej, jak w niskim rzucie z góry */
export const ZPX = 16;

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

/**
 * Opis rzeczy.
 * - meble: rot przy której ścianie stoją (krzesło: strona oparcia); koza z fire 0..FIRE_FRAMES-1
 *   pali się (klatka ognia), bez fire jest zimna; rura kozy wychodzi przez okno w ścianie rot;
 * - drewno i jedzenie: zapas w trzech wielkościach na kafelku 1×1;
 * - pien: pień po ściętym drzewie o promieniu korony r (jak Tree.r), na kafelku pnia;
 * - trzepak: 3×1 m przy rot 0 i 2, 1×3 przy rot 1 i 3;
 * - siatka: kafelek z maską sąsiadów (NB z wnetrze.ts), cały, z dziurą albo załatany; linia
 *   siatki w kafelku: poziomo y = FENCE_Y, pionowo x = FENCE_X;
 * - brama: dwuskrzydłowa 2×1 (rot 0 i 2) albo 1×2, rot to strona, w którą otwierają się skrzydła;
 * - ognisko: w kręgu kamieni albo w beczce, fire jak w kozie;
 * - gruz, deski, zlom: stos materiału w trzech wielkościach;
 * - budka (rot jak meble, z lampą lit), fotel (rot jak meble), lampa naftowa (lit);
 * - posilek: garnek z ugotowanym posiłkiem, size 0 pusty do 3 pełny (z miskami); table: stoi na
 *   blacie stołu (rysowany na wysokości TABLE_TOP, bez cienia na podłodze);
 * - wrak: maluch 3×2 albo polonez 4×2 przy rot 0 i 2 (1 i 3 odwrotnie), przodem na wschód przy
 *   rot 0, na południe przy 1, na zachód przy 2, na północ przy 3;
 * - budowle M2 (budowle.ts): warsztat, kuchnia_spoleczna, magazyn, lozka_pietrowe, ogrodek, zasieki, pracownia (do czasu
 *   własnego rysunku jak zasieki);
 * - smieci: sterta śmieci z pustego mieszkania w trzech wielkościach;
 * - meble z broken: zepsute (pociemniałe, popękane, drzazgi wokół); z burnt: okopcone (prawie czarne
 *   od sadzy, kuchenka na kafelku uszkodzenia piec);
 * - ogród domu (ogrod.ts): sznur na pranie 3×1 (pranie: z praniem), kompost 1×1, buda 1×1 (rot jak
 *   meble, wejście z przodu), hustawka 2×1 i lawka 2×1 (rot jak meble, oparcie od strony rot);
 *   przy rot 1 i 3 wymiary odwrotnie.
 */
export type ThingSpec =
  | { kind: FurnitureKind; rot: Rot; seed?: number; fire?: number; broken?: boolean; burnt?: boolean }
  | { kind: 'drewno'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'jedzenie'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'pien'; r?: number; seed?: number }
  | { kind: 'trzepak'; rot: Rot; seed?: number }
  | { kind: 'siatka'; mask: number; state?: FenceState; post?: boolean; seed?: number }
  | { kind: 'brama'; rot: Rot; open?: boolean; seed?: number }
  | { kind: 'ognisko'; style?: FireStyle; fire?: number; seed?: number }
  | { kind: 'gruz'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'deski'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'zlom'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'czesci'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'leki'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'wozek'; full?: boolean; seed?: number }
  | { kind: 'budka'; rot: Rot; lit?: boolean; seed?: number }
  | { kind: 'fotel'; rot: Rot; seed?: number }
  | { kind: 'lampa'; lit?: boolean; seed?: number }
  | { kind: 'posilek'; size: 0 | 1 | 2 | 3; table?: boolean; seed?: number }
  | { kind: 'wrak'; model: WreckModel; rot: Rot; seed?: number; stage?: 1 | 2 }
  | { kind: 'krew'; seed?: number }
  | { kind: BuildKind; rot: Rot; seed?: number }
  | { kind: 'smieci'; size: 1 | 2 | 3; seed?: number }
  | { kind: 'sznur'; rot: Rot; pranie?: boolean; seed?: number }
  | { kind: 'kompost'; rot: Rot; seed?: number }
  | { kind: 'buda'; rot: Rot; seed?: number }
  | { kind: 'hustawka'; rot: Rot; seed?: number }
  | { kind: 'lawka'; rot: Rot; seed?: number };

/** podstawa rzeczy w kafelkach (w × h na mapie) */
export function footprint(spec: ThingSpec): { w: number; h: number } {
  switch (spec.kind) {
    case 'trzepak':
    case 'sznur':
      return spec.rot & 1 ? { w: 1, h: 3 } : { w: 3, h: 1 };
    case 'hustawka':
    case 'lawka':
      return spec.rot & 1 ? { w: 1, h: 2 } : { w: 2, h: 1 };
    case 'brama':
      return spec.rot & 1 ? { w: 1, h: 2 } : { w: 2, h: 1 };
    case 'wrak': {
      const [a, b] = WRECK_BASE[spec.model];
      return spec.rot & 1 ? { w: b, h: a } : { w: a, h: b };
    }
    case 'warsztat':
    case 'kuchnia_spoleczna':
    case 'magazyn':
    case 'lozka_pietrowe':
    case 'ogrodek':
    case 'zasieki':
    case 'pracownia': {
      const [a, b] = BUILD_BASE[spec.kind];
      return spec.rot & 1 ? { w: b, h: a } : { w: a, h: b };
    }
    case 'smieci':
    case 'posilek':
    case 'drewno':
    case 'jedzenie':
    case 'pien':
    case 'siatka':
    case 'ognisko':
    case 'gruz':
    case 'deski':
    case 'zlom':
    case 'czesci':
    case 'leki':
    case 'wozek':
    case 'budka':
    case 'fotel':
    case 'lampa':
    case 'krew':
    case 'kompost':
    case 'buda':
      return { w: 1, h: 1 };
    default: {
      const [a, b] = BASE[spec.kind];
      return spec.rot & 1 ? { w: b, h: a } : { w: a, h: b };
    }
  }
}

// ---------------------------------------------------------------- kolory mebli

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

// ---------------------------------------------------------------- meble

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

/** wysokość blatu stołu w pikselach ekranu (blat stołu ze stol() leży od 10 do 12) */
export const TABLE_TOP = 12;

/** emaliowane garnki: kolor i brzeg; czerwony bywa w białe kropki */
const ENAMEL: readonly (readonly [number, number])[] = [
  [0xe6dfca, 0x2f4a6a],
  [0xb8392e, 0xe8e2d4],
  [0x4a74a8, 0xe8e2d4],
  [0x6f8a52, 0x2f3a28],
];
/** gulasz, grochówka, pomidorowa, kapuśniak */
const STEW = [0x8a4a28, 0xa89a48, 0xb8482a, 0xb39a5e] as const;

/**
 * Garnek z ugotowanym posiłkiem: emaliowany, z obtłuczeniami, w środku tyle, ile zostało porcji,
 * chochla i miski obok, gdy jest więcej. Na stole stoi na wysokości blatu i nie rzuca cienia na
 * podłogę (widok rysuje go po stole).
 */
function posilek(size: 0 | 1 | 2 | 3, table: boolean, seed: number): Sprite {
  const r = rnd(seed, 951);
  const [enamel, rim] = pick(ENAMEL, r(1));
  const dots = enamel === ENAMEL[1][0];
  const stew = pick(STEW, r(2));
  const z0 = table ? TABLE_TOP : 0;
  const o: Partial<Box> = table ? { flat: true } : {};
  const side: Paint = (u, v) => {
    if (v === 0) return rim;
    if (h2(u, v, seed + 952) < 0.07) return M.ironD; // obtłuczona emalia
    if (dots && v > 1 && (u + v * 2) % 4 === 0) return 0xe8e2d4;
    return enamel;
  };
  const fill = [0, 0.38, 0.7, 1.1][size];
  const inner = enamel === ENAMEL[0][0] ? 0xcfc8b4 : shade(enamel, 0.55);
  const food = (u: number, v: number) => {
    const k = h2(u, v, seed + 953);
    return k < 0.18 ? shade(stew, 1.25) : k > 0.85 ? shade(stew, 0.75) : stew;
  };
  const top: Paint = (u, v, w, h) => {
    if (u === 0 || v === 0 || u === w - 1 || v === h - 1) return rim;
    const e = ((u + 0.5 - w / 2) / (w / 2 - 1)) ** 2 + ((v + 0.5 - h / 2) / (h / 2 - 1)) ** 2;
    return e < fill ? food(u, v) : inner;
  };
  const b: Box[] = [
    box(7, 13, z0, 19, 21, z0 + 6, enamel, {
      ...o,
      round: true,
      top,
      front: side,
      back: side,
      left: side,
      right: side,
    }),
    // ucha
    box(5, 16, z0 + 4, 7, 18, z0 + 5, rim, o),
    box(19, 16, z0 + 4, 21, 18, z0 + 5, rim, o),
  ];
  if (size > 0) b.push(box(15, 15, z0 + 5, 16, 16, z0 + 11, M.steel, { ...o, round: true })); // chochla
  const bowl = (x: number, y: number, k: number) => {
    const c = r(10 + k) < 0.5 ? 0xe8e4d8 : 0x8a5a3a;
    const inside: Paint = (u, v, w, h) => (u === 0 || v === 0 || u === w - 1 || v === h - 1 ? c : food(u + x, v + y));
    b.push(box(x, y, z0, x + 6, y + 5, z0 + 2, c, { ...o, round: true, top: inside }));
  };
  if (size >= 2) bowl(21, 20, 0);
  if (size >= 3) bowl(22, 12, 1);
  // granice niezależne od porcji i ziarna: ten sam rozmiar i kotwica dla każdego garnka
  return renderBoxes(b, PX, PX, 0, [box(5, 12, z0, 28, 25, z0 + 11, 0, o)]);
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
/** plama krwi na ziemi: kilka kropli wokół środka kafelka, półprzezroczysta, ciemnieje do brzegu */
function krew(seed: number): Sprite {
  const px = new Uint32Array(PX * PX);
  const blob = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= PX || y >= PX) continue;
        const d = Math.hypot(x - cx, (y - cy) * 1.3) / r;
        if (d > 1 + 0.25 * (h2(x, y, seed + 990) - 0.5)) continue;
        const c = d > 0.75 ? 0x3e0c0a : h2(x, y, seed + 991) < 0.15 ? 0x6e1a14 : 0x581210;
        // półprzezroczysta (alfa 0xb0), kolejność bajtów jak w rgba()
        px[y * PX + x] = ((0xb0 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
      }
  };
  blob(16, 18, 6 + 3 * h2(seed, 1, 992));
  for (let k = 0; k < 5; k++) blob(6 + 20 * h2(seed, k, 993), 8 + 18 * h2(seed, k, 994), 1 + 2 * h2(seed, k, 995));
  return { w: PX, h: PX, ax: PX / 2, ay: PX, px };
}

export function thingSprite(spec: ThingSpec): Sprite {
  const seed = (spec.seed ?? 0) | 0;
  if (spec.kind === 'krew') return krew(seed);
  if (spec.kind === 'drewno') return drewno(spec.size, seed);
  if (spec.kind === 'jedzenie') return jedzenie(spec.size, seed);
  if (spec.kind === 'pien') {
    // na środku kafelka, kotwica na dolnej krawędzi kafelka jak u innych rzeczy
    const rr = Math.min(12, stumpRadius(spec.r ?? 2.2));
    return stump(rr, seed, PX / 2, PX / 2 + 2, PX, PX, PX / 2, PX);
  }
  if (spec.kind === 'trzepak') return trzepak(spec.rot, seed);
  if (spec.kind === 'sznur') return sznurSprite(spec.rot, !!spec.pranie, seed);
  if (spec.kind === 'kompost') return kompostSprite(spec.rot, seed);
  if (spec.kind === 'buda') return budaSprite(spec.rot, seed);
  if (spec.kind === 'hustawka') return hustawkaSprite(spec.rot, seed);
  if (spec.kind === 'lawka') return lawkaSprite(spec.rot, seed);
  if (spec.kind === 'siatka') return fenceSprite(spec.mask, spec.state ?? 'cala', spec.post, seed);
  if (spec.kind === 'brama') return gateSprite(spec.rot, !!spec.open, seed);
  if (spec.kind === 'ognisko') return campfireSprite(spec.style ?? 'krag', spec.fire ?? -1, seed);
  if (
    spec.kind === 'gruz' ||
    spec.kind === 'deski' ||
    spec.kind === 'zlom' ||
    spec.kind === 'czesci' ||
    spec.kind === 'leki'
  )
    return pileSprite(spec.kind, spec.size, seed);
  if (spec.kind === 'budka') return boothSprite(spec.rot, !!spec.lit, seed);
  if (spec.kind === 'wozek') return cartSprite(spec.full ?? true, seed);
  if (spec.kind === 'fotel') return armchairSprite(spec.rot, seed);
  if (spec.kind === 'lampa') return lampSprite(!!spec.lit, seed);
  if (spec.kind === 'posilek') return posilek(spec.size, !!spec.table, seed);
  if (spec.kind === 'wrak') return wreckSprite(spec.model, spec.rot, seed, spec.stage ?? 0);
  if (spec.kind === 'smieci') return renderBoxes(smieciBoxes(spec.size, seed), PX, PX, 0, smieciEnv(spec.size));
  if ((BUILD_KINDS as readonly string[]).includes(spec.kind))
    return buildSprite(spec.kind as BuildKind, spec.rot as Rot, seed);
  const f = spec as Extract<ThingSpec, { kind: FurnitureKind }>;
  const [a, b] = BASE[f.kind];
  const fire = f.kind === 'koza' && f.fire !== undefined && f.fire >= 0 ? f.fire : -1;
  const sp = renderBoxes(furniture(f.kind, f.rot, seed, fire), a * PX, b * PX, f.rot);
  return f.burnt ? burntSprite(sp, seed) : f.broken ? brokenSprite(sp, seed) : sp;
}
