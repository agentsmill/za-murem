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
  /** Mieszkania zamieszkane i ludność w nich, wg epoki budowy (P4386). Okres nieznany nie wchodzi do żadnej epoki. */
  epoki: Record<Epoka, { mieszkania: number; osoby: number }>;
  /** Średni metraż mieszkania w epoce, m²: suma powierzchni użytkowej przez sumę mieszkań (P4386). */
  metraz: Record<Epoka, number>;
  /** Ludność rezydująca NSP 2021 (P4253): 5-latki 0-4 … 80-84, 85+ (18 grup), osobno mężczyźni i kobiety. */
  wiek2021: { M: number[]; K: number[] };
  /** Ludność na 31.12.2025 (P2137), te same 18 grup. */
  wiek2025: { M: number[]; K: number[] };
}
