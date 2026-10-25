/* Wiki w grze (typy i drobne pomocniki): kategorie, kontekst artykułu (miejsce siedziby, urządzenie, tryb gry),
   kształt artykułu i definicji, z których wiki składa listę. Bez DOM i bez PixiJS, więc działa w Node i w testach.

   Kontrakt.
   - Artykuł (`Artykul`) to tytuł, od dwóch do pięciu krótkich zdań (co to jest i co robi), opcjonalna uwaga, blok faktów
     liczonych z tabel gry (`Fakt`: stały `id` dla testów, etykieta i wartość), kroki „Jak to zrobić” dla myszy albo dotyku
     (`WikiCtx.touch`, tak jak `helpSheet`) i odnośniki „Zobacz też” (identyfikatory innych artykułów).
   - Definicja (`Def`) nie niesie gotowego tekstu: tytuł i treść budują się dopiero przy otwarciu artykułu, w bieżącym
     języku (`L()` z src/core/jezyk.ts), ze słownikiem miejsca z kontekstu (w domu furtka i komitet, w bloku brama i zarząd).
   - Kontekst (`WikiCtx`) bierze miejsce siedziby (`GovPlace`) i z niego oba słowniki (`wordsOf`, `wordsEn`), więc dom i blok
     czytają się inaczej bez osobnych tekstów. Wiki to dokumentacja, nie widok na żywo: kontekst nie niesie stanu gry. */

import type { Tx } from '../core/jezyk.ts';
import { tx } from '../core/jezyk.ts';
import { type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import type { GovPlace } from '../gov/typy.ts';

export type KatId =
  | 'start'
  | 'zasoby'
  | 'budowle'
  | 'badania'
  | 'ludzie'
  | 'praca'
  | 'noc'
  | 'zarzad'
  | 'wydarzenia'
  | 'miasto'
  | 'sasiedzi'
  | 'drogi'
  | 'zombie';

/** kolejność kategorii na liście */
export const KATEGORIE: readonly KatId[] = [
  'start',
  'zasoby',
  'budowle',
  'badania',
  'ludzie',
  'praca',
  'noc',
  'zarzad',
  'wydarzenia',
  'miasto',
  'sasiedzi',
  'drogi',
  'zombie',
];

const NAZWY_KAT: Record<Exclude<KatId, 'zarzad'>, Tx> = {
  start: tx('Pierwsze kroki', 'Getting started'),
  zasoby: tx('Zasoby', 'Resources'),
  budowle: tx('Budowle', 'Buildings'),
  badania: tx('Badania', 'Research'),
  ludzie: tx('Ludzie', 'People'),
  praca: tx('Praca', 'Work'),
  noc: tx('Noc', 'Night'),
  wydarzenia: tx('Wydarzenia', 'Events'),
  miasto: tx('Mapa miasta i wyprawy', 'City map and supply runs'),
  sasiedzi: tx('Sąsiedzi i wspólny płot', 'Neighbours and the shared fence'),
  drogi: tx('Drogi do zwycięstwa', 'Roads to victory'),
  zombie: tx('Tryb zombie', 'Zombie mode'),
};

/** Nazwa kategorii w obu językach. Kategoria o zarządzie nazywa się tak, jak wspólnota w tym miejscu (w bloku „Zarząd”,
    w domu „Komitet ulicy”), bo słownik miejsca decyduje o słowach. */
export function nazwaKategorii(k: KatId, c: WikiCtx): Tx {
  return k === 'zarzad' ? tx(c.words.Zarzad, c.e.Zarzad) : NAZWY_KAT[k];
}

/** Kontekst artykułu: miejsce siedziby i jego słowniki, ekran dotykowy (kroki „Jak to zrobić” mówią „stuknij” zamiast
    „kliknij”) i tryb bieżącej gry (artykuły o trybie zombie przypominają, w którym trybie grasz). */
export interface WikiCtx {
  place: GovPlace;
  words: Words;
  e: WordsEn;
  /** siedziba w domu jednorodzinnym (ulica, komitet, furtka) */
  dom: boolean;
  touch: boolean;
  zombie: boolean;
}

export function wikiCtx(place: GovPlace, touch = false, zombie = false): WikiCtx {
  return { place, words: wordsOf(place), e: wordsEn(place), dom: place.kind === 'dom', touch, zombie };
}

/** Fakt z tabeli gry: `id` to stały klucz (testy porównują wartość ze źródłem), `k` etykieta, `v` wartość (zwykły tekst). */
export interface Fakt {
  id: string;
  k: string;
  v: string;
}

/** przycisk pod tekstem artykułu; `act` obsługuje main.ts (np. otwarcie „Jak grać”) */
export interface Przycisk {
  act: string;
  napis: string;
}

/** Treść artykułu bez tytułu; pola poza `zdania` można pominąć. */
export interface Tresc {
  /** od dwóch do pięciu krótkich zdań, każde jako osobny element */
  zdania: string[];
  /** uwaga pod zdaniami (np. że rzecz dotyczy trybu zombie) */
  uwaga?: string;
  fakty?: Fakt[];
  /** kroki „Jak to zrobić” dla bieżącego urządzenia (mysz albo dotyk) */
  jak?: string[];
  /** identyfikatory artykułów do „Zobacz też” */
  zobacz?: string[];
  przyciski?: Przycisk[];
}

/** Artykuł zbudowany do pokazania w bieżącym języku. */
export interface Artykul {
  id: string;
  kat: KatId;
  tytul: string;
  zdania: string[];
  uwaga?: string;
  fakty: Fakt[];
  jak: string[];
  zobacz: string[];
  przyciski: Przycisk[];
}

/** Definicja artykułu: tytuł i treść powstają leniwie, przy otwarciu (albo przy pierwszym wyszukiwaniu po treści). */
export interface Def {
  id: string;
  kat: KatId;
  tytul: (c: WikiCtx) => string;
  buduj: (c: WikiCtx) => Tresc;
  /** dodatkowe słowa do wyszukiwarki (synonimy, których nie ma w tekście), oba języki naraz */
  slowa?: string;
}

export const def = (
  id: string,
  kat: KatId,
  tytul: (c: WikiCtx) => string,
  buduj: (c: WikiCtx) => Tresc,
  slowa?: string,
): Def => ({ id, kat, tytul, buduj, ...(slowa ? { slowa } : {}) });

/** fakt do bloku faktów */
export const fakt = (id: string, k: string, v: string): Fakt => ({ id, k, v });
