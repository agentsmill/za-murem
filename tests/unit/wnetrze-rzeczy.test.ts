/* Grafika zastępcza wnętrza i rzeczy (M1): determinizm, wymiary względem podstawy, rysowanie
   tylko w buforze, ładowanie w Node bez DOM i w workerze. */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { rgba } from '../../src/render/art/palette.ts';
import {
  BASE,
  BUILD_KINDS,
  deadTreeSprite,
  FIRE_FRAMES,
  FURNITURE_KINDS,
  footprint,
  type Rot,
  type Sprite,
  stumpSprite,
  type ThingSpec,
  thingSprite,
  WRECK_MODELS,
} from '../../src/render/art/rzeczy.ts';
import { treeSprite } from '../../src/render/art/trees.ts';
import {
  drawInteriorTile,
  type Face,
  type InteriorTile,
  interiorColor,
  maskOf,
  NB,
  ROOM_KINDS,
} from '../../src/render/art/wnetrze.ts';
import type { Tree } from '../../src/world/world.ts';
import { fakeDocument } from '../../tools/arkusz-plotno.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ROTS: Rot[] = [0, 1, 2, 3];
const DIRS = ['N', 'E', 'S', 'W'] as const;
const OUT_BITS = [NB.N, NB.E, NB.S, NB.W];

/** suma kontrolna FNV-1a po pikselach */
function fnv(px: Uint32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i++) {
    h = Math.imul(h ^ (px[i] & 0xffff), 16777619);
    h = Math.imul(h ^ (px[i] >>> 16), 16777619);
  }
  return h >>> 0;
}

/** wszystkie warianty kafelków (maski ścian z ukosami w kilku układach) */
function allTiles(): InteriorTile[] {
  const t: InteriorTile[] = [];
  const faces: Face[] = [...ROOM_KINDS, 'out'];
  for (const room of ROOM_KINDS)
    for (const walls of [0, 0xff, NB.N | NB.W | NB.NW]) t.push({ kind: 'floor', room, walls });
  for (let mask = 0; mask < 256; mask++)
    t.push({ kind: 'wall', mask, outer: (mask & 1) === 1, out: mask & 0xf, face: 'pokoj' });
  for (const face of faces)
    for (const outer of [false, true]) t.push({ kind: 'wall', mask: NB.E | NB.W, outer, out: outer ? NB.S : 0, face });
  for (const vertical of [false, true])
    for (const entrance of [false, true]) for (const face of faces) t.push({ kind: 'door', vertical, entrance, face });
  for (const out of OUT_BITS)
    for (const lit of [false, true])
      for (const room of ROOM_KINDS)
        for (const mask of [NB.E | NB.W, NB.N | NB.S, NB.E | NB.W | NB.S])
          t.push({ kind: 'window', mask, out, room, lit });
  for (const up of DIRS) for (let mask = 0; mask < 16; mask++) t.push({ kind: 'stairs', up, mask });
  return t;
}

