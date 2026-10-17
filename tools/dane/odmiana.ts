/* Odmiana imion i nazwisk dla `npm run dane:odmiana`: z listy form SGJP (Morfeusz 2, `sgjp-20260823.tab.gz`, BSD-2)
   robi `public/data/mieszkancy/odmiana.json` (słownik pełnych paradygmatów dla imion i nazwisk z tabel gry) oraz
   `odmiana-koncowki.json` (tablica końcówek zgadywacza). Czyste funkcje na bajtach pliku i na liczonych w pamięci
   przykładach, bez dostępu do plików poza `wczytajSgjp`, żeby dało się je testować; zapis plików jest w
   tools/dane-odmiana.ts.

   Format SGJP: jeden wiersz to jedna forma, pięć kolumn rozdzielonych tabulatorem: forma, lemat (identyfikator
   leksemu, np. `Marek:Sm1`), znacznik (`subst:sg:gen.acc:m1`, kropka łączy przypadki albo liczby), klasa nazw własnych
   (`imię`, `nazwisko`, `imię|nazwisko`…) i kwalifikatory rozdzielone `|`. Plik jest niezaufany: czytamy go jak dane,
   nigdy nie wykonujemy.

   Zasady wyboru form:
   - bierzemy tylko liczbę pojedynczą (`subst`) leksemów z klasą `imię` albo `nazwisko` oraz mianownik liczby mnogiej
     nazwisk męskich (rodzaj m1), do „państwa X”;
   - formy z kwalifikatorem `pot.` i `niepopr.` odpadają (Hugo → Hugona, nie Huga). Z reszty wybieramy formę bez
     kwalifikatora, potem `rzad.`, potem każdą inną; przy remisie pierwszą w kolejności kodów znaków (Majo, nie Maju).
     Za poprawną uznajemy każdą formę, która nie odpadła;
   - leksem bez formy w którymś z siedmiu przypadków jest niepełny i nie wchodzi ani do słownika, ani do treningu.

   Tablica końcówek: dla każdego imienia (i osobno nazwiska) wzorzec = ile liter uciąć z mianownika i co dokleić
   w sześciu pozostałych przypadkach; dla każdej pary (płeć, sufiks do 6 liter) najczęstszy wzorzec. Sufiks, którego
   wzorzec jest taki sam jak sufiksu krótszego o literę, jest zbędny (najdłuższy pasujący sufiks da to samo), więc
   wypada. Do pomiaru dokładności co dziesiąty przykład (w kolejności posortowanej po mianowniku i płci, indeksy
   9, 19, 29, …) jest odkładany z treningu; tablica w grze uczy się na wszystkich. */

import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  type Formy,
  type FormyNazwiska,
  type OdmianaPlik,
  PRZYPADKI,
  type Przypadek,
  type TabelaKoncowek,
  type WzorzecKoncowek,
  zenskaFormaNazwiska,
  zgadnijKoncowkami,
  zgadnijNazwiskoReguly,
  zgadnijReguly,
} from '../../src/mieszkancy/odmiana.ts';
import { type TabeleImion, type TabeleNazwisk, WERSJA_TABEL } from '../../src/mieszkancy/tabele.ts';
import type { Plec } from '../../src/mieszkancy/typy.ts';

// ---------------------------------------------------------------- czytnik SGJP

/** Siedem przypadków w nazwach SGJP, w kolejności `PRZYPADKI`. */
const PRZYPADKI_SGJP: Record<string, Przypadek> = {
  nom: 'mian',
  gen: 'dop',
  dat: 'cel',
  acc: 'bier',
  inst: 'narz',
  loc: 'msc',
  voc: 'wol',
};

export interface FormaSgjp {
  forma: string;
  /** Kwalifikatory z piątej kolumny (`pot.`, `rzad.`…); pusta lista, gdy forma jest bez kwalifikatora. */
  kwal: string[];
}

export interface Leksem {
  /** Identyfikator leksemu z drugiej kolumny, np. `Marek:Sm1`. */
  lemat: string;
  klasy: string[];
  /** Rodzaj z znacznika: `m1` (osobowy męski), `f`, rzadko `m2` i `m3`. */
  rodzaj: string;
  /** Formy liczby pojedynczej według przypadków (leksem nieodmienny ma w każdym tę samą). */
  sg: Record<Przypadek, FormaSgjp[]>;
  /** Mianownik liczby mnogiej (bez form deprecjatywnych, które mają znacznik `depr`). */
  mnN: FormaSgjp[];
}

