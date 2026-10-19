/* Karty z sytuacji z mieszkańcami (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 2, „Karty z sytuacji”):
   fachowiec z klatki (Wciągnąć to awans), kradzież z głodu bez wspólnego kotła (sprawca z najniższym nastrojem, nowe
   „Dać mu jeść z kotła”), odejście i kłótnia (wyjście bramą zamiast zniknięcia), kłótnia pary z najniższym nastrojem,
   bezsenność nieśpiącego z najniższym bezpieczeństwem, dym i latarka od najstarszej mieszkanki po imieniu, a „Sprawdzić”
   z krzyku i hałasu idzie na kafelek od właściwej strony (GovInput.strony albo największa dziura) i tylko osobą, która
   nie śpi, nie stoi na warcie, nie jest na wyprawie ani przy zabiegu. Host z atrapy z trzema mieszkańcami z imionami
   (mieszkańcy z osobą z generatora: GovInput.lokatorzy); bez nich teksty i wybory są jak przed zmianą. Do tego strony
   świata policzone ze świata i jedna próba na prawdziwej symulacji z generatorem mieszkańców. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TECH_DOMS } from '../../src/content/data.ts';
import { eventDef } from '../../src/content/events.ts';
import { NASTROJE_EN } from '../../src/content/nastroje.en.ts';
import { hashString } from '../../src/core/rng.ts';
import { stronyOf } from '../../src/gov/miejsce.ts';
import type { GovInput, GovLokator, GovPerson } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import { wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { frontTile, houseOf, inHomeApt } from '../../src/sim/house.ts';
import { mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../../src/sim/osiedle.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { Atrapa } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';
import { pl, polski, polskieSlowa } from './po-angielsku.ts';

const def = (id: string) => polski(M1_EVENTS.find((e) => e.id === id)!);
const ev = (id: string) => M1_EVENTS.find((e) => e.id === id)!;

/** mieszkaniec z osobą: id jak z generatora, potrzeby bez zmartwień, nastrój do ustawienia */
function lokator(
  id: string,
  name: string,
  f: boolean,
  age: number,
  prof: string,
  skills: GovLokator['skills'] = {},
  mood = 60,
): GovLokator {
  return {
    pawn: 100 + Number(id.slice(1)),
    id,
    name,
    first: name.split(' ')[0],
    f,
    age,
    prof,
    skills,
    traits: [],
    needs: { food: 60, warm: 60, rest: 60, health: 90, safe: 60, mood },
    asleep: false,
    inside: true,
    tile: 5000,
  };
}

const HALINA = lokator('r1', 'Halina Kowalska', true, 71, 'Emerytowana nauczycielka');
const MAREK = lokator('r2', 'Marek Nowak', false, 45, 'Elektryk', { elek: 3 });
const EWA = lokator('r3', 'Ewa Zielińska', true, 38, 'Pielęgniarka', { med: 2 });
const TROJE = [HALINA, MAREK, EWA];
/** zarząd zna wszystko oprócz elektryki */
const BEZ_ELEKTRYKI = { bud: 3, cieplo: 3, elek: 0, med: 3, uprawa: 3, it: 3 };

const kopie = (l: readonly GovLokator[], nastroje: readonly number[] = []): GovLokator[] =>
  l.map((x, k) => ({ ...x, skills: { ...x.skills }, needs: { ...x.needs, mood: nastroje[k] ?? x.needs.mood } }));

/** zarząd, wejście (dzień 3, 10:00, trzech mieszkańców z imionami, dużo zapasów) i host */
function setup(over: Partial<GovInput> = {}, seed = 1, trust = 50) {
  const gov = newGov(seed);
  gov.trust = trust;
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.woodSklad = 6;
  atr.scrap = 5;
  const i: GovInput = {
    ...atr.input(),
    day: 3,
    hour: 10,
    minute: 0,
    screen: 1000,
    kozaLit: true,
    residents: 3,
    lokatorzy: kopie(TROJE),
    know: BEZ_ELEKTRYKI,
    ...over,
  };
  const fx = emptyEffects();
  return { gov, i, fx, h: makeHost(gov, i, fx) };
}

/** wybór k w wydarzeniu o danych d, przez zarząd jak w grze */
function wybierz(id: string, d: unknown, k: number, over: Partial<GovInput> = {}, seed = 1, trust = 50) {
  const { gov, i } = setup(over, seed, trust);
  gov.ev.active = { id, d };
  const fx = chooseEvent(gov, i, k);
  return { gov, i, fx };
}

/** osoby zarządu z nadpisanymi potrzebami po kolei (null: bez zmian) */
const ludzie = (potrzeby: (Partial<GovPerson['needs']> | null)[], extra: Partial<GovPerson>[] = []) => {
  const base = new Atrapa(1).input().people;
  return base.map((p, k) => ({ ...p, needs: { ...p.needs, ...(potrzeby[k] ?? {}) }, ...(extra[k] ?? {}) }));
};

describe('fachowiec z klatki', () => {
  it('bierze mieszkańca z umiejętnością, której zarząd nie zna; tekst z jego imieniem, Wciągnąć to awans', () => {
    const { h } = setup();
    expect(def('fachowiec').w(h)).toBeGreaterThan(0);
    const d = def('fachowiec').make(h) as { lok: string };
    expect(d.lok).toBe('r2');
    const text = def('fachowiec').text(h, d);
    expect(text).toContain('Marek Nowak');
    expect(text).toContain('z waszej klatki');
    expect(text).toContain('elektryk');
    expect(text).not.toMatch(/z budynku|piętr/);
    expect(
      def('fachowiec')
        .choices(h, d)
        .map((c) => c.label),
    ).toEqual(['Wciągnąć do roboty', 'Niech odpoczywa']);
    const { fx, gov } = wybierz('fachowiec', d, 0);
    expect(fx.awans).toEqual(['r2']);
    expect(fx.join).toEqual([]);
    expect(fx.residents).toBe(0);
    expect(fx.leave).toEqual([]);
    expect(gov.trust).toBe(51);
    // „Niech odpoczywa” nic nie zmienia
    const odpoczynek = wybierz('fachowiec', d, 1);
    expect(odpoczynek.fx.awans).toBeUndefined();
    expect(odpoczynek.fx.join).toEqual([]);
  });

  it('bez kandydata karty nie ma: zarząd zna wszystkie dziedziny albo nikt z klatki nie ma żadnej umiejętności', () => {
    const wszystko = { bud: 3, cieplo: 3, elek: 3, med: 3, uprawa: 3, it: 3 };
    expect(def('fachowiec').w(setup({ know: wszystko }).h)).toBe(0);
    expect(def('fachowiec').w(setup({ lokatorzy: kopie([HALINA]) }).h)).toBe(0);
    // dziedzina zna się na 2 (poniżej 3), więc medyczka z umiejętnością 2 jest kandydatką
    expect(def('fachowiec').w(setup({ know: { ...wszystko, med: 2 }, lokatorzy: kopie([EWA]) }).h)).toBeGreaterThan(0);
  });

  it('najstarszy z najwyższą umiejętnością w dziedzinie, której zarząd nie zna', () => {
    const mlody = lokator('r4', 'Piotr Lis', false, 25, 'Elektryk', { elek: 4 });
    const stary = lokator('r5', 'Jan Wrona', false, 66, 'Elektryk', { elek: 4 });
    const starszyAleSlabszy = lokator('r6', 'Adam Sowa', false, 80, 'Elektryk', { elek: 1 });
    const znaDoPiatki = lokator('r7', 'Zofia Dąb', true, 90, 'Lekarka', { med: 5 });
    const wybrany = (l: GovLokator[]) => {
      const { h } = setup({ lokatorzy: l });
      return (def('fachowiec').make(h) as { lok: string }).lok;
    };
    // najwyższa umiejętność wygrywa z wiekiem
    expect(wybrany([starszyAleSlabszy, mlody])).toBe('r4');
    // przy tej samej umiejętności starszy
    expect(wybrany([mlody, stary, starszyAleSlabszy])).toBe('r5');
    // medycyna jest znana (3), więc 5 w medycynie się nie liczy
    expect(wybrany([znaDoPiatki, starszyAleSlabszy])).toBe('r6');
    // przy remisie wieku i umiejętności pierwszy w kolejności pionków
    const bliznak = lokator('r8', 'Jan Wrona Młodszy', false, 66, 'Elektryk', { elek: 4 });
    expect(wybrany([stary, bliznak])).toBe('r5');
  });

  it('dane karty to JSON z osobą do tekstu, a po zniknięciu mieszkańca Wciągnąć jest niedostępne', () => {
    const { h } = setup();
    const d = JSON.parse(JSON.stringify(def('fachowiec').make(h)));
    expect(d.p).toMatchObject({ name: 'Marek Nowak', f: false, prof: 'Elektryk' });
    const bezMarka = setup({ lokatorzy: kopie([HALINA, EWA]) }).h;
    const wybory = def('fachowiec').choices(bezMarka, d);
    expect(wybory.map((c) => c.ok)).toEqual([false, true]);
    expect(def('fachowiec').text(bezMarka, d)).toContain('Marek Nowak');
  });

  it('po angielsku: imię, klatka, zawód i napisy z rodzajem; bez polskich słów', () => {
    const { h } = setup();
    const d = def('fachowiec').make(h);
    const e = ev('fachowiec');
    const text = e.text(h, d).en;
    expect(text).toContain('Marek Nowak');
    expect(text).toContain('from your stairwell');
    expect(polskieSlowa(text, ['Marek Nowak'])).toEqual([]);
    expect(e.choices(h, d).map((c) => c.label.en)).toEqual(['Put him to work', 'Let him rest']);
    expect(polskieSlowa(e.title(h, d).en)).toEqual([]);
  });

  it('w domu bez zmian: sąsiad zza płotu, dołączenie przez joinPerson', () => {
    const zielonki = { ...setup().h.place(), kind: 'dom' as const, near: 'domy' as const, houses: 6, blocks: 0 };
    const { h } = setup({ place: zielonki, residents: 0, lokatorzy: undefined });
    expect(def('fachowiec').w(h)).toBeGreaterThan(0);
    const d = def('fachowiec').make(h) as { lok?: string };
    expect(d.lok).toBeUndefined();
    const { fx } = wybierz('fachowiec', d, 0, { place: zielonki, residents: 0, lokatorzy: undefined });
    expect(fx.join).toHaveLength(1);
    expect(fx.awans).toBeUndefined();
  });
});