function allSpecs(): ThingSpec[] {
  const s: ThingSpec[] = [];
  for (const kind of FURNITURE_KINDS)
    for (const rot of ROTS) for (const seed of [0, 1, 2, 3, 99, -7]) s.push({ kind, rot, seed });
  for (const rot of ROTS) for (let fire = 0; fire < FIRE_FRAMES; fire++) s.push({ kind: 'koza', rot, fire, seed: 5 });
  for (const size of [1, 2, 3] as const)
    for (const seed of [0, 1, 2, 3]) {
      s.push({ kind: 'drewno', size, seed });
      s.push({ kind: 'jedzenie', size, seed });
    }
  for (const r of [1, 2.2, 3.6]) for (const seed of [0, 5]) s.push({ kind: 'pien', r, seed });
  for (const rot of ROTS) for (const seed of [0, 1, 2, 3]) s.push({ kind: 'trzepak', rot, seed });
  // podwórko: siatka we wszystkich maskach i stanach, brama, ognisko, materiały, warta
  for (let mask = 0; mask < 16; mask++)
    for (const state of ['cala', 'dziura', 'lata'] as const)
      for (const post of [undefined, true, false]) s.push({ kind: 'siatka', mask, state, post, seed: mask * 7 + 1 });
  for (const rot of ROTS)
    for (const open of [false, true]) for (const seed of [0, 9]) s.push({ kind: 'brama', rot, open, seed });
  for (const style of ['krag', 'beczka'] as const)
    for (const fire of [undefined, 0, 1, 2]) for (const seed of [0, 4]) s.push({ kind: 'ognisko', style, fire, seed });
  for (const kind of ['gruz', 'deski', 'zlom', 'czesci', 'leki'] as const)
    for (const size of [1, 2, 3] as const) for (const seed of [0, 1, 2, 77]) s.push({ kind, size, seed });
  for (const rot of ROTS)
    for (const seed of [0, 3]) {
      s.push({ kind: 'budka', rot, lit: seed > 0, seed });
      s.push({ kind: 'fotel', rot, seed });
    }
  for (const lit of [false, true]) for (const seed of [0, 2]) s.push({ kind: 'lampa', lit, seed });
  // garnek z posiłkiem (na podłodze i na stole) i wraki we wszystkich ustawieniach
  for (const size of [0, 1, 2, 3] as const)
    for (const table of [false, true]) for (const seed of [0, 1, 2, 3]) s.push({ kind: 'posilek', size, table, seed });
  for (const model of WRECK_MODELS)
    for (const rot of ROTS)
      for (const seed of [0, 1, 5, 11])
        for (const stage of [undefined, 1, 2] as const) s.push({ kind: 'wrak', model, rot, seed, stage });
  // budowle M2, śmieci i zepsute meble
  for (const kind of BUILD_KINDS) for (const rot of ROTS) for (const seed of [0, 3, 8]) s.push({ kind, rot, seed });
  for (const size of [1, 2, 3] as const) for (const seed of [0, 4, 9]) s.push({ kind: 'smieci', size, seed });
  for (const kind of FURNITURE_KINDS) for (const rot of ROTS) s.push({ kind, rot, seed: 6, broken: true });
  for (const rot of ROTS) s.push({ kind: 'kuchenka', rot, seed: 6, burnt: true });
  // ogród domu: sznur z praniem i bez (ten sam rozmiar), kompost, buda, huśtawka, ławka
  for (const rot of ROTS)
    for (const seed of [0, 1, 7]) {
      s.push({ kind: 'sznur', rot, seed });
      s.push({ kind: 'sznur', rot, pranie: true, seed });
      for (const kind of ['kompost', 'buda', 'hustawka', 'lawka'] as const) s.push({ kind, rot, seed });
    }
  return s;
}

/** klucz rozmiaru: co wolno zmieniać rozmiar sprite'a (rodzaj, ustawienie, wielkość, styl) */
function sizeKey(s: ThingSpec): string {
  switch (s.kind) {
    case 'drewno':
    case 'jedzenie':
    case 'gruz':
    case 'deski':
    case 'zlom':
    case 'czesci':
    case 'leki':
      return `${s.kind} ${s.size}`;
    case 'pien':
      return `pien ${s.r}`;
    case 'siatka':
    case 'lampa':
    case 'krew':
      return s.kind;
    case 'ognisko':
      return `ognisko ${s.style}`;
    case 'posilek':
      return `posilek ${!!s.table}`;
    case 'wrak':
      return `wrak ${s.model} ${s.rot}`;
    case 'smieci':
      return `smieci ${s.size}`;
    default:
      return `${s.kind} ${s.rot}`;
  }
}

function allTrees(): Tree[] {
  const t: Tree[] = [];
  for (const kind of [0, 1, 2] as const)
    for (const r of [1, 1.3, 1.8, 2.6, 3.6])
      for (const seed of [0, 17, 123456]) t.push({ x: 5.5, y: 7.25, kind, r, seed });
  return t;
}

/** najniższy wiersz z nieprzezroczystym pikselem */
function lowestOpaqueRow(sp: Sprite): number {
  for (let y = sp.h - 1; y >= 0; y--) for (let x = 0; x < sp.w; x++) if (sp.px[y * sp.w + x] >>> 24 === 255) return y;
  return -1;
}

