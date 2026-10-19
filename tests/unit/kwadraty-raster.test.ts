/* Rastrowanie z przesunięciem i wspólny rdzeń terenu (miasto z kwadratów, etap 1, zadanie 3): `fillRing`, `stampSegment`
   i `stampLine` z przesunięciem okna (ox, oy) oraz `rastrujTeren`, czyli kroki 1–5a z buildWorld (obszary, cieki,
   ścieżki, chodniki, jezdnie, budynki, przejścia przez budynki, woda blokuje) na oknie 384×384 przesuniętym o (ox, oy)
   metrów. Okno (0, 0) to świat domu; okna sąsiednich kwadratów mają przesunięcie o wielokrotność boku, a okno
   przesunięte o pół boku musi się zgadzać z połówkami dwóch sąsiednich: tak sprawdzamy szwy. */

import { describe, expect, it } from 'vitest';
import { mulberry } from '../../src/core/rng.ts';
import type { Geo, GeoBuilding, Pt } from '../../src/world/geo.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { fillRing, stampLine, stampSegment } from '../../src/world/raster.ts';
import { rotateGeo, straighten } from '../../src/world/rotate.ts';
import { T } from '../../src/world/terrain.ts';
import { LOAD_RADIUS, rastrujTeren } from '../../src/world/world.ts';
import { ADDRESSES, kafelkiAdresu, ukladTestowy } from './fixtures.ts';

const zbierz = (f: (cb: (i: number) => void) => void): number[] => {
  const out: number[] = [];
  f((i) => out.push(i));
  return out;
};

/** liczba z ułamkiem ćwiartki metra: dokładna w zmiennym przecinku, więc przesunięcia całkowite nie zmieniają wyniku */
const cwiartka = (r: () => number, zakres: number) => Math.round((r() * 2 - 1) * zakres * 4) / 4;

const przesun = (p: readonly Pt[], dx: number, dy: number): Pt[] => p.map(([x, y]) => [x - dx, y - dy]);

