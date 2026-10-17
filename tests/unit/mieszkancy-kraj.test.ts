/* Tabele krajowe (public/data/mieszkancy/kraj.json i LICENCJE.md), wynik `npm run dane:kraj`. Trzy części:
   1. tabele z repozytorium: chodzą zawsze, z liczbami z oficjalnych publikacji (GUS, Eurostat);
   2. czytniki z tools/dane/kraj.ts na małych, zmyślonych tablicach;
   3. porównanie tabel z surowymi plikami; każdy test sprawdza istnienie swojego pliku (CI ich nie ma). */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type KluczQx, type TabeleKraju, WERSJA_TABEL } from '../../src/mieszkancy/tabele.ts';
import { pustyMarginesy, sumaTablicy } from '../../tools/dane/gminy.ts';
import {
  ARKUSZE_QX,
  mnoznikTfr,
  normalizujDo,
  notaSgjp,
  plodnoscZCsv,
  qxZArkusza,
  szablonZAneksu,
  tfrRoczny,
  tfrZDemoFind,
  wiekZPrognozy,
} from '../../tools/dane/kraj.ts';
import { tekstLicencji } from '../../tools/dane/licencje.ts';
import { SUROWE } from '../../tools/dane/sciezki.ts';
import { type Komorka, wiersze } from '../../tools/dane/xlsx.ts';

const KATALOG = path.resolve(import.meta.dirname, '../../public/data/mieszkancy');
const KRAJ = path.join(KATALOG, 'kraj.json');
const LICENCJE = path.join(KATALOG, 'LICENCJE.md');

const suma = (o: Record<string, number> | number[]): number => Object.values(o).reduce((a, b) => a + b, 0);

/** Przeciętne dalsze trwanie życia przy urodzeniu z qx (na 100 000, wiek 0-100): zgon w środku roku, a po 100.
    roku stałe ryzyko, czyli średnio (1 - q) / q pełnych lat i pół roku. */
function e0(qx: number[]): number {
  let zyje = 1;
  let lata = 0;
  for (let x = 0; x < 100; x++) {
    const zgony = (zyje * qx[x]) / 1e5;
    lata += zyje - zgony / 2;
    zyje -= zgony;
  }
  const q = qx[100] / 1e5;
  return lata + zyje * ((1 - q) / q + 0.5);
}

/** Szansa przeżycia od wieku od do wieku do (qx na 100 000). */
function przezycie(qx: number[], od: number, doWieku: number): number {
  let p = 1;
  for (let x = od; x < doWieku; x++) p *= 1 - qx[x] / 1e5;
  return p;
}

// ---------------------------------------------------------------- 1. tabele z repozytorium

