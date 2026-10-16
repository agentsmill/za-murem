/* Ludzie: generator fachowców przeniesiony z makeSpec w js/sim.js (0.3).
   Kolejność losowań jest ta sama, więc to samo ziarno daje tę samą osobę. */

import { pick, type Rng, ri } from '../core/rng.ts';
import { type Dom, NAMES, PROFS, type Prof, SURN, TRAIT_PAIRS, TRAITS } from './data.ts';

export interface Assign {
  k: string;
  i: number | string;
}

export interface Person {
  id: string;
  first: string;
  name: string;
  f: boolean;
  prof: string;
  skills: Partial<Record<Dom, number>>;
  age: number;
  traits: string[];
  home: number;
  assign: Assign | null;
  sick: boolean;
  dead: boolean;
  gone: boolean;
}

export interface MakePersonOpts {
  f?: boolean;
  prof?: Prof;
  home?: number;
}

/**
 * @param used imiona już zajęte (generator próbuje do 20 razy wylosować inne)
 * @param nextId kolejny numer identyfikatora (w 0.3: S.nextId++)
 */
export function makePerson(
  rnd: Rng,
  used: ReadonlySet<string>,
  nextId: () => number,
  opts: MakePersonOpts = {},
): Person {
  const f = opts.f !== undefined ? opts.f : rnd() < 0.5;
  const prof = opts.prof || pick(PROFS, rnd);
  const names = NAMES[f ? 'f' : 'm'];
  let first = pick(names, rnd);
  let tries = 0;
  while (used.has(first) && tries++ < 20) first = pick(names, rnd);
  const sur = pick(SURN, rnd)[f ? 1 : 0];
  const traits: string[] = [];
  const tk = Object.keys(TRAITS);
  const nt = rnd() < 0.45 ? 2 : 1;
  while (traits.length < nt) {
    const t = pick(tk, rnd);
    if (traits.includes(t)) continue;
    if (TRAIT_PAIRS.some(([a, b]) => (a === t && traits.includes(b)) || (b === t && traits.includes(a)))) continue;
    traits.push(t);
  }
  const id = `s${nextId()}`;
  return {
    id,
    first,
    name: `${first} ${sur}`,
    f,
    prof: prof[f ? 1 : 0],
    skills: Object.assign({}, prof[2]),
    age: ri(prof[3][0], prof[3][1], rnd),
    traits,
    home: opts.home !== undefined ? opts.home : -1,
    assign: null,
    sick: false,
    dead: false,
    gone: false,
  };
}

/** Odmiana przez płeć: g(p, 'poszedł', 'poszła'). */
export const g = (p: { f: boolean }, m: string, f: string): string => (p.f ? f : m);

/** wiek z poprawną odmianą: 1 rok, 2–4 lata (bez 12–14), reszta lat */
export function wiek(n: number): string {
  if (n === 1) return '1 rok';
  const d = n % 10;
  const dd = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'lata' : 'lat'}`;
}
