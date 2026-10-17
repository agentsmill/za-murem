/* Gospodarstwa na spis 2021 (src/mieszkancy/ipf.ts, spis.ts): IPF szablonu krajowego do brzegów rejonu i obsadzanie
   budynków ludźmi. Chodzi zawsze, na tabelach z public/data/mieszkancy/ i demach z public/demo/, bez surowych plików.
   Wiek osoby w teście to wiek na koniec 2020 roku (`2020 - rocznik`), czyli wiek w dniu spisu dla urodzonych po
   marcu; generator liczy w tej samej skali. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { rozkladGospodarstw } from '../../src/mieszkancy/ipf.ts';
import { czyTrzyPokolenia } from '../../src/mieszkancy/osoby.ts';
import { marginesyDla } from '../../src/mieszkancy/rejon.ts';
import { SKLONNOSCI, sklonnosc } from '../../src/mieszkancy/sklonnosci.ts';
import { obsadzBudynek, obsadzRejon } from '../../src/mieszkancy/spis.ts';
import type { Epoka, GrupaWieku, Marginesy, TabeleGminy, TabeleKraju } from '../../src/mieszkancy/tabele.ts';
import type { Budynek, Osoba, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import type { Geo } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;

const GRUPY: GrupaWieku[] = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const wiek = (o: Osoba): number => 2020 - o.rocznik;
const suma = (o: Record<string, number>): number => Object.values(o).reduce((s, v) => s + v, 0);

const przymorze = gdansk.rejony['182350'];
const wiesRejon = zielonki.rejony['398600'];
const wynikPrzymorza = obsadzRejon(przymorze, 2000, kraj, 'test-182350', gdansk);
const wynikZielonek = obsadzRejon(wiesRejon, 2000, kraj, 'test-398600', zielonki);

/** Rejon z kilkunastoma gospodarstwami i 40 osobami, z zerami i pustymi kategoriami. */
const maly: Marginesy = {
  gospodarstwa: { '1': 5, '2': 5, '3': 3, '4': 2, '5+': 0 },
  sklad: { jedno: 9, dwu: 0, 'trzy+': 0, nier1: 5, 'nier+': 1 },
  rodziny: { malzBez: 3, malzZ: 4, zwBez: 0, zwZ: 0, matka: 2, ojciec: 0 },
  dzieci: { '0': 3, '1': 4, '2': 2, '3': 0, '4+': 0 },
  wiek: {
    M: { '0-9': 2, '10-19': 1, '20-29': 0, '30-39': 4, '40-49': 3, '50-59': 2, '60-69': 3, '70-79': 2, '80+': 0 },
    K: { '0-9': 1, '10-19': 2, '20-29': 1, '30-39': 4, '40-49': 3, '50-59': 3, '60-69': 4, '70-79': 3, '80+': 2 },
  },
};
const zerowe = (): Marginesy => ({
  gospodarstwa: { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 },
  sklad: { jedno: 0, dwu: 0, 'trzy+': 0, nier1: 0, 'nier+': 0 },
  rodziny: { malzBez: 0, malzZ: 0, zwBez: 0, zwZ: 0, matka: 0, ojciec: 0 },
  dzieci: { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 },
  wiek: {
    M: { '0-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80+': 0 },
    K: { '0-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80+': 0 },
  },
});

const udzialJednoosobowych = (w: WynikBudynku): number =>
  w.gospodarstwa.filter((g) => g.czlonkowie.length === 1).length / w.gospodarstwa.length;
const sredniaWielkosc = (wyniki: WynikBudynku[]): number => {
  const gosp = wyniki.flatMap((w) => w.gospodarstwa);
  return gosp.reduce((s, g) => s + g.czlonkowie.length, 0) / gosp.length;
};

// ---------------------------------------------------------------- demo: budynki i ich wyniki

const budynkiPrzymorza = budynkiZGeo(demo('przymorze'), gdansk, kraj);
const budynkiZielonek = budynkiZGeo(demo('zielonki'), zielonki, kraj);
const obsadz = (b: Budynek, g: TabeleGminy): WynikBudynku => obsadzBudynek(b, marginesyDla(g, b.rejon), g, kraj);
const wynikiPrzymorza = budynkiPrzymorza.map((b) => obsadz(b, gdansk));
const wynikiZielonek = budynkiZielonek.map((b) => obsadz(b, zielonki));
const wszystkieWyniki = [wynikPrzymorza, wynikZielonek, ...wynikiPrzymorza, ...wynikiZielonek];

