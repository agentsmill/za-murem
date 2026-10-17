/* Generator mieszkańców: jedno wejście dla gry i narzędzi. Budynek z mapy obsadzony na spis 2021 (spis.ts),
   postarzony do 2026 bez upadku i dalej do 2051 z upadkiem (czas.ts). Obszar to budynki mieszkalne z kwadratu 384 m
   wokół adresu. Każdy budynek ma własne ziarna, więc wynik budynku nie zależy od reszty obszaru, a obszar od
   kolejności. Bez gminy (`g = null`) generator bierze marginesy całej Polski (`k.polska`) i obszar „inne miasto”.
   Imiona i nazwiska dostają osoby tylko wtedy, gdy wywołujący poda tabele (`nazwy`, imiona.ts); bez nich zostają puste.
   Fach na 2051 (obecni od 16 lat) i dawny zawód (urodzeni do 2009) dostają osoby zawsze, po imionach, z ziarna
   `losDla('fachy', klucz budynku)` (fachy.ts); nie zależą od imion.
   Tabelę nazwisk dla gminy wybiera `nazwiskaDlaGminy` (R35), a wczytuje `wczytajNazwiskaDlaGminy` (wczytaj.ts).
   Historie gospodarstw (historie.ts) powstają tylko z tabelami odmiany i kroniką obszaru w `nazwy` (R49): kronikę liczy
   raz `generujObszar` (`kronikaObszaru`), a budynek osobno dostaje ją od wywołującego; bez odmiany albo kroniki pole
   `historia` zostaje puste. */

import type { Geo } from '../world/geo.ts';
import { budynkiZGeo, metryNaStopien } from './budynki.ts';
import { obszarGminy, postarz } from './czas.ts';
import { nadajFachy } from './fachy.ts';
import { historieBudynku, type Odmiana } from './historie.ts';
import { nadajImiona } from './imiona.ts';
import { kronika, type WpisKroniki, zbiorImion } from './kronika.ts';
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
    nie znamy (`nazwiskaDlaGminy`). Z odmianą (`wczytajOdmiane`, `wczytajKoncowki`) i kroniką obszaru gospodarstwa
    dostają historie (R49); `generujObszar` sam liczy kronikę, gdy jej nie ma. */
export interface Nazwy {
  imiona: TabeleImion;
  nazwiska: TabeleNazwisk;
  odmiana?: Odmiana;
  kronika?: WpisKroniki[];
}

/** Budynek w 2051: spis 2021 z marginesów rejonu budynku (bez gminy z marginesów Polski), krok 2021→2026 bez upadku
    i kroki 2026→2051 z dźwigniami upadku. Jedno `postarz` do 2051 daje to samo co 2026, a potem 2051 (kroki się
    składają, czas.ts). Budynek z `budynkiZGeo` ma już epokę i mieszkania; bez nich dopisze je `obsadzBudynek`.
    Z `nazwy` osoby dostają imiona i nazwiska (ziarno `losDla('imiona', klucz budynku)`); `postarz` zwraca świeże kopie
    osób, więc `nadajImiona` zmienia tylko wynik tej funkcji, nigdy `b` ani tabel. Reszta wyniku jest ta sama co bez
    nazw. Fachy i dawne zawody osoby dostają zawsze, z nazwami i bez nich (`nadajFachy`, ziarno
    `losDla('fachy', klucz budynku)`, po imionach). Z `nazwy.odmiana` i `nazwy.kronika` gospodarstwa dostają na końcu
    historie (`historieBudynku`, ziarno `losDla('historie', klucz budynku, id gospodarstwa)`); kronika to ta sama, którą
    dla obszaru liczy `kronikaObszaru`, więc budynek osobno jest taki sam jak w `generujObszar`. */
export function generujBudynek(b: Budynek, g: TabeleGminy | null, k: TabeleKraju, nazwy?: Nazwy): WynikBudynku {
  const spis = obsadzBudynek(b, g ? marginesyDla(g, b.rejon) : k.polska, g, k);
  const wynik = postarz(spis, ROK_GRY, k, obszarGminy(g), true);
  if (nazwy) nadajImiona(wynik, nazwy.imiona, nazwy.nazwiska, losDla('imiona', wynik.budynek.klucz));
  nadajFachy(wynik, losDla('fachy', wynik.budynek.klucz));
  if (nazwy?.odmiana && nazwy.kronika) historieBudynku(wynik, nazwy.kronika, nazwy.odmiana);
  return wynik;
}

/** Budynki mieszkalne obszaru gry (R22, opis przy `generujObszar`) w kolejności mapy, bez obsadzania. */
export function budynkiObszaru(geo: Geo, g: TabeleGminy | null, k: TabeleKraju): Budynek[] {
  const [lat0, lon0] = geo.c;
  const { kx, ky } = metryNaStopien(lat0);
  return budynkiZGeo(geo, g, k).filter((b) => {
    const x = (b.lon - lon0) * kx;
    const y = (lat0 - b.lat) * ky;
    return Math.abs(x) <= POL_KWADRATU && Math.abs(y) <= POL_KWADRATU;
  });
}

/** Kronika osiedla dla obszaru (R49): `kronika` z budynków obszaru (tło osiedla), z nazwami miejsc filtrowanymi zbiorem
    imion z tabel, z ziarnem z rejonu budynku, którego środek leży najbliżej `geo.c` (kwadrat odległości w metrach mapy,
    przy remisie pierwszy w kolejności). Bez budynków ziarno jest puste. */
export function kronikaObszaru(geo: Geo, budynki: readonly Budynek[], imiona: TabeleImion): WpisKroniki[] {
  const [lat0, lon0] = geo.c;
  const { kx, ky } = metryNaStopien(lat0);
  let ziarno = '';
  let najmniej = Number.POSITIVE_INFINITY;
  for (const b of budynki) {
    const x = (b.lon - lon0) * kx;
    const y = (lat0 - b.lat) * ky;
    if (x * x + y * y < najmniej) {
      najmniej = x * x + y * y;
      ziarno = b.rejon;
    }
  }
  return kronika(geo, budynki, zbiorImion(imiona), ziarno);
}

/** Mieszkańcy obszaru gry w 2051: budynki mieszkalne z mapy (`budynkiZGeo`) w kolejności mapy, każdy przez
    `generujBudynek`. Na razie obszar to budynki, których środek obrysu leży w kwadracie 384 m wokół `geo.c`
    (|x| i |y| do 192 m w metrach mapy, bez obrotu), reguła R22. Środek liczymy z szerokości i długości budynku
    (5 miejsc po przecinku, około metra). To rozwiązanie tymczasowe: w kroku 5 generator weźmie listę budynków
    świata gry, która leży w obróconym kwadracie, więc kilka budynków przy brzegu się zmieni. */
export function generujObszar(geo: Geo, g: TabeleGminy | null, k: TabeleKraju, nazwy?: Nazwy): Osiedle {
  const budynki = budynkiObszaru(geo, g, k);
  const zestaw =
    nazwy?.odmiana && !nazwy.kronika ? { ...nazwy, kronika: kronikaObszaru(geo, budynki, nazwy.imiona) } : nazwy;
  const wyniki: WynikBudynku[] = budynki.map((b) => generujBudynek(b, g, k, zestaw));
  return { wersja: WERSJA_GENERATORA, rok: ROK_GRY, teryt: g?.teryt ?? '', budynki: wyniki };
}
