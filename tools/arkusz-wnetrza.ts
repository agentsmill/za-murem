/* Arkusz podglądu grafiki zastępczej wnętrza i rzeczy (M1): wszystkie kafelki i sprite'y we
   wszystkich wariantach oraz przykładowe sceny, w skali 1× i 2×.
   Uruchomienie: node tools/arkusz-wnetrza.ts
   Wynik: shots/wnetrze-1x.png, shots/wnetrze-2x.png i zbliżenia scen shots/wnetrze-sceny-2x.png. */

import fs from 'node:fs';
import path from 'node:path';
import { h2 } from '../src/render/art/hash.ts';
import { C, shade, WALLS } from '../src/render/art/palette.ts';
import { FH, FW, makePeopleAtlas } from '../src/render/art/people.ts';
import {
  deadTreeSprite,
  FIRE_FRAMES,
  FURNITURE_KINDS,
  type FurnitureKind,
  footprint,
  type Rot,
  type Sprite,
  stumpSprite,
  type ThingSpec,
  thingSprite,
} from '../src/render/art/rzeczy.ts';
import { treeSprite } from '../src/render/art/trees.ts';
import {
  drawInteriorTile,
  type Face,
  type InteriorTile,
  maskOf,
  NB,
  ROOM_KINDS,
  type RoomKind,
} from '../src/render/art/wnetrze.ts';
import type { Dir, Tree } from '../src/world/world.ts';
import { type FakeCanvas, fakeDocument, type Pix, Plotno } from './arkusz-plotno.ts';

const OUT = path.resolve(import.meta.dirname, '../shots');
fs.mkdirSync(OUT, { recursive: true });

const T = 32;
const BG = 0x24262a;
const INK = 0xd8d4c8;
const DIM = 0x8a8780;
const FACADE = shade(WALLS[3], 0.86);
const SEED = 7;

const NAMES: Record<RoomKind, string> = {
  klatka: 'klatka: lastryko',
  przedpokoj: 'przedpokój: linoleum',
  pokoj: 'pokój: panele',
  kuchnia: 'kuchnia: linoleum',
  lazienka: 'łazienka: kafelki',
  sala: 'sala: jasne lastryko',
  hala: 'hala: beton',
  zaplecze: 'zaplecze: linoleum',
};

/** trawa za ścianą, w kolorach mapy */
function grass(p: Plotno, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const r = h2((x + i) >> 1, (y + j) >> 1, 5);
      const c = r < 0.3 ? C.grass0 : r < 0.62 ? C.grass1 : r < 0.9 ? C.grass2 : C.grass3;
      p.rect(x + i, y + j, 1, 1, c);
    }
}

// ---------------------------------------------------------------- plan mieszkania

const ROOM_OF: Record<string, RoomKind> = { c: 'klatka', h: 'przedpokoj', p: 'pokoj', k: 'kuchnia', l: 'lazienka' };
const STAIRS: Record<string, Dir> = { '^': 'N', v: 'S', '<': 'W', '>': 'E' };
const WALLISH = new Set(['#', '+', 'w', 'd', 'D']);

/**
 * Plan znakami: # ściana zewnętrzna, + wewnętrzna, w okno, d drzwi, D drzwi frontowe,
 * ^ v < > schody, litery pomieszczeń (c klatka, h przedpokój, p pokój, k kuchnia, l łazienka), . na zewnątrz.
 */
