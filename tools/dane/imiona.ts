/* Czytniki i reguły tabel imion i nazwisk dla `npm run dane:imiona`: rejestr PESEL z dane.gov.pl (Ministerstwo
   Cyfryzacji, CC0). Czyste funkcje na wierszach CSV i XLSX oraz na licznikach w pamięci, bez dostępu do plików, żeby
   dało się je testować na małych danych; wczytywanie plików jest w imiona-pliki.ts.

   Imiona:
   - `lata`: pierwsze imiona nadane dzieciom w latach 2000-2025 (zbiór 219), 200 najczęstszych na płeć i rok;
   - `koszyki`: imiona osób urodzonych przed 2000 r. Otwartych danych „imię × rok urodzenia” dla osób żyjących nie ma,
     więc rocznik zgadujemy z odsetka zmarłych wśród osób z danym imieniem urodzonych przed 2000 r. Takich osób jest
     tyle, ile żyjących 20.01.2026 minus nadania 2000-2025, a zmarłych tyle, ile jest ich w rejestrze ze zmarłymi
     ponad żyjących. Udział zmarłych to (razem ze zmarłymi − żyjący) / razem ze zmarłymi, liczony dla tej kohorty,
     czyli z obu liczb odjęte nadania 2000-2025 (inaczej nowa moda rozcieńczałaby go u imion, które wracają). Im
     większy udział, tym starsze imię (progi w `koszykWgZmarlych`). Wagą imienia w koszyku jest liczba żyjących
     z kohorty; u siedmiu imion dwufalowych (`DWUFALOWE`) tylko jej część równa udziałowi zmarłych;
   - `przyjezdni`: imiona w ukraińskiej, białoruskiej i rosyjskiej transliteracji, których przybyło w rejestrze od
     migawki z lipca 2019 (cudzoziemcy z PESEL po 2022 r.); nie mieszają się z imionami „rdzennymi”;
   - `powracajace`: imiona pradziadków, których udział wśród nadań od 2019 do pierwszej połowy 2026 rośnie.
   Nazwiska: jedna tabela na województwo (zameldowanie na pobyt stały), z parą form męskiej i żeńskiej. */

import {
  type ImieZLiczba,
  KOSZYKI_IMION,
  type KoszykImion,
  PLIK_WOJEWODZTWA,
  type TabeleImion,
  type TabeleNazwisk,
  WERSJA_TABEL,
} from '../../src/mieszkancy/tabele.ts';

export type Plec = 'M' | 'K';
/** Imię albo nazwisko WIELKIMI LITERAMI (tak jest w rejestrze) → liczba osób albo nadań. */
export type Licznik = Map<string, number>;

const dodaj = (l: Licznik, n: string, v: number): void => {
  l.set(n, (l.get(n) ?? 0) + v);
};

/** Malejąco po liczbie, przy remisie rosnąco po nazwie (porównanie kodów znaków, więc to samo na każdej maszynie). */
const poLiczbie = (a: readonly [string, number], b: readonly [string, number]): number =>
  b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** Dzielenie całkowite z zaokrągleniem połówki w górę, bez błędów zmiennoprzecinkowych. */
const zaokraglij = (licznik: number, mianownik: number): number =>
  Math.floor((2 * licznik + mianownik) / (2 * mianownik));

// ---------------------------------------------------------------- pisownia

const WZOR_IMIENIA = /^\p{L}+(?:[- ]\p{L}+)*$/u;
const WZOR_NAZWISKA = /^\p{L}+(?:-\p{L}+)*$/u;

/** „ANNA-MARIA” → „Anna-Maria”, „ŻANETA” → „Żaneta”: małe litery, wielka na początku i po myślniku albo spacji. */
export function wielkaLitera(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[- ])(\p{L})/gu, (_, przed: string, litera: string) => przed + litera.toUpperCase());
}

// ---------------------------------------------------------------- czytniki list imion

/** CSV z BOM i końcami linii CRLF; separator (średnik albo przecinek) wykrywany po nagłówku. Pola mogą być w
    cudzysłowach. Puste linie są pomijane. */
