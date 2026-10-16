/* Paleta grafiki zapasowej (około 40 kolorów). Po kotwicy stylu z PixelLab zastąpi ją
   assets/palette.json. Kolory jako liczby 0xRRGGBB, do ImageData pakowane przez rgba(). */

export const C = {
  // trawa jesienią
  grass0: 0x4c6631,
  grass1: 0x58733a,
  grass2: 0x648043,
  grass3: 0x728c4c,
  park0: 0x4a6b33,
  park1: 0x557a3b,
  wood0: 0x3a5229,
  wood1: 0x465f31,
  leaf0: 0xa8682b,
  leaf1: 0xc28f3c,
  leaf2: 0x7f4527,
  // asfalt
  asph0: 0x313336,
  asph1: 0x3b3d40,
  asph2: 0x46484a,
  gutter: 0x2a2b2d,
  // płyty chodnikowe
  slab0: 0x9e9b91,
  slab1: 0x949187,
  slab2: 0xaaa79c,
  seam: 0x7c796f,
  curb: 0xc2bfb5,
  // ziemia, piasek, woda
  dirt0: 0x765e42,
  dirt1: 0x86694b,
  dirt2: 0x654f37,
  sand0: 0xc9b27c,
  sand1: 0xb9a06a,
  water0: 0x2f5670,
  water1: 0x3a6782,
  water2: 0x4f7f9b,
  foam: 0x9fc0cf,
  turf0: 0x3c7444,
  turf1: 0x437e4b,
  line: 0xe3e0d6,
  soil0: 0x5a412d,
  soil1: 0x684c35,
  crop: 0x67853a,
  // dachy
  tar0: 0x57534f,
  tar1: 0x4e4a47,
  tar2: 0x625e59,
  parapet: 0xa7a299,
  parapetDark: 0x77736b,
  gravel0: 0x9a968d,
  gravel1: 0x8b877f,
  tile0: 0x98472f,
  tile1: 0x833c29,
  tile2: 0xab573d,
  metal0: 0x767c81,
  metal1: 0x666c71,
  metal2: 0x868c91,
  // ściany
  wallGrey: 0xb7b2a6,
  wallGreyDark: 0x9a958a,
  plinth: 0x6f6b64,
  window: 0x26323d,
  windowHi: 0x3d5262,
  windowLit: 0xf0c66a,
  balcony: 0xcac6bc,
  rail: 0x5d5a55,
  door: 0x3a2e27,
  canopy: 0xd3cfc6,
  shopGlass: 0x4c6476,
  brick0: 0x8e4b36,
  brick1: 0x7d412f,
  // drzewa
  canopy0: 0x2b4827,
  canopy1: 0x375c30,
  canopy2: 0x4a7339,
  canopyHi: 0x6b9448,
  autumn0: 0x7f5222,
  autumn1: 0xa8732c,
  autumn2: 0xc8973b,
  pine0: 0x1f3a2a,
  pine1: 0x2a4d34,
  pine2: 0x37613f,
  trunk: 0x463324,
  // cień i noc
  shadow: 0x101622,
} as const;

/** pastele po termomodernizacji i szara płyta */
export const WALLS = [0xb7b2a6, 0xb7b2a6, 0xe0d29a, 0xe3b79a, 0xa7cbb4, 0xa6bfd4, 0xc5b3d1, 0xd9cfc0] as const;
/** tynki domów */
export const HOUSE_WALLS = [0xe8e2d4, 0xdcd2bd, 0xe6d6a8, 0xc9bfae, 0xe3cfc0, 0xd7d9cf] as const;

/** kolor 0xRRGGBB → uint32 dla ImageData (little-endian: ABGR) */
export const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** przyciemnienie (f < 1) albo rozjaśnienie (f > 1) koloru 0xRRGGBB */
export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((c & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

/** mieszanie dwóch kolorów 0xRRGGBB */
export function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
