/* Klocki gościa (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Klocki”): czyste dane i funkcje
   z src/gov/goscie.ts, bez hosta i bez stanu zarządu. Testy sprawdzają determinizm, wielkość i skład grupy (wspólne
   nazwisko rodziny, indeks ugryzionego), zgodność klocków z trybem i tabelą wykluczeń na 200 ziarnach, wagi (zima,
   napaści), wybór miejsca „skąd” z okolicy (strona wejścia, filtr nazw podobnych do osoby), teksty w obu językach
   (angielski bez polskich słów, trop każdego haczyka, bez pięter i numerów mieszkań). */

import { describe, expect, it } from 'vitest';
import { zawodEn } from '../../src/content/data.en.ts';
import { type Dom, NAMES, SEASONS, SURN } from '../../src/content/data.ts';
import { KAT_EN } from '../../src/content/miejsca.en.ts';
import { tx } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import {
  AMUNICJA,
  BRON,
  BRON_DEZERTERA,
  BRON_ZWYKLA,
  type ChceId,
  chceMozliwe,
  type Gosc,
  type HaczykId,
  haczykiMozliwe,
  KATEGORIA_SKAD,
  type KontekstGoscia,
  KTO,
  type KtoId,
  type MaId,
  maMozliwe,
  osobyGrupy,
  PROG_FACHU,
  SATYRA,
  skladGoscia,
  stronaMiejsca,
  tekstGoscia,
  tytulGoscia,
  wagaGoscia,
  wariantyGoscia,
  wygladaNaOsobe,
  ZIMA,
  zgodnyGosc,
} from '../../src/gov/goscie.ts';
import { BLOK, wordsEn, wordsOf } from '../../src/gov/miejsce.ts';
import type { GameMode, GovPlace } from '../../src/gov/typy.ts';
import { AMMO_EN, AMMO_NAMES, WEAPONS, WEAPONS_EN } from '../../src/sim/bron.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import { polskieSlowa } from './po-angielsku.ts';

const KTOS = Object.keys(KTO) as KtoId[];
const TRYBY: GameMode[] = ['zwykly', 'zombie'];
const HACZYKI: HaczykId[] = ['prawda', 'klamie', 'chory', 'poscig', 'ugryziony'];

const DOM_MIEJSCE: GovPlace = { ...BLOK, kind: 'dom', blocks: 0, houses: 4, near: 'domy' };
const SLOWA = [
  { nazwa: 'blok', s: wordsOf(BLOK), e: wordsEn(BLOK) },
  { nazwa: 'dom', s: wordsOf(DOM_MIEJSCE), e: wordsEn(DOM_MIEJSCE) },
];

const ctx = (over: Partial<KontekstGoscia> = {}): KontekstGoscia => ({
  mode: 'zwykly',
  pora: 'dzien',
  season: 0,
  zapasy: 10,
  okolica: [],
  znane: new Set<Dom>(),
  napady: 0,
  dom: false,
  ...over,
});

const miejsce = (klucz: string, kat: string, x: number, y: number, nazwa: string): Miejsce => ({
  klucz,
  kat,
  x,
  y,
  odl: Math.round(Math.sqrt(x * x + y * y)),
  nazwa,
});

/** licznik identyfikatorów osób jak w hoście zarządu */
const licznik = (od = 1) => {
  let n = od;
  return () => n++;
};

/** gość z ziarna: ten sam przebieg dla tych samych argumentów */
const gosc = (seed: number, c: KontekstGoscia = ctx(), n = 1): Gosc =>
  skladGoscia(mulberry(seed), n, c, new Set<string>());

/** wszystkie imiona, nazwiska i nazwy miejsc, które w angielskim tekście zostają po polsku */
const dozwolone = (g: Gosc, okolica: readonly Miejsce[] = []): string[] => [
  ...g.osoby.flatMap((p) => [p.name, p.first]),
  ...okolica.flatMap((m) => {
    // nazwa w tekście stoi po kategorii i bez jej słowa („Apteka Pod Różą” → „Pod Różą”): wolno też każdy jej koniec
    const slowa = m.nazwa.split(' ');
    return slowa.map((_, i) => slowa.slice(i).join(' '));
  }),
];

