import { describe, expect, it } from 'vitest';
import { hitChance, START_KIT, WEAPONS, weaponOf } from '../../src/sim/bron.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();

describe('broń', () => {
  it('tabela broni jak w projekcie', () => {
    const row = (id: keyof typeof WEAPONS) => {
      const b = WEAPONS[id];
      return [b.reach, b.dmg, b.cd, b.noise, b.hit, b.ammo, b.fence];
    };
    expect(row('piesci')).toEqual([1.3, 6, 24, 0, 0.6, null, false]);
    expect(row('noz')).toEqual([1.3, 34, 18, 0, 0.75, null, false]);
    expect(row('siekiera')).toEqual([1.5, 50, 30, 4, 0.7, null, false]);
    expect(row('lom')).toEqual([1.5, 42, 26, 5, 0.75, null, false]);
    expect(row('kij')).toEqual([1.6, 38, 22, 5, 0.75, null, false]);
    expect(row('dzida')).toEqual([2.6, 36, 24, 1, 0.7, null, true]);
    expect(row('kusza')).toEqual([12, 70, 70, 2, 0.75, 'belty', true]);
    expect(row('rewolwer')).toEqual([14, 75, 20, 40, 0.65, 'naboje', true]);
    expect(row('strzelba')).toEqual([8, 100, 40, 50, 0.8, 'loftki', true]);
    expect(weaponOf(null).id).toBe('piesci');
    expect(weaponOf(undefined).id).toBe('piesci');
    expect(weaponOf('lom').name).toBe('łom');
  });

  it('celność: +0,05 za punkt obrony, −0,15 przy siłach poniżej 20 i z kikutem', () => {
    const lom = WEAPONS.lom;
    expect(hitChance(lom, 2, 10, false)).toBeCloseTo(0.75 + 0.1 - 0.15, 10);
    expect(hitChance(lom, 0, 80, false)).toBeCloseTo(0.75, 10);
    expect(hitChance(lom, 0, 80, true)).toBeCloseTo(0.6, 10);
    expect(hitChance(WEAPONS.strzelba, 5, 80, false)).toBeLessThanOrEqual(0.95);
  });

  it('zwykły tryb: siekiera u pierwszej osoby, nóż i łom w magazynie, bez amunicji', () => {
    const st = createSim(w, 3, { core: 4 });
    expect(modeOf(st)).toBe('zwykly');
    const core = st.pawns.filter((p) => p.kind === 'core');
    expect(core.map((p) => p.weapon ?? null)).toEqual(['siekiera', null, null, null]);
    expect(st.store.arms).toEqual(['noz', 'lom']);
    expect(st.store.ammo).toEqual({ naboje: 0, loftki: 0, belty: 0 });
    expect(START_KIT.zwykly.store).toEqual(['noz', 'lom']);
  });

  it('tryb zombie: rewolwer, dzida, łom i nóż, w magazynie dzida i kij, 12 naboi', () => {
    const st = createSim(w, 3, { core: 4, mode: 'zombie' });
    expect(modeOf(st)).toBe('zombie');
    const core = st.pawns.filter((p) => p.kind === 'core');
    expect(core.map((p) => p.weapon)).toEqual(['rewolwer', 'dzida', 'lom', 'noz']);
    expect(st.store.arms).toEqual(['dzida', 'kij']);
    expect(st.store.ammo).toEqual({ naboje: 12, loftki: 0, belty: 0 });
  });

  it('polecenie arm bierze broń z magazynu, a starą odkłada', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 4 }));
    const [a, b] = sim.st.pawns.filter((p) => p.kind === 'core');
    sim.push({ t: 'arm', ids: [a.id], weapon: 'lom' });
    sim.step();
    expect(a.weapon).toBe('lom');
    expect(sim.st.store.arms).toEqual(['noz', 'siekiera']);
    // broni, której nie ma w magazynie, nie da się wziąć
    sim.push({ t: 'arm', ids: [b.id], weapon: 'rewolwer' });
    sim.step();
    expect(b.weapon ?? null).toBe(null);
    // odłożenie broni do magazynu
    sim.push({ t: 'arm', ids: [a.id], weapon: null });
    sim.step();
    expect(a.weapon).toBe(null);
    expect(sim.st.store.arms).toEqual(['noz', 'siekiera', 'lom']);
    expect(snapshot(sim.st, w).people.find((p) => p.pawn === a.id)?.weapon).toBe(null);
    expect(snapshot(sim.st, w).stock.arms).toEqual(['noz', 'siekiera', 'lom']);
  });

  it('stan bez nowych pól (zapis sprzed broni) wczytuje się jako zwykły tryb', () => {
    const st = createSim(w, 3, { core: 4 });
    const old = JSON.parse(JSON.stringify(st));
    delete old.mode;
    delete old.store.arms;
    delete old.store.ammo;
    for (const p of old.pawns) delete p.weapon;
    const sim = new Sim(w, old);
    expect(modeOf(sim.st)).toBe('zwykly');
    expect(sim.st.store.arms).toEqual([]);
    expect(sim.st.store.ammo).toEqual({ naboje: 0, loftki: 0, belty: 0 });
    for (let k = 0; k < 200; k++) sim.step();
    expect(snapshot(sim.st, w).people[0].weapon).toBe(null);
  });
});
