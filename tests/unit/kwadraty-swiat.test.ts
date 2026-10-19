/* Świat kwadratu (miasto z kwadratów, etap 1, zadanie 4): ziarno kwadratu, przygotowanie geo (obrót kątem domu,
   prostowanie z regułą „dom wygrywa na szwie”) i `buildKwadrat`, czyli świat obok domu: ten sam generator co buildWorld
   (teren, budynki z drzwiami, drzewa, wraki) na oknie przesuniętym o (sx·384, sy·384), ale bez siedziby, siatki,
   wnętrza, suchego drzewa, stert i mieszkań. Szwy sprawdzamy na kafelkach testowych trzech adresów (różne kąty obrotu):
   teren przy granicy z domem ma się zgadzać z oknem przesuniętym o pół boku, a wyjątki mają powód. */

import { describe, expect, it } from 'vitest';
import { hashString, mulberry } from '../../src/core/rng.ts';
import { buildScene } from '../../src/render/art/scene.ts';
import { labelRegions } from '../../src/sim/path.ts';
import type { Geo, GeoBuilding, Pt } from '../../src/world/geo.ts';
import { sasiedzi8, seedKwadratu, type Uklad } from '../../src/world/kwadraty.ts';
import {
  parametryProstowania,
  rotateGeo,
  straighten,
  straightenZDomem,
  zastosujProstowanie,
} from '../../src/world/rotate.ts';
import { T } from '../../src/world/terrain.ts';
import {
  buildKwadrat,
  buildWorld,
  przygotujGeo,
  przygotujGeoKwadratu,
  rastrujTeren,
  type World,
} from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';

const PRZYMORZE = ADDRESSES[0];
const ZIELONKI = ADDRESSES[2];
const BOK = 384;
const POL = BOK / 2;
const json = (v: unknown) => JSON.stringify(v);
const skrot = (a: ArrayLike<number>) => hashString(Array.prototype.join.call(a, ','));

/** prostokąt o środku (cx, cy), wymiarach w×h, obrócony o kąt a (stopnie), zamknięty pierścień */
function rect(cx: number, cy: number, w: number, h: number, a: number): Pt[] {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const pts: Pt[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  return [...pts, pts[0]];
}

/** kawałek długiego, przechylonego o a stopni budynku: odcinek osi od `od` do `do` metrów od środka budynku */
const kawalek = (od: number, doo: number, szer: number, a: number): Pt[] => {
  const r = (a * Math.PI) / 180;
  const srodek = (od + doo) / 2;
  return rect(srodek * Math.cos(r), srodek * Math.sin(r), doo - od, szer, a);
};

const geoZ = (b: GeoBuilding[]): Geo => ({ c: [52, 21], b, r: [], a: [], w: [], poi: [] });
const budynek = (p: Pt[], ...pp: Pt[][]): GeoBuilding => ({ p, ...(pp.length ? { pp } : {}), t: { building: 'yes' } });

/* ---------- ziarno kwadratu ---------- */

describe('seedKwadratu', () => {
  it('to skrót z napisu „ziarno:sx:sy” jako liczba całkowita bez znaku', () => {
    expect(seedKwadratu(7, 1, 0)).toBe(Number.parseInt(hashString('7:1:0'), 16));
    for (const [s, x, y] of [
      [1, 0, 0],
      [2051, -3, 4],
      [4294967295, 16, -16],
    ]) {
      const z = seedKwadratu(s, x, y);
      expect(Number.isInteger(z)).toBe(true);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThan(2 ** 32);
    }
  });

  it('jest deterministyczne i różne dla różnych kwadratów i różnych ziaren gry', () => {
    expect(seedKwadratu(7, 1, 0)).toBe(seedKwadratu(7, 1, 0));
    const wszystkie = new Set<number>();
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) wszystkie.add(seedKwadratu(7, x, y));
    expect(wszystkie.size).toBe(81);
    expect(seedKwadratu(7, 1, 0)).not.toBe(seedKwadratu(8, 1, 0));
    // znak liczy się: (−1, 0) to nie (1, 0), a (1, 0) to nie (0, 1)
    expect(seedKwadratu(7, -1, 0)).not.toBe(seedKwadratu(7, 1, 0));
    expect(seedKwadratu(7, 1, 0)).not.toBe(seedKwadratu(7, 0, 1));
  });
});

/* ---------- prostowanie: parametry i reguła „dom wygrywa” ---------- */

