/* Wiki, kategoria „Wydarzenia” (src/ui/wiki-wydarzenia.ts): pokrycie (artykuły, każdy rodzaj gościa, prośba, odpowiedź na karcie,
   haczyk, zdarzenie pamięci o znajomych i oferta handlarza), fakty równe tabelom i funkcjom gry (tempo kart na próbie ziaren
   zarządu, waga i czasy gościa, udział rodzajów, tabela ofert i terminy handlarza z prawdziwej symulacji, cena napaści,
   terminy wędrowców i ekip, szansa zaproszenia, ciągi z `LANCUCHY`, nastawienia i powroty znajomych), napisy odpowiedzi
   porównane z prawdziwą kartą gościa w obu językach i obu miejscach, zachowania, na których stoją zdania (zaufanie i wkurzenie
   po odpowiedziach, brama na kłódkę, haczyki, karta „Złapany”, pora dnia w prośbach), uwaga o trybie zombie, język angielski,
   wariant domu i odnośniki. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import {
  BAZA_HACZYK,
  BAZA_KTO,
  type ChceId,
  type Gosc,
  type HaczykId,
  haczykiMozliwe,
  type KontekstGoscia,
  KTO,
  type KtoId,
  osobyGrupy,
  PROG_FACHU,
  skladGoscia,
  wagaGoscia,
} from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import { raidChance } from '../../src/gov/noc.ts';
import type { GameMode, GovEffects, GovGosc, GovInput, GovState } from '../../src/gov/typy.ts';
import { LANCUCHY, SZANSA_KROKU, WATKOW, wybierzWatki } from '../../src/gov/watki.ts';
import { CENA, wiesci } from '../../src/gov/wiesci.ts';
import { GOSC_GAP, HALAS_PROMIEN, MIN_WAGA_GOSCIA, WAGA_GOSCIA } from '../../src/gov/wizyta.ts';
import { decision, emptyEffects, QUIET } from '../../src/gov/wspolne.ts';
import {
  CALM_END,
  eventTick,
  eventView,
  firstNight,
  GAP_PO,
  GAP_ROZRZUT,
  nextGap,
  POGRZEB_DO,
  POGRZEB_ODSTEP,
  WARM_KITCHEN,
} from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import {
  doPowrotu,
  NASTAWIENIE,
  NIKOGO,
  ODMOWA,
  POWROT_ODSTEP_DNI,
  POWROT_WIEK_DNI,
  WAGA_POWROTU,
  wrogDoNapadu,
  ZAPAS_ODMOWY,
  zapamietaj,
} from '../../src/gov/znajomi.ts';
import { dayOf, minutesAt, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { GOSC_CZEKA, GOSC_DOJSCIE, GOSC_LUP, GOSC_ZASIEG, GOSC_ZLAPANY_DO, ranoGoscia } from '../../src/sim/gosc.ts';
import {
  BUYS_SCRAP,
  firstVisit,
  HAGGLE_TICKS,
  NAPISY as HANDEL,
  KILL_DELAY_DAYS,
  LEAVE_HOUR,
  nextVisit,
  nextVisitZombie,
  OFFER_TIMES,
  OTHER,
  priced,
  REVENGE_CHANCE,
  ROB_MOOD,
  ROB_MOOD_OTHERS,
  rollOffers,
  SLAWA_DAYS,
  SLAWA_EXTRA_DAYS,
  SLAWA_MAX,
  TRADER_FLEE,
  TRADER_HP,
  TRADER_NOSHOW,
  tickAt,
  WAIT_TICKS,
  WAIT_ZOMBIE,
  ZBIR_FLEE,
  ZBIR_HP,
  ZBIR_LEAVE_HOUR,
  ZBIR_STAY,
  ZOMBIE_DELAY,
  ZOMBIE_SCARE_ARRIVE,
  ZOMBIE_SCARE_WAIT,
} from '../../src/sim/handlarz.ts';
import { ZARZAD_MAX } from '../../src/sim/praca.ts';
import { createSim, okazjaWerbunku } from '../../src/sim/sim.ts';
import {
  CREW_SEARCH_TICKS,
  MUG_MOOD,
  MUG_MOOD_OTHERS,
  mugLoot,
  NAPAD_PAMIEC,
  NOWY_MOOD,
  NOWY_MOOD_TICKS,
  nextCrew,
  nextCrewZombie,
  nextWanderer,
  nextWandererZombie,
  NAPISY as OBCY,
  PAUSE_MAX,
  PAUSE_MIN,
  PO_ROZMOWIE,
  RADY,
  SHOO_REACH,
  szansaWerbunku,
  TALK_MOOD,
  TALK_MOOD_TICKS,
  TALK_TICKS,
  ZAPROS_TICKS,
} from '../../src/sim/wedrowcy.ts';
import { deg, num, signed } from '../../src/ui/tekst.ts';
import { artykul, maArtykul, rejestr, szukaj } from '../../src/ui/wiki.ts';
import { czasTickow, proc } from '../../src/ui/wiki-slowa.ts';
import {
  etykietaWyboru,
  NAZWA_CHCE,
  ODPOWIEDZ_NA,
  PROSBY,
  tytulKarty,
  udzial,
  WYBORY_IDS,
} from '../../src/ui/wiki-wydarzenia.ts';
import { Atrapa, at, TPH } from './gov-atrapa.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';
import { kontrolaOdnosnikow, kontrolaTresci } from './wiki-kontrola.ts';
import { kontekst, miejsce, PRZYPADKI, tekstArtykulu, type Wariant } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const moje = rejestr().filter((d) => d.kat === 'wydarzenia');
const NB = ' ';
const KTOS = Object.keys(KTO) as KtoId[];
const HACZYKI: HaczykId[] = ['prawda', 'klamie', 'chory', 'poscig', 'ugryziony'];

const art = (id: string, zombie = false, wariant: Wariant = 'blok') => artykul(id, kontekst(wariant, false, zombie))!;
/** wartość faktu artykułu w bieżącym języku */
const fakt = (id: string, f: string, zombie = false, wariant: Wariant = 'blok'): string | undefined =>
  art(id, zombie, wariant).fakty.find((x) => x.id === f)?.v;

/** etykieta faktu artykułu w bieżącym języku */
const faktK = (id: string, f: string, zombie = false, wariant: Wariant = 'blok'): string | undefined =>
  art(id, zombie, wariant).fakty.find((x) => x.id === f)?.k;

/** zakres min–max wartości funkcji na ziarnach 1…n */
function zakres(f: (s: number) => number, n = 2500): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let s = 1; s <= n; s++) {
    const v = f(s);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

/** godzina doby z ułamkiem dla ticka */
const godz = (tick: number): number => (minutesAt(tick) % 1440) / 60;

// ---------------------------------------------------------------- pokrycie

describe('pokrycie', () => {
  it('artykuły kategorii', () => {
    expect(moje.map((d) => d.id).sort()).toEqual(
      [
        'wydarzenia:karty',
        'wydarzenia:goscie',
        'wydarzenia:rodzaje',
        'wydarzenia:prosby',
        'wydarzenia:wybory',
        'wydarzenia:haczyk',
        'wydarzenia:zlapany',
        'wydarzenia:handlarz',
        'wydarzenia:napasc',
        'wydarzenia:wedrowcy',
        'wydarzenia:werbunek',
        'wydarzenia:lancuchy',
        'wydarzenia:znajomi',
      ].sort(),
    );
    expect(maArtykul('wydarzenia:handlarz')).toBe(true);
  });

  it('każdy rodzaj gościa, prośba, odpowiedź, haczyk i zdarzenie pamięci ma wiersz w faktach', () => {
    const ids = (id: string) => art(id).fakty.map((f) => f.id);
    expect(ids('wydarzenia:rodzaje')).toEqual(KTOS.map((k) => `kto-${k}`));
    expect(ids('wydarzenia:wybory')).toEqual(WYBORY_IDS.map((w) => `wybor-${w}`));
    expect(ids('wydarzenia:haczyk')).toEqual(HACZYKI.map((h) => `haczyk-${h}`));
    expect(ids('wydarzenia:prosby').filter((x) => x.startsWith('chce-'))).toEqual(PROSBY.map((p) => `chce-${p}`));
    expect(ids('wydarzenia:znajomi').filter((x) => x.startsWith('nastawienie-'))).toEqual(
      Object.keys(NASTAWIENIE).map((j) => `nastawienie-${j}`),
    );
  });

  it('prośby to dokładnie te, o które proszą rodzaje gości z tabeli gry', () => {
    const zTabeli = new Set<ChceId>(KTOS.flatMap((k) => KTO[k].chce));
    expect([...PROSBY].sort()).toEqual([...zTabeli].sort());
    expect(Object.keys(NAZWA_CHCE).sort()).toEqual([...zTabeli].sort());
    expect(Object.keys(ODPOWIEDZ_NA).sort()).toEqual([...zTabeli].sort());
  });

  it('wszystkie oferty z tabeli handlarza są w artykule, w napisach z gry', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const zlom = fakt('wydarzenia:handlarz', 'kupuje-zlom')!;
      const reszta = fakt('wydarzenia:handlarz', 'reszta')!;
      for (const [take, give] of BUYS_SCRAP) {
        const n = HANDEL.oferta({ give, take, left: OFFER_TIMES });
        expect(zlom, lang).toContain(lang === 'pl' ? n.pl : n.en);
      }
      for (const [take, give] of OTHER) {
        const n = HANDEL.oferta({ give, take, left: OFFER_TIMES });
        expect(reszta, lang).toContain(lang === 'pl' ? n.pl : n.en);
      }
    }
  });
});

