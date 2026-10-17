/* Wraki samochodów w okolicy siedziby (klimat postapo): maluchy i polonezy na parkingach z OSM i przy
   krawędzi jezdni, wzdłuż niej: całe na jezdni przy krawężniku albo pół na chodniku czy trawniku.
   Do około 100 m od pierwszych drzwi siedziby, poza siatką, z dala od bramy i od drzwi budynków.
   Podstawa blokuje przejście. Na jezdni zostaje co najmniej 3 m przejazdu, a wolne kafelki wokół wraku
   tworzą jeden ciągły pierścień, więc żaden wrak niczego nie odcina. Deterministycznie z ziarna świata. */

import { mulberry } from '../core/rng.ts';
import { T } from './terrain.ts';
import type { World } from './world.ts';

export type WreckModel = 'maluch' | 'polonez';

/** wrak auta; przy rot 0 i 2 leży wzdłuż osi x (maluch 3×2, polonez 4×2), przy 1 i 3 wzdłuż osi y */
export interface Wreck {
  kind: 'wrak';
  model: WreckModel;
  /** lewy górny kafelek podstawy */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: 0 | 1 | 2 | 3;
}

/** długość auta w metrach (szerokość zawsze 2) */
export const WRECK_LEN: Record<WreckModel, number> = { maluch: 3, polonez: 4 };

/** z czego powstają wraki: świat z siatką */
export type WreckWorld = Pick<World, 'size' | 'terr' | 'blocked' | 'buildings' | 'hq' | 'fence' | 'seed'>;

/** zasięg od pierwszych drzwi siedziby */
const RANGE = 100;
/** grunt przy jezdni, na który wrak może wjechać połową */
const SIDE = new Set<number>([T.SIDEWALK, T.GRASS, T.PARK, T.PATH]);
/** krok w stronę rot: 0 północ, 1 wschód, 2 południe, 3 zachód */
const STEP: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** czym ma być pas wzdłuż auta: jezdnią, wolną jezdnią, poboczem (chodnik, trawnik) albo nie jezdnią (krawężnik) */
type Lane = 'road' | 'open' | 'side' | 'curb';

interface Cand {
  x: number;
  y: number;
  horiz: boolean;
  model: WreckModel;
  park: boolean;
  s: number;
}

