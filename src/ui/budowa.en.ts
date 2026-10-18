/* Menu budowy po angielsku (src/ui/budowa.ts zostaje po polsku, pilnują go testy): gdzie wolno stawiać, po tych
   samych kluczach co PLACE_TEXT. */

import type { BuildPlace } from '../sim/budowle.ts';

export const PLACE_EN: Record<BuildPlace, string> = {
  pokoj: 'in a room of your flat',
  kuchnia: 'in your kitchen',
  podworko: 'in the yard, inside the fence',
  obwod: 'in place of a stretch of fence',
};
