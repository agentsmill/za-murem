/* Zarząd pamięta ludzi (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 4, „Pamięć o znajomych”): każda
   decyzja o gościu zostawia wpis `Znajomy` z nastawieniem z tabeli (nakarmiony +1, nocleg +1, przyjęty +2, odprawiony 0
   albo −1, okradł −1, złapany i wyrzucony −2, zakres −2..2), wyrzucony mieszkaniec też; ten sam człowiek to jeden wpis.
   Dodatni znajomy wraca jako prawdziwy gość (ten sam człowiek i wygląd) najwyżej raz na 4 doby i nie wcześniej niż po 2
   dobach, nie wraca, póki mieszka u nas; ujemny w zwykłym trybie dołącza do najbliższego napadu (jeden szabrownik ma jego
   wygląd, raport mówi, kto to), w zombie nie wraca. Zarząd na atrapie z gov-atrapa.ts, szabrownik na prawdziwej
   symulacji, powrót na prawdziwej symulacji z obcymi. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { type Gosc, KTO, type KtoId, osobyGrupy, skladPowrotu } from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import { confirm, poscigNocy } from '../../src/gov/noc.ts';
import type { FazaGoscia, GovEffects, GovGosc, GovInput, GovLokator, GovState, RaidPlan } from '../../src/gov/typy.ts';
import { planujPowrot } from '../../src/gov/wizyta.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, eventView, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import {
  chooseEvent,
  confirmNight,
  govUpdate,
  loadGov,
  newGov,
  normalizujTeksty,
  pending,
  saveGov,
} from '../../src/gov/zarzad.ts';
import {
  doPowrotu,
  epitet,
  type JakId,
  NASTAWIENIE,
  NIKOGO,
  type Obecni,
  obecniWOsiedlu,
  POWROT_ODSTEP_DNI,
  POWROT_WIEK_DNI,
  wrogDoNapadu,
  type Znajomy,
  zapamietaj,
} from '../../src/gov/znajomi.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { Atrapa, at, TPH, TPS } from './gov-atrapa.ts';
import { mockBlock } from './interior-mock.ts';
import { polskieSlowa } from './po-angielsku.ts';

const def = (id: string) => M1_EVENTS.find((e) => e.id === id)!;
const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);

// ---------------------------------------------------------------- pomocnicy

let licznik = 1;
/** gość z ręcznie ustawionymi klockami (osoby z generatora grup, id g1p0…), reszta wartość domyślna */
function reczny(over: Partial<Gosc> & { ilu?: number } = {}): Gosc {
  const { ilu, ...rest } = over;
  const kto: KtoId = rest.kto ?? 'wedrowiec';
  const osoby = rest.osoby ?? osobyGrupy(mulberry(5), () => licznik++, kto, ilu ?? KTO[kto].ilu[0], new Set<string>());
  osoby.forEach((p, i) => {
    p.id = `g1p${i}`;
  });
  return {
    id: 'g1',
    kto,
    chce: 'nocleg',
    ma: 'nic',
    haczyk: 'prawda',
    skad: { strona: 'n', nazwa: frazaSkad('apteka', 'Pod Różą') },
    ...rest,
    osoby,
  };
}

interface Stan {
  gov: GovState;
  i: GovInput;
  atr: Atrapa;
}

const LOOKI = [9, 4, 13, 6, 11];

/** Zarząd z otwartą kartą gościa pod bramą (trzeci dzień, 16:00, dużo zapasów); wygląd osób z `LOOKI`. Bez gościa: sam
    zarząd z pustą listą gości. */
function stan(
  g: Gosc | null,
  o: {
    wpis?: Partial<GovGosc>;
    mode?: 'zwykly' | 'zombie';
    input?: Partial<GovInput>;
    seed?: number;
    karta?: boolean;
    aktywny?: Partial<NonNullable<GovState['goscie']>['aktywny']>;
    dzien?: number;
    godzina?: number;
  } = {},
): Stan {
  const seed = o.seed ?? 3;
  const gov = newGov(seed, o.mode ?? 'zwykly');
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.tick = tickAt(o.dzien ?? 3, o.godzina ?? 16);
  const wpis: GovGosc | null = g
    ? {
        id: g.id,
        faza: 'brama',
        tile: 1234,
        gdzie: { x: 34, y: 12 },
        pawns: g.osoby.map((_, k) => 100 + k),
        zywi: g.osoby.map((_, k) => k),
        ukradl: 0,
        ...o.wpis,
      }
    : null;
  if (wpis && o.wpis?.pawns && !o.wpis.zywi) wpis.zywi = o.wpis.pawns.map((_, k) => k);
  const i: GovInput = {
    ...atr.input(),
    screen: 1000,
    kozaLit: true,
    goscie: wpis ? [wpis] : [],
    napady: [],
    ...o.input,
  };
  if (g) {
    gov.goscie = { n: 1, czytane: 0, aktywny: { gosc: g, od: 900, karta: true, looks: LOOKI, ...o.aktywny } };
    if (o.karta !== false) gov.ev.active = { id: 'gosc', d: { id: g.id } };
  }
  return { gov, i, atr };
}

const etykiety = (s: Stan): string[] => (eventView(s.gov, s.i)?.choices ?? []).map((c) => c.label.pl);

/** wybiera na otwartej karcie wybór o danym początku napisu i oddaje skutki */
function wybierz(s: Stan, prefix: string): GovEffects {
  const k = etykiety(s).findIndex((l) => l.startsWith(prefix));
  expect(k, `brak wyboru „${prefix}”: ${etykiety(s).join(' | ')}`).toBeGreaterThanOrEqual(0);
  return chooseEvent(s.gov, s.i, k);
}

/** wejście zmienione tak, żeby wizyta miała daną fazę */
const zFaza = (s: Stan, faza: FazaGoscia, over: Partial<GovGosc> = {}, input: Partial<GovInput> = {}): GovInput => ({
  ...s.i,
  goscie: s.i.goscie!.map((w) => ({ ...w, faza, ...over })),
  ...input,
});

const znajomi = (s: Stan): Znajomy[] => s.gov.znajomi ?? [];
/** id otwartej karty (funkcja, żeby TypeScript nie zawężał pola po wcześniejszym przypisaniu null) */
const otwarta = (s: Stan): string | undefined => s.gov.ev.active?.id;

/** znajomy ręcznie: dodatni wędrowiec, nakarmiony dnia 1 */
function zn(over: Partial<Znajomy> = {}): Znajomy {
  return {
    id: 'g0p0',
    osoba: { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47 },
    prof: 'Hydraulik',
    look: 9,
    kto: 'wedrowiec',
    jak: 'nakarmiony',
    nastawienie: 1,
    dzien: 1,
    wizyty: 1,
    ostatnio: 1,
    ...over,
  };
}

/** obecni w osiedlu do testów: imiona, numery pionków i zmarli */
const obecni = (imiona: string[] = [], pionki: number[] = [], zmarli: string[] = []): Obecni => ({
  imiona: new Set(imiona),
  pionki: new Set(pionki),
  zmarli: new Set(zmarli),
});

// ---------------------------------------------------------------- wpis po decyzji o gościu

