/* Nakładka broni na klatki ciosu z PixelLab. Kod liczy dłoń z klatek postaci rysowanych kodem (bron.ts: handOf), a w
   klatkach ciosu z PixelLab dłoń leży gdzie indziej: pomiar (tools/dlonie.ts, plamy skóry poza głową w klatkach
   czterech postaci zarządu, jedynych z animacją ciosu) dał medianę błędu 8 px, a w zamachu nawet 13 px. Detektor jest
   szumny, więc tabela ma tylko wpisy, na które zgadza się większość z sześciu wariantów próbki koloru skóry; reszta to
   zero (błąd w granicach szumu pomiaru). Wpisy dotyczą zamachu z przodu i z tyłu, dokończenia z boku i pchnięcia dzidą
   (poza celowania na klatkach ciosu). Trzymanie broni zostaje bez korekty: dłonie wiszą przy biodrach, a kropka z kodu
   leży w dłoni. Tabelę liczy node tools/dlonie.ts. Czyste dane, bez PixiJS. */

import type { ArmPose } from './bron.ts';

/** przesunięcie nakładki [dx, dy] w pikselach świata */
export type Korekta = readonly [number, number];

const BRAK: Korekta = [0, 0];

/** korekty ciosu po kierunku (0 przód, 1 tył, 3 wschód) i klatce z gry (zamach, uderzenie, dokończenie) */
const COS: Record<number, readonly Korekta[]> = {
  0: [[-4, 4], BRAK, BRAK],
  1: [[0, 9], BRAK, BRAK],
  3: [BRAK, BRAK, [-12, -4]],
};

/** korekty pchnięcia dzidą: poza celowania z dwiema klatkami z gry (strzał, odrzut) na klatkach ciosu */
const PCHNIECIE: Record<number, readonly Korekta[]> = {
  0: [
    [5, -11],
    [7, -3],
  ],
  1: [[-9, 0], BRAK],
  3: [[-9, -12], BRAK],
};

/**
 * Przesunięcie nakładki broni dla klatki z PixelLab (poza ręki, kierunek pionka 0 przód, 1 tył, 2 zachód, 3 wschód,
 * klatka z gry). Zachód to odbity wschód, więc przesunięcie w poziomie zmienia znak. Numer klatki poza tabelą liczy się
 * jako ostatnia, kierunek spoza 0 do 3 i trzymanie jako brak korekty.
 */
export function korektaDloni(poza: ArmPose, dir: number, f: number): Korekta {
  if (poza === 'hold' || dir < 0 || dir > 3) return BRAK;
  const tab = (poza === 'swing' ? COS : PCHNIECIE)[dir === 2 ? 3 : dir];
  const [dx, dy] = tab[Math.min(Math.max(f, 0), tab.length - 1)];
  return dir === 2 ? [-dx || 0, dy] : [dx, dy];
}
