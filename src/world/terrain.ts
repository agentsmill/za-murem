/* Kody terenu na siatce świata. Osobny moduł, żeby wnętrza budynków mogły czytać teren
   bez importowania świata w kółko; world.ts eksportuje je dalej. */

export const T = {
  GRASS: 0,
  PARK: 1,
  WOOD: 2,
  ROAD: 3,
  SIDEWALK: 4,
  PATH: 5,
  PARKING: 6,
  WATER: 7,
  PLAY: 8,
  PITCH: 9,
  ALLOT: 10,
  BUILDING: 11,
} as const;
export type TerrainCode = (typeof T)[keyof typeof T];
