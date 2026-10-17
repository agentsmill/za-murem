/* Budowle fali 1 M2 (grafika zastępcza): warsztat ze stołem z imadłem, kuchnia społeczna z kotłem,
   regały magazynu, łóżka piętrowe, grządki ogródka i drut kolczasty zasieków. Do tego sterta śmieci
   z pustych mieszkań w trzech wielkościach i obróbka „zepsuty” dla dowolnego sprite'a mebla
   (pociemniały, popękany, obtłuczony, z drzazgami wokół). Te same bryły i raster co meble (bryly.ts),
   kotwica na środku dolnej krawędzi podstawy, rozmiar i kotwica zależą tylko od rodzaju i ustawienia.
   Ustawienie rot jak u mebli: ściana, przy której stoi (0 północ, 1 wschód, 2 południe, 3 zachód);
   ogródek i zasieki tylko kładą się wzdłuż (rot 0 i 2) albo w poprzek (1 i 3). Czyste funkcje bez DOM. */

import {
  type Box,
  box,
  HOLE,
  LIT,
  M,
  type Paint,
  PX,
  pick,
  type Rot,
  renderBoxes,
  rnd,
  type Sprite,
  WOODS,
} from './bryly.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, rgba, shade } from './palette.ts';

export type BuildKind = 'warsztat' | 'kuchnia_spoleczna' | 'magazyn' | 'lozka_pietrowe' | 'ogrodek' | 'zasieki';
export const BUILD_KINDS: readonly BuildKind[] = [
  'warsztat',
  'kuchnia_spoleczna',
  'magazyn',
  'lozka_pietrowe',
  'ogrodek',
  'zasieki',
];

/** podstawa przy rot 0 w kafelkach (jak BUILDS w sim/budowle.ts): wzdłuż ściany × od ściany */
export const BUILD_BASE: Record<BuildKind, readonly [number, number]> = {
  warsztat: [2, 1],
  kuchnia_spoleczna: [2, 1],
  magazyn: [2, 2],
  lozka_pietrowe: [1, 2],
  ogrodek: [3, 2],
  zasieki: [1, 1],
};

const Q = {
  iron: 0x3a3836,
  ironHi: 0x5c5853,
  vise: 0x4a5a6a,
  viseHi: 0x6d8296,
  tool: 0xa9aeb1,
  soil: 0x4a3a28,
  soilD: 0x3a2d1f,
  soilHi: 0x5e4a33,
  leaf: [0x4f7a3a, 0x5f8a42, 0x6e9a4a, 0x8a9a46] as const,
  cabbage: 0x7aa05a,
  wire: 0x8d9396,
  wireD: 0x5d6366,
  barb: 0x2a2826,
  bag: [0x26282b, 0x2c3a52, 0x3a3f2a] as const,
  card: 0xa8865a,
  cardD: 0x8a6a44,
  tape: 0xc9b98a,
  paper: 0xd8d4c4,
  bottle: [0x3f6b3a, 0x6b4a22, 0x9fb3b9] as const,
  stew: 0x8a4a28,
  brick: C.brick0,
} as const;

/** słoje drewna na wierzchu i bokach */
const grain =
  (c: number, seed: number, k = 1): Paint =>
  (u, v) => {
    const g = vnoise(u * 2, v * 9 * k, 14, seed);
    return g > 0.72 ? shade(c, 0.86) : g < 0.15 ? shade(c, 1.07) : c;
  };

const all = (p: Paint): Partial<Box> => ({ top: p, front: p, back: p, left: p, right: p });

// ---------------------------------------------------------------- warsztat