describe('decyzja o gościu zostawia znajomego', () => {
  it('tabela nastawień: nakarmiony +1, nocleg +1, przyjęty +2, odprawiony 0, okradł −1, wyrzucony i złapany −2', () => {
    expect(NASTAWIENIE).toEqual({
      nakarmiony: 1,
      nocleg: 1,
      przyjety: 2,
      odprawiony: 0,
      okradl: -1,
      wyrzucony: -2,
      zlapany: -2,
    });
  });

  it('każda decyzja o gościu zapisuje znajomego z nastawieniem z tabeli', () => {
    const fach = reczny({ chce: 'dolaczyc', ma: 'fach' });
    fach.osoby[0].skills = { elek: 3 };
    const BEZ_WIEDZY = { bud: 0, cieplo: 0, elek: 0, med: 0, uprawa: 0, it: 0 };
    const PRZYPADKI: {
      nazwa: string;
      gosc: Gosc;
      wybor: string;
      jak: JakId;
      n: number;
      zapasy?: number;
      input?: Partial<GovInput>;
    }[] = [
      { nazwa: 'wpuścić na noc', gosc: reczny({ chce: 'nocleg' }), wybor: 'Wpuścić na noc', jak: 'nocleg', n: 1 },
      { nazwa: 'jedzenie', gosc: reczny({ chce: 'jedzenie' }), wybor: 'Podać jedzenie', jak: 'nakarmiony', n: 1 },
      {
        nazwa: 'leki',
        gosc: reczny({ chce: 'leki', ma: 'wiadomosc' }),
        wybor: 'Dać leki',
        jak: 'nakarmiony',
        n: 1,
      },
      {
        nazwa: 'wymiana',
        gosc: reczny({ chce: 'wymiana', ma: 'wiadomosc' }),
        wybor: 'Przystać na wymianę',
        jak: 'nakarmiony',
        n: 1,
      },
      {
        nazwa: 'przechowanie',
        gosc: reczny({ chce: 'przechowac', ma: 'rzecz', rzecz: { meds: 2 } }),
        wybor: 'Przyjąć na przechowanie',
        jak: 'nakarmiony',
        n: 1,
      },
      {
        nazwa: 'wysłuchanie',
        gosc: reczny({ chce: 'wiadomosc', ma: 'wiadomosc' }),
        wybor: 'Wysłuchać',
        jak: 'nakarmiony',
        n: 1,
      },
      {
        nazwa: 'przyjęcie do spółdzielni',
        gosc: reczny({ chce: 'dolaczyc' }),
        wybor: 'Przyjąć do spółdzielni',
        jak: 'przyjety',
        n: 2,
      },
      {
        nazwa: 'przyjęcie do zarządu',
        gosc: fach,
        wybor: 'Przyjąć do zarządu',
        jak: 'przyjety',
        n: 2,
        input: { know: BEZ_WIEDZY },
      },
      { nazwa: 'odprawa', gosc: reczny({ chce: 'nocleg' }), wybor: 'Odprawić', jak: 'odprawiony', n: 0 },
      {
        nazwa: 'odprawa głodnego przy pełnych zapasach',
        gosc: reczny({ chce: 'jedzenie' }),
        wybor: 'Odprawić',
        jak: 'odprawiony',
        n: -1,
        zapasy: 6,
      },
      {
        nazwa: 'odprawa głodnego przy skąpych zapasach (5 to jeszcze skąpo)',
        gosc: reczny({ chce: 'jedzenie' }),
        wybor: 'Odprawić',
        jak: 'odprawiony',
        n: 0,
        zapasy: 5,
      },
    ];
    for (const p of PRZYPADKI) {
      const s = stan(p.gosc, { input: p.input });
      if (p.zapasy !== undefined) s.i = { ...s.i, stock: { ...s.i.stock, supplies: p.zapasy } };
      wybierz(s, p.wybor);
      const l = znajomi(s);
      expect(l, p.nazwa).toHaveLength(1);
      const mowiacy = p.gosc.osoby[0];
      expect(l[0], p.nazwa).toMatchObject({
        id: mowiacy.id,
        osoba: { first: mowiacy.first, name: mowiacy.name, f: mowiacy.f, age: mowiacy.age },
        look: LOOKI[0],
        pion: 100,
        kto: p.gosc.kto,
        jak: p.jak,
        nastawienie: p.n,
        dzien: 3,
        wizyty: 1,
        ostatnio: 3,
      });
    }
  });

  it('znajomym jest mówiący: pierwsza żywa osoba grupy, z jej wyglądem', () => {
    // zmarła pierwsza osoba: karta nazywa drugą i to ją zarząd zapamięta
    const g = reczny({ kto: 'rodzina', ilu: 4, chce: 'nocleg' });
    const s = stan(g, { wpis: { zywi: [1, 2, 3], pawns: [101, 102, 103] } });
    wybierz(s, 'Wpuścić na noc');
    expect(znajomi(s)).toHaveLength(1);
    expect(znajomi(s)[0]).toMatchObject({
      id: g.osoby[1].id,
      osoba: { name: g.osoby[1].name },
      look: LOOKI[1],
      pion: 101,
    });
    // tylko jeden wpis na wizytę, choć grupa ma cztery osoby
    const cala = stan(reczny({ kto: 'rodzina', ilu: 4, chce: 'nocleg' }));
    wybierz(cala, 'Wpuścić na noc');
    expect(znajomi(cala)).toHaveLength(1);
  });

  it('noc bez kradzieży zostaje nocą, a noc z kradzieżą to okradł −1 (jedna wizyta, jeden wpis)', () => {
    // wpuszczony na noc: od razu nocleg +1
    const s = stan(reczny({ chce: 'nocleg', haczyk: 'klamie' }));
    wybierz(s, 'Wpuścić na noc');
    s.gov.ev.active = null;
    expect(znajomi(s)[0]).toMatchObject({ jak: 'nocleg', nastawienie: 1, wizyty: 1 });
    // rano uciekł z łupem: okradł −1, nie nocleg, wizyt wciąż jedna
    eventTick(s.gov, zFaza(s, 'odchodzi', { ukradl: 3 }, { day: 4, hour: 2, minute: 30 }), emptyEffects(), false);
    expect(znajomi(s)).toHaveLength(1);
    expect(znajomi(s)[0]).toMatchObject({ jak: 'okradl', nastawienie: -1, wizyty: 1 });
    // kolejny odczyt tej samej kradzieży nic nie zmienia
    eventTick(
      s.gov,
      zFaza(s, 'poszedl', { ukradl: 3, pawns: [], zywi: [] }, { day: 4, hour: 3 }),
      emptyEffects(),
      false,
    );
    expect(znajomi(s)[0]).toMatchObject({ jak: 'okradl', nastawienie: -1, wizyty: 1 });
    // gość, który tylko przespał noc, zostaje przy nocleg +1
    const spokojny = stan(reczny({ chce: 'nocleg' }));
    wybierz(spokojny, 'Wpuścić na noc');
    spokojny.gov.ev.active = null;
    eventTick(
      spokojny.gov,
      zFaza(spokojny, 'poszedl', { pawns: [], zywi: [] }, { day: 4, hour: 7 }),
      emptyEffects(),
      false,
    );
    expect(znajomi(spokojny)[0]).toMatchObject({ jak: 'nocleg', nastawienie: 1, wizyty: 1 });
  });

  it('złapany złodziej: każda z trzech decyzji to złapany −2, także po wpisie nocleg', () => {
    for (const wybor of ['Oddać jedzenie', 'Wyrzucić z łupem', 'Zatrzymać do rana']) {
      const s = stan(reczny({ chce: 'nocleg', haczyk: 'klamie' }));
      wybierz(s, 'Wpuścić na noc');
      s.gov.ev.active = null;
      expect(znajomi(s)[0]).toMatchObject({ jak: 'nocleg', nastawienie: 1 });
      // o 2:00 złapała go czuwająca osoba: karta „Złapany”
      s.i = zFaza(s, 'zlapany', { ukradl: 2 }, { day: 4, hour: 2, minute: 5, screen: 1100 });
      eventTick(s.gov, s.i, emptyEffects(), false);
      expect(otwarta(s), wybor).toBe('zlapany');
      wybierz(s, wybor);
      expect(znajomi(s), wybor).toHaveLength(1);
      expect(znajomi(s)[0], wybor).toMatchObject({ jak: 'zlapany', nastawienie: -2, wizyty: 1 });
      // „Wyrzucić z łupem” odsyła go z jedzeniem, ale on i tak jest złapanym, nie okradającym
      if (wybor === 'Wyrzucić z łupem') {
        eventTick(s.gov, zFaza(s, 'odchodzi', { ukradl: 2 }, { day: 4, hour: 2, minute: 40 }), emptyEffects(), false);
        expect(znajomi(s)[0], wybor).toMatchObject({ jak: 'zlapany', nastawienie: -2, wizyty: 1 });
      }
    }
  });

  it('karta z 0.3 z gościem (uchodźcy) też zostawia znajomego: przyjęci to przyjęty +2, odprawieni odprawiony 0', () => {
    for (const [wybor, jak, n] of [
      ['Przyjąć wszystkich', 'przyjety', 2],
      ['Odprawić', 'odprawiony', 0],
    ] as const) {
      const gov = newGov(3);
      const atr = new Atrapa(3);
      atr.supplies = 30;
      atr.woodSklad = 10;
      atr.tick = tickAt(3, 10);
      const i: GovInput = {
        ...atr.input(),
        day: 3,
        hour: 10,
        minute: 0,
        screen: 5000,
        kozaLit: true,
        goscie: [],
        napady: [],
      };
      for (const e of M1_EVENTS) if (e.id !== 'uchodzcy') gov.ev.last[e.id] = gameMin(i);
      gov.ev.next = 0;
      gov.ev.warm = 0;
      const fx = emptyEffects();
      eventTick(gov, i, fx, false);
      expect(fx.gosc, 'plan uchodźców').toBeTruthy();
      const g = gov.goscie!.aktywny!.gosc;
      const w: GovGosc = {
        id: g.id,
        faza: 'brama',
        tile: 1234,
        gdzie: { x: 34, y: 12 },
        pawns: g.osoby.map((_, k) => 100 + k),
        zywi: g.osoby.map((_, k) => k),
        ukradl: 0,
      };
      const s: Stan = { gov, i: { ...i, screen: 5001, goscie: [w] }, atr };
      eventTick(gov, s.i, emptyEffects(), false);
      expect(gov.ev.active?.id).toBe('uchodzcy');
      wybierz(s, wybor);
      expect(znajomi(s), wybor).toHaveLength(1);
      expect(znajomi(s)[0], wybor).toMatchObject({
        osoba: { name: g.osoby[0].name },
        look: gov.goscie!.aktywny!.looks![0],
        jak,
        nastawienie: n,
        wizyty: 1,
      });
    }
  });

  it('wyrzucony mieszkaniec to znajomy −2 (kto: lokator), z wyglądem pionka', () => {
    const atr = new Atrapa(1);
    atr.supplies = 30;
    const lok = (id: string, name: string, f: boolean, mood: number, look: number): GovLokator => ({
      pawn: 100 + Number(id.slice(1)),
      id,
      name,
      first: name.split(' ')[0],
      f,
      age: 44,
      prof: 'Elektryk',
      skills: {},
      traits: [],
      needs: { food: 60, warm: 60, rest: 60, health: 90, safe: 60, mood },
      asleep: false,
      inside: true,
      tile: 5000,
      look,
    });
    const gov = newGov(1);
    const i: GovInput = {
      ...atr.input(),
      day: 3,
      hour: 10,
      minute: 0,
      screen: 1000,
      kozaLit: true,
      residents: 2,
      lokatorzy: [lok('r1', 'Halina Kowalska', true, 70, 5), lok('r2', 'Marek Nowak', false, 30, 12)],
    };
    // karta „kradzież”: sprawca to Marek, pierwszy wybór wyrzuca go z osiedla
    const h = makeHost(gov, i, emptyEffects());
    const d = JSON.parse(JSON.stringify(def('kradziez').make(h)));
    expect(d.lok).toBe('r2');
    gov.ev.active = { id: 'kradziez', d };
    const fx = chooseEvent(gov, i, 0);
    expect(fx.wyrzuc).toEqual(['r2']);
    expect(gov.znajomi).toHaveLength(1);
    expect(gov.znajomi![0]).toMatchObject({
      id: 'r2',
      osoba: { first: 'Marek', name: 'Marek Nowak', f: false, age: 44 },
      look: 12,
      pion: 102,
      kto: 'lokator',
      jak: 'wyrzucony',
      nastawienie: -2,
      dzien: 3,
      wizyty: 1,
      ostatnio: 3,
    });
    // dać jeść z kotła to nie wyrzucenie: nikogo nie zapamiętujemy
    const gov2 = newGov(1);
    gov2.ev.active = { id: 'kradziez', d };
    chooseEvent(gov2, i, 1);
    expect(gov2.znajomi ?? []).toHaveLength(0);
  });

  it('ten sam człowiek to jeden wpis: nastawienie sumuje się w zakresie −2..2, wizyty rosną, wygląd zostaje', () => {
    const st = newGov(1);
    const bazowy = {
      id: 'g1p0',
      osoba: { first: 'Anna', name: 'Anna Wiśniewska', f: true, age: 33 },
      look: 7,
      kto: 'uciekinier' as const,
      dzien: 2,
    };
    zapamietaj(st, { ...bazowy, jak: 'nakarmiony' }, 2, { wizyta: 'g1' });
    zapamietaj(st, { ...bazowy, id: 'g5p0', look: 11, jak: 'przyjety' }, 5, { wizyta: 'g5' });
    expect(st.znajomi).toHaveLength(1);
    expect(st.znajomi![0]).toMatchObject({
      id: 'g1p0',
      look: 7,
      jak: 'przyjety',
      nastawienie: 2,
      wizyty: 2,
      dzien: 2,
      ostatnio: 5,
    });
    // kolejne +2 nie przekracza 2; wyrzucenie z osiedla (jako lokator, inne id) nie schodzi o 2, tylko ustawia −2
    zapamietaj(st, { ...bazowy, id: 's9', kto: 'lokator', jak: 'wyrzucony' }, 8, { wizyta: 'w1' });
    expect(st.znajomi).toHaveLength(1);
    expect(st.znajomi![0]).toMatchObject({ kto: 'lokator', jak: 'wyrzucony', nastawienie: -2, wizyty: 3, ostatnio: 8 });
    // dwa złapania nie schodzą poniżej −2
    zapamietaj(st, { ...bazowy, jak: 'zlapany' }, 9, { wizyta: 'w2' });
    zapamietaj(st, { ...bazowy, jak: 'zlapany' }, 10, { wizyta: 'w3' });
    expect(st.znajomi![0].nastawienie).toBe(-2);
    // inny człowiek to osobny wpis
    zapamietaj(
      st,
      { ...bazowy, id: 'g7p0', osoba: { first: 'Jan', name: 'Jan Lewandowski', f: false, age: 50 }, jak: 'nocleg' },
      11,
    );
    expect(st.znajomi).toHaveLength(2);
  });

  it('korekta w tej samej wizycie zastępuje wpis, a nie dokłada: nocleg zamieniony na okradł', () => {
    const st = newGov(1);
    const bazowy = {
      id: 'g2p0',
      osoba: { first: 'Jan', name: 'Jan Nowak', f: false, age: 40 },
      look: 6,
      kto: 'wedrowiec' as const,
      dzien: 4,
    };
    zapamietaj(st, { ...bazowy, jak: 'przyjety' }, 3, { wizyta: 'g0' });
    expect(st.znajomi![0].nastawienie).toBe(2);
    zapamietaj(st, { ...bazowy, jak: 'nocleg' }, 4, { wizyta: 'g2' });
    expect(st.znajomi![0]).toMatchObject({ jak: 'nocleg', nastawienie: 2, wizyty: 2 });
    zapamietaj(st, { ...bazowy, jak: 'okradl' }, 4, { wizyta: 'g2' });
    expect(st.znajomi![0]).toMatchObject({ jak: 'okradl', nastawienie: 1, wizyty: 2 });
  });
});

