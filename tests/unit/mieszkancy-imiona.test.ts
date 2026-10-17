/* Nadawanie imion i nazwisk (src/mieszkancy/imiona.ts) i podpięcie do generatora (generuj.ts). Chodzi zawsze, na
   tabelach z public/data/mieszkancy/ i demach z public/demo/, bez surowych plików. Część testów pracuje na małych,
   zmyślonych tabelach, żeby sprawdzić regułę, a nie dane. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { generujBudynek, generujObszar } from '../../src/mieszkancy/generuj.ts';
import {
  bezPuliLokalnej,
  efektywnyUdzialLokalnych,
  IMIONA_DWUFALOWE,
  imieDla,
  nadajImiona,
  nazwiskaDlaGminy,
  nazwiskoPartnera,
  nazwiskoRodziny,
} from '../../src/mieszkancy/imiona.ts';
import { losDla } from '../../src/mieszkancy/los.ts';
import {
  PLIK_WOJEWODZTWA,
  type TabeleGminy,
  type TabeleImion,
  type TabeleKraju,
  type TabeleNazwisk,
} from '../../src/mieszkancy/tabele.ts';
import type { Budynek, Gospodarstwo, Osoba, Plec, Wpis, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import type { Geo } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const imiona = wczytaj<TabeleImion>('data/mieszkancy/imiona.json');
const nazwiskaWoj = (woj: string): TabeleNazwisk => wczytaj<TabeleNazwisk>(`data/mieszkancy/nazwiska/${woj}.json`);
const pomorskie = nazwiskaWoj('pomorskie');
const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;
const przymorze = demo('przymorze');
const nazwy = { imiona, nazwiska: pomorskie };

const PLCI: Plec[] = ['M', 'K'];

// ---------------------------------------------------------------- małe tabele do testów reguł

const bezImion = (): TabeleImion => ({
  wersja: 1,
  lata: {},
  koszyki: {
    '1920-1945': { M: [], K: [] },
    '1946-1959': { M: [], K: [] },
    '1960-1974': { M: [], K: [] },
    '1975-1989': { M: [], K: [] },
    '1990-1999': { M: [], K: [] },
  },
  powracajace: { M: [], K: [] },
  przyjezdni: { M: [], K: [] },
});
/** Tabela imion ze zmyślonymi listami: tylko to, co podano. */
function tabelaImion(cz: Partial<TabeleImion>): TabeleImion {
  return { ...bezImion(), ...cz };
}
const tabelaNazwisk = (
  ogolne: [string, string, number][],
  lokalne: [string, string, number][] = [],
  udzialLokalnych = 0,
): TabeleNazwisk => ({ wersja: 1, woj: 'testowe', ogolne, lokalne, udzialLokalnych });

/** Pary nazwisk „NazwiskoN-ski/ska” z równymi wagami: zmyślone, nic z prawdziwej tabeli. */
const wielePar = (n: number): [string, string, number][] =>
  Array.from({ length: n }, (_, i) => [`Test${i}ski`, `Test${i}ska`, 100]);

// ---------------------------------------------------------------- zmyślone budynki do testów nadajImiona

const BUDYNEK: Budynek = {
  klucz: 'test/b1',
  lat: 54.4,
  lon: 18.6,
  rejon: '',
  typ: 'blok',
  kondygnacje: 5,
  pole: 500,
  szerokosc: 10,
  dlugosc: 50,
  klatki: 1,
};
const osoba = (id: string, plec: Plec, rocznik: number, cz: Partial<Osoba> = {}): Osoba => ({
  id,
  plec,
  rocznik,
  imie: '',
  nazwisko: '',
  stan: 'tu',
  ...cz,
});
const dom = (id: string, czlonkowie: string[]): Gospodarstwo => ({
  id,
  budynek: BUDYNEK.klucz,
  klatka: 1,
  czlonkowie,
  odOddania: false,
});
const wynik = (klucz: string, osoby: Osoba[], gospodarstwa: Gospodarstwo[], dziennik: Wpis[] = []): WynikBudynku => ({
  budynek: { ...BUDYNEK, klucz },
  osoby,
  gospodarstwa,
  dziennik,
  puste: 0,
  rok: 2051,
});
/** Każdy w osobnym gospodarstwie, bez rodziny. */
const samotni = (n: number, plec: Plec, rocznik: number, klucz = 'test/s'): WynikBudynku => {
  const osoby = Array.from({ length: n }, (_, i) => osoba(`${klucz}/o${i}`, plec, rocznik));
  return wynik(
    klucz,
    osoby,
    osoby.map((o, i) => dom(`${klucz}/g${i}`, [o.id])),
  );
};
const ziarno = (...k: (string | number)[]) => losDla('imiona-test', ...k);

/** Czołówka list rocznych 2020-2025: pięć pierwszych imion każdego roku, osobno dla płci. */
function czolowka(plec: Plec): Set<string> {
  const s = new Set<string>();
  for (let rok = 2020; rok <= 2025; rok++) for (const [imie] of imiona.lata[String(rok)][plec].slice(0, 5)) s.add(imie);
  return s;
}
const imionaZListy = (l: [string, number][]): Set<string> => new Set(l.map((x) => x[0]));

// ---------------------------------------------------------------- imieDla

