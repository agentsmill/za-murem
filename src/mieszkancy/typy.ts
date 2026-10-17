/* Typy wspólne dla generatora mieszkańców: osoby, gospodarstwa, budynki i wynik osiedla. Sam plik nic nie liczy. */

import type { Epoka } from './tabele.ts';

export type Plec = 'M' | 'K';
export type TypWpisu =
  | 'przydzial'
  | 'wprowadzka'
  | 'urodzenie'
  | 'zgon'
  | 'wyprowadzka'
  | 'emigracja'
  | 'powrot'
  | 'powrotOpieka'
  | 'zwiazek'
  | 'owdowienie'
  | 'opuszczone';
export interface Wpis {
  rok: number;
  typ: TypWpisu;
  kto: string;
  z?: string;
  dokad?: string;
}
export interface Osoba {
  id: string;
  plec: Plec;
  rocznik: number;
  imie: string;
  nazwisko: string; // imię i nazwisko puste, dopóki generator nie dostanie tabel nazw (imiona.ts)
  matka?: string;
  ojciec?: string;
  partner?: string;
  stan: 'tu' | 'wyjechal' | 'zmarl';
  dokad?: string; // 'Kraków', 'Niemcy', 'wieś pod miastem'
  /** Zawód sprzed upadku w formie płci osoby (tylko urodzeni do 2009; linijka historii i satyra), fachy.ts. */
  dawnyZawod?: string;
  /** Stabilne id fachu na 2051 (`IdFachu` z fachy.ts, np. 'felczer'; tylko obecni od 16 lat). Typ zostaje `string`:
      zawężenie do `IdFachu` wymagałoby importu typu z fachy.ts, który sam importuje typy stąd (cykl typów), a
      wartość i tak sprawdza `fachOsoby`. Nazwę w formie płci daje `nazwaFachu`, umiejętności `fachOsoby`. */
  fach?: string;
}
export interface Gospodarstwo {
  id: string;
  budynek: string;
  klatka: number;
  czlonkowie: string[];
  odOddania: boolean;
  /** Dwa, trzy zdania historii (historie.ts, R9). Tylko w wyniku generatora z tabelami odmiany i kroniką obszaru (R49). */
  historia?: string[];
}
export interface Budynek {
  klucz: string;
  lat: number;
  lon: number;
  rejon: string;
  typ: 'dom' | 'blok';
  kondygnacje: number;
  pole: number;
  szerokosc: number;
  dlugosc: number;
  klatki: number;
  startDate?: number;
  epoka?: Epoka;
  mieszkania?: number;
}
export interface WynikBudynku {
  budynek: Budynek;
  osoby: Osoba[];
  gospodarstwa: Gospodarstwo[];
  dziennik: Wpis[];
  puste: number;
  /** Rok stanu po `postarz` w czas.ts (2026 albo 2051). Spis 2021 go nie ustawia. */
  rok?: number;
}
export interface Osiedle {
  wersja: number;
  rok: number;
  teryt: string;
  budynki: WynikBudynku[];
}
export const WERSJA_GENERATORA = 1;
