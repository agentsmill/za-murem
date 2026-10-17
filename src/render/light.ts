/* Noc i światło: mapa światła nad obrazem świata. Ciemność z godziny gry (łagodny zmierzch
   i świt) daje kolor otoczenia, a źródła światła dwie rzeczy: mnożnik, który rozjaśnia i barwi
   obraz w kolorze światła (trawa w świetle ogniska robi się ciepła, a nie zielona), i nocną
   poświatę dodawaną na wierzch (ogień świeci, a nie tylko odsłania). Jasność łagodnie gaśnie ku
   brzegowi i idzie w pasach; zewnętrzny pas jest cały w ditheringu 4×4, więc brzeg jest miękki,
   a wnętrze pasów równe. Mapa ma niską rozdzielczość (komórka około 4 px ekranu) w siatce
   przypiętej do świata i skaluje się bez wygładzania, więc wygląda pikselowo i nie pływa przy
   przesuwaniu mapy. Czyste funkcje bez DOM. */

import { h2 } from './art/hash.ts';

/** źródło światła; położenie i promień w metrach (kafelkach), jak pionki */
export interface Light {
  x: number;
  y: number;
  /** zasięg w metrach */
  r: number;
  /** kolor 0xRRGGBB */
  color: number;
  /** siła w środku: 1 to pełny kolor światła, więcej przepala środek */
  strength: number;
  /** migotanie: 0 stałe (lampa), 0,3 ognisko, 1 dogasający ogień */
  flicker: number;
  /** światło we wnętrzu (koza): widać je tylko w przekroju, pod dachem świecą okna */
  inside?: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** ciemność 0 (dzień) … 1 (noc) z minut od północy: zmierzch 17–20, noc 20–5, świt 5–7 */
export function darknessAt(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24;
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 20) return smooth((h - 17) / 3);
  if (h >= 5 && h < 7) return smooth((7 - h) / 2);
  return 1;
}

/** kolor otoczenia (mnożnik 0..1 na kanał) przy ciemności d: biel, ciepły zmierzch, granatowa noc */
export function ambientOf(d: number): [number, number, number] {
  const DUSK: [number, number, number] = [1, 0.8, 0.66];
  const NIGHT: [number, number, number] = [0.14, 0.16, 0.28];
  const T = 0.35;
  if (d <= T) {
    const t = d / T;
    return [1 + (DUSK[0] - 1) * t, 1 + (DUSK[1] - 1) * t, 1 + (DUSK[2] - 1) * t];
  }
  const t = (d - T) / (1 - T);
  return [DUSK[0] + (NIGHT[0] - DUSK[0]) * t, DUSK[1] + (NIGHT[1] - DUSK[1]) * t, DUSK[2] + (NIGHT[2] - DUSK[2]) * t];
}

/** bok komórki mapy światła w pikselach grafiki: najbliższa potęga dwójki do 4 px ekranu, od 4 do 128 */
export function lightCell(zoom: number): number {
  const want = 4 / Math.max(zoom, 1e-3);
  return Math.min(128, Math.max(4, 2 ** Math.round(Math.log2(want))));
}

/** próg ditheringu 4×4 (Bayer) dla komórki (ix, iy) świata, w [0, 1) */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (ix: number, iy: number) => BAYER[((iy & 3) << 2) | (ix & 3)];

/** ile pasów jasności ma światło */
export const LIGHT_LEVELS = 6;
/** szerokość szwu z ditheringiem między wewnętrznymi pasami (część pasa) */
const SEAM = 0.35;
/** jak mocno światło barwi obraz przy mnożeniu: 0 tylko rozjaśnia, 1 pełny kolor światła */
const TINT = 1;
/** ile koloru światła dochodzi nocą na wierzch (poświata) */
const GLOW = 0.2;

/** mnożnik migotania światła numer k w chwili t (sekundy): 1 − flicker·szum, szum płynny ~8 razy na s */
export function flickerOf(l: Light, k: number, t: number): number {
  if (l.flicker <= 0) return 1;
  const f = t * 8;
  const i = Math.floor(f);
  const a = h2(k, i, 4242);
  const b = h2(k, i + 1, 4242);
  const n = a + (b - a) * smooth(f - i);
  return 1 - l.flicker * 0.45 * n;
}

export interface LightGrid {
  /** komórki od (gx, gy) w jednostkach komórki, w × h komórek o boku cell px grafiki */
  gx: number;
  gy: number;
  w: number;
  h: number;
  cell: number;
}

/** bajty RGBA (wiersz za wierszem, szerokość wiersza stride komórek) */
const pack = (r: number, g: number, b: number) =>
  ((255 << 24) |
    (Math.round(Math.min(1, b) * 255) << 16) |
    (Math.round(Math.min(1, g) * 255) << 8) |
    Math.round(Math.min(1, r) * 255)) >>>
  0;

/**
 * Liczy mapę światła: mul (mnożnik: otoczenie plus światła w pasach) i glow (nocna poświata do
 * dodania, czarna poza światłem) jako RGBA w buforach o szerokości wiersza stride komórek.
 * acc to bufor roboczy (co najmniej 6·w·h liczb). px to pikseli grafiki na metr. inside mówi, czy
 * kafelek (x, y) leży we wnętrzu: światła inside (koza) świecą tylko tam, nie przez ściany na podwórko.
 */
