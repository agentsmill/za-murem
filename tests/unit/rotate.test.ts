import { describe, expect, it } from 'vitest';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { dominantAngle, rotateGeo, straighten } from '../../src/world/rotate.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const deg = (r: number) => (r * 180) / Math.PI;

/** prostokąt o środku (cx, cy), wymiarach w×h, obrócony o kąt a (stopnie) */
function rect(cx: number, cy: number, w: number, h: number, a: number): Pt[] {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const pts: Pt[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  return [...pts, pts[0]];
}

function geoOf(rings: Pt[][]): Geo {
  return { c: [0, 0], b: rings.map((p) => ({ p, t: { building: 'apartments' } })), r: [], a: [], w: [], poi: [] };
}

/** największe odchylenie krawędzi od osi siatki (stopnie) */
function maxTilt(p: Pt[]): number {
  let m = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = Math.abs(deg(Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]))) % 90;
    m = Math.max(m, Math.min(a, 90 - a));
  }
  return m;
}

describe('obrót mapy do kierunku ścian bloków', () => {
  for (const a of [0, 12, 30, 44, 61, 80, -25]) {
    it(`bloki pod kątem ${a}° stają prosto`, () => {
      const g = geoOf([rect(0, 0, 60, 12, a), rect(40, 50, 12, 70, a + 90), rect(-60, -40, 20, 20, a)]);
      const ang = dominantAngle(g, 200);
      expect(Math.abs(deg(ang))).toBeLessThanOrEqual(45);
      const r = rotateGeo(g, ang);
      for (const b of r.b) expect(maxTilt(b.p)).toBeLessThan(0.6);
    });
  }

  it('wybiera obrót najbliższy północy (najwyżej 45°)', () => {
    expect(deg(dominantAngle(geoOf([rect(0, 0, 60, 12, 80)]), 200))).toBeCloseTo(10, 0);
    expect(deg(dominantAngle(geoOf([rect(0, 0, 60, 12, 10)]), 200))).toBeCloseTo(-10, 0);
  });

  it('bez budynków nie obraca', () => {
    expect(dominantAngle(geoOf([]), 200)).toBe(0);
  });

  it('pojedyncze krzywe budynki nie przeważają nad blokami', () => {
    const rings = [rect(0, 0, 80, 12, 20), rect(0, 40, 80, 12, 20), rect(50, -50, 6, 6, 47)];
    expect(deg(dominantAngle(geoOf(rings), 200))).toBeCloseTo(-20, 0);
  });

  it('prostowanie: lekko krzywy blok staje prosto, mocno krzywy zostaje', () => {
    const g = straighten(geoOf([rect(0, 0, 60, 12, 3), rect(0, 50, 60, 12, 20), rect(0, -50, 10, 8, 14)]));
    expect(maxTilt(g.b[0].p)).toBeLessThan(0.01);
    expect(maxTilt(g.b[1].p)).toBeGreaterThan(19);
    // mały dom obrócony o 14° się prostuje (limit dla małych budynków to 20°)
    expect(maxTilt(g.b[2].p)).toBeLessThan(0.01);
  });

  for (const [i, minStraight] of [
    [0, 8],
    [1, 6],
    [2, 8],
  ] as const) {
    it(`${ADDRESSES[i].key}: po obrocie i prostowaniu duże budynki mają proste ściany`, () => {
      const a = ADDRESSES[i];
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, 192);
      const r = straighten(rotateGeo(geo, dominantAngle(geo, 192)));
      // 10 największych budynków w obszarze gry
      const big = r.b.filter((b) => b.p.some(([x, y]) => Math.abs(x) < 192 && Math.abs(y) < 192)).slice(0, 10);
      let straight = 0;
      for (const b of big) {
        const longEdges = b.p.slice(0, -1).map((p, i) => [p, b.p[i + 1]] as const);
        // na siatce 1 m krawędź może zboczyć najwyżej o 1 m (jeden schodek)
        const ok = longEdges
          .map(([p, q]) => [Math.hypot(q[0] - p[0], q[1] - p[1]), maxTilt([p, q])] as const)
          .filter(([len]) => len > 8)
          .every(([len, tilt]) => len * Math.sin((tilt * Math.PI) / 180) <= 1);
        if (ok) straight++;
      }
      expect(straight).toBeGreaterThanOrEqual(minStraight);
    });
  }
});
