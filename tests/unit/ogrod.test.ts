import { describe, expect, it } from 'vitest';
import { footprint, type ThingSpec, thingSprite } from '../../src/render/art/rzeczy.ts';
import { GAME_KINDS } from '../../src/render/game.ts';
import { specOf, type ThingLike } from '../../src/render/section.ts';

const prop = (o: Partial<ThingLike>): ThingLike => ({ kind: 'x', x: 12, y: 30, w: 1, h: 1, rot: 0, ...o });

describe('ogród domu', () => {
  it('rzeczy ze świata mają opis sprite’a: ułożenie z w i h, sznur z praniem, gdy n > 0', () => {
    expect(specOf(prop({ kind: 'sznur', w: 3, h: 1 }))).toMatchObject({ kind: 'sznur', rot: 0 });
    expect(specOf(prop({ kind: 'sznur', w: 3, h: 1 }))).not.toHaveProperty('pranie', true);
    expect(specOf(prop({ kind: 'sznur', w: 1, h: 3, n: 5 }))).toMatchObject({ kind: 'sznur', rot: 1, pranie: true });
    expect(specOf(prop({ kind: 'hustawka', w: 1, h: 2 }))).toMatchObject({ kind: 'hustawka', rot: 1 });
    // ławka: strona oparcia z rot, ale zawsze zgodnie z obrysem
    expect(specOf(prop({ kind: 'lawka', w: 2, h: 1, rot: 2 }))).toMatchObject({ rot: 2 });
    expect(specOf(prop({ kind: 'lawka', w: 2, h: 1, rot: 1 }))).toMatchObject({ rot: 0 });
    expect(specOf(prop({ kind: 'lawka', w: 1, h: 2, rot: 3 }))).toMatchObject({ rot: 3 });
    expect(specOf(prop({ kind: 'lawka', w: 1, h: 2, rot: 0 }))).toMatchObject({ rot: 1 });
    expect(specOf(prop({ kind: 'buda', rot: 2 }))).toMatchObject({ kind: 'buda', rot: 2 });
    expect(specOf(prop({ kind: 'kompost' }))).toMatchObject({ kind: 'kompost' });
    for (const k of ['sznur', 'kompost', 'buda', 'hustawka', 'lawka']) expect(GAME_KINDS.has(k)).toBe(true);
  });

  it('obrys jak trzepak (sznur) i 2 × 1 (huśtawka, ławka), sprite na obrysie', () => {
    expect(footprint({ kind: 'sznur', rot: 0 })).toEqual(footprint({ kind: 'trzepak', rot: 0 }));
    expect(footprint({ kind: 'sznur', rot: 3 })).toEqual({ w: 1, h: 3 });
    expect(footprint({ kind: 'hustawka', rot: 1 })).toEqual({ w: 1, h: 2 });
    expect(footprint({ kind: 'lawka', rot: 2 })).toEqual({ w: 2, h: 1 });
    expect(footprint({ kind: 'buda', rot: 1 })).toEqual({ w: 1, h: 1 });
    for (const spec of [
      { kind: 'sznur', rot: 0 },
      { kind: 'kompost', rot: 0 },
      { kind: 'buda', rot: 0 },
      { kind: 'hustawka', rot: 0 },
      { kind: 'lawka', rot: 0 },
    ] as ThingSpec[]) {
      const sp = thingSprite(spec);
      // kotwica na środku dolnej krawędzi podstawy, sprite nie węższy niż obrys
      expect(sp.w).toBeGreaterThanOrEqual(footprint(spec).w * 32);
      expect(sp.ay).toBeLessThanOrEqual(sp.h);
    }
  });

  it('pranie zmienia piksele, nie rozmiar; bez prania puste linki', () => {
    const bare = thingSprite({ kind: 'sznur', rot: 0, seed: 2 });
    const wash = thingSprite({ kind: 'sznur', rot: 0, pranie: true, seed: 2 });
    expect([wash.w, wash.h, wash.ax, wash.ay]).toEqual([bare.w, bare.h, bare.ax, bare.ay]);
    const opaque = (px: Uint32Array) => px.filter((v) => v >>> 24 === 255).length;
    expect(opaque(wash.px)).toBeGreaterThan(opaque(bare.px) * 1.3);
  });
});
