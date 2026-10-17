/* Dziurawa siatka z bramą wokół siedziby i podwórka (M1, pierwsza noc za siatką).
   Podwórko to prostokąt przed pierwszym wejściem siedziby obejmujący suche drzewo z trzepakiem;
   mały budynek (dom) jest w nim cały, z pasem 3 m wokół. Z prostokąta bierzemy wolne kafelki osiągalne
   od drzwi, bez jezdni i bez kafelków tuż przy niej. Siatka stoi na wolnych kafelkach tuż za podwórkiem:
   tych stykających się z nim bokiem (to one zamykają obwód, bo pionek bez ścinania narożników przechodzi
   tylko bokiem) i po skosie (domykają rogi, żeby linia siatki była ciągła). Budynki, drzewa i woda
   domykają obwód same. Tylne drzwi siedziby, do których da się przejść z podwórka przez wnętrze, też
   dostają siatkę. Brama 2 m w prostym odcinku siatki od strony ulicy albo chodnika, jak najbliżej
   pierwszych drzwi; 2–4 dziury rozrzucone z dala od bramy. Deterministycznie z ziarna świata. */

import { mulberry } from '../core/rng.ts';
import { labelRegions } from '../sim/path.ts';
import { IN } from './interior.ts';
import { T } from './terrain.ts';
import type { Dir, World } from './world.ts';

export interface Gate {
  /** lewy górny kafelek bramy */
  x: number;
  y: number;
  /** 2×1 (rot 0 i 2) albo 1×2 (rot 1 i 3) */
  w: number;
  h: number;
  /** strona otwierania skrzydeł, czyli w stronę podwórka: 0 północ, 1 wschód, 2 południe, 3 zachód */
  rot: 0 | 1 | 2 | 3;
}

export interface Fence {
  /** kafelki siatki bez bramy, rosnąco */
  tiles: number[];
  /** kafelki z dziurą na starcie (podzbiór tiles), rosnąco */
  hole: number[];
  gate: Gate;
  /** kafelki podwórka za siatką bez budynków (z pniem suchego drzewa i słupkami trzepaka), rosnąco */
  yard: number[];
}

/** z czego powstaje siatka: świat po wnętrzu siedziby, suchym drzewie i trzepaku */
export type FenceWorld = Pick<
  World,
  'size' | 'terr' | 'bid' | 'blocked' | 'buildings' | 'hq' | 'interior' | 'trees' | 'dryTree' | 'props' | 'seed'
>;

type Rot = 0 | 1 | 2 | 3;
/** krok w stronę rot: 0 północ, 1 wschód, 2 południe, 3 zachód */
const STEP: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const OUT: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const PAVED = new Set<number>([T.ROAD, T.SIDEWALK, T.PATH, T.PARKING]);
/** budynek o dłuższym boku do tylu metrów stoi za siatką cały */
const SMALL = 24;

/** Nakłada siatkę na świat: siatka blokuje, dziury i brama nie (otwieranie bramy trzyma symulacja). */
export function applyFence(w: Pick<World, 'blocked'>, f: Fence): void {
  for (const t of f.tiles) w.blocked[t] = 1;
  for (const t of f.hole) w.blocked[t] = 0;
}

