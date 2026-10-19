/* Moduł pracy (src/sim/praca.ts): domyślne priorytety z umiejętności, kolejność rodzajów osoby, progi zapasów,
   tempo z umiejętności i bramka pierwszego dnia. Funkcje są czyste, więc test sprawdza je na stanie z createSim
   z ręcznie ustawionym ticku i samouczkiem; nic z tego nie może zostawić śladu w stanie, kiedy tylko czyta. */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Person } from '../../src/content/people.ts';
import { dayOf, hourOf } from '../../src/sim/clock.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import {
  automatRusza,
  DZIDY_ZOMBIE,
  domyslnyPriorytet,
  kolejnoscOsoby,
  NOWE,
  PROGI_DOMYSLNE,
  priorytet,
  progi,
  RODZAJE,
  staleZajecie,
  TEMPO_KROK,
  tempoPoziomu,
  tempoPracy,
  WPISY,
  ZARZAD_MAX,
  zaSiatke,
} from '../../src/sim/praca.ts';
import { createSim, type Pawn, type SimState } from '../../src/sim/sim.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

/** osoba tylko z umiejętnościami (reszta pól nie gra roli w module pracy) */
const osoba = (skills: Person['skills']): Person => ({ skills, traits: [] }) as unknown as Person;

const RANO_2 = tickAt(2, 6);
const RANO_3 = tickAt(3, 6);

let st: SimState;
beforeEach(() => {
  st = createSim(demoWorld('przymorze'), 5, { core: 4 });
});

/** pionek rdzenia o danym indeksie osoby; osoba dostaje podane umiejętności */
function rdzen(skills: Person['skills'], idx = 0): Pawn {
  st.people[idx].skills = skills;
  return st.pawns.find((p) => p.kind === 'core' && p.person === idx)!;
}

/** stan po samouczku, dzień 2, 6:00: automat ruszył */
function poPierwszymRanku(): void {
  st.tut.step = TUT_STEPS.length;
  st.tick = RANO_2;
}

describe('rodzaje i stałe', () => {
  it('dziewięć rodzajów w kolejności kolumn, nowe są sześć', () => {
    expect(RODZAJE).toEqual([
      'ogien',
      'kuchnia',
      'budowa',
      'naprawy',
      'drwal',
      'noszenie',
      'warsztat',
      'szaber',
      'badania',
    ]);
    expect([...NOWE].sort()).toEqual(['badania', 'drwal', 'naprawy', 'noszenie', 'szaber', 'warsztat']);
    expect(Object.keys(WPISY).sort()).toEqual([...RODZAJE].sort());
  });

  it('stałe z projektu', () => {
    expect(PROGI_DOMYSLNE).toEqual({ drewno: 30, deski: 20, czesci: 10, dzidy: 0 });
    expect(DZIDY_ZOMBIE).toBe(12);
    expect(ZARZAD_MAX).toBe(12);
    expect(TEMPO_KROK).toBe(0.1);
  });

  it('wpis badań: umiejętność 0, niewidoczny, bez znajdz (kontrakt z gałęzią badania)', () => {
    expect(WPISY.badania.umiejetnosc(st, osoba({ cieplo: 4, it: 4 }))).toBe(0);
    expect(WPISY.badania.widoczny(st)).toBe(false);
    expect(WPISY.badania.znajdz).toBeUndefined();
    for (const r of RODZAJE) if (r !== 'badania') expect(WPISY[r].widoczny(st)).toBe(true);
  });
});

