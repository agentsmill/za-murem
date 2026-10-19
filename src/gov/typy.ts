/* Zarząd spółdzielni (M1): typy wąskiego interfejsu z symulacją. Moduł src/gov nie importuje src/sim.
   Wejście to odczyt stanu gry o nazwach jak snapshot() z src/sim/snapshot.ts, wyjście to skutki, które
   symulacja stosuje u siebie (zapasy, potrzeby, chwilowe nastroje, ludzie poza mapą).
   Zdania, które zarząd składa sam (kronika, raport, karta nocy, okna), są typu Tx: od razu po polsku i po
   angielsku (src/core/jezyk.ts), więc stan nie zależy od języka gry. Powód nastroju (GovMood.why) trafia do stanu
   symulacji i zostaje polskim napisem, który interfejs tłumaczy przy rysowaniu. */

import type { Dom, EndingId, LawPath, TechDom } from '../content/data.ts';
import type { ActiveEvent } from '../content/events.ts';
import type { Person } from '../content/people.ts';
import type { Tx } from '../core/jezyk.ts';
import type { RngState } from '../core/rng.ts';
import type { Miejsce } from '../world/miasto.ts';
import type { Cel } from './wyprawy.ts';
import type { Droga, StanZwyciestwa } from './zwyciestwo.ts';

// ---------------------------------------------------------------- wejście

export interface GovNeeds {
  food: number;
  warm: number;
  rest: number;
  health: number;
  /** bezpieczeństwo */
  safe: number;
  mood: number;
}

/** kafelek mapy w metrach (siatka 1 m; kamera i znaczniki liczą w kafelkach) */
export interface Punkt {
  x: number;
  y: number;
}

/** osoba z zarządu (jak SimPerson w snapshot.ts) */
export interface GovPerson {
  pawn: number;
  id: string;
  name: string;
  first: string;
  f: boolean;
  age: number;
  prof: string;
  skills: Partial<Record<Dom, number>>;
  traits: string[];
  needs: GovNeeds;
  /** bieżąca praca albo null */
  job: string | null;
  asleep: boolean;
  inside: boolean;
  /** posterunek warty, jeśli stoi ('brama', 'd<id>', 'koza', 'siatka', 'wieza'), jak SimPerson.post. Z tym polem zarząd wie, że
      symulacja sama prowadzi noc na posterunku (kto stoi, ten nie śpi), więc rano nie odejmuje już sił */
  post?: string | null;
  /** broń (id z src/sim/bron.ts) i jej rodzaj do warty i wypraw: gołe ręce (albo broń palna bez amunicji),
      broń do walki wręcz, dzida (sięga przez siatkę), broń palna albo kusza z amunicją */
  weapon?: string | null;
  arm?: Arm;
  /** ugryziony (zakażony) */
  bitten?: boolean;
  /** poza mapą na wyprawie (wyszedł bramą i jeszcze nie wrócił); bez pola: na miejscu. Mapa miasta nie wysyła
      drugi raz kogoś, kto już jest w drodze */
  away?: boolean;
}

export type Arm = 'brak' | 'wrecz' | 'dzida' | 'palna';
export type GameMode = 'zwykly' | 'zombie';

/** zapasy: drewno i jedzenie jak SimStock, materiały do łatania siatki przyjdą w turze 2 */
export interface GovStock {
  /** całe drewno w sztukach */
  wood: number;
  woodSklad?: number;
  woodLoose?: number;
  /** zapasy jedzenia (porcje) i ugotowane porcje */
  supplies: number;
  meals?: number;
  scrap?: number;
  parts?: number;
  meds?: number;
}

/** dziura w siatce (tura 2, kontrakt w docs/M1-wycinek.md) */
export interface GovHole {
  id: number;
  /** wielkość 0–1: większą łatwiej przejść */
  size: number;
  /** nazwa miejsca do tekstów, np. „przy garażach” (po angielsku „by the garages”) */
  name?: Tx;
  /** kafelki dziury (numery kafelków mapy, rosnąco), skąd karta „Sprawdzić” bierze miejsce, gdy nie zna stron
      (`GovInput.strony`); symulacja je podaje, atrapy w testach nie muszą */
  tiles?: number[];
}

