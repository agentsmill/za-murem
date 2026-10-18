/* Czytniki i reguły tabel imion i nazwisk dla `npm run dane:imiona`: rejestr PESEL z dane.gov.pl (Ministerstwo
   Cyfryzacji, CC0). Czyste funkcje na wierszach CSV i XLSX oraz na licznikach w pamięci, bez dostępu do plików, żeby
   dało się je testować na małych danych; wczytywanie plików jest w imiona-pliki.ts.

   Imiona:
   - `lata`: pierwsze imiona nadane dzieciom w latach 2000-2025 (zbiór 219), 200 najczęstszych na płeć i rok;
   - `koszyki`: imiona osób urodzonych przed 2000 r. Otwartych danych „imię × rok urodzenia” dla osób żyjących nie ma,
     więc rocznik zgadujemy z odsetka zmarłych wśród osób z danym imieniem urodzonych przed 2000 r. Takich osób jest
     tyle, ile żyjących 20.01.2026 minus nadania 2000-2025, a zmarłych tyle, ile jest ich w rejestrze ze zmarłymi
     ponad żyjących. Udział zmarłych to (razem ze zmarłymi − żyjący) / razem ze zmarłymi, liczony dla tej kohorty,
     czyli z obu liczb odjęte nadania 2000-2025 (inaczej nowa moda rozcieńczałaby go u imion, które wracają).
     Metoda notatek badawczych („prostsza wersja do gry”): progi udziału zmarłych 60 / 30 / 12 / 5%, pięć koszyków
     (klucze 1920-1945 … 1990-1999 to nazwy, rzeczywiste roczniki typowych imion w koszykach są starsze, wg notatek
     1920-45, 1940-60, 1950-70, 1965-85 i 1975-99). Cztery poprawki ponad nią, bo samo „jedno imię, jeden koszyk” gubiło
     najczęstsze imiona kohort (Maria, Anna, Katarzyna):
     1. miękkie członkostwo: imię dzieli się między swój koszyk a sąsiedni, liniowo według położenia udziału
        zmarłych między środkami koszyków (`podzialKoszykow`), więc Maria (49%) ma część wśród najstarszych, a Anna (24%)
        wśród koszyków 1946-1959 i 1960-1974;
     2. koszyk 1990-1999 to w połowie ten szacunek, a w połowie lista imion nadanych w 2000 r. (najbliższy prawdziwy
        rok), osobno dla każdej płci; udział zmarłych poniżej 5% nie odróżnia roczników 1975-1999;
     3. żadne imię nie ma więcej niż 25% wagi koszyka (`ograniczUdzial`);
     4. wagą imienia jest liczba żyjących z kohorty, a u siedmiu imion dwufalowych (`DWUFALOWE`) tylko jej część
        równa udziałowi zmarłych (wpisane ręcznie do koszyka 1920-1945);
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
    .replace(/^\uFEFF/, '')
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

/** Znaki, jakich nie ma w polskich imionach, także w modnych zachodnich pisowniach: Y na początku (Yaroslav, Yuliya),
    kh (Mykhailo), podwójne i (Andrii, Nataliia, Emiliia), końcówki -iy, -ei i -yi (Matviy, Andrei) oraz przedrostki
    Oleks- (Oleksandr zamiast Aleksander) i Aliak- (Aliaksandr). */
const ZNAKI_SILNE: readonly RegExp[] = [/^y/, /kh/, /ii/, /iy$/, /ei$/, /yi$/, /^oleks/, /^aliak/];

/** Litery spoza polskiego alfabetu: v, x, q. Występują też w zachodnich imionach, które Polacy nadają dzieciom (Kevin,
    Oliver, Alex, Violetta), więc same nie wystarczają, żeby wyrzucić imię z koszyków. */
const ZNAKI_SLABE = /[vxq]/;

/** Ukraińskie, białoruskie, rosyjskie i obcojęzyczne pisownie bez takich znaków. Tylko te, które różnią się od polskiej
    pisowni tego samego imienia (Dmytro, nie Dymitr; Michael, nie Michał; Eduard, nie Edward); Roman, Igor, Bohdan,
    Hanna, Julia, Olga, Daria i Sofia są też polskie i zostają. */
