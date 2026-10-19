import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { worldKey } from '../../src/ui/zapis.ts';
import { awansujDomy, DOM_MIN_POLE, listaPieter, PIETER_MAX } from '../../src/world/pietra.ts';
import { type BuildOpts, buildWorld, type World, type WorldBuilding } from '../../src/world/world.ts';
import { demoSwiat } from './pietra-pomoc.ts';

const KLUCZE = ['przymorze', 'lanciego', 'zielonki'] as const;
const dom = (b: WorldBuilding) => b.cls === 'dom' && b.area >= DOM_MIN_POLE;
const poziomy = (w: Pick<World, 'buildings'>) => w.buildings.map((b) => b.levels);

/** świat demo zbudowany od nowa (bez cache pomocnika), z dowolnym dodatkiem do opcji */
function zbuduj(klucz: (typeof KLUCZE)[number], dodatek: Partial<BuildOpts>): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${klucz}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street, ...dodatek });
}

/** budynek do prób awansu; liczy się tylko to, co czyta pietra.ts */
const budynek = (id: number, cls: WorldBuilding['cls'], levels: number, area: number): WorldBuilding =>
  ({ id, cls, levels, area }) as WorldBuilding;

describe('pietra: awans domów', () => {
  it('awansuje co najmniej połowę domów od 60 m²', () => {
    const domy = demoSwiat('zielonki', true).buildings.filter(dom);
    expect(domy.length).toBeGreaterThan(0);
    expect(domy.filter((b) => b.levels >= 2).length).toBeGreaterThanOrEqual(Math.ceil(domy.length / 2));
  });

  it('zmienia tylko domy z jedną kondygnacją o jeden', () => {
    for (const klucz of KLUCZE) {
      const bez = demoSwiat(klucz, false).buildings;
      const z = demoSwiat(klucz, true).buildings;
      expect(z.length).toBe(bez.length);
      for (const b of z) {
        const przed = bez.find((x) => x.id === b.id);
        expect(przed).toBeDefined();
        if (!przed || b.levels === przed.levels) continue;
        expect(b.cls).toBe('dom');
        expect(b.area).toBeGreaterThanOrEqual(DOM_MIN_POLE);
        expect(przed.levels).toBe(1);
        expect(b.levels).toBe(2);
      }
      for (const b of z.filter((x) => x.cls === 'blok')) {
        expect(b.levels).toBe(bez.find((x) => x.id === b.id)?.levels);
      }
    }
  });

  it('w zielonkach, gdzie wszystkie domy mają jedną kondygnację, awans coś zmienia', () => {
    const bez = demoSwiat('zielonki', false).buildings;
    const z = demoSwiat('zielonki', true).buildings;
    const zmienione = z.filter((b) => b.levels !== bez.find((x) => x.id === b.id)?.levels);
    expect(zmienione.length).toBe(Math.ceil(bez.filter(dom).length / 2));
  });

  it('domy z danymi co najmniej 2 zostają', () => {
    const bez = demoSwiat('lanciego', false).buildings;
    const z = demoSwiat('lanciego', true).buildings;
    const zDanymi = bez.filter((b) => b.cls === 'dom' && b.levels >= 2);
    expect(zDanymi.length).toBeGreaterThan(0);
    for (const b of zDanymi) expect(z.find((x) => x.id === b.id)?.levels).toBe(b.levels);
  });

  it('deterministyczny', () => {
    for (const klucz of KLUCZE) {
      expect(poziomy(zbuduj(klucz, { pietra: true }))).toEqual(poziomy(zbuduj(klucz, { pietra: true })));
    }
  });

  it('wyłączona flaga nic nie zmienia', () => {
    for (const klucz of KLUCZE) {
      const bez = demoSwiat(klucz, false);
      const wylaczona = zbuduj(klucz, { pietra: false });
      expect(poziomy(wylaczona)).toEqual(poziomy(bez));
      expect(worldKey(wylaczona)).toBe(worldKey(bez));
    }
  });

  it('worldKey z flagą i bez jest taki sam', () => {
    for (const klucz of KLUCZE) expect(worldKey(demoSwiat(klucz, true))).toBe(worldKey(demoSwiat(klucz, false)));
  });

  it('awansujDomy: liczy awanse, pomija małe domy i bloki, drugi raz nic nie robi', () => {
    const w = {
      seed: 7,
      buildings: [
        budynek(0, 'dom', 1, 100),
        budynek(1, 'dom', 1, 100),
        budynek(2, 'dom', 1, 100),
        budynek(3, 'dom', 1, 100),
        budynek(4, 'dom', 1, 59),
        budynek(5, 'blok', 1, 500),
        budynek(6, 'dom', 3, 100),
      ],
    };
    // domy od 60 m²: pięć (id 0-3 i 6), z czego jeden już ma 3 kondygnacje; potrzeba ceil(5 / 2) = 3, więc dwa awanse
    expect(awansujDomy(w)).toBe(2);
    expect(w.buildings.filter((b) => b.id <= 3 && b.levels === 2)).toHaveLength(2);
    expect(w.buildings[4].levels).toBe(1);
    expect(w.buildings[5].levels).toBe(1);
    expect(w.buildings[6].levels).toBe(3);
    expect(awansujDomy(w)).toBe(0);
  });

  it('awansujDomy: bez domów od 60 m² nic nie robi', () => {
    const w = { seed: 7, buildings: [budynek(0, 'blok', 5, 800), budynek(1, 'dom', 1, 30)] };
    expect(awansujDomy(w)).toBe(0);
    expect(poziomy(w)).toEqual([5, 1]);
  });
});

describe('pietra: lista pięter', () => {
  it('przymorze bez flagi: 17 pozycji od zera', () => {
    const l = listaPieter(demoSwiat('przymorze', false));
    expect(l).toHaveLength(17);
    expect(l[0]).toBe(0);
    expect(l).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it('zielonki: bez flagi tylko parter, z flagą dwa piętra', () => {
    expect(listaPieter(demoSwiat('zielonki', false))).toEqual([0]);
    expect(listaPieter(demoSwiat('zielonki', true))).toEqual([0, 1]);
  });

  it('wysoki budynek nie daje więcej niż PIETER_MAX pozycji', () => {
    const l = listaPieter({ buildings: [budynek(0, 'blok', 30, 800)] });
    expect(l).toHaveLength(PIETER_MAX);
    expect(l[0]).toBe(0);
    expect(l[l.length - 1]).toBe(PIETER_MAX - 1);
  });
});
