/* Grafika walki i szwendaczy bez przeglądarki: pozy z pracy, nakładka broni, atlas szwendaczy, błysk strzału,
   stan wzmocnionej siatki, krew na ziemi. */

import { describe, expect, it } from 'vitest';
import { ARMED, CELL, handOf, makeWeaponAtlas, WEAPON_H, WEAPON_W, weaponRect } from '../../src/render/art/bron.ts';
import { ATLAS_W, makeZombieAtlas, ZATLAS_H, ZATLAS_W, zFrameRect, zLieRect } from '../../src/render/art/people.ts';
import { thingSprite } from '../../src/render/art/rzeczy.ts';
import { fenceCodes, fenceStateFn, gameLights } from '../../src/render/game.ts';
import { type PawnLike, poseOf } from '../../src/render/poses.ts';
import { specOf } from '../../src/render/section.ts';
import { WEAPONS } from '../../src/sim/bron.ts';
import { type FakeCanvas, fakeDocument } from '../../tools/arkusz-plotno.ts';
import { mockBlock } from './interior-mock.ts';

const pawn = (o: Partial<PawnLike> = {}): PawnLike => ({
  id: 1,
  kind: 'core',
  x: 10.5,
  y: 20.5,
  dir: 3,
  walk: 0,
  pi: 0,
  path: [],
  carry: 0,
  job: null,
  ...o,
});
const job = (t: string, phase = 1, target = -1) => ({ t, phase, target });
/** chwila gry w sekundach dla ticku */
const at = (tick: number) => tick / 20;

describe('pozy walki', () => {
  it('cios bronią wręcz: zamach przed ciosem, uderzenie tuż po nim, potem dokończenie', () => {
    const lom = WEAPONS.lom;
    // cios w ticku 100: cd = 100 + lom.cd
    const p = pawn({ weapon: 'lom', cd: 100 + lom.cd, job: job('fight') });
    expect(poseOf(p, at(101), [])).toMatchObject({ pose: 'swing', frame: 1, arm: 'swing' });
    expect(poseOf(p, at(106), [])).toMatchObject({ pose: 'swing', frame: 2 });
    expect(poseOf(p, at(100 + lom.cd - 2), [])).toMatchObject({ pose: 'swing', frame: 0 });
  });

  it('broń palna, kusza i dzida: celowanie, odrzut albo pchnięcie tuż po strzale', () => {
    for (const id of ['rewolwer', 'kusza', 'dzida'] as const) {
      const p = pawn({ weapon: id, cd: 100 + WEAPONS[id].cd, job: job('fight') });
      expect(poseOf(p, at(101), [])).toMatchObject({ pose: 'aim', frame: 1, arm: 'aim' });
      expect(poseOf(p, at(100 + WEAPONS[id].cd - 1), [])).toMatchObject({ pose: 'aim', frame: 0 });
    }
  });

  it('warta po ciosie pokazuje cios, bez ciosu stoi z lampą; w drodze broń w ręce', () => {
    const p = pawn({ weapon: 'dzida', cd: 100 + WEAPONS.dzida.cd, job: job('guard', 1, 0) });
    expect(poseOf(p, at(102), []).pose).toBe('aim');
    expect(poseOf(p, at(400), []).pose).toBe('guard');
    expect(poseOf(pawn({ weapon: 'lom', path: [1, 2] }), 1, []).pose).toBe('walk');
  });

  it('szwendacz: chwiejny chód, przy siatce kołysze się, tuż po ugryzieniu rzut', () => {
    const z = pawn({ kind: 'zombie', job: job('zombie', 0), path: [1, 2], walk: 0.5 });
    expect(poseOf(z, 1, [])).toMatchObject({ zpose: 'lurch' });
    const press = pawn({ kind: 'zombie', job: job('zombie', 2, 7) });
    const frames = new Set<number>();
    for (let t = 0; t < 4; t += 0.1) frames.add(poseOf(press, t, []).frame);
    expect(frames.size).toBeGreaterThan(1);
    const bite = pawn({ kind: 'zombie', cd: 130, job: job('zombie', 3, 5) });
    expect(poseOf(bite, at(102), [])).toMatchObject({ zpose: 'bite' });
    expect(poseOf(bite, at(129), [])).toMatchObject({ zpose: 'lurch' });
  });
});

