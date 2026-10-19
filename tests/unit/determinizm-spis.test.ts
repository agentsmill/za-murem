import { describe, expect, it } from 'vitest';
import { miejscaWPliku, spis } from '../../tools/determinizm/spis-miejsc.ts';

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

  it('w prawdziwym kodzie gry znajduje hypot w symulacji i w budowie świata (nic poza katalogami gry)', () => {
    const miejsca = spis();
    expect(miejsca.filter((m) => m.co === 'hypot' && m.plik.startsWith('src/sim/')).length).toBeGreaterThan(30);
    expect(miejsca.some((m) => m.co === 'atan2' && m.plik === 'src/world/rotate.ts')).toBe(true);
    expect(miejsca.every((m) => /^src\/(sim|gov|world|core|content|mieszkancy)\//.test(m.plik))).toBe(true);
  });
});
