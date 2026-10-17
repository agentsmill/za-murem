/* Szablony (src/mieszkancy/szablony.ts) i historie gospodarstw (src/mieszkancy/historie.ts) oraz podpięcie do
   generatora (generuj.ts). Chodzi zawsze, na tabelach z public/data/mieszkancy/ i demach z public/demo/, bez surowych
   plików. Część testów pracuje na zmyślonym budynku, żeby sprawdzić regułę (odmiana, powtórzenia), a nie dane.
   Trygonometria wolno tutaj, w teście (w src/mieszkancy/ jest jedno miejsce). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import {
  budynkiObszaru,
  generujBudynek,
  generujObszar,
  kronikaObszaru,
  type Nazwy,
} from '../../src/mieszkancy/generuj.ts';
import {
  faktyGospodarstwa,
  historiaGospodarstwa,
  kategoriaWpisu,
  type Odmiana,
  pokrewienstwo,
  tematWpisu,
  WAGI_ZDARZEN,
  zdaniaGospodarstwa,
} from '../../src/mieszkancy/historie.ts';
import { bezPuliLokalnej, nazwiskaDlaGminy } from '../../src/mieszkancy/imiona.ts';
import { kronika, type WpisKroniki, zbiorImion } from '../../src/mieszkancy/kronika.ts';
import { losDla } from '../../src/mieszkancy/los.ts';
import { type OdmianaPlik, odmien, rozpakujOdmiane, type TabelaKoncowek } from '../../src/mieszkancy/odmiana.ts';
import {
  type KontekstSzablonu,
  KREWNI,
  RODZAJE_ZDARZEN,
  SKAD,
  SZABLONY,
  slotySzablonu,
  wypelnij,
} from '../../src/mieszkancy/szablony.ts';
import type { TabeleGminy, TabeleImion, TabeleKraju, TabeleNazwisk } from '../../src/mieszkancy/tabele.ts';
import type { Budynek, Gospodarstwo, Osiedle, Osoba, Plec, Wpis, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import type { Geo } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const imiona = wczytaj<TabeleImion>('data/mieszkancy/imiona.json');
const odmiana: Odmiana = {
  tabela: rozpakujOdmiane(wczytaj<OdmianaPlik>('data/mieszkancy/odmiana.json')),
  koncowki: wczytaj<TabelaKoncowek>('data/mieszkancy/odmiana-koncowki.json'),
};
const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;
function nazwiskaGminy(g: TabeleGminy): TabeleNazwisk {
  const { plik, lokalne } = nazwiskaDlaGminy(g);
  const t = wczytaj<TabeleNazwisk>(`data/mieszkancy/nazwiska/${plik}.json`);
  return lokalne ? t : bezPuliLokalnej(t);
}

interface Demo {
  nazwa: string;
  geo: Geo;
  g: TabeleGminy;
  nazwy: Nazwy;
  osiedle: Osiedle;
  kronika: WpisKroniki[];
}
function przygotuj(nazwa: string, g: TabeleGminy): Demo {
  const geo = demo(nazwa);
  const nazwy: Nazwy = { imiona, nazwiska: nazwiskaGminy(g), odmiana };
  return {
    nazwa,
    geo,
    g,
    nazwy,
    osiedle: generujObszar(geo, g, kraj, nazwy),
    kronika: kronikaObszaru(geo, budynkiObszaru(geo, g, kraj), imiona),
  };
}
const DEMA: Demo[] = [przygotuj('przymorze', gdansk), przygotuj('lanciego', ursynow), przygotuj('zielonki', zielonki)];
const [PRZYMORZE] = DEMA;

const wszystkieHistorie = (d: Demo): { w: WynikBudynku; h: Gospodarstwo; zdania: string[] }[] =>
  d.osiedle.budynki.flatMap((w) => w.gospodarstwa.map((h) => ({ w, h, zdania: h.historia ?? [] })));

const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
const PAUZY = /—| – /;
const TY = /(^|[^\p{L}])(ty|ciebie|cię|tobie|ci|twój|twoja|twoje|twoim|twoich|twojego|twojej)(?![\p{L}])/iu;

// ---------------------------------------------------------------- zmyślone osoby

function osoba(id: string, imie: string, plec: Plec, rocznik: number, inne: Partial<Osoba> = {}): Osoba {
  return { id, imie, nazwisko: plec === 'K' ? 'Kowalska' : 'Kowalski', plec, rocznik, stan: 'tu', ...inne };
}
const zFormami = (o: Osoba) => ({ ...o, formy: odmien(o.imie, o.plec, odmiana.tabela, odmiana.koncowki).formy });

const BUDYNEK: Budynek = {
  klucz: 'test/b1',
  lat: 54.4,
  lon: 18.6,
  rejon: '',
  typ: 'blok',
  kondygnacje: 4,
  pole: 600,
  szerokosc: 12,
  dlugosc: 50,
  klatki: 2,
  mieszkania: 40,
};
function budynek(osoby: Osoba[], gospodarstwa: Gospodarstwo[], dziennik: Wpis[]): WynikBudynku {
  return { budynek: BUDYNEK, osoby, gospodarstwa, dziennik, puste: 0, rok: 2051 };
}
const gosp = (id: string, czlonkowie: string[], odOddania = false): Gospodarstwo => ({
  id,
  budynek: BUDYNEK.klucz,
  klatka: 1,
  czlonkowie,
  odOddania,
});

/** Wdowa, która mieszka sama: mąż zmarł w `rokZgonu`. */
function wdowa(n: number, imie: string, rokZgonu: number): { osoby: Osoba[]; h: Gospodarstwo; wpisy: Wpis[] } {
  const ona = osoba(`test/b1/o${2 * n}`, imie, 'K', 1960, { partner: `test/b1/o${2 * n + 1}` });
  const on = osoba(`test/b1/o${2 * n + 1}`, 'Zbigniew', 'M', 1958, { partner: ona.id, stan: 'zmarl' });
  return {
    osoby: [ona, on],
    h: gosp(`test/b1/g${n}`, [ona.id]),
    wpisy: [
      { rok: rokZgonu, typ: 'zgon', kto: on.id },
      { rok: rokZgonu, typ: 'owdowienie', kto: ona.id, z: on.id },
    ],
  };
}
const KRONIKA_TESTOWA: WpisKroniki[] = [
  { rok: 2026, tekst: 'Na osiedlu zaczęły się dziwne awarie kabli. Administracja zwaliła je na starą instalację.' },
  { rok: 2029, tekst: 'Ktoś wreszcie połączył kropki: kable zjada bakteria.' },
  {
    rok: 2033,
    tekst: 'W sklepie spożywczym (Żabka) powstał punkt wymiany słoików.',
    miejsce: 'Żabka',
  },
  { rok: 2051, tekst: 'Spółdzielnia policzyła ludzi, światło i zapasy na zimę.' },
];