// ---------------------------------------------------------------- IPF

describe('rozkladGospodarstw: IPF szablonu krajowego do brzegów rejonu', () => {
  it('rejon 182350: wielkości i skład zgadzają się z brzegami co do promila, suma około 1000', () => {
    const r = rozkladGospodarstw(przymorze, kraj, true);
    const wszystkie = suma(przymorze.gospodarstwa);
    for (const w of ['1', '2', '3', '4', '5+'] as const) {
      const zRozkladu = [...r].filter(([k]) => k.startsWith(`${w}|`)).reduce((s, [, v]) => s + v, 0);
      expect(Math.abs(zRozkladu - (przymorze.gospodarstwa[w] / wszystkie) * 1000), w).toBeLessThanOrEqual(2);
    }
    for (const s of ['jedno', 'dwu', 'trzy+', 'nier1', 'nier+'] as const) {
      const zRozkladu = [...r].filter(([k]) => k.split('|')[1] === s).reduce((a, [, v]) => a + v, 0);
      expect(Math.abs(zRozkladu - (przymorze.sklad[s] / wszystkie) * 1000), s).toBeLessThanOrEqual(2);
    }
    const razem = [...r.values()].reduce((s, v) => s + v, 0);
    expect(Math.abs(razem - 1000)).toBeLessThanOrEqual(5);
    for (const v of r.values()) expect(Number.isInteger(v)).toBe(true);
  });

  it('zera w dwu i trzy+: bez NaN i wartości ujemnych, a komórki dwu|* i trzy+|* są 0', () => {
    const m: Marginesy = structuredClone(przymorze);
    m.sklad.jedno += m.sklad.dwu + m.sklad['trzy+'];
    m.sklad.dwu = 0;
    m.sklad['trzy+'] = 0;
    for (const miejska of [true, false]) {
      const r = rozkladGospodarstw(m, kraj, miejska);
      expect(r.size).toBeGreaterThan(0);
      for (const [k, v] of r) {
        expect(Number.isFinite(v), k).toBe(true);
        expect(v, k).toBeGreaterThanOrEqual(0);
        const s = k.split('|')[1];
        if (s === 'dwu' || s === 'trzy+') expect(v, k).toBe(0);
      }
      expect([...r.values()].reduce((a, v) => a + v, 0)).toBeGreaterThan(990);
    }
  });

  it('brzeg sprzeczny z szablonem (trzy+ bez gospodarstw 5+) i same zera też dają liczby, nie NaN', () => {
    const m: Marginesy = structuredClone(przymorze);
    m.gospodarstwa['4'] += m.gospodarstwa['5+'];
    m.gospodarstwa['5+'] = 0;
    for (const marg of [m, zerowe(), maly]) {
      const r = rozkladGospodarstw(marg, kraj, true);
      for (const [k, v] of r) {
        expect(Number.isFinite(v), k).toBe(true);
        expect(v, k).toBeGreaterThanOrEqual(0);
        if (k.startsWith('5+|') && marg !== maly) expect(v, k).toBe(0);
      }
    }
    expect([...rozkladGospodarstw(zerowe(), kraj, true).values()].every((v) => v === 0)).toBe(true);
  });

  it('wynik z pamięci podręcznej jest taki sam jak policzony od nowa, a zmiana kopii wyniku go nie psuje', () => {
    const a = rozkladGospodarstw(przymorze, kraj, true);
    a.set('1|nier1|60+', -5);
    const b = rozkladGospodarstw(przymorze, kraj, true);
    const c = rozkladGospodarstw(structuredClone(przymorze), kraj, true);
    expect(b.get('1|nier1|60+')).toBeGreaterThan(0);
    expect([...b]).toEqual([...c]);
    expect([...rozkladGospodarstw(przymorze, kraj, false)]).not.toEqual([...b]);
  });
});

