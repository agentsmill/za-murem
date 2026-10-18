/* Rozliczenie wyprawy nocy (src/gov/noc.ts): ścieżka z TARGETS rozlicza się dokładnie jak przed wspólną funkcją
   (ten sam przebieg losowań, te same liczby), a rozliczenie celu z miejsca (zapas) liczy łup z ograniczeniem do zapasu
   i udźwigu. Rozliczenie idzie przez `nightTick` na ręcznie złożonym stanie nocy, bez karty i bez symulacji. */

import { describe, expect, it } from 'vitest';
import { placeIn } from '../../src/gov/miejsce.ts';
import { canGo, expRisk, nightTick, rozliczWyprawe } from '../../src/gov/noc.ts';
import { TARGETS } from '../../src/gov/tresc.ts';
import type { GameMode, GovEffects, GovInput, GovState, NightCard, StockDelta } from '../../src/gov/typy.ts';
import { emptyEffects, STOCK_KEYS, zeroStock } from '../../src/gov/wspolne.ts';
import {
  type Cel,
  celZMiejsca,
  celZTarget,
  UDZWIG_NA_OSOBE,
  wlaczMiasto,
  zostaloZMiejsca,
} from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { Atrapa } from './gov-atrapa.ts';

/** Noc z dnia 2, wyprawa `osob` pierwszych osób z atrapy już zatwierdzona do celu `targetId`; o godzinie powrotu
    (blisko 1:00, daleko 5:00) dnia 3 `nightTick` rozlicza ją raz. Zwraca stan i skutki po rozliczeniu. */
function rozliczNoc(
  seed: number,
  mode: GameMode,
  targetId: string,
  osob: number,
  wizytyPrzed = 0,
): { st: GovState; fx: GovEffects } {
  const atr = new Atrapa(seed);
  const st = newGov(seed, mode);
  if (wizytyPrzed) st.visits[targetId] = wizytyPrzed;
  const t = TARGETS.find((x) => x.id === targetId)!;
  st.night = {
    day: 2,
    card: {} as NightCard,
    assign: {},
    confirmed: true,
    raid: null,
    exp: [{ key: targetId, ids: atr.people.slice(0, osob).map((p) => p.id), target: targetId }],
    lines: [],
    hurt: [],
    t0: st.trust,
    a0: st.anger,
    returned: [],
    loot: zeroStock(),
    slept: [],
  };
  const fx = emptyEffects();
  nightTick(st, { ...atr.input(), day: 3, hour: t.back, minute: 0 }, fx);
  return { st, fx };
}

/** to, co rozliczenie zostawia w stanie: ziarno losowań po nim, łup, rany (zmiana zdrowia), ugryzienia, znaleziska,
    wizyty i liczba osób, które wróciły */
function slad({ st, fx }: ReturnType<typeof rozliczNoc>) {
  const n = st.night!;
  return {
    rng: st.rng.s,
    loot: n.loot,
    rany: n.hurt.map((h) => h.d),
    pogryzieni: fx.bitten?.length ?? 0,
    amunicja: fx.ammo ?? null,
    bron: fx.arms ?? null,
    wizyty: st.visits,
    wrocilo: fx.back.length,
  };
}

/* Stałe poniżej zapisano z uruchomienia na kodzie sprzed wspólnej funkcji (`returnExp` z ciałem rozliczenia w środku):
   ziarno losowań po rozliczeniu, łup, rany i znaleziska. Ten sam przebieg losowań w tej samej kolejności daje te same
   liczby, więc refaktor, który nie ruszył ścieżki z TARGETS, przechodzi ten test przed zmianą i po niej. */
