/* Przekrój budynku: wnętrze zamiast dachu przy zbliżeniu. Wnętrze z kontraktu (src/world/interior.ts)
   zamieniane na opis kafelka InteriorTile dla grafiki zastępczej (art/wnetrze.ts) według wskazówek
   z jej nagłówka: ściana zewnętrzna na brzegu obrysu z bokami na zewnątrz, okno z listy okien ze
   stroną ulicy i pomieszczeniem za nim, drzwi frontowe z wejść budynku, schody w głąb od posadzki
   klatki. Rzeczy (meble, trzepak, później rzeczy z symulacji) zamieniane na opis sprite'a
   thingSprite (art/rzeczy.ts). Czyste funkcje bez DOM: działają w Node, w oknie i w workerze. */

import type { AptState, AptWhy, Damage, DamageKind } from '../world/apts.ts';
import { IN, type RoomKind } from '../world/interior.ts';
import type { Dir, World } from '../world/world.ts';
import { BUILD_KINDS, FIRE_FRAMES, type ThingSpec } from './art/rzeczy.ts';
import { type InteriorTile, maskOf, NB } from './art/wnetrze.ts';

export { IN };

/**
 * Rzecz do narysowania: meble z wnętrza, trzepak, później rzeczy z symulacji (jej Thing pasuje
 * bez zmian). spec podaje gotowy opis sprite'a, gdy nie wynika z pozostałych pól (np. siatka).
 */
export interface ThingLike {
  kind: string;
  /** lewy górny kafelek i wymiary po obrocie */
  x: number;
  y: number;
  w: number;
  h: number;
  /** ściana, przy której stoi: 0 góra, 1 prawo, 2 dół, 3 lewo */
  rot: number;
  /** sztuki (drewno, jedzenie, porcje w garnku, sterty materiału); przy śmieciach wielkość sterty 1–3 */
  n?: number;
  /** ogień (koza, ognisko): pali się, gdy więcej niż 0 */
  fuel?: number;
  /** wrak samochodu: 'maluch' albo 'polonez'; stage: 1 przeszukany, 2 szkielet (st.wraki) */
  model?: string;
  stage?: number;
  /** zepsuty mebel z pustego mieszkania (kontrakt M2: Furniture.broken) */
  broken?: boolean;
  /** okopcony mebel: kuchenka na kafelku uszkodzenia piec (do naprawy) */
  burnt?: boolean;
  /** stoi na stole (garnek z posiłkiem): dolna krawędź stołu w kafelkach, rysuje się na blacie po stole */
  table?: number;
  spec?: ThingSpec;
}

/** to, czego z wnętrza potrzebuje rysowanie kawałków (idzie do workera razem ze sceną) */
export interface SectionScene {
  building: number;
  cell: Uint8Array;
  room: Int16Array;
  /** rodzaj pomieszczenia po jego numerze */
  kinds: RoomKind[];
  windows: Set<number>;
  /** drzwi frontowe (wejścia budynku) */
  entrances: Set<number>;
  /** okna świecące nocą (ciepłe pomieszczenie) */
  lit: Set<number>;
  /** ziarno wzorów (zużycie, lamperia) */
  seed: number;
  /** uszkodzenia w siedzibie: kafelek → rodzaj (naprawione znikają z mapy) */
  damage?: Map<number, DamageKind>;
  /** numer mieszkania po numerze pomieszczenia (−1: klatka) */
  roomApt?: number[];
  /** puste mieszkania siedziby: numer mieszkania → przyczyna (ślad na posadzce) */
  why?: Map<number, AptWhy>;
}

/** świat z uszkodzeniami i stanami mieszkań (kontrakt M2, src/world/apts.ts), gdy już je ma */
export type WorldWear = { damage?: readonly Damage[]; apts?: readonly AptState[] };

export function sectionOf(w: Pick<World, 'interior' | 'buildings' | 'seed'> & WorldWear): SectionScene {
  const int = w.interior;
  const kinds: RoomKind[] = [];
  const roomApt: number[] = [];
  for (const r of int.rooms) {
    kinds[r.id] = r.kind;
    roomApt[r.id] = r.apt;
  }
  const sec: SectionScene = {
    building: int.building,
    cell: int.cell,
    room: int.room,
    kinds,
    windows: new Set(int.windows),
    entrances: new Set(w.buildings[int.building].entrances.map((e) => e.tile)),
    lit: new Set(),
    seed: w.seed | 0,
    roomApt,
  };
  setWear(sec, w.damage ?? [], w.apts ?? []);
  return sec;
}

