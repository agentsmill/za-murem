import { describe, expect, it } from 'vitest';
import {
  ATLAS_H,
  ATLAS_W,
  FH,
  FW,
  frameRect,
  LIE,
  LOOKS,
  lieRect,
  makePeopleAtlas,
  POSE_FRAMES,
  POSES,
} from '../../src/render/art/people.ts';
import { gameLights } from '../../src/render/game.ts';
import { bedHead, FEED_TICKS, FeedWatch, type PawnLike, poseOf, type ThingWithId } from '../../src/render/poses.ts';
import { IN, type ThingLike } from '../../src/render/section.ts';
import { EVERY, LIFE, type Puff, puffs, smokeSources, windAt } from '../../src/render/smoke.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { type FakeCanvas, fakeDocument } from '../../tools/arkusz-plotno.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

let cached: World | null = null;
function przymorze(): World {
  if (!cached) {
    const a = ADDRESSES[0];
    cached = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 });
  }
  return cached;
}

const pawn = (o: Partial<PawnLike> = {}): PawnLike => ({
  id: 1,
  kind: 'core',
  x: 10.5,
  y: 20.5,
  dir: 0,
  walk: 0,
  pi: 0,
  path: [],
  carry: 0,
  job: null,
  ...o,
});
const job = (t: string, phase = 1, target = -1) => ({ t, phase, target });

describe('dym', () => {
  it('koza z ogniem dymi za oknem, na zewnątrz budynku; zimna nie, ognisko tak', () => {
    const w = przymorze();
    const koza = w.interior.furniture.find((f) => f.kind === 'koza')!;
    const lit: ThingLike[] = [{ ...koza, fuel: 100 }];
    const [s] = smokeSources(lit, w);
    expect(s.kind).toBe('koza');
    expect(w.interior.cell[Math.floor(s.y) * w.size + Math.floor(s.x)]).toBe(IN.NONE);
    expect(Math.hypot(s.x - koza.x - 0.5, s.y - koza.y - 0.5)).toBeLessThan(2.6);
    expect(smokeSources([{ ...koza, fuel: 0 }], w)).toEqual([]);
    const fire = smokeSources([{ kind: 'ognisko', x: 4, y: 5, w: 1, h: 1, rot: 0, fuel: 3 }], w);
    expect(fire).toMatchObject([{ kind: 'ognisko', x: 4.5, y: 5.6, glow: 1 }]);
  });

  it('kłęby z czasu gry: te same dla tej samej chwili, starsze wyżej i większe, gasną po zgaszeniu', () => {
    const s = smokeSources([{ kind: 'ognisko', x: 4, y: 5, w: 1, h: 1, rot: 0, fuel: 3 }], przymorze())[0];
    const a = puffs(s, 123.4, []);
    expect(puffs(s, 123.4, [])).toEqual(a);
    expect(a.length).toBeGreaterThan(10);
    expect(a.length).toBeLessThanOrEqual(Math.ceil(LIFE.ognisko / EVERY) + 2);
    // najstarszy kłąb (najmniejszy numer) wyżej i większy niż najmłodszy
    const old = a.reduce((p, q) => (q.i < p.i ? q : p));
    const young = a.reduce((p, q) => (q.i > p.i ? q : p));
    expect(old.y).toBeLessThan(young.y);
    expect(old.r).toBeGreaterThan(young.r);
    for (const p of a) {
      expect(p.a).toBeGreaterThanOrEqual(0);
      expect(p.a).toBeLessThanOrEqual(1);
    }
    // nocą przy wylocie ciepło od ognia, wyżej nie
    expect(young.warm).toBeGreaterThan(0.5);
    expect(old.warm).toBe(0);
    // po zgaszeniu nie rodzą się nowe, stare dolatują i znikają
    const off = 123.4;
    const later: Puff[] = puffs(s, off + 1, [], off);
    expect(later.every((p) => p.i <= Math.floor(off / EVERY))).toBe(true);
    expect(puffs(s, off + LIFE.ognisko + 1, [], off)).toEqual([]);
  });

  it('wiatr słaby i z czasu gry', () => {
    for (const t of [0, 10, 100, 1000]) {
      const [x, y] = windAt(t);
      expect(Math.hypot(x, y)).toBeLessThan(0.8);
      expect(windAt(t)).toEqual([x, y]);
    }
  });
});