// ---------------------------------------------------------------- powroty

describe('wyrzucony i złapany ustawiają −2', () => {
  const bazowy = {
    id: 'g4p0',
    osoba: { first: 'Anna', name: 'Anna Nowak', f: true, age: 40 },
    look: 6,
    kto: 'wedrowiec' as const,
    dzien: 2,
  };

  it('przyjęty (+2), potem wyrzucony z osiedla: −2, a nie 0, i idzie z szabrownikami na najbliższy napad', () => {
    const st = newGov(1);
    zapamietaj(st, { ...bazowy, jak: 'przyjety' }, 2, { wizyta: 'g4' });
    expect(st.znajomi![0].nastawienie).toBe(2);
    zapamietaj(st, { ...bazowy, id: 's30', kto: 'lokator', jak: 'wyrzucony' }, 5, { wizyta: 'ws30' });
    expect(st.znajomi).toHaveLength(1);
    expect(st.znajomi![0]).toMatchObject({ jak: 'wyrzucony', nastawienie: -2, wizyty: 2 });
    expect(wrogDoNapadu(st, 6)?.id).toBe('g4p0');
    // przez korektę w tej samej wizycie też −2
    const st2 = newGov(1);
    zapamietaj(st2, { ...bazowy, jak: 'przyjety' }, 2, { wizyta: 'g4' });
    zapamietaj(st2, { ...bazowy, jak: 'wyrzucony' }, 2, { wizyta: 'g4' });
    expect(st2.znajomi![0].nastawienie).toBe(-2);
  });

  it('znajomy z +2 złapany na kradzieży: −2 (nowa wizyta i korekta w tej samej), a po napadzie dalej dodaje się z zaciśnięciem', () => {
    // nowa wizyta
    const st = newGov(1);
    zapamietaj(st, { ...bazowy, jak: 'przyjety' }, 2, { wizyta: 'g4' });
    zapamietaj(st, { ...bazowy, jak: 'zlapany' }, 6, { wizyta: 'g9' });
    expect(st.znajomi![0]).toMatchObject({ jak: 'zlapany', nastawienie: -2, wizyty: 2 });
    expect(wrogDoNapadu(st, 6)?.id).toBe('g4p0');
    // ta sama wizyta: powracający +2 wpuszczony na noc (nocleg), potem złapany
    const st2 = newGov(1);
    zapamietaj(st2, { ...bazowy, jak: 'przyjety' }, 2, { wizyta: 'g4' });
    zapamietaj(st2, { ...bazowy, jak: 'nocleg' }, 6, { wizyta: 'g9' });
    expect(st2.znajomi![0].nastawienie).toBe(2);
    zapamietaj(st2, { ...bazowy, jak: 'zlapany' }, 7, { wizyta: 'g9' });
    expect(st2.znajomi![0]).toMatchObject({ jak: 'zlapany', nastawienie: -2, wizyty: 2 });
    // inne zdarzenia dalej się sumują: okradł −1 z +2 to +1
    const st3 = newGov(1);
    zapamietaj(st3, { ...bazowy, jak: 'przyjety' }, 2, { wizyta: 'g4' });
    zapamietaj(st3, { ...bazowy, jak: 'okradl' }, 6, { wizyta: 'g9' });
    expect(st3.znajomi![0].nastawienie).toBe(1);
  });
});

