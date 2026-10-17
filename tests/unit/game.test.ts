import { describe, expect, it } from 'vitest';
import { footprint, WRECK_BASE } from '../../src/render/art/rzeczy.ts';
import {
  fenceCodes,
  fenceStateFn,
  GAME_KINDS,
  gameLights,
  HEAPS,
  onTables,
  STRANGERS,
  strangerVisibility,
  windowSpots,
} from '../../src/render/game.ts';
import { IN, specOf, type ThingLike, WRECK_LOOKS } from '../../src/render/section.ts';
import { mockWrecks } from '../../src/render/yard.ts';
import type { Heap } from '../../src/world/heaps.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { T } from '../../src/world/terrain.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

let cached: World | null = null;
function przymorze(): World {
  if (!cached) {
    const a = ADDRESSES[0];
    cached = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 });
  }
  return cached;
}

const things = (w: World, kozaFuel: number): ThingLike[] =>
  w.interior.furniture.map((f) => ({ ...f, fuel: f.kind === 'koza' ? kozaFuel : 0 }));

describe('światła ze stanu gry', () => {
  it('okna mają punkt na zewnątrz szyby i pomieszczenie za sobą', () => {
    const w = przymorze();
    const spots = windowSpots(w);
    expect(spots.length).toBe(w.interior.windows.length);
    for (const s of spots) {
      expect(w.interior.cell[Math.floor(s.y) * w.size + Math.floor(s.x)]).toBe(IN.NONE);
      expect(w.interior.rooms[s.room]).toBeDefined();
    }
  });

  it('zimna koza i ciemne pomieszczenia: żadnego światła', () => {
    const w = przymorze();
    const light = new Array(w.interior.rooms.length).fill(0);
    expect(gameLights({ st: { things: things(w, 0), felled: [], tick: 0 }, light }, windowSpots(w))).toEqual([]);
  });

  it('paląca się koza świeci we wnętrzu, okna jej pomieszczenia na zewnątrz, przez drzwi słabiej', () => {
    const w = przymorze();
    const koza = w.interior.furniture.find((f) => f.kind === 'koza')!;
    const room = w.interior.room[koza.y * w.size + koza.x];
    const light = new Array(w.interior.rooms.length).fill(0);
    light[room] = 1;
    const spots = windowSpots(w);
    const half = spots.find((s) => s.room !== room)!.room;
    light[half] = 0.5;
    const ls = gameLights({ st: { things: things(w, 400), felled: [], tick: 0 }, light }, spots);
    const fire = ls.filter((l) => l.inside);
    expect(fire).toHaveLength(1);
    expect(fire[0]).toMatchObject({ x: koza.x + 0.5, y: koza.y + 0.5 });
    const panes = ls.filter((l) => !l.inside);
    expect(panes.length).toBe(spots.filter((s) => s.room === room || s.room === half).length);
    const strong = panes.find((l) => spots.some((s) => s.room === room && s.x === l.x && s.y === l.y))!;
    const weak = panes.find((l) => spots.some((s) => s.room === half && s.x === l.x && s.y === l.y))!;
    expect(strong.strength).toBeGreaterThan(weak.strength);
  });

  it('ognisko z ogniem i zapalona lampa warty też świecą', () => {
    const ls = gameLights(
      {
        st: {
          things: [
            { kind: 'ognisko', x: 3, y: 4, w: 1, h: 1, rot: 0, fuel: 10 },
            { kind: 'ognisko', x: 9, y: 9, w: 1, h: 1, rot: 0, fuel: 0 },
            { kind: 'lampa', x: 6, y: 2, w: 1, h: 1, rot: 0 },
          ],
          felled: [],
          tick: 0,
        },
        light: [],
      },
      [],
    );
    expect(ls.map((l) => [l.x, l.y])).toEqual([
      [3.5, 4.6],
      [6.5, 2.6],
    ]);
  });
});

describe('stan siatki z blocked symulacji', () => {
  it('dziury ze startu, łata po zablokowaniu, nowa dziura, brama otwarta i zamknięta', () => {
    const w = przymorze();
    const f = w.fence;
    const blocked = w.blocked.slice();
    let codes = fenceCodes(f, blocked, w.size);
    let state = fenceStateFn(f, codes);
    for (const h of f.hole) expect(state(h)).toBe('dziura');
    const whole = f.tiles.find((i) => !f.hole.includes(i))!;
    expect(state(whole)).toBe('cala');
    // brama na starcie otwarta (blocked 0)
    expect(codes[f.tiles.length]).toBe(1);
    // symulacja łata pierwszą dziurę, wybija nową i zamyka bramę
    blocked[f.hole[0]] = 1;
    blocked[whole] = 0;
    blocked[f.gate.y * w.size + f.gate.x] = 1;
    codes = fenceCodes(f, blocked, w.size);
    state = fenceStateFn(f, codes);
    expect(state(f.hole[0])).toBe('lata');
    expect(state(whole)).toBe('dziura');
    expect(codes[f.tiles.length]).toBe(0);
  });
});

