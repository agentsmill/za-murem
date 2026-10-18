/* Tabele imion i nazwisk (public/data/mieszkancy/imiona.json i nazwiska/<woj>.json), wynik `npm run dane:imiona`.
   Trzy części:
   1. tabele z repozytorium: chodzą zawsze (CI nie ma surowych plików), sprawdzają liczby z badań i zakaz nazwisk
      polityków;
   2. czytniki i reguły z tools/dane/imiona.ts na małych, zmyślonych danych;
   3. odtworzenie tabel z surowych plików PESEL bajt w bajt; każdy test sprawdza istnienie swojego pliku. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KOSZYKI_IMION,
  type KoszykImion,
  PLIK_WOJEWODZTWA,
  type TabeleImion,
  type TabeleNazwisk,
  WERSJA_TABEL,
} from '../../src/mieszkancy/tabele.ts';
import {
  type DaneImion,
  type DaneNazwisk,
  jestTransliteracja,
  jestTransliteracjaSilna,
  koszykWgZmarlych,
  type Licznik,
  nazwiskaZakazane,
  ograniczUdzial,
  type Plec,
  parsujCsv,
  podzialKoszykow,
  polaczeniaZakazane,
  tabeleImion,
  tabeleNazwisk,
  wielkaLitera,
  wierszeImion,
  zenskaForma,
} from '../../tools/dane/imiona.ts';
import { SUROWE } from '../../tools/dane/sciezki.ts';

const KATALOG = path.resolve(import.meta.dirname, '../../public/data/mieszkancy');
const IMIONA = path.join(KATALOG, 'imiona.json');
const NAZWISKA = path.join(KATALOG, 'nazwiska');
const ZAKAZANE = path.resolve(import.meta.dirname, '../../tools/dane/zakazane-nazwiska.txt');
const POLACZENIA = path.resolve(import.meta.dirname, '../../tools/dane/zakazane-polaczenia.txt');
const SUROWE_IMIONA = path.join(SUROWE, 'imiona-nazwiska');

const wczytajNazwiska = (woj: string): TabeleNazwisk =>
  JSON.parse(fs.readFileSync(path.join(NAZWISKA, `${PLIK_WOJEWODZTWA[woj]}.json`), 'utf8')) as TabeleNazwisk;

const licznik = (o: Record<string, number>): Licznik => new Map(Object.entries(o));

// ---------------------------------------------------------------- 1. tabele z repozytorium

describe('tabele imion (imiona.json)', () => {
  const imiona = JSON.parse(fs.readFileSync(IMIONA, 'utf8')) as TabeleImion;
  const nazwy = (l: [string, number][]): string[] => l.map((x) => x[0]);

  it('ma wersję tabel i lata 2000-2025 po 200 imion na płeć, od najczęstszego, z co najmniej 10 nadaniami', () => {
    expect(imiona.wersja).toBe(WERSJA_TABEL);
    expect(Object.keys(imiona.lata)).toEqual(Array.from({ length: 26 }, (_, i) => String(2000 + i)));
    for (const [rok, p] of Object.entries(imiona.lata)) {
      for (const plec of ['M', 'K'] as const) {
        const l = p[plec];
        expect(l.length, `${rok} ${plec}`).toBe(200);
        for (let i = 0; i < l.length; i++) {
          expect(Number.isInteger(l[i][1]) && l[i][1] >= 10, `${rok} ${plec} ${l[i][0]}`).toBe(true);
          if (i > 0) expect(l[i][1], `${rok} ${plec} ${l[i][0]}`).toBeLessThanOrEqual(l[i - 1][1]);
        }
        expect(new Set(nazwy(l)).size).toBe(l.length);
      }
    }
  });

  it('zgadza się z oficjalnymi sumami i listami nadań (zbiór 219)', () => {
    expect(imiona.lata['2000'].M[0]).toEqual(['Jakub', 14497]);
    expect(imiona.lata['2000'].M[1]).toEqual(['Mateusz', 11454]);
    expect(imiona.lata['2025'].M.slice(0, 3)).toEqual([
      ['Nikodem', 5772],
      ['Antoni', 5253],
      ['Leon', 5079],
    ]);
    // remis w 2020 r. (7 351 nadań) rozstrzyga alfabet
    expect(imiona.lata['2020'].K.slice(0, 2)).toEqual([
      ['Julia', 7351],
      ['Zuzanna', 7351],
    ]);
  });

  it('pisze imiona po polsku, z wielkiej litery, bez znaków spoza liter', () => {
    const wzor = /^\p{Lu}\p{Ll}+(?:[- ]\p{Lu}\p{Ll}+)*$/u;
    const wszystkie = [
      ...Object.values(imiona.lata).flatMap((p) => [...p.M, ...p.K]),
      ...Object.values(imiona.koszyki).flatMap((p) => [...p.M, ...p.K]),
      ...imiona.przyjezdni.M,
      ...imiona.przyjezdni.K,
    ].map((x) => x[0]);
    for (const n of wszystkie) expect(n, n).toMatch(wzor);
    expect(imiona.lata['2000'].K.map((x) => x[0])).toContain('Żaneta');
  });

  it('zna pięć koszyków przed 2000 r. i tylko je, każdy z imionami obu płci od najliczniejszego', () => {
    expect(Object.keys(imiona.koszyki)).toEqual([...KOSZYKI_IMION]);
    for (const [k, p] of Object.entries(imiona.koszyki)) {
      for (const plec of ['M', 'K'] as const) {
        const l = p[plec];
        expect(l.length, `${k} ${plec}`).toBeGreaterThanOrEqual(15);
        expect(l.length, `${k} ${plec}`).toBeLessThanOrEqual(200);
        for (let i = 1; i < l.length; i++) expect(l[i][1], `${k} ${plec} ${l[i][0]}`).toBeLessThanOrEqual(l[i - 1][1]);
      }
    }
  });

  /** Wagi imienia w koszykach (bez koszyków, w których go nie ma). */
  const wagi = (p: 'M' | 'K', n: string): Partial<Record<KoszykImion, number>> =>
    Object.fromEntries(
      KOSZYKI_IMION.flatMap((b) => {
        const w = imiona.koszyki[b][p].find((x) => x[0] === n);
        return w ? [[b, w[1]]] : [];
      }),
    );
  const poczatek = (b: KoszykImion, p: 'M' | 'K', ile = 15): string[] => nazwy(imiona.koszyki[b][p].slice(0, ile));
  const ileZ = (lista: string[], imiona_: string[]): number => imiona_.filter((n) => lista.includes(n)).length;

  it('kładzie Janinę tylko wśród koszyków przed 1960, Agnieszkę wśród roczników 1975-1989, a Nikodema w żadnym', () => {
    expect(Object.keys(wagi('K', 'Janina')).sort()).toEqual(['1920-1945', '1946-1959']);
    expect(wagi('K', 'Agnieszka')['1920-1945']).toBeUndefined();
    expect(wagi('K', 'Agnieszka')['1975-1989']).toBeGreaterThan(300_000);
    expect(nazwy(imiona.lata['2024'].M)).toContain('Nikodem');
    expect(wagi('M', 'Nikodem')).toEqual({});
    expect(wagi('K', 'Nikodem')).toEqual({});
  });

  it('daje Marii udział także wśród najstarszych, a Annie w co najmniej trzech koszykach', () => {
    expect(wagi('K', 'Maria')['1920-1945']).toBeGreaterThan(30_000);
    expect(wagi('K', 'Maria')['1946-1959']).toBeGreaterThan(wagi('K', 'Maria')['1920-1945'] ?? 0);
    expect(Object.keys(wagi('K', 'Anna')).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(wagi('K', 'Anna'))).toEqual(expect.arrayContaining(['1946-1959', '1960-1974', '1990-1999']));
  });

  it('daje kobiecie urodzonej w 1958 r. Krystynę, Teresę, Halinę i Danutę, a nie same Janiny i Henryki', () => {
    const koszyk = poczatek('1946-1959', 'K');
    expect(ileZ(koszyk, ['Krystyna', 'Teresa', 'Danuta', 'Halina', 'Elżbieta', 'Barbara'])).toBeGreaterThanOrEqual(4);
    expect(koszyk.slice(0, 5)).toEqual(expect.arrayContaining(['Maria', 'Krystyna', 'Teresa']));
  });

  it('daje urodzonym w latach 90. imiona z lat 90., nie z lat 60.: Magdalenę, Monikę, Natalię, Aleksandrę, Mateusza, Kamila', () => {
    const kobiety = poczatek('1990-1999', 'K');
    expect(
      ileZ(kobiety, [
        'Katarzyna',
        'Aleksandra',
        'Karolina',
        'Natalia',
        'Paulina',
        'Magdalena',
        'Joanna',
        'Monika',
        'Agnieszka',
        'Anna',
      ]),
    ).toBeGreaterThanOrEqual(5);
    const mezczyzni = poczatek('1990-1999', 'M');
    expect(
      ileZ(mezczyzni, ['Jakub', 'Michał', 'Maciej', 'Piotr', 'Paweł', 'Marcin', 'Mateusz', 'Kamil']),
    ).toBeGreaterThanOrEqual(4);
    // połowa koszyka to lista nadań z 2000 r.: jej liderzy są w koszyku wysoko
    expect(poczatek('1990-1999', 'M', 5)).toEqual(expect.arrayContaining(['Mateusz', 'Kamil']));
    expect(wagi('K', 'Julia')['1990-1999']).toBeGreaterThan(50_000);
  });

  it('układa typowe imiona w głównych koszykach: największą wagę ma koszyk odpowiadający udziałowi zmarłych', () => {
    const glowny = (p: 'M' | 'K', n: string): string => Object.entries(wagi(p, n)).sort((a, b) => b[1] - a[1])[0][0];
    expect(glowny('M', 'Józef')).toBe('1920-1945');
    expect(glowny('K', 'Maria')).toBe('1946-1959');
    expect(glowny('K', 'Krystyna')).toBe('1946-1959');
    expect(glowny('M', 'Zbigniew')).toBe('1946-1959');
    expect(Object.keys(wagi('M', 'Andrzej'))).toEqual(expect.arrayContaining(['1946-1959', '1960-1974']));
    expect(glowny('K', 'Anna')).toBe('1960-1974');
    expect(glowny('M', 'Piotr')).toBe('1960-1974');
    expect(glowny('K', 'Agnieszka')).toBe('1975-1989');
    expect(glowny('M', 'Tomasz')).toBe('1975-1989');
    expect(glowny('K', 'Beata')).toBe('1990-1999');
    expect(glowny('M', 'Łukasz')).toBe('1990-1999');
  });

  it('nie daje żadnemu imieniu więcej niż 25% wagi koszyka', () => {
    for (const b of KOSZYKI_IMION) {
      for (const p of ['M', 'K'] as const) {
        const l = imiona.koszyki[b][p];
        const suma = l.reduce((s, x) => s + x[1], 0);
        for (const [n, w] of l) expect(w / suma, `${b} ${p} ${n}`).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it('wpisuje imiona o dwóch falach mody do najstarszego koszyka, z liczbą mniejszą od liczby żyjących', () => {
    const k = imiona.koszyki['1920-1945'];
    for (const n of ['Zofia', 'Julia', 'Helena']) expect(nazwy(k.K), n).toContain(n);
    for (const n of ['Antoni', 'Jan', 'Stanisław', 'Franciszek']) expect(nazwy(k.M), n).toContain(n);
    const julia = k.K.find((x) => x[0] === 'Julia');
    expect(julia?.[1]).toBeGreaterThan(10_000);
    expect(julia?.[1]).toBeLessThan(38_558); // żyjące Julie sprzed 2000 r.: 38 558
    for (const b of ['1946-1959', '1960-1974', '1975-1989'] as const) {
      expect(nazwy(imiona.koszyki[b].K), b).not.toContain('Julia');
      expect(nazwy(imiona.koszyki[b].M), b).not.toContain('Antoni');
    }
  });

  it('nie wpuszcza do koszyków imion z XXI wieku', () => {
    const wszystkie = new Set(Object.values(imiona.koszyki).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]));
    for (const n of ['Nikodem', 'Amelia', 'Lena', 'Marcel', 'Nikola']) expect(wszystkie.has(n), n).toBe(false);
  });

  it('nie wpuszcza do koszyków obcych imion, także tych z małym przyrostem', () => {
    const wszystkie = new Set(Object.values(imiona.koszyki).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]));
    for (const n of [
      'Mark',
      'Oleg',
      'Eduard',
      'Michael',
      'Denis',
      'Sergii',
      'Martin',
      'Uladzimir',
      'Vitali',
      'Yury',
      'Mikhail',
      'Vita',
      'Alena',
      'Anastasiya',
      'Yuliya',
      'Tatsiana',
      'Leonid',
      'Milana',
    ]) {
      expect(wszystkie.has(n), n).toBe(false);
    }
    for (const n of wszystkie) expect(jestTransliteracjaSilna(n), n).toBe(false);
    expect(wszystkie.has('Violetta')).toBe(true); // litera v sama nie wyklucza
  });

  it('trzyma przyjezdnych osobno: Oleksandr jest w przyjezdnych, a nie ma go w latach i koszykach', () => {
    expect(nazwy(imiona.przyjezdni.M)).toContain('Oleksandr');
    expect(nazwy(imiona.przyjezdni.K)).toContain('Tetiana');
    const przyrost = Object.fromEntries(imiona.przyjezdni.M);
    expect(przyrost.Oleksandr).toBe(95200);
    expect(przyrost.Serhii).toBe(56423);
    const wLatach = new Set(Object.values(imiona.lata).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]));
    expect(wLatach.has('Oleksandr')).toBe(false);
    const wKoszykach = new Set(Object.values(imiona.koszyki).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]));
    for (const p of [...imiona.przyjezdni.M, ...imiona.przyjezdni.K]) {
      expect(wKoszykach.has(p[0]), p[0]).toBe(false);
      expect(p[1]).toBeGreaterThanOrEqual(500);
    }
    // polskie imiona z rosnącą liczbą nie są przyjezdnymi
    for (const n of ['Hanna', 'Julia', 'Nikodem', 'Roman']) {
      expect([...nazwy(imiona.przyjezdni.M), ...nazwy(imiona.przyjezdni.K)], n).not.toContain(n);
    }
  });

  it('wyrzuca przyjezdnych z lat od 2022, a przed 2022 tylko tych, których wcześniej prawie nie nadawano', () => {
    for (const [n, p] of [
      ['Emiliia', 'K'],
      ['Matviy', 'M'],
      ['Zakhar', 'M'],
    ] as const) {
      expect(nazwy(imiona.przyjezdni[p]), n).toContain(n);
      for (const rok of ['2022', '2023', '2024', '2025'])
        expect(nazwy(imiona.lata[rok][p]), `${n} ${rok}`).not.toContain(n);
    }
    // Alexander i Maksym były nadawane w Polsce od lat, więc w latach przed napływem zostają
    for (const n of ['Alexander', 'Maksym']) {
      expect(nazwy(imiona.przyjezdni.M), n).toContain(n);
      for (const rok of ['2005', '2008', '2010', '2012', '2015'])
        expect(nazwy(imiona.lata[rok].M), `${n} ${rok}`).toContain(n);
      for (const rok of ['2022', '2023', '2024', '2025'])
        expect(nazwy(imiona.lata[rok].M), `${n} ${rok}`).not.toContain(n);
    }
    expect(nazwy(imiona.lata['2010'].M)).toContain('David');
  });

  it('wskazuje powracające imiona pradziadków', () => {
    expect(imiona.powracajace.M).toEqual(expect.arrayContaining(['Leon', 'Ignacy', 'Julian', 'Teodor']));
    expect(imiona.powracajace.K).toEqual(expect.arrayContaining(['Helena', 'Klara', 'Rozalia']));
    expect(imiona.powracajace.M).not.toContain('Nikodem');
    expect(imiona.powracajace.K).not.toContain('Wiktoria'); // udział spada
    for (const l of [imiona.powracajace.M, imiona.powracajace.K]) {
      expect(l.length).toBeGreaterThan(10);
      expect(new Set(l).size).toBe(l.length);
    }
  });
});

