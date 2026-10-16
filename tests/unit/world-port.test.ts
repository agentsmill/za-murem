import { describe, expect, it } from 'vitest';
import { classify, levelsOf } from '../../src/world/classify.ts';
import { type Geo, type Pt, pip, polyArea } from '../../src/world/geo.ts';
import { decode, tilesFor, toGeoT, WANT, Z } from '../../src/world/mvt.ts';
import { areaKind, genProc, poiCat, query, toGeo } from '../../src/world/osm.ts';
import { ADDRESSES, decodedTiles, overpassJson, tileBytes } from './fixtures.ts';
import { loadV03, plain } from './v03.ts';

const v = loadV03(undefined, [
  [
    'js/sim.js',
    'Sim.newGame = function (geo, meta) {',
    'Sim.classify = classify; Sim.newGame = function (geo, meta) {',
  ],
  ['js/osm.js', 'G.OSM = { geocode,', 'G.OSM = { areaKind, geocode,'],
]);
const G = v.G;

/** typy budynków jak w grze: pole z obrysu, kategorie z punktów w środku */
function classes(geo: Geo, cls = classify) {
  const counts: Record<string, number> = {};
  const out: string[] = [];
  for (const b of geo.b) {
    const area = polyArea(b.p);
    const cats = [...new Set(geo.poi.filter((p) => pip(p.x, p.y, b.p)).map((p) => p.c))];
    const c = cls(b, area, cats);
    out.push(c);
    counts[c] = (counts[c] || 0) + 1;
  }
  return { counts, out };
}

describe('kafelki wektorowe (mvt.ts) jak w 0.3', () => {
  for (const a of ADDRESSES) {
    describe(a.key, () => {
      it('tilesFor wskazuje kafelki z danych testowych', () => {
        expect(tilesFor(a.lat, a.lon, 720)).toEqual(a.tiles);
      });

      it('dekoder daje to samo co 0.3', () => {
        for (const [x, y] of a.tiles) {
          const buf = tileBytes(x, y);
          expect(plain(decode(buf, WANT))).toEqual(plain(G.MVT.decode(buf, WANT)));
        }
      });

      it('geometria (toGeoT) jest identyczna z 0.3 przy promieniu 230 m', () => {
        const now = toGeoT(decodedTiles(a), a.lat, a.lon, 230);
        const oldTiles = a.tiles.map(([x, y]) => ({ x, y, L: G.MVT.decode(tileBytes(x, y), WANT) }));
        const old = G.MVT.toGeoT(oldTiles, a.lat, a.lon);
        expect(plain(now)).toEqual(plain(old));
      });

      it('klasy budynków jak w 0.3', () => {
        const geo = toGeoT(decodedTiles(a), a.lat, a.lon, 230);
        expect(classes(geo).out).toEqual(classes(geo, G.Sim.classify).out);
      });
    });
  }

  it('liczba budynków i klasy na trzech adresach (obszar 384 m)', () => {
    const summary: Record<string, { b: number; counts: Record<string, number> }> = {};
    for (const a of ADDRESSES) {
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, 192);
      summary[a.key] = { b: geo.b.length, counts: classes(geo).counts };
    }
    // falowce i wielka płyta na Przymorzu, bloki na Ursynowie, domy w Zielonkach
    expect(summary.przymorze.counts.blok).toBeGreaterThanOrEqual(10);
    expect(summary.lanciego.counts.blok).toBeGreaterThanOrEqual(10);
    expect(summary.zielonki.counts.dom).toBeGreaterThanOrEqual(40);
    expect(summary.zielonki.counts.dom).toBeGreaterThan(summary.zielonki.counts.blok || 0);
    expect(summary).toMatchSnapshot();
  });

  it('budynki przecięte granicą kafelków są sklejane', () => {
    const n = 2 ** Z;
    let glued = 0;
    for (const a of ADDRESSES) {
      // duży promień, żeby objąć granice kafelków
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, 720);
      const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
      const ky = 110574;
      const rd = (q: number) => Math.round(q * 2) / 2;
      const xs = [...new Set(a.tiles.map((t) => t[0]))].sort();
      const ys = [...new Set(a.tiles.map((t) => t[1]))].sort();
      const lineX = rd(((xs[1] / n) * 360 - 180 - a.lon) * kx);
      const latB = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ys[1]) / n))) * 180) / Math.PI;
      const lineY = rd((a.lat - latB) * ky);
      // odcinki obrysów leżące na granicy: [indeks budynku, oś, od, do, wysokość]
      const onBorder: [number, 0 | 1, number, number, string][] = [];
      geo.b.forEach((b, i) => {
        if (b.pp?.length) glued++;
        for (const ring of [b.p, ...(b.pp || [])]) {
          for (let k = 0; k + 1 < ring.length; k++) {
            const p: Pt = ring[k];
            const q: Pt = ring[k + 1];
            const h = b.t['building:levels'] || '';
            if (p[0] === lineX && q[0] === lineX) onBorder.push([i, 0, Math.min(p[1], q[1]), Math.max(p[1], q[1]), h]);
            if (p[1] === lineY && q[1] === lineY) onBorder.push([i, 1, Math.min(p[0], q[0]), Math.max(p[0], q[0]), h]);
          }
        }
      });
      // dwa różne budynki o tej samej wysokości nie mogą stykać się na granicy kafelka
      for (let s = 0; s < onBorder.length; s++)
        for (let t = s + 1; t < onBorder.length; t++) {
          const A = onBorder[s];
          const B = onBorder[t];
          if (A[0] === B[0] || A[1] !== B[1] || A[4] !== B[4]) continue;
          const overlap = Math.min(A[3], B[3]) - Math.max(A[2], B[2]);
          expect(overlap, `${a.key}: budynki ${A[0]} i ${B[0]} nie zostały sklejone`).toBeLessThanOrEqual(0);
        }
    }
    expect(glued).toBeGreaterThan(0);
  });
});

