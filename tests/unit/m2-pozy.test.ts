import { describe, expect, it } from 'vitest';
import { ATLAS_H, ATLAS_W, frameRect, LOOKS, lieRect, POSE_FRAMES, POSES } from '../../src/render/art/people.ts';
import { type PawnLike, type PoseCtx, poseOf, type ThingWithId } from '../../src/render/poses.ts';

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
const job = (t: string, phase: number, target = -1, n = 0, what = '') => ({ t, phase, target, n, what });
const pose = (p: Partial<PawnLike>, things: ThingWithId[] = [], ctx: PoseCtx = {}) =>
  poseOf(pawn(p), 3.2, things, false, ctx);

describe('pozy prac M2', () => {
  it('przeszukiwanie na kolanach, rozbiórka siekierą, śmieci przebierane na kolanach, zajmowanie młotkiem', () => {
    const smieci: ThingWithId = { id: 7, kind: 'smieci', x: 10, y: 20, w: 1, h: 1, rot: 0, n: 2 };
    const stol: ThingWithId = { id: 8, kind: 'stol', x: 10, y: 21, w: 2, h: 1, rot: 0 };
    expect(pose({ job: job('search', 1, 3) }).pose).toBe('search');
    expect(pose({ job: job('dismantle', 1, 7) }, [smieci, stol]).pose).toBe('search');
    expect(pose({ job: job('dismantle', 1, 8) }, [smieci, stol]).pose).toBe('chop');
    expect(pose({ job: job('claim', 1, 2) }).pose).toBe('hammer');
    // w drodze do pracy zwykły chód
    expect(pose({ job: job('search', 0, 3), path: [1, 2], pi: 0 }).pose).toBe('walk');
  });

  it('naprawa i budowa w fazie pracy: młotek, przy podłodze, rurze i grządkach na kolanach', () => {
    const ctx: PoseCtx = {
      damage: [{ kind: 'okno' }, { kind: 'rura' }, { kind: 'podloga' }, { kind: 'piec' }],
      builds: [
        { id: 40, kind: 'warsztat' },
        { id: 41, kind: 'ogrodek' },
      ],
    };
    expect(pose({ job: job('repair', 2, 0) }, [], ctx).pose).toBe('hammer');
    expect(pose({ job: job('repair', 2, 1) }, [], ctx).pose).toBe('search');
    expect(pose({ job: job('repair', 2, 2) }, [], ctx).pose).toBe('search');
    expect(pose({ job: job('repair', 2, 3) }, [], ctx).pose).toBe('hammer');
    expect(pose({ job: job('build', 2, 40) }, [], ctx).pose).toBe('hammer');
    expect(pose({ job: job('build', 2, 41) }, [], ctx).pose).toBe('search');
    // łatanie siatki młotkiem, ognisko (campfire, a w M1 build bez planu) rozpalane na kolanach
    expect(pose({ job: job('patch', 2, 5) }).pose).toBe('hammer');
    expect(pose({ job: job('campfire', 2, 900) }).pose).toBe('crouch');
    expect(pose({ job: job('build', 2, 900) }, [], ctx).pose).toBe('crouch');
  });

  it('deski albo złom w rękach: niesienie materiału w chodzie i na postoju', () => {
    const walking = { path: [1, 2, 3], pi: 0, walk: 1 };
    expect(pose({ ...walking, job: job('repair', 1, 0, 2, 'deski') }).pose).toBe('planks');
    expect(pose({ ...walking, job: job('build', 1, 40, 2, 'zlom') }).pose).toBe('scrap');
    expect(pose({ ...walking, job: job('repair', 1, 0, 1, 'czesci') }).pose).toBe('scrap');
    // łata z M1: sztuki bez nazwy materiału to deski
    expect(pose({ ...walking, job: { t: 'patch', phase: 1, target: 5, n: 3 } }).pose).toBe('planks');
    expect(pose({ job: job('repair', 1, 0, 2, 'deski') }).pose).toBe('planks');
    // w drodze po następną stertę z deskami już w rękach (faza 0); przy pracy (faza 2) bez niesienia
    expect(pose({ ...walking, job: job('build', 0, 40, 2, 'deski') }).pose).toBe('planks');
    expect(pose({ job: job('build', 2, 40, 2, 'deski') }, [], { builds: [{ id: 40, kind: 'warsztat' }] }).pose).toBe(
      'hammer',
    );
    // bez materiału w rękach zwykły chód; drewno dalej naręczem
    expect(pose({ ...walking, job: job('build', 1, 40, 0, '') }).pose).toBe('walk');
    expect(pose({ ...walking, carry: 4, job: job('haul', 1, 3) }).pose).toBe('carry');
  });

  it('przyjęty (praca arrive) idzie jak każdy mieszkaniec, za bramą czeka stojąc', () => {
    const arrive = { t: 'arrive', phase: 0, target: 3, n: 0, what: '' };
    const walking = pose({ kind: 'resident', job: arrive, path: [1, 2, 3], pi: 0, walk: 1 });
    expect(walking).toEqual(pose({ kind: 'resident', job: null, path: [1, 2, 3], pi: 0, walk: 1 }));
    expect(walking.pose).toBe('walk');
    expect(pose({ kind: 'resident', job: arrive })).toEqual({ pose: 'walk', dir: 0, frame: 0 });
  });

  it('wartownik, który przysnął, siedzi z opuszczoną głową', () => {
    expect(pose({ job: job('guard', 4, 0) }).pose).toBe('doze');
    expect(pose({ job: job('guard', 1, 0) }).pose).toBe('guard');
  });

  it('łóżka piętrowe: sam na górze, we dwoje drugi na dole pod górnym', () => {
    const bunk: ThingWithId = { id: 50, kind: 'lozka_pietrowe', x: 10, y: 20, w: 1, h: 2, rot: 0 };
    const sleep = job('sleep', 1, 50);
    // sam śpi na górze, także na kafelku od nóg
    const alone = pose({ x: 10.5, y: 21.5, job: sleep }, [bunk]);
    expect(alone.lie?.kind).toBe('bed');
    expect(alone.z).toBeGreaterThan(bunk.y + bunk.h);
    // we dwoje: od strony głowy na górze, od nóg na dole, pod górnym (przed sprite'em łóżka)
    const full: PoseCtx = { bunkFull: new Set([50]) };
    const top = pose({ x: 10.5, y: 20.5, job: sleep }, [bunk], full);
    const low = pose({ x: 10.5, y: 21.5, job: sleep }, [bunk], full);
    expect(top.z).toBeGreaterThan(bunk.y + bunk.h);
    expect(low.z).toBeLessThan(bunk.y + bunk.h);
    // górny materac wyżej o 16 px, głowa w tym samym miejscu poziomo
    expect(low.lie!.y - top.lie!.y).toBe(16);
    expect(low.lie!.x).toBe(top.lie!.x);
    expect(alone.lie!.y).toBe(top.lie!.y);
  });
});

describe('atlas ludzi w dwóch wierszach na wygląd', () => {
  it('klatki i leżenie się nie nakładają, atlas mieści się w teksturze 4096 px', () => {
    expect(ATLAS_W).toBeLessThanOrEqual(4096);
    expect(ATLAS_H).toBeLessThanOrEqual(4096);
    for (let look = 0; look < LOOKS; look++) {
      const rects: [number, number, number, number][] = [];
      for (const p of POSES)
        for (let d = 0; d < 4; d++) for (let f = 0; f < POSE_FRAMES[p]; f++) rects.push(frameRect(look, p, d, f));
      for (const kind of ['bed', 'floor'] as const) for (let o = 0; o < 4; o++) rects.push(lieRect(look, kind, o));
      for (let a = 0; a < rects.length; a++)
        for (let b = a + 1; b < rects.length; b++) {
          const [x0, y0, w0, h0] = rects[a];
          const [x1, y1, w1, h1] = rects[b];
          expect(x0 < x1 + w1 && x1 < x0 + w0 && y0 < y1 + h1 && y1 < y0 + h0).toBe(false);
        }
    }
  });
});
