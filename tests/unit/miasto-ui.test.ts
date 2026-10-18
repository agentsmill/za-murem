/* Okno mapy miasta i karta miejsca (src/ui/miasto.ts, docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Mapa
   miasta i minimapa na ekranie”): rzut widoku i jego odwrotność, przybliżanie z punktem pod kursorem, trafienie
   w ikonę, które kafelki widok zamawia, scalanie miejsc z okolicy i z kafelków, karta miejsca w obu językach, okno
   z atrybucją map. Bez przeglądarki: rysowanie na płótnie oglądają zrzuty (`npm run shots -- miasto-mapa`). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Lang, type Tx, ustawJezyk } from '../../src/core/jezyk.ts';
import { wyslijWyprawe } from '../../src/gov/dzienne.ts';
import type { GovInput, GovState } from '../../src/gov/typy.ts';
import { celZMiejsca, czasWyprawyMin, MAX_DROGA_M, wlaczMiasto, zostaloZMiejsca } from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import {
  dolaczMiejsca,
  IKONY,
  ikonaKategorii,
  kafelkiWidoku,
  kartaHtml,
  kartaMiejsca,
  M_NA_PIKSEL_MAX,
  M_NA_PIKSEL_MIN,
  MAX_KAFELKOW_14,
  MAX_RYSUNKOW_12,
  mapaMiastaSheet,
  odwrotnie,
  PamiecKafelkow,
  przybliz,
  przytnijPamiec,
  rzut,
  trafiony,
  type Widok,
  ZASIEG_MIASTA_M,
} from '../../src/ui/miasto.ts';
import type { LatLon } from '../../src/world/klucze.ts';
import { type Miejsce, miejscaZPoi, uzupelnijKlucze } from '../../src/world/miasto.ts';
import { kafelkiProstokata, poiZKafelkow } from '../../src/world/miastoKafelki.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';
import { Atrapa } from './gov-atrapa.ts';
import { polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

const C: LatLon = [54.4093, 18.5991];

const miejsce = (klucz: string, kat: string, x: number, y: number, nazwa = ''): Miejsce => ({
  klucz,
  kat,
  x,
  y,
  odl: Math.sqrt(x * x + y * y),
  nazwa,
});

/** miejsce z zapasem co najmniej `min` (pierwszy klucz, który go ma) */
function zZapasem(kat: string, x: number, y: number, min = 4, od = 0): Miejsce {
  for (let k = od; k < od + 500; k++) {
    const m = miejsce(`poi:${k}:7`, kat, x, y);
    const z = celZMiejsca(m).zapas;
    if (z !== null && z >= min) return m;
  }
  throw new Error('żaden klucz nie daje zapasu');
}

/** miejsce z zerowym zapasem od początku (puste od lat) */
function pusteOdLat(kat: string, x: number, y: number): Miejsce {
  for (let k = 0; k < 500; k++) {
    const m = miejsce(`poi:${k}:9`, kat, x, y);
    if (celZMiejsca(m).zapas === 0) return m;
  }
  throw new Error('żaden klucz nie daje pustego miejsca');
}

function gra(hour = 10, day = 2): { st: GovState; i: GovInput } {
  const st = newGov(7);
  wlaczMiasto(st);
  return { st, i: { ...new Atrapa(7).input(), day, hour, minute: 0, night: hour >= 22 || hour < 6 } };
}

const tekstyKarty = (k: ReturnType<typeof kartaMiejsca>): Tx[] => [k.tytul, ...k.linie, ...(k.powod ? [k.powod] : [])];

/** każdy napis karty jest w obu językach, a angielski nie ma polskich słów (poza nazwą miejsca) */
function dwaJezyki(k: ReturnType<typeof kartaMiejsca>, nazwy: string[] = []) {
  for (const t of tekstyKarty(k)) {
    expect(t.pl.length, JSON.stringify(t)).toBeGreaterThan(2);
    expect(t.en.length, JSON.stringify(t)).toBeGreaterThan(2);
    expect(polskieSlowa(t.en, nazwy), t.en).toEqual([]);
  }
  for (const t of [...k.linie, ...(k.powod ? [k.powod] : [])]) expect(t.en, t.pl).not.toBe(t.pl);
}

