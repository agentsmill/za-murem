/* Noc i światło: mapa światła mnożona przez obraz świata. Ciemność z godziny gry (łagodny
   zmierzch i świt), na niej źródła światła ze zgaśnięciem ku brzegowi i migotaniem. Mapa ma
   niską rozdzielczość w siatce przypiętej do świata (komórka od 4 do 128 px grafiki zależnie
   od zoomu), skalowana bez wygładzania. Jasność światła idzie w kilku pasach (pełny środek,
   potem równe stopnie), a tylko wąski szew między pasami ma dithering 4×4; odcień zostaje
   cały, bo pasy liczą się z jasności, nie z każdego kanału osobno. Siatka jest przypięta do
   świata, więc światło nie pływa przy przesuwaniu mapy. Czyste funkcje bez DOM. */

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

/** bok komórki mapy światła w pikselach grafiki: najbliższa potęga dwójki do 6 px ekranu, od 4 do 128 */
export function lightCell(zoom: number): number {
  const want = 6 / Math.max(zoom, 1e-3);
  return Math.min(128, Math.max(4, 2 ** Math.round(Math.log2(want))));
}

/** próg ditheringu 4×4 (Bayer) dla komórki (ix, iy) świata, w [0, 1) */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (ix: number, iy: number) => BAYER[((iy & 3) << 2) | (ix & 3)];

/** ile pasów jasności ma światło */
export const LIGHT_LEVELS = 4;
/** szerokość szwu z ditheringiem między pasami (część pasa) */
const SEAM = 0.3;
/** część promienia, na której światło świeci pełną siłą */
const CORE = 0.4;

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

/**
 * Liczy mapę światła do out (RGBA, bajty, wiersz po wierszu, szerokość wiersza stride komórek):
 * otoczenie z ciemności d plus suma świateł w pasach z ditheringiem, przycięta do bieli.
 * acc to bufor roboczy (co najmniej 3·w·h liczb). px to pikseli grafiki na metr.
 */
export function renderLightMap(
  out: Uint8Array,
  stride: number,
  acc: Float32Array,
  g: LightGrid,
  d: number,
  lights: readonly Light[],
  time: number,
  px = 32,
): void {
  const { gx, gy, w, h, cell } = g;
  acc.fill(0, 0, w * h * 3);
  const m = cell / px; // metrów na komórkę
  for (let k = 0; k < lights.length; k++) {
    const l = lights[k];
    const amp = l.strength * flickerOf(l, k, time);
    if (amp <= 0 || l.r <= 0) continue;
    const lr = ((l.color >> 16) & 255) / 255;
    const lg = ((l.color >> 8) & 255) / 255;
    const lb = (l.color & 255) / 255;
    // komórki pod kołem światła (środek komórki w metrach: (gx + i + 0,5)·m)
    const i0 = Math.max(0, Math.floor((l.x - l.r) / m - gx));
    const i1 = Math.min(w - 1, Math.floor((l.x + l.r) / m - gx));
    const j0 = Math.max(0, Math.floor((l.y - l.r) / m - gy));
    const j1 = Math.min(h - 1, Math.floor((l.y + l.r) / m - gy));
    const inv = 1 / l.r;
    for (let j = j0; j <= j1; j++) {
      const dy = (gy + j + 0.5) * m - l.y;
      for (let i = i0; i <= i1; i++) {
        const dx = (gx + i + 0.5) * m - l.x;
        const q = 1 - Math.sqrt(dx * dx + dy * dy) * inv;
        if (q <= 0) continue;
        // pełny środek, potem liniowo do zera na brzegu
        const v = amp * Math.min(1, q / (1 - CORE));
        const o = (j * w + i) * 3;
        acc[o] += lr * v;
        acc[o + 1] += lg * v;
        acc[o + 2] += lb * v;
      }
    }
  }
  const [ar, ag, ab] = ambientOf(d);
  const N = LIGHT_LEVELS;
  for (let j = 0; j < h; j++) {
    let o = j * stride * 4;
    let a = j * w * 3;
    for (let i = 0; i < w; i++) {
      // pasy tylko w świetle (równa ciemność zostaje równa) i liczone z jasności, żeby nie zmieniać odcienia
      let r = ar;
      let gg = ag;
      let b = ab;
      const top = Math.max(acc[a], acc[a + 1], acc[a + 2]);
      if (top > 0) {
        const t = 0.5 + (bayer(gx + i, gy + j) - 0.5) * SEAM;
        const k = Math.floor(top * N + t) / N / top;
        r += acc[a] * k;
        gg += acc[a + 1] * k;
        b += acc[a + 2] * k;
      }
      out[o] = r >= 1 ? 255 : Math.round(r * 255);
      out[o + 1] = gg >= 1 ? 255 : Math.round(gg * 255);
      out[o + 2] = b >= 1 ? 255 : Math.round(b * 255);
      out[o + 3] = 255;
      o += 4;
      a += 3;
    }
  }
}

/** siatka komórek pokrywająca prostokąt świata [x0, x1]×[y0, y1] (piksele grafiki) z zapasem jednej komórki */
export function gridFor(x0: number, y0: number, x1: number, y1: number, zoom: number): LightGrid {
  const cell = lightCell(zoom);
  const gx = Math.floor(x0 / cell) - 1;
  const gy = Math.floor(y0 / cell) - 1;
  return { gx, gy, w: Math.ceil(x1 / cell) + 1 - gx, h: Math.ceil(y1 / cell) + 1 - gy, cell };
}
