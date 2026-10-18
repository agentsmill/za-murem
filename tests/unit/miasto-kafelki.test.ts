/* Kafelki miasta i miejsca spoza okolicy (src/world/miastoKafelki.ts, docs/superpowers/specs/2026-10-18-mapa-miasta-design.md,
   „Dwie warstwy danych miasta”). Wszystko offline: sieć zastępuje sztuczne `pobierz` z kafelków w tests/fixtures. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatLon } from '../../src/world/klucze.ts';
import { KafelkiMiasta, kafelkiWokol, poiZKafelkow, zKafelka } from '../../src/world/miastoKafelki.ts';
import { pobierzKafelek, tilesFor, toGeoT } from '../../src/world/mvt.ts';
import { LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles, tileBytes } from './fixtures.ts';

/** kafelek (x, y) na poziomie z, w którym leży punkt (niezależny od kodu gry: Merkator wprost ze wzoru) */
function kafelekPunktu(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lon + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
}

/** punkt oddalony o dx metrów na wschód i dy na południe od c (jak geometria gry) */
function przesun(c: LatLon, dx: number, dy: number): [number, number] {
  return [c[0] - dy / 110574, c[1] + dx / (111320 * Math.cos((c[0] * Math.PI) / 180))];
}

/** `pobierz` oddające kafelki z tests/fixtures; poza nimi pusty kafelek (jak 204 z serwera). Zapisuje wywołania. */
function pobierzZPlikow(wywolania: [number, number, number][] = []) {
  const znane = new Set(ADDRESSES.flatMap((a) => a.tiles.map(([x, y]) => `${x}/${y}`)));
  return async (z: number, x: number, y: number): Promise<Uint8Array | null> => {
    wywolania.push([z, x, y]);
    return znane.has(`${x}/${y}`) ? tileBytes(x, y) : new Uint8Array(0);
  };
}

describe('poiZKafelkow (warstwa poi, bez limitu promienia)', () => {
  for (const a of ADDRESSES) {
    const c: LatLon = [a.lat, a.lon];

    it(`${a.key}: punkty z toGeoT są w wyniku w tej samej kolejności, z tym samym kluczem i położeniem`, () => {
      const tiles = decodedTiles(a);
      const geo = toGeoT(tiles, a.lat, a.lon, LOAD_RADIUS);
      expect(geo.poi.length).toBeGreaterThan(0);
      const wszystkie = poiZKafelkow(tiles, c);
      // toGeoT tnie punkty do 720 m (Math.hypot); poiZKafelkow nie tnie wcale
      const wPromieniu = wszystkie.filter((p) => Math.hypot(p.x, p.y) <= 720);
      expect(wPromieniu).toEqual(geo.poi);
      expect(wszystkie.length).toBeGreaterThanOrEqual(geo.poi.length);
      const klucze = new Set(wszystkie.map((p) => p.k));
      for (const p of geo.poi) expect(klucze.has(p.k)).toBe(true);
    });

    it(`${a.key}: środek o 5 km dalej nie rzuca, klucze zostają, położenia się przesuwają`, () => {
      const tiles = decodedTiles(a);
      const baza = poiZKafelkow(tiles, c);
      const daleko = poiZKafelkow(tiles, przesun(c, 5000, 0));
      expect(daleko.length).toBe(baza.length);
      expect(daleko.map((p) => p.k)).toEqual(baza.map((p) => p.k));
      for (let i = 0; i < baza.length; i++) {
        // środek 5 km na wschód: x maleje o 5000 m (z dokładnością do zaokrąglenia do 0,5 m), y bez zmian
        expect(Math.abs(daleko[i].x - (baza[i].x - 5000))).toBeLessThanOrEqual(1);
        expect(Math.abs(daleko[i].y - baza[i].y)).toBeLessThanOrEqual(1);
        expect(daleko[i].c).toBe(baza[i].c);
        expect(daleko[i].n).toBe(baza[i].n);
      }
    });
  }

  it('pusta lista kafelków i kafelek bez warstwy poi dają pustą listę', () => {
    expect(poiZKafelkow([], [54.4, 18.6])).toEqual([]);
    expect(poiZKafelkow([{ x: 1, y: 2, L: {} }], [54.4, 18.6])).toEqual([]);
  });

  it('kafelek z innego poziomu niż 14 nie daje punktów (klucz byłby z innej siatki pikseli)', () => {
    const a = ADDRESSES[0];
    const c: LatLon = [a.lat, a.lon];
    const t = decodedTiles(a);
    const wDwunastu = t.map((k) => ({ ...k, z: 12 }));
    const wCzternastu = t.map((k) => ({ ...k, z: 14 }));
    expect(poiZKafelkow(t, c).length).toBeGreaterThan(0);
    expect(poiZKafelkow(wDwunastu, c)).toEqual([]);
    expect(poiZKafelkow(wCzternastu, c)).toEqual(poiZKafelkow(t, c));
  });
});

