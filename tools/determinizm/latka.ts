/* Łatki funkcji Math do prób wrażliwości gry na różnice między silnikami (MMO, etap 0; wyniki w docs/ocena/
   determinizm-silnikow.md, „Wrażliwość stanu gry na błąd ostatniego bitu”). `zastosujLatke(opis)` podmienia funkcje
   Math w całym procesie i zwraca funkcję przywracającą oryginały; opis ma postać zmiennej ZM_LATKA:
     (puste)                 nic, wynik bazowy
     mat                     hypot, atan2, sin i cos z deterministycznej matematyki (mat-proba.ts)
     hypot-sqrt              hypot jako sqrt sumy kwadratów (samymi działaniami IEEE)
     ulp:<funkcja>[,<f>…]    każdy wynik wskazanych funkcji o jeden bit wyżej (uszkodzenie.ts), jak 1 ulp różnicy
                             między silnikami; funkcje z listy NAGRYWANE
     ulp:wszystkie           to samo dla wszystkich funkcji z listy
   Nieznana wartość to błąd: literówka, która cicho uruchomiłaby próbę bez łatki, dałaby fałszywe „bez zmian”.
   Z botami przez preload: `ZM_LATKA=ulp:hypot node --import ./tools/determinizm/latka-boty.ts tools/bot.ts`. */

import { zainstaluj } from './mat-proba.ts';
import { NAGRYWANE } from './nagrywanie.ts';
import { psuj } from './uszkodzenie.ts';

const UZYCIE = 'mat, hypot-sqrt, ulp:<funkcja>[,<funkcja>…] albo ulp:wszystkie';

export function zastosujLatke(opis: string): () => void {
  if (opis === '') return () => {};
  if (opis === 'mat') return zainstaluj();
  if (opis === 'hypot-sqrt') {
    const oryginal = Math.hypot;
    // odległość z samych działań IEEE: mnożenie, dodawanie, sqrt (jednakowe w każdym silniku)
    Math.hypot = (...a: number[]) => {
      let suma = 0;
      for (const x of a) suma += x * x;
      return Math.sqrt(suma);
    };
    return () => {
      Math.hypot = oryginal;
    };
  }
  if (opis.startsWith('ulp:')) {
    const lista = opis.slice(4) === 'wszystkie' ? [...NAGRYWANE] : opis.slice(4).split(',');
    const nieznane = lista.filter((f) => !(NAGRYWANE as readonly string[]).includes(f));
    if (nieznane.length)
      throw new Error(
        `ZM_LATKA: nieznana funkcja „${nieznane.join('”, „')}” w „${opis}” (są: ${NAGRYWANE.join(', ')}; ${UZYCIE})`,
      );
    const uszkodzenia = lista.map((f) => psuj(f, 1));
    return () => {
      for (const u of uszkodzenia.reverse()) u.przywroc();
    };
  }
  throw new Error(`ZM_LATKA: nieznana wartość „${opis}” (jest: ${UZYCIE})`);
}
