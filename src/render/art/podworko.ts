/* Podwórko za siatką rysowane kodem (grafika zastępcza, M1 „pierwsza noc za siatką”): siatka na
   słupkach, brama, ognisko, gruz, deski, złom i warta (budka, fotel, lampa naftowa). Te same
   bryły i ten sam raster co meble (bryly.ts); kolory z palety mapy, przybrudzone i zardzewiałe.
   Czyste funkcje bez DOM, sprite z kotwicą na środku dolnej krawędzi podstawy. */

import {
  type Box,
  box,
  FIRE_FRAMES,
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
} from './bryly.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, shade } from './palette.ts';
import { NB } from './wnetrze.ts';

/** wysokość siatki w pikselach ekranu (półtora metra) */
export const FENCE_H = 24;
/** linia siatki w kafelku: odcinki poziome biegną w y = FENCE_Y, pionowe w x = FENCE_X */
export const FENCE_Y = 28;
export const FENCE_X = 16;

export type FenceState = 'cala' | 'dziura' | 'lata' | 'wzm';
export type FireStyle = 'krag' | 'beczka';
export type Pile = 'gruz' | 'deski' | 'zlom' | 'czesci' | 'leki';

/** kolory podwórka; reszta z M (bryly.ts) i C (palette.ts) */
const Y = {
  wire: 0x8d9396,
  wireHi: 0xb2b8ba,
  wireD: 0x666c6f,
  tie: 0x3a3734,
  post: 0x56664f, // stara zielona farba
  postHi: 0x6f8066,
  plank: 0x7d6e5a,
  plankHi: 0x948470,
  plankD: 0x5d5143,
  nail: 0x2a2826,
  sign: 0xe2ddd0,
  signRed: 0xa8342c,
  stone: [0x8a877f, 0x77746d, 0x9b968b] as const,
  ash: 0x4d4844,
  ashD: 0x34302d,
  char: 0x2a221f,
  drum: 0x7a4e34,
  drumD: 0x5a3826,
  drumPaint: 0x3f5a4e,
  concrete: [0x8f8b84, 0x7d7a73, 0x9b968b] as const,
  sheet: 0x7c8287,
  radiator: 0xb9b3a5,
  tire: 0x27272a,
  roof: 0x8a5a3c,
  roofD: 0x6a4430,
  armFabric: [0x6b5a3a, 0x5a4a5a, 0x4f5f4a] as const,
  stuffing: 0xd6c69a,
  glass: 0x9fb3b9,
  soot: 0x3e3a36,
} as const;

/** przybrudzenie: losowa plamka rdzy albo brudu */
const grime = (c: number, u: number, v: number, s: number, rust = 0.12) => {
  const r = h2(u, v, s);
  if (r < rust) return mix(c, M.rust, 0.7);
  if (r > 0.94) return shade(c, 0.86);
  return c;
};

/** kratka siatki: druty po skosach co 4 px */
const lattice = (gx: number, v: number) => ((gx + v) & 3) === 0 || ((gx - v + 64) & 3) === 0;

// ---------------------------------------------------------------- siatka

/**
 * Kafelek siatki. mask to sąsiedzi będący siatką albo bramą (bity NB.N/E/S/W z wnetrze.ts),
 * state to cała, z dziurą albo załatana (deski i drut). post: słupek w węźle kafelka; bez podania
 * słupek stoi na narożnikach, końcach i rozgałęzieniach, a na prostym odcinku nie (wtedy co kilka
 * metrów podaje go rysowanie, np. (x + y) % 3 === 0). Wszystkie kafelki siatki mają ten sam rozmiar.
 */