describe('klocki gościa: skład', () => {
  it('ten sam rng daje tego samego gościa', () => {
    for (const mode of TRYBY) {
      for (const seed of [1, 2, 3, 77, 4096]) {
        const c = ctx({ mode, season: seed % 4, okolica: [miejsce('poi:1:1', 'apteka', 5, -120, 'Apteka Nowa')] });
        const a = gosc(seed, c, 7);
        const b = gosc(seed, c, 7);
        expect(JSON.stringify(b), `${mode} ${seed}`).toBe(JSON.stringify(a));
        expect(a.id).toBe('g7');
      }
    }
    // inne ziarno to inny gość (nie zawsze, ale w dwudziestu próbach musi się coś zmienić)
    const rozne = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(gosc(i + 1))));
    expect(rozne.size).toBeGreaterThan(15);
  });

  it('wielkość grupy z KTO.ilu (wędrowiec 1, rodzina 3–5, ocaleni 2–4, z_ugryzionym 2), rodzina ma wspólne nazwisko (forma żeńska i męska), ugryziony to indeks w osoby', () => {
    expect(KTO.wedrowiec.ilu).toEqual([1, 1]);
    expect(KTO.rodzina.ilu).toEqual([3, 5]);
    expect(KTO.ocaleni.ilu).toEqual([2, 4]);
    expect(KTO.z_ugryzionym.ilu).toEqual([2, 2]);
    expect(KTO.dziecko.ilu).toEqual([1, 2]);
    for (const k of ['dezerter', 'uciekinier', 'chory', 'znajomy'] as const) expect(KTO[k].ilu).toEqual([1, 1]);

    const widziane = new Set<KtoId>();
    for (let seed = 1; seed <= 600; seed++) {
      const c = ctx({ mode: seed % 2 ? 'zombie' : 'zwykly', season: seed % 4 });
      const g = gosc(seed, c);
      widziane.add(g.kto);
      const [lo, hi] = KTO[g.kto].ilu;
      expect(g.osoby.length, `${g.kto} ${seed}`).toBeGreaterThanOrEqual(lo);
      expect(g.osoby.length, `${g.kto} ${seed}`).toBeLessThanOrEqual(hi);
      // mówiący ma wiek z tabeli archetypu
      const [wlo, whi] = KTO[g.kto].wiek;
      expect(g.osoby[0].age, `${g.kto} ${seed}`).toBeGreaterThanOrEqual(wlo);
      expect(g.osoby[0].age, `${g.kto} ${seed}`).toBeLessThanOrEqual(whi);
      // indeks ugryzionego wskazuje osobę z grupy, a bez ugryzienia pola nie ma
      if (g.haczyk === 'ugryziony') {
        expect(Number.isInteger(g.ugryziony)).toBe(true);
        expect(g.ugryziony!).toBeGreaterThanOrEqual(0);
        expect(g.ugryziony!).toBeLessThan(g.osoby.length);
      } else {
        expect(g.ugryziony).toBeUndefined();
      }
      // imiona w grupie się nie powtarzają
      expect(new Set(g.osoby.map((p) => p.first)).size, `${g.kto} ${seed}`).toBe(g.osoby.length);
      // osoby gościa są żywe, bez domu i bez zadań
      for (const p of g.osoby) {
        expect(p.dead || p.gone || p.sick).toBe(false);
        expect(p.home).toBe(-1);
        expect(p.assign).toBeNull();
      }
    }
    // wszystkie archetypy się trafiają (ocaleni i z_ugryzionym tylko w zombie)
    expect([...widziane].sort()).toEqual([...KTOS].sort());

    // rodzina: wspólne nazwisko mówiącego w formie męskiej albo żeńskiej, mieszana płeć
    let kobiety = 0;
    let mezczyzni = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rodzina = osobyGrupy(mulberry(seed), licznik(), 'rodzina', 3 + (seed % 3), new Set<string>());
      const nazwisko = (p: { name: string }) => p.name.split(' ').slice(1).join(' ');
      const para = SURN.find((s) => s.includes(nazwisko(rodzina[0])));
      expect(para, rodzina[0].name).toBeTruthy();
      for (const p of rodzina) {
        expect(nazwisko(p), `${p.name} (${rodzina[0].name})`).toBe(para![p.f ? 1 : 0]);
        if (p.f) kobiety++;
        else mezczyzni++;
      }
      // dorosły mówiący, partner, reszta to dzieci (4–15) albo dziadek lub babcia (65–85)
      expect(rodzina[0].age).toBeGreaterThanOrEqual(28);
      for (const p of rodzina.slice(2)) expect(p.age <= 15 || p.age >= 65, `${p.name} ${p.age}`).toBe(true);
      for (const p of rodzina.slice(2)) expect(p.age).toBeGreaterThanOrEqual(4);
      for (const p of rodzina.slice(2)) expect(p.age).toBeLessThanOrEqual(85);
    }
    expect(kobiety).toBeGreaterThan(30);
    expect(mezczyzni).toBeGreaterThan(30);

    // dowolna wielkość grupy dla kart z gościem (zadanie 11): 1–12 osób
    for (const kto of KTOS) {
      for (const ilu of [1, 2, 4, 8, 12]) {
        const grupa = osobyGrupy(mulberry(ilu * 31), licznik(40), kto, ilu, new Set(['Henryk', 'Halina']));
        expect(grupa.length, `${kto} ${ilu}`).toBe(ilu);
        expect(new Set(grupa.map((p) => p.id)).size, `${kto} ${ilu}`).toBe(ilu);
        expect(grupa.some((p) => p.first === 'Henryk' || p.first === 'Halina') && ilu < 5).toBe(false);
      }
    }
    // identyfikatory z licznika jak w makePerson
    const ids = osobyGrupy(mulberry(5), licznik(100), 'rodzina', 4, new Set<string>()).map((p) => p.id);
    expect(ids).toEqual(['s100', 's101', 's102', 's103']);
  });

  it('dziecko to dziecko, a z_ugryzionym ma bliskiego o indeksie 1', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = osobyGrupy(mulberry(seed), licznik(), 'dziecko', 2, new Set<string>());
      expect(d[0].age).toBeGreaterThanOrEqual(8);
      expect(d[0].age).toBeLessThanOrEqual(15);
      expect(d[1].age).toBeLessThanOrEqual(d[0].age);
      expect(d[1].age).toBeGreaterThanOrEqual(4);
      expect(d.every((p) => p.traits.length === 0 && p.prof === 'dziecko')).toBe(true);
    }
    let sprawdzone = 0;
    for (let seed = 1; seed <= 400 && sprawdzone < 20; seed++) {
      const g = gosc(seed, ctx({ mode: 'zombie' }));
      if (g.kto !== 'z_ugryzionym') continue;
      sprawdzone++;
      expect(g.haczyk).toBe('ugryziony');
      expect(g.ugryziony).toBe(1);
      expect(g.osoby).toHaveLength(2);
    }
    expect(sprawdzone).toBe(20);
  });

  it('200 gości z 200 ziaren: każdy kto/chce/ma/haczyk zgodny z trybem i tabelą wykluczeń', () => {
    const z = ctx;
    for (const mode of TRYBY) {
      for (let seed = 1; seed <= 200; seed++) {
        const g = gosc(
          seed,
          z({
            mode,
            season: seed % 4,
            pora: (['dzien', 'wieczor', 'noc'] as const)[seed % 3],
            dom: seed % 5 === 0,
            zapasy: seed % 40,
            napady: seed % 4,
          }),
        );
        const co = `${mode} ${seed} ${g.kto}/${g.chce}/${g.ma}/${g.haczyk}`;
        // tryb i tabela archetypu
        expect(KTO[g.kto].tryby, co).toContain(mode);
        expect(KTO[g.kto].chce, co).toContain(g.chce);
        expect(zgodnyGosc(g, mode), co).toBe(true);
        // wykluczenia spisane tu osobno, żeby test nie powtarzał tabeli z modułu
        if (g.kto === 'dziecko') expect(g.ma, co).not.toBe('fach');
        if (g.chce === 'dobic') expect(g.kto, co).toBe('z_ugryzionym');
        if (g.chce === 'dobic') expect(g.ma, co).toBe('nic');
        if (g.kto === 'z_ugryzionym') expect(g.haczyk, co).toBe('ugryziony');
        if (g.chce === 'wymiana') expect(['rzecz', 'wiadomosc'], co).toContain(g.ma);
        if (g.chce === 'wiadomosc') expect(['wiadomosc', 'ostrzezenie'], co).toContain(g.ma);
        if (g.chce === 'przechowac') expect(g.ma, co).toBe('rzecz');
        if (g.haczyk === 'klamie') {
          expect(g.ma, co).not.toBe('wiadomosc');
          expect(g.ma, co).not.toBe('ostrzezenie');
          expect(g.chce, co).not.toBe('wiadomosc');
        }
        if (g.haczyk === 'poscig') {
          expect(g.chce, co).not.toBe('wymiana');
          expect(g.chce, co).not.toBe('wiadomosc');
        }
        if (g.kto === 'chory') expect(g.haczyk, co).not.toBe('poscig');
        // rzecz tylko przy ma = rzecz; amunicja pasuje do broni, leki nie przy prośbie o leki
        if (g.ma === 'rzecz') {
          expect(g.rzecz, co).toBeTruthy();
          const r = g.rzecz!;
          expect(Boolean(r.arms) || Boolean(r.meds) || Boolean(r.ammo), co).toBe(true);
          if (g.chce === 'leki') expect(r.meds, co).toBeUndefined();
          if (r.arms === 'rewolwer' && r.ammo) expect(Object.keys(r.ammo), co).toEqual(['naboje']);
          if (r.arms === 'strzelba' && r.ammo) expect(Object.keys(r.ammo), co).toEqual(['loftki']);
          if (r.arms === 'kusza' && r.ammo) expect(Object.keys(r.ammo), co).toEqual(['belty']);
          for (const v of Object.values(r.ammo ?? {})) expect(v).toBeGreaterThan(0);
          if (g.kto === 'dziecko') expect(r.arms, co).toBeUndefined();
        } else {
          expect(g.rzecz, co).toBeUndefined();
        }
        // skąd: strona świata i nazwa w obu językach
        expect(['n', 'e', 's', 'w'], co).toContain(g.skad.strona);
        expect(g.skad.nazwa.pl, co).toBeTruthy();
        expect(g.skad.nazwa.en, co).toBeTruthy();
        // satyra: z tabeli, nigdy u ocalałych i u ludzi z ugryzionym bliskim
        if (g.satyra !== undefined) {
          expect(Object.keys(SATYRA), co).toContain(g.satyra);
          expect(['ocaleni', 'z_ugryzionym', 'dziecko'], co).not.toContain(g.kto);
        }
        // gość z fachem ma zawód z umiejętnością od progu modułu
        if (g.ma === 'fach')
          expect(
            Object.values(g.osoby[0].skills).some((v) => (v ?? 0) >= PROG_FACHU),
            co,
          ).toBe(true);
      }
    }
  });

  it('tabela wykluczeń zawsze zostawia wybór: dla każdego archetypu, trybu i haczyka jest chce i ma', () => {
    for (const mode of TRYBY) {
      for (const kto of KTOS.filter((k) => KTO[k].tryby.includes(mode))) {
        const haczyki = haczykiMozliwe(kto, mode);
        expect(haczyki.length, `${mode} ${kto}`).toBeGreaterThan(0);
        for (const haczyk of haczyki) {
          // haczyk trybu: ugryzienie tylko w zombie, kłamstwo i pościg tylko w zwykłym
          if (haczyk === 'ugryziony') expect(mode).toBe('zombie');
          if (haczyk === 'klamie' || haczyk === 'poscig') expect(mode).toBe('zwykly');
          const chce = chceMozliwe(kto, haczyk);
          expect(chce.length, `${mode} ${kto}/${haczyk}`).toBeGreaterThan(0);
          for (const c of chce) {
            expect(KTO[kto].chce, `${kto}/${c}`).toContain(c);
            expect(maMozliwe(kto, c, haczyk).length, `${mode} ${kto}/${haczyk}/${c}`).toBeGreaterThan(0);
          }
        }
      }
    }
    // tabela jest spójna z `zgodnyGosc`: złe pary odpadają
    const baza = { kto: 'dziecko', chce: 'jedzenie', ma: 'fach', haczyk: 'prawda' } as const;
    expect(zgodnyGosc(baza, 'zwykly')).toBe(false);
    expect(zgodnyGosc({ ...baza, ma: 'nic' }, 'zwykly')).toBe(true);
    expect(zgodnyGosc({ ...baza, ma: 'nic', kto: 'ocaleni' }, 'zwykly')).toBe(false);
    expect(zgodnyGosc({ ...baza, ma: 'nic', haczyk: 'ugryziony' }, 'zwykly')).toBe(false);
    expect(zgodnyGosc({ ...baza, ma: 'nic', haczyk: 'klamie' }, 'zombie')).toBe(false);
    expect(zgodnyGosc({ ...baza, ma: 'rzecz' }, 'zwykly')).toBe(false);
    expect(zgodnyGosc({ ...baza, ma: 'nic', chce: 'dobic' }, 'zwykly')).toBe(false);

    // wszystkie dozwolone pary naprawdę się trafiają w losowaniu (żadna ścieżka nie jest martwa)
    for (const mode of TRYBY) {
      const widziane = new Set<string>();
      for (let seed = 1; seed <= 3000; seed++) {
        const g = gosc(seed, ctx({ mode, season: seed % 4, zapasy: seed % 50, ostrzej: seed % 2 === 0 }));
        widziane.add(`${g.kto}/${g.haczyk}`);
        widziane.add(`${g.kto}/${g.chce}`);
        widziane.add(`${g.kto}/${g.ma}`);
      }
      for (const kto of KTOS.filter((k) => KTO[k].tryby.includes(mode))) {
        for (const chce of KTO[kto].chce) expect(widziane.has(`${kto}/${chce}`), `${mode} ${kto} ${chce}`).toBe(true);
        for (const h of haczykiMozliwe(kto, mode))
          expect(widziane.has(`${kto}/${h}`), `${mode} ${kto} ${h}`).toBe(true);
      }
    }
  });

  it('ugryziony i ocaleni tylko w zombie, kłamie i pościg tylko w zwykłym', () => {
    const licz = (mode: GameMode) => {
      const wynik = { ugryziony: 0, ocaleni: 0, z_ugryzionym: 0, klamie: 0, poscig: 0, wszystkich: 0 };
      for (let seed = 1; seed <= 1200; seed++) {
        const g = gosc(seed, ctx({ mode, season: seed % 4 }));
        wynik.wszystkich++;
        if (g.haczyk === 'ugryziony') wynik.ugryziony++;
        if (g.haczyk === 'klamie') wynik.klamie++;
        if (g.haczyk === 'poscig') wynik.poscig++;
        if (g.kto === 'ocaleni') wynik.ocaleni++;
        if (g.kto === 'z_ugryzionym') wynik.z_ugryzionym++;
      }
      return wynik;
    };
    const zwykly = licz('zwykly');
    expect(zwykly.ugryziony + zwykly.ocaleni + zwykly.z_ugryzionym).toBe(0);
    expect(zwykly.klamie).toBeGreaterThan(50);
    expect(zwykly.poscig).toBeGreaterThan(50);
    const zombie = licz('zombie');
    expect(zombie.klamie + zombie.poscig).toBe(0);
    expect(zombie.ugryziony).toBeGreaterThan(100);
    expect(zombie.ocaleni).toBeGreaterThan(100);
    expect(zombie.z_ugryzionym).toBeGreaterThan(50);
  });

  it('zimą chory częściej niż latem (1000 losowań)', () => {
    const chorych = (season: number) => {
      let kto = 0;
      let haczyk = 0;
      const rng = mulberry(9000 + season);
      for (let i = 0; i < 1000; i++) {
        const g = skladGoscia(rng, i + 1, ctx({ season }), new Set<string>());
        if (g.kto === 'chory') kto++;
        if (g.haczyk === 'chory') haczyk++;
      }
      return { kto, haczyk };
    };
    expect(ZIMA).toBe(SEASONS.indexOf('zima'));
    const zima = chorych(ZIMA);
    const lato = chorych(SEASONS.indexOf('lato'));
    expect(zima.kto).toBeGreaterThan(lato.kto * 1.4);
    expect(zima.haczyk).toBeGreaterThan(lato.haczyk * 1.4);
  });

  it('dużo jedzenia w zapasie: częściej kłamie; narrator po spokoju: częściej haczyk', () => {
    const klamie = (zapasy: number) => {
      const rng = mulberry(31337);
      let n = 0;
      for (let i = 0; i < 1500; i++)
        if (skladGoscia(rng, i, ctx({ zapasy }), new Set<string>()).haczyk === 'klamie') n++;
      return n;
    };
    expect(klamie(40)).toBeGreaterThan(klamie(20) * 1.15);
    // 20 to jeszcze nie „więcej niż 20”
    expect(klamie(20)).toBe(klamie(0));
    const haczyki = (ostrzej: boolean) => {
      const rng = mulberry(555);
      let n = 0;
      for (let i = 0; i < 1500; i++) {
        if (skladGoscia(rng, i, ctx({ ostrzej }), new Set<string>()).haczyk !== 'prawda') n++;
      }
      return n;
    };
    expect(haczyki(true)).toBeGreaterThan(haczyki(false) * 1.1);
  });

  it('każda napaść odbiera 20% szansy na gościa', () => {
    expect(wagaGoscia(ctx())).toBe(1);
    expect(wagaGoscia(ctx({ napady: 1 }))).toBeCloseTo(0.8, 10);
    expect(wagaGoscia(ctx({ napady: 2 }))).toBeCloseTo(0.64, 10);
    expect(wagaGoscia(ctx({ napady: 3 }))).toBeCloseTo(0.512, 10);
    // nigdy do zera: po wielu napaściach goście dalej bywają
    expect(wagaGoscia(ctx({ napady: 50 }))).toBeGreaterThan(0);
    expect(wagaGoscia(ctx({ napady: 50 }))).toBeLessThan(0.3);
    for (let n = 0; n < 12; n++)
      expect(wagaGoscia(ctx({ napady: n + 1 }))).toBeLessThan(wagaGoscia(ctx({ napady: n })));
  });
});