describe('Overpass i osiedle zapasowe (osm.ts) jak w 0.3', () => {
  it('toGeo z zapisanej odpowiedzi Overpass', () => {
    const json = overpassJson();
    expect(plain(toGeo(json as Parameters<typeof toGeo>[0], 54.4093, 18.5991))).toEqual(
      plain(G.OSM.toGeo(json, 54.4093, 18.5991)),
    );
  });

  it('kategorie miejsc i terenów', () => {
    const json = overpassJson() as { elements: { tags?: Record<string, string> }[] };
    let n = 0;
    for (const el of json.elements) {
      const t = el.tags || {};
      expect(poiCat(t)).toBe(G.OSM.poiCat(t));
      n++;
    }
    expect(n).toBeGreaterThan(100);
    const tags: Record<string, string>[] = [
      { landuse: 'grass' },
      { natural: 'water' },
      { leisure: 'playground' },
      { amenity: 'parking' },
      { landuse: 'garages' },
      { leisure: 'pitch' },
      { landuse: 'allotments' },
      { natural: 'scrub' },
      { landuse: 'retail' },
    ];
    for (const t of tags) expect(areaKind(t)).toBe(G.OSM.areaKind(t));
  });

  it('osiedle zapasowe dla tych samych ziaren', () => {
    for (let seed = 1; seed <= 25; seed++) expect(plain(genProc(seed, 230))).toEqual(plain(G.OSM.genProc(seed)));
  });

  it('zapytanie Overpass', () => {
    expect(query(54.4093, 18.5991, 230)).toBe(G.OSM.query(54.4093, 18.5991));
  });

  it('liczba pięter jak w 0.3', () => {
    const geo = toGeoT(decodedTiles(ADDRESSES[0]), ADDRESSES[0].lat, ADDRESSES[0].lon, 230);
    for (const b of geo.b.slice(0, 50)) {
      const area = polyArea(b.p);
      const c = classify(b, area, []);
      let lv = Number.parseInt(b.t['building:levels'], 10);
      if (!lv || lv > 30) lv = c === 'blok' ? (area > 700 ? 10 : 5) : c === 'dom' ? 2 : 1;
      expect(levelsOf(b, c, area)).toBe(lv);
    }
  });
});
