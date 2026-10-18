/* Fala 2 M2 po angielsku (docs/M2-fala-2.md, słowniczek docs/SLOWNICZEK-EN.md): menu przy cudzych drzwiach, opisy
   prac, karta spotkania, karta budynku i zdania po spotkaniu biorą napisy z src/content/napisy-sasiedzi.ts w bieżącym
   języku; zawody i nazwy budynków z mapy idą po angielsku, imiona zostają. Stan gry bez zmian, w Node domyślnie
   polski (polskie napisy pilnują spotkanie-ui.test.ts i spotkania.test.ts). Deski to „planks”, szwendacze
   „shamblers”, lokatorzy „residents”, leki „meds”, a zapasy w zdaniu mają liczbę z przodu. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zawodEn } from '../../src/content/data.en.ts';
import { PROFS } from '../../src/content/data.ts';
import {
  BUDYNEK,
  type Dwa,
  ileTekst,
  KARTA,
  MENU,
  PO_POLECENIU,
  PRACA,
  PRACA_DRZWI,
  WYBOR,
  zdanie,
} from '../../src/content/napisy-sasiedzi.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { type Gospodarstwo, wybory } from '../../src/sim/sasiedzi.ts';
import type { Job } from '../../src/sim/sim.ts';
import { kartaBudynku, widokBudynku } from '../../src/ui/budynek.ts';
import { spotkanieSheet, zdanieNapisu } from '../../src/ui/spotkanie.ts';
import type { RoomKind } from '../../src/world/interior.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { core, newGame } from './sasiedzi-pomoc.ts';

beforeEach(() => ustawJezyk('en'));
afterEach(() => ustawJezyk('pl'));

/** słowa spoza słowniczka (w kartach z zawodami bez „rations”: „rations accountant” to zawód z tłumaczeń fachów) */
const ZAKAZANE = /\b(boards?|board up|walkers?|tenants?|medicine|firewood)\b/i;
const PORCJE = /\brations?\b/i;

/** zawód z 0.3 w formie żeńskiej i męskiej (jak w stanie gry) */
const [PROF_M, PROF_F] = PROFS[0];

const dom = (over: Partial<Gospodarstwo> = {}): Gospodarstwo => ({
  osoby: [
    { first: 'Halina', name: 'Halina Zając', f: true, prof: PROF_F, skills: {}, age: 71, traits: [] },
    { first: 'Jerzy', name: 'Jerzy Zając', f: false, prof: PROF_M, skills: {}, age: 22, traits: [] },
  ],
  apt: 0,
  klatka: -1,
  znani: true,
  zamiar: 'zyczliwi',
  nastroj: 'strach',
  rel: 15,
  zapasy: { jedzenie: 4 },
  gdzie: 'u_siebie',
  ...over,
});

const ROOMS: RoomKind[] = ['klatka', 'przedpokoj', 'pokoj', 'kuchnia', 'lazienka', 'sala', 'hala', 'zaplecze'];

