/* Budynki dla mieszkańców (src/mieszkancy/budynki.ts, obrys.ts): z mapy do listy budynków mieszkalnych z epoką,
   liczbą mieszkań i klatkami. Chodzi zawsze, na demach z public/demo/ i tabelach z public/data/mieszkancy/,
   bez surowych plików. Trygonometria wolno tylko tutaj, w teście (w src/mieszkancy/ jest jedno miejsce). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo, epokaBudynku, epokaZRoku, mieszkaniaBudynku, rokZDaty } from '../../src/mieszkancy/budynki.ts';
import { rejonDla } from '../../src/mieszkancy/rejon.ts';
import type { Epoka, TabeleGminy, TabeleKraju } from '../../src/mieszkancy/tabele.ts';
import type { Budynek } from '../../src/mieszkancy/typy.ts';
import type { Geo, GeoBuilding, GeoPoi, Pt } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;

const EPOKI: Epoka[] = ['przedwojenna', 'powojenna', 'plyta', 'transformacja', 'nowa'];

// ---------------------------------------------------------------- pomocnicy do map sztucznych

/** Zamknięty prostokąt o lewym górnym rogu (x, y), szerokości w (wschód) i wysokości h (południe). */
function prostokat(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
}
/** Prostokąt o środku (cx, cy), bokach a × b, obrócony o `stopnie`. */
function obrocony(cx: number, cy: number, a: number, b: number, stopnie: number): Pt[] {
  const k = (stopnie * Math.PI) / 180;
  const c = Math.cos(k);
  const s = Math.sin(k);
  const rog = (u: number, v: number): Pt => [cx + u * c - v * s, cy + u * s + v * c];
  const p = [rog(-a / 2, -b / 2), rog(a / 2, -b / 2), rog(a / 2, b / 2), rog(-a / 2, b / 2)];
  return [...p, p[0]];
}
const budynekGeo = (p: Pt[], t: Record<string, string>): GeoBuilding => ({ p, t });
const blokGeo = (p: Pt[], levels: number, extra: Record<string, string> = {}): GeoBuilding =>
  budynekGeo(p, { building: 'apartments', 'building:levels': String(levels), ...extra });
const mapa = (b: GeoBuilding[], poi: GeoPoi[] = [], c: [number, number] = [52, 21]): Geo => ({
  c,
  b,
  r: [],
  a: [],
  w: [],
  poi,
});

/** Gotowy budynek do funkcji, które biorą `Budynek` wprost. */
const bud = (nad: Partial<Budynek> = {}): Budynek => ({
  klucz: 'test',
  lat: 54.4,
  lon: 18.6,
  rejon: '',
  typ: 'blok',
  kondygnacje: 5,
  pole: 500,
  szerokosc: 12,
  dlugosc: 40,
  klatki: 2,
  ...nad,
});
const klucze = (n: number, prefiks = 'k'): string[] => Array.from({ length: n }, (_, i) => `${prefiks}${i}`);

// ---------------------------------------------------------------- demo