describe('prostowanie budynków', () => {
  it('parametryProstowania: null dla prostego i zbyt krzywego, parametry dla lekko krzywego', () => {
    expect(parametryProstowania([rect(0, 0, 60, 12, 0)])).toBeNull();
    // 20° przy bloku to za dużo (limit 8°)
    expect(parametryProstowania([rect(0, 0, 60, 12, 20)])).toBeNull();
    const lekko = rect(10, -5, 60, 12, 3);
    const p = parametryProstowania([lekko]);
    expect(p).not.toBeNull();
    expect(p?.d).toBeCloseTo((3 * Math.PI) / 180, 6);
    // środek to średnia wszystkich wierzchołków pierścienia, także powtórzonego zamykającego
    expect(p?.cx).toBeCloseTo(lekko.reduce((s, q) => s + q[0], 0) / lekko.length, 9);
    expect(p?.cy).toBeCloseTo(lekko.reduce((s, q) => s + q[1], 0) / lekko.length, 9);
  });

  it('straighten daje to samo co parametryProstowania i zastosujProstowanie (bez zmiany zachowania)', () => {
    const b = budynek(rect(0, 0, 60, 12, 3));
    const prosty = straighten(geoZ([b, budynek(rect(0, 50, 60, 12, 20)), budynek(rect(0, -50, 10, 8, 14))]));
    const p = parametryProstowania([b.p]);
    expect(p).not.toBeNull();
    expect(prosty.b[0]).toEqual(zastosujProstowanie(b, p as NonNullable<typeof p>));
    // zbyt krzywy zostaje bez zmian, ten sam obiekt
    expect(prosty.b[1].p).toEqual(rect(0, 50, 60, 12, 20));
  });

  it('przygotujGeo to obrót kątem układu i prostowanie, dokładnie jak w buildWorld', () => {
    for (const a of ADDRESSES) {
      const g = geoDomuTestowego(a);
      const kat = ukladTestowy(a).kat;
      expect(json(przygotujGeo(g, kat))).toBe(json(straighten(rotateGeo(g, kat))));
    }
  });

  describe('straightenZDomem: budynek obecny w domu prostuje się tak jak w domu', () => {
    /** największe przesunięcie wierzchołka między dwoma wersjami tego samego pierścienia */
    const przesuniecie = (przed: Pt[], po: Pt[]) =>
      Math.max(...przed.map((q, i) => Math.sqrt((q[0] - po[i][0]) ** 2 + (q[1] - po[i][1]) ** 2)));
    const TOL = 3.5;

    // budynek 24 m x 12 m przechylony o 6°, przecięty granicą kafelków: dom ma tylko kawałek A (10 m), sąsiad A i B (14 m)
    const A = kawalek(-12, -2, 12, 6);
    const B = kawalek(-2, 12, 12, 6);
    const sasiad = geoZ([budynek(B, A)]);
    const dom = geoZ([budynek(A)]);

    it('kawałek poza domem w granicy tolerancji obraca się razem z kawałkiem domu jak jedna bryła', () => {
      const pDom = parametryProstowania([A]);
      expect(pDom).not.toBeNull();
      const wynik = straightenZDomem(sasiad, dom);
      // kawałek domu: dokładnie to samo co dom (co do bitu)
      expect(wynik.b[0].pp?.[0]).toEqual(straighten(dom).b[0].p);
      // reszta tym samym obrotem wokół tego samego środka, bo żaden jej wierzchołek nie rusza się o więcej niż tolerancja
      expect(przesuniecie(B, zastosujProstowanie(sasiad.b[0], pDom as NonNullable<typeof pDom>).p)).toBeLessThan(TOL);
      expect(wynik.b[0]).toEqual(zastosujProstowanie(sasiad.b[0], pDom as NonNullable<typeof pDom>));
      // i faktycznie obrócony: różni się od wejścia, a wspólny bok kawałków nie pęka
      expect(wynik.b[0].p).not.toEqual(B);
      const [a0, a1] = [wynik.b[0].pp?.[0][1], wynik.b[0].pp?.[0][2]] as [Pt, Pt];
      const [b0, b1] = [wynik.b[0].p[0], wynik.b[0].p[3]] as [Pt, Pt];
      expect(Math.sqrt((a0[0] - b0[0]) ** 2 + (a0[1] - b0[1]) ** 2)).toBeLessThan(1e-6);
      expect(Math.sqrt((a1[0] - b1[0]) ** 2 + (a1[1] - b1[1]) ** 2)).toBeLessThan(1e-6);
    });

    describe('długi blok, którego dom ma tylko środkowy kawałek', () => {
      // 420 m przechylone o 1°: dom ma kawałek A od 160 do 330 m osi (170 m, jego obrót przesuwa wierzchołki o 1,5 m),
      // sąsiad ma jeszcze B od 330 do 580 m, którego koniec obrót wokół środka A przesunąłby o ponad 5 m
      const Ad = kawalek(160, 330, 12, 1);
      const Bd = kawalek(330, 580, 12, 1);
      const blokSasiad = geoZ([budynek(Bd, Ad)]);
      const blokDom = geoZ([budynek(Ad)]);

      it('założenie testu: obrót domu rusza kawałek domu o mniej niż tolerancję, a koniec reszty o więcej', () => {
        const pDom = parametryProstowania([Ad]);
        expect(pDom).not.toBeNull();
        const domProsty = straighten(blokDom).b[0].p;
        expect(przesuniecie(Ad, domProsty)).toBeLessThan(TOL);
        const gdybyObrocono = zastosujProstowanie(blokSasiad.b[0], pDom as NonNullable<typeof pDom>);
        expect(przesuniecie(Bd, gdybyObrocono.p)).toBeGreaterThan(TOL + 1);
      });

      it('kawałek domu jak w domu, a kawałek dalej niż tolerancja od środka obrotu zostaje na miejscu', () => {
        const wynik = straightenZDomem(blokSasiad, blokDom);
        // szew z domem: bit w bit
        expect(wynik.b[0].pp?.[0]).toEqual(straighten(blokDom).b[0].p);
        // reszta bloku się nie rusza, więc nie wchodzi w ulicę ani w sąsiedni budynek
        expect(wynik.b[0].p).toEqual(Bd);
        // pęknięcie na styku kawałków jest mniejsze niż tolerancja (ruszył się tylko kawałek domu, o mniej niż tol)
        expect(przesuniecie(Ad, wynik.b[0].pp?.[0] ?? [])).toBeLessThan(TOL);
      });

      it('żaden wierzchołek żadnego kawałka sąsiada nie rusza się o więcej niż tolerancja', () => {
        const wynik = straightenZDomem(blokSasiad, blokDom);
        expect(przesuniecie(Bd, wynik.b[0].p)).toBeLessThanOrEqual(TOL);
        expect(przesuniecie(Ad, wynik.b[0].pp?.[0] ?? [])).toBeLessThanOrEqual(TOL);
      });
    });

    it('gdy dom nie prostuje swojego kawałka, sąsiad nie prostuje też reszty', () => {
      // kawałek domu przechylony o 30° (za dużo nawet dla małego budynku), reszta o tyle samo
      const Ak = kawalek(-40, -30, 12, 30);
      const Bk = kawalek(-30, 40, 12, 30);
      const wynik = straightenZDomem(geoZ([budynek(Bk, Ak)]), geoZ([budynek(Ak)]));
      expect(wynik.b[0].p).toEqual(Bk);
      expect(wynik.b[0].pp?.[0]).toEqual(Ak);
    });

    it('budynek bez odpowiednika w domu prostuje się jak zwykle, a dom nie ma wpływu na inne budynki', () => {
      const obcy = budynek(rect(200, 200, 60, 12, 3));
      const wynik = straightenZDomem(geoZ([obcy, budynek(B, A)]), dom);
      expect(wynik.b[0]).toEqual(straighten(geoZ([obcy])).b[0]);
    });

    it('kawałki z dwóch różnych budynków domu: każdy dostaje obrót swojego budynku, reszta zostaje', () => {
      const A1 = kawalek(-40, -30, 12, 6);
      const A2 = kawalek(30, 40, 12, 6);
      const srodek = kawalek(-30, 30, 12, 6);
      const domDwa = geoZ([budynek(A1), budynek(A2)]);
      const wynik = straightenZDomem(geoZ([budynek(srodek, A1, A2)]), domDwa);
      const prosty = straighten(domDwa);
      // kawałki domu bit w bit jak w domu (każdy z własnego budynku domu)
      expect(wynik.b[0].pp?.[0]).toEqual(prosty.b[0].p);
      expect(wynik.b[0].pp?.[1]).toEqual(prosty.b[1].p);
      // nie wiadomo, którym obrotem ruszyć kawałek między nimi, więc zostaje
      expect(wynik.b[0].p).toEqual(srodek);
    });

    it('dom bez budynków albo pusty sąsiad nie psuje wyniku', () => {
      expect(json(straightenZDomem(sasiad, geoZ([])))).toBe(json(straighten(sasiad)));
      expect(straightenZDomem(geoZ([]), dom).b).toEqual([]);
    });

    it('nie zmienia wejścia', () => {
      const przed = json([sasiad, dom]);
      straightenZDomem(sasiad, dom);
      expect(json([sasiad, dom])).toBe(przed);
    });
  });
});

