/* Symulacja (M1): pionki rdzenia z poleceniami i własną pracą, tłum z prostym planem, rzeczy (meble, drewno,
   koza, jedzenie, pnie), ciepło w pomieszczeniach, potrzeby i samouczek. Stały krok, ziarno i kolejka poleceń
   w stanie. Stan to zwykły obiekt (JSON), rysowanie tylko go czyta. Ten sam świat, ziarno i polecenia dają ten sam
   stan. Bez wnętrza siedziby (świat sprzed M1) zarząd stoi, a rzeczy, ciepła i samouczka nie ma. */

import { PROFS } from '../content/data.ts';
import { makePerson, type Person } from '../content/people.ts';
import { hashString, nextRandom, pick, type RngState, rngOf } from '../core/rng.ts';
import type { Tree, World } from '../world/world.ts';
import { daylight, hourOf, outdoorTemp, TICKS_PER_HOUR, TICKS_PER_SECOND } from './clock.ts';
import {
  dryTreeOf,
  HEAT_EVERY,
  type HouseLike,
  heatBoost,
  heatStep,
  homeMask,
  houseOf,
  inHomeApt,
  type RoomKind,
  roomLight,
  roomLinks,
  START_TEMP,
} from './house.ts';
import { COLD, HUNGRY, type NeedCtx, type Needs, startNeeds, stepNeeds, TIRED, WARMED } from './needs.ts';
import { labelRegions, nearestFree, nearestInRegion, PathFinder } from './path.ts';
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
/** posiłek trwa pół godziny gry i daje tyle najedzenia */
export const EAT_TICKS = TICKS_PER_HOUR / 2;
export const MEAL = 45;
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
/** bezczynny rdzeń rozgląda się za pracą co sekundę realną */
const THINK_EVERY = TICKS_PER_SECOND;
/** po poleceniu „idź tu” czeka na miejscu godzinę gry, chyba że coś pilnego */
const STAY_AFTER_ORDER = TICKS_PER_HOUR;
/** grzeje się najwyżej godzinę gry naraz, potem rozgląda się od nowa (może jest głodny) */
const WARM_MAX = TICKS_PER_HOUR;
/** z tej odległości od kozy (m) człowiek się przy niej grzeje */
const FIRE_REACH = 2.5;

export type Facing = 0 | 1 | 2 | 3; // dół, góra, lewo, prawo

export type JobKind = 'go' | 'chop' | 'haul' | 'refuel' | 'warm' | 'eat' | 'sleep' | 'burn';

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
  /** cel: numer drzewa (chop), id rzeczy (haul: stos drewna, refuel i warm: koza, eat: stół, sleep: łóżko,
      burn: mebel),
      −1, gdy celu nie ma (haul z drewnem w rękach, eat bez stołu, sleep na podłodze), kafelek (go) */
  target: number;
  /** kafelek, na który idzie albo na którym pracuje */
  tile: number;
  /** 0: idzie do celu; 1: pracuje albo czeka (chop, warm, eat, sleep, go) lub niesie drewno (haul, refuel) */
  phase: number;
  /** stos, z którego bierze drewno do kozy (refuel), −1: niesie własne */
  from: number;
  /** tick początku i końca pracy (chop, eat, warm, go z polecenia) */
  t0: number;
  until: number;
  /** z polecenia gracza „idź tu”: po dojściu czeka na miejscu godzinę gry (pomocnicy wysłani razem
      z drwalem albo do kozy mają false i od razu biorą się do własnej pracy) */
  order: boolean;
}

