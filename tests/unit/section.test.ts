import { describe, expect, it } from 'vitest';
import { footprint, thingSprite } from '../../src/render/art/rzeczy.ts';
import { buildScene, chunkSceneOf } from '../../src/render/art/scene.ts';
import { NB } from '../../src/render/art/wnetrze.ts';
import { LOD_FAR, LOD_NEAR, planOrders } from '../../src/render/chunks.ts';
import { describeTile, IN, sectionOf, specOf } from '../../src/render/section.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const worlds = new Map<string, World>();
function world(key: string): World {
  let w = worlds.get(key);
  if (!w) {
    const a = ADDRESSES.find((x) => x.key === key)!;
    w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 });
    worlds.set(key, w);
  }
  return w;
}

const STEP: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

describe('opis kafelka z prawdziwego wnętrza siedziby (wejście dla grafiki zastępczej)', () => {
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`${key}: posadzki, fronty ścian, okna, drzwi frontowe i schody zgodne z kontraktem`, () => {
      const w = world(key);
      const int = w.interior;
      const sec = sectionOf(w);
      const size = w.size;
      const entrances = new Set(w.buildings[int.building].entrances.map((e) => e.tile));
      const counts: Record<string, number> = {};
      for (let i = 0; i < int.cell.length; i++) {
        const d = describeTile(sec, i, size, 0xaabbcc);
        if (int.cell[i] === IN.NONE) {
          expect(d).toBeNull();
          continue;
        }
        if (!d) throw new Error(`brak opisu kafelka ${i}`);
        counts[d.kind] = (counts[d.kind] ?? 0) + 1;
        const s = i + size;
        if (d.kind === 'floor') expect(d.room).toBe(int.rooms[int.room[i]].kind);
        if (d.kind === 'wall') {
          if (int.cell[s] === IN.FLOOR) expect(d.face).toBe(int.rooms[int.room[s]].kind);
          if (int.cell[s] === IN.NONE) expect([d.face, d.facade, d.out! & NB.S]).toEqual(['out', 0xaabbcc, NB.S]);
          if (int.cell[s] === IN.WALL) expect(d.face).toBeUndefined();
        }
        if (d.kind === 'window') {
          const [dx, dy] = d.out === NB.N ? [0, -1] : d.out === NB.S ? [0, 1] : d.out === NB.E ? [1, 0] : [-1, 0];
          expect(int.cell[i + dy * size + dx]).toBe(IN.NONE);
          expect(d.room).toBe(int.rooms[int.room[i - dy * size - dx]].kind);
        }
        if (d.kind === 'door') expect(d.entrance).toBe(entrances.has(i));
        if (d.kind === 'stairs') {
          // w dół schodów (przeciwnie do up) dochodzi się do posadzki
          const [dx, dy] = STEP[d.up];
          let j = i;
          while (int.cell[j] === IN.STAIRS) j -= dy * size + dx;
          expect(int.cell[j]).toBe(IN.FLOOR);
        }
      }
      expect(counts.floor).toBeGreaterThan(20);
      expect(counts.wall).toBeGreaterThan(20);
      expect(counts.door).toBeGreaterThan(0);
      expect(counts.window).toBe(int.windows.length);
    });
  }

  it('scena z przekrojem przechodzi przez structuredClone (do workera)', () => {
    const w = world('przymorze');
    const sc = buildScene(w);
    sc.section = sectionOf(w);
    const copy = structuredClone(chunkSceneOf(sc));
    expect(copy.section!.cell).toEqual(w.interior.cell);
    expect([...copy.section!.windows]).toEqual(w.interior.windows);
    expect(copy.dryTree).toBe(w.dryTree);
  });
});

describe('rzeczy jako sprite’y grafiki zastępczej', () => {
  it('meble z wnętrza: opis sprite’a ma te same wymiary co mebel na mapie', () => {
    for (const key of ['przymorze', 'lanciego', 'zielonki']) {
      const w = world(key);
      for (const f of w.interior.furniture) {
        const spec = specOf(f);
        expect(spec, f.kind).not.toBeNull();
        expect(footprint(spec!), `${key} ${f.kind} rot ${f.rot}`).toEqual({ w: f.w, h: f.h });
        const sp = thingSprite(spec!);
        // kotwica (środek dolnej krawędzi podstawy) w sprite'cie, który mieści co najmniej podstawę
        expect(sp.w).toBeGreaterThanOrEqual(f.w * 32);
        expect(sp.ax).toBeGreaterThan(0);
        expect(sp.ax).toBeLessThan(sp.w);
        expect(sp.ay).toBeLessThanOrEqual(sp.h);
      }
    }
  });

  it('koza z ogniem ma klatki ognia, trzepak ustawienie z wymiarów, stos wielkość ze sztuk', () => {
    const koza = { kind: 'koza', x: 3, y: 4, w: 1, h: 1, rot: 0 };
    expect(specOf(koza)).toMatchObject({ kind: 'koza', fire: undefined });
    expect(specOf({ ...koza, fuel: 5 }, 4)).toMatchObject({ kind: 'koza', fire: 1 });
    expect(specOf({ kind: 'trzepak', x: 0, y: 0, w: 1, h: 3, rot: 0 })).toMatchObject({ kind: 'trzepak', rot: 1 });
    expect(specOf({ kind: 'trzepak', x: 0, y: 0, w: 3, h: 1, rot: 0 })).toMatchObject({ kind: 'trzepak', rot: 0 });
    expect(specOf({ kind: 'drewno', x: 0, y: 0, w: 1, h: 1, rot: 0, n: 4 })).toMatchObject({ size: 2 });
    expect(specOf({ kind: 'nieznane', x: 0, y: 0, w: 1, h: 1, rot: 0 })).toBeNull();
  });

  it('nad siedzibą z bliska zamawia przekrój zamiast dachu, dach z bliska wystarcza za zaślepkę', () => {
    const cutOf = (k: number) => k === 4;
    expect(
      planOrders(
        [4, 5],
        6,
        () => false,
        true,
        () => 0,
        cutOf,
      ).slice(0, 4),
    ).toEqual([
      { k: 4, s: LOD_FAR, v: 0 },
      { k: 5, s: LOD_FAR, v: 0 },
      { k: 4, s: LOD_NEAR, v: 0, cut: true },
      { k: 5, s: LOD_NEAR, v: 0 },
    ]);
    const has = (k: number, s: number, cut?: boolean) => s === LOD_FAR || (k === 4 && s === LOD_NEAR && !cut);
    expect(planOrders([4], 6, has, true, () => 0, cutOf)).toEqual([{ k: 4, s: LOD_NEAR, v: 0, cut: true }]);
  });
});
