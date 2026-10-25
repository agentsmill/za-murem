/* Ich kwadrat w widoku (src/ui/osadaWidok.ts i `geoKwadratuOsady` z src/ai/kwadrat.ts), etap 2 osady AI
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 5): po odkryciu osady jej kwadrat buduje się jak kwadrat
   z `?kwadraty=` (`buildKwadrat` z geo kwadratu SPRZED przesunięcia do siedziby, sklejony z domem), a w nim trzeba znaleźć
   siedzibę osady, żeby stanęła nad nią etykieta i żeby kliknięcie w nią otwierało kartę. Zapis osady trzyma geo już przesunięte
   (`SwiatOsady.geo`), więc geo kwadratu wraca z niego odwrotnym przesunięciem, które wynika z `c` obu geo (bez zmiany formatu
   zapisu). Sprawdzane na demach (Przymorze, Lanciego) i kilku ziarnach gry: przesunięcie i geo kwadratu zgadzają się z danymi
   dema co do punktu, siedziba w świecie kwadratu to ten sam budynek po kluczu (`zm:klucz`), a bez klucza po punkcie, etykieta
   leży na górnej krawędzi obrysu, a trafienie w siedzibę zna tylko jej obrys w jej kwadracie. */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  geoKwadratuOsady,
  PROMIEN_SIEDZIBY_M,
  przesunGeo,
  przesuniecieOsady,
  type SwiatOsady,
  wybierzOsade,
} from '../../src/ai/kwadrat.ts';
import { hashString } from '../../src/core/rng.ts';
import { mapaMieszkancow } from '../../src/sim/osiedle.ts';
import { nowaOsadaGry, osadaZZapisu, type StanOsady, TICK_STARTU_OSADY } from '../../src/ui/osada.ts';
import {
  MARGINES_ETYKIETY,
  naSiedzibie,
  obrysKwadratu,
  PROMIEN_SZUKANIA,
  polozenieEtykiety,
  siedzibaWKwadracie,
  zaslaniaNakladki,
} from '../../src/ui/osadaWidok.ts';
import type { Geo } from '../../src/world/geo.ts';
import { kluczBudynku } from '../../src/world/klucze.ts';
import { sasiedzi8, srodekKwadratu, type Uklad, ukladZGeo } from '../../src/world/kwadraty.ts';
import { buildKwadrat, type World } from '../../src/world/world.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';
import { ADDRESSES, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';

type Demo = ReturnType<typeof wczytajDemo>;
type Dane = Awaited<ReturnType<typeof daneDema>>;

interface Przypadek {
  demo: string;
  seed: number;
  ziarno: number;
  swiat: SwiatOsady;
}

const DEMA = ['przymorze', 'lanciego'] as const;
/** ziarna 1 i 2 dają na Przymorzu osadę na przekątnej (południowy wschód i północny zachód), reszta na bokach */
const ZIARNA = [1, 2, 11, 12, 13, 14, 15];

const demA: Record<string, { demo: Demo; dane: Dane; uklad: Uklad; seed: number; geoDomu: Geo }> = {};
const przypadki: Przypadek[] = [];

beforeAll(async () => {
  for (const nazwa of DEMA) {
    const demo = wczytajDemo(nazwa);
    const dane = await daneDema(nazwa);
    const uklad = ukladZGeo(demo.geo);
    const seed = Number.parseInt(hashString(demo.addr), 16) || 2051;
    demA[nazwa] = { demo, dane, uklad, seed, geoDomu: mapaMieszkancow(demo.geo, dane) };
    for (const ziarno of ZIARNA) {
      const swiat = wybierzOsade(ziarno, demo.kwadraty, dane, uklad);
      if (swiat) przypadki.push({ demo: nazwa, seed: ziarno, ziarno, swiat });
    }
  }
}, 180_000);

/** świat kwadratu osady tak, jak buduje go gra po odkryciu: geo kwadratu z odwrotnego przesunięcia, geo domu do prostowania */
function swiatKwadratu(p: Przypadek): { kw: World; geoKw: Geo } {
  const d = demA[p.demo];
  const geoKw = geoKwadratuOsady(p.swiat.geo, d.uklad);
  const kw = buildKwadrat(geoKw, { seed: p.seed, uklad: d.uklad, sx: p.swiat.sx, sy: p.swiat.sy, geoDomu: d.geoDomu });
  return { kw, geoKw };
}

const kluczSiedziby = (s: SwiatOsady): string | null => kluczBudynku(s.world.buildings[s.world.hq]);

describe('przesunięcie i geo kwadratu osady z jej geo', () => {
  it('mamy przypadki do sprawdzenia na obu demach', () => {
    expect(przypadki.length).toBeGreaterThanOrEqual(8);
    expect(new Set(przypadki.map((p) => p.demo))).toEqual(new Set(DEMA));
  });

  it('przesunięcie to punkt siedziby na siatce 0,5 m, a geo osady to geo kwadratu o to przesunięte', () => {
    for (const p of przypadki) {
      const d = demA[p.demo];
      const orig = d.demo.kwadraty[p.swiat.klucz];
      const [dx, dy] = przesuniecieOsady(p.swiat.geo, d.uklad);
      expect(dx * 2).toBe(Math.round(dx * 2));
      expect(dy * 2).toBe(Math.round(dy * 2));
      const przesuniete = przesunGeo(orig, dx, dy);
      expect(przesuniete.b, `${p.demo} ${p.seed} budynki`).toEqual(p.swiat.geo.b);
      expect(przesuniete.r).toEqual(p.swiat.geo.r);
      expect(przesuniete.a).toEqual(p.swiat.geo.a);
      expect(przesuniete.w).toEqual(p.swiat.geo.w);
      // punkt siedziby leży w pobliżu środka kwadratu, o którym mowa (budynek w promieniu wyboru siedziby, punkt w jego obrysie)
      const [cx, cy] = srodekKwadratu(d.uklad, p.swiat.sx, p.swiat.sy);
      expect(Math.hypot(dx - cx, dy - cy), `${p.demo} ${p.seed} (${p.swiat.klucz})`).toBeLessThanOrEqual(
        PROMIEN_SIEDZIBY_M + 80,
      );
    }
  });

  it('geoKwadratuOsady oddaje geo kwadratu z dema punkt w punkt (budynki, drogi, tereny, wody, punkty, c)', () => {
    for (const p of przypadki) {
      const d = demA[p.demo];
      const orig = d.demo.kwadraty[p.swiat.klucz];
      const g = geoKwadratuOsady(p.swiat.geo, d.uklad);
      expect(g.c, `${p.demo} ${p.seed} c`).toEqual(orig.c);
      expect(g.b).toEqual(orig.b);
      expect(g.r).toEqual(orig.r);
      expect(g.a).toEqual(orig.a);
      expect(g.w).toEqual(orig.w);
      expect(g.pass).toEqual(orig.pass);
      expect(g.poi.map((q) => [q.x, q.y, q.k])).toEqual(orig.poi.map((q) => [q.x, q.y, q.k]));
      expect(g.rodzaje?.map((q) => [q.x, q.y])).toEqual(orig.rodzaje?.map((q) => [q.x, q.y]));
    }
  });

  it('nie rusza wejścia', () => {
    const p = przypadki[0];
    const przed = JSON.stringify(p.swiat.geo);
    geoKwadratuOsady(p.swiat.geo, demA[p.demo].uklad);
    expect(JSON.stringify(p.swiat.geo)).toBe(przed);
  });

  it('prawdziwy adres: geo kwadratu z kafelków przesunięte do punktu wraca co do wartości, a przesunięcie odczytuje się z c', () => {
    // `c` geo z kafelków (`geoKwadratu` z src/world/geoKwadratu.ts) to środek układu domu, tak samo jak w demach
    for (const a of ADDRESSES) {
      const u = ukladTestowy(a);
      for (const [sx, sy] of sasiedzi8(0, 0)) {
        const g = geoKwadratuTestowego(a, sx, sy);
        for (const [dx, dy] of [
          [127.5, -203],
          [-310, 88.5],
          [0, 0],
        ] as const) {
          const przesuniete = przesunGeo(g, dx, dy);
          expect(przesuniecieOsady(przesuniete, u), `${a.key} ${sx},${sy} (${dx}, ${dy})`).toEqual([dx, dy]);
          const wraca = geoKwadratuOsady(przesuniete, u);
          // co do wartości (minus zero z danych wraca jako zero, więc przez JSON, który ich nie rozróżnia)
          expect(wraca.c).toEqual(g.c);
          expect(JSON.stringify(wraca.b)).toBe(JSON.stringify(g.b));
          expect(JSON.stringify(wraca.r)).toBe(JSON.stringify(g.r));
          expect(JSON.stringify(wraca.a)).toBe(JSON.stringify(g.a));
          expect(JSON.stringify(wraca.w)).toBe(JSON.stringify(g.w));
        }
      }
    }
  });

  it('zapis i wczytanie geo (JSON) nie zmieniają wyniku', () => {
    const p = przypadki[0];
    const d = demA[p.demo];
    const zJsona = JSON.parse(JSON.stringify(p.swiat.geo)) as Geo;
    expect(geoKwadratuOsady(zJsona, d.uklad)).toEqual(geoKwadratuOsady(p.swiat.geo, d.uklad));
    expect(przesuniecieOsady(zJsona, d.uklad)).toEqual(przesuniecieOsady(p.swiat.geo, d.uklad));
  });
});

describe('siedziba osady w świecie kwadratu', () => {
  it('po kluczu budynku: ten sam budynek co siedziba w świecie osady', () => {
    for (const p of przypadki) {
      const { kw } = swiatKwadratu(p);
      const d = demA[p.demo];
      const klucz = kluczSiedziby(p.swiat);
      expect(klucz, 'siedziba ma klucz budynku').not.toBeNull();
      const s = siedzibaWKwadracie(
        kw,
        { klucz, sx: p.swiat.sx, sy: p.swiat.sy, punkt: przesuniecieOsady(p.swiat.geo, d.uklad) },
        d.uklad.kat,
      );
      expect(s, `${p.demo} ${p.seed}`).not.toBeNull();
      expect(s!.skad).toBe('klucz');
      expect(kluczBudynku(kw.buildings[s!.bid])).toBe(klucz);
      // ma największy obrys wśród kawałków o tym kluczu
      const takieSame = kw.buildings.filter((b) => kluczBudynku(b) === klucz);
      expect(kw.buildings[s!.bid].tiles).toBe(Math.max(...takieSame.map((b) => b.tiles)));
    }
  });

  it('bez klucza po punkcie przesunięcia: ten sam budynek', () => {
    for (const p of przypadki) {
      const { kw } = swiatKwadratu(p);
      const d = demA[p.demo];
      const punkt = przesuniecieOsady(p.swiat.geo, d.uklad);
      const poKluczu = siedzibaWKwadracie(
        kw,
        { klucz: kluczSiedziby(p.swiat), sx: p.swiat.sx, sy: p.swiat.sy, punkt },
        d.uklad.kat,
      )!;
      const poPunkcie = siedzibaWKwadracie(kw, { klucz: null, sx: p.swiat.sx, sy: p.swiat.sy, punkt }, d.uklad.kat);
      expect(poPunkcie, `${p.demo} ${p.seed}`).not.toBeNull();
      expect(poPunkcie!.skad).toBe('punkt');
      expect(poPunkcie!.bid).toBe(poKluczu.bid);
    }
  });

  it('nieznany klucz zamienia się w szukanie po punkcie, a bez jednego i drugiego jest null', () => {
    const p = przypadki[0];
    const { kw } = swiatKwadratu(p);
    const d = demA[p.demo];
    const punkt = przesuniecieOsady(p.swiat.geo, d.uklad);
    const o = { sx: p.swiat.sx, sy: p.swiat.sy };
    const zlyKlucz = siedzibaWKwadracie(kw, { ...o, klucz: 'px:0:0:0:0:3', punkt }, d.uklad.kat);
    expect(zlyKlucz?.skad).toBe('punkt');
    // punkt daleko poza kwadratem i brak klucza: nic
    expect(siedzibaWKwadracie(kw, { ...o, klucz: null, punkt: [90000, 90000] }, d.uklad.kat)).toBeNull();
    expect(siedzibaWKwadracie(kw, { ...o, klucz: 'px:0:0:0:0:3', punkt: [90000, 90000] }, d.uklad.kat)).toBeNull();
  });

  it('etykieta leży na górnej krawędzi obrysu (kafelek w górnym rzędzie), a środek w obrysie albo przy nim', () => {
    for (const p of przypadki) {
      const { kw } = swiatKwadratu(p);
      const d = demA[p.demo];
      const s = siedzibaWKwadracie(
        kw,
        {
          klucz: kluczSiedziby(p.swiat),
          sx: p.swiat.sx,
          sy: p.swiat.sy,
          punkt: przesuniecieOsady(p.swiat.geo, d.uklad),
        },
        d.uklad.kat,
      )!;
      const size = kw.size;
      // współrzędne etykiety w kafelkach układu miasta: kwadrat (sx, sy) zaczyna się w (sx·size, sy·size)
      const lx = s.etykieta.x - p.swiat.sx * size;
      const ly = s.etykieta.y - p.swiat.sy * size;
      expect(lx).toBeGreaterThanOrEqual(0);
      expect(ly).toBeGreaterThanOrEqual(0);
      expect(lx).toBeLessThan(size);
      expect(ly).toBeLessThan(size);
      // kafelek tuż pod linią etykiety i jej środkiem w poziomie należy do siedziby
      expect(kw.bid[Math.floor(ly) * size + Math.floor(lx)]).toBe(s.bid);
      // nad nim (wiersz wyżej) siedziby w tej kolumnie już nie ma: to górna krawędź
      expect(kw.bid[(Math.floor(ly) - 1) * size + Math.floor(lx)]).not.toBe(s.bid);
      // w całym obrysie nie ma kafelka wyżej
      let min = Number.POSITIVE_INFINITY;
      for (let i = 0; i < size * size; i++) if (kw.bid[i] === s.bid) min = Math.min(min, Math.floor(i / size));
      expect(Math.floor(ly)).toBe(min);
    }
  });

  it('środek obrysu (do kamery i mapy) leży w kwadracie osady', () => {
    for (const p of przypadki) {
      const { kw } = swiatKwadratu(p);
      const d = demA[p.demo];
      const s = siedzibaWKwadracie(
        kw,
        {
          klucz: kluczSiedziby(p.swiat),
          sx: p.swiat.sx,
          sy: p.swiat.sy,
          punkt: przesuniecieOsady(p.swiat.geo, d.uklad),
        },
        d.uklad.kat,
      )!;
      const size = kw.size;
      expect(s.srodek.x).toBeGreaterThan(p.swiat.sx * size);
      expect(s.srodek.x).toBeLessThan((p.swiat.sx + 1) * size);
      expect(s.srodek.y).toBeGreaterThan(p.swiat.sy * size);
      expect(s.srodek.y).toBeLessThan((p.swiat.sy + 1) * size);
    }
  });
});

describe('trafienie w siedzibę osady', () => {
  it('tak w obrysie siedziby w jej kwadracie, nie obok, nie w innym budynku i nie w innym kwadracie (każdy kwadrat osady)', () => {
    const kwadraty = new Set<string>();
    for (const p of przypadki) {
      const { kw } = swiatKwadratu(p);
      const d = demA[p.demo];
      const { sx, sy } = p.swiat;
      kwadraty.add(`${sx},${sy}`);
      const s = siedzibaWKwadracie(
        kw,
        { klucz: kluczSiedziby(p.swiat), sx, sy, punkt: przesuniecieOsady(p.swiat.geo, d.uklad) },
        d.uklad.kat,
      )!;
      const size = kw.size;
      const wObrysie: number[] = [];
      const poza: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if (kw.bid[i] === s.bid) wObrysie.push(i);
        else if (poza.length < 50 && i % 997 === 0) poza.push(i);
      }
      expect(wObrysie.length).toBeGreaterThan(20);
      // środki kafelków obrysu i ich rogi (x, y z ułamkiem) trafiają; to samo w układzie miasta (z przesunięciem kwadratu)
      for (const i of wObrysie.filter((_, k) => k % 7 === 0)) {
        const x = (i % size) + sx * size;
        const y = Math.floor(i / size) + sy * size;
        expect(naSiedzibie(kw, sx, sy, s.bid, x + 0.5, y + 0.5), `${p.demo} ${p.seed} (${sx},${sy})`).toBe(true);
        expect(naSiedzibie(kw, sx, sy, s.bid, x + 0.01, y + 0.99)).toBe(true);
      }
      for (const i of poza) {
        const x = (i % size) + sx * size;
        const y = Math.floor(i / size) + sy * size;
        expect(naSiedzibie(kw, sx, sy, s.bid, x + 0.5, y + 0.5)).toBe(false);
      }
      // ten sam kafelek bez przesunięcia kwadratu (jakby był w domu) nie jest siedzibą osady
      const i = wObrysie[0];
      expect(naSiedzibie(kw, sx, sy, s.bid, i % size, Math.floor(i / size))).toBe(false);
      // poza mapą świata, na granicy sąsiedniego kwadratu i ujemne
      expect(naSiedzibie(kw, sx, sy, s.bid, -3, -3)).toBe(false);
      expect(naSiedzibie(kw, sx, sy, s.bid, (sx + 1) * size + 0.5, sy * size + 0.5)).toBe(false);
      expect(naSiedzibie(kw, sx, sy, s.bid, sx * size - 0.01, sy * size + 5)).toBe(false);
      // inny numer budynku: nie
      const x0 = (wObrysie[0] % size) + sx * size + 0.5;
      const y0 = Math.floor(wObrysie[0] / size) + sy * size + 0.5;
      expect(naSiedzibie(kw, sx, sy, s.bid + 1, x0, y0)).toBe(false);
    }
    // sprawdzono i kwadraty ze współrzędną zerową, i bez zera (przesunięcie po obu osiach)
    expect([...kwadraty].some((k) => !k.startsWith('0,') && !k.endsWith(',0'))).toBe(true);
  });
});

