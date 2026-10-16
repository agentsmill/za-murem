/* Świat gry: siatka 1 m wokół adresu, zbudowana z geometrii OSM.
   Kolejność: obrót mapy, prostowanie budynków, teren, wody, ścieżki, chodniki, jezdnie,
   budynki, drzewa. Wszystko deterministyczne: ten sam adres i ziarno dają ten sam świat. */

import type { BuildingClass } from '../content/data.ts';
import { mulberry } from '../core/rng.ts';
import { classify, levelsOf, nameOf } from './classify.ts';
import { type Geo, type GeoBuilding, type GeoPoi, type Pt, polyArea } from './geo.ts';
import { fillRing, stampLine } from './raster.ts';
import { dominantAngle, rotateGeo, straighten } from './rotate.ts';

/** bok obszaru gry w metrach (= kafelkach) */
export const SIZE = 384;
/** promień pobierania danych: z zapasem na obrót mapy o 45° */
export const LOAD_RADIUS = Math.ceil((SIZE / 2) * 1.5);

/** kody terenu */
export const T = {
  GRASS: 0,
  PARK: 1,
  WOOD: 2,
  ROAD: 3,
  SIDEWALK: 4,
  PATH: 5,
  PARKING: 6,
  WATER: 7,
  PLAY: 8,
  PITCH: 9,
  ALLOT: 10,
  BUILDING: 11,
} as const;
export type TerrainCode = (typeof T)[keyof typeof T];

export type Dir = 'N' | 'S' | 'E' | 'W';
export interface Entrance {
  /** kafelek drzwi (należy do budynku) */
  tile: number;
  /** kafelek przed drzwiami (wolny) */
  out: number;
  dir: Dir;
}

export interface WorldBuilding {
  id: number;
  cls: BuildingClass;
  levels: number;
  name: string;
  /** pole obrysu w m² */
  area: number;
  /** liczba kafelków na siatce */
  tiles: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cats: string[];
  entrances: Entrance[];
  tags: Record<string, string>;
}

export interface Tree {
  /** pozycja pnia w kafelkach (z ułamkiem) */
  x: number;
  y: number;
  /** 0 liściaste, 1 iglaste, 2 krzak */
  kind: 0 | 1 | 2;
  /** promień korony w metrach */
  r: number;
  seed: number;
}

export interface World {
  size: number;
  /** obrót mapy względem północy (radiany) */
  angle: number;
  terr: Uint8Array;
  /** numer budynku albo −1 */
  bid: Int32Array;
  /** 1 = nie da się przejść */
  blocked: Uint8Array;
  buildings: WorldBuilding[];
  trees: Tree[];
  /** miejsca (sklepy, apteki…) po obrocie, także poza mapą */
  pois: GeoPoi[];
  /** numer budynku siedziby zarządu */
  hq: number;
  seed: number;
}

const ROAD_W: Record<string, number> = {
  motorway: 14,
  trunk: 12,
  primary: 11,
  secondary: 9,
  tertiary: 7,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  road: 6,
  busway: 6,
  service: 4,
};
const SIDEWALK_ROADS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const PAVED_FOOT: Record<string, number> = {
  footway: 2,
  cycleway: 2,
  steps: 2,
  corridor: 2,
  platform: 3,
  pedestrian: 5,
};
const DIRT_FOOT: Record<string, number> = { path: 2, track: 3, bridleway: 2 };
const AREA_ORDER: Record<string, number> = { park: 0, allot: 1, pitch: 2, play: 3, parking: 4, wood: 5, water: 6 };
const AREA_T: Record<string, number> = {
  park: T.PARK,
  allot: T.ALLOT,
  pitch: T.PITCH,
  play: T.PLAY,
  parking: T.PARKING,
  wood: T.WOOD,
  water: T.WATER,
};

const roadClass = (h: string) => h.replace(/_link$/, '');

export interface BuildOpts {
  seed: number;
  size?: number;
  /** ulica z geokodera: nazwa siedziby, gdy mapa ma tylko numer domu */
  street?: string;
}