export interface GovFence {
  holes: GovHole[];
  /** średnia wytrzymałość siatki 0–1 */
  durability: number;
  gateOpen?: boolean;
}

export interface GovLight {
  /** ognisko pali się na podwórku */
  campfire: boolean;
  /** lampa albo latarnia przy bramie */
  gateLamp: boolean;
}

/** miejsce siedziby ze świata (src/gov/miejsce.ts): z niego zarząd bierze warianty tekstów i warunki wydarzeń */
export interface GovPlace {
  /** dom jednorodzinny albo blok (i każdy budynek z wieloma mieszkaniami) */
  kind: 'dom' | 'blok';
  /** bloki i domy w promieniu 120 m od siedziby (bez niej) */
  blocks: number;
  houses: number;
  /** jakich sąsiadów jest więcej; 'nikt', gdy w promieniu nie ma budynku mieszkalnego */
  near: 'bloki' | 'domy' | 'nikt';
  /** metry do najbliższego sklepu (do 300 m), garaży (do 150 m), przychodni albo apteki (do 300 m); null: brak */
  shop: number | null;
  garages: number | null;
  clinic: number | null;
  /** najwyższy budynek do 200 m, z którego widać siedzibę */
  tower: 'wiezowiec' | 'blok' | 'szkola' | 'kosciol' | 'hala' | 'market' | null;
}

/** mieszkaniec siedziby z osobą z generatora mieszkańców: te pola osoby zarządu co `GovPerson` bez pracy, wojny i warty
    (lokator nie dostaje poleceń od zarządu), a bez historii, odnośnika i rodziny z generatora (to czyta tylko interfejs) */
export interface GovLokator {
  pawn: number;
  /** id osoby w stanie symulacji (s1, s2…), inne niż id osób zarządu */
  id: string;
  name: string;
  first: string;
  f: boolean;
  age: number;
  prof: string;
  skills: Partial<Record<Dom, number>>;
  traits: string[];
  needs: GovNeeds;
  asleep: boolean;
  inside: boolean;
  /** kafelek mapy, na którym stoi */
  tile: number;
}

