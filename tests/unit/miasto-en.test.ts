/* Mapa miasta i wyprawy po angielsku (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, słowniczek
   docs/SLOWNICZEK-EN.md): każdy napis nowych modułów (kategorie miejsc z src/content/miejsca.en.ts, wyprawy z
   src/gov/wyprawy.ts i src/gov/dzienne.ts z odmowami i kroniką, rozliczenie i karta nocy z miejscami, okno mapy
   miasta src/ui/miasto.ts, okno planu src/ui/wyprawa.ts, minimapa i przyciski z src/ui/jezyk.ts) ma angielską
   wersję bez polskich liter i bez polskich słówek, a po polsku zostaje jak było. Imiona i nazwy miejsc z OSM zostają
   polskie (słowniczek), więc testy podają je jako dozwolone. Słowa spoza słowniczka: „boards” to zarząd (deski to
   „planks”), „medicine” to „meds”, jedzenie to „food”, wyprawa to „run” albo „supply run”, nigdy „expedition”.
   Na końcu przegląd źródeł: każda para napisów `L('…', '…')` i `tx('…', '…')` w nowych modułach, także z gałęzi,
   których żaden scenariusz nie dotyka (np. komunikaty o wczytywaniu kafelków w oknie mapy). */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POICAT } from '../../src/content/data.ts';