describe('budynkiZGeo na demach', () => {
  const przymorze = budynkiZGeo(demo('przymorze'), gdansk, kraj);
  const lanciego = budynkiZGeo(demo('lanciego'), ursynow, kraj);
  const wiesz = budynkiZGeo(demo('zielonki'), zielonki, kraj);

  it('żaden blok od 9 kondygnacji nie jest przedwojenny (Przymorze, Ursynów)', () => {
    for (const lista of [przymorze, lanciego]) {
      const wysokie = lista.filter((b) => b.typ === 'blok' && b.kondygnacje >= 9);
      expect(wysokie.length).toBeGreaterThan(5);
      expect(wysokie.filter((b) => b.epoka === 'przedwojenna').map((b) => `${b.klucz} ${b.kondygnacje}`)).toEqual([]);
    }
  });

  it('Przymorze: żaden budynek mieszkalny nie ma 0 mieszkań, a największy blok ma co najmniej 150', () => {
    expect(przymorze.length).toBeGreaterThan(20);
    for (const b of przymorze) expect(b.mieszkania, b.klucz).toBeGreaterThanOrEqual(1);
    const bloki = przymorze.filter((b) => b.typ === 'blok');
    expect(Math.max(...bloki.map((b) => b.mieszkania ?? 0))).toBeGreaterThanOrEqual(150);
  });

  it('Zielonki: ponad 80% budynków to domy z 1 albo 2 mieszkaniami', () => {
    const domy = wiesz.filter((b) => b.typ === 'dom' && (b.mieszkania === 1 || b.mieszkania === 2));
    expect(wiesz.length).toBeGreaterThan(50);
    expect(domy.length / wiesz.length).toBeGreaterThan(0.8);
  });

  it('każdy budynek ma epokę, mieszkania, klatki, wymiary i klucz z geograficznym środkiem', () => {
    for (const b of [...przymorze, ...lanciego, ...wiesz]) {
      expect(EPOKI, b.klucz).toContain(b.epoka);
      expect(Number.isInteger(b.mieszkania), b.klucz).toBe(true);
      expect(b.klatki, b.klucz).toBeGreaterThanOrEqual(1);
      expect(b.szerokosc, b.klucz).toBeGreaterThan(0);
      expect(b.dlugosc, b.klucz).toBeGreaterThanOrEqual(b.szerokosc);
      expect(b.pole, b.klucz).toBeGreaterThanOrEqual(3);
      expect(b.kondygnacje, b.klucz).toBeGreaterThanOrEqual(1);
      expect(b.klucz, b.klucz).toMatch(/^g:\d+\.\d{5},\d+\.\d{5},\d+$/);
    }
  });

  it('współrzędne leżą w pobliżu adresu dema (ten sam kraj, kilkaset metrów)', () => {
    for (const [nazwa, wynik] of [
      ['przymorze', przymorze],
      ['lanciego', lanciego],
      ['zielonki', wiesz],
    ] as const) {
      const [lat0, lon0] = demo(nazwa).c;
      for (const b of wynik) {
        expect(Math.abs(b.lat - lat0), `${nazwa} ${b.klucz}`).toBeLessThan(0.01);
        expect(Math.abs(b.lon - lon0), `${nazwa} ${b.klucz}`).toBeLessThan(0.015);
      }
    }
  });

  it('klucze są różne w obrębie jednej mapy', () => {
    for (const wynik of [przymorze, lanciego, wiesz]) {
      expect(new Set(wynik.map((b) => b.klucz)).size).toBe(wynik.length);
    }
  });

  it('rejon budynku to rejon jego środka według rejonDla; bez gminy rejon jest pusty', () => {
    for (const b of przymorze) expect(b.rejon, b.klucz).toBe(rejonDla(gdansk, b.lat, b.lon).rejon);
    expect(przymorze.filter((b) => b.rejon !== '').length / przymorze.length).toBeGreaterThan(0.9);
    for (const b of budynkiZGeo(demo('przymorze'), null, kraj)) expect(b.rejon).toBe('');
  });

  it('dwa wywołania dają te same klucze, epoki i mieszkania; kolejność budynków na wejściu nie ma znaczenia', () => {
    const geo = demo('lanciego');
    const a = budynkiZGeo(geo, ursynow, kraj);
    const b = budynkiZGeo(geo, ursynow, kraj);
    expect(b).toEqual(a);
    const odwrocona = budynkiZGeo({ ...geo, b: [...geo.b].reverse() }, ursynow, kraj);
    const wg = (l: Budynek[]) => Object.fromEntries(l.map((x) => [x.klucz, `${x.epoka}|${x.mieszkania}|${x.klatki}`]));
    expect(wg(odwrocona)).toEqual(wg(a));
  });

  it('bez gminy też działa: każdy budynek ma epokę i mieszkania z wag krajowych', () => {
    const wynik = budynkiZGeo(demo('przymorze'), null, kraj);
    expect(wynik.length).toBe(przymorze.length);
    for (const b of wynik) {
      expect(EPOKI).toContain(b.epoka);
      expect(b.mieszkania).toBeGreaterThanOrEqual(1);
    }
  });

  // test czasu tylko z ZM_PERF=1: pod równoległym obciążeniem vitest mierzy zegar ściany, nie kod
  // (npm run mieszkancy zawsze wypisuje czasy)
  it.skipIf(!process.env.ZM_PERF)(
    'całe demo generuje się szybko (budynki to tylko mały kawałek budżetu 200 ms)',
    () => {
      const t0 = performance.now();
      budynkiZGeo(demo('lanciego'), ursynow, kraj);
      expect(performance.now() - t0).toBeLessThan(1500);
    },
  );
});

// ---------------------------------------------------------------- dwa adresy w okolicy

describe('ten sam budynek z dwóch adresów (warunek kroku 5)', () => {
  // Importery mapy zaokrąglają wierzchołki do 0,5 m względem środka mapy, więc klucz `g:…` (środek i pole) zależy od
  // adresu. Zmierzone 18.10.2026 na kafelkach z tests/fixtures/mvt (adres dema i punkt 40 m na północny wschód,
  // budynki do 150 m od adresu, para to najbliższy środek obrysu w 2 m): Przymorze 4 budynki, 3 pary, ten sam klucz
  // 0, te same mieszkania 0, ta sama epoka 0; Ursynów 19, 19, 0, 7, 9; Batowice 17, 17, 3, 14, 8. Kafelki nie niosą
  // id budynków. Test zacznie przechodzić, gdy importer da kanoniczne id i geometrię budynku (krok 5); wtedy trzeba
  // zdjąć `it.fails`.
  const GMINY: Record<string, TabeleGminy> = { przymorze: gdansk, lanciego: ursynow, zielonki };
  const ODLEGLOSC = 150;

  it.fails('budynki do 150 m od adresu mają przy adresie 40 m dalej ten sam klucz, mieszkania i epokę', () => {
    for (const a of ADDRESSES) {
      const tiles = decodedTiles(a);
      const g = GMINY[a.key];
      const tu = budynkiZGeo(toGeoT(tiles, a.lat, a.lon, LOAD_RADIUS), g, kraj);
      const obok = new Map(
        budynkiZGeo(toGeoT(tiles, a.lat + 0.0003, a.lon + 0.0004, LOAD_RADIUS), g, kraj).map((b) => [b.klucz, b]),
      );
      const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
      const blisko = tu.filter((b) => {
        const x = (b.lon - a.lon) * kx;
        const y = (a.lat - b.lat) * 110574;
        return x * x + y * y <= ODLEGLOSC * ODLEGLOSC;
      });
      expect(blisko.length, a.key).toBeGreaterThan(3);
      for (const b of blisko) {
        const drugi = obok.get(b.klucz);
        expect(drugi, `${a.key} ${b.klucz}`).toBeDefined();
        expect(drugi?.mieszkania, b.klucz).toBe(b.mieszkania);
        expect(drugi?.epoka, b.klucz).toBe(b.epoka);
      }
    }
  });
});

// ---------------------------------------------------------------- klasy i filtr