// ---------------------------------------------------------------- wypelnij

describe('wypelnij: sloty szablonu', () => {
  const marek = zFormami(osoba('a', 'Marek', 'M', 1980));
  const halina = zFormami(osoba('b', 'Halina', 'K', 1952));
  const kontekst: KontekstSzablonu = { glowna: marek, powiazana: halina };

  it('{p:narz} z Haliną daje „mieszka z Haliną”', () => {
    expect(wypelnij('mieszka z {p:narz}', kontekst)).toBe('mieszka z Haliną');
  });

  it('{g:wrócił|wróciła} bierze formę po płci osoby głównej, {pg:…} po płci osoby powiązanej', () => {
    expect(wypelnij('{g:wrócił|wróciła}', { glowna: halina })).toBe('wróciła');
    expect(wypelnij('{g:wrócił|wróciła}', { glowna: marek })).toBe('wrócił');
    expect(wypelnij('wrócił{g:|a}', { glowna: halina })).toBe('wróciła');
    expect(wypelnij('{p:mian} zmarł{pg:|a}', kontekst)).toBe('Halina zmarła');
  });

  it('przypadki osoby głównej, krewny, nazwisko rodziny, rok, wiek, kierunki, miejsce, zawód i fach', () => {
    const pelny: KontekstSzablonu = {
      ...kontekst,
      krewny: KREWNI.matka,
      rodzina: 'Kowalscy',
      rok: 2031,
      wiek: 74,
      dokad: 'do Niemiec',
      skad: 'z Niemiec',
      miejsce: 'Żabka',
      zawod: 'księgowy',
      fach: 'zielarz',
    };
    expect(wypelnij('{o:mian}, {o:dop}, {o:cel}, {o:bier}, {o:narz}, {o:msc}, {o:wol}', pelny)).toBe(
      'Marek, Marka, Markowi, Marka, Markiem, Marku, Marku',
    );
    expect(wypelnij('opiekuje się {k:narz}, po {k:msc}', pelny)).toBe('opiekuje się matką, po matce');
    expect(wypelnij('{rodzina} w {rok}, {wiek}', pelny)).toBe('Kowalscy w 2031, 74 lata');
    expect(wypelnij('wyjechał {dokad}, wrócił {skad}', pelny)).toBe('wyjechał do Niemiec, wrócił z Niemiec');
    expect(wypelnij('({miejsce}) {zawod}, {fach}', pelny)).toBe('(Żabka) księgowy, zielarz');
    expect(wypelnij('{wiek}', { ...pelny, wiek: 1 })).toBe('1 rok');
    expect(wypelnij('{wiek}', { ...pelny, wiek: 12 })).toBe('12 lat');
  });

  it('nierozpoznany albo źle zapisany slot rzuca wyjątek', () => {
    for (const zly of ['{x}', '{o:foo}', '{g:wrócił}', '{p}', '{rok', 'rok}', '{o:Mian}', '{}']) {
      expect(() => wypelnij(zly, kontekst), zly).toThrow();
    }
    expect(() => slotySzablonu('{nieznany}')).toThrow();
  });

  it('slot bez wartości w kontekście rzuca wyjątek', () => {
    expect(() => wypelnij('{p:mian}', { glowna: marek })).toThrow();
    expect(() => wypelnij('{pg:|a}', { glowna: marek })).toThrow();
    expect(() => wypelnij('{k:dop}', kontekst)).toThrow();
    for (const s of ['{rodzina}', '{rok}', '{wiek}', '{dokad}', '{skad}', '{miejsce}', '{zawod}', '{fach}']) {
      expect(() => wypelnij(s, kontekst), s).toThrow();
    }
  });

  it('SKAD: każdy kierunek wyjazdu z silnika ma formę powrotu', () => {
    const zrodlo = fs.readFileSync(path.join(KORZEN, 'src/mieszkancy/czas-dokad.ts'), 'utf8');
    const kierunki = [...zrodlo.matchAll(/'((?:do|na|za|w) [^']+)'/g)].map((m) => m[1]);
    expect(kierunki.length).toBeGreaterThan(15);
    for (const k of [...kierunki, 'do krewnych']) expect(SKAD[k], k).toMatch(/^(z|ze|zza|od) /);
  });
});

