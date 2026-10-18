/* Wczytanie wszystkich danych mieszkańców dla jednego punktu (`wczytajDaneMieszkancow`) i indeks gmin
   (public/data/mieszkancy/gminy/indeks.json), po którym gra wie, której tabeli gminy szukać. Chodzi zawsze, na
   plikach z public/, bez surowych danych. W Node dane czyta atrapa `fetch`, która zamiast sieci otwiera pliki z
   public/ (w przeglądarce Vite serwuje public/ od korzenia strony). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type IndeksGmin, type TabeleGminy, WERSJA_TABEL } from '../../src/mieszkancy/tabele.ts';
import { wczytajDaneMieszkancow, wczytajIndeksGmin } from '../../src/mieszkancy/wczytaj.ts';
import { indeksGmin } from '../../tools/dane/gminy.ts';
import { ADDRESSES } from './fixtures.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const GMINY = path.join(PUBLIC, 'data/mieszkancy/gminy');
const INDEKS = path.join(GMINY, 'indeks.json');

const adres = (klucz: string): { lat: number; lon: number } => {
  const a = ADDRESSES.find((x) => x.key === klucz);
  if (!a) throw new Error(`Brak adresu ${klucz} w fixtures.ts`);
  return { lat: a.lat, lon: a.lon };
};
const KRAKOW = { lat: 50.0614, lon: 19.9366 };

type Podmiana = Response | 'siec' | undefined;

/** Atrapa `fetch`: ścieżka względna → plik w public/, brak pliku → 404. `podmiany` (po końcówce adresu) zastępują
    odpowiedź gotową `Response` albo błędem sieci; `zapytania` zbiera, o co pytano. */
function plikowy(podmiany: Record<string, () => Podmiana> = {}, zapytania: string[] = []): typeof fetch {
  return (async (adr: string) => {
    zapytania.push(adr);
    for (const [koniec, daj] of Object.entries(podmiany)) {
      if (!adr.endsWith(koniec)) continue;
      const p = daj();
      if (p === 'siec') throw new TypeError('Failed to fetch');
      if (p) return p;
    }
    const plik = path.join(PUBLIC, adr);
    if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
    return new Response(fs.readFileSync(plik));
  }) as unknown as typeof fetch;
}
const html = (): Response => new Response('<!doctype html><title>Za Murem</title>');
const indeksTekstem =
  (i: IndeksGmin): (() => Response) =>
  () =>
    new Response(JSON.stringify(i));

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- indeks gmin

describe('indeks gmin (indeks.json)', () => {
  const pliki = fs
    .readdirSync(GMINY)
    .filter((n) => /^\d{7}\.json$/.test(n))
    .sort();
  const tabele = pliki.map((n) => JSON.parse(fs.readFileSync(path.join(GMINY, n), 'utf8')) as TabeleGminy);

  it('jest do odtworzenia z plików gmin w repozytorium, bajt w bajt (npm run dane:gminy -- --indeks)', () => {
    expect(pliki.length).toBeGreaterThan(0);
    const tekst = `${JSON.stringify(indeksGmin(tabele))}\n`;
    expect(fs.readFileSync(INDEKS, 'utf8')).toBe(tekst);
  });

  it('ma wersję tabel i po jednym wpisie na gminę, posortowane po TERYT', () => {
    const indeks = JSON.parse(fs.readFileSync(INDEKS, 'utf8')) as IndeksGmin;
    expect(indeks.wersja).toBe(WERSJA_TABEL);
    expect(indeks.gminy.map((g) => g.teryt)).toEqual(tabele.map((t) => t.teryt).sort());
  });

  it('prostokąt każdej gminy obejmuje wszystkie punkty jej obrysów i dotyka ich z czterech stron', () => {
    const indeks = JSON.parse(fs.readFileSync(INDEKS, 'utf8')) as IndeksGmin;
    for (const t of tabele) {
      const b = indeks.gminy.find((g) => g.teryt === t.teryt)?.bbox;
      expect(b, t.teryt).toBeDefined();
      const pkt = Object.values(t.obrysy).flatMap((r) => r.flat());
      expect(b).toEqual([
        Math.min(...pkt.map((p) => p[0])),
        Math.min(...pkt.map((p) => p[1])),
        Math.max(...pkt.map((p) => p[0])),
        Math.max(...pkt.map((p) => p[1])),
      ]);
    }
  });

  it('trzy gminy demo: adres każdego dema leży w prostokącie swojej gminy', () => {
    const indeks = JSON.parse(fs.readFileSync(INDEKS, 'utf8')) as IndeksGmin;
    const teryty: Record<string, string> = { przymorze: '2261011', lanciego: '1465138', zielonki: '1206172' };
    for (const [klucz, teryt] of Object.entries(teryty)) {
      const { lat, lon } = adres(klucz);
      const b = indeks.gminy.find((g) => g.teryt === teryt)?.bbox;
      expect(b, teryt).toBeDefined();
      expect(lat >= b![0] && lat <= b![2] && lon >= b![1] && lon <= b![3], klucz).toBe(true);
    }
  });
});

