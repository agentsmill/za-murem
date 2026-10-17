import { describe, expect, it } from 'vitest';
import {
  fenceCodes,
  fenceStateFn,
  GAME_KINDS,
  gameLights,
  STRANGERS,
  strangerVisibility,
  windowSpots,
} from '../../src/render/game.ts';
import { IN, type ThingLike } from '../../src/render/section.ts';
import { toGeoT } from '../../src/world/mvt.ts';
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
