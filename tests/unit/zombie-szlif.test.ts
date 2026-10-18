/* Szlif trybu zombie (18.10.2026): szwendacz w łatanej dziurze zostaje po stronie ulicy; warta z bronią palną
   nie strzela sama przez siatkę; „Do broni!” odwołuje ten sam przycisk; warta przy siatce staje tam, skąd jej broń
   sięga napierających (także na rogu siatki). */

import { describe, expect, it } from 'vitest';
import { NOTE_HOLD_FIRE } from '../../src/content/napisy-zombie.ts';
import { makeCard } from '../../src/gov/noc.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { alarmOn, createSim, type Pawn, SIATKA_POST, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';
import { pl } from './po-angielsku.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
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
const near4 = (t: number) => [t - size, t + size, t - 1, t + 1];
const indoor = (t: number) => w.interior.room[t] >= 0 || w.interior.doors.includes(t);

/** Kafelki siatki z wolnym miejscem po obu stronach: od ulicy dla szwendacza, od podwórka dla zarządu; co trzeci,
    żeby test nie trwał za długo. Zwraca kafelek siatki, sąsiada od ulicy i sąsiada od podwórka. */
function holeSpots(sim: Sim): { tile: number; out: number; inn: number }[] {
  const spots: { tile: number; out: number; inn: number }[] = [];
  for (const [k, tile] of w.fence.tiles.entries()) {
    if (k % 3) continue;
    const out = near4(tile).find((n) => !yard.has(n) && !indoor(n) && sim.canWalk('zombie', n));
    const inn = near4(tile).find((n) => yard.has(n) && sim.canWalk('zombie', n) && sim.canWalk('core', n));
    if (out !== undefined && inn !== undefined) spots.push({ tile, out, inn });
  }
  return spots;
}

/** nowa dziura w siatce (napór zbił kafelek do zera) */
function openHole(st: SimState, sim: Sim, tile: number): void {
  sim.damageFence(tile, 200);
  expect(st.fence!.holes.some((h) => h.tiles.includes(tile) && !h.patch)).toBe(true);
  expect(sim.canWalk('zombie', tile)).toBe(true);
}

describe('szwendacz w łatanej dziurze', () => {
  it('kto stoi w dziurze, kiedy ją łatają, zostaje po stronie ulicy', () => {
    const spots = holeSpots(zombieDay().sim);
    expect(spots.length).toBeGreaterThan(5);
    for (const { tile } of spots) {
      const { st, sim } = zombieDay();
      openHole(st, sim, tile);
      const z = spawnZombie(st, w, tile, 3);
      // łaty z zarządu: największa otwarta dziura od razu załatana
      sim.push({ t: 'mend', ids: [], n: 1 });
      let inYard = false;
      runTo(sim, st.tick + 2000, () => {
        if (yard.has(tileOf(z))) inYard = true;
      });
      expect(inYard, `dziura ${tile}`).toBe(false);
      expect(sim.canWalk('zombie', tile), `dziura ${tile}`).toBe(false);
    }
  });

  it('kto idzie przez dziurę na hałas z podwórka, staje przed łatą', () => {
    const spots = holeSpots(zombieDay().sim);
    let crossing = 0;
    for (const { tile, out, inn } of spots) {
      const { st, sim } = zombieDay();
      openHole(st, sim, tile);
      const z = spawnZombie(st, w, out, 3);
      // hałas tuż za dziurą od strony podwórka: szwendacz idzie na niego przez dziurę
      st.noise!.push({ x: (inn % size) + 0.5, y: Math.floor(inn / size) + 0.5, r: 10, until: st.tick + 400 });
      runTo(sim, st.tick + 40);
      if (!z.path.slice(z.pi).includes(tile)) continue;
      crossing++;
      sim.push({ t: 'mend', ids: [], n: 1 });
      let inYard = false;
      runTo(sim, st.tick + 2000, () => {
        if (yard.has(tileOf(z))) inYard = true;
      });
      expect(inYard, `dziura ${tile}`).toBe(false);
    }
    // test ma sens tylko wtedy, gdy szwendacze naprawdę szli przez dziurę
    expect(crossing).toBeGreaterThan(3);
  });
});