describe('atlasy walki', () => {
  it('nakładki broni: komórka 64×64 na broń, kierunek i pozę; dłoń w klatce postaci', () => {
    fakeDocument();
    const c = makeWeaponAtlas() as unknown as FakeCanvas;
    expect([c.width, c.height]).toEqual([WEAPON_W, WEAPON_H]);
    expect(ARMED).not.toContain('piesci');
    const opaque = (x0: number, y0: number) => {
      let n = 0;
      for (let y = y0; y < y0 + CELL; y++)
        for (let x = x0; x < x0 + CELL; x++) if (c.data[(y * c.width + x) * 4 + 3] === 255) n++;
      return n;
    };
    for (const id of ARMED)
      for (let dir = 0; dir < 4; dir++) {
        const [x, y] = weaponRect(id, 'hold', dir, 0);
        expect(opaque(x, y), `${id} ${dir}`).toBeGreaterThan(4);
      }
    // dzida dłuższa niż nóż
    const [dx, dy] = weaponRect('dzida', 'hold', 3, 0);
    const [nx, ny] = weaponRect('noz', 'hold', 3, 0);
    expect(opaque(dx, dy)).toBeGreaterThan(opaque(nx, ny) * 2);
    for (const pose of ['hold', 'swing', 'aim'] as const)
      for (let dir = 0; dir < 4; dir++) {
        const h = handOf(pose, dir, 0);
        expect(h.x).toBeGreaterThanOrEqual(0);
        expect(h.x).toBeLessThan(32);
        expect(h.y).toBeGreaterThanOrEqual(0);
        expect(h.y).toBeLessThan(48);
      }
  });

  it('atlas szwendaczy: 16 wyglądów, chód, ugryzienie i trup; atlas ludzi mieści się w 4096 px', () => {
    fakeDocument();
    const c = makeZombieAtlas() as unknown as FakeCanvas;
    expect([c.width, c.height]).toEqual([ZATLAS_W, ZATLAS_H]);
    expect(ATLAS_W).toBeLessThanOrEqual(4096);
    const opaque = ([x0, y0, w, h]: [number, number, number, number]) => {
      let n = 0;
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) if (c.data[(y * c.width + x) * 4 + 3] === 255) n++;
      return n;
    };
    for (let look = 0; look < 16; look += 5) {
      expect(opaque(zFrameRect(look, 'lurch', 0, 1))).toBeGreaterThan(150);
      expect(opaque(zFrameRect(look, 'bite', 3, 1))).toBeGreaterThan(150);
      expect(opaque(zLieRect(look, 2))).toBeGreaterThan(150);
    }
  });
});

describe('światło i ziemia', () => {
  it('błysk przy strzale przez 3 kroki', () => {
    const st = {
      things: [],
      felled: [],
      tick: 103,
      pawns: [],
      fx: [{ t: 'strzal' as const, x: 5, y: 6, tick: 101 }],
    };
    const flash = gameLights({ st, light: [] }, []).filter((l) => l.color === 0xffe0a0);
    expect(flash).toHaveLength(1);
    expect(gameLights({ st: { ...st, tick: 105 }, light: [] }, []).some((l) => l.color === 0xffe0a0)).toBe(false);
  });

  it('wzmocniona siatka: deski, póki kafelek ma co najmniej 50; łata na nowej dziurze', () => {
    const w = mockBlock();
    const f = w.fence;
    const blocked = w.blocked.slice();
    for (const t of f.hole) blocked[t] = 1;
    const [a, b, c] = f.tiles.filter((t) => !f.hole.includes(t));
    const hp = f.tiles.map((t) => (t === b ? 30 : 100));
    const fs = { reinforced: true, hp, holes: [{ tiles: [c], patch: 70 }] };
    const state = fenceStateFn(f, fenceCodes(f, blocked, w.size, fs));
    expect(state(a)).toBe('wzm');
    expect(state(b)).toBe('cala');
    expect(state(c)).toBe('lata');
    expect(state(f.hole[0])).toBe('lata');
    expect(thingSprite({ kind: 'siatka', mask: 10, state: 'wzm' }).px.some((v) => v !== 0)).toBe(true);
  });

  it('krew to plama na ziemi z grafiki zastępczej', () => {
    const spec = specOf({ kind: 'krew', x: 3, y: 4, w: 1, h: 1, rot: 0 })!;
    expect(spec.kind).toBe('krew');
    const sp = thingSprite(spec);
    expect(sp.px.filter((v) => v !== 0).length).toBeGreaterThan(20);
  });
});
