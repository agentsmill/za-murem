/* Szablony historii gospodarstw: z nich `historie.ts` składa dwa, trzy zdania o każdym gospodarstwie z dziennika
   zdarzeń silnika (czas.ts), kroniki osiedla (kronika.ts), dawnych zawodów i fachów (fachy.ts). Ten plik to głównie
   tekst do przeczytania przez Mateusza: ton, satyra, lata. Logika wyboru jest w historie.ts.

   Sloty w tekście:
   - `{o:przypadek}` imię osoby głównej (`mian`, `dop`, `cel`, `bier`, `narz`, `msc`, `wol`), formy z `odmien`;
   - `{p:przypadek}` imię osoby powiązanej (krewny, partner);
   - `{k:przypadek}` kim jest osoba powiązana dla głównej („matka”, „ojcu”, „babci”), z tabeli `KREWNI`;
   - `{g:męska|żeńska}` forma po płci osoby głównej (`g` z src/content/people.ts), `{pg:męska|żeńska}` po płci powiązanej;
   - `{rodzina}` nazwisko rodziny w mianowniku liczby mnogiej („Kowalscy”, „Nowakowie”);
   - `{rok}` rok zdarzenia, `{wiek}` wiek osoby głównej z odmianą (`wiek` z people.ts: „1 rok”, „74 lata”);
   - `{dokad}` kierunek wyjazdu z silnika („do Niemiec”, „na przedmieścia”), `{skad}` ten sam kierunek jako powrót
     („z Niemiec”, „z przedmieść”, tabela `SKAD`);
   - `{miejsce}` nazwa prawdziwego miejsca z kroniki osiedla (`WpisKroniki.miejsce`, już po filtrze nazw), zawsze w
     mianowniku: w nawiasie po rzeczowniku kategorii („w aptece ({miejsce})”) albo po dwukropku;
   - `{zawod}` dawny zawód w formie płci („księgowa”), `{fach}` fach na 2051 („zielarka”), oba w mianowniku.
   Slotów `{k}`, `{pg}`, `{skad}`, `{wiek}`, `{zawod}` i `{fach}` nie ma w planie (brief zna `{o}`, `{p}`, `{g}`, `{rodzina}`,
   `{rok}`, `{dokad}`, `{miejsce}`); doszły, bo bez nich zdania o krewnych i powrotach nie dają się odmienić.
   Nieznany slot albo slot bez wartości w kontekście to wyjątek (`wypelnij`), więc literówkę w szablonie łapie test.

   Zasady tekstu: jedno zdanie na szablon, z kropką. Bez pauz i półpauz jako znaków przestankowych, bez numerów
   mieszkań i pięter (tylko klatka), bez zwracania się do gracza. Imiona tylko w formach z odmiany; gdy odmiana imienia
   jest niepewna, generator bierze szablon z imieniem w mianowniku (stąd szablony „{o:mian}: …”). Pierwsze `{o:mian}` na
   początku szablonu to zawsze podmiot zdania: gdy poprzednie zdanie historii też zaczynało się od tej osoby, generator
   je opuszcza („Wróciła z Wrocławia w 2031…”). Lata z lore: rok zero 2026 (nikt jeszcze nic nie wie, kable psują się
   „same”), odkrycie około 2029 (dopiero odtąd ktokolwiek mówi o bakterii), w latach trzydziestych i czterdziestych rozpad
   (gasną ulice, potem region, padają chmura i dolar), gra w 2051. Ton: sucha satyra na dzisiejszą technologię i ekologię
   oglądaną z 2051 roku, konkret z codzienności zamiast patosu. Dzisiejszy świat gracza to dla postaci „dawne czasy”.

   Warunki szablonu (pola `Szablon`) sprawdza historie.ts: okno lat zdarzenia (`od`, `do`), wiek osoby głównej w roku
   zdarzenia (`wiekOd`, `wiekDo`; dla dawnych czasów w 2026, dla stanu w 2051), pokrewieństwo osoby powiązanej (`kim`),
   rodzaj wyjazdu (`kierunek`) i kilka cech gospodarstwa i budynku (`blok`, `kondygnacjeOd`). Szablon bez danego pola
   nie stawia tego warunku. Szablon z `{zawod}` i `{fach}` nie pasuje, gdy oba brzmią tak samo. `motyw` to
   temat, który w jednej historii może wystąpić tylko raz (dwa zdania o samotności albo o przedłużaczach to za dużo). */

import { g, wiek } from '../content/people.ts';
import { type Formy, PRZYPADKI, type Przypadek } from './odmiana.ts';
import type { Osoba } from './typy.ts';

// ---------------------------------------------------------------- kontekst i sloty

/** Wartości slotów dla jednego zdania. Pola od `krewny` w dół to rozszerzenie planu (nagłówek pliku). */
export interface KontekstSzablonu {
  glowna: Osoba & { formy: Formy };
  powiazana?: Osoba & { formy: Formy };
  rodzina?: string;
  rok?: number;
  dokad?: string;
  miejsce?: string;
  /** Formy rzeczownika pokrewieństwa osoby powiązanej („matka”, „matki”…), `KREWNI`. */
  krewny?: Formy;
  skad?: string;
  wiek?: number;
  zawod?: string;
  fach?: string;
}

const SLOT = /\{([^{}]*)\}/g;
const SLOT_OSOBY = /^(o|p|k):(.*)$/;
const SLOT_PLCI = /^(g|pg):([^|]*)\|([^|]*)$/;
const SLOTY_PROSTE = new Set(['rodzina', 'rok', 'wiek', 'dokad', 'skad', 'miejsce', 'zawod', 'fach']);

/** Sprawdza zapis slotu i zwraca jego klucz: `o:dop`, `p:narz`, `k:msc`, `g`, `pg` albo nazwę prostego slotu. */
function kluczSlotu(s: string): string {
  const os = SLOT_OSOBY.exec(s);
  if (os) {
    if (!(PRZYPADKI as readonly string[]).includes(os[2])) throw new Error(`nieznany przypadek w slocie {${s}}`);
    return s;
  }
  const pl = SLOT_PLCI.exec(s);
  if (pl) return pl[1];
  if (SLOTY_PROSTE.has(s)) return s;
  throw new Error(`nieznany slot {${s}}`);
}

/** Klucze slotów szablonu w kolejności (`o:mian`, `g`, `rok`…). Nieznany slot albo niedomknięty nawias to wyjątek. */
export function slotySzablonu(tekst: string): string[] {
  const klucze = [...tekst.matchAll(SLOT)].map((m) => kluczSlotu(m[1]));
  if (/[{}]/.test(tekst.replace(SLOT, ''))) throw new Error(`niedomknięty slot w szablonie: ${tekst}`);
  return klucze;
}

function brak(s: string): never {
  throw new Error(`brak wartości dla slotu {${s}}`);
}

function wartosc(s: string, k: KontekstSzablonu): string {
  const os = SLOT_OSOBY.exec(s);
  if (os) {
    kluczSlotu(s);
    const formy = os[1] === 'o' ? k.glowna.formy : os[1] === 'p' ? k.powiazana?.formy : k.krewny;
    return formy ? formy[os[2] as Przypadek] : brak(s);
  }
  const pl = SLOT_PLCI.exec(s);
  if (pl) {
    const kto = pl[1] === 'g' ? k.glowna : k.powiazana;
    return kto ? g({ f: kto.plec === 'K' }, pl[2], pl[3]) : brak(s);
  }
  switch (s) {
    case 'rok':
      return k.rok === undefined ? brak(s) : String(k.rok);
    case 'wiek':
      return k.wiek === undefined ? brak(s) : wiek(k.wiek);
    case 'rodzina':
    case 'dokad':
    case 'skad':
    case 'miejsce':
    case 'zawod':
    case 'fach': {
      const v = k[s];
      return v ? v : brak(s);
    }
    default:
      return kluczSlotu(s);
  }
}

/** Wypełnia szablon wartościami z kontekstu. Nieznany slot, slot bez wartości i niedomknięty nawias to wyjątek.
    Wielkiej litery na początku zdania nie dodaje (robi to historie.ts). */
export function wypelnij(szablon: string, kontekst: KontekstSzablonu): string {
  slotySzablonu(szablon);
  return szablon.replace(SLOT, (_, s: string) => wartosc(s, kontekst));
}

// ---------------------------------------------------------------- krewni i kierunki

export type Krewny =
  | 'matka'
  | 'ojciec'
  | 'rodzice'
  | 'babcia'
  | 'dziadek'
  | 'syn'
  | 'corka'
  | 'wnuk'
  | 'wnuczka'
  | 'brat'
  | 'siostra'
  | 'maz'
  | 'zona';

const formy = (...f: string[]): Formy => Object.fromEntries(PRZYPADKI.map((p, i) => [p, f[i]])) as Formy;

