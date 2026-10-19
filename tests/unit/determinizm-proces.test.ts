import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nogaNode } from '../../tools/determinizm/nogi.ts';
import { opisBleduProcesu } from '../../tools/determinizm/proces.ts';
import type { Zlecenie } from '../../tools/determinizm/zlecenie.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const zlecenie: Zlecenie = { demo: 'zielonki', godziny: 1, tryb: 'zwykly', seed: 7, powtorz: 1 };

/** błąd w kształcie tego, co rzuca execFile: komunikat z całym poleceniem, a właściwa przyczyna we właściwościach */
const bladProcesu = (o: object, komunikat = 'Command failed: /usr/bin/node /repo/tools/x.ts --demo=a\nreszta') =>
  Object.assign(new Error(komunikat), o);

describe('opis błędu procesu potomnego', () => {
  it('bierze z stderr linię z błędem, nie wiersz polecenia, i dopisuje kod wyjścia', () => {
    const stderr = [
      'file:///repo/tools/x.ts:3',
      "    throw new Error('x');",
      '    ^',
      '',
      'Error: x',
      '    at f (file:///repo/tools/x.ts:3:9)',
      '',
    ].join('\n');
    expect(opisBleduProcesu(bladProcesu({ stderr, code: 1 }))).toBe('Error: x (kod wyjścia 1)');
  });

  it('rozpoznaje błąd typu TypeError i wyjątek jsc', () => {
    expect(opisBleduProcesu(bladProcesu({ stderr: 'TypeError: nie funkcja\n  at a\n', code: 1 }))).toBe(
      'TypeError: nie funkcja (kod wyjścia 1)',
    );
    expect(opisBleduProcesu(bladProcesu({ stderr: 'Exception: RangeError: za duże\n', code: 3 }))).toBe(
      'Exception: RangeError: za duże (kod wyjścia 3)',
    );
  });

  it('bez linii z błędem bierze pierwszą niepustą linię stderr', () => {
    expect(opisBleduProcesu(bladProcesu({ stderr: '\n  zabrakło pamięci\nślad\n', code: 134 }))).toBe(
      'zabrakło pamięci (kod wyjścia 134)',
    );
  });

  it('proces zabity po limicie czasu: komunikat o limicie, nie o poleceniu', () => {
    const e = bladProcesu({ killed: true, signal: 'SIGTERM', code: null, stderr: '' });
    expect(opisBleduProcesu(e, 900_000)).toBe('proces przekroczył limit czasu 900 s (SIGTERM)');
  });

  it('przepełniony bufor wyjścia to nie limit czasu', () => {
    const e = bladProcesu(
      { killed: true, signal: 'SIGTERM', code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', stderr: '' },
      'stdout maxBuffer length exceeded',
    );
    expect(opisBleduProcesu(e, 900_000)).toBe('stdout maxBuffer length exceeded');
  });

  it('bez stderr zostaje pierwsza linia komunikatu, a cokolwiek innego niż błąd to tekst', () => {
    expect(opisBleduProcesu(bladProcesu({ stderr: '' }))).toBe(
      'Command failed: /usr/bin/node /repo/tools/x.ts --demo=a',
    );
    expect(opisBleduProcesu(new Error('spawn /brak ENOENT'))).toBe('spawn /brak ENOENT');
    expect(opisBleduProcesu('sam tekst')).toBe('sam tekst');
  });
});

describe('noga Node jako osobny proces (udawana binarka node)', () => {
  let katalog = '';
  let licznik = 0;
  beforeAll(() => {
    katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-test-noga-'));
  });
  afterAll(() => {
    fs.rmSync(katalog, { recursive: true, force: true });
  });

  /** skrypt udający `node`: na `-p` podaje wersje, w innym wypadku wykonuje `tresc` */
  function udawanyNode(tresc: string): string {
    const plik = path.join(katalog, `node-${licznik++}`);
    fs.writeFileSync(plik, `#!/bin/sh\nif [ "$1" = "-p" ]; then echo "24.99.0 13.6.0"; exit 0; fi\n${tresc}\n`);
    fs.chmodSync(plik, 0o755);
    return plik;
  }

  it('odczytuje wersję z binarki i oddaje wynik z JSON-a na stdout, ze zleceniem w argumentach', async () => {
    const noga = await nogaNode(
      'node24',
      'Node 24',
      true,
      udawanyNode('echo "{\\"biegi\\":[],\\"argumenty\\":\\"$*\\"}"'),
      KORZEN,
    );
    expect(noga.wersja).toBe('Node 24.99.0 (V8 13.6.0)');
    expect(noga.docelowa).toBe(true);
    const wynik = (await noga.licz(zlecenie)) as unknown as { argumenty: string };
    expect(wynik.argumenty).toContain(path.join(KORZEN, 'tools/determinizm/noga-node.ts'));
    expect(wynik.argumenty).toContain('--demo=zielonki');
    expect(wynik.argumenty).toContain('--seed=7');
  });

  it('błąd procesu: w wyjątku jest linia z błędem ze stderr i kod wyjścia, a nie samo „Command failed”', async () => {
    const pad = udawanyNode(
      'echo "file:///r/x.ts:3" >&2\necho "    throw new Error(\'x\');" >&2\necho "Error: pad testowy z procesu" >&2\necho "    at stos" >&2\nexit 7',
    );
    const noga = await nogaNode('node24', 'Node 24', true, pad, KORZEN);
    await expect(noga.licz(zlecenie)).rejects.toThrow(/^Error: pad testowy z procesu \(kod wyjścia 7\)$/);
    await expect(noga.kontroluj([])).rejects.toThrow(/^Error: pad testowy z procesu \(kod wyjścia 7\)$/);
  });

  it('proces, który nie kończy się w limicie, jest zabijany z komunikatem o limicie czasu', async () => {
    const noga = await nogaNode('node24', 'Node 24', true, udawanyNode('exec sleep 5'), KORZEN, 150);
    const t0 = Date.now();
    await expect(noga.licz(zlecenie)).rejects.toThrow(/przekroczył limit czasu/);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
