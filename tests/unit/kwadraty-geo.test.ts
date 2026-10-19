/* Geo kwadratu z kafelków (miasto z kwadratów, etap 1, zadanie 2): toGeoT z opcjami `srodek` (filtr bliskości i promień
   miejsc wokół środka kwadratu zamiast adresu) i `caleBudynki` (budowla złapana przez filtr wchodzi do geo ze wszystkimi
   kawałkami z pobranych kafelków, tak jak liczy się jej klucz), oraz geoKwadratu na kafelkach testowych trzech adresów.
   Dopóki geo domu ma tylko bliskie kawałki, dom i sąsiad mogą się różnić obrysem budowli przy brzegu danych; te różnice
   mają powód (poza filtrem bliskości albo kawałek mniejszy niż 4 m²) i test odrzuca każdą bez powodu. */

import { describe, expect, it } from 'vitest';
import { type GeoBuilding, type Pt, polyArea } from '../../src/world/geo.ts';
import { latLonZ } from '../../src/world/klucze.ts';
import { kluczKwadratu, sasiedzi8, srodekKwadratu, type Uklad } from '../../src/world/kwadraty.ts';
import { type DecodedTile, rzutKafelka, type TileFeature, toGeoT } from '../../src/world/mvt.ts';
import { LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, kafelkiAdresu, ukladTestowy } from './fixtures.ts';

/** zapas filtra bliskości w toGeoT: R + 30 m wokół środka */
const M = LOAD_RADIUS + 30;
const WSZYSCY: [number, number][] = [[0, 0], ...sasiedzi8(0, 0)];

const json = (v: unknown) => JSON.stringify(v);
const pierscienie = (b: GeoBuilding): Pt[][] => [b.p, ...(b.pp ?? [])];
const klucz = (b: GeoBuilding) => b.t['zm:klucz'];

/** prostokąt otaczający pierścień albo linię: [xmin, xmax, ymin, ymax] */
function ramka(pts: readonly Pt[]): [number, number, number, number] {
  let a = Number.POSITIVE_INFINITY;
  let b = Number.NEGATIVE_INFINITY;
  let c = Number.POSITIVE_INFINITY;
  let d = Number.NEGATIVE_INFINITY;
  for (const [x, y] of pts) {
    if (x < a) a = x;
    if (x > b) b = x;
    if (y < c) c = y;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

/** to samo co `near` w toGeoT: jakiś punkt w kwadracie ±m wokół (cx, cy) albo ramka nachodzi na ten kwadrat */
function blisko(pts: readonly Pt[], cx: number, cy: number, m: number): boolean {
  const [a, b, c, d] = ramka(pts);
  return a < cx + m && b > cx - m && c < cy + m && d > cy - m;
}

/** prostokąt kwadratu (sx, sy) w układzie przed obrotem: ramka obrysu obróconego kwadratu */
function ramkaKwadratu(u: Uklad, sx: number, sy: number): [number, number, number, number] {
  const c = Math.cos(u.kat);
  const s = Math.sin(u.kat);
  const rogi: Pt[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const qx = sx * u.bok + (i * u.bok) / 2;
    const qy = sy * u.bok + (j * u.bok) / 2;
    return [qx * c + qy * s, qy * c - qx * s];
  });
  return ramka(rogi);
}

const nachodza = (p: [number, number, number, number], q: [number, number, number, number]) =>
  p[0] < q[1] && p[1] > q[0] && p[2] < q[3] && p[3] > q[2];

/* ---------- kafelki syntetyczne: budowla przecięta granicą kafelków ---------- */

const N = 2 ** 14;
const TX = 9149;
const TY = 5400;
const LAT0 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (TY + 0.5)) / N))) * 180) / Math.PI;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
/** adres tak, żeby granica kafelków TX|TX+1 leżała 135 m na wschód od niego (poza zapasem M = 130 m przy R = 100) */
const LON0 = ((TX + 1) / N) * 360 - 180 - 135 / KX;

/** pierścień zewnętrzny kafelka (y w dół) z dodatnim polem według czytnika kafelków */
function prostokat(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const pole = (p: Pt[]) => {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
    return a / 2;
  };
  const r: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  return pole(r) > 0 ? r : r.reverse();
}

function budowla(id: number, ring: Pt[]): TileFeature {
  return { id, type: 3, tags: { render_height: 10 }, g: [ring] };
}

const kafelek = (x: number, ...cechy: TileFeature[]): DecodedTile => ({
  x,
  y: TY,
  L: { building: { extent: 4096, features: cechy } },
});