/** Rzeczowniki pokrewieństwa w siedmiu przypadkach (M., D., C., B., N., Ms., W.); `rodzice` w liczbie mnogiej. */
export const KREWNI: Record<Krewny, Formy> = {
  matka: formy('matka', 'matki', 'matce', 'matkę', 'matką', 'matce', 'matko'),
  ojciec: formy('ojciec', 'ojca', 'ojcu', 'ojca', 'ojcem', 'ojcu', 'ojcze'),
  rodzice: formy('rodzice', 'rodziców', 'rodzicom', 'rodziców', 'rodzicami', 'rodzicach', 'rodzice'),
  babcia: formy('babcia', 'babci', 'babci', 'babcię', 'babcią', 'babci', 'babciu'),
  dziadek: formy('dziadek', 'dziadka', 'dziadkowi', 'dziadka', 'dziadkiem', 'dziadku', 'dziadku'),
  syn: formy('syn', 'syna', 'synowi', 'syna', 'synem', 'synu', 'synu'),
  corka: formy('córka', 'córki', 'córce', 'córkę', 'córką', 'córce', 'córko'),
  wnuk: formy('wnuk', 'wnuka', 'wnukowi', 'wnuka', 'wnukiem', 'wnuku', 'wnuku'),
  wnuczka: formy('wnuczka', 'wnuczki', 'wnuczce', 'wnuczkę', 'wnuczką', 'wnuczce', 'wnuczko'),
  brat: formy('brat', 'brata', 'bratu', 'brata', 'bratem', 'bracie', 'bracie'),
  siostra: formy('siostra', 'siostry', 'siostrze', 'siostrę', 'siostrą', 'siostrze', 'siostro'),
  maz: formy('mąż', 'męża', 'mężowi', 'męża', 'mężem', 'mężu', 'mężu'),
  zona: formy('żona', 'żony', 'żonie', 'żonę', 'żoną', 'żonie', 'żono'),
};

/** Kierunek wyjazdu z silnika (czas-dokad.ts, „do krewnych” z czas-stan.ts) jako miejsce, z którego się wraca. */
export const SKAD: Readonly<Record<string, string>> = {
  'do Warszawy': 'z Warszawy',
  'do Krakowa': 'z Krakowa',
  'do Wrocławia': 'z Wrocławia',
  'do Łodzi': 'z Łodzi',
  'do Poznania': 'z Poznania',
  'do Gdańska': 'z Gdańska',
  'do Wielkiej Brytanii': 'z Wielkiej Brytanii',
  'do Niemiec': 'z Niemiec',
  'do Holandii': 'z Holandii',
  'do Norwegii': 'z Norwegii',
  'do Irlandii': 'z Irlandii',
  'za granicę': 'zza granicy',
  'na inne osiedle': 'z innego osiedla',
  'na przedmieścia': 'z przedmieść',
  'do innego miasta': 'z innego miasta',
  'do pobliskiego miasta': 'z pobliskiego miasta',
  'do mniejszego miasta': 'z mniejszego miasta',
  'do sąsiedniej wsi': 'z sąsiedniej wsi',
  'na wieś pod miastem': 'ze wsi pod miastem',
  'na wieś do rodziny': 'od rodziny ze wsi',
  'do rodziny na wsi': 'od rodziny ze wsi',
  'w rodzinne strony': 'z rodzinnych stron',
  'na działkę za miastem': 'z działki za miastem',
  'do krewnych': 'od krewnych',
};

/** Rodzaj wyjazdu po kierunku: wyludnienie po upadku (pule `wyludnienie` w czas-dokad.ts), sieroty do krewnych,
    reszta to zwykła przeprowadzka w kraju albo emigracja (tę rozpoznaje typ wpisu). */
export type Kierunek = 'kraj' | 'wyludnienie' | 'krewni';
export const KIERUNKI_WYLUDNIENIA: ReadonlySet<string> = new Set([
  'na wieś do rodziny',
  'w rodzinne strony',
  'na działkę za miastem',
  'do rodziny na wsi',
]);

// ---------------------------------------------------------------- szablony

/** Typy wpisów dziennika, z których powstają zdania (bez `opuszczone`: opuszczone mieszkanie nie ma gospodarstwa). */
export const RODZAJE_ZDARZEN = [
  'przydzial',
  'wprowadzka',
  'urodzenie',
  'zgon',
  'wyprowadzka',
  'emigracja',
  'powrot',
  'powrotOpieka',
  'zwiazek',
  'owdowienie',
] as const;
export type RodzajZdarzenia = (typeof RODZAJE_ZDARZEN)[number];
/** `dawne`: dzisiejszy świat gracza oglądany z 2051; `kronika`: wspólne zdarzenie z kroniki osiedla (temat);
    `miejsce`: prawdziwe miejsce z kroniki (kategoria); `stan`: jak gospodarstwo żyje w 2051. */
export type RodzajSzablonu = RodzajZdarzenia | 'dawne' | 'kronika' | 'miejsce' | 'stan';
/** Dawny zawód: satyryczny („prompt engineer”), zwykły, emeryt albo nauka (student, uczeń), `dowolny` to każdy. */
export type RodzajZawodu = 'satyra' | 'zwykly' | 'emeryt' | 'nauka' | 'dowolny';

export interface Szablon {
  id: string;
  rodzaj: RodzajSzablonu;
  tekst: string;
  /** Okno lat zdarzenia (`{rok}`), włącznie. */
  od?: number;
  do?: number;
  /** Wiek osoby głównej w roku zdarzenia (dawne czasy: w 2026, stan: w 2051), włącznie. */
  wiekOd?: number;
  wiekDo?: number;
  /** Kim jest osoba powiązana dla głównej; szablon pasuje tylko do tych pokrewieństw. */
  kim?: readonly Krewny[];
  /** Zdarzenie bez osoby powiązanej (przydział na siebie, powrót do pustego mieszkania). */
  bezPowiazanej?: boolean;
  kierunek?: readonly Kierunek[];
  /** Powrót: osoba wyjeżdżała za granicę (`true`) albo w kraju (`false`). */
  emigrant?: boolean;
  /** Powrót: osoba wróciła razem z krewnym (`true`), a nie do krewnego (`false`). */
  towarzysz?: boolean;
  /** Osoba powiązana mieszka tu w 2051 (`true`) albo nie żyje (`false`). */
  zyje?: boolean;
  /** Powrót do opieki: rodzic ma też inne dzieci, które nie wróciły. */
  rodzenstwo?: boolean;
  /** Wprowadzka: przyszła cała rodzina, nie jedna osoba. */
  zRodzina?: boolean;
  /** Związek: osoba główna to partner, który się tu wprowadził. */
  przyjezdny?: boolean;
  /** Gospodarstwo w 2051: jedna osoba (`true`) albo więcej (`false`). */
  sam?: boolean;
  /** Stan: para bez nikogo więcej, trzy pokolenia, małoletnie dzieci osoby głównej, co najmniej cztery osoby. */
  para?: boolean;
  pokolenia?: boolean;
  dzieci?: boolean;
  ciasno?: boolean;
  /** Budynek to blok. */
  blok?: boolean;
  /** Budynek ma co najmniej tyle kondygnacji (windy są dopiero w wyższych blokach). */
  kondygnacjeOd?: number;
  zawod?: RodzajZawodu;
  /** Miejsce z kroniki: kategoria (klucze jak w kronika.ts). */
  kategoria?: readonly string[];
  /** Kronika: temat wpisu (`TEMATY_KRONIKI`). */
  temat?: string;
  /** Wyjazd albo powrót tylko z tych kierunków (`dokad` z silnika). */
  dokadTylko?: readonly string[];
  /** Szablon zapasowy (imię w mianowniku po dwukropku): wchodzi tylko wtedy, gdy żaden zwykły szablon zdarzenia nie
      pasuje, np. gdy odmiana imienia jest niepewna. */
  zapas?: boolean;
  /** Osoba główna mieszkała tu w roku zdarzenia (np. „a {o:mian} został w mieszkaniu”). */
  tuWtedy?: boolean;
  /** Owdowienie: od tamtej pory nikt do tej osoby nie dołączył ani ona nigdzie się nie przeniosła. */
  samotnie?: boolean;
  /** Szablon wymienia krewnego z imienia; wymagany, gdy w gospodarstwie mieszka ktoś o tym samym pokrewieństwie
      („brat Elizy zmarł”, a drugi brat mieszka z nią), bo bez imienia zdanie myli osoby. */
  imiennie?: boolean;
  motyw?: string;
}

type Opcje = Omit<Szablon, 'id' | 'rodzaj' | 'tekst'>;
const sz = (id: string, rodzaj: RodzajSzablonu, tekst: string, o: Opcje = {}): Szablon => ({ id, rodzaj, tekst, ...o });

