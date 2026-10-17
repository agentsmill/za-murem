/* Atrapa wnętrza siedziby do testów symulacji, zgodna z kontraktem src/world/interior.ts, który
   równolegle pisze sesja wnętrza. Sztuczny świat z jednym budynkiem i ulicą, a na nim wnętrze z rysunku,
   nałożone tak, jak zrobi to generator: ściany i schody blokują, posadzki, drzwi i meble nie.
   Dwa różne układy (blok z klatką i dom bez klatki), żeby logika symulacji nie zależała od jednego kształtu.
   Po połączeniu gałęzi koordynator podmieni atrapę na prawdziwe wnętrze. */

import type { HouseLike, PropLike, RoomKind } from '../../src/sim/house.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

/** kody komórek z kontraktu; symulacja ich nie czyta, korzysta z blocked, room, doors i sklad */
export const IN = { NONE: 0, WALL: 1, DOOR: 2, STAIRS: 3, FLOOR: 4 } as const;

/** świat z atrapą; przed połączeniem World nie ma tych pól, po nim ma je z typami z interior.ts */
export type MockWorld = World & { interior: HouseLike; dryTree: number; props: PropLike[] };

interface Layout {
  /** rysunek od lewego górnego rogu siedziby: # ściana, W ściana z oknem, D drzwi, S schody, litera: pomieszczenie */
  rows: string[];
  /** litery pomieszczeń w kolejności numerów */
  rooms: Record<string, { kind: RoomKind; apt: number }>;
  /** meble i skład w kafelkach względem lewego górnego rogu siedziby */
  furniture: { kind: string; x: number; y: number; w: number; h: number; rot: number }[];
  sklad: [number, number][];
  home: number;
}

/** blok 48 × 13 m: klatka przy pierwszym wejściu, po prawej mieszkanie zarządu, po lewej obce */
const BLOCK: Layout = {
  rows: [
    `####W############W${'#'.repeat(30)}`,
    `#QQQQQQQQ#SSS#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#QQQQQQQQ#SSS#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK###D########${'#'.repeat(23)}`,
    `#QQQQQQQQDKKKDHHHHHHHHHH#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK#HHHHHHHHHH#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK##D#####D###${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK#CCCCCC#LLL#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK#CCCCCC#LLL#${'#'.repeat(23)}`,
    `#QQQQQQQQ#KKK#CCCCCC#LLL#${'#'.repeat(23)}`,
    `###########D###W${'#'.repeat(32)}`,
  ],
  rooms: {
    K: { kind: 'klatka', apt: -1 },
    P: { kind: 'pokoj', apt: 0 },
    H: { kind: 'przedpokoj', apt: 0 },
    C: { kind: 'kuchnia', apt: 0 },
    L: { kind: 'lazienka', apt: 0 },
    Q: { kind: 'pokoj', apt: 1 },
  },
  furniture: [
    { kind: 'koza', x: 15, y: 11, w: 1, h: 1, rot: 2 },
    { kind: 'stol', x: 17, y: 9, w: 2, h: 1, rot: 0 },
    { kind: 'krzeslo', x: 16, y: 9, w: 1, h: 1, rot: 0 },
    { kind: 'krzeslo', x: 19, y: 9, w: 1, h: 1, rot: 0 },
    { kind: 'kuchenka', x: 18, y: 11, w: 1, h: 1, rot: 2 },
    { kind: 'lodowka', x: 19, y: 11, w: 1, h: 1, rot: 2 },
    { kind: 'lozko', x: 14, y: 1, w: 1, h: 2, rot: 0 },
    { kind: 'lozko', x: 16, y: 1, w: 1, h: 2, rot: 0 },
    { kind: 'lozko', x: 18, y: 1, w: 1, h: 2, rot: 0 },
    { kind: 'wersalka', x: 21, y: 1, w: 2, h: 1, rot: 0 },
    { kind: 'mebloscianka', x: 23, y: 3, w: 1, h: 2, rot: 1 },
    { kind: 'wanna', x: 22, y: 9, w: 1, h: 2, rot: 1 },
    { kind: 'lozko', x: 2, y: 1, w: 1, h: 2, rot: 0 },
  ],
  sklad: [
    [16, 11],
    [17, 11],
  ],
  home: 0,
};

