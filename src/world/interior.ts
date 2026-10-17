/* Wnętrze budynku: parter z klatkami, mieszkaniami i meblami, ułożony z szablonów na obrysie z OSM.
   Ściany mają grubość jednego kafelka, brzeg obrysu to ściana zewnętrzna albo drzwi.
   - Blok: sekcja na każdą klatkę (granice w połowie między wejściami). Trzon klatki 3 m przez całą
     głębokość, schody w głębi, po obu stronach mieszkanie w pasach: od wejścia kuchnia z łazienką,
     przedpokój 2 m, pokoje od przeciwległej fasady. Głęboki budynek ma kilka rzędów mieszkań
     (ostatni odwrócony, kuchnią do tylnej fasady), płytki prostszy układ bez przedpokoju.
   - Dom (i kawałek bloku bez klatki): przedpokój od drzwi w głąb, po bokach kuchnia, łazienka, pokoje.
   - Sklep, szkoła, przychodnia i reszta: sala od wejścia, w głębokim budynku zaplecze z toaletą
     pod tylną ścianą; garaż i hala to jedna hala. Bardzo mały budynek to jedno pomieszczenie.
   Nieregularny obrys przycina szablon. Drzwi łączą potem pomieszczenia od wejść w głąb (klatka,
   przedpokój, reszta mieszkania); czego nie da się połączyć drzwiami, łączy się z sąsiadem,
   dostaje drzwi na zewnątrz albo zostaje zamurowane. Koza, skład drewna i mieszkanie zarządu
   tylko w siedzibie (opts.home).
   Wnętrze wynika wyłącznie ze świata (siatka budynków, teren, wejścia), numeru budynku i ziarna,
   więc nie trzeba go zapisywać: odtworzy się takie samo. */

import { clamp, mulberry, type Rng } from '../core/rng.ts';
import { labelRegions } from '../sim/path.ts';
import { T } from './terrain.ts';
import type { Dir, World, WorldBuilding } from './world.ts';

/** kody kafelka wnętrza */
export const IN = {
  NONE: 0,
  WALL: 1,
  DOOR: 2,
  STAIRS: 3,
  FLOOR: 4,
} as const;
export type InCode = (typeof IN)[keyof typeof IN];

/** pomieszczenia mieszkalne, a w budynkach bez mieszkań: sala (sklep, szkoła, przychodnia),
    hala (garaż, magazyn, warsztat) i zaplecze */
export type RoomKind = 'klatka' | 'przedpokoj' | 'pokoj' | 'kuchnia' | 'lazienka' | 'sala' | 'hala' | 'zaplecze';
export type FloorKind = 'lastryko' | 'panele' | 'linoleum' | 'kafle' | 'beton';

/** posadzka wynika z rodzaju pomieszczenia */
export const FLOOR_OF: Record<RoomKind, FloorKind> = {
  klatka: 'lastryko',
  przedpokoj: 'linoleum',
  kuchnia: 'linoleum',
  pokoj: 'panele',
  lazienka: 'kafle',
  sala: 'lastryko',
  hala: 'beton',
  zaplecze: 'linoleum',
};

export type FurnitureKind =
  | 'koza'
  | 'stol'
  | 'krzeslo'
  | 'kuchenka'
  | 'lodowka'
  | 'lozko'
  | 'wersalka'
  | 'mebloscianka'
  | 'wanna'
  | 'sedes'
  | 'umywalka';

/** wymiary bazowe w metrach: wzdłuż ściany × w głąb pomieszczenia (łóżko stoi wezgłowiem do ściany) */
export const FURNITURE_SIZE: Record<FurnitureKind, readonly [number, number]> = {
  koza: [1, 1],
  stol: [2, 1],
  krzeslo: [1, 1],
  kuchenka: [1, 1],
  lodowka: [1, 1],
  lozko: [1, 2],
  wersalka: [2, 1],
  mebloscianka: [3, 1],
  wanna: [2, 1],
  sedes: [1, 1],
  umywalka: [1, 1],
};

export interface Furniture {
  kind: FurnitureKind;
  /** lewy górny kafelek */
  x: number;
  y: number;
  /** wymiary po obrocie */
  w: number;
  h: number;
  /** ściana, przy której stoi: 0 góra, 1 prawo, 2 dół, 3 lewo; wolnostojące 0; krzesło: strona oparcia */
  rot: 0 | 1 | 2 | 3;
}

export interface Room {
  /** równy indeksowi w rooms */
  id: number;
  kind: RoomKind;
  /** numer mieszkania, −1 dla klatki i w budynkach bez mieszkań */
  apt: number;
  /** kafelków posadzki (bez schodów) */
  area: number;
}

export interface Interior {
  /** numer budynku */
  building: number;
  /** kod kafelka (IN), size×size */
  cell: Uint8Array;
  /** numer pomieszczenia albo −1 (ściany, drzwi, poza wnętrzem); schody należą do klatki */
  room: Int16Array;
  rooms: Room[];
  /** kafelki drzwi, także frontowych, rosnąco */
  doors: number[];
  /** kafelki ścian zewnętrznych z oknem, rosnąco */
  windows: number[];
  furniture: Furniture[];
  /** wolne kafelki składu drewna przy kozie (tylko w siedzibie) */
  sklad: number[];
  /** numer mieszkania zarządu, −1 poza siedzibą */
  home: number;
}

/** z czego powstaje wnętrze: niezmienne dane świata i ziarno (bez blocked, które zmienia się w grze) */
export type InteriorWorld = Pick<World, 'size' | 'terr' | 'bid' | 'buildings' | 'seed'>;

export interface InteriorOpts {
  /** siedziba: mieszkanie zarządu z kozą, składem drewna i miejscami do spania */
  home?: boolean;
}

type Rot = 0 | 1 | 2 | 3;
const ROTS: readonly Rot[] = [0, 1, 2, 3];
/** etykieta muru w siatce szablonu; pomieszczenia z szablonu mają numery od 0 */
const WALL = -1;

/** pomieszczenie z szablonu, zanim przycięcie rozbije je na spójne kawałki */
interface Proto {
  kind: RoomKind;
  apt: number;
  /** wejście do mieszkania: tu prowadzą drzwi z klatki albo z zewnątrz */
  entry: boolean;
}

interface Ctx {
  size: number;
  bid: Int32Array;
  terr: Uint8Array;
  id: number;
  b: WorldBuilding;
  home: boolean;
  rnd: Rng;
  cell: Uint8Array;
  /** pomieszczenie z szablonu na kafelku albo −1 */
  owner: Int32Array;
  protos: Proto[];
  /** licznik mieszkań */
  apts: number;
}

/** Wnętrze budynku id. Siedziba (opts.home) dostaje mieszkanie zarządu z kozą i składem drewna;
    inne budynki home = −1 i pusty skład. Na świat nakłada je applyInterior. */
export function buildInterior(w: InteriorWorld, id: number, opts: InteriorOpts = {}): Interior {
  const { size } = w;
  const b = w.buildings[id];
  const N = size * size;
  const ctx: Ctx = {
    size,
    bid: w.bid,
    terr: w.terr,
    id,
    b,
    home: !!opts.home,
    rnd: mulberry(((w.seed * 7919) ^ (id * 104729) ^ 0x1e7e21) >>> 0),
    cell: new Uint8Array(N),
    owner: new Int32Array(N).fill(-1),
    protos: [],
    apts: 0,
  };
  // 1. szablony na spójnych kawałkach obrysu (przejścia przez budynek potrafią go pociąć)
  const outer: number[] = [];
  for (const comp of components(ctx)) layoutComponent(ctx, comp, outer);
  // 2. pomieszczenia: spójne kawałki pomieszczeń z szablonu
  const R = roomsOf(ctx, outer);
  // 3. drzwi frontowe, potem drzwi od wejść w głąb
  for (const t of outer) ctx.cell[t] = IN.DOOR;
  connectRooms(ctx, R, outer);
  // 4. numeracja, okna, meble
  const { rooms, room } = compact(ctx, R);
  const win = placeWindows(ctx, rooms, room);
  const f = furnish(ctx, rooms, room, win);
  const doors: number[] = [];
  const windows: number[] = [];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const s = y * size + x;
      if (ctx.cell[s] === IN.DOOR) doors.push(s);
      if (win[s]) windows.push(s);
    }
  return {
    building: b.id,
    cell: ctx.cell,
    room,
    rooms,
    doors,
    windows,
    furniture: f.items,
    sklad: f.sklad,
    home: f.home,
  };
}

