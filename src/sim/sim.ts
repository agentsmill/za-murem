/* Symulacja (M1): pionki rdzenia z poleceniami i własną pracą, tłum z prostym planem, rzeczy (meble, drewno,
   koza, jedzenie, pnie), ciepło w pomieszczeniach, potrzeby i samouczek. Stały krok, ziarno i kolejka poleceń
   w stanie. Stan to zwykły obiekt (JSON), rysowanie tylko go czyta. Ten sam świat, ziarno i polecenia dają ten sam
   stan. Bez wnętrza siedziby (świat sprzed M1) zarząd stoi, a rzeczy, ciepła i samouczka nie ma. */

import { PROFS } from '../content/data.ts';
import { makePerson, type Person } from '../content/people.ts';
import { hashString, nextRandom, pick, type RngState, rngOf } from '../core/rng.ts';
import type { Tree, World } from '../world/world.ts';
import { daylight, hourOf, minutesAt, outdoorTemp, START_MINUTES, TICKS_PER_HOUR, TICKS_PER_SECOND } from './clock.ts';
import {
  dryTreeOf,
  HEAT_EVERY,
  type HouseLike,
  heatBoost,
  heatStep,
  homeMask,
  houseOf,
  inHomeApt,
  type PropLike,
  type RoomKind,
  roomLight,
  roomLinks,
  START_TEMP,
} from './house.ts';
import {
  COLD,
  HUNGRY,
  type NeedCtx,
  type Needs,
  PECKISH,
  startNeeds,
  stepNeeds,
  stepSafe,
  TIRED,
  WARMED,
} from './needs.ts';
import { labelRegions, nearestFree, nearestInRegion, PathFinder } from './path.ts';
import { type FenceState, fenceShape, gateTiles, type Hole, initFence, PATCH_HP } from './perimeter.ts';
import { TUT_STEPS, type Tutorial, type TutStep, tutAdvance, WARM_ENOUGH } from './tutorial.ts';

/** kafelków na tick: 4 kafelki na sekundę przy 1× */
export const WALK_SPEED = 4 / TICKS_PER_SECOND;
/** najwyżej tyle wyszukiwań ścieżek tłumu na jeden krok symulacji */
export const PATHS_PER_TICK = 4;
/** tyle sztuk drewna mieści się w rękach */
export const CARRY = 6;
/** tyle sztuk drewna na jednym kafelku składu */
export const STACK = 10;
/** sztuka drewna pali się w kozie pół godziny gry (20 s przy 1×): suche drzewo starcza na 3–5 godzin,
    więc pierwszego wieczoru trzeba zdecydować, skąd wziąć opał */
export const BURN_TICKS = TICKS_PER_HOUR / 2;
/** koza mieści naraz tyle sztuk */
export const KOZA_CAP = 4;
/** porcje jedzenia w kuchni na start: dwa posiłki dziennie dla czterech osób przez trzy dni */
export const FOOD_START = 24;
/** posiłek trwa pół godziny gry; ciepły daje więcej najedzenia niż zimna konserwa prosto z zapasów */
export const EAT_TICKS = TICKS_PER_HOUR / 2;
export const MEAL = 45;
export const COLD_MEAL = 30;
/** gotowanie trwa 45 minut gry (30 s przy 1×) i daje porcję dla każdego z zarządu */
export const COOK_TICKS = (TICKS_PER_HOUR * 3) / 4;
/** gaz w butli przy kuchence zarządu na start: sześć gotowań (trzy dni), potem gotuje się na kozie */
export const GAS_START = 6 * COOK_TICKS;
/** meble, które da się spalić, i ile sztuk drewna dają (metal, porcelana i sama koza się nie palą) */
export const BURNABLE: Record<string, number> = { krzeslo: 1, stol: 3, lozko: 4, wersalka: 4, mebloscianka: 6 };
/** nazwy mebli w bierniku, do menu i opisów prac */
export const FURNITURE_ACC: Record<string, string> = {
  krzeslo: 'krzesło',
  stol: 'stół',
  lozko: 'łóżko',
  wersalka: 'wersalkę',
  mebloscianka: 'meblościankę',
};
const MINE: Record<string, string> = {
  krzeslo: 'moje krzesło',
  stol: 'mój stół',
  lozko: 'moje łóżko',
  wersalka: 'moją wersalkę',
  mebloscianka: 'moją meblościankę',
};
/** rozbicie mebla na opał trwa kwadrans gry (10 s przy 1×) */
export const BREAK_TICKS = TICKS_PER_HOUR / 4;
/** od tej godziny mieszkańcy pracują na podwórku (uchwała o zebraniach przesuwa to na 9:00) */
export const WORK_START = 8;
/** łata na dziurę: trzy sztuki desek albo złomu ze sterty, robota na pół godziny gry */
export const PATCH_COST = 3;
export const PATCH_TICKS = TICKS_PER_HOUR / 2;
/** ognisko z dwóch sztuk drewna, rozpalanie trwa kwadrans gry; mieści naraz więcej niż koza */
export const CAMPFIRE_WOOD = 2;
export const BUILD_TICKS = TICKS_PER_HOUR / 4;
export const CAMPFIRE_CAP = 6;
/** warta trwa do tej godziny rano */
export const GUARD_UNTIL = 6;
/** posterunek warty przy kozie zarządu (Job.target), klucz 'koza': czuwa w kuchni i dokłada, kiedy ognia mało */
export const KOZA_POST = -1;
/** zasięg światła (m): lampa warty i ognisko; w nim nie jest ciemno, a szabrownicy się płoszą */
export const LAMP_REACH = 5;
export const CAMPFIRE_LIGHT = 6;
/** szabrownicy pokazują się za siatką pół godziny gry przed napadem i czekają w ciemności */
export const SNEAK_TICKS = TICKS_PER_HOUR / 2;
/** tyle sztuk wynosi jeden szabrownik naraz (worek) */
export const LOOT_CARRY = 8;
/** z zarządem: tyle czekają na jego rozstrzygnięcie; gdy zarząd milczy, odchodzą sami bez łupu */
export const GOV_WAIT = TICKS_PER_HOUR;
/** skąd przychodzą: mniej więcej tyle kroków od siatki */
const RAID_FROM = 22;
/** bezczynny rdzeń rozgląda się za pracą co sekundę realną */
const THINK_EVERY = TICKS_PER_SECOND;
/** po poleceniu „idź tu” czeka na miejscu godzinę gry, chyba że coś pilnego */
const STAY_AFTER_ORDER = TICKS_PER_HOUR;
/** grzeje się najwyżej godzinę gry naraz, potem rozgląda się od nowa (może jest głodny) */
const WARM_MAX = TICKS_PER_HOUR;
/** z tej odległości od kozy (m) człowiek się przy niej grzeje */
const FIRE_REACH = 2.5;

export type Facing = 0 | 1 | 2 | 3; // dół, góra, lewo, prawo

export type JobKind =
  | 'go'
  | 'chop'
  | 'haul'
  | 'refuel'
  | 'warm'
  | 'eat'
  | 'sleep'
  | 'burn'
  | 'cook'
  | 'stay'
  | 'guard'
  | 'patch'
  | 'build'
  | 'leave'
  | 'raid';

/** zajęcia mieszkańców (praca 'stay', target): w domu, na podwórku, przy ognisku */
export const STAY_HOME = 0;
export const STAY_YARD = 1;
export const STAY_FIRE = 2;

/** chwilowy nastrój (spalone meble, ciepły posiłek): dodaje się do nastroju z potrzeb do ticku until */
export interface Mood {
  /** krótki opis do karty osoby, np. „Spalili moje łóżko” */
  why: string;
  /** punkty nastroju (ujemne: gorzej) */
  d: number;
  until: number;
}

/** praca pionka rdzenia */
export interface Job {
  t: JobKind;
  /** cel: numer drzewa (chop), id rzeczy (haul: stos drewna, refuel: koza albo ognisko, warm: koza, eat: stół,
      sleep: łóżko, burn: mebel, cook: kuchenka albo koza), posterunek (guard: 0 brama, inaczej id dziury),
      id dziury (patch), kafelek ogniska (build), kafelek (go), zajęcie mieszkańca (stay),
      −1, gdy celu nie ma (haul z drewnem w rękach, eat bez stołu, sleep na podłodze) */
  target: number;
  /** kafelek, na który idzie albo na którym pracuje */
  tile: number;
  /** 0: idzie do celu; 1: pracuje albo czeka (chop, warm, eat, sleep, go, guard), niesie drewno (haul, refuel),
      niesie materiał (patch, build) albo jest za mapą (leave); 2: łata albo rozpala (patch, build) */
  phase: number;
  /** skąd bierze: stos drewna do kozy, ogniska albo na ognisko (refuel, build; −1: niesie własne), garnek albo
      zapasy (eat), sterta desek albo złomu (patch) */
  from: number;
  /** tick początku i końca pracy (chop, eat, warm, go z polecenia) */
  t0: number;
  until: number;
  /** z polecenia gracza „idź tu”: po dojściu czeka na miejscu godzinę gry (pomocnicy wysłani razem
      z drwalem albo do kozy mają false i od razu biorą się do własnej pracy) */
  order: boolean;
  /** sztuki w rękach poza drewnem: deski albo złom na łatę (patch) */
  n: number;
  /** co to za sztuki ('deski', 'zlom'; pusty napis: nic) */
  what: string;
}

/** zarząd (rdzeń, polecenia), tłum (tylko do pomiaru wydajności, za siatką), mieszkańcy siedziby
    (tło z planem dnia), szabrownicy (obcy z napadu; nazwa jak w liście obcych rysowania, src/render/game.ts) */
export type PawnKind = 'core' | 'crowd' | 'resident' | 'szabrownik';

export interface Pawn {
  id: number;
  kind: PawnKind;
  /** osoba z rdzenia (indeks w state.people) albo −1 */
  person: number;
  look: number;
  x: number;
  y: number;
  path: number[];
  pi: number;
  dir: Facing;
  walk: number;
  /** tick, do którego stoi (tłum) albo do którego nie szuka pracy (rdzeń) */
  wait: number;
  /** kafelek, wokół którego się kręci (wejście do klatki) */
  home: number;
  /** cel, do którego trzeba wyznaczyć drogę (−1: brak) */
  want: number;
  /** bieżąca praca (tylko rdzeń), null: bezczynny */
  job: Job | null;
  /** potrzeby (tylko rdzeń) */
  needs: Needs | null;
  /** chwilowe nastroje (rdzeń i mieszkańcy) */
  moods: Mood[];
  /** sztuki drewna w rękach */
  carry: number;
  /** mieszkaniec: numer jego mieszkania w siedzibie (−1: inni) */
  apt: number;
  /** na wyprawie poza mapą: nie rysuje się, potrzeby stoją, wraca poleceniem 'back' */
  away: boolean;
}

/** Rzecz na mapie: meble z wnętrza (kopiowane przy starcie, żeby dało się je kiedyś przestawić albo spalić),
    koza, stosy drewna, zapasy jedzenia, pnie. */
export interface Thing {
  id: number;
  /** meble z kontraktu wnętrza ('koza', 'stol', 'krzeslo', 'lozko'…) albo 'drewno', 'jedzenie', 'pien' */
  kind: string;
  /** lewy górny kafelek i rozmiar w kafelkach */
  x: number;
  y: number;
  w: number;
  h: number;
  /** ściana, przy której stoi mebel (0 góra, 1 prawo, 2 dół, 3 lewo) */
  rot: number;
  /** sztuki: drewno w stosie, porcje zapasów (jedzenie) albo ugotowanego posiłku (posilek, garnek na stole) */
  n: number;
  /** koza: ticki ognia, które zostały (0: zimna); kuchenka: ticki gazu w butli */
  fuel: number;
  /** pionek, który ma tę rzecz w pracy (−1: wolna) */
  by: number;
  /** właściciel mebla (pionek), −1: wspólny albo niczyj; spalenie boli go najbardziej */
  owner: number;
}

/** spalony mebel: co, z którego mieszkania (−1: klatka), kto i kiedy */
export interface Burned {
  tick: number;
  kind: string;
  apt: number;
  by: number;
}

export type Command =
  | { t: 'move'; ids: number[]; to: number }
  /** zaznaczenie kogoś z zarządu: nic nie robi z pionkami, tylko prowadzi samouczek */
  | { t: 'select'; ids: number[] }
  /** brama otwarta albo zamknięta (od razu; ids może być puste) */
  | { t: 'gate'; ids: number[]; open: boolean }
  | { t: 'chop'; ids: number[]; tree: number }
  | { t: 'haul'; ids: number[]; thing: number }
  | { t: 'refuel'; ids: number[]; thing: number }
  /** rozbić mebel na opał (interfejs pyta wcześniej o potwierdzenie) */
  | { t: 'burn'; ids: number[]; thing: number }
  /** ugotować posiłek z zapasów (na kuchence, a bez gazu na palącej się kozie) */
  | { t: 'cook'; ids: number[] }
  /** warta do rana: 'brama' albo 'd<id dziury>' (jak klucze warty w karcie nocy zarządu) */
  | { t: 'guard'; ids: number[]; post: string }
  /** załatać dziurę deskami albo złomem ze sterty */
  | { t: 'patch'; ids: number[]; hole: number }
  /** rozpalić ognisko na kafelku podwórka */
  | { t: 'campfire'; ids: number[]; at: number }
  /** wyjść bramą na wyprawę (znika za mapą) i wrócić z niej */
  | { t: 'away'; ids: number[] }
  | { t: 'back'; ids: number[] }
  /** uchwały, które zmieniają symulację (ids puste) */
  | { t: 'laws'; ids: number[]; laws: Partial<Laws> }
  /** napad bez zarządu (testy, bot, podgląd): tick, o którym są przy siatce, i posterunek 'brama' / 'd<id>' */
  | { t: 'raid'; ids: number[]; at: number; post: string }
  /** łaty z zarządu: n największych otwartych dziur od razu załatanych (materiał policzył zarząd) */
  | { t: 'mend'; ids: number[]; n: number };

/** łup w sztukach: drewno, porcje zapasów, złom */
export interface Loot {
  wood: number;
  supplies: number;
  scrap: number;
}

/** Napad szabrowników tej nocy. Z zarządem (gov) rozstrzyga zarząd, a symulacja to odgrywa: przy 'odparty' uciekają
    spod siatki, przy 'wtargnięcie' wchodzą i wynoszą dokładnie to, co policzył zarząd. Bez zarządu rozstrzyga
    symulacja: warta z lampą albo ognisko w zasięgu ich płoszy, inaczej każdy wynosi pełny worek. */
export interface Raid {
  /** tick, o którym są przy siatce (w tej minucie zarząd rozstrzyga napad) */
  at: number;
  /** posterunek z planu: 'brama' albo 'd<id dziury>' (załatana dziura: idą do bramy) */
  post: string;
  /** ilu ich jest (1–3, losowane przy pojawieniu się) */
  n: number;
  /** 0 czekają na swoją porę, 1 są za siatką, 2 rozstrzygnięty (wchodzą albo uciekają), 3 po wszystkim */
  phase: number;
  outcome: '' | 'odparty' | 'wtargnięcie';
  gov: boolean;
  /** ile mają wynieść (z zarządu; bez zarządu tyle, ile uniosą) i ile już wynieśli */
  loot: Loot;
  took: Loot;
  /** kafelek, z którego przyszli i do którego wracają, i kafelek za siatką, pod którym czekają (−1: jeszcze nie) */
  from: number;
  spot: number;
}

/** ciągłe skutki uchwał, których potrzebuje symulacja (część LawEffects z src/gov) */
export interface Laws {
  /** brama na kłódkę od 20:00 do 6:00 */
  gateClosed: boolean;
  /** mnożnik kary w nastroju za palenie mebli */
  burnMood: number;
  /** od tej godziny mieszkańcy pracują na podwórku */
  workStart: number;
}

