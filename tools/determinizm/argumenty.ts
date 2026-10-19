/* Argumenty wiersza poleceń bramki determinizmu (tools/determinizm.ts), jako czysta funkcja bez dostępu do plików i
   procesu: `parsujArgumenty(argv, istniejeDemo)` oddaje `Opcje` bramki (bramka.ts) i ścieżkę --json albo rzuca
   `BladArgumentow` z komunikatem dla człowieka (CLI dopisuje do niego UZYCIE i kończy kodem 64). Zła wartość i luźne
   słowo to błąd, ale też flaga z wartością bez wartości (`--godziny`) i flaga logiczna z wartością (`--zombie=1`):
   cicho pominięta flaga zmieniałaby przebieg bramki bez śladu w raporcie. Flaga podana dwa razy też jest błędem. */

import type { Opcje } from './bramka.ts';
import { NAGRYWANE } from './nagrywanie.ts';
import { GODZINY_DOMYSLNE, SEED_DOMYSLNE, type Tryb } from './zlecenie.ts';

export const DEMA = ['przymorze', 'lanciego', 'zielonki'];
export const SILNIKI = ['node', 'node24', 'chromium', 'firefox', 'webkit', 'jsc'];

const Z_WARTOSCIA = ['demo', 'godziny', 'seed', 'silniki', 'json', 'psuj', 'latka'];
const LOGICZNE = ['zombie', 'zwykly', 'bez-swiata'];
/** --nagraj działa bez wartości (nagrywanie przy rozbieżności jest domyślne) i z numerem godziny */
const OBIE_POSTACIE = ['nagraj'];

export const UZYCIE = `Użycie: npm run determinizm [-- --demo=${DEMA.join('|')}] [--godziny=${GODZINY_DOMYSLNE}] [--zombie|--zwykly] [--seed=${SEED_DOMYSLNE},2] [--silniki=${SILNIKI.join(',')}] [--json=plik.json] [--nagraj[=godzina]] [--psuj=silnik:funkcja] [--bez-swiata] [--latka=mat]`;

export class BladArgumentow extends Error {}

export interface Ustawienia {
  opcje: Opcje;
  /** ścieżka pliku na pełne wyniki (--json) */
  json?: string;
}

const NAZWA_DEMA = /^[a-z0-9-]+$/;
const LICZBA = /^\d+$/;

/** `istniejeDemo(nazwa)`: czy jest takie demo w public/demo (CLI sprawdza plik, test podaje listę) */
export function parsujArgumenty(argv: string[], istniejeDemo: (nazwa: string) => boolean): Ustawienia {
  const wartosci = new Map<string, string | true>();
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(a);
    const nazwa = m?.[1];
    if (!m || !nazwa || ![...Z_WARTOSCIA, ...LOGICZNE, ...OBIE_POSTACIE].includes(nazwa))
      throw new BladArgumentow(`Nieznany argument: ${a}`);
    if (wartosci.has(nazwa)) throw new BladArgumentow(`--${nazwa} podany dwa razy`);
    if (m[2] === undefined && Z_WARTOSCIA.includes(nazwa))
      throw new BladArgumentow(`--${nazwa} wymaga wartości (--${nazwa}=…)`);
    if (m[2] !== undefined && LOGICZNE.includes(nazwa))
      throw new BladArgumentow(`--${nazwa} nie przyjmuje wartości, jest „${m[2]}”`);
    wartosci.set(nazwa, m[2] ?? true);
  }
  const wartosc = (nazwa: string): string | undefined => {
    const v = wartosci.get(nazwa);
    return typeof v === 'string' ? v : undefined;
  };
  const jest = (nazwa: string) => wartosci.has(nazwa);

  const godziny = LICZBA.test(wartosc('godziny') ?? String(GODZINY_DOMYSLNE))
    ? Number(wartosc('godziny') ?? GODZINY_DOMYSLNE)
    : Number.NaN;
  if (!Number.isInteger(godziny) || godziny < 1)
    throw new BladArgumentow(`--godziny to liczba całkowita od 1, jest „${wartosc('godziny')}”`);

  const demo = wartosc('demo');
  const dema = demo === undefined ? DEMA : [demo];
  for (const d of dema)
    if (!NAZWA_DEMA.test(d) || !istniejeDemo(d))
      throw new BladArgumentow(`Nieznane demo: „${d}” (są: ${DEMA.join(', ')})`);

  const ziarnaTekst = (wartosc('seed') ?? String(SEED_DOMYSLNE)).split(',');
  if (ziarnaTekst.some((s) => !LICZBA.test(s)))
    throw new BladArgumentow(`--seed to liczby całkowite od 0 po przecinku, jest „${wartosc('seed')}”`);
  const ziarna = ziarnaTekst.map(Number);

  const tryby: Tryb[] =
    jest('zombie') !== jest('zwykly') ? [jest('zombie') ? 'zombie' : 'zwykly'] : ['zwykly', 'zombie'];

  const filtr = wartosc('silniki')?.split(',');
  for (const id of filtr ?? [])
    if (!SILNIKI.includes(id)) throw new BladArgumentow(`Nieznany silnik: „${id}” (są: ${SILNIKI.join(', ')})`);

  const nagraj = wartosc('nagraj');
  const wymuszonaGodzina = nagraj === undefined ? null : LICZBA.test(nagraj) ? Number(nagraj) : Number.NaN;
  if (wymuszonaGodzina !== null && !(wymuszonaGodzina >= 0 && wymuszonaGodzina < godziny))
    throw new BladArgumentow(`--nagraj=godzina to liczba całkowita od 0 do ${godziny - 1}, jest „${nagraj}”`);

  const latkaTekst = wartosc('latka');
  if (latkaTekst !== undefined && latkaTekst !== 'mat')
    throw new BladArgumentow(`--latka to mat, jest „${latkaTekst}”`);

  const psujTekst = wartosc('psuj');
  let psuj: Opcje['psuj'];
  if (psujTekst !== undefined) {
    const [silnik, funkcja, ...reszta] = psujTekst.split(':');
    if (reszta.length || !SILNIKI.includes(silnik) || !(NAGRYWANE as readonly string[]).includes(funkcja))
      throw new BladArgumentow(`--psuj=silnik:funkcja, jest „${psujTekst}” (funkcje: ${NAGRYWANE.join(', ')})`);
    psuj = { silnik, funkcja };
  }

  const opcje: Opcje = { godziny, dema, tryby, ziarna, wymuszonaGodzina, bezSwiata: jest('bez-swiata') };
  if (filtr) opcje.filtr = filtr;
  if (psuj) opcje.psuj = psuj;
  if (latkaTekst === 'mat') opcje.latka = 'mat';
  return { opcje, ...(wartosc('json') === undefined ? {} : { json: wartosc('json') }) };
}
