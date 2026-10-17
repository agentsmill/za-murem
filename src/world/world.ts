/* Świat gry: siatka 1 m wokół adresu, zbudowana z geometrii OSM.
   Kolejność: obrót mapy, prostowanie budynków, teren, wody, ścieżki, chodniki, jezdnie,
   budynki, drzewa, wnętrze siedziby, suche drzewo z trzepakiem. Wszystko deterministyczne:
   ten sam adres i ziarno dają ten sam świat. */

import type { BuildingClass } from '../content/data.ts';
import { mulberry } from '../core/rng.ts';
import { labelRegions, nearestFree } from '../sim/path.ts';
import { classify, levelsOf, nameOf } from './classify.ts';
import { type Geo, type GeoBuilding, type GeoPoi, type Pt, polyArea } from './geo.ts';
import { buildInterior, IN, type Interior } from './interior.ts';
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

/** rzecz na podwórku zajmująca kilka kafelków */
export interface Prop {
  kind: 'trzepak';
  /** lewy górny kafelek */
  x: number;
  y: number;
  /** 3×1 albo 1×3 */
  w: number;
  h: number;
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
  /** wnętrze siedziby (parter); reszta budynków to bryły z dachem */
  interior: Interior;
  /** numer suchego drzewa w trees (cel pierwszego polecenia); −1, gdy nie ma żadnego */
  dryTree: number;
  /** rzeczy na podwórku: trzepak przy suchym drzewie (blokują tylko słupki na końcach) */
  props: Prop[];
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
  // 5a. przejścia przez budynki (bramy, prześwity): wycięte w budynku jako chodnik albo jezdnia
  for (const r of geo.pass || []) {
    const car = r.h === 'service' || r.h === 'residential';
    stampLine(r.l, car ? 3.5 : 2.5, size, (i) => {
      if (bid[i] < 0) return;
      bid[i] = -1;
      blocked[i] = 0;
      terr[i] = car ? T.ROAD : T.SIDEWALK;
    });
  }
  kept.forEach((o, id) => {
    o.tiles = o.tiles.filter((i) => bid[i] === id);
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
    if (!o.tiles.length) x0 = y0 = x1 = y1 = 0;
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
  if (!buildings.length)
    throw new Error('W tym miejscu mapa nie ma żadnego budynku. Spróbujcie adresu bliżej domów albo bloków.');
  // najbliższy mieszkalny, a gdy takiego nie ma (strefa przemysłowa), najbliższy jakikolwiek
  const nearest = (pred: (b: WorldBuilding) => boolean) => {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const b of buildings) {
      if (!pred(b)) continue;
      const dx = Math.max(b.x0 - c, 0, c - b.x1);
      const dy = Math.max(b.y0 - c, 0, c - b.y1);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = b.id;
      }
    }
    return best;
  };
  if (hq < 0) hq = nearest((b) => b.cls === 'blok' || b.cls === 'dom');
  if (hq < 0) hq = nearest(() => true);
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

  // 9. drzewa
  const planted = plantTrees(terr, blocked, size, opts.seed);

  // 9a. spójność: duży obszar odcięty budynkami (brak przejścia w danych) łączymy bramą
  // przez najcieńszą ścianę; drzewa na drodze bramy znikają
  const removed = connectRegions(terr, bid, blocked, size, planted);
  const trees = removed.size ? planted.filter((_, k) => !removed.has(k)) : planted;
  for (const b of buildings) b.tiles = 0;
  for (let i = 0; i < N; i++) if (bid[i] >= 0) buildings[bid[i]].tiles++;

  // 10. wejścia (pnie stoją co najmniej 2 m od budynków, więc nie wchodzą w drzwi)
  for (const b of buildings) b.entrances = findEntrances(b, terr, bid, blocked, size);

  // 11. wnętrze siedziby: ściany i schody blokują, posadzki, drzwi i meble na razie nie
  const interior = buildInterior({ size, bid, blocked, building: buildings[hq], seed: opts.seed });
  for (let i = 0; i < N; i++) {
    const c = interior.cell[i];
    if (c !== IN.NONE) blocked[i] = c === IN.WALL || c === IN.STAIRS ? 1 : 0;
  }