describe('rzut i odwrotnie', () => {
  const widoki: Widok[] = [
    { cx: 0, cy: 0, mNaPiksel: 1 },
    { cx: 1234.5, cy: -987.25, mNaPiksel: 0.5 },
    { cx: -4000, cy: 3000, mNaPiksel: 40 },
    { cx: 17.3, cy: 0.1, mNaPiksel: 3.7 },
  ];
  it('są wzajemnie odwrotne (do 1e-9)', () => {
    for (const w of widoki)
      for (const [szer, wys] of [
        [390, 700],
        [1440, 900],
      ])
        for (const [x, y] of [
          [0, 0],
          [w.cx, w.cy],
          [-5000, 5000],
          [123.456, -78.9],
        ]) {
          const [px, py] = rzut(w, szer, wys, x, y);
          const [x2, y2] = odwrotnie(w, szer, wys, px, py);
          expect(Math.abs(x2 - x)).toBeLessThan(1e-9);
          expect(Math.abs(y2 - y)).toBeLessThan(1e-9);
          const [qx, qy] = odwrotnie(w, szer, wys, px, py);
          const [px2, py2] = rzut(w, szer, wys, qx, qy);
          expect(Math.abs(px2 - px)).toBeLessThan(1e-9);
          expect(Math.abs(py2 - py)).toBeLessThan(1e-9);
        }
  });

  it('środek widoku jest na środku płótna, wschód w prawo, południe w dół, mNaPiksel metrów na piksel', () => {
    const w: Widok = { cx: 100, cy: 200, mNaPiksel: 2 };
    expect(rzut(w, 400, 300, 100, 200)).toEqual([200, 150]);
    expect(rzut(w, 400, 300, 120, 200)).toEqual([210, 150]);
    expect(rzut(w, 400, 300, 100, 260)).toEqual([200, 180]);
  });
});

describe('przybliz', () => {
  const w: Widok = { cx: 300, cy: -200, mNaPiksel: 4 };
  it('punkt pod kursorem zostaje w miejscu', () => {
    for (const f of [0.5, 0.8, 1.25, 2, 3.3])
      for (const [px, py] of [
        [0, 0],
        [195, 350],
        [389, 699],
        [50, 600],
      ]) {
        const przed = odwrotnie(w, 390, 700, px, py);
        const n = przybliz(w, f, px, py, 390, 700);
        const po = odwrotnie(n, 390, 700, px, py);
        expect(Math.abs(po[0] - przed[0])).toBeLessThan(1e-9);
        expect(Math.abs(po[1] - przed[1])).toBeLessThan(1e-9);
        expect(n.mNaPiksel).toBeCloseTo(w.mNaPiksel / f, 12);
      }
  });

  it('czynnik powyżej 1 przybliża, a zakres jest ucięty do 0,5–40 m/px (punkt pod kursorem dalej stoi)', () => {
    expect(przybliz(w, 2, 0, 0, 390, 700).mNaPiksel).toBe(2);
    const blisko = przybliz(w, 1000, 10, 20, 390, 700);
    expect(blisko.mNaPiksel).toBe(M_NA_PIKSEL_MIN);
    expect(M_NA_PIKSEL_MIN).toBe(0.5);
    const daleko = przybliz(w, 0.0001, 10, 20, 390, 700);
    expect(daleko.mNaPiksel).toBe(M_NA_PIKSEL_MAX);
    expect(M_NA_PIKSEL_MAX).toBe(40);
    for (const n of [blisko, daleko]) {
      const po = odwrotnie(n, 390, 700, 10, 20);
      const przed = odwrotnie(w, 390, 700, 10, 20);
      expect(Math.abs(po[0] - przed[0])).toBeLessThan(1e-9);
      expect(Math.abs(po[1] - przed[1])).toBeLessThan(1e-9);
    }
    expect(przybliz(w, 1, 33, 44, 390, 700)).toEqual(w);
    // wejścia nie zmienia
    expect(w).toEqual({ cx: 300, cy: -200, mNaPiksel: 4 });
  });
});