/** stół warsztatowy 2×1 przy ścianie: gruby blat, półka na dole, imadło na rogu, tablica z narzędziami */
function warsztat(seed: number): Box[] {
  const r = rnd(seed, 1401);
  const wood = pick(WOODS, r(1));
  const legC = shade(wood, 0.8);
  const b: Box[] = [];
  for (const [x, y] of [
    [4, 6],
    [57, 6],
    [4, 25],
    [57, 25],
  ])
    b.push(box(x, y, 0, x + 3, y + 3, 13, legC));
  b.push(box(5, 8, 3, 59, 26, 5, shade(wood, 0.9), { top: grain(shade(wood, 0.9), seed + 2) }));
  // blat: przypalenia i rysy
  const top: Paint = (u, v) => {
    if (h2(u >> 2, v >> 1, seed + 3) < 0.06) return shade(wood, 0.6);
    if ((u + v * 3) % 23 === 0) return shade(wood, 0.78);
    return grain(wood, seed + 4)(u, v, 0, 0);
  };
  b.push(box(2, 4, 13, 62, 29, 16, wood, { top, front: grain(shade(wood, 0.92), seed + 5, 0.3) }));
  // tablica z narzędziami na ścianie
  const board: Paint = (u, v) => {
    if ((u & 3) === 1 && (v & 3) === 1) return 0x5a4a38;
    // sylwetki narzędzi
    if (u >= 8 && u <= 10 && v >= 3 && v <= 11) return Q.tool;
    if (u >= 6 && u <= 12 && v >= 2 && v <= 3) return Q.iron;
    if (u >= 22 && u <= 34 && v >= 4 && v <= 5) return Q.tool;
    if (u >= 34 && u <= 36 && v >= 3 && v <= 6) return 0x7a4a2a;
    if (u >= 44 && u <= 45 && v >= 2 && v <= 10) return 0x8a6a44;
    return 0xc9b48a;
  };
  b.push(box(6, 0, 16, 58, 2, 30, 0xc9b48a, { front: board, top: () => 0xb39c72 }));
  // imadło na prawym przednim rogu: korpus, szczęki, śruba z rączką
  const vise: Paint = (u, v) => (v === 0 ? Q.viseHi : (u + v) % 5 === 0 ? shade(Q.vise, 0.85) : Q.vise);
  b.push(box(48, 18, 16, 58, 27, 20, Q.vise, all(vise)));
  b.push(box(50, 27, 16, 56, 29, 21, Q.vise, all(vise)));
  b.push(box(52, 29, 17, 54, 32, 18, Q.tool, { round: true }));
  b.push(box(48, 31, 17, 58, 32, 18, Q.tool, { opt: true }));
  // na blacie: młotek, piła, puszka gwoździ (drobiazgi zależne od ziarna)
  if (r(10) < 0.8) {
    b.push(box(16, 18, 16, 28, 20, 17, 0x8a6a44, { opt: true }));
    b.push(box(26, 16, 16, 30, 22, 18, Q.iron, { opt: true }));
  }
  if (r(11) < 0.6) {
    b.push(box(32, 8, 16, 46, 14, 17, Q.tool, { opt: true, top: (u) => (u % 2 ? Q.tool : shade(Q.tool, 0.8)) }));
    b.push(box(28, 9, 16, 32, 13, 18, 0x7a4a2a, { opt: true }));
  }
  if (r(12) < 0.7) b.push(box(8, 10, 16, 13, 15, 20, 0x8f8a80, { opt: true, round: true, top: () => 0x5a5650 }));
  return b;
}

// ---------------------------------------------------------------- kuchnia społeczna

/** kuchnia polowa 2×1: żeliwna płyta na cegłach z paleniskiem, duży kocioł, garnek, rura do ściany */
function kuchnia(seed: number): Box[] {
  const r = rnd(seed, 1411);
  const brick: Paint = (u, v) =>
    v % 4 === 3 || (u + (v >> 2) * 4) % 8 === 0 ? 0x9a9184 : (u * 3 + v) % 11 === 0 ? shade(Q.brick, 0.85) : Q.brick;
  const b: Box[] = [
    box(2, 4, 0, 62, 29, 11, Q.brick, { front: brick, back: brick, left: brick, right: brick, top: brick }),
  ];
  // płyta żeliwna i drzwiczki paleniska z żarem
  const plate: Paint = (u, v) =>
    (u + v) % 9 === 0 ? Q.ironHi : (u >> 3) % 2 === (v >> 3) % 2 ? Q.iron : shade(Q.iron, 1.1);
  b.push(box(1, 3, 11, 63, 30, 13, Q.iron, { top: plate }));
  const door: Paint = (u, v, w, h) => {
    if (u === 0 || v === 0 || u === w - 1 || v === h - 1) return Q.iron;
    return (u + v) % 3 === 0 ? 0xe8702c | LIT : 0xb8401f | LIT;
  };
  b.push(box(24, 29, 2, 38, 30, 8, Q.iron, { front: door }));
  // kocioł: emaliowany szary, w środku zupa
  const pot: Paint = (u, v, w, h) => {
    if (u === 0 || v === 0 || u === w - 1 || v === h - 1) return 0x8f948f;
    const e = ((u + 0.5 - w / 2) / (w / 2)) ** 2 + ((v + 0.5 - h / 2) / (h / 2)) ** 2;
    return e < 0.75 ? (h2(u, v, seed + 7) < 0.2 ? shade(Q.stew, 1.25) : Q.stew) : 0x6a6f6a;
  };
  const enamel: Paint = (u, v) => (v === 0 ? 0xa9aea8 : h2(u, v, seed + 8) < 0.06 ? M.ironD : 0x7f857f);
  b.push(
    box(5, 6, 13, 31, 27, 25, 0x7f857f, {
      round: true,
      top: pot,
      front: enamel,
      back: enamel,
      left: enamel,
      right: enamel,
    }),
  );
  b.push(box(2, 15, 21, 5, 18, 23, 0x5a5f5a));
  b.push(box(31, 15, 21, 34, 18, 23, 0x5a5f5a));
  // chochla w kotle, garnek obok
  b.push(box(22, 12, 22, 24, 14, 32, M.steel, { round: true }));
  if (r(1) < 0.8) {
    const blue = 0x4a74a8;
    const rim: Paint = (u, v, w, h) =>
      u === 0 || v === 0 || u === w - 1 || v === h - 1 ? shade(blue, 1.25) : u + v < 6 ? 0x2a2826 : Q.stew;
    b.push(box(38, 9, 13, 52, 23, 20, blue, { round: true, top: rim }));
  }
  // rura do ściany
  b.push(box(55, 5, 13, 59, 9, 44, M.pipe, { round: true }));
  b.push(box(55, 0, 40, 59, 9, 44, M.pipe, { round: true }));
  return b;
}