  // 12. suche drzewo przy trzepaku: cel pierwszego polecenia (regiony już z wnętrzem)
  const yard = dryTreeAndTrzepak(terr, bid, blocked, size, trees, buildings, hq, opts.seed);

  return {
    size,
    angle,
    terr,
    bid,
    blocked,
    buildings,
    trees,
    pois,
    hq,
    seed: opts.seed,
    interior,
    dryTree: yard.tree,
    props: yard.props,
  };
}

/** grunt pod trzepak: trawa (lepiej) albo chodnik */
const TRZEPAK_GROUND: Partial<Record<number, number>> = {
  [T.GRASS]: 2,
  [T.PARK]: 2,
  [T.PLAY]: 2,
  [T.ALLOT]: 2,
  [T.SIDEWALK]: 1,
  [T.PATH]: 1,
};
/** grunt pod nowe drzewo: nieutwardzony */
const TREE_GROUND = new Set<number>([T.GRASS, T.PARK, T.WOOD, T.ALLOT]);
const PAVED = new Set<number>([T.ROAD, T.SIDEWALK, T.PARKING, T.PITCH, T.PLAY]);

/** Suche drzewo do pierwszego polecenia: istniejące drzewo (nie krzak) 6–25 m od pierwszych drzwi siedziby,
    do którego da się dojść, najlepiej przed wejściem i około 12 m od drzwi. Gdy takiego nie ma, sadzimy nowe
    na nieutwardzonym gruncie (w ostateczności na dowolnym wolnym poza jezdnią). 2–4 m od pnia trzepak 3×1 m:
    blokują tylko dwa słupki na końcach, a w pasie 1 m wokół nic nie stoi, więc słupki nie odetną żadnej drogi.
    Nowe drzewo trafia na koniec trees. */
