/* Atrapa wnętrza siedziby do podglądu przekroju (?wnetrze=atrapa), zanim rysowanie dostanie
   prawdziwy generator ze świata. Zgodna z kontraktem Interior: ściany na obrysie, drzwi
   w wejściach, od każdego wejścia klatka 3 m w głąb ze schodami na końcu, po bokach mieszkania
   z kuchnią od strony wejścia i pokojem w głębi, okna co trzy kafelki w ścianach zewnętrznych,
   meble w mieszkaniu zarządu. Służy tylko do oglądania rysowania, nie do gry. */

import type { World } from '../world/world.ts';
import { IN, type InteriorLike, type RoomKind, type ThingLike } from './section.ts';

const OUT: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const ROT_OF: Record<string, 0 | 1 | 2 | 3> = { '0,-1': 0, '1,0': 1, '0,1': 2, '-1,0': 3 };

export function mockInterior(w: World, bid: number): InteriorLike {
  const size = w.size;
  const b = w.buildings[bid];
  const cell = new Uint8Array(size * size);
  const room = new Int16Array(size * size).fill(-1);
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && w.bid[y * size + x] === bid;
  const id = (x: number, y: number) => y * size + x;
  // obrys: ściana, gdy któryś z ośmiu sąsiadów jest już poza budynkiem
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      if (!inB(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inB(x + dx, y + dy)) edge = true;
      cell[id(x, y)] = edge ? IN.WALL : IN.FLOOR;
    }
  const rooms: InteriorLike['rooms'] = [];
  const addRoom = (kind: RoomKind, apt: number) => {
    rooms.push({ id: rooms.length, kind, apt });
    return rooms.length - 1;
  };
  const doors: number[] = [];
  // klatki: od drzwi w głąb do przeciwległej ściany, 3 kafelki szerokości, ścianki po bokach
  let inward: [number, number] = [0, 1];
  for (const e of b.entrances) {
    const ex = e.tile % size;
    const ey = (e.tile - ex) / size;
    const [ox, oy] = OUT[e.dir];
    const [ix, iy] = [-ox, -oy];
    const [lx, ly] = [iy !== 0 ? 1 : 0, ix !== 0 ? 1 : 0];
    if (e === b.entrances[0]) inward = [ix, iy];
    cell[e.tile] = IN.DOOR;
    doors.push(e.tile);
    const r = addRoom('klatka', -1);
    let t = 1;
    for (; ; t++) {
      const cx = ex + ix * t;
      const cy = ey + iy * t;
      if (!inB(cx, cy) || cell[id(cx, cy)] !== IN.FLOOR) break;
      for (let s = -1; s <= 1; s++) {
        const x = cx + lx * s;
        const y = cy + ly * s;
        if (inB(x, y) && cell[id(x, y)] === IN.FLOOR) room[id(x, y)] = r;
      }
      for (const s of [-2, 2]) {
        const x = cx + lx * s;
        const y = cy + ly * s;
        if (inB(x, y) && cell[id(x, y)] === IN.FLOOR && room[id(x, y)] < 0) cell[id(x, y)] = IN.WALL;
      }
    }
    const depth = t - 1;
    if (depth >= 4)
      for (let tt = depth - 1; tt <= depth; tt++)
        for (let s = -1; s <= 1; s++) {
          const i = id(ex + ix * tt + lx * s, ey + iy * tt + ly * s);
          if (room[i] === r) cell[i] = IN.STAIRS;
        }
  }
  // mieszkania: spójne kawałki posadzki poza klatkami, dzielone ścianką na kuchnię i pokój
  const [ix, iy] = inward;
  const seen = new Uint8Array(size * size);
  const apts: { kitchen: number; pokoj: number; tiles: number[] }[] = [];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const start = id(x, y);
      if (cell[start] !== IN.FLOOR || room[start] >= 0 || seen[start]) continue;
      const tiles: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        tiles.push(i);
        for (const [dx, dy] of Object.values(OUT)) {
          const j = i + dy * size + dx;
          if (!seen[j] && cell[j] === IN.FLOOR && room[j] < 0) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      const depth = (i: number) => (i % size) * ix + Math.floor(i / size) * iy;
      const ds = tiles.map(depth);
      const lo = Math.min(...ds);
      const hi = Math.max(...ds);
      const apt = apts.length;
      if (hi - lo + 1 >= 6) {
        const mid = Math.floor((lo + hi) / 2);
        const kitchen = addRoom('kuchnia', apt);
        const pokoj = addRoom('pokoj', apt);
        const line = tiles.filter((i) => depth(i) === mid).sort((a, b) => a - b);
        for (const i of tiles) {
          const d = depth(i);
          if (d === mid) cell[i] = IN.WALL;
          else room[i] = d < mid ? kitchen : pokoj;
        }
        const door = line[line.length >> 1];
        cell[door] = IN.DOOR;
        doors.push(door);
        apts.push({ kitchen, pokoj, tiles });
      } else {
        const only = addRoom('pokoj', apt);
        for (const i of tiles) room[i] = only;
        apts.push({ kitchen: only, pokoj: only, tiles });
      }
    }
  // drzwi z klatki do kuchni: w ściance klatki, możliwie blisko wejścia
  for (const a of apts) {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < cell.length; i++) {
      if (cell[i] !== IN.WALL) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const p = i - dy * size - dx;
        const q = i + dy * size + dx;
        const k = room[p] >= 0 && rooms[room[p]].kind === 'klatka' && cell[p] === IN.FLOOR;
        const k2 = room[q] >= 0 && rooms[room[q]].kind === 'klatka' && cell[q] === IN.FLOOR;
        const mine = (j: number) => room[j] === a.kitchen && cell[j] === IN.FLOOR;
        if ((k && mine(q)) || (k2 && mine(p))) {
          const d = (i % size) * ix + Math.floor(i / size) * iy;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    }
    if (best >= 0) {
      cell[best] = IN.DOOR;
      doors.push(best);
    }
  }
  // okna: ściana zewnętrzna z jedną stroną na zewnątrz, od pomieszczenia, co trzy kafelki, nie przy drzwiach
  const windows: number[] = [];
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] !== IN.WALL) continue;
    const x = i % size;
    const y = (i - x) / size;
    const outs = Object.values(OUT).filter(([dx, dy]) => !inB(x + dx, y + dy));
    if (outs.length !== 1 || (x + y) % 3 !== 1) continue;
    const [dx, dy] = outs[0];
    const inner = id(x - dx, y - dy);
    if (cell[inner] !== IN.FLOOR || room[inner] < 0) continue;
    if (Object.values(OUT).some(([ax, ay]) => cell[id(x + ax, y + ay)] === IN.DOOR)) continue;
    windows.push(i);
  }
  doors.sort((p, q) => p - q);
  // meble w mieszkaniu zarządu: najbliższym pierwszego wejścia
  const e0 = b.entrances[0]?.tile ?? id(b.x0, b.y0);
  const dist = (i: number) =>
    Math.abs((i % size) - (e0 % size)) + Math.abs(Math.floor(i / size) - Math.floor(e0 / size));
  let home = -1;
  let hd = Number.POSITIVE_INFINITY;
  apts.forEach((a, k) => {
    const d = Math.min(...a.tiles.map(dist));
    if (d < hd) {
      hd = d;
      home = k;
    }
  });
  const furniture: ThingLike[] = [];
  const sklad: number[] = [];
  if (home >= 0) placeHome(apts[home], cell, room, windows, size, furniture, sklad);
  return { building: bid, cell, room, rooms, doors, windows, furniture, sklad, home };
}