// ---------------------------------------------------------------- fakty zgodne z tabelami gry

describe('karty wydarzeń: tempo i cisza', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`odstępy z funkcji gry na tysiącach ziaren: ${lang}`, () => {
      ustawJezyk(lang);
      const pierwsza = zakres((s) => newGov(s).ev.next);
      const wczesny = zakres((s) => nextGap(newGov(s), 0));
      const pozniej = zakres((s) => nextGap(newGov(s), 600));
      expect(pierwsza).toEqual([70, 80]);
      expect(wczesny).toEqual([38, 56]);
      expect(pozniej).toEqual([GAP_PO, GAP_PO + GAP_ROZRZUT - 1]);
      expect(fakt('wydarzenia:karty', 'pierwsza')).toBe(`70–80${NB}s`);
      expect(fakt('wydarzenia:karty', 'wczesny')).toBe(`38–56${NB}s`);
      expect(fakt('wydarzenia:karty', 'pozniej')).toBe(`${GAP_PO}–${GAP_PO + GAP_ROZRZUT - 1}${NB}s`);
      expect(fakt('wydarzenia:karty', 'po-decyzji')).toBe(`${QUIET}${NB}s`);
      expect(fakt('wydarzenia:karty', 'cisza')).toContain(deg(WARM_KITCHEN));
      expect(fakt('wydarzenia:karty', 'cisza')).toContain(`${CALM_END}:00`);
      expect(fakt('wydarzenia:karty', 'pogrzeb')).toContain(`15${NB}s`);
      expect(POGRZEB_ODSTEP).toBe(15);
      expect(POGRZEB_DO).toBe(2 * 1440);
    });

  it('pierwsza noc kończy się o ósmej rano drugiego dnia', () => {
    expect(firstNight({ day: 1, hour: 20 })).toBe(true);
    expect(firstNight({ day: 2, hour: 7 })).toBe(true);
    expect(firstNight({ day: 2, hour: 8 })).toBe(false);
    expect(firstNight({ day: 3, hour: 2 })).toBe(false);
  });

  it('odstęp liczy się od decyzji: po karcie wcześnie 38–56 s, później 110–200 s, po innej decyzji najmniej QUIET s', () => {
    for (const [screen, lo, hi] of [
      [100, 38, 56],
      [1000, GAP_PO, GAP_PO + GAP_ROZRZUT - 1],
    ] as const) {
      const widziane: number[] = [];
      for (let seed = 1; seed <= 300; seed++) {
        const s = stan(reczny({ chce: 'nocleg' }), { seed, input: { screen } });
        wybierz(s, 'Odprawić');
        widziane.push(s.gov.ev.next - screen);
      }
      expect(Math.min(...widziane), `ekran ${screen}`).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...widziane), `ekran ${screen}`).toBeLessThanOrEqual(hi);
    }
    const gov = newGov(3);
    gov.ev.next = 0;
    decision(gov, { ...new Atrapa(3).input(), screen: 500 }, 'uchwala');
    expect(gov.ev.next).toBe(500 + QUIET);
  });
});

describe('gość pod bramą: czasy i wagi', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`fakty równe stałym gry: ${lang}`, () => {
      ustawJezyk(lang);
      expect(fakt('wydarzenia:goscie', 'waga')).toBe(num(WAGA_GOSCIA, 1));
      expect(fakt('wydarzenia:goscie', 'odstep')).toBe(czasTickow(GOSC_GAP * TICKS_PER_HOUR));
      expect(fakt('wydarzenia:goscie', 'czeka')).toBe(czasTickow(GOSC_CZEKA));
      expect(fakt('wydarzenia:goscie', 'dojscie')).toBe(czasTickow(GOSC_DOJSCIE));
      const utrata = proc(1 - wagaGoscia({ napady: 1 }));
      expect(utrata).toBe('20%');
      expect(fakt('wydarzenia:goscie', 'napasc')).toContain(utrata);
      expect(fakt('wydarzenia:goscie', 'napasc')).toContain(proc(MIN_WAGA_GOSCIA));
      expect(wagaGoscia({ napady: 3 })).toBeCloseTo(0.8 ** 3, 10);
      expect(GOSC_GAP).toBe(6);
      expect(GOSC_CZEKA).toBe(3 * TICKS_PER_HOUR);
      expect(GOSC_DOJSCIE).toBe(2 * TICKS_PER_HOUR);
    });

  it('goście wpuszczeni na noc wychodzą między 6:00 a 8:00 (poranne wyjście z funkcji gry)', () => {
    const wieczor = tickAt(3, 23);
    const [od, doo] = zakres((s) => godz(ranoGoscia(wieczor, `x${s}`)), 600);
    expect(od).toBeGreaterThanOrEqual(6);
    expect(doo).toBeLessThan(8);
    expect(fakt('wydarzenia:goscie', 'rano')).toContain('6:00');
    expect(fakt('wydarzenia:goscie', 'rano')).toContain('8:00');
  });
});

describe('rodzaje gości', () => {
  for (const zombie of [false, true])
    for (const lang of ['pl', 'en'] as const)
      it(`osoby, prośby i udział każdego rodzaju: ${lang}, ${zombie ? 'zombie' : 'zwykła gra'}`, () => {
        ustawJezyk(lang);
        const mode: GameMode = zombie ? 'zombie' : 'zwykly';
        const wagi = KTOS.filter((k) => KTO[k].tryby.includes(mode));
        const suma = wagi.reduce((a, k) => a + BAZA_KTO[k], 0);
        for (const k of KTOS) {
          const v = fakt('wydarzenia:rodzaje', `kto-${k}`, zombie)!;
          const [a, b] = KTO[k].ilu;
          expect(v, `${k} osoby`).toContain(a === b ? `${a} ` : `${a}–${b} `);
          for (const p of KTO[k].chce)
            expect(v, `${k} prosi o ${p}`).toContain(lang === 'pl' ? NAZWA_CHCE[p][0] : NAZWA_CHCE[p][1]);
          if (wagi.includes(k)) expect(v, k).toContain(proc(BAZA_KTO[k] / suma));
          else expect(v, k).toMatch(lang === 'pl' ? /tylko w trybie zombie/ : /Zombie mode only/);
          expect(udzial(k, mode)).toBeCloseTo(wagi.includes(k) ? BAZA_KTO[k] / suma : 0, 12);
        }
      });

  it('liczba rodzajów w tekście: dziewięć, siedem w zwykłym trybie', () => {
    expect(KTOS).toHaveLength(9);
    expect(KTOS.filter((k) => KTO[k].tryby.includes('zwykly'))).toHaveLength(7);
    expect(art('wydarzenia:rodzaje').zdania[0]).toContain('9 rodzajów (7 w zwykłym trybie)');
  });

  it('tytuł rodzaju w faktach jest tytułem prawdziwej karty (blok i dom, polski i angielski)', () => {
    for (const wariant of ['blok', 'dom'] as const)
      for (const lang of ['pl', 'en'] as const) {
        ustawJezyk(lang);
        for (const k of KTOS) {
          const zombie = !KTO[k].tryby.includes('zwykly');
          const s = stan(reczny({ kto: k, ilu: KTO[k].ilu[0] }), {
            mode: zombie ? 'zombie' : 'zwykly',
            input: wariant === 'dom' ? { place: miejsce('dom') } : {},
          });
          const karta = eventView(s.gov, s.i)!.title;
          expect(faktK('wydarzenia:rodzaje', `kto-${k}`, zombie, wariant), `${k} ${wariant}`).toBe(karta[lang]);
          expect(tytulKarty(k, kontekst(wariant, false, zombie))).toBe(karta[lang]);
        }
      }
  });

  it('udział rodzaju to jego waga przez sumę wag: tak losuje się gościa (4000 gości)', () => {
    for (const mode of ['zwykly', 'zombie'] as const) {
      const ile: Record<string, number> = {};
      const N = 4000;
      const r = mulberry(17);
      for (let n = 1; n <= N; n++) {
        const g = skladGoscia(r, n, ctx({ mode }), new Set());
        ile[g.kto] = (ile[g.kto] ?? 0) + 1;
      }
      for (const k of KTOS) expect((ile[k] ?? 0) / N, `${mode} ${k}`).toBeCloseTo(udzial(k, mode), 1);
      for (const k of KTOS) expect(Math.abs((ile[k] ?? 0) / N - udzial(k, mode)), `${mode} ${k}`).toBeLessThan(0.03);
    }
  });

  it('wędrowiec jest najczęstszy w obu trybach', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const k of KTOS)
        if (k !== 'wedrowiec') expect(BAZA_KTO.wedrowiec, `${mode} ${k}`).toBeGreaterThanOrEqual(BAZA_KTO[k]);
  });
});

