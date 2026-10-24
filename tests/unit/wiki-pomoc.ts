/* Pomocnik testów wiki (src/ui/wiki.ts): konteksty dla bloku (Przymorze) i domu (Zielonki), obu języków i obu urządzeń,
   budowanie wszystkich artykułów w bieżącym języku i tekst artykułu do sprawdzeń słownych. */

import { ustawJezyk } from '../../src/core/jezyk.ts';
import { placeOf } from '../../src/gov/miejsce.ts';
import { type Artykul, artykul, rejestr, type WikiCtx, wikiCtx } from '../../src/ui/wiki.ts';
import { demoWorld } from './miejsce-pomoc.ts';

export type Wariant = 'blok' | 'dom';

let miejsca: Record<Wariant, ReturnType<typeof placeOf>> | null = null;
/** miejsca siedziby z prawdziwych dem: blok na Przymorzu, dom w Zielonkach (liczone raz na plik testów) */
export function miejsce(w: Wariant) {
  miejsca ??= { blok: placeOf(demoWorld('przymorze').w), dom: placeOf(demoWorld('zielonki').w) };
  return miejsca[w];
}

export const kontekst = (w: Wariant, touch = false, zombie = false): WikiCtx => wikiCtx(miejsce(w), touch, zombie);

export interface Przypadek {
  opis: string;
  wariant: Wariant;
  lang: 'pl' | 'en';
  touch: boolean;
}

/** wszystkie kombinacje: dwa miejsca, dwa języki, mysz i dotyk */
export const PRZYPADKI: Przypadek[] = (['blok', 'dom'] as const).flatMap((wariant) =>
  (['pl', 'en'] as const).flatMap((lang) =>
    [false, true].map((touch) => ({
      opis: `${wariant}, ${lang}, ${touch ? 'dotyk' : 'mysz'}`,
      wariant,
      lang,
      touch,
    })),
  ),
);

/** Buduje wszystkie artykuły w danym przypadku; język zostaje ustawiony, wołający przywraca polski (`afterEach`). */
export function zbuduj(p: Przypadek): { c: WikiCtx; artykuly: Artykul[] } {
  ustawJezyk(p.lang);
  const c = kontekst(p.wariant, p.touch);
  return { c, artykuly: rejestr().map((d) => artykul(d.id, c)!) };
}

/** cały widoczny tekst artykułu: tytuł, zdania, uwaga, fakty, kroki i przyciski */
export const tekstArtykulu = (a: Artykul): string =>
  [
    a.tytul,
    ...a.zdania,
    a.uwaga ?? '',
    ...a.fakty.flatMap((f) => [f.k, f.v]),
    ...a.jak,
    ...a.przyciski.map((p) => p.napis),
  ].join('\n');