/** Nakłada wnętrze na świat: ściany i schody blokują, posadzki, drzwi i meble (na razie) nie.
    Zwraca regiony policzone od nowa, bo wnętrze łączy się z podwórkiem przez drzwi. */
export function applyInterior(w: Pick<World, 'size' | 'blocked'>, it: Interior): Int32Array {
  for (let i = 0; i < it.cell.length; i++) {
    const c = it.cell[i];
    if (c !== IN.NONE) w.blocked[i] = c === IN.WALL || c === IN.STAIRS ? 1 : 0;
  }
  return labelRegions(w.blocked, w.size);
}

/** wolny teren tuż za ścianą: nie budynek i nie woda (drzewa i trzepak stoją co najmniej 2 m od budynków) */
const outside = (ctx: Ctx, o: number) => ctx.bid[o] < 0 && ctx.terr[o] !== T.WATER;

/** sąsiad w kierunku d (0 góra, 1 prawo, 2 dół, 3 lewo) albo −1 za brzegiem mapy */
function nb(size: number, i: number, d: number): number {
  const x = i % size;
  if (d === 0) return i >= size ? i - size : -1;
  if (d === 1) return x < size - 1 ? i + 1 : -1;
  if (d === 2) return i < size * (size - 1) ? i + size : -1;
  return x > 0 ? i - 1 : -1;
}

/** brzeg obrysu: któryś sąsiad nie należy do budynku albo kafelek leży na brzegu mapy */
function isEdge(ctx: Ctx, i: number): boolean {
  for (let d = 0; d < 4; d++) {
    const n = nb(ctx.size, i, d);
    if (n < 0 || ctx.bid[n] !== ctx.id) return true;
  }
  return false;
}

function newProto(ctx: Ctx, kind: RoomKind, apt: number, entry: boolean): number {
  ctx.protos.push({ kind, apt, entry });
  return ctx.protos.length - 1;
}

/** spójne (w 4 kierunkach) kawałki obrysu, w kolejności kafelków */
function components(ctx: Ctx): number[][] {
  const { size, bid, id, b } = ctx;
  const W = b.x1 - b.x0 + 1;
  const seen = new Uint8Array(W * (b.y1 - b.y0 + 1));
  const at = (i: number) => (Math.floor(i / size) - b.y0) * W + (i % size) - b.x0;
  const out: number[][] = [];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const s = y * size + x;
      if (bid[s] !== id || seen[at(s)]) continue;
      seen[at(s)] = 1;
      const comp = [s];
      for (let k = 0; k < comp.length; k++)
        for (let d = 0; d < 4; d++) {
          const n = nb(size, comp[k], d);
          if (n >= 0 && bid[n] === id && !seen[at(n)]) {
            seen[at(n)] = 1;
            comp.push(n);
          }
        }
      out.push(comp);
    }
  return out;
}

/* ---------- szablony ---------- */

/** układ lokalny kawałka obrysu: u wzdłuż fasady z wejściem, v w głąb od niej */
interface Frame {
  d: Dir;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  U: number;
  V: number;
}

function frameOf(d: Dir, x0: number, y0: number, x1: number, y1: number): Frame {
  const ns = d === 'N' || d === 'S';
  return { d, x0, y0, x1, y1, U: ns ? x1 - x0 + 1 : y1 - y0 + 1, V: ns ? y1 - y0 + 1 : x1 - x0 + 1 };
}

function toUV(f: Frame, x: number, y: number): [number, number] {
  if (f.d === 'N') return [x - f.x0, y - f.y0];
  if (f.d === 'S') return [x - f.x0, f.y1 - y];
  if (f.d === 'W') return [y - f.y0, x - f.x0];
  return [y - f.y0, f.x1 - x];
}

/** siatka szablonu w układzie lokalnym (indeks v·U + u) */
interface Grid {
  U: number;
  V: number;
  inside: Uint8Array;
  edge: Uint8Array;
  /** WALL albo numer pomieszczenia z szablonu */
  lab: Int32Array;
  stairs: Uint8Array;
}

const STEP: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

function layoutComponent(ctx: Ctx, comp: number[], outer: number[]): void {
  const { size, b } = ctx;
  const inComp = new Set(comp);
  let doors: { tile: number; dir: Dir }[] = b.entrances.filter((e) => inComp.has(e.tile));
  const residential = b.cls === 'blok' || b.cls === 'dom';
  const staircase = b.cls === 'blok' && doors.length > 0;
  if (!doors.length) {
    const d = extraDoor(ctx, comp, b.entrances[0]?.dir);
    if (!d) {
      // kawałek, do którego nie da się wejść z zewnątrz: lita bryła
      for (const i of comp) ctx.cell[i] = IN.WALL;
      return;
    }
    doors = [d];
  }
  for (const d of doors) outer.push(d.tile);
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (const i of comp) {
    const x = i % size;
    const y = (i - x) / size;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const f = frameOf(doors[0].dir, x0, y0, x1, y1);
  const n = f.U * f.V;
  const g: Grid = {
    U: f.U,
    V: f.V,
    inside: new Uint8Array(n),
    edge: new Uint8Array(n),
    lab: new Int32Array(n).fill(WALL),
    stairs: new Uint8Array(n),
  };
  const at = (i: number) => {
    const [u, v] = toUV(f, i % size, Math.floor(i / size));
    return v * f.U + u;
  };
  for (const i of comp) {
    g.inside[at(i)] = 1;
    if (isEdge(ctx, i)) g.edge[at(i)] = 1;
  }
  const local = doors
    .map((d) => toUV(f, d.tile % size, Math.floor(d.tile / size)))
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let area = 0;
  for (let k = 0; k < n; k++) if (g.inside[k] && !g.edge[k]) area++;
  const big = b.cls === 'garaz' || b.cls === 'hala' ? 'hala' : 'sala';
  // bardzo mały budynek: jedno pomieszczenie
  if (area < 16) single(ctx, g, residential ? 'pokoj' : big, residential ? ctx.apts++ : -1);
  else if (!residential) hallLayout(ctx, g, local[0][1], big);
  else if (staircase) blockLayout(ctx, g, local);
  else domLayout(ctx, g, local[0][0], local[0][1]);
  for (const i of comp) {
    const k = at(i);
    const l = g.edge[k] ? WALL : g.lab[k];
    ctx.cell[i] = l === WALL ? IN.WALL : g.stairs[k] ? IN.STAIRS : IN.FLOOR;
    if (l !== WALL) ctx.owner[i] = l;
  }
}

/** drzwi do kawałka bez wejścia (np. między przejściami falowca): środek ściany z wolnym terenem przed nią,
    najpierw od strony wejść budynku */
function extraDoor(ctx: Ctx, comp: number[], prefer: Dir | undefined): { tile: number; dir: Dir } | null {
  const { size, bid, id } = ctx;
  const order: Dir[] = [];
  for (const d of [prefer, 'S', 'E', 'W', 'N'] as (Dir | undefined)[]) if (d && !order.includes(d)) order.push(d);
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;
  for (const d of order) {
    const [dx, dy] = STEP[d];
    const along = (t: number) => (dx === 0 ? t % size : Math.floor(t / size));
    const cands: number[] = [];
    for (const t of comp) {
      const x = t % size;
      const y = (t - x) / size;
      if (!inMap(x + dx, y + dy) || !inMap(x - dx, y - dy)) continue;
      const o = (y + dy) * size + x + dx;
      const inner = (y - dy) * size + x - dx;
      if (!outside(ctx, o) || bid[inner] !== id || isEdge(ctx, inner)) continue;
      // w prostej ścianie, nie w narożniku
      if (!inMap(x + dy, y + dx) || !inMap(x - dy, y - dx)) continue;
      if (bid[(y + dx) * size + x + dy] !== id || bid[(y - dx) * size + x - dy] !== id) continue;
      cands.push(t);
    }
    if (!cands.length) continue;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const t of cands) {
      lo = Math.min(lo, along(t));
      hi = Math.max(hi, along(t));
    }
    const mid = (lo + hi) / 2;
    cands.sort((p, q) => Math.abs(along(p) - mid) - Math.abs(along(q) - mid) || p - q);
    return { tile: cands[0], dir: d };
  }
  return null;
}

