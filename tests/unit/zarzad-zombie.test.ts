/* Zarząd w trybie zombie i broń w zarządzie (oba tryby): karta nocy z prognozą stada, posterunek przy siatce,
   wartość warty z bronią, ugryzienia i znaleziska z wypraw, zgony w raporcie, koniec gry „pustką”. */

import { describe, expect, it } from 'vitest';
import { guardValue, weaponFactor } from '../../src/gov/noc.ts';
import type { GovEffects, GovInput, GovState, NightCard } from '../../src/gov/typy.ts';
import { podmienLancuchy } from '../../src/gov/watki.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { chooseEvent, confirmNight, govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { applyGov } from '../../src/sim/gov.ts';
import { createSim } from '../../src/sim/sim.ts';
import { Atrapa, at, run, TPH, TPS } from './gov-atrapa.ts';
import { mockBlock } from './interior-mock.ts';
import { pl } from './po-angielsku.ts';

// Łańcuchy historii (src/gov/watki-tresc.ts) dokładają pierwsze kroki do puli kart i losują wątki z ziarna zarządu. Ten plik
// sprawdza coś innego i gra na samej puli, więc łańcuchów w nim nie ma (ich testy: watki-tresc*.test.ts).
podmienLancuchy([]);

const HORDE = { near: 3, pressing: 1, killed: 0, breaches: 0, bites: 0, tonight: 8 };

/** gra na atrapie do minuty gry until: karta zatwierdzana z propozycją, uchwały pomijane, wydarzenia
    odpowiadane pierwszą dozwoloną odpowiedzią, raport przyjmowany; wszystkie skutki i karty zebrane */
function play(gov: GovState, atr: Atrapa, until: number, extra: (i: GovInput) => Partial<GovInput> = () => ({})) {
  const fxs: GovEffects[] = [];
  const cards: NightCard[] = [];
  const input = (): GovInput => {
    const i = atr.input();
    return { ...i, ...extra(i) };
  };
  const take = (fx: GovEffects) => {
    atr.apply(fx);
    fxs.push(fx);
  };
  while ((atr.day - 1) * 1440 + atr.hour * 60 + atr.minute < until) {
    atr.tick++;
    if (atr.tick % TPH === 0) atr.hourly(1);
    if (atr.tick % TPS !== 0) continue;
    take(govUpdate(gov, input()));
    if (gov.over) break;
    const p = pending(gov, input());
    if (p?.k === 'karta') {
      cards.push(p.card);
      take(confirmNight(gov, input()));
    } else if (p?.k === 'uchwala') take(signLaw(gov, input(), null));
    else if (p?.k === 'wydarzenie')
      take(
        chooseEvent(
          gov,
          input(),
          p.choices.findIndex((c) => c.ok),
        ),
      );
    else if (p?.k === 'raport') gov.report = null;
  }
  return { fxs, cards };
}

