/* Interfejs fali 2 M2 (docs/M2-fala-2.md): karta spotkania (wybory z szansami, jedzenie bez zapasów nieaktywne, napad
   z innym odcieniem), zdania po spotkaniu i przy drzwiach, napisy w obu językach, karta sąsiedniego budynku (podgląd
   wpisu nie zmienia stanu i zgadza się z wpisem po pierwszym dotknięciu, w trybie zombie nikogo nie znamy) i cel
   drugiego dnia w domu (pokój u sąsiadów). */

import { describe, expect, it } from 'vitest';
import {
  BUDYNEK,
  KARTA,
  MENU,
  PO_POLECENIU,
  PRACA,
  PRACA_DRZWI,
  WYBOR,
  zdanie,
} from '../../src/content/napisy-sasiedzi.ts';
import { wordsOfWorld } from '../../src/gov/miejsce.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { type Gospodarstwo, nowyBudynek, szabrownicy, wybory, znaniBudynki } from '../../src/sim/sasiedzi.ts';
import { kartaBudynku, widokBudynku } from '../../src/ui/budynek.ts';
import { goalsDay2 } from '../../src/ui/cele.ts';
import { spotkanieSheet, zdanieNapisu } from '../../src/ui/spotkanie.ts';
import { core, demoWorld, doorWhere, newGame, until } from './sasiedzi-pomoc.ts';