describe('powrót znajomego', () => {
  it('doPowrotu: dodatni, sprzed co najmniej 2 dni, najwyżej jeden powrót na 4 dni, bez obecnych w osiedlu', () => {
    expect(POWROT_WIEK_DNI).toBe(2);
    expect(POWROT_ODSTEP_DNI).toBe(4);
    const st = newGov(1);
    st.znajomi = [zn({ ostatnio: 3 })];
    // dzień po wizycie i dwa dni po niej
    expect(doPowrotu(st, 4, 'zwykly')).toBeNull();
    expect(doPowrotu(st, 5, 'zwykly')?.id).toBe('g0p0');
    // nastawienie 0 i ujemne nie wracają jako goście
    st.znajomi = [
      zn({ ostatnio: 1, nastawienie: 0, jak: 'odprawiony' }),
      zn({ id: 'g1p0', ostatnio: 1, nastawienie: -1, jak: 'okradl' }),
    ];
    expect(doPowrotu(st, 9, 'zwykly')).toBeNull();
    // wybiera najlepiej nastawionego, przy remisie najdawniejszego, potem po id
    st.znajomi = [
      zn({ id: 'a', osoba: { first: 'A', name: 'A A', f: false, age: 30 }, nastawienie: 1, ostatnio: 1 }),
      zn({ id: 'b', osoba: { first: 'B', name: 'B B', f: false, age: 30 }, nastawienie: 2, ostatnio: 2 }),
      zn({ id: 'c', osoba: { first: 'C', name: 'C C', f: false, age: 30 }, nastawienie: 2, ostatnio: 1 }),
    ];
    expect(doPowrotu(st, 9, 'zwykly')?.id).toBe('c');
    // kto jest w osiedlu (po imieniu i nazwisku), nie wraca
    expect(doPowrotu(st, 9, 'zwykly', obecni(['C C']))?.id).toBe('b');
    expect(doPowrotu(st, 9, 'zwykly', obecni(['C C', 'B B', 'A A']))).toBeNull();
    // zmarły nie wraca
    st.znajomi[2].zmarl = true;
    expect(doPowrotu(st, 9, 'zwykly')?.id).toBe('b');
    // jeden powrót na 4 dni, licząc wszystkich razem
    st.znajomi[1].wrocil = 9;
    expect(doPowrotu(st, 9, 'zwykly')).toBeNull();
    expect(doPowrotu(st, 12, 'zwykly')).toBeNull();
    expect(doPowrotu(st, 13, 'zwykly')?.id).toBe('b');
    // bez znajomych nic
    expect(doPowrotu(newGov(1), 9, 'zwykly')).toBeNull();
  });

  it('przyjęty nie wraca, póki mieszka u nas (obecny po imieniu i nazwisku z wejścia), a po odejściu może', () => {
    const atr = new Atrapa(1);
    const i = atr.input();
    const st = newGov(1);
    const lok: GovLokator = {
      pawn: 150,
      id: 's17',
      name: 'Henryk Kowalski',
      first: 'Henryk',
      f: false,
      age: 47,
      prof: 'Hydraulik',
      skills: {},
      traits: [],
      needs: { food: 60, warm: 60, rest: 60, health: 90, safe: 60, mood: 60 },
      asleep: false,
      inside: true,
      tile: 5000,
    };
    st.znajomi = [zn({ jak: 'przyjety', nastawienie: 2, ostatnio: 1 })];
    // mieszka u nas jako lokator
    expect(doPowrotu(st, 9, 'zwykly', obecniWOsiedlu({ ...i, lokatorzy: [lok] }))).toBeNull();
    // przeszedł do zarządu
    const wZarzadzie = {
      ...i,
      people: [{ ...i.people[0], name: 'Henryk Kowalski', first: 'Henryk' }, ...i.people.slice(1)],
    };
    expect(doPowrotu(st, 9, 'zwykly', obecniWOsiedlu(wZarzadzie))).toBeNull();
    // zmarł (lista zmarłych)
    expect(
      doPowrotu(
        st,
        9,
        'zwykly',
        obecniWOsiedlu({ ...i, dead: [{ id: '', name: 'Henryk Kowalski', cause: 'głód', tick: 1 }] }),
      ),
    ).toBeNull();
    // odszedł z osiedla: znowu może przyjść
    expect(doPowrotu(st, 9, 'zwykly', obecniWOsiedlu(i))?.id).toBe('g0p0');
  });

  it('obecność po numerze pionka: przyjęty mieszka u nas mimo zmiany imienia, a imiennik z innym pionkiem go nie blokuje', () => {
    const st = newGov(1);
    st.znajomi = [zn({ jak: 'przyjety', nastawienie: 2, ostatnio: 1, pion: 120 })];
    // pionek 120 jest w osiedlu (gracz zmienił mu imię): nie wraca, choć imienia już nie ma w wejściu
    expect(doPowrotu(st, 9, 'zwykly', obecni([], [120]))).toBeNull();
    // inny człowiek o tym samym imieniu i nazwisku, inny pionek: nie blokuje
    expect(doPowrotu(st, 9, 'zwykly', obecni(['Henryk Kowalski'], [999]))?.id).toBe('g0p0');
    // bez znanego pionka (zapis sprzed pola) rozstrzyga imię i nazwisko
    st.znajomi = [zn({ jak: 'przyjety', nastawienie: 2, ostatnio: 1 })];
    expect(doPowrotu(st, 9, 'zwykly', obecni(['Henryk Kowalski']))).toBeNull();
    expect(doPowrotu(st, 9, 'zwykly', obecni([], [120]))?.id).toBe('g0p0');
    // zmarły wyklucza po imieniu z listy zmarłych, nawet gdy pionek znany
    st.znajomi = [zn({ jak: 'przyjety', nastawienie: 2, ostatnio: 1, pion: 120 })];
    expect(doPowrotu(st, 9, 'zwykly', obecni([], [], ['Henryk Kowalski']))).toBeNull();
    // obecniWOsiedlu bierze pionki zarządu i mieszkańców oraz imiona zmarłych
    const i = new Atrapa(1).input();
    const lok = {
      pawn: 150,
      id: 's17',
      name: 'Ewa Nowak',
      first: 'Ewa',
      f: true,
      age: 40,
      prof: 'x',
      skills: {},
      traits: [],
      needs: i.people[0].needs,
      asleep: false,
      inside: true,
      tile: 1,
    };
    const o = obecniWOsiedlu({ ...i, lokatorzy: [lok], dead: [{ id: '', name: 'Zmarły Z', cause: 'głód', tick: 1 }] });
    expect(o.pionki.has(150)).toBe(true);
    for (const p of i.people) expect(o.pionki.has(p.pawn)).toBe(true);
    expect(o.imiona.has('Ewa Nowak')).toBe(true);
    expect(o.zmarli.has('Zmarły Z')).toBe(true);
    expect(NIKOGO.pionki.size + NIKOGO.imiona.size + NIKOGO.zmarli.size).toBe(0);
  });

  it('ten sam człowiek po pionku: imiennik z innym pionkiem to osobny wpis, ta sama osoba po zmianie imienia jeden', () => {
    const st = newGov(1);
    const baza = {
      id: 'g1p0',
      osoba: { first: 'Anna', name: 'Anna Nowak', f: true, age: 33 },
      look: 7,
      kto: 'wedrowiec' as const,
      dzien: 2,
    };
    zapamietaj(st, { ...baza, jak: 'nocleg', pion: 110 }, 2, { wizyta: 'g1' });
    // imiennik (to samo imię, nazwisko, płeć i wiek), ale inny pionek i inne id: ktoś inny
    zapamietaj(st, { ...baza, id: 'g8p0', jak: 'nocleg', pion: 111 }, 4, { wizyta: 'g8' });
    expect(st.znajomi).toHaveLength(2);
    // ten sam pionek (id po przyjęciu inne, imię zmienione przez gracza): ten sam człowiek
    zapamietaj(
      st,
      { ...baza, id: 's5', osoba: { ...baza.osoba, name: 'Ania Nowak' }, kto: 'lokator', jak: 'wyrzucony', pion: 110 },
      6,
      { wizyta: 'ws5' },
    );
    expect(st.znajomi).toHaveLength(2);
    expect(st.znajomi![0]).toMatchObject({ id: 'g1p0', pion: 110, jak: 'wyrzucony', nastawienie: -2 });
    // bez pionka rozstrzyga imię: starszy wpis bez pionka dostaje ten, który go podaje
    const st2 = newGov(1);
    zapamietaj(st2, { ...baza, jak: 'nocleg' }, 2, { wizyta: 'g1' });
    zapamietaj(st2, { ...baza, id: 'g9p0', jak: 'nocleg', pion: 120 }, 4, { wizyta: 'g9' });
    expect(st2.znajomi).toHaveLength(1);
    expect(st2.znajomi![0].pion).toBe(120);
  });

  const KTO_POWROTU: (KtoId | 'lokator')[] = [
    'wedrowiec',
    'dezerter',
    'uciekinier',
    'chory',
    'dziecko',
    'znajomy',
    'rodzina',
    'lokator',
  ];

  it('skladPowrotu: ten sam człowiek, ten sam archetyp, dar to rodzeństwo, worek jedzenia albo wiadomość', () => {
    const ctx = { mode: 'zwykly' as const, okolica: [], dom: false };
    const dary = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const z = zn({ kto: KTO_POWROTU[seed % KTO_POWROTU.length] });
      const g = skladPowrotu(mulberry(seed), 7, z, ctx, new Set(['Zofia']));
      expect(g.id).toBe('g7');
      expect(g.wraca).toBe(z.id);
      // ten sam archetyp, a grupy (rodzina, ocaleni, ktoś z ugryzionym bliskim) i lokator wracają jako wędrowiec
      expect(g.kto).toBe(['rodzina', 'ocaleni', 'z_ugryzionym', 'lokator'].includes(z.kto) ? 'wedrowiec' : z.kto);
      expect(g.haczyk).toBe('prawda');
      expect(g.osoby[0]).toMatchObject({
        first: 'Henryk',
        name: 'Henryk Kowalski',
        f: false,
        age: 47,
        prof: 'Hydraulik',
      });
      g.osoby.forEach((p, k) => {
        expect(p.id).toBe(`g7p${k}`);
      });
      if (g.osoby.length === 2) {
        dary.add('rodzenstwo');
        expect(g.chce).toBe('dolaczyc');
        // rodzeństwo ma nazwisko mówiącego w swojej formie i nowe imię
        expect(g.osoby[1].name.split(' ')[1]).toMatch(/^Kowalsk/);
        expect(g.osoby[1].first).not.toBe('Henryk');
        expect(g.osoby[1].first).not.toBe('Zofia');
      } else if (g.porcje !== undefined) {
        dary.add('jedzenie');
        expect(g.porcje).toBeGreaterThanOrEqual(2);
        expect(g.porcje).toBeLessThanOrEqual(4);
        expect(g.osoby).toHaveLength(1);
      } else {
        dary.add('wiesc');
        expect(g.ma).toBe('wiadomosc');
      }
    }
    expect([...dary].sort()).toEqual(['jedzenie', 'rodzenstwo', 'wiesc']);
    // dar do wyboru (testy i tryb zombie)
    for (const dar of ['rodzenstwo', 'jedzenie', 'wiesc'] as const) {
      const g = skladPowrotu(mulberry(3), 2, zn(), { ...ctx, mode: 'zombie' }, new Set(), dar);
      expect(g.wraca).toBe('g0p0');
      if (dar === 'rodzenstwo') expect(g.osoby).toHaveLength(2);
      if (dar === 'jedzenie') expect(g.porcje).toBeGreaterThanOrEqual(2);
      if (dar === 'wiesc') expect(g.ma).toBe('wiadomosc');
    }
    // chory nie prosi o przyjęcie rodzeństwa
    for (let seed = 1; seed <= 30; seed++) {
      const g = skladPowrotu(mulberry(seed), 2, zn({ kto: 'chory' }), ctx, new Set());
      expect(g.osoby).toHaveLength(1);
      expect(g.chce).not.toBe('dolaczyc');
    }
  });

  it('dodatni znajomy wraca jako gość z tym samym imieniem po co najmniej 2 dniach (plan, wygląd, jedna wizyta)', () => {
    const s = stan(null, { dzien: 4 });
    s.gov.znajomi = [zn({ ostatnio: 3 })];
    // za wcześnie: waga 0, planowanie nic nie robi
    const fx0 = emptyEffects();
    expect(planujPowrot(s.gov, s.i, fx0)).toBeNull();
    expect(fx0.gosc).toBeUndefined();
    expect(def('powrot').w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0);
    // po dwóch dobach: plan dla symulacji z tą samą osobą i wyglądem
    const p = stan(null, { dzien: 5 });
    p.gov.znajomi = [zn({ ostatnio: 3 })];
    expect(def('powrot').w(makeHost(p.gov, p.i, emptyEffects()))).toBeGreaterThan(0);
    const fx = emptyEffects();
    const g = planujPowrot(p.gov, p.i, fx)!;
    expect(g.wraca).toBe('g0p0');
    expect(fx.gosc!.id).toBe(g.id);
    expect(fx.gosc!.osoby[0]).toMatchObject({ first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47 });
    expect(fx.gosc!.looks[0]).toBe(9);
    expect(new Set(fx.gosc!.looks).size).toBe(fx.gosc!.looks.length);
    for (const l of fx.gosc!.looks) {
      expect(l).toBeGreaterThanOrEqual(4);
      expect(l).toBeLessThanOrEqual(15);
    }
    expect(p.gov.goscie!.aktywny!.gosc.wraca).toBe('g0p0');
    expect(p.gov.goscie!.aktywny!.looks).toEqual(fx.gosc!.looks);
    expect(p.gov.znajomi![0].wrocil).toBe(5);
    // inna wizyta w toku: planowanie powrotu niczego nie nadpisuje
    const wToku = stan(null, { dzien: 9 });
    wToku.gov.znajomi = [zn({ ostatnio: 3 })];
    wToku.gov.goscie = { n: 1, czytane: 0, aktywny: p.gov.goscie!.aktywny };
    const fxToku = emptyEffects();
    expect(planujPowrot(wToku.gov, wToku.i, fxToku)).toBeNull();
    expect(fxToku.gosc).toBeUndefined();
    expect(wToku.gov.goscie.n).toBe(1);
    // wizyta w toku: nikt więcej nie wraca; po jej końcu dopiero po czterech dobach
    expect(def('powrot').w(makeHost(p.gov, p.i, emptyEffects()))).toBe(0);
    delete p.gov.goscie!.aktywny;
    expect(def('powrot').w(makeHost(p.gov, { ...p.i, day: 8 }, emptyEffects()))).toBe(0);
    expect(def('powrot').w(makeHost(p.gov, { ...p.i, day: 9 }, emptyEffects()))).toBeGreaterThan(0);
  });

  it('powrót przez pulę wydarzeń: wypada powrot, zarząd planuje gościa, karty jeszcze nie ma; bez obcych waga 0', () => {
    /** pula z samym powrotem */
    const tylkoPowrot = (over: Partial<GovInput> = {}, mode: 'zwykly' | 'zombie' = 'zwykly') => {
      const s = stan(null, { dzien: 6, mode, input: { screen: 5000, ...over } });
      s.gov.znajomi = [zn({ ostatnio: 2 })];
      for (const e of M1_EVENTS) if (e.id !== 'powrot') s.gov.ev.last[e.id] = gameMin(s.i);
      s.gov.ev.next = 0;
      s.gov.ev.warm = 0;
      return s;
    };
    const s = tylkoPowrot();
    const fx = emptyEffects();
    eventTick(s.gov, s.i, fx, false);
    expect(fx.gosc).toBeTruthy();
    expect(fx.gosc!.osoby[0].name).toBe('Henryk Kowalski');
    expect(s.gov.goscie!.aktywny!.gosc.wraca).toBe('g0p0');
    expect(s.gov.ev.done.powrot).toBe(true);
    expect(s.gov.ev.active).toBeNull();
    expect(pending(s.gov, s.i)).toBeNull();
    // gra bez obcych: żadnych powrotów
    const bez = tylkoPowrot();
    delete (bez.i as { goscie?: unknown }).goscie;
    const fxb = emptyEffects();
    eventTick(bez.gov, bez.i, fxb, false);
    expect(fxb.gosc).toBeUndefined();
    expect(def('powrot').w(makeHost(bez.gov, bez.i, emptyEffects()))).toBe(0);
    // tryb zombie: dodatni też wraca (ocalały wraca jako wędrowiec)
    const z = tylkoPowrot({}, 'zombie');
    z.gov.znajomi = [zn({ ostatnio: 2, kto: 'ocaleni' })];
    const fxz = emptyEffects();
    eventTick(z.gov, z.i, fxz, false);
    expect(fxz.gosc).toBeTruthy();
    expect(z.gov.goscie!.aktywny!.gosc.kto).toBe('wedrowiec');
  });

  it('karta powracającego gościa rozpoznaje go (imię, epitet) w obu językach, a dar idzie z wyborem', () => {
    const ctx = { mode: 'zwykly' as const, okolica: [], dom: false };
    ustawJezyk('pl');
    for (const dar of ['rodzenstwo', 'jedzenie', 'wiesc'] as const) {
      for (const jak of ['nakarmiony', 'nocleg', 'przyjety'] as const) {
        const z = zn({ jak });
        const g = skladPowrotu(mulberry(9), 1, z, ctx, new Set(), dar);
        g.osoby.forEach((p, k) => {
          p.id = `g1p${k}`;
        });
        const s = stan(g, { dzien: 6 });
        s.gov.znajomi = [z];
        const v = eventView(s.gov, s.i)!;
        const nazwa = `${dar}/${jak}`;
        expect(v.id, nazwa).toBe('gosc');
        expect(v.title.pl, nazwa).toContain('Henryk');
        expect(v.text.pl, nazwa).toContain('Henryk Kowalski');
        expect(v.text.pl, nazwa).toContain(epitet(z).pl);
        expect(v.text.pl, nazwa).toMatch(/znowu/);
        expect(v.text.en, nazwa).toContain('Henryk Kowalski');
        expect(v.text.en, nazwa).toContain(epitet(z).en);
        expect(polskieSlowa(v.title.en, ['Henryk']), nazwa).toEqual([]);
        expect(
          polskieSlowa(v.text.en, [
            'Henryk Kowalski',
            'Henryk',
            ...g.osoby.map((p) => p.name),
            ...g.osoby.map((p) => p.first),
          ]),
          nazwa,
        ).toEqual([]);
        if (dar === 'rodzenstwo') {
          expect(v.text.pl, nazwa).toContain(g.osoby[1].first);
          expect(v.text.pl, nazwa).toMatch(/brat|siostr/);
          expect(v.text.en, nazwa).toMatch(/brother|sister/);
        }
        if (dar === 'jedzenie') {
          expect(v.text.pl, nazwa).toMatch(new RegExp(`\\b${g.porcje}\\b`));
          expect(v.text.en, nazwa).toMatch(new RegExp(`\\b${g.porcje}\\b`));
        }
      }
    }
  });

  it('dar przy powrocie: rodzeństwo do przyjęcia, worek jedzenia rano, wskazówka na miejsce; po odprawie bez daru', () => {
    const ctx = { mode: 'zwykly' as const, okolica: [], dom: false };
    const gosc = (dar: 'rodzenstwo' | 'jedzenie' | 'wiesc') => {
      const z = zn();
      const g = skladPowrotu(mulberry(9), 1, z, ctx, new Set(), dar);
      g.osoby.forEach((p, k) => {
        p.id = `g1p${k}`;
      });
      const s = stan(g, { dzien: 6 });
      s.gov.znajomi = [z];
      return { s, g };
    };
    // rodzeństwo: dwie osoby pod bramą, przyjęcie obu, jeden wpis znajomego (mówiący), wizyty 2, nastawienie 2 (1 + 2 zaciśnięte)
    let { s, g } = gosc('rodzenstwo');
    expect(g.osoby).toHaveLength(2);
    let fx = wybierz(s, 'Przyjąć do spółdzielni');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'zostan' }]);
    expect(znajomi(s)).toHaveLength(1);
    expect(znajomi(s)[0]).toMatchObject({ id: 'g0p0', jak: 'przyjety', nastawienie: 2, wizyty: 2, ostatnio: 6 });
    // worek: Jedzenie 2–4 na rano po wpuszczeniu na noc
    ({ s, g } = gosc('jedzenie'));
    const logiPrzed = s.gov.log.length;
    fx = wybierz(s, 'Wpuścić na noc');
    const dar = s.gov.later.find((l) => (l.stock.supplies ?? 0) > 0);
    expect(dar?.stock.supplies).toBe(g.porcje);
    // jedzenie dochodzi rano, więc dopiero poranna linia mówi o porcjach; w chwili wyboru wiadomo tylko, że worek leży przy bramie
    expect(dar?.line.pl).toMatch(new RegExp(`\\b${g.porcje}\\b.*jedzenia|jedzenia.*\\b${g.porcje}\\b`));
    expect(dar?.line.en).toMatch(new RegExp(`\\b${g.porcje} portions? of food`));
    const naWybor = s.gov.log.slice(logiPrzed).map((l) => l.txt);
    const worek = naWybor.find((t) => /worek/.test(t.pl));
    expect(worek, naWybor.map((t) => t.pl).join(' | ')).toBeTruthy();
    expect(worek!.pl).toMatch(/przy bramie|przy furtce/);
    expect(worek!.en).toMatch(/at the (garden )?gate/);
    for (const t of naWybor) {
      expect(t.pl).not.toMatch(/porcj/);
      expect(t.en).not.toMatch(/portion/);
    }
    expect(polskieSlowa(worek!.en, ['Henryk Kowalski'])).toEqual([]);
    expect(polskieSlowa(dar!.line.en, ['Henryk Kowalski'])).toEqual([]);
    expect(znajomi(s)[0]).toMatchObject({ jak: 'nocleg', nastawienie: 2, wizyty: 2 });
    // po odprawie worka nie ma
    ({ s } = gosc('jedzenie'));
    wybierz(s, 'Odprawić');
    expect(s.gov.later.some((l) => (l.stock.supplies ?? 0) > 0)).toBe(false);
    expect(znajomi(s)[0]).toMatchObject({ jak: 'odprawiony', nastawienie: 1, wizyty: 2 });
    // wiadomość: wskazówka na miejsce (cel z TARGETS, gra bez mapy miasta)
    ({ s } = gosc('wiesc'));
    wybierz(s, 'Wpuścić na noc');
    expect(Object.keys(s.gov.wskazowki ?? {})).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- epitet

