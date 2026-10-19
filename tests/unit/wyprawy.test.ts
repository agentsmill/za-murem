/* Cel wyprawy i stan miasta w zarządzie (src/gov/wyprawy.ts, src/content/miejsca.en.ts): przeliczenie miejsca z OSM
   i celu z TARGETS na `Cel`, ryzyko, czas drogi i powrotu, udźwig, zapas startowy z klucza i włączenie stanu miasta.
   Czyste funkcje, bez symulacji i bez sieci. */

import { describe, expect, it } from 'vitest';
import { POICAT } from '../../src/content/data.ts';
import { KAT_EN } from '../../src/content/miejsca.en.ts';
import { hashString, mulberry } from '../../src/core/rng.ts';
import { TARGETS, targetNameTx } from '../../src/gov/tresc.ts';
import type { GovPlace, GovState } from '../../src/gov/typy.ts';
import { atHour } from '../../src/gov/wspolne.ts';
import {
  BLISKO_DO_M,
  type Cel,
  celZMiejsca,
  celZTarget,
  czasWyprawyMin,
  LUP_03,
  MAX_DROGA_M,
  nazwaKategorii,
  ograniczLup,
  powrotMin,
  ryzykoSlowem,
  SKALA_LUPU,
  UDZWIG_NA_OSOBE,
  wlaczMiasto,
  zapasStartowy,
  zostaloZMiejsca,
} from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import type { Miejsce } from '../../src/world/miasto.ts';

const miejsce = (kat: string, odl: number, nazwa = '', klucz = 'poi:1:2'): Miejsce => ({
  klucz,
  kat,
  x: odl,
  y: 0,
  odl,
  nazwa,
});

const BLOK: GovPlace = {
  kind: 'blok',
  blocks: 4,
  houses: 0,
  near: 'bloki',
  shop: 120,
  garages: 60,
  clinic: null,
  tower: null,
};
const DOM: GovPlace = {
  kind: 'dom',
  blocks: 0,
  houses: 6,
  near: 'domy',
  shop: null,
  garages: null,
  clinic: null,
  tower: null,
};

describe('stałe', () => {
  it('mają wartości z projektu', () => {
    expect(SKALA_LUPU).toBe(0.5);
    expect(MAX_DROGA_M).toBe(5000);
    expect(UDZWIG_NA_OSOBE).toBe(6);
    expect(BLISKO_DO_M).toBe(300);
    expect(LUP_03).toEqual({ jedzenie: 'supplies', opal: 'wood', leki: 'meds', zlom: 'scrap', czesci: 'parts' });
  });
});

describe('celZMiejsca', () => {
  it('sklep spożywczy 450 m: ryzyko 0,38, łup z połowy POICAT, daleko, powrót o świcie', () => {
    const c = celZMiejsca(miejsce('spozywczy', 450));
    expect(c.ryzyko).toBe(0.38);
    expect(c.lup).toEqual({ supplies: [3, 7] });
    expect(c.range).toBe('daleko');
    expect(c.powrot).toBe(5);
  });

  it('apteka 100 m: ryzyko 0,33, łup w lekach, blisko, powrót o 1:00', () => {
    const c = celZMiejsca(miejsce('apteka', 100));
    expect(c.ryzyko).toBe(0.33);
    expect(c.lup).toEqual({ meds: [1, 3] });
    expect(c.range).toBe('blisko');
    expect(c.powrot).toBe(1);
  });

  it('granica blisko/daleko: 300 m to jeszcze blisko, powyżej daleko', () => {
    expect(celZMiejsca(miejsce('sklep', 300)).range).toBe('blisko');
    expect(celZMiejsca(miejsce('sklep', 300.5)).range).toBe('daleko');
  });

  it('nieznana kategoria bierze POICAT.sklep', () => {
    const c = celZMiejsca(miejsce('cos-nowego', 450));
    const s = celZMiejsca(miejsce('sklep', 450));
    expect(c.ryzyko).toBe(s.ryzyko);
    expect(c.lup).toEqual(s.lup);
    expect(c.lup).toEqual({ scrap: [1, 2], supplies: [0, 1], parts: [0, 1] });
  });

  it('kategorie z prototypu obiektu i mieszkania (cel z 0.3, nie punkt z OSM) też są nieznane', () => {
    for (const kat of ['constructor', 'toString', 'mieszkania']) {
      const c = celZMiejsca(miejsce(kat, 0));
      const s = celZMiejsca(miejsce('sklep', 0));
      expect(c.lup, kat).toEqual(s.lup);
      expect(c.ryzyko, kat).toBe(s.ryzyko);
      expect(c.nazwa, kat).toEqual(s.nazwa);
    }
  });

  it('przepisuje klucz, kategorię i położenie, zapas liczy z klucza i kategorii', () => {
    const m = { ...miejsce('bank', 640, '', 'poi:77:99'), x: -400, y: 500 };
    const c = celZMiejsca(m);
    expect(c.klucz).toBe('poi:77:99');
    expect(c.kat).toBe('bank');
    expect([c.x, c.y, c.odl]).toEqual([-400, 500, 640]);
    expect(c.zapas).toBe(zapasStartowy('poi:77:99', 'bank'));
  });

  it('nie zostawia par [0, 0] i nie rusza POICAT', () => {
    const przed = JSON.stringify(POICAT);
    for (const kat of Object.keys(POICAT)) {
      const c = celZMiejsca(miejsce(kat, 100));
      for (const [a, b] of Object.values(c.lup)) expect(a + b).toBeGreaterThan(0);
    }
    expect(JSON.stringify(POICAT)).toBe(przed);
  });

  it('nazwa to kategoria, a z niepustą nazwą z filtra kategoria z nazwą w nawiasie, w obu językach', () => {
    expect(celZMiejsca(miejsce('budowlany', 450)).nazwa).toEqual({ pl: 'Sklep budowlany', en: KAT_EN.budowlany });
    expect(celZMiejsca(miejsce('budowlany', 450, 'Bricoman')).nazwa).toEqual({
      pl: 'Sklep budowlany (Bricoman)',
      en: `${KAT_EN.budowlany} (Bricoman)`,
    });
    // filtr oddał samą kategorię albo nic: bez powtórzenia
    expect(celZMiejsca(miejsce('budowlany', 450, 'Sklep budowlany')).nazwa.pl).toBe('Sklep budowlany');
    expect(celZMiejsca(miejsce('budowlany', 450, '  ')).nazwa.pl).toBe('Sklep budowlany');
  });
});