/** jedno pomieszczenie na całe wnętrze */
function single(ctx: Ctx, g: Grid, kind: RoomKind, apt: number): void {
  const p = newProto(ctx, kind, apt, true);
  for (let k = 0; k < g.U * g.V; k++) if (g.inside[k] && !g.edge[k]) g.lab[k] = p;
}

/** budynek bez mieszkań: sala (albo hala) od wejścia; w głębokim i szerokim budynku pod tylną ścianą
    pas zaplecza 3 m podzielony co około 5 m, jedno z pomieszczeń to toaleta */
function hallLayout(ctx: Ctx, g: Grid, ve: number, kind: 'sala' | 'hala'): void {
  const { U, V, inside, edge, lab } = g;
  const main = newProto(ctx, kind, -1, true);
  let vb = ve;
  for (let k = 0; k < U * V; k++) if (inside[k]) vb = Math.max(vb, Math.floor(k / U));
  const back = kind === 'sala' && vb - ve + 1 >= 11 && U >= 8 ? vb - 4 : -1;
  const m = Math.max(1, Math.floor((U - 1) / 6));
  const walls: number[] = [];
  for (let j = 1; j < m; j++) walls.push(Math.round((j * (U - 1)) / m));
  const rooms: number[] = [];
  if (back >= 0) {
    const wc = m > 1 ? (ctx.rnd() < 0.5 ? 0 : m - 1) : -1;
    for (let j = 0; j < m; j++) rooms.push(newProto(ctx, j === wc ? 'lazienka' : 'zaplecze', -1, false));
  }
  for (let v = 0; v < V; v++)
    for (let u = 0; u < U; u++) {
      const k = v * U + u;
      if (!inside[k] || edge[k]) continue;
      if (back < 0 || v < back) lab[k] = main;
      else if (v === back || walls.includes(u)) lab[k] = WALL;
      else lab[k] = rooms[walls.filter((x) => u > x).length];
    }
}

/** blok: sekcja na każde wejście, granice (mur) w połowie między wejściami */
function blockLayout(ctx: Ctx, g: Grid, doors: [number, number][]): void {
  const n = doors.length;
  for (let k = 0; k < n; k++) {
    const lo = k === 0 ? 1 : Math.floor((doors[k - 1][0] + doors[k][0]) / 2) + 1;
    const hi = k === n - 1 ? g.U - 2 : Math.floor((doors[k][0] + doors[k + 1][0]) / 2) - 1;
    if (hi - lo >= 2) section(ctx, g, lo, hi, doors[k][0], doors[k][1]);
  }
}

interface Band {
  kind: 'wall' | 'front' | 'hall' | 'back';
  v0: number;
  v1: number;
}

/** pasy rzędu mieszkań między ścianami t0 i t1: od fasady z wejściem albo (flip) od tylnej */
function slabBands(t0: number, t1: number, flip: boolean): Band[] {
  const D = t1 - t0 + 1;
  const plan: [Band['kind'], number][] = [];
  if (D >= 12) {
    const rest = D - 6;
    const b1 = clamp(Math.round(rest * 0.45), 2, 4);
    plan.push(['wall', 1], ['front', b1], ['wall', 1], ['hall', 2], ['wall', 1], ['back', rest - b1], ['wall', 1]);
  } else if (D >= 7) {
    // za płytko na przedpokój
    const rest = D - 3;
    const b1 = clamp(Math.round(rest * 0.45), 2, 3);
    plan.push(['wall', 1], ['front', b1], ['wall', 1], ['back', rest - b1], ['wall', 1]);
  } else plan.push(['wall', 1], ['front', D - 2], ['wall', 1]);
  const out: Band[] = [];
  let at = 0;
  for (const [kind, n] of plan) {
    if (n <= 0) continue;
    out.push(flip ? { kind, v0: t1 - (at + n - 1), v1: t1 - at } : { kind, v0: t0 + at, v1: t0 + at + n - 1 });
    at += n;
  }
  return out;
}

/** mieszkanie po jednej stronie klatki w jednym rzędzie */
interface Apt {
  apt: number;
  /** kolumny posadzki */
  a: number;
  z: number;
  /** łazienka od strony wyższych u */
  bathHigh: boolean;
  bw: number;
  /** kolumna ściany między pokojami albo −1 */
  splitU: number;
  protos: Map<string, number>;
}

function section(ctx: Ctx, g: Grid, lo: number, hi: number, ue: number, ve: number): void {
  const { U, V, inside, edge, lab, stairs } = g;
  // trzon klatki: 3 m posadzki razem z kolumną drzwi
  let c0 = clamp(ue - 1, lo, Math.max(lo, hi - 2));
  let c1 = Math.min(hi, c0 + 2);
  if (ue < c0) c0 = ue;
  if (ue > c1) c1 = ue;
  const s0 = c0;
  const s1 = c1;
  // wąska resztka z boku (do 2 m) dołącza do klatki
  if (c0 - lo < 4) c0 = Math.min(c0, lo);
  if (hi - c1 < 4) c1 = Math.max(c1, hi);
  const used = (u: number) => {
    for (let v = 0; v < V; v++) if (inside[v * U + u] && !edge[v * U + u]) return true;
    return false;
  };
  const ranges: [number, number][] = [];
  for (let [a, z] of [
    [lo, c0 - 2],
    [c1 + 2, hi],
  ]) {
    while (a <= z && !used(a)) a++;
    while (z >= a && !used(z)) z--;
    if (a <= z) ranges.push([a, z]);
  }
  // głębokość sekcji i rzędy mieszkań (co około 12 m)
  let vb = ve;
  for (let u = lo; u <= hi; u++)
    for (let v = V - 1; v > vb; v--)
      if (inside[v * U + u]) {
        vb = v;
        break;
      }
  const D = vb - ve + 1;
  const ns = D >= 25 ? Math.floor((D - 1) / 12) : 1;
  const t: number[] = [];
  for (let j = 0; j <= ns; j++) t.push(ve + Math.round((j * (D - 1)) / ns));
  const slabs = t.slice(0, ns).map((t0, j) => slabBands(t0, t[j + 1], ns > 1 && j === ns - 1));
  const apts: Apt[][] = slabs.map(() =>
    ranges.map(([a, z]) => {
      const W = z - a + 1;
      // łazienka przy klatce albo przy szczycie, z ziarna
      const nearCore = ctx.rnd() < 0.5;
      const coreHigh = a < c0;
      return {
        apt: ctx.apts++,
        a,
        z,
        bathHigh: nearCore === coreHigh,
        bw: W >= 9 ? 3 : 2,
        splitU: W >= 8 ? a + (W >> 1) + (W >= 10 ? Math.floor(ctx.rnd() * 3) - 1 : 0) : -1,
        protos: new Map(),
      };
    }),
  );
  const klatka = newProto(ctx, 'klatka', -1, true);
  const slabAt = (v: number) => {
    let j = 0;
    while (j + 1 < ns && v > t[j + 1]) j++;
    return j;
  };
  for (let v = 0; v < V; v++)
    for (let u = lo; u <= hi; u++) {
      const k = v * U + u;
      if (!inside[k] || edge[k]) continue;
      if (u >= c0 && u <= c1) {
        lab[k] = v > ve ? klatka : WALL;
        continue;
      }
      const si = ranges.findIndex(([a, z]) => u >= a && u <= z);
      if (si < 0) continue; // ściana trzonu
      const j = slabAt(v);
      lab[k] = aptLabel(ctx, apts[j][si], slabs[j], u, v, v <= ve);
    }
  // schody w głębi trzonu
  for (let u = s0; u <= s1; u++) {
    let vm = -1;
    for (let v = V - 1; v > ve && vm < 0; v--) if (lab[v * U + u] === klatka) vm = v;
    const len = vm - ve;
    const sd = len >= 8 ? 3 : len >= 5 ? 2 : 0;
    for (let v = vm; v > vm - sd; v--) if (lab[v * U + u] === klatka) stairs[v * U + u] = 1;
  }
}