describe('tabele nazwisk (nazwiska/<woj>.json)', () => {
  const wojewodztwa = Object.keys(PLIK_WOJEWODZTWA);

  it('ma szesnaście województw i plik dla każdego, bez innych', () => {
    expect(wojewodztwa.length).toBe(16);
    expect(fs.readdirSync(NAZWISKA).sort()).toEqual(wojewodztwa.map((w) => `${PLIK_WOJEWODZTWA[w]}.json`).sort());
    for (const w of wojewodztwa) expect(PLIK_WOJEWODZTWA[w]).toMatch(/^[a-z-]+$/);
  });

  it('każdy plik ma 300 nazwisk ogólnych i najwyżej 100 lokalnych od najczęstszych, w parach męskie i żeńskie', () => {
    for (const w of wojewodztwa) {
      const t = wczytajNazwiska(w);
      expect(t.wersja).toBe(WERSJA_TABEL);
      expect(t.woj).toBe(w);
      expect(t.ogolne.length, w).toBe(300);
      // pula lokalna może być pusta tylko tam, gdzie prawie nie ma nazwisk lokalnych (lubuskie, zachodniopomorskie)
      if (t.udzialLokalnych >= 500) expect(t.lokalne.length, w).toBeGreaterThan(0);
      expect(t.lokalne.length, w).toBeLessThanOrEqual(100);
      expect(Number.isInteger(t.udzialLokalnych) && t.udzialLokalnych >= 0 && t.udzialLokalnych <= 10_000, w).toBe(
        true,
      );
      for (const lista of [t.ogolne, t.lokalne]) {
        for (let i = 0; i < lista.length; i++) {
          const [m, z, n] = lista[i];
          expect(m, w).toMatch(/^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)*$/u);
          expect(z, w).toMatch(/^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)*$/u);
          expect(Number.isInteger(n) && n > 0, `${w} ${m}`).toBe(true);
          if (i > 0) expect(n, `${w} ${m}`).toBeLessThanOrEqual(lista[i - 1][2]);
          expect([zenskaForma(m), m], `${w} ${m}`).toContain(z);
        }
        expect(new Set(lista.map((x) => x[0])).size, w).toBe(lista.length);
      }
    }
  });

  it('łączy męskie i żeńskie formy nazwisk', () => {
    const p = wczytajNazwiska('pomorskie');
    const pary = new Map(p.ogolne.map((x) => [x[0], x[1]]));
    expect(pary.get('Wiśniewski')).toBe('Wiśniewska');
    expect(pary.get('Kowalski')).toBe('Kowalska');
    expect(pary.get('Nowak')).toBe('Nowak');
    expect(pary.get('Kowalczyk')).toBe('Kowalczyk');
    const l = new Map(wczytajNazwiska('lubelskie').ogolne.map((x) => [x[0], x[1]]));
    expect(l.get('Zawadzki')).toBe('Zawadzka');
  });

  it('pomorskie: lokalne mają Formelę, Labudę i Kreft, a udział lokalnych to 2 020 ± 150 na 10 000', () => {
    const p = wczytajNazwiska('pomorskie');
    const lokalne = p.lokalne.map((x) => x[0]);
    expect(lokalne).toEqual(expect.arrayContaining(['Formela', 'Labuda', 'Kreft']));
    expect(p.udzialLokalnych).toBeGreaterThanOrEqual(1870);
    expect(p.udzialLokalnych).toBeLessThanOrEqual(2170);
    const formela = p.lokalne.find((x) => x[0] === 'Formela');
    expect(formela?.[1]).toBe('Formela');
    expect(formela?.[2]).toBe(1687);
  });

  it('zachodniopomorskie prawie nie ma nazwisk lokalnych: 110 ± 60 na 10 000', () => {
    const z = wczytajNazwiska('zachodniopomorskie');
    expect(z.udzialLokalnych).toBeGreaterThanOrEqual(50);
    expect(z.udzialLokalnych).toBeLessThanOrEqual(170);
  });

  it('udział lokalnych układa województwa jak w badaniach: Małopolska, Pomorze i Śląsk na czele, zachód na końcu', () => {
    const u = (w: string): number => wczytajNazwiska(w).udzialLokalnych;
    for (const w of ['małopolskie', 'pomorskie', 'śląskie', 'wielkopolskie']) {
      expect(u(w), w).toBeGreaterThan(1700);
      expect(u(w), w).toBeLessThan(2200);
    }
    for (const w of ['lubuskie', 'dolnośląskie', 'zachodniopomorskie', 'warmińsko-mazurskie']) {
      expect(u(w), w).toBeLessThan(400);
    }
  });

  it('wycina nazwiska polityków z listy zakazanych, w obu formach', () => {
    const zakazane = fs
      .readFileSync(ZAKAZANE, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'));
    expect(zakazane.length).toBeGreaterThan(30);
    for (const n of [
      'Rakowski',
      'Trzaskowski',
      'Grodzki',
      'Kołodziejczak',
      'Bodnar',
      'Tusk',
      'Ziobro',
      'Sasin',
      'Kaczyński',
      'Duda',
      'Morawiecki',
      'Nawrocki',
      'Komorowski',
      'Kwaśniewski',
    ]) {
      expect(zakazane, n).toContain(n);
    }
    const zakazaneFormy = new Set(zakazane.flatMap((n) => [n.toUpperCase(), zenskaForma(n).toUpperCase()]));
    for (const w of Object.keys(PLIK_WOJEWODZTWA)) {
      const t = wczytajNazwiska(w);
      for (const [m, z] of [...t.ogolne, ...t.lokalne]) {
        expect(zakazaneFormy.has(m.toUpperCase()), `${w} ${m}`).toBe(false);
        expect(zakazaneFormy.has(z.toUpperCase()), `${w} ${z}`).toBe(false);
      }
    }
  });

  it('wszystkie 17 plików razem mają mniej niż 600 KB', () => {
    const pliki = [IMIONA, ...fs.readdirSync(NAZWISKA).map((f) => path.join(NAZWISKA, f))];
    expect(pliki.length).toBe(17);
    const bajty = pliki.reduce((s, f) => s + fs.statSync(f).size, 0);
    expect(bajty).toBeLessThan(600 * 1024);
  });
});