/** mały świat do prób siedziby: kwadrat size × size, budynki jako prostokąty kafelków (id = indeks), tagi klucza opcjonalne */
function malySwiat(
  size: number,
  budynki: { x0: number; y0: number; x1: number; y1: number; klucz?: string; tiles?: number }[],
): Pick<World, 'size' | 'bid' | 'buildings'> {
  const bid = new Int32Array(size * size).fill(-1);
  const buildings = budynki.map((b, id) => {
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        bid[y * size + x] = id;
        n++;
      }
    return {
      id,
      x0: b.x0,
      y0: b.y0,
      x1: b.x1,
      y1: b.y1,
      tiles: b.tiles ?? n,
      tags: b.klucz ? { 'zm:klucz': b.klucz, 'zm:os': '0,0,1,1' } : {},
    };
  }) as unknown as World['buildings'];
  return { size, bid, buildings };
}

describe('siedzibaWKwadracie na małym świecie (kawałki jednego budynku, szukanie po punkcie)', () => {
  const SIZE = 40;
  /** punkt w metrach od adresu bez obrotu dla kafelka (tx, ty) kwadratu (0, 0) przy kącie 0: środek kafelka */
  const punktKafelka = (tx: number, ty: number): [number, number] => [tx + 0.5 - SIZE / 2, ty + 0.5 - SIZE / 2];
  const KLUCZ = 'px:1:2:3:4:3';

  it('budynek przecięty granicą okna (dwa kawałki o tym samym kluczu): wygrywa ten o największym obrysie, niezależnie od kolejności', () => {
    for (const odwroc of [false, true]) {
      const lista = [
        { x0: 2, y0: 2, x1: 5, y1: 5, klucz: KLUCZ }, // 16 kafelków
        { x0: 20, y0: 20, x1: 29, y1: 29, klucz: KLUCZ }, // 100 kafelków
        { x0: 8, y0: 2, x1: 12, y1: 5, klucz: 'px:9:9:9:9:3' }, // inny klucz, 20 kafelków
      ];
      const kw = malySwiat(SIZE, odwroc ? [...lista].reverse() : lista);
      const s = siedzibaWKwadracie(kw, { klucz: KLUCZ, sx: 0, sy: 0, punkt: [0, 0] }, 0)!;
      expect(s.skad).toBe('klucz');
      expect(kw.buildings[s.bid].tiles).toBe(100);
    }
  });

  it('bez klucza: budynek najbliżej punktu w promieniu szukania, wcześniejszy przy remisie, a dalej null', () => {
    const kw = malySwiat(SIZE, [
      { x0: 5, y0: 5, x1: 8, y1: 8 },
      { x0: 30, y0: 30, x1: 34, y1: 34 },
    ]);
    const szukaj = (tx: number, ty: number) =>
      siedzibaWKwadracie(kw, { klucz: null, sx: 0, sy: 0, punkt: punktKafelka(tx, ty) }, 0);
    // w obrysie
    expect(szukaj(6, 6)?.bid).toBe(0);
    // obok obrysu: dwa i pięć kafelków od niego (środek kafelka 3 leży 2,5 kafelka od kafelka 5)
    expect(szukaj(3, 6)?.bid).toBe(0);
    expect(szukaj(0, 6)?.bid).toBe(0);
    expect(szukaj(0, 6)?.skad).toBe('punkt');
    // dalej niż promień szukania: nic
    expect(szukaj(5 + 4 + PROMIEN_SZUKANIA + 1, 6 + 20)).toBeNull();
    // bliżej drugiego budynku
    expect(szukaj(28, 32)?.bid).toBe(1);
    // punkt poza oknem kwadratu: nic, bez wyjątku
    expect(siedzibaWKwadracie(kw, { klucz: null, sx: 0, sy: 0, punkt: [9999, -9999] }, 0)).toBeNull();
  });

  it('kwadrat poza domem: punkt w układzie geo przesuwa się o kwadrat (sx, sy) i obraca o kąt układu', () => {
    const kw = malySwiat(SIZE, [{ x0: 5, y0: 5, x1: 8, y1: 8 }]);
    // kwadrat (1, −1): kafelek (6, 6) tego okna to w układzie obróconym punkt (6,5 − 20 + 40, 6,5 − 20 − 40) = (26,5; −53,5)
    const obrocony: [number, number] = [26.5, -53.5];
    for (const kat of [0, 0.3, -0.6]) {
      // w układzie geo (bez obrotu) ten sam punkt leży tam, gdzie cofnięty obrót go ustawia (jak `srodekKwadratu`)
      const c = Math.cos(kat);
      const sn = Math.sin(kat);
      const geoPunkt: [number, number] = [obrocony[0] * c + obrocony[1] * sn, obrocony[1] * c - obrocony[0] * sn];
      const s = siedzibaWKwadracie(kw, { klucz: null, sx: 1, sy: -1, punkt: geoPunkt }, kat);
      expect(s?.bid, `kąt ${kat}`).toBe(0);
    }
  });
});