export interface SimState {
  v: 3;
  seed: number;
  tick: number;
  rng: RngState;
  people: Person[];
  pawns: Pawn[];
  /** licznik identyfikatorów osób (jak S.nextId w 0.3) */
  nextId: number;
  /** licznik identyfikatorów pionków */
  nextPawn: number;
  /** polecenia czekające na następny krok (w stanie, żeby zapis ich nie gubił) */
  cmds: Command[];
  things: Thing[];
  nextThing: number;
  /** ścięte drzewa (indeksy w world.trees), rosnąco */
  felled: number[];
  /** temperatura pomieszczeń wnętrza siedziby (°C, indeks = id pomieszczenia) */
  temps: number[];
  tut: Tutorial;
  /** spalone meble, po kolei */
  burned: Burned[];
  /** siatka: wytrzymałość, dziury i łaty, brama (null: świat bez siatki) */
  fence: FenceState | null;
  /** ilu mieszkańców zmieści się w mieszkaniach siedziby połączonych z podwórkiem */
  cap: number;
  laws: Laws;
  /** napad tej nocy albo ostatni (phase 3), null: nie było */
  raid: Raid | null;
  /** zapasy bez rzeczy na mapie (z zarządu): części i leki */
  store: { parts: number; meds: number };
}

/** liczniki do pomiarów; poza stanem gry, żeby skrót stanu nie zależał od wnętrza A* */
export interface SimStats {
  paths: number;
  failed: number;
  nodes: number;
  /** cele z innego obszaru mapy zamienione na najbliższy osiągalny kafelek */
  substituted: number;
}

/** przesunięcia celów dla grupy: spirala wokół kliknięcia, najbliższe najpierw */
const SPREAD: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) out.push([dx, dy]);
  return out.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2) || a[1] - b[1] || a[0] - b[0]);
})();

/** sterty materiałów na podwórku ze świata (World.props): deski i złom na łaty, gruz */
const HEAPS = new Set(['deski', 'zlom', 'gruz']);
/** rzeczy, które leżą luzem; reszta to meble (ognisko też: nie staje się na nim) */
const LOOSE = new Set(['drewno', 'jedzenie', 'posilek', 'pien', ...HEAPS]);
const BEDS = new Set(['lozko', 'wersalka']);

/** drewno ze ściętego drzewa: 3 sztuki na metr korony, z krzaka mało */
export const woodFrom = (t: Tree): number =>
  t.kind === 2 ? Math.max(1, Math.round(t.r * 1.5)) : Math.max(2, Math.round(t.r * 3));
/** rąbanie trwa od kilkunastu do trzydziestu kilku sekund realnych przy 1× */
export const chopTicks = (t: Tree): number => Math.round(160 + 120 * t.r);

export interface SimOpts {
  core?: number;
  /** mieszkańcy siedziby; domyślnie 3–8 według mieszkań połączonych z podwórkiem */
  residents?: number;
  /** tłum za siatką, tylko do pomiaru wydajności (npm run perf); w grze 0 */
  crowd?: number;
}

/** wolne kafelki przed wejściami do budynków mieszkalnych, najbliżej siedziby najpierw */
function homeTiles(w: World): number[] {
  const hq = w.buildings[w.hq];
  const hx = (hq.x0 + hq.x1) / 2;
  const hy = (hq.y0 + hq.y1) / 2;
  return w.buildings
    .filter((b) => b.cls === 'blok' || b.cls === 'dom')
    .map((b) => ({ b, d: Math.hypot((b.x0 + b.x1) / 2 - hx, (b.y0 + b.y1) / 2 - hy) }))
    .sort((p, q) => p.d - q.d || p.b.id - q.b.id)
    .flatMap(({ b }) => b.entrances.map((e) => e.out));
}

function newThing(st: SimState, kind: string, x: number, y: number, w = 1, h = 1, rot = 0): Thing {
  return { id: st.nextThing++, kind, x, y, w, h, rot, n: 0, fuel: 0, by: -1, owner: -1 };
}

const covers = (t: Thing, x: number, y: number) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;

/** koza zarządu: ta w mieszkaniu zarządu (inne kozy grzeją swoje pomieszczenia, ale zarząd ich nie pilnuje) */
function homeKoza<T extends { kind: string; x: number; y: number }>(
  h: HouseLike,
  size: number,
  list: T[],
): T | undefined {
  return list.find((f) => f.kind === 'koza' && inHomeApt(h, f.y * size + f.x));
}

/** kuchnia zarządu: pomieszczenie z kozą zarządu, a bez niej kuchnia mieszkania zarządu (−1: brak) */
function kitchenOf(h: HouseLike, size: number): number {
  const koza = homeKoza(h, size, h.furniture);
  const r = koza ? h.room[koza.y * size + koza.x] : -1;
  if (r >= 0) return r;
  return h.rooms.find((q) => q.kind === 'kuchnia' && q.apt === h.home)?.id ?? -1;
}

/** kuchenka zarządu (w jego mieszkaniu) */
function homeStove(h: HouseLike, size: number, things: Thing[]): Thing | undefined {
  return things.find((t) => t.kind === 'kuchenka' && inHomeApt(h, t.y * size + t.x));
}

/** czy da się teraz gotować: są zapasy, a kuchenka ma gaz albo koza zarządu się pali */
export function canCookIn(st: SimState, w: World): boolean {
  const h = houseOf(w);
  if (!h || !st.things.some((t) => t.kind === 'jedzenie' && t.n > 0)) return false;
  return (homeStove(h, w.size, st.things)?.fuel ?? 0) > 0 || (homeKoza(h, w.size, st.things)?.fuel ?? 0) > 0;
}

/** wolne kafelki pomieszczeń (przechodnie, bez rzeczy i składu), rosnąco */
function freeIn(w: World, h: HouseLike, rooms: number[], things: Thing[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.size * w.size; i++) {
    if (!rooms.includes(h.room[i]) || w.blocked[i] || h.sklad.includes(i)) continue;
    const x = i % w.size;
    const y = (i - x) / w.size;
    if (!things.some((t) => covers(t, x, y))) out.push(i);
  }
  return out;
}

export function createSim(w: World, seed: number, opts: SimOpts = {}): SimState {
  const st: SimState = {
    v: 3,
    seed,
    tick: 0,
    rng: { s: seed | 0 },
    people: [],
    pawns: [],
    nextId: 1,
    nextPawn: 1,
    cmds: [],
    things: [],
    nextThing: 1,
    felled: [],
    temps: [],
    tut: { step: -1, at: [] },
    burned: [],
    fence: initFence(w),
    cap: 0,
    laws: { gateClosed: false, burnMood: 1, workStart: WORK_START },
    raid: null,
    store: { parts: 0, meds: 0 },
  };
  const rnd = rngOf(st.rng);
  const size = w.size;
  const hq = w.buildings[w.hq];
  const door = hq.entrances[0]?.out ?? nearestFree(w.blocked, size, ((hq.y1 + 1) * size + hq.x0) | 0);
  const house = houseOf(w);
  // zarząd zaczyna w kuchni (a gdy się nie zmieści, na klatce)
  let spots: number[] = [];
  if (house) {
    for (const f of house.furniture) st.things.push(newThing(st, f.kind, f.x, f.y, f.w, f.h, f.rot));
    // butla gazowa przy kuchence zarządu (szczelna, więc przetrwała); w obcych mieszkaniach butle puste
    const stove = homeStove(house, size, st.things);
    if (stove) stove.fuel = GAS_START;
    st.temps = house.rooms.map(() => START_TEMP);
    const kitchen = kitchenOf(house, size);
    const free = kitchen >= 0 ? freeIn(w, house, [kitchen], st.things) : [];
    // zapasy jedzenia na pierwsze dni przy lodówce (martwej, na abonament)
    const fridge = st.things.find((t) => t.kind === 'lodowka' && house.room[t.y * size + t.x] === kitchen);
    if (free.length) {
      const fx = fridge ? fridge.x : free[0] % size;
      const fy = fridge ? fridge.y : Math.floor(free[0] / size);
      const at = free.reduce((best, i) => {
        const d = ((i % size) - fx) ** 2 + (Math.floor(i / size) - fy) ** 2;
        const bd = ((best % size) - fx) ** 2 + (Math.floor(best / size) - fy) ** 2;
        return d < bd ? i : best;
      });
      const food = newThing(st, 'jedzenie', at % size, Math.floor(at / size));
      food.n = FOOD_START;
      st.things.push(food);
    }
    // potem klatka, na którą wychodzą drzwi mieszkania zarządu, i reszta mieszkania
    const homeRooms = house.home >= 0 ? house.rooms.filter((r) => r.apt === house.home).map((r) => r.id) : [];
    const links = roomLinks(house, size);
    const linked = (a: number) =>
      links.some(([x, y]) => (x === a && homeRooms.includes(y)) || (y === a && homeRooms.includes(x)));
    const stairs = house.rooms.filter((r) => r.kind === 'klatka' && linked(r.id)).map((r) => r.id);
    spots = [
      ...(kitchen >= 0 ? freeIn(w, house, [kitchen], st.things) : []),
      ...freeIn(w, house, stairs, st.things),
      ...freeIn(
        w,
        house,
        homeRooms.filter((r) => r !== kitchen),
        st.things,
      ),
    ];
    // samouczek tylko wtedy, gdy jest co ściąć, gdzie złożyć drewno i w czym palić
    if (dryTreeOf(w) >= 0 && homeKoza(house, size, house.furniture) && house.sklad.length)
      st.tut = { step: 0, at: TUT_STEPS.map(() => -1) };
  }
  // sterty materiałów ze świata: ubywa z nich przy łataniu, więc są w stanie
  for (const pr of (w as { props?: PropLike[] }).props ?? [])
    if (HEAPS.has(pr.kind)) {
      const t = newThing(st, pr.kind, pr.x, pr.y, pr.w, pr.h);
      t.n = pr.n ?? 1;
      st.things.push(t);
    }
  // rdzeń: zarząd z fachem w podstawowych dziedzinach, jak na starcie 0.3
  const need = ['cieplo', 'bud', 'med', 'uprawa'] as const;
  const core = opts.core ?? 4;
  for (let k = 0; k < core; k++) {
    const d = need[k % need.length];
    const profs = PROFS.filter((p) => (p[2][d] || 0) >= 1 && (p[2][d] || 0) <= 3);
    const p = makePerson(rnd, new Set(st.people.map((q) => q.first)), () => st.nextId++, {
      prof: pick(profs, rnd),
      home: w.hq,
    });
    st.people.push(p);
    // losowanie miejsca zostaje, żeby ten sam adres dawał tych samych ludzi z wnętrzem i bez
    let at = spawnNear(w, door, k, rnd);
    if (k < spots.length) at = spots[k];
    const pawn = newPawn(st, w, 'core', st.people.length - 1, at, door, k);
    pawn.needs = startNeeds();
    st.pawns.push(pawn);
  }
  // łóżka w mieszkaniu zarządu mają właścicieli: po jednym dla każdego z zarządu, po kolei
  if (house) {
    const beds = st.things.filter((t) => BEDS.has(t.kind) && inHomeApt(house, t.y * size + t.x));
    st.pawns.forEach((p, k) => {
      if (k < beds.length) beds[k].owner = p.id;
    });
  }
  if (house) {
    const apts = residentApts(st, w, house);
    st.cap = Math.min(8, 3 * apts.length);
    addResidents(st, w, opts.residents ?? (apts.length ? Math.min(8, Math.max(3, 2 * apts.length + 1)) : 0));
  }
  const homes = homeTiles(w);
  const crowd = opts.crowd ?? 0;
  const mask = house && crowd ? homeMask(house, size) : null;
  for (let k = 0; k < crowd; k++) {
    const home = homes.length ? homes[k % Math.min(homes.length, 24)] : door;
    let at = spawnNear(w, home, k, rnd);
    // tłum nie wchodzi do mieszkania zarządu
    if (mask?.[at]) at = home;
    const p = newPawn(st, w, 'crowd', -1, at, home, 4 + Math.floor(rnd() * 12));
    p.wait = Math.floor(rnd() * 200);
    st.pawns.push(p);
  }
  return st;
}

/** Zabiera ze stanu do n sztuk: drewno (najpierw luzem, potem ze składu), zapasy (najpierw surowe, potem garnek)
    albo złom ze stert; zwraca, ile naprawdę zabrał. Dla zarządu (wydatki) i dla napadu (czego nie wynieśli). */
export function takeStock(st: SimState, w: World, key: keyof Loot, n: number): number {
  const size = w.size;
  const sklad = houseOf(w)?.sklad ?? [];
  const order: ((t: Thing) => boolean)[] =
    key === 'wood'
      ? [(t) => t.kind === 'drewno' && !sklad.includes(t.y * size + t.x), (t) => t.kind === 'drewno']
      : key === 'supplies'
        ? [(t) => t.kind === 'jedzenie', (t) => t.kind === 'posilek']
        : [(t) => t.kind === 'zlom'];
  let left = n;
  for (const ok of order)
    for (const t of st.things.filter(ok)) {
      if (left <= 0) break;
      const k = Math.min(t.n, left);
      t.n -= k;
      left -= k;
    }
  st.things = st.things.filter((t) => !(LOOSE.has(t.kind) && t.kind !== 'pien' && t.n <= 0));
  return n - left;
}

/** Czy na kafelku można rozpalić ognisko: wolny kafelek podwórka, nie przy wejściach do budynków, drzwiach, bramie
    i dziurach (przejścia zostają wolne), i taki, że ognisko (blokuje) nie rozetnie przejść zarządu ani mieszkańców:
    jego przechodni sąsiedzi zostają połączeni inną drogą. Dla menu i dla polecenia. */
export function campfireSpotOk(st: SimState, w: World, at: number): boolean {
  const shape = fenceShape(w);
  if (!shape?.yard.includes(at) || w.blocked[at]) return false;
  const size = w.size;
  const x = at % size;
  const y = Math.floor(at / size);
  if (st.things.some((t) => covers(t, x, y))) return false;
  const near = (k: number) => Math.max(Math.abs((k % size) - x), Math.abs(Math.floor(k / size) - y)) <= 1;
  const h = houseOf(w);
  for (const b of w.buildings) for (const e of b.entrances) if (near(e.out)) return false;
  if (h?.doors.some(near) || gateTiles(w).some(near) || shape.hole.some(near)) return false;
  const trunk = Int32Array.from(w.trees, (t) => trunkOf(w, t));
  const solid = st.things.filter((t) => t.kind === 'ognisko').map((t) => t.y * size + t.x);
  const lay = composeLayers(w, st.felled, trunk, st.fence, h ? homeMask(h, size) : null, solid);
  for (const blocked of [lay.core, lay.resident]) {
    if (blocked[at]) return false;
    blocked[at] = 1;
    const ns = [y > 0 ? at - size : -1, y < size - 1 ? at + size : -1, x > 0 ? at - 1 : -1, x < size - 1 ? at + 1 : -1];
    const open = ns.filter((n) => n >= 0 && !blocked[n]);
    if (open.length < 2) continue;
    const reg = labelRegions(blocked, size);
    if (open.some((n) => reg[n] !== reg[open[0]])) return false;
  }
  return true;
}

/** napad zaplanowany na tick at przy posterunku post ('brama' / 'd<id>'); gov: rozstrzyga zarząd */
export function planRaid(st: SimState, at: number, post: string, gov: boolean): void {
  const zero = (): Loot => ({ wood: 0, supplies: 0, scrap: 0 });
  st.raid = { at, post, n: 0, phase: 0, outcome: '', gov, loot: zero(), took: zero(), from: -1, spot: -1 };
}

/** mieszkania inne niż zarządu, do których z podwórka da się dojść bez wychodzenia za siatkę, rosnąco */
function residentApts(st: SimState, w: World, h: HouseLike): number[] {
  const size = w.size;
  const fence = (w as { fence?: World['fence'] }).fence;
  const { resident } = composeLayers(w, [], null, st.fence, homeMask(h, size));
  const reg = labelRegions(resident, size);
  const yardTile = fence?.yard.find((i) => !resident[i]);
  if (yardTile === undefined) return [];
  const apts: number[] = [];
  for (let i = 0; i < size * size; i++) {
    const a = aptAt(h, i);
    if (a >= 0 && a !== h.home && !resident[i] && reg[i] === reg[yardTile] && !apts.includes(a)) apts.push(a);
  }
  return apts.sort((a, b) => a - b);
}

