/* Handlarz pod bramą (docs/superpowers/specs/2026-10-18-handlarz-design.md): terminy wizyt, towar, wymiana i napisy.
   Czyste dane i funkcje dla symulacji, menu i rysowania. Handlarz chodzi tylko w grze z opcją SimOpts.obcy, więc
   losowanie ze st.rng (termin, oferty, wygląd) nie rusza gier i botów bez niej. Złom jest walutą, bo po wrakach
   i rozbiórce jest go za dużo, a deski i jedzenie są wąskim gardłem. Napisy w obu językach: menu, opisy prac
   i podpowiedzi biorą je przez tr() w bieżącym języku (deski to „planks”, bo „board” to zarząd). */

import { nextRandom, type RngState } from '../core/rng.ts';
import type { Mat } from './budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from './clock.ts';

/** oferta: co handlarz daje (give), co bierze od nas (take) i ile razy jeszcze ją przyjmie */
export interface Offer {
  give: Partial<Record<Mat, number>>;
  take: Partial<Record<Mat, number>>;
  left: number;
}

/** handlarz w stanie gry (SimState.obcy, tylko z opcją obcy) */
export interface Obcy {
  /** tick następnej wizyty; −1: już nie przyjdzie (napadnięty) */
  next: number;
  /** towar bieżącej wizyty (pusty między wizytami) */
  offers: Offer[];
  /** id pionka handlarza na mapie albo −1 */
  trader: number;
  /** tick napaści albo −1 */
  napad: number;
  /** ile było wizyt (licząc tę, która trwa) */
  wizyty: number;
  /** tick następnego wędrowca i następnej obcej ekipy (docs/superpowers/specs/2026-10-18-wedrowcy-design.md);
      stary zapis z samym handlarzem dostaje je w konstruktorze Sim bez losowania */
  wnext?: number;
  enext?: number;
  /** napaści zarządu po kolei (zarząd liczy z nich cenę w zaufaniu); brak: żadnej */
  napady?: { kto: 'handlarz' | 'wedrowiec'; tick: number }[];
  /** ostatnia wieść do pokazania na dole ekranu (rozmowa z wędrowcem, ekipa przeszukała wrak) */
  wiesc?: { tick: number; text: string };
  /** zła sława u handlarzy po napaści, którą handlarz przeżył: poziom i tick, kiedy spadnie o jeden */
  slawa?: { lvl: number; until: number };
  /** posiłki handlarza zaplanowane na tick at, n ludzi */
  zemsta?: { at: number; n: number };
}

/** czeka pod bramą 3 godziny gry, ale nie dłużej niż do 18:00; wymiana to 5 minut targowania się */
export const WAIT_TICKS = 3 * TICKS_PER_HOUR;
export const LEAVE_HOUR = 18;
export const HAGGLE_TICKS = TICKS_PER_HOUR / 12;
/** każdą ofertę przyjmie najwyżej tyle razy */
export const OFFER_TIMES = 2;
/** Napadnięty handlarz walczy (zmiana Mateusza z 18.10.2026 wieczorem): 140 życia, siekiera, ucieka poniżej 50,
    a gdy przez godzinę gry nie ma kogo bić, odchodzi. Wrogowie bijący zarząd (handlarz i jego ludzie) trafiają
    z 90% celności broni i zadają 60% jej obrażeń, biją najbliższego z zarządu do 10 m. */
export const TRADER_HP = 140;
export const TRADER_FLEE = 50;
export const TRADER_WEAPON = 'siekiera' as const;
export const HOSTILE_HIT = 0.9;
export const HOSTILE_DMG = 0.6;
export const AGGRO = 10;
export const CALM_TICKS = TICKS_PER_HOUR;
/** posiłki po ucieczce: z szansą 60% najbliższej nocy 22:00–1:00 przychodzi 3–4 ludzi handlarza (90 życia, uciekają
    poniżej 35), stoją pod siatką do 4:00, najwyżej dwie godziny */