describe('tabele krajowe (kraj.json)', () => {
  const kraj = JSON.parse(fs.readFileSync(KRAJ, 'utf8')) as TabeleKraju;
  const KLUCZE: KluczQx[] = ['miastaM', 'miastaK', 'wiesM', 'wiesK', 'polskaM', 'polskaK'];

  it('wersja jak w tabelach gmin, plik zwarty (jedna linia, kilka KB)', () => {
    expect(kraj.wersja).toBe(WERSJA_TABEL);
    const tekst = fs.readFileSync(KRAJ, 'utf8');
    expect(tekst.trimEnd().split('\n')).toHaveLength(1);
    expect(Buffer.byteLength(tekst)).toBeLessThan(40 * 1024);
  });

  it('qx: sześć tablic po 101 liczb całkowitych na 100 000', () => {
    expect(Object.keys(kraj.qx)).toEqual(KLUCZE);
    for (const k of KLUCZE) {
      expect(kraj.qx[k], k).toHaveLength(101);
      for (const q of kraj.qx[k]) expect(Number.isInteger(q) && q >= 0 && q <= 100000).toBe(true);
      expect(kraj.qx[k][100], `${k}: stulatek umiera w ciągu roku z szansą powyżej jednej piątej`).toBeGreaterThan(
        20000,
      );
    }
    expect(kraj.qx.polskaK[0]).toBe(316);
    expect(kraj.qx.miastaM[0]).toBe(308);
    expect(kraj.qx.wiesM[100]).toBe(34610);
  });

  it('e(0) z qx: miasta M 75,67, Polska K 82,48 i pozostałe z Tablicy A (±0,3 roku)', () => {
    const GUS: Record<KluczQx, number> = {
      miastaM: 75.67,
      miastaK: 82.5,
      wiesM: 74.88,
      wiesK: 82.39,
      polskaM: 75.37,
      polskaK: 82.48,
    };
    for (const k of KLUCZE) expect(Math.abs(e0(kraj.qx[k]) - GUS[k]), k).toBeLessThanOrEqual(0.3);
  });

  it('przeżycie 25 lat od 60 do 85: mężczyźni 0,341, kobiety 0,540 (±0,005)', () => {
    expect(Math.abs(przezycie(kraj.qx.polskaM, 60, 85) - 0.341)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(przezycie(kraj.qx.polskaK, 60, 85) - 0.54)).toBeLessThanOrEqual(0.005);
  });

  it('wieś żyje krócej od miasta, a kobiety dłużej od mężczyzn', () => {
    expect(e0(kraj.qx.wiesM)).toBeLessThan(e0(kraj.qx.miastaM));
    expect(e0(kraj.qx.wiesK)).toBeLessThan(e0(kraj.qx.miastaK));
    expect(e0(kraj.qx.polskaK) - e0(kraj.qx.polskaM)).toBeGreaterThan(6);
  });

  it('płodność: 35 liczb na 10 000 kobiet w wieku 15-49, suma 1,14 (TFR Eurostatu 2024)', () => {
    expect(kraj.plodnosc).toHaveLength(35);
    for (const p of kraj.plodnosc) expect(Number.isInteger(p) && p >= 0 && p < 1000).toBe(true);
    expect(Math.abs(suma(kraj.plodnosc) / 10000 - 1.14)).toBeLessThanOrEqual(0.02);
    // szczyt w wieku 29-30 lat (0,0906 i 0,0905 na kobietę), 15-latki rodzą rzadko
    const szczyt = kraj.plodnosc.indexOf(Math.max(...kraj.plodnosc)) + 15;
    expect([29, 30]).toContain(szczyt);
    expect(kraj.plodnosc[0]).toBeLessThan(10);
    expect(kraj.plodnosc[34]).toBeLessThanOrEqual(1); // 49 lat: 0,00005 na kobietę, czyli 0,5 na 10 000
  });

  it('mnożniki płodności: krzywa x mnożnik daje TFR obszaru wg GUS 2024 (1,000 / 1,069 / 1,149, ±0,002)', () => {
    const { miasto100k, miasto, wies } = kraj.mnoznikPlodnosci;
    expect(kraj.mnoznikPlodnosci).toEqual({ miasto100k: 8787, miasto: 9394, wies: 10097 });
    const tfr = (m: number): number => (suma(kraj.plodnosc) * m) / 10000 / 10000;
    expect(Math.abs(tfr(miasto100k) - 1.0)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(tfr(miasto) - 1.069)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(tfr(wies) - 1.149)).toBeLessThanOrEqual(0.002);
    expect(miasto100k).toBeLessThan(miasto);
    expect(miasto).toBeLessThan(wies);
  });

  it('dzietność według roku 2021-2025 na 10 000: GUS 2024 i 2025, wcześniej trend Eurostatu do GUS 2024', () => {
    // Eurostat demo_find: 1,33 / 1,29 / 1,20 / 1,14 w latach 2021-2024; GUS: 1,099 w 2024 i 1,068 w 2025
    expect(kraj.tfrRoczny).toEqual({ '2021': 12822, '2022': 12436, '2023': 11568, '2024': 10990, '2025': 10680 });
    const lata = Object.keys(kraj.tfrRoczny).sort();
    for (let i = 1; i < lata.length; i++) expect(kraj.tfrRoczny[lata[i]]).toBeLessThan(kraj.tfrRoczny[lata[i - 1]]);
  });

  it('kolejność urodzeń: udziały wśród urodzeń o znanej kolejności (GUS 2024) sumują się do 10 000', () => {
    expect(kraj.kolejnosc).toEqual([4570, 3513, 1285, 632]);
    expect(suma(kraj.kolejnosc)).toBe(10000);
    // proporcje jak w GUS: 44,1 / 33,9 / 12,4 / 6,1 (razem 96,5%, reszta ma kolejność nieustaloną)
    [4410, 3390, 1240, 610].forEach((gus, i) => {
      expect(Math.abs(kraj.kolejnosc[i] - (10000 * gus) / 9650)).toBeLessThanOrEqual(1);
    });
  });

  it('gospodarstwa trzypokoleniowe: miasta 9,9%, wieś 24,3% (NSP 2021, na 10 000)', () => {
    expect(kraj.trojpokoleniowe).toEqual({ miasta: 990, wies: 2430 });
  });

  describe('szablon gospodarstw (aneks „Rodziny w Polsce”, tabl. 4 i 5)', () => {
    const KLUCZ = /^(1|2|3|4|5\+)\|(jedno|dwu|trzy\+|nier1|nier\+)\|(60\+|bez60)$/;

    it('klucze to wielkość|skład|obecność osób 60+, liczby całkowite dodatnie, bez niemożliwych połączeń', () => {
      for (const obszar of [kraj.szablonGospodarstw.miasta, kraj.szablonGospodarstw.wies]) {
        expect(Object.keys(obszar).length).toBeGreaterThan(20);
        for (const [klucz, n] of Object.entries(obszar)) {
          expect(klucz).toMatch(KLUCZ);
          expect(Number.isInteger(n) && n > 0, klucz).toBe(true);
          const [wielkosc, sklad] = klucz.split('|');
          if (sklad === 'nier1') expect(wielkosc, klucz).toBe('1');
          else expect(wielkosc === '1', klucz).toBe(false); // gospodarstwo z rodziną ma co najmniej dwie osoby
          if (sklad === 'dwu') expect(['1', '2', '3'], klucz).not.toContain(wielkosc);
          if (sklad === 'trzy+') expect(wielkosc, klucz).toBe('5+');
        }
      }
    });

    it('sumy to liczby gospodarstw w miastach (8 463 935) i na wsi (4 052 524) z NSP 2021', () => {
      expect(suma(kraj.szablonGospodarstw.miasta)).toBe(8463935);
      expect(suma(kraj.szablonGospodarstw.wies)).toBe(4052524);
    });

    it('wartości z tabl. 5: pary starszych w miastach, samotni seniorzy, nierodzinne wieloosobowe', () => {
      const { miasta, wies } = kraj.szablonGospodarstw;
      expect(miasta['2|jedno|60+']).toBe(1261506);
      expect(miasta['1|nier1|60+']).toBe(1230411);
      expect(miasta['1|nier1|bez60']).toBe(1045049);
      expect(miasta['2|nier+|bez60']).toBe(232896);
      expect(miasta['5+|trzy+|60+']).toBe(49239);
      expect(miasta['5+|dwu|60+']).toBe(116122 + 191919); // 5 osób oraz 6 i więcej razem
      expect(miasta['4|dwu|60+']).toBe(88336);
      expect(wies['1|nier1|60+']).toBe(328013);
      expect(wies['3|jedno|bez60']).toBe(380184);
    });

    it('osoby 60+: 55,2% gospodarstw jednoosobowych w kraju (aneks) to gospodarstwa z osobą 60+', () => {
      const jednoosobowe = (o: Record<string, number>, flaga: string): number => o[`1|nier1|${flaga}`];
      const razem = (flaga: string): number =>
        jednoosobowe(kraj.szablonGospodarstw.miasta, flaga) + jednoosobowe(kraj.szablonGospodarstw.wies, flaga);
      const udzial = (100 * razem('60+')) / (razem('60+') + razem('bez60'));
      expect(Math.abs(udzial - 55.2)).toBeLessThanOrEqual(0.1);
    });
  });

  describe('polska: marginesy całego kraju (zapas dla gminy bez własnej tabeli)', () => {
    const p = kraj.polska;

    it('ta sama postać co marginesy rejonu, klucze w kolejności z typów', () => {
      const wzor = pustyMarginesy();
      expect(Object.keys(p)).toEqual(Object.keys(wzor));
      for (const pole of ['gospodarstwa', 'sklad', 'rodziny', 'dzieci'] as const) {
        expect(Object.keys(p[pole])).toEqual(Object.keys(wzor[pole]));
        for (const v of Object.values(p[pole])) expect(Number.isInteger(v) && v >= 0).toBe(true);
      }
      expect(Object.keys(p.wiek.M)).toEqual(Object.keys(wzor.wiek.M));
      expect(Object.keys(p.wiek.K)).toEqual(Object.keys(wzor.wiek.K));
    });

    it('gospodarstwa i rodziny to sumy rejonów NSP 2021 (12 516 459 gospodarstw, 10 618 535 rodzin)', () => {
      expect(suma(p.gospodarstwa)).toBe(12516459);
      expect(suma(p.sklad)).toBe(12516459);
      expect(suma(p.rodziny)).toBe(10618535);
      expect(suma(p.dzieci)).toBe(10618535);
      expect(p.gospodarstwa['1']).toBe(2824558);
      expect(p.gospodarstwa['5+']).toBe(2128824);
      expect(p.sklad.jedno).toBe(7711239);
      expect(p.sklad.nier1).toBe(p.gospodarstwa['1']);
    });

    it('wiek: ludność na 31.12.2022 z prognozy GUS, 18 249 321 mężczyzn i 19 517 006 kobiet', () => {
      expect(suma(p.wiek.M)).toBe(18249321);
      expect(suma(p.wiek.K)).toBe(19517006);
      expect(Object.keys(p.wiek.M)).toEqual([
        '0-9',
        '10-19',
        '20-29',
        '30-39',
        '40-49',
        '50-59',
        '60-69',
        '70-79',
        '80+',
      ]);
      // kobiet po osiemdziesiątce jest ponad dwa razy więcej niż mężczyzn
      expect(p.wiek.K['80+']).toBeGreaterThan(2 * p.wiek.M['80+']);
    });
  });
});