describe('klocki gościa: skąd', () => {
  const okolica: Miejsce[] = [
    // północ: bliska apteka z nazwą i dalsza przychodnia
    miejsce('poi:n2', 'przychodnia', 3, -400, ''),
    miejsce('poi:n1', 'apteka', 10, -200, 'Apteka Pod Różą'),
    // wschód: sklep z nazwą wyglądającą na osobę, która mogła przejść filtr (brak tabel imion)
    miejsce('poi:e1', 'spozywczy', 300, 20, 'Henryk Nowak'),
    // południe: bank
    miejsce('poi:s1', 'bank', -5, 150, 'Bank Bufor'),
    // zachód: miejsce na przekątnej, dominuje oś x (|x| > |y|)
    miejsce('poi:w1', 'kosciol', -100, 60, 'u Zbyszka'),
    // miejsce z nieznaną kategorią i z nazwą równą kategorii
    miejsce('poi:s2', 'cos_dziwnego', 20, 400, 'Sklep'),
  ];

  it('skąd bierze miejsce z okolicy od strony wejścia, bez nazwy, która wygląda na imię i nazwisko', () => {
    const wedlug: Partial<Record<string, Gosc[]>> = {};
    for (let seed = 1; seed <= 400; seed++) {
      const g = gosc(seed, ctx({ okolica }));
      (wedlug[g.skad.strona] ??= []).push(g);
    }
    for (const s of ['n', 'e', 's', 'w']) expect(wedlug[s]?.length, s).toBeGreaterThan(40);

    // północ: najbliższe miejsce od tej strony (apteka, nie przychodnia), z nazwą
    for (const g of wedlug.n!) {
      expect(g.skad.klucz).toBe('poi:n1');
      // kategoria, potem nazwa w cudzysłowie bez słowa kategorii, które już stoi przed nią
      expect(g.skad.nazwa.pl).toBe('od strony apteki „Pod Różą”');
      expect(g.skad.nazwa.en).toBe('from the direction of the pharmacy “Pod Różą”');
    }
    // wschód: nazwa jak imię i nazwisko odpada, zostaje sama kategoria (RODO), klucz miejsca zostaje
    for (const g of wedlug.e!) {
      expect(g.skad.klucz).toBe('poi:e1');
      expect(g.skad.nazwa.pl).toContain('sklepu spożywczego');
      expect(g.skad.nazwa.pl).not.toMatch(/Henryk|Nowak/);
      expect(g.skad.nazwa.en).toContain('the food shop');
      expect(g.skad.nazwa.en).not.toMatch(/Henryk|Nowak/);
    }
    // południe: najbliższy bank (|y| = 150), nie dalszy sklep; nazwa marki zostaje
    for (const g of wedlug.s!) {
      expect(g.skad.klucz).toBe('poi:s1');
      expect(g.skad.nazwa.pl).toBe('od strony banku „Bufor”');
      expect(g.skad.nazwa.en).toBe('from the direction of the bank “Bufor”');
    }
    // zachód: miejsce na przekątnej wpada na oś x, a „u Zbyszka” to właściciel: tylko kategoria
    for (const g of wedlug.w!) {
      expect(g.skad.klucz).toBe('poi:w1');
      expect(g.skad.nazwa.pl).toContain('kościoła');
      expect(g.skad.nazwa.pl).not.toContain('Zbyszka');
      expect(g.skad.nazwa.en).toContain('the church');
    }
    // nazwa równa kategorii nie powtarza się w nawiasie, nieznana kategoria to sklep
    const tylkoSklep = [miejsce('poi:x', 'cos_dziwnego', 0, 300, 'Sklep')];
    for (let seed = 1; seed <= 80; seed++) {
      const g = gosc(seed, ctx({ okolica: tylkoSklep }));
      if (g.skad.strona !== 's') continue;
      expect(g.skad.nazwa.pl).toBe('od strony sklepu');
      expect(g.skad.nazwa.en).toBe('from the direction of the shop');
    }
  });

  it('bez miejsca po tej stronie skąd to kierunek świata, bez klucza', () => {
    const tylkoPolnoc = [miejsce('poi:n1', 'apteka', 0, -100, 'Apteka')];
    const kierunki: Record<string, { pl: string; en: string }> = {
      e: { pl: 'ze wschodu', en: 'from the east' },
      s: { pl: 'z południa', en: 'from the south' },
      w: { pl: 'z zachodu', en: 'from the west' },
    };
    const widziane = new Set<string>();
    for (const okol of [[], tylkoPolnoc]) {
      for (let seed = 1; seed <= 200; seed++) {
        const g = gosc(seed, ctx({ okolica: okol }));
        widziane.add(g.skad.strona);
        if (okol.length && g.skad.strona === 'n') {
          expect(g.skad.klucz).toBe('poi:n1');
          continue;
        }
        expect(g.skad.klucz).toBeUndefined();
        if (g.skad.strona === 'n') {
          expect(g.skad.nazwa).toEqual({ pl: 'z północy', en: 'from the north' });
        } else {
          expect(g.skad.nazwa).toEqual(kierunki[g.skad.strona]);
        }
      }
    }
    expect([...widziane].sort()).toEqual(['e', 'n', 's', 'w']);
  });

  it('nazwa podobna do osoby odpada też wtedy, gdy miejsce ma tylko imię albo samo nazwisko', () => {
    const lista = [
      'Krzysztof Wiśniewski',
      'Halina Kowalska',
      'Wiśniewski',
      'Gabinet Kowalskiego',
      'Hydraulik Marka Króla',
      'Dr Nowak',
      'Zakład u Henryka',
    ];
    for (const nazwa of lista) {
      for (const strona of ['n', 'e', 's', 'w'] as const) {
        const pozycje = { n: [0, -50], e: [50, 0], s: [0, 50], w: [-50, 0] }[strona];
        const m = miejsce('poi:t', 'sklep', pozycje[0], pozycje[1], nazwa);
        let znaleziono = false;
        for (let seed = 1; seed <= 60 && !znaleziono; seed++) {
          const g = gosc(seed, ctx({ okolica: [m] }));
          if (g.skad.strona !== strona) continue;
          znaleziono = true;
          expect(g.skad.klucz).toBe('poi:t');
          expect(g.skad.nazwa.pl, nazwa).not.toContain(nazwa);
          expect(g.skad.nazwa.en, nazwa).not.toContain(nazwa);
        }
        expect(znaleziono, `${nazwa} ${strona}`).toBe(true);
      }
    }
    // zwykła marka zostaje
    const marka = miejsce('poi:m', 'spozywczy', 0, -60, 'Żabka');
    const g = [...Array(80).keys()]
      .map((i) => gosc(i + 1, ctx({ okolica: [marka] })))
      .find((x) => x.skad.strona === 'n')!;
    expect(g.skad.nazwa.pl).toContain('Żabka');
  });
});