const RODZICE: readonly Krewny[] = ['matka', 'ojciec'];
const DZIADKOWIE: readonly Krewny[] = ['babcia', 'dziadek'];
const DZIECI: readonly Krewny[] = ['syn', 'corka'];
const WNUKI: readonly Krewny[] = ['wnuk', 'wnuczka'];
const RODZENSTWO: readonly Krewny[] = ['brat', 'siostra'];
const MALZONKOWIE: readonly Krewny[] = ['maz', 'zona'];
const STARSI: readonly Krewny[] = [...RODZICE, ...DZIADKOWIE];
const ZMARLI: readonly Krewny[] = [...RODZICE, ...DZIADKOWIE, ...RODZENSTWO];
const WYJEZDNI: readonly Krewny[] = [...DZIECI, ...RODZENSTWO, ...WNUKI, ...RODZICE];
const DO_KOGO: readonly Krewny[] = [...RODZICE, ...DZIECI, ...RODZENSTWO, ...DZIADKOWIE, ...WNUKI];
const OBOJE: readonly Krewny[] = ['rodzice'];
const DUZE_MIASTA: readonly string[] = [
  'do Warszawy',
  'do Krakowa',
  'do Wrocławia',
  'do Łodzi',
  'do Poznania',
  'do Gdańska',
];

const PRZYDZIAL: readonly Szablon[] = [
  sz(
    'przydzial-po-dziadkach',
    'przydzial',
    '{o:mian} mieszka w mieszkaniu po {k:msc}, {pg:który|która} dostał{pg:|a} przydział w {rok}.',
    { kim: DZIADKOWIE },
  ),
  sz(
    'przydzial-meble',
    'przydzial',
    '{o:mian} mieszka tam, gdzie w {rok} {k:mian} {pg:wniósł|wniosła} pierwsze meble do mieszkania z przydziału.',
    { kim: RODZICE },
  ),
  sz(
    'przydzial-tapety',
    'przydzial',
    'Mieszkanie z przydziału dostał{pg:|a} w {rok} {k:mian} {o:dop} i od tamtej pory nikt nie zmienił w nim tapet.',
    { kim: STARSI },
  ),
  sz(
    'przydzial-teczka',
    'przydzial',
    '{o:mian} dostał{g:|a} przydział na to mieszkanie w {rok} i trzyma go w teczce, na wypadek gdyby spółdzielnia zapytała.',
    { bezPowiazanej: true },
  ),
  sz(
    'przydzial-zamek',
    'przydzial',
    '{o:mian} czekał{g:|a} na przydział kilka lat, a w {rok} dostał{g:|a} klucze i od razu wymienił{g:|a} zamek.',
    { bezPowiazanej: true },
  ),
  sz(
    'przydzial-malzonek',
    'przydzial',
    '{o:mian} mieszka w mieszkaniu, które w {rok} dostał{pg:|a} z przydziału {k:mian}, {p:mian}.',
    { kim: MALZONKOWIE },
  ),
];

const WPROWADZKA: readonly Szablon[] = [
  sz(
    'wprowadzka-aplikacja',
    'wprowadzka',
    '{rodzina} wprowadzili się w {rok}, jeszcze w dawnych czasach, i wynajęli mieszkanie przez aplikację.',
    { od: 2021, do: 2025, zRodzina: true },
  ),
  sz(
    'wprowadzka-przelew',
    'wprowadzka',
    '{o:mian} wprowadził{g:|a} się w {rok}, kiedy czynsz płaciło się jeszcze przelewem.',
    {
      od: 2021,
      do: 2028,
    },
  ),
  sz(
    'wprowadzka-awarie',
    'wprowadzka',
    '{o:mian} wprowadził{g:|a} się w {rok}, kiedy awarie kabli zwalano jeszcze na złodziei złomu.',
    { od: 2026, do: 2028 },
  ),
  sz(
    'wprowadzka-dyzury',
    'wprowadzka',
    'W {rok} spółdzielnia przydzieliła {o:cel} puste mieszkanie w zamian za dyżury przy piecu.',
    { od: 2031, do: 2050 },
  ),
  sz(
    'wprowadzka-meble',
    'wprowadzka',
    '{rodzina} zajęli puste mieszkanie w {rok}, a pierwszą zimę przetrwali dzięki meblom poprzednich lokatorów.',
    { od: 2031, do: 2050, zRodzina: true },
  ),
  sz(
    'wprowadzka-walizka',
    'wprowadzka',
    '{o:mian} {g:przyszedł|przyszła} na osiedle w {rok} z jedną walizką i został{g:|a} na dobre.',
    { od: 2029, do: 2046, zRodzina: false },
  ),
  sz(
    'wprowadzka-kropki',
    'wprowadzka',
    '{o:mian} wprowadził{g:|a} się w {rok}, kiedy wszyscy już wiedzieli, co zjada kable, ale nikt jeszcze w to nie wierzył.',
    { od: 2029, do: 2030 },
  ),
  sz(
    'wprowadzka-kartony',
    'wprowadzka',
    '{rodzina} wprowadzili się w {rok} z kartonami po zakupach z internetu i lodówką na abonament.',
    { od: 2021, do: 2030, zRodzina: true },
  ),
  sz(
    'wprowadzka-brama',
    'wprowadzka',
    '{o:mian} zamieszkał{g:|a} tu w {rok}, kiedy zwolniło się mieszkanie, i od progu {g:dostał|dostała} dyżur przy bramie.',
    { od: 2031, do: 2050 },
  ),
  sz('wprowadzka-z-rodzicem', 'wprowadzka', '{o:mian} wprowadził{g:|a} się tu w {rok} razem z {k:narz}.', {
    kim: RODZICE,
  }),
];

const URODZENIE: readonly Szablon[] = [
  sz(
    'urodzenie-chmura',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok}, jeszcze w dawnych czasach, i ma na to zdjęcia w chmurze, której już nie ma.',
    { od: 2021, do: 2025 },
  ),
  sz(
    'urodzenie-rok-zero',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok}, w roku zero, choć wtedy nikt jeszcze tak go nie nazywał.',
    { od: 2026, do: 2026 },
  ),
  sz(
    'urodzenie-zlodzieje',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok}, kiedy kable psuły się już wszędzie, a winę zwalano na złodziei złomu.',
    { od: 2027, do: 2028 },
  ),
  sz(
    'urodzenie-odkrycie',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok}, w roku, w którym wyszło na jaw, co zjada kable.',
    { od: 2029, do: 2029 },
  ),
  sz(
    'urodzenie-malo-dzieci',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok}, kiedy dzieci na osiedlu rodziło się mało, więc do dziś zna {g:go|ją} każdy sąsiad.',
    { od: 2030, do: 2035 },
  ),
  sz(
    'urodzenie-swieca',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok} w domu, przy świecy, bo do szpitala nie było czym dojechać.',
    { od: 2031, do: 2045 },
  ),
  sz(
    'urodzenie-telefon',
    'urodzenie',
    '{o:mian} urodził{g:|a} się w {rok} i działający telefon zna tylko z opowieści {k:dop}.',
    { od: 2036, do: 2050, kim: ['matka'] },
  ),
  sz(
    'urodzenie-piec',
    'urodzenie',
    '{o:mian} urodził{g:|a} się zimą {rok} i pierwszy rok przespał{g:|a} w kuchni, bo tam stał piec.',
    { od: 2036, do: 2050 },
  ),
];