describe('trafiony', () => {
  const w: Widok = { cx: 0, cy: 0, mNaPiksel: 2 };
  const a = miejsce('poi:1:1', 'apteka', 20, 0);
  const b = miejsce('poi:2:2', 'sklep', 40, 0);
  const c = miejsce('poi:3:3', 'bank', -100, -100);
  it('wybiera najbliższe miejsce w promieniu, a poza nim null', () => {
    // a na ekranie w (210, 150), b w (220, 150) przy płótnie 400×300
    expect(trafiony([a, b, c], w, 400, 300, 211, 150, 12)).toBe(a);
    expect(trafiony([a, b, c], w, 400, 300, 218, 151, 12)).toBe(b);
    expect(trafiony([b, a, c], w, 400, 300, 212, 150, 12)).toBe(a);
    expect(trafiony([a, b, c], w, 400, 300, 150, 40, 12)).toBeNull();
    expect(trafiony([], w, 400, 300, 210, 150, 12)).toBeNull();
    // brzeg promienia jeszcze trafia
    expect(trafiony([a], w, 400, 300, 210, 162, 12)).toBe(a);
    expect(trafiony([a], w, 400, 300, 210, 162.01, 12)).toBeNull();
  });

  it('przy równej odległości wygrywa pierwsze z listy', () => {
    const d = miejsce('poi:4:4', 'szkola', 20, 0);
    expect(trafiony([a, d], w, 400, 300, 210, 150, 12)).toBe(a);
    expect(trafiony([d, a], w, 400, 300, 210, 150, 12)).toBe(d);
  });
});

describe('kafelkiWidoku', () => {
  it('powyżej 8 m/px zawsze tło z poziomu 12, z bliska poziom 14', () => {
    expect(kafelkiWidoku(C, { cx: 0, cy: 0, mNaPiksel: 10 }, 390, 700).z).toBe(12);
    expect(kafelkiWidoku(C, { cx: 0, cy: 0, mNaPiksel: 8.01 }, 390, 700).z).toBe(12);
    const blisko = kafelkiWidoku(C, { cx: 0, cy: 0, mNaPiksel: 2 }, 390, 700);
    expect(blisko.z).toBe(14);
    expect(blisko.kafelki.length).toBeGreaterThan(0);
  });

  it(`z=14 tylko wtedy, gdy widok potrzebuje najwyżej ${MAX_KAFELKOW_14} kafelków; inaczej tło z=12`, () => {
    expect(MAX_KAFELKOW_14).toBeLessThanOrEqual(24);
    const tel = kafelkiWidoku(C, { cx: 0, cy: 0, mNaPiksel: 8 }, 390, 700);
    expect(tel.z).toBe(14);
    expect(tel.kafelki.length).toBeLessThanOrEqual(MAX_KAFELKOW_14);
    const duzy = kafelkiWidoku(C, { cx: 0, cy: 0, mNaPiksel: 8 }, 1440, 900);
    expect(duzy.z).toBe(12);
    for (const m of [0.5, 1, 2, 4, 6, 8, 10, 20, 40])
      for (const [s, h] of [
        [390, 700],
        [1440, 900],
        [2560, 1440],
      ]) {
        const k = kafelkiWidoku(C, { cx: 1000, cy: -500, mNaPiksel: m }, s, h);
        if (k.z === 14) expect(k.kafelki.length, `${m} m/px ${s}×${h}`).toBeLessThanOrEqual(MAX_KAFELKOW_14);
        if (m > 8) expect(k.z).toBe(12);
      }
  });

  it('kafelki pokrywają widok z małym zapasem, ale tylko w kwadracie miasta wokół adresu', () => {
    const w: Widok = { cx: 500, cy: 300, mNaPiksel: 3 };
    const k = kafelkiWidoku(C, w, 390, 700);
    const zbior = new Set(k.kafelki.map(([x, y]) => `${x}/${y}`));
    // wszystko, co widać, jest w zamówieniu
    for (const [x, y] of kafelkiProstokata(C, 500 - 195 * 3, 300 - 350 * 3, 500 + 195 * 3, 300 + 350 * 3, 14))
      expect(zbior.has(`${x}/${y}`)).toBe(true);
    expect(ZASIEG_MIASTA_M).toBeGreaterThan(MAX_DROGA_M);
    // widok daleko za miastem nic nie zamawia
    expect(kafelkiWidoku(C, { cx: 3 * ZASIEG_MIASTA_M, cy: 0, mNaPiksel: 2 }, 390, 700).kafelki).toEqual([]);
    expect(kafelkiWidoku(C, { cx: 0, cy: -3 * ZASIEG_MIASTA_M, mNaPiksel: 20 }, 390, 700).kafelki).toEqual([]);
    // całe miasto z daleka to kilka kafelków tła
    const calosc = kafelkiWidoku(C, { cx: 0, cy: 0, mNaPiksel: 40 }, 2560, 1440);
    expect(calosc.z).toBe(12);
    expect(calosc.kafelki.length).toBeLessThanOrEqual(16);
  });
});

