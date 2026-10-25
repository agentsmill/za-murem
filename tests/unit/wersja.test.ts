/* Wersja gry w nagłówkach okien: każdy nagłówek „Za Murem X.Y” w src/ui ma wersję z package.json (bez numeru poprawki),
   żeby podbicie wersji nie zostawiło starego numeru w oknie dodanym równolegle na innej gałęzi (25.10.2026 okno wiki
   przyszło po podbiciu na 1.0 z nagłówkiem 0.4). */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const wersja = pkg.version.split('.').slice(0, 2).join('.');

describe('wersja w nagłówkach okien', () => {
  it('każdy nagłówek „Za Murem X.Y” w src/ui ma wersję z package.json', () => {
    const dir = new URL('../../src/ui/', import.meta.url);
    const naglowki: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const t = readFileSync(new URL(f, dir), 'utf8');
      for (const m of t.matchAll(/'Za Murem (\d+\.\d+)'/g)) naglowki.push(`${f}: ${m[1]}`);
    }
    expect(naglowki.length).toBeGreaterThan(0);
    expect(naglowki.filter((n) => !n.endsWith(`: ${wersja}`))).toEqual([]);
  });
});
