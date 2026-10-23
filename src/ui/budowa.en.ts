/* Menu budowy po angielsku (src/ui/budowa.ts zostaje po polsku, pilnują go testy): gdzie wolno stawiać, po tych
   samych kluczach co placeText, z lokum zarządu ze słownika miejsca (your flat, w domu your house). */

import type { WordsEn } from '../gov/miejsce.ts';
import type { BuildPlace } from '../sim/budowle.ts';

export const placeEn = (place: BuildPlace, e: WordsEn): string =>
  ({
    pokoj: `in a room of ${e.lokal.w}`,
    kuchnia: `in the kitchen of ${e.lokal.w}`,
    lazienka: `in the bathroom of ${e.lokal.w}`,
    klatka: 'in the HQ stairwell (in a house, the hallway)',
    okno: `in a room, the kitchen or the hallway of ${e.lokal.w}, near a window`,
    podworko: 'in the yard, inside the fence',
    obwod: 'in place of a stretch of fence',
  })[place];