describe('kafelki wnętrza', () => {
  it('te same argumenty dają te same piksele, nigdy kolor błędu', () => {
    const magenta = rgba(0xff00ff);
    for (const t of allTiles()) {
      const a = new Uint32Array(32 * 32);
      const b = new Uint32Array(32 * 32);
      drawInteriorTile(a, 32, 0, 0, t, 13, 21, 7);
      drawInteriorTile(b, 32, 0, 0, t, 13, 21, 7);
      expect(fnv(b)).toBe(fnv(a));
      expect(a.includes(magenta), JSON.stringify(t)).toBe(false);
      expect(a.every((v) => v >>> 24 === 255)).toBe(true);
    }
  });

  it('wzór zależy od miejsca i ziarna, a warianty naprawdę się różnią', () => {
    const draw = (t: InteriorTile, tx: number, seed: number) => {
      const a = new Uint32Array(32 * 32);
      drawInteriorTile(a, 32, 0, 0, t, tx, 3, seed);
      return fnv(a);
    };
    const floor: InteriorTile = { kind: 'floor', room: 'klatka' };
    expect(draw(floor, 1, 0)).not.toBe(draw(floor, 2, 0));
    expect(draw(floor, 1, 0)).not.toBe(draw(floor, 1, 1));
    const win = (lit: boolean): InteriorTile => ({
      kind: 'window',
      mask: NB.E | NB.W,
      out: NB.N,
      room: 'kuchnia',
      lit,
    });
    expect(draw(win(true), 1, 0)).not.toBe(draw(win(false), 1, 0));
    const rooms = new Set(ROOM_KINDS.map((room) => draw({ kind: 'floor', room }, 1, 0)));
    expect(rooms.size).toBe(ROOM_KINDS.length);
  });

  it('kolor piksela zgadza się z rysowaniem kafelka', () => {
    const t: InteriorTile = { kind: 'wall', mask: NB.E | NB.W, outer: true, out: NB.S, face: 'out' };
    const a = new Uint32Array(32 * 32);
    drawInteriorTile(a, 32, 0, 0, t, 4, 5, 9);
    for (const [x, y] of [
      [0, 0],
      [31, 31],
      [7, 25],
      [16, 19],
    ])
      expect(a[y * 32 + x]).toBe(rgba(interiorColor(t, 4, 5, x, y, 9)));
  });

  it('rysuje tylko w buforze: przycięcie na brzegach, bez zawijania wierszy', () => {
    const W = 50;
    const H = 40;
    const SENT = 0x12345678;
    const t: InteriorTile = { kind: 'floor', room: 'pokoj' };
    for (const scale of [32, 8])
      for (const [ox, oy] of [
        [-10, -5],
        [40, 30],
        [45, -20],
        [100, 100],
        [-40, 10],
        [-31, -31],
        [W - 1, H - 1],
        [9, 4],
      ]) {
        const buf = new Uint32Array(W * H).fill(SENT);
        drawInteriorTile(buf, W, ox, oy, t, 2, 2, 0, scale);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const inside = x >= ox && x < ox + scale && y >= oy && y < oy + scale;
            expect(buf[y * W + x] !== SENT, `${scale} ${ox},${oy} → ${x},${y}`).toBe(inside);
          }
      }
  });

  it('maska sąsiadów z predykatu', () => {
    expect(maskOf(() => false)).toBe(0);
    expect(maskOf(() => true)).toBe(255);
    expect(maskOf((dx, dy) => dx === 0 && dy === -1)).toBe(NB.N);
    expect(maskOf((dx, dy) => dx === 1 && dy === 1)).toBe(NB.SE);
  });
});

