/* Pomoc do testów angielskiej wersji: czy tekst po angielsku nie ma polskich słów. Imiona, nazwy ulic i miejsc
   zostają po polsku (słowniczek), więc test podaje je jako dozwolone, a reszta nie może mieć polskich liter ani
   najczęstszych polskich słówek bez polskich liter. Do tego polska strona tekstów zarządu dla starszych testów. */

import type { GChoice, GEventDef, GovHost } from '../../src/gov/tresc.ts';

export const POLSKIE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

/** polskie słówka bez polskich liter, których nie ma w angielskim tekście gry (bez „to”, „do”, „on”, „a”) */
const SLOWKA = new Set([
  'i',
  'w',
  'z',
  'na',
  'nie',
  'przy',
  'jest',
  'dla',
  'oraz',
  'albo',
  'lub',
  'czy',
  'jak',
  'pod',
  'nad',
  'od',
  'ze',
  'bez',
  'po',
  'ich',
  'jego',
  'jej',
  'tylko',
  'teraz',
  'noc',
  'dzien',
]);

/** Słowa, które wyglądają na polskie, po usunięciu dozwolonych napisów (imiona, nazwy miejsc); pusta lista znaczy,
    że tekst jest po angielsku. Znaczniki HTML i encje odpadają przed sprawdzeniem. */
export function polskieSlowa(text: string, dozwolone: readonly string[] = []): string[] {
  let t = text.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');
  for (const d of [...dozwolone].sort((a, b) => b.length - a.length)) if (d) t = t.replaceAll(d, ' ');
  // jednoliterowe słówka tylko małą literą: angielskie „I” to nie polskie „i”
  const slowko = (w: string) => SLOWKA.has(w) || (w.length > 1 && SLOWKA.has(w.toLowerCase()));
  return t.split(/[^\p{L}]+/u).filter((w) => w && (POLSKIE.test(w) || slowko(w)));
}

/** polska strona tekstu zarządu (Tx) albo zwykły napis, do testów, które sprawdzają polskie zdania */
export const pl = (t: { pl: string } | string | null | undefined): string =>
  t === null || t === undefined ? '' : typeof t === 'string' ? t : t.pl;

/** wydarzenie gry z polskimi tekstami (tytuł, tekst i napisy wyborów jako napisy), dla testów pisanych po polsku */
export function polski(e: GEventDef): Omit<GEventDef, 'title' | 'text' | 'choices'> & {
  title: (h: GovHost, d: unknown) => string;
  text: (h: GovHost, d: unknown) => string;
  choices: (h: GovHost, d: unknown) => (Omit<GChoice, 'label'> & { label: string })[];
} {
  return {
    ...e,
    title: (h, d) => e.title(h, d).pl,
    text: (h, d) => e.text(h, d).pl,
    choices: (h, d) => e.choices(h, d).map((c) => ({ ...c, label: c.label.pl })),
  };
}
