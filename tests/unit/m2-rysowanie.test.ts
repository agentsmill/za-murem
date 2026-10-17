import { describe, expect, it } from 'vitest';
import { BUILD_BASE, BUILD_KINDS, footprint, type ThingSpec, thingSprite } from '../../src/render/art/rzeczy.ts';
import { buildScene } from '../../src/render/art/scene.ts';
import { wearColor } from '../../src/render/art/szkody.ts';
import { NB } from '../../src/render/art/wnetrze.ts';
import { mockWear } from '../../src/render/atrapy.ts';
import { buildFootprint, planProgress } from '../../src/render/buildLayer.ts';
import { applyScenePatch, chunksTouched, scenePatchOf } from '../../src/render/chunks.ts';
import { GAME_KINDS, HEAPS } from '../../src/render/game.ts';
import {
  describeTile,
  IN,
  sectionOf,
  setWear,
  specOf,
  type ThingLike,
  type WorldWear,
} from '../../src/render/section.ts';
import { BUILDS } from '../../src/sim/budowle.ts';
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

describe('budowle M2 jako rzeczy', () => {
  it('rozmiar jak w kontrakcie symulacji, obrót zamienia boki', () => {
    for (const kind of BUILD_KINDS) {
      expect(BUILD_BASE[kind]).toEqual([BUILDS[kind].w, BUILDS[kind].h]);
      expect(footprint({ kind, rot: 0 } as ThingSpec)).toEqual({ w: BUILDS[kind].w, h: BUILDS[kind].h });
      expect(footprint({ kind, rot: 1 } as ThingSpec)).toEqual({ w: BUILDS[kind].h, h: BUILDS[kind].w });
      expect(buildFootprint(kind, 3)).toEqual({ w: BUILDS[kind].h, h: BUILDS[kind].w });
      expect(GAME_KINDS.has(kind)).toBe(true);
    }
  });

  it('gotowa budowla, śmieci i zepsuty mebel ze stanu gry mają opis sprite’a', () => {
    const t = (o: Partial<ThingLike>): ThingLike => ({ kind: 'x', x: 10, y: 7, w: 1, h: 1, rot: 0, ...o });
    expect(specOf(t({ kind: 'warsztat', w: 2, rot: 2 }))).toMatchObject({ kind: 'warsztat', rot: 2 });
    // śmieci: n to wielkość sterty z kontraktu (1–3), nie liczba sztuk
    for (const [n, size] of [
      [undefined, 1],
      [1, 1],
      [2, 2],
      [3, 3],
      [7, 3],
    ] as const)
      expect(specOf(t({ kind: 'smieci', n }))).toMatchObject({ kind: 'smieci', size });
    expect(specOf(t({ kind: 'stol', w: 2, broken: true }))).toMatchObject({ kind: 'stol', broken: true });
    expect(specOf(t({ kind: 'stol', w: 2 }))).not.toHaveProperty('broken', true);
    expect(HEAPS.has('smieci')).toBe(true);
    // zepsuty mebel: ten sam rozmiar i kotwica, inne piksele
    const ok = thingSprite({ kind: 'stol', rot: 0, seed: 3 });
    const bad = thingSprite({ kind: 'stol', rot: 0, seed: 3, broken: true });
    expect([bad.w, bad.h, bad.ax, bad.ay]).toEqual([ok.w, ok.h, ok.ax, ok.ay]);
    expect(bad.px).not.toEqual(ok.px);
  });

  it('okopcona kuchenka: ten sam rozmiar i kotwica, dużo ciemniejsza', () => {
    expect(specOf({ kind: 'kuchenka', x: 3, y: 4, w: 1, h: 1, rot: 1, burnt: true })).toMatchObject({ burnt: true });
    const light = (px: Uint32Array) => {
      let sum = 0;
      let n = 0;
      for (const v of px)
        if (v >>> 24 === 255) {
          sum += (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff);
          n++;
        }
      return sum / n;
    };
    const ok = thingSprite({ kind: 'kuchenka', rot: 1, seed: 5 });
    const burnt = thingSprite({ kind: 'kuchenka', rot: 1, seed: 5, burnt: true });
    expect([burnt.w, burnt.h, burnt.ax, burnt.ay]).toEqual([ok.w, ok.h, ok.ax, ok.ay]);
    expect(light(burnt.px)).toBeLessThan(light(ok.px) * 0.5);
  });
});

describe('plany budowy', () => {
  it('postęp z materiałów i pracy', () => {
    const work = BUILDS.warsztat.work;
    expect(
      planProgress({
        id: 1,
        kind: 'warsztat',
        x: 0,
        y: 0,
        rot: 0,
        need: { deski: 4, zlom: 2 },
        have: { deski: 3 },
        work: work / 2,
      }),
    ).toEqual({
      mats: 0.5,
      work: 0.5,
    });
    expect(planProgress({ id: 2, kind: 'zasieki', x: 0, y: 0, rot: 0 })).toEqual({ mats: 1, work: 0 });
  });
});

