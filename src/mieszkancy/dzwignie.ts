/* Liczby dla silnika 25 lat (czas.ts). `PRZEJSCIA` to świat bez upadku: szanse z danych (źródło przy liczbie, liczby
   z raportu „Dane do generatora mieszkańców” i notatek demografia_dynamika.md) albo decyzje generatora tam, gdzie
   danych nie ma. `DZWIGNIE` to upadek od 2029 roku: decyzje gry, nie dane, każda jedną liczbą do strojenia botem.
   Szanse są na 10 000 na krok 5-letni, mnożniki na 10 000 (×3 to 30 000, ×0,6 to 6 000). Same liczby całkowite. */

/** Szansa według wieku: pary [od wieku, szansa na 10 000], rosnąco. Wiek poniżej pierwszego progu ma szansę 0, a każdy
    próg obowiązuje do następnego. Wiek to `rok - rocznik` w roku zdarzenia. */
export type Progi = readonly (readonly [number, number])[];

export const PRZEJSCIA = {
  /** qx z Tablicy A trwania życia 2025 (GUS) spada o 1% rocznie: w roku r to qx × 0,99^(r - 2025), wstecz trochę
      wyżej. Decyzja planu: e(0) ma iść między ścieżką średnią a wysoką prognozy GUS 2023-2060. */
  rokTablicy: 2025,
  poprawaUmieralnosci: 9900,
  /** Kto w danym roku kończy tyle lat, umiera: tablica kończy się na 100 latach z qx około 31%. Decyzja generatora. */
  maxWiek: 110,
  /** Rok krzywej płodności (`k.plodnosc`, Eurostat 2024) i mnożników obszarów (TFR GUS 2024). W roku r krzywa idzie
      razy `k.tfrRoczny[r] / k.tfrRoczny['2024']`: lata 2021-2025 mają własną dzietność, od 2026 zostaje poziom 2025
      (1,068 wobec 1,099), a dźwignia urodzeń po upadku działa na to. Decyzja koordynatora R30. */
  rokPlodnosci: 2024,
  /** Chłopcy na 10 000 urodzeń: około 105 na 100 dziewczynek, zwykła proporcja płci przy urodzeniu. Decyzja
      generatora. */
  chlopcy: 5122,
  /** Wyprowadzka z domu rodziców od 25. roku życia, dalej w tym samym gospodarstwie co matka albo ojciec. Eurostat
      2025: z rodzicami mieszka 65,6% osób w wieku 25-29 i 51,0% w wieku 25-34 (ilc_lvps08), średni wiek wyprowadzki
      26,8 (yth_demo_030). Szanse dobrane na rejonie 182350 z Przymorza bez upadku: w 2051 z rodzicami mieszka tam
      62% osób w wieku 25-29, 32% w wieku 30-34 i 47% w wieku 25-34; reszta osób 25-34 to głównie przyjezdni
      i partnerzy z zewnątrz. Spis daje tam tylko 35% osób 25-34 z rodzicami, więc w 2026 jest ich około 31%.
      Po 45. roku życia dorosłe dziecko zostaje z rodzicem (decyzja generatora). */
  wyprowadzka: [
    [25, 2500],
    [35, 500],
    [45, 0],
  ] as Progi,
  /** Samotni w wieku 25-39 (bez partnera, który tu mieszka) tworzą parę z osobą z zewnątrz w podobnym wieku, ±3 lata.
      Danych nie badaliśmy (specyfikacja, rozdział 5); decyzja generatora. */
  zwiazek: [
    [25, 3000],
    [30, 2500],
    [35, 1500],
    [40, 0],
  ] as Progi,
  partnerRoznicaLat: 3,
  /** Mnożnik szansy na związek dla kogoś, kto mieszka z rodzicami: większość par zakłada dom gdzie indziej (to część
      wyprowadzki), więc partner wprowadza się do teściów rzadziej. Decyzja generatora. */
  zwiazekZRodzicami: 3000,
  /** Przeprowadzka poza obszar osób, które nie mieszkają z rodzicami, razem z partnerem i małoletnimi dziećmi.
      Intensywność migracji wewnętrznych 2024 (GUS, Rocznik Demograficzny 2025, migranci wg wieku przez ludność):
      25-34 lata około 13% w 5 lat, 35-39 około 9%, 40-49 około 5%, 50-64 około 3%, 65+ około 2%. Dzieci jadą
      z rodzicami. */
  przeprowadzka: [
    [20, 600],
    [25, 1300],
    [35, 900],
    [40, 500],
    [50, 300],
    [65, 200],
  ] as Progi,
  /** Emigracja z partnerem i małoletnimi dziećmi. Przepływy Eurostatu 2024 przez ludność (migr_emi2): około 5-6%
      w 5 lat w wieku 25-39, 3-4% w wieku 40-49, poniżej 1% po 60. Wiek 18-24 i 50-59 to decyzja generatora. */
  emigracja: [
    [18, 300],
    [25, 550],
    [40, 350],
    [50, 150],
    [60, 50],
  ] as Progi,
  /** Powrót na krok 5-letni: emigranci do 25% (górne przybliżenie z przyjazdów obywateli Polski, Eurostat
      migr_imm2ctz), bierzemy 20%; ci, co wyjechali w kraju, wracają do krewnych rzadko (decyzja generatora). Wraca
      osoba w wieku 18-74 lat do krewnego, który tu mieszka (rodzic, dziecko, rodzeństwo); emigrant bez krewnych zajmuje
      wolne mieszkanie. */
  powrot: { emigranci: 2000, kraj: 300, odWieku: 18, doWieku: 74 },
  /** Powrót do opieki: rodzic od tylu lat sam w mieszkaniu, dziecko z wyjazdu w wieku `powrot.odWieku`-`doWieku`.
      Córka ma wagę 3, syn 2: opiekują się częściej kobiety (EHIS 2019, 55-64 lata: kobiety 26,4%, mężczyźni 19,4%),
      a z zagranicy wracają częściej mężczyźni (CMR UW 2026). Szansa jest dźwignią (`DZWIGNIE.powrotOpieka`). */
  opieka: { odWieku: 75, corka: 3, syn: 2 },
  /** Przyjezdni do wolnego mieszkania: wagi składu [sam, para, para z dziećmi] w bloku i w domu, wiek głowy, wiek matki
      przy urodzeniu dzieci. Liczba dzieci to kolejność urodzenia najmłodszego, losowana z `kolejnosc` (GUS 2024).
      Decyzja generatora (w nowym bloku przyjezdni koło trzydziestki, specyfikacja, rozdział 4). */
  przyjezdni: {
    blok: [3500, 3000, 3500],
    dom: [1000, 3000, 6000],
    odWieku: 25,
    doWieku: 44,
    matkaOd: 20,
    matkaDo: 40,
    najmlodszeDo: 9,
  },
  /** Małoletni do tylu lat jadą z rodzicami, a sami w mieszkaniu wyjeżdżają do krewnych. */
  dorosly: 18,
  /** Dorosłe dzieci spoza domu (R28) dla każdej kobiety ze spisu od `odWieku` lat (wiek `2020 - rocznik`), tworzone
      raz przed pierwszym krokiem. Bezdzietność definitywna według rocznika matki (OECD Family Database SF2.5):
      10,7% dla 1960, 16,2% dla 1970, 19,9% dla 1975, między nimi liniowo, wcześniej i później stała. Liczba dzieci
      matki z kolejności urodzeń GUS 2024 (`k.kolejnosc`): matek z co najmniej n dziećmi jest tyle, ile urodzeń n-tych,
      więc jedno dziecko ma (o1 - o2) / o1 matek, dwoje (o2 - o3) / o1, troje (o3 - o4) / o1, czworo o4 / o1, średnio
      2,19; dla rocznika 1975 daje to 1,75 dziecka na kobietę wobec dzietności kohortowej 1,67 (OECD), o 5% za dużo,
      w granicach prostego modelu. Dzieci w gospodarstwie się liczą: matka z dzieckiem w domu ma co najmniej tyle
      dzieci, ile tu mieszka (losowanie tylko z liczb nie mniejszych), a reszta to dzieci spoza domu. Dziecko spoza
      domu ma co najmniej 18 lat, matka miała przy porodzie 18-42 lata, wyjechało w wieku 19-30 lat, najpóźniej
      w 2020 roku; emigrantów wśród nich 10% (decyzja generatora: 1,51 mln emigrantów, najwięcej w wieku 30-44 lat,
      GUS 2025). Ojciec to partner matki z gospodarstwa, jeśli jest. */
  dzieciSpozaDomu: {
    odWieku: 35,
    bezdzietnosc: [
      [1960, 1070],
      [1970, 1620],
      [1975, 1990],
    ] as Progi,
    matkaOd: 18,
    matkaDo: 42,
    wyjazdOd: 19,
    wyjazdDo: 30,
    emigranci: 1000,
  },
} as const;

