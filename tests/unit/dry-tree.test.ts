import { describe, expect, it } from 'vitest';
import { labelRegions } from '../../src/sim/path.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, T, type World } from '../../src/world/world.ts';
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
/** blok, przed wejściem park z drzewami, dalej ulica */
const parkGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-20, -20, 40, 12), t: { building: 'apartments', 'building:levels': '10' } }],
  r: [street(20)],
  a: [{ p: rect(-60, -6, 120, 20), k: 'park' }],
  w: [],
  poi: [],
});
/** blok wśród działek: na działkach nie rosną drzewa, więc suche trzeba posadzić */
const allotGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-12, -6, 24, 12), t: { building: 'apartments', 'building:levels': '4' } }],
  r: [street(16)],
  a: [{ p: rect(-64, -64, 128, 128), k: 'allot' }],
  w: [],
  poi: [],
});

const count = (reg: Int32Array, label: number) => {
  let n = 0;
  for (const r of reg) if (r === label) n++;
  return n;
};

/** kroki od wyjścia z drzwi po wolnych kafelkach bez jezdni (przyszłe podwórko za siatką); −1 poza zasięgiem */
function yardSteps(w: World, from: number): Int32Array {
  const size = w.size;
  const steps = new Int32Array(size * size).fill(-1);
  const q = [from];
  steps[from] = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % size;
    for (const n of [x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1, c - size, c + size]) {
      if (n < 0 || n >= size * size || steps[n] >= 0 || w.blocked[n] || w.terr[n] === T.ROAD) continue;
      steps[n] = steps[c] + 1;
      q.push(n);
    }
  }
  return steps;
}

/** wspólne sprawdzenia suchego drzewa i trzepaka */
function checkYard(w: World) {
  const size = w.size;
  const door = w.buildings[w.hq].entrances[0];
  // suche drzewo: jest, to nie krzak, stoi 6–16 m od pierwszych drzwi frontowych
  expect(w.dryTree).toBeGreaterThanOrEqual(0);
  const t = w.trees[w.dryTree];
  expect(t).toBeTruthy();
  expect(t.kind).not.toBe(2);
  const ax = (door.tile % size) + 0.5;
  const ay = Math.floor(door.tile / size) + 0.5;
  const d = Math.hypot(t.x - ax, t.y - ay);
  expect(d).toBeGreaterThanOrEqual(6);
  expect(d).toBeLessThanOrEqual(16);
  // da się do niego dojść z drzwi: obok pnia wolny kafelek w tym samym obszarze co wyjście z drzwi
  const reg = labelRegions(w.blocked, size);
  const ti = Math.floor(t.y) * size + Math.floor(t.x);
  expect(w.blocked[ti]).toBe(1);
  expect([ti - 1, ti + 1, ti - size, ti + size].some((k) => !w.blocked[k] && reg[k] === reg[door.out])).toBe(true);
  // w przyszłym podwórku za siatką: od drzwi do pnia najwyżej 24 kroki i bez przechodzenia przez jezdnię
  const yard = yardSteps(w, door.out);
  const near = (i: number) => yard[i] >= 0 && yard[i] <= 24;
  expect([ti - 1, ti + 1, ti - size, ti + size].some(near), 'suche drzewo poza podwórkiem').toBe(true);
  // trzepak: jeden, 3×1 m, 2–4 m od pnia
  const trzepaki = w.props.filter((p) => p.kind === 'trzepak');
  expect(trzepaki).toHaveLength(1);
  const p = trzepaki[0];
  expect([p.w, p.h].sort()).toEqual([1, 3]);
  const pd = Math.hypot(Math.max(p.x - t.x, 0, t.x - (p.x + p.w)), Math.max(p.y - t.y, 0, t.y - (p.y + p.h)));
  expect(pd).toBeGreaterThanOrEqual(2);
  expect(pd).toBeLessThanOrEqual(4);
  // nie na budynku, jezdni ani drzewie
  const trunks = new Set(w.trees.map((q) => Math.floor(q.y) * size + Math.floor(q.x)));
  const tiles: number[] = [];
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) tiles.push(y * size + x);
  for (const i of tiles) {
    expect(w.bid[i]).toBe(-1);
    expect(w.terr[i]).not.toBe(T.ROAD);
    expect(trunks.has(i)).toBe(false);
  }
  // blokują tylko słupki na końcach, pod drążkiem da się przejść
  expect(tiles.map((i) => w.blocked[i])).toEqual([1, 0, 1]);
  // trzepak też na podwórku i nie przy samej jezdni
  expect(near(tiles[1]), 'trzepak poza podwórkiem').toBe(true);
  for (let y = p.y - 1; y <= p.y + p.h; y++)
    for (let x = p.x - 1; x <= p.x + p.w; x++) expect(w.terr[y * size + x], 'trzepak przy jezdni').not.toBe(T.ROAD);
  // słupki niczego nie odcinają: bez nich obszar drzwi jest większy dokładnie o te dwa kafelki
  const open = w.blocked.slice();
  open[tiles[0]] = 0;
  open[tiles[2]] = 0;
  const reg2 = labelRegions(open, size);
  expect(count(reg2, reg2[door.out])).toBe(count(reg, reg[door.out]) + 2);
}

describe('suche drzewo i trzepak', () => {
  it('pień każdego drzewa stoi na zablokowanym kafelku (także po zaokrągleniu pozycji)', () => {
    for (const a of ADDRESSES) {
      const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
      const loose = w.trees.filter((t) => !w.blocked[Math.floor(t.y) * w.size + Math.floor(t.x)]);
      expect(loose, a.key).toEqual([]);
    }
  });

  for (const a of ADDRESSES) {
    it(`${a.key}: suche drzewo z trzepakiem niedaleko drzwi siedziby`, () => {
      checkYard(buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 }));
    });
  }

  it('blok przy parku: jedno z drzew w parku przed wejściem', () => {
    const w = buildWorld(parkGeo(), { seed: 4, size: 128 });
    checkYard(w);
    const door = w.buildings[w.hq].entrances[0];
    expect(door.dir).toBe('S');
    const t = w.trees[w.dryTree];
    expect(t.y).toBeGreaterThan(Math.floor(door.tile / w.size) + 1);
    expect(w.terr[Math.floor(t.y) * w.size + Math.floor(t.x)]).toBe(T.PARK);
  });

  it('blok wśród działek bez drzew: suche drzewo posadzone na wolnym gruncie', () => {
    const w = buildWorld(allotGeo(), { seed: 2, size: 128 });
    expect(w.trees).toHaveLength(1);
    expect(w.dryTree).toBe(0);
    const t = w.trees[0];
    expect(w.terr[Math.floor(t.y) * w.size + Math.floor(t.x)]).toBe(T.ALLOT);
    checkYard(w);
  });

  it('ten sam świat i ziarno: to samo suche drzewo i trzepak', () => {
    const a = ADDRESSES[1];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const w1 = buildWorld(geo, { seed: 5 });
    const w2 = buildWorld(geo, { seed: 5 });
    expect(w2.dryTree).toBe(w1.dryTree);
    expect(w2.trees[w2.dryTree]).toEqual(w1.trees[w1.dryTree]);
    expect(w2.props).toEqual(w1.props);
    const w3 = buildWorld(allotGeo(), { seed: 2, size: 128 });
    const w4 = buildWorld(allotGeo(), { seed: 2, size: 128 });
    expect(w4.trees).toEqual(w3.trees);
    expect(w4.props).toEqual(w3.props);
  });
});