export function parsujCsv(tekst: string): string[][] {
  const linie = tekst
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (linie.length === 0) return [];
  const separator = linie[0].includes(';') ? ';' : ',';
  return linie.map((linia) => {
    const pola: string[] = [];
    let pole = '';
    let wCudzyslowie = false;
    for (let i = 0; i < linia.length; i++) {
      const c = linia[i];
      if (wCudzyslowie) {
        if (c !== '"') pole += c;
        else if (linia[i + 1] === '"') {
          pole += '"';
          i++;
        } else wCudzyslowie = false;
      } else if (c === '"') wCudzyslowie = true;
      else if (c === separator) {
        pola.push(pole.trim());
        pole = '';
      } else pole += c;
    }
    pola.push(pole.trim());
    return pola;
  });
}

export interface WierszImienia {
  imie: string;
  liczba: number;
  plec?: Plec;
  rok?: number;
}

/** Nagłówek bez polskich liter, spacji i podkreśleń: „LICZBA_WYSTĄPIEŃ” → „liczbawystapien”, „PŁEĆ” → „plec”. */
const kluczNaglowka = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');

/** Wiersze list imion: pierwszy wiersz to nagłówek, kolumny znajdowane po nazwie (imię, liczba, opcjonalnie płeć
    i rok), więc działa na wszystkich wariantach plików PESEL (CSV i XLSX, „IMIĘ_PIERWSZE”, „IMIĘ 1”, „IMIĘ_1”…).
    Pomija wiersze, w których imię nie składa się z liter (kropki, „-”, „JR.”) albo liczba nie jest dodatnią całkowitą. */
export function wierszeImion(w: readonly (readonly (string | number | null)[])[]): WierszImienia[] {
  if (w.length === 0) throw new Error('Lista imion jest pusta (brak nagłówka)');
  const klucze = w[0].map((c) => kluczNaglowka(String(c ?? '')));
  const kolumna = (ok: (k: string) => boolean): number => klucze.findIndex(ok);
  const imie = kolumna((k) => k.startsWith('imie'));
  const liczba = kolumna((k) => k.startsWith('liczba'));
  const plec = kolumna((k) => k === 'plec');
  const rok = kolumna((k) => k === 'rok');
  if (imie < 0) throw new Error(`Lista imion nie ma kolumny imienia, nagłówek: ${w[0].join(' | ')}`);
  if (liczba < 0) throw new Error(`Lista imion nie ma kolumny liczby, nagłówek: ${w[0].join(' | ')}`);
  const wynik: WierszImienia[] = [];
  for (const r of w.slice(1)) {
    const nazwa = typeof r[imie] === 'string' ? (r[imie] as string).trim() : '';
    const n =
      typeof r[liczba] === 'number' ? (r[liczba] as number) : Number(String(r[liczba] ?? '').trim() || Number.NaN);
    if (!WZOR_IMIENIA.test(nazwa) || !Number.isInteger(n) || n <= 0) continue;
    const wiersz: WierszImienia = { imie: nazwa.toUpperCase(), liczba: n };
    if (plec >= 0) {
      const p = String(r[plec] ?? '')
        .trim()
        .toUpperCase();
      if (p.startsWith('K')) wiersz.plec = 'K';
      else if (p.startsWith('M')) wiersz.plec = 'M';
      else continue;
    }
    if (rok >= 0) {
      const y = Number(r[rok]);
      if (!Number.isInteger(y)) continue;
      wiersz.rok = y;
    }
    wynik.push(wiersz);
  }
  return wynik;
}

// ---------------------------------------------------------------- transliteracja

/** Litery i końcówki, jakich nie ma w polskich imionach: v, x, q; Y na początku (Yaroslav); kh (Mykhailo); podwójne i
    (Andrii, Nataliia, Daniil); końcówki -ei i -yi (Andrei, Siarhei); przedrostki Oleks- (Oleksandr, Oleksandra
    zamiast Aleksander, Aleksandra) i Aliak- (Aliaksandr). */
