/* Opis miejsca dla zarządu: dom albo blok, sąsiedzi, sklep, garaże, przychodnia i wieża ze świata, słownik
   wspólnoty (w domu ulica i komitet ulicy, w bloku spółdzielnia i zarząd), wolne miejsca i pole w wejściu. */

import { describe, expect, it } from 'vitest';
import { BLOK, freePlaces, type PlaceWorld, placeOf, wordsOf } from '../../src/gov/miejsce.ts';
import { govInput } from '../../src/sim/gov.ts';
import { createSim } from '../../src/sim/sim.ts';
import { bud, demoWorld, placeWorld } from './miejsce-pomoc.ts';

describe('opis miejsca ze świata', () => {
  it.each(['przymorze', 'lanciego'])('%s: blok wśród bloków ze sklepem i garażami', (key) => {
    const p = placeOf(demoWorld(key).w);
    expect(p.kind).toBe('blok');
    expect(p.near).toBe('bloki');
    expect(p.shop).not.toBeNull();
    expect(p.garages).not.toBeNull();
  });

  it('Zielonki: dom wśród domów, bez sklepu, z garażem i przychodnią', () => {
    const p = placeOf(demoWorld('zielonki').w);
    expect(p.kind).toBe('dom');
    expect(p.near).toBe('domy');
    expect(p.blocks).toBe(0);
    expect(p.houses).toBeGreaterThan(5);
    expect(p.shop).toBeNull();
    expect(p.garages).not.toBeNull();
    expect(p.clinic).not.toBeNull();
  });

  it('samotny dom bez budynków mieszkalnych w 120 m: sąsiadów nie ma', () => {
    const p = placeOf(placeWorld([bud(0, 'dom', 0, 0), bud(1, 'garaz', 50, 0), bud(2, 'dom', 200, 0)]));
    expect(p.kind).toBe('dom');
    expect(p.near).toBe('nikt');
    expect(p.garages).toBe(50);
  });

  it('jeden blok wśród wielu domów: sąsiedzi to domy, choć siedziba to blok', () => {
    const homes = [1, 2, 3].map((k) => bud(k, 'dom', 30 * k, 0));
    const p = placeOf(placeWorld([bud(0, 'blok', 0, 0, { levels: 4 }), ...homes, bud(4, 'blok', 0, 60)], 8));
    expect(p.kind).toBe('blok');
    expect(p.near).toBe('domy');
  });

  it('dom z jednym mieszkaniem rozpoznany po wnętrzu, gdy klasa budynku jest inna', () => {
    expect(placeOf(placeWorld([bud(0, 'inne', 0, 0, { levels: 2 })], 1)).kind).toBe('dom');
    expect(placeOf(placeWorld([bud(0, 'inne', 0, 0, { levels: 4 })], 1)).kind).toBe('blok');
  });

  it('świat bez listy mieszkań i punktów (atrapy w testach): rodzaj z klasy budynku', () => {
    const bare = (cls: 'blok' | 'dom') =>
      ({ buildings: [bud(0, cls, 0, 0, { levels: 4 })], hq: 0 }) as unknown as PlaceWorld;
    expect(placeOf(bare('blok')).kind).toBe('blok');
    expect(placeOf(bare('dom')).kind).toBe('dom');
    expect(placeOf(bare('blok')).shop).toBeNull();
  });

  it('sklep i przychodnia z punktów, ale tylko w zasięgu', () => {
    const w = placeWorld([bud(0, 'dom', 0, 0)], 1, [
      { x: 0, y: 280, c: 'spozywczy', n: 'Sklep' },
      { x: 320, y: 0, c: 'apteka', n: 'Apteka' },
    ]);
    const p = placeOf(w);
    expect(p.shop).toBe(280);
    expect(p.clinic).toBeNull();
  });

  it('wieża to najwyższy budynek do 200 m', () => {
    const tower = (...b: ReturnType<typeof bud>[]) => placeOf(placeWorld([bud(0, 'dom', 0, 0), ...b])).tower;
    expect(tower(bud(1, 'blok', 100, 0, { levels: 6 }), bud(2, 'blok', 0, 150, { levels: 12 }))).toBe('wiezowiec');
    expect(tower(bud(1, 'blok', 100, 0, { levels: 6 }), bud(2, 'blok', 0, 250, { levels: 12 }))).toBe('blok');
    expect(tower(bud(1, 'sklep', 100, 0, { area: 1500 }))).toBe('market');
    expect(tower(bud(1, 'sklep', 100, 0, { area: 400 }), bud(2, 'blok', 50, 0, { levels: 4 }))).toBeNull();
    expect(tower(bud(1, 'szkola', 100, 0, { levels: 3 }), bud(2, 'hala', 50, 0))).toBe('szkola');
  });

  it('pamięta wynik dla tego samego świata', () => {
    const w = demoWorld('zielonki').w;
    expect(placeOf(w)).toBe(placeOf(w));
  });

  it('wejście zarządu z symulacji niesie opis miejsca', () => {
    const { w, seed } = demoWorld('zielonki');
    expect(govInput(createSim(w, seed, { core: 4 }), w, 0).place).toEqual(placeOf(w));
  });
});

describe('słownik wspólnoty', () => {
  it('w domu ulica i komitet ulicy', () => {
    const s = wordsOf(placeOf(demoWorld('zielonki').w));
    expect(s.zarzad.m).toBe('komitet ulicy');
    expect(s.zarzad.d).toBe('komitetu ulicy');
    expect(s.Zarzad).toBe('Komitet ulicy');
    expect(s.wspolnota.w).toBe('na ulicy');
    expect(s.walne).toBe('zebranie ulicy');
    expect(s.naglowek).toBe('Na ulicy');
    expect(s.mieszkancy.d).toBe('sąsiadów');
  });

  it('w bloku spółdzielnia i zarząd jak dotąd', () => {
    const s = wordsOf(BLOK);
    expect(s.Zarzad).toBe('Zarząd');
    expect(s.zarzad.d).toBe('zarządu');
    expect(s.wspolnota.d).toBe('spółdzielni');
    expect(s.walne).toBe('walne');
    expect(s.naglowek).toBe('Na osiedlu');
    expect(s.mieszkancy.m).toBe('mieszkańcy');
  });
});

describe('wolne miejsca dla mieszkańców', () => {
  it('miejsca minus mieszkańcy, nigdy poniżej zera, bez danych cztery', () => {
    expect(freePlaces({ cap: 8, residents: 7 })).toBe(1);
    expect(freePlaces({ cap: 6, residents: 9 })).toBe(0);
    expect(freePlaces({})).toBe(4);
  });
});