/** Mieszkańcy siedziby (tło) w mieszkaniach połączonych z podwórkiem, po kolei po mieszkaniach, najwyżej do st.cap
    (3–8 na start: po dwóch na mieszkanie i jeden więcej); każdy z łóżkiem z mebli swojego mieszkania, gdy jest wolne.
    Zarząd dokłada ich zdarzeniami (fx.residents). Zwraca, ilu przybyło. */
export function addResidents(st: SimState, w: World, n: number): number {
  const h = houseOf(w);
  if (!h || n <= 0) return 0;
  const size = w.size;
  const apts = residentApts(st, w, h);
  if (!apts.length) return 0;
  const rnd = rngOf(st.rng);
  const { resident } = composeLayers(w, [], null, st.fence, homeMask(h, size));
  let added = 0;
  for (let k = 0; k < n; k++) {
    const have = st.pawns.filter((p) => p.kind === 'resident');
    if (have.length >= st.cap) break;
    const idx = have.length;
    const apt = apts[idx % apts.length];
    const free: number[] = [];
    for (let i = 0; i < size * size; i++) {
      if (aptAt(h, i) !== apt || resident[i]) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      if (!st.things.some((t) => !LOOSE.has(t.kind) && covers(t, x, y))) free.push(i);
    }
    const at = free[Math.floor(idx / apts.length) % Math.max(1, free.length)] ?? free[0];
    if (at === undefined) break;
    const p = newPawn(st, w, 'resident', -1, at, at, 4 + Math.floor(rnd() * 12));
    p.apt = apt;
    p.needs = { food: 70, warm: 60, rest: 70, health: 100, safe: 60, mood: 0 };
    p.needs.mood = 0.25 * 70 + 0.25 * 60 + 0.15 * 70 + 0.15 * 100 + 0.2 * 60;
    st.pawns.push(p);
    added++;
    // łóżko w swoim mieszkaniu
    const bed = st.things.find((t) => BEDS.has(t.kind) && t.owner < 0 && aptAt(h, t.y * size + t.x) === apt);
    if (bed) bed.owner = p.id;
  }
  return added;
}

/** wyprowadzka: ostatni mieszkańcy znikają (łóżka wolne); zwraca, ilu ubyło */
export function removeResidents(st: SimState, n: number): number {
  let gone = 0;
  for (let k = st.pawns.length - 1; k >= 0 && gone < n; k--) {
    const p = st.pawns[k];
    if (p.kind !== 'resident') continue;
    dropPawn(st, p);
    gone++;
  }
  return gone;
}

/** pionek znika ze stanu: rzeczy, które zajmował, i jego meble są wolne */
function dropPawn(st: SimState, p: Pawn): void {
  for (const t of st.things) {
    if (t.by === p.id) t.by = -1;
    if (t.owner === p.id) t.owner = -1;
  }
  st.pawns.splice(st.pawns.indexOf(p), 1);
}

/** nowa osoba w zarządzie (zdarzenie): staje przed drzwiami siedziby z potrzebami jak po drodze */
export function addCore(st: SimState, w: World, person: Person): Pawn {
  const hq = w.buildings[w.hq];
  const door = hq?.entrances[0]?.out ?? nearestFree(w.blocked, w.size, ((w.size / 2) | 0) * (w.size + 1));
  st.people.push(person);
  const rnd = rngOf(st.rng);
  const p = newPawn(
    st,
    w,
    'core',
    st.people.length - 1,
    nearestFree(w.blocked, w.size, door),
    door,
    Math.floor(rnd() * 4),
  );
  p.needs = { food: 50, warm: 50, rest: 60, health: 90, safe: 50, mood: 0 };
  p.needs.mood = 0.25 * 50 + 0.25 * 50 + 0.15 * 60 + 0.15 * 90 + 0.2 * 50;
  st.pawns.push(p);
  return p;
}

/** osoba odchodzi ze spółdzielni (zdarzenie): pionek znika, osoba zostaje w state.people (indeksy innych) */
export function removeCore(st: SimState, id: string): boolean {
  const p = st.pawns.find((q) => q.kind === 'core' && st.people[q.person]?.id === id);
  if (!p) return false;
  dropPawn(st, p);
  return true;
}

function spawnNear(w: World, i: number, k: number, rnd: () => number): number {
  const size = w.size;
  const x = (i % size) + Math.round((rnd() - 0.5) * 6) + (k % 3) - 1;
  const y = Math.floor(i / size) + Math.round((rnd() - 0.5) * 4);
  const cx = Math.max(0, Math.min(size - 1, x));
  const cy = Math.max(0, Math.min(size - 1, y));
  return nearestFree(w.blocked, size, cy * size + cx);
}

function newPawn(
  st: SimState,
  w: World,
  kind: Pawn['kind'],
  person: number,
  at: number,
  home: number,
  look: number,
): Pawn {
  return {
    id: st.nextPawn++,
    kind,
    person,
    look,
    x: (at % w.size) + 0.5,
    y: Math.floor(at / w.size) + 0.5,
    path: [],
    pi: 0,
    dir: 0,
    walk: 0,
    wait: 0,
    home,
    want: -1,
    job: null,
    needs: null,
    moods: [],
    carry: 0,
    apt: -1,
    away: false,
  };
}

/** Przechodniość według rodzaju pionka. Baza: świat, ścięte drzewa wolne, łaty i ogniska zablokowane. Zarząd bez otwartych
    dziur (nie przełazi, a przez zamkniętą bramę przechodzi, bo ma klucz), mieszkańcy dodatkowo bez bramy i mieszkania
    zarządu (zostają za siatką), obcy z dziurami, ale bez zamkniętej bramy. */
function composeLayers(
  w: World,
  felled: readonly number[],
  trunk: Int32Array | null,
  fence: FenceState | null,
  mask: Uint8Array | null,
  solid: readonly number[] = [],
): { core: Uint8Array; resident: Uint8Array; stranger: Uint8Array } {
  const base = w.blocked.slice();
  if (trunk) for (const k of felled) base[trunk[k]] = 0;
  for (const t of solid) base[t] = 1;
  const open: number[] = [];
  if (fence)
    for (const hole of fence.holes)
      for (const t of hole.tiles) {
        if (hole.patch > 0) base[t] = 1;
        else open.push(t);
      }
  const gate = gateTiles(w);
  const core = base.slice();
  for (const t of open) core[t] = 1;
  const resident = core.slice();
  for (const t of gate) resident[t] = 1;
  if (mask) for (let i = 0; i < resident.length; i++) if (mask[i]) resident[i] = 1;
  const stranger = base;
  if (fence && !fence.gateOpen) for (const t of gate) stranger[t] = 1;
  return { core, resident, stranger };
}

/** numer mieszkania pod kafelkiem albo −1 */
const aptAt = (h: HouseLike, i: number): number => (h.room[i] >= 0 ? h.rooms[h.room[i]].apt : -1);

/** kafelek pnia: współrzędne drzew są zaokrąglone do 0,01 m, więc pień na granicy kafelków bywa o jeden w lewo
    albo w górę; wybieramy kafelek, który świat naprawdę zablokował */
export function trunkOf(w: World, t: Tree): number {
  const size = w.size;
  const xs = Number.isInteger(t.x) ? [t.x, t.x - 1] : [Math.floor(t.x)];
  const ys = Number.isInteger(t.y) ? [t.y, t.y - 1] : [Math.floor(t.y)];
  for (const y of ys)
    for (const x of xs) {
      const i = y * size + x;
      if (x >= 0 && y >= 0 && x < size && y < size && w.blocked[i] && w.bid[i] < 0) return i;
    }
  return Math.floor(t.y) * size + Math.floor(t.x);
}

/** nocne otoczenie do potrzeb (liczone raz na krok potrzeb) */
interface Around {
  /** ktoś trzyma wartę (20–6) */
  guard: boolean;
  /** otwarte dziury w siatce (20–6; za dnia nie straszą) */
  holes: number;
  /** lampy warty (x, y) */
  lamps: [number, number][];
  /** palące się ogniska */
  fires: Thing[];
  strangers: Pawn[];
  /** szabrownicy weszli tej nocy */
  raided: boolean;
}

/** Sim trzyma poza stanem tylko to, co da się odtworzyć ze świata i stanu: bufor A*, przechodniość
    z wyciętymi drzewami, regiony, połączenia pomieszczeń. */
export class Sim {
  readonly w: World;
  st: SimState;
  stats: SimStats = { paths: 0, failed: 0, nodes: 0, substituted: 0 };
  /** wnętrze siedziby albo null (świat sprzed M1) */
  readonly house: HouseLike | null;
  /** przechodniość fizyczna według kontraktu siatki (dla rysowania i podglądu): świat z wyciętymi drzewami,
      dziura 0, łata 1, zamknięta brama 1, ognisko 1; przy wczytaniu odtwarzana ze stanu, tablica ta sama */
  readonly blocked: Uint8Array;
  /** przechodniość dla zarządu: jak fizyczna, ale otwarte dziury zablokowane (zarząd przez nie nie przełazi),
      a brama przechodnia nawet zamknięta (klucz) */
  private readonly coreBlocked: Uint8Array;
  /** ocieplenie pomieszczeń od kóz w °C; liczone co krok ciepła i od razu przy wczytaniu */
  boost: number[] = [];
  /** światło z palących się kóz w pomieszczeniach, 0–1 (dla rysowania: świecące okna nocą) */
  light: number[] = [];
  private pf: PathFinder;
  /** spójne obszary mapy dla zarządu: cel z innego obszaru zamieniamy na najbliższy osiągalny kafelek */
  private reg: Int32Array;
  /** przechodniość i obszary pozostałych: mieszkańcy (bez dziur, bramy i mieszkania zarządu), obcy (dziurami tak,
      zamkniętą bramą nie), tłum do pomiarów (za siatką, bez mieszkania zarządu), obcy po stronie ulicy (bez podwórka
      i wnętrz: tak podchodzą pod siatkę i uciekają spod niej, nie skracając sobie drogi przez podwórko) */
  private lay: Record<'resident' | 'szabrownik' | 'crowd' | 'outside', { blocked: Uint8Array; reg: Int32Array }>;
  /** mieszkanie zarządu z drzwiami (1) albo null */
  private readonly mask: Uint8Array | null;
  private readonly trunk: Int32Array;
  private readonly links: [number, number][];
  private readonly kinds: RoomKind[];
  /** przechodnie kafelki każdego pomieszczenia */
  private readonly roomTiles: number[][];
  /** pomieszczenie pod nogami: jak interior.room, ale drzwi należą do sąsiedniego pomieszczenia */
  private readonly roomOf: Int16Array;
  private readonly dry: number;
  /** kafelki podwórka przy bramie, na których stoi warta (najbliżej środka bramy najpierw) */
  private readonly gateStand: number[];
  /** kafelek za bramą, na którym znika i pojawia się wyprawa (−1: świat bez siatki) */
  readonly exitTile: number;
  /** kafelek przed drzwiami siedziby, do którego wraca wyprawa */
  private readonly door: number;

  constructor(w: World, st: SimState) {
    this.w = w;
    this.st = st;
    this.pf = new PathFinder(w.size);
    this.house = houseOf(w);
    this.trunk = Int32Array.from(w.trees, (t) => trunkOf(w, t));
    const h = this.house;
    this.mask = h ? homeMask(h, w.size) : null;
    this.blocked = new Uint8Array(w.size * w.size);
    this.coreBlocked = new Uint8Array(w.size * w.size);
    this.reg = new Int32Array(0);
    this.lay = {} as Sim['lay'];
    this.rebuild();
    this.links = h ? roomLinks(h, w.size) : [];
    this.kinds = h ? h.rooms.map((r) => r.kind) : [];
    this.roomTiles = h ? h.rooms.map(() => []) : [];
    if (h)
      for (let i = 0; i < w.size * w.size; i++) {
        const r = h.room[i];
        if (r >= 0 && !this.coreBlocked[i]) this.roomTiles[r].push(i);
      }
    this.roomOf = h ? h.room.slice() : new Int16Array(0);
    if (h)
      for (const d of h.doors) {
        if (this.roomOf[d] >= 0) continue;
        const x = d % w.size;
        for (const n of [x > 0 ? d - 1 : -1, x < w.size - 1 ? d + 1 : -1, d - w.size, d + w.size])
          if (n >= 0 && n < h.room.length && h.room[n] >= 0) {
            this.roomOf[d] = h.room[n];
            break;
          }
      }
    this.dry = dryTreeOf(w);
    const hq = w.buildings[w.hq];
    this.door = hq?.entrances[0]?.out ?? -1;
    const shape = fenceShape(w);
    const gate = gateTiles(w);
    const size = w.size;
    const cheb = (a: number, b: number) =>
      Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
    const gx = gate.reduce((a, g) => a + (g % size) + 0.5, 0) / Math.max(1, gate.length);
    const gy = gate.reduce((a, g) => a + Math.floor(g / size) + 0.5, 0) / Math.max(1, gate.length);
    const dg = (i: number) => ((i % size) + 0.5 - gx) ** 2 + (Math.floor(i / size) + 0.5 - gy) ** 2;
    // posterunek i wyjście liczone ze świata (z dziurami zamkniętymi), nie ze stanu: ścięte drzewo albo ognisko nie może
    // ich przesunąć, bo gra wczytana z zapisu musi iść dalej tak samo
    const still = w.blocked.slice();
    for (const t of shape?.hole ?? []) still[t] = 1;
    this.gateStand = (shape?.yard ?? [])
      .filter((i) => !still[i] && gate.some((g) => cheb(g, i) <= 1))
      .sort((a, b) => dg(a) - dg(b) || a - b);
    // za bramą: sąsiad kafelka bramy spoza podwórka, potem kilka kroków dalej od siatki
    let exit = -1;
    if (shape) {
      const yard = new Set(shape.yard);
      for (const g of gate) {
        for (const d of [-size, size, -1, 1]) {
          const o = g + d;
          if (o < 0 || o >= size * size || yard.has(o) || gate.includes(o) || still[o]) continue;
          exit = o;
          for (let k = 0; k < 6; k++) {
            const nx = exit + d;
            if (nx < 0 || nx >= size * size || still[nx] || Math.abs((nx % size) - (exit % size)) > 1) break;
            exit = nx;
          }
          break;
        }
        if (exit >= 0) break;
      }
    }
    this.exitTile = exit;
    if (h) {
      const fires = this.fires();
      this.boost = heatBoost(this.kinds, this.links, fires, this.outdoor());
      this.light = roomLight(this.kinds.length, this.links, fires);
    }
  }

  push(c: Command): void {
    this.st.cmds.push({ ...c, ids: [...c.ids] });
  }

  tileOf(p: Pawn): number {
    return Math.floor(p.y) * this.w.size + Math.floor(p.x);
  }

  /** temperatura na zewnątrz teraz */
  outdoor(): number {
    return outdoorTemp(this.st.seed, this.st.tick);
  }

  /** temperatura pod nogami: w pomieszczeniu siedziby jego temperatura, gdzie indziej pogoda */
  tempAt(tile: number): number {
    const r = this.house ? this.roomOf[tile] : -1;
    return r >= 0 ? this.st.temps[r] : this.outdoor();
  }

  /** Przechodniość od nowa: baza ze świata, ścięte drzewa wolne, łaty i ogniska zablokowane; zarząd bez otwartych
      dziur, mieszkańcy dodatkowo bez bramy i mieszkania zarządu, obcy z dziurami, ale bez zamkniętej bramy, tłum jak
      mieszkańcy. Woła się przy starcie, po ścięciu drzewa, łacie, nowym ognisku i zmianie bramy. */
  private rebuild(): void {
    const size = this.w.size;
    const solid = this.st.things
      .filter((t) => t.kind === 'ognisko')
      .map((t) => t.y * size + t.x)
      .sort((a, b) => a - b);
    const { core, resident, stranger } = composeLayers(
      this.w,
      this.st.felled,
      this.trunk,
      this.st.fence,
      this.mask,
      solid,
    );
    this.coreBlocked.set(core);
    this.blocked.set(stranger);
    this.reg = labelRegions(this.coreBlocked, size);
    // tłum do pomiarów chodzi tam, gdzie mieszkańcy nie: za siatką; warstwa ta sama, obszary rozłączne
    const res = { blocked: resident, reg: labelRegions(resident, size) };
    const outside = stranger.slice();
    const shape = fenceShape(this.w);
    // strona ulicy: bez podwórka, a dziury i brama to przejście, nie miejsce, w którym się czeka
    for (const t of shape?.yard ?? []) outside[t] = 1;
    for (const t of shape?.hole ?? []) outside[t] = 1;
    for (const t of gateTiles(this.w)) outside[t] = 1;
    if (this.house) for (let i = 0; i < outside.length; i++) if (this.house.room[i] >= 0) outside[i] = 1;
    this.lay = {
      resident: res,
      szabrownik: { blocked: stranger, reg: labelRegions(stranger, size) },
      crowd: res,
      outside: { blocked: outside, reg: labelRegions(outside, size) },
    };
  }

