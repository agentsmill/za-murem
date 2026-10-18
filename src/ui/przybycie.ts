/* Przybysze: ludzie przyjęci przez zarząd idą zza bramy do swoich mieszkań (praca 'arrive' w symulacji).
   Interfejs pokazuje komunikat „N osób idzie od bramy” z przyciskiem „Pokaż”, dopóki ktoś jeszcze idzie.
   Czyste funkcje stanu, bez DOM; komunikat w bieżącym języku. */

import { jezyk } from '../core/jezyk.ts';
import type { Pawn, SimState } from '../sim/sim.ts';

/** przyjęci, którzy jeszcze idą od bramy */
export const arriving = (st: SimState): Pawn[] =>
  st.pawns.filter((p) => p.kind === 'resident' && p.job?.t === 'arrive');

/** „1 osoba idzie od bramy”, „3 osoby idą od bramy”, „5 osób idzie od bramy”, „22 osoby idą od bramy”;
    po angielsku „1 person is coming in from the gate”, „3 people are coming in from the gate” */
export function comingText(n: number): string {
  if (jezyk() === 'en')
    return n === 1 ? '1 person is coming in from the gate' : `${n} people are coming in from the gate`;
  if (n === 1) return '1 osoba idzie od bramy';
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return few ? `${n} osoby idą od bramy` : `${n} osób idzie od bramy`;
}
