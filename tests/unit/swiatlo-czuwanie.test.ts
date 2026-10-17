import { describe, expect, it } from 'vitest';
import { gameLights } from '../../src/render/game.ts';
import { LightLayer } from '../../src/render/lightLayer.ts';
import { FeedWatch, KOZA_POST, type PawnLike, poseOf, type ThingWithId } from '../../src/render/poses.ts';
import { KOZA_POST as SIM_KOZA_POST } from '../../src/sim/sim.ts';

const pawn = (o: Partial<PawnLike> = {}): PawnLike => ({
  id: 3,
  kind: 'core',
  x: 10.5,
  y: 20.5,
  dir: 1,
  walk: 0,
  pi: 0,
  path: [],
  carry: 0,
  job: null,
  ...o,
});
const guard = (target: number, phase = 1) => ({ t: 'guard', phase, target });

describe('czuwanie przy kozie', () => {
  it('posterunek przy kozie jak w symulacji', () => {
    expect(KOZA_POST).toBe(SIM_KOZA_POST);
  });

  it('przy kozie klęczy przy ogniu albo stoi, bez latarni; przy bramie z latarnią', () => {
    const poses = new Set<string>();
    for (let t = 0; t < 40; t += 0.5) poses.add(poseOf(pawn({ job: guard(KOZA_POST) }), t, []).pose);
    expect([...poses].sort()).toEqual(['crouch', 'walk']);
    expect(poseOf(pawn({ job: guard(0) }), 1, []).pose).toBe('guard');
    expect(poseOf(pawn({ job: guard(7) }), 1, []).pose).toBe('guard');
    // na krześle siedzi
    const chair: ThingWithId = { id: 2, kind: 'krzeslo', x: 10, y: 20, w: 1, h: 1, rot: 0 };
    expect(poseOf(pawn({ job: guard(KOZA_POST) }), 1, [chair]).pose).toBe('sit');
  });

  it('latarnia świeci przy bramie i dziurze, przy kozie nie (tam świeci ogień)', () => {
    const lights = (target: number) =>
      gameLights({ st: { things: [], felled: [], tick: 0, pawns: [pawn({ job: guard(target) })] }, light: [] }, []);
    expect(lights(0)).toHaveLength(1);
    expect(lights(5)).toHaveLength(1);
    expect(lights(KOZA_POST)).toHaveLength(0);
  });

  it('dokładanie z dyżuru: drewno z rąk do kozy po drodze z drewnem (faza 3) widać przez chwilę', () => {
    const fw = new FeedWatch();
    const p = pawn({ job: guard(KOZA_POST, 3), carry: 2 });
    expect(fw.feeding(p, 50)).toBe(false);
    p.carry = 0;
    p.job = guard(KOZA_POST, 1);
    expect(fw.feeding(p, 51)).toBe(true);
  });
});

describe('mapa światła przy zmianie zoomu', () => {
  it('tekstury mapy są dynamiczne, więc sprite przelicza kształt po zmianie ramki', () => {
    const layer = new LightLayer();
    // najpierw z daleka (duży bufor), potem z bliska (mniejsza ramka w tym samym buforze)
    layer.update(0, 0, 40000, 25000, 0.08, 1, [], 0);
    layer.update(4000, 4000, 4850, 4530, 1.7, 1, [], 0);
    for (const sp of [layer.sprite, layer.glowSprite]) {
      expect(sp.texture.dynamic).toBe(true);
      expect(sp.texture.listenerCount('update')).toBeGreaterThan(0);
      expect(sp.texture.orig.width).toBe(sp.texture.frame.width);
    }
    // sprite pokrywa widok z bliska, a nie stary bufor z oddalenia
    expect(layer.sprite.width).toBeLessThan(1200);
    expect(layer.sprite.width).toBeGreaterThanOrEqual(850);
  });
});
