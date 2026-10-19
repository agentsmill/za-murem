/* Pamięć znaczka NOWE w menu budowy (docs/superpowers/specs/2026-10-19-badania-design.md, sekcja „Odkrycie”): które
   budowle z odkrytych technologii gracz już widział (postawił albo otworzył ich szczegóły). To stan interfejsu, nie
   symulacji: leży w localStorage przeglądarki pod kluczem gry i nie trafia do `SimState` ani do zapisu gry. Klucz gry
   składa main.ts z adresu i ziarna; nowa gra zaczyna od pustej pamięci (`zapomnijWidziane`), wznowiona czyta swoją.
   Kontrakt: każda funkcja działa bez wyjątku także wtedy, gdy przeglądarka nie daje dostępu do pamięci (tryb prywatny,
   zablokowane dane witryny, podgląd miniatur): wtedy nic się nie zapisuje, a odczyt to pusty zbiór. Uszkodzony JSON,
   zły kształt i nieznane rodzaje budowli to brak wpisu. Czyste poza samym magazynem, który można podstawić w testach. */

import { BUILDS } from '../sim/budowle.ts';

export const NOWE_KEY = 'za-murem-0.4-nowe';

/** to, czego potrzeba z localStorage (atrapa w testach); null: brak pamięci */
export type Magazyn = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function magazyn(mag?: Magazyn | null): Magazyn | null {
  if (mag !== undefined) return mag;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const obiekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** cała pamięć: gry (klucze) z listami widzianych rodzajów; uszkodzona albo niedostępna to pusto */
function wszystkie(m: Magazyn): Record<string, unknown> {
  try {
    const raw = m.getItem(NOWE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return obiekt(v) ? v : {};
  } catch {
    return {};
  }
}

/** Rodzaje budowli, które gracz w tej grze już widział. Bez pamięci, bez wpisu albo z uszkodzonym: pusty zbiór. */
export function wczytajWidziane(gra: string, mag?: Magazyn | null): Set<string> {
  const m = magazyn(mag);
  const wynik = new Set<string>();
  if (!m || gra === '__proto__') return wynik;
  const lista = wszystkie(m)[gra];
  if (Array.isArray(lista)) for (const k of lista) if (typeof k === 'string' && Object.hasOwn(BUILDS, k)) wynik.add(k);
  return wynik;
}

/** Zapisuje, co gracz w tej grze już widział; pusty zbiór usuwa wpis gry (a pusta pamięć znika razem z kluczem).
    Obce wpisy innych gier zostają. Przeglądarka bez dostępu do pamięci: nic, bez wyjątku. */
export function zapiszWidziane(gra: string, widziane: ReadonlySet<string>, mag?: Magazyn | null): void {
  const m = magazyn(mag);
  if (!m || gra === '__proto__') return;
  try {
    const gry = wszystkie(m);
    if (widziane.size) gry[gra] = [...widziane].sort();
    else delete gry[gra];
    if (Object.keys(gry).length) m.setItem(NOWE_KEY, JSON.stringify(gry));
    else m.removeItem(NOWE_KEY);
  } catch {
    // pamięć niedostępna albo pełna: znaczek NOWE wróci po ponownym otwarciu gry, nic poza tym
  }
}

/** Nowa gra zaczyna bez widzianych budowli: kasuje wpis tej gry (poprzednia gra pod tym samym adresem i ziarnem). */
export function zapomnijWidziane(gra: string, mag?: Magazyn | null): void {
  zapiszWidziane(gra, new Set(), mag);
}
