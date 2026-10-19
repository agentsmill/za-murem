import { describe, expect, it } from 'vitest';
import { BRAK_SKROTU, porownaj } from '../../tools/determinizm/porownanie.ts';
import { kodWyjscia } from '../../tools/determinizm/raport.ts';

describe('porównanie skrótów z różnych silników', () => {
  it('porownaj znajduje pierwszą rozbieżną godzinę', () => {
    expect(porownaj({ node: ['a', 'b', 'c'], chromium: ['a', 'b', 'c'] })).toEqual({ zgodne: true, pierwsza: null });
    expect(porownaj({ node: ['a', 'b', 'c'], webkit: ['a', 'x', 'y'] }).pierwsza).toEqual({
      godzina: 1,
      silniki: { node: 'b', webkit: 'x' },
    });
  });

  it('przy trzech silnikach pokazuje skróty wszystkich, także tych zgodnych', () => {
    const r = porownaj({ node: ['a', 'b'], jsc: ['a', 'b'], webkit: ['a', 'z'] });
    expect(r.zgodne).toBe(false);
    expect(r.pierwsza).toEqual({ godzina: 1, silniki: { node: 'b', jsc: 'b', webkit: 'z' } });
  });

  it('silnik z krótszym przebiegiem jest rozbieżny od pierwszej brakującej godziny', () => {
    const r = porownaj({ node: ['a', 'b', 'c'], jsc: ['a'] });
    expect(r.zgodne).toBe(false);
    expect(r.pierwsza).toEqual({ godzina: 1, silniki: { node: 'b', jsc: BRAK_SKROTU } });
  });

  it('jeden silnik albo żaden nie ma z czym się rozjechać', () => {
    expect(porownaj({ node: ['a', 'b'] })).toEqual({ zgodne: true, pierwsza: null });
    expect(porownaj({})).toEqual({ zgodne: true, pierwsza: null });
  });
});

describe('kod wyjścia bramki determinizmu', () => {
  it('0 przy zgodzie wszystkich silników docelowych, 1 przy rozbieżności, 2 przy braku silnika', () => {
    expect(kodWyjscia({ rozbiezne: false, brakujaceDocelowe: [] })).toBe(0);
    expect(kodWyjscia({ rozbiezne: true, brakujaceDocelowe: [] })).toBe(1);
    expect(kodWyjscia({ rozbiezne: false, brakujaceDocelowe: ['firefox', 'webkit'] })).toBe(2);
  });

  it('rozbieżność ważniejsza niż brak silnika: nie da się jej przykryć kodem 2', () => {
    expect(kodWyjscia({ rozbiezne: true, brakujaceDocelowe: ['firefox'] })).toBe(1);
  });
});