describe('kafelkiWokol', () => {
  for (const a of ADDRESSES) {
    const c: LatLon = [a.lat, a.lon];

    it(`${a.key}: promień 0 daje kafelek zawierający punkt, na każdym z=12 i z=14`, () => {
      for (const z of [12, 14]) {
        expect(kafelkiWokol(c, 0, z)).toEqual([kafelekPunktu(a.lat, a.lon, z)]);
      }
    });

    it(`${a.key}: 720 m na z=14 to te same kafelki co przy starcie gry`, () => {
      expect(kafelkiWokol(c, 720, 14)).toEqual(a.tiles);
      expect(kafelkiWokol(c, 720, 14)).toEqual(tilesFor(a.lat, a.lon, 720));
    });

    it(`${a.key}: kwadrat kafelków pokrywa całe koło (z=14 i z=12, 720 m i 5 km), bez powtórzeń`, () => {
      for (const z of [12, 14]) {
        for (const r of [720, 5000]) {
          const lista = kafelkiWokol(c, r, z);
          const zbior = new Set(lista.map(([x, y]) => `${x}/${y}`));
          expect(zbior.size, `z=${z} r=${r}`).toBe(lista.length);
          for (let i = 0; i < 72; i++) {
            const kat = (i / 72) * 2 * Math.PI;
            const [lat, lon] = przesun(c, r * Math.cos(kat), r * Math.sin(kat));
            const [x, y] = kafelekPunktu(lat, lon, z);
            expect(zbior.has(`${x}/${y}`), `z=${z} r=${r} i=${i}`).toBe(true);
          }
        }
      }
    });
  }

  it('niższy poziom ma mniej kafelków na ten sam obszar', () => {
    const c: LatLon = [ADDRESSES[1].lat, ADDRESSES[1].lon];
    expect(kafelkiWokol(c, 5000, 12).length).toBeLessThan(kafelkiWokol(c, 5000, 14).length);
  });

  it('nie zwraca kafelków spoza świata (bieguny, południk 180)', () => {
    for (const c of [
      [85.05, 179.99],
      [-85.05, -179.99],
      [0, 180],
    ] as LatLon[]) {
      for (const [x, y] of kafelkiWokol(c, 20000, 12)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(2 ** 12);
        expect(y).toBeLessThan(2 ** 12);
      }
    }
  });
});

describe('zKafelka', () => {
  it('powyżej 8 m/px poziom 12, inaczej 14', () => {
    expect(zKafelka(8.01)).toBe(12);
    expect(zKafelka(40)).toBe(12);
    expect(zKafelka(8)).toBe(14);
    expect(zKafelka(2)).toBe(14);
    expect(zKafelka(0.1)).toBe(14);
  });
});