describe('imieDla: imiona według rocznika', () => {
  it('osoba z 1950 r. nie dostaje imienia z czołówki lat 2020-2025 poza imionami dwufalowymi (10 000 losowań)', () => {
    const r = ziarno('k1950');
    const dostane = new Set<string>();
    for (let i = 0; i < 10000; i++) dostane.add(imieDla(1950, 'K', imiona, r));
    const zakazane = [...czolowka('K')].filter((n) => !(IMIONA_DWUFALOWE as readonly string[]).includes(n));
    // czołówka nie jest pusta i zawiera imię, które siedzi w koszyku z 1946 r. (Zuzanna), więc test nie jest pusty
    expect(zakazane).toContain('Zuzanna');
    expect(zakazane.filter((n) => dostane.has(n))).toEqual([]);
    const koszyk = imionaZListy(imiona.koszyki['1946-1959'].K);
    for (const n of dostane) expect(koszyk.has(n), n).toBe(true);
    expect(dostane.has('')).toBe(false);
    expect(dostane.has('Maria')).toBe(true);
  });

  it('to samo dla mężczyzn urodzonych przed 1990 r.', () => {
    const zakazane = [...czolowka('M')].filter((n) => !(IMIONA_DWUFALOWE as readonly string[]).includes(n));
    for (const rocznik of [1925, 1950, 1965, 1985]) {
      const r = ziarno('m', rocznik);
      const dostane = new Set<string>();
      for (let i = 0; i < 5000; i++) dostane.add(imieDla(rocznik, 'M', imiona, r));
      expect(
        zakazane.filter((n) => dostane.has(n)),
        String(rocznik),
      ).toEqual([]);
    }
  });

  it('imiona dwufalowe zostają w starych rocznikach (Jan, Stanisław, Zofia)', () => {
    const r = ziarno('dwufalowe');
    const m = new Set<string>();
    const k = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      m.add(imieDla(1930, 'M', imiona, r));
      k.add(imieDla(1930, 'K', imiona, r));
    }
    expect(m.has('Jan') && m.has('Stanisław')).toBe(true);
    expect(k.has('Zofia')).toBe(true);
  });

  it('rocznik z lat 2000-2025: imię z listy tego roku, najczęstsze najczęściej', () => {
    const r = ziarno('2005');
    const lista = imiona.lata['2005'].M;
    const suma = lista.reduce((n, x) => n + x[1], 0);
    const licznik = new Map<string, number>();
    for (let i = 0; i < 20000; i++) {
      const n = imieDla(2005, 'M', imiona, r);
      licznik.set(n, (licznik.get(n) ?? 0) + 1);
    }
    const lacznie = imionaZListy(lista);
    for (const n of licznik.keys()) expect(lacznie.has(n), n).toBe(true);
    const oczekiwane = lista[0][1] / suma;
    expect(Math.abs((licznik.get(lista[0][0]) ?? 0) / 20000 - oczekiwane)).toBeLessThan(0.012);
  });

  it('koszyk wynika z rocznika: do 1945 pierwszy, od 1990 do 1999 ostatni, wcześniejsze niż 1920 też pierwszy', () => {
    const t = tabelaImion({
      koszyki: {
        '1920-1945': { M: [['Jedenaście', 5]], K: [] },
        '1946-1959': { M: [['Dwa', 5]], K: [] },
        '1960-1974': { M: [['Trzy', 5]], K: [] },
        '1975-1989': { M: [['Cztery', 5]], K: [] },
        '1990-1999': { M: [['Pięć', 5]], K: [] },
      },
    });
    const r = ziarno('koszyki');
    const dla = (rocznik: number): string => imieDla(rocznik, 'M', t, r);
    expect([1890, 1920, 1945].map(dla)).toEqual(['Jedenaście', 'Jedenaście', 'Jedenaście']);
    expect([1946, 1959].map(dla)).toEqual(['Dwa', 'Dwa']);
    expect([1960, 1974].map(dla)).toEqual(['Trzy', 'Trzy']);
    expect([1975, 1989].map(dla)).toEqual(['Cztery', 'Cztery']);
    expect([1990, 1999].map(dla)).toEqual(['Pięć', 'Pięć']);
  });

  it('osoby z 1990-1999 mogą mieć imię z czołówki lat 2020 (Jakub, Zuzanna), bo wyłączenie dotyczy tylko starszych', () => {
    const r = ziarno('1995');
    const dostane = new Set<string>();
    for (let i = 0; i < 10000; i++) dostane.add(imieDla(1995, 'M', imiona, r));
    expect(dostane.has('Jakub')).toBe(true);
  });

  it('rocznik 2040: ani Patryka, ani Angeliki w 10 000 losowań, tylko imiona z listy 2025 albo powracające', () => {
    for (const rocznik of [2040, 2050]) {
      const rm = ziarno('m', rocznik);
      const rk = ziarno('k', rocznik);
      const m = new Set<string>();
      const k = new Set<string>();
      for (let i = 0; i < 10000; i++) {
        m.add(imieDla(rocznik, 'M', imiona, rm));
        k.add(imieDla(rocznik, 'K', imiona, rk));
      }
      expect(m.has('Patryk'), 'Patryk').toBe(false);
      expect(k.has('Angelika'), 'Angelika').toBe(false);
      const dozwoloneM = new Set([...imionaZListy(imiona.lata['2025'].M), ...imiona.powracajace.M]);
      const dozwoloneK = new Set([...imionaZListy(imiona.lata['2025'].K), ...imiona.powracajace.K]);
      for (const n of m) expect(dozwoloneM.has(n), n).toBe(true);
      for (const n of k) expect(dozwoloneK.has(n), n).toBe(true);
    }
  });

  it('od 2031 r. imiona przebrzmiałe (nadań w 2025 r. dziesięć razy mniej niż w 2000 r.) wypadają z puli', () => {
    for (const plec of PLCI) {
      const w2000 = new Map(imiona.lata['2000'][plec]);
      const przebrzmiale = imiona.lata['2025'][plec].filter(([n, c]) => (w2000.get(n) ?? 0) >= 10 * c).map((x) => x[0]);
      expect(przebrzmiale.length).toBeGreaterThan(10);
      const r = ziarno('przebrzmiale', plec);
      const dostane = new Set<string>();
      for (let i = 0; i < 20000; i++) dostane.add(imieDla(2045, plec, imiona, r));
      expect(przebrzmiale.filter((n) => dostane.has(n))).toEqual([]);
      // a imiona, które tylko trochę zmalały (Dawid, Aleksandra), zostają
    }
    const r = ziarno('dawid');
    const m = new Set<string>();
    for (let i = 0; i < 20000; i++) m.add(imieDla(2045, 'M', imiona, r));
    expect(m.has('Dawid')).toBe(true);
  });

  it('od 2031 r. około 30% imion pochodzi z puli powracających, reszta z listy 2025', () => {
    const t = tabelaImion({
      lata: { '2025': { M: [['Nowy', 100]], K: [] }, '2020': { M: [['Nowy', 100]], K: [] } },
      powracajace: { M: ['Stary', 'Dawny'], K: [] },
    });
    const r = ziarno('trzydziesci');
    let powracajace = 0;
    for (let i = 0; i < 10000; i++) if (imieDla(2040, 'M', t, r) !== 'Nowy') powracajace++;
    expect(powracajace / 10000).toBeGreaterThan(0.28);
    expect(powracajace / 10000).toBeLessThan(0.32);
  });

  it('powracające imiona idą według miejsca na liście: pierwsze częściej niż ostatnie', () => {
    const t = tabelaImion({
      lata: { '2025': { M: [['Nowy', 100]], K: [] }, '2020': { M: [['Nowy', 100]], K: [] } },
      powracajace: { M: ['Pierwszy', 'Drugi', 'Trzeci', 'Czwarty', 'Piąty'], K: [] },
    });
    const r = ziarno('rangi');
    const licznik = new Map<string, number>();
    for (let i = 0; i < 30000; i++) {
      const n = imieDla(2040, 'M', t, r);
      licznik.set(n, (licznik.get(n) ?? 0) + 1);
    }
    expect(licznik.get('Pierwszy') ?? 0).toBeGreaterThan(licznik.get('Piąty') ?? 0);
    expect(licznik.get('Piąty') ?? 0).toBeGreaterThan(0);
  });

  it('bez powracających imion całość idzie z listy 2025', () => {
    const t = tabelaImion({
      lata: { '2025': { M: [['Nowy', 100]], K: [] }, '2020': { M: [['Nowy', 100]], K: [] } },
    });
    const r = ziarno('bez-powracajacych');
    for (let i = 0; i < 200; i++) expect(imieDla(2040, 'M', t, r)).toBe('Nowy');
  });

  it('2026-2030: wygaszany trend, rosnące imię zyskuje, malejące traci, a im dalej, tym mocniej, ale z wygaszeniem', () => {
    // udziały 2020 → 2025: Rosnące 20% → 50%, Malejące 60% → 30%, Stałe 20% → 20%
    const t = tabelaImion({
      lata: {
        '2020': {
          M: [
            ['Malejące', 600],
            ['Rosnące', 200],
            ['Stałe', 200],
          ],
          K: [],
        },
        '2025': {
          M: [
            ['Rosnące', 500],
            ['Malejące', 300],
            ['Stałe', 200],
          ],
          K: [],
        },
      },
    });
    const udzial = (rocznik: number, imie: string): number => {
      const r = ziarno('trend', rocznik);
      let n = 0;
      for (let i = 0; i < 40000; i++) if (imieDla(rocznik, 'M', t, r) === imie) n++;
      return n / 40000;
    };
    const rosnace = [2025, 2026, 2028, 2030].map((rok) => udzial(rok, 'Rosnące'));
    const malejace = [2025, 2026, 2028, 2030].map((rok) => udzial(rok, 'Malejące'));
    expect(rosnace[0]).toBeCloseTo(0.5, 1);
    for (let i = 1; i < rosnace.length; i++) expect(rosnace[i]).toBeGreaterThan(rosnace[i - 1] - 0.005);
    for (let i = 1; i < malejace.length; i++) expect(malejace[i]).toBeLessThan(malejace[i - 1] + 0.005);
    expect(rosnace[3]).toBeGreaterThan(0.58);
    expect(malejace[3]).toBeLessThan(0.25);
    // wygaszenie: przyrost w 2026 jest większy niż średni przyrost roczny w 2028-2030
    expect(rosnace[1] - rosnace[0]).toBeGreaterThan((rosnace[3] - rosnace[2]) / 2);
    // po 2030 trend stoi: rocznik 2035 ma ten sam rozkład co 2030, tylko z domieszką powracających (brak ich w tabeli)
    expect(Math.abs(udzial(2035, 'Rosnące') - rosnace[3])).toBeLessThan(0.02);
  });

  it('2026-2030 na prawdziwej tabeli: imiona z listy 2025, bez pustych, ten sam rocznik i ziarno dają to samo', () => {
    for (const plec of PLCI) {
      const lista = imionaZListy(imiona.lata['2025'][plec]);
      for (const rocznik of [2026, 2028, 2030]) {
        const losowania = (): string[] => {
          const r = ziarno('x', rocznik);
          return Array.from({ length: 300 }, () => imieDla(rocznik, plec, imiona, r));
        };
        const a = losowania();
        expect(losowania()).toEqual(a);
        for (const n of a) expect(lista.has(n), `${plec} ${rocznik} ${n}`).toBe(true);
      }
    }
  });

  it('przyjezdny: około 15% imion z puli przyjezdnych, bez znacznika ani jednego', () => {
    const przyjezdni = new Set([...imionaZListy(imiona.przyjezdni.M), ...imionaZListy(imiona.przyjezdni.K)]);
    const r = ziarno('przyjezdny');
    let z = 0;
    let bez = 0;
    for (let i = 0; i < 10000; i++) {
      if (przyjezdni.has(imieDla(1990, 'M', imiona, r, true))) z++;
      if (przyjezdni.has(imieDla(1990, 'M', imiona, r))) bez++;
    }
    expect(z / 10000).toBeGreaterThan(0.135);
    expect(z / 10000).toBeLessThan(0.165);
    expect(bez).toBe(0);
    // płeć ma znaczenie: przyjezdna kobieta nie dostaje męskiego imienia z puli
    const meskie = imionaZListy(imiona.przyjezdni.M);
    for (let i = 0; i < 2000; i++) expect(meskie.has(imieDla(1990, 'K', imiona, r, true))).toBe(false);
  });

  it('puste listy nie wywracają losowania: wynik to pusty napis', () => {
    expect(imieDla(2005, 'M', bezImion(), ziarno('puste'))).toBe('');
    expect(imieDla(1950, 'K', bezImion(), ziarno('puste'))).toBe('');
    expect(imieDla(2040, 'M', bezImion(), ziarno('puste'))).toBe('');
    expect(imieDla(2028, 'M', bezImion(), ziarno('puste'))).toBe('');
    expect(imieDla(1990, 'M', bezImion(), ziarno('puste'), true)).toBe('');
  });
});