describe('prośby i to, co gość ma', () => {
  it('po zmroku częściej proszą o dach, a za dnia o jedzenie (4000 gości na porę)', () => {
    const udzialProsby = (pora: KontekstGoscia['pora'], chce: ChceId): number => {
      const r = mulberry(23);
      let n = 0;
      const N = 4000;
      for (let k = 1; k <= N; k++) if (skladGoscia(r, k, ctx({ pora }), new Set()).chce === chce) n++;
      return n / N;
    };
    expect(udzialProsby('noc', 'nocleg')).toBeGreaterThan(udzialProsby('dzien', 'nocleg'));
    expect(udzialProsby('dzien', 'jedzenie')).toBeGreaterThan(udzialProsby('noc', 'jedzenie'));
  });

  it('próg fachu i rzeczy w faktach', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      expect(fakt('wydarzenia:prosby', 'ma-fach')).toContain(`${PROG_FACHU}`);
      expect(fakt('wydarzenia:prosby', 'ma-fach')).toContain(etykietaWyboru('zarzad', kontekst('blok')));
      for (const id of ['ma-rzecz', 'ma-wiadomosc', 'ma-ostrzezenie'])
        expect(fakt('wydarzenia:prosby', id)).toBeTruthy();
    }
    expect(PROG_FACHU).toBe(2);
  });

  it('kto prosi o leki, nie niesie leków, a prośba o wymianę ma coś do wymiany', () => {
    for (let n = 1; n <= 600; n++) {
      const g = skladGoscia(mulberry(n), n, ctx({ mode: n % 2 ? 'zwykly' : 'zombie' }), new Set());
      if (g.chce === 'leki' && g.ma === 'rzecz') expect(g.rzecz?.meds, `g${n}`).toBeUndefined();
      if (g.chce === 'wymiana') expect(['rzecz', 'wiadomosc'], `g${n}`).toContain(g.ma);
    }
  });
});

// ---------------------------------------------------------------- karta gościa na atrapie zarządu

const ctx = (over: Partial<KontekstGoscia> = {}): KontekstGoscia => ({
  mode: 'zwykly',
  pora: 'dzien',
  season: 0,
  zapasy: 10,
  okolica: [],
  znane: new Set(),
  napady: 0,
  dom: false,
  ...over,
});