/** ahead: kafelek na linii drzwi albo przed nią (wysunięty kawałek fasady): należy do pasa od wejścia */
function aptLabel(ctx: Ctx, A: Apt, bands: Band[], u: number, v: number, ahead: boolean): number {
  const band = ahead
    ? bands.find((x) => x.kind === 'front')
    : (bands.find((x) => v >= x.v0 && v <= x.v1) ?? bands.find((x) => x.kind === 'front'));
  if (!band || band.kind === 'wall') return WALL;
  const P = (key: string, kind: RoomKind, entry: boolean) => {
    let p = A.protos.get(key);
    if (p === undefined) {
      p = newProto(ctx, kind, A.apt, entry);
      A.protos.set(key, p);
    }
    return p;
  };
  if (band.kind === 'hall') return P('hall', 'przedpokoj', true);
  if (band.kind === 'front') {
    if (A.z - A.a + 1 >= 6) {
      const b0 = A.bathHigh ? A.z - A.bw + 1 : A.a;
      const b1 = b0 + A.bw - 1;
      if (u === (A.bathHigh ? b0 - 1 : b1 + 1)) return WALL;
      if (u >= b0 && u <= b1) return P('bath', 'lazienka', false);
    }
    return P('kitchen', 'kuchnia', !bands.some((x) => x.kind === 'hall'));
  }
  // pokoje: duży pas dzielony na dwa wzdłuż i (bardzo głęboki) w poprzek
  const deep = band.v1 - band.v0 + 1 >= 8 ? (band.v0 + band.v1) >> 1 : -1;
  if (u === A.splitU || v === deep) return WALL;
  return P(`room${(A.splitU >= 0 && u > A.splitU ? 1 : 0) + (deep >= 0 && v > deep ? 2 : 0)}`, 'pokoj', false);
}

interface Seg {
  v0: number;
  v1: number;
  p: number;
}

/** pomieszczenia jedno za drugim w głąb, ze ścianą między nimi; reszta to pokój (duży dzielony na dwa) */
function stack(ctx: Ctx, apt: number, r0: number, r1: number, head: [RoomKind, number][]): Seg[] {
  const segs: Seg[] = [];
  let at = r0;
  for (const [kind, n] of head) {
    if (at > r1) break;
    const v1 = Math.min(r1, at + n - 1);
    segs.push({ v0: at, v1, p: newProto(ctx, kind, apt, false) });
    at = v1 + 2;
  }
  const rest = r1 - at + 1;
  if (rest >= 8) {
    const m = at + (rest >> 1);
    segs.push({ v0: at, v1: m - 1, p: newProto(ctx, 'pokoj', apt, false) });
    segs.push({ v0: m + 1, v1: r1, p: newProto(ctx, 'pokoj', apt, false) });
  } else if (rest >= 2) segs.push({ v0: at, v1: r1, p: newProto(ctx, 'pokoj', apt, false) });
  else if (segs.length) segs[segs.length - 1].v1 = r1;
  return segs;
}

/** dom: przedpokój 2 m od drzwi w głąb, po jednej stronie kuchnia, po drugiej łazienka, dalej pokoje */
function domLayout(ctx: Ctx, g: Grid, ue: number, ve: number): void {
  const { U, V, inside, edge, lab } = g;
  const apt = ctx.apts++;
  const hall = newProto(ctx, 'przedpokoj', apt, true);
  // przedpokój tak, żeby boki były jak najbardziej równe
  const opts: [number, number][] = [];
  if (ue - 1 >= 1) opts.push([ue - 1, ue]);
  if (ue + 1 <= U - 2) opts.push([ue, ue + 1]);
  if (!opts.length) opts.push([ue, ue]);
  const bal = (o: [number, number]) => Math.abs(o[0] - 2 - (U - 3 - o[1]));
  opts.sort((p, q) => bal(p) - bal(q));
  let [c0, c1] = opts.length > 1 && bal(opts[0]) === bal(opts[1]) && ctx.rnd() < 0.5 ? opts[1] : opts[0];
  let lw = c0 - 2;
  let rw = U - 3 - c1;
  if (lw < 2) {
    c0 = Math.min(c0, 1);
    lw = 0;
  }
  if (rw < 2) {
    c1 = Math.max(c1, U - 2);
    rw = 0;
  }
  let vb = ve;
  for (let k = 0; k < U * V; k++) if (inside[k]) vb = Math.max(vb, Math.floor(k / U));
  const r0 = ve + 1;
  const r1 = vb - 1;
  const inner = r1 - r0 + 1;
  const K: [RoomKind, number] = ['kuchnia', clamp(Math.round(inner * 0.45), 3, 5)];
  const B: [RoomKind, number] = ['lazienka', clamp(Math.round(inner * 0.35), 2, 3)];
  const kitchenLeft = lw > rw || (lw === rw && ctx.rnd() < 0.5);
  let left: Seg[] | null = null;
  let right: Seg[] | null = null;
  let narrow: Seg[] | null = null;
  if (lw && rw) {
    left = stack(ctx, apt, r0, r1, [kitchenLeft ? K : B]);
    right = stack(ctx, apt, r0, r1, [kitchenLeft ? B : K]);
  } else if (lw) left = stack(ctx, apt, r0, r1, [K, B]);
  else if (rw) right = stack(ctx, apt, r0, r1, [K, B]);
  // wąski dom: przedpokój na całą szerokość, dalej pomieszczenia jedno za drugim
  else narrow = stack(ctx, apt, r0 + 3, r1, [K, B]);
  const segAt = (segs: Seg[], v: number) => {
    const vv = Math.max(v, r0);
    for (const s of segs) if (vv >= s.v0 && vv <= s.v1) return s.p;
    return WALL;
  };
  for (let v = 0; v < V; v++)
    for (let u = 0; u < U; u++) {
      const k = v * U + u;
      if (!inside[k] || edge[k]) continue;
      if (u >= c0 && u <= c1) {
        if (v <= ve) lab[k] = WALL;
        else if (!narrow || v <= ve + 2) lab[k] = hall;
        else lab[k] = segAt(narrow, v);
      } else if (u < c0 - 1 && left) lab[k] = segAt(left, v);
      else if (u > c1 + 1 && right) lab[k] = segAt(right, v);
    }
}

/* ---------- pomieszczenia i drzwi ---------- */

interface RoomInfo {
  kind: RoomKind;
  apt: number;
  entry: boolean;
  /** kafelki posadzki i schodów */
  tiles: number[];
  gone: boolean;
}

interface Rooms {
  roomOf: Int32Array;
  list: RoomInfo[];
}

