/* Symulacja (M1): pionki rdzenia z poleceniami i własną pracą, tłum z prostym planem, rzeczy (meble, drewno,
   koza, jedzenie, pnie), ciepło w pomieszczeniach, potrzeby i samouczek. Stały krok, ziarno i kolejka poleceń
   w stanie. Stan to zwykły obiekt (JSON), rysowanie tylko go czyta. Ten sam świat, ziarno i polecenia dają ten sam
   stan. Bez wnętrza siedziby (świat sprzed M1) zarząd stoi, a rzeczy, ciepła i samouczka nie ma. Z opcją
   `mieszkancy` (krok 5, src/sim/lokatorzy.ts) zarząd i mieszkańcy siedziby mają osoby z generatora mieszkańców;
   bez niej stan jest taki jak przed tą opcją. Własna praca bezczynnego zarządu (think) idzie według priorytetów
   osób z src/sim/praca.ts: po potrzebach, zimnie i gasnącej kozie biorą rodzaje pracy po kolei (ogień, kuchnia,
   budowa, naprawy, drwal, noszenie, warsztat, szaber, badania). Bez polecenia zaczynają pracę tylko na naszym terenie
   (naszTeren: podwórko, siedziba, budynki za wspólnym płotem); za siatkę wychodzi tylko osoba z przełącznikiem i tylko
   za dnia (mozeTam). Warsztat i szaber nigdy nie ruszają materiału ani drzwi, które mają inne przeznaczenie: deski
   z nadwyżki drewna, części z nadwyżki złomu, dzidy dla nieuzbrojonych, a szaber tylko puste pomieszczenia i wraki,
   bez otwierania i wyważania drzwi. Czas ścinania, budowy, łatania, napraw, warsztatu, dzidy i gotowania dzieli
   mnożnik z umiejętności (`tempoPracy`). Wędrowiec po rozmowie przy siatce może zostać zaproszony (praca `zapros`,
   `okazjaWerbunku`): przy zarządzie poniżej ZARZAD_MAX staje się osobą zarządu z id `w1`, `w2`…, przy pełnym tylko
   mieszkańcem, jeśli jest wolne łóżko w mieszkaniu mieszkańców i mieszkańców jest mniej niż `capOf`; po rozmowie
   wędrowiec czeka przy siatce godzinę gry na zaproszenie (`PO_ROZMOWIE`). Osoba, cel i ukryte ugryzienie wędrowca idą
   z ziarna świata i numeru, a ze st.rng jest tylko samo losowanie zaproszenia, więc gry bez takich rozmów biegną jak
   bez werbunku. Odczyt `ileZlecen(r)` liczy czekające zlecenia rodzaju pracy na żądanie, poza stanem.
   Premie ery 1–2 (t_okna, t_konserwy, t_zielarstwo, t_spawanie, t_ambu) i
   paleniska poza kozą zarządu (koza z beczki, kocioł; waga drewna w PALENISKA) działają tylko po zbadaniu albo
   postawieniu, więc gra bez badań ma te same liczby co przed nimi (src/sim/badania.ts).
   Badania: pracownia (stół z dwoma miejscami), polecenia `research` (wybór badania), `study` (zarząd do stołu) i `siec`
   (włączenie sieci po zbadaniu sieci bez miedzi), praca `research` z postępem w `researchTick`, stan `research` i `books`
   (pola powstają przy pierwszym użyciu) oraz plan dnia lokatorów z wiedzą (labOpen). Barykada z wraków stoi na odcinku
   siatki jak zasieki, ale ma BARYKADA_HP (160, zasieki 100), a wzmocnienie siatki deskami (`brace`, do 100) jej nie
   dotyka. Posterunek na wieży (WIEZA_POST, klucz 'wieza'): wartownik stoi na wolnym kafelku obrysu wieży (najwyżej tylu
   osób, ile kafelków), jego lampa płoszy dalej (WIEZA_ZASIEG), a broń dystansowa sięga z wieży dalej.
   Polecenie gracza przeżywa walkę odruchową (zgłoszenie Mateusza z 19.10.2026): praca z polecenia (`order: true`)
   zostaje zapamiętana w `Pawn.polecenie` jako komenda z `ids: [pionek]`, a gdy `react` przerwie ją walką albo ucieczką,
   polecenie czeka na wznowienie (`think` → `wznow`): po wygranej walce wraca od razu, po ucieczce, gdy przez WZNOW_SPOKOJ
   żaden wróg nie stoi w czystej linii do WZNOW_ZASIEG m od pionka i od celu polecenia; wznawia je ponowne zastosowanie
   komendy (ta sama droga co od gracza, `rozkaz`); polecenie ma WZNOW_PROBY prób (pierwsze wykonanie i wznowienia), a przy
   ostatnim przerwaniu przepada z wpisem w kronice zarządu (`SimState.przerwane`, GovInput.przerwane). Reguła trybu zombie, która odsyła bezczynnych spoza siatki do
   siedziby, nie dotyka pionka, który może wznowić polecenie. Ładunek z rąk (deski z noszenia łupu, materiał na łatę
   i budowę, drewno) nie spada pod nogi: zostaje przy pionku (`Polecenie.niesie`), wraca z nim do tej samej pracy,
   a gdy polecenie przepadnie albo pionek zginie, leży tam, gdzie stał (w siedzibie na składzie). „Zamknięte na klucz”
   i „Nikt nie otwiera” trzymają pionka przy drzwiach godzinę gry jak „Idź tu” (STAY_AFTER_ORDER). */

import { PROFS, type TechDom } from '../content/data.ts';
import { bledyOsoby, druzynaDoGry, type OsobaDruzyny, osobaDoGry } from '../content/druzyna.ts';
import { makePerson, type Person } from '../content/people.ts';
import { hashString, mulberry, nextRandom, pick, type RngState, rngOf } from '../core/rng.ts';
import { IN, type Interior } from '../world/interior.ts';
import type { Tree, World } from '../world/world.ts';
import type { Wreck } from '../world/wrecks.ts';
import {
  AMBU_TEMPO,
  badaniaDom,
  badaniaWidoczne,
  dodajKsiazke,
  kartka,
  kosztTech,
  ksiazkaZ,
  lekZPlonu,
  OKNA_PLUS,
  PALENISKA,
  PIECZARKI_PLON,
  plonKonserw,
  SZANSA_KSIAZKI,
  siecWlaczona,
  siecZbadana,
  TECH_BY,
  tempoOsoby,
  wolneMiejsca,
} from './badania.ts';
import {
  type AmmoKey,
  hitChance,
  isFirearm,
  isRanged,
  noAmmo,
  START_KIT,
  WEAPONS,
  type Weapon,
  type WeaponId,
  weaponOf,
} from './bron.ts';
import {
  BUILDS,
  type BuildKind,
  type BuildPlan,
  canPlace,
  footprint,
  GHOST_KINDS,
  type Mat,
  naObwodzie,
} from './budowle.ts';
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
  AGGRO,
  CALM_TICKS,
  firstVisit,
  firstVisitZombie,
  HAGGLE_TICKS,
  NAPISY as HANDEL,
  HOSTILE_DMG,
  HOSTILE_HIT,
  KILL_DELAY_DAYS,
  LEAVE_HOUR,
  nextVisit,
  nextVisitZombie,
  type Obcy,
  priced,
  REVENGE_CHANCE,
  ROB_MOOD,
  ROB_MOOD_OTHERS,
  rollOffers,
  SLAWA_DAYS,
  SLAWA_EXTRA_DAYS,
  SLAWA_MAX,
  TRADER_FLEE,
  TRADER_HP,
  TRADER_NOSHOW,
  TRADER_WEAPON,
  tickAt,
  WAIT_TICKS,
  WAIT_ZOMBIE,
  ZBIR_FLEE,
  ZBIR_HP,
  ZBIR_LEAVE_HOUR,
  ZBIR_STAY,
  ZBIR_WEAPONS,
  ZOMBIE_DELAY,
  ZOMBIE_SCARE_ARRIVE,
  ZOMBIE_SCARE_WAIT,
} from './handlarz.ts';
import {
  dryTreeOf,
  frontTile,
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
import { type FenceState, fenceShape, gateTiles, type Hole, initFence, PATCH_HP, REINFORCED_HP } from './perimeter.ts';
import {
  automatRusza,
  domyslnyPriorytet,
  kolejnoscOsoby,
  NOWE,
  PROG_MAX,
  PROGI_DOMYSLNE,
  type PracaStan,
  type Priorytet,
  type Progi,
  priorytet,
  progi,
  RODZAJE,
  type RodzajPracy,
  staleZajecie,
  tempoPracy,
  type UstawieniaOsoby,
  WPISY,
  ZAPAS_OPALU,
  ZARZAD_MAX,
  zaSiatke,
} from './praca.ts';
import {
  atakOdRazu,
  type DrzwiStan,
  domTeraz,
  domWyzej,
  domyZapasowe,
  drzwiBudynku,
  type Gospodarstwo,
  gid,
  gidB,
  gidRoom,
  HALAS,
  type Info,
  type KontekstSpotkania,
  kafelkiZajete,
  kosztPlotu,
  type LokatorzyBudynku,
  LUP_MATS,
  lupMieszkania,
  lupUslug,
  mieszkalny,
  mieszkaniaZaDrzwiami,
  moznaPrzeszukac,
  type Napis,
  NOC_BIORA,
  NOC_POKOJE,
  nocnyGosc,
  nowyBudynek,
  ODBIJANIE_TICKS,
  OTWIERANIE_TICKS,
  PIETRO_TICKS,
  PUKANIE_TICKS,
  pietraBudynku,
  pietro,
  plotDla,
  poHalasie,
  pokojSasiada,
  przechodnie,
  rngOfPlace,
  type SasiedniBudynek,
  type Sasiedzi,
  type Skutek,
  type Spotkanie,
  skutek,
  solidCell,
  stanDrzwi,
  szabrownicy,
  ugryzionyOd,
  uSasiada,
  WARIANTY_PLOTU,
  type WariantPlotu,
  WYWAZ_KLATKA_TICKS,
  WYWAZ_MIESZKANIE_TICKS,
  type WyborSpotkania,
  wnetrze,
  wybory,
  ZABIJANIE_DESKI,
  ZABIJANIE_TICKS,
  type Zamiar,
  zostaja,
} from './sasiedzi.ts';
import {
  CARRY_MATS,
  CARRY_REACH,
  type Product,
  pracaPrzepisu,
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
  wrecksOf,
  wreckTile,
} from './surowce.ts';
import { type GameMode, modeOf } from './tryb.ts';
import { TUT_STEPS, type Tutorial, type TutStep, tutAdvance, WARM_ENOUGH } from './tutorial.ts';
import {
  CHASE_TICKS,
  CREW_SEARCH_TICKS,
  celWedrowca,
  FLEE_SPEED,
  firstCrew,
  firstCrewZombie,
  firstWanderer,
  gossip,
  gossipZombie,
  MUG_MOOD,
  MUG_MOOD_OTHERS,
  mugLoot,
  NAPAD_PAMIEC,
  NOWY_MOOD,
  NOWY_MOOD_TICKS,
  nextCrew,
  nextCrewZombie,
  nextWanderer,
  nextWandererZombie,
  NAPISY as OBCY,
  osobaWedrowca,
  PAUSE_MAX,
  PAUSE_MIN,
  PAUSE_ZOMBIE_MAX,
  PAUSE_ZOMBIE_MIN,
  PO_ROZMOWIE,
  SHOO_REACH,
  SPOOK_R,
  szansaWerbunku,
  TALK_EXTRA,
  TALK_MOOD,
  TALK_MOOD_TICKS,
  TALK_TICKS,
  ugryzienieWedrowca,
  ugryzionyOdGodzin,
  WANDER_SPEED,
  WANDERER_HP,
  ZAPROS_TICKS,
} from './wedrowcy.ts';
import {
  ambientCount,
  BITE_CD,
  BITE_DMG,
  BITE_HIT,
  BITE_HIT_FIGHTING,
  BITE_REACH,
  CHASE_SPEED,
  crowdNear,
  DAY_PULL,
  DISPERSE,
  distField,
  FAR,
  HORDE_FROM,
  HORDE_HOURS,
  hordeSize,
  MAX_ZOMBIES,
  NEAR,
  pushOf,
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
/** sztuka drewna pali się w kozie godzinę gry (40 s przy 1×): drzewo starcza na pół dnia, a suche drzewo
    z samouczka (połowa drewna, dryWood) na 3–5 godzin, więc pierwszego wieczoru trzeba zdecydować, skąd wziąć opał */
export const BURN_TICKS = TICKS_PER_HOUR;
/** Bez polecenia zarząd dokłada do kozy tylko wtedy, gdy ogień jest potrzebny: ktoś ma mniej ciepła niż KOZA_WARM,
    mieszkanie zarządu stygnie poniżej KOZA_MIN °C (śpiącym wystarcza 12°C, bo sen dodaje 6°C), trzeba gotować,
    a gazu nie ma, trwa samouczek albo jest wieczór od KOZA_EVENING do 22:00. Inaczej za dnia koza paliłaby się
    od rana do nocy i zjadała cztery drzewa na dobę. */
export const KOZA_WARM = 60;
export const KOZA_MIN = 12;
export const KOZA_EVENING = 18;
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
/** Rodzaj trasy pracy bez polecenia: zwykła (materiał, drewno, łup) może w trybie zwykłym za dnia iść ulicą między
    częściami naszego terenu; trasa Szabru (przeszukiwanie pomieszczeń i wraków) nigdy bez przełącznika. */
type Trasa = 'zwykla' | 'szaber';
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
  'research',
  'door',
  'loot',
  'upstairs',
  'plot',
  'trade',
  'rob',
  'talk',
  'zapros',
  'mug',
  'shoo',
]);
/** jaką pracę daje pionkowi komenda gracza; tylko z taką pracą (order: true) komenda jest zapamiętywana do wznowienia
    (Pawn.polecenie). Poza listą: warta i alarm (mają własne odejście od posterunku), atak (walka sama), wyprawa i powrót,
    amputacja, spotkanie i wybory bez pionka. Pomocnicy (praca „go” przy cudzych komendach) nie pamiętają niczego. */
const PRACA_POLECENIA: Partial<Record<Command['t'], JobKind>> = {
  move: 'go',
  chop: 'chop',
  haul: 'haul',
  refuel: 'refuel',
  burn: 'burn',
  cook: 'cook',
  patch: 'patch',
  campfire: 'campfire',
  finish: 'finish',
  craft: 'craft',
  brace: 'brace',
  search: 'search',
  dismantle: 'dismantle',
  repair: 'repair',
  claim: 'claim',
  build: 'build',
  wreck: 'wreck',
  carry: 'carry',
  saw: 'saw',
  study: 'research',
  open: 'door',
  knock: 'door',
  force: 'door',
  board: 'door',
  unboard: 'door',
  loot: 'loot',
  upstairs: 'upstairs',
  enclose: 'plot',
  trade: 'trade',
  rob: 'rob',
  talk: 'talk',
  mug: 'mug',
  shoo: 'shoo',
};
/** rodzaje komend, które pionek wznawia po przerwaniu (klucze PRACA_POLECENIA) */
export const POLECENIA_WZNAWIANE: readonly Command['t'][] = Object.keys(PRACA_POLECENIA) as Command['t'][];
/** prace, w których pionek niesie materiał w Job.n i Job.what (od fazy 1, po wzięciu ze sterty), i te, w których niesie
    drewno w rękach; przerwane z ładunkiem wracają w tym samym stanie (Sim.rozmroz) */
const PRACE_Z_MATERIALEM = new Set<JobKind>(['carry', 'patch', 'brace', 'build', 'repair']);
const PRACE_Z_DREWNEM = new Set<JobKind>(['haul', 'refuel', 'campfire']);
/** Prace spoza fali 1, które zarząd bierze sam w ramach pracy ludzi (src/sim/praca.ts) albo dziś tylko na polecenie:
    ścinanie, łatanie siatki, dzidy i noszenie drewna (naprawy i noszenie łupu to prace M2, więc przerywają się tak
    samo). Bez polecenia (`!order`) przerywa je to samo co prace M2 bez polecenia:
    pilna potrzeba, której da się zaradzić (`pilneDoZaradzenia`; `haul` nie z zimna), noc i wróg na podwórku, kiedy
    pracujący jest na zewnątrz; `haul` nocą tylko wtedy, gdy kafelek jego sterty leży poza naszym terenem (noszenie na
    naszym terenie trwa i w nocy). Prace z polecenia przerywają się jak dziś. */
const AUTO_JOBS = new Set<JobKind>(['chop', 'patch', 'craft', 'haul']);
/** poniżej tego ciepła zimno jest pilne: przerywa prace M2 (bez polecenia tylko, gdy da się mu zaradzić)
    i AUTO_JOBS, a think() grzeje przed każdą pracą */
const URGENT_WARM = 10;
/** kurs po materiał: po drodze zbiera kolejne sterty tego samego najwyżej tyle kafelków dalej */
export const GATHER_NEAR = 8;
/** kuchnia społeczna: porcja z niej to 85% zwykłej (nic się nie marnuje) */
export const SOCIAL_KITCHEN = 0.85;
/** ogródek: plon co trzy doby, według pory roku (jesień, zima, wiosna, lato) */
export const GARDEN_TICKS = 3 * TICKS_PER_DAY;
export const GARDEN_YIELD: readonly number[] = [2, 0, 4, 6];
/** wytrzymałość zasieków (siatka 45–75, świeża łata 70) */
export const ZASIEKI_HP = 100;
/** wytrzymałość barykady z wraków (badania, t_barykady): mocniejsza od zasieków */
export const BARYKADA_HP = 160;
/** wytrzymałość kafelka siatki albo łaty pod budowlą z obwodu (zasieki, barykada) */
const obwodHp = (kind: string): number => (kind === 'barykada' ? BARYKADA_HP : ZASIEKI_HP);
/** zajęcie mieszkania (oznaczenie drzwi i spis) trwa kwadrans gry */
export const CLAIM_TICKS = TICKS_PER_HOUR / 4;
/** warta trwa do tej godziny rano */
export const GUARD_UNTIL = 6;
/** posterunek warty przy kozie zarządu (Job.target), klucz 'koza': czuwa w kuchni i dokłada, kiedy ognia mało */
export const KOZA_POST = -1;
/** zasięg światła (m): lampa warty i ognisko; w nim nie jest ciemno, a szabrownicy się płoszą */
export const LAMP_REACH = 5;
/** wartownik na wieży (badania, t_wieza) sięga dalej: lampą (bez zarządu) i bronią dystansową (tryb zombie) ×1,5 */
export const WIEZA_ZASIEG = 1.5;
export const CAMPFIRE_LIGHT = 6;
/** szabrownicy pokazują się za siatką pół godziny gry przed napadem i czekają w ciemności */
export const SNEAK_TICKS = TICKS_PER_HOUR / 2;
/** tyle sztuk wynosi jeden szabrownik naraz (worek) */
export const LOOT_CARRY = 8;
/** z zarządem: tyle czekają na jego rozstrzygnięcie; gdy zarząd milczy, odchodzą sami bez łupu */
export const GOV_WAIT = TICKS_PER_HOUR;
/** skąd przychodzą: mniej więcej tyle kroków od siatki */
const RAID_FROM = 22;
/** handlarz przychodzi z daleka, mniej więcej tyle kroków ulicą od bramy (wędrowcy i ekipy też) */
const TRADER_FROM = 70;
/** obcy, którzy przychodzą i znikają (praca w fazie 4: zniknął) */
const PASSERS = new Set<PawnKind>(['szabrownik', 'handlarz', 'wedrowiec', 'obcy', 'zbir']);
/** obcy ludzie: ich śmierć liczy się jak zabity szabrownik (bez żałoby, „Zabiłem człowieka” dla zabójcy) */
const STRANGER_KINDS = new Set<PawnKind>(['szabrownik', 'handlarz', 'wedrowiec', 'obcy', 'zbir']);
const STRANGER_NAMES: Partial<Record<PawnKind, string>> = {
  szabrownik: 'Szabrownik',
  handlarz: 'Handlarz',
  wedrowiec: 'Wędrowiec',
  obcy: 'Obcy',
  zbir: 'Człowiek handlarza',
};
/** bezczynny rdzeń rozgląda się za pracą co sekundę realną */
const THINK_EVERY = TICKS_PER_SECOND;
/** po poleceniu „idź tu” czeka na miejscu godzinę gry, chyba że coś pilnego; tak samo przy cudzych drzwiach, które
    okazały się zamknięte na klucz albo nikt za nimi nie otwiera (gracz może zapukać albo wyważyć) */
const STAY_AFTER_ORDER = TICKS_PER_HOUR;
/** Przerwane polecenie gracza (walka odruchowa albo ucieczka w react) wraca, ale ma najwyżej tyle prób (pierwsze
    wykonanie i wznowienia): trzecie przerwanie kończy je wpisem w kronice, czyli wznowień jest najwyżej dwa (żeby nie było
    pętli walka–powrót–walka). Zgłoszenie Mateusza z 19.10.2026: „kiedy gracz powalczy z zombie, od razu wraca do domu,
    przerywa swoje polecenie”. */
export const WZNOW_PROBY = 3;
/** zagrożenie minęło, gdy żaden wróg nie stoi w czystej linii do tylu metrów od pionka i od celu polecenia… */
export const WZNOW_ZASIEG = 10;
/** …przez minutę gry (13 ticków); po wygranej walce pionek nie czeka na tę minutę, tylko sprawdza, czy nikt nie czai się dalej */
export const WZNOW_SPOKOJ = Math.round(TICKS_PER_HOUR / 60);
/** przerwane polecenie, którego od tylu ticków nie udało się wznowić (ranny, głodny, szwendacze przy celu), wygasa bez
    wpisu w kronice: nie wraca rano po nocy w łóżku */
export const WZNOW_OKNO = 3 * TICKS_PER_HOUR;
/** wznowienie wymaga zdrowia ponad tyle: jak walka odruchowa w react */
const WZNOW_ZDROWIE = 40;
/** dziennik przerwanych poleceń w stanie trzyma najwyżej tyle wpisów (zarząd czyta go co sekundę) */
const PRZERWANE_MAX = 20;
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
/** posterunek warty na wieży z rusztowań (klucz 'wieza'): wartownik stoi na kafelku wieży */
export const WIEZA_POST = -3;
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
  /** surowce: wrak (target: lewy górny kafelek), noszenie łupu na podwórko (target: sterta, from: kafelek, przy którym
      zbiera), warsztat (target: warsztat) */
  | 'wreck'
  | 'carry'
  | 'saw'
  /** badania: stół pracowni (target: pracownia, tile: miejsce przy stole); w fazie 1 osoba siedzi i dodaje postęp */
  | 'research'
  /** M2 fala 2: praca przy cudzych drzwiach (what: open, knock, force, board, unboard; target: kafelek drzwi),
      przeszukanie pomieszczenia sąsiada (target: gid), czekanie na wybór w spotkaniu (target: numer spotkania) */
  | 'door'
  | 'loot'
  | 'meet'
  /** etap 2: piętro sąsiada (target: indeks budynku, tile: kafelek przy schodach); w fazie 1 osoba jest na górze */
  | 'upstairs'
  /** etap 3: wspólny płot (target: budynek; materiał jak przy budowie, potem praca) */
  | 'plot'
  | 'trader'
  | 'trade'
  | 'rob'
  | 'wander'
  | 'scavenge'
  | 'talk'
  /** werbunek wędrowca po rozmowie: what 'zapros' (zaprosić) albo 'reka' (zapytać o rękę), 2 minuty przy siatce */
  | 'zapros'
  | 'mug'
  | 'shoo'
  | 'zemsta';

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
    (tło z planem dnia), szabrownicy (obcy z napadu; nazwa jak w liście obcych rysowania, src/render/game.ts),
    szwendacze, lokatorzy sąsiednich budynków (M2 fala 2: pionki tylko w trakcie spotkania i po nim, dopóki zarząd
    jest w ich budynku), handlarz pod bramą, wędrowcy, obce ekipy i ludzie handlarza (zbir) */
export type PawnKind =
  | 'core'
  | 'crowd'
  | 'resident'
  | 'szabrownik'
  | 'zombie'
  | 'sasiad'
  | 'handlarz'
  | 'wedrowiec'
  | 'obcy'
  | 'zbir';

/** wróg: szabrownik, szwendacz albo wrogi człowiek (napadnięty handlarz, ludzie handlarza; do ataku z menu i obrony) */
export const isEnemy = (p: Pick<Pawn, 'kind' | 'wrogi'>): boolean =>
  p.kind === 'szabrownik' || p.kind === 'zombie' || !!p.wrogi;

/** kto przerwał polecenie (do wpisu w kronice): szwendacz, szabrownik albo inny wrogi człowiek (napadnięty handlarz,
    jego ludzie) */
export type Napastnik = 'zombie' | 'szabrownik' | 'wrogi';
export const rodzajNapastnika = (e: Pick<Pawn, 'kind' | 'wrogi'>): Napastnik =>
  e.kind === 'zombie' ? 'zombie' : e.kind === 'szabrownik' ? 'szabrownik' : 'wrogi';

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
  /** wrogi człowiek, który bije zarząd (napadnięty handlarz, ludzie handlarza); brak: nie */
  wrogi?: boolean;
  /** zarząd odsypia za dnia (po nocnej warcie albo po pobudce na posiłek): głodny najpierw je, potem śpi, dopóki
      siły poniżej REST_UNTIL */
  nap?: boolean;
  /** polecenie gracza, które przeżywa walkę odruchową (WZNOW_PROBY, Sim.przerwij i wznow); pola nie ma, gdy pionek nie
      wykonuje polecenia (praca skończona, pilna potrzeba, nowe polecenie, brak polecenia) */
  polecenie?: Polecenie;
}

/** Polecenie gracza zapamiętane przy pionku, żeby przeżyło walkę odruchową (react): po walce albo ucieczce wraca. */
export interface Polecenie {
  /** komenda gracza z ids: [pionek]; wznowienie stosuje ją od nowa tą samą drogą co polecenie od gracza */
  c: Command;
  /** która to próba polecenia: 1 przy pierwszym wykonaniu, o jeden więcej po każdym wznowieniu; przerwanie w próbie
      WZNOW_PROBY kończy polecenie */
  n: number;
  /** tick przerwania walką albo ucieczką; brak: polecenie trwa, pionek je wykonuje */
  od?: number;
  /** tick ostatniego zagrożenia, które pionek widział po ucieczce; wznowienie dopiero po WZNOW_SPOKOJ od niego.
      Po wygranej walce brak: pionek wraca od razu, o ile nikt nie czai się przy nim i przy celu */
  zag?: number;
  /** ładunek zdjęty z rąk na czas przerwania: praca w stanie sprzed przerwania (faza, Job.n i Job.what z materiałem)
      i drewno z rąk (Pawn.carry). Po wznowieniu wraca z pionkiem do tej samej pracy; gdy polecenie przepadnie albo pionek
      zginie, leży tam, gdzie stał (w siedzibie na składzie). Pola nie ma, gdy pionek nic nie niósł. */
  niesie?: { job: Job; drewno: number };
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
  /** zasieki i barykada: łata dziury albo wytrzymałość kafelka siatki sprzed nich (wraca przy rozbiórce) */
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
  /** surowce: przeszukać albo rozebrać wrak (kafelek pod nim albo obok), zanieść stertę zza siatki na podwórko (także
      z wnętrza sąsiedniego budynku, wtedy razem z resztą łupu z tego budynku), przerobić w warsztacie drewno na deski
      albo złom na części (n sztuk po kolei) */
  | { t: 'wreck'; ids: number[]; tile: number; how: 'szukaj' | 'rozbierz' }
  | { t: 'carry'; ids: number[]; thing: number }
  | { t: 'saw'; ids: number[]; what: Product; n: number }
  /** badania: wybór bieżącego badania (ids puste; tech null zdejmuje wybór) i zarząd do stołu pracowni */
  | { t: 'research'; ids: number[]; tech: string | null }
  | { t: 'study'; ids: number[]; thing: number }
  /** badania: włączenie sieci po zbadaniu sieci bez miedzi (t_siec), z menu pracowni (ids bez znaczenia, nikt nie musi iść) */
  | { t: 'siec'; ids: number[] }
  /** badania: „Tablica badań” i „Wybrać badanie” z menu pracowni otwierają tablicę w interfejsie (main.ts przechwytuje to
      polecenie przed symulacją; gdyby tu trafiło, nic nie zmienia) */
  | { t: 'tablica'; ids: number[] }
  /** M2 fala 2 (docs/M2-fala-2.md): cudze drzwi (kafelek drzwi budynku albo mieszkania): otworzyć (przy otwartych:
      wejść), zapukać, wyważyć, zabić deskami, odbić deski */
  | { t: 'open' | 'knock' | 'force' | 'board' | 'unboard'; ids: number[]; door: number }
  /** przeszukać pomieszczenie sąsiedniego budynku (lokalny numer pomieszczenia we wnętrzu budynku bid) */
  | { t: 'loot'; ids: number[]; bid: number; room: number }
  /** wybór w spotkaniu z lokatorami (ids puste) */
  | { t: 'meet'; ids: number[]; nr: number; choice: WyborSpotkania }
  /** etap 2: przeszukać następne piętro otwartego budynku (tile: kafelek schodów) */
  | { t: 'upstairs'; ids: number[]; bid: number; tile: number }
  /** gra sieciowa: nowa lista drzwi klatek zajętych przez inne drużyny (ids puste) */
  | { t: 'zajete'; ids: number[]; drzwi: number[] }
  /** etap 3: otoczyć otwarty budynek wspólnym płotem (plan i praca), a po skończonej pracy (ids puste) nowa siatka */
  | { t: 'enclose'; ids: number[]; bid: number; wariant?: WariantPlotu }
  | { t: 'otocz'; ids: number[]; bid: number }
  /** handlarz: włączyć (stary zapis, ids puste), wymienić się (oferta k), napaść na niego */
  | { t: 'obcy'; ids: number[] }
  | { t: 'trade'; ids: number[]; offer: number }
  | { t: 'rob'; ids: number[] }
  /** wędrowiec: zagadać, napaść (target: id pionka); obca ekipa przy wraku: przegonić */
  | { t: 'talk'; ids: number[]; target: number }
  /** po rozmowie: zaprosić wędrowca do zarządu albo (przy pełnym zarządzie) do wolnego łóżka mieszkańców; w trybie
      zombie najpierw zapytać o rękę (ujawnia ukryte ugryzienie) */
  | { t: 'zapros'; ids: number[]; target: number }
  | { t: 'reka'; ids: number[]; target: number }
  | { t: 'mug'; ids: number[]; target: number }
  | { t: 'shoo'; ids: number[]; target: number }
  /** praca ludzi (src/sim/praca.ts), wszystkie z ids pustym: priorytet rodzaju osoby (0 nie robi, 1 najważniejszy),
      stałe zajęcie osoby (null: zdjąć), wyjście osoby za siatkę bez polecenia i próg zapasu (całkowity, 0–999).
      `osoba` to indeks w st.people; tylko osoba, która jest dziś w zarządzie, przyjmuje ustawienia */
  | { t: 'prio'; ids: number[]; osoba: number; rodzaj: RodzajPracy; prio: Priorytet }
  | { t: 'stale'; ids: number[]; osoba: number; rodzaj: RodzajPracy | null }
  | { t: 'zasiatke'; ids: number[]; osoba: number; on: boolean }
  | { t: 'prog'; ids: number[]; co: keyof Progi; n: number };

/** polecenia zmieniające `st.praca` */
type PolecenieUstawien = Extract<Command, { t: 'prio' | 'stale' | 'zasiatke' | 'prog' }>;

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
  /** odblokowane badania (identyfikatory z BuildDef.tech); celowo brak pola, dopóki ktoś nie odblokuje pierwszego
      badania: `sim.hash()` to skrót z całego stanu, więc zawsze obecne puste pole ruszyłoby każdy skrót */
  techDone?: string[];
  /** badania (src/sim/badania.ts): bieżące badanie (`cur`, null: nic nie wybrano), zapisany postęp każdego zaczętego
      badania w punktach (`prog`, zmiana badania go nie kasuje) i tick ukończenia zbadanych (`at`). Pola nie ma, dopóki
      nikt nie wybierze pierwszego badania, więc gra bez badań ma ten sam skrót stanu co dotąd. `siec` pojawia się dopiero
      po włączeniu sieci (polecenie `siec`) i zostaje do końca gry. */
  research?: { cur: string | null; prog: Record<string, number>; at: Record<string, number>; siec?: true };
  /** książki osady według dziedziny (każda dodaje 1 do wiedzy, w wiedzy liczą się najwyżej 2); pola nie ma, dopóki
      nikt nie znajdzie pierwszej książki */
  books?: Partial<Record<TechDom, number>>;
  /** dziennik książek znalezionych w przeszukanych pomieszczeniach (siedziba i sąsiedzi), po kolei: tick, dziedzina,
      tytuł i `podpalka`, gdy to trzecia z dziedziny i poszła na drewno. Zarząd czyta go przez `govInput()` do kroniki,
      interfejs do podpowiedzi „Znaleźli książkę…”. Książki z wydarzenia zarządu go nie zasilają (mają własny wpis).
      Pola nie ma, dopóki nikt nie znajdzie książki w przeszukaniu. */
  bookLog?: { tick: number; dom: TechDom; tytul: string; podpalka?: true }[];
  /** wraki przeszukane i rozebrane (lewy górny kafelek), rosnąco; brak, dopóki nikt nie przeszukał wraku */
  wraki?: WreckMark[];
  /** sąsiednie budynki (M2 fala 2): nie ma go, dopóki zarząd nie dotknie cudzych drzwi, więc gra bez sąsiadów ma ten
      sam stan i skrót co przed falą 2, a stary zapis wczytuje się bez zmian */
  sasiedzi?: Sasiedzi;
  /** gra sieciowa (fala 2): drzwi klatek zajętych przez inne drużyny, rosnąco; zamknięte na stałe razem z tym, co za
      nimi. Nie ma go w grze bez sieci. */
  zajete?: number[];
  /** wspólny płot (fala 2, etap 3): otoczone budynki, kształt siatki po ostatnim otoczeniu i plan w toku; nie ma go,
      dopóki nikt nie zaczął płotu */
  plot?: PlotStan;
  /** handlarz pod bramą (src/sim/handlarz.ts); tylko z opcją obcy albo po poleceniu 'obcy' */
  obcy?: Obcy;
  /** polecenia, które przepadły po WZNOW_PROBY próbach (wróg za każdym razem je przerywał), po kolei, najwyżej
      PRZERWANE_MAX: tick, imię osoby, klucz tego, co robiła (klucz komendy, przy wraku 'wreck:szukaj' albo
      'wreck:rozbierz') i kto przerwał ostatni raz (`kto`: od niego zależy słowo we wpisie kroniki). Zarząd dopisuje je do
      kroniki (GovInput.przerwane, src/gov/znaleziska.ts). Pola nie ma, dopóki żadne polecenie nie przepadło, więc stan
      gry bez takich przerwań się nie zmienia. */
  przerwane?: { tick: number; imie: string; co: string; kto: Napastnik }[];
  /** ustawienia pracy ludzi (src/sim/praca.ts): tylko zmiany gracza względem domyślnych; nie ma go, dopóki gracz
      czegoś nie zmieni, więc gra bez zmian ma ten sam skrót co przed pracą ludzi */
  praca?: PracaStan;
}

/** M2 fala 2, etap 3: plan wspólnego płotu (jeden naraz): budynek, materiały potrzebne i doniesione, praca w tickach
    i ile jej trzeba, kto pracuje (−1: nikt), kafelek podwórka, z którego się stawia, i wariant materiału z menu
    (zapis sprzed wariantów dostaje w konstruktorze deskę i złom) */
export interface PlotPlan {
  bid: number;
  need: Partial<Record<Mat, number>>;
  have: Partial<Record<Mat, number>>;
  work: number;
  total: number;
  by: number;
  stand: number;
  wariant: WariantPlotu;
}

export interface PlotStan {
  /** otoczone budynki po kolei */
  bids: number[];
  /** kształt siatki po ostatnim otoczeniu (kafelki rosnąco, dziury ze startu na obwodzie, podwórko); brama ze świata */
  ksztalt?: { tiles: number[]; hole: number[]; yard: number[] };
  plan?: PlotPlan;
}

/** Siatka świata według wspólnego płotu: pierwotna zostaje w fenceBaza, a fence i jej kafelki w blocked mają kształt
    ze stanu (bez kształtu wraca pierwotna). Świat zmienia się w miejscu, bo to ten sam obiekt dla rysowania, pamięci
    wnętrz i klucza zapisu; siatka stoi zawsze na wolnych kafelkach, więc blocked wraca bez śladu. */
