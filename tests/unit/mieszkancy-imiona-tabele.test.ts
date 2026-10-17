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
  type ImieZLiczba,
  KOSZYKI_IMION,
  PLIK_WOJEWODZTWA,
  type TabeleImion,
  type TabeleNazwisk,
  WERSJA_TABEL,
} from '../../src/mieszkancy/tabele.ts';
import {
  type DaneImion,
  type DaneNazwisk,
  jestTransliteracja,
  type Licznik,
  nazwiskaZakazane,
  type Plec,
  parsujCsv,
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

  it('kładzie Janinę wśród najstarszych, Agnieszkę wśród roczników 1975-1989, a Nikodema w żadnym koszyku przed 1990', () => {
    const k = imiona.koszyki;
    expect(nazwy(k['1920-1945'].K)).toContain('Janina');
    expect(nazwy(k['1920-1945'].K)).not.toContain('Agnieszka');
    expect(nazwy(k['1975-1989'].K)).toContain('Agnieszka');
    expect(nazwy(imiona.lata['2024'].M)).toContain('Nikodem');
    for (const b of ['1920-1945', '1946-1959', '1960-1974', '1975-1989'] as const) {
      expect(nazwy(k[b].M), b).not.toContain('Nikodem');
    }
  });

  it('układa typowe imiona kobiet i mężczyzn w kolejnych koszykach', () => {
    const k = imiona.koszyki;
    const wKoszyku = (b: (typeof KOSZYKI_IMION)[number], p: 'M' | 'K', n: string): boolean =>
      nazwy(k[b][p]).includes(n);
    expect(wKoszyku('1920-1945', 'M', 'Józef')).toBe(true);
    expect(wKoszyku('1946-1959', 'K', 'Maria')).toBe(true);
    expect(wKoszyku('1960-1974', 'K', 'Krystyna')).toBe(true);
    expect(wKoszyku('1960-1974', 'M', 'Andrzej')).toBe(true);
    expect(wKoszyku('1975-1989', 'M', 'Piotr')).toBe(true);
    expect(wKoszyku('1990-1999', 'K', 'Beata')).toBe(true);
    expect(wKoszyku('1990-1999', 'M', 'Łukasz')).toBe(true);
  });

  it('wpisuje imiona o dwóch falach mody do najstarszego koszyka, z liczbą mniejszą od liczby żyjących', () => {
    const k = imiona.koszyki['1920-1945'];
    for (const n of ['Zofia', 'Julia', 'Helena']) expect(nazwy(k.K), n).toContain(n);
    for (const n of ['Antoni', 'Jan', 'Stanisław', 'Franciszek']) expect(nazwy(k.M), n).toContain(n);
    const julia = k.K.find((x) => x[0] === 'Julia');
    expect(julia?.[1]).toBeGreaterThan(10_000);
    expect(julia?.[1]).toBeLessThan(38_558); // żyjące Julie sprzed 2000 r.: 38 558
    for (const b of ['1946-1959', '1960-1974', '1975-1989', '1990-1999'] as const) {
      expect(nazwy(imiona.koszyki[b].K), b).not.toContain('Julia');
      expect(nazwy(imiona.koszyki[b].M), b).not.toContain('Antoni');
    }
  });

  it('nie wpuszcza do koszyków imion z XXI wieku', () => {
    const wszystkie = new Set(Object.values(imiona.koszyki).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]));
    for (const n of ['Nikodem', 'Amelia', 'Lena', 'Marcel', 'Nikola']) expect(wszystkie.has(n), n).toBe(false);
  });

  it('trzyma przyjezdnych osobno: Oleksandr jest w przyjezdnych, a nie ma go w latach i koszykach', () => {
    expect(nazwy(imiona.przyjezdni.M)).toContain('Oleksandr');
    expect(nazwy(imiona.przyjezdni.K)).toContain('Tetiana');
    const przyrost = Object.fromEntries(imiona.przyjezdni.M);
    expect(przyrost.Oleksandr).toBe(95200);
    expect(przyrost.Serhii).toBe(56423);
    const zwykle = new Set([
      ...Object.values(imiona.lata).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]),
      ...Object.values(imiona.koszyki).flatMap((p) => [...nazwy(p.M), ...nazwy(p.K)]),
    ]);
    for (const p of [...imiona.przyjezdni.M, ...imiona.przyjezdni.K]) {
      expect(zwykle.has(p[0]), p[0]).toBe(false);
      expect(p[1]).toBeGreaterThanOrEqual(5000);
    }
    // polskie imiona z rosnącą liczbą nie są przyjezdnymi
    for (const n of ['Hanna', 'Julia', 'Nikodem', 'Roman']) {
      expect([...nazwy(imiona.przyjezdni.M), ...nazwy(imiona.przyjezdni.K)], n).not.toContain(n);
    }
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
      .filter((l) => l !== '');
    expect(zakazane.length).toBeGreaterThan(30);
    for (const n of [
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
    ]) {
      expect(jestTransliteracja(n), n).toBe(true);
    }
    expect(jestTransliteracja('OLEKSANDR')).toBe(true);
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
      'Mark',
      'Wiktor',
      'Marcel',
      'Cyryl',
      'Nikodem',
    ]) {
      expect(jestTransliteracja(n), n).toBe(false);
    }
  });
});