/** Upadek: ustawienia od roku zero bakterii (2026), odkrycia około 2029 i rozpadu w latach trzydziestych i
    czterdziestych. Działają tylko przy `upadek = true` i nigdy w kroku 2021→2026. Każda liczba to decyzja gry, nie
    dane; strojone na demach tak, żeby w 2051 pustych było 40-60% mieszkań w blokach (rozstrzygnięcie z przeglądu:
    mocne wyludnienie, rodziny wracają do siebie). */
export const DZWIGNIE = {
  /** Fala powrotów: w latach 2029-2036 wszystkie powroty ×3, bo za granicą też zjadło kable, a z dużych miast ludzie
      jadą do rodzinnych domów. Decyzja gry, nie dane. */
  falaPowrotow: { od: 2029, do: 2036, mnoznik: 30000 },
  /** Emigracja od 2035 roku: zero, nie ma dokąd jechać. Decyzja gry, nie dane. */
  emigracjaPo2035: { od: 2035, mnoznik: 0 },
  /** Urodzenia w latach 2030-2035 ×0,6. Decyzja gry, nie dane. */
  urodzeniaSpadek: { od: 2030, do: 2035, mnoznik: 6000 },
  /** Umieralność osób od 75 lat w latach 2035-2045 ×1,3: zimno i brak leków. Decyzja gry, nie dane. */
  umieralnosc75: { od: 2035, do: 2045, odWieku: 75, mnoznik: 13000 },
  /** Umieralność przestaje spadać po tym roku: nie ma nowych leków. Decyzja gry, nie dane. */
  poprawaUmieralnosciDo: 2029,
  /** Szansa na krok, że do rodzica 75+, który mieszka sam, wraca dorosłe dziecko z wyjazdu: bez upadku 3 000, od 2029
      z upadkiem 6 000 (Mateusz: „jedno z dwojga dzieci wróciło opiekować się rodzicami”). Decyzja gry, nie dane. */
  powrotOpieka: { od: 2029, bezUpadku: 3000, upadek: 6000 },
  /** Od 2031 dorosłe dzieci rzadziej wyprowadzają się od rodziców: ×0,5, rodziny trzymają się razem. Decyzja gry,
      nie dane. */
  wyprowadzkaUpadek: { od: 2031, mnoznik: 5000 },
  /** Wolne mieszkanie zajmują w kroku przyjezdni z tą szansą. Bez upadku 7 500: pustych zostaje kilka procent, jak
      w spisie (gospodarstwa na mieszkania w Gdańsku 0,967). Od 2031 z upadkiem w bloku tylko 800, a dom z ogródkiem
      zajmują chętniej (4 000). Decyzja gry, nie dane. */
  zasiedlenie: { bezUpadku: 7500, od: 2031, blok: 800, dom: 4000 },
  /** Wyludnienie od 2031: szansa na krok, że całe gospodarstwo wyjeżdża na wieś po jedzenie. Z bloku 1 500, z domu
      z ogródkiem nikt. Razem z niskim zasiedleniem strojone tak, żeby w 2051 pustych było 40-60% mieszkań w blokach.
      Decyzja gry, nie dane. */
  wyludnienie: { od: 2031, blok: 1500, dom: 0 },
} as const;
