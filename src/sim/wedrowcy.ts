/* Wędrowcy i obce ekipy za dnia (docs/superpowers/specs/2026-10-18-wedrowcy-design.md): terminy, czasy, worek
   wędrowca, wieści z rozmowy i napisy. Czyste dane i funkcje dla symulacji i menu. Chodzą tylko w grze z opcją
   SimOpts.obcy (jak handlarz), więc losowanie ze st.rng nie rusza gier i botów bez niej. Napisy w obu językach:
   menu i opisy prac biorą je przez tr() w bieżącym języku, a wieść zostaje w stanie po polsku (st.obcy.wiesc,
   jak inne napisy symulacji) i po angielsku pokazuje ją wiescEn, ze słownika wszystkich wariantów. */

import { ADS_EN } from '../content/data.en.ts';
import { ADS } from '../content/data.ts';
import { nextRandom, type RngState } from '../core/rng.ts';
import type { Mat } from './budowle.ts';
import { dayOf, hourOf, TICKS_PER_HOUR } from './clock.ts';
import { tickAt } from './handlarz.ts';
import { WRECK_SEARCH_TICKS } from './surowce.ts';

/** wędrowiec przystaje przy siatce 20–40 minut gry, po rozmowie jeszcze 10 */
export const PAUSE_MIN = TICKS_PER_HOUR / 3;
export const PAUSE_MAX = (2 * TICKS_PER_HOUR) / 3;
export const TALK_EXTRA = TICKS_PER_HOUR / 6;
/** rozmowa przez siatkę trwa 5 minut */
export const TALK_TICKS = TICKS_PER_HOUR / 12;
/** wędrowiec z plecakiem chodzi wolniej od zarządu, uciekający szybciej */
export const WANDER_SPEED = 0.8;
export const FLEE_SPEED = 1.3;
export const WANDERER_HP = 60;
/** ekipa przeszukuje wrak ostrożnie: dwa razy dłużej niż zarząd */
export const CREW_SEARCH_TICKS = 2 * WRECK_SEARCH_TICKS;
/** przegonić: wystarczy podejść na tyle metrów */
export const SHOO_REACH = 3;
/** pościg przy napaści i przeganianiu: najwyżej tyle, potem zarząd odpuszcza */
export const CHASE_TICKS = TICKS_PER_HOUR / 2;
/** nastroje: rozmowa (na 6 godzin), napaść na wędrowca (na dobę, napastnik i reszta) */
export const TALK_MOOD = 3;
export const TALK_MOOD_TICKS = 6 * TICKS_PER_HOUR;
export const MUG_MOOD = -4;
export const MUG_MOOD_OTHERS = -2;

/** pierwszy wędrowiec: dzień 2, między 8:00 a 12:00 */
export const firstWanderer = (rng: RngState): number => tickAt(2, 8 + 4 * nextRandom(rng));

/** następny wędrowiec 3–8 godzin po przyjściu poprzedniego; po 17:00 następnego dnia między 8:00 a 11:00 */
export function nextWanderer(tick: number, rng: RngState): number {
  const t = tick + Math.round((3 + 5 * nextRandom(rng)) * TICKS_PER_HOUR);
  if (dayOf(t) === dayOf(tick) && hourOf(t) < 17) return t;
  return tickAt(dayOf(tick) + 1, 8 + 3 * nextRandom(rng));
}

/** pierwsza ekipa: dzień 3 albo 4, między 9:00 a 14:00 */
export const firstCrew = (rng: RngState): number =>
  tickAt(3 + Math.floor(2 * nextRandom(rng)), 9 + 5 * nextRandom(rng));

/** następna ekipa za dwa albo trzy dni, między 9:00 a 14:00 */
export const nextCrew = (day: number, rng: RngState): number =>
  tickAt(day + 2 + Math.floor(2 * nextRandom(rng)), 9 + 5 * nextRandom(rng));

/** worek wędrowca po napaści: 1–3 porcje jedzenia, w połowie przypadków część, w co piątym lek */
export function mugLoot(rng: RngState): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = { jedzenie: 1 + Math.floor(3 * nextRandom(rng)) };
  if (nextRandom(rng) < 0.5) out.czesci = 1;
  if (nextRandom(rng) < 0.2) out.leki = 1;
  return out;
}

/** napis w obu językach */
export interface Napis {
  pl: string;
  en: string;
}

/** auto, auta, aut */
const aut = (n: number): string =>
  n === 1 ? 'auto' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'auta' : 'aut';

/** co wiadomo do wieści: za ile dni handlarz (−1: nie przyjdzie), ile nieprzeszukanych wraków przy ulicy */
export interface GossipCtx {
  traderIn: number;
  wrecksLeft: number;
}

/** Wieść z rozmowy z wędrowcem: kiedy handlarz, ile aut zostało, ludzie z łomami albo ogłoszenie ze słupa (z 0.3).
    Losowanie jak dotąd (rodzaj wieści, przy ogłoszeniu jeszcze jego numer), tekst z gossipText. */
export function gossip(ctx: GossipCtx, rng: RngState): Napis {
  const k = Math.floor(4 * nextRandom(rng));
  const ad = k === 3 ? Math.floor(nextRandom(rng) * ADS.length) : 0;
  return gossipText(k, ctx, ad);
}

