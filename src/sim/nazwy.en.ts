/* Angielskie nazwy rzeczy, pomieszczeń, budowli, materiałów i napraw do rysowania: menu pod prawym przyciskiem
   (commandsAt) i opisy prac na karcie osoby (jobText) w src/sim/orders.ts. Polskie tablice w bierniku (FURNITURE_ACC
   w sim.ts, THING_ACC, ROOM_ACC i BUILD_ACC w orders.ts, MAT_ACC i REPAIR w mieszkania.ts) zostają bez zmian, bo
   pilnują ich testy i boty; tu są ich angielskie odpowiedniki po tych samych kluczach. Same rzeczowniki, bez
   przedimka: zdania dokładają „the”. Słowa ze słowniczka docs/SLOWNICZEK-EN.md. */

import type { DamageKind } from '../world/apts.ts';
import type { BuildKind, Mat } from './budowle.ts';
import type { RoomKind } from './house.ts';

/** meble do spalenia, jak FURNITURE_ACC i BURNABLE w sim.ts */
export const FURNITURE_EN: Readonly<Record<string, string>> = {
  krzeslo: 'chair',
  stol: 'table',
  lozko: 'bed',
  wersalka: 'sofa bed',
  mebloscianka: 'wall unit',
};

/** rzeczy do rozebrania, jak THING_ACC w orders.ts */
export const THING_EN: Readonly<Record<string, string>> = {
  ...FURNITURE_EN,
  kuchenka: 'cooker',
  lodowka: 'fridge',
  wanna: 'bath',
  umywalka: 'washbasin',
  koza: 'stove',
  smieci: 'rubbish',
  gruz: 'rubble',
};

/** pomieszczenia, jak ROOM_ACC w orders.ts */
export const ROOM_EN: Readonly<Record<RoomKind, string>> = {
  klatka: 'stairwell',
  przedpokoj: 'hallway',
  pokoj: 'room',
  kuchnia: 'kitchen',
  lazienka: 'bathroom',
  sala: 'hall',
  hala: 'shed',
  zaplecze: 'back room',
};

/** budowle w opisach prac, jak BUILD_ACC w orders.ts */
export const BUILD_EN: Readonly<Record<BuildKind, string>> = {
  warsztat: 'workshop',
  kuchnia_spoleczna: 'community kitchen',
  magazyn: 'storeroom',
  lozka_pietrowe: 'bunk beds',
  ogrodek: 'vegetable patch',
  zasieki: 'barricade',
  pracownia: 'research room',
  koza_beczka: 'barrel stove',
  kociol: 'boiler',
  pieczarkarnia: 'mushroom farm',
  szklarnia: 'greenhouse',
  barykada: 'wreck wall',
  wieza: 'tower',
};

/** materiały, jak MAT_ACC w mieszkania.ts */
export const MAT_EN: Readonly<Record<Mat, string>> = {
  drewno: 'wood',
  deski: 'planks',
  zlom: 'scrap',
  czesci: 'parts',
  jedzenie: 'food',
  leki: 'meds',
};

/** uszkodzenia do naprawy, jak REPAIR[…].acc w mieszkania.ts; piec to okopcona kuchenka */
export const REPAIR_EN: Readonly<Record<DamageKind, string>> = {
  okno: 'window',
  drzwi: 'door',
  rura: 'pipe',
  podloga: 'floor',
  piec: 'cooker',
};