describe('klocki gościa: teksty', () => {
  /** gość o zadanych klockach: pierwszy z ziaren, który je ma */
  const zKlockami = (
    szukane: Partial<Pick<Gosc, 'kto' | 'chce' | 'ma' | 'haczyk'>>,
    mode: GameMode = 'zwykly',
    c: Partial<KontekstGoscia> = {},
  ): Gosc => {
    for (let seed = 1; seed <= 20000; seed++) {
      const g = gosc(seed, ctx({ mode, season: seed % 4, ...c }));
      if ((Object.keys(szukane) as (keyof typeof szukane)[]).every((k) => g[k] === szukane[k])) return g;
    }
    throw new Error(`brak gościa ${JSON.stringify(szukane)} w trybie ${mode}`);
  };

  it('tekstGoscia po angielsku bez polskich słów (lista z zarzad-jezyk)', () => {
    const okolica = [
      miejsce('poi:n1', 'apteka', 10, -200, 'Apteka Pod Różą'),
      miejsce('poi:e1', 'spozywczy', 300, 20, 'Żabka'),
      miejsce('poi:s1', 'stacja', -5, 150, 'Stacja Paliw Łódź'),
    ];
    let sprawdzonych = 0;
    for (const mode of TRYBY) {
      for (let seed = 1; seed <= 300; seed++) {
        const g = gosc(seed, ctx({ mode, season: seed % 4, okolica: seed % 2 ? okolica : [] }));
        const wolno = dozwolone(g, okolica);
        for (const { nazwa, s, e } of SLOWA) {
          const t = tekstGoscia(g, s, e);
          const tytul = tytulGoscia(g, s, e);
          const co = `${nazwa} ${mode} ${seed} ${g.kto}/${g.chce}/${g.ma}/${g.haczyk}`;
          expect(t.pl, co).toBeTruthy();
          expect(t.en, co).toBeTruthy();
          expect(polskieSlowa(t.en, wolno), `${co}: ${t.en}`).toEqual([]);
          expect(polskieSlowa(tytul.en, wolno), `${co}: ${tytul.en}`).toEqual([]);
          // polski tekst jest po polsku, angielski po angielsku
          expect(t.pl).not.toBe(t.en);
          sprawdzonych++;
        }
      }
    }
    expect(sprawdzonych).toBe(1200);
    // wszystkie warianty wszystkich klocków, nie tylko ten, który wybrało ziarno
    for (const mode of TRYBY) {
      for (let seed = 1; seed <= 120; seed++) {
        const g = gosc(seed, ctx({ mode, season: seed % 4, okolica }));
        for (const { nazwa, s, e } of SLOWA) {
          const w = wariantyGoscia(g, s, e);
          for (const t of [...w.kto, ...w.chce, ...w.ma, ...w.trop, ...(w.satyra ? [w.satyra] : [])]) {
            expect(polskieSlowa(t.en, dozwolone(g, okolica)), `${nazwa} ${seed}: ${t.en}`).toEqual([]);
            expect(t.pl).not.toBe(t.en);
          }
        }
      }
    }
    // wszystkie linijki satyry
    for (const [id, t] of Object.entries(SATYRA)) {
      expect(polskieSlowa(t.en), id).toEqual([]);
      expect(t.pl, id).not.toBe(t.en);
    }
  });

  it('trop haczyka: każdy haczyk ma co najmniej 3 zdania tropu w obu językach', () => {
    for (const haczyk of HACZYKI) {
      const g = zKlockami({ haczyk }, haczyk === 'ugryziony' ? 'zombie' : 'zwykly');
      for (const { nazwa, s, e } of SLOWA) {
        const trop = wariantyGoscia(g, s, e).trop;
        expect(trop.length, `${haczyk} ${nazwa}`).toBeGreaterThanOrEqual(3);
        for (const lang of ['pl', 'en'] as const) {
          const teksty = trop.map((t) => t[lang]);
          expect(new Set(teksty).size, `${haczyk} ${lang}`).toBe(teksty.length);
          for (const t of teksty) {
            expect(t.length, `${haczyk} ${lang}`).toBeGreaterThan(12);
            expect(t, `${haczyk} ${lang}`).toMatch(/[.!?”]$/);
          }
        }
      }
    }
    // trop wybrany przez tekstGoscia to jeden z wariantów, a różni goście dostają różne
    const g = zKlockami({ haczyk: 'klamie' });
    const trop = wariantyGoscia(g, SLOWA[0].s, SLOWA[0].e).trop;
    expect(trop.some((t) => tekstGoscia(g, SLOWA[0].s, SLOWA[0].e).pl.includes(t.pl))).toBe(true);
    const uzyte = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const x = gosc(seed);
      if (x.haczyk !== 'klamie') continue;
      const t = tekstGoscia(x, SLOWA[0].s, SLOWA[0].e).pl;
      const w = wariantyGoscia(x, SLOWA[0].s, SLOWA[0].e).trop.findIndex((v) => t.includes(v.pl));
      expect(w).toBeGreaterThanOrEqual(0);
      uzyte.add(String(w));
    }
    expect(uzyte.size).toBe(3);
  });

  it('każdy kto, chce i ma ma po 3 warianty w obu językach, satyra ma 8 linijek', () => {
    for (const kto of KTOS) {
      const tryb: GameMode = KTO[kto].tryby.includes('zwykly') ? 'zwykly' : 'zombie';
      const g = zKlockami({ kto }, tryb);
      const w = wariantyGoscia(g, SLOWA[0].s, SLOWA[0].e);
      expect(w.kto, kto).toHaveLength(3);
      expect(new Set(w.kto.map((t) => t.pl)).size, kto).toBe(3);
      expect(new Set(w.kto.map((t) => t.en)).size, kto).toBe(3);
    }
    const chce: ChceId[] = ['nocleg', 'jedzenie', 'leki', 'wymiana', 'dolaczyc', 'przechowac', 'wiadomosc', 'dobic'];
    for (const c of chce) {
      const g = zKlockami({ chce: c }, c === 'dobic' ? 'zombie' : 'zwykly');
      const w = wariantyGoscia(g, SLOWA[0].s, SLOWA[0].e);
      expect(w.chce, c).toHaveLength(3);
      expect(new Set(w.chce.map((t) => t.pl)).size, c).toBe(3);
      expect(new Set(w.chce.map((t) => t.en)).size, c).toBe(3);
    }
    const ma: MaId[] = ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'];
    for (const m of ma) {
      const g = zKlockami({ ma: m });
      const w = wariantyGoscia(g, SLOWA[0].s, SLOWA[0].e);
      expect(w.ma, m).toHaveLength(3);
      expect(new Set(w.ma.map((t) => t.pl)).size, m).toBe(3);
      expect(new Set(w.ma.map((t) => t.en)).size, m).toBe(3);
    }
    expect(Object.keys(SATYRA)).toHaveLength(8);
    for (const t of Object.values(SATYRA)) {
      expect(t.pl.length).toBeGreaterThan(30);
      expect(t.en.length).toBeGreaterThan(30);
    }
  });

  it('satyra o dawnych czasach dotyka abonamentu, paczkomatu, hulajnogi, tokena i opaski do snu', () => {
    const wszystko = Object.values(SATYRA)
      .map((t) => t.pl.toLowerCase())
      .join(' ');
    for (const slowo of ['abonament', 'paczkomat', 'hulajnog', 'token', 'opask']) expect(wszystko).toContain(slowo);
    // bez pauz i myślników w tekście gry, bez prawdziwych nazwisk i firm
    for (const t of Object.values(SATYRA)) {
      expect(t.pl).not.toMatch(/[—–]/);
      expect(t.en).not.toMatch(/[—–]/);
    }
  });

  it('tytuł: kto pod bramą albo furtką, w obu językach, bez zdradzania haczyka', () => {
    const bramy = [
      { s: SLOWA[0].s, e: SLOWA[0].e, pl: 'bramą', en: 'the gate' },
      { s: SLOWA[1].s, e: SLOWA[1].e, pl: 'furtką', en: 'the garden gate' },
    ];
    for (const kto of KTOS) {
      const tryb: GameMode = KTO[kto].tryby.includes('zwykly') ? 'zwykly' : 'zombie';
      for (const haczyk of HACZYKI) {
        let g: Gosc;
        try {
          g = zKlockami({ kto, haczyk }, tryb);
        } catch {
          continue;
        }
        for (const b of bramy) {
          const t = tytulGoscia(g, b.s, b.e);
          expect(t.pl, `${kto}`).toContain(b.pl);
          expect(t.en, `${kto}`).toContain(b.en);
          expect(t.pl.toLowerCase()).not.toMatch(/kłam|ugryz|choro?y.*zaraz/);
          expect(t.en.toLowerCase()).not.toMatch(/lie|liar|bitten|infect/);
        }
      }
    }
    // pojedynczy gość w rodzaju żeńskim i męskim, grupa w liczbie mnogiej
    const kobieta = [...Array(300).keys()].map((i) => gosc(i + 1)).find((x) => x.kto === 'wedrowiec' && x.osoby[0].f)!;
    const mezczyzna = [...Array(300).keys()]
      .map((i) => gosc(i + 1))
      .find((x) => x.kto === 'wedrowiec' && !x.osoby[0].f)!;
    expect(tytulGoscia(kobieta, SLOWA[0].s, SLOWA[0].e).pl).toBe('Wędrowniczka pod bramą');
    expect(tytulGoscia(mezczyzna, SLOWA[0].s, SLOWA[0].e).pl).toBe('Wędrowiec pod bramą');
    expect(tytulGoscia(mezczyzna, SLOWA[0].s, SLOWA[0].e).en).toBe('A drifter at the gate');
    const rodzina = [...Array(300).keys()].map((i) => gosc(i + 1)).find((x) => x.kto === 'rodzina')!;
    expect(tytulGoscia(rodzina, SLOWA[1].s, SLOWA[1].e).pl).toBe('Rodzina pod furtką');
    expect(tytulGoscia(rodzina, SLOWA[1].s, SLOWA[1].e).en).toBe('A family at the garden gate');
  });

  it('tekst jest deterministyczny, zgodny z grupą i bez pięter, numerów mieszkań i pauz', () => {
    for (const mode of TRYBY) {
      for (let seed = 1; seed <= 200; seed++) {
        const g = gosc(seed, ctx({ mode, season: seed % 4 }));
        for (const { s, e } of SLOWA) {
          const t = tekstGoscia(g, s, e);
          expect(JSON.stringify(tekstGoscia(g, s, e))).toBe(JSON.stringify(t));
          for (const lang of ['pl', 'en'] as const) {
            const tekst = t[lang];
            const co = `${mode} ${seed} ${g.kto}/${g.chce}/${g.ma}/${g.haczyk} ${lang}: ${tekst}`;
            expect(tekst, co).not.toMatch(/ {2}|\.\.|,,| ,|\s\.|undefined|NaN|\[object/);
            expect(tekst, co).not.toMatch(/[—–]/);
            expect(tekst, co).not.toMatch(/piętr|\d+(?:st|nd|rd|th) floor|mieszkani[eua]\s+\d|flat\s+\d|\bnr\s*\d/i);
            expect(tekst, co).toMatch(/[.!?”]$/);
            // imię pionka mówiącego w tekście jest imieniem tego pionka, a nie wymyślonym
            const imiona = [...NAMES.m, ...NAMES.f];
            const wymienione = imiona.filter((i) => new RegExp(`(^|[^\\p{L}])${i}([^\\p{L}]|$)`, 'u').test(tekst));
            for (const i of wymienione)
              expect(
                g.osoby.map((p) => p.first),
                `${co} (${i})`,
              ).toContain(i);
          }
        }
        // liczba osób w tekście rodziny zgadza się z liczbą pionków
        if (g.kto === 'rodzina') {
          const liczby = [...tekstGoscia(g, SLOWA[0].s, SLOWA[0].e).pl.matchAll(/(\d+) osó?b|(\d+) osoby/g)];
          for (const m of liczby) expect(Number(m[1] ?? m[2])).toBe(g.osoby.length);
        }
      }
    }
  });

  it('ugryziony bliski: tekst z_ugryzionym zna imię bliskiego, a prośba o dobicie mówi to wprost', () => {
    const g = zKlockami({ kto: 'z_ugryzionym', chce: 'dobic' }, 'zombie');
    const bliski = g.osoby[g.ugryziony!];
    const w = wariantyGoscia(g, SLOWA[0].s, SLOWA[0].e);
    for (const t of w.chce) expect(t.pl.length).toBeGreaterThan(20);
    // ugryzienie jest tu jawne, więc trop go nie ukrywa (nie ma rękawa naciągniętego na dłoń) i nazywa bliskiego po imieniu
    expect(w.trop.map((t) => t.pl).join(' ')).not.toMatch(/naciągnięty|zmienia temat|schodzi na pogodę/);
    expect(w.trop.map((t) => t.pl).join(' ')).toContain(bliski.first);
    expect(tekstGoscia(g, SLOWA[0].s, SLOWA[0].e).pl).toContain(bliski.first);
    // w tej scenie nikt nie mówi, co ma w kieszeniach
    const calosc = tekstGoscia(g, SLOWA[0].s, SLOWA[0].e);
    for (const t of w.ma) {
      expect(calosc.pl).not.toContain(t.pl);
      expect(calosc.en).not.toContain(t.en);
    }
    expect(tekstGoscia(g, SLOWA[0].s, SLOWA[0].e).en).toContain(bliski.first);
    // ocaleni to TWD, bez satyry
    for (let seed = 1; seed <= 200; seed++) {
      const x = gosc(seed, ctx({ mode: 'zombie' }));
      if (x.kto === 'ocaleni' || x.kto === 'z_ugryzionym') expect(x.satyra).toBeUndefined();
    }
  });

  it('rzecz w tekście: broń, amunicja i leki z pola rzecz, a fach z zawodu mówiącego', () => {
    const z = zKlockami({ ma: 'rzecz', kto: 'dezerter' });
    const pl = wariantyGoscia(z, SLOWA[0].s, SLOWA[0].e)
      .ma.map((t) => t.pl)
      .join(' ');
    const r = z.rzecz!;
    expect(r.arms || r.meds || r.ammo).toBeTruthy();
    expect(pl.length).toBeGreaterThan(30);
    const f = zKlockami({ ma: 'fach', kto: 'rodzina' });
    const wf = wariantyGoscia(f, SLOWA[0].s, SLOWA[0].e).ma;
    expect(wf.some((t) => t.pl.toLowerCase().includes(f.osoby[0].prof.toLowerCase()))).toBe(true);
    // fach: mówiący zna dziedzinę, której zarząd jeszcze nie zna (gdy taka jest)
    const znane = new Set<Dom>(['bud', 'cieplo', 'elek', 'med']);
    let nowe = 0;
    let razem = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const g = gosc(seed, ctx({ znane }));
      if (g.ma !== 'fach') continue;
      razem++;
      const dziedziny = Object.entries(g.osoby[0].skills).filter(([, v]) => (v ?? 0) >= 2);
      if (dziedziny.some(([d]) => !znane.has(d as Dom))) nowe++;
    }
    expect(razem).toBeGreaterThan(20);
    expect(nowe / razem).toBeGreaterThan(0.6);
  });

  it('pora, miejsce i tryb zmieniają wagi, nie zgodność: w domu nocą dalej tylko dozwolone pary', () => {
    for (const pora of ['dzien', 'wieczor', 'noc'] as const) {
      for (const dom of [false, true]) {
        for (let seed = 1; seed <= 60; seed++) {
          const g = gosc(seed, ctx({ pora, dom, mode: seed % 2 ? 'zombie' : 'zwykly' }));
          expect(zgodnyGosc(g, seed % 2 ? 'zombie' : 'zwykly')).toBe(true);
        }
      }
    }
  });
});

