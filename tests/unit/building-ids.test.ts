import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Geo, type GeoBuilding, type Pt, pip } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { toGeo } from '../../src/world/osm.ts';
import { dominantAngle, rotateGeo, straighten } from '../../src/world/rotate.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles, overpassJson } from './fixtures.ts';

/** odpowiedź Overpass dla Przymorza (fixtures/overpass) i jej środek */
const LAT = 54.4093;
const LON = 18.5991;
interface Element {
  type: string;
  id: number;
  tags?: Record<string, string>;
}
const elements = () => (overpassJson() as { elements: Element[] }).elements;
const overpassGeo = () => toGeo(overpassJson() as Parameters<typeof toGeo>[0], LAT, LON);

/** cała geometria obrócona o kąt a (stopnie) wokół środka, jak mapa z innym kierunkiem ulic */
function turned(geo: Geo, a: number): Geo {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const R = ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];
  return {
    ...geo,
    b: geo.b.map((b) => ({ ...b, p: b.p.map(R), ...(b.pp ? { pp: b.pp.map((q) => q.map(R)) } : {}) })),
    r: geo.r.map((q) => ({ ...q, l: q.l.map(R) })),
    a: geo.a.map((q) => ({ ...q, p: q.p.map(R) })),
    w: geo.w.map((q) => ({ ...q, l: q.l.map(R) })),
    poi: geo.poi.map((p) => {
      const [x, y] = R([p.x, p.y]);
      return { ...p, x, y };
    }),
  };
}

/** identyfikator OSM → data budowy (albo pusty napis) dla budynków świata z identyfikatorem */
const datesById = (w: World) => new Map(w.buildings.filter((b) => b.osmId).map((b) => [b.osmId, b.startDate ?? '']));

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

