/* Wspólne wejście nóg porównania silników (czyste, bez node:* i DOM): strona testowa w przeglądarce, paczka dla jsc
   i proces Node wołają to samo. Dostają zlecenie (zlecenie.ts) i dane dema (geo i ulica z public/demo/<demo>.json),
   liczą przebieg (przebieg.ts) `powtorz` razy z rzędu w tym samym procesie i oddają skróty każdego przebiegu z czasem
   z podanego zegara (każda noga ma własny: performance.now w przeglądarce, jsc i Node). Drugi przebieg w tym samym
   procesie chodzi już po rozgrzaniu kompilatora JIT, więc sprawdza i to, czy skróty nie zależą od poziomu kompilacji
   ani od stanu zostawionego w modułach przez pierwszy przebieg. */

import type { Geo } from '../../src/world/geo.ts';
import { nagrywaj, type WywolanieJson, zakodujWywolania } from './nagrywanie.ts';
import { czesciSwiata, graj, skrotSwiata } from './przebieg.ts';
import { psuj } from './uszkodzenie.ts';
import type { Zlecenie } from './zlecenie.ts';

export interface DaneDema {
  geo: Geo;
  street?: string;
}

export interface Bieg {
  /** sim.hash() po każdej pełnej godzinie gry */
  skroty: string[];
  /** skrót świata zaraz po zbudowaniu (skrotSwiata): stan gry go nie obejmuje, a świat musi być u wszystkich ten sam */
  swiat: string;
  /** skróty części świata (czesciSwiata): co się rozjechało, gdy skróty świata się różnią */
  swiatCzesci: Record<string, string>;
  /** czas przebiegu w ms według zegara nogi */
  ms: number;
  /** nagranie wywołań Math w przedziale kroków ze zlecenia (tylko pierwszy przebieg), gotowe do JSON */
  nagranie?: WywolanieJson[];
  /** stos wywołania `nagraj.stosPrzy` (w Node z plikiem i linią) */
  stos?: string;
  /** tablice kafelków świata (tylko pierwszy przebieg i tylko na życzenie: zlecenie.kafelki) */
  kafelki?: { size: number; terr: number[]; bid: number[]; blocked: number[] };
}

export interface WynikNogi {
  biegi: Bieg[];
}

export function uruchom(z: Zlecenie, dane: DaneDema, zegar: () => number): WynikNogi {
  const biegi: Bieg[] = [];
  const uszkodzenie = z.psuj ? psuj(z.psuj) : null;
  try {
    for (let i = 0; i < z.powtorz; i++) {
      uszkodzenie?.zeruj();
      const nagrywanie =
        i === 0 && z.nagraj ? nagrywaj(z.nagraj.od, z.nagraj.do, { stosPrzy: z.nagraj.stosPrzy }) : null;
      const t0 = zegar();
      const gra = graj(
        { geo: dane.geo, street: dane.street, seed: z.seed, godziny: z.godziny, tryb: z.tryb },
        nagrywanie ? { krok: nagrywanie.krok } : {},
      );
      const bieg: Bieg = {
        skroty: gra.skroty,
        swiat: skrotSwiata(gra.swiat),
        swiatCzesci: czesciSwiata(gra.swiat),
        ms: zegar() - t0,
      };
      if (i === 0 && z.kafelki)
        bieg.kafelki = {
          size: gra.swiat.size,
          terr: Array.from(gra.swiat.terr),
          bid: Array.from(gra.swiat.bid),
          blocked: Array.from(gra.swiat.blocked),
        };
      if (nagrywanie) {
        bieg.nagranie = zakodujWywolania(nagrywanie.zatrzymaj());
        const stos = nagrywanie.stos();
        if (stos) bieg.stos = stos;
      }
      biegi.push(bieg);
    }
  } finally {
    uszkodzenie?.przywroc();
  }
  return { biegi };
}