export interface Sgjp {
  leksemy: Map<string, Leksem>;
  /** Identyfikator słownika i nota copyrightowa z nagłówka pliku. */
  idSlownika: string;
  nota: string;
}

const pustePrzypadki = (): Record<Przypadek, FormaSgjp[]> => ({
  mian: [],
  dop: [],
  cel: [],
  bier: [],
  narz: [],
  msc: [],
  wol: [],
});

/** Czy kolumna klasy ma token `imię` albo `nazwisko` (tokeny rozdziela `|`; `nazwisko_(odojcowskie)` to inny). */
const KLASA = /(?:^|\|)(?:imię|nazwisko)(?:\||$)/;

/** Parsuje rozpakowany plik SGJP. Zachowuje tylko leksemy z klasą `imię` albo `nazwisko` i tylko ich formy `subst`. */
export function parsujSgjp(bajty: Buffer): Sgjp {
  const tekst = bajty.toString('utf8');
  const naglowek = /^#!DICT-ID\s+(\S+)/m.exec(tekst.slice(0, 20000));
  const nota = /#<COPYRIGHT>\r?\n([\s\S]*?)\r?\n#<\/COPYRIGHT>/.exec(tekst.slice(0, 20000));
  if (!naglowek || !nota) throw new Error('SGJP: brak #!DICT-ID albo bloku #<COPYRIGHT> w nagłówku pliku');
  const leksemy = new Map<string, Leksem>();
  let poczatek = 0;
  while (poczatek < tekst.length) {
    let koniec = tekst.indexOf('\n', poczatek);
    if (koniec < 0) koniec = tekst.length;
    const linia = tekst.slice(poczatek, koniec);
    poczatek = koniec + 1;
    if (linia === '' || linia.charCodeAt(0) === 35) continue; // '#': nagłówek i komentarze
    const kol = linia.split('\t');
    const klasa = kol[3] ?? '';
    if (!KLASA.test(klasa)) continue;
    const znacznik = kol[2].split(':');
    if (znacznik[0] !== 'subst' || znacznik.length < 4) continue;
    const liczby = znacznik[1].split('.');
    const przypadki = znacznik[2].split('.');
    let l = leksemy.get(kol[1]);
    if (!l) {
      l = { lemat: kol[1], klasy: klasa.split('|'), rodzaj: znacznik[3], sg: pustePrzypadki(), mnN: [] };
      leksemy.set(kol[1], l);
    }
    const f: FormaSgjp = { forma: kol[0], kwal: kol[4] ? kol[4].split('|') : [] };
    // piąty element znacznika (`pt`, `ncol`) oznacza pluralia tantum i zbiorowe: nie dla liczby pojedynczej
    if (liczby.includes('sg') && znacznik.length === 4) {
      for (const p of przypadki) if (Object.hasOwn(PRZYPADKI_SGJP, p)) l.sg[PRZYPADKI_SGJP[p]].push(f);
    }
    if (liczby.includes('pl') && przypadki.includes('nom') && znacznik.length === 4) l.mnN.push(f);
  }
  return { leksemy, idSlownika: naglowek[1], nota: nota[1].trim().replace(/\r\n/g, '\n') };
}

/** Wczytuje i parsuje `sgjp-*.tab.gz`. */
export function wczytajSgjp(sciezka: string): Sgjp {
  return parsujSgjp(zlib.gunzipSync(fs.readFileSync(sciezka)));
}

// ---------------------------------------------------------------- wybór form

const porownaj = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Forma odpada, gdy ma kwalifikator potoczny albo niepoprawny. */
const odpada = (f: FormaSgjp): boolean => f.kwal.includes('pot.') || f.kwal.includes('niepopr.');
const ocenaKwalifikatora = (f: FormaSgjp): number => (f.kwal.length === 0 ? 0 : f.kwal.includes('rzad.') ? 1 : 2);

/** Formy, które nie odpadły, bez powtórzeń, od najlepszej: bez kwalifikatora, `rzad.`, inne; remis rozstrzyga
    kolejność kodów znaków. Pusta lista, gdy wszystkie odpadły albo form nie ma. */
