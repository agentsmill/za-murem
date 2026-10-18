/* Symulacja (M1): pionki rdzenia z poleceniami i własną pracą, tłum z prostym planem, rzeczy (meble, drewno,
   koza, jedzenie, pnie), ciepło w pomieszczeniach, potrzeby i samouczek. Stały krok, ziarno i kolejka poleceń
   w stanie. Stan to zwykły obiekt (JSON), rysowanie tylko go czyta. Ten sam świat, ziarno i polecenia dają ten sam
   stan. Bez wnętrza siedziby (świat sprzed M1) zarząd stoi, a rzeczy, ciepła i samouczka nie ma. Z opcją
   `mieszkancy` (krok 5, src/sim/lokatorzy.ts) zarząd i mieszkańcy siedziby mają osoby z generatora mieszkańców;
   bez niej stan jest taki jak przed tą opcją. */

import { PROFS } from '../content/data.ts';
import { bledyOsoby, druzynaDoGry, type OsobaDruzyny, osobaDoGry } from '../content/druzyna.ts';
import { makePerson, type Person } from '../content/people.ts';
import { hashString, mulberry, nextRandom, pick, type RngState, rngOf } from '../core/rng.ts';
import type { Tree, World } from '../world/world.ts';
import type { Wreck } from '../world/wrecks.ts';
import {
  type AmmoKey,
  hitChance,
  isFirearm,
  noAmmo,
  START_KIT,
  WEAPONS,
  type Weapon,
  type WeaponId,
  weaponOf,
} from './bron.ts';
import { BUILDS, type BuildKind, type BuildPlan, canPlace, footprint, GHOST_KINDS, type Mat } from './budowle.ts';
import {
  daylight,
  dayOf,
  hourOf,
  minutesAt,
  outdoorTemp,
  START_MINUTES,
  seasonOf,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_SECOND,
} from './clock.ts';
import {
  firstVisit,
  HAGGLE_TICKS,
  NAPISY as HANDEL,
  LEAVE_HOUR,
  nextVisit,
  type Obcy,
  ROB_MOOD,
  ROB_MOOD_OTHERS,
  rollOffers,
  TRADER_HP,
  tickAt,
  WAIT_TICKS,
} from './handlarz.ts';
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
import type { OsobaGry } from './lokatorzy.ts';
import {
  type AptGame,
  aptsFrom,
  type DamageGame,
  DISMANTLE,
  damageFrom,
  dismantleTicks,
  MATS,
  REPAIR,
  RUBBISH,
  searchable,
  searchLoot,
  searchTicks,
  yieldOf,
} from './mieszkania.ts';
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
import {
  CARRY_MATS,
  CARRY_REACH,
  type Product,
  RECIPES,
  WRECK_SEARCH_NOISE,
  WRECK_SEARCH_TICKS,
  WRECK_STRIP,
  WRECK_STRIP_NOISE,
  WRECK_STRIP_TICKS,
  type WreckMark,
  wreckAt,
  wreckLoot,
  wreckRng,
  wreckStage,
  wreckTile,
} from './surowce.ts';
import { type GameMode, modeOf } from './tryb.ts';
import { TUT_STEPS, type Tutorial, type TutStep, tutAdvance, WARM_ENOUGH } from './tutorial.ts';
import {
  ambientCount,
  BITE_CD,
  BITE_DMG,
  BITE_HIT,
  BITE_HIT_FIGHTING,
  BITE_REACH,
  CHASE_SPEED,
  DAY_PULL,
  DISPERSE,
  distField,
  FAR,
  HORDE_FROM,
  HORDE_HOURS,
  hordeSize,
  MAX_ZOMBIES,
  NEAR,
  PUSH,
  RING_FROM,
  RING_TO,
  SIGHT_DAY,
  SIGHT_NIGHT,
  ZOMBIE_HP,
  ZOMBIE_SPEED,
} from './zombie.ts';

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
/** porcje jedzenia w kuchni na start: dwa posiłki dziennie dla czterech osób na pięć dni */
export const FOOD_START = 40;
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
/** do tylu sił zarząd śpi (rano i odsypiając za dnia) */
export const REST_UNTIL = 60;
/** przyjęci ruszają spod bramy co tyle ticków (1,5 s przy 1×) */
export const ARRIVE_GAP = 30;
/** sen na podłodze: nastrój rano (punkty), siły mieszkańca po nocy w łóżku */
export const FLOOR_MOOD = -5;
export const RESIDENT_REST = 70;
/** prace fali 1 M2 (przerywa je pilna potrzeba, a te bez polecenia także noc) */
const M2_JOBS = new Set<JobKind>([
  'search',
  'dismantle',
  'repair',
  'build',
  'claim',
  'wreck',
  'carry',
  'saw',
  'trade',
  'rob',
]);
/** kurs po materiał: po drodze zbiera kolejne sterty tego samego najwyżej tyle kafelków dalej */
export const GATHER_NEAR = 8;
/** kuchnia społeczna: porcja z niej to 85% zwykłej (nic się nie marnuje) */
export const SOCIAL_KITCHEN = 0.85;
/** ogródek: plon co trzy doby, według pory roku (jesień, zima, wiosna, lato) */
export const GARDEN_TICKS = 3 * TICKS_PER_DAY;
export const GARDEN_YIELD: readonly number[] = [2, 0, 4, 6];
/** wytrzymałość zasieków (siatka 45–75, świeża łata 70) */
export const ZASIEKI_HP = 100;
/** zajęcie mieszkania (oznaczenie drzwi i spis) trwa kwadrans gry */
export const CLAIM_TICKS = TICKS_PER_HOUR / 4;
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
/** handlarz przychodzi z daleka, mniej więcej tyle kroków ulicą od bramy */
const TRADER_FROM = 70;
/** bezczynny rdzeń rozgląda się za pracą co sekundę realną */
const THINK_EVERY = TICKS_PER_SECOND;
/** po poleceniu „idź tu” czeka na miejscu godzinę gry, chyba że coś pilnego */
const STAY_AFTER_ORDER = TICKS_PER_HOUR;
/** grzeje się najwyżej godzinę gry naraz, potem rozgląda się od nowa (może jest głodny) */
const WARM_MAX = TICKS_PER_HOUR;
/** z tej odległości od kozy (m) człowiek się przy niej grzeje */
const FIRE_REACH = 2.5;
/** życie szabrownika; poniżej FLEE_HP ucieka (wolniej, bo ranny) */
export const STRANGER_HP = 70;
export const FLEE_HP = 35;
/** hałas słychać przez 2 sekundy gry, efekty walki (dla rysowania) też tyle trwają */
export const NOISE_TICKS = 2 * TICKS_PER_SECOND;
export const FX_TICKS = 2 * TICKS_PER_SECOND;
/** martwy szwendacz leży dobę, plama krwi 6 godzin, zwłoki człowieka (które nie wstaną) dwie doby */
export const CORPSE_TICKS = TICKS_PER_DAY;
export const BLOOD_TICKS = 6 * TICKS_PER_HOUR;
export const BODY_TICKS = 2 * TICKS_PER_DAY;
const BLOOD_MAX = 40;
/** zarząd broni się sam przed wrogiem do 6 m, mieszkańcy uciekają przed wrogiem do 8 m */
export const DEFEND_REACH = 6;
export const RESIDENT_FLEE = 8;
/** walka bez ciosu przez 20 sekund gry (nie da się dojść) się kończy */
const FIGHT_GIVEUP = 20 * TICKS_PER_SECOND;
/** ugryzienie zaraża przy trafieniu w 35% przypadków, w 60% z nich w rękę albo nogę (da się amputować) */
export const BITE_INFECT = 0.35;
export const LIMB = 0.6;
/** zakażony umiera po 18 godzinach gry, a w trybie zombie każdy zmarły wstaje po godzinie */
export const FEVER_TICKS = 18 * TICKS_PER_HOUR;
export const RISE_TICKS = TICKS_PER_HOUR;
/** amputacja: najwyżej 2 godziny gry po ugryzieniu, trwa pół godziny */
export const AMPUTATE_WINDOW = 2 * TICKS_PER_HOUR;
export const AMPUTATE_TICKS = TICKS_PER_HOUR / 2;
/** dzida z 2 desek i 1 złomu, godzina pracy; wzmocnienie siatki: 2 deski albo 2 złomu, 20 minut, +50 */
export const SPEAR_BOARDS = 2;
export const SPEAR_SCRAP = 1;
export const CRAFT_TICKS = TICKS_PER_HOUR;
export const BRACE_COST = 2;
export const BRACE_TICKS = Math.round(TICKS_PER_HOUR / 3);
export const BRACE_HP = 50;
/** posterunek warty „przy siatce”: tam, gdzie napiera najwięcej szwendaczy (klucz 'siatka') */
export const SIATKA_POST = -2;
/** co tyle kroków warta przy siatce sprawdza, czy napór się nie przesunął */
const SIATKA_EVERY = 10 * TICKS_PER_SECOND;
/** dobicie zwłok (nóż w głowę) trwa sekundę */
const FINISH_TICKS = TICKS_PER_SECOND;
const FEVER_MOOD = 'Gorączka po ugryzieniu';
/** rzeczy, które leżą, ale niczego nie zajmują (można na nich stanąć, nie są meblami) */
const GHOST = GHOST_KINDS;

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
  | 'campfire'
  | 'build'
  | 'search'
  | 'dismantle'
  | 'repair'
  | 'claim'
  | 'arrive'
  | 'leave'
  | 'raid'
  | 'fight'
  | 'zombie'
  | 'finish'
  | 'amputate'
  | 'craft'
  | 'brace'
  | 'wreck'
  | 'carry'
  | 'saw'
  | 'trader'
  | 'trade'
  | 'rob';

/** zajęcia mieszkańców (praca 'stay', target): w domu, na podwórku, przy ognisku */
export const STAY_HOME = 0;
export const STAY_YARD = 1;
export const STAY_FIRE = 2;
/** wspólny posiłek przy stole zarządu (uchwała o kotle) */
export const STAY_MEAL = 3;
/** wspólne posiłki: obiad o 13:00 i kolacja o 19:00; gotuje się godzinę wcześniej, raz dla wszystkich */
export const MEAL_HOURS: readonly number[] = [13, 19];
/** Porcja wielkości m (ułamek zwykłej porcji). Racje to rzadsza zupa: 3/4 jedzenia syci jak zwykły posiłek, ale głód
    wraca szybciej (hungerRate), więc zapasy schodzą około 17% wolniej, a najedzenie spada szybciej. Kocioł daje
    większą porcję, która syci bardziej (1,1 zwykłego posiłku). */
export const satiety = (m: number): number => Math.max(1, m);
/** jak szybko spada najedzenie przy porcji m: przy racjach (0,75) o 10% szybciej */
export const hungerRate = (m: number): number => (m < 1 ? 1 + 0.4 * (1 - m) : 1);
/** racje: najwyżej tyle posiłków na dobę (od 6:00), ponad to tylko z wielkiego głodu */
export const RATION_MEALS = 2;
/** poniżej takiego najedzenia je się zawsze: poza porą wspólnego posiłku i ponad racje */
export const STARVING = 10;
/** przy racjach je się dopiero przy wyraźnym głodzie */
export const RATION_HUNGRY = 25;

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
  /** co to za sztuki ('deski', 'zlom'; pusty napis: nic); walka: broń, z którą się zaczęła ('piesci': gołymi rękami) */
  what: string;
}

/** zarząd (rdzeń, polecenia), tłum (tylko do pomiaru wydajności, za siatką), mieszkańcy siedziby
    (tło z planem dnia), szabrownicy (obcy z napadu; nazwa jak w liście obcych rysowania, src/render/game.ts) */
export type PawnKind = 'core' | 'crowd' | 'resident' | 'szabrownik' | 'zombie' | 'handlarz';

/** wróg: szabrownik albo szwendacz (do ataku z menu i obrony) */
export const isEnemy = (p: Pick<Pawn, 'kind'>): boolean => p.kind === 'szabrownik' || p.kind === 'zombie';

export interface Pawn {
  id: number;
  kind: PawnKind;
  /** osoba (indeks w state.people): zarząd zawsze, mieszkaniec siedziby tylko z opcją mieszkancy w createSim (osoba
      z generatora mieszkańców), reszta −1. To, że ktoś jest z zarządu, mówi kind === 'core', nie osoba. */
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
  /** posiłki od 6:00 (racje) i tick ostatniego posiłku (wspólny posiłek raz na porę) */
  ate: number;
  lastMeal: number;
  /** broń w rękach (zarząd); brak albo null: gołe ręce */
  weapon?: WeaponId | null;
  /** życie pionków bez potrzeb (szabrownicy, szwendacze); ludzie z potrzebami mają zdrowie */
  hp?: number;
  /** tick, od którego może znowu uderzyć albo strzelić */
  cd?: number;
  /** zakażony od tego ticku (ugryzienie); limb: w rękę albo nogę; maimed: po amputacji (kikut) */
  bite?: number;
  limb?: boolean;
  maimed?: boolean;
  /** szabrownik: łup w worku według rodzaju (zabity zostawia go na podwórku) */
  sack?: Partial<Loot>;
  /** zarząd odsypia za dnia (po nocnej warcie albo po pobudce na posiłek): głodny najpierw je, potem śpi, dopóki
      siły poniżej REST_UNTIL */
  nap?: boolean;
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
  /** tick, o którym rzecz znika (krew, trupy, zwłoki); brak: zostaje */
  until?: number;
  /** zepsuty mebel ze świata (w pustym mieszkaniu): z rozbiórki połowa materiału */
  broken?: boolean;
  /** zasieki: łata dziury albo wytrzymałość kafelka siatki sprzed nich (wraca przy rozbiórce) */
  prev?: number;
  /** zwłoki: numer wpisu w state.dead (osobno od owner, bo numery pionków i wpisów się pokrywają) */
  dead?: number;
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
  | { t: 'mend'; ids: number[]; n: number }
  /** broń z magazynu do rąk (stara wraca do magazynu); null: odłożyć broń */
  | { t: 'arm'; ids: number[]; weapon: WeaponId | null }
  /** atak na wroga (id pionka szabrownika albo szwendacza) */
  | { t: 'attack'; ids: number[]; target: number }
  /** dobić zwłoki (id rzeczy 'zwloki'), żeby nie wstały */
  | { t: 'finish'; ids: number[]; thing: number }
  /** amputacja ugryzionej ręki albo nogi (id pionka chorego) */
  | { t: 'amputate'; ids: number[]; patient: number }
  /** zrobić broń z materiałów ze stert (dzida: 2 deski i 1 złom) */
  | { t: 'craft'; ids: number[]; item: 'dzida' }
  /** wzmocnić kafelek siatki deskami albo złomem */
  | { t: 'brace'; ids: number[]; tile: number }
  /** do broni: cały zdolny zarząd na wartę (przy siatce w trybie zombie, przy bramie w zwykłym); off: odwołanie,
      warta z alarmu schodzi z posterunku */
  | { t: 'alarm'; ids: number[]; off?: boolean }
  /** M2: plan budowy w miejscu (albo przydział do planu, który tam już jest), odwołanie planu albo budowli */
  | { t: 'build'; ids: number[]; kind: BuildKind; x: number; y: number; rot: number }
  | { t: 'unbuild'; ids: number[]; id: number }
  /** M2: przeszukać pomieszczenie, rozebrać rzecz na materiał, naprawić uszkodzenie (indeks w st.damage),
      zająć puste mieszkanie */
  | { t: 'search'; ids: number[]; room: number }
  | { t: 'dismantle'; ids: number[]; thing: number }
  | { t: 'repair'; ids: number[]; damage: number }
  | { t: 'claim'; ids: number[]; apt: number }
  /** surowce: przeszukać albo rozebrać wrak (kafelek pod nim albo obok), zanieść stertę zza siatki na podwórko,
      przerobić w warsztacie drewno na deski albo złom na części (n sztuk po kolei) */
  | { t: 'wreck'; ids: number[]; tile: number; how: 'szukaj' | 'rozbierz' }
  | { t: 'carry'; ids: number[]; thing: number }
  | { t: 'saw'; ids: number[]; what: Product; n: number }
  /** handlarz: włączyć (stary zapis, ids puste), wymienić się (oferta k), napaść na niego */
  | { t: 'obcy'; ids: number[] }
  | { t: 'trade'; ids: number[]; offer: number }
  | { t: 'rob'; ids: number[] };

export interface Noise {
  x: number;
  y: number;
  /** promień w metrach */
  r: number;
  until: number;
}

export interface Fx {
  t: 'cios' | 'strzal' | 'trafienie' | 'ugryzienie' | 'smierc';
  x: number;
  y: number;
  tick: number;
  /** cel ciosu albo strzału */
  tx?: number;
  ty?: number;
}

export interface Dead {
  /** id osoby z zarządu (s1…), pusty napis dla innych (także dla mieszkańca z osobą: dla zarządu to mieszkaniec) */
  id: string;
  /** imię i nazwisko osoby (zarząd, mieszkaniec z osobą), inaczej „Mieszkaniec” albo „Szabrownik” */
  name: string;
  look: number;
  kind: PawnKind;
  tick: number;
  cause: 'rany' | 'gorączka' | 'amputacja';
}

export interface Tally {
  killed: number;
  breaches: number;
  bites: number;
  deaths: number;
}

const zeroTally = (): Tally => ({ killed: 0, breaches: 0, bites: 0, deaths: 0 });

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
  /** ilu ich jest: z planu zarządu (RaidPlan.people), bez niego 1–3 losowane przy pojawieniu się */
  n: number;
  /** siła napadu z planu zarządu (RaidPlan.attack), 0: nieznana */
  attack: number;
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
  /** wielkość porcji (racje 0,75, kocioł 1,1): ile porcji zjada się na posiłek (najedzenie: satiety) */
  foodMult: number;
  /** wspólny kocioł: zarząd i mieszkańcy jedzą razem przy stole zarządu o 13:00 i 19:00 */
  sharedMeals: boolean;
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
  /** zapasy bez rzeczy na mapie (z zarządu): części i leki; broń w magazynie i amunicja (stary zapis: brak) */
  store: { parts: number; meds: number; arms?: WeaponId[]; ammo?: Record<AmmoKey, number> };
  /** tryb gry; brak w starym zapisie: zwykły */
  mode?: GameMode;
  /** hałas z ostatnich 2 sekund (strzały, ciosy): szwendacze idą na niego */
  noise?: Noise[];
  /** efekty walki z ostatnich 2 sekund dla rysowania */
  fx?: Fx[];
  /** zmarli po kolei (ludzie: zarząd, mieszkańcy, szabrownicy) */
  dead?: Dead[];
  /** liczniki: zabici wrogowie, przerwania siatki, ugryzienia, zgony naszych */
  tally?: Tally;
  /** stado tej nocy (tryb zombie): dzień, ilu jeszcze wyjdzie z okolicy i kiedy następna grupa */
  horde?: { day: number; left: number; next: number };
  /** ułamek porcji zjedzony ponad całe porcje (racje i kocioł zjadają po 0,75 i 1,1 porcji na posiłek) */
  portion: number;
  /** mieszkania siedziby w grze (M2): stan ze świata, nasze, przeszukane pomieszczenia */
  apts: AptGame[];
  /** uszkodzenia siedziby (World.damage) z naprawami */
  damage: DamageGame[];
  /** plany budowy w toku; gotowe budowle są w things */
  builds: BuildPlan[];
  /** wraki przeszukane i rozebrane (lewy górny kafelek), rosnąco; brak, dopóki nikt nie przeszukał wraku */
  wraki?: WreckMark[];
  /** handlarz pod bramą (src/sim/handlarz.ts); tylko z opcją obcy albo po poleceniu 'obcy' */
  obcy?: Obcy;
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

/** sterty ze świata (World.props): deski i złom na łaty, gruz na podwórku, śmieci w pustych mieszkaniach */
const HEAPS = new Set(['deski', 'zlom', 'gruz', 'smieci']);
/** rzeczy, które leżą luzem (materiały, zapasy, sterty); reszta to meble i budowle (ognisko też: nie staje się
    na nim) */
const LOOSE = new Set(['drewno', 'jedzenie', 'posilek', 'pien', 'czesci', 'leki', ...HEAPS]);
const BEDS = new Set(['lozko', 'wersalka', 'lozka_pietrowe']);

/** drewno ze ściętego drzewa: 3 sztuki na metr korony, z krzaka mało */
export const woodFrom = (t: Tree): number =>
  t.kind === 2 ? Math.max(1, Math.round(t.r * 1.5)) : Math.max(2, Math.round(t.r * 3));
/** rąbanie trwa od kilkunastu do trzydziestu kilku sekund realnych przy 1× */
export const chopTicks = (t: Tree): number => Math.round(160 + 120 * t.r);

export interface SimOpts {
  /** liczba osób zarządu, domyślnie 4 */
  core?: number;
  /** Własna drużyna zarządu z karty startowej (src/content/druzyna.ts): do 5 osób, jej długość zastępuje core. Losowania
      idą tak jak bez drużyny, a dane osób z drużyny nadpisują dopiero gotowe osoby, więc mieszkańcy, miejsca startowe
      i reszta stanu są te same co bez drużyny przy tej samej liczbie osób. Każdą osobę symulacja sprawdza jeszcze raz
      (bledyOsoby); osoba ze złymi danymi zostaje taka jak z losowania z adresu, a w konsoli jest ostrzeżenie. */
  team?: readonly OsobaDruzyny[];
  /** mieszkańcy siedziby; domyślnie 3–8 według mieszkań połączonych z podwórkiem (z opcją mieszkancy najwyżej tylu,
      ilu osób jest w mieszkancy.lokatorzy) */
  residents?: number;
  /** Zarząd i mieszkańcy siedziby z generatora mieszkańców (lokatorzyGry w src/sim/lokatorzy.ts). Losowania idą tak
      jak bez opcji: dane osób zarzad[k] nadpisują gotowe osoby zarządu po zwykłym losowaniu (k < liczby osób zarządu;
      gdy z generatora jest mniej osób, reszta zostaje z losowania), a własna drużyna (team) nadpisuje je jeszcze raz
      i wygrywa. Każdy pionek mieszkańca z mieszkania a dostaje kolejną osobę z listy tego mieszkania jako nową osobę
      w state.people (bez losowania z ziarna, id z nextId); kogo zabrakło, zostaje bez osoby. Przyjęci później
      (uchwały, wydarzenia) zostają bez osób. */
  mieszkancy?: {
    zarzad: readonly OsobaGry[];
    lokatorzy: readonly { apt: number; osoby: readonly OsobaGry[] }[];
  };
  /** tłum za siatką, tylko do pomiaru wydajności (npm run perf); w grze 0 */
  crowd?: number;
  /** tryb gry, domyślnie zwykły */
  mode?: GameMode;
  /** handlarz pod bramą za dnia (src/sim/handlarz.ts), tylko w zwykłym trybie; gra go włącza, boty i testy bez
      tej opcji grają jak przed nim (losowanie terminu idzie ze st.rng dopiero po całej reszcie startu) */
  obcy?: boolean;
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

const round2 = (v: number) => Math.round(v * 100) / 100;

const covers = (t: Thing, x: number, y: number) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
/** kafelki rzeczy */
const thingTiles = (t: Thing, size: number): number[] => {
  const out: number[] = [];
  for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) out.push(y * size + x);
  return out;
};

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
    fence: initFence(w, opts.mode ?? 'zwykly'),
    cap: 0,
    laws: { gateClosed: false, burnMood: 1, workStart: WORK_START, foodMult: 1, sharedMeals: false },
    portion: 0,
    raid: null,
    store: { parts: 0, meds: 0, arms: [], ammo: noAmmo() },
    mode: opts.mode ?? 'zwykly',
    noise: [],
    fx: [],
    dead: [],
    tally: zeroTally(),
    apts: [],
    damage: [],
    builds: [],
  };
  const team = druzynaDoGry(opts.team);
  const core = team ? team.length : (opts.core ?? 4);
  const kit = START_KIT[modeOf(st)];
  // broń ze startu dostają kolejne osoby zarządu; gdy osób jest mniej niż broni na liście, reszta czeka w magazynie
  st.store.arms = [...kit.store, ...kit.core.slice(core).filter((a): a is WeaponId => a !== null)];
  st.store.ammo = { ...kit.ammo };
  const rnd = rngOf(st.rng);
  const size = w.size;
  const hq = w.buildings[w.hq];
  const door = hq.entrances[0]?.out ?? nearestFree(w.blocked, size, ((hq.y1 + 1) * size + hq.x0) | 0);
  const house = houseOf(w);
  // zarząd zaczyna w kuchni (a gdy się nie zmieści, na klatce)
  let spots: number[] = [];
  if (house) {
    for (const f of house.furniture) {
      const t = newThing(st, f.kind, f.x, f.y, f.w, f.h, f.rot);
      if ((f as { broken?: boolean }).broken) t.broken = true;
      st.things.push(t);
    }
    st.apts = aptsFrom(w, house);
    st.damage = damageFrom(w, house);
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
  // rdzeń: zarząd z fachem w podstawowych dziedzinach, jak na starcie 0.3 (piąta osoba znowu z ciepłem)
  const need = ['cieplo', 'bud', 'med', 'uprawa'] as const;
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
    pawn.weapon = kit.core[k] ?? null;
    st.pawns.push(pawn);
  }
  // zarząd z generatora mieszkańców: dane osób nadpisują osoby z losowania dopiero po nim (losowania te same)
  const zarzad = opts.mieszkancy?.zarzad ?? [];
  for (let k = 0; k < Math.min(core, zarzad.length); k++) Object.assign(st.people[k], polaZGeneratora(zarzad[k]));
  // własna drużyna: dane osób nadpisują osoby z losowania dopiero po nim (te same imiona zajęte, te same losowania)
  team?.forEach((o, k) => {
    const why = bledyOsoby(o);
    if (why.length) {
      const who = (o as { name?: unknown })?.name;
      console.warn(
        `Drużyna: osoba ${k + 1}${typeof who === 'string' ? ` (${who})` : ''} zostaje z losowania z adresu, bo ${why.join('; ')}.`,
      );
      return;
    }
    // drużyna wygrywa z generatorem: bez jego odnośnika, rodziny i historii
    const p = st.people[k];
    delete p.ref;
    delete p.nazwaGen;
    delete p.rodzina;
    delete p.story;
    Object.assign(p, osobaDoGry(o as OsobaDruzyny));
  });
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
    const lok = opts.mieszkancy ? (opts.mieszkancy.lokatorzy ?? []) : null;
    // wzór z M1 (najwyżej 8); z osobami z generatora nie więcej mieszkańców, niż jest osób
    const wzor = apts.length ? Math.min(8, Math.max(3, 2 * apts.length + 1)) : 0;
    addResidents(
      st,
      w,
      opts.residents ??
        (lok
          ? Math.min(
              wzor,
              lok.reduce((a, m) => a + m.osoby.length, 0),
            )
          : wzor),
    );
    if (lok) giveResidents(st, w, lok);
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
  if (opts.obcy && modeOf(st) !== 'zombie') st.obcy = newObcy(st);
  return st;
}

