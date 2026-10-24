/* Teksty i logika po przeglądzie spójności przed wydaniem (przegląd z 24.10.2026, punkty M1–M18 z jego raportu): koniec
   gry w kronice mówi tytułem zakończenia w obu językach (M1), temperatury poniżej zera mają prawdziwy minus (M2), skąd bierze
   się materiał brzmi po polsku jak zdanie (M3), karty gości mają zgodne zaimki i liczbę osób (M5, M6), kradzież mówi o porcjach
   (M7), cudzysłowy w nazwach z OSM są polskie (M8), postać z łańcucha nie dzieli pełnego imienia z gościem (M17), kobieta
   „już tu bywała” (M18), „Ślady przy siatce” nie proponują łatania „przed nocą” po karcie nocy (M11), karta miejsca na
   mapie miasta ma jedną linię stanu (M13). Zdania zarządu są w stanie w obu językach, więc testy czytają `.pl` i `.en`. */

import { afterEach, describe, expect, it } from 'vitest';
import { cudzyslowy, tx, ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { type Gosc, type KtoId, osobyGrupy } from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import { placeOf, wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import { CARD_HOUR, makeCard } from '../../src/gov/noc.ts';
import type { GovGosc, GovInput } from '../../src/gov/typy.ts';
import { planujGoscia } from '../../src/gov/wizyta.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { eventView, makeHost } from '../../src/gov/wydarzenia.ts';
import { celZMiejsca, wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { chooseEvent, govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { imionaPostaci, tekstPowrotu, type Znajomy } from '../../src/gov/znajomi.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { buildMenu } from '../../src/ui/budowa.ts';
import { kartaHtml, kartaMiejsca } from '../../src/ui/miasto.ts';
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

describe('M18: powracający gość, kobieta i mężczyzna, „rozgląda się jak ktoś, kto zna to miejsce”', () => {
  const wejscie = (f: boolean) => {
    const w = demoWorld('przymorze').w;
    const g: Gosc = {
      id: 'g1',
      kto: 'wedrowiec',
      chce: 'nocleg',
      ma: 'nic',
      haczyk: 'prawda',
      skad: { strona: 'n', nazwa: frazaSkad('apteka', 'Pod Różą') },
      osoby: osobyGrupy(mulberry(5), () => 1, 'wedrowiec', 1, new Set<string>()),
    };
    g.osoby[0].f = f;
    const z: Znajomy = {
      id: 'g1p0',
      osoba: { first: g.osoby[0].first, name: g.osoby[0].name, f, age: 40 },
      look: 3,
      kto: 'wedrowiec',
      jak: 'nocleg',
      nastawienie: 1,
      dzien: 1,
      wizyty: 1,
      ostatnio: 1,
    };
    return tekstPowrotu(g, z, wordsOfWorld(w), wordsEnOfWorld(w));
  };

  it('kobieta i mężczyzna czytają to samo zdanie bez „kto już tu była”', () => {
    for (const f of [true, false]) {
      const t = wejscie(f);
      expect(t.pl, f ? 'kobieta' : 'mężczyzna').toContain(
        'Rozgląda się po podwórku jak ktoś, kto dobrze zna to miejsce.',
      );
      expect(t.pl).not.toMatch(/kto już tu/);
      expect(t.en).toContain(`${f ? 'She' : 'He'} looks around the yard like someone who has been here before.`);
    }
  });
});

describe('M17: nowy gość nie dostaje imienia postaci, którą gracz już zna', () => {
  /** chłopiec z łańcucha zapisany w haku, jak zapisuje go karta z gościem (obiekt osoby w danych haka) */
  const hakZOsoba = (first: string, surname = 'Kowalski') => ({
    t: 100,
    d: { p: { first, name: `${first} ${surname}`, f: false, age: 14 }, jak: 'miska' },
  });
  const wejscieGoscia = (seed: number): { gov: ReturnType<typeof newGov>; i: GovInput } => {
    const gov = newGov(seed, 'zwykly');
    const atr = new Atrapa(seed);
    atr.tick = Math.round(((at(3, 16) - 15 * 60) * TPH) / 60);
    return { gov, i: { ...atr.input(), screen: 1000, goscie: [], napady: [] } };
  };

  it('imionaPostaci: znajomi, prowadzony gość i ludzie z danych haków łańcuchów, także zagnieżdżeni', () => {
    const gov = newGov(1);
    expect(imionaPostaci(gov).size).toBe(0);
    gov.znajomi = [
      {
        id: 'g0p0',
        osoba: { first: 'Henryk', name: 'Henryk Nowak', f: false, age: 47 },
        look: 9,
        kto: 'wedrowiec',
        jak: 'nocleg',
        nastawienie: 1,
        dzien: 1,
        wizyty: 1,
        ostatnio: 1,
      },
    ];
    gov.watki = {
      wybrane: [],
      haki: {
        'szczekanie.start': hakZOsoba('Adam'),
        'puszki.start': { t: 5, d: { lok: 'l1', zdarzenie: { osoby: [{ first: 'Ewa', name: 'Ewa Lis', f: true }] } } },
        'swiatlo.dali': { t: 7 },
      },
      krok: {},
    };
    expect([...imionaPostaci(gov)].sort()).toEqual(['Adam', 'Ewa', 'Henryk']);
  });

  it('gość z ziarna, który dostałby imię chłopca z łańcucha, dostaje inne (to samo ziarno, ten sam przebieg poza imieniem)', () => {
    let sprawdzone = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const bez = wejscieGoscia(seed);
      const g0 = planujGoscia(bez.gov, bez.i, emptyEffects(), 'dzien');
      const imie = g0.osoby[0].first;
      const z = wejscieGoscia(seed);
      z.gov.watki = { wybrane: [], haki: { 'szczekanie.start': hakZOsoba(imie) }, krok: {} };
      const g1 = planujGoscia(z.gov, z.i, emptyEffects(), 'dzien');
      for (const p of g1.osoby) expect(p.first, `ziarno ${seed}`).not.toBe(imie);
      sprawdzone++;
    }
    expect(sprawdzone).toBe(40);
  });

  it('host (karty i kroki łańcuchów) podaje te same imiona, więc nowy człowiek z łańcucha ich nie powtarza', () => {
    const { gov, i } = wejscieGoscia(7);
    gov.watki = { wybrane: [], haki: { 'szczekanie.start': hakZOsoba('Adam') }, krok: {} };
    const h = makeHost(gov, i, emptyEffects());
    expect([...h.imionaPostaci()]).toEqual(['Adam']);
    // postać z łańcucha dostaje imię spoza zarządu, mieszkańców i znanych postaci: ta sama funkcja pilnuje dzieci i dorosłych
    const zajete = new Set([...i.people.map((p) => p.first), ...h.imionaPostaci()]);
    expect(zajete.has('Adam')).toBe(true);
  });

  it('postać z łańcucha nie dostaje imienia znajomego ani prowadzonego gościa', () => {
    const { gov, i } = wejscieGoscia(7);
    const g = planujGoscia(gov, i, emptyEffects(), 'dzien');
    expect(gov.goscie?.aktywny?.gosc.osoby.map((p) => p.first)).toEqual(g.osoby.map((p) => p.first));
    for (const p of g.osoby) expect(imionaPostaci(gov).has(p.first)).toBe(true);
  });
});

describe('M11: „Ślady przy siatce” po karcie nocy nie proponują łatania „przed nocą”', () => {
  /** pierwszy wybór karty o danej godzinie (karta aktywna wprost, jak w wydarzenia-tryby.test.ts) */
  function pierwszyWybor(id: 'slady' | 'slady_z', hour: number, minute: number) {
    const gov = newGov(3, id === 'slady_z' ? 'zombie' : 'zwykly');
    const atr = new Atrapa(3);
    atr.scrap = 10;
    const i: GovInput = { ...atr.input(), day: 3, hour, minute };
    gov.ev.active = { id, d: { where: tx('przy garażach', 'by the garages') } };
    const v = eventView(gov, i)!;
    return v.choices[0];
  }

  it('godzina przełączenia to godzina karty nocy', () => {
    expect(CARD_HOUR).toBe(20);
  });

  for (const id of ['slady', 'slady_z'] as const) {
    it(`${id}: do 19:59 „przed nocą”, od 20:00 (po zatwierdzeniu karty nocy) „teraz”, po polsku i po angielsku`, () => {
      for (const [h, m] of [
        [15, 0],
        [18, 30],
        [19, 59],
      ]) {
        const c = pierwszyWybor(id, h, m);
        expect(c.label, `${h}:${m}`).toEqual({
          pl: 'Załatać przed nocą (Złom 2)',
          en: 'Patch it up before dark (Scrap 2)',
        });
      }
      for (const [h, m] of [
        [20, 0],
        [20, 33],
        [21, 59],
      ]) {
        const c = pierwszyWybor(id, h, m);
        expect(c.label, `${h}:${m}`).toEqual({ pl: 'Załatać teraz (Złom 2)', en: 'Patch it up now (Scrap 2)' });
        expect(c.label.pl + c.label.en).not.toMatch(/przed nocą|before dark/);
        // wybór nadal działa tak samo: koszt 2 złomu i dozwolony przy złomie
        expect(c.ok).toBe(true);
      }
    });
  }
});

describe('M13: karta miejsca na mapie miasta ma jedną linię stanu', () => {
  afterEach(() => ustawJezyk('pl'));

  /** miejsce puste od początku (zapas 0 z samego klucza) i miejsce z zapasem do wybrania */
  const miejsce = (czyPuste: boolean) => {
    for (let k = 0; k < 500; k++) {
      const m = { klucz: `poi:${k}:9`, kat: 'bank', x: 900, y: 0, odl: 900, nazwa: '' };
      const zapas = celZMiejsca(m).zapas;
      if (czyPuste ? zapas === 0 : (zapas ?? 0) >= 4) return m;
    }
    throw new Error('brak klucza');
  };
  const gra = () => {
    const st = newGov(7);
    wlaczMiasto(st);
    const i: GovInput = { ...new Atrapa(7).input(), day: 2, hour: 10, minute: 0 };
    return { st, i };
  };
  const doCna = (html: string, lang: 'pl' | 'en') =>
    (html.replace(/<[^>]*>/g, ' ').match(lang === 'pl' ? /do cna/g : /picked clean/gi) ?? []).length;

  for (const lang of ['pl', 'en'] as const)
    it(`${lang}: miejsce puste od początku mówi o tym raz („zanim tu dotarliście”), obok „jeszcze tu nie byliście”`, () => {
      ustawJezyk(lang);
      const { st, i } = gra();
      const m = miejsce(true);
      const k = kartaMiejsca(m, st, i);
      const html = kartaHtml(m, k, true);
      expect(doCna(html, lang), html).toBe(1);
      expect(k.mozna).toBe(false);
      expect(k.powod).toBeUndefined();
      expect(html).toContain(lang === 'pl' ? 'zanim tu dotarliście' : 'before you got here');
      expect(html).toContain(lang === 'pl' ? 'Jeszcze tu nie byliście.' : 'You have not been here yet.');
      expect(html).toMatch(/data-act="wyslij"[^>]* disabled/);
    });

  for (const lang of ['pl', 'en'] as const)
    it(`${lang}: miejsce wybrane przez nas mówi o tym raz („Wybrane do cna.”), z wizytą w linii niżej`, () => {
      ustawJezyk(lang);
      const { st, i } = gra();
      const m = miejsce(false);
      const cel = celZMiejsca(m);
      st.miasto!.zabrano[m.klucz] = cel.zapas!;
      st.miasto!.wizyty[m.klucz] = 1;
      st.miasto!.ostatnia[m.klucz] = 1;
      const k = kartaMiejsca(m, st, i);
      const html = kartaHtml(m, k, true);
      expect(doCna(html, lang), html).toBe(1);
      expect(html).toContain(lang === 'pl' ? 'Wybrane do cna.' : 'Picked clean.');
      expect(html).toContain(lang === 'pl' ? 'Byliście tu ostatnio wczoraj' : 'You were last here yesterday');
      expect(html).not.toContain(lang === 'pl' ? 'Jeszcze tu nie byliście.' : 'You have not been here yet.');
      expect(k.mozna).toBe(false);
    });

  it('miejsce z zapasem: „Nietknięte.”, bez powodu, przycisk aktywny', () => {
    const { st, i } = gra();
    const m = miejsce(false);
    const k = kartaMiejsca(m, st, i);
    expect(k.linie.map((t) => t.pl)).toContain('Nietknięte.');
    expect(k.powod).toBeUndefined();
    expect(k.mozna).toBe(true);
  });
});
