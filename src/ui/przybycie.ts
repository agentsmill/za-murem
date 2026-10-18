/* Przybysze: ludzie przyjęci przez zarząd idą zza bramy do swoich mieszkań (praca 'arrive' w symulacji).
   Interfejs pokazuje komunikat „N osób idzie od bramy” z przyciskiem „Pokaż”, dopóki ktoś jeszcze idzie.
   Czyste funkcje stanu, bez DOM. */

import { BLOK, type Words, wordsOf } from '../gov/miejsce.ts';
import type { Pawn, SimState } from '../sim/sim.ts';

/** przyjęci, którzy jeszcze idą od bramy */
export const arriving = (st: SimState): Pawn[] =>
  st.pawns.filter((p) => p.kind === 'resident' && p.job?.t === 'arrive');

/** „1 osoba idzie od bramy”, „3 osoby idą od bramy”, „5 osób idzie od bramy”, „22 osoby idą od bramy”;
    w domu od furtki (słownik miejsca) */
export function comingText(n: number, words: Words = wordsOf(BLOK)): string {
  const od = `od ${words.brama.d}`;
  if (n === 1) return `1 osoba idzie ${od}`;
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return few ? `${n} osoby idą ${od}` : `${n} osób idzie ${od}`;
}