function fence(mask: number, state: FenceState, postIn: boolean | undefined, seed: number): Sprite {
  const H = FENCE_H;
  const n = !!(mask & NB.N);
  const e = !!(mask & NB.E);
  const s = !!(mask & NB.S);
  const w = !!(mask & NB.W);
  const straight = (e && w && !n && !s) || (n && s && !e && !w);
  const holey = state === 'dziura' || state === 'lata';
  const post = postIn ?? (!straight && !holey);
  const horiz = e || w;
  // dziura: owal od ziemi do dwóch trzecich wysokości, przy węźle kafelka
  const hx = FENCE_X + Math.round((h2(seed, 1, 961) - 0.5) * 6);
  const inHole = (gx: number, v: number) => ((gx - hx) / 9) ** 2 + ((v - H) / (H * 0.68)) ** 2 < 1;
  const rimHole = (gx: number, v: number) => ((gx - hx) / 10.5) ** 2 + ((v - H) / (H * 0.8)) ** 2 < 1;
  const mesh =
    (x0: number): Paint =>
    (u, v) => {
      const gx = x0 + u;
      if (v === 0) return grime(Y.wireHi, gx, 0, seed + 962, 0.2); // drut napinający u góry
      if (holey && horiz && inHole(gx, v)) return HOLE;
      if (!lattice(gx, v)) return HOLE;
      if (holey && horiz && rimHole(gx, v)) return state === 'lata' && (gx + v) % 3 === 0 ? Y.tie : Y.wireD;
      return grime(Y.wire, gx, v, seed + 963);
    };
  // krawędź siatki widzianej z boku: przerywana linia oczek
  const edgeOn: Paint = (_u, v) => (v % 4 === 0 ? Y.wireHi : v % 4 === 2 ? Y.wireD : Y.wire);
  const b: Box[] = [];
  if (w) b.push(box(0, FENCE_Y, 0, FENCE_X, FENCE_Y + 1, H, Y.wire, { front: mesh(0), flat: true }));
  if (e) b.push(box(FENCE_X, FENCE_Y, 0, PX, FENCE_Y + 1, H, Y.wire, { front: mesh(FENCE_X), flat: true }));
  // odcinek pionowy widać z boku: dziury w nim nie widać, więc dziura to brakujący metr siatki
  // (przewrócona leży obok na ziemi), a łata to deski wstawione w linię
  const vHole = holey && !horiz;
  if (vHole && state === 'dziura') {
    const fallen: Paint = (u, v) => (lattice(u, v) ? grime(Y.wire, u, v, seed + 969) : HOLE);
    b.push(box(FENCE_X + 2, 3, 0, FENCE_X + 13, 27, 1, Y.wire, { top: fallen, flat: true }));
    b.push(box(FENCE_X - 1, 0, 0, FENCE_X + 1, 3, 4, Y.wireD, { flat: true })); // urwane druty
  } else if (vHole) {
    const boards: Paint = (_u, v) => (h2(v, 0, seed + 970) < 0.1 ? Y.nail : v % 8 === 7 ? Y.plankD : Y.plank);
    b.push(box(FENCE_X - 2, 1, 0, FENCE_X + 2, PX - 1, H - 6, Y.plank, { top: boards, front: plankSide(seed) }));
    for (const ty of [2, PX - 4])
      b.push(box(FENCE_X - 2, ty, H - 9, FENCE_X + 2, ty + 2, H - 7, Y.tie, { flat: true }));
  } else {
    if (n) b.push(box(FENCE_X - 1, 0, 0, FENCE_X + 1, FENCE_Y, H, Y.wire, { top: edgeOn, flat: true }));
    if (s) b.push(box(FENCE_X - 1, FENCE_Y, 0, FENCE_X + 1, PX, H, Y.wire, { top: edgeOn, flat: true }));
  }
  if (post || (!horiz && !n && !s)) {
    const pp: Paint = (u, v) => (v <= 1 ? Y.postHi : grime(Y.post, u, v, seed + 964, 0.25));
    b.push(
      box(FENCE_X - 1, FENCE_Y - 1, 0, FENCE_X + 1, FENCE_Y + 1, H + 3, Y.post, { round: true, front: pp, top: pp }),
    );
  }
  // łata: dwie deski na krzyż przed dziurą i skręcony drut
  if (state === 'lata' && horiz) {
    const cross: Paint = (u, v, bw, bh) => {
      const a = Math.abs(u - (v * (bw - 1)) / (bh - 1));
      const c = Math.abs(bw - 1 - u - (v * (bw - 1)) / (bh - 1));
      if (a < 2.2) return h2(u, v, seed + 965) < 0.08 ? Y.nail : a < 0.8 ? Y.plankHi : Y.plank;
      if (c < 2.2) return h2(u, v, seed + 966) < 0.08 ? Y.nail : c < 0.8 ? Y.plankHi : Y.plankD;
      return HOLE;
    };
    b.push(box(hx - 10, FENCE_Y + 1, 0, hx + 10, FENCE_Y + 2, Math.round(H * 0.72), Y.plank, { front: cross }));
  }
  // wzmocniona (tryb zombie): deski przybite w poprzek siatki
  if (state === 'wzm') {
    const plank: Paint = (u, v) => (h2(u, v, seed + 971) < 0.06 ? Y.nail : v === 0 ? Y.plankHi : Y.plank);
    if (horiz)
      for (const z of [Math.round(H * 0.22), Math.round(H * 0.58)])
        b.push(box(w ? 0 : FENCE_X, FENCE_Y + 1, z, e ? PX : FENCE_X, FENCE_Y + 2, z + 4, Y.plank, { front: plank }));
    else {
      const z = Math.round(H * 0.35);
      b.push(box(FENCE_X - 2, 1, z, FENCE_X + 2, PX - 1, z + 4, Y.plank, { top: plank, front: plankSide(seed) }));
    }
  }
  // dziura: trochę zerwanej siatki leży na ziemi
  if (state === 'dziura' && horiz)
    b.push(
      box(hx - 5, FENCE_Y + 1, 0, hx + 4, FENCE_Y + 3, 1, Y.wireD, {
        top: (u, v) => (lattice(u, v) ? Y.wire : HOLE),
        flat: true,
      }),
    );
  const env = [box(0, 0, 0, PX, PX, H + 3, 0)];
  return renderBoxes(b, PX, PX, 0, env);
}

