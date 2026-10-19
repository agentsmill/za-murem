import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { miejscaWPliku, spis } from '../../tools/determinizm/spis-miejsc.ts';

const tymczasowe: string[] = [];
afterEach(() => {
  for (const k of tymczasowe.splice(0)) fs.rmSync(k, { recursive: true, force: true });
});

/** drzewo plików w katalogu tymczasowym: klucze to ścieżki względem korzenia */
function drzewo(pliki: Record<string, string>): string {
  const korzen = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-spis-'));
  tymczasowe.push(korzen);
  for (const [sciezka, tresc] of Object.entries(pliki)) {
    fs.mkdirSync(path.dirname(path.join(korzen, sciezka)), { recursive: true });
    fs.writeFileSync(path.join(korzen, sciezka), tresc);
  }
  return korzen;
}

describe('spis miejsc, w których silniki JS mogą się rozjechać', () => {
  it('liczy prawdziwe wywołania Math i operator **, a komentarze i napisy pomija', () => {
    const kod = [
      'const a = Math.hypot(1, 2) + Math.sqrt(4) + Math.floor(1.5);',
      '// Math.sin(1) w komentarzu',
      "const s = 'Math.cos(0)';",
      '/* Math.atan2(1, 2) i x ** 2 */',
      'const b = a ** 2 + Math.atan2(a, 1);',
      'let c = 3;',
      'c **= 2;',
      'const f = (x: number): number => Math.sin(x) * Math.cos(x);',
    ].join('\n');
    expect(miejscaWPliku(kod, 'x.ts')).toEqual([
      { plik: 'x.ts', linia: 1, co: 'hypot' },
      { plik: 'x.ts', linia: 5, co: '**' },
      { plik: 'x.ts', linia: 5, co: 'atan2' },
      { plik: 'x.ts', linia: 7, co: '**' },
      { plik: 'x.ts', linia: 8, co: 'sin' },
      { plik: 'x.ts', linia: 8, co: 'cos' },
    ]);
  });

  it('przeszukuje podane katalogi rekurencyjnie, ścieżki liczy od korzenia, a .d.ts, inne rozszerzenia i inne katalogi pomija', () => {
    const korzen = drzewo({
      'src/sim/a.ts': 'export const d = Math.hypot(3, 4);\n',
      'src/sim/pod/b.ts': 'export const e = (x: number) => x ** 2 + Math.exp(x);\n',
      'src/sim/typy.d.ts': 'const w = Math.hypot(1, 2);\n',
      'src/sim/notatki.md': 'Math.hypot(1, 2)\n',
      'src/world/c.ts': 'const f = Math.atan2(1, 2);\nconst g = Math.sqrt(2);\n',
      'src/ui/d.ts': 'const z = Math.hypot(1, 1);\n',
    });
    const miejsca = spis(korzen, ['src/sim', 'src/world']).sort(
      (a, b) => a.plik.localeCompare(b.plik) || a.linia - b.linia,
    );
    expect(miejsca).toEqual([
      { plik: 'src/sim/a.ts', linia: 1, co: 'hypot' },
      { plik: 'src/sim/pod/b.ts', linia: 1, co: '**' },
      { plik: 'src/sim/pod/b.ts', linia: 1, co: 'exp' },
      { plik: 'src/world/c.ts', linia: 1, co: 'atan2' },
    ]);
  });

  it('katalog z listy, którego nie ma, to błąd, a nie cicha luka w spisie', () => {
    const korzen = drzewo({ 'src/sim/a.ts': 'export const d = 1;\n' });
    expect(() => spis(korzen, ['src/sim', 'src/nie-ma'])).toThrow(/ENOENT/);
  });

  it('bez argumentów przegląda katalogi gry w repozytorium i nie wychodzi poza nie (bez założeń o tym, ile jest tam wywołań)', () => {
    const miejsca = spis();
    expect(miejsca.every((m) => /^src\/(sim|gov|world|core|content|mieszkancy)\/.+\.ts$/.test(m.plik))).toBe(true);
    expect(miejsca.every((m) => Number.isInteger(m.linia) && m.linia >= 1)).toBe(true);
  });
});
