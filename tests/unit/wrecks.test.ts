import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { labelRegions } from '../../src/sim/path.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, T, type World } from '../../src/world/world.ts';
import type { Wreck } from '../../src/world/wrecks.ts';
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
    [-90, y],
    [90, y],
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
/** blok przy ulicy i osiedlowy parking obok */
const parkingGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-20, -20, 40, 12), t: { building: 'apartments', 'building:levels': '5' } }],
  r: [street(16)],
  a: [{ p: rect(28, -22, 24, 16), k: 'parking' }],
  w: [],
  poi: [],
});
const demo = (key: string) => {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
};

const LEN = { maluch: 3, polonez: 4 } as const;
const GROUND = new Set<number>([T.ROAD, T.PARKING, T.SIDEWALK, T.GRASS, T.PARK, T.PATH]);
const wrecksOf = (w: World) => w.props.filter((p) => p.kind === 'wrak') as Wreck[];
const cheb = (size: number, a: number, b: number) =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
const tilesOf = (size: number, p: { x: number; y: number; w: number; h: number }) => {
  const out: number[] = [];
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) out.push(y * size + x);
  return out;
};

/** wspólne sprawdzenia wraków */
function checkWrecks(w: World) {
  const size = w.size;
  const wrecks = wrecksOf(w);
  expect(wrecks.length).toBeGreaterThanOrEqual(4);
  expect(wrecks.length).toBeLessThanOrEqual(10);
  const door = w.buildings[w.hq].entrances[0];
  const dx = (door.tile % size) + 0.5;
  const dy = Math.floor(door.tile / size) + 0.5;
  const yard = new Set(w.fence.yard);
  const fence = new Set(w.fence.tiles);
  const gate = tilesOf(size, w.fence.gate);
  // przed bramą: kafelki tuż za nią (od strony ulicy)
  const g = w.fence.gate;
  const back = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ][g.rot];
  const gateOut = gate.map((t) => t + back[1] * size + back[0]);
  const outs = w.buildings.flatMap((b) => b.entrances.map((e) => e.out));
  // wolny pas na wprost bramy (10 m) i pierwszych drzwi siedziby (12 m), 5 m szeroki: droga na ulicę
  const lanes = new Set<number>();
  const lane = (t: number, ox: number, oy: number, depth: number) => {
    const x = t % size;
    const y = Math.floor(t / size);
    for (let k = 1; k <= depth; k++)
      for (let s = -2; s <= 2; s++) lanes.add((y + oy * k + ox * s) * size + x + ox * k + oy * s);
  };
  for (const t of gate) lane(t, back[0], back[1], 10);
  const [fx, fy] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[door.dir] as [number, number];
  lane(door.tile, fx, fy, 12);
  const trunks = new Set(w.trees.map((t) => Math.floor(t.y) * size + Math.floor(t.x)));
  const others = new Set(w.props.filter((p) => p.kind !== 'wrak').flatMap((p) => tilesOf(size, p)));
  const taken = new Set<number>();
  for (const k of wrecks) {
    // podstawa jak w kontrakcie: maluch 3×2, polonez 4×2, przy rot 1 i 3 odwrotnie
    expect(['maluch', 'polonez']).toContain(k.model);
    expect([0, 1, 2, 3]).toContain(k.rot);
    const L = LEN[k.model];
    expect([k.w, k.h]).toEqual(k.rot % 2 === 0 ? [L, 2] : [2, L]);
    // do około 100 m od pierwszych drzwi siedziby
    expect(Math.hypot(k.x + k.w / 2 - dx, k.y + k.h / 2 - dy)).toBeLessThanOrEqual(102);
    const tiles = tilesOf(size, k);
    for (const t of tiles) {
      expect(w.blocked[t], 'podstawa wraku nie blokuje').toBe(1);
      expect(w.bid[t]).toBe(-1);
      expect(GROUND.has(w.terr[t]), `wrak na terenie ${w.terr[t]}`).toBe(true);
      expect(yard.has(t) || fence.has(t) || gate.includes(t), 'wrak za siatką').toBe(false);
      expect(trunks.has(t) || others.has(t), 'wrak na drzewie albo rzeczy').toBe(false);
      expect(taken.has(t), 'wraki na sobie').toBe(false);
      for (const o of gateOut) expect(cheb(size, t, o), 'wrak przed bramą').toBeGreaterThanOrEqual(4);
      for (const o of outs) expect(cheb(size, t, o), 'wrak przed drzwiami').toBeGreaterThanOrEqual(3);
      expect(lanes.has(t), 'wrak na drodze z bramy albo z drzwi siedziby na ulicę').toBe(false);
    }
    for (const t of tiles) taken.add(t);
    // na parkingu albo wzdłuż jezdni: pas jezdni wzdłuż auta, po jednej stronie 3 m wolnej jezdni,
    // a gdy całe stoi na jezdni, z drugiej strony krawężnik
    if (tiles.every((t) => w.terr[t] === T.PARKING)) continue;
    const horiz = k.rot % 2 === 0;
    const L2 = horiz ? k.w : k.h;
    const lane = (k2: number, s: number) => (horiz ? (k.y + k2) * size + k.x + s : (k.y + s) * size + k.x + k2);
    const every = (k2: number, ok: (t: number) => boolean) => [...Array(L2).keys()].every((s) => ok(lane(k2, s)));
    const road = (t: number) => w.terr[t] === T.ROAD;
    expect(every(0, road) || every(1, road), 'wrak nie stoi przy jezdni').toBe(true);
    const open = (t: number) => road(t) && !w.blocked[t];
    const clear = (from: number, step: number) => [0, 1, 2].every((d) => every(from + step * d, open));
    expect(clear(-1, -1) || clear(2, 1), 'na jezdni zostaje mniej niż 3 m').toBe(true);
    if (every(0, road) && every(1, road))
      expect(every(-1, (t) => !road(t)) || every(2, (t) => !road(t)), 'wrak na środku jezdni').toBe(true);
  }
  // osiedle zostaje spójne: co było połączone bez wraków, łączy się i z nimi
  const open = w.blocked.slice();
  for (const t of taken) open[t] = 0;
  const reg0 = labelRegions(open, size);
  const reg = labelRegions(w.blocked, size);
  const home0 = reg0[door.out];
  let split = 0;
  for (let i = 0; i < size * size; i++) if (!w.blocked[i] && reg0[i] === home0 && reg[i] !== reg[door.out]) split++;
  expect(split, 'wraki odcinają kawałek osiedla').toBe(0);
}