/** handlarz włączony: pierwsza wizyta drugiego dnia */
const newObcy = (st: SimState): Obcy => ({ next: firstVisit(st.rng), offers: [], trader: -1, napad: -1, wizyty: 0 });

/** pola osoby gry z osoby z generatora mieszkańców: kopie (stan nie dzieli tablic z wejściem), rodzina i historia
    tylko niepuste, `nazwaGen` to imię i nazwisko z generatora (tożsamość osoby przy wczytaniu zapisu) */
function polaZGeneratora(
  o: OsobaGry,
): Pick<
  Person,
  'first' | 'name' | 'f' | 'prof' | 'skills' | 'age' | 'traits' | 'story' | 'ref' | 'nazwaGen' | 'rodzina'
> {
  const out: ReturnType<typeof polaZGeneratora> = {
    first: o.first,
    name: o.name,
    f: o.f,
    prof: o.prof,
    skills: { ...o.skills },
    age: o.age,
    traits: [...o.traits],
    ref: o.ref,
    nazwaGen: o.name,
  };
  if (o.rodzina) out.rodzina = o.rodzina;
  if (o.story) out.story = o.story;
  return out;
}

/** Osoby dla mieszkańców siedziby (opcja mieszkancy): pionek z mieszkania a dostaje kolejną osobę z listy tego
    mieszkania, po kolei pionków. Nowe osoby idą na koniec state.people (po zarządzie, którego osoby są pierwsze),
    id z nextId, dom w siedzibie; bez losowania z ziarna symulacji. */
