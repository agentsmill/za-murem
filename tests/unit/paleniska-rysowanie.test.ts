/* Rysowanie nowych palenisk (koza z beczki, kocioł węzła): palące się mają to samo co koza zarządu, czyli klatki ognia
   w rysunku (specOf z fire, thingSprite), dym z rury za ścianą (smokeSources) i światło nocą we wnętrzu (gameLights).
   Zimne wyglądają jak dawniej i niczego nie dymią ani nie świecą. */

import { describe, expect, it } from 'vitest';
import { M } from '../../src/render/art/bryly.ts';
import { FIRE_FRAMES, type Rot, type ThingSpec, thingSprite } from '../../src/render/art/rzeczy.ts';
import { gameLights } from '../../src/render/game.ts';
import { burning, IN, specOf, type ThingLike } from '../../src/render/section.ts';
import { smokeSources } from '../../src/render/smoke.ts';
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

const t = (o: Partial<ThingLike>): ThingLike => ({ kind: 'koza_beczka', x: 10, y: 7, w: 1, h: 1, rot: 0, ...o });
const px = (spec: ThingSpec) => thingSprite(spec).px;
const samePx = (a: Uint32Array | number[], b: Uint32Array | number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('nowe paleniska: opis sprite’a', () => {
  it('koza z beczki i kocioł z ogniem się palą (klatka ognia), bez ognia nie', () => {
    for (const kind of ['koza_beczka', 'kociol'] as const) {
      expect(burning(t({ kind, fuel: 5 }))).toBe(true);
      expect(burning(t({ kind, fuel: 0 }))).toBe(false);
      expect(burning(t({ kind }))).toBe(false);
      for (let f = 0; f < FIRE_FRAMES; f++)
        expect(specOf(t({ kind, w: kind === 'kociol' ? 2 : 1, rot: 2, fuel: 300 }), f)).toMatchObject({
          kind,
          rot: 2,
          fire: f,
        });
      expect(specOf(t({ kind, fuel: 0 }), 1)).not.toHaveProperty('fire');
    }
  });

  it('klatka ognia zawija się po FIRE_FRAMES, jak u kozy zarządu', () => {
    expect(specOf(t({ fuel: 9 }), FIRE_FRAMES + 1)).toMatchObject({ fire: 1 });
  });

  it('inne budowle i tak się nie palą, nawet z fuel w rzeczy', () => {
    for (const kind of ['warsztat', 'pracownia', 'szklarnia', 'wieza', 'magazyn'])
      expect(burning(t({ kind, fuel: 5 }))).toBe(false);
  });
});

describe('nowe paleniska: rysunek ognia', () => {
  for (const kind of ['koza_beczka', 'kociol'] as const)
    for (const rot of [0, 1, 2, 3] as Rot[])
      it(`${kind} rot ${rot}: ogień zmienia piksele, klatki się różnią, rozmiar i kotwica bez zmian`, () => {
        const zimna = thingSprite({ kind, rot, seed: 3 });
        const klatki = Array.from({ length: FIRE_FRAMES }, (_, f) => thingSprite({ kind, rot, seed: 3, fire: f }));
        for (const k of klatki) {
          expect([k.w, k.h, k.ax, k.ay]).toEqual([zimna.w, zimna.h, zimna.ax, zimna.ay]);
          expect(samePx(k.px, zimna.px)).toBe(false);
        }
        // klatki nie są takie same (ogień faluje); powtórzenie tej samej klatki daje te same piksele
        expect(new Set(klatki.map((k) => Array.from(k.px).join())).size).toBeGreaterThan(1);
        expect(samePx(px({ kind, rot, seed: 3, fire: 1 }), klatki[1].px)).toBe(true);
      });

  it('palące się mają świecące piksele ognia (kolory płomienia), zimne ani jednego', () => {
    // piksele sprite'a to ABGR: kolory płomienia M.fire0..2 z kanałami w odwrotnej kolejności
    const abgr = (c: number) => ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16);
    const plomien = new Set([M.fire0, M.fire1, M.fire2].map(abgr));
    const ogien = (px: Uint32Array) => {
      let n = 0;
      for (const v of px) if (v >>> 24 === 255 && plomien.has(v & 0xffffff)) n++;
      return n;
    };
    for (const kind of ['koza_beczka', 'kociol'] as const) {
      expect(ogien(thingSprite({ kind, rot: 0, seed: 3, fire: 0 }).px)).toBeGreaterThan(3);
      expect(ogien(thingSprite({ kind, rot: 0, seed: 3 }).px)).toBe(0);
    }
  });
});