const ZNAKI_TRANSLITERACJI: readonly RegExp[] = [/[vxq]/, /^y/, /kh/, /ii/, /ei$/, /yi$/, /^oleks/, /^aliak/];

/** Ukraińskie, białoruskie i rosyjskie pisownie bez takich znaków. Tylko te, które różnią się od polskiej pisowni tego
    samego imienia (Dmytro, nie Dymitr); Roman, Igor, Bohdan, Mark, Hanna, Julia, Olga, Daria i Sofia są też polskie
    i zostają. */
const PISOWNIE_TRANSLITEROWANE = new Set([
  // mężczyźni
  'dmytro',
  'mykola',
  'artem',
  'oleh',
  'denys',
  'ihor',
  'danylo',
  'kyrylo',
  'mykyta',
  'taras',
  'petro',
  'nazar',
  'ruslan',
  'maksym',
  'maksim',
  'nikita',
  'anton',
  'stepan',
  'kostiantyn',
  'giorgi',
  'dzmitry',
  'illia',
  // kobiety
  'tetiana',
  'olena',
  'iryna',
  'olha',
  'oksana',
  'kateryna',
  'liudmyla',
  'halyna',
  'maryna',
  'inna',
  'alla',
  'alona',
  'polina',
  'anhelina',
  'daryna',
  'marharyta',
  'zlata',
  'karyna',
  'lesia',
  'alisa',
  'kira',
  'uliana',
  'olesia',
  'arina',
  'kristina',
  'ruslana',
  'larysa',
  'liubov',
  'myroslava',
]);

export function jestTransliteracja(imie: string): boolean {
  const n = imie.toLowerCase();
  return PISOWNIE_TRANSLITEROWANE.has(n) || ZNAKI_TRANSLITERACJI.some((w) => w.test(n));
}

// ---------------------------------------------------------------- tabele imion

/** Dane wejściowe tabel imion. Wszystkie imiona WIELKIMI LITERAMI jako klucze liczników. */
export interface DaneImion {
  /** Rok → płeć → nadania pierwszych imion w tym roku (2000-2025 pełne lata, 2026 to pierwsza połowa roku). */
  urodzenia: Record<number, Record<Plec, Licznik>>;
  /** Żyjący w rejestrze PESEL, 20.01.2026. */
  zyjacy: Record<Plec, Licznik>;
  /** Żyjący i zmarli razem, 20.01.2026. */
  razem: Record<Plec, Licznik>;
  /** Żyjący w rejestrze PESEL, 18.07.2019. */
  zyjacy2019: Record<Plec, Licznik>;
}

export const PIERWSZY_ROK = 2000;
export const OSTATNI_ROK = 2025;
/** Imię trafia do roku, gdy ma co najmniej tyle nadań w tym roku. */
export const PROG_NADAN_W_ROKU = 10;
export const IMION_NA_ROK = 200;
/** Imię trafia do puli przyjezdnych, gdy żyjących przybyło od migawki 2019 o co najmniej tyle. */
export const PROG_PRZYROSTU = 5000;
/** Imię trafia do koszyka, gdy ma co najmniej tyle żyjących urodzonych przed 2000 r. Poniżej to różnica dwóch dużych
    liczb (żyjący minus nadania), czyli szum, a nie rocznik. */
export const PROG_ZYJACYCH_KOSZYKA = 5000;
/** Imię z XXI wieku: nadań po 2000 r. ponad tyle razy więcej niż żyjących urodzonych wcześniej (Nikodem, Amelia, Lena). */
export const MNOZNIK_MODY = 10;
export const IMION_W_KOSZYKU = 200;
/** Powracające: co najmniej tyle zmarłych, tyle nadań w 2025 i pierwszej połowie 2026 oraz wzrost udziału o 30%. */
export const PROG_ZMARLYCH_POWRACAJACYCH = 3000;
export const PROG_NADAN_POWRACAJACYCH = 100;

/** Imiona o dwóch falach mody (stara, przedwojenna, i nowa, po 2010): sam odsetek zmarłych je myli, bo nowa fala
    rozcieńcza go albo, jak u Julii, zasłania starą. Wpisane ręcznie do najstarszego koszyka. */