export interface Pawn {
  id: number;
  kind: 'core' | 'crowd';
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
  /** chwilowe nastroje (tylko rdzeń) */
  moods: Mood[];
  /** sztuki drewna w rękach */
  carry: number;
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
  /** sztuki: drewno w stosie, porcje jedzenia */
  n: number;
  /** koza: ticki ognia, które zostały (0: zimna) */
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
  | { t: 'chop'; ids: number[]; tree: number }
  | { t: 'haul'; ids: number[]; thing: number }
  | { t: 'refuel'; ids: number[]; thing: number }
  /** rozbić mebel na opał (interfejs pyta wcześniej o potwierdzenie) */
  | { t: 'burn'; ids: number[]; thing: number };

export interface SimState {
  v: 2;
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

/** rzeczy, które leżą luzem; reszta to meble */
const LOOSE = new Set(['drewno', 'jedzenie', 'pien']);
const BEDS = new Set(['lozko', 'wersalka']);

/** drewno ze ściętego drzewa: 3 sztuki na metr korony, z krzaka mało */
export const woodFrom = (t: Tree): number =>
  t.kind === 2 ? Math.max(1, Math.round(t.r * 1.5)) : Math.max(2, Math.round(t.r * 3));
/** rąbanie trwa od kilkunastu do trzydziestu kilku sekund realnych przy 1× */
export const chopTicks = (t: Tree): number => Math.round(160 + 120 * t.r);

export interface SimOpts {
  core?: number;
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
    v: 2,
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
  };
}

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

/** Sim trzyma poza stanem tylko to, co da się odtworzyć ze świata i stanu: bufor A*, przechodniość
    z wyciętymi drzewami, regiony, połączenia pomieszczeń. */
export class Sim {
  readonly w: World;
  st: SimState;
  stats: SimStats = { paths: 0, failed: 0, nodes: 0, substituted: 0 };
  /** wnętrze siedziby albo null (świat sprzed M1) */
  readonly house: HouseLike | null;
  /** przechodniość świata z wyciętymi ściętymi drzewami; przy wczytaniu odtwarzana ze st.felled */
  readonly blocked: Uint8Array;
  /** ocieplenie pomieszczeń od kóz w °C; liczone co krok ciepła i od razu przy wczytaniu */
  boost: number[] = [];
  /** światło z palących się kóz w pomieszczeniach, 0–1 (dla rysowania: świecące okna nocą) */
  light: number[] = [];
  private pf: PathFinder;
  /** spójne obszary mapy: cel z innego obszaru zamieniamy na najbliższy osiągalny kafelek */
  private reg: Int32Array;
  /** przechodniość i obszary dla tłumu: mieszkanie zarządu zamknięte (bez wnętrza to te same tablice) */
  private crowdBlocked: Uint8Array;
  private crowdReg: Int32Array;
  private readonly trunk: Int32Array;
  private readonly links: [number, number][];
  private readonly kinds: RoomKind[];
  /** przechodnie kafelki każdego pomieszczenia */
  private readonly roomTiles: number[][];
  /** pomieszczenie pod nogami: jak interior.room, ale drzwi należą do sąsiedniego pomieszczenia */
  private readonly roomOf: Int16Array;
  private readonly dry: number;