describe('kradzież z głodu', () => {
  /** nastroje trzech mieszkańców po kolei */
  const nastroje = (...m: number[]) => ({ lokatorzy: kopie(TROJE, m) });

  it('wypada tylko bez podpisanej uchwały u_kociol, z lokatorem z osobą, i bez progu głodu', () => {
    // zadowoleni mieszkańcy też kradną, tylko rzadziej (czynnik w następnym teście)
    expect(def('kradziez').w(setup(nastroje(80, 70, 90)).h)).toBeGreaterThan(0);
    expect(def('kradziez').w(setup(nastroje(60, 44, 60)).h)).toBeGreaterThan(0);
    const zKotlem = setup(nastroje(60, 30, 60));
    zKotlem.gov.laws.signed.u_kociol = true;
    expect(def('kradziez').w(makeHost(zKotlem.gov, zKotlem.i, emptyEffects()))).toBe(0);
    // zapasów musi być z czego zabrać (waga z 0.3)
    expect(def('kradziez').w(setup({ ...nastroje(60, 30, 60), stock: { wood: 5, supplies: 8 } }).h)).toBe(0);
  });

  it('waga to waga z 0.3 razy clamp((65 − nastrój) / 20, 0,25, 1) z nastroju sprawcy (najniższego)', () => {
    const baza = def('kradziez').w(setup({ lokatorzy: undefined }).h);
    expect(baza).toBe(1.5);
    // [nastrój najniższego, oczekiwany czynnik]
    const przypadki: [number, number][] = [
      [70, 0.25],
      [65, 0.25],
      [55, 0.5],
      [45, 1],
      [30, 1],
    ];
    for (const [m, f] of przypadki)
      expect(def('kradziez').w(setup(nastroje(m + 10, m, m + 20)).h), `nastrój ${m}`).toBeCloseTo(baza * f, 10);
    // liczy się najniższy nastrój, nie pierwszy
    expect(def('kradziez').w(setup(nastroje(70, 70, 55)).h)).toBeCloseTo(baza * 0.5, 10);
  });

  it('sprawcą jest ten z najniższym nastrojem, a tekst z jego imieniem mówi, że od kilku dni je za mało', () => {
    const { h } = setup(nastroje(40, 30, 38));
    const d = def('kradziez').make(h) as { lok: string; p: { name: string }; loss: number };
    expect(d.lok).toBe('r2');
    expect(d.p.name).toBe('Marek Nowak');
    expect(d.loss).toBe(5);
    const text = def('kradziez').text(h, d);
    expect(text).toContain('Marek Nowak');
    expect(text).toMatch(/od kilku dni je za mało/);
    expect(text).toContain('zapasy z piwnicy w budynku Atrapia 7: jedzenie 5.');
    expect(text).not.toMatch(/parterze|piętr/);
    // przy remisie nastrojów pierwszy w kolejności
    const remis = def('kradziez').make(setup(nastroje(30, 30, 40)).h) as { lok: string };
    expect(remis.lok).toBe('r1');
  });

  it('Wyrzucić to wyjście bramą sprawcy (fx.wyrzuc), bez zmiany liczby mieszkańców', () => {
    const { h } = setup(nastroje(40, 30, 38));
    const d = JSON.parse(JSON.stringify(def('kradziez').make(h)));
    const wybory = def('kradziez')
      .choices(h, d)
      .map((c) => c.label);
    expect(wybory).toEqual(['Wyrzucić sprawcę z osiedla', 'Dać mu jeść z kotła', 'Przymknąć oko']);
    const { fx, gov } = wybierz('kradziez', d, 0, nastroje(40, 30, 38));
    expect(fx.wyrzuc).toEqual(['r2']);
    expect(fx.leave).toEqual([]);
    expect(fx.residents).toBe(0);
    // skutki w nastrojach jak w 0.3 (Wyrzucić sprawcę: zaufanie −2, wkurzenie −2)
    expect(gov.trust).toBe(48);
    expect(gov.anger).toBe(18);
  });

  it('Dać mu jeść z kotła: Jedzenie −2, nastrój „Najadł się z kotła” +6 na 24 h, zaufanie +1', () => {
    const { h } = setup(nastroje(40, 30, 38));
    const d = JSON.parse(JSON.stringify(def('kradziez').make(h)));
    const { fx, gov } = wybierz('kradziez', d, 1, nastroje(40, 30, 38));
    expect(fx.stock.supplies).toBe(-2);
    expect(fx.moods).toEqual([{ id: 'r2', why: 'Najadł się z kotła', d: 6, hours: 24 }]);
    // wpis do kroniki w obu językach, angielski bez polskich słów
    expect(fx.log.map((l) => l.pl)).toContain('Marek Nowak zjadł miskę z kotła, pierwszy raz od kilku dni do syta.');
    const wpis = fx.log.map((l) => l.en).find((l) => l.startsWith('Marek Nowak had'));
    expect(wpis).toBe('Marek Nowak had a bowl from the pot, the first proper meal in days.');
    expect(polskieSlowa(wpis ?? '', ['Marek Nowak'])).toEqual([]);
    expect(fx.wyrzuc).toBeUndefined();
    expect(gov.trust).toBe(51);
    expect(gov.anger).toBe(20);
    // bez zapasu nie ma z czego nakarmić
    const bieda = setup({ ...nastroje(40, 30, 38), stock: { wood: 5, supplies: 1 } });
    expect(
      def('kradziez')
        .choices(bieda.h, d)
        .map((c) => c.ok),
    ).toEqual([true, false, true]);
  });

  it('sprawczyni: napis w żeńskim rodzaju, po angielsku „Feed her from the pot”', () => {
    const { h } = setup(nastroje(40, 60, 20));
    const d = JSON.parse(JSON.stringify(def('kradziez').make(h)));
    expect(d.lok).toBe('r3');
    expect(
      def('kradziez')
        .choices(h, d)
        .map((c) => c.label),
    ).toEqual(['Wyrzucić sprawcę z osiedla', 'Dać jej jeść z kotła', 'Przymknąć oko']);
    expect(
      ev('kradziez')
        .choices(h, d)
        .map((c) => c.label.en),
    ).toEqual(['Throw the culprit off the estate', 'Feed her from the pot', 'Turn a blind eye']);
    const { fx } = wybierz('kradziez', d, 1, nastroje(40, 60, 20));
    expect(fx.moods).toEqual([{ id: 'r3', why: 'Najadła się z kotła', d: 6, hours: 24 }]);
    expect(NASTROJE_EN['Najadł się z kotła']).toBeTruthy();
    expect(NASTROJE_EN['Najadła się z kotła']).toBeTruthy();
  });

  it('z sądem koleżeńskim sąd jest pierwszy, a wybory zostają w kolejności', () => {
    const { gov, i } = setup(nastroje(40, 30, 38));
    gov.laws.signed.u_sad = true;
    const h = makeHost(gov, i, emptyEffects());
    const d = JSON.parse(JSON.stringify(def('kradziez').make(h)));
    expect(
      def('kradziez')
        .choices(h, d)
        .map((c) => c.label),
    ).toEqual(['Sąd koleżeński', 'Wyrzucić sprawcę z osiedla', 'Dać mu jeść z kotła', 'Przymknąć oko']);
    expect(
      ev('kradziez')
        .choices(h, d)
        .map((c) => c.label.en),
    ).toEqual(['Residents’ court', 'Throw the culprit off the estate', 'Feed him from the pot', 'Turn a blind eye']);
  });

  it('po angielsku: imię sprawcy i głód, bez polskich słów', () => {
    const { h } = setup(nastroje(40, 30, 38));
    const d = def('kradziez').make(h);
    const text = ev('kradziez').text(h, d).en;
    expect(text).toContain('Marek Nowak');
    expect(text).toMatch(/eating too little/);
    expect(polskieSlowa(text, ['Marek Nowak', 'Atrapia 7'])).toEqual([]);
  });

  it('ma odstęp 48 godzin gry', () => {
    expect(ev('kradziez').gap).toBe(48);
  });

  it('bez mieszkańców z osobą jak dziś: waga z 0.3, bezimienny sprawca i dawne wybory', () => {
    const bez = { lokatorzy: undefined };
    const { h } = setup({ ...bez, hour: 22 });
    expect(def('kradziez').w(h)).toBeGreaterThan(0);
    // z uchwałą o kotle i bez głodnych też
    const zKotlem = setup({ ...bez, hour: 22 });
    zKotlem.gov.laws.signed.u_kociol = true;
    expect(def('kradziez').w(makeHost(zKotlem.gov, zKotlem.i, emptyEffects()))).toBeGreaterThan(0);
    expect(def('kradziez').w(setup({ ...bez, residents: 0 }).h)).toBe(0);
    const d = { loss: 5, b: 'Atrapia 7' };
    expect(def('kradziez').make(h)).toEqual(d);
    // zdanie o stracie przepisane także bez sprawcy (0.3: „… w budynku Atrapia 7 Jedzenie 5.” bez znaku przed liczbą)
    expect(def('kradziez').text(h, d)).toBe(
      'Ktoś wyniósł nocą zapasy z piwnicy w budynku Atrapia 7: jedzenie 5. Ślady prowadzą do mieszkania na parterze.',
    );
    expect(eventDef('kradziez')!.text(h, d)).toBe(
      'Ktoś wyniósł nocą z piwnicy w budynku Atrapia 7 Jedzenie 5. Ślady prowadzą do mieszkania na parterze.',
    );
    expect(
      def('kradziez')
        .choices(h, d)
        .map((c) => c.label),
    ).toEqual(['Wyrzucić sprawcę z osiedla', 'Przymknąć oko']);
    expect(ev('kradziez').text(h, d).en).toBe(
      'Overnight, someone made off with 5 food from the basement of Atrapia 7. The footprints lead to a ground-floor flat.',
    );
    // wyrzucenie bez sprawcy po staremu: jeden mieszkaniec mniej
    const { fx } = wybierz('kradziez', d, 0, bez);
    expect(fx.residents).toBe(-1);
    expect(fx.wyrzuc).toBeUndefined();
  });
});