// ---------------------------------------------------------------- 2. czytniki i reguły na małych danych

describe('pisownia imion i nazwisk', () => {
  it('zamienia WIELKIE LITERY na zapis polski, także po myślniku i spacji', () => {
    expect(wielkaLitera('JAKUB')).toBe('Jakub');
    expect(wielkaLitera('ŻANETA')).toBe('Żaneta');
    expect(wielkaLitera('ŁUKASZ')).toBe('Łukasz');
    expect(wielkaLitera('ANNA-MARIA')).toBe('Anna-Maria');
    expect(wielkaLitera('TUAN KIET')).toBe('Tuan Kiet');
    expect(wielkaLitera('KOSINIAK-KAMYSZ')).toBe('Kosiniak-Kamysz');
    expect(wielkaLitera('wiśniewski')).toBe('Wiśniewski');
  });

  it('tworzy żeńską formę nazwiska, zachowując wielkość liter', () => {
    expect(zenskaForma('Kowalski')).toBe('Kowalska');
    expect(zenskaForma('WIŚNIEWSKI')).toBe('WIŚNIEWSKA');
    expect(zenskaForma('Nowicki')).toBe('Nowicka');
    expect(zenskaForma('Zawadzki')).toBe('Zawadzka');
    expect(zenskaForma('Biały')).toBe('Biała');
    expect(zenskaForma('Konieczny')).toBe('Konieczna');
    expect(zenskaForma('Nowak')).toBe('Nowak');
    expect(zenskaForma('Wójcik')).toBe('Wójcik');
    expect(zenskaForma('Duda')).toBe('Duda');
    expect(zenskaForma('Tusk')).toBe('Tusk');
    expect(zenskaForma('Suchocki')).toBe('Suchocka');
  });
});

