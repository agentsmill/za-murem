import { describe, expect, it } from 'vitest';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock, mockHouse } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const gateTiles = () => {
  const g = w.fence.gate;
  const out: number[] = [];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) out.push(y * size + x);
  return out;
};

describe('siatka w symulacji', () => {
  it('stan ze świata: dziury ze startu, brama otwarta, wytrzymałość odcinków; odczyt dla zarządu', () => {
    const st = createSim(w, 3, { core: 2 });
    const f = st.fence!;
    expect(f).toBeTruthy();
    expect(
      f.holes
        .flatMap((h) => h.tiles)
        .slice()
        .sort((a, b) => a - b),
    ).toEqual(w.fence.hole);
    for (const h of f.holes) {
      expect(h.patch).toBe(0);
      expect(h.size).toBeGreaterThan(0);
      expect(h.size).toBeLessThanOrEqual(1);
    }
    expect(f.gateOpen).toBe(true);
    expect(f.hp).toHaveLength(w.fence.tiles.length);
    for (const [k, t] of w.fence.tiles.entries()) {
      if (w.fence.hole.includes(t)) expect(f.hp[k]).toBe(0);
      else expect(f.hp[k]).toBeGreaterThan(20);
    }
    const s = snapshot(st, w);
    expect(s.fence.holes.map((h) => h.id)).toEqual(f.holes.map((h) => h.id));
    expect(s.fence.durability).toBeGreaterThan(0.3);
    expect(s.fence.durability).toBeLessThan(0.85);
    expect(s.fence.gateOpen).toBe(true);
    expect(s.light).toEqual({ campfire: false, gateLamp: false });
  });

  it('zarząd i mieszkańcy nie przełażą dziurami, szabrownicy tak', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    for (const t of w.fence.hole) {
      expect(sim.canWalk('core', t)).toBe(false);
      expect(sim.canWalk('resident', t)).toBe(false);
      expect(sim.canWalk('stranger', t)).toBe(true);
    }
    for (const t of w.fence.tiles.filter((x) => !w.fence.hole.includes(x)))
      for (const k of ['core', 'resident', 'stranger'] as const) expect(sim.canWalk(k, t)).toBe(false);
  });

  it('zamknięta brama zatrzymuje mieszkańców i obcych, zarząd ma klucz', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    for (const t of gateTiles()) {
      expect(sim.canWalk('core', t)).toBe(true);
      expect(sim.canWalk('stranger', t)).toBe(true);
      // mieszkańcy nie wychodzą za siatkę nawet przy otwartej bramie
      expect(sim.canWalk('resident', t)).toBe(false);
    }
    sim.push({ t: 'gate', ids: [], open: false });
    sim.step();
    expect(sim.st.fence!.gateOpen).toBe(false);
    for (const t of gateTiles()) {
      expect(sim.canWalk('core', t)).toBe(true);
      expect(sim.canWalk('stranger', t)).toBe(false);
    }
    expect(snapshot(sim.st, w).fence.gateOpen).toBe(false);
  });

  it('zapis i wczytanie odtwarza dziury, łaty i bramę', () => {
    const st = createSim(w, 3, { core: 2 });
    const f = st.fence!;
    f.holes[0].patch = 70;
    f.gateOpen = false;
    const sim = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (const t of f.holes[0].tiles) expect(sim.canWalk('stranger', t)).toBe(false);
    for (const t of f.holes[1].tiles) expect(sim.canWalk('stranger', t)).toBe(true);
    for (const t of gateTiles()) expect(sim.canWalk('stranger', t)).toBe(false);
    // łata podnosi wytrzymałość siatki
    expect(snapshot(sim.st, w).fence.durability).toBeGreaterThan(
      snapshot(createSim(w, 3, { core: 2 }), w).fence.durability,
    );
    expect(snapshot(sim.st, w).fence.holes).toHaveLength(f.holes.length - 1);
  });
});

describe('mieszkańcy zamiast tłumu', () => {
  const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
  const residents = (sim: Sim) => sim.st.pawns.filter((p) => p.kind === 'resident');
  const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
  const yard = new Set(w.fence.yard);
  const roomOf = (i: number) => w.interior.room[i];
  const inHq = (i: number) => roomOf(i) >= 0 || w.interior.doors.includes(i);

  it('3–8 osób w pozostałych mieszkaniach siedziby połączonych z podwórkiem; w domu jednorodzinnym nikt', () => {
    const st = createSim(w, 3, { core: 4 });
    const rs = st.pawns.filter((p) => p.kind === 'resident');
    expect(rs.length).toBeGreaterThanOrEqual(3);
    expect(rs.length).toBeLessThanOrEqual(8);
    for (const p of rs) {
      expect(p.apt).toBeGreaterThanOrEqual(0);
      expect(p.apt).not.toBe(w.interior.home);
      expect(w.interior.rooms[roomOf(tileOf(p))].apt).toBe(p.apt);
      expect(p.person).toBe(-1);
    }
    expect(snapshot(st, w).residents).toBe(rs.length);
    const house = mockHouse();
    expect(createSim(house, 3, { core: 4 }).pawns.some((p) => p.kind === 'resident')).toBe(false);
  });

  it('plan dnia: rano w domu, za dnia praca na podwórku, wieczorem i nocą w środku', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    let yardDay = 0;
    let samplesDay = 0;
    while (sim.st.tick < atHour(2, 17)) {
      sim.step();
      if (sim.st.tick % 100) continue;
      const h = 15 + sim.st.tick / 800;
      const hour = h % 24;
      for (const p of residents(sim)) {
        const i = tileOf(p);
        if (hour >= 23 || hour < 5) {
          // nocą w swoim mieszkaniu, śpią
          expect(w.interior.rooms[roomOf(i)]?.apt).toBe(p.apt);
          expect(p.job?.t).toBe('sleep');
        }
        if (hour >= 10 && hour < 16 && h > 24) {
          samplesDay++;
          if (yard.has(i)) yardDay++;
        }
      }
    }
    expect(yardDay / samplesDay).toBeGreaterThan(0.5);
  });

  it('nie wychodzą za siatkę, nie przełażą dziurami i nie wchodzą do mieszkania zarządu', () => {
    const sim = new Sim(w, createSim(w, 5, { core: 2 }));
    const holes = new Set(w.fence.hole);
    for (let k = 0; k < 2 * 24 * 800; k++) {
      sim.step();
      if (k % 20) continue;
      for (const p of residents(sim)) {
        const i = tileOf(p);
        expect(yard.has(i) || inHq(i)).toBe(true);
        expect(holes.has(i)).toBe(false);
        const r = roomOf(i);
        if (r >= 0) expect(w.interior.rooms[r].apt).not.toBe(w.interior.home);
      }
    }
  });
});