export function planTiles(plan: string[], lit: (x: number, y: number, room: RoomKind) => boolean) {
  const H = plan.length;
  const W = plan[0].length;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : plan[y][x]);
  const roomAt = (x: number, y: number): RoomKind | null => {
    const ch = at(x, y);
    if (ROOM_OF[ch]) return ROOM_OF[ch];
    if (STAIRS[ch]) return 'klatka';
    return null;
  };
  const faceAt = (x: number, y: number): Face => (at(x, y) === '.' ? 'out' : (roomAt(x, y) ?? 'pokoj'));
  const tiles: (InteriorTile | null)[][] = [];
  for (let y = 0; y < H; y++) {
    const row: (InteriorTile | null)[] = [];
    for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      const mask = maskOf((dx, dy) => WALLISH.has(at(x + dx, y + dy)));
      const out =
        (at(x, y - 1) === '.' ? NB.N : 0) |
        (at(x + 1, y) === '.' ? NB.E : 0) |
        (at(x, y + 1) === '.' ? NB.S : 0) |
        (at(x - 1, y) === '.' ? NB.W : 0);
      let t: InteriorTile | null = null;
      if (ch === '#' || ch === '+')
        t = { kind: 'wall', mask, outer: ch === '#', out, face: faceAt(x, y + 1), facade: FACADE };
      else if (ch === 'w') {
        const room =
          roomAt(x, y + 1) ?? roomAt(x, y - 1) ?? roomAt(x + 1, y) ?? roomAt(x - 1, y) ?? ('pokoj' as RoomKind);
        t = { kind: 'window', mask, out, room, lit: lit(x, y, room), facade: FACADE };
      } else if (ch === 'd' || ch === 'D') {
        const vertical = WALLISH.has(at(x, y - 1)) && WALLISH.has(at(x, y + 1));
        t = { kind: 'door', vertical, entrance: ch === 'D', face: faceAt(x, y + 1), facade: FACADE };
      } else if (STAIRS[ch]) {
        const sm = maskOf((dx, dy) => !!STAIRS[at(x + dx, y + dy)]);
        t = { kind: 'stairs', up: STAIRS[ch], mask: sm };
      } else if (ROOM_OF[ch]) t = { kind: 'floor', room: ROOM_OF[ch], walls: mask };
      row.push(t);
    }
    tiles.push(row);
  }
  return tiles;
}

function drawPlan(
  p: Plotno,
  x0: number,
  y0: number,
  plan: string[],
  lit: (x: number, y: number, r: RoomKind) => boolean,
) {
  const tiles = planTiles(plan, lit);
  for (let y = 0; y < tiles.length; y++)
    for (let x = 0; x < tiles[y].length; x++) {
      const t = tiles[y][x];
      const tx = (x0 >> 5) + x;
      const ty = (y0 >> 5) + y;
      if (t) drawInteriorTile(p.px, p.w, x0 + x * T, y0 + y * T, t, tx, ty, SEED);
      else grass(p, x0 + x * T, y0 + y * T, T, T);
    }
}

/** mieszkanie z kuchnią, pokojem, łazienką i przedpokojem, obok klatka ze schodami i drzwiami frontowymi */
const PLAN = [
  '...................',
  '.##w####w##w###w##.',
  '.#kkkk+pppppp+^^^#.',
  '.wkkkk+pppppp+^^^w.',
  '.#kkkkdpppppp+ccc#.',
  '.#+++++++d++++ccc#.',
  '.#llldhhhhhhhdccc#.',
  '.#lll+hhhhhhh+ccc#.',
  '.##w#####w#####D##.',
  '...................',
];

// ---------------------------------------------------------------- arkusz

const SHEET_W = 1344;
const SHEET_H = 6000;
const p = new Plotno(SHEET_W, SHEET_H, BG);
let y = 16;

function heading(s: string) {
  p.text(16, y, s, INK);
  y += 12;
}

p.text(16, y, 'za murem, m1: wnętrze i rzeczy (grafika zastępcza, 32 px na metr)', INK);
y += 20;

// posadzki: bloki 3×2 kafelki, żeby było widać łączenie wzorów
heading('posadzki');
{
  let x = 32;
  for (const room of ROOM_KINDS) {
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 3; i++)
        drawInteriorTile(p.px, p.w, x + i * T, y + j * T, { kind: 'floor', room }, (x >> 5) + i, (y >> 5) + j, SEED);
    p.text(x, y + 2 * T + 4, NAMES[room], DIM);
    x += 3 * T + 12;
  }
  // przy ścianach ciemniej: ta sama posadzka z maską ścian dookoła
  const walls = NB.N | NB.E | NB.S | NB.W | NB.NE | NB.NW | NB.SE | NB.SW;
  drawInteriorTile(p.px, p.w, x, y, { kind: 'floor', room: 'pokoj', walls }, x >> 5, y >> 5, SEED);
  drawInteriorTile(p.px, p.w, x + T + 8, y, { kind: 'floor', room: 'kuchnia', walls: NB.N | NB.W | NB.NW }, 0, 0, SEED);
  p.text(x, y + 2 * T + 4, 'przy ścianach', DIM);
  y += 2 * T + 20;
}