describe('identyfikator OSM i data budowy budynków', () => {
  it('Overpass: każdy budynek ma numer swojej drogi OSM, data budowy zostaje w tagach', () => {
    const ways = elements().filter((e) => e.type === 'way' && e.tags?.building);
    const geo = overpassGeo();
    expect(geo.b.map((b) => b.t.id)).toEqual(ways.map((e) => `w${e.id}`));
    const dated = ways.filter((e) => e.tags?.start_date);
    expect(dated.map((e) => e.tags?.start_date)).toEqual(['2007', '2009']);
    for (const e of dated) expect(geo.b.find((b) => b.t.id === `w${e.id}`)?.t.start_date).toBe(e.tags?.start_date);
    expect(geo.b.filter((b) => b.t.start_date)).toHaveLength(2);
  });

  it('Overpass w świecie: osmId i startDate przy budynkach, te same przy drugim wczytaniu', () => {
    const w1 = buildWorld(overpassGeo(), { seed: 1 });
    const ids = w1.buildings.map((b) => b.osmId);
    expect(ids.every((id) => id !== undefined && /^w\d+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of w1.buildings) {
      expect(b.osmId).toBe(b.tags.id);
      expect(b.startDate).toBe(b.tags.start_date);
    }
    // budynek z 2007 stoi 228 m od adresu, poza mapą 384 m; ten z 2009 jest w świecie
    expect(w1.buildings.filter((b) => b.startDate).map((b) => b.startDate)).toEqual(['2009']);
    const w2 = buildWorld(overpassGeo(), { seed: 1 });
    expect(w2.buildings.map((b) => [b.osmId, b.startDate])).toEqual(w1.buildings.map((b) => [b.osmId, b.startDate]));
  });

  it('obrót mapy nie zmienia identyfikatorów ani dat', () => {
    const geo = overpassGeo();
    const tags = geo.b.map((b) => [b.t.id, b.t.start_date]);
    // obrót do kierunku ścian i prostowanie budynków zostawiają tagi przy swoich budynkach
    const phi = dominantAngle(turned(geo, 23), 192);
    expect(straighten(rotateGeo(turned(geo, 23), phi)).b.map((b) => [b.t.id, b.t.start_date])).toEqual(tags);
    // ten sam świat ustawiony pod innym kątem: te same identyfikatory z tymi samymi datami
    const w0 = datesById(buildWorld(geo, { seed: 1 }));
    const w23 = datesById(buildWorld(turned(geo, 23), { seed: 1 }));
    let common = 0;
    for (const [id, date] of w0)
      if (w23.has(id)) {
        common++;
        expect(w23.get(id), id).toBe(date);
      }
    expect(common).toBeGreaterThanOrEqual(w0.size - 2);
    expect(w23.size).toBeGreaterThanOrEqual(w0.size - 2);
  });

  for (const a of ADDRESSES) {
    it(`${a.key}: kafelki dają numer OSM budynkom niesklejonym z innymi i z adresem na budynku, bez dat`, () => {
      // w kafelkach OpenFreeMap id obiektu to numer OSM razy 10 plus 2 (droga) albo 3 (relacja); obiekty
      // z końcówką 0 to wiele budynków sklejonych w jeden wielokąt, z numerem jednego z nich. Numer daje więc
      // obiekt budynku niesklejonego albo punkt numeru domu z drogi OSM leżący w budynku
      const feats = new Set<number>();
      for (const T of decodedTiles(a))
        for (const F of [...(T.L.building?.features ?? []), ...(T.L.housenumber?.features ?? [])]) feats.add(F.id);
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      const ids = geo.b.map((b) => b.t.id).filter((id): id is string => !!id);
      expect(ids.length).toBeGreaterThan(5);
      expect(ids.length).toBeLessThan(geo.b.length);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        const m = /^([wr])(\d+)$/.exec(id);
        expect(m, id).toBeTruthy();
        expect(feats.has(Number(m?.[2]) * 10 + (m?.[1] === 'w' ? 2 : 3)), id).toBe(true);
      }
      expect(geo.b.some((b) => b.t.start_date)).toBe(false);
      // drugie wczytanie: te same identyfikatory przy tych samych budynkach
      expect(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS).b.map((b) => b.t.id)).toEqual(geo.b.map((b) => b.t.id));
      // w świecie: osmId z tagu, bez powtórzeń
      const w = buildWorld(geo, { seed: 1 });
      const wid = w.buildings.map((b) => b.osmId).filter(Boolean);
      expect(wid.length).toBeGreaterThan(0);
      expect(new Set(wid).size).toBe(wid.length);
      for (const b of w.buildings) expect(b.osmId).toBe(b.tags.id);
    });
  }

  it('przymorze: numer z kafelków to ta sama droga OSM, którą w tym miejscu podaje Overpass', () => {
    const a = ADDRESSES[0];
    const tiles = toGeoT(decodedTiles(a), a.lat, a.lon, 230);
    const ov = overpassGeo();
    const center = (b: GeoBuilding): Pt => {
      let sx = 0;
      let sy = 0;
      const ring = b.p.slice(0, -1);
      for (const [x, y] of ring) {
        sx += x;
        sy += y;
      }
      return [sx / ring.length, sy / ring.length];
    };
    let checked = 0;
    for (const b of tiles.b) {
      if (!b.t.id) continue;
      const [x, y] = center(b);
      const same = ov.b.find((o) => pip(x, y, o.p));
      if (!same) continue;
      checked++;
      expect(same.t.id, `${b.t.id} w (${x}, ${y})`).toBe(b.t.id);
    }
    expect(checked).toBeGreaterThan(0);
  });

  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`demo ${key}: identyfikatory jak w kafelkach, z których powstało`, () => {
      const a = ADDRESSES.find((x) => x.key === key)!;
      const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
      const geo: Geo = d.geo;
      const fresh = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      expect(geo.b.map((b) => b.t.id ?? null)).toEqual(fresh.b.map((b) => b.t.id ?? null));
      expect(geo.b.some((b) => b.t.id)).toBe(true);
    });
  }

  it('sztuczne geo: osmId i startDate przechodzą do budynków świata, także po obrocie mapy', () => {
    const geo: Geo = {
      c: [0, 0],
      b: [
        {
          p: rect(-30, -20, 40, 12),
          t: { building: 'apartments', 'building:levels': '5', id: 'w11', start_date: '1975' },
        },
        { p: rect(-30, 10, 12, 10), t: { building: 'house', id: 'r22' } },
        { p: rect(20, 10, 8, 6), t: { building: 'garage' } },
      ],
      r: [],
      a: [],
      w: [],
      poi: [],
    };
    for (const angle of [0, 30, -50]) {
      const w = buildWorld(turned(geo, angle), { seed: 1, size: 128 });
      expect(w.buildings).toHaveLength(3);
      const byId = new Map(w.buildings.map((b) => [b.osmId, b]));
      expect(byId.get('w11')?.startDate, `${angle}°`).toBe('1975');
      expect(byId.get('w11')?.cls).toBe('blok');
      expect(byId.has('r22')).toBe(true);
      expect(byId.get('r22')?.startDate).toBeUndefined();
      expect(w.buildings.filter((b) => b.osmId === undefined)).toHaveLength(1);
    }
  });
});
