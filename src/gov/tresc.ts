/* Treść zarządu w M1 „Pierwsza noc za siatką”: uchwały na pierwsze noce (trzy z 0.3, trzy nowe w tym
   samym tonie), nowe wydarzenia wieczoru i nocy, wybór wydarzeń z 0.3 z porą dnia, cele wypraw.
   Treść 0.3 zostaje w src/content (pilnuje jej test zgodności), tu są tylko dodatki i wybór.
   Pula wydarzeń zależy od trybu gry: `tryby` (brak: oba tryby; sprawdza je `fitsMode` w wydarzenia.ts). `slady` to
   karta zwykłego trybu, `slady_z` jej wariant zombie (łata albo warta z dzidą, bez „udawać”, które podbijałoby napad
   szabrowników); łata z obu kart kosztuje `PATCH_SCRAP` złomu, tyle co łata z menu (test zgodności z `PATCH_COST`
   w zarzad.test.ts), i tyle samo kosztuje na kartach „Kury” (ulica.ts) i „Szczekanie” (watki-tresc.ts): wybór `lataDziury`
   jest wspólny. `szwendacz` to karta tylko trybu zombie o prawdziwym szwendaczu przy siatce (`GovHost.przy` z
   GovInput.horde.przy; „Dobić dzidą” wysyła atak osoby z dzidą przez `GovHost.atakuj`). `wedrowiec` ma wagę 0 w obu
   trybach: opisuje człowieka pod bramą, a nikogo tam nie ma; jego rolę przejął `gosc` (src/gov/wizyta.ts). Karta
   z miejscem na mapie ma `gdzie`, z którego okno wydarzenia robi przycisk „Pokaż”.
   Karty z ludźmi: mieszkańcy siedziby z osobą z generatora (`GovHost.lokatorzy()`, `lokator(id)`; bez generatora lista
   jest pusta, a karty grają po staremu) dają bohaterów kartom `dym`, `latarka` (najstarsza mieszkanka po imieniu, bez
   pięter) i, w nakładkach z warianty.ts, `fachowiec` (awans), `kradziez` (sprawca z najniższym nastrojem, nie jedzenie)
   i `odejscie`/`klotnia` (wyjście bramą: `wyrzuc`). `bezsennosc` bierze spoza warty przy siatce (dyżur przy kozie wolno)
   nieśpiącego z najniższym bezpieczeństwem (`czuwaPozaWarta()`), a gdy nikt nie czuwa, śpiącego (`spiPozaWarta()`);
   jego wybory ruszają prawdziwych ludzi (`sprawdz` do kafelka przed kozą `kafelekKozy()` albo do siatki). `krzyk` i
   `halas` dla
   „Sprawdzić” osobę z `doSprawdzenia()` (czuwającą, a gdy takiej nie ma, śpiącą, ale nie z warty) i kafelek
   z `kafelekPrzySiatce()` (`sprawdz`).
   `gosc` i `zlapany` (src/gov/wizyta.ts, dołączone w wydarzenia.ts) to karty z prawdziwym gościem pod bramą; host dostaje
   od nich metody `GoscHost`. Karty z 0.3, w których ktoś przychodzi pod bramę (`uchodzcy`, `influencer`, `aktywisci`,
   `dzieci`, `krypto`, w domu `fachowiec`; nakładki w warianty.ts), mają `GEventDef.gosc` (kogo wystawić, `GoscKarty`):
   wypadnięcie planuje wizytę jak dla gościa z klocków, a karta czeka na grupę pod bramą w tym samym `goscTick`.
   `pogrzeb` to karta z sytuacji jak `dym` (waga 0, wyzwalacz w eventTick z GovInput.dead, licznik GovState.pogrzebN): po
   zgonie kogoś z imieniem (zarząd albo mieszkaniec z osobą; dane karty `{ id, name, f, cause, cialo? }`) w trzech
   wyborach: pochować pod trzepakiem (w domu w ogrodzie; wszystkim nastrój „Pożegnaliśmy: Imię” +2 na dobę, kopie
   `doSprawdzenia()` za −10 odpoczynku), pożegnać przy kozie (nastrój +1) albo bez ceremonii (wkurzenie +1). W trybie
   zombie `cialo` (dobite albo nie) idzie do tekstu; bez ciała zamiast grobu tabliczka.
   Kroki łańcuchów kart (src/gov/watki.ts) to też `GEventDef`; host dostaje od nich `hak(id, d?)` i `hakDane(id)`, którymi
   wybór na karcie ustawia i czyta fakty zwalniające następny krok. Treść dwunastu łańcuchów (src/gov/watki-tresc.ts) bierze od
   hosta jeszcze: `pies()` (flaga `dog` albo wpis o psie), `watek(id)` (łańcuch jest wątkiem sezonu; karta `pies` ustępuje
   wtedy łańcuchowi „Szczekanie”), `napadNocy(dzien)` (wynik nocy z raportu), `handlarz()` i `handlarzEfekt(...)` (handlarz
   pod bramą, `GovInput.handlarz`; lepsza oferta albo zła sława w symulacji) oraz `wskazowkaMiejsca(...)` i
   `miejsceWskazowki(...)` (wskazówka na miejsce z kategorii albo cel z TARGETS, także z bronią). `GoscKarty` ma dla tych
   kroków `look` (twarze), `chce`, `ugryziony` (ukryte ugryzienie) i `wraca` (ten sam znajomy w pamięci zarządu). */

import { przyczynaEn } from '../content/data.en.ts';
import { LAW, type LawPath } from '../content/data.ts';
import type { EventHost } from '../content/events.ts';
import { g, type Person } from '../content/people.ts';
import { type Tx, tx, txOf, wielka } from '../core/jezyk.ts';
import { pick } from '../core/rng.ts';
import type { ChceId, KtoId, Strona } from './goscie.ts';
import type { Words, WordsEn } from './miejsce.ts';
import { M1_LAWS_EN, TARGET_VARIANTS_EN, TARGETS_EN } from './tresc.en.ts';
import type { Cialo, GameMode, GovLokator, GovNeeds, GovPerson, GovPlace, LootKey, Punkt } from './typy.ts';
import { najstarszaMieszkanka, type OsobaKarty, osobaKarty } from './warianty.ts';
import type { GoscHost } from './wizyta.ts';

// ---------------------------------------------------------------- uchwały

export interface M1Law {
  name: string;
  path: LawPath;
  req?: string[];
  desc: string;
  /** od razu: [zaufanie, wkurzenie] */
  imm?: [number, number];
  /** codziennie rano: [zaufanie, wkurzenie] */
  daily?: [number, number];
  /** w domu jednorodzinnym (ulica i komitet ulicy): inna nazwa albo opis; liczby te same */
  dom?: { name?: string; desc?: string };
}

/**
 * Uchwały dostępne w M1. Trzy z 0.3 (nazwy, drogi i warunki z src/content), opisy z tym, co robią
 * w nowej grze; trzy nowe. Drogi Porządek i Wspólnota wykluczają się jak w 0.3.
 */
export const M1_LAWS: Record<string, M1Law> = {
  u_warty: {
    name: LAW.u_warty.name,
    path: LAW.u_warty.path,
    desc: 'Co noc przy bramie stoi ktoś z mieszkańców, a warta zarządu pilnuje lepiej. Obrona przy bramie +1,5, warta mocniejsza o ćwierć, szansa napadu −5 punktów.',
    dom: {
      name: 'Warty przy furtce',
      desc: 'Co noc przy furtce stoi ktoś z domowników, a warta komitetu pilnuje lepiej. Obrona przy furtce +1,5, warta mocniejsza o ćwierć, szansa napadu −5 punktów.',
    },
  },
  u_brama: {
    name: 'Brama na kłódkę od 20:00',
    path: 'porzadek',
    req: ['u_warty'],
    desc: 'Po zmroku nikt nie wchodzi ani nie wychodzi, klucz ma tylko zarząd. Szansa napadu −8 punktów, wędrowców spod bramy nikt nie wpuszcza. Wkurzenie +0,2 dziennie.',
    daily: [0, 0.2],
    dom: {
      name: 'Furtka na kłódkę od 20:00',
      desc: 'Po zmroku nikt nie wchodzi ani nie wychodzi, klucz ma tylko komitet. Szansa napadu −8 punktów, wędrowców spod furtki nikt nie wpuszcza. Wkurzenie +0,2 dziennie.',
    },
  },
  u_zebrania: {
    name: LAW.u_zebrania.name,
    path: LAW.u_zebrania.path,
    desc: LAW.u_zebrania.desc,
    daily: [0.4, 0],
    dom: { name: 'Zebrania przy kozie' },
  },
  u_kociol: {
    name: 'Wspólny kocioł',
    path: 'wspolnota',
    desc: 'Wszystkie zapasy idą do jednego garnka przy kozie. Każdy je tyle samo, także ci, co nie pracują. Zaufanie +2 od razu i +0,3 dziennie, jedzenie schodzi o 10% szybciej.',
    imm: [2, 0],
    daily: [0.3, 0],
  },
  u_racje: {
    name: LAW.u_racje.name,
    path: LAW.u_racje.path,
    desc: 'Porcje są o 25% mniejsze, a zapasy starczają trochę dłużej. Ludzie jedzą dopiero przy wyraźnym głodzie i najwyżej dwa razy na dobę, więc na noc kładą się głodni. Wkurzenie +0,4 dziennie.',
    daily: [0, 0.4],
  },
  u_meble: {
    name: 'Meble na opał',
    path: 'base',
    desc: 'Meble z pustych mieszkań idą do kozy bez pytania o zgodę. Palenie cudzych mebli boli połowę mniej, ale wkurzenie +2 od razu i +0,1 dziennie.',
    imm: [0, 2],
    daily: [0, 0.1],
    dom: {
      desc: 'Meble idą do kozy bez pytania domowników o zgodę. Palenie mebli boli połowę mniej, ale wkurzenie +2 od razu i +0,1 dziennie.',
    },
  },
};

