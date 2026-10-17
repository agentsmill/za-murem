/* Losowanie na liczbach całkowitych (src/mieszkancy/los.ts) i typy osiedla (src/mieszkancy/typy.ts).
   Bez surowych danych, chodzi zawsze. */

import { describe, expect, it } from 'vitest';
import { mulberry, ri } from '../../src/core/rng.ts';
import { calkowita, losDla, szansa, wazony } from '../../src/mieszkancy/los.ts';
import { type Osiedle, WERSJA_GENERATORA } from '../../src/mieszkancy/typy.ts';

const PROBY = 40_000;

// ---------------------------------------------------------------- typy

describe('typy osiedla', () => {
  it('pusty obiekt osiedla zgadza się z typem i nosi wersję generatora', () => {
    const osiedle: Osiedle = { wersja: WERSJA_GENERATORA, rok: 2051, teryt: '2261011', budynki: [] };
    expect(osiedle.wersja).toBe(1);
    expect(osiedle.budynki).toEqual([]);
  });
});

// ---------------------------------------------------------------- losDla

describe('losDla: ziarno z kluczy', () => {
  const ciag = (r: () => number, n = 6): number[] => Array.from({ length: n }, () => r());

  it('te same klucze dają ten sam ciąg', () => {
    expect(ciag(losDla('a', 1))).toEqual(ciag(losDla('a', 1)));
  });

  it('inna liczba w kluczu daje inny ciąg', () => {
    expect(ciag(losDla('a', 1))).not.toEqual(ciag(losDla('a', 2)));
  });

  it('granica między kluczami jest jednoznaczna: („a”, „bc”) i („ab”, „c”) to różne ziarna', () => {
    expect(ciag(losDla('a', 'bc'))).not.toEqual(ciag(losDla('ab', 'c')));
  });

  it('wartości leżą w [0, 1)', () => {
    const r = losDla('zakres');
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- szansa

describe('szansa: progi na 10 000', () => {
  it('0 nigdy nie wypada, 10 000 zawsze wypada', () => {
    const r = losDla('szansa', 'brzegi');
    for (let i = 0; i < 1000; i++) {
      expect(szansa(r, 0)).toBe(false);
      expect(szansa(r, 10000)).toBe(true);
    }
  });

  it('wartości poza zakresem zachowują się jak brzegi: poniżej 0 jak 0, powyżej 10 000 jak 10 000', () => {
    const r = losDla('szansa', 'poza');
    for (let i = 0; i < 1000; i++) {
      expect(szansa(r, -5)).toBe(false);
      expect(szansa(r, 20000)).toBe(true);
    }
  });

  it('2500 na 10 000 wypada w około 25% losowań', () => {
    const r = losDla('szansa', 'czestosc');
    let trafienia = 0;
    for (let i = 0; i < PROBY; i++) if (szansa(r, 2500)) trafienia++;
    expect(Math.abs(trafienia / PROBY - 0.25)).toBeLessThanOrEqual(0.01);
  });
});

// ---------------------------------------------------------------- wazony

describe('wazony: losowanie z wagami całkowitymi', () => {
  it('wagi [0, 3, 1]: indeks 1 w 75% ±1 pp, nigdy indeks 0', () => {
    const r = losDla('wazony', 'trzy-jeden');
    const licznik = [0, 0, 0];
    for (let i = 0; i < PROBY; i++) licznik[wazony(r, [0, 3, 1])]++;
    expect(licznik[0]).toBe(0);
    expect(Math.abs(licznik[1] / PROBY - 0.75)).toBeLessThanOrEqual(0.01);
    expect(licznik[1] + licznik[2]).toBe(PROBY);
  });

  it('suma wag 0 daje -1', () => {
    expect(wazony(losDla('wazony', 'zero'), [0, 0])).toBe(-1);
    expect(wazony(losDla('wazony', 'pusta'), [])).toBe(-1);
  });

  it('ujemna waga albo ułamek rzuca RangeError', () => {
    const r = losDla('wazony', 'bledy');
    expect(() => wazony(r, [1, -1])).toThrow(RangeError);
    expect(() => wazony(r, [1.5, 2])).toThrow(RangeError);
    expect(() => wazony(r, [Number.NaN, 1])).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------- calkowita

describe('calkowita: przedział domknięty', () => {
  it('daje wszystkie wartości z [od, doW] i nic spoza', () => {
    const r = losDla('calkowita', 'trzy-piec');
    const widziane = new Set<number>();
    for (let i = 0; i < 3000; i++) widziane.add(calkowita(r, 3, 5));
    expect([...widziane].sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it('ten sam strumień co ri z rng.ts (ten sam przedział domknięty)', () => {
    const a = mulberry(7);
    const b = mulberry(7);
    for (let i = 0; i < 200; i++) expect(calkowita(a, 2, 9)).toBe(ri(2, 9, b));
  });

  it('od równe doW zawsze daje od', () => {
    const r = losDla('calkowita', 'rowne');
    for (let i = 0; i < 100; i++) expect(calkowita(r, 4, 4)).toBe(4);
  });

  it('od większe niż doW rzuca RangeError', () => {
    expect(() => calkowita(losDla('calkowita', 'odwrot'), 5, 3)).toThrow(RangeError);
  });

  it('granice niecałkowite rzucają RangeError', () => {
    expect(() => calkowita(losDla('calkowita', 'ulamek'), 1.5, 3)).toThrow(RangeError);
    expect(() => calkowita(losDla('calkowita', 'ulamek'), 1, 3.5)).toThrow(RangeError);
  });
});
