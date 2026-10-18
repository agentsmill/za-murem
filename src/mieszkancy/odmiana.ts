/* Odmiana imion i nazwisk przez siedem przypadków liczby pojedynczej (mianownik, dopełniacz, celownik, biernik,
   narzędnik, miejscownik, wołacz), żeby teksty historii mówiły „mieszka z Haliną”, „u Marka”, „pani Halino!”.
   Moduł działa w przeglądarce i w Node, nie importuje niczego z Node i nie losuje, więc ten sam napis daje te same
   formy wszędzie. Bez trygonometrii, potęg i logarytmów.

   Trzy źródła form, od najpewniejszego:
   1. słownik (`TabelaOdmiany`, plik odmiana.json): pełne paradygmaty z SGJP dla imion z tabel imion i nazwisk z tabel
      nazwisk. Trafienie jest zawsze pewne;
   2. reguły (`zgadnijReguly`, `zgadnijNazwiskoReguly`): zakończenie i płeć, port reguł z badań (pierwsza wersja
      95,4% pełnych paradygmatów imion SGJP, z krótkimi listami wyjątków 97,8%, nazwiska 98%);
   3. końcówki (`zgadnijKoncowkami`, `TabelaKoncowek`, plik odmiana-koncowki.json): najdłuższy pasujący sufiks z wzorcem
      odmiany, uczony na imionach i nazwiskach SGJP.
   Gdy słownika brak, `zgadnijImie` odmienia regułami, a `pewne` mówi, czy końcówki dały ten sam pełny paradygmat
   (wtedy błąd jest rzadki); gdy się różnią, wynik reguł jest do sprawdzenia przez gracza. Imię złożone („Anna-Maria”,
   „Jan Paweł”) odmienia się człon po członie. Żadna funkcja nie rzuca: napis, którego nie da się odmienić (cyfry,
   znaki spoza liter), wraca w siedmiu jednakowych formach z `pewne: false`.

   Wołacz: gdy SGJP ma dwa równorzędne (Majo, Maju), słownik bierze pierwszy w kolejności znaków. Formy z kwalifikatorem
   „pot.” i „niepopr.” (Huga, Hugo zamiast Hugona) nie wchodzą ani do słownika, ani do wzorców końcówek.

   Plik odmiana.json jest skompresowany, bo siedem form dla ponad 2 000 nazwisk w męskiej i żeńskiej odmianie zajęłoby
   pół megabajta: `OdmianaPlik` trzyma wzorce odmiany jako napisy, a `rozpakujOdmiane` składa z nich `TabelaOdmiany`.
   Gra czyta plik przez `wczytajOdmiane` (wczytaj.ts), która rozpakowuje od razu. */

import type { Plec } from './typy.ts';

export type Przypadek = 'mian' | 'dop' | 'cel' | 'bier' | 'narz' | 'msc' | 'wol';
export type Formy = Record<Przypadek, string>;
/** `mnoga` to mianownik liczby mnogiej dla „państwo X”: Kowalscy, Nowakowie, Wróblowie. */
export interface FormyNazwiska {
  m: Formy;
  k: Formy;
  mnoga: string;
}

/** Odmiana ze słownika SGJP. Klucz imion to mianownik, a nazwisk forma męska. Obiekty z tabeli są wspólne dla
    wszystkich wywołań, więc nie zmieniaj zwróconych form. */
export interface TabelaOdmiany {
  wersja: number;
  imiona: Record<string, { M?: Formy; K?: Formy }>;
  nazwiska: Record<string, FormyNazwiska>;
}

/** Tablica końcówek uczona na SGJP. Forma w danym przypadku to mianownik bez `ucinek` ostatnich znaków plus końcówka;
    `koncowki.mian` zostaje puste (mianownik to wejście). `sufiks` jest małymi literami; sufiks zaczynający się od
    gwiazdki (`*ski`) dotyczy nazwisk (męskich dla `plec: 'M'`, żeńskich dla `'K'`), bez gwiazdki imion. */
export interface TabelaKoncowek {
  wersja: number;
  wzorce: { sufiks: string; plec: Plec; ucinek: number; koncowki: Record<Przypadek, string> }[];
}
export type WzorzecKoncowek = TabelaKoncowek['wzorce'][number];

/** Siedem przypadków w kolejności tabel SGJP: M., D., C., B., N., Ms., W. */
export const PRZYPADKI: readonly Przypadek[] = ['mian', 'dop', 'cel', 'bier', 'narz', 'msc', 'wol'];

// ---------------------------------------------------------------- pomocnicze

