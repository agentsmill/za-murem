/* Rejon statystyczny dla punktu (src/mieszkancy/rejon.ts) i wczytywanie tabel w grze (src/mieszkancy/wczytaj.ts).
   Chodzi zawsze, na tabelach z public/data/mieszkancy/, bez surowych plików. W Node tabele czyta atrapa `fetch`,
   która zamiast sieci otwiera pliki z public/ (w przeglądarce Vite serwuje public/ od korzenia strony). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marginesyDla, rejonDla } from '../../src/mieszkancy/rejon.ts';
import { type TabeleGminy, WERSJA_TABEL } from '../../src/mieszkancy/tabele.ts';
import { wczytajGmine, wczytajKraj } from '../../src/mieszkancy/wczytaj.ts';
import { wWielokacie } from '../../tools/dane/gminy.ts';
import { ADDRESSES } from './fixtures.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');

/** Atrapa `fetch`: ścieżka względna → plik w public/, brak pliku → 404; zapisuje, o co pytano. */
function plikowy(zapytania: string[] = []): typeof fetch {
  return (async (adres: string) => {
    zapytania.push(adres);
    const plik = path.join(PUBLIC, adres);
    if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
    return new Response(fs.readFileSync(plik));
  }) as unknown as typeof fetch;
}
const odpowiedz = (tresc: string, status = 200): typeof fetch =>
  (async () => new Response(tresc, { status })) as unknown as typeof fetch;

const gdansk = (await wczytajGmine('2261011', plikowy())) as TabeleGminy;
const ursynow = (await wczytajGmine('1465138', plikowy())) as TabeleGminy;
const zielonki = (await wczytajGmine('1206172', plikowy())) as TabeleGminy;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- niezależna miara w metrach (tylko w teście)

/** Odległość punktu od najbliższego odcinka obrysu w metrach (rzut równoodległościowy, ze sprawdzianem w teście
    wolno użyć trygonometrii; w src/mieszkancy/ jej nie ma). */
function odlegloscM(lat: number, lon: number, obrys: TabeleGminy['obrysy'][string]): number {
  const ky = 111195;
  const kx = 111195 * Math.cos((lat * Math.PI) / 180);
  let najmniej = Number.POSITIVE_INFINITY;
  for (const p of obrys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = (p[j][1] - lon) * kx;
      const ay = (p[j][0] - lat) * ky;
      const dx = (p[i][1] - lon) * kx - ax;
      const dy = (p[i][0] - lat) * ky - ay;
      const dl = dx * dx + dy * dy;
      const t = dl ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / dl)) : 0;
      najmniej = Math.min(najmniej, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return najmniej;
}
/** Rejon o najbliższym obrysie według miary w metrach i ta odległość. */
function najblizszyM(g: TabeleGminy, lat: number, lon: number): [string, number] {
  const wszystkie = Object.entries(g.obrysy).map(([rej, o]) => [rej, odlegloscM(lat, lon, o)] as [string, number]);
  return wszystkie.reduce((a, b) => (b[1] < a[1] ? b : a));
}
const wObrysach = (g: TabeleGminy, lat: number, lon: number): string[] =>
  Object.entries(g.obrysy)
    .filter(([, o]) => wWielokacie(lat, lon, o))
    .map(([rej]) => rej);

// ---------------------------------------------------------------- tabele dem

describe('rejonDla: punkty dem', () => {
  const OCZEKIWANE: Record<string, [TabeleGminy, string]> = {
    przymorze: [gdansk, '182350'],
    lanciego: [ursynow, '002193'],
    zielonki: [zielonki, '398600'],
  };
  for (const a of ADDRESSES) {
    it(`${a.key}: punkt adresu leży w obrysie rejonu, zapas „brak”`, () => {
      const [g, rejon] = OCZEKIWANE[a.key];
      expect(rejonDla(g, a.lat, a.lon)).toEqual({ rejon, zapas: 'brak' });
    });
  }

  it('wynik zawsze wskazuje rejon z tabeli albo pusty napis dla gminy', () => {
    for (const [g, lat, lon] of [
      [gdansk, 54.4093, 18.5991],
      [gdansk, 54.5, 18.7],
      [ursynow, 52.1446, 21.0579],
      [zielonki, 50.1125, 20.0227],
    ] as const) {
      const w = rejonDla(g, lat, lon);
      if (w.zapas === 'gmina') expect(w.rejon).toBe('');
      else expect(Object.hasOwn(g.rejony, w.rejon)).toBe(true);
    }
  });
});

