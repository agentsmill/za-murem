/* Zlecenie dla nogi silnika (czyste, bez node:* i DOM): co policzyć i ile razy. To samo zlecenie idzie do każdej nogi
   porównania w tools/determinizm.ts jako parametry tekstowe: argumenty procesu Node (--demo=przymorze ...), zapytanie
   strony testowej (?demo=przymorze&...) albo globalna ZLECENIE w paczce dla jsc. Geo dema nie jest częścią zlecenia:
   noga bierze je z public/demo/<demo>.json (strona przez fetch, Node z pliku), a jsc dostaje je wstawione do pliku. */

import { NAGRYWANE } from './nagrywanie.ts';
import type { DanePrzebiegu } from './przebieg.ts';

export type Tryb = DanePrzebiegu['tryb'];

export interface Zlecenie {
  /** klucz dema z public/demo (przymorze, lanciego, zielonki) */
  demo: string;
  godziny: number;
  tryb: Tryb;
  seed: number;
  /** ile razy z rzędu w tym samym procesie liczyć ten sam przebieg (powtarzalność w obrębie silnika) */
  powtorz: number;
  /** nagrywanie wywołań Math w krokach [od, do) pierwszego przebiegu (od −1: już od budowy świata); stosPrzy: numer
      nagranego wywołania, którego stos ma wrócić (tylko tam, gdzie stos wskazuje plik i linię, czyli w Node) */
  nagraj?: { od: number; do: number; stosPrzy?: number };
  /** samotest bramki: nazwa funkcji Math, której każdy wynik ta noga zwiększa o jeden bit (uszkodzenie.ts) */
  psuj?: string;
}

export const SEED_DOMYSLNE = 12345;
export const GODZINY_DOMYSLNE = 24;

/** zlecenie jako płaska mapa tekstów (argumenty procesu albo zapytanie strony) */
export function doParametrow(z: Zlecenie): Record<string, string> {
  const p: Record<string, string> = {
    demo: z.demo,
    godziny: String(z.godziny),
    tryb: z.tryb,
    seed: String(z.seed),
    powtorz: String(z.powtorz),
  };
  if (z.nagraj)
    p.nagraj = [z.nagraj.od, z.nagraj.do, ...(z.nagraj.stosPrzy === undefined ? [] : [z.nagraj.stosPrzy])].join(':');
  if (z.psuj) p.psuj = z.psuj;
  return p;
}

const liczba = (nazwa: string, v: string, min: number): number => {
  const n = Number(v);
  if (v === '' || !Number.isInteger(n) || n < min)
    throw new Error(`Zlecenie: ${nazwa} to liczba całkowita od ${min}, jest „${v}”`);
  return n;
};

/** odwrotność doParametrow; brakujące pola dostają wartości domyślne, złe są odrzucone błędem */
export function zParametrow(czytaj: (klucz: string) => string | null | undefined): Zlecenie {
  const demo = czytaj('demo') ?? 'przymorze';
  if (!/^[a-z0-9-]+$/.test(demo)) throw new Error(`Zlecenie: demo to nazwa z liter, cyfr i myślników, jest „${demo}”`);
  const tryb = czytaj('tryb') ?? 'zwykly';
  if (tryb !== 'zwykly' && tryb !== 'zombie') throw new Error(`Zlecenie: tryb to zwykly albo zombie, jest „${tryb}”`);
  const z: Zlecenie = {
    demo,
    godziny: liczba('godziny', czytaj('godziny') ?? String(GODZINY_DOMYSLNE), 1),
    tryb,
    seed: liczba('seed', czytaj('seed') ?? String(SEED_DOMYSLNE), 0),
    powtorz: liczba('powtorz', czytaj('powtorz') ?? '1', 1),
  };
  const nagraj = czytaj('nagraj');
  if (nagraj) {
    const [od, do_, stos, ...reszta] = nagraj.split(':');
    if (od === undefined || do_ === undefined || reszta.length)
      throw new Error(`Zlecenie: nagraj to od:do albo od:do:stos, jest „${nagraj}”`);
    z.nagraj = { od: liczba('nagraj od', od, -1), do: liczba('nagraj do', do_, 0) };
    if (stos !== undefined) z.nagraj.stosPrzy = liczba('nagraj stos', stos, 0);
  }
  const psuj = czytaj('psuj');
  if (psuj) {
    if (!(NAGRYWANE as readonly string[]).includes(psuj))
      throw new Error(`Zlecenie: psuj to jedna z funkcji ${NAGRYWANE.join(', ')}, jest „${psuj}”`);
    z.psuj = psuj;
  }
  return z;
}
