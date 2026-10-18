/* Pomoc do testów angielskiej wersji: czy tekst po angielsku nie ma polskich słów. Imiona, nazwy ulic i miejsc
   zostają po polsku (słowniczek), więc test podaje je jako dozwolone, a reszta nie może mieć polskich liter ani
   najczęstszych polskich słówek bez polskich liter. */

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
  return t.split(/[^\p{L}]+/u).filter((w) => w && (POLSKIE.test(w) || SLOWKA.has(w.toLowerCase())));
}