export function buildWorld(geoIn: Geo, opts: BuildOpts): World {
  const size = opts.size ?? SIZE;
  const half = size / 2;
  const N = size * size;
  const angle = dominantAngle(geoIn, half);
  const geo = straighten(rotateGeo(geoIn, angle));
  const terr = new Uint8Array(N);
  const blocked = new Uint8Array(N);
  const bid = new Int32Array(N).fill(-1);
  const set = (code: number) => (i: number) => {
    terr[i] = code;
  };

  // 1. teren z obszarów
  const areas = geo.a.slice().sort((p, q) => AREA_ORDER[p.k] - AREA_ORDER[q.k]);
  for (const a of areas) fillRing(a.p, size, set(AREA_T[a.k]));
  // 2. cieki wodne
  for (const w of geo.w) stampLine(w.l, 4, size, set(T.WATER));
  // 3. ścieżki i chodniki z OSM
  for (const r of geo.r) {
    const h = roadClass(r.h);
    if (PAVED_FOOT[h])
      stampLine(r.l, PAVED_FOOT[h], size, (i) => {
        if (terr[i] !== T.WATER) terr[i] = T.SIDEWALK;
      });
    else if (DIRT_FOOT[h])
      stampLine(r.l, DIRT_FOOT[h], size, (i) => {
        if (terr[i] !== T.WATER && terr[i] !== T.SIDEWALK) terr[i] = T.PATH;
      });
  }
  // 4. chodniki wzdłuż ulic (po 2 m z każdej strony), potem jezdnie
  for (const r of geo.r) {
    const h = roadClass(r.h);
    if (!SIDEWALK_ROADS.has(h)) continue;
    stampLine(r.l, ROAD_W[h] + 4, size, (i) => {
      const t = terr[i];
      if (t === T.GRASS || t === T.PARK || t === T.WOOD || t === T.PATH) terr[i] = T.SIDEWALK;
    });
  }
  for (const r of geo.r) {
    const w = ROAD_W[roadClass(r.h)];
    if (w) stampLine(r.l, w, size, set(T.ROAD));
  }
  // 5. budynki: najpierw większe, kafelek należy do pierwszego budynku, który go zajął
  const order = geo.b
    .map((b, k) => ({ b, k, area: polyArea(b.p) + (b.pp || []).reduce((s, p) => s + polyArea(p), 0) }))
    .sort((p, q) => q.area - p.area || p.k - q.k);
  const owner = new Int32Array(N).fill(-1);
  const tilesOf: number[][] = [];
  order.forEach((o, k) => {
    const list: number[] = [];
    for (const ring of [o.b.p, ...(o.b.pp || [])])
      fillRing(ring, size, (i) => {
        if (owner[i] === -1) {
          owner[i] = k;
          list.push(i);
        }
      });
    tilesOf.push(list);
  });
  const kept: { b: GeoBuilding; area: number; tiles: number[] }[] = [];
  order.forEach((o, k) => {
    if (tilesOf[k].length >= 3) kept.push({ b: o.b, area: o.area, tiles: tilesOf[k] });
  });
  kept.forEach((o, id) => {
    for (const i of o.tiles) {
      terr[i] = T.BUILDING;
      bid[i] = id;
      blocked[i] = 1;
    }
  });
  for (let i = 0; i < N; i++) if (terr[i] === T.WATER) blocked[i] = 1;

  // 6. miejsca: punkt w budynku albo najbliższy budynek do 6 m
  const pois = geo.poi;
  const catsOf: Set<string>[] = kept.map(() => new Set());
  const namedOf: (string | null)[] = kept.map(() => null);
  for (const p of pois) {
    const tx = Math.floor(p.x + half);
    const ty = Math.floor(p.y + half);
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
    let b = bid[ty * size + tx];
    if (b < 0) {
      let bd = 6.5;
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const c = bid[y * size + x];
          const d = Math.hypot(dx, dy);
          if (c >= 0 && d < bd) {
            bd = d;
            b = c;
          }
        }
    }
    if (b >= 0) {
      catsOf[b].add(p.c);
      if (p.n && !namedOf[b]) namedOf[b] = p.n;
    }
  }

  // 7. opis budynków
  const counters: Record<string, number> = {};
  const buildings: WorldBuilding[] = kept.map((o, id) => {
    let x0 = size;
    let y0 = size;
    let x1 = -1;
    let y1 = -1;
    for (const i of o.tiles) {
      const x = i % size;
      const y = (i - x) / size;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const area = Math.max(o.area, o.tiles.length * 0.9);
    const cats = [...catsOf[id]];
    const cls = classify(o.b, area, cats);
    counters[cls] = (counters[cls] || 0) + 1;
    return {
      id,
      cls,
      levels: levelsOf(o.b, cls, area),
      name: nameOf(o.b.t, cls, namedOf[id], counters[cls]),
      area: Math.round(area),
      tiles: o.tiles.length,
      x0,
      y0,
      x1,
      y1,
      cats,
      entrances: [],
      tags: o.b.t,
    };
  });

  // 8. siedziba: budynek pod adresem (do 4 m), inaczej najbliższy mieszkalny
  const c = Math.floor(half);
  let hq = -1;
  let best = 4.5;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const b = bid[(c + dy) * size + c + dx];
      const d = Math.hypot(dx, dy);
      if (b >= 0 && d < best) {
        best = d;
        hq = b;
      }
    }
  if (hq < 0) {
    let bd = Number.POSITIVE_INFINITY;
    for (const b of buildings) {
      if (b.cls !== 'blok' && b.cls !== 'dom') continue;
      const dx = Math.max(b.x0 - c, 0, c - b.x1);
      const dy = Math.max(b.y0 - c, 0, c - b.y1);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        hq = b.id;
      }
    }
  }
  if (hq >= 0) {
    const b = buildings[hq];
    // tu mieszkacie: siedziba zawsze jest mieszkalna
    if (b.cls !== 'blok' && b.cls !== 'dom') {
      b.cls = b.area < 300 ? 'dom' : 'blok';
      b.levels = Math.max(b.levels, b.cls === 'dom' ? 2 : 4);
    }
    const num = b.tags['addr:housenumber'];
    if (!b.tags.name && !b.tags['addr:street'])
      b.name = opts.street && num ? `${opts.street} ${num}` : nameOf(b.tags, b.cls, null, 1);
  }

  // 9. drzewa (przed wejściami, żeby drzewo nie zasłoniło drzwi, sprawdzamy potem)
  const trees = plantTrees(terr, blocked, size, opts.seed);

  // 10. wejścia
  for (const b of buildings) b.entrances = findEntrances(b, terr, bid, blocked, size);
  // drzewo nie stoi w drzwiach
  const doorOut = new Set<number>();
  for (const b of buildings) for (const e of b.entrances) doorOut.add(e.out);
  const keptTrees = trees.filter((t) => {
    const i = Math.floor(t.y) * size + Math.floor(t.x);
    if (!doorOut.has(i)) return true;
    blocked[i] = 0;
    return false;
  });

  return { size, angle, terr, bid, blocked, buildings, trees: keptTrees, pois, hq, seed: opts.seed };
}