function dryTreeAndTrzepak(
  terr: Uint8Array,
  bid: Int32Array,
  blocked: Uint8Array,
  size: number,
  trees: Tree[],
  buildings: WorldBuilding[],
  hq: number,
  seed: number,
): { tree: number; props: Prop[] } {
  const b = buildings[hq];
  const door = b.entrances[0];
  // punkt odniesienia: środek kafelka drzwi (budynek bez wejścia: jego środek)
  const at = door ? door.tile : Math.floor((b.y0 + b.y1) / 2) * size + Math.floor((b.x0 + b.x1) / 2);
  const ax = (at % size) + 0.5;
  const ay = Math.floor(at / size) + 0.5;
  const [fx, fy] = door ? DIRS[door.dir] : [0, 0];
  const reg = labelRegions(blocked, size);
  const home = reg[door ? door.out : nearestFree(blocked, size, at)];
  // obok kafelka jest wolny kafelek, do którego dojdzie się z drzwi
  const reachable = (i: number) => {
    if (home < 0) return false;
    const x = i % size;
    return (
      (x > 0 && reg[i - 1] === home) ||
      (x < size - 1 && reg[i + 1] === home) ||
      (i >= size && reg[i - size] === home) ||
      (i < size * (size - 1) && reg[i + size] === home)
    );
  };
  const dist = (x: number, y: number) => Math.hypot(x - ax, y - ay);
  // im bardziej przed wejściem i bliżej 12 m od drzwi, tym lepiej
  const score = (x: number, y: number) =>
    (((x - ax) * fx + (y - ay) * fy) / dist(x, y)) * 4 - Math.abs(dist(x, y) - 12) / 4;
  const outs = new Set<number>();
  for (const o of buildings) for (const e of o.entrances) outs.add(e.out);

  // trzepak poziomy albo pionowy; w ramce 1 m wokół nic nie blokuje i nie ma wyjścia z drzwi
  const trzepak = (tx: number, ty: number): Prop | null => {
    let best: Prop | null = null;
    let bs = Number.NEGATIVE_INFINITY;
    for (const [w, h] of [
      [3, 1],
      [1, 3],
    ])
      for (let y = Math.floor(ty) - 7; y <= Math.floor(ty) + 5; y++)
        for (let x = Math.floor(tx) - 7; x <= Math.floor(tx) + 5; x++) {
          const d = Math.hypot(Math.max(x - tx, 0, tx - (x + w)), Math.max(y - ty, 0, ty - (y + h)));
          if (d < 2 || d > 4 || x < 1 || y < 1 || x + w + 1 > size || y + h + 1 > size) continue;
          // około 3 m od pnia, nie w progu drzwi siedziby
          let s = -Math.abs(d - 3) / 2 - (dist(x + w / 2, y + h / 2) < 5 ? 3 : 0);
          for (let yy = y - 1; yy <= y + h && s > Number.NEGATIVE_INFINITY; yy++)
            for (let xx = x - 1; xx <= x + w; xx++) {
              const i = yy * size + xx;
              const on = yy >= y && yy < y + h && xx >= x && xx < x + w;
              const g = on ? TRZEPAK_GROUND[terr[i]] : 1;
              if (blocked[i] || bid[i] >= 0 || outs.has(i) || !g) {
                s = Number.NEGATIVE_INFINITY;
                break;
              }
              if (on) s += g;
            }
          if (s > bs) {
            bs = s;
            best = { kind: 'trzepak', x, y, w, h };
          }
        }
    return best;
  };
  const finish = (tree: number, p: Prop) => {
    blocked[p.y * size + p.x] = 1;
    blocked[(p.y + p.h - 1) * size + p.x + p.w - 1] = 1;
    return { tree, props: [p] };
  };

  // 1. istniejące drzewo
  const cands: { k: number; s: number }[] = [];
  trees.forEach((t, k) => {
    const d = dist(t.x, t.y);
    if (t.kind === 2 || d < 6 || d > 25 || !reachable(Math.floor(t.y) * size + Math.floor(t.x))) return;
    cands.push({ k, s: score(t.x, t.y) + (t.kind === 0 ? 1 : 0) + Math.min(t.r, 3) * 0.3 });
  });
  cands.sort((p, q) => q.s - p.s || p.k - q.k);
  for (const c of cands) {
    const p = trzepak(trees[c.k].x, trees[c.k].y);
    if (p) return finish(c.k, p);
  }

  // 2. nowe drzewo: w promieniu 2 m nic nie blokuje (więc pień niczego nie odetnie), korona nie na budynku
  // ani wodzie, nie przy wyjściu z drzwi; najpierw nieutwardzony grunt z dala od utwardzonego
  for (const strict of [true, false]) {
    const spots: { i: number; s: number }[] = [];
    for (let y = Math.max(2, Math.floor(ay - 25)); y <= Math.min(size - 3, Math.ceil(ay + 25)); y++)
      for (let x = Math.max(2, Math.floor(ax - 25)); x <= Math.min(size - 3, Math.ceil(ax + 25)); x++) {
        const i = y * size + x;
        const d = dist(x + 0.5, y + 0.5);
        if (d < 6 || d > 25 || !reachable(i)) continue;
        if (strict ? !TREE_GROUND.has(terr[i]) : terr[i] === T.ROAD) continue;
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const n = i + dy * size + dx;
            const close = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
            if (
              blocked[n] ||
              terr[n] === T.BUILDING ||
              terr[n] === T.WATER ||
              (close && outs.has(n)) ||
              (strict && close && PAVED.has(terr[n]))
            ) {
              ok = false;
              break;
            }
          }
        if (ok) spots.push({ i, s: score(x + 0.5, y + 0.5) });
      }
    spots.sort((p, q) => q.s - p.s || p.i - q.i);
    for (const { i } of spots.slice(0, 60)) {
      const x = i % size;
      const y = (i - x) / size;
      blocked[i] = 1;
      const p = trzepak(x + 0.5, y + 0.5);
      if (p) {
        const rnd = mulberry((seed ^ 0xd7ee5) >>> 0);
        trees.push({ x: x + 0.5, y: y + 0.5, kind: 0, r: 2.6, seed: (rnd() * 1e9) | 0 });
        return finish(trees.length - 1, p);
      }
      blocked[i] = 0;
    }
  }

  // 3. nigdzie nie ma miejsca na trzepak: samo drzewo
  return { tree: cands.length ? cands[0].k : -1, props: [] };
}