import { KAT_EN } from '../../src/content/miejsca.en.ts';
import { type Lang, type Tx, tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { kiedyWraca, powodOdmowy, wyprawyTick, wyslijWyprawe } from '../../src/gov/dzienne.ts';
import { makeCard, rozliczWyprawe } from '../../src/gov/noc.ts';
import type { GovInput, GovPerson, GovState } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import {
  type Cel,
  celZMiejsca,
  MAX_DROGA_M,
  nazwaKategorii,
  ryzykoSlowem,
  wlaczMiasto,
} from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { STATYCZNE } from '../../src/ui/jezyk.ts';
import { kartaHtml, kartaMiejsca, mapaMiastaSheet } from '../../src/ui/miasto.ts';
import { planWyprawySheet } from '../../src/ui/wyprawa.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import { Atrapa } from './gov-atrapa.ts';
import { polskieSlowa } from './po-angielsku.ts';

beforeEach(() => ustawJezyk('en'));
afterEach(() => ustawJezyk('pl'));

const SEED = 7;

/** słowa spoza słowniczka (deski to „planks”, wyprawa to „run”, leki to „meds”); „the board” to zarząd, więc tylko liczba mnoga */
const ZAKAZANE = /\b(boards|walkers?|tenants?|medicine|firewood|rations?|expeditions?|missions?)\b/i;

/** nazwa własna miejsca z OSM zostaje po polsku */
const NAZWA = 'Pod Orłem';

const miejsce = (n: number, kat: string, odl: number, nazwa = ''): Miejsce => ({
  klucz: `poi:${n}:7`,
  kat,
  x: odl,
  y: 0,
  odl,
  nazwa,
});

/** miejsce z zapasem co najmniej `min` (pierwszy klucz, który go ma) */
function zZapasem(kat: string, odl: number, nazwa = '', min = 6): Miejsce {
  for (let n = 1; n < 500; n++) {
    const m = miejsce(n, kat, odl, nazwa);
    const z = celZMiejsca(m).zapas;
    if (z !== null && z >= min) return m;
  }
  throw new Error('żaden klucz nie daje zapasu');
}

/** miejsce puste od lat (zapas 0) */
function puste(kat: string, odl: number): Miejsce {
  for (let n = 1; n < 500; n++) {
    const m = miejsce(n, kat, odl);
    if (celZMiejsca(m).zapas === 0) return m;
  }
  throw new Error('żaden klucz nie daje pustego miejsca');
}

const wej = (day: number, hour: number, minute = 0, atr = new Atrapa(SEED)): GovInput => ({
  ...atr.input(),
  day,
  hour,
  minute,
  night: hour >= 22 || hour < 6,
});

function nowy(seed = SEED): GovState {
  const st = newGov(seed);
  wlaczMiasto(st);
  return st;
}

/** imiona z atrapy (zostają po polsku w angielskim tekście) */
const imiona = (i: GovInput): string[] => i.people.flatMap((p) => [p.name, p.first]);

/** angielska strona napisu: niepusta, bez polskich słów i bez słów spoza słowniczka; polska niepusta */
function sprawdz(t: Tx, dozwolone: readonly string[] = [], opis = ''): void {
  expect(t.pl.length, opis || t.en).toBeGreaterThan(1);
  expect(t.en.length, opis || t.pl).toBeGreaterThan(1);
  expect(polskieSlowa(t.en, dozwolone), t.en).toEqual([]);
  expect(t.en, t.en).not.toMatch(ZAKAZANE);
}

// ---------------------------------------------------------------- kategorie

describe('kategorie miejsc', () => {
  const klucze = Object.keys(POICAT).filter((k) => k !== 'mieszkania');

  it('KAT_EN ma dokładnie klucze POICAT bez „mieszkania”', () => {
    expect(Object.keys(KAT_EN).sort()).toEqual(klucze.sort());
  });

  it('każda kategoria ma polską nazwę z POICAT i angielską bez polskich liter i słów', () => {
    for (const k of klucze) {
      const t = nazwaKategorii(k);
      expect(t.pl, k).toBe(POICAT[k].name);
      sprawdz(t, [], k);
      expect(t.en).toBe(KAT_EN[k]);
    }
  });

  it('słowa ze słowniczka: przychodnia to clinic, apteka pharmacy, garaże garages, hala warehouse', () => {
    expect(KAT_EN.przychodnia).toMatch(/clinic/i);
    expect(KAT_EN.apteka).toMatch(/pharmacy/i);
    expect(KAT_EN.garaz).toMatch(/garages/i);
    expect(KAT_EN.hala).toMatch(/warehouse/i);
  });

  it('nieznana kategoria i „mieszkania” liczą się jak sklep, także po angielsku', () => {
    expect(nazwaKategorii('mieszkania')).toEqual(nazwaKategorii('sklep'));
    expect(nazwaKategorii('constructor')).toEqual(nazwaKategorii('sklep'));
    expect(nazwaKategorii('sklep').en).toBe('Shop');
  });

  it('nazwa celu z własną nazwą miejsca: kategoria z nazwą w nawiasie, nazwa zostaje po polsku', () => {
    const c = celZMiejsca(miejsce(1, 'apteka', 250, NAZWA));
    expect(c.nazwa.pl).toBe(`Apteka (${NAZWA})`);
    expect(c.nazwa.en).toBe(`Pharmacy (${NAZWA})`);
    sprawdz(c.nazwa, [NAZWA]);
  });
});

describe('ryzyko słowem', () => {
  it('trzy stopnie po angielsku', () => {
    expect([0, 0.2, 0.5].map((r) => ryzykoSlowem(r).en)).toEqual(['calm', 'uncertain', 'dangerous']);
    expect([0, 0.2, 0.5].map((r) => ryzykoSlowem(r).pl)).toEqual(['spokojnie', 'niepewnie', 'groźnie']);
  });
});

// ---------------------------------------------------------------- zarząd: odmowy, kronika, rozliczenie

describe('wyprawa dzienna po angielsku', () => {
  /** każdy powód odmowy z `powodOdmowy`, w tym te zależne od osoby, w obu rodzajach */
  function powody(): { t: Tx; i: GovInput }[] {
    const m = zZapasem('apteka', 400);
    const c = celZMiejsca(m);
    const atr = new Atrapa(SEED);
    const out: { t: Tx; i: GovInput }[] = [];
    const dodaj = (t: Tx | null, i: GovInput) => {
      expect(t).not.toBeNull();
      out.push({ t: t!, i });
    };
    let i = wej(2, 10, 0, atr);
    dodaj(powodOdmowy(newGov(SEED), i, c), i);
    dodaj(powodOdmowy(nowy(), wej(2, 21, 0, atr), c), i);
    dodaj(powodOdmowy(nowy(), wej(2, 5, 0, atr), c), i);
    dodaj(powodOdmowy(nowy(), i, { ...c, odl: MAX_DROGA_M + 1 }), i);
    const wybrane = nowy();
    wybrane.miasto!.zabrano[c.klucz] = c.zapas!;
    dodaj(powodOdmowy(wybrane, i, c), i);
    dodaj(powodOdmowy(nowy(), i, c, []), i);
    dodaj(powodOdmowy(nowy(), i, c, ['nie-ma-takiej']), i);
    // osoby: poza mapą, w innej wyprawie, ugryziona i ugryziony, bez sił
    const [p0, p1, p2, p3, p4] = i.people;
    i = { ...i, people: i.people.map((p) => ({ ...p })) };
    const dom = i.people;
    dom[0].away = true;
    dodaj(powodOdmowy(nowy(), i, c, [p0.id]), i);
    const wDrodze = nowy();
    wDrodze.wyprawy = [{ id: 1, cel: celZMiejsca(zZapasem('sklep', 300)), ids: [p1.id], wyjscie: 600, powrot: 800 }];
    dodaj(powodOdmowy(wDrodze, i, c, [p1.id]), i);
    for (const f of [true, false]) {
      dom[2].bitten = true;
      dom[2].f = f;
      dodaj(powodOdmowy(nowy(), i, c, [p2.id]), i);
    }
    dom[3].needs = { ...dom[3].needs, rest: 5 };
    dodaj(powodOdmowy(nowy(), i, c, [p3.id]), i);
    // ktoś już idzie do tego klucza
    const idzie = nowy();
    idzie.wyprawy = [{ id: 1, cel: c, ids: ['ktos-inny'], wyjscie: 600, powrot: 800 }];
    dodaj(powodOdmowy(idzie, i, c, [p4?.id ?? atr.people[3].id]), i);
    return out;
  }

  it('powody odmowy są po angielsku, a po polsku inne', () => {
    const lista = powody();
    expect(lista.length).toBeGreaterThanOrEqual(12);
    for (const { t, i } of lista) {
      sprawdz(t, imiona(i));
      expect(t.en, t.pl).not.toBe(t.pl);
    }
    const en = lista.map((x) => x.t.en).join(' | ');
    expect(en).toContain('The city map is not switched on.');
    expect(en).toContain('Nobody sets out after dark.');
    expect(en).toContain('Select someone from the board.');
    expect(en).toContain('This place has been picked clean.');
  });

  it('kiedyWraca: dziś „around”, jutro „tomorrow at”', () => {
    const dzis = kiedyWraca(1440 + 16 * 60 + 20, 2);
    expect(dzis).toEqual({ pl: 'około 16:20', en: 'around 16:20' });
    const jutro = kiedyWraca(2 * 1440 + 6 * 60 + 5, 2);
    expect(jutro).toEqual({ pl: 'jutro o 06:05', en: 'tomorrow at 06:05' });
  });

  it('kronika: wysłanie i powrót z łupem, z pustymi rękami, z kłopotami i ze znaleziskami', () => {
    const wpisy: Tx[] = [];
    const nazwy = new Set<string>([NAZWA]);
    for (const tryb of ['zwykly', 'zombie'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        for (const osob of [1, 3]) {
          const atr = new Atrapa(seed);
          const st = newGov(seed, tryb);
          wlaczMiasto(st);
          const c = { ...celZMiejsca(zZapasem(osob === 1 ? 'apteka' : 'spozywczy', 350, NAZWA)), ryzyko: 0.5 };
          const i = wej(2, 9, 0, atr);
          for (const p of i.people) {
            nazwy.add(p.name);
            nazwy.add(p.first);
          }
          const w = wyslijWyprawe(
            st,
            i,
            c,
            i.people.slice(0, osob).map((p) => p.id),
          );
          expect(w.ok).toBe(true);
          // co trzecia wyprawa: ktoś inny wyniósł wszystko, zanim wrócili
          if (seed % 3 === 0) st.miasto!.zabrano[c.klucz] = c.zapas!;
          const fx = emptyEffects();
          wyprawyTick(st, wej(3, 12, 0, atr), fx);
          wpisy.push(...st.log.map((l) => l.txt));
        }
      }
    }
    expect(wpisy.length).toBeGreaterThan(100);
    for (const t of wpisy) sprawdz(t, [...nazwy]);
    const en = wpisy.map((t) => t.en);
    expect(en.some((t) => t.startsWith('Supply run to Pharmacy'))).toBe(true);
    expect(en.some((t) => t.includes('came back from'))).toBe(true);
    expect(en.some((t) => t.includes('empty-handed'))).toBe(true);
    expect(en.some((t) => t.includes('ran into'))).toBe(true);
    expect(en.some((t) => t.includes('also found'))).toBe(true);
    // bez „the Shamblers” w trybie zwykłym i bez looterów w zombie: kłopoty w obu trybach mają swoje słowo
    expect(en.some((t) => t.includes('shamblers'))).toBe(true);
    expect(en.some((t) => t.includes('looters'))).toBe(true);
  });

  it('rozliczenie wspólną funkcją: cel z miejsca i cel z TARGETS, jedna osoba i grupa', () => {
    const linie: Tx[] = [];
    const nazwy = new Set<string>([NAZWA]);
    for (let seed = 1; seed <= 25; seed++) {
      const atr = new Atrapa(seed);
      const st = newGov(seed);
      wlaczMiasto(st);
      const i = wej(2, 12, 0, atr);
      for (const n of imiona(i)) nazwy.add(n);
      const c = zZapasem('stacja', 800, NAZWA);
      for (const osob of [1, 2]) {
        const r = rozliczWyprawe(st, i, emptyEffects(), { ...celZMiejsca(c), ryzyko: 0.6 }, i.people.slice(0, osob));
        linie.push(...r.lines);
      }
    }
    expect(linie.length).toBeGreaterThan(20);
    for (const t of linie) sprawdz(t, [...nazwy]);
    // grupa mówi „They”, jedna osoba „He” albo „She”
    expect(linie.some((t) => /\bThey\b/.test(t.en))).toBe(true);
    expect(linie.some((t) => /\b(He|She)\b/.test(t.en))).toBe(true);
  });
});

// ---------------------------------------------------------------- karta nocy

describe('karta nocy z miejscami po angielsku', () => {
  const okolica = [
    miejsce(2, 'apteka', 250, NAZWA),
    miejsce(3, 'spozywczy', 500),
    miejsce(5, 'przychodnia', 640),
    miejsce(6, 'garaz', 700),
  ];

  /** wejście o 20:00 z okolicą; jedna osoba zmęczona, jedna ugryziona, jedna słaba */
  function wejscie(tryb: 'zwykly' | 'zombie', z: Miejsce[] | undefined): { st: GovState; i: GovInput } {
    const st = newGov(1, tryb);
    wlaczMiasto(st);
    const i0 = new Atrapa(1).input();
    const i: GovInput = { ...i0, hour: 20, minute: 0, ...(z ? { okolica: z } : {}) };
    i.people = i.people.map((p, k): GovPerson => {
      if (k === 1) return { ...p, needs: { ...p.needs, rest: 20 } };
      if (k === 2) return { ...p, bitten: true };
      if (k === 3) return { ...p, needs: { ...p.needs, rest: 35, health: 40 } };
      return p;
    });
    return { st, i };
  }

  for (const tryb of ['zwykly', 'zombie'] as const)
    for (const z of [okolica, undefined])
      it(`${tryb}, ${z ? 'miejsca z okolicy' : 'cele z TARGETS'}: opcje wyprawy mają etykiety, powody i notatki po angielsku`, () => {
        const { st, i } = wejscie(tryb, z);
        const { card } = makeCard(st, i);
        const dozw = [NAZWA, ...imiona(i)];
        const opcje = card.people.flatMap((cp) => cp.options.filter((o) => o.key.startsWith('wyprawa:')));
        expect(opcje.length).toBeGreaterThanOrEqual(6);
        for (const o of opcje) {
          sprawdz(o.label, dozw);
          if (o.why) sprawdz(o.why, dozw);
          if (o.note) sprawdz(o.note, dozw);
          expect(o.label.en).toMatch(/^(Short|Long) run: /);
        }
        const powody = opcje.flatMap((o) => (o.why ? [o.why.en] : []));
        expect(powody.some((t) => t.includes('Bitten and feverish'))).toBe(true);
        expect(powody.some((t) => t.includes('Not enough energy'))).toBe(true);
        if (z) expect(opcje.some((o) => o.label.en.includes(`Pharmacy (${NAZWA}), 250 m`))).toBe(true);
      });
});

// ---------------------------------------------------------------- okno mapy miasta i plan wyprawy

describe('okno mapy miasta po angielsku', () => {
  /** wiele stanów karty: nietknięte, ktoś tu był, wybrane do cna, wyprawa w drodze, noc, za daleko, mapa osiedla */
  function karty(): { m: Miejsce; st: GovState; i: GovInput }[] {
    const out: { m: Miejsce; st: GovState; i: GovInput }[] = [];
    const dodaj = (m: Miejsce, st: GovState, i: GovInput) => out.push({ m, st, i });
    const i = wej(5, 10);
    // każda kategoria i trzy odległości (ryzyko od „calm” do „dangerous”)
    for (const kat of Object.keys(KAT_EN))
      for (const odl of [250, 1500, 4800]) dodaj(zZapasem(kat, odl, NAZWA, 1), nowy(), i);
    const m = zZapasem('spozywczy', 600, NAZWA);
    dodaj(m, newGov(SEED), i);
    const byl = nowy();
    byl.miasto!.zabrano[m.klucz] = 2;
    byl.miasto!.wizyty[m.klucz] = 1;
    byl.miasto!.ostatnia[m.klucz] = 5;
    dodaj(m, byl, i);
    for (const [wizyty, ostatnia] of [
      [2, 4],
      [3, 2],
    ])
      dodaj(
        m,
        {
          ...byl,
          miasto: { zabrano: byl.miasto!.zabrano, wizyty: { [m.klucz]: wizyty }, ostatnia: { [m.klucz]: ostatnia } },
        },
        i,
      );
    const cna = nowy();
    cna.miasto!.zabrano[m.klucz] = celZMiejsca(m).zapas!;
    dodaj(m, cna, i);
    dodaj(puste('apteka', 500), nowy(), i);
    const wDrodze = nowy();
    wDrodze.wyprawy = [
      { id: 1, cel: celZMiejsca(m), ids: [i.people[0].id], wyjscie: 5 * 1440, powrot: 5 * 1440 + 900 },
    ];
    dodaj(m, wDrodze, i);
    dodaj(m, nowy(), wej(5, 22));
    dodaj(zZapasem('apteka', MAX_DROGA_M + 300, NAZWA), nowy(), i);
    dodaj(miejsce(9, 'sklep', 100, NAZWA), nowy(), i);
    return out;
  }

  it('karta miejsca: tytuł, linie i powód po angielsku, w kodzie HTML i tekstach', () => {
    const lista = karty();
    expect(lista.length).toBeGreaterThan(50);
    for (const { m, st, i } of lista) {
      const k = kartaMiejsca(m, st, i);
      const dozw = [NAZWA, ...imiona(i)];
      sprawdz(k.tytul, dozw);
      for (const t of [...k.linie, ...(k.powod ? [k.powod] : [])]) {
        sprawdz(t, dozw);
        expect(t.en, t.pl).not.toBe(t.pl);
      }
      ustawJezyk('en');
      for (const wyslij of [true, false]) {
        const html = kartaHtml(m, k, wyslij);
        expect(polskieSlowa(html, dozw), html).toEqual([]);
        expect(html).toContain(wyslij ? 'Send a supply run' : 'Send a supply run (soon)');
        expect(html).toContain('Close the card');
      }
    }
    const wszystko = lista.map(({ m, st, i }) => kartaMiejsca(m, st, i)).flatMap((k) => k.linie.map((t) => t.en));
    for (const fraza of [
      'each way',
      'Whole supply run, search included',
      'out there',
      'Usually here',
      'Untouched.',
      'Picked clean.',
      'Somebody has been here',
      'You have not been here yet.',
      'You were last here today',
      'You were last here yesterday',
      'on day 2',
      'times in all',
      'A supply run is on its way',
    ])
      expect(
        wszystko.some((t) => t.includes(fraza)),
        fraza,
      ).toBe(true);
  });

  it('po polsku karta zostaje po polsku', () => {
    ustawJezyk('pl');
    const m = zZapasem('apteka', 400, NAZWA);
    const k = kartaMiejsca(m, nowy(), wej(5, 10));
    const html = kartaHtml(m, k, true);
    expect(html).toContain('Wyślij wyprawę');
    expect(html).toContain('Zamknij kartę');
    expect(html).not.toContain('Send a supply run');
    expect(html).toContain(`Apteka (${NAZWA})`);
    expect(tr(k.linie[0])).toBe(k.linie[0].pl);
  });

  it('okno mapy: napisy, podpowiedzi sterowania (mysz i dotyk) i atrybucja po angielsku', () => {
    for (const touch of [false, true]) {
      ustawJezyk('en');
      const s = mapaMiastaSheet(touch);
      for (const czesc of [s.kicker, s.title, s.body, s.foot]) expect(polskieSlowa(czesc), czesc).toEqual([]);
      expect(s.title).toBe('City map');
      expect(s.kicker).toBe('Beyond the gate');
      expect(s.body).toContain(touch ? 'Tap a sign' : 'Click a sign');
      expect(s.body).toContain('Zoom in');
      expect(s.body).toContain('Zoom out');
      expect(s.body).toContain('Show the estate');
      expect(s.foot).toContain('OpenStreetMap contributors');
      expect(s.foot).toContain('Back to the game');
      ustawJezyk('pl');
      const pl = mapaMiastaSheet(touch);
      expect(pl.title).toBe('Mapa miasta');
      expect(pl.foot).toContain('współtwórcy OpenStreetMap');
      expect(pl.foot).toContain('Wróć do gry');
    }
  });

  it('okno planu wyprawy: osoby, podsumowanie, powrót rano, odmowa i stopka po angielsku', () => {
    const wzor = (hour: number, odmowa?: Tx, uzbrojona = false) => {
      const st = nowy();
      const i = wej(2, hour);
      i.people = i.people.map((p) => ({ ...p }));
      i.people[1].bitten = true;
      i.people[2].needs = { ...i.people[2].needs, rest: 5 };
      if (uzbrojona) {
        i.people[3].weapon = 'rewolwer';
        i.people[3].arm = 'palna';
      }
      const cel = celZMiejsca(zZapasem('apteka', 900, NAZWA));
      const wybrani = new Set([i.people[0].id, i.people[3].id]);
      return { i, s: planWyprawySheet(cel, i, st, wybrani, odmowa) };
    };
    const kroki: [number, Tx | undefined, boolean][] = [
      [9, undefined, true],
      [9, undefined, false],
      [18, undefined, false],
      [21, undefined, false],
      [9, { pl: 'Ktoś już tam idzie.', en: 'Somebody is already on the way there.' }, false],
    ];
    for (const [hour, odmowa, broń] of kroki) {
      ustawJezyk('en');
      const { i, s } = wzor(hour, odmowa, broń);
      for (const czesc of [s.kicker, s.title, s.body, s.foot])
        expect(polskieSlowa(czesc, [NAZWA, ...imiona(i)]), czesc).toEqual([]);
      expect(s.kicker).toBe('Supply run');
      expect(s.foot).toContain('Back to the map');
      expect(s.foot).toContain('Send the supply run');
      expect(s.body).toContain('from the estate. Who goes?');
      expect(s.body).not.toMatch(ZAKAZANE);
      if (hour === 18) {
        expect(s.body).toContain('Time away');
        expect(s.body).toContain('Can carry');
        expect(s.body).toContain('Left there');
        expect(s.body).toContain('Risk');
      }
      if (hour === 9 && !odmowa && broń) expect(s.body).toContain('revolver');
      if (hour === 21) expect(s.body).toContain('Nobody sets out after dark.');
      ustawJezyk('pl');
      const pl = wzor(hour, odmowa, broń).s;
      expect(pl.kicker).toBe('Wyprawa po zapasy');
      expect(pl.foot).toContain('Wróć do mapy');
      expect(pl.foot).toContain('Wyślij wyprawę');
    }
    // wyprawa wieczorem wraca dopiero rano
    ustawJezyk('en');
    const wieczor = planWyprawySheet(
      { ...celZMiejsca(zZapasem('apteka', 3000, NAZWA)) } as Cel,
      wej(2, 17),
      nowy(),
      new Set([wej(2, 17).people[0].id]),
    );
    expect(wieczor.body).toContain('only be back in the morning');
  });

  it('przyciski i dymki z index.html: mapa miasta i minimapa po angielsku, atrybucja z trzema źródłami', () => {
    const jakie = STATYCZNE.filter((s) => ['#btnMiasto', '#minimapaBtn', '.minimapa-attrib'].includes(s.sel));
    expect(jakie.length).toBe(3);
    for (const s of jakie)
      for (const t of [s.tekst, s.title, s.aria, s.html]) {
        if (!t) continue;
        sprawdz(t);
        const lang: Lang = 'en';
        expect(polskieSlowa(t[lang]), t.en).toEqual([]);
      }
    const atrybucja = STATYCZNE.find((s) => s.sel === '.minimapa-attrib')!.html!;
    for (const zrodlo of ['OpenStreetMap contributors', 'OpenFreeMap', 'OpenMapTiles'])
      expect(atrybucja.en).toContain(zrodlo);
    for (const zrodlo of ['współtwórcy OpenStreetMap', 'OpenFreeMap', 'OpenMapTiles'])
      expect(atrybucja.pl).toContain(zrodlo);
  });
});

// ---------------------------------------------------------------- przegląd źródeł

/** Pary napisów `L('pl', 'en')` i `tx('pl', 'en')` z dosłownych tekstów w pliku (apostrofy albo odwrócone apostrofy,
    również w kilku wierszach). `${…}` w szablonie zastępuje słowo „x”. Wywołania z nazwami zamiast dosłownych tekstów
    (np. `tx(a.pl, b.en)`) tu nie wchodzą, pilnują ich scenariusze wyżej. */
function pary(plik: string): { pl: string; en: string }[] {
  const zrodlo = readFileSync(plik, 'utf8');
  const lit = String.raw`(?:'((?:[^'\\\n]|\\.)*)'|\x60((?:[^\x60\\]|\\.)*)\x60)`;
  const re = new RegExp(String.raw`(?<![\w.$])(?:L|tx)\(\s*${lit}\s*,\s*${lit}\s*,?\s*\)`, 'g');
  const out: { pl: string; en: string }[] = [];
  const czysc = (s: string) => s.replace(/\$\{[^}]*\}/g, 'x').replace(/\\(.)/g, '$1');
  for (const m of zrodlo.matchAll(re)) out.push({ pl: czysc(m[1] ?? m[2]), en: czysc(m[3] ?? m[4]) });
  return out;
}