let licznik = 1;
/** gość z ręcznie ustawionymi klockami (osoby z generatora grup, id g1p0…) */
function reczny(over: Partial<Gosc> & { ilu?: number } = {}): Gosc {
  const { ilu, ...rest } = over;
  const kto: KtoId = rest.kto ?? 'rodzina';
  const osoby =
    rest.osoby ?? osobyGrupy(mulberry(5), () => licznik++, kto, ilu ?? Math.max(2, KTO[kto].ilu[0]), new Set<string>());
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

const tickAtGry = (day: number, hour: number): number => Math.round(((at(day, hour) - 15 * 60) * TPH) / 60);

/** Zarząd z otwartą kartą gościa pod bramą: wizyta aktywna, wpis w odczycie (faza `brama`), atrapa o 16:00 trzeciego dnia. */
function stan(
  g: Gosc,
  o: { wpis?: Partial<GovGosc>; mode?: GameMode; input?: Partial<GovInput>; seed?: number } = {},
): Stan {
  const seed = o.seed ?? 3;
  const gov = newGov(seed, o.mode ?? 'zwykly');
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.tick = tickAtGry(3, 16);
  const wpis: GovGosc = {
    id: g.id,
    faza: 'brama',
    tile: 1234,
    gdzie: { x: 34, y: 12 },
    pawns: g.osoby.map((_, k) => 100 + k),
    zywi: g.osoby.map((_, k) => k),
    ukradl: 0,
    ...o.wpis,
  };
  const i: GovInput = { ...atr.input(), screen: 1000, kozaLit: true, goscie: [wpis], napady: [], ...o.input };
  gov.goscie = { n: 1, czytane: 0, aktywny: { gosc: g, od: 900, karta: true } };
  gov.ev.active = { id: 'gosc', d: { id: g.id } };
  return { gov, i, atr };
}

const etykiety = (s: Stan, lang: 'pl' | 'en'): string[] =>
  (eventView(s.gov, s.i)?.choices ?? []).map((c) => c.label[lang]);

function wybierz(s: Stan, prefix: string): GovEffects {
  const k = (eventView(s.gov, s.i)?.choices ?? []).findIndex((c) => c.label.pl.startsWith(prefix));
  expect(k, `brak „${prefix}”: ${etykiety(s, 'pl').join(' | ')}`).toBeGreaterThanOrEqual(0);
  return chooseEvent(s.gov, s.i, k);
}

const rozkazy = (fx: GovEffects): string[] => (fx.goscRozkaz ?? []).map((r) => r.co);

/** przeszukiwanie wizyty z dzidą u pierwszej osoby zarządu (odpowiedź „Dobić”) */
const zDzida = (s: Stan): Stan => {
  s.i.people = s.i.people.map((p, k) => (k === 0 ? { ...p, arm: 'dzida' as const } : p));
  return s;
};

const BEZ_WIEDZY = { bud: 0, cieplo: 0, elek: 0, med: 0, uprawa: 0, it: 0 };

/** gość, który z danej prośby robi kartę ze wszystkimi odpowiedziami na nią, i tryb, w którym ma sens */
function gosciDoKarty(): { chce: ChceId; g: Gosc; mode: GameMode; input?: Partial<GovInput> }[] {
  const fach = reczny({ chce: 'dolaczyc', ma: 'fach' });
  fach.osoby[0].skills = { elek: 3 };
  return [
    { chce: 'nocleg', g: reczny({ chce: 'nocleg' }), mode: 'zwykly' },
    { chce: 'jedzenie', g: reczny({ chce: 'jedzenie' }), mode: 'zwykly' },
    { chce: 'leki', g: reczny({ chce: 'leki', ma: 'wiadomosc' }), mode: 'zwykly' },
    {
      chce: 'wymiana',
      g: reczny({ chce: 'wymiana', ma: 'rzecz', rzecz: { arms: 'kusza', ammo: { belty: 6 } } }),
      mode: 'zwykly',
    },
    { chce: 'dolaczyc', g: fach, mode: 'zwykly', input: { know: BEZ_WIEDZY } },
    { chce: 'przechowac', g: reczny({ chce: 'przechowac', ma: 'rzecz', rzecz: { meds: 2 } }), mode: 'zwykly' },
    { chce: 'wiadomosc', g: reczny({ chce: 'wiadomosc', ma: 'wiadomosc' }), mode: 'zwykly' },
    {
      chce: 'dobic',
      g: reczny({ kto: 'z_ugryzionym', chce: 'dobic', haczyk: 'ugryziony', ugryziony: 1 }),
      mode: 'zombie',
    },
  ];
}

/** napis odpowiedzi z gry sprowadzony do formy z wiki: imię mówiącego w odpowiedzi o zarządzie zamienione na „imię” / „[name]” */
function wFormieWiki(label: string, g: Gosc): string {
  const first = g.osoby[0].first;
  return label.replace(`(${first})`, '(imię)').replace(`Take ${first} onto`, 'Take [name] onto');
}

describe('odpowiedzi na karcie gościa są takie, jak w wiki', () => {
  for (const wariant of ['blok', 'dom'] as const)
    for (const lang of ['pl', 'en'] as const)
      it(`etykiety: ${wariant}, ${lang}`, () => {
        ustawJezyk(lang);
        const c = kontekst(wariant, false, false);
        for (const { chce, g, mode, input } of gosciDoKarty()) {
          const s = stan(g, {
            mode,
            input: { ...(wariant === 'dom' ? { place: miejsce('dom') } : {}), ...input },
          });
          const z = etykiety(s, lang).map((l) => wFormieWiki(l, g));
          const oczekiwana = etykietaWyboru(ODPOWIEDZ_NA[chce], c);
          expect(
            z.some((l) => l === oczekiwana || (ODPOWIEDZ_NA[chce] === 'zostan' && l.startsWith(oczekiwana))),
            `${chce}: „${oczekiwana}” wśród ${z.join(' | ')}`,
          ).toBe(true);
          // odprawa jest zawsze ostatnia
          expect(z[z.length - 1]).toBe(etykietaWyboru('odprawic', c));
          if (chce === 'dolaczyc') expect(z, 'odpowiedź o zarządzie').toContain(etykietaWyboru('zarzad', c));
        }
        // noc dostępna zawsze (wyjątek: brama na kłódkę), „Obejrzeć ręce” tylko w zombie
        const zwykly = etykiety(stan(reczny({ chce: 'nocleg' })), lang);
        expect(zwykly).not.toContain(etykietaWyboru('obejrzec', c));
        const zombie = etykiety(stan(reczny({ chce: 'nocleg' }), { mode: 'zombie' }), lang);
        expect(zombie).toContain(etykietaWyboru('obejrzec', c));
      });

  it('zaufanie, wkurzenie, koszty i rozkazy po odpowiedziach (artykuł o odpowiedziach)', () => {
    const t0 = newGov(3).trust;
    // wpuścić na noc
    let s = stan(reczny({ chce: 'nocleg' }));
    let fx = wybierz(s, 'Wpuścić na noc');
    expect(rozkazy(fx)).toEqual(['noc']);
    expect(s.gov.trust).toBe(t0 + 1);
    // jedzenie przez siatkę
    s = stan(reczny({ chce: 'jedzenie' }));
    fx = wybierz(s, 'Podać jedzenie');
    expect(rozkazy(fx)).toEqual(['jedzenie']);
    expect(fx.stock.supplies).toBe(-1);
    expect(s.gov.trust).toBe(t0 + 1);
    // odprawa
    s = stan(reczny({ chce: 'nocleg' }));
    fx = wybierz(s, 'Odprawić');
    expect(rozkazy(fx)).toEqual(['odejdz']);
    expect(s.gov.trust).toBe(t0 - 1);
    // leki
    s = stan(reczny({ chce: 'leki', ma: 'wiadomosc' }));
    fx = wybierz(s, 'Dać leki');
    expect(fx.stock.meds).toBe(-1);
    expect(s.gov.trust).toBe(t0 + 1);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    // wymiana: bez zmiany zaufania
    s = stan(reczny({ chce: 'wymiana', ma: 'rzecz', rzecz: { arms: 'kusza' } }));
    fx = wybierz(s, 'Przystać na wymianę');
    expect(fx.stock.supplies).toBe(-2);
    expect(s.gov.trust).toBe(t0);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    // przechowanie: rzecz zostaje u nas
    s = stan(reczny({ chce: 'przechowac', ma: 'rzecz', rzecz: { meds: 3 } }));
    fx = wybierz(s, 'Przyjąć na przechowanie');
    expect(fx.stock.meds).toBe(3);
    expect(s.gov.trust).toBe(t0 + 1);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    // wysłuchanie: bez kosztu i bez zmiany zaufania
    s = stan(reczny({ chce: 'wiadomosc', ma: 'wiadomosc' }));
    fx = wybierz(s, 'Wysłuchać');
    expect(s.gov.trust).toBe(t0);
    expect(fx.stock.supplies).toBe(0);
    expect(rozkazy(fx)).toEqual(['odejdz']);
    // przyjęcie: +1, a przy braku łóżek wkurzenie +2 i cała grupa zostaje
    s = stan(reczny({ kto: 'rodzina', chce: 'dolaczyc', ilu: 4 }), { input: { cap: 8, residents: 8 } });
    const a0 = s.gov.anger;
    fx = wybierz(s, 'Przyjąć do spółdzielni');
    expect(rozkazy(fx)).toEqual(['zostan']);
    expect(s.gov.trust).toBe(t0 + 1);
    expect(s.gov.anger).toBe(a0 + 2);
    s = stan(reczny({ kto: 'rodzina', chce: 'dolaczyc', ilu: 4 }), { input: { cap: 20, residents: 8 } });
    wybierz(s, 'Przyjąć do spółdzielni');
    expect(s.gov.anger).toBe(newGov(3).anger);
    // przyjęcie do zarządu: pierwsza żywa osoba, rozkaz zarzad
    const f = reczny({ chce: 'dolaczyc', ma: 'fach' });
    f.osoby[0].skills = { elek: 3 };
    s = stan(f, { input: { know: BEZ_WIEDZY } });
    expect(rozkazy(wybierz(s, 'Przyjąć do zarządu'))).toEqual(['zarzad']);
    expect(s.gov.trust).toBe(t0 + 1);
  });

  it('dobicie: dzida przez siatkę, nastrój −6 na 24 godziny; bez dzidy niedostępne; ugryzienie odsłania „Obejrzeć ręce”', () => {
    const bity = () => reczny({ kto: 'z_ugryzionym', chce: 'dobic', haczyk: 'ugryziony', ugryziony: 1 });
    const bez = stan(bity(), { mode: 'zombie' });
    expect(eventView(bez.gov, bez.i)!.choices[0].ok).toBe(false);
    const s = zDzida(stan(bity(), { mode: 'zombie' }));
    const fx = wybierz(s, 'Dobić przez siatkę dzidą');
    expect(rozkazy(fx)).toEqual(['dobij', 'odejdz']);
    expect(fx.moods).toEqual([{ id: s.i.people[0].id, why: 'Zabiłem człowieka', d: -6, hours: 24 }]);
    // obejrzeć ręce: ugryziony odsłonięty, karta zostaje; zdrowy kosztuje zaufanie 1
    const t0 = newGov(3).trust;
    const b = stan(reczny({ chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 0 }), { mode: 'zombie' });
    wybierz(b, 'Obejrzeć ręce');
    expect(b.gov.ev.active).toBeTruthy();
    expect(b.gov.trust).toBe(t0);
    const czysty = stan(reczny({ chce: 'nocleg' }), { mode: 'zombie' });
    wybierz(czysty, 'Obejrzeć ręce');
    expect(czysty.gov.ev.active).toBeTruthy();
    expect(czysty.gov.trust).toBe(t0 - 1);
  });

  it('nocleg niedostępny od 20:00 do 6:00 z uchwałą o bramie na kłódkę, a poza tym dostępny', () => {
    for (const [hour, ok] of [
      [19, true],
      [20, false],
      [23, false],
      [2, false],
      [5, false],
      [6, true],
      [12, true],
    ] as const) {
      const s = stan(reczny({ chce: 'nocleg' }), { input: { hour } });
      s.gov.laws.signed.u_brama = true;
      const c = eventView(s.gov, s.i)!.choices.find((x) => x.label.pl === 'Wpuścić na noc')!;
      expect(c.ok, `godzina ${hour}`).toBe(ok);
    }
    const bez = stan(reczny({ chce: 'nocleg' }), { input: { hour: 22 } });
    expect(eventView(bez.gov, bez.i)!.choices.find((x) => x.label.pl === 'Wpuścić na noc')!.ok).toBe(true);
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const t = art('wydarzenia:wybory').zdania[3];
      expect(t).toContain('20:00');
      expect(t).toContain('6:00');
    }
  });

  it('nagroda za to, co gość ma, idzie przy pomocy, a nie przy odprawie ani dobiciu', () => {
    let s = stan(reczny({ chce: 'jedzenie', ma: 'rzecz', rzecz: { arms: 'lom', meds: 2 } }));
    let fx = wybierz(s, 'Podać jedzenie');
    expect(fx.arms).toEqual(['lom']);
    expect(fx.stock.meds).toBe(2);
    s = stan(reczny({ chce: 'jedzenie', ma: 'rzecz', rzecz: { arms: 'lom' } }));
    fx = wybierz(s, 'Odprawić');
    expect(fx.arms).toBeUndefined();
    expect(fx.stock.meds).toBe(0);
    // ostrzeżenie: warta tej nocy czujniejsza
    s = stan(reczny({ chce: 'nocleg', ma: 'ostrzezenie' }));
    expect(s.gov.tonight.alert).toBe(0);
    wybierz(s, 'Wpuścić na noc');
    expect(s.gov.tonight.alert).toBeGreaterThan(0);
    // dobicie nie daje niczego: bliski z prośbą o dobicie nie ma niczego przy sobie
    for (let n = 1; n <= 200; n++) {
      const g = skladGoscia(mulberry(n), n, ctx({ mode: 'zombie' }), new Set());
      if (g.chce === 'dobic') expect(g.ma, `g${n}`).toBe('nic');
    }
  });
});

