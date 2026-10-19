import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const kod = fs.readFileSync(path.resolve(import.meta.dirname, '../../tools/determinizm/proba-matematyki.js'), 'utf8');

interface Wynik {
  N: number;
  kwadrat_kratka: number;
  pow2_kratka: number;
  hypot_na_progu: number;
}

/** próba w osobnym kontekście, w którym Math.pow i Math.hypot liczą swoje wywołania */
function uruchom(n: number): { wynik: Wynik; wywolania: Record<string, number> } {
  const kontekst = vm.createContext({ console: { log() {} } });
  vm.runInContext(
    `globalThis.N_PROBY = ${n};
     globalThis.licznik = { pow: 0, hypot: 0 };
     for (const nazwa of ['pow', 'hypot']) {
       const oryginal = Math[nazwa];
       Math[nazwa] = function (...argumenty) { licznik[nazwa]++; return oryginal.apply(Math, argumenty); };
     }`,
    kontekst,
  );
  vm.runInContext(kod, kontekst);
  return { wynik: kontekst.wynikProbyMatematyki, wywolania: kontekst.licznik };
}

describe('mikro-próba matematyki silników (proba-matematyki.js)', () => {
  it('rzeczywiście woła Math.pow (wiersz „Math.pow(x, 2)” raportu), a nie operator ** pod inną nazwą', () => {
    const { wynik, wywolania } = uruchom(1000);
    expect(wynik.N).toBe(1000);
    // jedno Math.pow(dx, 2) na obrót pętli
    expect(wywolania.pow).toBe(1000);
  });

  it('woła Math.hypot dwa razy na obrót (kratka i losowe liczby) i liczy progowe odległości całkowite', () => {
    const { wynik, wywolania } = uruchom(1000);
    expect(wywolania.hypot).toBe(2000);
    expect(wynik.hypot_na_progu).toBeGreaterThan(0);
  });

  it('na kratce gry kwadrat liczbą połówkową jest dokładny, więc ** i Math.pow zgadzają się z mnożeniem', () => {
    const { wynik } = uruchom(5000);
    expect(wynik.kwadrat_kratka).toBe(0);
    expect(wynik.pow2_kratka).toBe(0);
  });
});
