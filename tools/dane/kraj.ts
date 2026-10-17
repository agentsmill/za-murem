/* Czytniki tabel krajowych dla `npm run dane:kraj`: Tablica A trwania życia GUS, płodność z Eurostatu, szablon
   gospodarstw z aneksu „Rodziny w Polsce”, struktura wieku z prognozy GUS i nota SGJP z nagłówka słownika. Czyste
   funkcje na wierszach XLSX, tekście CSV i bajtach, bez dostępu do plików, żeby dało się je testować na małych
   danych. Każdy czytnik sprawdza, czy plik ma oczekiwaną budowę, i przy niezgodzie zatrzymuje się z opisem. */

import zlib from 'node:zlib';
import type { GrupaWieku, KluczQx, Marginesy, Sklad, TabeleKraju, Wielkosc } from '../../src/mieszkancy/tabele.ts';
import { GRUPY_WIEKU } from './gminy.ts';
import type { Komorka } from './xlsx.ts';

const sumuj = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

// ---------------------------------------------------------------- Tablica A trwania życia 2025 (GUS)

/** Arkusze Tablicy A i klucze w `qx`, w kolejności z typu `TabeleKraju`. */
export const ARKUSZE_QX: Record<string, KluczQx> = {
  'Miasta M': 'miastaM',
  'Miasta K': 'miastaK',
  'Wieś M': 'wiesM',
  'Wieś K': 'wiesK',
  'Ogółem mężczyźni': 'polskaM',
  'Ogółem kobiety': 'polskaK',
};

/** qx dla wieku 0-100 na 100 000 (zaokrąglone) i e(0) z kolumny ex pliku. Wiersze danych to te, które mają liczbę
    w pierwszej kolumnie (wiek x); kolumny: x, qx, lx, dx, Lx, Tx, ex. Sprawdza ciągłość wieku, przedział qx
    i zgodność kolumny lx z łańcuchem lx(x+1) = lx(x) * (1 - qx) z dokładnością do zaokrągleń pliku (2 osoby). */
export function qxZArkusza(w: Komorka[][]): { qx: number[]; ex0: number } {
  const dane = w.filter((r) => typeof r[0] === 'number');
  if (dane.length === 0) throw new Error('Tablica A: arkusz nie ma wierszy z wiekiem');
  const qx: number[] = [];
  let lx = 100000;
  dane.forEach((r, i) => {
    if (r[0] !== i) throw new Error(`Tablica A: brak wieku ${i} (kolejny wiersz ma ${r[0]})`);
    const q = r[1];
    if (typeof q !== 'number' || !(q >= 0 && q <= 1)) throw new Error(`Tablica A: qx w wieku ${i} poza [0, 1]: ${q}`);
    if (typeof r[2] !== 'number' || Math.abs(r[2] - lx) > 2) {
      throw new Error(`Tablica A: lx w wieku ${i} to ${r[2]}, a z qx wychodzi ${lx.toFixed(1)}`);
    }
    qx.push(Math.round(q * 100000));
    lx *= 1 - q;
  });
  if (dane.length !== 101) throw new Error(`Tablica A: ${dane.length} wierszy wieku, oczekiwano 101 (0-100)`);
  const ex0 = dane[0][6];
  if (typeof ex0 !== 'number') throw new Error('Tablica A: wiek 0 nie ma liczby w kolumnie ex');
  return { qx, ex0 };
}

/** Przeciętne dalsze trwanie życia przy urodzeniu z samego qx (na 100 000, wiek 0-100): zgon w środku roku, po
    100. roku stałe ryzyko, czyli średnio (1 - q) / q pełnych lat i pół roku. Od kolumny ex pliku różni się o ok. 0,01. */
export function e0ZQx(qx: readonly number[]): number {
  let zyje = 1;
  let lata = 0;
  for (let x = 0; x < 100; x++) {
    const zgony = (zyje * qx[x]) / 1e5;
    lata += zyje - zgony / 2;
    zyje -= zgony;
  }
  const q = qx[100] / 1e5;
  return lata + zyje * ((1 - q) / q + 0.5);
}

/** Szansa przeżycia od wieku `od` do wieku `doWieku` (qx na 100 000). */
export function przezycieZQx(qx: readonly number[], od: number, doWieku: number): number {
  let p = 1;
  for (let x = od; x < doWieku; x++) p *= 1 - qx[x] / 1e5;
  return p;
}

