/* Polecenia ustawień pracy ludzi (prio, stale, zasiatke, prog): działają od następnego kroku przez kolejkę poleceń,
   zapisują w `st.praca` tylko zmiany względem domyślnych, a powrót do domyślnego usuwa wpis aż do zniknięcia pola.
   Złe dane (osoba spoza zarządu, priorytet poza 0–4, nieznany rodzaj albo próg) są ignorowane bez śladu w stanie.
   Ustawienia odeszłej osoby nie przechodzą na nową (indeksy w `st.people` się nie powtarzają), a zapis i wczytanie
   w trakcie gry nie zmieniają dalszego przebiegu. */

import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import {
  domyslnyPriorytet,
  kolejnoscOsoby,
  PROG_MAX,
  PROGI_DOMYSLNE,
  priorytet,
  progi,
  RODZAJE,
  staleZajecie,
  zaSiatke,
} from '../../src/sim/praca.ts';
import { addCore, removeCore, Sim, type SimState } from '../../src/sim/sim.ts';
import { core, demoWorld, newGame } from './sasiedzi-pomoc.ts';

/** wartość inna niż domyślny priorytet rodzaju osoby */
const inny = (sim: Sim, osoba: number, r: (typeof RODZAJE)[number]) => {
  const d = domyslnyPriorytet(sim.st, sim.st.people[osoba], r);
  return d === 4 ? 3 : 4;
};