const plankSide =
  (seed: number): Paint =>
  (u, v) =>
    h2(u, v, seed + 968) < 0.05 ? Y.nail : v === 0 ? Y.plankHi : Y.plank;

// ---------------------------------------------------------------- brama

/**
 * Brama dwuskrzydłowa 2×1 m (rot 0 i 2) albo 1×2 (rot 1 i 3), w linii siatki. rot mówi, w którą
 * stronę otwierają się skrzydła: 0 na północ, 1 na wschód, 2 na południe, 3 na zachód (do środka
 * podwórka). Zamknięta ma łańcuch z kłódką i tabliczkę. Otwarta i zamknięta mają ten sam rozmiar.
 */
function gate(rot: Rot, open: boolean, seed: number): Sprite {
  const H = FENCE_H;
  const horiz = rot === 0 || rot === 2;
  const fw = horiz ? 2 * PX : PX;
  const fh = horiz ? PX : 2 * PX;
  const r = rnd(seed, 971);
  const paint = r(1) < 0.5 ? Y.post : 0x4a5a6e;
  const frame = (bw: number, bh: number, u: number, v: number) =>
    u <= 1 || u >= bw - 2 || v <= 1 || v >= bh - 2 || Math.abs(u - (v * (bw - 1)) / (bh - 1)) < 1.2;
  const leaf =
    (x0: number): Paint =>
    (u, v, bw, bh) => {
      if (frame(bw, bh, u, v)) return grime(paint, u, v, seed + 972, 0.22);
      return lattice(x0 + u, v) ? grime(Y.wire, u, v, seed + 973) : HOLE;
    };
  const edgeOn: Paint = (_u, v) => (v % 6 === 0 ? shade(paint, 1.2) : paint);
  const postP: Paint = (u, v) => (v <= 1 ? shade(paint, 1.25) : grime(paint, u, v, seed + 974, 0.25));
  const b: Box[] = [];
  const env: Box[] = [];
  if (horiz) {
    const y0 = FENCE_Y;
    b.push(box(0, y0 - 2, 0, 4, y0 + 2, H + 6, paint, { front: postP, top: postP }));
    b.push(box(fw - 4, y0 - 2, 0, fw, y0 + 2, H + 6, paint, { front: postP, top: postP }));
    const dir = rot === 0 ? -1 : 1;
    const span = PX - 4;
    const openBoxes = [
      box(4, dir < 0 ? y0 - span : y0, 1, 6, dir < 0 ? y0 : y0 + span, H + 1, paint, { top: edgeOn, flat: true }),
      box(fw - 6, dir < 0 ? y0 - span : y0, 1, fw - 4, dir < 0 ? y0 : y0 + span, H + 1, paint, {
        top: edgeOn,
        flat: true,
      }),
    ];
    const closedBoxes = [
      box(4, y0, 1, PX, y0 + 1, H + 1, paint, { front: leaf(4) }),
      box(PX, y0, 1, fw - 4, y0 + 1, H + 1, paint, { front: leaf(PX) }),
    ];
    env.push(...openBoxes, ...closedBoxes);
    if (open) b.push(...openBoxes);
    else {
      b.push(...closedBoxes);
      // łańcuch z kłódką na styku skrzydeł i tabliczka „uwaga, zły pies”
      b.push(
        box(PX - 2, y0 + 1, 9, PX + 2, y0 + 2, 15, M.ironD, {
          front: (u, v) => (v >= 3 && u >= 1 && u <= 2 ? M.brass : (u + v) % 2 ? M.ironHi : HOLE),
        }),
      );
      b.push(
        box(10, y0 + 1, 11, 20, y0 + 2, 17, Y.sign, {
          front: (u, v, bw, bh) =>
            u === 0 || v === 0 || u === bw - 1 || v === bh - 1
              ? Y.signRed
              : v === 2 && u > 1 && u < bw - 2 && u % 2
                ? M.ironDark
                : Y.sign,
        }),
      );
    }
  } else {
    const x0 = FENCE_X;
    b.push(box(x0 - 2, 0, 0, x0 + 2, 4, H + 6, paint, { front: postP, top: postP }));
    b.push(box(x0 - 2, fh - 4, 0, x0 + 2, fh, H + 6, paint, { front: postP, top: postP }));
    const dir = rot === 1 ? 1 : -1;
    const span = PX - 4;
    const ox0 = dir > 0 ? x0 + 1 : x0 - 1 - span;
    const openBoxes = [
      box(ox0, 4, 1, ox0 + span, 5, H + 1, paint, { front: leaf(ox0) }),
      box(ox0, fh - 5, 1, ox0 + span, fh - 4, H + 1, paint, { front: leaf(ox0) }),
    ];
    const closedBoxes = [
      box(x0 - 1, 4, 1, x0 + 1, PX, H + 1, paint, { top: edgeOn }),
      box(x0 - 1, PX, 1, x0 + 1, fh - 4, H + 1, paint, { top: edgeOn }),
    ];
    env.push(...openBoxes, ...closedBoxes);
    if (open) b.push(...openBoxes);
    else {
      b.push(...closedBoxes);
      b.push(
        box(x0 - 1, PX - 2, 9, x0 + 2, PX + 2, 15, M.ironD, { top: (u, v) => ((u + v) % 2 ? M.brass : M.ironHi) }),
      );
    }
  }
  return renderBoxes(b, fw, fh, 0, env);
}

