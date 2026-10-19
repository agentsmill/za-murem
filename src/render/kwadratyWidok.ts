/* Geometria wielu kwadratów w widoku (docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md, „Rysowanie wielu
   kwadratów”): czyste funkcje, które mówią, gdzie leżą kwadraty w pikselach grafiki układu miasta, które kawałki każdego
   z nich widać i w jakiej kolejności je rysować. GameView (view.ts) tylko je woła. Kwadrat (sx, sy) zaczyna się w
   (sx·size·TILE, sy·size·TILE), dom to (0, 0), a kawałek (cx, cy) kwadratu ma numer cy·n + cx, n = size / CHUNK, i leży
   w mieście na globalnym kawałku (sx·n + cx, sy·n + cy). Odległość kawałka od kamery to suma różnic globalnych
   numerów (Manhattan), jak w chunksByDistance, a remis rozstrzyga kolejność: kwadraty w kolejności listy, kawałki wierszami.
   Bez PixiJS i DOM, więc da się to sprawdzić w Node. */

import { CHUNK, TILE } from './art/scene.ts';
import type { Kawalek } from './chunks.ts';

/** kwadrat w widoku: numer q (0 to dom) i jego położenie w kwadratach od domu */
export interface PoleKwadratu {
  q: number;
  sx: number;
  sy: number;
}

/** prostokąt w pikselach grafiki układu miasta */
export interface Prostokat {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** środek widoku w pikselach grafiki */
export interface Kamera2 {
  x: number;
  y: number;
}

/** Prostokąt obejmujący wszystkie kwadraty (piksele grafiki). */
export function ramkaKwadratow(pola: readonly { sx: number; sy: number }[], size: number): Prostokat {
  const bok = size * TILE;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const p of pola) {
    x0 = Math.min(x0, p.sx * bok);
    y0 = Math.min(y0, p.sy * bok);
    x1 = Math.max(x1, (p.sx + 1) * bok);
    y1 = Math.max(y1, (p.sy + 1) * bok);
  }
  return { x0, y0, x1, y1 };
}

/** Kawałki kwadratów widoczne w oknie v, od najbliższego kawałkowi pod kamerą (stabilnie: remis wg kolejności listy). */
export function widoczneKawalki(pola: readonly PoleKwadratu[], size: number, v: Prostokat, cam: Kamera2): Kawalek[] {
  const n = Math.ceil(size / CHUNK);
  const span = CHUNK * TILE;
  const bok = size * TILE;
  const ccx = Math.floor(cam.x / span);
  const ccy = Math.floor(cam.y / span);
  const lista: Array<Kawalek & { d: number }> = [];
  for (const p of pola) {
    const ox = p.sx * bok;
    const oy = p.sy * bok;
    const cx0 = Math.max(0, Math.floor((v.x0 - ox) / span));
    const cy0 = Math.max(0, Math.floor((v.y0 - oy) / span));
    const cx1 = Math.min(n - 1, Math.floor((v.x1 - ox) / span));
    const cy1 = Math.min(n - 1, Math.floor((v.y1 - oy) / span));
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        lista.push({ q: p.q, k: cy * n + cx, d: Math.abs(p.sx * n + cx - ccx) + Math.abs(p.sy * n + cy - ccy) });
  }
  lista.sort((a, b) => a.d - b.d);
  return lista.map(({ q, k }) => ({ q, k }));
}

/**
 * Wszystkie kawałki wszystkich kwadratów jako kandydaci do rysowania w tle. wgNumerow (sam dom): w kolejności numerów, jak
 * dotąd; inaczej od najbliższego kamerze.
 */
export function kandydaciTla(pola: readonly PoleKwadratu[], size: number, cam: Kamera2, wgNumerow: boolean): Kawalek[] {
  const n = Math.ceil(size / CHUNK);
  const span = CHUNK * TILE;
  const ccx = Math.floor(cam.x / span);
  const ccy = Math.floor(cam.y / span);
  const lista: Array<Kawalek & { d: number }> = [];
  for (const p of pola)
    for (let k = 0; k < n * n; k++) {
      const d = wgNumerow ? 0 : Math.abs(p.sx * n + (k % n) - ccx) + Math.abs(p.sy * n + Math.floor(k / n) - ccy);
      lista.push({ q: p.q, k, d });
    }
  if (!wgNumerow) lista.sort((a, b) => a.d - b.d);
  return lista.map(({ q, k }) => ({ q, k }));
}

/** Numery kwadratów, które przecinają okno v, od najbliższego kamerze (środek kwadratu); remis wg kolejności listy. */
export function kwadratyNaEkranie(pola: readonly PoleKwadratu[], size: number, v: Prostokat, cam: Kamera2): number[] {
  const bok = size * TILE;
  return pola
    .filter((p) => p.sx * bok < v.x1 && (p.sx + 1) * bok > v.x0 && p.sy * bok < v.y1 && (p.sy + 1) * bok > v.y0)
    .map((p) => ({ q: p.q, d: (p.sx * bok + bok / 2 - cam.x) ** 2 + (p.sy * bok + bok / 2 - cam.y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .map((p) => p.q);
}
