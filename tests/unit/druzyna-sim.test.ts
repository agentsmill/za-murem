/* Własna drużyna w symulacji (createSim z opcją team): bez drużyny stan jak przed zmianą (skróty dla trzech dem),
   z drużyną reszta stanu jak bez niej przy tej samej liczbie osób, pierwsza doba z 1, 3 i 5 osobami w obu trybach
   bez błędu, złe dane wracają do losowania z adresu, broń ponad liczbę osób trafia do magazynu. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { losujDruzyne, type OsobaDruzyny, osobaDoGry } from '../../src/content/druzyna.ts';
import { hashString, mulberry } from '../../src/core/rng.ts';
import { ackReport, chooseEvent, confirmNight, govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const worlds = new Map<string, World>();
function world(key: string): World {
  let w = worlds.get(key);
  if (!w) {
    const a = ADDRESSES.find((x) => x.key === key)!;
    w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 3 });
    worlds.set(key, w);
  }
  return w;
}

/** Skróty stanu bez drużyny policzone na gałęzi pelna-gra (77af2a9) przed własną drużyną: createSim(świat, 7, { core,
    mode }) na starcie i po pierwszej dobie. Tryb zombie z 1–3 osobami się zmienił (broń ponad liczbę osób idzie do
    magazynu, decyzja 8 z projektu), więc go tu nie ma. Tryb zombie po dobie zmienił się 18.10.2026 przy scaleniu
    szwendaczy blisko siatki (c7a5f21 z tryb-zombie: pas 15–40 m za dnia, stado z okolicy), więc te dwa skróty są
    z pelna-gra po tym scaleniu; zwykły tryb i starty bez zmian. */
const PRZED: Record<string, string> = {
  'przymorze zwykly 1 start': 'bf1fc378',
  'przymorze zwykly 1 doba': '7c2439bf',
  'przymorze zwykly 2 start': '555ebe78',
  'przymorze zwykly 3 start': 'a100fbca',
  'przymorze zwykly 4 start': 'e37c3cbd',
  'przymorze zwykly 4 doba': '2c051eb6',
  'przymorze zwykly 5 start': 'c1d08113',
  'przymorze zwykly 5 doba': 'fc74bf7e',
  'przymorze zombie 4 start': '601e5138',
  'przymorze zombie 4 doba': 'f5eebaf7',
  'przymorze zombie 5 start': '6a4a7d1c',
  'przymorze zombie 5 doba': 'b00f03bb',
  'lanciego zwykly 1 start': '540c7ccc',
  'lanciego zwykly 2 start': '712940be',
  'lanciego zwykly 3 start': '6dfb0c87',
  'lanciego zwykly 4 start': '3a2c476c',
  'lanciego zwykly 4 doba': 'e6ee3b74',
  'lanciego zwykly 5 start': 'b0301f0a',
  'lanciego zombie 4 start': '57b8fb2d',
  'lanciego zombie 5 start': 'e4e4afb3',
  'zielonki zwykly 1 start': '056ea6f9',
  'zielonki zwykly 2 start': '8420ddc1',
  'zielonki zwykly 3 start': '3eebbb63',
  'zielonki zwykly 4 start': '6c990524',
  'zielonki zwykly 4 doba': 'a13f906b',
  'zielonki zwykly 5 start': '6f48d2ea',
  'zielonki zombie 4 start': 'b043c204',
  'zielonki zombie 5 start': '3b0e090e',
};

const MODES: GameMode[] = ['zwykly', 'zombie'];
/** pola osoby, które nadpisuje drużyna */
const POLA = ['first', 'name', 'f', 'prof', 'skills', 'age', 'traits', 'story'] as const;
const bezPol = (st: SimState) => ({
  ...st,
  people: st.people.map((p) =>
    Object.fromEntries(Object.entries(p).filter(([k]) => !(POLA as readonly string[]).includes(k))),
  ),
});

afterEach(() => vi.restoreAllMocks());

describe('bez drużyny gra jak przed zmianą', () => {
  it('skróty stanu na starcie i po dobie dla trzech dem jak na gałęzi przed drużyną', () => {
    for (const [key, want] of Object.entries(PRZED)) {
      const [demo, mode, n, when] = key.split(' ');
      const w = world(demo);
      const st = createSim(w, 7, { core: Number(n), mode: mode as GameMode });
      if (when === 'start') {
        expect(hashString(JSON.stringify(st)), key).toBe(want);
        continue;
      }
      const sim = new Sim(w, st);
      for (let k = 0; k < TICKS_PER_DAY; k++) sim.step();
      expect(sim.hash(), key).toBe(want);
    }
  });

  it('bez opcji zarząd ma 4 osoby i żadna nie ma historii', () => {
    const st = createSim(world('przymorze'), 7);
    expect(st.pawns.filter((p) => p.kind === 'core')).toHaveLength(4);
    expect(st.people.some((p) => 'story' in p)).toBe(false);
  });
});

