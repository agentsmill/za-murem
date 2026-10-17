/* Sterty materiałów z odzysku na podwórku za siatką (M1): deski i złom na pierwsze łaty siatki,
   gruz do rozbierania później. Leżą przy siatce, z dala od bramy, dziur, drzwi, suchego drzewa
   i trzepaka, poza ścieżkami od drzwi do bramy i do drzewa. Są przechodnie jak rzeczy (blocked się
   nie zmienia), a rozłożone tak, że nawet gdyby blokowały, podwórko zostałoby w jednym kawałku.
   Deterministycznie z ziarna świata. */

import { mulberry } from '../core/rng.ts';
import { findPath } from '../sim/path.ts';
import type { World } from './world.ts';

export type HeapKind = 'gruz' | 'deski' | 'zlom';

/** sterta materiału 1×1 m; n to liczba sztuk */
export interface Heap {
  kind: HeapKind;
  x: number;
  y: number;
  w: 1;
  h: 1;
  n: number;
}

/** z czego powstają sterty: świat z siatką, podwórkiem, suchym drzewem i trzepakiem */
export type HeapWorld = Pick<
  World,
  'size' | 'bid' | 'blocked' | 'buildings' | 'hq' | 'trees' | 'dryTree' | 'props' | 'fence' | 'seed'
>;

export function placeHeaps(w: HeapWorld): Heap[] {
  const { size, bid, blocked, fence } = w;
  const N = size * size;
  const door = w.buildings[w.hq].entrances[0];
  if (!door || !fence.yard.length || fence.gate.w <= 0) return [];
  const rnd = mulberry(((w.seed * 7) ^ 0x5e17a) >>> 0);
  const xy = (i: number): [number, number] => [i % size, Math.floor(i / size)];
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1);

  // co leży: deski (4–5 sztuk) i złom (3–4) w jednej albo dwóch stertach, jedna albo dwie sterty gruzu
  // po 3–8 sztuk; deski i złom razem starczą na 2 łaty po 3–4 sztuki, nie na wszystkie dziury
  const want: { kind: HeapKind; n: number }[] = [];
  const split = (kind: HeapKind, total: number) => {
    if (total >= 4 && rnd() < 0.5) {
      const a = 1 + Math.floor(rnd() * (total - 1));
      want.push({ kind, n: a }, { kind, n: total - a });
    } else want.push({ kind, n: total });
  };
  split('deski', 4 + Math.floor(rnd() * 2));
  split('zlom', 3 + Math.floor(rnd() * 2));
  const rubble = 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < rubble; k++) want.push({ kind: 'gruz', n: 3 + Math.floor(rnd() * 6) });

  // gdzie nie wolno: 2 m wokół bramy, 1 m wokół dziur, drzwi, suchego drzewa i trzepaka
  const ban = new Uint8Array(N);
  const keepOff = (t: number, r: number) => {
    const [x, y] = xy(t);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const n = at(x + dx, y + dy);
        if (n >= 0) ban[n] = 1;
      }
  };
  const gate: number[] = [];
  for (let y = fence.gate.y; y < fence.gate.y + fence.gate.h; y++)
    for (let x = fence.gate.x; x < fence.gate.x + fence.gate.w; x++) gate.push(y * size + x);
  for (const t of gate) keepOff(t, 2);
  for (const t of fence.hole) keepOff(t, 1);
  for (const b of w.buildings) for (const e of b.entrances) keepOff(e.out, 1);
  for (const p of w.props)
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) keepOff(y * size + x, 1);
  const tree = w.trees[w.dryTree];
  const trunk = tree ? Math.floor(tree.y) * size + Math.floor(tree.x) : -1;
  if (trunk >= 0) keepOff(trunk, 1);

  // ścieżki od drzwi do bramy i do suchego drzewa (2) z pasem po bokach (1)
  const yard = new Uint8Array(N);
  for (const t of fence.yard) yard[t] = 1;
  const lane = new Uint8Array(N);
  const n4 = (t: number) => {
    const [x, y] = xy(t);
    return [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
  };
  const treeSide = trunk >= 0 ? n4(trunk).find((k) => k >= 0 && yard[k] && !blocked[k]) : undefined;
  for (const target of [gate[0], treeSide]) {
    if (target === undefined) continue;
    const route = findPath(blocked, size, door.out, target);
    for (const t of [door.out, ...(route ?? [])]) {
      lane[t] = 2;
      for (const n of n4(t)) if (n >= 0 && !lane[n]) lane[n] = 1;
    }
  }

  // podwórko w jednym kawałku: ile wolnych kafelków osiąga się od drzwi, gdy sterty by blokowały
  const reach = (heaps: Set<number>) => {
    const seen = new Uint8Array(N);
    const q = [door.out];
    seen[door.out] = 1;
    for (let k = 0; k < q.length; k++)
      for (const n of n4(q[k]))
        if (n >= 0 && !seen[n] && yard[n] && !blocked[n] && !heaps.has(n)) {
          seen[n] = 1;
          q.push(n);
        }
    return { count: q.length, seen };
  };
  const base = reach(new Set());

  // przy siatce lepiej (bokiem bardziej niż po skosie), przy ścianie budynku trochę lepiej
  const fenceAt = new Uint8Array(N);
  for (const t of fence.tiles) fenceAt[t] = 1;
  const score = new Map<number, number>();
  for (const t of fence.yard) {
    if (!base.seen[t] || ban[t] || blocked[t]) continue;
    const [x, y] = xy(t);
    let s = rnd();
    let side = 0;
    let diag = 0;
    let wall = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = at(x + dx, y + dy);
        if (n < 0 || (!dx && !dy)) continue;
        if (fenceAt[n]) {
          if (dx && dy) diag++;
          else side++;
        } else if (bid[n] >= 0 && !(dx && dy)) wall++;
      }
    s += side ? 2 : diag ? 1 : 0;
    s += wall ? 0.5 : 0;
    score.set(t, s);
  }

  const out: Heap[] = [];
  const taken = new Set<number>();
  for (const strict of [true, false]) {
    for (const item of want.slice(out.length)) {
      const cands = [...score.keys()]
        .filter((t) => lane[t] < (strict ? 1 : 2) && ![...taken].some((h) => cheb(size, h, t) < 2))
        .sort((p, q) => (score.get(q) ?? 0) - (score.get(p) ?? 0) || p - q);
      let placed = false;
      for (const t of cands) {
        taken.add(t);
        if (reach(taken).count === base.count - taken.size) {
          const [x, y] = xy(t);
          out.push({ kind: item.kind, x, y, w: 1, h: 1, n: item.n });
          placed = true;
          break;
        }
        taken.delete(t);
      }
      if (!placed) break;
    }
    if (out.length === want.length) break;
  }
  return out;
}

function cheb(size: number, a: number, b: number): number {
  return Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
}
