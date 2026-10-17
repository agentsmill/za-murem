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

/** Blok jak BLOCK, ale lewa część podzielona na trzy mieszkania (M2, fala 1): A (pokój, mieszkańcy), B i E (pokój
    z kuchnią, puste po splądrowaniu, okno w zachodniej ścianie), F (pokój, puste po zalaniu). Każde ma drzwi
    na klatkę. W pustych zepsute meble, śmieci i uszkodzenia (mockBlockM2). */
const BLOCK_M2: Layout = {
  rows: [
    `####W############W${'#'.repeat(30)}`,
    `#AAAAAAAA#SSS#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#AAAAAAAA#SSS#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#AAAAAAAADKKK#PPPPPPPPPP#${'#'.repeat(23)}`,
    `##########KKK#PPPPPPPPPP#${'#'.repeat(23)}`,
    `#BBBB#EEE#KKK###D########${'#'.repeat(23)}`,
    `WBBBBDEEEDKKKDHHHHHHHHHH#${'#'.repeat(23)}`,
    `#BBBB#EEE#KKK#HHHHHHHHHH#${'#'.repeat(23)}`,
    `##########KKK##D#####D###${'#'.repeat(23)}`,
    `#FFFFFFFF#KKK#CCCCCC#LLL#${'#'.repeat(23)}`,
    `#FFFFFFFFDKKK#CCCCCC#LLL#${'#'.repeat(23)}`,
    `#FFFFFFFF#KKK#CCCCCC#LLL#${'#'.repeat(23)}`,
    `###########D###W${'#'.repeat(32)}`,
  ],
  rooms: {
    K: { kind: 'klatka', apt: -1 },
    P: { kind: 'pokoj', apt: 0 },
    H: { kind: 'przedpokoj', apt: 0 },
    C: { kind: 'kuchnia', apt: 0 },
    L: { kind: 'lazienka', apt: 0 },
    A: { kind: 'pokoj', apt: 1 },
    B: { kind: 'pokoj', apt: 2 },
    E: { kind: 'kuchnia', apt: 2 },
    F: { kind: 'pokoj', apt: 3 },
  },
  furniture: [
    ...BLOCK.furniture.filter((f) => f.x > 12),
    { kind: 'lozko', x: 2, y: 1, w: 1, h: 2, rot: 0 },
    { kind: 'lozko', x: 4, y: 1, w: 1, h: 2, rot: 0 },
    { kind: 'stol', x: 6, y: 2, w: 2, h: 1, rot: 0 },
    { kind: 'lozko', x: 1, y: 5, w: 1, h: 2, rot: 3, broken: true } as Layout['furniture'][number],
    { kind: 'mebloscianka', x: 4, y: 5, w: 1, h: 2, rot: 1 },
    { kind: 'kuchenka', x: 6, y: 5, w: 1, h: 1, rot: 0 },
    { kind: 'lodowka', x: 7, y: 5, w: 1, h: 1, rot: 0 },
    { kind: 'stol', x: 7, y: 7, w: 2, h: 1, rot: 2, broken: true } as Layout['furniture'][number],
    { kind: 'lozko', x: 1, y: 9, w: 1, h: 2, rot: 3 },
    { kind: 'wersalka', x: 3, y: 9, w: 2, h: 1, rot: 0, broken: true } as Layout['furniture'][number],
    { kind: 'stol', x: 6, y: 10, w: 2, h: 1, rot: 2 },
  ],
  sklad: BLOCK.sklad,
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
  // suche drzewo, trzepak i siatka ze świata, gdy je ma; inaczej własne
  const own = w as unknown as { dryTree?: number; props?: PropLike[] };
  const dryTree =
    own.dryTree !== undefined && own.dryTree >= 0 ? own.dryTree : pickDryTree(w, blocked, hq.entrances[0].out);
  const t = w.trees[dryTree];
  // śmieci, stany mieszkań i uszkodzenia ze świata (M2) należą do prawdziwego wnętrza, które atrapa podmienia
  const props: PropLike[] = own.props?.length
    ? own.props.filter((p) => p.kind !== 'smieci')
    : [{ kind: 'trzepak', x: Math.floor(t.x) + 2, y: Math.floor(t.y), w: 3, h: 1 }];
  if (!props.some((p) => HEAPS.has(p.kind))) props.push(...mockHeaps(w, blocked, props, dryTree));
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
  const { apts: _apts, damage: _damage, ...rest } = w as World & { apts?: unknown; damage?: unknown };
  // dubel testowy: kształt z kontraktu bez typów z interior.ts, których przed połączeniem nie ma
  return { ...rest, blocked, interior, dryTree, props } as unknown as MockWorld;
}

const HEAPS = new Set(['deski', 'zlom', 'gruz']);

/** sterty materiałów na podwórku jak w kontrakcie sesji świata (World.props, kind deski, zlom, gruz, n sztuk):
    deski 4 i złom 4 (dwie łaty po 3–4 sztuki), gruz 3; na wolnych kafelkach podwórka, z dala od bramy,
    dziur, drzwi, drzewa i trzepaka; bez siatki w świecie nic */