describe('zarząd w trybie zombie', () => {
  it('karta nocy: prognoza stada zamiast napadu, posterunek przy siatce, bez szabrowników', () => {
    const gov = newGov(5, 'zombie');
    expect(gov.mode).toBe('zombie');
    const atr = new Atrapa(5);
    const { fxs, cards } = play(gov, atr, at(2, 7), () => ({ horde: HORDE }));
    const card = cards[0];
    expect(card.horde).toEqual({ size: 8, word: { pl: 'małe', en: 'small' }, fence: 0.55 });
    expect(pl(card.forecast)).toMatch(/stado/i);
    expect(pl(card.forecast)).not.toMatch(/szabrown/i);
    expect(card.posts[0].key).toBe('siatka');
    expect(card.people[0].options.some((o) => o.key === 'warta:siatka')).toBe(true);
    expect(fxs.every((fx) => fx.raid === null && !fx.raidResult)).toBe(true);
    expect(gov.reports[0].raid).toBe('brak');
    expect(gov.reports[0].lines.join(' ')).not.toMatch(/szabrown|próbował wejść/i);
  });

  it('w zwykłym trybie plan napadu pierwszej nocy jest taki jak przed trybem zombie', () => {
    // wzorzec zwykłego trybu po M2 (sama gałąź m2-razem, bez trybu zombie, daje te same liczby, 18.10.2026)
    const before = [
      [1, false, 1608, 'd1', 0],
      [2, true, 1596, 'brama', 2.3],
      [3, false, 1594, 'd1', 0],
      [4, false, 1509, 'd2', 0],
      [5, true, 1558, 'd2', 3.9],
      [6, false, 1424, 'd3', 0],
      [7, false, 1502, 'd1', 0],
      [8, true, 1508, 'd2', 4.1],
    ];
    for (const [seed, come, atMin, post, attack] of before) {
      const { gov } = run(seed as number, 'zawsze-warta', at(1, 22, 30));
      const r = gov.night!.raid!;
      expect([r.come, r.at, r.post, r.attack], `ziarno ${seed}`).toEqual([come, atMin, post, attack]);
      expect(gov.mode).toBe('zwykly');
    }
  });

  it('broń w warcie: gołe ręce × 1, wręcz × 1,25, dzida × 1,4, broń palna z amunicją × 1,5', () => {
    const gov = newGov(1);
    const i = new Atrapa(1).input();
    const p = { ...i.people[0], skills: {}, traits: [], needs: { ...i.people[0].needs, rest: 80, health: 100 } };
    const v = (arm: 'brak' | 'wrecz' | 'dzida' | 'palna') => guardValue(gov, i, { ...p, arm }, 'd1');
    expect(v('brak')).toBe(2.5);
    expect(v('wrecz')).toBe(3.1);
    expect(v('dzida')).toBe(3.5);
    expect(v('palna')).toBe(3.8);
    expect(weaponFactor({ ...p, arm: 'dzida' })).toBe(1.4);
  });

  it('wyprawy w trybie zombie: kłopoty to czasem ugryzienie, a znaleziska to broń i amunicja', () => {
    let bitten = 0;
    let finds = 0;
    // ugryzienie to ok. 5% wypraw (kłopot × co trzeci), więc ziaren musi być sporo; zmiana puli wydarzeń przesuwa
    // losowanie zarządu i ugryzienia wypadają na innych ziarnach (przy 30 ziarnach bywało jedno albo żadne)
    for (let seed = 1; seed <= 60; seed++) {
      const gov = newGov(seed, 'zombie');
      const atr = new Atrapa(seed);
      // zapasy na wykończeniu: zarząd proponuje wyprawy
      atr.supplies = 2;
      const { fxs } = play(gov, atr, at(4, 7), () => ({ horde: HORDE }));
      for (const fx of fxs) {
        bitten += fx.bitten?.length ?? 0;
        finds += (fx.arms?.length ?? 0) + Object.values(fx.ammo ?? {}).reduce((a, b) => a + b, 0);
      }
      const lines = gov.reports.flatMap((r) => r.lines.map(pl)).join(' ');
      if (fxs.some((fx) => fx.bitten?.length)) expect(lines).toMatch(/ugryzion/);
    }
    expect(bitten).toBeGreaterThan(0);
    expect(finds).toBeGreaterThan(0);
  });

  it('w zwykłym trybie nikt nie wraca ugryziony', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const atr = new Atrapa(seed);
      atr.supplies = 2;
      const { fxs } = play(newGov(seed), atr, at(4, 7));
      expect(fxs.every((fx) => !fx.bitten?.length)).toBe(true);
    }
  });

  it('zgon kogoś z zarządu: raz w kronice, zaufanie −5 i wkurzenie +8', () => {
    const gov = newGov(2, 'zombie');
    const atr = new Atrapa(2);
    play(gov, atr, at(1, 16));
    const [dead, ...rest] = atr.people;
    atr.people = rest;
    const t0 = gov.trust;
    const a0 = gov.anger;
    const extra = () => ({ dead: [{ id: dead.id, name: dead.name, cause: 'gorączka', tick: atr.tick }] });
    play(gov, atr, at(1, 16, 2), extra);
    expect(gov.trust).toBe(t0 - 5);
    expect(gov.anger).toBe(a0 + 8);
    expect(gov.log.filter((l) => pl(l.txt).includes(dead.name) && /nie żyje/.test(pl(l.txt)))).toHaveLength(1);
    play(gov, atr, at(1, 16, 5), extra);
    expect(gov.trust).toBe(t0 - 5);
  });

  it('śmierć ostatniej osoby z zarządu w nocy kończy grę „pustką” bez wyjątku', () => {
    const gov = newGov(3, 'zombie');
    const atr = new Atrapa(3);
    play(gov, atr, at(1, 20, 30), () => ({ horde: HORDE }));
    const dead = atr.people.map((p) => ({ id: p.id, name: p.name, cause: 'rany', tick: atr.tick }));
    atr.people = [];
    expect(() => play(gov, atr, at(1, 23), () => ({ horde: HORDE, dead }))).not.toThrow();
    expect(gov.over).toBe('pustka');
  });

  it('skutki w symulacji: znaleziona broń i amunicja do magazynu, ugryziony z wyprawy zakażony', () => {
    const w = mockBlock();
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    const p = st.pawns.find((x) => x.kind === 'core')!;
    const fx = { ...emptyEffects(), arms: ['strzelba'], ammo: { loftki: 6 }, bitten: [st.people[p.person].id] };
    applyGov(st, w, fx);
    expect(st.store.arms).toContain('strzelba');
    expect(st.store.ammo!.loftki).toBe(6);
    expect(p.bite).toBe(st.tick);
  });
});