// ---------------------------------------------------------------- ognisko

/** płomień na pionowej płaszczyźnie: sylwetka zależy od klatki, środek najjaśniejszy */
const flame =
  (f: number, seed: number): Paint =>
  (u, v, bw, bh) => {
    const fromBottom = bh - 1 - v;
    const t = fromBottom / bh;
    const sway = Math.sin(t * 5 + f * 2.1 + seed) * 1.6 * t;
    const half = (bw / 2) * (1 - t) ** 0.8 * (0.85 + 0.15 * Math.sin(f * 3.3 + v * 0.9));
    const d = Math.abs(u + 0.5 - bw / 2 - sway);
    if (d > half) {
      // iskry nad płomieniem
      if (t > 0.55 && h2(u, v + f * 31, 4243) < 0.025) return M.fire0 | LIT;
      return HOLE;
    }
    const k = d / (half || 1);
    if (k < 0.35 && t < 0.6) return M.fire0 | LIT;
    if (k < 0.7) return M.fire1 | LIT;
    return M.fire2 | LIT;
  };

/**
 * Ognisko 1×1: w kręgu kamieni albo w beczce. fire 0..FIRE_FRAMES-1 to klatka ognia, bez fire
 * zimne (popiół, zwęglone polana). Zimne i palące się mają ten sam rozmiar.
 */
function campfire(style: FireStyle, fire: number, seed: number): Sprite {
  const burning = fire >= 0;
  const f = burning ? fire % FIRE_FRAMES : 0;
  const b: Box[] = [];
  const env: Box[] = [];
  if (style === 'krag') {
    // kamienie w kręgu
    const k = 9;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + 0.3;
      const sx = Math.round(16 + Math.cos(a) * 10);
      const sy = Math.round(19 + Math.sin(a) * 8);
      const sc = pick(Y.stone, h2(i, 2, seed + 981));
      const stone: Paint = (u, v, bw, bh) =>
        (u === 0 || u === bw - 1) && (v === 0 || v === bh - 1) ? HOLE : u === 0 || v === 0 ? shade(sc, 1.12) : sc;
      b.push(
        box(sx - 2, sy - 2, 0, sx + 2, sy + 1, 3, sc, { top: stone, front: (u, v) => grime(sc, u, v, seed + i, 0.05) }),
      );
    }
    const ash: Paint = (u, v) => {
      const r = h2(u, v, seed + 982);
      if (burning && r < 0.18) return (r < 0.06 ? M.emberHi : M.ember) | LIT;
      return r < 0.3 ? Y.ashD : Y.ash;
    };
    b.push(box(10, 13, 0, 22, 24, 1, Y.ash, { top: ash, flat: true }));
    const log: Paint = (u, v) =>
      burning && h2(u, v, seed + 983 + f) < 0.2 ? M.ember | LIT : (u + v) % 4 === 0 ? shade(Y.char, 1.4) : Y.char;
    b.push(box(10, 17, 1, 22, 20, 3, Y.char, { top: log, front: log }));
    b.push(box(14, 14, 1, 17, 24, 4, Y.char, { top: log, front: log }));
    const flameBox = box(10, 19, 2, 22, 20, 21, M.fire1, { front: flame(f, seed), top: () => HOLE, flat: true });
    env.push(flameBox);
    if (burning) b.push(flameBox);
  } else {
    // beczka po smarze z dziurami wybitymi w boku
    const holes = (u: number, v: number) => v >= 8 && v <= 11 && (u + (v >> 1)) % 4 === 1;
    const side: Paint = (u, v) => {
      if (holes(u, v)) return burning ? (v === 9 ? M.fire0 : M.fire1) | LIT : M.ironDark;
      if (v === 3 || v === 13) return Y.drumD; // obręcze
      if (h2(u >> 1, v >> 2, seed + 984) < 0.3) return Y.drumPaint; // resztki farby
      return grime(Y.drum, u, v, seed + 985, 0.08);
    };
    const top: Paint = (u, v, bw, bh) => {
      if (u <= 1 || v <= 1 || u >= bw - 2 || v >= bh - 2) return u <= 1 || v <= 1 ? shade(Y.drum, 1.2) : Y.drumD;
      const r = h2(u, v, seed + 986 + f);
      if (burning) return (r < 0.35 ? M.fire0 : r < 0.75 ? M.fire1 : M.ember) | LIT;
      return r < 0.3 ? Y.ashD : Y.ash;
    };
    b.push(box(8, 10, 0, 24, 26, 16, Y.drum, { round: true, top, front: side, back: side, left: side, right: side }));
    const flameBox = box(10, 18, 15, 22, 19, 31, M.fire1, { front: flame(f, seed + 7), top: () => HOLE, flat: true });
    env.push(flameBox);
    if (burning) b.push(flameBox);
  }
  return renderBoxes(b, PX, PX, 0, env);
}

