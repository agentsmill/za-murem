/* Wspólne pomocniki testów silnika osady AI (tests/unit/ai-*.test.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md): tick danego dnia gry, rzecz do dołożenia do stanu gry i ręce-szpieg,
   które tylko zapisują ruchy decydenta. Testy zimy, jedzenia i rozwoju miały po własnej kopii każdego z nich; tu jest jedna,
   a szpieg zapisuje wszystko naraz (ruchy jako tekst, polecenia gry, wyprawy i uchwały), żeby każdy test brał to, co mu trzeba.
   Plik nie jest testem (nazwa bez `.test`) i niczego nie sprawdza. */

import type { GraAi, Rece } from '../../src/ai/gra.ts';
import type { Cel } from '../../src/gov/wyprawy.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import type { Command, Thing } from '../../src/sim/sim.ts';

/** tick danego dnia gry o pełnej godzinie (gra zaczyna się o 15:00 dnia 1; godzina przed 15:00 to ten sam dzień) */
export const tickDnia = (dzien: number, godzina: number): number =>
  (dzien - 1) * TICKS_PER_DAY + (godzina - 15) * TICKS_PER_HOUR;

/** rzecz z gry (do dokładania w testach: drewno, jedzenie, sterty) */
export function rzecz(g: GraAi, kind: string, x: number, y: number, n = 0): Thing {
  return { id: g.sim.st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 };
}

/** Ruchy ręki-szpiega: co zrobił decydent, w kilku widokach naraz. */
export interface Szpieg {
  r: Rece;
  /** wszystkie ruchy po kolei jako tekst: `polecenie:{json}`, `raport`, `uchwala:id`, `noc:osoba=klucz`, `zatwierdz`,
      `wydarzenie:k`, `dalej`, `wyprawa` */
  ruchy: string[];
  /** polecenia gry po kolei (`Rece.polecenie`) */
  polecenia: Command[];
  /** wyprawy wysłane ręką `wyslij` (zawsze się udają) */
  wyslano: { cel: Cel; ids: string[] }[];
  /** uchwały podpisane ręką `podpisz` (null: zarząd nic nie uchwala) */
  uchwaly: (string | null)[];
}

/** Ręce, które tylko zapisują ruchy. Przydział odmawia, gdy klucz jest na liście `odmow` (reszta się udaje), wyprawa zawsze
    się udaje. */
export function szpieg(odmow: readonly string[] = []): Szpieg {
  const ruchy: string[] = [];
  const polecenia: Command[] = [];
  const wyslano: Szpieg['wyslano'] = [];
  const uchwaly: (string | null)[] = [];
  const r: Rece = {
    polecenie: (c) => {
      polecenia.push(structuredClone(c));
      ruchy.push(`polecenie:${JSON.stringify(c)}`);
    },
    potwierdzRaport: () => ruchy.push('raport'),
    podpisz: (id) => {
      uchwaly.push(id);
      ruchy.push(`uchwala:${id}`);
    },
    przydziel: (osoba, klucz) => {
      if (odmow.includes(klucz)) return false;
      ruchy.push(`noc:${osoba}=${klucz}`);
      return true;
    },
    zatwierdzNoc: () => ruchy.push('zatwierdz'),
    wybierz: (k) => ruchy.push(`wydarzenie:${k}`),
    grajDalej: () => ruchy.push('dalej'),
    wyslij: (cel, ids) => {
      wyslano.push({ cel, ids });
      ruchy.push('wyprawa');
      return true;
    },
  };
  return { r, ruchy, polecenia, wyslano, uchwaly };
}