  /** przechodniość i obszary dla danego rodzaju pionka */
  private layer(kind: PawnKind): { blocked: Uint8Array; reg: Int32Array } {
    return kind === 'core' ? { blocked: this.coreBlocked, reg: this.reg } : this.lay[kind];
  }

  /** warstwa do drogi pionka: szabrownik po stronie ulicy (podchodzi, czeka, ucieka) chodzi tylko tamtędy */
  private layerOf(p: Pawn): { blocked: Uint8Array; reg: Int32Array } {
    if (p.kind === 'szabrownik' && p.job?.phase !== 2 && !this.lay.outside.blocked[this.tileOf(p)])
      return this.lay.outside;
    return this.layer(p.kind);
  }

  /** czy pionek danego rodzaju przejdzie przez kafelek (do testów i podglądu) */
  canWalk(kind: PawnKind, tile: number): boolean {
    return !this.layer(kind).blocked[tile];
  }

  /** cel do wyznaczenia drogi: wolny kafelek w tym samym obszarze co pionek, −1 gdy go nie ma */
  private goalFor(p: Pawn, goal: number): number {
    const size = this.w.size;
    const { blocked, reg } = this.layerOf(p);
    const s = nearestFree(blocked, size, this.tileOf(p));
    const g = nearestFree(blocked, size, goal);
    if (reg[g] === reg[s]) return g;
    this.stats.substituted++;
    return nearestInRegion(reg, size, g, reg[s]);
  }

  private routeTo(p: Pawn, g: number): boolean {
    this.stats.paths++;
    if (g < 0) {
      this.stats.failed++;
      return false;
    }
    const { blocked } = this.layerOf(p);
    const path = this.pf.find(blocked, nearestFree(blocked, this.w.size, this.tileOf(p)), g);
    this.stats.nodes += this.pf.expanded;
    if (!path) {
      this.stats.failed++;
      return false;
    }
    p.path = path;
    p.pi = 0;
    return true;
  }

  /** droga dokładnie na dany kafelek (praca); false, gdy się nie da */
  private go(p: Pawn, tile: number): boolean {
    const g = this.goalFor(p, tile);
    return g === tile && this.routeTo(p, g);
  }

  /** jeden krok symulacji */
  step(): void {
    const st = this.st;
    const size = this.w.size;
    const rnd = () => nextRandom(st.rng);
    for (const c of st.cmds.splice(0)) this.apply(c);
    // uchwała o bramie: kłódka o 20:00, otwarcie o 6:00 (w międzyczasie zarząd może otworzyć sam)
    if (st.laws.gateClosed && st.tick % TICKS_PER_HOUR === 0) {
      const h = hourOf(st.tick);
      if (h === 20) this.setGate(false);
      else if (h === GUARD_UNTIL) this.setGate(true);
    }
    if (st.raid) this.raidTick(st.raid);
    let budget = PATHS_PER_TICK;
    let gone = false;
    for (const p of st.pawns) {
      if (p.away) continue;
      if (p.pi < p.path.length) {
        this.walk(p);
        continue;
      }
      if (p.kind === 'core' || p.kind === 'resident') {
        this.coreTick(p);
        continue;
      }
      if (p.kind === 'szabrownik') {
        if (this.strangerTick(p)) gone = true;
        continue;
      }
      if (st.tick < p.wait) continue;
      if (p.want < 0) {
        // tłum: spacer w promieniu 28 m od swojej klatki
        const hx = p.home % size;
        const hy = Math.floor(p.home / size);
        const tx = Math.max(0, Math.min(size - 1, hx + Math.round((rnd() - 0.5) * 56)));
        const ty = Math.max(0, Math.min(size - 1, hy + Math.round((rnd() - 0.5) * 56)));
        p.want = ty * size + tx;
      }
      if (budget <= 0) continue;
      budget--;
      this.routeTo(p, this.goalFor(p, p.want));
      p.want = -1;
      p.wait = st.tick + 60 + Math.floor(rnd() * 240);
    }
    // szabrownicy, którzy doszli tam, skąd przyszli, znikają
    if (gone) st.pawns = st.pawns.filter((p) => !(p.kind === 'szabrownik' && p.job?.phase === 4));
    if (st.tick % HEAT_EVERY === 0) this.slow();
    st.tick++;
  }