/** Łączy z największym obszarem każdy obszar większy niż 0,5% wolnej mapy (najwyżej 12 bram).
    BFS 0-1: wolny kafelek kosztuje 0, budynek albo drzewo 1, woda jest nieprzechodnia.
    Zwraca numery usuniętych drzew. */
function connectRegions(
  terr: Uint8Array,
  bid: Int32Array,
  blocked: Uint8Array,
  size: number,
  trees: Tree[],
): Set<number> {
  const N = size * size;
  const treeAt = new Map<number, number>();
  trees.forEach((t, k) => {
    treeAt.set(Math.floor(t.y) * size + Math.floor(t.x), k);
  });
  const removed = new Set<number>();
  const carvable = (i: number) => terr[i] === T.BUILDING || treeAt.has(i);
  const carve = (i: number) => {
    if (bid[i] >= 0) {
      bid[i] = -1;
      terr[i] = T.SIDEWALK;
    }
    const t = treeAt.get(i);
    if (t !== undefined) {
      removed.add(t);
      treeAt.delete(i);
    }
    blocked[i] = 0;
  };
  const dist = new Int32Array(N);
  const prev = new Int32Array(N);
  for (let iter = 0; iter < 12; iter++) {
    const reg = labelRegions(blocked, size);
    const counts = new Map<number, number>();
    let free = 0;
    for (let i = 0; i < N; i++)
      if (reg[i] >= 0) {
        counts.set(reg[i], (counts.get(reg[i]) || 0) + 1);
        free++;
      }
    let main = -1;
    let mainN = 0;
    for (const [r, n] of counts)
      if (n > mainN) {
        main = r;
        mainN = n;
      }
    let target = -1;
    let tn = 0;
    for (const [r, n] of counts)
      if (r !== main && n > tn && n >= Math.max(200, free * 0.005)) {
        target = r;
        tn = n;
      }
    if (target < 0) break;
    dist.fill(-1);
    let cur: number[] = [];
    for (let i = 0; i < N; i++)
      if (reg[i] === target) {
        dist[i] = 0;
        prev[i] = -1;
        cur.push(i);
      }
    let found = -1;
    for (let d = 0; cur.length && found < 0; d++) {
      const next: number[] = [];
      for (let qi = 0; qi < cur.length && found < 0; qi++) {
        const c = cur[qi];
        if (dist[c] !== d) continue;
        if (reg[c] === main) {
          found = c;
          break;
        }
        const x = c % size;
        for (const n of [x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1, c - size, c + size]) {
          if (n < 0 || n >= N) continue;
          const cost = blocked[n] ? (carvable(n) ? 1 : -1) : 0;
          if (cost < 0) continue;
          const nd = d + cost;
          if (dist[n] >= 0 && dist[n] <= nd) continue;
          dist[n] = nd;
          prev[n] = c;
          (cost ? next : cur).push(n);
        }
      }
      cur = next;
    }
    if (found < 0) break;
    // brama: kafelki zablokowane na drodze, budynki na szerokość dwóch kafelków
    for (let k = found; k >= 0 && reg[k] !== target; k = prev[k]) {
      if (!blocked[k]) continue;
      const p = prev[k];
      carve(k);
      const side = p >= 0 && Math.abs(p - k) === size ? k + 1 : k + size;
      if (side < N && bid[side] >= 0 && (side % size !== 0 || side === k + size)) carve(side);
    }
  }
  return removed;
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
      // zaokrąglenie nie przesuwa pnia na sąsiedni kafelek (zablokowany jest ten)
      trees.push({
        x: Math.min(Math.round(x * 100) / 100, tx + 0.99),
        y: Math.min(Math.round(y * 100) / 100, ty + 0.99),
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