// ---------------------------------------------------------------- płodność wg wieku (Eurostat demo_frate)

/** Urodzenia na 10 000 kobiet rocznie w wieku 15-49 lat (35 liczb): wiersze Polski za 2024 z pojedynczymi latami
    wieku (Y15 … Y49), kolumna OBS_VALUE to urodzenia na jedną kobietę. Zaokrąglenie dziesiętne, połówka w górę,
    liczone na liczbach całkowitych (pięć miejsc po przecinku), żeby 0,00005 nie zależało od błędów zmiennoprzecinkowych. */
export function plodnoscZCsv(csv: string): number[] {
  const linie = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  const naglowek = (linie[0] ?? '').split(',');
  const kolumna = (nazwa: string): number => {
    const i = naglowek.indexOf(nazwa);
    if (i < 0) throw new Error(`Eurostat demo_frate: nagłówek bez kolumny ${nazwa}: ${JSON.stringify(linie[0])}`);
    return i;
  };
  const [iUnit, iAge, iGeo, iRok, iWartosc] = ['unit', 'age', 'geo', 'TIME_PERIOD', 'OBS_VALUE'].map(kolumna);
  const wynik = new Map<number, number>();
  for (const linia of linie.slice(1)) {
    const p = linia.split(',');
    if (p.length !== naglowek.length) throw new Error(`Eurostat demo_frate: wiersz ma inną liczbę kolumn: ${linia}`);
    if (p[iGeo] !== 'PL' || p[iRok] !== '2024' || p[iUnit] !== 'NR') continue;
    const wiek = /^Y(\d{2})$/.exec(p[iAge]);
    if (!wiek || Number(wiek[1]) < 15 || Number(wiek[1]) > 49) continue;
    const a = Number(wiek[1]);
    if (!/^\d+(\.\d{1,5})?$/.test(p[iWartosc])) {
      throw new Error(`Eurostat demo_frate: wiek ${a} ma wartość „${p[iWartosc]}” zamiast liczby z 5 miejscami`);
    }
    if (wynik.has(a)) throw new Error(`Eurostat demo_frate: wiek ${a} występuje dwa razy (Polska, 2024)`);
    const jednostki = Math.round(Number(p[iWartosc]) * 1e5); // 1e-5 na kobietę
    if (jednostki >= 1e5) throw new Error(`Eurostat demo_frate: wiek ${a} ma ponad jedno urodzenie na kobietę`);
    wynik.set(a, Math.floor((jednostki + 5) / 10)); // na 10 000
  }
  const wartosci: number[] = [];
  for (let a = 15; a <= 49; a++) {
    const v = wynik.get(a);
    if (v === undefined) throw new Error(`Eurostat demo_frate: brak wieku ${a} dla Polski w 2024`);
    wartosci.push(v);
  }
  return wartosci;
}

/** Mnożnik płodności obszaru na 10 000, taki że krzywa `plodnosc` x mnożnik / 10 000 daje TFR obszaru według GUS.
    `tfrTys` to TFR obszaru w tysięcznych (np. 1069), `plodnosc` to krzywa na 10 000 kobiet (jej suma / 10 000 to
    jej własny TFR, u Eurostatu o ok. 3,5% wyższy niż GUS). Mnożnik = TFR obszaru / TFR krzywej, więc
    10 000 x (tfrTys / 1000) / (suma / 10 000) = 100 000 x tfrTys / suma. */
export function mnoznikTfr(tfrTys: number, plodnosc: readonly number[]): number {
  const s = sumuj(plodnosc);
  if (s <= 0) throw new Error('Mnożnik płodności: krzywa płodności ma zerową sumę');
  return Math.round((100000 * tfrTys) / s);
}

/** Wartości przeskalowane tak, żeby dawały dokładnie `cel` (np. 10 000): metoda największych reszt na liczbach
    całkowitych, remis rozstrzyga niższy indeks. Wejście to liczby nieujemne o dodatniej sumie. */