describe('celZTarget', () => {
  it('przepisuje cel z TARGETS: nazwa jak targetNameTx, zapas null, położenie zerowe', () => {
    for (const place of [BLOK, DOM]) {
      for (const t of TARGETS) {
        const c = celZTarget(t, place);
        expect(c.klucz).toBe(t.id);
        expect(c.nazwa).toEqual(targetNameTx(t, place));
        expect(c.kat).toBeNull();
        expect([c.x, c.y, c.odl]).toEqual([0, 0, 0]);
        expect(c.zapas).toBeNull();
        expect(c.range).toBe(t.range);
        expect(c.ryzyko).toBe(t.risk);
        expect(c.lup).toEqual(t.loot);
        expect(c.powrot).toBe(t.back);
      }
    }
  });

  it('nazwa zależy od miejsca (dom: sklep przy głównej drodze)', () => {
    const pawilon = TARGETS.find((t) => t.id === 'pawilon')!;
    expect(celZTarget(pawilon, BLOK).nazwa.pl).toBe('pawilon handlowy');
    expect(celZTarget(pawilon, DOM).nazwa.pl).toBe('sklep przy głównej drodze');
  });

  it('nie dzieli łupu z tablicą TARGETS', () => {
    const t = TARGETS[0];
    const c = celZTarget(t, BLOK);
    expect(c.lup).not.toBe(t.loot);
    for (const k of Object.keys(c.lup) as (keyof typeof c.lup)[]) expect(c.lup[k]).not.toBe(t.loot[k]);
  });
});

describe('czas wyprawy', () => {
  it('czasWyprawyMin: droga w obie strony razy 1,4 przy 3 km/h plus przeszukanie 60–180 min', () => {
    expect(czasWyprawyMin(450, 2)).toBe(145);
    expect(czasWyprawyMin(0, 3)).toBe(60);
    expect(czasWyprawyMin(5000, 1)).toBe(460);
  });

  it('im więcej osób, tym krótsze przeszukanie, ale nie poniżej godziny', () => {
    expect(czasWyprawyMin(0, 1)).toBe(180);
    expect(czasWyprawyMin(0, 2)).toBe(120);
    expect(czasWyprawyMin(0, 5)).toBe(60);
    expect(czasWyprawyMin(0, 0)).toBe(180);
  });

  it('powrotMin za dnia to wyjście plus czas', () => {
    expect(powrotMin(atHour(3, 15), 450, 2)).toBe(atHour(3, 15) + 145);
  });

  it('powrót po 20:00 przesuwa się na 6:00 następnego dnia', () => {
    expect(powrotMin(atHour(3, 19), 450, 2)).toBe(atHour(4, 6));
    // dokładnie 20:00 jeszcze nie jest „po”
    expect(powrotMin(atHour(3, 20) - 145, 450, 2)).toBe(atHour(3, 20));
    expect(powrotMin(atHour(3, 20) - 144, 450, 2)).toBe(atHour(4, 6));
  });

  it('wyjście wieczorem z długą drogą nie wraca przed końcem drogi', () => {
    // 23:00 + 460 min = 6:40 następnego dnia, później niż 6:00
    expect(powrotMin(atHour(3, 23), 5000, 1)).toBe(atHour(3, 23) + 460);
    // 19:00 + 460 min = 2:40 następnego dnia, wcześniej niż 6:00
    expect(powrotMin(atHour(3, 19), 5000, 1)).toBe(atHour(4, 6));
  });
});

