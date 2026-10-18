/* Oznaczanie mapy tagiem zm:bud (src/mieszkancy/oznacz.ts): każdy członek budynku z generatora dostaje klucz
   `Budynek.klucz`, żeby świat gry (WorldBuilding.tags) wiedział, któremu budynkowi generatora odpowiada.
   Chodzi zawsze, na demach z public/demo/ i tabelach z public/data/mieszkancy/, bez surowych plików. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import type { TabeleGminy, TabeleKraju } from '../../src/mieszkancy/tabele.ts';
import type { Geo, GeoBuilding, Pt } from '../../src/world/geo.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;
const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;

const prostokat = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
const blok = (p: Pt[], t: Record<string, string> = {}): GeoBuilding => ({
  p,
  t: { building: 'apartments', 'building:levels': '5', ...t },
});
const mapa = (b: GeoBuilding[]): Geo => ({ c: [52, 21], b, r: [], a: [], w: [], poi: [] });

describe('oznaczGeo na demach', () => {
  const przypadki: [string, TabeleGminy][] = [
    ['przymorze', gdansk],
    ['lanciego', ursynow],
  ];

  it('członkowie dostają zm:bud równe kluczowi budynku, reszta map nie dostaje nic', () => {
    for (const [nazwa, g] of przypadki) {
      const geo = demo(nazwa);
      const pary = budynkiZCzlonkami(geo, g, kraj);
      const wynik = oznaczGeo(geo, pary);
      const klucze = new Map<number, string>();
      for (const { budynek, czlonkowie } of pary) for (const i of czlonkowie) klucze.set(i, budynek.klucz);
      expect(klucze.size, nazwa).toBeGreaterThan(20);
      expect(wynik.b.length, nazwa).toBe(geo.b.length);
      wynik.b.forEach((b, i) => {
        expect(b.t['zm:bud'], `${nazwa} ${i}`).toBe(klucze.get(i));
        // reszta budynku bez zmian: obrys i pozostałe tagi
        expect(b.p, `${nazwa} ${i}`).toEqual(geo.b[i].p);
        const { 'zm:bud': _, ...bezZnaku } = b.t;
        expect(bezZnaku, `${nazwa} ${i}`).toEqual(geo.b[i].t);
      });
    }
  });

  it('wejście zostaje nietknięte (structuredClone przed i po), wynik to osobny obiekt', () => {
    for (const [nazwa, g] of przypadki) {
      const geo = demo(nazwa);
      const przed = structuredClone(geo);
      const pary = budynkiZCzlonkami(geo, g, kraj);
      const parPrzed = structuredClone(pary);
      const wynik = oznaczGeo(geo, pary);
      expect(geo, nazwa).toEqual(przed);
      expect(pary, nazwa).toEqual(parPrzed);
      expect(wynik, nazwa).not.toBe(geo);
      expect(wynik.b, nazwa).not.toBe(geo.b);
      // tag trafił do kopii, nie do wejścia
      expect(
        geo.b.some((b) => 'zm:bud' in b.t),
        nazwa,
      ).toBe(false);
      expect(
        wynik.b.some((b) => 'zm:bud' in b.t),
        nazwa,
      ).toBe(true);
      // reszta mapy jest ta sama
      expect(wynik.c).toEqual(geo.c);
      expect(wynik.r).toEqual(geo.r);
      expect(wynik.poi).toEqual(geo.poi);
    }
  });

  it('powtórne oznaczenie daje to samo; bez par mapa zostaje bez zm:bud', () => {
    const geo = demo('przymorze');
    const pary = budynkiZCzlonkami(geo, gdansk, kraj);
    const raz = oznaczGeo(geo, pary);
    expect(oznaczGeo(raz, pary)).toEqual(raz);
    expect(oznaczGeo(geo, [])).toEqual(geo);
  });

  it('falowiec ma wielu członków i wszyscy noszą jego klucz', () => {
    const geo = demo('przymorze');
    const pary = budynkiZCzlonkami(geo, gdansk, kraj);
    const falowiec = pary.reduce((a, b) => (b.budynek.pole > a.budynek.pole ? b : a));
    expect(falowiec.czlonkowie.length).toBeGreaterThanOrEqual(2);
    const wynik = oznaczGeo(geo, pary);
    for (const i of falowiec.czlonkowie) expect(wynik.b[i].t['zm:bud']).toBe(falowiec.budynek.klucz);
  });
});

describe('oznaczGeo na małych mapach', () => {
  it('oznacza tylko wskazane indeksy, a nieistniejący indeks pomija bez błędu', () => {
    const geo = mapa([
      blok(prostokat(0, 0, 20, 12), { 'zm:klucz': 'px:1:2:3:4' }),
      blok(prostokat(100, 0, 20, 12), { id: 'w7' }),
      blok(prostokat(200, 0, 20, 12)),
    ]);
    const wynik = oznaczGeo(geo, [
      { budynek: { ...budynkiZCzlonkami(geo, null, kraj)[0].budynek, klucz: 'px:1:2:3:4' }, czlonkowie: [0, 99] },
    ]);
    expect(wynik.b[0].t['zm:bud']).toBe('px:1:2:3:4');
    expect(wynik.b[0].t['zm:klucz']).toBe('px:1:2:3:4'); // inne tagi zostają
    expect('zm:bud' in wynik.b[1].t).toBe(false);
    expect('zm:bud' in wynik.b[2].t).toBe(false);
    expect(wynik.b.length).toBe(3);
  });

  it('z budynkiZCzlonkami: tag zm:bud to klucz z zm:klucz, a sklejone segmenty niosą ten sam', () => {
    const geo = mapa([
      blok(prostokat(0, 0, 20, 12), { 'zm:klucz': 'px:10:20:0:12' }),
      blok(prostokat(20, 0, 40, 12), { 'zm:klucz': 'px:30:20:0:12' }),
      blok(prostokat(300, 0, 20, 12), { 'zm:klucz': 'px:99:20:0:12' }),
    ]);
    const pary = budynkiZCzlonkami(geo, null, kraj);
    expect(pary.map((p) => p.budynek.klucz)).toEqual(['px:30:20:0:12', 'px:99:20:0:12']);
    const wynik = oznaczGeo(geo, pary);
    expect(wynik.b.map((b) => b.t['zm:bud'])).toEqual(['px:30:20:0:12', 'px:30:20:0:12', 'px:99:20:0:12']);
  });
});

describe('src/mieszkancy/oznacz.ts: moduł czysty', () => {
  const zrodlo = fs
    .readFileSync(path.resolve(import.meta.dirname, '../../src/mieszkancy/oznacz.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('nie importuje z sim, ui, render, gov ani z node:, bez losowości i zegara', () => {
    expect(zrodlo).not.toMatch(/from '\.\.\/(sim|ui|render|gov)\//);
    expect(zrodlo).not.toMatch(/from 'node:/);
    expect(zrodlo).not.toMatch(/Math\.(random|sin|cos|tan|exp|log|pow)\b|Date\./);
  });
});
