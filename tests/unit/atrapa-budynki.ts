/* Atrapa mapy z każdym z 11 wyglądów budynków z PixelLab: dema (Przymorze, Lanciego, Zielonki) nie mają takich budynków,
   więc testy i zrzuty (tools/shots.ts, scenariusze budynki-*) biorą tę mapę. Dwie ulice równoległe do osi x, po ich
   północnej stronie budynki frontem na południe (tak je widać w grze): przy pierwszej rząd sześciu kamienic o różnych
   szerokościach i pozostałe wyglądy z rodzajami punktów (muzeum, teatr…), przy drugiej hotel, szpital, kościół, willa
   i remiza. Współrzędne w metrach względem adresu (0, 0); kafelek świata to metry plus połowa mapy. */

import type { LookBudynku } from '../../src/render/art/lookBudynku.ts';
import type { Geo, GeoRodzaj, Pt } from '../../src/world/geo.ts';
import type { RodzajPunktu } from '../../src/world/rodzaje.ts';

export interface AtrapaBudynek {
  look: LookBudynku;
  /** prostokąt obrysu w metrach: x0, y0 (północny zachód), x1, y1 (południowy wschód, bez końcowych kafelków) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

/** południowa krawędź budynków pierwszej ulicy: chodnik przed frontem, jezdnia o kilka kafelków dalej */
const FRONT1 = -6;
/** i drugiej ulicy */
const FRONT2 = 54;

/** pojedyncze budynki: wygląd, rodzaj punktu, szerokość, głębokość, piętra, tagi, początek x i południowa krawędź */
const POJEDYNCZE: {
  look: LookBudynku;
  rodzaj: RodzajPunktu;
  x: number;
  w: number;
  d: number;
  pietra: number;
  front: number;
  tagi?: Record<string, string>;
}[] = [
  { look: 'ratusz', rodzaj: 'ratusz', x: -12, w: 22, d: 16, pietra: 3, front: FRONT1 },
  { look: 'muzeum', rodzaj: 'muzeum', x: 18, w: 22, d: 14, pietra: 2, front: FRONT1 },
  { look: 'teatr', rodzaj: 'teatr', x: 48, w: 24, d: 17, pietra: 3, front: FRONT1 },
  { look: 'urzad', rodzaj: 'urzad', x: 80, w: 26, d: 12, pietra: 3, front: FRONT1 },
  { look: 'dworzec', rodzaj: 'dworzec', x: 114, w: 28, d: 14, pietra: 2, front: FRONT1 },
  { look: 'hotel', rodzaj: 'hotel', x: -60, w: 32, d: 15, pietra: 5, front: FRONT2 },
  { look: 'szpital', rodzaj: 'szpital', x: -20, w: 34, d: 15, pietra: 4, front: FRONT2 },
  { look: 'kosciol', rodzaj: 'kosciol', x: 24, w: 18, d: 24, pietra: 1, front: FRONT2 },
  { look: 'willa', rodzaj: 'willa', x: 52, w: 13, d: 10, pietra: 2, front: FRONT2, tagi: { building: 'house' } },
  { look: 'remiza', rodzaj: 'remiza', x: 74, w: 20, d: 11, pietra: 1, front: FRONT2 },
];

/** kamienice: szerokości różne (rząd „nieregularny”), głębokości i pola różne (nie bliźniaki), przy pierwszej ulicy */
const KAMIENICE = [
  { w: 10, d: 18, pietra: 4 },
  { w: 14, d: 20, pietra: 5 },
  { w: 12, d: 15, pietra: 4 },
  { w: 18, d: 22, pietra: 5 },
  { w: 9, d: 17, pietra: 4 },
  { w: 16, d: 19, pietra: 5 },
];
const KAMIENICE_X = -112;

export function atrapaBudynki(): { geo: Geo; budynki: AtrapaBudynek[] } {
  const geo: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [], rodzaje: [] };
  const budynki: AtrapaBudynek[] = [];
  let x = KAMIENICE_X;
  for (const k of KAMIENICE) {
    geo.b.push({
      p: rect(x, FRONT1 - k.d, k.w, k.d),
      t: { building: 'apartments', 'building:levels': String(k.pietra) },
    });
    budynki.push({ look: 'kamienica', x0: x, y0: FRONT1 - k.d, x1: x + k.w, y1: FRONT1 });
    x += k.w;
  }
  for (const p of POJEDYNCZE) {
    geo.b.push({
      p: rect(p.x, p.front - p.d, p.w, p.d),
      t: { building: 'yes', 'building:levels': String(p.pietra), ...p.tagi },
    });
    const r: GeoRodzaj = { x: p.x + p.w / 2, y: p.front - p.d / 2, k: p.rodzaj, n: '' };
    geo.rodzaje?.push(r);
    budynki.push({ look: p.look, x0: p.x, y0: p.front - p.d, x1: p.x + p.w, y1: p.front });
  }
  // siedziba: zwykły blok osobno tuż pod adresem, po drugiej stronie ulicy (bez wyglądu; siedzibą jest budynek do 4 m
  // od adresu), żeby żaden z wyglądów nie był siedzibą i nie pokazywał przekroju
  geo.b.push({ p: rect(-10, 4, 20, 16), t: { building: 'apartments', 'building:levels': '5' } });
  for (const y of [0, 60])
    geo.r.push({
      l: [
        [-150, y],
        [150, y],
      ],
      h: 'residential',
    });
  geo.a.push({ p: rect(-150, 34, 300, 10), k: 'park' });
  return { geo, budynki };
}

/** środek budynku w kafelkach świata o danym rozmiarze (SIZE 384 to połowa 192) */
export const srodekKafelki = (b: AtrapaBudynek, size = 384): [number, number] => [
  (b.x0 + b.x1) / 2 + size / 2,
  (b.y0 + b.y1) / 2 + size / 2,
];