describe('odejście i kłótnia: wyjście bramą', () => {
  it('odejście: „Niech idzie” to fx.wyrzuc tej osoby zarządu zamiast fx.leave', () => {
    const over = { lokatorzy: undefined, residents: 4 };
    const { h } = setup(over, 1, 30);
    expect(def('odejscie').w(h)).toBeGreaterThan(0);
    const d = def('odejscie').make(h) as { p: string };
    const { fx } = wybierz('odejscie', d, 1, over, 1, 30);
    expect(fx.wyrzuc).toEqual([d.p]);
    expect(fx.leave).toEqual([]);
    expect(fx.residents).toBe(0);
    // wpis do kroniki jak dotąd
    expect(fx.log.map(pl).some((l) => l.includes('z osiedla'))).toBe(true);
  });

  it('odejście ma wagę 0, gdy w zarządzie jest mniej niż dwie osoby: ostatni nie wychodzi kartą', () => {
    const jedna = [new Atrapa(1).input().people[0]];
    expect(def('odejscie').w(setup({ people: jedna }, 1, 30).h)).toBe(0);
    const dwie = new Atrapa(1).input().people.slice(0, 2);
    expect(def('odejscie').w(setup({ people: dwie }, 1, 30).h)).toBeGreaterThan(0);
    // zaufanie nie jest niskie: karty i tak nie ma
    expect(def('odejscie').w(setup({}, 1, 60).h)).toBe(0);
  });

  it('kłótnia: przegrany wychodzi bramą (fx.wyrzuc), nigdy przez fx.leave', () => {
    let wyszli = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { h, i } = setup({ lokatorzy: undefined }, seed);
      const d = def('klotnia').make(h) as { a: string; b: string };
      for (const k of [1, 2]) {
        const { fx } = wybierz('klotnia', d, k, { lokatorzy: undefined }, seed);
        expect(fx.leave, `ziarno ${seed}, wybór ${k}`).toEqual([]);
        const przegrany = k === 1 ? d.b : d.a;
        if (fx.wyrzuc) {
          wyszli++;
          expect(fx.wyrzuc).toEqual([przegrany]);
          expect(fx.log.map(pl).some((l) => /wyprowadzi/.test(l) && l.includes('do innego osiedla'))).toBe(true);
        }
      }
      expect(i.people.length).toBeGreaterThan(2);
    }
    // około 30% z 80 prób
    expect(wyszli).toBeGreaterThan(10);
    expect(wyszli).toBeLessThan(40);
  });
});

describe('kłótnia pary z najniższym nastrojem', () => {
  const sKlotnia = (nastroje: (number | null)[]) =>
    setup({ people: ludzie(nastroje.map((m) => (m === null ? null : { mood: m }))) });

  it('bierze dwie osoby zarządu z najniższym nastrojem, przy remisie kolejność osób', () => {
    const { h, i } = sKlotnia([50, 40, 50, 40]);
    const id = i.people.map((p) => p.id);
    expect(def('klotnia').make(h)).toEqual({ a: id[1], b: id[3] });
    const remis = sKlotnia([30, 50, 50, 50]);
    expect(def('klotnia').make(remis.h)).toEqual({ a: remis.i.people[0].id, b: remis.i.people[1].id });
    // nastrój pierwszej osoby wyższy, ale i tak ponad pozostałymi: liczy się dół
    const dol = sKlotnia([54, 54, 20, 10]);
    expect(def('klotnia').make(dol.h)).toEqual({ a: dol.i.people[3].id, b: dol.i.people[2].id });
  });

  it('bez pary poniżej 55 karty nie ma', () => {
    expect(def('klotnia').w(sKlotnia([60, 60, 60, 60]).h)).toBe(0);
    // jedna osoba w złym nastroju to jeszcze nie kłótnia
    expect(def('klotnia').w(sKlotnia([20, 60, 60, 60]).h)).toBe(0);
    expect(def('klotnia').w(sKlotnia([20, 55, 55, 55]).h)).toBe(0);
    expect(def('klotnia').w(sKlotnia([20, 54, 60, 60]).h)).toBeGreaterThan(0);
    // dwie osoby to za mało na waśń (0.3: co najmniej trzy)
    const dwie = setup({ people: ludzie([{ mood: 10 }, { mood: 10 }]).slice(0, 2) });
    expect(def('klotnia').w(dwie.h)).toBe(0);
  });

  it('tekst i napisy jak dotąd, z imionami tej pary', () => {
    const { h, i } = sKlotnia([50, 40, 50, 40]);
    const d = def('klotnia').make(h);
    expect(def('klotnia').text(h, d)).toBe(
      `${i.people[1].name} i ${i.people[3].name} pokłócili się o grafik dyżurów przy kozie. Pół klatki stoi po jednej stronie, pół po drugiej.`,
    );
    expect(
      def('klotnia')
        .choices(h, d)
        .map((c) => c.label),
    ).toEqual(['Mediacja w świetlicy', `Rację ma ${i.people[1].first}`, `Rację ma ${i.people[3].first}`]);
  });
});