/** Drzewa z siatki z losowym przesunięciem: gęsto w lesie, rzadziej w parku i na trawnikach. */
function plantTrees(terr: Uint8Array, blocked: Uint8Array, size: number, seed: number): Tree[] {
  const rnd = mulberry((seed ^ 0x5eed7) >>> 0);
  const CELL = 3;
  const trees: Tree[] = [];
  const near = new Int32Array(size * size).fill(-1);
  const free = (x: number, y: number, rad: number, codes: readonly number[]) => {
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;
        if (codes.includes(terr[ny * size + nx])) return false;
      }
    return true;
  };
  const HARD = [T.BUILDING, T.WATER];
  const PAVED = [T.ROAD, T.SIDEWALK, T.PARKING, T.PITCH, T.PLAY];
  for (let gy = 0; gy < size; gy += CELL)
    for (let gx = 0; gx < size; gx += CELL) {
      const x = gx + rnd() * CELL;
      const y = gy + rnd() * CELL;
      const roll = rnd();
      const kindRoll = rnd();
      const sizeRoll = rnd();
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx >= size || ty >= size) continue;
      const t = terr[ty * size + tx];
      const density = t === T.WOOD ? 0.7 : t === T.PARK ? 0.16 : t === T.GRASS ? 0.07 : 0;
      if (roll >= density) continue;
      // korona nie wchodzi na budynek, pień nie stoi na utwardzonym
      if (!free(tx, ty, 2, HARD) || !free(tx, ty, t === T.WOOD ? 0 : 1, PAVED)) continue;
      // odstęp od innych drzew
      const minD = t === T.WOOD ? 2.6 : 4.5;
      let ok = true;
      const rad = Math.ceil(minD);
      for (let dy = -rad; dy <= rad && ok; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const k = near[ny * size + nx];
          if (k >= 0 && Math.hypot(trees[k].x - x, trees[k].y - y) < minD) {
            ok = false;
            break;
          }
        }
      if (!ok) continue;
      const kind: 0 | 1 | 2 = kindRoll < (t === T.WOOD ? 0.35 : 0.15) ? 1 : kindRoll > 0.9 ? 2 : 0;
      const r = kind === 2 ? 1 + sizeRoll * 0.6 : 1.8 + sizeRoll * 1.8;
      near[ty * size + tx] = trees.length;
      trees.push({
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        kind,
        r: Math.round(r * 10) / 10,
        seed: (rnd() * 1e9) | 0,
      });
      blocked[ty * size + tx] = 1;
    }
  return trees;
}