describe('ograniczLup', () => {
  it('skaluje każdy rodzaj w dół przez Math.floor', () => {
    expect(ograniczLup({ wood: 6, supplies: 6, scrap: 0, parts: 0, meds: 0 }, 6)).toEqual({
      wood: 3,
      supplies: 3,
      scrap: 0,
      parts: 0,
      meds: 0,
    });
    expect(ograniczLup({ wood: 5, supplies: 4, scrap: 3, parts: 0, meds: 0 }, 6)).toEqual({
      wood: 2,
      supplies: 2,
      scrap: 1,
      parts: 0,
      meds: 0,
    });
  });

  it('przy pojemności co najmniej równej sumie nic nie zmienia', () => {
    const got = { wood: 2, supplies: 3, scrap: 1, parts: 0, meds: 0 };
    expect(ograniczLup(got, 6)).toEqual(got);
    expect(ograniczLup(got, 100)).toEqual(got);
  });

  it('nie schodzi poniżej zera i nie rusza wejścia', () => {
    const got = { wood: 1, supplies: 0, scrap: 0, parts: 0, meds: 0 };
    const out = ograniczLup(got, 0);
    expect(out).toEqual({ wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 });
    expect(got.wood).toBe(1);
    expect(ograniczLup(got, -3).wood).toBe(0);
    for (const v of Object.values(ograniczLup({ wood: 7, supplies: 1, scrap: 9, parts: 2, meds: 1 }, 3))) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('suma po ograniczeniu mieści się w pojemności', () => {
    const out = ograniczLup({ wood: 7, supplies: 1, scrap: 9, parts: 2, meds: 1 }, 5);
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5);
  });
});

describe('zapasStartowy', () => {
  it('ten sam wynik dla tego samego klucza i kategorii', () => {
    for (const k of ['poi:1:1', 'poi:140000:90000', 'poi:2:7']) {
      expect(zapasStartowy(k, 'spozywczy')).toBe(zapasStartowy(k, 'spozywczy'));
    }
  });

  it('na 200 kluczach: całkowity, w 0–60, są puste miejsca i większość ma zapas', () => {
    const zapasy = Array.from({ length: 200 }, (_, i) => zapasStartowy(`poi:${i}:${i}`, 'spozywczy'));
    for (const z of zapasy) {
      expect(Number.isInteger(z)).toBe(true);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(60);
    }
    expect(zapasy.some((z) => z === 0)).toBe(true);
    expect(zapasy.filter((z) => z > 0).length).toBeGreaterThanOrEqual(100);
  });

  it('wzór: pierwszy los poniżej 0,25 to pusto, inaczej suma średnich przedziałów razy 3–6', () => {
    for (let i = 0; i < 50; i++) {
      const klucz = `poi:${i * 37}:${i * 91}`;
      const r = mulberry(parseInt(hashString(klucz), 16));
      const oczekiwany = r() < 0.25 ? 0 : Math.min(60, Math.round(5 * (3 + 3 * r())));
      // sklep spożywczy: łup {supplies: [3, 7]}, średnia 5
      expect(zapasStartowy(klucz, 'spozywczy'), klucz).toBe(oczekiwany);
    }
  });

  it('zależy od łupu kategorii, a nieznana kategoria liczy się jak sklep', () => {
    expect(zapasStartowy('poi:5:5', 'cos-nowego')).toBe(zapasStartowy('poi:5:5', 'sklep'));
    const kosciol = Array.from({ length: 100 }, (_, i) => zapasStartowy(`poi:${i}:3`, 'kosciol'));
    const spozywczy = Array.from({ length: 100 }, (_, i) => zapasStartowy(`poi:${i}:3`, 'spozywczy'));
    const suma = (a: number[]) => a.reduce((x, y) => x + y, 0);
    expect(suma(kosciol)).toBeLessThan(suma(spozywczy));
  });
});

describe('ryzykoSlowem', () => {
  it('trzy progi w obu językach', () => {
    expect(ryzykoSlowem(0)).toEqual({ pl: 'spokojnie', en: 'calm' });
    expect(ryzykoSlowem(0.149).pl).toBe('spokojnie');
    expect(ryzykoSlowem(0.15)).toEqual({ pl: 'niepewnie', en: 'uncertain' });
    expect(ryzykoSlowem(0.299).pl).toBe('niepewnie');
    expect(ryzykoSlowem(0.3)).toEqual({ pl: 'groźnie', en: 'dangerous' });
    expect(ryzykoSlowem(0.9).pl).toBe('groźnie');
  });
});

describe('nazwaKategorii', () => {
  it('KAT_EN ma po jednej nazwie na klucz POICAT bez mieszkań', () => {
    const klucze = Object.keys(POICAT).filter((k) => k !== 'mieszkania');
    expect(Object.keys(KAT_EN).sort()).toEqual(klucze.sort());
  });

  it('polska nazwa z POICAT, angielska z KAT_EN, bez polskich liter po angielsku', () => {
    for (const k of Object.keys(KAT_EN)) {
      const n = nazwaKategorii(k);
      expect(n.pl).toBe(POICAT[k].name);
      expect(n.en).toBe(KAT_EN[k]);
      expect(n.en.length).toBeGreaterThan(0);
      expect(n.en).not.toMatch(/[ąćęłńóśźż]/i);
    }
  });

  it('nieznana kategoria to sklep', () => {
    expect(nazwaKategorii('cos-nowego')).toEqual(nazwaKategorii('sklep'));
    expect(nazwaKategorii('sklep').pl).toBe('Sklep');
  });
});

describe('stan miasta w zarządzie', () => {
  it('newGov bez opcji nie ma ani miasta, ani wypraw, a jego skrót jest taki jak przed zadaniem', () => {
    const st = newGov(1);
    expect(st.miasto).toBeUndefined();
    expect(st.wyprawy).toBeUndefined();
    expect('miasto' in st).toBe(false);
    expect('wyprawy' in st).toBe(false);
    expect(hashString(JSON.stringify(st))).toBe('d3a467a5');
    expect(hashString(JSON.stringify(newGov(7, 'zombie')))).toBe('52cb7152');
  });

  it('wlaczMiasto dokłada puste liczniki, jest idempotentne i nie rusza reszty stanu', () => {
    const st = newGov(1);
    const rng = { ...st.rng };
    wlaczMiasto(st);
    expect(st.miasto).toEqual({ zabrano: {}, wizyty: {}, ostatnia: {} });
    expect(st.rng).toEqual(rng);

    const miasto = st.miasto!;
    miasto.zabrano['poi:1:2'] = 3;
    const przed = JSON.stringify(st);
    wlaczMiasto(st);
    expect(st.miasto).toBe(miasto);
    expect(JSON.stringify(st)).toBe(przed);
  });

  it('stan z miastem i wyprawą w drodze przechodzi przez JSON bez zmian', () => {
    const st = newGov(1);
    wlaczMiasto(st);
    const cel: Cel = celZMiejsca(miejsce('apteka', 450, 'Apteka Pod Lwem', 'poi:9:9'));
    st.miasto!.zabrano[cel.klucz] = 2;
    st.miasto!.wizyty[cel.klucz] = 1;
    st.miasto!.ostatnia[cel.klucz] = 4;
    st.wyprawy = [
      { id: 1, cel, ids: ['a', 'b'], wyjscie: atHour(4, 10), powrot: powrotMin(atHour(4, 10), cel.odl, 2) },
    ];
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
  });

  it('zostaloZMiejsca: zapas minus zabrane, nigdy poniżej zera, bez zapasu bez końca', () => {
    const st: GovState = newGov(1);
    const cel: Cel = { ...celZMiejsca(miejsce('apteka', 450)), zapas: 12 };
    // bez stanu miasta nic nie zabrano
    expect(zostaloZMiejsca(st, cel)).toBe(12);
    wlaczMiasto(st);
    expect(zostaloZMiejsca(st, cel)).toBe(12);
    st.miasto!.zabrano[cel.klucz] = 5;
    expect(zostaloZMiejsca(st, cel)).toBe(7);
    st.miasto!.zabrano[cel.klucz] = 12;
    expect(zostaloZMiejsca(st, cel)).toBe(0);
    st.miasto!.zabrano[cel.klucz] = 99;
    expect(zostaloZMiejsca(st, cel)).toBe(0);

    const staly = celZTarget(TARGETS[0], BLOK);
    expect(zostaloZMiejsca(st, staly)).toBe(Infinity);
    st.miasto!.zabrano[staly.klucz] = 1000;
    expect(zostaloZMiejsca(st, staly)).toBe(Infinity);
  });
});