export interface GovInput {
  /** krok symulacji (ticki) */
  tick: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 jesień, 1 zima, 2 wiosna, 3 lato */
  season: number;
  night: boolean;
  outdoor: number;
  kitchen: number | null;
  /** pali się koza zarządu albo któreś z nowych palenisk naszych mieszkań (koza z beczki, kocioł) */
  kozaLit: boolean;
  people: GovPerson[];
  /** mieszkańcy siedziby z osobą z generatora mieszkańców (pionki `resident`, bez sąsiadów), w kolejności pionków;
      bez generatora (opcja `mieszkancy` w createSim) i w ręcznym wejściu testów pola nie ma, a host oddaje pustą listę */
  lokatorzy?: GovLokator[];
  stock: GovStock;
  /** sekundy przy ekranie od startu gry (bez pauzy); przy tempie 1× to tick / 20 */
  screen: number;
  /** stan siatki; bez niego zarząd zakłada jedną dziurę i bramę */
  fence?: GovFence;
  light?: GovLight;
  /** mieszkańcy siedziby poza zarządem (tura 2) i wolne miejsca */
  residents?: number;
  cap?: number;
  /** spalone meble od początku gry: liczba albo lista jak SimSnapshot.burned */
  burned?: number | readonly unknown[];
  /** nazwa siedziby do tekstów, np. „Obrońców Wybrzeża 4” */
  hqName?: string;
  /** miejsce siedziby (dom albo blok, co w okolicy); bez niego zarząd zakłada blok wśród bloków */
  place?: GovPlace;
  /** warta spoza karty nocy (polecenie z menu): kto stoi i gdzie ('brama' albo 'd<id dziury>'); bez pola
      zarząd bierze osoby z pracą 'guard' za wartę w nieznanym miejscu */
  guards?: { id: string; post: string }[];
  /** tryb zombie: szwendacze przy siatce (do 12 m), napierający, liczniki od początku gry (zabici, przerwania
      siatki, ugryzienia) i wielkość stada tej nocy. `przy`: prawdziwy szwendacz najbliżej siatki, nie dalej niż 3 m
      od jej kafelka (numer pionka i jego kafelek); remis rozstrzyga niższy numer pionka; bez pola: nikogo przy siatce */
  horde?: {
    near: number;
    pressing: number;
    killed: number;
    breaches: number;
    bites: number;
    tonight: number;
    przy?: { pawn: number; x: number; y: number };
  };
  /** zmarli (zarząd z id, mieszkańcy z pustym id) od początku gry, po kolei; lista tylko rośnie */
  dead?: { id: string; name: string; cause: string; tick: number }[];
  /** napaści zarządu na obcych (handlarza, wędrowca) od początku gry, po kolei; lista tylko rośnie, bez pola: żadnej */
  napady?: readonly { kto: 'handlarz' | 'wedrowiec'; tick: number }[];
  /** mapa miasta: wszystkie miejsca z okolicy (sklepy i usługi z OSM do około 720 m od adresu), także te z mapy
      lokalnej (koło 192 m), posortowane po odległości. Miejsc z mapy lokalnej nie wybiera karta nocy
      (`wybierzCeleNocy`) i nie wysyła się do nich wyprawy (`powodOdmowy`), ale karta miejsca je pokazuje. Bez pola
      albo pusta: karta nocy gra na dzisiejszych TARGETS. Zapas miejsca liczy się z klucza, nie ze stanu gry */
  okolica?: readonly Miejsce[];
  /** warunki zwycięstwa (src/gov/zwyciestwo.ts): ludzie pod naszym zarządem, czyli zarząd i mieszkańcy naszych
      budynków; bez pola zarząd liczy `people.length + residents` */
  ludnosc?: number;
  /** ilu ludzi mieszkało w kwadracie domu w 2021 roku według NSP; z tego liczy się cel drogi ludnościowej, bez pola
      (albo z liczbą bez sensu) cel to 250 */
  ludnosc2021?: number;
  /** strony świata dla kart „Krzyk z bloku obok”, „Hałas za garażami” i „Ktoś nie może spać”: kafelek podwórka przy
      siatce od strony najbliższych garaży (do 150 m od siedziby) i od strony najbliższego budynku mieszkalnego za
      siatką (do 120 m), numer kafelka jak w `GovHole.tiles` (y * rozmiar + x). `garaze` i `blok` liczy `govInput` raz
      na kształt siatki; strony, których świat nie ma, nie występują, a bez pola karta bierze największą dziurę (albo
      nie pozwala sprawdzić). `koza`: wolny kafelek przed kozą zarządu we wnętrzu jego mieszkania, bez kozy brak */
  strony?: { garaze?: number; blok?: number; koza?: number };
  /** teren: ile budynków wspólny płot dołączył do naszego obwodu; bez pola droga terenu nie ma jak liczyć kamieni */
  teren?: { przylaczone: number };
  /** badania (src/sim/badania.ts): czy stoi pracownia, ile technologii z drzewka jest zbadanych (identyfikatory spoza
      drzewka się nie liczą), najwyższa era wśród nich (0: nic), czy technologia końcowa jest zbadana i czy sieć jest
      już włączona (polecenie `siec` w pracowni); bez pola zarząd zakłada grę bez badań. Czyta je rama zwycięstwa. */
  badania?: { pracownia: boolean; zbadane: number; era: number; koncowa: boolean; siecWlaczona: boolean };
  /** książki osady według dziedziny, z symulacji (w wiedzy liczą się najwyżej 2 na dziedzinę); bez pola: żadnych */
  books?: Partial<Record<TechDom, number>>;
  /** zbadane technologie z tickiem ukończenia, od najstarszej, z nazwą i działaniem w obu językach; zarząd dopisuje do
      kroniki każde odkrycie z tickiem nowszym niż `GovState.czytane` i podnosi zaufanie o 1 (src/gov/znaleziska.ts).
      Bez pola (gra bez badań) żadnych. */
  odkrycia?: readonly { id: string; tick: number; nazwa: Tx; dzialanie: Tx }[];
  /** książki znalezione w przeszukanych pomieszczeniach (dziennik symulacji `bookLog`), po kolei; `podpalka`: trzecia
      z dziedziny, poszła na drewno. Zarząd dopisuje do kroniki wpisy z tickiem nowszym niż `GovState.czytane`.
      Książki z wydarzenia „książki” tu nie trafiają: wydarzenie ma własny wpis. Bez pola: żadnych. */
  znaleziska?: readonly { tick: number; dom: TechDom; tytul: string; podpalka?: boolean }[];
  /** zbadane technologie (identyfikatory z src/sim/badania.ts); EventHost.tech czyta stąd, bez pola żadna */
  techDone?: readonly string[];
  /** wiedza osady w dziedzinach, ta sama co na tablicy badań (najlepsza osoba zarządu albo lokatora siedziby na
      miejscu plus najwyżej 2 książki); bez pola EventHost.know liczy po staremu z `people` */
  know?: Partial<Record<TechDom, number>>;
  /** ile osób mieści wieża z rusztowań (kafelki jej obrysu: 2×2 to 4); karta nocy dostaje wtedy „Wartę na wieży”, klucz
      `warta:wieza`, dla najwyżej tylu osób. src/sim/gov.ts wypełnia je tylko przy stojącej wieży */
  wieza?: number;
  /** ile palenisk (koza zarządu, kozy z beczek, kocioł liczony jako kilka) pali drewno nocą; bez pola jedno */
  paleniska?: number;
}