const PRZYPADKI: {
  opis: string;
  mode: GameMode;
  seed: number;
  cel: string;
  osob: number;
  wizyty: number;
  oczekiwane: ReturnType<typeof slad>;
}[] = [
  {
    opis: 'blisko, jedna osoba, spokojnie',
    mode: 'zwykly',
    seed: 1,
    cel: 'mieszkania',
    osob: 1,
    wizyty: 0,
    oczekiwane: {
      rng: -116473308,
      loot: { wood: 2, supplies: 3, scrap: 0, parts: 0, meds: 0 },
      rany: [],
      pogryzieni: 0,
      amunicja: null,
      bron: null,
      wizyty: { mieszkania: 1 },
      wrocilo: 1,
    },
  },
  {
    opis: 'dwie osoby, kłopoty (rana), połowa łupu',
    mode: 'zwykly',
    seed: 6,
    cel: 'apteka',
    osob: 2,
    wizyty: 0,
    oczekiwane: {
      rng: -748308983,
      loot: { wood: 0, supplies: 1, scrap: 0, parts: 0, meds: 2 },
      rany: [-26],
      pogryzieni: 0,
      amunicja: null,
      bron: null,
      wizyty: { apteka: 1 },
      wrocilo: 2,
    },
  },
  {
    opis: 'daleko, trzy osoby, mnożnik 1,6',
    mode: 'zwykly',
    seed: 1,
    cel: 'pawilon',
    osob: 3,
    wizyty: 0,
    oczekiwane: {
      rng: 1715092505,
      loot: { wood: 0, supplies: 5, scrap: 5, parts: 2, meds: 0 },
      rany: [],
      pogryzieni: 0,
      amunicja: null,
      bron: null,
      wizyty: { pawilon: 1 },
      wrocilo: 3,
    },
  },
  {
    opis: 'po trzech wizytach łup maleje (mnożnik 0,55)',
    mode: 'zwykly',
    seed: 1,
    cel: 'garaze',
    osob: 1,
    wizyty: 3,
    oczekiwane: {
      rng: -116473308,
      loot: { wood: 1, supplies: 0, scrap: 2, parts: 0, meds: 0 },
      rany: [],
      pogryzieni: 0,
      amunicja: null,
      bron: null,
      wizyty: { garaze: 4 },
      wrocilo: 1,
    },
  },
  {
    opis: 'zombie: ugryzienie i kij ze znaleziska',
    mode: 'zombie',
    seed: 1,
    cel: 'apteka',
    osob: 1,
    wizyty: 0,
    oczekiwane: {
      rng: -1380144648,
      loot: { wood: 0, supplies: 1, scrap: 0, parts: 0, meds: 0 },
      rany: [-34],
      pogryzieni: 1,
      amunicja: null,
      bron: ['kij'],
      wizyty: { apteka: 1 },
      wrocilo: 1,
    },
  },
  {
    opis: 'zombie, daleko, dwie osoby, spokojnie',
    mode: 'zombie',
    seed: 4,
    cel: 'stacja',
    osob: 2,
    wizyty: 0,
    oczekiwane: {
      rng: 1715092502,
      loot: { wood: 6, supplies: 3, scrap: 0, parts: 2, meds: 0 },
      rany: [],
      pogryzieni: 0,
      amunicja: null,
      bron: null,
      wizyty: { stacja: 1 },
      wrocilo: 2,
    },
  },
  {
    opis: 'zombie: belty i kusza ze znalezisk',
    mode: 'zombie',
    seed: 2,
    cel: 'mieszkania',
    osob: 1,
    wizyty: 0,
    oczekiwane: {
      rng: -748308979,
      loot: { wood: 2, supplies: 1, scrap: 0, parts: 0, meds: 0 },
      rany: [],
      pogryzieni: 0,
      amunicja: { belty: 9 },
      bron: ['kusza'],
      wizyty: { mieszkania: 1 },
      wrocilo: 1,
    },
  },
  {
    opis: 'kłopoty i puste ręce',
    mode: 'zwykly',
    seed: 7,
    cel: 'apteka',
    osob: 1,
    wizyty: 0,
    oczekiwane: {
      rng: -748308984,
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      rany: [-25],
      pogryzieni: 0,
      amunicja: null,
      bron: null,
      wizyty: { apteka: 1 },
      wrocilo: 1,
    },
  },
];

describe('rozliczenie wyprawy nocy z TARGETS (charakterystyka sprzed wspólnej funkcji)', () => {
  for (const p of PRZYPADKI)
    it(p.opis, () => {
      expect(slad(rozliczNoc(p.seed, p.mode, p.cel, p.osob, p.wizyty))).toEqual(p.oczekiwane);
    });

  it('cel z TARGETS nie dokłada stanu miasta do zarządu', () => {
    const { st } = rozliczNoc(1, 'zwykly', 'pawilon', 2);
    expect(st.miasto).toBeUndefined();
  });
});

// ---------------------------------------------------------------- bezpośrednio przez rozliczWyprawe

/** wejście zarządu z atrapy (dzień 3, godzina powrotu) i `osob` pierwszych osób */
function wejscie(seed: number, osob: number): { i: GovInput; ppl: GovInput['people'] } {
  const atr = new Atrapa(seed);
  const i: GovInput = { ...atr.input(), day: 3, hour: 1, minute: 0 };
  return { i, ppl: i.people.slice(0, osob) };
}

const suma = (d: StockDelta): number => STOCK_KEYS.reduce((s, k) => s + d[k], 0);

/** cel z miejsca: sklep spożywczy 100 m od adresu, łup rozdęty do 10–14 sztuk jednego rodzaju, żeby zapas i udźwig
    zawsze coś ucinały; `ryzyko` ustawiane w teście */
function celZZapasem(zapas: number, ryzyko = 0, klucz = 'poi:100:200'): Cel {
  const cel = celZMiejsca({ klucz, kat: 'spozywczy', x: 100, y: 0, odl: 100, nazwa: '' });
  return { ...cel, ryzyko, lup: { supplies: [10, 14] }, zapas };
}

