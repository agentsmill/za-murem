import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/* Dymny test samego CLI bramki (tools/determinizm.ts) na nogach Node, bez przeglądarek: kod wyjścia 64 przy złych
   argumentach i kod 0 przy zgodności jednego silnika, z plikiem --json. Logika kodów 0/1/2 ma testy na udawanych nogach
   (determinizm-bramka.test.ts), tu sprawdzamy, że cienkie CLI ją poprawnie spina z procesem. */

const execFileP = promisify(execFile);
const KORZEN = path.resolve(import.meta.dirname, '../..');
/** noga Node, która istnieje w każdym środowisku testów: bieżący Node jako „node24” na Node 24 (CI), inaczej jako „node” */
const SILNIK = process.versions.node.startsWith('24.') ? 'node24' : 'node';

let katalog = '';
beforeEach(() => {
  katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-cli-'));
});
afterEach(() => {
  fs.rmSync(katalog, { recursive: true, force: true });
});

async function cli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ kod: number; stdout: string; stderr: string }> {
  try {
    const r = await execFileP(process.execPath, [path.join(KORZEN, 'tools/determinizm.ts'), ...args], {
      cwd: KORZEN,
      timeout: 120_000,
      env: { ...process.env, ...env },
    });
    return { kod: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const b = e as { code: number; stdout: string; stderr: string };
    return { kod: b.code, stdout: b.stdout, stderr: b.stderr };
  }
}

describe('CLI bramki determinizmu (npm run determinizm)', () => {
  it('złe argumenty to kod 64 z komunikatem i użyciem, bez uruchamiania żadnego silnika', async () => {
    const zla = await cli(['--godziny=0']);
    expect(zla.kod).toBe(64);
    expect(zla.stderr).toContain('--godziny to liczba całkowita od 1');
    expect(zla.stderr).toContain('Użycie:');
    expect(zla.stdout).toBe('');
    const nieznana = await cli(['--cos']);
    expect(nieznana.kod).toBe(64);
    expect(nieznana.stderr).toContain('Nieznany argument: --cos');
  });

  it('jeden silnik Node: kod 0, raport z tabelą i skrótem, wyniki w pliku --json', async () => {
    const json = path.join(katalog, 'wynik.json');
    const r = await cli(['--demo=zielonki', '--godziny=1', '--zwykly', `--silniki=${SILNIK}`, `--json=${json}`]);
    expect(r.stderr).toContain(`silniki: ${SILNIK}`);
    expect(r.kod).toBe(0);
    expect(r.stdout).toContain('Determinizm silników JS: 1 scenariuszy po 1 h gry');
    expect(r.stdout).toMatch(new RegExp(`${SILNIK}\\s+Node \\d+\\.\\d+\\.\\d+`));
    expect(r.stdout).toMatch(/zgodne: zielonki zwykły 1 h\s+świat [0-9a-f]{8}, skrót po 1 h: [0-9a-f]{8}/);
    expect(r.stdout).toContain('Kod wyjścia 0');
    const dane = JSON.parse(fs.readFileSync(json, 'utf8'));
    expect(dane.godziny).toBe(1);
    const wynik = dane.wyniki[`${SILNIK}|zielonki|zwykly|12345`];
    expect(wynik.biegi).toHaveLength(2);
    expect(wynik.biegi[0].skroty).toHaveLength(1);
    expect(wynik.biegi[0].skroty).toEqual(wynik.biegi[1].skroty);
  }, 60_000);

  it('żaden z wybranych silników nie jest dostępny: kod 2 z poleceniem uzupełniającym, bez wyjątku (przeglądarki ukryte przed Playwright)', async () => {
    const pusty = path.join(katalog, 'bez-przegladarek');
    fs.mkdirSync(pusty);
    const r = await cli(['--demo=zielonki', '--godziny=1', '--silniki=webkit'], { PLAYWRIGHT_BROWSERS_PATH: pusty });
    expect(r.kod).toBe(2);
    expect(r.stdout).toContain('żaden z wybranych silników nie jest dostępny');
    expect(r.stdout).toContain('npx playwright install webkit');
    expect(r.stdout).toContain('Kod wyjścia 2');
    expect(r.stderr).not.toContain('TypeError');
  }, 60_000);
});
