/* Wczytywanie tabel mieszkańców w grze. Pliki leżą w public/data/mieszkancy/, więc Vite serwuje je od korzenia
   strony; ścieżki są względne (`base: './'`), tak jak `demo/…` w src/world/load.ts. W Node (testy, boty) wywołujący
   podaje własny `fetchFn`, który czyta pliki z public/. */

import type { Odmiana } from './historie.ts';
import { bezPuliLokalnej, nazwiskaDlaGminy } from './imiona.ts';
import { type OdmianaPlik, rozpakujOdmiane, type TabelaKoncowek, type TabelaOdmiany } from './odmiana.ts';
import { rejonDla } from './rejon.ts';
import {
  type IndeksGmin,
  PLIK_WOJEWODZTWA,
  type TabeleGminy,
  type TabeleImion,
  type TabeleKraju,
  type TabeleNazwisk,
  WERSJA_TABEL,
} from './tabele.ts';

const KATALOG = 'data/mieszkancy/';

const obiekt = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Plik JSON z tabelami w wersji `WERSJA_TABEL` albo `null` z ostrzeżeniem w konsoli (`opis` otwiera komunikat):
    błąd sieci, status inny niż 200, odpowiedź niebędąca JSON-em i inna wersja. `cichy404` pomija ostrzeżenie przy 404,
    czyli przy tabelach, których może po prostu nie być. Nigdy nie rzuca. */
async function wczytajTabele<T>(
  adres: string,
  opis: string,
  fetchFn: typeof fetch,
  cichy404: boolean,
): Promise<T | null> {
  try {
    const odp = await fetchFn(adres);
    if (odp.status === 404 && cichy404) return null;
    if (!odp.ok) {
      console.warn(`${opis}: ${adres} odpowiada ${odp.status}`);
      return null;
    }
    const dane: unknown = await odp.json();
    if (!obiekt(dane) || dane.wersja !== WERSJA_TABEL) {
      console.warn(
        `${opis}: wersja ${obiekt(dane) ? String(dane.wersja) : 'nieznana'}, gra czyta wersję ${WERSJA_TABEL}`,
      );
      return null;
    }
    return dane as unknown as T;
  } catch (e) {
    console.warn(`${opis}: nie udało się wczytać ${adres}`, e);
    return null;
  }
}

/** Tabele gminy o kodzie TERYT (7 cyfr). `null`, gdy gminy nie ma wśród tabel (404), gdy nie da się pobrać albo
    odczytać pliku (błąd sieci, inny status, odpowiedź niebędąca JSON-em) i gdy wersja tabel jest inna niż
    `WERSJA_TABEL`. Nigdy nie rzuca: wtedy generator bierze szablon krajowy (`wczytajKraj`). Poza zwykłym 404
    każda porażka zostawia ostrzeżenie w konsoli. */
export async function wczytajGmine(teryt: string, fetchFn: typeof fetch = fetch): Promise<TabeleGminy | null> {
  if (!/^\d{7}$/.test(teryt)) return null;
  return wczytajTabele<TabeleGminy>(`${KATALOG}gminy/${teryt}.json`, `Tabele gminy ${teryt}`, fetchFn, true);
}

/** Tabele krajowe (trwanie życia, płodność, szablon gospodarstw, marginesy całej Polski). Rzuca wyjątek, gdy nie da
    się ich pobrać albo mają inną wersję: bez nich generator nie ma na czym pracować, nawet dla gminy bez tabeli. */
export async function wczytajKraj(fetchFn: typeof fetch = fetch): Promise<TabeleKraju> {
  const adres = `${KATALOG}kraj.json`;
  const odp = await fetchFn(adres);
  if (!odp.ok) throw new Error(`Tabele krajowe: ${adres} odpowiada ${odp.status}`);
  const dane: unknown = await odp.json();
  if (!obiekt(dane) || dane.wersja !== WERSJA_TABEL) {
    throw new Error(
      `Tabele krajowe: wersja ${obiekt(dane) ? String(dane.wersja) : 'nieznana'}, gra czyta wersję ${WERSJA_TABEL}`,
    );
  }
  return dane as unknown as TabeleKraju;
}