describe('broń palna w trybie zombie: strzał ściąga stado', () => {
  const coreOf = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
  const dist = (a: Pawn, b: Pawn) => Math.hypot(a.x - b.x, a.y - b.y);
  /** kafelek siatki najbliżej bramy, który ma wolny kafelek od ulicy, i ten kafelek */
  const fenceOut = (sim: Sim) => {
    const gx = w.fence.gate.x;
    const gy = w.fence.gate.y;
    const tiles = [...w.fence.tiles].sort(
      (a, b) =>
        Math.hypot((a % size) - gx, Math.floor(a / size) - gy) - Math.hypot((b % size) - gx, Math.floor(b / size) - gy),
    );
    for (const t of tiles) {
      const out = near4(t).find((n) => !yard.has(n) && !indoor(n) && sim.canWalk('zombie', n));
      if (out !== undefined) return { tile: t, out };
    }
    throw new Error('brak kafelka siatki z wolnym miejscem od ulicy');
  };
  const night = () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(1, 23);
    const sim = new Sim(w, st);
    const [g, b] = coreOf(st);
    g.weapon = 'rewolwer';
    b.weapon = null;
    return { st, sim, g };
  };

  it('warta z rewolwerem przy siatce nie strzela sama do szwendaczy za siatką', () => {
    const { st, sim, g } = night();
    const { out } = fenceOut(sim);
    sim.push({ t: 'guard', ids: [g.id], post: 'siatka' });
    for (let k = 0; k < 3; k++) spawnZombie(st, w, out, k, true);
    let close = Number.POSITIVE_INFINITY;
    runTo(sim, st.tick + 1200, () => {
      for (const z of st.pawns) if (z.kind === 'zombie' && z.job?.phase === 2) close = Math.min(close, dist(z, g));
    });
    // szwendacze napierali w zasięgu rewolweru (14 m), a warta stała i nie strzelała
    expect(close).toBeLessThan(10);
    expect(g.job?.t).toBe('guard');
    expect(st.store.ammo!.naboje).toBe(12);
  });

  it('warta z rewolwerem strzela do szwendacza po swojej stronie siatki', () => {
    const { st, sim, g } = night();
    sim.push({ t: 'guard', ids: [g.id], post: 'brama' });
    runTo(sim, st.tick + 400);
    expect(g.job?.t).toBe('guard');
    expect(g.job?.phase).toBe(1);
    // szwendacz na podwórku 4–8 m od warty
    const spot = w.fence.yard.find((i) => {
      const d = Math.hypot((i % size) + 0.5 - g.x, Math.floor(i / size) + 0.5 - g.y);
      return d >= 4 && d <= 8 && sim.canWalk('zombie', i);
    })!;
    expect(spot).toBeDefined();
    spawnZombie(st, w, spot, 2);
    runTo(sim, st.tick + 200);
    expect(st.store.ammo!.naboje).toBeLessThan(12);
  });

  it('na rozkaz „Atakuj” strzela do szwendacza za siatką', () => {
    const { st, sim, g } = night();
    const { out } = fenceOut(sim);
    const z = spawnZombie(st, w, out, 1, true);
    runTo(sim, st.tick + 20);
    const attack = commandsAt(st, w, [g.id], tileOf(z)).find((m) => m.cmd.t === 'attack');
    expect(attack).toBeTruthy();
    sim.push(attack!.cmd);
    runTo(sim, st.tick + 1200);
    expect(st.store.ammo!.naboje).toBeLessThan(12);
  });

  it('kto sam zaczął walkę z rewolwerem, nie strzela za szwendaczem, który wyszedł za siatkę', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(2, 10);
    const sim = new Sim(w, st);
    const [g, b] = coreOf(st);
    g.weapon = 'rewolwer';
    b.weapon = null;
    const { tile, out } = fenceOut(sim);
    const yardNear = (from: number, lo: number, hi: number) =>
      w.fence.yard.find((i) => {
        const d = Math.hypot((i % size) - (from % size), Math.floor(i / size) - Math.floor(from / size));
        return d >= lo && d <= hi && sim.canWalk('core', i) && sim.canWalk('zombie', i);
      });
    // ktoś z rewolwerem czeka na podwórku 2–3 m od siatki („idź tu”), a szwendacz 3–5 m od niego, po tej samej stronie
    const gs = yardNear(tile, 2, 3)!;
    Object.assign(g, { x: (gs % size) + 0.5, y: Math.floor(gs / size) + 0.5, path: [], pi: 0, job: null, wait: 0 });
    sim.push({ t: 'move', ids: [g.id], to: gs });
    runTo(sim, st.tick + 20);
    expect(g.job?.t).toBe('go');
    const z = spawnZombie(st, w, yardNear(gs, 3, 5)!, 2);
    // sam z siebie, bez rozkazu, staje do walki
    while (g.job?.t !== 'fight' && st.tick < atHour(2, 11)) sim.step();
    expect(g.job?.t).toBe('fight');
    expect(g.job?.order).toBe(false);
    // szwendacz za siatką, w zasięgu rewolweru
    Object.assign(z, { x: (out % size) + 0.5, y: Math.floor(out / size) + 0.5, path: [], pi: 0 });
    const ammo = st.store.ammo!.naboje;
    expect(dist(z, g)).toBeLessThan(14);
    runTo(sim, st.tick + 600);
    expect(st.store.ammo!.naboje).toBe(ammo);
    expect(g.job?.t).not.toBe('fight');
  });

  it('karta nocy: uwaga, że warta z bronią palną strzela przez siatkę tylko na rozkaz, przy siatce i zamkniętej bramie', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(2, 10);
    const sim = new Sim(w, st);
    const [a, b] = coreOf(st);
    a.weapon = 'rewolwer';
    b.weapon = 'dzida';
    sim.damageFence(w.fence.tiles[5], 1000);
    const hole = st.fence!.holes.find((h) => h.tiles.includes(w.fence.tiles[5]))!;
    const notes = (mode: 'zombie' | 'zwykly', p: Pawn) => {
      const card = makeCard(newGov(3, mode), govInput(st, w, 0)).card;
      const opts = card.people.find((c) => c.id === st.people[p.person].id)!.options;
      return (key: string) => pl(opts.find((o) => o.key === `warta:${key}`)?.note);
    };
    const gun = notes('zombie', a);
    expect(gun('siatka')).toBe(NOTE_HOLD_FIRE);
    expect(gun('brama')).toBe(NOTE_HOLD_FIRE);
    // przy otwartej dziurze szwendacz jest po naszej stronie: strzela sam
    expect(gun(`d${hole.id}`)).not.toBe(NOTE_HOLD_FIRE);
    // dzida sięga przez siatkę cicho, a w zwykłym trybie warta strzela jak dotąd
    expect(notes('zombie', b)('siatka')).not.toBe(NOTE_HOLD_FIRE);
    expect(notes('zwykly', a)('brama')).not.toBe(NOTE_HOLD_FIRE);
    // kusza strzela cicho, więc warta z kuszą strzela sama
    a.weapon = 'kusza';
    st.store.ammo!.belty = 5;
    expect(notes('zombie', a)('siatka')).not.toBe(NOTE_HOLD_FIRE);
  });
});