describe('prio', () => {
  it('polecenie działa od następnego kroku i trafia do st.praca', () => {
    const sim = newGame('przymorze');
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: 4 });
    expect(priorytet(sim.st, 0, 'drwal')).not.toBe(4);
    sim.step();
    expect(priorytet(sim.st, 0, 'drwal')).toBe(4);
    expect(sim.st.praca).toEqual({ osoby: { 0: { prio: { drwal: 4 } } } });
  });

  it('priorytet 0 (nie robi) jest zmianą, a inne osoby zostają przy domyślnych', () => {
    const sim = newGame('przymorze');
    const dom1 = priorytet(sim.st, 1, 'kuchnia');
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'kuchnia', prio: 0 });
    sim.step();
    expect(priorytet(sim.st, 0, 'kuchnia')).toBe(0);
    expect(priorytet(sim.st, 1, 'kuchnia')).toBe(dom1);
    expect(kolejnoscOsoby(sim.st, 0)).not.toContain('kuchnia');
  });

  it('powrót do domyślnego usuwa wpis, a gdy nic nie zostało, st.praca znika i stan ma kształt bez pola', () => {
    const sim = newGame('przymorze');
    const bez = newGame('przymorze');
    expect('praca' in sim.st).toBe(false);
    const dom = domyslnyPriorytet(sim.st, sim.st.people[0], 'drwal');
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: inny(sim, 0, 'drwal') as 3 | 4 });
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'kuchnia', prio: inny(sim, 0, 'kuchnia') as 3 | 4 });
    sim.step();
    bez.step();
    expect(sim.st.praca?.osoby?.[0]?.prio?.drwal).toBeDefined();
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: dom });
    sim.step();
    bez.step();
    // jeden wpis zostaje, drugi zniknął
    expect(Object.keys(sim.st.praca?.osoby?.[0]?.prio ?? {})).toEqual(['kuchnia']);
    sim.push({
      t: 'prio',
      ids: [],
      osoba: 0,
      rodzaj: 'kuchnia',
      prio: domyslnyPriorytet(sim.st, sim.st.people[0], 'kuchnia'),
    });
    sim.step();
    bez.step();
    expect('praca' in sim.st).toBe(false);
    expect(sim.hash()).toBe(bez.hash());
  });

  it('kolejność ustawiania nie zmienia skrótu (stan ma jeden kształt)', () => {
    const a = newGame('przymorze');
    const b = newGame('przymorze');
    const ustaw = (sim: Sim, ile: [number, (typeof RODZAJE)[number]][]) => {
      for (const [osoba, r] of ile)
        sim.push({ t: 'prio', ids: [], osoba, rodzaj: r, prio: inny(sim, osoba, r) as 3 | 4 });
    };
    const lista: [number, (typeof RODZAJE)[number]][] = [
      [2, 'szaber'],
      [0, 'warsztat'],
      [0, 'drwal'],
      [2, 'budowa'],
    ];
    ustaw(a, lista);
    ustaw(b, [...lista].reverse());
    // w trybie zwykłym przełącznik jest domyślnie włączony, więc zmianą gracza jest jawne wyłączenie
    a.push({ t: 'zasiatke', ids: [], osoba: 0, on: false });
    a.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'drwal' });
    b.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'drwal' });
    b.push({ t: 'zasiatke', ids: [], osoba: 0, on: false });
    a.push({ t: 'prog', ids: [], co: 'deski', n: 5 });
    a.push({ t: 'prog', ids: [], co: 'drewno', n: 7 });
    b.push({ t: 'prog', ids: [], co: 'drewno', n: 7 });
    b.push({ t: 'prog', ids: [], co: 'deski', n: 5 });
    a.step();
    b.step();
    expect(a.st.praca?.osoby?.[0]?.zaSiatke).toBe(false);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('stale i zasiatke', () => {
  it('stałe zajęcie ustawia się i zdejmuje poleceniem z null', () => {
    const sim = newGame('przymorze');
    expect(staleZajecie(sim.st, 1)).toBeNull();
    sim.push({ t: 'stale', ids: [], osoba: 1, rodzaj: 'drwal' });
    expect(staleZajecie(sim.st, 1)).toBeNull();
    sim.step();
    expect(staleZajecie(sim.st, 1)).toBe('drwal');
    expect(sim.st.praca).toEqual({ osoby: { 1: { stale: 'drwal' } } });
    sim.push({ t: 'stale', ids: [], osoba: 1, rodzaj: null });
    sim.step();
    expect(staleZajecie(sim.st, 1)).toBeNull();
    expect('praca' in sim.st).toBe(false);
  });

  it('za siatkę w trybie zwykłym: domyślnie włączone, wyłączenie zapisuje jawne false, włączenie z powrotem usuwa wpis', () => {
    const sim = newGame('przymorze');
    expect(zaSiatke(sim.st, 3)).toBe(true);
    sim.push({ t: 'zasiatke', ids: [], osoba: 3, on: false });
    expect(zaSiatke(sim.st, 3)).toBe(true);
    sim.step();
    expect(zaSiatke(sim.st, 3)).toBe(false);
    expect(zaSiatke(sim.st, 2)).toBe(true);
    expect(sim.st.praca).toEqual({ osoby: { 3: { zaSiatke: false } } });
    sim.push({ t: 'zasiatke', ids: [], osoba: 3, on: true });
    sim.step();
    expect(zaSiatke(sim.st, 3)).toBe(true);
    expect('praca' in sim.st).toBe(false);
  });

  it('za siatkę w trybie zombie: domyślnie wyłączone, włączenie zapisuje jawne true, wyłączenie z powrotem usuwa wpis', () => {
    const sim = newGame('przymorze', 'zombie');
    expect(zaSiatke(sim.st, 3)).toBe(false);
    sim.push({ t: 'zasiatke', ids: [], osoba: 3, on: true });
    sim.step();
    expect(zaSiatke(sim.st, 3)).toBe(true);
    expect(zaSiatke(sim.st, 2)).toBe(false);
    expect(sim.st.praca).toEqual({ osoby: { 3: { zaSiatke: true } } });
    sim.push({ t: 'zasiatke', ids: [], osoba: 3, on: false });
    sim.step();
    expect(zaSiatke(sim.st, 3)).toBe(false);
    expect('praca' in sim.st).toBe(false);
  });

  it('ustawienie równe domyślnej trybu nie tworzy pola (zwykły: włączone, zombie: wyłączone)', () => {
    for (const [tryb, on] of [
      ['zwykly', true],
      ['zombie', false],
    ] as const) {
      const sim = newGame('przymorze', tryb);
      const bez = newGame('przymorze', tryb);
      sim.push({ t: 'zasiatke', ids: [], osoba: 0, on });
      sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: null });
      sim.step();
      bez.step();
      expect('praca' in sim.st, tryb).toBe(false);
      expect(sim.hash(), tryb).toBe(bez.hash());
    }
  });

  it('wartość z polecenia jest sprowadzana do true/false (zapis nie trzyma śmieci)', () => {
    const sim = newGame('przymorze');
    sim.push({ t: 'zasiatke', ids: [], osoba: 0, on: 0 as unknown as boolean });
    sim.step();
    expect(sim.st.praca).toEqual({ osoby: { 0: { zaSiatke: false } } });
    sim.push({ t: 'zasiatke', ids: [], osoba: 0, on: 1 as unknown as boolean });
    sim.step();
    expect('praca' in sim.st).toBe(false);
  });

  it('inne ustawienia osoby nie ruszają przełącznika i odwrotnie', () => {
    const sim = newGame('przymorze');
    sim.push({ t: 'zasiatke', ids: [], osoba: 0, on: false });
    sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'drwal' });
    sim.step();
    expect(sim.st.praca).toEqual({ osoby: { 0: { stale: 'drwal', zaSiatke: false } } });
    sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: null });
    sim.step();
    expect(sim.st.praca).toEqual({ osoby: { 0: { zaSiatke: false } } });
    sim.push({ t: 'zasiatke', ids: [], osoba: 0, on: true });
    sim.step();
    expect('praca' in sim.st).toBe(false);
  });

  it('stałe zajęcie jest osobą: dwie osoby mają osobne wpisy', () => {
    const sim = newGame('przymorze');
    sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'kuchnia' });
    sim.push({ t: 'stale', ids: [], osoba: 2, rodzaj: 'budowa' });
    sim.step();
    expect(staleZajecie(sim.st, 0)).toBe('kuchnia');
    expect(staleZajecie(sim.st, 1)).toBeNull();
    expect(staleZajecie(sim.st, 2)).toBe('budowa');
  });
});