const ZGON: readonly Szablon[] = [
  sz('zgon-szpital', 'zgon', '{k:mian} {o:dop} zmarł{pg:|a} w {rok}, jeszcze przed upadkiem, w szpitalu z prądem.', {
    od: 2021,
    do: 2030,
    kim: ZMARLI,
  }),
  sz(
    'zgon-zimno',
    'zgon',
    '{k:mian} {o:dop} zmarł{pg:|a} zimą {rok}, kiedy w mieszkaniach było tak zimno jak na klatce.',
    { od: 2035, do: 2045, kim: ZMARLI, blok: true, motyw: 'zima' },
  ),
  sz(
    'zgon-kurtka',
    'zgon',
    '{k:mian} {o:dop} zmarł{pg:|a} w {rok}, a {pg:jego|jej} kurtka do dziś wisi przy drzwiach, bo jest najcieplejsza w domu.',
    { od: 2031, do: 2050, kim: ZMARLI },
  ),
  sz(
    'zgon-pierwsze-zimy',
    'zgon',
    '{o:mian} stracił{g:|a} {k:bier} w {rok}, w jedną z pierwszych zim bez ogrzewania.',
    { od: 2035, do: 2038, kim: STARSI, wiekOd: 3, motyw: 'zima' },
  ),
  sz('zgon-leki', 'zgon', '{k:mian} {o:dop} zmarł{pg:|a} w {rok}, kiedy w przychodni skończyły się leki z importu.', {
    od: 2037,
    do: 2050,
    kim: ZMARLI,
    motyw: 'leki',
  }),
  sz(
    'zgon-zakwas',
    'zgon',
    'Po {k:msc}, {pg:który|która} zmarł{pg:|a} w {rok}, {o:mian} ma zeszyt z przepisami i trzy słoiki zakwasu.',
    { od: 2026, do: 2050, kim: STARSI },
  ),
  sz(
    'zgon-mianownik',
    'zgon',
    '{o:mian}: {k:mian} zmarł{pg:|a} w {rok}, a w domu zostało po {pg:nim|niej} radio na korbę.',
    {
      od: 2031,
      do: 2050,
      kim: ZMARLI,
      zapas: true,
    },
  ),
  sz('zgon-mianownik-dawniej', 'zgon', '{o:mian}: {k:mian} zmarł{pg:|a} w {rok}, kiedy szpitale miały jeszcze prąd.', {
    od: 2021,
    do: 2030,
    kim: ZMARLI,
    zapas: true,
  }),
  sz('zgon-mianownik-imiennie', 'zgon', '{o:mian}: {k:mian} {p:mian} zmarł{pg:|a} w {rok}.', {
    kim: ZMARLI,
    imiennie: true,
    zapas: true,
  }),
  sz(
    'zgon-imiennie-szpital',
    'zgon',
    '{k:mian} {o:dop}, {p:mian}, zmarł{pg:|a} w {rok}, jeszcze przed upadkiem, w szpitalu z prądem.',
    { od: 2021, do: 2030, kim: ZMARLI, imiennie: true },
  ),
  sz(
    'zgon-imiennie-kurtka',
    'zgon',
    '{k:mian} {o:dop}, {p:mian}, zmarł{pg:|a} w {rok}, a {pg:jego|jej} kurtka do dziś wisi przy drzwiach, bo jest najcieplejsza w domu.',
    { od: 2031, do: 2050, kim: ZMARLI, imiennie: true },
  ),
  sz(
    'zgon-imiennie',
    'zgon',
    '{k:mian} {o:dop}, {p:mian}, zmarł{pg:|a} w {rok} i zostawił{pg:|a} skrzynkę z narzędziami, której nikt nie umie otworzyć.',
    { kim: ZMARLI, imiennie: true },
  ),
];

const WYPROWADZKA: readonly Szablon[] = [
  sz(
    'wyprowadzka-odwiedziny',
    'wyprowadzka',
    '{k:mian} {o:dop} wyprowadził{pg:|a} się {dokad} w {rok} i odwiedza dom, kiedy da się przejść.',
    { kim: WYJEZDNI, kierunek: ['kraj'] },
  ),
  sz(
    'wyprowadzka-pociagi',
    'wyprowadzka',
    '{k:mian} {o:dop} wyprowadził{pg:|a} się {dokad} w {rok}, kiedy jeszcze jeździły pociągi.',
    { do: 2028, kim: WYJEZDNI, kierunek: ['kraj'] },
  ),
  sz(
    'wyprowadzka-po-jedzenie',
    'wyprowadzka',
    'W {rok} {k:mian} {o:dop} wyjechał{pg:|a} {dokad} po jedzenie i już nie wrócił{pg:|a}.',
    { kim: WYJEZDNI, kierunek: ['wyludnienie'] },
  ),
  sz(
    'wyprowadzka-generator',
    'wyprowadzka',
    '{k:mian} {o:dop} {pg:przeniósł|przeniosła} się {dokad} w {rok}, bo podobno tam mieli generator.',
    { od: 2031, do: 2050, kim: WYJEZDNI, kierunek: ['kraj'], motyw: 'generator' },
  ),
  sz(
    'wyprowadzka-rodzice',
    'wyprowadzka',
    'Rodzice {o:dop} wyprowadzili się {dokad} w {rok}, a {o:mian} został{g:|a} w mieszkaniu.',
    { kim: OBOJE, kierunek: ['kraj', 'wyludnienie'], tuWtedy: true },
  ),
  sz(
    'wyprowadzka-rodzice-jedzenie',
    'wyprowadzka',
    'W {rok} rodzice {o:dop} wyjechali {dokad} po jedzenie, a {o:mian} został{g:|a} pilnować mieszkania.',
    { kim: OBOJE, kierunek: ['wyludnienie'], tuWtedy: true },
  ),
  sz(
    'wyprowadzka-rodzice-znac',
    'wyprowadzka',
    'Rodzice {o:dop} wyprowadzili się {dokad} w {rok} i rzadko dają znać, co u nich.',
    { kim: OBOJE, kierunek: ['kraj', 'wyludnienie'] },
  ),
  sz('wyprowadzka-mianownik', 'wyprowadzka', '{o:mian}: {k:mian} wyprowadził{pg:|a} się {dokad} w {rok}.', {
    kim: WYJEZDNI,
    kierunek: ['kraj', 'wyludnienie'],
    zapas: true,
  }),
  sz(
    'wyprowadzka-mianownik-imiennie',
    'wyprowadzka',
    '{o:mian}: {k:mian} {p:mian} wyprowadził{pg:|a} się {dokad} w {rok}.',
    {
      kim: WYJEZDNI,
      kierunek: ['kraj', 'wyludnienie'],
      imiennie: true,
      zapas: true,
    },
  ),
  sz('wyprowadzka-mianownik-rodzice', 'wyprowadzka', '{o:mian}: rodzice wyprowadzili się {dokad} w {rok}.', {
    kim: OBOJE,
    kierunek: ['kraj', 'wyludnienie'],
    zapas: true,
  }),
  sz(
    'wyprowadzka-imiennie-pociagi',
    'wyprowadzka',
    '{k:mian} {o:dop}, {p:mian}, wyprowadził{pg:|a} się {dokad} w {rok}, kiedy jeszcze jeździły pociągi.',
    { do: 2028, kim: WYJEZDNI, kierunek: ['kraj'], imiennie: true },
  ),
  sz(
    'wyprowadzka-imiennie-generator',
    'wyprowadzka',
    '{k:mian} {o:dop}, {p:mian}, {pg:przeniósł|przeniosła} się {dokad} w {rok}, bo podobno tam mieli generator.',
    { od: 2031, do: 2050, kim: WYJEZDNI, kierunek: ['kraj'], imiennie: true, motyw: 'generator' },
  ),
  sz(
    'wyprowadzka-imiennie-jedzenie',
    'wyprowadzka',
    'W {rok} {k:mian} {o:dop}, {p:mian}, wyjechał{pg:|a} {dokad} po jedzenie i już nie wrócił{pg:|a}.',
    { kim: WYJEZDNI, kierunek: ['wyludnienie'], imiennie: true },
  ),
  sz(
    'wyprowadzka-imiennie',
    'wyprowadzka',
    '{k:mian} {o:dop}, {p:mian}, wyprowadził{pg:|a} się {dokad} w {rok}, a do domu wpada, kiedy tylko ktoś jedzie w tamtą stronę.',
    { kim: WYJEZDNI, kierunek: ['kraj', 'wyludnienie'], imiennie: true },
  ),
];