describe('indeksGmin (czysta funkcja)', () => {
  const gmina = (teryt: string, obrysy: TabeleGminy['obrysy']): TabeleGminy => ({ teryt, obrysy }) as TabeleGminy;

  it('prostokąt [latMin, lonMin, latMax, lonMax] ze wszystkich pierścieni wszystkich rejonów', () => {
    const i = indeksGmin([
      gmina('1111111', {
        '000001': [
          [
            [10.5, 20.5],
            [10.7, 20.9],
            [10.6, 20.1],
            [10.5, 20.5],
          ],
        ],
        '000002': [
          [
            [9.25, 21.5],
            [9.5, 21.75],
            [9.75, 21.5],
            [9.25, 21.5],
          ],
          [
            [10.9, 19.9],
            [11.1, 20.0],
            [10.95, 20.05],
            [10.9, 19.9],
          ],
        ],
      }),
    ]);
    expect(i).toEqual({ wersja: WERSJA_TABEL, gminy: [{ teryt: '1111111', bbox: [9.25, 19.9, 11.1, 21.75] }] });
  });

  it('gminy posortowane po TERYT niezależnie od kolejności wejścia; gmina bez obrysów nie trafia do indeksu', () => {
    const kwadrat = (a: number): TabeleGminy['obrysy'] => ({
      '000001': [
        [
          [a, a],
          [a, a + 1],
          [a + 1, a + 1],
          [a, a],
        ],
      ],
    });
    const i = indeksGmin([gmina('3333333', kwadrat(3)), gmina('2222222', {}), gmina('1111111', kwadrat(1))]);
    expect(i.gminy.map((g) => g.teryt)).toEqual(['1111111', '3333333']);
  });

  it('nie zmienia wejścia', () => {
    const t = [gmina('1111111', { '000001': [[[1, 2]]] })];
    const kopia = JSON.stringify(t);
    indeksGmin(t);
    expect(JSON.stringify(t)).toBe(kopia);
  });
});

