import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { type Geo, type Pt, polyArea } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { fillRing, stampSegment } from '../../src/world/raster.ts';
import { buildWorld, T, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
const emptyGeo = (): Geo => ({ c: [0, 0], b: [], r: [], a: [], w: [], poi: [] });

function count(w: World, code: number) {
  let n = 0;
  for (const t of w.terr) if (t === code) n++;
  return n;
}

describe('rasteryzacja na siatce 1 m', () => {
  it('prostokąt 20×10 m to dokładnie 200 kafelków', () => {
    const tiles: number[] = [];
    fillRing(rect(-10, -5, 20, 10), 64, (i) => tiles.push(i));
    expect(tiles).toHaveLength(200);
    expect(new Set(tiles).size).toBe(200);
  });

  it('wielokąt w kształcie L', () => {
    const L: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
      [0, 0],
    ];
    let n = 0;
    fillRing(L, 64, () => n++);
    expect(n).toBe(polyArea(L));
  });

  it('odcinek drogi o szerokości 6 m', () => {
    const tiles = new Set<number>();
    stampSegment([-20, 0], [20, 0], 6, 64, (i) => tiles.add(i));
    // 40 m długości (+ zaokrąglone końce) × 6 m szerokości
    expect(tiles.size).toBeGreaterThanOrEqual(240);
    expect(tiles.size).toBeLessThanOrEqual(240 + 2 * 3 * 6);
  });
});

describe('świat z geometrii', () => {
  it('budynek, droga z chodnikami, drzewa poza budynkami i jezdnią', () => {
    const g = emptyGeo();
    g.b.push({ p: rect(-30, -20, 60, 12), t: { building: 'apartments', 'building:levels': '10' } });
    g.r.push({
      l: [
        [-60, 20],
        [60, 20],
      ],
      h: 'residential',
    });
    g.a.push({ p: rect(-60, 30, 120, 30), k: 'park' });
    const w = buildWorld(g, { seed: 7, size: 128 });
    expect(count(w, T.BUILDING)).toBe(720);
    expect(w.buildings).toHaveLength(1);
    expect(w.buildings[0].cls).toBe('blok');
    expect(w.buildings[0].levels).toBe(10);
    expect(count(w, T.ROAD)).toBeGreaterThan(600);
    expect(count(w, T.SIDEWALK)).toBeGreaterThan(300);
    expect(w.trees.length).toBeGreaterThan(5);
    for (const tr of w.trees) {
      const i = Math.floor(tr.y) * w.size + Math.floor(tr.x);
      expect([T.BUILDING, T.ROAD, T.SIDEWALK, T.PARKING, T.WATER]).not.toContain(w.terr[i]);
      expect(w.blocked[i]).toBe(1);
    }
    // siedziba: najbliższy budynek mieszkalny
    expect(w.hq).toBe(0);
    // klatki od strony chodnika (południe), każda z wolnym kafelkiem przed drzwiami
    const b = w.buildings[0];
    expect(b.entrances.length).toBeGreaterThanOrEqual(2);
    for (const e of b.entrances) {
      expect(w.bid[e.tile]).toBe(0);
      expect(w.blocked[e.out]).toBe(0);
      expect(e.dir).toBe('S');
    }
  });

  it('ten sam adres i ziarno dają ten sam świat', () => {
    const a = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5);
    const h = (w: World) =>
      hashString([...w.terr].join('') + [...w.bid].join(',') + JSON.stringify(w.trees) + JSON.stringify(w.buildings));
    const w1 = buildWorld(geo, { seed: 11 });
    const w2 = buildWorld(geo, { seed: 11 });
    const w3 = buildWorld(geo, { seed: 12 });
    expect(h(w1)).toBe(h(w2));
    expect(h(w1)).not.toBe(h(w3));
  });

  for (const a of ADDRESSES) {
    it(`${a.key}: budynki, drogi i siedziba`, () => {
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5);
      const t0 = performance.now();
      const w = buildWorld(geo, { seed: 1 });
      const ms = performance.now() - t0;
      expect(w.size).toBe(384);
      expect(ms).toBeLessThan(1500);
      expect(w.buildings.length).toBeGreaterThan(30);
      expect(count(w, T.ROAD)).toBeGreaterThan(2000);
      expect(w.trees.length).toBeGreaterThan(100);
      // siedziba blisko środka mapy (adresu)
      const hq = w.buildings[w.hq];
      const cx = (hq.x0 + hq.x1) / 2;
      const cy = (hq.y0 + hq.y1) / 2;
      expect(Math.hypot(cx - w.size / 2, cy - w.size / 2)).toBeLessThan(80);
      expect(['blok', 'dom']).toContain(hq.cls);
      expect(hq.entrances.length).toBeGreaterThan(0);
      // każdy budynek mieszkalny ma wejście z wolnym kafelkiem przed drzwiami
      for (const b of w.buildings)
        for (const e of b.entrances) {
          expect(w.bid[e.tile]).toBe(b.id);
          expect(w.blocked[e.out]).toBe(0);
        }
    });
  }

  it('bez budynków mieszkalnych siedzibą zostaje najbliższy budynek (przemysł, adres na ulicy)', () => {
    const g = emptyGeo();
    for (let k = 0; k < 6; k++) g.b.push({ p: rect(-90 + k * 32, 20, 24, 18), t: { building: 'industrial' } });
    g.r.push({
      l: [
        [-120, 0],
        [120, 0],
      ],
      h: 'residential',
    });
    const w = buildWorld(g, { seed: 3, size: 256 });
    expect(w.hq).toBeGreaterThanOrEqual(0);
    expect(['blok', 'dom']).toContain(w.buildings[w.hq].cls);
    expect(w.buildings[w.hq].entrances.length).toBeGreaterThan(0);
    // symulacja startuje (wcześniej: TypeError w createSim i czarny ekran)
    const sim = new Sim(w, createSim(w, 1, { core: 4, crowd: 3 }));
    for (let k = 0; k < 50; k++) sim.step();
    expect(sim.st.pawns).toHaveLength(7);
  });

  it('bez żadnego budynku: czytelny błąd zamiast czarnego ekranu', () => {
    const g = emptyGeo();
    g.r.push({
      l: [
        [-60, 0],
        [60, 0],
      ],
      h: 'residential',
    });
    expect(() => buildWorld(g, { seed: 1, size: 128 })).toThrow(/budynk/);
  });
});