export function renderLightMap(
  mul: Uint8Array,
  glow: Uint8Array | null,
  stride: number,
  acc: Float32Array,
  g: LightGrid,
  d: number,
  lights: readonly Light[],
  time: number,
  px = 32,
  inside?: (x: number, y: number) => boolean,
): void {
  const { gx, gy, w, h, cell } = g;
  const [ar, ag, ab] = ambientOf(d);
  const mul32 = new Uint32Array(mul.buffer, mul.byteOffset, mul.byteLength >> 2);
  const glow32 = glow ? new Uint32Array(glow.buffer, glow.byteOffset, glow.byteLength >> 2) : null;
  // poza światłem: równe otoczenie i brak poświaty (szybkie wypełnienie całych wierszy)
  const base = pack(ar, ag, ab);
  for (let j = 0; j < h; j++) {
    mul32.fill(base, j * stride, j * stride + w);
    glow32?.fill(0, j * stride, j * stride + w);
  }
  const m = cell / px; // metrów na komórkę
  // prostokąt komórek pod wszystkimi światłami
  let bi0 = w;
  let bi1 = -1;
  let bj0 = h;
  let bj1 = -1;
  const boxes: [number, number, number, number][] = [];
  for (const l of lights) {
    const i0 = Math.max(0, Math.floor((l.x - l.r) / m - gx));
    const i1 = Math.min(w - 1, Math.floor((l.x + l.r) / m - gx));
    const j0 = Math.max(0, Math.floor((l.y - l.r) / m - gy));
    const j1 = Math.min(h - 1, Math.floor((l.y + l.r) / m - gy));
    boxes.push([i0, i1, j0, j1]);
    if (i0 > i1 || j0 > j1 || l.r <= 0) continue;
    bi0 = Math.min(bi0, i0);
    bi1 = Math.max(bi1, i1);
    bj0 = Math.min(bj0, j0);
    bj1 = Math.max(bj1, j1);
  }
  if (bi1 < bi0) return;
  const bw = bi1 - bi0 + 1;
  acc.fill(0, 0, bw * (bj1 - bj0 + 1) * 6);
  for (let k = 0; k < lights.length; k++) {
    const l = lights[k];
    const amp = l.strength * flickerOf(l, k, time);
    const [i0, i1, j0, j1] = boxes[k];
    if (amp <= 0 || l.r <= 0 || i0 > i1 || j0 > j1) continue;
    const cr = ((l.color >> 16) & 255) / 255;
    const cg = ((l.color >> 8) & 255) / 255;
    const cb = (l.color & 255) / 255;
    // przy mnożeniu kolor światła rozjaśniony o (1 − TINT), żeby obraz nie tonął w barwie
    const mr = 1 + (cr - 1) * TINT;
    const mg = 1 + (cg - 1) * TINT;
    const mb = 1 + (cb - 1) * TINT;
    const inv = 1 / l.r;
    const clip = l.inside && inside ? inside : null;
    for (let j = j0; j <= j1; j++) {
      const cy = (gy + j + 0.5) * m;
      const dy = cy - l.y;
      for (let i = i0; i <= i1; i++) {
        const cx = (gx + i + 0.5) * m;
        const dx = cx - l.x;
        const q = 1 - Math.sqrt(dx * dx + dy * dy) * inv;
        if (q <= 0) continue;
        if (clip && !clip(Math.floor(cx), Math.floor(cy))) continue;
        // gaśnie łagodnie, ale z wąskim brzegiem: jasny środek, krótki kropkowany skraj
        const v = amp * smooth(q) ** 0.7;
        const o = ((j - bj0) * bw + i - bi0) * 6;
        acc[o] += mr * v;
        acc[o + 1] += mg * v;
        acc[o + 2] += mb * v;
        acc[o + 3] += cr * v;
        acc[o + 4] += cg * v;
        acc[o + 5] += cb * v;
      }
    }
  }
  const N = LIGHT_LEVELS;
  const gk = GLOW * d;
  for (let j = bj0; j <= bj1; j++)
    for (let i = bi0; i <= bi1; i++) {
      const o = ((j - bj0) * bw + i - bi0) * 6;
      const top = Math.max(acc[o], acc[o + 1], acc[o + 2]);
      if (top <= 0) continue;
      // pasy z jasności (bez zmiany odcienia); zewnętrzny pas cały w ditheringu, wewnętrzne tylko w szwie
      const b = bayer(gx + i, gy + j);
      const t = top * N < 1 ? b : 0.5 + (b - 0.5) * SEAM;
      const kq = Math.floor(top * N + t) / N / top;
      if (kq === 0) continue;
      const c = j * stride + i;
      // światło zamiast otoczenia, a nie na nim: granat nocy nie wraca trawie zieleni w blasku ognia
      mul32[c] = pack(Math.max(ar, acc[o] * kq), Math.max(ag, acc[o + 1] * kq), Math.max(ab, acc[o + 2] * kq));
      if (glow32 && gk > 0) glow32[c] = pack(acc[o + 3] * kq * gk, acc[o + 4] * kq * gk, acc[o + 5] * kq * gk);
    }
}

/** siatka komórek pokrywająca prostokąt świata [x0, x1]×[y0, y1] (piksele grafiki) z zapasem jednej komórki */
export function gridFor(x0: number, y0: number, x1: number, y1: number, zoom: number): LightGrid {
  const cell = lightCell(zoom);
  const gx = Math.floor(x0 / cell) - 1;
  const gy = Math.floor(y0 / cell) - 1;
  return { gx, gy, w: Math.ceil(x1 / cell) + 1 - gx, h: Math.ceil(y1 / cell) + 1 - gy, cell };
}
