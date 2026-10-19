/* Surowce na mapie (docs/superpowers/specs/2026-10-18-surowce-design.md): wraki do przeszukania i rozbiórki, łup
   zza siatki niesiony na podwórko i przeróbka w warsztacie (drewno na deski, złom na części; czas jednej sztuki liczy
   `pracaPrzepisu`, części po t_spawanie krócej). Czyste dane i funkcje dla symulacji, menu i rysowania. Łup z wraku
   losuje generator z ziarna gry i kafelka wraku, a nie st.rng, więc przeszukanie nie przesuwa innych losowań. Stan wraków (st.wraki) powstaje dopiero przy pierwszym przeszukaniu,
   żeby gra bez wraków miała ten sam stan i skrót co przed tą zmianą. Napisy są w obu językach: menu, opisy prac
   i podpowiedzi biorą je przez tr() w bieżącym języku (deski to „planks”, bo „board” to zarząd). */

import { mulberry } from '../core/rng.ts';
import type { Wreck, WreckModel } from '../world/wrecks.ts';
import { SPAWANIE_TEMPO } from './badania.ts';
import type { Mat } from './budowle.ts';
import { TICKS_PER_HOUR } from './clock.ts';

/** stan wraku w grze: 0 cały, 1 przeszukany, 2 rozebrany (szkielet, dalej blokuje) */
export type WreckStage = 0 | 1 | 2;

/** wrak zmieniony w grze: lewy górny kafelek i stan; reszta wraków jest cała. w: praca przy rozbiórce w tickach
    (z łomem tick liczy się podwójnie), żeby przerwana rozbiórka nie zaczynała się od zera; po rozebraniu znika */
export interface WreckMark {
  t: number;
  s: 1 | 2;
  w?: number;
}

/** przeszukanie wraku trwa pół godziny gry */
export const WRECK_SEARCH_TICKS = TICKS_PER_HOUR / 2;
/** rozbiórka: maluch 2 h, polonez 2,5 h; z łomem w rękach o połowę krócej */
export const WRECK_STRIP_TICKS: Record<WreckModel, number> = {
  maluch: 2 * TICKS_PER_HOUR,
  polonez: (5 * TICKS_PER_HOUR) / 2,
};
/** promień hałasu (m): przeszukanie raz na początku, rozbiórka co 2 s (NOISE_TICKS; blacha i łom słychać daleko) */
export const WRECK_SEARCH_NOISE = 3;
export const WRECK_STRIP_NOISE = 20;
/** łup z rozbiórki (bez premii warsztatu) */
export const WRECK_STRIP: Record<WreckModel, Partial<Record<Mat, number>>> = {
  maluch: { zlom: 6, czesci: 1 },
  polonez: { zlom: 8, czesci: 1 },
};

/** łup z przeszukania: materiał, szansa, od, do. Części, bo przetrwało to, co szczelne (alternator i rozrusznik
    pod lakierem), leki z apteczki w schowku, jedzenie z konserw w bagażniku. */
const WRECK_LOOT: Record<WreckModel, [Mat, number, number, number][]> = {
  maluch: [
    ['czesci', 0.6, 1, 1],
    ['zlom', 0.5, 1, 2],
    ['leki', 0.15, 1, 1],
    ['jedzenie', 0.1, 1, 2],
  ],
  polonez: [
    ['czesci', 0.7, 1, 2],
    ['zlom', 0.6, 1, 2],
    ['leki', 0.15, 1, 1],
    ['jedzenie', 0.15, 1, 2],
  ],
};

/** generator łupu wraku: z ziarna gry i lewego górnego kafelka wraku (inna stała niż łup pomieszczeń) */
export const wreckRng = (seed: number, tile: number): (() => number) =>
  mulberry((Math.imul(seed | 0, 6007) ^ Math.imul(tile + 1, 2654435) ^ 0x3a7c) >>> 0);

/** łup z przeszukania wraku: każdy materiał z szansą, sztuki z zakresu */
export function wreckLoot(model: WreckModel, rnd: () => number): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = {};
  for (const [mat, chance, lo, hi] of WRECK_LOOT[model])
    if (rnd() < chance) out[mat] = (out[mat] ?? 0) + lo + Math.floor(rnd() * (hi - lo + 1));
  return out;
}

/** czas rozbiórki wraku w tickach; z łomem w rękach o połowę krócej */
export const wreckStripTicks = (model: WreckModel, crowbar: boolean): number =>
  crowbar ? WRECK_STRIP_TICKS[model] / 2 : WRECK_STRIP_TICKS[model];

/** wraki świata (World.props z kind 'wrak') po kolei */
export const wrecksOf = (w: { props?: readonly { kind: string }[] }): Wreck[] =>
  (w.props ?? []).filter((p): p is Wreck => p.kind === 'wrak');

/** Wrak pod kafelkiem albo tuż przy nim (do metra od podstawy): kliknięcie obok auta też trafia, bo podstawa blokuje
    i łatwo kliknąć obok. Gdy dwa wraki są tak blisko, wygrywa ten, którego podstawa obejmuje kafelek. */
export function wreckAt(w: { size: number; props?: readonly { kind: string }[] }, tile: number): Wreck | undefined {
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  let near: Wreck | undefined;
  for (const r of wrecksOf(w)) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    if (!near && x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h) near = r;
  }
  return near;
}

/** lewy górny kafelek wraku (klucz w st.wraki) */
export const wreckTile = (r: Pick<Wreck, 'x' | 'y'>, size: number): number => r.y * size + r.x;

