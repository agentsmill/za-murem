/* Wysokości budynków i lista pięter do widoku pięter (etap 1, flaga ?pietra=1,
   docs/superpowers/specs/2026-10-18-pietra-design.md, „Wysokości budynków”).

   Kondygnacje budynków (`levels`) pochodzą dziś z kafelków OpenFreeMap: `render_height` podzielone przez 3,5 m
   i zaokrąglone, minimum 1 (src/world/mvt.ts). Domy zwykle mają tam niską albo żadną wysokość, więc świat daje
   większości jedną kondygnację (nie odróżnimy domyślnej jedynki od prawdziwej) i w widoku pięter wszystkie
   wyglądałyby jak parterówki. Awansujemy je więc do dwóch kondygnacji, ale tylko tyle, żeby co najmniej
   połowa domów od 60 m² miała piętro. Domy z danymi (levels >= 2), bloki i inne budynki zostają bez zmian.
   Kolejność awansu nie zależy od losu, tylko od skrótu z ziarna świata i numeru budynku (przy remisie rozstrzyga
   numer), więc ten sam świat daje te same wysokości. Bez flagi nic z tego nie jest wołane. */

import { hashString } from '../core/rng.ts';
import type { World } from './world.ts';

/** najmniejsze pole obrysu domu (m²), które liczy się do awansu; mniejsze to szopy i altany */
export const DOM_MIN_POLE = 60;
/** jaki ułamek takich domów ma mieć co najmniej dwie kondygnacje (zaokrąglamy w górę) */
export const DOM_MIN_UDZIAL = 0.5;
/** najwyżej tyle pięter w pasku pięter, także dla budynków wyższych */
export const PIETER_MAX = 20;

/** Podnosi domy z jedną kondygnacją do dwóch, aż co najmniej połowa domów od 60 m² ma piętro. Mutuje `levels`,
    zwraca liczbę awansowanych domów. */
export function awansujDomy(w: Pick<World, 'buildings' | 'seed'>): number {
  const domy = w.buildings.filter((b) => b.cls === 'dom' && b.area >= DOM_MIN_POLE);
  const brakuje = Math.ceil(domy.length * DOM_MIN_UDZIAL) - domy.filter((b) => b.levels >= 2).length;
  if (brakuje <= 0) return 0;
  const awans = domy
    .filter((b) => b.levels === 1)
    .map((b) => ({ b, klucz: Number.parseInt(hashString(`${w.seed}:pietra:${b.id}`), 16) }))
    .sort((a, c) => a.klucz - c.klucz || a.b.id - c.b.id)
    .slice(0, brakuje);
  for (const { b } of awans) b.levels = 2;
  return awans.length;
}

/** Numery pięter do wyboru w widoku: od 0 (parter) do najwyższego budynku minus jeden, najwyżej PIETER_MAX.
    Gdy żaden budynek nie ma dwóch kondygnacji, tylko `[0]`. */
export function listaPieter(w: Pick<World, 'buildings'>): number[] {
  const najwyzszy = w.buildings.reduce((m, b) => Math.max(m, b.levels), 1);
  return Array.from({ length: Math.min(najwyzszy, PIETER_MAX) }, (_, i) => i);
}