describe('prog', () => {
  it('obcięty do całkowitych 0–999', () => {
    const sim = newGame('przymorze');
    const set = (n: number) => {
      sim.push({ t: 'prog', ids: [], co: 'drewno', n });
      sim.step();
    };
    set(1500);
    expect(PROG_MAX).toBe(999);
    expect(progi(sim.st).drewno).toBe(PROG_MAX);
    set(-5);
    expect(progi(sim.st).drewno).toBe(0);
    set(12.9);
    expect(progi(sim.st).drewno).toBe(12);
    expect(sim.st.praca).toEqual({ progi: { drewno: 12 } });
  });

  it('próg równy domyślnemu usuwa wpis; pozostałe progi nietknięte', () => {
    const sim = newGame('przymorze');
    sim.push({ t: 'prog', ids: [], co: 'deski', n: 3 });
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 4 });
    sim.step();
    expect(sim.st.praca).toEqual({ progi: { drewno: 4, deski: 3 } });
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: PROGI_DOMYSLNE.drewno });
    sim.push({ t: 'prog', ids: [], co: 'deski', n: 20.7 });
    sim.step();
    expect('praca' in sim.st).toBe(false);
    expect(progi(sim.st)).toEqual(PROGI_DOMYSLNE);
  });

  it('domyślny próg dzid zależy od trybu: w zombie 12 nie zostawia wpisu, a 0 jest zmianą', () => {
    const sim = newGame('przymorze', 'zombie');
    expect(progi(sim.st).dzidy).toBe(12);
    sim.push({ t: 'prog', ids: [], co: 'dzidy', n: 12 });
    sim.step();
    expect('praca' in sim.st).toBe(false);
    sim.push({ t: 'prog', ids: [], co: 'dzidy', n: 0 });
    sim.step();
    expect(sim.st.praca).toEqual({ progi: { dzidy: 0 } });
    expect(progi(sim.st).dzidy).toBe(0);
    sim.push({ t: 'prog', ids: [], co: 'dzidy', n: 12 });
    sim.step();
    expect('praca' in sim.st).toBe(false);

    const zw = newGame('przymorze', 'zwykly');
    zw.push({ t: 'prog', ids: [], co: 'dzidy', n: 0 });
    zw.step();
    expect('praca' in zw.st).toBe(false);
  });
});

