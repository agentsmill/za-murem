/* Narrator (Task 16, docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 5): krzywa napięcia w src/gov/narrator.ts.
   Przyrosty (zgon +25, napad +20, wtargnięcie +30, rana +10, siatka +15, głód +5 na godzinę), spadek 2 na godzinę gry,
   mnożniki wag kart z tagiem `ton`, każde zdarzenie liczone raz (też po zapisie i wczytaniu), stary zapis bez `napiecie`,
   wpływ na losowanie kart i na haczyki gości. */

import { afterEach, describe, expect, it } from 'vitest';
import { mnoznik, napiecie, ostrzej, SPOKOJ_DOBA } from '../../src/gov/narrator.ts';
import type { GEventDef } from '../../src/gov/tresc.ts';
import type { GovInput, GovPerson, GovState, NightReport } from '../../src/gov/typy.ts';
import { krokPoId, podmienLancuchy } from '../../src/gov/watki.ts';
import { planujGoscia } from '../../src/gov/wizyta.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { Atrapa } from './gov-atrapa.ts';

afterEach(() => podmienLancuchy(null));

/** wejście na atrapie w danej chwili gry; `over` nadpisuje pola */
function wejscie(dzien: number, godzina: number, minuta = 0, over: Partial<GovInput> = {}): GovInput {
  const i = new Atrapa(3).input();
  return {
    ...i,
    day: dzien,
    hour: godzina,
    minute: minuta,
    screen: gameMin({ day: dzien, hour: godzina, minute: minuta }),
    ...over,
  };
}

const zgon = (k: number) => ({ id: `z${k}`, name: `Zmarły ${k}`, cause: 'rany', tick: k });
const raport = (day: number, raid: NightReport['raid']): NightReport => ({
  day,
  lines: [],
  raid,
  stolen: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
  loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
  hurt: [],
  tired: [],
  trust: 50,
  anger: 20,
  dTrust: 0,
  dAnger: 0,
});
/** osoby atrapy z podmienionymi potrzebami */
const ludzie = (i: GovInput, f: (p: GovPerson, k: number) => Partial<GovPerson['needs']>): GovPerson[] =>
  i.people.map((p, k) => ({ ...p, needs: { ...p.needs, ...f(p, k) } }));

/** stan zarządu z napięciem ustawionym ręcznie (bez liczników zdarzeń) */
function zNapieciem(v: number, spokoj = 0, t = 0): GovState {
  const st = newGov(1);
  st.napiecie = { v, t, spokoj };
  return st;
}

/** stan po pierwszym kroku narratora (liczniki ustawione na teraźniejszość) */
function zeStartem(i: GovInput): GovState {
  const st = newGov(1);
  napiecie(st, i);
  return st;
}