export function dopuszczalne(formy: readonly FormaSgjp[]): string[] {
  const dobre = formy.filter((f) => !odpada(f));
  dobre.sort((a, b) => ocenaKwalifikatora(a) - ocenaKwalifikatora(b) || porownaj(a.forma, b.forma));
  return [...new Set(dobre.map((f) => f.forma))];
}

/** Przykład odmiany: mianownik, płeć, rodzaj nazwy i dopuszczalne formy w każdym przypadku (pierwsza to wybrana). */
export interface Przyklad {
  mian: string;
  plec: Plec;
  nazwisko: boolean;
  lemat: string;
  dopuszczalne: Record<Przypadek, string[]>;
  /** Mianownik liczby mnogiej (tylko nazwiska męskie); pusty, gdy leksem go nie ma. */
  mnoga: string[];
}

export const WZOR_IMIENIA_SGJP = /^\p{Lu}[\p{Ll}'’]+$/u;
export const WZOR_NAZWISKA_SGJP = /^\p{Lu}\p{Ll}+$/u;

/** Przykłady z leksemów danego rodzaju nazw (`nazwisko`: klasa `nazwisko`, inaczej `imię`). Rodzaj m1 to płeć `M`,
    f to `K`; inne rodzaje (m2, m3) pomijamy. Mianownik to wybrana forma mianownika; musi pasować do wzoru (jedno
    słowo, wielka litera i małe). Leksem niepełny odpada. Dla pary (mianownik, płeć) zostaje pierwszy leksem w kolejności
    identyfikatorów. Wynik jest posortowany po mianowniku, potem płci. */
export function przyklady(sgjp: Sgjp, nazwisko: boolean): Przyklad[] {
  const klasa = nazwisko ? 'nazwisko' : 'imię';
  const wzor = nazwisko ? WZOR_NAZWISKA_SGJP : WZOR_IMIENIA_SGJP;
  const wybrane = new Map<string, Przyklad>();
  const lematy = [...sgjp.leksemy.keys()].sort(porownaj);
  for (const lemat of lematy) {
    const l = sgjp.leksemy.get(lemat) as Leksem;
    if (!l.klasy.includes(klasa)) continue;
    if (l.rodzaj !== 'm1' && l.rodzaj !== 'f') continue;
    const dop = Object.fromEntries(PRZYPADKI.map((p) => [p, dopuszczalne(l.sg[p])])) as Record<Przypadek, string[]>;
    if (PRZYPADKI.some((p) => dop[p].length === 0)) continue;
    const mian = dop.mian[0];
    if (!wzor.test(mian)) continue;
    const plec: Plec = l.rodzaj === 'm1' ? 'M' : 'K';
    const klucz = `${plec}|${mian}`;
    if (wybrane.has(klucz)) continue;
    wybrane.set(klucz, { mian, plec, nazwisko, lemat, dopuszczalne: dop, mnoga: dopuszczalne(l.mnN) });
  }
  return [...wybrane.values()].sort((a, b) => porownaj(a.mian, b.mian) || porownaj(a.plec, b.plec));
}

/** Wybrane formy przykładu (pierwsza dopuszczalna w każdym przypadku). */
export const wybraneFormy = (p: Przyklad): Formy =>
  Object.fromEntries(PRZYPADKI.map((c) => [c, p.dopuszczalne[c][0]])) as Formy;

// ---------------------------------------------------------------- uczenie końcówek

const NAJDLUZSZY_SUFIKS = 6;

const wspolnyPrefiks = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** Wzorzec odmiany jednego przykładu: wspólny prefiks mianownika ze wszystkimi formami zostaje, reszta mianownika
    to `ucinek`, a końcówki to dopiski w sześciu przypadkach (`mian` puste). */
export function wzorzecPrzykladu(mian: string, formy: Formy): Pick<WzorzecKoncowek, 'ucinek' | 'koncowki'> {
  const wspolny = Math.min(...PRZYPADKI.map((p) => wspolnyPrefiks(mian, formy[p])));
  const koncowki = Object.fromEntries(PRZYPADKI.map((p) => [p, p === 'mian' ? '' : formy[p].slice(wspolny)])) as Record<
    Przypadek,
    string
  >;
  return { ucinek: mian.length - wspolny, koncowki };
}

const kluczWzorca = (w: Pick<WzorzecKoncowek, 'ucinek' | 'koncowki'>): string =>
  `${w.ucinek}\u0001${PRZYPADKI.slice(1)
    .map((p) => w.koncowki[p])
    .join('\u0001')}`;

/** Tablica końcówek z przykładów (patrz opis na górze pliku). Nazwiska mają w `sufiks` gwiazdkę na początku. Wynik
    jest posortowany (imiona przed nazwiskami, płeć M przed K, sufiks po kodach znaków), więc powtarzalny. */
export function trenujKoncowki(przyklady: readonly Przyklad[]): TabelaKoncowek {
  const wzorce = new Map<string, Pick<WzorzecKoncowek, 'ucinek' | 'koncowki'>>();
  const liczniki = new Map<string, Map<string, number>>();
  for (const p of przyklady) {
    const w = wzorzecPrzykladu(p.mian, wybraneFormy(p));
    const kw = kluczWzorca(w);
    wzorce.set(kw, w);
    const mala = p.mian.toLowerCase();
    for (let dl = 1; dl <= Math.min(NAJDLUZSZY_SUFIKS, mala.length); dl++) {
      const klucz = `${p.plec}${p.nazwisko ? '*' : ''}${mala.slice(mala.length - dl)}`;
      let l = liczniki.get(klucz);
      if (!l) liczniki.set(klucz, (l = new Map()));
      l.set(kw, (l.get(kw) ?? 0) + 1);
    }
  }
  const zwyciezca = new Map<string, string>();
  for (const [klucz, l] of liczniki) {
    let najlepszy = '';
    let ile = -1;
    for (const [kw, n] of l) {
      if (n > ile || (n === ile && kw < najlepszy)) {
        najlepszy = kw;
        ile = n;
      }
    }
    zwyciezca.set(klucz, najlepszy);
  }
  const wynik: { klucz: string; wpis: WzorzecKoncowek }[] = [];
  for (const [klucz, kw] of zwyciezca) {
    const plec = klucz[0] as Plec;
    const nazwisko = klucz[1] === '*';
    const sufiks = klucz.slice(nazwisko ? 2 : 1);
    if (sufiks.length > 1) {
      const rodzic = zwyciezca.get(`${plec}${nazwisko ? '*' : ''}${sufiks.slice(1)}`);
      if (rodzic === kw) continue; // krótszy sufiks da to samo
    }
    const w = wzorce.get(kw) as Pick<WzorzecKoncowek, 'ucinek' | 'koncowki'>;
    wynik.push({
      klucz: `${nazwisko ? 1 : 0}${plec === 'M' ? 0 : 1}${sufiks}`,
      wpis: { sufiks: (nazwisko ? '*' : '') + sufiks, plec, ucinek: w.ucinek, koncowki: w.koncowki },
    });
  }
  wynik.sort((a, b) => porownaj(a.klucz, b.klucz));
  return { wersja: WERSJA_TABEL, wzorce: wynik.map((x) => x.wpis) };
}

/** Podział na trening i odłożone: co dziesiąty przykład (indeksy 9, 19, … w kolejności posortowanej) jest odłożony. */
export function podzial<T>(posortowane: readonly T[]): { trening: T[]; odlozone: T[] } {
  const trening: T[] = [];
  const odlozone: T[] = [];
  for (let i = 0; i < posortowane.length; i++) (i % 10 === 9 ? odlozone : trening).push(posortowane[i]);
  return { trening, odlozone };
}

// ---------------------------------------------------------------- dokładność

export interface Dokladnosc {
  n: number;
  /** Ile ma poprawne wszystkie siedem form. */
  poprawne: number;
  /** Poprawność per przypadek (pole `mian` zawsze równe `n`). */
  przypadki: Record<Przypadek, number>;
}

type Dopuszczalne = Record<Przypadek, string[]>;

/** Forma jest poprawna, gdy należy do dopuszczalnych w swoim przypadku; brak odpowiedzi to błąd. */
const poprawnaForma = (d: Dopuszczalne, f: Formy | null, p: Przypadek): boolean => f !== null && d[p].includes(f[p]);

/** Dokładność metody na elementach: `wzor` daje dopuszczalne formy elementu, `metoda` jego formy albo `null`. */
export function ocen<T>(
  elementy: readonly T[],
  wzor: (e: T) => Dopuszczalne,
  metoda: (e: T) => Formy | null,
): Dokladnosc {
  const przypadki = Object.fromEntries(PRZYPADKI.map((p) => [p, 0])) as Record<Przypadek, number>;
  let poprawne = 0;
  for (const e of elementy) {
    const d = wzor(e);
    const f = metoda(e);
    let wszystkie = true;
    for (const c of PRZYPADKI) {
      if (poprawnaForma(d, f, c)) przypadki[c]++;
      else wszystkie = false;
    }
    if (wszystkie) poprawne++;
  }
  return { n: elementy.length, poprawne, przypadki };
}

export const procent = (d: Dokladnosc): number => (d.n === 0 ? 0 : (100 * d.poprawne) / d.n);

/** Dokładność metody na przykładach imion (albo nazwisk jako samodzielnych nazw). */
export const ocenPrzyklady = (przyklady: readonly Przyklad[], metoda: (p: Przyklad) => Formy | null): Dokladnosc =>
  ocen(przyklady, (p) => p.dopuszczalne, metoda);

/** Zgodność reguł z końcówkami na imionach: ile par daje ten sam paradygmat i w ilu z nich jest on poprawny (to
    dokładność oznaczenia `pewne`); reszta to przypadki, w których wygrywają same reguły, same końcówki albo żadna. */
export interface ZgodnoscMetod {
  n: number;
  zgodne: number;
  zgodneIPoprawne: number;
  tylkoReguly: number;
  tylkoKoncowki: number;
  obaZle: number;
}

export function zgodnoscImion(przyklady: readonly Przyklad[], k: TabelaKoncowek): ZgodnoscMetod {
  const w: ZgodnoscMetod = {
    n: przyklady.length,
    zgodne: 0,
    zgodneIPoprawne: 0,
    tylkoReguly: 0,
    tylkoKoncowki: 0,
    obaZle: 0,
  };
  const wszystkoDobrze = (p: Przyklad, f: Formy | null): boolean =>
    PRZYPADKI.every((c) => poprawnaForma(p.dopuszczalne, f, c));
  for (const p of przyklady) {
    const r = zgadnijReguly(p.mian, p.plec);
    const t = zgadnijKoncowkami(p.mian, p.plec, k);
    const rDobrze = wszystkoDobrze(p, r);
    const tDobrze = wszystkoDobrze(p, t);
    if (r !== null && t !== null && PRZYPADKI.every((c) => r[c] === t[c])) {
      w.zgodne++;
      if (rDobrze) w.zgodneIPoprawne++;
    } else if (rDobrze) w.tylkoReguly++;
    else if (tDobrze) w.tylkoKoncowki++;
    if (!rDobrze && !tDobrze) w.obaZle++;
  }
  return w;
}

/** Para nazwisk z SGJP: leksem męski i jego żeński odpowiednik (mianownik z `zenskaFormaNazwiska`), `null`, gdy SGJP
    takiego żeńskiego nie ma. */
export interface ParaNazwiska {
  m: Przyklad;
  k: Przyklad | null;
}

/** Pary dla wszystkich przykładów męskich. Żeńskie leksemy bez męskiej pary (np. nieodmienne „Kowalski” jako
    nazwisko żeńskie) nie wchodzą nigdzie: zgadywacz nigdy ich nie zobaczy, bo mianownik żeński wyprowadza z męskiego. */
export function paryNazwisk(nazwiska: readonly Przyklad[]): ParaNazwiska[] {
  const zenskie = new Map(nazwiska.filter((p) => p.plec === 'K').map((p) => [p.mian, p]));
  return nazwiska
    .filter((p) => p.plec === 'M')
    .map((m) => ({ m, k: zenskie.get(zenskaFormaNazwiska(m.mian)) ?? null }));
}

/** Przykłady uczące tablicy końcówek nazwisk: wszystkie męskie i ich żeńskie pary. */
export const przykladyUczaceNazwisk = (pary: readonly ParaNazwiska[]): Przyklad[] =>
  pary.flatMap((p) => (p.k ? [p.m, p.k] : [p.m]));

/** Dokładność nazwisk męskich (`m`), żeńskich (`k`, tylko pary z żeńskim leksemem w SGJP) i liczby mnogiej (`mnoga`,
    tylko gdy SGJP ją ma) dla metody, która z męskiego mianownika robi `FormyNazwiska` albo `null`. */
export function ocenNazwiska(
  pary: readonly ParaNazwiska[],
  metoda: (meskie: string) => FormyNazwiska | null,
): { m: Dokladnosc; k: Dokladnosc; mnoga: { n: number; poprawne: number } } {
  const wyniki = new Map(pary.map((p) => [p.m.mian, metoda(p.m.mian)]));
  const zMnoga = pary.filter((p) => p.m.mnoga.length > 0);
  return {
    m: ocen(
      pary,
      (p) => p.m.dopuszczalne,
      (p) => wyniki.get(p.m.mian)?.m ?? null,
    ),
    k: ocen(
      pary.filter((p) => p.k !== null),
      (p) => (p.k as Przyklad).dopuszczalne,
      (p) => wyniki.get(p.m.mian)?.k ?? null,
    ),
    mnoga: {
      n: zMnoga.length,
      poprawne: zMnoga.filter((p) => p.m.mnoga.includes(wyniki.get(p.m.mian)?.mnoga ?? '')).length,
    },
  };
}

// ---------------------------------------------------------------- słownik odmiany (odmiana.json)

/** Napis „cyfra + dopisek”: ile ostatnich liter mianownika uciąć i co dokleić, żeby dostać `forma`. */
export function kodFormy(mian: string, forma: string): string {
  const wspolny = wspolnyPrefiks(mian, forma);
  const ucieto = mian.length - wspolny;
  if (ucieto > 9) throw new Error(`Forma „${forma}” ucina z „${mian}” ${ucieto} liter, a kod pomieści najwyżej 9`);
  return String(ucieto) + forma.slice(wspolny);
}

/** Napis wzorca: sześć kodów form (dop, cel, bier, narz, msc, wol) po przecinku. */
export function kodWzorca(mian: string, formy: Formy): string {
  return PRZYPADKI.slice(1)
    .map((p) => kodFormy(mian, formy[p]))
    .join(',');
}

export interface PokrycieSlownika {
  imionM: { w: number; razem: number; brak: string[] };
  imionK: { w: number; razem: number; brak: string[] };
  nazwiska: {
    w: number;
    razem: number;
    brak: string[];
    /** Nazwiska bez żeńskiego leksemu w SGJP (żeńskie z reguł), bez liczby mnogiej w SGJP (mnoga z reguł). */
    zenskieZRegul: string[];
    mnogaZRegul: string[];
    /** Różne żeńskie formy tego samego męskiego nazwiska w tabelach województw. */
    rozneZenskie: string[];
  };
}

/** Wszystkie imiona z `imiona.json` (lata, koszyki, powracające, przyjezdni) według płci, posortowane. */
export function imionaZPuli(t: TabeleImion): { M: string[]; K: string[] } {
  const wynik = { M: new Set<string>(), K: new Set<string>() };
  for (const plec of ['M', 'K'] as const) {
    for (const rok of Object.values(t.lata)) for (const [n] of rok[plec]) wynik[plec].add(n);
    for (const koszyk of Object.values(t.koszyki)) for (const [n] of koszyk[plec]) wynik[plec].add(n);
    for (const n of t.powracajace[plec]) wynik[plec].add(n);
    for (const [n] of t.przyjezdni[plec]) wynik[plec].add(n);
  }
  return { M: [...wynik.M].sort(porownaj), K: [...wynik.K].sort(porownaj) };
}

/** Waga imienia w tabelach gry: suma liczb z list roczników 2000-2025, koszyków przed 2000 r. i przyjezdnych, osobno dla
    płci. Służy do liczenia, jaką część nadań pokrywa słownik. */
export function wagiImion(t: TabeleImion): { M: Map<string, number>; K: Map<string, number> } {
  const wynik = { M: new Map<string, number>(), K: new Map<string, number>() };
  const dodaj = (plec: 'M' | 'K', lista: [string, number][]): void => {
    for (const [n, v] of lista) wynik[plec].set(n, (wynik[plec].get(n) ?? 0) + v);
  };
  for (const plec of ['M', 'K'] as const) {
    for (const rok of Object.values(t.lata)) dodaj(plec, rok[plec]);
    for (const koszyk of Object.values(t.koszyki)) dodaj(plec, koszyk[plec]);
    dodaj(plec, t.przyjezdni[plec]);
  }
  return wynik;
}

/** Pary (męskie, żeńskie) ze wszystkich tabel województw (`ogolne` i `lokalne`), posortowane po męskim. Gdy to samo
    męskie nazwisko ma w różnych tabelach różne żeńskie formy, bierze pierwszą w kolejności znaków i zgłasza resztę. */
export function nazwiskaZPuli(tabele: readonly TabeleNazwisk[]): { pary: [string, string][]; rozne: string[] } {
  const zenskie = new Map<string, Set<string>>();
  for (const t of tabele) {
    for (const lista of [t.ogolne, t.lokalne]) {
      for (const [m, k] of lista) {
        let s = zenskie.get(m);
        if (!s) zenskie.set(m, (s = new Set()));
        s.add(k);
      }
    }
  }
  const pary: [string, string][] = [];
  const rozne: string[] = [];
  for (const m of [...zenskie.keys()].sort(porownaj)) {
    const s = [...(zenskie.get(m) as Set<string>)].sort(porownaj);
    pary.push([m, s[0]]);
    if (s.length > 1) rozne.push(m);
  }
  return { pary, rozne };
}

/** Słownik odmiany (`OdmianaPlik`) dla imion i nazwisk z tabel gry. Imię albo nazwisko bez męskiego leksemu SGJP
    nie wchodzi do słownika (zgadywacz odmieni je w grze). Żeński leksem nazwiska szukamy po mianowniku żeńskim z tabeli
    nazwisk; gdy go brak, żeńskie formy idą z reguł. Wynik jest powtarzalny: klucze posortowane po kodach znaków,
    wzorce od najczęstszego. */
export function zbudujOdmiane(
  sgjp: Sgjp,
  imiona: TabeleImion,
  nazwiska: readonly TabeleNazwisk[],
): { plik: OdmianaPlik; pokrycie: PokrycieSlownika } {
  const slownikImion = new Map(przyklady(sgjp, false).map((p) => [`${p.plec}|${p.mian}`, p]));
  const slownikNazwisk = new Map(przyklady(sgjp, true).map((p) => [`${p.plec}|${p.mian}`, p]));
  const pula = imionaZPuli(imiona);
  const pary = nazwiskaZPuli(nazwiska);

  const liczniki = new Map<string, number>();
  const wzorzec = (mian: string, formy: Formy): string => {
    const kod = kodWzorca(mian, formy);
    liczniki.set(kod, (liczniki.get(kod) ?? 0) + 1);
    return kod;
  };
  // pierwszy przebieg zbiera wzorce i ich liczność; indeksy przydzielamy po posortowaniu
  type WpisImienia = { M?: string; K?: string };
  type WpisNazwiska = [string, string, string, string];
  const wpisyImion = new Map<string, WpisImienia>();
  const pokrycie: PokrycieSlownika = {
    imionM: { w: 0, razem: pula.M.length, brak: [] },
    imionK: { w: 0, razem: pula.K.length, brak: [] },
    nazwiska: { w: 0, razem: pary.pary.length, brak: [], zenskieZRegul: [], mnogaZRegul: [], rozneZenskie: pary.rozne },
  };
  for (const plec of ['M', 'K'] as const) {
    const cel = plec === 'M' ? pokrycie.imionM : pokrycie.imionK;
    for (const imie of pula[plec]) {
      const p = slownikImion.get(`${plec}|${imie}`);
      if (!p) {
        cel.brak.push(imie);
        continue;
      }
      cel.w++;
      const wpis = wpisyImion.get(imie) ?? {};
      wpis[plec] = wzorzec(imie, wybraneFormy(p));
      wpisyImion.set(imie, wpis);
    }
  }
  const wpisyNazwisk = new Map<string, WpisNazwiska>();
  for (const [meskie, zenskie] of pary.pary) {
    const m = slownikNazwisk.get(`M|${meskie}`);
    if (!m) {
      pokrycie.nazwiska.brak.push(meskie);
      continue;
    }
    pokrycie.nazwiska.w++;
    const k = slownikNazwisk.get(`K|${zenskie}`);
    const reguly = zgadnijNazwiskoReguly(meskie);
    if (!k) pokrycie.nazwiska.zenskieZRegul.push(meskie);
    if (m.mnoga.length === 0) pokrycie.nazwiska.mnogaZRegul.push(meskie);
    const formyK = k ? wybraneFormy(k) : (reguly as NonNullable<typeof reguly>).k;
    // z reguł tylko wtedy, gdy mianownik żeński z tabeli jest tym, który wychodzi z reguł
    if (!k && formyK.mian !== zenskie) {
      throw new Error(`Nazwisko ${meskie}: żeński mianownik z tabeli (${zenskie}) różni się od reguł (${formyK.mian})`);
    }
    const mnoga = m.mnoga[0] ?? (reguly as NonNullable<typeof reguly>).mnoga;
    wpisyNazwisk.set(meskie, [
      wzorzec(meskie, wybraneFormy(m)),
      kodFormy(meskie, zenskie),
      wzorzec(zenskie, formyK),
      kodFormy(meskie, mnoga),
    ]);
  }

  const wzorce = [...liczniki.entries()].sort((a, b) => b[1] - a[1] || porownaj(a[0], b[0])).map(([kod]) => kod);
  const indeks = new Map(wzorce.map((kod, i) => [kod, i]));
  const nr = (kod: string): number => indeks.get(kod) as number;
  const imionaPlik: OdmianaPlik['imiona'] = {};
  for (const imie of [...wpisyImion.keys()].sort(porownaj)) {
    const w = wpisyImion.get(imie) as WpisImienia;
    imionaPlik[imie] = {};
    if (w.M !== undefined) imionaPlik[imie].M = nr(w.M);
    if (w.K !== undefined) imionaPlik[imie].K = nr(w.K);
  }
  const nazwiskaPlik: OdmianaPlik['nazwiska'] = {};
  for (const meskie of [...wpisyNazwisk.keys()].sort(porownaj)) {
    const [wm, kodK, wk, mnoga] = wpisyNazwisk.get(meskie) as WpisNazwiska;
    nazwiskaPlik[meskie] = [nr(wm), kodK, nr(wk), mnoga];
  }
  const nota =
    `Odmiana: wyciąg z SGJP (Słownik gramatyczny języka polskiego, Morfeusz 2), identyfikator ${sgjp.idSlownika}, ` +
    `na licencji BSD-2. Poniżej nota z nagłówka pliku słownika, bez zmian.\n${sgjp.nota}`;
  return {
    plik: { wersja: WERSJA_TABEL, _nota: nota, wzorce, imiona: imionaPlik, nazwiska: nazwiskaPlik },
    pokrycie,
  };
}

/** Plik JSON: jedna linia (zwarty), z końcowym znakiem nowej linii, jak pozostałe tabele. */
export const jakoJson = (obiekt: unknown): string => `${JSON.stringify(obiekt)}\n`;

/** Oba pliki wyjściowe i dane, z których powstały (do diagnostyki w `npm run dane:odmiana` i do testów). */
export interface WynikOdmiany {
  odmiana: OdmianaPlik;
  koncowki: TabelaKoncowek;
  pokrycie: PokrycieSlownika;
  imiona: Przyklad[];
  pary: ParaNazwiska[];
}

/** Słownik i tablica końcówek z jednego wczytanego SGJP oraz tabel imion i nazwisk gry. Tablica w grze uczy się na
    wszystkich imionach i wszystkich nazwiskach męskich z żeńskimi parami. */
export function zbudujTabele(sgjp: Sgjp, imiona: TabeleImion, nazwiska: readonly TabeleNazwisk[]): WynikOdmiany {
  const przykladyImion = przyklady(sgjp, false);
  const pary = paryNazwisk(przyklady(sgjp, true));
  const { plik, pokrycie } = zbudujOdmiane(sgjp, imiona, nazwiska);
  return {
    odmiana: plik,
    koncowki: trenujKoncowki([...przykladyImion, ...przykladyUczaceNazwisk(pary)]),
    pokrycie,
    imiona: przykladyImion,
    pary,
  };
}
