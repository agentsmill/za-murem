/* Nagrywanie wywołań funkcji Math w przedziale kroków symulacji (czyste, bez node:* i DOM): gdy skróty z różnych
   silników się rozjadą (porownanie.ts), tools/determinizm.ts liczy przebieg jeszcze raz z nagrywaniem godziny gry,
   w której skróty się rozeszły, w każdym silniku, i szuka pierwszego wywołania z innym wynikiem. Silniki mogą się różnić
   tylko tam, gdzie standard JS nie wymaga dokładnego wyniku: funkcje przestępne i hypot (sin, cos, tan, atan2, exp,
   log, pow, cbrt itd.). Pomijamy to, co IEEE 754 ma dokładnie w wyniku (sqrt, floor, round, min, max, abs, imul), więc
   tam silniki rozjechać się nie mogą. Operatora ** nie da się podsłuchać (nie woła Math.pow), o jego ryzyku jest w
   raporcie docs/ocena/determinizm-silnikow.md.

   Podpięcie: `const n = nagrywaj(od, do); przebieg(dane, { krok: n.krok }); const wywolania = n.zatrzymaj();`.
   Nagrywanie włącza się przed krokiem `od` i wyłącza przed krokiem `do` (kroki to st.tick, hak `krok` z przebieg.ts),
   a Math wraca do oryginału przy `zatrzymaj()` albo na końcu przedziału. Wywołanie ma postać [nazwa, argumenty, wynik]. */

/** funkcje Math, których wynik może się różnić między silnikami */
export const NAGRYWANE = [
  'hypot',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log2',
  'log10',
  'log1p',
  'pow',
  'cbrt',
] as const;

export type Wywolanie = [string, number[], number];

/** wywołanie po drodze przez JSON: NaN, nieskończoności i minus zero jako napisy, bo JSON ich nie ma */
export type WywolanieJson = [string, (number | string)[], number | string];

export interface Nagrywanie {
  /** hak przed krokiem symulacji (przebieg.ts, HakiPrzebiegu.krok) */
  krok(tick: number): void;
  /** kończy nagrywanie, przywraca Math i oddaje nagranie (można wołać wielokrotnie) */
  zatrzymaj(): Wywolanie[];
  /** stos wywołania o numerze `stosPrzy` (liczonego od 0 w nagraniu) albo null, gdy takiego nie było */
  stos(): string | null;
}

type FunkcjaMath = (...argumenty: number[]) => number;

export function nagrywaj(od: number, doKroku: number, opcje: { stosPrzy?: number } = {}): Nagrywanie {
  const matematyka = Math as unknown as Record<string, FunkcjaMath>;
  const oryginaly = new Map<string, FunkcjaMath>();
  const wywolania: Wywolanie[] = [];
  let stos: string | null = null;
  let aktywne = false;
  let skonczone = false;

  const wlacz = () => {
    aktywne = true;
    for (const nazwa of NAGRYWANE) {
      const oryginal = matematyka[nazwa];
      if (typeof oryginal !== 'function') continue;
      oryginaly.set(nazwa, oryginal);
      matematyka[nazwa] = (...argumenty: number[]) => {
        const wynik = oryginal.apply(Math, argumenty);
        if (wywolania.length === opcje.stosPrzy) stos = new Error().stack ?? null;
        wywolania.push([nazwa, argumenty, wynik]);
        return wynik;
      };
    }
  };
  const wylacz = () => {
    for (const [nazwa, oryginal] of oryginaly) matematyka[nazwa] = oryginal;
    oryginaly.clear();
    aktywne = false;
    skonczone = true;
  };

  return {
    krok(tick) {
      if (aktywne) {
        if (tick >= doKroku) wylacz();
      } else if (!skonczone && tick >= od && tick < doKroku) wlacz();
    },
    zatrzymaj() {
      if (aktywne) wylacz();
      return wywolania;
    },
    stos: () => stos,
  };
}

/** pierwsze miejsce, w którym nagrania się różnią (nazwa, argumenty albo wynik, bit w bit), albo null */
export function pierwszaRoznica(
  a: Wywolanie[],
  b: Wywolanie[],
): { i: number; a: Wywolanie | undefined; b: Wywolanie | undefined } | null {
  const dlugosc = Math.max(a.length, b.length);
  for (let i = 0; i < dlugosc; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y || !rowne(x, y)) return { i, a: x, b: y };
  }
  return null;
}

const rowne = (x: Wywolanie, y: Wywolanie): boolean =>
  x[0] === y[0] && x[1].length === y[1].length && x[1].every((v, k) => Object.is(v, y[1][k])) && Object.is(x[2], y[2]);

const kodLiczby = (x: number): number | string => {
  if (Object.is(x, -0)) return '-0';
  if (Number.isFinite(x)) return x;
  return Number.isNaN(x) ? 'NaN' : x > 0 ? 'Infinity' : '-Infinity';
};

const odkodLiczby = (x: number | string): number => {
  if (typeof x === 'number') return x;
  if (x === '-0') return -0;
  if (x === 'NaN') return Number.NaN;
  return x === 'Infinity' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
};

export const zakodujWywolania = (w: Wywolanie[]): WywolanieJson[] =>
  w.map(([nazwa, argumenty, wynik]) => [nazwa, argumenty.map(kodLiczby), kodLiczby(wynik)]);

export const odkodujWywolania = (w: WywolanieJson[]): Wywolanie[] =>
  w.map(([nazwa, argumenty, wynik]) => [nazwa, argumenty.map(odkodLiczby), odkodLiczby(wynik)]);

export interface RoznicaFunkcji {
  /** ile nagranych wywołań tej funkcji policzono od nowa */
  wywolan: number;
  /** ile z nich dało inny wynik niż u wzorca (bit w bit) */
  roznych: number;
  przyklady: { argumenty: number[]; wzorzec: number; wynik: number }[];
}

export type SpisRoznic = Record<string, RoznicaFunkcji>;

/** Spis różnic na prawdziwych wywołaniach z gry: każde nagrane wywołanie wzorca (inny silnik) liczy od nowa w tym
    silniku, a wynik porównuje z nagranym bit w bit. W odróżnieniu od pierwszaRoznica nie zatrzymuje się na pierwszej
    różnicy i nie rozjeżdża się, gdy następne argumenty zależą od wcześniejszej różnicy: każde wywołanie dostaje te
    same argumenty co u wzorca, więc wynik to czysta miara, jak często ta funkcja różni się między silnikami na
    liczbach, które gra naprawdę podaje. */
export function sprawdzNagranie(wzorzec: Wywolanie[], przykladow = 3): SpisRoznic {
  const matematyka = Math as unknown as Record<string, FunkcjaMath>;
  const spis: SpisRoznic = {};
  for (const [nazwa, argumenty, oczekiwany] of wzorzec) {
    const funkcja = matematyka[nazwa];
    if (typeof funkcja !== 'function') throw new Error(`Math.${nazwa} nie istnieje w tym silniku`);
    const wpis = (spis[nazwa] ??= { wywolan: 0, roznych: 0, przyklady: [] });
    wpis.wywolan++;
    const wynik = funkcja.apply(Math, argumenty);
    if (Object.is(wynik, oczekiwany)) continue;
    wpis.roznych++;
    if (wpis.przyklady.length < przykladow) wpis.przyklady.push({ argumenty, wzorzec: oczekiwany, wynik });
  }
  return spis;
}