// ---------------------------------------------------------------- obsadzRejon

describe('obsadzRejon: rejon bez budynku', () => {
  it('rejon 182350 (Przymorze): 2000 gospodarstw, jednoosobowych 39,6% ±3 pp, osób 80+ 9,5% ±2 pp', () => {
    expect(wynikPrzymorza.gospodarstwa).toHaveLength(2000);
    expect(Math.abs(udzialJednoosobowych(wynikPrzymorza) - 0.396)).toBeLessThanOrEqual(0.03);
    const osoby = wynikPrzymorza.osoby;
    const stare = osoby.filter((o) => wiek(o) >= 80).length;
    expect(Math.abs(stare / osoby.length - 0.095)).toBeLessThanOrEqual(0.02);
  });

  it('rejon 398600 (Zielonki): jednoosobowych 11,7% ±3 pp', () => {
    expect(Math.abs(udzialJednoosobowych(wynikZielonek) - 0.117)).toBeLessThanOrEqual(0.03);
  });

  /** Odchylenia udziałów płeć × wiek 10-letni i grup szerokich (0-19, 20-59, 60+) od marginesów `cele`. */
  const odchylenia = (cele: Marginesy['wiek'], osoby: readonly Osoba[]): { grupy: number[]; szerokie: number[] } => {
    const wszyscy = suma(cele.M) + suma(cele.K);
    const n = osoby.length;
    const ile = { M: new Array<number>(9).fill(0), K: new Array<number>(9).fill(0) };
    for (const o of osoby) ile[o.plec][Math.min(8, Math.floor(wiek(o) / 10))]++;
    const grupy = (['M', 'K'] as const).flatMap((p) => GRUPY.map((g, i) => ile[p][i] / n - cele[p][g] / wszyscy));
    const szerokie = [
      [0, 2],
      [2, 6],
      [6, 9],
    ].map(([od, doG]) => {
      let jest = 0;
      let cel = 0;
      for (let i = od; i < doG; i++) {
        jest += ile.M[i] + ile.K[i];
        cel += cele.M[GRUPY[i]] + cele.K[GRUPY[i]];
      }
      return jest / n - cel / wszyscy;
    });
    return { grupy, szerokie };
  };

  it('płeć i wiek w rejonie: każda grupa 10-letnia w ±1,5 pp, grupy 0-19, 20-59 i 60+ w ±2 pp', () => {
    for (const [m, w] of [
      [przymorze, wynikPrzymorza],
      [wiesRejon, wynikZielonek],
    ] as const) {
      const { grupy, szerokie } = odchylenia(m.wiek, w.osoby);
      for (const d of grupy) expect(Math.abs(d)).toBeLessThanOrEqual(0.015);
      for (const d of szerokie) expect(Math.abs(d)).toBeLessThanOrEqual(0.02);
    }
  });

  it('cała gmina z rejonów (test wsteczny, Task 10): grupy 0-19, 20-59 i 60+ w ±1 pp, 10-letnie w ±0,5 pp', () => {
    const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
    for (const g of [zielonki, ursynow]) {
      const osoby: Osoba[] = [];
      for (const [nr, m] of Object.entries(g.rejony)) {
        for (const o of obsadzRejon(m, suma(m.gospodarstwa), kraj, `${g.teryt}/${nr}`, g).osoby) osoby.push(o);
      }
      const { grupy, szerokie } = odchylenia(g.gmina.wiek, osoby);
      for (const d of grupy) expect(Math.abs(d), g.nazwa).toBeLessThanOrEqual(0.005);
      for (const d of szerokie) expect(Math.abs(d), g.nazwa).toBeLessThanOrEqual(0.01);
    }
  });

  it('rejon z 40 osobami i rejon z samymi zerami dają wynik bez wyjątku', () => {
    const w = obsadzRejon(maly, 15, kraj, 'maly');
    expect(w.gospodarstwa).toHaveLength(15);
    expect(w.osoby.length).toBeGreaterThanOrEqual(15);
    const z = obsadzRejon(zerowe(), 10, kraj, 'zero');
    expect(z.gospodarstwa).toHaveLength(10);
    expect(obsadzRejon(przymorze, 0, kraj, 'pusty').osoby).toEqual([]);
  });

  it('to samo ziarno daje ten sam wynik, także bez pamięci podręcznej; inne ziarno inny', () => {
    const a = obsadzRejon(przymorze, 300, kraj, 'powtorka', gdansk);
    const b = obsadzRejon(structuredClone(przymorze), 300, kraj, 'powtorka', structuredClone(gdansk));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(obsadzRejon(przymorze, 300, kraj, 'inne', gdansk))).not.toBe(JSON.stringify(a));
  });

  it('bez tabeli gminy (5. argument pominięty) działa na samych marginesach', () => {
    const w = obsadzRejon(przymorze, 500, kraj, 'bez-gminy');
    expect(w.gospodarstwa).toHaveLength(500);
    expect(Math.abs(udzialJednoosobowych(w) - 0.396)).toBeLessThanOrEqual(0.05);
  });
});