export function buildFence(w: FenceWorld): Fence {
  const { size, terr, bid, blocked, hq } = w;
  const N = size * size;
  const b = w.buildings[hq];
  const door = b.entrances[0];
  if (!door) return { tiles: [], hole: [], gate: { x: -1, y: -1, w: 0, h: 0, rot: 0 }, yard: [] };
  const rnd = mulberry(((w.seed * 31337) ^ 0xfe9ce) >>> 0);
  const xy = (i: number): [number, number] => [i % size, Math.floor(i / size)];
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1);
  const [ddx, ddy] = xy(door.tile);
  const [fx, fy] = OUT[door.dir];
  const ns = fx === 0;
  /** układ drzwi: u wzdłuż fasady, v na zewnątrz (0 to rząd drzwi) */
  const uv = (x: number, y: number): [number, number] => [ns ? x - ddx : y - ddy, (x - ddx) * fx + (y - ddy) * fy];

  // 1. prostokąt podwórka: przed drzwiami, z suchym drzewem i trzepakiem (z zapasem 2 m), mały budynek cały
  let u0 = -6;
  let u1 = 6;
  let v0 = -2;
  let v1 = 8;
  const need = (x: number, y: number, m: number) => {
    const [u, v] = uv(x, y);
    u0 = Math.min(u0, u - m);
    u1 = Math.max(u1, u + m);
    v0 = Math.min(v0, v - m);
    v1 = Math.max(v1, v + m);
  };
  const tree = w.trees[w.dryTree];
  if (tree) need(Math.floor(tree.x), Math.floor(tree.y), 2);
  // tylko trzepak: sterty leżą już w gotowym podwórku i nie mogą go powiększać
  for (const p of w.props) {
    if (p.kind !== 'trzepak') continue;
    need(p.x, p.y, 2);
    need(p.x + p.w - 1, p.y + p.h - 1, 2);
  }
  if (Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1 <= SMALL) {
    need(b.x0, b.y0, 3);
    need(b.x1, b.y1, 3);
  }
  // na wprost drzwi do pierwszego chodnika albo jezdni (najwyżej 20 m): brama ma wychodzić na ulicę
  for (let v = 1; v <= 20; v++) {
    const t = at(ddx + fx * v, ddy + fy * v);
    if (t < 0 || bid[t] >= 0 || terr[t] === T.WATER) break;
    if (PAVED.has(terr[t])) {
      v1 = Math.max(v1, v - 1);
      break;
    }
  }
  const xs = ns ? [ddx + u0, ddx + u1] : [ddx + v0 * fx, ddx + v1 * fx];
  const ys = ns ? [ddy + v0 * fy, ddy + v1 * fy] : [ddy + u0, ddy + u1];
  const X0 = Math.max(0, Math.min(...xs));
  const X1 = Math.min(size - 1, Math.max(...xs));
  const Y0 = Math.max(0, Math.min(...ys));
  const Y1 = Math.min(size - 1, Math.max(...ys));
  const inBox = (i: number) => {
    const [x, y] = xy(i);
    return x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
  };

  // 2. podwórko: wolne kafelki prostokąta osiągalne od wyjścia z drzwi, bez jezdni i kafelków przy niej
  const near4 = (i: number) => {
    const [x, y] = xy(i);
    return [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
  };
  const roadSide = (i: number) => terr[i] === T.ROAD || near4(i).some((n) => n >= 0 && terr[n] === T.ROAD);
  const free = (i: number) => i >= 0 && !blocked[i] && bid[i] < 0;
  const ok = (i: number) => free(i) && inBox(i) && !roadSide(i);
  const Y = new Uint8Array(N);
  let start = ok(door.out) ? door.out : -1;
  if (start < 0) {
    // drzwi tuż przy jezdni: podwórko zaczyna się od najbliższego dobrego kafelka
    const seen = new Set([door.out]);
    const q = [door.out];
    for (let k = 0; k < q.length && start < 0; k++)
      for (const n of near4(q[k])) {
        if (!free(n) || !inBox(n) || seen.has(n)) continue;
        seen.add(n);
        if (ok(n)) {
          start = n;
          break;
        }
        q.push(n);
      }
  }
  if (start < 0) return { tiles: [], hole: [], gate: { x: -1, y: -1, w: 0, h: 0, rot: 0 }, yard: [] };
  const yardList = [start];
  Y[start] = 1;
  for (let k = 0; k < yardList.length; k++)
    for (const n of near4(yardList[k]))
      if (n >= 0 && !Y[n] && ok(n)) {
        Y[n] = 1;
        yardList.push(n);
      }

  // wyjścia z drzwi innych budynków i innych klatek siedziby nie mogą trafić pod siatkę: dołączają do podwórka
  const outs = new Set<number>();
  for (const o of w.buildings) for (const e of o.entrances) outs.add(e.out);
  const around = (i: number) => {
    const [x, y] = xy(i);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push(at(x + dx, y + dy));
    return out;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (let k = 0; k < yardList.length; k++)
      for (const n of around(yardList[k]))
        if (n >= 0 && !Y[n] && outs.has(n) && free(n) && !roadSide(n)) {
          Y[n] = 1;
          yardList.push(n);
          grew = true;
        }
  }

  // 3. siatka: 1 zamyka obwód (styka się z podwórkiem bokiem), 2 domyka róg (styka się po skosie)
  const F = new Uint8Array(N);
  for (const t of yardList) {
    const [x, y] = xy(t);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = at(x + dx, y + dy);
        if (n < 0 || Y[n] || !free(n)) continue;
        if (dx === 0 || dy === 0) F[n] = 1;
        else if (!F[n] && terr[n] !== T.ROAD && !outs.has(n)) F[n] = 2;
      }
  }
  // tylne drzwi siedziby: z podwórka przez wnętrze do drzwi wychodzących poza podwórko, przed nimi też siatka
  const cell = w.interior.cell;
  const inside = new Uint8Array(N);
  const iq: number[] = [];
  for (const t of yardList)
    for (const n of near4(t))
      if (n >= 0 && bid[n] === hq && cell[n] === IN.DOOR && !inside[n]) {
        inside[n] = 1;
        iq.push(n);
      }
  for (let k = 0; k < iq.length; k++) {
    const c = iq[k];
    const edge = near4(c).some((n) => n < 0 || bid[n] !== hq);
    if (cell[c] === IN.DOOR && edge)
      for (const n of near4(c)) if (n >= 0 && free(n) && !Y[n] && terr[n] !== T.ROAD) F[n] = 1;
    for (const n of near4(c))
      if (n >= 0 && !inside[n] && bid[n] === hq && (cell[n] === IN.FLOOR || cell[n] === IN.DOOR)) {
        inside[n] = 1;
        iq.push(n);
      }
  }

  // 4. obszary przy zamkniętej siatce: reszta mapy to największy obszar
  const closed = blocked.slice();
  for (let i = 0; i < N; i++) if (F[i]) closed[i] = 1;
  const reg = labelRegions(closed, size);
  const counts = new Map<number, number>();
  for (const r of reg) if (r >= 0) counts.set(r, (counts.get(r) ?? 0) + 1);
  let main = -1;
  let mainN = 0;
  for (const [r, n] of counts)
    if (n > mainN && r !== reg[start]) {
      main = r;
      mainN = n;
    }
  const outside = (i: number) => i >= 0 && !closed[i] && reg[i] === main;
  const fenceTiles: number[] = [];
  for (let i = 0; i < N; i++) if (F[i]) fenceTiles.push(i);

  // 5. brama: dwa sąsiednie kafelki siatki w prostym odcinku, za nimi podwórko, przed nimi wyjście na resztę mapy;
  // najlepiej z chodnikiem albo jezdnią najwyżej 3 m dalej, przodem jak drzwi i jak najbliżej nich
  let gate: Gate | null = null;
  let gateTiles: number[] = [];
  let best = Number.NEGATIVE_INFINITY;
  for (const a of fenceTiles) {
    if (F[a] !== 1) continue;
    const [ax, ay] = xy(a);
    for (const horiz of [true, false]) {
      const bt = horiz ? at(ax + 1, ay) : at(ax, ay + 1);
      if (bt < 0 || F[bt] !== 1) continue;
      const before = horiz ? at(ax - 1, ay) : at(ax, ay - 1);
      const after = horiz ? at(ax + 2, ay) : at(ax, ay + 2);
      if (before < 0 || after < 0 || !closed[before] || !closed[after]) continue;
      for (const rot of (horiz ? [0, 2] : [1, 3]) as Rot[]) {
        const [rx, ry] = STEP[rot];
        const pair = [a, bt];
        if (!pair.every((t) => Y[at(xy(t)[0] + rx, xy(t)[1] + ry)] && outside(at(xy(t)[0] - rx, xy(t)[1] - ry))))
          continue;
        let paved = false;
        for (const t of pair)
          for (let k = 1; k <= 3 && !paved; k++) {
            const o = at(xy(t)[0] - rx * k, xy(t)[1] - ry * k);
            if (o >= 0 && PAVED.has(terr[o])) paved = true;
          }
        const [u, v] = uv(ax + (horiz ? 0.5 : 0), ay + (horiz ? 0 : 0.5));
        const facing = -rx * fx - ry * fy;
        const s =
          (paved ? 20 : 0) + (facing > 0 ? 5 : facing === 0 ? 2 : -10) + (v >= 1 ? 0 : -20) - Math.abs(u) / 2 - v / 10;
        if (s > best) {
          best = s;
          gate = { x: ax, y: ay, w: horiz ? 2 : 1, h: horiz ? 1 : 2, rot };
          gateTiles = pair;
        }
      }
    }
  }
  if (!gate) gate = { x: -1, y: -1, w: 0, h: 0, rot: 0 };

  // 6. dziury: kafelki siatki w prostym odcinku (podwórko z jednej strony, wyjście z drugiej),
  // co najmniej 4 m od bramy, rozrzucone: każda następna jak najdalej od bramy i od poprzednich
  const cheb = (p: number, q: number) => {
    const [px, py] = xy(p);
    const [qx, qy] = xy(q);
    return Math.max(Math.abs(px - qx), Math.abs(py - qy));
  };
  const cands: { t: number; j: number }[] = [];
  for (const t of fenceTiles) {
    if (F[t] !== 1 || gateTiles.includes(t) || gateTiles.some((g) => cheb(t, g) < 4)) continue;
    const [x, y] = xy(t);
    const through = STEP.some(([rx, ry], r) => {
      const [lx, ly] = STEP[(r + 1) % 4];
      return (
        Y[at(x + rx, y + ry)] && outside(at(x - rx, y - ry)) && closed[at(x + lx, y + ly)] && closed[at(x - lx, y - ly)]
      );
    });
    if (through) cands.push({ t, j: rnd() * 1.5 });
  }
  const want = 2 + Math.floor(rnd() * 3);
  const hole: number[] = [];
  while (hole.length < want) {
    let pick = -1;
    let far = Number.NEGATIVE_INFINITY;
    for (const c of cands) {
      if (hole.includes(c.t) || hole.some((h) => cheb(h, c.t) < 5)) continue;
      const d = Math.min(...[...gateTiles, ...hole].map((o) => cheb(o, c.t))) + c.j;
      if (d > far) {
        far = d;
        pick = c.t;
      }
    }
    if (pick < 0) break;
    hole.push(pick);
  }

  // 7. podwórko: wolne kafelki i zamknięte w nim przeszkody (pień suchego drzewa, słupki trzepaka)
  const yard = [...yardList];
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const i = y * size + x;
      if (Y[i] || F[i] || bid[i] >= 0 || !blocked[i]) continue;
      const nb = near4(i);
      if (nb.some((n) => n >= 0 && Y[n]) && !nb.some((n) => n >= 0 && free(n) && !Y[n] && !F[n])) yard.push(i);
    }
  yard.sort((p, q) => p - q);
  return {
    tiles: fenceTiles.filter((t) => !gateTiles.includes(t)),
    hole: hole.sort((p, q) => p - q),
    gate,
    yard,
  };
}