describe('LICENCJE.md', () => {
  const tekst = fs.readFileSync(LICENCJE, 'utf8');

  it('ma słowa Copyright i BSD oraz nazwę każdego źródła, które trafia do tabel', () => {
    for (const slowo of [
      'Copyright',
      'BSD',
      'GUS',
      'NSP 2021',
      'BDL',
      'CC BY 4.0',
      'BREC 2021',
      'Eurostat',
      'demo_find',
      'Sytuacja demograficzna Polski do 2025',
      'PESEL',
      'CC0',
      'SGJP',
      'BSD-2',
    ]) {
      expect(tekst, slowo).toContain(slowo);
    }
  });

  it('ma pełną notę SGJP: autorów, warunki ponownego użycia i wyłączenie gwarancji', () => {
    expect(tekst).toContain('Marcin Woliński');
    expect(tekst).toContain('Redistributions of source code must retain the above copyright notice');
    expect(tekst).toContain('Redistributions in binary form must reproduce the above copyright');
    expect(tekst).toContain('THE POSSIBILITY OF SUCH DAMAGE.');
  });

  it('przy każdym źródle mówi, co trzeba zrobić, i ostrzega, że mieszkańcy są wymyśleni', () => {
    expect(tekst).toMatch(/atrybucja/i);
    expect(tekst).toMatch(/informacja o przetworzeniu|zaznaczenie zmian/i);
    expect(tekst).toMatch(/wymyśleni|zmyśleni|fikcyjni/);
  });

  it('bez pauz-myślników w tekście własnym (nota SGJP jest kopią)', () => {
    const swoj = tekst.replace(/```text[\s\S]*?```/, '');
    expect(swoj).not.toMatch(/ [—–] /);
  });
});

// ---------------------------------------------------------------- 2. czytniki na małych tablicach