// ---------------------------------------------------------------- wyjście

/** zapasy w jednostkach symulacji: drewno w sztukach, jedzenie w porcjach */
export type StockKey = 'wood' | 'supplies' | 'scrap' | 'parts' | 'meds';
export type StockDelta = Record<StockKey, number>;

/** chwilowy nastrój do Mood w symulacji */
export interface GovMood {
  id: string;
  why: string;
  d: number;
  hours: number;
}

export interface GovEffects {
  /** zmiany zapasów (ujemne: strata) */
  stock: StockDelta;
  /** zmiany potrzeb osób (punkty 0–100) */
  needs: { id: string; d: Partial<GovNeeds> }[];
  moods: GovMood[];
  /** kto wyszedł na wyprawę poza mapę i kiedy wraca (dzień i godzina) */
  away: { id: string; day: number; hour: number }[];
  /** kto wrócił z wyprawy */
  back: string[];
  /** nowe osoby (do rdzenia), odchodzące osoby, zmiana liczby mieszkańców */
  join: Person[];
  leave: string[];
  residents: number;
  /** chorzy do rozdania (system chorób przyjdzie w M2) */
  sick: number;
  /** łatanie dziur w siatce (najpierw największa) */
  patch: number;
  /** pożar od kozy */
  fire: boolean;
  /** plan napadu na tę noc, żeby symulacja mogła pokazać szabrowników (tura 2) */
  raid: RaidPlan | null;
  /** kto i gdzie trzyma wartę tej nocy (symulacja trzyma ich na nogach przy siatce) */
  guards: { id: string; post: string }[];
  /** wpisy do kroniki */
  log: Tx[];
  /** rozstrzygnięcie napadu w tym wywołaniu (w minucie napadu); null albo brak, gdy nic się nie rozstrzygnęło */
  raidResult?: RaidResult | null;
  /** znaleziona broń (id z src/sim/bron.ts) i amunicja do magazynu */
  arms?: string[];
  ammo?: Partial<Record<'naboje' | 'loftki' | 'belty', number>>;
  /** ugryzieni na wyprawie (zakażeni) */
  bitten?: string[];
  /** powroty wypraw dziennych z tego wywołania, po jednej pełnej linii na wyprawę (ta sama, co w `log`); tylko za dnia,
      powrót przesunięty na rano idzie do raportu nocy. Interfejs pokazuje je graczowi, także po zamknięciu okna */
  powroty?: Tx[];
  /** znalezione książki (dziedziny), po jednej na sztukę; symulacja kładzie je na półkę osady (dodajKsiazke), trzecią
      z dziedziny zamienia na drewno; tablica powstaje przy pierwszej książce */
  books?: TechDom[];
  /** osoba zarządu (id z generatora) atakuje pionek o tym numerze, np. szwendacza przy siatce z karty „Szwendacz”;
      symulacja wstawia polecenie 'attack' (pionka, którego już nie ma, polecenie pomija). Tablica powstaje przy
      pierwszym ataku */
  atak?: { id: string; pawn: number }[];
  /** mieszkańcy z osobą (id osoby, jak `GovLokator.id`), którzy przechodzą do zarządu: ten sam pionek i ta sama osoba,
      rodzaj `core`, potrzeby zostają, a łóżko w mieszkaniu mieszkańców jest wolne od razu, bo zarząd śpi w mieszkaniu
      siedziby (`awansuj` w src/sim/sim.ts). Tablica powstaje przy pierwszym awansie */
  awans?: string[];
  /** osoby (mieszkańcy z osobą i osoby zarządu), które wychodzą bramą: idą do bramy, za bramą ulicą daleko od siatki
      i znikają, łóżko jest wolne od razu (`wyprowadz`). Tablica powstaje przy pierwszym wyrzuceniu */
  wyrzuc?: string[];
  /** osoba zarządu idzie na kafelek (od strony podwórka, najbliższy osiągalny), stoi tam 10 minut gry i wraca do
      zajęć (`sprawdz`). Tablica powstaje przy pierwszym sprawdzeniu */
  sprawdz?: { id: string; tile: number }[];
}

