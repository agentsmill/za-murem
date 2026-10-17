/* Rzutowanie PUWG 1992 (EPSG:2180) ↔ WGS84, tylko do narzędzi offline (w grze nie ma trygonometrii).
   Odwzorowanie Gaussa–Krügera na elipsoidzie GRS80, południk środkowy 19°E, skala 0,9993, przesunięcie
   500 000 m na wschód i −5 300 000 m na północ. Szeregi Krügera do czwartego rzędu po spłaszczeniu n:
   błąd poniżej milimetra w całej Polsce (do 5° od południka środkowego). Różnicę między WGS84 a GRS80
   pomijamy (ułamki milimetra). Kolejność osi jak w SHP: x to wschód (easting), y to północ (northing),
   a w stopniach najpierw szerokość (lat), potem długość (lon). */

const A_ELIPS = 6378137;
const SPLASZCZENIE = 1 / 298.257222101;
const SKALA = 0.9993;
const PRZESUNIECIE_X = 500000;
const PRZESUNIECIE_Y = -5300000;
const POLUDNIK = (19 * Math.PI) / 180;
const STOPNIE = Math.PI / 180;

const n = SPLASZCZENIE / (2 - SPLASZCZENIE);
const n2 = n * n;
const n3 = n2 * n;
const n4 = n3 * n;

/** Promień kuli o tej samej długości południka, razem ze skalą; mnoży współrzędne na płaszczyźnie. */
const PROMIEN = (A_ELIPS / (1 + n)) * (1 + n2 / 4 + n4 / 64) * SKALA;

// z szerokości geograficznej na płaszczyznę
const ALFA = [
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
  (61 * n3) / 240 - (103 * n4) / 140,
  (49561 * n4) / 161280,
];
// z płaszczyzny na szerokość izometryczną
const BETA = [
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440,
  (17 * n3) / 480 - (37 * n4) / 840,
  (4397 * n4) / 161280,
];
// z szerokości izometrycznej (sferycznej) na geodezyjną
const DELTA = [
  2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
  (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
  (56 * n3) / 15 - (136 * n4) / 35,
  (4279 * n4) / 630,
];

const E_POMOC = (2 * Math.sqrt(n)) / (1 + n);

/** WGS84 (szerokość, długość w stopniach) → PUWG 1992 `[x wschód, y północ]` w metrach. */
export function zWgs84(lat: number, lon: number): [x: number, y: number] {
  const s = Math.sin(lat * STOPNIE);
  const t = Math.sinh(Math.atanh(s) - E_POMOC * Math.atanh(E_POMOC * s));
  const dl = lon * STOPNIE - POLUDNIK;
  const ksi0 = Math.atan2(t, Math.cos(dl));
  const eta0 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let ksi = ksi0;
  let eta = eta0;
  for (let j = 1; j <= 4; j++) {
    ksi += ALFA[j - 1] * Math.sin(2 * j * ksi0) * Math.cosh(2 * j * eta0);
    eta += ALFA[j - 1] * Math.cos(2 * j * ksi0) * Math.sinh(2 * j * eta0);
  }
  return [PRZESUNIECIE_X + PROMIEN * eta, PRZESUNIECIE_Y + PROMIEN * ksi];
}

/** PUWG 1992 `(x wschód, y północ)` w metrach → WGS84 `[szerokość, długość]` w stopniach. */
export function doWgs84(x: number, y: number): [lat: number, lon: number] {
  const ksi = (y - PRZESUNIECIE_Y) / PROMIEN;
  const eta = (x - PRZESUNIECIE_X) / PROMIEN;
  let ksi1 = ksi;
  let eta1 = eta;
  for (let j = 1; j <= 4; j++) {
    ksi1 -= BETA[j - 1] * Math.sin(2 * j * ksi) * Math.cosh(2 * j * eta);
    eta1 -= BETA[j - 1] * Math.cos(2 * j * ksi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(ksi1) / Math.cosh(eta1));
  let lat = chi;
  for (let j = 1; j <= 4; j++) lat += DELTA[j - 1] * Math.sin(2 * j * chi);
  const lon = POLUDNIK + Math.atan2(Math.sinh(eta1), Math.cos(ksi1));
  return [lat / STOPNIE, lon / STOPNIE];
}
