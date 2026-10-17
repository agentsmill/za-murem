import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { findPath, labelRegions } from '../../src/sim/path.ts';
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
/** blok przy ulicy, między nimi park */
const blockGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-20, -20, 40, 12), t: { building: 'apartments', 'building:levels': '5' } }],
  r: [street(16)],
  a: [{ p: rect(-60, -6, 120, 14), k: 'park' }],
  w: [],
  poi: [],
});
/** chodnik (osiedlowy, bez jezdni) wzdłuż osi x na wysokości y */
const footway = (y: number) => ({
  l: [
    [-80, y],
    [80, y],
  ] as Pt[],
  h: 'footway',
});
/** blok przy ulicy z chodnikiem równoległym do fasady y m od niej (fasada z drzwiami na y = −8) */
const footwayGeo = (y: number): Geo => ({ ...blockGeo(), r: [street(16), footway(y)] });
/** dom w ogródku przy ulicy */
const houseGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-5, -4, 11, 10), t: { building: 'house', 'building:levels': '2' } }],
  r: [street(16)],
  a: [{ p: rect(-40, -30, 80, 38), k: 'park' }],
  w: [],
  poi: [],
});
/** dema gry z ziarnem z adresu, jak w przeglądarce */
const demo = (key: string) => {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
};

/** kierunki rot: 0 północ, 1 wschód, 2 południe, 3 zachód */
const STEP: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const DIRS: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const PAVED = new Set<number>([T.ROAD, T.SIDEWALK, T.PATH, T.PARKING]);

const gateTiles = (w: World) => {
  const g = w.fence.gate;
  const out: number[] = [];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) out.push(y * w.size + x);
  return out;
};
const cheb = (size: number, a: number, b: number) =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
/** odległość punktu od odcinka */
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
};
const walkTiles = (w: World, tiles: number[]) => tiles.filter((t) => w.terr[t] === T.SIDEWALK);

