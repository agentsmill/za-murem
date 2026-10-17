/* Zarząd spółdzielni (M1): typy wąskiego interfejsu z symulacją. Moduł src/gov nie importuje src/sim.
   Wejście to odczyt stanu gry o nazwach jak snapshot() z src/sim/snapshot.ts, wyjście to skutki, które
   symulacja stosuje u siebie (zapasy, potrzeby, chwilowe nastroje, ludzie poza mapą). */

import type { Dom, EndingId, LawPath, TechDom } from '../content/data.ts';
import type { ActiveEvent } from '../content/events.ts';
import type { Person } from '../content/people.ts';
import type { RngState } from '../core/rng.ts';

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
  /** posterunek warty, jeśli stoi ('brama', 'd<id>', 'koza'), jak SimPerson.post. Z tym polem zarząd wie, że
      symulacja sama prowadzi noc na posterunku (kto stoi, ten nie śpi), więc rano nie odejmuje już sił */
  post?: string | null;
}

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
  /** nazwa miejsca do tekstów, np. „przy garażach” */
  name?: string;
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
  kozaLit: boolean;
  people: GovPerson[];
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
  /** warta spoza karty nocy (polecenie z menu): kto stoi i gdzie ('brama' albo 'd<id dziury>'); bez pola
      zarząd bierze osoby z pracą 'guard' za wartę w nieznanym miejscu */
  guards?: { id: string; post: string }[];
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
  log: string[];
  /** rozstrzygnięcie napadu w tym wywołaniu (w minucie napadu); null albo brak, gdy nic się nie rozstrzygnęło */
  raidResult?: RaidResult | null;
}

export interface RaidPlan {
  day: number;
  /** minuta gry (od północy pierwszego dnia), o której podchodzą */
  at: number;
  /** 'brama' albo 'd<id dziury>' */
  post: string;
  where: string;
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
  where: string;
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
  /** 'sen', 'warta:brama', 'warta:d<id>', 'wyprawa:blisko', 'wyprawa:daleko' */
  key: string;
  label: string;
  ok: boolean;
  /** dlaczego nie można */
  why?: string;
  /** wyprawa: szansa kłopotów 0–1 */
  risk?: number;
  /** wyprawa: spodziewany łup (od, do) */
  gain?: Partial<Record<LootKey, [number, number]>>;
  /** warta: ile obrony dodaje */
  guard?: number;
  /** wyprawa: id celu z TARGETS */
  target?: string;
  note?: string;
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
  chanceWord: string;
  forecast: string;
  /** miejsca do pilnowania: brama i dziury, od najsłabszego */
  posts: { key: string; name: string; weak: number }[];
  /** spodziewane straty, jeśli wejdą (do porównania z wartą) */
  loss: { wood: number; supplies: number };
  people: NightCardPerson[];
  advice: string;
  /** koza zarządu na noc (bez kozy brak): drewno w zapasie razem z tym w kozie, ile zje do 6:00 przy dyżurze
      od zatwierdzenia karty (2 sztuki na godzinę) i do której godziny starczy ognia ('6:00' to do rana) */
  wood?: { have: number; need: number; until: string };
}

export interface NightReport {
  /** noc z dnia day na day + 1 */
  day: number;
  lines: string[];
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
  name: string;
  path: LawPath;
  desc: string;
  /** ok, done (podpisana), lock (zablokowana), cd (odnowienie) */
  s: 'ok' | 'done' | 'lock' | 'cd';
  why?: string;
}

export type Prompt =
  | { k: 'raport'; report: NightReport }
  | { k: 'uchwala'; day: number; first: boolean; options: LawOption[] }
  | { k: 'karta'; card: NightCard; assign: Record<string, string> }
  | { k: 'wydarzenie'; id: string; title: string; text: string; choices: { label: string; ok: boolean }[] };

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
  /** wyprawy: grupy po celu */
  exp: { key: string; ids: string[]; target: string }[];
  /** linie raportu zbierane w nocy */
  lines: string[];
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
}

export interface GovState {
  v: 1;
  seed: number;
  rng: RngState;
  trust: number;
  anger: number;
  laws: { signed: Record<string, boolean>; last: number; path: LawPath | null };
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
  later: { day: number; stock: Partial<StockDelta>; line: string }[];
  /** decyzje gracza w sekundach przy ekranie (do pomiaru tempa) */
  decisions: { s: number; k: string }[];
  log: { day: number; clock: string; txt: string; big: boolean }[];
  over: EndingId | null;
}
