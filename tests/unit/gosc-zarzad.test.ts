/* Karta gościa w zarządzie (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Wizyta”, punkty 1–7):
   wydarzenie `gosc` z puli nie otwiera karty, tylko planuje wizytę (`GovEffects.gosc`); karta przychodzi, gdy grupa stoi pod
   bramą (faza `brama` w `GovInput.goscie`) i nic innego nie czeka; wybory to rozkazy dla prawdziwych pionków
   (`GovEffects.goscRozkaz`); kłamca kradnie, a złapany ma własną kartę; pościg to napad przy bramie (zwykły tryb) albo hałas
   (zombie); ugryziony zaraża, a „Obejrzeć ręce” odsłania ugryzienie; wiadomość daje wskazówkę na miejsce (ryzyko ×0,5, łup
   ×1,5 na jedną wyprawę); gość, który odszedł przy otwartej karcie, zamyka ją. Zarząd na atrapie z gov-atrapa.ts, z listą
   gości w wejściu ustawianą przez test; na końcu spis pięciu gier z prawdziwą symulacją i obcymi. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tx, ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry, nextRandom } from '../../src/core/rng.ts';
import {
  type Gosc,
  type KontekstGoscia,
  KTO,
  type KtoId,
  osobyGrupy,
  skladGoscia,
  tekstGoscia,
  tytulGoscia,
} from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import { expRisk, makeCard, poscigNocy, raidChance, rozliczWyprawe } from '../../src/gov/noc.ts';
import { TARGETS } from '../../src/gov/tresc.ts';
import type { FazaGoscia, GovEffects, GovGosc, GovInput, GovPerson, GovState, Prompt } from '../../src/gov/typy.ts';
import { GOSC_EVENTS, GOSC_ZWLOKA, MIN_WAGA_GOSCIA, planujGoscia, WAGA_GOSCIA } from '../../src/gov/wizyta.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, eventView, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { celZMiejsca, maWskazowke, wlaczMiasto, wskazowka } from '../../src/gov/wyprawy.ts';
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
import { doPowrotu, obecniWOsiedlu } from '../../src/gov/znajomi.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { tickAt as tickSim } from '../../src/sim/handlarz.ts';
import { createSim, NOISE_TICKS, Sim, type SimState } from '../../src/sim/sim.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import type { World } from '../../src/world/world.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { Atrapa, answer, at, TPH, TPS } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';
import { mockBlock, mockBlockM2 } from './interior-mock.ts';
import { polskieSlowa } from './po-angielsku.ts';

// Zarząd w tym pliku powstaje z `newGov(seed, tryb)` bez trzeciego argumentu, czyli bez łańcuchów kart i wątków sezonu (w grze są
// domyślnie włączone: `newGov(seed, tryb, true)`). Plik sprawdza samą pulę kart; łańcuchy mają swoje testy (watki*.test.ts,
// lancuchy-przelacznik.test.ts).

const def = (id: string) => M1_EVENTS.find((e) => e.id === id)!;
const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);

// ---------------------------------------------------------------- pomocnicy

let licznik = 1;
/** gość z ręcznie ustawionymi klockami (osoby z generatora grup, id g1p0…), reszta wartości domyślna */
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

/** Zarząd z otwartą kartą gościa pod bramą: wizyta aktywna, wpis w odczycie (`brama`, kafelek 1234, punkt 34;12), atrapa
    o 16:00 trzeciego dnia z zapasami. Bez gościa: sam zarząd z pustą listą gości. */
function stan(
  g: Gosc | null,
  o: {
    wpis?: Partial<GovGosc>;
    mode?: 'zwykly' | 'zombie';
    input?: Partial<GovInput>;
    seed?: number;
    karta?: boolean;
    aktywny?: Partial<NonNullable<GovState['goscie']>['aktywny']>;
  } = {},
): Stan {
  const seed = o.seed ?? 3;
  const gov = newGov(seed, o.mode ?? 'zwykly');
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.tick = tickAt(3, 16);
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
  // wpis z mniejszą liczbą pionków bez własnych indeksów: żyją pierwsi (dawne zachowanie testów)
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
    gov.goscie = { n: 1, czytane: 0, aktywny: { gosc: g, od: 900, karta: true, ...o.aktywny } };
    if (o.karta !== false) gov.ev.active = { id: 'gosc', d: { id: g.id } };
  }
  return { gov, i, atr };
}

/** indeks wyboru na otwartej karcie po początku polskiego napisu */
function indeks(s: Stan, prefix: string): number {
  const v = eventView(s.gov, s.i);
  return v ? v.choices.findIndex((c) => c.label.pl.startsWith(prefix)) : -1;
}

/** wybiera na otwartej karcie wybór o danym początku napisu i oddaje skutki */
function wybierz(s: Stan, prefix: string): GovEffects {
  const k = indeks(s, prefix);
  expect(
    k,
    `brak wyboru „${prefix}”: ${eventView(s.gov, s.i)
      ?.choices.map((c) => c.label.pl)
      .join(' | ')}`,
  ).toBeGreaterThanOrEqual(0);
  return chooseEvent(s.gov, s.i, k);
}

const rozkazy = (fx: GovEffects): string[] => (fx.goscRozkaz ?? []).map((r) => r.co);
const etykiety = (s: Stan): string[] => (eventView(s.gov, s.i)?.choices ?? []).map((c) => c.label.pl);
const tekstKarty = (s: Stan): string => eventView(s.gov, s.i)?.text.pl ?? '';

/** wejście zmienione tak, żeby wizyta miała daną fazę */
const zFaza = (s: Stan, faza: FazaGoscia, over: Partial<GovGosc> = {}, input: Partial<GovInput> = {}): GovInput => ({
  ...s.i,
  goscie: s.i.goscie!.map((w) => ({ ...w, faza, ...over })),
  ...input,
});

/** o 5:00 następnej doby gość wciąż śpi u nas (faza w_srodku): zarząd dopisuje do porannego raportu linię o nocy */
function oPiatej(s: Stan, wpis: Partial<GovGosc> = {}, faza: FazaGoscia = 'w_srodku'): void {
  eventTick(s.gov, zFaza(s, faza, wpis, { day: 4, hour: 5, minute: 10 }), emptyEffects(), false);
}

/** zarząd bez ludzi do pilnowania: wszyscy poza mapą (na wyprawie) */
const wszyscyPozaMapa = (people: GovPerson[]): GovPerson[] => people.map((p) => ({ ...p, away: true }));

const SLOWNIK_MIEJSC = ['Atrapia 7'];

// ---------------------------------------------------------------- waga, plan i moment karty

