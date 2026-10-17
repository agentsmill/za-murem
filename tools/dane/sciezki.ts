/* Ścieżki narzędzi do danych mieszkańców: katalog surowych plików (poza repozytorium) i katalog tabel w grze. */

import path from 'node:path';

/** Surowe pliki GUS, shapefile'e i CSV. Nic stąd nie trafia do repozytorium; zmiana ścieżki: zmienna ZM_SUROWE. */
export const SUROWE = process.env.ZM_SUROWE || '/Users/mpawelczuk/Post-pixel/dane-surowe';

const WYJSCIE = path.resolve(import.meta.dirname, '../../public/data/mieszkancy');

/** Ścieżka w katalogu małych tabel JSON, które wczytuje gra: public/data/mieszkancy/…. */
export function wyjscie(...czesci: string[]): string {
  return path.join(WYJSCIE, ...czesci);
}