// ---------------------------------------------------------------- nazwiska

describe('nazwiskoRodziny i nazwiskoPartnera', () => {
  const lokalneMeskie = new Set(pomorskie.lokalne.map((x) => x[0]));

  it('rodziny pomorskie: 20,2% ±1,5 pp z puli lokalnej (10 000 losowań)', () => {
    expect(pomorskie.udzialLokalnych).toBe(2020);
    const r = ziarno('pomorskie');
    let lokalne = 0;
    for (let i = 0; i < 10000; i++) if (lokalneMeskie.has(nazwiskoRodziny(pomorskie, r)[0])) lokalne++;
    expect(lokalne / 10000).toBeGreaterThan(0.187);
    expect(lokalne / 10000).toBeLessThan(0.217);
  });

  it('zwraca parę form z tabeli (męska, żeńska); nazwiska bez zmiany formy zostają takie same', () => {
    const pary = new Map([...pomorskie.ogolne, ...pomorskie.lokalne].map((x) => [x[0], x[1]]));
    const r = ziarno('pary');
    let znak = 0;
    for (let i = 0; i < 2000; i++) {
      const [m, f] = nazwiskoRodziny(pomorskie, r);
      expect(pary.get(m), m).toBe(f);
      if (m !== f) znak++;
    }
    expect(znak).toBeGreaterThan(500);
  });

  it('poza pulą lokalną nie pada nazwisko lokalne (udział lokalnych nie rośnie ponad dane)', () => {
    const t = { ...pomorskie, udzialLokalnych: 0 };
    const r = ziarno('bez-lokalnych');
    for (let i = 0; i < 10000; i++) expect(lokalneMeskie.has(nazwiskoRodziny(t, r)[0])).toBe(false);
  });

  it('udział lokalnych 10 000 i pula lokalna o przytłaczającej masie: wszystkie z puli lokalnej, w stosunku do liczebności', () => {
    // masa puli lokalnej 4 mld wobec 1 w „ogólnych”: ograniczenie z masy (R38) zaokrągla się do 10 000
    const t = tabelaNazwisk(
      [['Zwykły', 'Zwykła', 1]],
      [
        ['Pierwszy', 'Pierwsza', 3_000_000_000],
        ['Drugi', 'Druga', 1_000_000_000],
      ],
      10000,
    );
    expect(efektywnyUdzialLokalnych(t)).toBe(10000);
    const r = ziarno('same-lokalne');
    let pierwszy = 0;
    for (let i = 0; i < 20000; i++) {
      const [m] = nazwiskoRodziny(t, r);
      expect(['Pierwszy', 'Drugi'], m).toContain(m);
      if (m === 'Pierwszy') pierwszy++;
    }
    expect(pierwszy / 20000).toBeGreaterThan(0.735);
    expect(pierwszy / 20000).toBeLessThan(0.765);
  });

  it('pusta pula lokalna (jak w lubuskim): losowanie pomija ją i bierze całe „ogólne”, nic nie ginie', () => {
    const lubuskie = nazwiskaWoj('lubuskie');
    expect(lubuskie.lokalne.length).toBe(0);
    const t = { ...lubuskie, udzialLokalnych: 5000 };
    const r = ziarno('lubuskie');
    const widziane = new Set<string>();
    for (let i = 0; i < 20000; i++) widziane.add(nazwiskoRodziny(t, r)[0]);
    const ogolne = new Set(lubuskie.ogolne.map((x) => x[0]));
    for (const n of widziane) expect(ogolne.has(n), n).toBe(true);
    expect(widziane.size).toBeGreaterThan(100);
  });

  it('wagi to liczebności: częstsze nazwisko pada częściej', () => {
    const t = tabelaNazwisk([
      ['Duży', 'Duża', 900],
      ['Mały', 'Mała', 100],
    ]);
    const r = ziarno('wagi');
    let duzy = 0;
    for (let i = 0; i < 10000; i++) if (nazwiskoRodziny(t, r)[0] === 'Duży') duzy++;
    expect(duzy / 10000).toBeGreaterThan(0.88);
    expect(duzy / 10000).toBeLessThan(0.92);
  });

  it('nazwiskoPartnera losuje z „ogólnych” razem z lokalnymi, bez pomijania ich', () => {
    const t = { ...pomorskie, udzialLokalnych: 0 };
    const r = ziarno('partner');
    const widziane = new Set<string>();
    for (let i = 0; i < 20000; i++) widziane.add(nazwiskoPartnera(t, r)[0]);
    const wOgolnych = pomorskie.ogolne.filter((x) => lokalneMeskie.has(x[0])).length;
    expect(wOgolnych).toBeGreaterThan(0);
    expect([...widziane].filter((n) => lokalneMeskie.has(n)).length).toBeGreaterThan(0);
    const ogolne = new Set(pomorskie.ogolne.map((x) => x[0]));
    for (const n of widziane) expect(ogolne.has(n), n).toBe(true);
  });

  it('puste tabele dają puste nazwisko zamiast wyjątku', () => {
    const r = ziarno('puste-nazwiska');
    expect(nazwiskoRodziny(tabelaNazwisk([]), r)).toEqual(['', '']);
    expect(nazwiskoPartnera(tabelaNazwisk([]), r)).toEqual(['', '']);
  });
});