describe('które budynki trafiają do wyniku', () => {
  it('blok i dom tak, sklep, hala, garaż i szkoła nie', () => {
    const geo = mapa([
      blokGeo(prostokat(0, 0, 60, 12), 5),
      budynekGeo(prostokat(100, 0, 10, 10), { building: 'house', 'building:levels': '2' }),
      budynekGeo(prostokat(200, 0, 30, 20), { building: 'retail' }),
      budynekGeo(prostokat(300, 0, 40, 30), { building: 'industrial' }),
      budynekGeo(prostokat(400, 0, 5, 5), { building: 'garage' }),
      budynekGeo(prostokat(500, 0, 30, 20), { building: 'school' }),
    ]);
    const wynik = budynkiZGeo(geo, gdansk, kraj);
    expect(wynik.map((b) => b.typ)).toEqual(['blok', 'dom']);
  });

  it('obrys mniejszy niż 3 m² jest pomijany', () => {
    const geo = mapa([budynekGeo(prostokat(0, 0, 1, 1), { building: 'house' })]);
    expect(budynkiZGeo(geo, gdansk, kraj)).toEqual([]);
  });

  it('punkt szkoły w budynku z map zgadywanych (kafelki) wyklucza go, punkt daleko nie', () => {
    const zgadywany = (p: Pt[]) => budynekGeo(p, { building: 'yes', guess: '1', 'building:levels': '4' });
    const szkola = (x: number, y: number): GeoPoi => ({ x, y, c: 'szkola', n: 'Szkoła' });
    const p = prostokat(0, 0, 40, 20); // 800 m², 4 kondygnacje: bez punktów to blok
    expect(budynkiZGeo(mapa([zgadywany(p)]), gdansk, kraj).map((b) => b.typ)).toEqual(['blok']);
    expect(budynkiZGeo(mapa([zgadywany(p)], [szkola(20, 10)]), gdansk, kraj)).toEqual([]);
    expect(budynkiZGeo(mapa([zgadywany(p)], [szkola(20, 25)]), gdansk, kraj)).toEqual([]); // 5 m od ściany
    expect(budynkiZGeo(mapa([zgadywany(p)], [szkola(20, 40)]), gdansk, kraj).map((b) => b.typ)).toEqual(['blok']);
  });
});

// ---------------------------------------------------------------- klucz, środek, współrzędne

describe('klucz i współrzędne', () => {
  it('bez tagu id klucz to środek obrysu w stopniach (5 miejsc) i pole', () => {
    const [b] = budynkiZGeo(mapa([blokGeo(prostokat(-10, -10, 20, 20), 4)]), gdansk, kraj);
    expect(b.klucz).toBe('g:52.00000,21.00000,400');
    expect(b.lat).toBe(52);
    expect(b.lon).toBe(21);
    expect(b.pole).toBe(400);
  });

  it('x rośnie na wschód, y na południe: 200 m na wschód i 300 m na północ od adresu', () => {
    const [b] = budynkiZGeo(mapa([blokGeo(prostokat(190, -310, 20, 20), 4)]), gdansk, kraj);
    expect(b.klucz).toBe('g:52.00271,21.00292,400');
    expect(b.lat).toBe(52.00271);
    expect(b.lon).toBe(21.00292);
  });

  it('tag id daje klucz osm:<id>; w sklejonym budynku wygrywa id największego segmentu', () => {
    const [jeden] = budynkiZGeo(mapa([blokGeo(prostokat(0, 0, 20, 12), 5, { id: '123456' })]), gdansk, kraj);
    expect(jeden.klucz).toBe('osm:123456');
    const [dwa] = budynkiZGeo(
      mapa([blokGeo(prostokat(0, 0, 20, 12), 5, { id: '1' }), blokGeo(prostokat(20, 0, 40, 12), 5, { id: '2' })]),
      gdansk,
      kraj,
    );
    expect(dwa.klucz).toBe('osm:2');
  });

  it('identyczne obrysy dostają różne klucze (druga kopia ma przyrostek)', () => {
    const p = prostokat(0, 0, 20, 12);
    const geo = mapa([budynekGeo(p, { building: 'house' }), budynekGeo(p, { building: 'house' })]);
    const wynik = budynkiZGeo(geo, gdansk, kraj);
    expect(wynik.length).toBe(2);
    expect(new Set(wynik.map((b) => b.klucz)).size).toBe(2);
  });
});

// ---------------------------------------------------------------- szerokość, długość

describe('szerokość i długość (najmniejszy obrócony prostokąt)', () => {
  it('prostokąt 12 × 55 m', () => {
    const [b] = budynkiZGeo(mapa([blokGeo(prostokat(0, 0, 55, 12), 5)]), gdansk, kraj);
    expect(b.szerokosc).toBe(12);
    expect(b.dlugosc).toBe(55);
    expect(b.pole).toBe(660);
  });

  it('obrót nie zmienia wymiarów: 10 × 40 m pod kątem 30 i 77 stopni', () => {
    for (const kat of [30, 77, 135]) {
      const [b] = budynkiZGeo(mapa([blokGeo(obrocony(50, -20, 10, 40, kat), 5)]), gdansk, kraj);
      expect(b.szerokosc, `kąt ${kat}`).toBeCloseTo(10, 1);
      expect(b.dlugosc, `kąt ${kat}`).toBeCloseTo(40, 1);
    }
  });

  it('trapez (podstawy 40 i 20 m, wysokość 10 m) pod różnymi kątami: 10 × 40, czyli prostokąt wzdłuż podstawy', () => {
    for (const kat of [0, 10, 50, 100, 170, 250, 300]) {
      const k = (kat * Math.PI) / 180;
      const obrot = ([x, y]: Pt): Pt => [
        x * Math.cos(k) - y * Math.sin(k) + 70,
        x * Math.sin(k) + y * Math.cos(k) - 30,
      ];
      const trapez = (
        [
          [0, 0],
          [40, 0],
          [30, 10],
          [10, 10],
          [0, 0],
        ] as Pt[]
      ).map(obrot);
      const [b] = budynkiZGeo(mapa([blokGeo(trapez, 4)]), gdansk, kraj);
      expect(b.szerokosc, `kąt ${kat}`).toBeCloseTo(10, 1);
      expect(b.dlugosc, `kąt ${kat}`).toBeCloseTo(40, 1);
      expect(b.pole, `kąt ${kat}`).toBe(300);
    }
  });

  it('obrys w kształcie litery L mierzy się najmniejszym prostokątem, nie bokiem wejściowym', () => {
    // 30 × 30 z wyciętym rogiem 20 × 20: prostokąt obejmujący ma 30 × 30
    const L: Pt[] = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 30],
      [0, 30],
      [0, 0],
    ];
    const [b] = budynkiZGeo(mapa([blokGeo(L, 4)]), gdansk, kraj);
    expect(b.szerokosc).toBe(30);
    expect(b.dlugosc).toBe(30);
    expect(b.pole).toBe(500);
  });
});

