/* Płot odporny na napór (tryb zombie, 18.10.2026): kilku szwendaczy siatki nie przewróci, konstrukcję niszczy dopiero
   tłok w jednym miejscu, a i on nie od razu. Dotyczy siatki, łat i zasieków (wszystko idzie przez damageFence). */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { PATCH_HP } from '../../src/sim/perimeter.ts';
import { createSim, type Pawn, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { CROWD_RADIUS, FENCE_BEARS, FENCE_FLOOR, pushOf } from '../../src/sim/zombie.ts';
import { helpSheet } from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const HOUR = 800;

/** Świat bez ludzi na mapie (szwendacze nie mają kogo gonić, więc stoją tam, gdzie je postawiono) i bez wydarzeń
    zarządu, w trybie zombie, o podanej godzinie pierwszej doby. */
function empty(hour = 16) {
  const st = createSim(w, 3, { core: 2, mode: 'zombie' });
  st.pawns = st.pawns.filter((p) => p.kind === 'zombie');
  st.tick = atHour(1, hour);
  return { st, sim: new Sim(w, st) };
}

/** kafelek z wolnym miejscem za siatką (od ulicy), od którego idziemy po siatce, i ten wolny kafelek */
function wireSpot(sim: Sim, from = 0): { tile: number; out: number } {
  for (const tile of w.fence.tiles.slice(from)) {
    const out = [tile - size, tile + size, tile - 1, tile + 1].find((n) => !yard.has(n) && sim.canWalk('zombie', n));
    if (out !== undefined) return { tile, out };
  }
  throw new Error('brak kafelka siatki z miejscem od ulicy');
}

/** n szwendaczy stoi tuż za siatką i napiera na kafelek `tile` */
function press(st: SimState, tile: number, out: number, n: number, look = 0): Pawn[] {
  const list: Pawn[] = [];
  for (let k = 0; k < n; k++) {
    const z = spawnZombie(st, w, out, (look + k) % 16, true);
    z.job!.phase = 2;
    z.job!.target = tile;
    list.push(z);
  }
  return list;
}

/** Puszcza symulację, aż siatka puści albo skończy się czas; zwraca ticki do przerwania (albo null). */
function untilBreach(sim: Sim, ticks: number): number | null {
  const t0 = sim.st.tick;
  while (sim.st.tick < t0 + ticks) {
    sim.step();
    if (sim.st.tally!.breaches > 0) return sim.st.tick - t0;
  }
  return null;
}

const hpAt = (st: SimState, tile: number) => st.fence!.hp[w.fence.tiles.indexOf(tile)];

describe('napór: czysta reguła', () => {
  it('poniżej progu tylko zużycie i nie poniżej dna, powyżej progu każdy napierający zdejmuje więcej', () => {
    const wear = pushOf(1, 100);
    expect(wear).toBeGreaterThan(0);
    // do progu włącznie zużycie jest to samo, niezależnie od tłoku
    expect(pushOf(FENCE_BEARS, 100)).toBe(wear);
    // ponad próg im większy tłok, tym więcej na każdego
    expect(pushOf(FENCE_BEARS + 1, 100)).toBeGreaterThan(wear);
    expect(pushOf(FENCE_BEARS + 6, 100)).toBeGreaterThan(pushOf(FENCE_BEARS + 1, 100));
    // zużycie nie zbija kafelka poniżej dna, tłok nie zna dna
    expect(pushOf(1, FENCE_FLOOR)).toBe(0);
    expect(pushOf(FENCE_BEARS, FENCE_FLOOR - 5)).toBe(0);
    expect(pushOf(FENCE_BEARS + 1, FENCE_FLOOR)).toBeGreaterThan(0);
    // tuż nad dnem zużycie nie schodzi pod dno
    expect(pushOf(1, FENCE_FLOOR + wear / 2)).toBeCloseTo(wear / 2, 10);
  });
});

describe('napór: siatka w trybie zombie', () => {
  it('kilku szwendaczy w jednym miejscu przez całą noc siatki nie przebija: traci wytrzymałość, ale stoi', () => {
    const { st, sim } = empty(16);
    const { tile, out } = wireSpot(sim);
    const few = FENCE_BEARS - 1;
    // tyle, co snujących się za dnia w pierwszej dobie, żeby zegar nie dokładał szwendaczy
    expect(few).toBeGreaterThanOrEqual(8);
    press(st, tile, out, few);
    const t = untilBreach(sim, atHour(2, 5.9) - st.tick);
    expect(t).toBeNull();
    const hp = hpAt(st, tile);
    expect(hp).toBeLessThan(100);
    expect(hp).toBeGreaterThanOrEqual(FENCE_FLOOR);
    expect(st.fence!.holes.every((h) => h.patch > 0)).toBe(true);
  });

  it('tłum w jednym miejscu siatkę przebija, ale nie od razu: im większy, tym szybciej', () => {
    const breachIn = (crowd: number) => {
      const { st, sim } = empty(16);
      const { tile, out } = wireSpot(sim);
      press(st, tile, out, crowd);
      const t = untilBreach(sim, 14 * HOUR);
      expect(t, `tłum ${crowd}`).not.toBeNull();
      expect(st.fence!.holes.some((h) => h.tiles.includes(tile) && h.patch === 0)).toBe(true);
      return t!;
    };
    const small = breachIn(FENCE_BEARS + 2);
    const big = breachIn(FENCE_BEARS + 14);
    // tuzin ponad próg to godziny pracy, nie minuty; potężny tłum to wciąż kwadrans, nie sekundy
    expect(small).toBeGreaterThan(HOUR);
    expect(small).toBeLessThan(4 * HOUR);
    expect(big).toBeLessThan(HOUR / 2);
    expect(big).toBeGreaterThan(HOUR / 20);
    expect(big).toBeLessThan(small);
  });

  it('tłum w jednym miejscu to także ci, którzy napierają obok (do CROWD_RADIUS kafelków), a nie ci dalej', () => {
    const near = (gap: number) => {
      const { st, sim } = empty(16);
      const { tile } = wireSpot(sim);
      // dwie grupy po FENCE_BEARS − 1 po obu stronach tej samej ściany: razem tłok ponad próg, jeśli blisko
      const ring = w.fence.tiles.filter(
        (t) => Math.floor(t / size) === Math.floor(tile / size) && Math.abs((t % size) - (tile % size)) <= 40,
      );
      const second = ring.find((t) => Math.abs((t % size) - (tile % size)) === gap);
      expect(second, `kafelek ${gap} od ${tile}`).toBeDefined();
      const spot = (t: number) => [t - size, t + size].find((n) => !yard.has(n) && sim.canWalk('zombie', n));
      const a = spot(tile);
      const b = spot(second!);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      press(st, tile, a!, FENCE_BEARS - 3);
      press(st, second!, b!, FENCE_BEARS - 3, 8);
      return untilBreach(sim, 14 * HOUR);
    };
    expect(near(CROWD_RADIUS)).not.toBeNull();
    expect(near(CROWD_RADIUS + 6)).toBeNull();
  });

  it('łata i świeża łata trzymają tak samo: kilku nie otworzy, tłum otworzy', () => {
    const run = (n: number) => {
      const { st, sim } = empty(16);
      const hole = st.fence!.holes[0];
      // świeża łata (70), nie ta ze startu (100)
      hole.patch = PATCH_HP;
      const tile = hole.tiles[0];
      const out = [tile - size, tile + size, tile - 1, tile + 1].find((m) => !yard.has(m) && sim.canWalk('zombie', m));
      expect(out, `kafelek za dziurą ${tile}`).toBeDefined();
      press(st, tile, out!, n);
      return { t: untilBreach(sim, atHour(2, 5.9) - st.tick), st, hole };
    };
    const few = run(FENCE_BEARS - 1);
    expect(few.t).toBeNull();
    expect(few.hole.patch).toBeGreaterThan(0);
    const crowd = run(FENCE_BEARS + 6);
    expect(crowd.t).not.toBeNull();
    expect(crowd.hole.patch).toBe(0);
  });

  it('powtarzalnie: to samo ziarno i ten sam skrót po nocy pod naporem', () => {
    const play = () => {
      const { st, sim } = empty(16);
      const { tile, out } = wireSpot(sim);
      press(st, tile, out, FENCE_BEARS + 2);
      for (let k = 0; k < 8 * HOUR; k++) sim.step();
      return sim.hash();
    };
    expect(play()).toBe(play());
  });
});

describe('napór: co widzi gracz', () => {
  afterEach(() => ustawJezyk('pl'));

  it('odczyt mówi, jaki tłok jest przy siatce: największa grupa napierających obok siebie', () => {
    const { st, sim } = empty(16);
    expect(snapshot(st, w).zombies.crowd).toBe(0);
    const { tile, out } = wireSpot(sim);
    press(st, tile, out, 5);
    expect(snapshot(st, w).zombies.crowd).toBe(5);
    // druga grupa tuż obok (w promieniu) liczy się do tego samego tłoku, a daleka osobno
    const { tile: far, out: farOut } = wireSpot(sim, w.fence.tiles.indexOf(tile) + 20);
    press(st, far, farOut, 3, 8);
    expect(snapshot(st, w).zombies.crowd).toBe(5);
  });

  it('pasek: tłok pod progiem jest w porządku, blisko progu uwaga, ponad progiem zły; w dymku liczby po polsku i po angielsku', () => {
    const crowdStat = (n: number) => {
      const { st, sim } = empty(16);
      const { tile, out } = wireSpot(sim);
      if (n) press(st, tile, out, n);
      return statsOf(snapshot(st, w), newGov(3, 'zombie')).find((x) => x.id === 'sFence')!;
    };
    expect(crowdStat(0).level).toBe('ok');
    expect(crowdStat(Math.ceil(FENCE_BEARS / 2)).level).toBe('ok');
    expect(crowdStat(FENCE_BEARS - 1).level).toBe('mid');
    expect(crowdStat(FENCE_BEARS + 1).level).toBe('bad');
    const busy = crowdStat(FENCE_BEARS - 2);
    expect(busy.title).toContain(String(FENCE_BEARS - 2));
    expect(busy.title).toContain(String(FENCE_BEARS));
    expect(crowdStat(0).title).not.toMatch(/tłok/i);
    ustawJezyk('en');
    const en = crowdStat(FENCE_BEARS - 2);
    expect(en.title).toMatch(/crowd/i);
    expect(en.title).toContain(String(FENCE_BEARS));
    expect(en.title).not.toMatch(/tłok|siatk/i);
  });

  it('pomoc trybu zombie tłumaczy, że kilku szwendaczy siatki nie przewróci, dopiero tłum', () => {
    expect(helpSheet(false, true).body).toContain(`${FENCE_BEARS}`);
    expect(helpSheet(false, true).body).toMatch(/tłum/);
    expect(helpSheet(false, false).body).not.toMatch(/tłum/);
    ustawJezyk('en');
    expect(helpSheet(false, true).body).toMatch(/crowd/i);
    expect(helpSheet(false, true).body).not.toMatch(/tłum|siatk/i);
  });
});
