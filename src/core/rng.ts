/* Losowość z ziarnem. Ten sam generator (mulberry32) co G.mulberry w wersji 0.3,
   więc przeniesione generatory dają identyczne wyniki dla tego samego ziarna. */

export type Rng = () => number;

export function mulberry(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stan generatora trzymany w stanie gry (da się zapisać jako JSON). */
export interface RngState {
  s: number;
}

/** Jeden krok mulberry32 na stanie zapisywalnym. Daje ten sam ciąg co mulberry(s). */
export function nextRandom(st: RngState): number {
  let a = st.s | 0;
  a = (a + 0x6d2b79f5) | 0;
  st.s = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rngOf =
  (st: RngState): Rng =>
  () =>
    nextRandom(st);

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Liczba całkowita z przedziału [a, b] (jak G.ri). */
export const ri = (a: number, b: number, r: Rng): number => a + Math.floor(r() * (b - a + 1));

/** Losowy element tablicy (jak G.pick). */
export const pick = <T>(arr: readonly T[], r: Rng): T => arr[Math.floor(r() * arr.length)];

/** Liczba całkowita (32 bity bez znaku) z liczby: mieszanie bez losowania, ta sama liczba daje ten sam wynik w każdym silniku.
    Widok z niej wybiera postać i wersję kolorystyczną człowieka (src/render/ludziePixellab.ts), a `wygladMieszkanca`
    (src/content/people.ts) liczy z niej to samo dla mieszkańca, który wychodzi z osiedla. */
export function skrotLiczby(n: number): number {
  let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Prosty skrót do porównywania stanów (FNV-1a na tekście). */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
