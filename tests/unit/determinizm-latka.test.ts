import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zastosujLatke } from '../../tools/determinizm/latka.ts';
import { atan2D, hyp } from '../../tools/determinizm/mat-proba.ts';
import { NAGRYWANE } from '../../tools/determinizm/nagrywanie.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const matematyka = Math as unknown as Record<string, (...a: number[]) => number>;
/** natywne funkcje Math z chwili załadowania testu (własności Math nie są wyliczalne, więc bez rozwinięcia obiektu) */
const natywne = Object.fromEntries(NAGRYWANE.map((f) => [f, matematyka[f]]));

let przywroc: (() => void) | null = null;
afterEach(() => {
  przywroc?.();
  przywroc = null;
  // niezależnie od tego, co zrobił test, Math wraca do natywnych funkcji
  for (const f of NAGRYWANE) matematyka[f] = natywne[f];
});

describe('łatki Math do prób wrażliwości botów (ZM_LATKA)', () => {
  it('puste ustawienie nic nie zmienia', () => {
    przywroc = zastosujLatke('');
    for (const f of NAGRYWANE) expect(matematyka[f], f).toBe(natywne[f]);
  });

  it('hypot-sqrt: odległość z samych działań IEEE, a przywrócenie oddaje natywną funkcję', () => {
    przywroc = zastosujLatke('hypot-sqrt');
    expect(Math.hypot).not.toBe(natywne.hypot);
    expect(Math.hypot(3, 4)).toBe(5);
    expect(Math.hypot(-6, -17.5)).toBe(Math.sqrt(36 + 306.25));
    expect(Math.hypot(1, 2, 2)).toBe(3);
    przywroc();
    przywroc = null;
    expect(Math.hypot).toBe(natywne.hypot);
  });

  it('ulp:<funkcja> zwiększa każdy wynik wskazanych funkcji o jeden bit, reszty nie rusza', () => {
    przywroc = zastosujLatke('ulp:hypot,sin');
    expect(Math.hypot(3, 4)).toBe(5.000000000000001);
    expect(Math.sin(1)).toBeGreaterThan(natywne.sin(1));
    expect(Math.cos).toBe(natywne.cos);
    expect(Math.atan2).toBe(natywne.atan2);
  });

  it('ulp:wszystkie psuje każdą funkcję z listy nagrywanych', () => {
    przywroc = zastosujLatke('ulp:wszystkie');
    for (const f of NAGRYWANE) expect(matematyka[f], f).not.toBe(natywne[f]);
    expect(Math.hypot(3, 4)).toBe(5.000000000000001);
  });

  it('mat: hypot, atan2, sin i cos z deterministycznej matematyki (mat-proba.ts)', () => {
    przywroc = zastosujLatke('mat');
    expect(Math.hypot(1.5, 1.5)).toBe(hyp(1.5, 1.5));
    expect(Math.atan2(-11, 8)).toBe(atan2D(-11, 8));
    expect(Math.exp).toBe(natywne.exp);
  });

  it('nieznana wartość to błąd, żeby literówka nie uruchomiła cicho próby bez łatki', () => {
    expect(() => zastosujLatke('hypot_sqrt')).toThrow(/ZM_LATKA.*hypot_sqrt/);
    expect(() => zastosujLatke('ulp:')).toThrow(/ZM_LATKA/);
    expect(() => zastosujLatke('ulp:nie_ma_takiej')).toThrow(/nie_ma_takiej/);
    // nic nie zostało podmienione po nieudanej próbie
    for (const f of NAGRYWANE) expect(matematyka[f], f).toBe(natywne[f]);
  });

  it('preload dla `node --import` czyta ZM_LATKA z otoczenia procesu', () => {
    const uruchom = (latka: string) =>
      execFileSync(
        process.execPath,
        ['--import', path.join(KORZEN, 'tools/determinizm/latka-boty.ts'), '-p', 'Math.hypot(3, 4)'],
        { encoding: 'utf8', env: { ...process.env, ZM_LATKA: latka } },
      ).trim();
    expect(uruchom('')).toBe('5');
    expect(uruchom('ulp:hypot')).toBe('5.000000000000001');
    expect(() => uruchom('literowka')).toThrow();
  });
});
