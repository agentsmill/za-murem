/* Wiki w grze: wspólne drobiazgi do pisania artykułów w obu językach. Funkcje oddają napis w bieżącym języku (`L()`),
   więc wolno je wstawiać do obu gałęzi `L(pl, en)`: liczy się ta, którą wybrano, a ona dostaje napis w tym samym języku.
   Liczby idą przez `num` (src/ui/tekst.ts: po polsku przecinek, po angielsku kropka, prawdziwy minus). Cudzysłowy w polskim
   tekście to „…”, w angielskim “…”. */

import { L } from '../core/jezyk.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { num } from './tekst.ts';
import type { WikiCtx } from './wiki-typy.ts';

/** Krok „Jak to zrobić”: zaznaczyć kogoś z zarządu i dać polecenie z menu przy rzeczy. `przy` to miejsce w miejscowniku po
    „przy” (pl) i po „on” (en), `cmd` to napis z menu (pl, en) bez cudzysłowu. */
export function polecenie(c: WikiCtx, przy: [string, string], cmd: [string, string]): string {
  return L(
    `Zaznaczcie kogoś z ${c.words.zarzad.dk}, potem otwórzcie menu poleceń przy ${przy[0]} (${prawy(c)}) i wybierzcie ${cyt(cmd[0], cmd[1])}.`,
    `Select someone from ${c.e.krotko}, then open the order menu on ${przy[1]} (${prawy(c)}) and pick ${cyt(cmd[0], cmd[1])}.`,
  );
}

/** polecenie z menu w cudzysłowie: „Ściąć drzewo” / “Chop down the tree” */
export const cyt = (pl: string, en: string): string => L(`„${pl}”`, `“${en}”`);

/** napis w cudzysłowie bieżącego języka (gdy tekst jest już w bieżącym języku) */
export const wCyt = (s: string): string => L(`„${s}”`, `“${s}”`);

/** „prawy przycisk” albo „przytrzymanie palca” (do nawiasu przy menu poleceń) */
export const prawy = (c: WikiCtx): string =>
  c.touch ? L('przytrzymanie palca', 'press and hold') : L('prawy przycisk', 'right-click');

/** „kliknijcie” albo „stuknijcie” */
export const kliknijcie = (c: WikiCtx): string => (c.touch ? L('stuknijcie', 'tap') : L('kliknijcie', 'click'));

/** lista „a, b i c” (po angielsku „a, b and c”) */
export function listaI(a: readonly string[]): string {
  if (a.length < 2) return a.join('');
  const i = L(' i ', ' and ');
  return `${a.slice(0, -1).join(', ')}${i}${a[a.length - 1]}`;
}

/** lista z „albo” (po angielsku „or”) */
export function listaAlbo(a: readonly string[]): string {
  if (a.length < 2) return a.join('');
  const i = L(' albo ', ' or ');
  return `${a.slice(0, -1).join(', ')}${i}${a[a.length - 1]}`;
}

/** liczba godzin gry z jednostką: „1 h”, „1,5 h” */
export const godz = (h: number): string => `${num(h, h === Math.round(h) ? 0 : 1)} h`;

/** liczba minut z jednostką */
export const min = (m: number): string => `${num(m, 0)} min`;

/** ticki gry jako godziny z jednostką: godzina to TICKS_PER_HOUR; do 90 minut w minutach, dalej w godzinach */
export function czasTickow(ticks: number): string {
  const m = Math.round((ticks / TICKS_PER_HOUR) * 60);
  return m < 90 && m !== 60 ? min(m) : godz(m / 60);
}

/** liczba z jednostką po polsku i po angielsku w jednym ciągu, z twardą spacją: „6 m”, „120 m” */
export const metry = (m: number): string => `${num(m, 0)} m`;

/** „+3” / „−2” już z `signed` jest w tekst.ts; tu tylko procent z ułamka: 0.35 → „35%” */
export const proc = (v: number): string => `${Math.round(v * 100)}%`;