const EMIGRACJA: readonly Szablon[] = [
  sz(
    'emigracja-cisza',
    'emigracja',
    '{k:mian} {o:dop} wyjechał{pg:|a} {dokad} w {rok} i od lat nie przysłał{pg:|a} ani słowa.',
    { kim: WYJEZDNI },
  ),
  sz(
    'emigracja-telefony',
    'emigracja',
    '{k:mian} {o:dop} wyjechał{pg:|a} {dokad} w {rok}, a wiadomości przychodziły, dopóki działały telefony.',
    { do: 2028, kim: WYJEZDNI },
  ),
  sz(
    'emigracja-tam-dzialaly',
    'emigracja',
    'W {rok} {k:mian} {o:dop} wyjechał{pg:|a} {dokad}, bo podobno tam kable jeszcze działały.',
    { od: 2029, do: 2034, kim: WYJEZDNI },
  ),
  sz(
    'emigracja-pocztowka',
    'emigracja',
    '{o:mian} trzyma na półce pocztówkę od {k:dop}, {pg:który|która} w {rok} wyjechał{pg:|a} {dokad}.',
    { kim: WYJEZDNI },
  ),
  sz(
    'emigracja-dawno',
    'emigracja',
    '{k:mian} {o:dop} wyjechał{pg:|a} {dokad} jeszcze w {rok}, na długo przed upadkiem.',
    { do: 2020, kim: WYJEZDNI },
  ),
  sz(
    'emigracja-rodzice',
    'emigracja',
    'Rodzice {o:dop} wyjechali {dokad} w {rok}, a {o:mian} nie chciał{g:|a} jechać.',
    {
      kim: OBOJE,
      tuWtedy: true,
    },
  ),
  sz('emigracja-rodzice-sami', 'emigracja', 'Rodzice {o:dop} wyjechali {dokad} w {rok} i zostali tam na dobre.', {
    kim: OBOJE,
  }),
  sz('emigracja-mianownik', 'emigracja', '{o:mian}: {k:mian} wyjechał{pg:|a} {dokad} w {rok} i nie wrócił{pg:|a}.', {
    kim: WYJEZDNI,
    zapas: true,
  }),
  sz('emigracja-mianownik-imiennie', 'emigracja', '{o:mian}: {k:mian} {p:mian} wyjechał{pg:|a} {dokad} w {rok}.', {
    kim: WYJEZDNI,
    imiennie: true,
    zapas: true,
  }),
  sz('emigracja-mianownik-rodzice', 'emigracja', '{o:mian}: rodzice wyjechali {dokad} w {rok}.', {
    kim: OBOJE,
    zapas: true,
  }),
  sz(
    'emigracja-imiennie-telefony',
    'emigracja',
    '{k:mian} {o:dop}, {p:mian}, wyjechał{pg:|a} {dokad} w {rok}, a wiadomości przychodziły, dopóki działały telefony.',
    { do: 2028, kim: WYJEZDNI, imiennie: true },
  ),
  sz(
    'emigracja-imiennie-pocztowka',
    'emigracja',
    '{o:mian} trzyma na półce pocztówkę od {k:dop} {p:dop}, {pg:który|która} w {rok} wyjechał{pg:|a} {dokad}.',
    { kim: WYJEZDNI, imiennie: true },
  ),
  sz(
    'emigracja-imiennie',
    'emigracja',
    '{k:mian} {o:dop}, {p:mian}, wyjechał{pg:|a} {dokad} w {rok} i od lat nie daje znaku życia.',
    { kim: WYJEZDNI, imiennie: true },
  ),
];

const POWROT: readonly Szablon[] = [
  sz('powrot-tam-tez', 'powrot', '{o:mian} wrócił{g:|a} {skad} w {rok}, kiedy okazało się, że i tam coś zjada kable.', {
    od: 2029,
    do: 2036,
    emigrant: true,
    motyw: 'tam-tez',
  }),
  sz('powrot-do-krewnego', 'powrot', 'W {rok} {o:mian} wrócił{g:|a} {skad} do {k:dop}.', {
    kim: DO_KOGO,
    towarzysz: false,
  }),
  sz('powrot-razem', 'powrot', '{o:mian} wrócił{g:|a} {skad} w {rok} razem z {k:narz}.', {
    kim: RODZICE,
    towarzysz: true,
  }),
  sz(
    'powrot-puste',
    'powrot',
    '{o:mian} wrócił{g:|a} {skad} w {rok} i {g:zajął|zajęła} puste mieszkanie po sąsiadach.',
    { bezPowiazanej: true },
  ),
  sz('powrot-pieszo', 'powrot', '{o:mian} wrócił{g:|a} {skad} w {rok}, pieszo, z plecakiem i nasionami w słoiku.', {
    od: 2037,
    do: 2050,
    emigrant: false,
  }),
  sz(
    'powrot-czynsz',
    'powrot',
    '{o:mian} wrócił{g:|a} {skad} w {rok}, jeszcze przed upadkiem, bo tamtejszy czynsz pochłaniał całą pensję.',
    { od: 2021, do: 2028, emigrant: false },
  ),
  sz(
    'powrot-fala',
    'powrot',
    '{o:mian} wrócił{g:|a} {skad} w {rok}, kiedy z dużych miast wszyscy wracali do rodzinnych domów.',
    { od: 2029, do: 2036, emigrant: false, dokadTylko: DUZE_MIASTA },
  ),
  sz('powrot-osiedle', 'powrot', '{o:mian} wrócił{g:|a} na osiedle w {rok} i od tamtej pory nigdzie się nie rusza.', {
    zapas: true,
  }),
];

const POWROT_OPIEKA: readonly Szablon[] = [
  sz(
    'opieka-chodzenie',
    'powrotOpieka',
    '{o:mian} wrócił{g:|a} {skad} w {rok}, kiedy {k:mian} przestał{pg:|a} chodzić.',
    {
      kim: RODZICE,
    },
  ),
  sz(
    'opieka-na-tydzien',
    'powrotOpieka',
    'W {rok} {o:mian} przyjechał{g:|a} {skad} na tydzień do {k:dop} i został{g:|a} na dobre.',
    { kim: RODZICE },
  ),
  sz(
    'opieka-jedyne',
    'powrotOpieka',
    '{o:mian} jako jedyn{g:y|a} z rodzeństwa wrócił{g:|a} {skad}, żeby w {rok} zamieszkać z {k:narz}.',
    { kim: RODZICE, rodzenstwo: true },
  ),
  sz(
    'opieka-historie',
    'powrotOpieka',
    'Od {rok} {o:mian} opiekuje się {k:narz} i zna już na pamięć wszystkie {pg:jego|jej} historie z dawnych czasów.',
    { kim: RODZICE, zyje: true },
  ),
  sz(
    'opieka-po-smierci',
    'powrotOpieka',
    '{o:mian} wrócił{g:|a} {skad} w {rok}, żeby opiekować się {k:narz}, i został{g:|a} w mieszkaniu także po {pg:jego|jej} śmierci.',
    { kim: RODZICE, zyje: false },
  ),
  sz(
    'opieka-tam-tez',
    'powrotOpieka',
    'W {rok} {o:mian} wrócił{g:|a} {skad} do {k:dop}, bo i tam coś zjadało kable, a tu przynajmniej ktoś na {g:niego|nią} czekał.',
    { od: 2029, do: 2036, kim: RODZICE, motyw: 'tam-tez' },
  ),
  sz(
    'opieka-sam',
    'powrotOpieka',
    '{o:mian} wrócił{g:|a} w {rok}, gdy {k:mian} został{pg:|a} sam{pg:|a} w mieszkaniu.',
    {
      kim: RODZICE,
    },
  ),
  sz(
    'opieka-dziecko',
    'powrotOpieka',
    'W {rok} {k:mian} {o:dop} wrócił{pg:|a} {skad}, żeby się {g:nim|nią} opiekować.',
    {
      kim: DZIECI,
    },
  ),
  sz('opieka-mianownik', 'powrotOpieka', '{o:mian}: w {rok} wrócił{pg:|a} {skad} {k:mian}, żeby {g:mu|jej} pomagać.', {
    kim: DZIECI,
    zapas: true,
  }),
];

const ZWIAZEK: readonly Szablon[] = [
  sz(
    'zwiazek-aplikacja',
    'zwiazek',
    '{o:mian} poznał{g:|a} {p:bier} w {rok} przez aplikację randkową, która rok później zbankrutowała.',
    { od: 2021, do: 2028, przyjezdny: false },
  ),
  sz('zwiazek-woda', 'zwiazek', '{o:mian} poznał{g:|a} {p:bier} w {rok} w kolejce po wodę.', {
    od: 2031,
    do: 2050,
    przyjezdny: false,
  }),
  sz(
    'zwiazek-zebranie',
    'zwiazek',
    'W {rok} {o:mian} i {p:mian} zeszli się na zebraniu spółdzielni, przy jednej świecy.',
    { od: 2036, do: 2050, motyw: 'zebranie' },
  ),
  sz('zwiazek-kubek', 'zwiazek', '{o:mian} wprowadził{g:|a} się do {p:dop} w {rok} z jedną torbą i własnym kubkiem.', {
    przyjezdny: true,
  }),
  sz('zwiazek-mieszka', 'zwiazek', 'Od {rok} {o:mian} mieszka z {p:narz}.', { zyje: true }),
  sz(
    'zwiazek-generator',
    'zwiazek',
    '{o:mian} związał{g:|a} się z {p:narz} w {rok}, kiedy wszyscy na osiedlu szukali kogoś z generatorem.',
    { od: 2029, do: 2035, przyjezdny: false, motyw: 'generator' },
  ),
  sz('zwiazek-mianownik', 'zwiazek', '{o:mian} i {p:mian} są razem od {rok}.', { zyje: true }),
];

