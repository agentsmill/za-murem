/* Generator obszaru (src/mieszkancy/generuj.ts): budynki mieszkalne z kwadratu 384 m wokół adresu, każdy obsadzony
   na spis 2021 i postarzony do 2051 z upadkiem. Chodzi zawsze, na tabelach z public/data/mieszkancy/ i demach
   z public/demo/, bez surowych plików. Trygonometria wolno tutaj, w teście (w src/mieszkancy/ jest jedno miejsce). */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { obszarGminy, postarz } from '../../src/mieszkancy/czas.ts';
import {
  budynkiObszaru,
  generujBudynek,
  generujObszar,
  kronikaObszaru,
  type Nazwy,
  POL_KWADRATU,
} from '../../src/mieszkancy/generuj.ts';
import { bezPuliLokalnej, nazwiskaDlaGminy } from '../../src/mieszkancy/imiona.ts';
import { losDla, wazony } from '../../src/mieszkancy/los.ts';
import { type OdmianaPlik, rozpakujOdmiane, type TabelaKoncowek } from '../../src/mieszkancy/odmiana.ts';
import { marginesyDla } from '../../src/mieszkancy/rejon.ts';
import { obsadzBudynek } from '../../src/mieszkancy/spis.ts';
import type { TabeleGminy, TabeleImion, TabeleKraju, TabeleNazwisk } from '../../src/mieszkancy/tabele.ts';
import { type Budynek, type Osiedle, WERSJA_GENERATORA, type WynikBudynku } from '../../src/mieszkancy/typy.ts';
import type { Geo } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;

const DEMA: [string, TabeleGminy][] = [
  ['przymorze', gdansk],
  ['lanciego', ursynow],
  ['zielonki', zielonki],
];

const skrot = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** Środek obrysu budynku w metrach mapy (x na wschód, y na południe od `geo.c`), z jego szerokości i długości. */
function metry(geo: Geo, b: Budynek): [number, number] {
  const kx = 111320 * Math.cos((geo.c[0] * Math.PI) / 180);
  return [(b.lon - geo.c[1]) * kx, (geo.c[0] - b.lat) * 110574];
}

const przymorze = demo('przymorze');
const osiedle = generujObszar(przymorze, gdansk, kraj);

// ---------------------------------------------------------------- pełny zestaw tabel (imiona, nazwiska, odmiana, kronika)

const imiona = wczytaj<TabeleImion>('data/mieszkancy/imiona.json');
const odmiana = {
  tabela: rozpakujOdmiane(wczytaj<OdmianaPlik>('data/mieszkancy/odmiana.json')),
  koncowki: wczytaj<TabelaKoncowek>('data/mieszkancy/odmiana-koncowki.json'),
};
function nazwiskaGminy(g: TabeleGminy): TabeleNazwisk {
  const { plik, lokalne } = nazwiskaDlaGminy(g);
  const t = wczytaj<TabeleNazwisk>(`data/mieszkancy/nazwiska/${plik}.json`);
  return lokalne ? t : bezPuliLokalnej(t);
}
/** Pełny zestaw dla dema: imiona, nazwiska gminy, odmiana i kronika obszaru (R49). */
function pelneNazwy(geo: Geo, g: TabeleGminy): Nazwy {
  return {
    imiona,
    nazwiska: nazwiskaGminy(g),
    odmiana,
    kronika: kronikaObszaru(geo, budynkiObszaru(geo, g, kraj), imiona),
  };
}
let pelne: [string, Osiedle][] | undefined;
/** Trzy dema z pełnym zestawem, liczone raz na plik (leniwie, żeby inne testy nie czekały). */
const PELNE = (): [string, Osiedle][] => {
  if (!pelne) pelne = DEMA.map(([n, g]) => [n, generujObszar(demo(n), g, kraj, pelneNazwy(demo(n), g))]);
  return pelne;
};