export const DWUFALOWE: Record<Plec, readonly string[]> = {
  M: ['ANTONI', 'JAN', 'STANISŁAW', 'FRANCISZEK'],
  K: ['ZOFIA', 'JULIA', 'HELENA'],
};

/** Koszyk według udziału zmarłych wśród osób z imieniem urodzonych przed 2000 r.: zmarli / (zmarli + żyjący). Progi
    w procentach: 60, 40, 20, 5. Porównania na liczbach całkowitych. */
export function koszykWgZmarlych(zmarli: number, zyjacy: number): KoszykImion {
  const razem = zmarli + zyjacy;
  const sto = 100 * zmarli;
  if (sto >= 60 * razem) return '1920-1945';
  if (sto >= 40 * razem) return '1946-1959';
  if (sto >= 20 * razem) return '1960-1974';
  if (sto >= 5 * razem) return '1975-1989';
  return '1990-1999';
}

const nadaniaDoRoku = (d: DaneImion, p: Plec, imie: string): number => {
  let s = 0;
  for (let r = PIERWSZY_ROK; r <= OSTATNI_ROK; r++) s += d.urodzenia[r][p].get(imie) ?? 0;
  return s;
};

const sumaRoku = (d: DaneImion, rok: number, p: Plec): number => {
  let s = 0;
  for (const v of d.urodzenia[rok][p].values()) s += v;
  return s;
};

/** Żyjący urodzeni przed 2000 r. (żyjący 2026 minus nadania 2000-2025), zmarli i udział zmarłych w procentach. */
export function kohortaImienia(
  d: DaneImion,
  p: Plec,
  imie: string,
): { zyjacySprzed2000: number; zmarli: number; nadania: number; udzialZmarlych: number } {
  const zyjacy = d.zyjacy[p].get(imie) ?? 0;
  const razem = d.razem[p].get(imie);
  if (razem === undefined)
    throw new Error(`Rejestr ze zmarłymi nie ma imienia ${imie} (płeć ${p}), a rejestr żyjących ma`);
  if (razem < zyjacy) throw new Error(`Imię ${imie} (płeć ${p}): razem ze zmarłymi ${razem} < żyjących ${zyjacy}`);
  const nadania = nadaniaDoRoku(d, p, imie);
  const zyjacySprzed2000 = zyjacy - nadania;
  const zmarli = razem - zyjacy;
  const mianownik = zmarli + Math.max(zyjacySprzed2000, 0);
  return { zyjacySprzed2000, zmarli, nadania, udzialZmarlych: mianownik === 0 ? 0 : (100 * zmarli) / mianownik };
}

function przyjezdniPlci(d: DaneImion, p: Plec): Map<string, number> {
  const wynik = new Map<string, number>();
  for (const [imie, zyjacy] of d.zyjacy[p]) {
    const przyrost = zyjacy - (d.zyjacy2019[p].get(imie) ?? 0);
    if (przyrost >= PROG_PRZYROSTU && jestTransliteracja(imie)) wynik.set(imie, przyrost);
  }
  return wynik;
}

const nazwyZLiczba = (wpisy: Iterable<readonly [string, number]>, ile: number): ImieZLiczba[] =>
  [...wpisy]
    .sort(poLiczbie)
    .slice(0, ile)
    .map(([n, c]) => [wielkaLitera(n), c]);