export const REVENGE_CHANCE = 0.6;
export const ZBIR_HP = 90;
export const ZBIR_FLEE = 35;
export const ZBIR_WEAPONS = ['kij', 'lom', 'noz'] as const;
export const ZBIR_STAY = 2 * TICKS_PER_HOUR;
export const ZBIR_LEAVE_HOUR = 4;
/** wieść u handlarzy: poziom 1–3, ceny razy 1 + 0,5 × poziom, wizyty o 2 × poziom dni rzadziej, poziom spada po 15
    dniach; po zabitym handlarzu nowy przejmuje trasę 3 dni później */
export const SLAWA_MAX = 3;
export const SLAWA_DAYS = 15;
export const SLAWA_EXTRA_DAYS = 2;
export const KILL_DELAY_DAYS = 3;

/** cena przy złej sławie: to, co handlarz bierze, razy 1 + 0,5 × poziom, w górę */
export function priced(o: Offer, lvl: number): Offer {
  if (lvl <= 0) return o;
  const take: Partial<Record<Mat, number>> = {};
  for (const [m, n] of Object.entries(o.take) as [Mat, number][]) take[m] = Math.ceil(n * (1 + 0.5 * lvl));
  return { ...o, take };
}
/** nastrój po napaści: napastnik i reszta zarządu, na dobę */
export const ROB_MOOD = -6;
export const ROB_MOOD_OTHERS = -3;

type Deal = [Partial<Record<Mat, number>>, Partial<Record<Mat, number>>];
/** oferty kupujące złom (pierwsza oferta każdej wizyty jest stąd): [bierze, daje] */
const BUYS_SCRAP: Deal[] = [
  [{ zlom: 6 }, { deski: 3 }],
  [{ zlom: 4 }, { jedzenie: 3 }],
  [{ zlom: 8 }, { czesci: 3 }],
];
/** reszta tabeli */
const OTHER: Deal[] = [
  [{ czesci: 3 }, { leki: 2 }],
  [{ leki: 2 }, { jedzenie: 5 }],
  [{ drewno: 8 }, { jedzenie: 4 }],
  [{ jedzenie: 4 }, { deski: 3 }],
];

/** tasowanie Fishera-Yatesa ze stanu losowania (nie sort z losowym porównaniem: kolejność zależy od silnika JS) */
function shuffle<T>(a: T[], rng: RngState): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** towar na wizytę: jedna oferta kupująca złom i dwie z reszty tabeli (razem z pozostałymi złomowymi) */
export function rollOffers(rng: RngState): Offer[] {
  const scrap = shuffle([...BUYS_SCRAP], rng);
  const rest = shuffle([...scrap.slice(1), ...OTHER], rng);
  return [scrap[0], rest[0], rest[1]].map(([take, give]) => ({
    give: { ...give },
    take: { ...take },
    left: OFFER_TIMES,
  }));
}

/** tick dla dnia (od 1) i godziny (z ułamkiem) */
export const tickAt = (day: number, hour: number): number =>
  Math.round((((day - 1) * 1440 + hour * 60 - START_MINUTES) * TICKS_PER_HOUR) / 60);

/** pierwsza wizyta: dzień 2, przyjście między 10:00 a 12:00 */
export const firstVisit = (rng: RngState): number => tickAt(2, 10 + 2 * nextRandom(rng));

/** Tryb zombie (Mateusz 18.10.2026: „handlarz przychodzi rzadziej, a więcej trzeba postawić na produkcję i szaber
    graczy”): pierwsza wizyta czwartego dnia, potem co 5–7 dni. Handlarz jest ostrożny: gdy w chwili przyjścia
    szwendacz jest do ZOMBIE_SCARE_ARRIVE m od bramy, przychodzi dwie godziny później; gdy w czasie czekania szwendacz
    podejdzie do ZOMBIE_SCARE_WAIT m, odchodzi od razu. Wędrowców i obcych ekip w trybie zombie nie ma. */
