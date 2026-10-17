import { describe, expect, it } from 'vitest';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock, mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const size = w.size;
const h = w.interior;
const aptOf = (i: number) => h.rooms[h.room[i]]?.apt ?? -1;
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const residents = (st: SimState) => st.pawns.filter((p) => p.kind === 'resident');

describe('M2: mieszkania i materiały w stanie gry', () => {
  it('stan mieszkań ze świata: zarząd, mieszkańcy, puste z powodem i rokiem; uszkodzenia; śmieci i zepsute meble', () => {
    const st = createSim(w, 3, { core: 4 });
    expect(st.apts).toEqual([
      { apt: 0, state: 'zarzad', ours: true, searched: [] },
      { apt: 1, state: 'mieszkancy', ours: false, searched: [] },
      { apt: 2, state: 'puste', why: 'splądrowanie', year: 2031, ours: false, searched: [] },
      { apt: 3, state: 'puste', why: 'zalanie', year: 2044, ours: false, searched: [] },
    ]);
    expect(st.damage.map((d) => [d.kind, d.apt, d.fixed])).toEqual([
      ['drzwi', 2, false],
      ['okno', 2, false],
      ['podloga', 3, false],
      ['rura', 3, false],
    ]);
    expect(st.things.filter((t) => t.kind === 'smieci').map((t) => t.n)).toEqual([4, 3]);
    expect(st.things.filter((t) => t.broken).map((t) => t.kind)).toEqual(['lozko', 'stol', 'wersalka']);
    // mieszkańcy tylko w mieszkaniu mieszkańców
    expect(residents(st).length).toBeGreaterThan(0);
    for (const p of residents(st)) {
      expect(p.apt).toBe(1);
      expect(aptOf(tileOf(p))).toBe(1);
    }
  });

  it('odczyt: materiały razem, mieszkania z uszkodzeniami i przeszukaniem', () => {
    const st = createSim(w, 3, { core: 4 });
    const s = snapshot(st, w);
    const heap = (k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
    expect(s.stock.mats).toEqual({
      drewno: 0,
      deski: heap('deski'),
      zlom: heap('zlom'),
      czesci: 0,
      jedzenie: heap('jedzenie'),
      leki: 0,
    });
    expect(s.apts.map((a) => [a.apt, a.state, a.ours, a.damaged, a.rooms, a.searched])).toEqual([
      [0, 'zarzad', true, 0, 4, 0],
      [1, 'mieszkancy', false, 0, 1, 0],
      [2, 'puste', false, 2, 2, 0],
      [3, 'puste', false, 2, 1, 0],
    ]);
    expect(s.builds).toEqual([]);
  });

  it('bez World.apts każde mieszkanie poza zarządem to mieszkańcy, jak w M1', () => {
    const old = mockBlock();
    const st = createSim(old, 3, { core: 2 });
    expect(st.apts).toEqual([
      { apt: 0, state: 'zarzad', ours: true, searched: [] },
      { apt: 1, state: 'mieszkancy', ours: false, searched: [] },
    ]);
    expect(st.damage).toEqual([]);
    expect(residents(st).length).toBeGreaterThan(0);
  });

  it('zapis sprzed M2 (bez mieszkań, uszkodzeń i planów) wczytuje się i dostaje stan ze świata', () => {
    const st = createSim(w, 3, { core: 2 }) as unknown as Record<string, unknown>;
    delete st.apts;
    delete st.damage;
    delete st.builds;
    const sim = new Sim(w, JSON.parse(JSON.stringify(st)) as SimState);
    expect(sim.st.apts).toHaveLength(4);
    expect(sim.st.damage).toHaveLength(4);
    expect(sim.st.builds).toEqual([]);
    for (let k = 0; k < 200; k++) sim.step();
  });
});