describe('haczyki', () => {
  it('które haczyki bywają w którym trybie (zwykły: prawda, kłamie, chory, pościg; zombie: prawda, chory, ugryziony)', () => {
    expect(haczykiMozliwe('wedrowiec', 'zwykly')).toEqual(['prawda', 'klamie', 'chory', 'poscig']);
    expect(haczykiMozliwe('wedrowiec', 'zombie')).toEqual(['prawda', 'chory', 'ugryziony']);
    expect(haczykiMozliwe('z_ugryzionym', 'zombie')).toEqual(['ugryziony']);
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      expect(fakt('wydarzenia:haczyk', 'haczyk-prawda')).toContain(num(BAZA_HACZYK.prawda, 1));
      expect(fakt('wydarzenia:haczyk', 'haczyk-prawda')).toContain(
        num(BAZA_HACZYK.prawda + BAZA_HACZYK.klamie + BAZA_HACZYK.chory + BAZA_HACZYK.poscig, 1),
      );
      for (const h of HACZYKI.slice(1))
        expect(fakt('wydarzenia:haczyk', `haczyk-${h}`)).toContain(num(BAZA_HACZYK[h], 1));
    }
    // prawda ma największą wagę, więc „najczęściej mówi prawdę”
    for (const h of HACZYKI.slice(1)) expect(BAZA_HACZYK.prawda).toBeGreaterThan(BAZA_HACZYK[h]);
  });

  it('kłamca wpuszczony na noc dostaje rozkaz klamie, chory zaraża rano, ugryziony dostaje gorączkę, pościg robi napad (zwykły) albo hałas (zombie)', () => {
    expect(rozkazy(wybierz(stan(reczny({ chce: 'nocleg', haczyk: 'klamie' })), 'Wpuścić na noc'))).toEqual([
      'noc',
      'klamie',
    ]);
    const chory = stan(reczny({ chce: 'nocleg', haczyk: 'chory' }));
    wybierz(chory, 'Wpuścić na noc');
    expect(chory.gov.later.some((l) => l.sick)).toBe(true);
    const bity = stan(reczny({ chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 0 }), { mode: 'zombie' });
    expect(rozkazy(wybierz(bity, 'Wpuścić na noc'))).toEqual(['noc', 'ugryziony']);
    // pościg w zwykłym trybie: szansa napadu tej nocy około ×1,5
    const p = stan(reczny({ chce: 'nocleg', haczyk: 'poscig' }));
    const przed = raidChance(p.gov, p.i);
    wybierz(p, 'Wpuścić na noc');
    expect(raidChance(p.gov, p.i)).toBeCloseTo(Math.min(0.85, Math.round(przed * 1.5 * 100) / 100), 10);
    // pościg w zombie: hałas przy bramie w promieniu HALAS_PROMIEN
    const z = stan(reczny({ chce: 'nocleg', haczyk: 'chory' }), { mode: 'zombie' });
    expect(z.gov.mode).toBe('zombie');
    expect(HALAS_PROMIEN).toBe(15);
    expect(fakt('wydarzenia:haczyk', 'haczyk-poscig')).toBeTruthy();
  });
});

describe('złapany na kradzieży', () => {
  function zlapany() {
    const s = stan(reczny({ haczyk: 'klamie', chce: 'nocleg' }), { wpis: { faza: 'zlapany', ukradl: 2 } });
    s.gov.ev.active = null;
    s.gov.goscie!.aktywny!.noc = true;
    s.i = { ...s.i, hour: 2, day: 4 };
    eventTick(s.gov, s.i, emptyEffects(), false);
    return s;
  }

  for (const lang of ['pl', 'en'] as const)
    it(`fakty równe stałym gry i napisom karty: ${lang}`, () => {
      ustawJezyk(lang);
      expect(fakt('wydarzenia:zlapany', 'zasieg')).toBe(`${GOSC_ZASIEG}${NB}m`);
      expect(fakt('wydarzenia:zlapany', 'lup')).toContain(`${GOSC_LUP}`);
      expect(fakt('wydarzenia:zlapany', 'do-rana')).toContain(`${GOSC_ZLAPANY_DO}:00`);
      expect(fakt('wydarzenia:zlapany', 'nastawienie')).toBe(signed(NASTAWIENIE.zlapany, 0));
      const s = zlapany();
      const v = eventView(s.gov, s.i)!;
      expect(v.title[lang]).toBe(lang === 'pl' ? 'Złapany na kradzieży' : 'Caught stealing');
      const tekst = art('wydarzenia:zlapany').zdania.join(' ');
      for (const c of v.choices) expect(tekst, c.label[lang]).toContain(c.label[lang]);
    });

  it('trzy odpowiedzi: oddać (+1 zaufania), z łupem (−1 i wkurzenie +1), zatrzymać do rana (odpoczynek −10)', () => {
    let s = zlapany();
    const t0 = s.gov.trust;
    const a0 = s.gov.anger;
    let fx = wybierz(s, 'Oddać jedzenie');
    expect(rozkazy(fx)).toEqual(['puscic']);
    expect(s.gov.trust).toBe(t0 + 1);
    s = zlapany();
    fx = wybierz(s, 'Wyrzucić z łupem');
    expect(s.gov.trust).toBe(t0 - 1);
    expect(s.gov.anger).toBe(a0 + 1);
    s = zlapany();
    fx = wybierz(s, 'Zatrzymać do rana');
    expect(fx.needs[0].d).toEqual({ rest: -10 });
    // znajomy złapany ma nastawienie −2
    expect(NASTAWIENIE.zlapany).toBe(-2);
    expect(s.gov.znajomi?.[0].nastawienie).toBe(-2);
  });

  it('kłamca rusza po jedzenie o 2:00 w symulacji (źródło sim.ts)', () => {
    const zrodlo = fs.readFileSync(path.resolve(__dirname, '../../src/sim/sim.ts'), 'utf8');
    expect(zrodlo).toMatch(/najblizszaGodzina\(st\.tick, 2\)/);
    expect(zrodlo).toMatch(/g\.rano = najblizszaGodzina\(st\.tick, GOSC_ZLAPANY_DO\)/);
  });
});

// ---------------------------------------------------------------- handlarz

/** „dzień 2, 10:00–12:00” / „day 2, 10:00–12:00” */
function termin(v: string): { dzien: number; od: number; doo: number } {
  const m = /(\d+), (\d+):00–(\d+):00/.exec(v)!;
  return { dzien: Number(m[1]), od: Number(m[2]), doo: Number(m[3]) };
}

describe('handlarz', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`terminy i czasy równe funkcjom gry: ${lang}`, () => {
      ustawJezyk(lang);
      const [d1, d2] = [2, 2];
      const p = termin(fakt('wydarzenia:handlarz', 'pierwsza')!);
      expect([p.dzien, p.dzien]).toEqual([d1, d2]);
      // pierwsza wizyta z funkcji gry: dzień 2, 10:00–12:00
      const pierwsza = zakres((s) => firstVisit({ s }), 600);
      expect(dayOf(pierwsza[0])).toBe(p.dzien);
      expect(dayOf(pierwsza[1])).toBe(p.dzien);
      expect(godz(pierwsza[0])).toBeGreaterThanOrEqual(p.od);
      expect(godz(pierwsza[1])).toBeLessThanOrEqual(p.doo);
      expect(godz(pierwsza[0])).toBeLessThan(p.od + 0.5);
      expect(godz(pierwsza[1])).toBeGreaterThan(p.doo - 0.5);
      // kolejne: za 2 albo 3 dni, 9:00–13:00
      const kolejne = zakres((s) => nextVisit(5, { s }), 600);
      expect([dayOf(kolejne[0]) - 5, dayOf(kolejne[1]) - 5]).toEqual([2, 3]);
      expect(godz(kolejne[0])).toBeGreaterThanOrEqual(9);
      expect(godz(kolejne[1])).toBeLessThan(13);
      expect(fakt('wydarzenia:handlarz', 'kolejne')).toContain('2–3');
      expect(fakt('wydarzenia:handlarz', 'kolejne')).toContain('9:00–13:00');
      expect(fakt('wydarzenia:handlarz', 'czeka')).toContain(czasTickow(WAIT_TICKS));
      expect(fakt('wydarzenia:handlarz', 'czeka')).toContain(`${LEAVE_HOUR}:00`);
      expect(fakt('wydarzenia:handlarz', 'targ')).toBe(czasTickow(HAGGLE_TICKS));
      expect(czasTickow(HAGGLE_TICKS)).toBe(`5${NB}min`);
      // zombie: dzień 4, co 5–7 dni
      expect(fakt('wydarzenia:handlarz', 'zombie-pierwsza')).toContain(lang === 'pl' ? 'dzień 4' : 'day 4');
      const zk = zakres((s) => nextVisitZombie(5, { s }), 600);
      expect([dayOf(zk[0]) - 5, dayOf(zk[1]) - 5]).toEqual([5, 7]);
      expect(fakt('wydarzenia:handlarz', 'zombie-kolejne')).toContain('5–7');
      expect(fakt('wydarzenia:handlarz', 'zombie-czeka')).toBe(czasTickow(WAIT_ZOMBIE));
      expect(fakt('wydarzenia:handlarz', 'zombie-nie-dochodzi')).toBe(proc(TRADER_NOSHOW));
    });

  it('w prawdziwej symulacji pierwsza wizyta wypada w dniu z artykułu (zwykły: 2, zombie: 4)', () => {
    const w = demoWorld('przymorze');
    for (const [mode, dzien] of [
      ['zwykly', 2],
      ['zombie', 4],
    ] as const)
      for (let seed = 1; seed <= 12; seed++) {
        const st = createSim(w, seed, { core: 4, mode, obcy: true });
        expect(dayOf(st.obcy!.next), `${mode} ${seed}`).toBe(dzien);
        expect(godz(st.obcy!.next)).toBeGreaterThanOrEqual(10);
        expect(godz(st.obcy!.next)).toBeLessThanOrEqual(12);
        expect(dayOf(st.obcy!.wnext!)).toBe(2);
        expect(godz(st.obcy!.wnext!)).toBeGreaterThanOrEqual(8);
        expect(godz(st.obcy!.wnext!)).toBeLessThan(12);
      }
  });

  it('towar: jedna oferta kupująca złom i dwie z reszty tabeli, każda do OFFER_TIMES razy', () => {
    const klucz = (d: { take: object; give: object }) => JSON.stringify([d.take, d.give]);
    const zlom = new Set(BUYS_SCRAP.map(([take, give]) => klucz({ take, give })));
    const wszystkie = new Set([...BUYS_SCRAP, ...OTHER].map(([take, give]) => klucz({ take, give })));
    expect(wszystkie.size).toBe(BUYS_SCRAP.length + OTHER.length);
    for (let s = 1; s <= 300; s++) {
      const oferty = rollOffers({ s });
      expect(oferty).toHaveLength(3);
      expect(zlom.has(klucz(oferty[0])), `ziarno ${s}`).toBe(true);
      expect(new Set(oferty.map(klucz)).size).toBe(3);
      for (const o of oferty) {
        expect(wszystkie.has(klucz(o))).toBe(true);
        expect(o.left).toBe(OFFER_TIMES);
      }
    }
    expect(OFFER_TIMES).toBe(2);
    expect(BUYS_SCRAP.every(([take]) => 'zlom' in take)).toBe(true);
    expect(OTHER.some(([take]) => 'zlom' in take)).toBe(false);
  });

  it('uwaga o trybie zombie podaje liczby z gry', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const u = art('wydarzenia:handlarz', true).uwaga!;
      for (const v of [
        proc(TRADER_NOSHOW),
        czasTickow(WAIT_ZOMBIE),
        czasTickow(ZOMBIE_DELAY),
        `${ZOMBIE_SCARE_ARRIVE}${NB}m`,
        `${ZOMBIE_SCARE_WAIT}${NB}m`,
      ])
        expect(u, v).toContain(v);
    }
  });
});

