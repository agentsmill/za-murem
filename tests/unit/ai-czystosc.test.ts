/* Czystość silnika osady AI (src/ai/*.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 1,
   uwaga I1 przeglądu końcowego etapu 1). Silnik ma chodzić tak samo w Node, w przeglądarce (druga gra w main.ts) i w testach,
   a jego przebieg ma wynikać tylko z ziarna i stanu gry, więc żaden plik katalogu nie może:
   - importować niczego spoza src/ (ani z tests/ i tools/, ani modułów Node: `node:*`, `fs`, `path`, ani pakietów z npm),
   - używać losowania spoza ziarna (`Math.random`), zegara (`Date`, `performance.`), DOM (`window.`, `document.`), pamięci
     przeglądarki (`localStorage`) ani Node'owych `process.`, sieci (`fetch(`) i timerów (`setTimeout(`, `setInterval(`).
   tsconfig.json ma `lib: DOM` i `types: ["node"]`, więc kompilator takiego użycia nie zatrzyma; do tej pory pilnował tego tylko
   jednorazowy grep przeglądu. Test czyta każdy plik jako tekst (także nowe pliki katalogu, bez listy w teście), usuwa komentarze
   (nagłówki modułów wymieniają tests/ i tools/ jako to, czego moduł nie importuje) i sprawdza resztę. Sam skaner ma testy na
   sztucznych źródłach, żeby nie przechodził na pustym warunku. Test nie jest dowodem czystości przechodniej (moduły z src/sim,
   src/gov i src/world, które silnik importuje): tę pilnują ich własne testy i determinizm (`npm run determinizm`). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../../src');
const KATALOG = path.join(SRC, 'ai');

/** Źródło bez komentarzy: komentarze liniowe i blokowe zastąpione spacjami (znaki nowej linii zostają, więc numery wierszy się
    nie przesuwają), napisy w apostrofach, cudzysłowach i grawisach przepisane bez zmian (import ma specyfikator w napisie).
    Napis w apostrofach albo cudzysłowach kończy się najdalej na końcu wiersza, więc literał wyrażenia regularnego z apostrofem
    psuje co najwyżej jeden wiersz. Wyrażenia w `${…}` wewnątrz grawisu są częścią napisu. */