/** wszystkie napisy fali 2 z przykładowymi danymi */
function wszystkie(): Dwa[] {
  const kto = { first: 'Basia', f: true };
  return [
    ...Object.values(MENU).filter((v) => typeof v !== 'function'),
    ...ROOMS.map((k) => MENU.przeszukaj(k)),
    MENU.pietro(3),
    MENU.plot(65, 67, 65, 3.25),
    MENU.plot(1, 1, 1, 1),
    MENU.plotNie('jezdnia'),
    MENU.plotNie('dlugi', 155),
    MENU.plotNie('brak'),
    ...Object.values(PRACA_DRZWI).flat(),
    ...Object.values(PO_POLECENIU).flat(),
    ...ROOMS.flatMap((k) => [PRACA.idziePrzeszukac(k), PRACA.przeszukuje(k)]),
    PRACA.idziePrzeszukac(null),
    PRACA.rozmawia,
    PRACA.idzieNaSchody,
    PRACA.naPietrze,
    PRACA.plot(0, 0),
    PRACA.plot(1, 0),
    PRACA.plot(2, 40),
    KARTA.naglowek,
    ...Object.values(KARTA.tytul),
    KARTA.znani,
    KARTA.obcy,
    ...Object.values(KARTA.zamiar),
    ...Object.values(KARTA.nastroj),
    ...[-60, -20, 0, 20, 60].map((r) => KARTA.relacja(r)),
    KARTA.wywazone,
    KARTA.reka,
    KARTA.szabrownicy,
    KARTA.bezRozmowy,
    KARTA.zapasy(1),
    KARTA.zapasy(40),
    WYBOR.rozmowa(),
    WYBOR.jedzenie(),
    WYBOR.zaproszenie('40%'),
    WYBOR.zabranie('5%'),
    WYBOR.odejscie(),
    WYBOR.obrona('45%'),
    WYBOR.uspokojenie('30%'),
    WYBOR.ucieczka(),
    WYBOR.przegonic('60%'),
    WYBOR.reka(),
    ...['blok', 'dom', 'sklep', 'szkola', 'przychodnia', 'garaz', 'kosciol', 'hala', 'inne'].map((c) =>
      BUDYNEK.rodzaj(c),
    ),
    BUDYNEK.pietra(1),
    BUDYNEK.pietra(4),
    BUDYNEK.nieWiecie,
    BUDYNEK.bezMieszkan,
    BUDYNEK.znacieStad,
    BUDYNEK.wiecejLudzi,
    ...['u_siebie', 'odeszli', 'u_nas', 'nie_zyja'].map((g) => BUDYNEK.gdzie(g)),
    BUDYNEK.klatka(1),
    BUDYNEK.drzwi({ zamkniete: 1, na_klucz: 2, otwarte: 1, wywazone: 1, zabite: 2 }),
    BUDYNEK.pietraPrzeszukane(2, 18),
    BUDYNEK.noc(3, 'szwendacze', ileTekst({})),
    BUDYNEK.noc(3, 'szabrownicy', ileTekst({})),
    BUDYNEK.noc(3, 'szabrownicy', ileTekst({ deski: 5 })),
    BUDYNEK.przeszukane(1, 1),
    BUDYNEK.przeszukane(2, 30),
    BUDYNEK.zamkniety,
    BUDYNEK.otoczony,
    BUDYNEK.plotPlan(40),
    BUDYNEK.jak(true),
    BUDYNEK.jak(false),
    ...[
      'szabr_rozmowa',
      'reka',
      'przegonic_tak',
      'przegonic_nie',
      'pietro',
      'pietro_szwendacz',
      'pietro_ugryzienie',
      'noc',
      'plot_jezdnia',
      'plot_dlugi',
      'plot_brak',
      'plot_gotowy',
      'noc_zombie',
      'na_klucz',
      'nikt',
      'szuranie',
      'ktos',
      'szwendacz',
      'odbite',
      'przerwane',
      'rozmowa',
      'jedzenie',
      'zaproszenie_tak',
      'zaproszenie_nie',
      'zabranie',
      'zabranie_wygrana',
      'zabranie_przegrana',
      'odejscie',
      'obrona_wygrana',
      'obrona_przegrana',
      'uspokojenie_tak',
      'uspokojenie_nie',
      'ucieczka',
    ].flatMap((co) => [
      zdanie(co, { kto, ile: { deski: 2, jedzenie: 1 }, nazwa: 'Blok nr 10F', ilu: 3 }),
      zdanie(co, { kto: null, ile: {}, info: 'puste' }),
    ]),
    ...['inni', 'puste', 'lazi'].map((info) => zdanie('rozmowa', { info })),
  ];
}

describe('napisy fali 2 po angielsku', () => {
  it('każdy ma angielską wersję bez polskich słów i bez słów spoza słowniczka', () => {
    for (const d of wszystkie()) {
      if (!d.pl) continue;
      expect(d.en.length, d.pl).toBeGreaterThan(0);
      expect(polskieSlowa(d.en, ['Basia', 'Halina Zając', 'Jerzy Zając']), d.en).toEqual([]);
      expect(d.en, d.en).not.toMatch(ZAKAZANE);
      expect(d.en, d.en).not.toMatch(PORCJE);
    }
  });

  it('zapasy w zdaniu z liczbą z przodu i „and” przed ostatnim, budynek z mapy po angielsku', () => {
    expect(ileTekst({ deski: 5, jedzenie: 1, leki: 2 }).en).toBe('5 planks, 1 food and 2 packs of meds');
    expect(ileTekst({ deski: 1 }).en).toBe('1 plank');
    expect(ileTekst({ leki: 1, czesci: 3 }).en).toBe('1 pack of meds and 3 parts');
    expect(zdanieNapisu({ co: 'noc', ile: { deski: 4 }, ilu: 3 }, null, 'Blok nr 10F')).toBe(
      'Someone got into Block 10F and 2 other buildings last night. Gone: 4 planks.',
    );
    expect(zdanieNapisu({ co: 'plot_gotowy', ilu: 65 }, null, 'Blok nr 10F')).toBe(
      'The shared fence is up: 65 m of new fence, and Block 10F is inside it.',
    );
    expect(zdanieNapisu({ co: 'obrona_przegrana' }, { first: 'Basia', f: true })).toBe(
      'Basia got hurt. You fall back home.',
    );
    expect(MENU.plot(65, 65, 65, 3.25).en).toBe('Put up a shared fence (65 m: 65 planks, 65 scrap, 3.3 h)');
    // po polsku jak było
    expect(MENU.plot(65, 65, 65, 3.25).pl).toBe('Otoczyć wspólnym płotem (65 m: 65 desek, 65 złomu, 3,3 h)');
  });
});