describe('obcy w nocy', () => {
  it('w dzień widać, w ciemności nie, w świetle znowu tak', () => {
    expect(strangerVisibility(0, 0)).toBe(1);
    expect(strangerVisibility(1, 0)).toBe(0);
    expect(strangerVisibility(1, 0.8)).toBe(1);
    expect(strangerVisibility(1, 0.2)).toBeGreaterThan(0);
    expect(strangerVisibility(1, 0.2)).toBeLessThan(0.5);
    expect(STRANGERS.has('szabrownik')).toBe(true);
    expect(STRANGERS.has('crowd')).toBe(false);
  });

  it('rzeczy gry: meble, zapasy, trzepak i siatka są z gry, podgląd tych rodzajów się pomija', () => {
    for (const k of ['koza', 'drewno', 'pien', 'trzepak', 'siatka', 'brama']) expect(GAME_KINDS.has(k)).toBe(true);
    for (const k of ['ognisko', 'lampa']) expect(GAME_KINDS.has(k)).toBe(false);
  });
});

describe('sterty, garnek i wraki', () => {
  it('sterty ze świata mają wielkość z liczby sztuk, jak drewno', () => {
    const w = przymorze();
    const heaps = w.props.filter((p): p is Heap => HEAPS.has(p.kind));
    expect(heaps.length).toBeGreaterThanOrEqual(3);
    for (const h of heaps) {
      const spec = specOf({ rot: 0, ...h });
      // śmieci (kontrakt M2, gdy świat je rozstawia): n to wielkość sterty 1–3, nie liczba sztuk
      const trash = (h.kind as string) === 'smieci';
      expect(spec).toMatchObject({ kind: h.kind, size: trash ? Math.min(3, h.n) : h.n >= 6 ? 3 : h.n >= 3 ? 2 : 1 });
    }
    for (const k of ['gruz', 'deski', 'zlom', 'wrak']) expect(GAME_KINDS.has(k)).toBe(true);
  });

  it('garnek stoi na stole, pod którym jest, i ma wielkość z porcji', () => {
    const stol: ThingLike = { kind: 'stol', x: 10, y: 5, w: 1, h: 2, rot: 1 };
    const pot: ThingLike = { kind: 'posilek', x: 10, y: 5, w: 1, h: 1, rot: 0, n: 4 };
    const floor: ThingLike = { kind: 'posilek', x: 3, y: 3, w: 1, h: 1, rot: 0, n: 0 };
    const list = onTables([stol, pot, floor]);
    expect(list[1].table).toBe(7);
    expect(list[2].table).toBeUndefined();
    expect(specOf(list[1])).toMatchObject({ kind: 'posilek', size: 2, table: true });
    expect(specOf(list[2])).toMatchObject({ kind: 'posilek', size: 0, table: false });
    // bez garnka ta sama lista, nic nowego co klatkę
    const plain = [stol];
    expect(onTables(plain)).toBe(plain);
  });

  it('wrak z kontraktu świata: model, ustawienie i jeden z wyglądów', () => {
    const t: ThingLike = { kind: 'wrak', x: 40, y: 22, w: 2, h: 4, rot: 3, model: 'polonez' };
    const spec = specOf(t)!;
    expect(spec).toMatchObject({ kind: 'wrak', model: 'polonez', rot: 3 });
    expect(spec.seed).toBeGreaterThanOrEqual(0);
    expect(spec.seed).toBeLessThan(WRECK_LOOKS);
    expect(footprint(spec)).toEqual({ w: 2, h: 4 });
  });

  it('atrapa wraków stoi na parkingu albo przy krawężniku jezdni, poza podwórkiem, bez nakładania', () => {
    const w = przymorze();
    const list = mockWrecks(w);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(mockWrecks(w)).toEqual(list);
    const used = new Set<number>();
    const off = new Set([...w.fence.yard, ...w.fence.tiles]);
    for (const c of list) {
      const [a, b] = WRECK_BASE[c.model];
      expect([c.w, c.h]).toEqual(c.rot & 1 ? [b, a] : [a, b]);
      for (let dy = 0; dy < c.h; dy++)
        for (let dx = 0; dx < c.w; dx++) {
          const i = (c.y + dy) * w.size + c.x + dx;
          expect([T.PARKING, T.ROAD]).toContain(w.terr[i]);
          expect(w.blocked[i]).toBe(0);
          expect(off.has(i)).toBe(false);
          expect(used.has(i)).toBe(false);
          used.add(i);
        }
    }
    expect(new Set(list.map((c) => c.model)).size).toBe(2);
    // na jezdni prawy bok przy krawężniku: za nim już nie jezdnia (rot 0: na południe, 1: na zachód…)
    const paved = (x: number, y: number) => [T.ROAD, T.PARKING].includes(w.terr[y * w.size + x] as 3 | 6);
    for (const c of list.filter((q) => w.terr[q.y * w.size + q.x] === T.ROAD)) {
      const along = c.rot & 1 ? c.h : c.w;
      for (let k = 0; k < along; k++) {
        const [x, y] = [
          [c.x + k, c.y + c.h],
          [c.x - 1, c.y + k],
          [c.x + k, c.y - 1],
          [c.x + c.w, c.y + k],
        ][c.rot];
        expect(paved(x, y)).toBe(false);
      }
    }
  });
});
