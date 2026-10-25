/* Osada AI bez kodu osady, rozstrzygnięcie 3 kontrolera (etap 2 osady AI, runda poprawek 1 zadania 3). Kod osady (src/ui/osada.ts
   z silnikiem AI) main.ts ładuje przez `import()` dopiero przy `?osada=1`. Gdy to ładowanie się nie uda (sieć, wdrożenie w trakcie
   gry, zablokowany plik), nowa gra z flagą rusza bez osady zamiast się nie uruchomić: `osadaBezKodu` daje zaślepkę `OsadaGry` w stanie
   `brak` z powodem `blad` (taki sam stan jak po błędzie w grze osady, więc trafia do zapisu i tak go czyta `readSave`) i zgłasza
   błąd jednym ostrzeżeniem w konsoli. Gra z zapisu, w którym osada jest, tej zaślepki nie dostaje: bez kodu osady nie da się jej
   wczytać, a pominięcie jej zgubiłoby ją w następnym zapisie, więc main.ts zostawia dotychczasowy komunikat błędu wczytania.
   Moduł jest w głównym pakiecie, więc niczego z silnika AI nie importuje (tylko typy z src/ui/osada.ts, które znikają w kompilacji);
   opis błędu ma tę samą postać co `tekstBledu` z src/ai/gra.ts (nazwa i komunikat w jednym wierszu, do 300 znaków, ze strażą na
   wartość bez napisu), ale własną, krótką kopię. */

import type { OsadaGry, StanOsady } from './osada.ts';

/** ile znaków opisu błędu zostaje w podglądzie (jak `MAX_TEKSTU_BLEDU` w src/ai/gra.ts) */
const MAX_OPISU = 300;

/** Opis błędu w jednym wierszu; sama obsługa błędu nie może rzucić, więc wartość bez napisu dostaje opis zastępczy. */
function opis(e: unknown): string {
  let tekst: string;
  try {
    tekst = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } catch {
    tekst = 'błąd bez opisu';
  }
  tekst = tekst.replace(/\s+/g, ' ').trim();
  return tekst.length > MAX_OPISU ? `${tekst.slice(0, MAX_OPISU)}…` : tekst;
}

/** Zaślepka osady po nieudanym ładowaniu jej kodu: `brak`, powód `blad`, jedno ostrzeżenie w konsoli (z błędem `e`), reszta bez
    skutku. Nowa wartość przy każdym wywołaniu. */
export function osadaBezKodu(e: unknown): OsadaGry {
  console.warn('Osada AI: nie załadował się kod osady, gra idzie dalej bez osady', e);
  const blad = opis(e);
  const zapis = (): StanOsady => ({ v: 1, stan: 'brak', powod: 'blad' });
  return {
    stan: 'brak',
    gra: null,
    swiat: null,
    odkryta: false,
    kontakt: undefined,
    odwolania: 0,
    upadla: null,
    dane() {},
    przygotuj() {},
    przygotujCiezkie() {},
    krok() {},
    odkryj() {},
    dlaZarzadu: () => null,
    zapisz: zapis,
    podglad: () => ({ stan: 'brak', powod: 'blad', blad }),
  };
}