/** budowla z kawałkiem w lewym kafelku (80–135 m od adresu, blisko) i prawym (od 135 m, poza zapasem 130 m) */
const lewy = prostokat(3946, 2000, 4096, 2100);
const prawy = prostokat(0, 2000, 300, 2100);

describe('toGeoT: opcje srodek i caleBudynki', () => {
  it('bez opcji, z pustymi opcjami i ze środkiem w adresie daje to samo geo (trzy adresy)', () => {
    for (const a of ADDRESSES) {
      const t = kafelkiAdresu(a);
      const bez = json(toGeoT(t, a.lat, a.lon, LOAD_RADIUS));
      expect(json(toGeoT(t, a.lat, a.lon, LOAD_RADIUS, {}))).toBe(bez);
      expect(json(toGeoT(t, a.lat, a.lon, LOAD_RADIUS, { srodek: [0, 0] }))).toBe(bez);
    }
  });

  it('środek przesuwa filtr bliskości drogi, obszaru i budynku oraz promień miejsc', () => {
    const a = ADDRESSES[1];
    const t = kafelkiAdresu(a);
    const dom = toGeoT(t, a.lat, a.lon, LOAD_RADIUS);
    const srodek: Pt = [600, -100];
    const g = toGeoT(t, a.lat, a.lon, LOAD_RADIUS, { srodek });
    const [cx, cy] = srodek;
    // wszystko, co weszło, jest blisko nowego środka, współrzędne dalej od adresu
    for (const r of g.r) expect(blisko(r.l, cx, cy, M)).toBe(true);
    for (const o of g.a) expect(blisko(o.p, cx, cy, M)).toBe(true);
    for (const w of g.w) expect(blisko(w.l, cx, cy, M)).toBe(true);
    for (const b of g.b) expect(pierscienie(b).some((p) => blisko(p, cx, cy, M))).toBe(true);
    // miejsca w promieniu 720 m od nowego środka, nie od adresu
    const odleglosc = (p: { x: number; y: number }) => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    for (const p of g.poi) expect(odleglosc(p)).toBeLessThanOrEqual(720);
    for (const p of g.rodzaje ?? []) expect(odleglosc(p)).toBeLessThanOrEqual(720);
    // miejsca z geo domu, które mieszczą się też w promieniu nowego środka, są w nowym geo z tym samym kluczem
    const nowe = new Set(g.poi.map((p) => json(p)));
    const wspolne = dom.poi.filter((p) => odleglosc(p) <= 720);
    expect(wspolne.length).toBeGreaterThan(20);
    for (const p of wspolne) expect(nowe.has(json(p))).toBe(true);
    // a te dalsze niż 720 m od nowego środka odpadają (inaczej test niczego nie sprawdza)
    const dalekie = dom.poi.filter((p) => odleglosc(p) > 720);
    expect(dalekie.length).toBeGreaterThan(20);
    for (const p of dalekie) expect(nowe.has(json(p))).toBe(false);
    // drogi i budynki z nowego geo, które leżą też w geo domu, mają te same współrzędne co do wierzchołka
    const drogiDomu = new Set(dom.r.map((r) => json(r)));
    expect(g.r.filter((r) => drogiDomu.has(json(r))).length).toBeGreaterThan(20);
    // przesunięcie filtra zmienia zestaw: są drogi nowego geo, których dom nie ma, i odwrotnie
    expect(g.r.some((r) => !drogiDomu.has(json(r)))).toBe(true);
    const drogiNowe = new Set(g.r.map((r) => json(r)));
    expect(dom.r.some((r) => !drogiNowe.has(json(r)))).toBe(true);
  });

  it('budowla przecięta granicą kafelka: bez opcji tylko bliski kawałek, z caleBudynki całość', () => {
    const tiles = [kafelek(TX, budowla(1, lewy)), kafelek(TX + 1, budowla(1, prawy))];
    const bez = toGeoT(tiles, LAT0, LON0, 100);
    expect(bez.b).toHaveLength(1);
    expect(bez.b[0].pp).toBeUndefined();
    const [x0, x1] = ramka(bez.b[0].p);
    expect(x0).toBeGreaterThan(79);
    expect(x1).toBeLessThan(136);

    const cala = toGeoT(tiles, LAT0, LON0, 100, { caleBudynki: true });
    expect(cala.b).toHaveLength(1);
    const wszystkie = pierscienie(cala.b[0]);
    expect(wszystkie).toHaveLength(2);
    const [a0, a1] = ramka(wszystkie.flat());
    expect(a0).toBeGreaterThan(79);
    expect(a0).toBeLessThan(81);
    expect(a1).toBeGreaterThan(243);
    expect(a1).toBeLessThan(247);
    // klucz liczy się z całej budowli w obu przypadkach, więc jest ten sam
    expect(klucz(cala.b[0])).toBeDefined();
    expect(klucz(cala.b[0])).toBe(klucz(bez.b[0]));
    // największy kawałek to p, mniejszy trafia do pp (tak samo jak przy sklejaniu bliskich kawałków)
    expect(polyArea(cala.b[0].p)).toBeGreaterThan(polyArea(cala.b[0].pp?.[0] ?? []));
  });

  it('maleńki kawałek budowli (poniżej 4 m²) wchodzi, gdy budowla jest złapana przez filtr', () => {
    // pasek 1 jednostka kafelka (0,37 m) na 25 jednostek (9 m) w prawym kafelku, przy granicy
    const pasek = prostokat(0, 2020, 1, 2045);
    const tiles = [kafelek(TX, budowla(1, lewy)), kafelek(TX + 1, budowla(1, pasek))];
    const bez = toGeoT(tiles, LAT0, LON0, 100);
    expect(bez.b).toHaveLength(1);
    expect(pierscienie(bez.b[0])).toHaveLength(1);
    const cala = toGeoT(tiles, LAT0, LON0, 100, { caleBudynki: true });
    expect(cala.b).toHaveLength(1);
    expect(pierscienie(cala.b[0])).toHaveLength(2);
    expect(klucz(cala.b[0])).toBe(klucz(bez.b[0]));
  });

  it('budowla, której żaden kawałek nie jest blisko, nie wchodzi także z caleBudynki', () => {
    const tiles = [kafelek(TX, budowla(1, lewy)), kafelek(TX + 1, budowla(1, prawy))];
    for (const caleBudynki of [false, true])
      expect(toGeoT(tiles, LAT0, LON0, 100, { srodek: [3000, 3000], caleBudynki }).b).toHaveLength(0);
  });

  it('środek przy prawym kawałku: bez caleBudynki tylko on, z caleBudynki całość (lewy kawałek jest poza zapasem)', () => {
    const tiles = [kafelek(TX, budowla(1, lewy)), kafelek(TX + 1, budowla(1, prawy))];
    // zapas 130 m wokół x = 280 to 150–410 m: prawy kawałek (135–245 m) w nim jest, lewy (80–135 m) już nie
    const srodek: Pt = [280, 0];
    const sam = toGeoT(tiles, LAT0, LON0, 100, { srodek });
    expect(sam.b).toHaveLength(1);
    expect(pierscienie(sam.b[0])).toHaveLength(1);
    expect(ramka(sam.b[0].p)[0]).toBeGreaterThan(134);
    const cala = toGeoT(tiles, LAT0, LON0, 100, { srodek, caleBudynki: true });
    expect(cala.b).toHaveLength(1);
    expect(pierscienie(cala.b[0])).toHaveLength(2);
    expect(ramka(pierscienie(cala.b[0]).flat())[0]).toBeLessThan(81);
    expect(klucz(cala.b[0])).toBe(klucz(sam.b[0]));
  });

  it('kawałek innej wysokości to inna budowla: nie dołącza się do złapanej', () => {
    // inna wysokość nie skleja się z lewym kawałkiem (jak w 0.3: ta sama wysokość i wspólny odcinek granicy)
    const inny: TileFeature = { id: 2, type: 3, tags: { render_height: 20 }, g: [prawy] };
    const tiles = [kafelek(TX, budowla(1, lewy)), kafelek(TX + 1, inny)];
    const cala = toGeoT(tiles, LAT0, LON0, 100, { caleBudynki: true });
    expect(cala.b).toHaveLength(1);
    expect(pierscienie(cala.b[0])).toHaveLength(1);
    expect(ramka(cala.b[0].p)[1]).toBeLessThan(136);
  });
});