describe('krótkie pule lokalne (R38)', () => {
  const wszystkie = Object.keys(PLIK_WOJEWODZTWA).map((woj) => nazwiskaWoj(PLIK_WOJEWODZTWA[woj]));
  const meskie = (t: TabeleNazwisk): Set<string> => new Set(t.lokalne.map((x) => x[0]));
  const masa = (l: [string, string, number][]): number => l.reduce((n, x) => n + x[2], 0);
  /** Masa nazwisk, z których losujemy: „ogólne” bez lokalnych razem z lokalnymi. */
  const masaLaczna = (t: TabeleNazwisk): number => masa(t.ogolne.filter((x) => !meskie(t).has(x[0]))) + masa(t.lokalne);

  it('efektywny udział to mniejszy z udziału z danych i udziału masy puli lokalnej, we wszystkich 16 województwach', () => {
    expect(wszystkie).toHaveLength(16);
    for (const t of wszystkie) {
      const wMasie = t.lokalne.length > 0 ? Math.round((10000 * masa(t.lokalne)) / masaLaczna(t)) : 0;
      const oczekiwany = t.lokalne.length > 0 ? Math.min(t.udzialLokalnych, wMasie) : 0;
      expect(efektywnyUdzialLokalnych(t), t.woj).toBe(oczekiwany);
      expect(efektywnyUdzialLokalnych(t), t.woj).toBeLessThanOrEqual(t.udzialLokalnych);
    }
  });

  it('pełna pula (pomorskie) trzyma udział z danych, krótkie dają swoją częstość, pusta (lubuskie) zero', () => {
    const wg = (woj: string): TabeleNazwisk => wszystkie.find((t) => t.woj === woj)!;
    expect(efektywnyUdzialLokalnych(wg('pomorskie'))).toBe(wg('pomorskie').udzialLokalnych);
    expect(efektywnyUdzialLokalnych(wg('lubuskie'))).toBe(0);
    // opolskie: 4 nazwiska, 5,32% w danych, ale w puli 0,9%; zachodniopomorskie: 1 nazwisko, 28 nosicieli
    expect(wg('opolskie').lokalne).toHaveLength(4);
    expect(efektywnyUdzialLokalnych(wg('opolskie'))).toBeLessThan(100);
    expect(wg('zachodniopomorskie').lokalne).toHaveLength(1);
    expect(efektywnyUdzialLokalnych(wg('zachodniopomorskie'))).toBeLessThan(5);
  });

  it('żadne nazwisko lokalne nie jest częstsze niż 1,2 razy jego częstość w łącznej puli, w 20 000 rodzin każdego województwa', () => {
    for (const t of wszystkie) {
      const N = 20000;
      const r = ziarno('r38', t.woj);
      const razem = masaLaczna(t);
      const licznik = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const [m] = nazwiskoRodziny(t, r);
        licznik.set(m, (licznik.get(m) ?? 0) + 1);
      }
      let lokalne = 0;
      let oczekiwaneLokalne = 0;
      for (const [m, , n] of t.lokalne) {
        const oczekiwane = (N * n) / razem;
        const wyszlo = licznik.get(m) ?? 0;
        lokalne += wyszlo;
        oczekiwaneLokalne += oczekiwane;
        // 1,2 razy oczekiwana liczba plus trzy odchylenia szumu Poissona, bo rzadkie nazwiska mają kilka trafień
        expect(wyszlo, `${t.woj} ${m}`).toBeLessThanOrEqual(1.2 * oczekiwane + 3 * Math.sqrt(oczekiwane));
      }
      expect(lokalne, `${t.woj} razem`).toBeLessThanOrEqual(1.2 * oczekiwaneLokalne + 3 * Math.sqrt(oczekiwaneLokalne));
    }
  });

  it('opolskie: Kampa (284 nosicieli) daleko za Nowakiem, a zachodniopomorskie: Buriak (28 nosicieli) prawie nie pada', () => {
    const opolskie = nazwiskaWoj('opolskie');
    const r = ziarno('kampa');
    let kampa = 0;
    let nowak = 0;
    let kansy = 0;
    for (let i = 0; i < 20000; i++) {
      const m = nazwiskoRodziny(opolskie, r)[0];
      if (m === 'Kampa') kampa++;
      else if (m === 'Nowak') nowak++;
      else if (m === 'Kansy') kansy++;
    }
    expect(nowak).toBeGreaterThan(300);
    expect(kampa).toBeLessThan(nowak / 3);
    expect(kansy).toBeLessThan(nowak / 3);
    const zachodniopomorskie = nazwiskaWoj('zachodniopomorskie');
    let buriak = 0;
    for (let i = 0; i < 20000; i++) if (nazwiskoRodziny(zachodniopomorskie, r)[0] === 'Buriak') buriak++;
    expect(buriak).toBeLessThan(25);
  });

  it('pomorskie nadal 20,2% ±1,5 pp, a lubuskie losuje jak bez puli lokalnej (ta sama sekwencja)', () => {
    const r = ziarno('pomorskie-r38');
    let lokalne = 0;
    for (let i = 0; i < 10000; i++) if (meskie(pomorskie).has(nazwiskoRodziny(pomorskie, r)[0])) lokalne++;
    expect(lokalne / 10000).toBeGreaterThan(0.187);
    expect(lokalne / 10000).toBeLessThan(0.217);
    const lubuskie = nazwiskaWoj('lubuskie');
    const bez = bezPuliLokalnej(lubuskie);
    const a = ziarno('lubuskie-r38');
    const b = ziarno('lubuskie-r38');
    for (let i = 0; i < 500; i++) expect(nazwiskoRodziny(lubuskie, a)).toEqual(nazwiskoRodziny(bez, b));
  });

  it('mała pula na zmyślonych danych: 1 nazwisko lokalne o masie 50 wobec 1000 w „ogólnych” daje 476 na 10 000', () => {
    const t = tabelaNazwisk(wielePar(10), [['Lokalski', 'Lokalska', 50]], 5000);
    expect(efektywnyUdzialLokalnych(t)).toBe(476);
    const r = ziarno('mala-pula');
    let lokalne = 0;
    for (let i = 0; i < 20000; i++) if (nazwiskoRodziny(t, r)[0] === 'Lokalski') lokalne++;
    expect(lokalne / 20000).toBeGreaterThan(0.04);
    expect(lokalne / 20000).toBeLessThan(0.055);
    // gdy udział z danych jest mniejszy od udziału masy, zostaje udział z danych
    expect(efektywnyUdzialLokalnych(tabelaNazwisk(wielePar(10), [['Lokalski', 'Lokalska', 50]], 100))).toBe(100);
  });
});

