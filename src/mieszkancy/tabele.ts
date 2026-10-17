/* Tabele gmin dla generatora mieszkańców: typy i stałe, bez logiki. Plik public/data/mieszkancy/gminy/<teryt>.json
   to jeden `TabeleGminy`, wynik narzędzia `npm run dane:gminy` z oficjalnych tablic GUS (NSP 2021, BDL). Gra
   czyta tylko te tabele, nigdy surowych plików. */

export const WERSJA_TABEL = 1;

/** Liczba osób w gospodarstwie domowym. */
export type Wielkosc = '1' | '2' | '3' | '4' | '5+';
/** Skład rodzinny: jednorodzinne, dwurodzinne, trzy i więcej rodzinne, nierodzinne jedno- i wieloosobowe. */
export type Sklad = 'jedno' | 'dwu' | 'trzy+' | 'nier1' | 'nier+';
/** Typ rodziny biologicznej: małżeństwa i związki niesformalizowane bez dzieci i z dziećmi, samotne matki i ojcowie. */
export type TypRodziny = 'malzBez' | 'malzZ' | 'zwBez' | 'zwZ' | 'matka' | 'ojciec';
export type GrupaWieku = '0-9' | '10-19' | '20-29' | '30-39' | '40-49' | '50-59' | '60-69' | '70-79' | '80+';

/** Rozkłady brzegowe jednego rejonu statystycznego (albo sumy gminy), w osobach, gospodarstwach i rodzinach. */
export interface Marginesy {
  gospodarstwa: Record<Wielkosc, number>;
  sklad: Record<Sklad, number>;
  rodziny: Record<TypRodziny, number>;
  /** Liczba dzieci w rodzinie. */
  dzieci: Record<'0' | '1' | '2' | '3' | '4+', number>;
  /** Płeć i wiek. Plik GUS ma osobno płeć i osobno 10-letnie grupy wieku, więc podział płci w grupach jest
      oszacowany (IPF z szablonu gminy), a sumy po płci i po grupach są dokładne. */
  wiek: { M: Record<GrupaWieku, number>; K: Record<GrupaWieku, number> };
}

/** Epoka budowy to okresy GUS z tablicy P4386 złożone w całości, bez dzielenia lat:
    przedwojenna = przed 1918 i 1918-1944; powojenna = 1945-1970; plyta = 1971-1978 i 1979-1988;
    transformacja = 1989-2002 i 2003-2011; nowa = 2012-2016 i 2017-2021 (z budynkami w budowie). */
export type Epoka = 'przedwojenna' | 'powojenna' | 'plyta' | 'transformacja' | 'nowa';

export interface TabeleGminy {
  wersja: number;
  /** 7 cyfr, jak w plikach NSP (dzielnica Warszawy ma własny kod, np. 1465138). */
  teryt: string;
  nazwa: string;
  /** Nazwa województwa małymi literami, jak w plikach PESEL. */
  woj: string;
  miejska: boolean;
  /** Klucz: 6-cyfrowy numer rejonu statystycznego (tekst, z zerami z przodu). */
  rejony: Record<string, Marginesy>;
  /** Rejon → pierścienie [lat, lon] z 5 miejscami po przecinku, uproszczone do 5 m; reguła parzystości (dziury). */
  obrysy: Record<string, [number, number][][]>;
  /** Suma rejonów, zapas dla punktów poza obrysami. */
  gmina: Marginesy;
  /** Mieszkania ogółem (P4386) i ludność w mieszkaniach zamieszkanych, wg epoki budowy. Mieszkania o nieznanym
      okresie budowy GUS liczy tylko w „ogółem”, więc nie wchodzą do żadnej epoki. */
  epoki: Record<Epoka, { mieszkania: number; osoby: number }>;
  /** Średni metraż mieszkania w epoce, m²: powierzchnia użytkowa mieszkań ogółem przez mieszkania ogółem (P4386). */
  metraz: Record<Epoka, number>;
  /** Ludność rezydująca NSP 2021 (P4253): 5-latki 0-4 … 80-84, 85+ (18 grup), osobno mężczyźni i kobiety. */
  wiek2021: { M: number[]; K: number[] };
  /** Ludność na 31.12.2025 (P2137), te same 18 grup. */
  wiek2025: { M: number[]; K: number[] };
}

