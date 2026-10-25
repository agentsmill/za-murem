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
  przesunGeo,
  przesuniecieOsady,
  type SwiatOsady,
  wybierzOsade,
} from '../../src/ai/kwadrat.ts';
import { hashString } from '../../src/core/rng.ts';
import { mapaMieszkancow } from '../../src/sim/osiedle.ts';
import { naSiedzibie, siedzibaWKwadracie } from '../../src/ui/osadaWidok.ts';
import type { Geo } from '../../src/world/geo.ts';
import { kluczBudynku } from '../../src/world/klucze.ts';
import { type Uklad, ukladZGeo } from '../../src/world/kwadraty.ts';
import { buildKwadrat, type World } from '../../src/world/world.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';

type Demo = ReturnType<typeof wczytajDemo>;
type Dane = Awaited<ReturnType<typeof daneDema>>;

interface Przypadek {
  demo: string;
  seed: number;
  ziarno: number;
  swiat: SwiatOsady;
}

const DEMA = ['przymorze', 'lanciego'] as const;
const ZIARNA = [11, 12, 13, 14, 15];

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
    expect(przypadki.length).toBeGreaterThanOrEqual(6);
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
      // punkt siedziby leży w kwadracie, o którym mowa: jego środek jest nie dalej niż pół boku
      expect(Math.hypot(dx, dy)).toBeLessThan(d.uklad.bok * 1.6);
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
  it('tak w obrysie siedziby w jej kwadracie, nie obok, nie w innym budynku i nie w innym kwadracie', () => {
    const p = przypadki[0];
    const { kw } = swiatKwadratu(p);
    const d = demA[p.demo];
    const { sx, sy } = p.swiat;
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
      expect(naSiedzibie(kw, sx, sy, s.bid, x + 0.5, y + 0.5)).toBe(true);
      expect(naSiedzibie(kw, sx, sy, s.bid, x + 0.01, y + 0.99)).toBe(true);
    }
    for (const i of poza) {
      const x = (i % size) + sx * size;
      const y = Math.floor(i / size) + sy * size;
      expect(naSiedzibie(kw, sx, sy, s.bid, x + 0.5, y + 0.5)).toBe(false);
    }
    // ten sam kafelek w innym kwadracie (np. w domu) nie jest siedzibą osady
    const i = wObrysie[0];
    expect(naSiedzibie(kw, sx, sy, s.bid, i % size, Math.floor(i / size))).toBe(false);
    // poza mapą świata i ujemne
    expect(naSiedzibie(kw, sx, sy, s.bid, -3, -3)).toBe(false);
    expect(naSiedzibie(kw, sx, sy, s.bid, (sx + 1) * size + 0.5, sy * size + 0.5)).toBe(false);
    expect(naSiedzibie(kw, sx, sy, s.bid, sx * size - 0.01, sy * size + 5)).toBe(false);
    // inny numer budynku: nie
    expect(
      naSiedzibie(
        kw,
        sx,
        sy,
        s.bid + 1,
        (wObrysie[0] % size) + sx * size + 0.5,
        Math.floor(wObrysie[0] / size) + sy * size + 0.5,
      ),
    ).toBe(false);
  });
});