const SAMOGLOSKI = 'aąeęioóuyáàâäãåéèêëíìîïòôöõúùûüýÿ';
const samogloska = (c: string | undefined): boolean => c !== undefined && c !== '' && SAMOGLOSKI.includes(c);
/** Litera `od` od końca (1 = ostatnia), albo pusty napis, gdy napis jest krótszy. */
const odKonca = (s: string, od = 1): string => s[s.length - od] ?? '';

const naFormy = (a: readonly string[]): Formy => ({
  mian: a[0],
  dop: a[1],
  cel: a[2],
  bier: a[3],
  narz: a[4],
  msc: a[5],
  wol: a[6],
});
const nieodm = (n: string): string[] => [n, n, n, n, n, n, n];

/** Napis wejściowy: bez brzegowych spacji, z pojedynczymi spacjami, a gdy jest cały małymi albo cały wielkimi literami
    („halina”, „KOWALSKI”), z wielką literą na początku członów. Mieszana wielkość liter zostaje, bo może być celowa
    (McDonald, DiCaprio). */
export function normalizuj(s: string): string {
  const t = String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|[- ])(\p{L})/gu, (_, przed: string, litera: string) => przed + litera.toUpperCase());
}

const CZLON = /^\p{L}[\p{L}'’]*$/u;

/** Odmienia człon po członie (podziały: myślnik i spacja) funkcją `f`, a człony skleja tak, jak były. `null`, gdy
    któryś człon nie składa się z liter albo `f` nie umie go odmienić. */
function poCzlonach(napis: string, f: (czlon: string) => string[] | null): string[] | null {
  const kawalki = napis.split(/([- ])/);
  const wyniki: string[][] = [];
  for (let i = 0; i < kawalki.length; i += 2) {
    if (!CZLON.test(kawalki[i])) return null;
    const w = f(kawalki[i]);
    if (!w) return null;
    wyniki.push(w);
  }
  return PRZYPADKI.map((_, p) => {
    let s = '';
    for (let i = 0; i < wyniki.length; i++) s += (i > 0 ? kawalki[2 * i - 1] : '') + wyniki[i][p];
    return s;
  });
}

// ---------------------------------------------------------------- reguły: imiona

/** Spółgłoski, po których miejscownik i wołacz męski ma -u (twarde tylnojęzykowe i funkcjonalnie miękkie). */
const U_KONC = ['k', 'g', 'ch', 'h', 'sz', 'cz', 'rz', 'ż', 'c', 'dz', 'dż', 'l', 'j', 'i', 'x'];
/** Wymiana końcowej spółgłoski przed -e (miejscownik rzeczowników męskich, celownik i miejscownik żeńskich na -a). */
const WYMIANY: [string, string][] = [
  ['st', 'ście'],
  ['zd', 'ździe'],
  ['sł', 'śle'],
  ['sn', 'śnie'],
  ['zn', 'źnie'],
  ['t', 'cie'],
  ['d', 'dzie'],
  ['r', 'rze'],
  ['ł', 'le'],
  ['k', 'ce'],
  ['g', 'dze'],
  ['ch', 'sze'],
];
/** Końcowe ś, ć, ź, ń przed samogłoską: Staś → Stasi-. */
const MIEKKIE_ZNAK: Record<string, string> = { ś: 'si', ć: 'ci', ź: 'zi', ń: 'ni' };
/** Zmiękczenie przed -k po usunięciu ruchomego e: Wiesiek → Wieśk-. */
const MIEKKIE_SI: [string, string][] = [
  ['dzi', 'dź'],
  ['si', 'ś'],
  ['ci', 'ć'],
  ['zi', 'ź'],
  ['ni', 'ń'],
];
/** Krótkie listy wyjątków od reguł, dobrane na imionach SGJP (nazwy z wielkiej litery, w pozostałych list małymi). */
const Z_E_RUCHOMYM_ER = new Set([
  'Aleksander',
  'Alexander',
  'Kacper',
  'Kasper',
  'Casper',
  'Leander',
  'Sewer',
  'Sylwester',
  'Lew',
]);
/** Imiona żeńskie na -nia z dopełniaczem -nii (Stefanii), reszta ma -ni (Ani). */
const NII = new Set([
  'Stefania',
  'Eugenia',
  'Melania',
  'Apolonia',
  'Leonia',
  'Antonia',
  'Sydonia',
  'Wirginia',
  'Ifigenia',
  'Epifania',
  'Herminia',
  'Milenia',
  'Petronia',
  'Polihymnia',
]);
/** Imiona męskie na -o, które w przypadkach zależnych dostają -n-: Bruno → Brunona. */
const PLUS_N = new Set(['Bruno', 'Cycero', 'Gwido', 'Hugo', 'Iwo', 'Kato', 'Otto', 'Plato']);
/** Imiona męskie na -e odmieniane jak przymiotniki: Noe → Noego. */
const PRZYM_E = new Set(['Rene', 'Noe', 'Jozue', 'Charlie', 'Freddie', 'Stevie', 'Mojsze']);

/** Rdzeń z końcówką -ie, ze zmianą spółgłoski przed nią: Marta → Marcie, Magda → Magdzie, Ewa → Ewie. */
function przedE(rdzen: string): string {
  const lo = rdzen.toLowerCase();
  for (const [koniec, zamiast] of WYMIANY) {
    if (lo.endsWith(koniec)) return rdzen.slice(0, rdzen.length - koniec.length) + zamiast;
  }
  return `${rdzen}ie`;
}

/** Rzeczowniki na -a, żeńskie i męskie typu Kuba. */
function odmA(n: string): string[] {
  const t = n.slice(0, -1);
  const lo = t.toLowerCase();
  if (lo === '') return nieodm(n);
  if (lo.endsWith('i') && lo.length >= 2 && !samogloska(odKonca(lo, 2))) {
    // -ia: po n, s, z, c miękko (Ania → Ani, Aniu), inaczej Natalii, Natalio
    const miekkie = /[nszc]$/.test(lo.slice(0, -1)) && !NII.has(n);
    const d = miekkie ? t : `${t}i`;
    return [n, d, d, `${t}ę`, `${t}ą`, d, `${t}${miekkie ? 'u' : 'o'}`];
  }
  if (lo.endsWith('i')) return [n, t, t, `${t}ę`, `${t}ą`, t, `${t}o`]; // samogłoska + ia: Mariia → Marii, Mariio
  if (lo.endsWith('e') || lo.endsWith('o')) return [n, `${t}i`, `${t}i`, `${t}ę`, `${t}ą`, `${t}i`, `${t}o`]; // Lea
  if (lo.endsWith('j') || lo.endsWith('y')) {
    // Maja → Mai, Alicja → Alicji; zapis z y jak z j: Maya → Mai, Yuliya → Yulii
    const d = samogloska(odKonca(lo, 2)) ? `${t.slice(0, -1)}i` : `${t}i`;
    return [n, d, d, `${t}ę`, `${t}ą`, d, `${t}o`];
  }
  if (lo.endsWith('l')) {
    const d = `${t}i`;
    const krotkie = n.length <= 4 && !lo.endsWith('ll'); // Olu, Alu, ale Urszulo, Allo, Ello
    return [n, d, d, `${t}ę`, `${t}ą`, d, `${t}${krotkie ? 'u' : 'o'}`];
  }
  if (lo.endsWith('k') || lo.endsWith('g')) {
    const c = przedE(t);
    return [n, `${t}i`, c, `${t}ę`, `${t}ą`, c, `${t}o`];
  }
  if (/(cz|sz|rz|ż|c|dz|dż)$/.test(lo)) {
    const d = `${t}y`;
    return [n, d, d, `${t}ę`, `${t}ą`, d, `${t}o`];
  }
  const c = przedE(t);
  return [n, `${t}y`, c, `${t}ę`, `${t}ą`, c, `${t}o`];
}

/** Rzeczowniki męskie zakończone spółgłoską. `obl` to temat przypadków zależnych, `wol` wołacz (domyślnie jak
    miejscownik). Bez `obl` temat wynika z ruchomego e (Marek → Mark-), -eł (Paweł → Pawł-), -niec (Wawrzyniec →
    Wawrzyńc-), ó przed ostatnią spółgłoską w imionach staropolskich i miękkiego znaku (Staś → Stasi-). */
function odmSpolgl(n: string, wol?: string, oblDane?: string): string[] {
  let obl = oblDane ?? n;
  if (oblDane === undefined) {
    const lo = n.toLowerCase();
    if (lo.endsWith('ek') && n.length >= 5) {
      obl = `${n.slice(0, -2)}k`;
      for (const [a, b] of MIEKKIE_SI) {
        if (obl.slice(0, -1).toLowerCase().endsWith(a)) {
          obl = `${obl.slice(0, -1 - a.length)}${b}k`;
          break;
        }
      }
    } else if (lo.endsWith('eł') && n.length >= 5) obl = `${n.slice(0, -2)}ł`;
    else if (Z_E_RUCHOMYM_ER.has(n)) obl = n.slice(0, -2) + odKonca(n);
    else if (lo.endsWith('niec') && n.length >= 6) obl = `${n.slice(0, -4)}ńc`;
    else if (lo.length >= 3 && odKonca(lo, 2) === 'ó' && !samogloska(odKonca(lo))) {
      obl = `${n.slice(0, -2)}o${odKonca(n)}`;
    }
    const ostatnia = odKonca(obl);
    if (Object.hasOwn(MIEKKIE_ZNAK, ostatnia)) obl = obl.slice(0, -1) + MIEKKIE_ZNAK[ostatnia];
    else if (obl.endsWith('dź')) obl = `${obl.slice(0, -2)}dzi`;
  }
  const lo = obl.toLowerCase();
  const d = `${obl}a`;
  const narz = `${obl}${lo.endsWith('k') || lo.endsWith('g') ? 'iem' : 'em'}`;
  const msc = U_KONC.some((k) => lo.endsWith(k)) ? `${obl}u` : przedE(obl);
  return [n, d, `${obl}owi`, d, narz, msc, wol ?? msc];
}

/** Jerzy, Antoni, Ignacy, Bazyli (i nazwiska Biały, Przychodni): odmiana przymiotnikowa. */
function odmPrzymM(n: string): string[] {
  const lo = n.toLowerCase();
  const b = lo.endsWith('y') || lo.endsWith('li') ? n.slice(0, -1) : n;
  return [n, `${b}ego`, `${b}emu`, `${b}ego`, `${n}m`, `${n}m`, n];
}

/** Odmiana imienia (jeden człon) według reguł. */
function odmienImieReguly(n: string, plec: Plec): string[] {
  const lo = n.toLowerCase();
  if (plec === 'K') return lo.endsWith('a') ? odmA(n) : nieodm(n);
  if (lo.endsWith('a')) return odmA(n);
  if ((lo.endsWith('y') || lo.endsWith('i')) && lo.length > 2 && !samogloska(odKonca(lo, 2))) return odmPrzymM(n);
  if (lo.endsWith('io')) return odmSpolgl(n, `${n.slice(0, -1)}u`, n.slice(0, -1)); // Franio → Frania, Franiu
  if (PLUS_N.has(n)) return odmSpolgl(n, n, `${n}n`); // Bruno → Brunona, W. Bruno
  if (lo.endsWith('ko')) return odmSpolgl(n, undefined, n.slice(0, -1)); // Mieszko → Mieszka, Mieszku
  if (lo.endsWith('o')) return odmSpolgl(n, n, n.slice(0, -1)); // Diego → Diega, W. Diego
  if (PRZYM_E.has(n)) return [n, `${n}go`, `${n}mu`, `${n}go`, `${n}m`, `${n}m`, n];
  if (samogloska(odKonca(lo))) return nieodm(n);
  return odmSpolgl(n);
}

/** Imię (jedno- albo wielo-członowe) odmienione regułami. `null`, gdy napis nie składa się z liter. */
export function zgadnijReguly(imie: string, plec: Plec): Formy | null {
  const w = poCzlonach(normalizuj(imie), (c) => odmienImieReguly(c, plec));
  return w ? naFormy(w) : null;
}

// ---------------------------------------------------------------- reguły: nazwiska

const MIEKCZ: Record<string, string> = { n: 'ń', s: 'ś', z: 'ź', c: 'ć' };

/** Nazwisko męskie przymiotnikowe: -ski, -cki, -dzki, Biały, Przychodni (spółgłoska + y albo i). */
const przymiotnikowe = (lo: string): boolean =>
  lo.length > 2 && (lo.endsWith('y') || lo.endsWith('i')) && !samogloska(odKonca(lo, 2));

/** Odmiana nazwiska męskiego (jeden człon) według reguł. */
function odmienNazwiskoM(n: string): string[] {
  const lo = n.toLowerCase();
  if (przymiotnikowe(lo)) return odmPrzymM(n); // Kowalski, Biały, Przychodni
  if (lo.endsWith('e') && lo.length > 2 && !samogloska(odKonca(lo, 2))) {
    return [n, `${n}go`, `${n}mu`, `${n}go`, `${n}m`, `${n}m`, n]; // Lange → Langego
  }
  if (lo.endsWith('io')) return odmSpolgl(n, n, n.slice(0, -1)); // Kusio → Kusia, W. Kusio
  if (lo.endsWith('iec') && lo.length >= 6) {
    const b = n.slice(0, -3);
    const ost = odKonca(b);
    return odmSpolgl(n, undefined, `${Object.hasOwn(MIEKCZ, ost) ? b.slice(0, -1) + MIEKCZ[ost] : b}c`); // Niemiec → Niemca
  }
  if (lo.endsWith('ec') && lo.length >= 6 && !samogloska(odKonca(lo, 3))) {
    return odmSpolgl(n, undefined, `${n.slice(0, -2)}c`); // Stachulec → Stachulca
  }
  if (lo.endsWith('a')) return odmA(n); // Sikora → Sikory, Sikorze
  if (lo.endsWith('o')) {
    const f = odmA(`${n.slice(0, -1)}a`); // Kościuszko → Kościuszki, Kościuszce, W. Kościuszko
    f[0] = n;
    f[6] = n;
    return f;
  }
  if (samogloska(odKonca(lo))) return nieodm(n);
  if (lo.length >= 3 && odKonca(lo, 2) === 'ó') return odmSpolgl(n, undefined, n); // Król → Króla, bez zmiany ó
  return odmSpolgl(n);
}

/** Mianownik żeńskiej formy nazwiska z męskiej: Kowalski → Kowalska, Konieczny → Konieczna; spółgłoskowe i na -a
    zostają (Nowak, Sikora). Tak wyglądają pary w tabelach nazwisk z rejestru PESEL. */
export function zenskaFormaNazwiska(meskie: string): string {
  const poCzlonie = (c: string): string => (przymiotnikowe(c.toLowerCase()) ? `${c.slice(0, -1)}a` : c);
  return meskie
    .split(/([- ])/)
    .map((c, i) => (i % 2 === 0 ? poCzlonie(c) : c))
    .join('');
}

/** Żeńskie przymiotnikowe: Kowalska → Kowalskiej, Kowalską, W. Kowalska. */
function odmPrzymK(n: string): string[] {
  const b = n.slice(0, -1);
  const lo = b.toLowerCase();
  const d = `${b}${lo.endsWith('k') || lo.endsWith('g') ? 'iej' : 'ej'}`;
  return [n, d, d, `${b}ą`, `${b}ą`, d, n];
}

/** Odmiana żeńskiej formy nazwiska (jeden człon) według reguł, z męskiej: żeńskie przymiotnikowe odmieniają się
    przymiotnikowo, żeńskie na -a jak rzeczowniki, a spółgłoskowe wcale (Nowak, Nowak, Nowak…). */
function odmienNazwiskoK(meskie: string): string[] {
  const lo = meskie.toLowerCase();
  if (przymiotnikowe(lo)) return odmPrzymK(`${meskie.slice(0, -1)}a`);
  if (lo.endsWith('a')) return odmA(meskie);
  return nieodm(meskie);
}

/** Mianownik liczby mnogiej nazwiska męskiego dla „państwo X”. `dop` to dopełniacz męski z reguł (jego temat). */
function mnogaNazwiska(m: string, dop: string): string {
  const lo = m.toLowerCase();
  if (przymiotnikowe(lo)) {
    if (lo.endsWith('ki')) return `${m.slice(0, -2)}cy`; // Kowalski → Kowalscy, Nowicki → Nowiccy, Zawadzki → Zawadzcy
    if (lo.endsWith('gi')) return `${m.slice(0, -2)}dzy`;
    if (lo.endsWith('i')) return m; // Przychodni
    const przed = odKonca(lo, 2);
    const przedPrzed = odKonca(lo, 3);
    if (przed === 'r') return `${m.slice(0, -2)}rzy`; // Szary → Szarzy
    if (przed === 't') return `${m.slice(0, -2)}ci`; // Złoty → Złoci
    if (przed === 'd') return `${m.slice(0, -2)}dzi`; // Młody → Młodzi
    if (przed === 'h' && przedPrzed === 'c') return `${m.slice(0, -3)}si`; // Cichy → Cisi
    if (przed === 'ł') return `${m.slice(0, -2)}li`; // Biały → Biali
    if ('nwmbpsz'.includes(przed)) return `${m.slice(0, -1)}i`; // Czarny → Czarni, Nowy → Nowi
    return m;
  }
  if (lo.endsWith('a') || lo.endsWith('o') || lo.endsWith('e')) return `${m.slice(0, -1)}owie`; // Sikorowie, Kościuszkowie
  if (samogloska(odKonca(lo))) return m;
  return `${dop.endsWith('a') ? dop.slice(0, -1) : m}owie`; // Nowakowie, Wróblowie, Zającowie
}

interface CzlonNazwiska {
  m: string[];
  kMian: string;
  k: string[];
  mnoga: string;
}

function nazwiskoCzlonReguly(c: string): CzlonNazwiska {
  const m = odmienNazwiskoM(c);
  return { m, kMian: zenskaFormaNazwiska(c), k: odmienNazwiskoK(c), mnoga: mnogaNazwiska(c, m[1]) };
}

/** Złożenie człon po członie (nazwiska dwuczłonowe: Kowalski-Nowak). */
function nazwiskoPoCzlonach(napis: string, f: (czlon: string) => CzlonNazwiska | null): FormyNazwiska | null {
  const kawalki = napis.split(/([- ])/);
  const czlony: CzlonNazwiska[] = [];
  for (let i = 0; i < kawalki.length; i += 2) {
    if (!CZLON.test(kawalki[i])) return null;
    const w = f(kawalki[i]);
    if (!w) return null;
    czlony.push(w);
  }
  const sklej = (wez: (c: CzlonNazwiska) => string): string =>
    czlony.map((c, i) => (i > 0 ? kawalki[2 * i - 1] : '') + wez(c)).join('');
  const skladaj = (p: number, mian: (c: CzlonNazwiska) => string, formy: (c: CzlonNazwiska) => string[]): string =>
    p === 0 ? sklej(mian) : sklej((c) => formy(c)[p]);
  return {
    m: naFormy(
      PRZYPADKI.map((_, p) =>
        skladaj(
          p,
          (c) => c.m[0],
          (c) => c.m,
        ),
      ),
    ),
    k: naFormy(
      PRZYPADKI.map((_, p) =>
        skladaj(
          p,
          (c) => c.kMian,
          (c) => c.k,
        ),
      ),
    ),
    mnoga: sklej((c) => c.mnoga),
  };
}

/** Nazwisko (podane w formie męskiej) odmienione regułami: formy męskie, żeńskie (z męskiej) i liczba mnoga.
    `null`, gdy napis nie składa się z liter. */
export function zgadnijNazwiskoReguly(meskie: string): FormyNazwiska | null {
  return nazwiskoPoCzlonach(normalizuj(meskie), nazwiskoCzlonReguly);
}

// ---------------------------------------------------------------- końcówki

interface IndeksKoncowek {
  mapa: Map<string, WzorzecKoncowek>;
  najdluzszy: number;
}
const INDEKSY = new WeakMap<TabelaKoncowek, IndeksKoncowek>();

/** Indeks „płeć + sufiks” → wzorzec, liczony raz na obiekt tablicy. */
function indeks(k: TabelaKoncowek): IndeksKoncowek {
  let i = INDEKSY.get(k);
  if (!i) {
    i = { mapa: new Map(), najdluzszy: 0 };
    for (const w of k.wzorce) {
      const klucz = w.plec + w.sufiks;
      if (!i.mapa.has(klucz)) i.mapa.set(klucz, w);
      if (w.sufiks.length > i.najdluzszy) i.najdluzszy = w.sufiks.length;
    }
    INDEKSY.set(k, i);
  }
  return i;
}

/** Siedem form: mianownik bez `ucinek` znaków plus końcówka danego przypadku. `null`, gdy mianownik jest krótszy
    niż `ucinek`. */
function zastosujWzorzec(n: string, w: WzorzecKoncowek): string[] | null {
  if (w.ucinek > n.length) return null;
  const rdzen = n.slice(0, n.length - w.ucinek);
  return PRZYPADKI.map((p) => (p === 'mian' ? n : rdzen + w.koncowki[p]));
}

/** Najdłuższy sufiks mianownika (do `najdluzszy` znaków, małymi literami), dla którego tablica ma wzorzec
    dla tej płci i rodzaju (`gwiazdka`: nazwiska), a wzorzec pasuje do długości napisu. */
function odmienKoncowkami(n: string, plec: Plec, nazwisko: boolean, k: TabelaKoncowek): string[] | null {
  const lo = n.toLowerCase();
  const { mapa, najdluzszy } = indeks(k);
  for (let dl = Math.min(najdluzszy, lo.length); dl >= 1; dl--) {
    const w = mapa.get(plec + (nazwisko ? '*' : '') + lo.slice(lo.length - dl));
    if (!w) continue;
    const formy = zastosujWzorzec(n, w);
    if (formy) return formy;
  }
  return null;
}

/** Imię odmienione samą tablicą końcówek (najdłuższy pasujący sufiks z wzorcem odmiany). `null`, gdy napis nie
    składa się z liter albo żaden sufiks nie ma wzorca. */
export function zgadnijKoncowkami(imie: string, plec: Plec, k: TabelaKoncowek): Formy | null {
  const w = poCzlonach(normalizuj(imie), (c) => odmienKoncowkami(c, plec, false, k));
  return w ? naFormy(w) : null;
}

/** Nazwisko (forma męska) odmienione samą tablicą końcówek: męskie ze wzorca męskich, żeńskie ze wzorca żeńskich
    (dla mianownika żeńskiego z `zenskaFormaNazwiska`). Liczba mnoga nie ma wzorców w tablicy, więc bierze ją z reguł. */
export function zgadnijNazwiskoKoncowkami(meskie: string, k: TabelaKoncowek): FormyNazwiska | null {
  return nazwiskoPoCzlonach(normalizuj(meskie), (c) => nazwiskoCzlonKoncowkami(c, k));
}

/** Człon nazwiska samą tablicą końcówek (liczba mnoga z reguł). */
function nazwiskoCzlonKoncowkami(c: string, k: TabelaKoncowek): CzlonNazwiska | null {
  const m = odmienKoncowkami(c, 'M', true, k);
  const kMian = zenskaFormaNazwiska(c);
  const kobiece = odmienKoncowkami(kMian, 'K', true, k);
  if (!m || !kobiece) return null;
  return { m, kMian, k: kobiece, mnoga: nazwiskoCzlonReguly(c).mnoga };
}

// ---------------------------------------------------------------- interfejs

const takieSame = (a: readonly string[], b: readonly string[]): boolean => a.every((x, i) => x === b[i]);
const doTablicy = (f: Formy): string[] => PRZYPADKI.map((p) => f[p]);

/** Siedem jednakowych form: awaria bezpieczna dla napisu, którego nie da się odmienić. Pusty napis daje „?”. */
function jednakowe(napis: string): Formy {
  return naFormy(nieodm(napis === '' ? '?' : napis));
}
const jednakoweNazwisko = (napis: string): FormyNazwiska => ({
  m: jednakowe(napis),
  k: jednakowe(napis),
  mnoga: napis === '' ? '?' : napis,
});

/** Formy imienia ze słownika albo `null`, gdy słownik go nie zna (dla tej płci). Obiekt jest z tabeli: nie zmieniaj go. */
export function formyImienia(imie: string, plec: Plec, t: TabelaOdmiany): Formy | null {
  const w = normalizuj(imie);
  return Object.hasOwn(t.imiona, w) ? (t.imiona[w][plec] ?? null) : null;
}

/** Imię (każdy człon osobno): słownik `t` (może go nie być), a gdy brak, reguły. `pewne`: każdy człon jest w słowniku
    albo reguły i końcówki dały dla niego ten sam paradygmat. */
function odmienImie(
  imie: string,
  plec: Plec,
  t: TabelaOdmiany | null,
  k: TabelaKoncowek,
): { formy: Formy; pewne: boolean } {
  const w = normalizuj(imie);
  try {
    let pewne = true;
    const formy = poCzlonach(w, (c) => {
      const wpis = t && Object.hasOwn(t.imiona, c) ? t.imiona[c][plec] : undefined;
      if (wpis) return doTablicy(wpis);
      const reguly = odmienImieReguly(c, plec);
      const koncowki = odmienKoncowkami(c, plec, false, k);
      if (!koncowki || !takieSame(reguly, koncowki)) pewne = false;
      return reguly;
    });
    return formy ? { formy: naFormy(formy), pewne } : { formy: jednakowe(w), pewne: false };
  } catch {
    return { formy: jednakowe(w), pewne: false };
  }
}

/** Imię spoza słownika: reguły dają formy, a `pewne` mówi, czy tablica końcówek dała ten sam pełny paradygmat.
    Gdy się różnią, formy są z reguł (dokładniejszych na imionach obcych), a `pewne` jest `false`. */
export function zgadnijImie(imie: string, plec: Plec, k: TabelaKoncowek): { formy: Formy; pewne: boolean } {
  return odmienImie(imie, plec, null, k);
}

/** Imię w siedmiu przypadkach: słownik, a gdy go brak, zgadywacz (imię złożone: człon po członie, więc „Anna-Maria”
    z dwóch słownikowych członów jest pewne). Nigdy nie rzuca; pusty albo dziwny napis (cyfry, znaki spoza liter)
    wraca w siedmiu jednakowych formach z `pewne: false`. */
export function odmien(
  imie: string,
  plec: Plec,
  t: TabelaOdmiany,
  k: TabelaKoncowek,
): { formy: Formy; pewne: boolean } {
  return odmienImie(imie, plec, t, k);
}

/** Nazwisko po formie męskiej, człon po członie: słownik `t` (może go nie być), a gdy brak, reguły z porównaniem
    z tablicą końcówek (męskie i żeńskie muszą się zgodzić, żeby człon był pewny; liczba mnoga zawsze z reguł). */
function nazwiskoSlownikiem(
  meskie: string,
  t: TabelaOdmiany | null,
  k: TabelaKoncowek,
): { formy: FormyNazwiska; pewne: boolean } {
  const w = normalizuj(meskie);
  try {
    if (t && Object.hasOwn(t.nazwiska, w)) return { formy: t.nazwiska[w], pewne: true };
    let pewne = true;
    const formy = nazwiskoPoCzlonach(w, (c) => {
      const wpis = t && Object.hasOwn(t.nazwiska, c) ? t.nazwiska[c] : undefined;
      if (wpis) return { m: doTablicy(wpis.m), kMian: wpis.k.mian, k: doTablicy(wpis.k), mnoga: wpis.mnoga };
      const reguly = nazwiskoCzlonReguly(c);
      const koncowki = nazwiskoCzlonKoncowkami(c, k);
      if (!koncowki || !takieSame(reguly.m, koncowki.m) || !takieSame(reguly.k, koncowki.k)) pewne = false;
      return reguly;
    });
    return formy ? { formy, pewne } : { formy: jednakoweNazwisko(w), pewne: false };
  } catch {
    return { formy: jednakoweNazwisko(w), pewne: false };
  }
}

/** Nazwisko po formie męskiej: formy męskie, żeńskie i liczba mnoga. Ze słownika (pewne) albo z reguł z porównaniem
    z tablicą końcówek. Obiekt ze słownika jest z tabeli: nie zmieniaj go. */
export function formyNazwiska(
  meskie: string,
  t: TabelaOdmiany,
  k: TabelaKoncowek,
): { formy: FormyNazwiska; pewne: boolean } {
  return nazwiskoSlownikiem(meskie, t, k);
}

// ---------------------------------------------------------------- plik odmiana.json

/** Plik odmiana.json. `wzorce` to wzorce odmiany jako napisy „dop,cel,bier,narz,msc,wol”; każda forma to cyfra
    (ile ostatnich liter mianownika uciąć) i to, co dokleić: dla Marek „2ka,2kowi,2ka,2kiem,2ku,2ku”. Imię to
    indeksy wzorców według płci. Nazwisko to [wzorzec męski, mianownik żeński względem męskiego (ten sam napis co
    wzorzec formy: „1a” dla Kowalski → Kowalska), wzorzec żeński względem mianownika żeńskiego, mnoga względem męskiego]. */
export interface OdmianaPlik {
  wersja: number;
  _nota: string;
  wzorce: string[];
  imiona: Record<string, { M?: number; K?: number }>;
  nazwiska: Record<string, [number, string, number, string]>;
}

/** Forma z napisu „cyfra + dopisek” względem mianownika. */
function rozpakujForme(mian: string, kod: string): string {
  const ucieto = kod.charCodeAt(0) - 48;
  return mian.slice(0, Math.max(0, mian.length - ucieto)) + kod.slice(1);
}

function rozpakujFormy(mian: string, wzorzec: string): Formy {
  const kody = wzorzec.split(',');
  return naFormy([mian, ...kody.map((kod) => rozpakujForme(mian, kod))]);
}

/** Składa `TabelaOdmiany` z pliku odmiana.json. Rzuca wyjątek, gdy plik jest uszkodzony (zły indeks wzorca, zły
    napis); wywołujący (`wczytajOdmiane`) zamienia to na `null` z ostrzeżeniem. */
export function rozpakujOdmiane(plik: OdmianaPlik): TabelaOdmiany {
  const wzorzec = (i: number): string => {
    const w = plik.wzorce[i];
    if (typeof w !== 'string' || w.split(',').length !== 6) throw new Error(`odmiana.json: zły wzorzec ${i}`);
    return w;
  };
  const imiona: TabelaOdmiany['imiona'] = {};
  for (const [imie, wpis] of Object.entries(plik.imiona)) {
    const o: { M?: Formy; K?: Formy } = {};
    if (wpis.M !== undefined) o.M = rozpakujFormy(imie, wzorzec(wpis.M));
    if (wpis.K !== undefined) o.K = rozpakujFormy(imie, wzorzec(wpis.K));
    imiona[imie] = o;
  }
  const nazwiska: TabelaOdmiany['nazwiska'] = {};
  for (const [meskie, [wm, kod, wk, mnoga]] of Object.entries(plik.nazwiska)) {
    const zenskie = rozpakujForme(meskie, kod);
    nazwiska[meskie] = {
      m: rozpakujFormy(meskie, wzorzec(wm)),
      k: rozpakujFormy(zenskie, wzorzec(wk)),
      mnoga: rozpakujForme(meskie, mnoga),
    };
  }
  return { wersja: plik.wersja, imiona, nazwiska };
}