function koszykiPlci(
  d: DaneImion,
  p: Plec,
  przyjezdni: ReadonlyMap<string, number>,
): Record<KoszykImion, ImieZLiczba[]> {
  const zbiory = Object.fromEntries(KOSZYKI_IMION.map((k) => [k, [] as [string, number][]])) as Record<
    KoszykImion,
    [string, number][]
  >;
  const dwufalowe = new Set(DWUFALOWE[p]);
  for (const imie of d.zyjacy[p].keys()) {
    if (przyjezdni.has(imie)) continue;
    const { zyjacySprzed2000: zyjacy, zmarli, nadania } = kohortaImienia(d, p, imie);
    if (dwufalowe.has(imie)) {
      // stara fala to część żyjących odpowiadająca udziałowi zmarłych; reszta to nowa fala, której koszyki przed 2000 nie znają
      if (zyjacy > 0) zbiory['1920-1945'].push([imie, zaokraglij(zyjacy * zmarli, zyjacy + zmarli)]);
    } else if (zyjacy >= PROG_ZYJACYCH_KOSZYKA && nadania <= MNOZNIK_MODY * zyjacy) {
      zbiory[koszykWgZmarlych(zmarli, zyjacy)].push([imie, zyjacy]);
    }
  }
  return Object.fromEntries(KOSZYKI_IMION.map((k) => [k, nazwyZLiczba(zbiory[k], IMION_W_KOSZYKU)])) as Record<
    KoszykImion,
    ImieZLiczba[]
  >;
}

/** Imiona pradziadków (udział zmarłych co najmniej 60% i co najmniej 3 000 zmarłych albo imię dwufalowe), których udział
    wśród nadań w pierwszej połowie 2026 jest co najmniej 1,3 raza większy niż w 2019. Od najczęściej nadawanych w 2025
    i pierwszej połowie 2026. */
function powracajacePlci(d: DaneImion, p: Plec, przyjezdni: ReadonlyMap<string, number>): string[] {
  const dwufalowe = new Set(DWUFALOWE[p]);
  const razem2019 = sumaRoku(d, 2019, p);
  const razem2026 = sumaRoku(d, 2026, p);
  const wynik: [string, number][] = [];
  for (const imie of d.zyjacy[p].keys()) {
    if (przyjezdni.has(imie)) continue;
    const { zyjacySprzed2000, zmarli } = kohortaImienia(d, p, imie);
    const zyjacy = Math.max(zyjacySprzed2000, 0);
    const stare =
      dwufalowe.has(imie) || (zmarli >= PROG_ZMARLYCH_POWRACAJACYCH && 100 * zmarli >= 60 * (zmarli + zyjacy));
    if (!stare) continue;
    const c19 = d.urodzenia[2019][p].get(imie) ?? 0;
    const c25 = d.urodzenia[2025][p].get(imie) ?? 0;
    const c26 = d.urodzenia[2026][p].get(imie) ?? 0;
    if (c26 === 0 || c25 + c26 < PROG_NADAN_POWRACAJACYCH) continue;
    if (10 * c26 * razem2019 < 13 * c19 * razem2026) continue; // udział 2026 < 1,3 × udział 2019
    wynik.push([imie, c25 + c26]);
  }
  return wynik.sort(poLiczbie).map(([n]) => wielkaLitera(n));
}

export function tabeleImion(d: DaneImion): TabeleImion {
  const przyj = { M: przyjezdniPlci(d, 'M'), K: przyjezdniPlci(d, 'K') };
  const lata: TabeleImion['lata'] = {};
  for (let rok = PIERWSZY_ROK; rok <= OSTATNI_ROK; rok++) {
    const wpisy = (p: Plec): ImieZLiczba[] =>
      nazwyZLiczba(
        [...d.urodzenia[rok][p]].filter(([n, c]) => c >= PROG_NADAN_W_ROKU && !przyj[p].has(n)),
        IMION_NA_ROK,
      );
    lata[String(rok)] = { M: wpisy('M'), K: wpisy('K') };
  }
  const koszyki = { M: koszykiPlci(d, 'M', przyj.M), K: koszykiPlci(d, 'K', przyj.K) };
  return {
    wersja: WERSJA_TABEL,
    lata,
    koszyki: Object.fromEntries(
      KOSZYKI_IMION.map((k) => [k, { M: koszyki.M[k], K: koszyki.K[k] }]),
    ) as TabeleImion['koszyki'],
    powracajace: { M: powracajacePlci(d, 'M', przyj.M), K: powracajacePlci(d, 'K', przyj.K) },
    przyjezdni: {
      M: nazwyZLiczba(przyj.M, Number.POSITIVE_INFINITY),
      K: nazwyZLiczba(przyj.K, Number.POSITIVE_INFINITY),
    },
  };
}