/** wspólne sprawdzenia siatki, bramy, dziur i podwórka */
function checkFence(w: World) {
  const { size, fence } = w;
  const N = size * size;
  const hq = w.buildings[w.hq];
  const door = hq.entrances[0];
  // kształt danych
  expect(fence.tiles.length).toBeGreaterThan(10);
  expect(fence.tiles).toEqual([...fence.tiles].sort((a, b) => a - b));
  expect(new Set(fence.tiles).size).toBe(fence.tiles.length);
  expect(fence.yard).toEqual([...fence.yard].sort((a, b) => a - b));
  expect(fence.hole.length).toBeGreaterThanOrEqual(2);
  expect(fence.hole.length).toBeLessThanOrEqual(4);
  const onFence = new Set(fence.tiles);
  const inYard = new Set(fence.yard);
  for (const h of fence.hole) expect(onFence.has(h)).toBe(true);
  const g = fence.gate;
  expect([g.w, g.h].sort()).toEqual([1, 2]);
  expect(g.w === 2 ? [0, 2] : [1, 3]).toContain(g.rot);
  const gates = gateTiles(w);
  for (const t of gates) {
    expect(onFence.has(t)).toBe(false);
    expect(inYard.has(t)).toBe(false);
  }
  // siatka i brama nie stoją na jezdni, budynku, pniu ani wyjściu z drzwi
  const trunks = new Set(w.trees.map((t) => Math.floor(t.y) * size + Math.floor(t.x)));
  const outs = new Set(w.buildings.flatMap((b) => b.entrances.map((e) => e.out)));
  for (const t of [...fence.tiles, ...gates]) {
    expect(w.terr[t], `siatka na jezdni ${t}`).not.toBe(T.ROAD);
    expect(w.bid[t], `siatka na budynku ${t}`).toBe(-1);
    expect(trunks.has(t), `siatka na drzewie ${t}`).toBe(false);
    expect(outs.has(t), `siatka przed drzwiami ${t}`).toBe(false);
  }
  // blocked: siatka 1, dziury i brama 0
  const holes = new Set(fence.hole);
  for (const t of fence.tiles) expect(w.blocked[t]).toBe(holes.has(t) ? 0 : 1);
  for (const t of gates) expect(w.blocked[t]).toBe(0);
  // podwórko bez budynków, z wyjściem z pierwszych drzwi, suchym drzewem i trzepakiem
  for (const t of fence.yard) expect(w.bid[t]).toBe(-1);
  expect(inYard.has(door.out), 'drzwi siedziby poza podwórkiem').toBe(true);
  const tree = w.trees[w.dryTree];
  expect(inYard.has(Math.floor(tree.y) * size + Math.floor(tree.x)), 'suche drzewo poza podwórkiem').toBe(true);
  // trzepak i sterty w podwórku (wraki stoją poza siatką)
  for (const p of w.props)
    if (p.kind !== 'wrak')
      for (let y = p.y; y < p.y + p.h; y++)
        for (let x = p.x; x < p.x + p.w; x++) expect(inYard.has(y * size + x), `${p.kind} poza podwórkiem`).toBe(true);
  // brama w linii siatki: skrzydła otwierają się do podwórka, z drugiej strony wolne wyjście
  const [rx, ry] = STEP[g.rot];
  const outside: number[] = [];
  for (const t of gates) {
    const x = t % size;
    const y = (t - x) / size;
    expect(inYard.has((y + ry) * size + x + rx), 'brama nie otwiera się do podwórka').toBe(true);
    const o = (y - ry) * size + x - rx;
    expect(inYard.has(o) || onFence.has(o) || w.blocked[o] === 1, 'za bramą nie ma przejścia').toBe(false);
    outside.push(o);
  }
  // od strony ulicy albo chodnika: najwyżej 3 m za bramą jest chodnik, ścieżka, parking albo jezdnia
  const paved = gates.some((t) => {
    const x = t % size;
    const y = (t - x) / size;
    for (let k = 1; k <= 3; k++) if (PAVED.has(w.terr[(y - ry * k) * size + x - rx * k])) return true;
    return false;
  });
  expect(paved, 'brama nie wychodzi na ulicę ani chodnik').toBe(true);
  // suche drzewo z dala od bramy: brzeg korony co najmniej 5 m od każdego kafelka bramy
  const cx = (t: number) => (t % size) + 0.5;
  const cy = (t: number) => Math.floor(t / size) + 0.5;
  for (const t of gates)
    expect(
      Math.hypot(cx(t) - tree.x, cy(t) - tree.y) - tree.r,
      'korona suchego drzewa przy bramie',
    ).toBeGreaterThanOrEqual(5);
  // i nie w przejściu od bramy do drzwi: korona omija o metr odcinek od bramy (od strony podwórka) do wyjścia z drzwi
  const gx = g.x + g.w / 2 + rx;
  const gy = g.y + g.h / 2 + ry;
  expect(
    segDist(tree.x, tree.y, gx, gy, cx(door.out), cy(door.out)) - tree.r,
    'suche drzewo w przejściu od bramy do drzwi',
  ).toBeGreaterThanOrEqual(1);
  // chodnik: siatka nie biegnie po nim ani w poprzek niego, chyba że chodnik jest dojściem do bramy (brama stoi
  // w poprzek niego); gdy taki chodnik przechodzi przez podwórko, siatka zamyka go jeszcze raz (najwyżej 2 kafelki)
  const walk = (t: number) => w.terr[t] === T.SIDEWALK;
  const across = (t: number) =>
    STEP.some(([sx, sy]) => {
      const a = t + sy * size + sx;
      const b = t - sy * size - sx;
      return walk(a) && walk(b) && inYard.has(a) && !inYard.has(b) && !onFence.has(b) && !w.blocked[b];
    });
  const gateWalk = walkTiles(w, gates);
  const fenceWalk = walkTiles(w, fence.tiles);
  for (const t of [...gateWalk, ...fenceWalk]) expect(across(t), `siatka wzdłuż chodnika ${t}`).toBe(true);
  expect(fenceWalk.length, 'siatka w poprzek chodnika').toBeLessThanOrEqual(gateWalk.length === 2 ? 2 : 0);
  // przed pierwszym wejściem: przed linią fasady z drzwiami i nie tyłem do drzwi
  const [fx, fy] = DIRS[door.dir];
  const dx = door.tile % size;
  const dy = Math.floor(door.tile / size);
  expect((g.x + (g.w - 1) / 2 - dx) * fx + (g.y + (g.h - 1) / 2 - dy) * fy).toBeGreaterThanOrEqual(1);
  expect(-rx * fx - ry * fy).toBeGreaterThanOrEqual(0);
  // dziury rozrzucone i z dala od bramy
  for (const h of fence.hole) for (const t of gates) expect(cheb(size, h, t)).toBeGreaterThanOrEqual(4);
  for (const a of fence.hole) for (const b of fence.hole) if (a < b) expect(cheb(size, a, b)).toBeGreaterThanOrEqual(5);
  // obwód zamknięty: przy zamkniętej bramie i bez dziur podwórko (z wnętrzem siedziby) jest odcięte od mapy
  const closed = w.blocked.slice();
  for (const t of [...gates, ...fence.hole]) closed[t] = 1;
  const reg = labelRegions(closed, size);
  expect(reg[door.out]).not.toBe(reg[outside[0]]);
  let stray = 0;
  for (let i = 0; i < N; i++) if (reg[i] === reg[door.out] && !inYard.has(i) && w.bid[i] !== w.hq) stray++;
  expect(stray, 'odcięty kawałek wychodzi poza podwórko').toBe(0);
  // otwarta brama albo dowolna dziura łączy podwórko z resztą mapy
  const open = closed.slice();
  for (const t of gates) open[t] = 0;
  const regOpen = labelRegions(open, size);
  expect(regOpen[door.out]).toBe(regOpen[outside[0]]);
  for (const h of fence.hole) {
    const one = closed.slice();
    one[h] = 0;
    const r = labelRegions(one, size);
    expect(r[door.out], `dziura ${h} niczego nie łączy`).toBe(r[outside[0]]);
  }
  // pionek wychodzi z podwórka bramą albo dziurą (ścieżka po prawdziwym blocked)
  const ox = outside[0] % size;
  const oy = Math.floor(outside[0] / size);
  let far = -1;
  for (let k = 8; k >= 1 && far < 0; k--) {
    const t = (oy - ry * k) * size + ox - rx * k;
    if (!w.blocked[t] && !inYard.has(t)) far = t;
  }
  const route = findPath(w.blocked, size, door.out, far);
  expect(route, 'nie da się wyjść z podwórka').toBeTruthy();
  expect(
    route!.some((t) => gates.includes(t) || holes.has(t)),
    'wyjście nie przez bramę ani dziurę',
  ).toBe(true);
}