describe('domyślne priorytety', () => {
  it('z umiejętności: 3–4 daje 1, 1–2 daje 2, brak daje 3', () => {
    const o = osoba({ cieplo: 3, bud: 1 });
    expect(domyslnyPriorytet(st, o, 'ogien')).toBe(1);
    expect(domyslnyPriorytet(st, o, 'drwal')).toBe(1); // cieplo 3
    expect(domyslnyPriorytet(st, o, 'budowa')).toBe(2); // bud 1
    expect(domyslnyPriorytet(st, o, 'naprawy')).toBe(2); // bud 1
    expect(domyslnyPriorytet(st, o, 'kuchnia')).toBe(3); // bez uprawa
    expect(domyslnyPriorytet(st, o, 'noszenie')).toBe(3);
    expect(domyslnyPriorytet(st, o, 'szaber')).toBe(3);
    expect(domyslnyPriorytet(st, o, 'badania')).toBe(0); // niewidoczne
  });

  it('granice poziomów: 0 to brak, 2 to jeszcze 2, 4 to 1', () => {
    expect(domyslnyPriorytet(st, osoba({ uprawa: 0 }), 'kuchnia')).toBe(3);
    expect(domyslnyPriorytet(st, osoba({ uprawa: 2 }), 'kuchnia')).toBe(2);
    expect(domyslnyPriorytet(st, osoba({ uprawa: 4 }), 'kuchnia')).toBe(1);
  });

  it('ogień 1 dla każdego, także bez umiejętności', () => {
    expect(domyslnyPriorytet(st, osoba({}), 'ogien')).toBe(1);
    expect(domyslnyPriorytet(st, osoba({ cieplo: 1 }), 'ogien')).toBe(1);
  });

  it('warsztat liczy wyższą z elek i it', () => {
    expect(domyslnyPriorytet(st, osoba({ elek: 1, it: 4 }), 'warsztat')).toBe(1);
    expect(domyslnyPriorytet(st, osoba({ elek: 4, it: 1 }), 'warsztat')).toBe(1);
    expect(domyslnyPriorytet(st, osoba({ elek: 1, it: 2 }), 'warsztat')).toBe(2);
    expect(domyslnyPriorytet(st, osoba({ med: 4 }), 'warsztat')).toBe(3);
  });

  it('priorytet(): zmiana gracza wygrywa z domyślnym, osoba spoza listy to 0', () => {
    st.people[0].skills = { cieplo: 3 };
    expect(priorytet(st, 0, 'drwal')).toBe(1);
    st.praca = { osoby: { 0: { prio: { drwal: 4, kuchnia: 0 } } } };
    expect(priorytet(st, 0, 'drwal')).toBe(4);
    expect(priorytet(st, 0, 'kuchnia')).toBe(0);
    expect(priorytet(st, 0, 'ogien')).toBe(1); // bez zmiany: domyślny
    expect(priorytet(st, 1, 'drwal')).toBe(domyslnyPriorytet(st, st.people[1], 'drwal')); // inna osoba: domyślny
    expect(priorytet(st, 99, 'ogien')).toBe(0);
  });
});

describe('kolejność osoby', () => {
  it('stałe zajęcie, potem 1→4, remis po kolumnach, bez zer', () => {
    st.people[0].skills = {};
    st.praca = { osoby: { 0: { prio: { kuchnia: 1, ogien: 2, budowa: 0 }, stale: 'szaber' } } };
    const k = kolejnoscOsoby(st, 0);
    expect(k.slice(0, 3)).toEqual(['szaber', 'kuchnia', 'ogien']);
    expect(k).not.toContain('budowa');
    expect(k).not.toContain('badania');
    expect(k).toEqual(['szaber', 'kuchnia', 'ogien', 'naprawy', 'drwal', 'noszenie', 'warsztat']);
  });

  it('bez ustawień: ogień 1 pierwszy, remis po kolumnach', () => {
    st.people[0].skills = { bud: 4, cieplo: 4 };
    // ogien 1, budowa 1, naprawy 1, drwal 1; kuchnia, noszenie, warsztat, szaber 3
    expect(kolejnoscOsoby(st, 0)).toEqual([
      'ogien',
      'budowa',
      'naprawy',
      'drwal',
      'kuchnia',
      'noszenie',
      'warsztat',
      'szaber',
    ]);
  });

  it('stałe zajęcie jest pierwsze nawet przy priorytecie 0 i nie powtarza się dalej', () => {
    st.people[0].skills = {};
    st.praca = { osoby: { 0: { prio: { drwal: 0 }, stale: 'drwal' } } };
    const k = kolejnoscOsoby(st, 0);
    expect(k[0]).toBe('drwal');
    expect(k.filter((r) => r === 'drwal')).toHaveLength(1);
    st.praca = { osoby: { 0: { prio: { ogien: 1 }, stale: 'ogien' } } };
    const k2 = kolejnoscOsoby(st, 0);
    expect(k2[0]).toBe('ogien');
    expect(k2.filter((r) => r === 'ogien')).toHaveLength(1);
  });

  it('niewidoczny rodzaj odpada, także jako stałe zajęcie albo z priorytetem gracza', () => {
    st.people[0].skills = {};
    st.praca = { osoby: { 0: { prio: { badania: 1 }, stale: 'badania' } } };
    expect(kolejnoscOsoby(st, 0)).not.toContain('badania');
  });

  it('osoba spoza listy: pusta kolejność', () => {
    expect(kolejnoscOsoby(st, 99)).toEqual([]);
  });
});

