/* Siatka z bramą wokół podwórka jako rzeczy w warstwie pionków (sprite'y z art/podworko.ts przez
   thingSprite). Dane według kontraktu siatki z docs/M1-wycinek.md (World.fence, tura 2); póki
   świat ich nie daje, atrapa do podglądu (?siatka=atrapa): prostokąt wokół siedziby, suchego
   drzewa i trzepaka, brama od strony pierwszego wejścia, trzy dziury. Czyste funkcje bez DOM. */

import type { World } from '../world/world.ts';
import type { FenceState } from './art/rzeczy.ts';
import { NB } from './art/wnetrze.ts';
import type { ThingLike } from './section.ts';

/** siatka według kontraktu: kafelki bez bramy, dziury na starcie, brama 2×1 albo 1×2, podwórko */
export interface FenceLike {
  tiles: number[];
  hole: number[];
  gate: { x: number; y: number; w: number; h: number; rot: number };
  yard: number[];
}

/**
 * Kafelki siatki i brama jako rzeczy do view.setThings. Maska kafelka to sąsiedzi N/E/S/W będący
 * siatką, bramą albo ścianą budynku; stan z state (ze stanu symulacji: łaty, nowe dziury), a bez
 * niego dziury ze startu. Słupki na prostych odcinkach co trzy kafelki, resztę stawia sprite.
 */
export function fenceThings(
  f: FenceLike,
  w: Pick<World, 'size' | 'bid'>,
  state?: (tile: number) => FenceState | undefined,
): ThingLike[] {
  const size = w.size;
  const fence = new Set(f.tiles);
  const gate = new Set<number>();
  for (let dy = 0; dy < f.gate.h; dy++)
    for (let dx = 0; dx < f.gate.w; dx++) gate.add((f.gate.y + dy) * size + f.gate.x + dx);
  const holes = new Set(f.hole);
  const joins = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    const j = y * size + x;
    return fence.has(j) || gate.has(j) || w.bid[j] >= 0;
  };
  const out: ThingLike[] = [];
  for (const i of f.tiles) {
    const x = i % size;
    const y = (i - x) / size;
    let mask = 0;
    if (joins(x, y - 1)) mask |= NB.N;
    if (joins(x + 1, y)) mask |= NB.E;
    if (joins(x, y + 1)) mask |= NB.S;
    if (joins(x - 1, y)) mask |= NB.W;
    const straight = mask === (NB.N | NB.S) || mask === (NB.E | NB.W);
    const st = state?.(i) ?? (holes.has(i) ? 'dziura' : 'cala');
    out.push({
      kind: 'siatka',
      x,
      y,
      w: 1,
      h: 1,
      rot: 0,
      spec: { kind: 'siatka', mask, state: st, post: straight ? (x + y) % 3 === 0 : undefined },
    });
  }
  const g = f.gate;
  const rot = (g.rot & 3) as 0 | 1 | 2 | 3;
  out.push({ kind: 'brama', x: g.x, y: g.y, w: g.w, h: g.h, rot, spec: { kind: 'brama', rot } });
  return out;
}

/**
 * Atrapa siatki do podglądu: prostokąt wokół siedziby, suchego drzewa i trzepaka z zapasem
 * dwóch metrów, bez kafelków budynków (tam siatka dochodzi do ściany), brama 2 m od strony
 * pierwszego wejścia, otwierana do środka, trzy dziury rozrzucone po obwodzie.
 */
export function mockFence(
  w: Pick<World, 'size' | 'bid' | 'buildings' | 'hq' | 'trees' | 'dryTree' | 'props'>,
): FenceLike {
  const size = w.size;
  const b = w.buildings[w.hq];
  let [x0, y0, x1, y1] = [b.x0, b.y0, b.x1, b.y1];
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, Math.floor(x));
    y0 = Math.min(y0, Math.floor(y));
    x1 = Math.max(x1, Math.floor(x));
    y1 = Math.max(y1, Math.floor(y));
  };
  if (w.dryTree >= 0) grow(w.trees[w.dryTree].x, w.trees[w.dryTree].y);
  for (const p of w.props) {
    grow(p.x, p.y);
    grow(p.x + p.w - 1, p.y + p.h - 1);
  }
  x0 = Math.max(1, x0 - 2);
  y0 = Math.max(1, y0 - 2);
  x1 = Math.min(size - 2, x1 + 2);
  y1 = Math.min(size - 2, y1 + 2);
  // obwód zgodnie z ruchem wskazówek zegara, bez budynków
  const ring: number[] = [];
  for (let x = x0; x <= x1; x++) ring.push(y0 * size + x);
  for (let y = y0 + 1; y <= y1; y++) ring.push(y * size + x1);
  for (let x = x1 - 1; x >= x0; x--) ring.push(y1 * size + x);
  for (let y = y1 - 1; y > y0; y--) ring.push(y * size + x0);
  const free = ring.filter((i) => w.bid[i] < 0);
  // brama: dwa kafelki obwodu najbliżej przed pierwszym wejściem, na prostym boku
  const e = b.entrances[0];
  const ex = e ? e.out % size : (x0 + x1) >> 1;
  const ey = e ? Math.floor(e.out / size) : y1;
  const side = (i: number) => {
    const x = i % size;
    const y = Math.floor(i / size);
    return y === y0 ? 'N' : y === y1 ? 'S' : x === x0 ? 'W' : 'E';
  };
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let k = 0; k + 1 < free.length; k++) {
    const a = free[k];
    const c = free[k + 1];
    const horiz = c === a + 1 || c === a - 1;
    const vert = c === a + size || c === a - size;
    if (!(horiz || vert) || side(a) !== side(c)) continue;
    const d = Math.abs((a % size) - ex) + Math.abs(Math.floor(a / size) - ey);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  if (best < 0) best = 0;
  const ga = free[best];
  const gb = free[best + 1];
  const gx = Math.min(ga % size, gb % size);
  const gy = Math.min(Math.floor(ga / size), Math.floor(gb / size));
  const horizontal = Math.floor(ga / size) === Math.floor(gb / size);
  // skrzydła otwierają się do środka podwórka
  const rot = { N: 2, S: 0, W: 1, E: 3 }[side(ga)] as number;
  const gate = { x: gx, y: gy, w: horizontal ? 2 : 1, h: horizontal ? 1 : 2, rot };
  const tiles = free.filter((i) => i !== ga && i !== gb).sort((p, q) => p - q);
  // trzy dziury po obwodzie, z dala od bramy
  const hole: number[] = [];
  const far = tiles.filter((i) => Math.abs((i % size) - gx) + Math.abs(Math.floor(i / size) - gy) > 6);
  for (let k = 1; k <= 3 && far.length; k++) hole.push(far[Math.floor((far.length * k) / 4)]);
  const yard: number[] = [];
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) if (w.bid[y * size + x] < 0) yard.push(y * size + x);
  return { tiles, hole: hole.sort((p, q) => p - q), gate, yard };
}