describe('rejonDla: punkty poza obrysami (dane z tabeli Gdańska)', () => {
  // Obrysy BREC kończą się na linii brzegu Zatoki Gdańskiej: przy długości 18,599 ostatni obrys kończy się na
  // szerokości 54,4254. Punkt leży na północ i wschód od tego brzegu, w wodzie.
  const ZATOKA = { lat: 54.4277, lon: 18.602 }; // ok. 300 m od najbliższego obrysu (rejon 181910)
  const MORZE = { lat: 54.5789, lon: 18.8129 }; // ok. 20 km od najbliższego obrysu, otwarta woda zatoki

  it('300 m w Zatokę Gdańską: poza obrysami, ale najbliższy rejon jest bliżej niż 1 km', () => {
    expect(wObrysach(gdansk, ZATOKA.lat, ZATOKA.lon)).toEqual([]);
    const [rejonM, metry] = najblizszyM(gdansk, ZATOKA.lat, ZATOKA.lon);
    expect(metry).toBeGreaterThan(250);
    expect(metry).toBeLessThan(350);
    expect(rejonDla(gdansk, ZATOKA.lat, ZATOKA.lon)).toEqual({ rejon: rejonM, zapas: 'najblizszy' });
    expect(rejonM).toBe('181910');
  });

  it('20 km w morze: zapas „gmina” i pusty numer rejonu', () => {
    expect(wObrysach(gdansk, MORZE.lat, MORZE.lon)).toEqual([]);
    expect(najblizszyM(gdansk, MORZE.lat, MORZE.lon)[1]).toBeGreaterThan(19000);
    expect(rejonDla(gdansk, MORZE.lat, MORZE.lon)).toEqual({ rejon: '', zapas: 'gmina' });
  });

  it('rejon 183540 (43 osoby, bez gospodarstw prywatnych) nie ma tabeli: punkt w nim trafia do sąsiada', () => {
    // 183540 to wąski pas w Gdańsku (BREC 2021: pole 7529 m², ok. 35 m szerokości i 210 m długości); punkt wzięty ze
    // środka jego wielokąta.
    const lat = 54.3693;
    const lon = 18.61074;
    expect(gdansk.rejony['183540']).toBeUndefined();
    expect(wObrysach(gdansk, lat, lon)).toEqual([]);
    const [, metry] = najblizszyM(gdansk, lat, lon);
    expect(metry).toBeLessThan(60);
    const w = rejonDla(gdansk, lat, lon);
    expect(w.zapas).toBe('najblizszy');
    expect(['183530', '183550']).toContain(w.rejon);
  });
});

describe('marginesyDla', () => {
  it('pusty numer rejonu i nieznany rejon dają sumy gminy', () => {
    expect(marginesyDla(gdansk, '')).toBe(gdansk.gmina);
    expect(marginesyDla(gdansk, '999999')).toBe(gdansk.gmina);
    expect(marginesyDla(gdansk, '183540')).toBe(gdansk.gmina);
    expect(marginesyDla(gdansk, 'constructor')).toBe(gdansk.gmina);
  });

  it('znany rejon daje jego własne marginesy', () => {
    expect(marginesyDla(gdansk, '182350')).toBe(gdansk.rejony['182350']);
    expect(marginesyDla(zielonki, '398600')).toBe(zielonki.rejony['398600']);
  });
});

// ---------------------------------------------------------------- sztuczne obrysy: reguły brzegowe

type Pierscien = [number, number][];
/** Prostokąt [lat0, lon0]–[lat1, lon1] jako zamknięty pierścień. */
const prostokat = (lat0: number, lon0: number, lat1: number, lon1: number): Pierscien => [
  [lat0, lon0],
  [lat0, lon1],
  [lat1, lon1],
  [lat1, lon0],
  [lat0, lon0],
];
/** Tabela gminy z samymi obrysami (kolejność kluczy = kolejność wstawiania). */
function tabela(obrysy: [string, Pierscien[]][]): TabeleGminy {
  const rejony = Object.fromEntries(obrysy.map(([rej]) => [rej, gdansk.gmina]));
  return { ...gdansk, rejony, obrysy: Object.fromEntries(obrysy) };
}