function roomsOf(ctx: Ctx, outer: number[]): Rooms {
  const { size, owner, cell, b } = ctx;
  const roomOf = new Int32Array(size * size).fill(-1);
  const list: RoomInfo[] = [];
  // kawałki liczone po samej posadzce: schody blokują, więc kieszeń za nimi to osobny kawałek
  const stairs: number[] = [];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const s = y * size + x;
      const o = owner[s];
      if (o < 0 || roomOf[s] >= 0) continue;
      if (cell[s] === IN.STAIRS) {
        stairs.push(s);
        continue;
      }
      const id = list.length;
      const tiles = [s];
      roomOf[s] = id;
      for (let k = 0; k < tiles.length; k++)
        for (let d = 0; d < 4; d++) {
          const n = nb(size, tiles[k], d);
          if (n >= 0 && owner[n] === o && cell[n] === IN.FLOOR && roomOf[n] < 0) {
            roomOf[n] = id;
            tiles.push(n);
          }
        }
      const p = ctx.protos[o];
      list.push({ kind: p.kind, apt: p.apt, entry: p.entry, tiles, gone: false });
    }
  // cały blok schodów należy do największego przyległego kawałka klatki; bez niego zostaje murem
  const inBlock = new Set<number>();
  for (const s of stairs) {
    if (inBlock.has(s)) continue;
    inBlock.add(s);
    const block = [s];
    let best = -1;
    for (let k = 0; k < block.length; k++)
      for (let d = 0; d < 4; d++) {
        const n = nb(size, block[k], d);
        if (n < 0 || owner[n] !== owner[s]) continue;
        if (cell[n] === IN.STAIRS) {
          if (!inBlock.has(n)) {
            inBlock.add(n);
            block.push(n);
          }
        } else if (roomOf[n] >= 0 && (best < 0 || list[roomOf[n]].tiles.length > list[best].tiles.length))
          best = roomOf[n];
      }
    for (const t of block) {
      if (best < 0) cell[t] = IN.WALL;
      else {
        roomOf[t] = best;
        list[best].tiles.push(t);
      }
    }
  }
  const R = { roomOf, list };
  // resztki po przycięciu (do 2 m² posadzki) zamurowujemy; to, do czego prowadzą drzwi zewnętrzne
  // (np. jedyna izdebka małego budynku), zostaje
  const atDoor = new Set<number>();
  for (const t of outer)
    for (let d = 0; d < 4; d++) {
      const n = nb(size, t, d);
      if (n >= 0 && roomOf[n] >= 0) atDoor.add(roomOf[n]);
    }
  list.forEach((r, k) => {
    if (!atDoor.has(k) && floorCount(ctx, r) <= 2) wallUp(ctx, R, r);
  });
  return R;
}

function floorCount(ctx: Ctx, r: RoomInfo): number {
  let n = 0;
  for (const t of r.tiles) if (ctx.cell[t] === IN.FLOOR) n++;
  return n;
}

function wallUp(ctx: Ctx, R: Rooms, r: RoomInfo): void {
  for (const t of r.tiles) {
    ctx.cell[t] = IN.WALL;
    R.roomOf[t] = -1;
  }
  r.gone = true;
}

/** pierwszeństwo drzwi z osiągniętego pomieszczenia n do nieosiągniętego r (mniej znaczy lepiej) */
function prio(r: RoomInfo, n: RoomInfo): number {
  // budynek bez mieszkań: wszystko z sali albo hali
  if (n.kind === 'sala' || n.kind === 'hala') return 0;
  if (r.apt >= 0 && r.apt === n.apt) {
    if (n.kind === 'przedpokoj') return r.kind === 'lazienka' ? 1 : 0;
    if (n.kind === 'lazienka') return 6;
    // pokój przechodni, łazienka z kuchni
    return r.kind === 'lazienka' ? 3 : 2;
  }
  if (n.kind === 'klatka') {
    if (r.kind === 'klatka') return 1;
    if (r.entry) return 0;
    return r.kind === 'lazienka' ? 8 : 5;
  }
  if (r.kind === 'klatka') return 7;
  return 9;
}

function connectRooms(ctx: Ctx, R: Rooms, outer: number[]): void {
  const { size, cell } = ctx;
  const { roomOf, list } = R;
  const reached = new Uint8Array(list.length);
  for (const t of outer) {
    let hit = false;
    for (let d = 0; d < 4; d++) {
      const n = nb(size, t, d);
      if (n >= 0 && cell[n] === IN.FLOOR && roomOf[n] >= 0) {
        reached[roomOf[n]] = 1;
        hit = true;
      }
    }
    // drzwi w murze (np. w narożniku): przedsionek przez ścianę do posadzki na wprost
    for (let d = 0; d < 4 && !hit; d++) {
      const n = nb(size, t, d);
      const m = n >= 0 ? nb(size, n, d) : -1;
      if (m < 0 || ctx.bid[n] !== ctx.id || cell[n] !== IN.WALL || isEdge(ctx, n)) continue;
      if (cell[m] !== IN.FLOOR || roomOf[m] < 0) continue;
      cell[n] = IN.FLOOR;
      roomOf[n] = roomOf[m];
      list[roomOf[m]].tiles.push(n);
      reached[roomOf[m]] = 1;
      hit = true;
    }
  }
  for (;;) {
    doorsBetween(ctx, R, reached);
    if (list.every((r, k) => r.gone || reached[k])) return;
    if (cornerLink(ctx, R, reached)) continue;
    if (outerDoor(ctx, R, reached, outer)) continue;
    for (let k = 0; k < list.length; k++) if (!list[k].gone && !reached[k]) wallUp(ctx, R, list[k]);
    return;
  }
}

const solid = (c: number) => c === IN.WALL || c === IN.STAIRS;

/** drzwi zachłannie: zawsze to połączenie osiągniętego z nieosiągniętym, które ma pierwszeństwo */
function doorsBetween(ctx: Ctx, R: Rooms, reached: Uint8Array): void {
  const { size, cell, b } = ctx;
  const { roomOf, list } = R;
  const M = list.length;
  // kandydaci: kafelek muru między dwiema posadzkami na wprost, z murem po bokach
  const pairs = new Map<number, number[]>();
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const s = y * size + x;
      if (cell[s] !== IN.WALL || ctx.bid[s] !== ctx.id || isEdge(ctx, s)) continue;
      for (const [p, q, a, c] of [
        [s - 1, s + 1, s - size, s + size],
        [s - size, s + size, s - 1, s + 1],
      ]) {
        if (cell[p] !== IN.FLOOR || cell[q] !== IN.FLOOR || !solid(cell[a]) || !solid(cell[c])) continue;
        const rp = roomOf[p];
        const rq = roomOf[q];
        if (rp < 0 || rq < 0 || rp === rq) continue;
        const key = Math.min(rp, rq) * M + Math.max(rp, rq);
        const list2 = pairs.get(key);
        if (list2) list2.push(s);
        else pairs.set(key, [s]);
      }
    }
  const nearDoor = (s: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (cell[s + dy * size + dx] === IN.DOOR) return true;
    return false;
  };
  for (;;) {
    let best = -1;
    let bestP = Number.POSITIVE_INFINITY;
    let bestR = -1;
    for (const key of pairs.keys()) {
      const a = Math.floor(key / M);
      const c = key % M;
      if (list[a].gone || list[c].gone || reached[a] === reached[c]) continue;
      const r = reached[a] ? c : a;
      const n = reached[a] ? a : c;
      const p = (prio(list[r], list[n]) * M + r) * M + n;
      if (p < bestP) {
        bestP = p;
        best = key;
        bestR = r;
      }
    }
    if (best < 0) return;
    const tiles = pairs.get(best) ?? [];
    const free = tiles.filter((s) => !nearDoor(s));
    const pool = free.length ? free : tiles;
    const mid = (pool.length - 1) >> 1;
    const s = pool[clamp(mid + (pool.length >= 3 ? Math.floor(ctx.rnd() * 3) - 1 : 0), 0, pool.length - 1)];
    cell[s] = IN.DOOR;
    pairs.delete(best);
    reached[bestR] = 1;
  }
}

