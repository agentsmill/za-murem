/* Wraki samochodów (M1, grafika zastępcza): maluch i polonez po latach stania na parkingu albo przy
   jezdni. Wyblakły lakier w kolorze z ziarna, rdza od progów, nadkoli i krawędzi, czasem drzwi
   z innego auta albo brak pokrywy silnika, wybite i popękane szyby, bez kół, na cegłach, chwasty
   przy progu. Te same bryły i raster co meble (bryly.ts): cztery ustawienia z jednego modelu,
   wysokość w skali ZPX (16 px na metr), lekki cień jak u innych brył.
   Ustawienie rot: przodem na wschód (0), na południe (1), na zachód (2), na północ (3). Podstawa przy
   rot 0 i 2 to maluch 3×2 i polonez 4×2 kafelki, przy 1 i 3 odwrotnie. Rozmiar i kotwica zależą
   tylko od modelu i ustawienia, ziarno zmienia lakier, rdzę, szyby i drobiazgi. Czyste funkcje bez DOM. */

import { type Box, box, HOLE, type Paint, PX, pick, type Rot, renderBoxes, rnd, type Sprite } from './bryly.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, shade } from './palette.ts';

export type WreckModel = 'maluch' | 'polonez';
export const WRECK_MODELS: readonly WreckModel[] = ['maluch', 'polonez'];

/** podstawa w kafelkach przy rot 0 i 2: długość (wzdłuż x) × szerokość */
export const WRECK_BASE: Record<WreckModel, readonly [number, number]> = { maluch: [3, 2], polonez: [4, 2] };

/** bryła auta w pikselach modelu: x od tyłu do przodu, y od lewego boku do prawego, z w górę */
interface Shape {
  /** dolna część nadwozia: x0, y0, x1, y1 */
  body: readonly [number, number, number, number];
  /** próg nad ziemią (wysokość cegieł) i linia okien */
  sill: number;
  belt: number;
  /** kabina z szybami: x0, y0, x1, y1 i jej wierzch */
  cabin: readonly [number, number, number, number];
  glass: number;
  /** dach: od x do x (w poprzek o 1 px węższy od kabiny) i jego wierzch */
  roof: readonly [number, number];
  top: number;
  /** osie (x) i nadkola: promień poziomy i wysokość łuku */
  axles: readonly [number, number];
  arch: readonly [number, number];
  /** szwy drzwi i klamki: odległość od tyłu nadwozia */
  seams: readonly number[];
  handles: readonly number[];
  /** przednie drzwi (od, do) od tyłu nadwozia: te bywają z innego auta */
  door: readonly [number, number];
  /** okna boczne (od, do) od tyłu kabiny */
  windows: readonly (readonly [number, number])[];
  /** szczelina przedniej pokrywy i tylnej klapy (x modelu) */
  hood: number;
  deck: number;
  /** promień zaokrąglenia rogów nadwozia z góry */
  round: number;
  paints: readonly number[];
}

/** dach węższy od kabiny o tyle pikseli z każdej strony: z góry widać pierścień szyb */
const INSET = 3;

const SHAPES: Record<WreckModel, Shape> = {
  maluch: {
    body: [1, 10, 95, 54],
    sill: 4,
    belt: 12,
    cabin: [30, 12, 72, 52],
    glass: 19,
    roof: [36, 67],
    top: 21,
    axles: [18, 77],
    arch: [8, 6],
    seams: [43, 73],
    handles: [46],
    door: [43, 73],
    windows: [
      [2, 12],
      [14, 39],
    ],
    hood: 75,
    deck: 27,
    round: 7,
    // beż, koral, żółty, mięta, niebieski, biały, pomarańcz, oliwka
    paints: [0xd8c39a, 0xb8392e, 0xdcb235, 0x8fb49c, 0x3f6fa0, 0xe4e0d4, 0xd47a2c, 0x6f8a4a],
  },
  polonez: {
    body: [1, 6, 127, 58],
    sill: 4,
    belt: 13,
    cabin: [38, 8, 95, 56],
    glass: 20,
    roof: [47, 88],
    top: 22,
    axles: [23, 103],
    arch: [9, 6],
    seams: [45, 70, 96],
    handles: [66, 92],
    door: [70, 96],
    windows: [
      [3, 9],
      [11, 30],
      [33, 54],
    ],
    hood: 98,
    deck: 37,
    round: 3,
    // wiśnia, butelkowa zieleń, granat, srebrny, brąz, krem, niebieski, grafit
    paints: [0x9a2a26, 0x2f5a3c, 0x2c3e5c, 0xb9b6ae, 0x6b4a33, 0xd8cfb4, 0x4a6f8a, 0x6f7479],
  },
};