describe('epitet', () => {
  const IDY = ['g1p0', 'g2p0', 'g3p0', 'g4p0', 'g5p0', 'g6p0', 'g7p0', 's14', 's15'];
  const JAKI: JakId[] = ['nakarmiony', 'nocleg', 'przyjety', 'odprawiony', 'okradl', 'wyrzucony', 'zlapany'];
  const KTOS: (KtoId | 'lokator')[] = [
    'wedrowiec',
    'rodzina',
    'dezerter',
    'uciekinier',
    'chory',
    'dziecko',
    'znajomy',
    'ocaleni',
    'z_ugryzionym',
    'lokator',
  ];

  it('krótki, w rodzaju znajomego, ze zdarzenia (jak), po polsku i po angielsku', () => {
    const nieZero = new Set<string>();
    for (const jak of JAKI)
      for (const kto of KTOS)
        for (const f of [false, true])
          for (const id of IDY) {
            const z = zn({ id, jak, kto, osoba: { first: 'Anna', name: 'Anna Nowak', f, age: 30 } });
            const e = epitet(z);
            expect(e.pl.length, `${jak} ${kto}`).toBeGreaterThan(3);
            expect(e.pl.length, `${jak} ${kto}`).toBeLessThan(70);
            expect(e.en.length, `${jak} ${kto}`).toBeGreaterThan(3);
            // ten sam znajomy daje ten sam epitet
            expect(epitet(z)).toEqual(e);
            // rodzaj: mężczyzna „ten…”, kobieta „ta…”
            expect(e.pl, `${jak} ${kto} ${f}`).toMatch(f ? /^ta\b/ : /^ten\b/);
            nieZero.add(e.pl);
          }
    // epitetów jest dużo, a każdy jak ma co najmniej dwa
    expect(nieZero.size).toBeGreaterThanOrEqual(24);
    for (const jak of JAKI) {
      const warianty = new Set(IDY.map((id) => epitet(zn({ id, jak })).pl));
      expect(warianty.size, jak).toBeGreaterThanOrEqual(2);
    }
  });

  it('epitet po angielsku bez polskich słów', () => {
    let n = 0;
    for (const jak of JAKI)
      for (const kto of KTOS)
        for (const f of [false, true])
          for (const id of IDY) {
            const z = zn({ id, jak, kto, osoba: { first: 'Anna', name: 'Anna Nowak', f, age: 30 } });
            const e = epitet(z);
            n++;
            expect(polskieSlowa(e.en, ['Anna Nowak']), `${jak} ${kto} ${f} → ${e.en}`).toEqual([]);
            expect(e.en, e.pl).not.toBe(e.pl);
          }
    expect(n).toBe(JAKI.length * KTOS.length * 2 * IDY.length);
  });

  it('wyrzucona to „ta, którą wyrzuciliście”, a złodziej to ktoś przy zapasach', () => {
    const wyrzucona = new Set(
      IDY.map(
        (id) =>
          epitet(
            zn({ id, jak: 'wyrzucony', kto: 'lokator', osoba: { first: 'Ewa', name: 'Ewa Nowak', f: true, age: 40 } }),
          ).pl,
      ),
    );
    expect([...wyrzucona].some((e) => /wyrzuci|wyprowadzi/.test(e))).toBe(true);
    for (const e of wyrzucona) expect(e).toMatch(/^ta\b/);
  });
});