describe('napaść na handlarza i wędrowca', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`fakty równe stałym gry: ${lang}`, () => {
      ustawJezyk(lang);
      const trust = (k: 'handlarz' | 'wedrowiec') => `${signed(CENA[k].trust, 0)}`;
      const anger = (k: 'handlarz' | 'wedrowiec') => `${signed(CENA[k].anger, 0)}`;
      for (const [id, k] of [
        ['cena-handlarz', 'handlarz'],
        ['cena-wedrowiec', 'wedrowiec'],
      ] as const) {
        const v = fakt('wydarzenia:napasc', id)!;
        expect(v).toContain(trust(k));
        expect(v).toContain(anger(k));
      }
      expect(fakt('wydarzenia:napasc', 'nastroj-handlarz')).toContain(`${signed(ROB_MOOD, 0)}`);
      expect(fakt('wydarzenia:napasc', 'nastroj-handlarz')).toContain(`${signed(ROB_MOOD_OTHERS, 0)}`);
      expect(fakt('wydarzenia:napasc', 'nastroj-wedrowiec')).toContain(`${signed(MUG_MOOD, 0)}`);
      expect(fakt('wydarzenia:napasc', 'nastroj-wedrowiec')).toContain(`${signed(MUG_MOOD_OTHERS, 0)}`);
      const walka = fakt('wydarzenia:napasc', 'handlarz-walka')!;
      expect(walka).toContain(`${TRADER_HP}`);
      expect(walka).toContain(`${TRADER_FLEE}`);
      const slawa = fakt('wydarzenia:napasc', 'slawa')!;
      for (const v of [SLAWA_MAX, SLAWA_EXTRA_DAYS, SLAWA_DAYS]) expect(slawa).toContain(`${v}`);
      const zemsta = fakt('wydarzenia:napasc', 'zemsta')!;
      for (const v of [
        proc(REVENGE_CHANCE),
        `${ZBIR_HP}`,
        `${ZBIR_FLEE}`,
        `${ZBIR_LEAVE_HOUR}:00`,
        czasTickow(ZBIR_STAY),
      ])
        expect(zemsta, v).toContain(v);
      expect(fakt('wydarzenia:napasc', 'zabity')).toContain(`${KILL_DELAY_DAYS}`);
      expect(fakt('wydarzenia:napasc', 'werbunek')).toContain(czasTickow(NAPAD_PAMIEC));
      expect(fakt('wydarzenia:napasc', 'goscie')).toContain(proc(1 - wagaGoscia({ napady: 1 })));
    });

  it('zarząd liczy cenę napaści w zaufaniu i wkurzeniu z CENA', () => {
    for (const kto of ['handlarz', 'wedrowiec'] as const) {
      const gov = newGov(3);
      const t0 = gov.trust;
      const a0 = gov.anger;
      const i: GovInput = { ...new Atrapa(3).input(), napady: [{ kto, tick: 10 }] };
      wiesci(gov, i, { log: [], later: [], stock: {} } as never);
      expect(gov.trust).toBe(t0 + CENA[kto].trust);
      expect(gov.anger).toBe(a0 + CENA[kto].anger);
    }
    expect(CENA.handlarz).toEqual({ trust: -6, anger: 4 });
    expect(CENA.wedrowiec).toEqual({ trust: -3, anger: 2 });
  });

  it('zła sława podnosi ceny o połowę na poziom, a worek wędrowca ma 1–3 porcje jedzenia, częściej część niż lek', () => {
    const oferta = { give: { deski: 3 }, take: { zlom: 6 }, left: 2 };
    expect(priced(oferta, 0).take.zlom).toBe(6);
    expect(priced(oferta, 1).take.zlom).toBe(9);
    expect(priced(oferta, 2).take.zlom).toBe(12);
    let jedz = [9, 0];
    let czesc = 0;
    let lek = 0;
    for (let s = 1; s <= 1500; s++) {
      const w = mugLoot({ s });
      jedz = [Math.min(jedz[0], w.jedzenie ?? 0), Math.max(jedz[1], w.jedzenie ?? 0)];
      if (w.czesci) czesc++;
      if (w.leki) lek++;
    }
    expect(jedz).toEqual([1, 3]);
    expect(czesc).toBeGreaterThan(lek);
    expect(lek).toBeGreaterThan(0);
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      expect(art('wydarzenia:napasc').zdania[3]).toContain('1–3');
    }
  });

  it('ludzie handlarza wracają nocą 22:00–1:00 w trzy–cztery osoby (źródło sim.ts)', () => {
    const zrodlo = fs.readFileSync(path.resolve(__dirname, '../../src/sim/sim.ts'), 'utf8');
    expect(zrodlo).toMatch(/tickAt\(night, 22 \+ 3 \* nextRandom\(st\.rng\)\)/);
    expect(zrodlo).toMatch(/n: 3 \+ Math\.floor\(2 \* nextRandom\(st\.rng\)\)/);
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      expect(fakt('wydarzenia:napasc', 'zemsta')).toContain('3–4');
      expect(fakt('wydarzenia:napasc', 'zemsta')).toContain('22:00–1:00');
    }
  });
});

// ---------------------------------------------------------------- wędrowcy i werbunek

describe('wędrowcy i obce ekipy', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`terminy i czasy równe funkcjom gry: ${lang}`, () => {
      ustawJezyk(lang);
      const minut = (t: number) => `${Math.round((t / TICKS_PER_HOUR) * 60)}`;
      expect(fakt('wydarzenia:wedrowcy', 'przystaje')).toBe(`${minut(PAUSE_MIN)}–${minut(PAUSE_MAX)}${NB}min`);
      expect(fakt('wydarzenia:wedrowcy', 'rozmowa')).toBe(czasTickow(TALK_TICKS));
      expect(fakt('wydarzenia:wedrowcy', 'humor')).toContain(`+${TALK_MOOD}`);
      expect(fakt('wydarzenia:wedrowcy', 'humor')).toContain(czasTickow(TALK_MOOD_TICKS));
      expect(fakt('wydarzenia:wedrowcy', 'po-rozmowie')).toBe(czasTickow(PO_ROZMOWIE));
      expect(fakt('wydarzenia:wedrowcy', 'ekipa-wrak')).toBe(czasTickow(CREW_SEARCH_TICKS));
      expect(fakt('wydarzenia:wedrowcy', 'przegonic')).toBe(`${SHOO_REACH}${NB}m`);
      // odstęp między wędrowcami: 3–8 godzin (zombie: 6–14)
      const start = tickAt(3, 8);
      const [lo, hi] = zakres((s) => (nextWanderer(start, { s }) - start) / TICKS_PER_HOUR, 1500);
      expect([Math.floor(lo + 1e-6), Math.ceil(hi - 1e-6)]).toEqual([3, 8]);
      expect(fakt('wydarzenia:wedrowcy', 'odstep')).toContain('3–8');
      const noc0 = tickAt(3, 0);
      const [zlo, zhi] = zakres((s) => (nextWandererZombie(noc0, { s }) - noc0) / TICKS_PER_HOUR, 1500);
      expect([Math.floor(zlo + 1e-6), Math.ceil(zhi - 1e-6)]).toEqual([6, 14]);
      expect(art('wydarzenia:wedrowcy', true).uwaga).toContain('6–14');
      // ekipy: co 2–3 dni, 9:00–14:00 (zombie: 3–5)
      const ek = zakres((s) => nextCrew(5, { s }), 600);
      expect([dayOf(ek[0]) - 5, dayOf(ek[1]) - 5]).toEqual([2, 3]);
      expect(godz(ek[0])).toBeGreaterThanOrEqual(9);
      expect(godz(ek[1])).toBeLessThan(14);
      expect(fakt('wydarzenia:wedrowcy', 'ekipa-kolejna')).toContain('2–3');
      const ez = zakres((s) => nextCrewZombie(5, { s }), 600);
      expect([dayOf(ez[0]) - 5, dayOf(ez[1]) - 5]).toEqual([3, 5]);
      expect(art('wydarzenia:wedrowcy', true).uwaga).toContain('3–5');
      expect(art('wydarzenia:wedrowcy', true).uwaga).toContain(`${RADY.length} `);
    });

  it('w prawdziwej symulacji pierwsza ekipa wypada w dniu 3–4 (zombie: 3–5) między 9:00 a 14:00', () => {
    const w = demoWorld('przymorze');
    for (const [mode, dni] of [
      ['zwykly', [3, 4]],
      ['zombie', [3, 4, 5]],
    ] as const)
      for (let seed = 1; seed <= 15; seed++) {
        const st = createSim(w, seed, { core: 4, mode, obcy: true });
        expect(dni as readonly number[], `${mode} ${seed}`).toContain(dayOf(st.obcy!.enext!));
        expect(godz(st.obcy!.enext!)).toBeGreaterThanOrEqual(9);
        expect(godz(st.obcy!.enext!)).toBeLessThan(14);
      }
    expect(art('wydarzenia:wedrowcy').fakty.find((f) => f.id === 'ekipa-pierwsza')!.v).toContain('3–4');
  });
});

