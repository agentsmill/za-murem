/* Rysowanie stanu gry: z symulacji i świata powstają rzeczy, światła i stan siatki dla widoku.
   Rzeczy to st.things (meble, drewno, zapasy, pnie, koza z ogniem, garnek z posiłkiem na stole) plus
   ze świata trzepak, wraki, siatka i sterty materiału (te ze świata, dopóki symulacja ich nie przejmie).
   Światła dają koza z ogniem (we wnętrzu), okna pomieszczeń oświetlonych ogniem (sim.light, plama
   na ziemi za oknem), ognisko, lampy warty i latarnia w ręce wartownika. Stan siatki wynika z kopii
   blocked w symulacji, jak w kontrakcie siatki: łata na dziurze i zamknięta brama to blocked = 1,
   dziura to blocked = 0.
   Obcych (szabrownicy, wędrowcy) widać tylko w świetle. Czyste funkcje bez PixiJS. */

import type { World } from '../world/world.ts';
import type { FenceState } from './art/rzeczy.ts';
import type { Light } from './light.ts';
import { KOZA_POST, type PawnLike } from './poses.ts';
import { IN, type ThingLike } from './section.ts';
import type { FenceLike } from './yard.ts';

/** to, czego rysowanie potrzebuje z symulacji (Sim pasuje bez zmian) */
export interface GameLike {
  st: { things: readonly ThingLike[]; felled: readonly number[]; tick: number; pawns?: readonly PawnLike[] };
  w: World;
  /** światło pomieszczeń od ognia: 1 w pomieszczeniu z palącą się kozą, 0,5 przez drzwi */
  light: readonly number[];
  /** przechodniość w symulacji (siatka: łaty i zamknięta brama to 1, dziury 0) */
  blocked: Uint8Array;
}

/** rodzaje rzeczy, które daje stan gry; rzeczy tych rodzajów spoza gry (podgląd) się pomija */
export const GAME_KINDS: ReadonlySet<string> = new Set([
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
  'drewno',
  'jedzenie',
  'posilek',
  'pien',
  'trzepak',
  'siatka',
  'brama',
  'gruz',
  'deski',
  'zlom',
  'wrak',
]);

/** sterty materiału: ze świata (World.props), dopóki symulacja nie trzyma ich u siebie jako rzeczy */
export const HEAPS: ReadonlySet<string> = new Set(['gruz', 'deski', 'zlom']);

/**
 * Garnki z posiłkiem na stołach: table to dolna krawędź stołu, na którym stoi garnek, żeby rysował
 * się na blacie i po stole. Bez garnka zwraca tę samą listę (nic nie alokuje co klatkę).
 */
export function onTables(things: readonly ThingLike[]): readonly ThingLike[] {
  if (!things.some((t) => t.kind === 'posilek')) return things;
  const tables = things.filter((t) => t.kind === 'stol');
  return things.map((t) => {
    if (t.kind !== 'posilek') return t;
    const s = tables.find((q) => t.x >= q.x && t.x < q.x + q.w && t.y >= q.y && t.y < q.y + q.h);
    return s ? { ...t, table: s.y + s.h } : t;
  });
}

/** rodzaje pionków obcych: widać je tylko w świetle (symulacja doda je z siatką i nocą) */
export const STRANGERS: ReadonlySet<string> = new Set(['obcy', 'szabrownik', 'wedrowiec', 'zombie']);

const FIRE = 0xff8a30;
const LAMP = 0xffb060;
/** ciepłe światło ognia przez szybę */
const PANE = 0xffa850;

/** okno siedziby: pomieszczenie za nim i punkt na ziemi przed nim (metry), tam pada światło */
export interface WindowSpot {
  room: number;
  x: number;
  y: number;
}