// fronty ścian: odcinek trzech kafelków nad posadzką pomieszczenia, które widać od południa
heading('fronty ścian (wykończenie od strony pomieszczenia na południe), wierzch wewnętrznej i zewnętrznej');
{
  let x = 32;
  const faces: Face[] = [...ROOM_KINDS, 'out'];
  for (const face of faces) {
    const outer = face === 'out';
    for (let i = 0; i < 3; i++) {
      const mask = (i > 0 ? NB.W : 0) | (i < 2 ? NB.E : 0);
      const t: InteriorTile = { kind: 'wall', mask, outer, out: outer ? NB.S : 0, face, facade: FACADE };
      drawInteriorTile(p.px, p.w, x + i * T, y, t, (x >> 5) + i, y >> 5, SEED);
      if (face === 'out') grass(p, x + i * T, y + T, T, T);
      else
        drawInteriorTile(
          p.px,
          p.w,
          x + i * T,
          y + T,
          { kind: 'floor', room: face, walls: NB.N },
          (x >> 5) + i,
          (y >> 5) + 1,
          SEED,
        );
    }
    p.text(x, y + 2 * T + 4, face === 'out' ? 'elewacja' : face, DIM);
    x += 3 * T + 8;
  }
  y += 2 * T + 20;
  // lamperia w różnych klatkach (ziarno)
  x = 32;
  for (let s = 0; s < 6; s++) {
    for (let i = 0; i < 2; i++) {
      const mask = (i > 0 ? NB.W : 0) | (i < 1 ? NB.E : 0);
      drawInteriorTile(p.px, p.w, x + i * T, y, { kind: 'wall', mask, face: 'klatka' }, i, 0, s);
    }
    x += 2 * T + 8;
  }
  p.text(x + 8, y + 12, 'lamperia w klatce zależy od ziarna', DIM);
  y += T + 16;
}

// plan mieszkania w dzień i w nocy (świecą okna kuchni i pokoju, gdzie grzeje koza)
heading('plan: ściany z maską sąsiadów, drzwi, okna, schody; w nocy świecą okna ogrzanych pomieszczeń');
{
  const lit = (_x: number, _y: number, r: RoomKind) => r === 'kuchnia' || r === 'pokoj';
  drawPlan(p, 32, y, PLAN, () => false);
  drawPlan(p, 32 + PLAN[0].length * T + 32, y, PLAN, lit);
  y += PLAN.length * T + 12;
}

// zbliżenia: okna i drzwi w obu ścianach, w dzień i w nocy
heading('okna: od środka (ściana północna), od zewnątrz (południowa), w ścianie pionowej; dzień i noc');
{
  let x = 32;
  const ctx = (rows: string[], lit: boolean) => {
    drawPlan(p, x, y, rows, () => lit);
    x += rows[0].length * T + 16;
  };
  for (const lit of [false, true]) {
    ctx(['#w#', 'ppp'], lit);
    ctx(['ppp', '#w#', '...'], lit);
    ctx(['#p', 'wp', '#p'], lit);
    ctx(['p#', 'pw', 'p#'], lit);
  }
  y += 3 * T + 16;
}

heading('drzwi: w ścianie poziomej i pionowej, wewnętrzne i frontowe z domofonem');
{
  let x = 32;
  for (const rows of [
    ['ppp', '+d+', 'hhh'],
    ['ccc', '#D#', '...'],
    ['+p', 'dp', '+p'],
    ['#c', 'Dc', '#c'],
  ]) {
    drawPlan(p, x, y, rows, () => false);
    x += rows[0].length * T + 16;
  }
  y += 3 * T + 16;
}