describe('siatka z bramą wokół siedziby i podwórka', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: zamknięty obwód, brama od ulicy, dziury, drzewo i trzepak w podwórku`, () => {
      checkFence(buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 }));
    });
  }
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`demo ${key} z ziarnem z adresu`, () => {
      checkFence(demo(key));
    });
  }

  it('blok przy ulicy: siatka dochodzi do ścian i nie przecina jezdni', () => {
    const w = buildWorld(blockGeo(), { seed: 3, size: 128 });
    checkFence(w);
    // siatka styka się z siedzibą (obwód domyka ściana budynku)
    const size = w.size;
    expect(w.fence.tiles.some((t) => [t - 1, t + 1, t - size, t + size].some((k) => w.bid[k] === w.hq))).toBe(true);
  });

  it('chodnik 8 m przed blokiem zostaje poza podwórkiem: siatka stoi obok niego, drzewo przed nim', () => {
    const w = buildWorld(footwayGeo(0), { seed: 3, size: 128 });
    checkFence(w);
    expect(walkTiles(w, w.fence.yard)).toEqual([]);
    expect(walkTiles(w, w.fence.tiles)).toEqual([]);
    expect(walkTiles(w, gateTiles(w))).toEqual([]);
  });

  it('chodnik 3 m przed blokiem: podwórko go obejmuje, a brama stoi w poprzek niego', () => {
    const w = buildWorld(footwayGeo(-5), { seed: 3, size: 128 });
    checkFence(w);
    expect(walkTiles(w, w.fence.yard).length).toBeGreaterThan(0);
    expect(walkTiles(w, gateTiles(w))).toHaveLength(2);
  });

  it('chodnik prosto do drzwi: jest dojściem do bramy, poza bramą siatka go nie dotyka', () => {
    const w0 = buildWorld(blockGeo(), { seed: 3, size: 128 });
    const x = (w0.buildings[w0.hq].entrances[0].tile % w0.size) - w0.size / 2;
    const path: Geo = {
      ...blockGeo(),
      r: [
        street(16),
        {
          l: [
            [x, -8],
            [x, 16],
          ],
          h: 'footway',
        },
      ],
    };
    const w = buildWorld(path, { seed: 3, size: 128 });
    checkFence(w);
    expect(w.terr[w.buildings[w.hq].entrances[0].out]).toBe(T.SIDEWALK);
    expect(walkTiles(w, gateTiles(w))).toHaveLength(2);
    expect(walkTiles(w, w.fence.tiles)).toEqual([]);
  });

  it('dom: siatka obejmuje cały dom z ogródkiem', () => {
    const w = buildWorld(houseGeo(), { seed: 5, size: 96 });
    checkFence(w);
    const size = w.size;
    const hq = w.buildings[w.hq];
    const inYard = new Set(w.fence.yard);
    // każdy kafelek wokół domu należy do podwórka albo siatki (dom stoi w środku)
    for (let x = hq.x0 - 1; x <= hq.x1 + 1; x++)
      for (const y of [hq.y0 - 1, hq.y1 + 1]) expect(inYard.has(y * size + x) || w.blocked[y * size + x]).toBeTruthy();
  });

  it('ten sam świat i ziarno: ta sama siatka; inne ziarno: inne dziury', () => {
    const a = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const w1 = buildWorld(geo, { seed: 4 });
    const w2 = buildWorld(geo, { seed: 4 });
    expect(w2.fence).toEqual(w1.fence);
    const holes = new Set<string>();
    for (let s = 1; s <= 6; s++) holes.add(JSON.stringify(buildWorld(blockGeo(), { seed: s, size: 128 }).fence.hole));
    expect(holes.size).toBeGreaterThan(1);
  });
});