/** okna wnętrza z pomieszczeniem za nimi i punktem 0,9 m przed szybą na zewnątrz */
export function windowSpots(w: Pick<World, 'size' | 'interior'>): WindowSpot[] {
  const int = w.interior;
  const size = w.size;
  const out: WindowSpot[] = [];
  for (const wi of int.windows) {
    const x = wi % size;
    const y = (wi - x) / size;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      const ox = x + dx;
      const oy = y + dy;
      const outside = ox < 0 || oy < 0 || ox >= size || oy >= size || int.cell[oy * size + ox] === IN.NONE;
      if (!outside) continue;
      const room = int.room[(y - dy) * size + x - dx];
      if (room >= 0) out.push({ room, x: x + 0.5 + dx * 0.9, y: y + 0.5 + dy * 0.9 });
      break;
    }
  }
  return out;
}

/**
 * Światła ze stanu gry: koza z ogniem (inside, świeci w pomieszczeniu), okna pomieszczeń
 * oświetlonych ogniem (plama za szybą, słabsza dla pomieszczeń oświetlonych tylko przez drzwi),
 * ognisko z ogniem, lampa i budka warty (zapalone, póki fuel nie spadnie do zera).
 */
export function gameLights(g: Pick<GameLike, 'st' | 'light'>, windows: readonly WindowSpot[]): Light[] {
  const out: Light[] = [];
  for (const t of g.st.things) {
    const fuel = t.fuel ?? 0;
    if (t.kind === 'koza' && fuel > 0)
      out.push({ x: t.x + 0.5, y: t.y + 0.5, r: 4, color: FIRE, strength: 1, flicker: 0.3, inside: true });
    else if (t.kind === 'ognisko' && fuel > 0)
      out.push({ x: t.x + 0.5, y: t.y + 0.6, r: 5.5, color: FIRE, strength: 1.1, flicker: 0.35 });
    else if ((t.kind === 'lampa' || t.kind === 'budka') && (t.fuel ?? 1) > 0)
      out.push({ x: t.x + 0.5, y: t.y + 0.6, r: 3, color: LAMP, strength: 0.75, flicker: 0.08 });
  }
  // latarnia wartownika na posterunku (brama, dziura): w ręce, z boku; czuwający przy kozie ma jej ogień
  for (const p of g.st.pawns ?? [])
    if (p.job?.t === 'guard' && p.job.phase === 1 && p.job.target !== KOZA_POST)
      out.push({ x: p.x + 0.25, y: p.y - 0.1, r: 3, color: LAMP, strength: 0.7, flicker: 0.1 });
  for (const s of windows) {
    const lv = g.light[s.room] ?? 0;
    if (lv > 0) out.push({ x: s.x, y: s.y, r: 2.5, color: PANE, strength: 0.55 * Math.min(1, lv), flicker: 0.12 });
  }
  return out;
}

/**
 * Kody stanu siatki z blocked symulacji: 0 cała, 1 dziura, 2 łata (dziura ze startu zablokowana),
 * a na końcu brama: 1 otwarta, 0 zamknięta. Do porównania między klatkami i do fenceThings.
 */
export function fenceCodes(f: FenceLike, blocked: Uint8Array, size: number): Uint8Array {
  const holes = new Set(f.hole);
  const out = new Uint8Array(f.tiles.length + 1);
  f.tiles.forEach((i, k) => {
    out[k] = blocked[i] === 0 ? 1 : holes.has(i) ? 2 : 0;
  });
  let open = 1;
  for (let dy = 0; dy < f.gate.h; dy++)
    for (let dx = 0; dx < f.gate.w; dx++) if (blocked[(f.gate.y + dy) * size + f.gate.x + dx]) open = 0;
  out[f.tiles.length] = open;
  return out;
}

const STATE: readonly FenceState[] = ['cala', 'dziura', 'lata'];

/** stan kafelka siatki z kodów fenceCodes (dla fenceThings) */
export function fenceStateFn(f: FenceLike, codes: Uint8Array): (tile: number) => FenceState {
  const at = new Map<number, FenceState>();
  f.tiles.forEach((i, k) => {
    at.set(i, STATE[codes[k]] ?? 'cala');
  });
  return (tile) => at.get(tile) ?? 'cala';
}

/** jak dobrze widać obcego: 1 w dzień albo w świetle, 0 w nocnej ciemności (lit: światło w jego miejscu) */
export function strangerVisibility(darkness: number, lit: number): number {
  return Math.max(0, Math.min(1, 1 - darkness + lit * 1.4));
}
