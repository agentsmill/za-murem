/* Mieszkania siedziby w grze (M2, fala 1, docs/M2-fala-1.md): stan ze świata (World.apts), nasze (zarząd i zajęte),
   przeszukane pomieszczenia, uszkodzenia do naprawy (World.damage), a do tego tabele: łup z przeszukania według
   powodu opuszczenia, materiały z rozbiórki mebli i śmieci, koszty i czasy napraw. Czyste dane i funkcje. */

import type { AptState, AptWhy, Damage, DamageKind } from '../world/apts.ts';
import type { World } from '../world/world.ts';
import type { Mat } from './budowle.ts';
import type { HouseLike, RoomKind } from './house.ts';

/** mieszkanie siedziby w grze */
export interface AptGame {
  /** numer mieszkania (Room.apt) */
  apt: number;
  /** ze świata: mieszkanie zarządu, mieszkańców albo puste; bez World.apts każde poza zarządem to mieszkańcy */
  state: 'zarzad' | 'mieszkancy' | 'puste';
  why?: AptWhy;
  year?: number;
  /** nasze: mieszkanie zarządu albo zajęte poleceniem 'claim' (wolno w nim budować) */
  ours: boolean;
  /** przeszukane pomieszczenia (id), rosnąco */
  searched: number[];
}

/** uszkodzenie w grze: ze świata, z materiałami doniesionymi do naprawy */
export interface DamageGame {
  kind: DamageKind;
  tile: number;
  apt: number;
  fixed: boolean;
  /** materiały już przy uszkodzeniu (naprawa w toku) */
  have: Partial<Record<Mat, number>>;
}

/** materiały, które leżą jako rzeczy (Thing.kind równy nazwie materiału); jedzenie to zapasy, drewno to stosy */
export const MATS: readonly Mat[] = ['drewno', 'deski', 'zlom', 'czesci', 'jedzenie', 'leki'];

/** nazwy materiałów w dopełniaczu liczby mnogiej do opisów („po deski”, „niesie złom”) */
export const MAT_ACC: Record<Mat, string> = {
  drewno: 'drewno',
  deski: 'deski',
  zlom: 'złom',
  czesci: 'części',
  jedzenie: 'jedzenie',
  leki: 'leki',
};

/** naprawy: koszt, czas pracy jednego pionka (ticki) i nazwy do menu i opisów */
export const REPAIR: Record<DamageKind, { cost: Partial<Record<Mat, number>>; work: number; acc: string }> = {
  okno: { cost: { deski: 2 }, work: 800, acc: 'okno' },
  drzwi: { cost: { deski: 3 }, work: 1000, acc: 'drzwi' },
  rura: { cost: { zlom: 1, czesci: 1 }, work: 800, acc: 'rurę' },
  podloga: { cost: { deski: 2 }, work: 1000, acc: 'podłogę' },
  piec: { cost: { zlom: 2, czesci: 1 }, work: 1000, acc: 'piec' },
};

/** materiały z rozbiórki mebli (zepsute dają połowę); sterty śmieci i gruzu według liczby sztuk */
export const DISMANTLE: Record<string, Partial<Record<Mat, number>>> = {
  stol: { deski: 2 },
  krzeslo: { deski: 1 },
  lozko: { deski: 2 },
  wersalka: { deski: 2, zlom: 1 },
  mebloscianka: { deski: 4 },
  kuchenka: { zlom: 2 },
  lodowka: { zlom: 3, czesci: 1 },
  wanna: { zlom: 2 },
  umywalka: { zlom: 1 },
  koza: { zlom: 3, czesci: 1 },
};

/** rzeczy, które da się rozebrać na materiał: meble z tabeli, śmieci i gruz */
export const RUBBISH = new Set(['smieci', 'gruz']);

/** materiały z rozebrania rzeczy (bez premii warsztatu) */
export function yieldOf(kind: string, n: number, broken: boolean): Partial<Record<Mat, number>> {
  if (RUBBISH.has(kind)) return { deski: Math.ceil(n / 2), zlom: Math.floor(n / 2) };
  const base = DISMANTLE[kind];
  if (!base) return {};
  if (!broken) return { ...base };
  // zepsuty mebel: połowa, ale główny materiał co najmniej sztuka
  const out: Partial<Record<Mat, number>> = {};
  let main: Mat | null = null;
  for (const [m, v] of Object.entries(base) as [Mat, number][]) {
    out[m] = Math.floor(v / 2);
    if (!main || v > (base[main] ?? 0)) main = m;
  }
  if (main && !out[main]) out[main] = 1;
  return out;
}