export function normalizujDo(wartosci: readonly number[], cel: number): number[] {
  if (wartosci.some((v) => v < 0)) throw new Error('Normalizacja: wartość ujemna');
  const razem = sumuj(wartosci);
  if (razem <= 0) throw new Error('Normalizacja: suma wartości musi być dodatnia');
  const iloczyny = wartosci.map((v) => v * cel);
  const wynik = iloczyny.map((n) => (n - (n % razem)) / razem);
  let brak = cel - sumuj(wynik);
  const wgReszty = [...wartosci.keys()].sort((a, b) => (iloczyny[b] % razem) - (iloczyny[a] % razem) || a - b);
  for (const i of wgReszty) {
    if (brak <= 0) break;
    wynik[i]++;
    brak--;
  }
  return wynik;
}

// ---------------------------------------------------------------- szablon gospodarstw (aneks „Rodziny w Polsce”)

type Obszar = 'miasta' | 'wies';
type Flaga = 'bez60' | '60+';
type SkladAneksu = 'jedno' | 'dwu' | 'trzy+' | 'nier';

const WIELKOSCI: Wielkosc[] = ['1', '2', '3', '4', '5+'];
const FLAGI: Flaga[] = ['bez60', '60+'];
const OBSZARY: Obszar[] = ['miasta', 'wies'];
const NAGLOWKI_OBSZAROW: Record<Obszar, string> = { miasta: 'MIASTA', wies: 'WIEŚ' };
const SKLADY_ANEKSU: Record<string, SkladAneksu> = {
  jednorodzinne: 'jedno',
  dwurodzinne: 'dwu',
  'trzy i więcej rodzinne': 'trzy+',
  nierodzinne: 'nier',
};
/** Skład w kluczu szablonu i skład z aneksu, z którego bierze się jego liczby; nierodzinne dzielą się wielkością. */
const SKLADY_KLUCZA: [Sklad, SkladAneksu][] = [
  ['jedno', 'jedno'],
  ['dwu', 'dwu'],
  ['trzy+', 'trzy+'],
  ['nier1', 'nier'],
  ['nier+', 'nier'],
];
const WIERSZ_60 = /^(bez osób|z osobami) w wieku 60 lat i więcej$/i;

const pierwszaLinia = (c: Komorka): string =>
  String(c ?? '')
    .split(/\r?\n/)[0]
    .trim();

/** Komórka z liczbą gospodarstw: liczba albo „x” (połączenie niemożliwe) i kreska (zero). */
function liczbaZKomorki(c: Komorka, gdzie: string): number {
  if (typeof c === 'number') return c;
  if (c === 'x' || c === '–' || c === '-') return 0;
  throw new Error(`Aneks: ${gdzie} ma wartość ${JSON.stringify(c)} zamiast liczby`);
}

/** Kolumny 3-8 (osoby: 1, 2, 3, 4, 5, 6 i więcej) wiersza → pięć wielkości; 5 i 6+ osób razem. */
function wielkosci(r: Komorka[], gdzie: string): number[] {
  const k = [2, 3, 4, 5, 6, 7].map((i) => liczbaZKomorki(r[i], `${gdzie}, kolumna ${i + 1}`));
  return [k[0], k[1], k[2], k[3], k[4] + k[5]];
}

interface SekcjaTabl5 {
  /** Wiersz RAZEM: kolumna „Ogółem” i pięć wielkości. */
  razem?: { suma: number; wielkosci: number[] };
  /** Wiersze składów (dla kontroli sum). */
  sklady: Partial<Record<SkladAneksu, number[]>>;
  /** Wiersze „bez osób 60+” i „z osobami 60+” pod składem. */
  flagi: Partial<Record<SkladAneksu, Partial<Record<Flaga, number[]>>>>;
}

/** Tabl. 5 aneksu: sekcje MIASTA i WIEŚ. Sekcja „kraj” (OGÓŁEM) jest pomijana, bo szablon ma tylko miasta i wieś.
    Podziały pod „z osobami 60+” (wyłącznie z osobami 60+, bez osób spoza rodziny …) nie są nowymi kategoriami,
    więc nie są liczone. */