/* ---------- świat kwadratu ---------- */

const swiaty = new Map<string, World>();
/** świat kwadratu (sx, sy) z kafelków testowych adresu, z geo domu (reguła „dom wygrywa”); buduje się raz na proces */
function swiat(a: (typeof ADDRESSES)[number], sx: number, sy: number, seed = 7): World {
  const klucz = `${a.key}:${sx}:${sy}:${seed}`;
  let w = swiaty.get(klucz);
  if (!w) {
    w = buildKwadrat(geoKwadratuTestowego(a, sx, sy), {
      seed,
      uklad: ukladTestowy(a),
      sx,
      sy,
      geoDomu: geoDomuTestowego(a),
    });
    swiaty.set(klucz, w);
  }
  return w;
}

describe('buildKwadrat: świat obok domu', () => {
  it('kwadrat jest deterministyczny i bez siedziby', () => {
    const g = geoKwadratuTestowego(PRZYMORZE, 1, 0);
    const uklad = ukladTestowy(PRZYMORZE);
    const a = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0 });
    const b = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0 });
    expect(a.hq).toBe(-1);
    expect(a.dryTree).toBe(-1);
    expect(a.fence.tiles.length).toBe(0);
    expect(a.fence.yard.length).toBe(0);
    expect(a.fence.gate.w).toBe(0);
    expect(a.interior.rooms).toEqual([]);
    expect(a.interior.furniture).toEqual([]);
    expect(a.interior.building).toBe(-1);
    expect(a.interior.home).toBe(-1);
    expect(a.apts).toEqual([]);
    expect(a.damage).toEqual([]);
    expect(a.size).toBe(BOK);
    expect(a.angle).toBe(uklad.kat);
    expect(a.seed).toBe(seedKwadratu(7, 1, 0));
    expect(hashString(String(a.terr))).toBe(hashString(String(b.terr)));
    expect(skrot(a.bid)).toBe(skrot(b.bid));
    expect(skrot(a.blocked)).toBe(skrot(b.blocked));
    expect(json([a.buildings, a.trees, a.props, a.pois])).toBe(json([b.buildings, b.trees, b.props, b.pois]));
  });

  it('teren i budynki nie zależą od ziarna gry, a drzewa i wraki tak', () => {
    const g = geoKwadratuTestowego(PRZYMORZE, 1, 0);
    const uklad = ukladTestowy(PRZYMORZE);
    const a = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0 });
    const b = buildKwadrat(g, { seed: 8, uklad, sx: 1, sy: 0 });
    expect(a.buildings.length).toBe(b.buildings.length);
    expect(json(a.buildings.map((x) => [x.cls, x.tiles, x.x0, x.y0, x.x1, x.y1]))).toBe(
      json(b.buildings.map((x) => [x.cls, x.tiles, x.x0, x.y0, x.x1, x.y1])),
    );
    expect(json(a.trees)).not.toBe(json(b.trees));
    expect(json(a.props)).not.toBe(json(b.props));
  });

  it('wygląda jak świat: budynki, drogi, drzewa, wraki, miejsca w lokalnych współrzędnych', () => {
    for (const a of ADDRESSES) {
      const w = swiat(a, 1, 0);
      expect(w.buildings.length).toBeGreaterThan(20);
      expect(w.terr.filter((t) => t === T.ROAD).length).toBeGreaterThan(2000);
      // numery budynków i liczniki kafelków zgadzają się z tablicą bid
      const licz = new Map<number, number>();
      for (const b of w.bid) if (b >= 0) licz.set(b, (licz.get(b) ?? 0) + 1);
      for (const b of w.buildings) {
        expect(licz.get(b.id) ?? 0, `${a.key} budynek ${b.id}`).toBe(b.tiles);
        expect(b.tiles).toBeGreaterThan(0);
      }
      // miejsca: współrzędne względem środka kwadratu (po obrocie), czyli geo po obrocie minus przesunięcie okna
      const u = ukladTestowy(a);
      const obrocone = rotateGeo(geoKwadratuTestowego(a, 1, 0), u.kat).poi;
      expect(w.pois.length).toBe(obrocone.length);
      w.pois.forEach((p, i) => {
        expect(p.x).toBeCloseTo(obrocone[i].x - BOK, 9);
        expect(p.y).toBeCloseTo(obrocone[i].y, 9);
        expect(p.c).toBe(obrocone[i].c);
      });
    }
  });

  it('drzewa stoją w kwadracie, z zapasem na koronę przy krawędzi', () => {
    for (const a of ADDRESSES) {
      const w = swiat(a, 1, 0);
      expect(w.trees.length).toBeGreaterThan(50);
      for (const t of w.trees) {
        expect(t.x).toBeGreaterThanOrEqual(2);
        expect(t.x).toBeLessThan(BOK - 2);
        expect(t.y).toBeGreaterThanOrEqual(2);
        expect(t.y).toBeLessThan(BOK - 2);
        expect(w.blocked[Math.floor(t.y) * BOK + Math.floor(t.x)]).toBe(1);
      }
    }
  });

  it('wraki stoją na jezdni albo parkingu, całe w kwadracie, z blokadą w blocked, a props to tylko wraki', () => {
    let wszystkie = 0;
    for (const a of ADDRESSES) {
      const w = swiat(a, 1, 0);
      for (const p of w.props) expect(p.kind).toBe('wrak');
      expect(w.props.length).toBeGreaterThan(3);
      for (const p of w.props) {
        if (p.kind !== 'wrak') continue;
        wszystkie++;
        expect(p.x).toBeGreaterThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(1);
        expect(p.x + p.w).toBeLessThanOrEqual(BOK - 1);
        expect(p.y + p.h).toBeLessThanOrEqual(BOK - 1);
        for (let y = p.y; y < p.y + p.h; y++)
          for (let x = p.x; x < p.x + p.w; x++) {
            const i = y * BOK + x;
            expect([T.ROAD, T.PARKING]).toContain(w.terr[i]);
            expect(w.blocked[i]).toBe(1);
            expect(w.bid[i]).toBe(-1);
          }
      }
    }
    expect(wszystkie).toBeGreaterThan(20);
  });

  it('wraki nie zasłaniają drzwi: kafelki przed drzwiami budynków są wolne', () => {
    for (const a of ADDRESSES) {
      const w = swiat(a, 0, 1);
      for (const b of w.buildings)
        for (const e of b.entrances) {
          expect(w.blocked[e.out], `${a.key} drzwi budynku ${b.id}`).toBe(0);
        }
    }
  });

  it('drzwi nie stoją na linii cięcia: żadne wejście nie ma kafelka na brzegu kwadratu, a kafelek przed drzwiami jest w kwadracie', () => {
    let brzegowe = 0;
    let zDrzwiami = 0;
    const naBrzegu = (i: number) => {
      const x = i % BOK;
      const y = (i - x) / BOK;
      return x === 0 || y === 0 || x === BOK - 1 || y === BOK - 1;
    };
    for (const a of ADDRESSES) {
      for (const [sx, sy] of sasiedzi8(0, 0)) {
        const w = swiat(a, sx, sy);
        for (const b of w.buildings) {
          const dotyka = b.x0 === 0 || b.y0 === 0 || b.x1 === BOK - 1 || b.y1 === BOK - 1;
          if (dotyka) brzegowe++;
          for (const e of b.entrances) {
            zDrzwiami++;
            expect(naBrzegu(e.tile), `${a.key} ${sx},${sy} budynek ${b.id} drzwi na brzegu`).toBe(false);
            expect(e.out).toBeGreaterThanOrEqual(0);
            expect(e.out).toBeLessThan(BOK * BOK);
            expect(w.bid[e.tile]).toBe(b.id);
          }
        }
      }
    }
    // test nie jest pusty: są budynki przecięte granicą kwadratu i drzwi w innych budynkach
    expect(brzegowe).toBeGreaterThan(10);
    expect(zDrzwiami).toBeGreaterThan(300);
  });

  it('skrawek budynku przy granicy z dwiema kolumnami dostaje drzwi w kolumnie wewnątrz kwadratu', () => {
    // okno kwadratu (1, 0) zaczyna się w x = 192 m od adresu; budynek od 190 do 194 m ma w oknie kolumny 0 i 1
    const uklad: Uklad = { c: [52, 21], kat: 0, bok: BOK };
    const g: Geo = {
      ...geoZ([budynek(rect(192, 0, 4, 40, 0))]),
      r: [
        {
          l: [
            [170, 25],
            [260, 25],
          ],
          h: 'residential',
        },
      ],
    };
    const w = buildKwadrat(g, { seed: 1, uklad, sx: 1, sy: 0 });
    expect(w.buildings).toHaveLength(1);
    const b = w.buildings[0];
    expect(b.x0).toBe(0);
    expect(b.x1).toBe(1);
    expect(b.entrances.length).toBeGreaterThan(0);
    for (const e of b.entrances) expect(e.tile % BOK).toBeGreaterThan(0);
  });

  it('gdzie obszar dotyka granicy kwadratu, nie wycina się bramy w budynkach (krok 9a)', () => {
    // mur z budynku przez całą wysokość okna kwadratu (1, 0) dzieli je na dwa duże obszary, oba dotykają granicy
    const uklad: Uklad = { c: [52, 21], kat: 0, bok: BOK };
    const mur = budynek(rect(BOK, 0, 6, BOK + 40, 0));
    const w = buildKwadrat(geoZ([mur]), { seed: 1, uklad, sx: 1, sy: 0 });
    const reg = labelRegions(w.blocked, BOK);
    const lewy = reg[100 * BOK + 20];
    const prawy = reg[100 * BOK + BOK - 20];
    expect(lewy).toBeGreaterThanOrEqual(0);
    expect(prawy).toBeGreaterThanOrEqual(0);
    expect(lewy).not.toBe(prawy);
    // mur stoi w całości
    for (let y = 0; y < BOK; y++) expect(w.terr[y * BOK + POL]).toBe(T.BUILDING);
  });

  it('obszar odcięty w środku kwadratu (podwórko z czterech murów) dostaje bramę jak w domu', () => {
    const uklad: Uklad = { c: [52, 21], kat: 0, bok: BOK };
    const cx = BOK; // środek okna kwadratu (1, 0) w metrach od adresu
    const sciany = [
      budynek(rect(cx, -22, 50, 6, 0)),
      budynek(rect(cx, 22, 50, 6, 0)),
      budynek(rect(cx - 22, 0, 6, 50, 0)),
      budynek(rect(cx + 22, 0, 6, 50, 0)),
    ];
    const w = buildKwadrat(geoZ(sciany), { seed: 1, uklad, sx: 1, sy: 0 });
    const reg = labelRegions(w.blocked, BOK);
    const wnetrze = reg[POL * BOK + POL];
    const zewnatrz = reg[20 * BOK + 20];
    expect(wnetrze).toBeGreaterThanOrEqual(0);
    expect(wnetrze).toBe(zewnatrz);
  });

  it('największy obszar, który nie dotyka granicy, dostaje bramę do obszaru dotykającego granicy (nie tylko do największego)', () => {
    // ogrodzony teren 300 m x 300 m z murem z budynków (90 tys. kafelków) jest większy niż cała reszta kwadratu
    // (50 tys.), więc to on jest największym obszarem, ale nie dotyka granicy; ulice dookoła dotykają
    const uklad: Uklad = { c: [52, 21], kat: 0, bok: BOK };
    const cx = BOK;
    const mur = [
      budynek(rect(cx, -153, 312, 6, 0)),
      budynek(rect(cx, 153, 312, 6, 0)),
      budynek(rect(cx - 153, 0, 6, 312, 0)),
      budynek(rect(cx + 153, 0, 6, 312, 0)),
    ];
    const w = buildKwadrat(geoZ(mur), { seed: 1, uklad, sx: 1, sy: 0 });
    const reg = labelRegions(w.blocked, BOK);
    const wnetrze = reg[POL * BOK + POL];
    const zewnatrz = reg[20 * BOK + 20];
    expect(wnetrze).toBeGreaterThanOrEqual(0);
    expect(zewnatrz).toBeGreaterThanOrEqual(0);
    expect(wnetrze).toBe(zewnatrz);
    // brama to kilka kafelków wyciętych w murze (nie na brzegu kwadratu), reszta muru stoi
    const surowy = rastrujTeren(przygotujGeoKwadratu(geoZ(mur), uklad), BOK, BOK, 0, { skrawki: true });
    const wyciete: number[] = [];
    for (let i = 0; i < w.terr.length; i++)
      if (surowy.terr[i] === T.BUILDING && w.terr[i] !== T.BUILDING) wyciete.push(i);
    expect(wyciete.length).toBeGreaterThan(0);
    expect(wyciete.length).toBeLessThan(60);
    for (const i of wyciete) {
      expect(w.terr[i]).toBe(T.SIDEWALK);
      expect(i % BOK).toBeGreaterThan(0);
      expect(i % BOK).toBeLessThan(BOK - 1);
    }
    expect(w.terr.filter((t) => t === T.BUILDING).length).toBeGreaterThan(5000);
  });

  it('prawie pusty kwadrat się buduje: mniej niż 4 budynki, brak budynków, brak czegokolwiek', () => {
    const uklad = ukladTestowy(ZIELONKI);
    // prawdziwy kwadrat z trzema budynkami (pola)
    const rzadki = swiat(ZIELONKI, 1, 1);
    expect(rzadki.buildings.length).toBeLessThan(4);
    expect(rzadki.hq).toBe(-1);
    // ten sam kwadrat bez budynków
    const bezBudynkow = { ...geoKwadratuTestowego(ZIELONKI, -1, 1), b: [] };
    expect(() => buildKwadrat(bezBudynkow, { seed: 1, uklad, sx: -1, sy: 1 })).not.toThrow();
    const w = buildKwadrat(bezBudynkow, { seed: 1, uklad, sx: -1, sy: 1 });
    expect(w.buildings).toEqual([]);
    expect(w.terr.some((t) => t !== T.GRASS)).toBe(true);
    // zupełnie pusta geometria
    const pusty: Geo = { c: [50, 20], b: [], r: [], a: [], w: [], poi: [] };
    const p = buildKwadrat(pusty, { seed: 1, uklad, sx: 3, sy: -2 });
    expect(p.buildings).toEqual([]);
    expect(p.props).toEqual([]);
    expect(p.terr.every((t) => t === T.GRASS)).toBe(true);
  });

  it('kwadrat samej wody albo samego lasu się buduje (bez budynków, dróg i miejsc)', () => {
    const uklad = ukladTestowy(ZIELONKI);
    const okno = rect(BOK, 0, 2 * BOK, 2 * BOK, 0);
    const woda = buildKwadrat({ ...geoZ([]), a: [{ p: okno, k: 'water' }] }, { seed: 1, uklad, sx: 1, sy: 0 });
    expect(woda.buildings).toEqual([]);
    expect(woda.terr.every((t) => t === T.WATER)).toBe(true);
    expect(woda.blocked.every((b) => b === 1)).toBe(true);
    expect(woda.trees).toEqual([]);
    expect(woda.props).toEqual([]);
    const las = buildKwadrat({ ...geoZ([]), a: [{ p: okno, k: 'wood' }] }, { seed: 1, uklad, sx: 1, sy: 0 });
    expect(las.buildings).toEqual([]);
    expect(las.terr.every((t) => t === T.WOOD)).toBe(true);
    expect(las.trees.length).toBeGreaterThan(3000);
    for (const t of las.trees) expect(las.blocked[Math.floor(t.y) * BOK + Math.floor(t.x)]).toBe(1);
  });

  it('świat kwadratu da się narysować: buildScene nie rzuca i opisuje każdy budynek', () => {
    const w = swiat(PRZYMORZE, 0, -1);
    const sc = buildScene(w);
    expect(sc.chunks).toBe(12);
    expect(sc.styles.length).toBe(w.buildings.length);
    expect(sc.dryTree).toBe(-1);
    expect(sc.section).toBeNull();
  });

  it('budowanie jednego kwadratu trwa krótko', () => {
    const g = geoKwadratuTestowego(PRZYMORZE, 1, 1);
    const t0 = performance.now();
    buildKwadrat(g, { seed: 1, uklad: ukladTestowy(PRZYMORZE), sx: 1, sy: 1, geoDomu: geoDomuTestowego(PRZYMORZE) });
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('losowość tylko z ziarna kwadratu: ten sam kwadrat z tym samym ziarnem w innym przebiegu daje to samo', () => {
    const r = mulberry(3);
    for (let n = 0; n < 2; n++) {
      const a = ADDRESSES[Math.floor(r() * 3)];
      const sasiad = sasiedzi8(0, 0)[Math.floor(r() * 8)];
      const jeden = buildKwadrat(geoKwadratuTestowego(a, sasiad[0], sasiad[1]), {
        seed: 99,
        uklad: ukladTestowy(a),
        sx: sasiad[0],
        sy: sasiad[1],
      });
      const drugi = buildKwadrat(geoKwadratuTestowego(a, sasiad[0], sasiad[1]), {
        seed: 99,
        uklad: ukladTestowy(a),
        sx: sasiad[0],
        sy: sasiad[1],
      });
      expect(skrot(jeden.blocked)).toBe(skrot(drugi.blocked));
      expect(json(jeden.trees)).toBe(json(drugi.trees));
    }
  });
});

