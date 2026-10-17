/* Wnętrze siedziby widziane przez symulację i ciepło w pomieszczeniach.
   Wnętrze generuje świat (src/world/interior.ts, kontrakt z M1). Tu jest tylko jego kształt strukturalny
   z tymi samymi nazwami pól, żeby symulacja nie zależała od generatora. Wnętrze wynika ze świata i ziarna,
   więc nie trafia do zapisu gry; temperatury pomieszczeń są w stanie (SimState.temps). */

import type { World } from '../world/world.ts';
import { TICKS_PER_HOUR } from './clock.ts';

export type RoomKind = 'klatka' | 'przedpokoj' | 'pokoj' | 'kuchnia' | 'lazienka';

export interface RoomLike {
  /** równe indeksowi w rooms */
  id: number;
  kind: RoomKind;
  /** numer mieszkania, −1 dla klatki */
  apt: number;
}

export interface FurnitureLike {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** ściana, przy której mebel stoi: 0 góra, 1 prawo, 2 dół, 3 lewo */
  rot: number;
}

export interface PropLike {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Interior z src/world/interior.ts. Tablice mają rozmiar size × size. */
export interface HouseLike {
  building: number;
  /** kody komórek (IN); symulacja ich nie czyta, przechodniość bierze z World.blocked */
  cell: Uint8Array;
  /** numer pomieszczenia albo −1 */
  room: Int16Array;
  rooms: RoomLike[];
  doors: number[];
  windows: number[];
  furniture: FurnitureLike[];
  /** kafelki składu drewna obok kozy */
  sklad: number[];
  /** numer mieszkania zarządu */
  home: number;
}

type WithHouse = World & { interior?: HouseLike | null; dryTree?: number; props?: PropLike[] };

/** wnętrze siedziby albo null, gdy świat go nie ma (wtedy symulacja działa jak przed M1) */
export const houseOf = (w: World): HouseLike | null => (w as WithHouse).interior ?? null;

/** suche drzewo z samouczka (indeks w w.trees) albo −1 */
export function dryTreeOf(w: World): number {
  const k = (w as WithHouse).dryTree;
  return k !== undefined && k >= 0 && k < w.trees.length ? k : -1;
}

/** kafelek w mieszkaniu zarządu */
export function inHomeApt(h: HouseLike, i: number): boolean {
  const r = h.room[i];
  return r >= 0 && h.rooms[r].apt === h.home;
}

/** kafelki mieszkania zarządu (1): jego pomieszczenia i drzwi, które do nich prowadzą */
export function homeMask(h: HouseLike, size: number): Uint8Array {
  const N = size * size;
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (inHomeApt(h, i)) m[i] = 1;
  for (const d of h.doors) {
    const x = d % size;
    for (const n of [x > 0 ? d - 1 : -1, x < size - 1 ? d + 1 : -1, d - size, d + size])
      if (n >= 0 && n < N && inHomeApt(h, n)) m[d] = 1;
  }
  return m;
}

/** pary pomieszczeń połączonych drzwiami, każda raz */
export function roomLinks(h: HouseLike, size: number): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<number>();
  for (const d of h.doors) {
    const x = d % size;
    const ids: number[] = [];
    for (const n of [d, x > 0 ? d - 1 : -1, x < size - 1 ? d + 1 : -1, d - size, d + size]) {
      if (n < 0 || n >= size * size) continue;
      const r = h.room[n];
      if (r >= 0 && !ids.includes(r)) ids.push(r);
    }
    ids.sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const key = ids[i] * 65536 + ids[j];
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([ids[i], ids[j]]);
      }
  }
  return out;
}

/** temperatura w mieszkaniach na starcie */
export const START_TEMP = 9;
/** do tej temperatury koza dogrzewa swoje pomieszczenie (przy cieple nikt nie przepala) */
export const KOZA_TARGET = 21;
/** o tyle najwyżej koza ociepla pomieszczenie ponad pogodę: w mrozie do 21°C nie dojdzie */
export const KOZA_MAX = 16;
/** co tyle ticków liczy się ciepło i potrzeby (półtorej minuty gry, sekunda realna przy 1×) */
export const HEAT_EVERY = 20;
/** izolacja: o tyle stopni pomieszczenie bez ogrzewania jest cieplejsze niż na zewnątrz */
export const INSUL: Record<RoomKind, number> = { klatka: 0, przedpokoj: 2, pokoj: 2, kuchnia: 2, lazienka: 2 };
/** ułamek różnicy do celu na krok: przy ogniu stała czasowa 1,25 h (zimna kuchnia ma 18°C po około
    1,7 h gry, czyli 70 s przy 1×), bez ognia 10 h, bo beton trzyma temperaturę;
    stałe zamiast Math.exp, żeby wynik nie zależał od przeglądarki */
const F_FIRE = 0.0198; // 1 − e^(−0,025 h / 1,25 h)
const F_DRIFT = 0.0025; // 1 − e^(−0,025 h / 10 h)
/** od takiego ocieplenia pomieszczenie zmienia temperaturę w tempie ognia */
const FULL_BOOST = 4;
/** mniejszego ocieplenia nie przenosimy dalej przez drzwi */
const MIN_BOOST = 0.25;

if (HEAT_EVERY * 40 !== TICKS_PER_HOUR)
  throw new Error('stałe F_FIRE i F_DRIFT liczone dla 40 kroków ciepła na godzinę');

/** Ocieplenie pomieszczeń od kóz w °C ponad pogodę. Paląca się koza dogrzewa swoje pomieszczenie
    do KOZA_TARGET (najwyżej o KOZA_MAX), a przez każde drzwi przechodzi połowa ocieplenia.
    fires: pomieszczenia z palącą się kozą. */
export function heatBoost(
  kinds: readonly RoomKind[],
  links: readonly (readonly [number, number])[],
  fires: readonly number[],
  tout: number,
): number[] {
  const boost = new Array<number>(kinds.length).fill(0);
  for (const r of fires)
    boost[r] = Math.max(boost[r], Math.min(KOZA_MAX, Math.max(0, KOZA_TARGET - tout - INSUL[kinds[r]])));
  // połowa przez drzwi; wygrywa największe ocieplenie, więc relaksacja aż do ustalenia
  for (let changed = fires.length > 0; changed; ) {
    changed = false;
    for (const [a, b] of links) {
      if (boost[a] / 2 >= MIN_BOOST && boost[a] / 2 > boost[b] + 1e-9) {
        boost[b] = boost[a] / 2;
        changed = true;
      }
      if (boost[b] / 2 >= MIN_BOOST && boost[b] / 2 > boost[a] + 1e-9) {
        boost[a] = boost[b] / 2;
        changed = true;
      }
    }
  }
  return boost;
}

/** Jeden krok ciepła (HEAT_EVERY ticków). Pomieszczenie dąży do temperatury z zewnątrz z izolacją
    plus ocieplenie od kóz (heatBoost). Ogień grzeje szybko, bez niego temperatura zmienia się powoli.
    Zwraca ocieplenie pomieszczeń. */
export function heatStep(
  temps: number[],
  kinds: readonly RoomKind[],
  links: readonly (readonly [number, number])[],
  fires: readonly number[],
  tout: number,
): number[] {
  const boost = heatBoost(kinds, links, fires, tout);
  for (let r = 0; r < temps.length; r++) {
    const base = tout + INSUL[kinds[r]];
    const f = F_DRIFT + (F_FIRE - F_DRIFT) * Math.min(1, boost[r] / FULL_BOOST);
    temps[r] += (base + boost[r] - temps[r]) * f;
  }
  return boost;
}