describe('wraki samochodów w okolicy siedziby', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: maluchy i polonezy przy jezdni, poza siatką`, () => {
      checkWrecks(buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 }));
    });
  }
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`demo ${key} z ziarnem z adresu`, () => {
      checkWrecks(demo(key));
    });
  }

  it('sztuczny blok i dom przy ulicy', () => {
    checkWrecks(buildWorld(blockGeo(), { seed: 3, size: 160 }));
    checkWrecks(buildWorld(houseGeo(), { seed: 5, size: 160 }));
  });

  it('osiedlowy parking: część wraków stoi na nim', () => {
    const w = buildWorld(parkingGeo(), { seed: 7, size: 160 });
    checkWrecks(w);
    const size = w.size;
    expect(wrecksOf(w).some((k) => tilesOf(size, k).every((t) => w.terr[t] === T.PARKING))).toBe(true);
  });

  it('ten sam świat i ziarno: te same wraki; inne ziarno: inne', () => {
    const a = ADDRESSES[1];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    expect(wrecksOf(buildWorld(geo, { seed: 6 }))).toEqual(wrecksOf(buildWorld(geo, { seed: 6 })));
    const layouts = new Set<string>();
    for (let s = 1; s <= 4; s++) layouts.add(JSON.stringify(wrecksOf(buildWorld(blockGeo(), { seed: s, size: 160 }))));
    expect(layouts.size).toBeGreaterThan(1);
  });
});
