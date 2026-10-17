/* Zegar gry i pogoda. Jak w RimWorld: godzina gry trwa 40 s przy tempie 1×, a pionki chodzą szybko
   niezależnie od zegara (około 4 kafelków na sekundę realną). */

import { mulberry } from '../core/rng.ts';

export const TICKS_PER_SECOND = 20;
export const TICKS_PER_HOUR = 800;
export const TICKS_PER_DAY = TICKS_PER_HOUR * 24;
/** gra zaczyna się o 15:00 pierwszego dnia: zmierzch przychodzi po 2–3 minutach gry przy 1×,
    mniej więcej wtedy, kiedy pierwsza koza zaczyna grzać, więc okno może zaświecić od razu */
export const START_MINUTES = 15 * 60;
/** tempa: pauza, 1×, 3×, 6× */
export const SPEEDS = [0, 1, 3, 6] as const;
/** pora roku trwa 10 dni jak w 0.3; dzień 1 to początek jesieni, czyli październik 2051 */
export const SEASON_DAYS = 10;
export const SEASONS = ['jesień', 'zima', 'wiosna', 'lato'] as const;

export const minutesAt = (tick: number): number => START_MINUTES + (tick * 60) / TICKS_PER_HOUR;
export const dayOf = (tick: number): number => Math.floor(minutesAt(tick) / 1440) + 1;
export const hourOf = (tick: number): number => Math.floor(minutesAt(tick) / 60) % 24;
export function clockOf(tick: number): string {
  const m = Math.floor(minutesAt(tick)) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** światło dnia 0–1: jasno od 7 do 17, zmierzch do 20, noc, świt od 5 do 7 (jak przyciemnienie w main.ts) */
export function daylight(tick: number): number {
  const h = (minutesAt(tick) / 60) % 24;
  if (h >= 7 && h < 17) return 1;
  if (h >= 17 && h < 20) return (20 - h) / 3;
  if (h >= 5 && h < 7) return (h - 5) / 2;
  return 0;
}

/** 0 jesień, 1 zima, 2 wiosna, 3 lato */
export const seasonOf = (tick: number): number => Math.floor((dayOf(tick) - 1) / SEASON_DAYS) % 4;

/** odchyłka pogody danego dnia (±2,5°C), ta sama co w 0.3 */
const dayNoise = (seed: number, d: number) => (mulberry(seed + d * 31)() - 0.5) * 5;

/** Temperatura na zewnątrz w °C z dokładnością do 0,1. Pory roku jak Sim.temp w 0.3: jesień od 11°C do 0,
    zima od −3 do −10 i z powrotem, wiosna od 2 do 14, lato 19–24, do tego odchyłka dnia i cykl dobowy ±3°C.
    Różnice względem 0.3: pora roku i odchyłka dnia zmieniają się płynnie w ciągu doby zamiast skokiem
    o północy, a cykl dobowy jest odwrócony z powrotem (w 0.3 najcieplej było o 2 w nocy, tu o 14). */
export function outdoorTemp(seed: number, tick: number): number {
  const m = minutesAt(tick);
  const days = m / 1440;
  const d = Math.floor(days) + 1;
  const s = Math.floor((d - 1) / SEASON_DAYS) % 4;
  const p = (days % SEASON_DAYS) / SEASON_DAYS;
  let base: number;
  if (s === 0) base = 11 - 11 * p;
  else if (s === 1) base = -3 - 7 * Math.sin(p * Math.PI);
  else if (s === 2) base = 2 + 12 * p;
  else base = 19 + 5 * Math.sin(p * Math.PI);
  const f = days - (d - 1);
  const noise = dayNoise(seed, d) * (1 - f) + dayNoise(seed, d + 1) * f;
  const h = (m % 1440) / 60;
  return Math.round((base + noise + 3 * Math.cos(((h - 14) / 24) * Math.PI * 2)) * 10) / 10;
}