describe('wydarzenie gosc: waga i plan', () => {
  it('bez GovInput.goscie wydarzenie gosc ma wagę 0', () => {
    let n = 0;
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const day of [2, 3, 5])
        for (const hour of [8, 12, 16, 20, 23, 2]) {
          const s = stan(null, { mode, input: { day, hour } });
          // bez pola: gra bez obcych
          delete (s.i as { goscie?: unknown }).goscie;
          n++;
          expect(def('gosc').w(makeHost(s.gov, s.i, emptyEffects())), `${mode} ${day} ${hour}`).toBe(0);
        }
    expect(n).toBe(36);
  });

  it('z obcymi waga to 1,2 razy wagaGoscia z dolnym progiem 0,2, a przy aktywnym gościu 0', () => {
    const w = (napady: number, aktywny = false) => {
      const s = stan(aktywny ? reczny() : null, {
        input: { napady: Array.from({ length: napady }, (_, k) => ({ kto: 'wedrowiec' as const, tick: k })) },
      });
      return def('gosc').w(makeHost(s.gov, s.i, emptyEffects()));
    };
    expect(WAGA_GOSCIA).toBe(1.2);
    expect(w(0)).toBeCloseTo(1.2, 10);
    expect(w(3)).toBeCloseTo(1.2 * 0.8 ** 3, 10);
    // po wielu napaściach nie spada poniżej progu
    expect(w(30)).toBeCloseTo(1.2 * MIN_WAGA_GOSCIA, 10);
    expect(w(60)).toBeCloseTo(1.2 * MIN_WAGA_GOSCIA, 10);
    expect(w(0, true)).toBe(0);
  });

  it('wydarzenie gosc: oba tryby, dzień, wieczór i noc, odstęp 6 godzin, dozwolone pierwszej nocy', () => {
    const e = def('gosc');
    expect(e.tryby).toBeUndefined();
    expect([...e.when].sort()).toEqual(['dzien', 'noc', 'wieczor']);
    expect(e.gap).toBe(6);
    expect(e.first).toBe(true);
    expect(GOSC_EVENTS.map((x) => x.id)).toEqual(['gosc', 'zlapany']);
    // wędrowiec z 0.3 zostaje z wagą 0: jego rolę przejął gość
    expect(def('wedrowiec').w(makeHost(newGov(1), stan(null).i, emptyEffects()))).toBe(0);
  });

  /** zarząd, w którego puli jest tylko gość (reszta wydarzeń „niedawno była”) */
  function tylkoGosc(over: Partial<GovInput> = {}, mode: 'zwykly' | 'zombie' = 'zwykly') {
    const s = stan(null, { mode, input: { screen: 5000, ...over } });
    for (const e of M1_EVENTS) if (e.id !== 'gosc') s.gov.ev.last[e.id] = gameMin(s.i);
    s.gov.ev.next = 0;
    s.gov.ev.warm = 0;
    return s;
  }

  it('gdy wypada gosc, zarząd wysyła plan i nie pokazuje karty, póki gość nie ma fazy brama', () => {
    const s = tylkoGosc();
    const fx = emptyEffects();
    eventTick(s.gov, s.i, fx, false);
    // plan dla symulacji
    const plan = fx.gosc!;
    expect(plan.id).toBe('g1');
    expect(plan.osoby.length).toBeGreaterThanOrEqual(1);
    expect(plan.osoby.length).toBeLessThanOrEqual(12);
    for (const [k, p] of plan.osoby.entries()) expect(p.id).toBe(`g1p${k}`);
    expect(plan.looks).toHaveLength(plan.osoby.length);
    for (const l of plan.looks) expect(l).toBeGreaterThanOrEqual(4);
    for (const l of plan.looks) expect(l).toBeLessThanOrEqual(15);
    expect(new Set(plan.looks).size).toBe(plan.looks.length);
    expect(['n', 'e', 's', 'w']).toContain(plan.strona);
    // stan zarządu: aktywny gość, licznik, ewidencja powtórek; żadnej karty
    expect(s.gov.goscie).toMatchObject({ n: 1, czytane: 0, aktywny: { karta: false } });
    expect(s.gov.goscie!.aktywny!.gosc.id).toBe('g1');
    expect(s.gov.goscie!.aktywny!.gosc.osoby.map((p) => p.id)).toEqual(plan.osoby.map((p) => p.id));
    expect(s.gov.ev.done.gosc).toBe(true);
    expect(s.gov.ev.active).toBeNull();
    expect(pending(s.gov, s.i)).toBeNull();
    expect(s.gov.log.some((l) => /pod bramą|at the gate/i.test(l.txt.pl + l.txt.en))).toBe(false);
    // symulacja pokazuje wpis: idzie, karty nadal nie ma
    const w: GovGosc = { id: 'g1', faza: 'idzie', tile: 50, gdzie: { x: 50, y: 0 }, pawns: [1], zywi: [0], ukradl: 0 };
    for (let k = 0; k < 5; k++) {
      eventTick(s.gov, { ...s.i, screen: s.i.screen + k, goscie: [w] }, emptyEffects(), false);
      expect(s.gov.ev.active).toBeNull();
    }
    // brama, ale zarząd zajęty: karta czeka
    const brama = { ...s.i, goscie: [{ ...w, faza: 'brama' as const }] };
    eventTick(s.gov, brama, emptyEffects(), true);
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.goscie!.aktywny!.karta).toBe(false);
    // wolny: karta otwiera się od razu
    eventTick(s.gov, brama, emptyEffects(), false);
    expect(s.gov.ev.active).toMatchObject({ id: 'gosc', d: { id: 'g1' } });
    expect(s.gov.goscie!.aktywny!.karta).toBe(true);
    expect(pending(s.gov, brama)).toMatchObject({ k: 'wydarzenie', id: 'gosc' });
    // drugi raz nie wraca, choćby karta została zamknięta
    s.gov.ev.active = null;
    eventTick(s.gov, { ...brama, screen: brama.screen + 1 }, emptyEffects(), false);
    expect(s.gov.ev.active).toBeNull();
  });

  it('plan zależy tylko od ziarna zarządu i wejścia: ten sam gość przy tym samym stanie, inny przy innym ziarnie', () => {
    const plan = (seed: number) => {
      const s = stan(null, { seed });
      const fx = emptyEffects();
      planujGoscia(s.gov, s.i, fx, 'wieczor');
      return { fx, rng: JSON.stringify(s.gov.rng) };
    };
    expect(JSON.stringify(plan(4).fx.gosc)).toBe(JSON.stringify(plan(4).fx.gosc));
    const ludzie = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((k) => plan(k).fx.gosc!.osoby[0].name));
    expect(ludzie.size).toBeGreaterThan(3);
    // wygląd też z ziarna zarządu: pierwszy strój różni się między grami
    const stroje = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((k) => plan(k).fx.gosc!.looks[0]));
    expect(stroje.size).toBeGreaterThan(3);
  });

  it('wybrany wątek zajmuje miejsce gości z klocków: dobicie bez ugryzionego bliskiego, dach bez ocalałych z ukrytym ugryzieniem', () => {
    /** ilu gości z klocków w trybie zombie miało dany archetyp i haczyk przy wybranych wątkach */
    const rodzaje = (wybrane: string[], lancuchy = true) => {
      const kto: Record<string, number> = {};
      const haczyk: Record<string, number> = {};
      for (let seed = 1; seed <= 300; seed++) {
        const s = stan(null, { seed, mode: 'zombie' });
        if (wybrane.length) {
          if (lancuchy) s.gov.lancuchy = true;
          s.gov.watki = { wybrane, haki: {}, krok: {} };
        }
        const g = planujGoscia(s.gov, s.i, emptyEffects(), 'wieczor');
        kto[g.kto] = (kto[g.kto] ?? 0) + 1;
        haczyk[`${g.kto}/${g.haczyk}`] = (haczyk[`${g.kto}/${g.haczyk}`] ?? 0) + 1;
      }
      return { kto, haczyk };
    };
    // kontrola: bez wątków ten archetyp i ten haczyk wypadają
    const zwykle = rodzaje([]);
    expect(zwykle.kto.z_ugryzionym ?? 0).toBeGreaterThan(5);
    expect(zwykle.haczyk['ocaleni/ugryziony'] ?? 0).toBeGreaterThan(0);
    // dobicie: nikt z ugryzionym bliskim, ocaleni z ukrytym ugryzieniem zostają
    const dobicie = rodzaje(['dobicie']);
    expect(dobicie.kto.z_ugryzionym ?? 0).toBe(0);
    expect(dobicie.haczyk['ocaleni/ugryziony'] ?? 0).toBeGreaterThan(0);
    // dach: ocaleni (i nikt inny poza z_ugryzionym) bez ukrytego ugryzienia, a ugryziony bliski nadal prosi o dobicie
    const dach = rodzaje(['dach']);
    const ugryzieni = Object.keys(dach.haczyk).filter(
      (k) => k.endsWith('/ugryziony') && k !== 'z_ugryzionym/ugryziony',
    );
    expect(ugryzieni).toEqual([]);
    expect(dach.kto.z_ugryzionym ?? 0).toBeGreaterThan(5);
    // wątki bez związku z gośćmi z klocków niczego nie zmieniają
    expect(rodzaje(['swiatlo', 'list'])).toEqual(zwykle);
    // wątki wpisane do stanu przy wyłączonych łańcuchach (`GovState.lancuchy` brak) nie zdejmują nikogo z puli gości
    expect(rodzaje(['dobicie', 'dach'], false)).toEqual(zwykle);
  });

  it('najwyżej jeden gość naraz: dopóki wizyta trwa, nowy nie wypada; po jej końcu następny ma id g2', () => {
    const s = tylkoGosc();
    const plany: string[] = [];
    let w: GovGosc | null = null;
    for (let sek = 0; sek < 400; sek++) {
      const i = { ...s.i, screen: s.i.screen + sek, goscie: w ? [w] : [] };
      const fx = emptyEffects();
      s.gov.ev.next = 0;
      for (const e of M1_EVENTS) if (e.id !== 'gosc') s.gov.ev.last[e.id] = gameMin(i);
      s.gov.ev.last.gosc = -1e9;
      eventTick(s.gov, i, fx, false);
      if (fx.gosc) {
        plany.push(fx.gosc.id);
        w = { id: fx.gosc.id, faza: 'idzie', tile: 5, gdzie: { x: 5, y: 0 }, pawns: [1], zywi: [0], ukradl: 0 };
      }
      // wizyta kończy się dopiero po 100 s: do tego czasu żadnego nowego planu
      if (sek === 100 && w) w = { ...w, faza: 'poszedl' };
    }
    expect(plany.slice(0, 2)).toEqual(['g1', 'g2']);
    expect(plany.length).toBeLessThanOrEqual(4);
  });

  it('okolica idzie do gościa bez zmian: skąd to miejsce z wejścia, nazwa z wejścia', () => {
    const okolica: Miejsce[] = [
      { klucz: 'poi:0:-300', kat: 'apteka', x: 0, y: -300, odl: 300, nazwa: 'Pod Różą' },
      { klucz: 'poi:300:0', kat: 'apteka', x: 300, y: 0, odl: 300, nazwa: 'Pod Różą' },
      { klucz: 'poi:0:300', kat: 'apteka', x: 0, y: 300, odl: 300, nazwa: 'Pod Różą' },
      { klucz: 'poi:-300:0', kat: 'apteka', x: -300, y: 0, odl: 300, nazwa: 'Pod Różą' },
    ];
    let z: number = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = stan(null, { seed, input: { okolica } });
      const g = planujGoscia(s.gov, s.i, emptyEffects(), 'dzien');
      expect(g.skad.klucz, `ziarno ${seed}`).toBeTruthy();
      expect(okolica.map((m) => m.klucz)).toContain(g.skad.klucz);
      expect(g.skad.nazwa.pl).toBe(frazaSkad('apteka', 'Pod Różą').pl);
      z++;
    }
    expect(z).toBe(30);
  });

  it('wizyta, której symulacja nie pokazała w GOSC_ZWLOKA sekund, przepada; potem można planować nową', () => {
    const s = tylkoGosc();
    const fx = emptyEffects();
    eventTick(s.gov, s.i, fx, false);
    expect(s.gov.goscie!.aktywny).toBeTruthy();
    eventTick(s.gov, { ...s.i, screen: s.i.screen + GOSC_ZWLOKA - 1 }, emptyEffects(), false);
    expect(s.gov.goscie!.aktywny).toBeTruthy();
    eventTick(s.gov, { ...s.i, screen: s.i.screen + GOSC_ZWLOKA + 1 }, emptyEffects(), false);
    expect(s.gov.goscie!.aktywny).toBeUndefined();
  });

  it('grupa, która nie doszła pod bramę, nie dostaje karty, tylko wpis w kronice (bez imion)', () => {
    for (const faza of ['nie_doszedl', 'poszedl', 'zginal'] as const) {
      const s = tylkoGosc();
      eventTick(s.gov, s.i, emptyEffects(), false);
      const kroki = s.gov.log.length;
      const w: GovGosc = { id: 'g1', faza, tile: 5, gdzie: { x: 5, y: 0 }, pawns: [], zywi: [], ukradl: 0 };
      eventTick(s.gov, { ...s.i, goscie: [w] }, emptyEffects(), false);
      expect(s.gov.ev.active, faza).toBeNull();
      expect(s.gov.goscie!.aktywny, faza).toBeUndefined();
      expect(s.gov.goscie!.czytane, faza).toBe(1);
      expect(s.gov.log.slice(kroki), faza).toHaveLength(1);
      const wpis = s.gov.log[s.gov.log.length - 1].txt;
      expect(polskieSlowa(wpis.en, SLOWNIK_MIEJSC), wpis.en).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------- karta pod bramą

describe('karta gościa pod bramą', () => {
  it('karta przy fazie brama ma gdzie z kafelka gościa i wybory z chce', () => {
    const WYBORY: [Gosc['chce'], Partial<Gosc>, string[]][] = [
      ['nocleg', {}, ['Wpuścić na noc', 'Podać jedzenie', 'Odprawić']],
      ['jedzenie', {}, ['Podać jedzenie', 'Wpuścić na noc', 'Odprawić']],
      ['leki', {}, ['Dać leki', 'Wpuścić na noc', 'Podać jedzenie', 'Odprawić']],
      ['wymiana', { ma: 'wiadomosc' }, ['Przystać na wymianę', 'Wpuścić na noc', 'Odprawić']],
      ['dolaczyc', {}, ['Przyjąć do spółdzielni', 'Wpuścić na noc', 'Podać jedzenie', 'Odprawić']],
      ['przechowac', { ma: 'rzecz', rzecz: { meds: 2 } }, ['Przyjąć na przechowanie', 'Wpuścić na noc', 'Odprawić']],
      ['wiadomosc', { ma: 'wiadomosc' }, ['Wysłuchać', 'Wpuścić na noc', 'Podać jedzenie', 'Odprawić']],
    ];
    for (const [chce, over, oczekiwane] of WYBORY) {
      const s = stan(reczny({ chce, ...over }));
      const v = eventView(s.gov, s.i)!;
      expect(v.id).toBe('gosc');
      expect(v.gdzie).toEqual({ x: 34, y: 12 });
      expect(
        v.choices.map((c) => c.label.pl.slice(0, oczekiwane.find((o) => c.label.pl.startsWith(o))?.length ?? 0)),
      ).toEqual(oczekiwane);
      expect(
        v.choices.every((c) => c.ok),
        chce,
      ).toBe(true);
      expect(pending(s.gov, s.i)).toMatchObject({ k: 'wydarzenie', id: 'gosc', gdzie: { x: 34, y: 12 } });
      // tytuł i tekst to tytuł i tekst gościa z klocków, nie nic innego
      const h = makeHost(s.gov, s.i, emptyEffects());
      const g = s.gov.goscie!.aktywny!.gosc;
      expect(v.title).toEqual(tytulGoscia(g, h.words(), h.wordsEn()));
      expect(v.text).toEqual(tekstGoscia(g, h.words(), h.wordsEn()));
    }
    // zombie: ręce do obejrzenia, bliski do dobicia
    const z = stan(reczny({ kto: 'z_ugryzionym', chce: 'dobic', haczyk: 'ugryziony', ugryziony: 1 }), {
      mode: 'zombie',
    });
    z.i.people = z.i.people.map((p, k) => (k === 0 ? { ...p, arm: 'dzida' as const } : p));
    expect(etykiety(z)).toEqual(['Dobić przez siatkę dzidą', 'Wpuścić na noc', 'Obejrzeć ręce', 'Odprawić']);
    // zwykły tryb nie ma oglądania rąk
    expect(etykiety(stan(reczny({ chce: 'nocleg' })))).not.toContain('Obejrzeć ręce');
    // gdy wpis wizyty zniknął z odczytu, kart nie ma na czym oprzeć: nic do wyboru
    const bez = stan(reczny());
    bez.i = { ...bez.i, goscie: [] };
    expect(eventView(bez.gov, bez.i)!.choices.every((c) => !c.ok)).toBe(true);
  });

  it('Przyjąć do zarządu tylko gdy gość ma fach, którego zarząd nie zna', () => {
    const p = reczny({ ma: 'fach', chce: 'dolaczyc' });
    p.osoby[0].skills = { elek: 3 };
    const nowy = stan(p, { input: { know: { bud: 0, cieplo: 0, elek: 0, med: 0, uprawa: 0, it: 0 } } });
    expect(etykiety(nowy)[1]).toBe(`Przyjąć do zarządu (${p.osoby[0].first})`);
    const znany = stan(p, { input: { know: { bud: 0, cieplo: 0, elek: 3, med: 0, uprawa: 0, it: 0 } } });
    expect(etykiety(znany).some((e) => e.startsWith('Przyjąć do zarządu'))).toBe(false);
    const bez = reczny({ ma: 'fach', chce: 'nocleg' });
    expect(etykiety(stan(bez)).some((e) => e.startsWith('Przyjąć do zarządu'))).toBe(false);
  });

  it('Odprawić, Jedzenie przez siatkę, Wpuścić na noc, Przyjąć dają właściwe goscRozkaz', () => {
    // Odprawić
    let s = stan(reczny({ chce: 'nocleg' }));
    const t0 = s.gov.trust;
    let fx = wybierz(s, 'Odprawić');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'odejdz' }]);
    expect(s.gov.trust).toBe(t0 - 1);
    expect(s.gov.goscie!.aktywny!.koniec).toBe(true);
    expect(s.gov.ev.active).toBeNull();
    expect(fx.stock.supplies).toBe(0);
    // Jedzenie przez siatkę: Jedzenie 1 za całą grupę
    s = stan(reczny({ chce: 'jedzenie', kto: 'rodzina', ilu: 4 }));
    fx = wybierz(s, 'Podać jedzenie');
    expect(rozkazy(fx)).toEqual(['jedzenie']);
    expect(fx.stock.supplies).toBe(-1);
    expect(s.gov.trust).toBe(t0 + 1);
    expect(s.gov.goscie!.aktywny!.koniec).toBe(true);
    // Wpuścić na noc
    s = stan(reczny({ chce: 'nocleg' }));
    fx = wybierz(s, 'Wpuścić na noc');
    expect(rozkazy(fx)).toEqual(['noc']);
    expect(s.gov.trust).toBe(t0 + 1);
    expect(s.gov.goscie!.aktywny!.noc).toBe(true);
    expect(s.gov.goscie!.aktywny!.koniec).toBeUndefined();
    // linia o nocy czeka do 5:00: dopiero wtedy wiadomo, że gość został i żyje (nie kradnie, nie zginął)
    expect(s.gov.later).toHaveLength(0);
    oPiatej(s);
    expect(s.gov.later.map((l) => [l.day, l.line.pl.startsWith('Noc u was')])).toEqual([[3, true]]);
    oPiatej(s);
    expect(s.gov.later).toHaveLength(1);
    // Przyjąć do spółdzielni
    s = stan(reczny({ chce: 'dolaczyc', kto: 'rodzina', ilu: 3 }));
    fx = wybierz(s, 'Przyjąć do spółdzielni');
    expect(rozkazy(fx)).toEqual(['zostan']);
    // przyjęci stają się mieszkańcami w symulacji, zarząd nie dokłada ich drugi raz
    expect(fx.residents).toBe(0);
    expect(fx.join).toHaveLength(0);
    expect(s.gov.goscie!.aktywny!.koniec).toBe(true);
    expect(s.gov.log.some((l) => l.big && l.txt.pl.startsWith('Przyjęliście: '))).toBe(true);
    // Przyjąć do zarządu
    const f = reczny({ chce: 'dolaczyc', ma: 'fach' });
    f.osoby[0].skills = { elek: 3 };
    s = stan(f, { input: { know: { bud: 0, cieplo: 0, elek: 0, med: 0, uprawa: 0, it: 0 } } });
    fx = wybierz(s, 'Przyjąć do zarządu');
    expect(rozkazy(fx)).toEqual(['zarzad']);
    expect(s.gov.log.some((l) => l.txt.pl.includes('wchodzi do zarządu'))).toBe(true);
    expect(s.gov.log.some((l) => l.txt.en.includes('joins the board'))).toBe(true);
  });

  it('koszty: jedzenie, leki i wymiana są niedostępne bez zapasów, a płatne z zapasów', () => {
    // brak jedzenia
    let s = stan(reczny({ chce: 'jedzenie' }));
    s.i = { ...s.i, stock: { ...s.i.stock, supplies: 0 } };
    expect(eventView(s.gov, s.i)!.choices.find((c) => c.label.pl.startsWith('Podać jedzenie'))!.ok).toBe(false);
    expect(chooseEvent(s.gov, s.i, indeks(s, 'Podać jedzenie')).goscRozkaz).toBeUndefined();
    expect(s.gov.ev.active).toBeTruthy();
    // leki
    s = stan(reczny({ chce: 'leki', ma: 'wiadomosc' }));
    s.i = { ...s.i, stock: { ...s.i.stock, meds: 0 } };
    expect(eventView(s.gov, s.i)!.choices[0].ok).toBe(false);
    s = stan(reczny({ chce: 'leki', ma: 'wiadomosc' }));
    let fx = wybierz(s, 'Dać leki');
    expect(fx.stock.meds).toBe(-1);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    // wymiana: Jedzenie 2
    s = stan(reczny({ chce: 'wymiana', ma: 'rzecz', rzecz: { arms: 'kusza', ammo: { belty: 6 } } }));
    s.i = { ...s.i, stock: { ...s.i.stock, supplies: 1 } };
    expect(eventView(s.gov, s.i)!.choices[0].ok).toBe(false);
    s = stan(reczny({ chce: 'wymiana', ma: 'rzecz', rzecz: { arms: 'kusza', ammo: { belty: 6 } } }));
    fx = wybierz(s, 'Przystać na wymianę');
    expect(fx.stock.supplies).toBe(-2);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    expect(fx.arms).toEqual(['kusza']);
    expect(fx.ammo).toEqual({ belty: 6 });
  });

  it('nagroda za to, co gość ma: rzecz do magazynu, leki do zapasów, ostrzeżenie jako warta tej nocy, nic po odprawie', () => {
    // rzecz po nakarmieniu
    let s = stan(reczny({ chce: 'jedzenie', ma: 'rzecz', rzecz: { arms: 'lom', meds: 2 } }));
    let fx = wybierz(s, 'Podać jedzenie');
    expect(fx.arms).toEqual(['lom']);
    expect(fx.stock.meds).toBe(2);
    expect(s.gov.log.some((l) => l.txt.pl.startsWith('Dostaliście od gościa: łom, leki (2).'))).toBe(true);
    expect(s.gov.log.some((l) => l.txt.en.startsWith('You got from the visitor: a crowbar, meds (2).'))).toBe(true);
    // przechowanie: zapłata rzeczą
    s = stan(reczny({ chce: 'przechowac', ma: 'rzecz', rzecz: { meds: 3 } }));
    fx = wybierz(s, 'Przyjąć na przechowanie');
    expect(fx.stock.meds).toBe(3);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    // ostrzeżenie: podwójna warta tej nocy (setAlertNight)
    s = stan(reczny({ chce: 'nocleg', ma: 'ostrzezenie' }));
    expect(s.gov.tonight.alert).toBe(0);
    wybierz(s, 'Wpuścić na noc');
    expect(s.gov.tonight.alert).toBe(3);
    // odprawa nie daje niczego
    s = stan(reczny({ chce: 'jedzenie', ma: 'rzecz', rzecz: { arms: 'lom' } }));
    fx = wybierz(s, 'Odprawić');
    expect(fx.arms).toBeUndefined();
    expect(fx.stock.meds).toBe(0);
    s = stan(reczny({ chce: 'nocleg', ma: 'ostrzezenie' }));
    wybierz(s, 'Odprawić');
    expect(s.gov.tonight.alert).toBe(0);
  });

  it('karta grupy mówi tyle osób, ilu jest pionków, a Przyjąć przy mniejszej liczbie wolnych miejsc mówi, ilu będzie spać na podłodze', () => {
    const rodzina = reczny({ kto: 'rodzina', chce: 'dolaczyc', ilu: 4 });
    // cztery osoby, cztery pionki
    let s = stan(rodzina);
    expect(tekstKarty(s)).toMatch(/4 osoby|4 osób/);
    // jeden zginął po drodze: karta mówi o trzech i nie wymienia czwartego
    s = stan(rodzina, { wpis: { pawns: [100, 101, 102] } });
    expect(tekstKarty(s)).toMatch(/3 osoby|3 osób/);
    expect(tekstKarty(s)).not.toMatch(/4 osoby|4 osób/);
    expect(eventView(s.gov, s.i)!.text.en).toMatch(/\b3 people\b/);
    expect(eventView(s.gov, s.i)!.text.en).not.toMatch(/\b4 people\b/);
    // wolnych miejsc 10: bez podłogi
    s = stan(rodzina, { input: { cap: 20, residents: 10 } });
    expect(etykiety(s)[0]).toBe('Przyjąć do spółdzielni');
    expect(eventView(s.gov, s.i)!.choices[0].label.en).toBe('Take them into the co-op');
    // wolne 2, osób 4: dwie na podłodze
    s = stan(rodzina, { input: { cap: 10, residents: 8 } });
    expect(etykiety(s)[0]).toBe('Przyjąć do spółdzielni (2 osoby będą spać na podłodze)');
    expect(eventView(s.gov, s.i)!.choices[0].label.en).toBe('Take them into the co-op (2 people on the floor)');
    // brak wolnych: wszystkie cztery
    s = stan(rodzina, { input: { cap: 8, residents: 8 } });
    expect(etykiety(s)[0]).toBe('Przyjąć do spółdzielni (4 osoby będą spać na podłodze)');
    // jeden pionek mniej: o jedną mniej na podłodze
    s = stan(rodzina, { input: { cap: 10, residents: 8 }, wpis: { pawns: [100, 101, 102] } });
    expect(etykiety(s)[0]).toBe('Przyjąć do spółdzielni (1 osoba będzie spać na podłodze)');
    // przyjęcie: wpis w kronice o podłodze, wkurzenie rośnie
    const a0 = s.gov.anger;
    wybierz(s, 'Przyjąć do spółdzielni');
    expect(s.gov.log.some((l) => /spać na podłodze\.$/.test(l.txt.pl))).toBe(true);
    expect(s.gov.log.some((l) => /will sleep on the floor\.$/.test(l.txt.en))).toBe(true);
    expect(s.gov.anger).toBe(a0 + 2);
    // w domu: dom, nie spółdzielnia
    const dom = stan(rodzina, {
      input: {
        cap: 10,
        residents: 8,
        place: {
          kind: 'dom',
          blocks: 0,
          houses: 6,
          near: 'domy',
          shop: null,
          garages: null,
          clinic: null,
          tower: null,
        },
      },
    });
    expect(etykiety(dom)[0]).toBe('Przyjąć do domu (2 osoby będą spać na podłodze)');
    expect(eventView(dom.gov, dom.i)!.choices[0].label.en).toBe('Take them into the house (2 people on the floor)');
  });

  it('Wpuścić na noc niedostępne przy bramie na kłódkę po 20:00', () => {
    for (const [hour, ok] of [
      [21, false],
      [23, false],
      [2, false],
      [15, true],
      [19, true],
    ] as const) {
      const s = stan(reczny({ chce: 'nocleg' }), { input: { hour } });
      s.gov.laws.signed.u_brama = true;
      const c = eventView(s.gov, s.i)!.choices.find((x) => x.label.pl === 'Wpuścić na noc')!;
      expect(c.ok, `godzina ${hour}`).toBe(ok);
      if (!ok) {
        const fx = chooseEvent(s.gov, s.i, indeks(s, 'Wpuścić na noc'));
        expect(fx.goscRozkaz).toBeUndefined();
        expect(s.gov.ev.active).toBeTruthy();
      }
    }
    // bez uchwały brama jest otwarta o każdej porze
    const bez = stan(reczny({ chce: 'nocleg' }), { input: { hour: 22 } });
    expect(eventView(bez.gov, bez.i)!.choices.find((x) => x.label.pl === 'Wpuścić na noc')!.ok).toBe(true);
  });
});

