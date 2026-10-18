/* Materiały i naprawy po angielsku do napisów (src/sim/mieszkania.ts zostaje po polsku): nazwy materiałów, po
   angielsku jedna forma do kosztów i opisów prac („planks 4”, „Fetching planks”), i to, co się naprawia, z rodzajnikiem
   („Repair the window”), po tych samych kluczach co MAT_ACC i REPAIR. */

import type { DamageKind } from '../world/apts.ts';
import type { Mat } from './budowle.ts';

export const MAT_EN: Record<Mat, string> = {
  drewno: 'wood',
  deski: 'planks',
  zlom: 'scrap',
  czesci: 'parts',
  jedzenie: 'food',
  leki: 'meds',
};

/** jak REPAIR[kind].acc: piec to kuchenka w kuchni mieszkania (koza to „the stove”) */
export const REPAIR_EN: Record<DamageKind, string> = {
  okno: 'the window',
  drzwi: 'the door',
  rura: 'the pipe',
  podloga: 'the floor',
  piec: 'the cooker',
};
