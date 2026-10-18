/* Menu budowy po angielsku (src/ui/budowa.ts zostaje po polsku, pilnują go testy): gdzie wolno stawiać, po tych
   samych kluczach co placeText, z lokum zarządu ze słownika miejsca (your flat, w domu your house). */

import type { WordsEn } from '../gov/miejsce.ts';
import type { BuildPlace } from '../sim/budowle.ts';

export const placeEn = (place: BuildPlace, e: WordsEn): string =>
  ({
    pokoj: `in a room of ${e.lokal.w}`,
    kuchnia: `in the kitchen of ${e.lokal.w}`,
    podworko: 'in the yard, inside the fence',
    obwod: 'in place of a stretch of fence',
  })[place];