describe('rejonDla: reguły brzegowe na sztucznych obrysach', () => {
  it('R16: punkt w nakładce dwóch obrysów dostaje najniższy numer w porządku napisów, niezależnie od kolejności', () => {
    const a = prostokat(54.0, 18.0, 54.02, 18.02);
    const b = prostokat(54.01, 18.01, 54.03, 18.03);
    for (const [niski, wysoki] of [
      ['000001', '000002'],
      ['000002', '000010'],
      ['099999', '100000'],
    ]) {
      for (const kolejnosc of [
        [
          [niski, a],
          [wysoki, b],
        ],
        [
          [wysoki, b],
          [niski, a],
        ],
      ] as [string, Pierscien][][]) {
        const g = tabela(kolejnosc.map(([r, p]) => [r, [p]]));
        expect(rejonDla(g, 54.015, 18.015), `${niski} i ${wysoki}`).toEqual({ rejon: niski, zapas: 'brak' });
        // poza nakładką każdy ma swój punkt
        expect(rejonDla(g, 54.005, 18.005).rejon).toBe(niski);
        expect(rejonDla(g, 54.025, 18.025).rejon).toBe(wysoki);
      }
    }
  });

  it('dziura w obrysie (pierścień wewnętrzny) nie należy do rejonu, ale rejon w dziurze (enklawa) tak', () => {
    const zewn = prostokat(54.0, 18.0, 54.1, 18.1);
    const dziura = prostokat(54.04, 18.03, 54.06, 18.07);
    const bez = tabela([['000001', [zewn, dziura]]]);
    expect(rejonDla(bez, 54.02, 18.02)).toEqual({ rejon: '000001', zapas: 'brak' });
    // w dziurze, 0,0015° od jej brzegu: poza rejonem, ale tuż przy nim
    expect(rejonDla(bez, 54.0415, 18.05)).toEqual({ rejon: '000001', zapas: 'najblizszy' });
    // w środku dziury brzeg jest o 0,01° szerokości i 0,6 · 0,02° długości dalej (ponad 1 km): zapas gminy
    expect(rejonDla(bez, 54.05, 18.05)).toEqual({ rejon: '', zapas: 'gmina' });

    const z = tabela([
      ['000001', [zewn, dziura]],
      ['000002', [dziura]],
    ]);
    expect(rejonDla(z, 54.05, 18.05)).toEqual({ rejon: '000002', zapas: 'brak' });
    expect(rejonDla(z, 54.02, 18.02)).toEqual({ rejon: '000001', zapas: 'brak' });
  });

  it('próg 1 km: 0,009° szerokości, a długość liczona ze skalą 0,6', () => {
    const g = tabela([['000001', [prostokat(54.0, 18.0, 54.01, 18.01)]]]);
    // na północ od brzegu: 0,008° ≈ 890 m jest w progu, 0,0095° ≈ 1,06 km już nie
    expect(rejonDla(g, 54.018, 18.005)).toEqual({ rejon: '000001', zapas: 'najblizszy' });
    expect(rejonDla(g, 54.0195, 18.005)).toEqual({ rejon: '', zapas: 'gmina' });
    // na wschód: 0,012° długości to ok. 770 m (0,6 · 0,012 = 0,0072°), 0,016° to ok. 1,03 km (0,0096°)
    expect(rejonDla(g, 54.005, 18.022)).toEqual({ rejon: '000001', zapas: 'najblizszy' });
    expect(rejonDla(g, 54.005, 18.026)).toEqual({ rejon: '', zapas: 'gmina' });
    // od narożnika: odległość to pierwiastek z sumy kwadratów obu różnic, nie ich suma
    expect(rejonDla(g, 54.016, 18.0165).zapas).toBe('najblizszy');
  });

  it('z dwóch rejonów w zasięgu wybiera bliższy, a przy remisie niższy numer', () => {
    const polnoc = prostokat(54.0, 18.0, 54.01, 18.01);
    const poludnie = prostokat(54.03, 18.0, 54.04, 18.01);
    const g = tabela([
      ['000001', [polnoc]],
      ['000002', [poludnie]],
    ]);
    expect(rejonDla(g, 54.0175, 18.005).rejon).toBe('000001');
    expect(rejonDla(g, 54.0225, 18.005).rejon).toBe('000002');

    // remis: punkt dokładnie pośrodku (liczby dwójkowe, więc obie odległości są identyczne co do bitu)
    const o = 0.00390625; // 2^-8
    const lewy = prostokat(54.25, 18.0, 54.75, 18.5 - o);
    const prawy = prostokat(54.25, 18.5 + o, 54.75, 19.0);
    for (const kolejnosc of [
      [
        ['000002', [lewy]],
        ['000001', [prawy]],
      ],
      [
        ['000001', [prawy]],
        ['000002', [lewy]],
      ],
    ] as [string, Pierscien[]][][]) {
      expect(rejonDla(tabela(kolejnosc), 54.5, 18.5)).toEqual({ rejon: '000001', zapas: 'najblizszy' });
    }
  });

  it('gmina bez obrysów: zapas „gmina”', () => {
    expect(rejonDla(tabela([]), 54.4, 18.6)).toEqual({ rejon: '', zapas: 'gmina' });
  });
});

