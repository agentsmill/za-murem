/* Losowanie na liczbach całkowitych dla generatora mieszkańców. Szanse są na 10 000 (`p10k`), a każde porównanie ma
   postać `Math.floor(r() * N) < p`, więc wynik nie zależy od zaokrągleń ułamków. Bez trygonometrii i pierwiastków. */

import { hashString, mulberry, type Rng } from '../core/rng.ts';

/** Znak oddzielający klucze przed haszowaniem. Klucze z tym znakiem zderzyłyby się z innymi, ale nasze klucze
    (nazwy gmin, numery rejonów, liczby, roczniki) go nie mają. */
const SEPARATOR = '\u0001';

/** Ziarno z kluczy, np. `losDla(teryt, budynek, 'rok', 2026)`: ten sam zestaw kluczy daje ten sam ciąg liczb. */
export function losDla(...klucze: (string | number)[]): Rng {
  return mulberry(Number.parseInt(hashString(klucze.join(SEPARATOR)), 16));
}

/** Czy zdarzenie o szansie `p10k` na 10 000 wypadło (2500 to 25%). Zawsze zużywa jedno losowanie.
    Wartości poza [0, 10 000] działają jak brzegi: poniżej 0 nigdy, powyżej 10 000 zawsze. */
export function szansa(r: Rng, p10k: number): boolean {
  return Math.floor(r() * 10000) < p10k;
}

/** Indeks wylosowany z wagami całkowitymi ≥ 0. Przykład: wagi [0, 3, 1] dają 1 w trzech czwartych losowań,
    2 w jednej czwartej, 0 nigdy. Suma wag 0 daje -1 i nie zużywa losowania. Ułamek albo ujemna waga to RangeError. */
export function wazony(r: Rng, wagi: readonly number[]): number {
  let suma = 0;
  for (const w of wagi) {
    if (!Number.isInteger(w) || w < 0) throw new RangeError(`waga musi być całkowita i ≥ 0, a jest ${w}`);
    suma += w;
  }
  if (suma === 0) return -1;
  const los = Math.floor(r() * suma);
  let skumulowane = 0;
  for (let i = 0; i < wagi.length; i++) {
    skumulowane += wagi[i];
    if (los < skumulowane) return i;
  }
  return -1; // nieosiągalne: los < suma, a suma to skumulowane wagi
}

/** Liczba całkowita z przedziału [od, doW], oba końce włącznie (jak `ri` z rng.ts). `od > doW` oraz granice
    niecałkowite to RangeError. */
export function calkowita(r: Rng, od: number, doW: number): number {
  if (!Number.isInteger(od) || !Number.isInteger(doW))
    throw new RangeError(`granice muszą być całkowite: ${od}, ${doW}`);
  if (od > doW) throw new RangeError(`pusty przedział: ${od} > ${doW}`);
  return od + Math.floor(r() * (doW - od + 1));
}