describe('„Do broni!” odwołuje ten sam przycisk', () => {
  const coreOf = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

  it('drugi raz: kto stanął na wartę z alarmu, schodzi z posterunku, a kto stał wcześniej, zostaje', () => {
    for (const mode of ['zombie', 'zwykly'] as const) {
      const st = createSim(w, 3, { core: 3, mode });
      st.tick = atHour(2, 10);
      const sim = new Sim(w, st);
      const [a, b, c] = coreOf(st);
      const ids = [a.id, b.id, c.id];
      sim.push({ t: 'guard', ids: [a.id], post: 'brama' });
      runTo(sim, st.tick + 1);
      expect(a.job?.t).toBe('guard');
      sim.push({ t: 'alarm', ids });
      runTo(sim, st.tick + 200);
      expect([b.job?.t, c.job?.t]).toEqual(['guard', 'guard']);
      expect(b.job?.target).toBe(mode === 'zombie' ? SIATKA_POST : 0);
      // kto już stał na warcie przy bramie, nie dostaje nowego posterunku
      expect(a.job?.t).toBe('guard');
      expect(a.job?.target).toBe(0);
      sim.push({ t: 'alarm', ids, off: true });
      runTo(sim, st.tick + 200);
      expect(b.job?.t, mode).not.toBe('guard');
      expect(c.job?.t, mode).not.toBe('guard');
      expect(a.job?.t, mode).toBe('guard');
    }
  });

  it('przycisk wie, czy alarm trwa: z kolejki poleceń zaraz po kliknięciu, potem ze stanu warty', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(2, 10);
    const sim = new Sim(w, st);
    const ids = coreOf(st).map((p) => p.id);
    expect(alarmOn(st)).toBe(false);
    sim.push({ t: 'alarm', ids });
    // na pauzie polecenie czeka w kolejce, a przycisk już mówi „Odwołaj”
    expect(alarmOn(st)).toBe(true);
    sim.step();
    expect(alarmOn(st)).toBe(true);
    sim.push({ t: 'alarm', ids, off: true });
    expect(alarmOn(st)).toBe(false);
    sim.step();
    expect(alarmOn(st)).toBe(false);
    // alarm bez nikogo zdolnego do warty nic nie zmienia
    for (const p of coreOf(st)) p.needs!.health = 20;
    sim.push({ t: 'alarm', ids });
    sim.step();
    expect(alarmOn(st)).toBe(false);
  });

  it('bez odwołania alarm trwa do 6:00 jak dotąd', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(2, 23);
    const sim = new Sim(w, st);
    sim.push({ t: 'alarm', ids: coreOf(st).map((p) => p.id) });
    runTo(sim, atHour(3, 5.9));
    expect(alarmOn(st)).toBe(true);
    runTo(sim, atHour(3, 6) + 40);
    expect(alarmOn(st)).toBe(false);
  });
});