export interface RaidPlan {
  day: number;
  /** minuta gry (od północy pierwszego dnia), o której podchodzą */
  at: number;
  /** 'brama' albo 'd<id dziury>' */
  post: string;
  where: Tx;
  /** siła napadu (ta sama, z którą zarząd rozstrzygnie napad) */
  attack?: number;
  /** ilu szabrowników przychodzi (1–3, z siły) */
  people?: number;
}

/** wynik napadu dla symulacji: co się stało, gdzie, przy jakiej sile i obronie, co zabrali */
export interface RaidResult {
  day: number;
  outcome: 'odparty' | 'wtargnięcie';
  post: string;
  where: Tx;
  attack: number;
  defense: number;
  /** zabrane zapasy w liczbach dodatnich (przy odparciu same zera) */
  stolen: StockDelta;
  /** wartownicy, którzy zasnęli (nie bronili) */
  slept: string[];
}

/** ciągłe skutki podpisanych uchwał dla symulacji */
export interface LawEffects {
  /** mnożnik zjadanego jedzenia */
  foodMult: number;
  /** mnożnik kary w nastroju za palenie mebli */
  burnMood: number;
  /** wspólny kocioł: posiłek dla wszystkich z jednego garnka */
  sharedMeals: boolean;
  /** od której godziny ludzie biorą się do pracy */
  workStart: number;
  /** brama na kłódkę od 20:00 */
  gateClosed: boolean;
}

// ---------------------------------------------------------------- karta nocy, uchwały, raport

export type LootKey = StockKey;

export interface NightOption {
  /** 'sen', 'warta:brama', 'warta:d<id>', 'warta:wieza', 'wyprawa:blisko', 'wyprawa:daleko' */
  key: string;
  label: Tx;
  ok: boolean;
  /** dlaczego nie można */
  why?: Tx;
  /** wyprawa: szansa kłopotów 0–1 */
  risk?: number;
  /** wyprawa: spodziewany łup (od, do) */
  gain?: Partial<Record<LootKey, [number, number]>>;
  /** warta: ile obrony dodaje (na wieży: tyle, ile dokłada do każdego innego posterunku) */
  guard?: number;
  /** wyprawa: id celu z TARGETS albo klucz miejsca z okolicy (`Cel.klucz`) */
  target?: string;
  /** wyprawa: opis celu (miejsce z okolicy albo cel z TARGETS); bez pola cel szukany w TARGETS po `target` */
  cel?: Cel;
  note?: Tx;
}

export interface NightCardPerson {
  id: string;
  name: string;
  needs: GovNeeds;
  /** propozycja zarządu */
  proposal: string;
  options: NightOption[];
}

export interface NightCard {
  day: number;
  /** szansa, że szabrownicy spróbują, i słowo do tego */
  chance: number;
  chanceWord: Tx;
  forecast: Tx;
  /** miejsca do pilnowania: brama i dziury, od najsłabszego */
  posts: { key: string; name: Tx; weak: number }[];
  /** stoi wieża: każdy ma opcję `warta:wieza`, ale na wieży może być najwyżej tyle osób, ile jest miejsc (to pole;
      pełna wieża blokuje opcję pozostałym), a okno karty dopisuje ją do wykazu posterunków (to nie miejsce napadu,
      więc nie ma jej w `posts`); bez wieży pola brak */
  wieza?: number;
  /** spodziewane straty, jeśli wejdą (do porównania z wartą) */
  loss: { wood: number; supplies: number };
  /** tryb zombie: ilu szwendaczy przyjdzie w stadzie, słowo do tego i wytrzymałość siatki 0–1 */
  horde?: { size: number; word: Tx; fence: number };
  people: NightCardPerson[];
  advice: Tx;
  /** koza zarządu na noc (bez kozy brak): drewno w zapasie razem z tym w kozie, ile zje do 6:00 przy dyżurze
      od zatwierdzenia karty (2 sztuki na godzinę) i do której godziny starczy ognia ('6:00' to do rana) */
  wood?: { have: number; need: number; until: string };
}

