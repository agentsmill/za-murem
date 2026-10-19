import { describe, expect, it } from 'vitest';
import { BRAK_SKROTU, porownaj } from '../../tools/determinizm/porownanie.ts';
import { kodWyjscia, miejscaZeStosu } from '../../tools/determinizm/raport.ts';

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

describe('miejsce wywołania w kodzie ze stosu', () => {
  const korzen = '/Users/ktos/gra';
  const stos = [
    'Error',
    '    at matematyka.<computed> (file:///Users/ktos/gra/tools/determinizm/nagrywanie.ts:71:57)',
    '    at file:///Users/ktos/gra/src/sim/sim.ts:6454:40',
    '    at Array.every (<anonymous>)',
    '    at Sim.farTile (file:///Users/ktos/gra/src/sim/sim.ts:6454:22)',
    '    at Sim.topUp (file:///Users/ktos/gra/src/sim/sim.ts:6437:22)',
    '    at Sim.step (file:///Users/ktos/gra/src/sim/sim.ts:2240:12)',
  ].join('\n');

  it('pomija ramki narzędzia i silnika, resztę podaje jako plik:linia:kolumna względem korzenia', () => {
    expect(miejscaZeStosu(stos, korzen)).toEqual([
      'src/sim/sim.ts:6454:40',
      'src/sim/sim.ts:6454:22 (Sim.farTile)',
      'src/sim/sim.ts:6437:22 (Sim.topUp)',
    ]);
    expect(miejscaZeStosu(stos, `${korzen}/`, 1)).toEqual(['src/sim/sim.ts:6454:40']);
  });

  it('stos w innym formacie niż V8 albo bez ramek z pliku daje pustą listę', () => {
    expect(miejscaZeStosu('farTile@http://127.0.0.1:5173/src/sim/sim.ts:6454:22', korzen)).toEqual([]);
    expect(miejscaZeStosu('', korzen)).toEqual([]);
  });
});