/** bez prostych drzwi: mała resztka łączy się z osiągniętym sąsiadem przez narożnik muru, większa dostaje tam drzwi */
function cornerLink(ctx: Ctx, R: Rooms, reached: Uint8Array): boolean {
  const { size, cell } = ctx;
  const { roomOf, list } = R;
  for (let k = 0; k < list.length; k++) {
    const r = list[k];
    if (r.gone || reached[k]) continue;
    let wall = -1;
    let to = -1;
    let bestP = Number.POSITIVE_INFINITY;
    for (const t of r.tiles) {
      if (cell[t] !== IN.FLOOR) continue;
      for (let d = 0; d < 4; d++) {
        const w = nb(size, t, d);
        if (w < 0 || cell[w] !== IN.WALL || ctx.bid[w] !== ctx.id || isEdge(ctx, w)) continue;
        for (let e = 0; e < 4; e++) {
          const m = nb(size, w, e);
          const n = m >= 0 && cell[m] === IN.FLOOR ? roomOf[m] : -1;
          if (n < 0 || n === k || !reached[n]) continue;
          const p = prio(r, list[n]);
          if (p < bestP) {
            bestP = p;
            wall = w;
            to = n;
          }
        }
      }
    }
    if (wall < 0) continue;
    if (floorCount(ctx, r) <= 6) {
      cell[wall] = IN.FLOOR;
      roomOf[wall] = to;
      list[to].tiles.push(wall);
      for (const t of r.tiles) roomOf[t] = to;
      list[to].tiles.push(...r.tiles);
      r.gone = true;
    } else {
      cell[wall] = IN.DOOR;
      reached[k] = 1;
    }
    return true;
  }
  return false;
}

/** ostatnia deska ratunku przed zamurowaniem: drzwi na zewnątrz, jeśli przed ścianą jest wolny teren */
function outerDoor(ctx: Ctx, R: Rooms, reached: Uint8Array, outer: number[]): boolean {
  const { size, cell } = ctx;
  const { list } = R;
  for (let k = 0; k < list.length; k++) {
    const r = list[k];
    if (r.gone || reached[k]) continue;
    for (const t of r.tiles) {
      if (cell[t] !== IN.FLOOR) continue;
      for (let d = 0; d < 4; d++) {
        const w = nb(size, t, d);
        const o = w >= 0 ? nb(size, w, d) : -1;
        if (o < 0 || cell[w] !== IN.WALL || !outside(ctx, o)) continue;
        cell[w] = IN.DOOR;
        outer.push(w);
        reached[k] = 1;
        return true;
      }
    }
  }
  return false;
}

/** numeracja pomieszczeń bez dziur (id = indeks) i mieszkań w kolejności pomieszczeń */
function compact(ctx: Ctx, R: Rooms): { rooms: Room[]; room: Int16Array } {
  const room = new Int16Array(ctx.size * ctx.size).fill(-1);
  const rooms: Room[] = [];
  const aptMap = new Map<number, number>();
  for (const r of R.list) {
    if (r.gone) continue;
    const id = rooms.length;
    let apt = -1;
    if (r.apt >= 0) {
      if (!aptMap.has(r.apt)) aptMap.set(r.apt, aptMap.size);
      apt = aptMap.get(r.apt) ?? -1;
    }
    let area = 0;
    for (const t of r.tiles) {
      room[t] = id;
      if (ctx.cell[t] === IN.FLOOR) area++;
    }
    rooms.push({ id, kind: r.kind, apt, area });
  }
  return { rooms, room };
}

/* ---------- okna ---------- */

/** okna w ścianach zewnętrznych pomieszczeń co 2–3 m (dla całego budynku tak samo), nie w narożnikach,
    nie przy drzwiach i nie w przedpokoju */
function placeWindows(ctx: Ctx, rooms: Room[], room: Int16Array): Uint8Array {
  const { size, cell, bid, id, b } = ctx;
  const win = new Uint8Array(size * size);
  const period = ctx.rnd() < 0.5 ? 2 : 3;
  // garaże są bez okien
  if (b.cls === 'garaz') return win;
  const cands: { o: number; line: number; along: number; r: number; t: number }[] = [];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const s = y * size + x;
      if (bid[s] !== id || cell[s] !== IN.WALL) continue;
      let o = -1;
      let outs = 0;
      let door = false;
      for (let d = 0; d < 4; d++) {
        const n = nb(size, s, d);
        if (n < 0 || bid[n] !== id) {
          outs++;
          o = d;
        } else if (cell[n] === IN.DOOR) door = true;
      }
      if (outs !== 1 || door) continue;
      const inner = nb(size, s, (o + 2) % 4);
      const r = inner >= 0 ? room[inner] : -1;
      if (r < 0 || rooms[r].kind === 'przedpokoj') continue;
      cands.push({ o, line: o % 2 === 0 ? y : x, along: o % 2 === 0 ? x : y, r, t: s });
    }
  cands.sort((p, q) => p.o - q.o || p.line - q.line || p.r - q.r || p.along - q.along);
  const put = (run: typeof cands) => {
    const n = run.length;
    if (n <= 2) {
      win[run[n === 2 && ctx.rnd() < 0.5 ? 1 : 0].t] = 1;
      return;
    }
    const ks: number[] = [];
    for (let k = 1; k <= n - 2; k += period) ks.push(k);
    const shift = (n - 2 - ks[ks.length - 1]) >> 1;
    for (const k of ks) win[run[k + shift].t] = 1;
  };
  let run: typeof cands = [];
  for (const c of cands) {
    const last = run[run.length - 1];
    if (last && (last.o !== c.o || last.line !== c.line || last.r !== c.r || last.along + 1 !== c.along)) {
      put(run);
      run = [];
    }
    run.push(c);
  }
  if (run.length) put(run);
  return win;
}

/* ---------- meble ---------- */

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: Rot;
}

interface FCtx {
  size: number;
  cell: Uint8Array;
  room: Int16Array;
  win: Uint8Array;
  /** kafelek tuż przy drzwiach: tu nie stawiamy mebli (poza krzesłami) */
  nearDoor: Uint8Array;
  /** 0 wolne, 1 mebel, 2 krzesło, 3 zarezerwowane (skład drewna, miejsce przed kozą) */
  occ: Uint8Array;
  itemAt: Int32Array;
  touched: number[];
  /** kafelki posadzki pomieszczeń */
  tiles: number[][];
  doorsOf: number[][];
  done: Uint8Array;
  items: Furniture[];
  sklad: number[];
  rnd: Rng;
  stamp: Uint32Array;
  gen: number;
}

/** przesunięcie do sąsiada za plecami mebla stojącego przy ścianie rot */
const back = (F: FCtx, rot: Rot) => [-F.size, 1, F.size, -1][rot];