describe('wczytajIndeksGmin', () => {
  it('czyta data/mieszkancy/gminy/indeks.json względem strony', async () => {
    const zapytania: string[] = [];
    const i = await wczytajIndeksGmin(plikowy({}, zapytania));
    expect(zapytania).toEqual(['data/mieszkancy/gminy/indeks.json']);
    expect(i).toEqual(JSON.parse(fs.readFileSync(INDEKS, 'utf8')));
  });

  it('404: null bez ostrzeżenia (gra działa i bez indeksu)', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await wczytajIndeksGmin(plikowy({ 'gminy/indeks.json': () => new Response('brak', { status: 404 }) })),
    ).toBeNull();
    expect(ostrzezenie).not.toHaveBeenCalled();
  });

  it('inna wersja, strona zastępcza i błąd sieci: null z ostrzeżeniem, bez wyjątku', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zla = indeksTekstem({ wersja: WERSJA_TABEL + 1, gminy: [] });
    expect(await wczytajIndeksGmin(plikowy({ 'gminy/indeks.json': zla }))).toBeNull();
    expect(await wczytajIndeksGmin(plikowy({ 'gminy/indeks.json': html }))).toBeNull();
    expect(await wczytajIndeksGmin(plikowy({ 'gminy/indeks.json': () => 'siec' }))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(3);
  });

  it('uszkodzony kształt (gminy nie jest tablicą): null z ostrzeżeniem', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zepsuty = () => new Response(JSON.stringify({ wersja: WERSJA_TABEL, gminy: 'x' }));
    expect(await wczytajIndeksGmin(plikowy({ 'gminy/indeks.json': zepsuty }))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------- dane dla punktu

describe('wczytajDaneMieszkancow', () => {
  it('Przymorze: gmina Gdańsk (2261011) i komplet pozostałych danych, nazwiska z województwa gminy', async () => {
    const zapytania: string[] = [];
    const p = adres('przymorze');
    const d = await wczytajDaneMieszkancow(p.lat, p.lon, plikowy({}, zapytania));
    expect(d).not.toBeNull();
    expect(d!.gmina?.teryt).toBe('2261011');
    expect(d!.kraj.wersja).toBe(WERSJA_TABEL);
    expect(d!.imiona.wersja).toBe(WERSJA_TABEL);
    expect(Object.keys(d!.odmiana.tabela).length).toBeGreaterThan(0);
    expect(d!.odmiana.koncowki).toBeDefined();
    expect(d!.nazwiska.woj).toBe('pomorskie');
    expect(d!.nazwiska.lokalne.length).toBeGreaterThan(0);
    // pobiera tylko to, co trzeba: tabelę trafionej gminy i nazwiska jej województwa, żadnej innej gminy
    expect(zapytania.sort()).toEqual(
      [
        'data/mieszkancy/gminy/2261011.json',
        'data/mieszkancy/gminy/indeks.json',
        'data/mieszkancy/imiona.json',
        'data/mieszkancy/kraj.json',
        'data/mieszkancy/nazwiska/pomorskie.json',
        'data/mieszkancy/odmiana-koncowki.json',
        'data/mieszkancy/odmiana.json',
      ].sort(),
    );
  });

  it('pozostałe dema trafiają we własne gminy: Lanciego w Ursynowie, Zielonki w Zielonkach', async () => {
    const l = adres('lanciego');
    const z = adres('zielonki');
    expect((await wczytajDaneMieszkancow(l.lat, l.lon, plikowy()))?.gmina?.teryt).toBe('1465138');
    const zielonki = await wczytajDaneMieszkancow(z.lat, z.lon, plikowy());
    expect(zielonki?.gmina?.teryt).toBe('1206172');
    expect(zielonki?.nazwiska.woj).toBe('małopolskie');
  });

  it('punkt w Krakowie (poza gminami z tabelami): gmina null, reszta komplet, nazwiska zapasowe bez puli lokalnej', async () => {
    const zapytania: string[] = [];
    const d = await wczytajDaneMieszkancow(KRAKOW.lat, KRAKOW.lon, plikowy({}, zapytania));
    expect(d).not.toBeNull();
    expect(d!.gmina).toBeNull();
    expect(d!.kraj.wersja).toBe(WERSJA_TABEL);
    expect(d!.imiona.wersja).toBe(WERSJA_TABEL);
    expect(d!.odmiana.koncowki).toBeDefined();
    expect(d!.nazwiska.woj).toBe('mazowieckie');
    expect(d!.nazwiska.lokalne).toEqual([]);
    expect(d!.nazwiska.udzialLokalnych).toBe(0);
    expect(zapytania.some((a) => /gminy\/\d{7}\.json$/.test(a))).toBe(false);
  });

  it('404 na kraj.json: null (bez krajowych tabel nie ma na czym generować), bez wyjątku', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    const f = plikowy({ 'mieszkancy/kraj.json': () => new Response('brak', { status: 404 }) });
    await expect(wczytajDaneMieszkancow(p.lat, p.lon, f)).resolves.toBeNull();
  });

  it('błąd sieci na wszystkim: null, bez wyjątku', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const siec = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(wczytajDaneMieszkancow(54.4093, 18.5991, siec)).resolves.toBeNull();
  });

  it('odpowiedź HTML ze statusem 200 na imiona.json: null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    await expect(wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'mieszkancy/imiona.json': html }))).resolves.toBeNull();
  });

  it('brak jednej z dwóch tabel odmiany (słownika albo końcówek): null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    const brak = () => new Response('brak', { status: 404 });
    await expect(
      wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'mieszkancy/odmiana.json': brak })),
    ).resolves.toBeNull();
    await expect(
      wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'mieszkancy/odmiana-koncowki.json': brak })),
    ).resolves.toBeNull();
  });

  it('brak tabeli nazwisk (województwa gminy albo zapasowego): null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    const brak = () => new Response('brak', { status: 404 });
    await expect(
      wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'nazwiska/pomorskie.json': brak })),
    ).resolves.toBeNull();
    await expect(
      wczytajDaneMieszkancow(KRAKOW.lat, KRAKOW.lon, plikowy({ 'nazwiska/mazowieckie.json': brak })),
    ).resolves.toBeNull();
  });

  it('brak indeks.json: dane z gmina null (szablon krajowy), reszta komplet', async () => {
    const p = adres('przymorze');
    const f = plikowy({ 'gminy/indeks.json': () => new Response('brak', { status: 404 }) });
    const d = await wczytajDaneMieszkancow(p.lat, p.lon, f);
    expect(d).not.toBeNull();
    expect(d!.gmina).toBeNull();
    expect(d!.nazwiska.woj).toBe('mazowieckie');
  });

  it('indeks.json nie do wczytania (HTML ze statusem 200, 5xx, błąd sieci): null, a nie szablon krajowy', async () => {
    // chwilowa awaria nie może dać osiedlu szablonu krajowego zamiast gminy: gra zostaje przy starej ścieżce
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    for (const zla of [html, () => new Response('awaria', { status: 503 }), () => 'siec' as const])
      await expect(wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'gminy/indeks.json': zla }))).resolves.toBeNull();
  });

  it('plik gminy z pasującym prostokątem nie do wczytania (HTML 200, 5xx, błąd sieci, inna wersja): null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    const innaWersja = () => new Response(JSON.stringify({ wersja: WERSJA_TABEL + 1 }));
    for (const zla of [html, () => new Response('awaria', { status: 500 }), () => 'siec' as const, innaWersja])
      await expect(wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'gminy/2261011.json': zla }))).resolves.toBeNull();
  });

  it('brak pliku gminy z indeksu: gmina null, reszta komplet', async () => {
    const p = adres('przymorze');
    const d = await wczytajDaneMieszkancow(
      p.lat,
      p.lon,
      plikowy({ 'gminy/2261011.json': () => new Response('brak', { status: 404 }) }),
    );
    expect(d).not.toBeNull();
    expect(d!.gmina).toBeNull();
  });

  it('prostokąt zawiera punkt, ale rejonDla daje zapas „gmina” dla każdego kandydata: gmina null', async () => {
    const caly: IndeksGmin['gminy'][number]['bbox'] = [-90, -180, 90, 180];
    const i: IndeksGmin = {
      wersja: WERSJA_TABEL,
      gminy: [
        { teryt: '1206172', bbox: caly },
        { teryt: '2261011', bbox: caly },
      ],
    };
    const zapytania: string[] = [];
    const d = await wczytajDaneMieszkancow(
      KRAKOW.lat,
      KRAKOW.lon,
      plikowy({ 'gminy/indeks.json': indeksTekstem(i) }, zapytania),
    );
    // Kraków jest w prostokątach obu gmin (świat), ale od obrysu Zielonek (Małopolska, około 4,5 km) i od Gdańska
    // jest za daleko
    expect(zapytania).toContain('data/mieszkancy/gminy/1206172.json');
    expect(zapytania).toContain('data/mieszkancy/gminy/2261011.json');
    expect(d).not.toBeNull();
    expect(d!.gmina).toBeNull();
  });

  it('kilka prostokątów z punktem: bierze pierwszą gminę z indeksu, dla której rejonDla coś znajduje', async () => {
    const caly: IndeksGmin['gminy'][number]['bbox'] = [-90, -180, 90, 180];
    const i: IndeksGmin = {
      wersja: WERSJA_TABEL,
      gminy: [
        { teryt: '1206172', bbox: caly }, // Zielonki: prostokąt (świat) obejmuje Przymorze, rejonów tam nie ma
        { teryt: '2261011', bbox: caly },
        { teryt: '1465138', bbox: caly },
      ],
    };
    const zapytania: string[] = [];
    const p = adres('przymorze');
    const d = await wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'gminy/indeks.json': indeksTekstem(i) }, zapytania));
    expect(d?.gmina?.teryt).toBe('2261011');
    expect(zapytania).not.toContain('data/mieszkancy/gminy/1465138.json'); // po trafieniu nie pyta dalej
  });

  it('wpis indeksu bez poprawnego prostokąta jest pomijany, a nie psuje całości', async () => {
    const p = adres('przymorze');
    const zepsuty = () =>
      new Response(
        JSON.stringify({
          wersja: WERSJA_TABEL,
          gminy: [
            null,
            { teryt: 5 },
            { teryt: '1206172', bbox: [1, 2, 3] },
            { teryt: '2261011', bbox: [54.2, 18.4, 54.5, 19] },
          ],
        }),
      );
    const d = await wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ 'gminy/indeks.json': zepsuty }));
    expect(d?.gmina?.teryt).toBe('2261011');
  });

  it('punkt pół kilometra na północ od skrajnego wierzchołka Gdańska (poza prostokątem z indeksu) dostaje Gdańsk', async () => {
    const g = JSON.parse(fs.readFileSync(path.join(GMINY, '2261011.json'), 'utf8')) as TabeleGminy;
    let szczyt: readonly number[] = [-90, 0];
    for (const pierscienie of Object.values(g.obrysy))
      for (const p of pierscienie) for (const v of p) if (v[0] > szczyt[0]) szczyt = v;
    const indeks = JSON.parse(fs.readFileSync(INDEKS, 'utf8')) as IndeksGmin;
    expect(indeks.gminy.find((x) => x.teryt === '2261011')?.bbox[2]).toBe(szczyt[0]);
    const d = await wczytajDaneMieszkancow(szczyt[0] + 0.0045, szczyt[1], plikowy());
    expect(d?.gmina?.teryt).toBe('2261011');
  });

  it('NaN albo nieskończoność zamiast współrzędnych: bez pytania o tabele gmin, gmina null', async () => {
    for (const [lat, lon] of [
      [Number.NaN, 18.6],
      [54.4, Number.NaN],
      [Number.POSITIVE_INFINITY, 18.6],
    ]) {
      const zapytania: string[] = [];
      const d = await wczytajDaneMieszkancow(lat, lon, plikowy({}, zapytania));
      expect(
        zapytania.some((a) => /gminy\/\d{7}\.json$/.test(a)),
        `${lat},${lon}`,
      ).toBe(false);
      expect(d?.gmina).toBeNull();
    }
  });

  it('odpowiedź HTML ze statusem 200 na kraj.json albo na nazwiska województwa: null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = adres('przymorze');
    for (const plik of ['mieszkancy/kraj.json', 'nazwiska/pomorskie.json'])
      await expect(wczytajDaneMieszkancow(p.lat, p.lon, plikowy({ [plik]: html })), plik).resolves.toBeNull();
  });

  it('bez podanego fetch używa globalnego', async () => {
    vi.stubGlobal('fetch', plikowy());
    try {
      const p = adres('lanciego');
      expect((await wczytajDaneMieszkancow(p.lat, p.lon))?.gmina?.teryt).toBe('1465138');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