const OWDOWIENIE: readonly Szablon[] = [
  sz('owdowienie-sama', 'owdowienie', '{o:mian} owdowiał{g:|a} w {rok} i od tamtej pory mieszka sam{g:|a}.', {
    sam: true,
    samotnie: true,
    motyw: 'sam',
  }),
  sz('owdowienie-obraczka', 'owdowienie', '{o:mian} owdowiał{g:|a} w {rok}, a obrączkę nosi do dziś na sznurku.'),
  sz(
    'owdowienie-kartka',
    'owdowienie',
    '{k:mian} {o:dop}, {p:mian}, zmarł{pg:|a} w {rok}, a na drzwiach do dziś wisi {pg:jego|jej} kartka z dyżurami.',
    { od: 2036, do: 2050, kim: MALZONKOWIE },
  ),
  sz(
    'owdowienie-zanim',
    'owdowienie',
    '{o:mian} owdowiał{g:|a} w {rok}, jeszcze zanim ktokolwiek wiedział, co psuje kable.',
    { od: 2026, do: 2028 },
  ),
  sz(
    'owdowienie-zima',
    'owdowienie',
    '{p:mian}, {k:mian} {o:dop}, nie przeżył{pg:|a} zimy {rok}, kiedy w przychodni skończyły się leki.',
    { od: 2035, do: 2045, kim: MALZONKOWIE, motyw: 'leki' },
  ),
  sz(
    'owdowienie-lozko',
    'owdowienie',
    'Po śmierci {k:dop} w {rok} {o:mian} {g:przeniósł|przeniosła} łóżko do kuchni, bo tam jest najcieplej.',
    { od: 2031, do: 2050, kim: MALZONKOWIE },
  ),
  sz('owdowienie-gwar', 'owdowienie', '{o:mian} owdowiał{g:|a} w {rok}, ale w mieszkaniu nigdy nie jest cicho.', {
    sam: false,
  }),
];

/** Dawne czasy: dzisiejszy świat gracza, czyli dla postaci przeszłość sprzed roku zero. `wiekOd`/`wiekDo` to wiek
    w 2026; szablony z `{miejsce}` biorą nazwane miejsce z kroniki osiedla („sklep z mapy”). */
const DAWNE: readonly Szablon[] = [
  sz(
    'dawne-hulajnoga',
    'dawne',
    'W dawnych czasach {o:mian} jeździł{g:|a} do pracy hulajnogą na minuty i płacił{g:|a} także za minuty na czerwonym świetle.',
    { wiekOd: 18, motyw: 'hulajnoga' },
  ),
  sz(
    'dawne-paczkomat',
    'dawne',
    '{o:mian} do dziś pamięta kod do paczkomatu, w którym w roku zero utknęła {g:jego|jej} paczka.',
    { wiekOd: 14, motyw: 'paczkomat' },
  ),
  sz(
    'dawne-lodowka',
    'dawne',
    'W dawnych czasach {o:mian} miał{g:|a} lodówkę na abonament i do dziś nie wie, czy ostatnia rata doszła.',
    { wiekOd: 22, motyw: 'lodowka' },
  ),
  sz(
    'dawne-dostawa',
    'dawne',
    'Z dawnych czasów {o:mian} pamięta, że jedzenie przyjeżdżało pod drzwi w pół godziny, a kierowca miał ocenę w gwiazdkach.',
    { wiekOd: 12, motyw: 'dostawa' },
  ),
  sz('dawne-zegarek', 'dawne', '{o:mian} miał{g:|a} kiedyś zegarek, który liczył kroki i przypominał o oddychaniu.', {
    wiekOd: 16,
  }),
  sz(
    'dawne-segregacja',
    'dawne',
    'W dawnych czasach {o:mian} segregował{g:|a} śmieci na pięć kolorów, a dziś śmieci prawie nie ma, bo wszystko się do czegoś przydaje.',
    { wiekOd: 12 },
  ),
  sz(
    'dawne-ladowanie',
    'dawne',
    '{o:mian} pamięta, że telefon ładowało się dwa razy dziennie i nikt nie widział w tym problemu.',
    { wiekOd: 6, motyw: 'telefon' },
  ),
  sz(
    'dawne-tablet',
    'dawne',
    '{o:mian} pamięta z dzieciństwa bajki na tablecie, który sam się wyłączał, kiedy kończył się abonament.',
    { wiekOd: 4, wiekDo: 14, motyw: 'telefon' },
  ),
  sz(
    'dawne-aplikacje',
    'dawne',
    'Za dawnych czasów {o:mian} miał{g:|a} osiem aplikacji do oszczędzania prądu i ani jednej świeczki.',
    { wiekOd: 18 },
  ),
  sz(
    'dawne-kawa',
    'dawne',
    'W dawnych czasach {o:mian} zamawiał{g:|a} kawę przez aplikację, żeby nie stać w kolejce, a dziś stoi w kolejce po wodę i traktuje to jak spotkanie towarzyskie.',
    { wiekOd: 16 },
  ),
  sz(
    'dawne-ulubione',
    'dawne',
    'Na mapie w telefonie {o:mian} miał{g:|a} kiedyś jedno miejsce z okolicy oznaczone jako ulubione: {miejsce}.',
    { wiekOd: 14, motyw: 'miejsce' },
  ),
  sz(
    'dawne-droga',
    'dawne',
    'Drogę na osiedlu {o:mian} do dziś tłumaczy od jednego punktu z dawnych czasów: {miejsce}.',
    { wiekOd: 8, motyw: 'miejsce' },
  ),
  sz(
    'dawne-karta',
    'dawne',
    '{o:mian} trzyma w szufladzie kartę lojalnościową z dawnych czasów, z punktami, których nikt już nie wymieni.',
    { wiekOd: 16 },
  ),
  sz(
    'dawne-kredyt-weglowy',
    'dawne',
    'W dawnych czasach {o:mian} kupił{g:|a} kredyt węglowy za las, którego nikt nigdy nie widział.',
    { wiekOd: 25 },
  ),
  sz(
    'dawne-ekologia',
    'dawne',
    '{o:mian} pamięta, że w roku zero każda firma była ekologiczna, a najbardziej ta, która zrobiła bakterię.',
    { wiekOd: 16 },
  ),
  sz(
    'dawne-pogoda',
    'dawne',
    '{o:mian} pamięta czasy, kiedy prognozę pogody sprawdzało się w telefonie, a nie w kolanie.',
    { wiekOd: 40, motyw: 'telefon' },
  ),
  sz(
    'dawne-zawod-satyra',
    'dawne',
    'W dawnych czasach {o:mian} pracował{g:|a} jako {zawod} i do dziś nikt na osiedlu nie umie powtórzyć, na czym to polegało.',
    { zawod: 'satyra', motyw: 'zawod' },
  ),
  sz(
    'dawne-zawod-nadgodziny',
    'dawne',
    'Przed upadkiem {o:mian} pracował{g:|a} jako {zawod} i miał{g:|a} w telefonie aplikację, która liczyła nadgodziny.',
    { zawod: 'zwykly', motyw: 'zawod' },
  ),
  sz(
    'dawne-emerytura',
    'dawne',
    'W roku zero {o:mian} był{g:|a} już na emeryturze i jako jedyn{g:y|a} w rodzinie nie musiał{g:|a} się przekwalifikować.',
    { zawod: 'emeryt', motyw: 'zawod' },
  ),
  sz(
    'dawne-z-opowiesci',
    'dawne',
    '{o:mian} zna dawne czasy tylko z opowieści i nie wierzy, że za jazdę hulajnogą płaciło się od minuty.',
    { wiekDo: 5, motyw: 'hulajnoga' },
  ),
  sz(
    'dawne-za-maly',
    'dawne',
    '{o:mian} był{g:|a} za mał{g:y|a}, żeby pamiętać dawne czasy, ale zna je z opowieści o jedzeniu, które przyjeżdżało samo.',
    { wiekOd: 0, wiekDo: 5, motyw: 'dostawa' },
  ),
];

/** Tematy wpisów kroniki bez miejsca: wzorzec tekstu wpisu z kronika.ts (KABLE, OGOLNE) i temat szablonów niżej.
    Test pilnuje, że każdy wpis o kablach i prądzie z kroniki dem ma temat, więc zmiana tekstu w kronice nie przejdzie
    po cichu. */
export const TEMATY_KRONIKI: readonly (readonly [string, RegExp])[] = [
  ['awarie', /dziwne awarie kabli/],
  ['kropki', /połączył kropki/],
  ['latarnie', /latarnie zgasły|prąd zniknął tu na stałe/],
  ['nalot', /zielonkawy nalot/i],
  ['region', /Sieć energetyczna regionu padła/],
  ['zima', /pierwsza zima bez ogrzewania/i],
  ['windy', /Windy w blokach stanęły/],
  ['paczkomat', /Ostatni paczkomat/],
  ['lodowki', /Lodówki na abonament/],
  ['hulajnogi', /hulajnogi na minuty/],
  ['dolar', /Dolar przeszedł na abonament/],
  ['chmura', /Padła chmura/],
  ['autobus', /Ostatni autobus/],
  ['zebranie', /Zebranie spółdzielców po raz pierwszy/],
  ['piece', /Domy jednorodzinne przeszły na piece/],
  ['plyta', /Wielka płyta/],
  ['inteligentny', /bloki z inteligentnym domem/],
  ['domofony', /inteligentne domofony/],
  ['gmina', /Gmina przysłała ostatnie pismo/],
  ['zarzad', /Zarząd spółdzielni przejął obowiązki/],
  ['fundusz', /fundusz remontowy/],
  ['prezydent', /dziesiątą kadencję/],
  ['korek', /stanął tu korek/],
  ['piwnice', /Piwnice przestały być komórkami/],
  ['chwasty', /chwasty wyrosły/],
];