/** stan wraku w grze */
export function wreckStage(marks: readonly WreckMark[] | undefined, tile: number): WreckStage {
  return marks?.find((m) => m.t === tile)?.s ?? 0;
}

/** przepisy warsztatu: z czego, ile sztuk na jedną i ile pracy (ticki) za sztukę */
export type Product = 'deski' | 'czesci';
export const RECIPES: Record<Product, { from: Mat; n: number; work: number }> = {
  deski: { from: 'drewno', n: 2, work: TICKS_PER_HOUR / 3 },
  czesci: { from: 'zlom', n: 2, work: TICKS_PER_HOUR },
};
/** praca przy jednej sztuce produktu w tickach: z tabeli RECIPES, a części po zbadaniu spawania z akumulatorów
    (t_spawanie) 1,5× krócej. Bez badania dokładnie `RECIPES[what].work`. */
export function pracaPrzepisu(what: Product, techDone?: readonly string[]): number {
  const praca = RECIPES[what].work;
  return what === 'czesci' && techDone?.includes('t_spawanie') ? praca / SPAWANIE_TEMPO : praca;
}
/** ile sztuk naraz daje drugie polecenie w menu warsztatu */
export const BATCH = 5;

/** materiały, które „Zanieść na podwórko” nosi zza siatki (drewno ma swoje noszenie do składu) */
export const CARRY_MATS: ReadonlySet<string> = new Set<Mat>(['deski', 'zlom', 'czesci', 'leki', 'jedzenie']);
/** przy noszeniu łupu zbiera się sterty do tylu metrów od miejsca, z którego się zaczęło */
export const CARRY_REACH = 3;

/** polska liczba mnoga: 2–4 (bez 12–14) jedna forma, reszta druga */
const plural = (n: number, few: string, many: string): string =>
  n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** napis w obu językach */
export interface Napis {
  pl: string;
  en: string;
}

const MODEL_ACC: Record<WreckModel, Napis> = {
  maluch: { pl: 'malucha', en: 'the Fiat 126p' },
  polonez: { pl: 'poloneza', en: 'the Polonez' },
};

/** etykiety menu i opisy prac */
export const NAPISY = {
  szukaj: (m: WreckModel): Napis => ({ pl: `Przeszukać ${MODEL_ACC[m].pl}`, en: `Search ${MODEL_ACC[m].en}` }),
  rozbierz: (m: WreckModel): Napis => ({ pl: `Rozebrać ${MODEL_ACC[m].pl}`, en: `Strip ${MODEL_ACC[m].en}` }),
  zaniesc: { pl: 'Zanieść na podwórko', en: 'Carry into the yard' },
  obcyPrzyAucie: { pl: 'przy aucie są obcy', en: 'strangers are at the car' },
  deska: { pl: 'Piłować deskę z drewna', en: 'Saw wood into a plank' },
  deskiN: (n: number): Napis => ({
    pl: `Piłować ${n} ${plural(n, 'deski', 'desek')}`,
    en: `Saw wood into ${n} planks`,
  }),
  czesc: { pl: 'Zrobić część ze złomu', en: 'Make a part from scrap' },
  czesciN: (n: number): Napis => ({ pl: `Zrobić ${n} części ze złomu`, en: `Make ${n} parts from scrap` }),
  idzieSzukac: { pl: 'Idzie przeszukać wrak.', en: 'Going to search the wreck.' },
  szuka: { pl: 'Przeszukuje wrak.', en: 'Searching the wreck.' },
  idzieRozbierac: { pl: 'Idzie rozebrać wrak.', en: 'Going to strip the wreck.' },
  rozbiera: { pl: 'Rozbiera wrak.', en: 'Stripping the wreck.' },
  poLup: { pl: 'Idzie po łup.', en: 'Going for the loot.' },
  niesie: { pl: 'Niesie łup na podwórko.', en: 'Carrying the loot into the yard.' },
  idzieWarsztat: { pl: 'Idzie do warsztatu.', en: 'Going to the workshop.' },
  /** left: ile sztuk zostało razem z tą, nad którą pracuje */
  pilujeDeski: (left: number): Napis => ({
    pl: left > 1 ? `Piłuje deski (jeszcze ${left}).` : 'Piłuje deskę.',
    en: left > 1 ? `Sawing planks (${left} to go).` : 'Sawing a plank.',
  }),
  robiCzesci: (left: number): Napis => ({
    pl: left > 1 ? `Robi części ze złomu (jeszcze ${left}).` : 'Robi część ze złomu.',
    en: left > 1 ? `Making parts from scrap (${left} to go).` : 'Making a part from scrap.',
  }),
  /** podpowiedzi po poleceniu (jedna osoba, kilka osób: polecenie bierze jedna) */
  poWrak: { pl: 'Weźmie się za wrak.', en: 'Off to work on the wreck.' },
  poWrakWielu: { pl: 'Jedna osoba weźmie się za wrak.', en: 'One person goes to work on the wreck.' },
  poZaniesc: { pl: 'Zaniesie łup na podwórko.', en: 'Off to carry the loot into the yard.' },
  poZaniescWielu: {
    pl: 'Jedna osoba zaniesie łup na podwórko.',
    en: 'One person goes to carry the loot into the yard.',
  },
  poWarsztat: { pl: 'Weźmie się do roboty w warsztacie.', en: 'Off to the workshop.' },
  poWarsztatWielu: {
    pl: 'Jedna osoba weźmie się do roboty w warsztacie.',
    en: 'One person goes to the workshop.',
  },
} as const;