describe('przytnijPamiec', () => {
  it('wyrzuca najdawniej użyte ponad limit każdego poziomu, reszty nie rusza', () => {
    const mapa = new Map<string, { z: number }>();
    for (let k = 0; k < 30; k++) mapa.set(`14/${k}/0`, { z: 14 });
    for (let k = 0; k < 5; k++) mapa.set(`12/${k}/0`, { z: 12 });
    // kafelek 14/0/0 użyty przed chwilą: na koniec kolejki
    const r = mapa.get('14/0/0')!;
    mapa.delete('14/0/0');
    mapa.set('14/0/0', r);
    const limit = (z: number) => (z === 12 ? 4 : MAX_KAFELKOW_14);
    expect(przytnijPamiec(mapa, limit)).toEqual(['14/1/0', '14/2/0', '14/3/0', '14/4/0', '14/5/0', '14/6/0', '12/0/0']);
    expect([...mapa.values()].filter((x) => x.z === 14).length).toBe(MAX_KAFELKOW_14);
    expect(mapa.has('14/0/0')).toBe(true);
    expect([...mapa.values()].filter((x) => x.z === 12).length).toBe(4);
    expect(przytnijPamiec(mapa, limit)).toEqual([]);
  });

  it('kafelki bieżącego widoku nigdy nie wypadają, nawet ponad limit', () => {
    const mapa = new Map<string, { z: number }>();
    for (let k = 0; k < 10; k++) mapa.set(`12/${k}/0`, { z: 12 });
    const widok = new Set(['12/0/0', '12/1/0', '12/2/0', '12/3/0', '12/4/0', '12/5/0']);
    expect(przytnijPamiec(mapa, () => 4, widok)).toEqual(['12/6/0', '12/7/0', '12/8/0', '12/9/0']);
    expect([...mapa.keys()]).toEqual([...widok]);
  });
});

describe('PamiecKafelkow (decyzje okna: co pobrać, co zapomnieć)', () => {
  // daleka północ: kafelek z=12 jest tam wąski, więc kwadrat miasta potrzebuje ich więcej niż limit pamięci
  const POLNOC: [string, LatLon][] = [
    ['Tromsø', [69.6492, 18.9553]],
    ['Longyearbyen', [78.2232, 15.6267]],
  ];
  for (const [nazwa, c] of POLNOC)
    it(`${nazwa}: całe miasto z daleka ponad limit z=12; nic widocznego nie wypada, każdy kafelek pobiera się raz`, () => {
      const { z, kafelki } = kafelkiWidoku(c, { cx: 0, cy: 0, mNaPiksel: M_NA_PIKSEL_MAX }, 2560, 1440);
      expect(z).toBe(12);
      expect(kafelki.length).toBeGreaterThan(MAX_RYSUNKOW_12);
      const p = new PamiecKafelkow<{ z: number }>();
      let pobrania = 0;
      // jak w oknie: każda klatka zamawia widok, kafelki przychodzą po jednym, a każde przyjście to nowa klatka
      for (let klatka = 0; klatka < 10 * kafelki.length; klatka++) {
        pobrania += p.zamow(z, kafelki).length;
        const [k] = p.wTrakcie;
        if (k) p.przyszedl(k, { z });
      }
      expect(pobrania).toBe(kafelki.length);
      expect(p.wTrakcie.size).toBe(0);
      for (const [x, y] of kafelki) expect(p.rysunki.has(`${z}/${x}/${y}`)).toBe(true);
    });

  it('najwyżej MAX_W_TRAKCIE pobrań naraz, od środka widoku; po przesunięciu widoku wypadają niewidoczne do limitu', () => {
    const kafelki: [number, number][] = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) kafelki.push([100 + x, 200 + y]);
    const p = new PamiecKafelkow<{ z: number }>();
    const pierwsze = p.zamow(12, kafelki);
    expect(pierwsze.length).toBeLessThan(kafelki.length);
    expect(pierwsze[0]).toEqual([102, 202, '12/102/202']);
    // nic nowego, póki wszystkie miejsca w toku zajęte
    expect(p.zamow(12, kafelki)).toEqual([]);
    for (let n = 0; n < 100 && (p.wTrakcie.size || p.rysunki.size < kafelki.length); n++) {
      for (const k of [...p.wTrakcie]) p.przyszedl(k, { z: 12 });
      p.zamow(12, kafelki);
    }
    expect(p.rysunki.size).toBe(kafelki.length);
    // inny widok: stare kafelki wypadają do limitu, nowe zostają
    const inne: [number, number][] = [
      [500, 500],
      [501, 500],
    ];
    for (const [x, y, k] of p.zamow(12, inne)) {
      expect(`12/${x}/${y}`).toBe(k);
      p.przyszedl(k, { z: 12 });
    }
    expect(p.rysunki.size).toBe(MAX_RYSUNKOW_12);
    expect(p.rysunki.has('12/500/500') && p.rysunki.has('12/501/500')).toBe(true);
  });

  it('nieudany kafelek nie jest ponawiany aż do odNowa', () => {
    const p = new PamiecKafelkow<{ z: number }>();
    const kafelki: [number, number][] = [[7, 7]];
    const [[, , k]] = p.zamow(14, kafelki);
    p.przyszedl(k, null);
    expect(p.nieudane.has(k)).toBe(true);
    expect(p.zamow(14, kafelki)).toEqual([]);
    p.odNowa();
    expect(p.zamow(14, kafelki).map((t) => t[2])).toEqual([k]);
  });
});