// ---------------------------------------------------------------- haczyk

/** przebieg zarządu na atrapie przez noc, z listą gości ustawianą co sekundę; okna zarządu odpowiada gracz „propozycja” */
function przezNoc(gov: GovState, atr: Atrapa, doMin: number, goscie: (min: number) => GovGosc[]): { fx: GovEffects[] } {
  const r = mulberry(11);
  const fxs: GovEffects[] = [];
  const wej = () => ({ ...atr.input(), goscie: goscie(minAtrapy(atr)), napady: [] });
  while (minAtrapy(atr) < doMin) {
    atr.tick++;
    if (atr.tick % TPH === 0) atr.hourly(1);
    if (atr.tick % TPS !== 0) continue;
    const fx = govUpdate(gov, wej());
    fxs.push(fx);
    atr.apply(fx);
    for (let k = 0; k < 5; k++) {
      const p = pending(gov, wej());
      if (!p) break;
      // karty gościa nie ma tu być: ustawiamy tylko fazy `w_srodku` i dalej
      expect(p.k === 'wydarzenie' && p.id === 'gosc').toBe(false);
      answer(gov, atr, p, 'propozycja', r);
    }
  }
  return { fx: fxs };
}
const minAtrapy = (a: Atrapa): number => (a.day - 1) * 1440 + a.hour * 60 + a.minute;