describe('rzeczy', () => {
  it('te same argumenty dają te same piksele', () => {
    for (const spec of allSpecs()) {
      const a = thingSprite(spec);
      const b = thingSprite(spec);
      expect([b.w, b.h, b.ax, b.ay]).toEqual([a.w, a.h, a.ax, a.ay]);
      expect(fnv(b.px), JSON.stringify(spec)).toBe(fnv(a.px));
    }
    for (const t of allTrees()) {
      expect(fnv(deadTreeSprite(t).px)).toBe(fnv(deadTreeSprite(t).px));
      expect(fnv(stumpSprite(t).px)).toBe(fnv(stumpSprite(t).px));
    }
  });

  it('rozmiar i kotwica zależą tylko od rodzaju i ustawienia, nie od ziarna ani ognia', () => {
    const seen = new Map<string, string>();
    for (const spec of allSpecs()) {
      const sp = thingSprite(spec);
      const dims = `${sp.w}×${sp.h} @${sp.ax},${sp.ay}`;
      const k = sizeKey(spec);
      if (!seen.has(k)) seen.set(k, dims);
      expect(dims, k).toBe(seen.get(k));
    }
  });

  it('podstawa mieści się w sprite, kotwica na środku jej dolnej krawędzi', () => {
    for (const spec of allSpecs()) {
      const sp = thingSprite(spec);
      const fp = footprint(spec);
      expect(sp.px.length).toBe(sp.w * sp.h);
      const x0 = sp.ax - (fp.w * 32) / 2;
      const y0 = sp.ay - fp.h * 32;
      expect(Number.isInteger(x0) && Number.isInteger(y0)).toBe(true);
      expect(x0 >= 0 && y0 >= 0 && x0 + fp.w * 32 <= sp.w && sp.ay <= sp.h, JSON.stringify(spec)).toBe(true);
      // nic poza obrysem nie wystaje pod podstawę (rura kozy przy ścianie od południa idzie w okno,
      // brama otwierana na południe ma tam skrzydła)
      if (!((spec.kind === 'koza' || spec.kind === 'brama') && spec.rot === 2))
        expect(lowestOpaqueRow(sp), JSON.stringify(spec)).toBeLessThanOrEqual(sp.ay);
      // przezroczyste piksele są całe zerowe
      expect(sp.px.every((v) => v >>> 24 !== 0 || v === 0)).toBe(true);
    }
  });

  it('podstawa mebli zgodna z kontraktem wnętrza, obrót zamienia boki', () => {
    expect(BASE).toEqual({
      koza: [1, 1],
      stol: [2, 1],
      krzeslo: [1, 1],
      kuchenka: [1, 1],
      lodowka: [1, 1],
      lozko: [1, 2],
      wersalka: [2, 1],
      mebloscianka: [3, 1],
      wanna: [2, 1],
      sedes: [1, 1],
      umywalka: [1, 1],
    });
    for (const kind of FURNITURE_KINDS)
      for (const rot of ROTS) {
        const [a, b] = BASE[kind];
        expect(footprint({ kind, rot })).toEqual(rot % 2 ? { w: b, h: a } : { w: a, h: b });
      }
    expect(footprint({ kind: 'trzepak', rot: 1 })).toEqual({ w: 1, h: 3 });
    expect(footprint({ kind: 'drewno', size: 3 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ kind: 'jedzenie', size: 1 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ kind: 'pien', r: 3 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ kind: 'brama', rot: 0 })).toEqual({ w: 2, h: 1 });
    expect(footprint({ kind: 'brama', rot: 3 })).toEqual({ w: 1, h: 2 });
    for (const kind of ['gruz', 'deski', 'zlom', 'czesci', 'leki'] as const)
      expect(footprint({ kind, size: 2 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ kind: 'siatka', mask: NB.E | NB.W })).toEqual({ w: 1, h: 1 });
  });

  it('warianty się różnią: ustawienia, klatki ognia, wielkości stosu', () => {
    for (const kind of FURNITURE_KINDS) {
      const sums = new Set(ROTS.map((rot) => fnv(thingSprite({ kind, rot, seed: 1 }).px)));
      expect(sums.size, kind).toBe(4);
    }
    const fire = new Set([undefined, 0, 1, 2].map((f) => fnv(thingSprite({ kind: 'koza', rot: 0, fire: f }).px)));
    expect(fire.size).toBe(4);
    // podwórko: stany naprawdę się różnią
    const sum = (spec: ThingSpec) => fnv(thingSprite(spec).px);
    const states = new Set(
      (['cala', 'dziura', 'lata'] as const).map((state) => sum({ kind: 'siatka', mask: NB.E | NB.W, state })),
    );
    expect(states.size).toBe(3);
    const vStates = new Set(
      (['cala', 'dziura', 'lata'] as const).map((state) => sum({ kind: 'siatka', mask: NB.N | NB.S, state })),
    );
    expect(vStates.size).toBe(3);
    const masks = new Set(Array.from({ length: 16 }, (_, mask) => sum({ kind: 'siatka', mask })));
    expect(masks.size).toBe(16);
    for (const rot of ROTS) expect(sum({ kind: 'brama', rot, open: true })).not.toBe(sum({ kind: 'brama', rot }));
    for (const style of ['krag', 'beczka'] as const) {
      const fires = new Set([undefined, 0, 1, 2].map((fire) => sum({ kind: 'ognisko', style, fire })));
      expect(fires.size, style).toBe(4);
    }
    expect(sum({ kind: 'lampa', lit: true })).not.toBe(sum({ kind: 'lampa' }));
    expect(sum({ kind: 'budka', rot: 0, lit: true })).not.toBe(sum({ kind: 'budka', rot: 0 }));
    for (const kind of ['drewno', 'jedzenie', 'gruz', 'deski', 'zlom', 'czesci', 'leki'] as const) {
      const piles = new Set([1, 2, 3].map((size) => fnv(thingSprite({ kind, size: size as 1 | 2 | 3 }).px)));
      expect(piles.size, kind).toBe(3);
    }
    // wrak: cały, przeszukany i szkielet wyglądają inaczej
    for (const model of WRECK_MODELS) {
      const looks = new Set(
        ([undefined, 1, 2] as const).map((stage) =>
          fnv(thingSprite({ kind: 'wrak', model, rot: 0, seed: 5, stage }).px),
        ),
      );
      expect(looks.size, model).toBe(3);
    }
  });

  it('suche drzewo ma tę samą ramkę i kotwicę co żywe drzewo z trees.ts', () => {
    const had = 'document' in globalThis;
    fakeDocument();
    try {
      for (const t of allTrees()) {
        const live = treeSprite(t);
        const dead = deadTreeSprite(t);
        expect([dead.w, dead.h, dead.ax, dead.ay]).toEqual([live.canvas.width, live.canvas.height, live.ax, live.ay]);
        // pień stoi u podstawy: nieprzezroczysty piksel tuż nad kotwicą
        const x = Math.round(dead.ax);
        const y = Math.floor(dead.ay) - 1;
        expect(dead.px[y * dead.w + x] >>> 24, `drzewo ${t.kind} ${t.r}`).toBe(255);
        // pień po ściętym drzewie: kotwica na dole podstawy
        const st = stumpSprite(t);
        expect(st.ax > 0 && st.ax < st.w && st.ay > 0 && st.ay <= st.h).toBe(true);
      }
    } finally {
      if (!had) delete (globalThis as { document?: unknown }).document;
    }
  });
});

