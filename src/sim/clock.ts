/* Zegar gry. Jak w RimWorld: godzina gry trwa 40 s przy tempie 1×, a pionki chodzą szybko
   niezależnie od zegara (około 4 kafelków na sekundę realną). */

export const TICKS_PER_SECOND = 20;
export const TICKS_PER_HOUR = 800;
export const TICKS_PER_DAY = TICKS_PER_HOUR * 24;
/** gra zaczyna się o 7:00 pierwszego dnia */
export const START_MINUTES = 7 * 60;
/** tempa: pauza, 1×, 3×, 6× */
export const SPEEDS = [0, 1, 3, 6] as const;

export const minutesAt = (tick: number): number => START_MINUTES + (tick * 60) / TICKS_PER_HOUR;
export const dayOf = (tick: number): number => Math.floor(minutesAt(tick) / 1440) + 1;
export const hourOf = (tick: number): number => Math.floor(minutesAt(tick) / 60) % 24;
export function clockOf(tick: number): string {
  const m = Math.floor(minutesAt(tick)) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