describe('narrator: krzywa napięcia', () => {
  it('bez kroku narratora nie ma stanu, a mnożnik to 1', () => {
    const st = newGov(1);
    expect(st.napiecie).toBeUndefined();
    expect(mnoznik(st, 'ostre')).toBe(1);
    expect(mnoznik(st, 'lagodne')).toBe(1);
    expect(mnoznik(st, undefined)).toBe(1);
    expect(ostrzej(st)).toBe(false);
  });

  it('pierwszy krok tworzy stan z zerem, niczego nie dolicza i nie rusza ziarna zarządu', () => {
    const st = newGov(1);
    const rng = { ...st.rng };
    napiecie(st, wejscie(1, 15, 0, { dead: [zgon(1), zgon(2)] }));
    expect(st.napiecie?.v).toBe(0);
    expect(st.napiecie?.spokoj).toBe(0);
    expect(st.rng).toEqual(rng);
  });

  it('zgon podnosi napięcie o 25, każdy raz', () => {
    const i0 = wejscie(2, 10);
    const st = zeStartem(i0);
    napiecie(st, wejscie(2, 10, 0, { dead: [zgon(1)] }));
    expect(st.napiecie?.v).toBe(25);
    // ten sam zgon w następnych krokach nie liczy się drugi raz
    napiecie(st, wejscie(2, 10, 0, { dead: [zgon(1)] }));
    expect(st.napiecie?.v).toBe(25);
    // dwa nowe zgony naraz: 2 × 25
    napiecie(st, wejscie(2, 10, 0, { dead: [zgon(1), zgon(2), zgon(3)] }));
    expect(st.napiecie?.v).toBe(75);
  });

  it('napięcie spada o 2 na godzinę gry, nigdy poniżej zera', () => {
    const st = zNapieciem(50);
    st.napiecie!.zgony = 0;
    napiecie(st, wejscie(1, 3));
    expect(st.napiecie?.v).toBe(44);
    napiecie(st, wejscie(1, 4, 30));
    expect(st.napiecie?.v).toBeCloseTo(41, 6);
    napiecie(st, wejscie(3, 4));
    expect(st.napiecie?.v).toBe(0);
  });

  it('napad z raportu rano: odparty +20, wtargnięcie +30, brak nic; raport liczy się raz', () => {
    const i0 = wejscie(3, 9);
    const st = zeStartem(i0);
    st.reports.push(raport(2, 'brak'));
    napiecie(st, i0);
    expect(st.napiecie?.v).toBe(0);
    st.reports.push(raport(3, 'odparty'));
    napiecie(st, i0);
    expect(st.napiecie?.v).toBe(20);
    napiecie(st, i0);
    expect(st.napiecie?.v).toBe(20);
    st.reports.push(raport(4, 'wtargnięcie'));
    napiecie(st, i0);
    expect(st.napiecie?.v).toBe(50);
    // raport przycięty z początku listy (zarząd trzyma 10) niczego nie psuje
    st.reports.shift();
    napiecie(st, i0);
    expect(st.napiecie?.v).toBe(50);
  });

  it('rana: nagły spadek zdrowia albo świeże ugryzienie, +10 na osobę na krok, raz', () => {
    const i0 = wejscie(2, 9);
    const st = zeStartem(i0);
    // powolny spadek (głód, zimno) rany nie robi
    napiecie(st, { ...i0, people: ludzie(i0, () => ({ health: 95 })) });
    expect(st.napiecie?.v).toBe(0);
    // cios: jedna osoba traci 20 punktów
    napiecie(st, { ...i0, people: ludzie(i0, (_p, k) => ({ health: k === 0 ? 75 : 95 })) });
    expect(st.napiecie?.v).toBe(10);
    // to samo zdrowie w następnym kroku: nic
    napiecie(st, { ...i0, people: ludzie(i0, (_p, k) => ({ health: k === 0 ? 75 : 95 })) });
    expect(st.napiecie?.v).toBe(10);
    // ugryzienie: +10, raz
    const ugryziony = i0.people.map((p, k) => ({
      ...p,
      needs: { ...p.needs, health: k === 0 ? 75 : 95 },
      ...(k === 1 ? { bitten: true } : {}),
    }));
    napiecie(st, { ...i0, people: ugryziony });
    expect(st.napiecie?.v).toBe(20);
    napiecie(st, { ...i0, people: ugryziony });
    expect(st.napiecie?.v).toBe(20);
  });

  it('siatka przerwana w trybie zombie: +15 za każde przerwanie, raz', () => {
    const horda = (breaches: number) => ({ near: 3, pressing: 1, killed: 0, breaches, bites: 0, tonight: 8 });
    const i0 = wejscie(3, 9, 0, { horde: horda(0) });
    const st = zeStartem(i0);
    napiecie(st, { ...i0, horde: horda(1) });
    expect(st.napiecie?.v).toBe(15);
    napiecie(st, { ...i0, horde: horda(1) });
    expect(st.napiecie?.v).toBe(15);
    napiecie(st, { ...i0, horde: horda(3) });
    expect(st.napiecie?.v).toBe(45);
  });

  it('głód zarządu (średnie jedzenie poniżej 30) daje +5 na godzinę, minus spadek 2: netto 3 na godzinę', () => {
    const i0 = wejscie(2, 8);
    const st = zeStartem(i0);
    const glodni = (godz: number) => ({ ...wejscie(2, godz), people: ludzie(i0, () => ({ food: 20 })) });
    napiecie(st, glodni(10));
    expect(st.napiecie?.v).toBe(6);
    // średnia 30 i więcej to nie głód
    napiecie(st, { ...wejscie(2, 11), people: ludzie(i0, () => ({ food: 30 })) });
    expect(st.napiecie?.v).toBe(4);
  });

  it('wynik nie zależy od tego, jak często zarząd się liczy', () => {
    const i0 = wejscie(2, 8);
    const rzadko = zeStartem(i0);
    const czesto = zeStartem(i0);
    const glodni = (godz: number, min = 0) => ({ ...wejscie(2, godz, min), people: ludzie(i0, () => ({ food: 10 })) });
    napiecie(rzadko, glodni(12));
    for (let m = 1; m <= 240; m++) napiecie(czesto, glodni(8 + Math.floor(m / 60), m % 60));
    expect(czesto.napiecie?.v).toBeCloseTo(rzadko.napiecie!.v, 6);
  });

  it('napięcie nie przekracza 100', () => {
    const i0 = wejscie(2, 9);
    const st = zeStartem(i0);
    napiecie(st, { ...i0, dead: [zgon(1), zgon(2), zgon(3), zgon(4), zgon(5)] });
    expect(st.napiecie?.v).toBe(100);
  });

  it('zapis i wczytanie w środku nie liczą zdarzeń drugi raz', () => {
    const i0 = wejscie(3, 9);
    let st = zeStartem(i0);
    st.reports.push(raport(3, 'odparty'));
    const i1 = {
      ...i0,
      dead: [zgon(1)],
      horde: { near: 0, pressing: 0, killed: 0, breaches: 1, bites: 0, tonight: 8 },
    };
    napiecie(st, i1);
    expect(st.napiecie?.v).toBe(20 + 25 + 15);
    st = loadGov(saveGov(st));
    napiecie(st, i1);
    expect(st.napiecie?.v).toBe(60);
    // po wczytaniu nowy zgon znów liczy
    napiecie(st, { ...i1, dead: [zgon(1), zgon(2)] });
    expect(st.napiecie?.v).toBe(85);
  });
});

