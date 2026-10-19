/* Budowle fali 1 M2 po angielsku do napisów (src/sim/budowle.ts zostaje po polsku, pilnują go testy): nazwa do menu,
   nazwa z rodzajnikiem do zdań („Build the workshop”, „Tear down the barricade”) i jedno zdanie działania, po tych
   samych kluczach co BUILDS. Słowa ze słowniczka docs/SLOWNICZEK-EN.md. */

import type { WordsEn } from '../gov/miejsce.ts';
import type { BuildKind } from './budowle.ts';

/** działanie zależne od miejsca bierze słowa ze słownika wspólnoty, jak BUILDS[…].effect (effectEnOf) */
export const BUILDS_EN: Record<BuildKind, { name: string; the: string; effect: string | ((w: WordsEn) => string) }> = {
  warsztat: {
    name: 'Workshop',
    the: 'the workshop',
    effect: 'Patches and repairs go faster, and tearing things down yields more.',
  },
  kuchnia_spoleczna: {
    name: 'Community kitchen',
    the: 'the community kitchen',
    effect: 'One pot for everyone, and less food per head.',
  },
  magazyn: {
    name: 'Storeroom',
    the: 'the storeroom',
    effect: 'Supplies in the storeroom are harder to steal in a raid.',
  },
  lozka_pietrowe: {
    name: 'Bunk beds',
    the: 'the bunk beds',
    effect: (w) => `Sleeps two, so there is room for more people ${w.mieszkamy}.`,
  },
  ogrodek: {
    name: 'Vegetable patch',
    the: 'the vegetable patch',
    effect: 'Grows food after a few days: more in summer, not much in autumn.',
  },
  zasieki: {
    name: 'Barricade',
    the: 'the barricade',
    effect: 'Stronger than the fence or a patch, and it closes a hole.',
  },
  pracownia: {
    name: 'Research room',
    the: 'the research room',
    effect: 'A desk with a lamp and a bookshelf: two people at a time research new technologies here.',
  },
  koza_beczka: {
    name: 'Barrel stove',
    the: 'the barrel stove',
    effect:
      'Heats a room and burns wood like the kitchen stove. The flue goes out through the window, so it stands near one.',
  },
  kociol: {
    name: 'Boiler',
    the: 'the boiler',
    effect: 'Heats all your flats at once, but burns a lot of wood.',
  },
  pieczarkarnia: {
    name: 'Mushroom farm',
    the: 'the mushroom farm',
    effect:
      'A smaller yield than a vegetable patch in spring and summer, but the same all year round, winter included.',
  },
  szklarnia: {
    name: 'Greenhouse',
    the: 'the greenhouse',
    effect: 'Like a vegetable patch, but in winter it yields as it does in autumn.',
  },
  barykada: {
    name: 'Wreck wall',
    the: 'the wreck wall',
    effect: 'Built from wrecks, sturdier than the barricade, and it closes a hole. Costs mostly scrap.',
  },
  wieza: {
    name: 'Tower',
    the: 'the tower',
    effect:
      'A “Watch on the tower” post on the Night orders: whoever stands there adds half their watch to the defence of every other post. You can have one.',
  },
};

/** zdanie o działaniu budowli po angielsku według miejsca, jak effectOf w budowle.ts */
export function effectEnOf(kind: BuildKind, w: WordsEn): string {
  const e = BUILDS_EN[kind].effect;
  return typeof e === 'string' ? e : e(w);
}