describe('qxZArkusza: Tablica A trwania życia', () => {
  /** Arkusz jak w pliku GUS: tytuły, nagłówek, wiersz z etykietą, potem wiek 0-100 (x, qx, lx, dx, Lx, Tx, ex). */
  function arkusz(q: (x: number) => number, ex0 = 75.5): Komorka[][] {
    const w: Komorka[][] = [
      ['TABL. A.   TABLICA TRWANIA ŻYCIA W 2025 R.', null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [
        'Wiek',
        'Prawdopodobień-stwo zgonu',
        'Liczba dożywających',
        'Liczba zmarłych',
        'Ludność stacjonarna',
        null,
        'ex',
      ],
      ['x', 'qx', 'lx', 'dx', 'Lx', 'Tx', 'ex'],
      [null, 'Mężczyźni ogółem', null, null, null, null, null],
    ];
    let l = 100000;
    for (let x = 0; x <= 100; x++) {
      w.push([x, q(x), Math.round(l), Math.round(l * q(x)), 0, 0, x === 0 ? ex0 : 0, null, null, null, null]);
      l *= 1 - q(x);
    }
    w.push([null, null, null, null, null, null, null]);
    return w;
  }
  const q = (x: number): number => (x === 100 ? 0.30931 : x === 0 ? 0.00333 : 0.01);

  it('101 wartości na 100 000, zaokrąglone, i e(0) z pliku', () => {
    const { qx, ex0 } = qxZArkusza(arkusz(q, 75.37));
    expect(qx).toHaveLength(101);
    expect(qx[0]).toBe(333);
    expect(qx[1]).toBe(1000);
    expect(qx[100]).toBe(30931);
    expect(ex0).toBe(75.37);
  });

  it('luka w wieku, prawdopodobieństwo poza [0, 1] i lx niezgodne z qx to błąd', () => {
    const w = arkusz(q);
    expect(() => qxZArkusza(w.filter((r) => r[0] !== 50))).toThrow(/wiek/);
    const zly = arkusz(q);
    zly[5 + 20][1] = 1.2;
    expect(() => qxZArkusza(zly)).toThrow(/qx/);
    const niezgodny = arkusz(q);
    niezgodny[5 + 60][2] = 40000;
    expect(() => qxZArkusza(niezgodny)).toThrow(/lx/);
    expect(() => qxZArkusza([['pusty']])).toThrow(/wiek/);
  });
});

describe('plodnoscZCsv: Eurostat demo_frate', () => {
  const NAGLOWEK = 'STRUCTURE,STRUCTURE_ID,freq,unit,age,agedef,geo,TIME_PERIOD,OBS_VALUE,OBS_FLAG,CONF_STATUS';
  const w = (age: string, geo: string, rok: number, v: number): string =>
    `dataflow,ESTAT:DEMO_FRATE(1.0),A,NR,${age},COMPLET,${geo},${rok},${v.toFixed(5)},ep,`;
  const poprawny = (): string[] => {
    const lista = [NAGLOWEK];
    for (let a = 15; a <= 49; a++) lista.push(w(`Y${a}`, 'PL', 2024, a / 1000));
    // szum, który ma zostać pominięty: inny rok, inny kraj, grupy 5-letnie, suma, brzegi
    lista.push(w('Y30', 'PL', 2023, 0.5), w('Y30', 'EU27_2020', 2024, 0.6), w('Y15-19', 'PL', 2024, 0.9));
    lista.push(w('TOTAL', 'PL', 2024, 1.1377), w('Y10-14', 'PL', 2024, 0.00003), w('Y_GE50', 'PL', 2024, 0.00002));
    return lista;
  };

  it('35 liczb na 10 000 kobiet, wiek 15-49, tylko Polska 2024, także przy końcach linii CRLF', () => {
    const oczekiwane = Array.from({ length: 35 }, (_, i) => (15 + i) * 10);
    expect(plodnoscZCsv(poprawny().join('\n'))).toEqual(oczekiwane);
    expect(plodnoscZCsv(`${poprawny().join('\r\n')}\r\n`)).toEqual(oczekiwane);
  });

  it('brak wieku, powtórzony wiek i obcy nagłówek to błąd', () => {
    expect(() =>
      plodnoscZCsv(
        poprawny()
          .filter((l) => !l.includes(',Y30,COMPLET,PL,2024,'))
          .join('\n'),
      ),
    ).toThrow(/30/);
    expect(() => plodnoscZCsv([...poprawny(), w('Y30', 'PL', 2024, 0.1)].join('\n'))).toThrow(/dwa razy/);
    expect(() => plodnoscZCsv(['a,b,c', '1,2,3'].join('\n'))).toThrow(/nagłówek/);
  });
});

describe('szablonZAneksu: tabl. 4 i 5 aneksu „Rodziny w Polsce”', () => {
  type Rozklad = Komorka[]; // 6 kolumn: osoby 1, 2, 3, 4, 5, 6 i więcej ('x' = niemożliwe)
  interface Obszar {
    jedno: { bez: Rozklad; z: Rozklad };
    dwu: { bez: Rozklad; z: Rozklad };
    trzy: { bez: Rozklad; z: Rozklad };
    nier: { bez: Rozklad; z: Rozklad };
  }
  const MIASTA: Obszar = {
    jedno: { bez: ['x', 10, 20, 5, 1, 1], z: ['x', 30, 8, 2, 0, 1] },
    dwu: { bez: ['x', 'x', 'x', 4, 3, 2], z: ['x', 'x', 'x', 6, 5, 4] },
    trzy: { bez: ['x', 'x', 'x', 'x', 'x', 2], z: ['x', 'x', 'x', 'x', 'x', 3] },
    nier: { bez: [40, 6, 3, 1, 1, '–'], z: [50, 7, 2, 1, '–', 1] },
  };
  const WIES: Obszar = {
    jedno: { bez: ['x', 1, 2, 3, 4, 5], z: ['x', 5, 4, 3, 2, 1] },
    dwu: { bez: ['x', 'x', 'x', 1, 1, 1], z: ['x', 'x', 'x', 2, 2, 2] },
    trzy: { bez: ['x', 'x', 'x', 'x', 'x', 1], z: ['x', 'x', 'x', 'x', 'x', 1] },
    nier: { bez: [7, 1, 1, 1, 1, 1], z: [9, 2, 2, 2, 2, 2] },
  };

  const liczby = (r: Rozklad): number[] => r.map((c) => (typeof c === 'number' ? c : 0));
  const wiersz = (etykieta: string, r: Rozklad): Komorka[] => [etykieta, suma(liczby(r)), ...r, 0, 0];
  const sumaRozkladow = (...r: Rozklad[]): Rozklad =>
    [0, 1, 2, 3, 4, 5].map((i) => r.reduce((a, x) => a + liczby(x)[i], 0));
  const polaczone = (o: Obszar, k: 'bez' | 'z'): Rozklad => sumaRozkladow(o.jedno[k], o.dwu[k], o.trzy[k], o.nier[k]);

  function tablica5(sekcje: [string, Obszar][]): Komorka[][] {
    const w: Komorka[][] = [
      ['TABL. 5. GOSPODARSTWA DOMOWE WEDŁUG WIELKOŚCI, SKŁADU RODZINNEGO ORAZ LICZBY OSÓB W WIEKU 60 LAT I WIĘCEJ'],
      ['GOSPODARSTWA DOMOWE\r\nHOUSEHOLDS', 'Ogółem\r\nTotal', 'Liczba osób w gospodarstwie domowym'],
      [null, null, 1, 2, 3, 4, 5, '6 i więcej\r\n6 and more'],
    ];
    for (const [naglowek, o] of sekcje) {
      w.push([naglowek]);
      w.push(
        wiersz(
          naglowek.startsWith('OGÓŁEM') ? 'OGÓŁEM\r\nGRAND TOTAL' : 'RAZEM\r\nTOTAL',
          sumaRozkladow(polaczone(o, 'bez'), polaczone(o, 'z')),
        ),
      );
      const nazwy: [keyof Obszar, string][] = [
        ['jedno', ' Jednorodzinne\r\n One-family'],
        ['dwu', 'Dwurodzinne\r\nTwo-family'],
        ['trzy', 'Trzy i więcej rodzinne\r\nThree-family and over'],
        ['nier', 'Nierodzinne\r\nNon-family'],
      ];
      for (const [k, etykieta] of nazwy) {
        w.push(wiersz(etykieta, sumaRozkladow(o[k].bez, o[k].z)));
        w.push(wiersz('Bez osób w wieku 60 lat i więcej\r\nWithout persons aged 60 and more', o[k].bez));
        w.push(wiersz('Z osobami w wieku 60 lat i więcej\r\nWith persons aged 60 and more', o[k].z));
        if (k === 'jedno') {
          // podziały pod „Z osobami 60+” nie są nowymi kategoriami i nie mogą być liczone drugi raz
          w.push(wiersz('wyłącznie z osobami w wieku 60 lat i więcej\r\nonly with persons aged 60 and more', o[k].z));
          w.push(wiersz('z osobami w wieku poniżej 60 lat\r\nwith persons aged under 60', o[k].z));
        }
      }
    }
    return w;
  }

  function tablica4(sekcje: [string, Obszar][]): Komorka[][] {
    const w: Komorka[][] = [
      ['TABL. 4. GOSPODARSTWA DOMOWE WEDŁUG WIELKOŚCI ORAZ LICZBY OSÓB W WIEKU 60 LAT I WIĘCEJ'],
      ['GOSPODARSTWA DOMOWE\r\nHOUSEHOLDS', 'Ogółem\r\nTotal', 'Liczba osób w gospodarstwie domowym'],
      [null, null, 1, 2, 3, 4, 5, '6 i więcej\r\nand more'],
    ];
    for (const [naglowek, o] of sekcje) {
      const nazwa = naglowek.split(' ')[0];
      w.push(wiersz(`${nazwa}\r\n${nazwa}`, sumaRozkladow(polaczone(o, 'bez'), polaczone(o, 'z'))));
      w.push(wiersz('  Bez osób w wieku 60 lat i więcej\r\n  Without persons aged 60 and more', polaczone(o, 'bez')));
      w.push(wiersz('  Z osobami w wieku 60 lat i więcej\r\n  With persons aged 60 and more', polaczone(o, 'z')));
      w.push(wiersz('    z 1 osobą\r\n    with 1 person', polaczone(o, 'z')));
    }
    return w;
  }

  const sekcje: [string, Obszar][] = [
    ['MIASTA URBAN AREAS', MIASTA],
    ['WIEŚ RURAL AREAS', WIES],
  ];

  it('wielkość|skład|60+: 5 i 6+ osób razem, nierodzinne rozdzielone na jedno- i wieloosobowe, zera pominięte', () => {
    const { miasta, wies } = szablonZAneksu(tablica4(sekcje), tablica5(sekcje));
    expect(miasta).toEqual({
      '2|jedno|bez60': 10,
      '3|jedno|bez60': 20,
      '4|jedno|bez60': 5,
      '5+|jedno|bez60': 2,
      '2|jedno|60+': 30,
      '3|jedno|60+': 8,
      '4|jedno|60+': 2,
      '5+|jedno|60+': 1,
      '4|dwu|bez60': 4,
      '5+|dwu|bez60': 5,
      '4|dwu|60+': 6,
      '5+|dwu|60+': 9,
      '5+|trzy+|bez60': 2,
      '5+|trzy+|60+': 3,
      '1|nier1|bez60': 40,
      '1|nier1|60+': 50,
      '2|nier+|bez60': 6,
      '3|nier+|bez60': 3,
      '4|nier+|bez60': 1,
      '5+|nier+|bez60': 1,
      '2|nier+|60+': 7,
      '3|nier+|60+': 2,
      '4|nier+|60+': 1,
      '5+|nier+|60+': 1,
    });
    expect(suma(wies)).toBe(suma(liczby(polaczone(WIES, 'bez'))) + suma(liczby(polaczone(WIES, 'z'))));
    expect(wies['1|nier1|60+']).toBe(9);
  });

  it('kolejność kluczy: skład, potem wielkość, potem bez60 przed 60+', () => {
    const { miasta } = szablonZAneksu(tablica4(sekcje), tablica5(sekcje));
    expect(Object.keys(miasta).slice(0, 3)).toEqual(['2|jedno|bez60', '2|jedno|60+', '3|jedno|bez60']);
  });

  it('suma kategorii różna od wiersza RAZEM, niemożliwe połączenie i brak obszaru to błąd', () => {
    const zepsuty = tablica5(sekcje);
    zepsuty[4][1] = 999; // wiersz RAZEM miast
    expect(() => szablonZAneksu(tablica4(sekcje), zepsuty)).toThrow(/RAZEM|ogółem/i);

    const jednoosobowaRodzina: Obszar = { ...MIASTA, jedno: { bez: [3, 10, 20, 5, 1, 1], z: MIASTA.jedno.z } };
    expect(() =>
      szablonZAneksu(
        tablica4([['MIASTA URBAN AREAS', jednoosobowaRodzina], sekcje[1]]),
        tablica5([['MIASTA URBAN AREAS', jednoosobowaRodzina], sekcje[1]]),
      ),
    ).toThrow(/niemożliw|1 osob/);

    expect(() => szablonZAneksu(tablica4(sekcje.slice(0, 1)), tablica5(sekcje.slice(0, 1)))).toThrow(/wieś/i);
  });

  it('tabl. 4 niezgodna z tabl. 5 (bez osób 60+ według wielkości) to błąd', () => {
    const t4 = tablica4(sekcje);
    t4[4][3] = 1234; // „Bez osób 60+” miast, 2 osoby
    expect(() => szablonZAneksu(t4, tablica5(sekcje))).toThrow(/tabl\. 4/i);
  });
});

describe('wiekZPrognozy: ludność 2022 według płci i wieku', () => {
  /** Tabl. 1 jak w pliku: nagłówek z rokami, potem bloki Ogółem, Mężczyźni, Kobiety po 100 roczników i „100+”.
      Mężczyźni w wieku a to a + 1 osób, kobiety a + 2. `blad` zawyża zapisaną sumę kobiet. */
  function tabl1(blad = 0): Komorka[][] {
    const w: Komorka[][] = [
      [null, null, 'TABL. 1. LUDNOŚĆ WEDŁUG PŁCI I POJEDYNCZYCH ROCZNIKÓW WIEKU'],
      ['Polska'],
      ['Płeć Sex', 'Wiek Age', '2022*', 2023, 2024],
    ];
    const blok = (naglowek: string, v: (a: number) => number, doliczone = 0): void => {
      let razem = doliczone;
      const roczniki: Komorka[][] = [];
      for (let a = 0; a <= 100; a++) {
        razem += v(a);
        roczniki.push([null, a === 100 ? '100+' : a, v(a), 1, 1]);
      }
      w.push([naglowek, 'Ogółem Total', razem, 1, 1], ...roczniki);
    };
    blok('Ogółem Total', (a) => 2 * a + 3);
    blok('Mężczyźni Males', (a) => a + 1);
    blok('Kobiety Females', (a) => a + 2, blad);
    return w;
  }

  it('grupy 10-letnie 0-9 … 70-79 i 80+ (80-99 oraz 100+), osobno mężczyźni i kobiety', () => {
    const { M, K } = wiekZPrognozy(tabl1());
    // mężczyźni: wiek a ma a + 1 osób, więc grupa g (g < 8) to 100g + 55; 80+ to wiek 80-100 (21 roczników)
    expect(Object.values(M)).toEqual([55, 155, 255, 355, 455, 555, 655, 755, 1911]);
    expect(Object.values(K)).toEqual([65, 165, 265, 365, 465, 565, 665, 765, 1932]);
    expect(Object.keys(M)).toEqual(['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+']);
  });

  it('inny rok, suma roczników różna od wiersza „Ogółem” i brak bloku płci to błąd', () => {
    expect(wiekZPrognozy(tabl1(), '2022*').M['0-9']).toBe(55);
    expect(() => wiekZPrognozy(tabl1(), '2035')).toThrow(/2035/);
    expect(() => wiekZPrognozy(tabl1(5))).toThrow(/suma/);
    expect(() => wiekZPrognozy(tabl1().slice(0, 3 + 102 + 102))).toThrow(/Kobiety/);
  });
});

describe('tfrZDemoFind i tfrRoczny: dzietność według roku', () => {
  const NAGLOWEK = 'STRUCTURE,STRUCTURE_ID,freq,indic_de,geo,TIME_PERIOD,OBS_VALUE,OBS_FLAG,CONF_STATUS';
  const w = (wskaznik: string, geo: string, rok: number, v: string): string =>
    `dataflow,ESTAT:DEMO_FIND(1.0),A,${wskaznik},${geo},${rok},${v},ep,`;
  const poprawny = (): string[] => [
    NAGLOWEK,
    w('TOTFERRT', 'PL', 2021, '1.33'),
    w('TOTFERRT', 'PL', 2024, '1.14'),
    // szum: inny wskaźnik, inny kraj, rok spoza listy
    w('AGEMOTH', 'PL', 2021, '29.9'),
    w('TOTFERRT', 'CZ', 2021, '1.83'),
    w('TOTFERRT', 'PL', 2019, '1.44'),
  ];

  it('TFR Polski w setnych dla wybranych lat, także przy końcach linii CRLF', () => {
    expect(tfrZDemoFind(poprawny().join('\n'), [2021, 2024])).toEqual({ '2021': 133, '2024': 114 });
    expect(tfrZDemoFind(`${poprawny().join('\r\n')}\r\n`, [2024])).toEqual({ '2024': 114 });
  });

  it('brak roku, powtórzony rok, zły format i obcy nagłówek to błąd', () => {
    expect(() => tfrZDemoFind(poprawny().join('\n'), [2022])).toThrow(/2022/);
    expect(() => tfrZDemoFind([...poprawny(), w('TOTFERRT', 'PL', 2024, '1.15')].join('\n'), [2024])).toThrow(
      /dwa razy/,
    );
    expect(() => tfrZDemoFind([NAGLOWEK, w('TOTFERRT', 'PL', 2024, '1.1')].join('\n'), [2024])).toThrow(/2 miejsc/);
    expect(() => tfrZDemoFind(['a,b,c', '1,2,3'].join('\n'), [2024])).toThrow(/nagłówek/);
  });

  it('lata z GUS wprost, pozostałe to GUS w roku bazowym razy trend Eurostatu', () => {
    const eurostat = { '2021': 133, '2022': 129, '2024': 114 };
    const gus = { '2024': 10990, '2025': 10680 };
    expect(tfrRoczny(eurostat, gus, 2024, [2021, 2022, 2024, 2025])).toEqual({
      '2021': 12822, // 10 990 x 133 / 114 = 12 821,7
      '2022': 12436,
      '2024': 10990,
      '2025': 10680,
    });
    expect(() => tfrRoczny(eurostat, gus, 2024, [2023])).toThrow(/2023/);
    expect(() => tfrRoczny(eurostat, { '2025': 10680 }, 2024, [2021])).toThrow(/bazow/);
  });
});

describe('mnoznikTfr i normalizujDo: przeliczenia stałych z GUS na krzywą Eurostatu', () => {
  it('mnożnik na 10 000 sprawia, że krzywa x mnożnik daje TFR obszaru', () => {
    const krzywa = [1000, 3000, 2000, 5000]; // TFR krzywej 1,1
    expect(mnoznikTfr(1100, krzywa)).toBe(10000);
    expect(mnoznikTfr(1000, krzywa)).toBe(9091);
    expect(mnoznikTfr(1210, krzywa)).toBe(11000);
    expect(() => mnoznikTfr(1000, [0, 0])).toThrow(/krzyw/);
  });

  it('normalizacja do 10 000 metodą największych reszt: suma dokładna, proporcje zachowane', () => {
    expect(normalizujDo([4410, 3390, 1240, 610], 10000)).toEqual([4570, 3513, 1285, 632]);
    expect(normalizujDo([1, 1, 1], 10)).toEqual([4, 3, 3]); // reszta trafia do pierwszej z równych
    expect(normalizujDo([2, 0, 6], 8)).toEqual([2, 0, 6]);
    for (const w of [
      [7, 11, 13],
      [1, 2, 3, 4],
      [99, 1],
    ])
      expect(suma(normalizujDo(w, 10000))).toBe(10000);
    expect(() => normalizujDo([0, 0], 10)).toThrow(/suma/);
    expect(() => normalizujDo([1, -1, 3], 10)).toThrow(/ujemn/);
  });
});

describe('notaSgjp i tekstLicencji', () => {
  const NAGLOWEK =
    '#!DICT-ID pl.sgjp.sgjp-2026.08.24\r\n#<COPYRIGHT>\r\nCopyright © 2007–2026 Anna Autor, Jan Autor\r\n\r\nAll rights reserved.\r\n\r\nRedistributions of source code must retain the above copyright notice.\r\n#</COPYRIGHT>\n';
  const duzy = (): Buffer => {
    const reszta = Array.from(
      { length: 40000 },
      (_, i) => `forma${i}\thasło${i % 977}\tsubst:sg:nom:m1\timię\t\n`,
    ).join('');
    return zlib.gzipSync(Buffer.from(NAGLOWEK + reszta));
  };

  it('czyta nagłówek z samego początku skompresowanego pliku, CRLF zamienia na LF', () => {
    const gz = duzy();
    const poczatek = gz.subarray(0, 4096);
    expect(poczatek.length).toBeLessThan(gz.length);
    const { idSlownika, nota } = notaSgjp(poczatek);
    expect(idSlownika).toBe('pl.sgjp.sgjp-2026.08.24');
    expect(nota).toBe(
      'Copyright © 2007–2026 Anna Autor, Jan Autor\n\nAll rights reserved.\n\nRedistributions of source code must retain the above copyright notice.',
    );
  });

  it('plik bez bloku COPYRIGHT albo bez identyfikatora słownika to błąd', () => {
    expect(() => notaSgjp(zlib.gzipSync(Buffer.from('AA\tAA\tsubst\n')))).toThrow(/COPYRIGHT/);
    expect(() => notaSgjp(zlib.gzipSync(Buffer.from('#<COPYRIGHT>\r\nx\r\n#</COPYRIGHT>\n')))).toThrow(/DICT-ID/);
  });

  it('tekst licencji wkleja notę w całości, bez zmian', () => {
    const tekst = tekstLicencji({ idSlownika: 'pl.sgjp.test', nota: 'NOTA PRÓBNA\n\nDRUGI AKAPIT' });
    expect(tekst).toContain('NOTA PRÓBNA\n\nDRUGI AKAPIT');
    expect(tekst).toContain('pl.sgjp.test');
    expect(tekst.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------- 3. tabele a surowe pliki

describe('tabele krajowe a surowe pliki', () => {
  const kraj = JSON.parse(fs.readFileSync(KRAJ, 'utf8')) as TabeleKraju;
  const plik = (...c: string[]): string => path.join(SUROWE, ...c);

  const UMIERALNOSC = plik('demografia/gus-trwanie-zycia-2025/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx');
  it.skipIf(!fs.existsSync(UMIERALNOSC))(
    'qx to Tablica A GUS, a e(0) z qx zgadza się z kolumną ex pliku (±0,05)',
    () => {
      const buf = fs.readFileSync(UMIERALNOSC);
      for (const [arkusz, klucz] of Object.entries(ARKUSZE_QX)) {
        const { qx, ex0 } = qxZArkusza(wiersze(buf, arkusz));
        expect(kraj.qx[klucz], klucz).toEqual(qx);
        expect(Math.abs(e0(qx) - ex0), `${klucz}: e(0) z qx ${e0(qx).toFixed(3)}, w pliku ${ex0}`).toBeLessThanOrEqual(
          0.05,
        );
      }
    },
  );

  const EUROSTAT = plik('demografia/eurostat/demo_frate.csv');
  it.skipIf(!fs.existsSync(EUROSTAT))(
    'płodność to demo_frate dla Polski 2024, a suma zgadza się z TFR z pliku (±0,002)',
    () => {
      const csv = fs.readFileSync(EUROSTAT, 'utf8');
      expect(kraj.plodnosc).toEqual(plodnoscZCsv(csv));
      const wiersz = csv.split(/\r?\n/).find((l) => l.includes(',TOTAL,COMPLET,PL,2024,'));
      const tfr = Number(wiersz?.split(',')[8]);
      expect(Math.abs(suma(kraj.plodnosc) / 10000 - tfr)).toBeLessThanOrEqual(0.002);
    },
  );

  const DZIETNOSC = plik('demografia/eurostat/demo_find.csv');
  it.skipIf(!fs.existsSync(DZIETNOSC))('dzietność 2021-2023 to trend demo_find (Polska) do GUS 2024', () => {
    const e = tfrZDemoFind(fs.readFileSync(DZIETNOSC, 'utf8'), [2021, 2022, 2023, 2024]);
    expect(e).toEqual({ '2021': 133, '2022': 129, '2023': 120, '2024': 114 });
    for (const rok of ['2021', '2022', '2023']) {
      expect(kraj.tfrRoczny[rok], rok).toBe(Math.round((kraj.tfrRoczny['2024'] * e[rok]) / e['2024']));
    }
  });

  const ANEKS = plik('gus/nsp2021-rodziny/aneks_tabelaryczny_do_publikacji_2.xlsx');
  it.skipIf(!fs.existsSync(ANEKS))('szablon gospodarstw to tabl. 5 aneksu zgodna z tabl. 4', () => {
    const buf = fs.readFileSync(ANEKS);
    expect(kraj.szablonGospodarstw).toEqual(szablonZAneksu(wiersze(buf, 'TABL. 4'), wiersze(buf, 'TABL. 5')));
  });

  const PROGNOZA = plik('demografia/gus-prognoza-ludnosci-2023-2060/2-wyniki_polska.xlsx');
  it.skipIf(!fs.existsSync(PROGNOZA))('polska.wiek to ludność 2022 z Tabl. 1 prognozy GUS', () => {
    expect(kraj.polska.wiek).toEqual(wiekZPrognozy(wiersze(fs.readFileSync(PROGNOZA), 'Tabl. 1'), '2022*'));
  });

  const NSP = plik('gus/nsp2021-gospodarstwa-rejony');
  const TABLICE_NSP = [
    ['gospodarstwa', 'gospodarstwa_w_rejonach_i_obwodach_wg_liczby_osob_nsp2021.xlsx'],
    ['sklad', 'gospodarstwa_w_rejonach_i_obwodach_wg_skladu_rodzinnego_nsp2021_2.xlsx'],
    ['rodziny', 'rodziny_w_rejonach_i_obwodach_wg_typow_nsp2021.xlsx'],
    ['dzieci', 'rodziny_w_rejonach_i_obwodach_wg_liczby_dzieci_nsp2021.xlsx'],
  ] as const;
  for (const [pole, nazwa] of TABLICE_NSP) {
    it.skipIf(!fs.existsSync(path.join(NSP, nazwa)))(
      `polska.${pole} to suma rejonów pliku ${nazwa.slice(0, 40)}…`,
      () => {
        const w = wiersze(fs.readFileSync(path.join(NSP, nazwa)), 'Dane - rejony statystyczne');
        expect(kraj.polska[pole]).toEqual(sumaTablicy(w, pole));
      },
    );
  }

  const SGJP = plik('odmiana/sgjp/sgjp-20260823.tab.gz');
  it.skipIf(!fs.existsSync(SGJP))('LICENCJE.md zawiera notę z nagłówka pliku SGJP w całości', () => {
    const fd = fs.openSync(SGJP, 'r');
    const poczatek = Buffer.alloc(32 * 1024);
    try {
      fs.readSync(fd, poczatek, 0, poczatek.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    const { idSlownika, nota } = notaSgjp(poczatek);
    const tekst = fs.readFileSync(LICENCJE, 'utf8');
    expect(tekst).toContain(nota);
    expect(tekst).toContain(idSlownika);
  });
});
