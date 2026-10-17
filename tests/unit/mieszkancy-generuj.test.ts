/* Generator obszaru (src/mieszkancy/generuj.ts): budynki mieszkalne z kwadratu 384 m wokół adresu, każdy obsadzony
   na spis 2021 i postarzony do 2051 z upadkiem. Chodzi zawsze, na tabelach z public/data/mieszkancy/ i demach
   z public/demo/, bez surowych plików. Trygonometria wolno tutaj, w teście (w src/mieszkancy/ jest jedno miejsce). */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { obszarGminy, postarz } from '../../src/mieszkancy/czas.ts';
import { generujBudynek, generujObszar, POL_KWADRATU } from '../../src/mieszkancy/generuj.ts';
import { marginesyDla } from '../../src/mieszkancy/rejon.ts';
import { obsadzBudynek } from '../../src/mieszkancy/spis.ts';
import type { TabeleGminy, TabeleKraju } from '../../src/mieszkancy/tabele.ts';
import { type Budynek, WERSJA_GENERATORA } from '../../src/mieszkancy/typy.ts';
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

  it('generujBudynek to spis 2021, 2026 bez upadku i 2051 z upadkiem', () => {
    const b = osiedle.budynki[0].budynek;
    const spis = obsadzBudynek(b, marginesyDla(gdansk, b.rejon), gdansk, kraj);
    const w2026 = postarz(spis, 2026, kraj, obszarGminy(gdansk), false);
    expect(generujBudynek(b, gdansk, kraj)).toEqual(postarz(w2026, 2051, kraj, obszarGminy(gdansk), true));
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

  it('cały obszar dema w Node poniżej 1500 ms (cel 200 ms, mediana z 3)', () => {
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