describe('pozy pracy', () => {
  it('praca na miejscu daje pozę, w drodze chód, drewno w rękach naręcze', () => {
    expect(poseOf(pawn({ job: job('chop') }), 1, []).pose).toBe('chop');
    expect(poseOf(pawn({ job: job('burn') }), 1, []).pose).toBe('chop');
    expect(poseOf(pawn({ job: job('chop', 0), path: [1, 2], pi: 0 }), 1, []).pose).toBe('walk');
    expect(poseOf(pawn({ job: job('haul', 1), carry: 3, path: [1, 2] }), 1, []).pose).toBe('carry');
    expect(poseOf(pawn({ job: job('warm') }), 1, [])).toMatchObject({ pose: 'crouch', frame: 0 });
    expect(poseOf(pawn({ job: job('cook') }), 1, []).pose).toBe('cook');
    expect(poseOf(pawn({ job: job('warta') }), 1, []).pose).toBe('guard');
    expect(poseOf(pawn(), 1, []).pose).toBe('walk');
    // dokładanie do kozy: klęczy z polanem
    expect([1, 2]).toContain(poseOf(pawn(), 1, [], true).frame);
    expect(poseOf(pawn(), 1, [], true).pose).toBe('crouch');
  });

  it('klatki rąbania z czasu gry: zamach, cios, uderzenie po kolei', () => {
    const frames = new Set<number>();
    for (let t = 0; t < 1; t += 0.05) frames.add(poseOf(pawn({ job: job('chop') }), t, []).frame);
    expect([...frames].sort()).toEqual([0, 1, 2]);
  });

  it('przy stole siedzi na krześle: przodem po krześle, plecami przed nim (oparcie zasłania)', () => {
    const chair: ThingWithId = { id: 5, kind: 'krzeslo', x: 10, y: 20, w: 1, h: 1, rot: 0 };
    const south = poseOf(pawn({ dir: 0, job: job('eat', 1, 9) }), 1, [chair]);
    expect(south).toMatchObject({ pose: 'sit', z: 21.01 });
    const north = poseOf(pawn({ dir: 1, job: job('eat', 1, 9) }), 1, [chair]);
    expect(north.z).toBeCloseTo(20.99);
    // bez krzesła stoi
    expect(poseOf(pawn({ job: job('eat') }), 1, []).pose).toBe('walk');
  });

  it('śpi w łóżku głową na poduszce przy ścianie, bez łóżka na podłodze', () => {
    for (const rot of [0, 1, 2, 3]) {
      const [w, h] = rot & 1 ? [2, 1] : [1, 2];
      const bed: ThingWithId = { id: 7, kind: 'lozko', x: 30, y: 40, w, h, rot };
      const head = bedHead(bed);
      expect(head.o).toBe(rot);
      // poduszka w obrysie łóżka, przy ścianie rot (pół łóżka od niej), podniesiona o materac
      expect(head.x).toBeGreaterThan(30 * 32);
      expect(head.x).toBeLessThan((30 + w) * 32);
      expect(head.y).toBeGreaterThan(40 * 32 - 9);
      expect(head.y).toBeLessThan((40 + h) * 32);
      const near = [
        head.y < 40 * 32 + 16,
        head.x > (30 + w) * 32 - 16,
        head.y > (40 + h) * 32 - 16 - 9,
        head.x < 30 * 32 + 16,
      ][rot];
      expect(near).toBe(true);
      const p = poseOf(pawn({ x: 30.5, y: 40.5, job: job('sleep', 1, 7) }), 1, [bed]);
      expect(p.lie).toMatchObject({ kind: 'bed', o: rot });
      expect(p.z).toBeCloseTo(40 + h + 0.02);
    }
    const sofa = bedHead({ kind: 'wersalka', x: 0, y: 0, w: 2, h: 1, rot: 0 });
    expect(sofa.o).toBe(3);
    expect(poseOf(pawn({ job: job('sleep', 1, 99) }), 1, []).lie?.kind).toBe('floor');
  });

  it('dokładanie do kozy widać przez chwilę po wrzuceniu drewna, w miejscu', () => {
    const fw = new FeedWatch();
    const p = pawn({ job: job('refuel'), carry: 2 });
    expect(fw.feeding(p, 100)).toBe(false);
    p.carry = 0;
    p.job = null;
    expect(fw.feeding(p, 101)).toBe(true);
    expect(fw.feeding(p, 100 + FEED_TICKS)).toBe(true);
    expect(fw.feeding(p, 102 + FEED_TICKS)).toBe(false);
    // po odejściu koniec
    const q = pawn({ id: 2, job: job('refuel'), carry: 1 });
    fw.feeding(q, 10);
    q.carry = 0;
    expect(fw.feeding(q, 11)).toBe(true);
    q.x += 1;
    expect(fw.feeding(q, 12)).toBe(false);
    // drewno odłożone na skład (haul) to nie dokładanie do kozy
    const r = pawn({ id: 3, job: job('haul'), carry: 3 });
    fw.feeding(r, 10);
    r.carry = 0;
    expect(fw.feeding(r, 11)).toBe(false);
  });

  it('wartownik z lampą świeci w nocy', () => {
    const ls = gameLights(
      { st: { things: [], felled: [], tick: 0, pawns: [pawn({ job: job('warta') }), pawn({ id: 2 })] }, light: [] },
      [],
    );
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ r: 3 });
  });
});

