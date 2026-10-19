/* Drzwi siedziby, która nie jest blokiem, prowadzą do ogródka (Mateusz, 19.10.2026: „wyjście z ogródka jest, ale
   z drugiej strony i trzeba całość obejść dookoła”). Podwórko to prostokąt przed pierwszym wejściem (fence.ts), więc
   drzwi prosto na jezdnię nie zostawiały miejsca na siatkę: podwórko wychodziło za domem, a drzwi i brama po
   przeciwnych stronach płotu. wejscieSiedziby przenosi wtedy drzwi na ścianę, której wyjście nie styka się z jezdnią.
   Mapka sztuczna: dom 7×7, jezdnia tuż przy zachodniej ścianie. W demach wyjście z drzwi siedziby jest w podwórku. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { T } from '../../src/world/terrain.ts';
import { buildWorld, findEntrances, type WorldBuilding, wejscieSiedziby } from '../../src/world/world.ts';

const SIZE = 30;

/** dom 7×7 (x 10–16, y 10–16), jezdnia w kolumnie 8, czyli kafelek przed zachodnią ścianą styka się z nią */
function mapka(cls: WorldBuilding['cls']) {
  const terr = new Uint8Array(SIZE * SIZE).fill(T.GRASS);
  const bid = new Int32Array(SIZE * SIZE).fill(-1);
  const blocked = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) terr[y * SIZE + 8] = T.ROAD;
  for (let y = 10; y <= 16; y++)
    for (let x = 10; x <= 16; x++) {
      bid[y * SIZE + x] = 0;
      blocked[y * SIZE + x] = 1;
    }
  const b = { id: 0, cls, levels: 1, x0: 10, y0: 10, x1: 16, y1: 16, entrances: [] } as unknown as WorldBuilding;
  return { b, terr, bid, blocked };
}

const przyJezdni = (terr: Uint8Array, o: number) =>
  [o, o - SIZE, o + SIZE, o - 1, o + 1].some((n) => terr[n] === T.ROAD);

describe('drzwi siedziby do ogródka', () => {
  it('dom z drzwiami prosto na jezdnię dostaje drzwi na innej ścianie, z dala od jezdni', () => {
    const { b, terr, bid, blocked } = mapka('dom');
    const zwykle = findEntrances(b, terr, bid, blocked, SIZE);
    expect(zwykle.map((e) => e.dir)).toEqual(['W']);
    expect(przyJezdni(terr, zwykle[0].out)).toBe(true);
    const nowe = wejscieSiedziby(b, terr, bid, blocked, SIZE);
    expect(nowe).toHaveLength(1);
    expect(nowe[0].dir).not.toBe('W');
    expect(przyJezdni(terr, nowe[0].out)).toBe(false);
    expect(bid[nowe[0].tile]).toBe(0);
    expect(bid[nowe[0].out]).toBe(-1);
  });

  it('blok zostaje z klatkami jak dotąd, dom bez jezdni przy drzwiach też', () => {
    const blok = mapka('blok');
    expect(wejscieSiedziby(blok.b, blok.terr, blok.bid, blok.blocked, SIZE)).toEqual(
      findEntrances(blok.b, blok.terr, blok.bid, blok.blocked, SIZE),
    );
    const dom = mapka('dom');
    for (let y = 0; y < SIZE; y++) dom.terr[y * SIZE + 8] = T.SIDEWALK;
    expect(wejscieSiedziby(dom.b, dom.terr, dom.bid, dom.blocked, SIZE)).toEqual(
      findEntrances(dom.b, dom.terr, dom.bid, dom.blocked, SIZE),
    );
  });

  it('w demach wyjście z drzwi siedziby jest w podwórku', () => {
    for (const key of ['przymorze', 'lanciego', 'zielonki']) {
      const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
      const w = buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
      expect(w.fence.yard, key).toContain(w.buildings[w.hq].entrances[0].out);
    }
  });
});