describe('stary stan bez st.praca', () => {
  it('domyślne ustawienia, progi domyślne i nic nie powstaje w stanie', () => {
    const p = rdzen({ cieplo: 3 });
    poPierwszymRanku();
    expect('praca' in st).toBe(false);
    const przed = JSON.stringify(st);
    for (let i = 0; i < st.people.length; i++) {
      for (const r of RODZAJE) priorytet(st, i, r);
      expect(staleZajecie(st, i)).toBeNull();
      expect(zaSiatke(st, i)).toBe(false);
      expect(kolejnoscOsoby(st, i).length).toBeGreaterThan(0);
    }
    expect(progi(st)).toEqual({ drewno: 30, deski: 20, czesci: 10, dzidy: 0 });
    for (const r of RODZAJE) tempoPracy(st, p, r);
    automatRusza(st);
    expect(JSON.stringify(st)).toBe(przed);
    expect('praca' in st).toBe(false);
  });

  it('progi i ustawienia z pustego st.praca to też domyślne', () => {
    st.praca = {};
    expect(progi(st)).toEqual(PROGI_DOMYSLNE);
    expect(staleZajecie(st, 0)).toBeNull();
    expect(zaSiatke(st, 0)).toBe(false);
    st.praca = { osoby: { 2: { zaSiatke: true } } };
    expect(zaSiatke(st, 2)).toBe(true);
    expect(zaSiatke(st, 0)).toBe(false);
  });
});

describe('progi', () => {
  it('zombie ma dzidy 12, zwykły 0, reszta ta sama', () => {
    expect(progi(st)).toEqual({ drewno: 30, deski: 20, czesci: 10, dzidy: 0 });
    st.mode = 'zombie';
    expect(progi(st)).toEqual({ drewno: 30, deski: 20, czesci: 10, dzidy: 12 });
  });

  it('nadpisanie z st.praca.progi po kluczu, także zerem', () => {
    st.praca = { progi: { drewno: 50, dzidy: 3 } };
    expect(progi(st)).toEqual({ drewno: 50, deski: 20, czesci: 10, dzidy: 3 });
    st.mode = 'zombie';
    expect(progi(st).dzidy).toBe(3); // gracz wygrywa z domyślnym trybu
    st.praca = { progi: { dzidy: 0, deski: 0 } };
    expect(progi(st)).toEqual({ drewno: 30, deski: 0, czesci: 10, dzidy: 0 });
  });

  it('wynik to nowy obiekt: zmiana go nie rusza PROGI_DOMYSLNE ani stanu', () => {
    st.praca = { progi: { drewno: 7 } };
    const p = progi(st);
    p.drewno = 999;
    p.deski = 999;
    expect(PROGI_DOMYSLNE).toEqual({ drewno: 30, deski: 20, czesci: 10, dzidy: 0 });
    expect(st.praca.progi).toEqual({ drewno: 7 });
  });
});