// ---------------------------------------------------------------- szablony

describe('szablony: zestaw i reguły tekstu', () => {
  const pelny: KontekstSzablonu = {
    glowna: zFormami(osoba('a', 'Marek', 'M', 1980)),
    powiazana: zFormami(osoba('b', 'Halina', 'K', 1952)),
    krewny: KREWNI.matka,
    rodzina: 'Kowalscy',
    rok: 2031,
    wiek: 40,
    dokad: 'do Niemiec',
    skad: 'z Niemiec',
    miejsce: 'Żabka',
    zawod: 'księgowy',
    fach: 'zielarz',
  };

  it('co najmniej 40 szablonów zdarzeń, po kilka na każdy typ wpisu, i co najmniej 10 o dawnych czasach', () => {
    const zdarzen = SZABLONY.filter((s) => (RODZAJE_ZDARZEN as readonly string[]).includes(s.rodzaj));
    expect(zdarzen.length).toBeGreaterThanOrEqual(40);
    for (const typ of RODZAJE_ZDARZEN) {
      expect(SZABLONY.filter((s) => s.rodzaj === typ).length, typ).toBeGreaterThanOrEqual(3);
    }
    expect(SZABLONY.filter((s) => s.rodzaj === 'dawne').length).toBeGreaterThanOrEqual(10);
    // satyra na dawne czasy z briefu: hulajnogi na minuty, paczkomaty, lodówki na abonament, sklep z mapy
    const dawne = SZABLONY.filter((s) => s.rodzaj === 'dawne').map((s) => s.tekst);
    for (const motyw of [/hulajnog/, /paczkomat/, /lodówk/, /na mapie/i])
      expect(dawne.some((t) => motyw.test(t))).toBe(true);
  });

  it('identyfikatory są niepowtarzalne, a każdy szablon wypełnia się bez nawiasów klamrowych', () => {
    expect(new Set(SZABLONY.map((s) => s.id)).size).toBe(SZABLONY.length);
    for (const s of SZABLONY) {
      const kontekst = s.kim?.includes('rodzice') ? { ...pelny, krewny: KREWNI.rodzice } : pelny;
      const tekst = wypelnij(s.tekst, kontekst);
      expect(tekst, s.id).not.toMatch(/[{}]/);
    }
  });

  it('jedno zdanie, kropka na końcu, bez pauz, bez numerów mieszkań i pięter, bez zwracania się do gracza', () => {
    for (const s of SZABLONY) {
      expect(s.tekst, s.id).toMatch(/\.$/);
      expect(s.tekst.slice(0, -1), s.id).not.toMatch(/[.!?]\s/);
      expect(s.tekst, s.id).not.toMatch(PAUZY);
      expect(s.tekst, s.id).not.toMatch(RODO);
      expect(s.tekst, s.id).not.toMatch(TY);
    }
  });

  it('oś czasu z lore: bakteria w szablonach z rokiem dopiero od 2029, dawne czasy przed 2026', () => {
    for (const s of SZABLONY.filter((x) => slotySzablonu(x.tekst).includes('rok'))) {
      if (/bakteri|szczep|zjada|zjadł|zjadało|wyszło na jaw/.test(s.tekst)) {
        expect(s.od ?? 0, s.id).toBeGreaterThanOrEqual(2029);
      }
      if (/jeszcze w dawnych czasach/.test(s.tekst)) expect(s.do ?? 9999, s.id).toBeLessThanOrEqual(2025);
      if (/przed upadkiem|złodziei złomu/.test(s.tekst)) expect(s.do ?? 9999, s.id).toBeLessThanOrEqual(2030);
    }
  });

  it('szablony z krewnym mają listę pokrewieństw, a szablony dla obojga rodziców nie mają form jednej osoby', () => {
    for (const s of SZABLONY) {
      const sloty = slotySzablonu(s.tekst);
      if (sloty.some((x) => x.startsWith('k:') || x.startsWith('pg:'))) expect(s.kim, s.id).toBeDefined();
      if (s.kim?.includes('rodzice')) {
        expect(s.kim, s.id).toEqual(['rodzice']);
        expect(
          sloty.some((x) => x.startsWith('k:') || x.startsWith('pg:') || x.startsWith('p:')),
          s.id,
        ).toBe(false);
      }
    }
  });

  it('KREWNI: siedem przypadków każdego pokrewieństwa', () => {
    for (const [kim, formy] of Object.entries(KREWNI)) {
      expect(Object.keys(formy).sort(), kim).toEqual(['bier', 'cel', 'dop', 'mian', 'msc', 'narz', 'wol']);
    }
    expect(KREWNI.ojciec.narz).toBe('ojcem');
    expect(KREWNI.babcia.msc).toBe('babci');
  });
});