// ---------------------------------------------------------------- magazyn

/** magazyn 2×2: regał pod ścianą i regał z boku, na półkach skrzynki, słoje i worki, skrzynie na podłodze */
function magazyn(seed: number): Box[] {
  const r = rnd(seed, 1421);
  const wood = pick(WOODS, r(1));
  const steel = 0x6f7479;
  const b: Box[] = [];
  const shelf = (x0: number, y0: number, x1: number, y1: number, k: number) => {
    for (const [x, y] of [
      [x0, y0],
      [x1 - 2, y0],
      [x0, y1 - 2],
      [x1 - 2, y1 - 2],
    ])
      b.push(box(x, y, 0, x + 2, y + 2, 32, steel));
    for (const z of [3, 15, 27])
      b.push(box(x0, y0, z, x1, y1, z + 2, steel, { top: (u, v) => ((u + v) % 6 === 0 ? 0x5a5f63 : steel) }));
    // towar na półkach (zależny od ziarna, wewnątrz regału)
    const n = Math.max(Math.floor((x1 - x0) / 7), Math.floor((y1 - y0) / 7));
    for (let i = 0; i < n; i++)
      for (const z of [5, 17, 29]) {
        const roll = h2(i, z, seed + k);
        if (roll < 0.25) continue;
        const along = x1 - x0 > y1 - y0;
        const a = (along ? x0 : y0) + 1 + i * 7;
        const [bx0, by0, bx1, by1] = along ? [a, y0 + 1, a + 6, y1 - 1] : [x0 + 1, a, x1 - 1, a + 6];
        const c = roll < 0.5 ? wood : roll < 0.7 ? 0xa08a5c : roll < 0.85 ? 0x6b7a3a : 0x8a2a2a;
        b.push(
          box(bx0, by0, z, bx1, by1, z + (roll < 0.5 ? 8 : 6), c, { opt: true, round: roll >= 0.5 && roll < 0.7 }),
        );
      }
  };
  shelf(2, 1, 62, 12, 3);
  shelf(2, 16, 13, 62, 5);
  // skrzynie na podłodze
  const crate: Paint = (u, v) => (v % 4 === 3 || u === 0 ? shade(wood, 0.7) : grain(wood, seed + 9)(u, v, 0, 0));
  b.push(box(30, 34, 0, 50, 52, 10, wood, all(crate)));
  if (r(2) < 0.7) b.push(box(33, 37, 10, 47, 49, 18, shade(wood, 1.08), { ...all(crate), opt: true }));
  if (r(3) < 0.6) b.push(box(52, 44, 0, 61, 60, 12, 0xa08a5c, { round: true, opt: true }));
  return b;
}

// ---------------------------------------------------------------- łóżka piętrowe