/** nazwa uchwały według miejsca (w domu furtka i komitet zamiast bramy, klatek i zarządu) */
export const lawName = (id: string, p: GovPlace): string =>
  (p.kind === 'dom' ? M1_LAWS[id].dom?.name : undefined) ?? M1_LAWS[id].name;
export const lawDesc = (id: string, p: GovPlace): string =>
  (p.kind === 'dom' ? M1_LAWS[id].dom?.desc : undefined) ?? M1_LAWS[id].desc;
/** to samo w obu językach (angielskie z tresc.en.ts) */
export const lawNameTx = (id: string, p: GovPlace): Tx => {
  const en = M1_LAWS_EN[id];
  return tx(lawName(id, p), (p.kind === 'dom' ? en?.dom?.name : undefined) ?? en?.name ?? lawName(id, p));
};
export const lawDescTx = (id: string, p: GovPlace): Tx => {
  const en = M1_LAWS_EN[id];
  return tx(lawDesc(id, p), (p.kind === 'dom' ? en?.dom?.desc : undefined) ?? en?.desc ?? lawDesc(id, p));
};

/** pierwsza uchwała, wieczorem pierwszego dnia: warta, dzielenie jedzenia, palenie mebli */
export const FIRST_LAWS = ['u_warty', 'u_kociol', 'u_meble'] as const;

// ---------------------------------------------------------------- wyprawy

export interface ExpTarget {
  id: string;
  name: string;
  range: 'blisko' | 'daleko';
  /** szansa kłopotów (szabrownicy, zawalone schody) */
  risk: number;
  loot: Partial<Record<LootKey, [number, number]>>;
  /** godzina powrotu */
  back: number;
}

/** cele poza mapą; ryzyko jak POICAT z 0.3 dla podobnych miejsc, łup w jednostkach symulacji */
export const TARGETS: ExpTarget[] = [
  {
    id: 'mieszkania',
    name: 'opuszczone mieszkania w bloku obok',
    range: 'blisko',
    risk: 0.12,
    loot: { wood: [2, 5], supplies: [1, 3] },
    back: 1,
  },
  {
    id: 'garaze',
    name: 'garaże za trzepakiem',
    range: 'blisko',
    risk: 0.1,
    loot: { wood: [1, 3], scrap: [2, 5] },
    back: 1,
  },
  {
    id: 'pawilon',
    name: 'pawilon handlowy',
    range: 'daleko',
    risk: 0.28,
    loot: { supplies: [3, 7], scrap: [1, 3], parts: [0, 2] },
    back: 5,
  },
  {
    id: 'stacja',
    name: 'stacja paliw przy obwodnicy',
    range: 'daleko',
    risk: 0.3,
    loot: { wood: [4, 9], supplies: [1, 4], parts: [0, 1] },
    back: 5,
  },
  {
    id: 'apteka',
    name: 'apteka przy przystanku',
    range: 'daleko',
    risk: 0.32,
    loot: { meds: [1, 3], supplies: [0, 2] },
    back: 5,
  },
];

/** nazwa celu wyprawy według miejsca: w domu bez bloku obok, trzepaka i pawilonu; ryzyko i łup te same */
export function targetName(t: ExpTarget, p: GovPlace): string {
  if (t.id === 'mieszkania' && p.near !== 'bloki') return 'opuszczony dom obok';
  if (p.kind !== 'dom') return t.name;
  if (t.id === 'garaze') return p.garages === null ? 'szopy w ogrodach obok' : 'garaże obok';
  if (t.id === 'pawilon') return 'sklep przy głównej drodze';
  return t.name;
}

/** to samo w obu językach, z tych samych warunków */
export function targetNameTx(t: ExpTarget, p: GovPlace): Tx {
  const v = TARGET_VARIANTS_EN;
  let en = TARGETS_EN[t.id] ?? t.name;
  if (t.id === 'mieszkania' && p.near !== 'bloki') en = v.opuszczonyDom;
  else if (p.kind === 'dom' && t.id === 'garaze') en = p.garages === null ? v.szopy : v.garazeObok;
  else if (p.kind === 'dom' && t.id === 'pawilon') en = v.sklep;
  return tx(targetName(t, p), en);
}

/** nazwy dziur w siatce, kiedy świat ich nie poda */
export const HOLE_NAMES = ['przy garażach', 'za trzepakiem', 'od ulicy', 'przy śmietniku', 'od strony bloku obok'];
/** to samo przy domu jednorodzinnym */
export const HOLE_NAMES_DOM = ['przy garażu', 'za szopą', 'od ulicy', 'przy kompostowniku', 'od strony domu obok'];

/** zakończenia gry, które M1 może dać, w domu jednorodzinnym (w bloku zostają te z 0.3 o walnym i klatkach) */
export const KONIEC_DOM: Record<'odwolanie' | 'exodus' | 'pustka', { title: string; text: string }> = {
  odwolanie: {
    title: 'Zebranie ulicy odwołało komitet',
    text: 'Wkurzenie przelało się przez płoty. Sąsiedzi zebrali się przy furtce i odwołali was przez aklamację. Nowy komitet zaczął od wymiany kłódki.',
  },
  exodus: {
    title: 'Ulica opustoszała',
    text: 'Ludzie przestali wierzyć, że z wami przetrwają. Dom po domu odchodzili na inne ulice. Zostały puste ogrody i list z banku o racie kredytu z 2047 roku.',
  },
  pustka: {
    title: 'Nikt nie przeżył',
    text: 'Ostatni domownik zgasił kozę. Ulica stoi pusta, a dron dostawczy dalej krąży nad dachem.',
  },
};

export const LOOT_LABEL: Record<LootKey, string> = {
  wood: 'Drewno',
  supplies: 'Jedzenie',
  scrap: 'Złom',
  parts: 'Części',
  meds: 'Leki',
};

// ---------------------------------------------------------------- wydarzenia

/** przyczyna zgonu (GovInput.dead[].cause) do zdania: „Halina nie żyje, od ran.” (angielska: `przyczynaEn`) */
export const PRZYCZYNA: Readonly<Record<string, string>> = {
  rany: 'od ran',
  gorączka: 'po ugryzieniu',
  amputacja: 'przy amputacji',
};

export type Pora = 'dzien' | 'wieczor' | 'noc';

/** wydarzenia przychodzą co minutę, więc to samo nie może wracać co godzinę gry jak w 0.3 co dzień */
export const REPEAT_GAP = 16;

/** pora z godziny: dzień 8–19, wieczór 19–22, noc 22–6 (6–8 bez wydarzeń: poranek i raport) */
export function poraOf(hour: number): Pora | null {
  if (hour >= 8 && hour < 19) return 'dzien';
  if (hour >= 19 && hour < 22) return 'wieczor';
  if (hour >= 22 || hour < 6) return 'noc';
  return null;
}