// ---------------------------------------------------------------- materiały

/** gruz: kupa kawałków betonu i cegły, wyżej w środku, z prętami zbrojeniowymi i pyłem dookoła */
function gruz(size: 1 | 2 | 3, seed: number): Box[] {
  const r = rnd(seed, 991);
  const b: Box[] = [];
  const R = [8, 11, 14][size - 1];
  const cy0 = 19;
  // pył i drobny gruz pod kupą: nieregularna plama
  const dust: Paint = (u, v, bw, bh) => {
    const e = ((u + 0.5 - bw / 2) / (bw / 2)) ** 2 + ((v + 0.5 - bh / 2) / (bh / 2)) ** 2;
    if (e > 1 - vnoise(u, v, 5, seed + 992) * 0.45) return HOLE;
    const k = h2(u, v, seed + 993);
    return k < 0.12 ? pick(Y.concrete, h2(v, u, seed + 994)) : k < 0.2 ? C.brick1 : mix(C.dirt0, 0x8f8b84, 0.45);
  };
  b.push(box(16 - R - 2, cy0 - R + 2, 0, 16 + R + 2, cy0 + R - 2, 1, C.dirt0, { top: dust, flat: true }));
  const count = [6, 10, 15][size - 1];
  for (let i = 0; i < count; i++) {
    // od tyłu do przodu, wyższe bliżej środka
    const a = r(10 + i) * Math.PI * 2;
    const d = Math.sqrt(r(30 + i)) * (R - 4);
    const cw = 4 + Math.floor(r(50 + i) * 5);
    const cd = 3 + Math.floor(r(70 + i) * 4);
    const ch = 2 + Math.floor((1 - d / R) * (2 + size * 3) * (0.5 + r(90 + i) * 0.5));
    const cx = Math.round(16 + Math.cos(a) * d - cw / 2);
    const cy = Math.round(cy0 + Math.sin(a) * d * 0.75 - cd / 2);
    const brick = r(110 + i) < 0.3;
    const c = brick ? (r(130 + i) < 0.5 ? C.brick0 : C.brick1) : pick(Y.concrete, r(150 + i));
    const face: Paint = (u, v) => {
      if (brick) return v % 3 === 2 || (u + (v > 2 ? 2 : 0)) % 5 === 0 ? 0xb8b0a0 : c;
      return h2(u, v, seed + i) < 0.08 ? shade(c, 0.82) : c;
    };
    const top: Paint = (u, v, bw, bh) => {
      if ((u === 0 || u === bw - 1) && (v === 0 || v === bh - 1)) return HOLE; // obite rogi
      return u === 0 || v === 0 ? shade(c, 1.12) : face(u, v, bw, bh);
    };
    b.push(box(cx, cy, 0, cx + cw, cy + cd, ch, c, { top, front: face, opt: true }));
  }
  // pręty zbrojeniowe sterczą z kupy
  for (let i = 0; i < size + 1; i++) {
    const x = Math.round(16 + (r(170 + i) - 0.5) * R);
    const y = Math.round(cy0 + (r(190 + i) - 0.5) * R * 0.5);
    b.push(box(x, y, 0, x + 1, y + 1, 7 + size * 3, M.rust, { opt: true, flat: true }));
  }
  return b;
}

/** stos desek z odzysku: warstwy z przekładkami, stare deski z resztkami farby i gwoździami */
function deski(size: 1 | 2 | 3, seed: number): Box[] {
  const r = rnd(seed, 993);
  const b: Box[] = [];
  const layers = size;
  const per = [3, 4, 4][size - 1];
  let z = 0;
  for (let l = 0; l < layers; l++) {
    if (l > 0) {
      // przekładki w poprzek
      for (const x of [6, 24]) b.push(box(x, 8, z, x + 2, 28, z + 1, Y.plankD, { opt: true }));
      z += 1;
    }
    for (let i = 0; i < per; i++) {
      const y = 9 + i * 5;
      const x0 = 2 + Math.floor(r(l * 10 + i) * 3);
      const x1 = 30 - Math.floor(r(l * 10 + i + 50) * 3);
      const painted =
        r(l * 10 + i + 100) < 0.3 ? pick([0x5f7a8a, 0x7a8a5a, 0xc9c2b0] as const, r(l * 10 + i + 150)) : -1;
      const top: Paint = (u, v) => {
        if (h2(u, v, seed + 994 + l) < 0.03) return Y.nail;
        if (painted >= 0 && h2(u >> 1, v, seed + 995 + i) < 0.55) return painted;
        return v === 0 ? Y.plankHi : (u + l * 3) % 9 === 0 ? Y.plankD : Y.plank;
      };
      b.push(box(x0, y, z, x1, y + 4, z + 2, Y.plank, { top, front: plankSide(seed + l), opt: true }));
    }
    z += 2;
  }
  return b;
}