/** uszkodzenia i ślady pustych mieszkań budynku przekroju (z kontraktu świata albo z atrapy) */
export function setWear(sec: SectionScene, damage: readonly Damage[], apts: readonly AptState[]): void {
  sec.damage = new Map(damage.filter((d) => d.bid === sec.building).map((d) => [d.tile, d.kind]));
  sec.why = new Map(
    apts.filter((a) => a.bid === sec.building && a.state === 'puste' && a.why).map((a) => [a.apt, a.why!]),
  );
}

/**
 * Opis kafelka i (indeks na mapie size×size) przekroju sec albo null poza wnętrzem.
 * facade to kolor elewacji (0xRRGGBB) dla frontów ścian od strony ulicy.
 */
export function describeTile(sec: SectionScene, i: number, size: number, facade: number): InteriorTile | null {
  const c = sec.cell[i];
  if (c === IN.NONE) return null;
  const x = i % size;
  const y = (i - x) / size;
  const at = (dx: number, dy: number): number => {
    const xx = x + dx;
    const yy = y + dy;
    return xx < 0 || yy < 0 || xx >= size || yy >= size ? IN.NONE : sec.cell[yy * size + xx];
  };
  // ściana, okno (to też kafelek ściany) albo drzwi
  const wallish = (dx: number, dy: number) => {
    const k = at(dx, dy);
    return k === IN.WALL || k === IN.DOOR;
  };
  const kindAt = (dx: number, dy: number): RoomKind | null => {
    const r = sec.room[(y + dy) * size + x + dx];
    return r >= 0 ? (sec.kinds[r] ?? null) : null;
  };
  let out = 0;
  if (at(0, -1) === IN.NONE) out |= NB.N;
  if (at(1, 0) === IN.NONE) out |= NB.E;
  if (at(0, 1) === IN.NONE) out |= NB.S;
  if (at(-1, 0) === IN.NONE) out |= NB.W;
  // front ściany: co jest na południe od niej (pomieszczenie albo ulica), gdy nie ma tam ściany
  const south = at(0, 1);
  const face =
    south === IN.WALL || south === IN.DOOR
      ? undefined
      : south === IN.NONE
        ? ('out' as const)
        : (kindAt(0, 1) ?? undefined);
  switch (c) {
    case IN.FLOOR:
      return {
        kind: 'floor',
        room: (sec.room[i] >= 0 && sec.kinds[sec.room[i]]) || 'pokoj',
        walls: maskOf((dx, dy) => at(dx, dy) === IN.WALL),
      };
    case IN.STAIRS:
      return { kind: 'stairs', up: stairsUp(at), mask: maskOf((dx, dy) => at(dx, dy) === IN.STAIRS) };
    case IN.DOOR:
      return {
        kind: 'door',
        vertical: wallish(0, -1) && wallish(0, 1),
        entrance: sec.entrances.has(i),
        face,
        facade: face === 'out' ? facade : undefined,
        broken: sec.damage?.get(i) === 'drzwi' || undefined,
      };
    default: {
      const mask = maskOf(wallish);
      if (sec.windows.has(i) && out) {
        const side = out & NB.N ? NB.N : out & NB.S ? NB.S : out & NB.E ? NB.E : NB.W;
        const [ix, iy] = side === NB.N ? [0, 1] : side === NB.S ? [0, -1] : side === NB.E ? [-1, 0] : [1, 0];
        const broken = sec.damage?.get(i) === 'okno' || undefined;
        return {
          kind: 'window',
          mask,
          out: side,
          room: kindAt(ix, iy) ?? 'pokoj',
          lit: sec.lit.has(i),
          facade,
          broken,
        };
      }
      return { kind: 'wall', mask, outer: out !== 0, out, face, facade: face === 'out' ? facade : undefined };
    }
  }
}

/** kierunek wchodzenia po schodach: w głąb od posadzki klatki (pierwszej posadzki za ciągiem schodów) */
function stairsUp(at: (dx: number, dy: number) => number): Dir {
  const runs: [number, number, Dir][] = [
    [0, 1, 'N'],
    [0, -1, 'S'],
    [-1, 0, 'E'],
    [1, 0, 'W'],
  ];
  for (const [dx, dy, up] of runs) {
    let k = 1;
    while (at(dx * k, dy * k) === IN.STAIRS) k++;
    if (at(dx * k, dy * k) === IN.FLOOR) return up;
  }
  return 'N';
}

