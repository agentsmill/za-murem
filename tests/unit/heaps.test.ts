import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { findPath, labelRegions } from '../../src/sim/path.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import type { Heap } from '../../src/world/heaps.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
const street = (y: number) => ({
  l: [
    [-80, y],
    [80, y],
  ] as Pt[],
  h: 'residential',
});
const blockGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-20, -20, 40, 12), t: { building: 'apartments', 'building:levels': '5' } }],
  r: [street(16)],
  a: [{ p: rect(-60, -6, 120, 14), k: 'park' }],
  w: [],
  poi: [],
});
const houseGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-5, -4, 11, 10), t: { building: 'house', 'building:levels': '2' } }],
  r: [street(16)],
  a: [{ p: rect(-40, -30, 80, 38), k: 'park' }],
  w: [],
  poi: [],
});
const demo = (key: string) => {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
};

const KINDS = new Set(['gruz', 'deski', 'zlom']);
const heapsOf = (w: World) => w.props.filter((p) => KINDS.has(p.kind)) as Heap[];
const cheb = (size: number, a: number, b: number) =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));

/** wspólne sprawdzenia stert materiałów na podwórku */
function checkHeaps(w: World) {
  const size = w.size;
  const heaps = heapsOf(w);
  // 3–6 stert 1×1 m, liczba sztuk całkowita
  expect(heaps.length).toBeGreaterThanOrEqual(3);
  expect(heaps.length).toBeLessThanOrEqual(6);
  for (const h of heaps) {
    expect([h.w, h.h]).toEqual([1, 1]);
    expect(Number.isInteger(h.n) && h.n >= 1).toBe(true);
  }
  // deski i złom wystarczą na 1–2 łaty po 3–4 sztuki, jest też gruz do rozbierania
  const sum = (k: string) => heaps.filter((h) => h.kind === k).reduce((s, h) => s + h.n, 0);
  expect(sum('deski')).toBeGreaterThanOrEqual(3);
  expect(sum('zlom')).toBeGreaterThanOrEqual(3);
  expect(sum('deski') + sum('zlom')).toBeGreaterThanOrEqual(7);
  expect(sum('deski') + sum('zlom')).toBeLessThanOrEqual(9);
  expect(sum('gruz')).toBeGreaterThan(0);
  // na podwórku, na wolnym kafelku, każda osobno
  const tiles = heaps.map((h) => h.y * size + h.x);
  expect(new Set(tiles).size).toBe(tiles.length);
  const yard = new Set(w.fence.yard);
  const g = w.fence.gate;
  const gate: number[] = [];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) gate.push(y * size + x);
  const trzepak = w.props.find((p) => p.kind === 'trzepak')!;
  const tz: number[] = [];
  for (let y = trzepak.y; y < trzepak.y + trzepak.h; y++)
    for (let x = trzepak.x; x < trzepak.x + trzepak.w; x++) tz.push(y * size + x);
  const tree = w.trees[w.dryTree];
  const trunk = Math.floor(tree.y) * size + Math.floor(tree.x);
  const door = w.buildings[w.hq].entrances[0];
  const outs = w.buildings.flatMap((b) => b.entrances.map((e) => e.out));
  for (const t of tiles) {
    expect(yard.has(t), `sterta ${t} poza podwórkiem`).toBe(true);
    expect(w.blocked[t], `sterta ${t} na zajętym kafelku`).toBe(0);
    // z dala od bramy, dziur, drzwi, suchego drzewa i trzepaka
    for (const k of gate) expect(cheb(size, t, k), 'sterta przy bramie').toBeGreaterThanOrEqual(3);
    for (const k of w.fence.hole) expect(cheb(size, t, k), 'sterta przy dziurze').toBeGreaterThanOrEqual(2);
    for (const k of outs) expect(cheb(size, t, k), 'sterta przy drzwiach').toBeGreaterThanOrEqual(2);
    for (const k of tz) expect(cheb(size, t, k), 'sterta przy trzepaku').toBeGreaterThanOrEqual(2);
    expect(cheb(size, t, trunk), 'sterta przy suchym drzewie').toBeGreaterThanOrEqual(2);
  }
  for (const a of tiles) for (const b of tiles) if (a < b) expect(cheb(size, a, b)).toBeGreaterThanOrEqual(2);
  // przy siatce: co najmniej dwie sterty stykają się z siatką (także po skosie)
  const fence = new Set(w.fence.tiles);
  const touching = tiles.filter((t) => {
    const x = t % size;
    const y = (t - x) / size;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (fence.has((y + dy) * size + x + dx)) return true;
    return false;
  });
  expect(touching.length).toBeGreaterThanOrEqual(2);
  // nie na ścieżce od drzwi do bramy i do suchego drzewa
  const onHeap = new Set(tiles);
  const treeSide = [trunk - 1, trunk + 1, trunk - size, trunk + size].find((k) => yard.has(k) && !w.blocked[k])!;
  for (const target of [gate[0], treeSide]) {
    const route = findPath(w.blocked, size, door.out, target);
    expect(route, 'nie ma drogi').toBeTruthy();
    expect(
      route!.some((t) => onHeap.has(t)),
      'sterta na ścieżce',
    ).toBe(false);
  }
  // sterty są przechodnie, a gdyby blokowały, podwórko i tak zostaje w jednym kawałku z drzwiami
  const walled = w.blocked.slice();
  for (const t of tiles) walled[t] = 1;
  const reg = labelRegions(walled, size);
  let cut = 0;
  for (const t of w.fence.yard) if (!walled[t] && reg[t] !== reg[door.out]) cut++;
  expect(cut, 'sterty rozcinają podwórko').toBe(0);
}

describe('sterty materiałów na podwórku', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: gruz, deski i złom przy siatce`, () => {
      checkHeaps(buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 }));
    });
  }
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`demo ${key} z ziarnem z adresu`, () => {
      checkHeaps(demo(key));
    });
  }

  it('sztuczny blok i dom', () => {
    checkHeaps(buildWorld(blockGeo(), { seed: 3, size: 128 }));
    checkHeaps(buildWorld(houseGeo(), { seed: 5, size: 96 }));
  });

  it('ten sam świat i ziarno: te same sterty; trzepak zostaje pierwszy', () => {
    const a = ADDRESSES[2];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const w1 = buildWorld(geo, { seed: 8 });
    const w2 = buildWorld(geo, { seed: 8 });
    expect(heapsOf(w2)).toEqual(heapsOf(w1));
    expect(w1.props[0].kind).toBe('trzepak');
    const layouts = new Set<string>();
    for (let s = 1; s <= 5; s++) layouts.add(JSON.stringify(heapsOf(buildWorld(blockGeo(), { seed: s, size: 128 }))));
    expect(layouts.size).toBeGreaterThan(1);
  });
});
