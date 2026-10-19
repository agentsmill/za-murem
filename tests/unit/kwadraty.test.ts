/* Układ i przeliczenia kwadratów (miasto z kwadratów, etap 1, zadanie 1): klucze, środek kwadratu w metrach od adresu
   w układzie przed obrotem, kafelki z=14 do pobrania i ośmiu sąsiadów w stałej kolejności. */

import { describe, expect, it } from 'vitest';
import type { Geo } from '../../src/world/geo.ts';
import {
  BOK_KWADRATU,
  kafelkiKwadratu,
  kluczKwadratu,
  PROMIEN_KAFELKOW,
  sasiedzi8,
  srodekKwadratu,
  type Uklad,
  ukladDomu,
  ukladZGeo,
  zKlucza,
} from '../../src/world/kwadraty.ts';
import { rzutKafelka, tilesFor, toGeoT } from '../../src/world/mvt.ts';
import { rotateGeo } from '../../src/world/rotate.ts';
import { buildWorld, LOAD_RADIUS, SIZE } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

/** geo z jednym punktem, żeby obrócić go tak jak rotateGeo obraca całe osiedle */
const punkt = (c: [number, number], x: number, y: number): Geo => ({
  c,
  b: [],
  r: [],
  a: [],
  w: [],
  poi: [{ x, y, c: 'shop', n: '' }],
  src: 'mvt',
});

describe('kwadraty: klucze i sąsiedzi', () => {
  it('klucz kwadratu w obie strony', () => {
    expect(kluczKwadratu(-2, 3)).toBe('-2,3');
    expect(kluczKwadratu(0, 0)).toBe('0,0');
    expect(zKlucza('-2,3')).toEqual([-2, 3]);
    expect(zKlucza('0,0')).toEqual([0, 0]);
    expect(zKlucza(kluczKwadratu(15, -16))).toEqual([15, -16]);
  });

  it('zły klucz to błąd, nie po cichu NaN', () => {
    for (const zly of ['', 'x', '1', '1,', ',1', '1,2,3', '1.5,2', 'a,b', ' 1,2', '01,2', '-0,0', '+1,2', '1,-00']) {
      expect(() => zKlucza(zly)).toThrow();
    }
  });

  it('ośmiu sąsiadów w stałej kolejności', () => {
    expect(sasiedzi8(0, 0)).toEqual([
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ]);
    expect(sasiedzi8(3, -2)).toEqual([
      [3, -3],
      [4, -3],
      [4, -2],
      [4, -1],
      [3, -1],
      [2, -1],
      [2, -2],
      [2, -3],
    ]);
  });

  it('bok kwadratu to bok świata domu', () => {
    expect(BOK_KWADRATU).toBe(SIZE);
  });
});