heading('schody: wchodzenie na północ, południe, wschód i zachód, poręcz od wolnej strony');
{
  let x = 32;
  for (const rows of [
    ['^^', '^^', 'cc'],
    ['cc', 'vv', 'vv'],
    ['>>c', '>>c'],
    ['c<<', 'c<<'],
  ]) {
    drawPlan(p, x, y, rows, () => false);
    x += rows[0].length * T + 16;
  }
  y += 3 * T + 16;
}

// ---------------------------------------------------------------- meble

/** pokój, w którym zwykle stoi mebel (posadzka pod podglądem) */
const ROOM_FOR: Record<FurnitureKind, string> = {
  koza: 'k',
  stol: 'k',
  krzeslo: 'k',
  kuchenka: 'k',
  lodowka: 'k',
  lozko: 'p',
  wersalka: 'p',
  mebloscianka: 'p',
  wanna: 'l',
  sedes: 'l',
  umywalka: 'l',
};

/**
 * Komórka podglądu: mebel na posadzce, przy ścianie od strony rot (dla kozy ściana zewnętrzna
 * z oknem za nią). Zwraca szerokość i wysokość komórki w pikselach.
 */
function cell(x0: number, y0: number, spec: ThingSpec & { rot: Rot }, room: string, window: boolean): [number, number] {
  const fp = footprint(spec);
  const W = fp.w + 2;
  const H = fp.h + 2;
  const rows: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => room));
  const wall = window ? '#' : '+';
  if (spec.rot === 0) for (let x = 0; x < W; x++) rows[0][x] = wall;
  if (spec.rot === 2) for (let x = 0; x < W; x++) rows[H - 1][x] = wall;
  if (spec.rot === 1) for (let y = 0; y < H; y++) rows[y][W - 1] = wall;
  if (spec.rot === 3) for (let y = 0; y < H; y++) rows[y][0] = wall;
  if (window) {
    // okno na wprost środka podstawy
    const cx = 1 + Math.floor((fp.w - 1) / 2);
    const cy = 1 + Math.floor((fp.h - 1) / 2);
    if (spec.rot === 0) rows[0][cx] = 'w';
    if (spec.rot === 2) rows[H - 1][cx] = 'w';
    if (spec.rot === 1) rows[cy][W - 1] = 'w';
    if (spec.rot === 3) rows[cy][0] = 'w';
  }
  const plan = rows.map((r) => r.join(''));
  drawPlan(p, x0, y0, plan, () => 'fire' in spec && spec.fire !== undefined);
  const sp = thingSprite(spec);
  const bx = x0 + (1 + fp.w / 2) * T;
  const by = y0 + (1 + fp.h) * T;
  p.blit(sp, bx - sp.ax, by - sp.ay);
  return [W * T, H * T];
}

heading('meble w czterech ustawieniach (rot 0 góra, 1 prawo, 2 dół, 3 lewo), dalej inne ziarna');
const ROW_GAP = 12;
for (const kind of FURNITURE_KINDS) {
  const rowsOfSpecs: (ThingSpec & { rot: Rot })[][] = [];
  if (kind === 'koza') {
    rowsOfSpecs.push(([0, 1, 2, 3] as Rot[]).map((rot) => ({ kind, rot })));
    rowsOfSpecs.push(([0, 1, 2, 3] as Rot[]).map((rot) => ({ kind, rot, fire: rot % FIRE_FRAMES })));
    rowsOfSpecs.push(Array.from({ length: FIRE_FRAMES }, (_, f) => ({ kind, rot: 0 as Rot, fire: f })));
  } else {
    const row: (ThingSpec & { rot: Rot })[] = ([0, 1, 2, 3] as Rot[]).map((rot) => ({ kind, rot, seed: 1 }));
    for (const seed of [2, 3, 4]) row.push({ kind, rot: 0, seed });
    rowsOfSpecs.push(row);
  }
  for (const specs of rowsOfSpecs) {
    const burning = 'fire' in specs[0] && specs[0].fire !== undefined;
    p.text(16, y, kind === 'koza' ? (burning ? 'koza pali się' : 'koza zimna') : kind, DIM);
    let x = 32;
    let rowH = 0;
    for (const spec of specs) {
      const fp = footprint(spec);
      if (x + (fp.w + 2) * T > SHEET_W - 16) break;
      const [w, h] = cell(x, y + 10, spec, ROOM_FOR[kind], kind === 'koza');
      x += w + 16;
      rowH = Math.max(rowH, h);
    }
    y += rowH + 10 + ROW_GAP;
  }
}

