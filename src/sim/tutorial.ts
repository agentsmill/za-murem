/* Samouczek „pierwsze trzy minuty” jako stan gry, bez tekstów na ekranie (podpowiedzi rysuje interfejs).
   Kroki idą po kolei; krok kończy się, kiedy jego warunek jest spełniony, a at[k] to tick, w którym się skończył.
   Zaznaczenie i polecenie to zdarzenia z poleceń, reszta wynika ze stanu (sprawdzana co krok ciepła). */

export const TUT_STEPS = ['zaznacz', 'rozkaz', 'sciete', 'sklad', 'koza', 'cieplo'] as const;
export type TutStep = (typeof TUT_STEPS)[number];

export interface Tutorial {
  /** bieżący krok (indeks w TUT_STEPS); TUT_STEPS.length: skończony; −1: wyłączony (świat bez wnętrza) */
  step: number;
  /** tick końca każdego kroku, −1: jeszcze nie */
  at: number[];
}

/** od tej temperatury w pomieszczeniu z kozą w mieszkaniu jest ciepło */
export const WARM_ENOUGH = 18;

/** kończy kolejne kroki, dopóki ich warunek jest spełniony */
export function tutAdvance(t: Tutorial, tick: number, ok: (s: TutStep) => boolean): void {
  while (t.step >= 0 && t.step < TUT_STEPS.length && ok(TUT_STEPS[t.step])) {
    t.at[t.step] = tick;
    t.step++;
  }
}