/** Wspólne zdarzenia z kroniki osiedla: `{rok}` to rok wpisu kroniki, `{wiek}` wiek osoby w tym roku. */
const KRONIKA: readonly Szablon[] = [
  sz(
    'kronika-awarie',
    'kronika',
    'W {rok}, kiedy na osiedlu zaczęły się dziwne awarie kabli, {o:mian} {g:wezwał|wezwała} elektryka i czekał{g:|a} na niego trzy tygodnie.',
    { temat: 'awarie', od: 2026, wiekOd: 18 },
  ),
  sz(
    'kronika-kropki',
    'kronika',
    'W {rok}, kiedy wyszło na jaw, co zjada kable, {o:mian} wyrzucił{g:|a} wszystkie przedłużacze za drzwi, jakby to coś dawało.',
    { temat: 'kropki', wiekOd: 12, od: 2029, motyw: 'przedluzacz' },
  ),
  sz(
    'kronika-latarnie',
    'kronika',
    'Kiedy w {rok} na ulicy zgasły latarnie, {o:mian} miał{g:|a} {wiek} i bał{g:|a} się chodzić po zmroku tylko przez pierwszy tydzień.',
    { temat: 'latarnie', wiekOd: 4 },
  ),
  sz(
    'kronika-swieczka',
    'kronika',
    '{o:mian} pamięta rok {rok}, kiedy prąd zniknął z ulicy, a sąsiedzi pierwszy raz zapukali do siebie po świeczkę.',
    { temat: 'latarnie', wiekOd: 16 },
  ),
  sz(
    'kronika-nalot',
    'kronika',
    'Od {rok}, kiedy w piwnicy pojawił się zielonkawy nalot na kablach, {o:mian} myje buty po każdym zejściu na dół.',
    { temat: 'nalot', wiekOd: 10, od: 2029 },
  ),
  sz(
    'kronika-region',
    'kronika',
    'Kiedy w {rok} padła sieć całego regionu, {o:mian} miał{g:|a} {wiek} i myślał{g:|a}, że to na tydzień.',
    { temat: 'region', wiekOd: 6 },
  ),
  sz('kronika-zima', 'kronika', 'Pierwszą zimę bez ogrzewania, w {rok}, {o:mian} przespał{g:|a} w kurtce i czapce.', {
    temat: 'zima',
    wiekOd: 4,
    motyw: 'zima',
  }),
  sz('kronika-windy', 'kronika', 'Od {rok}, kiedy stanęły windy, {o:mian} zna na pamięć liczbę schodów na klatce.', {
    temat: 'windy',
    wiekOd: 8,
    blok: true,
  }),
  sz(
    'kronika-paczkomat',
    'kronika',
    '{o:mian} był{g:|a} przy tym, jak w {rok} otwierano łomem ostatni paczkomat, i do dziś twierdzi, że ten przedłużacz był {g:jego|jej}.',
    { temat: 'paczkomat', wiekOd: 12, motyw: 'przedluzacz' },
  ),
  sz(
    'kronika-lodowki',
    'kronika',
    'W {rok}, kiedy lodówki na abonament przestały chłodzić, {o:mian} {g:zniósł|zniosła} mięso do piwnicy i od tamtej pory nie ufa abonamentom.',
    { temat: 'lodowki', wiekOd: 16, motyw: 'lodowka' },
  ),
  sz(
    'kronika-hulajnogi',
    'kronika',
    '{o:mian} pamięta rok {rok}, kiedy z chodników zniknęły hulajnogi na minuty i nagle dało się przejść.',
    { temat: 'hulajnogi', wiekOd: 8, motyw: 'hulajnoga' },
  ),
  sz(
    'kronika-dolar',
    'kronika',
    'W {rok}, kiedy dolar przeszedł na abonament, {o:mian} zapłacił{g:|a} pierwszy czynsz ziemniakami.',
    { temat: 'dolar', wiekOd: 18 },
  ),
  sz(
    'kronika-chmura',
    'kronika',
    'Kiedy w {rok} padła chmura, {o:mian} stracił{g:|a} wszystkie zdjęcia z dawnych czasów i jedno hasło, którego i tak nie pamiętał{g:|a}.',
    { temat: 'chmura', wiekOd: 14 },
  ),
  sz('kronika-autobus', 'kronika', '{o:mian} widział{g:|a} ostatni autobus w {rok} i pomachał{g:|a} mu z przystanku.', {
    temat: 'autobus',
    wiekOd: 6,
  }),
  sz(
    'kronika-zebranie',
    'kronika',
    'W {rok} {o:mian} był{g:|a} na pierwszym zebraniu spółdzielni przy świecach i {g:przyniósł|przyniosła} własną.',
    { temat: 'zebranie', wiekOd: 18, motyw: 'zebranie' },
  ),
  sz(
    'kronika-piece',
    'kronika',
    'Od {rok}, kiedy domy przeszły na piece, {o:mian} zna każdy płot w okolicy, a połowę z nich spalił{g:|a}.',
    { temat: 'piece', wiekOd: 12 },
  ),
  sz(
    'kronika-plyta',
    'kronika',
    '{o:mian} śmiał{g:|a} się kiedyś z wielkiej płyty, a od {rok} mówi o niej z szacunkiem.',
    {
      temat: 'plyta',
      wiekOd: 16,
    },
  ),
  sz(
    'kronika-inteligentny-dom',
    'kronika',
    'W {rok}, kiedy zgasł inteligentny dom, {o:mian} spędził{g:|a} noc na klatce, bo drzwi otwierał telefon.',
    { temat: 'inteligentny', wiekOd: 14, blok: true, motyw: 'telefon' },
  ),
  sz(
    'kronika-domofony',
    'kronika',
    'Od {rok}, kiedy na klatkach zamontowano inteligentne domofony, {o:mian} nosi przy sobie zwykły klucz, na wszelki wypadek.',
    { temat: 'domofony', wiekOd: 14, blok: true },
  ),
  sz(
    'kronika-gmina',
    'kronika',
    'Ostatnie pismo z gminy, z {rok} roku, {o:mian} trzyma w szufladzie, bo jest na dobrym papierze.',
    { temat: 'gmina', wiekOd: 18 },
  ),
  sz(
    'kronika-zarzad',
    'kronika',
    'Od {rok}, kiedy zarząd spółdzielni przejął wodę, prąd i bramę, {o:mian} ma dyżur raz w tygodniu i pilnuje go jak dawniej terminów w pracy.',
    { temat: 'zarzad', wiekOd: 16 },
  ),
  sz('kronika-piony', 'kronika', '{o:mian} do dziś czeka na wymianę pionów, którą spółdzielnia obiecała w {rok}.', {
    temat: 'fundusz',
    wiekOd: 18,
  }),
  sz(
    'kronika-prezydent',
    'kronika',
    'O dziesiątej kadencji prezydenta Stanów Zjednoczonych {o:mian} dowiedział{g:|a} się kilka lat po {rok}, od kogoś z sąsiedniego osiedla.',
    { temat: 'prezydent', wiekOd: 14 },
  ),
  sz(
    'kronika-korek',
    'kronika',
    'W {rok} {o:mian} stał{g:|a} w ostatnim korku na ulicy, bo wszyscy jechali po resztki benzyny.',
    { temat: 'korek', wiekOd: 18 },
  ),
  sz(
    'kronika-piwnice',
    'kronika',
    'Od {rok} {o:mian} trzyma w piwnicy więcej rzeczy niż w mieszkaniu, bo piwnica jest dziś najważniejszym pomieszczeniem osiedla.',
    { temat: 'piwnice', wiekOd: 16 },
  ),
  sz(
    'kronika-rower',
    'kronika',
    'Od {rok}, kiedy samochody zniknęły z ulic, {o:mian} jeździ rowerem środkiem jezdni i nikt na {g:niego|nią} nie trąbi.',
    { temat: 'chwasty', wiekOd: 10 },
  ),
];