describe('raster: przesunięcie okna', () => {
  it('fillRing z przesunięciem (ox, oy) daje to samo, co pierścień przesunięty o (−ox, −oy) w oknie bez przesunięcia', () => {
    const r = mulberry(7);
    let niepuste = 0;
    for (let n = 0; n < 300; n++) {
      const size = 64;
      const k = 3 + Math.floor(r() * 6);
      const srodek: Pt = [cwiartka(r, 50), cwiartka(r, 50)];
      const ring: Pt[] = [];
      for (let q = 0; q < k; q++) {
        const kat = (q / k) * Math.PI * 2;
        const ro = 3 + r() * 25;
        ring.push([
          srodek[0] + Math.round(Math.cos(kat) * ro * 4) / 4,
          srodek[1] + Math.round(Math.sin(kat) * ro * 4) / 4,
        ]);
      }
      ring.push([ring[0][0], ring[0][1]]);
      const ox = Math.round((r() * 2 - 1) * 90);
      const oy = Math.round((r() * 2 - 1) * 90);
      const z = zbierz((cb) => fillRing(ring, size, cb, ox, oy));
      const wzor = zbierz((cb) => fillRing(przesun(ring, ox, oy), size, cb));
      expect(z).toEqual(wzor);
      if (z.length) niepuste++;
    }
    expect(niepuste).toBeGreaterThan(60);
  });

  it('stampSegment i stampLine z przesunięciem dają to samo co linia przesunięta o (−ox, −oy)', () => {
    const r = mulberry(11);
    let niepuste = 0;
    for (let n = 0; n < 300; n++) {
      const size = 64;
      const a: Pt = [cwiartka(r, 50), cwiartka(r, 50)];
      const b: Pt = [a[0] + cwiartka(r, 40), a[1] + cwiartka(r, 40)];
      const c: Pt = [b[0] + cwiartka(r, 40), b[1] + cwiartka(r, 40)];
      const szer = 1 + Math.floor(r() * 12) / 2;
      const ox = Math.round((r() * 2 - 1) * 90);
      const oy = Math.round((r() * 2 - 1) * 90);
      const z = zbierz((cb) => stampSegment(a, b, szer, size, cb, ox, oy));
      const wzor = zbierz((cb) => stampSegment(przesun([a], ox, oy)[0], przesun([b], ox, oy)[0], szer, size, cb));
      expect(z).toEqual(wzor);
      const zl = zbierz((cb) => stampLine([a, b, c], szer, size, cb, ox, oy));
      const wzorl = zbierz((cb) => stampLine(przesun([a, b, c], ox, oy), szer, size, cb));
      expect(zl).toEqual(wzorl);
      if (z.length) niepuste++;
    }
    expect(niepuste).toBeGreaterThan(60);
  });

  it('bez przesunięcia (argumenty domyślne) kafelek (i, j) ma środek w (i − size/2 + ½, j − size/2 + ½)', () => {
    // kwadrat 2×2 m wokół punktu (0, 0) w oknie 8×8: cztery kafelki środkowe
    const ring: Pt[] = [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
      [-2, -2],
    ];
    const wyniki = zbierz((cb) => fillRing(ring, 8, cb)).sort((x, y) => x - y);
    expect(wyniki).toEqual(
      [
        2 * 8 + 2,
        2 * 8 + 3,
        2 * 8 + 4,
        2 * 8 + 5,
        3 * 8 + 2,
        3 * 8 + 3,
        3 * 8 + 4,
        3 * 8 + 5,
        4 * 8 + 2,
        4 * 8 + 3,
        4 * 8 + 4,
        4 * 8 + 5,
        5 * 8 + 2,
        5 * 8 + 3,
        5 * 8 + 4,
        5 * 8 + 5,
      ].sort((x, y) => x - y),
    );
    // okno przesunięte o (4, 0): ten sam kwadrat leży o 4 kafelki bardziej na lewo, więc w oknie zostają dwie kolumny (0, 1)
    const przes = zbierz((cb) => fillRing(ring, 8, cb, 4, 0)).sort((x, y) => x - y);
    expect(przes).toEqual([2, 3, 4, 5].flatMap((j) => [j * 8, j * 8 + 1]));
    // okno przesunięte o (0, −4): kwadrat leży o 4 wiersze niżej, w oknie zostają wiersze 6 i 7
    const w_dol = zbierz((cb) => fillRing(ring, 8, cb, 0, -4)).sort((x, y) => x - y);
    expect(w_dol).toEqual([6, 7].flatMap((j) => [2, 3, 4, 5].map((i) => j * 8 + i)));
  });
});

/* ---------- reguła skrawków: budynek przy granicy okna ---------- */

const prost = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const budynek = (p: Pt[]): GeoBuilding => ({ p, t: { building: 'yes' } });
const geoZ = (...b: GeoBuilding[]): Geo => ({ c: [0, 0], b, r: [], a: [], w: [], poi: [] });
/** liczba budynków i kafelków budynku w oknie 16×16 */
const budynkow = (g: Geo, ox: number, oy: number, skrawki: boolean) => {
  const r = rastrujTeren(g, 16, ox, oy, { skrawki });
  return { kept: r.kept.length, kafelkow: r.bid.filter((b) => b >= 0).length };
};

