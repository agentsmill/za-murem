/* Limity prób w pamięci serwera: licznik w oknie czasu na klucz (adres IP). Nic nie trafia do bazy ani do logów,
   a wpisy znikają razem z oknem, więc serwer nie przechowuje adresów IP dłużej niż trwa okno (RODO).
   Jeden proces, bez współdzielenia: przy kilku instancjach serwera limity liczyłyby się osobno. */

export interface Okno {
  /** czy klucz przekroczył limit; jeśli tak, za ile sekund może spróbować */
  zablokowany(klucz: string): number;
  /** dolicza próbę i mówi, za ile sekund klucz będzie mógł próbować, gdy właśnie przekroczył limit (0: nie) */
  dolicz(klucz: string): number;
  /** zapomina klucz (np. po udanym logowaniu) */
  zapomnij(klucz: string): void;
  /** usuwa wygasłe wpisy; serwer woła to co jakiś czas */
  sprzataj(): void;
  /** liczba pamiętanych kluczy (do testów i diagnostyki) */
  readonly rozmiar: number;
}

/** okno stałej długości: najwyżej `limit` prób na `okno` milisekund, licząc od pierwszej próby */
export function okno(limit: number, oknoMs: number, teraz: () => number = Date.now): Okno {
  const wpisy = new Map<string, { n: number; koniec: number }>();
  const wpis = (klucz: string) => {
    const w = wpisy.get(klucz);
    if (w && w.koniec > teraz()) return w;
    if (w) wpisy.delete(klucz);
    return null;
  };
  const sekundy = (koniec: number) => Math.max(1, Math.ceil((koniec - teraz()) / 1000));
  return {
    zablokowany(klucz) {
      const w = wpis(klucz);
      return w && w.n >= limit ? sekundy(w.koniec) : 0;
    },
    dolicz(klucz) {
      let w = wpis(klucz);
      if (!w) {
        w = { n: 0, koniec: teraz() + oknoMs };
        wpisy.set(klucz, w);
      }
      w.n++;
      return w.n >= limit ? sekundy(w.koniec) : 0;
    },
    zapomnij(klucz) {
      wpisy.delete(klucz);
    },
    sprzataj() {
      const t = teraz();
      for (const [k, w] of wpisy) if (w.koniec <= t) wpisy.delete(k);
    },
    get rozmiar() {
      return wpisy.size;
    },
  };
}