/** tekst wieści: k rodzaj (0 handlarz, 1 auta, 2 ludzie z łomami, 3 ogłoszenie), ad numer ogłoszenia z ADS */
export function gossipText(k: number, ctx: GossipCtx, ad: number): Napis {
  if (k === 0) {
    if (ctx.traderIn < 0)
      return {
        pl: 'Wędrowiec mówi, że handlarz z wózkiem omija was teraz szerokim łukiem.',
        en: 'The wanderer says the trader with the cart now gives you a wide berth.',
      };
    const kiedy = ['jeszcze dziś', 'jutro', 'pojutrze'][ctx.traderIn] ?? `za ${ctx.traderIn} dni`;
    const when = ['later today', 'tomorrow', 'the day after tomorrow'][ctx.traderIn] ?? `in ${ctx.traderIn} days`;
    return {
      pl: `Wędrowiec mówi, że handlarz z wózkiem ma tu być ${kiedy}.`,
      en: `The wanderer says the trader with the cart should be here ${when}.`,
    };
  }
  if (k === 1) {
    const n = ctx.wrecksLeft;
    return n > 0
      ? {
          pl: `Wędrowiec mówi, że przy ulicy stoją jeszcze ${n} ${aut(n)}, których nikt nie przeszukał.`,
          en: `The wanderer says there ${n === 1 ? 'is still 1 car' : `are still ${n} cars`} by the road that nobody has searched.`,
        }
      : {
          pl: 'Wędrowiec mówi, że w okolicy nie ma już aut, w których coś zostało.',
          en: 'The wanderer says there are no cars left around here with anything in them.',
        };
  }
  if (k === 2)
    return {
      pl: 'Wędrowiec mówi, że po okolicy chodzą ludzie z łomami i przeszukują auta.',
      en: 'The wanderer says people with crowbars are going round searching cars.',
    };
  return {
    pl: `Wędrowiec mówi, że na słupie przy przystanku wisi ogłoszenie: „${ADS[ad]}”`,
    en: `The wanderer says there’s a notice on the pole by the bus stop: “${ADS_EN[ad]}”`,
  };
}

/** wieść z polskiego tekstu w stanie po angielsku: słownik ze wszystkich wariantów gossipText i przeszukali (liczby
    do 99); nieznany tekst zostaje jak jest */
let wiesciEn: Map<string, string> | null = null;
export function wiescEn(pl: string): string {
  if (!wiesciEn) {
    wiesciEn = new Map();
    const put = (n: Napis) => wiesciEn!.set(n.pl, n.en);
    for (let n = -1; n < 100; n++) {
      put(gossipText(0, { traderIn: n, wrecksLeft: 0 }, 0));
      if (n >= 0) put(gossipText(1, { traderIn: 0, wrecksLeft: n }, 0));
    }
    put(gossipText(2, { traderIn: 0, wrecksLeft: 0 }, 0));
    for (let ad = 0; ad < ADS.length; ad++) put(gossipText(3, { traderIn: 0, wrecksLeft: 0 }, ad));
    for (const model of ['maluch', 'polonez']) put(NAPISY.przeszukali(model));
  }
  return wiesciEn.get(pl) ?? pl;
}

export const NAPISY = {
  zagadac: { pl: 'Zagadać', en: 'Talk to the wanderer' },
  napasc: { pl: 'Napaść na wędrowca', en: 'Rob the wanderer' },
  przegonic: { pl: 'Przegonić', en: 'Chase them off' },
  nastrojRozmowa: { pl: 'Wieści ze świata', en: 'News from outside' },
  nastrojNapasc: { pl: 'Napadliśmy na wędrowca', en: 'We robbed a wanderer' },
  przeszukali: (model: string): Napis => ({
    pl: `Obcy przeszukali ${model === 'polonez' ? 'poloneza' : 'malucha'} przy ulicy.`,
    en: `Strangers have searched the ${model === 'polonez' ? 'Polonez' : 'Fiat 126p'} by the road.`,
  }),
  // opisy prac obcych i zarządu
  wander: [
    { pl: 'Idzie ulicą.', en: 'Walking down the street.' },
    { pl: 'Przystanął przy siatce.', en: 'Stopped by the fence.' },
    { pl: 'Odchodzi.', en: 'Leaving.' },
    { pl: 'Ucieka.', en: 'Running away.' },
  ],
  scavenge: [
    { pl: 'Idzie do auta z łomem.', en: 'Heading to a car with a crowbar.' },
    { pl: 'Przeszukuje auto.', en: 'Searching the car.' },
    { pl: 'Odchodzi z łupem.', en: 'Leaving with the loot.' },
    { pl: 'Ucieka.', en: 'Running away.' },
  ],
  idzieZagadac: { pl: 'Idzie zagadać wędrowca.', en: 'Going to talk to the wanderer.' },
  rozmawia: { pl: 'Rozmawia przez siatkę.', en: 'Talking through the fence.' },
  idzieNapasc: { pl: 'Idzie napaść na wędrowca.', en: 'Going to rob the wanderer.' },
  idziePrzegonic: { pl: 'Idzie przegonić obcych.', en: 'Going to chase the strangers off.' },
  poZagadac: { pl: 'Zagada wędrowca.', en: 'Off to talk to the wanderer.' },
  poZagadacWielu: { pl: 'Jedna osoba zagada wędrowca.', en: 'One person goes to talk to the wanderer.' },
  poNapasc: { pl: 'Napadnie na wędrowca.', en: 'Off to rob the wanderer.' },
  poNapascWielu: { pl: 'Jedna osoba napadnie na wędrowca.', en: 'One person goes to rob the wanderer.' },
  poPrzegonic: { pl: 'Przegoni obcych.', en: 'Going to chase the strangers off.' },
  poPrzegonicWielu: { pl: 'Jedna osoba przegoni obcych.', en: 'One person goes to chase the strangers off.' },
} as const;
