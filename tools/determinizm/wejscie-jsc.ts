/* Wejście paczki dla systemowego jsc z macOS (JavaScriptCore bez przeglądarki): tools/determinizm.ts buduje z tego
   pliku jeden moduł ES (Vite w trybie biblioteki) i uruchamia `jsc dane.mjs paczka.mjs`, gdzie dane.mjs ustawia globalne
   ZLECENIE (zlecenie.ts) i DANE (geo i ulica dema). Wynik to jedna linia JSON na standardowym wyjściu. jsc nie ma
   `console`, więc ostrzeżenia z symulacji (rzadkie gałęzie) idą w próżnię zamiast rzucać ReferenceError. Z globalną
   KONTROLA (nagranie wywołań Math z innego silnika) zamiast przebiegu wypisuje spis różnic (sprawdzNagranie). */

import { odkodujWywolania, sprawdzNagranie, type WywolanieJson } from './nagrywanie.ts';
import { type DaneDema, uruchom } from './uruchom.ts';
import type { Zlecenie } from './zlecenie.ts';

declare function print(tekst: string): void;

const g = globalThis as unknown as {
  ZLECENIE: Zlecenie;
  DANE: DaneDema;
  KONTROLA?: WywolanieJson[];
  console?: unknown;
};
if (typeof g.console === 'undefined') {
  const nic = () => {};
  g.console = { log: nic, info: nic, warn: nic, error: nic, debug: nic };
}

if (g.KONTROLA) print(JSON.stringify(sprawdzNagranie(odkodujWywolania(g.KONTROLA))));
else {
  const wynik = uruchom(g.ZLECENIE, g.DANE, () => performance.now());
  print(JSON.stringify({ ...wynik, agent: 'jsc' }));
}
