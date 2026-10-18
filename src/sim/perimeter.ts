/* Siatka wokół siedziby i podwórka w stanie gry: wytrzymałość kafelków siatki, dziury ze startu i łaty,
   brama otwarta albo zamknięta. Kształt siatki (kafelki, dziury, brama, podwórko) daje świat (World.fence,
   src/world/fence.ts); symulacja trzyma tylko to, co się zmienia w grze. */

import { mulberry } from '../core/rng.ts';
import type { World } from '../world/world.ts';
import type { GameMode } from './tryb.ts';

export interface Hole {
  /** numer dziury od 1, do poleceń i dla zarządu (warta 'd<id>') */
  id: number;
  /** kafelki dziury (podzbiór World.fence.hole), rosnąco */
  tiles: number[];
  /** wielkość 0–1: większą łatwiej przejść (dla zarządu) */
  size: number;
  /** wytrzymałość łaty 0–100; 0: dziura otwarta */
  patch: number;
}

export interface FenceState {
  /** wytrzymałość kafelków siatki 0–100 w kolejności World.fence.tiles (dziury 0) */
  hp: number[];
  holes: Hole[];
  gateOpen: boolean;
  /** tryb zombie: siatka wzmocniona deskami na start (rysowanie) */
  reinforced?: boolean;
}

/** wzmocniona siatka i łata w trybie zombie */
export const REINFORCED_HP = 100;

/** świeża łata z desek albo złomu */
export const PATCH_HP = 70;

/** kształt siatki ze świata albo null, gdy świat jej nie ma */
export function fenceShape(w: World): World['fence'] | null {
  const f = (w as { fence?: World['fence'] }).fence;
  return f?.tiles.length ? f : null;
}

/** kafelki bramy */
export function gateTiles(w: World): number[] {
  const f = fenceShape(w);
  if (!f || f.gate.w <= 0) return [];
  const out: number[] = [];
  for (let y = f.gate.y; y < f.gate.y + f.gate.h; y++)
    for (let x = f.gate.x; x < f.gate.x + f.gate.w; x++) out.push(y * w.size + x);
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Stan siatki na start: stara siatka 45–75 (odcinki po 4 kafelki różnią się między sobą), dziury z kontraktu
    pogrupowane w sąsiadujące kafelki, brama otwarta. W trybie zombie siatka jest wzmocniona: każdy kafelek 100,
    dziury załatane na 100, brama zamknięta. Deterministycznie z ziarna świata. */
export function initFence(w: World, mode: GameMode = 'zwykly'): FenceState | null {
  const f = fenceShape(w);
  if (!f) return null;
  const size = w.size;
  const rnd = mulberry(((w.seed * 7349) ^ 0xf3c3) >>> 0);
  const holeSet = new Set(f.hole);
  let cur = 60;
  const hp = f.tiles.map((t, k) => {
    if (k % 4 === 0) cur = 45 + Math.round(rnd() * 30);
    return holeSet.has(t) ? 0 : cur;
  });
  const holes: Hole[] = [];
  const left = new Set(f.hole);
  for (const start of f.hole) {
    if (!left.has(start)) continue;
    left.delete(start);
    const tiles = [start];
    for (let qi = 0; qi < tiles.length; qi++) {
      const x = tiles[qi] % size;
      const y = Math.floor(tiles[qi] / size);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = (y + dy) * size + x + dx;
          if (left.has(n)) {
            left.delete(n);
            tiles.push(n);
          }
        }
    }
    tiles.sort((a, b) => a - b);
    const size01 = Math.min(1, round2(0.45 + 0.2 * (tiles.length - 1) + 0.15 * rnd()));
    holes.push({ id: holes.length + 1, tiles, size: size01, patch: 0 });
  }
  if (mode === 'zombie')
    return {
      hp: hp.map(() => REINFORCED_HP),
      holes: holes.map((h) => ({ ...h, patch: REINFORCED_HP })),
      gateOpen: false,
      reinforced: true,
    };
  return { hp, holes, gateOpen: true };
}

/** średnia wytrzymałość siatki 0–1: otwarta dziura 0, łata swoją wytrzymałością, reszta swoim odcinkiem */
export function durability(w: World, f: FenceState): number {
  const shape = fenceShape(w);
  if (!shape) return 1;
  const hole = new Map<number, Hole>();
  for (const h of f.holes) for (const t of h.tiles) hole.set(t, h);
  let s = 0;
  shape.tiles.forEach((t, k) => {
    const h = hole.get(t);
    s += h ? h.patch : f.hp[k];
  });
  return round2(s / shape.tiles.length / 100);
}

/** otwarta dziura na kafelku albo undefined */
export function holeAt(f: FenceState | null, tile: number): Hole | undefined {
  return f?.holes.find((h) => !h.patch && h.tiles.includes(tile));
}
