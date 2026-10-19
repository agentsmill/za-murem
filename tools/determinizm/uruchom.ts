/* Wspólne wejście nóg porównania silników (czyste, bez node:* i DOM): strona testowa w przeglądarce, paczka dla jsc
   i proces Node wołają to samo. Dostają zlecenie (zlecenie.ts) i dane dema (geo i ulica z public/demo/<demo>.json),
   liczą przebieg (przebieg.ts) `powtorz` razy z rzędu w tym samym procesie i oddają skróty każdego przebiegu z czasem
   z podanego zegara (każda noga ma własny: performance.now w przeglądarce, jsc i Node). Drugi przebieg w tym samym
   procesie chodzi już po rozgrzaniu kompilatora JIT, więc sprawdza i to, czy skróty nie zależą od poziomu kompilacji
   ani od stanu zostawionego w modułach przez pierwszy przebieg. */

import type { Geo } from '../../src/world/geo.ts';
import { przebieg } from './przebieg.ts';
import type { Zlecenie } from './zlecenie.ts';

export interface DaneDema {
  geo: Geo;
  street?: string;
}

export interface Bieg {
  /** sim.hash() po każdej pełnej godzinie gry */
  skroty: string[];
  /** czas przebiegu w ms według zegara nogi */
  ms: number;
}

export interface WynikNogi {
  biegi: Bieg[];
}

export function uruchom(z: Zlecenie, dane: DaneDema, zegar: () => number): WynikNogi {
  const biegi: Bieg[] = [];
  for (let i = 0; i < z.powtorz; i++) {
    const t0 = zegar();
    const skroty = przebieg({ geo: dane.geo, street: dane.street, seed: z.seed, godziny: z.godziny, tryb: z.tryb });
    biegi.push({ skroty, ms: zegar() - t0 });
  }
  return { biegi };
}