// ---------------------------------------------------------------- napad

/** Zarząd i atrapa po zatwierdzeniu karty nocy dnia 2, w której przyjdą szabrownicy (pierwsze ziarno z napadem). */
function nocZNapadem(lista: Znajomy[], mode: 'zwykly' | 'zombie' = 'zwykly', dzien = 2) {
  for (let seed = 1; seed <= 120; seed++) {
    const gov = newGov(seed, mode);
    gov.znajomi = structuredClone(lista);
    gov.tonight.boost = dzien;
    const atr = new Atrapa(seed);
    atr.supplies = 20;
    atr.tick = tickAt(dzien, 20, 5);
    govUpdate(gov, atr.input());
    if (!gov.night) continue;
    const fx = confirmNight(gov, atr.input());
    if (mode === 'zwykly' && !fx.raid) continue;
    return { gov, atr, fx, seed };
  }
  throw new Error('żadne ziarno nie dało napadu');
}

describe('znajomy w napadzie', () => {
  it('ujemny trafia do planu napadu i do raportu z epitetem', () => {
    const wrog = zn({
      id: 'g3p0',
      jak: 'zlapany',
      nastawienie: -2,
      kto: 'wedrowiec',
      ostatnio: 1,
      dzien: 1,
      osoba: { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47 },
    });
    const { gov, atr, fx } = nocZNapadem([wrog]);
    const plan: RaidPlan = fx.raid!;
    expect(plan.znajomy).toBeTruthy();
    expect(plan.znajomy!.id).toBe('g3p0');
    expect(plan.znajomy!.look).toBe(9);
    expect(plan.znajomy!.imie).toEqual({ pl: 'Henryk Kowalski', en: 'Henryk Kowalski' });
    expect(plan.znajomy!.epitet).toEqual(epitet(gov.znajomi![0]));
    // zaznaczony: nie dołącza do każdego napadu
    expect(gov.znajomi![0].napad).toBe(2);
    // noc mija: napad o swojej godzinie, raport rano ma linię z imieniem i epitetem
    atr.tick = tickAt(3, 6, 10);
    govUpdate(gov, { ...atr.input(), hour: 6, minute: 10 });
    const raport = gov.reports.find((r) => r.day === 2)!;
    expect(raport).toBeTruthy();
    const linia = raport.lines.find((l) => l.pl.startsWith('Wśród nich był '))!;
    expect(linia, raport.lines.map((l) => l.pl).join(' | ')).toBeTruthy();
    expect(linia.pl).toBe(`Wśród nich był Henryk Kowalski, ${epitet(gov.znajomi![0]).pl}.`);
    expect(linia.en).toBe(`Henryk Kowalski, ${epitet(gov.znajomi![0]).en}, was among them.`);
    expect(polskieSlowa(linia.en, ['Henryk Kowalski'])).toEqual([]);
    // następny napad bez niego
    const kolejny = nocZNapadem(gov.znajomi!, 'zwykly', 3);
    expect(kolejny.fx.raid!.znajomy).toBeUndefined();
  });

  it('kobieta w raporcie: „Wśród nich była…”', () => {
    const wrog = zn({
      id: 'g4p0',
      jak: 'wyrzucony',
      kto: 'lokator',
      nastawienie: -2,
      osoba: { first: 'Ewa', name: 'Ewa Nowak', f: true, age: 40 },
    });
    const { gov, atr } = nocZNapadem([wrog]);
    atr.tick = tickAt(3, 6, 10);
    govUpdate(gov, { ...atr.input(), hour: 6, minute: 10 });
    const linia = gov.reports.find((r) => r.day === 2)!.lines.find((l) => l.pl.startsWith('Wśród nich '))!;
    expect(linia.pl).toMatch(/^Wśród nich była Ewa Nowak, ta[ ,]/);
    expect(linia.en).toMatch(/^Ewa Nowak, the .+, was among them\.$/);
  });

  it('„Ktoś kręcił się…, ale siatka wytrzymała”: raport mówi „To był/To była …”, a nie „Wśród nich”', () => {
    for (const f of [false, true]) {
      const wrog = zn({
        id: 'g3p0',
        jak: 'zlapany',
        nastawienie: -2,
        osoba: { first: f ? 'Ewa' : 'Henryk', name: f ? 'Ewa Nowak' : 'Henryk Kowalski', f, age: 40 },
      });
      const { gov, atr } = nocZNapadem([wrog]);
      const n = gov.night!;
      // brama, słaby napad i ostrzeżenie: obrona wystarcza, nikt nie stoi na warcie (nikt nie przegania szabrowników)
      n.raid!.post = 'brama';
      n.raid!.attack = 2.1;
      for (const id of Object.keys(n.assign)) n.assign[id] = 'sen';
      gov.tonight.alert = n.day;
      atr.tick = tickAt(3, 6, 10);
      govUpdate(gov, atr.input());
      const linie = gov.reports.find((r) => r.day === 2)!.lines;
      const e = epitet(gov.znajomi![0]);
      expect(
        linie.some((l) => l.pl.startsWith('Ktoś kręcił się')),
        linie.map((l) => l.pl).join(' | '),
      ).toBe(true);
      expect(linie.some((l) => l.pl.startsWith('Wśród nich'))).toBe(false);
      const l = linie.find((x) => x.pl.startsWith('To '))!;
      expect(l.pl).toBe(`To ${f ? 'była' : 'był'} ${wrog.osoba.name}, ${e.pl}.`);
      expect(l.en).toBe(`It was ${wrog.osoba.name}, ${e.en}.`);
      expect(polskieSlowa(l.en, [wrog.osoba.name])).toEqual([]);
    }
  });

  it('szabrownicy, których symulacja nie wystawiła, nie dostają linii o znajomym (napadWystawiony)', () => {
    const wrog = zn({ id: 'g3p0', jak: 'zlapany', nastawienie: -2 });
    const linia = (wystawiony: boolean | undefined) => {
      const { gov, atr } = nocZNapadem([wrog]);
      atr.tick = tickAt(3, 6, 10);
      const i = atr.input();
      govUpdate(gov, wystawiony === undefined ? i : { ...i, napadWystawiony: wystawiony });
      return gov.reports.find((r) => r.day === 2)!.lines.filter((l) => /^(Wśród nich|To był)/.test(l.pl));
    };
    expect(linia(false)).toHaveLength(0);
    expect(linia(true)).toHaveLength(1);
    // atrapa bez pola (stare testy): jak z wystawionymi
    expect(linia(undefined)).toHaveLength(1);
  });

  it('wrogDoNapadu: najbardziej ujemny, przy remisie najdawniejszy, raz na znajomego, bez obecnych i zmarłych', () => {
    const st = newGov(1);
    const os = (n: string) => ({ first: n, name: `${n} X`, f: false, age: 30 });
    st.znajomi = [
      zn({ id: 'a', osoba: os('A'), nastawienie: -1, jak: 'okradl', dzien: 1, ostatnio: 1 }),
      zn({ id: 'b', osoba: os('B'), nastawienie: -2, jak: 'zlapany', dzien: 3, ostatnio: 3 }),
      zn({ id: 'c', osoba: os('C'), nastawienie: -2, jak: 'zlapany', dzien: 2, ostatnio: 2 }),
      zn({ id: 'd', osoba: os('D'), nastawienie: 2, jak: 'przyjety', dzien: 1, ostatnio: 1 }),
      zn({ id: 'e', osoba: os('E'), nastawienie: 0, jak: 'odprawiony', dzien: 1, ostatnio: 1 }),
    ];
    // najbardziej ujemni: b i c, wcześniejszy c
    expect(wrogDoNapadu(st, 5)?.id).toBe('c');
    // raz: po zaznaczeniu następny napad to b, potem a
    st.znajomi[2].napad = 5;
    expect(wrogDoNapadu(st, 6)?.id).toBe('b');
    st.znajomi[1].napad = 6;
    expect(wrogDoNapadu(st, 7)?.id).toBe('a');
    st.znajomi[0].napad = 7;
    expect(wrogDoNapadu(st, 8)).toBeNull();
    // obecny w osiedlu albo zmarły nie idzie na napad
    st.znajomi.forEach((z) => {
      delete z.napad;
    });
    expect(wrogDoNapadu(st, 9, obecni(['C X']))?.id).toBe('b');
    st.znajomi[1].zmarl = true;
    expect(wrogDoNapadu(st, 9, obecni(['C X']))?.id).toBe('a');
    // w zombie ujemny nie dołącza do niczego
    expect(wrogDoNapadu(st, 9, undefined, 'zombie')).toBeNull();
    // bez znajomych nic
    expect(wrogDoNapadu(newGov(1), 9)).toBeNull();
  });

  it('w zombie ujemny nie wraca: ani gościem, ani w napadzie (napadów w zombie nie ma)', () => {
    const st = newGov(1, 'zombie');
    st.znajomi = [zn({ jak: 'zlapany', nastawienie: -2, ostatnio: 1 })];
    expect(doPowrotu(st, 9, 'zombie')).toBeNull();
    expect(wrogDoNapadu(st, 9, undefined, 'zombie')).toBeNull();
    // karta nocy w zombie nie planuje napadu, a znajomy zostaje nietknięty
    const gov = newGov(4, 'zombie');
    gov.znajomi = [zn({ jak: 'zlapany', nastawienie: -2, ostatnio: 1 })];
    const atr = new Atrapa(4);
    atr.tick = tickAt(2, 20, 5);
    govUpdate(gov, atr.input());
    const fx = confirmNight(gov, atr.input());
    expect(fx.raid).toBeNull();
    expect(gov.znajomi[0].napad).toBeUndefined();
    // a jeśli zombie ma dodatniego znajomego, ten wraca jako gość
    gov.znajomi = [zn({ jak: 'nakarmiony', nastawienie: 1, ostatnio: 1, kto: 'ocaleni' })];
    expect(doPowrotu(gov, 9, 'zombie')?.id).toBe('g0p0');
  });

  it('pościg za gościem: drugi plan napadu (poscigNocy) też niesie znajomego', () => {
    const wrog = zn({ id: 'g3p0', jak: 'zlapany', nastawienie: -2, ostatnio: 1 });
    let sprawdzono = 0;
    for (let seed = 1; seed <= 300 && sprawdzono < 2; seed++) {
      const g = newGov(seed);
      g.znajomi = structuredClone([wrog]);
      const atr = new Atrapa(seed);
      atr.tick = tickAt(2, 20, 5);
      govUpdate(g, atr.input());
      const fx1 = emptyEffects();
      confirm(g, atr.input(), fx1, true);
      // chcemy nocy, w której napad nie przyszedł od razu i dopiero pościg go sprowadza
      if (fx1.raid) continue;
      const fx2 = emptyEffects();
      poscigNocy(g, atr.input(), fx2);
      if (!fx2.raid) continue;
      sprawdzono++;
      expect(fx2.raid.znajomy?.id).toBe('g3p0');
      expect(g.znajomi![0].napad).toBe(2);
      expect(g.night!.raid!.znajomy).toBe('g3p0');
    }
    expect(sprawdzono).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- szabrownik w symulacji

describe('szabrownik ze znajomego w symulacji', () => {
  const w = mockBlock();
  const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
  const minuteOf = (day: number, h: number) => (day - 1) * 1440 + h * 60;
  const plan = (people: number, znajomy?: RaidPlan['znajomy']): GovEffects => {
    const e = emptyEffects();
    e.raid = {
      day: 1,
      at: minuteOf(1, 23),
      post: 'brama',
      where: { pl: 'przy bramie', en: 'at the gate' },
      attack: 4.6,
      people,
      ...(znajomy ? { znajomy } : {}),
    };
    return e;
  };
  const gra = (people: number, znajomy?: RaidPlan['znajomy']): SimState => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    applyGov(st, w, plan(people, znajomy));
    while (st.tick < atHour(1, 23)) sim.step();
    return st;
  };

  it('szabrownik z planu ze znajomym ma jego wygląd: dokładnie jeden z tylu, ilu w planie', () => {
    for (const people of [1, 2, 3]) {
      const st = gra(people, {
        id: 'g3p0',
        imie: { pl: 'Henryk', en: 'Henryk' },
        epitet: { pl: 'ten', en: 'the' },
        look: 9,
      });
      const szabrownicy = st.pawns.filter((p) => p.kind === 'szabrownik');
      expect(szabrownicy).toHaveLength(people);
      expect(
        szabrownicy.filter((p) => p.look === 9),
        `${people} osób`,
      ).toHaveLength(1);
      // pozostali mają zwykłe stroje szabrowników
      for (const p of szabrownicy.filter((q) => q.look !== 9)) {
        expect(p.look).toBeGreaterThanOrEqual(16);
        expect(p.look).toBeLessThanOrEqual(19);
      }
      expect(st.raid!.n).toBe(people);
    }
  });

  it('odczyt napadWystawiony: brak bez napadu, fałsz przed wystawieniem i gdy nie było skąd podejść, prawda po wystawieniu', () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    expect(govInput(st, w, 0).napadWystawiony).toBeUndefined();
    applyGov(st, w, plan(2));
    expect(govInput(st, w, 0).napadWystawiony).toBe(false);
    while (st.tick < atHour(1, 23)) sim.step();
    expect(st.pawns.filter((p) => p.kind === 'szabrownik')).toHaveLength(2);
    expect(govInput(st, w, 0).napadWystawiony).toBe(true);
    // brak skąd podejść (spawnRaid kończy napad bez szabrowników): spot zostaje −1
    const pusty = createSim(w, 3, { core: 2 });
    applyGov(pusty, w, plan(2));
    pusty.raid!.phase = 3;
    pusty.raid!.outcome = 'odparty';
    expect(govInput(pusty, w, 0).napadWystawiony).toBe(false);
  });

  it('plan bez znajomego: wszyscy w zwykłych strojach, a losowania ze stanu są te same z nim i bez niego', () => {
    const bez = gra(3);
    for (const p of bez.pawns.filter((q) => q.kind === 'szabrownik')) {
      expect(p.look).toBeGreaterThanOrEqual(16);
      expect(p.look).toBeLessThanOrEqual(19);
    }
    const z = gra(3, { id: 'x', imie: { pl: 'X', en: 'X' }, epitet: { pl: 'x', en: 'x' }, look: 5 });
    // podmiana wyglądu nie zmienia ciągu liczb losowych symulacji
    expect(z.rng).toEqual(bez.rng);
    const stroje = (s: SimState) => s.pawns.filter((q) => q.kind === 'szabrownik').map((q) => q.look);
    expect(stroje(z).filter((l) => l !== 5)).toEqual(stroje(bez).slice(1));
  });
});

// ---------------------------------------------------------------- zapis

describe('zapis i wczytanie', () => {
  it('stary zapis bez znajomi: wczytuje się, gra, a pole pojawia się dopiero z pierwszą decyzją o gościu', () => {
    const s = stan(reczny({ chce: 'nocleg' }));
    const json = saveGov(s.gov);
    expect(json).not.toContain('znajomi');
    const wczytany = normalizujTeksty(loadGov(json));
    expect(wczytany.znajomi).toBeUndefined();
    // zarząd z takiego zapisu: doPowrotu i wrogDoNapadu nie psują się bez pola
    expect(doPowrotu(wczytany, 9, 'zwykly')).toBeNull();
    expect(wrogDoNapadu(wczytany, 9)).toBeNull();
    expect(def('powrot').w(makeHost(wczytany, s.i, emptyEffects()))).toBe(0);
    // decyzja o gościu: pole się pojawia
    s.gov = wczytany;
    s.gov.ev.active = { id: 'gosc', d: { id: 'g1' } };
    wybierz(s, 'Wpuścić na noc');
    expect(s.gov.znajomi).toHaveLength(1);
    // zapis i wczytanie ze znajomymi niczego nie gubi
    const drugi = loadGov(saveGov(s.gov));
    expect(drugi.znajomi).toEqual(s.gov.znajomi);
    expect(saveGov(drugi)).toBe(saveGov(s.gov));
  });

  it('gra, która nigdy nie miała znajomych, nie dostaje pola (zapis i skróty zostają bez zmian)', () => {
    const gov = newGov(5);
    expect(Object.keys(gov)).not.toContain('znajomi');
    const atr = new Atrapa(5);
    for (let t = 0; t < 3 * 24 * TPH; t++) {
      atr.tick++;
      if (atr.tick % TPH === 0) atr.hourly(1);
      if (atr.tick % TPS !== 0) continue;
      atr.apply(govUpdate(gov, atr.input()));
      for (let k = 0; k < 5; k++) {
        const p = pending(gov, atr.input());
        if (!p) break;
        if (p.k === 'raport') gov.report = null;
        else if (p.k === 'karta') atr.apply(confirmNight(gov, atr.input()));
        else if (p.k === 'uchwala') gov.lawPending = false;
        else if (p.k === 'wydarzenie')
          atr.apply(
            chooseEvent(
              gov,
              atr.input(),
              Math.max(
                0,
                p.choices.findIndex((c) => c.ok),
              ),
            ),
          );
      }
    }
    expect(gov.znajomi).toBeUndefined();
  });

  it('epitet, tekst powrotu i plan nie losują: ziarno zarządu zostaje takie samo', () => {
    const z = zn();
    const s = stan(null, { dzien: 6 });
    s.gov.znajomi = [z];
    const przed = JSON.stringify(s.gov.rng);
    epitet(z);
    obecniWOsiedlu(s.i);
    doPowrotu(s.gov, 6, 'zwykly');
    wrogDoNapadu(s.gov, 6);
    def('powrot').w(makeHost(s.gov, s.i, emptyEffects()));
    expect(JSON.stringify(s.gov.rng)).toBe(przed);
    // wygląd mówiącego z ziarna dostaje tylko pierwszy plan, powrót bierze wygląd znajomego
    const fx = emptyEffects();
    planujPowrot(s.gov, s.i, fx);
    expect(fx.gosc!.looks[0]).toBe(9);
  });
});

// ---------------------------------------------------------------- powrót na prawdziwej symulacji

const DEMO = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));

