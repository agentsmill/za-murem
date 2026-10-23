/* Ludzie: generator fachowców przeniesiony z makeSpec w js/sim.js (0.3).
   Kolejność losowań jest ta sama, więc to samo ziarno daje tę samą osobę. */

import { hashString, pick, type Rng, ri, skrotLiczby } from '../core/rng.ts';
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
  /** historia z własnej drużyny zarządu (src/content/druzyna.ts); tylko dla klimatu, na karcie osoby. Osoby z
      losowania z adresu jej nie mają, więc pole nie trafia do ich stanu ani do skrótu. */
  story?: string;
  /** osoba z generatora mieszkańców (src/sim/lokatorzy.ts): `Osoba.id`, klucz zmiany imienia w przeglądarce gracza.
      Osoby z `makePerson` go nie mają. */
  ref?: string;
  /** imię i nazwisko z generatora w chwili powstania osoby (bez zmian gracza): po aktualizacji tabel src/ui/imiona.ts
      bierze tekst z generatora tylko dla tej samej osoby, a inaczej zostawia tekst z zapisu. Stare zapisy go nie mają. */
  nazwaGen?: string;
  /** obecni krewni z generatora w jednej linijce, np. „mąż Marek (54), córka Agnieszka (23)”; bez numerów mieszkań
      i pięter */
  rodzina?: string;
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

/** Wygląd człowieka z historią zarządu (gość, znajomy): to, z czego widok wybiera postać pionka, żeby ten sam człowiek miał tę
    samą twarz w każdym pionku. `f` i `age` wybierają postać (płeć, przedział wieku), `los` rozstrzyga między pasującymi i
    wersją kolorystyczną. Pionek niesie go w `Pawn.wyglad` (src/sim/sim.ts). */
export interface Wyglad {
  f: boolean;
  age: number;
  los: number;
  /** ziarno wersji kolorystycznej (widok bierze je modulo liczba ramp); bez niego wersja z `los`. Ma je tylko wygląd
      mieszkańca (`wygladMieszkanca`), którego wersja zależy od numeru osoby, nie od ziarna postaci */
  wer?: number;
}

/**
 * Wygląd znajomego z danych, które zarząd o nim zapamiętuje (`Znajomy`: wygląd pionka `look`, imię i nazwisko, płeć, wiek):
 * ziarno to skrót z wyglądu, imienia i nazwiska (`hashString`, 32 bity), płeć i wiek idą bez zmian. Czysta funkcja bez numeru
 * osoby w grze ani numeru pionka, które zmieniają się przy każdej wizycie i przyjęciu, więc gość pod bramą, ten sam człowiek
 * po przyjęciu, powracający gość i szabrownik, który idzie z napadem jako znajomy, dostają tę samą postać.
 */
export function wygladZnajomego(look: number, osoba: Pick<Person, 'first' | 'name' | 'f' | 'age'>): Wyglad {
  return {
    f: osoba.f,
    age: osoba.age,
    los: Number.parseInt(hashString(`${look}|${osoba.first}|${osoba.name}`), 16),
  };
}

/**
 * Wygląd mieszkańca z osobą z generatora mieszkańców, który jest w osiedlu pod numerem osoby `person`: to samo, co widok
 * wybiera dla niego za życia (postać z obsady mieszkańców po płci i wieku, rozstrzygnięta numerem osoby, i wersja
 * kolorystyczna z tego numeru). Mieszkaniec wyrzucony bramą idzie później z szabrownikami jako znajomy z takim wyglądem, więc
 * wygląda dokładnie tak, jak wyglądał u nas. Liczone z `skrotLiczby` (core/rng.ts), tej samej funkcji co w widoku.
 */
export function wygladMieszkanca(person: number, osoba: Pick<Person, 'f' | 'age'>): Wyglad {
  return { f: osoba.f, age: osoba.age, los: skrotLiczby(person), wer: skrotLiczby(person ^ 0x2f6b) };
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