describe('dolaczMiejsca', () => {
  it('okolica ma pierwszeństwo przed miejscami z kafelków: ten sam klucz nie wchodzi drugi raz', () => {
    const mapa = new Map<string, Miejsce>();
    expect(dolaczMiejsca(mapa, [miejsce('poi:1:1', 'apteka', 300, 0, 'Po filtrze')])).toBe(1);
    const n = dolaczMiejsca(mapa, [
      miejsce('poi:1:1', 'apteka', 300, 0, 'Surowa nazwa'),
      miejsce('poi:5:5', 'sklep', 900, 900),
    ]);
    expect(n).toBe(1);
    expect(mapa.get('poi:1:1')?.nazwa).toBe('Po filtrze');
    expect(mapa.size).toBe(2);
  });

  it('ten sam punkt z kluczem o dwa piksele obok (stary zapis, demo: klucz z metrów) to jedno miejsce', () => {
    const mapa = new Map<string, Miejsce>();
    dolaczMiejsca(mapa, [miejsce('poi:10:10', 'apteka', 300, 0)]);
    const n = dolaczMiejsca(mapa, [
      miejsce('poi:11:12', 'apteka', 300.5, 0.5),
      miejsce('poi:8:8', 'apteka', 299.5, -0.5),
      // inna kategoria w tym samym miejscu i ta sama kategoria trzy piksele obok to inne miejsca
      miejsce('poi:12:10', 'sklep', 300, 0),
      miejsce('poi:13:10', 'apteka', 301, 0),
    ]);
    expect(n).toBe(2);
    expect([...mapa.keys()]).toEqual(['poi:10:10', 'poi:12:10', 'poi:13:10']);
  });

  it('demo Przymorza: okolica z kluczami z metrów i miejsca z kafelków dają każde miejsce raz', () => {
    const a = ADDRESSES.find((x) => x.key === 'przymorze')!;
    const demo = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    );
    // demo nie ma kluczy: liczą się z metrów, część wychodzi o piksel obok klucza z kafelków
    uzupelnijKlucze(demo.geo);
    const okolica = miejscaZPoi(demo.geo.poi, () => '');
    const zKafelkow = miejscaZPoi(poiZKafelkow(decodedTiles(a), [a.lat, a.lon]), () => '');
    const klucze = new Set(okolica.map((m) => m.klucz));
    expect(zKafelkow.filter((m) => !klucze.has(m.klucz) && m.odl <= 700).length).toBeGreaterThan(0);
    const mapa = new Map<string, Miejsce>();
    expect(dolaczMiejsca(mapa, okolica)).toBe(okolica.length);
    // z kafelków dochodzą tylko miejsca spoza okolicy (toGeoT tnie punkty do 720 m)
    expect(dolaczMiejsca(mapa, zKafelkow)).toBe(zKafelkow.filter((m) => m.odl > 720).length);
  });

  it('na granicy kratki wyszukiwania i przy kluczach bez pikseli', () => {
    const mapa = new Map<string, Miejsce>();
    dolaczMiejsca(mapa, [miejsce('poi:7:7', 'bank', 0, 0), miejsce('TARGET', 'bank', 0, 0)]);
    expect(dolaczMiejsca(mapa, [miejsce('poi:9:9', 'bank', 0, 0), miejsce('INNY', 'bank', 0, 0)])).toBe(1);
    expect([...mapa.keys()]).toEqual(['poi:7:7', 'TARGET', 'INNY']);
  });
});

