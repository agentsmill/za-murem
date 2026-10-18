/* Limity prób w pamięci serwera: licznik w oknie czasu na klucz (adres IP, nick, konto) i kolejka do drogich
   obliczeń (scrypt). Nic nie trafia do bazy ani do logów, a wpisy znikają razem z oknem, więc serwer nie przechowuje
   adresów IP dłużej niż trwa okno (RODO). Jeden proces, bez współdzielenia: przy kilku instancjach serwera limity
   liczyłyby się osobno.

   Próbę liczymy od razu, zanim obsługa trasy na cokolwiek poczeka (dolicz przed pierwszym await), a odliczamy, gdy
   się udała i nie ma się liczyć (odlicz). Inaczej sto równoległych żądań przeszłoby sprawdzenie, zanim pierwsze
   zdążyłoby się doliczyć. */

export interface Okno {
  /** czy klucz przekroczył limit; jeśli tak, za ile sekund może spróbować */
  zablokowany(klucz: string): number;
  /** dolicza próbę i mówi, za ile sekund klucz będzie mógł próbować, gdy właśnie przekroczył limit (0: nie) */
  dolicz(klucz: string): number;
  /** cofa jedną doliczoną próbę (np. udane logowanie albo nieudane z powodu złych danych) */
  odlicz(klucz: string): void;
  /** zapomina klucz */
  zapomnij(klucz: string): void;
  /** usuwa wygasłe wpisy; serwer woła to co minutę, a samo okno, gdy wpisów zrobi się bardzo dużo */
  sprzataj(): void;
  /** liczba pamiętanych kluczy (do testów i diagnostyki) */
  readonly rozmiar: number;
}

/** najwięcej wpisów w oknie, zanim samo posprząta wygasłe (np. przy zalewie z adresów IPv6) */
const DUZO_WPISOW = 100_000;

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
  const sprzataj = () => {
    const t = teraz();
    for (const [k, w] of wpisy) if (w.koniec <= t) wpisy.delete(k);
  };
  return {
    zablokowany(klucz) {
      const w = wpis(klucz);
      return w && w.n >= limit ? sekundy(w.koniec) : 0;
    },
    dolicz(klucz) {
      let w = wpis(klucz);
      if (!w) {
        if (wpisy.size >= DUZO_WPISOW) sprzataj();
        w = { n: 0, koniec: teraz() + oknoMs };
        wpisy.set(klucz, w);
      }
      w.n++;
      return w.n >= limit ? sekundy(w.koniec) : 0;
    },
    odlicz(klucz) {
      const w = wpis(klucz);
      if (w && w.n > 0) w.n--;
    },
    zapomnij(klucz) {
      wpisy.delete(klucz);
    },
    sprzataj,
    get rozmiar() {
      return wpisy.size;
    },
  };
}

/** Klucz limitu dla adresu klienta: IPv4 bez zmian (także zapisany jako ::ffff:1.2.3.4), IPv6 jako sieć /64, bo
    jedno łącze dostaje zwykle całą /64 i mogłoby zmieniać adres przy każdej próbie. */
export function kluczIp(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(':')) return ip;
  const bez = ip.split('%')[0].toLowerCase();
  const [lewa, prawa] = bez.split('::');
  const l = lewa ? lewa.split(':') : [];
  const p = prawa !== undefined && prawa !== '' ? prawa.split(':') : [];
  const zera = prawa !== undefined ? Array(Math.max(0, 8 - l.length - p.length)).fill('0') : [];
  const pelny = [...l, ...zera, ...p];
  return `${pelny
    .slice(0, 4)
    .map((h) => h.replace(/^0+/, '') || '0')
    .join(':')}::/64`;
}

/** Kolejka do drogich obliczeń: najwyżej `naraz` w toku, najwyżej `czeka` w kolejce. Pełna kolejka to odmowa
    (zadanie dostaje błąd PelnaKolejka), żeby zalew logowań nie zajął wszystkich wątków (scrypt i gzip dzielą pulę
    wątków libuv) i nie trzymał w pamięci tysięcy czekających żądań. */
export class PelnaKolejka extends Error {}

export interface Kolejka {
  przez<T>(zadanie: () => Promise<T>): Promise<T>;
  readonly wToku: number;
  readonly czekajacych: number;
}

export function kolejka(naraz: number, czeka: number): Kolejka {
  let wToku = 0;
  const czekajace: (() => void)[] = [];
  return {
    async przez(zadanie) {
      if (wToku >= naraz) {
        if (czekajace.length >= czeka) throw new PelnaKolejka('pełna kolejka');
        // miejsce przekazuje kończące zadanie, więc wToku się tu nie zmienia
        await new Promise<void>((ok) => czekajace.push(ok));
      } else wToku++;
      try {
        return await zadanie();
      } finally {
        const nastepne = czekajace.shift();
        if (nastepne) nastepne();
        else wToku--;
      }
    },
    get wToku() {
      return wToku;
    },
    get czekajacych() {
      return czekajace.length;
    },
  };
}