describe('budowa tabel imion z małych list', () => {
  const urodzenia = (): DaneImion['urodzenia'] => {
    const u: DaneImion['urodzenia'] = {};
    for (let r = 2000; r <= 2026; r++) u[r] = { M: new Map(), K: new Map() };
    return u;
  };

  /** Zmyślony świat. Kobiety: Genowefa i Janina (stare, prawie same zmarłe), Ewa (28% zmarłych), Beata (10%), Aldona
      (urodzona w latach 90.), Lena (imię z XXI wieku z kilkoma tysiącami „starszych” Len w różnicy), Julia (dwie
      fale), Hanna (polskie, przybywa jej razem z napływem), Oleksandra (ukraińska), Klara (stare imię, które wraca)
      i Rzadka (za mało żyjących). Mężczyźni: Jan (dwie fale) i Adam. */
  function swiat(): DaneImion {
    const u = urodzenia();
    for (let r = 2000; r <= 2025; r++) {
      u[r].K.set('LENA', 3000);
      u[r].K.set('JULIA', 2000);
      u[r].K.set('HANNA', r < 2020 ? 1000 : 3000);
      u[r].K.set('RZADKA', r === 2000 ? 12 : 9);
      u[r].M.set('JAN', 1000);
    }
    u[2019].K.set('KLARA', 100);
    u[2025].K.set('KLARA', 200);
    u[2026].K.set('KLARA', 300);
    u[2026].K.set('HANNA', 4000);
    u[2026].K.set('JULIA', 1500);
    return {
      urodzenia: u,
      zyjacy: {
        M: licznik({ JAN: 26_000 + 30_000, ADAM: 100_000 }),
        K: licznik({
          GENOWEFA: 10_000,
          JANINA: 20_000,
          EWA: 100_000,
          BEATA: 90_000,
          ALDONA: 30_000,
          LENA: 78_000 + 6_000,
          JULIA: 52_000 + 12_000,
          HANNA: 38_000 + 72_000,
          OLEKSANDRA: 30_000,
          KLARA: 8_000,
          RZADKA: 120,
        }),
      },
      razem: {
        M: licznik({ JAN: 56_000 + 60_000, ADAM: 100_000 + 10_000 }),
        K: licznik({
          GENOWEFA: 10_000 + 40_000,
          JANINA: 20_000 + 40_000,
          EWA: 100_000 + 40_000,
          BEATA: 90_000 + 10_000,
          ALDONA: 30_000 + 100,
          LENA: 84_000 + 3_000,
          JULIA: 64_000 + 14_000,
          HANNA: 110_000 + 20_000,
          OLEKSANDRA: 30_000,
          KLARA: 8_000 + 20_000,
          RZADKA: 120,
        }),
      },
      zyjacy2019: {
        M: licznik({ JAN: 50_000, ADAM: 105_000 }),
        K: licznik({ HANNA: 80_000, OLEKSANDRA: 2_000, LENA: 60_000 }),
      },
    };
  }

  const gdzie = (t: TabeleImion, p: Plec, n: string): ImieZLiczba[] =>
    KOSZYKI_IMION.flatMap(
      (b) => t.koszyki[b][p].filter((x) => x[0] === n).map((x): ImieZLiczba => [b, x[1]]) as ImieZLiczba[],
    );

  it('bierze do lat imiona z co najmniej 10 nadaniami i ucina do 200 najczęstszych', () => {
    const d = swiat();
    // 250 imion o liczbach 20 … 269, z nazwami z samych liter: ABAA, ABAB …
    const nazwa = (i: number): string =>
      `AB${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
    for (let i = 0; i < 250; i++) d.urodzenia[2010].K.set(nazwa(i), 20 + i);
    const t = tabeleImion(d);
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

  it('liczy udział zmarłych wśród urodzonych przed 2000 r. i wkłada imię do właściwego koszyka', () => {
    const t = tabeleImion(swiat());
    expect(gdzie(t, 'K', 'Genowefa')).toEqual([['1920-1945', 10_000]]); // zmarli 40 000, żyjący 10 000: 80%
    expect(gdzie(t, 'K', 'Janina')).toEqual([['1920-1945', 20_000]]); // 40 000 do 20 000: 67%
    expect(gdzie(t, 'K', 'Ewa')).toEqual([['1960-1974', 100_000]]); // 40 000 do 100 000: 29%
    expect(gdzie(t, 'K', 'Beata')).toEqual([['1975-1989', 90_000]]); // 10%
    expect(gdzie(t, 'K', 'Aldona')).toEqual([['1990-1999', 30_000]]); // 0,3%
    expect(gdzie(t, 'M', 'Adam')).toEqual([['1975-1989', 100_000]]); // 10 000 do 100 000: 9%
    // Hanna: żyjących 110 000 minus nadań 38 000 = 72 000, zmarłych 20 000: 22%
    expect(gdzie(t, 'K', 'Hanna')).toEqual([['1960-1974', 72_000]]);
  });

  it('ustawia imiona w koszyku od najliczniejszego i ucina do 200', () => {
    const t = tabeleImion(swiat());
    expect(t.koszyki['1960-1974'].K.map((x) => x[0])).toEqual(['Ewa', 'Hanna']);
    expect(t.koszyki['1920-1945'].K.map((x) => x[0])).toEqual(['Janina', 'Genowefa', 'Klara', 'Julia']);
  });

  it('opuszcza imiona z mniej niż 5 000 żyjącymi sprzed 2000 r.', () => {
    const t = tabeleImion(swiat());
    expect(gdzie(t, 'K', 'Rzadka')).toEqual([]);
  });

  it('nie wpuszcza imienia z XXI wieku, choć ma kilka tysięcy żyjących nadanych wcześniej', () => {
    const t = tabeleImion(swiat());
    // Lena: nadań 78 000, żyjących sprzed 2000 r. 6 000 (udział zmarłych 33%, czyli koszyk 1960-1974 bez ochrony)
    expect(gdzie(t, 'K', 'Lena')).toEqual([]);
    expect(t.lata['2024'].K).toContainEqual(['Lena', 3000]); // w latach zostaje
  });

  it('odsyła przyjezdnych do osobnej puli i usuwa z lat i koszyków; bierze przyrost od 2019 r.', () => {
    const d = swiat();
    d.urodzenia[2024].K.set('OLEKSANDRA', 400);
    const t = tabeleImion(d);
    expect(t.przyjezdni.K).toEqual([['Oleksandra', 28_000]]); // 30 000 żyjących minus 2 000 w 2019 r.
    expect(t.przyjezdni.M).toEqual([]);
    expect(t.lata['2024'].K.map((x) => x[0])).not.toContain('Oleksandra');
    expect(gdzie(t, 'K', 'Oleksandra')).toEqual([]);
    // Hanna przybyła o 30 000, ale to polskie imię
    expect(t.przyjezdni.K.map((x) => x[0])).not.toContain('Hanna');
    expect(t.lata['2024'].K.map((x) => x[0])).toContain('Hanna');
  });

  it('wpisuje dwufalowe imiona do najstarszego koszyka z liczbą pomniejszoną o udział zmarłych', () => {
    const t = tabeleImion(swiat());
    // Julia: żyjących sprzed 2000 r. 64 000 - 52 000 = 12 000, zmarłych 14 000: 54% zmarłych, koszyk 1946-1959
    // z progów, ale wpisana ręcznie do najstarszego; liczba 12 000 × 14 000 / 26 000 = 6 462
    expect(gdzie(t, 'K', 'Julia')).toEqual([['1920-1945', 6462]]);
    // Jan: 56 000 - 26 000 = 30 000 żyjących, 60 000 zmarłych (67%); liczba 30 000 × 60 000 / 90 000 = 20 000
    expect(gdzie(t, 'M', 'Jan')).toEqual([['1920-1945', 20_000]]);
  });

  it('wskazuje stare imiona, których udział w nadaniach rośnie od 2019 do 2026', () => {
    const t = tabeleImion(swiat());
    // Klara: udział 100 / 6 109 w 2019 i 300 / 5 800 w pierwszej połowie 2026, a zmarłych 20 000 (72%)
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
});

// ---------------------------------------------------------------- 3. odtworzenie z surowych plików

describe.skipIf(!fs.existsSync(SUROWE_IMIONA))('odtworzenie tabel z surowych plików PESEL', () => {
  it('daje te same bajty co pliki w repozytorium (powtarzalność)', async () => {
    const { zbudujZPlikow } = await import('../../tools/dane/imiona-pliki.ts');
    const wynik = zbudujZPlikow(SUROWE_IMIONA, ZAKAZANE);
    expect(`${JSON.stringify(wynik.imiona)}\n`).toBe(fs.readFileSync(IMIONA, 'utf8'));
    for (const t of wynik.nazwiska) {
      const plik = path.join(NAZWISKA, `${PLIK_WOJEWODZTWA[t.woj]}.json`);
      expect(`${JSON.stringify(t)}\n`, t.woj).toBe(fs.readFileSync(plik, 'utf8'));
    }
  });
});