describe('OsadaGry.kwadrat: dane ich kwadratu dla widoku, także po zapisie i wczytaniu', () => {
  it('przed startem i bez osady null, po starcie geo kwadratu z dema, punkt i klucz siedziby', () => {
    const d = demA.przymorze;
    const osada = nowaOsadaGry(d.seed, d.dane, d.uklad);
    expect(osada.kwadrat()).toBeNull();
    osada.dane(d.demo.kwadraty);
    osada.krok(TICK_STARTU_OSADY - 1);
    expect(osada.kwadrat()).toBeNull();
    osada.krok(TICK_STARTU_OSADY);
    const kw = osada.kwadrat();
    expect(kw).not.toBeNull();
    const s = osada.swiat!;
    expect(kw!.sx).toBe(s.sx);
    expect(kw!.sy).toBe(s.sy);
    // geo kwadratu z dema punkt w punkt, ze środkiem układu domu
    const orig = d.demo.kwadraty[s.klucz];
    expect(kw!.geo.b).toEqual(orig.b);
    expect(kw!.geo.c).toEqual(orig.c);
    expect(kw!.punkt).toEqual(przesuniecieOsady(s.geo, d.uklad));
    expect(kw!.kluczSiedziby).toBe(kluczBudynku(s.world.buildings[s.world.hq]));
    expect(kw!.kluczSiedziby).not.toBeNull();
  }, 120_000);

  it('wczytana z zapisu daje to samo co żywa (także po odkryciu), a stany czeka i brak null', () => {
    const d = demA.przymorze;
    const zywa = nowaOsadaGry(d.seed, d.dane, d.uklad);
    zywa.dane(d.demo.kwadraty);
    zywa.krok(TICK_STARTU_OSADY + 400);
    zywa.odkryj({ dzien: 4, ludnosc: 4, budowle: 1 });
    const zapis = JSON.parse(JSON.stringify(zywa.zapisz())) as StanOsady;
    const wczytana = osadaZZapisu(zapis, d.seed, d.dane, d.uklad);
    expect(wczytana.stan).toBe('jest');
    expect(wczytana.kwadrat()).toEqual(zywa.kwadrat());
    expect(wczytana.odkryta).toBe(true);
    expect(osadaZZapisu({ v: 1, stan: 'czeka' }, d.seed, d.dane, d.uklad).kwadrat()).toBeNull();
    expect(osadaZZapisu({ v: 1, stan: 'brak', powod: 'dane' }, d.seed, d.dane, d.uklad).kwadrat()).toBeNull();
    expect(nowaOsadaGry(d.seed, d.dane, d.uklad, 'zombie').kwadrat()).toBeNull();
  }, 120_000);
});