// ---------------------------------------------------------------- sklejanie segmentów i klatki

describe('sklejanie segmentów w jeden budynek', () => {
  const segment = (x: number, levels: number, szer = 20, y = 0) => blokGeo(prostokat(x, y, szer, 12), levels);

  it('trzy segmenty dzielące krawędź to jeden budynek z trzema klatkami', () => {
    const wynik = budynkiZGeo(mapa([segment(0, 5), segment(20, 5), segment(40, 6)]), gdansk, kraj);
    expect(wynik.length).toBe(1);
    const [b] = wynik;
    expect(b.klatki).toBe(3);
    expect(b.dlugosc).toBe(60);
    expect(b.szerokosc).toBe(12);
    expect(b.pole).toBe(720);
    expect(b.kondygnacje).toBe(5);
  });

  it('szczelina 0,5 m skleja, 1,5 m nie', () => {
    expect(budynkiZGeo(mapa([segment(0, 5), segment(20.5, 5)]), gdansk, kraj).length).toBe(1);
    expect(budynkiZGeo(mapa([segment(0, 5), segment(21.5, 5)]), gdansk, kraj).length).toBe(2);
  });

  it('wysokość różna o jedną kondygnację skleja, o dwie nie', () => {
    expect(budynkiZGeo(mapa([segment(0, 5), segment(20, 6)]), gdansk, kraj).length).toBe(1);
    expect(budynkiZGeo(mapa([segment(0, 5), segment(20, 7)]), gdansk, kraj).length).toBe(2);
  });

  it('sklejony blok bierze do reguł płyty medianę szerokości segmentów, nie szerokość całego obrysu', () => {
    // litera L z dwóch segmentów 60 × 12 m, 11 kondygnacji: cały obrys ma 60 m szerokości, segmenty po 12 m
    const litera = (c: [number, number]) =>
      budynkiZGeo(
        mapa([blokGeo(prostokat(0, 0, 60, 12), 11), blokGeo(prostokat(0, 12, 12, 48), 11)], [], c),
        null,
        kraj,
      );
    for (let i = 0; i < 40; i++) {
      const wynik = litera([52 + i / 1000, 21 + i / 1000]);
      expect(wynik.length).toBe(1);
      expect(wynik[0].szerokosc).toBeGreaterThan(14.5);
      expect(wynik[0].epoka, wynik[0].klucz).toBe('plyta');
    }
    // trzy segmenty 5 kondygnacji po 22 × 12 m w rzędzie i czwarty 22 × 12 m w poprzek: obrys 66 × 34 m,
    // mediana szerokości 12 m, długość 66 m ≥ 3 × 12 m, więc płyta z reguły pięciokondygnacyjnej
    const rzad = (c: [number, number]) =>
      budynkiZGeo(
        mapa(
          [
            blokGeo(prostokat(0, 0, 22, 12), 5),
            blokGeo(prostokat(22, 0, 22, 12), 5),
            blokGeo(prostokat(44, 0, 22, 12), 5),
            blokGeo(prostokat(54, 12, 12, 22), 5),
          ],
          [],
          c,
        ),
        null,
        kraj,
      );
    for (let i = 0; i < 40; i++) {
      const wynik = rzad([52 + i / 1000, 21 + i / 1000]);
      expect(wynik.length).toBe(1);
      expect(wynik[0].szerokosc).toBeGreaterThan(14.5);
      expect(wynik[0].epoka, wynik[0].klucz).toBe('plyta');
    }
  });

  it('kolejność segmentów na wejściu nie zmienia wyniku (A–B–C połączone przez B)', () => {
    const a = budynkiZGeo(mapa([segment(0, 5), segment(40, 5), segment(20, 5)]), gdansk, kraj);
    expect(a.length).toBe(1);
    expect(a[0].klatki).toBe(3);
  });

  it('segmenty rozłączne dalej niż metr zostają osobnymi budynkami z jedną klatką', () => {
    const wynik = budynkiZGeo(mapa([segment(0, 5), segment(100, 5)]), gdansk, kraj);
    expect(wynik.map((b) => b.klatki)).toEqual([1, 1]);
  });

  it('zachodzące na siebie obrysy (jeden w drugim) też się sklejają', () => {
    const wynik = budynkiZGeo(
      mapa([blokGeo(prostokat(0, 0, 40, 40), 5), blokGeo(prostokat(10, 10, 5, 5), 5)]),
      gdansk,
      kraj,
    );
    expect(wynik.length).toBe(1);
  });

  it('pojedynczy blok: klatki to max(1, round(długość / 20))', () => {
    const klatki = (dl: number) => budynkiZGeo(mapa([blokGeo(prostokat(0, 0, dl, 12), 5)]), gdansk, kraj)[0].klatki;
    expect(klatki(8)).toBe(1);
    expect(klatki(25)).toBe(1);
    expect(klatki(30)).toBe(2); // 1,5 zaokrągla się w górę
    expect(klatki(55)).toBe(3);
    expect(klatki(100)).toBe(5);
  });

  it('domy nie sklejają się nawet we wspólnej ścianie (szeregówka to osobne gospodarstwa) i mają jedną klatkę', () => {
    const dom = (x: number) => budynekGeo(prostokat(x, 0, 8, 10), { building: 'house', 'building:levels': '2' });
    const wynik = budynkiZGeo(mapa([dom(0), dom(8), dom(16)]), gdansk, kraj);
    expect(wynik.length).toBe(3);
    for (const b of wynik) expect(b.klatki).toBe(1);
    const dlugi = budynkiZGeo(mapa([budynekGeo(prostokat(0, 0, 70, 10), { building: 'terrace' })]), gdansk, kraj);
    expect(dlugi[0].klatki).toBe(1);
  });

  it('części budynku z `pp` liczą się do pola i długości', () => {
    const b: GeoBuilding = {
      p: prostokat(0, 0, 20, 12),
      pp: [prostokat(20, 0, 20, 12)],
      t: { building: 'apartments', 'building:levels': '5' },
    };
    const [wynik] = budynkiZGeo(mapa([b]), gdansk, kraj);
    expect(wynik.pole).toBe(480);
    expect(wynik.dlugosc).toBe(40);
  });
});