/** dom 11 × 10 m bez klatki: kuchnia z kozą przy północnej ścianie, daleko od drzwi frontowych */
const HOUSE: Layout = {
  rows: [
    '########W##',
    '#PPP#CCCCC#',
    '#PPP#CCCCC#',
    '#PPP#CCCCC#',
    '#PPP##D####',
    '#PPPDHHH#L#',
    '#PPP#HHHDL#',
    '#PPP#HHH#L#',
    '#PPP#HHH#L#',
    '#####D#####',
  ],
  rooms: {
    H: { kind: 'przedpokoj', apt: 0 },
    C: { kind: 'kuchnia', apt: 0 },
    P: { kind: 'pokoj', apt: 0 },
    L: { kind: 'lazienka', apt: 0 },
  },
  furniture: [
    { kind: 'koza', x: 8, y: 1, w: 1, h: 1, rot: 0 },
    { kind: 'kuchenka', x: 5, y: 1, w: 1, h: 1, rot: 0 },
    { kind: 'lodowka', x: 5, y: 2, w: 1, h: 1, rot: 3 },
    { kind: 'stol', x: 8, y: 3, w: 2, h: 1, rot: 2 },
    { kind: 'krzeslo', x: 7, y: 3, w: 1, h: 1, rot: 2 },
    { kind: 'krzeslo', x: 9, y: 2, w: 1, h: 1, rot: 0 },
    { kind: 'lozko', x: 1, y: 1, w: 1, h: 2, rot: 3 },
    { kind: 'lozko', x: 3, y: 1, w: 1, h: 2, rot: 1 },
    { kind: 'lozko', x: 3, y: 7, w: 1, h: 2, rot: 1 },
    { kind: 'wersalka', x: 1, y: 7, w: 2, h: 1, rot: 2 },
    { kind: 'wanna', x: 9, y: 7, w: 1, h: 2, rot: 1 },
  ],
  sklad: [
    [7, 1],
    [9, 1],
  ],
  home: 0,
};

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
const geoWith = (b: Pt[], kind: string, levels: string): Geo => ({
  c: [0, 0],
  b: [{ p: b, t: { building: kind, 'building:levels': levels } }],
  r: [
    {
      l: [
        [-80, 12],
        [80, 12],
      ],
      h: 'residential',
    },
  ],
  a: [],
  w: [],
  poi: [],
});