describe('puste mieszkania w przekroju', () => {
  it('atrapa: zarząd, zamieszkane i puste z każdą przyczyną, uszkodzenia według przyczyny', () => {
    const w = przymorze();
    const m = mockWear(w);
    expect(mockWear(w)).toEqual(m);
    expect(m.apts.filter((a) => a.state === 'zarzad')).toHaveLength(1);
    const whys = new Set(m.apts.filter((a) => a.state === 'puste').map((a) => a.why));
    expect(whys.size).toBe(5);
    const kinds = new Set(m.damage.map((d) => d.kind));
    for (const k of ['okno', 'drzwi', 'rura', 'podloga', 'piec']) expect(kinds.has(k as 'okno')).toBe(true);
    for (const d of m.damage) {
      const c = w.interior.cell[d.tile];
      if (d.kind === 'okno') expect(w.interior.windows).toContain(d.tile);
      else if (d.kind === 'drzwi') expect(c).toBe(IN.DOOR);
      else expect(c).toBe(IN.FLOOR);
    }
    // piec jak w świecie: na kafelku kuchenki
    const size = w.size;
    for (const d of m.damage.filter((x) => x.kind === 'piec'))
      expect(w.interior.furniture.some((f) => f.kind === 'kuchenka' && f.y * size + f.x === d.tile)).toBe(true);
    expect(m.trash.length).toBeGreaterThan(0);
    for (const t of m.trash) expect(t.n).toBeGreaterThanOrEqual(1);
    for (const t of m.trash) expect(t.n).toBeLessThanOrEqual(3);
    expect(m.broken.size).toBeGreaterThan(0);
  });

  it('ślady i uszkodzenia zmieniają kolor posadzki, ten sam piksel za każdym razem', () => {
    const floor = { kind: 'floor', room: 'kuchnia' } as const;
    const c = 0x9a8f7a;
    for (const dmg of ['podloga', 'rura', 'piec'] as const) {
      const a = wearColor(c, floor, undefined, dmg, 100, 100, 15, 15, 1);
      expect(a).not.toBe(c);
      expect(wearColor(c, floor, undefined, dmg, 100, 100, 15, 15, 1)).toBe(a);
    }
    let changed = 0;
    for (let k = 0; k < 64; k++)
      if (wearColor(c, floor, 'pozar', undefined, k * 3, k * 5, k & 31, (k * 7) & 31, 1) !== c) changed++;
    expect(changed).toBeGreaterThan(20);
    // ściany bez nakładki
    expect(wearColor(c, { kind: 'wall', mask: 0 }, 'pozar', undefined, 1, 1, 1, 1, 1)).toBe(c);
  });

  it('uszkodzona podłoga według przyczyny: kałuża, zwęglone deski, wyrwane deski', () => {
    const floor = { kind: 'floor', room: 'pokoj' } as const;
    const c = 0x9a8f7a;
    const looks = (['zalanie', 'pozar', 'wyjazd'] as const).map((why) =>
      wearColor(c, floor, why, 'podloga', 100, 100, 15, 15, 1),
    );
    expect(new Set(looks).size).toBe(3);
    for (const l of looks) expect(l).not.toBe(c);
  });

  it('cieknąca rura stoi przy ścianie z maski kafelka', () => {
    const c = 0x9a8f7a;
    const north = wearColor(c, { kind: 'floor', room: 'lazienka', walls: NB.N }, undefined, 'rura', 0, 0, 15, 2, 1);
    const east = wearColor(c, { kind: 'floor', room: 'lazienka', walls: NB.E }, undefined, 'rura', 0, 0, 29, 15, 1);
    expect(north).not.toBe(c);
    expect(east).toBe(north);
    expect(wearColor(c, { kind: 'floor', room: 'lazienka', walls: NB.E }, undefined, 'rura', 0, 0, 15, 2, 1)).not.toBe(
      north,
    );
  });

  it('okopcony piec: obwódka sadzy na posadzce obok, od strony kuchenki', () => {
    const floor = { kind: 'floor', room: 'kuchnia' } as const;
    const c = 0x9a8f7a;
    // kuchenka na północ od kafelka (bit 1): ciemno przy górnej krawędzi, czysto przy dolnej
    expect(wearColor(c, floor, undefined, undefined, 50, 50, 15, 1, 1, 0, 1)).not.toBe(c);
    expect(wearColor(c, floor, undefined, undefined, 50, 50, 15, 30, 1, 0, 1)).toBe(c);
  });

  it('uszkodzenia ze świata (gdy je daje) trafiają w kafelki, które przekrój rysuje', () => {
    const w = przymorze() as World & WorldWear;
    const sec = sectionOf(w);
    const size = w.size;
    const mine = (w.damage ?? []).filter((d) => d.bid === sec.building);
    if (w.damage?.length) expect(mine.length).toBeGreaterThan(0);
    for (const d of mine) {
      const t = describeTile(sec, d.tile, size, 0x888888);
      if (d.kind === 'okno') expect(t).toMatchObject({ kind: 'window', broken: true });
      else if (d.kind === 'drzwi') expect(t).toMatchObject({ kind: 'door', broken: true });
      else expect(t?.kind).toBe('floor');
      if (d.kind === 'piec')
        expect(w.interior.furniture.some((f) => f.kind === 'kuchenka' && f.y * size + f.x === d.tile)).toBe(true);
    }
  });

  it('naprawa: łatka sceny zdejmuje uszkodzenie i przerysowuje jego kawałek', () => {
    const w = przymorze();
    const m = mockWear(w);
    const sc = buildScene(w);
    sc.section = sectionOf(w);
    setWear(sc.section, m.damage, m.apts);
    const tile = m.damage[0].tile;
    expect(sc.section.damage!.has(tile)).toBe(true);
    const ch = { fixed: [tile] };
    expect(chunksTouched(sc, ch).length).toBeGreaterThan(0);
    applyScenePatch(sc, scenePatchOf(sc, ch));
    expect(sc.section.damage!.has(tile)).toBe(false);
  });
});