function giveResidents(st: SimState, w: World, lok: readonly { apt: number; osoby: readonly OsobaGry[] }[]): void {
  const taken = new Map<number, number>();
  for (const p of st.pawns) {
    if (p.kind !== 'resident' || p.person >= 0) continue;
    const k = taken.get(p.apt) ?? 0;
    taken.set(p.apt, k + 1);
    const o = lok.find((m) => m.apt === p.apt)?.osoby[k];
    if (!o) continue;
    const { first, name, f, prof, skills, age, traits, ...rest } = polaZGeneratora(o);
    st.people.push({
      id: `s${st.nextId++}`,
      first,
      name,
      f,
      prof,
      skills,
      age,
      traits,
      home: w.hq,
      assign: null,
      sick: false,
      dead: false,
      gone: false,
      ...rest,
    });
    p.person = st.people.length - 1;
  }
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
  if (st.things.some((t) => !GHOST.has(t.kind) && covers(t, x, y)) || onPlan(st, size, at)) return false;
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

/** napad zaplanowany na tick at przy posterunku post ('brama' / 'd<id>'); gov: rozstrzyga zarząd; people i attack
    z planu zarządu (0: nieznane, wtedy 1–3 szabrowników losowanych przy pojawieniu się) */
export function planRaid(st: SimState, at: number, post: string, gov: boolean, people = 0, attack = 0): void {
  const zero = (): Loot => ({ wood: 0, supplies: 0, scrap: 0 });
  const n = Math.max(0, Math.min(5, Math.round(people)));
  st.raid = { at, post, n, attack, phase: 0, outcome: '', gov, loot: zero(), took: zero(), from: -1, spot: -1 };
}

/** Wartownicy (pionki), którzy według zarządu zasnęli: przysypiają tam, gdzie stoją (warta w fazie 4, bez lampy
    i bez dokładania do kozy), aż warta skończy się rano. Zmienia tylko stan pionków, przechodniości nie rusza. */
export function dozeOff(st: SimState, ids: readonly number[]): void {
  for (const p of st.pawns) {
    if (!ids.includes(p.id) || p.job?.t !== 'guard' || p.job.phase === 4) continue;
    for (const t of st.things) if (t.by === p.id) t.by = -1;
    p.path = [];
    p.pi = 0;
    p.job.phase = 4;
    p.job.from = -1;
  }
}

/** Job.what warty z „Do broni!” (odwołanie zdejmuje tylko ją) */
const ALARM_JOB = 'alarm';

/** „Do broni!” trwa: ktoś z zarządu stoi na warcie z alarmu, a zaraz po kliknięciu (polecenie czeka na krok,
    także na pauzie) decyduje ostatni alarm w kolejce. Dla przycisku, który alarm włącza i odwołuje. */
export function alarmOn(st: SimState): boolean {
  for (let k = st.cmds.length - 1; k >= 0; k--) {
    const c = st.cmds[k];
    if (c.t === 'alarm') return !c.off;
  }
  return st.pawns.some((p) => p.kind === 'core' && !p.away && p.job?.t === 'guard' && p.job.what === ALARM_JOB);
}

/** klucz posterunku warty z Job.target, jak w karcie nocy zarządu: 'brama', 'd<id>', 'koza' */
export const postKey = (target: number): string =>
  target === KOZA_POST ? 'koza' : target === SIATKA_POST ? 'siatka' : target === 0 ? 'brama' : `d${target}`;

/** mieszkania inne niż zarządu, do których z podwórka da się dojść bez wychodzenia za siatkę, rosnąco */
function residentApts(st: SimState, w: World, h: HouseLike): number[] {
  const size = w.size;
  const fence = (w as { fence?: World['fence'] }).fence;
  const { resident } = composeLayers(w, [], null, st.fence, homeMask(h, size));
  const reg = labelRegions(resident, size);
  const yardTile = fence?.yard.find((i) => !resident[i]);
  if (yardTile === undefined) return [];
  const apts: number[] = [];
  // tylko mieszkania mieszkańców (ze świata albo zajęte i naprawione); bez stanu mieszkań każde poza zarządem
  const lives = (a: number) => {
    const g = st.apts.find((x) => x.apt === a);
    return !g || g.state === 'mieszkancy' || (g.ours && g.state === 'puste' && repaired(st, a));
  };
  for (let i = 0; i < size * size; i++) {
    const a = aptAt(h, i);
    if (a >= 0 && a !== h.home && !resident[i] && reg[i] === reg[yardTile] && !apts.includes(a) && lives(a))
      apts.push(a);
  }
  return apts.sort((a, b) => a - b);
}

/** Miejsca dla mieszkańców: po trzy na mieszkanie mieszkańców (najwyżej 8, jak w M1), do tego łóżka w zajętych
    i naprawionych pustych mieszkaniach i po dwa w każdych łóżkach piętrowych w naszych mieszkaniach. */
export function capOf(st: SimState, w: World): number {
  const h = houseOf(w);
  if (!h) return st.cap;
  const size = w.size;
  const lives = residentApts(st, w, h).filter((a) => st.apts.find((g) => g.apt === a)?.state !== 'puste');
  let cap = Math.min(8, 3 * lives.length);
  const aptOfThing = (t: Thing) => aptAt(h, t.y * size + t.x);
  for (const g of st.apts) {
    if (!g.ours || g.state !== 'puste' || !repaired(st, g.apt)) continue;
    cap += st.things.filter(
      (t) => BEDS.has(t.kind) && t.kind !== 'lozka_pietrowe' && !t.broken && aptOfThing(t) === g.apt,
    ).length;
  }
  // łóżka piętrowe dla mieszkańców tylko w zajętych i naprawionych (w mieszkaniu zarządu śpi na nich zarząd)
  for (const t of st.things) {
    if (t.kind !== 'lozka_pietrowe') continue;
    const g = st.apts.find((a) => a.apt === aptOfThing(t));
    if (g?.ours && g.state === 'puste' && repaired(st, g.apt)) cap += 2;
  }
  return cap;
}

/** Czy rzecz da się rozebrać na materiał: śmieci i gruz zawsze, meble z tabeli tylko w pustych mieszkaniach (meble
    zarządu można spalić, mieszkańców się nie rusza). W pustym mieszkaniu dopiero po przeszukaniu pomieszczenia:
    najpierw trzeba zajrzeć, co tam jest (przeszukanie to główne źródło materiałów). Dla menu i polecenia. */
export function dismantlable(st: SimState, w: World, t: Thing): boolean {
  const h = houseOf(w);
  const room = h ? h.room[t.y * w.size + t.x] : -1;
  const g = h && room >= 0 ? st.apts.find((a) => a.apt === h.rooms[room].apt) : undefined;
  if (g?.state === 'puste' && !g.searched.includes(room)) return false;
  if (RUBBISH.has(t.kind)) return true;
  return !!DISMANTLE[t.kind] && g?.state === 'puste';
}

/** wszystkie uszkodzenia mieszkania naprawione */
export const repaired = (st: SimState, apt: number): boolean => st.damage.every((d) => d.apt !== apt || d.fixed);

/** Mieszkańcy siedziby (tło) w mieszkaniach połączonych z podwórkiem. Na start po kolei po mieszkaniach, najwyżej do
    st.cap (3–8: po dwóch na mieszkanie i jeden więcej). Przyjęci przez zarząd (arrive, fx.residents) przychodzą zza
    bramy do swojego mieszkania i nie znikają, gdy miejsc brak: mieszkanie z wolnym łóżkiem, a bez niego najmniej
    zatłoczone (śpią na podłodze); bez mieszkań przy podwórku nocują w klatce. Każdy z łóżkiem z mebli swojego
    mieszkania, gdy jest wolne. Zwraca, ilu przybyło. */
export function addResidents(st: SimState, w: World, n: number, arrive = false): number {
  const h = houseOf(w);
  if (!h || n <= 0) return 0;
  const size = w.size;
  const apts = residentApts(st, w, h);
  if (!apts.length && !arrive) return 0;
  const rnd = rngOf(st.rng);
  const { resident } = composeLayers(w, [], null, st.fence, homeMask(h, size));
  const exit = arrive ? exitOf(w) : -1;
  // przyjęci czekają za bramą obok siebie (nie na jednym kafelku) i ruszają po kolei, gęsiego
  const yard = new Set(fenceShape(w)?.yard ?? []);
  const gate = gateTiles(w);
  const wait: number[] = [];
  if (exit >= 0)
    for (const [dx, dy] of SPREAD) {
      const x = (exit % size) + dx;
      const y = Math.floor(exit / size) + dy;
      const i = y * size + x;
      if (x < 0 || y < 0 || x >= size || y >= size || w.blocked[i] || w.bid[i] >= 0 || yard.has(i) || gate.includes(i))
        continue;
      wait.push(i);
    }
  let added = 0;
  for (let k = 0; k < n; k++) {
    const have = st.pawns.filter((p) => p.kind === 'resident');
    if (!arrive && have.length >= st.cap) break;
    const idx = have.length;
    const apt = arrive ? aptFor(st, h, size, apts) : apts[idx % apts.length];
    // wolna posadzka mieszkania, a bez mieszkania klatki
    const free: number[] = [];
    for (let i = 0; i < size * size; i++) {
      if (resident[i]) continue;
      if (apt >= 0 ? aptAt(h, i) !== apt : h.room[i] < 0 || h.rooms[h.room[i]].kind !== 'klatka') continue;
      const x = i % size;
      const y = Math.floor(i / size);
      if (!st.things.some((t) => !LOOSE.has(t.kind) && !GHOST.has(t.kind) && covers(t, x, y))) free.push(i);
    }
    const at = free[Math.floor(idx / Math.max(1, apts.length)) % Math.max(1, free.length)] ?? free[0];
    if (at === undefined) break;
    const start = exit >= 0 ? (wait[k % Math.max(1, wait.length)] ?? exit) : at;
    const p = newPawn(st, w, 'resident', -1, start, start, 4 + Math.floor(rnd() * 12));
    p.apt = apt;
    p.needs = { food: 70, warm: 60, rest: 70, health: 100, safe: 60, mood: 0 };
    p.needs.mood = 0.25 * 70 + 0.25 * 60 + 0.15 * 70 + 0.15 * 100 + 0.2 * 60;
    // przyjęty idzie zza bramy do swojego mieszkania (praca 'arrive', drogą zarządu przez bramę)
    if (exit >= 0)
      p.job = {
        t: 'arrive',
        target: apt,
        tile: at,
        phase: 0,
        from: -1,
        t0: st.tick,
        until: st.tick + k * ARRIVE_GAP,
        order: false,
        n: 0,
        what: '',
      };
    st.pawns.push(p);
    added++;
    // łóżko w swoim mieszkaniu
    const bed = st.things.find(
      (t) => BEDS.has(t.kind) && !t.broken && t.owner < 0 && apt >= 0 && aptAt(h, t.y * size + t.x) === apt,
    );
    if (bed) bed.owner = p.id;
  }
  return added;
}

/** miejsca do spania w mieszkaniu: całe łóżka i wersalki po jednym, łóżka piętrowe po dwa */
function bedsIn(st: SimState, h: HouseLike, size: number, apt: number): number {
  let n = 0;
  for (const t of st.things)
    if (BEDS.has(t.kind) && !t.broken && aptAt(h, t.y * size + t.x) === apt) n += t.kind === 'lozka_pietrowe' ? 2 : 1;
  return n;
}

/** mieszkanie dla przyjętego: pierwsze z wolnym łóżkiem, a gdy takiego brak, najmniej zatłoczone (−1: żadnego) */
function aptFor(st: SimState, h: HouseLike, size: number, apts: readonly number[]): number {
  const living = (a: number) => st.pawns.filter((p) => p.kind === 'resident' && p.apt === a).length;
  const roomy = apts.find((a) => living(a) < bedsIn(st, h, size, a));
  if (roomy !== undefined) return roomy;
  return apts.reduce((b, a) => (living(a) < living(b) ? a : b), apts[0] ?? -1);
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
export function removeCore(st: SimState, id: string, w?: World): boolean {
  const p = st.pawns.find((q) => q.kind === 'core' && st.people[q.person]?.id === id);
  if (!p) return false;
  // plan budowy wolny, a to, co niesie (drewno, deski na plan albo łatę), zostaje na ziemi
  for (const b of st.builds) if (b.by === p.id) b.by = -1;
  if (w) dropHeld(st, w, p);
  dropPawn(st, p);
  return true;
}

/** nowy szwendacz na kafelku: snuje się (praca 'zombie' w fazie 0); stado: idzie do siatki */
export function spawnZombie(st: SimState, w: World, tile: number, look: number, horde = false): Pawn {
  const p = newPawn(st, w, 'zombie', -1, tile, tile, look);
  p.hp = ZOMBIE_HP;
  p.job = {
    t: 'zombie',
    target: -1,
    tile,
    phase: horde ? 1 : 0,
    from: -1,
    t0: st.tick,
    until: 0,
    order: false,
    n: 0,
    what: horde ? 'stado' : '',
  };
  st.pawns.push(p);
  return p;
}

/** Zakażenie po ugryzieniu: od teraz gorączka, śmierć po FEVER_TICKS; limb: ugryzienie w rękę albo nogę. */
export function infect(st: SimState, p: Pawn, limb: boolean): void {
  if (p.bite !== undefined || !p.needs) return;
  p.bite = st.tick;
  p.limb = limb;
  p.moods.push({ why: FEVER_MOOD, d: -15, until: st.tick + FEVER_TICKS });
}

/** to, co pionek niesie (drewno w rękach, materiał z pracy), kładzie na stercie tego samego obok albo na wolnym
    kafelku przy nim */
function dropHeld(st: SimState, w: World, p: Pawn): void {
  const loads: [string, number][] = [];
  if (p.carry > 0) loads.push(['drewno', p.carry]);
  if (p.job && p.job.n > 0 && LOOSE.has(p.job.what)) loads.push([p.job.what, p.job.n]);
  const size = w.size;
  const from = nearestFree(w.blocked, size, Math.floor(p.y) * size + Math.floor(p.x));
  for (const [kind, n] of loads)
    for (const [dx, dy] of SPREAD) {
      const x = (from % size) + dx;
      const y = Math.floor(from / size) + dy;
      if (x < 0 || y < 0 || x >= size || y >= size || w.blocked[y * size + x] || onPlan(st, size, y * size + x))
        continue;
      const same = st.things.find((t) => t.kind === kind && t.x === x && t.y === y);
      if (same) same.n += n;
      else if (!st.things.some((t) => covers(t, x, y))) st.things.push({ ...newThing(st, kind, x, y), n });
      else continue;
      break;
    }
  p.carry = 0;
  if (p.job) p.job.n = 0;
}

/** kafelek pod planem budowy: plan zajmuje miejsce, nic się na nim nie kładzie ani nie rozpala */
export function onPlan(st: SimState, size: number, i: number): boolean {
  const x = i % size;
  const y = Math.floor(i / size);
  return st.builds.some((b) => {
    const f = footprint(b.kind, b.rot);
    return x >= b.x && x < b.x + f.w && y >= b.y && y < b.y + f.h;
  });
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
    ate: 0,
    lastMeal: -TICKS_PER_DAY,
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
        else {
          // dziura po naporze jest w miejscu siatki, którą świat blokuje: przejście trzeba otworzyć
          base[t] = 0;
          open.push(t);
        }
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

/** Kafelek za bramą, na którym znika i pojawia się wyprawa i z którego przychodzą przyjęci (−1: świat bez siatki):
    sąsiad kafelka bramy spoza podwórka, potem kilka kroków dalej od siatki. Ze świata (dziury zamknięte), nie ze
    stanu, żeby wczytana gra szła tak samo. */
export function exitOf(w: World): number {
  const shape = fenceShape(w);
  if (!shape) return -1;
  const size = w.size;
  const gate = gateTiles(w);
  const still = w.blocked.slice();
  for (const t of shape.hole) still[t] = 1;
  const yard = new Set(shape.yard);
  for (const g of gate)
    for (const d of [-size, size, -1, 1]) {
      const o = g + d;
      if (o < 0 || o >= size * size || yard.has(o) || gate.includes(o) || still[o]) continue;
      let exit = o;
      for (let k = 0; k < 6; k++) {
        const nx = exit + d;
        if (nx < 0 || nx >= size * size || still[nx] || Math.abs((nx % size) - (exit % size)) > 1) break;
        exit = nx;
      }
      return exit;
    }
  return -1;
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

/** Zapis sprzed nowszych pól stanu: brakujące pola ze świata albo puste (mieszkania i uszkodzenia M2, plany budowy,
    posiłki i porcje z uchwał o jedzeniu), żeby stara gra dała się wczytać. */
function migrate(st: SimState, w: World): void {
  const h = houseOf(w);
  const s = st as Partial<SimState>;
  // zapis sprzed M2: praca ogniska nazywała się 'build'
  if (!s.builds) for (const p of st.pawns) if ((p.job?.t as string) === 'build') p.job!.t = 'campfire';
  if (!s.apts) {
    st.apts = h ? aptsFrom(w, h) : [];
    // mieszkańcy z zapisu zostają w swoich mieszkaniach, nawet gdy świat ma je dziś za puste
    for (const p of st.pawns) {
      const g = p.kind === 'resident' ? st.apts.find((a) => a.apt === p.apt) : undefined;
      if (g?.state !== 'puste') continue;
      g.state = 'mieszkancy';
      delete g.why;
      delete g.year;
    }
  }
  if (!s.damage)
    st.damage = h ? damageFrom(w, h).filter((d) => st.apts.find((a) => a.apt === d.apt)?.state === 'puste') : [];
  if (!s.builds) st.builds = [];
  if (s.portion === undefined) st.portion = 0;
  for (const p of st.pawns) {
    if (p.ate === undefined) p.ate = 0;
    if (p.lastMeal === undefined) p.lastMeal = -TICKS_PER_DAY;
  }
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
  private lay: Record<
    'resident' | 'szabrownik' | 'zombie' | 'crowd' | 'outside',
    { blocked: Uint8Array; reg: Int32Array }
  >;
  /** mieszkanie zarządu z drzwiami (1) albo null */
  private readonly mask: Uint8Array | null;
  /** pora wspólnego posiłku: mieszkańcy mogą wejść do mieszkania zarządu, do stołu */
  private mealDoor = false;
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
  /** kafelki siatki i bramy (1): przez nie da się sięgnąć tylko dzidą, kuszą i bronią palną */
  private readonly fenceMask: Uint8Array;
  /** zabici w bieżącym kroku (znikają po pętli pionków) */
  private readonly graveyard = new Set<number>();
  /** tryb zombie: kafelki tuż za siatką (po stronie ulicy), odległość do nich, kafelki przy krawędzi mapy,
      pas za dnia (FAR–NEAR m od siatki) i okolica, z której wychodzi stado (RING_FROM–RING_TO m) */
  private seeds: number[] = [];
  private flow: Int32Array = new Int32Array(0);
  private edges: number[] = [];
  private band: number[] = [];
  private ring: number[] = [];
  /** numer kafelka siatki w World.fence.tiles (wytrzymałość w FenceState.hp) */
  private readonly fenceIndex = new Map<number, number>();
  /** wyszukiwania dróg szwendaczy w tym kroku */
  private zbudget = 0;
  /** kafelki podwórka (1) i to, czy w bieżącym kroku jest na nim wróg (liczone raz na krok) */
  private readonly yardMask: Uint8Array;
  private dangerAt = -1;
  private danger = false;

  constructor(w: World, st: SimState) {
    this.w = w;
    this.st = st;
    // zapis sprzed broni: pusty magazyn i bez amunicji (bez losowania, żeby skrót zależał tylko od stanu)
    st.store.arms ??= [];
    st.store.ammo ??= noAmmo();
    st.noise ??= [];
    st.fx ??= [];
    st.dead ??= [];
    st.tally ??= zeroTally();
    migrate(st, w);
    // zapis sprzed Thing.dead: zwłoki trzymały numer wpisu zmarłego w owner
    for (const t of st.things)
      if (t.kind === 'zwloki' && t.dead === undefined) {
        t.dead = t.owner;
        t.owner = -1;
      }
    this.pf = new PathFinder(w.size);
    this.house = houseOf(w);
    this.trunk = Int32Array.from(w.trees, (t) => trunkOf(w, t));
    const h = this.house;
    this.mask = h ? homeMask(h, w.size) : null;
    this.blocked = new Uint8Array(w.size * w.size);
    this.coreBlocked = new Uint8Array(w.size * w.size);
    this.reg = new Int32Array(0);
    this.lay = {} as Sim['lay'];
    this.mealDoor = this.mealOpen();
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
    this.exitTile = exitOf(w);
    this.fenceMask = new Uint8Array(size * size);
    for (const t of shape?.tiles ?? []) this.fenceMask[t] = 1;
    for (const [k, t] of (shape?.tiles ?? []).entries()) this.fenceIndex.set(t, k);
    this.yardMask = new Uint8Array(size * size);
    for (const t of shape?.yard ?? []) this.yardMask[t] = 1;
    for (const t of gate) this.fenceMask[t] = 1;
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
      this.mealDoor ? null : this.mask,
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
    for (const h of this.st.fence?.holes ?? []) for (const t of h.tiles) outside[t] = 1;
    for (const t of gateTiles(this.w)) outside[t] = 1;
    if (this.house) for (let i = 0; i < outside.length; i++) if (this.house.room[i] >= 0) outside[i] = 1;
    // szwendacze jak obcy (dziurami tak, zamkniętą bramą nie), ale do budynków nie wchodzą: drzwi są zamknięte
    const zombie = stranger.slice();
    if (this.house) {
      for (let i = 0; i < zombie.length; i++) if (this.house.room[i] >= 0) zombie[i] = 1;
      for (const d of this.house.doors) zombie[d] = 1;
    }
    this.lay = {
      resident: res,
      szabrownik: { blocked: stranger, reg: labelRegions(stranger, size) },
      zombie: { blocked: zombie, reg: labelRegions(zombie, size) },
      crowd: res,
      outside: { blocked: outside, reg: labelRegions(outside, size) },
    };
    // tryb zombie: pole odległości do siatki po stronie ulicy, pas za dnia, okolica stada i krawędź mapy (zapas)
    if (modeOf(this.st) === 'zombie' && shape) {
      this.seeds = this.outsideOf([...shape.tiles, ...gateTiles(this.w)]);
      this.flow = distField(outside, size, this.seeds);
      this.edges = [];
      this.band = [];
      this.ring = [];
      for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = (i - x) / size;
        const f = this.flow[i];
        if (f < 0 || zombie[i]) continue;
        if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) this.edges.push(i);
        if (f >= FAR && f <= NEAR) this.band.push(i);
        if (f >= RING_FROM && f <= RING_TO) this.ring.push(i);
      }
    }
  }

  /** przechodniość i obszary dla danego rodzaju pionka */
  private layer(kind: PawnKind): { blocked: Uint8Array; reg: Int32Array } {
    if (kind === 'core') return { blocked: this.coreBlocked, reg: this.reg };
    // handlarz chodzi tylko po stronie ulicy
    return kind === 'handlarz' ? this.lay.outside : this.lay[kind];
  }

  /** warstwa do drogi pionka: szabrownik po stronie ulicy (podchodzi, czeka, ucieka) chodzi tylko tamtędy */
  private layerOf(p: Pawn): { blocked: Uint8Array; reg: Int32Array } {
    if (p.kind === 'szabrownik' && p.job?.phase !== 2 && !this.lay.outside.blocked[this.tileOf(p)])
      return this.lay.outside;
    if (p.kind === 'zombie') return this.zlay(p);
    // przyjęty w drodze do siedziby przechodzi przez bramę jak zarząd (ktoś mu otwiera)
    if (p.kind === 'resident' && p.job?.t === 'arrive') return this.layer('core');
    return this.layer(p.kind);
  }

  /** szwendacz w budynku (wstał ze zwłok w mieszkaniu) chodzi po wnętrzu i może wyjść; z dworu nie wejdzie */
  private zlay(p: Pawn): { blocked: Uint8Array; reg: Int32Array } {
    return this.inRoom(this.tileOf(p)) ? this.lay.szabrownik : this.lay.zombie;
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
      // w trybie zombie brama rano zostaje zamknięta: za nią są szwendacze
      else if (h === GUARD_UNTIL && modeOf(st) !== 'zombie') this.setGate(true);
    }
    // racje liczą posiłki od 6:00; w porze wspólnego posiłku mieszkańcy mogą wejść do stołu zarządu
    if (st.tick % TICKS_PER_HOUR === 0 && hourOf(st.tick) === 6) for (const p of st.pawns) p.ate = 0;
    if (st.tick % (TICKS_PER_HOUR / 2) === 0) this.syncMealDoor();
    if (st.raid) this.raidTick(st.raid);
    if (st.obcy) this.traderClock();
    if (st.noise!.length) st.noise = st.noise!.filter((n) => n.until > st.tick);
    if (st.fx!.length) st.fx = st.fx!.filter((f) => f.tick + FX_TICKS > st.tick);
    if (modeOf(st) === 'zombie') {
      this.zombieClock();
      this.rise();
    }
    this.zbudget = 3;
    let budget = PATHS_PER_TICK;
    let gone = false;
    for (const p of st.pawns) {
      if (this.graveyard.has(p.id)) continue;
      // gorączka po ugryzieniu: śmierć dokładnie po FEVER_TICKS, także na wyprawie
      if (p.bite !== undefined && st.tick >= p.bite + FEVER_TICKS) {
        this.die(p, 'gorączka', null);
        continue;
      }
      if (p.away) continue;
      if (p.kind === 'core' && p.job?.t === 'amputate') {
        this.amputateTick(p, p.job);
        continue;
      }
      if (p.kind === 'core' || p.kind === 'resident') {
        // wróg blisko: zarząd z bronią walczy, reszta ucieka do domu (co sekundę, każdy w innym kroku)
        if ((st.tick + p.id) % THINK_EVERY === 0 && this.react(p)) {
          if (p.pi < p.path.length) this.walk(p);
          continue;
        }
        if (p.job?.t === 'fight') {
          this.fightTick(p, p.job);
          continue;
        }
      }
      if (p.kind === 'zombie') {
        this.zombieTick(p);
        continue;
      }
      if (p.pi < p.path.length) {
        // praca fali 1 bez polecenia ustępuje wrogowi na podwórku także w drodze (po materiał, na plan)
        if (p.kind === 'core' && st.tick % THINK_EVERY === 0 && this.yieldsToDanger(p)) {
          p.path = [];
          p.pi = 0;
          this.done(p);
          continue;
        }
        this.walk(p);
        continue;
      }
      if (p.kind === 'core' || p.kind === 'resident') {
        // wspólny posiłek: mieszkaniec zostawia podwórko albo dom i idzie do stołu
        if (
          p.kind === 'resident' &&
          st.tick % THINK_EVERY === 0 &&
          p.job?.t === 'stay' &&
          p.job.target !== STAY_MEAL &&
          this.mealDue(p)
        )
          this.plan(p);
        this.coreTick(p);
        continue;
      }
      if (p.kind === 'szabrownik') {
        if (this.strangerTick(p)) gone = true;
        continue;
      }
      if (p.kind === 'handlarz') {
        if (this.traderTick(p)) gone = true;
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
    if (gone)
      st.pawns = st.pawns.filter((p) => !((p.kind === 'szabrownik' || p.kind === 'handlarz') && p.job?.phase === 4));
    // zabici w tym kroku znikają ze stanu (zostają po nich zwłoki)
    if (this.graveyard.size) {
      for (const id of this.graveyard) {
        const p = st.pawns.find((q) => q.id === id);
        if (p) dropPawn(st, p);
      }
      this.graveyard.clear();
    }
    if (st.tick % HEAT_EVERY === 0) this.slow();
    st.tick++;
  }

  /** prędkość względem człowieka: ranny szabrownik wlecze się */
  private speedOf(p: Pawn): number {
    if (p.kind === 'szabrownik' && (p.hp ?? STRANGER_HP) < FLEE_HP) return 0.6;
    if (p.kind === 'handlarz' && p.job?.phase === 3) return 1.3;
    if (p.kind === 'zombie') return p.job?.phase === 3 ? CHASE_SPEED : ZOMBIE_SPEED;
    return 1;
  }

  private walk(p: Pawn): void {
    const size = this.w.size;
    const speed = WALK_SPEED * this.speedOf(p);
    let left = speed;
    while (left > 1e-9 && p.pi < p.path.length) {
      const t = p.path[p.pi];
      // szwendacz staje przed łatą albo bramą, które zamknęły się, kiedy już szedł (droga od nowa przy zmysłach)
      if (p.kind === 'zombie' && this.sealed(t)) {
        p.path = [];
        p.pi = 0;
        break;
      }
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
    p.walk += speed - left;
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
    if (c.t === 'arm') {
      this.arm(c.ids, c.weapon);
      return;
    }
    if (c.t === 'laws') {
      const was = st.laws.gateClosed;
      st.laws = { ...st.laws, ...c.laws };
      // podpisana nocą: kłódka od razu
      const h = hourOf(st.tick);
      if (!was && st.laws.gateClosed && (h >= 20 || h < GUARD_UNTIL)) this.setGate(false);
      this.syncMealDoor();
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
    // plan budowy i jego odwołanie nie potrzebują nikogo z zarządu (plan czeka, aż ktoś się nim zajmie)
    if (c.t === 'build') {
      this.orderBuild(pawns, c.kind, c.x, c.y, c.rot);
      return;
    }
    if (c.t === 'unbuild') {
      this.unbuild(c.id);
      return;
    }
    if (c.t === 'obcy') {
      if (!st.obcy && modeOf(st) !== 'zombie') st.obcy = newObcy(st);
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
    else if (c.t === 'attack') this.orderAttack(pawns, c.target);
    else if (c.t === 'finish') this.orderFinish(pawns, c.thing);
    else if (c.t === 'amputate') this.orderAmputate(pawns, c.patient);
    else if (c.t === 'craft') this.orderCraft(pawns);
    else if (c.t === 'brace') this.orderBrace(pawns, c.tile);
    else if (c.t === 'alarm') this.orderAlarm(pawns, !!c.off);
    else if (c.t === 'search') this.startSearch(pawns[0], c.room);
    else if (c.t === 'dismantle') this.startDismantle(pawns[0], c.thing);
    else if (c.t === 'repair') this.startRepair(pawns[0], c.damage);
    else if (c.t === 'claim') this.startClaim(pawns[0], c.apt);
    else if (c.t === 'wreck') this.startWreck(pawns[0], c.tile, c.how);
    else if (c.t === 'carry') this.startCarry(pawns[0], c.thing);
    else if (c.t === 'saw') this.startSaw(pawns[0], c.what, c.n);
    else if (c.t === 'trade') this.startTrade(pawns[0], c.offer);
    else if (c.t === 'rob') this.startRob(pawns[0]);
  }

  /** Pora wspólnego posiłku (uchwała o kotle), w której mieszkańcy mogą wejść do mieszkania zarządu: pół godziny
      przed obiadem i kolacją do półtorej godziny po nich (12:30–14:30, 18:30–20:30), a dłużej, dopóki ktoś z nich
      jeszcze tam je. Wynika z zegara, uchwał i stanu pionków, więc po wczytaniu zapisu wychodzi tak samo. */
  private mealOpen(): boolean {
    const hs = this.house;
    if (!this.st.laws.sharedMeals || !hs) return false;
    const h = (minutesAt(this.st.tick) % 1440) / 60;
    if (MEAL_HOURS.some((m) => h >= m - 0.5 && h < m + 1.5)) return true;
    // spóźniony mieszkaniec dojada i wychodzi przy otwartych drzwiach
    const size = this.w.size;
    return this.st.pawns.some(
      (p) =>
        p.kind === 'resident' &&
        (p.job?.target === STAY_MEAL || inHomeApt(hs, Math.floor(p.y) * size + Math.floor(p.x))) &&
        (p.job?.t === 'stay' || p.job === null),
    );
  }

  /** drzwi do stołu zarządu dla mieszkańców: przechodniość od nowa tylko przy zmianie */
  private syncMealDoor(): void {
    const open = this.mealOpen();
    if (open === this.mealDoor) return;
    this.mealDoor = open;
    this.rebuild();
  }

  /** pierwsza godzina wspólnego posiłku (13:00–14:00, 19:00–20:00) */
  private mealTime(): boolean {
    return this.st.laws.sharedMeals && MEAL_HOURS.includes(hourOf(this.st.tick));
  }

  /** wspólny posiłek w tej porze jeszcze przed nim (ostatni posiłek ponad trzy godziny temu) */
  private mealDue(p: Pawn): boolean {
    return this.mealTime() && this.st.tick - p.lastMeal > 3 * TICKS_PER_HOUR;
  }

  /** Czy zarząd idzie jeść: z wielkiego głodu zawsze; przy wspólnym kotle o porze posiłku (chyba że najedzony);
      przy racjach dopiero przy wyraźnym głodzie i najwyżej RATION_MEALS razy na dobę; inaczej z głodu. */
  private wantsMeal(p: Pawn): boolean {
    const n = p.needs!;
    const L = this.st.laws;
    if (n.food < STARVING) return true;
    if (L.sharedMeals) return this.mealDue(p) && n.food < 90;
    if (L.foodMult < 1) return p.ate < RATION_MEALS && n.food < RATION_HUNGRY;
    return n.food < HUNGRY;
  }

  /** uchwały od razu (interfejs woła po podpisaniu; w kolejce poleceń, żeby zapis i powtórka ich nie gubiły) */
  /** broń z magazynu do rąk osób z zarządu po kolei; stara wraca do magazynu; null odkłada broń; kto jest
      na wyprawie, ma przy sobie to, z czym wyszedł */
  private arm(ids: readonly number[], weapon: WeaponId | null): void {
    const st = this.st;
    const arms = st.store.arms!;
    for (const id of ids) {
      const p = st.pawns.find((q) => q.id === id && q.kind === 'core' && !q.away);
      if (!p || (p.weapon ?? null) === weapon) continue;
      if (weapon !== null) {
        const k = arms.indexOf(weapon);
        if (k < 0) continue;
        arms.splice(k, 1);
      }
      if (p.weapon) arms.push(p.weapon);
      p.weapon = weapon;
    }
  }

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
    if (post === 'siatka') return this.st.fence ? SIATKA_POST : null;
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
    if (post === SIATKA_POST) {
      const hot = this.hotTile(p);
      if (hot >= 0) {
        const s = this.standBy(p, [hot], 1);
        if (s >= 0) return s;
        const s2 = this.standBy(p, [hot], 2);
        if (s2 >= 0) return s2;
      }
      post = 0;
    }
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
    if (this.startCampfire(pawns[0], at)) rest = pawns.slice(1);
    if (rest.length) this.orderMove(rest, at, [at], true);
  }

  /** na tym kafelku można teraz rozpalić ognisko (campfireSpotOk) i nikt tam nie pracuje */
  siteOk(at: number): boolean {
    if (!campfireSpotOk(this.st, this.w, at)) return false;
    return !this.st.pawns.some((q) => q.job && (q.job.tile === at || (q.job.t === 'campfire' && q.job.target === at)));
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

  /** zwalnia rzeczy i plany budowy zajęte przez pionek */
  private release(p: Pawn): void {
    for (const t of this.st.things) if (t.by === p.id) t.by = -1;
    for (const b of this.st.builds) if (b.by === p.id) b.by = -1;
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
    return this.st.things.some((t) => !LOOSE.has(t.kind) && !GHOST.has(t.kind) && covers(t, x, y));
  }

  private thingAt(x: number, y: number): boolean {
    return this.st.things.some((t) => !GHOST.has(t.kind) && covers(t, x, y));
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
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[at] || onPlan(this.st, size, i)) continue;
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
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[stand] || this.thingAt(x, y) || onPlan(st, size, i)) continue;
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

  /** praca fali 1, do której zarząd wziął się sam, ustępuje wrogowi na podwórku, kiedy pracujący jest na zewnątrz */
  private yieldsToDanger(p: Pawn): boolean {
    const j = p.job;
    return !!j && M2_JOBS.has(j.t) && !j.order && this.yardDanger() && !this.inRoom(this.tileOf(p));
  }

  /** praca pionka, który nie idzie: doszedł do celu albo pracuje; false, gdy praca się skończyła
      albo nie da się jej dokończyć (cel zniknął, ktoś go przejął, nie doszedł) */
  private work(p: Pawn, j: Job): boolean {
    const st = this.st;
    const tick = st.tick;
    const at = this.tileOf(p) === j.tile;
    // prace fali 1 ustępują pilnej potrzebie, a te, do których zarząd wziął się sam, także nocy i wrogowi na
    // podwórku, kiedy pracujący jest na zewnątrz (plan czeka z doniesionym materiałem i postępem pracy)
    if (
      M2_JOBS.has(j.t) &&
      tick % THINK_EVERY === 0 &&
      (this.urgent(p) || (!j.order && this.night()) || this.yieldsToDanger(p))
    )
      return false;
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
            const hot = src.kind === 'posilek';
            // najedzenie według uchwały; kuchnia społeczna oszczędza tylko na ciepłym (konserwa to konserwa)
            const m = st.laws.foodMult;
            this.eatPortions(hot ? this.portion() : m, src);
            p.needs!.food = Math.min(100, p.needs!.food + (hot ? MEAL : COLD_MEAL) * satiety(m));
            if (hot) this.addMood(p, 'Ciepły posiłek', 4, 4 * TICKS_PER_HOUR);
            else this.addMood(p, 'Zimne z puszki', -3, 4 * TICKS_PER_HOUR);
            if (m < 1) this.addMood(p, 'Głodowe racje', -3, 8 * TICKS_PER_HOUR);
            if (j.n === 1) this.addMood(p, 'Wspólny posiłek', 5, 12 * TICKS_PER_HOUR);
            p.ate++;
            p.lastMeal = tick;
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
        if (j.phase === 1) {
          // głodny za dnia wstaje coś zjeść, kiedy jest co, a potem odsypia
          if (p.kind === 'core' && !this.night() && tick % THINK_EVERY === 0 && this.wantsMeal(p) && this.mealFor(p)) {
            p.nap = true;
            return false;
          }
          // mieszkańcy (siły z tła) wstają rano, zarząd do tego dopiero wypoczęty
          if (this.night() || (p.kind === 'core' && p.needs!.rest < REST_UNTIL)) return true;
          this.wake(p, j);
          return false;
        }
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
        // dla całego zarządu, porcje według uchwały (racje mniejsze, kocioł większe i od razu na cały dzień)
        const batch = Math.min(food.n, Math.max(1, this.potTarget() - this.meals()));
        food.n -= batch;
        if (food.n <= 0) st.things.splice(st.things.indexOf(food), 1);
        this.serve(batch, j.tile);
        if (stove.kind === 'kuchenka') stove.fuel = Math.max(0, stove.fuel - COOK_TICKS);
        return false;
      }
      case 'stay':
        if (j.phase === 1) {
          if (tick < j.until) return true;
          if (j.target === STAY_MEAL) {
            this.addMood(p, 'Wspólny posiłek', 5, 12 * TICKS_PER_HOUR);
            p.ate++;
            p.lastMeal = tick;
          }
          return false;
        }
        if (!at) return false;
        j.phase = 1;
        // przy stole je się pół godziny od dojścia
        if (j.target === STAY_MEAL) j.until = tick + EAT_TICKS;
        return true;
      case 'guard': {
        // nie śpi do rana; schodzi z posterunku tylko wtedy, gdy zdrowie siada
        if (j.phase === 1) {
          if (p.needs!.health < 30) return false;
          // rano po nocy na posterunku: najpierw coś zje, potem odsypia
          if (tick >= j.until) {
            p.nap = true;
            return false;
          }
          // warta bije każdego wroga w zasięgu swojej broni, nie schodząc z posterunku
          if ((tick + p.id) % 5 === 0) this.guardStrike(p);
          // przy siatce: idzie tam, gdzie napór się przesunął
          if (j.target === SIATKA_POST && (tick + p.id) % SIATKA_EVERY === 0) this.followPressure(p, j);
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
        // przysypia na posterunku do rana
        if (j.phase === 4) {
          if (tick < j.until) return true;
          p.nap = true;
          return false;
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
          const hot = j.target === SIATKA_POST ? this.hotTile() : -1;
          const look = hole ? hole.tiles : hot >= 0 ? [hot] : gateTiles(this.w);
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
          // z warsztatem łata idzie półtora raza szybciej
          j.until = tick + Math.round(PATCH_TICKS / (this.hasBuilt('warsztat') ? 1.5 : 1));
          this.face(p, (hole.tiles[0] % size) + 0.5, Math.floor(hole.tiles[0] / size) + 0.5);
          return true;
        }
        if (tick < j.until) return true;
        hole.patch = PATCH_HP;
        j.n = 0;
        this.rebuild();
        return false;
      }
      case 'campfire': {
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
      case 'fight':
        // walka ma własny krok (fightTick)
        return true;
      case 'zombie':
        // szwendacze mają własny krok (zombieTick)
        return false;
      case 'amputate':
        // amputacja ma własny krok (amputateTick)
        return true;
      case 'craft': {
        // materiał zużywa się dopiero na końcu: przerwana praca niczego nie zjada
        const need: [string, number][] = [
          ['deski', SPEAR_BOARDS],
          ['zlom', SPEAR_SCRAP],
        ];
        if (j.phase === 0) {
          if (!at || !this.haveHeaps(p, need)) return false;
          j.phase = 1;
          j.until = tick + CRAFT_TICKS;
          return true;
        }
        if (tick < j.until) return true;
        if (this.haveHeaps(p, need)) {
          for (const [kind, n] of need) this.takeHeaps(p, kind, n, j.from);
          st.store.arms!.push('dzida');
        }
        return false;
      }
      case 'brace': {
        const f = st.fence;
        const k = this.fenceIndex.get(j.target);
        if (!f || k === undefined || f.hp[k] <= 0 || f.hp[k] >= 100) return false;
        const size = this.w.size;
        if (j.phase === 0) {
          const heap = this.thing(j.from);
          if (!at || !heap || heap.by !== p.id) return false;
          const take = Math.min(heap.n, BRACE_COST - j.n);
          heap.n -= take;
          heap.by = -1;
          j.n += take;
          if (!j.what) j.what = heap.kind;
          if (heap.n <= 0) st.things.splice(st.things.indexOf(heap), 1);
          if (j.n < BRACE_COST) {
            const next = this.heapFor(p, j.what);
            const nt = next ? next.y * size + next.x : -1;
            if (!next || !this.go(p, nt)) return false;
            j.from = next.id;
            j.tile = nt;
            next.by = p.id;
            return true;
          }
          const stand = this.standBy(p, [j.target], 1);
          if (stand < 0 || !this.go(p, stand)) return false;
          j.phase = 1;
          j.from = -1;
          j.tile = stand;
          return true;
        }
        if (j.phase === 1) {
          if (!at) return false;
          j.phase = 2;
          // z warsztatem wzmacnianie idzie półtora raza szybciej, jak łata
          j.until = tick + Math.round(BRACE_TICKS / (this.hasBuilt('warsztat') ? 1.5 : 1));
          this.face(p, (j.target % size) + 0.5, Math.floor(j.target / size) + 0.5);
          return true;
        }
        if (tick < j.until) return true;
        f.hp[k] = Math.min(100, f.hp[k] + BRACE_HP);
        j.n = 0;
        return false;
      }
      case 'finish': {
        const body = this.thing(j.target);
        if (body?.kind !== 'zwloki' || body.fuel <= 0) return false;
        if (j.phase === 0) {
          if (!at) return false;
          j.phase = 1;
          j.until = tick + FINISH_TICKS;
          this.face(p, body.x + 0.5, body.y + 0.5);
          return true;
        }
        if (tick < j.until) return true;
        body.fuel = 0;
        const d = st.dead?.[body.dead ?? -1];
        this.addMood(p, d?.kind === 'szabrownik' ? 'Dobiłem obcego' : 'Dobiłem sąsiada', -4, TICKS_PER_DAY);
        return false;
      }
      case 'search': {
        const g = this.aptOfRoom(j.target);
        if (!g || g.searched.includes(j.target)) return false;
        if (j.phase === 0) {
          if (!at) return false;
          j.phase = 1;
          j.t0 = tick;
          j.until = tick + searchTicks(this.roomTiles[j.target].length);
          return true;
        }
        if (tick < j.until) return true;
        this.searchDone(j.target, g, j.tile);
        return false;
      }
      case 'dismantle': {
        const t = this.thing(j.target);
        if (!t || t.by !== p.id) return false;
        if (j.phase === 0) {
          if (!at) return false;
          j.phase = 1;
          j.t0 = tick;
          j.until = tick + dismantleTicks(t.kind, t.w, t.h, t.n);
          this.face(p, t.x + t.w / 2, t.y + t.h / 2);
          return true;
        }
        if (tick < j.until) return true;
        this.dismantleDone(t, j.tile);
        return false;
      }
      case 'repair':
        return this.repairWork(p, j, at);
      case 'claim': {
        const g = this.st.apts.find((a) => a.apt === j.target);
        if (!g || g.ours || g.state !== 'puste') return false;
        if (j.phase === 0) {
          if (!at) return false;
          j.phase = 1;
          j.t0 = tick;
          j.until = tick + CLAIM_TICKS;
          return true;
        }
        if (tick < j.until) return true;
        g.ours = true;
        this.updateCap();
        return false;
      }
      case 'build':
        return this.buildWork(p, j, at);
      case 'wreck':
        return this.wreckWork(p, j, at);
      case 'carry':
        return this.carryWork(p, j, at);
      case 'saw':
        return this.sawWork(p, j, at);
      case 'trade':
        return this.tradeWork(p, j, at);
      case 'rob':
        return this.robWork(p, j, at);
      // praca handlarza ma własny krok (traderTick)
      case 'trader':
        return false;
      case 'arrive':
        // przyjęty: zza bramy do swojego mieszkania (po kolei, gęsiego), potem plan dnia jak każdy mieszkaniec
        if (tick < j.until) return true;
        return !at && this.go(p, j.tile);
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
    if (p.nap && n.rest >= REST_UNTIL) p.nap = false;
    // w trybie zombie za siatką bez zajęcia nikt nie stoi: wraca do siedziby
    if (modeOf(this.st) === 'zombie' && !this.insideAt(this.tileOf(p))) {
      const s = this.shelterSpot(p);
      if (s >= 0 && this.go(p, s)) {
        this.setJob(p, this.newJob('go', s, s, false), false);
        return;
      }
    }
    // zwłoki, które wstaną, w pobliżu: uzbrojony dobija je odruchowo (nóż w głowę); przy wrogu na podwórku
    // tylko te w budynku
    if (p.weapon && this.startFinish(p, this.yardDanger())) return;
    // wróg na podwórku: tylko to, co w środku (sen, jedzenie, ciepło przy kozie, gotowanie)
    if (this.yardDanger() && !this.inRoom(this.tileOf(p))) {
      const s = this.shelterSpot(p);
      if (s >= 0 && this.go(p, s)) {
        this.setJob(p, this.newJob('go', s, s, false), false);
        return;
      }
    }
    if (this.yardDanger()) {
      // odsypianie po warcie jak niżej: głodny najpierw je, potem śpi
      if (!this.night() && (p.nap || n.rest < TIRED) && this.wantsMeal(p) && this.startEat(p, this.mealDue(p))) return;
      if (((this.night() && n.rest < 80) || n.rest < TIRED || p.nap) && this.startSleep(p)) {
        p.nap = false;
        return;
      }
      if (this.wantsMeal(p) && this.startEat(p, this.mealDue(p))) return;
      if (this.shouldCook() && this.startCook(p, false)) return;
      if (n.warm < COLD && this.startWarm(p)) return;
      p.wait = this.st.tick + THINK_EVERY;
      return;
    }
    if (p.carry > 0) {
      if (this.startRefuel(p, false) || this.startHaul(p)) return;
      this.dropCarry(p);
    }
    // za dnia zmęczony albo odsypiający (po nocnej warcie, po pobudce na posiłek): głodny najpierw coś zje
    if (!this.night() && (p.nap || n.rest < TIRED) && this.wantsMeal(p) && this.startEat(p, this.mealDue(p))) return;
    if (((this.night() && n.rest < 80) || n.rest < TIRED || p.nap) && this.startSleep(p)) {
      p.nap = false;
      return;
    }
    if (this.wantsMeal(p) && this.startEat(p, this.mealDue(p))) return;
    if (this.startRefuel(p, false) || this.startHaul(p)) return;
    if (this.shouldCook() && this.startCook(p, false)) return;
    // plany budowy czekają: za dnia wolny zarząd sam przynosi materiały i buduje
    if (!this.night() && this.startAnyBuild(p)) return;
    if (n.warm < COLD && this.startWarm(p)) return;
    p.wait = this.st.tick + THINK_EVERY;
  }

  /** Plan dnia mieszkańca: nocą śpi w swoim mieszkaniu, rano siedzi w domu, od WORK_START do 18:00 pracuje na
      podwórku (za siatką, nie przełazi dziurami), od 18:00 grzeje się przy ognisku, jeśli się pali, potem wraca do domu. */
  private plan(p: Pawn): void {
    const st = this.st;
    const h = hourOf(st.tick);
    if (this.night() && this.startSleep(p)) return;
    // wspólny kocioł: o 13:00 i 19:00 przy stole zarządu (jedzą swoje porcje, zapasów zarządu nie ruszają)
    if (this.mealDue(p)) {
      const spot = this.mealSpot(p);
      if (spot >= 0 && this.go(p, spot)) {
        this.setJob(p, this.newJob('stay', STAY_MEAL, spot, false), false);
        return;
      }
    }
    let kind = STAY_HOME;
    if (!this.night() && h >= st.laws.workStart && h < 18) kind = STAY_YARD;
    else if (h >= 18 && h < 20 && this.campfire()) kind = STAY_FIRE;
    // wróg na podwórku: nikt tam nie wychodzi
    if (kind !== STAY_HOME && this.yardDanger()) kind = STAY_HOME;
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

  /** miejsce przy stole zarządu na wspólny posiłek: kafelki kuchni do 3 m od stołu, a gdy zajęte, cała kuchnia
      i reszta mieszkania zarządu */
  private mealSpot(p: Pawn): number {
    const h = this.house;
    if (!h) return -1;
    const size = this.w.size;
    const table = this.st.things.find((t) => t.kind === 'stol' && inHomeApt(h, t.y * size + t.x));
    const room = table ? h.room[table.y * size + table.x] : kitchenOf(h, size);
    if (room < 0) return -1;
    const tiles = this.roomTiles[room];
    if (table) {
      const cx = table.x + table.w / 2;
      const cy = table.y + table.h / 2;
      const near = tiles.filter((i) => Math.hypot((i % size) + 0.5 - cx, Math.floor(i / size) + 0.5 - cy) <= 3);
      const s = this.pickSpot(p, near);
      if (s >= 0) return s;
    }
    const s = this.pickSpot(p, tiles);
    if (s >= 0) return s;
    const apt: number[] = [];
    for (const r of h.rooms) if (r.apt === h.home) apt.push(...this.roomTiles[r.id]);
    return this.pickSpot(p, apt);
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
    for (const r of h.rooms)
      if (p.apt >= 0 ? r.apt === p.apt : r.kind === 'klatka') tiles.push(...this.roomTiles[r.id]);
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
    // najpierw własne łóżko, potem niczyje, na końcu cudze; zepsute się nie liczą, łóżka piętrowe mają dwa miejsca
    let bed: Thing | undefined;
    let slot = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (!BEDS.has(t.kind) || t.broken || apt < 0) continue;
      const slots = t.kind === 'lozka_pietrowe' ? thingTiles(t, size) : [t.y * size + t.x];
      for (const i of slots) {
        if (aptAt(h, i) !== apt || this.layer(p.kind).blocked[i] || taken.includes(i)) continue;
        const d = this.dist2(p, i) + (t.owner === p.id ? 0 : t.owner < 0 ? 1e6 : 2e6);
        if (d < bd) {
          bd = d;
          bed = t;
          slot = i;
        }
      }
    }
    let tile = bed ? slot : -1;
    if (!bed) {
      // łóżek za mało: śpi na podłodze w pokoju zarządu, a bez pokoju gdziekolwiek w mieszkaniu
      // mieszkaniec bez mieszkania (przyjęty ponad miejsca, bez mieszkań przy podwórku) nocuje w klatce
      const floorIn = (pokoj: boolean) => {
        const out: number[] = [];
        for (const r of h.rooms)
          if (apt >= 0 ? r.apt === apt && (!pokoj || r.kind === 'pokoj') : p.kind === 'resident' && r.kind === 'klatka')
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

  /** Pobudka: po nocy na podłodze nastrój „Spanie na podłodze” (mieszkańcom ubywa też sił, zarząd wypoczywa wolniej
      już we śnie), po nocy w łóżku mieszkaniec odzyskuje siły; śpiący na podłodze mieszkaniec przeprowadza się do
      mieszkania z wolnym łóżkiem, jeśli takie jest (zajęte i naprawione, łóżka piętrowe). */
  private wake(p: Pawn, j: Job): void {
    const n = p.needs!;
    if (j.target >= 0) {
      if (p.kind === 'resident') n.rest = Math.max(n.rest, RESIDENT_REST);
      return;
    }
    this.addMood(p, 'Spanie na podłodze', FLOOR_MOOD, 16 * TICKS_PER_HOUR);
    if (p.kind !== 'resident') return;
    n.rest = Math.max(25, n.rest - 15);
    const h = this.house!;
    const size = this.w.size;
    const apts = residentApts(this.st, this.w, h);
    const living = (a: number) => this.st.pawns.filter((q) => q.kind === 'resident' && q.apt === a).length;
    const to = apts.find((a) => a !== p.apt && living(a) < bedsIn(this.st, h, size, a));
    if (to === undefined) return;
    p.apt = to;
    const bed = this.st.things.find(
      (t) => BEDS.has(t.kind) && !t.broken && t.owner < 0 && aptAt(h, t.y * size + t.x) === to,
    );
    if (bed) bed.owner = p.id;
  }

  /** gotować trzeba, gdy w garnkach jest mniej porcji, niż jest ludzi, którzy zaraz zgłodnieją (kto właśnie je,
      za chwilę będzie najedzony), są zapasy i ogień albo gaz, a nikt inny akurat nie gotuje; gotuje się wtedy
      od razu dla wszystkich, żeby nie palić gazu na jedną porcję */
  private shouldCook(): boolean {
    const st = this.st;
    const cores = st.pawns.filter((q) => q.kind === 'core' && !q.away);
    const m = this.portion();
    if (cores.some((q) => q.job?.t === 'cook') || !canCookIn(st, this.w)) return false;
    // wspólny kocioł albo kuchnia społeczna: gotuje się raz dziennie dla wszystkich, godzinę przed obiadem (i przed
    // kolacją tylko wtedy, gdy garnek opustoszał)
    if (this.cookOnce()) {
      const h = hourOf(st.tick);
      return MEAL_HOURS.some((mh) => h === mh - 1) && this.meals() < this.potTarget() * (h < MEAL_HOURS[0] ? 1 : 0.5);
    }
    // inaczej dla tych, którzy zaraz zgłodnieją (przy racjach tylko ci, którym racja jeszcze została)
    const soon = cores.filter(
      (q) => (q.needs?.food ?? 100) < PECKISH && q.job?.t !== 'eat' && (m >= 1 || q.ate < RATION_MEALS),
    ).length;
    return soon * m > this.meals();
  }

  /** wielkość porcji: uchwała (racje, kocioł), a z kuchnią społeczną o 15% mniej jedzenia na osobę */
  private portion(): number {
    return this.st.laws.foodMult * (this.hasBuilt('kuchnia_spoleczna') ? SOCIAL_KITCHEN : 1);
  }

  /** gotuje się raz dziennie dla wszystkich: wspólny kocioł albo kuchnia społeczna */
  private cookOnce(): boolean {
    return this.st.laws.sharedMeals || this.hasBuilt('kuchnia_spoleczna');
  }

  /** ile porcji ma być w garnku: dla zarządu według wielkości porcji, przy gotowaniu raz dziennie przed obiadem
      od razu na obiad i kolację */
  private potTarget(): number {
    const st = this.st;
    const cores = st.pawns.filter((q) => q.kind === 'core' && !q.away).length;
    const one = Math.ceil(cores * this.portion() - 1e-9);
    if (!this.cookOnce()) return one;
    return hourOf(st.tick) < MEAL_HOURS[0] ? one * MEAL_HOURS.length : one;
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
  /** co zjeść od razu: ciepły posiłek z garnka, a zimną konserwę tylko z dużego głodu albo gdy nie da się ugotować
      (inaczej ktoś najpierw ugotuje); undefined: nie ma co */
  private mealFor(p: Pawn): Thing | undefined {
    const pot = this.st.things.find((t) => t.kind === 'posilek' && t.n > 0);
    if (pot) return pot;
    const raw = this.food();
    return raw && (p.needs!.food < 15 || !canCookIn(this.st, this.w)) ? raw : undefined;
  }

  private startEat(p: Pawn, shared = false): boolean {
    const h = this.house!;
    const size = this.w.size;
    const food = this.mealFor(p);
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
    // wspólny posiłek (przy kotle): n = 1
    j.n = shared ? 1 : 0;
    this.setJob(p, j, false);
    return true;
  }

  /** Zjedzona porcja wielkości m: ułamki zbierają się w st.portion, a ze stosów (najpierw ten, z którego jadł, potem
      garnki, potem zapasy) schodzą tylko całe porcje: przy racjach 3 porcje na 4 posiłki, przy kotle 11 na 10. */
  private eatPortions(m: number, first: Thing): void {
    const st = this.st;
    st.portion += m;
    let take = Math.floor(st.portion + 1e-9);
    st.portion = Math.max(0, Math.round((st.portion - take) * 1e6) / 1e6);
    while (take > 0) {
      const src =
        (first.n > 0 && st.things.includes(first) ? first : undefined) ??
        st.things.find((t) => t.kind === 'posilek' && t.n > 0) ??
        this.food();
      if (!src) break;
      src.n--;
      take--;
      if (src.n <= 0) st.things.splice(st.things.indexOf(src), 1);
    }
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
  private heapFor(p: Pawn, kind = '', need = PATCH_COST): Thing | undefined {
    const size = this.w.size;
    const region = this.regionOf(p);
    const free = (t: Thing) =>
      (t.kind === 'deski' || t.kind === 'zlom') &&
      t.n > 0 &&
      (t.by < 0 || t.by === p.id) &&
      this.reg[t.y * size + t.x] === region;
    const enough = (k: string) => this.st.things.reduce((a, t) => a + (t.kind === k && free(t) ? t.n : 0), 0) >= need;
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
  private startCampfire(p: Pawn, site: number): boolean {
    const size = this.w.size;
    if (p.carry >= CAMPFIRE_WOOD) {
      const stand = this.siteStand(p, site);
      if (stand < 0 || !this.go(p, stand)) return false;
      this.setJob(p, this.newJob('campfire', site, stand, true, 1), true);
      return true;
    }
    const pile = this.pileFor(p, 'any');
    if (!pile) return false;
    const pt = pile.y * size + pile.x;
    if (!this.go(p, pt)) return false;
    const j = this.newJob('campfire', site, pt, true);
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

  /* ---------- M2: budowa ---------- */

  /** plan budowy w miejscu (albo ten, który tam już jest); pierwsza wskazana osoba od razu się nim zajmuje */
  private orderBuild(pawns: Pawn[], kind: BuildKind, x: number, y: number, rot: number): void {
    const st = this.st;
    if (!BUILDS[kind]) return;
    let plan = st.builds.find((b) => b.kind === kind && b.x === x && b.y === y && b.rot === rot);
    if (!plan) {
      if (!canPlace(st, this.w, kind, x, y, rot).ok) return;
      plan = { id: st.nextThing++, kind, x, y, rot, need: { ...BUILDS[kind].cost }, have: {}, work: 0, by: -1 };
      st.builds.push(plan);
    }
    if (pawns[0]) this.startBuild(pawns[0], plan);
  }

  /** środkowy kafelek planu albo budowli */
  private buildCenter(kind: BuildKind, x: number, y: number, rot: number): number {
    const { w: bw, h: bh } = footprint(kind, rot);
    return (y + (bh >> 1)) * this.w.size + x + (bw >> 1);
  }

  /** Odwołanie planu (doniesione materiały zostają obok) albo rozbiórka gotowej budowli (wraca połowa kosztu,
      zasieki przestają trzymać siatkę). */
  private unbuild(id: number): void {
    const st = this.st;
    const k = st.builds.findIndex((b) => b.id === id);
    if (k >= 0) {
      const b = st.builds[k];
      st.builds.splice(k, 1);
      const at = this.besideFootprint(b.kind, b.x, b.y, b.rot);
      for (const [m, n] of Object.entries(b.have) as [Mat, number][]) if (n > 0) this.dropMat(at, m, n);
      // kto przy nim pracował, oddaje to, co niesie (dropLoad przy końcu pracy)
      return;
    }
    const t = st.things.find((q) => q.id === id && q.kind in BUILDS);
    if (!t) return;
    const kind = t.kind as BuildKind;
    st.things.splice(st.things.indexOf(t), 1);
    const at = this.besideFootprint(kind, t.x, t.y, t.rot);
    for (const [m, n] of Object.entries(BUILDS[kind].cost) as [Mat, number][]) {
      const back = Math.floor(n / 2);
      if (back > 0) this.dropMat(at, m, back);
    }
    if (kind === 'zasieki') this.fenceAt(t.y * this.w.size + t.x, false, t.prev ?? 0);
    this.updateCap();
  }

  /** kafelek obok obrysu planu albo budowli na zwrot materiału: przy zasiekach od strony podwórka, przy reszcie
      pierwszy wolny kafelek wokół obrysu */
  private besideFootprint(kind: BuildKind, x: number, y: number, rot: number): number {
    const size = this.w.size;
    const { w: bw, h: bh } = footprint(kind, rot);
    const yard = BUILDS[kind].place === 'obwod' ? (fenceShape(this.w)?.yard ?? []) : null;
    for (let yy = y - 1; yy <= y + bh; yy++)
      for (let xx = x - 1; xx <= x + bw; xx++) {
        const i = yy * size + xx;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size || (xx >= x && xx < x + bw && yy >= y && yy < y + bh))
          continue;
        if (this.coreBlocked[i] || this.thingAt(xx, yy) || onPlan(this.st, size, i)) continue;
        if (!yard || yard.includes(i)) return i;
      }
    return this.buildCenter(kind, x, y, rot);
  }

  /** materiały planu doniesione w całości */
  private ready(b: BuildPlan): boolean {
    return (Object.entries(b.need) as [Mat, number][]).every(([m, v]) => (b.have[m] ?? 0) >= v);
  }

  /** skąd się buduje: obok budowli, a zasieki od strony podwórka */
  private buildStand(p: Pawn, b: BuildPlan): number {
    const { w: bw, h: bh } = footprint(b.kind, b.rot);
    if (BUILDS[b.kind].place === 'obwod') {
      const s = this.standBy(p, [b.y * this.w.size + b.x], 1);
      if (s >= 0) return s;
    }
    return this.beside(p, { x: b.x, y: b.y, w: bw, h: bh } as Thing);
  }

  /** zająć się planem: z materiałami od razu do pracy, inaczej po pierwszy brakujący materiał; false, gdy plan ma
      kogoś innego albo nie ma skąd wziąć materiału */
  private startBuild(p: Pawn, b: BuildPlan, order = true): boolean {
    if (b.by >= 0 && b.by !== p.id) return false;
    // materiału musi starczyć na całość, inaczej zostaje na planie, którego nikt nie skończy
    if (!this.ready(b) && !this.coverable(p, b)) return false;
    const j = this.newJob('build', b.id, this.tileOf(p), order);
    if (this.ready(b)) {
      const stand = this.buildStand(p, b);
      if (stand < 0 || !this.go(p, stand)) return false;
      this.setJob(p, j, false);
      j.phase = 2;
      j.tile = stand;
      b.by = p.id;
      return true;
    }
    this.setJob(p, j, false);
    if (!this.fetchNext(p, j, b.need, b.have)) {
      p.job = null;
      return false;
    }
    b.by = p.id;
    return true;
  }

  /** wolny zarząd: najstarszy plan bez nikogo, który da się zacząć (materiały są albo starczy ich na całość) */
  private startAnyBuild(p: Pawn): boolean {
    for (const b of this.st.builds) if (b.by < 0 && this.startBuild(p, b, false)) return true;
    return false;
  }

  /** Czy materiału do planu starczy: brak (need − have) pokrywają wolne sterty w zasięgu pionka po odjęciu tego,
      czego jeszcze potrzebują plany, przy których pracuje ktoś inny (bez tego, co już niesie). */
  private coverable(p: Pawn, b: BuildPlan): boolean {
    const st = this.st;
    const size = this.w.size;
    const region = this.regionOf(p);
    const free: Partial<Record<Mat, number>> = {};
    for (const t of st.things) {
      if (!MATS.includes(t.kind as Mat) || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      if (this.reg[t.y * size + t.x] === region) free[t.kind as Mat] = (free[t.kind as Mat] ?? 0) + t.n;
    }
    for (const o of st.builds) {
      if (o === b || o.by < 0 || o.by === p.id) continue;
      const q = st.pawns.find((x) => x.id === o.by);
      for (const [m, v] of Object.entries(o.need) as [Mat, number][]) {
        const miss = v - (o.have[m] ?? 0) - (q?.job?.what === m ? q.job.n : 0);
        free[m] = (free[m] ?? 0) - Math.max(0, miss);
      }
    }
    return (Object.entries(b.need) as [Mat, number][]).every(([m, v]) => (free[m] ?? 0) >= v - (b.have[m] ?? 0));
  }

  /** budowa: kursy po materiały (faza 0 i 1), potem praca (faza 2), na koniec gotowa budowla */
  private buildWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const b = st.builds.find((q) => q.id === j.target);
    if (!b) return false;
    b.by = p.id;
    if (j.phase === 0) {
      if (!at) return false;
      const m = j.what as Mat;
      return this.takeFor(p, j, (b.need[m] ?? 0) - (b.have[m] ?? 0), this.buildStand(p, b));
    }
    if (j.phase === 1) {
      if (!at) return false;
      const m = j.what as Mat;
      b.have[m] = (b.have[m] ?? 0) + j.n;
      j.n = 0;
      j.what = '';
      if (this.fetchNext(p, j, b.need, b.have)) return true;
      if (!this.ready(b)) return false;
      j.phase = 2;
      j.t0 = st.tick;
      return true;
    }
    if (!at) return false;
    b.work += 1;
    const c = this.buildCenter(b.kind, b.x, b.y, b.rot);
    this.face(p, (c % this.w.size) + 0.5, Math.floor(c / this.w.size) + 0.5);
    if (b.work < BUILDS[b.kind].work) return true;
    this.finishBuild(b);
    return false;
  }

  /** gotowa budowla: plan znika, rzecz o tym samym id staje na mapie, działanie od razu */
  private finishBuild(b: BuildPlan): void {
    const st = this.st;
    st.builds.splice(st.builds.indexOf(b), 1);
    const { w: bw, h: bh } = footprint(b.kind, b.rot);
    st.things.push({
      id: b.id,
      kind: b.kind,
      x: b.x,
      y: b.y,
      w: bw,
      h: bh,
      rot: b.rot,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    if (b.kind === 'zasieki') st.things[st.things.length - 1].prev = this.fenceAt(b.y * this.w.size + b.x, true);
    this.updateCap();
  }

  /** Zasieki na odcinku siatki: dziura pod nimi zamknięta, kafelek siatki twardszy. Zwraca to, co było wcześniej
      (łata dziury sprzed pierwszych zasieków na niej albo wytrzymałość kafelka). Przy rozbiórce (on: false) wraca
      `prev`, chyba że na tej samej dziurze stoją jeszcze inne zasieki. */
  private fenceAt(tile: number, on: boolean, prev = 0): number {
    const f = this.st.fence;
    const shape = fenceShape(this.w);
    if (!f || !shape) return 0;
    const size = this.w.size;
    const hole = f.holes.find((x) => x.tiles.includes(tile));
    if (hole) {
      const other = this.st.things.find(
        (t) => t.kind === 'zasieki' && t.y * size + t.x !== tile && hole.tiles.includes(t.y * size + t.x),
      );
      const was = other?.prev ?? hole.patch;
      hole.patch = on || other ? ZASIEKI_HP : prev;
      this.rebuild();
      return was;
    }
    const k = shape.tiles.indexOf(tile);
    if (k < 0) return 0;
    const was = f.hp[k];
    f.hp[k] = on ? ZASIEKI_HP : prev;
    return was;
  }

  /* ---------- M2: przeszukanie, rozbiórka, naprawa, zajęcie ---------- */

  /** mieszkanie pomieszczenia (stan w grze) albo undefined dla klatki */
  private aptOfRoom(room: number): AptGame | undefined {
    const r = this.house?.rooms[room];
    return r && r.apt >= 0 ? this.st.apts.find((a) => a.apt === r.apt) : undefined;
  }

  /** wolny kafelek pomieszczenia najbliżej pionka, na którym nikt nie pracuje */
  private roomSpot(p: Pawn, room: number): number {
    const size = this.w.size;
    const taken = this.taken(p);
    const region = this.regionOf(p);
    const cand = this.roomTiles[room].filter(
      (i) => this.reg[i] === region && !taken.includes(i) && !this.furnitureAt(i % size, Math.floor(i / size)),
    );
    return this.nearest(p, cand.length ? cand : this.roomTiles[room].filter((i) => this.reg[i] === region));
  }

  /** przeszukać pomieszczenie pustego mieszkania albo, w domu jednorodzinnym, domu komitetu (raz; nie gdy ktoś już
      je przeszukuje) */
  private startSearch(p: Pawn, room: number): void {
    const g = this.aptOfRoom(room);
    if (!g || !searchable(this.w, g) || g.searched.includes(room)) return;
    if (this.st.pawns.some((q) => q.job?.t === 'search' && q.job.target === room)) return;
    const spot = this.roomSpot(p, room);
    if (spot < 0 || !this.go(p, spot)) return;
    this.setJob(p, this.newJob('search', room, spot, true), false);
  }

  /** łup z przeszukania: z tabeli według powodu opuszczenia (w domu komitetu z dokładką), deterministycznie z ziarna
      gry i pomieszczenia */
  private searchDone(room: number, g: AptGame, at: number): void {
    const h = this.house!;
    const rnd = mulberry((Math.imul(this.st.seed | 0, 9973) ^ Math.imul(room + 1, 7919) ^ 0x51ab) >>> 0);
    const loot = searchLoot(g, h.rooms[room].kind, this.roomTiles[room].length, rnd);
    for (const [m, n] of Object.entries(loot) as [Mat, number][]) if (n > 0) this.dropMat(at, m, n, room);
    g.searched.push(room);
    g.searched.sort((a, b) => a - b);
  }

  canDismantle(t: Thing): boolean {
    return dismantlable(this.st, this.w, t);
  }

  private startDismantle(p: Pawn, id: number): void {
    const t = this.thing(id);
    if (!t || !this.canDismantle(t) || (t.by >= 0 && t.by !== p.id)) return;
    const size = this.w.size;
    // na stercie się stoi, przy meblu obok
    const stand = RUBBISH.has(t.kind) ? t.y * size + t.x : this.beside(p, t);
    if (stand < 0 || !this.go(p, stand)) return;
    this.setJob(p, this.newJob('dismantle', t.id, stand, true), false);
    t.by = p.id;
  }

  /** rzecz znika, materiały zostają obok (z warsztatem półtora raza więcej) */
  private dismantleDone(t: Thing, at: number): void {
    const st = this.st;
    const bonus = this.hasBuilt('warsztat');
    const out = yieldOf(t.kind, t.n, !!t.broken);
    st.things.splice(st.things.indexOf(t), 1);
    for (const [m, n] of Object.entries(out) as [Mat, number][]) {
      const k = bonus ? Math.round(n * 1.5) : n;
      if (k > 0) this.dropMat(at, m, k);
    }
  }

  /** rzecz leży w pomieszczeniu z magazynem */
  private inStore(t: Thing): boolean {
    const h = this.house;
    if (!h) return false;
    const size = this.w.size;
    const r = h.room[t.y * size + t.x];
    return r >= 0 && this.st.things.some((m) => m.kind === 'magazyn' && h.room[m.y * size + m.x] === r);
  }

  /** gotowa budowla danego rodzaju stoi */
  private hasBuilt(kind: BuildKind): boolean {
    return this.st.things.some((t) => t.kind === kind);
  }

  /** kafelek, z którego się naprawia: samo uszkodzenie, gdy da się na nim stanąć, inaczej sąsiedni w mieszkaniu
      albo na klatce */
  private repairStand(p: Pawn, d: DamageGame): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    const x = d.tile % size;
    const y = Math.floor(d.tile / size);
    const cand: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = (y + dy) * size + x + dx;
        if (i < 0 || i >= size * size || this.coreBlocked[i] || this.reg[i] !== region) continue;
        if (this.furnitureAt(i % size, Math.floor(i / size))) continue;
        cand.push(i);
      }
    return cand.includes(d.tile) ? d.tile : this.nearest(p, cand);
  }

  /** materiałów do naprawy (brakujących) jest dość w stertach, do których zarząd dojdzie */
  private enoughFor(p: Pawn, need: Partial<Record<Mat, number>>, have: Partial<Record<Mat, number>>): boolean {
    for (const [m, v] of Object.entries(need) as [Mat, number][]) {
      const left = v - (have[m] ?? 0) - (p.job?.what === m ? p.job.n : 0);
      if (left > 0 && this.reachableMat(p, m) < left) return false;
    }
    return true;
  }

  /** ile sztuk materiału leży w stertach, do których pionek dojdzie (wolnych albo jego) */
  private reachableMat(p: Pawn, m: Mat): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    let n = 0;
    for (const t of this.st.things)
      if (t.kind === m && t.n > 0 && (t.by < 0 || t.by === p.id) && this.reg[t.y * size + t.x] === region) n += t.n;
    return n;
  }

  /** najbliższa sterta materiału (wolna albo pionka) w jego obszarze */
  private matStack(p: Pawn, m: Mat): Thing | undefined {
    const size = this.w.size;
    const region = this.regionOf(p);
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (t.kind !== m || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      const i = t.y * size + t.x;
      if (this.reg[i] !== region) continue;
      const d = this.dist2(p, i);
      if (d < bd || (d === bd && best && t.id < best.id)) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Następny kurs po materiał na budowę albo naprawę: pierwszy brakujący materiał, którego sterta jest w zasięgu.
      Faza 0: idzie do sterty (from, what). false: nic nie brakuje albo nie ma skąd wziąć. */
  private fetchNext(p: Pawn, j: Job, need: Partial<Record<Mat, number>>, have: Partial<Record<Mat, number>>): boolean {
    for (const [m, v] of Object.entries(need) as [Mat, number][]) {
      if (v - (have[m] ?? 0) <= 0) continue;
      const pile = this.matStack(p, m);
      if (!pile) continue;
      const pt = pile.y * this.w.size + pile.x;
      if (!this.go(p, pt)) continue;
      j.phase = 0;
      j.from = pile.id;
      j.what = m;
      j.tile = pt;
      pile.by = p.id;
      return true;
    }
    return false;
  }

  /** Przy stercie: bierze, ile brakuje (razem w rękach do CARRY). Gdy w rękach wciąż mniej, a niedaleko leży więcej
      tego samego, idzie najpierw tam (łup leży w małych stertach), inaczej niesie na miejsce pracy (faza 1).
      false: nie da się. */
  private takeFor(p: Pawn, j: Job, need: number, stand: number): boolean {
    const pile = this.thing(j.from);
    if (!pile || pile.by !== p.id || pile.kind !== j.what) return false;
    const take = Math.min(pile.n, CARRY - j.n, need - j.n);
    pile.n -= take;
    pile.by = -1;
    if (pile.n <= 0) this.st.things.splice(this.st.things.indexOf(pile), 1);
    j.n += take;
    j.from = -1;
    if (j.n < Math.min(CARRY, need)) {
      const next = this.matStack(p, j.what as Mat);
      const at = next ? next.y * this.w.size + next.x : -1;
      if (next && this.dist2(p, at) <= GATHER_NEAR ** 2 && this.go(p, at)) {
        j.from = next.id;
        j.tile = at;
        next.by = p.id;
        return true;
      }
    }
    if (stand < 0 || !this.go(p, stand)) return false;
    j.phase = 1;
    j.tile = stand;
    return true;
  }

  /** naprawić uszkodzenie: materiałów musi być dość (doniesione plus w stertach w zasięgu) */
  private startRepair(p: Pawn, k: number): void {
    const d = this.st.damage[k];
    if (!d || d.fixed) return;
    if (this.st.pawns.some((q) => q.job?.t === 'repair' && q.job.target === k)) return;
    const cost = REPAIR[d.kind].cost;
    if (!this.enoughFor(p, cost, d.have)) return;
    const j = this.newJob('repair', k, this.tileOf(p), true);
    this.setJob(p, j, false);
    if (this.fetchNext(p, j, cost, d.have)) return;
    // wszystko już doniesione: od razu do pracy
    const stand = this.repairStand(p, d);
    if (stand < 0 || !this.go(p, stand)) {
      p.job = null;
      return;
    }
    j.phase = 2;
    j.tile = stand;
  }

  /** naprawa: kursy po materiał (faza 0 i 1), potem praca (faza 2, z warsztatem półtora raza szybciej) */
  private repairWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const d = st.damage[j.target];
    if (!d || d.fixed) return false;
    const def = REPAIR[d.kind];
    if (j.phase === 0) {
      if (!at) return false;
      const m = j.what as Mat;
      return this.takeFor(p, j, (def.cost[m] ?? 0) - (d.have[m] ?? 0), this.repairStand(p, d));
    }
    if (j.phase === 1) {
      if (!at) return false;
      // materiał zostaje przy uszkodzeniu
      const m = j.what as Mat;
      d.have[m] = (d.have[m] ?? 0) + j.n;
      j.n = 0;
      j.what = '';
      if (this.fetchNext(p, j, def.cost, d.have)) return true;
      for (const [mm, v] of Object.entries(def.cost) as [Mat, number][]) if ((d.have[mm] ?? 0) < v) return false;
      j.phase = 2;
      return this.beginRepair(p, j, d);
    }
    // faza 2 prosto ze startu (materiał był już na miejscu): praca liczy się od dojścia
    if (!j.until) return at && this.beginRepair(p, j, d);
    if (st.tick < j.until) return true;
    d.fixed = true;
    d.have = {};
    this.updateCap();
    return false;
  }

  /** początek pracy przy uszkodzeniu (z warsztatem półtora raza szybciej) */
  private beginRepair(p: Pawn, j: Job, d: DamageGame): boolean {
    const tick = this.st.tick;
    j.t0 = tick;
    j.until = tick + Math.round(REPAIR[d.kind].work / (this.hasBuilt('warsztat') ? 1.5 : 1));
    this.face(p, (d.tile % this.w.size) + 0.5, Math.floor(d.tile / this.w.size) + 0.5);
    return true;
  }

  /** zająć puste mieszkanie: wejść do niego i oznaczyć je jako nasze */
  private startClaim(p: Pawn, apt: number): void {
    const g = this.st.apts.find((a) => a.apt === apt);
    if (!g || g.ours || g.state !== 'puste' || !this.house) return;
    const rooms = this.house.rooms.filter((r) => r.apt === apt).map((r) => r.id);
    const spots = rooms.map((r) => this.roomSpot(p, r)).filter((i) => i >= 0);
    const spot = this.nearest(p, spots);
    if (spot < 0 || !this.go(p, spot)) return;
    this.setJob(p, this.newJob('claim', apt, spot, true), false);
  }

  /* ---------- surowce: wraki, łup zza siatki na podwórko, warsztat (src/sim/surowce.ts) ---------- */

  /** wolny kafelek przy podstawie wraku, osiągalny dla pionka, na którym nikt nie pracuje (−1: brak) */
  private wreckStand(p: Pawn, r: Wreck): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const free: number[] = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
        const i = y * size + x;
        if (!this.coreBlocked[i] && this.reg[i] === region && !taken.includes(i)) free.push(i);
      }
    return this.nearest(p, free);
  }

  /** przeszukać albo rozebrać wrak (tile: kafelek pod nim albo obok); jedna osoba naraz, rozbiórka po przeszukaniu */
  private startWreck(p: Pawn, tile: number, how: 'szukaj' | 'rozbierz'): void {
    const r = wreckAt(this.w, tile);
    if (!r) return;
    const t = wreckTile(r, this.w.size);
    if (wreckStage(this.st.wraki, t) !== (how === 'szukaj' ? 0 : 1)) return;
    if (this.st.pawns.some((q) => q !== p && q.job?.t === 'wreck' && q.job.target === t)) return;
    const stand = this.wreckStand(p, r);
    if (stand < 0 || !this.go(p, stand)) return;
    const j = this.newJob('wreck', t, stand, true);
    j.what = how;
    this.setJob(p, j, false);
  }

  /** Praca przy wraku: przeszukanie pół godziny (cichy szelest), rozbiórka 2–2,5 h z hałasem co 2 s, z łomem
      o połowę krócej; postęp rozbiórki zostaje w st.wraki, więc przerwana idzie dalej od tego miejsca. Po skończeniu
      łup spada obok, a ta sama osoba od razu nosi go na podwórko (praca 'carry'). */
  private wreckWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const tick = st.tick;
    const r = wreckAt(this.w, j.target);
    const strip = j.what === 'rozbierz';
    if (!r || wreckStage(st.wraki, j.target) !== (strip ? 1 : 0)) return false;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = tick;
      j.until = strip ? 0 : tick + WRECK_SEARCH_TICKS;
      this.face(p, r.x + r.w / 2, r.y + r.h / 2);
      if (!strip) this.addNoise(p.x, p.y, WRECK_SEARCH_NOISE);
      return true;
    }
    if (strip) {
      const mark = st.wraki!.find((m) => m.t === j.target)!;
      mark.w = (mark.w ?? 0) + (p.weapon === 'lom' ? 2 : 1);
      if ((tick - j.t0) % NOISE_TICKS === 0) this.addNoise(p.x, p.y, WRECK_STRIP_NOISE);
      if (mark.w < WRECK_STRIP_TICKS[r.model]) return true;
    } else if (tick < j.until) return true;
    this.wreckDone(r, j.target, strip ? 2 : 1, j.tile);
    return this.carryOn(p, j, j.tile);
  }

  /** wrak przeszukany (s 1) albo rozebrany (s 2): znak w st.wraki (pole powstaje przy pierwszym), łup obok */
  private wreckDone(r: Wreck, t: number, s: 1 | 2, at: number): void {
    const st = this.st;
    st.wraki ??= [];
    const mark: WreckMark | undefined = st.wraki.find((m) => m.t === t);
    if (mark) {
      mark.s = s;
      delete mark.w;
    } else {
      st.wraki.push({ t, s });
      st.wraki.sort((a, b) => a.t - b.t);
    }
    const loot = s === 1 ? wreckLoot(r.model, wreckRng(st.seed, t)) : WRECK_STRIP[r.model];
    // z warsztatem rozbiórka daje półtora raza więcej, jak przy meblach
    const bonus = s === 2 && this.hasBuilt('warsztat');
    for (const [m, n] of Object.entries(loot) as [Mat, number][]) {
      const k = bonus ? Math.round(n * 1.5) : n;
      if (k > 0) this.dropMat(at, m, k);
    }
  }

  /** sterta łupu za siatką do noszenia: najbliższa pionkowi, do CARRY_REACH metrów od kafelka anchor */
  private lootNear(p: Pawn, anchor: number): Thing | undefined {
    const size = this.w.size;
    const ax = anchor % size;
    const ay = Math.floor(anchor / size);
    const region = this.regionOf(p);
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (!CARRY_MATS.has(t.kind) || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      if (Math.max(Math.abs(t.x - ax), Math.abs(t.y - ay)) > CARRY_REACH) continue;
      const i = t.y * size + t.x;
      if (this.insideAt(i) || this.reg[i] !== region) continue;
      const d = this.dist2(p, i);
      if (d < bd || (d === bd && best && t.id < best.id)) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Praca j przechodzi w noszenie łupu leżącego przy anchor (następny kurs): do sterty po materiał. false, gdy
      nie ma czego nosić albo nie da się dojść (bez siatki nie ma „za siatką”, więc łup zostaje, gdzie leży). */
  private carryOn(p: Pawn, j: Job, anchor: number): boolean {
    if (!this.st.fence) return false;
    const next = this.lootNear(p, anchor);
    if (!next) return false;
    const i = next.y * this.w.size + next.x;
    if (!this.go(p, i)) return false;
    j.t = 'carry';
    j.phase = 0;
    j.target = next.id;
    j.tile = i;
    j.from = anchor;
    j.order = true;
    next.by = p.id;
    return true;
  }

  /** zanieść stertę zza siatki (i sterty obok niej) na podwórko */
  private startCarry(p: Pawn, id: number): void {
    const t = this.thing(id);
    if (!t || !this.st.fence || !CARRY_MATS.has(t.kind) || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) return;
    const i = t.y * this.w.size + t.x;
    if (this.insideAt(i) || !this.go(p, i)) return;
    const j = this.newJob('carry', t.id, i, true);
    j.from = i;
    this.setJob(p, j, false);
    t.by = p.id;
  }

  /** Noszenie łupu: przy stercie bierze do CARRY sztuk jednego materiału (n, what), na podwórku kładzie je od bramy
      w głąb, potem wraca po następną stertę przy anchor (from), aż nic nie zostanie. Przerwane: to, co w rękach,
      upada pod nogi (dropLoad). */
  private carryWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    if (j.phase === 0) {
      const t = this.thing(j.target);
      if (!at || !t || t.by !== p.id || !CARRY_MATS.has(t.kind) || this.insideAt(j.tile)) return false;
      const take = Math.min(t.n, CARRY);
      t.n -= take;
      t.by = -1;
      if (t.n <= 0) st.things.splice(st.things.indexOf(t), 1);
      j.n = take;
      j.what = t.kind;
      const dest = this.lootSpot(p, t.kind);
      if (dest < 0 || !this.go(p, dest)) return false;
      j.phase = 1;
      j.target = -1;
      j.tile = dest;
      return true;
    }
    if (!at) return false;
    this.dropInYard(j.what, j.n, j.tile);
    j.n = 0;
    j.what = '';
    return this.carryOn(p, j, j.from);
  }

  /** kafelki podwórka na łup, od bramy w głąb: bez kafelków przy bramie, dziurach, drzwiach i wejściach (przejścia
      zostają wolne), bez mebli, budowli i planów */
  private yardSpots(): number[] {
    const shape = fenceShape(this.w);
    if (!shape) return [];
    const size = this.w.size;
    const gate = gateTiles(this.w);
    const keep: number[] = [...gate, ...shape.hole, ...(this.house?.doors ?? [])];
    for (const b of this.w.buildings) for (const e of b.entrances) keep.push(e.out);
    const ban = new Set<number>();
    for (const k of keep)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = (k % size) + dx;
          const y = Math.floor(k / size) + dy;
          if (x >= 0 && y >= 0 && x < size && y < size) ban.add(y * size + x);
        }
    const gx = gate.length ? gate.reduce((a, t) => a + (t % size), 0) / gate.length : 0;
    const gy = gate.length ? gate.reduce((a, t) => a + Math.floor(t / size), 0) / gate.length : 0;
    const d = (i: number) => ((i % size) - gx) ** 2 + (Math.floor(i / size) - gy) ** 2;
    return shape.yard
      .filter((i) => !ban.has(i) && !this.coreBlocked[i] && !onPlan(this.st, size, i))
      .sort((a, b) => d(a) - d(b) || a - b);
  }

  /** kafelek podwórka, na który zmieści się materiał kind: sterta tego rodzaju z miejscem albo wolny kafelek */
  private lootSpot(p: Pawn, kind: string): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    for (const i of this.yardSpots()) {
      if (this.reg[i] !== region) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      const same = this.st.things.find((t) => t.kind === kind && t.x === x && t.y === y);
      if (same ? same.n < STACK : !this.thingAt(x, y)) return i;
    }
    return -1;
  }

  /** n sztuk materiału na podwórko: na sterty tego rodzaju z miejscem i na wolne kafelki, od bramy w głąb;
      gdy podwórko pełne, reszta przy kafelku at, jak przy innych pracach */
  private dropInYard(kind: string, n: number, at: number): void {
    const st = this.st;
    const size = this.w.size;
    let left = n;
    for (const i of this.yardSpots()) {
      if (left <= 0) return;
      const x = i % size;
      const y = Math.floor(i / size);
      const same = st.things.find((t) => t.kind === kind && t.x === x && t.y === y);
      if (same) {
        const k = Math.min(left, STACK - same.n);
        same.n += Math.max(0, k);
        left -= Math.max(0, k);
      } else if (!this.thingAt(x, y)) {
        const t = newThing(st, kind, x, y);
        t.n = Math.min(left, STACK);
        left -= t.n;
        st.things.push(t);
      }
    }
    if (left > 0) this.dropMat(at, kind, left);
  }

  /** zbudowany warsztat najbliżej pionka, przy którym da się stanąć, wolny albo jego */
  private workshopFor(p: Pawn): { t: Thing; stand: number } | undefined {
    let best: { t: Thing; stand: number } | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (t.kind !== 'warsztat' || (t.by >= 0 && t.by !== p.id)) continue;
      const stand = this.beside(p, t);
      if (stand < 0) continue;
      const d = this.dist2(p, stand);
      if (d < bd) {
        bd = d;
        best = { t, stand };
      }
    }
    return best;
  }

  /** Przeróbka w warsztacie: n sztuk produktu po kolei (j.from: ile zostało, j.what: produkt; n w rękach zostaje
      zerem, bo nic się nie nosi). Materiał zużywa się na końcu każdej sztuki, jak przy dzidzie. */
  private startSaw(p: Pawn, what: Product, n: number): void {
    const r = RECIPES[what];
    if (!r || n < 1 || this.workStock(r.from) < r.n) return;
    const ws = this.workshopFor(p);
    if (!ws || !this.go(p, ws.stand)) return;
    const j = this.newJob('saw', ws.t.id, ws.stand, true);
    j.what = what;
    j.from = n;
    this.setJob(p, j, false);
    ws.t.by = p.id;
  }

  private sawWork(p: Pawn, j: Job, at: boolean): boolean {
    const tick = this.st.tick;
    const ws = this.thing(j.target);
    const r = RECIPES[j.what as Product];
    if (ws?.kind !== 'warsztat' || ws.by !== p.id || !r) return false;
    if (j.phase === 0) {
      if (!at) return false;
      // materiał w drodze (ktoś niesie drewno do składu): czeka przy warsztacie
      if (this.workStock(r.from) < r.n) return this.inTransit(p, r.from) > 0;
      j.phase = 1;
      j.t0 = tick;
      j.until = tick + r.work;
      this.face(p, ws.x + ws.w / 2, ws.y + ws.h / 2);
      return true;
    }
    if (tick < j.until) return true;
    if (!this.takeForWork(r.from, r.n)) return this.inTransit(p, r.from) > 0;
    this.dropMat(j.tile, j.what, 1);
    j.from--;
    if (j.from <= 0 || this.workStock(r.from) + this.inTransit(p, r.from) < r.n) return false;
    j.t0 = tick;
    j.until = tick + r.work;
    return true;
  }

  /** materiał na przeróbkę: wszystkie sterty danego rodzaju, także te, które ktoś właśnie niesie do składu
      (inaczej piłujący kończyłby pracę za każdym razem, gdy ktoś inny weźmie stos drewna do składu) */
  private workStock(kind: string): number {
    return this.st.things.reduce((a, t) => a + (t.kind === kind && t.n > 0 ? t.n : 0), 0);
  }

  /** sztuki materiału w rękach innych z zarządu (drewno niesione do składu, materiał na budowę) */
  private inTransit(p: Pawn, kind: string): number {
    let n = 0;
    for (const q of this.st.pawns) {
      if (q === p || q.kind !== 'core') continue;
      if (kind === 'drewno') n += q.carry;
      if (q.job?.what === kind) n += q.job.n;
    }
    return n;
  }

  /** Materiał na przeróbkę ze stert: najpierw wolne, potem zajęte (noszący weźmie, ile zostało); drewno najpierw
      spoza składu, bo skład jest na noc do kozy. false, gdy nie starczy. */
  private takeForWork(kind: string, n: number): boolean {
    if (this.workStock(kind) < n) return false;
    const size = this.w.size;
    const sklad = kind === 'drewno' ? (this.house?.sklad ?? []) : [];
    const rank = (t: Thing) => (t.by >= 0 ? 2 : 0) + (sklad.includes(t.y * size + t.x) ? 1 : 0);
    const piles = this.st.things
      .filter((t) => t.kind === kind && t.n > 0)
      .sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    let left = n;
    for (const t of piles) {
      const k = Math.min(t.n, left);
      t.n -= k;
      left -= k;
      if (left <= 0) break;
    }
    this.st.things = this.st.things.filter((t) => !(t.kind === kind && t.n <= 0));
    return true;
  }

  /* ---------- handlarz pod bramą (src/sim/handlarz.ts) ---------- */

  /** pionek handlarza na mapie */
  private trader(): Pawn | undefined {
    const o = this.st.obcy;
    return o && o.trader >= 0 ? this.st.pawns.find((p) => p.id === o.trader && p.kind === 'handlarz') : undefined;
  }

  /** termin wizyty: przychodzi za dnia (9:00–15:00), a gdy termin wypadł w nocy, przesuwa się na rano */
  private traderClock(): void {
    const st = this.st;
    const o = st.obcy!;
    if (o.next < 0 || o.trader >= 0 || st.tick < o.next) return;
    const h = hourOf(st.tick);
    if (h < 9 || h >= 15) {
      o.next = tickAt(dayOf(st.tick) + (h >= 15 ? 1 : 0), 9 + 4 * nextRandom(st.rng));
      return;
    }
    this.spawnTrader();
  }

  /** handlarz z daleka po stronie ulicy idzie na kafelek przy bramie; bez bramy wizyta przepada */
  private spawnTrader(): void {
    const st = this.st;
    const o = st.obcy!;
    const day = dayOf(st.tick);
    const spot = this.outsideOf(gateTiles(this.w))[0];
    if (spot === undefined) {
      o.next = nextVisit(day, st.rng);
      return;
    }
    const from = this.farFrom(spot, TRADER_FROM);
    const p = newPawn(st, this.w, 'handlarz', -1, from, from, Math.floor(nextRandom(st.rng) * 16));
    p.hp = TRADER_HP;
    p.job = this.newJob('trader', -1, spot, false);
    st.pawns.push(p);
    if (from === spot || !this.go(p, spot)) {
      st.pawns.pop();
      o.next = nextVisit(day, st.rng);
      return;
    }
    o.trader = p.id;
    o.offers = rollOffers(st.rng);
    o.wizyty++;
  }

  /** Krok handlarza, który nie idzie: 0 doszedł pod bramę (stawia wózek i czeka do until), 1 czeka, potem odchodzi
      z wózkiem, 2 odszedł, 3 uciekł po napaści, 4 zniknął. true: zniknął w tym kroku. */
  private traderTick(p: Pawn): boolean {
    const st = this.st;
    const o = st.obcy;
    const j = p.job;
    if (!o || !j) {
      p.job = this.newJob('trader', -1, this.tileOf(p), false, 4);
      return true;
    }
    if (j.phase === 0) {
      const size = this.w.size;
      const here = this.tileOf(p);
      // wózek obok w tym samym rzędzie (nad handlarzem zasłaniałby mu głowę), dalej od bramy
      const around = this.tilesAround(here, 9).filter((i) => i !== here);
      const g0 = gateTiles(this.w)[0] ?? here;
      const away = (i: number) =>
        -Math.abs((i % size) - (g0 % size)) - Math.abs(Math.floor(i / size) - Math.floor(g0 / size));
      const row = around.filter((i) => Math.floor(i / size) === Math.floor(here / size) && Math.abs(i - here) === 1);
      const at = row.sort((a, b) => away(a) - away(b) || a - b)[0] ?? around[0] ?? here;
      const cart = newThing(st, 'wozek', at % size, Math.floor(at / size));
      cart.n = 1;
      st.things.push(cart);
      j.phase = 1;
      j.from = cart.id;
      j.t0 = st.tick;
      j.until = Math.min(st.tick + WAIT_TICKS, tickAt(dayOf(st.tick), LEAVE_HOUR));
      const g = gateTiles(this.w)[0];
      if (g !== undefined) this.face(p, (g % size) + 0.5, Math.floor(g / size) + 0.5);
      return false;
    }
    if (j.phase === 1) {
      if (st.tick < j.until) return false;
      // odchodzi tam, skąd przyszedł, i zabiera wózek
      const cart = this.thing(j.from);
      if (cart) st.things.splice(st.things.indexOf(cart), 1);
      j.phase = 2;
      j.from = -1;
      o.offers = [];
      if (this.go(p, p.home)) return false;
    }
    j.phase = 4;
    if (o.trader === p.id) {
      o.trader = -1;
      o.offers = [];
      if (o.napad < 0) o.next = nextVisit(dayOf(st.tick), st.rng);
    }
    return true;
  }

  /** na ofertę starcza materiału (z całego zapasu, jak w warsztacie) */
  private canPay(take: Partial<Record<Mat, number>>): boolean {
    return (Object.entries(take) as [Mat, number][]).every(([m, n]) => this.workStock(m) >= n);
  }

  /** kafelek do handlu: podwórko najbliżej handlarza (wymiana przez bramę), bez siatki tuż obok niego */
  private tradeSpot(p: Pawn, t: Pawn): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const yard = fenceShape(this.w)?.yard ?? [];
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const i of yard) {
      if (this.coreBlocked[i] || this.reg[i] !== region || taken.includes(i)) continue;
      const d = ((i % size) + 0.5 - t.x) ** 2 + (Math.floor(i / size) + 0.5 - t.y) ** 2;
      if (d < bd || (d === bd && i < best)) {
        bd = d;
        best = i;
      }
    }
    return best >= 0 ? best : this.besidePawn(p, t);
  }

  /** wolny kafelek tuż przy pionku t, do którego p dojdzie (−1: brak) */
  private besidePawn(p: Pawn, t: Pawn): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
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

  /** wymiana: jedna osoba idzie pod bramę i targuje się 5 minut; oferta, handlarz i materiał sprawdzane na końcu */
  private startTrade(p: Pawn, k: number): void {
    const t = this.trader();
    const offer = this.st.obcy?.offers[k];
    if (t?.job?.phase !== 1 || !offer || offer.left <= 0 || !this.canPay(offer.take)) return;
    const spot = this.tradeSpot(p, t);
    if (spot < 0 || !this.go(p, spot)) return;
    this.setJob(p, this.newJob('trade', k, spot, true), false);
  }

  private tradeWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const t = this.trader();
    const offer = st.obcy?.offers[j.target];
    if (t?.job?.phase !== 1 || !offer || offer.left <= 0) return false;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = st.tick;
      j.until = st.tick + HAGGLE_TICKS;
      this.face(p, t.x, t.y);
      return true;
    }
    if (st.tick < j.until) return true;
    if (!this.canPay(offer.take)) return false;
    for (const [m, n] of Object.entries(offer.take) as [Mat, number][]) this.takeForWork(m, n);
    for (const [m, n] of Object.entries(offer.give) as [Mat, number][])
      if (st.fence) this.dropInYard(m, n, j.tile);
      else this.dropMat(j.tile, m, n);
    offer.left--;
    return false;
  }

  /** n sztuk materiału po stronie ulicy wokół kafelka at (nie na bramie, dziurach i podwórku), na sterty tego rodzaju
      z miejscem i na wolne kafelki; gdy tam brak miejsca, reszta jak zwykle (dropMat) */
  private dropOutside(at: number, kind: string, n: number): void {
    const st = this.st;
    const size = this.w.size;
    let left = n;
    for (const i of this.tilesAround(at, 25)) {
      if (left <= 0) return;
      const x = i % size;
      const y = Math.floor(i / size);
      const same = st.things.find((t) => t.kind === kind && t.x === x && t.y === y);
      if (same) {
        const k = Math.max(0, Math.min(left, STACK - same.n));
        same.n += k;
        left -= k;
      } else if (!this.thingAt(x, y)) {
        const t = newThing(st, kind, x, y);
        t.n = Math.min(left, STACK);
        left -= t.n;
        st.things.push(t);
      }
    }
    if (left > 0) this.dropMat(at, kind, left);
  }

  /** napaść: jedna osoba idzie do handlarza za bramę */
  private startRob(p: Pawn): void {
    const t = this.trader();
    if (t?.job?.phase !== 1) return;
    const spot = this.besidePawn(p, t);
    if (spot < 0 || !this.go(p, spot)) return;
    this.setJob(p, this.newJob('rob', t.id, spot, true), false);
  }

  /** Cios, handlarz rzuca wózek i ucieka; cały jego towar zostaje przy wózku za siatką, a handlarz więcej nie
      przychodzi. Nastrój: napastnik i reszta zarządu. */
  private robWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const o = st.obcy;
    const t = this.trader();
    if (!o || !at || !t || t.id !== j.target || t.job?.phase !== 1) return false;
    this.face(p, t.x, t.y);
    this.addFx('cios', p.x, p.y, t.x, t.y);
    t.hp = Math.max(1, (t.hp ?? TRADER_HP) - 25);
    const cart = this.thing(t.job.from);
    const size = this.w.size;
    const drop = cart ? cart.y * size + cart.x : this.tileOf(t);
    for (const offer of o.offers)
      if (offer.left > 0)
        for (const [m, n] of Object.entries(offer.give) as [Mat, number][]) this.dropOutside(drop, m, n * offer.left);
    if (cart) cart.n = 0;
    o.offers = [];
    o.napad = st.tick;
    o.next = -1;
    t.job.phase = 3;
    t.job.from = -1;
    this.go(t, t.home);
    this.addMood(p, HANDEL.nastroj.pl, ROB_MOOD, TICKS_PER_DAY);
    for (const q of st.pawns)
      if (q !== p && q.kind === 'core' && !q.away) this.addMood(q, HANDEL.nastroj.pl, ROB_MOOD_OTHERS, TICKS_PER_DAY);
    return false;
  }

  /** miejsca dla mieszkańców od nowa (zajęcie, naprawa, budowa) */
  private updateCap(): void {
    this.st.cap = capOf(this.st, this.w);
  }

  /** Materiał na ziemię przy kafelku: na stertę tego samego rodzaju, która się jeszcze zmieści (do STACK), albo na
      najbliższy wolny kafelek w tym samym obszarze (room: najpierw w tym pomieszczeniu). */
  private dropMat(from: number, kind: string, n: number, room = -1): void {
    const st = this.st;
    const size = this.w.size;
    let left = n;
    const at = nearestFree(this.coreBlocked, size, from);
    const tiles: number[] = [];
    if (room >= 0) tiles.push(...this.roomTiles[room]);
    for (const [dx, dy] of SPREAD) {
      const x = (at % size) + dx;
      const y = Math.floor(at / size) + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      tiles.push(y * size + x);
    }
    // najpierw kafelki pomieszczenia od najbliższego
    if (room >= 0) {
      const ax = at % size;
      const ay = Math.floor(at / size);
      tiles.splice(
        0,
        this.roomTiles[room].length,
        ...[...this.roomTiles[room]].sort(
          (a, b) =>
            Math.abs((a % size) - ax) +
              Math.abs(Math.floor(a / size) - ay) -
              (Math.abs((b % size) - ax) + Math.abs(Math.floor(b / size) - ay)) || a - b,
        ),
      );
    }
    for (const i of tiles) {
      if (left <= 0) break;
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[at] || onPlan(st, size, i)) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      const same = st.things.find((t) => t.kind === kind && t.x === x && t.y === y);
      if (same) {
        const k = Math.min(left, STACK - same.n);
        if (k > 0) {
          same.n += k;
          left -= k;
        }
        continue;
      }
      if (this.thingAt(x, y)) continue;
      const t = newThing(st, kind, x, y);
      t.n = Math.min(left, STACK);
      left -= t.n;
      st.things.push(t);
    }
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
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[at] || onPlan(this.st, size, i)) continue;
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

  /* ---------- walka ---------- */

  /** żywy wróg z mapy (nie na wyprawie, nie zabity w tym kroku) */
  private enemy(id: number): Pawn | undefined {
    const t = this.st.pawns.find((q) => q.id === id);
    return t && isEnemy(t) && !t.away && !this.graveyard.has(t.id) ? t : undefined;
  }

  /** atak na polecenie: każdy idzie do wroga i bije, póki wróg żyje */
  private orderAttack(pawns: Pawn[], target: number): void {
    if (!this.enemy(target)) return;
    for (const p of pawns) this.startFight(p, target, true);
  }

  /** walka z wrogiem target; zapamiętuje broń, z którą się zaczęła */
  private startFight(p: Pawn, target: number, order: boolean): void {
    const j = this.newJob('fight', target, -1, order);
    j.until = this.st.tick + FIGHT_GIVEUP;
    j.what = this.armed(p).id;
    this.setJob(p, j, false);
    p.path = [];
    p.pi = 0;
  }

  /** odwrót do mieszkania zarządu; false: nie ma dokąd */
  private retreat(p: Pawn): boolean {
    const spot = this.shelterSpot(p);
    if (spot < 0 || !this.go(p, spot)) return false;
    this.setJob(p, this.newJob('go', spot, spot, false), false);
    return true;
  }

  /** broń, którą pionek naprawdę uderzy: broń palna bez amunicji bije jak gołe ręce */
  private armed(p: Pawn): Weapon {
    const w = weaponOf(p.weapon);
    if (w.ammo && (this.st.store.ammo?.[w.ammo] ?? 0) <= 0) return WEAPONS.piesci;
    return w;
  }

  /** Co jest na linii między dwoma punktami (bez kafelków obu końców): 'wall' ściana, drzewo albo inna przeszkoda,
      'fence' siatka, łata albo zamknięta brama, 'clear' nic. Próbki co 0,25 m. */
  private lineCheck(ax: number, ay: number, bx: number, by: number): 'clear' | 'fence' | 'wall' {
    const size = this.w.size;
    const a = Math.floor(ay) * size + Math.floor(ax);
    const b = Math.floor(by) * size + Math.floor(bx);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25));
    let fence = false;
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      const i = Math.floor(y) * size + Math.floor(x);
      if (i === a || i === b || !this.blocked[i]) continue;
      if (this.fenceMask[i]) fence = true;
      else return 'wall';
    }
    return fence ? 'fence' : 'clear';
  }

  /** czy p dosięgnie t bronią w: zasięg, nic po drodze, a przez siatkę tylko broń, która przez nią sięga */
  private canHit(p: Pawn, t: Pawn, w: Weapon): boolean {
    if (Math.hypot(t.x - p.x, t.y - p.y) > w.reach + 0.2) return false;
    const los = this.lineCheck(p.x, p.y, t.x, t.y);
    return los === 'clear' || (los === 'fence' && w.fence);
  }

  /** cios albo strzał: celność z umiejętności i sił, amunicja, hałas, efekt; true: trafił */
  private strike(p: Pawn, t: Pawn, w: Weapon): boolean {
    const st = this.st;
    p.cd = st.tick + w.cd;
    this.face(p, t.x, t.y);
    const who = p.person >= 0 ? st.people[p.person] : undefined;
    const chance = hitChance(w, who?.skills.obrona ?? 0, p.needs?.rest ?? 100, !!p.maimed);
    if (w.ammo) st.store.ammo![w.ammo] = Math.max(0, st.store.ammo![w.ammo] - 1);
    this.addFx(w.ammo ? 'strzal' : 'cios', p.x, p.y, t.x, t.y);
    if (w.noise > 0) this.addNoise(p.x, p.y, w.noise);
    if (nextRandom(st.rng) >= chance) return false;
    // bełt w połowie przypadków da się wyciągnąć
    if (w.ammo === 'belty' && nextRandom(st.rng) < 0.5) st.store.ammo!.belty++;
    this.hurt(t, w.dmg, p);
    return true;
  }

  /** obrażenia z zewnątrz (zdarzenia, testy) */
  wound(p: Pawn, dmg: number): void {
    if (this.st.pawns.includes(p) && !this.graveyard.has(p.id)) this.hurt(p, dmg, null);
  }

  /** łup zabitego szabrownika zostaje na podwórku według rodzaju i przestaje się liczyć jako skradziony */
  private dropSack(p: Pawn): void {
    const st = this.st;
    const size = this.w.size;
    const kinds: [keyof Loot, string][] = [
      ['wood', 'drewno'],
      ['supplies', 'jedzenie'],
      ['scrap', 'zlom'],
    ];
    for (const [k, kind] of kinds) {
      const n = p.sack?.[k] ?? 0;
      if (n <= 0) continue;
      if (kind === 'drewno') this.addWood(this.spotNear(this.tileOf(p), n), n);
      else {
        const at = this.spotNear(this.tileOf(p), 0);
        const t = st.things.find((q) => q.kind === kind && q.x === at % size && q.y === Math.floor(at / size));
        if (t) t.n += n;
        else {
          const heap = newThing(st, kind, at % size, Math.floor(at / size));
          heap.n = n;
          st.things.push(heap);
        }
      }
      if (st.raid) {
        st.raid.took[k] = Math.max(0, st.raid.took[k] - n);
        st.raid.loot[k] = Math.max(0, st.raid.loot[k] - n);
      }
    }
    p.sack = undefined;
    if (p.job) p.job.n = 0;
  }

  /** po której stronie siatki: true na podwórku, w budynku siedziby i w otwartej dziurze albo bramie; bez siatki jedna strona */
  private insideAt(tile: number): boolean {
    if (!this.st.fence) return true;
    return (
      this.yardMask[tile] === 1 ||
      (!!this.house && this.roomOf[tile] >= 0) ||
      (this.fenceMask[tile] === 1 && !this.blocked[tile])
    );
  }

  /** a i b po różnych stronach siatki */
  private across(a: Pawn, bx: number, by: number): boolean {
    const size = this.w.size;
    return this.insideAt(this.tileOf(a)) !== this.insideAt(Math.floor(by) * size + Math.floor(bx));
  }

  /** obrażenia: ludzie z potrzebami tracą zdrowie, reszta życie; ranny szabrownik ucieka */
  private hurt(t: Pawn, dmg: number, by: Pawn | null): void {
    this.addFx('trafienie', t.x, t.y);
    if (t.needs) {
      t.needs.health = Math.max(0, t.needs.health - dmg);
      if (t.needs.health <= 0) this.die(t, 'rany', by);
      return;
    }
    // szabrownik ze starego zapisu nie ma pola hp (szwendacze mają je zawsze)
    t.hp = (t.hp ?? STRANGER_HP) - dmg;
    if (t.hp <= 0) this.die(t, 'rany', by);
    else if (t.kind === 'szabrownik' && t.hp < FLEE_HP && this.st.raid && t.job && t.job.phase < 3)
      this.leaveRaid(t, this.st.raid);
  }

  /** Śmierć: pionek znika po kroku, zostają zwłoki (człowiek) albo trup (szwendacz) i krew. Śmierć kogoś z naszych
      boli wszystkich, zabicie człowieka boli tego, kto zabił. */
  private die(p: Pawn, cause: Dead['cause'], by: Pawn | null): void {
    const st = this.st;
    if (this.graveyard.has(p.id)) return;
    this.graveyard.add(p.id);
    const tick = st.tick;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    // na wyprawie: umiera poza mapą, bez zwłok i krwi przy bramie
    const away = p.away;
    this.release(p);
    if (p.sack) this.dropSack(p);
    if (!away) {
      this.addFx('smierc', p.x, p.y);
      this.dropLoad(p);
      this.dropCarry(p);
      this.addBlood(x, y);
    }
    // broń zmarłego ktoś podnosi i odnosi do magazynu
    if (p.weapon) {
      st.store.arms?.push(p.weapon);
      p.weapon = null;
    }
    if (p.kind === 'zombie') {
      const body = newThing(st, 'trup', x, y);
      body.n = p.look;
      body.until = tick + CORPSE_TICKS;
      st.things.push(body);
      st.tally!.killed++;
      return;
    }
    const who = p.person >= 0 ? st.people[p.person] : undefined;
    const name = who?.name ?? (p.kind === 'szabrownik' ? 'Szabrownik' : 'Mieszkaniec');
    // id tylko dla zarządu: mieszkaniec z osobą ma imię, ale dla zarządu (GovInput.dead) zostaje mieszkańcem
    st.dead!.push({ id: p.kind === 'core' ? (who?.id ?? '') : '', name, look: p.look, kind: p.kind, tick, cause });
    if (away) {
      st.tally!.deaths++;
      const first = who?.first ?? 'sąsiad';
      for (const q of st.pawns)
        if (q !== p && q.needs && !q.away && !this.graveyard.has(q.id))
          this.addMood(q, `Śmierć: ${first}`, -10, TICKS_PER_DAY);
      return;
    }
    const body = newThing(st, 'zwloki', x, y);
    body.n = p.look;
    body.dead = st.dead!.length - 1;
    body.until = tick + BODY_TICKS;
    // w trybie zombie każdy zmarły wstaje, chyba że ktoś go dobije
    if (modeOf(st) === 'zombie') body.fuel = tick + RISE_TICKS;
    st.things.push(body);
    if (p.kind === 'szabrownik') {
      st.tally!.killed++;
      if (by?.needs) this.addMood(by, 'Zabiłem człowieka', -6, TICKS_PER_DAY);
      return;
    }
    st.tally!.deaths++;
    const first = who?.first ?? 'sąsiad';
    for (const q of st.pawns)
      if (q !== p && q.needs && !q.away && !this.graveyard.has(q.id))
        this.addMood(q, `Śmierć: ${first}`, -10, TICKS_PER_DAY);
  }

  private addNoise(x: number, y: number, r: number): void {
    const st = this.st;
    st.noise!.push({ x: round2(x), y: round2(y), r, until: st.tick + NOISE_TICKS });
    if (st.noise!.length > 20) st.noise!.shift();
  }

  private addFx(t: Fx['t'], x: number, y: number, tx?: number, ty?: number): void {
    const st = this.st;
    const f: Fx = { t, x: round2(x), y: round2(y), tick: st.tick };
    if (tx !== undefined && ty !== undefined) {
      f.tx = round2(tx);
      f.ty = round2(ty);
    }
    st.fx!.push(f);
    if (st.fx!.length > 40) st.fx!.shift();
  }

  /** plama krwi na kafelku (najwyżej 40 naraz, najstarsza znika) */
  private addBlood(x: number, y: number): void {
    const st = this.st;
    const blood = newThing(st, 'krew', x, y);
    blood.until = st.tick + BLOOD_TICKS;
    st.things.push(blood);
    const all = st.things.filter((t) => t.kind === 'krew');
    if (all.length > BLOOD_MAX) st.things.splice(st.things.indexOf(all[0]), 1);
  }

  /** Walka: w zasięgu bije (co tyle kroków, ile każe broń), poza zasięgiem idzie do wroga (droga od nowa co sekundę).
      Koniec, gdy wróg zginie, zniknie albo przez 20 sekund nie da się go uderzyć. Kto w trakcie walki ze szwendaczem
      zostanie z gołymi rękami (odłożona broń, koniec amunicji), kończy walkę, a gdy szwendacz jest po tej samej
      stronie siatki, wycofuje się do mieszkania zarządu. */
  private fightTick(p: Pawn, j: Job): void {
    const tick = this.st.tick;
    const t = this.enemy(j.target);
    const w = this.armed(p);
    const bare = t?.kind === 'zombie' && w.id === 'piesci' && j.what !== 'piesci';
    if (!t || tick > j.until || bare) {
      p.path = [];
      p.pi = 0;
      if (!t || !bare || this.across(p, t.x, t.y) || !this.retreat(p)) this.done(p);
      return;
    }
    // walka bez rozkazu z bronią palną w trybie zombie kończy się, kiedy wróg jest za siatką
    if (!j.order && this.holdFire(w) && this.across(p, t.x, t.y)) {
      p.path = [];
      p.pi = 0;
      this.done(p);
      return;
    }
    if (this.canHit(p, t, w)) {
      p.path = [];
      p.pi = 0;
      j.phase = 1;
      if (tick >= (p.cd ?? 0)) {
        this.strike(p, t, w);
        j.until = tick + FIGHT_GIVEUP;
      } else this.face(p, t.x, t.y);
      return;
    }
    j.phase = 0;
    // wróg za siatką: nikt nie wychodzi; dzida, kusza i broń palna podchodzą do siatki od swojej strony,
    // reszta odpuszcza
    if (this.across(p, t.x, t.y)) {
      if (!w.fence) {
        p.path = [];
        p.pi = 0;
        this.done(p);
        return;
      }
      if (p.pi >= p.path.length || tick % THINK_EVERY === 0) {
        const stand = this.fenceStand(p, t);
        if (stand < 0) {
          this.done(p);
          return;
        }
        if (stand !== this.tileOf(p) && stand !== j.tile) this.go(p, stand);
        j.tile = stand;
      }
      if (p.pi < p.path.length) this.walk(p);
      return;
    }
    if (p.pi >= p.path.length || tick % THINK_EVERY === 0) {
      const g = this.goalFor(p, this.tileOf(t));
      if (g >= 0 && g !== this.tileOf(p)) this.routeTo(p, g);
      j.tile = g;
    }
    if (p.pi < p.path.length) this.walk(p);
  }

  /** miejsce po stronie podwórka przy kafelku siatki najbliżej wroga za siatką (−1: nie ma gdzie stanąć) */
  private fenceStand(p: Pawn, t: Pawn): number {
    const size = this.w.size;
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.fenceMask.length; i++) {
      if (!this.fenceMask[i]) continue;
      const d = Math.hypot((i % size) + 0.5 - t.x, Math.floor(i / size) + 0.5 - t.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return -1;
    const s = this.standBy(p, [best], 1);
    return s >= 0 ? s : this.standBy(p, [best], 2);
  }

  /** W trybie zombie broń palna sama nie strzela przez siatkę, bo strzał ściąga stado: tylko po swojej stronie siatki
      i na rozkaz gracza („Atakuj”). */
  private holdFire(w: Weapon): boolean {
    return modeOf(this.st) === 'zombie' && isFirearm(w);
  }

  /** broń tak, jak sięga sama z siebie (warta, pilnowanie naporu): w trybie zombie broń palna nie przez siatkę */
  private selfReach(w: Weapon): Weapon {
    return this.holdFire(w) ? { ...w, fence: false } : w;
  }

  /** warta na posterunku: najbliższy wróg w zasięgu broni (w trybie zombie z bronią palną tylko po swojej stronie) */
  private guardStrike(p: Pawn): void {
    if (this.st.tick < (p.cd ?? 0)) return;
    const w = this.armed(p);
    const reach = this.selfReach(w);
    let best: Pawn | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.pawns) {
      if (!isEnemy(t) || t.away || this.graveyard.has(t.id)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bd && this.canHit(p, t, reach)) {
        bd = d;
        best = t;
      }
    }
    if (best) this.strike(p, best, w);
  }

  /** czy na podwórku jest teraz wróg (szwendacz, szabrownik), liczone raz na krok */
  private yardDanger(): boolean {
    const st = this.st;
    if (this.dangerAt === st.tick) return this.danger;
    this.dangerAt = st.tick;
    this.danger = st.pawns.some(
      (p) => isEnemy(p) && !p.away && !this.graveyard.has(p.id) && this.yardMask[this.tileOf(p)] === 1,
    );
    return this.danger;
  }

  /** najbliższy wróg w promieniu r, którego widać bez siatki i ściany po drodze (ta sama strona siatki) */
  private threat(p: Pawn, r: number): Pawn | undefined {
    let best: Pawn | undefined;
    let bd = r;
    for (const t of this.st.pawns) {
      if (!isEnemy(t) || t.away || this.graveyard.has(t.id)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d <= bd && this.lineCheck(p.x, p.y, t.x, t.y) === 'clear') {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Wróg blisko kogoś na dworze: zarząd z bronią i zdrowiem ponad 40 walczy, reszta ucieka do domu. W środku
      (pomieszczenia siedziby) jest bezpiecznie. true: pionek dostał nową pracę. */
  private react(p: Pawn): boolean {
    const j = p.job;
    // warta i walczący: odwrót do środka, gdy wróg jest tuż obok po tej samej stronie, a sił mało albo wrogów kilku
    if (j && (j.t === 'guard' || j.t === 'fight')) {
      const close = this.threat(p, 1.6);
      if (!close) return false;
      let crowd = 0;
      for (const t of this.st.pawns)
        if (
          isEnemy(t) &&
          !t.away &&
          Math.hypot(t.x - p.x, t.y - p.y) <= 2 &&
          this.lineCheck(p.x, p.y, t.x, t.y) === 'clear'
        )
          crowd++;
      if ((p.needs?.health ?? 100) >= (j.t === 'guard' ? 50 : 30) && crowd < 3) return false;
      return this.retreat(p);
    }
    if (j && (j.t === 'leave' || j.t === 'amputate')) return false;
    // uzbrojony, który czeka albo grzeje się w pobliżu zwłok, dobija je odruchowo, zanim wstaną
    if (
      p.kind === 'core' &&
      p.weapon &&
      (!j || j.t === 'go' || j.t === 'warm' || j.t === 'stay') &&
      !this.threat(p, DEFEND_REACH) &&
      this.startFinish(p, this.yardDanger())
    )
      return true;
    const inside = this.inRoom(this.tileOf(p));
    const resident = p.kind === 'resident';
    let e = this.threat(p, resident ? RESIDENT_FLEE : DEFEND_REACH);
    // w środku straszy tylko wróg, który też jest w środku (wstał ze zwłok)
    const indoorFoe = !!e && this.inRoom(this.tileOf(e));
    if (inside && !indoorFoe) e = undefined;
    if (inside && !e) return false;
    // mieszkańcy na podwórku wracają do domu, kiedy wróg jest gdziekolwiek na podwórku
    const outdoors = resident && j?.t === 'stay' && (j.target === STAY_YARD || j.target === STAY_FIRE);
    if (!e && !(outdoors && this.yardDanger())) return false;
    if (j?.t === 'stay' && j.target === STAY_HOME && !indoorFoe) return false;
    if (e && !resident && p.weapon && this.armed(p).id !== 'piesci' && (p.needs?.health ?? 0) > 40) {
      this.startFight(p, e.id, false);
      return true;
    }
    if (j?.t === 'go' && !j.order && this.inRoom(j.tile) && !indoorFoe) return false;
    // przed wrogiem w budynku ucieka się na podwórko (jeśli tam spokojnie), przed wrogiem na dworze do domu
    const yardOk = indoorFoe && !this.yardDanger();
    const spot = yardOk
      ? this.pickSpot(p, fenceShape(this.w)?.yard ?? [])
      : resident
        ? this.homeSpot(p)
        : this.shelterSpot(p);
    if (spot < 0 || !this.go(p, spot)) return false;
    const run = this.newJob(resident ? 'stay' : 'go', resident ? STAY_HOME : spot, spot, false);
    run.until = this.st.tick + 600;
    this.setJob(p, run, false);
    return true;
  }

  /** schronienie dla zarządu: kafelek w mieszkaniu zarządu */
  private shelterSpot(p: Pawn): number {
    const h = this.house;
    if (!h) return -1;
    const tiles: number[] = [];
    for (const r of h.rooms) if (r.apt === h.home) tiles.push(...this.roomTiles[r.id]);
    return this.pickSpot(p, tiles);
  }

  /* ---------- szwendacze ---------- */

  /** liczba szwendaczy na mapie */
  private zombieCount(): number {
    let n = 0;
    for (const p of this.st.pawns) if (p.kind === 'zombie') n++;
    return n;
  }

  /** Zegar trybu zombie: za dnia co godzinę uzupełnienie snujących się, o 21:00 stado (grupy z okolicy
      do 1:00), o 6:00 stado się rozchodzi. */
  private zombieClock(): void {
    const st = this.st;
    const tick = st.tick;
    const hourStart = tick % TICKS_PER_HOUR === 0;
    const h = hourOf(tick);
    const day = dayOf(tick);
    if (hourStart && h >= DISPERSE && h < HORDE_FROM) this.topUp(day);
    // o 21:00 stado: najpierw ci, którzy już się snują (poza budynkami), a z okolicy tylko brakująca reszta
    if (hourStart && h === HORDE_FROM) {
      const want = hordeSize(day);
      let have = 0;
      for (const p of st.pawns) {
        if (have >= want) break;
        if (p.kind !== 'zombie' || !p.job || p.job.what === 'stado' || this.inRoom(this.tileOf(p))) continue;
        p.job.what = 'stado';
        if (p.job.phase === 0) p.job.phase = 1;
        have++;
      }
      st.horde = { day, left: want - have, next: tick };
    }
    const hd = st.horde;
    if (hd && hd.left > 0 && tick >= hd.next) {
      const groups = 8;
      const n = Math.min(hd.left, Math.ceil(hordeSize(hd.day) / groups));
      hd.left -= n;
      hd.next = tick + Math.floor((HORDE_HOURS * TICKS_PER_HOUR) / groups);
      const room = MAX_ZOMBIES - this.zombieCount();
      const from = this.ring.length ? this.ring : this.edges;
      if (room > 0 && from.length) {
        const at = from[Math.floor(nextRandom(st.rng) * from.length)];
        for (const t of this.tilesAround(at, Math.min(n, room)))
          spawnZombie(st, this.w, t, Math.floor(nextRandom(st.rng) * 16), true);
      }
    }
    if (hourStart && h === DISPERSE)
      for (const p of st.pawns) {
        if (p.kind !== 'zombie' || !p.job) continue;
        p.job.what = '';
        if (p.job.phase === 1 || p.job.phase === 2) {
          p.job.phase = 0;
          p.path = [];
          p.pi = 0;
        }
      }
  }

  /** za dnia: do ambientCount(dzień) snujących się w pasie przy siatce; gdy brakuje ponad połowy, od razu wszyscy */
  private topUp(day: number): void {
    const st = this.st;
    const have = this.zombieCount();
    const want = Math.min(ambientCount(day), MAX_ZOMBIES);
    if (have >= want) return;
    const n = have < want / 2 ? want - have : Math.min(3, want - have);
    for (let k = 0; k < n; k++) {
      const t = this.farTile();
      if (t < 0) break;
      spawnZombie(st, this.w, t, Math.floor(nextRandom(st.rng) * 16));
    }
  }

  /** losowy kafelek z pasa FAR–NEAR metrów drogi od siatki, także w linii prostej co najmniej FAR (droga za rogiem
      budynku bywa dłuższa); bez pasa: przy krawędzi mapy */
  private farTile(): number {
    const size = this.w.size;
    const from = this.band.length ? this.band : this.edges;
    if (!from.length) return -1;
    let i = -1;
    for (let k = 0; k < 20; k++) {
      i = from[Math.floor(nextRandom(this.st.rng) * from.length)];
      const x = (i % size) + 0.5;
      const y = Math.floor(i / size) + 0.5;
      if (this.seeds.every((s) => Math.hypot((s % size) + 0.5 - x, Math.floor(s / size) + 0.5 - y) >= FAR)) return i;
    }
    return i;
  }

  /** ofiara: człowiek na mapie; indoor: także w pomieszczeniach (dla szwendacza, który jest w środku) */
  private isPrey(q: Pawn, indoor = false): boolean {
    return (
      (q.kind === 'core' || q.kind === 'resident' || q.kind === 'szabrownik') &&
      !q.away &&
      !this.graveyard.has(q.id) &&
      (indoor || !this.inRoom(this.tileOf(q)))
    );
  }

  /** najbliższa widziana ofiara: 10 m za dnia, nocą 5 m (10 m, gdy stoi w świetle); przez siatkę widać, przez ścianę nie */
  private seePrey(p: Pawn): Pawn | undefined {
    const day = daylight(this.st.tick) >= 0.5;
    const indoor = this.inRoom(this.tileOf(p));
    let best: Pawn | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const q of this.st.pawns) {
      if (!this.isPrey(q, indoor)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d >= bd || d > SIGHT_DAY) continue;
      if (!day && d > SIGHT_NIGHT && !this.litNear(q.x, q.y)) continue;
      if (this.lineCheck(p.x, p.y, q.x, q.y) === 'wall') continue;
      bd = d;
      best = q;
    }
    return best;
  }

  /** kafelek tuż za siatką najbliżej punktu */
  private nearestSeed(x: number, y: number): number {
    const size = this.w.size;
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const s of this.seeds) {
      const d = ((s % size) + 0.5 - x) ** 2 + (Math.floor(s / size) + 0.5 - y) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** najbliższy słyszany hałas */
  private heard(p: Pawn): Noise | undefined {
    let best: Noise | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const n of this.st.noise ?? []) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d <= n.r && d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Zmysły szwendacza (co sekundę): widzi ofiarę po tej samej stronie siatki, to goni; za siatką idzie pod siatkę
      naprzeciw niej; słyszy hałas, to idzie na hałas; stado idzie do siatki. */
  private zombieSense(p: Pawn, j: Job): void {
    const size = this.w.size;
    const prey = this.seePrey(p);
    if (prey) {
      const { blocked, reg } = this.zlay(p);
      const pt = this.tileOf(prey);
      const same = reg[nearestFree(blocked, size, this.tileOf(p))] === reg[nearestFree(blocked, size, pt)];
      if (same) {
        j.phase = 3;
        j.target = prey.id;
        if (this.zbudget > 0) {
          this.zbudget--;
          this.routeTo(p, this.goalFor(p, pt));
        }
        return;
      }
      if (j.phase === 2 && Math.hypot(prey.x - p.x, prey.y - p.y) <= 4) return;
      if (this.zbudget > 0 && (j.phase !== 1 || p.pi >= p.path.length)) {
        const seed = this.nearestSeed(prey.x, prey.y);
        this.zbudget--;
        if (seed >= 0 && seed !== this.tileOf(p) && this.go(p, seed)) {
          j.phase = 1;
          j.target = -1;
        }
      }
      return;
    }
    if (j.phase === 3) {
      j.phase = j.what === 'stado' ? 1 : 0;
      j.target = -1;
      p.path = [];
      p.pi = 0;
    }
    const n = this.heard(p);
    if (n && j.phase !== 4 && j.phase !== 2 && this.zbudget > 0) {
      this.zbudget--;
      const g = this.goalFor(p, Math.floor(n.y) * size + Math.floor(n.x));
      if (g >= 0 && this.routeTo(p, g)) j.phase = 4;
      return;
    }
    if (j.phase === 0 && j.what === 'stado') j.phase = 1;
  }

  /** krok szwendacza: gryzie ofiarę w zasięgu, co sekundę patrzy i słucha, idzie, a gdy stoi, robi swoje w fazie */
  private zombieTick(p: Pawn): void {
    const st = this.st;
    const tick = st.tick;
    if (!p.job) p.job = this.newJob('zombie', -1, this.tileOf(p), false);
    const j = p.job;
    if (this.sealed(this.tileOf(p))) this.pushOut(p, j);
    if (j.phase === 3) {
      const t = st.pawns.find((q) => q.id === j.target);
      if (
        t &&
        this.isPrey(t, true) &&
        Math.hypot(t.x - p.x, t.y - p.y) <= BITE_REACH + 0.2 &&
        this.lineCheck(p.x, p.y, t.x, t.y) === 'clear'
      ) {
        p.path = [];
        p.pi = 0;
        this.face(p, t.x, t.y);
        // najpierw łapie (pół przerwy między ugryzieniami), potem gryzie
        if (!j.n) {
          j.n = 1;
          p.cd = Math.max(p.cd ?? 0, tick + BITE_CD / 2);
        } else if (tick >= (p.cd ?? 0)) this.bite(p, t);
        return;
      }
      j.n = 0;
    }
    if ((tick + p.id) % THINK_EVERY === 0) this.zombieSense(p, j);
    if (p.pi < p.path.length) {
      this.walk(p);
      return;
    }
    const size = this.w.size;
    const here = this.tileOf(p);
    switch (j.phase) {
      case 0:
        if (tick >= p.wait) this.drift(p);
        return;
      case 1: {
        const f = this.flow[here] ?? -1;
        if (f < 0) {
          j.phase = 0;
          return;
        }
        if (f === 0) {
          const t = this.fenceNear(here);
          if (t >= 0) {
            j.phase = 2;
            j.target = t;
            this.face(p, (t % size) + 0.5, Math.floor(t / size) + 0.5);
          } else j.phase = 0;
          return;
        }
        this.descend(p);
        return;
      }
      case 2: {
        const t = j.target;
        if (t < 0) {
          j.phase = 1;
          return;
        }
        // siatka puściła: stado wlewa się na podwórko
        if (!this.blocked[t]) {
          this.pour(p);
          return;
        }
        this.damageFence(t, PUSH);
        return;
      }
      case 4:
        j.phase = j.what === 'stado' ? 1 : 0;
        return;
      default:
        // goni, a droga się skończyła: czeka na zmysły
        return;
    }
  }

  /** kafelek siatki albo bramy, przez który teraz nie da się przejść (cała siatka, łata, zasieki, zamknięta brama) */
  private sealed(tile: number): boolean {
    return this.fenceMask[tile] === 1 && this.blocked[tile] === 1;
  }

  /** Szwendacz w dziurze albo bramie, którą właśnie zamknięto: łata wypycha go na najbliższy wolny kafelek po stronie
      ulicy, także gdy szedł z podwórka, i zaczyna od nowa (stado znowu idzie pod siatkę). */
  private pushOut(p: Pawn, j: Job): void {
    const size = this.w.size;
    const out = nearestFree(this.lay.outside.blocked, size, this.tileOf(p));
    p.x = (out % size) + 0.5;
    p.y = Math.floor(out / size) + 0.5;
    p.path = [];
    p.pi = 0;
    j.phase = j.what === 'stado' ? 1 : 0;
    j.target = -1;
    j.n = 0;
  }

  /** ugryzienie: trafia w 70% przypadków, 15 obrażeń */
  private bite(p: Pawn, t: Pawn): void {
    const st = this.st;
    p.cd = st.tick + BITE_CD;
    this.addFx('ugryzienie', t.x, t.y, p.x, p.y);
    const facing = t.job?.t === 'fight' || (t.job?.t === 'guard' && t.job.phase === 1);
    if (nextRandom(st.rng) >= (facing ? BITE_HIT_FIGHTING : BITE_HIT)) return;
    st.tally!.bites++;
    this.hurt(t, BITE_DMG, p);
    if (this.graveyard.has(t.id) || modeOf(st) !== 'zombie') return;
    if (nextRandom(st.rng) < BITE_INFECT) infect(st, t, nextRandom(st.rng) < LIMB);
  }

  /** snucie się: kilka kroków w losową stronę po przechodnich kafelkach; co któryś krok ku siatce (ściągają się pod
      nią przez dzień), a dalej niż NEAR od siatki każdy */
  private drift(p: Pawn): void {
    const st = this.st;
    const size = this.w.size;
    const { blocked } = this.zlay(p);
    let c = this.tileOf(p);
    const path: number[] = [];
    const n = 3 + Math.floor(nextRandom(st.rng) * 6);
    for (let k = 0; k < n; k++) {
      const x = c % size;
      let opts = [c - size, c + size, x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1].filter(
        (q) => q >= 0 && q < size * size && !blocked[q] && !path.includes(q),
      );
      const f = this.flow[c] ?? -1;
      if (f > NEAR || (f > 1 && nextRandom(st.rng) < DAY_PULL)) {
        const closer = opts.filter((q) => this.flow[q] >= 0 && this.flow[q] < f);
        if (closer.length) opts = closer;
      }
      if (!opts.length) break;
      c = opts[Math.floor(nextRandom(st.rng) * opts.length)];
      path.push(c);
    }
    p.path = path;
    p.pi = 0;
    p.wait = st.tick + 60 + Math.floor(nextRandom(st.rng) * 200);
  }

  /** do siatki po polu odległości: do 8 kroków coraz bliżej (losowo między równymi) */
  private descend(p: Pawn): void {
    const st = this.st;
    const size = this.w.size;
    const { blocked } = this.lay.zombie;
    let c = this.tileOf(p);
    const path: number[] = [];
    for (let k = 0; k < 8 && this.flow[c] > 0; k++) {
      const x = c % size;
      const want = this.flow[c] - 1;
      const opts = [c - size, c + size, x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1].filter(
        (q) => q >= 0 && q < size * size && !blocked[q] && this.flow[q] === want,
      );
      if (!opts.length) break;
      c = opts[Math.floor(nextRandom(st.rng) * opts.length)];
      path.push(c);
    }
    if (!path.length && p.job) p.job.phase = 0;
    p.path = path;
    p.pi = 0;
  }

  /** kafelek siatki obok (najpierw siatka, potem brama) albo −1 */
  private fenceNear(i: number): number {
    const size = this.w.size;
    const x = i % size;
    const ns = [i - size, i + size, x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1].filter(
      (q) => q >= 0 && q < size * size && this.fenceMask[q],
    );
    const wire = ns.filter((q) => this.fenceIndex.has(q));
    const list = wire.length ? wire : ns;
    return list.length ? list[Math.floor(nextRandom(this.st.rng) * list.length)] : -1;
  }

  /** siatka puściła: szwendacz wchodzi kilka metrów na podwórko i się tam snuje */
  private pour(p: Pawn): void {
    const st = this.st;
    const size = this.w.size;
    const shape = fenceShape(this.w);
    const { blocked } = this.lay.zombie;
    const cand = (shape?.yard ?? []).filter(
      (i) => !blocked[i] && Math.hypot((i % size) + 0.5 - p.x, Math.floor(i / size) + 0.5 - p.y) <= 6,
    );
    if (p.job) {
      p.job.phase = 0;
      p.job.target = -1;
    }
    if (!cand.length) return;
    this.go(p, cand[Math.floor(nextRandom(st.rng) * cand.length)]);
  }

  /** Napór albo cios w siatkę: łata traci wytrzymałość, a przy zerze dziura znowu jest otwarta; zwykły kafelek siatki
      przy zerze staje się nową dziurą (łata się ją tak samo). Brama nie puszcza. */
  damageFence(tile: number, amount: number): void {
    const f = this.st.fence;
    if (!f) return;
    const hole = f.holes.find((h) => h.tiles.includes(tile));
    if (hole) {
      if (hole.patch <= 0) return;
      hole.patch = Math.max(0, hole.patch - amount);
      if (hole.patch === 0) {
        this.wreckZasieki(hole.tiles);
        this.breach();
      }
      return;
    }
    const k = this.fenceIndex.get(tile);
    if (k === undefined || f.hp[k] <= 0) return;
    f.hp[k] = Math.max(0, f.hp[k] - amount);
    if (f.hp[k] > 0) return;
    this.wreckZasieki([tile]);
    const id = f.holes.reduce((m, h) => Math.max(m, h.id), 0) + 1;
    f.holes.push({ id, tiles: [tile], size: 0.6, patch: 0 });
    this.breach();
  }

  private breach(): void {
    this.st.tally!.breaches++;
    this.rebuild();
  }

  /** Zasieki (M2) na kafelkach, które napór zbił do zera: zniszczone, bez zwrotu materiału, żeby widok pokazał
      dziurę, a rozbiórka nie łatała przerwania za darmo. */
  private wreckZasieki(tiles: readonly number[]): void {
    const st = this.st;
    const size = this.w.size;
    let gone = false;
    for (let k = st.things.length - 1; k >= 0; k--) {
      const t = st.things[k];
      if (t.kind !== 'zasieki' || !tiles.includes(t.y * size + t.x)) continue;
      st.things.splice(k, 1);
      gone = true;
    }
    if (gone) this.updateCap();
  }

  /** n szwendaczy ze stada tuż za siatką, najbliżej kafelka near (do podglądu ?stado= i testów); zwraca ilu */
  spawnAtFence(n: number, near: number): number {
    const size = this.w.size;
    const nx = (near % size) + 0.5;
    const ny = Math.floor(near / size) + 0.5;
    const spots = [...this.seeds].sort(
      (a, b) =>
        Math.hypot((a % size) + 0.5 - nx, Math.floor(a / size) + 0.5 - ny) -
          Math.hypot((b % size) + 0.5 - nx, Math.floor(b / size) + 0.5 - ny) || a - b,
    );
    const room = Math.max(0, Math.min(n, MAX_ZOMBIES - this.zombieCount()));
    let k = 0;
    for (; k < room && spots.length; k++) spawnZombie(this.st, this.w, spots[k % spots.length], k % 16, true);
    return k;
  }

  /* ---------- praca za dnia: dzidy, wzmacnianie siatki, alarm ---------- */

  /** sterty, które pionek może wziąć: jego albo niczyje */
  private freeHeaps(p: Pawn, kind: string): Thing[] {
    return this.st.things.filter((t) => t.kind === kind && t.n > 0 && (t.by < 0 || t.by === p.id));
  }

  /** czy na wolnych stertach starczy każdego materiału */
  private haveHeaps(p: Pawn, need: readonly [string, number][]): boolean {
    return need.every(([kind, n]) => this.freeHeaps(p, kind).reduce((a, t) => a + t.n, 0) >= n);
  }

  /** materiał ze stert: n sztuk danego rodzaju (najpierw ze sterty first), false, gdy nie starczy */
  private takeHeaps(p: Pawn, kind: string, n: number, first: number): boolean {
    const st = this.st;
    const heaps = this.freeHeaps(p, kind).sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : a.id - b.id));
    if (heaps.reduce((a, t) => a + t.n, 0) < n) return false;
    let left = n;
    for (const t of heaps) {
      const k = Math.min(t.n, left);
      t.n -= k;
      left -= k;
      if (t.by >= 0) t.by = -1;
      if (left <= 0) break;
    }
    st.things = st.things.filter((t) => !(t.kind === kind && t.n <= 0));
    return true;
  }

  /** dzida: do sterty desek, potem godzina pracy na miejscu */
  private orderCraft(pawns: Pawn[]): void {
    const p = pawns[0];
    if (
      !this.haveHeaps(p, [
        ['deski', SPEAR_BOARDS],
        ['zlom', SPEAR_SCRAP],
      ])
    )
      return;
    const heap = this.heapFor(p, 'deski');
    if (!heap) return;
    const ht = heap.y * this.w.size + heap.x;
    if (!this.go(p, ht)) return;
    const j = this.newJob('craft', -1, ht, true);
    j.from = heap.id;
    this.setJob(p, j, false);
    heap.by = p.id;
  }

  /** wzmocnienie kafelka siatki: po materiał na stertę (2 sztuki jednego rodzaju), potem do siatki od podwórka */
  private orderBrace(pawns: Pawn[], tile: number): void {
    const f = this.st.fence;
    const k = this.fenceIndex.get(tile);
    if (!f || k === undefined || f.hp[k] <= 0 || f.hp[k] >= 100) return;
    if (f.holes.some((h) => h.tiles.includes(tile))) return;
    const p = pawns[0];
    const heap = this.heapFor(p, '', BRACE_COST);
    if (!heap) return;
    const ht = heap.y * this.w.size + heap.x;
    if (!this.go(p, ht)) return;
    const j = this.newJob('brace', tile, ht, true);
    j.from = heap.id;
    this.setJob(p, j, false);
    heap.by = p.id;
  }

  /** Do broni: każdy z zarządu ze zdrowiem ponad 30, kto nie stoi już na warcie, na wartę z alarmu (do 6:00 jak
      każda warta). Odwołanie: warta z alarmu schodzi z posterunku, reszta warty zostaje. */
  private orderAlarm(pawns: Pawn[], off: boolean): void {
    if (off) {
      for (const p of pawns)
        if (p.job?.t === 'guard' && p.job.what === ALARM_JOB) {
          p.path = [];
          p.pi = 0;
          this.done(p);
        }
      return;
    }
    const able = pawns.filter((p) => (p.needs?.health ?? 0) > 30 && p.job?.t !== 'guard');
    if (!able.length) return;
    this.orderGuard(able, modeOf(this.st) === 'zombie' && this.st.fence ? 'siatka' : 'brama');
    for (const p of able) if (p.job?.t === 'guard') p.job.what = ALARM_JOB;
  }

  /** Kafelek siatki, na który napiera najwięcej szwendaczy (−1: nikt nie napiera). Brama nie puszcza, więc napór
      na nią się nie liczy. Dla wartownika p: najpierw miejsca, których nie pilnuje już inna warta przy siatce
      (do 3 m od niej albo od miejsca, do którego idzie). */
  private hotTile(p?: Pawn): number {
    const size = this.w.size;
    const count = new Map<number, number>();
    for (const q of this.st.pawns)
      if (q.kind === 'zombie' && q.job?.phase === 2 && this.fenceIndex.has(q.job.target))
        count.set(q.job.target, (count.get(q.job.target) ?? 0) + 1);
    const others = p
      ? this.st.pawns.filter((q) => q !== p && !q.away && q.job?.t === 'guard' && q.job.target === SIATKA_POST)
      : [];
    const near = (t: number, x: number, y: number) =>
      Math.hypot((t % size) + 0.5 - x, Math.floor(t / size) + 0.5 - y) <= 3;
    const kept = (t: number) =>
      others.some(
        (q) =>
          near(t, q.x, q.y) ||
          (q.job!.tile >= 0 && near(t, (q.job!.tile % size) + 0.5, Math.floor(q.job!.tile / size) + 0.5)),
      );
    let best = -1;
    let bn = 0;
    let free = -1;
    let fn = 0;
    for (const [t, n] of count) {
      if (n > bn || (n === bn && t < best)) {
        best = t;
        bn = n;
      }
      if (!kept(t) && (n > fn || (n === fn && t < free))) {
        free = t;
        fn = n;
      }
    }
    return free >= 0 ? free : best;
  }

  /** Warta przy siatce przechodzi do miejsca największego naporu, kiedy jej broń nie sięga nikogo, kto tam napiera
      (na rogu siatki 2,2 m od kafelka to już za daleko na dzidę), i staje tuż przy nim od strony podwórka. */
  private followPressure(p: Pawn, j: Job): void {
    const hot = this.hotTile(p);
    if (hot < 0) return;
    const w = this.armed(p);
    const reach = this.selfReach(w);
    for (const z of this.st.pawns)
      if (z.kind === 'zombie' && z.job?.phase === 2 && z.job.target === hot && this.canHit(p, z, reach)) return;
    let stand = this.standBy(p, [hot], 1);
    if (stand < 0) stand = this.standBy(p, [hot], 2);
    if (stand < 0 || stand === this.tileOf(p) || !this.go(p, stand)) return;
    j.tile = stand;
    j.phase = 0;
  }

  /* ---------- zakażenie, wstawanie, dobijanie, amputacja ---------- */

  /** zwłoki, którym minął czas, wstają jako szwendacze (w tym samym wyglądzie) */
  private rise(): void {
    const st = this.st;
    const up = st.things.filter((t) => t.kind === 'zwloki' && t.fuel > 0 && st.tick >= t.fuel);
    for (const body of up) {
      st.things.splice(st.things.indexOf(body), 1);
      const z = spawnZombie(st, this.w, body.y * this.w.size + body.x, body.n);
      this.addFx('smierc', z.x, z.y);
    }
  }

  /** sam z siebie: najbliższe zwłoki do 12 m, które wstaną i których nikt jeszcze nie dobija */
  private startFinish(p: Pawn, indoorOnly: boolean): boolean {
    let body: Thing | undefined;
    let bd = 12;
    for (const t of this.st.things) {
      if (t.kind !== 'zwloki' || t.fuel <= 0) continue;
      if (indoorOnly && !this.inRoom(t.y * this.w.size + t.x)) continue;
      // nie za siatkę
      if (this.across(p, t.x + 0.5, t.y + 0.5)) continue;
      const d = Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - p.y);
      if (d > bd || this.st.pawns.some((q) => q.job?.t === 'finish' && q.job.target === t.id)) continue;
      bd = d;
      body = t;
    }
    if (!body) return false;
    const stand = this.beside(p, body);
    if (stand < 0 || !this.go(p, stand)) return false;
    this.setJob(p, this.newJob('finish', body.id, stand, false), false);
    return true;
  }

  /** dobić zwłoki: pierwsza osoba idzie obok i wbija nóż */
  private orderFinish(pawns: Pawn[], id: number): void {
    const body = this.thing(id);
    if (body?.kind !== 'zwloki' || body.fuel <= 0) return;
    const p = pawns[0];
    const stand = this.beside(p, body);
    if (stand < 0 || !this.go(p, stand)) return;
    this.setJob(p, this.newJob('finish', id, stand, true), false);
  }

  /** amputacja: chory ugryziony w rękę albo nogę, najwyżej AMPUTATE_WINDOW po ugryzieniu */
  private orderAmputate(pawns: Pawn[], patient: number): void {
    const st = this.st;
    const q = st.pawns.find((x) => x.id === patient);
    if (!q?.needs || q.bite === undefined || !q.limb || st.tick > q.bite + AMPUTATE_WINDOW) return;
    const p = pawns.find((x) => x !== q);
    if (!p) return;
    const j = this.newJob('amputate', q.id, -1, true);
    this.setJob(p, j, false);
    p.path = [];
    p.pi = 0;
  }

  /** jeden lek: najpierw z zapasu zarządu, potem ze sterty 'leki' na mapie (łup z wypraw i przeszukań, M2) */
  private takeMed(): boolean {
    const st = this.st;
    if (st.store.meds >= 1) {
      st.store.meds--;
      return true;
    }
    const heap = st.things.find((t) => t.kind === 'leki' && t.n > 0);
    if (!heap) return false;
    heap.n--;
    if (heap.n <= 0) st.things.splice(st.things.indexOf(heap), 1);
    return true;
  }

  /** Amputacja: dojść do chorego (droga od nowa co sekundę), pół godziny pracy, na koniec wynik. Szansa
      0,5 + 0,15 × med, z lekiem (z zapasu albo ze sterty leków) +0,15, najwyżej 0,9. */
  private amputateTick(p: Pawn, j: Job): void {
    const st = this.st;
    const tick = st.tick;
    const q = st.pawns.find((x) => x.id === j.target);
    if (!q?.needs || this.graveyard.has(q.id) || q.bite === undefined) {
      this.done(p);
      return;
    }
    if (j.phase === 1) {
      if (tick < j.until) return;
      // amputuje ktoś z zarządu (amputateTick tylko dla rdzenia)
      const who = p.kind === 'core' ? st.people[p.person] : undefined;
      let chance = 0.5 + 0.15 * (who?.skills.med ?? 0);
      if (this.takeMed()) chance += 0.15;
      if (nextRandom(st.rng) < Math.min(0.9, chance)) {
        delete q.bite;
        delete q.limb;
        q.maimed = true;
        q.needs.health = Math.max(10, q.needs.health - 35);
        q.moods = q.moods.filter((m) => m.why !== FEVER_MOOD);
        this.addMood(q, 'Amputacja', -12, TICKS_PER_DAY);
        this.addMood(p, 'Uratowaliśmy go', 6, TICKS_PER_DAY);
      } else this.die(q, 'amputacja', null);
      this.done(p);
      return;
    }
    if (tick > q.bite + AMPUTATE_WINDOW) {
      this.done(p);
      return;
    }
    if (Math.hypot(q.x - p.x, q.y - p.y) <= 1.6) {
      p.path = [];
      p.pi = 0;
      j.phase = 1;
      j.until = tick + AMPUTATE_TICKS;
      this.face(p, q.x, q.y);
      // chory leży w miejscu do końca zabiegu
      const at = this.tileOf(q);
      const hold = this.newJob('go', at, at, true, 1);
      hold.until = j.until;
      this.setJob(q, hold, false);
      q.path = [];
      q.pi = 0;
      return;
    }
    if (p.pi >= p.path.length || tick % THINK_EVERY === 0) {
      const g = this.goalFor(p, this.tileOf(q));
      if (g >= 0 && g !== this.tileOf(p)) this.routeTo(p, g);
    }
    if (p.pi < p.path.length) this.walk(p);
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

  /** skąd przychodzą: losowy kafelek far kroków od siatki po stronie ulicy (albo najdalszy, jaki jest) */
  private farFrom(spot: number, far = RAID_FROM): number {
    const size = this.w.size;
    const { blocked } = this.lay.outside;
    const dist = new Map<number, number>([[spot, 0]]);
    const q = [spot];
    const ring: number[] = [];
    let last = spot;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const d = dist.get(c)!;
      if (d === far) {
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
    if (r.n <= 0) r.n = 1 + Math.floor(nextRandom(st.rng) * 3);
    const waits = this.tilesAround(r.spot, r.n);
    const starts = this.tilesAround(r.from, r.n);
    for (let k = 0; k < r.n; k++) {
      const look = 16 + Math.floor(nextRandom(st.rng) * 4);
      const p = newPawn(st, this.w, 'szabrownik', -1, starts[k] ?? r.from, r.from, look);
      p.hp = STRANGER_HP;
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
        // bez zarządu zapasy w pokoju z magazynem są dla nich za dobrze schowane
        if (!r.gov && this.inStore(t)) continue;
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
      p.sack ??= {};
      p.sack[k] = (p.sack[k] ?? 0) + take;
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
    // krew, trupy i zwłoki z czasem znikają
    if (st.things.some((t) => t.until !== undefined && t.until <= st.tick))
      st.things = st.things.filter((t) => t.until === undefined || t.until > st.tick);
    this.boost = heatStep(st.temps, this.kinds, this.links, fires, tout);
    // ogródki rosną; co trzy doby plon obok grządek
    for (const t of st.things)
      if (t.kind === 'ogrodek') {
        t.fuel += HEAT_EVERY;
        if (t.fuel < GARDEN_TICKS) continue;
        t.fuel = 0;
        const n = GARDEN_YIELD[seasonOf(st.tick)];
        if (n > 0) this.dropMat((t.y + 1) * this.w.size + t.x + 1, 'jedzenie', n);
      }
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
      // gorączka: zdrowie spada liniowo do zera w chwili śmierci
      if (p.bite !== undefined) {
        const left = Math.max(0, p.bite + FEVER_TICKS - st.tick);
        p.needs.health = Math.min(p.needs.health, Math.round((1000 * left) / FEVER_TICKS) / 10);
      }
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
    const strangers = st.pawns.filter((q) => (q.kind === 'szabrownik' || q.kind === 'zombie') && !q.away);
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
    const asleep = !!j && ((j.t === 'sleep' && j.phase === 1) || (j.t === 'guard' && j.phase === 4));
    const floor = !!j && j.t === 'sleep' && j.phase === 1 && j.target < 0;
    // ciemno: noc, a w pomieszczeniu nie świeci koza ani przez drzwi, na dworze ognisko ani lampa warty
    const dark = daylight(this.st.tick) < 0.5 && !(inside && (this.light[r] ?? 0) >= 0.5) && !fire && !lit;
    let company = 0;
    for (const q of this.st.pawns)
      if (q !== p && !q.away && q.kind !== 'szabrownik' && Math.hypot(q.x - p.x, q.y - p.y) <= 4) company++;
    // obcych widać z dworu z daleka, z wnętrza tylko bliżej (przez okno); śpiący ich nie widzi
    // szwendaczy przy siatce bywa dużo: straszą najwyżej jak dwóch obcych
    let strangers = 0;
    let zs = 0;
    if (!asleep)
      for (const q of a.strangers)
        if (Math.hypot(q.x - p.x, q.y - p.y) <= (inside ? 8 : 16)) {
          if (q.kind === 'zombie') zs++;
          else strangers++;
        }
    strangers += Math.min(2, zs);
    return {
      temp: inside ? this.st.temps[r] : tout,
      fire,
      asleep,
      floor,
      hunger: hungerRate(this.st.laws.foodMult),
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
