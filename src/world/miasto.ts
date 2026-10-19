/* Miejsca z `geo.poi` dla mapy miasta i wypraw (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Miejsca”).

   Miejsce to punkt sklepu albo usługi z OSM (`poi`), nie budynek: budynek z dwoma sklepami to dwa miejsca. Moduł to
   czyste funkcje danych: bez sieci, bez stanu, bez PixiJS i bez `src/gov`, więc działa w Node i w testach.

   Klucz miejsca „poi:X:Y” to globalny piksel punktu na poziomie 14 (4096 pikseli na kafelek, około 0,35 m), jak
   klucze budynków w klucze.ts. Punkt z kafelka leży w jednym kafelku, a jego piksel jest liczbą całkowitą (przy
   extent 4096), więc klucz nie zależy od tego, które kafelki gracz pobrał, ani od środka jego mapy: ten sam sklep ma
   ten sam klucz u każdego gracza w mieście. toGeoT (kafelki) liczy go z surowego punktu kafelka przed zaokrągleniem
   do 0,5 m, toGeo (Overpass) z szerokości i długości geograficznej zaokrąglonych do tej samej siatki pikseli; punkt
   z Overpass może wyjść o piksel obok (kafelki bywają uproszczone), wtedy zostaje dopasowanie po położeniu.
   Zapis i demo sprzed kluczy nie mają pola `k`: uzupelnijKlucze liczy je z położenia w metrach (z dokładnością do
   dwóch pikseli, bo położenie jest zaokrąglone do 0,5 m). Osiedla zapasowego (genProc, środek 0,0) nie ma sensu
   kluczować, bo nie ma prawdziwego położenia.

   Położenie (x, y) to metry od adresu jak w `geo` (x na wschód, y na południe), odległość to `Math.sqrt(x*x + y*y)`
   bez Math.hypot (deterministyczna w każdym silniku JS). Nazwę miejsca składa wywołujący (filtr imion
   `nazwaMiejsca` jest w src/mieszkancy, nie tutaj), kategoria `kat` to `GeoPoi.c` bez zmian. */

import type { Geo, GeoPoi } from './geo.ts';
import { type LatLon, pikselZ } from './klucze.ts';

/** promień mapy lokalnej w metrach: miejsca w tym kole są na mapie gry (chodzi się do nich), a nie celami wypraw */
export const PROMIEN_MAPY_LOKALNEJ = 192;

/** metry na stopień długości geograficznej na równiku i szerokości geograficznej, jak w geometrii gry (toGeoT, toGeo) */
const M_NA_STOPIEN = 111320;
const M_NA_STOPIEN_SZER = 110574;

/** Miejsce wyprawy: punkt sklepu albo usługi z OSM. */
export interface Miejsce {
  /** klucz „poi:X:Y”, wspólny dla wszystkich graczy */
  klucz: string;
  /** kategoria, `GeoPoi.c` (klucz w POICAT) */
  kat: string;
  /** metry od adresu: x na wschód, y na południe */
  x: number;
  y: number;
  /** odległość od adresu w metrach */
  odl: number;
  /** nazwa do pokazania (po filtrze nazw ustawionym przez wywołującego) */
  nazwa: string;
}

/** Klucz miejsca z globalnych pikseli z=14 (zaokrąglonych do całych): „poi:X:Y”. */
export function kluczPunktu(px: number, py: number): string {
  return `poi:${Math.round(px)}:${Math.round(py)}`;
}

/** Klucz z położenia w metrach od środka mapy c (szerokość, długość): odwrotność przeliczenia z toGeoT i toGeo.
    Dla punktów z zaokrągleniem do 0,5 m różni się od klucza z kafelków najwyżej o dwa piksele na oś. */
export function kluczZMetrow(c: LatLon, x: number, y: number): string {
  const [lat0, lon0] = c;
  const kx = M_NA_STOPIEN * Math.cos((lat0 * Math.PI) / 180);
  const [px, py] = pikselZ(lat0 - y / M_NA_STOPIEN_SZER, lon0 + x / kx);
  return kluczPunktu(px, py);
}

/** Dopisuje `k` punktom, które go nie mają (zapis i demo sprzed kluczy); istniejących kluczy nie rusza. */
export function uzupelnijKlucze(geo: Pick<Geo, 'c' | 'poi'>): void {
  for (const p of geo.poi) if (!p.k) p.k = kluczZMetrow(geo.c, p.x, p.y);
}

/** Miejsca z punktów `geo.poi`: tylko punkty z kluczem, bez powtórzeń klucza (zostaje pierwszy w kolejności wejścia),
    posortowane po odległości, a przy równej po kluczu. `nazwa` składa napis dla punktu; wejścia nie zmienia. */
export function miejscaZPoi(pois: readonly GeoPoi[], nazwa: (p: GeoPoi) => string): Miejsce[] {
  const widziane = new Set<string>();
  const out: Miejsce[] = [];
  for (const p of pois) {
    if (!p.k || widziane.has(p.k)) continue;
    widziane.add(p.k);
    out.push({ klucz: p.k, kat: p.c, x: p.x, y: p.y, odl: Math.sqrt(p.x * p.x + p.y * p.y), nazwa: nazwa(p) });
  }
  return out.sort((a, b) => a.odl - b.odl || (a.klucz < b.klucz ? -1 : a.klucz > b.klucz ? 1 : 0));
}

/** Czy miejsce leży na mapie lokalnej: w kole PROMIEN_MAPY_LOKALNEJ wokół adresu (brzeg wliczony). Porównanie
    kwadratów, bez pierwiastka, więc brzeg jest dokładny. */
export function naMapieLokalnej(m: Pick<Miejsce, 'x' | 'y'>): boolean {
  return m.x * m.x + m.y * m.y <= PROMIEN_MAPY_LOKALNEJ * PROMIEN_MAPY_LOKALNEJ;
}