function czytajTabl5(t5: Komorka[][]): Record<Obszar, SekcjaTabl5> {
  const sekcje: Record<Obszar, SekcjaTabl5> = {
    miasta: { sklady: {}, flagi: {} },
    wies: { sklady: {}, flagi: {} },
  };
  let kraj = false;
  let obszar: Obszar | null = null;
  let sklad: SkladAneksu | null = null;
  for (const r of t5) {
    const l = pierwszaLinia(r[0]);
    if (l === 'OGÓŁEM TOTAL') {
      kraj = true;
      obszar = null;
      sklad = null;
    } else if (l.startsWith('MIASTA') || l.startsWith('WIEŚ')) {
      kraj = false;
      obszar = l.startsWith('MIASTA') ? 'miasta' : 'wies';
      sklad = null;
    } else if (kraj || obszar === null) {
    } else if (l === 'RAZEM') {
      const gdzie = `tabl. 5, ${obszar}, RAZEM`;
      sekcje[obszar].razem = { suma: liczbaZKomorki(r[1], gdzie), wielkosci: wielkosci(r, gdzie) };
      sklad = null;
    } else if (SKLADY_ANEKSU[l.toLowerCase()]) {
      sklad = SKLADY_ANEKSU[l.toLowerCase()];
      sekcje[obszar].sklady[sklad] = wielkosci(r, `tabl. 5, ${obszar}, ${l}`);
    } else if (sklad !== null && WIERSZ_60.test(l)) {
      const flaga: Flaga = l.toLowerCase().startsWith('bez') ? 'bez60' : '60+';
      const flagi = (sekcje[obszar].flagi[sklad] ??= {});
      if (flagi[flaga]) throw new Error(`Aneks: tabl. 5, ${obszar}, ${sklad}: wiersz „${l}” występuje dwa razy`);
      flagi[flaga] = wielkosci(r, `tabl. 5, ${obszar}, ${sklad}, ${l}`);
    }
  }
  return sekcje;
}

/** Klucze `${wielkość}|${skład}|${flaga}` z liczbami gospodarstw jednego obszaru, z kontrolą sum. */
function szablonObszaru(o: Obszar, sekcja: SekcjaTabl5): Record<string, number> {
  const naglowek = NAGLOWKI_OBSZAROW[o];
  const razem = sekcja.razem;
  if (!razem) throw new Error(`Aneks: w tabl. 5 brak sekcji ${naglowek} z wierszem RAZEM`);
  for (const s of Object.values(SKLADY_ANEKSU)) {
    for (const f of FLAGI) {
      if (!sekcja.flagi[s]?.[f]) throw new Error(`Aneks: tabl. 5, ${naglowek}: brak wiersza „${s}”, ${f}`);
    }
  }
  const wpisy = new Map<string, number>();
  for (const [skladKlucza, zrodlo] of SKLADY_KLUCZA) {
    WIELKOSCI.forEach((wielkosc, i) => {
      if (skladKlucza === 'nier1' ? i !== 0 : skladKlucza === 'nier+' && i === 0) return; // nierodzinne: 1 osoba albo więcej
      for (const f of FLAGI) {
        const n = sekcja.flagi[zrodlo]?.[f]?.[i] ?? 0;
        if (n > 0 && i === 0 && zrodlo !== 'nier') {
          throw new Error(`Aneks: tabl. 5, ${naglowek}: niemożliwe, ${n} gospodarstw ${zrodlo} z 1 osobą`);
        }
        if (n > 0) wpisy.set(`${wielkosc}|${skladKlucza}|${f}`, n);
      }
    });
  }
  const suma = sumuj([...wpisy.values()]);
  if (suma !== razem.suma) {
    throw new Error(`Aneks: tabl. 5, ${naglowek}: suma kategorii ${suma} różni się od wiersza RAZEM ${razem.suma}`);
  }
  WIELKOSCI.forEach((wielkosc, i) => {
    const poWielkosci = sumuj([...wpisy].filter(([k]) => k.startsWith(`${wielkosc}|`)).map(([, n]) => n));
    if (poWielkosci !== razem.wielkosci[i]) {
      throw new Error(
        `Aneks: tabl. 5, ${naglowek}: gospodarstw o wielkości ${wielkosc} jest ${poWielkosci}, w wierszu RAZEM ${razem.wielkosci[i]}`,
      );
    }
  });
  for (const [s, deklarowane] of Object.entries(sekcja.sklady) as [SkladAneksu, number[]][]) {
    deklarowane.forEach((n, i) => {
      const policzone = sumuj(FLAGI.map((f) => sekcja.flagi[s]?.[f]?.[i] ?? 0));
      if (policzone !== n) {
        throw new Error(`Aneks: tabl. 5, ${naglowek}, ${s}: bez60 + 60+ to ${policzone}, w wierszu składu ${n}`);
      }
    });
  }
  return Object.fromEntries(wpisy);
}