/** wnętrze z rysunku nałożone na siedzibę, jak zrobi to generator */
function overlay(w: World, L: Layout): MockWorld {
  const size = w.size;
  const hq = w.buildings[w.hq];
  const N = size * size;
  const cell = new Uint8Array(N);
  const room = new Int16Array(N).fill(-1);
  const blocked = w.blocked.slice();
  const keys = Object.keys(L.rooms);
  const rooms = keys.map((ch, id) => ({ id, kind: L.rooms[ch].kind, apt: L.rooms[ch].apt, area: 0 }));
  const doors: number[] = [];
  const windows: number[] = [];
  for (let i = 0; i < N; i++) if (w.bid[i] === w.hq) cell[i] = IN.WALL;
  L.rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const i = (hq.y0 + dy) * size + hq.x0 + dx;
      if (w.bid[i] !== w.hq) throw new Error(`atrapa: kafelek ${dx},${dy} poza siedzibą`);
      if (ch === '#' || ch === 'W') {
        cell[i] = IN.WALL;
        if (ch === 'W') windows.push(i);
      } else if (ch === 'D') {
        cell[i] = IN.DOOR;
        doors.push(i);
      } else if (ch === 'S') {
        cell[i] = IN.STAIRS;
        room[i] = keys.indexOf('K');
      } else {
        const id = keys.indexOf(ch);
        if (id < 0) throw new Error(`atrapa: nieznane pomieszczenie ${ch}`);
        cell[i] = IN.FLOOR;
        room[i] = id;
        rooms[id].area++;
      }
    });
  });
  for (let i = 0; i < N; i++) if (w.bid[i] === w.hq) blocked[i] = cell[i] === IN.WALL || cell[i] === IN.STAIRS ? 1 : 0;
  if (cell[hq.entrances[0].tile] !== IN.DOOR) throw new Error('atrapa: drzwi frontowe nie trafiły w wejście');
  const at = (x: number, y: number) => (hq.y0 + y) * size + hq.x0 + x;
  const furniture = L.furniture.map((f) => ({ ...f, x: hq.x0 + f.x, y: hq.y0 + f.y }));
  const sklad = L.sklad.map(([x, y]) => at(x, y));
  const dryTree = pickDryTree(w, blocked, hq.entrances[0].out);
  const t = w.trees[dryTree];
  const props: PropLike[] = [{ kind: 'trzepak', x: Math.floor(t.x) + 2, y: Math.floor(t.y), w: 3, h: 1 }];
  const interior: HouseLike = {
    building: w.hq,
    cell,
    room,
    rooms,
    doors,
    windows,
    furniture,
    sklad,
    home: L.home,
  };
  // dubel testowy: kształt z kontraktu bez typów z interior.ts, których przed połączeniem nie ma
  return { ...w, blocked, interior, dryTree, props } as unknown as MockWorld;
}

/** suche drzewo: najbliższe drzwiom (po drodze) drzewo, nie krzak, z koroną od 2 m */
function pickDryTree(w: World, blocked: Uint8Array, from: number): number {
  const size = w.size;
  const dist = new Int32Array(size * size).fill(-1);
  const q = [from];
  dist[from] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    const x = c % size;
    for (const n of [x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1, c - size, c + size]) {
      if (n < 0 || n >= size * size || blocked[n] || dist[n] >= 0) continue;
      dist[n] = dist[c] + 1;
      q.push(n);
    }
  }
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    if (t.kind === 2 || t.r < 2) return;
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = dist[y * size + x];
        if (d >= 0 && d < bd) {
          bd = d;
          best = k;
        }
      }
  });
  if (best < 0) throw new Error('atrapa: brak drzewa w zasięgu');
  return best;
}

/** ten sam sztuczny świat z blokiem, ale bez wnętrza, jak przed M1: budynek cały zablokowany.
    Po połączeniu z gałęzią wnętrza buildWorld zawsze je dodaje, więc tu jest zdejmowane jawnie. */
export function plainBlock(seed = 5): World {
  const w = buildWorld(geoWith(rect(-24, -6, 48, 13), 'apartments', '5'), { seed, size: 128 });
  const blocked = w.blocked.slice();
  for (let i = 0; i < blocked.length; i++) if (w.bid[i] >= 0) blocked[i] = 1;
  return { ...w, blocked, interior: null, dryTree: -1, props: [] } as unknown as World;
}

/** sztuczny świat z blokiem i ulicą oraz atrapą wnętrza */
export function mockBlock(seed = 5): MockWorld {
  return overlay(plainBlock(seed), BLOCK);
}

/** sztuczny świat z domem i ulicą oraz atrapą wnętrza */
export function mockHouse(seed = 7): MockWorld {
  return overlay(buildWorld(geoWith(rect(-5, -4, 11, 10), 'house', '2'), { seed, size: 96 }), HOUSE);
}

/** kafelek pnia drzewa (tam klika gracz) */
export const trunkTile = (w: World, k: number): number => Math.floor(w.trees[k].y) * w.size + Math.floor(w.trees[k].x);