describe('środowiska', () => {
  it('moduły ładują się w Node bez DOM (tak jak narzędzia w tools/)', () => {
    const code = `
      const w = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'src/render/art/wnetrze.ts')).href)});
      const r = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'src/render/art/rzeczy.ts')).href)});
      if (typeof document !== 'undefined') throw new Error('jest DOM');
      const buf = new Uint32Array(32 * 32);
      w.drawInteriorTile(buf, 32, 0, 0, { kind: 'floor', room: 'kuchnia' }, 1, 1);
      const sp = r.thingSprite({ kind: 'koza', rot: 0, fire: 1 });
      console.log(sp.w, sp.h, buf[0] !== 0);
    `;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    const sp = thingSprite({ kind: 'koza', rot: 0, fire: 1 });
    expect(out.trim()).toBe(`${sp.w} ${sp.h} true`);
  });

  it('w workerze wychodzą te same piksele co w głównym wątku', async () => {
    const specs: ThingSpec[] = [
      { kind: 'koza', rot: 1, fire: 2, seed: 3 },
      { kind: 'mebloscianka', rot: 0, seed: 8 },
      { kind: 'drewno', size: 3, seed: 2 },
      { kind: 'trzepak', rot: 1, seed: 1 },
    ];
    const tree: Tree = { x: 3, y: 4, kind: 0, r: 2.4, seed: 4242 };
    const tile: InteriorTile = { kind: 'window', mask: NB.E | NB.W, out: NB.S, room: 'pokoj', lit: true };
    const code = `
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const w = await import(workerData.wnetrze);
        const r = await import(workerData.rzeczy);
        const sums = workerData.specs.map((s) => Array.from(r.thingSprite(s).px));
        sums.push(Array.from(r.deadTreeSprite(workerData.tree).px));
        const buf = new Uint32Array(32 * 32);
        w.drawInteriorTile(buf, 32, 0, 0, workerData.tile, 6, 7, 3);
        sums.push(Array.from(buf));
        parentPort.postMessage(sums);
      })();
    `;
    const result = await new Promise<number[][]>((resolve, reject) => {
      const worker = new Worker(code, {
        eval: true,
        workerData: {
          wnetrze: pathToFileURL(path.join(ROOT, 'src/render/art/wnetrze.ts')).href,
          rzeczy: pathToFileURL(path.join(ROOT, 'src/render/art/rzeczy.ts')).href,
          specs,
          tree,
          tile,
        },
      });
      worker.once('message', (m) => {
        resolve(m);
        worker.terminate();
      });
      worker.once('error', reject);
    });
    const buf = new Uint32Array(32 * 32);
    drawInteriorTile(buf, 32, 0, 0, tile, 6, 7, 3);
    const expected = [...specs.map((s) => thingSprite(s).px), deadTreeSprite(tree).px, buf];
    expect(result.map((a) => fnv(Uint32Array.from(a)))).toEqual(expected.map(fnv));
  });
});