export const firstVisitZombie = (rng: RngState): number => tickAt(4, 10 + 2 * nextRandom(rng));
export const nextVisitZombie = (day: number, rng: RngState): number =>
  tickAt(day + 5 + Math.floor(nextRandom(rng) * 3), 9 + 4 * nextRandom(rng));
export const ZOMBIE_SCARE_ARRIVE = 15;
/** w trybie zombie handlarz zostaje tylko chwilę (45 minut gry), a co druga albo trzecia wizyta w ogóle nie dochodzi
    do skutku (nie przeżył drogi albo zawrócił): szansa 40% */
export const WAIT_ZOMBIE = (3 * TICKS_PER_HOUR) / 4;
export const TRADER_NOSHOW = 0.4;
export const ZOMBIE_SCARE_WAIT = 8;
export const ZOMBIE_DELAY = 2 * TICKS_PER_HOUR;

/** następna wizyta po wizycie z dnia day: za dwa albo trzy dni, przyjście między 9:00 a 13:00 */
export const nextVisit = (day: number, rng: RngState): number =>
  tickAt(day + 2 + Math.floor(nextRandom(rng) * 2), 9 + 4 * nextRandom(rng));

/** formy po liczebniku: jedna sztuka, 2–4 (bez 12–14), reszta */
const form = (n: number, [one, few, many]: readonly [string, string, string]): string =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
/** biernik po liczebniku: „dać 6 złomu za 3 deski” */
const ACC: Record<Mat, readonly [string, string, string]> = {
  drewno: ['drewno', 'drewna', 'drewna'],
  deski: ['deskę', 'deski', 'desek'],
  zlom: ['złom', 'złomu', 'złomu'],
  czesci: ['część', 'części', 'części'],
  jedzenie: ['porcję jedzenia', 'porcje jedzenia', 'porcji jedzenia'],
  leki: ['lek', 'leki', 'leków'],
};
/** dopełniacz po „brakuje”: „brakuje 2 desek” */
const GEN: Record<Mat, readonly [string, string, string]> = {
  drewno: ['drewna', 'drewna', 'drewna'],
  deski: ['deski', 'desek', 'desek'],
  zlom: ['złomu', 'złomu', 'złomu'],
  czesci: ['części', 'części', 'części'],
  jedzenie: ['porcji jedzenia', 'porcji jedzenia', 'porcji jedzenia'],
  leki: ['leku', 'leków', 'leków'],
};
const amount = (m: Partial<Record<Mat, number>>, forms = ACC): string =>
  (Object.entries(m) as [Mat, number][]).map(([k, n]) => `${n} ${form(n, forms[k])}`).join(' i ');
/** po angielsku jak w słowniczku i na pasku (deski „planks”, leki „meds”): jedna sztuka, reszta */
const AMOUNT_EN: Record<Mat, readonly [string, string]> = {
  drewno: ['wood', 'wood'],
  deski: ['plank', 'planks'],
  zlom: ['scrap', 'scrap'],
  czesci: ['part', 'parts'],
  jedzenie: ['food', 'food'],
  leki: ['pack of meds', 'packs of meds'],
};
const amountEn = (m: Partial<Record<Mat, number>>): string =>
  (Object.entries(m) as [Mat, number][]).map(([k, n]) => `${n} ${AMOUNT_EN[k][n === 1 ? 0 : 1]}`).join(' and ');

/** napis w obu językach */
export interface Napis {
  pl: string;
  en: string;
}

