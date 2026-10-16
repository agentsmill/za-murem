/* Klasyfikacja budynków i nazwy, przeniesione z Sim.newGame w js/sim.js (0.3). */

import { type BuildingClass, CLS } from '../content/data.ts';
import type { GeoBuilding } from './geo.ts';

/** typ budynku z tagów OSM; kafelki wektorowe nie mają typu, więc zgadujemy po wysokości, powierzchni i punktach w środku */
export function classify(b: GeoBuilding, area: number, cats: readonly string[]): BuildingClass {
  const t = b.t.building;
  const am = b.t.amenity;
  if (b.t.guess) {
    const lv = Number.parseInt(b.t['building:levels'], 10) || 1;
    if (cats.includes('szkola')) return 'szkola';
    if (cats.includes('kosciol')) return 'kosciol';
    if ((lv >= 4 && area > 80) || (lv >= 3 && area > 250)) return 'blok';
    if (cats.includes('przychodnia')) return 'przychodnia';
    if (cats.length) return 'sklep';
    if (area > 400) return lv >= 2 ? 'blok' : 'hala';
    if (area < 40) return 'garaz';
    return 'dom';
  }
  if (['garage', 'garages', 'carport', 'shed'].includes(t)) return 'garaz';
  if (t === 'school' || t === 'kindergarten' || t === 'university' || am === 'school' || am === 'kindergarten')
    return 'szkola';
  if (t === 'church' || t === 'chapel' || am === 'place_of_worship') return 'kosciol';
  if (t === 'hospital' || ['clinic', 'doctors', 'hospital'].includes(am)) return 'przychodnia';
  if (['apartments', 'residential', 'dormitory'].includes(t)) return 'blok';
  if (['house', 'detached', 'semidetached_house', 'terrace', 'bungalow'].includes(t)) return 'dom';
  if (['retail', 'commercial', 'supermarket', 'kiosk', 'office'].includes(t) || b.t.shop || cats.length)
    return area > 150 || cats.length ? 'sklep' : 'inne';
  if (['industrial', 'warehouse', 'service', 'transformer_tower', 'roof', 'hangar'].includes(t)) return 'hala';
  if (area > 350) return 'blok';
  if (area < 45) return 'garaz';
  return 'inne';
}

/** liczba pięter: z tagu, a jak go nie ma albo jest bez sensu, to zgadujemy */
export function levelsOf(b: GeoBuilding, cls: BuildingClass, area: number): number {
  let levels = Number.parseInt(b.t['building:levels'], 10);
  if (!levels || levels > 30) levels = cls === 'blok' ? (area > 700 ? 10 : 5) : cls === 'dom' ? 2 : 1;
  return levels;
}

/** nazwa budynku jak w 0.3: nazwa z OSM, adres, numer, nazwa sklepu w środku albo kolejny numer typu */
export function nameOf(b: GeoBuilding, cls: BuildingClass, namedPoi: string | null, counter: number): string {
  const t = b.t;
  if (t.name) return t.name;
  if (t['addr:street'] && t['addr:housenumber']) return `${t['addr:street']} ${t['addr:housenumber']}`;
  if (t['addr:housenumber']) return `${CLS[cls]} nr ${t['addr:housenumber']}`;
  if (namedPoi) return namedPoi;
  return `${CLS[cls]} ${counter}`;
}