// ---------------------------------------------------------------- data budowy

describe('rokZDaty i epokaZRoku', () => {
  it('czyta rok z typowych zapisów start_date', () => {
    expect(rokZDaty('1975')).toBe(1975);
    expect(rokZDaty('1975-06')).toBe(1975);
    expect(rokZDaty('1975-06-12')).toBe(1975);
    expect(rokZDaty('~1975')).toBe(1975);
    expect(rokZDaty('1970s')).toBe(1970);
    expect(rokZDaty('1974..1976')).toBe(1974);
    expect(rokZDaty(' 1988 ')).toBe(1988);
    expect(rokZDaty('2021')).toBe(2021);
  });

  it('nieczytelne zapisy dają undefined', () => {
    for (const s of ['', 'yes', 'C19', 'przed wojną', '75', '19750', '12345678']) {
      expect(rokZDaty(s), s).toBeUndefined();
    }
  });

  it('granice epok jak w tabelach: 1944/1945, 1970/1971, 1988/1989, 2011/2012', () => {
    const ocz: [number, Epoka][] = [
      [1850, 'przedwojenna'],
      [1944, 'przedwojenna'],
      [1945, 'powojenna'],
      [1970, 'powojenna'],
      [1971, 'plyta'],
      [1988, 'plyta'],
      [1989, 'transformacja'],
      [2011, 'transformacja'],
      [2012, 'nowa'],
      [2024, 'nowa'],
    ];
    for (const [rok, epoka] of ocz) expect(epokaZRoku(rok), String(rok)).toBe(epoka);
  });

  it('start_date z tagów budynku ustawia startDate i epokę mimo reguł z wymiarów', () => {
    const geo = mapa([blokGeo(prostokat(0, 0, 60, 12), 11, { start_date: '1995' })]);
    const [b] = budynkiZGeo(geo, gdansk, kraj);
    expect(b.startDate).toBe(1995);
    expect(b.epoka).toBe('transformacja');
  });

  it('nieczytelny start_date jest ignorowany', () => {
    const [b] = budynkiZGeo(mapa([blokGeo(prostokat(0, 0, 60, 12), 11, { start_date: 'dawno' })]), gdansk, kraj);
    expect(b.startDate).toBeUndefined();
    expect(b.epoka).toBe('plyta');
  });

  it('w sklejonym budynku data pochodzi z największego segmentu, który ją ma', () => {
    const geo = mapa([
      blokGeo(prostokat(0, 0, 20, 12), 5, { start_date: '1930' }),
      blokGeo(prostokat(20, 0, 40, 12), 5, { start_date: '1980' }),
      blokGeo(prostokat(60, 0, 50, 12), 5),
    ]);
    const [b] = budynkiZGeo(geo, gdansk, kraj);
    expect(b.startDate).toBe(1980);
  });
});

// ---------------------------------------------------------------- epoka

