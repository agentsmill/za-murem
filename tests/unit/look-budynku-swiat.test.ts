import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kontekstyLookow, type LookBudynku, lookBudynku } from '../../src/render/art/lookBudynku.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { toGeo } from '../../src/world/osm.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles, overpassJson } from './fixtures.ts';

/* Rozpoznanie wyglądu na prawdziwych danych (dema, kafelki, Overpass) i na ulicy kamienic zbudowanej ręcznie, przez
   cały łańcuch: geometria → buildWorld → kontekst z siatki → lookBudynku. */

const ROOT = path.resolve(import.meta.dirname, '../..');

/** nazwa budynku → wygląd, tylko budynki, które wygląd dostały */
function wyglady(w: World): Record<string, LookBudynku> {
  const ctx = kontekstyLookow(w);
  const out: Record<string, LookBudynku> = {};
  for (const b of w.buildings) {
    const l = lookBudynku(b, ctx[b.id]);
    if (l) out[b.name] = l;
  }
  return out;
}

describe('dema i dane z prawdziwych map', () => {
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`demo ${key} z public/demo: żaden budynek nie dostaje wyglądu (bloki z wielkiej płyty to nie kamienice)`, () => {
      const demo = JSON.parse(fs.readFileSync(path.join(ROOT, `public/demo/${key}.json`), 'utf8'));
      expect(wyglady(buildWorld(demo.geo, { seed: 1, street: demo.street }))).toEqual({});
    });
  }

  it('z kafelków na żywo (z rodzajami punktów) dostają go tylko budynki z urzędem, a nie sekcje bloków', () => {
    const wyniki: Record<string, Record<string, LookBudynku>> = {};
    for (const a of ADDRESSES)
      wyniki[a.key] = wyglady(buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 }));
    // przejrzane ręcznie: komisariat policji w trzypiętrowym budynku na Przymorzu i Zarząd Dróg Powiatu Krakowskiego
    // w hali w Batowicach; biblioteka i poczta w długim bloku na Przymorzu (6 kategorii punktów) i punkt urzędu
    // w dwunastopiętrowym bloku w Lanciego nie zmieniają bloków
    expect(wyniki).toEqual({
      przymorze: { 'Blok nr 19': 'urzad' },
      lanciego: {},
      zielonki: { 'Hala nr 106': 'urzad' },
    });
  });

  it('z Overpass: ten sam budynek na Przymorzu to komisariat, nazwany w OSM, a sekcje bloków nie są kamienicami', () => {
    const w = buildWorld(toGeo(overpassJson() as Parameters<typeof toGeo>[0], 54.4093, 18.5991), { seed: 1 });
    expect(wyglady(w)).toEqual({ 'Komisariat Policji V Gdańsk Przymorze': 'urzad' });
  });
});

describe('ulica kamienic zbudowana ręcznie', () => {
  const rect = (x: number, y: number, w: number, h: number): Pt[] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];

  /** dwa rzędy po obu stronach jezdni, szerokości od 7 do 20 m, głębokości od 15 do 21 m, 4–5 pięter */
  function ulica(): Geo {
    const g: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [] };
    let x = -80;
    [9, 14, 11, 18, 7, 16, 12, 20, 10, 13, 15, 8].forEach((s, i) => {
      g.b.push({
        p: rect(x, -22, s, 16 + (i % 3) * 3),
        t: { building: 'yes', 'building:levels': String(4 + (i % 2)) },
      });
      x += s;
    });
    x = -80;
    [12, 9, 17, 10, 14, 8, 19, 11, 13, 7, 16, 15].forEach((s, i) => {
      g.b.push({
        p: rect(x, 6, s, 15 + (i % 4) * 2),
        t: { building: 'yes', 'building:levels': String(i % 3 === 0 ? 5 : 4) },
      });
      x += s;
    });
    g.r.push({
      l: [
        [-120, 0],
        [120, 0],
      ],
      h: 'residential',
    });
    return g;
  }

  it('każdy budynek rzędu o polu od 120 m² to kamienica, mniejsze zostają z kodu', () => {
    const w = buildWorld(ulica(), { seed: 1, size: 384 });
    expect(w.buildings).toHaveLength(24);
    const ctx = kontekstyLookow(w);
    let kamienic = 0;
    for (const b of w.buildings) {
      const l = lookBudynku(b, ctx[b.id]);
      expect(l, `${b.name}: ${b.area} m²`).toBe(b.area >= 120 ? 'kamienica' : null);
      if (l) kamienic++;
    }
    expect(kamienic).toBeGreaterThanOrEqual(20);
  });

  it('ta sama ulica z budynkami o równych polach (sekcje bloku) nie ma kamienic', () => {
    const g: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [] };
    // sześć sekcji 18×12 w rzędzie przy jezdni, wszystkie po 216 m², 5 pięter
    for (let i = 0; i < 6; i++)
      g.b.push({ p: rect(-60 + i * 18, -22, 18, 12), t: { building: 'yes', 'building:levels': '5' } });
    g.r.push({
      l: [
        [-120, 0],
        [120, 0],
      ],
      h: 'residential',
    });
    expect(wyglady(buildWorld(g, { seed: 1, size: 384 }))).toEqual({});
  });
});