describe('narrator: mnożnik wag', () => {
  it('przy 70 karta ostra ma wagę ×0,3, łagodna ×2, zwykła ×1', () => {
    const st = zNapieciem(70);
    expect(mnoznik(st, 'ostre')).toBe(0.3);
    expect(mnoznik(st, 'lagodne')).toBe(2);
    expect(mnoznik(st, undefined)).toBe(1);
  });

  it('próg to „powyżej 60”: równo 60 jeszcze nic nie zmienia', () => {
    const st = zNapieciem(60);
    expect(mnoznik(st, 'ostre')).toBe(1);
    expect(mnoznik(st, 'lagodne')).toBe(1);
    st.napiecie!.v = 60.5;
    expect(mnoznik(st, 'ostre')).toBe(0.3);
  });

  it('po dobie spokoju ostra ×2, a łagodna i zwykła bez zmian', () => {
    const st = zNapieciem(5, SPOKOJ_DOBA + 1);
    expect(mnoznik(st, 'ostre')).toBe(2);
    expect(mnoznik(st, 'lagodne')).toBe(1);
    expect(mnoznik(st, undefined)).toBe(1);
    // równo doba to jeszcze nie „ponad dobę”
    st.napiecie!.spokoj = SPOKOJ_DOBA;
    expect(mnoznik(st, 'ostre')).toBe(1);
  });

  it('spokój rośnie w minutach gry, gdy napięcie jest poniżej 20, i zeruje się, gdy dojdzie do 20', () => {
    const i0 = wejscie(1, 15);
    const st = zeStartem(i0);
    napiecie(st, wejscie(2, 14, 59));
    expect(st.napiecie?.spokoj).toBe(23 * 60 + 59);
    expect(mnoznik(st, 'ostre')).toBe(1);
    napiecie(st, wejscie(2, 15, 1));
    expect(st.napiecie?.spokoj).toBe(24 * 60 + 1);
    expect(mnoznik(st, 'ostre')).toBe(2);
    expect(ostrzej(st)).toBe(true);
    // napad zrywa spokój
    st.reports.push(raport(2, 'odparty'));
    napiecie(st, wejscie(2, 15, 1));
    expect(st.napiecie?.v).toBe(20);
    expect(st.napiecie?.spokoj).toBe(0);
    expect(mnoznik(st, 'ostre')).toBe(1);
    expect(ostrzej(st)).toBe(false);
  });

  it('mnożnik niczego nie losuje i niczego nie zmienia w stanie', () => {
    const st = zNapieciem(70);
    const przed = JSON.stringify(st);
    for (const ton of ['ostre', 'lagodne', undefined] as const) mnoznik(st, ton);
    ostrzej(st);
    expect(JSON.stringify(st)).toBe(przed);
  });

  it('stary zapis bez napiecie wczytuje się, działa z mnożnikiem 1 i dostaje stan przy pierwszym kroku', () => {
    const st = newGov(7);
    const json = JSON.parse(saveGov(st)) as Record<string, unknown>;
    delete json.napiecie;
    const stary = loadGov(JSON.stringify(json));
    expect(stary.napiecie).toBeUndefined();
    expect(mnoznik(stary, 'ostre')).toBe(1);
    napiecie(stary, wejscie(1, 16));
    expect(stary.napiecie).toMatchObject({ v: 0 });
    expect(loadGov(saveGov(stary)).napiecie).toEqual(stary.napiecie);
  });
});