describe('epokaBudynku', () => {
  it('sztuczny blok 11 kondygnacji i szerokości 12 m to wielka płyta, niezależnie od ziarna', () => {
    const [b] = budynkiZGeo(mapa([blokGeo(prostokat(0, 0, 60, 12), 11)]), gdansk, kraj);
    expect(b.epoka).toBe('plyta');
    for (const k of klucze(200))
      expect(epokaBudynku(bud({ klucz: k, kondygnacje: 11, szerokosc: 12 }), gdansk)).toBe('plyta');
  });

  it('10 i 12 kondygnacji i szerokość 14,5 m to płyta, 9 i 13 kondygnacji albo 14,6 m już nie z reguły', () => {
    for (const kond of [10, 12]) {
      for (const k of klucze(100))
        expect(epokaBudynku(bud({ klucz: k, kondygnacje: kond, szerokosc: 14.5 }), gdansk)).toBe('plyta');
    }
    for (const nad of [{ kondygnacje: 9 }, { kondygnacje: 13 }, { kondygnacje: 11, szerokosc: 14.6 }]) {
      const epoki = new Set(klucze(300).map((k) => epokaBudynku(bud({ klucz: k, ...nad }), gdansk)));
      expect(epoki.size, JSON.stringify(nad)).toBeGreaterThan(1);
    }
  });

  it('5 kondygnacji, wąski i długi (długość ≥ 3 × szerokość) to płyta; krótszy albo szerszy losuje', () => {
    for (const k of klucze(100)) {
      expect(epokaBudynku(bud({ klucz: k, kondygnacje: 5, szerokosc: 12, dlugosc: 36 }), gdansk)).toBe('plyta');
      expect(epokaBudynku(bud({ klucz: k, kondygnacje: 5, szerokosc: 14.5, dlugosc: 43.5 }), gdansk)).toBe('plyta');
    }
    for (const nad of [{ dlugosc: 35 }, { szerokosc: 15, dlugosc: 60 }, { kondygnacje: 4, dlugosc: 60 }]) {
      const epoki = new Set(klucze(300).map((k) => epokaBudynku(bud({ klucz: k, ...nad }), gdansk)));
      expect(epoki.size, JSON.stringify(nad)).toBeGreaterThan(1);
    }
  });

  it('reguły z wymiarów dotyczą tylko bloków; dom wysoki i wąski losuje', () => {
    const epoki = new Set(
      klucze(300).map((k) => epokaBudynku(bud({ klucz: k, typ: 'dom', kondygnacje: 11, szerokosc: 12 }), gdansk)),
    );
    expect(epoki.size).toBeGreaterThan(1);
  });

  it('startDate ma pierwszeństwo przed regułami z wymiarów', () => {
    expect(epokaBudynku(bud({ kondygnacje: 11, szerokosc: 12, startDate: 2015 }), gdansk)).toBe('nowa');
    expect(epokaBudynku(bud({ kondygnacje: 11, szerokosc: 12, startDate: 1930 }), null)).toBe('przedwojenna');
  });

  it('losowanie jest stałe dla klucza i zależy od klucza', () => {
    const a = bud({ klucz: 'osm:1', dlugosc: 20, kondygnacje: 4 });
    expect(epokaBudynku(a, gdansk)).toBe(epokaBudynku({ ...a }, gdansk));
    const wszystkie = new Set(klucze(300).map((k) => epokaBudynku(bud({ klucz: k, kondygnacje: 4 }), gdansk)));
    expect(wszystkie.size).toBe(5);
  });

  const udzialy = (g: TabeleGminy | null, n = 6000): Record<Epoka, number> => {
    const licznik = Object.fromEntries(EPOKI.map((e) => [e, 0])) as Record<Epoka, number>;
    for (const k of klucze(n, 'ep')) licznik[epokaBudynku(bud({ klucz: k, typ: 'dom', kondygnacje: 2 }), g)]++;
    for (const e of EPOKI) licznik[e] /= n;
    return licznik;
  };

  it('z tabelą gminy udziały epok idą za mieszkaniami z P4386, znormalizowanymi do sumy epok', () => {
    for (const g of [gdansk, ursynow, zielonki]) {
      const suma = EPOKI.reduce((s, e) => s + g.epoki[e].mieszkania, 0);
      const u = udzialy(g);
      for (const e of EPOKI)
        expect(Math.abs(u[e] - g.epoki[e].mieszkania / suma), `${g.nazwa} ${e}`).toBeLessThan(0.03);
    }
  });

  it('bez gminy udziały idą za krajową tablicą NSP dla miast: 14,6 / 20,6 / 31,9 / 22,8 / 10,1 %', () => {
    const u = udzialy(null);
    const oczekiwane: Record<Epoka, number> = {
      przedwojenna: 0.146,
      powojenna: 0.206,
      plyta: 0.319,
      transformacja: 0.228,
      nowa: 0.101,
    };
    for (const e of EPOKI) expect(Math.abs(u[e] - oczekiwane[e]), e).toBeLessThan(0.03);
  });

  /** Epoki punktowca `kond` kondygnacji, 22 × 22 m (za szeroki na regułę płyty), dla `n` kluczy. */
  const epokiPunktowca = (g: TabeleGminy | null, kond: number, n = 400): Set<Epoka> =>
    new Set(
      klucze(n, `p${kond}-`).map((k) =>
        epokaBudynku(bud({ klucz: k, kondygnacje: kond, szerokosc: 22, dlugosc: 22, pole: 484 }), g),
      ),
    );

  it('wysokość ogranicza losowanie: od 7 kondygnacji nie ma przedwojennej, od 13 także powojennej', () => {
    for (const g of [gdansk, ursynow, zielonki, null]) {
      const opis = g?.nazwa ?? 'bez gminy';
      for (const kond of [7, 8, 9, 11, 12]) {
        const e = epokiPunktowca(g, kond);
        expect(e.has('przedwojenna'), `${opis} ${kond}`).toBe(false);
        expect(e.size, `${opis} ${kond}`).toBeGreaterThan(1);
      }
      for (const kond of [13, 16, 25]) {
        const e = epokiPunktowca(g, kond);
        expect(e.has('przedwojenna'), `${opis} ${kond}`).toBe(false);
        expect(e.has('powojenna'), `${opis} ${kond}`).toBe(false);
      }
    }
    // niżej losowanie zostaje takie jak było: kamienica bywa przedwojenna
    expect(epokiPunktowca(gdansk, 6).has('przedwojenna')).toBe(true);
    expect(epokiPunktowca(null, 6).has('przedwojenna')).toBe(true);
  });

  it('punktowiec 11 kondygnacji i 22 m nigdy nie jest przedwojenny, a 14 kondygnacji ani przedwojenny, ani powojenny', () => {
    for (const g of [gdansk, ursynow, zielonki, null]) {
      expect([...epokiPunktowca(g, 11, 2000)].sort()).toEqual(['nowa', 'plyta', 'powojenna', 'transformacja']);
      expect([...epokiPunktowca(g, 14, 2000)].sort()).toEqual(['nowa', 'plyta', 'transformacja']);
    }
  });

  it('poza wysokością reszta wag idzie za gminą: udziały 11-kondygnacyjnych to wagi bez przedwojennej', () => {
    const n = 6000;
    const licznik = Object.fromEntries(EPOKI.map((e) => [e, 0])) as Record<Epoka, number>;
    for (const k of klucze(n, 'u'))
      licznik[epokaBudynku(bud({ klucz: k, kondygnacje: 11, szerokosc: 22, dlugosc: 22 }), gdansk)]++;
    const bez = EPOKI.filter((e) => e !== 'przedwojenna');
    const suma = bez.reduce((s, e) => s + gdansk.epoki[e].mieszkania, 0);
    for (const e of bez) expect(Math.abs(licznik[e] / n - gdansk.epoki[e].mieszkania / suma), e).toBeLessThan(0.03);
  });

  it('gmina z mieszkaniami tylko w dawnych epokach: 9-12 kondygnacji to płyta, od 13 transformacja albo nowa', () => {
    const zera = Object.fromEntries(EPOKI.map((e) => [e, { mieszkania: 0, osoby: 0 }])) as TabeleGminy['epoki'];
    const stara = { ...gdansk, epoki: { ...zera, przedwojenna: { mieszkania: 500, osoby: 900 } } };
    const stareIPowojenne = { ...stara, epoki: { ...stara.epoki, powojenna: { mieszkania: 300, osoby: 600 } } };
    for (const kond of [9, 11, 12]) expect([...epokiPunktowca(stara, kond)], String(kond)).toEqual(['plyta']);
    for (const g of [stara, stareIPowojenne]) {
      expect([...epokiPunktowca(g, 14, 1000)].sort()).toEqual(['nowa', 'transformacja']);
    }
    // 7-8 kondygnacji bez dozwolonej wagi gminy: wagi krajowe bez przedwojennej
    expect([...epokiPunktowca(stara, 8, 1000)].sort()).toEqual(['nowa', 'plyta', 'powojenna', 'transformacja']);
    // powojenna z gminy zostaje dla 9-12 kondygnacji, bo jest dozwolona
    expect([...epokiPunktowca(stareIPowojenne, 11)]).toEqual(['powojenna']);
  });

  it('gmina z samymi zerami w epokach spada na wagi krajowe, nie rzuca', () => {
    const zera = {
      ...gdansk,
      epoki: Object.fromEntries(EPOKI.map((e) => [e, { mieszkania: 0, osoby: 0 }])) as TabeleGminy['epoki'],
    };
    expect(EPOKI).toContain(epokaBudynku(bud({ klucz: 'x', typ: 'dom' }), zera));
  });
});