// ---------------------------------------------------------------- rzeczy na mapie

fakeDocument();
const fromCanvas = (c: unknown): Pix => (c as FakeCanvas).toPix();

heading('na mapie: stos drewna 1, 2, 3; pień; trzepak w czterech ustawieniach; zapas jedzenia 1, 2, 3');
{
  let x = 32;
  for (const size of [1, 2, 3] as const) {
    grass(p, x, y, 2 * T, 2 * T);
    const sp = thingSprite({ kind: 'drewno', size, seed: size });
    p.blit(sp, x + T - sp.ax, y + 1.5 * T + 16 - sp.ay);
    x += 2 * T + 16;
  }
  for (const r of [1.6, 2.4, 3.4]) {
    grass(p, x, y, 2 * T, 2 * T);
    const t: Tree = { x: 0, y: 0, kind: 0, r, seed: Math.round(r * 10) };
    const sp = stumpSprite(t);
    p.blit(sp, x + T - sp.ax, y + 1.5 * T - sp.ay);
    x += 2 * T + 16;
  }
  for (const rot of [0, 1, 2, 3] as Rot[]) {
    const fp = footprint({ kind: 'trzepak', rot });
    grass(p, x, y, (fp.w + 1) * T, (fp.h + 1) * T + 16);
    const sp = thingSprite({ kind: 'trzepak', rot, seed: rot });
    p.blit(sp, x + ((fp.w + 1) / 2) * T - sp.ax, y + (fp.h + 0.5) * T + 16 - sp.ay);
    x += (fp.w + 1) * T + 16;
  }
  // zapasy jedzenia na posadzce kuchni
  for (const size of [1, 2, 3] as const) {
    drawPlan(p, x, y, ['kk', 'kk'], () => false);
    const sp = thingSprite({ kind: 'jedzenie', size, seed: size });
    p.blit(sp, x + T - sp.ax, y + 1.5 * T + 16 - sp.ay);
    x += 2 * T + 16;
  }
  y += 4 * T + 24;
}

heading('suche drzewo (liściaste, iglaste, krzak) obok żywego z trees.ts, w tej samej ramce');
{
  let x = 32;
  let rowH = 0;
  for (const [kind, r] of [
    [0, 1.8],
    [0, 2.6],
    [0, 3.4],
    [1, 2.4],
    [2, 1.3],
  ] as [0 | 1 | 2, number][]) {
    const t: Tree = { x: 0, y: 0, kind, r, seed: 1000 + Math.round(r * 100) + kind };
    const dead = deadTreeSprite(t);
    const live = treeSprite(t);
    const lp = fromCanvas(live.canvas);
    const w = dead.w * 2 + 8;
    grass(p, x, y, w, dead.h + 8);
    p.blit(lp, x + 4, y + 4);
    p.blit(dead, x + dead.w + 4, y + 4);
    // ramki i kotwice
    p.frame(x + 4, y + 4, lp.w, lp.h, 0x3a4a2a);
    p.frame(x + dead.w + 4, y + 4, dead.w, dead.h, 0x3a4a2a);
    p.rect(Math.round(x + dead.w + 4 + dead.ax), Math.round(y + 4 + dead.ay), 1, 1, 0xff3030);
    p.rect(Math.round(x + 4 + live.ax), Math.round(y + 4 + live.ay), 1, 1, 0xff3030);
    x += w + 16;
    rowH = Math.max(rowH, dead.h + 8);
  }
  y += rowH + 20;
}

// ---------------------------------------------------------------- sceny

