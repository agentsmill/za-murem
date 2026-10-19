/* Wieść się niesie (docs/superpowers/specs/2026-10-18-wedrowcy-design.md): napaść zarządu na obcego kosztuje zaufanie
   i wkurzenie osiedla. Symulacja podaje listę napaści (GovInput.napady), a zarząd liczy nowe po napadN, tak jak zgony
   po deadN: raz na napaść, od razu, z linią w kronice. Pole napadN powstaje dopiero przy pierwszej napaści, więc gra
   bez napaści ma ten sam stan zarządu. Linia do kroniki i raportu w obu językach (Tx), ze słowami miejsca.

   Tak samo zwerbowani wędrowcy (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, część B): lista
   GovInput.werbunek, nowe po werbunekN, jedna linia w kronice na osobę (do zarządu albo jako mieszkaniec). Zaufania
   i wkurzenia werbunek nie rusza. */

import { type Tx, tx } from '../core/jezyk.ts';
import { BLOK, placeIn, type WordsEn, wordsEn, wordsOf } from './miejsce.ts';
import type { GovEffects, GovInput, GovState } from './typy.ts';
import { logGov, mood } from './wspolne.ts';

type Kto = 'handlarz' | 'wedrowiec';

/** cena napaści: zmiana zaufania i wkurzenia */
export const CENA: Record<Kto, { trust: number; anger: number }> = {
  handlarz: { trust: -6, anger: 4 },
  wedrowiec: { trust: -3, anger: 2 },
};

/** linia do kroniki; Zarzad: „Zarząd” albo w domu słowo ze słownika miejsca, pod: „pod bramą” albo „pod furtką”,
    e: słowa miejsca po angielsku (the board przy the gate, w domu the street committee przy the garden gate) */
export const WIESC: Record<Kto, (Zarzad: string, pod: string, e?: WordsEn) => Tx> = {
  handlarz: (Zarzad, pod, e = wordsEn(BLOK)) =>
    tx(
      `Wieść się niesie: ${Zarzad.toLowerCase()} napadł na handlarza ${pod}. Ludzie pytają, kto będzie następny.`,
      `Word gets around: ${e.zarzad} robbed the trader at ${e.brama}. People are asking who’s next.`,
    ),
  wedrowiec: (Zarzad, _pod, e = wordsEn(BLOK)) =>
    tx(
      `Wieść się niesie: ${Zarzad.toLowerCase()} napadł na wędrowca. Ludzie kręcą głowami.`,
      `Word gets around: ${e.zarzad} robbed a wanderer. People are shaking their heads.`,
    ),
};

/** nowe napaści z wejścia: zaufanie i wkurzenie, linia do kroniki i raportu nocy */
export function wiesci(st: GovState, i: GovInput, fx: GovEffects): void {
  const all = i.napady ?? [];
  const from = st.napadN ?? 0;
  if (all.length <= from) return;
  st.napadN = all.length;
  const s = wordsOf(placeIn(i));
  const e = wordsEn(placeIn(i));
  for (const n of all.slice(from)) {
    const c = CENA[n.kto];
    if (!c) continue;
    mood(st, c.trust, c.anger);
    const line = WIESC[n.kto](s.Zarzad, s.brama.pod, e);
    if (st.night?.confirmed) st.night.lines.push(line);
    logGov(st, i, line, true, fx);
  }
}

/** linia do kroniki o zwerbowanym wędrowcu: do zarządu (słowa miejsca) albo jako mieszkaniec */
export const WERBUNEK = {
  zarzad: (first: string, s: { dk: string }, e: WordsEn): Tx =>
    tx(`Z ulicy do ${s.dk} dołącza ${first}.`, `${first} joins ${e.krotko} from the street.`),
  mieszkaniec: (first: string, f: boolean): Tx =>
    tx(`${first} zamieszka u nas jako ${f ? 'mieszkanka' : 'mieszkaniec'}.`, `${first} is moving in as a resident.`),
};

/** nowo zwerbowani z wejścia: po jednej linii w kronice i raporcie nocy, bez wpływu na zaufanie */
export function przyjeciaZUlicy(st: GovState, i: GovInput, fx: GovEffects): void {
  const all = i.werbunek ?? [];
  const from = st.werbunekN ?? 0;
  if (all.length <= from) return;
  st.werbunekN = all.length;
  const s = wordsOf(placeIn(i));
  const e = wordsEn(placeIn(i));
  for (const n of all.slice(from)) {
    const line = n.dokad === 'zarzad' ? WERBUNEK.zarzad(n.first, s.zarzad, e) : WERBUNEK.mieszkaniec(n.first, n.f);
    if (st.night?.confirmed) st.night.lines.push(line);
    logGov(st, i, line, true, fx);
  }
}
