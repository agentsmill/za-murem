import { describe, expect, it } from 'vitest';
import { korektaDloni } from '../../src/render/art/bronPixellab.ts';

describe('korekta nakładki broni na klatki ciosu z PixelLab', () => {
  it('cios: przesunięcie z pomiaru dłoni, osobno dla przodu, tyłu i boku, klatki zamachu, uderzenia i dokończenia', () => {
    // zamach z przodu i z tyłu: dłoń z kodu jest za wysoko względem klatek PixelLab; dokończenie z boku: dłoń jest z tyłu
    expect(korektaDloni('swing', 0, 0)).toEqual([-4, 4]);
    expect(korektaDloni('swing', 1, 0)).toEqual([0, 9]);
    expect(korektaDloni('swing', 3, 2)).toEqual([-12, -4]);
    // reszta mieści się w szumie pomiaru: bez korekty
    expect(korektaDloni('swing', 0, 1)).toEqual([0, 0]);
    expect(korektaDloni('swing', 3, 0)).toEqual([0, 0]);
  });

  it('zachód to odbity wschód: przesunięcie w poziomie zmienia znak, w pionie zostaje', () => {
    for (const poza of ['swing', 'aim'] as const)
      for (let f = 0; f < 3; f++) {
        const [dx, dy] = korektaDloni(poza, 3, f);
        const [wx, wy] = korektaDloni(poza, 2, f);
        expect(wx, `${poza} ${f}`).toBe(dx === 0 ? 0 : -dx);
        expect(wy, `${poza} ${f}`).toBe(dy);
      }
  });

  it('pchnięcie dzidą (poza celowania na klatkach ciosu) ma własną tabelę, drugą klatkę bierze też dla dalszych', () => {
    expect(korektaDloni('aim', 0, 0)).toEqual([5, -11]);
    expect(korektaDloni('aim', 3, 0)).toEqual([-9, -12]);
    // celowanie ma dwie klatki z gry (strzał i odrzut): wyższe numery to druga klatka
    expect(korektaDloni('aim', 0, 5)).toEqual(korektaDloni('aim', 0, 1));
  });

  it('trzymanie broni nie jest korygowane (dłonie wiszą przy biodrach, kropka z kodu leży w dłoni)', () => {
    for (let dir = 0; dir < 4; dir++) expect(korektaDloni('hold', dir, 0)).toEqual([0, 0]);
  });

  it('numer klatki poza tabelą liczy się jako ostatnia klatka, nieznany kierunek jako brak korekty', () => {
    expect(korektaDloni('swing', 0, 9)).toEqual(korektaDloni('swing', 0, 2));
    expect(korektaDloni('swing', 7, 0)).toEqual([0, 0]);
  });

  it('zwraca liczby całkowite (piksele), a każdy wpis jest zerem albo mieści się w 15 px', () => {
    for (const poza of ['swing', 'aim'] as const)
      for (let dir = 0; dir < 4; dir++)
        for (let f = 0; f < 3; f++) {
          const [dx, dy] = korektaDloni(poza, dir, f);
          expect(Number.isInteger(dx) && Number.isInteger(dy), `${poza} ${dir} ${f}`).toBe(true);
          expect(Math.abs(dx), `${poza} ${dir} ${f}`).toBeLessThanOrEqual(15);
          expect(Math.abs(dy), `${poza} ${dir} ${f}`).toBeLessThanOrEqual(15);
        }
  });
});
