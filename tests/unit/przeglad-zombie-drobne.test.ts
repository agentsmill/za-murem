/* Drobne poprawki z przeglądu gałęzi trybu zombie: broń dla kogoś na wyprawie, walka bez broni w trakcie, warta przy
   siatce a brama, powiązanie zwłok z wpisem zmarłego, tekstury trupów, życie szabrownika ze starego zapisu, uwaga
   o broni w karcie nocy. */

import { type Sprite, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { makeCard } from '../../src/gov/noc.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { GameView } from '../../src/render/view.ts';
import { govInput } from '../../src/sim/gov.ts';
import { houseOf, inHomeApt } from '../../src/sim/house.ts';
import { gateTiles } from '../../src/sim/perimeter.ts';
import { createSim, type Pawn, removeCore, Sim, type SimState, spawnZombie, type Thing } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';
import { pl } from './po-angielsku.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
const coreOf = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const dist = (a: number, b: number) => Math.hypot((a % size) - (b % size), Math.floor(a / size) - Math.floor(b / size));
const runTo = (sim: Sim, tick: number, each?: () => void) => {
  while (sim.st.tick < tick) {
    sim.step();
    each?.();
  }
};
const zombieDay = (core = 2) => {
  const st = createSim(w, 3, { core, mode: 'zombie' });
  st.tick = atHour(2, 10);
  return { st, sim: new Sim(w, st) };
};
/** stawia pionek na kafelku bez drogi i bez pracy */
const place = (p: Pawn, tile: number) =>
  Object.assign(p, { x: (tile % size) + 0.5, y: Math.floor(tile / size) + 0.5, path: [], pi: 0, job: null, wait: 0 });
/** szabrownicy z napadu, który zaczyna się od razu */
const raiders = (st: SimState, sim: Sim): Pawn[] => {
  sim.push({ t: 'raid', ids: [], at: st.tick, post: 'brama' });
  sim.step();
  return st.pawns.filter((p) => p.kind === 'szabrownik');
};

describe('drobne z przeglądu trybu zombie', () => {
  it('broń z magazynu nie trafia do rąk kogoś na wyprawie', () => {
    const { st, sim } = zombieDay(3);
    const a = coreOf(st)[0];
    const had = a.weapon;
    sim.push({ t: 'away', ids: [a.id] });
    runTo(sim, st.tick + 1500);
    expect(a.away).toBe(true);
    const store = [...st.store.arms!];
    sim.push({ t: 'arm', ids: [a.id], weapon: 'kij' });
    sim.push({ t: 'arm', ids: [a.id], weapon: null });
    sim.step();
    expect(a.weapon).toBe(had);
    expect(st.store.arms).toEqual(store);
  });

  it('walka ze szwendaczem: bez broni w trakcie odwrót (za siatką tylko koniec walki), atak gołymi rękami z rozkazu zostaje', () => {
    const fight = (weapon: Pawn['weapon'], naboje = 12) => {
      const { st, sim } = zombieDay();
      const [a, b] = coreOf(st);
      a.weapon = weapon;
      b.weapon = null;
      st.store.ammo!.naboje = naboje;
      // a na podwórku, szwendacz (którego nie da się szybko zabić) 2–3 m dalej po tej samej stronie siatki
      const spot = w.fence.yard.find(
        (i) =>
          sim.canWalk('core', i) &&
          w.fence.yard.some((j) => sim.canWalk('zombie', j) && dist(i, j) >= 2 && dist(i, j) <= 3),
      )!;
      const zs = w.fence.yard.find((j) => sim.canWalk('zombie', j) && dist(spot, j) >= 2 && dist(spot, j) <= 3)!;
      place(a, spot);
      Object.assign(a.needs!, { food: 95, warm: 95, rest: 95, health: 100 });
      const z = spawnZombie(st, w, zs, 1);
      z.hp = 100000;
      sim.push({ t: 'attack', ids: [a.id], target: z.id });
      sim.step();
      expect(a.job?.t).toBe('fight');
      return { st, sim, a };
    };
    // nóż odłożony w trakcie walki
    {
      const { st, sim, a } = fight('noz');
      runTo(sim, st.tick + 200);
      expect(a.job?.t).toBe('fight');
      sim.push({ t: 'arm', ids: [a.id], weapon: null });
      runTo(sim, st.tick + 60);
      expect(a.job?.t).not.toBe('fight');
    }
    // rewolwer z jednym nabojem: po strzale bez amunicji
    {
      const { st, sim, a } = fight('rewolwer', 1);
      const end = st.tick + 400;
      while (st.store.ammo!.naboje > 0 && st.tick < end) sim.step();
      expect(st.store.ammo!.naboje).toBe(0);
      expect(a.job?.t).toBe('fight');
      runTo(sim, st.tick + 60);
      expect(a.job?.t).not.toBe('fight');
    }
    // gracz kazał bić gołymi rękami: bije dalej
    {
      const { st, sim, a } = fight(null);
      runTo(sim, st.tick + 100);
      expect(a.job?.t).toBe('fight');
    }
    // szwendacz za siatką: bez amunicji walka się kończy, ale nikt nie ucieka do mieszkania
    {
      const { st, sim } = zombieDay();
      const [a, b] = coreOf(st);
      a.weapon = 'rewolwer';
      b.weapon = null;
      st.store.ammo!.naboje = 1;
      const fence = w.fence.tiles.find(
        (t) =>
          [t - size, t + size, t - 1, t + 1].some((n) => !yard.has(n) && sim.canWalk('zombie', n)) &&
          w.fence.yard.some((i) => sim.canWalk('core', i) && dist(i, t) >= 2 && dist(i, t) <= 3),
      )!;
      const out = [fence - size, fence + size, fence - 1, fence + 1].find(
        (n) => !yard.has(n) && sim.canWalk('zombie', n),
      )!;
      place(a, w.fence.yard.find((i) => sim.canWalk('core', i) && dist(i, fence) >= 2 && dist(i, fence) <= 3)!);
      Object.assign(a.needs!, { food: 95, warm: 95, rest: 95, health: 100 });
      const z = spawnZombie(st, w, out, 1, true);
      z.hp = 100000;
      z.job!.phase = 2;
      z.job!.target = fence;
      sim.push({ t: 'attack', ids: [a.id], target: z.id });
      const end = st.tick + 400;
      while (st.store.ammo!.naboje > 0 && st.tick < end) sim.step();
      expect(st.store.ammo!.naboje).toBe(0);
      let fled = false;
      runTo(sim, st.tick + 60, () => {
        if (a.job?.t === 'go' && inHomeApt(houseOf(w)!, a.job.tile)) fled = true;
      });
      expect(a.job?.t).not.toBe('fight');
      expect(fled).toBe(false);
    }
  });

  it('warta przy siatce nie idzie do bramy, na którą napierają szwendacze (brama nie puszcza)', () => {
    const { st, sim } = zombieDay();
    const g = coreOf(st)[0];
    g.weapon = null;
    coreOf(st)[1].weapon = null;
    const outOf = (t: number) =>
      [t - size, t + size, t - 1, t + 1].find(
        (n) => !yard.has(n) && !gateTiles(w).includes(n) && sim.canWalk('zombie', n),
      );
    const gate = gateTiles(w).find((t) => outOf(t) !== undefined)!;
    const wire = w.fence.tiles
      .filter((t) => outOf(t) !== undefined && dist(t, gate) > 8)
      .find((t) => w.fence.yard.some((i) => sim.canWalk('core', i) && dist(i, t) <= 1.5))!;
    expect(gate).toBeDefined();
    expect(wire).toBeDefined();
    const press = (t: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const z = spawnZombie(st, w, outOf(t)!, k, true);
        z.job!.phase = 2;
        z.job!.target = t;
      }
    };
    press(gate, 3);
    press(wire, 1);
    sim.push({ t: 'guard', ids: [g.id], post: 'siatka' });
    sim.step();
    expect(g.job?.t).toBe('guard');
    expect(dist(g.job!.tile, gate)).toBeGreaterThan(3);
    expect(dist(g.job!.tile, wire)).toBeLessThanOrEqual(3);
  });

  it('zwłoki pamiętają wpis zmarłego, także gdy znika pionek o tym samym numerze', () => {
    const { st, sim } = zombieDay(3);
    const [thief] = raiders(st, sim);
    expect(thief).toBeDefined();
    const [same, b] = coreOf(st);
    // wcześniejsze zgony: wpis szabrownika dostanie numer równy numerowi pionka same
    while (st.dead!.length < same.id)
      st.dead!.push({ id: '', name: 'Mieszkaniec', look: 0, kind: 'resident', tick: 0, cause: 'rany' });
    // szabrownik na podwórku kilka metrów od b
    const spot = w.fence.yard.find((i) => sim.canWalk('core', i) && dist(i, tileOf(b)) >= 2 && dist(i, tileOf(b)) <= 6);
    place(thief, spot ?? w.fence.yard.find((i) => sim.canWalk('core', i))!);
    sim.wound(thief, 1000);
    sim.step();
    expect(st.dead!.at(-1)?.kind).toBe('szabrownik');
    expect(st.dead!.length - 1).toBe(same.id);
    const body = st.things.find((t) => t.kind === 'zwloki')!;
    expect(body).toBeDefined();
    // odchodzi ktoś z zarządu, którego numer pionka równa się numerowi wpisu zmarłego
    removeCore(st, st.people[same.person].id);
    b.weapon = 'noz';
    sim.push({ t: 'finish', ids: [b.id], thing: body.id });
    runTo(sim, st.tick + 1200);
    expect(body.fuel).toBe(0);
    expect(b.moods.map((m) => m.why)).toContain('Dobiłem obcego');
  });

  it('trupy szwendaczy w widoku: tekstura po wyglądzie i stronie, nie nowa dla każdego trupa', () => {
    const view = new GameView();
    const v = view as unknown as {
      zatlas: TextureSource;
      cutOn: boolean;
      corpseSprites: Map<number, Sprite>;
      drawCorpses(st: SimState): void;
    };
    v.zatlas = new TextureSource({ width: 4096, height: 4096 });
    v.cutOn = true;
    const trup = (id: number): Thing => ({
      id,
      kind: 'trup',
      x: id,
      y: 3,
      w: 1,
      h: 1,
      rot: 0,
      n: 5,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    const textures = new Set<unknown>();
    for (const ids of [
      [0, 1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14, 15],
    ]) {
      v.drawCorpses({ things: ids.map(trup) } as unknown as SimState);
      expect(v.corpseSprites.size).toBe(8);
      for (const sp of v.corpseSprites.values()) textures.add(sp.texture);
    }
    // jeden wygląd, cztery strony: cztery tekstury na szesnaście trupów w dwóch kolejnych klatkach
    expect(textures.size).toBe(4);
  });

  it('szabrownik ze starego zapisu (bez życia) ma tyle życia co nowy', () => {
    const { st, sim } = zombieDay();
    const [thief] = raiders(st, sim);
    expect(thief).toBeDefined();
    delete thief.hp;
    // 75 obrażeń zabija szabrownika z 70 życia
    sim.wound(thief, 75);
    sim.step();
    expect(st.pawns.includes(thief)).toBe(false);
  });

  it('karta nocy: uwaga o broni, która nie sięga przez siatkę, przy siatce i zamkniętej bramie, a nie przy dziurze', () => {
    const { st, sim } = zombieDay();
    const a = coreOf(st)[0];
    a.weapon = 'lom';
    // dziura w siatce, przy której łom sięga
    sim.damageFence(w.fence.tiles[5], 1000);
    const hole = st.fence!.holes.find((h) => h.tiles.includes(w.fence.tiles[5]))!;
    expect(hole.patch).toBe(0);
    const NOTE = 'Z tą bronią nie sięgnie szwendaczy przez siatkę.';
    const notes = () => {
      const card = makeCard(newGov(3, 'zombie'), govInput(st, w, 0)).card;
      const opts = card.people.find((c) => c.id === st.people[a.person].id)!.options;
      return (key: string) => pl(opts.find((o) => o.key === `warta:${key}`)?.note);
    };
    const closed = notes();
    expect(closed('siatka')).toBe(NOTE);
    expect(closed('brama')).toBe(NOTE);
    expect(closed(`d${hole.id}`)).not.toBe(NOTE);
    // otwarta brama: łom sięga
    sim.push({ t: 'gate', ids: [], open: true });
    sim.step();
    expect(st.fence!.gateOpen).toBe(true);
    expect(notes()('brama')).not.toBe(NOTE);
  });
});
