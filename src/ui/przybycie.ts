/* Przybysze: ludzie przyjęci przez zarząd idą zza bramy do swoich mieszkań (praca 'arrive' w symulacji).
   Interfejs pokazuje komunikat „N osób idzie od bramy” z przyciskiem „Pokaż”, dopóki ktoś jeszcze idzie.
   Czyste funkcje stanu, bez DOM; komunikat w bieżącym języku. */

import { jezyk } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import type { Pawn, SimState } from '../sim/sim.ts';

/** przyjęci, którzy jeszcze idą od bramy */
export const arriving = (st: SimState): Pawn[] =>
  st.pawns.filter((p) => p.kind === 'resident' && p.job?.t === 'arrive');

/** „1 osoba idzie od bramy”, „3 osoby idą od bramy”, „5 osób idzie od bramy”, „22 osoby idą od bramy”;
    w domu od furtki (słownik miejsca); po angielsku „1 person is coming in from the gate”, „3 people are coming in from
    the gate” */
export function comingText(n: number, words: Words = wordsOf(BLOK), e: WordsEn = wordsEn(BLOK)): string {
  if (jezyk() === 'en')
    return n === 1 ? `1 person is coming in from ${e.brama}` : `${n} people are coming in from ${e.brama}`;
  const od = `od ${words.brama.d}`;
  if (n === 1) return `1 osoba idzie ${od}`;
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return few ? `${n} osoby idą ${od}` : `${n} osób idzie ${od}`;
}