export interface NightReport {
  /** noc z dnia day na day + 1 */
  day: number;
  lines: Tx[];
  raid: 'brak' | 'odparty' | 'wtargnięcie';
  stolen: StockDelta;
  loot: StockDelta;
  hurt: { id: string; name: string; d: number }[];
  tired: string[];
  trust: number;
  anger: number;
  dTrust: number;
  dAnger: number;
  /** kuchnia rano (°C), jaka część nocy 22–6 paliła się koza (0–1) i kto przy niej czuwał (imiona) */
  kitchen?: number | null;
  fire?: number;
  koza?: string[];
}

export interface LawOption {
  id: string;
  name: Tx;
  path: LawPath;
  desc: Tx;
  /** ok, done (podpisana), lock (zablokowana), cd (odnowienie) */
  s: 'ok' | 'done' | 'lock' | 'cd';
  why?: Tx;
}

export type Prompt =
  | { k: 'zwyciestwo'; droga: Droga }
  | { k: 'raport'; report: NightReport }
  | { k: 'uchwala'; day: number; first: boolean; options: LawOption[] }
  | { k: 'karta'; card: NightCard; assign: Record<string, string> }
  | {
      k: 'wydarzenie';
      id: string;
      title: Tx;
      text: Tx;
      choices: { label: Tx; ok: boolean }[];
      /** miejsce na mapie (kafelki) dla przycisku „Pokaż”; brak: karta nie ma miejsca */
      gdzie?: Punkt;
    };

// ---------------------------------------------------------------- stan

export interface NightPlan {
  day: number;
  card: NightCard;
  assign: Record<string, string>;
  confirmed: boolean;
  raid: {
    come: boolean;
    at: number;
    post: string;
    resolved: boolean;
    outcome: NightReport['raid'];
    attack: number;
    defense: number;
    stolen: StockDelta;
  } | null;
  /** wyprawy: grupy po celu; `cel` to opis celu (stare grupy bez niego szukają w TARGETS po `target`) */
  exp: { key: string; ids: string[]; target: string; cel?: Cel }[];
  /** linie raportu zbierane w nocy */
  lines: Tx[];
  hurt: { id: string; d: number }[];
  /** zaufanie i wkurzenie przy zatwierdzeniu (do zmian w raporcie) */
  t0: number;
  a0: number;
  /** zwroty z wypraw już rozliczone i ich łup */
  returned: string[];
  loot: StockDelta;
  /** kto zasnął na warcie */
  slept: string[];
  /** ogień w kozie od 22:00 do 6:00: minuty gry z ogniem, wszystkie minuty i minuta ostatniego kroku zarządu */
  fire?: { on: number; all: number; at: number };
  /** kto w nocy stał przy kozie (id z posterunków symulacji, także z menu kozy) */
  koza?: string[];
  /** tryb zombie: liczniki przy zatwierdzeniu karty, ugryzieni wtedy i najwięcej szwendaczy przy siatce w nocy */
  z0?: { killed: number; breaches: number; bites: number };
  bit0?: string[];
  zpeak?: number;
}

/** Stan miejsc z okolicy: dla klucza miejsca ile sztuk łupu już zabrano, ile było wizyt i w którym dniu gry ostatnia.
    Miejsca się nie odnawiają. Pole `GovState.miasto` istnieje tylko po `wlaczMiasto` (src/gov/wyprawy.ts). */
export interface StanMiasta {
  /** klucz miejsca → sztuki łupu zabrane łącznie */
  zabrano: Record<string, number>;
  /** klucz miejsca → liczba wizyt */
  wizyty: Record<string, number>;
  /** klucz miejsca → dzień gry ostatniej wizyty */
  ostatnia: Record<string, number>;
}