describe('zapraszanie wędrowców', () => {
  const s = (o: Partial<Parameters<typeof szansaWerbunku>[0]>) =>
    Math.round(
      100 * szansaWerbunku({ jedzenieNaGlowe: 0, wolneLozko: false, napadDwieDoby: false, maCel: false, ...o }),
    );

  for (const lang of ['pl', 'en'] as const)
    it(`szansa równa funkcji gry: ${lang}`, () => {
      ustawJezyk(lang);
      expect(s({})).toBe(30);
      expect(fakt('wydarzenia:werbunek', 'szansa-baza')).toBe('30%');
      expect(fakt('wydarzenia:werbunek', 'szansa-jedzenie')).toContain('+20');
      expect(fakt('wydarzenia:werbunek', 'szansa-jedzenie')).toContain('2 ');
      expect(s({ jedzenieNaGlowe: 2 }) - s({})).toBe(20);
      expect(s({ jedzenieNaGlowe: 1.9 }) - s({})).toBe(0);
      expect(fakt('wydarzenia:werbunek', 'szansa-lozko')).toContain('+15');
      expect(s({ wolneLozko: true }) - s({})).toBe(15);
      expect(fakt('wydarzenia:werbunek', 'szansa-napad')).toContain('−30');
      expect(
        s({ jedzenieNaGlowe: 2, wolneLozko: true }) - s({ jedzenieNaGlowe: 2, wolneLozko: true, napadDwieDoby: true }),
      ).toBe(30);
      expect(fakt('wydarzenia:werbunek', 'szansa-zakres')).toBe('5–65%');
      let min = 100;
      let max = 0;
      for (const jedz of [0, 2])
        for (const lozko of [false, true])
          for (const napad of [false, true]) {
            const v = s({ jedzenieNaGlowe: jedz, wolneLozko: lozko, napadDwieDoby: napad });
            min = Math.min(min, v);
            max = Math.max(max, v);
          }
      expect([min, max]).toEqual([5, 65]);
      expect(fakt('wydarzenia:werbunek', 'szansa-cel')).toContain('3–33%');
      expect(s({ maCel: true, napadDwieDoby: true })).toBe(Math.round(100 * (0.05 / 2)));
      expect(fakt('wydarzenia:werbunek', 'zarzad-max')).toBe('12');
      expect(ZARZAD_MAX).toBe(12);
      expect(fakt('wydarzenia:werbunek', 'zaproszenie')).toBe(czasTickow(ZAPROS_TICKS));
      expect(fakt('wydarzenia:werbunek', 'nowy-humor')).toContain(`+${NOWY_MOOD}`);
      expect(fakt('wydarzenia:werbunek', 'nowy-humor')).toContain(czasTickow(NOWY_MOOD_TICKS));
      expect(NAPAD_PAMIEC).toBe(2 * 24 * TICKS_PER_HOUR);
    });

  it('menu mówi „Zaprosić do nas (N% szans)”, a artykuł cytuje początek tego napisu', () => {
    expect(OBCY.zaprosic(30).pl.startsWith(OBCY.zaprosicBez.pl)).toBe(true);
    expect(OBCY.zaprosic(30).en.startsWith(OBCY.zaprosicBez.en)).toBe(true);
    expect(art('wydarzenia:werbunek').zdania[0]).toContain(OBCY.zaprosicBez.pl);
    expect(art('wydarzenia:werbunek').zdania[0]).toContain(OBCY.zapytacORege.pl);
  });

  it('w domu przy pełnym zarządzie zaproszenia nie ma wcale, w bloku jest dla mieszkańca albo brak miejsca', () => {
    const dom = createSim(demoWorld('zielonki'), 5, { core: ZARZAD_MAX, mode: 'zwykly', obcy: true });
    expect(okazjaWerbunku(dom, demoWorld('zielonki')).dokad).toBe('dom');
    const w = demoWorld('przymorze');
    const blok = createSim(w, 5, { core: ZARZAD_MAX, mode: 'zwykly', obcy: true });
    expect(['mieszkaniec', 'brak']).toContain(okazjaWerbunku(blok, w).dokad);
    const wolny = createSim(w, 5, { core: 4, mode: 'zwykly', obcy: true });
    expect(okazjaWerbunku(wolny, w).dokad).toBe('zarzad');
    expect(OBCY.brakLozka.pl).toBe('Brak miejsca');
  });
});

// ---------------------------------------------------------------- ciągi kart

describe('ciągi kart', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`liczby równe tabeli LANCUCHY: ${lang}`, () => {
      ustawJezyk(lang);
      const wTrybie = (mode: GameMode) => LANCUCHY.filter((l) => (l.tryby as readonly string[]).includes(mode));
      expect(fakt('wydarzenia:lancuchy', 'ile')).toBe(`${LANCUCHY.length}`);
      expect(fakt('wydarzenia:lancuchy', 'na-gre')).toBe(`${WATKOW}`);
      expect(fakt('wydarzenia:lancuchy', 'szansa')).toBe(proc(SZANSA_KROKU));
      expect(fakt('wydarzenia:lancuchy', 'zwykly')).toBe(`${wTrybie('zwykly').length}`);
      expect(fakt('wydarzenia:lancuchy', 'zombie')).toBe(`${wTrybie('zombie').length}`);
      const wspolne = LANCUCHY.filter((l) => l.tryby.length === 2).length;
      expect(fakt('wydarzenia:lancuchy', 'wspolne')).toBe(`${wspolne}`);
      const dlugosci = LANCUCHY.map((l) => l.kroki.length);
      expect(fakt('wydarzenia:lancuchy', 'kart')).toBe(`${Math.min(...dlugosci)}–${Math.max(...dlugosci)}`);
      const po = LANCUCHY.flatMap((l) => l.kroki.filter((k) => k.nr > 1).map((k) => k.po));
      expect(fakt('wydarzenia:lancuchy', 'odstep')).toContain(`${Math.min(...po)}–${Math.max(...po)}`);
    });

  it('w jednej grze wybranych jest najwyżej WATKOW ciągów, pasujących do trybu i do obcych', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      for (let seed = 1; seed <= 25; seed++) {
        const gov = newGov(seed, mode, true);
        const wybrane = wybierzWatki(gov, mode);
        expect(wybrane.length).toBeLessThanOrEqual(WATKOW);
        expect(wybrane.length).toBe(WATKOW);
        for (const id of wybrane)
          expect((LANCUCHY.find((l) => l.id === id)!.tryby as readonly string[]).includes(mode)).toBe(true);
        const bezObcych = wybierzWatki(newGov(seed, mode, true), mode, true, true);
        for (const id of bezObcych) {
          const l = LANCUCHY.find((x) => x.id === id)!;
          expect(l.obcy).not.toBe(true);
          expect(l.lokatorzy).not.toBe(true);
          expect(l.kroki.some((k) => k.gosc)).toBe(false);
        }
      }
  });

  it('bez łańcuchów (stary zapis) nic się nie wybiera', () => {
    expect(wybierzWatki(newGov(3), 'zwykly')).toEqual([]);
  });

  it('artykuł o ciągach nie zdradza treści: nie podaje id opowieści', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const t = tekstArtykulu(art('wydarzenia:lancuchy'));
      for (const l of LANCUCHY) expect(t, l.id).not.toMatch(new RegExp(`\\b${l.id}\\b`, 'i'));
    }
  });
});