describe('kartaMiejsca', () => {
  it('miejsce dalej niż MAX_DROGA_M: nie można, „za daleko na jeden dzień”', () => {
    const { st, i } = gra();
    const m = zZapasem('apteka', MAX_DROGA_M + 1, 0);
    const k = kartaMiejsca(m, st, i);
    expect(k.mozna).toBe(false);
    expect(k.powod?.pl).toMatch(/za daleko na jeden dzień/i);
    expect(k.powod?.en).toMatch(/too far for one day/i);
    dwaJezyki(k);
    // równe MAX_DROGA_M jeszcze wolno
    expect(kartaMiejsca(zZapasem('apteka', MAX_DROGA_M, 0), st, i).mozna).toBe(true);
  });

  it('nietknięte miejsce z zapasem: można, „nietknięte”, kategoria i nazwa w tytule, odległość, czas, ryzyko, łup', () => {
    const { st, i } = gra();
    const m0 = zZapasem('apteka', 1200, -500);
    const m = { ...m0, nazwa: 'Dbam o Zdrowie' };
    const k = kartaMiejsca(m, st, i);
    expect(k.mozna).toBe(true);
    expect(k.powod).toBeUndefined();
    expect(k.tytul).toEqual({ pl: 'Apteka (Dbam o Zdrowie)', en: 'Pharmacy (Dbam o Zdrowie)' });
    const pl = k.linie.map((t) => t.pl).join(' | ');
    const en = k.linie.map((t) => t.en).join(' | ');
    expect(pl).toMatch(/nietknięte/i);
    expect(en).toMatch(/untouched/i);
    // 1300 m: po polsku z przecinkiem, po angielsku z kropką; liczba z jednostką ze spacją twardą (bez łamania)
    expect(pl).toContain('1,3\u00a0km');
    expect(en).toContain('1.3\u00a0km');
    // droga w jedną stronę: linia prosta razy 1,4 przy 3 km/h
    const wJednaStrone = Math.round((czasWyprawyMin(m.odl, 1) - czasWyprawyMin(0, 1)) / 2);
    expect(pl).toContain(`${wJednaStrone}\u00a0min`);
    expect(pl).not.toMatch(/\d (h|min|km|m)\b/);
    expect(pl).toMatch(/spokojnie|niepewnie|groźnie/);
    expect(en).toMatch(/calm|uncertain|dangerous/);
    // apteka daje leki
    expect(pl).toMatch(/leki/);
    expect(en).toMatch(/meds/);
    expect(pl).toMatch(/jeszcze tu nie byliście/i);
    dwaJezyki(k, ['Dbam o Zdrowie']);
  });

  it('zapas wyczerpany: „wybrane do cna” i nie można; częściowo wybrane: „ktoś tu był”', () => {
    const { st, i } = gra();
    const m = zZapasem('spozywczy', 800, 300, 4);
    const cel = celZMiejsca(m);
    st.miasto!.zabrano[m.klucz] = 1;
    st.miasto!.wizyty[m.klucz] = 1;
    st.miasto!.ostatnia[m.klucz] = 1;
    const czesc = kartaMiejsca(m, st, i);
    expect(czesc.mozna).toBe(true);
    expect(czesc.linie.map((t) => t.pl).join(' ')).toMatch(/ktoś tu był/i);
    expect(czesc.linie.map((t) => t.en).join(' ')).toMatch(/somebody has been here/i);
    // ostatnia wizyta w dniu 1, dziś dzień 2: wczoraj
    expect(czesc.linie.map((t) => t.pl).join(' ')).toMatch(/wczoraj/);
    expect(czesc.linie.map((t) => t.en).join(' ')).toMatch(/yesterday/);
    dwaJezyki(czesc);

    st.miasto!.zabrano[m.klucz] = cel.zapas!;
    st.miasto!.ostatnia[m.klucz] = 2;
    expect(zostaloZMiejsca(st, cel)).toBe(0);
    const pusto = kartaMiejsca(m, st, i);
    expect(pusto.mozna).toBe(false);
    expect(pusto.linie.map((t) => t.pl).join(' ')).toMatch(/wybrane do cna/i);
    expect(pusto.linie.map((t) => t.en).join(' ')).toMatch(/picked clean/i);
    expect(pusto.linie.map((t) => t.pl).join(' ')).toMatch(/dziś/);
    expect(pusto.powod?.pl).toMatch(/wybrane do cna/i);
    dwaJezyki(pusto);

    // miejsce puste od lat (zapas 0 bez żadnej wizyty) też jest wybrane do cna
    const odLat = kartaMiejsca(pusteOdLat('bank', 900, 0), st, i);
    expect(odLat.mozna).toBe(false);
    expect(odLat.linie.map((t) => t.pl).join(' ')).toMatch(/wybrane do cna/i);
  });

  it('dzień ostatniej wizyty sprzed kilku dni', () => {
    const { st, i } = gra(10, 6);
    const m = zZapasem('budowlany', 700, 0, 4);
    st.miasto!.zabrano[m.klucz] = 1;
    st.miasto!.wizyty[m.klucz] = 2;
    st.miasto!.ostatnia[m.klucz] = 3;
    const k = kartaMiejsca(m, st, i);
    expect(k.linie.map((t) => t.pl).join(' ')).toMatch(/w dniu 3/);
    expect(k.linie.map((t) => t.en).join(' ')).toMatch(/on day 3/);
    dwaJezyki(k);
  });

  it('nie można: mapa lokalna, wyprawa już w drodze, noc, mapa miasta wyłączona', () => {
    const { st, i } = gra();
    const lokalne = kartaMiejsca(zZapasem('sklep', 100, 50), st, i);
    expect(lokalne.mozna).toBe(false);
    expect(lokalne.powod?.pl).toMatch(/mapie osiedla/);
    dwaJezyki(lokalne);

    const m = zZapasem('apteka', 600, 0);
    st.wyprawy = [{ id: 1, cel: celZMiejsca(m), ids: [i.people[0].id], wyjscie: 600, powrot: 2000 }];
    const wDrodze = kartaMiejsca(m, st, i);
    expect(wDrodze.mozna).toBe(false);
    expect(wDrodze.powod?.pl).toMatch(/już tam idzie/);
    expect(wDrodze.linie.map((t) => t.pl).join(' ')).toMatch(/w drodze/);
    dwaJezyki(wDrodze);
    st.wyprawy = [];

    for (const h of [20, 23, 3, 5]) {
      const noc = kartaMiejsca(m, st, { ...i, hour: h });
      expect(noc.mozna, `godzina ${h}`).toBe(false);
      expect(noc.powod?.pl).toMatch(/6:00/);
      dwaJezyki(noc);
    }
    expect(kartaMiejsca(m, st, { ...i, hour: 6 }).mozna).toBe(true);
    expect(kartaMiejsca(m, st, { ...i, hour: 19 }).mozna).toBe(true);

    const bez = newGov(7);
    const wyl = kartaMiejsca(m, bez, i);
    expect(wyl.mozna).toBe(false);
    dwaJezyki(wyl);
  });

  it('powód odmowy na karcie jest tym samym, który dałaby wyslijWyprawe (także daleki cel nocą)', () => {
    const { st, i } = gra();
    const [a, b] = i.people.map((p) => p.id);
    const bliski = zZapasem('apteka', 600, 0);
    const daleki = zZapasem('apteka', MAX_DROGA_M + 300, 0);
    const pusty = pusteOdLat('bank', 900, 0);
    const wDrodze = zZapasem('sklep', 0, 800, 4, 1000);
    st.wyprawy = [{ id: 1, cel: celZMiejsca(wDrodze), ids: [a], wyjscie: 600, powrot: 2000 }];
    const przypadki: [Miejsce, GovState, GovInput][] = [
      [bliski, newGov(7), i],
      [bliski, st, { ...i, hour: 21 }],
      [daleki, st, { ...i, hour: 21 }],
      [daleki, st, { ...i, hour: 4 }],
      [daleki, st, i],
      [pusty, st, i],
      [pusty, st, { ...i, hour: 22 }],
      [wDrodze, st, i],
      [bliski, st, i],
    ];
    for (const [m, s0, wej] of przypadki) {
      const k = kartaMiejsca(m, s0, wej);
      const w = wyslijWyprawe(structuredClone(s0), wej, celZMiejsca(m), [b]);
      expect(k.powod ?? null, `${m.klucz} o ${wej.hour}`).toEqual(w.ok ? null : w.why);
      expect(k.mozna).toBe(w.ok);
    }
  });

  it('nie zmienia stanu zarządu ani wejścia', () => {
    const { st, i } = gra();
    const m = zZapasem('apteka', 600, 0);
    const przed = JSON.stringify([st, i]);
    kartaMiejsca(m, st, i);
    expect(JSON.stringify([st, i])).toBe(przed);
  });
});

