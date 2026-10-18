/* Karta mieszkania po angielsku (src/ui/mieszkania.ts zostaje po polsku, pilnują go testy): nazwy uszkodzeń i powody
   opuszczenia krótko i zdaniem, po tych samych kluczach co DAMAGE_NAME, WHY_SHORT i WHY_TEXT. */

import type { AptWhy, DamageKind } from '../world/apts.ts';

export const DAMAGE_EN: Record<DamageKind, string> = {
  okno: 'Broken window',
  drzwi: 'Kicked-in door',
  rura: 'Leaking pipe',
  podloga: 'Ruined floor',
  piec: 'Broken cooker',
};

export const WHY_SHORT_EN: Record<AptWhy, string> = {
  wyjazd: 'moved away',
  wymarcie: 'residents died',
  splądrowanie: 'looted',
  zalanie: 'flooded',
  pozar: 'burnt out',
};

export const WHY_TEXT_EN: Record<AptWhy, (year: number) => string> = {
  wyjazd: (y) => `The residents moved away in ${y}. The furniture stayed.`,
  wymarcie: (y) => `The residents died in ${y}. Their furniture and belongings are still here, and it smells musty.`,
  splądrowanie: (y) => `Looted in ${y}: furniture knocked over, rubbish everywhere, the door kicked in.`,
  zalanie: (y) => `Flooded in ${y}: a wet floor, ruined furniture, a leaking pipe.`,
  pozar: (y) => `Burnt out in ${y}: soot, a broken window, some of the furniture gone up in smoke.`,
};