/** Tabele imion (rocznik → imiona, koszyki przed 2000 r., powracające, przyjezdni). Imiona są opcjonalne (generator
    bez nich zostawia osoby bez imion), więc każda porażka, także brak pliku, to `null` z ostrzeżeniem w konsoli. */
export async function wczytajImiona(fetchFn: typeof fetch = fetch): Promise<TabeleImion | null> {
  return wczytajTabele<TabeleImion>(`${KATALOG}imiona.json`, 'Tabele imion', fetchFn, false);
}

/** Tabele nazwisk województwa `woj` (nazwa małymi literami, jak `TabeleGminy.woj`). `null` z ostrzeżeniem, gdy
    województwo jest nieznane (bez zapytania do sieci) albo pliku nie da się wczytać. */
export async function wczytajNazwiska(woj: string, fetchFn: typeof fetch = fetch): Promise<TabeleNazwisk | null> {
  if (!Object.hasOwn(PLIK_WOJEWODZTWA, woj)) {
    console.warn(`Tabele nazwisk: nieznane województwo „${woj}”`);
    return null;
  }
  return wczytajTabele<TabeleNazwisk>(
    `${KATALOG}nazwiska/${PLIK_WOJEWODZTWA[woj]}.json`,
    `Tabele nazwisk ${woj}`,
    fetchFn,
    false,
  );
}

/** Nazwiska dla gminy (R35, `nazwiskaDlaGminy`): tabela jej województwa z losowaniem lokalnym, a bez tabel gminy
    tabela `mazowieckie` bez puli lokalnej (`bezPuliLokalnej`). `null`, gdy pliku nie da się wczytać. Wynik
    przekazujemy generatorowi jako `nazwy.nazwiska`; wołaj raz na adres, bo pule liczą się raz na obiekt tabeli. */
export async function wczytajNazwiskaDlaGminy(
  g: TabeleGminy | null,
  fetchFn: typeof fetch = fetch,
): Promise<TabeleNazwisk | null> {
  const { woj, lokalne } = nazwiskaDlaGminy(g);
  const t = await wczytajNazwiska(woj, fetchFn);
  return t && !lokalne ? bezPuliLokalnej(t) : t;
}

/** Słownik odmiany (odmiana.json z SGJP) rozpakowany do `TabelaOdmiany`. Odmiana jest opcjonalna (`odmien` bez słownika
    zgaduje), więc każda porażka, także brak pliku i uszkodzony plik, to `null` z ostrzeżeniem w konsoli. */
export async function wczytajOdmiane(fetchFn: typeof fetch = fetch): Promise<TabelaOdmiany | null> {
  const plik = await wczytajTabele<OdmianaPlik>(`${KATALOG}odmiana.json`, 'Tabele odmiany', fetchFn, false);
  if (!plik) return null;
  try {
    return rozpakujOdmiane(plik);
  } catch (e) {
    console.warn(`Tabele odmiany: uszkodzony plik ${KATALOG}odmiana.json`, e);
    return null;
  }
}

/** Tablica końcówek zgadywacza (odmiana-koncowki.json). `null` z ostrzeżeniem, gdy pliku nie da się wczytać. */
export async function wczytajKoncowki(fetchFn: typeof fetch = fetch): Promise<TabelaKoncowek | null> {
  return wczytajTabele<TabelaKoncowek>(`${KATALOG}odmiana-koncowki.json`, 'Tablica końcówek', fetchFn, false);
}

// ---------------------------------------------------------------- dane dla punktu

/** Indeks gmin (`gminy/indeks.json`). `null`, gdy go nie ma (404, bez ostrzeżenia: gra działa i bez niego, z szablonem
    krajowym) albo nie da się go odczytać (błąd sieci, inny status, odpowiedź niebędąca JSON-em, inna wersja, pole
    `gminy` niebędące tablicą; wtedy z ostrzeżeniem). Wpisy bez 7-cyfrowego TERYT i czterech liczb prostokąta są
    pomijane. Nigdy nie rzuca. */