// ---------------------------------------------------------------- wczytywanie

describe('wczytajGmine', () => {
  it('czyta data/mieszkancy/gminy/<teryt>.json względem strony', async () => {
    const zapytania: string[] = [];
    const g = await wczytajGmine('1465138', plikowy(zapytania));
    expect(zapytania).toEqual(['data/mieszkancy/gminy/1465138.json']);
    expect(g?.teryt).toBe('1465138');
    expect(g?.wersja).toBe(WERSJA_TABEL);
    expect(g).toEqual(JSON.parse(fs.readFileSync(path.join(PUBLIC, zapytania[0]), 'utf8')));
  });

  it('404 (gminy bez własnej tabeli): null bez ostrzeżenia, generator użyje szablonu krajowego', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await wczytajGmine('9999999', plikowy())).toBeNull();
    expect(ostrzezenie).not.toHaveBeenCalled();
  });

  it('błąd sieci: null, nie wyjątek', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const siec = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await wczytajGmine('2261011', siec)).toBeNull();
  });

  it('inne błędy HTTP i odpowiedź, która nie jest JSON-em (np. strona zastępcza serwera): null z ostrzeżeniem', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await wczytajGmine('2261011', odpowiedz('błąd serwera', 500))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(1);
    expect(await wczytajGmine('2261011', odpowiedz('<!doctype html><title>Za Murem</title>'))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(2);
    expect(await wczytajGmine('2261011', odpowiedz('null'))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(3);
  });

  it('inna wersja tabel: null i ostrzeżenie w konsoli', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stara = JSON.stringify({ ...gdansk, wersja: WERSJA_TABEL + 1 });
    expect(await wczytajGmine('2261011', odpowiedz(stara))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(1);
    expect(String(ostrzezenie.mock.calls[0][0])).toContain('wersja');
  });

  it('kod, który nie jest 7 cyframi, nie dotyka sieci', async () => {
    const zapytania: string[] = [];
    for (const zly of ['', '../kraj', '226101', '22610111', '2261011/../x', 'abcdefg']) {
      expect(await wczytajGmine(zly, plikowy(zapytania)), zly).toBeNull();
    }
    expect(zapytania).toEqual([]);
  });

  it('bez podanego fetch używa globalnego', async () => {
    const zapytania: string[] = [];
    vi.stubGlobal('fetch', plikowy(zapytania));
    expect((await wczytajGmine('1206172'))?.nazwa).toBe('Zielonki');
    expect(zapytania).toEqual(['data/mieszkancy/gminy/1206172.json']);
  });
});

describe('wczytajKraj', () => {
  it('czyta data/mieszkancy/kraj.json względem strony', async () => {
    const zapytania: string[] = [];
    const k = await wczytajKraj(plikowy(zapytania));
    expect(zapytania).toEqual(['data/mieszkancy/kraj.json']);
    expect(k.wersja).toBe(WERSJA_TABEL);
    expect(k.qx.polskaM).toHaveLength(101);
    expect(Object.keys(k.polska.gospodarstwa)).toEqual(['1', '2', '3', '4', '5+']);
  });

  it('brak pliku, błąd sieci, zły JSON i inna wersja: wyjątek (generator bez tabel krajowych nie ruszy)', async () => {
    await expect(wczytajKraj(odpowiedz('brak', 404))).rejects.toThrow(/404/);
    await expect(wczytajKraj(odpowiedz('błąd', 500))).rejects.toThrow(/500/);
    await expect(wczytajKraj(odpowiedz('<html>'))).rejects.toThrow();
    const siec = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(wczytajKraj(siec)).rejects.toThrow('Failed to fetch');
    const stara = JSON.stringify({ wersja: WERSJA_TABEL + 1 });
    await expect(wczytajKraj(odpowiedz(stara))).rejects.toThrow(/wersj/);
  });

  it('bez podanego fetch używa globalnego', async () => {
    const zapytania: string[] = [];
    vi.stubGlobal('fetch', plikowy(zapytania));
    expect((await wczytajKraj()).wersja).toBe(WERSJA_TABEL);
    expect(zapytania).toEqual(['data/mieszkancy/kraj.json']);
  });
});