/** Klucze tablic trwania życia: miasta, wieś i cała Polska, osobno mężczyźni (M) i kobiety (K). */
export type KluczQx = 'miastaM' | 'miastaK' | 'wiesM' | 'wiesK' | 'polskaM' | 'polskaK';

/** Tabele krajowe: plik public/data/mieszkancy/kraj.json, wynik `npm run dane:kraj`. Gra czyta tylko je, nigdy
    surowych plików. Same liczby całkowite (współczynniki na 100 000 albo na 10 000), żeby losowanie szło na
    całkowitych i wyszło tak samo w Node i w przeglądarce. */
export interface TabeleKraju {
  wersja: number;
  /** Prawdopodobieństwo zgonu w wieku x (0-100 lat, 101 wartości) na 100 000. GUS, Tablica A trwania życia 2025. */
  qx: Record<KluczQx, number[]>;
  /** Urodzenia na 10 000 kobiet rocznie w wieku 15-49 lat (35 wartości). Eurostat demo_frate, Polska 2024.
      Suma to TFR Eurostatu (1,14), nieco wyższy od TFR GUS 1,099, bo baza ludności jest inna. */
  plodnosc: number[];
  /** Mnożnik krzywej `plodnosc` na 10 000: TFR obszaru według GUS 2024 (miasta 100 tys.+ 1,000, miasta 1,069, wieś
      1,149) podzielony przez TFR samej krzywej (jej suma / 10 000, ok. 1,138). Dzięki temu krzywa x mnożnik / 10 000
      daje dokładnie TFR GUS danego obszaru. */
  mnoznikPlodnosci: { miasto100k: number; miasto: number; wies: number };
  /** Dzietność Polski (TFR) na 10 000 w latach 2021-2025, w skali GUS. 2024 (1,099) i 2025 (1,068) to GUS; 2021-2023
      to trend z Eurostatu (demo_find), czyli TFR Eurostatu w danym roku przez TFR Eurostatu w 2024, razy GUS 2024.
      Silnik mnoży krzywą `plodnosc` w roku r przez `tfrRoczny[r] / tfrRoczny['2024']`, a od 2026 bierze poziom
      z 2025 (czas.ts, `skalaPlodnosci`). */
  tfrRoczny: Record<string, number>;
  /** Udziały urodzeń według kolejności (pierwsze, drugie, trzecie, czwarte i dalsze) na 10 000, suma dokładnie
      10 000. GUS 2024 podaje 44,1 / 33,9 / 12,4 / 6,1% (razem 96,5%, reszta ma kolejność nieustaloną), więc tu są
      udziały wśród urodzeń o znanej kolejności, przeskalowane do 100%. */
  kolejnosc: [number, number, number, number];
  /** Liczba gospodarstw domowych w Polsce wg NSP 2021: klucz `${Wielkosc}|${Sklad}|${'60+' | 'bez60'}`, gdzie
      „60+” znaczy, że w gospodarstwie jest osoba w wieku 60 lat i więcej, a „bez60”, że nie ma żadnej. Bez kluczy
      o zerowej liczbie (np. nie ma rodziny w gospodarstwie jednoosobowym). Aneks „Rodziny w Polsce”, tabl. 4 i 5.
      To ziarno IPF, które skaluje się do marginesów rejonu, więc liczą się proporcje. */
  szablonGospodarstw: { miasta: Record<string, number>; wies: Record<string, number> };
  /** Gospodarstwa trzypokoleniowe (młodzi, w średnim wieku i starsi razem), na 10 000 gospodarstw. NSP 2021. */
  trojpokoleniowe: { miasta: number; wies: number };
  /** Cała Polska w formie marginesów rejonu, na zapas dla gminy bez własnej tabeli. Gospodarstwa, skład, rodziny
      i dzieci to sumy wszystkich rejonów NSP 2021; wiek to ludność na 31.12.2022 z prognozy GUS (ostatni rok
      empiryczny), 10-letnie grupy wieku, osobno mężczyźni i kobiety. */
  polska: Marginesy;
}
