/* Tabele gmin dema (public/data/mieszkancy/gminy/<teryt>.json), wynik `npm run dane:gminy`. Pierwsza część chodzi
   zawsze, na tabelach z repozytorium. Druga porównuje tabele z surowymi plikami GUS i odpowiedziami BDL i chodzi
   tylko tam, gdzie te pliki leżą (każdy test sprawdza istnienie swojego pliku). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Epoka,
  type GrupaWieku,
  type Marginesy,
  type TabeleGminy,
  WERSJA_TABEL,
} from '../../src/mieszkancy/tabele.ts';
import { wWielokacie } from '../../tools/dane/gminy.ts';
import { SUROWE } from '../../tools/dane/sciezki.ts';
import { arkusze, wiersze } from '../../tools/dane/xlsx.ts';
import { ADDRESSES } from './fixtures.ts';

const KATALOG = path.resolve(import.meta.dirname, '../../public/data/mieszkancy/gminy');
const TERYTY = ['2261011', '1465138', '1206172'] as const;
const GRUPY: GrupaWieku[] = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const EPOKI: Epoka[] = ['przedwojenna', 'powojenna', 'plyta', 'transformacja', 'nowa'];

function wczytaj(teryt: string): TabeleGminy {
  return JSON.parse(fs.readFileSync(path.join(KATALOG, `${teryt}.json`), 'utf8')) as TabeleGminy;
}
const suma = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
const osoby = (m: Marginesy): number => suma(m.wiek.M) + suma(m.wiek.K);

describe('tabele gmin dema', () => {
  const tabele = Object.fromEntries(TERYTY.map((t) => [t, wczytaj(t)])) as Record<(typeof TERYTY)[number], TabeleGminy>;
  const gdansk = tabele['2261011'];
  const ursynow = tabele['1465138'];
  const zielonki = tabele['1206172'];

  it('nagłówki: wersja, kod, nazwa, województwo, rodzaj gminy', () => {
    for (const t of TERYTY) {
      expect(tabele[t].wersja).toBe(WERSJA_TABEL);
      expect(tabele[t].teryt).toBe(t);
    }
    expect([gdansk.nazwa, gdansk.woj, gdansk.miejska]).toEqual(['Gdańsk', 'pomorskie', true]);
    expect([ursynow.nazwa, ursynow.woj, ursynow.miejska]).toEqual(['Warszawa-Ursynów', 'mazowieckie', true]);
    expect([zielonki.nazwa, zielonki.woj, zielonki.miejska]).toEqual(['Zielonki', 'małopolskie', false]);
  });

  it('rejon 182350 (Przymorze): 39,6% gospodarstw jednoosobowych i 9,5% osób 80+', () => {
    const r = gdansk.rejony['182350'];
    expect(suma(r.gospodarstwa)).toBe(1511);
    expect(Math.abs((100 * r.gospodarstwa['1']) / suma(r.gospodarstwa) - 39.6)).toBeLessThanOrEqual(0.1);
    expect(osoby(r)).toBe(3182);
    expect(Math.abs((100 * (r.wiek.M['80+'] + r.wiek.K['80+'])) / osoby(r) - 9.5)).toBeLessThanOrEqual(0.1);
    expect(suma(r.wiek.M)).toBe(1442);
    expect(suma(r.wiek.K)).toBe(1740);
    expect(r.gospodarstwa).toEqual({ '1': 598, '2': 489, '3': 237, '4': 115, '5+': 72 });
    expect(r.rodziny.malzBez).toBe(294);
    expect(r.rodziny.matka).toBe(231);
    expect(r.rodziny.ojciec).toBe(44);
    expect(suma(r.rodziny)).toBe(872);
  });

  it('rejon 398600 (Zielonki): 11,7% jednoosobowych, 22,6% pięcio- i więcej osobowych, 5% osób 80+', () => {
    const r = zielonki.rejony['398600'];
    expect(suma(r.gospodarstwa)).toBe(367);
    expect(Math.abs((100 * r.gospodarstwa['1']) / suma(r.gospodarstwa) - 11.7)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((100 * r.gospodarstwa['5+']) / suma(r.gospodarstwa) - 22.6)).toBeLessThanOrEqual(0.1);
    expect(osoby(r)).toBe(1420);
    expect(r.wiek.M['80+'] + r.wiek.K['80+']).toBe(71);
  });

  it('rejon 002193 (Ursynów, Lanciego): 1 070 gospodarstw, 27,6% jednoosobowych, 53 osoby 80+', () => {
    const r = ursynow.rejony['002193'];
    expect(suma(r.gospodarstwa)).toBe(1070);
    expect(Math.abs((100 * r.gospodarstwa['1']) / suma(r.gospodarstwa) - 27.6)).toBeLessThanOrEqual(0.1);
    expect(osoby(r)).toBe(2630);
    expect(r.wiek.M['80+'] + r.wiek.K['80+']).toBe(53);
  });

  it('gmina to suma rejonów, w każdym polu', () => {
    for (const t of TERYTY) {
      const tab = tabele[t];
      const rejony = Object.values(tab.rejony);
      expect(rejony.length).toBeGreaterThan(0);
      const pola = ['gospodarstwa', 'sklad', 'rodziny', 'dzieci'] as const;
      for (const pole of pola) {
        for (const klucz of Object.keys(tab.gmina[pole])) {
          const k = klucz as keyof Marginesy[typeof pole];
          expect(tab.gmina[pole][k]).toBe(rejony.reduce((a, r) => a + (r[pole][k] as number), 0));
        }
      }
      for (const plec of ['M', 'K'] as const) {
        for (const g of GRUPY) expect(tab.gmina.wiek[plec][g]).toBe(rejony.reduce((a, r) => a + r.wiek[plec][g], 0));
      }
    }
    expect(suma(gdansk.gmina.gospodarstwa)).toBe(
      Object.values(gdansk.rejony).reduce((a, r) => a + suma(r.gospodarstwa), 0),
    );
  });

  it('każdy rejon ma kompletne marginesy i obrys, a punkt dema leży w obrysie właściwego rejonu', () => {
    for (const t of TERYTY) {
      const tab = tabele[t];
      for (const [rej, r] of Object.entries(tab.rejony)) {
        expect(rej, 'numer rejonu to 6 cyfr').toMatch(/^\d{6}$/);
        expect(tab.obrysy[rej], `obrys rejonu ${rej}`).toBeDefined();
        expect(tab.obrysy[rej].length).toBeGreaterThan(0);
        expect(Object.keys(r.gospodarstwa)).toEqual(['1', '2', '3', '4', '5+']);
        expect(Object.keys(r.sklad)).toEqual(['jedno', 'dwu', 'trzy+', 'nier1', 'nier+']);
        expect(Object.keys(r.rodziny)).toEqual(['malzBez', 'malzZ', 'zwBez', 'zwZ', 'matka', 'ojciec']);
        expect(Object.keys(r.dzieci)).toEqual(['0', '1', '2', '3', '4+']);
        expect(Object.keys(r.wiek.M)).toEqual(GRUPY);
        expect(Object.keys(r.wiek.K)).toEqual(GRUPY);
        for (const liczba of [
          ...Object.values(r.gospodarstwa),
          ...Object.values(r.wiek.M),
          ...Object.values(r.wiek.K),
        ]) {
          expect(Number.isInteger(liczba) && liczba >= 0).toBe(true);
        }
      }
      for (const rej of Object.keys(tab.obrysy)) expect(tab.rejony[rej], `rejon ${rej} bez marginesów`).toBeDefined();
    }
    const oczekiwane: Record<string, [(typeof TERYTY)[number], string]> = {
      przymorze: ['2261011', '182350'],
      lanciego: ['1465138', '002193'],
      zielonki: ['1206172', '398600'],
    };
    for (const a of ADDRESSES) {
      const [teryt, rejon] = oczekiwane[a.key];
      const trafione = Object.entries(tabele[teryt].obrysy)
        .filter(([, pierscienie]) => wWielokacie(a.lat, a.lon, pierscienie))
        .map(([rej]) => rej);
      expect(trafione, `punkt ${a.key}`).toEqual([rejon]);
    }
  });

  it('obrysy: pierścienie zamknięte, co najmniej 4 punkty, współrzędne [lat, lon] z 5 miejscami po przecinku', () => {
    for (const t of TERYTY) {
      for (const pierscienie of Object.values(tabele[t].obrysy)) {
        for (const p of pierscienie) {
          expect(p.length).toBeGreaterThanOrEqual(4);
          expect(p[0]).toEqual(p[p.length - 1]);
          for (const [lat, lon] of p) {
            expect(lat).toBeGreaterThan(49);
            expect(lat).toBeLessThan(55);
            expect(lon).toBeGreaterThan(14);
            expect(lon).toBeLessThan(25);
            expect(Math.abs(Math.round(lat * 1e5) - lat * 1e5)).toBeLessThan(1e-6);
            expect(Math.abs(Math.round(lon * 1e5) - lon * 1e5)).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  it('rozbicie na składy i typy rodzin jest spójne z wielkościami gospodarstw', () => {
    for (const t of TERYTY) {
      for (const [rej, r] of Object.entries(tabele[t].rejony)) {
        // dwie tablice tej samej liczby gospodarstw (wielkość i skład rodzinny) oraz dwie tablice liczby rodzin (typ i dzieci)
        expect(suma(r.gospodarstwa), `gospodarstwa w rejonie ${rej}`).toBe(suma(r.sklad));
        expect(suma(r.rodziny), `rodziny w rejonie ${rej}`).toBe(suma(r.dzieci));
      }
    }
  });

  it('epoki i metraż: pięć epok, ludność na mieszkanie i metraż z P4386', () => {
    for (const t of TERYTY) {
      const tab = tabele[t];
      expect(Object.keys(tab.epoki)).toEqual(EPOKI);
      expect(Object.keys(tab.metraz)).toEqual(EPOKI);
      for (const e of EPOKI) {
        expect(Number.isInteger(tab.epoki[e].mieszkania) && tab.epoki[e].mieszkania >= 0).toBe(true);
        expect(Number.isInteger(tab.epoki[e].osoby) && tab.epoki[e].osoby >= 0).toBe(true);
        expect(Number.isInteger(tab.metraz[e]) && tab.metraz[e] > 20 && tab.metraz[e] < 300).toBe(true);
      }
    }
    // Gdańsk: 204 477 mieszkań, z tego okres znany dla około 97,8% (raport: 7,1+6,3+17,9+14,2+10,6+12,4+12,4+8,2+8,7)
    const m = (e: Epoka) => gdansk.epoki[e].mieszkania;
    const razem = EPOKI.reduce((a, e) => a + m(e), 0);
    expect(razem).toBeLessThanOrEqual(204477);
    expect(razem).toBeGreaterThan(0.97 * 204477);
    expect(Math.abs((100 * m('przedwojenna')) / 204477 - (7.1 + 6.3))).toBeLessThanOrEqual(0.15);
    expect(Math.abs((100 * m('powojenna')) / 204477 - 17.9)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((100 * m('plyta')) / 204477 - (14.2 + 10.6))).toBeLessThanOrEqual(0.15);
    expect(Math.abs((100 * m('transformacja')) / 204477 - (12.4 + 12.4))).toBeLessThanOrEqual(0.15);
    expect(Math.abs((100 * m('nowa')) / 204477 - (8.2 + 8.7))).toBeLessThanOrEqual(0.15);
    // Zielonki: domy, średnio 125,2 m² i 3,16 osoby na mieszkanie (cała gmina, 8 188 mieszkań)
    const zm = EPOKI.reduce((a, e) => a + zielonki.epoki[e].mieszkania, 0);
    const zo = EPOKI.reduce((a, e) => a + zielonki.epoki[e].osoby, 0);
    expect(zo / zm).toBeGreaterThan(3.0);
    expect(zo / zm).toBeLessThan(3.3);
    const zmetraz = EPOKI.reduce((a, e) => a + zielonki.metraz[e] * zielonki.epoki[e].mieszkania, 0) / zm;
    expect(zmetraz).toBeGreaterThan(120);
    expect(zmetraz).toBeLessThan(130);
  });

  it('wiek2021 i wiek2025: 18 grup, 85+ jako ostatnia, sumy zgodne z liczbą ludności gminy', () => {
    const lacznie = (w: { M: number[]; K: number[] }) => [...w.M, ...w.K].reduce((a, b) => a + b, 0);
    for (const t of TERYTY) {
      const tab = tabele[t];
      for (const w of [tab.wiek2021, tab.wiek2025]) {
        expect(w.M).toHaveLength(18);
        expect(w.K).toHaveLength(18);
        expect([...w.M, ...w.K].every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
      }
    }
    // P4253 (spis, ludność rezydująca) i P2137 (31.12.2025) z odpowiedzi BDL zapisanych w notatkach
    expect(lacznie(gdansk.wiek2021)).toBe(477276);
    expect(lacznie(ursynow.wiek2021)).toBe(151627);
    expect(lacznie(zielonki.wiek2021)).toBe(26258);
    expect(lacznie(gdansk.wiek2025)).toBe(489328);
    expect(lacznie(ursynow.wiek2025)).toBe(148690);
    expect(lacznie(zielonki.wiek2025)).toBe(28255);
    // 85+ w 2025: Gdańsk 3 862 mężczyzn i 8 994 kobiet
    expect(gdansk.wiek2025.M[17]).toBe(3862);
    expect(gdansk.wiek2025.K[17]).toBe(8994);
    // 80+ w 2021 (80-84, 85-89, 90+): Gdańsk 23 524, Ursynów 4 961, Zielonki 696
    const osiemdziesiat = (w: { M: number[]; K: number[] }) => w.M[16] + w.M[17] + w.K[16] + w.K[17];
    expect(osiemdziesiat(gdansk.wiek2021)).toBe(23524);
    expect(osiemdziesiat(ursynow.wiek2021)).toBe(4961);
    expect(osiemdziesiat(zielonki.wiek2021)).toBe(696);
  });

  it('rozmiar trzech plików razem poniżej 1,5 MB, zapis zwarty', () => {
    let razem = 0;
    for (const t of TERYTY) {
      const tekst = fs.readFileSync(path.join(KATALOG, `${t}.json`), 'utf8');
      razem += Buffer.byteLength(tekst);
      expect(tekst.trimEnd().includes('\n')).toBe(false);
      expect(tekst.includes('": ')).toBe(false);
    }
    expect(razem).toBeLessThan(1.5 * 1024 * 1024);
  });
});

describe('zgodność z surowymi plikami GUS', () => {
  const BDL = path.join(SUROWE, 'gus/bdl-api/dane-przyklady');
  const GOSP_RODZINY = (prefiks: string) => path.join(BDL, `${prefiks}__nsp2021_gospodarstwa_rodziny.json`);
  const PLIKI = {
    '2261011': 'gdansk_042214361011',
    '1465138': 'warszawa_ursynow_071412865138',
    '1206172': 'zielonki_011212006172',
  } as const;

  /** Zmienne BDL (stałe identyfikatory) dla marginesów gospodarstw i rodzin. */
  const ZMIENNE = {
    gospodarstwa: { '1': 1652550, '2': 1652551, '3': 1652552, '4': 1652553, '5+': 1652554 },
    sklad: { jedno: 1641710, dwu: 1641711, 'trzy+': 1641712, nier1: 1641714, 'nier+': 1641715 },
    rodziny: { malzBez: 1641718, malzZ: 1641719, zwBez: 1641721, zwZ: 1641722, matka: 1641723, ojciec: 1641724 },
    dzieci: { '0': 1641729, '1': 1641731, '2': 1641732, '3': 1641733, '4+': 1641734 },
  } as const;

  function bdl(plik: string): Map<number, number> {
    const odp = JSON.parse(fs.readFileSync(plik, 'utf8')) as { results: { id: number; values: { val: number }[] }[] };
    return new Map(odp.results.map((x) => [x.id, x.values[0].val]));
  }

  it.skipIf(!fs.existsSync(GOSP_RODZINY(PLIKI['2261011'])))(
    'Gdańsk: suma gospodarstw po rejonach równa się wartości gminnej z BDL co do sztuki',
    () => {
      const w = bdl(GOSP_RODZINY(PLIKI['2261011']));
      const gdansk = wczytaj('2261011');
      expect(suma(gdansk.gmina.gospodarstwa)).toBe(w.get(1652549));
      expect(suma(gdansk.gmina.gospodarstwa)).toBe(193377);
      for (const [k, id] of Object.entries(ZMIENNE.gospodarstwa)) {
        expect(gdansk.gmina.gospodarstwa[k as keyof Marginesy['gospodarstwa']], `gospodarstwa ${k}`).toBe(w.get(id));
      }
    },
  );

  for (const [teryt, prefiks] of Object.entries(PLIKI)) {
    it.skipIf(!fs.existsSync(GOSP_RODZINY(prefiks)))(
      `${teryt}: wszystkie marginesy gminy (wielkość, skład, typy rodzin, dzieci) zgodne z BDL co do sztuki`,
      () => {
        const w = bdl(GOSP_RODZINY(prefiks));
        const tab = wczytaj(teryt);
        for (const [pole, zmienne] of Object.entries(ZMIENNE)) {
          for (const [k, id] of Object.entries(zmienne)) {
            const wartosc = (tab.gmina as unknown as Record<string, Record<string, number>>)[pole][k];
            expect(wartosc, `${teryt} ${pole} ${k}`).toBe(w.get(id));
          }
        }
      },
    );
  }

  const LUDNOSC = path.join(
    SUROWE,
    'gus/nsp2021-ludnosc-rejony/ludnosc_w_rejonach_statystycznych_i_obwodach_spisowych_nsp_2021.xlsx',
  );
  it.skipIf(!fs.existsSync(LUDNOSC))(
    'ludność: sumy płci i dziesięcioletnich grup wieku każdego rejonu jak w pliku GUS',
    () => {
      const buf = fs.readFileSync(LUDNOSC);
      const wojArk: Record<string, string> = {
        '2261011': 'Pomorskie',
        '1465138': 'Mazowieckie',
        '1206172': 'Małopolskie',
      };
      expect(arkusze(buf)).toEqual(expect.arrayContaining(Object.values(wojArk)));
      for (const teryt of TERYTY) {
        const tab = wczytaj(teryt);
        const rejonyPliku = wiersze(buf, wojArk[teryt]).filter((r) => r[3] === 'rejon statystyczny');
        // w pliku „-” w komórce znaczy zero
        const plik = new Map(
          rejonyPliku.map((r) => [String(r[4]), r.slice(5, 22).map((x) => (x === '-' ? 0 : x)) as number[]]),
        );
        for (const [rej, m] of Object.entries(tab.rejony)) {
          const r = plik.get(rej);
          expect(r, `rejon ${rej} w pliku ludności`).toBeDefined();
          const [ogolem, mezczyzni, kobiety] = r as number[];
          expect(suma(m.wiek.M) + suma(m.wiek.K), rej).toBe(ogolem);
          expect(suma(m.wiek.M), rej).toBe(mezczyzni);
          expect(suma(m.wiek.K), rej).toBe(kobiety);
          GRUPY.forEach((g, i) => {
            expect(m.wiek.M[g] + m.wiek.K[g], `${rej} ${g}`).toBe((r as number[])[8 + i]);
          });
        }
      }
    },
  );

  const RODZINY_PLIK = path.join(
    SUROWE,
    'gus/nsp2021-gospodarstwa-rejony/gospodarstwa_w_rejonach_i_obwodach_wg_liczby_osob_nsp2021.xlsx',
  );
  it.skipIf(!fs.existsSync(RODZINY_PLIK))(
    'gospodarstwa wg liczby osób: każdy rejon jak w tablicy GUS, braki jako zero',
    () => {
      const buf = fs.readFileSync(RODZINY_PLIK);
      const wszystkie = wiersze(buf, 'Dane - rejony statystyczne');
      const klucze: Record<string, keyof Marginesy['gospodarstwa']> = {
        '1': '1',
        '2': '2',
        '3': '3',
        '4': '4',
        '5 i więcej': '5+',
      };
      for (const teryt of TERYTY) {
        const tab = wczytaj(teryt);
        const plik = new Map<string, Record<string, number>>();
        for (const r of wszystkie.slice(1)) {
          if (String(r[0]) !== teryt) continue;
          const o = plik.get(String(r[2])) ?? {};
          o[klucze[String(r[3])]] = r[4] as number;
          plik.set(String(r[2]), o);
        }
        expect(Object.keys(tab.rejony).sort()).toEqual([...plik.keys()].sort());
        for (const [rej, m] of Object.entries(tab.rejony)) {
          for (const k of Object.values(klucze)) expect(m.gospodarstwa[k], `${rej} ${k}`).toBe(plik.get(rej)?.[k] ?? 0);
        }
      }
    },
  );
});