const K = {
  dark: 0x1b1917, // wnętrze, dziury
  under: 0x191816, // ziemia pod autem w cieniu
  seat: 0x5a3a2a,
  dash: 0x2a2826,
  shard: 0x9fb3b9,
  glass: 0x56666c,
  glare: 0x8a9aa0,
  crack: 0x9aa8ac,
  rubber: 0x2a2826,
  chrome: 0xa9aeb1,
  black: 0x2c2b2a,
  lamp: 0xd8d4c0,
  red: 0x9a2a22,
  amber: 0xc8701e,
  plate: 0xd8d4c4,
  rim: 0x6a6660,
  block: 0x4a4844,
  dropping: 0xe8e6de,
  leaf: [0x8a6a2a, 0x6a5a2a, 0x9a7a3a],
  weed: [0x4a6a32, 0x6a8a3a, 0x9a8a50],
  rust: [0x7a4a2e, 0x8f5a30, 0x5e3620],
} as const;

/** wyblakły lakier: boki szarzeją, wierzch spalony słońcem jeszcze bardziej */
const FADE_SIDE = 0xc6c0b2;
const FADE_TOP = 0xdcd5c6;

/** wrak w ustawieniu rot; te same argumenty dają te same piksele */
/**
 * stage: 0 cały wrak, 1 przeszukany (zdjęte obie pokrywy, widać komorę silnika i bagażnik), 2 szkielet po rozbiórce
 * (rdzawa rama: bez szyb, drzwi, zderzaków i bloku silnika). Rozmiar i kotwica nie zależą od stanu.
 */