describe('nowe paleniska: dym', () => {
  const w = przymorze();
  const koza = w.interior.furniture.find((f) => f.kind === 'koza')!;
  const poza = (x: number, y: number) => w.interior.cell[Math.floor(y) * w.size + Math.floor(x)] === IN.NONE;

  it('koza z beczki z ogniem dymi za oknem jak koza zarządu, zimna nie', () => {
    const beczka = t({ x: koza.x, y: koza.y, rot: koza.rot, fuel: 100 });
    const [s] = smokeSources([beczka], w);
    const [k] = smokeSources([{ ...koza, fuel: 100 }], w);
    expect(s).toMatchObject({ kind: 'koza', glow: k.glow });
    // wylot w tym samym miejscu co u kozy stojącej w tym samym miejscu, tylko wyżej (rura pod sufit)
    expect([s.x, s.y]).toEqual([k.x, k.y]);
    expect(s.z).toBeGreaterThan(k.z);
    expect(poza(s.x, s.y)).toBe(true);
    expect(s.key).toBe(`koza_beczka:${koza.x}:${koza.y}`);
    expect(smokeSources([{ ...beczka, fuel: 0 }], w)).toEqual([]);
  });

  it('kocioł z ogniem dymi z komina za ścianą, zimny nie; klucz inny niż u kozy', () => {
    const poziomo = koza.rot === 0 || koza.rot === 2;
    const kociol = t({
      kind: 'kociol',
      x: koza.x,
      y: koza.y,
      w: poziomo ? 2 : 1,
      h: poziomo ? 1 : 2,
      rot: koza.rot,
      fuel: 100,
    });
    const src = smokeSources([kociol], w);
    expect(src).toHaveLength(1);
    expect(src[0]).toMatchObject({ kind: 'koza', key: `kociol:${koza.x}:${koza.y}` });
    expect(poza(src[0].x, src[0].y)).toBe(true);
    expect(smokeSources([{ ...kociol, fuel: 0 }], w)).toEqual([]);
  });

  it('bez okna dym idzie półtora metra za ścianą od środka paleniska (dla 1×1 jak u kozy), kocioł od środka podstawy', () => {
    const pusty = { size: 64, interior: { windows: [] } } as unknown as Pick<World, 'size' | 'interior'>;
    const [a] = smokeSources([t({ x: 20, y: 30, rot: 0, fuel: 1 })], pusty);
    const [b] = smokeSources([{ ...t({ kind: 'koza', x: 20, y: 30, rot: 0, fuel: 1 }) }], pusty);
    expect([a.x, a.y]).toEqual([b.x, b.y]);
    expect([a.x, a.y]).toEqual([20.5, 29]);
    // kocioł 2×1 przy ścianie na północy: środek podstawy (x 21, y 30,5) i półtora kafelka (połowa głębokości i metr) za ścianę
    const [c] = smokeSources([t({ kind: 'kociol', x: 20, y: 30, w: 2, h: 1, rot: 0, fuel: 1 })], pusty);
    expect([c.x, c.y]).toEqual([21, 29]);
    // przy ścianie na wschodzie podstawa 1×2: idzie na wschód od jej środka
    const [d] = smokeSources([t({ kind: 'kociol', x: 20, y: 30, w: 1, h: 2, rot: 1, fuel: 1 })], pusty);
    expect([d.x, d.y]).toEqual([22, 31]);
  });
});

describe('nowe paleniska: światło nocą', () => {
  const lights = (things: ThingLike[]) => gameLights({ st: { things, felled: [], tick: 0 }, light: [] }, []);

  it('koza z beczki z ogniem świeci we wnętrzu jak koza zarządu, kocioł ze środka podstawy', () => {
    const [kozaLight] = lights([t({ kind: 'koza', x: 4, y: 5, fuel: 50 })]);
    const [b] = lights([t({ x: 4, y: 5, fuel: 50 })]);
    expect(b).toEqual(kozaLight);
    expect(b).toMatchObject({ x: 4.5, y: 5.5, inside: true });
    const [k] = lights([t({ kind: 'kociol', x: 8, y: 5, w: 2, h: 1, fuel: 50 })]);
    expect(k).toMatchObject({ x: 9, y: 5.5, r: b.r, inside: true });
  });

  it('zimne paleniska nie świecą', () => {
    expect(lights([t({ x: 4, y: 5, fuel: 0 }), t({ kind: 'kociol', x: 8, y: 5, w: 2, fuel: 0 })])).toEqual([]);
  });
});
