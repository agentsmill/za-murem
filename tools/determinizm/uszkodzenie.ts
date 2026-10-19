/* Umyślne uszkodzenie jednej funkcji Math do samotestu bramki determinizmu (czyste, bez node:* i DOM). Bramka, która
   zawsze mówi „zgodne”, nic nie dowodzi, więc tools/determinizm.ts z `--psuj=silnik:funkcja` psuje funkcję w jednej
   nodze: wynik każdego wywołania tej funkcji (albo co `co`-ty) rośnie o jeden bit, czyli o jedną jednostkę ostatniego
   miejsca, tyle, ile mogą się różnić prawdziwe silniki. Stan gry leży na kratce (pionki stoją na środkach kafelków), więc
   błąd ostatniego bitu hypot zmienia stan tylko tam, gdzie odległość wypada dokładnie na progu porównania (3, 5, 10 …);
   dlatego psujemy każde wywołanie, a nie co któreś. Kod wyjścia 1, godzina gry i nagranie wskazujące tę funkcję znaczą, że
   bramka widzi rozbieżność. Używają tego też testy (tests/unit/determinizm-nagrywanie.test.ts). */

type FunkcjaMath = (...argumenty: number[]) => number;

const widok = new DataView(new ArrayBuffer(8));

/** następna liczba double o tym samym znaku (zmiana ostatniego bitu mantysy); 0 i nieskończoności bez zmian */
function oBitWiecej(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  widok.setFloat64(0, x);
  widok.setBigUint64(0, widok.getBigUint64(0) + 1n);
  return widok.getFloat64(0);
}

export interface Uszkodzenie {
  /** liczenie wywołań od nowa: każdy przebieg psuje te same wywołania, więc noga zostaje powtarzalna */
  zeruj(): void;
  przywroc(): void;
}

export function psuj(nazwa: string, co = 1): Uszkodzenie {
  const matematyka = Math as unknown as Record<string, FunkcjaMath>;
  const oryginal = matematyka[nazwa];
  let n = 0;
  matematyka[nazwa] = (...argumenty: number[]) => {
    const wynik = oryginal.apply(Math, argumenty);
    return ++n % co === 0 ? oBitWiecej(wynik) : wynik;
  };
  return {
    zeruj: () => {
      n = 0;
    },
    przywroc: () => {
      matematyka[nazwa] = oryginal;
    },
  };
}