describe('haczyk gościa', () => {
  it('kłamca wpuszczony na noc dostaje rozkaz klamie, rano linia o liczbie zabranych porcji', () => {
    const s = stan(reczny({ chce: 'nocleg', haczyk: 'klamie' }));
    const fx = wybierz(s, 'Wpuścić na noc');
    expect(rozkazy(fx)).toEqual(['noc', 'klamie']);
    // przebieg nocy: o 2:10 kłamca wychodzi z trzema porcjami (faza `odchodzi`, ukradl 3), o 3:00 już go nie ma
    const { gov } = s;
    gov.ev.active = null;
    const atr = new Atrapa(3);
    atr.supplies = 30;
    atr.woodSklad = 30;
    atr.tick = tickAt(3, 19);
    const wpis = (min: number): GovGosc[] => {
      const faza: FazaGoscia = min < at(4, 2, 10) ? 'w_srodku' : min < at(4, 3) ? 'odchodzi' : 'poszedl';
      return [
        {
          id: 'g1',
          faza,
          tile: 50,
          gdzie: { x: 50, y: 0 },
          pawns: faza === 'poszedl' ? [] : [100],
          zywi: faza === 'poszedl' ? [] : [0],
          ukradl: min < at(4, 2, 10) ? 0 : 3,
        },
      ];
    };
    przezNoc(gov, atr, at(4, 7), wpis);
    const raport = gov.reports.find((r) => r.day === 3)!;
    expect(
      raport.lines.some((l) => l.pl.includes('Rano nie było śladu po gościu, a z zapasów zniknęły 3 porcje jedzenia.')),
    ).toBe(true);
    expect(
      raport.lines.some((l) =>
        l.en.includes('there was no sign of the guest, and 3 portions of food were gone from the stores.'),
      ),
    ).toBe(true);
    // jeden raz, także w kronice; wizyta skończona
    expect(raport.lines.filter((l) => l.pl.includes('zniknęły')).length).toBe(1);
    expect(gov.log.filter((l) => l.big && l.txt.pl.includes('zniknęły 3 porcje')).length).toBe(1);
    expect(gov.goscie!.aktywny).toBeUndefined();
    // porcja w liczbie pojedynczej i mnogiej
    for (const [n, pl, en] of [
      [1, '1 porcja', '1 portion of'],
      [2, '2 porcje', '2 portions of'],
      [5, '5 porcji', '5 portions of'],
    ] as const) {
      const t = stan(reczny({ haczyk: 'klamie' }), { aktywny: { noc: true } });
      eventTick(t.gov, zFaza(t, 'odchodzi', { ukradl: n }), emptyEffects(), false);
      const l = t.gov.later.find((x) => x.line.pl.includes('zniknęły'))!;
      expect(l.line.pl).toContain(pl);
      expect(l.line.en).toContain(en);
    }
  });

  it('złapany: karta z trzema wyborami (oddać i wyrzucić, wyrzucić z łupem, zatrzymać do rana)', () => {
    const zlapany = (over: Partial<GovInput> = {}) => {
      const s = stan(reczny({ haczyk: 'klamie', chce: 'nocleg' }), {
        wpis: { faza: 'zlapany', ukradl: 2 },
        karta: false,
        aktywny: { noc: true },
        input: over,
      });
      s.i = { ...s.i, hour: 2, day: 4 };
      eventTick(s.gov, s.i, emptyEffects(), false);
      return s;
    };
    let s = zlapany();
    expect(s.gov.ev.active).toMatchObject({ id: 'zlapany', d: { id: 'g1' } });
    const v = eventView(s.gov, s.i)!;
    expect(v.title.pl).toBe('Złapany na kradzieży');
    expect(v.title.en).toBe('Caught stealing');
    expect(v.choices.map((c) => c.label.pl)).toEqual([
      'Oddać jedzenie i wyrzucić',
      'Wyrzucić z łupem',
      'Zatrzymać do rana',
    ]);
    expect(v.choices.map((c) => c.label.en)).toEqual([
      'Take the food back and throw them out',
      'Throw them out with the loot',
      'Hold them until morning',
    ]);
    expect(v.choices.every((c) => c.ok)).toBe(true);
    expect(v.gdzie).toEqual({ x: 34, y: 12 });
    expect(v.text.pl).toContain('2 porcje');
    expect(v.text.en).toContain('2 portions');
    // karta pokazuje się raz, także gdy symulacja nadal trzyma kradnącego
    s.gov.ev.active = null;
    eventTick(s.gov, { ...s.i, screen: s.i.screen + 1 }, emptyEffects(), false);
    expect(s.gov.ev.active).toBeNull();
    // 1. oddać i wyrzucić: łup wraca (puscic)
    s = zlapany();
    let t0 = s.gov.trust;
    let fx = wybierz(s, 'Oddać jedzenie');
    expect(rozkazy(fx)).toEqual(['puscic']);
    expect(s.gov.trust).toBe(t0 + 1);
    expect(s.gov.goscie!.aktywny!.koniec).toBe(true);
    // 2. wyrzucić z łupem: odchodzi z jedzeniem (odejdz), ludzie się wkurzają
    s = zlapany();
    t0 = s.gov.trust;
    const a0 = s.gov.anger;
    fx = wybierz(s, 'Wyrzucić z łupem');
    expect(rozkazy(fx)).toEqual(['odejdz']);
    expect(s.gov.trust).toBe(t0 - 1);
    expect(s.gov.anger).toBe(a0 + 1);
    // 3. zatrzymać do rana: pilnuje ktoś z zarządu (odpoczynek −10), bez rozkazu; wizyta trwa dalej
    s = zlapany();
    fx = wybierz(s, 'Zatrzymać do rana');
    expect(fx.goscRozkaz).toBeUndefined();
    expect(fx.needs).toHaveLength(1);
    expect(fx.needs[0].d).toEqual({ rest: -10 });
    expect(s.gov.later.some((l) => l.line.pl.includes('złapanego gościa do rana'))).toBe(true);
    expect(s.gov.goscie!.aktywny!.koniec).toBeUndefined();
    expect(s.gov.goscie!.aktywny!.zl).toBe(true);
    expect(s.gov.ev.active).toBeNull();
    // nikt nie może pilnować (wszyscy poza mapą): trzeci wybór niedostępny
    s = zlapany();
    s.i = { ...s.i, people: wszyscyPozaMapa(s.i.people) };
    expect(eventView(s.gov, s.i)!.choices.map((c) => c.ok)).toEqual([true, true, false]);
    // wybór po tym, jak kradnący już poszedł: nic
    s = zlapany();
    s.i = zFaza(s, 'odchodzi', {}, { hour: 2, day: 4 });
    expect(eventView(s.gov, s.i)!.choices.every((c) => !c.ok)).toBe(true);
  });

  it('pościg wpuszczony: szansa napadu tej nocy ×1,5 na bramie', () => {
    const s = stan(reczny({ chce: 'nocleg', haczyk: 'poscig' }));
    const przed = raidChance(s.gov, s.i);
    expect(s.gov.tonight.poscig).toBeUndefined();
    const fx = wybierz(s, 'Wpuścić na noc');
    expect(rozkazy(fx)).toEqual(['noc']);
    expect(fx.halas).toBeUndefined();
    expect(s.gov.tonight.poscig).toBe(3);
    const po = raidChance(s.gov, s.i);
    expect(po).toBeCloseTo(Math.min(0.85, Math.round(przed * 1.5 * 100) / 100), 10);
    expect(po).toBeGreaterThan(przed);
    // inna noc: bez pościgu
    expect(raidChance(s.gov, { ...s.i, day: 4 })).toBe(raidChance(newGov(3), { ...s.i, day: 4 }));
    // odprawiony pościg nic nie zmienia
    const o = stan(reczny({ chce: 'nocleg', haczyk: 'poscig' }));
    wybierz(o, 'Odprawić');
    expect(o.gov.tonight.poscig).toBeUndefined();
  });

  it('pościg: karta nocy zatwierdzona po nim stawia napad przy bramie, a szansa jest nie mniejsza niż bez pościgu', () => {
    let zPoscigiem = 0;
    let bezPoscigu = 0;
    let rozne = 0;
    let nieBrama = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const wynik = (poscig: boolean) => {
        const gov = newGov(seed);
        const atr = new Atrapa(seed);
        atr.supplies = 30;
        atr.woodSklad = 30;
        atr.tick = tickAt(3, 20, 5);
        if (poscig) gov.tonight.poscig = 3;
        govUpdate(gov, atr.input());
        confirmNight(gov, atr.input());
        return gov.night!.raid!;
      };
      const a = wynik(false);
      const b = wynik(true);
      if (a.come) bezPoscigu++;
      if (b.come) zPoscigiem++;
      // ta sama kolejność losowań: kto przyszedł bez pościgu, przychodzi i z nim
      if (a.come) expect(b.come, `ziarno ${seed}`).toBe(true);
      if (b.come && !a.come) rozne++;
      // napad przy bramie
      expect(b.post, `ziarno ${seed}`).toBe('brama');
      if (a.post !== 'brama') nieBrama++;
    }
    expect(zPoscigiem).toBeGreaterThan(bezPoscigu);
    expect(rozne).toBeGreaterThan(0);
    // bez pościgu napad bywa gdzie indziej niż brama
    expect(nieBrama).toBeGreaterThan(5);
  });

  it('pościg po zatwierdzeniu karty: dodatkowe losowanie, napad przy bramie najwcześniej za 20 minut, raz na noc', () => {
    const przygotuj = (seed: number) => {
      const gov = newGov(seed);
      const atr = new Atrapa(seed);
      atr.supplies = 30;
      atr.woodSklad = 30;
      atr.tick = tickAt(3, 20, 5);
      govUpdate(gov, atr.input());
      confirmNight(gov, atr.input());
      return { gov, atr };
    };
    // ziarno, w którym napad tej nocy nie przyszedł
    let seed = 1;
    while (przygotuj(seed).gov.night!.raid!.come) seed++;
    const { gov, atr } = przygotuj(seed);
    const n = gov.night!;
    expect(n.raid!.come).toBe(false);
    atr.tick = tickAt(3, 21, 0);
    const i = atr.input();
    // losowanie przegrywa: znacznik jest, napadu nie ma
    gov.rng.s = znajdzLosowanie((x) => x >= 0.9);
    let fx = emptyEffects();
    poscigNocy(gov, i, fx);
    expect(gov.tonight.poscig).toBe(3);
    expect(n.raid!.come).toBe(false);
    expect(fx.raid).toBeNull();
    // druga próba tej nocy nic nie zmienia
    gov.rng.s = znajdzLosowanie((x) => x < 0.001);
    const s0 = gov.rng.s;
    fx = emptyEffects();
    poscigNocy(gov, i, fx);
    expect(gov.rng.s).toBe(s0);
    expect(n.raid!.come).toBe(false);
    // nowa noc, losowanie wygrywa
    const { gov: g2, atr: a2 } = przygotuj(seed);
    a2.tick = tickAt(3, 21, 0);
    g2.rng.s = znajdzLosowanie((x) => x < 0.001);
    fx = emptyEffects();
    poscigNocy(g2, a2.input(), fx);
    const raid = g2.night!.raid!;
    expect(raid.come).toBe(true);
    expect(raid.post).toBe('brama');
    expect(raid.attack).toBeGreaterThanOrEqual(2);
    expect(raid.at).toBeGreaterThanOrEqual(gameMin(a2.input()) + 20);
    expect(fx.raid).toMatchObject({ day: 3, post: 'brama', at: raid.at, attack: raid.attack });
    expect(fx.raid!.people).toBeGreaterThanOrEqual(1);
    // po 23:00 rozstrzygnięty napad albo napad, który już się zaczął, zostaje bez zmian
    const { gov: g3, atr: a3 } = przygotuj(seed);
    g3.night!.raid!.resolved = true;
    a3.tick = tickAt(4, 1, 0);
    g3.rng.s = znajdzLosowanie((x) => x < 0.001);
    const r0 = g3.rng.s;
    fx = emptyEffects();
    poscigNocy(g3, a3.input(), fx);
    expect(g3.rng.s).toBe(r0);
    expect(g3.night!.raid!.come).toBe(false);
  });

  it('hałas przy bramie (zombie): GovEffects.halas = { tile, r: 15 }, po applyGov wpis w st.noise', () => {
    const s = stan(reczny({ chce: 'nocleg', haczyk: 'poscig' }), { mode: 'zombie' });
    const fx = wybierz(s, 'Wpuścić na noc');
    expect(rozkazy(fx)).toEqual(['noc']);
    expect(fx.halas).toEqual({ tile: 1234, r: 15 });
    expect(s.gov.tonight.poscig).toBeUndefined();
    // hałas dociera do symulacji jak każdy inny
    const w = mockBlock();
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    st.tick = 777;
    const przed = st.noise?.length ?? 0;
    const tile = 20 * w.size + 30;
    applyGov(st, w, { ...emptyEffects(), halas: { tile, r: 15 } });
    expect(st.noise!.length).toBe(przed + 1);
    expect(st.noise![st.noise!.length - 1]).toEqual({ x: 30.5, y: 20.5, r: 15, until: 777 + NOISE_TICKS });
    // bez hałasu w skutkach nic nie przybywa
    applyGov(st, w, emptyEffects());
    expect(st.noise!.length).toBe(przed + 1);
    // żaden plan nie zostawia pustego pola
    expect('halas' in emptyEffects()).toBe(false);
  });

  it('chory wpuszczony albo przyjęty: rano choroba jednej osoby', () => {
    for (const [prefix, chce] of [
      ['Wpuścić na noc', 'nocleg'],
      ['Przyjąć do spółdzielni', 'dolaczyc'],
    ] as const) {
      const s = stan(reczny({ chce, haczyk: 'chory' }));
      const fx = wybierz(s, prefix);
      // nie od razu: rano
      expect(fx.sick).toBe(0);
      const wpis = s.gov.later.find((l) => l.sick);
      expect(wpis, prefix).toMatchObject({ day: 3, sick: 1 });
      expect(wpis!.line.pl).toMatch(/dreszcze/);
      expect(polskieSlowa(wpis!.line.en)).toEqual([]);
    }
    // odprawiony chory nikogo nie zaraża
    const o = stan(reczny({ chce: 'nocleg', haczyk: 'chory' }));
    wybierz(o, 'Odprawić');
    expect(o.gov.later.some((l) => l.sick)).toBe(false);
    // rano, w raporcie nocy, choroba trafia do skutków
    const s = stan(reczny({ chce: 'nocleg', haczyk: 'chory' }));
    s.gov.ev.active = null;
    wybierz(
      { ...s, gov: Object.assign(s.gov, { ev: { ...s.gov.ev, active: { id: 'gosc', d: { id: 'g1' } } } }) },
      'Wpuścić na noc',
    );
    const atr = new Atrapa(3);
    atr.supplies = 30;
    atr.woodSklad = 30;
    atr.tick = tickAt(3, 19);
    const { fx } = przezNoc(s.gov, atr, at(4, 7), () => [
      { id: 'g1', faza: 'w_srodku', tile: 5, gdzie: { x: 5, y: 0 }, pawns: [100], zywi: [0], ukradl: 0 },
    ]);
    expect(fx.reduce((a, f) => a + f.sick, 0)).toBe(1);
    expect(s.gov.reports.find((r) => r.day === 3)!.lines.some((l) => l.pl.includes('dreszcze'))).toBe(true);
  });

  it('ugryziony w zombie: Obejrzeć ręce odsłania z pewnością, przy zdrowym zaufanie −1', () => {
    const ugryziony = () =>
      stan(reczny({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 1 }), { mode: 'zombie' });
    // ugryziony: karta pokazuje ugryzienie, zostaje otwarta, wyboru już nie ma, nic nie kosztuje
    let s = ugryziony();
    const t0 = s.gov.trust;
    const nastepne = s.gov.ev.next;
    const decyzje = s.gov.decisions.length;
    const przed = tekstKarty(s);
    expect(etykiety(s)).toContain('Obejrzeć ręce');
    const fx = wybierz(s, 'Obejrzeć ręce');
    expect(fx.goscRozkaz).toBeUndefined();
    expect(s.gov.ev.active).toMatchObject({ id: 'gosc' });
    expect(s.gov.trust).toBe(t0);
    expect(s.gov.ev.next).toBe(nastepne);
    expect(s.gov.decisions).toHaveLength(decyzje);
    expect(s.gov.goscie!.aktywny!.obejrzano).toBe('ugryziony');
    const po = eventView(s.gov, s.i)!;
    expect(po.text.pl.startsWith(przed)).toBe(true);
    const imie = s.gov.goscie!.aktywny!.gosc.osoby[1].first;
    expect(po.text.pl).toContain(`U ${imie} pod rękawem jest świeże ugryzienie.`);
    expect(po.text.en).toContain(`${imie} has a fresh bite under the sleeve.`);
    expect(po.choices.map((c) => c.label.pl)).not.toContain('Obejrzeć ręce');
    expect(po.choices.every((c) => c.ok)).toBe(true);
    // zdrowy gość (chory, ale nie ugryziony): zaufanie −1, karta zostaje bez tego wyboru
    s = stan(reczny({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'chory' }), { mode: 'zombie' });
    wybierz(s, 'Obejrzeć ręce');
    expect(s.gov.trust).toBe(t0 - 1);
    expect(s.gov.ev.active).toMatchObject({ id: 'gosc' });
    expect(s.gov.goscie!.aktywny!.obejrzano).toBe('czysty');
    expect(tekstKarty(s)).toContain('Obejrzeliście ręce: czyste, bez śladu zębów.');
    expect(etykiety(s)).not.toContain('Obejrzeć ręce');
    // wpuszczony albo przyjęty ugryziony dostaje rozkaz ugryziony, w obu kolejnościach z jednego wywołania nie ma znaczenia
    for (const [prefix, chce, kolejnosc] of [
      ['Wpuścić na noc', 'nocleg', ['noc', 'ugryziony']],
      ['Przyjąć do spółdzielni', 'dolaczyc', ['zostan', 'ugryziony']],
    ] as const) {
      const t = stan(reczny({ kto: 'ocaleni', ilu: 3, chce, haczyk: 'ugryziony', ugryziony: 1 }), { mode: 'zombie' });
      expect(rozkazy(wybierz(t, prefix))).toEqual(kolejnosc);
    }
    // odprawiony ugryziony nikogo nie zaraża
    const o = ugryziony();
    expect(rozkazy(wybierz(o, 'Odprawić'))).toEqual(['odejdz']);
    // kłamca nie dostaje ugryzienia, ugryziony nie dostaje klamie
    expect(rozkazy(wybierz(stan(reczny({ chce: 'nocleg', haczyk: 'klamie' })), 'Wpuścić na noc'))).not.toContain(
      'ugryziony',
    );
    expect(rozkazy(wybierz(ugryziony(), 'Wpuścić na noc'))).not.toContain('klamie');
  });

  it('dobić bliskiego: dzida przez siatkę, rozkaz dobij i odejście reszty, nastrój zabójcy; bez dzidy niedostępne', () => {
    const g = () => reczny({ kto: 'z_ugryzionym', chce: 'dobic', haczyk: 'ugryziony', ugryziony: 1 });
    const zDzida = () => {
      const s = stan(g(), { mode: 'zombie' });
      s.i.people = s.i.people.map((p, k) => (k === 0 ? { ...p, arm: 'dzida' as const } : p));
      return s;
    };
    const bez = stan(g(), { mode: 'zombie' });
    expect(eventView(bez.gov, bez.i)!.choices[0].ok).toBe(false);
    const s = zDzida();
    const fx = wybierz(s, 'Dobić przez siatkę dzidą');
    expect(rozkazy(fx)).toEqual(['dobij', 'odejdz']);
    const kto = s.i.people[0];
    expect(fx.moods).toEqual([{ id: kto.id, why: 'Zabiłem człowieka', d: -6, hours: 24 }]);
    expect(s.gov.log.some((l) => l.big && l.txt.pl.includes('przez siatkę'))).toBe(true);
    expect(s.gov.goscie!.aktywny!.koniec).toBe(true);
    // wpuszczenie bliskiego, który prosił o dobicie, zaraża go wewnątrz
    const w = stan(g(), { mode: 'zombie' });
    expect(rozkazy(wybierz(w, 'Wpuścić na noc'))).toEqual(['noc', 'ugryziony']);
  });
});

/** ziarno generatora zarządu, z którego pierwsze losowanie spełnia warunek */
function znajdzLosowanie(ok: (x: number) => boolean): number {
  for (let s = 1; s < 100000; s++) if (ok(nextRandom({ s }))) return s;
  throw new Error('brak ziarna');
}

// ---------------------------------------------------------------- wiadomość i wskazówka

