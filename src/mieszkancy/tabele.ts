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

/** Koszyki imion nadanych przed 2000 r.: rocznik osoby, dla której losujemy imię (patrz `TabeleImion.koszyki`). */
export const KOSZYKI_IMION = ['1920-1945', '1946-1959', '1960-1974', '1975-1989', '1990-1999'] as const;
export type KoszykImion = (typeof KOSZYKI_IMION)[number];

/** Imię i liczba (nadań albo żyjących osób, zależnie od tabeli), w kolejności malejącej. */
export type ImieZLiczba = [string, number];

/** Tabele imion: plik public/data/mieszkancy/imiona.json, wynik `npm run dane:imiona` z rejestru PESEL (dane.gov.pl,
    CC0). Imiona pisane po polsku, z wielkiej litery. Liczby całkowite, żeby losowanie szło tak samo w Node
    i w przeglądarce. */
export interface TabeleImion {
  wersja: number;
  /** Rok urodzenia 2000-2025 (klucz tekstowy) → 200 najczęściej nadanych pierwszych imion osobno dla chłopców (M)
      i dziewcząt (K), z liczbą nadań w tym roku. Próg: co najmniej 10 nadań w roku. Źródło: zbiór 219. */
  lata: Record<string, { M: ImieZLiczba[]; K: ImieZLiczba[] }>;
  /** Imiona osób urodzonych przed 2000 r., w pięciu koszykach według udziału zmarłych wśród osób z danym imieniem
      urodzonych przed 2000 r.: co najmniej 60% zmarłych to 1920-1945, 40-60% to 1946-1959, 20-40% to 1960-1974,
      5-20% to 1975-1989, poniżej 5% to 1990-1999. Liczba to osoby z tym imieniem urodzone przed 2000 r. i żyjące
      20.01.2026 (żyjący w rejestrze minus nadania 2000-2025). Siedem imion o dwóch falach mody (Zofia, Antoni,
      Julia, Jan, Stanisław, Helena, Franciszek) jest wpisanych ręcznie do koszyka 1920-1945 z liczbą pomniejszoną
      do części odpowiadającej udziałowi zmarłych. Imion z XXI wieku (nadań po 2000 r. ponad 10 razy więcej niż
      żyjących urodzonych wcześniej) i imion z mniej niż 5 000 żyjących w koszyku nie ma. */
  koszyki: Record<KoszykImion, { M: ImieZLiczba[]; K: ImieZLiczba[] }>;
  /** Imiona pradziadków (co najmniej 60% zmarłych wśród osób z imieniem urodzonych przed 2000 r. i co najmniej
      3 000 zmarłych, albo jedno z siedmiu dwufalowych), których udział wśród nadań w pierwszej połowie 2026 r. jest co
      najmniej 1,3 raza większy niż w 2019 r., przy co najmniej 100 nadaniach w 2025 r. i pierwszej połowie 2026 r.
      razem. Od najczęściej nadawanych. */
  powracajace: { M: string[]; K: string[] };
  /** Imiona osób z Ukrainy, Białorusi i Rosji w transliteracji (Oleksandr, Tetiana, Serhii, Yuliia…), których
      w rejestrze żyjących przybyło od lipca 2019 do stycznia 2026 co najmniej 5 000. Liczba to ten przyrost.
      Te imiona nie występują w `lata` ani w `koszykach`. */
  przyjezdni: { M: ImieZLiczba[]; K: ImieZLiczba[] };
}

/** Województwo (nazwa małymi literami, jak `TabeleGminy.woj`) → nazwa pliku bez rozszerzenia w
    public/data/mieszkancy/nazwiska/ (bez polskich liter). */
export const PLIK_WOJEWODZTWA: Record<string, string> = {
  dolnośląskie: 'dolnoslaskie',
  'kujawsko-pomorskie': 'kujawsko-pomorskie',
  lubelskie: 'lubelskie',
  lubuskie: 'lubuskie',
  łódzkie: 'lodzkie',
  małopolskie: 'malopolskie',
  mazowieckie: 'mazowieckie',
  opolskie: 'opolskie',
  podkarpackie: 'podkarpackie',
  podlaskie: 'podlaskie',
  pomorskie: 'pomorskie',
  śląskie: 'slaskie',
  świętokrzyskie: 'swietokrzyskie',
  'warmińsko-mazurskie': 'warminsko-mazurskie',
  wielkopolskie: 'wielkopolskie',
  zachodniopomorskie: 'zachodniopomorskie',
};

/** Tabela nazwisk jednego województwa: plik public/data/mieszkancy/nazwiska/<PLIK_WOJEWODZTWA>.json, wynik
    `npm run dane:imiona` z rejestru PESEL (nazwiska aktualne według województwa zameldowania na pobyt stały). Nazwisko
    to para form: męska i żeńska (Kowalski, Kowalska; Nowak, Nowak). Z puli wycięto nazwiska polityków
    (tools/dane/zakazane-nazwiska.txt) oraz nazwiska z mniej niż 300 nosicielami w kraju. */
export interface TabeleNazwisk {
  wersja: number;
  /** Nazwa województwa małymi literami, jak `TabeleGminy.woj`. */
  woj: string;
  /** 300 najczęstszych w województwie: [męskie, żeńskie, liczba mężczyzn z tym nazwiskiem w województwie]. Są wśród
      nich także nazwiska z `lokalne`, więc po losowaniu z puli lokalnej resztę trzeba losować z `ogolne` bez nich. */
  ogolne: [string, string, number][];
  /** Nazwiska lokalne: co najmniej połowa wszystkich nosicieli w kraju (według pliku województw, co najmniej 20 osób)
      mieszka w tym województwie, a w kraju jest ich co najmniej 300. Najwyżej 100, od najczęstszych, w tym samym
      układzie co `ogolne`. Pula bywa krótka albo pusta (lubuskie: 0, zachodniopomorskie: 1), gdy lokalne są same
      rzadkie nazwiska; wtedy losowanie z puli lokalnej trzeba pominąć. */
  lokalne: [string, string, number][];
  /** Odsetek mężczyzn w województwie z jakimkolwiek nazwiskiem lokalnym, na 10 000. Liczony po wszystkich takich
      nazwiskach z co najmniej 20 nosicielami (także rzadszych niż 300 w kraju i zakazanych), nie tylko po tych
      z puli `lokalne`. Dla kobiet wychodzi o ok. punkt procentowy mniej (pomorskie: 1 906). */
  udzialLokalnych: number;
}