const FURNITURE = new Set([
  'koza',
  'stol',
  'krzeslo',
  'kuchenka',
  'lodowka',
  'lozko',
  'wersalka',
  'mebloscianka',
  'wanna',
  'sedes',
  'umywalka',
]);

/** czy rzecz się pali (koza, ognisko z ogniem): wtedy sprite ma klatki ognia */
export const burning = (t: ThingLike) => (t.kind === 'koza' || t.kind === 'ognisko') && (t.fuel ?? 0) > 0;

/** stos 1–2 sztuk to mały, 3–5 średni, więcej duży */
export const pileSize = (n = 1): 1 | 2 | 3 => (n >= 6 ? 3 : n >= 3 ? 2 : 1);

/** garnek: pusty, na dnie (1–2 porcje), do połowy (3–5), pełny */
export const potSize = (n = 0): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n >= 6 ? 3 : n >= 3 ? 2 : 1);

/** tyle wyglądów wraku na model: ziarno z miejsca zawija się, żeby tekstur nie było więcej niż trzeba */
export const WRECK_LOOKS = 12;

/** ziarno drobiazgów z miejsca rzeczy (ten sam mebel zawsze wygląda tak samo) */
const seedOf = (t: ThingLike) => ((Math.imul(t.x, 73856093) ^ Math.imul(t.y, 19349663)) >>> 0) & 0xffff;

/**
 * Opis sprite'a rzeczy dla thingSprite albo null dla rodzaju bez grafiki. fire to klatka ognia
 * (0..FIRE_FRAMES−1) dla palącej się kozy i ogniska.
 */
export function specOf(t: ThingLike, fire = 0): ThingSpec | null {
  if (t.spec) return t.spec;
  const seed = seedOf(t);
  const rot = (t.rot & 3) as 0 | 1 | 2 | 3;
  const f = burning(t) ? fire % FIRE_FRAMES : undefined;
  if (FURNITURE.has(t.kind))
    return { kind: t.kind as 'koza', rot, seed, fire: f, broken: t.broken || undefined, burnt: t.burnt || undefined };
  if ((BUILD_KINDS as readonly string[]).includes(t.kind)) return { kind: t.kind as 'warsztat', rot, seed: seed % 8 };
  switch (t.kind) {
    case 'drewno':
    case 'jedzenie':
    case 'gruz':
    case 'deski':
    case 'zlom':
    case 'czesci':
    case 'leki':
      return { kind: t.kind, size: pileSize(t.n), seed };
    case 'posilek':
      return { kind: 'posilek', size: potSize(t.n), table: t.table !== undefined, seed };
    case 'wrak':
      return {
        kind: 'wrak',
        model: t.model === 'polonez' ? 'polonez' : 'maluch',
        rot,
        seed: seed % WRECK_LOOKS,
        stage: t.stage === 1 || t.stage === 2 ? t.stage : undefined,
      };
    case 'wozek':
      // wózek handlarza: pełny przy wizycie, pusty po napaści (n 0)
      return { kind: 'wozek', full: (t.n ?? 1) > 0 ? undefined : false, seed: seed % 4 };
    case 'smieci':
      // n to wielkość sterty z kontraktu świata (1–3), nie liczba sztuk
      return { kind: 'smieci', size: Math.min(3, Math.max(1, Math.round(t.n ?? 1))) as 1 | 2 | 3, seed };
    case 'pien':
      return { kind: 'pien', seed };
    case 'trzepak':
      return { kind: 'trzepak', rot: t.w >= t.h ? 0 : 1, seed };
    // ogród domu: sznur na pranie z praniem, gdy n > 0 (sztuki prania); huśtawka ułożona z w i h;
    // buda, ławka i kompost stoją plecami do strony rot, ułożenie zgodne z w i h
    case 'sznur':
      return { kind: 'sznur', rot: t.w >= t.h ? 0 : 1, pranie: (t.n ?? 0) > 0 || undefined, seed: seed % 8 };
    case 'hustawka':
      return { kind: 'hustawka', rot: t.w >= t.h ? 0 : 1, seed: seed % 4 };
    case 'lawka':
      return { kind: 'lawka', rot: t.w >= t.h ? (rot === 2 ? 2 : 0) : rot === 3 ? 3 : 1, seed: seed % 4 };
    case 'kompost':
    case 'buda':
      return { kind: t.kind, rot, seed: seed % 4 };
    case 'ognisko':
      return { kind: 'ognisko', fire: f, seed };
    case 'krew':
      return { kind: 'krew', seed: seed % 8 };
    default:
      return null;
  }
}