/** łóżko piętrowe 1×2 wezgłowiem do ściany: dwa materace z kocami, słupki, drabinka z boku */
function lozka(seed: number): Box[] {
  const r = rnd(seed, 1431);
  const wood = pick(WOODS, r(1));
  const post = shade(wood, 0.8);
  const blankets = [0x5a6b45, 0x7b3a38, 0x4a5c78, 0x8a7a4a] as const;
  const b0 = pick(blankets, r(2));
  const b1 = pick(blankets, r(3));
  const mattress =
    (c: number, k: number): Paint =>
    (u, v, w) => {
      if (v <= 9 && u >= 3 && u <= w - 4) return v === 1 || v === 9 ? M.linenD : M.linen; // poduszka
      if (v <= 11) return M.linen;
      return (u + 2) % 7 < 2 || (v + k) % 9 < 2 ? shade(c, 0.85) : c;
    };
  const b: Box[] = [];
  for (const [x, y] of [
    [2, 1],
    [27, 1],
    [2, 60],
    [27, 60],
  ])
    b.push(box(x, y, 0, x + 3, y + 3, 34, post));
  b.push(box(3, 3, 3, 29, 61, 6, wood));
  b.push(box(4, 4, 6, 28, 60, 10, b0, { top: mattress(b0, 0), front: () => shade(b0, 0.9) }));
  b.push(box(2, 2, 19, 30, 62, 22, wood, { top: grain(wood, seed + 4) }));
  b.push(box(4, 4, 22, 28, 60, 26, b1, { top: mattress(b1, 3), front: () => shade(b1, 0.9) }));
  // poręcz górnego łóżka i drabinka
  b.push(box(2, 2, 26, 30, 4, 30, wood));
  b.push(box(28, 30, 0, 30, 32, 26, post));
  b.push(box(28, 44, 0, 30, 46, 26, post));
  for (const z of [6, 12, 18]) b.push(box(28, 32, z, 30, 44, z + 1, wood));
  return b;
}

// ---------------------------------------------------------------- ogródek

/** ogródek 3×2: trzy podwyższone grządki z desek, ziemia, rzędy rozsady i kapusty, tyczki */
function ogrodek(seed: number): Box[] {
  const r = rnd(seed, 1441);
  const wood = pick(WOODS, r(1));
  const b: Box[] = [];
  const soil: Paint = (u, v, w, h) => {
    if (u === 0 || v === 0 || u === w - 1 || v === h - 1) return shade(wood, 0.9);
    const k = h2(u, v, seed + 5);
    // rzędy rozsady co 4 piksele
    if ((v - 2) % 4 === 0 && u > 1 && u < w - 2 && h2(u >> 1, v, seed + 6) < 0.55)
      return pick(Q.leaf, h2(u, v, seed + 7));
    return k < 0.15 ? Q.soilHi : k > 0.85 ? Q.soilD : Q.soil;
  };
  const side: Paint = (u, v) => (v === 0 ? shade(wood, 1.1) : u % 12 === 0 ? shade(wood, 0.7) : wood);
  for (const y of [3, 23, 43])
    b.push(box(3, y, 0, 93, y + 17, 5, wood, { top: soil, front: side, back: side, left: side, right: side }));
  // kapusty na środkowej grządce
  for (let i = 0; i < 5; i++)
    if (r(10 + i) < 0.75) {
      const x = 10 + i * 17;
      b.push(
        box(x, 27, 5, x + 8, 35, 9, Q.cabbage, {
          round: true,
          opt: true,
          top: (u, v) => ((u + v) % 3 === 0 ? 0x9ac07a : Q.cabbage),
        }),
      );
    }
  // tyczki z fasolą na tylnej grządce
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 22;
    b.push(box(x, 10, 0, x + 2, 12, 22, 0x8a6a44, { opt: true }));
    b.push(
      box(x - 2, 9, 8, x + 4, 13, 18, pick(Q.leaf, r(20 + i)), {
        opt: true,
        top: (u) => (u % 2 ? Q.leaf[2] : Q.leaf[0]),
      }),
    );
  }
  // konewka
  if (r(30) < 0.6) b.push(box(80, 40, 0, 86, 43, 5, 0x5a7a8a, { round: true, opt: true }));
  return b;
}

// ---------------------------------------------------------------- zasieki

