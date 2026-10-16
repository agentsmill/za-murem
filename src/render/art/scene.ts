/* Dane pochodne do rysowania świata: liczone raz na mapę (w kilkanaście milisekund).
   - dla każdego kafelka budynku: odległość od dolnej (południowej) krawędzi w kolumnie,
   - styl każdego budynku (kolor ściany, wysokość fasady, rodzaj dachu),
   - maska cieni w oczkach 8 px (4 na kafelek), drzewa pogrupowane w kawałki 32×32. */

import type { Pt } from '../../world/geo.ts';
import { fillRing } from '../../world/raster.ts';
import { type Dir, T, type Tree, type World, type WorldBuilding } from '../../world/world.ts';
import { h2 } from './hash.ts';
import { C, HOUSE_WALLS, shade, WALLS } from './palette.ts';

export const TILE = 32; // pikseli grafiki na metr
export const CHUNK = 32; // kafelków w boku kawałka
export const SUB = 4; // oczek maski cieni na kafelek

export type RoofKind = 'tar' | 'gravel' | 'tiles' | 'metal';

export interface BStyle {
  kind: WorldBuilding['cls'];
  roof: RoofKind;
  wall: number;
  /** wysokość fasady w pikselach grafiki */
  facade: number;
  floorH: number;
  base: number;
  levels: number;
  seed: number;
  /** grzbiet dachu dwuspadowego: 'h' poziomy, 'v' pionowy, null płaski */
  ridge: 'h' | 'v' | null;
  /** położenie grzbietu w pikselach grafiki (y dla 'h', x dla 'v') */
  ridgeAt: number;
  balconies: boolean;
  /** kolor balustrad */
  accent: number;
}

export interface Scene {
  w: World;
  /** dla kafelka budynku: ile kafelków budynku jest pod nim w tej samej kolumnie (0 = dolny) */
  south: Int16Array;
  /** długość pionowego ciągu kafelków budynku, do którego należy kafelek */
  run: Int16Array;
  styles: BStyle[];
  /** cień: 1 = zacienione oczko (rozmiar size*SUB na bok) */
  shadow: Uint8Array;
  /** drzwi: kafelek → kierunek */
  doors: Map<number, Dir>;
  /** drzewa w kawałkach (z zapasem na koronę), indeks cy*n + cx */
  treesBy: Tree[][];
  chunks: number;
}

export const heightM = (levels: number) => levels * 2.8 + 1;

function styleOf(b: WorldBuilding, w: World): BStyle {
  const seed = (h2(b.id, b.x0 * 7 + b.y0, w.seed) * 1e9) | 0;
  const r = (k: number) => h2(seed, k, 77);
  const depthPx = (b.y1 - b.y0 + 1) * TILE;
  let roof: RoofKind = 'tar';
  let wall: number = shade(WALLS[Math.floor(r(1) * WALLS.length)], 0.86);
  let floorH = 9;
  let base = 5;
  let ridge: BStyle['ridge'] = null;
  let ridgeAt = 0;
  let balconies = false;
  switch (b.cls) {
    case 'blok':
      balconies = r(2) < 0.75;
      break;
    case 'dom': {
      roof = 'tiles';
      wall = HOUSE_WALLS[Math.floor(r(3) * HOUSE_WALLS.length)];
      floorH = 10;
      base = 4;
      break;
    }
    case 'garaz':
      roof = 'metal';
      wall = C.metal2;
      floorH = 9;
      base = 2;
      break;
    case 'hala':
      roof = 'metal';
      wall = 0xa9aaa4;
      break;
    case 'sklep':
      roof = 'gravel';
      wall = r(4) < 0.5 ? 0xd8d4c8 : 0xb9c2c4;
      break;
    case 'szkola':
      wall = C.brick0;
      break;
    case 'kosciol':
      roof = 'tiles';
      wall = 0xd6d0c2;
      floorH = 12;
      break;
    case 'przychodnia':
      wall = 0xdddbd2;
      break;
    default:
      wall = 0xb3aea3;
  }
  const levels = Math.max(1, Math.min(b.levels, 16));
  let facade = base + levels * floorH + 2;
  facade = Math.min(facade, Math.max(10, depthPx - 12));
  if (roof === 'tiles') {
    const wpx = (b.x1 - b.x0 + 1) * TILE;
    const roofTop = b.y0 * TILE;
    const roofBottom = (b.y1 + 1) * TILE - facade;
    if (wpx >= roofBottom - roofTop) {
      ridge = 'h';
      ridgeAt = Math.round((roofTop + roofBottom) / 2);
    } else {
      ridge = 'v';
      ridgeAt = Math.round(((b.x0 + b.x1 + 1) * TILE) / 2);
    }
  }
  const accent = [0x8a8f86, 0x9a5b3c, 0x5f7a8c, 0xb8a86a, 0x6e8a5a, 0xc7c2b6][Math.floor(r(9) * 6)];
  return { kind: b.cls, roof, wall, facade, floorH, base, levels, seed, ridge, ridgeAt, balconies, accent };
}