/** Prawdziwe miejsca z kroniki osiedla: wpis z nazwą w nawiasie, `{rok}` to rok wpisu, a `{miejsce}` jego nazwa.
    Kategorię wpisu rozpoznaje historie.ts po rzeczowniku na początku tekstu kroniki. */
const MIEJSCE: readonly Szablon[] = [
  sz(
    'miejsce-szkola-informatyka',
    'miejsce',
    'W {rok} {o:mian} chodził{g:|a} do szkoły ({miejsce}) i miał{g:|a} tam jeszcze lekcje informatyki.',
    { kategoria: ['szkola'], od: 2026, do: 2029, wiekOd: 7, wiekDo: 18 },
  ),
  sz(
    'miejsce-szkola-polano',
    'miejsce',
    'W {rok} {o:mian} chodził{g:|a} do szkoły ({miejsce}) i codziennie {g:nosił|nosiła} tam polano do pieca.',
    { kategoria: ['szkola'], od: 2034, do: 2050, wiekOd: 7, wiekDo: 18 },
  ),
  sz(
    'miejsce-przedszkole',
    'miejsce',
    'W {rok} {o:mian} chodził{g:|a} do przedszkola ({miejsce}) i do dziś umie piosenkę o oszczędzaniu prądu.',
    { kategoria: ['przedszkole'], wiekOd: 3, wiekDo: 6 },
  ),
  sz(
    'miejsce-zlobek',
    'miejsce',
    'W {rok} {o:mian} chodził{g:|a} do żłobka ({miejsce}), choć sam{g:|a} tego nie pamięta.',
    { kategoria: ['zlobek'], wiekOd: 1, wiekDo: 3 },
  ),
  sz(
    'miejsce-przychodnia-karta',
    'miejsce',
    'W przychodni ({miejsce}) {o:mian} ma kartę z {rok} roku, wypisaną ręcznie, bo system już nie działał.',
    { kategoria: ['przychodnia'], od: 2029, do: 2043, wiekOd: 16 },
  ),
  sz(
    'miejsce-przychodnia-bandaz',
    'miejsce',
    'W {rok} {o:mian} chodził{g:|a} do przychodni ({miejsce}) z własnym bandażem, bo bandaży już tam nie było.',
    { kategoria: ['przychodnia'], od: 2037, do: 2043, wiekOd: 16 },
  ),
  sz('miejsce-apteka', 'miejsce', 'W aptece ({miejsce}) {o:mian} kupił{g:|a} w {rok} ostatni syrop z importu.', {
    kategoria: ['apteka'],
    od: 2029,
    do: 2040,
    wiekOd: 16,
  }),
  sz(
    'miejsce-spozywczy',
    'miejsce',
    'W sklepie spożywczym ({miejsce}) {o:mian} ma do dziś dług w zeszycie, jeszcze z {rok} roku.',
    { kategoria: ['spozywczy'], od: 2030, do: 2045, wiekOd: 14 },
  ),
  sz('miejsce-lokal', 'miejsce', 'W lokalu ({miejsce}) {o:mian} był{g:|a} stał{g:ym|ą} klient{g:em|ką} aż do {rok}.', {
    kategoria: ['lokal'],
    wiekOd: 16,
  }),
  sz(
    'miejsce-elektronika',
    'miejsce',
    'W sklepie z elektroniką ({miejsce}) {o:mian} kupił{g:|a} w {rok} ostatnią ładowarkę w szczelnej obudowie.',
    { kategoria: ['elektronika'], od: 2029, do: 2036, wiekOd: 14 },
  ),
  sz(
    'miejsce-ubrania',
    'miejsce',
    '{o:mian} nosi do dziś kurtkę ze sklepu z ubraniami ({miejsce}), kupioną jeszcze w {rok}.',
    { kategoria: ['ubrania'], od: 2026, do: 2036, wiekOd: 14 },
  ),
  sz(
    'miejsce-narzedzia',
    'miejsce',
    'W sklepie z narzędziami i częściami ({miejsce}) {o:mian} {g:wymienił|wymieniła} w {rok} rower na skrzynkę gwoździ.',
    { kategoria: ['budowlany'], od: 2035, wiekOd: 16 },
  ),
  sz(
    'miejsce-ogrodniczy',
    'miejsce',
    'W {rok} {o:mian} kupił{g:|a} w sklepie ogrodniczym ({miejsce}) nasiona, z których rośnie dziś pół działki.',
    { kategoria: ['ogrodnik'], od: 2029, do: 2042, wiekOd: 14 },
  ),
  sz(
    'miejsce-biblioteka',
    'miejsce',
    '{o:mian} ma w domu książkę z biblioteki ({miejsce}), wypożyczoną w {rok} i nigdy nieoddaną.',
    { kategoria: ['biblioteka'], wiekOd: 8 },
  ),
  sz(
    'miejsce-bank',
    'miejsce',
    'W banku ({miejsce}) {o:mian} miał{g:|a} kredyt, o którym w {rok} zapomnieli wszyscy, łącznie z bankiem.',
    { kategoria: ['bank'], od: 2033, wiekOd: 22 },
  ),
  sz(
    'miejsce-stacja',
    'miejsce',
    'Na stacji paliw ({miejsce}) {o:mian} zatankował{g:|a} w {rok} po raz ostatni i zachował{g:|a} paragon.',
    { kategoria: ['stacja'], od: 2026, do: 2036, wiekOd: 18 },
  ),
  sz(
    'miejsce-kosciol',
    'miejsce',
    'W kościele ({miejsce}) {o:mian} siedział{g:|a} w {rok} na zebraniu spółdzielni zwołanym zaraz po mszy.',
    { kategoria: ['kosciol'], od: 2036, wiekOd: 18, motyw: 'zebranie' },
  ),
  sz(
    'miejsce-placowka',
    'miejsce',
    'W placówce ({miejsce}) {o:mian} załatwił{g:|a} w {rok} ostatnią sprawę przez internet.',
    { kategoria: ['urzad'], od: 2026, do: 2033, wiekOd: 18 },
  ),
];

/** Stan w 2051: jak gospodarstwo żyje dziś. `wiekOd` to wiek w 2051. */
const STAN: readonly Szablon[] = [
  sz('stan-sam', 'stan', '{o:mian} ma {wiek} i mieszka sam{g:|a}, ale drzwi zamyka tylko na noc.', {
    sam: true,
    wiekOd: 18,
    motyw: 'sam',
  }),
  sz('stan-windy', 'stan', '{o:mian} ma {wiek}, mieszka sam{g:|a} i pamięta czasy, kiedy windy jeszcze jeździły.', {
    sam: true,
    blok: true,
    kondygnacjeOd: 5,
    wiekOd: 60,
    motyw: 'sam',
  }),
  sz('stan-para', 'stan', '{o:mian} i {p:mian} mieszkają tu we dwoje i kłócą się tylko o to, kto dokłada do pieca.', {
    para: true,
  }),
  sz('stan-pokolenia', 'stan', 'W mieszkaniu {o:dop} mieszkają trzy pokolenia i jeden piec.', { pokolenia: true }),
  sz(
    'stan-dzieci',
    'stan',
    '{o:mian} ma {wiek} i najwięcej czasu spędza na pilnowaniu, żeby dzieci nie ruszały kabli.',
    { dzieci: true },
  ),
  sz('stan-ciasno', 'stan', 'W mieszkaniu {o:dop} jest ciasno, ale zimą nikt nie narzeka, bo ciasno znaczy ciepło.', {
    ciasno: true,
  }),
  sz('stan-fach', 'stan', 'Na osiedlu {o:mian} jest znan{g:y|a} jako {fach}.', { motyw: 'fach' }),
  // nie pasuje, gdy dawny zawód i fach brzmią tak samo („kiedyś murarz, dziś murarz”): historie.ts, `pasuje`
  sz('stan-kiedys-dzis', 'stan', '{o:mian}: kiedyś {zawod}, dziś {fach}.', { zawod: 'dowolny', motyw: 'fach' }),
  sz('stan-kroki', 'stan', '{o:mian} ma {wiek} i każdego na klatce rozpoznaje po krokach.', { wiekOd: 6, blok: true }),
  sz('stan-grzadki', 'stan', '{o:mian} ma {wiek} i od rana do zmroku pilnuje grządek za domem.', {
    wiekOd: 10,
    blok: false,
  }),
];

/** Wszystkie szablony. */
export const SZABLONY: readonly Szablon[] = [
  ...PRZYDZIAL,
  ...WPROWADZKA,
  ...URODZENIE,
  ...ZGON,
  ...WYPROWADZKA,
  ...EMIGRACJA,
  ...POWROT,
  ...POWROT_OPIEKA,
  ...ZWIAZEK,
  ...OWDOWIENIE,
  ...DAWNE,
  ...KRONIKA,
  ...MIEJSCE,
  ...STAN,
];