const atlas = fromCanvas(makePeopleAtlas());
/** pionek z atlasu people.ts: wygląd, kierunek (0 dół, 1 góra, 2 lewo, 3 prawo), klatka */
function pawn(look: number, dir: number, f = 0): Sprite {
  const px = new Uint32Array(FW * FH);
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) px[j * FW + i] = atlas.px[(look * FH + j) * atlas.w + (dir * 4 + f) * FW + i];
  return { w: FW, h: FH, ax: 16, ay: 45, px };
}

interface Placed {
  sp: Sprite;
  /** kotwica w pikselach sceny */
  x: number;
  y: number;
}

/** rzecz na kafelkach (tx, ty) planu: kotwica na środku dolnej krawędzi podstawy */
const at = (spec: ThingSpec, tx: number, ty: number): Placed => {
  const fp = footprint(spec);
  return { sp: thingSprite(spec), x: (tx + fp.w / 2) * T, y: (ty + fp.h) * T };
};
const person = (look: number, dir: number, tx: number, ty: number): Placed => ({
  sp: pawn(look, dir),
  x: tx * T,
  y: ty * T,
});
const tree = (sp: { w: number; h: number; ax: number; ay: number; px: Uint32Array }, t: Tree): Placed => ({
  sp,
  x: t.x * T,
  y: t.y * T,
});

function scene(x0: number, y0: number, plan: string[], things: Placed[], lit: boolean): void {
  drawPlan(p, x0, y0, plan, (_x, _y, r) => lit && (r === 'kuchnia' || r === 'pokoj'));
  for (const t of [...things].sort((a, b) => a.y - b.y)) p.blit(t.sp, x0 + t.x - t.sp.ax, y0 + t.y - t.sp.ay);
}

/** przybliżenie nocnej mapy światła (tylko na podglądzie): ciemność razy obraz, ciepłe światło kozy i okien */
function night(x0: number, y0: number, w: number, h: number, lights: [number, number, number, number][]) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const o = (y0 + j) * p.w + x0 + i;
      const v = p.px[o];
      let lr = 0.22;
      let lg = 0.25;
      let lb = 0.4;
      for (const [lx, ly, r, k] of lights) {
        const d = Math.hypot(i - lx, j - ly) / r;
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d) * k;
        lr += f * 1.25;
        lg += f * 0.85;
        lb += f * 0.45;
      }
      const ch = (sh: number, l: number) => Math.min(255, Math.round(((v >> sh) & 255) * Math.min(1.25, l)));
      p.px[o] = (0xff000000 | (ch(16, lb) << 16) | (ch(8, lg) << 8) | ch(0, lr)) >>> 0;
    }
}

const KITCHEN = ['##w###w##', '#kkkkkkk+', '#kkkkkkk+', 'wkkkkkkk+', '#kkkkkkk+', '#++d+++++', '#hhhhhhh+'];
const kitchen = (fire: number | undefined): Placed[] => [
  at({ kind: 'koza', rot: 0, fire }, 2, 1),
  at({ kind: 'drewno', size: 3, seed: 1 }, 3, 1),
  at({ kind: 'drewno', size: 1, seed: 2 }, 1, 1),
  at({ kind: 'kuchenka', rot: 0, seed: 5 }, 5, 1),
  at({ kind: 'lodowka', rot: 1, seed: 6 }, 7, 2),
  at({ kind: 'stol', rot: 0, seed: 7 }, 3, 3),
  at({ kind: 'krzeslo', rot: 0, seed: 8 }, 3, 2),
  at({ kind: 'krzeslo', rot: 2, seed: 9 }, 4, 4),
  at({ kind: 'krzeslo', rot: 3, seed: 10 }, 2, 3),
  at({ kind: 'krzeslo', rot: 1, seed: 11 }, 5, 3),
  at({ kind: 'jedzenie', size: 2, seed: 3 }, 1, 4),
  person(3, 1, 2.5, 2.6),
  person(9, 2, 6.3, 4.4),
];