export function ustawSiatke(w: World, k: PlotStan['ksztalt'] | undefined): void {
  const baza = w.fenceBaza ?? w.fence;
  const teraz = w.fence;
  if (!baza || (!k && teraz === baza)) return;
  for (const t of teraz.tiles) w.blocked[t] = 0;
  for (const t of baza.tiles) w.blocked[t] = 1;
  for (const t of baza.hole) w.blocked[t] = 0;
  if (!k) {
    w.fence = baza;
    delete w.fenceBaza;
    return;
  }
  for (const t of baza.tiles) w.blocked[t] = 0;
  const f = { tiles: k.tiles, hole: k.hole, gate: baza.gate, yard: k.yard };
  for (const t of f.tiles) w.blocked[t] = 1;
  for (const t of f.hole) w.blocked[t] = 0;
  w.fenceBaza = baza;
  w.fence = f;
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
/** suche drzewo z samouczka jest spróchniałe: połowa drewna, czyli zapas na start do pierwszego wieczoru */
export const dryWood = (t: Tree): number => Math.max(2, Math.round(woodFrom(t) / 2));
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
  /** gra sieciowa: drzwi klatek zajętych przez inne drużyny na start (później polecenie zajete) */
  zajete?: readonly number[];
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

/** waga drewna paleniska tego rodzaju (kocioł 3, koza i koza z beczki 1); rodzaj spoza tabeli, np. ognisko, liczy się
    jak koza */
const wagaPaleniska = (kind: string): number => (Object.hasOwn(PALENISKA, kind) ? PALENISKA[kind] : 1);

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
  if (!h || !st.things.some((t) => t.kind === 'jedzenie' && t.n > 0 && !uSasiada(st, w, t.y * w.size + t.x)))
    return false;
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
  if (opts.zajete?.length) st.zajete = [...new Set(opts.zajete)].sort((a, b) => a - b);
  if (opts.obcy) st.obcy = newObcy(st);
  return st;
}

/** przy wraku (lewy górny kafelek t) są obcy z ekipy, którzy jeszcze nie uciekają: zarząd go wtedy nie przeszukuje */
export const crewAt = (st: SimState, t: number): boolean =>
  st.pawns.some((q) => q.kind === 'obcy' && q.job?.t === 'scavenge' && q.job.target === t && q.job.phase < 2);

/** Handlarz, wędrowcy i ekipy włączeni. Zwykły tryb: handlarz drugiego dnia, pierwszy wędrowiec drugiego dnia między
    8:00 a 12:00, pierwsza ekipa trzeciego albo czwartego dnia. Tryb zombie (jak w The Walking Dead): handlarz
    czwartego dnia i rzadko, wędrowcy i ekipy jako ocaleni (src/sim/wedrowcy.ts). */
const newObcy = (st: SimState): Obcy => {
  const zombie = modeOf(st) === 'zombie';
  return {
    next: zombie ? firstVisitZombie(st.rng) : firstVisit(st.rng),
    offers: [],
    trader: -1,
    napad: -1,
    wizyty: 0,
    wnext: firstWanderer(st.rng),
    enext: zombie ? firstCrewZombie(st.rng) : firstCrew(st.rng),
  };
};

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
      // łup we wnętrzu sąsiada nie jest jeszcze nasz (M2 fala 2)
      if (uSasiada(st, w, t.y * size + t.x)) continue;
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

/** klucz posterunku warty z Job.target, jak w karcie nocy zarządu: 'brama', 'd<id>', 'koza', 'siatka', 'wieza' */
export const postKey = (target: number): string =>
  target === KOZA_POST
    ? 'koza'
    : target === SIATKA_POST
      ? 'siatka'
      : target === WIEZA_POST
        ? 'wieza'
        : target === 0
          ? 'brama'
          : `d${target}`;

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
  // M2 fala 2: u sąsiada śmieci i meble pustego mieszkania dopiero po przeszukaniu pomieszczenia, u lokatorów nic
  if (uSasiada(st, w, t.y * w.size + t.x)) {
    const ps = pokojSasiada(st, w, t.y * w.size + t.x);
    const b = ps ? st.sasiedzi!.budynki[ps.k] : undefined;
    if (!ps || !b) return false;
    const r = wnetrze(w, b.bid).rooms[ps.room];
    const m = r.apt >= 0 ? b.mieszkania.find((x) => x.apt === r.apt) : undefined;
    const searched = r.apt < 0 ? b.przeszukane.includes(ps.room) : !!m?.przeszukane.includes(ps.room);
    if (!searched || (m && m.stan !== 'puste')) return false;
    return RUBBISH.has(t.kind) || !!DISMANTLE[t.kind];
  }
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

/** Gdzie zwerbowany wędrowiec by trafił i co wpływa na szansę (src/sim/wedrowcy.ts, szansaWerbunku): 'zarzad' (zarząd
    ma mniej niż ZARZAD_MAX osób), 'mieszkaniec' (zarząd pełny, mieszkanie z wolnym łóżkiem w apt i mieszkańców mniej
    niż `capOf`), 'brak' (pełny zarząd, mieszkańcy mają mieszkania, ale wszystkie łóżka zajęte albo mieszkańców już tyle
    co pojemność), 'dom' (pełny zarząd, a mieszkańcy nie mają mieszkań: dom jednorodzinny, gdzie dziś nie mają łóżek ani
    wstępu). Wolne łóżko liczy się tam, dokąd by trafił: w mieszkaniu zarządu (łóżek więcej niż osób w zarządzie) albo
    u mieszkańców (z limitem pojemności). */
export interface OkazjaWerbunku {
  dokad: 'zarzad' | 'mieszkaniec' | 'brak' | 'dom';
  apt: number;
  jedzenieNaGlowe: number;
  wolneLozko: boolean;
  napadDwieDoby: boolean;
}

/** Okazja do werbunku z samego stanu (menu i symulacja liczą to samo). Jedzenie: porcje surowe i ugotowane w naszych
    stertach (bez wnętrz sąsiadów) na osobę z zarządu, także tych na wyprawie. */
export function okazjaWerbunku(st: SimState, w: World): OkazjaWerbunku {
  const h = houseOf(w);
  const size = w.size;
  const zarzad = st.pawns.reduce((a, p) => a + (p.kind === 'core' ? 1 : 0), 0);
  let porcje = 0;
  for (const t of st.things)
    if ((t.kind === 'jedzenie' || t.kind === 'posilek') && t.n > 0 && !uSasiada(st, w, t.y * size + t.x)) porcje += t.n;
  const napadDwieDoby = (st.obcy?.napady ?? []).some((n) => st.tick - n.tick < NAPAD_PAMIEC);
  const o: OkazjaWerbunku = {
    dokad: 'zarzad',
    apt: -1,
    jedzenieNaGlowe: porcje / Math.max(1, zarzad),
    wolneLozko: false,
    napadDwieDoby,
  };
  if (zarzad < ZARZAD_MAX) {
    o.wolneLozko = !!h && bedsIn(st, h, size, h.home) > zarzad;
    return o;
  }
  const apts = h ? residentApts(st, w, h) : [];
  const living = (a: number) => st.pawns.filter((p) => p.kind === 'resident' && p.apt === a).length;
  const wolne = h ? apts.find((a) => living(a) < bedsIn(st, h, size, a)) : undefined;
  // miejsce to wolne łóżko w mieszkaniu mieszkańców i mniej mieszkańców niż pojemność (`capOf`: bywa niższa od liczby
  // łóżek, a ponad nią wydarzenia zarządu od razu liczą przeludnienie)
  const pojemnosc = wolne !== undefined && st.pawns.filter((p) => p.kind === 'resident').length < capOf(st, w);
  o.apt = pojemnosc ? wolne : -1;
  o.dokad = o.apt >= 0 ? 'mieszkaniec' : apts.length ? 'brak' : 'dom';
  o.wolneLozko = o.apt >= 0;
  return o;
}

/** Szansa zaproszenia obecnego rozmówcy (0, gdy nie ma rozmowy ani miejsca); menu pokazuje ją w procentach, a symulacja
    losuje z niej dokładnie tak samo. */