describe('wiadomość od gościa: wskazówka na miejsce', () => {
  const apteka: Miejsce = { klucz: 'poi:400:0', kat: 'apteka', x: 400, y: 0, odl: 400, nazwa: 'Pod Różą' };
  const wiadomosc = (over: Partial<Gosc> = {}) =>
    reczny({
      chce: 'nocleg',
      ma: 'wiadomosc',
      skad: { strona: 'e', klucz: apteka.klucz, nazwa: frazaSkad('apteka', 'Pod Różą') },
      ...over,
    });

  it('wiadomość daje wskazówkę na miejsce z okolicy, a wyprawa tam ma ryzyko ×0,5', () => {
    const s = stan(wiadomosc(), { input: { okolica: [apteka] } });
    wlaczMiasto(s.gov);
    expect(s.gov.wskazowki).toBeUndefined();
    wybierz(s, 'Wpuścić na noc');
    expect(s.gov.wskazowki).toEqual({ 'poi:400:0': { dzien: 3 } });
    // linia w kronice nazywa miejsce (kategoria i nazwa jak w frazaSkad)
    const linia = s.gov.log.find((l) => l.txt.pl.startsWith('Wieść o miejscu: '))!;
    expect(linia.big).toBe(true);
    expect(linia.txt.pl).toContain('Wieść o miejscu: apteka „Pod Różą”. Nikt tam nie zaglądał');
    expect(linia.txt.en).toContain('News of a place: the pharmacy “Pod Różą”. Nobody has looked in there');
    expect(polskieSlowa(linia.txt.en, ['Pod Różą'])).toEqual([]);
    // ryzyko wyprawy tam jest o połowę mniejsze (karta pokazuje już zmniejszone)
    const cel = celZMiejsca(apteka);
    const osoba = s.i.people[0];
    const z = expRisk(s.gov, osoba, cel);
    const bez = expRisk({ ...s.gov, wskazowki: undefined }, osoba, cel);
    expect(z).toBeCloseTo(Math.round(bez * 0.5 * 100) / 100, 2);
    expect(z).toBeLessThan(bez);
    // ta sama wskazówka widoczna na karcie nocy
    const karta = makeCard(s.gov, { ...s.i, okolica: [apteka] }).card;
    const opcja = karta.people[0].options.find((o) => o.target === apteka.klucz)!;
    const zwykla = makeCard(
      { ...s.gov, wskazowki: undefined },
      { ...s.i, okolica: [apteka] },
    ).card.people[0].options.find((o) => o.target === apteka.klucz)!;
    expect(opcja.risk!).toBeLessThan(zwykla.risk!);
    // inne miejsce bez zmian
    const inne = celZMiejsca({ ...apteka, klucz: 'poi:401:0' });
    expect(expRisk(s.gov, osoba, inne)).toBe(expRisk({ ...s.gov, wskazowki: undefined }, osoba, inne));
  });

  it('rozliczenie wyprawy zużywa wskazówkę: łup ×1,5, ryzyko ×0,5, tylko raz', () => {
    const s = stan(wiadomosc(), { input: { okolica: [apteka] } });
    wlaczMiasto(s.gov);
    wybierz(s, 'Wpuścić na noc');
    const cel = { ...celZMiejsca(apteka), lup: { supplies: [4, 4] as [number, number] }, ryzyko: 0, zapas: 100 };
    const osoby = [s.i.people[0]];
    // ziarno bez kłopotów w obu przebiegach (ryzyko najmniejsze)
    const przebieg = (hint: boolean, seed: number) => {
      const gov = newGov(seed);
      if (hint) gov.wskazowki = { [apteka.klucz]: { dzien: 3 } };
      const fx = emptyEffects();
      const r = rozliczWyprawe(gov, s.i, fx, cel, osoby);
      return { r, gov, fx };
    };
    let sprawdzone = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = przebieg(false, seed);
      const b = przebieg(true, seed);
      if (a.r.lines[0].pl.includes('trafił') || b.r.lines[0].pl.includes('trafił')) continue;
      sprawdzone++;
      expect(a.r.loot.supplies, `ziarno ${seed}`).toBe(4);
      expect(b.r.loot.supplies, `ziarno ${seed}`).toBe(6);
      expect(maWskazowke(b.gov, apteka.klucz)).toBe(false);
      expect(b.gov.wskazowki).toEqual({});
    }
    expect(sprawdzone).toBeGreaterThan(20);
    // druga wyprawa w to samo miejsce nie ma już wskazówki
    const gov = newGov(1);
    gov.wskazowki = { [apteka.klucz]: { dzien: 3 } };
    rozliczWyprawe(gov, s.i, emptyEffects(), cel, osoby);
    const drugi = rozliczWyprawe(gov, s.i, emptyEffects(), cel, osoby);
    expect(drugi.loot.supplies).toBeLessThanOrEqual(4);
  });

  it('wskazowka(st, klucz) zużywa wskazówkę i mówi, czy była; maWskazowke tylko czyta', () => {
    const st = newGov(1);
    expect(maWskazowke(st, 'x')).toBe(false);
    expect(wskazowka(st, 'x')).toBe(false);
    st.wskazowki = { x: { dzien: 2 }, y: { dzien: 3 } };
    expect(maWskazowke(st, 'x')).toBe(true);
    expect(maWskazowke(st, 'x')).toBe(true);
    expect(wskazowka(st, 'x')).toBe(true);
    expect(wskazowka(st, 'x')).toBe(false);
    expect(st.wskazowki).toEqual({ y: { dzien: 3 } });
  });

  it('bez mapy miasta, bez dostępnych miejsc albo bez okolicy wskazówka dotyczy celu z TARGETS (najmniej odwiedzany daleki)', () => {
    const dalekie = TARGETS.filter((t) => t.range === 'daleko').map((t) => t.id);
    const wschod = { skad: { strona: 'e' as const, nazwa: tx('ze wschodu', 'from the east') } };
    // bez okolicy w wejściu
    const bez = stan(wiadomosc(wschod));
    wybierz(bez, 'Wpuścić na noc');
    expect(Object.keys(bez.gov.wskazowki!)).toEqual([dalekie[0]]);
    expect(
      bez.gov.log.some((l) => l.txt.pl.startsWith('Wieść o miejscu: ') && l.txt.pl.includes('pawilon handlowy')),
    ).toBe(true);
    expect(
      bez.gov.log.some((l) => l.txt.en.startsWith('News of a place: ') && l.txt.en.includes('shopping pavilion')),
    ).toBe(true);
    // pawilon odwiedzany: następny w kolejności
    const odwiedzany = stan(wiadomosc(wschod));
    odwiedzany.gov.visits.pawilon = 2;
    wybierz(odwiedzany, 'Wpuścić na noc');
    expect(Object.keys(odwiedzany.gov.wskazowki!)).toEqual([dalekie[1]]);
    // okolica jest, ale zarząd gra bez mapy miasta (karta nocy ma tylko TARGETS): wskazówka na TARGETS, nie na martwe miejsce
    const bezMiasta = stan(wiadomosc(), { input: { okolica: [apteka] } });
    wybierz(bezMiasta, 'Wpuścić na noc');
    expect(Object.keys(bezMiasta.gov.wskazowki!)).toEqual([dalekie[0]]);
    // z mapą miasta, ale jedyne miejsca są na mapie lokalnej, za daleko albo wyczerpane: też TARGETS
    const lokalne: Miejsce = { ...apteka, klucz: 'poi:100:0', x: 100, odl: 100 };
    const daleko: Miejsce = { ...apteka, klucz: 'poi:900:0', x: 900, odl: 900 };
    for (const [nazwa, okolica] of [
      ['mapa lokalna', [lokalne]],
      ['za daleko', [daleko]],
      ['mapa lokalna i za daleko', [lokalne, daleko]],
    ] as const) {
      const s = stan(
        wiadomosc({ skad: { strona: 'e', klucz: okolica[0].klucz, nazwa: frazaSkad('apteka', 'Pod Różą') } }),
        {
          input: { okolica },
        },
      );
      wlaczMiasto(s.gov);
      wybierz(s, 'Wpuścić na noc');
      expect(Object.keys(s.gov.wskazowki!), nazwa).toEqual([dalekie[0]]);
    }
    const w = stan(wiadomosc(), { input: { okolica: [apteka] } });
    wlaczMiasto(w.gov);
    w.gov.miasto!.zabrano[apteka.klucz] = 1000;
    wybierz(w, 'Wpuścić na noc');
    expect(Object.keys(w.gov.wskazowki!), 'wyczerpane').toEqual([dalekie[0]]);
  });

  it('miejsce gościa leży na mapie lokalnej: wskazówka na najbliższe dostępne po jego stronie, a gdy tam nic, na najbliższe w ogóle', () => {
    const lokalne: Miejsce = { ...apteka, klucz: 'poi:100:0', kat: 'sklep', x: 100, odl: 100, nazwa: 'Studio fryzur' };
    const wschodDaleko: Miejsce = { ...apteka, klucz: 'poi:600:0', x: 600, odl: 600, nazwa: 'Pod Różą' };
    const wschodBlizej: Miejsce = { ...apteka, klucz: 'poi:400:10', x: 400, y: 10, odl: 400, nazwa: 'Zielony Kącik' };
    // klucz z niezerowym zapasem startowym (część miejsc jest od lat pusta, `zapasStartowy`)
    const zachod: Miejsce = {
      ...apteka,
      klucz: 'poi:-240:0',
      kat: 'spozywczy',
      x: -240,
      odl: 240,
      nazwa: 'Pod Kasztanem',
    };
    const przy = (okolica: Miejsce[], strona: 'e' | 'w' = 'e') => {
      const s = stan(
        wiadomosc({ skad: { strona, klucz: lokalne.klucz, nazwa: frazaSkad('sklep', 'Studio fryzur') } }),
        {
          input: { okolica },
        },
      );
      wlaczMiasto(s.gov);
      wybierz(s, 'Wpuścić na noc');
      return s;
    };
    // po stronie gościa (wschód) najbliższe dostępne, choć na zachodzie jest bliżej
    let s = przy([lokalne, wschodDaleko, wschodBlizej, zachod]);
    expect(Object.keys(s.gov.wskazowki!)).toEqual([wschodBlizej.klucz]);
    // linia w kronice nazywa miejsce kategorią i nazwą jak „skąd”
    const linia = s.gov.log.find((l) => l.txt.pl.startsWith('Wieść o miejscu'))!;
    expect(linia.txt.pl).toContain('Wieść o miejscu: apteka „Zielony Kącik”.');
    expect(linia.txt.en).toContain('News of a place: the pharmacy “Zielony Kącik”.');
    // nic po stronie gościa: najbliższe w ogóle
    s = przy([lokalne, zachod]);
    expect(Object.keys(s.gov.wskazowki!)).toEqual([zachod.klucz]);
    expect(s.gov.log.find((l) => l.txt.pl.startsWith('Wieść o miejscu'))!.txt.pl).toContain(
      'Wieść o miejscu: sklep spożywczy „Pod Kasztanem”.',
    );
    // to samo miejsce wskazane przez gościa, gdy da się tam iść: jego fraza „skąd”
    const dobre = stan(wiadomosc(), { input: { okolica: [apteka, wschodBlizej] } });
    wlaczMiasto(dobre.gov);
    wybierz(dobre, 'Wpuścić na noc');
    expect(Object.keys(dobre.gov.wskazowki!)).toEqual([apteka.klucz]);
    // karta nocy proponuje to miejsce i pokazuje je z mniejszym ryzykiem
    const karta = makeCard(s.gov, { ...s.i, okolica: [lokalne, zachod] }).card;
    expect(karta.people[0].options.some((o) => o.target === zachod.klucz)).toBe(true);
  });

  it('wiadomość bez nagrody po odprawie, a z karty „Wysłuchać” gość odchodzi', () => {
    const s = stan(wiadomosc({ chce: 'wiadomosc' }), { input: { okolica: [apteka] } });
    wlaczMiasto(s.gov);
    const fx = wybierz(s, 'Wysłuchać');
    expect(rozkazy(fx)).toEqual(['odejdz']);
    expect(s.gov.wskazowki).toEqual({ [apteka.klucz]: { dzien: 3 } });
    const o = stan(wiadomosc({ chce: 'wiadomosc' }), { input: { okolica: [apteka] } });
    wlaczMiasto(o.gov);
    wybierz(o, 'Odprawić');
    expect(o.gov.wskazowki).toBeUndefined();
  });
});

// ---------------------------------------------------------------- gość odszedł, zapis, język

describe('gość znika przy otwartej karcie', () => {
  it('gość, który poszedł albo zginął przy otwartej karcie: karta znika, linia w kronice, wybór nie steruje niczym', () => {
    for (const [faza, pl, en] of [
      ['poszedl', 'odszedł spod bramy, zanim ktokolwiek zdecydował.', 'left the gate before anyone had decided.'],
      ['zginal', 'zginął pod bramą, zanim ktokolwiek zdecydował.', 'died at the gate before anyone had decided.'],
    ] as const) {
      const s = stan(reczny({ chce: 'jedzenie' }));
      const imie = s.gov.goscie!.aktywny!.gosc.osoby[0];
      const wejscie = zFaza(s, faza, { pawns: [] });
      // zanim zarząd to zauważy: wybór nic nie robi (faza sprawdzana w chwili kliknięcia)
      const fx0 = chooseEvent(s.gov, wejscie, indeks({ ...s, i: wejscie }, 'Podać jedzenie'));
      expect(fx0.goscRozkaz, faza).toBeUndefined();
      expect(fx0.stock.supplies, faza).toBe(0);
      expect(s.gov.ev.active, faza).toBeTruthy();
      // krok zarządu: karta znika
      const dlugosc = s.gov.log.length;
      eventTick(s.gov, wejscie, emptyEffects(), false);
      expect(s.gov.ev.active, faza).toBeNull();
      expect(pending(s.gov, wejscie), faza).toBeNull();
      expect(s.gov.log.length, faza).toBe(dlugosc + 1);
      const wpis = s.gov.log[s.gov.log.length - 1].txt;
      expect(wpis.pl, faza).toBe(
        `${imie.name} ${imie.f ? pl.replace('ł ', 'ła ') : pl}`.replace('odeszła spod', 'odeszła spod'),
      );
      expect(wpis.en, faza).toBe(`${imie.name} ${en}`);
      // wizyta skończona
      expect(s.gov.goscie!.aktywny, faza).toBeUndefined();
      expect(s.gov.goscie!.czytane, faza).toBe(1);
      // wybór po zniknięciu karty: false, bez skutków
      const fx = chooseEvent(s.gov, wejscie, 0);
      expect(fx.goscRozkaz, faza).toBeUndefined();
      expect(fx.stock).toEqual(emptyEffects().stock);
      expect(s.gov.decisions, faza).toHaveLength(0);
    }
  });

  it('grupa: „Ludzie spod bramy odeszli/nie żyją”; odchodzi też znaczy, że karta nie ma już gościa', () => {
    for (const [faza, pl, en] of [
      [
        'poszedl',
        'Ludzie spod bramy odeszli, zanim ktokolwiek zdecydował.',
        'The people at the gate left before anyone had decided.',
      ],
      [
        'zginal',
        'Ludzie spod bramy nie żyją. Nikt nie zdążył zdecydować.',
        'The people at the gate are dead. Nobody got the chance to decide.',
      ],
      [
        'odchodzi',
        'Ludzie spod bramy odeszli, zanim ktokolwiek zdecydował.',
        'The people at the gate left before anyone had decided.',
      ],
    ] as const) {
      const s = stan(reczny({ kto: 'rodzina', ilu: 3, chce: 'dolaczyc' }));
      eventTick(s.gov, zFaza(s, faza, { pawns: [] }), emptyEffects(), false);
      expect(s.gov.ev.active, faza).toBeNull();
      const wpis = s.gov.log[s.gov.log.length - 1].txt;
      expect(wpis.pl, faza).toBe(pl);
      expect(wpis.en, faza).toBe(en);
    }
  });

  it('karta „Złapany” znika, gdy kradnący odszedł; karta z zapisu bez wizyty znika po cichu', () => {
    const s = stan(reczny({ haczyk: 'klamie' }), {
      wpis: { faza: 'zlapany', ukradl: 1 },
      karta: false,
      aktywny: { noc: true },
    });
    eventTick(s.gov, s.i, emptyEffects(), false);
    expect(s.gov.ev.active?.id).toBe('zlapany');
    eventTick(s.gov, zFaza(s, 'odchodzi'), emptyEffects(), false);
    expect(s.gov.ev.active).toBeNull();
    // zapis z otwartą kartą gościa, ale bez wizyty (wizyta zniknęła z zapisu zarządu)
    const stary = stan(null);
    stary.gov.ev.active = { id: 'gosc', d: { id: 'g9' } };
    const dlugosc = stary.gov.log.length;
    eventTick(stary.gov, stary.i, emptyEffects(), false);
    expect(stary.gov.ev.active).toBeNull();
    expect(stary.gov.log.length).toBe(dlugosc);
    // gra bez obcych (nie ma `goscie` w wejściu): wizyta kończy się cicho
    const bez = stan(reczny());
    delete (bez.i as { goscie?: unknown }).goscie;
    eventTick(bez.gov, bez.i, emptyEffects(), false);
    expect(bez.gov.ev.active).toBeNull();
    expect(bez.gov.goscie!.aktywny).toBeUndefined();
  });
});