/** EventHost z 0.3 rozszerzony o to, czego potrzebują wydarzenia przy siatce */
export interface GovHost extends EventHost, GoscHost {
  hour(): number;
  /** dziury w siatce i nazwa najsłabszego miejsca (w obu językach) */
  holes(): number;
  weakName(): Tx;
  patchHole(): void;
  /** premia do obrony na najbliższą noc */
  guardBonus(v: number): void;
  moodAll(why: string, d: number, hours: number): void;
  needsAll(d: Partial<GovNeeds>): void;
  needsOf(id: string, d: Partial<GovNeeds>): void;
  /** najbardziej wypoczęta osoba, która nie śpi i nie jest na wyprawie */
  rested(): GovPerson | null;
  /** osoby zarządu w kolejności osób (kopie), także śpiące; bez tych, które w tym wywołaniu wychodzą (`wyrzuc`, `leave`) */
  zarzad(): GovPerson[];
  /** osoby zarządu, które nie śpią i nie są na wyprawie, w kolejności osób (kopie) */
  nieSpia(): GovPerson[];
  /** osoby zarządu, które nie śpią, nie są na wyprawie i nie pilnują siatki (brama, dziura, wieża, warta z karty nocy)
      ani nie operują (ugryzione); dyżur przy kozie wolno, bo siedzi przy kozie; w kolejności osób (kopie) */
  czuwaPozaWarta(): GovPerson[];
  /** to samo dla śpiących: osoby zarządu, które śpią, są na miejscu, nie pilnują siatki i nie są przy zabiegu (dyżur
      przy kozie wolno); w kolejności osób (kopie) */
  spiPozaWarta(): GovPerson[];
  /** klucz posterunku warty, na którym stoi osoba zarządu ('brama', 'd<id>', 'koza', 'siatka', 'wieza'; z odczytu, menu
      albo zatwierdzonej karty nocy); null: nie stoi na żadnym albo nie ma takiej osoby */
  posterunek(id: string): string | null;
  /** wolny kafelek przed kozą zarządu (`GovInput.strony.koza`); null: brak kozy albo wejścia bez strony */
  kafelekKozy(): number | null;
  /** najbardziej wypoczęta osoba, która może teraz iść sprawdzić hałas: najpierw spośród tych, które nie śpią, a gdy
      żadna nie może, spośród śpiących (wstaje i idzie). Nigdy nie idzie osoba na wyprawie (ani w nocnym planie
      wypraw), na posterunku warty (`GovInput.guards`, `GovPerson.post`, warta z karty nocy) ani przy zabiegu
      (ugryziona albo operuje); `oprocz` to id osoby, której nie brać (np. bohater karty); null: nikt nie może, wtedy
      „Sprawdzić” jest niedostępne */
  doSprawdzenia(oprocz?: string): GovPerson | null;
  /** kafelek podwórka przy siatce od strony garaży (`garaze`) albo najbliższego budynku mieszkalnego (`blok`), z
      `GovInput.strony`; bez niej kafelek największej otwartej dziury, a gdy i jej kafelków nie ma, null */
  kafelekPrzySiatce(strona: 'garaze' | 'blok'): number | null;
  /** czy gra ma psa albo go miała: flaga `dog` (przygarnięty) albo jakikolwiek wpis o psie w `GovInput.zwierzeta` (żyje albo
      zginął). Łańcuch „Szczekanie” nie oferuje psa, gdy to prawda. */
  pies(): boolean;
  /** czy łańcuch historii o tym id jest wątkiem sezonu tej gry (src/gov/watki.ts); karty, które dublują jego treść, ustępują mu */
  watek(id: string): boolean;
  /** wynik napadu nocy `dzien` (dzień, w którym noc się zaczęła: `NightReport.day`) z raportu porannego, a null, gdy raportu tej
      nocy jeszcze nie ma albo już go nie ma wśród ostatnich dziesięciu; raport rano to prawda o tej nocy, kroki łańcucha mówią to samo */
  napadNocy(dzien: number): 'brak' | 'odparty' | 'wtargnięcie' | null;
  /** handlarz stoi pod bramą z wózkiem (`GovInput.handlarz`): jego kafelek i punkt mapy; null: nikogo (gra bez obcych też) */
  handlarz(): { tile: number; gdzie: Punkt } | null;
  /** skutek dla handlarza pod bramą (`GovEffects.handlarz`): lepsza oferta albo zła sława; bez handlarza w symulacji nic nie robi */
  handlarzEfekt(co: 'oferta' | 'slawa'): void;
  /** chwilowy nastrój jednej osoby (zarządu albo mieszkańca z osobą) na `hours` godzin gry; powód to polski napis
      z src/content/nastroje.en.ts, jak w `moodAll` */
  moodOf(id: string, why: string, d: number, hours: number): void;
  flag(k: 'dog' | 'cat' | 'flashlight' | 'torch'): boolean;
  setFlag(k: 'dog' | 'cat' | 'flashlight' | 'torch'): void;
  gateClosed(): boolean;
  /** czy ktoś trzyma dziś wartę */
  guarded(): boolean;
  /** tryb zombie: szwendacz najbliżej siatki (numer pionka i kafelek), nie dalej niż 3 m od niej; null: nikogo
      przy siatce albo tryb zwykły */
  przy(): { pawn: number; x: number; y: number } | null;
  /** osoba z dzidą, która nie śpi i nie jest na wyprawie; z kilku najzdrowsza, przy remisie pierwsza po numerze; null:
      nikt nie może dobić przez siatkę */
  zDzida(): GovPerson | null;
  /** osoba zarządu atakuje pionek (szwendacza): symulacja wstawia polecenie 'attack' */
  atakuj(id: string, pawn: number): void;
  /** mieszkaniec z osobą (GovLokator.id) przechodzi do zarządu: ten sam pionek, symulacja zmienia mu rodzaj */
  awansuj(id: string): void;
  /** mieszkaniec z osobą albo osoba zarządu wychodzi bramą i znika; do końca zdarzenia nie ma jej w `alive()` */
  wyrzuc(id: string): void;
  /** osoba zarządu idzie sprawdzić kafelek (numer kafelka mapy), stoi tam 10 minut gry i wraca do zajęć */
  sprawdz(id: string, tile: number): void;
  /** Hak łańcucha kart (src/gov/watki.ts): zapisuje fakt `id` z minutą gry i danymi `d` (zwykły JSON, `Tx` w środku wolno).
      Wybór na karcie kroku ustawia nim hak, od którego liczy się odstęp następnego kroku; id z przestrzenią łańcucha
      (`swiatlo.dali`). Ponowne ustawienie przesuwa czas. */
  hak(id: string, d?: unknown): void;
  /** hak o danym id (kopia: minuta gry i dane) albo null, gdy go nie ma; do tekstów i wyborów dalszych kroków */
  hakDane(id: string): { t: number; d?: unknown } | null;
  /** wpis do kroniki: zdanie w obu językach albo polski wpis z 0.3 (angielski daje EVENTS_EN z warianty.en.ts) */
  log(txt: string | Tx, big?: boolean): void;
  /** skutek na rano: zmiana zapasów i linia do raportu */
  later(stock: Partial<Record<LootKey, number>>, line: Tx): void;
  /** miejsce siedziby i słownik wspólnoty (w domu ulica i komitet ulicy), także po angielsku */
  place(): GovPlace;
  words(): Words;
  wordsEn(): WordsEn;
  /** skąd przychodzi sąsiad: „z waszej klatki” (blok z mieszkańcami), „z bloku obok” albo „zza płotu” według
      sąsiadów; null, gdy w okolicy nie ma nikogo */
  neighbour(): string | null;
  /** to samo po angielsku: from your stairwell, from the block next door, from over the fence; null jak wyżej */
  neighbourEn(): string | null;
  /** jacy sąsiedzi są w okolicy: bloki, domy albo nikt (null); jak sasiedzi() w miejsce.ts */
  neighbours(): 'bloki' | 'domy' | null;
  /** mieszkańcy siedziby z osobą z generatora mieszkańców (GovInput.lokatorzy), w kolejności pionków; bez generatora
      pusta lista. Kopie: zmiana osoby nie rusza wejścia */
  lokatorzy(): GovLokator[];
  /** lokator o danym id osoby (id ze stanu symulacji, jak GovLokator.id); null: nie ma takiego (także dla osób zarządu) */
  lokator(id: string): GovLokator | null;
  /** wolne miejsca dla mieszkańców, mieszkańcy siedziby, temperatura na dworze, ognisko na podwórku */
  free(): number;
  residents(): number;
  outdoor(): number;
  campfire(): boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzenia mają różne kształty
export interface GEventDef<D = any> {
  id: string;
  once?: boolean;
  /** najmniej tyle godzin gry między powtórkami (domyślnie REPEAT_GAP) */
  gap?: number;
  when: readonly Pora[];
  /** w jakich trybach gry wydarzenie wchodzi do puli (brak: w obu); wydarzenia ulicy odpadają w zombie osobno,
      patrz `fitsMode` w wydarzenia.ts */
  tryby?: readonly GameMode[];
  /** dozwolone pierwszego dnia po ciszy i pierwszej nocy (do 8:00 drugiego dnia): siatka, obcy, noc */
  first?: boolean;
  /** zwroty do podmiany w kronice z wyborów tego wydarzenia (według miejsca; tylko polskie wpisy z 0.3) */
  log?: (h: GovHost) => Record<string, string> | null;
  w: (h: GovHost) => number;
  /** ton karty dla narratora (src/gov/narrator.ts): `ostre` (zagrożenie, strata) tracą wagę przy wysokim napięciu, a zyskują po dobie
      spokoju; `lagodne` (drobiazgi, znaleziska, satyra) zyskują przy wysokim napięciu; bez pola karta jest zwykła (waga bez zmian) */
  ton?: 'ostre' | 'lagodne';
  make: (h: GovHost) => D | null;
  /** miejsce wydarzenia na mapie w kafelkach (przycisk „Pokaż” w oknie); brak funkcji albo null: karta bez miejsca */
  gdzie?: (h: GovHost, d: D) => Punkt | null;
  /** Karta, w której ktoś przychodzi pod bramę: kogo wystawić (dane z `make`). Gdy wypadnie, zarząd nie pokazuje karty,
      tylko planuje wizytę (`planujKarte` w wizyta.ts, jak dla gościa z klocków), a karta otwiera się dopiero wtedy, gdy
      grupa stoi pod bramą; jej dane dostają wtedy `gid` (id wizyty), po którym tekst i wybory czytają grupę (`GovHost.grupa`)
      i sterują jej pionkami (`przyjmijGosci` i spółka). null: tym razem bez gościa, karta gra po staremu (jak z zapisu). */
  gosc?: (h: GovHost, d: D) => GoscKarty | null;
  /** tytuł, tekst i napisy wyborów w obu językach (angielskie z tych samych danych, bez losowania) */
  title: (h: GovHost, d: D) => Tx;
  text: (h: GovHost, d: D) => Tx;
  choices: (h: GovHost, d: D) => GChoice[];
}

/** Kogo wystawia karta z gościem (`GEventDef.gosc`): osoby grupy (mówiąca pierwsza; mogą to być osoby z danych karty, jak
    influencerka), kim są (archetyp z klocków gościa albo rola karty) i, gdy karta woli, z której strony przychodzą (bez
    strony losuje ją zarząd). Nie nazywa się `PlanGoscia`, bo tak jest plan dla symulacji (`GovEffects.gosc`). */
export interface GoscKarty {
  osoby: Person[];
  kto: KtoId | 'sasiad' | 'aktywisci' | 'influencer' | 'dzieci';
  strona?: Strona;
  /** Dla kroków łańcuchów (src/gov/watki-tresc.ts), które sprowadzają tych samych ludzi drugi raz albo gościa z ukrytym
      ugryzieniem. `look`: wygląd pionka każdej osoby (4–15, w kolejności `osoby`), z poprzedniej wizyty (`GrupaKarty.looks`);
      bez niego albo przy innej długości wygląd losuje zarząd. `chce`: czego chce gość (domyślnie nocleg). `ugryziony`: indeks
      w `osoby` ukrytego ugryzienia (tryb zombie): gość ma haczyk `ugryziony`, a wpuszczony albo przyjęty dostaje ugryzienie
      (`goscRozkaz(…, 'ugryziony')` robi karta). */
  look?: readonly number[];
  chce?: ChceId;
  ugryziony?: number;
  /** id wpisu `Znajomy` mówiącego, gdy ten sam człowiek wraca (kolejny krok łańcucha): decyzja o nim poprawia ten wpis zamiast
      zakładać drugi (pionek jest za każdym razem nowy, więc inaczej to byłby dla zarządu inny człowiek) */
  wraca?: string;
}

/** wybór wydarzenia w grze: jak EventChoice z 0.3, ale z napisem w obu językach */
export interface GChoice {
  label: Tx;
  ok: boolean;
  ai?: boolean;
  /** wybór nie zamyka okna: skutek się dzieje (zaufanie, wpis w kronice), a karta czeka dalej na decyzję, np. „Obejrzeć
      ręce” przy gościu (po wyborze karta pokazuje, co zobaczono, i nie ma już tego wyboru) */
  zostaje?: boolean;
  run: () => void;
}

/** wydarzenia z 0.3 z porą dnia, warunkami miejsca i wariantami tekstów (nakładki w warianty.ts) */
export { OLD_EVENTS, type OldEvent } from './warianty.ts';

const names = (list: GovPerson[]) =>
  list.length < 2
    ? list[0].name
    : `${list
        .slice(0, -1)
        .map((p) => p.name)
        .join(', ')} i ${list[list.length - 1].name}`;
const namesEn = (list: GovPerson[]) =>
  list.length < 2
    ? list[0].name
    : `${list
        .slice(0, -1)
        .map((p) => p.name)
        .join(', ')} and ${list[list.length - 1].name}`;
/** imiona w obu językach: „Ania, Bartek i Celina”, „Ania, Bartek and Celina” */
export const peopleNamesTx = (list: GovPerson[]): Tx => tx(names(list), namesEn(list));

const dom = (h: GovHost) => h.place().kind === 'dom';
/** sąsiedzi to domy: dom obok zamiast bloku obok (w samotnym miejscu wydarzenia z sąsiadami nie przychodzą) */
const domyObok = (h: GovHost) => h.neighbours() === 'domy';
/** gdzie mieszka sąsiad, który przychodzi: zza płotu w domu, inaczej w mieszkaniu */
const uNiej = (h: GovHost) => (h.neighbour() === 'zza płotu' ? 'w domu' : 'w mieszkaniu');
const uNiejEn = (h: GovHost) => (h.neighbour() === 'zza płotu' ? 'at her house' : 'in her flat');
/** angielski zaimek po płci osoby */
const zaimek = (p: { f: boolean }, he: string, she: string) => (p.f ? she : he);

/** dane karty `dym` i `latarka`: najstarsza mieszkanka siedziby po imieniu (`lok` to jej id, `p` to imię, rodzaj i fach do
    tekstów), a bez mieszkańców z osobą, w domu i w ręcznym wejściu puste `{}`, czyli bohaterka jak dotąd */
const bohaterKarty = (h: GovHost): { lok?: string; p?: OsobaKarty } => {
  const l = dom(h) ? null : najstarszaMieszkanka(h);
  return l ? { lok: l.id, p: osobaKarty(l) } : {};
};

/** dokąd idzie wędrowiec: losowanie z polskiej listy (jak dotąd), angielski tekst po tym samym indeksie */
const DEST = ['do brata pod Łódź', 'nad morze, bo tam podobno łowią ryby', 'do Kielc, do matki', 'na południe'];
const DEST_EN = [
  'to his brother’s place near Łódź',
  'to the seaside, because apparently they still catch fish there',
  'to Kielce, to his mother’s',
  'south',
];

/** Godzina karty nocy (`CARD_HOUR` w noc.ts, którego tresc.ts nie może importować: noc.ts importuje tresc.ts; zgodność
    pilnuje tests/unit/spojnosc-teksty.test.ts). */
const GODZINA_KARTY = 20;

/** Złom na łatę dziury z kart, które łatają za złom („Ślady przy siatce” `slady` i `slady_z`, „Kury” `kury` w ulica.ts i krok 2
    łańcucha „Szczekanie” w watki-tresc.ts): tyle, ile bierze łata z menu (`PATCH_COST` w src/sim/sim.ts: trzy sztuki desek
    albo złomu). Zarząd nie importuje symulacji, więc liczba żyje w dwóch miejscach, a zgodność pilnuje tests/unit/zarzad.test.ts
    (jak `WOOD_PER_HOUR` i `BURN_TICKS`). Stoi tu, a nie w wspolne.ts, bo wspolne.ts importuje miejsce.ts, które czyta
    `KONIEC_DOM` z tego pliku przy wczytaniu modułu: import wspolne.ts w tresc.ts wczytałby miejsce.ts przed `KONIEC_DOM`
    i dał „Cannot access 'KONIEC_DOM' before initialization”. */
export const PATCH_SCRAP = 3;

/** Wybór „załatać dziurę” każdej karty, która łata za złom: `PATCH_SCRAP` złomu (włączony dopiero, gdy tyle jest w zapasie),
    jedna dziura mniej i wpis do kroniki `log`. Podpis domyślnie „Załatać dziurę (Złom 3)”, a karta może dać własny (`label`).
    `gdy` dokłada warunek karty do „starcza złomu” (krok „Szczekania” łata tylko, gdy jest dziura), a `po` to dalszy skutek karty
    po łacie i przed wpisem (hak łańcucha). Kolejność skutków jak przy ręcznym zapisie na każdej karcie: zapłata, łata, `po`, wpis. */
export const lataDziury = (h: GovHost, o: { log: Tx; label?: Tx; gdy?: boolean; po?: () => void }): GChoice => ({
  label: o.label ?? tx(`Załatać dziurę (Złom ${PATCH_SCRAP})`, `Patch the hole (Scrap ${PATCH_SCRAP})`),
  ok: (o.gdy ?? true) && h.res.zlom >= PATCH_SCRAP,
  run: () => {
    h.pay({ zlom: PATCH_SCRAP });
    h.patchHole();
    o.po?.();
    h.log(o.log);
  },
});

/** Pierwszy wybór kart „Ślady przy siatce” (`slady` i `slady_z`): łata dziurę za `PATCH_SCRAP` złomu (`lataDziury`) z wpisem
    „złomem i drutem”. Do 20:00 podpis „przed nocą”, a od 20:00 „teraz”: karta wypada też wieczorem po karcie nocy (okno karty
    wstrzymuje wydarzenia, więc po 20:00 jest ona już zatwierdzona i noc się zaczęła), a „załatać przed nocą” o 20:33 było
    nieprawdą. Waga karty i jej losowanie bez zmian. */
const lataSladow = (h: GovHost): GChoice =>
  lataDziury(h, {
    label:
      h.hour() >= GODZINA_KARTY
        ? tx(`Załatać teraz (Złom ${PATCH_SCRAP})`, `Patch it up now (Scrap ${PATCH_SCRAP})`)
        : tx(`Załatać przed nocą (Złom ${PATCH_SCRAP})`, `Patch it up before dark (Scrap ${PATCH_SCRAP})`),
    log: tx('Dziura załatana złomem i drutem.', 'The hole is patched up with scrap and wire.'),
  });

/** nowe wydarzenia M1: obcy jako wydarzenie, siatka, noc; teksty według miejsca (w domu ulica i komitet ulicy) */
export const NEW_EVENTS: GEventDef[] = [
  {
    id: 'wedrowiec',
    first: true,
    gap: 30,
    when: ['wieczor', 'noc'],
    // waga 0 w obu trybach: karta opisuje człowieka pod bramą, a nikogo tam nie ma; wraca jako prawdziwy gość
    // (stara waga: h.gateClosed() ? 0.4 : 1)
    w: () => 0,
    make: (h) => ({
      thief: h.rng() < 0.3,
      dest: pick(DEST, h.rng),
    }),
    title: (h) => tx(`Wędrowiec ${h.words().brama.pod}`, `A drifter at ${h.wordsEn().brama}`),
    text: (h, d) => {
      const s = h.words();
      const e = h.wordsEn();
      const dest = DEST_EN[DEST.indexOf(d.dest)] ?? d.dest;
      return tx(
        `${wielka(s.brama.pod)} stoi chudy facet z plecakiem i psem na sznurku. Prosi, żeby mógł przenocować przy waszym ogniu. Mówi, że idzie ${d.dest}.${h.gateClosed() ? ` ${wielka(s.brama.m)} jest zamknięta na kłódkę, klucz ma ${s.zarzad.krotko}.` : ''}`,
        `A skinny bloke with a rucksack and a dog on a string is standing at ${e.brama}. He asks if he can spend the night by your fire. He says he is walking ${dest}.${h.gateClosed() ? ` ${wielka(e.brama)} is padlocked, and only ${e.krotko} has the key.` : ''}`,
      );
    },
    choices: (h, d) => [
      {
        label: tx('Wpuścić na noc', 'Let him in for the night'),
        ok: !h.gateClosed(),
        run: () => {
          if (d.thief) {
            h.mood(1, 0);
            h.later(
              { supplies: -2 },
              tx(
                'Rano wędrowca nie było. Zniknęły z nim dwa słoiki z piwnicy.',
                'By morning the drifter was gone. So were two jars from the basement.',
              ),
            );
          } else {
            h.mood(1, 0);
            h.guardBonus(1.5);
            h.later(
              {},
              tx(
                'Wędrowiec przesiedział noc przy ogniu i pilnował razem z wami. Rano zostawił adres brata.',
                'The drifter sat up all night by the fire and kept watch with you. In the morning he left his brother’s address.',
              ),
            );
          }
        },
      },
      {
        label: tx('Podać jedzenie przez siatkę (Jedzenie 1)', 'Pass some food through the fence (Food 1)'),
        ok: h.res.jedzenie >= 1,
        run: () => {
          h.addRes('jedzenie', -1);
          h.mood(1, 0);
        },
      },
      { label: tx('Odprawić', 'Send him away'), ok: true, run: () => h.mood(-1, 0) },
    ],
  },
  {
    id: 'slady',
    ton: 'ostre',
    first: true,
    gap: 20,
    when: ['dzien', 'wieczor'],
    // „udawać” podbija napad szabrowników, a w trybie zombie ich nie ma: tam jest slady_z
    tryby: ['zwykly'],
    w: (h) => (h.holes() > 0 && h.hour() >= 15 ? 1.4 : 0),
    make: (h) => ({ where: h.weakName() }),
    title: () => tx('Ślady przy siatce', 'Tracks by the fence'),
    text: (_h, d) => {
      // stary zapis ma tu polską nazwę dziury
      const where = txOf(d.where);
      return tx(
        `Przy dziurze ${where.pl} ktoś wydeptał ścieżkę. Na drucie wisi strzęp kurtki, której nikt z was nie nosi.`,
        `Someone has worn a path to the hole ${where.en}. A scrap of a jacket none of you own is hanging off the wire.`,
      );
    },
    choices: (h) => [
      lataSladow(h),
      {
        label: tx('Powiesić puszki z kamykami', 'Hang up tins full of pebbles'),
        ok: true,
        run: () => {
          h.guardBonus(1);
          h.log(
            tx(
              'Na siatce wiszą puszki z kamykami. Jak ktoś dotknie, będzie słychać.',
              'Tins full of pebbles hang on the fence. If anyone touches it, you’ll hear it.',
            ),
          );
        },
      },
      { label: tx('Udawać, że nic nie widać', 'Pretend you saw nothing'), ok: true, run: () => h.setRaidBoost() },
    ],
  },
  {
    // „Ślady przy siatce” w trybie zombie: ścieżkę wydeptało stado, nie ludzie, więc „udawać” odpada (podbijało napad
    // szabrowników, a ich w tym trybie nie ma); zamiast niego warta z dzidą. Warunek, pora i odstęp jak w slady.
    id: 'slady_z',
    ton: 'ostre',
    first: true,
    gap: 20,
    when: ['dzien', 'wieczor'],
    tryby: ['zombie'],
    w: (h) => (h.holes() > 0 && h.hour() >= 15 ? 1.4 : 0),
    make: (h) => ({ where: h.weakName() }),
    title: () => tx('Ślady przy siatce', 'Tracks by the fence'),
    text: (_h, d) => {
      // stary zapis ma tu polską nazwę dziury
      const where = txOf(d.where);
      return tx(
        `Przy dziurze ${where.pl} szwendacze wydeptali ścieżkę w błocie. Na drucie wisi strzęp kurtki, a obok biegną dwie wleczone bruzdy.`,
        `Shamblers have worn a path through the mud to the hole ${where.en}. A scrap of jacket hangs off the wire, and two dragging furrows run alongside.`,
      );
    },
    choices: (h) => [
      lataSladow(h),
      {
        label: tx('Postawić tam kogoś z dzidą na noc', 'Post someone there with a spear for the night'),
        ok: true,
        run: () => {
          h.guardBonus(1);
          h.log(
            tx(
              'Na noc przy dziurze stanie ktoś z dzidą. Kto się zbliży, dostanie w zęby.',
              'Someone with a spear will stand by the hole tonight. Whatever comes close gets it in the teeth.',
            ),
          );
        },
      },
    ],
  },
  {
    // prawdziwy szwendacz przy siatce (GovInput.horde.przy): karta ma jego miejsce na mapie („Pokaż”), a „Dobić dzidą”
    // wysyła na niego osobę z dzidą. Pora dzień, bo noc ma własne karty o stadzie.
    id: 'szwendacz',
    ton: 'ostre',
    gap: 6,
    when: ['dzien'],
    tryby: ['zombie'],
    w: (h) => (h.przy() ? 1.2 : 0),
    make: (h) => {
      const p = h.przy();
      return p ? { pawn: p.pawn, x: p.x, y: p.y } : null;
    },
    // gdzie stoi teraz; gdy odszedł od siatki, tam, gdzie go zobaczono
    gdzie: (h, d) => {
      const p = h.przy();
      return p ? { x: p.x, y: p.y } : { x: d.x, y: d.y };
    },
    title: () => tx('Szwendacz w siatce', 'A shambler in the fence'),
    text: () =>
      tx(
        'Szwendacz dotarł do siatki i wisi na niej od dłuższej chwili. Szarpie drut, kiwa łbem i nie odchodzi. Dzieci przykleiły się do okien, a wszyscy pytają, kiedy ktoś z tym coś zrobi.',
        'A shambler has reached the fence and has been hanging off it for a good while. It tugs at the wire, nods its head and will not go away. The children are glued to the windows, and everyone keeps asking when somebody will do something about it.',
      ),
    choices: (h, d) => [
      {
        label: tx('Dobić dzidą', 'Finish it off with a spear'),
        ok: !!h.zDzida(),
        run: () => {
          const p = h.zDzida();
          if (!p) return;
          // ten, który stoi teraz przy siatce, a gdy już odszedł, ten z karty
          h.atakuj(p.id, h.przy()?.pawn ?? d.pawn);
          h.log(
            tx(
              `${p.name} ${g(p, 'wziął', 'wzięła')} dzidę i ${g(p, 'poszedł', 'poszła')} do siatki.`,
              `${p.name} took a spear and went over to the fence.`,
            ),
          );
        },
      },
      {
        label: tx('Zostawić, niech wisi', 'Leave it, let it hang there'),
        ok: true,
        run: () => h.needsAll({ safe: -3 }),
      },
      {
        label: tx('Zasłonić kocem, żeby dzieci nie patrzyły', 'Hang a blanket so the children can’t see'),
        ok: true,
        run: () => h.mood(1, 0),
      },
    ],
  },
  {
    id: 'pies',
    ton: 'lagodne',
    first: true,
    once: true,
    when: ['wieczor', 'noc'],
    // pies z łańcucha „Szczekanie” (src/gov/watki-tresc.ts) ustawia tę samą flagę: drugiego już nie przygarniamy, a gdy ten
    // łańcuch jest wątkiem sezonu, pies przychodzi jego drogą (pies ujada, ślady, pies przychodzi sam), nie z tej karty
    w: (h) => (h.flag('dog') || h.watek('szczekanie') ? 0 : 0.7),
    make: () => ({}),
    title: () => tx('Pies przy siatce', 'A dog at the fence'),
    text: () =>
      tx(
        'Bury kundel szczeka przy siatce od godziny. Chudy, ale łapy ma jak niedźwiedź i nie odchodzi.',
        'A scruffy grey mongrel has been barking at the fence for an hour. Skinny, but with paws like a bear, and he is not going anywhere.',
      ),
    choices: (h) => [
      {
        label: tx('Przygarnąć (Jedzenie 1)', 'Take him in (Food 1)'),
        ok: h.res.jedzenie >= 1,
        run: () => {
          h.addRes('jedzenie', -1);
          h.setFlag('dog');
          h.moodAll('Mamy psa', 4, 24);
          h.log(
            tx(
              `Pies dostał imię Abonament. Śpi ${h.words().brama.przy} i warczy na obcych.`,
              `The dog has been named Subscription. He sleeps at ${h.wordsEn().brama} and growls at strangers.`,
            ),
            true,
          );
        },
      },
      {
        label: tx('Przegonić', 'Chase him off'),
        ok: true,
        run: () =>
          h.log(tx('Pies poszedł szczekać pod inny płot.', 'The dog went off to bark at somebody else’s fence.')),
      },
    ],
  },
  {
    id: 'halas',
    ton: 'ostre',
    first: true,
    gap: 4,
    when: ['noc'],
    w: (h) => (h.hour() >= 22 || h.hour() < 4 ? 1 : 0),
    make: (h) => ({ cat: h.rng() < 0.45 }),
    // za garażami tam, gdzie garaże są w okolicy, inaczej za płotem
    title: (h) =>
      h.place().garages === null
        ? tx('Hałas za płotem', 'A noise beyond the fence')
        : tx('Hałas za garażami', 'A noise behind the garages'),
    text: (h) => {
      const where = h.place().garages === null ? 'za płotem' : 'za garażami';
      const whereEn = h.place().garages === null ? 'beyond the fence' : 'behind the garages';
      return h.guarded()
        ? tx(
            `Coś łupnęło ${where}. Może kot, może ktoś. Wartownik patrzy w ciemność i nic nie widzi.`,
            `Something thudded ${whereEn}. Maybe a cat, maybe someone. The guard stares into the dark and sees nothing.`,
          )
        : tx(
            `Ktoś przy oknie usłyszał łomot ${where}. Może kot, może ktoś. Wszyscy inni śpią.`,
            `Someone by the window heard a bang ${whereEn}. Maybe a cat, maybe someone. Everyone else is asleep.`,
          );
    },
    choices: (h, d) => [
      {
        // idzie ktoś spoza warty (czuwający, a nocą wstaje najbardziej wypoczęty ze śpiących), na kafelek podwórka od
        // strony garaży (albo przy największej dziurze)
        label: tx('Sprawdzić z latarką', 'Check with a torch'),
        ok: !!h.doSprawdzenia() && h.kafelekPrzySiatce('garaze') !== null,
        run: () => {
          const p = h.doSprawdzenia();
          const tile = h.kafelekPrzySiatce('garaze');
          if (p && tile !== null) {
            h.sprawdz(p.id, tile);
            h.needsOf(p.id, { rest: -8 });
          }
          if (d.cat) {
            h.needsAll({ safe: 5 });
            h.log(
              tx(
                'Tylko kot. Wszyscy wracają spać trochę spokojniejsi.',
                'Just a cat. Everyone goes back to bed a little calmer.',
              ),
            );
          } else {
            h.guardBonus(1);
            h.needsAll({ safe: -3 });
            h.log(
              tx(
                `${p ? p.name : 'Ktoś'} ${p ? g(p, 'zobaczył', 'zobaczyła') : 'zobaczył'}, jak ktoś ucieka w stronę ulicy. Wiedzą już, że nie śpicie.`,
                `${p ? p.name : 'Someone'} saw somebody legging it towards the street. Now they know you’re awake.`,
              ),
            );
          }
        },
      },
      {
        label: tx('Spać dalej', 'Go back to sleep'),
        ok: true,
        run: () => {
          h.needsAll({ safe: -4 });
          if (!d.cat) h.setRaidBoost();
        },
      },
    ],
  },
  {
    id: 'krzyk',
    ton: 'ostre',
    first: true,
    when: ['noc'],
    // krzyk niesie się od sąsiadów: bez nich w okolicy nie ma skąd
    w: (h) => (h.place().near === 'nikt' ? 0 : 0.9),
    make: (h) => ({ help: h.rng() < 0.5 }),
    title: (h) =>
      domyObok(h)
        ? tx('Krzyk z domu obok', 'A scream from the house next door')
        : tx('Krzyk z bloku obok', 'A scream from the block next door'),
    text: (h) =>
      domyObok(h)
        ? tx(
            'Z domu obok niesie się krzyk, potem cisza. W oknie na poddaszu ktoś świeci latarką i zaraz ją gasi.',
            'A scream comes from the house next door, then silence. Someone shines a torch in the attic window and switches it off straight away.',
          )
        : tx(
            'Z bloku obok niesie się krzyk, potem cisza. Na trzecim piętrze ktoś świeci latarką i zaraz ją gasi.',
            'A scream comes from the block next door, then silence. On the third floor someone shines a torch and switches it off straight away.',
          ),
    choices: (h, d) => [
      {
        // idzie ktoś spoza warty (czuwający, a nocą wstaje najbardziej wypoczęty ze śpiących), na kafelek podwórka od
        // strony najbliższego budynku mieszkalnego (albo przy największej dziurze)
        label: tx('Wysłać kogoś sprawdzić', 'Send someone to check'),
        ok: !!h.doSprawdzenia() && h.kafelekPrzySiatce('blok') !== null,
        run: () => {
          const p = h.doSprawdzenia();
          const tile = h.kafelekPrzySiatce('blok');
          if (!p || tile === null) return;
          h.sprawdz(p.id, tile);
          h.needsOf(p.id, { rest: -10 });
          if (d.help) {
            h.mood(2, 0);
            h.later(
              { supplies: 3 },
              domyObok(h)
                ? tx(
                    'Rano przyszedł sąsiad z domu obok z workiem ziemniaków. W nocy spadł ze schodów, a wasz człowiek odprowadził go do łóżka.',
                    'In the morning the neighbour from the house next door came round with a sack of potatoes. He fell down the stairs in the night, and one of your lot helped him back to bed.',
                  )
                : tx(
                    'Rano przyszedł sąsiad z bloku obok z workiem ziemniaków. W nocy spadł ze schodów, a wasz człowiek odprowadził go do mieszkania.',
                    'In the morning the neighbour from the block next door came round with a sack of potatoes. He fell down the stairs in the night, and one of yours walked him back to his flat.',
                  ),
            );
          } else {
            h.needsAll({ safe: -3 });
            h.log(
              tx(
                `${p.name} ${g(p, 'znalazł', 'znalazła')} tylko otwarte drzwi i rozsypane słoiki. Nikogo w środku.`,
                `${p.name} found nothing but an open door and spilled jars. Nobody inside.`,
              ),
            );
          }
        },
      },
      {
        label: tx('Zamknąć drzwi i nie wychodzić', 'Lock the door and stay in'),
        ok: true,
        run: () => {
          h.needsAll({ safe: -2 });
          h.mood(-1, 0);
        },
      },
    ],
  },
  {
    id: 'bezsennosc',
    first: true,
    when: ['noc'],
    // Bezsenność dotyka osoby zarządu spoza warty przy siatce (dyżur przy kozie wolno; nie na wyprawie, nie przy
    // zabiegu) o najniższym bezpieczeństwie, czyli tej, którą kroki na klatce niepokoją najbardziej (remis: kolejność
    // osób). Najpierw z tych, którzy nie śpią (siedzą przy kozie); nocą śpią wszyscy poza wartą, więc gdy nikt nie
    // czuwa, z tych, którzy śpią (`spi`: ciągle się budzi). Karty nie ma tylko, gdy nie ma żadnych z dwóch.
    w: (h) => (h.czuwaPozaWarta().length || h.spiPozaWarta().length ? 0.8 : 0),
    make: (h) => {
      const najbardziejNiespokojny = (l: GovPerson[]) => [...l].sort((a, b) => a.needs.safe - b.needs.safe)[0];
      const czuwa = najbardziejNiespokojny(h.czuwaPozaWarta());
      if (czuwa) return { p: czuwa.id };
      const spi = najbardziejNiespokojny(h.spiPozaWarta());
      return spi ? { p: spi.id, spi: true } : null;
    },
    title: () => tx('Ktoś nie może spać', 'Someone can’t sleep'),
    text: (h, d) => {
      const p = h.spec(d.p)!;
      const kroki = dom(h) ? 'na strychu' : 'na klatce';
      const krokiEn = dom(h) ? 'in the attic' : 'in the stairwell';
      if (d.spi)
        return tx(
          `${p.name} co chwilę się budzi i nie może zasnąć. Mówi, że ciągle słyszy kroki ${kroki}.`,
          `${p.name} keeps waking up and can’t get back to sleep. ${zaimek(p, 'He', 'She')} keeps hearing footsteps ${krokiEn}.`,
        );
      return tx(
        `${p.name} siedzi przy kozie i nie może zasnąć. Mówi, że ciągle słyszy kroki ${kroki}.`,
        `${p.name} is sitting by the stove and can’t get to sleep. ${zaimek(p, 'He', 'She')} keeps hearing footsteps ${krokiEn}.`,
      );
    },
    choices: (h, d) => {
      const p = h.spec(d.p)!;
      const koza = h.kafelekKozy();
      const siatka = h.kafelekPrzySiatce('blok');
      return [
        {
          // bohater idzie do kozy (chyba że już ma tam dyżur) i drugi wolny człowiek dosiada się do niego
          label: tx(
            `Posiedzieć ${g(p, 'z nim', 'z nią')} przy kozie`,
            `Sit with ${zaimek(p, 'him', 'her')} by the stove`,
          ),
          ok: koza !== null,
          run: () => {
            const o = h.doSprawdzenia(d.p);
            if (koza !== null) {
              if (h.posterunek(d.p) !== 'koza') h.sprawdz(d.p, koza);
              if (o) h.sprawdz(o.id, koza);
            }
            if (o) h.needsOf(o.id, { rest: -5 });
            h.needsOf(d.p, { safe: 10, rest: 5 });
          },
        },
        {
          // bohater idzie na podwórko przy siatce
          label: tx(
            'Niech pilnuje, skoro nie śpi',
            `Let ${zaimek(p, 'him', 'her')} keep watch, since ${zaimek(p, 'he', 'she')} is up anyway`,
          ),
          ok: siatka !== null,
          run: () => {
            if (siatka !== null) h.sprawdz(d.p, siatka);
            h.guardBonus(1.5);
            h.needsOf(d.p, { rest: -10 });
            h.log(
              tx(
                `${p.name} ${g(p, 'przesiedział', 'przesiedziała')} resztę nocy przy oknie od podwórka.`,
                `${p.name} spent the rest of the night at the window over the yard.`,
              ),
            );
          },
        },
        {
          label: tx('Kazać się położyć', `Send ${zaimek(p, 'him', 'her')} to bed`),
          ok: true,
          run: () => h.needsOf(d.p, { safe: -5 }),
        },
      ];
    },
  },
  {
    id: 'sygnal',
    ton: 'lagodne',
    first: true,
    once: true,
    when: ['noc'],
    // gdy łańcuch „Światło w oknie” albo „Ktoś woła z dachu” (src/gov/watki-tresc.ts) jest wątkiem sezonu, to jego pierwszy krok
    // zajmuje miejsce tej karty, a chłopak z babcią albo ocaleni naprawdę stają potem pod bramą
    w: (h) => (h.place().near === 'nikt' || h.watek('swiatlo') || h.watek('dach') ? 0 : 0.8),
    make: () => ({}),
    title: () => tx('Światło w oknie naprzeciwko', 'A light in the window opposite'),
    text: (h) =>
      domyObok(h)
        ? tx(
            'W domu naprzeciwko, w oknie na poddaszu, ktoś miga latarką: trzy krótkie, trzy długie, trzy krótkie.',
            'In the house opposite, in the attic window, someone is flashing a torch: three short, three long, three short.',
          )
        : tx(
            'W bloku naprzeciwko ktoś miga latarką: trzy krótkie, trzy długie, trzy krótkie.',
            'In the block opposite, someone is flashing a torch: three short, three long, three short.',
          ),
    choices: (h) => [
      {
        label: tx('Odmigać latarką', 'Flash back'),
        ok: true,
        run: () => {
          h.mood(1, 0);
          // nikt nie staje rano pod bramą (zrobi to dopiero łańcuch „Światło w oknie”): ta karta mówi tylko o oknie
          h.later(
            {},
            tx(
              `Rano w oknie ${domyObok(h) ? 'domu' : 'bloku'} naprzeciwko było już ciemno. Ktoś tam odmigał trzy razy i poszedł spać.`,
              `In the morning the window of the ${domyObok(h) ? 'house' : 'block'} opposite was dark. Someone there flashed back three times and went to bed.`,
            ),
          );
        },
      },
      {
        label: tx('Zasłonić okna i nie świecić', 'Cover the windows and keep the lights off'),
        ok: true,
        run: () => {
          h.needsAll({ safe: 2 });
          h.log(
            tx(
              'Okna zasłonięte kocami. Z zewnątrz siedziba wygląda na pustą.',
              'The windows are covered with blankets. From outside, the place looks empty.',
            ),
          );
        },
      },
    ],
  },
  {
    id: 'kot',
    ton: 'lagodne',
    first: true,
    once: true,
    when: ['noc'],
    w: () => 0.8,
    make: () => ({}),
    title: (h) => (dom(h) ? tx('Kot w szopie', 'A cat in the shed') : tx('Kot w piwnicy', 'A cat in the basement')),
    text: (h) =>
      tx(
        `${dom(h) ? 'Z szopy' : 'Z piwnicy'} dobiega miauczenie. Rudy kot zaplątał się w starą siatkę na ziemniaki. Na obroży wydrapane: „Algorytm”.`,
        `There is miaowing ${dom(h) ? 'from the shed' : 'from the basement'}. A ginger cat has got tangled in an old potato net. Scratched on its collar: “Algorithm”.`,
      ),
    choices: (h) => [
      {
        label: tx('Uwolnić i przygarnąć', 'Free him and keep him'),
        ok: true,
        run: () => {
          h.setFlag('cat');
          h.moodAll('Algorytm się znalazł', 3, 24);
          h.log(
            tx(
              'Algorytm ma nowy dom. Śpi na kozie i nie reaguje na nic poza kaszą.',
              'Algorithm has a new home. He sleeps on the stove and responds to nothing but porridge.',
            ),
          );
        },
      },
      {
        label: tx(
          `Niech łapie myszy ${dom(h) ? 'w szopie' : 'w piwnicy'}`,
          `Let him catch mice ${dom(h) ? 'in the shed' : 'in the basement'}`,
        ),
        ok: true,
        run: () =>
          h.later(
            { supplies: 1 },
            tx(
              `Kot przez noc wyłapał myszy ${dom(h) ? 'w szopie' : 'w piwnicy'}. Zapasy całe, jeden słoik nawet się znalazł.`,
              `Overnight the cat cleared the mice out of the ${dom(h) ? 'shed' : 'basement'}. The food is safe, and a lost jar even turned up.`,
            ),
          ),
      },
    ],
  },
  {
    id: 'ulewa',
    first: true,
    gap: 24,
    when: ['noc'],
    w: (h) => (h.res.opal >= 3 ? 0.8 : 0),
    make: () => ({}),
    title: () => tx('Ulewa', 'Downpour'),
    text: () =>
      tx(
        'Leje od północy. Przez dziurę w daszku nad wejściem kapie prosto na drewno przy składzie.',
        'It has been pouring since midnight. Water drips through a hole in the porch roof straight onto the woodpile.',
      ),
    choices: (h) => [
      {
        label: tx('Przenieść drewno do kuchni', 'Move the wood into the kitchen'),
        ok: !!h.rested(),
        run: () => {
          const p = h.rested();
          if (p) h.needsOf(p.id, { rest: -8 });
          h.log(
            tx(
              'Drewno przeniesione pod dach. Kto nosił, ten jest mokry do pasa.',
              'The wood is under cover. Whoever carried it is soaked to the waist.',
            ),
          );
        },
      },
      {
        label: tx('Zostawić, jakoś to będzie', 'Leave it, it’ll be fine'),
        ok: true,
        run: () =>
          h.later(
            { wood: -2 },
            tx('Część drewna zamokła i nie chce się palić.', 'Some of the wood got soaked and won’t burn.'),
          ),
      },
    ],
  },
  {
    id: 'przymrozek',
    first: true,
    gap: 24,
    when: ['noc'],
    // szron tylko przy mrozie na dworze (pierwsze jesienne noce mają kilka stopni), sąsiadka tylko, gdy jest skąd
    w: (h) => (h.outdoor() <= 1 && h.neighbour() !== null ? 0.7 : 0),
    make: () => ({}),
    title: () => tx('Przymrozek', 'A hard frost'),
    text: (h) =>
      tx(
        `Na siatce szron. Sąsiadka ${h.neighbour() ?? 'zza płotu'} puka do drzwi: u niej ${uNiej(h)} zamarzła woda w wiadrze, a mąż kaszle.`,
        `Frost on the fence. A neighbour ${h.neighbourEn() ?? 'from over the fence'} knocks at the door: ${uNiejEn(h)}, the water in the bucket has frozen solid, and her husband has a cough.`,
      ),
    choices: (h) => [
      {
        label: tx('Dać drewno (Drewno 2)', 'Give her some wood (Wood 2)'),
        ok: h.res.opal >= 2,
        run: () => {
          h.addRes('opal', -2);
          h.mood(2, 0);
        },
      },
      {
        label: tx('Zaprosić ich do kozy', 'Ask them in to get warm'),
        ok: true,
        run: () => {
          h.mood(1, 0);
          h.needsAll({ safe: 3 });
          h.log(
            tx(
              'Przy kozie robi się ciasno, ale nikt nie narzeka.',
              'It gets crowded by the stove, but nobody complains.',
            ),
          );
        },
      },
      { label: tx('Nie otwierać', 'Don’t open the door'), ok: true, run: () => h.mood(-1, 1) },
    ],
  },
  {
    id: 'latarka',
    ton: 'lagodne',
    first: true,
    once: true,
    when: ['dzien', 'wieczor'],
    w: (h) => (h.neighbour() === null ? 0 : 0.9),
    // w bloku z mieszkańcami z osobą latarkę przynosi najstarsza mieszkanka (albo mieszkaniec) po imieniu, z klatki
    make: (h) => bohaterKarty(h),
    title: () => tx('Latarka na korbkę', 'A wind-up torch'),
    text: (h, d) => {
      const p: OsobaKarty | null = d.lok ? d.p : null;
      if (p)
        return tx(
          `${g(p, 'Pan', 'Pani')} ${p.name} z waszej klatki ${g(p, 'przyniósł', 'przyniosła')} latarkę na korbkę. Minuta kręcenia daje pięć minut światła, a ${g(p, 'on', 'ona')} już nie ma siły kręcić.`,
          `${p.name} from your stairwell has brought round a wind-up torch. A minute of cranking gives five minutes of light, and ${zaimek(p, 'he', 'she')} hasn’t the strength to crank it any more.`,
        );
      return tx(
        `Pani Halina ${h.neighbour() ?? 'zza płotu'} przyniosła latarkę na korbkę. Minuta kręcenia daje pięć minut światła, a ona już nie ma siły kręcić.`,
        `Old Halina ${h.neighbourEn() ?? 'from over the fence'} has brought round a wind-up torch. A minute of cranking gives five minutes of light, and she hasn’t the strength to crank it any more.`,
      );
    },
    choices: (h) => [
      {
        label: tx('Dla warty', 'For the watch'),
        ok: true,
        run: () => {
          h.setFlag('flashlight');
          h.log(
            tx(
              `Latarka wisi ${h.words().brama.przy}. Warta ze światłem płoszy lepiej.`,
              `The torch hangs at ${h.wordsEn().brama}. A watch with a light scares people off better.`,
            ),
          );
        },
      },
      {
        label: tx('Na wyprawy', 'For supply runs'),
        ok: true,
        run: () => {
          h.setFlag('torch');
          h.log(
            tx(
              `Latarka idzie na wyprawy. Mniej potykania się po ${dom(h) ? 'ciemnych piwnicach i garażach' : 'ciemnych klatkach'}.`,
              `The torch goes along on supply runs. Less stumbling around ${dom(h) ? 'dark cellars and garages' : 'dark stairwells'}.`,
            ),
          );
        },
      },
    ],
  },
  {
    id: 'domofon',
    ton: 'lagodne',
    once: true,
    when: ['dzien'],
    w: () => 0.8,
    make: () => ({}),
    title: (h) =>
      dom(h)
        ? tx('Wideodomofon przy furtce ożył', 'The video doorbell at the garden gate came to life')
        : tx('Domofon przy bramie ożył', 'The intercom at the gate came to life'),
    text: (h) =>
      dom(h)
        ? tx(
            'Wideodomofon przy furtce zapiszczał pierwszy raz od lat. Na ekraniku: „Twoja subskrypcja Bezpieczny Dom wygasła. Odnów za 49,99 kredytów miesięcznie”.',
            'The video doorbell at the garden gate beeped for the first time in years. On its little screen: “Your SafeHome subscription has expired. Renew for 49.99 credits a month.”',
          )
        : tx(
            'Domofon przy bramie zapiszczał pierwszy raz od lat. Na ekraniku: „Twoja subskrypcja Bezpieczne Osiedle wygasła. Odnów za 49,99 kredytów miesięcznie”.',
            'The intercom at the gate beeped for the first time in years. On its little screen: “Your SafeEstate subscription has expired. Renew for 49.99 credits a month.”',
          ),
    choices: (h) => [
      {
        label: tx('Rozkręcić na części', 'Strip it for parts'),
        ok: true,
        run: () => {
          h.addRes('czesci', 1);
          h.log(
            tx(
              'W środku płytka w żywicy, cała, i kable bez izolacji. Bakteria zjadła wszystko, co gołe.',
              'Inside: a circuit board sealed in resin, intact, and wires without a scrap of insulation. The bacterium ate everything that was bare.',
            ),
          );
        },
      },
      {
        label: tx('Zostawić, niech piszczy', 'Leave it beeping'),
        ok: true,
        run: () => {
          h.mood(1, -1);
          h.log(
            tx(
              'Ludzie przychodzą posłuchać, jak domofon prosi o pieniądze. Śmieją się pierwszy raz od dawna.',
              'People come by to listen to the intercom asking for money. They laugh for the first time in ages.',
            ),
          );
        },
      },
    ],
  },
  {
    // z sytuacji, nie z losowania: koza pierwszy raz się pali, ktoś widzi dym i przychodzi (wydarzenia.ts, eventTick)
    id: 'dym',
    ton: 'lagodne',
    once: true,
    when: ['dzien', 'wieczor', 'noc'],
    w: () => 0,
    // w bloku z mieszkańcami z osobą przychodzi najstarsza mieszkanka (albo mieszkaniec) po imieniu, z klatki
    make: (h) => bohaterKarty(h),
    title: () => tx('Dym z komina', 'Smoke from the chimney'),
    text: (h, d) => {
      const p: OsobaKarty | null = d.lok ? d.p : null;
      const from = p ? 'z waszej klatki' : (h.neighbour() ?? 'zza płotu');
      const home = from === 'zza płotu' ? 'w domu' : 'w mieszkaniu';
      const smoke =
        h.place().kind === 'dom'
          ? 'Nad dachem idzie dym z komina. Ktoś go zobaczył: do drzwi puka'
          : 'Nad kuchnią idzie dym z rury wystawionej przez okno. Ktoś go zobaczył: puka';
      const fromEn = p ? 'from your stairwell' : (h.neighbourEn() ?? 'from over the fence');
      const homeEn = from === 'zza płotu' ? 'at her house' : 'in her flat';
      const smokeEn =
        h.place().kind === 'dom'
          ? 'Smoke is rising from the chimney. Someone has seen it: at the door is'
          : 'Smoke is rising from the stovepipe stuck out of the kitchen window. Someone has seen it: knocking at the door is';
      if (p)
        return tx(
          `${smoke} ${g(p, 'pan', 'pani')} ${p.name} ${from}, ze słoikiem powideł z 2049 roku. Pyta, czy może posiedzieć przy kozie, bo ${g(p, 'u niego', 'u niej')} ${home} jest sześć stopni.`,
          `${smokeEn} ${p.name} ${fromEn}, with a jar of plum jam from 2049. ${zaimek(p, 'He', 'She')} asks if ${zaimek(p, 'he', 'she')} can sit by your stove for a bit, because it’s six degrees in ${zaimek(p, 'his', 'her')} flat.`,
        );
      return tx(
        `${smoke} pani Krysia ${from}, ze słoikiem powideł z 2049 roku. Pyta, czy może posiedzieć przy kozie, bo u niej ${home} jest sześć stopni.`,
        `${smokeEn} old Krysia ${fromEn}, with a jar of plum jam from 2049. She asks if she can sit by your stove for a bit, because it’s six degrees ${homeEn}.`,
      );
    },
    choices: (h, d) => {
      const p: OsobaKarty | null = d.lok ? d.p : null;
      const from = p ? 'z waszej klatki' : (h.neighbour() ?? 'zza płotu');
      const imie = p ? p.first : 'Krysia';
      return [
        {
          label: tx('Zaprosić do kozy', `Ask ${p ? zaimek(p, 'him', 'her') : 'her'} in to get warm`),
          ok: true,
          run: () => {
            h.addRes('jedzenie', 2);
            h.mood(2, 0);
            h.log(
              tx(
                `${p ? g(p, 'Pan', 'Pani') : 'Pani'} ${imie} opowiada, jak ${h.place().kind === 'dom' ? 'wyglądała ulica' : 'wyglądało osiedle'}, kiedy jeszcze jeździły autobusy.`,
                `${imie} tells you what the ${h.place().kind === 'dom' ? 'street' : 'estate'} looked like back when the buses still ran.`,
              ),
            );
          },
        },
        {
          label: tx('Wziąć słoik i podziękować', `Take the jar and thank ${p ? zaimek(p, 'him', 'her') : 'her'}`),
          ok: true,
          run: () => {
            h.addRes('jedzenie', 2);
            h.mood(-1, 1);
            h.log(
              p
                ? tx(
                    `${g(p, 'Pan', 'Pani')} ${imie} ${g(p, 'wrócił', 'wróciła')} do zimnego mieszkania. Na klatce już o tym wiedzą.`,
                    `${imie} went back to ${zaimek(p, 'his', 'her')} cold flat. The whole stairwell already knows.`,
                  )
                : from === 'zza płotu'
                  ? tx(
                      'Pani Krysia wróciła do zimnego domu. Cała ulica już o tym wie.',
                      'Krysia went back to her cold house. The whole street already knows.',
                    )
                  : from === 'z bloku obok'
                    ? tx(
                        'Pani Krysia wróciła do zimnego mieszkania. W bloku obok już o tym wiedzą.',
                        'Krysia went back to her cold flat. The block next door already knows.',
                      )
                    : tx(
                        'Pani Krysia wróciła do zimnego mieszkania. Na klatce już o tym wiedzą.',
                        'Krysia went back to her cold flat. The whole stairwell already knows.',
                      ),
            );
          },
        },
      ];
    },
  },
  {
    // z sytuacji, nie z losowania: po zgonie kogoś z imieniem (wydarzenia.ts, eventTick, GovInput.dead i
    // GovState.pogrzebN), w ciągu doby, za dnia albo wieczorem
    id: 'pogrzeb',
    when: ['dzien', 'wieczor'],
    w: () => 0,
    make: () => null,
    title: () => tx('Pogrzeb', 'A funeral'),
    text: (h, d: DanePogrzebu) => {
      const s = h.words();
      const e = h.wordsEn();
      const co = PRZYCZYNA[d.cause] ?? d.cause;
      // zarząd (id osoby) albo mieszkaniec (puste id)
      const kim = d.id
        ? tx(`${g(d, 'Był', 'Była')} z ${s.zarzad.dk}.`, `${zaimek(d, 'He', 'She')} was on ${e.krotko}.`)
        : tx(
            `${g(d, 'Mieszkał', 'Mieszkała')} ${dom(h) ? 'pod waszym dachem' : 'w waszej klatce'}.`,
            `${zaimek(d, 'He', 'She')} lived ${dom(h) ? 'under your roof' : 'in your stairwell'}.`,
          );
      const reszta = tx(
        `Ludzie stoją na podwórku i czekają, co powie ${s.zarzad.krotko}. Akt zgonu trzeba by wystawić w aplikacji, której serwery zgasły razem z siecią.`,
        `People are standing in the yard waiting to hear what ${e.krotko} will say. A death certificate would need an app whose servers went down with the grid.`,
      );
      // tryb zombie: co z ciałem (dobite, zanim wstało, albo nikt go nie dobił i już go nie ma)
      const cialo = !d.cialo
        ? null
        : d.cialo === 'dobite'
          ? tx(
              `Dobiliście ${g(d, 'go', 'ją')}, zanim zdążył${g(d, '', 'a')} wstać. Nikt nie ma pretensji, ale nikt też nie patrzy w oczy temu, kto to zrobił.`,
              `You finished ${zaimek(d, 'him', 'her')} off before ${zaimek(d, 'he', 'she')} could get up. Nobody blames you, but nobody looks the one who did it in the eye either.`,
            )
          : tx(
              `Nikt ${g(d, 'go', 'jej')} nie dobił. Ciała nie ma na podwórku: wstało albo zostało za siatką, i nikt nie pyta, które z dwojga jest gorsze.`,
              `Nobody finished ${zaimek(d, 'him', 'her')} off. There is no body in the yard: it either got up or stayed beyond the fence, and nobody asks which is worse.`,
            );
      const zdania = [tx(`${d.name} nie żyje, ${co}.`, `${d.name} has died ${przyczynaEn(d.cause)}.`), kim];
      if (cialo) zdania.push(cialo);
      zdania.push(reszta);
      return tx(zdania.map((z) => z.pl).join(' '), zdania.map((z) => z.en).join(' '));
    },
    choices: (h, d: DanePogrzebu) => {
      const miejsce = dom(h) ? tx('w ogrodzie', 'in the garden') : tx('pod trzepakiem', 'under the carpet rack');
      // zombie bez ciała na mapie (wstało albo zostało za siatką): nie ma kogo grzebać, jest tabliczka
      const tabliczka = !!d.cialo && d.cialo !== 'dobite';
      const why = `Pożegnaliśmy: ${d.name.split(' ')[0]}`;
      /** wszyscy, którzy znali zmarłego: zarząd i mieszkańcy z osobą */
      const zalobnicy = () => [...h.zarzad().map((p) => p.id), ...h.lokatorzy().map((l) => l.id)];
      return [
        {
          label: tabliczka
            ? tx(`Postawić tabliczkę ${miejsce.pl}`, `Put up a plaque ${miejsce.en}`)
            : tx(`Pochować ${miejsce.pl}`, `Bury ${zaimek(d, 'him', 'her')} ${miejsce.en}`),
          ok: true,
          run: () => {
            for (const id of zalobnicy()) h.moodOf(id, why, 2, 24);
            // kopie ten, kto może: najbardziej wypoczęty spoza warty, wyprawy i zabiegu
            const kopacz = h.doSprawdzenia();
            if (kopacz) h.needsOf(kopacz.id, { rest: -10 });
            const gdzie = wielka(miejsce.pl);
            const where = wielka(miejsce.en);
            h.log(
              tabliczka
                ? tx(
                    `${gdzie} stanęła tabliczka z napisem „${d.name}”.${kopacz ? ` Dołek pod słupek ${g(kopacz, 'wykopał', 'wykopała')} ${kopacz.name}.` : ''}`,
                    `${where} stands a plaque reading “${d.name}”.${kopacz ? ` ${kopacz.name} dug the hole for the post.` : ''}`,
                  )
                : tx(
                    `${d.name} leży teraz ${miejsce.pl}.${kopacz ? ` Grób ${g(kopacz, 'wykopał', 'wykopała')} ${kopacz.name}.` : ''}`,
                    `${d.name} now lies ${miejsce.en}.${kopacz ? ` ${kopacz.name} dug the grave.` : ''}`,
                  ),
            );
          },
        },
        {
          label: tx('Pożegnać przy kozie', 'Say goodbye by the stove'),
          ok: true,
          run: () => {
            for (const id of zalobnicy()) h.moodOf(id, why, 1, 24);
            h.log(
              tx(
                `Przy kozie zrobiło się cicho. Każdy powiedział o ${g(d, 'zmarłym', 'zmarłej')} jedno zdanie, a potem ktoś dorzucił drewna.`,
                `It went quiet by the stove. Everyone said one sentence about ${zaimek(d, 'him', 'her')}, and then somebody put more wood on.`,
              ),
            );
          },
        },
        {
          label: tx('Bez ceremonii', 'No ceremony'),
          ok: true,
          run: () => {
            h.mood(0, 1);
            h.log(
              tx(
                // imię w mianowniku po dwukropku: w src/gov nie ma odmiany, a „wykreślił Ewelina” byłoby błędem
                `Bez ceremonii. Ktoś skreślił w grafiku dyżurów linijkę: ${d.name}. I tyle. Ludzie to zauważyli.`,
                `No ceremony. Somebody crossed a line off the duty rota: ${d.name}. That was it. People noticed.`,
              ),
            );
          },
        },
      ];
    },
  },
];

/** dane karty `pogrzeb` (JSON w stanie zarządu): zmarły z GovInput.dead; `cialo` tylko w trybie zombie, a `lezy` czeka
    na pogrzeb, więc w karcie jest tylko `dobite` albo `brak` */
export interface DanePogrzebu {
  /** id osoby zarządu; puste dla mieszkańca z imieniem */
  id: string;
  name: string;
  f: boolean;
  cause: string;
  cialo?: Exclude<Cialo, 'lezy'>;
}

export { names as peopleNames };