describe('kwadraty: środek kwadratu', () => {
  it('środek domu to adres', () => {
    const s = srodekKwadratu({ c: [54.4, 18.6], kat: 0.29, bok: 384 }, 0, 0);
    expect(s).toEqual([0, 0]);
    expect(Object.is(s[0], -0)).toBe(false);
    expect(Object.is(s[1], -0)).toBe(false);
  });

  it('środek sąsiada po obrocie układu leży 384 m na wschód', () => {
    const u: Uklad = { c: [54.4, 18.6], kat: 0.29, bok: 384 };
    const [x, y] = srodekKwadratu(u, 1, 0);
    const r = rotateGeo(punkt(u.c, x, y), u.kat).poi[0];
    expect(r.x).toBeCloseTo(384, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });

  it('po obrocie każdy z ośmiu sąsiadów i dalsze kwadraty leżą dokładnie o wielokrotność boku od domu', () => {
    for (const kat of [-0.7, -0.29, 0, 0.285, 0.43, 0.785]) {
      const u: Uklad = { c: [52.1, 21.0], kat, bok: 384 };
      for (const [sx, sy] of [...sasiedzi8(0, 0), [5, -3], [-16, 16]] as [number, number][]) {
        const [x, y] = srodekKwadratu(u, sx, sy);
        const r = rotateGeo(punkt(u.c, x, y), u.kat).poi[0];
        expect(r.x).toBeCloseTo(sx * 384, 6);
        expect(r.y).toBeCloseTo(sy * 384, 6);
      }
    }
  });

  it('układ domu: środek adresu, kąt i bok świata', () => {
    expect(ukladDomu({ c: [54.4, 18.6] }, { angle: 0.3, size: 384 })).toEqual({ c: [54.4, 18.6], kat: 0.3, bok: 384 });
  });

  it('układ z samego geo ma kąt świata, który zbuduje buildWorld (trzy adresy, trzy różne kąty)', () => {
    const katy = new Set<number>();
    for (const a of ADDRESSES) {
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      const u = ukladZGeo(geo);
      const w = buildWorld(geo, { seed: 1 });
      expect(u).toEqual(ukladDomu(geo, w));
      expect(u.c).toEqual([a.lat, a.lon]);
      expect(u.bok).toBe(384);
      katy.add(u.kat);
    }
    expect(katy.size).toBe(3);
  });
});

describe('kwadraty: kafelki do pobrania', () => {
  it('kafelki domu to kafelki, które pobiera load() dla adresu, i zawierają się w kafelkach testowych', () => {
    for (const a of ADDRESSES) {
      const tiles = decodedTiles(a).map((t) => `${t.x}/${t.y}`);
      const u: Uklad = { c: [a.lat, a.lon], kat: 0, bok: 384 };
      const dom = tilesFor(a.lat, a.lon, 720)
        .map(([x, y]) => `${x}/${y}`)
        .sort();
      const wynik = kafelkiKwadratu(u, 0, 0);
      expect(wynik.map(([x, y]) => `${x}/${y}`).sort()).toEqual(dom);
      for (const [x, y] of wynik) expect(tiles).toContain(`${x}/${y}`);
    }
    expect(PROMIEN_KAFELKOW).toBe(720);
  });

  it('kafelki domu nie zależą od obrotu układu', () => {
    for (const a of ADDRESSES) {
      const bez = kafelkiKwadratu({ c: [a.lat, a.lon], kat: 0, bok: 384 }, 0, 0);
      const z = kafelkiKwadratu({ c: [a.lat, a.lon], kat: 0.7, bok: 384 }, 0, 0);
      expect(z).toEqual(bez);
    }
  });

  it('kafelki sąsiada: dokładnie te, które dotykają prostokąta ±720 m wokół jego środka (niezależnie od tilesFor)', () => {
    for (const a of ADDRESSES) {
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      const u = ukladZGeo(geo);
      const rzut = rzutKafelka(a.lat, a.lon);
      // prostokąt kafelka w metrach od adresu (przed obrotem): rogi (0,0) i (E,E) kafelka
      const prostokat = (x: number, y: number) => {
        const [x0, y0] = rzut({ x, y }, 4096, [0, 0]);
        const [x1, y1] = rzut({ x, y }, 4096, [4096, 4096]);
        return { x0, y0, x1, y1 };
      };
      for (const [sx, sy] of [[0, 0], ...sasiedzi8(0, 0)] as [number, number][]) {
        const [cx, cy] = srodekKwadratu(u, sx, sy);
        const dotyka = (x: number, y: number, zapas: number) => {
          const p = prostokat(x, y);
          const R = PROMIEN_KAFELKOW + zapas;
          return p.x0 < cx + R && p.x1 > cx - R && p.y0 < cy + R && p.y1 > cy - R;
        };
        const wynik = kafelkiKwadratu(u, sx, sy);
        expect(wynik.length).toBeGreaterThanOrEqual(1);
        expect(new Set(wynik.map(([x, y]) => `${x}/${y}`)).size).toBe(wynik.length);
        // każdy zwrócony kafelek dotyka prostokąta (z zapasem 1 m na zaokrąglenia przeliczeń)
        for (const [x, y] of wynik) expect(dotyka(x, y, 1)).toBe(true);
        // i żaden kafelek, który wchodzi w prostokąt wyraźnie (o ponad 1 m w głąb), nie został pominięty
        const x0 = Math.min(...wynik.map(([x]) => x)) - 2;
        const x1 = Math.max(...wynik.map(([x]) => x)) + 2;
        const y0 = Math.min(...wynik.map(([, y]) => y)) - 2;
        const y1 = Math.max(...wynik.map(([, y]) => y)) + 2;
        const zwrocone = new Set(wynik.map(([x, y]) => `${x}/${y}`));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (dotyka(x, y, -1)) expect(zwrocone.has(`${x}/${y}`)).toBe(true);
      }
    }
  });

  it('kafelki sąsiada leżą po właściwej stronie: wschodni sąsiad dla układu bez obrotu ma kafelki na wschód od domu', () => {
    const lat = 52.1;
    const lon = 21.0;
    const u: Uklad = { c: [lat, lon], kat: 0, bok: 384 };
    // 3 km na wschód przesuwa środek o ponad kafelek, więc zestawy kafelków muszą się różnić tylko w prawo
    const dalekoU: Uklad = { ...u, bok: 4000 };
    const dom = kafelkiKwadratu(dalekoU, 0, 0);
    const wsch = kafelkiKwadratu(dalekoU, 1, 0);
    const pol = kafelkiKwadratu(dalekoU, 0, 1);
    expect(Math.max(...wsch.map(([x]) => x))).toBeGreaterThan(Math.max(...dom.map(([x]) => x)));
    expect(Math.min(...wsch.map(([, y]) => y))).toBe(Math.min(...dom.map(([, y]) => y)));
    // y rośnie na południe
    expect(Math.max(...pol.map(([, y]) => y))).toBeGreaterThan(Math.max(...dom.map(([, y]) => y)));
    expect(Math.min(...pol.map(([x]) => x))).toBe(Math.min(...dom.map(([x]) => x)));
  });
});
