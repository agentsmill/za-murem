import { describe, expect, it } from 'vitest';
import type { Geo, GeoPoi } from '../../src/world/geo.ts';
import {
  kluczPunktu,
  kluczZMetrow,
  miejscaZPoi,
  naMapieLokalnej,
  PROMIEN_MAPY_LOKALNEJ,
  uzupelnijKlucze,
} from '../../src/world/miasto.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { toGeo } from '../../src/world/osm.ts';
import { LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles, overpassJson } from './fixtures.ts';

const FORMAT_KLUCZA = /^poi:\d+:\d+$/;

/** środek mapy przesunięty o dx metrów na wschód i dy na południe (jak w klucze.test.ts, jak adres sąsiada) */
function shifted(lat: number, lon: number, dx: number, dy: number): [number, number] {
  return [lat - dy / 110574, lon + dx / (111320 * Math.cos((lat * Math.PI) / 180))];
}

/** odległość w metrach */
const odl = (p: { x: number; y: number }) => Math.sqrt(p.x * p.x + p.y * p.y);

/** najwyższa różnica kluczy po osiach w pikselach */
function roznicaPikseli(a: string, b: string): number {
  const [, ax, ay] = a.split(':').map(Number);
  const [, bx, by] = b.split(':').map(Number);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

describe('klucz punktu miejsca (src/world/miasto.ts)', () => {
  it('kluczPunktu zaokrągla globalne piksele do całych i składa poi:X:Y', () => {
    expect(kluczPunktu(1.4, 2.6)).toBe('poi:1:3');
    expect(kluczPunktu(9037 * 4096 + 17, 5228 * 4096 + 4095)).toBe(`poi:${9037 * 4096 + 17}:${5228 * 4096 + 4095}`);
    expect(kluczPunktu(10, 20)).toMatch(FORMAT_KLUCZA);
  });

  it('mapa lokalna to koło 192 m', () => {
    expect(PROMIEN_MAPY_LOKALNEJ).toBe(192);
  });

  for (const a of ADDRESSES) {
    it(`${a.key}: każdy punkt z kafelków ma klucz, taki sam przy innym środku mapy`, () => {
      const tiles = decodedTiles(a);
      const geoA = toGeoT(tiles, a.lat, a.lon, LOAD_RADIUS);
      expect(geoA.poi.length).toBeGreaterThan(0);
      for (const p of geoA.poi) expect(p.k, `${p.c} ${p.n}`).toMatch(FORMAT_KLUCZA);

      // ta sama okolica z środkiem 130 m na wschód: punkty blisko obu środków muszą mieć w obu mapach ten sam klucz
      const geoB = toGeoT(tiles, ...shifted(a.lat, a.lon, 130, 0), LOAD_RADIUS);
      const wB = new Set(geoB.poi.map((p) => `${p.k}|${p.c}`));
      let porownane = 0;
      for (const p of geoA.poi) {
        if (odl(p) > 250 || odl({ x: p.x - 130, y: p.y }) > 250) continue;
        porownane++;
        expect(wB.has(`${p.k}|${p.c}`), `${p.c} ${p.n} ${p.k}`).toBe(true);
      }
      expect(porownane).toBeGreaterThan(0);
    });

    it(`${a.key}: kluczZMetrow odtwarza klucz z kafelków z dokładnością do pikseli`, () => {
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      for (const p of geo.poi) {
        const z = kluczZMetrow(geo.c, p.x, p.y);
        expect(z).toMatch(FORMAT_KLUCZA);
        expect(roznicaPikseli(z, p.k as string), `${p.c} ${p.n}`).toBeLessThanOrEqual(2);
      }
    });
  }

  it('Overpass (Przymorze): klucz mają i węzły, i środki obrysów', () => {
    const a = ADDRESSES[0];
    const geo = toGeo(overpassJson() as Parameters<typeof toGeo>[0], a.lat, a.lon);
    expect(geo.poi.length).toBeGreaterThan(0);
    for (const p of geo.poi) {
      expect(p.k, `${p.c} ${p.n}`).toMatch(FORMAT_KLUCZA);
      expect(roznicaPikseli(kluczZMetrow(geo.c, p.x, p.y), p.k as string), `${p.c} ${p.n}`).toBeLessThanOrEqual(2);
    }
  });

  it('uzupelnijKlucze dopisuje brakujące klucze i nie nadpisuje istniejących', () => {
    const a = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const wzor = geo.poi.map((p) => p.k);
    // stary zapis: bez kluczy; jeden zostaje z własnym kluczem
    const poi: GeoPoi[] = geo.poi.map(({ k: _k, ...p }) => ({ ...p }));
    poi[0].k = 'poi:1:1';
    const stary: Pick<Geo, 'c' | 'poi'> = { c: geo.c, poi };
    uzupelnijKlucze(stary);
    expect(stary.poi[0].k).toBe('poi:1:1');
    for (let i = 1; i < stary.poi.length; i++) {
      expect(stary.poi[i].k).toMatch(FORMAT_KLUCZA);
      expect(roznicaPikseli(stary.poi[i].k as string, wzor[i] as string)).toBeLessThanOrEqual(2);
    }
    // drugi przebieg nic nie zmienia
    const kopia = stary.poi.map((p) => p.k);
    uzupelnijKlucze(stary);
    expect(stary.poi.map((p) => p.k)).toEqual(kopia);
  });

  it('miejscaZPoi: pomija punkty bez klucza, scala duplikaty, sortuje po odległości i wstawia nazwę', () => {
    const pois: GeoPoi[] = [
      { x: 100, y: 0, c: 'spozywczy', n: 'Daleki', k: 'poi:5:5' },
      { x: 3, y: 4, c: 'apteka', n: 'Bliski', k: 'poi:2:2' },
      { x: 9, y: 9, c: 'szkola', n: 'Bez klucza' },
      { x: 3, y: 4, c: 'apteka', n: 'Bliski drugi raz', k: 'poi:2:2' },
      { x: -3, y: -4, c: 'spozywczy', n: 'Remis B', k: 'poi:9:9' },
      { x: 4, y: -3, c: 'spozywczy', n: 'Remis A', k: 'poi:1:9' },
    ];
    const miejsca = miejscaZPoi(pois, (p) => `[${p.n}]`);
    // trzy miejsca w odległości 5 m: równą odległość rozstrzyga klucz (napis); daleki na końcu
    expect(miejsca.map((m) => m.klucz)).toEqual(['poi:1:9', 'poi:2:2', 'poi:9:9', 'poi:5:5']);
    expect(miejsca.map((m) => m.odl)).toEqual([5, 5, 5, 100]);
    // duplikat klucza: zostaje pierwszy punkt z wejścia
    expect(miejsca[1]).toEqual({ klucz: 'poi:2:2', kat: 'apteka', x: 3, y: 4, odl: 5, nazwa: '[Bliski]' });
    // nie zmienia wejścia
    expect(pois).toHaveLength(6);
  });

  it('miejscaZPoi na danych z kafelków: wszystkie punkty mają miejsce, odl zgadza się z położeniem', () => {
    const a = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const miejsca = miejscaZPoi(geo.poi, (p) => p.n);
    expect(miejsca.length).toBeGreaterThan(0);
    expect(miejsca.length).toBeLessThanOrEqual(geo.poi.length);
    expect(new Set(miejsca.map((m) => m.klucz)).size).toBe(miejsca.length);
    for (let i = 0; i < miejsca.length; i++) {
      expect(miejsca[i].odl).toBe(odl(miejsca[i]));
      if (i) expect(miejsca[i].odl).toBeGreaterThanOrEqual(miejsca[i - 1].odl);
    }
  });

  it('naMapieLokalnej: koło 192 m, brzeg wliczony, narożnik kwadratu poza kołem', () => {
    expect(naMapieLokalnej({ x: 192, y: 0 })).toBe(true);
    expect(naMapieLokalnej({ x: 193, y: 0 })).toBe(false);
    expect(naMapieLokalnej({ x: 140, y: 140 })).toBe(false);
    expect(naMapieLokalnej({ x: 0, y: -192 })).toBe(true);
    expect(naMapieLokalnej({ x: 0, y: 0 })).toBe(true);
    expect(naMapieLokalnej({ x: 135, y: 135 })).toBe(true);
  });
});