describe('warta przy siatce staje tam, skąd sięga napierających', () => {
  it('na rogu siatki warta z dzidą 2,2 m od rogu przechodzi bliżej i zabija napierających', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = atHour(1, 23);
    const sim = new Sim(w, st);
    const [g, b] = st.pawns.filter((p) => p.kind === 'core');
    g.weapon = 'dzida';
    b.weapon = null;
    // róg siatki atrapy: (30, 63), od ulicy (29, 63) i (30, 62), od podwórka po skosie (31, 64)
    const corner = 63 * size + 30;
    expect(w.fence.tiles).toContain(corner);
    expect(w.fence.tiles).toContain(63 * size + 31);
    expect(w.fence.tiles).toContain(64 * size + 30);
    sim.push({ t: 'guard', ids: [g.id], post: 'siatka' });
    runTo(sim, st.tick + 400);
    expect(g.job?.t).toBe('guard');
    // warta stoi na (32, 64): 2,2 m od środka rogu, ale 2,8 m i więcej od szwendaczy za nim (dzida sięga 2,6 m)
    const spot = 64 * size + 32;
    Object.assign(g, { x: 32.5, y: 64.5, path: [], pi: 0 });
    g.job!.tile = spot;
    g.job!.phase = 1;
    const zs = [63 * size + 29, 62 * size + 30, 63 * size + 29].map((t, k) => {
      const z = spawnZombie(st, w, t, k, true);
      z.job!.phase = 2;
      z.job!.target = corner;
      return z;
    });
    runTo(sim, st.tick + 800);
    const alive = zs.filter((z) => st.pawns.includes(z)).length;
    expect(alive).toBeLessThan(2);
    expect(Math.hypot(g.x - 30.5, g.y - 63.5)).toBeLessThan(1.5);
  });
});
