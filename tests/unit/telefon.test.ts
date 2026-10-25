/* Telefon: zwijane bloki stanu (src/ui/telefon.ts, linia potrzeb w src/ui/karta.ts) bez przeglądarki: pamięć wyboru (także bez
   dostępu do localStorage i z uszkodzonym wpisem), reguła kafelków pilnych zwiniętego paska i linia potrzeb na karcie osoby po
   polsku i po angielsku. Że pasek i karta naprawdę się zwijają, mierzą w Chromium scenariusze `telefon-*` (`npm run shots`). */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import type { Needs } from '../../src/sim/needs.ts';
import { potrzebyLinia } from '../../src/ui/karta.ts';
import {
  KAFELKI_DOMYSLNE,
  type Magazyn,
  PASEK_KEY,
  POTRZEBY_KEY,
  pilneKafelki,
  TELEFON_MQ,
  UKLAD_TELEFONU_MQ,
  WIECEJ_KEY,
  wczytajWybor,
  zapiszWybor,
} from '../../src/ui/telefon.ts';

/** magazyn w pamięci z licznikiem zapisów */
function atrapa(start: Record<string, string> = {}): Magazyn & { dane: Record<string, string> } {
  const dane = { ...start };
  return {
    dane,
    getItem: (k) => dane[k] ?? null,
    setItem: (k, v) => {
      dane[k] = v;
    },
  };
}

/** magazyn, który zawsze rzuca (tryb prywatny, zablokowane dane witryny) */
const psujacy: Magazyn = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('telefon: pamięć wyboru', () => {
  it('bez wpisu i z uszkodzonym wpisem pasek, potrzeby i „Więcej” są zwinięte', () => {
    expect(wczytajWybor(PASEK_KEY, atrapa())).toBe('zwiniete');
    expect(wczytajWybor(POTRZEBY_KEY, atrapa())).toBe('zwiniete');
    expect(wczytajWybor(WIECEJ_KEY, atrapa())).toBe('zwiniete');
    expect(wczytajWybor(PASEK_KEY, atrapa({ [PASEK_KEY]: 'cokolwiek' }))).toBe('zwiniete');
    expect(wczytajWybor(PASEK_KEY, atrapa({ [PASEK_KEY]: '' }))).toBe('zwiniete');
  });

  it('zapisany wybór wraca, każdy klucz osobno', () => {
    const m = atrapa();
    zapiszWybor(PASEK_KEY, 'rozwiniete', m);
    expect(wczytajWybor(PASEK_KEY, m)).toBe('rozwiniete');
    expect(wczytajWybor(POTRZEBY_KEY, m)).toBe('zwiniete');
    zapiszWybor(POTRZEBY_KEY, 'rozwiniete', m);
    zapiszWybor(PASEK_KEY, 'zwiniete', m);
    expect(wczytajWybor(PASEK_KEY, m)).toBe('zwiniete');
    expect(wczytajWybor(POTRZEBY_KEY, m)).toBe('rozwiniete');
    // klucze z rodziny gry
    expect(PASEK_KEY).toBe('za-murem-0.4-pasek');
    expect(POTRZEBY_KEY).toBe('za-murem-0.4-potrzeby');
    expect(WIECEJ_KEY).toBe('za-murem-0.4-wiecej');
  });

  it('bez dostępu do pamięci nic nie rzuca: odczyt to „zwiniete”, zapis nic nie robi', () => {
    expect(() => zapiszWybor(PASEK_KEY, 'rozwiniete', psujacy)).not.toThrow();
    expect(wczytajWybor(PASEK_KEY, psujacy)).toBe('zwiniete');
    expect(() => zapiszWybor(PASEK_KEY, 'rozwiniete', null)).not.toThrow();
    expect(wczytajWybor(PASEK_KEY, null)).toBe('zwiniete');
  });

  it('telefon to okno węższe niż 768 px albo niższe niż 501 px (od 768 px szerokości i 501 px wysokości pasek i karta jak na komputerze)', () => {
    expect(TELEFON_MQ).toBe('(max-width: 767px), (max-height: 500px)');
    // układ telefonu (zwarty stos, cele zwinięte domyślnie) zaczyna się wcześniej: do 640 px albo w niskim oknie
    expect(UKLAD_TELEFONU_MQ).toBe('(max-width: 640px), (max-height: 500px)');
  });
});