const rozlicz = (st: GovState, seed: number, osob: number, cel: Cel) => {
  const { i, ppl } = wejscie(seed, osob);
  const fx = emptyEffects();
  const r = rozliczWyprawe(st, i, fx, cel, ppl);
  return { r, fx, i, ppl };
};

describe('rozliczWyprawe: cel z TARGETS', () => {
  it('daje to samo co nightTick: te same losowania, łup i wizyty', () => {
    // stałe z przypadku „blisko, jedna osoba, spokojnie” wyżej (seed 1, mieszkania)
    const st = newGov(1, 'zwykly');
    const { i, ppl } = wejscie(1, 1);
    const fx = emptyEffects();
    const r = rozliczWyprawe(st, i, fx, celZTarget(TARGETS.find((t) => t.id === 'mieszkania')!, placeIn(i)), ppl);
    expect(st.rng.s).toBe(-116473308);
    expect(r.loot).toEqual({ wood: 2, supplies: 3, scrap: 0, parts: 0, meds: 0 });
    expect(fx.stock).toEqual(r.loot);
    expect(st.visits).toEqual({ mieszkania: 1 });
    expect(r.hurt).toBeNull();
    expect(fx.back).toEqual([ppl[0].id]);
    expect(st.miasto).toBeUndefined();
  });

  it('łup maleje z wizytami', () => {
    const lup = (wizyty: number): number => {
      const st = newGov(1, 'zwykly');
      if (wizyty) st.visits.garaze = wizyty;
      const { i, ppl } = wejscie(1, 1);
      const cel = celZTarget(TARGETS.find((t) => t.id === 'garaze')!, placeIn(i));
      return suma(rozliczWyprawe(st, i, emptyEffects(), cel, ppl).loot);
    };
    expect(lup(0)).toBeGreaterThan(lup(8));
  });

  it('napisy po polsku i po angielsku niepuste, a rany tylko przy kłopotach', () => {
    let kłopoty = 0;
    let spokojnie = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const st = newGov(seed, 'zwykly');
      const { i, ppl } = wejscie(seed, 2);
      const fx = emptyEffects();
      const cel = celZTarget(TARGETS.find((t) => t.id === 'stacja')!, placeIn(i));
      const r = rozliczWyprawe(st, i, fx, cel, ppl);
      expect(r.lines.length).toBeGreaterThan(0);
      for (const l of r.lines) {
        expect(l.pl.length).toBeGreaterThan(0);
        expect(l.en.length).toBeGreaterThan(0);
      }
      const zdrowie = fx.needs.filter((n) => n.d.health !== undefined);
      if (r.hurt) {
        kłopoty++;
        expect(r.hurt.d).toBeLessThanOrEqual(-20);
        expect(r.hurt.d).toBeGreaterThanOrEqual(-35);
        expect(zdrowie).toEqual([{ id: r.hurt.id, d: { health: r.hurt.d, rest: -30 } }]);
      } else {
        spokojnie++;
        expect(zdrowie).toEqual([]);
      }
    }
    expect(kłopoty).toBeGreaterThan(0);
    expect(spokojnie).toBeGreaterThan(0);
  });
});