// ---------------------------------------------------------------- mieszkania

describe('mieszkaniaBudynku', () => {
  it('dom ma 1 albo 2 mieszkania; udział dwóch to udział gospodarstw trzypokoleniowych dla miast', () => {
    const miasto = klucze(8000, 'd').map((k) =>
      mieszkaniaBudynku(bud({ klucz: k, typ: 'dom', kondygnacje: 2 }), gdansk, kraj),
    );
    expect(new Set(miasto)).toEqual(new Set([1, 2]));
    const udzial = miasto.filter((m) => m === 2).length / miasto.length;
    expect(Math.abs(udzial - kraj.trojpokoleniowe.miasta / 10000)).toBeLessThan(0.015);
  });

  it('dom na wsi: udział dwóch to udział trzypokoleniowych dla wsi, więc większy niż w mieście', () => {
    const wies = { ...zielonki, miejska: false };
    const m = klucze(8000, 'd').map((k) =>
      mieszkaniaBudynku(bud({ klucz: k, typ: 'dom', kondygnacje: 2 }), wies, kraj),
    );
    const udzial = m.filter((x) => x === 2).length / m.length;
    expect(Math.abs(udzial - kraj.trojpokoleniowe.wies / 10000)).toBeLessThan(0.02);
    expect(kraj.trojpokoleniowe.wies).toBeGreaterThan(kraj.trojpokoleniowe.miasta);
  });

  it('bez gminy dom liczy się jak w mieście', () => {
    const m = klucze(8000, 'd').map((k) =>
      mieszkaniaBudynku(bud({ klucz: k, typ: 'dom', kondygnacje: 2 }), null, kraj),
    );
    const udzial = m.filter((x) => x === 2).length / m.length;
    expect(Math.abs(udzial - kraj.trojpokoleniowe.miasta / 10000)).toBeLessThan(0.015);
  });

  it('blok: round(pole × kondygnacje × 0,72 / metraż epoki)', () => {
    // Gdańsk, płyta: metraż 54 → 1000 · 5 · 0,72 / 54 = 66,67 → 67
    expect(mieszkaniaBudynku(bud({ pole: 1000, kondygnacje: 5, epoka: 'plyta' }), gdansk, kraj)).toBe(67);
    // Gdańsk, powojenna: metraż 48 → 1000 · 5 · 0,72 / 48 = 75
    expect(mieszkaniaBudynku(bud({ pole: 1000, kondygnacje: 5, epoka: 'powojenna' }), gdansk, kraj)).toBe(75);
    // Zielonki mają własny metraż, więc wynik jest inny niż w Gdańsku
    expect(mieszkaniaBudynku(bud({ pole: 1000, kondygnacje: 5, epoka: 'plyta' }), zielonki, kraj)).toBe(
      Math.round((1000 * 5 * 0.72) / zielonki.metraz.plyta),
    );
  });

  it('blok bez gminy bierze krajowy metraż miast: płyta 60 m²', () => {
    // 1000 · 5 · 0,72 / 60 = 60
    expect(mieszkaniaBudynku(bud({ pole: 1000, kondygnacje: 5, epoka: 'plyta' }), null, kraj)).toBe(60);
    // nowa 76 m²: 1000 · 5 · 0,72 / 76 = 47,37 → 47
    expect(mieszkaniaBudynku(bud({ pole: 1000, kondygnacje: 5, epoka: 'nowa' }), null, kraj)).toBe(47);
  });

  it('blok bez ustawionej epoki liczy ją sam, tak samo jak epokaBudynku', () => {
    const b = bud({ klucz: 'osm:77', pole: 1000, kondygnacje: 4, dlugosc: 20 });
    const z = mieszkaniaBudynku(b, gdansk, kraj);
    expect(z).toBe(mieszkaniaBudynku({ ...b, epoka: epokaBudynku(b, gdansk) }, gdansk, kraj));
  });

  it('blok ma co najmniej 2 mieszkania i co najwyżej 400', () => {
    expect(mieszkaniaBudynku(bud({ pole: 20, kondygnacje: 1, epoka: 'plyta' }), gdansk, kraj)).toBe(2);
    expect(mieszkaniaBudynku(bud({ pole: 200000, kondygnacje: 10, epoka: 'plyta' }), gdansk, kraj)).toBe(400);
  });

  it('sztuczny obrys 20 000 m² z building=apartments i 3 kondygnacjami ma najwyżej 400 mieszkań', () => {
    for (const g of [gdansk, ursynow, zielonki, null]) {
      const [b] = budynkiZGeo(mapa([blokGeo(prostokat(0, 0, 100, 200), 3)]), g, kraj);
      if (g === gdansk) expect(b.mieszkania).toBe(400); // 20 000 · 3 · 0,72 / metraż (≤ 74 m²) to ponad 580
      expect(b.pole).toBe(20000);
      expect(b.mieszkania).toBeLessThanOrEqual(400);
      expect(b.mieszkania).toBeGreaterThanOrEqual(2);
    }
  });

  it('metraż zero w tabeli nie daje dzielenia przez zero', () => {
    const zlaTabela = { ...gdansk, metraz: { ...gdansk.metraz, plyta: 0 } };
    const m = mieszkaniaBudynku(bud({ pole: 1000, kondygnacje: 5, epoka: 'plyta' }), zlaTabela, kraj);
    expect(Number.isFinite(m)).toBe(true);
    expect(m).toBe(60);
  });
});