describe('atlas ludzi z pozami', () => {
  it('klatki póz i leżenia mieszczą się w atlasie i się nie nakładają', () => {
    const seen = new Set<string>();
    for (let look = 0; look < LOOKS; look++) {
      for (const pose of POSES)
        for (let dir = 0; dir < 4; dir++)
          for (let f = 0; f < POSE_FRAMES[pose]; f++) {
            const [x, y, w, h] = frameRect(look, pose, dir, f);
            expect([w, h]).toEqual([FW, FH]);
            expect(x + w <= ATLAS_W && y + h <= ATLAS_H).toBe(true);
            expect(seen.has(`${x},${y}`)).toBe(false);
            seen.add(`${x},${y}`);
          }
      for (const kind of ['bed', 'floor'] as const)
        for (let o = 0; o < 4; o++) {
          const [x, y, w, h] = lieRect(look, kind, o);
          expect([w, h]).toEqual([LIE, LIE]);
          expect(x + w <= ATLAS_W && y + h <= ATLAS_H).toBe(true);
          expect(seen.has(`${x},${y}`)).toBe(false);
          seen.add(`${x},${y}`);
        }
    }
    // chód tam, gdzie był: kierunek × 4 klatki od lewej
    expect(frameRect(3, 'walk', 2, 1)).toEqual([(2 * 4 + 1) * FW, 3 * FH, FW, FH]);
  });

  it('każda klatka pozy ma postać (nieprzezroczyste piksele), atlas rysuje się w Node', () => {
    fakeDocument();
    const c = makePeopleAtlas() as unknown as FakeCanvas;
    expect([c.width, c.height]).toEqual([ATLAS_W, ATLAS_H]);
    const opaque = (x0: number, y0: number, w: number, h: number) => {
      let n = 0;
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) if (c.data[(y * c.width + x) * 4 + 3] === 255) n++;
      return n;
    };
    for (const pose of POSES)
      for (let dir = 0; dir < 4; dir++)
        for (let f = 0; f < POSE_FRAMES[pose]; f++) expect(opaque(...frameRect(5, pose, dir, f))).toBeGreaterThan(150);
    for (const kind of ['bed', 'floor'] as const)
      for (let o = 0; o < 4; o++) expect(opaque(...lieRect(5, kind, o))).toBeGreaterThan(100);
  });
});