// ---------------------------------------------------------------- nazwiska

/** Żeńska forma nazwiska męskiego: -ski, -cki, -dzki → -ska, -cka, -dzka; -y po spółgłosce (Biały, Konieczny) → -a;
    reszta bez zmian (Nowak, Wójcik, Duda). Wielkość liter jak w oryginale. Nie zna wyjątków (Oleksy, Bodziony), więc
    do łączenia z danymi służy `tabeleNazwisk`, który sprawdza obie formy w rejestrze kobiet. */
export function zenskaForma(m: string): string {
  const mala = m.toLowerCase();
  if (!(mala.endsWith('ki') || (mala.endsWith('y') && mala.length > 3))) return m;
  const ostatnia = m.slice(-1);
  const wielka = ostatnia !== ostatnia.toLowerCase();
  return m.slice(0, -1) + (wielka ? 'A' : 'a');
}

/** Zbiór WIELKICH liter z pliku zakazanych nazwisk (jedno męskie nazwisko w linii): forma męska i żeńska każdego. */
export function nazwiskaZakazane(tekst: string): Set<string> {
  const wynik = new Set<string>();
  for (const linia of tekst.split(/\r?\n/)) {
    const n = linia.trim().toUpperCase();
    if (n === '') continue;
    wynik.add(n);
    wynik.add(zenskaForma(n));
  }
  return wynik;
}

export interface DaneNazwisk {
  /** Płeć → województwo WIELKIMI LITERAMI → nazwisko WIELKIMI LITERAMI → liczba osób zameldowanych na pobyt stały. */
  woj: Record<Plec, Map<string, Licznik>>;
  /** Płeć → nazwisko → liczba żyjących w rejestrze PESEL w kraju, 20.01.2026. */
  kraj: Record<Plec, Licznik>;
  /** Wynik `nazwiskaZakazane`. */
  zakazane: ReadonlySet<string>;
}

export interface OpcjeNazwisk {
  ogolne: number;
  lokalne: number;
}
export const OPCJE_NAZWISK: OpcjeNazwisk = { ogolne: 300, lokalne: 100 };
/** Nazwisko trafia do tabel, gdy ma tyle nosicieli (mężczyzn) w kraju. Rzadsze nazwiska łatwo przypisać prawdziwej rodzinie. */
export const PROG_NAZWISKA_W_KRAJU = 300;
/** Nazwisko lokalne liczymy tylko dla nazwisk z tylu nosicielami w pliku województw (jak w badaniach: n ≥ 20). */
export const PROG_NAZWISKA_LOKALNEGO = 20;

export interface DiagnostykaNazwisk {
  woj: string;
  /** Udział nazwisk lokalnych na 10 000 wśród mężczyzn (zapisany w tabeli) i wśród kobiet. */
  udzialM: number;
  udzialK: number;
  /** Ile lokalnych nazwisk męskich (z progiem 300 w kraju) jest w województwie przed ucięciem do puli. */
  lokalnychPrzedUcieciem: number;
  /** Ile nazwisk męskich z progiem 300 pominięto, bo żeńskiej formy nie ma w rejestrze kobiet. */
  bezPary: number;
  /** Ile nazwisk z progiem 300 odrzuciła lista zakazanych. */
  zakazanych: number;
}

/** Wszystkie tabele nazwisk, w kolejności `PLIK_WOJEWODZTWA`. Mężczyźni wyznaczają listę i liczbę; forma żeńska to
    `zenskaForma` albo, jeśli w rejestrze kobiet jej nie ma, to samo nazwisko (Oleksy), z wymaganiem co najmniej 10%
    liczby mężczyzn w kraju. Nazwiska bez takiej pary odpadają. */