describe('KafelkiMiasta', () => {
  const a = ADDRESSES[0];
  const [x0, y0] = a.tiles[0];

  it('drugie daj tego samego kafelka nie pobiera ponownie, a wynik ma współrzędne, poziom i warstwy', async () => {
    const wywolania: [number, number, number][] = [];
    const k = new KafelkiMiasta(pobierzZPlikow(wywolania));
    const t1 = await k.daj(14, x0, y0);
    const t2 = await k.daj(14, x0, y0);
    expect(wywolania).toEqual([[14, x0, y0]]);
    expect(t1).not.toBeNull();
    expect(t2).toBe(t1);
    expect(t1?.x).toBe(x0);
    expect(t1?.y).toBe(y0);
    expect(t1?.z).toBe(14);
    expect(Object.keys(t1?.L ?? {})).toContain('poi');
    // ten sam x, y na innym poziomie to inny kafelek
    await k.daj(12, x0, y0);
    expect(wywolania.length).toBe(2);
  });

  it('równoległe daj tego samego kafelka pobiera go raz', async () => {
    const wywolania: [number, number, number][] = [];
    const k = new KafelkiMiasta(pobierzZPlikow(wywolania));
    const [t1, t2, t3] = await Promise.all([k.daj(14, x0, y0), k.daj(14, x0, y0), k.daj(14, x0, y0)]);
    expect(wywolania.length).toBe(1);
    expect(t2).toBe(t1);
    expect(t3).toBe(t1);
  });

  it('pusty kafelek (204, 404) to kafelek bez warstw, nie błąd', async () => {
    const k = new KafelkiMiasta(async () => new Uint8Array(0));
    const t = await k.daj(14, 1, 2);
    expect(t).toEqual({ x: 1, y: 2, z: 14, L: {} });
  });

  it('null z pobrania daje null, wyjątek też, i żaden błąd nie zostaje w pamięci', async () => {
    let odpowiedz: 'null' | 'wyjatek' | 'ok' = 'null';
    const wywolania: [number, number, number][] = [];
    const k = new KafelkiMiasta(async (z, x, y) => {
      wywolania.push([z, x, y]);
      if (odpowiedz === 'wyjatek') throw new Error('sieć');
      return odpowiedz === 'null' ? null : tileBytes(x0, y0);
    });
    expect(await k.daj(14, x0, y0)).toBeNull();
    odpowiedz = 'wyjatek';
    expect(await k.daj(14, x0, y0)).toBeNull();
    // po powrocie sieci ten sam kafelek da się pobrać (porażki nie zapamiętujemy)
    odpowiedz = 'ok';
    const t = await k.daj(14, x0, y0);
    expect(t).not.toBeNull();
    expect(wywolania.length).toBe(3);
    // udany zostaje w pamięci
    expect(await k.daj(14, x0, y0)).toBe(t);
    expect(wywolania.length).toBe(3);
  });

  it('dajObszar liczy brak, zwraca resztę i prosi o kafelki z=14 dla 720 m wokół adresu', async () => {
    const wywolania: [number, number, number][] = [];
    const zFixture = pobierzZPlikow(wywolania);
    const [bx, by] = a.tiles[2];
    const k = new KafelkiMiasta(async (z, x, y) => (x === bx && y === by ? null : zFixture(z, x, y)));
    const wynik = await k.dajObszar([a.lat, a.lon], 720, 14);
    expect(wynik.brak).toBe(1);
    expect(wynik.tiles.length).toBe(a.tiles.length - 1);
    expect(wynik.tiles.map((t) => [t.x, t.y])).toEqual(a.tiles.filter(([x, y]) => !(x === bx && y === by)));
    for (const t of wynik.tiles) expect(t.z).toBe(14);

    // drugi raz: pobrane wracają z pamięci, brakujący jest próbowany od nowa
    const ponow = await k.dajObszar([a.lat, a.lon], 720, 14);
    expect(ponow.brak).toBe(1);
    expect(ponow.tiles.length).toBe(wynik.tiles.length);
    expect(wywolania.length).toBe(a.tiles.length - 1);
  });

  it('dajObszar daje miejsca zgodne z toGeoT (kafelki z kafelkiWokol, poiZKafelkow)', async () => {
    for (const adres of ADDRESSES) {
      const c: LatLon = [adres.lat, adres.lon];
      const k = new KafelkiMiasta(pobierzZPlikow());
      const { tiles, brak } = await k.dajObszar(c, 720, 14);
      expect(brak).toBe(0);
      const geo = toGeoT(decodedTiles(adres), adres.lat, adres.lon, LOAD_RADIUS);
      const klucze = new Set(poiZKafelkow(tiles, c).map((p) => p.k));
      for (const p of geo.poi) expect(klucze.has(p.k), `${adres.key} ${p.c} ${p.n}`).toBe(true);
    }
  });

  it('nie robi więcej niż 6 pobrań naraz i kończy wszystkie', async () => {
    let wLocie = 0;
    let najwiecej = 0;
    let razem = 0;
    const k = new KafelkiMiasta(async () => {
      wLocie++;
      razem++;
      najwiecej = Math.max(najwiecej, wLocie);
      await new Promise((r) => setTimeout(r, 2));
      wLocie--;
      return new Uint8Array(0);
    });
    const wyniki = await Promise.all(Array.from({ length: 25 }, (_, i) => k.daj(14, 100 + i, 7)));
    expect(razem).toBe(25);
    expect(najwiecej).toBe(6);
    expect(wyniki.every((t) => t !== null)).toBe(true);
  });

  it('porażka jednego pobrania nie blokuje kolejki', async () => {
    const k = new KafelkiMiasta(async (_z, x) => {
      if (x % 2 === 0) throw new Error('sieć');
      return new Uint8Array(0);
    });
    const wyniki = await Promise.all(Array.from({ length: 20 }, (_, i) => k.daj(14, i, 0)));
    expect(wyniki.filter((t) => t === null).length).toBe(10);
    expect(wyniki.filter((t) => t !== null).length).toBe(10);
  });
});

