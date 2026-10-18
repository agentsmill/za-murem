/* Broń w obu trybach (docs/superpowers/specs/2026-10-17-tryb-zombie-design.md): zasięg w metrach, obrażenia,
   kroki między ciosami (20 na sekundę przy 1×), hałas w metrach, celność, amunicja i to, czy broń sięga przez
   siatkę. Każdy z zarządu ma jedną broń albo gołe ręce, zapasowa broń i amunicja leżą w magazynie (st.store).
   Czyste dane i formuły bez stanu. Polskie nazwy zostają w WEAPONS, angielskie do rysowania są obok (WEAPONS_EN,
   AMMO_EN). */

import type { GameMode } from './tryb.ts';

export type WeaponId = 'piesci' | 'noz' | 'siekiera' | 'lom' | 'kij' | 'dzida' | 'kusza' | 'rewolwer' | 'strzelba';
export type AmmoKey = 'naboje' | 'loftki' | 'belty';

export interface Weapon {
  id: WeaponId;
  /** nazwa w mianowniku i bierniku („Weź łom”, „Zrobić dzidę”) */
  name: string;
  acc: string;
  /** zasięg ciosu albo strzału w metrach */
  reach: number;
  dmg: number;
  /** kroki symulacji między ciosami */
  cd: number;
  /** promień hałasu w metrach: tyle słychać cios albo strzał (szwendacze idą na hałas) */
  noise: number;
  /** szansa trafienia bez umiejętności */
  hit: number;
  ammo: AmmoKey | null;
  /** sięga przez siatkę (dzida, broń palna, kusza) */
  fence: boolean;
}

const W = (
  id: WeaponId,
  name: string,
  acc: string,
  reach: number,
  dmg: number,
  cd: number,
  noise: number,
  hit: number,
  ammo: AmmoKey | null,
  fence: boolean,
): Weapon => ({ id, name, acc, reach, dmg, cd, noise, hit, ammo, fence });

export const WEAPONS: Record<WeaponId, Weapon> = {
  piesci: W('piesci', 'gołe ręce', 'gołe ręce', 1.3, 6, 24, 0, 0.6, null, false),
  noz: W('noz', 'nóż', 'nóż', 1.3, 34, 18, 0, 0.75, null, false),
  siekiera: W('siekiera', 'siekiera', 'siekierę', 1.5, 50, 30, 4, 0.7, null, false),
  lom: W('lom', 'łom', 'łom', 1.5, 42, 26, 5, 0.75, null, false),
  kij: W('kij', 'kij z gwoździami', 'kij z gwoździami', 1.6, 38, 22, 5, 0.75, null, false),
  dzida: W('dzida', 'dzida', 'dzidę', 2.6, 36, 24, 1, 0.7, null, true),
  kusza: W('kusza', 'kusza', 'kuszę', 12, 70, 70, 2, 0.75, 'belty', true),
  rewolwer: W('rewolwer', 'rewolwer', 'rewolwer', 14, 75, 20, 40, 0.65, 'naboje', true),
  strzelba: W('strzelba', 'strzelba', 'strzelbę', 8, 100, 40, 50, 0.8, 'loftki', true),
};

/** amunicja w nazwach do tekstów */
export const AMMO_NAMES: Record<AmmoKey, string> = { naboje: 'naboje', loftki: 'loftki', belty: 'bełty' };

/** Nazwy broni po angielsku do rysowania (WEAPONS zostaje po polsku): name na karcie osoby („Weapon: crowbar”), the
    w zdaniach, jak acc po polsku („Takes the crowbar.”). */
export const WEAPONS_EN: Readonly<Record<WeaponId, { name: string; the: string }>> = {
  piesci: { name: 'bare hands', the: 'bare hands' },
  noz: { name: 'knife', the: 'the knife' },
  siekiera: { name: 'axe', the: 'the axe' },
  lom: { name: 'crowbar', the: 'the crowbar' },
  kij: { name: 'nail bat', the: 'the nail bat' },
  dzida: { name: 'spear', the: 'the spear' },
  kusza: { name: 'crossbow', the: 'the crossbow' },
  rewolwer: { name: 'revolver', the: 'the revolver' },
  strzelba: { name: 'shotgun', the: 'the shotgun' },
};

/** amunicja po angielsku: nazwa jak AMMO_NAMES i liczba pojedyncza i mnoga do „12 rounds” */
export const AMMO_EN: Readonly<Record<AmmoKey, { name: string; one: string; other: string }>> = {
  naboje: { name: 'rounds', one: 'round', other: 'rounds' },
  loftki: { name: 'buckshot', one: 'buckshot shell', other: 'buckshot shells' },
  belty: { name: 'bolts', one: 'bolt', other: 'bolts' },
};

/** broń z identyfikatora; bez broni gołe ręce */
export const weaponOf = (id?: WeaponId | null): Weapon => (id ? WEAPONS[id] : WEAPONS.piesci);

/** broń palna albo kusza */
export const isRanged = (w: Weapon): boolean => w.ammo !== null;

/** broń palna (rewolwer, strzelba): strzał słychać z daleka, kusza strzela cicho */
export const isFirearm = (w: Weapon): boolean => w.ammo === 'naboje' || w.ammo === 'loftki';

/** Szansa trafienia: celność broni, +0,05 za punkt umiejętności obrona, −0,15 przy siłach poniżej 20 i z kikutem;
    zawsze 0,05–0,95. */
export function hitChance(w: Weapon, obrona: number, rest: number, maimed: boolean): number {
  let h = w.hit + 0.05 * obrona;
  if (rest < 20) h -= 0.15;
  if (maimed) h -= 0.15;
  return Math.max(0.05, Math.min(0.95, h));
}

export const noAmmo = (): Record<AmmoKey, number> => ({ naboje: 0, loftki: 0, belty: 0 });

/** Broń na start: core to broń kolejnych osób z zarządu (null: gołe ręce), store to magazyn. */
export const START_KIT: Record<
  GameMode,
  { core: (WeaponId | null)[]; store: WeaponId[]; ammo: Record<AmmoKey, number> }
> = {
  zwykly: { core: ['siekiera'], store: ['noz', 'lom'], ammo: noAmmo() },
  zombie: {
    core: ['rewolwer', 'dzida', 'lom', 'noz'],
    store: ['dzida', 'kij'],
    ammo: { naboje: 12, loftki: 0, belty: 0 },
  },
};
