/* Fachy na 2051 i dawne zawody (src/mieszkancy/fachy.ts) i podpięcie do generatora (generuj.ts). Chodzi zawsze, na
   tabelach z public/data/mieszkancy/ i demach z public/demo/, bez surowych plików. Część testów pracuje na zmyślonych
   osobach, żeby sprawdzić regułę (wiek, płeć, wagi), a nie dane. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Dom } from '../../src/content/data.ts';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { obszarGminy, postarz } from '../../src/mieszkancy/czas.ts';
import {
  DAWNE_ZAWODY,
  FACHY,
  type Fach,
  fachOsoby,
  nadajFachy,
  nazwaFachu,
  POWIAZANIA_ZAWODOW,
  zawodOsoby,
} from '../../src/mieszkancy/fachy.ts';
import { generujBudynek, generujObszar, ROK_GRY } from '../../src/mieszkancy/generuj.ts';
import { nadajImiona } from '../../src/mieszkancy/imiona.ts';
import { losDla } from '../../src/mieszkancy/los.ts';
import { marginesyDla } from '../../src/mieszkancy/rejon.ts';
import { obsadzBudynek } from '../../src/mieszkancy/spis.ts';
import type { TabeleGminy, TabeleImion, TabeleKraju, TabeleNazwisk } from '../../src/mieszkancy/tabele.ts';
import type { Budynek, Osiedle, Osoba, Plec, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import type { Geo } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const imiona = wczytaj<TabeleImion>('data/mieszkancy/imiona.json');
const pomorskie = wczytaj<TabeleNazwisk>('data/mieszkancy/nazwiska/pomorskie.json');
const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;
const przymorze = demo('przymorze');
const nazwy = { imiona, nazwiska: pomorskie };

const DEMA: [string, TabeleGminy][] = [
  ['przymorze', gdansk],
  ['lanciego', ursynow],
  ['zielonki', zielonki],
];
const DOMY: Dom[] = ['bud', 'cieplo', 'elek', 'med', 'uprawa', 'it', 'obrona'];
/** Fachy ciężkiej pracy: po 70. roku życia nikt ich nie dostaje (reguła wieku, nie dane). */
const CIEZKIE = ['murarz', 'pomocnikBud', 'drwal', 'barykadnik', 'straznik', 'zwiadowca', 'kurierPieszy'];

// ---------------------------------------------------------------- zmyślone osoby

const BUDYNEK: Budynek = {
  klucz: 'test/b1',
  lat: 54.4,
  lon: 18.6,
  rejon: '',
  typ: 'blok',
  kondygnacje: 5,
  pole: 500,
  szerokosc: 10,
  dlugosc: 50,
  klatki: 1,
};
const osoba = (id: string, plec: Plec, rocznik: number, stan: Osoba['stan'] = 'tu'): Osoba => ({
  id,
  plec,
  rocznik,
  imie: '',
  nazwisko: '',
  stan,
});
const wynik = (osoby: Osoba[], klucz = 'test/b1'): WynikBudynku => ({
  budynek: { ...BUDYNEK, klucz },
  osoby,
  gospodarstwa: [],
  dziennik: [],
  puste: 0,
  rok: ROK_GRY,
});
/** `n` osób jednego rocznika i płci, z fachami nadanymi ziarnem testu. */
function partia(n: number, plec: Plec, rocznik: number, ziarno: string, stan: Osoba['stan'] = 'tu'): Osoba[] {
  const osoby = Array.from({ length: n }, (_, i) => osoba(`${ziarno}/${rocznik}/${plec}${i}`, plec, rocznik, stan));
  nadajFachy(wynik(osoby), losDla('fachy-test', ziarno, rocznik, plec));
  return osoby;
}
const udzial = (osoby: readonly Osoba[], ok: (o: Osoba) => boolean): number =>
  osoby.filter(ok).length / Math.max(1, osoby.length);

/** Wiek w roku gry (rok stanu wyniku generatora to `ROK_GRY`). */
const wiek = (o: Osoba): number => ROK_GRY - o.rocznik;
const nazwaFormy = (z: { m: string; k: string }, plec: Plec): string => (plec === 'K' ? z.k : z.m);

// ---------------------------------------------------------------- tabela FACHY