describe('pobierzKafelek (produkcyjne pobierz na getTile)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const SZABLON = 'https://tiles.openfreemap.org/planet/20260101_000000_pt/{z}/{x}/{y}.pbf';
  const planet = () => new Response(JSON.stringify({ tiles: [SZABLON] }), { status: 200 });

  it('brak sieci daje null i nic nie ląduje na konsoli', async () => {
    const blad = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ostrz = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await pobierzKafelek(12, 2275, 1380)).toBeNull();
    expect(blad).not.toHaveBeenCalled();
    expect(ostrz).not.toHaveBeenCalled();
    blad.mockRestore();
    ostrz.mockRestore();
  });

  it('pobiera kafelek dla dowolnego poziomu z szablonu adresu, szablon pobiera raz', async () => {
    const adresy: string[] = [];
    const bajty = tileBytes(...ADDRESSES[0].tiles[0]);
    vi.stubGlobal('fetch', async (url: string) => {
      adresy.push(url);
      return url.endsWith('/planet') ? planet() : new Response(new Uint8Array(bajty), { status: 200 });
    });
    const t12 = await pobierzKafelek(12, 2259, 1307);
    const t14 = await pobierzKafelek(14, 9037, 5228);
    expect(t12).toEqual(bajty);
    expect(t14).toEqual(bajty);
    expect(adresy).toEqual([
      'https://tiles.openfreemap.org/planet',
      'https://tiles.openfreemap.org/planet/20260101_000000_pt/12/2259/1307.pbf',
      'https://tiles.openfreemap.org/planet/20260101_000000_pt/14/9037/5228.pbf',
    ]);
  });

  it('204 i 404 to pusty kafelek, a błąd serwera to null', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/planet')) return planet();
      if (url.includes('/9/')) return new Response(null, { status: 204 });
      if (url.includes('/8/')) return new Response('', { status: 404 });
      return new Response('', { status: 503 });
    });
    expect(await pobierzKafelek(14, 9, 9)).toEqual(new Uint8Array(0));
    expect(await pobierzKafelek(14, 8, 8)).toEqual(new Uint8Array(0));
    expect(await pobierzKafelek(14, 7, 7)).toBeNull();
  });
});