/** Szablon wielkość × skład × osoby 60+ dla miast i wsi z tabl. 5 aneksu GUS, sprawdzony z tabl. 4 (ta sama
    wielkość × liczba osób 60+). Skład: jednorodzinne, dwurodzinne, trzy i więcej rodzinne oraz nierodzinne
    rozdzielone na jednoosobowe (nier1) i wieloosobowe (nier+). Wartości to liczby gospodarstw; połączenia
    niemożliwe (np. rodzina w gospodarstwie jednoosobowym) i zera nie dostają kluczy. Klucze: skład, potem wielkość,
    potem bez60 przed 60+. */
export function szablonZAneksu(t4: Komorka[][], t5: Komorka[][]): TabeleKraju['szablonGospodarstw'] {
  const sekcje = czytajTabl5(t5);
  const wynik = { miasta: szablonObszaru('miasta', sekcje.miasta), wies: szablonObszaru('wies', sekcje.wies) };
  sprawdzZTabl4(t4, wynik);
  return wynik;
}

/** Tabl. 4 (wielkość × liczba osób 60+) musi się zgadzać z tabl. 5: w każdej wielkości suma gospodarstw bez osób
    60+ i z osobami 60+ jest ta sama, niezależnie od składu rodzinnego. */
function sprawdzZTabl4(t4: Komorka[][], szablon: TabeleKraju['szablonGospodarstw']): void {
  let kraj = false;
  let obszar: Obszar | null = null;
  const znalezione = new Set<string>();
  for (const r of t4) {
    const l = pierwszaLinia(r[0]);
    if (l === 'OGÓŁEM') {
      kraj = true;
      obszar = null;
    } else if (l.startsWith('MIASTA') || l.startsWith('WIEŚ')) {
      kraj = false;
      obszar = l.startsWith('MIASTA') ? 'miasta' : 'wies';
    } else if (!kraj && obszar !== null && WIERSZ_60.test(l)) {
      const o: Obszar = obszar;
      const flaga: Flaga = l.toLowerCase().startsWith('bez') ? 'bez60' : '60+';
      const z4 = wielkosci(r, `tabl. 4, ${o}, ${l}`);
      WIELKOSCI.forEach((wielkosc, i) => {
        const z5 = sumuj(SKLADY_KLUCZA.map(([s]) => szablon[o][`${wielkosc}|${s}|${flaga}`] ?? 0));
        if (z5 !== z4[i]) {
          throw new Error(`Aneks: tabl. 4 (${o}, ${flaga}, wielkość ${wielkosc}) ma ${z4[i]}, a tabl. 5 daje ${z5}`);
        }
      });
      znalezione.add(`${o}|${flaga}`);
    }
  }
  for (const o of OBSZARY) {
    for (const f of FLAGI) {
      if (!znalezione.has(`${o}|${f}`)) throw new Error(`Aneks: w tabl. 4 brak wiersza ${o}, ${f}`);
    }
  }
}

// ---------------------------------------------------------------- struktura wieku (prognoza ludności GUS)

/** Płeć i 10-letnie grupy wieku z Tabl. 1 prognozy GUS (stan na 31 XII, kolumna `rok`, np. „2022*” to dane
    empiryczne). Bloki Ogółem, Mężczyźni, Kobiety mają po 101 wierszy: wiek 0-99 i „100+”. Grupa 80+ to wiek 80-100+.
    Sprawdza sumy roczników z wierszem „Ogółem” bloku i mężczyźni + kobiety z blokiem ogółem. */