describe('bezsenność', () => {
  it('bierze nieśpiącego z najniższym bezpieczeństwem', () => {
    const { h, i } = setup({
      hour: 23,
      people: ludzie([{ safe: 50 }, { safe: 10 }, { safe: 30 }, { safe: 20 }], [{}, { asleep: true }, {}, {}]),
    });
    expect(def('bezsennosc').w(h)).toBeGreaterThan(0);
    // śpiący z najniższym bezpieczeństwem odpada, zostaje ten z 20
    expect(def('bezsennosc').make(h)).toEqual({ p: i.people[3].id });
  });

  it('przy remisie bezpieczeństwa pierwszy w kolejności osób; na wyprawie odpada', () => {
    const { h, i } = setup({
      hour: 23,
      people: ludzie([{ safe: 30 }, { safe: 30 }, { safe: 80 }, { safe: 80 }], [{ away: true }, {}, {}, {}]),
    });
    expect(def('bezsennosc').make(h)).toEqual({ p: i.people[1].id });
  });

  it('gdy nikt nie czuwa, bohaterem jest śpiący o najniższym bezpieczeństwie, spoza warty przy siatce', () => {
    // 0 śpi na warcie przy bramie (najniższe safe), 1 śpi, 2 śpi (najniższe z wolnych), 3 śpi
    const { h, i } = setup({
      hour: 23,
      people: ludzie(
        [{ safe: 1 }, { safe: 30 }, { safe: 12 }, { safe: 50 }],
        [{ asleep: true, post: 'brama' }, { asleep: true }, { asleep: true }, { asleep: true }],
      ),
    });
    expect(h.czuwaPozaWarta()).toEqual([]);
    expect(def('bezsennosc').w(h)).toBeGreaterThan(0);
    expect(def('bezsennosc').make(h)).toEqual({ p: i.people[2].id, spi: true });
    // przy remisie bezpieczeństwa pierwszy w kolejności osób
    const remis = setup({
      hour: 23,
      people: ludzie(
        [{ safe: 20 }, { safe: 20 }, { safe: 60 }, { safe: 60 }],
        [{ asleep: true }, { asleep: true }, { asleep: true }, { asleep: true }],
      ),
    });
    expect(def('bezsennosc').make(remis.h)).toEqual({ p: remis.i.people[0].id, spi: true });
  });

  it('czuwający ma pierwszeństwo przed śpiącym, choćby ten miał niższe bezpieczeństwo', () => {
    const { h, i } = setup({
      hour: 23,
      people: ludzie(
        [{ safe: 5 }, { safe: 70 }, { safe: 6 }, { safe: 7 }],
        [{ asleep: true }, {}, { asleep: true }, { asleep: true }],
      ),
    });
    expect(def('bezsennosc').make(h)).toEqual({ p: i.people[1].id });
  });

  it('śpiący wartownik, na wyprawie, ugryziony i operujący nie są bohaterami; śpiący dyżur przy kozie jest', () => {
    const wszyscyZajeci = setup({
      hour: 23,
      people: ludzie(
        [],
        [
          { asleep: true, post: 'd1' },
          { asleep: true, away: true },
          { asleep: true, bitten: true },
          { asleep: true, job: 'amputate' },
        ],
      ),
    });
    expect(wszyscyZajeci.h.spiPozaWarta()).toEqual([]);
    expect(def('bezsennosc').w(wszyscyZajeci.h)).toBe(0);
    const zKoza = setup({
      hour: 23,
      people: ludzie(
        [{ safe: 5 }],
        [
          { asleep: true, post: 'koza' },
          { asleep: true, post: 'siatka' },
          { asleep: true, post: 'wieza' },
          { asleep: true, away: true },
        ],
      ),
    });
    expect(def('bezsennosc').make(zKoza.h)).toEqual({ p: zKoza.i.people[0].id, spi: true });
    // spiPozaWarta oddaje kopie
    zKoza.h.spiPozaWarta()[0].needs.safe = -9;
    expect(zKoza.i.people[0].needs.safe).toBe(5);
  });

  it('tekst zależy od przypadku: przy kozie, albo ciągle się budzi (bez słowa o kozie), po polsku i angielsku', () => {
    const czuwajacy = setup({ hour: 23, people: ludzie([{ safe: 5 }]) });
    const dc = def('bezsennosc').make(czuwajacy.h);
    const imie = czuwajacy.i.people[0].name;
    expect(def('bezsennosc').text(czuwajacy.h, dc)).toBe(
      `${imie} siedzi przy kozie i nie może zasnąć. Mówi, że ciągle słyszy kroki na klatce.`,
    );
    const spiacy = setup({
      hour: 23,
      people: ludzie([{ safe: 5 }], [{ asleep: true }, { asleep: true }, { asleep: true }, { asleep: true }]),
    });
    const ds = def('bezsennosc').make(spiacy.h);
    const kto = spiacy.i.people[0];
    expect(def('bezsennosc').text(spiacy.h, ds)).toBe(
      `${kto.name} co chwilę się budzi i nie może zasnąć. Mówi, że ciągle słyszy kroki na klatce.`,
    );
    expect(def('bezsennosc').text(spiacy.h, ds)).not.toMatch(/koz/);
    const en = ev('bezsennosc').text(spiacy.h, ds).en;
    expect(en).toBe(
      `${kto.name} keeps waking up and can’t get back to sleep. ${kto.f ? 'She' : 'He'} keeps hearing footsteps in the stairwell.`,
    );
    expect(polskieSlowa(en, [kto.name])).toEqual([]);
    // starego okna (dane tylko z id) nie rusza
    expect(def('bezsennosc').text(spiacy.h, { p: kto.id })).toContain('siedzi przy kozie');
  });

  it('wartownik przy siatce nigdy nie jest bohaterem, choćby miał najniższe bezpieczeństwo', () => {
    const potrzeby = [{ safe: 5 }, { safe: 6 }, { safe: 7 }, { safe: 40 }];
    // posterunek z odczytu symulacji: brama, dziura, siatka, wieża
    for (const post of ['brama', 'd1', 'siatka', 'wieza']) {
      const { h, i } = setup({ hour: 23, people: ludzie(potrzeby, [{ post }]) });
      expect(def('bezsennosc').make(h), post).toEqual({ p: i.people[1].id });
    }
    // praca 'guard' bez znanego posterunku to też warta przy siatce
    const zPraca = setup({ hour: 23, people: ludzie(potrzeby, [{ job: 'guard' }]) });
    expect(def('bezsennosc').make(zPraca.h)).toEqual({ p: zPraca.i.people[1].id });
    // warta z menu (GovInput.guards)
    const menu = setup({ hour: 23, people: ludzie(potrzeby) });
    const zMenu = setup({ hour: 23, people: ludzie(potrzeby), guards: [{ id: menu.i.people[0].id, post: 'd2' }] });
    expect(def('bezsennosc').make(zMenu.h)).toEqual({ p: zMenu.i.people[1].id });
    // ugryziony i operujący też zostają przy sobie
    const chorzy = setup({ hour: 23, people: ludzie(potrzeby, [{ bitten: true }, { job: 'amputate' }]) });
    expect(def('bezsennosc').make(chorzy.h)).toEqual({ p: chorzy.i.people[2].id });
  });

  it('warta z zatwierdzonej karty nocy też wyklucza, a plan z innej doby nie', () => {
    const { gov, i } = setup({ hour: 23, people: ludzie([{ safe: 5 }, { safe: 6 }, { safe: 7 }, { safe: 40 }]) });
    const [a, b, c, d] = i.people;
    gov.night = {
      day: 3,
      card: {} as never,
      assign: { [a.id]: 'warta:brama', [b.id]: 'warta:d2', [c.id]: 'sen', [d.id]: 'sen' },
      confirmed: true,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    expect(def('bezsennosc').make(makeHost(gov, i, emptyEffects()))).toEqual({ p: c.id });
    gov.night.day = 2;
    expect(def('bezsennosc').make(makeHost(gov, i, emptyEffects()))).toEqual({ p: a.id });
  });

  it('osoba na dyżurze przy kozie może być bohaterem (siedzi przy kozie), choć do sprawdzania nie idzie', () => {
    const potrzeby = [{ safe: 5 }, { safe: 60 }, { safe: 70 }, { safe: 80 }];
    // dyżur z odczytu, z menu i z karty nocy
    const zOdczytu = setup({ hour: 23, people: ludzie(potrzeby, [{ post: 'koza' }]) });
    expect(def('bezsennosc').make(zOdczytu.h)).toEqual({ p: zOdczytu.i.people[0].id });
    const baza = setup({ hour: 23, people: ludzie(potrzeby) });
    const zMenu = setup({ hour: 23, people: ludzie(potrzeby), guards: [{ id: baza.i.people[0].id, post: 'koza' }] });
    expect(def('bezsennosc').make(zMenu.h)).toEqual({ p: zMenu.i.people[0].id });
    const { gov, i } = setup({ hour: 23, people: ludzie(potrzeby) });
    gov.night = {
      day: 3,
      card: {} as never,
      assign: { [i.people[0].id]: 'warta:koza' },
      confirmed: true,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    const hKarta = makeHost(gov, i, emptyEffects());
    expect(def('bezsennosc').make(hKarta)).toEqual({ p: i.people[0].id });
    // do sprawdzania ten sam dyżurny nie idzie (zostaje przy kozie), choć jest najbardziej wypoczęty
    const odpoczety = ludzie([{ rest: 99 }, { rest: 50 }, { rest: 40 }, { rest: 30 }], [{ post: 'koza' }]);
    const k = setup({ hour: 23, people: odpoczety });
    expect(k.h.czuwaPozaWarta().map((p) => p.id)).toContain(k.i.people[0].id);
    expect(k.h.doSprawdzenia()?.id).toBe(k.i.people[1].id);
    // czuwaPozaWarta oddaje kopie
    k.h.czuwaPozaWarta()[0].needs.safe = -9;
    expect(k.i.people[0].needs.safe).not.toBe(-9);
  });

  it('tekst i wybory jak dotąd, dla wskazanej osoby', () => {
    const { h, i } = setup({ hour: 23, people: ludzie([{ safe: 5 }]) });
    const d = def('bezsennosc').make(h) as { p: string };
    expect(d.p).toBe(i.people[0].id);
    expect(def('bezsennosc').text(h, d)).toBe(
      `${i.people[0].name} siedzi przy kozie i nie może zasnąć. Mówi, że ciągle słyszy kroki na klatce.`,
    );
  });
});

describe('bezsenność: wybory ruszają prawdziwych ludzi', () => {
  /** noc, atrapa ze stronami (koza 4333, siatka 4222); 0 bohater (najniższe safe), 1 wypoczęty wolny, 2 wypoczęty na
      warcie, 3 śpi */
  const noc = { hour: 23 };
  const ludzieNocy = () =>
    ludzie(
      [
        { safe: 5, rest: 40 },
        { safe: 60, rest: 70 },
        { safe: 60, rest: 99 },
        { safe: 60, rest: 95 },
      ],
      [{}, {}, { post: 'brama' }, { asleep: true }],
    );

  it('Posiedzieć przy kozie: bohater i najbardziej wypoczęty inny wolny człowiek idą do kozy, skutki jak dotąd', () => {
    const { h, i } = setup({ ...noc, people: ludzieNocy() });
    const d = def('bezsennosc').make(h);
    expect(d).toEqual({ p: i.people[0].id });
    const w = def('bezsennosc').choices(h, d);
    expect(w.map((c) => c.ok)).toEqual([true, true, true]);
    const { fx } = wybierz('bezsennosc', d, 0, { ...noc, people: ludzieNocy() });
    // czuwający 1 (nie wartownik 2, nie śpiący 3, nie bohater)
    expect(fx.sprawdz).toEqual([
      { id: i.people[0].id, tile: 4333 },
      { id: i.people[1].id, tile: 4333 },
    ]);
    expect(fx.needs).toContainEqual({ id: i.people[0].id, d: { safe: 10, rest: 5 } });
    expect(fx.needs).toContainEqual({ id: i.people[1].id, d: { rest: -5 } });
  });

  it('Posiedzieć przy kozie: bez innego wolnego idzie sam bohater, a śpiący drugi wstaje, gdy nikt nie czuwa', () => {
    const sam = ludzie([{ safe: 5 }], [{}, { post: 'brama' }, { away: true }, { bitten: true }]);
    const a = wybierz('bezsennosc', { p: sam[0].id }, 0, { ...noc, people: sam });
    expect(a.fx.sprawdz).toEqual([{ id: sam[0].id, tile: 4333 }]);
    // wszyscy śpią: bohater (najniższe safe) i najbardziej wypoczęty inny
    const spia = ludzie(
      [{ safe: 5, rest: 10 }, { rest: 30 }, { rest: 80 }, { rest: 50 }],
      [{ asleep: true }, { asleep: true }, { asleep: true }, { asleep: true }],
    );
    const { h, i } = setup({ ...noc, people: spia });
    const d = def('bezsennosc').make(h);
    expect(d).toEqual({ p: i.people[0].id, spi: true });
    const b = wybierz('bezsennosc', d, 0, { ...noc, people: spia });
    expect(b.fx.sprawdz).toEqual([
      { id: i.people[0].id, tile: 4333 },
      { id: i.people[2].id, tile: 4333 },
    ]);
  });

  it('Posiedzieć przy kozie: bohater z dyżuru przy kozie już tam jest i nie dostaje sprawdzania', () => {
    const ppl = ludzie([{ safe: 5 }, { rest: 80 }], [{ post: 'koza' }]);
    const a = wybierz('bezsennosc', { p: ppl[0].id }, 0, { ...noc, people: ppl });
    expect(a.fx.sprawdz).toEqual([{ id: ppl[1].id, tile: 4333 }]);
    // dyżur z karty nocy też
    const { gov, i } = setup({ ...noc, people: ludzie([{ safe: 5 }, { rest: 80 }]) });
    gov.night = {
      day: 3,
      card: {} as never,
      assign: { [i.people[0].id]: 'warta:koza' },
      confirmed: true,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    gov.ev.active = { id: 'bezsennosc', d: { p: i.people[0].id } };
    const fx = chooseEvent(gov, i, 0);
    expect(fx.sprawdz).toEqual([{ id: i.people[1].id, tile: 4333 }]);
  });

  it('Niech pilnuje: bohater idzie na podwórko przy siatce, premia warty 1,5, sen −10 i wpis', () => {
    const { h, i } = setup({ ...noc, people: ludzieNocy() });
    const d = def('bezsennosc').make(h);
    const { gov, fx } = wybierz('bezsennosc', d, 1, { ...noc, people: ludzieNocy() });
    expect(fx.sprawdz).toEqual([{ id: i.people[0].id, tile: 4222 }]);
    expect(fx.needs).toEqual([{ id: i.people[0].id, d: { rest: -10 } }]);
    expect(gov.tonight.bonus).toBe(1.5);
    expect(fx.log.map(pl).some((l) => l.includes('resztę nocy przy oknie od podwórka'))).toBe(true);
  });

  it('Kazać się położyć: bez ruchu, bezpieczeństwo −5', () => {
    const { h, i } = setup({ ...noc, people: ludzieNocy() });
    const d = def('bezsennosc').make(h);
    const { fx } = wybierz('bezsennosc', d, 2, { ...noc, people: ludzieNocy() });
    expect(fx.sprawdz).toBeUndefined();
    expect(fx.needs).toEqual([{ id: i.people[0].id, d: { safe: -5 } }]);
  });

  it('wybór z ruchem jest niedostępny tylko, gdy nie zna kafelka', () => {
    const { h } = setup({ ...noc, people: ludzieNocy() });
    const d = def('bezsennosc').make(h);
    const bezKozy = setup({ ...noc, people: ludzieNocy(), strony: { garaze: 1, blok: 2 } });
    expect(
      def('bezsennosc')
        .choices(bezKozy.h, d)
        .map((c) => c.ok),
    ).toEqual([false, true, true]);
    const bezSiatki = setup({
      ...noc,
      people: ludzieNocy(),
      strony: { koza: 3 },
      fence: { holes: [{ id: 1, size: 0.5 }], durability: 0.5 },
    });
    expect(
      def('bezsennosc')
        .choices(bezSiatki.h, d)
        .map((c) => c.ok),
    ).toEqual([true, false, true]);
    const nic = setup({ ...noc, people: ludzieNocy(), strony: undefined, fence: { holes: [], durability: 1 } });
    expect(
      def('bezsennosc')
        .choices(nic.h, d)
        .map((c) => c.ok),
    ).toEqual([false, false, true]);
    expect(nic.h.kafelekKozy()).toBeNull();
    // niedostępny wybór niczego nie robi
    const { fx } = wybierz('bezsennosc', d, 0, { ...noc, people: ludzieNocy(), strony: undefined });
    expect(fx.sprawdz).toBeUndefined();
    expect(fx.needs).toEqual([]);
  });

  it('po angielsku napisy wyborów zostają w rodzaju bohatera', () => {
    const { h } = setup({ ...noc, people: ludzieNocy() });
    const d = def('bezsennosc').make(h);
    const imie = ev('bezsennosc')
      .choices(h, d)
      .map((c) => c.label.en);
    expect(imie[0]).toMatch(/^Sit with (him|her) by the stove$/);
    expect(imie[2]).toMatch(/^Send (him|her) to bed$/);
  });
});

describe('dym i latarka od najstarszej mieszkanki', () => {
  it('dym: w bloku z mieszkańcami najstarsza mieszkanka po imieniu, z klatką, bez pięter', () => {
    const { h } = setup();
    const d = def('dym').make(h) as { lok?: string };
    expect(d.lok).toBe('r1');
    const text = def('dym').text(h, d);
    expect(text).toContain('pani Halina Kowalska');
    expect(text).toContain('z waszej klatki');
    expect(text).toContain('ze słoikiem powideł z 2049 roku');
    expect(text).not.toMatch(/piętr|Krysi/);
    const en = ev('dym').text(h, d).en;
    expect(en).toContain('Halina Kowalska from your stairwell');
    expect(en).toContain('jar of plum jam');
    expect(en).not.toMatch(/Krysia/);
    expect(polskieSlowa(en, ['Halina Kowalska'])).toEqual([]);
    // słoik od niej trafia do kuchni jak dziś: Jedzenie 2
    expect(
      ev('dym')
        .choices(h, d)
        .map((c) => c.label.en),
    ).toEqual(['Ask her in to get warm', 'Take the jar and thank her']);
    const { fx } = wybierz('dym', d, 0);
    expect(fx.stock.supplies).toBe(2);
    expect(fx.log.map(pl).join(' ')).toContain('Pani Halina opowiada, jak wyglądało osiedle');
    expect(fx.log.map((l) => l.en).join(' ')).toContain('Halina tells you what the estate looked like');
    const wziac = wybierz('dym', d, 1);
    expect(wziac.fx.stock.supplies).toBe(2);
    expect(wziac.fx.log.map(pl).join(' ')).toContain(
      'Pani Halina wróciła do zimnego mieszkania. Na klatce już o tym wiedzą.',
    );
    expect(wziac.fx.log.map((l) => l.en).join(' ')).toContain('Halina went back to her cold flat.');
  });

  it('latarka: ta sama mieszkanka po imieniu, bez pięter', () => {
    const { h } = setup();
    const d = def('latarka').make(h) as { lok?: string };
    expect(d.lok).toBe('r1');
    const text = def('latarka').text(h, d);
    expect(text).toContain('Pani Halina Kowalska z waszej klatki przyniosła latarkę na korbkę');
    expect(text).toContain('a ona już nie ma siły kręcić');
    expect(text).not.toMatch(/piętr/);
    const en = ev('latarka').text(h, d).en;
    expect(en).toContain('Halina Kowalska from your stairwell has brought round a wind-up torch');
    expect(en).toContain('she hasn’t the strength');
    expect(polskieSlowa(en, ['Halina Kowalska'])).toEqual([]);
  });

  it('bez kobiety bohaterem jest najstarszy mieszkaniec, z rodzajem męskim', () => {
    const panowie = kopie([MAREK, lokator('r9', 'Józef Mazur', false, 78, 'Emerytowany kolejarz')]);
    const { h } = setup({ lokatorzy: panowie });
    const dym = def('dym').make(h);
    const dymTekst = def('dym').text(h, dym);
    expect(dymTekst).toContain('puka pan Józef Mazur z waszej klatki');
    expect(dymTekst).toContain('u niego w mieszkaniu jest sześć stopni');
    expect(ev('dym').text(h, dym).en).toContain('He asks if he can sit');
    // napisy wyborów po angielsku w rodzaju bohatera, a wpisy do kroniki z jego imieniem
    expect(
      ev('dym')
        .choices(h, dym)
        .map((c) => c.label.en),
    ).toEqual(['Ask him in to get warm', 'Take the jar and thank him']);
    const pan = wybierz('dym', dym, 1, { lokatorzy: panowie });
    expect(pan.fx.log.map(pl).join(' ')).toContain(
      'Pan Józef wrócił do zimnego mieszkania. Na klatce już o tym wiedzą.',
    );
    expect(pan.fx.log.map((l) => l.en).join(' ')).toContain('Józef went back to his cold flat.');
    const lat = def('latarka').text(h, def('latarka').make(h));
    expect(lat).toContain('Pan Józef Mazur z waszej klatki przyniósł latarkę na korbkę');
    expect(lat).toContain('a on już nie ma siły kręcić');
    expect(ev('latarka').text(h, def('latarka').make(h)).en).toContain('he hasn’t the strength');
  });

  it('najstarsza kobieta, nie najstarszy mieszkaniec, gdy są obie płcie', () => {
    const { h } = setup({ lokatorzy: kopie([lokator('r9', 'Józef Mazur', false, 90, 'Emeryt'), EWA, HALINA]) });
    expect((def('dym').make(h) as { lok: string }).lok).toBe('r1');
  });

  it('bez mieszkańców z osobą teksty jak dziś', () => {
    const { h } = setup({ lokatorzy: undefined, residents: 4 });
    expect(def('dym').make(h)).toEqual({});
    expect(def('latarka').make(h)).toEqual({});
    expect(def('dym').text(h, {})).toBe(
      'Nad kuchnią idzie dym z rury wystawionej przez okno. Ktoś go zobaczył: puka pani Krysia z waszej klatki, ze słoikiem powideł z 2049 roku. Pyta, czy może posiedzieć przy kozie, bo u niej w mieszkaniu jest sześć stopni.',
    );
    expect(def('latarka').text(h, {})).toBe(
      'Pani Halina z waszej klatki przyniosła latarkę na korbkę. Minuta kręcenia daje pięć minut światła, a ona już nie ma siły kręcić.',
    );
    expect(ev('dym').text(h, {}).en).toContain('knocking at the door is old Krysia from your stairwell');
    expect(
      ev('dym')
        .choices(h, {})
        .map((c) => c.label.en),
    ).toEqual(['Ask her in to get warm', 'Take the jar and thank her']);
    expect(ev('latarka').text(h, {}).en).toContain('Old Halina from your stairwell has brought round');
    // stary zapis okna (dane bez bohaterki) czyta się po staremu także z mieszkańcami z osobą
    const z = setup().h;
    expect(def('dym').text(z, {})).toContain('pani Krysia z waszej klatki');
  });

  it('w domu bez zmian: sąsiadka zza płotu, mimo mieszkańców z osobą', () => {
    const dom = { ...setup().h.place(), kind: 'dom' as const, near: 'domy' as const, houses: 6, blocks: 0 };
    const { h } = setup({ place: dom });
    expect(def('dym').make(h)).toEqual({});
    expect(def('dym').text(h, {})).toContain('pani Krysia zza płotu');
    expect(def('latarka').make(h)).toEqual({});
  });
});

describe('„Sprawdzić” z krzyku i hałasu', () => {
  const noc = { hour: 23, strony: { garaze: 4111, blok: 4222 } };

  it('krzyk: fx.sprawdz z kafelkiem od strony najbliższego budynku mieszkalnego', () => {
    const { h, i } = setup(noc);
    const wybory = def('krzyk').choices(h, { help: true });
    expect(wybory[0].label).toBe('Wysłać kogoś sprawdzić');
    expect(wybory[0].ok).toBe(true);
    const { fx } = wybierz('krzyk', { help: true }, 0, noc);
    expect(fx.sprawdz).toEqual([{ id: i.people[0].id, tile: 4222 }]);
    // jak dotąd: zmęczenie osoby, sąsiad z workiem ziemniaków rano
    expect(fx.needs).toEqual([{ id: i.people[0].id, d: { rest: -10 } }]);
  });

  it('hałas: fx.sprawdz z kafelkiem od strony garaży, kot albo ktoś jak dotąd', () => {
    const { i } = setup(noc);
    for (const cat of [true, false]) {
      const { fx } = wybierz('halas', { cat }, 0, noc);
      expect(fx.sprawdz).toEqual([{ id: i.people[0].id, tile: 4111 }]);
      expect(fx.needs.find((n) => n.id === i.people[0].id)?.d.rest).toBe(-8);
    }
  });

  it('sprawdzający to najbardziej wypoczęty, który nie śpi, nie stoi na warcie, nie jest na wyprawie ani przy zabiegu', () => {
    const baza = new Atrapa(1).input().people;
    const klon = (k: number, rest: number, extra: Partial<GovPerson> = {}): GovPerson => ({
      ...baza[0],
      id: `x${k}`,
      pawn: 10 + k,
      name: `Osoba ${k}`,
      first: `O${k}`,
      needs: { ...baza[0].needs, rest },
      ...extra,
    });
    // 0 śpi, 1 stoi na warcie, 2 jest na wyprawie, 3 jest ugryziona, 4 operuje; 5 i 6 są wolne (65 wypoczęta bardziej)
    const osoby = [
      ...ludzie(
        [{ rest: 95 }, { rest: 94 }, { rest: 93 }, { rest: 92 }],
        [{ asleep: true }, { post: 'brama' }, { away: true }, { bitten: true }],
      ),
      klon(5, 91, { job: 'amputate' }),
      klon(6, 60),
      klon(7, 65),
    ];
    const { h } = setup({ ...noc, people: osoby });
    expect(h.doSprawdzenia()?.id).toBe('x7');
    const { fx } = wybierz('krzyk', { help: false }, 0, { ...noc, people: osoby });
    expect(fx.sprawdz?.map((s) => s.id)).toEqual(['x7']);
    // warta z menu (GovInput.guards) też wyklucza, zostaje druga wolna
    const zWarty = setup({ ...noc, people: osoby, guards: [{ id: 'x7', post: 'd1' }] });
    expect(zWarty.h.doSprawdzenia()?.id).toBe('x6');
    // rested() (pozostałe karty nocy) nadal bierze najbardziej wypoczętego z nieśpiących, z wartownikiem włącznie
    expect(h.rested()?.id).toBe(osoby[1].id);
  });

  it('warta z zatwierdzonej karty nocy też wyklucza, a wyprawa z nocnego planu też', () => {
    const { gov, i } = setup(noc);
    const [a, b, c, d] = i.people;
    gov.night = {
      day: 3,
      card: {} as never,
      assign: { [a.id]: 'warta:brama', [b.id]: 'wyprawa:blisko', [c.id]: 'sen', [d.id]: 'sen' },
      confirmed: true,
      raid: null,
      exp: [{ key: 'wyprawa:blisko', ids: [b.id], target: 'garaze' }],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    const wejscie = { ...i, people: ludzie([{ rest: 99 }, { rest: 98 }, { rest: 40 }, { rest: 50 }]) };
    // pierwsza stoi na wartę z karty, druga jest na wyprawie z planu (obie najbardziej wypoczęte): zostają dwie dalsze
    expect(makeHost(gov, wejscie, emptyEffects()).doSprawdzenia()?.id).toBe(d.id);
    // plan z poprzedniej doby nie liczy się
    gov.night.day = 2;
    expect(makeHost(gov, wejscie, emptyEffects()).doSprawdzenia()?.id).toBe(a.id);
    // niezatwierdzona karta też nie wyklucza
    gov.night.day = 3;
    gov.night.confirmed = false;
    expect(makeHost(gov, wejscie, emptyEffects()).doSprawdzenia()?.id).toBe(a.id);
  });

  it('gdy nikt nie czuwa, wstaje najbardziej wypoczęty ze śpiących spoza warty, wyprawy i zabiegu', () => {
    // 0 śpi na warcie (post), 1 śpi i jest ugryziony, 2 śpi, 3 śpi (wypoczęta mniej)
    const spiacy = ludzie(
      [{ rest: 99 }, { rest: 98 }, { rest: 80 }, { rest: 50 }],
      [{ asleep: true, post: 'brama' }, { asleep: true, bitten: true }, { asleep: true }, { asleep: true }],
    );
    const { h, i } = setup({ ...noc, people: spiacy });
    expect(h.nieSpia()).toEqual([]);
    expect(h.doSprawdzenia()?.id).toBe(i.people[2].id);
    expect(def('krzyk').choices(h, { help: true })[0].ok).toBe(true);
    expect(def('halas').choices(h, { cat: true })[0].ok).toBe(true);
    const k = wybierz('krzyk', { help: true }, 0, { ...noc, people: spiacy });
    expect(k.fx.sprawdz).toEqual([{ id: i.people[2].id, tile: 4222 }]);
    // koszt snu zostaje na tym, kto idzie
    expect(k.fx.needs).toEqual([{ id: i.people[2].id, d: { rest: -10 } }]);
    const hl = wybierz('halas', { cat: true }, 0, { ...noc, people: spiacy });
    expect(hl.fx.sprawdz).toEqual([{ id: i.people[2].id, tile: 4111 }]);
    expect(hl.fx.needs.find((n) => n.id === i.people[2].id)?.d.rest).toBe(-8);
  });

  it('czuwający ma pierwszeństwo przed śpiącym, choćby był mniej wypoczęty', () => {
    const { h, i } = setup({
      ...noc,
      people: ludzie(
        [{ rest: 99 }, { rest: 40 }, { rest: 98 }, { rest: 97 }],
        [{ asleep: true }, {}, { asleep: true }, { asleep: true }],
      ),
    });
    expect(h.doSprawdzenia()?.id).toBe(i.people[1].id);
  });

  it('gdy wszyscy są na warcie, na wyprawie, ugryzieni albo operują, „Sprawdzić” jest niedostępne, a „Zamknąć drzwi” nie', () => {
    const zajeci = ludzie(
      [{ rest: 90 }, { rest: 90 }, { rest: 90 }, { rest: 90 }],
      [{ post: 'brama' }, { away: true, asleep: true }, { bitten: true, asleep: true }, { job: 'amputate' }],
    );
    const { h } = setup({ ...noc, people: zajeci });
    expect(h.doSprawdzenia()).toBeNull();
    expect(
      def('krzyk')
        .choices(h, { help: true })
        .map((c) => c.ok),
    ).toEqual([false, true]);
    expect(
      def('halas')
        .choices(h, { cat: true })
        .map((c) => c.ok),
    ).toEqual([false, true]);
    // wybór niedostępnego niczego nie robi
    const { fx } = wybierz('halas', { cat: true }, 0, { ...noc, people: zajeci });
    expect(fx.sprawdz).toBeUndefined();
    // śpiący wartownik z menu (GovInput.guards) też zostaje na posterunku
    const spiaca = ludzie([], [{ asleep: true }, { asleep: true }, { asleep: true }, { asleep: true }]);
    const z = setup({ ...noc, people: spiaca, guards: spiaca.map((p) => ({ id: p.id, post: 'd1' })) });
    expect(z.h.doSprawdzenia()).toBeNull();
  });

  it('bez stron: kafelek największej dziury, a bez kafelków dziur „Sprawdzić” jest niedostępne', () => {
    const dziury = {
      holes: [
        { id: 1, size: 0.3, tiles: [40, 41] },
        { id: 2, size: 0.8, tiles: [500, 501] },
      ],
      durability: 0.5,
    };
    const bezStron = { hour: 23, strony: undefined, fence: dziury };
    const { h, i } = setup(bezStron);
    expect(h.kafelekPrzySiatce('blok')).toBe(500);
    expect(h.kafelekPrzySiatce('garaze')).toBe(500);
    const { fx } = wybierz('krzyk', { help: false }, 0, bezStron);
    expect(fx.sprawdz).toEqual([{ id: i.people[0].id, tile: 500 }]);
    // atrapa ma kafelki dziur i strony, więc bez nich trzeba je zabrać
    const zAtrapy = setup({ hour: 23 });
    expect(zAtrapy.h.kafelekPrzySiatce('blok')).toBe(4222);
    expect(zAtrapy.h.kafelekPrzySiatce('garaze')).toBe(4111);
    const bezKafelkow = {
      holes: zAtrapy.i.fence!.holes.map(({ tiles: _t, ...d }) => d),
      durability: 0.5,
    };
    const bez = setup({ hour: 23, strony: undefined, fence: bezKafelkow });
    expect(bez.h.kafelekPrzySiatce('blok')).toBeNull();
    expect(def('krzyk').choices(bez.h, { help: true })[0].ok).toBe(false);
    expect(def('halas').choices(bez.h, { cat: true })[0].ok).toBe(false);
    // strona, której świat nie ma, wraca do dziury
    const tylkoBlok = setup({ hour: 23, strony: { blok: 77 }, fence: dziury }).h;
    expect(tylkoBlok.kafelekPrzySiatce('blok')).toBe(77);
    expect(tylkoBlok.kafelekPrzySiatce('garaze')).toBe(500);
  });

  it('po angielsku napisy zostają, a karty bez zmian w tekście', () => {
    const { h } = setup(noc);
    expect(
      ev('krzyk')
        .choices(h, { help: true })
        .map((c) => c.label.en),
    ).toEqual(['Send someone to check', 'Lock the door and stay in']);
    expect(
      ev('halas')
        .choices(h, { cat: true })
        .map((c) => c.label.en),
    ).toEqual(['Check with a torch', 'Go back to sleep']);
  });
});

describe('host: moodOf, zarzad, nieSpia', () => {
  it('moodOf wpisuje nastrój jednej osoby do fx.moods, bez powtórzeń zbiorczych', () => {
    const { h, fx } = setup();
    h.moodOf('r1', 'Najadła się z kotła', 6, 24);
    h.moodOf('r2', 'Najadł się z kotła', 4, 12);
    expect(fx.moods).toEqual([
      { id: 'r1', why: 'Najadła się z kotła', d: 6, hours: 24 },
      { id: 'r2', why: 'Najadł się z kotła', d: 4, hours: 12 },
    ]);
  });

  it('zarzad i nieSpia oddają kopie, bez osób, które wychodzą', () => {
    const { h, i } = setup({ people: ludzie([], [{ asleep: true }, {}, {}, {}]) });
    expect(h.zarzad().map((p) => p.id)).toEqual(i.people.map((p) => p.id));
    expect(h.nieSpia().map((p) => p.id)).toEqual(i.people.slice(1).map((p) => p.id));
    h.zarzad()[0].needs.mood = -3;
    h.zarzad()[0].skills.bud = 9;
    expect(i.people[0].needs.mood).not.toBe(-3);
    h.wyrzuc(i.people[1].id);
    expect(h.zarzad().map((p) => p.id)).toEqual([i.people[0].id, i.people[2].id, i.people[3].id]);
    expect(h.nieSpia().map((p) => p.id)).toEqual([i.people[2].id, i.people[3].id]);
    expect(h.rested()?.id).not.toBe(i.people[1].id);
  });
});

describe('strony świata (GovInput.strony)', () => {
  /** mały świat: siedziba 10–20, podwórko 8–22, garaż na wschodzie, blok na północy, dalszy dom na południu */
  function swiat(over: Partial<Parameters<typeof stronyOf>[0]> = {}): Parameters<typeof stronyOf>[0] {
    const size = 100;
    const yard: number[] = [];
    for (let y = 8; y <= 22; y++) for (let x = 8; x <= 22; x++) yard.push(y * size + x);
    const b = (id: number, cls: 'blok' | 'dom' | 'garaz', x0: number, y0: number, x1: number, y1: number) => ({
      id,
      cls,
      levels: 1,
      name: `${cls}${id}`,
      area: 100,
      tiles: 100,
      x0,
      y0,
      x1,
      y1,
      cats: [],
      entrances: [],
      tags: {},
    });
    return {
      size,
      hq: 0,
      buildings: [
        b(0, 'blok', 10, 10, 20, 20),
        b(1, 'garaz', 60, 14, 70, 18),
        b(2, 'blok', 12, 70, 22, 80),
        b(3, 'dom', 14, 30, 18, 34),
        b(4, 'garaz', 30, 90, 36, 94),
      ],
      fence: { yard },
      ...over,
    } as Parameters<typeof stronyOf>[0];
  }

  it('wolny kafelek podwórka najbliżej środka najbliższych garaży i najbliższego budynku mieszkalnego', () => {
    const s = stronyOf(swiat());
    // garaż (1) środek (65, 16): najbliższy kafelek podwórka to (22, 16)
    expect(s.garaze).toBe(16 * 100 + 22);
    // najbliższy budynek mieszkalny to dom (3) ze środkiem (16, 32): kafelek podwórka (16, 22)
    expect(s.blok).toBe(22 * 100 + 16);
  });

  it('pomija kafelki nie do przejścia, budynki otoczone płotem i bez podwórka daje pusty obiekt', () => {
    const w = swiat();
    const blocked = new Uint8Array(100 * 100);
    blocked[22 * 100 + 16] = 1;
    // zablokowany kafelek odpada, wybiera sąsiedni (przy remisie niższy numer)
    expect(stronyOf({ ...w, blocked }).blok).toBe(22 * 100 + 15);
    // dom (3) jest otoczony wspólnym płotem, więc najbliższy za siatką to blok (2) ze środkiem (17, 75)
    expect(stronyOf(w, new Set([3])).blok).toBe(22 * 100 + 17);
    expect(stronyOf({ ...w, fence: { yard: [] } })).toEqual({});
    expect(stronyOf({ ...w, fence: undefined })).toEqual({});
  });

  it('garaże dalej niż 150 m i budynki dalej niż 120 m się nie liczą', () => {
    const w = swiat();
    w.buildings = [w.buildings[0], { ...w.buildings[1], x0: 195, x1: 205 }, { ...w.buildings[2], y0: 150, y1: 160 }];
    expect(stronyOf(w)).toEqual({});
  });

  it('govInput z prawdziwego świata: kafelki podwórka najbliżej wskazanych budynków, bez strony pola pustej', () => {
    const w = demoWorld('przymorze');
    const st = createSim(w, 7, { core: 4 });
    const i = govInput(st, w, 0);
    expect(i.strony).toBeDefined();
    const yard = new Set(w.fence.yard);
    for (const [strona, t] of Object.entries(i.strony ?? {})) {
      // garaże i blok to kafelki podwórka; koza leży we wnętrzu (osobny test)
      if (strona === 'koza') continue;
      expect(yard.has(t)).toBe(true);
      expect(w.blocked[t]).toBe(0);
    }
    // najbliższy budynek mieszkalny: żaden inny kafelek podwórka nie jest bliżej jego środka
    const hq = w.buildings[w.hq];
    const mid = (b: typeof hq) => [Math.round((b.x0 + b.x1) / 2), Math.round((b.y0 + b.y1) / 2)];
    const [hx, hy] = mid(hq);
    const sasiedzi = w.buildings
      .filter((b, k) => k !== w.hq && (b.cls === 'blok' || b.cls === 'dom'))
      .map((b) => ({ at: mid(b), d: (mid(b)[0] - hx) ** 2 + (mid(b)[1] - hy) ** 2 }))
      .sort((a, b) => a.d - b.d);
    const blisko = sasiedzi[0];
    const dKafelka = (t: number) => ((t % w.size) - blisko.at[0]) ** 2 + (Math.floor(t / w.size) - blisko.at[1]) ** 2;
    if (i.strony?.blok !== undefined) {
      const najlepszy = Math.min(...w.fence.yard.filter((t) => !w.blocked[t]).map(dKafelka));
      expect(dKafelka(i.strony.blok)).toBe(najlepszy);
    }
    // dziury w siatce niosą swoje kafelki
    expect(i.fence?.holes.length).toBeGreaterThan(0);
    for (const dz of i.fence?.holes ?? []) expect(dz.tiles?.length).toBeGreaterThan(0);
    // ten sam wynik z pamięci i bez zmiany stanu
    const przed = hashString(JSON.stringify(st));
    expect(govInput(st, w, 0).strony).toEqual(i.strony);
    expect(hashString(JSON.stringify(st))).toBe(przed);
  });

  it('świat bez siatki nie ma stron przy siatce (garaże, blok); koza zostaje', () => {
    const w = demoWorld('przymorze');
    const bez = { ...w, fence: { ...w.fence, tiles: [], yard: [] } } as World;
    const s = govInput(createSim(bez, 7, { core: 2 }), bez, 0).strony;
    expect(s?.garaze).toBeUndefined();
    expect(s?.blok).toBeUndefined();
  });

  it('strony.koza: wolny kafelek przed kozą zarządu we wnętrzu jego mieszkania, zmienia się razem z kozą, bez kozy go nie ma', () => {
    const w = demoWorld('przymorze');
    const st = createSim(w, 7, { core: 4 });
    const h = houseOf(w)!;
    const size = w.size;
    const koza = st.things.find((t) => t.kind === 'koza' && inHomeApt(h, t.y * size + t.x));
    expect(koza, 'zarząd ma kozę w mieszkaniu').toBeTruthy();
    const kafel = govInput(st, w, 0).strony?.koza;
    expect(kafel).toBe(frontTile(koza!, size));
    expect(inHomeApt(h, kafel!)).toBe(true);
    expect(w.blocked[kafel!]).toBe(0);
    // obok kozy: najwyżej dwa kafelki od niej
    const dx = Math.abs((kafel! % size) - koza!.x);
    const dy = Math.abs(Math.floor(kafel! / size) - koza!.y);
    expect(Math.max(dx, dy)).toBeLessThanOrEqual(2);
    // bez kozy w mieszkaniu zarządu pola nie ma (garaże i blok zostają)
    const bezKozy = structuredClone(st);
    bezKozy.things = bezKozy.things.filter((t) => t.kind !== 'koza');
    const s = govInput(bezKozy, w, 0).strony;
    expect(s?.koza).toBeUndefined();
    expect(s?.blok).toBe(govInput(st, w, 0).strony?.blok);
  });
});

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

function demoWorld(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${key}.json`), 'utf8'));
  const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
  return buildWorld(d.geo, { seed, street: d.street });
}

describe('na prawdziwej symulacji z mieszkańcami z generatora', () => {
  let w: World;
  let st: SimState;
  let mieszkancy: ReturnType<typeof opcjaMieszkancow>;
  const seed = 2051;

  beforeAll(async () => {
    const demo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo/przymorze.json'), 'utf8')) as {
      geo: Parameters<typeof mapaMieszkancow>[0];
      addr: string;
      street: string;
    };
    const dane = await wczytajDaneMieszkancow(demo.geo.c[0], demo.geo.c[1], plikowy);
    if (!dane) throw new Error('brak tabel mieszkańców dla przymorza');
    const geo = mapaMieszkancow(demo.geo, dane);
    w = buildWorld(geo, { seed, street: demo.street });
    const l = mieszkancyNowejGry(w, geo, dane, 4);
    if (!l) throw new Error('generator mieszkańców nie dał wyniku dla przymorza');
    mieszkancy = opcjaMieszkancow(l);
    st = createSim(w, seed, { core: 4, mieszkancy });
  }, 60_000);

  it('fachowiec: Wciągnąć do roboty przenosi mieszkańca do zarządu (ten sam pionek, rodzaj core)', () => {
    const zero = Object.fromEntries(TECH_DOMS.map((d) => [d, 0]));
    const i = { ...govInput(st, w, 0), know: zero };
    const kandydat = (i.lokatorzy ?? []).find((l) => TECH_DOMS.some((dz) => (l.skills[dz] ?? 0) > 0));
    expect(kandydat, 'generator dał mieszkańca z umiejętnością').toBeTruthy();
    const gov = newGov(seed);
    const h = makeHost(gov, i, emptyEffects());
    expect(def('fachowiec').w(h)).toBeGreaterThan(0);
    const d = JSON.parse(JSON.stringify(def('fachowiec').make(h))) as { lok: string };
    gov.ev.active = { id: 'fachowiec', d };
    const fx = chooseEvent(gov, i, 0);
    expect(fx.awans).toEqual([d.lok]);
    expect(fx.join).toEqual([]);
    const kopia = structuredClone(st);
    applyGov(kopia, w, fx);
    const pionek = kopia.pawns.find((p) => p.person >= 0 && kopia.people[p.person].id === d.lok);
    expect(pionek?.kind).toBe('core');
  });

  it('krzyk: Sprawdzić wysyła osobę zarządu na kafelek podwórka od strony budynku mieszkalnego', () => {
    const i = {
      ...govInput(st, w, 0),
      hour: 23,
      minute: 0,
      day: 3,
      people: govInput(st, w, 0).people.map((p) => ({ ...p, asleep: false, post: null })),
    };
    expect(i.strony?.blok).toBeDefined();
    const gov = newGov(seed);
    gov.ev.active = { id: 'krzyk', d: { help: false } };
    const fx = chooseEvent(gov, i, 0);
    expect(fx.sprawdz).toHaveLength(1);
    expect(fx.sprawdz?.[0].tile).toBe(i.strony?.blok);
    const kopia = structuredClone(st);
    applyGov(kopia, w, fx);
    const kto = kopia.pawns.find((p) => p.kind === 'core' && kopia.people[p.person].id === fx.sprawdz?.[0].id);
    expect(kto?.job?.t).toBe('sprawdz');
  });
  it('krzyk w nocy, gdy śpią wszyscy: wstaje śpiąca osoba, idzie na kafelek i wraca do spania', () => {
    const gra = structuredClone(st);
    const sim = new Sim(w, gra);
    // pierwsza noc: aż wszyscy z zarządu śpią (bez zarządu karty nocy nikt nie stoi na warcie)
    let i = govInput(gra, w, 0);
    for (let n = 0; n < 12_000 && !(i.night && i.people.every((p) => p.asleep)); n++) {
      sim.step();
      if (n % 20 === 0) i = govInput(gra, w, 0);
    }
    expect(i.night && i.people.every((p) => p.asleep)).toBe(true);
    const gov = newGov(seed);
    gov.ev.active = { id: 'krzyk', d: { help: false } };
    const fx = chooseEvent(gov, i, 0);
    const idx = fx.sprawdz?.[0];
    expect(idx?.tile).toBe(i.strony?.blok);
    // najbardziej wypoczęty ze śpiących
    const najlepszy = [...i.people].sort((a, b) => b.needs.rest - a.needs.rest || (a.id < b.id ? -1 : 1))[0];
    expect(idx?.id).toBe(najlepszy.id);
    applyGov(gra, w, fx);
    const pionek = gra.pawns.find((p) => p.kind === 'core' && gra.people[p.person].id === idx?.id);
    expect(pionek?.job?.t).toBe('sprawdz');
    // idzie, stoi i po kilku godzinach gry nie tkwi już w sprawdzaniu (wraca do planu dnia)
    let sprawdzal = false;
    for (let n = 0; n < 4000; n++) {
      sim.step();
      if (pionek?.job?.t === 'sprawdz') sprawdzal = true;
    }
    expect(sprawdzal).toBe(true);
    expect(pionek?.job?.t).not.toBe('sprawdz');
  });

  it('bezsenność w nocy, gdy śpią wszyscy: śpiący bohater wstaje, idzie do kozy z drugą osobą i wraca do spania', () => {
    const gra = structuredClone(st);
    const sim = new Sim(w, gra);
    let i = govInput(gra, w, 0);
    for (let n = 0; n < 12_000 && !(i.night && i.people.every((p) => p.asleep)); n++) {
      sim.step();
      if (n % 20 === 0) i = govInput(gra, w, 0);
    }
    expect(i.night && i.people.every((p) => p.asleep)).toBe(true);
    const koza = i.strony?.koza;
    expect(koza).toBeDefined();
    const gov = newGov(seed);
    const d = def('bezsennosc').make(makeHost(gov, i, emptyEffects())) as { p: string; spi?: boolean };
    expect(d.spi).toBe(true);
    // bohater to śpiący o najniższym bezpieczeństwie (remis: pierwszy)
    const bohater = [...i.people].sort((a, b) => a.needs.safe - b.needs.safe)[0];
    expect(d.p).toBe(bohater.id);
    gov.ev.active = { id: 'bezsennosc', d };
    const fx = chooseEvent(gov, i, 0);
    expect(fx.sprawdz).toHaveLength(2);
    expect(fx.sprawdz?.[0]).toEqual({ id: bohater.id, tile: koza });
    const druga = fx.sprawdz?.[1];
    expect(druga?.tile).toBe(koza);
    expect(druga?.id).not.toBe(bohater.id);
    applyGov(gra, w, fx);
    const pionek = (id?: string) => gra.pawns.find((p) => p.kind === 'core' && gra.people[p.person].id === id)!;
    const ona = pionek(bohater.id);
    const ono = pionek(druga?.id);
    expect(ona.job?.t).toBe('sprawdz');
    expect(ono.job?.t).toBe('sprawdz');
    // stoją przy kozie, we wnętrzu mieszkania zarządu, a potem wracają do snu
    const h = houseOf(w)!;
    const size = w.size;
    const blisko = (p: typeof ona) =>
      Math.max(Math.abs(Math.floor(p.x) - (koza! % size)), Math.abs(Math.floor(p.y) - Math.floor(koza! / size))) <= 3;
    let stali = 0;
    let wewnatrz = true;
    let spiPotem = false;
    for (let n = 0; n < 3000; n++) {
      sim.step();
      for (const p of [ona, ono])
        if (p.job?.t === 'sprawdz' && p.job.phase === 1) {
          stali++;
          wewnatrz &&= inHomeApt(h, Math.floor(p.y) * size + Math.floor(p.x)) && blisko(p);
        }
      if (n > 1500 && ona.job?.t === 'sleep' && ono.job?.t === 'sleep') spiPotem = true;
    }
    expect(stali).toBeGreaterThan(200);
    expect(wewnatrz).toBe(true);
    expect(spiPotem).toBe(true);
  });

  it('kradzież wypada w normalnej grze z mieszkańcami z osobą, bez wspólnego kotła', () => {
    let razy = 0;
    for (const ziarno of [1, 2, 3, 4]) {
      const r = playWithGov(w, ziarno, 'zawsze-warta', 6, 4, { mieszkancy });
      razy += r.decisions.filter((d) => d.kind === 'wydarzenie' && d.text.startsWith('Kradzież z piwnicy')).length;
    }
    expect(razy).toBeGreaterThan(0);
  }, 120_000);
});