describe('gość w domu i gość z nocy', () => {
  const DOM: GovInput['place'] = {
    kind: 'dom',
    blocks: 0,
    houses: 6,
    near: 'domy',
    shop: null,
    garages: null,
    clinic: null,
    tower: null,
  };

  it('w domu wpisy o zniknięciu, planie, który przepadł, i chorobie mówią o furtce i komitecie, po angielsku bez bramy', () => {
    // zniknięcie przy otwartej karcie
    const s = stan(reczny({ chce: 'jedzenie' }), { input: { place: DOM } });
    eventTick(s.gov, zFaza(s, 'poszedl', { pawns: [] }), emptyEffects(), false);
    const wpis = s.gov.log[s.gov.log.length - 1].txt;
    expect(wpis.pl).toMatch(
      /odszedł spod furtki, zanim ktokolwiek zdecydował\.$|odeszła spod furtki, zanim ktokolwiek zdecydował\.$/,
    );
    expect(wpis.en).toMatch(/ left the garden gate before anyone had decided\.$/);
    // plan, który przepadł
    for (const [faza, pl, en] of [
      [
        'nie_doszedl',
        'Ktoś szedł do furtki, ale nie doszedł.',
        'Somebody was walking up to the garden gate, but never arrived.',
      ],
      ['poszedl', 'Ktoś szedł do furtki, ale zawrócił', 'Somebody was coming up to the garden gate, but turned back'],
      ['zginal', 'Ktoś szedł do furtki i nie dotarł', 'Somebody was coming to the garden gate and never made it'],
    ] as const) {
      const t = stan(reczny(), { karta: false, aktywny: { karta: false }, input: { place: DOM } });
      eventTick(t.gov, zFaza(t, faza, { pawns: [] }), emptyEffects(), false);
      const l = t.gov.log[t.gov.log.length - 1].txt;
      expect(l.pl, faza).toContain(pl);
      expect(l.en, faza).toContain(en);
    }
    // choroba
    const c = stan(reczny({ chce: 'nocleg', haczyk: 'chory' }), { input: { place: DOM } });
    wybierz(c, 'Wpuścić na noc');
    const linia = c.gov.later.find((l) => l.sick)!.line;
    expect(linia.pl).toContain('ktoś z komitetu ma dreszcze');
    expect(linia.pl).toContain('spod furtki');
    expect(linia.en).toContain('on the committee has the shivers');
    expect(linia.en).toContain('the garden gate');
    expect(polskieSlowa(linia.en)).toEqual([]);
  });

  it('gość wpuszczony na noc, który nie dożył rana, ma wpis w kronice (jeden gość i grupa)', () => {
    for (const [ilu, pl, en] of [
      [1, 'nie przeżył nocy u was.', 'did not survive the night with you.'],
      [3, 'Goście z nocy nie przeżyli.', 'The guests of the night did not survive.'],
    ] as const) {
      const g = reczny({ kto: ilu === 1 ? 'wedrowiec' : 'rodzina', ilu, chce: 'nocleg' });
      g.osoby[0].f = false;
      const s = stan(g, { karta: true });
      wybierz(s, 'Wpuścić na noc');
      const dlugosc = s.gov.log.length;
      eventTick(s.gov, zFaza(s, 'zginal', { pawns: [] }), emptyEffects(), false);
      const l = s.gov.log.slice(dlugosc);
      expect(l).toHaveLength(1);
      expect(l[0].big).toBe(true);
      expect(l[0].txt.pl).toContain(pl);
      expect(l[0].txt.en).toContain(en);
      expect(s.gov.goscie!.aktywny).toBeUndefined();
    }
    // odprawiony gość, który potem zginął poza mapą, nie dostaje wpisu o nocy
    const o = stan(reczny(), { karta: true });
    wybierz(o, 'Odprawić');
    const dl = o.gov.log.length;
    eventTick(o.gov, zFaza(o, 'zginal', { pawns: [] }), emptyEffects(), false);
    expect(o.gov.log.length).toBe(dl);
  });

  it('pościg dotyczy też przyjętego do osiedla: znacznik tej nocy albo hałas w zombie', () => {
    const z = stan(reczny({ chce: 'dolaczyc', haczyk: 'poscig' }));
    const fx = wybierz(z, 'Przyjąć do spółdzielni');
    expect(rozkazy(fx)).toEqual(['zostan']);
    expect(z.gov.tonight.poscig).toBe(3);
    const zom = stan(reczny({ chce: 'dolaczyc', haczyk: 'poscig' }), { mode: 'zombie' });
    const fxz = wybierz(zom, 'Przyjąć do spółdzielni');
    expect(fxz.halas).toEqual({ tile: 1234, r: 15 });
    expect(zom.gov.tonight.poscig).toBeUndefined();
    // karmiony przez siatkę pościg nie wchodzi, więc nic nie zmienia
    const j = stan(reczny({ chce: 'jedzenie', haczyk: 'poscig' }));
    wybierz(j, 'Podać jedzenie');
    expect(j.gov.tonight.poscig).toBeUndefined();
  });
});

describe('karta po śmierci członka grupy', () => {
  const rodzina = (over: Partial<Gosc> = {}) => reczny({ kto: 'rodzina', chce: 'dolaczyc', ilu: 3, ...over });

  it('zmarły mówiący: karta nazywa pierwszą żywą osobę, liczba osób zgadza się z pionkami, a Przyjąć do zarządu dotyczy jej', () => {
    const g = rodzina({ ma: 'fach' });
    g.osoby[0].skills = { elek: 3 };
    g.osoby[1].skills = { med: 3 };
    const wpis = { pawns: [101, 102], zywi: [1, 2] };
    const brakWiedzy = { know: { bud: 0, cieplo: 0, elek: 0, med: 0, uprawa: 0, it: 0 } };
    const s = stan(g, { wpis, input: { cap: 20, residents: 0, ...brakWiedzy } });
    const v = eventView(s.gov, s.i)!;
    expect(v.text.pl).toContain(g.osoby[1].name);
    expect(v.text.pl).not.toContain(g.osoby[0].name);
    expect(v.text.pl).toMatch(/2 osoby|2 osób/);
    expect(v.text.en).toContain(g.osoby[1].name);
    expect(v.text.en).not.toContain(g.osoby[0].name);
    expect(v.text.en).toMatch(/\b2 people\b/);
    // do zarządu wchodzi pierwsza żywa osoba (ta, która miała fach, nie zmarły mówiący)
    expect(etykiety(s)[1]).toBe(`Przyjąć do zarządu (${g.osoby[1].first})`);
    // fach ma tylko zmarły: zarząd nie ma kogo przyjmować
    const stary = rodzina({ ma: 'fach' });
    stary.osoby[0].skills = { elek: 3 };
    expect(
      etykiety(stan(stary, { wpis, input: { cap: 20, residents: 0, ...brakWiedzy } })).some((e) =>
        e.startsWith('Przyjąć do zarządu'),
      ),
    ).toBe(false);
    // przyjęcie: wpis w kronice o żywych (2 osoby, pierwszy żywy na czele), nie o zmarłym
    wybierz(s, 'Przyjąć do spółdzielni');
    const linia = s.gov.log.find((l) => l.txt.pl.startsWith('Przyjęliście: '))!;
    expect(linia.txt.pl).toBe(`Przyjęliście: ${g.osoby[1].name} i reszta (2 osoby).`);
    expect(linia.txt.en).toBe(`You took in ${g.osoby[1].name} and the others (2 people).`);
    // wszyscy żywi (indeksy po kolei): bez przycinania, jak dotąd
    const calosc = stan(g, { input: { cap: 20, residents: 0 } });
    expect(eventView(calosc.gov, calosc.i)!.text.pl).toContain(g.osoby[0].name);
    // indeksy poza listą osób (plan ucięty do 12) odpadają, a wpis bez indeksów nie przycina
    const poza = stan(g, { wpis: { pawns: [101, 150], zywi: [1, 40] } });
    expect(eventView(poza.gov, poza.i)!.text.pl).toContain(g.osoby[1].name);
  });

  it('karta „Złapany” nazywa tę samą osobę co symulacja (pierwszą żywą), też po śmierci mówiącego', () => {
    const g = rodzina({ haczyk: 'klamie', chce: 'nocleg' });
    const s = stan(g, {
      wpis: { faza: 'zlapany', ukradl: 2, pawns: [101, 102], zywi: [1, 2] },
      karta: false,
      aktywny: { noc: true },
    });
    eventTick(s.gov, s.i, emptyEffects(), false);
    const v = eventView(s.gov, s.i)!;
    expect(v.id).toBe('zlapany');
    expect(v.text.pl).toContain(g.osoby[1].name);
    expect(v.text.pl).not.toContain(g.osoby[0].name);
    expect(v.text.en).toContain(g.osoby[1].name);
    expect(v.text.en).not.toContain(g.osoby[0].name);
    // reszta grupy: jedna osoba, więc bez zdania o reszcie
    expect(v.text.pl).toContain('Reszta grupy');
    wybierz(s, 'Oddać jedzenie');
    expect(s.gov.later.some((l) => l.line.pl.startsWith(g.osoby[1].name))).toBe(true);
    expect(s.gov.later.some((l) => l.line.pl.includes(g.osoby[0].name))).toBe(false);
  });

  it('zmarły nosiciel ugryzienia: bez oglądania rąk jako ugryzionego, bez rozkazu ugryziony i bez prośby o dobicie', () => {
    const ocaleni = () => reczny({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 1 });
    // żywy nosiciel: „Obejrzeć ręce” odsłania ugryzienie, „Wpuścić na noc” zaraża
    let g = ocaleni();
    let s = stan(g, { mode: 'zombie' });
    wybierz(s, 'Obejrzeć ręce');
    expect(tekstKarty(s)).toContain(`U ${g.osoby[1].first} pod rękawem jest świeże ugryzienie.`);
    // nosiciel zmarł (żywi 0 i 2): ręce czyste, imię zmarłego nie pada, rozkazu ugryziony nie ma
    g = ocaleni();
    const t0 = 50;
    s = stan(g, { mode: 'zombie', wpis: { pawns: [100, 102], zywi: [0, 2] } });
    expect(s.gov.trust).toBe(t0);
    wybierz(s, 'Obejrzeć ręce');
    expect(s.gov.goscie!.aktywny!.obejrzano).toBe('czysty');
    expect(tekstKarty(s)).toContain('Obejrzeliście ręce: czyste');
    expect(tekstKarty(s)).not.toContain(g.osoby[1].first);
    expect(eventView(s.gov, s.i)!.text.en).not.toContain(g.osoby[1].first);
    expect(s.gov.trust).toBe(t0 - 1);
    s = stan(g, { mode: 'zombie', wpis: { pawns: [100, 102], zywi: [0, 2] } });
    expect(rozkazy(wybierz(s, 'Wpuścić na noc'))).toEqual(['noc']);
    // mówiący zmarł, nosiciel żyje: indeks ugryzionego idzie za osobą (żywi 1 i 2, nosiciel 2 to teraz druga osoba)
    g = reczny({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 2 });
    s = stan(g, { mode: 'zombie', wpis: { pawns: [101, 102], zywi: [1, 2] } });
    wybierz(s, 'Obejrzeć ręce');
    expect(tekstKarty(s)).toContain(`U ${g.osoby[2].first} pod rękawem jest świeże ugryzienie.`);
    // ktoś z ugryzionym bliskim, który prosił o dobicie, a bliski nie żyje: zwykły wędrowiec, bez „Dobić”
    const bliski = () => reczny({ kto: 'z_ugryzionym', chce: 'dobic', haczyk: 'ugryziony', ugryziony: 1 });
    g = bliski();
    s = stan(g, { mode: 'zombie', wpis: { pawns: [100], zywi: [0] } });
    s.i.people = s.i.people.map((p, k) => (k === 0 ? { ...p, arm: 'dzida' as const } : p));
    expect(etykiety(s).some((e) => e.startsWith('Dobić'))).toBe(false);
    expect(eventView(s.gov, s.i)!.title.pl).toMatch(/^Wędrowi/);
    expect(tekstKarty(s)).not.toContain(g.osoby[1].first);
    // żywy bliski: dobicie jak dotąd
    s = stan(bliski(), { mode: 'zombie' });
    s.i.people = s.i.people.map((p, k) => (k === 0 ? { ...p, arm: 'dzida' as const } : p));
    expect(etykiety(s)[0]).toBe('Dobić przez siatkę dzidą');
  });

  it('zmarły mówiący w prawdziwej symulacji: odczyt ma żywych po indeksach, a karta nazywa następnego i liczy pionki', () => {
    const w = mockBlockM2();
    const st = createSim(w, 3, { core: 2, obcy: true });
    const sim = new Sim(w, st);
    st.tick = tickSim(2, 10);
    const o = st.obcy!;
    o.next = o.wnext = o.enext = tickSim(30, 10);
    const g = rodzina();
    applyGov(st, w, {
      ...emptyEffects(),
      gosc: { id: 'g1', osoby: g.osoby, looks: [4, 5, 6], strona: 'n' },
    });
    for (let k = 0; k < 6000 && st.goscie?.[0]?.faza !== 'brama'; k++) sim.step();
    expect(st.goscie![0].faza).toBe('brama');
    expect(govInput(st, w, 0).goscie![0]).toMatchObject({ zywi: [0, 1, 2] });
    // mówiący ginie, sim zachowuje kolejność planu
    sim.wound(st.pawns.find((p) => p.id === st.goscie![0].pawns[0])!, 1000);
    sim.step();
    const odczyt = govInput(st, w, 1000);
    expect(odczyt.goscie![0].zywi).toEqual([1, 2]);
    expect(odczyt.goscie![0].pawns).toEqual(st.goscie![0].pawns.slice(1));
    const gov = newGov(3);
    gov.goscie = { n: 1, czytane: 0, aktywny: { gosc: g, od: 0, karta: false } };
    eventTick(gov, odczyt, emptyEffects(), false);
    expect(gov.ev.active?.id).toBe('gosc');
    const v = eventView(gov, odczyt)!;
    expect(v.text.pl).toContain(g.osoby[1].name);
    expect(v.text.pl).not.toContain(g.osoby[0].name);
    expect(v.text.pl).toMatch(/2 osoby|2 osób/);
    // imię pierwszego żywego pionka to imię z karty
    const lider = st.pawns.find((p) => p.id === odczyt.goscie![0].pawns[0])!;
    expect(st.people[lider.person].name).toBe(g.osoby[1].name);
  });
});

