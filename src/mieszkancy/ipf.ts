/* Łączny rozkład typów gospodarstw rejonu: krajowy szablon „wielkość × skład × osoby 60+” (NSP 2021, miasta albo wieś)
   przeskalowany metodą IPF do brzegów rejonu. Same `+ - * /` na liczbach zmiennoprzecinkowych (IEEE daje to samo
   w każdej przeglądarce i w Node), a wynik to liczby całkowite w promilach, gotowe do `wazony`. */

import type { Marginesy, Sklad, TabeleKraju, Wielkosc } from './tabele.ts';

export const WIELKOSCI: readonly Wielkosc[] = ['1', '2', '3', '4', '5+'];
export const SKLADY: readonly Sklad[] = ['jedno', 'dwu', 'trzy+', 'nier1', 'nier+'];
export type Obecnosc60 = '60+' | 'bez60';
export const OBECNOSCI_60: readonly Obecnosc60[] = ['60+', 'bez60'];

/** Najwyżej tyle cykli (każdy skaluje po kolei wszystkie brzegi). Przy zgodnych brzegach wystarcza kilkanaście. */
const MAX_ITERACJI = 50;
/** Koniec, gdy żaden brzeg nie odstaje o więcej niż ta część sumy. */
const DOKLADNOSC = 1e-12;
/** Średnia wielkość gospodarstwa 5+ z bilansu osób rejonu (ludność minus osoby w gospodarstwach 1-4 przez liczbę
    gospodarstw 5+), przycięta do tego przedziału. Dla całego Gdańska i całych Zielonek z przeciętnej liczby osób
    w gospodarstwie (P4287: 2,47 i 3,38) wychodzi około 5,9, ale ludność rejonu liczy też osoby spoza gospodarstw,
    więc pojedyncze rejony dają ponad 7 (398600 w Zielonkach 7,5). Decyzja generatora. */
export const SREDNIA_5_OD = 5;
export const SREDNIA_5_DO = 6.5;

const nieujemna = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const suma = (o: Record<string, number>): number => Object.values(o).reduce((a, v) => a + nieujemna(v), 0);

/** Jeden brzeg IPF: komórka `i` należy do kategorii `indeks[i]`, a kategoria `c` ma sumować się do `brzeg[c]`. */
export interface Brzeg {
  indeks: readonly number[];
  brzeg: readonly number[];
}

/** IPF na komórkach rzadkiej tabeli: po kolei skaluje komórki do każdego brzegu, najwyżej `maxIteracji` cykli.
    Kategoria z zerową sumą komórek zostaje zerem (brzegu nie da się wtedy spełnić), a brzeg zero zeruje swoje
    komórki na zawsze, bo IPF tylko mnoży. Ujemne i nieskończone wartości na wejściu liczą się jak 0, więc wynik
    nigdy nie ma `NaN` ani liczb ujemnych. Przy brzegach sprzecznych ze strukturą zer kończy po ostatnim brzegu. */
export function dopasujIpf(start: readonly number[], brzegi: readonly Brzeg[], maxIteracji = MAX_ITERACJI): number[] {
  const x = start.map(nieujemna);
  const czyste = brzegi.map((b) => ({ indeks: b.indeks, brzeg: b.brzeg.map(nieujemna) }));
  const sumy = czyste.map((b) => new Array<number>(b.brzeg.length));
  const policzSumy = (j: number): void => {
    const s = sumy[j];
    s.fill(0);
    for (let i = 0; i < x.length; i++) s[czyste[j].indeks[i]] += x[i];
  };
  const calosc = czyste.length > 0 ? czyste[0].brzeg.reduce((a, v) => a + v, 0) : 0;
  for (let it = 0; it < maxIteracji; it++) {
    czyste.forEach((b, j) => {
      policzSumy(j);
      for (let i = 0; i < x.length; i++) {
        const s = sumy[j][b.indeks[i]];
        x[i] = s > 0 ? (x[i] * b.brzeg[b.indeks[i]]) / s : 0;
      }
    });
    let odchylenie = 0;
    czyste.forEach((b, j) => {
      policzSumy(j);
      for (let c = 0; c < b.brzeg.length; c++) odchylenie = Math.max(odchylenie, Math.abs(sumy[j][c] - b.brzeg[c]));
    });
    if (odchylenie <= DOKLADNOSC * calosc) break;
  }
  return x;
}

/** Średnia liczba osób w gospodarstwie 5+ z bilansu rejonu, przycięta do [5; 6,5]; bez gospodarstw 5+ dolny brzeg. */
export function srednia5Rejonu(m: Marginesy): number {
  const g = m.gospodarstwa;
  if (!(g['5+'] > 0)) return SREDNIA_5_OD;
  const wMalych = g['1'] + 2 * g['2'] + 3 * g['3'] + 4 * g['4'];
  const v = (suma(m.wiek.M) + suma(m.wiek.K) - wMalych) / g['5+'];
  return Math.max(SREDNIA_5_OD, Math.min(SREDNIA_5_DO, v));
}

