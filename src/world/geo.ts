/* Geometria osiedla w metrach względem punktu adresu: x na wschód, y na południe.
   Ten sam format co w 0.3 (wynik toGeo z Overpass i toGeoT z kafelków). */

import type { RodzajPunktu } from './rodzaje.ts';

export type Pt = [number, number];

export interface GeoBuilding {
  /** obrys zewnętrzny, zamknięty (ostatni punkt = pierwszy) */
  p: Pt[];
  /** sklejone części budynku przeciętego granicą kafelków */
  pp?: Pt[][];
  /** tagi OSM (wybrane) i identyfikator: id to typ i numer elementu OSM („w123” droga, „r45” relacja), gdy źródło
      go podaje; start_date to data budowy z OSM bez zmian (tylko z Overpass, kafelki jej nie niosą) */
  t: Record<string, string>;
}
export interface GeoRoad {
  l: Pt[];
  h: string;
}
export type AreaKind = 'water' | 'park' | 'wood' | 'allot' | 'pitch' | 'play' | 'parking';
export interface GeoArea {
  p: Pt[];
  k: AreaKind;
}
export interface GeoWater {
  l: Pt[];
}
export interface GeoPoi {
  x: number;
  y: number;
  c: string;
  n: string;
  /** klucz punktu „poi:X:Y” (globalny piksel z=14, miasto.ts): wspólny dla wszystkich graczy, niezależny od środka
      mapy; brak w zapisach i demach sprzed kluczy (uzupelnijKlucze liczy go z położenia) oraz w osiedlu zapasowym
      (genProc nie ma prawdziwego położenia, więc kluczy mu nie liczymy i mapy miasta nie ma) */
  k?: string;
}
/** punkt, który mówi, czym jest budynek (muzeum, teatr, hotel, dworzec, remiza, szpital, kościół, urząd, ratusz,
    willa): osobno od `poi`, bo kategorie punktów (`cats` budynku) zmieniają klasę budynku w classify(), a rodzaj ma
    zmieniać tylko jego wygląd (src/world/rodzaje.ts) */
export interface GeoRodzaj {
  x: number;
  y: number;
  k: RodzajPunktu;
  n: string;
}
export interface Geo {
  c: [number, number];
  b: GeoBuilding[];
  r: GeoRoad[];
  a: GeoArea[];
  w: GeoWater[];
  poi: GeoPoi[];
  /** rodzaje punktów (nowe w 0.4); pola nie ma, gdy w pobranych danych nie ma żadnego takiego punktu */
  rodzaje?: GeoRodzaj[];
  /** przejścia przez budynki (bramy, prześwity, tunele piesze i serwisowe); nowe w 0.4 */
  pass?: GeoRoad[];
  src?: string;
  proc?: boolean;
  name?: string;
}

/** pole wielokąta (wartość bezwzględna), jak G.polyArea w 0.3 */
export function polyArea(p: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a / 2);
}

/** odległość punktu (px, py) od odcinka (ax, ay)–(bx, by) */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

/** punkt w wielokącie (parzystość przecięć), jak pip w 0.3 */
export function pip(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}
