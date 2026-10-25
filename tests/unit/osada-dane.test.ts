/* Geo kwadratu osady z kafelków prawdziwego adresu (`geoKwadratu` w src/world/load.ts), etap 2 osady AI
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 3): dla adresu spoza dem gra pobiera osiem sąsiednich kwadratów
   w tle, po kolei, tymi samymi kafelkami z=14 co dom (`kafelkiKwadratu`). Pobieranie jest wstrzyknięte (`pobierz`), więc test
   działa w Node na kafelkach z tests/fixtures: geo wychodzi to samo, co `geoKwadratu` z gotowych kafelków (src/world/geoKwadratu.ts,
   z którego korzystają dema), kafelki wspólne dla kilku kandydatów pobierają się raz, pusty kafelek (204, 404) jest zwykłym
   kafelkiem bez warstw, a błąd pobrania odrzuca kwadrat i nie jest ponawiany (też przy następnym kandydacie, który ma ten kafelek).
   Pobieranie samej sieci (szablon adresu kafelków, `pobierzKafelek` z mvt.ts) nie ma tu testu: sprawdza je scenariusz
   przeglądarkowy `osada-bez-sieci` w tools/shots-osada.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kandydaciOsady } from '../../src/ai/kwadrat.ts';
import { daneKandydatow } from '../../src/ui/osada.ts';
import type { Geo } from '../../src/world/geo.ts';
import { geoKwadratu as geoZKafelkow } from '../../src/world/geoKwadratu.ts';
import { kafelkiKwadratu, kluczKwadratu, sasiedzi8 } from '../../src/world/kwadraty.ts';
import { geoKwadratu, type PamiecKafelkow } from '../../src/world/load.ts';
import { type DecodedTile, decode, WANT } from '../../src/world/mvt.ts';
import { ADDRESSES, FIX, tileBytes, ukladTestowy } from './fixtures.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const ma = (x: number, y: number): boolean => fs.existsSync(path.join(FIX, 'mvt', `t_${x}_${y}.pbf`));

/** pobieranie z tests/fixtures: kafelek z=14 z pliku, każdy inny (bez pliku, inny poziom) to pusty kafelek, jak odpowiedź 204 */
function zPliku(log: string[] = []): (z: number, x: number, y: number) => Promise<Uint8Array | null> {
  return async (z, x, y) => {
    log.push(`${z}/${x}/${y}`);
    return z === 14 && ma(x, y) ? tileBytes(x, y) : new Uint8Array(0);
  };
}

/** to samo geo, ale ze zdekodowanych kafelków podanych wprost (jak dema): kafelki z `kafelkiKwadratu`, brakujące puste */
function oczekiwane(adres: (typeof ADDRESSES)[number], sx: number, sy: number) {
  const u = ukladTestowy(adres);
  const kafelki: DecodedTile[] = kafelkiKwadratu(u, sx, sy).map(([x, y]) => ({
    x,
    y,
    L: ma(x, y) ? decode(tileBytes(x, y), WANT) : {},
  }));
  return geoZKafelkow(kafelki, u, sx, sy);
}