describe('nazwiska bez tabeli gminy (R35)', () => {
  it('gmina z tabelą: jej województwo, plik bez polskich liter i losowanie lokalne', () => {
    expect(nazwiskaDlaGminy(gdansk)).toEqual({ woj: 'pomorskie', plik: 'pomorskie', lokalne: true });
    expect(nazwiskaDlaGminy(ursynow)).toEqual({ woj: 'mazowieckie', plik: 'mazowieckie', lokalne: true });
    expect(nazwiskaDlaGminy({ ...gdansk, woj: 'łódzkie' })).toEqual({ woj: 'łódzkie', plik: 'lodzkie', lokalne: true });
  });

  it('bez gminy: plik mazowieckie z wyłączonym losowaniem lokalnym', () => {
    expect(nazwiskaDlaGminy(null)).toEqual({ woj: 'mazowieckie', plik: 'mazowieckie', lokalne: false });
  });

  it('gmina z nieznanym województwem w tabeli traktowana jak brak gminy', () => {
    expect(nazwiskaDlaGminy({ ...gdansk, woj: 'atlantyda' })).toEqual({
      woj: 'mazowieckie',
      plik: 'mazowieckie',
      lokalne: false,
    });
  });

  it('bezPuliLokalnej zeruje udział i pulę lokalną, resztę zostawia, a wejścia nie rusza', () => {
    const mazowieckie = nazwiskaWoj('mazowieckie');
    const kopia = JSON.stringify(mazowieckie);
    const t = bezPuliLokalnej(mazowieckie);
    expect(t.udzialLokalnych).toBe(0);
    expect(t.lokalne).toEqual([]);
    expect(t.ogolne).toEqual(mazowieckie.ogolne);
    expect(JSON.stringify(mazowieckie)).toBe(kopia);
    // lokalne nazwiska mazowieckiego zostają więc w puli „ogólnych” z naturalną częstością
    const lokalneM = new Set(mazowieckie.lokalne.map((x) => x[0]));
    const r = ziarno('mazowieckie');
    const widziane = new Set<string>();
    for (let i = 0; i < 20000; i++) widziane.add(nazwiskoRodziny(t, r)[0]);
    expect([...widziane].some((n) => lokalneM.has(n))).toBe(mazowieckie.ogolne.some((x) => lokalneM.has(x[0])));
  });
});

// ---------------------------------------------------------------- nadajImiona