export async function wczytajIndeksGmin(fetchFn: typeof fetch = fetch): Promise<IndeksGmin | null> {
  const indeks = await wczytajTabele<IndeksGmin>(`${KATALOG}gminy/indeks.json`, 'Indeks gmin', fetchFn, true);
  if (!indeks) return null;
  if (!Array.isArray(indeks.gminy)) {
    console.warn(`Indeks gmin: uszkodzony plik ${KATALOG}gminy/indeks.json`);
    return null;
  }
  const poprawny = (w: unknown): w is IndeksGmin['gminy'][number] =>
    obiekt(w) &&
    typeof w.teryt === 'string' &&
    /^\d{7}$/.test(w.teryt) &&
    Array.isArray(w.bbox) &&
    w.bbox.length === 4 &&
    w.bbox.every((x) => typeof x === 'number' && Number.isFinite(x));
  return { wersja: indeks.wersja, gminy: indeks.gminy.filter(poprawny) };
}

/** Wszystko, czego generator mieszkańców potrzebuje dla jednego punktu. `gmina` bywa `null` (szablon krajowy). */
export interface DaneMieszkancow {
  kraj: TabeleKraju;
  gmina: TabeleGminy | null;
  imiona: TabeleImion;
  nazwiska: TabeleNazwisk;
  odmiana: Odmiana;
}

/** Tabele gminy, w której leży punkt: pierwsza gmina z indeksu (kolejność indeksu, czyli po TERYT), której prostokąt
    zawiera punkt i której tabela istnieje, a `rejonDla` nie zwraca dla punktu zapasu `gmina` (czyli punkt leży
    w obrysie rejonu albo najwyżej 1 km od niego). Prostokąty sąsiednich gmin mogą na siebie zachodzić, stąd pętla
    po kandydatach. `null`, gdy żaden nie pasuje. */
async function gminaPunktu(
  lat: number,
  lon: number,
  indeks: IndeksGmin | null,
  fetchFn: typeof fetch,
): Promise<TabeleGminy | null> {
  if (!indeks) return null;
  for (const { teryt, bbox } of indeks.gminy) {
    if (lat < bbox[0] || lat > bbox[2] || lon < bbox[1] || lon > bbox[3]) continue;
    const g = await wczytajGmine(teryt, fetchFn);
    if (!g) continue;
    try {
      if (rejonDla(g, lat, lon).zapas !== 'gmina') return g;
    } catch (e) {
      console.warn(`Tabele gminy ${teryt}: nie da się ustalić rejonu`, e);
    }
  }
  return null;
}

/** Dane mieszkańców dla punktu `lat, lon` (adres gracza): tabele krajowe, imiona, odmiana (słownik i końcówki),
    indeks gmin, z niego tabela gminy punktu, na końcu nazwiska jej województwa (`wczytajNazwiskaDlaGminy`).
    Pierwsze pięć pobrań idzie równolegle. Zwraca `null`, gdy brakuje tabel krajowych, imion, któregokolwiek z dwóch
    plików odmiany albo nazwisk: generator bez nich nie ma na czym pracować, więc wywołujący zostaje przy
    dotychczasowych postaciach. Brak gminy to nie błąd (`gmina: null`, szablon krajowy). Nigdy nie rzuca, a każda
    porażka zostawia ostrzeżenie w konsoli (poza zwykłym 404 indeksu i gminy). */
export async function wczytajDaneMieszkancow(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<DaneMieszkancow | null> {
  try {
    const [kraj, imiona, tabelaOdmiany, koncowki, gmina] = await Promise.all([
      wczytajKraj(fetchFn).catch((e: unknown) => {
        console.warn('Tabele krajowe: nie udało się wczytać', e);
        return null;
      }),
      wczytajImiona(fetchFn),
      wczytajOdmiane(fetchFn),
      wczytajKoncowki(fetchFn),
      wczytajIndeksGmin(fetchFn).then((indeks) => gminaPunktu(lat, lon, indeks, fetchFn)),
    ]);
    if (!kraj || !imiona || !tabelaOdmiany || !koncowki) return null;
    const nazwiska = await wczytajNazwiskaDlaGminy(gmina, fetchFn);
    if (!nazwiska) return null;
    return { kraj, gmina, imiona, nazwiska, odmiana: { tabela: tabelaOdmiany, koncowki } };
  } catch (e) {
    console.warn('Dane mieszkańców: nie udało się wczytać', e);
    return null;
  }
}
