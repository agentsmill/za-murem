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

/** Prosty skrót do porównywania stanów (FNV-1a na tekście). */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