describe('generujObszar i generujBudynek', () => {
  it('Przymorze dwa razy daje ten sam skrót JSON', () => {
    expect(skrot(generujObszar(przymorze, gdansk, kraj))).toBe(skrot(osiedle));
  });

  it('osiedle: wersja generatora, rok 2051, TERYT gminy, każdy budynek w 2051 z mieszkańcami', () => {
    expect(osiedle.wersja).toBe(WERSJA_GENERATORA);
    expect(osiedle.rok).toBe(2051);
    expect(osiedle.teryt).toBe('2261011');
    // w kwadracie Przymorza stoi 11 dużych budynków mieszkalnych (9 bloków), razem około 1 300 mieszkań
    expect(osiedle.budynki.length).toBeGreaterThan(5);
    for (const w of osiedle.budynki) expect(w.rok).toBe(2051);
    expect(osiedle.budynki.reduce((n, w) => n + w.osoby.filter((o) => o.stan === 'tu').length, 0)).toBeGreaterThan(
      1000,
    );
  });

  it('generujBudynek dla jednego budynku daje to samo co ten budynek w generujObszar', () => {
    const budynki = budynkiZGeo(przymorze, gdansk, kraj);
    for (const i of [0, Math.floor(osiedle.budynki.length / 2), osiedle.budynki.length - 1]) {
      const w = osiedle.budynki[i];
      const b = budynki.find((x) => x.klucz === w.budynek.klucz)!;
      expect(generujBudynek(b, gdansk, kraj), b.klucz).toEqual(w);
    }
  });

  it('generujBudynek to spis 2021, 2026 bez upadku i 2051 z upadkiem, z fachami i dawnymi zawodami na wierzchu', () => {
    const b = osiedle.budynki[0].budynek;
    const spis = obsadzBudynek(b, marginesyDla(gdansk, b.rejon), gdansk, kraj);
    const w2026 = postarz(spis, 2026, kraj, obszarGminy(gdansk), false);
    const wynik = JSON.parse(JSON.stringify(generujBudynek(b, gdansk, kraj))) as WynikBudynku;
    for (const o of wynik.osoby) {
      delete o.fach; // dopisuje je fachy.ts, test mieszkancy-fachy.test.ts pilnuje, że to jedyna różnica
      delete o.dawnyZawod;
    }
    expect(wynik).toEqual(postarz(w2026, 2051, kraj, obszarGminy(gdansk), true));
  });

  it('obszar to budynki ze środkiem obrysu w kwadracie 384 m wokół adresu, bez obrotu mapy (R22)', () => {
    expect(POL_KWADRATU).toBe(192);
    for (const [nazwa, g] of DEMA) {
      const geo = demo(nazwa);
      const wKwadracie = budynkiZGeo(geo, g, kraj)
        .filter((b) => {
          const [x, y] = metry(geo, b);
          return Math.abs(x) <= POL_KWADRATU && Math.abs(y) <= POL_KWADRATU;
        })
        .map((b) => b.klucz);
      const wynik = generujObszar(geo, g, kraj).budynki.map((w) => w.budynek.klucz);
      expect(wynik, nazwa).toEqual(wKwadracie);
      // wczytany promień jest większy od kwadratu, więc część budynków z mapy odpada
      expect(wynik.length, nazwa).toBeLessThan(budynkiZGeo(geo, g, kraj).length);
    }
  });

  it('bez gminy (szablon krajowy) daje wynik bez wyjątku', () => {
    const bez = generujObszar(przymorze, null, kraj);
    expect(bez.teryt).toBe('');
    expect(bez.budynki.length).toBe(osiedle.budynki.length);
    for (const w of bez.budynki) expect(w.budynek.rejon).toBe('');
    expect(bez.budynki.some((w) => w.osoby.some((o) => o.stan === 'tu'))).toBe(true);
  });

  // test czasu tylko z ZM_PERF=1: pod równoległym obciążeniem vitest mierzy zegar ściany, nie kod
  // (npm run mieszkancy zawsze wypisuje czasy)
  it.skipIf(!process.env.ZM_PERF)('cały obszar dema w Node poniżej 1500 ms (cel 200 ms, mediana z 3)', () => {
    for (const [nazwa, g] of DEMA) {
      const geo = demo(nazwa);
      const czasy: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        generujObszar(geo, g, kraj);
        czasy.push(performance.now() - t0);
      }
      czasy.sort((a, b) => a - b);
      expect(czasy[1], nazwa).toBeLessThan(1500);
    }
  });
});