describe('obrysKwadratu: kwadrat osady na mapie miasta (metry od adresu bez obrotu)', () => {
  it('cztery rogi kwadratu o boku układu wokół jego środka, a punkt siedziby leży wewnątrz', () => {
    for (const p of przypadki) {
      const d = demA[p.demo];
      const obrys = obrysKwadratu(d.uklad, p.swiat.sx, p.swiat.sy);
      expect(obrys).toHaveLength(4);
      // środek rogów to środek kwadratu w układzie geo (`srodekKwadratu`)
      const [cx, cy] = srodekKwadratu(d.uklad, p.swiat.sx, p.swiat.sy);
      expect(obrys.reduce((a, q) => a + q[0], 0) / 4).toBeCloseTo(cx, 6);
      expect(obrys.reduce((a, q) => a + q[1], 0) / 4).toBeCloseTo(cy, 6);
      // boki mają bok kwadratu, a kąty są proste
      for (let i = 0; i < 4; i++) {
        const a = obrys[i];
        const b = obrys[(i + 1) % 4];
        const c = obrys[(i + 2) % 4];
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(d.uklad.bok, 6);
        expect((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])).toBeCloseTo(0, 4);
      }
      // siedziba (punkt przesunięcia geo) leży w kwadracie: po tej samej stronie każdego boku co środek
      const [px, py] = przesuniecieOsady(p.swiat.geo, d.uklad);
      for (let i = 0; i < 4; i++) {
        const a = obrys[i];
        const b = obrys[(i + 1) % 4];
        const bok = (x: number, y: number) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        expect(Math.sign(bok(px, py)), `${p.demo} ${p.seed} bok ${i}`).toBe(Math.sign(bok(cx, cy)));
      }
    }
  });

  it('dom (0, 0) ma obrys kwadratu o środku w adresie', () => {
    const u = demA.przymorze.uklad;
    const o = obrysKwadratu(u, 0, 0);
    expect(o.reduce((a, q) => a + q[0], 0) / 4).toBeCloseTo(0, 6);
    expect(o.reduce((a, q) => a + q[1], 0) / 4).toBeCloseTo(0, 6);
  });
});