describe('kartaHtml', () => {
  const { st, i } = gra();
  const m = zZapasem('apteka', 600, 0);
  for (const lang of ['pl', 'en'] as Lang[])
    it(`${lang}: bez wysyłki przycisk „Wyślij wyprawę” jest wyszarzony z dopiskiem, z wysyłką aktywny`, () => {
      ustawJezyk(lang);
      const k = kartaMiejsca(m, st, i);
      const bez = kartaHtml(m, k, false);
      expect(bez).toMatch(/<button[^>]*data-act="wyslij"[^>]*disabled/);
      expect(bez).toContain(lang === 'pl' ? 'wkrótce' : 'soon');
      const z = kartaHtml(m, k, true);
      expect(z).toMatch(/<button[^>]*data-act="wyslij"/);
      expect(z).not.toMatch(/data-act="wyslij"[^>]*disabled/);
      expect(z).toContain(`data-arg="${m.klucz}"`);
      for (const t of tekstyKarty(k)) expect(z).toContain(lang === 'pl' ? t.pl : t.en);
      if (lang === 'en') expect(polskieSlowa(z)).toEqual([]);
    });

  it('nie można: przycisk wyszarzony i powód na karcie', () => {
    const daleko = zZapasem('apteka', MAX_DROGA_M + 500, 0);
    const k = kartaMiejsca(daleko, st, i);
    const h = kartaHtml(daleko, k, true);
    expect(h).toMatch(/data-act="wyslij"[^>]*disabled/);
    expect(h).toContain(k.powod!.pl);
  });

  it('nazwa z OSM idzie przez ucieczkę HTML', () => {
    const zly = { ...m, nazwa: '<b>Sklep & "Spółka"</b>' };
    const h = kartaHtml(zly, kartaMiejsca(zly, st, i), true);
    expect(h).not.toContain('<b>Sklep');
    expect(h).toContain('&lt;b&gt;Sklep &amp; &quot;Spółka&quot;&lt;/b&gt;');
  });
});