function bezKomentarzy(zrodlo: string): string {
  let wynik = '';
  let i = 0;
  const n = zrodlo.length;
  while (i < n) {
    const c = zrodlo[i];
    const d = zrodlo[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && zrodlo[i] !== '\n') i++;
    } else if (c === '/' && d === '*') {
      i += 2;
      wynik += '  ';
      while (i < n && !(zrodlo[i] === '*' && zrodlo[i + 1] === '/')) {
        wynik += zrodlo[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
      wynik += '  ';
    } else if (c === "'" || c === '"' || c === '`') {
      const od = i++;
      while (i < n && zrodlo[i] !== c && !(c !== '`' && zrodlo[i] === '\n')) i += zrodlo[i] === '\\' ? 2 : 1;
      i++;
      wynik += zrodlo.slice(od, i);
    } else if (c === '\\') {
      // znak po ukośniku poza napisem (np. `\/` w wyrażeniu regularnym) nigdy nie zaczyna komentarza ani napisu
      wynik += zrodlo.slice(i, i + 2);
      i += 2;
    } else {
      wynik += c;
      i++;
    }
  }
  return wynik;
}

/** Specyfikatory modułów z bezkomentarzowego źródła: `import … from '…'`, `export … from '…'` (także wielowierszowe i `type`),
    `import '…'`, `import('…')` i `require('…')`. */
function specyfikatory(kod: string): string[] {
  const wzorce = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])(.*?)\1/g,
    /\bimport\s*(['"])(.*?)\1/g,
    /\bimport\s*\(\s*(['"])(.*?)\1\s*\)/g,
    /\brequire\s*\(\s*(['"])(.*?)\1\s*\)/g,
  ];
  return wzorce.flatMap((w) => [...kod.matchAll(w)].map((m) => m[2]));
}

/** Słowa, których w silniku nie wolno użyć (po usunięciu komentarzy): nazwa wzorca do komunikatu i wyrażenie. */
const ZAKAZANE: readonly [string, RegExp][] = [
  ['Math.random', /\bMath\.random\b/],
  ['Date', /\bDate\b/],
  ['performance.', /\bperformance\./],
  ['window.', /\bwindow\./],
  ['document.', /\bdocument\./],
  ['localStorage', /\blocalStorage\b/],
  ['process.', /\bprocess\./],
  ['fetch(', /\bfetch\s*\(/],
  ['setTimeout(', /\bsetTimeout\s*\(/],
  ['setInterval(', /\bsetInterval\s*\(/],
];

/** Wszystkie naruszenia w jednym pliku: lista komunikatów (pusta, gdy plik jest czysty). `plik` to ścieżka bezwzględna
    (od niej liczą się importy względne). */
function naruszenia(plik: string, zrodlo: string): string[] {
  const kod = bezKomentarzy(zrodlo);
  const wynik: string[] = [];
  for (const spec of specyfikatory(kod)) {
    if (!spec.startsWith('.')) {
      wynik.push(
        `import spoza src/ (${spec.startsWith('node:') || ['fs', 'path'].includes(spec) ? 'moduł Node' : 'pakiet'}): „${spec}”`,
      );
      continue;
    }
    const cel = path.resolve(path.dirname(plik), spec);
    if (cel.startsWith(path.join(SRC, path.sep))) continue;
    const korzen = path.dirname(SRC);
    const zTestowLubNarzedzi = [path.join(korzen, 'tests', path.sep), path.join(korzen, 'tools', path.sep)].some((k) =>
      cel.startsWith(k),
    );
    wynik.push(`import ${zTestowLubNarzedzi ? 'z tests/ lub tools/' : 'spoza src/'}: „${spec}”`);
  }
  for (const [nazwa, wzor] of ZAKAZANE) if (wzor.test(kod)) wynik.push(`zakazane użycie: ${nazwa}`);
  return wynik;
}

/** pliki .ts katalogu src/ai wraz z podkatalogami (ścieżki bezwzględne, posortowane) */
function pliki(katalog: string): string[] {
  return fs
    .readdirSync(katalog, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? pliki(path.join(katalog, e.name))
        : e.isFile() && e.name.endsWith('.ts')
          ? [path.join(katalog, e.name)]
          : [],
    )
    .sort();
}

describe('czystość src/ai: każdy plik jako tekst', () => {
  const wszystkie = pliki(KATALOG);

  it('katalog ma pliki silnika (test nie przechodzi na pustej liście)', () => {
    const nazwy = wszystkie.map((p) => path.relative(KATALOG, p));
    for (const oczekiwany of ['gra.ts', 'silnik.ts', 'okna.ts', 'zima.ts', 'jedzenie.ts', 'rozwoj.ts'])
      expect(nazwy).toContain(oczekiwany);
  });

  it('skaner widzi importy: gra.ts ma ich kilkanaście, wszystkie względne', () => {
    const kod = bezKomentarzy(fs.readFileSync(path.join(KATALOG, 'gra.ts'), 'utf8'));
    const spec = specyfikatory(kod);
    expect(spec.length).toBeGreaterThanOrEqual(10);
    for (const s of spec) expect(s.startsWith('.'), s).toBe(true);
    expect(spec).toContain('../sim/sim.ts');
    expect(spec).toContain('./silnik.ts');
  });

  it.each(wszystkie.map((p) => [path.relative(KATALOG, p), p]))(
    '%s: bez importów spoza src/ i bez zakazanych słów',
    (_nazwa, plik) => {
      expect(naruszenia(plik, fs.readFileSync(plik, 'utf8'))).toEqual([]);
    },
  );
});

describe('czystość src/ai: skaner na sztucznych źródłach', () => {
  const plik = path.join(KATALOG, 'przyklad.ts');

  it('czyste źródło z importami z src/ przechodzi', () => {
    const zrodlo = [
      "import { a } from '../sim/sim.ts';",
      "import type { B } from '../world/world.ts';",
      "import { c, d } from './silnik.ts';",
      "export { e } from './gra.ts';",
      'export const f = 1;',
    ].join('\n');
    expect(naruszenia(plik, zrodlo)).toEqual([]);
  });

  it('wykrywa import z node:, fs, path, pakietu, tests/, tools/ i spoza src/', () => {
    const zrodlo = [
      "import fs from 'node:fs';",
      "import { readFileSync } from 'fs';",
      "import path from 'path';",
      "import { Sprite } from 'pixi.js';",
      "import { demo } from '../../tests/unit/ai-pomoc.ts';",
      "import { zagraj } from '../../tools/bot-osada.ts';",
      "import { x } from '../../public/x.ts';",
    ].join('\n');
    expect(naruszenia(plik, zrodlo)).toEqual([
      'import spoza src/ (moduł Node): „node:fs”',
      'import spoza src/ (moduł Node): „fs”',
      'import spoza src/ (moduł Node): „path”',
      'import spoza src/ (pakiet): „pixi.js”',
      'import z tests/ lub tools/: „../../tests/unit/ai-pomoc.ts”',
      'import z tests/ lub tools/: „../../tools/bot-osada.ts”',
      'import spoza src/: „../../public/x.ts”',
    ]);
  });

  it('wykrywa import wielowierszowy, typowy, wyeksportowany, pusty i dynamiczny', () => {
    const zrodlo = [
      'import {',
      '  a,',
      '  b,',
      "} from '../../tools/x.ts';",
      "import type { C } from 'node:path';",
      "export * from '../../tests/y.ts';",
      "import '../../tools/z.ts';",
      "const m = await import('node:fs');",
      "const r = require('fs');",
    ].join('\n');
    expect(naruszenia(plik, zrodlo)).toEqual([
      'import z tests/ lub tools/: „../../tools/x.ts”',
      'import spoza src/ (moduł Node): „node:path”',
      'import z tests/ lub tools/: „../../tests/y.ts”',
      'import z tests/ lub tools/: „../../tools/z.ts”',
      'import spoza src/ (moduł Node): „node:fs”',
      'import spoza src/ (moduł Node): „fs”',
    ]);
  });

  it.each([
    ['Math.random', 'const x = Math.random();'],
    ['Date', 'const t = new Date();'],
    ['Date', 'const t = Date.now();'],
    ['performance.', 'const t = performance.now();'],
    ['window.', 'window.addEventListener("x", f);'],
    ['document.', 'const e = document.createElement("div");'],
    ['localStorage', 'localStorage.setItem("a", "b");'],
    ['process.', 'const a = process.argv;'],
    ['fetch(', 'const r = await fetch("/api");'],
    ['setTimeout(', 'setTimeout(f, 10);'],
    ['setInterval(', 'setInterval(f, 10);'],
  ])('wykrywa zakazane użycie %s', (nazwa, zrodlo) => {
    expect(naruszenia(plik, zrodlo)).toEqual([`zakazane użycie: ${nazwa}`]);
  });

  it('komentarze nie liczą się: nagłówek może wymieniać tests/, tools/, Math.random i Date', () => {
    const zrodlo = [
      '/* Moduł nie importuje niczego z tests/ i tools/, nie używa Math.random, Date.now() ani performance.now(),',
      "   nie zna window. ani document. i nie robi import fs from 'node:fs'. */",
      "import { a } from '../sim/sim.ts'; // nie import { b } from '../../tools/b.ts'",
      '// Math.random() byłoby błędem',
      'export const x = a; /* localStorage */',
    ].join('\n');
    expect(naruszenia(plik, zrodlo)).toEqual([]);
  });

  it('komentarz w środku napisu i napis w środku komentarza nie mylą skanera', () => {
    const zrodlo = [
      "const adres = 'http://example.test/a'; // komentarz z 'apostrofem",
      "const b = `a // b /* c */ x`; /* i 'taki' */ const t = Date.now();",
    ].join('\n');
    expect(naruszenia(plik, zrodlo)).toEqual(['zakazane użycie: Date']);
  });

  it('ukośnik w wyrażeniu regularnym nie zaczyna komentarza, który schowałby resztę wiersza', () => {
    expect(naruszenia(plik, 'const r = /a\\/\\//; const t = Date.now();')).toEqual(['zakazane użycie: Date']);
  });

  it('podobne nazwy nie są naruszeniem: updateDate, candidate, mydocument.x, windowed', () => {
    const zrodlo = 'const a = updateDate(candidate); const b = mydocument.x + windowed;';
    expect(naruszenia(plik, zrodlo)).toEqual([]);
  });
});