export function wreckSprite(model: WreckModel, rot: Rot, seed: number, stage: 0 | 1 | 2 = 0): Sprite {
  const s = SHAPES[model];
  const r = rnd(seed, 1201);
  const L = WRECK_BASE[model][0] * PX;
  const D = WRECK_BASE[model][1] * PX;
  const base = pick(s.paints, r(1));
  const fade = 0.15 + r(2) * 0.2;
  const bare = stage === 2;
  // szkielet: z lakieru została rdza
  const paint = bare ? mix(K.rust[0], FADE_SIDE, 0.15) : mix(base, FADE_SIDE, fade);
  const sun = bare ? mix(K.rust[1], FADE_TOP, 0.2) : mix(base, FADE_TOP, fade + 0.12);
  const decay = bare ? 1.1 : 0.35 + r(3) * 0.5;
  const odd = !bare && r(4) < 0.3 ? mix(pick(s.paints, r(5)), FADE_SIDE, fade * 0.5) : -1; // drzwi z innego auta
  const lidGone = stage > 0 || r(6) < 0.25; // brak pokrywy silnika (w maluchu z tyłu, w polonezie z przodu)
  const rack = model === 'maluch' && r(7) < 0.35; // bagażnik dachowy
  const [bx0, by0, bx1, by1] = s.body;
  const [cx0, cy0, cx1, cy1] = s.cabin;
  const [rx, ry] = s.arch;
  const axl = s.axles.map((a) => a - bx0);
  const R = s.round;

  const rust = (u: number, v: number, k: number) => pick(K.rust, h2(u, v, seed + k));
  const chalk = (c: number, u: number, v: number, k: number) => {
    const n = h2(u, v, seed + k);
    return n > 0.97 ? shade(c, 1.06) : n < 0.03 ? shade(c, 0.93) : c;
  };
  /** blacha z rdzą od dołu (e: bliskość nadkola, mniejsze to bliżej) */
  const metal = (c: number, u: number, v: number, h: number, k: number, e = 9) => {
    const b = v / (h - 1);
    const n = vnoise(u, v * 2, 4, seed + k) * 0.75 + h2(u, v, seed + k + 1) * 0.25;
    const t = decay * (0.1 + 0.55 * b * b) + (e < 1.7 ? 0.32 * decay : 0);
    if (n < t * 0.33 && b > 0.5) return K.dark; // przerdzewiałe na wylot
    if (n < t) return rust(u, v, k + 2);
    return chalk(b > 0.8 ? shade(c, 0.88) : v === 0 ? shade(c, 1.08) : c, u, v, k + 3);
  };
  /** róg zaokrąglony: piksel (u, v) prostokąta w × h leży poza łukiem o promieniu q */
  const corner = (u: number, v: number, w: number, h: number, q: number) => {
    const cu = u < q ? q - u - 0.5 : u >= w - q ? u - (w - q) + 0.5 : 0;
    const cv = v < q ? q - v - 0.5 : v >= h - q ? v - (h - q) + 0.5 : 0;
    return cu > 0 && cv > 0 && cu * cu + cv * cv > q * q;
  };

  // ---------------------------------------------------------------- boki, przód i tył nadwozia
  const archAt = (x: number, v: number, h: number) => {
    let e = 9;
    for (const a of axl) e = Math.min(e, ((x + 0.5 - a) / rx) ** 2 + ((h - 0.5 - v) / ry) ** 2);
    return e;
  };
  /** końce boku za zaokrąglonym rogiem: wyżej ucięte, żeby bok nie kończył się ostrym kantem */
  const endCut = (x: number, v: number, w: number) => {
    const d = Math.min(x, w - 1 - x);
    return d < R / 2 && v < R / 2 - d;
  };
  const sideOf =
    (right: boolean): Paint =>
    (u, v, w, h) => {
      const x = right ? u : w - 1 - u; // od tyłu auta
      const e = archAt(x, v, h);
      if (e < 1 || endCut(x, v, w)) return HOLE; // puste nadkole: widać ciemne wnętrze i cegły
      if (bare && x > s.door[0] && x < s.door[1] && v < h - 2) return v === 0 ? K.rim : K.dark; // bez drzwi
      let c = odd >= 0 && x > s.door[0] && x < s.door[1] ? odd : paint;
      if (model === 'polonez' && v === 5 && e > 1.4) c = K.black; // listwa boczna
      if (model === 'maluch' && x >= 22 && x <= 30 && v >= 1 && v <= 2 && x % 2 === 0) c = K.dark; // wloty powietrza
      if (s.seams.includes(x) && v < h - 1) return shade(c, 0.6);
      if (s.handles.includes(x) && v === 2) return K.chrome;
      if (h2(x, 0, seed + (right ? 1212 : 1219)) < 0.1 && v > 1) c = shade(c, 0.9); // zacieki
      return metal(c, x, v, h, right ? 1210 : 1215, e);
    };
  const broken = [r(20) < 0.6, r(21) < 0.6, r(22) < 0.5, r(23) < 0.5];
  const lamp = (k: number, u: number, v: number, c: number) =>
    broken[k] ? (h2(u, v, seed + 1230 + k) < 0.2 ? K.shard : K.dark) : c;
  /** tablica bez numerów: biała z ciemnym obrzeżem */
  const plate = (u: number, w: number) => (Math.abs(u + 0.5 - w / 2) > 4 ? K.rim : K.plate);
  const nose: Paint = (u, v, w, h) => {
    if (endCut(u, v, w)) return HOLE;
    if (v >= 1 && v <= 3) {
      const lw = model === 'maluch' ? 6 : 10;
      const o = model === 'maluch' ? 3 : 2;
      if (u >= o && u < o + lw) return lamp(0, u, v, K.lamp);
      if (u >= w - o - lw && u < w - o) return lamp(1, u, v, K.lamp);
      if (model === 'polonez' && u >= 4 + lw && u < w - 4 - lw) return v === 2 ? K.dark : K.black; // atrapa
      if (model === 'maluch' && Math.abs(u + 0.5 - w / 2) < 5) return plate(u, w);
    }
    return metal(paint, u, v, h, 1300);
  };
  const tail: Paint = (u, v, w, h) => {
    if (endCut(u, v, w)) return HOLE;
    if (v >= 1 && v <= 3) {
      const lw = model === 'maluch' ? 5 : 11;
      const o = model === 'maluch' ? 3 : 2;
      const light = model === 'polonez' && u % 4 === 0 ? K.dark : v === 1 ? K.amber : K.red;
      if (u >= o && u < o + lw) return lamp(2, u, v, light);
      if (u >= w - o - lw && u < w - o) return lamp(3, u, v, light);
      if (Math.abs(u + 0.5 - w / 2) < 5) return plate(u, w);
    }
    return metal(paint, u, v, h, 1310);
  };

  // ---------------------------------------------------------------- wierzch nadwozia
  const hoodU = s.hood - bx0;
  const deckU = s.deck - bx0;
  const cowl0 = cx1 - bx0; // podszybie: tu zbierają się liście
  /** komora silnika bez pokrywy: blok pośrodku, w polonezie chłodnica z przodu */
  const engine = (u: number, v: number, w: number, h: number) => {
    const k = h2(u, v, seed + 1226);
    const mid = Math.abs(v + 0.5 - h / 2) < h * 0.2;
    const block = !bare && mid && (model === 'maluch' ? u > 5 && u < deckU - 4 : u > hoodU + 5 && u < w - 6);
    if (block) return k < 0.2 ? K.rim : k > 0.88 ? rust(u, v, 1227) : K.block;
    if (model === 'polonez' && u >= w - 4) return v % 2 ? K.dark : K.rim; // chłodnica
    return k < 0.1 ? rust(u, v, 1228) : K.dark;
  };
  /** cieniowanie zaokrąglonego nadwozia: ciemniej przy bokach i końcach */
  const bulge = (c: number, u: number, v: number, w: number, h: number) => {
    const d = Math.min(v, h - 1 - v, Math.floor(Math.min(u, w - 1 - u) / 2));
    return d === 0 ? shade(c, 0.8) : d === 1 ? shade(c, 0.9) : d === 2 ? shade(c, 0.96) : c;
  };
  const topPaint: Paint = (u, v, w, h) => {
    if (corner(u, v, w, h, R)) return HOLE;
    let c = sun;
    const inHood = u >= hoodU;
    const inDeck = u <= deckU;
    const lid = v > 3 && v < h - 4;
    if (lidGone && lid && (model === 'maluch' ? u < deckU : u > hoodU)) return engine(u, v, w, h);
    // przeszukany: otwarty także bagażnik (w maluchu z przodu, w polonezie z tyłu), w środku pusto
    if (stage > 0 && lid && (model === 'maluch' ? u > hoodU : u < deckU))
      return h2(u, v, seed + 1229) < 0.12 ? rust(u, v, 1229) : K.dark;
    if ((u === hoodU || u === deckU) && lid) return shade(c, 0.66); // szczeliny pokryw
    if ((inHood || inDeck) && (v === 3 || v === h - 4)) c = shade(c, 0.8);
    if (model === 'maluch' && inDeck && u >= 5 && u <= 14 && v > 10 && v < h - 11 && u % 3 === 0) return shade(c, 0.55); // żaluzje silnika
    if (model === 'polonez' && inHood && Math.abs(v + 0.5 - h / 2) < 1) c = shade(c, 1.06); // przetłoczenie maski
    const n = vnoise(u, v, 6, seed + 1220);
    if (n < decay * 0.07) return K.dark;
    if (n < decay * 0.22) return rust(u, v, 1221);
    // liście na podszybiu i rzadko gdzie indziej, ptasie z rzadka
    const leaves = u >= cowl0 && u < cowl0 + 3 ? 0.18 : 0.004;
    if (h2(u, v, seed + 1222) < leaves) return pick(K.leaf, h2(u, v, seed + 1223));
    if (h2(u, v, seed + 1224) < 0.0008) return K.dropping;
    return chalk(bulge(c, u, v, w, h), u, v, 1225);
  };

  // ---------------------------------------------------------------- szyby
  /** stan szyby k: 0 wybita, 1 popękana, 2 cała, ale brudna */
  const state = (k: number) => {
    const q = r(40 + k);
    return bare || q < 0.62 ? 0 : q < 0.85 ? 1 : 2;
  };
  /** piksel szyby (u, v w szybie w × h); deep: co widać przez dziurę */
  const pane = (st: number, u: number, v: number, w: number, h: number, k: number, deep: number) => {
    if (st === 0) {
      const edge = Math.min(u, v, w - 1 - u, h - 1 - v);
      if (edge === 0 && h2(u, v, seed + k) < 0.45) return K.shard; // ostre resztki przy ramie
      if (edge === 1 && h2(u, v, seed + k + 1) < 0.12) return K.shard;
      return deep;
    }
    if (st === 1) {
      const ix = Math.floor(w * (0.25 + 0.5 * h2(k, 1, seed)));
      const iy = Math.floor(h * (0.3 + 0.4 * h2(k, 2, seed)));
      const dx = Math.abs(u - ix);
      const dy = Math.abs(v - iy);
      const d = Math.hypot(dx, dy);
      const ring = Math.abs(d - 2.5) < 0.5;
      return d < 4.5 && (dx === dy || dx === 0 || dy === 0 || ring) ? K.crack : K.glass;
    }
    // brudna: ciemna szyba z ukośnym odblaskiem
    return Math.abs(u + v - (w + h) * 0.35) < 1
      ? K.glare
      : mix(K.glass, 0x6a6458, 0.2 + (0.1 * v) / Math.max(1, h - 1));
  };
  const cabinSide =
    (right: boolean): Paint =>
    (u, v, w, h) => {
      const x = right ? u : w - 1 - u; // od tyłu kabiny
      if ((x === 0 || x === w - 1) && v === 0) return HOLE;
      if (v === 0) return chalk(paint, x, v, 1240); // krawędź dachu
      if (v === h - 1) return K.rubber; // uszczelka pod szybą
      for (let k = 0; k < s.windows.length; k++) {
        const [a, b] = s.windows[k];
        if (x < a || x >= b) continue;
        const deep = v >= h - 3 ? K.seat : K.dark; // oparcia foteli
        return pane(state(k + (right ? 0 : 8)), x - a, v - 1, b - a, h - 2, 1250 + k * 3 + (right ? 0 : 40), deep);
      }
      // słupki
      return vnoise(x, v * 2, 3, seed + 1241) < decay * 0.2 ? rust(x, v, 1242) : chalk(paint, x, v, 1243);
    };
  const roofU0 = s.roof[0] - cx0;
  const roofU1 = s.roof[1] - cx0;
  // z góry: szyba przednia i tylna (pochyłe) oraz szyby boczne wokół dachu, w rogach słupki
  const cabinTop: Paint = (u, v, w, h) => {
    if (corner(u, v, w, h, 2)) return HOLE;
    const left = v < INSET;
    const right = v >= h - INSET;
    const front = u >= roofU1;
    const rear = u < roofU0;
    if ((left || right) && (front || rear)) return chalk(bulge(sun, u, v, w, h), u, v, 1244); // słupki A i C
    if (left || right) {
      for (let k = 0; k < s.windows.length; k++) {
        const [a, b] = s.windows[k];
        if (u < a || u >= b) continue;
        const pv = right ? v - (h - INSET) : INSET - 1 - v;
        return pane(state(k + (right ? 0 : 8)), u - a, pv, b - a, INSET, 1250 + k * 3 + (right ? 0 : 40), K.seat);
      }
      return chalk(sun, u, v, 1244); // słupek B
    }
    const wu = front ? u - roofU1 : u;
    const ww = front ? w - roofU1 : roofU0;
    const deep = front ? (v % 9 === 4 ? K.rim : K.dash) : K.seat;
    return pane(state(front ? 20 : 21), wu, v - INSET, ww, h - 2 * INSET, front ? 1260 : 1270, deep);
  };
  const cabinEnd =
    (front: boolean): Paint =>
    (u, v, w, h) => {
      if (v === 0 && (u === 0 || u === w - 1)) return HOLE;
      if (v === 0 || u <= 1 || u >= w - 2) return chalk(paint, u, v, 1245); // dach i słupki
      if (v === h - 1) return K.rubber;
      return pane(state(front ? 20 : 21), u - 2, v - 1, w - 4, h - 2, front ? 1260 : 1270, front ? K.dash : K.seat);
    };
  const roofTop: Paint = (u, v, w, h) => {
    if (corner(u, v, w, h, 2)) return HOLE;
    const n = vnoise(u, v, 6, seed + 1280);
    if (n < decay * 0.06) return K.dark;
    if (n < decay * 0.2) return rust(u, v, 1281);
    if (vnoise(u, v, 4, seed + 1282) < 0.1) return shade(sun, 0.9); // wgniecenia
    if (h2(u, v, seed + 1283) < 0.006) return pick(K.leaf, h2(u, v, seed + 1284));
    if (h2(u, v, seed + 1285) < 0.001) return K.dropping;
    return chalk(v === 0 || v === h - 1 ? shade(sun, 0.92) : sun, u, v, 1286);
  };
  const roofSide: Paint = (u, v) => chalk(paint, u, v, 1287);

  // ---------------------------------------------------------------- bryły
  const b: Box[] = [];
  // ziemia pod autem w cieniu i nadkola od środka
  b.push(box(bx0 + 2, by0 + 2, 0, bx1 - 2, by1 - 1, 1, K.under, { flat: true }));
  for (const a of s.axles)
    b.push(box(a - rx, by0 + 2, s.sill, a + rx, by1 - 2, s.sill + ry + 1, K.dark, { flat: true }));
  // cegły pod osiami (czasem klocek drewna)
  for (const a of s.axles)
    for (const y0 of [by0 + 1, by1 - 5]) {
      const wood = h2(a, y0, seed + 1290) < 0.2;
      const c = wood ? 0x7a5a3a : h2(a, y0, seed + 1291) < 0.5 ? C.brick0 : C.brick1;
      const face: Paint = (u, v) =>
        wood ? (v === 0 ? shade(c, 1.15) : c) : v === 1 ? 0xa89f8e : u === 3 && v > 1 ? shade(c, 0.8) : c;
      b.push(box(a - 3, y0, 0, a + 3, y0 + 4, s.sill, c, { front: face, back: face, left: face, right: face }));
    }
  b.push(
    box(bx0, by0, s.sill, bx1, by1, s.belt, paint, {
      top: topPaint,
      front: sideOf(true),
      back: sideOf(false),
      right: nose,
      left: tail,
    }),
  );
  b.push(
    box(cx0, cy0, s.belt, cx1, cy1, s.glass, paint, {
      top: cabinTop,
      front: cabinSide(true),
      back: cabinSide(false),
      right: cabinEnd(true),
      left: cabinEnd(false),
    }),
  );
  b.push(
    box(s.roof[0], cy0 + INSET, s.glass, s.roof[1], cy1 - INSET, s.top, sun, {
      top: roofTop,
      front: roofSide,
      back: roofSide,
      left: roofSide,
      right: roofSide,
    }),
  );
  // zderzaki: w maluchu chromowane, w polonezie czarne
  const bump = model === 'maluch' ? K.chrome : K.black;
  const bumpPaint: Paint = (u, v) =>
    model === 'maluch' && h2(u, v, seed + 1295) < decay * 0.4 ? rust(u, v, 1296) : v === 0 ? shade(bump, 1.15) : bump;
  const bz1 = s.sill + (model === 'maluch' ? 3 : 4);
  const env: Box[] = [];
  for (const [x0, x1] of [
    [bx0 - 1, bx0 + 2],
    [bx1 - 2, bx1 + 1],
  ]) {
    // szkielet bez zderzaków, ale z tymi samymi granicami sprite'a
    env.push(box(x0, by0 + 3, s.sill + 1, x1, by1 - 3, bz1, 0));
    if (bare) continue;
    b.push(
      box(x0, by0 + 3, s.sill + 1, x1, by1 - 3, bz1, bump, {
        top: bumpPaint,
        front: bumpPaint,
        back: bumpPaint,
        left: bumpPaint,
        right: bumpPaint,
      }),
    );
  }
  if (model === 'maluch') {
    // bagażnik dachowy (granice zawsze z nim, żeby rozmiar nie zależał od ziarna)
    const ry0 = cy0 + INSET + 2;
    const ry1 = cy1 - INSET - 3;
    env.push(box(s.roof[0], ry0, s.top, s.roof[1], ry1 + 1, s.top + 2, 0));
    if (rack) {
      const steel = 0x5a5854;
      for (const y of [ry0, ry1])
        b.push(box(s.roof[0] + 2, y, s.top, s.roof[1] - 2, y + 1, s.top + 2, steel, { opt: true }));
      for (const x of [s.roof[0] + 4, s.roof[1] - 5])
        b.push(box(x, ry0, s.top + 1, x + 1, ry1 + 1, s.top + 2, steel, { opt: true }));
    }
  }
  // chwasty przy progu
  const tufts = 3 + Math.floor(r(60) * 4);
  for (let k = 0; k < tufts; k++) {
    const x = bx0 + 2 + Math.floor(r(61 + k) * (bx1 - bx0 - 6));
    const y = by1 + Math.floor(r(71 + k) * 3);
    const c = pick(K.weed, r(91 + k));
    b.push(
      box(x, y, 0, x + 2, y + 1, 2 + Math.floor(r(81 + k) * 3), c, {
        opt: true,
        flat: true,
        top: (u) => (u ? shade(c, 0.85) : shade(c, 1.15)),
        front: (u, v) => ((u + v) % 2 ? c : shade(c, 0.8)),
      }),
    );
  }
  return renderBoxes(b, L, D, rot, env);
}
