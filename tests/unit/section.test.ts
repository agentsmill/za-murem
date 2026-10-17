import { describe, expect, it } from 'vitest';
import { buildScene, chunkSceneOf } from '../../src/render/art/scene.ts';
import { LOD_FAR, LOD_NEAR, planOrders } from '../../src/render/chunks.ts';
import { describeTile, flatThingSprite, IN, NB, sectionOf } from '../../src/render/section.ts';
import { mockInterior } from '../../src/render/sectionMock.ts';
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

describe('atrapa wnętrza (podgląd przekroju)', () => {
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`${key}: wnętrze w obrysie siedziby, ściany na brzegu, drzwi w wejściach, meble na posadzce`, () => {
      const w = world(key);
      const int = mockInterior(w, w.hq);
      const size = w.size;
      const b = w.buildings[w.hq];
      let floor = 0;
      for (let i = 0; i < int.cell.length; i++) {
        if (int.cell[i] === IN.NONE) continue;
        expect(w.bid[i]).toBe(w.hq);
        if (int.cell[i] === IN.FLOOR) floor++;
        // posadzka nie dotyka świata poza budynkiem
        const x = i % size;
        const y = (i - x) / size;
        if (int.cell[i] === IN.FLOOR)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            expect(w.bid[(y + dy) * size + x + dx]).toBe(w.hq);
      }
      expect(floor).toBeGreaterThan(10);
      for (const e of b.entrances) expect(int.cell[e.tile]).toBe(IN.DOOR);
      expect(int.rooms.some((r) => r.kind === 'klatka')).toBe(true);
      // każde pomieszczenie ma posadzkę, numery pomieszczeń zgodne z kolejnością
      int.rooms.forEach((r, k) => {
        expect(r.id).toBe(k);
        expect(int.room.some((v, i) => v === k && int.cell[i] !== IN.WALL)).toBe(true);
      });
      // meble na wolnej posadzce swojego mieszkania, bez nakładania
      const used = new Set<number>();
      for (const f of int.furniture)
        for (let dy = 0; dy < f.h; dy++)
          for (let dx = 0; dx < f.w; dx++) {
            const i = (f.y + dy) * size + f.x + dx;
            expect(int.cell[i]).toBe(IN.FLOOR);
            expect(used.has(i)).toBe(false);
            used.add(i);
          }
      // koza stoi tyłem do okna
      const koza = int.furniture.find((f) => f.kind === 'koza');
      if (koza) {
        const [dx, dy] = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ][koza.rot];
        expect(int.windows).toContain((koza.y + dy) * size + koza.x + dx);
      }
    });
  }

  it('Przymorze: mieszkania z kuchnią i pokojem, koza i skład w kuchni zarządu', () => {
    const w = world('przymorze');
    const int = mockInterior(w, w.hq);
    expect(int.rooms.filter((r) => r.kind === 'kuchnia').length).toBeGreaterThanOrEqual(2);
    expect(int.rooms.filter((r) => r.kind === 'pokoj').length).toBeGreaterThanOrEqual(2);
    expect(int.furniture.map((f) => f.kind)).toEqual(expect.arrayContaining(['koza', 'stol', 'lozko']));
    expect(int.sklad.length).toBeGreaterThan(0);
    expect(int.home).toBeGreaterThanOrEqual(0);
  });
});

describe('opis kafelka wnętrza (wejście dla grafiki zastępczej)', () => {
  const w = world('przymorze');
  const int = mockInterior(w, w.hq);
  const sec = sectionOf(int);
  const size = w.size;
  const desc = (i: number) => describeTile(sec, i, size, 0xaabbcc)!;

  it('poza wnętrzem nic, posadzka z rodzajem pomieszczenia', () => {
    const outside = int.cell.indexOf(IN.NONE);
    expect(describeTile(sec, outside, size, 0)).toBeNull();
    const i = int.cell.findIndex((c, k) => c === IN.FLOOR && int.room[k] >= 0);
    expect(desc(i)).toMatchObject({ kind: 'floor', room: int.rooms[int.room[i]].kind });
  });

  it('ściana nad pomieszczeniem ma front w jego kolorze, ściana zewnętrzna wie, gdzie jest ulica', () => {
    let checked = 0;
    for (let i = 0; i < int.cell.length && checked < 50; i++) {
      if (int.cell[i] !== IN.WALL || int.windows.includes(i)) continue;
      const d = desc(i);
      expect(d.kind).toBe('wall');
      if (d.kind !== 'wall') continue;
      const s = i + size;
      if (int.cell[s] === IN.FLOOR) expect(d.face).toBe(int.rooms[int.room[s]].kind);
      if (int.cell[s] === IN.NONE) {
        expect(d.face).toBe('out');
        expect(d.facade).toBe(0xaabbcc);
        expect(d.out! & NB.S).toBeTruthy();
      }
      if (int.cell[s] === IN.WALL) expect(d.face).toBeUndefined();
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('drzwi frontowe to wejście, okno wie, z której strony jest ulica i jakie pomieszczenie za nim', () => {
    const e = w.buildings[w.hq].entrances[0];
    expect(desc(e.tile)).toMatchObject({ kind: 'door', entrance: true });
    expect(int.windows.length).toBeGreaterThan(3);
    for (const wi of int.windows) {
      const d = desc(wi);
      expect(d.kind).toBe('window');
      if (d.kind !== 'window') continue;
      const [dx, dy] = d.out === NB.N ? [0, -1] : d.out === NB.S ? [0, 1] : d.out === NB.E ? [1, 0] : [-1, 0];
      expect(int.cell[wi + dy * size + dx]).toBe(IN.NONE);
      expect(d.room).toBe(int.rooms[int.room[wi - dy * size - dx]].kind);
    }
  });

  it('scena z przekrojem przechodzi przez structuredClone (do workera)', () => {
    const sc = buildScene(w);
    sc.section = sec;
    const copy = structuredClone(chunkSceneOf(sc));
    expect(copy.section!.cell).toEqual(sec.cell);
    expect([...copy.section!.windows]).toEqual([...sec.windows]);
  });
});

describe('meble i zamówienia przekroju', () => {
  it('sprite mebla: wierzch nad podstawą, kotwica na środku dolnej krawędzi', () => {
    const sp = flatThingSprite({ kind: 'stol', x: 3, y: 4, w: 2, h: 1, rot: 0 });
    expect(sp.w).toBe(64);
    expect(sp.h).toBeGreaterThan(32);
    expect(sp.ax).toBe(32);
    expect(sp.ay).toBe(sp.h);
    expect(sp.px.length).toBe(sp.w * sp.h);
    expect(sp.px.every((v) => v !== 0)).toBe(true);
  });

  it('nad siedzibą z bliska zamawia przekrój zamiast dachu, dach z bliska wystarcza za zaślepkę', () => {
    const cutOf = (k: number) => k === 4;
    // nic nie ma: dalekie zaślepki, potem przekrój dla 4 i bliski dla 5
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
    // jest dach z bliska: bez dalekiej zaślepki, zostaje tylko przekrój
    const has = (k: number, s: number, cut?: boolean) => s === LOD_FAR || (k === 4 && s === LOD_NEAR && !cut);
    expect(planOrders([4], 6, has, true, () => 0, cutOf)).toEqual([{ k: 4, s: LOD_NEAR, v: 0, cut: true }]);
  });
});