/** zasieki 1×1 wzdłuż odcinka (przy rot 0 i 2 ze wschodu na zachód): dwa kozły i zwoje drutu kolczastego */
function zasieki(seed: number): Box[] {
  const r = rnd(seed, 1451);
  const wood = 0x6a5038;
  const b: Box[] = [];
  for (const x of [3, 27]) {
    b.push(box(x, 11, 0, x + 2, 13, 18, wood));
    b.push(box(x, 19, 0, x + 2, 21, 18, wood));
    b.push(box(x, 13, 14, x + 2, 19, 16, wood));
  }
  // zwoje: pętle drutu widziane z przodu i z góry, z kolcami; poza drutem dziura (prześwit)
  const phase = r(1) * 6;
  const loop = (u: number, v: number, h: number) => {
    const cu = ((u + phase) % 6) - 3;
    const cv = v - h / 2 + 0.5;
    const d = Math.hypot(cu * 1.6, (cv * 2) / Math.max(1, h / 4));
    return Math.abs(d - 3.2) < 0.7;
  };
  const coilFront: Paint = (u, v, _w, h) => {
    if (!loop(u, v, h)) return HOLE;
    return h2(u, v, seed + 2) < 0.18 ? Q.barb : v < h / 2 ? Q.wire : Q.wireD;
  };
  const coilTop: Paint = (u, v, _w, h) => {
    if (!loop(u, v, h)) return HOLE;
    return h2(u, v, seed + 3) < 0.18 ? Q.barb : Q.wire;
  };
  b.push(
    box(0, 10, 2, 32, 22, 16, Q.wire, {
      front: coilFront,
      back: coilFront,
      top: coilTop,
      left: coilFront,
      right: coilFront,
      flat: true,
    }),
  );
  return b;
}

// ---------------------------------------------------------------- śmieci

/** sterta śmieci z pustego mieszkania: worki, kartony, butelki, gazety; większa wyżej i szerzej */
export function smieciBoxes(size: 1 | 2 | 3, seed: number): Box[] {
  const r = rnd(seed, 1461);
  const b: Box[] = [];
  const bag = (x: number, y: number, s: number, k: number) => {
    const c = pick(Q.bag, r(k));
    const shine: Paint = (u, v) => (u < 2 && v < 2 ? shade(c, 1.5) : (u + v) % 5 === 0 ? shade(c, 0.8) : c);
    b.push(box(x, y, 0, x + s, y + s - 1, s - 2, c, { round: true, top: shine, front: shine, opt: true }));
    b.push(box(x + (s >> 1) - 1, y + 2, s - 2, x + (s >> 1) + 1, y + 4, s, shade(c, 0.7), { opt: true }));
  };
  const carton = (x: number, y: number, w: number, d: number, h: number) => {
    const p: Paint = (u, v, ww) => (Math.abs(u - (ww >> 1)) < 1 ? Q.tape : (u + v) % 7 === 0 ? Q.cardD : Q.card);
    b.push(box(x, y, 0, x + w, y + d, h, Q.card, { top: p, front: p, left: p, right: p, opt: true }));
  };
  // papiery i drobnica pod spodem
  const litter: Paint = (u, v, w, h) => {
    const e = ((u + 0.5 - w / 2) / (w / 2)) ** 2 + ((v + 0.5 - h / 2) / (h / 2)) ** 2;
    if (e > 1 - vnoise(u, v, 4, seed + 1) * 0.5) return HOLE;
    const k = h2(u, v, seed + 2);
    return k < 0.3 ? Q.paper : k < 0.4 ? pick(Q.bottle, h2(v, u, seed + 3)) : k < 0.55 ? Q.cardD : shade(C.dirt0, 0.9);
  };
  const R = [9, 12, 14][size - 1];
  const none: Paint = () => HOLE;
  b.push(
    box(16 - R, 19 - R + 4, 0, 16 + R, 19 + R - 4, 1, Q.paper, {
      top: litter,
      front: none,
      back: none,
      left: none,
      right: none,
      flat: true,
    }),
  );
  bag(9, 14, 9, 1);
  if (size >= 2) {
    carton(17, 10, 10, 8, 7);
    bag(4, 18, 8, 2);
  }
  if (size >= 3) {
    bag(15, 18, 11, 3);
    carton(5, 7, 9, 7, 6);
    b.push(box(24, 21, 0, 26, 27, 2, pick(Q.bottle, r(4)), { round: true, opt: true }));
  }
  return b;
}

/** granice sterty: zależą tylko od wielkości */
export function smieciEnv(size: 1 | 2 | 3): Box[] {
  const R = [9, 12, 14][size - 1];
  return [box(16 - R, 4, 0, 16 + R, 19 + R - 3, 14, 0)];
}

