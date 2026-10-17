import { describe, expect, it } from 'vitest';
import { footprint } from '../../src/render/art/rzeczy.ts';
import { NB } from '../../src/render/art/wnetrze.ts';
import { type FenceLike, fenceThings, mockFence } from '../../src/render/yard.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

describe('siatka na schodkach po skosie', () => {
  it('kafelki stykające się rogiem dostają narożny łącznik, linia jest ciągła', () => {
    const size = 10;
    const bid = new Int32Array(size * size).fill(-1);
    // rząd y = 2 od x = 1 do 4, potem schodek w dół: rząd y = 3 od x = 5 do 8; brama daleko
    const tiles = [1, 2, 3, 4].map((x) => 2 * size + x).concat([5, 6, 7, 8].map((x) => 3 * size + x));
    const f: FenceLike = { tiles, hole: [], gate: { x: 0, y: 8, w: 2, h: 1, rot: 0 }, yard: [] };
    const things = fenceThings(f, { size, bid });
    const at = (x: number, y: number) => things.find((t) => t.kind === 'siatka' && t.x === x && t.y === y);
    const mask = (x: number, y: number) => (at(x, y)!.spec as { mask: number }).mask;
    // łącznik w (5, 2): od zachodu (4, 2) i na południe (5, 3)
    expect(at(5, 2)).toBeDefined();
    expect(mask(5, 2)).toBe(NB.W | NB.S);
    expect(mask(4, 2)).toBe(NB.E | NB.W);
    expect(mask(5, 3) & NB.N).toBe(NB.N);
    // na prostych odcinkach łączników nie ma
    expect(things.filter((t) => t.kind === 'siatka')).toHaveLength(tiles.length + 1);
  });
});

describe('siatka z bramą jako rzeczy', () => {
  // mapa 10×10, budynek w kolumnie 7 (wiersze 2–4), siatka: rząd y = 2 od x = 2 do 6, brama w (2, 3)–(2, 4)
  const size = 10;
  const bid = new Int32Array(size * size).fill(-1);
  for (let y = 2; y <= 4; y++) bid[y * size + 7] = 0;
  const row = [2, 3, 4, 5, 6].map((x) => 2 * size + x);
  const f: FenceLike = { tiles: row, hole: [2 * size + 4], gate: { x: 2, y: 3, w: 1, h: 2, rot: 1 }, yard: [] };
  const things = fenceThings(f, { size, bid });
  const at = (x: number) => things.find((t) => t.kind === 'siatka' && t.x === x && t.y === 2)!;
  const spec = (x: number) => at(x).spec as { mask: number; state: string; post?: boolean };

  it('maska z sąsiadów: siatka, brama i ściana budynku', () => {
    expect(spec(3).mask).toBe(NB.E | NB.W);
    // narożnik nad bramą: siatka na wschodzie, brama na południu
    expect(spec(2).mask).toBe(NB.E | NB.S);
    // koniec przy budynku: siatka na zachodzie, ściana na wschodzie
    expect(spec(6).mask).toBe(NB.E | NB.W);
  });

  it('dziury ze startu, słupki co trzy kafelki na prostych odcinkach, brama na końcu', () => {
    expect(spec(4).state).toBe('dziura');
    expect(spec(5).state).toBe('cala');
    expect(spec(4).post).toBe(true); // (4 + 2) % 3 = 0
    expect(spec(5).post).toBe(false);
    expect(spec(2).post).toBeUndefined(); // narożnik: słupek stawia sprite
    expect(things.at(-1)).toMatchObject({ kind: 'brama', x: 2, y: 3, w: 1, h: 2, spec: { kind: 'brama', rot: 1 } });
  });

  it('stan ze stanu gry zastępuje dziury ze startu', () => {
    const patched = fenceThings(f, { size, bid }, (i) => (i === 2 * size + 4 ? 'lata' : undefined));
    expect((patched.find((t) => t.x === 4 && t.y === 2)!.spec as { state: string }).state).toBe('lata');
  });
});

describe('atrapa siatki (podgląd)', () => {
  for (const key of ['przymorze', 'zielonki']) {
    it(`${key}: obwód bez budynków, brama 2 m na boku, dziury w siatce, wymiary bramy jak w grafice`, () => {
      const a = ADDRESSES.find((x) => x.key === key)!;
      const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 });
      const f = mockFence(w);
      expect(f.tiles.length).toBeGreaterThan(20);
      for (const i of f.tiles) expect(w.bid[i]).toBe(-1);
      expect(f.hole.length).toBe(3);
      for (const i of f.hole) expect(f.tiles).toContain(i);
      const g = f.gate;
      expect([g.w * g.h, Math.min(g.w, g.h)]).toEqual([2, 1]);
      for (let dy = 0; dy < g.h; dy++)
        for (let dx = 0; dx < g.w; dx++) expect(f.tiles).not.toContain((g.y + dy) * w.size + g.x + dx);
      const gate = fenceThings(f, w).at(-1)!;
      expect(footprint(gate.spec!)).toEqual({ w: g.w, h: g.h });
    });
  }
});