export function buildScene(w: World): Scene {
  const size = w.size;
  const N = size * size;
  const south = new Int16Array(N).fill(-1);
  const run = new Int16Array(N).fill(0);
  for (let x = 0; x < size; x++) {
    let y = size - 1;
    while (y >= 0) {
      const b = w.bid[y * size + x];
      if (b < 0) {
        y--;
        continue;
      }
      // ciąg kafelków tego samego budynku w górę od y
      let k = 0;
      while (y - k >= 0 && w.bid[(y - k) * size + x] === b) k++;
      for (let j = 0; j < k; j++) {
        south[(y - j) * size + x] = j;
        run[(y - j) * size + x] = k;
      }
      y -= k;
    }
  }
  const styles = w.buildings.map((b) => styleOf(b, w));
  const doors = new Map<number, Dir>();
  for (const b of w.buildings) for (const e of b.entrances) doors.set(e.tile, e.dir);

  // cienie budynków: każdy poziomy ciąg kafelków przesunięty w stronę światła (w górę i w prawo)
  const S = size * SUB;
  const shadow = new Uint8Array(S * S);
  const setS = (i: number) => {
    shadow[i] = 1;
  };
  for (const b of w.buildings) {
    const L = heightM(styles[b.id].levels) * 0.22;
    const ax = L * 0.5;
    for (let y = b.y0; y <= b.y1; y++) {
      let x = b.x0;
      while (x <= b.x1) {
        if (w.bid[y * size + x] !== b.id) {
          x++;
          continue;
        }
        let xe = x;
        while (xe + 1 <= b.x1 && w.bid[y * size + xe + 1] === b.id) xe++;
        // sześciokąt: ciąg [x, xe+1]×[y, y+1] przesunięty o (ax, −L), w oczkach maski
        const poly: Pt[] = [
          [x, y + 1],
          [x, y],
          [x + ax, y - L],
          [xe + 1 + ax, y - L],
          [xe + 1 + ax, y + 1 - L],
          [xe + 1, y + 1],
          [x, y + 1],
        ].map(([px, py]) => [px * SUB - S / 2, py * SUB - S / 2] as Pt);
        fillRing(poly, S, setS);
        x = xe + 1;
      }
    }
  }
  // drzewa rzucają okrągły cień
  for (const t of w.trees) {
    const cx = (t.x + t.r * 0.45) * SUB;
    const cy = (t.y - 1.2 - t.r * 0.55) * SUB;
    const rr = t.r * SUB * 0.95;
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++)
      for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const dx = (x + 0.5 - cx) / rr;
        const dy = (y + 0.5 - cy) / (rr * 0.8);
        if (dx * dx + dy * dy <= 1) shadow[y * S + x] = 1;
      }
  }
  // cień nie leży na dachach
  for (let i = 0; i < N; i++) {
    if (w.terr[i] !== T.BUILDING) continue;
    const x = i % size;
    const y = (i - x) / size;
    for (let dy = 0; dy < SUB; dy++) for (let dx = 0; dx < SUB; dx++) shadow[(y * SUB + dy) * S + x * SUB + dx] = 0;
  }

  const chunks = Math.ceil(size / CHUNK);
  const treesBy: Tree[][] = Array.from({ length: chunks * chunks }, () => []);
  for (const t of w.trees) {
    const m = t.r + 2;
    const cx0 = Math.max(0, Math.floor((t.x - m) / CHUNK));
    const cx1 = Math.min(chunks - 1, Math.floor((t.x + m) / CHUNK));
    const cy0 = Math.max(0, Math.floor((t.y - m - 2) / CHUNK));
    const cy1 = Math.min(chunks - 1, Math.floor((t.y + 1) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) treesBy[cy * chunks + cx].push(t);
  }
  for (const list of treesBy) list.sort((a, b) => a.y - b.y || a.x - b.x);
  return { w, south, run, styles, shadow, doors, treesBy, chunks };
}