describe('położenie etykiety nad siedzibą i ustępowanie nakładkom', () => {
  it('napis wyśrodkowany nad kotwicą, 10 px od niej, bez przesunięcia, gdy mieści się na ekranie', () => {
    const { przesuniecie, rect } = polozenieEtykiety(500, 300, 160, 24, 1440);
    expect(przesuniecie).toBe(0);
    expect(rect).toEqual({ l: 420, t: 266, r: 580, b: 300 });
  });

  it('przy brzegu ekranu napis przesuwa się do środka o tyle, ile trzeba, z marginesem, a kotwica zostaje', () => {
    // lewy brzeg: napis zaczynałby się w −30, a ma zacząć w 4
    const lewo = polozenieEtykiety(50, 300, 160, 24, 1440);
    expect(lewo.rect.l).toBe(MARGINES_ETYKIETY);
    expect(lewo.przesuniecie).toBe(MARGINES_ETYKIETY - (50 - 80));
    // prawy brzeg: napis kończyłby się w 1470, a ma kończyć się w 1436
    const prawo = polozenieEtykiety(1390, 300, 160, 24, 1440);
    expect(prawo.rect.r).toBe(1440 - MARGINES_ETYKIETY);
    expect(prawo.przesuniecie).toBe(-34);
    // w obu wypadkach napis ma ten sam rozmiar, a jego dolna krawędź leży na kotwicy
    for (const w of [lewo, prawo]) {
      expect(w.rect.r - w.rect.l).toBe(160);
      expect(w.rect.b).toBe(300);
    }
  });

  it('nakładka, na którą napis wchodzi, go zasłania; styk krawędzi i nakładki dalej nie', () => {
    const napis = { l: 100, t: 100, r: 200, b: 130 };
    expect(zaslaniaNakladki(napis, [])).toBe(false);
    expect(zaslaniaNakladki(napis, [{ l: 150, t: 120, r: 400, b: 400 }])).toBe(true);
    // wchodzi z każdej strony
    expect(zaslaniaNakladki(napis, [{ l: 0, t: 0, r: 101, b: 101 }])).toBe(true);
    expect(zaslaniaNakladki(napis, [{ l: 199, t: 129, r: 300, b: 300 }])).toBe(true);
    // tylko się stykają
    expect(zaslaniaNakladki(napis, [{ l: 200, t: 100, r: 300, b: 130 }])).toBe(false);
    expect(zaslaniaNakladki(napis, [{ l: 100, t: 130, r: 200, b: 200 }])).toBe(false);
    expect(zaslaniaNakladki(napis, [{ l: 0, t: 0, r: 100, b: 100 }])).toBe(false);
    // jedna z wielu wystarczy
    expect(
      zaslaniaNakladki(napis, [
        { l: 500, t: 500, r: 600, b: 600 },
        { l: 190, t: 110, r: 250, b: 120 },
      ]),
    ).toBe(true);
  });
});