describe('linia o nocy z gościem w porannym raporcie', () => {
  /** gość wpuszczony na noc o 19:00 trzeciego dnia, jego fazy w nocy według `wpis`; raport z nocy 3 */
  function noc(g: Gosc, wpis: (min: number) => Partial<GovGosc> & { faza: FazaGoscia }) {
    const s = stan(g);
    wybierz(s, 'Wpuścić na noc');
    s.gov.ev.active = null;
    const atr = new Atrapa(3);
    atr.supplies = 30;
    atr.woodSklad = 30;
    atr.tick = tickAt(3, 19);
    przezNoc(s.gov, atr, at(4, 7), (min) => {
      const w = wpis(min);
      const zywi = w.faza === 'poszedl' || w.faza === 'zginal' ? [] : [0];
      return [{ id: 'g1', tile: 50, gdzie: { x: 50, y: 0 }, pawns: zywi.map((k) => 100 + k), zywi, ukradl: 0, ...w }];
    });
    return s.gov.reports.find((r) => r.day === 3)!.lines.map((l) => l.pl);
  }

  it('gość spał u nas całą noc: jedna linia o nocy, bez linii o kradzieży i śmierci', () => {
    const g = reczny({ chce: 'nocleg' });
    g.osoby[0].f = true;
    const linie = noc(g, () => ({ faza: 'w_srodku' }));
    expect(linie.filter((l) => l.startsWith('Noc u was'))).toEqual([`Noc u was spędziła ${g.osoby[0].name}.`]);
    expect(linie.some((l) => /zniknęły|nie przeżył/.test(l))).toBe(false);
  });

  it('gość, który wyszedł przed 5:00, uciekł z łupem albo zginął: raport nie mówi, że spędził noc', () => {
    const wyszedl = noc(reczny({ chce: 'nocleg' }), (min) => ({ faza: min < at(4, 1) ? 'w_srodku' : 'poszedl' }));
    expect(wyszedl.some((l) => l.startsWith('Noc u was'))).toBe(false);
    const g = reczny({ chce: 'nocleg', haczyk: 'klamie' });
    const kradl = noc(g, (min) =>
      min < at(4, 2, 10) ? { faza: 'w_srodku' } : { faza: min < at(4, 3) ? 'odchodzi' : 'poszedl', ukradl: 3 },
    );
    expect(kradl.some((l) => l.startsWith('Noc u was'))).toBe(false);
    expect(kradl.filter((l) => l.includes('zniknęły 3 porcje')).length).toBe(1);
    // zginął w nocy: wpis o śmierci w raporcie, bez „spędził noc”
    const m = reczny({ chce: 'nocleg' });
    m.osoby[0].f = false;
    const zginal = noc(m, (min) => ({ faza: min < at(4, 3) ? 'w_srodku' : 'zginal' }));
    expect(zginal.some((l) => l.startsWith('Noc u was'))).toBe(false);
    expect(zginal).toContain(`${m.osoby[0].name} nie przeżył nocy u was.`);
  });

  it('linia o śmierci gościa idzie do raportu tylko, gdy noc trwa (20:00–6:00): kto wyszedł rano i zginął za dnia, nie wraca do raportu', () => {
    // zadanie 11, poprawka z przeglądu zadania 10: warunek miał brzmieć „od 20:00 do 6:00”, a nie „nie rano 6–8”
    const zgon = (hour: number, day = 4): string[] => {
      const s = stan(reczny({ chce: 'nocleg' }));
      wybierz(s, 'Wpuścić na noc');
      s.gov.ev.active = null;
      // rano wychodzi (6–8), potem ginie o danej godzinie
      eventTick(s.gov, zFaza(s, 'odchodzi', {}, { day: 4, hour: 7, minute: 10 }), emptyEffects(), false);
      eventTick(
        s.gov,
        zFaza(s, 'zginal', {}, { day, hour, minute: 10, screen: s.i.screen + 50 }),
        emptyEffects(),
        false,
      );
      // wpis do kroniki jest zawsze, do raportu tylko w nocy
      expect(
        s.gov.log.some((l) => l.txt.pl.includes('nie przeżył nocy u was')),
        `godzina ${hour}`,
      ).toBe(true);
      return s.gov.later.filter((l) => l.line.pl.includes('nie przeżył nocy u was')).map((l) => l.line.pl);
    };
    for (const hour of [6, 7, 8, 12, 15, 19]) expect(zgon(hour), `godzina ${hour}`).toEqual([]);
    for (const hour of [20, 22, 23]) expect(zgon(hour), `godzina ${hour}`).toHaveLength(1);
    expect(zgon(3, 5)).toHaveLength(1);
  });

  it('linia o nocy tylko raz i tylko o 5:00: nie od razu po wyborze, nie w dzień i nie dla odprawionego', () => {
    const s = stan(reczny({ chce: 'nocleg' }));
    wybierz(s, 'Wpuścić na noc');
    for (const hour of [6, 7, 12, 22, 3]) {
      eventTick(s.gov, zFaza(s, 'w_srodku', {}, { day: 4, hour, minute: 10 }), emptyEffects(), false);
      expect(s.gov.later, `godzina ${hour}`).toHaveLength(0);
    }
    oPiatej(s);
    oPiatej(s);
    expect(s.gov.later.filter((l) => l.line.pl.startsWith('Noc u was'))).toHaveLength(1);
    const o = stan(reczny({ chce: 'nocleg' }));
    wybierz(o, 'Odprawić');
    oPiatej(o);
    expect(o.gov.later).toHaveLength(0);
  });
});

describe('zapis i wczytanie', () => {
  it('zapis i wczytanie z otwartą kartą gościa: ta sama karta', () => {
    const s = stan(reczny({ kto: 'rodzina', ilu: 3, chce: 'dolaczyc', ma: 'rzecz', rzecz: { meds: 2 } }), {
      input: { cap: 10, residents: 8 },
    });
    const przed = eventView(s.gov, s.i)!;
    const wczytany = loadGov(saveGov(s.gov));
    const po = eventView(wczytany, s.i)!;
    expect(JSON.stringify(po)).toBe(JSON.stringify(przed));
    expect(wczytany.goscie).toEqual(s.gov.goscie);
    expect(pending(wczytany, s.i)).toEqual(pending(s.gov, s.i));
    // ta sama decyzja daje te same skutki i ten sam stan
    const a = chooseEvent(s.gov, s.i, 0);
    const b = chooseEvent(wczytany, s.i, 0);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(saveGov(wczytany)).toBe(saveGov(s.gov));
    // zapis w połowie wizyty (po rozkazie `noc`) niczego nie gubi
    const noc = stan(reczny({ chce: 'nocleg', haczyk: 'klamie' }));
    wybierz(noc, 'Wpuścić na noc');
    const w2 = loadGov(saveGov(noc.gov));
    expect(w2.goscie?.aktywny).toMatchObject({ noc: true, karta: true });
    eventTick(w2, zFaza(noc, 'odchodzi', { ukradl: 2 }), emptyEffects(), false);
    eventTick(noc.gov, zFaza(noc, 'odchodzi', { ukradl: 2 }), emptyEffects(), false);
    expect(saveGov(w2)).toBe(saveGov(noc.gov));
  });

  it('stary zapis bez gości i teksty ze starego zapisu: wczytuje się, a „skąd” dostaje oba języki', () => {
    const s = stan(null);
    const stary = JSON.parse(saveGov(s.gov)) as GovState;
    expect('goscie' in stary).toBe(false);
    expect('wskazowki' in stary).toBe(false);
    const gov = loadGov(JSON.stringify(stary));
    expect(def('gosc').w(makeHost(gov, s.i, emptyEffects()))).toBeGreaterThan(0);
    // zapis z polskim napisem w `skad.nazwa` (nigdy tak nie powstaje, ale normalizacja ma go przyjąć)
    const g = reczny();
    (g.skad as { nazwa: unknown }).nazwa = 'z północy';
    const t = stan(g);
    const przerobiony = normalizujTeksty(JSON.parse(saveGov(t.gov)) as GovState);
    expect(przerobiony.goscie!.aktywny!.gosc.skad.nazwa).toEqual({ pl: 'z północy', en: 'z północy' });
  });
});

describe('język i teksty kart', () => {
  it('angielski bez polskich słów: tytuł, tekst, wybory, wpisy w kronice i linie na rano, oba tryby, wszyscy goście', () => {
    let wpisy = 0;
    for (const mode of ['zwykly', 'zombie'] as const) {
      for (let seed = 1; seed <= 150; seed++) {
        const base = stan(null, { mode, seed });
        const ctx: KontekstGoscia = {
          mode,
          pora: 'wieczor',
          season: seed % 4,
          zapasy: 10,
          okolica: [{ klucz: 'poi:300:0', kat: 'apteka', x: 300, y: 0, odl: 300, nazwa: 'Pod Różą' }],
          znane: new Set(),
          napady: 0,
          dom: false,
        };
        const g = skladGoscia(mulberry(seed), 1, ctx, new Set());
        const imiona = [
          ...g.osoby.flatMap((p) => [p.name, p.first]),
          ...base.i.people.flatMap((p) => [p.name, p.first]),
          'Pod Różą',
          ...SLOWNIK_MIEJSC,
        ];
        const prefixy = ['Wpuścić', 'Podać', 'Dać', 'Przyst', 'Przyjąć', 'Wysłuchać', 'Dobić', 'Obejrzeć', 'Odprawić'];
        for (const prefix of prefixy) {
          const s = stan(g, { mode, seed, input: { okolica: base.i.okolica, cap: 6, residents: 5 } });
          s.i.people = s.i.people.map((p, k) => (k === 0 ? { ...p, arm: 'dzida' as const } : p));
          const v = eventView(s.gov, s.i)!;
          const k = v.choices.findIndex((c) => c.label.pl.startsWith(prefix));
          const teksty = [v.title.en, v.text.en, ...v.choices.map((c) => c.label.en)];
          if (k >= 0 && v.choices[k].ok) {
            const dlugosc = s.gov.log.length;
            const fx = chooseEvent(s.gov, s.i, k);
            oPiatej(s);
            teksty.push(
              ...s.gov.log.slice(dlugosc).map((l) => l.txt.en),
              ...s.gov.later.map((l) => l.line.en),
              ...fx.log.map((l) => l.en),
            );
            // po obejrzeniu rąk karta zostaje: tekst z opisem
            if (s.gov.ev.active) teksty.push(eventView(s.gov, s.i)!.text.en);
          }
          for (const t of teksty) {
            wpisy++;
            expect(polskieSlowa(t, imiona), `${g.kto}/${g.chce}/${g.ma}/${g.haczyk} ${prefix}: ${t}`).toEqual([]);
          }
        }
      }
    }
    expect(wpisy).toBeGreaterThan(5000);
    // karta „Złapany” w obu rodzajach i liczbach
    for (const [kto, ilu] of [
      ['wedrowiec', 1],
      ['rodzina', 3],
    ] as const)
      for (const f of [true, false]) {
        const g = reczny({ kto, ilu, haczyk: 'klamie' });
        g.osoby[0].f = f;
        const s = stan(g, { wpis: { faza: 'zlapany', ukradl: 2 }, karta: false, aktywny: { noc: true } });
        eventTick(s.gov, s.i, emptyEffects(), false);
        const v = eventView(s.gov, s.i)!;
        for (const t of [v.title.en, v.text.en, ...v.choices.map((c) => c.label.en)])
          expect(polskieSlowa(t, [g.osoby[0].name]), t).toEqual([]);
        for (let k = 0; k < 3; k++) {
          const t = stan(g, { wpis: { faza: 'zlapany', ukradl: 2 }, karta: false, aktywny: { noc: true } });
          eventTick(t.gov, t.i, emptyEffects(), false);
          const dl = t.gov.log.length;
          chooseEvent(t.gov, t.i, k);
          for (const l of [...t.gov.log.slice(dl), ...t.gov.later.map((x) => ({ txt: x.line }))])
            expect(polskieSlowa(l.txt.en, [g.osoby[0].name, ...t.i.people.map((p) => p.name)]), l.txt.en).toEqual([]);
        }
      }
    ustawJezyk('pl');
  });

  it('polskie zdania odmieniają się zgodnie z płcią i liczbą (przyjęcie, nagroda, złapany)', () => {
    const on = reczny({ kto: 'wedrowiec', chce: 'dolaczyc' });
    on.osoby[0].f = false;
    const ona = reczny({ kto: 'wedrowiec', chce: 'dolaczyc' });
    ona.osoby[0].f = true;
    for (const [g, o] of [
      [on, 'Wpuścić na noc'],
      [ona, 'Wpuścić na noc'],
    ] as const) {
      const s = stan(g);
      wybierz(s, o);
      oPiatej(s);
      expect(s.gov.later[0].line.pl).toBe(`Noc u was ${g.osoby[0].f ? 'spędziła' : 'spędził'} ${g.osoby[0].name}.`);
    }
    const s = stan(reczny({ kto: 'rodzina', ilu: 4, chce: 'dolaczyc' }), { input: { cap: 9, residents: 8 } });
    wybierz(s, 'Wpuścić na noc');
    oPiatej(s);
    expect(s.gov.later[0].line.pl).toMatch(/^Noc u was spędzili goście: .+ i reszta \(4 osoby\)\.$/);
    expect(s.gov.later[0].line.en).toMatch(/and the others \(4 people\) spent the night with you\.$/);
  });
});

// ---------------------------------------------------------------- gry z prawdziwą symulacją

const DEMO = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));

interface Gra {
  w: World;
  st: SimState;
  sim: Sim;
  gov: GovState;
}

/** Przymorze z mieszkańcami z generatora, obcy włączeni (jak w przeglądarce), zarząd co sekundę przy ekranie, okna
    odpowiadane losowym dostępnym wyborem (karta nocy zatwierdzona, raport przeczytany, uchwała odłożona). `przy` woła się
    co sekundę po oknach, a `naKarcie` dostaje każde okno wydarzenia przed odpowiedzią; oba mogą podmienić stan gry
    (zapis i wczytanie). Zwraca grę po `dni` dobach od 15:00 pierwszego dnia. */