export function placeWrecks(w: WreckWorld): Wreck[] {
  const { size, terr, blocked, fence } = w;
  const N = size * size;
  const b = w.buildings[w.hq];
  const door = b.entrances[0];
  const ax = door ? (door.tile % size) + 0.5 : (b.x0 + b.x1 + 1) / 2;
  const ay = door ? Math.floor(door.tile / size) + 0.5 : (b.y0 + b.y1 + 1) / 2;
  const rnd = mulberry(((w.seed * 13) ^ 0xca75) >>> 0);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1);

  // gdzie nie wolno: podwórko i 1 m wokół siatki, 3 m przed bramą, 2 m przed drzwiami budynków
  // i wolny pas na wprost bramy i pierwszych drzwi siedziby (5 m szeroki, przez całą ulicę)
  const ban = new Uint8Array(N);
  const keepOff = (t: number, r: number) => {
    const x = t % size;
    const y = (t - x) / size;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const n = at(x + dx, y + dy);
        if (n >= 0) ban[n] = 1;
      }
  };
  const ahead = (t: number, ox: number, oy: number, depth: number) => {
    const x = t % size;
    const y = (t - x) / size;
    for (let k = 1; k <= depth; k++)
      for (let s = -2; s <= 2; s++) {
        const n = at(x + ox * k + oy * s, y + oy * k + ox * s);
        if (n >= 0) ban[n] = 1;
      }
  };
  for (const t of fence.yard) ban[t] = 1;
  for (const t of fence.tiles) keepOff(t, 1);
  const g = fence.gate;
  if (g.w > 0) {
    const [rx, ry] = STEP[g.rot];
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) {
        keepOff(y * size + x, 1);
        const o = at(x - rx, y - ry);
        if (o >= 0) keepOff(o, 3);
        ahead(y * size + x, -rx, -ry, 10);
      }
  }
  if (door) {
    const [ox, oy] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[door.dir] as [number, number];
    ahead(door.tile, ox, oy, 12);
  }
  for (const o of w.buildings) for (const e of o.entrances) keepOff(e.out, 2);

  // pas k wzdłuż auta (k = 0 i 1 to auto, reszta obok) cały: jezdnią, wolną jezdnią, poboczem albo nie jezdnią
  const laneAll = (x: number, y: number, horiz: boolean, L: number, k: number, kind: Lane, grid: Uint8Array) => {
    for (let s = 0; s < L; s++) {
      const tx = horiz ? x + s : x + k;
      const ty = horiz ? y + k : y + s;
      if (tx < 0 || ty < 0 || tx >= size || ty >= size) return false;
      const t = ty * size + tx;
      const road = terr[t] === T.ROAD;
      if (kind === 'road' ? !road : kind === 'open' ? !road || grid[t] : kind === 'side' ? !SIDE.has(terr[t]) : road)
        return false;
    }
    return true;
  };
  // przy jezdni: krawężnik z jednej strony auta, z drugiej 3 m wolnej jezdni
  const roadside = (x: number, y: number, horiz: boolean, L: number, grid: Uint8Array) => {
    const is = (k: number, kind: Lane) => laneAll(x, y, horiz, L, k, kind, grid);
    const pass = (first: number, step: number) =>
      is(first, 'open') && is(first + step, 'open') && is(first + 2 * step, 'open');
    // całe na jezdni przy krawężniku
    if (is(0, 'road') && is(1, 'road')) {
      if (is(-1, 'curb') && pass(2, 1)) return true;
      if (is(2, 'curb') && pass(-1, -1)) return true;
    }
    // pół na chodniku albo trawniku
    if (is(0, 'side') && is(1, 'road') && pass(2, 1)) return true;
    return is(1, 'side') && is(0, 'road') && pass(-1, -1);
  };

  // kandydaci: parking z OSM albo krawędź jezdni, w zasięgu, na wolnych dozwolonych kafelkach
  const cands: Cand[] = [];
  const X0 = Math.max(1, Math.floor(ax - RANGE));
  const X1 = Math.min(size - 2, Math.ceil(ax + RANGE));
  const Y0 = Math.max(1, Math.floor(ay - RANGE));
  const Y1 = Math.min(size - 2, Math.ceil(ay + RANGE));
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const t0 = y * size + x;
      if (blocked[t0] || ban[t0] || (terr[t0] !== T.ROAD && terr[t0] !== T.PARKING && !SIDE.has(terr[t0]))) continue;
      for (const horiz of [true, false]) {
        // przy jezdni któryś pas auta jest cały jezdnią, więc zaczyna się od jezdni; parking zaczyna się od parkingu
        const t1 = horiz ? t0 + size : t0 + 1;
        if (terr[t0] !== T.PARKING && terr[t0] !== T.ROAD && terr[t1] !== T.ROAD) continue;
        for (const model of ['maluch', 'polonez'] as const) {
          const L = WRECK_LEN[model];
          const fw = horiz ? L : 2;
          const fh = horiz ? 2 : L;
          if (x + fw > size - 1 || y + fh > size - 1) continue;
          const d = Math.hypot(x + fw / 2 - ax, y + fh / 2 - ay);
          if (d > RANGE) continue;
          let ok = true;
          let park = true;
          for (let dy = 0; dy < fh && ok; dy++)
            for (let dx = 0; dx < fw; dx++) {
              const t = t0 + dy * size + dx;
              if (blocked[t] || ban[t]) {
                ok = false;
                break;
              }
              if (terr[t] !== T.PARKING) park = false;
            }
          if (!ok || (!park && !roadside(x, y, horiz, L, blocked))) continue;
          cands.push({ x, y, horiz, model, park, s: -d / 25 + rnd() * 2 + (park ? 0.5 : 0) });
        }
      }
    }
  cands.sort((p, q) => q.s - p.s || p.y - q.y || p.x - q.x || Number(p.horiz) - Number(q.horiz));

  // stawianie: wolne miejsce z odstępem 1 m od innych wraków, wciąż 3 m przejazdu, pierścień wokół w jednym kawałku
  const occ = blocked.slice();
  const wreckAt = new Uint8Array(N);
  const ringOk = (x: number, y: number, fw: number, fh: number) => {
    const ring: number[] = [];
    for (let tx = x - 1; tx <= x + fw; tx++) ring.push(at(tx, y - 1));
    for (let ty = y; ty <= y + fh; ty++) ring.push(at(x + fw, ty));
    for (let tx = x + fw - 1; tx >= x - 1; tx--) ring.push(at(tx, y + fh));
    for (let ty = y + fh - 1; ty >= y; ty--) ring.push(at(x - 1, ty));
    const free = ring.map((t) => t >= 0 && !occ[t]);
    let arcs = 0;
    for (let k = 0; k < free.length; k++) if (free[k] && !free[(k + free.length - 1) % free.length]) arcs++;
    return free.every(Boolean) || arcs === 1;
  };
  const fits = (c: Cand) => {
    const L = WRECK_LEN[c.model];
    const fw = c.horiz ? L : 2;
    const fh = c.horiz ? 2 : L;
    for (let ty = c.y - 1; ty <= c.y + fh; ty++)
      for (let tx = c.x - 1; tx <= c.x + fw; tx++) {
        const t = at(tx, ty);
        const inside = tx >= c.x && tx < c.x + fw && ty >= c.y && ty < c.y + fh;
        if (inside ? t < 0 || occ[t] : t >= 0 && wreckAt[t]) return false;
      }
    if (!c.park && !roadside(c.x, c.y, c.horiz, L, occ)) return false;
    return ringOk(c.x, c.y, fw, fh);
  };
  const want = 4 + Math.floor(rnd() * 7);
  // na parkingu najwyżej 60%, reszta przy jezdni (chyba że przy jezdni nie ma miejsca)
  const parkCap = Math.ceil(want * 0.6);
  const out: Wreck[] = [];
  const used = new Set<Cand>();
  let parked = 0;
  for (const capped of [true, false])
    for (const c of cands) {
      if (out.length >= want) break;
      if (used.has(c) || (capped && c.park && parked >= parkCap) || !fits(c)) continue;
      used.add(c);
      const L = WRECK_LEN[c.model];
      const fw = c.horiz ? L : 2;
      const fh = c.horiz ? 2 : L;
      for (let dy = 0; dy < fh; dy++)
        for (let dx = 0; dx < fw; dx++) {
          const t = (c.y + dy) * size + c.x + dx;
          occ[t] = 1;
          wreckAt[t] = 1;
        }
      if (c.park) parked++;
      const flip = rnd() < 0.5;
      const rot = (c.horiz ? (flip ? 2 : 0) : flip ? 3 : 1) as Wreck['rot'];
      out.push({ kind: 'wrak', model: c.model, x: c.x, y: c.y, w: fw, h: fh, rot });
    }
  return out;
}
