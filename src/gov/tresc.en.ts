/* Angielska treść zarządu do tablic z tresc.ts (polskie zostają tam bez zmian): uchwały M1 z wariantem dla domu,
   cele wypraw, nazwy dziur w siatce, zakończenia przy domu jednorodzinnym i nazwy zapasów. Klucze i kolejność jak
   w polskich tablicach. Słowa: docs/SLOWNICZEK-EN.md. */

import type { LootKey } from './typy.ts';

export interface M1LawEn {
  name: string;
  desc: string;
  dom?: { name?: string; desc?: string };
}

export const M1_LAWS_EN: Record<string, M1LawEn> = {
  u_warty: {
    name: 'Stairwell watches',
    desc: 'Every night one of the residents stands at the gate, and the board’s watch does a better job. Defence at the gate +1.5, watch a quarter stronger, raid chance −5 points.',
    dom: {
      name: 'Garden gate watches',
      desc: 'Every night someone from the household stands at the garden gate, and the committee’s watch does a better job. Defence at the garden gate +1.5, watch a quarter stronger, raid chance −5 points.',
    },
  },
  u_brama: {
    name: 'Gate padlocked from 20:00',
    desc: 'After dark nobody gets in or out, and only the board has the key. Raid chance −8 points, and nobody lets drifters in at the gate. Anger +0.2 a day.',
    dom: {
      name: 'Garden gate padlocked from 20:00',
      desc: 'After dark nobody gets in or out, and only the committee has the key. Raid chance −8 points, and nobody lets drifters in at the garden gate. Anger +0.2 a day.',
    },
  },
  u_zebrania: {
    name: 'Stairwell meetings',
    desc: 'Trust +0.4 a day. Work starts at 9:00.',
    dom: { name: 'Meetings by the stove' },
  },
  u_kociol: {
    name: 'The common pot',
    desc: 'All the food goes into one pot by the stove. Everyone eats the same, including those who don’t work. Trust +2 at once and +0.3 a day, food runs down 10% faster.',
  },
  u_racje: {
    name: 'Starvation rations',
    desc: 'Portions are 25% smaller, so the food lasts a little longer. People eat only when they are really hungry and at most twice a day, so they go to bed hungry. Anger +0.4 a day.',
  },
  u_meble: {
    name: 'Furniture for fuel',
    desc: 'Furniture from empty flats goes into the stove without asking anyone. Burning other people’s furniture hurts half as much, but anger +2 at once and +0.1 a day.',
    dom: {
      desc: 'Furniture goes into the stove without asking the household. Burning furniture hurts half as much, but anger +2 at once and +0.1 a day.',
    },
  },
};

/** cele wypraw po id z TARGETS */
export const TARGETS_EN: Record<string, string> = {
  mieszkania: 'the abandoned flats in the block next door',
  garaze: 'the garages behind the carpet rack',
  pawilon: 'the shopping pavilion',
  stacja: 'the petrol station by the ring road',
  apteka: 'the pharmacy by the bus stop',
};

/** warianty nazw celów według miejsca, jak w targetName (tresc.ts) */
export const TARGET_VARIANTS_EN = {
  opuszczonyDom: 'the abandoned house next door',
  szopy: 'the sheds in the gardens next door',
  garazeObok: 'the garages next door',
  sklep: 'the shop on the main road',
} as const;

/** jak HOLE_NAMES i HOLE_NAMES_DOM (te same indeksy) */
export const HOLE_NAMES_EN = [
  'by the garages',
  'behind the carpet rack',
  'on the street side',
  'by the bins',
  'facing the block next door',
];
export const HOLE_NAMES_DOM_EN = [
  'by the garage',
  'behind the shed',
  'on the street side',
  'by the compost heap',
  'facing the house next door',
];

/** jak KONIEC_DOM */
export const KONIEC_DOM_EN: Record<'odwolanie' | 'exodus' | 'pustka', { title: string; text: string }> = {
  odwolanie: {
    title: 'The street meeting recalled the committee',
    text: 'The anger spilled over the fences. The neighbours gathered at the garden gate and voted you out by acclamation. The new committee started by changing the padlock.',
  },
  exodus: {
    title: 'The street emptied out',
    text: 'People stopped believing you would get them through. House by house, they left for other streets. All that’s left is empty gardens and a letter from the bank about a mortgage instalment from 2047.',
  },
  pustka: {
    title: 'Nobody survived',
    text: 'The last of the household let the stove go out. The street stands empty, and the delivery drone is still circling over the roof.',
  },
};

export const LOOT_LABEL_EN: Record<LootKey, string> = {
  wood: 'Wood',
  supplies: 'Food',
  scrap: 'Scrap',
  parts: 'Parts',
  meds: 'Meds',
};