async function graj(
  seed: number,
  dni: number,
  hooki: {
    naKarcie?: (p: Extract<Prompt, { k: 'wydarzenie' }>, i: GovInput, g: Gra) => Gra | undefined;
    przy?: (g: Gra) => Gra | undefined;
  } = {},
): Promise<Gra> {
  const { world: w, mieszkancy } = await swiatMieszkancow(DEMO, seed, 4);
  const st0 = createSim(w, seed, { core: 4, obcy: true, mieszkancy });
  let g: Gra = { w, st: st0, sim: new Sim(w, st0), gov: newGov(seed) };
  const r = mulberry(seed ^ 0x5c1f);
  while (g.st.tick < dni * 24 * 800) {
    g.sim.step();
    if (g.st.tick % TPS) continue;
    const sek = g.st.tick / TPS;
    applyGov(g.st, w, govUpdate(g.gov, govInput(g.st, w, sek)));
    for (let k = 0; k < 6; k++) {
      let i = govInput(g.st, w, sek);
      const p = pending(g.gov, i);
      if (!p) break;
      if (p.k === 'wydarzenie') {
        // hak może podmienić grę (zapis i wczytanie przy otwartej karcie): odpowiedź idzie już do wczytanej
        const zam = hooki.naKarcie?.(p, i, g);
        if (zam) {
          g = zam;
          i = govInput(g.st, w, sek);
        }
        const ok = p.choices.map((c, j) => [c, j] as const).filter(([c]) => c.ok);
        applyGov(g.st, w, chooseEvent(g.gov, i, ok[Math.floor(r() * ok.length)][1]));
      } else if (p.k === 'karta') applyGov(g.st, w, confirmNight(g.gov, i));
      else if (p.k === 'raport') g.gov.report = null;
      else if (p.k === 'uchwala') g.gov.lawPending = false;
      else break;
    }
    g = hooki.przy?.(g) ?? g;
  }
  return g;
}

describe('spis gier z obcymi', () => {
  it('spis 5 gier po 5 dób z obcymi: każda karta gosc ma pionek gosc w fazie brama w chwili pokazania', async () => {
    const DNI = 5;
    const GRY = [11, 12, 13, 14, 15];
    const razem = { karty: 0, gosc: 0, zlapany: 0, wizyt: 0, pelneGrupy: 0, martwiNaKarcie: 0 };
    const wypisz: string[] = [];
    for (const seed of GRY) {
      const na = { karty: 0, gosc: 0, zlapany: 0 };
      const gra = await graj(seed, DNI, {
        naKarcie: (p, i, g) => {
          na.karty++;
          if (p.id !== 'gosc' && p.id !== 'zlapany') return;
          const aktywny = g.gov.goscie!.aktywny!;
          const wpis = i.goscie!.find((x) => x.id === aktywny.gosc.id)!;
          expect(wpis, `${seed}: wpis wizyty`).toBeTruthy();
          expect(wpis.faza, `${seed}: ${p.id}`).toBe(p.id === 'gosc' ? 'brama' : 'zlapany');
          // pionki gościa naprawdę stoją na mapie, na kafelku z karty, tylu, ilu mówi karta
          const pionki = g.st.pawns.filter((q) => q.kind === 'gosc' && wpis.pawns.includes(q.id));
          expect(pionki.length, `${seed}: pionki`).toBe(wpis.pawns.length);
          expect(pionki.length).toBeGreaterThan(0);
          expect(p.gdzie).toEqual(wpis.gdzie);
          expect(pionki.some((q) => Math.floor(q.y) * g.w.size + Math.floor(q.x) === wpis.tile)).toBe(true);
          expect(pionki.length).toBeLessThanOrEqual(aktywny.gosc.osoby.length);
          if (pionki.length === aktywny.gosc.osoby.length) razem.pelneGrupy++;
          // karta mówi o żywych: indeksy `zywi` zgadzają się z osobami pionków (imiona z `st.people`), a zmarłych w karcie nie ma
          const zywe = wpis.zywi.map((k) => aktywny.gosc.osoby[k]);
          expect(
            wpis.pawns.map((id) => g.st.people[g.st.pawns.find((q) => q.id === id)!.person].name),
            `${seed}: imiona żywych`,
          ).toEqual(zywe.map((o) => o.name));
          const martwi = aktywny.gosc.osoby.filter((_, k) => !wpis.zywi.includes(k));
          for (const o of martwi)
            for (const t of [p.title.pl, p.text.pl, ...p.choices.map((c) => c.label.pl)])
              expect(t, `${seed}: zmarły ${o.name} na karcie`).not.toContain(o.first);
          razem.martwiNaKarcie += martwi.length;
          // liczba osób w tekście grupy to liczba pionków
          if (p.id === 'gosc' && (aktywny.gosc.kto === 'rodzina' || aktywny.gosc.kto === 'ocaleni'))
            expect(p.text.pl, `${seed}: ${aktywny.gosc.kto}`).toMatch(new RegExp(`\\b${pionki.length}\\b`));
          na[p.id]++;
        },
      });
      razem.karty += na.karty;
      razem.gosc += na.gosc;
      razem.zlapany += na.zlapany;
      razem.wizyt += gra.gov.goscie?.n ?? 0;
      wypisz.push(
        `gra ${seed}: kart ${na.karty}, gosc ${na.gosc}, złapany ${na.zlapany}, wizyt ${gra.gov.goscie?.n ?? 0}`,
      );
    }
    // pomiar do raportu (vitest pokazuje go przy --reporter=verbose)
    console.info(`spis gier: ${wypisz.join(' | ')}; razem kart ${razem.karty}, kart gosc ${razem.gosc}`);
    // goście naprawdę przychodzą, a każda ich karta miała pionki
    expect(razem.gosc).toBeGreaterThanOrEqual(10);
    // wizyt co najmniej tyle, ile kart (reszta: nie doszli, odeszli sami, wizyta w toku po piątej dobie)
    expect(razem.wizyt).toBeGreaterThanOrEqual(razem.gosc);
    // spis ma sens: około 35 kart na grę, karty gościa to nie wszystko
    expect(razem.karty / GRY.length).toBeGreaterThan(30);
    expect(razem.karty / GRY.length).toBeLessThan(45);
    expect(razem.gosc).toBeLessThan(razem.karty / 2);
  }, 600_000);

  // Tak samo jak test gęstości decyzji z zarzad.test.ts (≥ 8 z 9 minut od drugiej do dziesiątej), ale na prawdziwej symulacji
  // z obcymi, jak w przeglądarce. Dwie konfiguracje: łańcuchy włączone (gra, jaka wychodzi do graczy: wątki sezonu z ziarna
  // zarządu) i wyłączone (`?lancuchy=0`, stan sprzed łańcuchów). Przed zmianą (wylosowany gość zjadał odstęp, a plan nie był
  // kartą) 23 z 30 gier miało co najmniej 8 pokrytych minut; bez gości (BASE 3c23992) wszystkie 10 pierwszych ziaren i 26 z 30 miało
  // wszystkie 9. Na dwudziestu ziarnach każda gra ma co najmniej 8 minut w obu konfiguracjach, a wszystkie 9: z łańcuchami 17
  // z 20, bez nich 20 z 20 (pula nocy pierwszej doby jest w ostatniej godzinie na styk: ulewa i przymrozek zależą od pogody, a wybór
  // wątków przesuwa losowanie zarządu). Dziesięć ziaren przy progu 9 z 10 było za małą próbką na takie przesunięcie. Pierwsza noc nie
  // dostaje satyry ani listu z 2026 tylko po to, żeby ta ostatnia minuta była pełna (decyzja Mateusza, 17.10.2026).
  for (const { lancuchy, dziewiecMin } of [
    { lancuchy: true, dziewiecMin: 16 },
    { lancuchy: false, dziewiecMin: 20 },
  ]) {
    it(`tempo na początku gry z obcymi (łańcuchy ${lancuchy ? 'włączone' : 'wyłączone'}): decyzja w prawie każdej z pierwszych dziesięciu minut (prawdziwa symulacja, wylosowany gość nie zjada odstępu)`, async () => {
      let osiem = 0;
      let dziewiec = 0;
      let wizyt = 0;
      const wypisz: string[] = [];
      const ziarna = 20;
      for (let seed = 1; seed <= ziarna; seed++) {
        const { world: w, mieszkancy } = await swiatMieszkancow(DEMO, seed, 4);
        const r = playWithGov(w, seed, 'zawsze-warta', 1, 4, { obcy: true, mieszkancy, lancuchy });
        const d = r.gov.decisions.map((x) => x.s).filter((x) => x <= 600);
        const pokryte = Array.from({ length: 9 }, (_, m) =>
          d.some((x) => x >= (m + 1) * 60 && x < (m + 2) * 60),
        ).filter(Boolean).length;
        if (pokryte >= 8) osiem++;
        if (pokryte === 9) dziewiec++;
        wizyt += r.gov.goscie?.n ?? 0;
        wypisz.push(`${seed}:${pokryte}`);
      }
      console.info(
        `tempo (łańcuchy ${lancuchy}): minut z decyzją na ziarno ${wypisz.join(' ')}; >=8: ${osiem}/${ziarna}, 9: ${dziewiec}/${ziarna}, wizyt ${wizyt}`,
      );
      // goście naprawdę wchodzą do puli w tych grach
      expect(wizyt).toBeGreaterThanOrEqual(10);
      expect(osiem).toBe(ziarna);
      expect(dziewiec).toBeGreaterThanOrEqual(dziewiecMin);
    }, 600_000);
  }

  it('ten sam przebieg po drugim razie, a zapis i wczytanie w połowie wizyty nie zmieniają go: gość idzie, stoi pod bramą z otwartą kartą, śpi u nas', async () => {
    const przeladuj = (g: Gra): Gra => {
      const st = JSON.parse(JSON.stringify(g.st)) as SimState;
      return { w: g.w, st, sim: new Sim(g.w, st), gov: loadGov(saveGov(g.gov)) };
    };
    /** faza wizyty, którą prowadzi zarząd, w symulacji */
    const faza = (g: Gra) => g.st.goscie?.find((x) => x.id === g.gov.goscie?.aktywny?.gosc.id)?.faza;
    const odczyt = (g: Gra) => ({ hash: g.sim.hash(), gov: saveGov(g.gov), goscie: JSON.stringify(g.st.goscie) });
    for (const seed of [21, 22]) {
      const a = odczyt(await graj(seed, 4));
      const b = odczyt(await graj(seed, 4));
      expect(b, `ziarno ${seed}: drugi przebieg`).toEqual(a);
      expect(a.goscie, `ziarno ${seed}: byli goście`).toBeTruthy();
      // trzy chwile wizyty, po dwa zapisy każda: gość jeszcze idzie ulicą, karta pod bramą jest otwarta, gość śpi u nas
      const sceny: Record<
        string,
        { naKarcie?: (p: { id: string }, i: GovInput, g: Gra) => Gra | undefined; przy?: (g: Gra) => Gra | undefined }
      > = {
        idzie: { przy: (g) => (faza(g) === 'idzie' && !g.gov.goscie!.aktywny!.karta ? przeladuj(g) : undefined) },
        karta: { naKarcie: (p, _i, g) => (p.id === 'gosc' ? przeladuj(g) : undefined) },
        noc: { przy: (g) => (g.gov.goscie?.aktywny?.noc && faza(g) === 'w_srodku' ? przeladuj(g) : undefined) },
      };
      for (const [nazwa, hak] of Object.entries(sceny)) {
        let wczytan = 0;
        const c = odczyt(
          await graj(seed, 4, {
            naKarcie: hak.naKarcie
              ? (p, i, g) => {
                  const zam = wczytan < 2 ? hak.naKarcie!(p, i, g) : undefined;
                  if (zam) wczytan++;
                  return zam;
                }
              : undefined,
            przy: hak.przy
              ? (g) => {
                  // co 7. sekunda przy ekranie, najwyżej dwa razy w grze
                  if (wczytan >= 2 || (g.st.tick / TPS) % 7 !== 0) return undefined;
                  const zam = hak.przy!(g);
                  if (zam) wczytan++;
                  return zam;
                }
              : undefined,
          }),
        );
        expect(wczytan, `ziarno ${seed}, ${nazwa}: zapisów`).toBeGreaterThan(0);
        expect(c, `ziarno ${seed}, ${nazwa}: po zapisie`).toEqual(a);
      }
    }
  }, 600_000);
});

// ---------------------------------------------------------------- znajomy zmarły: mówiący zginął, reszta grupy żyje

describe('znajomy, który zginął, choć reszta jego grupy przeżyła, nie wraca', () => {
  /** Rodzina trzech osób wpuszczona na noc, a potem wizyta kończy się w fazie `faza` z żywymi `zywi` (indeksy w planie). */
  function nocPotemKoniec(zywi: number[], faza: FazaGoscia = 'poszedl', przedNoca?: number[]) {
    const g = reczny({ kto: 'rodzina', ilu: 3 });
    const s = stan(g, przedNoca ? { wpis: { zywi: przedNoca, pawns: przedNoca.map((k) => 100 + k) } } : {});
    wybierz(s, 'Wpuścić na noc');
    expect(s.gov.znajomi).toHaveLength(1);
    // rano wizyta kończy się: symulacja zostawia przy życiu tylko wskazane osoby
    eventTick(s.gov, zFaza(s, faza, { zywi, pawns: zywi.map((k) => 100 + k) }, { hour: 8 }), emptyEffects(), false);
    return s;
  }

  it('mówiący zginął w nocy, dwoje innych dożyło poranka: wpis jest zmarły, a powrót go pomija', () => {
    const s = nocPotemKoniec([1, 2]);
    const z = s.gov.znajomi![0];
    expect(z.zmarl).toBe(true);
    // choćby nastawienie było dodatnie, a ostatnie spotkanie dawne, zmarły nie wraca
    expect(z.nastawienie).toBeGreaterThan(0);
    expect(doPowrotu(s.gov, 9, 'zwykly', obecniWOsiedlu(s.i))).toBeNull();
  });

  it('wszyscy dożyli poranka: znajomy żyje i może wrócić', () => {
    const s = nocPotemKoniec([0, 1, 2]);
    const z = s.gov.znajomi![0];
    expect(z.zmarl).toBeUndefined();
    expect(doPowrotu(s.gov, 9, 'zwykly', obecniWOsiedlu(s.i))?.id).toBe(z.id);
  });

  it('zginęła cała grupa: jak dotąd zmarły', () => {
    const s = nocPotemKoniec([], 'zginal');
    expect(s.gov.znajomi![0].zmarl).toBe(true);
  });

  it('mówiący zginął jeszcze przed decyzją: wpis dotyczy pierwszej żywej osoby, a ta dożyła poranka', () => {
    // przy decyzji żyją tylko osoby 1 i 2; wpis jest o osobie 1 (nie o zmarłej 0), więc jej dalsze życie rozstrzyga o wpisie
    const s = nocPotemKoniec([1, 2], 'poszedl', [1, 2]);
    const z = s.gov.znajomi![0];
    expect(z.zmarl).toBeUndefined();
    expect(s.gov.goscie?.aktywny).toBeUndefined();
  });

  it('zginął ten, o którym wpis, choć tamci dożyli: zmarły; zginął ktoś inny: żyje', () => {
    // wpis o osobie 1 (osoba 0 zginęła przed decyzją); potem ginie osoba 1, zostaje 2
    const s = nocPotemKoniec([2], 'poszedl', [1, 2]);
    expect(s.gov.znajomi![0].zmarl).toBe(true);
    // wpis o osobie 0; ginie osoba 2, żyją 0 i 1
    expect(nocPotemKoniec([0, 1]).gov.znajomi![0].zmarl).toBeUndefined();
  });
});