describe('powrót na prawdziwej symulacji', () => {
  /** Przymorze z obcymi i zarządem co sekundę przy ekranie; zarząd ma od początku dodatniego znajomego z dnia 1.
      Okna odpowiadane: goście z klocków „Odprawić” (nie mnożą dodatnich znajomych), reszta pierwszym dostępnym wyborem.
      Gra staje, gdy pod bramą stoi powracający gość (karta `gosc` z `wraca`) albo mija `dni` dób. */
  async function graj(seed: number, dni: number) {
    const { world: w, mieszkancy } = await swiatMieszkancow(DEMO, seed, 4);
    const st = createSim(w, seed, { core: 4, obcy: true, mieszkancy });
    const sim = new Sim(w, st);
    const gov = newGov(seed);
    gov.znajomi = [zn()];
    while (st.tick < dni * 24 * TPH) {
      sim.step();
      if (st.tick % TPS) continue;
      const sek = st.tick / TPS;
      applyGov(st, w, govUpdate(gov, govInput(st, w, sek)));
      for (let k = 0; k < 6; k++) {
        const i = govInput(st, w, sek);
        const p = pending(gov, i);
        if (!p) break;
        if (p.k === 'wydarzenie') {
          const akt = gov.goscie?.aktywny;
          if (p.id === 'gosc' && akt?.gosc.wraca) return { w, st, sim, gov, i, p, akt };
          const odprawic = p.id === 'gosc' ? p.choices.findIndex((c) => c.ok && c.label.pl.startsWith('Odprawić')) : -1;
          const ok = odprawic >= 0 ? odprawic : p.choices.findIndex((c) => c.ok);
          applyGov(st, w, chooseEvent(gov, i, Math.max(0, ok)));
        } else if (p.k === 'karta') applyGov(st, w, confirmNight(gov, i));
        else if (p.k === 'raport') gov.report = null;
        else if (p.k === 'uchwala') gov.lawPending = false;
        else break;
      }
    }
    return null;
  }

  it('znajomy z dnia 1 wraca pod bramę: prawdziwe pionki, to samo imię, wiek, płeć i wygląd, nie wcześniej niż po 2 dobach', async () => {
    const wynik = await graj(31, 9);
    expect(wynik, 'w ciągu 9 dób powrót nie przyszedł').toBeTruthy();
    const { w, st, gov, i, p, akt } = wynik!;
    expect(i.day).toBeGreaterThanOrEqual(1 + POWROT_WIEK_DNI);
    const wpis = i.goscie!.find((x) => x.id === akt.gosc.id)!;
    expect(wpis.faza).toBe('brama');
    // pionki pod bramą: pierwszy to Henryk Kowalski z wyglądem sprzed lat
    const pionki = wpis.pawns.map((id) => st.pawns.find((q) => q.id === id)!);
    expect(pionki.every((q) => q.kind === 'gosc')).toBe(true);
    const mowiacy = pionki[0];
    expect(mowiacy.look).toBe(9);
    expect(st.people[mowiacy.person]).toMatchObject({ name: 'Henryk Kowalski', first: 'Henryk', f: false, age: 47 });
    expect(Math.floor(mowiacy.y) * w.size + Math.floor(mowiacy.x)).toBe(wpis.tile);
    // karta: imię, epitet, „znowu”
    const z = gov.znajomi![0];
    expect(p.text.pl).toContain('Henryk Kowalski');
    expect(p.text.pl).toContain(epitet(z).pl);
    expect(p.text.en).toContain(epitet(z).en);
    expect(p.gdzie).toEqual(wpis.gdzie);
    // zarząd zaznaczył powrót i nie wyśle drugiego przez cztery doby
    expect(z.wrocil).toBeLessThanOrEqual(i.day);
    expect(doPowrotu(gov, z.wrocil! + POWROT_ODSTEP_DNI - 1, 'zwykly')).toBeNull();
    // determinizm: ta sama gra drugi raz daje ten sam stan zarządu i symulacji w chwili powrotu, a zapis i wczytanie
    // zarządu przy otwartej karcie nie zmieniają ani karty, ani skutku wyboru
    const drugi = (await graj(31, 9))!;
    expect(saveGov(drugi.gov)).toBe(saveGov(gov));
    expect(drugi.sim.hash()).toBe(wynik!.sim.hash());
    const wczytany = loadGov(saveGov(gov));
    expect(eventView(wczytany, i)).toEqual(eventView(gov, i));
    const kk = p.choices.findIndex((c) => c.ok && c.label.pl.startsWith('Wpuścić na noc'));
    if (kk >= 0) {
      const fxA = chooseEvent(structuredClone(gov), i, kk);
      const fxB = chooseEvent(wczytany, i, kk);
      expect(fxB).toEqual(fxA);
    }
    // decyzja: wpuszczony na noc, wpis rośnie (wizyty 2), a zmiana nie dokłada drugiego znajomego
    const k = p.choices.findIndex((c) => c.ok && c.label.pl.startsWith('Wpuścić na noc'));
    if (k >= 0) {
      applyGov(st, w, chooseEvent(gov, i, k));
      const g0 = gov.znajomi!.filter((x) => x.id === 'g0p0');
      expect(g0).toHaveLength(1);
      expect(g0[0]).toMatchObject({ wizyty: 2, jak: 'nocleg', nastawienie: 2, ostatnio: i.day });
    }
  }, 600_000);
});