describe('tempo', () => {
  it('krzywa: 1 + 0,1 · poziom', () => {
    expect(tempoPoziomu(0)).toBe(1);
    expect(tempoPoziomu(2)).toBeCloseTo(1.2, 10);
    expect(tempoPoziomu(4)).toBeCloseTo(1.4, 10);
  });

  it('1 przed pierwszym rankiem, potem 1 + 0,1 · poziom', () => {
    const p = rdzen({ cieplo: 4, bud: 2, uprawa: 3, elek: 1, it: 3 });
    st.tut.step = TUT_STEPS.length;
    st.tick = RANO_2 - 1; // dzień 2, tuż przed 6:00
    expect(tempoPracy(st, p, 'drwal')).toBe(1);
    st.tick = 0; // dzień 1
    expect(tempoPracy(st, p, 'drwal')).toBe(1);
    st.tick = RANO_2;
    expect(tempoPracy(st, p, 'drwal')).toBeCloseTo(1.4, 10);
    expect(tempoPracy(st, p, 'budowa')).toBeCloseTo(1.2, 10);
    expect(tempoPracy(st, p, 'naprawy')).toBeCloseTo(1.2, 10);
    expect(tempoPracy(st, p, 'kuchnia')).toBeCloseTo(1.3, 10);
    expect(tempoPracy(st, p, 'warsztat')).toBeCloseTo(1.3, 10); // wyższa z elek 1 i it 3
  });

  it('noszenie, szaber i dokładanie do ognia bez przyspieszenia, także po bramce', () => {
    const p = rdzen({ cieplo: 4, bud: 4 });
    poPierwszymRanku();
    expect(tempoPracy(st, p, 'noszenie')).toBe(1);
    expect(tempoPracy(st, p, 'szaber')).toBe(1);
    // ogień ma umiejętność cieplo tylko do domyślnych priorytetów: dokładanie i noszenie drewna nie przyspieszają
    expect(tempoPracy(st, p, 'ogien')).toBe(1);
    expect(tempoPracy(st, p, 'badania')).toBe(1); // niewidoczny wpis, umiejętność 0
  });

  it('bez osoby (pionek spoza zarządu) zawsze 1', () => {
    poPierwszymRanku();
    const obcy = { ...rdzen({ cieplo: 4 }), person: -1 } as Pawn;
    expect(tempoPracy(st, obcy, 'drwal')).toBe(1);
    const dziwny = { ...obcy, person: 99 } as Pawn;
    expect(tempoPracy(st, dziwny, 'drwal')).toBe(1);
  });

  it('nowa osoba bez umiejętności: tempo 1 także po bramce', () => {
    const p = rdzen({});
    poPierwszymRanku();
    for (const r of RODZAJE) expect(tempoPracy(st, p, r)).toBe(1);
  });
});

describe('bramka pierwszego dnia', () => {
  it('pomocnik tickAt zgadza się z zegarem gry', () => {
    expect(dayOf(RANO_2)).toBe(2);
    expect(hourOf(RANO_2)).toBe(6);
    expect(dayOf(RANO_3)).toBe(3);
    expect(hourOf(RANO_3)).toBe(6);
  });

  it('dzień 2, 6:00, po samouczku', () => {
    st.tut.step = TUT_STEPS.length;
    st.tick = RANO_2 - 1;
    expect(automatRusza(st)).toBe(false);
    st.tick = RANO_2;
    expect(automatRusza(st)).toBe(true);
    st.tick = tickAt(2, 23);
    expect(automatRusza(st)).toBe(true);
  });

  it('samouczek wyłączony (-1) liczy się jak skończony', () => {
    st.tut.step = -1;
    st.tick = RANO_2 - 1;
    expect(automatRusza(st)).toBe(false);
    st.tick = RANO_2;
    expect(automatRusza(st)).toBe(true);
  });

  it('samouczek w toku: czeka do dnia 3, 6:00, potem rusza bez względu na samouczek', () => {
    st.tut.step = 2;
    st.tick = RANO_2;
    expect(automatRusza(st)).toBe(false);
    st.tick = tickAt(3, 5.99);
    expect(automatRusza(st)).toBe(false);
    st.tick = RANO_3;
    expect(automatRusza(st)).toBe(true);
    st.tick = tickAt(10, 12);
    expect(automatRusza(st)).toBe(true);
  });

  it('pierwszy dzień gry: nigdy, nawet ze skończonym samouczkiem', () => {
    st.tut.step = TUT_STEPS.length;
    for (const h of [15, 20, 23.9]) {
      st.tick = tickAt(1, h);
      expect(automatRusza(st)).toBe(false);
    }
    st.tick = tickAt(2, 0);
    expect(automatRusza(st)).toBe(false);
  });
});