describe('rastrujTeren: reguła skrawków przy granicy okna', () => {
  // okno 16×16 wokół (0, 0): kafelki o środkach od −7,5 do 7,5, granica okna na x = 8
  const przy = budynek(prost(7.2, 0, 9, 2)); // 4 kafelki w całości, w oknie 2 (kolumna 7,5)
  const drobny = budynek(prost(7.2, 0, 8.9, 1.6)); // jak wyżej, obrys 2,7 m², też 4 kafelki w całości
  const okruch = budynek(prost(7.2, 0, 8.4, 0.8)); // wychodzi za okno, ale w całości ma jeden kafelek
  const wewnatrz = budynek(prost(0.2, 0, 2, 1)); // 2 kafelki, w całości w oknie
  const duzy = budynek(prost(2, 2, 5, 5)); // 9 kafelków
  const przykrywajacy = budynek(prost(7.9, -1, 12, 3)); // większy, zajmuje kafelki od x = 8,5 (16 kafelków)

  it('domyślnie budynek z mniej niż trzema kafelkami w oknie odpada, także przy granicy (świat domu bez zmian)', () => {
    expect(budynkow(geoZ(przy), 0, 0, false)).toEqual({ kept: 0, kafelkow: 0 });
    expect(budynkow(geoZ(duzy), 0, 0, false)).toEqual({ kept: 1, kafelkow: 9 });
    // opcje puste albo bez skrawków to to samo co domyślnie
    expect(rastrujTeren(geoZ(przy), 16, 0, 0, {}).kept).toHaveLength(0);
    expect(rastrujTeren(geoZ(przy), 16, 0, 0).kept).toHaveLength(0);
  });

  it('ze skrawkami zostaje skrawek budynku, który w całości ma co najmniej 3 kafelki (także obrys poniżej 3 m²)', () => {
    expect(budynkow(geoZ(przy), 0, 0, true)).toEqual({ kept: 1, kafelkow: 2 });
    expect(budynkow(geoZ(drobny), 0, 0, true)).toEqual({ kept: 1, kafelkow: 2 });
  });

  it('skrawek budynku, który w całości ma mniej niż trzy kafelki, odpada także ze skrawkami', () => {
    expect(budynkow(geoZ(wewnatrz), 0, 0, true)).toEqual({ kept: 0, kafelkow: 0 });
    expect(budynkow(geoZ(okruch), 0, 0, true)).toEqual({ kept: 0, kafelkow: 0 });
  });

  it('kafelki zajęte przez większy budynek nie liczą się do mniejszego: przykryty skrawek odpada w każdym oknie', () => {
    // przy ma 4 kafelki obrysu, ale dwa z nich (8,5) zajmuje większy budynek, więc własnych ma 2
    expect(budynkow(geoZ(przy, przykrywajacy), 0, 0, true)).toEqual({ kept: 0, kafelkow: 0 });
    // okno przesunięte tak, że oba budynki są w nim w całości: większy zostaje, mniejszy odpada (2 własne kafelki)
    expect(budynkow(geoZ(przy, przykrywajacy), 8, 0, true)).toEqual({ kept: 1, kafelkow: 16 });
    expect(budynkow(geoZ(przy, przykrywajacy), 8, 0, false)).toEqual({ kept: 1, kafelkow: 16 });
  });

  it('budynek bez żadnego kafelka w oknie nie zostaje, nawet z dużym obrysem poza oknem', () => {
    const poza = budynek(prost(20, 0, 24, 3));
    expect(budynkow(geoZ(poza), 0, 0, true)).toEqual({ kept: 0, kafelkow: 0 });
  });

  it('sąsiednie okna zgadzają się: skrawek w jednym oknie to ta sama część budynku, której reszta jest w drugim', () => {
    // okno (0, 0) ma kolumnę 7,5 budynku (2 kafelki), okno przesunięte o 16 m w prawo ma kolumnę 8,5 (2 kafelki)
    expect(budynkow(geoZ(przy), 0, 0, true).kafelkow).toBe(2);
    expect(budynkow(geoZ(przy), 16, 0, true).kafelkow).toBe(2);
    expect(budynkow(geoZ(przy), 8, 0, true).kafelkow).toBe(4);
    // bez skrawków dwa kafelki w oknie to za mało, a cztery wystarczą
    expect(budynkow(geoZ(przy), 0, 0, false).kafelkow).toBe(0);
    expect(budynkow(geoZ(przy), 16, 0, false).kafelkow).toBe(0);
    expect(budynkow(geoZ(przy), 8, 0, false).kafelkow).toBe(4);
  });

  it('reguła nie zależy od położenia okna: ten sam układ przesunięty razem z oknem daje to samo', () => {
    const przesuniete = (b: GeoBuilding, dx: number, dy: number) => budynek(przesun(b.p, -dx, -dy));
    for (const [dx, dy] of [
      [16, 0],
      [-32, 48],
      [384, -384],
    ]) {
      for (const skrawki of [false, true]) {
        for (const b of [przy, drobny, okruch, wewnatrz, duzy]) {
          expect(budynkow(geoZ(przesuniete(b, dx, dy)), dx, dy, skrawki)).toEqual(budynkow(geoZ(b), 0, 0, skrawki));
        }
        expect(budynkow(geoZ(przesuniete(przy, dx, dy), przesuniete(przykrywajacy, dx, dy)), dx, dy, skrawki)).toEqual(
          budynkow(geoZ(przy, przykrywajacy), 0, 0, skrawki),
        );
      }
    }
  });

  it('wszystkie kafelki zwrócone w kept i bid leżą w oknie, a budynek ma numer swojej pozycji w kept', () => {
    const r = rastrujTeren(geoZ(przy, duzy, wewnatrz), 16, 0, 0, { skrawki: true });
    expect(r.kept).toHaveLength(2);
    r.kept.forEach((o, id) => {
      expect(o.tiles.length).toBeGreaterThan(0);
      for (const i of o.tiles) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(256);
        expect(r.bid[i]).toBe(id);
        expect(r.terr[i]).toBe(T.BUILDING);
        expect(r.blocked[i]).toBe(1);
      }
    });
  });

  it('bardzo duży budynek z jednym kafelkiem w oknie zostaje bez rastrowania całego okolicznego terenu', () => {
    // 600 m na 600 m, w oknie 16×16 tylko jego róg (1 kafelek): zostaje jako skrawek
    const wielki = budynek(prost(7.2, 7.2, 607, 607));
    expect(budynkow(geoZ(wielki), 0, 0, true)).toEqual({ kept: 1, kafelkow: 1 });
    expect(budynkow(geoZ(wielki), 0, 0, false)).toEqual({ kept: 0, kafelkow: 0 });
  });
});

