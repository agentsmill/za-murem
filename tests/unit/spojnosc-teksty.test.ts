/* Teksty i logika po przeglądzie spójności przed wydaniem (raport: scratchpad spojnosc/gra-raport.md, punkty M1–M18): koniec
   gry w kronice mówi tytułem zakończenia w obu językach (M1), temperatury poniżej zera mają prawdziwy minus (M2), skąd bierze
   się materiał brzmi po polsku jak zdanie (M3), karty gości mają zgodne zaimki i liczbę osób (M5, M6), kradzież mówi o porcjach
   (M7), cudzysłowy w nazwach z OSM są polskie (M8), postać z łańcucha nie dzieli pełnego imienia z gościem (M17), kobieta
   „już tu bywała” (M18), „Ślady przy siatce” nie proponują łatania „przed nocą” po karcie nocy (M11), karta miejsca na
   mapie miasta ma jedną linię stanu (M13). Zdania zarządu są w stanie w obu językach, więc testy czytają `.pl` i `.en`. */

import { describe, expect, it } from 'vitest';
import { cudzyslowy } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { type Gosc, type KtoId, osobyGrupy } from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import { placeOf, wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import { makeCard } from '../../src/gov/noc.ts';
import type { GovGosc, GovInput } from '../../src/gov/typy.ts';
import { eventView } from '../../src/gov/wydarzenia.ts';
import { celZMiejsca } from '../../src/gov/wyprawy.ts';
import { chooseEvent, govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { buildMenu } from '../../src/ui/budowa.ts';
import { helpSheet, reportSheet } from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { Atrapa, at, run, TPH } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';

describe('M1: koniec gry w kronice mówi tytułem zakończenia, nie identyfikatorem', () => {
  /** wejście, przy którym `checkOver` kończy grę z danego powodu */
  function koniec(powod: 'odwolanie' | 'exodus' | 'pustka', place?: GovInput['place']) {
    const gov = newGov(3);
    const atr = new Atrapa(3);
    if (powod === 'odwolanie') gov.anger = 100;
    if (powod === 'exodus') gov.trust = 0;
    if (powod === 'pustka') atr.people = [];
    govUpdate(gov, { ...atr.input(), ...(place ? { place } : {}) });
    expect(gov.over).toBe(powod);
    return gov.log.at(-1)!.txt;
  }

  it('w bloku: po polsku i po angielsku tytuł z małej litery', () => {
    expect(koniec('odwolanie')).toEqual({
      pl: 'Koniec gry: walne odwołało zarząd.',
      en: 'Game over: the general meeting recalled the board.',
    });
    expect(koniec('exodus')).toEqual({
      pl: 'Koniec gry: osiedle opustoszało.',
      en: 'Game over: the estate emptied out.',
    });
    expect(koniec('pustka')).toEqual({ pl: 'Koniec gry: nikt nie przeżył.', en: 'Game over: nobody survived.' });
  });

  it('w domu (Zielonki): tytuły zakończeń domu w obu językach', () => {
    const dom = placeOf(demoWorld('zielonki').w);
    expect(koniec('odwolanie', dom)).toEqual({
      pl: 'Koniec gry: zebranie ulicy odwołało komitet.',
      en: 'Game over: the street meeting recalled the committee.',
    });
    expect(koniec('exodus', dom)).toEqual({
      pl: 'Koniec gry: ulica opustoszała.',
      en: 'Game over: the street emptied out.',
    });
    expect(koniec('pustka', dom).pl).toBe('Koniec gry: nikt nie przeżył.');
  });

  it('żaden powód nie zostaje surowym identyfikatorem (bez „odwolanie”, „exodus”, „pustka”)', () => {
    for (const powod of ['odwolanie', 'exodus', 'pustka'] as const)
      expect(koniec(powod).pl, powod).not.toMatch(/odwolanie|exodus|pustka/);
  });
});

describe('M2: temperatury poniżej zera z prawdziwym minusem', () => {
  /** Atrapa z mrozem w kuchni: ogień gaśnie, więc rano w kuchni jest zimno poniżej zera */
  class Mroz extends Atrapa {
    override input(): GovInput {
      return { ...super.input(), kitchen: this.fire > 0 ? 18 : -1.4, outdoor: -7 };
    }
  }

  it('rano w kuchni: raport (zdanie i kafelek) pisze „−1°C”, nigdy „-1°C”, po polsku i po angielsku', () => {
    const { gov } = run(5, 'zawsze-warta', at(3, 7), { gov: newGov(5), atr: new Mroz(5) });
    const raport = gov.reports.at(-1)!;
    const kuchnia = raport.lines.find((l) => l.pl.includes('Rano w kuchni'));
    expect(kuchnia?.pl).toMatch(/Rano w kuchni zimno, −1°C\./);
    expect(kuchnia?.en).toMatch(/The kitchen is cold this morning, −1°C\./);
    // kafelek „Kuchnia rano” w oknie raportu
    expect(reportSheet(raport).body).toContain('−1°C');
    for (const t of [kuchnia!.pl, kuchnia!.en, reportSheet(raport).body]) expect(t).not.toMatch(/(^|[\s>])-\d+°C/);
  });

  it('rada na karcie nocy o zimnej kuchni: „−2°C”', () => {
    const atr = new Mroz(5);
    atr.woodSklad = 12;
    const i: GovInput = { ...atr.input(), day: 2, hour: 20, minute: 0, kitchen: -2.4, kozaLit: false };
    const { card } = makeCard(newGov(5), i);
    expect(card.advice.pl).toContain('w kuchni −2°C.');
    expect(card.advice.en).toContain('the kitchen is at −2°C.');
    expect(card.advice.pl + card.advice.en).not.toMatch(/-\d+°C/);
  });

  it('zero i ułamek pod zerem nie dają „−0”: kuchnia −0,4°C to „0°C”', () => {
    const atr = new Mroz(5);
    atr.woodSklad = 12;
    const i: GovInput = { ...atr.input(), day: 2, hour: 20, minute: 0, kitchen: -0.4, kozaLit: false };
    const { card } = makeCard(newGov(5), i);
    expect(card.advice.pl).toContain('w kuchni 0°C.');
    expect(card.advice.pl).not.toContain('−0');
  });
});

describe('M3: skąd bierze się materiał, po polsku jak zdanie, a nie „deski dają przeszukiwanie”', () => {
  /** rzeczownik materiału w mianowniku przed „daje”/„dają” czyta się, jakby materiał coś dawał */
  const ZLY_SZYK = /\b(Deski|Złom|Części|Drewno|Materiał|materiały)\b[^.]*\b(daje|dają)\b/;
  const visible = (html: string) => html.replace(/<[^>]*>/g, ' ');

  for (const key of ['przymorze', 'zielonki'] as const) {
    it(`${key}: pomoc, panel budowy i podpowiedzi paska mówią „pochodzi z …”`, () => {
      const { w, seed } = demoWorld(key);
      const words = wordsOfWorld(w);
      const e = wordsEnOfWorld(w);
      const sim = new Sim(w, createSim(w, seed, { core: 4 }));
      const dom = key === 'zielonki';

      // Jak grać: „Deski, złom i części pochodzą z przeszukiwania … i z rozbiórki.”
      const pomoc = visible(helpSheet(false, false, words, e).body);
      expect(pomoc).toContain(
        `Deski, złom i części pochodzą z przeszukiwania ${dom ? 'domu' : 'pustych mieszkań'} i z rozbiórki.`,
      );
      expect(pomoc).not.toMatch(ZLY_SZYK);

      // panel budowy: powód „Brakuje: …” każdej budowli kończy się zdaniem o źródle pierwszego brakującego materiału
      const braki = buildMenu({}, () => true, words, e)
        .flatMap((c) => c.items)
        .map((x) => x.why ?? '')
        .filter((x) => x.startsWith('Brakuje:'));
      expect(braki.length).toBeGreaterThan(5);
      for (const why of braki) {
        expect(why).toMatch(/(pochodzi|pochodzą) z /);
        expect(why).not.toMatch(ZLY_SZYK);
      }
      const deski = braki.find((x) => x.includes('Deski pochodzą z '))!;
      expect(deski).toContain(
        `Deski pochodzą z ${dom ? 'przeszukiwania domu i rozbiórki gruzu' : 'przeszukiwania pustych mieszkań i rozbiórki mebli'}.`,
      );
      expect(
        braki.some((x) =>
          x.includes(
            dom
              ? 'Złom pochodzi z przeszukiwania domu'
              : 'Złom pochodzi z przeszukiwania i rozbiórki śmieci i sprzętów',
          ),
        ),
      ).toBe(true);

      // podpowiedzi paska: deski, złom, części i zbiorcze pole telefonu
      const stats = statsOf(snapshot(sim.st, w), null, words, e);
      for (const id of ['sBoards', 'sScrap', 'sParts', 'sMats']) {
        const title = stats.find((x) => x.id === id)!.title;
        expect(title, id).toMatch(/Pochodz(i|ą) z /);
        expect(title, id).not.toMatch(ZLY_SZYK);
      }
      // złom w domu też bierze źródło ze słownika (wcześniej na pasku stało blokowe „śmieci” także w domu)
      if (dom)
        expect(stats.find((x) => x.id === 'sScrap')!.title).toContain(
          'Pochodzi z przeszukiwania domu i rozbiórki gruzu.',
        );
    });
  }
});

/** Karta gościa pod bramą z ręcznie ustawioną grupą: `ilu` osób, płeć pierwszej (f), czego chcą, tryb gry. Zarząd na atrapie,
    wizyta aktywna, wpis w odczycie jak w grze (faza `brama`). */
function kartaGoscia(
  o: {
    ilu: number;
    f?: boolean;
    chce?: Gosc['chce'];
    mode?: 'zwykly' | 'zombie';
    obejrzano?: 'ugryziony' | 'czysty';
  } = {
    ilu: 1,
  },
) {
  let id = 1;
  const kto: KtoId = 'wedrowiec';
  const osoby = osobyGrupy(mulberry(5), () => id++, kto, o.ilu, new Set<string>());
  osoby.forEach((p, k) => {
    p.id = `g1p${k}`;
    if (k === 0 && o.f !== undefined) p.f = o.f;
  });
  const g: Gosc = {
    id: 'g1',
    kto,
    chce: o.chce ?? 'nocleg',
    ma: 'nic',
    haczyk: 'prawda',
    skad: { strona: 'n', nazwa: frazaSkad('apteka', 'Pod Różą') },
    osoby,
  };
  const gov = newGov(3, o.mode ?? 'zwykly');
  const atr = new Atrapa(3);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.tick = Math.round(((at(3, 16) - 15 * 60) * TPH) / 60);
  const wpis: GovGosc = {
    id: g.id,
    faza: 'brama',
    tile: 1234,
    gdzie: { x: 34, y: 12 },
    pawns: osoby.map((_, k) => 100 + k),
    zywi: osoby.map((_, k) => k),
    ukradl: 0,
  };
  const i: GovInput = { ...atr.input(), screen: 1000, kozaLit: true, goscie: [wpis], napady: [] };
  gov.goscie = {
    n: 1,
    czytane: 0,
    aktywny: { gosc: g, od: 900, karta: true, ...(o.obejrzano ? { obejrzano: o.obejrzano } : {}) },
  };
  gov.ev.active = { id: 'gosc', d: { id: g.id } };
  const v = eventView(gov, i)!;
  return { gov, i, v, g, en: v.choices.map((c) => c.label.en), pl: v.choices.map((c) => c.label.pl) };
}

describe('M5: karty gości po angielsku mają zgodne zaimki w całej karcie', () => {
  const WSZYSTKIE = (...a: string[]) => a.join(' | ');

  it('jeden mężczyzna: him / his / he, bez „them” i „their”', () => {
    const { en } = kartaGoscia({ ilu: 1, f: false, mode: 'zombie' });
    expect(en).toContain('Let him in for the night');
    expect(en).toContain('Check his hands');
    expect(en).toContain('Send him away');
    expect(WSZYSTKIE(...en)).not.toMatch(/\b(them|their|they)\b/i);
    expect(kartaGoscia({ ilu: 1, f: false, chce: 'leki' }).en).toContain('Give him meds (Meds 1)');
    expect(kartaGoscia({ ilu: 1, f: false, chce: 'wiadomosc' }).en).toContain('Hear what he has to say');
  });

  it('jedna kobieta: her / her / she', () => {
    const { en } = kartaGoscia({ ilu: 1, f: true, mode: 'zombie' });
    expect(en).toContain('Let her in for the night');
    expect(en).toContain('Check her hands');
    expect(en).toContain('Send her away');
    expect(WSZYSTKIE(...en)).not.toMatch(/\b(them|their|they|him|his)\b/i);
    expect(kartaGoscia({ ilu: 1, f: true, chce: 'leki' }).en).toContain('Give her meds (Meds 1)');
    expect(kartaGoscia({ ilu: 1, f: true, chce: 'wiadomosc' }).en).toContain('Hear what she has to say');
  });

  it('grupa: them / their / they', () => {
    const { en } = kartaGoscia({ ilu: 3, mode: 'zombie' });
    expect(en).toContain('Let them in for the night');
    expect(en).toContain('Check their hands');
    expect(en).toContain('Send them away');
    expect(kartaGoscia({ ilu: 3, chce: 'leki' }).en).toContain('Give them meds (Meds 1)');
    expect(kartaGoscia({ ilu: 3, chce: 'wiadomosc' }).en).toContain('Hear what they have to say');
    expect(WSZYSTKIE(...en)).not.toMatch(/\b(him|his|her)\b/i);
  });

  it('zdanie po obejrzeniu rąk: „his / her / their hands” zależnie od grupy', () => {
    expect(kartaGoscia({ ilu: 1, f: false, mode: 'zombie', obejrzano: 'czysty' }).v.text.en).toContain(
      'You checked his hands: clean',
    );
    expect(kartaGoscia({ ilu: 1, f: true, mode: 'zombie', obejrzano: 'czysty' }).v.text.en).toContain(
      'You checked her hands: clean',
    );
    expect(kartaGoscia({ ilu: 2, mode: 'zombie', obejrzano: 'czysty' }).v.text.en).toContain(
      'You checked their hands: clean',
    );
    const ugryziony = kartaGoscia({ ilu: 2, mode: 'zombie', obejrzano: 'ugryziony' });
    expect(ugryziony.v.text.en).toContain('You checked their hands.');
  });

  it('polskie napisy bez zmian', () => {
    const { pl } = kartaGoscia({ ilu: 1, f: true, mode: 'zombie' });
    expect(pl).toContain('Wpuścić na noc');
    expect(pl).toContain('Obejrzeć ręce');
    expect(pl).toContain('Odprawić');
  });
});

describe('M6: grupa w zdaniu liczy pozostałych, nie „resztę (2 osoby)”', () => {
  function przyjecie(ilu: number) {
    const s = kartaGoscia({ ilu, chce: 'dolaczyc' });
    const k = s.pl.findIndex((l) => l.startsWith('Przyjąć do spółdzielni'));
    expect(k).toBeGreaterThanOrEqual(0);
    chooseEvent(s.gov, s.i, k);
    const linia = s.gov.log.find((l) => l.txt.pl.startsWith('Przyjęliście: '))!.txt;
    return { linia, imie: s.g.osoby[0].name };
  }

  it('dwie osoby: „X i jeszcze 1 osoba” / „X and 1 other”', () => {
    const { linia, imie } = przyjecie(2);
    expect(linia.pl).toBe(`Przyjęliście: ${imie} i jeszcze 1 osoba.`);
    expect(linia.en).toBe(`You took in ${imie} and 1 other.`);
  });

  it('trzy, pięć i sześć osób: odmiana polska i angielska liczba mnoga', () => {
    expect(przyjecie(3).linia.pl).toContain('i jeszcze 2 osoby.');
    expect(przyjecie(3).linia.en).toContain('and 2 others.');
    expect(przyjecie(5).linia.pl).toContain('i jeszcze 4 osoby.');
    expect(przyjecie(6).linia.pl).toContain('i jeszcze 5 osób.');
    expect(przyjecie(6).linia.en).toContain('and 5 others.');
  });

  it('jedna osoba: samo imię i nazwisko, bez „i jeszcze”', () => {
    const { linia, imie } = przyjecie(1);
    expect(linia.pl).toBe(`Przyjęliście: ${imie}.`);
    expect(linia.en).toBe(`You took in ${imie}.`);
  });
});

describe('M8: cudzysłowy w nazwach miejsc z OSM są typograficzne, osobno w każdym języku', () => {
  it('cudzyslowy: para po parze, nieparzysta liczba zostaje', () => {
    expect(cudzyslowy('Przedszkole "Chatka"', 'pl')).toBe('Przedszkole \u201eChatka\u201d');
    expect(cudzyslowy('Przedszkole "Chatka"', 'en')).toBe('Przedszkole \u201cChatka\u201d');
    expect(cudzyslowy('"A" i "B"', 'pl')).toBe('\u201eA\u201d i \u201eB\u201d');
    expect(cudzyslowy('Bazarek "Na Dołku"', 'pl')).toBe('Bazarek \u201eNa Dołku\u201d');
    // brak cudzysłowu i nieparzysta liczba (brak zamknięcia, cal): bez zmian
    expect(cudzyslowy('Sklep Żabka', 'pl')).toBe('Sklep Żabka');
    expect(cudzyslowy('Sklep "Żabka', 'pl')).toBe('Sklep "Żabka');
    expect(cudzyslowy('Telewizor 32" i "Okno"', 'en')).toBe('Telewizor 32" i "Okno"');
    // już typograficzne zostają
    expect(cudzyslowy('Klub \u201eMaciuś\u201d', 'pl')).toBe('Klub \u201eMaciuś\u201d');
  });

  it('cel wyprawy z nazwą w cudzysłowie: kategoria i nazwa w nawiasie, polskie „…” po polsku, angielskie “…” po angielsku', () => {
    const cel = celZMiejsca({
      klucz: 'poi:43:7',
      kat: 'szkola',
      x: 120,
      y: 10,
      odl: 120,
      nazwa: 'Niepubliczne Przedszkole "Nasze Przedszkole"',
    });
    expect(cel.nazwa.pl).toBe('Szkoła (Niepubliczne Przedszkole \u201eNasze Przedszkole\u201d)');
    expect(cel.nazwa.en).toBe('School (Niepubliczne Przedszkole \u201cNasze Przedszkole\u201d)');
    expect(cel.nazwa.pl + cel.nazwa.en).not.toContain('"');
  });
});