describe('nadajImiona: reguły rodziny na małych budynkach', () => {
  /** Tabela z jednym nazwiskiem „Testski/Testska”, żeby od razu widać, kto po kim. */
  const jedno = tabelaNazwisk([['Testski', 'Testska', 100]]);
  const imionaProste = tabelaImion({
    koszyki: {
      '1920-1945': { M: [['Adam', 1]], K: [['Ewa', 1]] },
      '1946-1959': { M: [['Adam', 1]], K: [['Ewa', 1]] },
      '1960-1974': { M: [['Adam', 1]], K: [['Ewa', 1]] },
      '1975-1989': { M: [['Adam', 1]], K: [['Ewa', 1]] },
      '1990-1999': { M: [['Adam', 1]], K: [['Ewa', 1]] },
    },
    lata: { '2020': { M: [['Adam', 10]], K: [['Ewa', 10]] }, '2030': { M: [['Adam', 10]], K: [['Ewa', 10]] } },
  });

  it('para z dziećmi: ojciec i synowie to Testski, żona i córki Testska', () => {
    const w = wynik(
      'test/rodzina',
      [
        osoba('o0', 'M', 1980, { partner: 'o1' }),
        osoba('o1', 'K', 1982, { partner: 'o0' }),
        osoba('o2', 'M', 2010, { matka: 'o1', ojciec: 'o0' }),
        osoba('o3', 'K', 2013, { matka: 'o1', ojciec: 'o0' }),
      ],
      [dom('g0', ['o0', 'o1', 'o2', 'o3'])],
    );
    nadajImiona(w, imionaProste, jedno, ziarno('rodzina'));
    expect(w.osoby.map((o) => o.nazwisko)).toEqual(['Testski', 'Testska', 'Testski', 'Testska']);
  });

  it('samotna matka: dzieci po matce (syn dostaje męską formę jej nazwiska)', () => {
    const w = wynik(
      'test/matka',
      [osoba('o0', 'K', 1985), osoba('o1', 'M', 2012, { matka: 'o0' }), osoba('o2', 'K', 2015, { matka: 'o0' })],
      [dom('g0', ['o0', 'o1', 'o2'])],
    );
    nadajImiona(w, imionaProste, jedno, ziarno('matka'));
    expect(w.osoby.map((o) => o.nazwisko)).toEqual(['Testska', 'Testski', 'Testska']);
  });

  it('samotny ojciec: dzieci po ojcu', () => {
    const w = wynik(
      'test/ojciec',
      [osoba('o0', 'M', 1978), osoba('o1', 'K', 2008, { ojciec: 'o0' })],
      [dom('g0', ['o0', 'o1'])],
    );
    nadajImiona(w, imionaProste, jedno, ziarno('ojciec'));
    expect(w.osoby.map((o) => o.nazwisko)).toEqual(['Testski', 'Testska']);
  });

  it('każdy dostaje imię i nazwisko, także zmarli i ci, którzy wyjechali, razem z dziećmi poza domem', () => {
    const w = wynik(
      'test/nieobecni',
      [
        osoba('o0', 'M', 1950, { stan: 'zmarl', partner: 'o1' }),
        osoba('o1', 'K', 1953, { partner: 'o0' }),
        osoba('o2', 'M', 1980, { stan: 'wyjechal', dokad: 'Kraków', matka: 'o1', ojciec: 'o0' }),
        osoba('o3', 'K', 1984, { matka: 'o1', ojciec: 'o0' }),
      ],
      [dom('g0', ['o1', 'o3'])],
    );
    nadajImiona(w, imionaProste, jedno, ziarno('nieobecni'));
    for (const o of w.osoby) {
      expect(o.imie, o.id).not.toBe('');
      expect(o.nazwisko, o.id).not.toBe('');
    }
    // zmarły ojciec i syn, który wyjechał, mają to samo nazwisko co reszta rodziny
    expect(w.osoby.map((o) => o.nazwisko)).toEqual(['Testski', 'Testska', 'Testski', 'Testska']);
  });

  it('nie zmienia żadnego innego pola osoby ani gospodarstw, dziennika i budynku', () => {
    const w = wynik(
      'test/pola',
      [osoba('o0', 'M', 1980, { partner: 'o1' }), osoba('o1', 'K', 1982, { partner: 'o0' })],
      [dom('g0', ['o0', 'o1'])],
      [{ rok: 2030, typ: 'przydzial', kto: 'o0' }],
    );
    const przed = JSON.parse(JSON.stringify(w)) as WynikBudynku;
    nadajImiona(w, imionaProste, jedno, ziarno('pola'));
    for (const o of w.osoby) {
      o.imie = '';
      o.nazwisko = '';
    }
    expect(w).toEqual(przed);
  });

  it('ten sam budynek i ziarno dają te same imiona i nazwiska', () => {
    const nowy = (): WynikBudynku =>
      wynik(
        'test/determinizm',
        [
          osoba('o0', 'M', 1970, { partner: 'o1' }),
          osoba('o1', 'K', 1972, { partner: 'o0' }),
          osoba('o2', 'K', 2000, { matka: 'o1', ojciec: 'o0' }),
        ],
        [dom('g0', ['o0', 'o1', 'o2'])],
      );
    const a = nowy();
    const b = nowy();
    nadajImiona(a, imiona, pomorskie, losDla('imiona', 'test/determinizm'));
    nadajImiona(b, imiona, pomorskie, losDla('imiona', 'test/determinizm'));
    expect(a).toEqual(b);
  });

  it('żona przyjmuje nazwisko męża w 85% przypadków, resztę ma własne (z puli „ogólnych”)', () => {
    const t = tabelaNazwisk(wielePar(50));
    let razem = 0;
    const N = 800;
    for (let i = 0; i < N; i++) {
      const w = wynik(
        `test/zona${i}`,
        [osoba('o0', 'M', 1980, { partner: 'o1' }), osoba('o1', 'K', 1982, { partner: 'o0' })],
        [dom('g0', ['o0', 'o1'])],
      );
      nadajImiona(w, imionaProste, t, ziarno('zona', i));
      if (w.osoby[0].nazwisko.replace('ski', '') === w.osoby[1].nazwisko.replace('ska', '')) razem++;
    }
    expect(razem / N).toBeGreaterThan(0.82);
    expect(razem / N).toBeLessThan(0.89);
  });

  it('partner z zewnątrz ma nazwisko z „ogólnych”, a dzieci pary po ojcu, czyli po nim', () => {
    // mieszkanka (parentless), partner wprowadza się w 2031; dziecko pary ma oboje rodziców w budynku
    const t = tabelaNazwisk(wielePar(40), [['Lokalski', 'Lokalska', 1_000_000_000]], 10000);
    let jegoNazwiskoCzesto = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const w = wynik(
        `test/partner${i}`,
        [
          osoba('o0', 'K', 1990, { partner: 'o1' }),
          osoba('o1', 'M', 1988, { partner: 'o0' }),
          osoba('o2', 'M', 2033, { matka: 'o0', ojciec: 'o1' }),
          osoba('o3', 'K', 2036, { matka: 'o0', ojciec: 'o1' }),
        ],
        [dom('g0', ['o0', 'o1', 'o2', 'o3'])],
        [
          { rok: 2031, typ: 'zwiazek', kto: 'o0', z: 'o1' },
          { rok: 2031, typ: 'wprowadzka', kto: 'o1', z: 'o0' },
        ],
      );
      nadajImiona(w, imionaProste, t, ziarno('partner', i));
      const [mieszkanka, partner, syn, corka] = w.osoby;
      // partner z „ogólnych”: nigdy z puli lokalnej, mimo udziału lokalnych 100%
      expect(partner.nazwisko).toMatch(/^Test\d+ski$/);
      expect(syn.nazwisko).toBe(partner.nazwisko);
      expect(corka.nazwisko).toBe(partner.nazwisko.replace('ski', 'ska'));
      // mieszkanka: 85% nazwisko partnera, reszta jej rodzinne, tu z puli lokalnej
      if (mieszkanka.nazwisko === partner.nazwisko.replace('ski', 'ska')) jegoNazwiskoCzesto++;
      else expect(mieszkanka.nazwisko).toBe('Lokalska');
    }
    expect(jegoNazwiskoCzesto / N).toBeGreaterThan(0.8);
    expect(jegoNazwiskoCzesto / N).toBeLessThan(0.92);
  });

  it('zięć: mąż córki, którego rodzice nie mieszkają w budynku, ma własne nazwisko, a jego dzieci po nim', () => {
    const t = tabelaNazwisk(wielePar(60));
    const N = 200;
    let wlasne = 0;
    for (let i = 0; i < N; i++) {
      const w = wynik(
        `test/ziec${i}`,
        [
          osoba('o0', 'M', 1950, { partner: 'o1' }),
          osoba('o1', 'K', 1952, { partner: 'o0' }),
          osoba('o2', 'K', 1978, { matka: 'o1', ojciec: 'o0', partner: 'o3' }),
          osoba('o3', 'M', 1976, { partner: 'o2' }),
          osoba('o4', 'M', 2008, { matka: 'o2', ojciec: 'o3' }),
        ],
        [dom('g0', ['o0', 'o1', 'o2', 'o3', 'o4'])],
      );
      nadajImiona(w, imionaProste, t, ziarno('ziec', i));
      const [dziadek, , corka, ziec, wnuk] = w.osoby;
      expect(wnuk.nazwisko).toBe(ziec.nazwisko);
      if (ziec.nazwisko !== dziadek.nazwisko) wlasne++;
      // córka: albo nazwisko rodziców (Testski/ska), albo męża
      const rodzinne = dziadek.nazwisko.replace('ski', 'ska');
      const meza = ziec.nazwisko.replace('ski', 'ska');
      expect([rodzinne, meza]).toContain(corka.nazwisko);
    }
    // zięć ma własne nazwisko, a nie nazwisko teściów (pula 60 par: zbieg przypadkowy rzadki)
    expect(wlasne / N).toBeGreaterThan(0.95);
  });

  it('gospodarstwo ma jedno nazwisko rodzinne, a dwa gospodarstwa tego samego budynku losują je niezależnie', () => {
    const t = tabelaNazwisk(wielePar(80));
    const w = samotni(300, 'M', 1980);
    nadajImiona(w, imionaProste, t, ziarno('niezaleznie'));
    const rozne = new Set(w.osoby.map((o) => o.nazwisko));
    // 300 gospodarstw po 80 równych parach: prawie wszystkie pary padły, każda wiele razy
    expect(rozne.size).toBeGreaterThan(70);

    // dwoje niespokrewnionych w jednym gospodarstwie (bez partnera, bez rodziców) dzieli nazwisko gospodarstwa
    const dwoje = wynik('test/dwoje', [osoba('o0', 'K', 1950), osoba('o1', 'M', 1955)], [dom('g0', ['o0', 'o1'])]);
    nadajImiona(dwoje, imionaProste, t, ziarno('dwoje'));
    expect(dwoje.osoby[0].nazwisko.replace('ska', '')).toBe(dwoje.osoby[1].nazwisko.replace('ski', ''));
  });

  it('wdowa i jej zmarły mąż, który nie mieszka już nigdzie, mają nazwisko gospodarstwa wdowy', () => {
    const t = tabelaNazwisk(wielePar(60));
    let zgodne = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const w = wynik(
        `test/wdowa${i}`,
        [
          osoba('o0', 'M', 1950, { stan: 'zmarl', partner: 'o1' }),
          osoba('o1', 'K', 1952, { partner: 'o0' }),
          osoba('o2', 'M', 1980, { matka: 'o1', ojciec: 'o0' }),
        ],
        [dom('g0', ['o1', 'o2'])],
      );
      nadajImiona(w, imionaProste, t, ziarno('wdowa', i));
      const [maz, wdowa, syn] = w.osoby;
      expect(syn.nazwisko).toBe(maz.nazwisko);
      if (wdowa.nazwisko === maz.nazwisko.replace('ski', 'ska')) zgodne++;
    }
    expect(zgodne / N).toBeGreaterThan(0.78);
  });

  it('cykl w danych (A matką B, B matką A) nie zawiesza losowania, a każdy dostaje nazwisko', () => {
    const w = wynik(
      'test/cykl',
      [osoba('o0', 'K', 1980, { matka: 'o1' }), osoba('o1', 'K', 2005, { matka: 'o0' })],
      [dom('g0', ['o0', 'o1'])],
    );
    nadajImiona(w, imionaProste, jedno, ziarno('cykl'));
    expect(w.osoby.map((o) => o.nazwisko)).toEqual(['Testska', 'Testska']);
  });

  it('budynek bez osób nie wywala funkcji', () => {
    const w = wynik('test/pusty', [], []);
    nadajImiona(w, imionaProste, jedno, ziarno('pusty'));
    expect(w.osoby).toEqual([]);
  });

  it('rodzeństwo nie dzieli imienia (do 10 losowań na dziecko)', () => {
    const t = tabelaImion({
      lata: {
        '2010': { M: Array.from({ length: 20 }, (_, i) => [`Imię${i}`, 10] as [string, number]), K: [] },
      },
    });
    const N = 300;
    let wspolne = 0;
    for (let i = 0; i < N; i++) {
      const w = wynik(
        `test/rodzenstwo${i}`,
        [
          osoba('o0', 'K', 1985),
          osoba('o1', 'M', 2010, { matka: 'o0' }),
          osoba('o2', 'M', 2010, { matka: 'o0' }),
          osoba('o3', 'M', 2010, { matka: 'o0' }),
        ],
        [dom('g0', ['o0', 'o1', 'o2', 'o3'])],
      );
      nadajImiona(w, t, tabelaNazwisk(wielePar(5)), ziarno('rodzenstwo', i));
      const imionaDzieci = w.osoby.slice(1).map((o) => o.imie);
      if (new Set(imionaDzieci).size < 3) wspolne++;
    }
    expect(wspolne).toBe(0);
  });

  it('po dziesięciu nieudanych losowaniach rodzeństwo dostaje to samo imię (pula z jednym imieniem, bez pętli)', () => {
    const t = tabelaImion({ lata: { '2010': { M: [['Jedyny', 10]], K: [] } } });
    const w = wynik(
      'test/jedyny',
      [osoba('o0', 'K', 1985), osoba('o1', 'M', 2010, { matka: 'o0' }), osoba('o2', 'M', 2010, { matka: 'o0' })],
      [dom('g0', ['o0', 'o1', 'o2'])],
    );
    nadajImiona(w, t, tabelaNazwisk(wielePar(3)), ziarno('jedyny'));
    expect(w.osoby[1].imie).toBe('Jedyny');
    expect(w.osoby[2].imie).toBe('Jedyny');
  });

  it('rodzeństwo wyjechałe też nie dzieli imienia z tym, który został', () => {
    const t = tabelaImion({
      lata: { '2005': { M: Array.from({ length: 30 }, (_, i) => [`Imię${i}`, 10] as [string, number]), K: [] } },
    });
    const N = 200;
    let wspolne = 0;
    for (let i = 0; i < N; i++) {
      const w = wynik(
        `test/wyjechal${i}`,
        [
          osoba('o0', 'K', 1980),
          osoba('o1', 'M', 2005, { matka: 'o0' }),
          osoba('o2', 'M', 2005, { matka: 'o0', stan: 'wyjechal', dokad: 'Niemcy' }),
        ],
        [dom('g0', ['o0', 'o1'])],
      );
      nadajImiona(w, t, tabelaNazwisk(wielePar(5)), ziarno('wyjechal', i));
      if (w.osoby[1].imie === w.osoby[2].imie) wspolne++;
    }
    expect(wspolne).toBe(0);
  });

  it('przyjezdni z wpisem wprowadzka po 2022 r. mają imię z puli przyjezdnych z szansą 15%, wcześniejsi i zwykli nie', () => {
    const przyjezdni = new Set([...imionaZListy(imiona.przyjezdni.M), ...imionaZListy(imiona.przyjezdni.K)]);
    const N = 3000;
    const liczba = (rok: number | null): number => {
      const w = samotni(N, 'M', 1990, `test/przyj${rok}`);
      if (rok !== null) w.dziennik = w.osoby.map((o) => ({ rok, typ: 'wprowadzka' as const, kto: o.id }));
      nadajImiona(w, imiona, pomorskie, ziarno('przyj', rok ?? 0));
      return w.osoby.filter((o) => przyjezdni.has(o.imie)).length;
    };
    const po = liczba(2040) / N;
    expect(po).toBeGreaterThan(0.135);
    expect(po).toBeLessThan(0.165);
    expect(liczba(2023) / N).toBeGreaterThan(0.135);
    expect(liczba(2022)).toBe(0);
    expect(liczba(2021)).toBe(0);
    expect(liczba(null)).toBe(0);
  });

  it('dzieci przyjezdnych: wpis wprowadzka mają wszyscy z rodziny, więc każdy losuje z szansą 15%', () => {
    const przyjezdni = new Set([...imionaZListy(imiona.przyjezdni.M), ...imionaZListy(imiona.przyjezdni.K)]);
    let n = 0;
    let z = 0;
    for (let i = 0; i < 400; i++) {
      const w = wynik(
        `test/przyjrodz${i}`,
        [
          osoba('o0', 'M', 1995, { partner: 'o1' }),
          osoba('o1', 'K', 1996, { partner: 'o0' }),
          osoba('o2', 'K', 2030, { matka: 'o1', ojciec: 'o0' }),
        ],
        [dom('g0', ['o0', 'o1', 'o2'])],
        [
          { rok: 2034, typ: 'wprowadzka', kto: 'o0' },
          { rok: 2034, typ: 'wprowadzka', kto: 'o1', z: 'o0' },
          { rok: 2034, typ: 'wprowadzka', kto: 'o2', z: 'o0' },
        ],
      );
      nadajImiona(w, imiona, pomorskie, ziarno('przyjrodz', i));
      for (const o of w.osoby) {
        n++;
        if (przyjezdni.has(o.imie)) z++;
      }
    }
    expect(z / n).toBeGreaterThan(0.12);
    expect(z / n).toBeLessThan(0.18);
  });
});