  constructor(w: World, st: SimState) {
    this.w = w;
    this.st = st;
    this.pf = new PathFinder(w.size);
    this.house = houseOf(w);
    this.blocked = w.blocked.slice();
    this.trunk = Int32Array.from(w.trees, (t) => trunkOf(w, t));
    for (const k of st.felled) this.blocked[this.trunk[k]] = 0;
    this.reg = labelRegions(this.blocked, w.size);
    const h = this.house;
    this.crowdBlocked = this.blocked;
    this.crowdReg = this.reg;
    if (h) {
      const mask = homeMask(h, w.size);
      this.crowdBlocked = this.blocked.slice();
      for (let i = 0; i < mask.length; i++) if (mask[i]) this.crowdBlocked[i] = 1;
      this.crowdReg = labelRegions(this.crowdBlocked, w.size);
    }
    this.links = h ? roomLinks(h, w.size) : [];
    this.kinds = h ? h.rooms.map((r) => r.kind) : [];
    this.roomTiles = h ? h.rooms.map(() => []) : [];
    if (h)
      for (let i = 0; i < w.size * w.size; i++) {
        const r = h.room[i];
        if (r >= 0 && !this.blocked[i]) this.roomTiles[r].push(i);
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

  /** cel do wyznaczenia drogi: wolny kafelek w tym samym obszarze co pionek, −1 gdy go nie ma */
  private goalFor(p: Pawn, goal: number): number {
    const size = this.w.size;
    const blocked = p.kind === 'crowd' ? this.crowdBlocked : this.blocked;
    const reg = p.kind === 'crowd' ? this.crowdReg : this.reg;
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
    const blocked = p.kind === 'crowd' ? this.crowdBlocked : this.blocked;
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
    let budget = PATHS_PER_TICK;
    for (const p of st.pawns) {
      if (p.pi < p.path.length) {
        this.walk(p);
        continue;
      }
      if (p.kind === 'core') {
        this.coreTick(p);
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
    // polecenia przyjmuje tylko zarząd, tłum to tło
    const pawns: Pawn[] = [];
    for (const id of c.ids) {
      const p = st.pawns.find((q) => q.id === id);
      if (p && p.kind === 'core' && !pawns.includes(p)) pawns.push(p);
    }
    if (!pawns.length) return;
    this.tutEvent('zaznacz');
    if (c.t === 'move') this.orderMove(pawns, c.to, [], true);
    else if (c.t === 'chop') this.orderChop(pawns, c.tree);
    else if (c.t === 'haul') this.orderHaul(pawns, c.thing);
    else if (c.t === 'refuel') this.orderRefuel(pawns, c.thing);
    else if (c.t === 'burn') this.orderBurn(pawns, c.thing);
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
    if (koza?.kind !== 'koza') return;
    const [first, ...rest] = pawns;
    const taken: number[] = [];
    if (this.startRefuel(first, true, koza)) taken.push(first.job!.tile);
    else rest.unshift(first);
    if (rest.length) this.orderMove(rest, koza.y * this.w.size + koza.x, taken, false);
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
    return { t, target, tile, phase, from: -1, t0: this.st.tick, until: 0, order };
  }

  /** zwalnia rzeczy zajęte przez pionek */
  private release(p: Pawn): void {
    for (const t of this.st.things) if (t.by === p.id) t.by = -1;
  }

  /** nowa praca zamiast starej; drewno z rąk zostaje na ziemi, chyba że nowa praca go potrzebuje */
  private setJob(p: Pawn, j: Job, keepCarry: boolean): void {
    this.release(p);
    if (!keepCarry) this.dropCarry(p);
    p.job = j;
  }

  /** koniec pracy: rzeczy wolne, od razu rozgląda się za następną */
  private done(p: Pawn): void {
    this.release(p);
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
    return this.reg[nearestFree(this.blocked, this.w.size, this.tileOf(p))];
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
        if (!this.blocked[i] && this.reg[i] === region && !taken.includes(i)) cand.push(i);
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
      if (this.blocked[i] || this.reg[i] !== region) continue;
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

  /** wolny kafelek przy rzeczy (mebel stoi na przechodnim kafelku, ale pracuje się obok), osiągalny dla pionka */
  private beside(p: Pawn, t: Thing): number {
    const size = this.w.size;
    const region = this.regionOf(p);
    const taken = this.taken(p);
    const cand: number[] = [];
    for (let y = t.y - 1; y <= t.y + t.h; y++)
      for (let x = t.x - 1; x <= t.x + t.w; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size || covers(t, x, y)) continue;
        const i = y * size + x;
        if (this.blocked[i] || this.reg[i] !== region || this.furnitureAt(x, y) || taken.includes(i)) continue;
        cand.push(i);
      }
    return this.nearest(p, cand);
  }

  /** najbliższy kafelkowi wolny kafelek w tym samym obszarze, bez mebli, pnia i jedzenia: na stos, na który
      się jeszcze zmieści, albo na pusty */
  private spotNear(from: number, n: number): number {
    const size = this.w.size;
    const at = nearestFree(this.blocked, size, from);
    const ax = at % size;
    const ay = Math.floor(at / size);
    for (const [dx, dy] of SPREAD) {
      const x = ax + dx;
      const y = ay + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (this.blocked[i] || this.reg[i] !== this.reg[at]) continue;
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
      if (t.kind !== 'drewno' || t.n <= 0 || t.by >= 0) continue;
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

  /** kafelek, z którego się dokłada do kozy: najchętniej ten przed nią (kontrakt wnętrza trzyma go wolnym,
      to strona przeciwna do ściany z oknem, rot), a gdy zajęty, najbliższy wolny obok (skład też się nadaje) */
  private kozaStand(p: Pawn, koza: Thing): number {
    const h = this.house!;
    const size = this.w.size;
    const room = h.room[koza.y * size + koza.x];
    const taken = this.taken(p);
    const cand: number[] = [];
    for (let y = koza.y - 1; y <= koza.y + koza.h; y++)
      for (let x = koza.x - 1; x <= koza.x + koza.w; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size || covers(koza, x, y)) continue;
        const i = y * size + x;
        if (h.room[i] !== room || this.blocked[i] || this.furnitureAt(x, y) || taken.includes(i)) continue;
        cand.push(i);
      }
    const cx = koza.x + (koza.w >> 1);
    const cy = koza.y + (koza.h >> 1);
    const front = [
      (koza.y + koza.h) * size + cx,
      cy * size + koza.x - 1,
      (koza.y - 1) * size + cx,
      cy * size + koza.x + koza.w,
    ][koza.rot];
    return cand.includes(front) ? front : this.nearest(p, cand);
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

  /** ile sztuk drewna jeszcze wejdzie do kozy */
  private kozaRoom(koza: Thing): number {
    return Math.floor((KOZA_CAP * BURN_TICKS - koza.fuel) / BURN_TICKS);
  }

  /** drzewo pada: zostaje pień, kafelek się zwalnia, drewno leży w stosach dookoła, po tej stronie,
      z której rąbał drwal (stand), żeby dało się do niego dojść */
  private fell(k: number, stand: number): void {
    const st = this.st;
    const size = this.w.size;
    const t = this.trunk[k];
    st.felled.push(k);
    st.felled.sort((a, b) => a - b);
    this.blocked[t] = 0;
    this.reg = labelRegions(this.blocked, size);
    if (this.crowdBlocked !== this.blocked) {
      this.crowdBlocked[t] = 0;
      this.crowdReg = labelRegions(this.crowdBlocked, size);
    } else this.crowdReg = this.reg;
    st.things.push(newThing(st, 'pien', t % size, Math.floor(t / size)));
    let left = woodFrom(this.w.trees[k]);
    for (const [dx, dy] of SPREAD) {
      if (left <= 0) break;
      const x = (t % size) + dx;
      const y = Math.floor(t / size) + dy;
      if ((!dx && !dy) || x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (this.blocked[i] || this.reg[i] !== this.reg[stand] || this.thingAt(x, y)) continue;
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
          const food = this.food();
          if (food) {
            food.n--;
            if (food.n <= 0) st.things.splice(st.things.indexOf(food), 1);
            p.needs!.food = Math.min(100, p.needs!.food + MEAL);
          }
          return false;
        }
        if (!at || !this.food()) return false;
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
    for (const q of st.pawns)
      if (q.needs)
        this.addMood(
          q,
          mine ? 'Palimy meble' : 'Rozbieramy cudze mieszkanie',
          mine ? -6 : -10,
          (mine ? 12 : 24) * TICKS_PER_HOUR,
        );
    const owner = st.pawns.find((q) => q.id === f.owner);
    if (owner?.needs) this.addMood(owner, `Spalili ${MINE[f.kind] ?? 'moją rzecz'}`, -18, 48 * TICKS_PER_HOUR);
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
      if (this.blocked[i]) continue;
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
    const n = p.needs!;
    if (p.carry > 0) {
      if (this.startRefuel(p, false) || this.startHaul(p)) return;
      this.dropCarry(p);
    }
    if (((this.night() && n.rest < 80) || n.rest < TIRED) && this.startSleep(p)) return;
    if (n.food < HUNGRY && this.startEat(p)) return;
    if (this.startRefuel(p, false) || this.startHaul(p)) return;
    if (n.warm < COLD && this.startWarm(p)) return;
    p.wait = this.st.tick + THINK_EVERY;
  }

  private startSleep(p: Pawn): boolean {
    const h = this.house!;
    const size = this.w.size;
    const taken = this.taken(p);
    // najpierw własne łóżko, potem niczyje, na końcu cudze
    let bed: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of this.st.things) {
      const i = t.y * size + t.x;
      if (!BEDS.has(t.kind) || !inHomeApt(h, i) || this.blocked[i] || taken.includes(i)) continue;
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
          if (h.home >= 0 && r.apt === h.home && (!pokoj || r.kind === 'pokoj'))
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

  private startEat(p: Pawn): boolean {
    const h = this.house!;
    const size = this.w.size;
    const food = this.food();
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
          if (covers(tb, x, y) || h.room[i] !== room || this.blocked[i] || this.furnitureAt(x, y)) continue;
          seats.push(i);
        }
    } else seats.push(fi);
    const seat = this.nearest(
      p,
      seats.filter((i) => !taken.includes(i)),
    );
    if (seat < 0 || !this.go(p, seat)) return false;
    this.setJob(p, this.newJob('eat', table ? table.id : -1, seat, false), false);
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

  /* ---------- co krok ciepła: ogień, ciepło, potrzeby, samouczek ---------- */

  private slow(): void {
    if (!this.house) return;
    const st = this.st;
    const tout = this.outdoor();
    // pali się to, co paliło się na początku kroku
    const fires = this.fires();
    for (const t of st.things) if (t.kind === 'koza' && t.fuel > 0) t.fuel = Math.max(0, t.fuel - HEAT_EVERY);
    this.boost = heatStep(st.temps, this.kinds, this.links, fires, tout);
    this.light = roomLight(this.kinds.length, this.links, fires);
    const hours = HEAT_EVERY / TICKS_PER_HOUR;
    for (const p of st.pawns) {
      if (!p.needs) continue;
      // chwilowe nastroje wygasają, reszta dodaje się do nastroju z potrzeb
      if (p.moods.length) p.moods = p.moods.filter((m) => m.until > st.tick);
      const bonus = p.moods.reduce((a, m) => a + m.d, 0);
      stepNeeds(p.needs, this.needCtx(p, tout), hours, bonus);
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

  private needCtx(p: Pawn, tout: number): NeedCtx {
    const h = this.house!;
    const size = this.w.size;
    const r = this.roomOf[this.tileOf(p)];
    let fire = false;
    for (const t of this.st.things)
      if (
        t.kind === 'koza' &&
        t.fuel > 0 &&
        h.room[t.y * size + t.x] === r &&
        Math.hypot(p.x - (t.x + t.w / 2), p.y - (t.y + t.h / 2)) <= FIRE_REACH + 0.5
      )
        fire = true;
    const j = p.job;
    const inside = r >= 0;
    // ciemno: noc, a w pomieszczeniu nie świeci koza ani przez drzwi
    const dark = daylight(this.st.tick) < 0.5 && !(inside && (this.light[r] ?? 0) >= 0.5) && !fire;
    let company = 0;
    for (const q of this.st.pawns) if (q !== p && Math.hypot(q.x - p.x, q.y - p.y) <= 4) company++;
    return {
      temp: inside ? this.st.temps[r] : tout,
      fire: fire && inside,
      asleep: !!j && j.t === 'sleep' && j.phase === 1,
      busy: (!!j && j.t === 'chop' && j.phase === 1) || p.carry > 0,
      dark,
      inside,
      company,
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
      if (s === 'sklad') return lit || st.things.some((t) => t.kind === 'drewno' && h.sklad.includes(t.y * size + t.x));
      if (s === 'koza') return lit;
      if (s === 'cieplo') return kr >= 0 && st.temps[kr] >= WARM_ENOUGH;
      return false;
    });
  }

  hash(): string {
    return hashString(JSON.stringify(this.st));
  }
}