describe('gra po angielsku', () => {
  it('menu przy drzwiach bloku obok i opisy prac przy drzwiach', () => {
    const sim = newGame('lanciego');
    const w = sim.w;
    const b = w.buildings.find((x) => x.name === 'Blok nr 10F')!;
    const p = core(sim)[0];
    const labels = commandsAt(sim.st, w, [p.id], b.entrances[0].tile).map((m) => m.label);
    expect(labels.some((l) => l.startsWith('Open the door'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Force the door'))).toBe(true);
    for (const l of labels) {
      expect(polskieSlowa(l), l).toEqual([]);
      expect(l, l).not.toMatch(ZAKAZANE);
    }
    const job = (what: string, phase: number): Job => ({
      t: 'door',
      target: -1,
      tile: b.entrances[0].tile,
      phase,
      from: -1,
      t0: 0,
      until: 0,
      order: true,
      n: 0,
      what,
    });
    p.job = job('board', 1);
    expect(jobText(sim.st, w, p)).toBe('Nailing planks over the door.');
    p.job = job('force', 0);
    expect(jobText(sim.st, w, p)).toBe('Going to force the door.');
  });

  it('karta spotkania: zawody, nazwa budynku i wybory po angielsku, imiona bez zmian', () => {
    const g = dom();
    const sp = { nr: 1, atak: false, gdzie: 'drzwi' as const, wywazone: false };
    const ctx = { jedzenie: 6, uzbrojeni: 0, mode: 'zwykly' as const, mowca: null };
    const s = spotkanieSheet({ sp, g, wybory: wybory(sp, g, ctx), jedzenie: 6, budynek: 'Blok nr 10F' });
    expect(s.kicker).toBe('Neighbours · Block 10F');
    expect(s.title).toBe('Someone opened the door');
    const prof = zawodEn(PROF_F.charAt(0).toLowerCase() + PROF_F.slice(1));
    expect(s.body).toContain(`Halina Zając, ${prof}, 71`);
    expect(s.foot).toContain('Walk away');
    const text = `${s.kicker} ${s.title} ${s.body} ${s.foot}`;
    expect(polskieSlowa(text, ['Halina Zając', 'Jerzy Zając']), text).toEqual([]);
    expect(text).not.toMatch(ZAKAZANE);
  });

  it('karta budynku: nazwa z mapy, znajomi i drzwi po angielsku', () => {
    const sim = newGame('przymorze');
    const w = sim.w;
    const door = w.buildings[w.hq].entrances[0].out;
    const d2 = (t: number) =>
      ((t % w.size) - (door % w.size)) ** 2 + (Math.floor(t / w.size) - Math.floor(door / w.size)) ** 2;
    const b = w.buildings
      .filter((x) => x.id !== w.hq && (x.cls === 'blok' || x.cls === 'dom') && x.entrances.length)
      .sort((x, y) => d2(x.entrances[0].out) - d2(y.entrances[0].out))[0];
    const bud = sim.budynekDoKarty(b.id)!;
    const html = kartaBudynku(widokBudynku(w, bud.b, true, sim.st.plot), false);
    expect(html).toContain('People you know here');
    expect(html).toContain('Outside doors:');
    const names = bud.b.domy.flatMap((g) => g.osoby.map((o) => o.name));
    expect(names.length).toBeGreaterThan(0);
    expect(polskieSlowa(html, [b.name, ...names]), html).toEqual([]);
    expect(html).not.toMatch(ZAKAZANE);
  });
});