describe('rozliczWyprawe: cel z miejsca (zapas)', () => {
  it('łup nie przekracza zapasu ani udźwigu, a zabrane rośnie o sumę łupu', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const st = newGov(seed, 'zwykly');
      wlaczMiasto(st);
      const cel = celZZapasem(12, 5);
      const { r, fx } = rozlicz(st, seed, 2, cel);
      expect(suma(r.loot)).toBeLessThanOrEqual(Math.min(12, UDZWIG_NA_OSOBE * 2));
      expect(suma(r.loot)).toBe(suma(fx.stock));
      expect(st.miasto!.zabrano[cel.klucz]).toBe(suma(r.loot));
      expect(st.miasto!.wizyty[cel.klucz]).toBe(1);
      expect(st.miasto!.ostatnia[cel.klucz]).toBe(3);
    }
  });

  it('bez kłopotów dwie osoby unoszą dwanaście sztuk, jedna sześć', () => {
    const dwie = rozlicz(newGov(1, 'zwykly'), 1, 2, celZZapasem(40));
    expect(dwie.r.hurt).toBeNull();
    expect(dwie.r.loot.supplies).toBe(12);
    const jedna = rozlicz(newGov(1, 'zwykly'), 1, 1, celZZapasem(40));
    expect(jedna.r.hurt).toBeNull();
    expect(jedna.r.loot.supplies).toBe(6);
  });

  it('przy kłopotach łup z miejsca też jest ucięty do zapasu', () => {
    let kłopoty = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const st = newGov(seed, 'zwykly');
      const { r } = rozlicz(st, seed, 2, celZZapasem(3, 5));
      if (r.hurt) kłopoty++;
      expect(suma(r.loot)).toBeLessThanOrEqual(3);
    }
    expect(kłopoty).toBeGreaterThan(0);
  });

  it('kolejne rozliczenia do tego samego miejsca wynoszą najwyżej to, co zostało', () => {
    const st = newGov(3, 'zwykly');
    const cel = celZZapasem(15);
    const wyniesione: number[] = [];
    for (let k = 0; k < 4; k++) {
      const przed = zostaloZMiejsca(st, cel);
      const { r } = rozlicz(st, 3 + k, 2, cel);
      expect(suma(r.loot)).toBeLessThanOrEqual(przed);
      for (const key of STOCK_KEYS) expect(r.loot[key]).toBeGreaterThanOrEqual(0);
      wyniesione.push(suma(r.loot));
    }
    expect(wyniesione.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(15);
    expect(st.miasto!.zabrano[cel.klucz]).toBe(wyniesione.reduce((a, b) => a + b, 0));
    expect(st.miasto!.wizyty[cel.klucz]).toBe(4);
    expect(zostaloZMiejsca(st, cel)).toBe(15 - st.miasto!.zabrano[cel.klucz]);
  });

  it('puste miejsce daje zerowy łup, bez wartości ujemnych i bez zabranego', () => {
    for (const zabranoJuz of [0, 12, 20]) {
      const st = newGov(2, 'zwykly');
      wlaczMiasto(st);
      const cel = celZZapasem(zabranoJuz === 0 ? 0 : 12);
      st.miasto!.zabrano[cel.klucz] = zabranoJuz;
      const { r, fx } = rozlicz(st, 2, 2, cel);
      for (const key of STOCK_KEYS) {
        expect(r.loot[key]).toBe(0);
        expect(fx.stock[key]).toBe(0);
      }
      expect(st.miasto!.zabrano[cel.klucz]).toBe(zabranoJuz);
      expect(st.miasto!.wizyty[cel.klucz]).toBe(1);
      expect(r.lines.length).toBeGreaterThan(0);
    }
  });

  it('bez stanu miasta rozliczenie samo go zakłada, a miejsca liczą się osobno', () => {
    const st = newGov(1, 'zwykly');
    expect(st.miasto).toBeUndefined();
    rozlicz(st, 1, 1, celZZapasem(40, 0, 'poi:1:1'));
    rozlicz(st, 2, 1, celZZapasem(40, 0, 'poi:2:2'));
    expect(Object.keys(st.miasto!.wizyty).sort()).toEqual(['poi:1:1', 'poi:2:2']);
    expect(st.visits).toEqual({});
  });

  it('powrót i spadek sił jak dziś: blisko -15, daleko -30', () => {
    for (const [range, rest] of [
      ['blisko', -15],
      ['daleko', -30],
    ] as const) {
      const { fx, ppl } = rozlicz(newGov(1, 'zwykly'), 1, 2, { ...celZZapasem(40), range });
      expect(fx.back).toEqual(ppl.map((p) => p.id));
      expect(fx.needs.map((n) => n.d.rest)).toEqual([rest, rest]);
    }
  });

  it('bez ludzi nic się nie losuje i nic się nie zmienia', () => {
    const st = newGov(1, 'zwykly');
    const przed = JSON.stringify(st);
    const { r, fx } = rozlicz(st, 1, 0, celZZapasem(40));
    expect(r).toEqual({ lines: [], hurt: null, loot: zeroStock() });
    expect(fx).toEqual(emptyEffects());
    expect(JSON.stringify(st)).toBe(przed);
  });
});

describe('expRisk i canGo przyjmują same pola celu', () => {
  const { i } = wejscie(1, 1);
  const p = i.people[0];

  it('expRisk bierze ryzyko z celu i ucina do 0,9', () => {
    const st = newGov(1, 'zwykly');
    expect(expRisk(st, p, { ryzyko: 0.2 })).toBeCloseTo(0.2, 2);
    expect(expRisk(st, p, { ryzyko: 5 })).toBe(0.9);
    expect(expRisk(st, p, { ryzyko: 0.2 }, 2)).toBeLessThan(expRisk(st, p, { ryzyko: 0.2 }));
  });

  it('canGo patrzy na zasięg celu', () => {
    const zmeczony = { ...p, needs: { ...p.needs, rest: 30 } };
    expect(canGo(zmeczony, { range: 'blisko' })).toBe(true);
    expect(canGo(zmeczony, { range: 'daleko' })).toBe(false);
    expect(canGo({ ...p, bitten: true }, { range: 'blisko' })).toBe(false);
  });
});
