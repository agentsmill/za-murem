/* Spotkania z lokatorami sąsiednich budynków (docs/M2-fala-2.md): pukanie i spotkanie w drzwiach, pionki lokatorów,
   wybory i ich skutki (rozmowa, jedzenie, zaproszenie, zabranie zapasów), wrodzy nocą po wyważeniu, zapis w trakcie,
   przerwane spotkanie, tryb zombie (przeżyło co czwarte gospodarstwo). Lokatorów podaje test przez Sim.lokatorzy. */

import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { drzwiBudynku, mieszkaniaZaDrzwiami, nowyBudynek } from '../../src/sim/sasiedzi.ts';
import { Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { at, core, demoWorld, doorWhere, knockHouse, meet, newGame, until, wszyscy } from './sasiedzi-pomoc.ts';

describe('spotkania z lokatorami', () => {
  it('pukanie nocą do domu z życzliwymi: spotkanie w drzwiach, pionki lokatorów, nasza osoba czeka', () => {
    const { sim, p } = knockHouse();
    const sp = sim.st.sasiedzi!.spotkanie;
    expect(sp).not.toBeNull();
    expect(sp!.gdzie).toBe('drzwi');
    expect(sp!.atak).toBe(false);
    const them = sim.st.pawns.filter((q) => q.kind === 'sasiad');
    expect(them).toHaveLength(2);
    expect(them.map((q) => sim.st.people[q.person].name).sort()).toEqual(['Ola00 Nowak', 'Ola01 Nowak']);
    expect(p.job?.t).toBe('meet');
    // czeka, dopóki gracz nie wybierze
    for (let k = 0; k < 400; k++) sim.step();
    expect(p.job?.t).toBe('meet');
    expect(sim.st.sasiedzi!.spotkanie?.nr).toBe(sp!.nr);
  });

  it('nikogo w domu: napis zamiast spotkania', () => {
    const w = demoWorld('zielonki');
    const sim = newGame('zielonki');
    sim.lokatorzy = () => ({ stany: [{ bid: 0, apt: 0, state: 'puste' }], domy: [] });
    const { door } = doorWhere(w, 'zwykly', () => true, ['dom']);
    const p = core(sim)[0];
    sim.push({ t: 'knock', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    expect(sim.st.sasiedzi!.spotkanie).toBeNull();
    expect(sim.st.sasiedzi!.napis?.co).toBe('nikt');
  });

  it('rozmowa: relacja +10, koniec spotkania, lokatorzy wracają do środka', () => {
    const { sim, p } = knockHouse();
    const sp = sim.st.sasiedzi!.spotkanie!;
    const g = sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom];
    const rel = g.rel;
    meet(sim, 'rozmowa');
    expect(g.rel).toBe(rel + 10);
    expect(sim.st.sasiedzi!.napis?.co).toBe('rozmowa');
    expect(sim.st.sasiedzi!.spotkanie).toBeNull();
    expect(sim.st.pawns.some((q) => q.kind === 'sasiad')).toBe(false);
    expect(p.job?.t).not.toBe('meet');
  });

  it('jedzenie: dwie porcje z naszych zapasów, relacja +25, nadzieja', () => {
    const { w, sim } = knockHouse();
    const sp = sim.st.sasiedzi!.spotkanie!;
    const g = sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom];
    const food = snapshot(sim.st, w).stock.supplies;
    const rel = g.rel;
    meet(sim, 'jedzenie');
    expect(snapshot(sim.st, w).stock.supplies).toBe(food - 2);
    expect(g.rel).toBe(rel + 25);
    expect(g.nastroj).toBe('nadzieja');
    expect(sim.st.sasiedzi!.napis?.ile).toEqual({ jedzenie: 2 });
  });

  it('zaproszenie przyjęte: lokatorzy z osobami idą do siedziby jako mieszkańcy, mieszkanie zostaje puste', () => {
    // szansa 95% przy relacji 100: pierwsze ziarno, przy którym się zgodzili
    for (let seed = 1; seed <= 6; seed++) {
      const { sim } = knockHouse(seed);
      const sp = sim.st.sasiedzi!.spotkanie!;
      const b = sim.st.sasiedzi!.budynki[sp.b];
      const g = b.domy[sp.dom];
      g.rel = 100;
      const residents = () => sim.st.pawns.filter((q) => q.kind === 'resident');
      const n0 = residents().length;
      meet(sim, 'zaproszenie');
      if (sim.st.sasiedzi!.napis?.co !== 'zaproszenie_tak') continue;
      expect(g.gdzie).toBe('u_nas');
      expect(b.mieszkania.find((m) => m.apt === g.apt)?.stan).toBe('puste');
      const now = residents();
      expect(now.length).toBe(n0 + 2);
      const names = now.slice(-2).map((q) => sim.st.people[q.person].name);
      expect(names.sort()).toEqual(['Ola00 Nowak', 'Ola01 Nowak']);
      for (const q of now.slice(-2)) expect(q.job?.t).toBe('arrive');
      expect(sim.st.sasiedzi!.spotkanie).toBeNull();
      return;
    }
    throw new Error('żadne ziarno nie dało zgody przy relacji 100');
  });

  it('zabranie zapasów bez oporu: zapasy przy drzwiach, relacja −80, wrogowie, nastrój zarządu spada', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { w, sim, p } = knockHouse(seed);
      const sp = sim.st.sasiedzi!.spotkanie!;
      const g = sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom];
      const theirs = g.zapasy.jedzenie ?? 0;
      const food = snapshot(sim.st, w).stock.supplies;
      p.weapon = 'siekiera';
      meet(sim, 'zabranie');
      if (sim.st.sasiedzi!.napis?.co !== 'zabranie') continue;
      expect(g.rel).toBe(-80);
      expect(g.zamiar).toBe('wrodzy');
      expect(g.zapasy).toEqual({});
      // spotkanie w drzwiach: zapasy leżą przy drzwiach, na ulicy, więc są już nasze
      expect(snapshot(sim.st, w).stock.supplies).toBe(food + theirs);
      expect(p.moods.some((m) => m.why === 'Okradliśmy sąsiadów')).toBe(true);
      return;
    }
    throw new Error('żadne ziarno nie dało zabrania bez oporu');
  });

  it('wrodzy nocą po wyważeniu drzwi mieszkania: atak, a ucieczka odsyła naszą osobę do siedziby', () => {
    const w = demoWorld('lanciego');
    const sim = newGame('lanciego');
    at(sim, 23);
    sim.lokatorzy = wszyscy(w, ['klotliwy', 'odwazny']);
    const { bid, door } = doorWhere(
      w,
      'zwykly',
      (s, id) => mieszkaniaZaDrzwiami(w, id, s.t).size > 0 && drzwiBudynku(w, id).mieszkan.size > 0,
      ['blok'],
    );
    const p = core(sim)[0];
    p.weapon = 'lom';
    sim.push({ t: 'force', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door' && p.job?.t !== 'go');
    const behind = mieszkaniaZaDrzwiami(w, bid, door);
    const [flat] = [...drzwiBudynku(w, bid).mieszkan.entries()].find(([, a]) => behind.has(a))!;
    sim.push({ t: 'force', ids: [p.id], door: flat });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    const sp = sim.st.sasiedzi!.spotkanie!;
    expect(sp).not.toBeNull();
    expect(sp.gdzie).toBe('mieszkanie');
    expect(sp.atak).toBe(true);
    expect(sp.wywazone).toBe(true);
    const g = sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom];
    const rel = g.rel;
    meet(sim, 'ucieczka');
    expect(sim.st.sasiedzi!.spotkanie).toBeNull();
    expect(g.rel).toBe(rel - 10);
    expect(p.job?.t).toBe('go');
  });

  it('zapis i wczytanie w trakcie spotkania: ta sama karta i ten sam dalszy przebieg', () => {
    const { w, sim } = knockHouse();
    const copy = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    expect(copy.hash()).toBe(sim.hash());
    expect(copy.st.sasiedzi!.spotkanie).toEqual(sim.st.sasiedzi!.spotkanie);
    for (const s of [sim, copy]) meet(s, 'rozmowa');
    for (let k = 0; k < TICKS_PER_HOUR; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });

  it('nasza osoba ginie w trakcie spotkania: spotkanie i pionki lokatorów znikają', () => {
    const { sim, p } = knockHouse();
    sim.wound(p, 1000);
    for (let k = 0; k < 40; k++) sim.step();
    expect(sim.st.sasiedzi!.spotkanie).toBeNull();
    expect(sim.st.pawns.some((q) => q.kind === 'sasiad')).toBe(false);
    expect(sim.st.sasiedzi!.napis?.co).toBe('przerwane');
  });
});

describe('spotkania: tryb zombie', () => {
  it('przeżyło mniej więcej co czwarte gospodarstwo, reszta to puste mieszkania z wymarcia', () => {
    const w = demoWorld('przymorze');
    let homes = 0;
    let alive = 0;
    let walkers = 0;
    let dead = 0;
    for (const b of w.buildings) {
      if (b.id === w.hq || b.cls !== 'blok' || !b.entrances.length) continue;
      const lok = wszyscy(w, [], 1)(b.id);
      homes += lok.domy.length;
      const rec = nowyBudynek(w, 'zombie', b.id, lok);
      alive += rec.domy.length;
      for (const m of rec.mieszkania)
        if (m.stan === 'puste' && m.why === 'wymarcie') {
          dead++;
          if (m.zombie) walkers++;
        }
    }
    expect(homes).toBeGreaterThan(40);
    expect(Math.abs(alive / homes - 0.25)).toBeLessThan(0.08);
    expect(dead).toBe(homes - alive);
    expect(Math.abs(walkers / dead - 0.5)).toBeLessThan(0.12);
  });
});