describe('złe dane', () => {
  it('osoba spoza st.people albo nie z zarządu: polecenie ignorowane bez śladu w stanie', () => {
    const sim = newGame('przymorze');
    const bez = newGame('przymorze');
    const zle = [-1, 4, 99, 1.5, Number.NaN];
    for (const osoba of zle) {
      sim.push({ t: 'prio', ids: [], osoba, rodzaj: 'drwal', prio: 4 });
      sim.push({ t: 'stale', ids: [], osoba, rodzaj: 'drwal' });
      sim.push({ t: 'zasiatke', ids: [], osoba, on: false });
    }
    sim.step();
    bez.step();
    expect('praca' in sim.st).toBe(false);
    expect(sim.hash()).toBe(bez.hash());
  });

  it('osoba, której pionka nie ma w zarządzie (odeszła), nie przyjmuje ustawień', () => {
    const sim = newGame('przymorze');
    expect(removeCore(sim.st, sim.st.people[1].id, demoWorld('przymorze'))).toBe(true);
    sim.push({ t: 'prio', ids: [], osoba: 1, rodzaj: 'drwal', prio: 4 });
    sim.push({ t: 'stale', ids: [], osoba: 1, rodzaj: 'drwal' });
    sim.push({ t: 'zasiatke', ids: [], osoba: 1, on: false });
    sim.step();
    expect('praca' in sim.st).toBe(false);
  });

  it('priorytet poza 0–4, nieznany rodzaj i nieznany próg: ignorowane', () => {
    const sim = newGame('przymorze');
    for (const prio of [5, -1, 2.5, Number.NaN]) {
      sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: prio as 4 });
    }
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'taniec' as 'drwal', prio: 2 });
    sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'taniec' as 'drwal' });
    sim.push({ t: 'prog', ids: [], co: 'zloto' as 'drewno', n: 5 });
    sim.push({ t: 'prog', ids: [], co: 'toString' as 'drewno', n: 5 });
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: Number.NaN });
    sim.step();
    expect('praca' in sim.st).toBe(false);
  });
});

describe('odeszła osoba', () => {
  it('ustawienia odeszłej osoby nie przechodzą na nową (removeCore, addCore)', () => {
    const sim = newGame('przymorze');
    const w = demoWorld('przymorze');
    const st: SimState = sim.st;
    sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'drwal' });
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'kuchnia', prio: 0 });
    sim.push({ t: 'zasiatke', ids: [], osoba: 0, on: false });
    sim.step();
    expect(staleZajecie(st, 0)).toBe('drwal');
    expect(zaSiatke(st, 0)).toBe(false);
    const ilu = st.people.length;
    expect(removeCore(st, st.people[0].id, w)).toBe(true);
    const nowa = makePerson(mulberry(11), new Set(st.people.map((o) => o.first)), () => 77);
    addCore(st, w, nowa);
    const idx = st.people.length - 1;
    expect(idx).toBe(ilu);
    expect(st.pawns.some((p) => p.kind === 'core' && p.person === idx)).toBe(true);
    expect(staleZajecie(st, idx)).toBeNull();
    // nowa osoba ma domyślny przełącznik trybu (zwykły: włączony), nie wyłączony po poprzedniku
    expect(zaSiatke(st, idx)).toBe(true);
    for (const r of RODZAJE) expect(priorytet(st, idx, r)).toBe(domyslnyPriorytet(st, nowa, r));
    // polecenie dla nowej osoby działa, dla odeszłej nie
    sim.push({ t: 'stale', ids: [], osoba: idx, rodzaj: 'budowa' });
    sim.push({ t: 'stale', ids: [], osoba: 0, rodzaj: 'budowa' });
    sim.step();
    expect(staleZajecie(st, idx)).toBe('budowa');
    expect(staleZajecie(st, 0)).toBe('drwal');
  });
});

