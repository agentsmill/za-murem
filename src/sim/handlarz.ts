/* Handlarz pod bramą (docs/superpowers/specs/2026-10-18-handlarz-design.md): terminy wizyt, towar, wymiana i napisy.
   Czyste dane i funkcje dla symulacji, menu i rysowania. Handlarz chodzi tylko w grze z opcją SimOpts.obcy, więc
   losowanie ze st.rng (termin, oferty, wygląd) nie rusza gier i botów bez niej. Złom jest walutą, bo po wrakach
   i rozbiórce jest go za dużo, a deski i jedzenie są wąskim gardłem. Napisy w obu językach: do menu i opisów idzie
   na razie polski, tłumaczenie podłączy warstwa języka. */

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
}

/** czeka pod bramą 3 godziny gry, ale nie dłużej niż do 18:00; wymiana to 5 minut targowania się */
export const WAIT_TICKS = 3 * TICKS_PER_HOUR;
export const LEAVE_HOUR = 18;
export const HAGGLE_TICKS = TICKS_PER_HOUR / 12;
/** każdą ofertę przyjmie najwyżej tyle razy */
export const OFFER_TIMES = 2;
/** życie handlarza (cios przy napaści go nie zabija) */
export const TRADER_HP = 80;
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
const AMOUNT_EN: Record<Mat, string> = {
  drewno: 'firewood',
  deski: 'boards',
  zlom: 'scrap',
  czesci: 'parts',
  jedzenie: 'food',
  leki: 'medicine',
};
const amountEn = (m: Partial<Record<Mat, number>>): string =>
  (Object.entries(m) as [Mat, number][]).map(([k, n]) => `${n} ${AMOUNT_EN[k]}`).join(' and ');

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
    en: `short of ${amountEn(m)}`,
  }),
  napasc: { pl: 'Napaść na handlarza', en: 'Rob the trader' },
  /** pod: miejsce ze słownika miejsca („pod bramą”, w domu „pod furtką”) */
  przyszedl: (pod: string): Napis => ({
    pl: `${pod[0].toUpperCase()}${pod.slice(1)} stoi handlarz z wózkiem.`,
    en: 'A trader with a cart is waiting at the gate.',
  }),
  idzieHandlowac: { pl: 'Idzie do handlarza.', en: 'Going to the trader.' },
  handluje: { pl: 'Targuje się z handlarzem.', en: 'Haggling with the trader.' },
  idzieNapasc: { pl: 'Idzie napaść na handlarza.', en: 'Going to rob the trader.' },
  nastroj: { pl: 'Napadliśmy na handlarza', en: 'We robbed the trader' },
  poHandel: { pl: 'Pójdzie do handlarza.', en: 'Will go to the trader.' },
  poHandelWielu: { pl: 'Jedna osoba pójdzie do handlarza.', en: 'One person will go to the trader.' },
  poNapasc: { pl: 'Napadnie na handlarza.', en: 'Will rob the trader.' },
  poNapascWielu: { pl: 'Jedna osoba napadnie na handlarza.', en: 'One person will rob the trader.' },
  // opisy pracy handlarza
  przychodzi: { pl: 'Pcha wózek pod bramę.', en: 'Pushing a cart to the gate.' },
  czeka: { pl: 'Czeka z towarem pod bramą.', en: 'Waiting at the gate with goods.' },
  odchodzi: { pl: 'Odchodzi z wózkiem.', en: 'Leaving with the cart.' },
  ucieka: { pl: 'Ucieka.', en: 'Running away.' },
} as const;
