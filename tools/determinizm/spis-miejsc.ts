/* Spis miejsc w kodzie, w których silniki JS mogą się rozjechać (MMO, etap 0): wywołania funkcji Math, których wynik nie
   jest dokładnie zadany przez IEEE 754 (hypot, sin, cos, atan2, exp, log, pow itd., lista NAGRYWANE z nagrywanie.ts),
   i operator ** (nie da się go podsłuchać jak Math.pow). Liczy prawdziwe wywołania z drzewa składni (komentarze i napisy
   się nie liczą), osobno dla katalogów, które liczą grę: src/sim, src/gov, src/world, src/core, src/content,
   src/mieszkancy. Math.sqrt, floor, round, min, max, abs i imul są dokładne w każdym silniku, więc ich tu nie ma.
   Uruchomienie: node tools/determinizm/spis-miejsc.ts [--szczegoly] (z --szczegoly każde miejsce jako plik:linia). */

import fs from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { NAGRYWANE } from './nagrywanie.ts';
import { tabelaLinie } from './raport.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const KATALOGI = ['src/sim', 'src/gov', 'src/world', 'src/core', 'src/content', 'src/mieszkancy'];
const RYZYKOWNE = new Set<string>(NAGRYWANE);

export interface Miejsce {
  plik: string;
  linia: number;
  /** nazwa funkcji Math albo „**” */
  co: string;
}

type Wezel = { type?: string; start?: number; [klucz: string]: unknown };

/** miejsca w jednym pliku .ts */
export function miejscaWPliku(kod: string, plik: string): Miejsce[] {
  const wynik: Miejsce[] = [];
  const liniaOd = (przesuniecie: number) => kod.slice(0, przesuniecie).split('\n').length;
  const idz = (w: unknown): void => {
    if (Array.isArray(w)) {
      for (const e of w) idz(e);
      return;
    }
    if (!w || typeof w !== 'object') return;
    const n = w as Wezel;
    if (n.type === 'CallExpression') {
      const c = n.callee as Wezel & { object?: Wezel; property?: Wezel; computed?: boolean };
      if (
        c?.type === 'MemberExpression' &&
        !c.computed &&
        c.object?.name === 'Math' &&
        RYZYKOWNE.has(String(c.property?.name))
      )
        wynik.push({ plik, linia: liniaOd(n.start ?? 0), co: String(c.property?.name) });
    }
    if (
      (n.type === 'BinaryExpression' && n.operator === '**') ||
      (n.type === 'AssignmentExpression' && n.operator === '**=')
    )
      wynik.push({ plik, linia: liniaOd(n.start ?? 0), co: '**' });
    for (const k of Object.keys(n)) if (k !== 'type') idz(n[k]);
  };
  idz(parseAst(kod, { lang: 'ts' }));
  return wynik;
}

function pliki(katalog: string): string[] {
  return fs.readdirSync(katalog, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(katalog, e.name);
    if (e.isDirectory()) return pliki(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [p] : [];
  });
}

/** Miejsca w podanych katalogach (domyślnie w katalogach, które liczą grę w tym repozytorium), bez testów i narzędzi.
    Ścieżki w wyniku są względem `korzen`; katalog z listy, którego nie ma, to błąd (zmiana nazwy katalogu nie może
    po cichu zrobić dziury w spisie). */
export function spis(korzen: string = KORZEN, katalogi: readonly string[] = KATALOGI): Miejsce[] {
  return katalogi.flatMap((k) =>
    pliki(path.join(korzen, k)).flatMap((p) =>
      miejscaWPliku(fs.readFileSync(p, 'utf8'), path.relative(korzen, p).replaceAll(path.sep, '/')),
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const miejsca = spis();
  const katalog = (m: Miejsce) => KATALOGI.find((k) => m.plik.startsWith(`${k}/`)) ?? '?';
  const funkcje = [...new Set(miejsca.map((m) => m.co))].sort();
  console.log('Miejsca w kodzie z funkcjami Math, których wynik może się różnić między silnikami, i z operatorem **:');
  console.log('');
  for (const l of tabelaLinie([
    ['funkcja', ...KATALOGI, 'razem'],
    ...funkcje.map((f) => [
      f,
      ...KATALOGI.map((k) => String(miejsca.filter((m) => m.co === f && katalog(m) === k).length || '')),
      String(miejsca.filter((m) => m.co === f).length),
    ]),
  ]))
    console.log(l);
  console.log('');
  const plikowo = new Map<string, Map<string, number>>();
  for (const m of miejsca) {
    const f = plikowo.get(m.plik) ?? new Map<string, number>();
    f.set(m.co, (f.get(m.co) ?? 0) + 1);
    plikowo.set(m.plik, f);
  }
  for (const [plik, f] of [...plikowo].sort())
    console.log(`${plik}: ${[...f].map(([k, n]) => `${k} ×${n}`).join(', ')}`);
  if (process.argv.includes('--szczegoly')) {
    console.log('');
    for (const m of miejsca.sort((a, b) => a.plik.localeCompare(b.plik) || a.linia - b.linia))
      console.log(`${m.plik}:${m.linia} ${m.co}`);
  }
}