/** czas rozbiórki w tickach: meble według wielkości, śmieci według liczby sztuk */
export const dismantleTicks = (kind: string, w: number, h: number, n: number): number =>
  RUBBISH.has(kind) ? 160 + 100 * n : Math.min(1000, 400 * Math.max(1, w * h));

/** czas przeszukania pomieszczenia według jego wielkości (kafelki posadzki) */
export const searchTicks = (area: number): number => Math.max(600, Math.min(1200, 400 + 20 * area));

/** łup z przeszukania: dla każdego materiału szansa i zakres sztuk, według powodu opuszczenia mieszkania */
const LOOT: Record<AptWhy, [Mat, number, number, number][]> = {
  wyjazd: [
    ['deski', 0.7, 1, 2],
    ['zlom', 0.5, 1, 1],
    ['czesci', 0.35, 1, 1],
    ['jedzenie', 0.4, 1, 2],
    ['leki', 0.2, 1, 1],
  ],
  wymarcie: [
    ['deski', 0.6, 1, 2],
    ['zlom', 0.5, 1, 2],
    ['czesci', 0.3, 1, 1],
    ['leki', 0.5, 1, 2],
    ['jedzenie', 0.25, 1, 1],
  ],
  splądrowanie: [
    ['deski', 0.6, 1, 2],
    ['zlom', 0.6, 1, 2],
    ['czesci', 0.15, 1, 1],
    ['leki', 0.05, 1, 1],
    ['jedzenie', 0.05, 1, 1],
  ],
  zalanie: [
    ['deski', 0.3, 1, 1],
    ['zlom', 0.6, 1, 2],
    ['czesci', 0.35, 1, 1],
    ['leki', 0.25, 1, 1],
  ],
  pozar: [
    ['deski', 0.2, 1, 1],
    ['zlom', 0.7, 1, 3],
    ['czesci', 0.3, 1, 1],
  ],
};

/** dodatkowa szansa według rodzaju pomieszczenia: w kuchni jedzenie, w łazience leki, w pokoju deski */
const ROOM_BONUS: Partial<Record<RoomKind, Partial<Record<Mat, number>>>> = {
  kuchnia: { jedzenie: 0.3, zlom: 0.1 },
  lazienka: { leki: 0.3, czesci: 0.1 },
  pokoj: { deski: 0.15 },
};

/** Łup z przeszukania pomieszczenia: tabela powodu, premia pomieszczenia, w dużym (od 20 kafelków) druga kolejka
    losowania desek i złomu. rnd: generator z ziarna świata i pomieszczenia (deterministycznie, raz na pomieszczenie). */
export function lootOf(why: AptWhy, kind: RoomKind, area: number, rnd: () => number): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = {};
  const bonus = ROOM_BONUS[kind] ?? {};
  const rolls = area >= 20 ? 2 : 1;
  for (const [mat, chance, lo, hi] of LOOT[why]) {
    const times = mat === 'deski' || mat === 'zlom' ? rolls : 1;
    for (let k = 0; k < times; k++)
      if (rnd() < chance + (bonus[mat] ?? 0)) out[mat] = (out[mat] ?? 0) + lo + Math.floor(rnd() * (hi - lo + 1));
  }
  return out;
}

/** stan mieszkań siedziby na start gry: ze świata (World.apts dla tego budynku), bez niego każde poza zarządem
    to mieszkanie mieszkańców (jak w M1) */
export function aptsFrom(w: World, h: HouseLike): AptGame[] {
  const all = (w as { apts?: AptState[] }).apts ?? [];
  const mine = all.filter((a) => a.bid === h.building);
  const nums = [...new Set(h.rooms.filter((r) => r.apt >= 0).map((r) => r.apt))].sort((a, b) => a - b);
  return nums.map((apt) => {
    const s = mine.find((a) => a.apt === apt);
    const state = apt === h.home ? 'zarzad' : (s?.state ?? 'mieszkancy');
    const out: AptGame = { apt, state, ours: apt === h.home, searched: [] };
    if (state === 'puste' && s?.why) out.why = s.why;
    if (state === 'puste' && s?.year) out.year = s.year;
    return out;
  });
}

/** uszkodzenia siedziby ze świata (World.damage dla tego budynku) */
export function damageFrom(w: World, h: HouseLike): DamageGame[] {
  const all = (w as { damage?: Damage[] }).damage ?? [];
  return all
    .filter((d) => d.bid === h.building)
    .map((d) => ({ kind: d.kind, tile: d.tile, apt: d.apt, fixed: false, have: {} }));
}