describe('przegląd źródeł nowych modułów', () => {
  /** plik i najmniejsza liczba par, jaką przegląd ma w nim znaleźć (liczby z dnia pisania: pilnują, że wzorzec nie
      przestał łapać wywołań, np. po zmianie formatowania) */
  const pliki: [string, number][] = [
    ['src/ui/miasto.ts', 30],
    ['src/ui/wyprawa.ts', 16],
    ['src/gov/dzienne.ts', 13],
    ['src/gov/wyprawy.ts', 4],
    ['src/gov/noc.ts', 70],
  ];
  for (const [plik, najmniej] of pliki)
    it(`${plik}: każda para napisów ma angielską stronę bez polskich słów`, () => {
      const lista = pary(plik);
      expect(lista.length).toBeGreaterThanOrEqual(najmniej);
      for (const { pl, en } of lista) {
        // pusty napis po obu stronach (`tx('', '')`) to celowy brak tekstu
        if (!pl && !en) continue;
        expect(pl.length, en).toBeGreaterThan(0);
        expect(en.length, pl).toBeGreaterThan(0);
        expect(polskieSlowa(en), en).toEqual([]);
        expect(en, en).not.toMatch(ZAKAZANE);
      }
    });

  it('src/ui/minimapa.ts nie ma własnych napisów: przycisk i dymek są w src/ui/jezyk.ts (sprawdzone wyżej)', () => {
    const zrodlo = readFileSync('src/ui/minimapa.ts', 'utf8');
    expect(zrodlo).not.toMatch(/(?<![\w.$])(?:L|tx|tr)\(/);
  });
});