// ---------------------------------------------------------------- znajomi

describe('znajome twarze', () => {
  const wpis = (id: string, jak: keyof typeof NASTAWIENIE, dzien: number) =>
    ({
      id,
      osoba: { first: id, name: `${id} Test`, f: false, age: 30 },
      look: 4,
      kto: 'wedrowiec' as KtoId,
      jak,
      dzien,
    }) as const;

  for (const lang of ['pl', 'en'] as const)
    it(`fakty równe NASTAWIENIE i stałym powrotów: ${lang}`, () => {
      ustawJezyk(lang);
      for (const jak of Object.keys(NASTAWIENIE) as (keyof typeof NASTAWIENIE)[])
        expect(fakt('wydarzenia:znajomi', `nastawienie-${jak}`), jak).toContain(signed(NASTAWIENIE[jak], 0));
      const odprawiony = fakt('wydarzenia:znajomi', 'nastawienie-odprawiony')!;
      expect(odprawiony).toContain(signed(ODMOWA, 0));
      expect(odprawiony).toContain(`${ZAPAS_ODMOWY}`);
      expect(fakt('wydarzenia:znajomi', 'powrot-wiek')).toContain(`${POWROT_WIEK_DNI}`);
      expect(fakt('wydarzenia:znajomi', 'powrot-odstep')).toContain(`${POWROT_ODSTEP_DNI}`);
      expect(fakt('wydarzenia:znajomi', 'powrot-waga')).toBe(num(WAGA_POWROTU, 1));
      expect(fakt('wydarzenia:znajomi', 'dar-jedzenie')).toContain('2–4');
    });

  it('nastawienie sumuje się w granicach −2…+2, złapanie i wyrzucenie ustawiają −2, odprawa głodnego przy zapasach daje −1', () => {
    const gov = newGov(3);
    expect(zapamietaj(gov, wpis('a', 'nakarmiony', 3), 3).nastawienie).toBe(1);
    expect(zapamietaj(gov, wpis('a', 'nocleg', 4), 4).nastawienie).toBe(2);
    expect(zapamietaj(gov, wpis('a', 'przyjety', 5), 5).nastawienie).toBe(2);
    expect(zapamietaj(gov, wpis('a', 'zlapany', 6), 6).nastawienie).toBe(-2);
    expect(zapamietaj(gov, wpis('b', 'okradl', 3), 3).nastawienie).toBe(-1);
    expect(zapamietaj(gov, wpis('c', 'odprawiony', 3), 3).nastawienie).toBe(0);
    expect(zapamietaj(gov, wpis('d', 'odprawiony', 3), 3, { odmowa: true }).nastawienie).toBe(-1);
    expect(zapamietaj(newGov(3), wpis('e', 'wyrzucony', 3), 3).nastawienie).toBe(-2);
    expect(ODMOWA).toBe(-1);
    expect(ZAPAS_ODMOWY).toBe(5);
  });

  it('powrót: dodatnie nastawienie, niewrogie zdarzenie, po POWROT_WIEK_DNI dobach, najwyżej jeden na POWROT_ODSTEP_DNI', () => {
    const gov = newGov(3);
    zapamietaj(gov, wpis('Jan', 'nakarmiony', 3), 3);
    expect(doPowrotu(gov, 3 + POWROT_WIEK_DNI - 1, 'zwykly')).toBeNull();
    expect(doPowrotu(gov, 3 + POWROT_WIEK_DNI, 'zwykly')?.id).toBe('Jan');
    // ktoś, kto okradł albo został złapany, nie wraca jako gość
    const wrog = newGov(3);
    zapamietaj(wrog, wpis('Kra', 'okradl', 3), 3);
    zapamietaj(wrog, wpis('Zla', 'zlapany', 3), 3);
    expect(doPowrotu(wrog, 30, 'zwykly')).toBeNull();
    // po powrocie kolejny najwcześniej po POWROT_ODSTEP_DNI dobach
    const dwa = newGov(3);
    zapamietaj(dwa, wpis('Jan', 'przyjety', 1), 1);
    zapamietaj(dwa, wpis('Ewa', 'nocleg', 1), 1);
    const pierwszy = doPowrotu(dwa, 10, 'zwykly')!;
    expect(pierwszy.id).toBe('Jan');
    pierwszy.wrocil = 10;
    expect(doPowrotu(dwa, 10 + POWROT_ODSTEP_DNI - 1, 'zwykly')).toBeNull();
    expect(doPowrotu(dwa, 10 + POWROT_ODSTEP_DNI, 'zwykly')).not.toBeNull();
    // kto mieszka u nas, nie wraca
    const mieszka = newGov(3);
    zapamietaj(mieszka, { ...wpis('Jan', 'przyjety', 1), pion: 42 }, 1);
    expect(doPowrotu(mieszka, 10, 'zwykly', { ...NIKOGO, pionki: new Set([42]) })).toBeNull();
    expect(WAGA_POWROTU).toBe(2);
  });

  it('zły znajomy idzie z szabrownikami tylko w zwykłym trybie', () => {
    const gov = newGov(3);
    zapamietaj(gov, wpis('Zly', 'zlapany', 3), 3);
    expect(wrogDoNapadu(gov, 5, NIKOGO, 'zwykly')?.id).toBe('Zly');
    expect(wrogDoNapadu(gov, 5, NIKOGO, 'zombie')).toBeNull();
  });
});

// ---------------------------------------------------------------- uwaga o trybie zombie, język, dom, odnośniki

describe('uwaga o trybie zombie', () => {
  it('artykuły z uwagą zaczynają ją zgodnie z trybem gry', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      for (const d of moje) {
        const z = art(d.id, true).uwaga;
        const n = art(d.id, false).uwaga;
        if (z === undefined || n === undefined) continue;
        if (d.id === 'wydarzenia:lancuchy') {
          expect(z).toMatch(lang === 'pl' ? /^Grasz w trybie zombie/ : /^You are playing Zombie mode/);
          expect(n).toMatch(lang === 'pl' ? /^Grasz w trybie zwykłym/ : /^You are playing the normal mode/);
          continue;
        }
        expect(z, d.id).toMatch(lang === 'pl' ? /^Grasz w trybie zombie: / : /^You are playing Zombie mode: /);
        expect(n, d.id).toMatch(lang === 'pl' ? /^W trybie zombie / : /^In Zombie mode /);
      }
    }
  });

  it('uwagi mają artykuły, których zasady różnią się w trybie zombie', () => {
    const z = (id: string) => art(id).uwaga;
    for (const id of [
      'wydarzenia:karty',
      'wydarzenia:goscie',
      'wydarzenia:rodzaje',
      'wydarzenia:wybory',
      'wydarzenia:haczyk',
      'wydarzenia:handlarz',
      'wydarzenia:wedrowcy',
      'wydarzenia:werbunek',
      'wydarzenia:lancuchy',
      'wydarzenia:znajomi',
    ])
      expect(z(id), id).toBeTruthy();
  });
});

describe('język, dom i odnośniki', () => {
  for (const p of PRZYPADKI) it(`treść: ${p.opis}`, () => kontrolaTresci(p, 'wydarzenia', []));

  it('odnośniki Zobacz też prowadzą do istniejących artykułów albo do stałych identyfikatorów kategorii 4–8', () => {
    expect(kontrolaOdnosnikow('wydarzenia')).toBeGreaterThan(40);
  });

  it('angielski nie ma polskich słów także w napisach z gry, które cytuje', () => {
    ustawJezyk('en');
    for (const wariant of ['blok', 'dom'] as const)
      for (const zombie of [false, true])
        for (const d of moje) {
          const t = tekstArtykulu(artykul(d.id, kontekst(wariant, false, zombie))!);
          expect(polskieSlowa(t, []), `${d.id} ${wariant}`).toEqual([]);
        }
  });

  it('wyszukiwarka znajduje handlarza, gości, wędrowców i znajome twarze po polsku i po angielsku', () => {
    const c = kontekst('blok');
    expect(szukaj('handlarz', c)[0].id).toBe('wydarzenia:handlarz');
    expect(szukaj('wędrowcy', c).map((x) => x.id)).toContain('wydarzenia:wedrowcy');
    expect(szukaj('gość pod bramą', c)[0].id).toBe('wydarzenia:goscie');
    expect(szukaj('znajome twarze', c)[0].id).toBe('wydarzenia:znajomi');
    ustawJezyk('en');
    expect(szukaj('trader', c).map((x) => x.id)).toContain('wydarzenia:handlarz');
    expect(szukaj('wanderers', c).map((x) => x.id)).toContain('wydarzenia:wedrowcy');
    expect(szukaj('story chains', c)[0].id).toBe('wydarzenia:lancuchy');
  });
});
