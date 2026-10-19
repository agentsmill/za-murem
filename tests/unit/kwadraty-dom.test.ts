/* Świat domu bez zmian (miasto z kwadratów, etap 1, docs/superpowers/plans/2026-10-19-miasto-etap-1-kwadraty-na-mapie.md).
   Stałe poniżej zapisano na nietkniętym kodzie (gałąź miasto-kwadraty, 10709d3, przed pierwszą zmianą w src/world):
   odciski z tablic terenu, budynków i przejścia, z reszty świata (budynki, drzewa, miejsca, rzeczy, siatka, wnętrze,
   mieszkania) i z samego geo z kafelków, plus worldKey. Zadania 1–5 dokładają kod obok buildWorld i toGeoT (układ
   kwadratów, geo i świat kwadratu, rastrowanie z przesunięciem), a świat domu ma zostać bit w bit, więc ten test musi
   przechodzić po każdym zadaniu. Gdy kiedyś generator domu zmieni się świadomie, stałe przepisuje się razem
   z nowym numerem wersji zapisu, nie w ramach kwadratów. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { worldKey } from '../../src/ui/zapis.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

/** skrót z tablicy liczb (tak jak liczy się skróty stanów: tekst z przecinkami) */
const skrot = (a: ArrayLike<number>) => hashString(Array.prototype.join.call(a, ','));

/** odcisk dla adresu: geo z kafelków, tablice terenu, reszta świata i klucz świata */
const OCZEKIWANE: Record<string, Record<string, string | number>> = {
  przymorze: {
    geo: '78a56841',
    terr: 'f5fc37de',
    bid: '917d0c12',
    blocked: '02248c3b',
    wnetrze: 'bf2406f0',
    reszta: 'dac3d6e3',
    klucz: '4e3d7635',
    kat: 0.2850132128538885,
    budynki: 64,
  },
  lanciego: {
    geo: 'd478ab66',
    terr: '37604352',
    bid: 'b591b024',
    blocked: 'edf6cbb8',
    wnetrze: '9171c4bc',
    reszta: 'ed5639f2',
    klucz: 'e5b1a8c9',
    kat: 0.43429909860511895,
    budynki: 70,
  },
  zielonki: {
    geo: 'bdab5046',
    terr: 'e410b3c1',
    bid: '277adb38',
    blocked: '68bf5168',
    wnetrze: 'c5a34a25',
    reszta: '1de91c9d',
    klucz: 'ef699de0',
    kat: 0.3137118825734717,
    budynki: 42,
  },
};

describe('świat domu bez zmian', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: geo, tablice terenu, reszta świata i worldKey jak przed kwadratami`, () => {
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      const w = buildWorld(geo, { seed: Number.parseInt(hashString(a.label), 16) });
      const reszta = JSON.stringify({
        angle: w.angle,
        hq: w.hq,
        dryTree: w.dryTree,
        buildings: w.buildings,
        trees: w.trees,
        pois: w.pois,
        props: w.props,
        fence: w.fence,
        interior: {
          building: w.interior.building,
          rooms: w.interior.rooms,
          doors: w.interior.doors,
          windows: w.interior.windows,
          furniture: w.interior.furniture,
          home: w.interior.home,
        },
        apts: w.apts,
        damage: w.damage,
      });
      expect({
        geo: hashString(JSON.stringify(geo)),
        terr: skrot(w.terr),
        bid: skrot(w.bid),
        blocked: skrot(w.blocked),
        wnetrze: skrot(w.interior.cell),
        reszta: hashString(reszta),
        klucz: worldKey(w),
        kat: w.angle,
        budynki: w.buildings.length,
      }).toEqual(OCZEKIWANE[a.key]);
    });

    // dema w public/demo są przegenerowane z toGeoT (19.10.2026), a świat domu liczy się z kafelków bez opcji, więc
    // geometria dema to geometria geo z kafelków; porównujemy samą geometrię, bez kluczy budynków i miejsc oraz rodzajów
    // punktów (zm:klucz, zm:os, GeoPoi.k, Geo.rodzaje), żeby zmiana tych pól nie wymuszała przepisywania dem
    it(`${a.key}: geometria geo z kafelków to dokładnie geometria zatwierdzonego dema`, () => {
      const plik = path.resolve(import.meta.dirname, `../../public/demo/${a.key}.json`);
      const demo = JSON.parse(fs.readFileSync(plik, 'utf8'));
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      const geometria = (g: typeof geo) => ({
        c: g.c,
        r: g.r,
        a: g.a,
        w: g.w,
        pass: g.pass,
        poi: g.poi.map(({ x, y, c, n }) => ({ x, y, c, n })),
        b: g.b.map(({ p, pp }) => ({ p, pp })),
      });
      expect(JSON.stringify(geometria(geo))).toBe(JSON.stringify(geometria(demo.geo)));
    });
  }

  it('trzy adresy mają różne, niezerowe kąty obrotu (szwy sprawdzamy dla każdego)', () => {
    const katy = Object.values(OCZEKIWANE).map((o) => o.kat as number);
    expect(new Set(katy).size).toBe(3);
    for (const k of katy) expect(Math.abs(k)).toBeGreaterThan(0.1);
  });
});