/** Wyprawa dzienna w drodze (z mapy miasta): kto idzie, dokąd i kiedy wyszła i wraca. Czasy w minutach gry od północy
    pierwszego dnia (jak `gameMin`), a nie godziny jak `Cel.powrot`. Opis celu jest w stanie, więc powrót i łup liczą
    się bez kafelków miasta. */
export interface Wyprawa {
  id: number;
  cel: Cel;
  /** id osób z zarządu */
  ids: string[];
  /** minuta gry wyjścia */
  wyjscie: number;
  /** minuta gry powrotu (`powrotMin`), nie godzina */
  powrot: number;
}

export interface GovState {
  v: 1;
  seed: number;
  rng: RngState;
  trust: number;
  anger: number;
  laws: { signed: Record<string, boolean>; last: number; path: LawPath | null };
  /** książki ze starych zapisów (przed badaniami zarząd trzymał je u siebie); przy pierwszym kroku zarządu idą do
      symulacji (GovEffects.books), a pole zostaje puste. Właścicielem książek jest symulacja (SimState.books). */
  books: Partial<Record<TechDom, number>>;
  nextId: number;
  ev: {
    next: number;
    done: Record<string, boolean>;
    /** minuta gry ostatniego wystąpienia */
    last: Record<string, number>;
    active: ActiveEvent | null;
    /** sekunda przy ekranie, w której pojawiło się bieżące wydarzenie */
    when: number;
    /** sekunda przy ekranie, w której koza pierwszy raz się paliła (dym z komina) */
    lit?: number;
    /** sekunda przy ekranie, w której skończyła się cisza pierwszego dnia (kuchnia ciepła albo 18:00) */
    warm?: number;
  };
  night: NightPlan | null;
  cardDay: number;
  lawDay: number;
  lawPending: boolean;
  report: NightReport | null;
  reports: NightReport[];
  /** czy ognisko paliło się wieczorem i ile mebli spalono do poprzedniego rana */
  evening: { campfire: boolean; burned: number };
  flags: { dog: boolean; flashlight: boolean; torch: boolean };
  /** na tę noc: podwójna warta (dzień), szabrownicy zachęceni (dzień), premia do obrony */
  tonight: { alert: number; boost: number; bonus: number; bonusDay: number };
  visits: Record<string, number>;
  /** kto trzymał wartę ostatniej nocy (propozycja zmienia wartowników) */
  lastGuards: string[];
  /** skutki odłożone na rano (z wydarzeń): zapasy i linia do raportu */
  later: { day: number; stock: Partial<StockDelta>; line: Tx }[];
  /** decyzje gracza w sekundach przy ekranie (do pomiaru tempa) */
  decisions: { s: number; k: string }[];
  /** kronika; wpis o karcie z miejscem na mapie niesie to miejsce (`gdzie`, na później: przycisk „Pokaż” w kronice) */
  log: { day: number; clock: string; txt: Tx; big: boolean; gdzie?: Punkt }[];
  over: EndingId | null;
  /** tryb gry; stary zapis: zwykły */
  mode?: GameMode;
  /** ile zgonów z GovInput.dead zarząd już opłakał */
  deadN?: number;
  /** ile napaści z GovInput.napady osiedle już policzyło (pole od pierwszej napaści) */
  napadN?: number;
  /** mapa miasta: stan odwiedzonych miejsc; pole od `wlaczMiasto` (opcja `miasto`), bez niego zarząd gra na TARGETS */
  miasto?: StanMiasta;
  /** wyprawy dzienne w drodze; pole od pierwszego wyjścia z mapy miasta */
  wyprawy?: Wyprawa[];
  /** warunki zwycięstwa: kamienie milowe dróg, zwycięstwa, licznik celu ludności i kolejka epilogów w oknie; pole od
      `wlaczZwyciestwo` (src/gov/zwyciestwo.ts), bez niego zarząd nie liczy dróg i stan zostaje jak przed nimi */
  zwyciestwo?: StanZwyciestwa;
  /** tick ostatniego odkrycia albo znaleziska książki (GovInput.odkrycia, znaleziska), które zarząd już wpisał do
      kroniki; pole powstaje przy pierwszym takim wpisie, więc gra bez badań i książek go nie ma */
  czytane?: number;
}