function furnish(ctx: Ctx, rooms: Room[], room: Int16Array, win: Uint8Array) {
  const { size, cell, bid, id, b } = ctx;
  const N = size * size;
  const F: FCtx = {
    size,
    cell,
    room,
    win,
    nearDoor: new Uint8Array(N),
    occ: new Uint8Array(N),
    itemAt: new Int32Array(N).fill(-1),
    touched: [],
    tiles: rooms.map(() => []),
    doorsOf: rooms.map(() => []),
    done: new Uint8Array(rooms.length),
    items: [],
    sklad: [],
    rnd: ctx.rnd,
    stamp: new Uint32Array(N),
    gen: 0,
  };
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const s = y * size + x;
      if (bid[s] !== id) continue;
      if (cell[s] === IN.FLOOR && room[s] >= 0) F.tiles[room[s]].push(s);
      if (cell[s] !== IN.DOOR) continue;
      for (let d = 0; d < 4; d++) {
        const n = nb(size, s, d);
        if (n < 0) continue;
        F.nearDoor[n] = 1;
        if (cell[n] === IN.FLOOR && room[n] >= 0 && !F.doorsOf[room[n]].includes(s)) F.doorsOf[room[n]].push(s);
      }
    }
  // mieszkanie zarządu: najbliżej pierwszych drzwi frontowych (przez wnętrze), przy remisie większe
  const dist = new Int32Array(N).fill(-1);
  const start = b.entrances[0]?.tile ?? -1;
  if (start >= 0) {
    const q = [start];
    dist[start] = 0;
    for (let k = 0; k < q.length; k++)
      for (let d = 0; d < 4; d++) {
        const n = nb(size, q[k], d);
        if (n < 0 || dist[n] >= 0 || bid[n] !== id || (cell[n] !== IN.FLOOR && cell[n] !== IN.DOOR)) continue;
        dist[n] = dist[q[k]] + 1;
        q.push(n);
      }
  }
  const aptRooms: number[][] = [];
  for (const r of rooms) if (r.apt >= 0) (aptRooms[r.apt] ??= []).push(r.id);
  const aptDist = aptRooms.map((ids) => {
    let m = Number.POSITIVE_INFINITY;
    for (const r of ids) for (const t of F.tiles[r]) if (dist[t] >= 0) m = Math.min(m, dist[t]);
    return m;
  });
  const aptArea = aptRooms.map((ids) => ids.reduce((s, r) => s + rooms[r].area, 0));
  const order = aptRooms.map((_, a) => a).sort((p, q) => aptDist[p] - aptDist[q] || aptArea[q] - aptArea[p] || p - q);
  let home = -1;
  for (const relaxed of ctx.home ? [false, true] : []) {
    for (const a of order) {
      const m = snapshot(F);
      const done = furnishHome(F, rooms, aptRooms[a], relaxed);
      if (done) {
        home = a;
        for (const r of done) F.done[r] = 1;
        break;
      }
      undo(F, m);
    }
    if (home >= 0) break;
  }
  // nie ma gdzie postawić kozy: zarząd i tak mieszka najbliżej drzwi
  if (ctx.home && home < 0) home = order[0] ?? -1;
  // reszta mieszkań: z losowością z ziarna
  for (const r of rooms) {
    if (F.done[r.id]) continue;
    F.done[r.id] = 1;
    if (r.kind === 'kuchnia') kitchenItems(F, r.id, 2 + Math.floor(F.rnd() * 2));
    else if (r.kind === 'lazienka') {
      // wanna tylko w mieszkaniu; toaleta w sklepie czy szkole bez niej
      if (r.apt >= 0) placeWall(F, r.id, 'wanna');
      if (F.rnd() < 0.85) placeWall(F, r.id, 'sedes');
      if (F.rnd() < 0.85) placeWall(F, r.id, 'umywalka');
    } else if (r.kind === 'pokoj') {
      const area = F.tiles[r.id].length;
      if (area >= 10 && F.rnd() < 0.5) placeWall(F, r.id, 'wersalka');
      placeWall(F, r.id, 'lozko');
      if (area >= 14) placeWall(F, r.id, 'lozko');
      if (area >= 12 && F.rnd() < 0.7) placeWall(F, r.id, 'mebloscianka');
    }
  }
  return { items: F.items, sklad: F.sklad, home };
}

/** mieszkanie zarządu: koza przy oknie ze składem drewna, kuchnia, co najmniej trzy miejsca do spania
    (najlepiej cztery). relaxed: koza w dowolnym pomieszczeniu z oknem. Zwraca umeblowane pomieszczenia
    albo null, gdy się nie da. */
function furnishHome(F: FCtx, rooms: Room[], ids: number[], relaxed: boolean): number[] | null {
  const byArea = (p: number, q: number) => F.tiles[q].length - F.tiles[p].length || p - q;
  let kitchen = -1;
  for (const k of ids.filter((r) => relaxed || rooms[r].kind === 'kuchnia').sort(byArea))
    if (placeKoza(F, k)) {
      kitchen = k;
      break;
    }
  if (kitchen < 0) return null;
  // najpierw stół (zarząd je przy kozie), martwa kuchenka i lodówka, jeśli zostanie miejsce
  if (rooms[kitchen].kind === 'kuchnia') {
    placeTable(F, kitchen, 4);
    placeWall(F, kitchen, 'kuchenka');
    placeWall(F, kitchen, 'lodowka');
  }
  const pokoje = ids.filter((r) => rooms[r].kind === 'pokoj').sort(byArea);
  let sleep = 0;
  for (const kind of ['wersalka', 'lozko', 'lozko', 'lozko'] as const)
    for (const p of pokoje) if (sleep < 4 && placeWall(F, p, kind)) sleep++;
  // zapas: spanie przy kozie albo w przedpokoju
  for (const r of [kitchen, ...ids.filter((k) => rooms[k].kind === 'przedpokoj')])
    for (const kind of ['lozko', 'wersalka'] as const) if (sleep < 3 && placeWall(F, r, kind)) sleep++;
  for (const p of pokoje) placeWall(F, p, 'mebloscianka');
  return sleep >= 3 ? [kitchen, ...pokoje] : null;
}

function kitchenItems(F: FCtx, r: number, chairs: number): void {
  placeWall(F, r, 'kuchenka');
  placeWall(F, r, 'lodowka');
  placeTable(F, r, chairs);
}

function snapshot(F: FCtx) {
  return { items: F.items.length, touched: F.touched.length, sklad: F.sklad.length };
}

function undo(F: FCtx, m: ReturnType<typeof snapshot>): void {
  for (let k = F.touched.length - 1; k >= m.touched; k--) {
    const t = F.touched[k];
    F.occ[t] = 0;
    F.itemAt[t] = -1;
  }
  F.touched.length = m.touched;
  F.items.length = m.items;
  F.sklad.length = m.sklad;
}

/** mebel mieści się: posadzka tego pomieszczenia, wolna, nie tuż przy drzwiach */
function fits(F: FCtx, r: number, x: number, y: number, w: number, h: number): boolean {
  if (x < 0 || y < 0 || x + w > F.size || y + h > F.size) return false;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const t = (y + dy) * F.size + x + dx;
      if (F.room[t] !== r || F.cell[t] !== IN.FLOOR || F.occ[t] || F.nearDoor[t]) return false;
    }
  return true;
}

/** plecami do muru (nie do drzwi); noWindow: nie zasłania okna */
function backed(F: FCtx, s: Spot, noWindow: boolean): boolean {
  const n = s.rot % 2 ? s.h : s.w;
  for (let k = 0; k < n; k++) {
    const t =
      s.rot === 0
        ? (s.y - 1) * F.size + s.x + k
        : s.rot === 1
          ? (s.y + k) * F.size + s.x + s.w
          : s.rot === 2
            ? (s.y + s.h) * F.size + s.x + k
            : (s.y + k) * F.size + s.x - 1;
    if (F.cell[t] !== IN.WALL || (noWindow && F.win[t])) return false;
  }
  return true;
}

/** pomieszczenie bez mebli blokujących (krzesła, skład i miejsce przy kozie się nie liczą) zostaje spójne */
function connected(F: FCtx, r: number): boolean {
  let start = -1;
  let free = 0;
  for (const t of F.tiles[r])
    if (F.occ[t] !== 1) {
      free++;
      if (start < 0) start = t;
    }
  if (start < 0) return false;
  const gen = ++F.gen;
  F.stamp[start] = gen;
  const q = [start];
  for (let k = 0; k < q.length; k++)
    for (let d = 0; d < 4; d++) {
      const n = nb(F.size, q[k], d);
      if (n < 0 || F.stamp[n] === gen || F.room[n] !== r || F.cell[n] !== IN.FLOOR || F.occ[n] === 1) continue;
      F.stamp[n] = gen;
      q.push(n);
    }
  return q.length === free;
}

function mark(F: FCtx, t: number, v: number, item: number): void {
  F.occ[t] = v;
  F.itemAt[t] = item;
  F.touched.push(t);
}

function place(F: FCtx, r: number, kind: FurnitureKind, s: Spot): boolean {
  const m = snapshot(F);
  const item = F.items.length;
  F.items.push({ kind, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot });
  for (let dy = 0; dy < s.h; dy++)
    for (let dx = 0; dx < s.w; dx++) mark(F, (s.y + dy) * F.size + s.x + dx, kind === 'krzeslo' ? 2 : 1, item);
  if (kind !== 'krzeslo' && !connected(F, r)) {
    undo(F, m);
    return false;
  }
  return true;
}

