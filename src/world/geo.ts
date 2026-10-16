/* Geometria osiedla w metrach względem punktu adresu: x na wschód, y na południe.
   Ten sam format co w 0.3 (wynik toGeo z Overpass i toGeoT z kafelków). */

export type Pt = [number, number];

export interface GeoBuilding {
  /** obrys zewnętrzny, zamknięty (ostatni punkt = pierwszy) */
  p: Pt[];
  /** sklejone części budynku przeciętego granicą kafelków */
  pp?: Pt[][];
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
}
export interface Geo {
  c: [number, number];
  b: GeoBuilding[];
  r: GeoRoad[];
  a: GeoArea[];
  w: GeoWater[];
  poi: GeoPoi[];
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