/** sprite budowli w ustawieniu rot; te same argumenty dają te same piksele */
export function buildSprite(kind: BuildKind, rot: Rot, seed: number): Sprite {
  const [a, b] = BUILD_BASE[kind];
  const W = a * PX;
  const D = b * PX;
  switch (kind) {
    case 'warsztat':
      return renderBoxes(warsztat(seed), W, D, rot, [box(48, 0, 0, 58, 32, 21, 0)]);
    case 'kuchnia_spoleczna':
      return renderBoxes(kuchnia(seed), W, D, rot);
    case 'magazyn':
      return renderBoxes(magazyn(seed), W, D, rot, [box(2, 1, 0, 62, 62, 38, 0)]);
    case 'lozka_pietrowe':
      return renderBoxes(lozka(seed), W, D, rot);
    case 'ogrodek':
      return renderBoxes(ogrodek(seed), W, D, (rot & 1) as Rot, [box(0, 0, 0, W, D, 22, 0)]);
    default:
      return renderBoxes(zasieki(seed), W, D, (rot & 1) as Rot);
  }
}

// ---------------------------------------------------------------- zepsute meble

/**
 * Zepsuty mebel z dowolnego sprite'a: ciemniejszy i szarszy, z pęknięciami, obtłuczonymi brzegami
 * i drzazgami na podłodze wokół podstawy. Rozmiar i kotwica bez zmian.
 */
export function brokenSprite(sp: Sprite, seed: number): Sprite {
  const { w, h } = sp;
  const px = sp.px.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x]);
  const rgb = (v: number) => ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
  // pociemnienie i szarość
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    if (v >>> 24 !== 255) continue;
    const c = rgb(v);
    px[i] = rgba(mix(shade(c, 0.78), 0x6a6660, 0.18));
  }
  // pęknięcia: krótkie ścieżki ciemnych pikseli po sylwetce
  for (let k = 0; k < 3; k++) {
    let x = Math.floor(h2(k, 1, seed) * w);
    let y = Math.floor(h2(k, 2, seed) * h);
    for (let s = 0; s < 40 && at(x, y) >>> 24 !== 255; s++) {
      x = Math.floor(h2(k, s + 3, seed) * w);
      y = Math.floor(h2(k, s + 50, seed) * h);
    }
    for (let s = 0; s < 9; s++) {
      if (at(x, y) >>> 24 === 255) px[y * w + x] = rgba(0x1e1a17);
      x += h2(k, s + 100, seed) < 0.5 ? 1 : 0;
      y += h2(k, s + 200, seed) < 0.6 ? 1 : -1;
    }
  }
  // obtłuczone brzegi: piksele sylwetki przy przezroczystych znikają
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i] >>> 24 !== 255 || h2(x, y, seed + 7) > 0.12) continue;
      const edge = at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y - 1) === 0;
      if (edge) px[i] = 0;
    }
  // drzazgi i odłamki na podłodze przy podstawie
  for (let y = Math.max(0, sp.ay - 10); y < Math.min(h, sp.ay + 1); y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i] !== 0 || h2(x, y, seed + 9) > 0.035) continue;
      px[i] = rgba(pick([0x8f6643, 0x6a4a30, 0xb9b2a6, 0x9fb3b9] as const, h2(y, x, seed + 10)));
    }
  return { ...sp, px };
}

/**
 * Okopcony mebel (kuchenka na kafelku uszkodzenia piec): zepsuty i prawie czarny od sadzy, najciemniej
 * u góry, z plamkami rdzy i popiołu. Ten sam rozmiar i kotwica co cały.
 */
export function burntSprite(sp: Sprite, seed: number): Sprite {
  const b = brokenSprite(sp, seed);
  const { w, h } = b;
  const px = b.px.slice();
  const rgb = (v: number) => ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i] >>> 24 !== 255) continue;
      const r = h2(x, y, seed + 21);
      if (r < 0.035) px[i] = rgba(0x7a4a2e);
      else if (r < 0.07) px[i] = rgba(0x5a544c);
      else {
        const k = 0.5 + 0.3 * (1 - y / h) + (vnoise(x, y, 3, seed + 22) - 0.5) * 0.2;
        px[i] = rgba(mix(rgb(px[i]), 0x1f1b18, Math.min(0.85, k)));
      }
    }
  return { ...b, px };
}