describe('czytnik list imion', () => {
  it('czyta CSV z BOM i średnikiem oraz z przecinkiem, wykrywając separator po nagłówku', () => {
    expect(parsujCsv('﻿IMIĘ_1;PŁEĆ;LICZBA\r\nZOFIA;K;2166\r\nZUZANNA;K;1830\r\n')).toEqual([
      ['IMIĘ_1', 'PŁEĆ', 'LICZBA'],
      ['ZOFIA', 'K', '2166'],
      ['ZUZANNA', 'K', '1830'],
    ]);
    expect(parsujCsv('Rok,Imię,Liczba,Płeć\n2000,JAKUB,14497,M\n')).toEqual([
      ['Rok', 'Imię', 'Liczba', 'Płeć'],
      ['2000', 'JAKUB', '14497', 'M'],
    ]);
  });

  it('znajduje kolumny po nagłówku w każdym z wariantów i pomija wiersze, które nie są imionami', () => {
    const w = wierszeImion(
      parsujCsv('Rok,Imię,Liczba,Płeć\n2000,JAKUB,14497,M\n2001,ANNA-MARIA,12,K\n2001,MD.,5,M\n2001,ROMEO JR.,7,M\n'),
    );
    expect(w).toEqual([
      { rok: 2000, imie: 'JAKUB', liczba: 14497, plec: 'M' },
      { rok: 2001, imie: 'ANNA-MARIA', liczba: 12, plec: 'K' },
    ]);
    expect(
      wierszeImion([
        ['IMIĘ PIERWSZE', 'PŁEĆ', 'LICZBA WYSTĄPIENIEŃ'],
        ['TUAN KIET', 'MĘŻCZYZNA', 2],
        ['ZOFIA', 'KOBIETA', 2166],
        ['-', 'KOBIETA', 17],
      ]),
    ).toEqual([
      { imie: 'TUAN KIET', liczba: 2, plec: 'M' },
      { imie: 'ZOFIA', liczba: 2166, plec: 'K' },
    ]);
    expect(wierszeImion(parsujCsv('IMIĘ 1,Liczba\nPIOTR,700289\n'))).toEqual([{ imie: 'PIOTR', liczba: 700289 }]);
  });

  it('zatrzymuje się, gdy nagłówek nie ma kolumny imienia albo liczby', () => {
    expect(() =>
      wierszeImion([
        ['A', 'B'],
        ['x', 1],
      ]),
    ).toThrow(/imi/i);
    expect(() =>
      wierszeImion([
        ['IMIĘ', 'COŚ'],
        ['ZOFIA', 1],
      ]),
    ).toThrow(/liczb/i);
  });
});

describe('transliteracja ukraińska i rosyjska', () => {
  it('rozpoznaje typowe litery, końcówki i pisownie', () => {
    for (const n of [
      'Oleksandr',
      'Serhii',
      'Andrii',
      'Yuliia',
      'Nataliia',
      'Tetiana',
      'Volodymyr',
      'Mykhailo',
      'Yaroslav',
      'Dmytro',
      'Svitlana',
      'Daniil',
      'Oleksii',
      'Aliaksandr',
      'Siarhei',
      'Khrystyna',
      'Alexander',
      'Olena',
      'Iryna',
      'Mykola',
      'Emiliia',
      'Matviy',
      'Zakhar',
      'Mark',
      'Oleg',
      'Eduard',
      'Michael',
      'Denis',
      'Martin',
      'Vitali',
      'Yury',
      'Mikhail',
      'Vita',
      'Alena',
      'Anastasiya',
      'Yuliya',
      'Tatsiana',
      'Uladzimir',
    ]) {
      expect(jestTransliteracja(n), n).toBe(true);
    }
    expect(jestTransliteracja('OLEKSANDR')).toBe(true);
  });

  it('odróżnia transliterację pewną od samej litery v, x, q, którą mają też zachodnie imiona Polaków', () => {
    for (const n of ['Emiliia', 'Matviy', 'Zakhar', 'Yuliya', 'Mikhail', 'Oleksandr', 'Mark', 'Vitali', 'Dmytro']) {
      expect(jestTransliteracjaSilna(n), n).toBe(true);
    }
    for (const n of [
      'Alexander',
      'Kevin',
      'Oliver',
      'Violetta',
      'Victoria',
      'Xavier',
      'David',
      'Viktor',
      'Maxymilian',
    ]) {
      expect(jestTransliteracja(n), n).toBe(true);
      expect(jestTransliteracjaSilna(n), n).toBe(false);
    }
  });

  it('nie bierze za transliterację polskich imion, także tych, które rosną razem z napływem', () => {
    for (const n of [
      'Jakub',
      'Hanna',
      'Julia',
      'Natalia',
      'Zuzanna',
      'Maria',
      'Aleksander',
      'Aleksandra',
      'Roman',
      'Igor',
      'Bohdan',
      'Szymon',
      'Maksymilian',
      'Krystyna',
      'Daria',
      'Olga',
      'Sofia',
      'Wiktor',
      'Marcel',
      'Cyryl',
      'Nikodem',
      'Maya',
      'Marcin',
      'Michał',
      'Edward',
      'Monika',
    ]) {
      expect(jestTransliteracja(n), n).toBe(false);
    }
  });
});