const ROOM = ['##w###w##', '#ppppppp#', '#ppppppp#', '#ppppppp#', '#ppppppp#', '#ppppppp#', '#+++d+++#', '#hhhhhhh#'];
const room: Placed[] = [
  at({ kind: 'mebloscianka', rot: 0, seed: 3 }, 3, 1),
  at({ kind: 'lozko', rot: 0, seed: 4 }, 1, 1),
  at({ kind: 'lozko', rot: 0, seed: 5 }, 7, 1),
  at({ kind: 'wersalka', rot: 3, seed: 6 }, 1, 3),
  at({ kind: 'lozko', rot: 2, seed: 7 }, 7, 4),
  at({ kind: 'stol', rot: 1, seed: 8 }, 4, 3),
  at({ kind: 'krzeslo', rot: 3, seed: 9 }, 3, 3),
  person(5, 0, 5.6, 5.2),
];

heading('sceny: kuchnia z kozą, stołem i drewnem w składzie (dzień, noc), pokój z łóżkami, podwórko');
const scenesTop = y;
{
  const kw = KITCHEN[0].length * T;
  scene(32, y, KITCHEN, kitchen(undefined), false);
  scene(32 + kw + 24, y, KITCHEN, kitchen(1), true);
  night(32 + kw + 24, y, kw, KITCHEN.length * T, [
    [2.5 * T, 1.6 * T, 4.5 * T, 1.1],
    [2.5 * T, 0.5 * T, 1.6 * T, 0.6],
    [6.5 * T, 0.5 * T, 1.6 * T, 0.6],
    [0.5 * T, 3.5 * T, 1.6 * T, 0.6],
  ]);
  p.text(32, y + KITCHEN.length * T + 4, 'dzień: koza zimna', DIM);
  p.text(32 + kw + 24, y + KITCHEN.length * T + 4, 'noc: koza się pali (przybliżenie mapy światła)', DIM);
  scene(32 + 2 * (kw + 24), y, ROOM, room, false);
  p.text(32 + 2 * (kw + 24), y + ROOM.length * T + 4, 'pokój: łóżka, wersalka, meblościanka', DIM);
  y += ROOM.length * T + 20;
}
{
  // podwórko: suche drzewo przy trzepaku, pień, drewno, obok żywe drzewo
  const W = 12;
  const H = 7;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) grass(p, 32 + i * T, y + j * T, T, T);
  const dead: Tree = { x: 3.2, y: 4.6, kind: 0, r: 2.6, seed: 4242 };
  const live: Tree = { x: 10.2, y: 5.2, kind: 0, r: 2.2, seed: 77 };
  const stump: Tree = { x: 7.6, y: 2.6, kind: 0, r: 2.2, seed: 5 };
  const lt = treeSprite(live);
  const things: Placed[] = [
    tree(deadTreeSprite(dead), dead),
    tree({ ...fromCanvas(lt.canvas), ax: lt.ax, ay: lt.ay }, live),
    tree(stumpSprite(stump), stump),
    at({ kind: 'trzepak', rot: 0, seed: 1 }, 4, 3),
    at({ kind: 'drewno', size: 2, seed: 4 }, 7, 4),
    at({ kind: 'drewno', size: 1, seed: 5 }, 8, 3),
    person(1, 3, 6.6, 4.9),
    person(12, 0, 4.4, 5.6),
  ];
  for (const t of things.sort((a, b) => a.y - b.y)) p.blit(t.sp, 32 + t.x - t.sp.ax, y + t.y - t.sp.ay);
  p.text(32, y + H * T + 4, 'podwórko: suche drzewo przy trzepaku, pień po ściętym, drewno na ziemi, żywe drzewo', DIM);
  y += H * T + 20;
}
const scenesBottom = y;

const used = Math.min(SHEET_H, y + 8);
const sheet = p.crop(0, 0, SHEET_W, used);
sheet.save(path.join(OUT, 'wnetrze-1x.png'));
sheet.save(path.join(OUT, 'wnetrze-2x.png'), 2);
p.crop(0, scenesTop, SHEET_W, scenesBottom - scenesTop).save(path.join(OUT, 'wnetrze-sceny-2x.png'), 2);
console.log(`arkusz ${SHEET_W}×${used}: shots/wnetrze-1x.png, shots/wnetrze-2x.png, shots/wnetrze-sceny-2x.png`);