function wallSpots(F: FCtx, r: number, kind: FurnitureKind): Spot[] {
  const [bw, bd] = FURNITURE_SIZE[kind];
  const noWindow = kind === 'mebloscianka' || kind === 'lodowka';
  const out: Spot[] = [];
  for (const rot of ROTS) {
    const w = rot % 2 ? bd : bw;
    const h = rot % 2 ? bw : bd;
    for (const t of F.tiles[r]) {
      const x = t % F.size;
      const y = (t - x) / F.size;
      const s = { x, y, w, h, rot };
      if (fits(F, r, x, y, w, h) && backed(F, s, noWindow)) out.push(s);
    }
  }
  return out;
}

/** najmniejsza odległość (w kafelkach) mebla od drzwi pomieszczenia */
function doorDist(F: FCtx, r: number, s: Spot): number {
  let m = 6;
  for (const d of F.doorsOf[r]) {
    const dx = d % F.size;
    const dy = (d - dx) / F.size;
    m = Math.min(m, Math.max(0, s.x - dx, dx - (s.x + s.w - 1)) + Math.max(0, s.y - dy, dy - (s.y + s.h - 1)));
  }
  return m;
}

/** mur przy bokach mebla (narożnik): 0–2 */
function corner(F: FCtx, s: Spot): number {
  const { size, cell } = F;
  const ends =
    s.rot % 2 === 0
      ? [s.y + (s.rot === 0 ? 0 : s.h - 1)].flatMap((y) => [y * size + s.x - 1, y * size + s.x + s.w])
      : [s.x + (s.rot === 3 ? 0 : s.w - 1)].flatMap((x) => [(s.y - 1) * size + x, (s.y + s.h) * size + x]);
  return ends.filter((t) => cell[t] === IN.WALL).length;
}

/** mebel danego rodzaju stoi tuż obok */
function nextTo(F: FCtx, s: Spot, kind: FurnitureKind): number {
  for (let dy = -1; dy <= s.h; dy++)
    for (let dx = -1; dx <= s.w; dx++) {
      if ((dy === -1 || dy === s.h) === (dx === -1 || dx === s.w)) continue; // tylko boki, bez rogów i środka
      const it = F.itemAt[(s.y + dy) * F.size + s.x + dx];
      if (it >= 0 && F.items[it].kind === kind) return 1;
    }
  return 0;
}

function scoreOf(F: FCtx, r: number, kind: FurnitureKind, s: Spot): number {
  const dd = doorDist(F, r, s);
  const c = corner(F, s);
  switch (kind) {
    case 'lozko':
    case 'wersalka':
      return dd + c * 0.7;
    case 'wanna':
      return c * 2 + dd * 0.5;
    case 'lodowka':
      return nextTo(F, s, 'kuchenka') * 3 + c;
    case 'kuchenka':
      return nextTo(F, s, 'lodowka') * 2 + nextTo(F, s, 'koza') + c * 0.5;
    case 'sedes':
    case 'umywalka':
      return nextTo(F, s, 'wanna') + c * 0.5;
    default:
      return dd * 0.3 + c * 0.3;
  }
}

/** najlepsze miejsce według oceny (z odrobiną losowości z ziarna), które nie przecina pomieszczenia */
function pick(F: FCtx, r: number, kind: FurnitureKind, spots: Spot[], score: (s: Spot) => number): Spot | null {
  const scored = spots.map((s) => ({ s, v: score(s) + F.rnd() * 0.8 }));
  scored.sort((p, q) => q.v - p.v || p.s.y - q.s.y || p.s.x - q.s.x || p.s.rot - q.s.rot);
  for (const { s } of scored) if (place(F, r, kind, s)) return s;
  return null;
}

function placeWall(F: FCtx, r: number, kind: FurnitureKind): Spot | null {
  return pick(F, r, kind, wallSpots(F, r, kind), (s) => scoreOf(F, r, kind, s));
}

/** wolne kafelki wokół stołu na krzesła, z kierunkiem oparcia */
function chairSpots(F: FCtx, r: number, s: Spot): Spot[] {
  const out: Spot[] = [];
  for (let dy = 0; dy < s.h; dy++)
    for (let dx = 0; dx < s.w; dx++)
      for (const rot of ROTS) {
        const t = (s.y + dy) * F.size + s.x + dx + back(F, rot);
        const x = t % F.size;
        const y = (t - x) / F.size;
        if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) continue;
        if (F.room[t] !== r || F.cell[t] !== IN.FLOOR || F.occ[t]) continue;
        out.push({ x, y, w: 1, h: 1, rot });
      }
  return out;
}

function placeTable(F: FCtx, r: number, chairs: number): void {
  const [bw, bd] = FURNITURE_SIZE.stol;
  const spots = wallSpots(F, r, 'stol');
  // także wolnostojący, poziomo
  for (const t of F.tiles[r]) {
    const x = t % F.size;
    const y = (t - x) / F.size;
    if (fits(F, r, x, y, bw, bd)) spots.push({ x, y, w: bw, h: bd, rot: 0 });
  }
  const need = Math.min(2, chairs);
  const ok = spots.filter((s) => chairSpots(F, r, s).length >= need);
  const table = pick(F, r, 'stol', ok, (s) => Math.min(chairs, chairSpots(F, r, s).length) + doorDist(F, r, s) * 0.2);
  if (!table) return;
  const long = table.w >= table.h ? [0, 2] : [1, 3];
  const cs = chairSpots(F, r, table)
    .map((s) => ({ s, v: (long.includes(s.rot) ? 1 : 0) - F.nearDoor[s.y * F.size + s.x] * 2 + F.rnd() * 0.5 }))
    .sort((p, q) => q.v - p.v || p.s.y - q.s.y || p.s.x - q.s.x);
  let n = 0;
  for (const { s } of cs) if (n < chairs && place(F, r, 'krzeslo', s)) n++;
}

/** koza tuż przy oknie (rura przez okno), przed nią wolne miejsce, obok 2–3 kafelki składu drewna */
function placeKoza(F: FCtx, r: number): boolean {
  const { size } = F;
  const cands: { t: number; rot: Rot; front: number; sk: number[]; v: number }[] = [];
  for (const t of F.tiles[r]) {
    if (F.occ[t] || F.nearDoor[t]) continue;
    for (const rot of ROTS) {
      if (!F.win[t + back(F, rot)]) continue;
      const front = t - back(F, rot);
      if (F.room[front] !== r || F.cell[front] !== IN.FLOOR || F.occ[front]) continue;
      const sk = skladAround(F, r, t, rot, front);
      if (sk.length < 2) continue;
      const x = t % size;
      cands.push({
        t,
        rot,
        front,
        sk,
        v: sk.length + doorDist(F, r, { x, y: (t - x) / size, w: 1, h: 1, rot }) * 0.3 + F.rnd() * 0.5,
      });
    }
  }
  cands.sort((p, q) => q.v - p.v || p.t - q.t || p.rot - q.rot);
  for (const c of cands) {
    const x = c.t % size;
    if (!place(F, r, 'koza', { x, y: (c.t - x) / size, w: 1, h: 1, rot: c.rot })) continue;
    // zarezerwowane kafelki są przechodnie, więc spójności nie psują
    for (const s of [c.front, ...c.sk]) mark(F, s, 3, -1);
    F.sklad.push(...c.sk);
    return true;
  }
  return false;
}

/** skład drewna (2 kafelki, w większej kuchni 3): najpierw wzdłuż ściany obok kozy, potem po skosie
    przed nią, potem do 2 m */
function skladAround(F: FCtx, r: number, t: number, rot: Rot, front: number): number[] {
  const { size } = F;
  const want = F.tiles[r].length >= 16 ? 3 : 2;
  const side = rot % 2 === 0 ? 1 : size;
  const cand = [t - side, t + side, front - side, front + side];
  const x = t % size;
  const y = (t - x) / size;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) cand.push(ny * size + nx);
    }
  const out: number[] = [];
  for (const s of cand) {
    if (out.length === want) break;
    if (s === t || s === front || out.includes(s)) continue;
    if (F.room[s] !== r || F.cell[s] !== IN.FLOOR || F.occ[s] || F.nearDoor[s]) continue;
    out.push(s);
  }
  return out;
}