// ---------------------------------------------------------------- obsadzBudynek

describe('obsadzBudynek: budynki z dem', () => {
  it('średnia wielkość gospodarstwa w domach Zielonek jest większa niż w blokach Przymorza', () => {
    const domy = wynikiZielonek.filter((w) => w.budynek.typ === 'dom');
    const bloki = wynikiPrzymorza.filter((w) => w.budynek.typ === 'blok');
    expect(domy.length).toBeGreaterThan(50);
    expect(bloki.length).toBeGreaterThan(10);
    expect(sredniaWielkosc(domy)).toBeGreaterThan(sredniaWielkosc(bloki));
  });

  it('gospodarstwa i puste mieszkania dają razem mieszkania budynku; obsadzenie około 0,97 w Gdańsku', () => {
    let mieszkania = 0;
    let gospodarstwa = 0;
    for (const w of [...wynikiPrzymorza, ...wynikiZielonek]) {
      expect(w.gospodarstwa.length + w.puste, w.budynek.klucz).toBe(w.budynek.mieszkania);
      expect(w.puste, w.budynek.klucz).toBeGreaterThanOrEqual(0);
      if (w.budynek.typ === 'blok') {
        mieszkania += w.budynek.mieszkania ?? 0;
        gospodarstwa += w.gospodarstwa.length;
      }
    }
    expect(gospodarstwa / mieszkania).toBeGreaterThan(0.94);
    expect(gospodarstwa / mieszkania).toBeLessThan(0.99);
  });

  it('identyfikatory są unikalne, gospodarstwa wskazują budynek i klatkę, każda osoba w jednym gospodarstwie', () => {
    for (const w of [...wynikiPrzymorza, ...wynikiZielonek]) {
      const b = w.budynek;
      const ids = new Set(w.osoby.map((o) => o.id));
      expect(ids.size, b.klucz).toBe(w.osoby.length);
      expect(new Set(w.gospodarstwa.map((g) => g.id)).size).toBe(w.gospodarstwa.length);
      const czlonkowie = w.gospodarstwa.flatMap((g) => g.czlonkowie);
      expect(czlonkowie.length, b.klucz).toBe(w.osoby.length);
      expect(new Set(czlonkowie)).toEqual(ids);
      for (const g of w.gospodarstwa) {
        expect(g.budynek).toBe(b.klucz);
        expect(g.id.startsWith(`${b.klucz}/g`)).toBe(true);
        expect(g.klatka, g.id).toBeGreaterThanOrEqual(1);
        expect(g.klatka, g.id).toBeLessThanOrEqual(b.klatki);
        expect(g.czlonkowie.length, g.id).toBeGreaterThanOrEqual(1);
      }
      for (const o of w.osoby) {
        expect(o.id.startsWith(`${b.klucz}/o`)).toBe(true);
        expect(o.stan).toBe('tu');
        expect(o.imie).toBe('');
        expect(o.nazwisko).toBe('');
      }
    }
  });

  it('klatki bloku są obsadzone po równo (różnica najwyżej jedno gospodarstwo)', () => {
    for (const w of wynikiPrzymorza.filter((x) => x.budynek.klatki > 1)) {
      const ile = Array.from({ length: w.budynek.klatki }, (_, i) => w.gospodarstwa.filter((g) => g.klatka === i + 1));
      const dlugosci = ile.map((l) => l.length);
      expect(Math.max(...dlugosci) - Math.min(...dlugosci), w.budynek.klucz).toBeLessThanOrEqual(1);
    }
  });

  it('ten sam budynek dwa razy daje ten sam wynik; wejściowy budynek zostaje nietknięty', () => {
    const b = budynkiPrzymorza.find((x) => x.typ === 'blok')!;
    const kopia = structuredClone(b);
    expect(JSON.stringify(obsadz(b, gdansk))).toBe(JSON.stringify(obsadz(b, gdansk)));
    expect(b).toEqual(kopia);
  });

  it('budynek bez epoki i liczby mieszkań dostaje je z budynki.ts', () => {
    const b = budynkiPrzymorza.find((x) => x.typ === 'blok')!;
    const { epoka: _e, mieszkania: _m, ...bez } = b;
    const w = obsadz(bez, gdansk);
    expect(w.budynek.epoka).toBe(b.epoka);
    expect(w.budynek.mieszkania).toBe(b.mieszkania);
    expect(JSON.stringify(w)).toBe(JSON.stringify(obsadz(b, gdansk)));
  });

  it('bez tabeli gminy: marginesy Polski i obsadzenie 0,95', () => {
    const b: Budynek = { ...budynkiPrzymorza.find((x) => x.typ === 'blok')!, mieszkania: 200, rejon: '' };
    const w = obsadzBudynek(b, kraj.polska, null, kraj);
    expect(Math.abs(w.gospodarstwa.length - 190)).toBeLessThanOrEqual(1);
    expect(w.puste).toBe(200 - w.gospodarstwa.length);
  });

  it('rejon z 40 osobami albo z samymi zerami w budynku też daje wynik', () => {
    const b = budynkiPrzymorza.find((x) => x.typ === 'blok')!;
    expect(obsadzBudynek(b, maly, gdansk, kraj).gospodarstwa.length).toBeGreaterThan(0);
    expect(obsadzBudynek(b, zerowe(), gdansk, kraj).gospodarstwa.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- rodziny i przydział

describe('rodziny i przydział', () => {
  const osobyWg = (w: WynikBudynku): Map<string, Osoba> => new Map(w.osoby.map((o) => [o.id, o]));

  it('każde dziecko ma matkę starszą o 18-42 lata, a ojca o 18-50', () => {
    let dzieci = 0;
    for (const w of wszystkieWyniki) {
      const wg = osobyWg(w);
      for (const o of w.osoby) {
        if (o.matka) {
          const m = wg.get(o.matka)!;
          expect(m.plec, o.id).toBe('K');
          expect(o.rocznik - m.rocznik, o.id).toBeGreaterThanOrEqual(18);
          expect(o.rocznik - m.rocznik, o.id).toBeLessThanOrEqual(42);
          dzieci++;
        }
        if (o.ojciec) {
          const f = wg.get(o.ojciec)!;
          expect(f.plec, o.id).toBe('M');
          expect(o.rocznik - f.rocznik, o.id).toBeGreaterThanOrEqual(18);
          expect(o.rocznik - f.rocznik, o.id).toBeLessThanOrEqual(50);
        }
      }
    }
    expect(dzieci).toBeGreaterThan(500);
  });

  it('partnerzy wskazują siebie nawzajem, są różnej płci i różnią się wiekiem najwyżej o 5 lat', () => {
    for (const w of wszystkieWyniki) {
      const wg = osobyWg(w);
      for (const o of w.osoby) {
        if (!o.partner) continue;
        const p = wg.get(o.partner)!;
        expect(p.partner, o.id).toBe(o.id);
        expect(p.plec, o.id).not.toBe(o.plec);
        expect(Math.abs(p.rocznik - o.rocznik), o.id).toBeLessThanOrEqual(5);
      }
    }
  });

  it('krewni mieszkają w tym samym gospodarstwie; pierwszy członek (głowa) ma co najmniej 20 lat', () => {
    for (const w of wszystkieWyniki) {
      const gdzie = new Map<string, string>();
      for (const g of w.gospodarstwa) for (const id of g.czlonkowie) gdzie.set(id, g.id);
      const wg = osobyWg(w);
      for (const g of w.gospodarstwa) expect(wiek(wg.get(g.czlonkowie[0])!), g.id).toBeGreaterThanOrEqual(20);
      for (const o of w.osoby) {
        for (const krewny of [o.matka, o.ojciec, o.partner]) {
          if (krewny) expect(gdzie.get(krewny), o.id).toBe(gdzie.get(o.id));
        }
      }
    }
  });

  it('nikt nie ma więcej niż 100 lat ani mniej niż 0; roczniki do 2020', () => {
    for (const w of wszystkieWyniki) {
      for (const o of w.osoby) {
        expect(wiek(o), o.id).toBeGreaterThanOrEqual(0);
        expect(wiek(o), o.id).toBeLessThanOrEqual(100);
      }
    }
  });

  it('żaden odOddania przy epoce nowa, w domach i bez budynku', () => {
    for (const w of [...wynikiPrzymorza, ...wynikiZielonek]) {
      if (w.budynek.epoka === 'nowa' || w.budynek.typ === 'dom') {
        for (const g of w.gospodarstwa) expect(g.odOddania, g.id).toBe(false);
      }
    }
    for (const w of [wynikPrzymorza, wynikZielonek]) {
      expect(w.gospodarstwa.some((g) => g.odOddania)).toBe(false);
      expect(w.dziennik).toEqual([]);
    }
    const blok = budynkiPrzymorza.find((x) => x.typ === 'blok')!;
    const nowy = obsadz({ ...blok, epoka: 'nowa', klucz: 'test-nowy' }, gdansk);
    expect(nowy.gospodarstwa.some((g) => g.odOddania)).toBe(false);
    expect(nowy.dziennik).toEqual([]);
  });

  it('blok z płyty: głowa z wpisem przydział miała w 1980 od 22 do 40 lat, i tylko wtedy', () => {
    const blok = budynkiPrzymorza.find((x) => x.typ === 'blok')!;
    const plyta = obsadz(
      { ...blok, epoka: 'plyta', startDate: undefined, mieszkania: 300, klucz: 'test-plyta' },
      gdansk,
    );
    const wg = osobyWg(plyta);
    let zPrzydzialem = 0;
    for (const g of plyta.gospodarstwa) {
      const glowa = wg.get(g.czlonkowie[0])!;
      const wiekWtedy = 1980 - glowa.rocznik;
      expect(g.odOddania, g.id).toBe(wiekWtedy >= 22 && wiekWtedy <= 40);
      const wpisy = plyta.dziennik.filter((d) => d.kto === glowa.id);
      expect(wpisy, g.id).toEqual(g.odOddania ? [{ rok: 1980, typ: 'przydzial', kto: glowa.id }] : []);
      if (g.odOddania) zPrzydzialem++;
    }
    expect(zPrzydzialem).toBeGreaterThan(10);
    const powojenny = obsadz({ ...blok, epoka: 'powojenna', startDate: undefined, klucz: 'test-pow' }, gdansk);
    for (const d of powojenny.dziennik) expect(d.rok).toBe(1958);
  });
});

// ---------------------------------------------------------------- skłonności budynków i trzy pokolenia (R26)

describe('skłonności typu i epoki budynku', () => {
  const EPOKI: Epoka[] = ['przedwojenna', 'powojenna', 'plyta', 'transformacja', 'nowa'];
  /** Sztuczny budynek w rejonie, z gotową epoką i liczbą mieszkań. */
  const sztuczny = (rejon: string, typ: Budynek['typ'], epoka: Epoka, mieszkania: number, klucz: string): Budynek => ({
    klucz,
    lat: 0,
    lon: 0,
    rejon,
    typ,
    kondygnacje: typ === 'dom' ? 2 : 5,
    pole: 100,
    szerokosc: 10,
    dlugosc: 10,
    klatki: 1,
    epoka,
    mieszkania,
  });
  /** Co najmniej 3 000 gospodarstw jednego rodzaju w rejonie 398600: 3 100 domów po jednym mieszkaniu albo 10 bloków
      po 310 mieszkań. */
  const rodzaj = (typ: Budynek['typ'], epoka: Epoka): WynikBudynku[] =>
    typ === 'dom'
      ? Array.from({ length: 3100 }, (_, i) => obsadz(sztuczny('398600', 'dom', epoka, 1, `d-${epoka}-${i}`), zielonki))
      : Array.from({ length: 10 }, (_, i) =>
          obsadz(sztuczny('398600', 'blok', epoka, 310, `b-${epoka}-${i}`), zielonki),
        );
  const udzial = (wyniki: WynikBudynku[], czy: (w: number) => boolean): number => {
    const osoby = wyniki.flatMap((w) => w.osoby);
    return osoby.filter((o) => czy(wiek(o))).length / osoby.length;
  };
  const glowy2539 = (wyniki: WynikBudynku[]): number => {
    let ile = 0;
    let razem = 0;
    for (const w of wyniki) {
      const wg = new Map(w.osoby.map((o) => [o.id, o]));
      for (const g of w.gospodarstwa) {
        const x = wiek(wg.get(g.czlonkowie[0])!);
        razem++;
        if (x >= 25 && x <= 39) ile++;
      }
    }
    return ile / razem;
  };
  const domPrzedwojenny = rodzaj('dom', 'przedwojenna');
  const domNowy = rodzaj('dom', 'nowa');
  const blokZPlyty = rodzaj('blok', 'plyta');
  const blokNowy = rodzaj('blok', 'nowa');

  it('każdy rodzaj ma co najmniej 3 000 gospodarstw', () => {
    for (const w of [domPrzedwojenny, domNowy, blokZPlyty, blokNowy]) {
      expect(w.reduce((a, x) => a + x.gospodarstwa.length, 0)).toBeGreaterThanOrEqual(3000);
    }
  });

  it('398600: osób 60+ w starych domach o co najmniej 10 pp więcej niż w nowych', () => {
    expect(udzial(domPrzedwojenny, (x) => x >= 60) - udzial(domNowy, (x) => x >= 60)).toBeGreaterThanOrEqual(0.1);
  });

  it('398600: osób 70+ w blokach z płyty o co najmniej 8 pp więcej niż w blokach po 2011', () => {
    expect(udzial(blokZPlyty, (x) => x >= 70) - udzial(blokNowy, (x) => x >= 70)).toBeGreaterThanOrEqual(0.08);
  });

  it('398600: głów gospodarstw w wieku 25-39 w blokach po 2011 o co najmniej 10 pp więcej niż w płycie', () => {
    expect(glowy2539(blokNowy) - glowy2539(blokZPlyty)).toBeGreaterThanOrEqual(0.1);
  });

  it('182350: bloki wszystkich epok w proporcjach mieszkań Gdańska trzymają 60+ w ±3 pp i 80+ w ±2 pp rejonu', () => {
    const mieszkan = EPOKI.reduce((a, e) => a + gdansk.epoki[e].mieszkania, 0);
    const wyniki: WynikBudynku[] = [];
    for (const e of EPOKI) {
      const bloki = Math.round((3000 * gdansk.epoki[e].mieszkania) / mieszkan / 100);
      for (let i = 0; i < bloki; i++) wyniki.push(obsadz(sztuczny('182350', 'blok', e, 100, `a-${e}-${i}`), gdansk));
    }
    const ludnosc = suma(przymorze.wiek.M) + suma(przymorze.wiek.K);
    const cel = (grupy: GrupaWieku[]): number =>
      grupy.reduce((a, g) => a + przymorze.wiek.M[g] + przymorze.wiek.K[g], 0) / ludnosc;
    expect(Math.abs(udzial(wyniki, (x) => x >= 60) - cel(['60-69', '70-79', '80+']))).toBeLessThanOrEqual(0.03);
    expect(Math.abs(udzial(wyniki, (x) => x >= 80) - cel(['80+']))).toBeLessThanOrEqual(0.02);
  });

  it('skłonności znormowane po epokach gminy: budynki wszystkich epok razem oddają profil wieku gminy', () => {
    const grupy = GRUPY.map((g) => gdansk.gmina.wiek.M[g] + gdansk.gmina.wiek.K[g]);
    const c = grupy.map((v) => v / grupy.reduce((a, x) => a + x, 0));
    const osoby = EPOKI.map((e) => gdansk.epoki[e].osoby);
    const w = osoby.map((v) => v / osoby.reduce((a, x) => a + x, 0));
    for (const typ of ['dom', 'blok'] as const) {
      const razem = c.map(() => 0);
      EPOKI.forEach((e, ie) => {
        const t = sklonnosc(gdansk, kraj, typ, e).wiek;
        const z = t.reduce((a, x, i) => a + c[i] * x, 0);
        t.forEach((x, i) => {
          razem[i] += (w[ie] * c[i] * x) / z;
        });
      });
      for (let i = 0; i < c.length; i++) expect(Math.abs(razem[i] - c[i]), `${typ} ${GRUPY[i]}`).toBeLessThan(1e-9);
      // kierunek z tabeli zostaje: płyta i stare domy starsze niż nowe budynki
      expect(sklonnosc(gdansk, kraj, typ, 'nowa').wiek[7]).toBeLessThan(sklonnosc(gdansk, kraj, typ, 'plyta').wiek[7]);
    }
    expect(Object.keys(SKLONNOSCI.dom)).toEqual(EPOKI);
  });
});

describe('gospodarstwa trzypokoleniowe (osoby 0-29, 30-59 i 60+ razem)', () => {
  const udzialTrzech = (wyniki: WynikBudynku[]): number => {
    let ile = 0;
    let razem = 0;
    for (const w of wyniki) {
      const wg = new Map(w.osoby.map((o) => [o.id, o]));
      for (const g of w.gospodarstwa) {
        razem++;
        if (czyTrzyPokolenia(g.czlonkowie.map((id) => wg.get(id)!))) ile++;
      }
    }
    return ile / razem;
  };

  it('Przymorze (wszystkie budynki dema): w ±3 pp od udziału dla miast z NSP 2021 (9,9%)', () => {
    expect(Math.abs(udzialTrzech(wynikiPrzymorza) - kraj.trojpokoleniowe.miasta / 10000)).toBeLessThanOrEqual(0.03);
  });

  it('Zielonki (gmina wiejska, domy): w ±5 pp od udziału dla wsi (24,3%)', () => {
    expect(zielonki.miejska).toBe(false);
    expect(Math.abs(udzialTrzech(wynikiZielonek) - kraj.trojpokoleniowe.wies / 10000)).toBeLessThanOrEqual(0.05);
  });

  it('domy mają więcej trzech pokoleń niż bloki tej samej gminy i epoki', () => {
    const typu = (typ: Budynek['typ']): WynikBudynku[] =>
      Array.from({ length: 1500 }, (_, i) =>
        obsadz({ ...budynkiPrzymorza[0], typ, epoka: 'transformacja', mieszkania: 1, klucz: `t-${typ}-${i}` }, gdansk),
      );
    expect(udzialTrzech(typu('dom'))).toBeGreaterThan(udzialTrzech(typu('blok')));
  });
});

// ---------------------------------------------------------------- wydajność i zasady modułu

describe('wydajność i zasady modułu', () => {
  it('wszystkie budynki dema obsadzają się szybko (spis to mały kawałek budżetu 200 ms)', () => {
    const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
    const budynki = budynkiZGeo(demo('lanciego'), ursynow, kraj);
    const t0 = performance.now();
    for (const b of budynki) obsadzBudynek(b, marginesyDla(ursynow, b.rejon), ursynow, kraj);
    expect(performance.now() - t0).toBeLessThan(400);
  });

  it('ipf.ts i spis.ts nie używają trygonometrii, potęg, logarytmów ani Math.random', () => {
    for (const plik of fs.readdirSync(path.join(KORZEN, 'src/mieszkancy'))) {
      if (!['ipf.ts', 'spis.ts', 'osoby.ts'].includes(plik)) continue;
      const kod = fs.readFileSync(path.join(KORZEN, 'src/mieszkancy', plik), 'utf8');
      expect(kod, plik).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan|exp|expm1|log|pow|hypot|cbrt|random)\b/);
      expect(kod, plik).not.toMatch(/[\w)\]]\s*\*\*\s*[\w(]/);
    }
  });
});