export function szansaZaproszenia(st: SimState, w: World, o: OkazjaWerbunku = okazjaWerbunku(st, w)): number {
  const r = st.obcy?.rozmowa;
  if (!r) return 0;
  if (o.dokad === 'brak' || o.dokad === 'dom') return 0;
  return szansaWerbunku({
    jedzenieNaGlowe: o.jedzenieNaGlowe,
    wolneLozko: o.wolneLozko,
    napadDwieDoby: o.napadDwieDoby,
    maCel: r.cel,
  });
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

/** czy osoba (indeks w st.people) jest dziś w zarządzie: ma żywy pionek rdzenia; odeszła albo zmarła nie przyjmuje
    ustawień, a jej indeks nie wraca (nowa osoba dostaje następny) */
function wZarzadzie(st: SimState, osoba: number): boolean {
  return Number.isInteger(osoba) && !!st.people[osoba] && st.pawns.some((p) => p.kind === 'core' && p.person === osoba);
}

/** Ustawienia pracy ludzi z polecenia gracza (`prio`, `stale`, `zasiatke`, `prog`): zapisuje w `st.praca` tylko zmiany
    względem domyślnych, a ustawienie równe domyślnemu zdejmuje wpis. Wyjątek: priorytet Badań zostaje zapisany zawsze
    (domyślny zależy od dziedziny bieżącego badania). Złe dane (osoba spoza zarządu, priorytet poza 0–4,
    nieznany rodzaj albo próg, próg nie liczba) są pomijane bez śladu w stanie. */
function ustawPrace(st: SimState, c: PolecenieUstawien): void {
  if (c.t === 'prog') {
    if (!Object.hasOwn(PROGI_DOMYSLNE, c.co) || typeof c.n !== 'number' || Number.isNaN(c.n)) return;
    const n = Math.min(PROG_MAX, Math.max(0, Math.trunc(c.n)));
    const nad = ((st.praca ??= {}).progi ??= {});
    // domyślny próg bez zmian gracza (dzidy zależą od trybu)
    if (n === progi({ ...st, praca: undefined })[c.co]) delete nad[c.co];
    else nad[c.co] = n;
  } else {
    if (!wZarzadzie(st, c.osoba)) return;
    if (c.t === 'prio') {
      if (!RODZAJE.includes(c.rodzaj) || !Number.isInteger(c.prio) || c.prio < 0 || c.prio > 4) return;
    } else if (c.t === 'stale' && c.rodzaj !== null && !RODZAJE.includes(c.rodzaj)) return;
    const u = (((st.praca ??= {}).osoby ??= {})[c.osoba] ??= {});
    if (c.t === 'prio') {
      const prio = (u.prio ??= {});
      // Badania zostają jawne zawsze: ich domyślny priorytet zależy od dziedziny bieżącego badania i zmienia się w grze,
      // więc wybór gracza równy dzisiejszemu domyślnemu przepadłby przy zmianie badania
      if (c.rodzaj !== 'badania' && c.prio === domyslnyPriorytet(st, st.people[c.osoba], c.rodzaj))
        delete prio[c.rodzaj];
      else prio[c.rodzaj] = c.prio;
    } else if (c.t === 'stale') {
      if (c.rodzaj === null) delete u.stale;
      else u.stale = c.rodzaj;
    } else if (c.on) u.zaSiatke = true;
    else delete u.zaSiatke;
  }
  uporzadkujPrace(st);
}

/** Po zmianie: usuwa puste obiekty i całe `st.praca`, gdy nic nie zostało (stan wraca do kształtu bez pola), a to, co
    zostaje, układa w stałej kolejności (osoby rosnąco, rodzaje jak kolumny, progi jak w `PROGI_DOMYSLNE`), żeby ten sam
    zestaw ustawień dawał ten sam skrót bez względu na kolejność poleceń. */
function uporzadkujPrace(st: SimState): void {
  const stare = st.praca;
  if (!stare) return;
  const osoby: Record<number, UstawieniaOsoby> = {};
  // klucze całkowite JSON układa rosnąco sam
  for (const k of Object.keys(stare.osoby ?? {})) {
    const u = stare.osoby?.[Number(k)];
    if (!u) continue;
    const nowe: UstawieniaOsoby = {};
    const prio: NonNullable<UstawieniaOsoby['prio']> = {};
    for (const r of RODZAJE) {
      const v = u.prio?.[r];
      if (v !== undefined) prio[r] = v;
    }
    if (Object.keys(prio).length) nowe.prio = prio;
    if (u.stale) nowe.stale = u.stale;
    if (u.zaSiatke) nowe.zaSiatke = true;
    if (Object.keys(nowe).length) osoby[Number(k)] = nowe;
  }
  const nad: Partial<Progi> = {};
  for (const k of Object.keys(PROGI_DOMYSLNE) as (keyof Progi)[]) {
    const v = stare.progi?.[k];
    if (v !== undefined) nad[k] = v;
  }
  const nowa: PracaStan = {};
  if (Object.keys(osoby).length) nowa.osoby = osoby;
  if (Object.keys(nad).length) nowa.progi = nad;
  if (Object.keys(nowa).length) st.praca = nowa;
  else delete st.praca;
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
  // ładunek zdjęty z rąk na czas przerwanego polecenia (Polecenie.niesie)
  const nie = p.polecenie?.niesie;
  if (nie && nie.drewno > 0) loads.push(['drewno', nie.drewno]);
  if (nie && nie.job.n > 0 && LOOSE.has(nie.job.what)) loads.push([nie.job.what, nie.job.n]);
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

/** Kafelek na linii obwodu: poza podwórkiem i bokiem przy nim. Budynki, drzewa i woda domykają obwód same (fence.ts,
    plot.ts), więc pień drzewa na takim kafelku jest częścią płotu. `inYard` mówi, czy kafelek należy do podwórka. */
export function naLiniiObwodu(size: number, t: number, inYard: (i: number) => boolean): boolean {
  const x = t % size;
  return (
    !inYard(t) &&
    ((t >= size && inYard(t - size)) ||
      (t < size * (size - 1) && inYard(t + size)) ||
      (x > 0 && inYard(t - 1)) ||
      (x < size - 1 && inYard(t + 1)))
  );
}

/** Przechodniość według rodzaju pionka. Baza: świat, ścięte drzewa wolne (poza pniami na linii obwodu), łaty i ogniska
    zablokowane. Zarząd bez otwartych dziur (nie przełazi, a przez zamkniętą bramę przechodzi, bo ma klucz), mieszkańcy
    dodatkowo bez bramy i mieszkania zarządu (zostają za siatką), obcy z dziurami, ale bez zamkniętej bramy. */
function composeLayers(
  w: World,
  felled: readonly number[],
  trunk: Int32Array | null,
  fence: FenceState | null,
  mask: Uint8Array | null,
  solid: readonly number[] = [],
): { core: Uint8Array; resident: Uint8Array; stranger: Uint8Array } {
  const base = w.blocked.slice();
  if (trunk) {
    // pień na linii obwodu zostaje po ścięciu przeszkodą (zwykle jest już siatką, Sim.dociagnijSiatke), bo inaczej
    // w płocie byłaby dziura bez łaty i zasieków; pień w podwórku się zwalnia
    const size = w.size;
    const yard = new Uint8Array(size * size);
    for (const t of fenceShape(w)?.yard ?? []) yard[t] = 1;
    const inYard = (i: number) => yard[i] === 1;
    for (const k of felled) if (!naLiniiObwodu(size, trunk[k], inYard)) base[trunk[k]] = 0;
  }
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
    'resident' | 'szabrownik' | 'zombie' | 'crowd' | 'outside' | 'sasiad',
    { blocked: Uint8Array; reg: Int32Array }
  >;
  /** M2 fala 2: nakładka wnętrz otwartych sąsiednich budynków (kod komórki IN i pomieszczenie gid na kafelek; null bez
      otwartych budynków) i kafelki posadzki każdego pomieszczenia sąsiada; poza stanem, bo wynika ze świata i wpisów */
  private nbCell: Uint8Array | null = null;
  private nbRoom: Int32Array | null = null;
  private readonly nbTiles = new Map<number, number[]>();
  /** rośnie przy każdej zmianie wnętrz i drzwi sąsiadów (rysowanie przelicza przekrój tylko po zmianie) */
  wersjaSasiadow = 0;
  /** podglądy wpisów budynków do karty budynku (poza stanem, budynekDoKarty) */
  private podglady = new Map<number, SasiedniBudynek>();
  /** pomieszczenia siedziby według mieszkania i wraki świata dla Szabru: wynikają ze świata, więc liczone raz, poza
      stanem (szukanie roboty co sekundę nie ma ich liczyć od nowa) */
  private pokojeMieszkan: Map<number, number[]> | null = null;
  private wrakiSwiata: readonly Wreck[] | null = null;
  /** spójne obszary naszego terenu (kafelki `naszTeren`, które zarząd przejdzie, bez wyjścia na ulicę); liczone
      leniwie, kasowane przez rebuild(), poza stanem */
  private obszaryNasze: Int32Array | null = null;
  private zamknieteNasze: Uint8Array | null = null;
  /** lokatorzy budynku z generatora mieszkańców (ustawia gra albo bot z tabelami); bez niego lokatorzy zapasowi */
  lokatorzy: ((bid: number) => LokatorzyBudynku | null) | null = null;
  /** mieszkanie zarządu z drzwiami (1) albo null */
  private readonly mask: Uint8Array | null;
  /** pora wspólnego posiłku: mieszkańcy mogą wejść do mieszkania zarządu, do stołu */
  private mealDoor = false;
  /** praca w pracowni: mieszkańcy mogą wejść do mieszkania zarządu, do stołu pracowni (liczone w każdym kroku) */
  private labDoor = false;
  private readonly trunk: Int32Array;
  private readonly links: [number, number][];
  private readonly kinds: RoomKind[];
  /** przechodnie kafelki każdego pomieszczenia */
  private readonly roomTiles: number[][];
  /** pomieszczenie pod nogami: jak interior.room, ale drzwi należą do sąsiedniego pomieszczenia */
  private readonly roomOf: Int16Array;
  private readonly dry: number;
  /** kafelki podwórka przy bramie, na których stoi warta (najbliżej środka bramy najpierw); to i maski siatki niżej
      liczy przeliczSiatke (także po wspólnym płocie) */
  private gateStand: number[] = [];
  /** kafelek za bramą, na którym znika i pojawia się wyprawa (−1: świat bez siatki) */
  exitTile = -1;
  /** kafelek przed drzwiami siedziby, do którego wraca wyprawa */
  private readonly door: number;
  /** kafelki siatki i bramy (1): przez nie da się sięgnąć tylko dzidą, kuszą i bronią palną */
  private fenceMask: Uint8Array = new Uint8Array(0);
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
  /** napierający szwendacze według naciskanego kafelka i ich tłok przy kafelku, liczone raz na krok (tryb zombie) */
  private readonly pressing = new Map<number, number>();
  private readonly crowd = new Map<number, number>();
  /** kafelki podwórka (1) i to, czy w bieżącym kroku jest na nim wróg (liczone raz na krok) */
  private yardMask: Uint8Array = new Uint8Array(0);
  private dangerAt = -1;
  private danger = false;

  constructor(w: World, st: SimState) {
    this.w = w;
    this.st = st;
    // M2 fala 2, etap 3: siatka świata według wspólnego płotu ze stanu (bez niego pierwotna)
    ustawSiatke(w, st.plot?.ksztalt);
    // zapis sprzed broni: pusty magazyn i bez amunicji (bez losowania, żeby skrót zależał tylko od stanu)
    st.store.arms ??= [];
    st.store.ammo ??= noAmmo();
    st.noise ??= [];
    st.fx ??= [];
    // zapis z handlarzem sprzed wędrowców i ekip: pierwszy wędrowiec jutro rano, ekipa pojutrze (bez losowania)
    if (st.obcy) {
      const zombie = modeOf(st) === 'zombie';
      st.obcy.wnext ??= zombie ? -1 : tickAt(dayOf(st.tick) + 1, 9);
      st.obcy.enext ??= zombie ? -1 : tickAt(dayOf(st.tick) + 2, 10);
    }
    st.dead ??= [];
    st.tally ??= zeroTally();
    // zapis z planem wspólnego płotu sprzed wariantów materiału: deska i złom na metr
    if (st.plot?.plan) st.plot.plan.wariant ??= 'mieszany';
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
    // zapis sprzed siatki w miejscu pni: ścięty pień na linii obwodu staje się siatką, a pień z mapy znika
    for (const k of st.felled) {
      const t = this.trunk[k];
      if (this.dociagnijSiatke(t)) st.things = st.things.filter((x) => x.kind !== 'pien' || x.y * w.size + x.x !== t);
    }
    const h = this.house;
    this.mask = h ? homeMask(h, w.size) : null;
    this.blocked = new Uint8Array(w.size * w.size);
    this.coreBlocked = new Uint8Array(w.size * w.size);
    this.reg = new Int32Array(0);
    this.lay = {} as Sim['lay'];
    this.mealDoor = this.mealOpen();
    this.labDoor = this.labOpen();
    // wnętrza otwartych sąsiednich budynków ze stanu (wczytany zapis) przed pierwszą przechodniością
    if (st.sasiedzi) this.przeliczNakladke();
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
    this.przeliczSiatke();
    if (h) {
      const fires = this.fires();
      this.boost = heatBoost(this.kinds, this.links, fires, this.outdoor());
      this.light = roomLight(this.kinds.length, this.links, this.lightRooms());
    }
  }

  /** Posterunek przy bramie, wyjście za bramę, maski siatki i podwórka oraz numery kafelków siatki ze świata (po
      wspólnym płocie od nowa). Liczone ze świata (z dziurami zamkniętymi), nie ze stanu: ścięte drzewo albo ognisko nie
      może ich przesunąć, bo gra wczytana z zapisu musi iść dalej tak samo. */
  private przeliczSiatke(): void {
    const w = this.w;
    const shape = fenceShape(w);
    const gate = gateTiles(w);
    const size = w.size;
    const cheb = (a: number, b: number) =>
      Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
    const gx = gate.reduce((a, g) => a + (g % size) + 0.5, 0) / Math.max(1, gate.length);
    const gy = gate.reduce((a, g) => a + Math.floor(g / size) + 0.5, 0) / Math.max(1, gate.length);
    const dg = (i: number) => ((i % size) + 0.5 - gx) ** 2 + (Math.floor(i / size) + 0.5 - gy) ** 2;
    const still = w.blocked.slice();
    for (const t of shape?.hole ?? []) still[t] = 1;
    this.gateStand = (shape?.yard ?? [])
      .filter((i) => !still[i] && gate.some((g) => cheb(g, i) <= 1))
      .sort((a, b) => dg(a) - dg(b) || a - b);
    this.exitTile = exitOf(w);
    this.fenceMask = new Uint8Array(size * size);
    for (const t of shape?.tiles ?? []) this.fenceMask[t] = 1;
    this.fenceIndex.clear();
    for (const [k, t] of (shape?.tiles ?? []).entries()) this.fenceIndex.set(t, k);
    this.yardMask = new Uint8Array(size * size);
    for (const t of shape?.yard ?? []) this.yardMask[t] = 1;
    for (const t of gate) this.fenceMask[t] = 1;
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

  /** Przechodniość od nowa: baza ze świata, ścięte drzewa wolne (pień na linii obwodu zostaje), łaty i ogniska
      zablokowane; zarząd bez otwartych dziur, mieszkańcy dodatkowo bez bramy i mieszkania zarządu (do wejścia na
      posiłek albo do pracowni), obcy z dziurami, ale bez zamkniętej bramy, tłum jak mieszkańcy. Woła się przy starcie,
      po ścięciu drzewa, łacie, nowym ognisku, zmianie bramy i drzwi mieszkania zarządu. */
  private rebuild(): void {
    const size = this.w.size;
    this.obszaryNasze = null;
    this.zamknieteNasze = null;
    const solid = this.st.things
      .filter((t) => t.kind === 'ognisko')
      .map((t) => t.y * size + t.x)
      .sort((a, b) => a - b);
    const { core, resident, stranger } = composeLayers(
      this.w,
      this.st.felled,
      this.trunk,
      this.st.fence,
      this.mealDoor || this.labDoor ? null : this.mask,
      solid,
    );
    // wnętrza otwartych sąsiednich budynków: zarząd i obcy (szwendacze, szabrownicy) wchodzą przez otwarte i wyważone
    // drzwi; mieszkańcy siedziby i tłum zostają przy swoim
    this.nalozSasiadow(core);
    this.nalozSasiadow(stranger);
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
      // lokatorzy sąsiadów na czas spotkania chodzą jak zarząd
      sasiad: { blocked: this.coreBlocked, reg: this.reg },
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
    // handlarz, wędrowcy i obce ekipy chodzą tylko po stronie ulicy, ludzie handlarza jak szabrownicy
    if (kind === 'zbir') return this.lay.szabrownik;
    return kind === 'handlarz' || kind === 'wedrowiec' || kind === 'obcy' ? this.lay.outside : this.lay[kind];
  }

  /** warstwa do drogi pionka: szabrownik po stronie ulicy (podchodzi, czeka, ucieka) chodzi tylko tamtędy */
  private layerOf(p: Pawn): { blocked: Uint8Array; reg: Int32Array } {
    if (p.kind === 'szabrownik' && p.job?.phase !== 2 && !this.lay.outside.blocked[this.tileOf(p)])
      return this.lay.outside;
    if (p.kind === 'zombie') return this.zlay(p);
    // wrogi człowiek chodzi jak szabrownik: dziurami tak, zamkniętą bramą nie
    if (p.wrogi) return this.lay.szabrownik;
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
    this.syncLabDoor();
    if (st.raid) this.raidTick(st.raid);
    // M2 fala 2: nocni goście w otwartych budynkach o 2:00, napis o 7:00 (tylko gdy zarząd dotknął cudzych drzwi)
    if (st.sasiedzi && st.tick % TICKS_PER_HOUR === 0) {
      const h = hourOf(st.tick);
      if (h === 2) this.nocniGoscie();
      else if (h === 7) this.ranoPoGosciach();
    }
    if (st.obcy) {
      this.traderClock();
      this.wandererClock();
      this.crewClock();
      this.revengeClock();
    }
    if (st.noise!.length) st.noise = st.noise!.filter((n) => n.until > st.tick);
    if (st.fx!.length) st.fx = st.fx!.filter((f) => f.tick + FX_TICKS > st.tick);
    if (modeOf(st) === 'zombie') {
      this.zombieClock();
      this.rise();
      this.countPressing();
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
        // M2 fala 2: w budynku, w którym po nocy zostali szabrownicy, czeka spotkanie
        if (p.kind === 'core' && this.nbRoom && (st.tick + p.id) % THINK_EVERY === 0 && this.naSzabrownikow(p))
          continue;
      }
      if (p.kind === 'zombie') {
        this.zombieTick(p);
        continue;
      }
      if (p.kind === 'sasiad') {
        this.sasiadTick(p);
        continue;
      }
      if (p.wrogi) {
        if (this.hostileTick(p)) gone = true;
        continue;
      }
      // tryb zombie: handlarz, ocalały albo ekipa, do których podchodzi szwendacz, uciekają (także w drodze)
      if (PASSERS.has(p.kind) && p.kind !== 'szabrownik' && (st.tick + p.id) % THINK_EVERY === 0 && this.spooked(p))
        continue;
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
        // wspólny posiłek: mieszkaniec zostawia podwórko, dom albo stół pracowni i idzie do stołu zarządu
        if (
          p.kind === 'resident' &&
          st.tick % THINK_EVERY === 0 &&
          ((p.job?.t === 'stay' && p.job.target !== STAY_MEAL) || p.job?.t === 'research') &&
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
      if (p.kind === 'wedrowiec') {
        if (this.wanderTick(p)) gone = true;
        continue;
      }
      if (p.kind === 'obcy') {
        if (this.scavengeTick(p)) gone = true;
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
    if (gone) st.pawns = st.pawns.filter((p) => !(PASSERS.has(p.kind) && p.job?.phase === 4));
    // zabici w tym kroku znikają ze stanu (zostają po nich zwłoki)
    if (this.graveyard.size) {
      for (const id of this.graveyard) {
        const p = st.pawns.find((q) => q.id === id);
        if (p) dropPawn(st, p);
      }
      this.graveyard.clear();
    }
    this.researchTick();
    if (st.tick % HEAT_EVERY === 0) this.slow();
    st.tick++;
  }

  /** prędkość względem człowieka: ranny szabrownik wlecze się */
  private speedOf(p: Pawn): number {
    if (p.kind === 'szabrownik' && (p.hp ?? STRANGER_HP) < FLEE_HP) return 0.6;
    if ((p.kind === 'handlarz' || p.kind === 'wedrowiec' || p.kind === 'obcy') && p.job?.phase === 3) return FLEE_SPEED;
    if (p.kind === 'wedrowiec') return WANDER_SPEED;
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
    // wybór w spotkaniu z lokatorami nie potrzebuje zaznaczonych (nasza osoba już przy nich stoi)
    if (c.t === 'meet') {
      this.wyborSpotkania(c.nr, c.choice);
      return;
    }
    // ustawienia pracy ludzi nie dotyczą zaznaczonych pionków (osoba z indeksu w st.people), zmieniają się od tego kroku
    if (c.t === 'prio' || c.t === 'stale' || c.t === 'zasiatke' || c.t === 'prog') {
      ustawPrace(st, c);
      return;
    }
    // wspólny płot skończony: nowa siatka od tego kroku (praca skończyła się w poprzednim)
    if (c.t === 'otocz') {
      this.otocz(c.bid);
      return;
    }
    // gra sieciowa: klatki innych drużyn zamknięte od następnego kroku (przechodniość od nowa)
    if (c.t === 'zajete') {
      const d = [...new Set(c.drzwi)].sort((a, b) => a - b);
      if (d.join() === (st.zajete ?? []).join()) return;
      if (d.length) st.zajete = d;
      else delete st.zajete;
      this.rebuild();
      this.wersjaSasiadow++;
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
    // wybór badania i włączenie sieci nie potrzebują nikogo z zarządu
    if (c.t === 'research') {
      this.chooseResearch(c.tech);
      return;
    }
    if (c.t === 'siec') {
      this.wlaczSiec();
      return;
    }
    if (c.t === 'tablica') return;
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
    // praca z polecenia: kto dostał od gracza nową pracę, zapamiętuje komendę do wznowienia po walce (zapamietaj)
    const przed = pawns.map((p) => p.job);
    // plan budowy i jego odwołanie nie potrzebują nikogo z zarządu (plan czeka, aż ktoś się nim zajmie)
    if (c.t === 'build') {
      this.orderBuild(pawns, c.kind, c.x, c.y, c.rot);
      pawns.forEach((p, k) => {
        if (p.job !== przed[k]) this.zapamietaj(p, c);
      });
      return;
    }
    if (c.t === 'unbuild') {
      this.unbuild(c.id);
      return;
    }
    if (c.t === 'obcy') {
      if (!st.obcy) st.obcy = newObcy(st);
      return;
    }

    if (!pawns.length) return;
    this.tutEvent('zaznacz');
    this.rozkaz(c, pawns);
    pawns.forEach((p, k) => {
      if (p.job !== przed[k]) this.zapamietaj(p, c);
    });
  }

  /** Samo polecenie dla wskazanych z zarządu (bez samouczka i bez pamiętania): ta droga od gracza i od wznowienia
      przerwanego polecenia. Budowę zakłada od gracza `apply` (orderBuild, także nowy plan), więc `build` tutaj to
      wznowienie: tylko istniejący plan, taki sam co do rodzaju, miejsca i obrotu, bez zakładania nowego (plan odwołany
      przez gracza `unbuild` nie powstaje od nowa). */
  private rozkaz(c: Command, pawns: Pawn[]): void {
    if (c.t === 'build') {
      const plan = this.st.builds.find((b) => b.kind === c.kind && b.x === c.x && b.y === c.y && b.rot === c.rot);
      if (plan && pawns[0]) this.startBuild(pawns[0], plan);
    } else if (c.t === 'move') this.orderMove(pawns, c.to, [], true);
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
    else if (c.t === 'study') this.orderStudy(pawns, c.thing);
    else if (c.t === 'open' || c.t === 'knock' || c.t === 'force' || c.t === 'board' || c.t === 'unboard')
      this.orderDoor(pawns, c.t, c.door);
    else if (c.t === 'loot') this.startLoot(pawns[0], c.bid, c.room);
    else if (c.t === 'upstairs') this.startUpstairs(pawns[0], c.bid, c.tile);
    else if (c.t === 'enclose') this.startEnclose(pawns[0], c.bid, c.wariant);
    else if (c.t === 'trade') this.startTrade(pawns[0], c.offer);
    else if (c.t === 'rob') this.startRob(pawns[0]);
    else if (c.t === 'talk') this.startTalk(pawns[0], c.target);
    else if (c.t === 'zapros' || c.t === 'reka') this.startZapros(pawns[0], c.target, c.t);
    else if (c.t === 'mug') this.startChase(pawns[0], c.target, 'mug');
    else if (c.t === 'shoo') this.startChase(pawns[0], c.target, 'shoo');
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

  /** Droga mieszkańców do pracowni, która stoi w mieszkaniu zarządu. Przechodniość mieszkańców ma jedną warstwę, więc
      mieszkanie otwiera się dla nich wszystkich naraz, ale do stołu siadają tylko ci z wiedzą (`labSkill`). Otwarte
      w godzinach mieszkańców na podwórku (`residentDay`), gdy stoi pracownia, jest wybrane badanie i któryś z mieszkańców
      ma w jego dziedzinie umiejętność; poza nimi dopóki ktoś z nich jeszcze tam jest (wychodzi przy otwartych
      drzwiach, jak spóźniony na obiad), ale tylko w grze, w której są badania (bez nich mieszkanie zostaje, jak było).
      Wynika wyłącznie ze stanu, więc po wczytaniu zapisu wychodzi tak samo, i dlatego liczy się w każdym kroku, a nie
      co pół godziny jak pora posiłku: wybór badania, koniec badania i stawianie pracowni wypadają w dowolnym ticku. */
  private labOpen(): boolean {
    if (!this.house) return false;
    const st = this.st;
    const dom = badaniaDom(st);
    if (
      dom !== null &&
      this.residentDay() &&
      st.things.some((t) => t.kind === 'pracownia') &&
      st.pawns.some((p) => this.labSkill(p, dom))
    )
      return true;
    // drzwi mieszkania liczą się do niego: stół pracowni stoi przy drzwiach, więc siedzi się też w progu
    const mask = this.mask;
    const size = this.w.size;
    return (
      !!mask &&
      st.pawns.some(
        (p) =>
          p.kind === 'resident' &&
          mask[Math.floor(p.y) * size + Math.floor(p.x)] === 1 &&
          (p.job === null || p.job.t === 'stay' || p.job.t === 'research'),
      ) &&
      badaniaWidoczne(st)
    );
  }

  /** drzwi do pracowni dla mieszkańców: przechodniość od nowa tylko przy zmianie */
  private syncLabDoor(): void {
    const open = this.labOpen();
    if (open === this.labDoor) return;
    this.labDoor = open;
    this.rebuild();
  }

  /** godziny mieszkańców na podwórku: od początku pracy (uchwała o zebraniach go przesuwa) do 18:00, nie w nocy */
  private residentDay(): boolean {
    const h = hourOf(this.st.tick);
    return !this.night() && h >= this.st.laws.workStart && h < 18;
  }

  /** czy mieszkaniec ma osobę z umiejętnością co najmniej 1 w dziedzinie badania; bez osoby, sąsiad i zarząd nie */
  private labSkill(p: Pawn, dom: TechDom): boolean {
    return p.kind === 'resident' && p.person >= 0 && (this.st.people[p.person]?.skills[dom] ?? 0) >= 1;
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

  /** posterunek warty z klucza 'brama' / 'd<id>' / 'koza' / 'siatka' / 'wieza': 0 brama, id dziury, KOZA_POST,
      SIATKA_POST, WIEZA_POST (gdy wieża stoi), null: nie ma takiego */
  private postOf(post: string): number | null {
    if (post === 'brama') return this.gateStand.length ? 0 : null;
    if (post === 'koza') return this.koza() ? KOZA_POST : null;
    if (post === 'siatka') return this.st.fence ? SIATKA_POST : null;
    if (post === 'wieza') return this.wieza() ? WIEZA_POST : null;
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

  /** gdzie stoi warta: przy bramie najbliżej jej środka, przy dziurze tuż obok od strony podwórka, przy kozie przed
      nią, na wieży na jej wolnym kafelku najbliżej pionka */
  private guardStand(p: Pawn, post: number): number {
    if (post === WIEZA_POST) {
      const tower = this.wieza();
      if (!tower) return -1;
      const taken = this.taken(p);
      const region = this.regionOf(p);
      const tiles: number[] = [];
      for (let y = tower.y; y < tower.y + tower.h; y++)
        for (let x = tower.x; x < tower.x + tower.w; x++) tiles.push(y * this.w.size + x);
      const free = tiles.filter((i) => !this.coreBlocked[i] && !taken.includes(i) && this.reg[i] === region);
      return this.nearest(p, free);
    }
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
      to drzewo, rąbie dalej bez zaczynania od nowa, a nowi idą pomóc. Gdy ścinający jest wśród wskazanych, a rąbie sam
      (z automatu), jego praca staje się pracą z polecenia (`order`): polecenie gracza nie ginie (wniesienie drewna po
      ścięciu za siatką, reguły nocy i pilnych potrzeb dla poleceń, bez dopisku „(sam)”). */
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
      if (pawns.includes(chopper)) chopper.job!.order = true;
      rest = pawns.filter((q) => q !== chopper);
      taken.push(chopper.job!.tile);
    } else if (this.startChop(pawns[0], k, true)) {
      taken.push(pawns[0].job!.tile);
      if (k === this.dry) this.tutEvent('rozkaz');
      rest = pawns.slice(1);
    }
    if (rest.length) this.orderMove(rest, this.trunk[k], taken, false);
  }

  /** Ścinanie drzewa k: idzie na wolny kafelek przy pniu i rąbie. false, gdy nie ma przy pniu miejsca, do którego
      dojdzie. `order`: z polecenia gracza (inaczej z automatu pracy ludzi). */
  private startChop(p: Pawn, k: number, order: boolean): boolean {
    const stand = this.chopSpot(p, k);
    if (stand < 0 || !this.idz(p, stand, order)) return false;
    this.setJob(p, this.newJob('chop', k, stand, order), false);
    return true;
  }

  /** Drwal: najbliższe wolne drzewo, gdy drewna w zapasie jest mniej niż próg. Pomija: ścięte, drzewa, które ktoś
      już rąbie (rezerwacja przez `job.target`, więc dwóch drwali nie bierze tego samego), suche drzewo z samouczka
      przed końcem jego kroku „ściąć”, drzewa na linii obwodu (ich pień po ścięciu zamienia się w kafelek siatki, który
      da się przebić) i takie, do których nie wolno iść bez polecenia (`mozeTam`) albo przy których jest szwendacz. */
  private startDrwal(p: Pawn): boolean {
    const st = this.st;
    if (this.zapasDrewna() >= progi(st).drewno) return false;
    const felled = new Set(st.felled);
    const zajete = new Set<number>();
    for (const q of st.pawns) if (q.job?.t === 'chop') zajete.add(q.job.target);
    const suche = st.tut.step >= 0 && st.tut.step <= TUT_STEPS.indexOf('sciete') ? this.dry : -1;
    const size = this.w.size;
    const naLinii = (t: number) => naLiniiObwodu(size, t, (i) => this.yardMask[i] === 1);
    const kandydaci: [number, number][] = [];
    for (let k = 0; k < this.w.trees.length; k++) {
      if (k === suche || felled.has(k) || zajete.has(k)) continue;
      const t = this.trunk[k];
      if (!this.mozeTam(p, t) || naLinii(t) || this.zagrozone(t)) continue;
      kandydaci.push([this.dist2(p, t), k]);
    }
    kandydaci.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    // od najbliższego: pierwszy, przy którego pniu jest miejsce na naszym terenie albo dozwolone za siatką; droga
    // (A*) tylko do dwóch kandydatów, żeby nieosiągalne drzewa nie kręciły się w kółko
    let proby = 0;
    for (const [, k] of kandydaci) {
      const stand = this.chopSpot(p, k);
      if (stand < 0 || !this.mozeSam(p, stand)) continue;
      if (this.startChop(p, k, false)) return true;
      if (++proby >= 2) break;
    }
    return false;
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
    if (!koza || (!Object.hasOwn(PALENISKA, koza.kind) && koza.kind !== 'ognisko')) return;
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

  /** koniec pracy: rzeczy wolne, od razu rozgląda się za następną. Praca z polecenia skończona (zrobiona, przerwana
      pilną potrzebą albo celem, który zniknął) kończy polecenie; przerwane walką albo ucieczką czeka na wznowienie. */
  private done(p: Pawn): void {
    this.release(p);
    this.dropLoad(p);
    p.job = null;
    if (p.polecenie && p.polecenie.od === undefined) delete p.polecenie;
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

  /** wieża z rusztowań na podwórku (stoi najwyżej jedna) */
  private wieza(): Thing | undefined {
    return this.st.things.find((t) => t.kind === 'wieza');
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
    return this.st.things.find((t) => t.kind === 'jedzenie' && t.n > 0 && !this.uSasiada(t));
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
      near: tylko stosy do 4 m od tego kafelka; ok: tylko stosy, których kafelek spełnia warunek (praca bez polecenia
      bierze stosy z `mozeTam`) */
  private pileFor(
    p: Pawn,
    where: 'sklad' | 'outside' | 'any',
    near = -1,
    ok?: (tile: number) => boolean,
  ): Thing | undefined {
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
      if (ok && !ok(i)) continue;
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
    const front = frontTile(t, size);
    const region = this.regionOf(p);
    const ok =
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

  /** ile sztuk drewna jeszcze wejdzie do paleniska: kozy, kozy z beczki, kotła (zbiornik KOZA_CAP × waga sztuk) albo
      ogniska */
  private kozaRoom(koza: Thing): number {
    const cap = koza.kind === 'ognisko' ? CAMPFIRE_CAP : KOZA_CAP * wagaPaleniska(koza.kind);
    return Math.floor((cap * BURN_TICKS - koza.fuel) / BURN_TICKS);
  }

  /** nasze mieszkania: oznaczone jako nasze i mieszkanie zarządu */
  private ourApts(): Set<number> {
    const ours = new Set(this.st.apts.filter((a) => a.ours).map((a) => a.apt));
    if (this.house && this.house.home >= 0) ours.add(this.house.home);
    return ours;
  }

  /** paleniska naszych mieszkań w stałej kolejności: koza zarządu, potem kozy z beczek i kotły w kolejności rzeczy */
  private paleniska(): Thing[] {
    const out: Thing[] = [];
    const home = this.koza();
    if (home) out.push(home);
    for (const t of this.st.things) if (t.kind === 'koza_beczka' || t.kind === 'kociol') out.push(t);
    return out;
  }

  /** czy paleniska trzeba teraz dołożyć: zostało mniej niż sztuka (jednostek ognia BURN_TICKS × waga), do paleniska
      coś wejdzie, a nikt inny go nie obsługuje */
  private doDolozenia(p: Pawn, t: Thing): boolean {
    return (t.by < 0 || t.by === p.id) && t.fuel < BURN_TICKS * wagaPaleniska(t.kind) && this.kozaRoom(t) >= 1;
  }

  /** Palenisko, do którego pionek dołoży teraz, gdy nikt nie wskazał celu: spośród palenisk naszych mieszkań to, któremu
      zostało najmniej ognia (fuel / waga, czyli czas do końca), przy remisie pierwsze z listy, czyli koza zarządu. Bez
      `order` tylko takie, które trzeba dołożyć (doDolozenia); z poleceniem każde, do którego coś wejdzie. Przy samej
      kozie zarządu wynik jest ten sam co dawniej (`this.koza()`), a gdy jej nie trzeba, nic. */
  private paleniskoDoDolozenia(p: Pawn, order: boolean): Thing | undefined {
    let best: Thing | undefined;
    let bestLeft = Number.POSITIVE_INFINITY;
    for (const t of this.paleniska()) {
      if (order ? this.kozaRoom(t) < 1 : !this.doDolozenia(p, t)) continue;
      const left = t.fuel / wagaPaleniska(t.kind);
      if (left < bestLeft) {
        bestLeft = left;
        best = t;
      }
    }
    return best;
  }

  /** Pień drzewa, które domykało obwód (poza podwórkiem, bokiem przy nim, jeszcze nie siatka), po ścięciu staje się
      kafelkiem siatki: rysuje się ciągle, bierze łatę i zasieki, a jego wytrzymałość jest jak świeżego płotu (w trybie
      zombie jak wzmocnionej siatki). Kształt idzie przez stan wspólnego płotu (st.plot.ksztalt, ustawSiatke), więc
      zapis i wczytanie dają tę samą siatkę. Zwraca, czy siatka się zmieniła; przeliczenie siatki i przechodniości
      zostaje wołającemu. */
  private dociagnijSiatke(tile: number): boolean {
    const st = this.st;
    const shape = fenceShape(this.w);
    const f = st.fence;
    if (!shape || !f || shape.tiles.includes(tile)) return false;
    const yard = new Set(shape.yard);
    if (!naLiniiObwodu(this.w.size, tile, (i) => yard.has(i))) return false;
    const fresh = modeOf(st) === 'zombie' ? REINFORCED_HP : PATCH_HP;
    const hp = new Map(shape.tiles.map((t, i) => [t, f.hp[i]]));
    const tiles = [...shape.tiles, tile].sort((a, b) => a - b);
    f.hp = tiles.map((t) => hp.get(t) ?? fresh);
    st.plot ??= { bids: [] };
    st.plot.ksztalt = { tiles, hole: [...shape.hole], yard: [...shape.yard] };
    ustawSiatke(this.w, st.plot.ksztalt);
    return true;
  }

  /** drzewo pada: zostaje pień, kafelek się zwalnia, drewno leży w stosach dookoła, po tej stronie,
      z której rąbał drwal (stand), żeby dało się do niego dojść; drzewo z linii obwodu zamiast pnia zostawia
      kafelek siatki (dociagnijSiatke), a drewno tylko w podwórku */
  private fell(k: number, stand: number): void {
    const st = this.st;
    const size = this.w.size;
    const t = this.trunk[k];
    st.felled.push(k);
    st.felled.sort((a, b) => a - b);
    // pień, który domykał obwód, staje się kafelkiem siatki (bez pnia na mapie): płot jest cały i bierze zasieki
    const siatka = this.dociagnijSiatke(t);
    if (siatka) this.przeliczSiatke();
    this.rebuild();
    if (!siatka) st.things.push(newThing(st, 'pien', t % size, Math.floor(t / size)));
    let left = k === this.dry ? dryWood(this.w.trees[k]) : woodFrom(this.w.trees[k]);
    for (const [dx, dy] of SPREAD) {
      if (left <= 0) break;
      const x = (t % size) + dx;
      const y = Math.floor(t / size) + dy;
      if ((!dx && !dy) || x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[stand] || this.thingAt(x, y) || onPlan(st, size, i)) continue;
      // drzewo z linii płotu: drewno tylko po stronie podwórka (za bramą to ten sam obszar zarządu)
      if (siatka && !this.yardMask[i]) continue;
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

  /** Praca fali 1 albo z AUTO_JOBS, do której zarząd wziął się sam, ustępuje wrogowi na podwórku, kiedy pracujący
      jest na zewnątrz, a we wszystkich trybach także wrogowi (`wrogBlisko`: szwendacz, ludzie handlarza, wrogi
      handlarz, szabrownik) bliżej niż 10 m od pracującego, kiedy ten stoi poza naszym terenem (praca z przełącznikiem
      „może wychodzić za siatkę” wraca do siedziby, zamiast czekać wśród wrogów). Sprawdza to i work(), i marsz do celu. */
  private yieldsToDanger(p: Pawn): boolean {
    const j = p.job;
    if (!j || !(M2_JOBS.has(j.t) || AUTO_JOBS.has(j.t)) || j.order) return false;
    const tile = this.tileOf(p);
    if (this.yardDanger() && !this.inRoom(tile)) return true;
    return !this.naszTeren(tile) && this.wrogBlisko([tile]);
  }

  /** Czy noc kończy tę pracę bez polecenia: każdą poza noszeniem drewna, które nocą trwa, jeśli kafelek jego
      sterty (w drodze po drewno) albo składu (z drewnem w rękach) leży na naszym terenie. */
  private nightStops(j: Job): boolean {
    return this.night() && (j.t !== 'haul' || !this.naszTeren(j.tile));
  }

  /** praca pionka, który nie idzie: doszedł do celu albo pracuje; false, gdy praca się skończyła
      albo nie da się jej dokończyć (cel zniknął, ktoś go przejął, nie doszedł) */
  private work(p: Pawn, j: Job): boolean {
    const st = this.st;
    const tick = st.tick;
    const at = this.tileOf(p) === j.tile;
    // prace fali 1 z polecenia ustępują pilnej potrzebie, a te, do których zarząd wziął się sam, pilnej potrzebie,
    // której da się zaradzić (`pilneDoZaradzenia`; noszenia drewna zimno nie przerywa), nocy i wrogowi na podwórku,
    // kiedy pracujący jest na zewnątrz (plan czeka z doniesionym materiałem i postępem pracy); prace z AUTO_JOBS tak
    // samo, ale tylko bez polecenia (z polecenia przerywa je to, co dziś), a noszenie drewna nocą tylko spoza siatki
    if (
      (M2_JOBS.has(j.t) || (AUTO_JOBS.has(j.t) && !j.order)) &&
      tick % THINK_EVERY === 0 &&
      ((j.order ? this.urgent(p) : this.pilneDoZaradzenia(p, j.t !== 'haul')) ||
        (!j.order && this.nightStops(j)) ||
        this.yieldsToDanger(p))
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
          // ścięcie na polecenie za siatką kończy się wniesieniem całego drewna z tego drzewa przez tę samą osobę
          // (tak jak wrak przechodzi w noszenie łupu); bez miejsca w składzie albo drogi zostaje jak dotąd
          return j.order && !this.naszTeren(this.trunk[j.target]) && this.haulOn(p, j, this.trunk[j.target]);
        }
        if (!at || st.felled.includes(j.target)) return false;
        j.phase = 1;
        j.t0 = tick;
        j.until = tick + Math.round(chopTicks(tree) / tempoPracy(st, p, 'drwal'));
        this.face(p, tree.x, tree.y);
        return true;
      }
      case 'haul': {
        if (j.phase === 1) {
          if (at) {
            this.stack(p);
            // kolejny kurs po drewno z tego samego drzewa (j.from: jego pień), dopóki leży w pobliżu
            if (j.from >= 0 && p.carry === 0) return this.haulOn(p, j, j.from);
          }
          return false;
        }
        const pile = this.thing(j.target);
        if (!at || !pile || pile.by !== p.id) return false;
        const take = Math.min(pile.n, CARRY - p.carry);
        this.takeWood(pile, take);
        p.carry += take;
        const dest = this.dropTile(p);
        if (dest < 0 || !this.idz(p, dest, j.order)) return false;
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
          j.until = tick + this.czasPracy(p, 'kuchnia', COOK_TICKS);
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
          // rozebrana wieża: nie ma już na czym stać
          if (j.target === WIEZA_POST && !this.wieza()) return false;
          // warta bije każdego wroga w zasięgu swojej broni, nie schodząc z posterunku
          if ((tick + p.id) % 5 === 0) this.guardStrike(p);
          // przy siatce: idzie tam, gdzie napór się przesunął
          if (j.target === SIATKA_POST && (tick + p.id) % SIATKA_EVERY === 0) this.followPressure(p, j);
          // przy kozie: kiedy ognia zostaje mało, idzie po drewno i dokłada
          if (j.target === KOZA_POST && tick % THINK_EVERY === 0) this.tendKoza(p, j);
          return true;
        }
        if (j.phase === 2) {
          // przy stosie: drewno do rąk, potem do paleniska, które czuwający wziął na siebie
          const koza = this.paleniskoCzuwajacego(p);
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
          const koza = this.paleniskoCzuwajacego(p);
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
            const next = this.heapFor(p, j.what, PATCH_COST, !j.order);
            const nt = next ? next.y * size + next.x : -1;
            if (!next || !this.idz(p, nt, j.order)) return false;
            j.from = next.id;
            j.tile = nt;
            next.by = p.id;
            return true;
          }
          const stand = this.standBy(p, hole.tiles, 1);
          if (stand < 0 || !this.idz(p, stand, j.order)) return false;
          j.phase = 1;
          j.from = -1;
          j.tile = stand;
          return true;
        }
        if (j.phase === 1) {
          if (!at) return false;
          j.phase = 2;
          j.t0 = tick;
          // z warsztatem łata idzie półtora raza szybciej, z umiejętnością (bud) jeszcze o 0,1 na poziom
          j.until =
            tick + Math.round(PATCH_TICKS / (this.hasBuilt('warsztat') ? 1.5 : 1) / tempoPracy(st, p, 'naprawy'));
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
        // praca bez polecenia bierze materiał tylko z naszego terenu (nie z ulicy, którą sama by nie weszła)
        const nasze = !j.order;
        if (j.phase === 0) {
          if (!at || !this.haveHeaps(p, need, nasze)) return false;
          j.phase = 1;
          j.until = tick + this.czasPracy(p, 'warsztat', CRAFT_TICKS);
          return true;
        }
        if (tick < j.until) return true;
        if (this.haveHeaps(p, need, nasze)) {
          for (const [kind, n] of need) this.takeHeaps(p, kind, n, j.from, nasze);
          st.store.arms!.push('dzida');
        }
        return false;
      }
      case 'brace': {
        const f = st.fence;
        const k = this.fenceIndex.get(j.target);
        if (!f || k === undefined || f.hp[k] <= 0 || f.hp[k] >= 100 || this.barykadaNa(j.target)) return false;
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
      case 'research':
        return this.researchWork(p, j, at);
      case 'door':
        return this.drzwiPraca(p, j, at);
      case 'loot':
        return this.lootPraca(p, j, at);
      case 'meet':
        // czeka na wybór gracza, dopóki trwa spotkanie, do którego należy
        return this.st.sasiedzi?.spotkanie?.nr === j.target;
      case 'upstairs':
        return this.pietroPraca(p, j, at);
      case 'plot':
        return this.plotPraca(p, j, at);
      case 'trade':
        return this.tradeWork(p, j, at);
      case 'rob':
        return this.robWork(p, j, at);
      // prace obcych mają własne kroki (traderTick, wanderTick, scavengeTick)
      case 'trader':
      case 'wander':
      case 'scavenge':
      case 'zemsta':
        return false;
      case 'talk':
        return this.talkWork(p, j, at);
      case 'zapros':
        return this.zaprosWork(p, j, at);
      case 'mug':
      case 'shoo':
        return this.chaseWork(p, j);
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

  /** potrzeba, która przerywa czekanie po poleceniu i prace M2 z polecenia (prace bez polecenia: `pilneDoZaradzenia`) */
  private urgent(p: Pawn): boolean {
    const n = p.needs;
    return !!n && (n.warm < URGENT_WARM || n.food < 10 || n.rest < 5);
  }

  /** Pilna potrzeba (`urgent`), której da się teraz zaradzić: wyczerpanie zawsze (śpi się choćby na podłodze), głód,
      gdy jest posiłek albo zapasy (`mealFor`), zimno, gdy da się mu zaradzić (`zimnoDoZaradzenia`). Tylko taka blokuje
      w think() nowe rodzaje pracy i przerywa pracę bez polecenia; pracę z polecenia przerywa `urgent` jak dotąd.
      Inaczej przy zgasłej kozie bez drewna zmarznięty zarząd stał bez końca (nikt nie rąbał), a plan budowy zaczynał się
      i przerywał co sekundę. `zimno` fałszywe: zimno się nie liczy (noszenie drewna samo niesie lekarstwo na zimno, więc
      zimno go nie przerywa). */
  private pilneDoZaradzenia(p: Pawn, zimno = true): boolean {
    const n = p.needs;
    if (!n) return false;
    if (n.rest < 5) return true;
    if (n.food < 10 && this.mealFor(p)) return true;
    return zimno && n.warm < URGENT_WARM && this.zimnoDoZaradzenia(p);
  }

  /** Czy zimnu osoby da się teraz zaradzić: koza zarządu się pali i jest przy niej miejsce do grzania, albo osoba
      z włączonym Ogniem ma czym do niej dołożyć (drewno w rękach albo wolna sterta drewna na naszym terenie, do której
      sama dojdzie: `mozeSam`, bez szwendacza przy siatce), a do kozy coś wejdzie. Drewno za siatką się nie liczy: po nie
      trzeba wyjść albo je najpierw narąbać, więc wtedy zarząd pracuje dalej. */
  private zimnoDoZaradzenia(p: Pawn): boolean {
    const koza = this.koza();
    if (!koza) return false;
    if (koza.fuel > 0 && this.warmSpot(p, koza) >= 0) return true;
    if (!this.ogienWlaczony(p) || this.kozaRoom(koza) < 1) return false;
    if (p.carry > 0) return true;
    return !!this.pileFor(p, 'any', -1, (i) => this.naszTeren(i) && this.mozeSam(p, i) && !this.zagrozone(i));
  }

  /** Czy osoba ma Ogień włączony: priorytet większy od 0 albo stałe zajęcie Ogień (tylko taka dokłada do kozy sama). */
  private ogienWlaczony(p: Pawn): boolean {
    return priorytet(this.st, p.person, 'ogien') > 0 || staleZajecie(this.st, p.person) === 'ogien';
  }

  /** Bezczynny rdzeń sam: śpi w nocy albo z wyczerpania, je, gdy głodny, a potem po kolei:
      1. koza, w której zostało mniej niż `BURN_TICKS` ognia: dokłada do niej, niezależnie od priorytetów osoby i przed
         wszystkimi pracami z tabeli; ale tylko ten, kto ma Ogień włączony (priorytet większy od 0 albo stałe zajęcie):
         wybór gracza „Ogień: nie robi” wygrywa z dawnym obyczajem, że dokłada każdy bezczynny;
      2. zimno (ciepło poniżej `URGENT_WARM`): grzeje się przy kozie, i to przed każdą pracą, także przed budową planów
         (inaczej zmarznięty zaczynał pracę, którą `urgent` przerywa w następnej sekundzie, i tak w kółko);
      3. rodzaje pracy według `kolejnoscOsoby` (stałe zajęcie, potem priorytety 1–4 osoby): ogień (dokładanie do kozy
         i noszenie drewna do składu), kuchnia, budowa planów (i dokańczanie planu wspólnego płotu), a od pierwszego
         rana (`automatRusza`) nowe rodzaje (NOWE): naprawy, drwal, noszenie, warsztat, szaber, badania (wolne miejsce
         przy stole pracowni, gdy wybrano badanie; `research` jest w M2_JOBS, więc pilna potrzeba, noc i wróg na podwórku
         przerywają je tak jak inne prace bez polecenia). Nowe rodzaje nie ruszają
         przy pilnej potrzebie, której da się zaradzić (`pilneDoZaradzenia` przerwałby je w następnej sekundzie
         i zerował postęp); zmarznięty przy zgasłej kozie bez drewna na naszym terenie pracuje dalej, więc drwal może
         narąbać drewna. Ciepło poniżej COLD
         idzie przed nowe rodzaje z priorytetem 3 i 4 (stałe zajęcie liczy się jak 1): szaber i warsztat o domyślnym
         priorytecie trzymałyby osobę przy pracy w zimnych pomieszczeniach do nocy. Nocą tylko ogień (noszenie tylko
         stosów na naszym terenie) i kuchnia;
      4. grzeje się przy kozie, kiedy mu zimno (ciepło poniżej COLD);
      5. czeka sekundę.
      Osoba ze wszystkimi rodzajami na 0 przechodzi więc tylko przez sen, jedzenie i ciepło.
      Za siatkę bez polecenia wychodzi tylko osoba z przełącznikiem i tylko za dnia (`mozeTam`). */
  private think(p: Pawn): void {
    if (p.kind === 'resident') {
      this.plan(p);
      return;
    }
    const n = p.needs!;
    if (p.nap && n.rest >= REST_UNTIL) p.nap = false;
    // przerwane polecenie gracza wraca, kiedy minęło zagrożenie: przed regułą powrotu do domu, snem i resztą
    if (p.polecenie && this.wznow(p)) return;
    // w trybie zombie za siatką bez zajęcia i bez polecenia do wznowienia nikt nie stoi (to, co może wrócić do polecenia,
    // wznawia je wyżej; kto jeszcze nie może, bo ranny albo szwendacze są blisko, idzie schować się jak każdy): wraca do
    // siedziby (w pomieszczeniu sąsiedniego budynku jest pod dachem, więc czeka tam na następne polecenie)
    if (modeOf(this.st) === 'zombie' && !this.insideAt(this.tileOf(p)) && !this.inSasiad(this.tileOf(p))) {
      const s = this.shelterSpot(p);
      if (s >= 0 && this.go(p, s)) {
        this.setJob(p, this.newJob('go', s, s, false), false);
        return;
      }
    }
    // zwłoki, które wstaną, w pobliżu: uzbrojony dobija je odruchowo (nóż w głowę); przy wrogu na podwórku
    // tylko te w budynku
    if (p.weapon && this.startFinish(p, this.yardDanger())) return;
    // w sąsiednim budynku przy wrogu na podwórku czeka pod dachem, zamiast wracać przez podwórko
    if (this.yardDanger() && this.inSasiad(this.tileOf(p))) {
      p.wait = this.st.tick + THINK_EVERY;
      return;
    }
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
    // gasnąca koza i zimno przed każdą pracą (kroki 1 i 2 w opisie think); koziej nie dokłada ten, kto wyłączył Ogień
    const koza = this.koza();
    if (koza && this.ogienWlaczony(p) && koza.fuel < BURN_TICKS && this.startRefuel(p, false, koza)) return;
    if (n.warm < URGENT_WARM && this.startWarm(p)) return;
    const rusza = automatRusza(this.st);
    const pilne = this.pilneDoZaradzenia(p);
    const noc = this.night();
    const stale = staleZajecie(this.st, p.person);
    let grzal = false;
    for (const r of kolejnoscOsoby(this.st, p.person)) {
      if (NOWE.has(r) && (!rusza || pilne)) continue;
      if (noc && r !== 'ogien' && r !== 'kuchnia') continue;
      // Zimno (ciepło poniżej COLD) idzie przed nowe rodzaje z priorytetem 3 i 4 (stałe zajęcie liczy się jak 1):
      // inaczej szabrujący albo rąbiący cały dzień wchodzi w noc wyziębiony. Przed rodzajami z priorytetem 1 i 2 oraz
      // przed ogniem, kuchnią i budową ogrzanie zostaje po pracy, jak przed automatem.
      if (!grzal && n.warm < COLD && NOWE.has(r) && r !== stale && priorytet(this.st, p.person, r) >= 3) {
        grzal = true;
        if (this.startWarm(p)) return;
      }
      if (this.znajdzPrace(p, r)) return;
    }
    if (n.warm < COLD && this.startWarm(p)) return;
    p.wait = this.st.tick + THINK_EVERY;
  }

  /** Zaczyna zlecenie rodzaju pracy `r` dla bezczynnego pionka zarządu; false, gdy nie ma czego robić. Ogień:
      dokładanie do kozy ze składu albo noszenie leżącego drewna do składu (tylko stosy z `mozeSam`: wolno tam pracować
      i dojść, czyli na naszym terenie, w innej jego części tylko w trybie zwykłym za dnia, a za siatką tylko osoba
      z przełącznikiem i za dnia). Kuchnia: gotowanie, gdy trzeba.
      Budowa: najstarszy plan, który da się zacząć (za dnia), a gdy takiego nie ma, od pierwszego rana plan wspólnego
      płotu, który ktoś zaczął i porzucił. Naprawy: otwarta dziura z materiałem, potem uszkodzenie w naszym mieszkaniu.
      Drwal: najbliższe wolne drzewo, gdy drewna w zapasie jest mniej niż próg. Noszenie: łup leżący poza podwórkiem.
      Warsztat: deski, części albo dzida (`startWarsztat`). Szaber: puste pomieszczenie albo wrak (`startSzaber`).
      Zlecenie bez materiału albo bez drogi nie zaczyna się (sprawdzają to funkcje `start…` przed liczeniem drogi),
      więc bezczynny z jedyną niewykonalną robotą czeka sekundę, a nie liczy A* w kółko. */
  private znajdzPrace(p: Pawn, r: RodzajPracy): boolean {
    switch (r) {
      case 'ogien':
        // dla gasnącej kozy dokładanie próbował już think() przed pracami; tu zostaje, bo ogień to dokładanie razem z noszeniem
        return this.startRefuel(p, false) || this.startHaul(p);
      case 'kuchnia':
        return this.shouldCook() && this.startCook(p, false);
      case 'budowa':
        if (this.night()) return false;
        // plan wspólnego płotu (zaczęty przez gracza i przerwany) dokańcza dopiero od pierwszego rana, jak nowe rodzaje
        return (
          this.startAnyBuild(p) || (automatRusza(this.st) && !this.pilneDoZaradzenia(p) && this.startPlot(p, false))
        );
      case 'naprawy':
        return this.startNaprawy(p);
      case 'drwal':
        return this.startDrwal(p);
      case 'noszenie':
        return this.startNoszenie(p);
      case 'warsztat':
        return this.startWarsztat(p);
      case 'szaber':
        return this.startSzaber(p);
      case 'badania':
        // wolne miejsce przy stole pracowni; bez wybranego badania, w nocy i przy stoliku bez miejsc nic nie zaczyna
        return WPISY.badania.znajdz?.(this, p) ?? false;
      default:
        return false;
    }
  }

  /** Czy ktoś z żywych w zarządzie (także na wyprawie) może wychodzić za siatkę bez polecenia (przełącznik osoby).
      Odczyt `ileZlecen`: cele poza naszym terenem liczą się dopiero wtedy. */
  private ktosZaSiatke(): boolean {
    const st = this.st;
    return st.pawns.some(
      (q) => q.kind === 'core' && q.person >= 0 && !this.graveyard.has(q.id) && zaSiatke(st, q.person),
    );
  }

  /** Ile zleceń rodzaju `r` czeka: liczba do nagłówka kolumny panelu pracy. Liczona na żądanie ze stanu, bez zapisu
      i bez pamięci podręcznej w stanie (`sim.hash()` się nie zmienia), więc tania i bez ścieżek A*. Liczy zlecenia,
      które szukacz rodzaju (`znajdzPrace`) wziąłby pod uwagę, bez zależności od osoby: nie patrzy na porę dnia,
      bramkę pierwszego dnia, przełącznik „za siatkę”, szwendacza ani na to, czy ktoś tam dojdzie. Zlecenie, które ktoś
      już robi (rezerwacja przez `job.target`, `by`), nie czeka. Co liczy rodzaj: ogień to gasnąca koza bez dokładającego
      plus stosy drewna poza składem na naszym terenie; kuchnia 0 albo 1 (`shouldCook`); budowa to plany bez wykonawcy
      i plan wspólnego płotu bez wykonawcy; naprawy to otwarte dziury bez łatającego i nienaprawione uszkodzenia
      w naszych mieszkaniach bez naprawiającego; drwal to wolne drzewa (bez ściętych, rąbanych, suchego z samouczka
      i na linii obwodu), a gdy drewna w zapasie jest tyle co próg albo więcej, 0; noszenie to stosy materiału
      z `CARRY_MATS` leżące poza podwórkiem; warsztat to ile z trzech wyrobów (deski, części, dzida) według progów
      i zapasów jest do zrobienia (progi dzid, desek i części liczą same predykaty); szaber to nieprzeszukane
      pomieszczenia w siedzibie, w otwartych budynkach sąsiadów (poza mieszkaniami lokatorów) i nieprzeszukane wraki.
      Liczy tylko to, co ktoś z zarządu mógłby wziąć: cel poza naszym terenem (`naszTeren`: drzewo, stos na ulicy,
      pokój w cudzym budynku, wrak) czeka dopiero wtedy, gdy ktoś z żywych w zarządzie ma przełącznik „za siatkę”
      (`ktosZaSiatke`). Badania to wolne miejsca przy stole pracowni (najwyżej `RESEARCH_SEATS`), gdy wybrane badanie idzie.
      Rodzaj, którego nie ma w tej grze (`badania` bez pracowni i bez stanu badań), ma 0. */
  ileZlecen(r: RodzajPracy): number {
    const st = this.st;
    const size = this.w.size;
    if (!WPISY[r].widoczny(st)) return 0;
    const poza = this.ktosZaSiatke();
    switch (r) {
      case 'ogien': {
        const koza = this.koza();
        const sklad = this.house ? this.house.sklad : [];
        let n = koza && koza.fuel < BURN_TICKS && koza.by < 0 ? 1 : 0;
        for (const t of st.things)
          if (t.kind === 'drewno' && t.n > 0 && t.by < 0 && this.nasza(t) && !sklad.includes(t.y * size + t.x)) n++;
        return n;
      }
      case 'kuchnia':
        return this.shouldCook() ? 1 : 0;
      case 'budowa': {
        let n = st.builds.filter((b) => b.by < 0).length;
        const plan = st.plot?.plan;
        if (plan) {
          const holder = plan.by >= 0 ? st.pawns.find((q) => q.id === plan.by) : undefined;
          if (holder?.job?.t !== 'plot') n++;
        }
        return n;
      }
      case 'naprawy': {
        let n = (st.fence?.holes ?? []).filter(
          (h) => h.patch <= 0 && !st.pawns.some((q) => q.job?.t === 'patch' && q.job.target === h.id),
        ).length;
        st.damage.forEach((d, k) => {
          if (d.fixed || !st.apts.find((a) => a.apt === d.apt)?.ours) return;
          if (!st.pawns.some((q) => q.job?.t === 'repair' && q.job.target === k)) n++;
        });
        return n;
      }
      case 'drwal': {
        if (this.zapasDrewna() >= progi(st).drewno) return 0;
        const felled = new Set(st.felled);
        const zajete = new Set<number>();
        for (const q of st.pawns) if (q.job?.t === 'chop') zajete.add(q.job.target);
        const suche = st.tut.step >= 0 && st.tut.step <= TUT_STEPS.indexOf('sciete') ? this.dry : -1;
        let n = 0;
        for (let k = 0; k < this.w.trees.length; k++) {
          if (k === suche || felled.has(k) || zajete.has(k)) continue;
          if (!poza && !this.naszTeren(this.trunk[k])) continue;
          if (!naLiniiObwodu(size, this.trunk[k], (i) => this.yardMask[i] === 1)) n++;
        }
        return n;
      }
      case 'noszenie': {
        if (!st.fence) return 0;
        let n = 0;
        for (const t of st.things)
          if (
            CARRY_MATS.has(t.kind) &&
            t.n > 0 &&
            t.by < 0 &&
            !this.insideAt(t.y * size + t.x) &&
            (poza || this.naszTeren(t.y * size + t.x))
          )
            n++;
        return n;
      }
      case 'warsztat':
        return (this.warsztatDeski() ? 1 : 0) + (this.warsztatCzesci() ? 1 : 0) + (this.warsztatDzida() ? 1 : 0);
      case 'szaber': {
        const w = this.w;
        let n = 0;
        const h = this.house;
        if (h)
          for (const room of h.rooms) {
            const g = room.apt >= 0 ? st.apts.find((a) => a.apt === room.apt) : undefined;
            if (!g || !searchable(w, g) || g.searched.includes(room.id)) continue;
            if (!st.pawns.some((q) => q.job?.t === 'search' && q.job.target === room.id)) n++;
          }
        st.sasiedzi?.budynki.forEach((b, k) => {
          if (!b.otwarty) return;
          for (const room of wnetrze(w, b.bid).rooms) {
            if (moznaPrzeszukac(st, w, k, room.id) !== 'tak') continue;
            const g = gid(k, room.id);
            if (!poza && !this.kafelkiPokoju(g).some((i) => this.naszTeren(i))) continue;
            if (!st.pawns.some((q) => q.job?.t === 'loot' && q.job.target === g)) n++;
          }
        });
        this.wrakiSwiata ??= wrecksOf(w);
        for (const wr of this.wrakiSwiata) {
          const t = wreckTile(wr, size);
          if (wreckStage(st.wraki, t) !== 0 || crewAt(st, t) || (!poza && !this.naszTeren(t))) continue;
          if (!st.pawns.some((q) => q.job?.t === 'wreck' && q.job.target === t)) n++;
        }
        return n;
      }
      case 'badania': {
        // wolne miejsca przy stole pracowni, gdy wybrane badanie idzie (te same warunki co w `startResearch`, bez pory
        // dnia); bez pracowni i bez wybranego badania 0
        const cur = this.researchTech();
        const desk = this.pracownia();
        if (!cur || !desk || kartka(st, cur, modeOf(st)).stan !== 'w_toku') return 0;
        return wolneMiejsca(st.pawns, desk.id);
      }
      default:
        return 0;
    }
  }

  /** Plan dnia mieszkańca: nocą śpi w swoim mieszkaniu, rano siedzi w domu, od WORK_START do 18:00 pracuje na
      podwórku (za siatką, nie przełazi dziurami) albo, gdy ma wiedzę w dziedzinie bieżącego badania i przy stole
      pracowni jest wolne miejsce, bada w pracowni, od 18:00 grzeje się przy ognisku, jeśli się pali, potem wraca
      do domu. */
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
    if (this.residentDay()) kind = STAY_YARD;
    else if (h >= 18 && h < 20 && this.campfire()) kind = STAY_FIRE;
    // wróg na podwórku: nikt tam nie wychodzi
    if (kind !== STAY_HOME && this.yardDanger()) kind = STAY_HOME;
    // zamiast podwórka: stół pracowni (zajęte miejsca, głód i pora posiłku zostawiają plan jak był)
    const dom = badaniaDom(st);
    if (kind === STAY_YARD && dom !== null && this.labSkill(p, dom) && !this.urgent(p) && !this.mealDue(p))
      if (this.startResearch(p)) return;
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

  /** czy ogień w naszych paleniskach jest teraz potrzebny (warunki przy KOZA_WARM); polecenie gracza i dyżur
      go nie pytają */
  private kozaWanted(): boolean {
    const st = this.st;
    const h = this.house;
    if (!h) return false;
    if (st.tut.step >= 0 && st.tut.step < TUT_STEPS.length) return true;
    const h24 = hourOf(st.tick);
    if (h24 >= KOZA_EVENING && h24 < 22) return true;
    const cores = st.pawns.filter((q) => q.kind === 'core' && !q.away && q.needs);
    if (cores.some((q) => q.needs!.warm < KOZA_WARM)) return true;
    const ours = this.ourApts();
    if (h.rooms.some((r) => ours.has(r.apt) && st.temps[r.id] < KOZA_MIN)) return true;
    // bez gazu gotuje się na kozie: rozpalić, zanim ktoś zgłodnieje
    const gas = (homeStove(h, this.w.size, st.things)?.fuel ?? 0) > 0;
    return !gas && !!this.food() && cores.some((q) => q.needs!.food < PECKISH);
  }

  /** dokładanie do paleniska: z własnego drewna albo ze stosu (sam bierze tylko ze składu i dopiero, gdy ogień się
      kończy i jest potrzebny, kozaWanted; z polecenia z każdego stosu, kiedy tylko coś wejdzie). Bez wskazanego celu
      wybiera to z naszych palenisk (koza zarządu, kozy z beczek, kocioł), któremu zostało najmniej ognia
      (paleniskoDoDolozenia). */
  private startRefuel(p: Pawn, order: boolean, koza = this.paleniskoDoDolozenia(p, order)): boolean {
    if (!koza) return false;
    if (
      !order &&
      ((koza.by >= 0 && koza.by !== p.id) || koza.fuel >= BURN_TICKS * wagaPaleniska(koza.kind) || !this.kozaWanted())
    )
      return false;
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

  /** Noszenie drewna do składu: z rąk albo z najbliższego stosu poza składem. Stos bierze tylko tam, gdzie pionek
      może pracować bez polecenia (`mozeTam`: nasz teren, a za siatką tylko osoba z przełącznikiem i za dnia, bo nocą
      praca poza nią przerwałaby się w następnej sekundzie) i do którego wolno dojść (`dojdzieWDomu`: stos w innej
      klatce bloku tylko w trybie zwykłym za dnia, w trybie zombie i nocą odpada), i gdzie nie czai się szwendacz przy
      siatce. */
  private startHaul(p: Pawn): boolean {
    const size = this.w.size;
    const dest = this.dropTile(p);
    if (dest < 0) return false;
    if (p.carry > 0) {
      if (!this.idz(p, dest, false)) return false;
      this.setJob(p, this.newJob('haul', -1, dest, false, 1), true);
      return true;
    }
    const pile = this.pileFor(p, 'outside', -1, (i) => this.mozeSam(p, i) && !this.zagrozone(i));
    if (!pile) return false;
    const pt = pile.y * size + pile.x;
    if (!this.idz(p, pt, false)) return false;
    this.setJob(p, this.newJob('haul', pile.id, pt, false), true);
    pile.by = p.id;
    return true;
  }

  /** Praca j (ścinanie z polecenia albo kurs z drewnem) przechodzi w noszenie drewna z okolicy pnia `stump` (sterty
      do 4 kafelków od niego, poza składem) do składu: kolejny kurs z polecenia (`order`), zapamiętany pień w `j.from`.
      false, gdy nie ma czego nosić, w składzie nie ma miejsca albo nie da się dojść. */
  private haulOn(p: Pawn, j: Job, stump: number): boolean {
    if (p.carry > 0 || this.dropTile(p) < 0) return false;
    const pile = this.pileFor(p, 'outside', stump);
    if (!pile) return false;
    const pt = pile.y * this.w.size + pile.x;
    if (!this.go(p, pt)) return false;
    j.t = 'haul';
    j.phase = 0;
    j.target = pile.id;
    j.tile = pt;
    j.from = stump;
    j.order = true;
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

  /** Czuwający przy kozie: gdy w którymś z naszych palenisk (koza zarządu, kozy z beczek, kocioł) ognia zostaje mniej niż
      na sztukę, a do niego coś wejdzie, idzie po drewno (najpierw ze składu, potem z każdego stosu) albo od razu
      dokłada z rąk, najpierw do tego, któremu zostało najmniej. Palenisko jest wtedy jego (by), żeby nikt nie szedł
      z drugim naręczem. */
  private tendKoza(p: Pawn, j: Job): void {
    const koza = this.paleniskoDoDolozenia(p, false);
    if (!koza) return;
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

  /** palenisko, które czuwający wziął na siebie (by), a gdy żadne, koza zarządu */
  private paleniskoCzuwajacego(p: Pawn): Thing | undefined {
    return this.paleniska().find((t) => t.by === p.id) ?? this.koza();
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
      do niego, a bez kind tylko materiał, którego w osiągalnych stertach starczy na całą łatę. `nasze`: tylko sterty
      na naszym terenie, do których da się dojść bez wychodzenia z niego (automat nie wychodzi po materiał na ulicę
      ani do innej klatki bloku). */
  private heapFor(p: Pawn, kind = '', need = PATCH_COST, nasze = false): Thing | undefined {
    const size = this.w.size;
    const region = this.regionOf(p);
    const free = (t: Thing) =>
      (t.kind === 'deski' || t.kind === 'zlom') &&
      t.n > 0 &&
      (t.by < 0 || t.by === p.id) &&
      this.reg[t.y * size + t.x] === region &&
      !this.uSasiada(t) &&
      (!nasze || (this.naszTeren(t.y * size + t.x) && this.dojdzieWDomu(p, t.y * size + t.x)));
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

  /** łatanie: po deski albo złom na najbliższą stertę, potem do dziury; bez polecenia (`order` fałszywe) materiał
      tylko z naszego terenu */
  private startPatch(p: Pawn, hole: Hole, order = true): boolean {
    const heap = this.heapFor(p, '', PATCH_COST, !order);
    if (!heap) return false;
    const size = this.w.size;
    const ht = heap.y * size + heap.x;
    if (!this.idz(p, ht, order)) return false;
    const j = this.newJob('patch', hole.id, ht, order);
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
      zasieki i barykada przestają trzymać siatkę). */
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
    if (naObwodzie(kind)) this.fenceAt(t.y * this.w.size + t.x, false, t.prev ?? 0);
    // stół zniknął: nikt już nie idzie do niego ani przy nim nie siedzi (wybór i postęp badań zostają)
    if (kind === 'pracownia') this.endResearchJobs();
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
    // bez polecenia w trybie zombie nie buduje przy siatce (zasieki), kiedy szwendacz jest bliżej niż 10 m od planu
    if (!order && this.zagrozone(b.y * this.w.size + b.x)) return false;
    // plan w pomieszczeniu z innej klatki bloku (dojście ulicą) w trybie zombie i nocą albo zasieki bez stanowiska po
    // stronie podwórka: bez przełącznika nie nosi do nich materiału, którego i tak by nie dowiózł (zasieki stoją na
    // siatce, więc liczy się stanowisko)
    if (!order) {
      const miejsce =
        BUILDS[b.kind].place === 'obwod' ? this.buildStand(p, b) : this.buildCenter(b.kind, b.x, b.y, b.rot);
      if (miejsce < 0 || !this.dojdzieWDomu(p, miejsce)) return false;
    }
    // materiału musi starczyć na całość, inaczej zostaje na planie, którego nikt nie skończy
    if (!this.ready(b) && !this.coverable(p, b, this.materialOk(p, order, 'build'))) return false;
    const j = this.newJob('build', b.id, this.tileOf(p), order);
    if (this.ready(b)) {
      const stand = this.buildStand(p, b);
      if (stand < 0 || !this.idz(p, stand, order)) return false;
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
      czego jeszcze potrzebują plany, przy których pracuje ktoś inny (bez tego, co już niesie). `ok`: tylko sterty
      z kafelków, z których ta praca może brać (budowa bez polecenia: `mozeTam`). */
  private coverable(p: Pawn, b: BuildPlan, ok?: (tile: number) => boolean): boolean {
    const st = this.st;
    const size = this.w.size;
    const region = this.regionOf(p);
    const free: Partial<Record<Mat, number>> = {};
    for (const t of st.things) {
      if (!MATS.includes(t.kind as Mat) || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      const i = t.y * size + t.x;
      if (this.reg[i] === region && (!ok || ok(i))) free[t.kind as Mat] = (free[t.kind as Mat] ?? 0) + t.n;
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
    b.work += tempoPracy(st, p, 'budowa');
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
    if (naObwodzie(b.kind))
      st.things[st.things.length - 1].prev = this.fenceAt(b.y * this.w.size + b.x, true, 0, b.kind);
    this.updateCap();
  }

  /** Zasieki albo barykada na odcinku siatki: dziura pod nimi zamknięta, kafelek siatki twardszy (ZASIEKI_HP albo
      BARYKADA_HP według `kind`). Zwraca to, co było wcześniej (łata dziury sprzed pierwszej takiej budowli na niej
      albo wytrzymałość kafelka). Przy rozbiórce (on: false) wraca `prev`, chyba że na tej samej dziurze stoi jeszcze
      inna budowla z obwodu: wtedy dziura zostaje załatana jej wytrzymałością. */
  private fenceAt(tile: number, on: boolean, prev = 0, kind = 'zasieki'): number {
    const f = this.st.fence;
    const shape = fenceShape(this.w);
    if (!f || !shape) return 0;
    const size = this.w.size;
    const hole = f.holes.find((x) => x.tiles.includes(tile));
    if (hole) {
      const other = this.st.things.find(
        (t) => naObwodzie(t.kind) && t.y * size + t.x !== tile && hole.tiles.includes(t.y * size + t.x),
      );
      const was = other?.prev ?? hole.patch;
      const held = other ? obwodHp(other.kind) : 0;
      hole.patch = on ? Math.max(obwodHp(kind), held) : other ? held : prev;
      this.rebuild();
      return was;
    }
    const k = shape.tiles.indexOf(tile);
    if (k < 0) return 0;
    const was = f.hp[k];
    f.hp[k] = on ? obwodHp(kind) : prev;
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
      je przeszukuje); `order` fałszywe: praca zarządu z automatu (Szaber). false, gdy się nie zaczęło. Polecenie na
      pokój, który ta osoba już przeszukuje sama, robi z tej pracy pracę z polecenia (`podnies`). */
  private startSearch(p: Pawn, room: number, order = true): boolean {
    const g = this.aptOfRoom(room);
    if (!g || !searchable(this.w, g) || g.searched.includes(room)) return false;
    const robi = this.st.pawns.find((q) => q.job?.t === 'search' && q.job.target === room);
    if (robi) return order && this.podnies(robi, p);
    const spot = this.roomSpot(p, room);
    if (spot < 0 || !this.idz(p, spot, order, 'szaber')) return false;
    this.setJob(p, this.newJob('search', room, spot, order), false);
    return true;
  }

  /** Polecenie gracza na pracę, którą już ktoś robi: gdy to ta sama osoba (`p`), jej praca z automatu staje się pracą
      z polecenia (`order`, reguły poleceń i bez dopisku „(sam)”), bez zaczynania od nowa; true. Gdy robi ją ktoś inny,
      nic się nie zmienia; false (jak dotąd: zajęte). */
  private podnies(robi: Pawn, p: Pawn): boolean {
    if (robi !== p || !p.job) return false;
    p.job.order = true;
    return true;
  }

  /** łup z przeszukania: z tabeli według powodu opuszczenia (w domu komitetu z dokładką), deterministycznie z ziarna
      gry i pomieszczenia; do tego rzut na książkę (znajdzKsiazke) z osobnego generatora */
  private searchDone(room: number, g: AptGame, at: number): void {
    const h = this.house!;
    const rnd = mulberry((Math.imul(this.st.seed | 0, 9973) ^ Math.imul(room + 1, 7919) ^ 0x51ab) >>> 0);
    const loot = searchLoot(g, h.rooms[room].kind, this.roomTiles[room].length, rnd);
    for (const [m, n] of Object.entries(loot) as [Mat, number][]) if (n > 0) this.dropMat(at, m, n, room);
    g.searched.push(room);
    g.searched.sort((a, b) => a - b);
    this.znajdzKsiazke(ksiazkaZ(this.st.seed, room, SZANSA_KSIAZKI.mieszkanie), at);
  }

  /** Książka z przeszukania (src/sim/badania.ts: ksiazkaZ) trafia osobnym kanałem od razu na półkę osady (st.books),
      bez sterty na mapie, i do dziennika znalezisk (st.bookLog). Trzecia z tej samej dziedziny idzie na podpałkę: +1
      drewna przy pracowni, a bez niej w składzie (bez składu w miejscu przeszukania). Losowanie nie dotyka st.rng. */
  private znajdzKsiazke(k: { dom: TechDom; tytul: string } | null, at: number): void {
    if (!k) return;
    const polka = dodajKsiazke(this.st, k.dom) === 'polka';
    (this.st.bookLog ??= []).push({
      tick: this.st.tick,
      dom: k.dom,
      tytul: k.tytul,
      ...(polka ? {} : { podpalka: true }),
    });
    if (polka) return;
    const lab = this.st.things.find((t) => t.kind === 'pracownia');
    this.dropMat(lab ? lab.y * this.w.size + lab.x : (this.house?.sklad[0] ?? at), 'drewno', 1);
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

  /** Kafelek, z którego się naprawia: samo uszkodzenie, gdy da się na nim stanąć, inaczej najbliższy pionkowi sąsiedni
      (w mieszkaniu, na klatce albo, przy oknie w ścianie zewnętrznej, na dworze). Bez polecenia (`order` false) tylko
      kafelek, na którym wolno pracować i do którego wolno dojść (`mozeSam`): okno od ulicy naprawia się wtedy od środka
      albo z podwórka, a gdy przy nim wolno stanąć tylko na ulicy, miejsca nie ma (−1). Najbliższy liczy się od pionka,
      także od sterty w `takeFor`, więc i tam wybór przechodzi przez ten sam filtr. */
  private repairStand(p: Pawn, d: DamageGame, order = true): number {
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
        if (!order && !this.mozeSam(p, i)) continue;
        cand.push(i);
      }
    return cand.includes(d.tile) ? d.tile : this.nearest(p, cand);
  }

  /** Skąd praca bierze materiał (filtr kafelka sterty; undefined: z każdej osiągalnej sterty). Praca z polecenia
      bierze z każdej. Naprawa bez polecenia tylko z naszego terenu; budowa i płot bez polecenia z miejsc, na które
      wolno iść bez polecenia (`mozeTam`: ulica tylko dla osoby z przełącznikiem, za dnia i bez szwendacza przy stercie).
      Do tego do sterty musi być wolno dojść (`dojdzieWDomu`): sterta w innej klatce bloku, dostępna tylko ulicą, w trybie
      zombie i nocą nie zasłania sterty bliższej w drodze do celu ani nie wyprowadza osoby poza nasz teren. */
  private materialOk(p: Pawn, order: boolean, t: JobKind): ((tile: number) => boolean) | undefined {
    if (order) return undefined;
    if (t === 'repair') return (i) => this.naszTeren(i) && this.dojdzieWDomu(p, i);
    if (t === 'build' || t === 'plot') return (i) => this.mozeSam(p, i);
    return undefined;
  }

  /** materiałów do naprawy (brakujących) jest dość w stertach, do których zarząd dojdzie (`ok`: tylko sterty z tych
      kafelków) */
  private enoughFor(
    p: Pawn,
    need: Partial<Record<Mat, number>>,
    have: Partial<Record<Mat, number>>,
    ok?: (tile: number) => boolean,
  ): boolean {
    for (const [m, v] of Object.entries(need) as [Mat, number][]) {
      const left = v - (have[m] ?? 0) - (p.job?.what === m ? p.job.n : 0);
      if (left > 0 && this.reachableMat(p, m, ok) < left) return false;
    }
    return true;
  }

  /** ile sztuk materiału leży w stertach, do których pionek dojdzie (wolnych albo jego) */
  private reachableMat(p: Pawn, m: Mat, ok?: (tile: number) => boolean): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    let n = 0;
    for (const t of this.st.things)
      if (
        t.kind === m &&
        t.n > 0 &&
        (t.by < 0 || t.by === p.id) &&
        this.reg[t.y * size + t.x] === region &&
        !this.uSasiada(t) &&
        (!ok || ok(t.y * size + t.x))
      )
        n += t.n;
    return n;
  }

  /** najbliższa sterta materiału (wolna albo pionka) w jego obszarze (`ok`: tylko z tych kafelków) */
  private matStack(p: Pawn, m: Mat, ok?: (tile: number) => boolean): Thing | undefined {
    const size = this.w.size;
    const region = this.regionOf(p);
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (t.kind !== m || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      const i = t.y * size + t.x;
      if (this.reg[i] !== region || this.uSasiada(t) || (ok && !ok(i))) continue;
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
      const pile = this.matStack(p, m, this.materialOk(p, j.order, j.t));
      if (!pile) continue;
      const pt = pile.y * this.w.size + pile.x;
      if (!this.idz(p, pt, j.order)) continue;
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
      const next = this.matStack(p, j.what as Mat, this.materialOk(p, j.order, j.t));
      const at = next ? next.y * this.w.size + next.x : -1;
      if (next && this.dist2(p, at) <= GATHER_NEAR ** 2 && this.idz(p, at, j.order)) {
        j.from = next.id;
        j.tile = at;
        next.by = p.id;
        return true;
      }
    }
    if (stand < 0 || !this.idz(p, stand, j.order)) return false;
    j.phase = 1;
    j.tile = stand;
    return true;
  }

  /** naprawić uszkodzenie: materiałów musi być dość (doniesione plus w stertach w zasięgu, bez polecenia tylko
      na naszym terenie); false, gdy się nie zaczęło. Polecenie na uszkodzenie, które ta osoba już naprawia sama, robi
      z tej pracy pracę z polecenia (`podnies`). */
  private startRepair(p: Pawn, k: number, order = true): boolean {
    const d = this.st.damage[k];
    if (!d || d.fixed) return false;
    const robi = this.st.pawns.find((q) => q.job?.t === 'repair' && q.job.target === k);
    if (robi) return order && this.podnies(robi, p);
    const cost = REPAIR[d.kind].cost;
    if (!this.enoughFor(p, cost, d.have, this.materialOk(p, order, 'repair'))) return false;
    const j = this.newJob('repair', k, this.tileOf(p), order);
    this.setJob(p, j, false);
    if (this.fetchNext(p, j, cost, d.have)) return true;
    // wszystko już doniesione: od razu do pracy (a gdy czegoś brakuje, a do sterty nie ma drogi, nie ma pracy)
    const stand = this.repairStand(p, d, order);
    const komplet = (Object.entries(cost) as [Mat, number][]).every(([m, v]) => (d.have[m] ?? 0) >= v);
    if (!komplet || stand < 0 || !this.idz(p, stand, order)) {
      p.job = null;
      return false;
    }
    j.phase = 2;
    j.tile = stand;
    return true;
  }

  /** Naprawy: najpierw otwarta dziura w siatce, do której jest materiał na łatę (na naszym terenie) i miejsce, z którego
      się łata, potem uszkodzenie w naszym mieszkaniu (`apt.ours`), które nikt nie naprawia, na które starczy materiału
      i przy którym jest miejsce do pracy bez polecenia (`repairStand`: wolno tam stanąć i dojść, więc okno od ulicy
      naprawia się od środka, a uszkodzenie w pokoju z innej klatki bloku w trybie zombie i nocą odpada). Sam kafelek
      okna to ściana zewnętrzna poza naszym terenem, więc liczy się miejsce przy nim, nie on. Najbliższe najpierw; nie
      wzmacnia siatki (`brace` zostaje poleceniem). W trybie zombie pomija zlecenia, przy których jest szwendacz
      (bliżej niż 10 m). */
  private startNaprawy(p: Pawn): boolean {
    const st = this.st;
    const holes = (st.fence?.holes ?? []).filter(
      (h) =>
        h.patch <= 0 &&
        !st.pawns.some((q) => q.job?.t === 'patch' && q.job.target === h.id) &&
        !this.zagrozone(h.tiles[0], true),
    );
    // łata idzie po deski albo złom do najbliższej sterty, więc bez materiału i bez miejsca przy dziurze nic nie liczy
    if (holes.length && this.heapFor(p, '', PATCH_COST, true)) {
      holes.sort((a, b) => this.dist2(p, a.tiles[0]) - this.dist2(p, b.tiles[0]) || a.id - b.id);
      for (const h of holes) {
        const stand = this.standBy(p, h.tiles, 1);
        if (stand < 0 || !this.dojdzieWDomu(p, stand)) continue;
        if (this.startPatch(p, h, false)) return true;
        break;
      }
    }
    const naprawy: [number, number][] = [];
    st.damage.forEach((d, k) => {
      if (d.fixed || !st.apts.find((a) => a.apt === d.apt)?.ours || this.zagrozone(d.tile, true)) return;
      if (st.pawns.some((q) => q.job?.t === 'repair' && q.job.target === k)) return;
      naprawy.push([this.dist2(p, d.tile), k]);
    });
    naprawy.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, k] of naprawy) {
      const d = st.damage[k];
      if (
        !this.enoughFor(p, REPAIR[d.kind].cost, d.have, this.materialOk(p, false, 'repair')) ||
        this.repairStand(p, d, false) < 0
      )
        continue;
      return this.startRepair(p, k, false);
    }
    return false;
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
      return this.takeFor(p, j, (def.cost[m] ?? 0) - (d.have[m] ?? 0), this.repairStand(p, d, j.order));
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
    j.until =
      tick +
      Math.round(REPAIR[d.kind].work / (this.hasBuilt('warsztat') ? 1.5 : 1) / tempoPracy(this.st, p, 'naprawy'));
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

  /** przeszukać albo rozebrać wrak (tile: kafelek pod nim albo obok); jedna osoba naraz, rozbiórka po przeszukaniu;
      `order` fałszywe: praca zarządu z automatu (Szaber, tylko przeszukanie). false, gdy się nie zaczęło. */
  private startWreck(p: Pawn, tile: number, how: 'szukaj' | 'rozbierz', order = true): boolean {
    const r = wreckAt(this.w, tile);
    if (!r) return false;
    const t = wreckTile(r, this.w.size);
    if (wreckStage(this.st.wraki, t) !== (how === 'szukaj' ? 0 : 1)) return false;
    if (this.st.pawns.some((q) => q !== p && q.job?.t === 'wreck' && q.job.target === t)) return false;
    if (crewAt(this.st, t)) return false;
    const stand = this.wreckStand(p, r);
    if (stand < 0 || !this.idz(p, stand, order, 'szaber')) return false;
    const j = this.newJob('wreck', t, stand, order);
    j.what = how;
    this.setJob(p, j, false);
    return true;
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

  /** Sterta łupu za siatką do noszenia: najbliższa pionkowi, do CARRY_REACH metrów od kafelka anchor. Z wnętrza
      sąsiedniego budynku (M2 fala 2) cały łup z tego budynku, bo tam nie jest jeszcze nasz. Praca bez polecenia
      (`!order`) bierze tylko to, co wolno jej wziąć bez polecenia i do czego wolno dojść (`mozeSam`), i nie sięga po
      stertę przy szwendaczu. */
  private lootNear(p: Pawn, anchor: number, order = true): Thing | undefined {
    const size = this.w.size;
    const ax = anchor % size;
    const ay = Math.floor(anchor / size);
    const region = this.regionOf(p);
    const obcy = uSasiada(this.st, this.w, anchor) ? this.w.bid[anchor] : -1;
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (!CARRY_MATS.has(t.kind) || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) continue;
      const far = Math.max(Math.abs(t.x - ax), Math.abs(t.y - ay)) > CARRY_REACH;
      if (far && (obcy < 0 || this.w.bid[t.y * size + t.x] !== obcy)) continue;
      const i = t.y * size + t.x;
      if (this.insideAt(i) || this.reg[i] !== region) continue;
      if (!order && (!this.mozeSam(p, i) || this.zagrozone(i))) continue;
      const d = this.dist2(p, i);
      if (d < bd || (d === bd && best && t.id < best.id)) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Praca j przechodzi w noszenie łupu leżącego przy anchor (następny kurs): do sterty po materiał. false, gdy
      nie ma czego nosić albo nie da się dojść (bez siatki nie ma „za siatką”, więc łup zostaje, gdzie leży). Praca
      zostaje z tym samym `order`, z jakim zaczęła (z polecenia albo z automatu), więc automat przerywa się nocą. */
  private carryOn(p: Pawn, j: Job, anchor: number): boolean {
    if (!this.st.fence) return false;
    const next = this.lootNear(p, anchor, j.order);
    if (!next) return false;
    const i = next.y * this.w.size + next.x;
    if (!this.idz(p, i, j.order)) return false;
    j.t = 'carry';
    j.phase = 0;
    j.target = next.id;
    j.tile = i;
    j.from = anchor;
    next.by = p.id;
    return true;
  }

  /** zanieść stertę zza siatki (i sterty obok niej) na podwórko; false, gdy się nie zaczęło */
  private startCarry(p: Pawn, id: number, order = true): boolean {
    const t = this.thing(id);
    if (!t || !this.st.fence || !CARRY_MATS.has(t.kind) || t.n <= 0 || (t.by >= 0 && t.by !== p.id)) return false;
    const i = t.y * this.w.size + t.x;
    if (this.insideAt(i) || !this.idz(p, i, order)) return false;
    const j = this.newJob('carry', t.id, i, order);
    j.from = i;
    this.setJob(p, j, false);
    t.by = p.id;
    return true;
  }

  /** Noszenie: najbliższa wolna sterta materiału z CARRY_MATS leżąca poza podwórkiem, na ulicy albo w budynku otoczonym
      wspólnym płotem, na którą wolno iść bez polecenia (`mozeTam`: ulica i nieotoczone cudze budynki tylko z przełącznikiem
      i za dnia), bez szwendacza przy siatce. Zaczyna tylko, gdy na podwórku jest miejsce na ten materiał (inaczej
      praca skończyłaby się po zabraniu sterty, a następna sekunda zaczęłaby od nowa). */
  private startNoszenie(p: Pawn): boolean {
    if (!this.st.fence) return false;
    const size = this.w.size;
    const region = this.regionOf(p);
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      if (!CARRY_MATS.has(t.kind) || t.n <= 0 || t.by >= 0) continue;
      const i = t.y * size + t.x;
      if (this.insideAt(i) || this.reg[i] !== region || !this.mozeSam(p, i) || this.zagrozone(i)) continue;
      const d = this.dist2(p, i);
      if (d < bd || (d === bd && best && t.id < best.id)) {
        bd = d;
        best = t;
      }
    }
    if (!best || this.lootSpot(p, best.kind) < 0) return false;
    return this.startCarry(p, best.id, false);
  }

  /** Szaber: nieprzeszukane pomieszczenie pustego mieszkania w siedzibie (i w domu komitetu), w otoczonych budynkach
      i w otwartych cudzych budynkach, potem wraki (tylko przeszukanie; rozbiórka hałasuje i trwa godzinami, więc
      zostaje poleceniem). Nasz teren (siedziba, otoczone budynki) przed resztą, w obrębie najbliższe; poza naszym
      terenem tylko przy `mozeTam` (przełącznik, dzień, bez szwendacza). Nigdy mieszkań z lokatorów (także pod ich
      nieobecność: spada stosunek i robi się wrogość) i nigdy nie otwiera ani nie wyważa drzwi: do pomieszczenia za
      zamkniętymi drzwiami nie ma drogi, więc go pomija. Pokoje z drugich klatek bloku (dojście ulicą) tylko z przełącznikiem,
      także w trybie zwykłym za dnia (trasa 'szaber'). Kolejne pomieszczenia nie liczą dróg bez końca: próbuje
      najwyżej trzech najbliższych, a każdy kandydat jest już w obszarze osoby. */
  private startSzaber(p: Pawn): boolean {
    const st = this.st;
    const w = this.w;
    const size = w.size;
    const cele: { tier: number; d: number; typ: number; id: number; run: () => boolean }[] = [];
    // siedziba: mieszkania z pomieszczeniami do przeszukania (reszta odpada jednym porównaniem)
    const h = this.house;
    if (h) {
      if (!this.pokojeMieszkan) {
        this.pokojeMieszkan = new Map();
        for (const r of h.rooms)
          if (r.apt >= 0) this.pokojeMieszkan.set(r.apt, [...(this.pokojeMieszkan.get(r.apt) ?? []), r.id]);
      }
      for (const g of st.apts) {
        const pokoje = this.pokojeMieszkan.get(g.apt);
        if (!pokoje || g.searched.length >= pokoje.length || !searchable(w, g)) continue;
        for (const room of pokoje) {
          if (g.searched.includes(room) || st.pawns.some((q) => q.job?.t === 'search' && q.job.target === room))
            continue;
          // pokój w innej klatce tego samego bloku (droga ulicą) odpada bez przełącznika, bez liczenia miejsca i drogi
          const posadzka = this.roomTiles[room];
          if (!posadzka.length || !this.dojdzieWDomu(p, posadzka[0], 'szaber')) continue;
          const spot = this.roomSpot(p, room);
          // w trybie zombie nie wchodzi do pokoju, w którym (albo tuż obok którego) jest szwendacz
          if (spot < 0 || this.zagrozone(spot, true)) continue;
          cele.push({ tier: 0, d: this.dist2(p, spot), typ: 0, id: room, run: () => this.startSearch(p, room, false) });
        }
      }
    }
    // otwarte budynki sąsiadów: pokoje z posadzką w obszarze osoby (za zamkniętymi drzwiami nie ma drogi), na które
    // wolno iść bez polecenia; 'szaber' z moznaPrzeszukac to mieszkanie lokatorów pod ich nieobecność: tego automat nie robi
    st.sasiedzi?.budynki.forEach((b, k) => {
      if (!b.otwarty) return;
      const region = this.regionOf(p);
      for (const r of wnetrze(w, b.bid).rooms) {
        if (moznaPrzeszukac(st, w, k, r.id) !== 'tak') continue;
        const g = gid(k, r.id);
        const tiles = this.kafelkiPokoju(g);
        const wObszarze = tiles.find((i) => this.reg[i] === region);
        if (wObszarze === undefined || !this.mozeTam(p, wObszarze) || !this.dojdzieWDomu(p, wObszarze, 'szaber'))
          continue;
        if (st.pawns.some((q) => q.job?.t === 'loot' && q.job.target === g)) continue;
        const spot = this.pokojSpot(p, tiles);
        if (spot < 0 || this.zagrozone(spot, true)) continue;
        const tier = this.naszTeren(spot) ? 0 : 1;
        cele.push({ tier, d: this.dist2(p, spot), typ: 1, id: g, run: () => this.startLoot(p, b.bid, r.id, false) });
      }
    });
    // wraki: tylko nieprzeszukane, na które wolno iść (najtańsze sprawdzenia najpierw)
    this.wrakiSwiata ??= wrecksOf(w);
    for (const wr of this.wrakiSwiata) {
      const t = wreckTile(wr, size);
      if (wreckStage(st.wraki, t) !== 0 || !this.mozeTam(p, t)) continue;
      if (crewAt(st, t) || st.pawns.some((q) => q !== p && q.job?.t === 'wreck' && q.job.target === t)) continue;
      const stand = this.wreckStand(p, wr);
      if (stand < 0 || !this.mozeTam(p, stand) || this.zagrozone(stand) || !this.dojdzieWDomu(p, stand, 'szaber'))
        continue;
      const tier = this.naszTeren(stand) ? 0 : 1;
      cele.push({ tier, d: this.dist2(p, stand), typ: 2, id: t, run: () => this.startWreck(p, t, 'szukaj', false) });
    }
    cele.sort((a, b) => a.tier - b.tier || a.d - b.d || a.typ - b.typ || a.id - b.id);
    for (const c of cele.slice(0, 3)) if (c.run()) return true;
    return false;
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
      if (dest < 0 || !this.idz(p, dest, j.order)) return false;
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
      zerem, bo nic się nie nosi). Materiał zużywa się na końcu każdej sztuki, jak przy dzidzie. Bez polecenia
      (`order` fałszywe, automat Warsztatu) materiał tylko z naszego terenu. false, gdy materiału nie starcza, nie ma
      warsztatu albo drogi do niego. */
  private startSaw(p: Pawn, what: Product, n: number, order = true): boolean {
    const r = RECIPES[what];
    if (!r || n < 1 || this.workStock(r.from, !order) < r.n) return false;
    const ws = this.workshopFor(p);
    if (!ws || !this.idz(p, ws.stand, order)) return false;
    const j = this.newJob('saw', ws.t.id, ws.stand, order);
    j.what = what;
    j.from = n;
    this.setJob(p, j, false);
    ws.t.by = p.id;
    return true;
  }

  private sawWork(p: Pawn, j: Job, at: boolean): boolean {
    const tick = this.st.tick;
    const ws = this.thing(j.target);
    const r = RECIPES[j.what as Product];
    if (ws?.kind !== 'warsztat' || ws.by !== p.id || !r) return false;
    // praca bez polecenia bierze materiał tylko z naszego terenu
    const nasze = !j.order;
    if (j.phase === 0) {
      if (!at) return false;
      // materiał w drodze (ktoś niesie drewno do składu): czeka przy warsztacie
      if (this.workStock(r.from, nasze) < r.n) return this.inTransit(p, r.from) > 0;
      j.phase = 1;
      j.t0 = tick;
      j.until = tick + this.czasPracy(p, 'warsztat', pracaPrzepisu(j.what as Product, this.st.techDone));
      this.face(p, ws.x + ws.w / 2, ws.y + ws.h / 2);
      return true;
    }
    if (tick < j.until) return true;
    if (!this.takeForWork(r.from, r.n, nasze)) return this.inTransit(p, r.from) > 0;
    this.dropMat(j.tile, j.what, 1);
    j.from--;
    if (j.from <= 0 || this.workStock(r.from, nasze) + this.inTransit(p, r.from) < r.n) return false;
    j.t0 = tick;
    j.until = tick + this.czasPracy(p, 'warsztat', pracaPrzepisu(j.what as Product, this.st.techDone));
    return true;
  }

  /* ---------- badania ---------- */

  /** bieżące badanie, jeśli istnieje w drzewku (stan ze starego zapisu może wskazywać technologię, której nie ma) */
  private researchTech(): string | null {
    const cur = this.st.research?.cur;
    return cur && Object.hasOwn(TECH_BY, cur) ? cur : null;
  }

  /** pracownia (jest najwyżej jedna) */
  private pracownia(): Thing | undefined {
    return this.st.things.find((t) => t.kind === 'pracownia');
  }

  /** Wybór badania: tylko kartka do wzięcia, w toku albo stojąca (kartki z wymaganiami, bez wiedzy, odwrócone i
      zbadane odpadają); tech null zdejmuje wybór i podnosi wszystkich od stołu. Zmiana badania nie rusza zapisanego
      postępu żadnego z nich. `research` powstaje dopiero przy pierwszym wyborze. */
  private chooseResearch(tech: string | null): void {
    const st = this.st;
    if (tech === null) {
      if (!st.research?.cur) return;
      st.research.cur = null;
      this.endResearchJobs();
      return;
    }
    if (!Object.hasOwn(TECH_BY, tech)) return;
    const stan = kartka(st, tech, modeOf(st)).stan;
    if (stan !== 'do_wziecia' && stan !== 'w_toku' && stan !== 'stoi') return;
    st.research ??= { cur: null, prog: {}, at: {} };
    st.research.cur = tech;
  }

  /** Włączenie sieci: tylko gdy sieć bez miedzi (`t_siec`) jest zbadana, choćby bez fabryki, i stoi pracownia; ustawia
      `research.siec` (pole powstaje dopiero teraz, razem z `research`, jeśli go jeszcze nie ma). Drugie włączenie nic
      nie zmienia. */
  private wlaczSiec(): void {
    const st = this.st;
    if (!siecZbadana(st) || !this.pracownia() || siecWlaczona(st)) return;
    st.research ??= { cur: null, prog: {}, at: {} };
    st.research.siec = true;
  }

  /** zarząd do stołu pracowni; ile miejsc, tyle osób (kolejność z zaznaczenia) */
  private orderStudy(pawns: Pawn[], thing: number): void {
    if (this.thing(thing)?.kind !== 'pracownia') return;
    for (const p of pawns) this.startResearch(p, true);
  }

  /** Osoba siada do badania: idzie do wolnego miejsca przy stole pracowni (dwa miejsca, każde dla jednej osoby;
      zajęcie pamięta praca, a nie rzecz, bo `Thing.by` mieści jednego). false, gdy nic nie wybrano, badanie stoi
      bez wiedzy, nie ma pracowni, jest noc (po dojściu i tak by wstała: `researchWork`), miejsc brak albo nie da się
      dojść. order: z polecenia gracza, więc nie ustępuje wrogowi na podwórku, ale pilna potrzeba i noc ją przerywają.
      Woła ją też praca ludzi i plan dnia lokatorów. Zarząd bez polecenia bierze stół tylko przy regule pracy automatu
      (`mozeSam`, droga `idz`): pracownia w innej klatce bloku w trybie zombie i nocą odpada. */
  startResearch(p: Pawn, order = false): boolean {
    const st = this.st;
    const cur = this.researchTech();
    const desk = this.pracownia();
    if (!cur || !desk || p.away || this.night() || kartka(st, cur, modeOf(st)).stan !== 'w_toku') return false;
    if (wolneMiejsca(st.pawns, desk.id, [p.id]) < 1) return false;
    const stand = this.beside(p, desk);
    if (stand < 0 || this.taken(p).includes(stand)) return false;
    // zarząd bez polecenia idzie do stołu jak do każdej pracy automatu: tylko tam, gdzie wolno pracować i dojść
    // (`mozeSam`; pracownia w innej klatce bloku w trybie zombie i nocą odpada), drogą `idz`; mieszkańcy i polecenie: `go`
    const sam = !order && p.kind === 'core';
    if (sam && (!this.mozeSam(p, stand) || this.zagrozone(stand))) return false;
    if (!(sam ? this.idz(p, stand, false) : this.go(p, stand))) return false;
    this.setJob(p, this.newJob('research', desk.id, stand, order), false);
    return true;
  }

  /** Praca przy stole: faza 0 dojście i siadanie, faza 1 siedzi (postęp liczy researchTick po kroku). Kończy się, gdy
      stołu albo wyboru nie ma i z nastaniem nocy, także praca z polecenia (projekt, „Kto bada”): osoba idzie spać,
      a rano nie wraca sama, polecenie trzeba dać od nowa. Mieszkaniec wstaje ponadto po swoich godzinach na podwórku
      i wtedy, gdy zmienione badanie jest z dziedziny, w której jego osoba nic nie umie (zarząd bada też bez
      umiejętności, mieszkaniec tylko z nią, `labSkill`). */
  private researchWork(p: Pawn, j: Job, at: boolean): boolean {
    const desk = this.thing(j.target);
    const dom = badaniaDom(this.st);
    if (desk?.kind !== 'pracownia' || dom === null || this.night()) return false;
    if (p.kind === 'resident' && (!this.residentDay() || !this.labSkill(p, dom))) return false;
    if (j.phase === 1) return true;
    if (!at) return false;
    j.phase = 1;
    j.t0 = this.st.tick;
    this.face(p, desk.x + desk.w / 2, desk.y + desk.h / 2);
    return true;
  }

  /** Postęp badania w tym kroku: każda siedząca osoba dodaje swoje tempo na tick (punkty na godzinę gry / ticki na
      godzinę). Liczy się raz na krok, po usunięciu zabitych, więc wiedza osady (kto jest na miejscu) nie liczy tych,
      którzy zginęli w tym kroku. Stojące badanie (wiedza spadła) nie rośnie. Po przekroczeniu kosztu technologia
      trafia do techDone, tick ukończenia do `at`, wybór schodzi, a wszyscy wstają od stołu; `prog` zostaje. */
  private researchTick(): void {
    const st = this.st;
    const cur = this.researchTech();
    if (!cur) return;
    const seated = st.pawns.filter((p) => p.job?.t === 'research' && p.job.phase === 1);
    if (!seated.length || kartka(st, cur, modeOf(st)).stan !== 'w_toku') return;
    const dom = TECH_BY[cur].dom;
    let add = 0;
    for (const p of seated) add += tempoOsoby(st.people[p.person] ?? { skills: {}, traits: [] }, dom) / TICKS_PER_HOUR;
    const r = st.research!;
    r.prog[cur] = (r.prog[cur] ?? 0) + add;
    if (r.prog[cur] < kosztTech(cur)) return;
    (st.techDone ??= []).push(cur);
    r.at[cur] = st.tick;
    r.cur = null;
    this.endResearchJobs();
  }

  /** wszyscy idący do stołu i siedzący przy nim wstają (koniec badania, zdjęcie wyboru, rozbiórka pracowni) */
  private endResearchJobs(): void {
    for (const p of this.st.pawns) if (p.job?.t === 'research') this.done(p);
  }

  /** materiał na przeróbkę: wszystkie sterty danego rodzaju, także te, które ktoś właśnie niesie do składu
      (inaczej piłujący kończyłby pracę za każdym razem, gdy ktoś inny weźmie stos drewna do składu); `nasze`: tylko
      sterty na naszym terenie, bez wnętrz sąsiadów (praca bez polecenia) */
  private workStock(kind: string, nasze = false): number {
    return this.st.things.reduce((a, t) => a + (t.kind === kind && t.n > 0 && (!nasze || this.nasza(t)) ? t.n : 0), 0);
  }

  /** rzecz leży na naszym terenie i jest nasza (nie we wnętrzu sąsiada, który nie jest otoczony naszym płotem) */
  private nasza(t: Thing): boolean {
    return this.naszTeren(t.y * this.w.size + t.x) && !this.uSasiada(t);
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
      spoza składu, bo skład jest na noc do kozy. `nasze`: tylko z naszego terenu. false, gdy nie starczy. */
  private takeForWork(kind: string, n: number, nasze = false): boolean {
    if (this.workStock(kind, nasze) < n) return false;
    const size = this.w.size;
    const sklad = kind === 'drewno' ? (this.house?.sklad ?? []) : [];
    const rank = (t: Thing) => (t.by >= 0 ? 2 : 0) + (sklad.includes(t.y * size + t.x) ? 1 : 0);
    const piles = this.st.things
      .filter((t) => t.kind === kind && t.n > 0 && (!nasze || this.nasza(t)))
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

  /** Czas pracy w tickach dla pionka: podstawa podzielona przez mnożnik z umiejętności (`tempoPracy`). Bez mnożnika
      (1: pierwszy dzień gry, brak umiejętności) podstawa bez zaokrąglenia, tak jak przed pracą ludzi. */
  private czasPracy(p: Pawn, r: RodzajPracy, baza: number): number {
    const t = tempoPracy(this.st, p, r);
    return t === 1 ? baza : Math.round(baza / t);
  }

  /** ile prac danego rodzaju (i produktu `what`, jeśli podany) trwa teraz u zarządu */
  private wRobocie(t: JobKind, what?: string): number {
    let n = 0;
    for (const q of this.st.pawns) if (q.job?.t === t && (what === undefined || q.job.what === what)) n++;
    return n;
  }

  /** sztuki materiału na naszym terenie (podwórko, siedziba, otoczone budynki; bez wnętrz sąsiadów): zapas dla progów */
  private zapasMat(kind: string): number {
    let n = 0;
    for (const t of this.st.things) if (t.kind === kind && t.n > 0 && this.nasza(t)) n += t.n;
    return n;
  }

  /** Rezerwa złomu, której Warsztat nie rusza: brak złomu otwartych planów (`need − have`, także plan wspólnego płotu)
      i łata (`PATCH_COST`) na każdą otwartą dziurę w siatce. */
  private rezerwaZlomu(): number {
    const st = this.st;
    let n = 0;
    for (const b of st.builds) n += Math.max(0, (b.need.zlom ?? 0) - (b.have.zlom ?? 0));
    const plan = st.plot?.plan;
    if (plan) n += Math.max(0, (plan.need.zlom ?? 0) - (plan.have.zlom ?? 0));
    for (const h of st.fence?.holes ?? []) if (h.patch <= 0) n += PATCH_COST;
    return n;
  }

  /** Rezerwa desek, której automat nie rusza na dzidy: brak desek otwartych planów (`need − have`, także plan
      wspólnego płotu) i łata (`PATCH_COST`) na każdą otwartą dziurę w siatce (łata jest z desek albo ze złomu, więc
      rezerwa deski i rezerwa złomu liczą ją obie). */
  private rezerwaDesek(): number {
    const st = this.st;
    let n = 0;
    for (const b of st.builds) n += Math.max(0, (b.need.deski ?? 0) - (b.have.deski ?? 0));
    const plan = st.plot?.plan;
    if (plan) n += Math.max(0, (plan.need.deski ?? 0) - (plan.have.deski ?? 0));
    for (const h of st.fence?.holes ?? []) if (h.patch <= 0) n += PATCH_COST;
    return n;
  }

  /** Warsztat (tylko przy postawionym warsztacie), po jednej sztuce na pracę, według progów zapasów (warunki w
      `warsztatDeski`, `warsztatCzesci` i `warsztatDzida`, te same, które liczy `ileZlecen`): kolejno deski, części, dzida.
      Prace w toku liczą się jak gotowe, więc dwie osoby przy dwóch warsztatach nie robią ponad próg. Próg 0 wyłącza
      robienie. */
  private startWarsztat(p: Pawn): boolean {
    if (this.warsztatDeski() && this.startSaw(p, 'deski', 1, false)) return true;
    if (this.warsztatCzesci() && this.startSaw(p, 'czesci', 1, false)) return true;
    return this.warsztatDzida() && this.startCraft(p, false);
  }

  /** Warsztat zrobi deski: stoi warsztat, desek (z tymi w robocie) jest mniej niż próg, a drewna w obrębie siatki
      (`zapasDrewna`: razem z kozą i tym, co niosą) jest ponad próg drewna i ponad zapas opału (`ZAPAS_OPALU`: próg 0
      wyłącza Drwala, a nie oddaje opału na deski) co najmniej na jedną sztukę, i to drewno leży na naszym terenie. */
  private warsztatDeski(): boolean {
    if (!this.hasBuilt('warsztat')) return false;
    const pr = progi(this.st);
    const deski = RECIPES.deski;
    const wDeskach = this.wRobocie('saw', 'deski');
    const zostaje = Math.max(pr.drewno, ZAPAS_OPALU);
    return this.zapasMat('deski') + wDeskach < pr.deski && this.zapasDrewna() - zostaje - wDeskach * deski.n >= deski.n;
  }

  /** Warsztat zrobi części: stoi warsztat, części (z tymi w robocie) jest mniej niż próg, a złomu ponad rezerwę na łaty
      i plany (`rezerwaZlomu`) starczy co najmniej na jedną sztukę. */
  private warsztatCzesci(): boolean {
    if (!this.hasBuilt('warsztat')) return false;
    const czesci = RECIPES.czesci;
    const wCzesciach = this.wRobocie('saw', 'czesci');
    return (
      this.zapasMat('czesci') + this.st.store.parts + wCzesciach < progi(this.st).czesci &&
      this.zapasMat('zlom') - this.rezerwaZlomu() - wCzesciach * czesci.n >= czesci.n
    );
  }

  /** Warsztat zrobi dzidę dla nieuzbrojonych: stoi warsztat, próg dzid ponad 0, bez broni jest więcej osób niż dzid
      w magazynie (z tymi w robocie), dzid jest mniej niż próg, a deski ponad rezerwę na łaty i plany (`rezerwaDesek`)
      oraz złom ponad `rezerwaZlomu` starczą na dzidę; dzida nie zjada więc materiału na otwartą dziurę ani na plan. */
  private warsztatDzida(): boolean {
    const st = this.st;
    if (!this.hasBuilt('warsztat')) return false;
    const pr = progi(st);
    if (pr.dzidy <= 0) return false;
    const bezBroni = st.pawns.filter((q) => q.kind === 'core' && !q.weapon && !this.graveyard.has(q.id)).length;
    const wDzidach = this.wRobocie('craft');
    const dzidy = (st.store.arms ?? []).filter((a) => a === 'dzida').length + wDzidach;
    return (
      bezBroni - dzidy > 0 &&
      dzidy < pr.dzidy &&
      this.zapasMat('deski') - this.rezerwaDesek() - wDzidach * SPEAR_BOARDS >= SPEAR_BOARDS &&
      this.zapasMat('zlom') - this.rezerwaZlomu() - wDzidach * SPEAR_SCRAP >= SPEAR_SCRAP
    );
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
    // zła sława u handlarzy spada o poziom po SLAWA_DAYS dniach bez nowej napaści
    if (o.slawa && o.slawa.lvl > 0 && st.tick >= o.slawa.until) {
      o.slawa.lvl--;
      o.slawa.until += SLAWA_DAYS * TICKS_PER_DAY;
    }
    if (o.next < 0 || o.trader >= 0 || st.tick < o.next) return;
    const h = hourOf(st.tick);
    if (h < 9 || h >= 15) {
      o.next = tickAt(dayOf(st.tick) + (h >= 15 ? 1 : 0), 9 + 4 * nextRandom(st.rng));
      return;
    }
    // tryb zombie: przy bramie kręcą się szwendacze, handlarz przyjdzie później
    const gate = this.outsideOf(gateTiles(this.w))[0];
    if (modeOf(st) === 'zombie' && gate !== undefined && this.walkersNear(gate, ZOMBIE_SCARE_ARRIVE)) {
      o.next = st.tick + ZOMBIE_DELAY;
      return;
    }
    // tryb zombie: co druga, trzecia wizyta nie dochodzi do skutku (nie przeżył drogi albo zawrócił)
    if (modeOf(st) === 'zombie' && nextRandom(st.rng) < TRADER_NOSHOW) {
      o.next = this.nextTraderVisit(0);
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
    o.offers = rollOffers(st.rng).map((x) => priced(x, o.slawa?.lvl ?? 0));
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
      // w trybie zombie handlarz zostaje tylko chwilę
      const wait = modeOf(st) === 'zombie' ? WAIT_ZOMBIE : WAIT_TICKS;
      j.until = Math.min(st.tick + wait, tickAt(dayOf(st.tick), LEAVE_HOUR));
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
      o.next = this.nextTraderVisit(0);
    }
    return true;
  }

  /** następna wizyta handlarza: za dwa albo trzy dni, przy złej sławie o 2 × poziom dni później, plus extra dni */
  private nextTraderVisit(extra: number): number {
    const st = this.st;
    const lvl = st.obcy?.slawa?.lvl ?? 0;
    const base = modeOf(st) === 'zombie' ? nextVisitZombie : nextVisit;
    return base(dayOf(st.tick), st.rng) + (SLAWA_EXTRA_DAYS * lvl + extra) * TICKS_PER_DAY;
  }

  /** handlarz przeżył napaść (uciekł albo odszedł po walce): wieść idzie do innych handlarzy (ceny w górę, wizyty
      rzadziej), a z szansą REVENGE_CHANCE najbliższej nocy wracają jego ludzie */
  private traderSurvived(fled: boolean): void {
    const st = this.st;
    const o = st.obcy!;
    o.trader = -1;
    o.offers = [];
    const lvl = Math.min(SLAWA_MAX, (o.slawa?.lvl ?? 0) + 1);
    o.slawa = { lvl, until: st.tick + SLAWA_DAYS * TICKS_PER_DAY };
    o.next = this.nextTraderVisit(0);
    if (nextRandom(st.rng) < REVENGE_CHANCE) {
      const day = dayOf(st.tick);
      const night = hourOf(st.tick) < 20 ? day : day + 1;
      o.zemsta = { at: tickAt(night, 22 + 3 * nextRandom(st.rng)), n: 3 + Math.floor(2 * nextRandom(st.rng)) };
    }
    o.wiesc = { tick: st.tick, text: (fled ? HANDEL.uciekl : HANDEL.odszedlZly).pl };
  }

  /** Zabity handlarz: nikt nie zanosi wieści, nowy handlarz przejmuje trasę KILL_DELAY_DAYS dni później. Zagryziony
      przez szwendacze w czasie wizyty (tryb zombie) zostawia pod bramą wózek z całym towarem. */
  private traderKilled(p: Pawn, by: Pawn | null): void {
    const st = this.st;
    const o = st.obcy;
    if (!o || o.trader !== p.id) return;
    const bitten = by?.kind === 'zombie';
    if (bitten) {
      const cart = p.job?.phase === 1 ? this.thing(p.job.from) : undefined;
      const size = this.w.size;
      const at = cart ? cart.y * size + cart.x : this.tileOf(p);
      for (const offer of o.offers)
        if (offer.left > 0)
          for (const [m, n] of Object.entries(offer.give) as [Mat, number][]) this.dropOutside(at, m, n * offer.left);
      if (cart) cart.n = 0;
    }
    o.trader = -1;
    o.offers = [];
    o.next = this.nextTraderVisit(KILL_DELAY_DAYS);
    o.wiesc = { tick: st.tick, text: (bitten ? HANDEL.zagryziony : HANDEL.zabity).pl };
  }

  /** posiłki handlarza w swoim czasie: n ludzi z daleka staje pod siatką przy bramie */
  private revengeClock(): void {
    const st = this.st;
    const o = st.obcy!;
    const z = o.zemsta;
    if (!z || st.tick < z.at) return;
    delete o.zemsta;
    const spot = this.outsideOf(gateTiles(this.w))[0];
    if (spot === undefined) return;
    const from = this.farFrom(spot, TRADER_FROM);
    const starts = this.tilesAround(from, z.n);
    const waits = this.tilesAround(spot, z.n);
    let came = 0;
    for (let k = 0; k < z.n; k++) {
      const p = newPawn(st, this.w, 'zbir', -1, starts[k] ?? from, from, Math.floor(nextRandom(st.rng) * 16));
      p.hp = ZBIR_HP;
      p.wrogi = true;
      p.weapon = ZBIR_WEAPONS[k % ZBIR_WEAPONS.length];
      p.job = this.newJob('zemsta', -1, waits[k] ?? spot, false);
      st.pawns.push(p);
      if (this.go(p, p.job.tile)) came++;
      else p.job.phase = 4;
    }
    if (came) o.wiesc = { tick: st.tick, text: HANDEL.zemsta(came).pl };
  }

  /** najbliższy z zarządu do AGGRO m, nie w budynku (do środka wrogowie nie wchodzą) */
  private hostileTarget(p: Pawn): Pawn | undefined {
    let best: Pawn | undefined;
    let bd = AGGRO;
    for (const q of this.st.pawns) {
      if (q.kind !== 'core' || q.away || this.graveyard.has(q.id) || this.inRoom(this.tileOf(q))) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  /** cios wroga: celność i obrażenia z broni, słabsze niż u zarządu (HOSTILE_HIT, HOSTILE_DMG), bez amunicji */
  private hostileStrike(p: Pawn, t: Pawn, w: Weapon): void {
    const st = this.st;
    p.cd = st.tick + w.cd;
    this.face(p, t.x, t.y);
    this.addFx('cios', p.x, p.y, t.x, t.y);
    if (w.noise > 0) this.addNoise(p.x, p.y, w.noise);
    if (nextRandom(st.rng) >= w.hit * HOSTILE_HIT) return;
    this.hurt(t, Math.round(w.dmg * HOSTILE_DMG), p);
  }

  /** wrogi człowiek odchodzi (2) albo ucieka (3) tam, skąd przyszedł; bez drogi znika w następnym kroku */
  private hostileLeave(p: Pawn, phase: 2 | 3): void {
    p.job!.phase = phase;
    if (!this.go(p, p.home)) {
      p.path = [];
      p.pi = 0;
    }
  }

  /** Wrogi człowiek (napadnięty handlarz w fazie 5, ludzie handlarza): bije najbliższego z zarządu do AGGRO m i goni
      go swoją warstwą (przez zamkniętą bramę i łaty nie przejdzie), ranny ucieka tam, skąd przyszedł. Handlarz bez
      nikogo w pobliżu przez CALM_TICKS odchodzi. Ludzie handlarza stają pod siatką i odchodzą o 4:00 albo po
      ZBIR_STAY. Fazy: 0 idzie (ludzie handlarza pod siatkę), 1 stoi, 2 odchodzi, 3 ucieka, 4 zniknął, 5 walka
      handlarza. true: zniknął w tym kroku. */
  private hostileTick(p: Pawn): boolean {
    const st = this.st;
    const j = p.job;
    const trader = p.kind === 'handlarz';
    if (!j) {
      p.job = this.newJob(trader ? 'trader' : 'zemsta', -1, this.tileOf(p), false, 4);
      if (trader && st.obcy?.trader === p.id) this.traderSurvived(true);
      return true;
    }
    if (j.phase === 4) return true;
    if (j.phase === 2 || j.phase === 3) {
      if (p.pi < p.path.length) {
        this.walk(p);
        return false;
      }
      const fled = j.phase === 3;
      j.phase = 4;
      if (trader && st.obcy?.trader === p.id) this.traderSurvived(fled);
      return true;
    }
    if ((p.hp ?? 0) < (trader ? TRADER_FLEE : ZBIR_FLEE)) {
      this.hostileLeave(p, 3);
      return false;
    }
    if (!trader && j.phase === 1 && st.tick >= j.until) {
      this.hostileLeave(p, 2);
      return false;
    }
    const t = this.hostileTarget(p);
    if (!t) {
      if (trader && st.tick >= j.until) {
        this.hostileLeave(p, 2);
        return false;
      }
      if (p.pi < p.path.length) this.walk(p);
      else if (!trader && j.phase === 0) {
        j.phase = 1;
        const four = tickAt(dayOf(st.tick) + (hourOf(st.tick) >= ZBIR_LEAVE_HOUR ? 1 : 0), ZBIR_LEAVE_HOUR);
        j.until = Math.min(st.tick + ZBIR_STAY, four);
      }
      return false;
    }
    if (trader) j.until = st.tick + CALM_TICKS;
    const w = weaponOf(p.weapon);
    if (this.canHit(p, t, w)) {
      p.path = [];
      p.pi = 0;
      if (st.tick >= (p.cd ?? 0)) this.hostileStrike(p, t, w);
      else this.face(p, t.x, t.y);
      return false;
    }
    if (p.pi >= p.path.length || (st.tick + p.id) % THINK_EVERY === 0) {
      const g = this.goalFor(p, this.tileOf(t));
      if (g >= 0 && g !== this.tileOf(p)) this.routeTo(p, g);
    }
    if (p.pi < p.path.length) this.walk(p);
    return false;
  }

  /** Tryb zombie: szwendacz do SPOOK_R m (handlarz: ZOMBIE_SCARE_WAIT) od obcego, który nie ucieka i nie walczy:
      handlarz odchodzi z wózkiem (wizyta skończona), ocalały i ekipa uciekają. true: ruszył. */
  private spooked(p: Pawn): boolean {
    const st = this.st;
    const j = p.job;
    if (modeOf(st) !== 'zombie' || !j || j.phase >= 2) return false;
    const trader = p.kind === 'handlarz';
    if (!this.walkersNear(this.tileOf(p), trader ? ZOMBIE_SCARE_WAIT : SPOOK_R)) return false;
    if (trader) {
      const cart = this.thing(j.from);
      if (cart && j.phase === 1) st.things.splice(st.things.indexOf(cart), 1);
      j.from = -1;
      st.obcy!.offers = [];
      st.obcy!.wiesc = { tick: st.tick, text: HANDEL.szwendacze.pl };
      j.phase = 2;
      if (!this.go(p, p.home)) {
        p.path = [];
        p.pi = 0;
      }
      return true;
    }
    this.flee(p);
    return true;
  }

  /** szwendacz do r metrów od kafelka */
  private walkersNear(tile: number, r: number): boolean {
    const size = this.w.size;
    const x = (tile % size) + 0.5;
    const y = Math.floor(tile / size) + 0.5;
    return this.st.pawns.some(
      (q) => q.kind === 'zombie' && !this.graveyard.has(q.id) && Math.hypot(q.x - x, q.y - y) <= r,
    );
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

  /** wolny kafelek tuż przy pionku t, do którego p dojdzie (−1: brak); street: tylko po stronie ulicy (nie na bramie,
      w dziurze ani na podwórku), żeby walka nie szła przez siatkę */
  private besidePawn(p: Pawn, t: Pawn, street = false): number {
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
        if (street && this.lay.outside.blocked[i]) continue;
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
    const spot = this.besidePawn(p, t, true);
    if (spot < 0 || !this.go(p, spot)) return;
    this.setJob(p, this.newJob('rob', t.id, spot, true), false);
  }

  /** Napaść: pierwszy cios napastnika, handlarz rzuca wózek (cały towar zostaje przy nim za siatką) i staje do walki
      z siekierą. Od tej chwili jest wrogiem, więc zarząd z bronią w pobliżu sam się włącza, a napastnik walczy dalej.
      Cena od razu: nastroje zarządu i zaufanie osiedla (przez zarząd). Resztę rozstrzyga walka: zabity (die),
      uciekł albo odszedł (hostileTick). */
  private robWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const o = st.obcy;
    const t = this.trader();
    if (!o || !at || !t || t.id !== j.target || t.job?.phase !== 1) return false;
    const cart = this.thing(t.job.from);
    const size = this.w.size;
    const drop = cart ? cart.y * size + cart.x : this.tileOf(t);
    for (const offer of o.offers)
      if (offer.left > 0)
        for (const [m, n] of Object.entries(offer.give) as [Mat, number][]) this.dropOutside(drop, m, n * offer.left);
    if (cart) cart.n = 0;
    o.offers = [];
    o.napad = st.tick;
    (o.napady ??= []).push({ kto: 'handlarz', tick: st.tick });
    t.wrogi = true;
    t.weapon = TRADER_WEAPON;
    t.job.phase = 5;
    t.job.from = -1;
    t.job.until = st.tick + CALM_TICKS;
    // chwila zaskoczenia, zanim odda
    t.cd = st.tick + TICKS_PER_SECOND;
    this.strike(p, t, this.armed(p));
    this.addMood(p, HANDEL.nastroj.pl, ROB_MOOD, TICKS_PER_DAY);
    for (const q of st.pawns)
      if (q !== p && q.kind === 'core' && !q.away) this.addMood(q, HANDEL.nastroj.pl, ROB_MOOD_OTHERS, TICKS_PER_DAY);
    if (this.graveyard.has(t.id)) return false;
    this.startFight(p, t.id, true);
    return true;
  }

  /* ---------- wędrowcy i obce ekipy (src/sim/wedrowcy.ts) ---------- */

  /** termin wędrowca: za dnia (8:00–17:00), jeden naraz; po zmroku termin przesuwa się na rano */
  private wandererClock(): void {
    const st = this.st;
    const o = st.obcy!;
    if (o.wnext === undefined || o.wnext < 0 || st.tick < o.wnext) return;
    if (st.pawns.some((p) => p.kind === 'wedrowiec')) {
      o.wnext = st.tick + TICKS_PER_HOUR;
      return;
    }
    const h = hourOf(st.tick);
    if (h < 8 || h >= 17) {
      o.wnext = tickAt(dayOf(st.tick) + (h >= 17 ? 1 : 0), 8 + 3 * nextRandom(st.rng));
      return;
    }
    this.spawnWanderer();
    o.wnext = modeOf(st) === 'zombie' ? nextWandererZombie(st.tick, st.rng) : nextWanderer(st.tick, st.rng);
  }

  /** wędrowiec z daleka idzie na losowy kafelek ulicy tuż przy siatce */
  private spawnWanderer(): void {
    const st = this.st;
    const shape = fenceShape(this.w);
    const outs = shape ? this.outsideOf(shape.tiles) : [];
    if (!outs.length) return;
    const spot = outs[Math.floor(nextRandom(st.rng) * outs.length)];
    const from = this.farFrom(spot, TRADER_FROM);
    const p = newPawn(st, this.w, 'wedrowiec', -1, from, from, Math.floor(nextRandom(st.rng) * 16));
    p.hp = WANDERER_HP;
    p.job = this.newJob('wander', -1, spot, false);
    st.pawns.push(p);
    if (from === spot || !this.go(p, spot)) st.pawns.pop();
    // rozmowa z poprzednim wędrowcem już nie obowiązuje
    else delete st.obcy!.rozmowa;
  }

  /** Krok wędrowca, który nie idzie: 0 doszedł pod siatkę (przystaje), 1 stoi, potem idzie daleko w inną stronę,
      2 odszedł, 3 uciekł, 4 zniknął. true: zniknął w tym kroku. */
  private wanderTick(p: Pawn): boolean {
    const st = this.st;
    const j = p.job;
    if (!j) {
      p.job = this.newJob('wander', -1, this.tileOf(p), false, 4);
      return true;
    }
    if (j.phase === 0) {
      j.phase = 1;
      j.t0 = st.tick;
      // ocalały w trybie zombie przystaje tylko na chwilę
      const [a, b] = modeOf(st) === 'zombie' ? [PAUSE_ZOMBIE_MIN, PAUSE_ZOMBIE_MAX] : [PAUSE_MIN, PAUSE_MAX];
      j.until = st.tick + a + Math.floor(nextRandom(st.rng) * (b - a));
      return false;
    }
    if (j.phase === 1) {
      if (st.tick < j.until) return false;
      j.phase = 2;
      const dest = this.farFrom(this.tileOf(p), TRADER_FROM);
      if (dest !== this.tileOf(p) && this.go(p, dest)) return false;
    }
    j.phase = 4;
    return true;
  }

  /** termin ekipy: za dnia (9:00–14:00), do nieprzeszukanego wraku, którego nie przeszukuje nikt z zarządu */
  private crewClock(): void {
    const st = this.st;
    const o = st.obcy!;
    if (o.enext === undefined || o.enext < 0 || st.tick < o.enext) return;
    if (st.pawns.some((p) => p.kind === 'obcy')) {
      o.enext = st.tick + TICKS_PER_HOUR;
      return;
    }
    const h = hourOf(st.tick);
    if (h < 9 || h >= 14) {
      o.enext = tickAt(dayOf(st.tick) + (h >= 14 ? 1 : 0), 9 + 5 * nextRandom(st.rng));
      return;
    }
    o.enext = modeOf(st) === 'zombie' ? nextCrewZombie(dayOf(st.tick), st.rng) : nextCrew(dayOf(st.tick), st.rng);
    this.spawnCrew();
  }

  /** dwie osoby z łomami z daleka do losowego nieprzeszukanego wraku; stają przy nim od strony ulicy */
  private spawnCrew(): void {
    const st = this.st;
    const size = this.w.size;
    const ours = new Set(st.pawns.filter((q) => q.job?.t === 'wreck').map((q) => q.job!.target));
    const free = wrecksOf(this.w).filter((r) => {
      const t = wreckTile(r, size);
      return wreckStage(st.wraki, t) === 0 && !ours.has(t);
    });
    if (!free.length) return;
    const r = free[Math.floor(nextRandom(st.rng) * free.length)];
    const t = wreckTile(r, size);
    const { blocked, reg } = this.lay.outside;
    const ring: number[] = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
        const i = y * size + x;
        if (!blocked[i]) ring.push(i);
      }
    if (!ring.length) return;
    const stands = [ring[0], ring.find((i) => reg[i] === reg[ring[0]] && Math.abs(i - ring[0]) > 1) ?? ring[0]];
    const from = this.farFrom(stands[0], TRADER_FROM);
    const starts = this.tilesAround(from, 2);
    for (let k = 0; k < 2; k++) {
      const p = newPawn(st, this.w, 'obcy', -1, starts[k] ?? from, from, Math.floor(nextRandom(st.rng) * 16));
      p.hp = WANDERER_HP;
      p.job = this.newJob('scavenge', t, stands[k], false);
      p.job.from = k;
      st.pawns.push(p);
      if (!this.go(p, stands[k])) p.job.phase = 4;
    }
  }

  /** Krok obcego z ekipy, który nie idzie: 0 doszedł do wraku (wrak przeszukany: odchodzi), 1 przeszukuje godzinę,
      potem pierwszy z nich oznacza wrak jako przeszukany (łup przepada) i obaj odchodzą, 2 odszedł, 3 uciekł,
      4 zniknął. true: zniknął w tym kroku. */
  private scavengeTick(p: Pawn): boolean {
    const st = this.st;
    const j = p.job;
    if (!j) {
      p.job = this.newJob('scavenge', -1, this.tileOf(p), false, 4);
      return true;
    }
    if (j.phase === 4) return true;
    const r = wreckAt(this.w, j.target);
    if (j.phase === 0) {
      j.phase = 1;
      j.t0 = st.tick;
      j.until = r && wreckStage(st.wraki, j.target) === 0 ? st.tick + CREW_SEARCH_TICKS : st.tick;
      if (r) this.face(p, r.x + r.w / 2, r.y + r.h / 2);
      return false;
    }
    if (j.phase === 1) {
      if (st.tick < j.until) return false;
      if (j.from === 0 && r && wreckStage(st.wraki, j.target) === 0) {
        st.wraki ??= [];
        st.wraki.push({ t: j.target, s: 1 });
        st.wraki.sort((a, b) => a.t - b.t);
        st.obcy!.wiesc = { tick: st.tick, text: OBCY.przeszukali(r.model).pl };
      }
      j.phase = 2;
      if (this.go(p, p.home)) return false;
    }
    j.phase = 4;
    return true;
  }

  /** obcy danego rodzaju o tym id, który jeszcze nie ucieka ani nie zniknął */
  private stranger(id: number, kind: PawnKind): Pawn | undefined {
    return this.st.pawns.find((q) => q.id === id && q.kind === kind && (q.job?.phase ?? 4) < 3);
  }

  /** zagadać przystającego wędrowca: osoba idzie na podwórko na kafelek najbliżej niego (rozmowa przez siatkę) */
  private startTalk(p: Pawn, id: number): void {
    const t = this.stranger(id, 'wedrowiec');
    if (t?.job?.phase !== 1 || t.job.what === 'zagadany') return;
    const spot = this.tradeSpot(p, t);
    if (spot < 0 || !this.go(p, spot)) return;
    this.setJob(p, this.newJob('talk', t.id, spot, true), false);
  }

  /** rozmowa 5 minut: wędrowiec zostaje dłużej, rozmawiający ma lepszy nastrój, wieść na dole ekranu */
  private talkWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const t = this.stranger(j.target, 'wedrowiec');
    if (t?.job?.phase !== 1 || t.job.what === 'zagadany') return false;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = st.tick;
      j.until = st.tick + TALK_TICKS;
      t.job.until = Math.max(t.job.until, st.tick + TALK_TICKS + TALK_EXTRA);
      this.face(p, t.x, t.y);
      this.face(t, p.x, p.y);
      return true;
    }
    if (st.tick < j.until) return true;
    t.job.what = 'zagadany';
    // po rozmowie czeka na zaproszenie godzinę gry (tylko w grach z rozmową, reszta przebiega jak dotąd)
    t.job.until = Math.max(t.job.until, st.tick + PO_ROZMOWIE);
    this.addMood(p, OBCY.nastrojRozmowa.pl, TALK_MOOD, TALK_MOOD_TICKS);
    const o = st.obcy!;
    const size = this.w.size;
    const left = wrecksOf(this.w).filter((r) => wreckStage(st.wraki, wreckTile(r, size)) === 0).length;
    const traderIn = o.next < 0 ? -1 : Math.max(0, dayOf(o.next) - dayOf(st.tick));
    const ctx = { traderIn, wrecksLeft: left };
    const zombie = modeOf(st) === 'zombie';
    const gossipPl = (zombie ? gossipZombie : gossip)(ctx, st.rng).pl;
    // rozmowa mówi też, kim jest wędrowiec (osoba z ziarna świata i numeru, nie ze st.rng), i czy idzie do rodziny
    const seed = this.w.seed;
    const osoba = osobaWedrowca(seed, t.id, new Set(st.people.map((q) => q.first)));
    const cel = celWedrowca(seed, t.id);
    o.rozmowa = { id: t.id, osoba, cel, ugryziony: zombie && ugryzienieWedrowca(seed, t.id) };
    o.wiesc = { tick: st.tick, text: `${gossipPl}\n${OBCY.kto(osoba, cel).pl}` };
    return false;
  }

  /* ---------- werbunek wędrowców (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, część B) ---------- */

  /** Zaprosić wędrowca, z którym zarząd już rozmawiał (how 'zapros'), albo w trybie zombie zapytać go o rękę (how
      'reka'): osoba idzie na podwórko na kafelek najbliżej niego. Nic się nie dzieje, gdy wędrowiec nie stoi przy siatce
      po rozmowie, ktoś inny już go zaprasza, zaproszenie nie ma dokąd (pełny zarząd bez wolnego łóżka mieszkańców) albo
      o rękę już pytano. Wędrowiec zostaje przy siatce tak długo, jak osoba idzie i rozmawia. */
  private startZapros(p: Pawn, id: number, how: 'zapros' | 'reka'): void {
    const st = this.st;
    const t = this.stranger(id, 'wedrowiec');
    const r = st.obcy?.rozmowa;
    if (t?.job?.phase !== 1 || t.job.what !== 'zagadany' || !r || r.id !== t.id) return;
    if (st.pawns.some((q) => q.job?.t === 'zapros' && q.job.target === t.id)) return;
    if (how === 'reka') {
      if (modeOf(st) !== 'zombie' || r.pytali) return;
    } else if (szansaZaproszenia(st, this.w) <= 0) return;
    const spot = this.tradeSpot(p, t);
    if (spot < 0 || !this.go(p, spot)) return;
    // pięć ticków na kafelek (WALK_SPEED), potem rozmowa i chwila na odejście
    t.job.until = Math.max(t.job.until, st.tick + p.path.length * 5 + ZAPROS_TICKS + TALK_EXTRA);
    const j = this.newJob('zapros', t.id, spot, true);
    j.what = how;
    this.setJob(p, j, false);
  }

  /** zaproszenie albo pytanie o rękę: dwie minuty przy siatce, potem rozstrzygnięcie */
  private zaprosWork(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const t = this.stranger(j.target, 'wedrowiec');
    const r = st.obcy?.rozmowa;
    if (t?.job?.phase !== 1 || !r || r.id !== t.id) return false;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = st.tick;
      j.until = st.tick + ZAPROS_TICKS;
      t.job.until = Math.max(t.job.until, st.tick + ZAPROS_TICKS + TALK_EXTRA);
      this.face(p, t.x, t.y);
      this.face(t, p.x, p.y);
      return true;
    }
    if (st.tick < j.until) return true;
    if (j.what === 'reka') this.pytanieORege(t, r);
    else this.decyzjaWerbunku(t, r);
    return false;
  }

  /** wędrowiec idzie dalej (odmowa, ugryziony, który nie pokazał ręki): rozmowa się kończy, a w następnym kroku odchodzi
      tak, jak po upływie czasu przy siatce */
  private wedrowiecIdzieDalej(t: Pawn): void {
    delete this.st.obcy!.rozmowa;
    if (t.job) t.job.until = this.st.tick;
  }

  /** Pytanie o rękę (tryb zombie): ukryty ugryziony nie pokazuje ręki i odchodzi bez werbunku, zdrowy ją pokazuje i dalej
      można go zaprosić; w obu razach rozmowa wie, że zapytano. */
  private pytanieORege(t: Pawn, r: NonNullable<Obcy['rozmowa']>): void {
    const st = this.st;
    r.pytali = true;
    if (r.ugryziony) {
      st.obcy!.wiesc = { tick: st.tick, text: OBCY.rekaUgryziona(true).pl };
      this.wedrowiecIdzieDalej(t);
    } else st.obcy!.wiesc = { tick: st.tick, text: OBCY.rekaCzysta(true).pl };
  }

  /** Rozstrzygnięcie zaproszenia: miejsce liczy się od nowa (zarząd mógł się zapełnić, łóżko ktoś zająć), potem jedno
      losowanie ze st.rng na szansę z szansaZaproszenia. Udane: zwerbowany; nieudane: dziękuje i idzie dalej, bez kary.
      Bez miejsca w chwili decyzji (`dokad` 'brak' albo 'dom') nie ma losowania, a wieść mówi, że miejsca już nie ma. */
  private decyzjaWerbunku(t: Pawn, r: NonNullable<Obcy['rozmowa']>): void {
    const st = this.st;
    const ok = okazjaWerbunku(st, this.w);
    const chance = szansaZaproszenia(st, this.w, ok);
    if (chance > 0 && nextRandom(st.rng) < chance) {
      this.zwerbuj(t, r, ok);
      return;
    }
    const zombie = modeOf(st) === 'zombie';
    const bezMiejsca = ok.dokad === 'brak' || ok.dokad === 'dom';
    st.obcy!.wiesc = { tick: st.tick, text: (bezMiejsca ? OBCY.bezMiejsca(zombie) : OBCY.odmowa(zombie)).pl };
    this.wedrowiecIdzieDalej(t);
  }

  /** Wędrowiec zostaje: zmienia się w osobę zarządu w swoim miejscu, ze swoim wyglądem, i wchodzi bramą (id `w1`, `w2`…,
      domyślne priorytety pracy z umiejętności), a przy pełnym zarządzie w mieszkańca z pracą arrive do mieszkania
      z wolnym łóżkiem. Zarząd dostaje nastrój „Nowa osoba w zarządzie”. Ukryty ugryziony, o którego nie pytano, ma
      gorączkę od chwili ugryzienia, jak przyjęte gospodarstwa sąsiadów. */
  private zwerbuj(t: Pawn, r: NonNullable<Obcy['rozmowa']>, ok: OkazjaWerbunku): void {
    const st = this.st;
    const o = st.obcy!;
    const n = (o.werbunek = (o.werbunek ?? 0) + 1);
    st.people.push({
      ...r.osoba,
      id: `w${n}`,
      home: this.w.hq,
      skills: { ...r.osoba.skills },
      traits: [...r.osoba.traits],
    });
    t.person = st.people.length - 1;
    delete t.hp;
    t.path = [];
    t.pi = 0;
    t.want = -1;
    t.wait = st.tick;
    if (this.door >= 0) t.home = this.door;
    if (ok.dokad === 'zarzad') {
      t.kind = 'core';
      t.needs = { food: 50, warm: 50, rest: 60, health: 90, safe: 50, mood: 0 };
      t.needs.mood = 0.25 * 50 + 0.25 * 50 + 0.15 * 60 + 0.15 * 90 + 0.2 * 50;
      t.job = null;
      this.wejdzDoSiedziby(t);
    } else {
      const h = this.house!;
      const size = this.w.size;
      t.kind = 'resident';
      t.apt = ok.apt;
      t.needs = { food: 60, warm: 50, rest: 60, health: 100, safe: 50, mood: 0 };
      t.needs.mood = 0.25 * 60 + 0.25 * 50 + 0.15 * 60 + 0.15 * 100 + 0.2 * 50;
      const tiles: number[] = [];
      for (let i = 0; i < size * size; i++) if (aptAt(h, i) === ok.apt && !this.coreBlocked[i]) tiles.push(i);
      t.job = {
        t: 'arrive',
        target: ok.apt,
        tile: tiles.length ? tiles[t.id % tiles.length] : this.door,
        phase: 0,
        from: -1,
        t0: st.tick,
        until: st.tick,
        order: false,
        n: 0,
        what: '',
      };
      const bed = st.things.find(
        (b) => BEDS.has(b.kind) && !b.broken && b.owner < 0 && aptAt(h, b.y * size + b.x) === ok.apt,
      );
      if (bed) bed.owner = t.id;
    }
    if (r.ugryziony && !r.pytali) {
      infect(st, t, true);
      t.bite = st.tick - ugryzionyOdGodzin(this.w.seed, r.id) * TICKS_PER_HOUR;
      const fever = t.moods[t.moods.length - 1];
      if (fever) fever.until = t.bite + FEVER_TICKS;
    }
    if (ok.dokad === 'zarzad')
      for (const q of st.pawns)
        if (q !== t && q.kind === 'core' && !q.away) this.addMood(q, OBCY.nastrojNowy.pl, NOWY_MOOD, NOWY_MOOD_TICKS);
    delete o.rozmowa;
  }

  /** nowa osoba zarządu spoza siedziby idzie bramą do drzwi siedziby; gdy z miejsca przy siatce nie ma drogi, zaczyna
      od wyjścia z bramy (kafelek wyjścia), jak wracający z wyprawy */
  private wejdzDoSiedziby(t: Pawn): void {
    if (this.door < 0) return;
    const size = this.w.size;
    let ok = this.go(t, this.door);
    if (!ok && this.exitTile >= 0) {
      t.x = (this.exitTile % size) + 0.5;
      t.y = Math.floor(this.exitTile / size) + 0.5;
      ok = this.go(t, this.door);
    }
    if (ok) t.job = this.newJob('go', this.door, this.door, false);
  }

  /** napaść na wędrowca (mug) albo przegonienie ekipy (shoo): osoba idzie do obcego i poprawia drogę, aż dojdzie */
  private startChase(p: Pawn, id: number, how: 'mug' | 'shoo'): void {
    const t = this.stranger(id, how === 'mug' ? 'wedrowiec' : 'obcy');
    if (!t) return;
    const spot = this.besidePawn(p, t, true);
    if (spot < 0 || !this.go(p, spot)) return;
    const j = this.newJob(how, t.id, spot, true);
    j.until = this.st.tick + CHASE_TICKS;
    this.setJob(p, j, false);
  }

  /** Na miejscu: mug to cios, worek i ucieczka (i cena w zaufaniu przez zarząd), shoo to ucieczka całej ekipy bez
      ceny. Obcy odszedł dalej: nowa droga do niego, dopóki nie minie czas pościgu. */
  private chaseWork(p: Pawn, j: Job): boolean {
    const st = this.st;
    const mug = j.t === 'mug';
    const t = this.stranger(j.target, mug ? 'wedrowiec' : 'obcy');
    if (!t) return false;
    const reach = mug ? 1.8 : SHOO_REACH;
    if (Math.hypot(t.x - p.x, t.y - p.y) > reach) {
      if (st.tick >= j.until) return false;
      const spot = this.besidePawn(p, t, true);
      if (spot < 0 || !this.go(p, spot)) return false;
      j.tile = spot;
      return true;
    }
    this.face(p, t.x, t.y);
    if (!mug) {
      for (const q of st.pawns)
        if (q.kind === 'obcy' && q.job?.t === 'scavenge' && q.job.target === t.job!.target && q.job.phase < 3)
          this.flee(q);
      return false;
    }
    this.addFx('cios', p.x, p.y, t.x, t.y);
    t.hp = Math.max(1, (t.hp ?? WANDERER_HP) - 20);
    for (const [m, n] of Object.entries(mugLoot(st.rng)) as [Mat, number][]) this.dropOutside(this.tileOf(t), m, n);
    this.flee(t);
    (st.obcy!.napady ??= []).push({ kto: 'wedrowiec', tick: st.tick });
    this.addMood(p, OBCY.nastrojNapasc.pl, MUG_MOOD, TICKS_PER_DAY);
    for (const q of st.pawns)
      if (q !== p && q.kind === 'core' && !q.away)
        this.addMood(q, OBCY.nastrojNapasc.pl, MUG_MOOD_OTHERS, TICKS_PER_DAY);
    return false;
  }

  /** obcy ucieka tam, skąd przyszedł (bez drogi znika w następnym kroku) */
  private flee(t: Pawn): void {
    if (!t.job) return;
    t.job.phase = 3;
    if (!this.go(t, t.home)) {
      t.path = [];
      t.pi = 0;
    }
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

  /* ---------- polecenie gracza przeżywa walkę odruchową ---------- */

  /** Praca z polecenia gracza (order: true, rodzaj pracy zgodny z komendą) zostaje zapamiętana w stanie pionka, żeby
      przeżyła walkę odruchową; nowe polecenie zastępuje stare (ładunek przerwanego oddaje oddajLadunek). „Idź tu” grupy
      pamięta kafelek tego pionka, noszenie drewna stos, który wziął. */
  private zapamietaj(p: Pawn, c: Command): void {
    if (p.polecenie) this.porzucPolecenie(p);
    const j = p.job;
    const rodzaj = PRACA_POLECENIA[c.t];
    if (!j?.order || !rodzaj || j.t !== rodzaj) return;
    const k: Command =
      c.t === 'move'
        ? { t: 'move', ids: [p.id], to: j.tile }
        : c.t === 'haul' && j.target >= 0
          ? { t: 'haul', ids: [p.id], thing: j.target }
          : { ...c, ids: [p.id] };
    p.polecenie = { c: k, n: 1 };
  }

  /** praca niesie ładunek, który da się oddać z powrotem tej samej pracy: materiał w Job.n i Job.what albo drewno
      w rękach, w fazie dojścia z ładunkiem na miejsce (faza 0, zbieranie z kilku stert, wraca od początku) */
  private zLadunkiem(p: Pawn, j: Job): boolean {
    if (j.phase < 1) return false;
    if (PRACE_Z_MATERIALEM.has(j.t)) return j.n > 0 && !!j.what;
    return PRACE_Z_DREWNEM.has(j.t) && p.carry > 0;
  }

  /** Walka odruchowa albo ucieczka (react) zaraz zastąpi pracę pionka. Jeśli to praca z polecenia gracza, polecenie
      zostaje do wznowienia (Polecenie.od), a ładunek z rąk zostaje przy pionku zamiast spaść pod nogi
      (Polecenie.niesie). Kolejne przerwanie tego samego polecenia (drugi szwendacz po wygranej walce) niczego nie
      zmienia, przy ucieczce tylko odświeża czas zagrożenia. Przerwanie w ostatniej próbie (WZNOW_PROBY) kończy
      polecenie wpisem w kronice, a ładunek ląduje tam, gdzie pionek stoi. */
  private przerwij(p: Pawn, ucieczka: boolean, wrog?: Pawn): void {
    const pol = p.polecenie;
    if (p.kind !== 'core' || !pol) return;
    const tick = this.st.tick;
    if (pol.od !== undefined) {
      if (ucieczka) pol.zag = tick;
      return;
    }
    const j = p.job;
    if (j) {
      // noszenie łupu (łańcuch z przeszukania wraku) wznawia się od następnej sterty łupu przy tym samym miejscu
      if (j.t === 'carry' && j.phase === 0 && j.target >= 0) pol.c = { t: 'carry', ids: [p.id], thing: j.target };
      if (this.zLadunkiem(p, j)) {
        pol.niesie = { job: { ...j }, drewno: p.carry };
        p.carry = 0;
        // stara praca zaraz zniknie, a dropLoad nie ma tknąć ładunku
        j.n = 0;
      }
    }
    if (pol.n >= WZNOW_PROBY) {
      this.porzucPolecenie(p, true, wrog ? rodzajNapastnika(wrog) : 'zombie');
      return;
    }
    pol.od = tick;
    if (ucieczka) pol.zag = tick;
  }

  /** Polecenie przepada (nowe polecenie gracza, wygaśnięcie, przerwanie w ostatniej próbie, WZNOW_PROBY); wpis: z wpisem
      w dzienniku dla kroniki zarządu. Zapamiętany ładunek ląduje tam, gdzie pionek stoi. */
  private porzucPolecenie(p: Pawn, wpis = false, kto: Napastnik = 'zombie'): void {
    const pol = p.polecenie;
    if (!pol) return;
    if (wpis) {
      const st = this.st;
      const dziennik = (st.przerwane ??= []);
      dziennik.push({
        tick: st.tick,
        imie: st.people[p.person]?.first ?? '',
        co: pol.c.t === 'wreck' ? `wreck:${pol.c.how}` : pol.c.t,
        kto,
      });
      if (dziennik.length > PRZERWANE_MAX) dziennik.splice(0, dziennik.length - PRZERWANE_MAX);
    }
    this.oddajLadunek(p);
    delete p.polecenie;
  }

  /** Ładunek zapamiętany przy pionku (Polecenie.niesie) ląduje tam, gdzie pionek stoi: w siedzibie drewno na skład (co się
      nie zmieści, pod nogi), a materiał na podwórko, jak przy zwykłym noszeniu; poza siedzibą wszystko obok pionka.
      Woła to każdy koniec polecenia z ładunkiem: nowe polecenie, wygaśnięcie, przepadnięcie, śmierć, odejście. */
  private oddajLadunek(p: Pawn): void {
    const nie = p.polecenie?.niesie;
    if (!nie) return;
    delete p.polecenie!.niesie;
    const tile = this.tileOf(p);
    const wDomu = this.inRoom(tile);
    if (nie.drewno > 0) {
      p.carry += nie.drewno;
      if (wDomu) this.stack(p);
      this.dropCarry(p);
    }
    const { n, what } = nie.job;
    if (n > 0 && what) {
      if (wDomu) this.dropInYard(what, n, tile);
      else this.dropMat(tile, what, n);
    }
  }

  /** kafelek celu polecenia, przy którym nie może czaić się wróg, zanim pionek tam wróci; −1: polecenie nie ma celu poza
      siedzibą (gotowanie, badania, mieszkania) albo cel się zmienia (rozmowa, handel, pościg) */
  private celPolecenia(c: Command): number {
    const size = this.w.size;
    switch (c.t) {
      case 'move':
        return c.to;
      case 'chop':
        return c.tree >= 0 && c.tree < this.trunk.length ? this.trunk[c.tree] : -1;
      case 'haul':
      case 'refuel':
      case 'burn':
      case 'dismantle':
      case 'carry':
      case 'finish': {
        const t = this.thing(c.thing);
        return t ? t.y * size + t.x : -1;
      }
      case 'patch':
        return this.holeById(c.hole)?.tiles[0] ?? -1;
      case 'campfire':
        return c.at;
      case 'wreck':
      case 'brace':
      case 'upstairs':
        return c.tile;
      case 'open':
      case 'knock':
      case 'force':
      case 'board':
      case 'unboard':
        return c.door;
      case 'build':
        return c.y * size + c.x;
      case 'loot':
        // przeszukanie w cudzym budynku: wróg pod jego drzwiami też wstrzymuje wznowienie (kafelek przed pierwszymi
        // drzwiami na zewnątrz)
        return drzwiBudynku(this.w, c.bid).zewn[0]?.out ?? -1;
      default:
        return -1;
    }
  }

  /** wróg w czystej linii do WZNOW_ZASIEG m od pionka albo od celu polecenia */
  private zagrozenie(p: Pawn, c: Command): boolean {
    if (this.threat(p, WZNOW_ZASIEG)) return true;
    const cel = this.celPolecenia(c);
    if (cel < 0) return false;
    const size = this.w.size;
    const cx = (cel % size) + 0.5;
    const cy = Math.floor(cel / size) + 0.5;
    for (const t of this.st.pawns) {
      if (!isEnemy(t) || t.away || this.graveyard.has(t.id)) continue;
      if (Math.hypot(t.x - cx, t.y - cy) <= WZNOW_ZASIEG && this.lineCheck(cx, cy, t.x, t.y) === 'clear') return true;
    }
    return false;
  }

  /** Czy cel pracy z ładunkiem nadal jest wolny dla pionka, który ją wznawia: te same sprawdzenia, które robią funkcje
      zaczynające tę pracę (plan budowy, palenisko, dziura w siatce, uszkodzenie, miejsce na ognisko), żeby przerwanie nie
      zostawiło dwojga ludzi przy jednej rzeczy (przerwanie zwalnia rezerwacje, a wolny zarząd bierze plan sam). */
  private celWolny(p: Pawn, j: Job): boolean {
    const st = this.st;
    const innyRobi = (t: JobKind) => st.pawns.some((q) => q !== p && q.job?.t === t && q.job.target === j.target);
    switch (j.t) {
      case 'build': {
        const b = st.builds.find((q) => q.id === j.target);
        return !!b && (b.by < 0 || b.by === p.id);
      }
      case 'refuel': {
        const koza = this.thing(j.target);
        return !!koza && (koza.by < 0 || koza.by === p.id);
      }
      case 'patch': {
        const dziura = this.holeById(j.target);
        return !!dziura && dziura.patch <= 0 && !innyRobi('patch');
      }
      case 'repair': {
        const d = st.damage[j.target];
        return !!d && !d.fixed && !innyRobi('repair');
      }
      case 'campfire':
        return this.siteOk(j.target);
      default:
        return true;
    }
  }

  /** Wznowienie pracy z ładunkiem: ta sama praca w stanie sprzed przerwania, ładunek znowu w rękach, droga do jej
      miejsca od nowa (praca przy pracy po dojściu zaczyna się od początku: łatanie, wzmacnianie, rozpalanie) i zajęty od
      nowa cel (plan budowy, palenisko). false, gdy się nie da (droga, ktoś inny przejął cel): wtedy ładunek ląduje obok
      (oddajLadunek). Drewno, które pionek już trzyma, idzie przedtem na skład (w siedzibie) albo pod nogi, żeby nie zginęło
      pod odzyskanym. */
  private rozmroz(p: Pawn, nie: NonNullable<Polecenie['niesie']>): boolean {
    const j: Job = { ...nie.job };
    if (j.phase === 2 && (j.t === 'patch' || j.t === 'brace' || j.t === 'campfire')) j.phase = 1;
    if (!this.celWolny(p, j) || !this.go(p, j.tile)) return false;
    if (p.carry > 0) {
      if (this.inRoom(this.tileOf(p))) this.stack(p);
      this.dropCarry(p);
    }
    p.carry = nie.drewno;
    this.setJob(p, j, true);
    // setJob zwalnia rezerwacje pionka, więc cel zajmuje się dopiero teraz
    if (j.t === 'build') {
      const b = this.st.builds.find((q) => q.id === j.target);
      if (b) b.by = p.id;
    } else if (j.t === 'refuel') {
      const koza = this.thing(j.target);
      if (koza) koza.by = p.id;
    }
    return true;
  }

  /** Wznowienie przerwanego polecenia, gdy minęło zagrożenie: pionek zdrowy (ponad WZNOW_ZDROWIE), bez pilnej potrzeby,
      na podwórku nie ma wroga, nikt wrogi nie stoi w czystej linii do WZNOW_ZASIEG m od niego i od celu polecenia,
      a po ucieczce minęła jeszcze minuta gry od ostatniego zagrożenia. Komenda idzie tą samą drogą co od gracza (rozkaz), a praca z ładunkiem wraca
      w stanie sprzed przerwania (rozmroz). Polecenie, którego od WZNOW_OKNO nie udało się wznowić, wygasa. true: pionek
      dostał pracę. */
  private wznow(p: Pawn): boolean {
    const pol = p.polecenie;
    if (!pol || pol.od === undefined) return false;
    const tick = this.st.tick;
    if (tick - pol.od > WZNOW_OKNO) {
      this.porzucPolecenie(p);
      return false;
    }
    // ranny, głodny, zmarznięty albo z wrogiem na podwórku nie rusza w teren: reszta myślenia robi swoje (jedzenie, sen,
    // schronienie), a polecenie czeka dalej
    if ((p.needs?.health ?? 0) <= WZNOW_ZDROWIE || this.urgent(p) || this.yardDanger()) return false;
    if (this.zagrozenie(p, pol.c)) {
      pol.zag = tick;
      return false;
    }
    if (pol.zag !== undefined && tick - pol.zag < WZNOW_SPOKOJ) return false;
    const { c, n, niesie } = pol;
    delete pol.niesie;
    let rozmrozone = false;
    if (niesie) {
      rozmrozone = this.rozmroz(p, niesie);
      if (!rozmrozone) {
        pol.niesie = niesie;
        this.oddajLadunek(p);
      }
    }
    if (!rozmrozone) this.rozkaz(c, [p]);
    const j = p.job;
    if (j && (rozmrozone || (j.order && j.t === PRACA_POLECENIA[c.t]))) p.polecenie = { c, n: n + 1 };
    else delete p.polecenie;
    return !!j;
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

  /** Nasz teren: w obrębie siatki (insideAt) albo w budynku za wspólnym płotem (st.plot.bids). Praca bez polecenia
      zaczyna się tylko tu, chyba że osoba ma przełącznik „może wychodzić za siatkę” (mozeTam). */
  private naszTeren(tile: number): boolean {
    return this.insideAt(tile) || !!this.st.plot?.bids.includes(this.w.bid[tile]);
  }

  /** Czy kafelek leży na naszym terenie (odczyt dla botów i testów, to samo co `naszTeren`; niczego nie zmienia). */
  naszTerenKafelek(tile: number): boolean {
    return this.naszTeren(tile);
  }

  /** Spójne obszary naszego terenu: kafelki `naszTeren`, które zarząd przejdzie (−1 poza nimi). Droga w obrębie jednego
      obszaru nie wychodzi na ulicę. */
  private naszeObszary(): Int32Array {
    if (!this.obszaryNasze) {
      const n = this.w.size * this.w.size;
      const zamkniete = new Uint8Array(n);
      for (let i = 0; i < n; i++) zamkniete[i] = this.coreBlocked[i] || !this.naszTeren(i) ? 1 : 0;
      this.zamknieteNasze = zamkniete;
      this.obszaryNasze = labelRegions(zamkniete, this.w.size);
    }
    return this.obszaryNasze;
  }

  /** Czy między częściami naszego terenu (inne klatki bloku siedziby, budynki za wspólnym płotem) wolno iść ulicą:
      w trybie zwykłym za dnia tak, ale nie na trasie Szabru (zimne puste mieszkania z drugich klatek wyziębiałyby
      osobę do nocy; tam tylko z przełącznikiem). W trybie zombie i nocą droga zostaje na naszym terenie. */
  private ulicaMiedzyNaszymi(trasa: Trasa = 'zwykla'): boolean {
    return trasa !== 'szaber' && modeOf(this.st) !== 'zombie' && !this.night();
  }

  /** Czy pionek bez polecenia może wyjść poza nasz teren do tego kafelka (albo przejść po ulicy do innej części
      naszego terenu). Do kafelka na naszym terenie, który leży w innej jego części (inna klatka bloku), wolno
      w trybie zwykłym za dnia (`ulicaMiedzyNaszymi`). Poza tym tylko osoba z przełącznikiem „może wychodzić za
      siatkę”, tylko za dnia (nocą nikt bez polecenia nie wychodzi) i tylko gdy nie ma wroga (`wrogBlisko`: szwendacz,
      ludzie handlarza, wrogi handlarz, szabrownik; we wszystkich trybach) bliżej niż 10 m od celu, od samej osoby ani
      od wyjścia za bramę (rano stado stoi jeszcze pod siatką, a droga do celu prowadzi przez bramę; sam cel bez wroga
      nie wystarcza). To jedyne miejsce reguły „za siatką” (`mozeTam`, `dojdzieWDomu` i `idz` biorą ją stąd). */
  private mozeWyjsc(p: Pawn, tile: number, trasa: Trasa = 'zwykla'): boolean {
    if (this.naszTeren(tile) && this.ulicaMiedzyNaszymi(trasa)) return true;
    if (!zaSiatke(this.st, p.person) || this.night()) return false;
    return !this.wrogBlisko([tile, this.tileOf(p), this.exitTile]);
  }

  /** Czy pionek bez polecenia może pracować na tym kafelku: na naszym terenie zawsze, poza nim tylko tam, gdzie wolno
      wyjść (`mozeWyjsc`). To jedno miejsce reguły dla wszystkich zleceń poza naszym terenem. Nasz teren to także
      każde pomieszczenie siedziby i budynki za wspólnym płotem, nawet gdy dojście do nich prowadzi ulicą:
      to sprawdza `dojdzieWDomu`. */
  private mozeTam(p: Pawn, tile: number): boolean {
    return this.naszTeren(tile) || this.mozeWyjsc(p, tile);
  }

  /** Czy pionek bez polecenia dojdzie na kafelek: oba kafelki w jednym spójnym obszarze naszego terenu (droga do pokoju
      w innej klatce tego samego bloku prowadzi ulicą), a jeśli nie, tylko gdy wolno wyjść (`mozeWyjsc`: w trybie
      zwykłym za dnia na inną część naszego terenu, inaczej przełącznik). Osoba poza naszym terenem (wraca do domu)
      może iść na nasz teren; jej drogę ocenia `sciezkaWDomu`. Praca z polecenia jest poza tą regułą. */
  private dojdzieWDomu(p: Pawn, tile: number, trasa: Trasa = 'zwykla'): boolean {
    const reg = this.naszeObszary();
    const od = reg[nearestFree(this.coreBlocked, this.w.size, this.tileOf(p))];
    if (od >= 0 ? reg[tile] === od : this.naszTeren(tile)) return true;
    return this.mozeWyjsc(p, tile, trasa);
  }

  /** Cel i materiał pracy bez polecenia: wolno tam pracować (`mozeTam`) i wolno tam dojść (`dojdzieWDomu`). Filtr
      stert, drzew, pokoi i stanowisk dla wszystkich prac automatu. */
  private mozeSam(p: Pawn, tile: number): boolean {
    return this.mozeTam(p, tile) && this.dojdzieWDomu(p, tile);
  }

  /** Droga na kafelek dla pracy bez polecenia (`go` dla pracy z polecenia): osoba na naszym terenie idzie do celu w tej
      samej jego części tylko po nim, nigdy ulicą, nawet gdy ulica byłaby krótsza; do celu w innej części albo poza
      naszym terenem idzie zwykłą drogą, ale tylko tam, gdzie wolno (`mozeWyjsc`); osoba poza naszym terenem wraca do
      domu zwykłą drogą, którą w trybie zombie i nocą ocenia `sciezkaWDomu`. false, gdy nie da się dojść (stan pionka
      bez zmian). */
  private idz(p: Pawn, tile: number, order: boolean, trasa: Trasa = 'zwykla'): boolean {
    if (order) return this.go(p, tile);
    const reg = this.naszeObszary();
    const start = nearestFree(this.coreBlocked, this.w.size, this.tileOf(p));
    if (reg[start] >= 0 && reg[tile] === reg[start]) {
      this.stats.paths++;
      const path = this.pf.find(this.zamknieteNasze!, start, tile);
      this.stats.nodes += this.pf.expanded;
      if (!path) {
        this.stats.failed++;
        return false;
      }
      p.path = path;
      p.pi = 0;
      return true;
    }
    if (!this.dojdzieWDomu(p, tile, trasa)) return false;
    if (reg[start] < 0 && this.naszTeren(tile) && !this.ulicaMiedzyNaszymi(trasa))
      return this.go(p, tile) && this.sciezkaWDomu(p);
    return this.go(p, tile);
  }

  /** Po wyznaczeniu zwykłej drogi osobie poza naszym terenem: może na początku iść do domu, ale po wejściu na nasz teren
      już z niego nie wychodzi. Zła droga jest kasowana. */
  private sciezkaWDomu(p: Pawn): boolean {
    let weszla = false;
    for (let k = p.pi; k < p.path.length; k++) {
      if (this.naszTeren(p.path[k])) weszla = true;
      else if (weszla) {
        p.path = [];
        p.pi = 0;
        return false;
      }
    }
    return true;
  }

  /** Żywy wróg (`isEnemy`: szwendacz, szabrownik, ludzie handlarza i napadnięty handlarz; nie na wyprawie ani za
      mapą) w kwadracie mniejszym niż r kafelków (max(|dx|, |dy|) < r) od któregoś z kafelków (ujemne się pomija), we
      wszystkich trybach: reguła wyjścia za siatkę bez polecenia (`mozeWyjsc`) i ustępowanie pracy bez polecenia poza
      naszym terenem (`yieldsToDanger`). Jedna pętla po pionkach na wszystkie kafelki. */
  private wrogBlisko(tiles: readonly number[], r = 10): boolean {
    const size = this.w.size;
    for (const q of this.st.pawns) {
      if (!isEnemy(q) || q.away || this.graveyard.has(q.id)) continue;
      const t = this.tileOf(q);
      const qx = t % size;
      const qy = Math.floor(t / size);
      for (const tile of tiles)
        if (tile >= 0 && Math.max(Math.abs(qx - (tile % size)), Math.abs(qy - Math.floor(tile / size))) < r)
          return true;
    }
    return false;
  }

  /** tryb zombie: żywy szwendacz w kwadracie mniejszym niż r kafelków (max(|dx|, |dy|) < r) od kafelka (reguła pracy
      przy siatce, `zagrozone`) */
  private szwendaczBlisko(tile: number, r = 10): boolean {
    if (modeOf(this.st) !== 'zombie') return false;
    const size = this.w.size;
    const x = tile % size;
    const y = Math.floor(tile / size);
    for (const q of this.st.pawns) {
      if (q.kind !== 'zombie' || q.away || this.graveyard.has(q.id)) continue;
      const t = this.tileOf(q);
      if (Math.max(Math.abs((t % size) - x), Math.abs(Math.floor(t / size) - y)) < r) return true;
    }
    return false;
  }

  /** kafelek do 3 kafelków od siatki (kafelka, w którym siatka stoi albo jest brama) */
  private przySiatce(tile: number): boolean {
    const size = this.w.size;
    const x = tile % size;
    const y = Math.floor(tile / size);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && this.fenceMask[ny * size + nx] === 1) return true;
      }
    return false;
  }

  /** Czy automat pomija zlecenie z tym celem z powodu szwendacza: w trybie zombie nie pracuje przy siatce (cel do 3
      kafelków od niej), gdy szwendacz jest bliżej niż 10 m od celu. `zawsze`: dla napraw bez względu na siatkę
      (dziura i uszkodzenie, przy których jest szwendacz, poczekają). Praca z polecenia jest poza tą regułą. */
  private zagrozone(tile: number, zawsze = false): boolean {
    return modeOf(this.st) === 'zombie' && (zawsze || this.przySiatce(tile)) && this.szwendaczBlisko(tile);
  }

  /** Drewno w zapasie dla progu Drwala: w składzie, luzem na naszym terenie, w rękach zarządu na naszym terenie i
      w kozie. Drewno na ulicy się nie liczy (pasek u góry je liczy), bo bez przełącznika nikt go nie wniesie i drwal
      stanąłby przy „pełnym” zapasie; drewno w rękach kogoś poza naszym terenem albo na wyprawie też nie (próg to
      zapas „w obrębie siatki”). */
  private zapasDrewna(): number {
    const size = this.w.size;
    let n = 0;
    for (const t of this.st.things) if (t.kind === 'drewno' && t.n > 0 && this.naszTeren(t.y * size + t.x)) n += t.n;
    for (const q of this.st.pawns) if (q.kind === 'core' && !q.away && this.naszTeren(this.tileOf(q))) n += q.carry;
    const koza = this.koza();
    if (koza) n += Math.ceil(koza.fuel / BURN_TICKS);
    return n;
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
      // ładunek zdjęty z rąk na czas przerwanego polecenia też zostaje tam, gdzie pionek stał
      this.oddajLadunek(p);
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
    const name = who?.name ?? STRANGER_NAMES[p.kind] ?? 'Mieszkaniec';
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
    if (STRANGER_KINDS.has(p.kind)) {
      st.tally!.killed++;
      if (by?.needs) this.addMood(by, 'Zabiłem człowieka', -6, TICKS_PER_DAY);
      if (p.kind === 'handlarz') this.traderKilled(p, by);
      return;
    }
    // lokator sąsiedniego budynku: nie nasz, więc bez żałoby osiedla; zabójcę boli jak zabicie człowieka
    if (p.kind === 'sasiad') {
      if (by?.needs) this.addMood(by, 'Zabiłem sąsiada', -8, TICKS_PER_DAY);
      this.zginalSasiad(p);
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

  /** warta na posterunku: najbliższy wróg w zasięgu broni (w trybie zombie z bronią palną tylko po swojej stronie);
      z wieży broń dystansowa (kusza, rewolwer, strzelba) sięga ×1,5 dalej, dzida i broń wręcz jak dotąd */
  private guardStrike(p: Pawn): void {
    if (this.st.tick < (p.cd ?? 0)) return;
    const w = this.armed(p);
    let reach = this.selfReach(w);
    if (p.job?.target === WIEZA_POST && isRanged(w)) reach = { ...reach, reach: reach.reach * WIEZA_ZASIEG };
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
      (pomieszczenia siedziby) jest bezpiecznie. Polecenie gracza, które to przerywa, czeka na wznowienie (przerwij).
      true: pionek dostał nową pracę. */
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
      this.przerwij(p, false, e);
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
    this.przerwij(p, true, e);
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
      (q.kind === 'core' ||
        q.kind === 'resident' ||
        q.kind === 'szabrownik' ||
        q.kind === 'sasiad' ||
        q.kind === 'handlarz' ||
        q.kind === 'wedrowiec' ||
        q.kind === 'obcy') &&
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
        this.press(t);
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

  /** Napierający szwendacze według naciskanego kafelka, raz na krok (przed ruchem pionków). */
  private countPressing(): void {
    this.pressing.clear();
    this.crowd.clear();
    for (const q of this.st.pawns)
      if (q.kind === 'zombie' && q.job?.phase === 2 && q.job.target >= 0)
        this.pressing.set(q.job.target, (this.pressing.get(q.job.target) ?? 0) + 1);
  }

  /** Tłok przy kafelku siatki: ilu szwendaczy napiera w promieniu CROWD_RADIUS od niego (z tymi na nim). */
  private crowdAt(tile: number): number {
    let n = this.crowd.get(tile);
    if (n === undefined) {
      n = crowdNear(this.pressing, this.w.size, tile);
      this.crowd.set(tile, n);
    }
    return n;
  }

  /** wytrzymałość kafelka siatki: łaty, jeśli stoi na dziurze, inaczej samej siatki (0 poza siatką i na bramie) */
  private wireHp(tile: number): number {
    const f = this.st.fence;
    if (!f) return 0;
    const hole = f.holes.find((h) => h.tiles.includes(tile));
    if (hole) return hole.patch;
    const k = this.fenceIndex.get(tile);
    return k === undefined ? 0 : f.hp[k];
  }

  /** Jeden szwendacz napiera na kafelek siatki, łaty albo zasieków: zużycie, a przy tłoku ponad próg szkoda
      (zombie.ts, pushOf). */
  private press(tile: number): void {
    const dmg = pushOf(this.crowdAt(tile), this.wireHp(tile));
    if (dmg > 0) this.damageFence(tile, dmg);
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
        this.wreckObwod(hole.tiles);
        this.breach();
      }
      return;
    }
    const k = this.fenceIndex.get(tile);
    if (k === undefined || f.hp[k] <= 0) return;
    f.hp[k] = Math.max(0, f.hp[k] - amount);
    if (f.hp[k] > 0) return;
    this.wreckObwod([tile]);
    const id = f.holes.reduce((m, h) => Math.max(m, h.id), 0) + 1;
    f.holes.push({ id, tiles: [tile], size: 0.6, patch: 0 });
    this.breach();
  }

  private breach(): void {
    this.st.tally!.breaches++;
    this.rebuild();
  }

  /** Zasieki (M2) i barykady z wraków na kafelkach, które napór zbił do zera: zniszczone, bez zwrotu materiału, żeby
      widok pokazał dziurę, a rozbiórka nie łatała przerwania za darmo. */
  private wreckObwod(tiles: readonly number[]): void {
    const st = this.st;
    const size = this.w.size;
    let gone = false;
    for (let k = st.things.length - 1; k >= 0; k--) {
      const t = st.things[k];
      if (!naObwodzie(t.kind) || !tiles.includes(t.y * size + t.x)) continue;
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

  /** sterty, które pionek może wziąć: jego albo niczyje (`nasze`: dla pracy bez polecenia tylko z naszego terenu,
      do których wolno dojść) */
  private freeHeaps(p: Pawn, kind: string, nasze = false): Thing[] {
    const size = this.w.size;
    return this.st.things.filter(
      (t) =>
        t.kind === kind &&
        t.n > 0 &&
        (t.by < 0 || t.by === p.id) &&
        !this.uSasiada(t) &&
        (!nasze || (this.naszTeren(t.y * size + t.x) && this.dojdzieWDomu(p, t.y * size + t.x))),
    );
  }

  /** czy na wolnych stertach starczy każdego materiału */
  private haveHeaps(p: Pawn, need: readonly [string, number][], nasze = false): boolean {
    return need.every(([kind, n]) => this.freeHeaps(p, kind, nasze).reduce((a, t) => a + t.n, 0) >= n);
  }

  /** materiał ze stert: n sztuk danego rodzaju (najpierw ze sterty first), false, gdy nie starczy */
  private takeHeaps(p: Pawn, kind: string, n: number, first: number, nasze = false): boolean {
    const st = this.st;
    const heaps = this.freeHeaps(p, kind, nasze).sort((a, b) =>
      a.id === first ? -1 : b.id === first ? 1 : a.id - b.id,
    );
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

  /** dzida z polecenia: do sterty desek, potem godzina pracy na miejscu */
  private orderCraft(pawns: Pawn[]): void {
    this.startCraft(pawns[0], true);
  }

  /** Dzida: do sterty desek, potem godzina pracy na miejscu (z umiejętnością krócej). Bez polecenia (`order`
      fałszywe, automat Warsztatu) materiał tylko z naszego terenu. false, gdy materiału nie starcza albo nie ma drogi. */
  private startCraft(p: Pawn, order: boolean): boolean {
    const nasze = !order;
    if (
      !this.haveHeaps(
        p,
        [
          ['deski', SPEAR_BOARDS],
          ['zlom', SPEAR_SCRAP],
        ],
        nasze,
      )
    )
      return false;
    const heap = this.heapFor(p, 'deski', PATCH_COST, nasze);
    if (!heap) return false;
    const ht = heap.y * this.w.size + heap.x;
    if (!this.idz(p, ht, order)) return false;
    const j = this.newJob('craft', -1, ht, order);
    j.from = heap.id;
    this.setJob(p, j, false);
    heap.by = p.id;
    return true;
  }

  /** czy na kafelku siatki stoi barykada (ma 160 wytrzymałości, więc wzmocnienie deskami, które sięga 100, jej nie dotyka) */
  private barykadaNa(tile: number): boolean {
    const size = this.w.size;
    return this.st.things.some((t) => t.kind === 'barykada' && t.y * size + t.x === tile);
  }

  /** wzmocnienie kafelka siatki: po materiał na stertę (2 sztuki jednego rodzaju), potem do siatki od podwórka; nie pod
      barykadą */
  private orderBrace(pawns: Pawn[], tile: number): void {
    const f = this.st.fence;
    const k = this.fenceIndex.get(tile);
    if (!f || k === undefined || f.hp[k] <= 0 || f.hp[k] >= 100 || this.barykadaNa(tile)) return;
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
    const heap = st.things.find((t) => t.kind === 'leki' && t.n > 0 && !this.uSasiada(t));
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

  /** lampa warty (z wieży sięga ×1,5 dalej) albo palące się ognisko w zasięgu */
  private litNear(x: number, y: number): boolean {
    for (const q of this.st.pawns)
      if (
        !q.away &&
        q.job?.t === 'guard' &&
        q.job.phase === 1 &&
        Math.hypot(q.x - x, q.y - y) <= (q.job.target === WIEZA_POST ? LAMP_REACH * WIEZA_ZASIEG : LAMP_REACH)
      )
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
        if (t.n <= 0 || (t.by >= 0 && t.by !== p.id) || !ok(t) || this.uSasiada(t)) continue;
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
    // pali się to, co paliło się na początku kroku (ciepło i światło); kocioł zjada tyle ognia, ile wynosi jego waga
    const fires = this.fires();
    const lights = this.lightRooms();
    for (const t of st.things)
      if ((Object.hasOwn(PALENISKA, t.kind) || t.kind === 'ognisko') && t.fuel > 0)
        t.fuel = Math.max(0, t.fuel - HEAT_EVERY * wagaPaleniska(t.kind));
    // krew, trupy i zwłoki z czasem znikają
    if (st.things.some((t) => t.until !== undefined && t.until <= st.tick))
      st.things = st.things.filter((t) => t.until === undefined || t.until > st.tick);
    // folia i koce w oknach (t_okna): dodatek do temperatury bazowej w pomieszczeniach naszych mieszkań
    this.boost = heatStep(
      st.temps,
      this.kinds,
      this.links,
      fires,
      tout,
      this.tech('t_okna') ? this.oknaExtra() : undefined,
    );
    // ogródki, szklarnie i pieczarkarnie rosną; co trzy doby plon obok grządek
    for (const t of st.things)
      if (t.kind === 'ogrodek' || t.kind === 'szklarnia' || t.kind === 'pieczarkarnia') {
        t.fuel += HEAT_EVERY;
        if (t.fuel < GARDEN_TICKS) continue;
        t.fuel = 0;
        this.plon(t);
      }
    this.light = roomLight(this.kinds.length, this.links, lights);
    const hours = HEAT_EVERY / TICKS_PER_HOUR;
    const night = this.nightAround();
    for (const p of st.pawns) {
      if (!p.needs || p.away) continue;
      // chwilowe nastroje wygasają, reszta dodaje się do nastroju z potrzeb
      if (p.moods.length) p.moods = p.moods.filter((m) => m.until > st.tick);
      const bonus = p.moods.reduce((a, m) => a + m.d, 0);
      if (p.kind === 'resident' || p.kind === 'sasiad') stepSafe(p.needs, this.needCtx(p, tout, night), hours, bonus);
      else stepNeeds(p.needs, this.needCtx(p, tout, night), hours, bonus);
      // gorączka: zdrowie spada liniowo do zera w chwili śmierci
      if (p.bite !== undefined) {
        const left = Math.max(0, p.bite + FEVER_TICKS - st.tick);
        p.needs.health = Math.min(p.needs.health, Math.round((1000 * left) / FEVER_TICKS) / 10);
      }
    }
    this.tutCheck();
  }

  /** pomieszczenia, które grzeją palące się paleniska: z kozą albo kozą z beczki, a przy palącym się kotle wszystkie
      pomieszczenia naszych mieszkań (kocioł na klatce grzeje je naraz). Światło to osobna lista (`lightRooms`). */
  private fires(): number[] {
    const h = this.house!;
    const out: number[] = [];
    let kociol = false;
    for (const t of this.st.things) {
      if (t.fuel <= 0) continue;
      if (t.kind === 'koza' || t.kind === 'koza_beczka') {
        const r = h.room[t.y * this.w.size + t.x];
        if (r >= 0) out.push(r);
      } else if (t.kind === 'kociol') kociol = true;
    }
    if (kociol) {
      const ours = this.ourApts();
      for (const r of h.rooms) if (r.apt >= 0 && ours.has(r.apt) && !out.includes(r.id)) out.push(r.id);
    }
    return out;
  }

  /** Pomieszczenia, w których świeci palące się palenisko: tylko to, w którym stoi (koza, koza z beczki, kocioł),
      a nie wszystkie, które grzeje (`fires`): kocioł rozgrzewa nasze mieszkania, ale świeci w swojej klatce albo
      przedpokoju, więc nocą nie świecą od niego wszystkie okna. */
  private lightRooms(): number[] {
    const h = this.house!;
    const out: number[] = [];
    for (const t of this.st.things) {
      if (t.fuel <= 0 || !Object.hasOwn(PALENISKA, t.kind)) continue;
      const r = h.room[t.y * this.w.size + t.x];
      if (r >= 0 && !out.includes(r)) out.push(r);
    }
    return out;
  }

  /** t_okna: o ile °C cieplej w każdym pomieszczeniu (OKNA_PLUS w naszych mieszkaniach, poza nimi 0) */
  private oknaExtra(): number[] {
    const ours = this.ourApts();
    return this.house!.rooms.map((r) => (r.apt >= 0 && ours.has(r.apt) ? OKNA_PLUS : 0));
  }

  /** czy technologia jest zbadana (`st.techDone` powstaje dopiero przy pierwszym badaniu) */
  private tech(id: string): boolean {
    return this.st.techDone?.includes(id) === true;
  }

  /** Plon uprawy po trzech dobach: ogródek według pory roku, szklarnia tak samo, ale zimą jak jesienią, pieczarkarnia
      stały przez cały rok. Po t_konserwy plon ×1,2 z ułamkiem w `Thing.n` rzeczy; po t_zielarstwo plon ogródka daje
      czasem lek (do zapasu zarządu). Jedzenie leży obok grządek, z pieczarkarni w jej łazience. */
  private plon(t: Thing): void {
    const st = this.st;
    const size = this.w.size;
    const pora = seasonOf(st.tick);
    const baza =
      t.kind === 'pieczarkarnia' ? PIECZARKI_PLON : GARDEN_YIELD[t.kind === 'szklarnia' && pora === 1 ? 0 : pora];
    let n = baza;
    if (this.tech('t_konserwy')) {
      const k = plonKonserw(baza, t.n);
      n = k.n;
      t.n = k.reszta;
    }
    if (n > 0) {
      if (t.kind === 'pieczarkarnia') this.dropMat(t.y * size + t.x, 'jedzenie', n, this.roomOf[t.y * size + t.x]);
      else this.dropMat((t.y + 1) * size + t.x + 1, 'jedzenie', n);
    }
    if (baza > 0 && t.kind === 'ogrodek' && this.tech('t_zielarstwo') && lekZPlonu(st.seed, t.id, st.tick))
      st.store.meds += 1;
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
      if (t.fuel <= 0 || (!Object.hasOwn(PALENISKA, t.kind) && t.kind !== 'ognisko')) continue;
      const near = Math.hypot(p.x - (t.x + t.w / 2), p.y - (t.y + t.h / 2)) <= FIRE_REACH + 0.5;
      // koza, koza z beczki i kocioł grzeją w swoim pomieszczeniu, ognisko na dworze
      if (near && (t.kind === 'ognisko' ? !inside : h.room[t.y * size + t.x] === r)) fire = true;
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
      // ambulatorium polowe (t_ambu): zdrowie wraca szybciej
      heal: this.tech('t_ambu') ? AMBU_TEMPO : 1,
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

  /* ---------- M2 fala 2: sąsiednie budynki (docs/M2-fala-2.md, czyste funkcje w src/sim/sasiedzi.ts) ---------- */

  /** stan sąsiadów; powstaje przy pierwszych cudzych drzwiach (wcześniej pola nie ma, więc skrót jest jak przed falą 2) */
  private sasiedzi(): Sasiedzi {
    this.st.sasiedzi ??= { budynki: [], spotkanie: null, nr: 0, napis: null, n: 0 };
    return this.st.sasiedzi;
  }

  /** napis dla interfejsu, każdy nowy z kolejnym numerem */
  private napisSasiada(co: string, b: number, extra: Omit<Partial<Napis>, 'n' | 'co' | 'b' | 'tick'> = {}): void {
    const s = this.sasiedzi();
    s.n++;
    s.napis = { n: s.n, co, tick: this.st.tick, b, ...extra };
  }

  /** Indeks wpisu budynku. Przy pierwszym dotknięciu wpis powstaje z lokatorami z generatora mieszkańców (źródło
      ustawione przez grę; błąd źródła daje lokatorów zapasowych), a budynek z wyważonymi już drzwiami na zewnątrz
      od razu się otwiera. */
  private budynekSasiada(bid: number): number {
    const s = this.sasiedzi();
    const have = s.budynki.findIndex((b) => b.bid === bid);
    if (have >= 0) return have;
    s.budynki.push(nowyBudynek(this.w, modeOf(this.st), bid, this.lokatorzyDla(bid)));
    const k = s.budynki.length - 1;
    const b = s.budynki[k];
    if (drzwiBudynku(this.w, bid).zewn.some((d) => przechodnie(stanDrzwi(b, d.tile)?.s ?? 'zamkniete')))
      this.otworzBudynek(k);
    return k;
  }

  /** lokatorzy budynku z generatora mieszkańców (źródło ustawione przez grę) albo zapasowi; null bez mieszkań */
  private lokatorzyDla(bid: number): LokatorzyBudynku | null {
    const w = this.w;
    if (!mieszkalny(w, bid)) return null;
    let lok: LokatorzyBudynku | null = null;
    try {
      lok = this.lokatorzy?.(bid) ?? null;
    } catch (e) {
      console.warn('Sąsiedzi: lokatorzy z generatora się nie udali, są zapasowi', e);
    }
    return lok ?? domyZapasowe(w, wnetrze(w, bid), new Set(this.st.people.map((p) => p.first)));
  }

  /** Wpis cudzego budynku do karty budynku: z gry albo podgląd, czyli ten sam wpis, który powstanie przy pierwszym
      dotknięciu drzwi (z ziarna świata i budynku). Podgląd nie trafia do stanu, więc oglądanie kart nie zmienia gry.
      null dla siedziby i poza budynkami. */
  budynekDoKarty(bid: number): { b: SasiedniBudynek; wGrze: boolean } | null {
    const w = this.w;
    if (bid < 0 || bid === w.hq || !w.buildings[bid]) return null;
    const have = this.st.sasiedzi?.budynki.find((b) => b.bid === bid);
    if (have) return { b: have, wGrze: true };
    let p = this.podglady.get(bid);
    if (!p) {
      p = nowyBudynek(w, modeOf(this.st), bid, this.lokatorzyDla(bid));
      this.podglady.set(bid, p);
    }
    return { b: p, wGrze: false };
  }

  /** nakładka wnętrz otwartych budynków od nowa (po otwarciu budynku i przy wczytaniu zapisu) */
  private przeliczNakladke(): void {
    const s = this.st.sasiedzi;
    this.nbTiles.clear();
    if (!s?.budynki.some((b) => b.otwarty)) {
      this.nbCell = null;
      this.nbRoom = null;
      return;
    }
    const size = this.w.size;
    const cell = new Uint8Array(size * size);
    const room = new Int32Array(size * size).fill(-1);
    s.budynki.forEach((b, k) => {
      if (!b.otwarty) return;
      const it = wnetrze(this.w, b.bid);
      const B = this.w.buildings[b.bid];
      for (let y = B.y0; y <= B.y1; y++)
        for (let x = B.x0; x <= B.x1; x++) {
          const i = y * size + x;
          const c = it.cell[i];
          if (c === IN.NONE) continue;
          cell[i] = c;
          if (it.room[i] < 0) continue;
          const g = gid(k, it.room[i]);
          room[i] = g;
          if (c !== IN.FLOOR) continue;
          const list = this.nbTiles.get(g);
          if (list) list.push(i);
          else this.nbTiles.set(g, [i]);
        }
    });
    this.nbCell = cell;
    this.nbRoom = room;
  }

  /** wnętrza otwartych budynków na warstwę przechodniości: ściany i schody blokują, posadzki i drzwi w środku
      przechodzą, drzwi na zewnątrz i drzwi mieszkań według stanu */
  private nalozSasiadow(layer: Uint8Array): void {
    const s = this.st.sasiedzi;
    const cell = this.nbCell;
    if (!s || !cell) return;
    const size = this.w.size;
    for (const b of s.budynki) {
      if (!b.otwarty) continue;
      const B = this.w.buildings[b.bid];
      for (let y = B.y0; y <= B.y1; y++)
        for (let x = B.x0; x <= B.x1; x++) {
          const i = y * size + x;
          if (cell[i] !== IN.NONE) layer[i] = solidCell(cell[i]) ? 1 : 0;
        }
      for (const d of b.drzwi) layer[d.t] = przechodnie(d.s) ? 0 : 1;
      // gra sieciowa: klatki innych drużyn zamknięte na stałe
      for (const t of kafelkiZajete(this.st, this.w, b.bid)) layer[t] = 1;
    }
  }

  /** kafelek w pomieszczeniu otwartego sąsiedniego budynku */
  private inSasiad(i: number): boolean {
    return this.nbRoom !== null && this.nbRoom[i] >= 0;
  }

  /** posadzka pomieszczenia sąsiada (gid) */
  kafelkiPokoju(g: number): readonly number[] {
    return this.nbTiles.get(g) ?? [];
  }

  /** posadzka mieszkania sąsiada */
  private kafelkiMieszkania(k: number, apt: number): number[] {
    const it = wnetrze(this.w, this.st.sasiedzi!.budynki[k].bid);
    const out: number[] = [];
    for (const r of it.rooms) if (r.apt === apt) out.push(...this.kafelkiPokoju(gid(k, r.id)));
    return out;
  }

  /** kafelek z listy najbliżej danego (remis: mniejszy numer) */
  private najblizej(tiles: readonly number[], to: number): number {
    const size = this.w.size;
    const tx = to % size;
    const ty = Math.floor(to / size);
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const i of tiles) {
      const d = ((i % size) - tx) ** 2 + (Math.floor(i / size) - ty) ** 2;
      if (d < bd || (d === bd && i < best)) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Wnętrze budynku dołącza do mapy: meble i śmieci jako rzeczy, nakładka i przechodniość od nowa. Mieszkanie bez
      drzwi wejściowych (dom: drzwi domu są drzwiami mieszkania) wypuszcza szwendacza z wymarcia od razu. */
  private otworzBudynek(k: number): void {
    const st = this.st;
    const b = st.sasiedzi!.budynki[k];
    if (b.otwarty) return;
    b.otwarty = true;
    const it = wnetrze(this.w, b.bid);
    const broken = new Set(b.zawartosc?.zepsute ?? []);
    it.furniture.forEach((f, i) => {
      const t = newThing(st, f.kind, f.x, f.y, f.w, f.h, f.rot);
      if (broken.has(i)) t.broken = true;
      st.things.push(t);
    });
    for (const [x, y, n] of b.zawartosc?.smieci ?? []) {
      const t = newThing(st, 'smieci', x, y);
      t.n = n;
      st.things.push(t);
    }
    delete b.zawartosc;
    this.przeliczNakladke();
    this.rebuild();
    this.wersjaSasiadow++;
    const withDoor = new Set(drzwiBudynku(this.w, b.bid).mieszkan.values());
    for (const m of b.mieszkania) if (m.zombie && !withDoor.has(m.apt)) this.wypuscSzwendacza(k, m.apt, -1);
  }

  /** szwendacz z wymarcia wychodzi z mieszkania: tuż za drzwiami (albo przy drzwiach domu), w limicie szwendaczy */
  private wypuscSzwendacza(k: number, apt: number, door: number): void {
    const b = this.st.sasiedzi!.budynki[k];
    const m = b.mieszkania.find((x) => x.apt === apt);
    if (!m?.zombie) return;
    m.zombie = false;
    const tiles = this.kafelkiMieszkania(k, apt);
    if (!tiles.length || this.zombieCount() >= MAX_ZOMBIES) return;
    const near = door >= 0 ? door : (drzwiBudynku(this.w, b.bid).zewn[0]?.tile ?? tiles[0]);
    const look = Math.floor(rngOfPlace(this.w.seed, b.bid, apt, 0x51e6)() * 16);
    spawnZombie(this.st, this.w, this.najblizej(tiles, near), look);
    this.napisSasiada('szwendacz', k);
  }

  /** kafelek za drzwiami po drugiej stronie niż kafelek przed nimi (−1, gdy nie da się tam stanąć) */
  private zaDrzwiami(door: number, stand: number): number {
    const t = 2 * door - stand;
    const size = this.w.size;
    const ok =
      t >= 0 &&
      t < size * size &&
      Math.abs((t % size) - (door % size)) <= 1 &&
      Math.abs(Math.floor(t / size) - Math.floor(door / size)) <= 1;
    return ok && !this.coreBlocked[t] ? t : -1;
  }

  /** polecenie przy cudzych drzwiach: pierwsza osoba pracuje, reszta staje obok; przy otwartych „Wejść” */
  private orderDoor(pawns: Pawn[], t: 'open' | 'knock' | 'force' | 'board' | 'unboard', door: number): void {
    const w = this.w;
    const bid = w.bid[door];
    if (bid < 0 || bid === w.hq || kafelkiZajete(this.st, w, bid).has(door)) return;
    const k = this.budynekSasiada(bid);
    const b = this.st.sasiedzi!.budynki[k];
    const d = stanDrzwi(b, door);
    if (!d) return;
    const dz = drzwiBudynku(w, bid);
    const stand = dz.zewn.find((x) => x.tile === door)?.out ?? dz.przed.get(door);
    if (stand === undefined) return;
    const p = pawns[0];
    if (t === 'open' && przechodnie(d.s)) {
      const inside = this.zaDrzwiami(door, stand);
      if (inside >= 0) this.orderMove(pawns, inside, [], true);
      return;
    }
    if (!this.drzwiPozwalaja(p, t, d)) return;
    if (!this.go(p, stand)) return;
    const j = this.newJob('door', door, stand, true);
    j.what = t;
    this.setJob(p, j, false);
    if (pawns.length > 1) this.orderMove(pawns.slice(1), stand, [stand], true);
  }

  /** czy w tym stanie drzwi da się to zrobić; zabicie deskami na start pracy także wtedy, gdy na stertach są deski */
  private drzwiPozwalaja(p: Pawn, t: string, d: DrzwiStan, start = true): boolean {
    if (t === 'open') return d.s === 'zamkniete';
    if (t === 'knock' || t === 'force') return d.s === 'zamkniete' || d.s === 'na_klucz';
    if (t === 'board') return przechodnie(d.s) && (!start || this.haveHeaps(p, [['deski', ZABIJANIE_DESKI]]));
    return d.s === 'zabite';
  }

  /** czas pracy przy drzwiach: z łomem w rękach wyważanie dwa razy krótsze */
  private czasDrzwi(p: Pawn, t: string, zewn: boolean): number {
    if (t === 'open') return OTWIERANIE_TICKS;
    if (t === 'knock') return PUKANIE_TICKS;
    if (t === 'board') return ZABIJANIE_TICKS;
    if (t === 'unboard') return ODBIJANIE_TICKS;
    return Math.round((zewn ? WYWAZ_KLATKA_TICKS : WYWAZ_MIESZKANIE_TICKS) * (p.weapon === 'lom' ? 0.5 : 1));
  }

  /** hałas pracy przy drzwiach (promień w metrach); z łomem wyważa się ciszej */
  private halasDrzwi(p: Pawn, t: string, zewn: boolean): number {
    const lom = p.weapon === 'lom';
    if (t === 'force')
      return zewn ? (lom ? HALAS.wywazanieLom : HALAS.wywazanie) : lom ? HALAS.mieszkanieLom : HALAS.mieszkanie;
    if (t === 'board') return HALAS.deski;
    if (t === 'unboard') return HALAS.odbijanie;
    return t === 'knock' ? HALAS.pukanie : HALAS.otwieranie;
  }

  /** praca przy drzwiach: dojście, praca z hałasem co 2 sekundy, na końcu skutek */
  private drzwiPraca(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const tick = st.tick;
    const bid = this.w.bid[j.target];
    const k = st.sasiedzi?.budynki.findIndex((b) => b.bid === bid) ?? -1;
    const d = k >= 0 ? stanDrzwi(st.sasiedzi!.budynki[k], j.target) : undefined;
    // drzwi zmieniły się w międzyczasie (ktoś inny je otworzył, wyważył albo zabił)
    if (!d || !this.drzwiPozwalaja(p, j.what, d, false)) return false;
    const zewn = drzwiBudynku(this.w, bid).zewn.some((x) => x.tile === j.target);
    const size = this.w.size;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = tick;
      j.until = tick + this.czasDrzwi(p, j.what, zewn);
      this.face(p, (j.target % size) + 0.5, Math.floor(j.target / size) + 0.5);
      this.addNoise(p.x, p.y, this.halasDrzwi(p, j.what, zewn));
      return true;
    }
    if ((tick - j.t0) % NOISE_TICKS === 0) this.addNoise(p.x, p.y, this.halasDrzwi(p, j.what, zewn));
    if (tick < j.until) return true;
    return this.koniecDrzwi(p, k, d, j.what, zewn);
  }

  /** Skutek pracy przy drzwiach. true: osoba dostała nową pracę (krok za drzwi, spotkanie, noszenie). */
  private koniecDrzwi(p: Pawn, k: number, d: DrzwiStan, t: string, zewn: boolean): boolean {
    const b = this.st.sasiedzi!.budynki[k];
    if (t === 'open' && d.k) {
      d.s = 'na_klucz';
      this.wersjaSasiadow++;
      this.napisSasiada('na_klucz', k, { kto: p.id });
      return this.czekajPrzyDrzwiach(p);
    }
    if (t === 'open' || t === 'force') {
      d.s = t === 'open' ? 'otwarte' : 'wywazone';
      delete d.k;
      return this.poOtwarciu(p, k, d, zewn, t === 'force');
    }
    if (t === 'knock') return this.pukanie(p, k, d);
    if (t === 'board') {
      if (!this.takeHeaps(p, 'deski', ZABIJANIE_DESKI, -1)) return false;
      d.s = 'zabite';
    } else d.s = 'otwarte';
    this.rebuild();
    this.wersjaSasiadow++;
    if (b.otwarty && t === 'unboard') this.napisSasiada('odbite', k, { kto: p.id });
    return false;
  }

  /** Po „Zamknięte na klucz” i „Nikt nie otwiera” pionek czeka przy drzwiach jak po „Idź tu” (STAY_AFTER_ORDER), żeby gracz
      mógł zapukać albo wyważyć; dopiero potem obowiązuje zwykła reguła (w trybie zombie powrót do siedziby). Praca przy
      drzwiach staje się czekaniem na miejscu; przerwane przez walkę wznawia się jako „idź na to miejsce”.
      true: pionek czeka (praca trwa). */
  private czekajPrzyDrzwiach(p: Pawn): boolean {
    const j = p.job;
    if (!j) return false;
    const tile = this.tileOf(p);
    j.t = 'go';
    j.phase = 1;
    j.target = tile;
    j.tile = tile;
    j.from = -1;
    j.what = '';
    j.n = 0;
    j.order = true;
    j.t0 = this.st.tick;
    j.until = this.st.tick + STAY_AFTER_ORDER;
    if (p.polecenie) p.polecenie.c = { t: 'move', ids: [p.id], to: tile };
    return true;
  }

  /** Drzwi otwarte albo wyważone: budynek się otwiera, za drzwiami mieszkania może czekać szwendacz albo lokatorzy
      (spotkanie), a hałas wyważania słyszą lokatorzy w domu. Przy drzwiach na zewnątrz osoba robi krok do środka. */
  private poOtwarciu(p: Pawn, k: number, d: DrzwiStan, zewn: boolean, wywazone: boolean): boolean {
    const b = this.st.sasiedzi!.budynki[k];
    if (!b.otwarty) this.otworzBudynek(k);
    else {
      this.rebuild();
      this.wersjaSasiadow++;
    }
    const dz = drzwiBudynku(this.w, b.bid);
    const apt = dz.mieszkan.get(d.t);
    if (wywazone) for (const i of this.domyZaDrzwiami(k, d.t)) this.slyszaHalas(k, i);
    if (apt !== undefined) {
      this.wypuscSzwendacza(k, apt, d.t);
      const dom = b.domy.findIndex((g) => g.apt === apt && g.gdzie === 'u_siebie' && this.wDomuTeraz(k, g));
      if (dom >= 0 && this.zacznijSpotkanie(p, k, dom, 'mieszkanie', wywazone)) return true;
    }
    if (zewn) {
      // dom: drzwi domu prowadzą prosto do mieszkania
      const dom = b.domy.findIndex(
        (g, i) =>
          g.gdzie === 'u_siebie' &&
          this.domyZaDrzwiami(k, d.t).includes(i) &&
          this.wDomuTeraz(k, g) &&
          dz.mieszkan.size === 0,
      );
      if (dom >= 0 && this.zacznijSpotkanie(p, k, dom, 'mieszkanie', wywazone)) return true;
      const inside = this.zaDrzwiami(d.t, this.tileOf(p));
      if (inside >= 0 && this.go(p, inside)) {
        this.setJob(p, this.newJob('go', inside, inside, false), false);
        return true;
      }
    }
    return false;
  }

  /** gospodarstwa za drzwiami (indeksy w domy): mieszkanie za drzwiami mieszkania, a za drzwiami na zewnątrz mieszkania,
      do których prowadzi wnętrze od tych drzwi (dom: całe, blok: mieszkania tej klatki) */
  private domyZaDrzwiami(k: number, door: number): number[] {
    const b = this.st.sasiedzi!.budynki[k];
    const apts = mieszkaniaZaDrzwiami(this.w, b.bid, door);
    return b.domy.flatMap((g, i) => (apts.has(g.apt) ? [i] : []));
  }

  /** gospodarstwo jest teraz w domu (nocą zawsze, w trybie zombie zawsze, za dnia część poza domem) */
  private wDomuTeraz(k: number, g: Gospodarstwo): boolean {
    return domTeraz(this.st, this.w, k, this.st.sasiedzi!.budynki[k].domy.indexOf(g));
  }

  /** hałas pod drzwiami słyszą ci, którzy są w domu: nocą strach albo gniew, relacja spada */
  private slyszaHalas(k: number, dom: number): void {
    const b = this.st.sasiedzi!.budynki[k];
    const g = b.domy[dom];
    if (g?.gdzie !== 'u_siebie' || !this.wDomuTeraz(k, g)) return;
    Object.assign(g, poHalasie(g, this.night()));
  }

  /** Pukanie: kto jest w domu za tymi drzwiami, może otworzyć (spotkanie), wrodzy w gniewie nocą wychodzą od razu; bez
      nikogo napis, a w trybie zombie szuranie za drzwiami mieszkania ze szwendaczem. true: zaczęło się spotkanie. */
  private pukanie(p: Pawn, k: number, d: DrzwiStan): boolean {
    const b = this.st.sasiedzi!.budynki[k];
    const apt = drzwiBudynku(this.w, b.bid).mieszkan.get(d.t);
    const home = this.domyZaDrzwiami(k, d.t).filter(
      (i) => b.domy[i].gdzie === 'u_siebie' && this.wDomuTeraz(k, b.domy[i]),
    );
    if (!home.length) {
      const z = apt !== undefined ? b.mieszkania.find((m) => m.apt === apt)?.zombie : false;
      this.napisSasiada(z ? 'szuranie' : 'nikt', k, { kto: p.id });
      return this.czekajPrzyDrzwiach(p);
    }
    // otwiera najchętniejszy: życzliwi, zdesperowani, nieufni, wrodzy
    const order: Zamiar[] = ['zyczliwi', 'zdesperowani', 'nieufni', 'wrodzy'];
    const dom = [...home].sort((a, c) => order.indexOf(b.domy[a].zamiar) - order.indexOf(b.domy[c].zamiar) || a - c)[0];
    const g = b.domy[dom];
    const noc = this.night();
    if (!atakOdRazu(g, false, noc)) {
      const chetnie =
        { zyczliwi: 1, zdesperowani: 0.9, nieufni: noc ? 0.3 : 0.6, wrodzy: 0.25 }[g.zamiar] *
        (modeOf(this.st) === 'zombie' ? 0.7 : 1);
      if (nextRandom(this.st.rng) >= chetnie) {
        this.napisSasiada('ktos', k, { dom, kto: p.id });
        return this.czekajPrzyDrzwiach(p);
      }
    }
    return this.zacznijSpotkanie(p, k, dom, 'drzwi', false);
  }

  /** osoby gospodarstwa do st.people przy pierwszym spotkaniu (id z nextId, dom: budynek lokatorów) */
  private ludzieGospodarstwa(g: Gospodarstwo, bid: number): number[] {
    if (g.ludzie) return g.ludzie;
    g.ludzie = g.osoby.map((o) => {
      this.st.people.push({
        id: `s${this.st.nextId++}`,
        first: o.first,
        name: o.name,
        f: o.f,
        prof: o.prof,
        skills: { ...o.skills },
        age: o.age,
        traits: [...o.traits],
        home: bid,
        assign: null,
        sick: false,
        dead: false,
        gone: false,
        ...(o.story ? { story: o.story } : {}),
        ...(o.ref ? { ref: o.ref, nazwaGen: o.name } : {}),
        ...(o.rodzina ? { rodzina: o.rodzina } : {}),
      });
      return this.st.people.length - 1;
    });
    return g.ludzie;
  }

  /** Spotkanie: lokatorzy stają się pionkami w drzwiach (obok naszej osoby) albo w mieszkaniu (przy drzwiach), nasza
      osoba czeka na wybór gracza, interfejs pokazuje kartę. false: inne spotkanie już trwa. */
  private zacznijSpotkanie(p: Pawn, k: number, dom: number, gdzie: Spotkanie['gdzie'], wywazone: boolean): boolean {
    const st = this.st;
    const s = this.sasiedzi();
    if (s.spotkanie) return false;
    const b = s.budynki[k];
    const g = b.domy[dom];
    const people = this.ludzieGospodarstwa(g, b.bid);
    const size = this.w.size;
    const here = this.tileOf(p);
    let spots: number[];
    if (gdzie === 'mieszkanie' && g.apt >= 0) {
      const tiles = this.kafelkiMieszkania(k, g.apt);
      spots = [...tiles].sort((a, c) => this.dist2(p, a) - this.dist2(p, c) || a - c).slice(0, g.osoby.length + 2);
    } else {
      spots = [];
      for (const [dx, dy] of SPREAD) {
        const i = (Math.floor(p.y) + dy) * size + Math.floor(p.x) + dx;
        if (i === here || i < 0 || i >= size * size || this.coreBlocked[i] || this.reg[i] !== this.reg[here]) continue;
        spots.push(i);
        if (spots.length > g.osoby.length) break;
      }
    }
    if (!spots.length) spots = [here];
    const oni = people.map((person, i) => {
      const at = spots[i % spots.length];
      const look = 4 + Math.floor(rngOfPlace(this.w.seed, b.bid, g.apt * 16 + i, 0x100c)() * 12);
      const q = newPawn(st, this.w, 'sasiad', person, at, at, look);
      q.apt = g.apt;
      // zdrowie do ran i ugryzień, a z potrzeb liczy się tylko bezpieczeństwo i nastrój (jak u mieszkańców)
      q.needs = { food: 70, warm: 60, rest: 70, health: 100, safe: 50, mood: 0 };
      q.needs.mood = 0.25 * 70 + 0.25 * 60 + 0.15 * 70 + 0.15 * 100 + 0.2 * 50;
      q.wait = st.tick;
      this.face(q, p.x, p.y);
      st.pawns.push(q);
      return q.id;
    });
    g.pionki = oni;
    const my = st.pawns
      .filter((q) => q.kind === 'core' && !q.away && (q === p || (q.job?.order && this.dist2(q, here) <= 16)))
      .map((q) => q.id);
    s.nr++;
    s.spotkanie = {
      nr: s.nr,
      b: k,
      dom,
      my,
      oni,
      gdzie,
      tick: st.tick,
      atak: atakOdRazu(g, wywazone, this.night()),
      wywazone,
    };
    for (const id of my) {
      const q = st.pawns.find((x) => x.id === id)!;
      const j = this.newJob('meet', s.nr, this.tileOf(q), true, 1);
      this.setJob(q, j, false);
      const first = st.pawns.find((x) => x.id === oni[0]);
      if (first) this.face(q, first.x, first.y);
    }
    return true;
  }

  /** kontekst wyborów: jedzenie w naszych zapasach, uzbrojeni z naszych przy spotkaniu, tryb i kto u nas mówi najlepiej */
  private kontekstSpotkania(sp: Spotkanie): KontekstSpotkania {
    const st = this.st;
    const our = sp.my.map((id) => st.pawns.find((q) => q.id === id)).filter((q): q is Pawn => !!q);
    const traits = new Set(our.flatMap((q) => st.people[q.person]?.traits ?? []));
    return {
      jedzenie: this.naszeSztuki('jedzenie'),
      uzbrojeni: our.filter((q) => this.armed(q).id !== 'piesci').length,
      mode: modeOf(st),
      mowca: traits.has('lubiany') ? 'lubiany' : traits.has('gadula') ? 'gadula' : null,
    };
  }

  /** kontekst wyborów aktualnego spotkania dla karty (null bez spotkania) */
  kontekstKarty(): KontekstSpotkania | null {
    const sp = this.st.sasiedzi?.spotkanie;
    return sp ? this.kontekstSpotkania(sp) : null;
  }

  /** co mogą powiedzieć przy rozmowie: o innych, których nie znamy, o pustym nieprzeszukanym mieszkaniu, o szwendaczu */
  private infoSpotkania(sp: Spotkanie): Info {
    const b = this.st.sasiedzi!.budynki[sp.b];
    if (b.domy.some((g, i) => i !== sp.dom && !g.znani && g.gdzie === 'u_siebie')) return 'inni';
    if (b.mieszkania.some((m) => m.zombie)) return 'lazi';
    const it = wnetrze(this.w, b.bid);
    if (
      b.mieszkania.some(
        (m) => m.stan === 'puste' && it.rooms.some((r) => r.apt === m.apt && !m.przeszukane.includes(r.id)),
      )
    )
      return 'puste';
    return 'nic';
  }

  /** wybór gracza w spotkaniu: skutek z ziarna gry (st.rng, tylko tu) */
  private wyborSpotkania(nr: number, k: WyborSpotkania): void {
    const s = this.st.sasiedzi;
    const sp = s?.spotkanie;
    if (!s || !sp || sp.nr !== nr) return;
    const g = s.budynki[sp.b].domy[sp.dom];
    const ctx = this.kontekstSpotkania(sp);
    if (!wybory(sp, g, ctx).some((x) => x.k === k && x.ok)) return;
    const sk = skutek(k, g, sp, ctx, this.infoSpotkania(sp), () => nextRandom(this.st.rng));
    this.zastosujSkutek(sp, g, sk);
  }

  /** skutek wyboru w stanie gry i na mapie, potem koniec spotkania albo dalej karta */
  private zastosujSkutek(sp: Spotkanie, g: Gospodarstwo, sk: Skutek): void {
    const st = this.st;
    const s = st.sasiedzi!;
    const b = s.budynki[sp.b];
    g.rel = sk.rel;
    g.zamiar = sk.zamiar;
    g.nastroj = sk.nastroj;
    const our = sp.my.map((id) => st.pawns.find((q) => q.id === id)).filter((q): q is Pawn => !!q);
    const them = sp.oni.map((id) => st.pawns.find((q) => q.id === id)).filter((q): q is Pawn => !!q);
    const lead = our[0];
    const extra: Omit<Partial<Napis>, 'n' | 'co' | 'b' | 'tick'> = { dom: sp.dom };
    if (sk.info === 'inni') {
      const other = b.domy.find((x, i) => i !== sp.dom && !x.znani && x.gdzie === 'u_siebie');
      if (other) other.znani = true;
    }
    if (sk.info) extra.info = sk.info;
    if (sk.pytali) g.pytali = true;
    if (sk.dajemy) {
      const n = this.wezNasze('jedzenie', sk.dajemy);
      g.zapasy.jedzenie = (g.zapasy.jedzenie ?? 0) + n;
      extra.ile = { jedzenie: n };
    }
    // szarpanina: ciosy na mapie, rany
    if ((sk.ranaNasza || sk.ranaIch) && lead && them[0]) {
      this.addFx('cios', them[0].x, them[0].y, lead.x, lead.y);
      this.addFx('cios', lead.x, lead.y, them[0].x, them[0].y);
    }
    if (sk.ranaNasza && lead) {
      this.hurt(lead, sk.ranaNasza, them[0] ?? null);
      extra.kto = lead.id;
    }
    if (sk.ranaIch && them[0]) this.hurt(them[0], sk.ranaIch, lead ?? null);
    if (sk.zabrane) {
      extra.ile = { ...g.zapasy };
      this.zostawZapasy(sp, g.zapasy);
      g.zapasy = {};
      for (const q of st.pawns)
        if (q.kind === 'core' && !q.away && !this.graveyard.has(q.id))
          this.addMood(q, 'Okradliśmy sąsiadów', -3, TICKS_PER_DAY);
    }
    if (sk.zaproszeni) this.przyjmijGospodarstwo(sp, g);
    else if (sk.uciekaja) this.odchodza(sp, g);
    if (sk.odwrot)
      for (const q of our) {
        const spot = this.shelterSpot(q);
        if (spot >= 0 && this.go(q, spot)) this.setJob(q, this.newJob('go', spot, spot, false), false);
      }
    this.napisSasiada(sk.co, sp.b, extra);
    if (!sk.koniec) {
      sp.atak = false;
      sp.runda = (sp.runda ?? 0) + 1;
      return;
    }
    this.koniecSpotkania(sp);
  }

  /** koniec spotkania: nasi wracają do swoich prac, lokatorzy spotkani w drzwiach wracają do środka (znikają), a w
      mieszkaniu zostają, dopóki zarząd jest w budynku */
  private koniecSpotkania(sp: Spotkanie): void {
    const st = this.st;
    st.sasiedzi!.spotkanie = null;
    for (const id of sp.my) {
      const q = st.pawns.find((x) => x.id === id);
      if (q?.job?.t === 'meet') this.done(q);
    }
    if (sp.gdzie === 'drzwi') this.schowajLokatorow(sp.b, sp.dom);
  }

  /** pionki lokatorów znikają z mapy (wracają do liczb gospodarstwa); osoby zostają w st.people */
  private schowajLokatorow(k: number, dom: number): void {
    const g = this.st.sasiedzi!.budynki[k].domy[dom];
    for (const id of g.pionki ?? []) {
      const q = this.st.pawns.find((x) => x.id === id);
      if (q && !this.graveyard.has(q.id)) dropPawn(this.st, q);
    }
    delete g.pionki;
  }

  /** zapasy gospodarstwa na ziemię: w mieszkaniu (spotkanie w mieszkaniu) albo przy drzwiach */
  private zostawZapasy(sp: Spotkanie, zapasy: Partial<Record<Mat, number>>): void {
    const b = this.st.sasiedzi!.budynki[sp.b];
    const g = b.domy[sp.dom];
    const lead = this.st.pawns.find((q) => q.id === sp.my[0]);
    const from = lead
      ? this.tileOf(lead)
      : g.pionki?.length
        ? this.tileOf(this.st.pawns.find((q) => q.id === g.pionki![0])!)
        : -1;
    if (from < 0) return;
    const tiles = sp.gdzie === 'mieszkanie' ? this.kafelkiMieszkania(sp.b, g.apt) : [];
    for (const [m, n] of Object.entries(zapasy) as [Mat, number][]) if (n > 0) this.zostawLup(from, m, n, tiles);
  }

  /** materiał na ziemię: najpierw na podanych kafelkach (pomieszczenie), od najbliższego, potem wokół, na sterty do 10 */
  private zostawLup(from: number, kind: string, n: number, first: readonly number[]): void {
    const st = this.st;
    const size = this.w.size;
    const at = nearestFree(this.coreBlocked, size, from);
    const tiles = [...first].sort((a, b) => this.dist2Tiles(a, at) - this.dist2Tiles(b, at) || a - b);
    for (const [dx, dy] of SPREAD) {
      const x = (at % size) + dx;
      const y = Math.floor(at / size) + dy;
      if (x >= 0 && y >= 0 && x < size && y < size) tiles.push(y * size + x);
    }
    let left = n;
    for (const i of tiles) {
      if (left <= 0) break;
      if (this.coreBlocked[i] || this.reg[i] !== this.reg[at] || onPlan(st, size, i)) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      const same = st.things.find((t) => t.kind === kind && t.x === x && t.y === y);
      if (same) {
        const k = Math.min(left, STACK - same.n);
        same.n += Math.max(0, k);
        left -= Math.max(0, k);
        continue;
      }
      if (this.thingAt(x, y)) continue;
      const t = newThing(st, kind, x, y);
      t.n = Math.min(left, STACK);
      left -= t.n;
      st.things.push(t);
    }
  }

  private dist2Tiles(a: number, b: number): number {
    const size = this.w.size;
    return ((a % size) - (b % size)) ** 2 + (Math.floor(a / size) - Math.floor(b / size)) ** 2;
  }

  /** Zaproszeni idą do siedziby: ich pionki stają się mieszkańcami z osobami i idą drogą zarządu przez bramę do
      mieszkania z wolnym łóżkiem (albo najmniej zatłoczonego), jak przybysze. Ich mieszkanie zostaje puste z zapasami. */
  private przyjmijGospodarstwo(sp: Spotkanie, g: Gospodarstwo): void {
    const st = this.st;
    const h = this.house;
    const b = st.sasiedzi!.budynki[sp.b];
    g.gdzie = 'u_nas';
    const m = b.mieszkania.find((x) => x.apt === g.apt);
    if (m) {
      m.stan = 'puste';
      m.why = 'wyjazd';
      m.year = 2051;
      m.dom = -1;
    }
    // drzwi mieszkania zostają otwarte; ich zapasy leżą w mieszkaniu (w drzwiach: przy drzwiach)
    const dz = drzwiBudynku(this.w, b.bid);
    for (const [tile, apt] of dz.mieszkan)
      if (apt === g.apt) {
        const d = stanDrzwi(b, tile);
        if (d && !przechodnie(d.s)) {
          d.s = 'otwarte';
          delete d.k;
        }
      }
    this.zostawZapasy(sp, g.zapasy);
    g.zapasy = {};
    if (!h) {
      this.schowajLokatorow(sp.b, sp.dom);
      return;
    }
    const size = this.w.size;
    const apts = residentApts(st, this.w, h);
    // tryb zombie: ukryty ugryziony zostaje, gdy zarząd o niego zapytał, a bez pytania przychodzi z gorączką
    const bitten = g.ugryziony !== undefined ? g.pionki?.[g.ugryziony] : undefined;
    for (const id of g.pionki ?? []) {
      const q = st.pawns.find((x) => x.id === id);
      if (!q) continue;
      if (id === bitten && g.pytali) {
        dropPawn(st, q);
        continue;
      }
      q.kind = 'resident';
      const apt = aptFor(st, h, size, apts);
      q.apt = apt;
      q.needs = { food: 60, warm: 50, rest: 60, health: 100, safe: 50, mood: 0 };
      q.needs.mood = 0.25 * 60 + 0.25 * 50 + 0.15 * 60 + 0.15 * 100 + 0.2 * 50;
      const tiles: number[] = [];
      for (let i = 0; i < size * size; i++) if (apt >= 0 && aptAt(h, i) === apt && !this.coreBlocked[i]) tiles.push(i);
      const at = tiles.length ? tiles[q.id % tiles.length] : this.door;
      q.job = {
        t: 'arrive',
        target: apt,
        tile: at,
        phase: 0,
        from: -1,
        t0: st.tick,
        until: st.tick,
        order: false,
        n: 0,
        what: '',
      };
      const bed = st.things.find(
        (t) => BEDS.has(t.kind) && !t.broken && t.owner < 0 && apt >= 0 && aptAt(h, t.y * size + t.x) === apt,
      );
      if (bed) bed.owner = q.id;
      if (id === bitten) {
        // gorączka od kilku godzin: umrze i wstanie jeszcze tej doby, chyba że ktoś zdąży z amputacją albo go dobije
        infect(st, q, true);
        q.bite = st.tick - ugryzionyOd(this.w.seed, b.bid, g.apt) * TICKS_PER_HOUR;
        const fever = q.moods[q.moods.length - 1];
        if (fever) fever.until = q.bite + FEVER_TICKS;
      }
    }
    delete g.pionki;
    // uciekający z budynku nie są już na spotkaniu
    sp.oni = [];
    this.wersjaSasiadow++;
  }

  /** lokatorzy odchodzą z budynku: pionki znikają, mieszkanie puste z tym, czego nie zabrali */
  private odchodza(sp: Spotkanie, g: Gospodarstwo): void {
    const b = this.st.sasiedzi!.budynki[sp.b];
    g.gdzie = 'odeszli';
    const m = b.mieszkania.find((x) => x.apt === g.apt);
    if (m) {
      m.stan = 'puste';
      m.why = 'wyjazd';
      m.year = 2051;
      m.dom = -1;
    }
    this.zostawZapasy(sp, g.zapasy);
    g.zapasy = {};
    this.schowajLokatorow(sp.b, sp.dom);
    sp.oni = [];
  }

  /** zginął lokator: wypada z gospodarstwa (cały dom nie żyje, gdy nie został nikt) */
  private zginalSasiad(p: Pawn): void {
    for (const b of this.st.sasiedzi?.budynki ?? [])
      for (const g of b.domy) {
        if (!g.pionki?.includes(p.id)) continue;
        const k = g.pionki.indexOf(p.id);
        g.pionki.splice(k, 1);
        const person = p.person;
        const idx = g.ludzie?.indexOf(person) ?? -1;
        if (idx >= 0) {
          g.ludzie!.splice(idx, 1);
          g.osoby.splice(idx, 1);
          // indeks ukrytego ugryzionego przesuwa się razem z osobami (a ginie razem z nim)
          if (g.ugryziony === idx) delete g.ugryziony;
          else if (g.ugryziony !== undefined && g.ugryziony > idx) g.ugryziony--;
        }
        if (!g.osoby.length) g.gdzie = 'nie_zyja';
        const sp = this.st.sasiedzi!.spotkanie;
        if (sp) sp.oni = sp.oni.filter((id) => id !== p.id);
      }
  }

  /** Pionek lokatora: w trakcie spotkania stoi i patrzy na naszą osobę; potem w swoim mieszkaniu, a gdy w budynku nie
      ma już nikogo z zarządu (albo stał w drzwiach), znika. Spotkanie bez naszej osoby albo bez lokatorów się kończy. */
  private sasiadTick(p: Pawn): void {
    const st = this.st;
    const sp = st.sasiedzi?.spotkanie;
    if (sp?.oni.includes(p.id)) {
      if (st.tick % THINK_EVERY !== 0) return;
      const ours = sp.my
        .map((id) => st.pawns.find((q) => q.id === id))
        .filter((q) => q && q.job?.t === 'meet' && !this.graveyard.has(q.id));
      if (!ours.length || !sp.oni.some((id) => st.pawns.some((q) => q.id === id && !this.graveyard.has(q.id)))) {
        this.napisSasiada('przerwane', sp.b, { dom: sp.dom });
        this.koniecSpotkania(sp);
        return;
      }
      this.face(p, ours[0]!.x, ours[0]!.y);
      return;
    }
    if (p.pi < p.path.length) {
      this.walk(p);
      return;
    }
    if ((st.tick + p.id) % THINK_EVERY !== 0) return;
    const bid = this.w.bid[this.tileOf(p)];
    const nobody = !st.pawns.some((q) => q.kind === 'core' && !q.away && this.w.bid[this.tileOf(q)] === bid);
    if (!nobody) {
      p.wait = st.tick;
      return;
    }
    // pół godziny bez zarządu w budynku: wracają do liczb
    if (st.tick - p.wait < TICKS_PER_HOUR / 2) return;
    for (const b of st.sasiedzi?.budynki ?? []) {
      const dom = b.domy.findIndex((g) => g.pionki?.includes(p.id));
      if (dom < 0) continue;
      this.schowajLokatorow(st.sasiedzi!.budynki.indexOf(b), dom);
      return;
    }
    dropPawn(st, p);
  }

  /** Ile sztuk materiału jest w naszych stertach (bez stert we wnętrzach sąsiadów: tam łup nie jest jeszcze nasz). */
  private naszeSztuki(kind: string): number {
    let n = 0;
    for (const t of this.st.things) if (t.kind === kind && t.n > 0 && !this.uSasiada(t)) n += t.n;
    return n;
  }

  /** zabiera z naszych stert do n sztuk (od najstarszych); zwraca, ile wziął */
  private wezNasze(kind: string, n: number): number {
    let left = n;
    for (const t of this.st.things) {
      if (left <= 0) break;
      if (t.kind !== kind || t.n <= 0 || this.uSasiada(t)) continue;
      const k = Math.min(t.n, left);
      t.n -= k;
      left -= k;
    }
    this.st.things = this.st.things.filter((t) => !(t.kind === kind && t.n <= 0));
    return n - left;
  }

  /** rzecz leży we wnętrzu sąsiedniego budynku (nie nasza, dopóki ktoś jej nie przyniesie) */
  private uSasiada(t: Thing): boolean {
    return uSasiada(this.st, this.w, t.y * this.w.size + t.x);
  }

  /* przeszukanie i noszenie */

  /** przeszukać pomieszczenie sąsiada: puste mieszkanie, sala, hala, zaplecze; mieszkanie lokatorów tylko pod ich
      nieobecność (szaber), gdy drzwi są otwarte albo wyważone. `order` fałszywe: praca zarządu z automatu (Szaber,
      który mieszkań lokatorów nie rusza). false, gdy się nie zaczęło. */
  private startLoot(p: Pawn, bid: number, room: number, order = true): boolean {
    const s = this.st.sasiedzi;
    const k = s?.budynki.findIndex((b) => b.bid === bid) ?? -1;
    if (k < 0 || !s!.budynki[k].otwarty) return false;
    const g = gid(k, room);
    if (!this.moznaSzukac(k, room, !order)) return false;
    // polecenie na pokój, który ta osoba już przeszukuje sama: praca z polecenia (`podnies`)
    const robi = this.st.pawns.find((q) => q.job?.t === 'loot' && q.job.target === g);
    if (robi) return order && this.podnies(robi, p);
    const spot = this.pokojSpot(p, this.kafelkiPokoju(g));
    if (spot < 0 || !this.idz(p, spot, order, 'szaber')) return false;
    this.setJob(p, this.newJob('loot', g, spot, order), false);
    return true;
  }

  /** Wolny kafelek posadzki pokoju sąsiada najbliżej pionka, do którego ten dojdzie (bez mebli i cudzych miejsc
      pracy); gdy wszystkie zajęte, najbliższy osiągalny. −1: do pokoju nie ma drogi (na przykład zamknięte drzwi). */
  private pokojSpot(p: Pawn, tiles: readonly number[]): number {
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const size = this.w.size;
    const cand = tiles.filter(
      (i) => this.reg[i] === region && !taken.includes(i) && !this.furnitureAt(i % size, Math.floor(i / size)),
    );
    return this.nearest(p, cand.length ? cand : tiles.filter((i) => this.reg[i] === region));
  }

  /** pomieszczenie sąsiada da się przeszukać (raz; mieszkanie lokatorów tylko pod ich nieobecność); `tylkoPuste`:
      praca zarządu z automatu nie rusza mieszkań lokatorów, więc tylko wynik `'tak'` */
  private moznaSzukac(k: number, room: number, tylkoPuste = false): boolean {
    const m = moznaPrzeszukac(this.st, this.w, k, room);
    return tylkoPuste ? m === 'tak' : m !== null;
  }

  /** przeszukiwanie pokoju sąsiada: czas jak w siedzibie, łup na końcu, potem sam nosi łup na podwórko (noszenie
      z surowców, carryOn: w budynku sąsiada zbiera łup z całego budynku) */
  private lootPraca(p: Pawn, j: Job, at: boolean): boolean {
    const k = gidB(j.target);
    const room = gidRoom(j.target);
    // praca z automatu kończy się, gdy pokój przestał być pusty (lokatorzy wrócili albo wprowadził się ktoś nowy)
    if (!this.moznaSzukac(k, room, !j.order)) return false;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = this.st.tick;
      j.until = this.st.tick + searchTicks(this.kafelkiPokoju(j.target).length);
      return true;
    }
    if (this.st.tick < j.until) return true;
    this.lupPokoju(k, room, j.tile);
    return this.carryOn(p, j, j.tile);
  }

  /** łup z pomieszczenia sąsiada: puste mieszkanie z tabeli fali 1 (w trybie zombie z wymarcia więcej jedzenia),
      sala i reszta z tabeli rodzaju budynku, mieszkanie lokatorów pod ich nieobecność ich zapasy (w kuchni i pokoju);
      deterministycznie z ziarna świata, budynku i pomieszczenia. Książkę dają puste mieszkania i sale szkół
      (znajdzKsiazke, rzut z osobnego generatora z ziarna gry i gid(k + 1, pokój)). */
  private lupPokoju(k: number, room: number, at: number): void {
    const st = this.st;
    const b = st.sasiedzi!.budynki[k];
    const it = wnetrze(this.w, b.bid);
    const r = it.rooms[room];
    const B = this.w.buildings[b.bid];
    const mode = modeOf(st);
    const rnd = rngOfPlace(this.w.seed, b.bid, room, 0x100f);
    let loot: Partial<Record<Mat, number>> = {};
    // szansa na książkę: sala szkoły, puste mieszkanie; inne usługi i zapasy lokatorów książek nie dają
    let szansaKsiazki = 0;
    if (r.apt < 0) {
      loot = lupUslug(B.cls, r.kind, r.area, rnd);
      if (B.cls === 'szkola') szansaKsiazki = SZANSA_KSIAZKI.szkola;
      b.przeszukane.push(room);
      b.przeszukane.sort((x, y) => x - y);
    } else {
      const m = b.mieszkania.find((x) => x.apt === r.apt)!;
      if (m.stan === 'puste') {
        loot = lupMieszkania(m.why ?? 'wyjazd', r.kind, r.area, rnd, mode);
        szansaKsiazki = SZANSA_KSIAZKI.mieszkanie;
      } else {
        // szaber pod nieobecność lokatorów: ich zapasy, za pierwszym pomieszczeniem całe
        const g = b.domy[m.dom];
        loot = { ...g.zapasy };
        g.zapasy = {};
        g.rel = -100;
        g.zamiar = 'wrodzy';
        g.nastroj = 'gniew';
        for (const q of st.pawns)
          if (q.kind === 'core' && !q.away && !this.graveyard.has(q.id))
            this.addMood(q, 'Okradliśmy sąsiadów', -3, TICKS_PER_DAY);
      }
      m.przeszukane.push(room);
      m.przeszukane.sort((x, y) => x - y);
    }
    for (const [mat, n] of Object.entries(loot) as [Mat, number][])
      if (n > 0) this.zostawLup(at, mat, n, this.kafelkiPokoju(gid(k, room)));
    // klucz gid(k + 1, pokój) nie zbiega się z numerem pomieszczenia siedziby (searchDone)
    if (szansaKsiazki > 0) this.znajdzKsiazke(ksiazkaZ(st.seed, gid(k + 1, room), szansaKsiazki), at);
    this.wersjaSasiadow++;
  }

  /* etap 2: szabrownicy w budynku, nocni goście, piętra */

  /** nasza osoba weszła do budynku, w którym po nocy zostali szabrownicy: spotkanie w środku (nocą rzucają się od razu) */
  private naSzabrownikow(p: Pawn): boolean {
    const s = this.st.sasiedzi;
    if (!s || s.spotkanie || p.job?.t === 'meet') return false;
    const tile = this.tileOf(p);
    if (!this.inSasiad(tile)) return false;
    const k = gidB(this.nbRoom![tile]);
    const dom = s.budynki[k]?.domy.findIndex((g) => g.szabrownicy && g.gdzie === 'u_siebie' && !g.pionki) ?? -1;
    return dom >= 0 && this.zacznijSpotkanie(p, k, dom, 'mieszkanie', false);
  }

  /** do budynku da się wejść z ulicy: otwarte albo wyważone drzwi na zewnątrz, przed którymi jest ulica (nie nasze
      podwórko) */
  private zUlicy(b: SasiedniBudynek): boolean {
    return drzwiBudynku(this.w, b.bid).zewn.some(
      (d) => przechodnie(stanDrzwi(b, d.tile)?.s ?? 'zamkniete') && !this.insideAt(d.out),
    );
  }

  /** sterty materiału (łup) w budynku, od najstarszej */
  private stertyW(bid: number): Thing[] {
    const size = this.w.size;
    return this.st.things.filter((t) => LUP_MATS.has(t.kind) && t.n > 0 && this.w.bid[t.y * size + t.x] === bid);
  }

  /** Nocni goście o 2:00 w otwartych budynkach z wejściem od ulicy. Zwykły tryb: szabrownicy biorą do 10 sztuk ze stert
      i przeszukują do dwóch pomieszczeń (łup przepada), lokatorzy w domu się boją, a co trzeci raz szabrownicy zostają
      (i potem biorą co noc). Tryb zombie: wchodzą 1–2 szwendacze. Kto przychodzi, z ziarna świata, budynku i dnia. */
  private nocniGoscie(): void {
    const st = this.st;
    const s = st.sasiedzi!;
    const mode = modeOf(st);
    const day = dayOf(st.tick);
    const seed = this.w.seed;
    s.budynki.forEach((b, k) => {
      // za wspólnym płotem (etap 3) i bez wejścia od ulicy nikt nie wchodzi
      if (!b.otwarty || st.plot?.bids.includes(b.bid) || !this.zUlicy(b)) return;
      const piles = this.stertyW(b.bid);
      const squat = b.domy.find((g) => g.szabrownicy && g.gdzie === 'u_siebie');
      const kto = squat ? 'szabrownicy' : nocnyGosc(seed, b.bid, day, mode, piles.length > 0);
      if (!kto) return;
      if (kto === 'szwendacze') {
        const it = wnetrze(this.w, b.bid);
        const tiles = it.rooms.flatMap((r) => this.kafelkiPokoju(gid(k, r.id)));
        const r = rngOfPlace(seed, b.bid, day, 0x6a59);
        const n = r() < 0.5 ? 2 : 1;
        for (let i = 0; i < n && tiles.length && this.zombieCount() < MAX_ZOMBIES; i++)
          spawnZombie(st, this.w, tiles[Math.floor(r() * tiles.length)], Math.floor(r() * 16));
        b.noc = { tick: st.tick, kto, zabrali: {} };
        return;
      }
      // ze stert do NOC_BIORA sztuk, od najstarszej
      const zabrali: Partial<Record<Mat, number>> = {};
      let left = NOC_BIORA;
      for (const t of piles) {
        if (left <= 0) break;
        const n = Math.min(t.n, left);
        t.n -= n;
        left -= n;
        zabrali[t.kind as Mat] = (zabrali[t.kind as Mat] ?? 0) + n;
      }
      st.things = st.things.filter((t) => !(t.n <= 0 && LUP_MATS.has(t.kind)));
      // do NOC_POKOJE nieprzeszukanych pomieszczeń (sale i puste mieszkania): łup przepada
      const it = wnetrze(this.w, b.bid);
      let rooms = NOC_POKOJE;
      for (const r of it.rooms) {
        if (rooms <= 0) break;
        if (moznaPrzeszukac(st, this.w, k, r.id) !== 'tak') continue;
        if (r.apt < 0) b.przeszukane.push(r.id);
        else b.mieszkania.find((m) => m.apt === r.apt)?.przeszukane.push(r.id);
        rooms--;
      }
      b.przeszukane.sort((x, y) => x - y);
      for (const m of b.mieszkania) m.przeszukane.sort((x, y) => x - y);
      for (const g of b.domy)
        if (!g.szabrownicy && g.gdzie === 'u_siebie' && g.zamiar !== 'wrodzy') g.nastroj = 'strach';
      if (squat) {
        for (const [m, n] of Object.entries(zabrali) as [Mat, number][]) squat.zapasy[m] = (squat.zapasy[m] ?? 0) + n;
      } else if (zostaja(seed, b.bid, day)) {
        const names = new Set(st.people.map((q) => q.first));
        b.domy.push(szabrownicy(this.w, b.bid, day, names, zabrali));
      }
      b.noc = { tick: st.tick, kto, zabrali };
    });
  }

  /** o 7:00 napis o nocnych gościach (w ilu budynkach i co zniknęło), raz na noc */
  private ranoPoGosciach(): void {
    const s = this.st.sasiedzi!;
    const fresh: number[] = [];
    const ile: Partial<Record<Mat, number>> = {};
    let ludzie = false;
    s.budynki.forEach((b, k) => {
      if (!b.noc || b.noc.pokazane || this.st.tick - b.noc.tick > TICKS_PER_DAY) return;
      b.noc.pokazane = true;
      fresh.push(k);
      if (b.noc.kto === 'szabrownicy') ludzie = true;
      for (const [m, n] of Object.entries(b.noc.zabrali) as [Mat, number][]) ile[m] = (ile[m] ?? 0) + n;
    });
    if (fresh.length) this.napisSasiada(ludzie ? 'noc' : 'noc_zombie', fresh[0], { ile, ilu: fresh.length });
  }

  /** Przeszukać piętro otwartego budynku ze schodów (tile: kafelek schodów): osoba idzie na posadzkę przy schodach, na
      godzinę znika na górze i wraca z łupem; pięter jest tyle, ile pietraBudynku. */
  private startUpstairs(p: Pawn, bid: number, tile: number): void {
    const s = this.st.sasiedzi;
    const k = s?.budynki.findIndex((b) => b.bid === bid && b.otwarty) ?? -1;
    if (k < 0 || s!.budynki[k].pietra >= pietraBudynku(this.w, bid)) return;
    const it = wnetrze(this.w, bid);
    if (it.cell[tile] !== IN.STAIRS) return;
    const stand = this.przySchodach(p, it, tile);
    if (stand < 0 || !this.go(p, stand)) return;
    this.setJob(p, this.newJob('upstairs', k, stand, true), false);
  }

  /** posadzka przy ciągu schodów, do której osoba dojdzie, najbliżej niej (−1: żadnej) */
  private przySchodach(p: Pawn, it: Interior, tile: number): number {
    const size = this.w.size;
    const seen = new Set<number>([tile]);
    const q = [tile];
    const out: number[] = [];
    const region = this.regionOf(p);
    while (q.length) {
      const c = q.pop()!;
      const x = c % size;
      for (const n of [c - size, x < size - 1 ? c + 1 : -1, c + size, x > 0 ? c - 1 : -1]) {
        if (n < 0 || n >= size * size || seen.has(n)) continue;
        seen.add(n);
        if (it.cell[n] === IN.STAIRS) q.push(n);
        else if (it.cell[n] === IN.FLOOR && !this.coreBlocked[n] && this.reg[n] === region) out.push(n);
      }
    }
    return out.length ? this.nearest(p, out) : -1;
  }

  /** Piętro: dojście do schodów, godzina na górze (osoby nie widać), potem łup z pustych mieszkań piętra na posadzce
      przy schodach i noszenie na podwórko; na górze w zwykłym trybie mogą zastać ją lokatorzy (spotkanie), a w trybie
      zombie szwendacz (rana albo ugryzienie, z ziarna gry). */
  private pietroPraca(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const b = st.sasiedzi?.budynki[j.target];
    if (!b?.otwarty || b.pietra >= pietraBudynku(this.w, b.bid)) return false;
    if (j.phase === 0) {
      if (!at) return false;
      j.phase = 1;
      j.t0 = st.tick;
      j.until = st.tick + PIETRO_TICKS;
      return true;
    }
    if (st.tick < j.until) return true;
    const mode = modeOf(st);
    const nr = b.pietra;
    b.pietra++;
    const res = pietro(this.w, b.bid, nr, b.mieszkania.length, mode);
    const room = this.nbRoom?.[j.tile] ?? -1;
    for (const [m, n] of Object.entries(res.lup) as [Mat, number][])
      if (n > 0) this.zostawLup(j.tile, m, n, room >= 0 ? this.kafelkiPokoju(room) : []);
    this.wersjaSasiadow++;
    if (res.szwendacz) {
      // szwendacz na klatce wyżej: jak ugryzienie przy siatce, z ziarna gry
      if (nextRandom(st.rng) < BITE_HIT) {
        this.hurt(p, BITE_DMG, null);
        const bitten = !this.graveyard.has(p.id) && nextRandom(st.rng) < BITE_INFECT;
        if (bitten) infect(st, p, nextRandom(st.rng) < LIMB);
        this.napisSasiada(bitten ? 'pietro_ugryzienie' : 'pietro_szwendacz', j.target, { kto: p.id });
      } else this.napisSasiada('pietro', j.target, { kto: p.id, ile: res.lup });
    } else this.napisSasiada('pietro', j.target, { kto: p.id, ile: res.lup });
    if (this.graveyard.has(p.id)) return false;
    if (res.ludzie) {
      const B = this.w.buildings[b.bid];
      const size = this.w.size;
      const d2 = (t: number) =>
        ((t % size) - (j.tile % size)) ** 2 + (Math.floor(t / size) - Math.floor(j.tile / size)) ** 2;
      const klatka =
        B.entrances.length > 1 ? B.entrances.map((e, i) => [d2(e.tile), i]).sort((x, y) => x[0] - y[0])[0][1] : -1;
      b.domy.push(domWyzej(this.w, b.bid, nr, klatka, mode, new Set(st.people.map((q) => q.first))));
      if (this.zacznijSpotkanie(p, j.target, b.domy.length - 1, 'pietro', false)) return true;
    }
    return this.carryOn(p, j, j.tile);
  }

  /* etap 3: wspólny płot */

  /** Otoczyć budynek wspólnym płotem: plan z kosztem według wariantu z menu (deska i złom na metr nowego płotu albo
      2 sztuki jednego materiału, po 2 deski na drzwi do zabicia) i czasem (3 minuty na metr, 20 minut na drzwi), potem
      praca jak przy budowie. Jeden plan naraz; na planie tego samego budynku polecenie znaczy „budować dalej” (wariant
      zostaje z planu). Gdy się nie da, napis mówi dlaczego. */
  private startEnclose(p: Pawn, bid: number, wybor?: WariantPlotu): void {
    const st = this.st;
    const k = st.sasiedzi?.budynki.findIndex((b) => b.bid === bid) ?? -1;
    if (k < 0) return;
    const plan = st.plot?.plan;
    if (plan) {
      if (plan.bid === bid) this.startPlot(p);
      return;
    }
    const r = plotDla(st, this.w, bid);
    if (!r) return;
    if (!r.ok) {
      this.napisSasiada(`plot_${r.why}`, k, r.dlugosc ? { ilu: r.dlugosc } : {});
      return;
    }
    const stand = this.plotStand(r.usuniete, r.fence.yard);
    if (stand < 0) return;
    // wariant z polecenia (także z sieci): nieznany to deska i złom
    const wariant = wybor && WARIANTY_PLOTU.includes(wybor) ? wybor : 'mieszany';
    const { need, total } = kosztPlotu(r, wariant);
    st.plot ??= { bids: [] };
    st.plot.plan = { bid, need, have: {}, work: 0, total, by: -1, stand, wariant };
    this.wersjaSasiadow++;
    this.startPlot(p);
  }

  /** skąd się stawia: kafelek starego podwórka przy siatce, która zniknie (przejście do korytarza), a bez takiego
      (budynek przy podwórku) pierwszy wolny kafelek nowego podwórka */
  private plotStand(usuniete: readonly number[], yard: readonly number[]): number {
    const size = this.w.size;
    const old = this.yardMask;
    for (const t of usuniete)
      for (const n of [t - size, t + 1, t + size, t - 1])
        if (n >= 0 && n < size * size && old[n] && !this.coreBlocked[n]) return n;
    return yard.find((i) => old[i] && !this.coreBlocked[i]) ?? -1;
  }

  /** zająć się planem płotu: z materiałami od razu do pracy, inaczej po pierwszy brakujący materiał. Z polecenia
      (`order`) i przy pierwszym planie z menu; bez polecenia woła to rodzaj Budowa (`znajdzPrace`), żeby wolny zarząd
      dokończył plan, który ktoś zaczął i porzucił (od pierwszego rana, za dnia, bez pilnej potrzeby). Wtedy
      obowiązują te same reguły co przy budowie planów: nie przy szwendaczu w trybie zombie i materiał tylko z miejsc
      dozwolonych bez polecenia. Plan ma jednego wykonawcę naraz. */
  private startPlot(p: Pawn, order = true): boolean {
    const plan = this.st.plot?.plan;
    if (!plan) return false;
    const holder = plan.by >= 0 && plan.by !== p.id ? this.st.pawns.find((q) => q.id === plan.by) : undefined;
    if (holder?.job?.t === 'plot') return false;
    if (!order && (this.zagrozone(plan.stand) || !this.dojdzieWDomu(p, plan.stand))) return false;
    const j = this.newJob('plot', plan.bid, this.tileOf(p), order);
    if (this.ready({ need: plan.need, have: plan.have } as BuildPlan)) {
      if (!this.idz(p, plan.stand, order)) return false;
      this.setJob(p, j, false);
      j.phase = 2;
      j.tile = plan.stand;
      plan.by = p.id;
      return true;
    }
    this.setJob(p, j, false);
    if (!this.fetchNext(p, j, plan.need, plan.have)) {
      p.job = null;
      return false;
    }
    plan.by = p.id;
    return true;
  }

  /** Płot: kursy po deski i złom (faza 0 i 1), potem praca przy przejściu (faza 2); po skończonej pracy nowa siatka
      od następnego kroku (polecenie otocz w kolejce). */
  private plotPraca(p: Pawn, j: Job, at: boolean): boolean {
    const st = this.st;
    const plan = st.plot?.plan;
    if (!plan || plan.bid !== j.target) return false;
    plan.by = p.id;
    if (j.phase === 0) {
      if (!at) return false;
      const m = j.what as Mat;
      return this.takeFor(p, j, (plan.need[m] ?? 0) - (plan.have[m] ?? 0), plan.stand);
    }
    if (j.phase === 1) {
      if (!at) return false;
      const m = j.what as Mat;
      plan.have[m] = (plan.have[m] ?? 0) + j.n;
      j.n = 0;
      j.what = '';
      if (this.fetchNext(p, j, plan.need, plan.have)) return true;
      if (!this.ready({ need: plan.need, have: plan.have } as BuildPlan)) return false;
      j.phase = 2;
      j.t0 = st.tick;
      return true;
    }
    if (!at) return false;
    plan.work += tempoPracy(st, p, 'budowa');
    if ((st.tick - j.t0) % NOISE_TICKS === 0) this.addNoise(p.x, p.y, HALAS.deski);
    if (plan.work < plan.total) return true;
    if (!st.cmds.some((c) => c.t === 'otocz')) st.cmds.push({ t: 'otocz', ids: [], bid: plan.bid });
    return false;
  }

  /** Wspólny płot stoi: siatka od nowa według kształtu (liczonego jeszcze raz, teraz), wytrzymałość starych kafelków
      zostaje, nowe mają świeżą łatę, dziury, przez które przeszło podwórko, znikają, drzwi na obwodzie zabite. */
  private otocz(bid: number): void {
    const st = this.st;
    const plan = st.plot?.plan;
    if (!plan || plan.bid !== bid) return;
    delete st.plot!.plan;
    const k = st.sasiedzi?.budynki.findIndex((b) => b.bid === bid) ?? -1;
    const r = plotDla(st, this.w, bid);
    if (!r?.ok || k < 0) {
      if (k >= 0) this.napisSasiada('plot_brak', k);
      return;
    }
    const stara = this.w.fence;
    const f = st.fence!;
    const hp = new Map(stara.tiles.map((t, i) => [t, f.hp[i]]));
    // nowy płot z desek i złomu w trybie zombie jest tak mocny jak wzmocniona siatka na starcie, w zwykłym jak świeża łata
    const fresh = modeOf(st) === 'zombie' ? REINFORCED_HP : PATCH_HP;
    f.hp = r.fence.tiles.map((t) => hp.get(t) ?? fresh);
    const on = new Set(r.fence.tiles);
    f.holes = f.holes.map((h) => ({ ...h, tiles: h.tiles.filter((t) => on.has(t)) })).filter((h) => h.tiles.length);
    const b = st.sasiedzi!.budynki[k];
    for (const t of r.zabic) {
      const d = stanDrzwi(b, t);
      if (d) {
        d.s = 'zabite';
        delete d.k;
      }
    }
    st.plot!.bids.push(bid);
    st.plot!.ksztalt = { tiles: r.fence.tiles, hole: r.fence.hole, yard: r.fence.yard };
    ustawSiatke(this.w, st.plot!.ksztalt);
    this.przeliczSiatke();
    this.rebuild();
    this.wersjaSasiadow++;
    this.napisSasiada('plot_gotowy', k, { ilu: r.dlugosc });
  }

  hash(): string {
    return hashString(JSON.stringify(this.st));
  }
}