export function tabeleNazwisk(
  d: DaneNazwisk,
  opcje: OpcjeNazwisk = OPCJE_NAZWISK,
): { tabele: TabeleNazwisk[]; diagnostyka: DiagnostykaNazwisk[] } {
  const sumy = (p: Plec): Licznik => {
    const s: Licznik = new Map();
    for (const m of d.woj[p].values()) for (const [n, c] of m) dodaj(s, n, c);
    return s;
  };
  const sumyWoj = { M: sumy('M'), K: sumy('K') };
  const nazwa = (w: string): string => {
    const n = w.toLowerCase();
    if (!(n in PLIK_WOJEWODZTWA)) throw new Error(`Nieznane województwo „${w}” w pliku nazwisk`);
    return n;
  };
  const obecne = new Map([...d.woj.M.keys()].map((w) => [nazwa(w), w]));
  for (const w of d.woj.K.keys()) {
    if (!obecne.has(nazwa(w)))
      throw new Error(`Województwo „${w}” jest w nazwiskach kobiet, a nie ma go w nazwiskach mężczyzn`);
  }
  const para = new Map<string, string | null>();
  const parujZ = (n: string): string | null => {
    const znana = para.get(n);
    if (znana !== undefined) return znana;
    let najlepsza: string | null = null;
    let ile = 0;
    for (const f of new Set([zenskaForma(n), n])) {
      const c = d.kraj.K.get(f) ?? 0;
      if (c > ile) {
        ile = c;
        najlepsza = f;
      }
    }
    const wynik = najlepsza !== null && 10 * ile >= (d.kraj.M.get(n) ?? 0) ? najlepsza : null;
    para.set(n, wynik);
    return wynik;
  };
  const udzial = (mapa: Licznik, suma: Licznik): number => {
    let razem = 0;
    let lokalne = 0;
    for (const [n, c] of mapa) {
      razem += c;
      const s = suma.get(n) ?? 0;
      if (s >= PROG_NAZWISKA_LOKALNEGO && 2 * c >= s) lokalne += c;
    }
    return razem === 0 ? 0 : zaokraglij(10_000 * lokalne, razem);
  };

  const tabele: TabeleNazwisk[] = [];
  const diagnostyka: DiagnostykaNazwisk[] = [];
  for (const woj of Object.keys(PLIK_WOJEWODZTWA)) {
    const klucz = obecne.get(woj);
    if (klucz === undefined) continue;
    const mezczyzni = d.woj.M.get(klucz)!;
    const kobiety = [...d.woj.K.entries()].find(([w]) => nazwa(w) === woj)?.[1] ?? new Map();
    const kandydaci: [string, string, number][] = [];
    let bezPary = 0;
    let zakazanych = 0;
    for (const [n, c] of mezczyzni) {
      if ((d.kraj.M.get(n) ?? 0) < PROG_NAZWISKA_W_KRAJU || !WZOR_NAZWISKA.test(n)) continue;
      const zona = parujZ(n);
      if (d.zakazane.has(n) || (zona !== null && d.zakazane.has(zona))) {
        zakazanych++;
        continue;
      }
      if (zona === null) {
        bezPary++;
        continue;
      }
      kandydaci.push([n, zona, c]);
    }
    kandydaci.sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const lokalne = kandydaci.filter(([n, , c]) => {
      const s = sumyWoj.M.get(n) ?? 0;
      return s >= PROG_NAZWISKA_LOKALNEGO && 2 * c >= s;
    });
    const zapis = (l: [string, string, number][], ile: number): [string, string, number][] =>
      l.slice(0, ile).map(([m, z, c]) => [wielkaLitera(m), wielkaLitera(z), c]);
    const udzialM = udzial(mezczyzni, sumyWoj.M);
    tabele.push({
      wersja: WERSJA_TABEL,
      woj,
      ogolne: zapis(kandydaci, opcje.ogolne),
      lokalne: zapis(lokalne, opcje.lokalne),
      udzialLokalnych: udzialM,
    });
    diagnostyka.push({
      woj,
      udzialM,
      udzialK: udzial(kobiety, sumyWoj.K),
      lokalnychPrzedUcieciem: lokalne.length,
      bezPary,
      zakazanych,
    });
  }
  return { tabele, diagnostyka };
}