  private walk(p: Pawn): void {
    const size = this.w.size;
    let left = WALK_SPEED;
    while (left > 1e-9 && p.pi < p.path.length) {
      const t = p.path[p.pi];
      const tx = (t % size) + 0.5;
      const ty = Math.floor(t / size) + 0.5;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dx) > Math.abs(dy) + 1e-9) p.dir = dx > 0 ? 3 : 2;
      else if (Math.abs(dy) > 1e-9) p.dir = dy > 0 ? 0 : 1;
      if (d <= left) {
        p.x = tx;
        p.y = ty;
        left -= d;
        p.pi++;
      } else {
        p.x += (dx / d) * left;
        p.y += (dy / d) * left;
        left = 0;
      }
    }
    p.walk += WALK_SPEED - left;
    if (p.pi >= p.path.length) {
      p.path = [];
      p.pi = 0;
    }
  }

  /* ---------- polecenia ---------- */

  private apply(c: Command): void {
    const st = this.st;
    if (c.t === 'gate') {
      this.setGate(c.open);
      return;
    }
    if (c.t === 'raid') {
      planRaid(st, c.at, c.post, false);
      return;
    }
    if (c.t === 'mend') {
      const open = (st.fence?.holes ?? []).filter((h) => !h.patch).sort((a, b) => b.size - a.size || a.id - b.id);
      for (const h of open.slice(0, Math.max(0, c.n))) h.patch = PATCH_HP;
      if (open.length && c.n > 0) this.rebuild();
      return;
    }
    if (c.t === 'laws') {
      const was = st.laws.gateClosed;
      st.laws = { ...st.laws, ...c.laws };
      // podpisana nocą: kłódka od razu
      const h = hourOf(st.tick);
      if (!was && st.laws.gateClosed && (h >= 20 || h < GUARD_UNTIL)) this.setGate(false);
      return;
    }
    // polecenia przyjmuje tylko zarząd, tłum to tło; kto jest na wyprawie, słucha tylko wezwania z powrotem
    const pawns: Pawn[] = [];
    for (const id of c.ids) {
      const p = st.pawns.find((q) => q.id === id);
      if (p && p.kind === 'core' && p.away === (c.t === 'back') && !pawns.includes(p)) pawns.push(p);
    }
    if (c.t === 'back') {
      for (const p of pawns) this.comeBack(p);
      return;
    }
    if (!pawns.length) return;
    this.tutEvent('zaznacz');
    if (c.t === 'move') this.orderMove(pawns, c.to, [], true);
    else if (c.t === 'chop') this.orderChop(pawns, c.tree);
    else if (c.t === 'haul') this.orderHaul(pawns, c.thing);
    else if (c.t === 'refuel') this.orderRefuel(pawns, c.thing);
    else if (c.t === 'burn') this.orderBurn(pawns, c.thing);
    else if (c.t === 'cook') this.orderCook(pawns);
    else if (c.t === 'guard') this.orderGuard(pawns, c.post);
    else if (c.t === 'patch') this.orderPatch(pawns, c.hole);
    else if (c.t === 'campfire') this.orderCampfire(pawns, c.at);
    else if (c.t === 'away') for (const p of pawns) this.startLeave(p);
  }

  /** uchwały od razu (interfejs woła po podpisaniu; w kolejce poleceń, żeby zapis i powtórka ich nie gubiły) */
  setLaws(laws: Partial<Laws>): void {
    this.push({ t: 'laws', ids: [], laws });
  }

  /** brama otwarta albo zamknięta; przechodniość od nowa tylko przy zmianie */
  private setGate(open: boolean): void {
    const f = this.st.fence;
    if (!f || f.gateOpen === open) return;
    f.gateOpen = open;
    this.rebuild();
  }

  /** posterunek warty z klucza 'brama' / 'd<id>' / 'koza': 0 brama, id dziury, KOZA_POST, null: nie ma takiego */
  private postOf(post: string): number | null {
    if (post === 'brama') return this.gateStand.length ? 0 : null;
    if (post === 'koza') return this.koza() ? KOZA_POST : null;
    const id = /^d(\d+)$/.exec(post)?.[1];
    return id && this.holeById(Number(id)) ? Number(id) : null;
  }

  private holeById(id: number): Hole | undefined {
    return this.st.fence?.holes.find((h) => h.id === id);
  }

  /** wolny kafelek podwórka (dla zarządu) najwyżej reach od któregoś z kafelków, najbliżej pionka; −1: brak */
  private standBy(p: Pawn, tiles: readonly number[], reach: number): number {
    const shape = fenceShape(this.w);
    if (!shape || !tiles.length) return -1;
    const size = this.w.size;
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const cand = shape.yard.filter(
      (i) =>
        !this.coreBlocked[i] &&
        this.reg[i] === region &&
        !taken.includes(i) &&
        !this.thingAt(i % size, Math.floor(i / size)) &&
        tiles.some(
          (t) =>
            Math.max(Math.abs((t % size) - (i % size)), Math.abs(Math.floor(t / size) - Math.floor(i / size))) <= reach,
        ),
    );
    return this.nearest(p, cand);
  }

  /** gdzie stoi warta: przy bramie najbliżej jej środka, przy dziurze tuż obok od strony podwórka, przy kozie przed nią */
  private guardStand(p: Pawn, post: number): number {
    if (post === KOZA_POST) {
      const koza = this.koza();
      return koza ? this.kozaStand(p, koza) : -1;
    }
    if (post === 0) {
      const taken = this.taken(p);
      const region = this.regionOf(p);
      const free = this.gateStand.find((i) => !this.coreBlocked[i] && !taken.includes(i) && this.reg[i] === region);
      return free ?? this.standBy(p, gateTiles(this.w), 2);
    }
    const hole = this.holeById(post);
    if (!hole) return -1;
    const s = this.standBy(p, hole.tiles, 1);
    return s >= 0 ? s : this.standBy(p, hole.tiles, 2);
  }

  /** tick najbliższej pełnej godziny h (dziś albo jutro) */
  private nextHour(h: number): number {
    const m = minutesAt(this.st.tick);
    let at = m - (m % 1440) + h * 60;
    if (at <= m) at += 1440;
    return Math.round(((at - START_MINUTES) * TICKS_PER_HOUR) / 60);
  }

  /** warta do rana: każdy na swoim kafelku przy posterunku */
  private orderGuard(pawns: Pawn[], key: string): void {
    const post = this.postOf(key);
    if (post === null) return;
    for (const p of pawns) {
      const stand = this.guardStand(p, post);
      if (stand < 0 || !this.go(p, stand)) continue;
      const j = this.newJob('guard', post, stand, true);
      j.until = this.nextHour(GUARD_UNTIL);
      this.setJob(p, j, false);
    }
  }

  /** pierwsza osoba łata, reszta idzie obok; gdy ktoś już łata tę dziurę, nowi idą pomóc */
  private orderPatch(pawns: Pawn[], id: number): void {
    const hole = this.holeById(id);
    if (!hole || hole.patch > 0) return;
    let rest = pawns;
    const busy = this.st.pawns.some((q) => q.job?.t === 'patch' && q.job.target === id);
    if (!busy && this.startPatch(pawns[0], hole)) rest = pawns.slice(1);
    const stand = rest.length ? this.standBy(rest[0], hole.tiles, 2) : -1;
    if (rest.length && stand >= 0) this.orderMove(rest, stand, [], true);
  }

  /** ognisko na wolnym kafelku podwórka; pierwsza osoba rozpala, reszta idzie obok */
  private orderCampfire(pawns: Pawn[], at: number): void {
    if (!this.siteOk(at)) return;
    let rest = pawns;
    if (this.startBuild(pawns[0], at)) rest = pawns.slice(1);
    if (rest.length) this.orderMove(rest, at, [at], true);
  }

  /** na tym kafelku można teraz rozpalić ognisko (campfireSpotOk) i nikt tam nie pracuje */
  siteOk(at: number): boolean {
    if (!campfireSpotOk(this.st, this.w, at)) return false;
    return !this.st.pawns.some((q) => q.job && (q.job.tile === at || (q.job.t === 'build' && q.job.target === at)));
  }

  /** kilka osób naraz: każda dostaje inny wolny kafelek ze spirali wokół celu;
      stay: po dojściu czeka na miejscu (zwykłe „idź tu”), inaczej od razu bierze się do własnej pracy
      (pomocnicy przy drzewie albo kozie) */
  private orderMove(pawns: Pawn[], to: number, taken: number[], stay: boolean): void {
    const size = this.w.size;
    const tx = to % size;
    const ty = Math.floor(to / size);
    let oi = 0;
    for (const p of pawns) {
      while (oi < SPREAD.length) {
        const [dx, dy] = SPREAD[oi++];
        const x = Math.max(0, Math.min(size - 1, tx + dx));
        const y = Math.max(0, Math.min(size - 1, ty + dy));
        const g = this.goalFor(p, y * size + x);
        if (g < 0 || taken.includes(g)) continue;
        taken.push(g);
        if (this.routeTo(p, g)) {
          p.want = -1;
          this.setJob(p, this.newJob('go', g, g, stay), false);
        }
        break;
      }
    }
  }

  /** pierwsza osoba ścina, reszta idzie obok drzewa (będzie pod ręką do noszenia); gdy ktoś już ścina
      to drzewo, rąbie dalej bez zaczynania od nowa, a nowi idą pomóc */
  private orderChop(pawns: Pawn[], k: number): void {
    if (!(k >= 0 && k < this.w.trees.length)) return;
    if (this.st.felled.includes(k)) {
      this.orderMove(pawns, this.trunk[k], [], true);
      return;
    }
    const taken: number[] = [];
    let rest = pawns;
    const chopper = this.st.pawns.find((q) => q.job?.t === 'chop' && q.job.target === k);
    if (chopper) {
      rest = pawns.filter((q) => q !== chopper);
      taken.push(chopper.job!.tile);
    } else {
      const stand = this.chopSpot(pawns[0], k);
      if (stand >= 0 && this.go(pawns[0], stand)) {
        this.setJob(pawns[0], this.newJob('chop', k, stand, true), false);
        taken.push(stand);
        if (k === this.dry) this.tutEvent('rozkaz');
        rest = pawns.slice(1);
      }
    }
    if (rest.length) this.orderMove(rest, this.trunk[k], taken, false);
  }

  /** pierwsza osoba bierze kliknięty stos, kolejne wolne stosy obok */
  private orderHaul(pawns: Pawn[], id: number): void {
    const size = this.w.size;
    const pile = this.thing(id);
    if (pile?.kind !== 'drewno') return;
    const tile = pile.y * size + pile.x;
    if (this.dropTile(pawns[0]) < 0 || this.house?.sklad.includes(tile)) {
      this.orderMove(pawns, tile, [], true);
      return;
    }
    const taken: number[] = [];
    pawns.forEach((p, k) => {
      const target = k === 0 ? pile : this.pileFor(p, 'outside', tile);
      const pt = target ? target.y * size + target.x : -1;
      if (!target || !this.go(p, pt)) {
        this.orderMove([p], tile, taken, false);
        return;
      }
      // z pełnymi rękami najpierw odkłada swoje, żeby wziąć to, co kazano
      this.setJob(p, this.newJob('haul', target.id, pt, true), false);
      target.by = p.id;
      taken.push(pt);
    });
  }

  private orderRefuel(pawns: Pawn[], id: number): void {
    const koza = this.thing(id);
    if (koza?.kind !== 'koza' && koza?.kind !== 'ognisko') return;
    const [first, ...rest] = pawns;
    const taken: number[] = [];
    if (this.startRefuel(first, true, koza)) taken.push(first.job!.tile);
    else rest.unshift(first);
    if (rest.length) this.orderMove(rest, koza.y * this.w.size + koza.x, taken, false);
  }

  /** pierwsza osoba gotuje, reszta idzie do kuchni */
  private orderCook(pawns: Pawn[]): void {
    const [first, ...rest] = pawns;
    const taken: number[] = [];
    if (this.startCook(first, true)) taken.push(first.job!.tile);
    else rest.unshift(first);
    const stove = this.cookAt();
    if (rest.length && stove) this.orderMove(rest, stove.y * this.w.size + stove.x, taken, false);
  }

  /** pierwsza osoba rozbiera mebel na opał, reszta idzie obok; gdy ktoś już go rozbiera, nowi idą pomóc */
  private orderBurn(pawns: Pawn[], id: number): void {
    const f = this.thing(id);
    if (!f || !BURNABLE[f.kind]) return;
    const taken: number[] = [];
    let rest = pawns;
    const burner = this.st.pawns.find((q) => q.job?.t === 'burn' && q.job.target === id);
    if (burner) {
      rest = pawns.filter((q) => q !== burner);
      taken.push(burner.job!.tile);
    } else {
      const stand = this.beside(pawns[0], f);
      if (stand >= 0 && this.go(pawns[0], stand)) {
        this.setJob(pawns[0], this.newJob('burn', f.id, stand, true), false);
        f.by = pawns[0].id;
        taken.push(stand);
        rest = pawns.slice(1);
      }
    }
    if (rest.length) this.orderMove(rest, f.y * this.w.size + f.x, taken, false);
  }

  /* ---------- prace ---------- */

  private newJob(t: JobKind, target: number, tile: number, order: boolean, phase = 0): Job {
    return { t, target, tile, phase, from: -1, t0: this.st.tick, until: 0, order, n: 0, what: '' };
  }

  /** zwalnia rzeczy zajęte przez pionek */
  private release(p: Pawn): void {
    for (const t of this.st.things) if (t.by === p.id) t.by = -1;
  }

  /** nowa praca zamiast starej; drewno z rąk zostaje na ziemi, chyba że nowa praca go potrzebuje */
  private setJob(p: Pawn, j: Job, keepCarry: boolean): void {
    this.release(p);
    this.dropLoad(p);
    if (!keepCarry) this.dropCarry(p);
    p.job = j;
  }

  /** koniec pracy: rzeczy wolne, od razu rozgląda się za następną */
  private done(p: Pawn): void {
    this.release(p);
    this.dropLoad(p);
    p.job = null;
    p.wait = this.st.tick;
    if (this.house && p.needs) this.think(p);
  }

  private thing(id: number): Thing | undefined {
    return this.st.things.find((t) => t.id === id);
  }

  /** koza zarządu (w jego mieszkaniu) */
  private koza(): Thing | undefined {
    return this.house ? homeKoza(this.house, this.w.size, this.st.things) : undefined;
  }

  /** stos drewna na kafelku */
  private pileAt(i: number): Thing | undefined {
    const size = this.w.size;
    return this.st.things.find((t) => t.kind === 'drewno' && t.x === i % size && t.y === Math.floor(i / size));
  }

  /** obszar mapy, w którym stoi pionek */
  private regionOf(p: Pawn): number {
    return this.reg[nearestFree(this.coreBlocked, this.w.size, this.tileOf(p))];
  }

  private food(): Thing | undefined {
    return this.st.things.find((t) => t.kind === 'jedzenie' && t.n > 0);
  }

  private furnitureAt(x: number, y: number): boolean {
    return this.st.things.some((t) => !LOOSE.has(t.kind) && covers(t, x, y));
  }

  private thingAt(x: number, y: number): boolean {
    return this.st.things.some((t) => covers(t, x, y));
  }

  /** kafelki, na których stoją albo pracują inni z rdzenia */
  private taken(p: Pawn): number[] {
    const out: number[] = [];
    for (const q of this.st.pawns) if (q !== p && q.job) out.push(q.job.tile);
    return out;
  }

  private dist2(p: Pawn, i: number): number {
    const size = this.w.size;
    return ((i % size) + 0.5 - p.x) ** 2 + (Math.floor(i / size) + 0.5 - p.y) ** 2;
  }

  /** najbliższy pionkowi kafelek z listy (remis: mniejszy numer) albo −1 */
  private nearest(p: Pawn, tiles: number[]): number {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const i of tiles) {
      const d = this.dist2(p, i);
      if (d < bd || (d === bd && i < best)) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private face(p: Pawn, x: number, y: number): void {
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.abs(dx) > Math.abs(dy) + 1e-9) p.dir = dx > 0 ? 3 : 2;
    else if (Math.abs(dy) > 1e-9) p.dir = dy > 0 ? 0 : 1;
  }

  /** wolny kafelek obok pnia, osiągalny dla pionka */
  private chopSpot(p: Pawn, k: number): number {
    const size = this.w.size;
    const t = this.trunk[k];
    const tx = t % size;
    const ty = Math.floor(t / size);
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const cand: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        if (!this.coreBlocked[i] && this.reg[i] === region && !taken.includes(i)) cand.push(i);
      }
    return this.nearest(p, cand);
  }

  /** kafelek składu z miejscem na drewno, do którego pionek dojdzie (−1: brak składu albo pełny) */
  private dropTile(p: Pawn): number {
    const h = this.house;
    if (!h) return -1;
    const size = this.w.size;
    const region = this.regionOf(p);
    for (const i of h.sklad) {
      if (this.coreBlocked[i] || this.reg[i] !== region) continue;
      const pile = this.pileAt(i);
      if (pile ? pile.n < STACK : !this.thingAt(i % size, Math.floor(i / size))) return i;
    }
    return -1;
  }

  /** dokłada drewno na kafelek (do stosu, który tam leży) */
  private addWood(i: number, n: number): void {
    const pile = this.pileAt(i);
    if (pile) pile.n += n;
    else {
      const t = newThing(this.st, 'drewno', i % this.w.size, Math.floor(i / this.w.size));
      t.n = n;
      this.st.things.push(t);
    }
  }

  private takeWood(pile: Thing, n: number): void {
    pile.n -= n;
    pile.by = -1;
    if (pile.n <= 0) this.st.things.splice(this.st.things.indexOf(pile), 1);
  }

  /** drewno z rąk zostaje obok pionka */
  private dropCarry(p: Pawn): void {
    if (p.carry <= 0) return;
    this.addWood(this.spotNear(this.tileOf(p), p.carry), p.carry);
    p.carry = 0;
  }

  /** wolny kafelek przy rzeczy (mebel stoi na przechodnim kafelku, ale pracuje się obok), osiągalny dla pionka;
      najchętniej taki, na którym nikt nie stoi, a gdy wszystkie zajęte (kolacja przy stole), to i tak obok */
  private beside(p: Pawn, t: Thing): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const free: number[] = [];
    const busy: number[] = [];
    for (let y = t.y - 1; y <= t.y + t.h; y++)
      for (let x = t.x - 1; x <= t.x + t.w; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size || covers(t, x, y)) continue;
        const i = y * size + x;
        if (this.coreBlocked[i] || this.reg[i] !== region || this.furnitureAt(x, y)) continue;
        (taken.includes(i) ? busy : free).push(i);
      }
    return this.nearest(p, free.length ? free : busy);
  }

  /** najbliższy kafelkowi wolny kafelek w tym samym obszarze, bez mebli, pnia i jedzenia: na stos, na który
      się jeszcze zmieści, albo na pusty */
  private spotNear(from: number, n: number): number {
    const size = this.w.size;
    const at = nearestFree(this.coreBlocked, size, from);
    const ax = at % size;
    const ay = Math.floor(at / size);
    for (const [dx, dy] of SPREAD) {
      const x = ax + dx;
      const y = ay + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[at]) continue;
      const pile = this.pileAt(i);
      if (pile ? pile.n + n <= STACK : !this.thingAt(x, y)) return i;
    }
    return at;
  }

  /** wolny stos drewna najbliżej pionka: w składzie, poza nim albo gdziekolwiek (najpierw w składzie);
      near: tylko stosy do 4 m od tego kafelka */
  private pileFor(p: Pawn, where: 'sklad' | 'outside' | 'any', near = -1): Thing | undefined {
    const size = this.w.size;
    const sklad = this.house ? this.house.sklad : [];
    const region = this.regionOf(p);
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      // własny stos (np. niesie go właśnie do składu) też się liczy
      if (t.kind !== 'drewno' || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      const i = t.y * size + t.x;
      // stos, do którego nie da się dojść, nie zasłania osiągalnych
      if (this.reg[i] !== region) continue;
      const inSklad = sklad.includes(i);
      if ((where === 'sklad' && !inSklad) || (where === 'outside' && inSklad)) continue;
      if (near >= 0 && Math.max(Math.abs(t.x - (near % size)), Math.abs(t.y - Math.floor(near / size))) > 4) continue;
      const d = this.dist2(p, i) - (where === 'any' && inSklad ? 1e6 : 0);
      if (d < bd || (d === bd && best && t.id < best.id)) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** kafelek, z którego się obsługuje mebel przy ścianie (koza, kuchenka): najchętniej ten przed nim (kontrakt
      wnętrza trzyma go wolnym przy kozie; to strona przeciwna do ściany, rot), a gdy zajęty, najbliższy wolny obok
      (skład też się nadaje) */
  private frontOf(p: Pawn, t: Thing): number {
    const size = this.w.size;
    const cx = t.x + (t.w >> 1);
    const cy = t.y + (t.h >> 1);
    const front = [(t.y + t.h) * size + cx, cy * size + t.x - 1, (t.y - 1) * size + cx, cy * size + t.x + t.w][t.rot];
    const region = this.regionOf(p);
    const ok =
      front !== undefined &&
      front >= 0 &&
      front < size * size &&
      !this.coreBlocked[front] &&
      this.reg[front] === region &&
      !this.furnitureAt(front % size, Math.floor(front / size)) &&
      !this.taken(p).includes(front);
    return ok ? front : this.beside(p, t);
  }

  /** skąd dokłada: do kozy od frontu, do ogniska z dowolnej strony */
  private kozaStand(p: Pawn, koza: Thing): number {
    return koza.kind === 'ognisko' ? this.beside(p, koza) : this.frontOf(p, koza);
  }

  /** gdzie się gotuje: kuchenka zarządu z gazem, a bez gazu paląca się koza (undefined: nie da się) */
  private cookAt(): Thing | undefined {
    const stove = homeStove(this.house!, this.w.size, this.st.things);
    if (stove && stove.fuel > 0) return stove;
    const koza = this.koza();
    return koza && koza.fuel > 0 ? koza : undefined;
  }

  /** porcje ugotowanego posiłku w garnkach */
  private meals(): number {
    return this.st.things.reduce((a, t) => a + (t.kind === 'posilek' ? t.n : 0), 0);
  }

  /** miejsce do grzania się: do FIRE_REACH od kozy, w jej pomieszczeniu, poza meblami i składem */
  private warmSpot(p: Pawn, koza: Thing): number {
    const h = this.house!;
    const size = this.w.size;
    const room = h.room[koza.y * size + koza.x];
    if (room < 0) return -1;
    const cx = koza.x + koza.w / 2;
    const cy = koza.y + koza.h / 2;
    const taken = this.taken(p);
    const cand = this.roomTiles[room].filter((i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      return (
        Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= FIRE_REACH &&
        !this.thingAt(x, y) &&
        !h.sklad.includes(i) &&
        !taken.includes(i)
      );
    });
    return this.nearest(p, cand);
  }

  /** ile sztuk drewna jeszcze wejdzie do kozy albo ogniska */
  private kozaRoom(koza: Thing): number {
    const cap = koza.kind === 'ognisko' ? CAMPFIRE_CAP : KOZA_CAP;
    return Math.floor((cap * BURN_TICKS - koza.fuel) / BURN_TICKS);
  }

  /** drzewo pada: zostaje pień, kafelek się zwalnia, drewno leży w stosach dookoła, po tej stronie,
      z której rąbał drwal (stand), żeby dało się do niego dojść */
  private fell(k: number, stand: number): void {
    const st = this.st;
    const size = this.w.size;
    const t = this.trunk[k];
    st.felled.push(k);
    st.felled.sort((a, b) => a - b);
    this.rebuild();
    st.things.push(newThing(st, 'pien', t % size, Math.floor(t / size)));
    let left = woodFrom(this.w.trees[k]);
    for (const [dx, dy] of SPREAD) {
      if (left <= 0) break;
      const x = (t % size) + dx;
      const y = Math.floor(t / size) + dy;
      if ((!dx && !dy) || x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[stand] || this.thingAt(x, y)) continue;
      const n = Math.min(CARRY, left);
      this.addWood(i, n);
      left -= n;
    }
    if (left > 0) this.addWood(stand, left);
  }

  private coreTick(p: Pawn): void {
    const j = p.job;
    if (j) {
      if (!this.work(p, j)) this.done(p);
    } else if (this.house && p.needs && this.st.tick >= p.wait) this.think(p);
  }

  /** praca pionka, który nie idzie: doszedł do celu albo pracuje; false, gdy praca się skończyła
      albo nie da się jej dokończyć (cel zniknął, ktoś go przejął, nie doszedł) */
  private work(p: Pawn, j: Job): boolean {
    const st = this.st;
    const tick = st.tick;
    const at = this.tileOf(p) === j.tile;
    switch (j.t) {
      case 'go':
        // po poleceniu czeka na miejscu godzinę gry, chyba że coś pilnego
        if (j.phase === 0 && j.order) {
          j.phase = 1;
          j.until = tick + STAY_AFTER_ORDER;
          return true;
        }
        return j.phase === 1 && tick < j.until && !(tick % THINK_EVERY === 0 && this.urgent(p));
      case 'chop': {
        const tree = this.w.trees[j.target];
        if (j.phase === 1) {
          if (tick < j.until) return true;
          if (!st.felled.includes(j.target)) this.fell(j.target, j.tile);
          return false;
        }
        if (!at || st.felled.includes(j.target)) return false;
        j.phase = 1;
        j.t0 = tick;
        j.until = tick + chopTicks(tree);
        this.face(p, tree.x, tree.y);
        return true;
      }
      case 'haul': {
        if (j.phase === 1) {
          if (at) this.stack(p);
          return false;
        }
        const pile = this.thing(j.target);
        if (!at || !pile || pile.by !== p.id) return false;
        const take = Math.min(pile.n, CARRY - p.carry);
        this.takeWood(pile, take);
        p.carry += take;
        const dest = this.dropTile(p);
        if (dest < 0 || !this.go(p, dest)) return false;
        j.phase = 1;
        j.target = -1;
        j.tile = dest;
        return true;
      }
      case 'refuel': {
        const koza = this.thing(j.target);
        if (!koza || koza.by !== p.id) return false;
        if (j.phase === 1) {
          if (at) {
            const add = Math.min(p.carry, this.kozaRoom(koza));
            koza.fuel += add * BURN_TICKS;
            p.carry -= add;
            this.face(p, koza.x + koza.w / 2, koza.y + koza.h / 2);
          }
          return false;
        }
        const pile = this.thing(j.from);
        if (!at || !pile || pile.by !== p.id) return false;
        const take = Math.min(pile.n, CARRY - p.carry, Math.max(1, this.kozaRoom(koza)));
        this.takeWood(pile, take);
        p.carry += take;
        const stand = this.kozaStand(p, koza);
        if (stand < 0 || !this.go(p, stand)) return false;
        j.phase = 1;
        j.from = -1;
        j.tile = stand;
        return true;
      }
      case 'warm': {
        const koza = this.thing(j.target);
        const lit = !!koza && koza.fuel > 0;
        if (j.phase === 1) return lit && p.needs!.warm < WARMED && tick < j.until;
        if (!at || !koza || !lit) return false;
        j.phase = 1;
        j.t0 = tick;
        j.until = tick + WARM_MAX;
        this.face(p, koza.x + koza.w / 2, koza.y + koza.h / 2);
        return true;
      }
      case 'eat': {
        if (j.phase === 1) {
          if (tick < j.until) return true;
          // z wybranego garnka albo zapasów, a gdy ktoś je wyjadł, z czegokolwiek: najpierw ciepłe
          const src =
            st.things.find((t) => t.id === j.from && t.n > 0) ??
            st.things.find((t) => t.kind === 'posilek' && t.n > 0) ??
            this.food();
          if (src) {
            src.n--;
            if (src.n <= 0) st.things.splice(st.things.indexOf(src), 1);
            const hot = src.kind === 'posilek';
            p.needs!.food = Math.min(100, p.needs!.food + (hot ? MEAL : COLD_MEAL));
            if (hot) this.addMood(p, 'Ciepły posiłek', 4, 4 * TICKS_PER_HOUR);
            else this.addMood(p, 'Zimne z puszki', -3, 4 * TICKS_PER_HOUR);
          }
          return false;
        }
        if (!at || !(this.food() || this.meals() > 0)) return false;
        j.phase = 1;
        j.t0 = tick;
        j.until = tick + EAT_TICKS;
        const table = this.thing(j.target);
        if (table) this.face(p, table.x + table.w / 2, table.y + table.h / 2);
        return true;
      }
      case 'sleep':
        if (j.phase === 1) return this.night() || p.needs!.rest < 60;
        if (!at) return false;
        j.phase = 1;
        j.t0 = tick;
        return true;
      case 'cook': {
        const stove = this.thing(j.target);
        const hot = !!stove && stove.fuel > 0;
        if (j.phase === 0) {
          if (!at || !hot || !this.food()) return false;
          j.phase = 1;
          j.t0 = tick;
          j.until = tick + COOK_TICKS;
          this.face(p, stove.x + stove.w / 2, stove.y + stove.h / 2);
          return true;
        }
        if (tick < j.until) return true;
        // bez gazu albo ognia na koniec nic się nie ugotowało, zapasy zostają
        const food = this.food();
        if (!hot || !food) return false;
        const cores = st.pawns.filter((q) => q.kind === 'core').length;
        const batch = Math.min(food.n, Math.max(1, cores - this.meals()));
        food.n -= batch;
        if (food.n <= 0) st.things.splice(st.things.indexOf(food), 1);
        this.serve(batch, j.tile);
        if (stove.kind === 'kuchenka') stove.fuel = Math.max(0, stove.fuel - COOK_TICKS);
        return false;
      }
      case 'stay':
        if (j.phase === 1) return tick < j.until;
        if (!at) return false;
        j.phase = 1;
        return true;
      case 'guard': {
        // nie śpi do rana; schodzi z posterunku tylko wtedy, gdy zdrowie siada
        if (j.phase === 1) {
          if (tick >= j.until || p.needs!.health < 30) return false;
          // przy kozie: kiedy ognia zostaje mało, idzie po drewno i dokłada
          if (j.target === KOZA_POST && tick % THINK_EVERY === 0) this.tendKoza(p, j);
          return true;
        }
        if (j.phase === 2) {
          // przy stosie: drewno do rąk, potem do kozy
          const koza = this.koza();
          const pile = this.thing(j.from);
          if (!koza || !at || !pile || pile.by !== p.id) return this.backToPost(p, j);
          const take = Math.min(pile.n, CARRY - p.carry, Math.max(1, this.kozaRoom(koza)));
          this.takeWood(pile, take);
          p.carry += take;
          return this.carryToKoza(p, j, koza);
        }
        if (j.phase === 3) {
          const koza = this.koza();
          if (koza && at) {
            const add = Math.min(p.carry, this.kozaRoom(koza));
            koza.fuel += add * BURN_TICKS;
            p.carry -= add;
            this.face(p, koza.x + koza.w / 2, koza.y + koza.h / 2);
          }
          return this.backToPost(p, j);
        }
        if (!at) return false;
        j.phase = 1;
        j.t0 = tick;
        const size = this.w.size;
        const koza = j.target === KOZA_POST ? this.koza() : undefined;
        if (koza) this.face(p, koza.x + koza.w / 2, koza.y + koza.h / 2);
        else {
          const hole = j.target > 0 ? this.holeById(j.target) : undefined;
          const look = hole ? hole.tiles : gateTiles(this.w);
          if (look.length) this.face(p, (look[0] % size) + 0.5, Math.floor(look[0] / size) + 0.5);
        }
        return true;
      }
      case 'patch': {
        const hole = this.holeById(j.target);
        if (!hole || hole.patch > 0) return false;
        const size = this.w.size;
        if (j.phase === 0) {
          const heap = this.thing(j.from);
          if (!at || !heap || heap.by !== p.id) return false;
          const take = Math.min(heap.n, PATCH_COST - j.n);
          heap.n -= take;
          heap.by = -1;
          j.n += take;
          if (!j.what) j.what = heap.kind;
          if (heap.n <= 0) st.things.splice(st.things.indexOf(heap), 1);
          if (j.n < PATCH_COST) {
            // za mało na jednej stercie: następna tego samego materiału
            const next = this.heapFor(p, j.what);
            const nt = next ? next.y * size + next.x : -1;
            if (!next || !this.go(p, nt)) return false;
            j.from = next.id;
            j.tile = nt;
            next.by = p.id;
            return true;
          }
          const stand = this.standBy(p, hole.tiles, 1);
          if (stand < 0 || !this.go(p, stand)) return false;
          j.phase = 1;
          j.from = -1;
          j.tile = stand;
          return true;
        }
        if (j.phase === 1) {
          if (!at) return false;
          j.phase = 2;
          j.t0 = tick;
          j.until = tick + PATCH_TICKS;
          this.face(p, (hole.tiles[0] % size) + 0.5, Math.floor(hole.tiles[0] / size) + 0.5);
          return true;
        }
        if (tick < j.until) return true;
        hole.patch = PATCH_HP;
        j.n = 0;
        this.rebuild();
        return false;
      }
      case 'build': {
        const size = this.w.size;
        const site = j.target;
        const sx = site % size;
        const sy = Math.floor(site / size);
        // ktoś postawił tam coś innego
        if (this.thingAt(sx, sy)) return false;
        if (j.phase === 0) {
          const pile = this.thing(j.from);
          if (!at || !pile || pile.by !== p.id) return false;
          const take = Math.min(pile.n, CAMPFIRE_WOOD - p.carry);
          this.takeWood(pile, take);
          p.carry += take;
          if (p.carry < CAMPFIRE_WOOD) {
            const next = this.pileFor(p, 'any');
            const nt = next ? next.y * size + next.x : -1;
            if (!next || !this.go(p, nt)) return false;
            j.from = next.id;
            j.tile = nt;
            next.by = p.id;
            return true;
          }
          const stand = this.siteStand(p, site);
          if (stand < 0 || !this.go(p, stand)) return false;
          j.phase = 1;
          j.from = -1;
          j.tile = stand;
          return true;
        }
        if (j.phase === 1) {
          if (!at || p.carry < CAMPFIRE_WOOD) return false;
          j.phase = 2;
          j.t0 = tick;
          j.until = tick + BUILD_TICKS;
          this.face(p, sx + 0.5, sy + 0.5);
          return true;
        }
        if (tick < j.until) return true;
        if (p.carry < CAMPFIRE_WOOD) return false;
        p.carry -= CAMPFIRE_WOOD;
        const fire = newThing(st, 'ognisko', sx, sy);
        fire.fuel = CAMPFIRE_WOOD * BURN_TICKS;
        st.things.push(fire);
        this.rebuild();
        return false;
      }
      case 'raid':
        // szabrownicy mają własny krok (strangerTick)
        return false;
      case 'leave':
        // za bramą znika; wraca poleceniem 'back'
        if (j.phase === 1) return true;
        if (!at) return false;
        j.phase = 1;
        p.away = true;
        p.path = [];
        p.pi = 0;
        return true;
      case 'burn': {
        const f = this.thing(j.target);
        if (!f || f.by !== p.id) return false;
        if (j.phase === 0) {
          if (!at) return false;
          j.phase = 1;
          j.t0 = tick;
          j.until = tick + BREAK_TICKS;
          this.face(p, f.x + f.w / 2, f.y + f.h / 2);
          return true;
        }
        if (tick < j.until) return true;
        this.burnUp(f, p);
        // opał od razu do kozy, a gdy się nie zmieści, do składu
        const koza = this.koza();
        if (koza && this.kozaRoom(koza) >= 1 && this.startRefuel(p, true, koza)) return true;
        return this.startHaul(p);
      }
    }
  }

  /** mebel rozebrany: znika ze stanu, drewno w rękach (reszta obok), nastrój spada wszystkim z zarządu,
      a właścicielowi najbardziej; meble sąsiadów kosztują więcej */
  private burnUp(f: Thing, p: Pawn): void {
    const st = this.st;
    const h = this.house!;
    const i = f.y * this.w.size + f.x;
    const r = h.room[i];
    const apt = r >= 0 ? h.rooms[r].apt : -1;
    const mine = h.home >= 0 && apt === h.home;
    st.things.splice(st.things.indexOf(f), 1);
    st.burned.push({ tick: st.tick, kind: f.kind, apt, by: p.id });
    const wood = BURNABLE[f.kind] ?? 0;
    const take = Math.min(wood, CARRY - p.carry);
    p.carry += take;
    if (wood > take) this.addWood(this.spotNear(i, wood - take), wood - take);
    // uchwała może złagodzić albo zaostrzyć karę (mnożnik z zarządu)
    const k = st.laws.burnMood;
    for (const q of st.pawns)
      if (q.needs)
        this.addMood(
          q,
          mine ? 'Palimy meble' : 'Rozbieramy cudze mieszkanie',
          Math.round((mine ? -6 : -10) * k),
          (mine ? 12 : 24) * TICKS_PER_HOUR,
        );
    const owner = st.pawns.find((q) => q.id === f.owner);
    if (owner?.needs)
      this.addMood(owner, `Spalili ${MINE[f.kind] ?? 'moją rzecz'}`, Math.round(-18 * k), 48 * TICKS_PER_HOUR);
  }

  /** garnek z porcjami na stole zarządu (bez stołu obok miejsca gotowania) */
  private serve(n: number, near: number): void {
    const size = this.w.size;
    const pot = this.st.things.find((t) => t.kind === 'posilek');
    if (pot) {
      pot.n += n;
      return;
    }
    const table = this.st.things.find((t) => t.kind === 'stol' && inHomeApt(this.house!, t.y * size + t.x));
    const at = table ? table.y * size + table.x : this.spotNear(near, 0);
    const t = newThing(this.st, 'posilek', at % size, Math.floor(at / size));
    t.n = n;
    this.st.things.push(t);
  }

  /** chwilowy nastrój; ten sam powód drugi raz tylko przedłuża czas */
  private addMood(p: Pawn, why: string, d: number, ticks: number): void {
    const m = p.moods.find((q) => q.why === why);
    if (m) m.until = Math.max(m.until, this.st.tick + ticks);
    else p.moods.push({ why, d, until: this.st.tick + ticks });
  }

  /** drewno z rąk na skład: na kafelki składu z miejscem, po kolei */
  private stack(p: Pawn): void {
    const size = this.w.size;
    for (const i of this.house?.sklad ?? []) {
      if (p.carry <= 0) break;
      if (this.coreBlocked[i]) continue;
      const pile = this.pileAt(i);
      if (!pile && this.thingAt(i % size, Math.floor(i / size))) continue;
      const n = Math.min(p.carry, STACK - (pile ? pile.n : 0));
      if (n <= 0) continue;
      this.addWood(i, n);
      p.carry -= n;
    }
  }

  private night(): boolean {
    const h = hourOf(this.st.tick);
    return h >= 22 || h < 6;
  }

  /** potrzeba, która przerywa czekanie po poleceniu */
  private urgent(p: Pawn): boolean {
    const n = p.needs;
    return !!n && (n.warm < 10 || n.food < 10 || n.rest < 5);
  }

  /** Bezczynny rdzeń sam: śpi w nocy albo z wyczerpania, je, gdy głodny, dokłada do kozy, gdy się kończy,
      zanosi leżące drewno do składu i grzeje się przy kozie, kiedy mu zimno. Sam nie ścina drzew:
      to polecenie gracza (samouczek). */
  private think(p: Pawn): void {
    if (p.kind === 'resident') {
      this.plan(p);
      return;
    }
    const n = p.needs!;
    if (p.carry > 0) {
      if (this.startRefuel(p, false) || this.startHaul(p)) return;
      this.dropCarry(p);
    }
    if (((this.night() && n.rest < 80) || n.rest < TIRED) && this.startSleep(p)) return;
    if (n.food < HUNGRY && this.startEat(p)) return;
    if (this.startRefuel(p, false) || this.startHaul(p)) return;
    if (this.shouldCook() && this.startCook(p, false)) return;
    if (n.warm < COLD && this.startWarm(p)) return;
    p.wait = this.st.tick + THINK_EVERY;
  }

  /** Plan dnia mieszkańca: nocą śpi w swoim mieszkaniu, rano siedzi w domu, od WORK_START do 18:00 pracuje na
      podwórku (za siatką, nie przełazi dziurami), od 18:00 grzeje się przy ognisku, jeśli się pali, potem wraca do domu. */
  private plan(p: Pawn): void {
    const st = this.st;
    const h = hourOf(st.tick);
    if (this.night() && this.startSleep(p)) return;
    let kind = STAY_HOME;
    if (!this.night() && h >= st.laws.workStart && h < 18) kind = STAY_YARD;
    else if (h >= 18 && h < 20 && this.campfire()) kind = STAY_FIRE;
    const spot = kind === STAY_YARD ? this.yardSpot(p) : kind === STAY_FIRE ? this.fireSpot(p) : this.homeSpot(p);
    if (spot >= 0 && this.go(p, spot)) {
      const j = this.newJob('stay', kind, spot, false);
      j.until = st.tick + (kind === STAY_YARD ? 400 + Math.floor(nextRandom(st.rng) * 600) : 600);
      this.setJob(p, j, false);
      return;
    }
    p.wait = st.tick + THINK_EVERY;
  }

  /** paląca się ognisko albo undefined */
  private campfire(): Thing | undefined {
    return this.st.things.find((t) => t.kind === 'ognisko' && t.fuel > 0);
  }

  /** losowy wolny kafelek z listy w obszarze pionka (jego warstwa), bez rzeczy i cudzych miejsc pracy */
  private pickSpot(p: Pawn, tiles: readonly number[]): number {
    const size = this.w.size;
    const lay = this.layer(p.kind);
    const region = lay.reg[nearestFree(lay.blocked, size, this.tileOf(p))];
    const taken = this.taken(p);
    const cand = tiles.filter(
      (i) =>
        !lay.blocked[i] && lay.reg[i] === region && !taken.includes(i) && !this.thingAt(i % size, Math.floor(i / size)),
    );
    return cand.length ? cand[Math.floor(nextRandom(this.st.rng) * cand.length)] : -1;
  }

  /** miejsce pracy mieszkańca na podwórku */
  private yardSpot(p: Pawn): number {
    return this.pickSpot(p, (this.w as { fence?: World['fence'] }).fence?.yard ?? []);
  }

  /** miejsce w domu mieszkańca (w jego mieszkaniu) */
  private homeSpot(p: Pawn): number {
    const h = this.house;
    if (!h) return -1;
    const tiles: number[] = [];
    for (const r of h.rooms) if (r.apt === p.apt && p.apt >= 0) tiles.push(...this.roomTiles[r.id]);
    return this.pickSpot(p, tiles);
  }

  /** miejsce przy palącym się ognisku */
  private fireSpot(p: Pawn): number {
    const fire = this.campfire();
    if (!fire) return -1;
    const size = this.w.size;
    const tiles: number[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = fire.x + dx;
        const y = fire.y + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < size && y < size && Math.hypot(dx, dy) <= FIRE_REACH)
          tiles.push(y * size + x);
      }
    return this.pickSpot(p, tiles);
  }

  private startSleep(p: Pawn): boolean {
    const h = this.house!;
    const size = this.w.size;
    const taken = this.taken(p);
    // zarząd śpi w swoim mieszkaniu, mieszkaniec w swoim
    const apt = p.kind === 'resident' ? p.apt : h.home;
    // najpierw własne łóżko, potem niczyje, na końcu cudze
    let bed: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      const i = t.y * size + t.x;
      if (!BEDS.has(t.kind) || apt < 0 || aptAt(h, i) !== apt || this.layer(p.kind).blocked[i] || taken.includes(i))
        continue;
      const d = this.dist2(p, i) + (t.owner === p.id ? 0 : t.owner < 0 ? 1e6 : 2e6);
      if (d < bd) {
        bd = d;
        bed = t;
      }
    }
    let tile = bed ? bed.y * size + bed.x : -1;
    if (!bed) {
      // łóżek za mało: śpi na podłodze w pokoju zarządu, a bez pokoju gdziekolwiek w mieszkaniu
      const floorIn = (pokoj: boolean) => {
        const out: number[] = [];
        for (const r of h.rooms)
          if (apt >= 0 && r.apt === apt && (!pokoj || r.kind === 'pokoj'))
            for (const i of this.roomTiles[r.id])
              if (!taken.includes(i) && !this.thingAt(i % size, Math.floor(i / size))) out.push(i);
        return out;
      };
      const floor = floorIn(true);
      tile = this.nearest(p, floor.length ? floor : floorIn(false));
    }
    if (tile < 0 || !this.go(p, tile)) return false;
    this.setJob(p, this.newJob('sleep', bed ? bed.id : -1, tile, false), false);
    return true;
  }

  /** gotować trzeba, gdy w garnkach jest mniej porcji, niż jest ludzi, którzy zaraz zgłodnieją (kto właśnie je,
      za chwilę będzie najedzony), są zapasy i ogień albo gaz, a nikt inny akurat nie gotuje; gotuje się wtedy
      od razu dla wszystkich, żeby nie palić gazu na jedną porcję */
  private shouldCook(): boolean {
    const cores = this.st.pawns.filter((q) => q.kind === 'core');
    const soon = cores.filter((q) => (q.needs?.food ?? 100) < PECKISH && q.job?.t !== 'eat').length;
    return soon > this.meals() && !cores.some((q) => q.job?.t === 'cook') && canCookIn(this.st, this.w);
  }

  private startCook(p: Pawn, order: boolean): boolean {
    if (!this.food()) return false;
    if (!order && this.st.pawns.some((q) => q !== p && q.job?.t === 'cook')) return false;
    const stove = this.cookAt();
    if (!stove) return false;
    const stand = this.frontOf(p, stove);
    if (stand < 0 || !this.go(p, stand)) return false;
    this.setJob(p, this.newJob('cook', stove.id, stand, order), false);
    return true;
  }

  /** jedzenie: ciepły posiłek z garnka, a gdy go nie ma, zimna konserwa z zapasów, ale tylko wtedy, gdy nie da się
      ugotować albo głód jest już duży (inaczej ktoś najpierw ugotuje) */
  private startEat(p: Pawn): boolean {
    const h = this.house!;
    const size = this.w.size;
    const pot = this.st.things.find((t) => t.kind === 'posilek' && t.n > 0);
    const raw = this.food();
    const food = pot ?? (raw && (p.needs!.food < 15 || !canCookIn(this.st, this.w)) ? raw : undefined);
    if (!food) return false;
    const fi = food.y * size + food.x;
    // stół w mieszkaniu zarządu najbliżej zapasów
    let table: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (t.kind !== 'stol' || !inHomeApt(h, t.y * size + t.x)) continue;
      const d = (t.x - food.x) ** 2 + (t.y - food.y) ** 2;
      if (d < bd) {
        bd = d;
        table = t;
      }
    }
    const taken = this.taken(p);
    const seats: number[] = [];
    if (table) {
      // krzesła przy stole i wolne kafelki dookoła niego
      const tb: Thing = table;
      const room = h.room[tb.y * size + tb.x];
      for (const t of this.st.things)
        if (t.kind === 'krzeslo' && h.room[t.y * size + t.x] === room) seats.push(t.y * size + t.x);
      for (let y = tb.y - 1; y <= tb.y + tb.h; y++)
        for (let x = tb.x - 1; x <= tb.x + tb.w; x++) {
          const i = y * size + x;
          if (covers(tb, x, y) || h.room[i] !== room || this.coreBlocked[i] || this.furnitureAt(x, y)) continue;
          seats.push(i);
        }
    } else seats.push(fi);
    const seat = this.nearest(
      p,
      seats.filter((i) => !taken.includes(i)),
    );
    if (seat < 0 || !this.go(p, seat)) return false;
    const j = this.newJob('eat', table ? table.id : -1, seat, false);
    j.from = food.id;
    this.setJob(p, j, false);
    return true;
  }

  /** dokładanie do kozy: z własnego drewna albo ze stosu (sam bierze tylko ze składu i dopiero, gdy ogień się
      kończy; z polecenia z każdego stosu, kiedy tylko coś wejdzie) */
  private startRefuel(p: Pawn, order: boolean, koza = this.koza()): boolean {
    if (!koza) return false;
    if (!order && ((koza.by >= 0 && koza.by !== p.id) || koza.fuel >= BURN_TICKS)) return false;
    if (this.kozaRoom(koza) < 1) return false;
    const size = this.w.size;
    if (p.carry > 0) {
      const stand = this.kozaStand(p, koza);
      if (stand < 0 || !this.go(p, stand)) return false;
      this.setJob(p, this.newJob('refuel', koza.id, stand, order, 1), true);
      koza.by = p.id;
      return true;
    }
    const pile = this.pileFor(p, order ? 'any' : 'sklad');
    if (!pile) return false;
    const pt = pile.y * size + pile.x;
    if (!this.go(p, pt)) return false;
    const j = this.newJob('refuel', koza.id, pt, order);
    j.from = pile.id;
    this.setJob(p, j, true);
    koza.by = p.id;
    pile.by = p.id;
    return true;
  }

  private startHaul(p: Pawn): boolean {
    const size = this.w.size;
    const dest = this.dropTile(p);
    if (dest < 0) return false;
    if (p.carry > 0) {
      if (!this.go(p, dest)) return false;
      this.setJob(p, this.newJob('haul', -1, dest, false, 1), true);
      return true;
    }
    const pile = this.pileFor(p, 'outside');
    if (!pile) return false;
    const pt = pile.y * size + pile.x;
    if (!this.go(p, pt)) return false;
    this.setJob(p, this.newJob('haul', pile.id, pt, false), true);
    pile.by = p.id;
    return true;
  }

  private startWarm(p: Pawn): boolean {
    const koza = this.koza();
    if (!koza || koza.fuel <= 0) return false;
    const spot = this.warmSpot(p, koza);
    if (spot < 0 || !this.go(p, spot)) return false;
    this.setJob(p, this.newJob('warm', koza.id, spot, false), false);
    return true;
  }

  /** Czuwający przy kozie: gdy ognia zostaje mniej niż na pół godziny, a do kozy coś wejdzie, idzie po drewno (najpierw
      ze składu, potem z każdego stosu) albo od razu dokłada z rąk. Koza jest wtedy jego (by), żeby nikt nie szedł
      z drugim naręczem. */
  private tendKoza(p: Pawn, j: Job): void {
    const koza = this.koza();
    if (!koza || koza.fuel >= BURN_TICKS || this.kozaRoom(koza) < 1 || (koza.by >= 0 && koza.by !== p.id)) return;
    if (p.carry > 0) {
      this.carryToKoza(p, j, koza);
      return;
    }
    const pile = this.pileFor(p, 'any');
    if (!pile) return;
    const pt = pile.y * this.w.size + pile.x;
    if (!this.go(p, pt)) return;
    j.phase = 2;
    j.tile = pt;
    j.from = pile.id;
    pile.by = p.id;
    koza.by = p.id;
  }

  /** z drewnem w rękach do kozy (faza 3); bez drogi z powrotem na posterunek */
  private carryToKoza(p: Pawn, j: Job, koza: Thing): boolean {
    const stand = this.kozaStand(p, koza);
    if (stand < 0 || !this.go(p, stand)) return this.backToPost(p, j);
    j.phase = 3;
    j.tile = stand;
    j.from = -1;
    koza.by = p.id;
    return true;
  }

  /** po przerwie z powrotem na posterunek (rzeczy wolne); bez drogi zostaje tam, gdzie stoi */
  private backToPost(p: Pawn, j: Job): boolean {
    this.release(p);
    j.from = -1;
    const stand = this.guardStand(p, j.target);
    if (stand >= 0 && stand !== this.tileOf(p) && this.go(p, stand)) {
      j.phase = 0;
      j.tile = stand;
    } else {
      j.phase = 1;
      j.tile = this.tileOf(p);
    }
    return true;
  }

  /** Wolna sterta desek albo złomu najbliżej pionka, do której dojdzie. Łata jest z jednego materiału: kind zawęża
      do niego, a bez kind tylko materiał, którego w osiągalnych stertach starczy na całą łatę. */
  private heapFor(p: Pawn, kind = ''): Thing | undefined {
    const size = this.w.size;
    const region = this.regionOf(p);
    const free = (t: Thing) =>
      (t.kind === 'deski' || t.kind === 'zlom') &&
      t.n > 0 &&
      (t.by < 0 || t.by === p.id) &&
      this.reg[t.y * size + t.x] === region;
    const enough = (k: string) =>
      this.st.things.reduce((a, t) => a + (t.kind === k && free(t) ? t.n : 0), 0) >= PATCH_COST;
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (!free(t) || (kind ? t.kind !== kind : !enough(t.kind))) continue;
      const d = this.dist2(p, t.y * size + t.x);
      if (d < bd || (d === bd && best && t.id < best.id)) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** łatanie: po deski albo złom na najbliższą stertę, potem do dziury */
  private startPatch(p: Pawn, hole: Hole): boolean {
    const heap = this.heapFor(p);
    if (!heap) return false;
    const size = this.w.size;
    const ht = heap.y * size + heap.x;
    if (!this.go(p, ht)) return false;
    const j = this.newJob('patch', hole.id, ht, true);
    j.from = heap.id;
    this.setJob(p, j, false);
    heap.by = p.id;
    return true;
  }

  /** kafelek obok miejsca na ognisko */
  private siteStand(p: Pawn, site: number): number {
    const size = this.w.size;
    return this.beside(p, { x: site % size, y: Math.floor(site / size), w: 1, h: 1 } as Thing);
  }

  /** ognisko: z drewnem w rękach od razu na miejsce, inaczej najpierw po drewno na najbliższy stos */
  private startBuild(p: Pawn, site: number): boolean {
    const size = this.w.size;
    if (p.carry >= CAMPFIRE_WOOD) {
      const stand = this.siteStand(p, site);
      if (stand < 0 || !this.go(p, stand)) return false;
      this.setJob(p, this.newJob('build', site, stand, true, 1), true);
      return true;
    }
    const pile = this.pileFor(p, 'any');
    if (!pile) return false;
    const pt = pile.y * size + pile.x;
    if (!this.go(p, pt)) return false;
    const j = this.newJob('build', site, pt, true);
    j.from = pile.id;
    this.setJob(p, j, true);
    pile.by = p.id;
    return true;
  }

  /** wyprawa: idzie bramą za siatkę i tam znika */
  private startLeave(p: Pawn): void {
    if (this.exitTile < 0 || !this.go(p, this.exitTile)) {
      // bez drogi za bramę (świat bez siatki): znika od razu tam, gdzie stoi
      this.setJob(p, this.newJob('leave', -1, this.tileOf(p), true, 1), false);
      p.away = true;
      p.path = [];
      p.pi = 0;
      return;
    }
    this.setJob(p, this.newJob('leave', -1, this.exitTile, true), false);
  }

  /** powrót z wyprawy: pojawia się za bramą i idzie pod drzwi siedziby; w drodze tam po prostu zawraca */
  private comeBack(p: Pawn): void {
    p.away = false;
    const size = this.w.size;
    if (p.job?.t === 'leave' && p.job.phase === 1 && this.exitTile >= 0) {
      p.x = (this.exitTile % size) + 0.5;
      p.y = Math.floor(this.exitTile / size) + 0.5;
    }
    p.job = null;
    p.path = [];
    p.pi = 0;
    p.wait = this.st.tick;
    if (this.door >= 0 && this.go(p, this.door)) this.setJob(p, this.newJob('go', this.door, this.door, false), false);
  }

  /** deski albo złom z rąk zostają na stercie obok (przerwane łatanie) */
  private dropLoad(p: Pawn): void {
    const j = p.job;
    if (!j || j.n <= 0 || !j.what) return;
    const size = this.w.size;
    const at = nearestFree(this.coreBlocked, size, this.tileOf(p));
    for (const [dx, dy] of SPREAD) {
      const x = (at % size) + dx;
      const y = Math.floor(at / size) + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[at]) continue;
      const same = this.st.things.find((t) => t.kind === j.what && t.x === x && t.y === y);
      if (same) same.n += j.n;
      else if (!this.thingAt(x, y)) {
        const t = newThing(this.st, j.what, x, y);
        t.n = j.n;
        this.st.things.push(t);
      } else continue;
      break;
    }
    j.n = 0;
  }

  /* ---------- szabrownicy ---------- */

  /** napad: pojawienie się za siatką, rozstrzygnięcie (bez zarządu albo gdy zarząd milczy), płoszenie, koniec */
  private raidTick(r: Raid): void {
    const st = this.st;
    const tick = st.tick;
    if (r.phase === 0 && (tick >= r.at - SNEAK_TICKS || r.outcome)) this.spawnRaid(r);
    if (r.phase === 1) {
      if (!r.outcome && tick >= r.at + (r.gov ? GOV_WAIT : 0)) this.decideRaid(r);
      if (r.outcome) this.onOutcome(r);
    } else if (r.phase === 2) {
      const left = st.pawns.filter((p) => p.kind === 'szabrownik');
      if (!left.length) this.finishRaid(r);
      // bez zarządu światło płoszy ich także w środku: uciekają z tym, co mają w workach
      else if (!r.gov && tick % THINK_EVERY === 0)
        for (const p of left) if (p.job?.phase === 2 && this.litNear(p.x, p.y)) this.leaveRaid(p, r);
    }
  }

  /** lampa warty albo palące się ognisko w zasięgu */
  private litNear(x: number, y: number): boolean {
    for (const q of this.st.pawns)
      if (!q.away && q.job?.t === 'guard' && q.job.phase === 1 && Math.hypot(q.x - x, q.y - y) <= LAMP_REACH)
        return true;
    return this.st.things.some(
      (t) => t.kind === 'ognisko' && t.fuel > 0 && Math.hypot(t.x + 0.5 - x, t.y + 0.5 - y) <= CAMPFIRE_LIGHT,
    );
  }

  /** gdzie uderzają: otwarta dziura z planu, a gdy załatana, brama; bez bramy największa otwarta dziura */
  private raidTarget(r: Raid): { post: number; tiles: number[] } | null {
    const gate = gateTiles(this.w);
    const id = /^d(\d+)$/.exec(r.post)?.[1];
    const hole = id ? this.holeById(Number(id)) : undefined;
    if (hole && !hole.patch) return { post: hole.id, tiles: hole.tiles };
    if (gate.length) return { post: 0, tiles: gate };
    const open = (this.st.fence?.holes ?? []).filter((h) => !h.patch).sort((a, b) => b.size - a.size || a.id - b.id);
    return open.length ? { post: open[0].id, tiles: open[0].tiles } : null;
  }

  private inRoom(i: number): boolean {
    return !!this.house && this.house.room[i] >= 0;
  }

  /** kafelki tuż za siatką przy danych kafelkach (od strony ulicy), przechodnie dla obcych */
  private outsideOf(tiles: readonly number[]): number[] {
    const size = this.w.size;
    const yard = new Set(fenceShape(this.w)?.yard ?? []);
    const { blocked } = this.lay.outside;
    const out: number[] = [];
    for (const t of tiles)
      for (const d of [-size, size, -1, 1]) {
        const o = t + d;
        if (o < 0 || o >= size * size || ((d === 1 || d === -1) && Math.floor(o / size) !== Math.floor(t / size)))
          continue;
        if (yard.has(o) || tiles.includes(o) || blocked[o] || this.inRoom(o) || out.includes(o)) continue;
        out.push(o);
      }
    return out;
  }

  /** skąd przychodzą: losowy kafelek RAID_FROM kroków od siatki po stronie ulicy (albo najdalszy, jaki jest) */
  private farFrom(spot: number): number {
    const size = this.w.size;
    const { blocked } = this.lay.outside;
    const dist = new Map<number, number>([[spot, 0]]);
    const q = [spot];
    const ring: number[] = [];
    let last = spot;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const d = dist.get(c)!;
      if (d === RAID_FROM) {
        ring.push(c);
        continue;
      }
      last = c;
      const x = c % size;
      for (const n of [c - size, c + size, x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1]) {
        if (n < 0 || n >= size * size || dist.has(n) || blocked[n]) continue;
        dist.set(n, d + 1);
        q.push(n);
      }
    }
    return ring.length ? ring[Math.floor(nextRandom(this.st.rng) * ring.length)] : last;
  }

  /** n wolnych kafelków po stronie ulicy wokół środka, w tym samym obszarze dla obcych */
  private tilesAround(center: number, n: number): number[] {
    const size = this.w.size;
    const { blocked, reg } = this.lay.outside;
    const out: number[] = [];
    for (const [dx, dy] of SPREAD) {
      if (out.length >= n) break;
      const x = (center % size) + dx;
      const y = Math.floor(center / size) + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (blocked[i] || reg[i] !== reg[center]) continue;
      out.push(i);
    }
    return out;
  }

  /** pół godziny przed napadem 1–3 obcych pojawia się daleko za siatką i podchodzi pod nią po ciemku */
  private spawnRaid(r: Raid): void {
    const st = this.st;
    const tg = this.raidTarget(r);
    const outs = tg ? this.outsideOf(tg.tiles) : [];
    if (!tg || !outs.length) {
      // nie ma skąd podejść (świat bez siatki): nic z tego
      r.phase = 3;
      if (!r.outcome) r.outcome = 'odparty';
      return;
    }
    r.spot = outs[0];
    r.from = this.farFrom(r.spot);
    r.n = 1 + Math.floor(nextRandom(st.rng) * 3);
    const waits = this.tilesAround(r.spot, r.n);
    const starts = this.tilesAround(r.from, r.n);
    for (let k = 0; k < r.n; k++) {
      const look = 16 + Math.floor(nextRandom(st.rng) * 4);
      const p = newPawn(st, this.w, 'szabrownik', -1, starts[k] ?? r.from, r.from, look);
      p.job = this.newJob('raid', tg.post, waits[k] ?? r.spot, false);
      st.pawns.push(p);
      this.go(p, p.job.tile);
    }
    r.phase = 1;
  }

  /** Bez zarządu: warta z lampą albo ognisko przy miejscu, pod którym czekają, albo brama na kłódkę ich płoszy;
      inaczej wchodzą i każdy wynosi pełny worek. Z zarządem, który nie odpowiedział w porę: odchodzą sami bez łupu
      (gdyby zarząd potem policzył straty, applyGov zdejmie je ze stanu raz, bez szabrowników). */
  private decideRaid(r: Raid): void {
    if (r.gov) {
      r.outcome = 'odparty';
      return;
    }
    const size = this.w.size;
    const sx = (r.spot % size) + 0.5;
    const sy = Math.floor(r.spot / size) + 0.5;
    const locked = this.raidTarget(r)?.post === 0 && !this.st.fence?.gateOpen;
    const scared =
      locked || this.litNear(sx, sy) || this.st.pawns.some((p) => p.kind === 'szabrownik' && this.litNear(p.x, p.y));
    r.outcome = scared ? 'odparty' : 'wtargnięcie';
    if (!scared) {
      const cap = r.n * LOOT_CARRY;
      r.loot = { wood: cap, supplies: cap, scrap: 0 };
    }
  }

  /** ile jeden szabrownik uniesie: bez zarządu worek, z zarządem tyle, żeby wynieśli, co policzył zarząd */
  private sack(r: Raid): number {
    if (!r.gov) return LOOT_CARRY;
    return Math.max(LOOT_CARRY, Math.ceil((r.loot.wood + r.loot.supplies + r.loot.scrap) / Math.max(1, r.n)));
  }

  /** rozstrzygnięte: wchodzą po łup albo uciekają; strach u mieszkańców (i u zarządu, gdy nie liczy go zarząd) */
  private onOutcome(r: Raid): void {
    const st = this.st;
    r.phase = 2;
    const entered = r.outcome === 'wtargnięcie';
    for (const p of st.pawns) {
      if (p.kind !== 'szabrownik' || !p.job) continue;
      if (!entered || !this.nextLoot(p, r)) this.leaveRaid(p, r);
    }
    const tg = this.raidTarget(r);
    for (const p of st.pawns) {
      if (!p.needs || p.away || (p.kind === 'core' && r.gov)) continue;
      const n = p.needs;
      n.safe = Math.max(
        0,
        Math.min(100, n.safe + (entered ? (p.kind === 'core' ? -25 : -20) : p.kind === 'core' ? 8 : 4)),
      );
      if (entered) this.addMood(p, 'Szabrownicy weszli na podwórko', -8, 12 * TICKS_PER_HOUR);
      else if (p.job?.t === 'guard' && p.job.target === tg?.post)
        this.addMood(p, 'Przegoniliśmy szabrowników', 6, 12 * TICKS_PER_HOUR);
    }
  }

  /** najbliższy łup w kolejności: drewno luzem, drewno w składzie, jedzenie, złom (tylko to, co jeszcze mają wziąć) */
  private lootFor(p: Pawn, r: Raid): Thing | undefined {
    const size = this.w.size;
    const sklad = this.house?.sklad ?? [];
    const { blocked, reg } = this.lay.szabrownik;
    const region = reg[nearestFree(blocked, size, this.tileOf(p))];
    const left = (k: keyof Loot) => r.loot[k] - r.took[k] > 0;
    const tiers: ((t: Thing) => boolean)[] = [
      (t) => t.kind === 'drewno' && !sklad.includes(t.y * size + t.x) && left('wood'),
      (t) => t.kind === 'drewno' && sklad.includes(t.y * size + t.x) && left('wood'),
      (t) => t.kind === 'jedzenie' && left('supplies'),
      (t) => t.kind === 'zlom' && left('scrap'),
    ];
    for (const ok of tiers) {
      let best: Thing | undefined;
      let bd = Number.POSITIVE_INFINITY;
      for (const t of this.st.things) {
        if (t.n <= 0 || (t.by >= 0 && t.by !== p.id) || !ok(t)) continue;
        const i = t.y * size + t.x;
        if (reg[i] !== region) continue;
        const d = this.dist2(p, i);
        if (d < bd || (d === bd && best && t.id < best.id)) {
          bd = d;
          best = t;
        }
      }
      if (best) return best;
    }
    return undefined;
  }

  /** do następnego łupu, póki worek nie pełny; false: nie ma po co albo nie ma jak */
  private nextLoot(p: Pawn, r: Raid): boolean {
    const j = p.job!;
    if (j.n >= this.sack(r)) return false;
    const t = this.lootFor(p, r);
    if (!t) return false;
    const ti = t.y * this.w.size + t.x;
    // po łup chodzi się już przez siatkę (warstwa obcych, nie sama ulica)
    j.phase = 2;
    if (!this.go(p, ti)) return false;
    j.target = t.id;
    j.tile = ti;
    t.by = p.id;
    return true;
  }

  /** przy łupie: do worka, ile się zmieści i ile jeszcze mają wziąć; potem następny łup albo w nogi */
  private takeLoot(p: Pawn, r: Raid): void {
    const st = this.st;
    const j = p.job!;
    const t = this.thing(j.target);
    if (t && t.by === p.id && this.tileOf(p) === j.tile) {
      const k: keyof Loot = t.kind === 'drewno' ? 'wood' : t.kind === 'jedzenie' ? 'supplies' : 'scrap';
      const take = Math.max(0, Math.min(t.n, this.sack(r) - j.n, r.loot[k] - r.took[k]));
      t.n -= take;
      t.by = -1;
      if (t.n <= 0) st.things.splice(st.things.indexOf(t), 1);
      j.n += take;
      r.took[k] += take;
      if (!j.what) j.what = t.kind;
    } else if (t?.by === p.id) t.by = -1;
    if (!this.nextLoot(p, r)) this.leaveRaid(p, r);
  }

  /** w nogi: tam, skąd przyszli (z łupem w workach) */
  private leaveRaid(p: Pawn, r: Raid): void {
    const j = p.job!;
    const t = this.thing(j.target);
    if (j.phase === 2 && t?.by === p.id) t.by = -1;
    j.phase = 3;
    j.target = -1;
    const g = this.goalFor(p, r.from);
    if (g >= 0 && this.routeTo(p, g)) j.tile = g;
    else j.phase = 4;
  }

  /** szabrownik bez drogi: doszedł pod siatkę i czeka, przy łupie bierze, u siebie znika; true: zniknął */
  private strangerTick(p: Pawn): boolean {
    const r = this.st.raid;
    const j = p.job;
    if (!r || !j) {
      p.job = this.newJob('raid', -1, this.tileOf(p), false, 4);
      return true;
    }
    if (j.phase === 0) {
      j.phase = 1;
      if (r.spot >= 0) this.face(p, (r.spot % this.w.size) + 0.5, Math.floor(r.spot / this.w.size) + 0.5);
      return false;
    }
    if (j.phase === 2) {
      this.takeLoot(p, r);
      return p.job?.phase === 4;
    }
    if (j.phase === 3) j.phase = 4;
    return j.phase === 4;
  }

  /** koniec napadu; z zarządem: czego nie zdążyli wynieść, i tak zniknęło (zarząd już to policzył) */
  private finishRaid(r: Raid): void {
    r.phase = 3;
    if (!r.gov || r.outcome !== 'wtargnięcie') return;
    for (const k of ['wood', 'supplies', 'scrap'] as const) {
      const left = r.loot[k] - r.took[k];
      if (left > 0) r.took[k] += takeStock(this.st, this.w, k, left);
    }
  }

  /* ---------- co krok ciepła: ogień, ciepło, potrzeby, samouczek ---------- */

  private slow(): void {
    if (!this.house) return;
    const st = this.st;
    const tout = this.outdoor();
    // pali się to, co paliło się na początku kroku
    const fires = this.fires();
    for (const t of st.things)
      if ((t.kind === 'koza' || t.kind === 'ognisko') && t.fuel > 0) t.fuel = Math.max(0, t.fuel - HEAT_EVERY);
    this.boost = heatStep(st.temps, this.kinds, this.links, fires, tout);
    this.light = roomLight(this.kinds.length, this.links, fires);
    const hours = HEAT_EVERY / TICKS_PER_HOUR;
    const night = this.nightAround();
    for (const p of st.pawns) {
      if (!p.needs || p.away) continue;
      // chwilowe nastroje wygasają, reszta dodaje się do nastroju z potrzeb
      if (p.moods.length) p.moods = p.moods.filter((m) => m.until > st.tick);
      const bonus = p.moods.reduce((a, m) => a + m.d, 0);
      if (p.kind === 'resident') stepSafe(p.needs, this.needCtx(p, tout, night), hours, bonus);
      else stepNeeds(p.needs, this.needCtx(p, tout, night), hours, bonus);
    }
    this.tutCheck();
  }

  /** pomieszczenia z palącą się kozą */
  private fires(): number[] {
    const h = this.house!;
    const out: number[] = [];
    for (const t of this.st.things)
      if (t.kind === 'koza' && t.fuel > 0) {
        const r = h.room[t.y * this.w.size + t.x];
        if (r >= 0) out.push(r);
      }
    return out;
  }

  /** co nocą straszy i co uspokaja, liczone raz na krok potrzeb: warta z lampą, ogniska, otwarte dziury, obcy */
  private nightAround(): Around {
    const st = this.st;
    const h = hourOf(st.tick);
    const on = h >= 20 || h < GUARD_UNTIL;
    const lamps: [number, number][] = [];
    for (const q of st.pawns) if (!q.away && q.job?.t === 'guard' && q.job.phase === 1) lamps.push([q.x, q.y]);
    const fires = st.things.filter((t) => t.kind === 'ognisko' && t.fuel > 0);
    const holes = st.fence ? st.fence.holes.filter((x) => !x.patch).length : 0;
    const strangers = st.pawns.filter((q) => q.kind === 'szabrownik' && !q.away);
    // po wtargnięciu strach zostaje do rana (12 godzin)
    const r = st.raid;
    const raided = !!r && r.outcome === 'wtargnięcie' && st.tick < r.at + 12 * TICKS_PER_HOUR;
    return { guard: on && lamps.length > 0, holes: on ? holes : 0, lamps, fires, strangers, raided };
  }

  private needCtx(p: Pawn, tout: number, a: Around = this.nightAround()): NeedCtx {
    const h = this.house!;
    const size = this.w.size;
    const r = this.roomOf[this.tileOf(p)];
    const inside = r >= 0;
    let fire = false;
    for (const t of this.st.things) {
      if (t.fuel <= 0 || (t.kind !== 'koza' && t.kind !== 'ognisko')) continue;
      const near = Math.hypot(p.x - (t.x + t.w / 2), p.y - (t.y + t.h / 2)) <= FIRE_REACH + 0.5;
      // koza grzeje w swoim pomieszczeniu, ognisko na dworze
      if (near && (t.kind === 'koza' ? h.room[t.y * size + t.x] === r : !inside)) fire = true;
    }
    const lit =
      a.lamps.some(([x, y]) => Math.hypot(p.x - x, p.y - y) <= LAMP_REACH) ||
      a.fires.some((t) => Math.hypot(p.x - (t.x + 0.5), p.y - (t.y + 0.5)) <= CAMPFIRE_LIGHT);
    const j = p.job;
    const asleep = !!j && j.t === 'sleep' && j.phase === 1;
    // ciemno: noc, a w pomieszczeniu nie świeci koza ani przez drzwi, na dworze ognisko ani lampa warty
    const dark = daylight(this.st.tick) < 0.5 && !(inside && (this.light[r] ?? 0) >= 0.5) && !fire && !lit;
    let company = 0;
    for (const q of this.st.pawns)
      if (q !== p && !q.away && q.kind !== 'szabrownik' && Math.hypot(q.x - p.x, q.y - p.y) <= 4) company++;
    // obcych widać z dworu z daleka, z wnętrza tylko bliżej (przez okno); śpiący ich nie widzi
    let strangers = 0;
    if (!asleep) for (const q of a.strangers) if (Math.hypot(q.x - p.x, q.y - p.y) <= (inside ? 8 : 16)) strangers++;
    return {
      temp: inside ? this.st.temps[r] : tout,
      fire,
      asleep,
      busy: (!!j && ((j.t === 'chop' && j.phase === 1) || (j.t === 'patch' && j.phase === 2))) || p.carry > 0,
      dark,
      inside,
      company,
      guard: a.guard,
      holes: a.holes,
      strangers,
      raided: a.raided,
    };
  }

  /** zdarzenie samouczka z polecenia (zaznaczenie, rozkaz ścięcia suchego drzewa) */
  private tutEvent(s: TutStep): void {
    tutAdvance(this.st.tut, this.st.tick, (q) => q === 'zaznacz' || q === s);
  }

  private tutCheck(): void {
    const st = this.st;
    const tut = st.tut;
    if (tut.step < 0 || tut.step >= TUT_STEPS.length) return;
    const h = this.house!;
    const size = this.w.size;
    const koza = this.koza();
    const lit = !!koza && koza.fuel > 0;
    const kr = koza ? h.room[koza.y * size + koza.x] : -1;
    tutAdvance(tut, st.tick, (s) => {
      if (s === 'sciete') return st.felled.includes(this.dry);
      // drewno w składzie albo już w drodze do niego (albo prosto do kozy): krok nie czeka na koniec marszu
      if (s === 'sklad')
        return (
          lit ||
          st.things.some((t) => t.kind === 'drewno' && h.sklad.includes(t.y * size + t.x)) ||
          st.pawns.some((p) => p.kind === 'core' && p.carry > 0 && (p.job?.t === 'haul' || p.job?.t === 'refuel'))
        );
      if (s === 'koza') return lit;
      if (s === 'cieplo') return kr >= 0 && st.temps[kr] >= WARM_ENOUGH;
      return false;
    });
  }

  hash(): string {
    return hashString(JSON.stringify(this.st));
  }
}