export const NAPISY = {
  oferta: (o: Offer): Napis => ({
    pl: `Dać ${amount(o.take)} za ${amount(o.give)}`,
    en: `Give ${amountEn(o.take)} for ${amountEn(o.give)}`,
  }),
  brakuje: (m: Partial<Record<Mat, number>>): Napis => ({
    pl: `brakuje ${amount(m, GEN)}`,
    en: `${amountEn(m)} short`,
  }),
  napasc: { pl: 'Napaść na handlarza', en: 'Rob the trader' },
  /** pod: miejsce ze słownika miejsca („pod bramą”, w domu „pod furtką”), gate: to samo po angielsku („the gate”,
      „the garden gate”) */
  przyszedl: (pod: string, gate = 'the gate'): Napis => ({
    pl: `${pod[0].toUpperCase()}${pod.slice(1)} stoi handlarz z wózkiem.`,
    en: `A trader with a cart is waiting at ${gate}.`,
  }),
  idzieHandlowac: { pl: 'Idzie do handlarza.', en: 'Going to the trader.' },
  handluje: { pl: 'Targuje się z handlarzem.', en: 'Haggling with the trader.' },
  idzieNapasc: { pl: 'Idzie napaść na handlarza.', en: 'Going to rob the trader.' },
  nastroj: { pl: 'Napadliśmy na handlarza', en: 'We robbed the trader' },
  poHandel: { pl: 'Pójdzie do handlarza.', en: 'Off to the trader.' },
  poHandelWielu: { pl: 'Jedna osoba pójdzie do handlarza.', en: 'One person goes to the trader.' },
  poNapasc: { pl: 'Napadnie na handlarza.', en: 'Off to rob the trader.' },
  poNapascWielu: { pl: 'Jedna osoba napadnie na handlarza.', en: 'One person goes to rob the trader.' },
  atakuj: { pl: 'Atakuj handlarza', en: 'Attack the trader' },
  atakujZbira: { pl: 'Atakuj człowieka handlarza', en: "Attack the trader's man" },
  walczy: { pl: 'Walczy z siekierą.', en: 'Fighting with an axe.' },
  uciekl: {
    pl: 'Handlarz uciekł. Wieść pójdzie do innych handlarzy, a on sam może wrócić z ludźmi.',
    en: 'The trader got away. Other traders will hear of it, and he may come back with men.',
  },
  odszedlZly: {
    pl: 'Handlarz odszedł po walce. Wieść pójdzie do innych handlarzy, a on sam może wrócić z ludźmi.',
    en: 'The trader left after the fight. Other traders will hear of it, and he may come back with men.',
  },
  zabity: { pl: 'Handlarz nie żyje. Jego towar jest wasz.', en: 'The trader is dead. His goods are yours.' },
  zagryziony: {
    pl: 'Szwendacze dopadły handlarza pod bramą. Jego wózek został.',
    en: 'Shamblers caught the trader at the gate. His cart is still there.',
  },
  szwendacze: {
    pl: 'Handlarz odszedł, bo pod bramę podeszły szwendacze.',
    en: 'The trader left because shamblers came up to the gate.',
  },
  zemsta: (n: number): Napis => ({
    pl: `Wracają ludzie handlarza: ${n} ${n >= 2 && n <= 4 ? 'osoby' : 'osób'} z pałkami pod siatką.`,
    en: `The trader's men are back: ${n} of them with clubs at the fence.`,
  }),
  zemstaPraca: [
    { pl: 'Idzie pod siatkę z pałką.', en: 'Walking to the fence with a club.' },
    { pl: 'Szuka zemsty pod siatką.', en: 'Looking for revenge at the fence.' },
    { pl: 'Odchodzi.', en: 'Leaving.' },
    { pl: 'Ucieka.', en: 'Running away.' },
  ],
  // opisy pracy handlarza
  przychodzi: { pl: 'Pcha wózek pod bramę.', en: 'Pushing a cart to the gate.' },
  czeka: { pl: 'Czeka z towarem pod bramą.', en: 'Waiting at the gate with goods.' },
  odchodzi: { pl: 'Odchodzi z wózkiem.', en: 'Leaving with the cart.' },
  ucieka: { pl: 'Ucieka.', en: 'Running away.' },
} as const;