/** złom: blacha falista, rury, żeliwny kaloryfer, opona */
function zlom(size: 1 | 2 | 3, seed: number): Box[] {
  const b: Box[] = [];
  const rusty =
    (c: number, s: number): Paint =>
    (u, v) =>
      grime(c, u, v, seed + s, 0.3);
  // blacha falista
  b.push(
    box(4, 12, 0, 24, 26, 1, Y.sheet, {
      top: (u, v) => grime(u % 3 === 0 ? shade(Y.sheet, 0.8) : Y.sheet, u, v, seed + 1001, 0.35),
      opt: true,
    }),
  );
  // rury
  b.push(box(3, 22, 1, 27, 24, 3, M.pipe, { round: true, front: rusty(M.pipe, 1002), opt: true }));
  b.push(box(6, 17, 1, 29, 19, 3, M.steelD, { round: true, front: rusty(M.steelD, 1003), opt: true }));
  if (size >= 2) {
    // żeliwny kaloryfer z łuszczącą się farbą
    const ribs: Paint = (u, v) =>
      u % 3 === 2 ? shade(Y.radiator, 0.7) : h2(u, v, seed + 1004) < 0.25 ? M.rust : Y.radiator;
    b.push(
      box(8, 8, 1, 24, 13, 13, Y.radiator, {
        front: ribs,
        top: (u, _v) => (u % 3 === 2 ? shade(Y.radiator, 0.75) : Y.radiator),
        opt: true,
      }),
    );
  }
  if (size === 3) {
    // opona leżąca na płask
    const ring: Paint = (u, v, bw, bh) => {
      const e = ((u + 0.5 - bw / 2) / (bw / 2)) ** 2 + ((v + 0.5 - bh / 2) / (bh / 2)) ** 2;
      if (e > 1) return HOLE;
      if (e < 0.3) return HOLE;
      return e < 0.45 ? shade(Y.tire, 1.6) : Y.tire;
    };
    b.push(
      box(17, 13, 3, 28, 24, 6, Y.tire, { top: ring, front: (u) => (u % 2 ? Y.tire : shade(Y.tire, 1.3)), opt: true }),
    );
    b.push(box(2, 5, 0, 16, 12, 2, Y.sheet, { top: rusty(Y.sheet, 1005), opt: true }));
  }
  return b;
}

/** Części ze szczelnych podzespołów (to przetrwało bakterię): alternator z żeberkami pod lakierem, przy większej
    stercie akumulator z klemami i rozrusznik. */
function czesci(size: 1 | 2 | 3, seed: number): Box[] {
  const b: Box[] = [];
  const lacquer = 0x3d4a3f; // ciemnozielony lakier na uzwojeniach
  const ribs: Paint = (u, v) =>
    u % 2 === 0 ? shade(Y.sheet, 0.75) : h2(u, v, seed + 1101) < 0.15 ? M.rust : shade(Y.sheet, 1.1);
  // alternator: walec na boku z kołem pasowym
  b.push(box(5, 16, 0, 17, 26, 9, Y.sheet, { round: true, front: ribs, top: ribs, opt: true }));
  b.push(box(17, 18, 2, 20, 24, 7, M.steelD, { round: true, opt: true }));
  b.push(box(7, 18, 9, 15, 24, 10, lacquer, { opt: true }));
  if (size >= 2) {
    // akumulator: czarna skrzynka, czerwona i czarna klema
    const side: Paint = (u, v) =>
      v === 1 ? shade(M.ironDark, 1.6) : h2(u, v, seed + 1102) < 0.05 ? M.ironHi : M.ironDark;
    b.push(box(18, 6, 0, 29, 14, 9, M.ironDark, { front: side, left: side, right: side, opt: true }));
    b.push(box(19, 8, 9, 21, 10, 11, 0xa8342c, { opt: true }));
    b.push(box(26, 8, 9, 28, 10, 11, M.ironD, { opt: true }));
  }
  if (size === 3) {
    // rozrusznik: krótszy walec z zębatką
    b.push(
      box(4, 5, 0, 13, 12, 7, lacquer, {
        round: true,
        front: (u) => (u % 3 ? lacquer : shade(lacquer, 0.7)),
        opt: true,
      }),
    );
    b.push(box(13, 6, 1, 16, 11, 6, M.brass, { round: true, opt: true }));
  }
  return b;
}