describe('pełny generator na demach: rodzina', () => {
  it('ojciec jest 18-50 lat, a matka 15-49 lat starsza od dziecka, u każdej osoby (obecnej, nieobecnej i zmarłej)', () => {
    for (const [nazwa, o] of PELNE()) {
      const zle: string[] = [];
      let ojcow = 0;
      for (const w of o.budynki) {
        const wg = new Map(w.osoby.map((x) => [x.id, x]));
        for (const x of w.osoby) {
          const ojciec = x.ojciec === undefined ? undefined : wg.get(x.ojciec);
          const matka = x.matka === undefined ? undefined : wg.get(x.matka);
          if (ojciec) {
            ojcow++;
            const r = x.rocznik - ojciec.rocznik;
            if (r < 18 || r > 50) zle.push(`${x.id}: ojciec starszy o ${r} lat`);
          }
          if (matka) {
            const r = x.rocznik - matka.rocznik;
            if (r < 15 || r > 49) zle.push(`${x.id}: matka starsza o ${r} lat`);
          }
        }
      }
      expect(ojcow, nazwa).toBeGreaterThan(50);
      expect(zle, nazwa).toEqual([]);
    }
  });

  it('obecni domownicy nie dzielą imienia i nazwiska, chyba że to rodzic i dziecko', () => {
    for (const [nazwa, o] of PELNE()) {
      const zle: string[] = [];
      for (const w of o.budynki) {
        const wg = new Map(w.osoby.map((x) => [x.id, x]));
        for (const h of w.gospodarstwa) {
          const tu = h.czlonkowie.map((id) => wg.get(id)!).filter((x) => x.stan === 'tu');
          for (let i = 0; i < tu.length; i++) {
            for (let j = i + 1; j < tu.length; j++) {
              const [a, b] = [tu[i], tu[j]];
              if (a.imie !== b.imie || a.nazwisko !== b.nazwisko) continue;
              const rodzic = a.matka === b.id || a.ojciec === b.id || b.matka === a.id || b.ojciec === a.id;
              if (!rodzic) zle.push(`${h.id}: ${a.imie} ${a.nazwisko} ${a.rocznik} i ${b.rocznik}`);
            }
          }
        }
      }
      expect(zle, nazwa).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------- złote skróty

describe('złote skróty: wynik generatora przypięty do bajtu', () => {
  // Zmiana tylko z podbiciem WERSJA_GENERATORA. Skrót sha256 z JSON.stringify(generujObszar(…)) z pełnym zestawem
  // (imiona, nazwiska gminy, odmiana, kronika obszaru) dla każdego dema i pierwsze liczby ziarna. Inny skrót znaczy,
  // że te same dane i adres dają innych mieszkańców niż wcześniej: jeśli to zamierzone, podbij WERSJA_GENERATORA
  // i wpisz nowe skróty (test przy różnicy pokazuje otrzymany). Zapisane 18.10.2026 po fali poprawek z przeglądu
  // (R51, R52, R54). W gałęzi pelna-gra dema niosą identyfikatory OSM (gałąź swiat-id-budynkow), więc klucze budynków
  // to osm:<id> zamiast geograficznych i skróty są inne przy tym samym generatorze (bez podbicia wersji). Przepisane
  // 19.10.2026 po przegenerowaniu dem z toGeoT (gałąź dema-przegenerowane): budynki mają zm:klucz (px:…), klucze budynków
  // są inne, więc ziarna i mieszkańcy też, przy tym samym generatorze (bez podbicia wersji).
  const SKROTY: Record<string, string> = {
    przymorze: 'e52f97d31b31d265fdb918ea53817c205e13335f8529898370dfe995cdd87a79',
    lanciego: 'd2fdca7baefe4fab29c61625364736dd1e4307067affea1768be78778e60976a',
    zielonki: '6ddf008ce3fd2bae1344f73ff0cfb016ad67d4276e24a48a5298bf881bc2bbe8',
  };

  it('wersja generatora 1', () => {
    expect(WERSJA_GENERATORA).toBe(1);
  });

  it('skrót sha256 każdego dema z pełnym zestawem tabel', () => {
    for (const [nazwa, o] of PELNE()) expect(skrot(o), nazwa).toBe(SKROTY[nazwa]);
  });

  it('pierwsze liczby losDla("a", 1) i losowanie ważone', () => {
    const r = losDla('a', 1);
    expect([r(), r(), r()]).toEqual([0.9250533184967935, 0.6815912965685129, 0.02749735489487648]);
    expect(wazony(losDla('a', 1), [1, 2, 3, 4])).toBe(3);
    expect(wazony(losDla('wazony', 7), [5, 0, 3, 2])).toBe(3);
  });
});

describe('src/mieszkancy/generuj.ts: reguły modułu', () => {
  const plik = path.join(KORZEN, 'src/mieszkancy/generuj.ts');
  const zrodlo = fs.existsSync(plik)
    ? fs
        .readFileSync(plik, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
    : '';

  it('bez trygonometrii, potęg i logarytmów', () => {
    expect(zrodlo).toMatch(/export function generujObszar/);
    expect(zrodlo).not.toMatch(/Math\.(sin|cos|exp|log|pow|hypot|tan|atan|atan2|asin|acos|cbrt|expm1|log1p)\b/);
    expect(zrodlo).not.toMatch(/\*\*/);
  });

  it('nie importuje z sim, ui, render ani gov', () => {
    expect(zrodlo).not.toMatch(/from '\.\.\/(sim|ui|render|gov)\//);
  });
});