// ---------------------------------------------------------------- historie na demach

describe('historie gospodarstw na trzech demach', () => {
  it('każde gospodarstwo ma 2-3 zdania, z wielkiej litery i z kropką', () => {
    for (const d of DEMA) {
      const lista = wszystkieHistorie(d);
      expect(lista.length, d.nazwa).toBeGreaterThan(20);
      for (const { h, zdania } of lista) {
        expect(zdania.length, `${d.nazwa} ${h.id}`).toBeGreaterThanOrEqual(2);
        expect(zdania.length, `${d.nazwa} ${h.id}`).toBeLessThanOrEqual(3);
        for (const z of zdania) {
          expect(z, h.id).toMatch(/^\p{Lu}/u);
          expect(z, h.id).toMatch(/\.$/);
        }
      }
    }
  });

  it('żadne zdanie nie ma nawiasów klamrowych, numeru mieszkania, piętra ani pauzy', () => {
    for (const d of DEMA) {
      for (const { h, zdania } of wszystkieHistorie(d)) {
        for (const z of zdania) {
          expect(z, h.id).not.toMatch(/[{}]/);
          expect(z, h.id).not.toMatch(RODO);
          expect(z, h.id).not.toContain('—');
          expect(z, h.id).not.toContain(' – ');
        }
      }
    }
  });

  it('dwa wywołania dają te same historie', () => {
    for (const d of DEMA) {
      const drugi = generujObszar(d.geo, d.g, kraj, d.nazwy);
      expect(drugi.budynki.map((w) => w.gospodarstwa.map((h) => h.historia))).toEqual(
        d.osiedle.budynki.map((w) => w.gospodarstwa.map((h) => h.historia)),
      );
    }
  });

  it('historiaGospodarstwa z ziarnem losDla("historie", klucz budynku, id gospodarstwa) to pierwsze gospodarstwo budynku', () => {
    for (const w of PRZYMORZE.osiedle.budynki.slice(0, 3)) {
      const h = w.gospodarstwa[0];
      const r = losDla('historie', w.budynek.klucz, h.id);
      expect(historiaGospodarstwa(h, w, PRZYMORZE.kronika, odmiana, r)).toEqual(h.historia);
    }
  });

  it('gospodarstwo, które było tu przed 2029, ma zdanie z kroniki albo z dawnych czasów', () => {
    for (const d of DEMA) {
      let sprawdzone = 0;
      for (const w of d.osiedle.budynki) {
        const pierwszyWpis = new Map<string, Wpis>();
        for (const e of w.dziennik) if (!pierwszyWpis.has(e.kto)) pierwszyWpis.set(e.kto, e);
        const wg = new Map(w.osoby.map((o) => [o.id, o]));
        for (const h of w.gospodarstwa) {
          const bylo = h.czlonkowie.some((id) => {
            const o = wg.get(id)!;
            const e = pierwszyWpis.get(id);
            return o.rocznik < 2029 && !(e && e.typ === 'wprowadzka' && e.rok >= 2029);
          });
          if (!bylo) continue;
          sprawdzone++;
          const r = losDla('historie', w.budynek.klucz, h.id);
          const zdania = zdaniaGospodarstwa(h, w, d.kronika, odmiana, r);
          expect(
            zdania.some((z) => z.rodzaj === 'kronika' || z.rodzaj === 'miejsce' || z.rodzaj === 'dawne'),
            `${d.nazwa} ${h.id}: ${zdania.map((z) => z.tekst).join(' ')}`,
          ).toBe(true);
        }
      }
      expect(sprawdzone, d.nazwa).toBeGreaterThan(20);
    }
  });

  it('zdarzenia idą według wagi: powrotOpieka, owdowienie, przydział, emigracja, powrót, reszta', () => {
    expect(WAGI_ZDARZEN.powrotOpieka).toBeGreaterThan(WAGI_ZDARZEN.owdowienie);
    expect(WAGI_ZDARZEN.owdowienie).toBeGreaterThan(WAGI_ZDARZEN.przydzial);
    expect(WAGI_ZDARZEN.przydzial).toBeGreaterThan(WAGI_ZDARZEN.emigracja);
    expect(WAGI_ZDARZEN.emigracja).toBeGreaterThan(WAGI_ZDARZEN.powrot);
    for (const t of ['urodzenie', 'zgon', 'wyprowadzka', 'zwiazek', 'wprowadzka'] as const) {
      expect(WAGI_ZDARZEN.powrot).toBeGreaterThan(WAGI_ZDARZEN[t]);
    }
    let zOpieka = 0;
    for (const d of DEMA) {
      for (const w of d.osiedle.budynki) {
        for (const h of w.gospodarstwa) {
          const fakty = faktyGospodarstwa(h, w);
          // typy faktów od najważniejszego (waga typu)
          const typy = [...new Set([...fakty].sort((a, b) => b.waga - a.waga).map((f) => f.typ))];
          const r = losDla('historie', w.budynek.klucz, h.id);
          const zdarzenia = zdaniaGospodarstwa(h, w, d.kronika, odmiana, r)
            .map((z) => z.rodzaj)
            .filter((x) => (RODZAJE_ZDARZEN as readonly string[]).includes(x)) as (keyof typeof WAGI_ZDARZEN)[];
          // zdania o zdarzeniach to zawsze najważniejsze typy: żaden pominięty typ nie waży więcej niż wybrany
          // (remis wag rozstrzyga losowanie)
          const pominiete = typy.filter((t) => !zdarzenia.includes(t));
          if (zdarzenia.length && pominiete.length) {
            expect(Math.min(...zdarzenia.map((t) => WAGI_ZDARZEN[t])), `${d.nazwa} ${h.id}`).toBeGreaterThanOrEqual(
              Math.max(...pominiete.map((t) => WAGI_ZDARZEN[t])),
            );
          }
          expect(new Set(zdarzenia).size, `${d.nazwa} ${h.id}`).toBe(zdarzenia.length);
          expect(zdarzenia.length, `${d.nazwa} ${h.id}`).toBeGreaterThanOrEqual(Math.min(2, typy.length));
          if (typy[0] === 'powrotOpieka') {
            zOpieka++;
            expect(zdarzenia, h.id).toContain('powrotOpieka');
          }
        }
      }
    }
    expect(zOpieka).toBeGreaterThan(10);
  });

  it('przydział nie dominuje: mniej niż połowa historii Przymorza mówi o przydziale', () => {
    let przydzial = 0;
    let wszystkie = 0;
    for (const w of PRZYMORZE.osiedle.budynki) {
      for (const h of w.gospodarstwa) {
        wszystkie++;
        const r = losDla('historie', w.budynek.klucz, h.id);
        if (zdaniaGospodarstwa(h, w, PRZYMORZE.kronika, odmiana, r).some((z) => z.rodzaj === 'przydzial')) przydzial++;
      }
    }
    expect(przydzial).toBeGreaterThan(0);
    expect(przydzial / wszystkie).toBeLessThan(0.5);
  });

  it('w gospodarstwie szablon się nie powtarza, a w budynku szablony się rozkładają', () => {
    for (const d of DEMA) {
      for (const w of d.osiedle.budynki) {
        const uzycia = new Map<string, number>();
        const uzyte = new Map<string, number>();
        for (const h of w.gospodarstwa) {
          const r = losDla('historie', w.budynek.klucz, h.id);
          const zdania = zdaniaGospodarstwa(h, w, d.kronika, odmiana, r, uzyte);
          const id = zdania.map((z) => z.szablon);
          expect(new Set(id).size, h.id).toBe(id.length);
          for (const x of id) uzycia.set(x, (uzycia.get(x) ?? 0) + 1);
        }
        const zdan = [...uzycia.values()].reduce((a, b) => a + b, 0);
        if (zdan < 60) continue;
        // przy wielu gospodarstwach w budynku szablonów jest wiele, a żaden nie bierze więcej niż 10% zdań
        expect(uzycia.size, `${d.nazwa} ${w.budynek.klucz}`).toBeGreaterThan(40);
        expect(Math.max(...uzycia.values()) / zdan, `${d.nazwa} ${w.budynek.klucz}`).toBeLessThan(0.1);
      }
    }
  });

  it('miejsca w historiach to tylko miejsca z kroniki osiedla (RODO, R45)', () => {
    for (const d of DEMA) {
      const miejsca = d.kronika.flatMap((k) => (k.miejsce ? [k.miejsce] : []));
      expect(miejsca.length, d.nazwa).toBeGreaterThan(0);
      let zMiejscem = 0;
      for (const w of d.osiedle.budynki) {
        for (const h of w.gospodarstwa) {
          const r = losDla('historie', w.budynek.klucz, h.id);
          for (const z of zdaniaGospodarstwa(h, w, d.kronika, odmiana, r)) {
            const szablon = SZABLONY.find((s) => s.id === z.szablon)!;
            if (!slotySzablonu(szablon.tekst).includes('miejsce')) {
              expect(z.tekst, z.szablon).not.toMatch(/\(/);
              continue;
            }
            zMiejscem++;
            expect(
              miejsca.some((m) => z.tekst.includes(m)),
              z.tekst,
            ).toBe(true);
          }
        }
      }
      expect(zMiejscem, d.nazwa).toBeGreaterThan(5);
    }
  });

  it('kronika demo: każde nazwane miejsce ma kategorię, a wpisy o kablach mają temat', () => {
    for (const d of DEMA) {
      const budynki = budynkiZGeo(d.geo, d.g, kraj);
      for (let i = 0; i < 40; i++) {
        for (const wpis of kronika(d.geo, budynki, zbiorImion(imiona), `ziarno-${i}`)) {
          if (wpis.miejsce && wpis.tekst.includes(`(${wpis.miejsce})`)) {
            expect(kategoriaWpisu(wpis), wpis.tekst).toBeDefined();
          }
          if (/kabl|prąd|sieć/i.test(wpis.tekst) && !wpis.miejsce && wpis.rok < 2051) {
            expect(tematWpisu(wpis), wpis.tekst).toBeDefined();
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------- reguły na zmyślonym budynku

describe('historie: reguły na zmyślonym budynku', () => {
  it('trzy jednakowe wdowy dostają trzy różne zdania o owdowieniu', () => {
    const wdowy = [wdowa(0, 'Halina', 2038), wdowa(1, 'Halina', 2038), wdowa(2, 'Halina', 2038)];
    const w = budynek(
      wdowy.flatMap((x) => x.osoby),
      wdowy.map((x) => x.h),
      wdowy.flatMap((x) => x.wpisy),
    );
    const uzyte = new Map<string, number>();
    const zdania = wdowy.map((x) =>
      zdaniaGospodarstwa(x.h, w, KRONIKA_TESTOWA, odmiana, losDla('historie', 'test', x.h.id), uzyte).find(
        (z) => z.rodzaj === 'owdowienie',
      ),
    );
    expect(zdania.every((z) => z !== undefined)).toBe(true);
    expect(new Set(zdania.map((z) => z!.szablon)).size).toBe(3);
  });

  it('imię z niepewną odmianą stoi tylko w mianowniku', () => {
    let sprawdzone = 0;
    for (let n = 0; n < 30; n++) {
      const x = wdowa(n, 'Ewa2', 2021 + (n % 29));
      const w = budynek(x.osoby, [x.h], x.wpisy);
      for (const z of zdaniaGospodarstwa(x.h, w, KRONIKA_TESTOWA, odmiana, losDla('historie', 'niepewne', n))) {
        const s = SZABLONY.find((y) => y.id === z.szablon)!;
        for (const slot of slotySzablonu(s.tekst)) {
          if (slot.startsWith('o:')) expect(slot, s.id).toBe('o:mian');
        }
        sprawdzone++;
        expect(z.tekst).toMatch(/\.$/);
      }
    }
    expect(sprawdzone).toBeGreaterThan(30);
  });

  it('budynek, w którym żadne imię nie ma pewnej odmiany: imiona tylko w mianowniku, a historie dalej mają 2-3 zdania', () => {
    const w = structuredClone(PRZYMORZE.osiedle.budynki[0]);
    for (const o of w.osoby) o.imie = `${o.imie}2`;
    const uzyte = new Map<string, number>();
    for (const h of w.gospodarstwa) {
      const zdania = zdaniaGospodarstwa(h, w, PRZYMORZE.kronika, odmiana, losDla('historie', 'niepewne', h.id), uzyte);
      expect(zdania.length, h.id).toBeGreaterThanOrEqual(2);
      expect(zdania.length, h.id).toBeLessThanOrEqual(3);
      for (const z of zdania) {
        const s = SZABLONY.find((y) => y.id === z.szablon)!;
        for (const slot of slotySzablonu(s.tekst)) {
          if (slot.startsWith('o:') || slot.startsWith('p:')) expect(slot.slice(2), s.id).toBe('mian');
        }
      }
    }
  });

  it('krewny z tym samym pokrewieństwem co inny krewny (dwóch synów za granicą) jest w zdaniu z imienia', () => {
    const matka = osoba('test/b1/o0', 'Halina', 'K', 1950);
    const synowie = [
      osoba('test/b1/o1', 'Piotr', 'M', 1975, { matka: matka.id, stan: 'wyjechal', dokad: 'do Niemiec' }),
      osoba('test/b1/o2', 'Paweł', 'M', 1978, { matka: matka.id, stan: 'wyjechal', dokad: 'do Holandii' }),
    ];
    const h = gosp('test/b1/g0', [matka.id]);
    const w = budynek(
      [matka, ...synowie],
      [h],
      [
        { rok: 2001, typ: 'emigracja', kto: synowie[0].id, dokad: 'do Niemiec' },
        { rok: 2004, typ: 'emigracja', kto: synowie[1].id, dokad: 'do Holandii' },
      ],
    );
    for (let n = 0; n < 20; n++) {
      const zdania = zdaniaGospodarstwa(h, w, KRONIKA_TESTOWA, odmiana, losDla('historie', 'synowie', n));
      const o = zdania.find((z) => z.rodzaj === 'emigracja');
      expect(o, zdania.map((z) => z.tekst).join(' ')).toBeDefined();
      // imię w mianowniku albo w dopełniaczu („pocztówka od syna Pawła”)
      expect(o!.tekst).toMatch(/Piotr|Paweł|Pawła/);
    }
  });

  it('wdowa w historii: owdowiała w roku zgonu męża, z poprawną odmianą', () => {
    const x = wdowa(0, 'Halina', 2038);
    const w = budynek(x.osoby, [x.h], x.wpisy);
    const historia = historiaGospodarstwa(x.h, w, KRONIKA_TESTOWA, odmiana, losDla('historie', 'a'));
    const o = historia.find((z) => z.includes('2038'));
    expect(o).toBeDefined();
    expect(o).not.toMatch(/Halina (zmarł|owdowiał)(?!\p{L})/u);
    expect(historia.join(' ')).not.toMatch(/\bz Halina\b|\bdo Halina\b|\bu Halina\b/);
  });

  it('nie zmienia wejścia: budynku, gospodarstwa, kroniki ani tabel odmiany', () => {
    const w = PRZYMORZE.osiedle.budynki[0];
    const kopia = structuredClone(w);
    const kronikaKopia = structuredClone(PRZYMORZE.kronika);
    const formy = structuredClone(odmiana.tabela.imiona.Halina);
    for (const h of w.gospodarstwa.slice(0, 20)) {
      historiaGospodarstwa(h, w, PRZYMORZE.kronika, odmiana, losDla('historie', 'x', h.id));
    }
    expect(w).toEqual(kopia);
    expect(PRZYMORZE.kronika).toEqual(kronikaKopia);
    expect(odmiana.tabela.imiona.Halina).toEqual(formy);
  });

  it('pokrewieństwo: matka, ojciec, dziadkowie, dzieci, wnuki, rodzeństwo i małżonkowie', () => {
    const babcia = osoba('p/o0', 'Zofia', 'K', 1940);
    const matka = osoba('p/o1', 'Halina', 'K', 1965, { matka: babcia.id, partner: 'p/o2' });
    const ojciec = osoba('p/o2', 'Marek', 'M', 1963, { partner: matka.id });
    const ja = osoba('p/o3', 'Ola', 'K', 1990, { matka: matka.id, ojciec: ojciec.id });
    const brat = osoba('p/o4', 'Piotr', 'M', 1992, { matka: matka.id, ojciec: ojciec.id });
    const corka = osoba('p/o5', 'Zuzanna', 'K', 2020, { matka: ja.id });
    const osoby = [babcia, matka, ojciec, ja, brat, corka];
    const wg = new Map(osoby.map((o) => [o.id, o]));
    expect(pokrewienstwo(ja, matka, wg)).toBe('matka');
    expect(pokrewienstwo(ja, ojciec, wg)).toBe('ojciec');
    expect(pokrewienstwo(ja, babcia, wg)).toBe('babcia');
    expect(pokrewienstwo(ja, brat, wg)).toBe('brat');
    expect(pokrewienstwo(ja, corka, wg)).toBe('corka');
    expect(pokrewienstwo(babcia, ja, wg)).toBe('wnuczka');
    expect(pokrewienstwo(matka, ojciec, wg)).toBe('maz');
    expect(pokrewienstwo(ojciec, matka, wg)).toBe('zona');
    expect(pokrewienstwo(corka, brat, wg)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- generator

describe('generuj: historie w generatorze (R49)', () => {
  it('bez odmiany historii nie ma, z odmianą każde gospodarstwo ma historię', () => {
    const bez = generujObszar(demo('przymorze'), gdansk, kraj, { imiona, nazwiska: PRZYMORZE.nazwy.nazwiska });
    for (const w of bez.budynki) for (const h of w.gospodarstwa) expect(h.historia).toBeUndefined();
    for (const w of generujObszar(demo('przymorze'), gdansk, kraj).budynki) {
      for (const h of w.gospodarstwa) expect(h.historia).toBeUndefined();
    }
    for (const w of PRZYMORZE.osiedle.budynki) for (const h of w.gospodarstwa) expect(h.historia).toBeDefined();
  });

  it('generujBudynek z odmianą, ale bez kroniki, nie pisze historii', () => {
    const b = budynkiObszaru(PRZYMORZE.geo, gdansk, kraj)[0];
    for (const h of generujBudynek(b, gdansk, kraj, PRZYMORZE.nazwy).gospodarstwa) expect(h.historia).toBeUndefined();
  });

  it('budynek osobno z tym samym zestawem (z kroniką obszaru) to ten sam budynek co w obszarze', () => {
    const zestaw: Nazwy = { ...PRZYMORZE.nazwy, kronika: PRZYMORZE.kronika };
    const budynki = budynkiObszaru(PRZYMORZE.geo, gdansk, kraj);
    for (const i of [0, Math.floor(budynki.length / 2), budynki.length - 1]) {
      expect(generujBudynek(budynki[i], gdansk, kraj, zestaw)).toEqual(PRZYMORZE.osiedle.budynki[i]);
    }
    // obszar z kroniką podaną wprost daje to samo co obszar, który liczy ją sam
    expect(generujObszar(PRZYMORZE.geo, gdansk, kraj, zestaw)).toEqual(PRZYMORZE.osiedle);
  });

  it('budynkiObszaru to budynki z obszaru gry, w kolejności generujObszar', () => {
    for (const d of DEMA) {
      expect(budynkiObszaru(d.geo, d.g, kraj).map((b) => b.klucz)).toEqual(
        d.osiedle.budynki.map((w) => w.budynek.klucz),
      );
    }
  });

  it('kronikaObszaru: ziarno to rejon budynku najbliższego środkowi mapy, kronika liczy się z budynków obszaru', () => {
    for (const d of DEMA) {
      const budynki = budynkiObszaru(d.geo, d.g, kraj);
      const kx = 111320 * Math.cos((d.geo.c[0] * Math.PI) / 180);
      const odl = (b: Budynek): number => Math.hypot((b.lon - d.geo.c[1]) * kx, (d.geo.c[0] - b.lat) * 110574);
      const najblizszy = [...budynki].sort((a, b) => odl(a) - odl(b))[0];
      expect(d.kronika).toEqual(kronika(d.geo, budynki, zbiorImion(imiona), najblizszy.rejon));
    }
  });

  it('cały obszar dema z historiami w Node poniżej 1500 ms (cel 200 ms, mediana z 3)', () => {
    for (const d of DEMA) {
      const czasy: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        generujObszar(d.geo, d.g, kraj, d.nazwy);
        czasy.push(performance.now() - t0);
      }
      czasy.sort((a, b) => a - b);
      expect(czasy[1], d.nazwa).toBeLessThan(1500);
    }
  });
});

describe('src/mieszkancy/szablony.ts i historie.ts: reguły modułu', () => {
  for (const nazwa of ['szablony.ts', 'historie.ts']) {
    const plik = path.join(KORZEN, 'src/mieszkancy', nazwa);
    const zrodlo = fs.existsSync(plik)
      ? fs
          .readFileSync(plik, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
      : '';

    it(`${nazwa}: bez trygonometrii, potęg, logarytmów, Math.random i dat`, () => {
      expect(zrodlo.length).toBeGreaterThan(100);
      expect(zrodlo).not.toMatch(
        /Math\.(sin|cos|exp|log|pow|hypot|tan|atan|atan2|asin|acos|cbrt|expm1|log1p|random)\b/,
      );
      expect(zrodlo).not.toMatch(/\*\*/);
      expect(zrodlo).not.toMatch(/\bDate\b/);
    });

    it(`${nazwa}: nie importuje z sim, ui, render, gov ani z Node`, () => {
      expect(zrodlo).not.toMatch(/from '\.\.\/(sim|ui|render|gov)\//);
      expect(zrodlo).not.toMatch(/from 'node:/);
    });
  }
});