describe('zapis i wczytanie', () => {
  const ustawienia = (sim: Sim) => {
    sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: 4 });
    sim.push({ t: 'prio', ids: [], osoba: 2, rodzaj: 'kuchnia', prio: 0 });
    sim.push({ t: 'stale', ids: [], osoba: 1, rodzaj: 'budowa' });
    sim.push({ t: 'zasiatke', ids: [], osoba: 3, on: false });
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 45 });
  };
  const krok = (sim: Sim, n: number) => {
    for (let k = 0; k < n; k++) sim.step();
  };

  it('zapis i wczytanie z ustawieniami dają ten sam skrót co przebieg bez przerwy', () => {
    const w = demoWorld('przymorze');
    const cala = newGame('przymorze');
    ustawienia(cala);
    krok(cala, 3000);

    const polowa = newGame('przymorze');
    ustawienia(polowa);
    krok(polowa, 1500);
    expect(polowa.st.praca).toBeDefined();
    const wczytana = new Sim(w, JSON.parse(JSON.stringify(polowa.st)) as SimState);
    expect(wczytana.hash()).toBe(polowa.hash());
    krok(wczytana, 1500);

    expect(wczytana.hash()).toBe(cala.hash());
    expect(wczytana.st.praca).toEqual(cala.st.praca);
    expect(core(wczytana)).toHaveLength(4);
  });

  it('stary zapis z jawnym `zaSiatke: true`: w trybie zwykłym to domyślna (wpis schodzi przy najbliższej zmianie ustawień), w zombie zostaje', () => {
    const w = demoWorld('przymorze');
    for (const tryb of ['zwykly', 'zombie'] as const) {
      const stary = newGame('przymorze', tryb);
      stary.st.praca = { osoby: { 1: { zaSiatke: true }, 2: { stale: 'drwal', zaSiatke: true } } };
      const wczytana = new Sim(w, JSON.parse(JSON.stringify(stary.st)) as SimState);
      // wczytanie nie zmienia znaczenia zapisu
      expect(zaSiatke(wczytana.st, 1), tryb).toBe(true);
      expect(zaSiatke(wczytana.st, 2), tryb).toBe(true);
      expect(zaSiatke(wczytana.st, 0), tryb).toBe(tryb === 'zwykly');
      krok(wczytana, 200);
      expect(zaSiatke(wczytana.st, 1), tryb).toBe(true);
      // dowolne polecenie ustawień układa stan na nowo
      wczytana.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: 4 });
      wczytana.step();
      expect(zaSiatke(wczytana.st, 1), tryb).toBe(true);
      expect(zaSiatke(wczytana.st, 2), tryb).toBe(true);
      if (tryb === 'zwykly') {
        expect(wczytana.st.praca?.osoby?.[1], tryb).toBeUndefined();
        expect(wczytana.st.praca?.osoby?.[2], tryb).toEqual({ stale: 'drwal' });
      } else {
        expect(wczytana.st.praca?.osoby?.[1], tryb).toEqual({ zaSiatke: true });
        expect(wczytana.st.praca?.osoby?.[2], tryb).toEqual({ stale: 'drwal', zaSiatke: true });
      }
    }
  });
});