describe('mapaMiastaSheet', () => {
  const bezZnacznikow = (s: string) => s.replace(/<[^>]*>/g, '');
  for (const touch of [false, true])
    it(`okno z płótnem, zamykane bez decyzji, z atrybucją map w stopce w obu językach (dotyk: ${touch})`, () => {
      ustawJezyk('pl');
      const pl = mapaMiastaSheet(touch);
      expect(pl.tone).toBe('miasto');
      expect(pl.closable).toBe(true);
      expect(pl.body).toContain('<canvas');
      expect(pl.body).toContain('data-miasto');
      expect(pl.body).toContain('data-miasto-karta');
      expect(pl.body).toContain('data-miasto-stan');
      expect(bezZnacznikow(pl.foot)).toContain('© współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles');
      expect(pl.foot).toContain('href="https://www.openstreetmap.org/copyright"');
      expect(pl.foot).toContain('data-act="miasto-zamknij"');
      ustawJezyk('en');
      const en = mapaMiastaSheet(touch);
      expect(bezZnacznikow(en.foot)).toContain('© OpenStreetMap contributors, OpenFreeMap, OpenMapTiles');
      for (const s of [en.kicker, en.title, en.body, en.foot]) expect(polskieSlowa(s), s).toEqual([]);
      expect(en.title).not.toBe(pl.title);
      expect(en.body).not.toBe(pl.body);
    });
});

describe('ikony kategorii', () => {
  it('każda kategoria miejsc ma ikonę 7×7 rysowaną kodem; nieznana to sklep', () => {
    for (const kat of [
      'spozywczy',
      'apteka',
      'przychodnia',
      'budowlany',
      'elektronika',
      'szkola',
      'biblioteka',
      'bank',
      'stacja',
      'ubrania',
      'urzad',
      'kosciol',
      'sklep',
      'ogrodnik',
      'garaz',
      'hala',
    ]) {
      const ik = IKONY[kat];
      expect(ik, kat).toBeDefined();
      expect(ik.wzor.length, kat).toBe(7);
      for (const wiersz of ik.wzor) expect(wiersz, kat).toMatch(/^[.#]{7}$/);
      expect(ik.wzor.join('').includes('#'), kat).toBe(true);
      expect(ik.tlo).not.toBe(ik.znak);
    }
    expect(ikonaKategorii('nieznana')).toBe(IKONY.sklep);
    expect(ikonaKategorii('constructor')).toBe(IKONY.sklep);
    // różne wzory: apteka i przychodnia różnią się kolorem, reszta kształtem
    const wzory = new Set(Object.values(IKONY).map((i) => `${i.wzor.join('')}${i.tlo}${i.znak}`));
    expect(wzory.size).toBe(Object.keys(IKONY).length);
  });
});