describe('FACHY: tabela fachów na 2051', () => {
  it('co najmniej 16 fachów, id to stabilne ASCII bez powtórzeń, a wszystkie nazwy m i k są niepuste i różne', () => {
    expect(FACHY.length).toBeGreaterThanOrEqual(16);
    const ids = FACHY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z][A-Za-z0-9]*$/);
    const formy = FACHY.flatMap((f) => [f.m, f.k]);
    for (const f of formy) {
      expect(f, f).toBe(f.trim());
      expect(f.length, f).toBeGreaterThan(3);
      expect(f, f).not.toMatch(/[0-9—–]|\s-\s/);
    }
    expect(new Set(formy).size, 'żadna forma nie powtarza się ani między fachami, ani między m i k').toBe(formy.length);
  });

  it('umiejętności: tylko dziedziny z Dom, liczby całkowite 1-4, minimalny wiek od 16 do 60', () => {
    for (const f of FACHY) {
      const klucze = Object.keys(f.umiejetnosci);
      expect(klucze.length, f.id).toBeGreaterThan(0);
      for (const d of klucze) {
        expect(DOMY, `${f.id}: ${d}`).toContain(d);
        const v = f.umiejetnosci[d as Dom] as number;
        expect(Number.isInteger(v) && v >= 1 && v <= 4, `${f.id}.${d} = ${v}`).toBe(true);
      }
      expect(Number.isInteger(f.odWieku) && f.odWieku >= 16 && f.odWieku <= 60, f.id).toBe(true);
    }
  });

  it('każda z siedmiu dziedzin ma co najmniej dwa fachy, w których jest najsilniejsza', () => {
    for (const d of DOMY) {
      const maDziedzine = FACHY.filter((f) => (f.umiejetnosci[d] ?? 0) > 0);
      expect(maDziedzine.length, `${d}: fachy z tą dziedziną`).toBeGreaterThanOrEqual(2);
      const najsilniejsza = FACHY.filter((f) => {
        const v = f.umiejetnosci[d] ?? 0;
        return v > 0 && Object.values(f.umiejetnosci).every((x) => (x as number) <= v);
      });
      expect(najsilniejsza.length, `${d}: fachy z tą dziedziną na pierwszym miejscu`).toBeGreaterThanOrEqual(2);
    }
  });

  it('nie każdy jest ekspertem: są fachy skromne (najwyżej 2) i mieszane (co najmniej dwie dziedziny)', () => {
    const maks = (f: Fach): number => Math.max(...(Object.values(f.umiejetnosci) as number[]));
    expect(FACHY.filter((f) => maks(f) <= 2).length).toBeGreaterThanOrEqual(8);
    expect(FACHY.filter((f) => Object.keys(f.umiejetnosci).length >= 2).length).toBeGreaterThanOrEqual(8);
    // skala jak w zawodach z 0.3: lekarz 4, ktoś z jedną dziedziną na 4 jest wyjątkiem
    expect(FACHY.filter((f) => maks(f) === 4).length).toBeLessThanOrEqual(3);
    const lekarz = FACHY.find((f) => f.id === 'lekarz');
    expect(lekarz?.umiejetnosci).toEqual({ med: 4 });
  });

  it('są fachy z życia osiedla 2051 z zadania, w obu formach', () => {
    const para = (m: string, k: string): void => {
      const f = FACHY.find((x) => x.m === m);
      expect(f, m).toBeDefined();
      expect(f?.k, m).toBe(k);
    };
    para('zdun', 'zdunka');
    para('łatacz kabli', 'łataczka kabli');
    para('ogrodnik z dachu', 'ogrodniczka z dachu');
    para('felczer', 'felczerka');
    para('opiekun serwera w oleju', 'opiekunka serwera w oleju');
    para('senior od przetworów', 'seniorka od przetworów');
    // tech z GDD: panele z galerii, mesh, gazogenerator na drewno, hydroponika, serwer, lokalny model
    expect(FACHY.some((f) => /paneli/.test(f.m))).toBe(true);
    expect(FACHY.some((f) => /mesh/.test(f.m))).toBe(true);
    expect(FACHY.some((f) => /gazogenerator/.test(f.m))).toBe(true);
    expect(FACHY.some((f) => /modelu/.test(f.m))).toBe(true);
  });

  it('nazwaFachu oddaje formę męską i żeńską dla każdego id, a nieznane id to błąd', () => {
    for (const f of FACHY) {
      expect(nazwaFachu(f.id, 'M'), f.id).toBe(f.m);
      expect(nazwaFachu(f.id, 'K'), f.id).toBe(f.k);
    }
    expect(nazwaFachu('felczer', 'K')).toBe('felczerka');
    expect(nazwaFachu('lataczKabli', 'M')).toBe('łatacz kabli');
    expect(() => nazwaFachu('astronauta' as never, 'M')).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------- tabela DAWNE_ZAWODY

describe('DAWNE_ZAWODY: zawody sprzed upadku', () => {
  it('co najmniej 30, formy niepuste, bez powtórzeń i bez pauz-myślników', () => {
    expect(DAWNE_ZAWODY.length).toBeGreaterThanOrEqual(30);
    const formy = DAWNE_ZAWODY.flatMap((z) => [z.m, z.k]);
    for (const f of formy) {
      expect(f, f).toBe(f.trim());
      expect(f.length, f).toBeGreaterThan(3);
      expect(f, f).not.toMatch(/[0-9—–]|\s-\s/);
    }
    // „prompt engineer” i „prompt engineerka” mają inne końcówki, więc żadna forma się nie powtarza
    expect(new Set(formy).size).toBe(formy.length);
  });

  it('mieszanka zwykłych zawodów i satyry, z zawodami z zadania', () => {
    expect(DAWNE_ZAWODY.filter((z) => z.satyra).length).toBeGreaterThanOrEqual(10);
    expect(DAWNE_ZAWODY.filter((z) => !z.satyra).length).toBeGreaterThanOrEqual(20);
    const jest = (m: string, k: string, satyra: boolean): void => {
      const z = DAWNE_ZAWODY.find((x) => x.m === m);
      expect(z, m).toBeDefined();
      expect([z?.k, z?.satyra], m).toEqual([k, satyra]);
    };
    jest('prompt engineer', 'prompt engineerka', true);
    jest('doradca ds. ESG', 'doradczyni ds. ESG', true);
    jest('influencer', 'influencerka', true);
    jest('kurier z hulajnogą', 'kurierka z hulajnogą', true);
    jest('tester lodówek na abonament', 'testerka lodówek na abonament', true);
    jest('pielęgniarz', 'pielęgniarka', false);
    jest('hydraulik', 'hydrauliczka', false);
    jest('kurier', 'kurierka', false);
    jest('emeryt', 'emerytka', false);
    jest('programista', 'programistka', false);
  });

  it('bez prawdziwych marek i osób', () => {
    const marki =
      /uber|glovo|wolt|allegro|netflix|google|amazon|tesla|facebook|instagram|tiktok|openai|microsoft|apple/i;
    for (const z of DAWNE_ZAWODY) expect(`${z.m} ${z.k}`, z.m).not.toMatch(marki);
    for (const f of FACHY) expect(`${f.m} ${f.k}`, f.id).not.toMatch(marki);
  });

  it('powiązania dawnych zawodów z fachami: znane zawody i fachy, wagi całkowite, hydraulik do zduna i instalatora', () => {
    const ids = new Set<string>(FACHY.map((f) => f.id));
    const zawody = new Set(DAWNE_ZAWODY.map((z) => z.m));
    for (const [zawod, wagi] of Object.entries(POWIAZANIA_ZAWODOW)) {
      expect(zawody.has(zawod), `zawód ${zawod}`).toBe(true);
      for (const [id, w] of Object.entries(wagi)) {
        expect(ids.has(id), `${zawod} → ${id}`).toBe(true);
        expect(Number.isInteger(w) && w >= 1, `${zawod} → ${id}: ${w}`).toBe(true);
      }
    }
    const posortowane = (zawod: string): string[] =>
      Object.entries(POWIAZANIA_ZAWODOW[zawod])
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    expect(posortowane('hydraulik').slice(0, 2).sort()).toEqual(['instalator', 'zdun']);
    expect(posortowane('programista')[0]).toBe('serwerOlej');
    expect(posortowane('pielęgniarz')[0]).toBe('pielegniarz');
    expect(posortowane('prompt engineer')[0]).toBe('szeptacz');
    // większość zawodów ma powiązania, ale nie wszystkie (sprzedawca zostaje bez, losuje z puli ogólnej)
    expect(Object.keys(POWIAZANIA_ZAWODOW).length).toBeGreaterThanOrEqual(25);
  });
});

// ---------------------------------------------------------------- reguły modułu

describe('src/mieszkancy: reguły modułu', () => {
  const katalog = path.join(KORZEN, 'src/mieszkancy');
  const pliki = fs.readdirSync(katalog).filter((p) => p.endsWith('.ts'));
  const czytaj = (p: string): string => fs.readFileSync(path.join(katalog, p), 'utf8');
  const bezKomentarzy = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('żaden plik modułu nie wspomina zawodów z 0.3 (PROFS): tabela fachów jest własna', () => {
    expect(pliki).toContain('fachy.ts');
    for (const p of pliki) expect(czytaj(p), p).not.toMatch(/PROFS/);
  });

  it('fachy.ts: z content/data.ts tylko typ Dom, nic z sim, ui, render i gov, bez trygonometrii i potęg', () => {
    const zrodlo = bezKomentarzy(czytaj('fachy.ts'));
    expect(zrodlo).toMatch(/export function nadajFachy/);
    const importy = zrodlo.match(/^import .*$/gm) ?? [];
    for (const linia of importy) {
      if (/content\/data/.test(linia)) expect(linia).toMatch(/^import type \{ Dom \}/);
      expect(linia).not.toMatch(/\.\.\/(sim|ui|render|gov)\//);
      expect(linia).not.toMatch(/from 'node:/);
    }
    expect(zrodlo).not.toMatch(/Math\.(sin|cos|exp|log|pow|hypot|tan|atan|atan2|asin|acos|cbrt|expm1|log1p|random)\b/);
    expect(zrodlo).not.toMatch(/\*\*/);
    expect(zrodlo).not.toMatch(/Date\./);
  });
});

// ---------------------------------------------------------------- nadajFachy na zmyślonych osobach

describe('nadajFachy: granice wieku i stanu', () => {
  it('fach dostają obecni od 16 lat w 2051 (rocznik 2035), młodsi nie; dawny zawód tylko urodzeni do 2009', () => {
    const w = wynik([
      osoba('a', 'M', 2035), // 16 lat
      osoba('b', 'K', 2036), // 15 lat
      osoba('c', 'M', 2050), // niemowlę
      osoba('d', 'K', 2010), // 41 lat, urodzona po upadku
      osoba('e', 'M', 2009), // 42 lata, dorosły przed upadkiem
      osoba('f', 'K', 2008),
    ]);
    nadajFachy(w, losDla('fachy-test', 'granice'));
    const wg = new Map(w.osoby.map((o) => [o.id, o]));
    expect(wg.get('a')?.fach).toBeTruthy();
    expect(wg.get('b')?.fach).toBeUndefined();
    expect(wg.get('c')?.fach).toBeUndefined();
    expect(wg.get('d')?.fach).toBeTruthy();
    expect(wg.get('e')?.fach).toBeTruthy();
    for (const id of ['a', 'b', 'c', 'd']) expect(wg.get(id)?.dawnyZawod, id).toBeUndefined();
    for (const id of ['e', 'f']) expect(wg.get(id)?.dawnyZawod, id).toBeTruthy();
  });

  it('nieobecni i zmarli dostają dawny zawód, jeśli byli dorośli przed upadkiem, ale nigdy fachu', () => {
    const w = wynik([
      osoba('wyj', 'M', 1990, 'wyjechal'),
      osoba('zm', 'K', 1950, 'zmarl'),
      osoba('mlody-wyj', 'M', 2030, 'wyjechal'),
      osoba('mlody-zm', 'K', 2040, 'zmarl'),
    ]);
    nadajFachy(w, losDla('fachy-test', 'nieobecni'));
    const wg = new Map(w.osoby.map((o) => [o.id, o]));
    expect(wg.get('wyj')?.dawnyZawod).toBeTruthy();
    expect(wg.get('zm')?.dawnyZawod).toBeTruthy();
    expect(wg.get('mlody-wyj')?.dawnyZawod).toBeUndefined();
    expect(wg.get('mlody-zm')?.dawnyZawod).toBeUndefined();
    for (const o of w.osoby) expect(o.fach, o.id).toBeUndefined();
  });

  it('każdy rocznik do 2009, także 1910, dostaje dawny zawód z tabeli, a nikt nie dostaje fachu poniżej odWieku', () => {
    const zawody = new Set(DAWNE_ZAWODY.flatMap((z) => [z.m, z.k]));
    for (let rocznik = 1910; rocznik <= 2050; rocznik++) {
      const osoby = [...partia(25, 'M', rocznik, 'zakres'), ...partia(25, 'K', rocznik, 'zakres')];
      for (const o of osoby) {
        if (rocznik <= 2009) expect(zawody.has(o.dawnyZawod ?? ''), `${rocznik}: ${o.dawnyZawod}`).toBe(true);
        else expect(o.dawnyZawod, String(rocznik)).toBeUndefined();
        if (wiek(o) >= 16) {
          const f = fachOsoby(o);
          expect(f, `${rocznik}: ${o.fach}`).toBeDefined();
          expect(wiek(o), `${rocznik}: ${f?.id}`).toBeGreaterThanOrEqual(f?.odWieku ?? 99);
        } else expect(o.fach, String(rocznik)).toBeUndefined();
      }
    }
  });
});

describe('nadajFachy: wiek z roku stanu wyniku', () => {
  const zRokiem = (rok: number | undefined, osoby: Osoba[]): WynikBudynku => {
    const w = wynik(osoby);
    if (rok === undefined) delete w.rok;
    else w.rok = rok;
    return w;
  };

  it('próg 16 lat przesuwa się z rokiem stanu: w 2050 ma fach rocznik 2034, w 2051 rocznik 2035, w 2026 rocznik 2010', () => {
    const progi: [number, number][] = [
      [2050, 2034],
      [ROK_GRY, 2035],
      [2026, 2010],
    ];
    for (const [rok, rocznik] of progi) {
      const w = zRokiem(rok, [osoba('stary', 'M', rocznik), osoba('mlody', 'K', rocznik + 1)]);
      nadajFachy(w, losDla('fachy-test', 'rok', rok));
      expect(w.osoby[0].fach, `${rok}: rocznik ${rocznik} (16 lat)`).toBeTruthy();
      expect(w.osoby[1].fach, `${rok}: rocznik ${rocznik + 1} (15 lat)`).toBeUndefined();
    }
  });

  it('dawny zawód nie zależy od roku stanu: tylko rocznik do 2009', () => {
    for (const rok of [2026, 2050, ROK_GRY]) {
      const w = zRokiem(rok, [osoba('a', 'M', 2009), osoba('b', 'K', 2010)]);
      nadajFachy(w, losDla('fachy-test', 'rok-zawod', rok));
      expect(w.osoby[0].dawnyZawod, String(rok)).toBeTruthy();
      expect(w.osoby[1].dawnyZawod, String(rok)).toBeUndefined();
    }
  });

  it('wynik bez roku stanu (spis 2021, nie wynik postarz) to RangeError, a nic nie jest zmienione', () => {
    const w = zRokiem(undefined, [osoba('a', 'M', 1980)]);
    expect(() => nadajFachy(w, losDla('fachy-test', 'bez-roku'))).toThrow(RangeError);
    expect(w.osoby[0].fach).toBeUndefined();
    expect(w.osoby[0].dawnyZawod).toBeUndefined();
  });

  it('generator daje wynik z rokiem ROK_GRY, więc próg wieku w Przymorzu liczy się od roku gry', () => {
    const osiedle = generujObszar(przymorze, gdansk, kraj);
    expect(ROK_GRY).toBe(2051);
    for (const w of osiedle.budynki) {
      expect(w.rok).toBe(ROK_GRY);
      for (const o of w.osoby.filter((x) => x.stan === 'tu')) {
        expect(o.fach !== undefined, `${o.id}: rocznik ${o.rocznik}`).toBe((w.rok as number) - o.rocznik >= 16);
      }
    }
  });
});

describe('nadajFachy: forma według płci i niezmienność reszty', () => {
  it('dawny zawód to nazwa w formie płci, a fach to id z tabeli, z którego nazwa w formie płci wynika z `nazwaFachu`', () => {
    const osoby = [...partia(300, 'M', 1985, 'plec'), ...partia(300, 'K', 1985, 'plec')];
    const ids = new Set<string>(FACHY.map((f) => f.id));
    const zawodyM = new Set(DAWNE_ZAWODY.map((z) => z.m));
    const zawodyK = new Set(DAWNE_ZAWODY.map((z) => z.k));
    for (const o of osoby) {
      expect(ids.has(o.fach ?? ''), `${o.plec}: ${o.fach}`).toBe(true);
      expect(o.fach, o.id).toMatch(/^[a-z][A-Za-z]*$/);
      expect((o.plec === 'M' ? zawodyM : zawodyK).has(o.dawnyZawod ?? ''), `${o.plec}: ${o.dawnyZawod}`).toBe(true);
    }
    const o = osoby[osoby.length - 1];
    const f = fachOsoby(o) as Fach;
    expect(f.id).toBe(o.fach);
    expect(nazwaFachu(f.id, o.plec)).toBe(nazwaFormy(f, o.plec));
    expect(nazwaFormy(zawodOsoby(o) as { m: string; k: string }, o.plec)).toBe(o.dawnyZawod);
    expect(fachOsoby({ ...o, fach: undefined })).toBeUndefined();
    expect(zawodOsoby({ ...o, dawnyZawod: 'astronauta' })).toBeUndefined();
  });

  it('fach w osobie nie zależy od nazw wyświetlanych: nazwa w formie płci nie jest kluczem, a przemianowana tabela dalej go znajduje', () => {
    const osoby = [...partia(300, 'M', 1985, 'klucz'), ...partia(300, 'K', 1985, 'klucz')];
    // „felczerka”, „łataczka kabli” itd. nie są wartościami pola, więc nie rozwiązują się do niczego
    expect(fachOsoby({ fach: 'felczerka' })).toBeUndefined();
    expect(fachOsoby({ fach: 'łataczka kabli' })).toBeUndefined();
    expect(fachOsoby({ fach: 'lataczKabli' })?.m).toBe('łatacz kabli');
    // kopia tabeli z przemianowanymi wszystkimi nazwami: każdy zapisany fach nadal się w niej znajduje po id
    const przemianowane = new Map<string, Fach>(FACHY.map((f) => [f.id, { ...f, m: `nowy ${f.m}`, k: `nowa ${f.k}` }]));
    for (const o of osoby) {
      const wpis = przemianowane.get(o.fach ?? '');
      expect(wpis, `${o.plec}: ${o.fach}`).toBeDefined();
      expect(wpis?.id).toBe(fachOsoby(o)?.id);
    }
    // żadna kobieta nie ma w polu formy żeńskiej, o ile różni się ona od id
    const formyZenskieRozneOdId = new Set(FACHY.filter((f) => f.k !== f.id).map((f) => f.k));
    for (const o of osoby) expect(formyZenskieRozneOdId.has(o.fach ?? ''), `${o.plec}: ${o.fach}`).toBe(false);
  });

  it('zmienia tylko fach i dawnyZawod: reszta osoby, kolejność i długość listy zostają', () => {
    const osoby = Array.from({ length: 80 }, (_, i) => ({
      ...osoba(`o${i}`, i % 2 ? 'K' : 'M', 1930 + i, i % 7 === 0 ? 'wyjechal' : 'tu'),
      imie: `Imię${i}`,
      nazwisko: `Nazwisko${i}`,
      partner: i % 3 ? undefined : `o${i + 1}`,
    }));
    const w = wynik(osoby);
    const przed = JSON.parse(JSON.stringify(w)) as WynikBudynku;
    nadajFachy(w, losDla('fachy-test', 'reszta'));
    const po = JSON.parse(JSON.stringify(w)) as WynikBudynku;
    for (const o of po.osoby) {
      delete o.fach;
      delete o.dawnyZawod;
    }
    expect(po).toEqual(przed);
  });

  it('to samo ziarno daje te same fachy, inne ziarno inne', () => {
    const nowe = (): Osoba[] =>
      Array.from({ length: 200 }, (_, i) => osoba(`o${i}`, i % 2 ? 'K' : 'M', 1950 + (i % 80)));
    const daj = (ziarno: string): string[] => {
      const osoby = nowe();
      nadajFachy(wynik(osoby), losDla('fachy-test', ziarno));
      return osoby.map((o) => `${o.dawnyZawod}|${o.fach}`);
    };
    expect(daj('a')).toEqual(daj('a'));
    expect(daj('a')).not.toEqual(daj('b'));
  });
});

describe('nadajFachy: dawny zawód zależy od wieku', () => {
  const rocznikiOd = (od: number, doR: number, n: number, tag: string): Osoba[] => {
    const wszyscy: Osoba[] = [];
    for (let r = od; r <= doR; r++) wszyscy.push(...partia(n, 'M', r, tag), ...partia(n, 'K', r, tag));
    return wszyscy;
  };
  const zawodJest = (o: Osoba, ...m: string[]): boolean => m.includes(zawodOsoby(o)?.m ?? '');

  it('emeryt: urodzeni do 1959 często, 1960-1964 rzadziej, młodsi nigdy', () => {
    const starzy = rocznikiOd(1930, 1959, 60, 'emeryt');
    const przejsciowi = rocznikiOd(1960, 1964, 200, 'emeryt');
    const mlodsi = rocznikiOd(1965, 2009, 20, 'emeryt');
    const e = (o: Osoba): boolean => zawodJest(o, 'emeryt');
    expect(udzial(starzy, e)).toBeGreaterThan(0.4);
    expect(udzial(starzy, e)).toBeLessThan(0.7);
    expect(udzial(przejsciowi, e)).toBeGreaterThan(0.1);
    expect(udzial(przejsciowi, e)).toBeLessThan(0.4);
    expect(mlodsi.filter(e).length).toBe(0);
    // ale nie wszyscy starsi są emerytami: reszta ma dawny zawód
    expect(starzy.filter((o) => !e(o)).length).toBeGreaterThan(starzy.length * 0.3);
  });

  it('zawody ery cyfrowej i satyra są dla pokolenia, które pracowało w 2026, nie dla seniorów ani uczniów', () => {
    const cyfrowe = [
      'prompt engineer',
      'influencer',
      'kurier z hulajnogą',
      'doradca ds. ESG',
      'scrum master',
      'programista',
    ];
    const starzy = rocznikiOd(1925, 1958, 60, 'cyfra');
    expect(starzy.filter((o) => zawodJest(o, ...cyfrowe)).length).toBe(0);
    const mlodzi = rocznikiOd(2005, 2009, 200, 'cyfra');
    const zaStarzy = ['lekarz', 'kierowca autobusu', 'księgowy', 'nauczyciel', 'doradca ds. ESG', 'emeryt', 'urzędnik'];
    expect(mlodzi.filter((o) => zawodJest(o, ...zaStarzy)).length).toBe(0);
    // pokolenie z 2026 ma i zwykłe, i satyryczne zawody
    const srodek = rocznikiOd(1990, 2000, 300, 'cyfra');
    expect(srodek.filter((o) => zawodJest(o, 'prompt engineer')).length).toBeGreaterThan(30);
    expect(srodek.filter((o) => zawodJest(o, 'hydraulik')).length).toBeGreaterThan(30);
  });
});

describe('nadajFachy: wiek kształtuje fach', () => {
  const rocznikiOd = (od: number, doR: number, n: number, tag: string): Osoba[] => {
    const wszyscy: Osoba[] = [];
    for (let r = od; r <= doR; r++) wszyscy.push(...partia(n, 'M', r, tag), ...partia(n, 'K', r, tag));
    return wszyscy;
  };

  it('po 70. roku życia nikt nie dostaje fachu ciężkiej pracy, mimo dawnego zawodu murarza czy strażnika', () => {
    const starsi = rocznikiOd(1925, 1981, 80, 'ciezkie'); // 70-126 lat w 2051
    expect(starsi.length).toBeGreaterThan(5000);
    const ciezkie = starsi.filter((o) => CIEZKIE.includes(fachOsoby(o)?.id ?? ''));
    expect(ciezkie.map((o) => `${wiek(o)} ${o.fach}`)).toEqual([]);
    // ci sami w wieku produkcyjnym dostają je normalnie
    const mlodsi = rocznikiOd(1996, 2000, 200, 'ciezkie');
    expect(udzial(mlodsi, (o) => CIEZKIE.includes(fachOsoby(o)?.id ?? ''))).toBeGreaterThan(0.1);
  });

  it('seniorzy częściej robią przetwory, a seniorka od przetworów nie trafia do młodszych niż 60', () => {
    const starzy = rocznikiOd(1960, 1975, 200, 'przetwory'); // 76-91 lat
    const przetwory = (o: Osoba): boolean => fachOsoby(o)?.id === 'przetwory';
    expect(udzial(starzy, przetwory)).toBeGreaterThan(0.1);
    expect(udzial(starzy, przetwory)).toBeLessThan(0.45);
    const mlodsi = rocznikiOd(1992, 2035, 40, 'przetwory'); // 16-59 lat
    expect(mlodsi.filter(przetwory).length).toBe(0);
  });

  it('najstarsi, 85 lat i więcej, mają fach, i to lekki', () => {
    const najstarsi = rocznikiOd(1920, 1966, 100, 'najstarsi');
    for (const o of najstarsi) {
      expect(o.fach, `${wiek(o)} lat`).toBeTruthy();
      expect(CIEZKIE.includes(fachOsoby(o)?.id ?? ''), `${wiek(o)}: ${o.fach}`).toBe(false);
    }
  });
});

describe('nadajFachy: dawny zawód ciągnie do pokrewnego fachu', () => {
  // 1992-2001 to 50-59 lat w 2051 i 25-34 w 2026: bez cięcia wiekiem, w grze są wszystkie zawody, także cyfrowe
  const ludzie: Osoba[] = [];
  for (let r = 1992; r <= 2001; r++)
    ludzie.push(...partia(1500, 'M', r, 'powiazania'), ...partia(1500, 'K', r, 'powiazania'));

  const pokrewne = (zawod: string): Set<string> => new Set(Object.keys(POWIAZANIA_ZAWODOW[zawod]));
  const wZawodzie = (m: string): Osoba[] => ludzie.filter((o) => zawodOsoby(o)?.m === m);
  const udzialPokrewnych = (m: string): number => {
    const p = pokrewne(m);
    return udzial(wZawodzie(m), (o) => p.has(fachOsoby(o)?.id ?? ''));
  };

  it('hydraulik, programista, pielęgniarka i elektryk najczęściej kontynuują w pokrewnym fachu', () => {
    for (const m of ['hydraulik', 'programista', 'pielęgniarz', 'elektryk', 'prompt engineer', 'lekarz']) {
      expect(wZawodzie(m).length, m).toBeGreaterThan(100);
      expect(udzialPokrewnych(m), m).toBeGreaterThan(0.5);
    }
  });

  it('bez powiązań fach jest z puli ogólnej: sprzedawca rzadko trafia w fach pokrewny hydraulikowi', () => {
    const pHydraulika = pokrewne('hydraulik');
    const sprzedawcy = wZawodzie('sprzedawca');
    expect(sprzedawcy.length).toBeGreaterThan(100);
    expect(udzial(sprzedawcy, (o) => pHydraulika.has(fachOsoby(o)?.id ?? ''))).toBeLessThan(0.25);
    expect(udzial(wZawodzie('hydraulik'), (o) => pHydraulika.has(fachOsoby(o)?.id ?? ''))).toBeGreaterThan(0.5);
  });

  it('w szczególności: hydraulik zostaje zdunem albo instalatorem, ale nie tylko, a nie każdy lekarz jest lekarzem', () => {
    const h = wZawodzie('hydraulik');
    const zdunLubInstalator = udzial(h, (o) => ['zdun', 'instalator'].includes(fachOsoby(o)?.id ?? ''));
    expect(zdunLubInstalator).toBeGreaterThan(0.3);
    expect(zdunLubInstalator).toBeLessThan(0.75);
    const l = wZawodzie('lekarz');
    expect(udzial(l, (o) => fachOsoby(o)?.id === 'lekarz')).toBeLessThan(0.7);
    expect(udzial(l, (o) => (fachOsoby(o)?.umiejetnosci.med ?? 0) >= 2)).toBeGreaterThan(0.5);
  });

  it('prompt engineer zostaje szeptaczem do modelu, a doradca ds. ESG ląduje w kuchni i księgowości', () => {
    const p = wZawodzie('prompt engineer');
    expect(udzial(p, (o) => fachOsoby(o)?.id === 'szeptacz')).toBeGreaterThan(0.2);
    const esg = wZawodzie('doradca ds. ESG');
    expect(
      udzial(esg, (o) => ['ksiegowy', 'kucharz', 'ogrodDach', 'dzialkowiec'].includes(fachOsoby(o)?.id ?? '')),
    ).toBeGreaterThan(0.4);
  });
});

// ---------------------------------------------------------------- generator: Przymorze i dema

/** Niezmienniki fachów i dawnych zawodów dla wszystkich osób osiedla; wiek liczony z roku stanu wyniku (`w.rok`). */
function sprawdz(nazwa: string, osiedle: Osiedle): void {
  const osoby = osiedle.budynki.flatMap((w) => w.osoby);
  expect(osoby.length, nazwa).toBeGreaterThan(100);
  const ids = new Set<string>(FACHY.map((f) => f.id));
  for (const budynek of osiedle.budynki) {
    expect(budynek.rok, nazwa).toBe(ROK_GRY);
    for (const o of budynek.osoby) {
      const w = (budynek.rok as number) - o.rocznik;
      if (o.stan === 'tu' && w >= 16) {
        const f = fachOsoby(o);
        expect(f, `${nazwa} ${o.id}: ${o.fach}`).toBeDefined();
        expect(ids.has(o.fach ?? ''), `${nazwa} ${o.id}: ${o.fach}`).toBe(true);
        expect(o.fach, o.id).toBe(f?.id);
        expect(o.fach, o.id).toMatch(/^[a-z][A-Za-z]*$/);
        expect(w, `${o.id}: ${f?.id}`).toBeGreaterThanOrEqual(f?.odWieku ?? 99);
      } else expect(o.fach, `${nazwa} ${o.id} (${o.stan}, ${w} lat)`).toBeUndefined();
      if (o.rocznik <= 2009) {
        const z = zawodOsoby(o);
        expect(z, `${nazwa} ${o.id}: ${o.dawnyZawod}`).toBeDefined();
        expect(o.dawnyZawod, o.id).toBe(nazwaFormy(z as { m: string; k: string }, o.plec));
      } else expect(o.dawnyZawod, `${nazwa} ${o.id} (rocznik ${o.rocznik})`).toBeUndefined();
    }
  }
}

describe('Przymorze i dema: fachy w wyniku generatora', () => {
  const osiedle = generujObszar(przymorze, gdansk, kraj);
  const osoby = osiedle.budynki.flatMap((w) => w.osoby);
  const obecni = osoby.filter((o) => o.stan === 'tu');
  const dorosli = obecni.filter((o) => wiek(o) >= 16);

  it('każdy mieszkaniec Przymorza w wieku od 16 lat ma fach, młodszy go nie ma, nikt po 2009 nie ma dawnego zawodu', () => {
    expect(dorosli.length).toBeGreaterThan(500);
    expect(obecni.some((o) => wiek(o) < 16)).toBe(true);
    for (const o of dorosli) expect(o.fach, o.id).toBeTruthy();
    for (const o of obecni.filter((x) => wiek(x) < 16)) expect(o.fach, o.id).toBeUndefined();
    for (const o of osoby.filter((x) => x.rocznik > 2009)) expect(o.dawnyZawod, o.id).toBeUndefined();
    for (const o of osoby.filter((x) => x.rocznik <= 2009)) expect(o.dawnyZawod, o.id).toBeTruthy();
  });

  it('niezmienniki dla trzech dem: fach to id z tabeli, wiek z roku stanu co najmniej odWieku, nieobecni bez fachu', () => {
    for (const [nazwa, g] of DEMA)
      sprawdz(nazwa, nazwa === 'przymorze' ? osiedle : generujObszar(demo(nazwa), g, kraj));
  });

  it('rozkład: wiele fachów, żaden nie przeważa, ekspertów (umiejętność 4) mało, każda dziedzina jest obecna', () => {
    const liczby = new Map<string, number>();
    for (const o of dorosli) liczby.set(fachOsoby(o)?.id ?? '?', (liczby.get(fachOsoby(o)?.id ?? '?') ?? 0) + 1);
    expect(liczby.size, 'różnych fachów').toBeGreaterThanOrEqual(30);
    const najwiekszy = Math.max(...liczby.values());
    expect(najwiekszy / dorosli.length, 'udział najpopularniejszego fachu').toBeLessThan(0.15);
    const eksperci = dorosli.filter(
      (o) => Math.max(...(Object.values(fachOsoby(o)?.umiejetnosci ?? {}) as number[])) >= 4,
    );
    expect(eksperci.length / dorosli.length, 'udział umiejętności 4').toBeLessThan(0.05);
    for (const d of DOMY) {
      const maDziedzine = dorosli.filter((o) => (fachOsoby(o)?.umiejetnosci[d] ?? 0) > 0);
      expect(maDziedzine.length, d).toBeGreaterThan(dorosli.length * 0.04);
    }
  });

  it('wśród najstarszych (80+) są tylko fachy lekkie, a jest wśród nich seniorka od przetworów', () => {
    const najstarsi = dorosli.filter((o) => wiek(o) >= 80);
    expect(najstarsi.length).toBeGreaterThan(20);
    for (const o of najstarsi) expect(CIEZKIE.includes(fachOsoby(o)?.id ?? ''), `${wiek(o)}: ${o.fach}`).toBe(false);
    expect(najstarsi.some((o) => fachOsoby(o)?.id === 'przetwory')).toBe(true);
  });

  it('satyra się trafia: w Przymorzu są dawni prompt engineerzy, doradcy ESG i emeryci', () => {
    const zawody = new Set(osoby.map((o) => zawodOsoby(o)?.m));
    for (const m of ['emeryt', 'hydraulik', 'pielęgniarz', 'programista']) expect(zawody.has(m), m).toBe(true);
    expect(osoby.filter((o) => zawodOsoby(o)?.satyra).length).toBeGreaterThan(30);
  });
});

describe('generujBudynek i generujObszar: fachy nie zmieniają reszty wyniku', () => {
  const budynki = budynkiZGeo(przymorze, gdansk, kraj);
  const bezFachow = (w: WynikBudynku): WynikBudynku => {
    const kopia = JSON.parse(JSON.stringify(w)) as WynikBudynku;
    for (const o of kopia.osoby) {
      delete o.fach;
      delete o.dawnyZawod;
    }
    return kopia;
  };
  /** Wynik sprzed kroku 4: spis, 2026 i 2051 z upadkiem, bez fachów. */
  const sprzed = (b: Budynek): WynikBudynku =>
    postarz(obsadzBudynek(b, marginesyDla(gdansk, b.rejon), gdansk, kraj), ROK_GRY, kraj, obszarGminy(gdansk), true);

  it('wynik bez fachów jest taki sam jak sprzed kroku 4, dla każdego budynku Przymorza', () => {
    const osiedle = generujObszar(przymorze, gdansk, kraj);
    expect(osiedle.budynki.length).toBeGreaterThan(5);
    for (const w of osiedle.budynki) {
      const b = budynki.find((x) => x.klucz === w.budynek.klucz) as Budynek;
      expect(bezFachow(w), b.klucz).toEqual(sprzed(b));
    }
  });

  it('z tabelami nazw też: imiona i nazwiska są te same co bez fachów, fachy nie zależą od imion', () => {
    const z = generujObszar(przymorze, gdansk, kraj, nazwy);
    const bez = generujObszar(przymorze, gdansk, kraj);
    for (const [i, w] of z.budynki.entries()) {
      const b = budynki.find((x) => x.klucz === w.budynek.klucz) as Budynek;
      const oczekiwany = sprzed(b);
      nadajImiona(oczekiwany, imiona, pomorskie, losDla('imiona', b.klucz));
      expect(bezFachow(w), b.klucz).toEqual(oczekiwany);
      // te same fachy z nazwami i bez nich
      expect(
        w.osoby.map((o) => [o.fach, o.dawnyZawod]),
        b.klucz,
      ).toEqual(bez.budynki[i].osoby.map((o) => [o.fach, o.dawnyZawod]));
    }
  });

  it('ziarno to losDla("fachy", klucz budynku): fachy nadane ręcznie po spisie i upadku są te same', () => {
    for (const w of generujObszar(przymorze, gdansk, kraj).budynki.slice(0, 4)) {
      const b = budynki.find((x) => x.klucz === w.budynek.klucz) as Budynek;
      const reka = sprzed(b);
      nadajFachy(reka, losDla('fachy', b.klucz));
      expect(reka, b.klucz).toEqual(w);
    }
  });

  it('dwa wywołania dają ten sam wynik, a budynek osobno ten sam co w obszarze', () => {
    const a = generujObszar(przymorze, gdansk, kraj);
    expect(generujObszar(przymorze, gdansk, kraj)).toEqual(a);
    const w = a.budynki[a.budynki.length - 1];
    const b = budynki.find((x) => x.klucz === w.budynek.klucz) as Budynek;
    expect(generujBudynek(b, gdansk, kraj)).toEqual(w);
  });
});