describe('koszyki: progi, miękki podział i ograniczenie udziału', () => {
  it('przypisuje koszyk według progów 60 / 30 / 12 / 5% zmarłych', () => {
    expect(koszykWgZmarlych(60, 40)).toBe('1920-1945');
    expect(koszykWgZmarlych(59, 41)).toBe('1946-1959');
    expect(koszykWgZmarlych(30, 70)).toBe('1946-1959');
    expect(koszykWgZmarlych(29, 71)).toBe('1960-1974');
    expect(koszykWgZmarlych(12, 88)).toBe('1960-1974');
    expect(koszykWgZmarlych(11, 89)).toBe('1975-1989');
    expect(koszykWgZmarlych(5, 95)).toBe('1975-1989');
    expect(koszykWgZmarlych(4, 96)).toBe('1990-1999');
    expect(koszykWgZmarlych(0, 100)).toBe('1990-1999');
  });

  it('dzieli imię między koszyk i sąsiada liniowo między środkami koszyków (75, 45, 20, 10, 2,5%)', () => {
    const ulamek = (z: number, ż: number) => {
      const p = podzialKoszykow(z, ż);
      return [p.glowny, p.sasiedni, p.licznik / p.mianownik] as const;
    };
    // na środku koszyka nic nie przechodzi do sąsiada
    expect(ulamek(45, 55)).toEqual(['1946-1959', '1920-1945', 0]);
    expect(ulamek(20, 80)).toEqual(['1960-1974', '1946-1959', 0]);
    // na progu 60% pół na pół między najstarszym a następnym
    expect(ulamek(60, 40)).toEqual(['1920-1945', '1946-1959', 0.5]);
    // w połowie drogi między środkami 45 i 20 (32,5%)
    expect(ulamek(325, 675)).toEqual(['1946-1959', '1960-1974', 0.5]);
    // 6,25% to połowa drogi między środkami 10 i 2,5
    expect(ulamek(5, 75)).toEqual(['1975-1989', '1990-1999', 0.5]);
    // Maria: 48,7% zmarłych, w głównym koszyku 1946-1959, około 12% wśród najstarszych
    const maria = podzialKoszykow(453_655, 477_420);
    expect(maria.glowny).toBe('1946-1959');
    expect(maria.sasiedni).toBe('1920-1945');
    expect(maria.licznik / maria.mianownik).toBeCloseTo(0.1245, 3);
    // koszyki skrajne nie mają sąsiada po zewnętrznej stronie
    expect(podzialKoszykow(80, 20).sasiedni).toBeNull();
    expect(podzialKoszykow(1, 99).sasiedni).toBeNull();
  });

  it('ucina udział pozycji do limitu i oddaje nadwyżkę pozostałym proporcjonalnie do ich wag', () => {
    const w = ograniczUdzial([60, 20, 10, 10], 25);
    const suma = w.reduce((a, b) => a + b, 0);
    expect(Math.max(...w) / suma).toBeLessThanOrEqual(0.25);
    expect(suma).toBeGreaterThan(90);
    expect(w[0]).toBeGreaterThanOrEqual(w[1]);
    expect(w[1]).toBeGreaterThanOrEqual(w[2]);
    // listy, które już mieszczą się w limicie, i za krótkie, żeby limit dało się spełnić, zostają bez zmian
    expect(ograniczUdzial([25, 25, 25, 25], 25)).toEqual([25, 25, 25, 25]);
    expect(ograniczUdzial([90, 5, 5], 25)).toEqual([90, 5, 5]);
    expect(ograniczUdzial([90, 5, 5], 100)).toEqual([90, 5, 5]);
    // kilka przebiegów, gdy po odjęciu nadwyżki kolejna pozycja też przekracza limit
    const kaskada = ograniczUdzial([1000, 400, 40, 30, 20, 10, 5, 5], 25);
    const sumaK = kaskada.reduce((a, b) => a + b, 0);
    expect(Math.max(...kaskada) / sumaK).toBeLessThanOrEqual(0.25);
    expect(kaskada.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
  });
});

describe('budowa tabel imion z małych list', () => {
  const urodzenia = (): DaneImion['urodzenia'] => {
    const u: DaneImion['urodzenia'] = {};
    for (let r = 2000; r <= 2026; r++) u[r] = { M: new Map(), K: new Map() };
    return u;
  };

  /** Zmyślony świat z udziałami zmarłych równo na środkach koszyków albo w połowie drogi między nimi, żeby wagi wyszły
      okrągłe. Kobiety (udział zmarłych w nawiasie): Genowefa (80%, cała w najstarszym), Mira (60%, pół na pół
      z 1946-1959), Krysta (45%), Ela (32,5%, pół na pół z 1960-1974), Anna (20%), Beata (10%), Dora (6,25%, pół na pół
      z 1990-1999), Aldona (2,5%), Julia (dwie fale), Hanna (21,9%, polskie, przybywa jej razem z napływem), Lena
      (imię z XXI wieku), Oleksandra i Emiliia (przyjezdne), Klara (stare imię, które wraca), Rzadka (za mało
      żyjących). Mężczyźni: Jan (dwie fale), Adam (10%), Dawid (2,5%), Alexander i Vitali (obce pisownie). */
  function swiat(): DaneImion {
    const u = urodzenia();
    for (let r = 2000; r <= 2025; r++) {
      u[r].K.set('LENA', 3000);
      u[r].K.set('JULIA', 2000);
      u[r].K.set('HANNA', r < 2020 ? 1000 : 3000);
      u[r].K.set('RZADKA', r === 2000 ? 12 : 9);
      u[r].M.set('JAN', 1000);
    }
    // lista z 2000 r. (blok 1990-1999 miesza ją po połowie z udziałem zmarłych): Anna 3 000, Aldona 1 500, Julia 3 000,
    // Hanna 1 500 (eligible), Lena i Rzadka odpadają (imię z XXI wieku, za mało żyjących)
    u[2000].K.set('ANNA', 3000);
    u[2000].K.set('ALDONA', 1500);
    u[2000].K.set('JULIA', 3000);
    u[2000].K.set('HANNA', 1500);
    u[2000].M.set('DAWID', 500);
    u[2019].K.set('KLARA', 100);
    u[2025].K.set('KLARA', 200);
    u[2026].K.set('KLARA', 300);
    u[2026].K.set('HANNA', 4000);
    u[2026].K.set('JULIA', 1500);
    // przyjezdna Emiliia: 20 nadań przed 2022 r., potem 120-200 rocznie
    u[2021].K.set('EMILIIA', 20);
    for (const [r, c] of [
      [2022, 120],
      [2023, 130],
      [2024, 170],
      [2025, 200],
    ])
      u[r].K.set('EMILIIA', c);
    // Alexander: nadawany w Polsce od lat (300 rocznie w 2005-2015), po 2022 r. 100 rocznie; Vitali ma 20 w 2010 r.
    for (let r = 2005; r <= 2015; r++) u[r].M.set('ALEXANDER', 300);
    for (let r = 2022; r <= 2025; r++) u[r].M.set('ALEXANDER', 100);
    u[2010].M.set('VITALI', 20);
    return {
      urodzenia: u,
      zyjacy: {
        M: licznik({
          JAN: 26_000 + 30_000,
          ADAM: 90_000,
          DAWID: 500 + 39_000,
          ALEXANDER: 3_700 + 11_000,
          VITALI: 5_620,
        }),
        K: licznik({
          GENOWEFA: 10_000,
          MIRA: 40_000,
          KRYSTA: 55_000,
          ELA: 67_500,
          ANNA: 3_000 + 80_000,
          BEATA: 90_000,
          DORA: 75_000,
          ALDONA: 1_500 + 97_500,
          JULIA: 53_000 + 12_000,
          HANNA: 38_500 + 71_500,
          LENA: 78_000 + 6_000,
          OLEKSANDRA: 30_000,
          EMILIIA: 3_777,
          KLARA: 7_800,
          RZADKA: 120,
        }),
      },
      razem: {
        M: licznik({
          JAN: 56_000 + 60_000,
          ADAM: 100_000,
          DAWID: 39_500 + 1_000,
          ALEXANDER: 14_700 + 100,
          VITALI: 5_620,
        }),
        K: licznik({
          GENOWEFA: 10_000 + 40_000,
          MIRA: 40_000 + 60_000,
          KRYSTA: 55_000 + 45_000,
          ELA: 67_500 + 32_500,
          ANNA: 83_000 + 20_000,
          BEATA: 90_000 + 10_000,
          DORA: 75_000 + 5_000,
          ALDONA: 99_000 + 2_500,
          JULIA: 65_000 + 14_000,
          HANNA: 110_000 + 20_000,
          LENA: 84_000 + 3_000,
          OLEKSANDRA: 30_000,
          EMILIIA: 3_777,
          KLARA: 7_800 + 22_500,
          RZADKA: 120,
        }),
      },
      zyjacy2019: {
        M: licznik({ JAN: 50_000, ADAM: 95_000, ALEXANDER: 8_935, VITALI: 5_520 }),
        K: licznik({ HANNA: 80_000, OLEKSANDRA: 2_000, LENA: 60_000, EMILIIA: 167 }),
      },
    };
  }

  /** Waga imienia w każdym koszyku, w którym jest. */
  const gdzie = (t: TabeleImion, p: Plec, n: string): Partial<Record<KoszykImion, number>> =>
    Object.fromEntries(
      KOSZYKI_IMION.flatMap((b) => {
        const w = t.koszyki[b][p].find((x) => x[0] === n);
        return w ? [[b, w[1]]] : [];
      }),
    );
  const bezLimitu = { maxUdzialWKoszyku: 100 };

  it('bierze do lat imiona z co najmniej 10 nadaniami i ucina do 200 najczęstszych', () => {
    const d = swiat();
    // 250 imion o liczbach 20 … 269, z nazwami z samych liter: ABAA, ABAB …
    const nazwa = (i: number): string =>
      `AB${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
    for (let i = 0; i < 250; i++) d.urodzenia[2010].K.set(nazwa(i), 20 + i);
    const t = tabeleImion(d, bezLimitu);
    const k = t.lata['2010'].K;
    expect(k.length).toBe(200);
    expect(k.slice(0, 4)).toEqual([
      ['Lena', 3000],
      ['Julia', 2000],
      ['Hanna', 1000],
      [wielkaLitera(nazwa(249)), 269],
    ]);
    expect(k[199]).toEqual([wielkaLitera(nazwa(53)), 73]); // 197 imion z generatora: 269 … 73
    expect(t.lata['2000'].K.map((x) => x[0])).toContain('Rzadka'); // 12 nadań
    expect(t.lata['2001'].K.map((x) => x[0])).not.toContain('Rzadka'); // 9 nadań
    expect(Object.keys(t.lata)).toHaveLength(26);
  });

  it('dzieli imię między koszyki według udziału zmarłych wśród urodzonych przed 2000 r.', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    expect(gdzie(t, 'K', 'Genowefa')).toEqual({ '1920-1945': 10_000 }); // 80%: cała w najstarszym
    expect(gdzie(t, 'K', 'Mira')).toEqual({ '1920-1945': 20_000, '1946-1959': 20_000 }); // 60%: pół na pół
    expect(gdzie(t, 'K', 'Krysta')).toEqual({ '1946-1959': 55_000 }); // 45%: środek koszyka
    expect(gdzie(t, 'K', 'Ela')).toEqual({ '1946-1959': 33_750, '1960-1974': 33_750 }); // 32,5%
    expect(gdzie(t, 'K', 'Beata')).toEqual({ '1975-1989': 90_000 }); // 10%: środek koszyka
    expect(gdzie(t, 'K', 'Dora')).toEqual({ '1975-1989': 37_500, '1990-1999': 18_750 }); // 6,25%; połowa z udziału
    // Anna (20%, środek 1960-1974) ma też wagę w 1990-1999 z listy 2000 r.
    expect(gdzie(t, 'K', 'Anna')).toEqual({ '1960-1974': 80_000, '1990-1999': 22_500 });
    // Hanna: 71 500 żyjących sprzed 2000 r., 20 000 zmarłych (21,9%), 7% wśród 1946-1959; 11 250 z listy 2000 r.
    const hanna = gdzie(t, 'K', 'Hanna');
    expect(hanna['1946-1959']).toBeGreaterThan(5000);
    expect(hanna['1946-1959']).toBeLessThan(5500);
    expect((hanna['1946-1959'] ?? 0) + (hanna['1960-1974'] ?? 0)).toBe(71_500);
    expect(hanna['1990-1999']).toBe(11_250);
    expect(gdzie(t, 'M', 'Adam')).toEqual({ '1975-1989': 90_000 });
  });

  it('miesza koszyk 1990-1999 po połowie z listą nadań z 2000 r. i zachowuje jego łączną wagę', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    const k = t.koszyki['1990-1999'].K;
    // część z udziału zmarłych: Aldona 97 500 i Dora 37 500 = 135 000; lista 2000: Anna 3 000, Aldona 1 500, Julia 3 000,
    // Hanna 1 500 (razem 9 000); waga = 135 000 × (½ × część z udziału + ½ × część z listy)
    expect(k).toEqual([
      ['Aldona', 60_000], // 48 750 + 11 250
      ['Anna', 22_500],
      ['Julia', 22_500],
      ['Dora', 18_750],
      ['Hanna', 11_250],
    ]);
    expect(k.reduce((s, x) => s + x[1], 0)).toBe(135_000);
    // mężczyźni: część z udziału Dawid 39 000; lista 2000: Dawid 500 i Jan 1 000, ale Jan (67% zmarłych) jest starym
    // imieniem i z listy 2000 r. nie wchodzi, więc lista zostaje przy Dawidzie
    expect(t.koszyki['1990-1999'].M).toEqual([['Dawid', 39_000]]);
  });

  it('ustawia imiona w koszyku od najliczniejszego, z remisem po nazwie', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    expect(t.koszyki['1920-1945'].K.map((x) => x[0])).toEqual(['Mira', 'Genowefa', 'Klara', 'Julia']);
    expect(t.koszyki['1946-1959'].K.map((x) => x[0])).toEqual(['Krysta', 'Ela', 'Mira', 'Hanna']);
    expect(t.koszyki['1960-1974'].K.map((x) => x[0])).toEqual(['Anna', 'Hanna', 'Ela']);
    expect(t.koszyki['1975-1989'].K.map((x) => x[0])).toEqual(['Beata', 'Dora']);
  });

  it('nie pozwala jednemu imieniu przekroczyć 25% wagi koszyka (domyślnie)', () => {
    const t = tabeleImion(swiat());
    const k = t.koszyki['1990-1999'].K; // bez limitu Aldona miałaby 44%
    const suma = k.reduce((s, x) => s + x[1], 0);
    expect(suma).toBeGreaterThan(134_900);
    expect(suma).toBeLessThanOrEqual(135_000);
    expect(k[0][0]).toBe('Aldona');
    expect(k[0][1] / suma).toBeLessThanOrEqual(0.25);
    expect(k.map((x) => x[0]).sort()).toEqual(['Aldona', 'Anna', 'Dora', 'Hanna', 'Julia']);
    // lista krótsza niż cztery pozycje nie ma jak spełnić limitu i zostaje bez zmian
    expect(t.koszyki['1990-1999'].M).toEqual([['Dawid', 39_000]]);
  });

  it('opuszcza imiona z mniej niż 5 000 żyjącymi sprzed 2000 r. i imiona z XXI wieku', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    expect(gdzie(t, 'K', 'Rzadka')).toEqual({}); // żyjących sprzed 2000 r. brak
    // Lena: nadań 78 000, żyjących sprzed 2000 r. 6 000 (udział zmarłych 33%, a koszyk 1946-1959 bez ochrony)
    expect(gdzie(t, 'K', 'Lena')).toEqual({});
    expect(t.lata['2024'].K).toContainEqual(['Lena', 3000]); // w latach zostaje
  });

  it('odsyła przyjezdnych do osobnej puli, a z koszyków wyrzuca także obce pisownie bez względu na przyrost', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    // Oleksandra: 30 000 żyjących minus 2 000 w 2019 r.; Emiliia: pewna transliteracja (ii), więc od przyrostu 500
    expect(t.przyjezdni.K).toEqual([
      ['Oleksandra', 28_000],
      ['Emiliia', 3_610],
    ]);
    // Alexander: litera x, przyrost 5 765 (≥ 5 000); Vitali: pisownia z listy, ale przyrost tylko 100
    expect(t.przyjezdni.M).toEqual([['Alexander', 5_765]]);
    expect(gdzie(t, 'K', 'Oleksandra')).toEqual({});
    expect(gdzie(t, 'M', 'Alexander')).toEqual({});
    expect(gdzie(t, 'M', 'Vitali')).toEqual({}); // obca pisownia nie wchodzi do koszyków nawet bez przyrostu
    // Hanna przybyła o 30 000, ale to polskie imię
    expect(t.przyjezdni.K.map((x) => x[0])).not.toContain('Hanna');
    expect(t.lata['2024'].K.map((x) => x[0])).toContain('Hanna');
  });

  it('wyrzuca przyjezdnych z lat od 2022, a wcześniej tylko tych, których przed 2022 prawie nie nadawano', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    for (const rok of ['2022', '2023', '2024', '2025']) {
      expect(
        t.lata[rok].K.map((x) => x[0]),
        rok,
      ).not.toContain('Emiliia');
      expect(
        t.lata[rok].M.map((x) => x[0]),
        rok,
      ).not.toContain('Alexander');
    }
    expect(t.lata['2021'].K.map((x) => x[0])).not.toContain('Emiliia'); // 20 nadań przed 2022 to mało
    for (const rok of ['2005', '2010', '2015'])
      expect(
        t.lata[rok].M.map((x) => x[0]),
        rok,
      ).toContain('Alexander');
    expect(t.lata['2004'].M.map((x) => x[0])).not.toContain('Alexander'); // 0 nadań
    expect(t.lata['2010'].M).toContainEqual(['Vitali', 20]); // obca pisownia, ale nie przyjezdny
  });

  it('wpisuje dwufalowe imiona do najstarszego koszyka z liczbą pomniejszoną o udział zmarłych', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    // Julia: żyjących sprzed 2000 r. 65 000 - 53 000 = 12 000, zmarłych 14 000 (54%); 12 000 × 14 000 / 26 000 = 6 462
    // w koszyku 1920-1945, a w 1990-1999 z listy 2000 r.
    expect(gdzie(t, 'K', 'Julia')).toEqual({ '1920-1945': 6462, '1990-1999': 22_500 });
    // Jan: 56 000 - 26 000 = 30 000 żyjących, 60 000 zmarłych (67%); 30 000 × 60 000 / 90 000 = 20 000
    expect(gdzie(t, 'M', 'Jan')).toEqual({ '1920-1945': 20_000 });
  });

  it('wskazuje stare imiona, których udział w nadaniach rośnie od 2019 do 2026', () => {
    const t = tabeleImion(swiat(), bezLimitu);
    // Klara: udział 100 / 6 109 w 2019 i 300 / 5 800 w pierwszej połowie 2026, a zmarłych 22 500 (75%)
    expect(t.powracajace.K).toEqual(['Klara']);
    // Julia traci udział, Hanna nie jest stara, Jan nie miał nadań w 2026
    expect(t.powracajace.M).toEqual([]);
  });

  it('zatrzymuje się, gdy imię z rejestru żyjących nie ma wpisu w rejestrze ze zmarłymi', () => {
    const d = swiat();
    d.zyjacy.K.set('NIEMA', 9000);
    expect(() => tabeleImion(d)).toThrow(/NIEMA/);
  });
});

describe('budowa tabel nazwisk z małych list', () => {
  const woj = (a: [string, Record<string, number>][]): Map<string, Licznik> =>
    new Map(a.map(([w, n]) => [w, licznik(n)]));
  /** Trzy województwa. Kowalski i Nowak są wszędzie, Formela prawie tylko na Pomorzu, Mały też, Tusk jest zakazany,
      Rzadki ma za mało nosicieli w kraju. */
  const dane = (): DaneNazwisk => ({
    woj: {
      M: woj([
        ['POMORSKIE', { KOWALSKI: 3000, NOWAK: 2000, FORMELA: 1700, TUSK: 400, RZADKI: 10, MAŁY: 500 }],
        ['ŚLĄSKIE', { KOWALSKI: 3000, NOWAK: 9000, FORMELA: 100, TUSK: 10, RZADKI: 5, MAŁY: 50 }],
        ['MAZOWIECKIE', { KOWALSKI: 3000, NOWAK: 9000 }],
      ]),
      K: woj([
        ['POMORSKIE', { KOWALSKA: 3000, NOWAK: 2000, FORMELA: 1600, MAŁA: 480 }],
        ['ŚLĄSKIE', { KOWALSKA: 3000, NOWAK: 9000, FORMELA: 90, MAŁA: 40 }],
        ['MAZOWIECKIE', { KOWALSKA: 3000, NOWAK: 9000 }],
      ]),
    },
    kraj: {
      M: licznik({ KOWALSKI: 9000, NOWAK: 20000, FORMELA: 2200, TUSK: 420, RZADKI: 15, MAŁY: 600 }),
      K: licznik({ KOWALSKA: 9500, NOWAK: 20000, FORMELA: 2000, MAŁA: 590 }),
    },
    zakazane: nazwiskaZakazane('Tusk\n'),
  });
  const wyniki = (): ReturnType<typeof tabeleNazwisk> => tabeleNazwisk(dane(), { ogolne: 300, lokalne: 100 });

  it('buduje tabelę dla każdego województwa w danych, z nazwą małymi literami, w kolejności z PLIK_WOJEWODZTWA', () => {
    expect(wyniki().tabele.map((t) => t.woj)).toEqual(['mazowieckie', 'pomorskie', 'śląskie']);
    expect(wyniki().tabele.every((t) => t.wersja === WERSJA_TABEL)).toBe(true);
  });

  it('wycina nazwiska z mniej niż 300 nosicielami w kraju i zakazane, a formy żeńskie bierze z rejestru kobiet', () => {
    const pom = wyniki().tabele.find((t) => t.woj === 'pomorskie')!;
    expect(pom.ogolne).toEqual([
      ['Kowalski', 'Kowalska', 3000],
      ['Nowak', 'Nowak', 2000],
      ['Formela', 'Formela', 1700],
      ['Mały', 'Mała', 500],
    ]);
  });

  it('uznaje za lokalne nazwisko z co najmniej połową nosicieli w województwie i liczy udział na 10 000', () => {
    const { tabele, diagnostyka } = wyniki();
    const pom = tabele.find((t) => t.woj === 'pomorskie')!;
    // Formela 1700 z 1800, Mały 500 z 550, Tusk 400 z 410 (zakazany, więc poza pulą); Rzadki ma w sumie 15 < 20 osób
    expect(pom.lokalne).toEqual([
      ['Formela', 'Formela', 1700],
      ['Mały', 'Mała', 500],
    ]);
    // w udziale liczą się wszystkie lokalne z co najmniej 20 nosicielami, także zakazane: 2 600 z 7 610 mężczyzn
    expect(pom.udzialLokalnych).toBe(3417);
    expect(tabele.find((t) => t.woj === 'śląskie')!.lokalne).toEqual([]);
    expect(tabele.find((t) => t.woj === 'śląskie')!.udzialLokalnych).toBe(0);
    // kobiety liczone osobno, z własnych plików: Formela 1 600 z 1 690 i Mała 480 z 520, razem 2 080 z 7 080
    const d = diagnostyka.find((x) => x.woj === 'pomorskie')!;
    expect(d.udzialM).toBe(3417);
    expect(d.udzialK).toBe(2938);
    expect(d.zakazanych).toBe(1);
    expect(d.bezPary).toBe(0);
  });

  it('wybiera formę żeńską z rejestru: -ska dla przymiotnikowych, to samo nazwisko dla wyjątków', () => {
    const d = dane();
    d.woj.M.get('POMORSKIE')!.set('OLEKSY', 800);
    d.woj.M.get('ŚLĄSKIE')!.set('OLEKSY', 100);
    d.kraj.M.set('OLEKSY', 3000);
    d.kraj.K.set('OLEKSA', 400); // Oleksa to inne nazwisko (mała liczba)
    d.kraj.K.set('OLEKSY', 2800);
    const { tabele } = tabeleNazwisk(d, { ogolne: 300, lokalne: 100 });
    expect(tabele.find((t) => t.woj === 'pomorskie')!.ogolne).toContainEqual(['Oleksy', 'Oleksy', 800]);
  });

  it('pomija nazwisko, którego żeńskiej formy nie ma w rejestrze kobiet', () => {
    const d = dane();
    d.woj.M.get('POMORSKIE')!.set('DZIWNY', 900);
    d.kraj.M.set('DZIWNY', 1000);
    const { tabele, diagnostyka } = tabeleNazwisk(d, { ogolne: 300, lokalne: 100 });
    expect(tabele.find((t) => t.woj === 'pomorskie')!.ogolne.map((x) => x[0])).not.toContain('Dziwny');
    expect(diagnostyka.find((x) => x.woj === 'pomorskie')!.bezPary).toBe(1);
  });

  it('zatrzymuje się na nieznanym województwie', () => {
    const d = dane();
    d.woj.M.set('ATLANTYDA', licznik({ KOWALSKI: 1 }));
    expect(() => tabeleNazwisk(d, { ogolne: 300, lokalne: 100 })).toThrow(/ATLANTYDA/);
  });

  it('ucina listy do podanych liczb', () => {
    const pom = tabeleNazwisk(dane(), { ogolne: 2, lokalne: 1 }).tabele.find((t) => t.woj === 'pomorskie')!;
    expect(pom.ogolne.map((x) => x[0])).toEqual(['Kowalski', 'Nowak']);
    expect(pom.lokalne.map((x) => x[0])).toEqual(['Formela']);
  });

  it('czyta listę zakazanych nazwisk: linie bez pustych, w obu formach, wielkimi literami', () => {
    expect(nazwiskaZakazane('Tusk\nKaczyński\n\n  Suchocki  \n')).toEqual(
      new Set(['TUSK', 'KACZYŃSKI', 'KACZYŃSKA', 'SUCHOCKI', 'SUCHOCKA']),
    );
  });

  it('lista zakazanych nazwisk pomija linie z komentarzem (#) i puste', () => {
    expect(nazwiskaZakazane('# politycy\nTusk\n  # wcięty komentarz\n\n#Kaczyński\nRakowski\n')).toEqual(
      new Set(['TUSK', 'RAKOWSKI', 'RAKOWSKA']),
    );
  });
});

// ---------------------------------------------------------------- zakazane połączenia imienia z nazwiskiem

describe('zakazane połączenia imienia z nazwiskiem (znane osoby)', () => {
  it('czyta „Imię Nazwisko” w linii: bez komentarzy i pustych, jako „Imię|Nazwisko”, posortowane bez powtórzeń', () => {
    expect(
      polaczeniaZakazane(
        '# znane osoby\nRobert Lewandowski\n\n  Anna   Lewandowska  \nRobert Lewandowski\nJan Kowalski-Nowak\n',
      ),
    ).toEqual(['Anna|Lewandowska', 'Jan|Kowalski-Nowak', 'Robert|Lewandowski']);
  });

  it('linia bez nazwiska albo z małej litery zatrzymuje budowę z numerem linii', () => {
    expect(() => polaczeniaZakazane('Robert Lewandowski\nMadonna\n')).toThrow(/linia 2/);
    expect(() => polaczeniaZakazane('robert lewandowski\n')).toThrow(/linia 1/);
  });

  it('plik w tools/dane ma znane osoby z przeglądu, a imiona.json niesie tę samą listę', () => {
    const lista = polaczeniaZakazane(fs.readFileSync(POLACZENIA, 'utf8'));
    for (const p of ['Anna|Lewandowska', 'Robert|Lewandowski', 'Justyna|Kowalczyk', 'Radosław|Sikorski']) {
      expect(lista, p).toContain(p);
    }
    const t = JSON.parse(fs.readFileSync(IMIONA, 'utf8')) as TabeleImion;
    expect(t.zakazanePolaczenia).toEqual(lista);
  });
});

// ---------------------------------------------------------------- 3. odtworzenie z surowych plików

describe.skipIf(!fs.existsSync(SUROWE_IMIONA))('odtworzenie tabel z surowych plików PESEL', () => {
  it('daje te same bajty co pliki w repozytorium (powtarzalność)', async () => {
    const { zbudujZPlikow } = await import('../../tools/dane/imiona-pliki.ts');
    const wynik = zbudujZPlikow(SUROWE_IMIONA, ZAKAZANE, POLACZENIA);
    expect(`${JSON.stringify(wynik.imiona)}\n`).toBe(fs.readFileSync(IMIONA, 'utf8'));
    for (const t of wynik.nazwiska) {
      const plik = path.join(NAZWISKA, `${PLIK_WOJEWODZTWA[t.woj]}.json`);
      expect(`${JSON.stringify(t)}\n`, t.woj).toBe(fs.readFileSync(plik, 'utf8'));
    }
  });
});