/** Leki: czerwona apteczka samochodowa, przy większej stercie pudełka z krzyżem i karton z apteki. */
function leki(size: 1 | 2 | 3, seed: number): Box[] {
  const b: Box[] = [];
  const red = 0xb2352b;
  const card = 0xd8d0bd;
  const cross =
    (base: number, mark: number): Paint =>
    (u, v, bw, bh) => {
      const cu = Math.abs(u + 0.5 - bw / 2);
      const cv = Math.abs(v + 0.5 - bh / 2);
      return (cu < 1 && cv < bh / 3) || (cv < 1 && cu < bw / 3) ? mark : base;
    };
  // apteczka: płaska walizeczka z białym krzyżem na wieku
  b.push(
    box(6, 15, 0, 22, 26, 5, red, {
      top: cross(red, M.white),
      front: (u) => (u % 7 === 3 ? shade(red, 0.7) : red),
      opt: true,
    }),
  );
  if (size >= 2) {
    // dwa pudełka leków
    b.push(box(22, 18, 0, 28, 24, 4, card, { top: cross(card, red), opt: true }));
    b.push(
      box(23, 11, 0, 29, 17, 3, M.white, {
        top: (u, v) => (h2(u, v, seed + 1111) < 0.1 ? 0x6f9fb0 : M.white),
        opt: true,
      }),
    );
  }
  if (size === 3) {
    // karton z apteki, przetarty na rogach
    const carton: Paint = (u, v, bw, bh) =>
      (u === 0 || v === 0 || u === bw - 1 || v === bh - 1) && h2(u, v, seed + 1112) < 0.5
        ? shade(0xa98a5e, 0.8)
        : 0xa98a5e;
    b.push(
      box(4, 4, 0, 17, 14, 9, 0xa98a5e, {
        top: cross(0xa98a5e, 0x3f7a4a),
        front: carton,
        left: carton,
        right: carton,
        opt: true,
      }),
    );
  }
  return b;
}

/** granice stosu: zależą tylko od rodzaju i wielkości, nie od ziarna */
function pileEnv(kind: Pile, size: 1 | 2 | 3): Box[] {
  if (kind === 'gruz') {
    const R = [8, 11, 14][size - 1];
    return [box(16 - R - 3, 19 - R, 0, 16 + R + 3, 19 + R, 8 + size * 3, 0)];
  }
  if (kind === 'deski') return [box(2, 8, 0, 30, 29, size * 3, 0)];
  if (kind === 'czesci' || kind === 'leki') return [box(3, 4, 0, 30, 27, 12, 0)];
  return [box(2, 5, 0, 30, 26, 14, 0)];
}

const PILES: Record<Pile, (size: 1 | 2 | 3, seed: number) => Box[]> = { gruz, deski, zlom, czesci, leki };

function pile(kind: Pile, size: 1 | 2 | 3, seed: number): Sprite {
  const b = PILES[kind](size, seed);
  return renderBoxes(b, PX, PX, 0, pileEnv(kind, size));
}

// ---------------------------------------------------------------- warta

/**
 * Budka wartownika 1×1: plecami do ściany rot (jak meble), otwarta z przodu z ladą do pasa, daszek
 * z blachy falistej tylko nad tylną połową (żeby było widać wartownika), latarnia na daszku.
 */
function budka(rot: Rot, lit: boolean, seed: number): Sprite {
  const r = rnd(seed, 1011);
  const boards: Paint = (u, v) => {
    if (h2(u, v, seed + 1012) < 0.03) return Y.nail;
    const k = Math.floor(u / 4);
    const c = h2(k, 0, seed + 1013) < 0.3 ? Y.plankD : h2(k, 1, seed + 1014) < 0.4 ? Y.plankHi : Y.plank;
    return u % 4 === 3 ? shade(c, 0.6) : c;
  };
  const counter: Paint = (u, v) =>
    v % 4 === 3 ? shade(Y.plank, 0.6) : h2(u, v, seed + 1015) < 0.04 ? Y.nail : Y.plank;
  const roof: Paint = (u, v) => grime(u % 3 === 0 ? Y.roofD : Y.roof, u, v, seed + 1016, 0.15);
  const roofEdge: Paint = (u) => (u % 3 === 0 ? Y.roofD : shade(Y.roof, 1.1));
  const lamp: Paint = (u, v, bw) => {
    if (v === 0) return M.ironD;
    if (u === 0 || u === bw - 1) return M.ironD;
    return lit ? (v <= 2 ? M.fire0 : M.fire1) | LIT : Y.glass;
  };
  const b: Box[] = [
    box(3, 4, 0, 29, 30, 1, Y.plankD),
    box(3, 3, 1, 29, 6, 34, Y.plank, { front: boards, back: boards }),
    box(3, 6, 1, 6, 30, 34, Y.plank, { front: boards, left: boards, right: boards }),
    box(26, 6, 1, 29, 30, 34, Y.plank, { front: boards, left: boards, right: boards }),
    box(6, 27, 1, 26, 30, 13, Y.plank, { front: counter, back: counter, top: counter }),
    box(1, 1, 34, 31, 17, 36, Y.roof, { top: roof, front: roofEdge, back: roofEdge, left: roofEdge, right: roofEdge }),
    box(22, 15, 27, 26, 18, 33, Y.glass, {
      front: lamp,
      back: lamp,
      left: lamp,
      right: lamp,
      top: () => M.ironD,
      flat: true,
    }),
  ];
  if (r(1) < 0.6) b.push(box(8, 7, 1, 13, 11, 6, M.pipe, { opt: true })); // wiadro
  return renderBoxes(b, PX, PX, rot);
}