const PISOWNIE_TRANSLITEROWANE = new Set([
  // mężczyźni
  'dmytro',
  'mykola',
  'artem',
  'oleh',
  'oleg',
  'denys',
  'denis',
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
  'lev',
  'myroslav',
  'sviatoslav',
  'uladzimir',
  'leonid',
  'vitali',
  'mark',
  'martin',
  'michael',
  'eduard',
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
  'alena',
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
  'varvara',
  'milana',
  'vita',
  'tatsiana',
  'anastasiya',
]);

/** Transliteracja pewna: znak, którego nie ma w polskich imionach, albo pisownia z listy. Takie imiona nie trafiają do
    koszyków nigdy, bez względu na przyrost. */
export function jestTransliteracjaSilna(imie: string): boolean {
  const n = imie.toLowerCase();
  return PISOWNIE_TRANSLITEROWANE.has(n) || ZNAKI_SILNE.some((w) => w.test(n));
}

/** Transliteracja pewna albo litera v, x, q (ta druga liczy się dopiero przy przyroście co najmniej `PROG_PRZYROSTU`). */
export function jestTransliteracja(imie: string): boolean {
  return jestTransliteracjaSilna(imie) || ZNAKI_SLABE.test(imie.toLowerCase());
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
/** Imię z przyrostem co najmniej tyle (od migawki z lipca 2019) i z literą v, x albo q albo ze znakiem pewnej
    transliteracji trafia do puli przyjezdnych. */
export const PROG_PRZYROSTU = 5000;
/** Imię z pewną transliteracją (znak spoza polskich imion albo pisownia z listy) trafia do puli przyjezdnych już od
    takiego przyrostu: to dzieci rodzin z Ukrainy urodzone w Polsce (Emiliia, Matviy, Zakhar) i ich rodzice. */
export const PROG_PRZYROSTU_SILNEJ = 500;
/** Przyjezdni wypadają z `lata` od tego roku (napływ po lutym 2022). Wcześniej tylko wtedy, gdy przed 2022 r. nadano
    im mniej niż `PROG_NADAN_PRZED_2022` razy; inaczej Alexander, David, Maksym czy Viktor, nadawani w Polsce od lat,
    znikałyby ze wszystkich lat. */
export const PIERWSZY_ROK_NAPLYWU = 2022;
export const PROG_NADAN_PRZED_2022 = 500;
/** Imię trafia do koszyka, gdy ma co najmniej tyle żyjących urodzonych przed 2000 r. Poniżej to różnica dwóch dużych
    liczb (żyjący minus nadania), czyli szum, a nie rocznik. */
export const PROG_ZYJACYCH_KOSZYKA = 5000;
/** Imię z XXI wieku: nadań po 2000 r. ponad tyle razy więcej niż żyjących urodzonych wcześniej (Nikodem, Amelia, Lena). */
export const MNOZNIK_MODY = 10;
export const IMION_W_KOSZYKU = 200;
/** Żadne imię nie ma więcej niż tyle procent wagi koszyka. */
export const MAX_UDZIAL_W_KOSZYKU = 25;
/** Rok listy imion, z którą koszyk 1990-1999 miesza się po połowie (najbliższy rok z prawdziwymi nadaniami). */
export const ROK_BAZOWY_NAJMLODSZEGO_KOSZYKA = 2000;
/** Powracające: co najmniej tyle zmarłych, tyle nadań w 2025 i pierwszej połowie 2026 oraz wzrost udziału o 30%. */
export const PROG_ZMARLYCH_POWRACAJACYCH = 3000;
export const PROG_NADAN_POWRACAJACYCH = 100;

/** Imiona o dwóch falach mody (stara, przedwojenna, i nowa, po 2010): sam odsetek zmarłych je myli, bo nowa fala
    rozcieńcza go albo, jak u Julii, zasłania starą. Wpisane ręcznie do najstarszego koszyka. */
export const DWUFALOWE: Record<Plec, readonly string[]> = {
  M: ['ANTONI', 'JAN', 'STANISŁAW', 'FRANCISZEK'],
  K: ['ZOFIA', 'JULIA', 'HELENA'],
};

/** Progi udziału zmarłych (w procentach) między koszykami od najstarszego: co najmniej 60% to 1920-1945, 30-60% to
    1946-1959, 12-30% to 1960-1974, 5-12% to 1975-1989, poniżej 5% to 1990-1999. Notatki badawcze podają 60 / 30 / 12 / 5%. */
export const PROGI_ZMARLYCH = [60, 30, 12, 5] as const;

/** Środki koszyków w promilach udziału zmarłych: 75, 45, 20, 10 i 2,5%. To środki przedziałów 60-90% (powyżej 90%
    imię prawie wygasło), 30-60%, 12-30% (21%), 5-12% (8,5%) i 0-5% zaokrąglone, a dwa z nich (20 i 10 zamiast 21 i 8,5)
    ustawione tak, żeby typowe imiona kohort przechodziły do sąsiedniego koszyka tak, jak w danych: Paulina i Karolina
    do 1990-1999, Danuta i Barbara do 1946-1959. Służą do miękkiego podziału imienia między sąsiednie koszyki. */
const SRODKI_KOSZYKOW: Record<KoszykImion, number> = {
  '1920-1945': 750,
  '1946-1959': 450,
  '1960-1974': 200,
  '1975-1989': 100,
  '1990-1999': 25,
};

/** Koszyk według udziału zmarłych wśród osób z imieniem urodzonych przed 2000 r.: zmarli / (zmarli + żyjący), progi
    `PROGI_ZMARLYCH`. Porównania na liczbach całkowitych. */
export function koszykWgZmarlych(zmarli: number, zyjacy: number): KoszykImion {
  const razem = zmarli + zyjacy;
  const sto = 100 * zmarli;
  if (sto >= PROGI_ZMARLYCH[0] * razem) return '1920-1945';
  if (sto >= PROGI_ZMARLYCH[1] * razem) return '1946-1959';
  if (sto >= PROGI_ZMARLYCH[2] * razem) return '1960-1974';
  if (sto >= PROGI_ZMARLYCH[3] * razem) return '1975-1989';
  return '1990-1999';
}

/** Miękkie członkostwo: imię należy do koszyka z `koszykWgZmarlych` i do sąsiedniego, w stronę którego leży jego udział
    zmarłych względem środka koszyka (starszego, gdy udział jest co najmniej taki jak środek, inaczej młodszego).
    Część sąsiedniego koszyka to odległość udziału od środka własnego koszyka dzielona przez odległość między środkami,
    czyli liniowa interpolacja; na progu koszyków jest ciągła. Najstarszy koszyk nie ma starszego sąsiada, a najmłodszy
    młodszego, wtedy imię jest całe w swoim. Część to ułamek licznik / mianownik. */
export function podzialKoszykow(
  zmarli: number,
  zyjacy: number,
): { glowny: KoszykImion; sasiedni: KoszykImion | null; licznik: number; mianownik: number } {
  const glowny = koszykWgZmarlych(zmarli, zyjacy);
  const razem = zmarli + zyjacy;
  const i = KOSZYKI_IMION.indexOf(glowny);
  const odSrodka = 1000 * zmarli - SRODKI_KOSZYKOW[glowny] * razem; // w promilach razy `razem`
  const j = odSrodka >= 0 ? i - 1 : i + 1;
  if (j < 0 || j >= KOSZYKI_IMION.length) return { glowny, sasiedni: null, licznik: 0, mianownik: 1 };
  const sasiedni = KOSZYKI_IMION[j];
  return {
    glowny,
    sasiedni,
    licznik: Math.abs(odSrodka),
    mianownik: Math.abs(SRODKI_KOSZYKOW[sasiedni] - SRODKI_KOSZYKOW[glowny]) * razem,
  };
}

/** Ucina wagi do `maxProcent` sumy (liczby całkowite): nadwyżkę ponad limit dostają pozostałe pozycje proporcjonalnie do
    ich wag, aż żadna nie przekracza limitu. Kolejność wejścia zostaje. Dla listy zbyt krótkiej, żeby limit dało się
    spełnić (mniej niż 100 / maxProcent pozycji), zwraca wagi bez zmian. */
export function ograniczUdzial(wagi: readonly number[], maxProcent: number): number[] {
  const w = [...wagi];
  if (maxProcent >= 100 || w.length * maxProcent < 100) return w;
  for (let obieg = 0; obieg < 1000; obieg++) {
    const suma = w.reduce((a, b) => a + b, 0);
    const limit = Math.floor((suma * maxProcent) / 100);
    let nadmiar = 0;
    for (let i = 0; i < w.length; i++) {
      if (w[i] > limit) {
        nadmiar += w[i] - limit;
        w[i] = limit;
      }
    }
    if (nadmiar === 0) break;
    const reszta = w.map((x, i) => (x < limit ? i : -1)).filter((i) => i >= 0);
    const baza = reszta.reduce((a, i) => a + w[i], 0);
    if (baza === 0) break;
    for (const i of reszta) w[i] += Math.floor((nadmiar * w[i]) / baza);
  }
  return w;
}

const nadaniaDoRoku = (d: DaneImion, p: Plec, imie: string): number => {
  let s = 0;
  for (let r = PIERWSZY_ROK; r <= OSTATNI_ROK; r++) s += d.urodzenia[r][p].get(imie) ?? 0;
  return s;
};

const nadaniaPrzedNaplywem = (d: DaneImion, p: Plec, imie: string): number => {
  let s = 0;
  for (let r = PIERWSZY_ROK; r < PIERWSZY_ROK_NAPLYWU; r++) s += d.urodzenia[r][p].get(imie) ?? 0;
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

/** Przyjezdni: imiona z przyrostem żyjących od migawki 2019 co najmniej `PROG_PRZYROSTU` i z transliteracją (także
    z literą v, x, q) albo co najmniej `PROG_PRZYROSTU_SILNEJ` i z transliteracją pewną. Wartość to przyrost. */
function przyjezdniPlci(d: DaneImion, p: Plec): Map<string, number> {
  const wynik = new Map<string, number>();
  for (const [imie, zyjacy] of d.zyjacy[p]) {
    const przyrost = zyjacy - (d.zyjacy2019[p].get(imie) ?? 0);
    if (
      (przyrost >= PROG_PRZYROSTU && jestTransliteracja(imie)) ||
      (przyrost >= PROG_PRZYROSTU_SILNEJ && jestTransliteracjaSilna(imie))
    ) {
      wynik.set(imie, przyrost);
    }
  }
  return wynik;
}

const nazwyZLiczba = (wpisy: Iterable<readonly [string, number]>, ile: number): ImieZLiczba[] =>
  [...wpisy]
    .sort(poLiczbie)
    .slice(0, ile)
    .map(([n, c]) => [wielkaLitera(n), c]);

/** Koszyki jednej płci. `wykluczone` to imiona obcego pochodzenia (przyjezdni i pewna transliteracja). */
function koszykiPlci(
  d: DaneImion,
  p: Plec,
  wykluczone: (imie: string) => boolean,
  maxUdzial: number,
): Record<KoszykImion, ImieZLiczba[]> {
  const wagi = Object.fromEntries(KOSZYKI_IMION.map((k) => [k, new Map<string, number>()])) as Record<
    KoszykImion,
    Map<string, number>
  >;
  const dodajWage = (k: KoszykImion, imie: string, w: number): void => {
    if (w > 0) wagi[k].set(imie, (wagi[k].get(imie) ?? 0) + w);
  };
  const dwufalowe = new Set(DWUFALOWE[p]);
  /** Imiona, które wolno wziąć także z listy nadań z 2000 r.: kohorta dość duża, nie z XXI wieku i nie z najstarszego
      koszyka (przedwojenne imiona w liście z 2000 r. to szum, a koszyk 1990-1999 ma ich nie mieć: Janina, Zygmunt). */
  const zKohorty = new Set<string>();
  for (const imie of d.zyjacy[p].keys()) {
    if (wykluczone(imie)) continue;
    const { zyjacySprzed2000: zyjacy, zmarli, nadania } = kohortaImienia(d, p, imie);
    const wolno = zyjacy >= PROG_ZYJACYCH_KOSZYKA && nadania <= MNOZNIK_MODY * zyjacy;
    if (wolno && koszykWgZmarlych(zmarli, zyjacy) !== KOSZYKI_IMION[0]) zKohorty.add(imie);
    if (dwufalowe.has(imie)) {
      // stara fala to część żyjących odpowiadająca udziałowi zmarłych; reszta to nowa fala (u Julii z lat 90. jest
      // w koszyku 1990-1999 dzięki liście z 2000 r.)
      if (zyjacy > 0) dodajWage('1920-1945', imie, zaokraglij(zyjacy * zmarli, zyjacy + zmarli));
    } else if (wolno) {
      const { glowny, sasiedni, licznik, mianownik } = podzialKoszykow(zmarli, zyjacy);
      const czescSasiedniego = sasiedni === null ? 0 : zaokraglij(zyjacy * licznik, mianownik);
      dodajWage(glowny, imie, zyjacy - czescSasiedniego);
      if (sasiedni !== null) dodajWage(sasiedni, imie, czescSasiedniego);
    }
  }

  // koszyk 1990-1999: po połowie szacunek z udziału zmarłych i lista nadań z 2000 r. (udziały obu, w skali szacunku)
  const najmlodszy = wagi['1990-1999'];
  const szacunek = [...najmlodszy.values()].reduce((a, b) => a + b, 0);
  const lista2000 = new Map<string, number>();
  for (const [imie, c] of d.urodzenia[ROK_BAZOWY_NAJMLODSZEGO_KOSZYKA][p]) {
    if (c >= PROG_NADAN_W_ROKU && zKohorty.has(imie)) lista2000.set(imie, c);
  }
  const nadania2000 = [...lista2000.values()].reduce((a, b) => a + b, 0);
  if (nadania2000 > 0) {
    // bez szacunku (pusty koszyk) zostaje sama lista z 2000 r.
    const udzialListy = szacunek > 0 ? 0.5 : 1;
    const skala = szacunek > 0 ? szacunek : nadania2000;
    const polaczone = new Map<string, number>();
    for (const imie of new Set([...najmlodszy.keys(), ...lista2000.keys()])) {
      const zSzacunku = szacunek > 0 ? (najmlodszy.get(imie) ?? 0) / szacunek : 0;
      const zListy = (lista2000.get(imie) ?? 0) / nadania2000;
      const w = Math.round(skala * ((1 - udzialListy) * zSzacunku + udzialListy * zListy));
      if (w > 0) polaczone.set(imie, w);
    }
    wagi['1990-1999'] = polaczone;
  }

  return Object.fromEntries(
    KOSZYKI_IMION.map((k) => {
      const wpisy = [...wagi[k]].sort(poLiczbie).slice(0, IMION_W_KOSZYKU);
      const ograniczone = ograniczUdzial(
        wpisy.map((x) => x[1]),
        maxUdzial,
      );
      const wynik: ImieZLiczba[] = wpisy.map(([n], i): ImieZLiczba => [wielkaLitera(n), ograniczone[i]]);
      return [k, wynik.sort((a, b) => b[1] - a[1])];
    }),
  ) as Record<KoszykImion, ImieZLiczba[]>;
}

/** Imiona pradziadków (udział zmarłych co najmniej 60% i co najmniej 3 000 zmarłych albo imię dwufalowe), których udział
    wśród nadań w pierwszej połowie 2026 jest co najmniej 1,3 raza większy niż w 2019. Od najczęściej nadawanych w 2025
    i pierwszej połowie 2026. */
function powracajacePlci(d: DaneImion, p: Plec, wykluczone: (imie: string) => boolean): string[] {
  const dwufalowe = new Set(DWUFALOWE[p]);
  const razem2019 = sumaRoku(d, 2019, p);
  const razem2026 = sumaRoku(d, 2026, p);
  const wynik: [string, number][] = [];
  for (const imie of d.zyjacy[p].keys()) {
    if (wykluczone(imie)) continue;
    const { zyjacySprzed2000, zmarli } = kohortaImienia(d, p, imie);
    const zyjacy = Math.max(zyjacySprzed2000, 0);
    const stare =
      dwufalowe.has(imie) ||
      (zmarli >= PROG_ZMARLYCH_POWRACAJACYCH && 100 * zmarli >= PROGI_ZMARLYCH[0] * (zmarli + zyjacy));
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

export interface OpcjeImion {
  /** Największy udział jednego imienia w wadze koszyka, w procentach (domyślnie `MAX_UDZIAL_W_KOSZYKU`). */
  maxUdzialWKoszyku: number;
}

export function tabeleImion(d: DaneImion, opcje: Partial<OpcjeImion> = {}): TabeleImion {
  const maxUdzial = opcje.maxUdzialWKoszyku ?? MAX_UDZIAL_W_KOSZYKU;
  const przyj = { M: przyjezdniPlci(d, 'M'), K: przyjezdniPlci(d, 'K') };
  const obce = (p: Plec) => (imie: string) => przyj[p].has(imie) || jestTransliteracjaSilna(imie);
  const lata: TabeleImion['lata'] = {};
  for (let rok = PIERWSZY_ROK; rok <= OSTATNI_ROK; rok++) {
    const wypada = (p: Plec, imie: string): boolean =>
      przyj[p].has(imie) && (rok >= PIERWSZY_ROK_NAPLYWU || nadaniaPrzedNaplywem(d, p, imie) < PROG_NADAN_PRZED_2022);
    const wpisy = (p: Plec): ImieZLiczba[] =>
      nazwyZLiczba(
        [...d.urodzenia[rok][p]].filter(([n, c]) => c >= PROG_NADAN_W_ROKU && !wypada(p, n)),
        IMION_NA_ROK,
      );
    lata[String(rok)] = { M: wpisy('M'), K: wpisy('K') };
  }
  const koszyki = { M: koszykiPlci(d, 'M', obce('M'), maxUdzial), K: koszykiPlci(d, 'K', obce('K'), maxUdzial) };
  return {
    wersja: WERSJA_TABEL,
    lata,
    koszyki: Object.fromEntries(
      KOSZYKI_IMION.map((k) => [k, { M: koszyki.M[k], K: koszyki.K[k] }]),
    ) as TabeleImion['koszyki'],
    powracajace: { M: powracajacePlci(d, 'M', obce('M')), K: powracajacePlci(d, 'K', obce('K')) },
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

/** Linie pliku z listą: bez pustych i bez komentarzy (linia zaczyna się od `#`, także po wcięciu), przycięte. */
function linieListy(tekst: string): { linia: string; numer: number }[] {
  return tekst
    .split(/\r?\n/)
    .map((l, i) => ({ linia: l.trim(), numer: i + 1 }))
    .filter((l) => l.linia !== '' && !l.linia.startsWith('#'));
}

/** Zbiór WIELKICH liter z pliku zakazanych nazwisk (jedno męskie nazwisko w linii, `#` zaczyna komentarz): forma
    męska i żeńska każdego. */
export function nazwiskaZakazane(tekst: string): Set<string> {
  const wynik = new Set<string>();
  for (const { linia } of linieListy(tekst)) {
    const n = linia.toUpperCase();
    wynik.add(n);
    wynik.add(zenskaForma(n));
  }
  return wynik;
}

/** Zakazane połączenia imienia z nazwiskiem (znane żyjące osoby o częstych nazwiskach, których nie da się wyciąć
    w całości jak nazwisk polityków): plik tools/dane/zakazane-polaczenia.txt, „Imię Nazwisko” w linii, nazwisko
    w formie, którą ta osoba nosi (Anna Lewandowska, Robert Lewandowski), `#` zaczyna komentarz. Wynik to napisy
    „Imię|Nazwisko” posortowane bez powtórzeń, w tej postaci w `TabeleImion.zakazanePolaczenia`. Pierwsze słowo to
    imię, reszta nazwisko; linia z jednym słowem albo ze słowem z małej litery zatrzymuje budowę. */
export function polaczeniaZakazane(tekst: string): string[] {
  const wynik = new Set<string>();
  for (const { linia, numer } of linieListy(tekst)) {
    const slowa = linia.split(/\s+/);
    if (slowa.length < 2 || slowa.some((s) => !/^\p{Lu}/u.test(s)))
      throw new Error(`zakazane połączenia, linia ${numer}: „${linia}”, oczekiwano „Imię Nazwisko” z wielkich liter`);
    wynik.add(`${slowa[0]}|${slowa.slice(1).join(' ')}`);
  }
  return [...wynik].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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
