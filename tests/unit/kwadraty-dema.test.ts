/* Dane sąsiadów w demach (miasto z kwadratów, etap 1, zadanie 5): public/demo/<klucz>-kwadraty.json niesie geo ośmiu
   sąsiednich kwadratów domu (N, NE, E, SE, S, SW, W, NW) z kafelków testowych, żeby `?demo=…&kwadraty=3x3` działało bez
   sieci. Gra pobiera ten plik tylko przy `?kwadraty=` (loadDemoKwadraty). Pliki dem z geometrią osiedla
   (<klucz>.json) i index.json zostają bajt w bajt takie, jakie są: tools/make-demos.ts nie przepisuje ich, chyba że
   poda się --przegeneruj. Dema osiedli były przegenerowane z toGeoT 19.10.2026 (gałąź dema-przegenerowane): mają klucze
   budynków (zm:klucz, zm:os), klucze miejsc (k) i rodzaje punktów (Geo.rodzaje). Plik przekraczający 1,5 MB zostawia
   tylko cztery boczne kwadraty (N, E, S, W). */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { kluczKwadratu, sasiedzi8 } from '../../src/world/kwadraty.ts';
import { loadDemoKwadraty } from '../../src/world/load.ts';
import { ADDRESSES, geoKwadratuTestowego } from './fixtures.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const DEMO = path.join(KORZEN, 'public/demo');
const LIMIT = 1_500_000;
const wczytaj = (plik: string) => fs.readFileSync(plik, 'utf8');
/** SHA-256 bajtów pliku (bajt w bajt) */
const skrot = (plik: string) => createHash('sha256').update(fs.readFileSync(plik)).digest('hex');

/** to, co zostaje z geo po zapisie do pliku i odczycie (−0 w pliku to 0, pola undefined znikają) */
const poPliku = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** bok N, E, S, W z ośmiu sąsiadów (parzyste miejsca w kolejności N, NE, E, SE, S, SW, W, NW) */
const boczne = (): [number, number][] => sasiedzi8(0, 0).filter((_, i) => i % 2 === 0);

/** skróty plików dem z geometrią osiedla zatwierdzonych po przegenerowaniu z toGeoT (bajt w bajt; index.json bez zmian
    od dem sprzed kwadratów, dema osiedli przepisane 19.10.2026: `npm run demos -- --przegeneruj`) */
const ZATWIERDZONE: Record<string, string> = {
  'przymorze.json': '3be6d56e2326908ab4ab18f790f21f2fac31f88da9bae7303e999f0ea9b18b68',
  'lanciego.json': '2df67ea4296fc31d3f0fbc929e7a99cb934cb6f1d9035d3ff039d3f566340bf5',
  'zielonki.json': '0a7473d271cbd3a43ed60e0f2a962e3384b96910ab08ac69b5d01b54db4415e0',
  'index.json': '681f80f90f16acacffe4e51b4391d5e11598a722ce70c05749f26023d04fa385',
};

afterEach(() => {
  vi.unstubAllGlobals();
  ustawJezyk('pl');
});

describe('dema: istniejące pliki bez zmian', () => {
  for (const [nazwa, oczekiwany] of Object.entries(ZATWIERDZONE)) {
    it(`public/demo/${nazwa} jest taki, jaki został zatwierdzony`, () => {
      expect(skrot(path.join(DEMO, nazwa))).toBe(oczekiwany);
    });
  }
});