// ---------------------------------------------------------------- generator z nazwami

describe('generujBudynek i generujObszar z tabelami nazw (R36)', () => {
  const bez = generujObszar(przymorze, gdansk, kraj);
  const z = generujObszar(przymorze, gdansk, kraj, nazwy);
  const osobyZ = z.budynki.flatMap((w) => w.osoby);

  it('bez tabel imiona i nazwiska zostają puste (jak w kroku 2)', () => {
    for (const w of bez.budynki) for (const o of w.osoby) expect([o.imie, o.nazwisko]).toEqual(['', '']);
  });

  it('w Osiedlu Przymorza każda osoba, także nieobecna, ma niepuste imię i nazwisko', () => {
    expect(osobyZ.length).toBeGreaterThan(1000);
    expect(osobyZ.some((o) => o.stan !== 'tu')).toBe(true);
    for (const o of osobyZ) {
      expect(o.imie, o.id).not.toBe('');
      expect(o.nazwisko, o.id).not.toBe('');
    }
  });

  it('nic poza imieniem i nazwiskiem się nie zmienia: wynik z nazwami bez imion jest równy wynikowi bez nich', () => {
    const goly = JSON.parse(JSON.stringify(z)) as typeof z;
    for (const w of goly.budynki)
      for (const o of w.osoby) {
        o.imie = '';
        o.nazwisko = '';
      }
    expect(goly).toEqual(bez);
  });

  it('dwa wywołania dają ten sam wynik, a budynek osobno ten sam co w obszarze', () => {
    expect(generujObszar(przymorze, gdansk, kraj, nazwy)).toEqual(z);
    const budynki = budynkiZGeo(przymorze, gdansk, kraj);
    for (const i of [0, Math.floor(z.budynki.length / 2), z.budynki.length - 1]) {
      const w = z.budynki[i];
      const b = budynki.find((x) => x.klucz === w.budynek.klucz)!;
      expect(generujBudynek(b, gdansk, kraj, nazwy), b.klucz).toEqual(w);
    }
  });

  it('generujBudynek nie rusza budynku podanego przez wywołującego', () => {
    const b = budynkiZGeo(przymorze, gdansk, kraj)[0];
    const kopia = JSON.stringify(b);
    generujBudynek(b, gdansk, kraj, nazwy);
    expect(JSON.stringify(b)).toBe(kopia);
  });

  it('kobieta z nazwiskiem męskim na -ski ma formę na -ska, mężczyzna nigdy żeńską', () => {
    const kobiety = osobyZ.filter((o) => o.plec === 'K');
    const mezczyzni = osobyZ.filter((o) => o.plec === 'M');
    expect(kobiety.filter((o) => /(ski|cki|dzki)$/.test(o.nazwisko))).toEqual([]);
    expect(mezczyzni.filter((o) => /(ska|cka|dzka)$/.test(o.nazwisko))).toEqual([]);
    expect(kobiety.filter((o) => /(ska|cka|dzka)$/.test(o.nazwisko)).length).toBeGreaterThan(100);
  });

  it('dzieci pary mają nazwisko ojca (córki w formie żeńskiej), u samotnej matki nazwisko matki', () => {
    const wg = new Map(osobyZ.map((o) => [o.id, o]));
    const tabela = new Map<string, string>();
    for (const [m, f] of [...pomorskie.ogolne, ...pomorskie.lokalne]) {
      tabela.set(m, m);
      tabela.set(f, m);
    }
    const meska = (n: string): string => tabela.get(n) ?? `?${n}`;
    let poOjcu = 0;
    let poMatce = 0;
    for (const o of osobyZ) {
      // zamężna córka może mieć nazwisko męża (osobny test), więc tu synowie i córki bez partnera
      if (o.plec === 'K' && o.partner !== undefined) continue;
      if (o.ojciec !== undefined) {
        const ojciec = wg.get(o.ojciec)!;
        expect(meska(o.nazwisko), `${o.id} po ojcu`).toBe(ojciec.nazwisko);
        poOjcu++;
      } else if (o.matka !== undefined) {
        const matka = wg.get(o.matka)!;
        expect(meska(o.nazwisko), `${o.id} po matce`).toBe(meska(matka.nazwisko));
        poMatce++;
      }
    }
    expect(poOjcu).toBeGreaterThan(100);
    expect(poMatce).toBeGreaterThan(20);
  });

  it('żony ze wszystkich dem mają nazwisko męża w 80-90% par', () => {
    let pary = 0;
    let razem = 0;
    for (const [nazwa, g, tab] of [
      ['przymorze', gdansk, pomorskie],
      ['lanciego', ursynow, nazwiskaWoj('mazowieckie')],
      ['zielonki', zielonki, nazwiskaWoj('malopolskie')],
    ] as const) {
      const osiedle = generujObszar(demo(nazwa), g, kraj, { imiona, nazwiska: tab });
      const forma = new Map<string, string>();
      for (const [m, f] of [...tab.ogolne, ...tab.lokalne]) forma.set(m, f);
      for (const o of osiedle.budynki.flatMap((w) => w.osoby)) {
        if (o.plec !== 'M' || o.partner === undefined) continue;
        const zona = osiedle.budynki.flatMap((w) => w.osoby).find((x) => x.id === o.partner);
        if (zona?.plec !== 'K' || zona.partner !== o.id) continue;
        pary++;
        if (zona.nazwisko === forma.get(o.nazwisko)) razem++;
      }
    }
    expect(pary).toBeGreaterThan(400);
    expect(razem / pary).toBeGreaterThan(0.8);
    expect(razem / pary).toBeLessThan(0.9);
  });

  it('rodzeństwo z jednej matki w całym Przymorzu nie dzieli imienia', () => {
    const wspolne: string[] = [];
    const dzieci = new Map<string, Set<string>>();
    for (const o of osobyZ) {
      if (o.matka === undefined) continue;
      const imionaMatki = dzieci.get(o.matka) ?? new Set<string>();
      if (imionaMatki.has(o.imie)) wspolne.push(`${o.matka}:${o.imie}`);
      imionaMatki.add(o.imie);
      dzieci.set(o.matka, imionaMatki);
    }
    expect(wspolne).toEqual([]);
  });

  it('roczniki mają swoje imiona: nikt sprzed 1990 r. nie ma imienia z czołówki lat 2020 poza dwufalowymi', () => {
    for (const plec of PLCI) {
      const zakazane = new Set([...czolowka(plec)].filter((n) => !(IMIONA_DWUFALOWE as readonly string[]).includes(n)));
      // przyjezdni to osobna pula i też ich tu nie ma, ale dla pewności tylko osoby bez wpisu wprowadzka po 2022
      const przyjezdniWpis = new Set(
        z.budynki.flatMap((w) => w.dziennik.filter((d) => d.typ === 'wprowadzka' && d.rok > 2022).map((d) => d.kto)),
      );
      const stare = osobyZ.filter((o) => o.plec === plec && o.rocznik < 1990 && !przyjezdniWpis.has(o.id));
      expect(stare.length).toBeGreaterThan(100);
      expect(stare.filter((o) => zakazane.has(o.imie)).map((o) => `${o.rocznik} ${o.imie}`)).toEqual([]);
    }
  });

  it('osoby urodzone od 2031 r. nie mają imion przebrzmiałych ani Patryka', () => {
    const mlodzi = osobyZ.filter((o) => o.rocznik >= 2031);
    expect(mlodzi.length).toBeGreaterThan(100);
    expect(mlodzi.filter((o) => o.imie === 'Patryk' || o.imie === 'Angelika')).toEqual([]);
  });

  it('cały obszar dema z nazwami w Node poniżej 600 ms (cel 200 ms, mediana z 3)', () => {
    for (const [nazwa, g, tab] of [
      ['przymorze', gdansk, pomorskie],
      ['lanciego', ursynow, nazwiskaWoj('mazowieckie')],
      ['zielonki', zielonki, nazwiskaWoj('malopolskie')],
    ] as const) {
      const geo = demo(nazwa);
      const czasy: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        generujObszar(geo, g, kraj, { imiona, nazwiska: tab });
        czasy.push(performance.now() - t0);
      }
      czasy.sort((a, b) => a - b);
      expect(czasy[1], nazwa).toBeLessThan(600);
    }
  });
});

describe('src/mieszkancy/imiona.ts: reguły modułu', () => {
  const plik = path.join(KORZEN, 'src/mieszkancy/imiona.ts');
  const zrodlo = fs.existsSync(plik)
    ? fs
        .readFileSync(plik, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
    : '';

  it('bez trygonometrii, potęg i logarytmów', () => {
    expect(zrodlo).toMatch(/export function nadajImiona/);
    expect(zrodlo).not.toMatch(/Math\.(sin|cos|exp|log|pow|hypot|tan|atan|atan2|asin|acos|cbrt|expm1|log1p)\b/);
    expect(zrodlo).not.toMatch(/\*\*/);
  });

  it('nie importuje z sim, ui, render ani gov', () => {
    expect(zrodlo).not.toMatch(/from '\.\.\/(sim|ui|render|gov)\//);
  });

  it('losuje tylko przez los.ts: bez Math.random', () => {
    expect(zrodlo).not.toMatch(/Math\.random/);
  });
});