describe('klocki gościa: pełne pokrycie tekstów i drobiazgi', () => {
  /** gość złożony ręcznie z podanych klocków (bez losowania klocków), z osobami archetypu */
  const reczny = (kto: KtoId, chce: ChceId, ma: MaId, haczyk: HaczykId, ilu: number, seed: number): Gosc => ({
    id: 'g1',
    osoby: osobyGrupy(mulberry(seed), licznik(), kto, ilu, new Set<string>()),
    kto,
    chce,
    ma,
    haczyk,
    skad: {
      strona: 'n',
      klucz: 'poi:n1',
      nazwa: tx('od strony apteki „Pod Różą”', 'from the direction of the pharmacy “Pod Różą”'),
    },
    ...(haczyk === 'ugryziony' ? { ugryziony: ilu > 1 ? 1 : 0 } : {}),
    ...(ma === 'rzecz' ? { rzecz: { arms: 'kusza', ammo: { belty: 6 } } } : {}),
  });

  it('wszystkie warianty zdań każdego klocka dla obu płci i wielkości grup: po angielsku bez polskich słów, bez pustych miejsc', () => {
    const chce: ChceId[] = ['nocleg', 'jedzenie', 'leki', 'wymiana', 'dolaczyc', 'przechowac', 'wiadomosc', 'dobic'];
    const ma: MaId[] = ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'];
    // zdanie zależy od jednego klocka naraz (plus osoby i skąd), więc każdy klocek idzie osobno z neutralnymi pozostałymi
    const przypadki: [ChceId, MaId, HaczykId][] = [
      ...chce.map((c): [ChceId, MaId, HaczykId] => [c, 'nic', 'prawda']),
      ...ma.map((m): [ChceId, MaId, HaczykId] => ['nocleg', m, 'prawda']),
      ...HACZYKI.map((h): [ChceId, MaId, HaczykId] => ['nocleg', 'nic', h]),
    ];
    const bledy: string[] = [];
    let liczba = 0;
    const plec = new Set<string>();
    for (const kto of KTOS) {
      for (const ilu of [1, 2, 4]) {
        for (const seed of [3, 4, 5, 6, 7, 8, 9, 10]) {
          for (const [c, m, h] of przypadki) {
            const g = reczny(kto, c, m, h, ilu, seed);
            plec.add(`${kto}/${g.osoby[0].f}`);
            const wolno = [...g.osoby.flatMap((p) => [p.name, p.first]), 'Pod Różą'];
            for (const { nazwa, s, e } of SLOWA) {
              const w = wariantyGoscia(g, s, e);
              for (const t of [...w.kto, ...w.chce, ...w.ma, ...w.trop]) {
                const co = `${nazwa} ${kto}/${c}/${m}/${h} ilu=${ilu}: ${t.en}`;
                liczba++;
                if (polskieSlowa(t.en, wolno).length) bledy.push(`polskie słowa ${co}`);
                if (!/[.!?”]$/.test(t.pl) || !/[.!?”]$/.test(t.en)) bledy.push(`bez kropki ${co}`);
                for (const tekst of [t.pl, t.en]) {
                  if (/undefined|NaN|\[object|\$\{| {2}|\s,|\.\./.test(tekst)) bledy.push(`śmieci ${co} ${tekst}`);
                }
                if (t.pl === t.en) bledy.push(`ten sam tekst ${co}`);
              }
            }
          }
        }
      }
    }
    expect(bledy.slice(0, 5)).toEqual([]);
    expect(liczba).toBeGreaterThan(20000);
    // obie płci mówiącego dla każdego archetypu
    for (const kto of KTOS) {
      expect(plec.has(`${kto}/true`) && plec.has(`${kto}/false`), kto).toBe(true);
    }
  });

  it('wybór wariantu rozkłada się na wszystkie trzy i na różne kombinacje zdań', () => {
    const uzyte = [new Set<number>(), new Set<number>(), new Set<number>(), new Set<number>()];
    const kombinacje = new Set<string>();
    for (let seed = 1; seed <= 900; seed++) {
      const g = reczny('wedrowiec', 'nocleg', 'nic', 'prawda', 1, 11);
      g.id = `g${seed}`;
      const { s, e } = SLOWA[0];
      const w = wariantyGoscia(g, s, e);
      const t = tekstGoscia(g, s, e).pl;
      const idx = [w.kto, w.chce, w.ma, w.trop].map((v) => v.findIndex((x) => t.includes(x.pl)));
      idx.forEach((v, i) => {
        expect(v, `slot ${i}`).toBeGreaterThanOrEqual(0);
        uzyte[i].add(v);
      });
      kombinacje.add(idx.join(''));
    }
    for (const u of uzyte) expect(u.size).toBe(3);
    expect(kombinacje.size).toBeGreaterThanOrEqual(70);
  });

  it('strona miejsca: oś dominująca, remis idzie na oś y, bez trygonometrii', () => {
    expect(stronaMiejsca(0, -10)).toBe('n');
    expect(stronaMiejsca(0, 10)).toBe('s');
    expect(stronaMiejsca(10, 0)).toBe('e');
    expect(stronaMiejsca(-10, 0)).toBe('w');
    expect(stronaMiejsca(50, -50)).toBe('n');
    expect(stronaMiejsca(50, 50)).toBe('s');
    expect(stronaMiejsca(-50, 50)).toBe('s');
    expect(stronaMiejsca(-51, 50)).toBe('w');
    expect(stronaMiejsca(51, -50)).toBe('e');
    expect(stronaMiejsca(0, 0)).toBe('s');
  });

  it('imiona zajęte na osiedlu nie wracają u gościa, a identyfikatory osób nie kolidują z s<n>', () => {
    const zajete = new Set([...NAMES.m.slice(0, 10), ...NAMES.f.slice(0, 10)]);
    const ids = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const g = skladGoscia(mulberry(seed), seed, ctx({ mode: seed % 2 ? 'zombie' : 'zwykly' }), zajete);
      for (const [i, p] of g.osoby.entries()) {
        expect(zajete.has(p.first), `${seed} ${p.name}`).toBe(false);
        expect(p.id).toBe(`g${seed}p${i}`);
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
    }
  });

  it('tablice kategorii miejsc mają dokładnie te klucze co KAT_EN', () => {
    expect(Object.keys(KATEGORIA_SKAD).sort()).toEqual(Object.keys(KAT_EN).sort());
    for (const [k, t] of Object.entries(KATEGORIA_SKAD)) {
      expect(t.en, k).toMatch(/^the /);
      // angielska nazwa kategorii jest w tym samym miejscu co w KAT_EN (bez rodzajnika i wielkości liter)
      const nazwa = KAT_EN[k].toLowerCase();
      const tutaj = t.en.replace(/^the /, '');
      expect(
        nazwa.split(' ').some((slowo) => tutaj.includes(slowo.replace(/s$/, ''))),
        `${k}: ${nazwa} / ${tutaj}`,
      ).toBe(true);
    }
  });

  it('filtr nazw: zwykłe marki i lokale zostają, osoby odpadają', () => {
    for (const ok of [
      'Żabka',
      'Biedronka',
      'Apteka Pod Różą',
      'Nowa Apteka',
      'Bank Bufor',
      'Stacja Paliw Łódź',
      'Pod Orłem',
    ]) {
      expect(wygladaNaOsobe(ok), ok).toBe(false);
    }
    for (const zle of [
      'Marek Nowak',
      'u Marka',
      'Zakład Nowaka',
      'Salon Kowalskiego',
      'Gabinet lek. Wójcik',
      'Halina Kowalska',
    ]) {
      expect(wygladaNaOsobe(zle), zle).toBe(true);
    }
  });
});

describe('klocki gościa: poprawki po przeglądzie (runda 1)', () => {
  const reczny = (kto: KtoId, chce: ChceId, ma: MaId, haczyk: HaczykId, ilu: number, seed: number): Gosc => ({
    id: 'g1',
    osoby: osobyGrupy(mulberry(seed), licznik(), kto, ilu, new Set<string>()),
    kto,
    chce,
    ma,
    haczyk,
    skad: { strona: 'n', klucz: 'poi:n1', nazwa: tx('z północy', 'from the north') },
    ...(haczyk === 'ugryziony' ? { ugryziony: ilu > 1 ? 1 : 0 } : {}),
    ...(ma === 'rzecz' ? { rzecz: { arms: 'kusza', ammo: { belty: 6 } } } : {}),
  });
  const SEDY = [3, 4, 5, 6, 7, 8, 9, 10];
  const { s: S, e: E } = SLOWA[0];

  // ---- 1. „nic” nie przeczy torbom ani kieszeniom

  const TORBA_PL = /plecak|worek|torb|wózek|bagaż|zawiniątk|tobołek/i;
  const TORBA_EN = /rucksack|sack|\bbag\b|pram|luggage|bundle|belongings/i;
  const BRAK_TORBY_PL = /ani torb|bez torb|nie ma torby|na grzbiecie|tylko to, co/i;
  const BRAK_TORBY_EN = /no bag|without a bag|on (?:his|her|their) back|only what is/i;
  const KIESZEN_PL = /kiesz/i;
  const KIESZEN_EN = /pocket/i;
  const PUSTE_KIESZENIE_PL = /kiesz[^.]*(?:pust|przetrząś|wywróc)/i;
  const PUSTE_KIESZENIE_EN = /pockets?[^.]*(?:empty|searched|inside out)/i;

  it('„nic” nie twierdzi, że gość nie ma torby ani że ma puste kieszenie, a satyra nie sięga do kieszeni', () => {
    // same teksty: żadne „nic” nie mówi o torbach i kieszeniach, żadna satyra o kieszeniach
    for (const [id, t] of Object.entries(SATYRA)) {
      expect(t.pl, id).not.toMatch(KIESZEN_PL);
      expect(t.en, id).not.toMatch(KIESZEN_EN);
    }
    const bledy: string[] = [];
    let pary = 0;
    for (const kto of KTOS) {
      for (const ilu of [1, 2, 4]) {
        for (const seed of SEDY) {
          for (const chce of KTO[kto].chce) {
            const g = reczny(kto, chce, 'nic', 'prawda', ilu, seed);
            for (const { nazwa, s, e } of SLOWA) {
              const w = wariantyGoscia(g, s, e);
              for (const nic of w.ma) {
                if (BRAK_TORBY_PL.test(nic.pl) || BRAK_TORBY_EN.test(nic.en))
                  bledy.push(`brak torby ${nazwa} ${kto}: ${nic.pl} / ${nic.en}`);
                if (TORBA_PL.test(nic.pl) || KIESZEN_PL.test(nic.pl))
                  bledy.push(`nic o torbie ${nazwa} ${kto}: ${nic.pl}`);
                if (TORBA_EN.test(nic.en) || KIESZEN_EN.test(nic.en))
                  bledy.push(`nic o torbie ${nazwa} ${kto}: ${nic.en}`);
                for (const k of w.kto) {
                  pary++;
                  // zdanie o kto pokazuje torbę, więc „nic” nie może jej odmawiać (i odwrotnie: odmowa przy torbie to błąd)
                  if (TORBA_PL.test(k.pl) && BRAK_TORBY_PL.test(nic.pl)) bledy.push(`${kto}: ${k.pl} + ${nic.pl}`);
                  if (TORBA_EN.test(k.en) && BRAK_TORBY_EN.test(nic.en)) bledy.push(`${kto}: ${k.en} + ${nic.en}`);
                }
                for (const [id, sat] of Object.entries(SATYRA)) {
                  pary++;
                  if (PUSTE_KIESZENIE_PL.test(nic.pl) && KIESZEN_PL.test(sat.pl))
                    bledy.push(`${id}: ${nic.pl} + ${sat.pl}`);
                  if (PUSTE_KIESZENIE_EN.test(nic.en) && KIESZEN_EN.test(sat.en))
                    bledy.push(`${id}: ${nic.en} + ${sat.en}`);
                }
              }
            }
          }
        }
      }
    }
    expect(bledy.slice(0, 5)).toEqual([]);
    expect(pary).toBeGreaterThan(50000);
    // sam test ma zęby: wzorce łapią dawne zdania, które sprzeczność robiły
    expect(
      BRAK_TORBY_PL.test('Nie mają nic przydatnego: ani torby, ani niczego do wymiany, tylko to, co na grzbiecie.'),
    ).toBe(true);
    expect(BRAK_TORBY_EN.test('They have nothing useful: no bag, nothing to swap, only what is on their back.')).toBe(
      true,
    );
    expect(PUSTE_KIESZENIE_PL.test('Kieszenie przetrząśnięte do dna: nic do jedzenia, nic do wymiany.')).toBe(true);
    expect(PUSTE_KIESZENIE_EN.test('Pockets searched to the bottom: nothing to eat, nothing to swap.')).toBe(true);
    expect(TORBA_PL.test('Pod bramą stoi chuda kobieta z plecakiem i workiem na sznurku.')).toBe(true);
    expect(TORBA_EN.test('A thin woman with a rucksack and a sack on a string')).toBe(true);
  });

  it('w prawdziwych gościach „nic” nie idzie w parze z satyrą o kieszeni ani z odmową torby (zwykły i zombie)', () => {
    let nic = 0;
    for (const mode of TRYBY) {
      for (let seed = 1; seed <= 1500; seed++) {
        const g = gosc(seed, ctx({ mode, season: seed % 4 }));
        if (g.ma !== 'nic') continue;
        nic++;
        for (const { s, e } of SLOWA) {
          const t = tekstGoscia(g, s, e);
          const w = wariantyGoscia(g, s, e);
          const wybrane = w.ma.find((v) => t.pl.includes(v.pl));
          // przy prośbie o dobicie zdania „co ma” w tekście nie ma
          expect(Boolean(wybrane), t.pl).toBe(g.chce !== 'dobic');
          if (wybrane) {
            expect(wybrane.pl).not.toMatch(BRAK_TORBY_PL);
            expect(wybrane.en).not.toMatch(BRAK_TORBY_EN);
          }
          expect(t.pl).not.toMatch(PUSTE_KIESZENIE_PL);
          expect(t.en).not.toMatch(PUSTE_KIESZENIE_EN);
          // satyra o kieszeni nie wchodzi do tekstu w ogóle
          expect(t.pl).not.toMatch(KIESZEN_PL);
          expect(t.en).not.toMatch(KIESZEN_EN);
        }
      }
    }
    expect(nic).toBeGreaterThan(300);
  });

  // ---- 2. uczciwość filtra nazw (RODO): moduł ufa filtrowi hosta

  it('lokalna siatka nazw NIE łapie prawdziwie wyglądających nazw: pełny filtr jest po stronie hosta (nazwaDoOkolicy)', () => {
    // te nazwy przechodzą przez wygladaNaOsobe, bo siatka zna tylko 60 słów z NAMES/SURN; nikt nie ma na niej polegać,
    // okolica ma przychodzić z GovInput.okolica, czyli już przefiltrowana przez nazwaDoOkolicy
    for (const przepuszczone of [
      'Kebab Tadeusz',
      'Piekarnia Jana',
      'Salon Fryzjerski Mirella',
      'Bistro Kasia',
      'Gabinet Weterynaryjny Jan Kowalczyk',
      'Apteka Pani Marii',
    ]) {
      expect(wygladaNaOsobe(przepuszczone), przepuszczone).toBe(false);
    }
    // a to, co siatka zna, łapie (żeby wiadomo było, co robi)
    for (const zlapane of ['Halina Kowalska', 'u Marka', 'Dr Nowak'])
      expect(wygladaNaOsobe(zlapane), zlapane).toBe(true);
  });

  it('pusta nazwa miejsca (filtr hosta bez tabel imion) to sama kategoria, w obu językach', () => {
    const okolica = [miejsce('poi:n1', 'apteka', 0, -100, ''), miejsce('poi:s1', 'stacja', 0, 100, '   ')];
    let n = 0;
    let s = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = gosc(seed, ctx({ okolica }));
      if (g.skad.strona === 'n') {
        n++;
        expect(g.skad.klucz).toBe('poi:n1');
        expect(g.skad.nazwa).toEqual({ pl: 'od strony apteki', en: 'from the direction of the pharmacy' });
      }
      if (g.skad.strona === 's') {
        s++;
        expect(g.skad.nazwa).toEqual({ pl: 'od strony stacji paliw', en: 'from the direction of the petrol station' });
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(s).toBeGreaterThan(20);
  });

  it('nazwa z słowem kategorii: bez nawiasu, słowo kategorii nie powtarza się, w obu językach tak samo', () => {
    const jak = (kat: string, nazwa: string) => {
      const m = miejsce('poi:t', kat, 0, -50, nazwa);
      for (let seed = 1; seed <= 100; seed++) {
        const g = gosc(seed, ctx({ okolica: [m] }));
        if (g.skad.strona === 'n') return g.skad.nazwa;
      }
      throw new Error('brak gościa z północy');
    };
    expect(jak('apteka', 'Apteka Pod Różą')).toEqual({
      pl: 'od strony apteki „Pod Różą”',
      en: 'from the direction of the pharmacy “Pod Różą”',
    });
    expect(jak('stacja', 'Stacja Paliw Łódź').pl).toBe('od strony stacji paliw „Łódź”');
    expect(jak('spozywczy', 'Sklep Żabka').pl).toBe('od strony sklepu spożywczego „Żabka”');
    // marka bez słowa kategorii: też w cudzysłowie, bez nawiasu
    expect(jak('spozywczy', 'Żabka').pl).toBe('od strony sklepu spożywczego „Żabka”');
    // równa kategorii (po polsku albo po angielsku) albo ze słowem kategorii w środku: sama kategoria
    expect(jak('apteka', 'Apteka').pl).toBe('od strony apteki');
    expect(jak('apteka', 'Pharmacy').en).toBe('from the direction of the pharmacy');
    expect(jak('apteka', 'Pod Różą Apteka').pl).toBe('od strony apteki');
    for (const n of ['Apteka Pod Różą', 'Żabka', 'Stacja Paliw Łódź']) {
      const t = jak(n.startsWith('Stacja') ? 'stacja' : n === 'Żabka' ? 'spozywczy' : 'apteka', n);
      expect(t.pl).not.toContain('(');
      expect(t.en).not.toContain('(');
    }
  });

  // ---- 3. fach: neutralne wprowadzenie

  it('fach: zdanie o zawodzie nie obiecuje „jednego słowa”', () => {
    for (const kto of KTOS.filter((k) => k !== 'dziecko' && k !== 'z_ugryzionym')) {
      for (const seed of SEDY) {
        const w = wariantyGoscia(reczny(kto, 'nocleg', 'fach', 'prawda', 1, seed), S, E);
        for (const t of w.ma) {
          expect(t.pl).not.toMatch(/jednym słowem/);
          expect(t.en).not.toMatch(/in one word/);
        }
        expect(w.ma.some((t) => /odpowiada krótko: /.test(t.pl) && /answers briefly: /.test(t.en))).toBe(true);
      }
    }
  });

  // ---- 4. rodzina: partner płci przeciwnej

  it('w rodzinie partner jest płci przeciwnej niż mówiący (wspólne nazwisko czyta się jak para)', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const r = osobyGrupy(mulberry(seed), licznik(), 'rodzina', 3 + (seed % 3), new Set<string>());
      expect(r[1].f, `${seed} ${r[0].name} / ${r[1].name}`).toBe(!r[0].f);
      expect(Math.abs(r[1].age - r[0].age)).toBeLessThanOrEqual(6);
    }
    // ktoś z ugryzionym bliskim: gdy bliski jest rówieśnikiem (partnerem), też płci przeciwnej
    let partnerzy = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const g = gosc(seed, ctx({ mode: 'zombie' }));
      if (g.kto !== 'z_ugryzionym') continue;
      const [a, b] = g.osoby;
      if (b.age >= 20 && Math.abs(a.age - b.age) <= 6) {
        partnerzy++;
        expect(b.f, `${a.name} / ${b.name}`).toBe(!a.f);
      }
    }
    expect(partnerzy).toBeGreaterThan(10);
  });

  // ---- 5. dezerter: zawód ochroniarza

  it('dezerter jest zawsze ochroniarzem, także z fachem i gdy zarząd zna już obronę', () => {
    let dezerterow = 0;
    for (const znane of [new Set<Dom>(), new Set<Dom>(['obrona'])]) {
      for (let seed = 1; seed <= 1500; seed++) {
        const g = gosc(seed, ctx({ mode: seed % 2 ? 'zombie' : 'zwykly', znane }));
        if (g.kto !== 'dezerter') continue;
        dezerterow++;
        expect(g.osoby[0].prof, `${seed} ${g.ma}`).toMatch(/^Ochroniar(z|ka) z galerii$/);
      }
    }
    expect(dezerterow).toBeGreaterThan(100);
  });

  // ---- 6. dobicie: bliski będący dzieckiem nie „prosił”

  it('prośba o dobicie: gdy ugryziony bliski jest dzieckiem, nikt nie cytuje, że „prosił”', () => {
    let dzieci = 0;
    let dorosli = 0;
    for (let seed = 1; seed <= 3000 && (dzieci < 10 || dorosli < 10); seed++) {
      const g = gosc(seed, ctx({ mode: 'zombie' }));
      if (g.kto !== 'z_ugryzionym' || g.chce !== 'dobic') continue;
      const w = wariantyGoscia(g, S, E);
      expect(w.chce).toHaveLength(3);
      expect(new Set(w.chce.map((t) => t.pl)).size).toBe(3);
      const calosc = w.chce.map((t) => `${t.pl} ${t.en}`).join(' ');
      if (g.osoby[1].age < 16) {
        dzieci++;
        expect(calosc).not.toMatch(/prosił|begged/);
        expect(calosc).toMatch(/zasnął|zasnęła/);
      } else {
        dorosli++;
        expect(calosc).toMatch(/prosił/);
        expect(calosc).toMatch(/begged/);
      }
      // polskie zdanie ma właściwy rodzaj bliskiego
      for (const t of w.chce) expect(t.pl).not.toMatch(/zasnąłęła|zasnął[a-z]*ęła/);
    }
    expect(dzieci).toBeGreaterThanOrEqual(10);
    expect(dorosli).toBeGreaterThanOrEqual(10);
  });

  // ---- 8. tabele przypięte do symulacji i do SEASONS

  it('BRON i AMUNICJA zgadzają się z src/sim/bron.ts (id, amunicja, nazwy, angielskie nazwy)', () => {
    for (const [id, b] of Object.entries(BRON)) {
      expect(Object.hasOwn(WEAPONS, id), id).toBe(true);
      const w = WEAPONS[id as keyof typeof WEAPONS];
      expect(b.amunicja ?? null, id).toBe(w.ammo);
      expect(b.mian, id).toBe(w.name);
      expect(b.bier, id).toBe(w.acc);
      expect(b.en.endsWith(WEAPONS_EN[id as keyof typeof WEAPONS_EN].name), id).toBe(true);
    }
    for (const id of [...BRON_ZWYKLA, ...BRON_DEZERTERA]) expect(Object.keys(BRON), id).toContain(id);
    expect(Object.keys(AMUNICJA).sort()).toEqual(Object.keys(AMMO_NAMES).sort());
    for (const [k, a] of Object.entries(AMUNICJA)) {
      expect(a.pl, k).toBe(AMMO_NAMES[k as keyof typeof AMMO_NAMES]);
      expect(a.en, k).toBe(AMMO_EN[k as keyof typeof AMMO_EN].name);
    }
    // żadna wylosowana rzecz nie ma id spoza symulacji
    for (let seed = 1; seed <= 1000; seed++) {
      const g = gosc(seed, ctx({ mode: seed % 2 ? 'zombie' : 'zwykly' }));
      if (g.rzecz?.arms) expect(Object.hasOwn(WEAPONS, g.rzecz.arms), g.rzecz.arms).toBe(true);
    }
  });

  // ---- 9. angielskie nazwy zawodów z data.en.ts, dzieci bez dyżurów

  it('angielskie nazwy zawodów idą z data.en.ts, bez łatek w module', () => {
    expect(zawodEn('Ochroniarz z galerii')).toBe('Shopping centre security guard');
    expect(zawodEn('Informatyk z urzędu')).toBe('Council IT technician');
    const d = [...Array(300).keys()].map((i) => gosc(i + 1)).find((x) => x.kto === 'dezerter' && x.osoby[0].f)!;
    const g = reczny('dezerter', 'nocleg', 'fach', 'prawda', 1, 5);
    const ang = wariantyGoscia(g, S, E)
      .ma.map((t) => t.en)
      .join(' ');
    expect(ang).toMatch(/a shopping centre security guard/);
    expect(d).toBeTruthy();
    const it = reczny('uciekinier', 'nocleg', 'fach', 'prawda', 1, 5);
    it.osoby[0].prof = 'Informatyk z urzędu';
    expect(
      wariantyGoscia(it, S, E)
        .ma.map((t) => t.en)
        .join(' '),
    ).toMatch(/a council IT technician/);
  });

  it('samotne dziecko nie obiecuje dyżuru przy kozie ani nie radzi podwoić warty', () => {
    const chce: ChceId[] = ['jedzenie', 'nocleg', 'dolaczyc'];
    const ma: MaId[] = ['rzecz', 'wiadomosc', 'ostrzezenie', 'nic'];
    const DYZUR = /dyżur|na wartę|stove watch|on watch/i;
    for (const ilu of [1, 2]) {
      for (const seed of SEDY) {
        for (const c of chce) {
          for (const m of ma) {
            const g = reczny('dziecko', c, m, 'prawda', ilu, seed);
            for (const { s, e } of SLOWA) {
              const w = wariantyGoscia(g, s, e);
              for (const t of [...w.kto, ...w.chce, ...w.ma, ...w.trop]) {
                expect(t.pl, `${c}/${m} ${t.pl}`).not.toMatch(DYZUR);
                expect(t.en, `${c}/${m} ${t.en}`).not.toMatch(DYZUR);
              }
            }
          }
        }
      }
    }
    // dorosły dalej obiecuje dyżur i radzi podwoić wartę
    const dorosly = wariantyGoscia(reczny('wedrowiec', 'dolaczyc', 'ostrzezenie', 'prawda', 1, 5), S, E);
    expect(dorosly.chce.map((t) => t.pl).join(' ')).toMatch(/dyżur przy kozie/);
    expect(dorosly.ma.map((t) => t.pl).join(' ')).toMatch(/na wartę dwie osoby/);
    // dziecko nadal ma po trzy różne warianty
    const dziecko = wariantyGoscia(reczny('dziecko', 'dolaczyc', 'ostrzezenie', 'prawda', 1, 5), S, E);
    expect(new Set(dziecko.chce.map((t) => t.pl)).size).toBe(3);
    expect(new Set(dziecko.ma.map((t) => t.en)).size).toBe(3);
    // w prawdziwych gościach to samo
    for (let seed = 1; seed <= 1500; seed++) {
      const g = gosc(seed, ctx({ mode: seed % 2 ? 'zombie' : 'zwykly' }));
      if (g.osoby[0].age >= 16) continue;
      for (const { s, e } of SLOWA) {
        const t = tekstGoscia(g, s, e);
        expect(t.pl).not.toMatch(DYZUR);
        expect(t.en).not.toMatch(DYZUR);
      }
    }
  });
});