/* ---------- szwy z domem ---------- */

describe('buildKwadrat: szwy z domem (różne kąty obrotu)', () => {
  /** pas ±SZ kafelków wokół granicy dom–sąsiad (w kafelkach bezwzględnych); dalej od granicy dane sąsiada w narożnikach
      okna pośredniego już się kończą (zapas 318 m wokół jego środka), więc tam nie ma czego porównywać */
  const SZ = 24;
  function pas(sx: number, sy: number): [number, number, number, number] {
    const x = sx === 0 ? [-POL, POL] : sx > 0 ? [POL - SZ, POL + SZ] : [-POL - SZ, -POL + SZ];
    const y = sy === 0 ? [-POL, POL] : sy > 0 ? [POL - SZ, POL + SZ] : [-POL - SZ, -POL + SZ];
    return [x[0], x[1], y[0], y[1]];
  }

  type Wynik = ReturnType<typeof rastrujTeren>;
  /** opisy różnic terenu, przejścia i obecności budynku na kafelkach bezwzględnych [x0,x1)×[y0,y1) obu okien */
  function porownaj(
    opis: string,
    X: Wynik,
    xo: number,
    xy: number,
    Y: Wynik,
    yo: number,
    yy: number,
    p: [number, number, number, number],
  ): { roznice: string[]; budynki: number } {
    const roznice: string[] = [];
    let budynki = 0;
    for (let gy = Math.max(p[2], Math.max(xy, yy) - POL); gy < Math.min(p[3], Math.min(xy, yy) + POL); gy++)
      for (let gx = Math.max(p[0], Math.max(xo, yo) - POL); gx < Math.min(p[1], Math.min(xo, yo) + POL); gx++) {
        const i = (gy - xy + POL) * BOK + (gx - xo + POL);
        const j = (gy - yy + POL) * BOK + (gx - yo + POL);
        if (X.bid[i] >= 0) budynki++;
        if (X.terr[i] !== Y.terr[j] || X.blocked[i] !== Y.blocked[j] || X.bid[i] >= 0 !== Y.bid[j] >= 0) {
          const klucz = (R: Wynik, k: number) => (R.bid[k] >= 0 ? R.kept[R.bid[k]].b.t['zm:klucz'] : '-');
          roznice.push(
            `${opis} (${gx},${gy}) terr ${X.terr[i]}/${Y.terr[j]} blocked ${X.blocked[i]}/${Y.blocked[j]} budynek ${klucz(X, i)}/${klucz(Y, j)}`,
          );
        }
      }
    return { roznice, budynki };
  }

  for (const a of ADDRESSES) {
    it(`${a.key}: teren przy granicy z domem zgadza się z oknem przesuniętym o pół boku (osiem sąsiadów, z obu stron)`, () => {
      const uklad = ukladTestowy(a);
      const geoDomu = geoDomuTestowego(a);
      const domRaw = rastrujTeren(przygotujGeo(geoDomu, uklad.kat), BOK, 0, 0);
      let budynkowWPasach = 0;
      for (const [sx, sy] of sasiedzi8(0, 0)) {
        const przygotowane = przygotujGeoKwadratu(geoKwadratuTestowego(a, sx, sy), uklad, geoDomu);
        const srodek = rastrujTeren(przygotowane, BOK, sx * POL, sy * POL, { skrawki: true });
        const sasiadRaw = rastrujTeren(przygotowane, BOK, sx * BOK, sy * BOK, { skrawki: true });
        const p = pas(sx, sy);
        // strona domu: prawdziwy raster domu (z jego geo, bez skrawków) kontra okno pośrednie z geo sąsiada
        const wDomu = porownaj(`${a.key} ${sx},${sy} dom`, srodek, sx * POL, sy * POL, domRaw, 0, 0, p);
        // strona sąsiada: jego okno kontra okno pośrednie
        const uSasiada = porownaj(
          `${a.key} ${sx},${sy} sąsiad`,
          srodek,
          sx * POL,
          sy * POL,
          sasiadRaw,
          sx * BOK,
          sy * BOK,
          p,
        );
        // wyjątek bez powodu to błąd: w kafelkach testowych nie ma ani jednego (dom ma niepełny obrys tylko w kawałkach
        // mniejszych niż 4 m² daleko od granicy, patrz kwadraty-geo.test.ts)
        expect(wDomu.roznice).toEqual([]);
        expect(uSasiada.roznice).toEqual([]);
        budynkowWPasach += wDomu.budynki;
      }
      // pasy nie są puste: są w nich budynki
      expect(budynkowWPasach).toBeGreaterThan(300);
    });

    it(`${a.key}: prawdziwy świat domu i świat sąsiada różnią się od surowego rastra tylko bramami z kroku 9a, drzewami i wrakami`, () => {
      const uklad = ukladTestowy(a);
      const geoDomu = geoDomuTestowego(a);
      const domRaw = rastrujTeren(przygotujGeo(geoDomu, uklad.kat), BOK, 0, 0);
      const dom = buildWorld(geoDomu, { seed: 1 });
      const bramyDomu = domRaw.terr.reduce((n, t, i) => n + (t !== dom.terr[i] ? 1 : 0), 0);
      for (let i = 0; i < dom.terr.length; i++)
        if (dom.terr[i] !== domRaw.terr[i]) {
          expect([domRaw.terr[i], dom.terr[i]], `dom kafelek ${i}`).toEqual([T.BUILDING, T.SIDEWALK]);
          expect(dom.bid[i]).toBe(-1);
        }
      expect(bramyDomu).toBeLessThan(400);
      for (const [sx, sy] of sasiedzi8(0, 0)) {
        const g = geoKwadratuTestowego(a, sx, sy);
        const raw = rastrujTeren(przygotujGeoKwadratu(g, uklad, geoDomu), BOK, sx * BOK, sy * BOK, { skrawki: true });
        const w = swiat(a, sx, sy);
        let bramy = 0;
        for (let i = 0; i < w.terr.length; i++)
          if (w.terr[i] !== raw.terr[i]) {
            expect([raw.terr[i], w.terr[i]], `${a.key} ${sx},${sy} kafelek ${i}`).toEqual([T.BUILDING, T.SIDEWALK]);
            expect(w.bid[i]).toBe(-1);
            // brama nie leży na brzegu kwadratu (tam budynek jest przecięty i ciągnie się dalej u sąsiada)
            const x = i % BOK;
            const y = (i - x) / BOK;
            expect(x > 0 && y > 0 && x < BOK - 1 && y < BOK - 1, `${a.key} ${sx},${sy} brama na brzegu`).toBe(true);
            bramy++;
          }
        expect(bramy).toBeLessThan(400);
        // każdy kafelek zablokowany w świecie, a wolny w surowym rastrze, to pień drzewa albo wrak
        const zajete = new Set<number>();
        for (const t of w.trees) zajete.add(Math.floor(t.y) * BOK + Math.floor(t.x));
        for (const p of w.props)
          if (p.kind === 'wrak')
            for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) zajete.add(y * BOK + x);
        for (let i = 0; i < w.blocked.length; i++)
          if (w.blocked[i] && !raw.blocked[i]) expect(zajete.has(i), `${a.key} ${sx},${sy} kafelek ${i}`).toBe(true);
      }
    });
  }

  describe('reguła „dom wygrywa na szwie” na rastrze (budynek przecięty granicą kafelków)', () => {
    // budynek 80 m x 18 m przechylony o 7° leży na szwie dom–kwadrat (1, 0) (granica okien w x = 192 m od adresu); dom ma
    // z niego tylko kawałek A, sąsiad A i B. Kąt układu to 0, więc obrót nie zmienia nic oprócz prostowania.
    const uklad: Uklad = { c: [52, 21], kat: 0, bok: BOK };
    const kat = 7;
    const r = (kat * Math.PI) / 180;
    const srodekBudynku: Pt = [192 + 5, 0];
    const wzdluz = (od: number, doo: number): Pt[] => {
      const s = (od + doo) / 2;
      return rect(srodekBudynku[0] + s * Math.cos(r), srodekBudynku[1] + s * Math.sin(r), doo - od, 18, kat);
    };
    const A = wzdluz(-14, 0);
    const B = wzdluz(0, 66);
    const dom: Geo = geoZ([budynek(A)]);
    const sasiad: Geo = geoZ([budynek(B, A)]);

    it('z geo domu sąsiad zgadza się z domem na szwie, bez niego budynek przy szwie jest przekrzywiony', () => {
      const domRaw = rastrujTeren(przygotujGeo(dom, uklad.kat), BOK, 0, 0);
      const pasX: [number, number, number, number] = [192 - 16, 192 + 16, -POL, POL];
      for (const [geoDomu, zgodnie] of [
        [dom, true],
        [undefined, false],
      ] as const) {
        const prz = przygotujGeoKwadratu(sasiad, uklad, geoDomu);
        const srodek = rastrujTeren(prz, BOK, POL, 0, { skrawki: true });
        const { roznice, budynki } = porownaj('szew', srodek, POL, 0, domRaw, 0, 0, pasX);
        expect(budynki).toBeGreaterThan(50);
        if (zgodnie) expect(roznice).toEqual([]);
        else expect(roznice.length).toBeGreaterThan(5);
      }
    });

    it('kawałek domu jest taki jak w domu, a reszta budynku (dalej niż tolerancja od środka obrotu) zostaje, z pęknięciem mniejszym niż tolerancja', () => {
      const prz = przygotujGeoKwadratu(sasiad, uklad, dom);
      const b = prz.b[0];
      const pierwszy = przygotujGeo(dom, uklad.kat).b[0];
      // kawałek domu bit w bit jak w domu
      expect(b.pp?.[0]).toEqual(pierwszy.p);
      // kawałek B leży 66 m dalej, więc jego koniec ruszyłby się o ponad 3,5 m: zostaje taki, jaki był
      expect(b.p).toEqual(B);
      // wspólny bok kawałków A (od −14 do 0 m osi) i B (od 0 do 66 m) pęka o mniej niż tolerancja
      const [a0, a1] = [b.pp?.[0][1], b.pp?.[0][2]] as [Pt, Pt];
      const [b0, b1] = [b.p[0], b.p[3]] as [Pt, Pt];
      const pekniecie = Math.max(
        Math.sqrt((a0[0] - b0[0]) ** 2 + (a0[1] - b0[1]) ** 2),
        Math.sqrt((a1[0] - b1[0]) ** 2 + (a1[1] - b1[1]) ** 2),
      );
      expect(pekniecie).toBeGreaterThan(0.1);
      expect(pekniecie).toBeLessThan(3.5);
    });
  });
});