describe('telefon: kafelki pilne zwiniętego paska', () => {
  const kafelki = (poziomy: Record<string, 'ok' | 'mid' | 'bad'>) =>
    Object.entries(poziomy).map(([id, level]) => ({ id, level }));

  it('kafelki w stanie „uwaga” i „źle” są pilne, reszta nie', () => {
    const p = pilneKafelki(kafelki({ sOut: 'ok', sKit: 'bad', sFire: 'bad', sWood: 'mid', sFood: 'ok', sAnger: 'ok' }));
    expect([...p].sort()).toEqual(['sFire', 'sKit', 'sWood']);
  });

  it('gdy nic nie jest w stanie „uwaga” ani „źle”, pilne to jedzenie, drewno i wkurzenie', () => {
    const p = pilneKafelki(
      kafelki({ sOut: 'ok', sKit: 'ok', sFire: 'ok', sWood: 'ok', sFood: 'ok', sTrust: 'ok', sAnger: 'ok' }),
    );
    expect([...p].sort()).toEqual([...KAFELKI_DOMYSLNE].sort());
    expect(KAFELKI_DOMYSLNE).toEqual(['sFood', 'sWood', 'sAnger']);
  });

  it('domyślne trio to tylko te kafelki, które układ w ogóle ma, a pusta lista daje pusty zbiór', () => {
    expect([...pilneKafelki(kafelki({ sKit: 'ok', sFood: 'ok' }))]).toEqual(['sFood']);
    expect(pilneKafelki([]).size).toBe(0);
  });

  it('jedno ostrzeżenie wypiera domyślne trio (linia ma pokazywać tylko to, co pilne)', () => {
    const p = pilneKafelki(kafelki({ sKit: 'ok', sFire: 'bad', sWood: 'ok', sFood: 'ok', sAnger: 'ok' }));
    expect([...p]).toEqual(['sFire']);
  });
});

describe('telefon: linia potrzeb na karcie osoby', () => {
  afterEach(() => ustawJezyk('pl'));
  const potrzeby = (zmiany: Partial<Needs> = {}): Needs => ({
    food: 80,
    warm: 80,
    rest: 80,
    health: 100,
    safe: 70,
    mood: 70,
    ...zmiany,
  });

  it('wymienia potrzeby w stanie „uwaga” i „źle” w kolejności kart, z liczbami, i bierze kolor od najgorszej', () => {
    const html = potrzebyLinia(potrzeby({ warm: 22, food: 45 }), false);
    expect(html).toContain('class="potrzeby-linia bad"');
    expect(html).toContain('data-card="potrzeby"');
    expect(html).toContain('Najedzenie 45 · Ciepło 22');
    // sama „uwaga” (żadnej poniżej 25) to kolor ostrzegawczy
    expect(potrzebyLinia(potrzeby({ food: 45 }), false)).toContain('class="potrzeby-linia mid"');
  });

  it('bez ostrzeżeń mówi, że potrzeby są w normie, i nadal jest przyciskiem do rozwinięcia', () => {
    const html = potrzebyLinia(potrzeby(), false);
    expect(html).toContain('class="potrzeby-linia ok"');
    expect(html).toContain('Potrzeby w normie');
    expect(html).toContain('<button type="button"');
  });

  it('po angielsku używa angielskich nazw potrzeb i angielskiego zdania', () => {
    ustawJezyk('en');
    expect(potrzebyLinia(potrzeby({ warm: 22, food: 45 }), true)).toContain('Fed 45 · Warmth 22');
    expect(potrzebyLinia(potrzeby(), true)).toContain('Needs are fine');
  });

  it('liczby zaokrągla jak paski karty', () => {
    expect(potrzebyLinia(potrzeby({ warm: 21.6 }), false)).toContain('Ciepło 22');
  });
});