// ---------------------------------------------------------------- złote wartości

describe('wartości przypięte do ziarna', () => {
  // Blok 800 m², 4 kondygnacje, 20 × 40 m (żadna reguła z wymiarów nie działa), więc epokę losuje ziarno z klucza.
  // Zmiana formatu klucza, nazw ziaren albo kolejności losowań zmienia wszystkie osiedla naraz; jeśli to zamierzone,
  // trzeba podbić WERSJA_GENERATORA, a te liczby przeliczyć.
  const blok = (klucz: string) => bud({ klucz, kondygnacje: 4, pole: 800, szerokosc: 20, dlugosc: 40 });

  it('epoka i mieszkania bloku w Gdańsku', () => {
    const ocz: [string, Epoka, number][] = [
      ['osm:1', 'nowa', 38],
      ['osm:2', 'powojenna', 48],
      ['osm:4', 'transformacja', 31],
      ['g:54.40877,18.59797,7790', 'plyta', 43],
    ];
    for (const [klucz, epoka, mieszkania] of ocz) {
      expect(epokaBudynku(blok(klucz), gdansk), klucz).toBe(epoka);
      expect(mieszkaniaBudynku(blok(klucz), gdansk, kraj), klucz).toBe(mieszkania);
    }
  });

  it('epoka bloku bez gminy (wagi krajowe)', () => {
    expect(epokaBudynku(blok('osm:1'), null)).toBe('transformacja');
    expect(epokaBudynku(blok('osm:4'), null)).toBe('plyta');
  });

  it('dom z drugim mieszkaniem', () => {
    const dom = (klucz: string) => mieszkaniaBudynku(bud({ klucz, typ: 'dom', kondygnacje: 2 }), gdansk, kraj);
    for (const klucz of ['osm:0', 'osm:6', 'osm:10', 'osm:26', 'osm:32']) expect(dom(klucz), klucz).toBe(2);
    for (const klucz of ['osm:1', 'osm:2', 'osm:3']) expect(dom(klucz), klucz).toBe(1);
  });
});

// ---------------------------------------------------------------- reguły modułu

describe('src/mieszkancy/budynki.ts i obrys.ts: tylko dozwolone funkcje Math', () => {
  const zrodlo = ['budynki.ts', 'obrys.ts']
    .map((p) => path.resolve(import.meta.dirname, '../../src/mieszkancy', p))
    .filter((p) => fs.existsSync(p))
    .map((p) =>
      fs
        .readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, ''),
    )
    .join('\n');

  it('bez sin, exp, log, pow, hypot i innych; cos tylko raz (przeliczenie metrów na stopnie)', () => {
    expect(zrodlo).not.toMatch(/Math\.(sin|exp|log|pow|hypot|tan|atan|atan2|asin|acos|cbrt|expm1|log1p)\b/);
    expect(zrodlo.match(/Math\.cos\b/g)?.length ?? 0).toBe(1);
    expect(zrodlo).not.toMatch(/\*\*/);
  });

  it('nie importuje z sim, ui, render ani gov', () => {
    expect(zrodlo).not.toMatch(/from '\.\.\/(sim|ui|render|gov)\//);
  });
});