describe('dema: dane sąsiadów', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: plik sąsiadów ma kwadraty zgodne z geoKwadratu (osiem, a gdy plik przekroczyłby 1,5 MB, cztery boczne)`, () => {
      const plik = path.join(DEMO, `${a.key}-kwadraty.json`);
      const dane = JSON.parse(wczytaj(plik));
      const osiem = sasiedzi8(0, 0);
      const wszystkie = Object.fromEntries(osiem.map(([x, y]) => [kluczKwadratu(x, y), geoKwadratuTestowego(a, x, y)]));
      const bylobyZa = Buffer.byteLength(JSON.stringify(wszystkie)) > LIMIT;
      const oczekiwane = (bylobyZa ? boczne() : osiem).map(([x, y]) => kluczKwadratu(x, y));
      expect(Object.keys(dane)).toEqual(oczekiwane);
      for (const k of oczekiwane) expect(dane[k]).toEqual(poPliku(wszystkie[k]));
      // zgodnie z planem: wprost kwadrat (1, 0)
      expect(dane['1,0']).toEqual(poPliku(geoKwadratuTestowego(a, 1, 0)));
      expect(fs.statSync(plik).size).toBeLessThanOrEqual(LIMIT);
    });

    it(`${a.key}: sąsiedzi są z geo w układzie domu, ze środkiem w adresie i z kluczami budynków`, () => {
      const dane = JSON.parse(wczytaj(path.join(DEMO, `${a.key}-kwadraty.json`)));
      for (const g of Object.values(dane) as { c: number[]; b: { t: Record<string, string> }[]; src: string }[]) {
        expect(g.c).toEqual([a.lat, a.lon]);
        expect(g.src).toBe('mvt');
        expect(g.b.length).toBeGreaterThan(0);
        expect(g.b.some((b) => b.t['zm:klucz'])).toBe(true);
      }
    });
  }
});

describe('loadDemoKwadraty', () => {
  it('pobiera plik sąsiadów dema i oddaje geo po kluczu kwadratu', async () => {
    const adresy: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      adresy.push(url);
      const plik = path.join(KORZEN, 'public', url);
      return fs.existsSync(plik) ? new Response(wczytaj(plik)) : new Response('', { status: 404 });
    });
    const dane = await loadDemoKwadraty('przymorze');
    expect(adresy).toEqual(['demo/przymorze-kwadraty.json']);
    expect(Object.keys(dane).length).toBeGreaterThanOrEqual(4);
    expect(dane['1,0']).toEqual(poPliku(geoKwadratuTestowego(ADDRESSES[0], 1, 0)));
  });

  it('brak pliku to błąd w bieżącym języku', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(loadDemoKwadraty('xyz')).rejects.toThrow('Nie ma sąsiednich kwadratów przykładu: xyz');
    ustawJezyk('en');
    await expect(loadDemoKwadraty('xyz')).rejects.toThrow('No neighbouring squares for example: xyz.');
  });
});

describe('tools/make-demos.ts', () => {
  const uruchom = (wyjscie: string, ...flagi: string[]) =>
    spawnSync(process.execPath, [path.join(KORZEN, 'tools/make-demos.ts'), ...flagi], {
      cwd: KORZEN,
      env: { ...process.env, ZM_DEMA_WYJSCIE: wyjscie },
      encoding: 'utf8',
    });

  it('nie przepisuje istniejących dem ani index.json, tylko dokłada pliki sąsiadów (takie jak zatwierdzone)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-dema-'));
    try {
      for (const nazwa of Object.keys(ZATWIERDZONE)) fs.copyFileSync(path.join(DEMO, nazwa), path.join(tmp, nazwa));
      const r = uruchom(tmp);
      expect(r.status, r.stderr).toBe(0);
      for (const [nazwa, oczekiwany] of Object.entries(ZATWIERDZONE))
        expect(skrot(path.join(tmp, nazwa))).toBe(oczekiwany);
      for (const a of ADDRESSES) {
        const nazwa = `${a.key}-kwadraty.json`;
        expect(wczytaj(path.join(tmp, nazwa))).toBe(wczytaj(path.join(DEMO, nazwa)));
        // rozmiary wypisane w wyjściu
        expect(r.stdout).toContain(nazwa);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('bez plików dem tworzy też zwykłe dema, a z --przegeneruj przepisuje istniejące', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-dema-'));
    try {
      const r = uruchom(tmp);
      expect(r.status, r.stderr).toBe(0);
      for (const nazwa of Object.keys(ZATWIERDZONE)) expect(fs.existsSync(path.join(tmp, nazwa)), nazwa).toBe(true);
      // świeże dema mają klucze budynków, tak samo jak zatwierdzone (przegenerowane)
      expect(wczytaj(path.join(tmp, 'przymorze.json'))).toContain('zm:klucz');
      expect(wczytaj(path.join(DEMO, 'przymorze.json'))).toContain('zm:klucz');
      // zepsuty plik zostaje, dopóki nie podamy --przegeneruj
      fs.writeFileSync(path.join(tmp, 'lanciego.json'), '{}');
      expect(uruchom(tmp).status).toBe(0);
      expect(wczytaj(path.join(tmp, 'lanciego.json'))).toBe('{}');
      expect(uruchom(tmp, '--przegeneruj').status).toBe(0);
      expect(wczytaj(path.join(tmp, 'lanciego.json'))).toContain('zm:klucz');
      // index.json jest taki sam jak zatwierdzony
      expect(skrot(path.join(tmp, 'index.json'))).toBe(ZATWIERDZONE['index.json']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