function placeHome(
  a: { kitchen: number; pokoj: number },
  cell: Uint8Array,
  room: Int16Array,
  windows: number[],
  size: number,
  out: ThingLike[],
  sklad: number[],
) {
  const used = new Set<number>();
  const free = (i: number, r: number) => cell[i] === IN.FLOOR && room[i] === r && !used.has(i);
  const nearDoor = (i: number) => [1, -1, size, -size].some((d) => cell[i + d] === IN.DOOR);
  const tilesOf = (r: number) => {
    const t: number[] = [];
    for (let i = 0; i < room.length; i++) if (room[i] === r && cell[i] === IN.FLOOR) t.push(i);
    return t;
  };
  const put = (kind: string, x: number, y: number, w: number, h: number, rot: 0 | 1 | 2 | 3) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) used.add((y + dy) * size + x + dx);
    out.push({ kind, x, y, w, h, rot });
  };
  /** pierwsze miejsce w pomieszczeniu r na mebel w×h przy ścianie od strony rot (albo wolnostojący) */
  const place = (kind: string, r: number, w: number, h: number, rot: 0 | 1 | 2 | 3, wall: boolean) => {
    for (const i of tilesOf(r)) {
      const x = i % size;
      const y = (i - x) / size;
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++)
        for (let dx = 0; dx < w && ok; dx++) {
          const j = (y + dy) * size + x + dx;
          if (!free(j, r) || nearDoor(j)) ok = false;
        }
      if (!ok) continue;
      if (wall) {
        const side =
          rot === 0
            ? Array.from({ length: w }, (_, k) => (y - 1) * size + x + k)
            : rot === 2
              ? Array.from({ length: w }, (_, k) => (y + h) * size + x + k)
              : rot === 1
                ? Array.from({ length: h }, (_, k) => (y + k) * size + x + w)
                : Array.from({ length: h }, (_, k) => (y + k) * size + x - 1);
        if (!side.every((j) => cell[j] === IN.WALL)) continue;
      }
      put(kind, x, y, w, h, rot);
      return true;
    }
    return false;
  };
  // koza przy oknie kuchni, rura przez okno
  for (const wi of windows) {
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const k = wi + dy * size + dx;
      if (!free(k, a.kitchen) || nearDoor(k)) continue;
      const rot = ROT_OF[`${-dx},${-dy}`];
      put('koza', k % size, Math.floor(k / size), 1, 1, rot);
      // skład obok kozy wzdłuż ściany, miejsce przed kozą zostaje wolne
      for (const s of dx === 0 ? [k - 1, k + 1, k - 2, k + 2] : [k - size, k + size, k - 2 * size, k + 2 * size])
        if (sklad.length < 2 && free(s, a.kitchen) && !nearDoor(s)) sklad.push(s);
      for (const s of sklad) used.add(s);
      used.add(k + dy * size + dx); // przed kozą: tu się dokłada
      break;
    }
    if (out.length) break;
  }
  if (place('stol', a.kitchen, 2, 1, 0, false)) {
    const t = out[out.length - 1];
    if (free((t.y - 1) * size + t.x, a.kitchen)) put('krzeslo', t.x, t.y - 1, 1, 1, 0);
    if (free((t.y + 1) * size + t.x + 1, a.kitchen)) put('krzeslo', t.x + 1, t.y + 1, 1, 1, 2);
  }
  place('kuchenka', a.kitchen, 1, 1, 0, true);
  place('lozko', a.pokoj, 1, 2, 0, true);
  place('lozko', a.pokoj, 1, 2, 0, true);
  place('wersalka', a.pokoj, 2, 1, 2, true);
  place('mebloscianka', a.pokoj, 3, 1, 0, true);
}