describe('z drużyną', () => {
  it('reszta stanu jak bez drużyny przy tej samej liczbie osób, a osoby mają dane z drużyny', () => {
    for (const key of ['przymorze', 'lanciego', 'zielonki'])
      for (const mode of MODES)
        for (const n of [1, 3, 5]) {
          const w = world(key);
          const team = losujDruzyne(mulberry(n * 31 + key.length), n);
          const st = createSim(w, 7, { team, mode });
          const ref = createSim(w, 7, { core: n, mode });
          expect(bezPol(st), `${key} ${mode} ${n}`).toEqual(bezPol(ref));
          expect(st.pawns.filter((p) => p.kind === 'core')).toHaveLength(n);
          team.forEach((o, k) => {
            const p = st.people[k] as unknown as Record<string, unknown>;
            const pola = Object.fromEntries(POLA.filter((f) => f in p).map((f) => [f, p[f]]));
            expect(pola).toEqual(osobaDoGry(o));
          });
        }
  });

  it('drużyna ustala liczbę osób zamiast core', () => {
    const team = losujDruzyne(mulberry(1), 2);
    const st = createSim(world('przymorze'), 7, { core: 4, team });
    expect(st.pawns.filter((p) => p.kind === 'core')).toHaveLength(2);
  });

  /** pierwsza doba z zarządem: decyzje zarządu domyślne (karta nocy z propozycją, uchwała bez podpisu, wydarzenie
      pierwszą możliwą odpowiedzią); zwraca stan, zarząd i to, ile ticków nocy przespał każdy z zarządu */
  function firstDay(w: World, team: OsobaDruzyny[], mode: GameMode) {
    const st = createSim(w, 11, { team, mode });
    const sim = new Sim(w, st);
    const gov = newGov(11, mode);
    const sleep = new Map<number, number>();
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      sim.step();
      for (const p of st.pawns)
        if (p.kind === 'core' && p.job?.t === 'sleep' && p.job.phase === 1) sleep.set(p.id, (sleep.get(p.id) ?? 0) + 1);
      if (st.tick % TICKS_PER_SECOND) continue;
      const s = st.tick / TICKS_PER_SECOND;
      applyGov(st, w, govUpdate(gov, govInput(st, w, s)));
      if (gov.over) break;
      for (let k = 0; k < 5; k++) {
        const i = govInput(st, w, s);
        const p = pending(gov, i);
        if (!p) break;
        if (p.k === 'raport') ackReport(gov, i);
        else if (p.k === 'uchwala') applyGov(st, w, signLaw(gov, i, null));
        else if (p.k === 'wydarzenie')
          applyGov(
            st,
            w,
            chooseEvent(
              gov,
              i,
              Math.max(
                0,
                p.choices.findIndex((c) => c.ok),
              ),
            ),
          );
        else applyGov(st, w, confirmNight(gov, i));
      }
    }
    return { st, sim, gov, sleep };
  }

  for (const n of [1, 3, 5])
    for (const mode of MODES)
      it(`${n} ${n === 1 ? 'osoba' : 'osoby i więcej'}, tryb ${mode}: pierwsza doba z zarządem bez błędu`, () => {
        const w = world('przymorze');
        const team = losujDruzyne(mulberry(100 + n), n);
        const { st, sim, gov } = firstDay(w, team, mode);
        expect(st.tick).toBe(TICKS_PER_DAY);
        expect(gov.over ?? null).toBeNull();
        const snap = snapshot(st, w);
        // ludzie z drużyny w odczycie dla interfejsu, z historią; wydarzenia zarządu mogą już pierwszej doby dołożyć
        // przybysza (zależnie od ziarna i trybu), więc drużyna to początek listy
        const ours = snap.people.slice(0, team.length);
        expect(ours.map((p) => p.name)).toEqual(team.map((o) => osobaDoGry(o).name));
        for (const p of ours) expect(p.story?.length).toBeGreaterThan(0);
        expect(sim.hash()).toMatch(/^[0-9a-f]{8}$/);
      });

  it('pięć osób przy 3–4 łóżkach: bez zarządu każdy przesypia noc (własne, wolne albo cudze łóżko, podłoga)', () => {
    for (const mode of MODES) {
      const w = world('przymorze');
      const st = createSim(w, 11, { team: losujDruzyne(mulberry(5), 5), mode });
      const sim = new Sim(w, st);
      const asleep = new Map<number, number>();
      // od 15:00 do 6:00 rano
      while (st.tick < TICKS_PER_DAY - 9 * TICKS_PER_HOUR) {
        sim.step();
        const h = hourOf(st.tick);
        if (h < 22 && h >= 6) continue;
        for (const p of st.pawns)
          if (p.kind === 'core' && p.job?.t === 'sleep' && p.job.phase === 1)
            asleep.set(p.id, (asleep.get(p.id) ?? 0) + 1);
      }
      const core = st.pawns.filter((p) => p.kind === 'core');
      expect(core).toHaveLength(5);
      for (const p of core)
        expect((asleep.get(p.id) ?? 0) / TICKS_PER_HOUR, `${mode}: pionek ${p.id}`).toBeGreaterThan(5);
    }
  });

  it('złe dane z drużyny: osoba zostaje z losowania z adresu, w konsoli ostrzeżenie, dobre osoby wchodzą', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = world('lanciego');
    const team = losujDruzyne(mulberry(8), 5);
    const bad: unknown[] = [
      { ...team[0], skills: { ...team[0].skills, med: 4 } },
      { ...team[1], traits: ['twardy', 'pracowity'] },
      { ...team[2], age: 200 },
      null,
      team[4],
    ];
    const st = createSim(w, 7, { team: bad as OsobaDruzyny[] });
    const ref = createSim(w, 7, { core: 5 });
    for (const k of [0, 1, 2, 3]) expect(st.people[k]).toEqual(ref.people[k]);
    expect(st.people[4].name).toBe(osobaDoGry(team[4]).name);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(String(warn.mock.calls[0][0])).toContain('zostaje z losowania z adresu');
  });

  it('najwyżej 5 osób: nadmiar odpada z ostrzeżeniem', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const team = [...losujDruzyne(mulberry(2), 5), ...losujDruzyne(mulberry(3), 2)];
    const st = createSim(world('przymorze'), 7, { team });
    expect(st.pawns.filter((p) => p.kind === 'core')).toHaveLength(5);
    expect(st.people.slice(0, 5).map((p) => p.name)).toEqual(team.slice(0, 5).map((o) => o.name));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('pusta drużyna to zarząd z adresu', () => {
    const w = world('przymorze');
    expect(createSim(w, 7, { team: [] })).toEqual(createSim(w, 7));
  });

  it('broń ze startu po kolei, a gdy osób mniej niż broni, reszta w magazynie (przy 4 osobach jak dotąd)', () => {
    const w = world('przymorze');
    const arms = (core: number, mode: GameMode) => {
      const st = createSim(w, 7, { core, mode });
      return {
        hands: st.pawns.filter((p) => p.kind === 'core').map((p) => p.weapon ?? null),
        store: st.store.arms,
      };
    };
    expect(arms(1, 'zombie')).toEqual({ hands: ['rewolwer'], store: ['dzida', 'kij', 'dzida', 'lom', 'noz'] });
    expect(arms(3, 'zombie')).toEqual({ hands: ['rewolwer', 'dzida', 'lom'], store: ['dzida', 'kij', 'noz'] });
    expect(arms(4, 'zombie')).toEqual({ hands: ['rewolwer', 'dzida', 'lom', 'noz'], store: ['dzida', 'kij'] });
    expect(arms(5, 'zombie')).toEqual({ hands: ['rewolwer', 'dzida', 'lom', 'noz', null], store: ['dzida', 'kij'] });
    expect(arms(1, 'zwykly')).toEqual({ hands: ['siekiera'], store: ['noz', 'lom'] });
    expect(arms(5, 'zwykly')).toEqual({ hands: ['siekiera', null, null, null, null], store: ['noz', 'lom'] });
  });

  it('historia przechodzi przez zapis (JSON) i jest w odczycie dla interfejsu', () => {
    const w = world('zielonki');
    const team = losujDruzyne(mulberry(12), 3);
    const sim = new Sim(w, createSim(w, 7, { team }));
    for (let k = 0; k < 400; k++) sim.step();
    const back = new Sim(w, JSON.parse(JSON.stringify(sim.st)));
    expect(back.hash()).toBe(sim.hash());
    const people = snapshot(back.st, w).people;
    expect(people.map((p) => p.story)).toEqual(team.map((o) => o.story));
    for (let k = 0; k < 400; k++) {
      sim.step();
      back.step();
    }
    expect(back.hash()).toBe(sim.hash());
  });
});
