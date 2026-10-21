/* Pies i kot w zarządzie (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Pies i kot”): karta „Pies przy
   siatce” ustawia flagę `dog`, karta „Kot w piwnicy” albo „Kot w szopie” (wybór „Uwolnić i przygarnąć”) flagę `cat`, ale
   zwierzę ma być też na mapie. Właścicielem życia zwierzęcia jest symulacja (`SimState.zwierzeta`, odczyt
   `GovInput.zwierzeta`), zarząd tylko do niej prosi i reaguje na śmierć psa.
   `zwierzeta(st, i, fx)`, raz na krok zarządu:
   - flaga `dog` albo `cat` jest, a symulacja nie ma o tym zwierzęciu wpisu: `fx.zwierze` prosi o wystawienie. Ta jedna
     reguła obejmuje świeże przygarnięcie i stary zapis z flagą bez pionka (wystawienie jest po stronie symulacji
     idempotentne, więc ponowna prośba przed następnym krokiem niczego nie dubluje);
   - symulacja zgłasza śmierć psa (`zwierzeta.pies === 'zginal'`), a flaga `dog` jeszcze jest: flaga gaśnie (obrona nocy w
     noc.ts przestaje go liczyć), kronika dostaje wpis po polsku i po angielsku (pies ma na imię Abonament, jak w karcie), a
     wszystkim z zarządu nastrój spada o 3 na dobę (powód „Abonament nie żyje”, tłumaczony w src/content/nastroje.en.ts).
   Kot nie ginie, więc nie ma dla niego żadnej reakcji. Zarząd nie importuje src/sim. Nic tu nie losuje. */

import { tx } from '../core/jezyk.ts';
import { placeIn, wordsEn, wordsOf } from './miejsce.ts';
import type { GovEffects, GovInput, GovState } from './typy.ts';
import { logGov } from './wspolne.ts';

/** powód chwilowego nastroju po śmierci psa (klucz po polsku, jak każdy powód nastroju) */
export const NASTROJ_PSA = 'Abonament nie żyje';
/** o ile i na jak długo spada nastrój po śmierci psa */
export const NASTROJ_PSA_D = -3;
export const NASTROJ_PSA_GODZIN = 24;

export function zwierzeta(st: GovState, i: GovInput, fx: GovEffects): void {
  const z = i.zwierzeta;
  if (st.flags.dog) {
    if (z?.pies === 'zginal') {
      st.flags.dog = false;
      const brama = wordsOf(placeIn(i)).brama.przy;
      const gate = wordsEn(placeIn(i)).brama;
      logGov(
        st,
        i,
        tx(`Abonament nie żyje. Szwendacz dopadł go ${brama}.`, `Subscription is dead. A shambler got him at ${gate}.`),
        true,
        fx,
      );
      for (const p of i.people)
        fx.moods.push({ id: p.id, why: NASTROJ_PSA, d: NASTROJ_PSA_D, hours: NASTROJ_PSA_GODZIN });
    } else if (z?.pies === undefined) (fx.zwierze ??= []).push('pies');
  }
  if (st.flags.cat && z?.kot === undefined) (fx.zwierze ??= []).push('kot');
}