/** Klucz komórki jak w `szablonGospodarstw`: `${Wielkosc}|${Sklad}|${'60+' | 'bez60'}`. */
export const kluczTypu = (w: Wielkosc, s: Sklad, f: Obecnosc60): string => `${w}|${s}|${f}`;

interface Komorka {
  klucz: string;
  w: number;
  s: number;
  /** 0 = 60+, 1 = bez60. */
  f: number;
  v: number;
}

/** Komórki szablonu w stałej kolejności (wielkość, skład, 60+ przed bez60), bez kluczy, których szablon nie ma
    (np. rodziny w gospodarstwie jednoosobowym). */
function komorki(szablon: Record<string, number>): Komorka[] {
  const wynik: Komorka[] = [];
  WIELKOSCI.forEach((w, iw) => {
    SKLADY.forEach((s, is) => {
      OBECNOSCI_60.forEach((f, ifx) => {
        const klucz = kluczTypu(w, s, f);
        if (Object.hasOwn(szablon, klucz)) wynik.push({ klucz, w: iw, s: is, f: ifx, v: szablon[klucz] });
      });
    });
  });
  return wynik;
}

function policz(m: Marginesy, k: TabeleKraju, miejska: boolean, gospodarstw60: number | null): Map<string, number> {
  const lista = komorki(miejska ? k.szablonGospodarstw.miasta : k.szablonGospodarstw.wies);
  const brzegi: Brzeg[] = [
    { indeks: lista.map((c) => c.w), brzeg: WIELKOSCI.map((w) => m.gospodarstwa[w]) },
    { indeks: lista.map((c) => c.s), brzeg: SKLADY.map((s) => m.sklad[s]) },
  ];
  if (gospodarstw60 !== null) {
    const h60 = Math.max(0, Math.min(suma(m.gospodarstwa), gospodarstw60));
    brzegi.push({ indeks: lista.map((c) => c.f), brzeg: [h60, suma(m.gospodarstwa) - h60] });
  }
  const x = dopasujIpf(
    lista.map((c) => c.v),
    brzegi,
  );
  const razem = x.reduce((a, v) => a + v, 0);
  const wynik = new Map<string, number>();
  lista.forEach((c, i) => {
    wynik.set(c.klucz, razem > 0 ? Math.round((x[i] / razem) * 1000) : 0);
  });
  return wynik;
}

/** Pamięć podręczna: tabele krajowe → marginesy rejonu → [miasta, wieś]. Klucz to sam obiekt marginesów (jeden na
    rejon w tabeli gminy), więc wynik nie zależy od tego, czy był w pamięci: liczenie jest czystą funkcją wejścia. */
const pamiec = new WeakMap<TabeleKraju, WeakMap<Marginesy, (ReadonlyMap<string, number> | undefined)[]>>();

/** Łączny rozkład typów gospodarstw rejonu w promilach (liczby całkowite, suma około 1000 po zaokrągleniach):
    szablon krajowy dla miast (`miejska`) albo wsi przeskalowany IPF do brzegów `m.gospodarstwa` (wielkość)
    i `m.sklad` (skład), najwyżej 50 iteracji. Klucze jak w szablonie, `${Wielkosc}|${Sklad}|${'60+' | 'bez60'}`,
    w stałej kolejności. Komórka z zerowym brzegiem zostaje 0; marginesy z samymi zerami dają same zera. Wynik jest
    w pamięci podręcznej na obiekt marginesów, a funkcja zwraca jego kopię, którą wolno zmieniać. */
export function rozkladGospodarstw(m: Marginesy, k: TabeleKraju, miejska: boolean): Map<string, number> {
  let wgKraju = pamiec.get(k);
  if (!wgKraju) pamiec.set(k, (wgKraju = new WeakMap()));
  let para = wgKraju.get(m);
  if (!para) wgKraju.set(m, (para = []));
  const i = miejska ? 0 : 1;
  let wynik = para[i];
  if (!wynik) para[i] = wynik = policz(m, k, miejska, null);
  return new Map(wynik);
}

/** Jak `rozkladGospodarstw`, z trzecim brzegiem: `gospodarstw60` gospodarstw z osobą 60+ (reszta bez niej). Bez
    niego każdy rejon dostaje z szablonu krajowy udział gospodarstw z seniorem (52%), a w młodym rejonie nie ma tylu
    osób 60+, żeby obsadzić nimi tyle gospodarstw. Liczbę szacuje obsadzanie (spis.ts) z wieku rejonu; bez pamięci
    podręcznej, bo spis.ts trzyma wynik w swojej. */
export function rozkladGospodarstw60(
  m: Marginesy,
  k: TabeleKraju,
  miejska: boolean,
  gospodarstw60: number,
): Map<string, number> {
  return policz(m, k, miejska, gospodarstw60);
}