/** fotel z lat sześćdziesiątych wyciągnięty na wartę: drewniane nogi i poręcze, przetarte obicie */
function fotel(rot: Rot, seed: number): Sprite {
  const r = rnd(seed, 1021);
  const fab = pick(Y.armFabric, r(1));
  const wood = 0x8a6040;
  const worn =
    (c: number): Paint =>
    (u, v) => {
      const t = vnoise(u, v, 4, seed + 1022);
      if (t > 0.8) return Y.stuffing; // przetarte obicie, wyłazi wypełnienie
      if (t > 0.74) return shade(c, 0.7);
      return (u + v) % 5 === 0 ? shade(c, 0.9) : c;
    };
  const seatC = shade(fab, 1.12);
  // poduszka siedziska z obszyciem
  const cushion: Paint = (u, v, bw, bh) =>
    u === 0 || v === 0 || u === bw - 1 || v === bh - 1 ? shade(seatC, 0.78) : worn(seatC)(u, v, bw, bh);
  const b: Box[] = [];
  // nogi rozstawione na boki
  for (const [x, y] of [
    [6, 11],
    [24, 11],
    [6, 23],
    [24, 23],
  ])
    b.push(box(x, y, 0, x + 2, y + 2, 4, shade(wood, 0.8)));
  b.push(
    box(8, 11, 4, 24, 25, 8, seatC, {
      top: cushion,
      front: worn(seatC),
      back: worn(seatC),
      left: worn(seatC),
      right: worn(seatC),
    }),
  );
  // oparcie: ciemniejsza skorupa, wyższa niż siedzisko
  const shell = shade(fab, 0.85);
  b.push(
    box(7, 7, 6, 25, 11, 23, shell, {
      front: worn(shell),
      back: worn(shell),
      top: worn(shell),
      left: worn(shell),
      right: worn(shell),
    }),
  );
  const arm: Paint = (_u, v) => (v === 0 ? shade(wood, 1.2) : wood);
  b.push(box(5, 9, 8, 8, 25, 12, wood, { top: arm, front: arm, left: arm, right: arm }));
  b.push(box(24, 9, 8, 27, 25, 12, wood, { top: arm, front: arm, left: arm, right: arm }));
  return renderBoxes(b, PX, PX, rot);
}

/** lampa naftowa na skrzynce: zapalona świeci przez szkło, zgaszona ma zakopcony klosz */
function lampa(lit: boolean, seed: number): Sprite {
  const crate: Paint = (u, v) => (v % 3 === 2 ? shade(Y.plank, 0.6) : h2(u, v, seed + 1031) < 0.04 ? Y.nail : Y.plank);
  const glass: Paint = (u, v, bw, bh) => {
    if (lit) {
      const mid = Math.abs(u + 0.5 - bw / 2) < 1.2;
      return (mid && v > 2 && v < bh - 1 ? 0xfff1c0 : v > 1 ? M.fire0 : M.fire1) | LIT;
    }
    return v <= 2 ? Y.soot : (u + v) % 5 === 0 ? 0xc8d6da : Y.glass;
  };
  const b: Box[] = [
    box(8, 12, 0, 24, 26, 9, Y.plank, { front: crate, top: crate, back: crate, left: crate, right: crate }),
    box(13, 16, 9, 19, 22, 11, M.brass),
    box(13, 16, 11, 19, 22, 14, shade(M.brass, 0.85), {
      front: (u, v) => (u === 4 && v === 1 ? M.ironDark : shade(M.brass, 0.85)),
    }),
    box(14, 17, 14, 18, 21, 22, Y.glass, { front: glass, back: glass, left: glass, right: glass, top: () => M.ironD }),
    box(15, 18, 22, 17, 20, 25, M.ironD, { flat: true }),
  ];
  return renderBoxes(b, PX, PX, 0);
}

// ---------------------------------------------------------------- wejście (przez thingSprite)

export const fenceSprite = (mask: number, state: FenceState = 'cala', post?: boolean, seed = 0) =>
  fence(mask, state, post, seed | 0);
export const gateSprite = (rot: Rot, open = false, seed = 0) => gate(rot, open, seed | 0);
export const campfireSprite = (style: FireStyle = 'krag', fire = -1, seed = 0) => campfire(style, fire, seed | 0);
export const pileSprite = (kind: Pile, size: 1 | 2 | 3, seed = 0) => pile(kind, size, seed | 0);
export const boothSprite = (rot: Rot, lit = false, seed = 0) => budka(rot, lit, seed | 0);
export const armchairSprite = (rot: Rot, seed = 0) => fotel(rot, seed | 0);
export const lampSprite = (lit = false, seed = 0) => lampa(lit, seed | 0);
