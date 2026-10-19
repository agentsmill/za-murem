/* Rdzeń języka (src/core/jezyk.ts) i liczby w tekstach (src/ui/tekst.ts) w obu językach. */

import { afterEach, describe, expect, it } from 'vitest';
import {
  isTx,
  jezyk,
  L,
  liczba,
  mnogaPl,
  poZmianieJezyka,
  tr,
  tx,
  txCat,
  txJoin,
  txOf,
  txSame,
  ustawJezyk,
} from '../../src/core/jezyk.ts';
import { deg, manyEn, num, pct, signed } from '../../src/ui/tekst.ts';

afterEach(() => ustawJezyk('pl'));

describe('rdzeń języka', () => {
  it('w Node domyślnie po polsku, po zmianie po angielsku', () => {
    expect(jezyk()).toBe('pl');
    expect(tr(tx('Pauza', 'Pause'))).toBe('Pauza');
    expect(L('Pauza', 'Pause')).toBe('Pauza');
    ustawJezyk('en');
    expect(jezyk()).toBe('en');
    expect(tr(tx('Pauza', 'Pause'))).toBe('Pause');
    expect(L('Pauza', 'Pause')).toBe('Pause');
  });

  it('stary napis ze stanu zostaje taki sam w obu językach', () => {
    expect(tr('stary wpis')).toBe('stary wpis');
    ustawJezyk('en');
    expect(tr('stary wpis')).toBe('stary wpis');
    expect(tr(null)).toBe('');
    expect(tr(undefined)).toBe('');
    expect(txOf('wpis')).toEqual({ pl: 'wpis', en: 'wpis' });
    expect(txOf(tx('a', 'b'))).toEqual({ pl: 'a', en: 'b' });
  });

  it('sklejanie tekstów w obu językach', () => {
    expect(txSame('Ania')).toEqual({ pl: 'Ania', en: 'Ania' });
    expect(txJoin([tx('a', 'A'), tx('b', 'B')], tx(' i ', ' and '))).toEqual({ pl: 'a i b', en: 'A and B' });
    expect(txJoin([tx('a', 'A'), tx('b', 'B')], ', ')).toEqual({ pl: 'a, b', en: 'A, B' });
    expect(txJoin([])).toEqual({ pl: '', en: '' });
    expect(txCat(tx('Noc', 'Night'), ': ', tx('spokój', 'quiet'))).toEqual({ pl: 'Noc: spokój', en: 'Night: quiet' });
    expect(isTx(tx('a', 'b'))).toBe(true);
    expect(isTx('a')).toBe(false);
    expect(isTx(null)).toBe(false);
    expect(isTx({ pl: 'a' })).toBe(false);
  });

  it('słuchacz woła się tylko przy prawdziwej zmianie, a odpięty już nie', () => {
    const seen: string[] = [];
    const off = poZmianieJezyka((l) => seen.push(l));
    ustawJezyk('pl');
    ustawJezyk('en');
    ustawJezyk('en');
    off();
    ustawJezyk('pl');
    expect(seen).toEqual(['en']);
  });

  it('liczba w danym języku: przecinek albo kropka, prawdziwy minus', () => {
    expect(liczba(1.5, 1, 'pl')).toBe('1,5');
    expect(liczba(1.5, 1, 'en')).toBe('1.5');
    expect(liczba(-2.26, 1, 'en')).toBe('−2.3');
    expect(liczba(-0.04, 1, 'pl')).toBe('0');
    expect(liczba(3, 0, 'en')).toBe('3');
  });

  it('polska liczba mnoga z liczbą: jedna, kilka (2–4 poza 12–14) i wiele', () => {
    const osoby = (n: number) => mnogaPl(n, 'osoba', 'osoby', 'osób');
    expect(osoby(0)).toBe('0 osób');
    expect(osoby(1)).toBe('1 osoba');
    for (const n of [2, 3, 4, 22, 23, 24, 32, 63, 102, 124, 1004]) expect(osoby(n), `${n}`).toBe(`${n} osoby`);
    for (const n of [5, 9, 10, 11, 12, 13, 14, 15, 20, 21, 25, 31, 61, 100, 101, 111, 112, 113, 114, 121, 250, 500])
      expect(osoby(n), `${n}`).toBe(`${n} osób`);
    // liczba całkowita: ułamek zaokrągla się, a minus jest prawdziwy
    expect(osoby(62.4)).toBe('62 osoby');
    expect(osoby(-3)).toBe('−3 osoby');
  });
});

describe('liczby w tekstach według bieżącego języka', () => {
  it('po polsku jak dotąd', () => {
    expect(num(1.5)).toBe('1,5');
    expect(signed(-2)).toBe('−2');
    expect(signed(1.5)).toBe('+1,5');
    expect(signed(0)).toBe('0');
    expect(deg(-3)).toBe('−3°C');
    expect(pct(0.33)).toBe('33%');
  });

  it('po angielsku z kropką', () => {
    ustawJezyk('en');
    expect(num(1.5)).toBe('1.5');
    expect(signed(-2)).toBe('−2');
    expect(signed(1.5)).toBe('+1.5');
    expect(deg(12)).toBe('12°C');
    expect(pct(0.5)).toBe('50%');
  });

  it('angielska liczba mnoga', () => {
    expect(manyEn(1, 'person', 'people')).toBe('1 person');
    expect(manyEn(2, 'person', 'people')).toBe('2 people');
    expect(manyEn(0, 'person', 'people')).toBe('0 people');
  });
});