describe('klocki gościa: poprawki z zadania 10', () => {
  const TORBA_PL = /plecak|worek|torb|wózek|bagaż|zawiniątk|tobołek/i;
  const TORBA_EN = /rucksack|sack|\bbag\b|pram|luggage|bundle|belongings/i;
  const { s: S, e: E } = SLOWA[0];
  const rodzina = (ma: MaId, seed: number): Gosc => ({
    id: 'g1',
    osoby: osobyGrupy(mulberry(seed), licznik(), 'rodzina', 4, new Set<string>()),
    kto: 'rodzina',
    chce: 'nocleg',
    ma,
    haczyk: 'prawda',
    skad: { strona: 'n', nazwa: tx('z północy', 'from the north') },
    ...(ma === 'rzecz' ? { rzecz: { meds: 2 } } : {}),
  });

  it('wózek pełen garnków tylko wtedy, gdy rodzina ma coś do wymiany; przy „nic” sam wózek', () => {
    for (const seed of [3, 4, 5, 6]) {
      const nic = wariantyGoscia(rodzina('nic', seed), S, E).kto[0];
      expect(nic.pl).toContain('wózek');
      expect(nic.pl).not.toMatch(/garnk/);
      expect(nic.en).toContain('pram');
      expect(nic.en).not.toMatch(/pots/);
      for (const ma of ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie'] as const) {
        const ma0 = wariantyGoscia(rodzina(ma, seed), S, E).kto[0];
        expect(ma0.pl, ma).toContain('wózek pełen garnków');
        expect(ma0.en, ma).toContain('a pram full of pots');
      }
    }
  });

  it('żadna linijka satyry nie zakłada plecaka ani innej torby: pasuje do gościa z dowolnym zdaniem otwierającym', () => {
    for (const [id, t] of Object.entries(SATYRA)) {
      expect(t.pl, id).not.toMatch(TORBA_PL);
      expect(t.en, id).not.toMatch(TORBA_EN);
    }
    // w tekście gościa, który ma w zdaniu otwierającym tylko wózek albo nic, satyra nie sięga do plecaka
    for (let seed = 1; seed <= 800; seed++) {
      const g = gosc(seed, ctx({ mode: seed % 2 ? 'zombie' : 'zwykly' }));
      if (!g.satyra) continue;
      const sat = SATYRA[g.satyra];
      expect(sat.pl).not.toMatch(TORBA_PL);
    }
  });
});
