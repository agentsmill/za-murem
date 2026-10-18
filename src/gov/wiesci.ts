/* Wieść się niesie (docs/superpowers/specs/2026-10-18-wedrowcy-design.md): napaść zarządu na obcego kosztuje zaufanie
   i wkurzenie osiedla. Symulacja podaje listę napaści (GovInput.napady), a zarząd liczy nowe po napadN, tak jak zgony
   po deadN: raz na napaść, od razu, z linią w kronice. Pole napadN powstaje dopiero przy pierwszej napaści, więc gra
   bez napaści ma ten sam stan zarządu. Napisy w obu językach: do kroniki idzie na razie polski. */

import { placeIn, wordsOf } from './miejsce.ts';
import type { GovEffects, GovInput, GovState } from './typy.ts';
import { logGov, mood } from './wspolne.ts';

type Kto = 'handlarz' | 'wedrowiec';

/** cena napaści: zmiana zaufania i wkurzenia */
export const CENA: Record<Kto, { trust: number; anger: number }> = {
  handlarz: { trust: -6, anger: 4 },
  wedrowiec: { trust: -3, anger: 2 },
};

/** linia do kroniki; Zarzad: „Zarząd” albo w domu słowo ze słownika miejsca, pod: „pod bramą” albo „pod furtką” */
export const WIESC: Record<Kto, (Zarzad: string, pod: string) => { pl: string; en: string }> = {
  handlarz: (Zarzad, pod) => ({
    pl: `Wieść się niesie: ${Zarzad.toLowerCase()} napadł na handlarza ${pod}. Ludzie pytają, kto będzie następny.`,
    en: 'Word gets around: the board robbed the trader at the gate. People ask who will be next.',
  }),
  wedrowiec: (Zarzad) => ({
    pl: `Wieść się niesie: ${Zarzad.toLowerCase()} napadł na wędrowca. Ludzie kręcą głowami.`,
    en: 'Word gets around: the board robbed a wanderer. People shake their heads.',
  }),
};

/** nowe napaści z wejścia: zaufanie i wkurzenie, linia do kroniki i raportu nocy */
export function wiesci(st: GovState, i: GovInput, fx: GovEffects): void {
  const all = i.napady ?? [];
  const from = st.napadN ?? 0;
  if (all.length <= from) return;
  st.napadN = all.length;
  const s = wordsOf(placeIn(i));
  for (const n of all.slice(from)) {
    const c = CENA[n.kto];
    if (!c) continue;
    mood(st, c.trust, c.anger);
    const line = WIESC[n.kto](s.Zarzad, s.brama.pod).pl;
    if (st.night?.confirmed) st.night.lines.push(line);
    logGov(st, i, line, true, fx);
  }
}
