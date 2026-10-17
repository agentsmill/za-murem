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
  nazwisko: string; // puste do Task 12
  matka?: string;
  ojciec?: string;
  partner?: string;
  stan: 'tu' | 'wyjechal' | 'zmarl';
  dokad?: string; // 'Kraków', 'Niemcy', 'wieś pod miastem'
  dawnyZawod?: string;
  fach?: string; // puste do Task 14
}
export interface Gospodarstwo {
  id: string;
  budynek: string;
  klatka: number;
  czlonkowie: string[];
  odOddania: boolean;
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
}
export interface Osiedle {
  wersja: number;
  rok: number;
  teryt: string;
  budynki: WynikBudynku[];
}
export const WERSJA_GENERATORA = 1;
