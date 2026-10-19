import { describe, expect, it } from 'vitest';
import { doParametrow, type Zlecenie, zParametrow } from '../../tools/determinizm/zlecenie.ts';

const odczyt = (p: Record<string, string>) => (k: string) => p[k];

describe('zlecenie przebiegu dla nóg silników', () => {
  it('parametry (argumenty procesu, zapytanie strony) odtwarzają zlecenie', () => {
    const z: Zlecenie = { demo: 'lanciego', godziny: 72, tryb: 'zombie', seed: 12345, powtorz: 2 };
    expect(zParametrow(odczyt(doParametrow(z)))).toEqual(z);
    const z2: Zlecenie = { ...z, nagraj: { od: 28800, do: 29600, stosPrzy: 1500 } };
    expect(zParametrow(odczyt(doParametrow(z2)))).toEqual(z2);
    expect(zParametrow(odczyt(doParametrow({ ...z, nagraj: { od: 0, do: 800 } }))).nagraj).toEqual({ od: 0, do: 800 });
    // nagranie od budowy świata (krok −1), żeby objąć rozbieżność z buildWorld
    expect(zParametrow(odczyt(doParametrow({ ...z, nagraj: { od: -1, do: 800 } }))).nagraj).toEqual({
      od: -1,
      do: 800,
    });
    // sama budowa świata: od kroku −1 do 0
    expect(zParametrow(odczyt(doParametrow({ ...z, nagraj: { od: -1, do: 0 } }))).nagraj).toEqual({ od: -1, do: 0 });
    const z3: Zlecenie = { ...z, psuj: 'hypot' };
    expect(zParametrow(odczyt(doParametrow(z3)))).toEqual(z3);
  });

  it('brakujące pola dostają wartości domyślne, złe są odrzucone', () => {
    expect(zParametrow(odczyt({}))).toEqual({
      demo: 'przymorze',
      godziny: 24,
      tryb: 'zwykly',
      seed: 12345,
      powtorz: 1,
    });
    expect(() => zParametrow(odczyt({ tryb: 'kosmiczny' }))).toThrow(/tryb/);
    expect(() => zParametrow(odczyt({ godziny: 'dużo' }))).toThrow(/godziny/);
    expect(() => zParametrow(odczyt({ demo: '../../etc/passwd' }))).toThrow(/demo/);
    expect(() => zParametrow(odczyt({ nagraj: '10' }))).toThrow(/nagraj/);
    expect(() => zParametrow(odczyt({ psuj: 'sqrt' }))).toThrow(/psuj/);
  });
});