describe('geoKwadratu na kafelkach testowych', () => {
  it('kwadraty obok domu różnią się od siebie i od geo domu, ale mają ten sam środek adresu', () => {
    for (const a of ADDRESSES) {
      const dom = geoDomuTestowego(a);
      const wschod = geoKwadratuTestowego(a, 1, 0);
      expect(wschod.c).toEqual(dom.c);
      expect(wschod.src).toBe('mvt');
      expect(wschod.b.length).toBeGreaterThan(20);
      expect(json(wschod.r)).not.toBe(json(dom.r));
      const zachod = geoKwadratuTestowego(a, -1, 0);
      expect(json(zachod.r)).not.toBe(json(wschod.r));
    }
  });

  it('każdy budynek jest w całości: skrajne wierzchołki obrysów zgadzają się z kluczem liczonym z całej budowli', () => {
    let sprawdzone = 0;
    for (const a of ADDRESSES) {
      const [lat0] = ukladTestowy(a).c;
      for (const [sx, sy] of WSZYSCY) {
        for (const b of geoKwadratuTestowego(a, sx, sy).b) {
          const k = klucz(b);
          if (!k) continue;
          const m = /^px:(-?\d+):(-?\d+):(-?\d+):(-?\d+):\d$/.exec(k);
          expect(m).not.toBeNull();
          const [X, Y, DX, DY] = (m as RegExpExecArray).slice(1, 5).map(Number);
          const gora = (lat0 - latLonZ(X, Y)[0]) * 110574;
          const dol = (lat0 - latLonZ(X + DX, Y + DY)[0]) * 110574;
          const ys = pierscienie(b).flatMap((p) => p.map((q) => q[1]));
          expect(Math.min(...ys), `${a.key} ${sx},${sy} ${k} góra`).toBeGreaterThan(gora - 0.3);
          expect(Math.min(...ys), `${a.key} ${sx},${sy} ${k} góra`).toBeLessThan(gora + 0.3);
          expect(Math.max(...ys), `${a.key} ${sx},${sy} ${k} dół`).toBeGreaterThan(dol - 0.3);
          expect(Math.max(...ys), `${a.key} ${sx},${sy} ${k} dół`).toBeLessThan(dol + 0.3);
          sprawdzone++;
        }
      }
    }
    expect(sprawdzone).toBeGreaterThan(1500);
  });

  it('budynek wspólny z domem: kawałki domu są kawałkami sąsiada, a każdy kawałek, którego dom nie ma, ma powód', () => {
    // klucz nie jest jednoznaczny (obrys z dziedzińcem ma te same skrajne wierzchołki co obrys zewnętrzny), więc
    // porównujemy zbiory kawałków wszystkich budynków o tym samym kluczu
    const poKluczu = (g: { b: GeoBuilding[] }) => {
      const m = new Map<string, Set<string>>();
      for (const b of g.b) {
        const k = klucz(b);
        if (!k) continue;
        const zbior = m.get(k) ?? new Set<string>();
        for (const p of pierscienie(b)) zbior.add(json(p));
        m.set(k, zbior);
      }
      return m;
    };
    const wyjatki: string[] = [];
    let wspolne = 0;
    for (const a of ADDRESSES) {
      const dom = poKluczu(geoDomuTestowego(a));
      for (const [sx, sy] of sasiedzi8(0, 0)) {
        const sasiad = poKluczu(geoKwadratuTestowego(a, sx, sy));
        for (const [k, kawalkiDomu] of dom) {
          const kawalkiSasiada = sasiad.get(k);
          if (!kawalkiSasiada) continue;
          wspolne++;
          // kawałki domu są też u sąsiada, bit w bit (te same współrzędne co do 0,5 m)
          for (const r of kawalkiDomu) expect(kawalkiSasiada.has(r), `${a.key} ${sx},${sy} ${k}`).toBe(true);
          // kawałki, których dom nie ma: poza jego filtrem bliskości albo mniejsze niż 4 m²
          for (const r of kawalkiSasiada) {
            if (kawalkiDomu.has(r)) continue;
            const p = JSON.parse(r) as Pt[];
            const powod = !blisko(p, 0, 0, M) ? 'poza filtrem bliskości domu' : polyArea(p) < 4 ? 'poniżej 4 m²' : null;
            expect(powod, `${a.key} ${sx},${sy} ${k}: dom nie ma kawałka bez powodu`).not.toBeNull();
            wyjatki.push(`${a.key} ${kluczKwadratu(sx, sy)} ${k}: ${powod}`);
          }
        }
      }
    }
    expect(wspolne).toBeGreaterThan(300);
    // wyjątki są rzadkie: dom ma niepełny obrys co najwyżej kilku budowli na adres
    expect(wyjatki.length).toBeLessThan(60);
  });

  it('każdy budynek geo kwadratu ma kawałek w zapasie wokół jego środka, a miejsca są w promieniu 720 m', () => {
    for (const a of ADDRESSES) {
      const u = ukladTestowy(a);
      for (const [sx, sy] of WSZYSCY) {
        const [cx, cy] = srodekKwadratu(u, sx, sy);
        const g = geoKwadratuTestowego(a, sx, sy);
        expect(g.b.length, `${a.key} ${sx},${sy}`).toBeGreaterThan(0);
        for (const b of g.b) expect(pierscienie(b).some((p) => blisko(p, cx, cy, M))).toBe(true);
        for (const r of g.r) expect(blisko(r.l, cx, cy, M)).toBe(true);
        for (const p of g.poi) expect(Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)).toBeLessThanOrEqual(720);
      }
    }
  });

  it('pokrycie: wszystko, co leży w kwadracie, jest w jego geo (porównanie z geo bez ograniczenia odległości)', () => {
    for (const a of ADDRESSES) {
      const u = ukladTestowy(a);
      // geo z całych kafelków testowych: filtr bliskości tak szeroki, że nic nie odpada
      const calosc = toGeoT(kafelkiAdresu(a), a.lat, a.lon, 5000, { caleBudynki: true });
      for (const [sx, sy] of WSZYSCY) {
        const rk = ramkaKwadratu(u, sx, sy);
        const g = geoKwadratuTestowego(a, sx, sy);
        const drogi = new Set(g.r.map(json));
        const obszary = new Set(g.a.map(json));
        const wody = new Set(g.w.map(json));
        const przejscia = new Set((g.pass ?? []).map(json));
        const budynki = new Set(g.b.map((b) => klucz(b) ?? json(b.p)));
        for (const r of calosc.r)
          if (nachodza(ramka(r.l), rk)) expect(drogi.has(json(r)), `${a.key} ${sx},${sy} droga`).toBe(true);
        for (const o of calosc.a)
          if (nachodza(ramka(o.p), rk)) expect(obszary.has(json(o)), `${a.key} ${sx},${sy} obszar`).toBe(true);
        for (const w of calosc.w)
          if (nachodza(ramka(w.l), rk)) expect(wody.has(json(w)), `${a.key} ${sx},${sy} woda`).toBe(true);
        for (const r of calosc.pass ?? [])
          if (nachodza(ramka(r.l), rk)) expect(przejscia.has(json(r)), `${a.key} ${sx},${sy} przejście`).toBe(true);
        for (const b of calosc.b)
          if (pierscienie(b).some((p) => nachodza(ramka(p), rk)))
            expect(budynki.has(klucz(b) ?? json(b.p)), `${a.key} ${sx},${sy} budynek ${klucz(b)}`).toBe(true);
      }
    }
  });

  it('kwadraty przecięte granicą kafelków z=14 mają budowle sklejone z kawałków obu kafelków', () => {
    // granice kafelków fixture'a w metrach od adresu: środkowa linia pionowa i pozioma między czterema kafelkami
    let naGranicy = 0;
    let sklejone = 0;
    for (const a of ADDRESSES) {
      const u = ukladTestowy(a);
      const rzut = rzutKafelka(a.lat, a.lon);
      const [bx] = rzut({ x: Math.max(...a.tiles.map(([x]) => x)), y: a.tiles[0][1] }, 4096, [0, 0]);
      const [, by] = rzut({ x: a.tiles[0][0], y: Math.max(...a.tiles.map(([, y]) => y)) }, 4096, [0, 0]);
      for (const [sx, sy] of WSZYSCY) {
        const [x0, x1, y0, y1] = ramkaKwadratu(u, sx, sy);
        if (!((x0 < bx && bx < x1) || (y0 < by && by < y1))) continue;
        naGranicy++;
        const g = geoKwadratuTestowego(a, sx, sy);
        for (const b of g.b) {
          if (pierscienie(b).length < 2) continue;
          // sklejona budowla ma kawałki po obu stronach granicy kafelków i leży przy niej
          const [bx0, bx1, by0, by1] = ramka(pierscienie(b).flat());
          const przecina = (bx0 < bx + 0.6 && bx1 > bx - 0.6) || (by0 < by + 0.6 && by1 > by - 0.6);
          expect(przecina, `${a.key} ${sx},${sy} ${klucz(b)}`).toBe(true);
          sklejone++;
        }
      }
    }
    // test nie jest pusty: na trzech adresach są takie kwadraty i takie budowle
    expect(naGranicy).toBeGreaterThanOrEqual(3);
    expect(sklejone).toBeGreaterThanOrEqual(3);
  });

  it('geoKwadratu nie zmienia danych wejściowych (kafelki do ponownego użycia)', () => {
    const a = ADDRESSES[0];
    const t = kafelkiAdresu(a);
    const przed = json(t.map((k) => Object.keys(k.L).map((n) => k.L[n].features.length)));
    geoKwadratuTestowego(a, 1, 1);
    geoKwadratuTestowego(a, -1, -1);
    expect(json(t.map((k) => Object.keys(k.L).map((n) => k.L[n].features.length)))).toBe(przed);
    // dwa wywołania dają to samo
    expect(json(geoKwadratuTestowego(a, 1, 0))).toBe(json(geoKwadratuTestowego(a, 1, 0)));
  });
});