const dom = (over: Partial<Gospodarstwo> = {}): Gospodarstwo => ({
  osoby: [
    { first: 'Halina', name: 'Halina Zając', f: true, prof: 'emerytka', skills: {}, age: 71, traits: [] },
    { first: 'Jerzy', name: 'Jerzy Zając', f: false, prof: 'emeryt', skills: {}, age: 22, traits: [] },
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

const ctx = (jedzenie: number) => ({ jedzenie, uzbrojeni: 0, mode: 'zwykly' as const, mowca: null });

/** przyciski okna: wybór, czy aktywny, napis */
const buttons = (foot: string) =>
  [...foot.matchAll(/<button[^>]*data-arg="([a-z]+)"([^>]*)>([^<]*)<\/button>/g)].map((m) => ({
    k: m[1],
    on: !m[2].includes('disabled'),
    danger: m[0].includes('danger'),
    label: m[3],
  }));

describe('karta spotkania', () => {
  it('w drzwiach: rozmowa, jedzenie, zaproszenie z szansą, zabranie z ryzykiem oporu, odejście', () => {
    const g = dom();
    const sp = { nr: 1, atak: false, gdzie: 'drzwi' as const, wywazone: false };
    const s = spotkanieSheet({ sp, g, wybory: wybory(sp, g, ctx(6)), jedzenie: 6, budynek: 'Dom nr 12' });
    expect(s.tone).toBe('sasiedzi');
    expect(s.closable).toBeFalsy();
    expect(s.kicker).toBe('Sąsiedzi · Dom nr 12');
    expect(s.title).toBe('Ktoś otworzył drzwi');
    expect(s.body).toContain('Halina Zając, 71 lat, emerytka');
    expect(s.body).toContain('Jerzy Zając, 22 lata, emeryt');
    expect(s.body).toContain('Znacie ich z widzenia. Patrzą na was życzliwie. Boją się.');
    expect(s.body).toContain('Stosunek do was: sympatia.');
    expect(s.body).toContain('W zapasach macie 6 porcji jedzenia.');
    const b = buttons(s.foot);
    expect(b.map((x) => x.k)).toEqual(['rozmowa', 'jedzenie', 'zaproszenie', 'zabranie', 'odejscie']);
    expect(b.every((x) => x.on)).toBe(true);
    expect(b.find((x) => x.k === 'zaproszenie')!.label).toMatch(/^Zaprosić do nas \(\d+% szans\)$/);
    expect(b.find((x) => x.k === 'zabranie')).toMatchObject({ danger: true });
    expect(b.find((x) => x.k === 'zabranie')!.label).toMatch(/^Zabrać im zapasy \(\d+%, że się postawią\)$/);
  });

  it('bez dwóch porcji jedzenie jest nieaktywne z powodem; nieufnych nie da się zaprosić', () => {
    const g = dom({ zamiar: 'nieufni', rel: 0, znani: false });
    const sp = { nr: 2, atak: false, gdzie: 'mieszkanie' as const, wywazone: true };
    const s = spotkanieSheet({ sp, g, wybory: wybory(sp, g, ctx(1)), jedzenie: 1, budynek: 'Blok nr 8B' });
    expect(s.title).toBe('W mieszkaniu ktoś jest');
    expect(spotkanieSheet({ sp, g, wybory: [], jedzenie: 1, budynek: 'Dom 28', dom: true }).title).toBe(
      'W domu ktoś jest',
    );
    expect(s.body).toContain('Nie znacie ich.');
    expect(s.body).toContain('Wyważyliście im drzwi.');
    expect(s.body).toContain('W zapasach macie 1 porcję jedzenia.');
    const b = buttons(s.foot);
    expect(b.map((x) => x.k)).not.toContain('zaproszenie');
    expect(b.find((x) => x.k === 'jedzenie')).toMatchObject({ on: false });
    expect(s.foot).toContain('title="Za mało jedzenia w zapasach."');
  });

  it('napad: czerwone okno, obrona i uspokojenie z szansą, ucieczka', () => {
    const g = dom({ zamiar: 'wrodzy', nastroj: 'gniew', rel: -60 });
    const sp = { nr: 3, atak: true, gdzie: 'mieszkanie' as const, wywazone: true };
    const s = spotkanieSheet({ sp, g, wybory: wybory(sp, g, ctx(9)), jedzenie: 9, budynek: 'Blok nr 8B' });
    expect(s.tone).toBe('napad');
    expect(s.title).toBe('Rzucają się na was');
    expect(s.body).toContain('Nie ma czasu na rozmowę.');
    expect(s.body).toContain('Stosunek do was: wrogość.');
    expect(s.body).not.toContain('W zapasach');
    const b = buttons(s.foot);
    expect(b.map((x) => x.k)).toEqual(['obrona', 'uspokojenie', 'ucieczka']);
    expect(b[0].label).toMatch(/^Bronić się \(\d+% szans\)$/);
  });
});

describe('karta spotkania, etap 2', () => {
  it('szabrownicy w środku: inny tytuł, bez stosunku do zarządu, przegonić z szansą', () => {
    const g = szabrownicy({ seed: 3 }, 4, 2, new Set(), { deski: 3 });
    const sp = { nr: 4, atak: false, gdzie: 'mieszkanie' as const, wywazone: false };
    const s = spotkanieSheet({ sp, g, wybory: wybory(sp, g, ctx(0)), jedzenie: 0, budynek: 'Blok nr 8B' });
    expect(s.title).toBe('W środku są szabrownicy');
    expect(s.body).toContain('To nie lokatorzy.');
    expect(s.body).not.toContain('Stosunek do was');
    const b = buttons(s.foot);
    expect(b.map((x) => x.k)).toEqual(['przegonic', 'rozmowa', 'odejscie']);
    expect(b[0].label).toMatch(/^Przegonić ich \(\d+% szans\)$/);
  });

  it('ukryty ugryziony: wskazówka o ręce i pytanie, po pytaniu już bez nich', () => {
    const g = dom({ ugryziony: 1 });
    const sp = { nr: 5, atak: false, gdzie: 'drzwi' as const, wywazone: false };
    const s = spotkanieSheet({ sp, g, wybory: wybory(sp, g, ctx(4)), jedzenie: 4, budynek: 'Dom 28' });
    expect(s.body).toContain('Ktoś z nich ma obandażowaną rękę i trzyma się z tyłu.');
    expect(
      buttons(s.foot)
        .map((x) => x.k)
        .slice(0, 2),
    ).toEqual(['rozmowa', 'reka']);
    const after = { ...g, pytali: true as const };
    const s2 = spotkanieSheet({ sp, g: after, wybory: wybory(sp, after, ctx(4)), jedzenie: 4, budynek: 'Dom 28' });
    expect(s2.body).not.toContain('obandażowaną');
    expect(buttons(s2.foot).map((x) => x.k)).not.toContain('reka');
  });

  it('karta budynku: przeszukane piętra i nocny gość', () => {
    const v = {
      name: 'Blok nr 10F',
      cls: 'blok' as const,
      levels: 5,
      mieszkalny: true,
      dotkniety: true,
      otwarty: true,
      drzwi: { otwarte: 1 },
      pokoje: { n: 2, z: 30 },
      pietra: { n: 3, z: 12 },
      noc: { dzien: 4, kto: 'szabrownicy' as const, zabrali: { deski: 4, jedzenie: 2 } },
      znajomi: [],
      plot: { otoczony: false, pct: null },
    };
    const html = kartaBudynku(v, false);
    expect(html).toContain('Piętra przeszukane: 3 z 12.');
    expect(html).toContain('Dnia 4 w nocy byli tu szabrownicy. Zniknęło: deski 4, jedzenie 2.');
    expect(kartaBudynku({ ...v, noc: { dzien: 2, kto: 'szwendacze', zabrali: {} } }, false)).toContain(
      'Dnia 2 w nocy weszły tu szwendacze.',
    );
    expect(kartaBudynku({ ...v, plot: { otoczony: false, pct: 40 } }, false)).toContain('Wspólny płot w budowie: 40%.');
    expect(kartaBudynku({ ...v, plot: { otoczony: true, pct: null } }, false)).toContain('Za wspólnym płotem');
    expect(zdanieNapisu({ co: 'noc_zombie', ilu: 2 }, null, 'Dom 28')).toBe(
      'W nocy do budynku „Dom 28” i do 1 innego weszły szwendacze.',
    );
    expect(zdanieNapisu({ co: 'noc', ile: { deski: 4 }, ilu: 3 }, null, 'Blok nr 10F')).toBe(
      'W nocy ktoś był w budynku „Blok nr 10F” i w 2 innych. Zniknęło: deski 4.',
    );
  });
});

describe('zdania przy drzwiach i po spotkaniu', () => {
  const ALL = [
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
  ];

  it('każdy napis z symulacji ma zdanie w obu językach, nieznany nic', () => {
    for (const co of ALL) {
      const z = zdanie(co, { ile: { jedzenie: 2 } });
      expect(z.pl, co).toMatch(/[.!]$/);
      expect(z.en, co).toMatch(/[.!]$/);
    }
    expect(zdanie('cos_innego', {})).toEqual({ pl: '', en: '' });
  });

  it('rana według płci, łup i informacje z rozmowy', () => {
    expect(zdanieNapisu({ co: 'obrona_przegrana' }, { first: 'Basia', f: true })).toBe(
      'Basia oberwała. Wracacie do siebie.',
    );
    expect(zdanieNapisu({ co: 'uspokojenie_nie' }, { first: 'Marek', f: false })).toBe(
      'Nie dali się uspokoić. Marek oberwał.',
    );
    expect(zdanieNapisu({ co: 'zabranie_przegrana' }, null)).toBe('Postawili się. Ktoś z was oberwał.');
    expect(zdanieNapisu({ co: 'zabranie', ile: { jedzenie: 3, leki: 1 } }, null)).toBe(
      'Oddali zapasy bez walki: jedzenie 3, leki 1.',
    );
    expect(zdanieNapisu({ co: 'jedzenie', ile: { jedzenie: 2 } }, null)).toBe(
      'Daliście im 2 porcje jedzenia. Są wdzięczni.',
    );
    expect(zdanieNapisu({ co: 'rozmowa', info: 'inni' }, null)).toContain('mieszka jeszcze ktoś');
    expect(zdanieNapisu({ co: 'rozmowa', info: 'lazi' }, null)).toContain('coś tu łazi');
  });

  it('napisy menu, prac i podpowiedzi mają obie wersje, a angielska nie ma polskich liter', () => {
    const all = [
      ...Object.values(MENU).filter((v) => typeof v !== 'function'),
      MENU.przeszukaj('pokoj'),
      MENU.pietro(3),
      ...Object.values(PRACA_DRZWI).flat(),
      ...Object.values(PO_POLECENIU).flat(),
      PRACA.rozmawia,
      PRACA.idziePrzeszukac('kuchnia'),
      PRACA.przeszukuje(null),
      KARTA.relacja(0),
      KARTA.zapasy(5),
      WYBOR.zaproszenie('40%'),
      WYBOR.ucieczka(),
      BUDYNEK.drzwi({ otwarte: 1, na_klucz: 2 }),
      BUDYNEK.przeszukane(2, 5),
      BUDYNEK.jak(true),
    ];
    for (const d of all) {
      expect(d.pl.length, d.en).toBeGreaterThan(0);
      expect(d.en.length, d.pl).toBeGreaterThan(0);
      expect(d.en, d.en).not.toMatch(/[ąćęłńóśźż]/i);
    }
    expect(MENU.przeszukaj('kuchnia').pl).toBe('Przeszukać kuchnię');
    expect(BUDYNEK.drzwi({ otwarte: 1, na_klucz: 2 }).pl).toBe('Drzwi na zewnątrz: 1 otwarte, 2 na klucz.');
    expect(BUDYNEK.drzwi({ zamkniete: 5 }).pl).toBe('Drzwi na zewnątrz: 5 zamkniętych.');
  });
});

describe('karta sąsiedniego budynku', () => {
  it('podgląd wpisu nie zmienia stanu i jest tym samym wpisem, który powstaje przy pierwszym dotknięciu', () => {
    const w = demoWorld('przymorze');
    const sim = newGame('przymorze');
    const bid = znaniBudynki(w)[0];
    const before = sim.hash();
    const pv = sim.budynekDoKarty(bid)!;
    expect(pv.wGrze).toBe(false);
    expect(sim.st.sasiedzi).toBeUndefined();
    expect(sim.hash()).toBe(before);
    expect(sim.budynekDoKarty(w.hq)).toBeNull();
    // znani z imienia: karta ich wymienia, bez stanu (nikt ich jeszcze nie spotkał)
    const v = widokBudynku(w, pv.b, pv.wGrze);
    expect(v.dotkniety).toBe(false);
    expect(v.drzwi).toBeNull();
    expect(v.znajomi.length).toBeGreaterThan(0);
    expect(v.znajomi.every((z) => z.gdzie === null)).toBe(true);
    const html = kartaBudynku(v, false);
    expect(html).toContain(`<h2>${w.buildings[bid].name}</h2>`);
    expect(html).toContain('Znacie stąd');
    expect(html).toContain(v.znajomi[0].osoby[0].name);
    expect(html).toContain('Wnętrza jeszcze nie widzieliście.');
    expect(html).toContain('Prawy przycisk na drzwiach');
    // po pierwszym dotknięciu drzwi wpis w grze to ten sam wpis co podgląd
    const door = w.buildings[bid].entrances[0].tile;
    sim.push({ t: 'knock', ids: [core(sim)[0].id], door });
    sim.step();
    const rec = sim.st.sasiedzi!.budynki.find((b) => b.bid === bid)!;
    expect(rec).toEqual(pv.b);
    const inGame = sim.budynekDoKarty(bid)!;
    expect(inGame.wGrze).toBe(true);
    expect(widokBudynku(w, inGame.b, true).drzwi).not.toBeNull();
  });

  it('otwarty budynek: ile przeszukano; w trybie zombie nikogo nie znamy', () => {
    const w = demoWorld('lanciego');
    const { bid, door } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k);
    const sim = newGame('lanciego');
    const p = core(sim)[0];
    sim.push({ t: 'open', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    const c = sim.budynekDoKarty(bid)!;
    const v = widokBudynku(w, c.b, c.wGrze);
    expect(v.otwarty).toBe(true);
    expect(v.pokoje?.n).toBe(0);
    expect(kartaBudynku(v, true)).toContain(`Przeszukane: 0 z ${v.pokoje!.z} pomieszczeń.`);
    expect(kartaBudynku(v, true)).toContain('Przytrzymajcie palec na drzwiach');
    const z = newGame('przymorze', 'zombie');
    const zw = demoWorld('przymorze');
    const zc = z.budynekDoKarty(znaniBudynki(zw)[0])!;
    expect(widokBudynku(zw, zc.b, zc.wGrze).znajomi).toEqual([]);
  });
});

describe('cel drugiego dnia: przeszukanie u sąsiadów też się liczy', () => {
  it('w domu i w bloku cel przeszukania zalicza pierwsze pomieszczenie przeszukane u sąsiadów', () => {
    for (const [key, w] of [
      ['zielonki', demoWorld('zielonki')],
      ['lanciego', demoWorld('lanciego')],
    ] as const) {
      const sim = newGame(key);
      const gov = newGov(1);
      const o = { touch: false, wood: 0, woodReady: false, holes: 0, words: wordsOfWorld(w) };
      const goal = () => goalsDay2(sim.st, gov, o).find((g) => g.key === 'przeszukaj')!;
      expect(goal().done).toBe(false);
      // podpowiedź zaczyna od zaznaczenia osoby: bez niej prawy przycisk w pomieszczeniu niczego nie daje
      expect(goal().how, key).toMatch(/^Zaznaczcie kogoś z (zarządu|komitetu) i prawy przycisk w .*„Przeszukać …”/);
      const { bid } = doorWhere(w, 'zwykly', () => true, key === 'zielonki' ? ['dom'] : ['blok']);
      sim.st.sasiedzi = { budynki: [nowyBudynek(w, 'zwykly', bid, null)], spotkanie: null, nr: 0, napis: null, n: 0 };
      sim.st.sasiedzi.budynki[0].przeszukane.push(0);
      expect(goal().done).toBe(true);
    }
  });
});