const DIRS: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/** Wejścia: blok ma klatki co około 20 m wzdłuż dłuższej ściany, od strony chodnika;
    pozostałe budynki jedno wejście od strony drogi albo chodnika. */
function findEntrances(
  b: WorldBuilding,
  terr: Uint8Array,
  bid: Int32Array,
  blocked: Uint8Array,
  size: number,
): Entrance[] {
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const horiz = w >= h;
  const sides: Dir[] = b.cls === 'blok' ? (horiz ? ['S', 'N'] : ['E', 'W']) : ['S', 'E', 'W', 'N'];
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && bid[y * size + x] === b.id;
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && !blocked[y * size + x];
  // kafelki brzegowe od danej strony: [kafelek budynku, kafelek przed nim]
  const edge = (d: Dir): [number, number][] => {
    const [dx, dy] = DIRS[d];
    const out: [number, number][] = [];
    if (d === 'S' || d === 'N') {
      for (let x = b.x0; x <= b.x1; x++) {
        let y = d === 'S' ? b.y1 : b.y0;
        while (!inB(x, y) && y >= b.y0 && y <= b.y1) y -= dy;
        if (inB(x, y) && walk(x + dx, y + dy)) out.push([y * size + x, (y + dy) * size + x]);
      }
    } else {
      for (let y = b.y0; y <= b.y1; y++) {
        let x = d === 'E' ? b.x1 : b.x0;
        while (!inB(x, y) && x >= b.x0 && x <= b.x1) x -= dx;
        if (inB(x, y) && walk(x + dx, y + dy)) out.push([y * size + x, y * size + x + dx]);
      }
    }
    return out;
  };
  // ocena strony: utwardzone kafelki w pasie 6 m przed ścianą
  const score = (d: Dir, cand: [number, number][]) => {
    const [dx, dy] = DIRS[d];
    let s = 0;
    for (const [, o] of cand) {
      let x = o % size;
      let y = (o - x) / size;
      for (let k = 0; k < 6; k++) {
        if (x < 0 || y < 0 || x >= size || y >= size) break;
        const t = terr[y * size + x];
        if (t === T.SIDEWALK || t === T.PATH || t === T.ROAD || t === T.PARKING) {
          s += 1;
          break;
        }
        x += dx;
        y += dy;
      }
    }
    return s + cand.length * 0.01;
  };
  let bestD: Dir | null = null;
  let bestS = -1;
  let bestC: [number, number][] = [];
  for (const d of sides) {
    const cand = edge(d);
    if (!cand.length) continue;
    // przy remisie wygrywa pierwsza strona z listy (dla bloków poziomych: południe, widoczna fasada)
    const s = score(d, cand);
    if (s > bestS + 1e-9) {
      bestS = s;
      bestD = d;
      bestC = cand;
    }
  }
  if (!bestD) return [];
  const len = bestD === 'S' || bestD === 'N' ? w : h;
  const n = b.cls === 'blok' ? Math.max(1, Math.round(len / 20)) : 1;
  const out: Entrance[] = [];
  const used = new Set<number>();
  for (let k = 0; k < n; k++) {
    const target = (k + 0.5) / n;
    // najbliższy kandydat do pozycji docelowej wzdłuż ściany
    let pick: [number, number] | null = null;
    let pd = Number.POSITIVE_INFINITY;
    for (const cnd of bestC) {
      const x = cnd[0] % size;
      const y = (cnd[0] - x) / size;
      const pos = bestD === 'S' || bestD === 'N' ? (x - b.x0 + 0.5) / w : (y - b.y0 + 0.5) / h;
      const d = Math.abs(pos - target);
      if (d < pd && !used.has(cnd[0])) {
        pd = d;
        pick = cnd;
      }
    }
    if (!pick) break;
    used.add(pick[0]);
    out.push({ tile: pick[0], out: pick[1], dir: bestD });
  }
  return out;
}

/** środek kafelka w metrach względem adresu (po obrocie) */
export const tileCenter = (w: World, i: number): Pt => {
  const x = i % w.size;
  return [x - w.size / 2 + 0.5, (i - x) / w.size - w.size / 2 + 0.5];
};