// ---------------------------------------------------------------- wpływ na losowanie kart

const definicja = (id: string): GEventDef | undefined => M1_EVENTS.find((e) => e.id === id) ?? krokPoId(id);

/** pierwsza karta, jaką zarząd (ziarno `seed`) wylosuje nocą trzeciego dnia (pula z kartami ostrymi i łagodnymi) przy napięciu `v` */
function pierwszaKarta(seed: number, v: number, spokoj = 0): string | null {
  const st = newGov(seed);
  st.napiecie = { v, t: 0, spokoj };
  st.ev.next = 0;
  st.ev.warm = 0;
  st.ev.lit = -1;
  const i = wejscie(3, 23);
  for (let k = 0; k < 40 && !st.ev.active; k++) {
    eventTick(st, { ...i, screen: 1000 + 200 * k }, emptyEffects(), false);
  }
  return st.ev.active?.id ?? null;
}

describe('narrator: losowanie kart', () => {
  const ziarna = Array.from({ length: 100 }, (_, k) => 100 + k);
  const policz = (v: number, spokoj = 0) => {
    const ton = { ostre: 0, lagodne: 0, zwykle: 0 };
    for (const s of ziarna) {
      const id = pierwszaKarta(s, v, spokoj);
      if (!id) continue;
      const t = definicja(id)?.ton;
      ton[t ?? 'zwykle']++;
    }
    return ton;
  };

  it('100 losowań przy wysokim napięciu: więcej łagodnych (i mniej ostrych) niż przy niskim', () => {
    const niskie = policz(5);
    const wysokie = policz(80);
    expect(wysokie.lagodne).toBeGreaterThan(niskie.lagodne);
    expect(wysokie.ostre).toBeLessThan(niskie.ostre);
  });

  it('po dobie spokoju ostrych kart wypada więcej niż przy zwykłym niskim napięciu', () => {
    const zwykle = policz(5);
    const spokoj = policz(5, SPOKOJ_DOBA + 60);
    expect(spokoj.ostre).toBeGreaterThan(zwykle.ostre);
  });

  it('karty z puli mają tagi: ostre i łagodne występują, a karty gościa i pogrzeb zostają bez tonu', () => {
    const tony = (ton: 'ostre' | 'lagodne') => M1_EVENTS.filter((e) => e.ton === ton).map((e) => e.id);
    for (const id of ['kradziez', 'pozar', 'szwendacz', 'krzyk']) expect(tony('ostre')).toContain(id);
    for (const id of ['kot', 'sygnal', 'dym', 'domofon', 'dron', 'jablka']) expect(tony('lagodne')).toContain(id);
    for (const id of ['gosc', 'zlapany', 'powrot', 'pogrzeb']) expect(definicja(id)?.ton).toBeUndefined();
  });
});

// ---------------------------------------------------------------- goście po dłuższym spokoju

describe('narrator: goście po dłuższym spokoju', () => {
  /** udział gości z haczykiem innym niż prawda w 300 planach (ziarna zarządu 1…300) */
  function udzialHaczyka(spokoj: number): number {
    let nieprawda = 0;
    const n = 300;
    for (let s = 1; s <= n; s++) {
      const st = newGov(s);
      st.napiecie = { v: 5, t: 0, spokoj };
      const i = wejscie(3, 14, 0, { goscie: [] });
      const g = planujGoscia(st, i, emptyEffects(), 'dzien');
      if (g.haczyk !== 'prawda') nieprawda++;
    }
    return nieprawda / n;
  }

  it('po ponad dobie spokoju więcej gości ma haczyk (waga ×1,5), bez spokoju jak dotąd', () => {
    const zwykly = udzialHaczyka(0);
    const po = udzialHaczyka(SPOKOJ_DOBA + 1);
    expect(po).toBeGreaterThan(zwykly);
    // równo doba to jeszcze nie spokój
    expect(udzialHaczyka(SPOKOJ_DOBA)).toBe(zwykly);
  });
});
