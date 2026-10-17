/* Generator mieszkańców: jedno wejście dla gry i narzędzi. Budynek z mapy obsadzony na spis 2021 (spis.ts),
   postarzony do 2026 bez upadku i dalej do 2051 z upadkiem (czas.ts). Obszar to budynki mieszkalne z kwadratu 384 m
   wokół adresu. Każdy budynek ma własne ziarna, więc wynik budynku nie zależy od reszty obszaru, a obszar od
   kolejności. Bez gminy (`g = null`) generator bierze marginesy całej Polski (`k.polska`) i obszar „inne miasto”.
   Imiona i nazwiska dostają osoby tylko wtedy, gdy wywołujący poda tabele (`nazwy`, imiona.ts); bez nich zostają puste.
   Fach na 2051 (obecni od 16 lat) i dawny zawód (urodzeni do 2009) dostają osoby zawsze, po imionach, z ziarna
   `losDla('fachy', klucz budynku)` (fachy.ts); nie zależą od imion.
   Tabelę nazwisk dla gminy wybiera `nazwiskaDlaGminy` (R35), a wczytuje `wczytajNazwiskaDlaGminy` (wczytaj.ts). */

import type { Geo } from '../world/geo.ts';
import { budynkiZGeo, metryNaStopien } from './budynki.ts';
import { obszarGminy, postarz } from './czas.ts';
import { nadajFachy } from './fachy.ts';
import { nadajImiona } from './imiona.ts';
import { losDla } from './los.ts';
import { marginesyDla } from './rejon.ts';
import { obsadzBudynek } from './spis.ts';
import type { TabeleGminy, TabeleImion, TabeleKraju, TabeleNazwisk } from './tabele.ts';
import { type Budynek, type Osiedle, WERSJA_GENERATORA, type WynikBudynku } from './typy.ts';

/** Rok stanu osiedla: migawka gry (październik 2051), w silniku stan na 1 stycznia 2051 (czas.ts). */
export const ROK_GRY = 2051;
/** Pół boku kwadratu mapy gry (SIZE = 384 w src/world/world.ts), m. */
export const POL_KWADRATU = 192;

/** Tabele imion i nazwisk dla generatora (R36). Nazwiska jednego województwa, już po `bezPuliLokalnej`, gdy gminy
    nie znamy (`nazwiskaDlaGminy`). */
export interface Nazwy {
  imiona: TabeleImion;
  nazwiska: TabeleNazwisk;
}

/** Budynek w 2051: spis 2021 z marginesów rejonu budynku (bez gminy z marginesów Polski), krok 2021→2026 bez upadku
    i kroki 2026→2051 z dźwigniami upadku. Jedno `postarz` do 2051 daje to samo co 2026, a potem 2051 (kroki się
    składają, czas.ts). Budynek z `budynkiZGeo` ma już epokę i mieszkania; bez nich dopisze je `obsadzBudynek`.
    Z `nazwy` osoby dostają imiona i nazwiska (ziarno `losDla('imiona', klucz budynku)`); `postarz` zwraca świeże kopie
    osób, więc `nadajImiona` zmienia tylko wynik tej funkcji, nigdy `b` ani tabel. Reszta wyniku jest ta sama co bez
    nazw. Fachy i dawne zawody osoby dostają zawsze, z nazwami i bez nich (`nadajFachy`, ziarno
    `losDla('fachy', klucz budynku)`, po imionach). */
export function generujBudynek(b: Budynek, g: TabeleGminy | null, k: TabeleKraju, nazwy?: Nazwy): WynikBudynku {
  const spis = obsadzBudynek(b, g ? marginesyDla(g, b.rejon) : k.polska, g, k);
  const wynik = postarz(spis, ROK_GRY, k, obszarGminy(g), true);
  if (nazwy) nadajImiona(wynik, nazwy.imiona, nazwy.nazwiska, losDla('imiona', wynik.budynek.klucz));
  nadajFachy(wynik, losDla('fachy', wynik.budynek.klucz));
  return wynik;
}

/** Mieszkańcy obszaru gry w 2051: budynki mieszkalne z mapy (`budynkiZGeo`) w kolejności mapy, każdy przez
    `generujBudynek`. Na razie obszar to budynki, których środek obrysu leży w kwadracie 384 m wokół `geo.c`
    (|x| i |y| do 192 m w metrach mapy, bez obrotu), reguła R22. Środek liczymy z szerokości i długości budynku
    (5 miejsc po przecinku, około metra). To rozwiązanie tymczasowe: w kroku 5 generator weźmie listę budynków
    świata gry, która leży w obróconym kwadracie, więc kilka budynków przy brzegu się zmieni. */
export function generujObszar(geo: Geo, g: TabeleGminy | null, k: TabeleKraju, nazwy?: Nazwy): Osiedle {
  const [lat0, lon0] = geo.c;
  const { kx, ky } = metryNaStopien(lat0);
  const budynki: WynikBudynku[] = [];
  for (const b of budynkiZGeo(geo, g, k)) {
    const x = (b.lon - lon0) * kx;
    const y = (lat0 - b.lat) * ky;
    if (Math.abs(x) <= POL_KWADRATU && Math.abs(y) <= POL_KWADRATU) budynki.push(generujBudynek(b, g, k, nazwy));
  }
  return { wersja: WERSJA_GENERATORA, rok: ROK_GRY, teryt: g?.teryt ?? '', budynki };
}
