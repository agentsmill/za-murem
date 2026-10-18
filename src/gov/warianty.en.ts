/* Angielskie teksty wydarzeń z 0.3 tak, jak gra je pokazuje: treść z src/content/events.ts z nakładkami M1
   z src/gov/warianty.ts (pora, miejsce, warianty dla domu i bloku, „Drewno” zamiast „Opał”). Polska treść zostaje bajt
   w bajt, a angielska powstaje tu z tych samych danych wydarzenia (ActiveEvent.d) i tego samego gospodarza. Wpisy do
   kroniki z wyborów 0.3 przychodzą jako gotowe polskie zdania, więc `log` tłumaczy polski wpis na angielski; to
   bezpieczne, bo treść 0.3 jest zamrożona testem zgodności.

   Kontrakt: funkcje tylko czytają gospodarza (zapasy, miejsce, słowa, ludzie) i nigdy nie losują (`h.rng`,
   `h.shuffle`, `h.makePerson`) ani nic nie zmieniają, bo gra woła je obok polskich w tej samej chwili. Wydarzenie bez
   wpisu tutaj pokazuje się po angielsku z polskim tekstem, a test pokrycia to łapie. Słowa: docs/SLOWNICZEK-EN.md. */

import type { GovHost } from './tresc.ts';

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzeń z 0.3 mają różne kształty
type D = any;

export interface EventEn {
  title: (h: GovHost, d: D) => string;
  text: (h: GovHost, d: D) => string;
  /** napisy wyborów w kolejności wyborów z gry (po nakładce); pl to ich polskie napisy, z „Drewno” zamiast „Opał” */
  labels: (h: GovHost, d: D, pl: readonly string[]) => string[];
  /** polski wpis do kroniki z wyboru k (już z drewnem i zwrotami miejsca) po angielsku; null, gdy wpisu nie zna */
  log?: (pl: string, h: GovHost, d: D, k: number) => string | null;
}

/** po id wydarzenia z OLD_EVENTS */
export const EVENTS_EN: Record<string, EventEn> = {};
