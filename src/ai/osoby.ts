/* Osoby zarządu dla silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md): kto jest w zarządzie, kto
   jest na miejscu i kto jest wolny do polecenia. Warstwy silnika (zima, rozwój) i ścinanie drewna w src/ai/silnik.ts pytają
   o to w jednym miejscu, żeby „wolna osoba” znaczyła wszędzie to samo. Stan gry czytają tu jak gracz, ze `SimState`, bez
   żadnej pamięci i bez rąk; funkcje są czyste i niczego nie zmieniają.

   `zarzad` to wszystkie pionki rodzaju `core`, także te na wyprawie poza mapą (`away`); `zarzadNaMiejscu` tylko te na miejscu.
   `wolnaOsoba` to osoba z zarządu, której można zlecić pracę: na miejscu, nie śpi (`sleep`) i nie stoi na warcie (`guard`).
   `najblizszaWolna` wybiera spośród nich osobę najbliższą punktu (kwadrat odległości w kafelkach), przy remisie o mniejszym
   id pionka. Tak wybierani są: rozbiórka sterty na materiał (zima), rozmowa z wędrowcem (rozwój) i ścinanie drzewa (silnik).

   Moduł niczego nie losuje, nie czyta zegara, nie importuje DOM ani modułów Node ani niczego z tests/ i tools/. */

import type { Pawn, SimState } from '../sim/sim.ts';

/** osoby zarządu, także te na wyprawie poza mapą */
export const zarzad = (st: SimState): Pawn[] => st.pawns.filter((p) => p.kind === 'core');

/** osoby zarządu na miejscu (bez tych na wyprawie) */
export const zarzadNaMiejscu = (st: SimState): Pawn[] => st.pawns.filter((p) => p.kind === 'core' && !p.away);

/** czy pionek to osoba z zarządu, której można zlecić pracę: na miejscu, nie śpi i nie stoi na warcie */
export const wolnaOsoba = (p: Pawn): boolean =>
  p.kind === 'core' && !p.away && p.job?.t !== 'sleep' && p.job?.t !== 'guard';

/** Wolna osoba z zarządu najbliższa punktu `cel` (kafelki mapy), przy tej samej odległości o mniejszym id; undefined, gdy
    nikt nie jest wolny. */
export function najblizszaWolna(st: SimState, cel: { x: number; y: number }): Pawn | undefined {
  const odleglosc = (p: Pawn): number => (p.x - cel.x) ** 2 + (p.y - cel.y) ** 2;
  return st.pawns.filter(wolnaOsoba).sort((a, b) => odleglosc(a) - odleglosc(b) || a.id - b.id)[0];
}
