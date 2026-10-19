import { describe, expect, it } from 'vitest';
import { atan2D, atanD, cosD, hyp, sinD, zainstaluj } from '../../tools/determinizm/mat-proba.ts';

const bufor = new DataView(new ArrayBuffer(8));
/** odległość w ostatnich bitach (ulp) między dwiema liczbami tego samego znaku; 0, gdy równe */
function ulpy(a: number, b: number): number {
  if (Object.is(a, b)) return 0;
  if (a === 0 || b === 0) return Math.abs(a - b) / Number.MIN_VALUE;
  bufor.setFloat64(0, a);
  const x = bufor.getBigInt64(0);
  bufor.setFloat64(0, b);
  const y = bufor.getBigInt64(0);
  return Number(x > y ? x - y : y - x);
}
function mulberry(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('próba deterministycznej matematyki (prototyp src/core/mat.ts)', () => {
  it('hyp na kratce gry jest dokładne: trójki pitagorejskie dają liczby całkowite, reszta to sqrt sumy kwadratów', () => {
    for (const [a, b, c] of [
      [3, 4, 5],
      [5, 12, 13],
      [8, 15, 17],
      [7, 24, 25],
      [20, 21, 29],
      [1.5, 2, 2.5],
    ])
      for (const [x, y] of [
        [a, b],
        [-a, b],
        [b, -a],
        [-b, -a],
      ])
        expect(hyp(x, y)).toBe(c);
    for (let x = -30; x <= 30; x += 0.5)
      for (let y = -30; y <= 30; y += 0.5) expect(hyp(x, y)).toBe(Math.sqrt(x * x + y * y));
  });

  it('sinus i cosinus są zgodne z Math co do kilku ostatnich bitów, nieparzyste i parzyste, i trafiają w punkty szczególne', () => {
    const los = mulberry(1);
    let najgorszy = 0;
    let najwiekszyBlad = 0;
    for (let i = 0; i < 200_000; i++) {
      const x = (los() - 0.5) * 100;
      for (const [mine, wzor] of [
        [sinD(x), Math.sin(x)],
        [cosD(x), Math.cos(x)],
      ]) {
        najwiekszyBlad = Math.max(najwiekszyBlad, Math.abs(mine - wzor));
        // względem Math: kilka ostatnich bitów dla wyników od 0,25 w górę, a niżej (redukcja bez ogona) błąd bezwzględny
        if (Math.abs(wzor) >= 0.25) najgorszy = Math.max(najgorszy, ulpy(mine, wzor));
      }
      expect(sinD(-x)).toBe(-sinD(x));
      expect(cosD(-x)).toBe(cosD(x));
    }
    expect(najgorszy).toBeLessThanOrEqual(3);
    expect(najwiekszyBlad).toBeLessThan(3e-16);
    expect(sinD(0)).toBe(0);
    expect(Object.is(sinD(-0), -0)).toBe(true);
    expect(cosD(0)).toBe(1);
    expect(Math.abs(sinD(Math.PI / 2) - 1)).toBeLessThan(1e-15);
    expect(Math.abs(cosD(Math.PI / 2))).toBeLessThan(1e-15);
    expect(Math.abs(cosD(Math.PI) + 1)).toBeLessThan(1e-15);
    expect(Math.abs(sinD(1e5) - Math.sin(1e5))).toBeLessThan(1e-12);
    // poza zakresem redukcji i wartości szczególne zostają przy Math
    expect(sinD(Number.POSITIVE_INFINITY)).toBeNaN();
    expect(cosD(Number.NaN)).toBeNaN();
    expect(sinD(1e9)).toBe(Math.sin(1e9));
  });

  it('atan i atan2 są zgodne z Math co do kilku ostatnich bitów we wszystkich ćwiartkach i na osiach', () => {
    const los = mulberry(2);
    let najgorszy = 0;
    for (let i = 0; i < 200_000; i++) {
      const y = (los() - 0.5) * 2000;
      const x = (los() - 0.5) * 2000;
      najgorszy = Math.max(najgorszy, ulpy(atan2D(y, x), Math.atan2(y, x)));
      const t = (los() - 0.5) * 20;
      najgorszy = Math.max(najgorszy, ulpy(atanD(t), Math.atan(t)));
    }
    expect(najgorszy).toBeLessThanOrEqual(3);
    // osie, zera ze znakiem, nieskończoności i NaN jak w Math.atan2
    const szczegolne = [0, -0, 1, -1, 5, -5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN];
    for (const y of szczegolne)
      for (const x of szczegolne) expect(atan2D(y, x), `atan2(${y}, ${x})`).toBe(Math.atan2(y, x));
    expect(atan2D(1, 1)).toBeCloseTo(Math.PI / 4, 15);
    expect(atan2D(-11, 8)).toBeCloseTo(Math.atan2(-11, 8), 14);
  });

  it('nie woła funkcji przestępnych Math: z podmienionymi na rzucające wyjątek działa tak samo', () => {
    const m = Math as unknown as Record<string, unknown>;
    const nazwy = ['sin', 'cos', 'tan', 'atan', 'atan2', 'hypot', 'exp', 'log', 'pow', 'sinh', 'cbrt'];
    const wzorce = [sinD(1.234), cosD(-2.5), atanD(0.7), atan2D(-11, 8), atan2D(3, -4), hyp(1.5, 1.5)];
    const oryginaly = nazwy.map((n) => m[n]);
    try {
      for (const n of nazwy)
        m[n] = () => {
          throw new Error(`Math.${n} wywołane`);
        };
      expect([sinD(1.234), cosD(-2.5), atanD(0.7), atan2D(-11, 8), atan2D(3, -4), hyp(1.5, 1.5)]).toEqual(wzorce);
    } finally {
      nazwy.forEach((n, i) => {
        m[n] = oryginaly[i];
      });
    }
  });

  it('zainstaluj podmienia Math.hypot, atan2, sin i cos, a wynik wywołania przywraca oryginały', () => {
    const [h, a, s, c] = [Math.hypot, Math.atan2, Math.sin, Math.cos];
    const przywroc = zainstaluj();
    expect(Math.hypot).not.toBe(h);
    expect(Math.hypot(3, 4)).toBe(5);
    expect(Math.hypot(1, 2, 2)).toBe(3);
    expect(Math.atan2(1, 1)).toBeCloseTo(Math.PI / 4, 15);
    przywroc();
    expect([Math.hypot, Math.atan2, Math.sin, Math.cos]).toEqual([h, a, s, c]);
  });
});