/* ---------- szwy: teren dwóch sąsiednich okien kontra okno przesunięte o pół boku ---------- */

describe('rastrujTeren: szwy na prawdziwych kafelkach', () => {
  const BOK = 384;
  const POL = BOK / 2;
  type Wynik = ReturnType<typeof rastrujTeren>;

  /** geo całego otoczenia domu i jego sąsiadów po obrocie układu domu i prostowaniu, raz na adres */
  function geoObrocone(a: (typeof ADDRESSES)[number]): Geo {
    const u = ukladTestowy(a);
    const g = toGeoT(kafelkiAdresu(a), a.lat, a.lon, LOAD_RADIUS + BOK, { caleBudynki: true });
    return straighten(rotateGeo(g, u.kat));
  }

  /** różnice terenu, przejścia i obecności budynku na kafelkach wspólnych dla okna X (przesunięcie xo, xy) i Y (yo, yy) */
  function porownaj(opis: string, X: Wynik, xo: number, xy: number, Y: Wynik, yo: number, yy: number): string[] {
    const wynik: string[] = [];
    // kafelek lokalny i leży pod bezwzględnym i − POL + przesunięcie; wspólne kafelki to część wspólna obu okien
    const g0 = Math.max(xo, yo) - POL;
    const g1 = Math.min(xo, yo) + POL;
    const h0 = Math.max(xy, yy) - POL;
    const h1 = Math.min(xy, yy) + POL;
    for (let gy = h0; gy < h1; gy++)
      for (let gx = g0; gx < g1; gx++) {
        const i = (gy - xy + POL) * BOK + (gx - xo + POL);
        const j = (gy - yy + POL) * BOK + (gx - yo + POL);
        if (X.terr[i] !== Y.terr[j] || X.blocked[i] !== Y.blocked[j] || X.bid[i] >= 0 !== Y.bid[j] >= 0)
          wynik.push(
            `${opis} (${gx},${gy}): terr ${X.terr[i]}/${Y.terr[j]} blocked ${X.blocked[i]}/${Y.blocked[j]} bid ${X.bid[i]}/${Y.bid[j]}`,
          );
      }
    return wynik;
  }

  /** okno dom i okno sąsiada w kierunku (dx, dy) kontra okno przesunięte o pół boku w tym kierunku */
  function roznice(g: Geo, skrawki: boolean, dx: number, dy: number): { n: number; roznice: string[] } {
    const dom = rastrujTeren(g, BOK, 0, 0, { skrawki });
    const sas = rastrujTeren(g, BOK, dx * BOK, dy * BOK, { skrawki });
    const sr = rastrujTeren(g, BOK, dx * POL, dy * POL, { skrawki });
    const wynik = [
      ...porownaj('dom', sr, dx * POL, dy * POL, dom, 0, 0),
      ...porownaj('sąsiad', sr, dx * POL, dy * POL, sas, dx * BOK, dy * BOK),
    ];
    return { n: sr.kept.length, roznice: wynik };
  }

  for (const a of ADDRESSES) {
    it(`${a.key}: teren okna domu i okna sąsiada schodzi się z oknem przesuniętym o pół boku (cztery kierunki, ze skrawkami)`, () => {
      const g = geoObrocone(a);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const { n, roznice: r } = roznice(g, true, dx, dy);
        expect(r, `${a.key} kierunek ${dx},${dy}`).toEqual([]);
        // okna nie są puste: są budynki w oknie pośrednim
        expect(n).toBeGreaterThan(5);
      }
      const S = rastrujTeren(g, BOK, POL, 0, { skrawki: true });
      expect(S.terr.some((t) => t === T.ROAD)).toBe(true);
    });
  }

  it('dwa okna w dowolnych całkowitych przesunięciach zgadzają się na części wspólnej (losowe pary, trzy adresy)', () => {
    const r = mulberry(5);
    let kafelkow = 0;
    for (const a of ADDRESSES) {
      const g = geoObrocone(a);
      for (let n = 0; n < 6; n++) {
        const ox1 = Math.round((r() * 2 - 1) * 300);
        const oy1 = Math.round((r() * 2 - 1) * 300);
        const ox2 = ox1 + Math.round((r() * 2 - 1) * 300);
        const oy2 = oy1 + Math.round((r() * 2 - 1) * 300);
        const X = rastrujTeren(g, BOK, ox1, oy1, { skrawki: true });
        const Y = rastrujTeren(g, BOK, ox2, oy2, { skrawki: true });
        expect(porownaj(`${a.key} (${ox1},${oy1}) i (${ox2},${oy2})`, X, ox1, oy1, Y, ox2, oy2)).toEqual([]);
        kafelkow += Math.max(0, BOK - Math.abs(ox1 - ox2)) * Math.max(0, BOK - Math.abs(oy1 - oy2));
      }
    }
    expect(kafelkow).toBeGreaterThan(500_000);
  });

  it('gęste syntetyczne miasto (2500 małych budynków, także nachodzących na siebie): okna schodzą się, a skrawki naprawdę występują', () => {
    const r = mulberry(21);
    const budynki: GeoBuilding[] = [];
    for (let n = 0; n < 2500; n++) {
      const x = cwiartka(r, 450);
      const y = cwiartka(r, 450);
      const w = 1 + Math.floor(r() * 32) / 4;
      const h = 1 + Math.floor(r() * 32) / 4;
      budynki.push(budynek(prost(x, y, x + w, y + h)));
    }
    const g = geoZ(...budynki);
    let skrawkow = 0;
    let pary = 0;
    for (let n = 0; n < 8; n++) {
      const ox1 = Math.round((r() * 2 - 1) * 150);
      const oy1 = Math.round((r() * 2 - 1) * 150);
      const ox2 = ox1 + Math.round((r() * 2 - 1) * 300);
      const oy2 = oy1 + Math.round((r() * 2 - 1) * 300);
      const X = rastrujTeren(g, BOK, ox1, oy1, { skrawki: true });
      const Y = rastrujTeren(g, BOK, ox2, oy2, { skrawki: true });
      expect(porownaj(`(${ox1},${oy1}) i (${ox2},${oy2})`, X, ox1, oy1, Y, ox2, oy2)).toEqual([]);
      // budynki z mniej niż trzema kafelkami w oknie, które zostały jako skrawki
      skrawkow += X.kept.filter((o) => o.tiles.length < 3).length + Y.kept.filter((o) => o.tiles.length < 3).length;
      pary++;
    }
    expect(pary).toBe(8);
    expect(skrawkow).toBeGreaterThan(10);
  });

  it('porównanie wykrywa różnicę: okno przesunięte o inną liczbę metrów nie schodzi się z oknami sąsiadów', () => {
    const a = ADDRESSES[0];
    const g = geoObrocone(a);
    const dom = rastrujTeren(g, BOK, 0, 0, { skrawki: true });
    const sr = rastrujTeren(g, BOK, POL, 0, { skrawki: true });
    // celowo błędne przesunięcie o jeden metr: ten sam kafelek wskazuje inne miejsce mapy
    expect(porownaj('dom', sr, POL + 1, 0, dom, 0, 0).length).toBeGreaterThan(100);
  });
});
