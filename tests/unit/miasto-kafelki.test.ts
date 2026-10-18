/* Kafelki miasta i miejsca spoza okolicy (src/world/miastoKafelki.ts, docs/superpowers/specs/2026-10-18-mapa-miasta-design.md,
   „Dwie warstwy danych miasta”). Wszystko offline: sieć zastępuje sztuczne `pobierz` z kafelków w tests/fixtures. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatLon } from '../../src/world/klucze.ts';
import {
  KafelkiMiasta,
  kafelkiProstokata,
  kafelkiWokol,
  poiZKafelkow,
  rzutKafelkaZ,
  tloKafelka,
  zKafelka,
} from '../../src/world/miastoKafelki.ts';
import { type DecodedTile, pobierzKafelek, rzutKafelka, tilesFor, toGeoT } from '../../src/world/mvt.ts';
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

  it('zapomnij zwalnia kafelek z pamięci: następne daj pobiera go od nowa, inne kafelki zostają', async () => {
    const wywolania: [number, number, number][] = [];
    const k = new KafelkiMiasta(pobierzZPlikow(wywolania));
    const [x1, y1] = a.tiles[1];
    const t = await k.daj(14, x0, y0);
    await k.daj(14, x1, y1);
    k.zapomnij(14, x0, y0);
    // nieznany kafelek i inny poziom: nic się nie dzieje
    k.zapomnij(14, 1, 1);
    k.zapomnij(12, x1, y1);
    const t2 = await k.daj(14, x0, y0);
    expect(t2).not.toBe(t);
    expect(t2).toEqual(t);
    await k.daj(14, x1, y1);
    expect(wywolania).toEqual([
      [14, x0, y0],
      [14, x1, y1],
      [14, x0, y0],
    ]);
  });

  it('zapomnij w trakcie pobierania: wołający dostaje kafelek, a porażka starego pobrania nie kasuje nowego', async () => {
    let pusc: ((b: Uint8Array | null) => void)[] = [];
    const k = new KafelkiMiasta(() => new Promise((r) => pusc.push(r)));
    const stare = k.daj(14, 5, 5);
    await Promise.resolve();
    k.zapomnij(14, 5, 5);
    const nowe = k.daj(14, 5, 5);
    // dwa osobne pobrania (stare zostało zapomniane), oba czekają
    await new Promise((r) => setTimeout(r, 0));
    expect(pusc.length).toBe(2);
    const [p1, p2] = pusc;
    pusc = [];
    p2(new Uint8Array(0));
    expect(await nowe).toEqual({ x: 5, y: 5, z: 14, L: {} });
    // stare pobranie kończy się porażką już po nowym: nowy kafelek zostaje w pamięci
    p1(null);
    expect(await stare).toBeNull();
    expect(await k.daj(14, 5, 5)).toBe(await nowe);
    expect(pusc.length).toBe(0);
  });
});

describe('rzutKafelkaZ (rzut kafelka dowolnego poziomu, dla tła mapy miasta)', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: dla z=14 daje dokładnie to samo co rzutKafelka (wszystkie wierzchołki kafelków)`, () => {
      const stary = rzutKafelka(a.lat, a.lon);
      const nowy = rzutKafelkaZ(a.lat, a.lon);
      let n = 0;
      for (const T of decodedTiles(a))
        for (const ln in T.L) {
          const E = T.L[ln].extent;
          for (const F of T.L[ln].features)
            for (const ring of F.g ?? [])
              for (const q of ring) {
                expect(nowy({ x: T.x, y: T.y, z: 14 }, E, q)).toEqual(stary(T, E, q));
                // brak pola z to poziom 14, jak w DecodedTile
                if (n % 97 === 0) expect(nowy(T, E, q)).toEqual(stary(T, E, q));
                n++;
              }
        }
      expect(n).toBeGreaterThan(10000);
    });

    it(`${a.key}: róg kafelka z=12 leży tam, gdzie róg odpowiadającego kafelka z=14`, () => {
      const r = rzutKafelkaZ(a.lat, a.lon);
      const [x14, y14] = a.tiles[0];
      const X = Math.floor(x14 / 4);
      const Y = Math.floor(y14 / 4);
      for (const [qx, qy] of [
        [0, 0],
        [4096, 4096],
        [2048, 1024],
      ]) {
        const p12 = r({ x: X, y: Y, z: 12 }, 4096, [qx, qy]);
        const p14 = r({ x: 4 * X, y: 4 * Y, z: 14 }, 4096, [qx * 4, qy * 4]);
        expect(Math.abs(p12[0] - p14[0])).toBeLessThanOrEqual(0.5);
        expect(Math.abs(p12[1] - p14[1])).toBeLessThanOrEqual(0.5);
      }
      // kafelek z=12 jest 4 razy szerszy niż z=14
      const a12 = r({ x: X, y: Y, z: 12 }, 4096, [0, 0]);
      const b12 = r({ x: X, y: Y, z: 12 }, 4096, [4096, 0]);
      const a14 = r({ x: x14, y: y14, z: 14 }, 4096, [0, 0]);
      const b14 = r({ x: x14, y: y14, z: 14 }, 4096, [4096, 0]);
      expect((b12[0] - a12[0]) / (b14[0] - a14[0])).toBeCloseTo(4, 2);
    });
  }
});

describe('kafelkiProstokata', () => {
  for (const a of ADDRESSES) {
    const c: LatLon = [a.lat, a.lon];
    it(`${a.key}: kwadrat wokół adresu to te same kafelki co kafelkiWokol (z 12 i 14)`, () => {
      for (const z of [12, 14])
        for (const r of [0, 300, 720, 5000])
          expect(kafelkiProstokata(c, -r, -r, r, r, z), `z ${z} r ${r}`).toEqual(kafelkiWokol(c, r, z));
    });

    it(`${a.key}: prostokąt z boku adresu pokrywa każdy swój punkt i nic poza zapasem jednego kafelka`, () => {
      const r = rzutKafelkaZ(a.lat, a.lon);
      for (const z of [12, 14]) {
        const [x0, y0, x1, y1] = [800, -2500, 3100, -400];
        const lista = kafelkiProstokata(c, x0, y0, x1, y1, z);
        const zbior = new Set(lista.map(([x, y]) => `${x}/${y}`));
        expect(zbior.size).toBe(lista.length);
        // każdy kafelek z listy przecina prostokąt (z dokładnością do zaokrąglenia rzutu)
        for (const [x, y] of lista) {
          const [ax, ay] = r({ x, y, z }, 4096, [0, 0]);
          const [bx, by] = r({ x, y, z }, 4096, [4096, 4096]);
          expect(ax <= x1 + 1 && bx >= x0 - 1 && ay <= y1 + 1 && by >= y0 - 1, `${z}/${x}/${y}`).toBe(true);
        }
        // narożniki i środek prostokąta leżą w kafelkach z listy
        for (const [px, py] of [
          [x0, y0],
          [x1, y1],
          [x0, y1],
          [x1, y0],
          [(x0 + x1) / 2, (y0 + y1) / 2],
        ]) {
          const [lat, lon] = przesun(c, px, py);
          const [tx, ty] = kafelekPunktu(lat, lon, z);
          expect(zbior.has(`${tx}/${ty}`), `z ${z} punkt ${px},${py}`).toBe(true);
        }
      }
    });
  }

  it('odwrócony albo pusty prostokąt i punkty poza światem nie dają kafelków spoza świata', () => {
    const c: LatLon = [89.9, 179.99];
    for (const [x, y] of kafelkiProstokata(c, -50000, -50000, 50000, 50000, 12)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(4096);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(4096);
    }
    expect(kafelkiProstokata([52, 21], 100, 100, -100, -100, 14)).toEqual([]);
  });
});

describe('tloKafelka (woda, zieleń, budynki i drogi do rysowania)', () => {
  /** odbiorca, który zapisuje, co dostał */
  function zapis() {
    const pola: Record<string, [number, number][][]> = {};
    const linie: Record<string, [number, number][][]> = {};
    return {
      pola,
      linie,
      odbiorca: {
        pole: (k: string, ring: [number, number][]) => {
          (pola[k] ??= []).push(ring);
        },
        linia: (k: string, line: [number, number][]) => {
          (linie[k] ??= []).push(line);
        },
      },
    };
  }

  for (const a of ADDRESSES) {
    it(`${a.key}: budynki, zieleń i ulice w metrach od adresu, wierzchołki budynków jak w świecie gry`, () => {
      const r = rzutKafelkaZ(a.lat, a.lon);
      const z = zapis();
      for (const T of decodedTiles(a)) tloKafelka(T, r, z.odbiorca);
      expect(z.pola.budynek?.length).toBeGreaterThan(100);
      expect(z.pola.zielen?.length).toBeGreaterThan(10);
      expect((z.linie.ulica?.length ?? 0) + (z.linie.srednia?.length ?? 0)).toBeGreaterThan(10);
      for (const k in z.pola) for (const ring of z.pola[k]) expect(ring.length).toBeGreaterThanOrEqual(3);
      for (const k in z.linie) for (const line of z.linie[k]) expect(line.length).toBeGreaterThanOrEqual(2);
      // kafelki obejmują około 720 m wokół adresu (z buforem kafelka), nic dalej
      for (const k in z.pola)
        for (const ring of z.pola[k])
          for (const [x, y] of ring) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
            expect(Math.abs(x)).toBeLessThan(4000);
            expect(Math.abs(y)).toBeLessThan(4000);
          }
      // budynki świata gry (toGeoT) mają te same wierzchołki; inne są tylko tam, gdzie świat przyciął obrys do kafelka
      const wierzcholki = new Set(z.pola.budynek.flatMap((ring) => ring.map(([x, y]) => `${x},${y}`)));
      const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
      let jest = 0;
      let razem = 0;
      for (const b of geo.b)
        for (const [x, y] of b.p) {
          razem++;
          if (wierzcholki.has(`${x},${y}`)) jest++;
        }
      expect(razem).toBeGreaterThan(500);
      expect(jest / razem).toBeGreaterThan(0.9);
    });
  }

  it('pomija tunele, części budynków nad ziemią, pola w warstwie dróg i nieznane klasy', () => {
    const r = rzutKafelkaZ(52, 21);
    const kw: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ];
    const linia: [number, number][] = [
      [0, 0],
      [100, 100],
    ];
    const T: DecodedTile = {
      x: 9150,
      y: 5400,
      L: {
        transportation: {
          extent: 4096,
          features: [
            { id: 1, type: 2, tags: { class: 'primary', brunnel: 'tunnel' }, g: [linia] },
            { id: 2, type: 2, tags: { class: 'primary' }, g: [linia] },
            { id: 3, type: 3, tags: { class: 'path' }, g: [kw] },
            { id: 4, type: 2, tags: { class: 'ferry' }, g: [linia] },
          ],
        },
        building: {
          extent: 4096,
          features: [
            { id: 5, type: 3, tags: { render_min_height: 10, render_height: 20 }, g: [kw] },
            { id: 6, type: 3, tags: { render_height: 20 }, g: [kw] },
          ],
        },
        landcover: { extent: 4096, features: [{ id: 7, type: 3, tags: { class: 'farmland' }, g: [kw] }] },
      },
    };
    const z = zapis();
    tloKafelka(T, r, z.odbiorca);
    expect(z.linie).toEqual({ glowna: [linia.map((q) => r(T, 4096, q))] });
    expect(z.pola).toEqual({ budynek: [kw.map((q) => r(T, 4096, q))] });
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