export function wiekZPrognozy(w: Komorka[][], rok = '2022*'): Marginesy['wiek'] {
  const iNaglowka = w.findIndex((r) => String(r[0] ?? '').startsWith('Płeć'));
  if (iNaglowka < 0) throw new Error('Prognoza: brak wiersza nagłówka z kolumną „Płeć”');
  const kolumna = w[iNaglowka].findIndex((c) => String(c) === rok);
  if (kolumna < 0) throw new Error(`Prognoza: brak kolumny roku ${rok}`);

  type Blok = { deklarowana: number; roczniki: number[] };
  const bloki: Partial<Record<'O' | 'M' | 'K', Blok>> = {};
  let blok: Blok | null = null;
  for (const r of w.slice(iNaglowka + 1)) {
    if (typeof r[0] === 'string' && r[0].trim() !== '') {
      const klucz = r[0].startsWith('Ogółem')
        ? 'O'
        : r[0].startsWith('Mężczyźni')
          ? 'M'
          : r[0].startsWith('Kobiety')
            ? 'K'
            : null;
      blok = null;
      if (klucz) {
        if (bloki[klucz]) throw new Error(`Prognoza: blok „${r[0]}” występuje dwa razy`);
        const deklarowana = r[kolumna];
        if (typeof deklarowana !== 'number') throw new Error(`Prognoza: blok „${r[0]}” nie ma sumy w kolumnie ${rok}`);
        blok = bloki[klucz] = { deklarowana, roczniki: [] };
      }
      continue;
    }
    if (!blok) continue;
    const i = blok.roczniki.length;
    const wiek = r[1];
    if (wiek !== (i === 100 ? '100+' : i))
      throw new Error(`Prognoza: oczekiwano wieku ${i === 100 ? '100+' : i}, jest ${JSON.stringify(wiek)}`);
    const v = r[kolumna];
    if (typeof v !== 'number') throw new Error(`Prognoza: wiek ${i} nie ma liczby w kolumnie ${rok}`);
    blok.roczniki.push(v);
  }

  const nazwy = { O: 'Ogółem', M: 'Mężczyźni', K: 'Kobiety' } as const;
  for (const k of ['O', 'M', 'K'] as const) {
    const b = bloki[k];
    if (!b) throw new Error(`Prognoza: brak bloku ${nazwy[k]}`);
    if (b.roczniki.length !== 101)
      throw new Error(`Prognoza: blok ${nazwy[k]} ma ${b.roczniki.length} roczników, oczekiwano 101`);
    if (sumuj(b.roczniki) !== b.deklarowana) {
      throw new Error(`Prognoza: suma roczników bloku ${nazwy[k]} to ${sumuj(b.roczniki)}, w wierszu ${b.deklarowana}`);
    }
  }
  const [o, m, k] = [bloki.O!, bloki.M!, bloki.K!];
  if (m.deklarowana + k.deklarowana !== o.deklarowana) {
    throw new Error(`Prognoza: mężczyźni ${m.deklarowana} + kobiety ${k.deklarowana} to nie ogółem ${o.deklarowana}`);
  }

  const grupy = (roczniki: number[]): Record<GrupaWieku, number> => {
    const wynik = Object.fromEntries(GRUPY_WIEKU.map((g) => [g, 0])) as Record<GrupaWieku, number>;
    roczniki.forEach((v, a) => {
      wynik[GRUPY_WIEKU[Math.min(8, Math.floor(a / 10))]] += v;
    });
    return wynik;
  };
  return { M: grupy(m.roczniki), K: grupy(k.roczniki) };
}

// ---------------------------------------------------------------- nota SGJP

/** Identyfikator słownika i nota copyrightowa z nagłówka `sgjp-*.tab.gz`. Nagłówek to komentarze na początku
    skompresowanego pliku (`#!DICT-ID …`, blok `#<COPYRIGHT> … #</COPYRIGHT>`), więc wystarczy początek pliku;
    rozpakowanie urywa się razem z danymi (Z_SYNC_FLUSH), bez błędu o niedokończonym strumieniu. Nota wraca
    z końcami linii LF i bez pustych linii na brzegach, poza tym bez zmian. */
export function notaSgjp(poczatek: Buffer): { idSlownika: string; nota: string } {
  const tekst = zlib
    .gunzipSync(poczatek, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
    .toString('utf8')
    .replace(/\r\n/g, '\n');
  const blok = /#<COPYRIGHT>\n([\s\S]*?)\n#<\/COPYRIGHT>/.exec(tekst);
  if (!blok)
    throw new Error(
      'SGJP: w początku pliku nie ma bloku #<COPYRIGHT> … #</COPYRIGHT> (nagłówek dłuższy niż wczytany?)',
    );
  const id = /^#!DICT-ID\s+(\S+)/m.exec(tekst)?.[1];
  if (!id) throw new Error('SGJP: w początku pliku nie ma linii #!DICT-ID');
  return { idSlownika: id, nota: blok[1].trim() };
}
