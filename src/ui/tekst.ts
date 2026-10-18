/* Drobiazgi do tekstów interfejsu: ucieczka HTML i liczby w bieżącym języku (src/core/jezyk.ts): po polsku przecinek,
   po angielsku kropka, w obu prawdziwy minus; do tego angielska liczba mnoga. */

import { jezyk, liczba } from '../core/jezyk.ts';

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 1.5 → „1,5” (po angielsku „1.5”), −2 → „−2” */
export const num = (v: number, digits = 1): string => liczba(v, digits, jezyk());

/** ze znakiem: „+1,5”, „−2”, „0” */
export const signed = (v: number, digits = 1): string => {
  const s = num(v, digits);
  return s === '0' || s.startsWith('−') ? s : `+${s}`;
};

/** „12°C”, „−3°C” */
export const deg = (t: number): string => `${num(t, 0)}°C`;

/** 0.33 → „33%” */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** angielska liczba mnoga z liczbą: „1 person”, „2 people”, „0 people” */
export const manyEn = (n: number, one: string, other: string): string => `${n} ${n === 1 ? one : other}`;