function mockHeaps(w: World, blocked: Uint8Array, props: PropLike[], dryTree: number): PropLike[] {
  const size = w.size;
  const fence = (w as unknown as { fence?: { yard: number[]; hole: number[]; gate: PropLike } }).fence;
  if (!fence?.yard.length) return [];
  const g = fence.gate;
  const far: number[] = [...fence.hole];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) far.push(y * size + x);
  for (const b of w.buildings) for (const e of b.entrances) far.push(e.out);
  const t = w.trees[dryTree];
  far.push(Math.floor(t.y) * size + Math.floor(t.x));
  for (const p of props)
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) far.push(y * size + x);
  const cheb = (a: number, b: number) =>
    Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
  const out: PropLike[] = [];
  const want: [string, number][] = [
    ['deski', 4],
    ['zlom', 4],
    ['gruz', 3],
  ];
  for (const i of fence.yard) {
    if (out.length === want.length) break;
    if (blocked[i] || far.some((k) => cheb(i, k) < 3)) continue;
    const [kind, n] = want[out.length];
    out.push({ kind, x: i % size, y: Math.floor(i / size), w: 1, h: 1, n } as PropLike);
    far.push(i);
  }
  return out;
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

/** sztuczny świat z blokiem i ulicą oraz atrapą wnętrza (siatka, suche drzewo i trzepak ze świata) */
export function mockBlock(seed = 5): MockWorld {
  return overlay(buildWorld(geoWith(rect(-24, -6, 48, 13), 'apartments', '5'), { seed, size: 128 }), BLOCK);
}

/** stan mieszkania i uszkodzenie jak w kontrakcie src/world/apts.ts (atrapa do czasu sesji świata) */
export interface MockApt {
  bid: number;
  apt: number;
  state: 'zarzad' | 'mieszkancy' | 'puste';
  why?: 'wyjazd' | 'wymarcie' | 'splądrowanie' | 'zalanie' | 'pozar';
  year?: number;
}
export interface MockDamage {
  kind: 'okno' | 'drzwi' | 'rura' | 'podloga' | 'piec';
  tile: number;
  bid: number;
  apt: number;
}
export type MockWorldM2 = MockWorld & { apts: MockApt[]; damage: MockDamage[] };

/** Blok M2: mieszkanie zarządu (0), mieszkańców (1), puste po splądrowaniu (2: wyważone drzwi, wybite okno,
    śmieci 4) i po zalaniu (3: podłoga i rura, śmieci 3), jak World.apts, World.damage i sterty smieci ze świata */
export function mockBlockM2(seed = 5): MockWorldM2 {
  const w = overlay(buildWorld(geoWith(rect(-24, -6, 48, 13), 'apartments', '5'), { seed, size: 128 }), BLOCK_M2);
  const hq = w.buildings[w.hq];
  const at = (x: number, y: number) => (hq.y0 + y) * w.size + hq.x0 + x;
  const bid = w.hq;
  const apts: MockApt[] = [
    { bid, apt: 0, state: 'zarzad' },
    { bid, apt: 1, state: 'mieszkancy' },
    { bid, apt: 2, state: 'puste', why: 'splądrowanie', year: 2031 },
    { bid, apt: 3, state: 'puste', why: 'zalanie', year: 2044 },
  ];
  const damage: MockDamage[] = [
    { kind: 'drzwi', tile: at(9, 6), bid, apt: 2 },
    { kind: 'okno', tile: at(0, 6), bid, apt: 2 },
    { kind: 'podloga', tile: at(4, 10), bid, apt: 3 },
    { kind: 'rura', tile: at(7, 9), bid, apt: 3 },
  ];
  const props: PropLike[] = [
    ...w.props,
    { kind: 'smieci', x: hq.x0 + 2, y: hq.y0 + 7, w: 1, h: 1, n: 4 },
    { kind: 'smieci', x: hq.x0 + 5, y: hq.y0 + 11, w: 1, h: 1, n: 3 },
  ];
  return { ...w, props, apts, damage } as unknown as MockWorldM2;
}

/** sztuczny świat z domem i ulicą oraz atrapą wnętrza */
export function mockHouse(seed = 7): MockWorld {
  return overlay(buildWorld(geoWith(rect(-5, -4, 11, 10), 'house', '2'), { seed, size: 96 }), HOUSE);
}

/** kafelek pnia drzewa (tam klika gracz): ten, który świat zablokował (pozycje są zaokrąglone do 0,01 m) */
export function trunkTile(w: World, k: number): number {
  const t = w.trees[k];
  const xs = Number.isInteger(t.x) ? [t.x, t.x - 1] : [Math.floor(t.x)];
  const ys = Number.isInteger(t.y) ? [t.y, t.y - 1] : [Math.floor(t.y)];
  for (const y of ys)
    for (const x of xs) if (w.blocked[y * w.size + x] && w.bid[y * w.size + x] < 0) return y * w.size + x;
  return Math.floor(t.y) * w.size + Math.floor(t.x);
}
