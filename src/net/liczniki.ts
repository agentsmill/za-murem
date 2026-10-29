/* Liczniki w grze: zdarzenia, które gra wysyła do serwera (POST /api/zdarzenie, ApiGry.zdarzenie), żeby właściciel widział
   sumy na dobę: start gry (tryb, język, telefon albo komputer), kroki ścieżki celów (`cel:<klucz>`) i dzień 2, 3 albo 7.
   Bez sesji, bez identyfikatora gracza i bez tekstu od gracza: nazwy składają się ze stałych słów i kluczy celów z kodu gry,
   a `ZDARZENIE_WZOR` z protokol.ts pilnuje tego po obu stronach.

   Kontrakt:
   - ogień i zapomnij: `wyslij` nic nie zwraca, nie czeka, nie ponawia, a każdy błąd (brak sieci, 429, odrzucona obietnica,
     wyjątek z api) przemilcza; gra nie wie, czy zdarzenie doszło;
   - `wlaczone` fałszywe (sieć wyłączona flagą albo serwer nie odpowiada) albo nazwa spoza wzoru: nic nie wychodzi;
   - w jednej sesji strony każdy `cel:` i każdy `dzien:` idzie najwyżej raz (zestaw wysłanych w pamięci tego obiektu), więc
     ponowne rysowanie okienka celów niczego nie powtarza; `start:` idzie przy każdej nowej grze;
   - funkcje `noweCele`, `zdarzenieStartu` i `progiDni` są czyste, dzięki nim main.ts zostaje cienki. Symulacji nie dotykają:
     czytają tylko stan ścieżki i numer dnia. */

import type { ApiGry } from './api.ts';
import { ZDARZENIE_WZOR } from './protokol.ts';

/** progi dni, które liczymy: pierwszy dzień po starcie, trzeci i tydzień gry */
const PROGI_DNI = [2, 3, 7] as const;

/** Zdarzenia `cel:<klucz>` dla kluczy z `po`, których nie było w `przed` (obie to `StanSciezki.zrobione`). Liczy się obecność
    klucza, nie wartość (tick 0 to też zaliczenie), a klucze z prototypu obiektu nie udają zaliczeń. */
export function noweCele(przed: Record<string, number>, po: Record<string, number>): string[] {
  return Object.keys(po)
    .filter((k) => !Object.hasOwn(przed, k))
    .map((k) => `cel:${k}`);
}

/** Zdarzenie startu nowej gry: `start:<tryb>:<język>:<tel|komp>` (wzór w ZDARZENIE_WZOR) */
export function zdarzenieStartu(tryb: 'zwykly' | 'zombie', jezyk: 'pl' | 'en', telefon: boolean): string {
  return `start:${tryb}:${jezyk}:${telefon ? 'tel' : 'komp'}`;
}

/** Zdarzenia `dzien:N` dla progów (2, 3, 7), które gra przekroczyła między dniem `dzienPrzed` a `dzienPo`, w kolejności
    rosnącej. Przewinięcie kilku dni naraz daje wszystkie przekroczone progi; dzień wstecz albo ten sam nic. */
export function progiDni(dzienPrzed: number, dzienPo: number): string[] {
  return PROGI_DNI.filter((p) => dzienPrzed < p && p <= dzienPo).map((p) => `dzien:${p}`);
}

export interface Liczniki {
  /** wysyła zdarzenie, jeśli liczniki są włączone, nazwa pasuje do wzoru i (dla `cel:` i `dzien:`) nie szła już w tej sesji */
  wyslij(z: string): void;
}

/** Liczniki nad `api.zdarzenie`. `wlaczone` to „sieć włączona flagą i serwer odpowiada” (main.ts bierze to z GraSieciowa);
    fałsz zamienia wszystko w nic. */
export function utworzLiczniki(api: Pick<ApiGry, 'zdarzenie'>, wlaczone: boolean): Liczniki {
  const wyslane = new Set<string>();
  return {
    wyslij(z) {
      if (!wlaczone || !ZDARZENIE_WZOR.test(z)) return;
      // start liczy każdą nową grę; cel i dzień raz na sesję strony, także gdy wysyłka się nie uda (bez ponawiania)
      if (!z.startsWith('start:')) {
        if (wyslane.has(z)) return;
        wyslane.add(z);
      }
      try {
        Promise.resolve(api.zdarzenie(z)).catch(() => {});
      } catch {
        // wyjątek synchroniczny z api: liczniki nigdy nie psują gry
      }
    },
  };
}