describe('geoKwadratu z kafelków (src/world/load.ts)', () => {
  it('daje to samo geo co geoKwadratu ze zdekodowanych kafelków: osiem sąsiadów trzech adresów', async () => {
    for (const a of ADDRESSES)
      for (const [sx, sy] of sasiedzi8(0, 0)) {
        const u = ukladTestowy(a);
        const geo = await geoKwadratu(u, sx, sy, new Map(), zPliku());
        expect(JSON.stringify(geo), `${a.key} ${sx},${sy}`).toBe(JSON.stringify(oczekiwane(a, sx, sy)));
      }
  });

  it('prosi dokładnie o kafelki z kafelkiKwadratu, na poziomie 14, po jednym razie każdy', async () => {
    const a = ADDRESSES[0];
    const u = ukladTestowy(a);
    for (const [sx, sy] of [
      [1, 0],
      [-1, 1],
    ]) {
      const log: string[] = [];
      await geoKwadratu(u, sx, sy, new Map(), zPliku(log));
      const lista = kafelkiKwadratu(u, sx, sy).map(([x, y]) => `14/${x}/${y}`);
      expect([...log].sort(), `${sx},${sy}`).toEqual([...lista].sort());
      expect(new Set(log).size).toBe(log.length);
    }
  });

  it('kafelki wspólne dla kilku kandydatów pobierają się raz (pamięć jednego ładowania)', async () => {
    const a = ADDRESSES[1];
    const u = ukladTestowy(a);
    const log: string[] = [];
    const pamiec: PamiecKafelkow = new Map();
    const kandydaci = sasiedzi8(0, 0);
    for (const [sx, sy] of kandydaci) await geoKwadratu(u, sx, sy, pamiec, zPliku(log));
    const suma = new Set(kandydaci.flatMap(([sx, sy]) => kafelkiKwadratu(u, sx, sy).map(([x, y]) => `14/${x}/${y}`)));
    expect(log.length).toBe(suma.size);
    expect(new Set(log).size).toBe(log.length);
    // bez wspólnej pamięci te same kandydaci pobraliby kafelki wielokrotnie
    const log2: string[] = [];
    for (const [sx, sy] of kandydaci) await geoKwadratu(u, sx, sy, new Map(), zPliku(log2));
    expect(log2.length).toBeGreaterThan(log.length);
  });

  it('pusty kafelek (204, 404) to kafelek bez warstw: kwadrat bez żadnych kafelków ma puste geo, nie błąd', async () => {
    const u = ukladTestowy(ADDRESSES[0]);
    const geo = await geoKwadratu(u, 7, 7, new Map(), async () => new Uint8Array(0));
    expect(geo.b).toEqual([]);
    expect(geo.r).toEqual([]);
    expect(geo.poi).toEqual([]);
    expect(geo.c).toEqual([u.c[0], u.c[1]]);
  });

  it('błąd pobrania kafelka (null) odrzuca kwadrat z opisem kafelka i nie jest ponawiany, także przy następnym kandydacie', async () => {
    const a = ADDRESSES[0];
    const u = ukladTestowy(a);
    const wspolny = kafelkiKwadratu(u, 1, 0)[0];
    const log: string[] = [];
    const pamiec: PamiecKafelkow = new Map();
    const pobierz = async (z: number, x: number, y: number): Promise<Uint8Array | null> => {
      log.push(`${z}/${x}/${y}`);
      return x === wspolny[0] && y === wspolny[1] ? null : (new Uint8Array(0) as Uint8Array);
    };
    await expect(geoKwadratu(u, 1, 0, pamiec, pobierz)).rejects.toThrow(new RegExp(`${wspolny[0]}`));
    const po1 = log.filter((l) => l === `14/${wspolny[0]}/${wspolny[1]}`).length;
    expect(po1).toBe(1);
    // inny kwadrat z tym samym kafelkiem: odrzucony od razu, bez nowego pobrania
    const inny = sasiedzi8(0, 0).find(
      ([sx, sy]) =>
        (sx !== 1 || sy !== 0) && kafelkiKwadratu(u, sx, sy).some(([x, y]) => x === wspolny[0] && y === wspolny[1]),
    );
    expect(inny, 'jakiś inny sąsiad ma ten kafelek').toBeDefined();
    await expect(geoKwadratu(u, inny![0], inny![1], pamiec, pobierz)).rejects.toThrow();
    expect(log.filter((l) => l === `14/${wspolny[0]}/${wspolny[1]}`).length).toBe(1);
  });

  it('wyjątek z pobierania (nie tylko null) też odrzuca kwadrat', async () => {
    const u = ukladTestowy(ADDRESSES[2]);
    await expect(
      geoKwadratu(u, 0, -1, new Map(), async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow();
  });
});

describe('daneKandydatow (src/ui/osada.ts): skąd gra bierze dane ośmiu kandydatów', () => {
  const uklad = ukladTestowy(ADDRESSES[0]);
  const atrapa = (nazwa: string): Geo => ({ c: [54, 18], b: [], r: [], a: [], w: [], poi: [], src: nazwa });
  const dom = (src: 'demo' | 'mvt' | 'overpass', extra: { key?: string; proc?: boolean } = {}) => ({
    src,
    ...(extra.key ? { key: extra.key } : {}),
    geo: { proc: extra.proc },
  });

  it('demo: rekord z pliku dema taki, jaki jest, bez pobierania kafelków', async () => {
    const rekord = { '0,-1': atrapa('a'), '1,0': atrapa('b') };
    const pobrane: string[] = [];
    const wynik = await daneKandydatow(dom('demo', { key: 'przymorze' }), uklad, 11, {
      demo: async (klucz) => {
        pobrane.push(klucz);
        return rekord;
      },
      geo: async () => {
        throw new Error('dema nie pobierają kafelków');
      },
    });
    expect(wynik).toBe(rekord);
    expect(pobrane).toEqual(['przymorze']);
  });

  it('demo bez pliku: pusty rekord i jedno ostrzeżenie, nie wyjątek', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wynik = await daneKandydatow(dom('demo', { key: 'przymorze' }), uklad, 11, {
      demo: async () => {
        throw new Error('Nie ma sąsiednich kwadratów przykładu');
      },
    });
    expect(wynik).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Osada/);
  });

  it('osiedle zapasowe bez prawdziwego położenia (geo.proc): pusty rekord, nic się nie pobiera', async () => {
    const wolane: string[] = [];
    const wynik = await daneKandydatow(dom('mvt', { proc: true }), uklad, 11, {
      demo: async () => {
        wolane.push('demo');
        return {};
      },
      geo: async () => {
        wolane.push('geo');
        return atrapa('x');
      },
    });
    expect(wynik).toEqual({});
    expect(wolane).toEqual([]);
  });

  it('prawdziwy adres: osiem kwadratów po kolei w kolejności z ziarna, jedna pamięć kafelków dla wszystkich, nieudane brakują', async () => {
    const kolejnosc = kandydaciOsady(11).map(([x, y]) => kluczKwadratu(x, y));
    const pamieci = new Set<PamiecKafelkow>();
    const wolane: string[] = [];
    const ostrzezenia: string[][] = [];
    const wynik = await daneKandydatow(dom('mvt'), uklad, 11, {
      geo: async (u, sx, sy, pamiec) => {
        expect(u).toBe(uklad);
        pamieci.add(pamiec);
        wolane.push(kluczKwadratu(sx, sy));
        if (kluczKwadratu(sx, sy) === kolejnosc[2]) throw new Error('kafelek nie przyszedł');
        return atrapa(kluczKwadratu(sx, sy));
      },
      ostrzez: (_b, nieudane) => ostrzezenia.push(nieudane),
    });
    expect(wolane).toEqual(kolejnosc);
    expect(pamieci.size).toBe(1);
    expect(Object.keys(wynik).sort()).toEqual(kolejnosc.filter((k) => k !== kolejnosc[2]).sort());
    expect(ostrzezenia).toEqual([[kolejnosc[2]]]);
  });

  it('adres z Overpassa (kafelki padły przy starcie) też próbuje sąsiadów z kafelków; bez sieci rekord jest pusty, a ostrzeżenie jedno', async () => {
    const ostrzezenia: string[][] = [];
    const wynik = await daneKandydatow(dom('overpass'), uklad, 11, {
      geo: async () => {
        throw new TypeError('Failed to fetch');
      },
      ostrzez: (_b, nieudane) => ostrzezenia.push(nieudane),
    });
    expect(wynik).toEqual({});
    expect(ostrzezenia).toHaveLength(1);
    expect(ostrzezenia[0]).toHaveLength(8);
  });
});
