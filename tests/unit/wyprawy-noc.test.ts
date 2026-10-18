/* Rozliczenie wyprawy nocy (src/gov/noc.ts): ścieżka z TARGETS rozlicza się dokładnie jak przed wspólną funkcją
   (ten sam przebieg losowań, te same liczby), a rozliczenie celu z miejsca (zapas) liczy łup z ograniczeniem do zapasu
   i udźwigu. Rozliczenie idzie przez `nightTick` na ręcznie złożonym stanie nocy, bez karty i bez symulacji.
   Na końcu karta nocy z miejscami z okolicy: wybór celów (`wybierzCeleNocy`), opcje karty, osoby na wyprawie,
   powrót i raport w pełnym przebiegu na atrapie oraz stare grupy wypraw bez `cel`. */

import { describe, expect, it } from 'vitest';
import { placeIn } from '../../src/gov/miejsce.ts';
import { canGo, confirm, expRisk, makeCard, nightTick, rozliczWyprawe } from '../../src/gov/noc.ts';
import { TARGETS } from '../../src/gov/tresc.ts';
import type { GameMode, GovEffects, GovInput, GovState, NightCard, StockDelta } from '../../src/gov/typy.ts';
import { emptyEffects, STOCK_KEYS, zeroStock } from '../../src/gov/wspolne.ts';
import {
  type Cel,
  celeZTargets,
  celZMiejsca,
  celZTarget,
  UDZWIG_NA_OSOBE,
  wlaczMiasto,
  wybierzCeleNocy,
  zostaloZMiejsca,
} from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import { Atrapa, at, run } from './gov-atrapa.ts';

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

// ---------------------------------------------------------------- karta nocy z miejscami z okolicy

/** miejsce w linii prostej na wschód od adresu (x = odległość, y = 0); klucz „poi:N:7”. Zapas startowy zależy tylko od
    klucza: N = 7, 9, 10, 17, 21, 22, 25… to miejsca puste od lat (zapas 0), reszta z numerów 1–40 ma zapas powyżej 0 */
const miejsce = (n: number, kat: string, odl: number, nazwa = ''): Miejsce => ({
  klucz: `poi:${n}:7`,
  kat,
  x: odl,
  y: 0,
  odl,
  nazwa,
});
const PUSTE = 7;

/** zarząd z włączoną mapą miasta */
function zarzadMiasta(seed = 1): GovState {
  const st = newGov(seed, 'zwykly');
  wlaczMiasto(st);
  return st;
}

/** wejście z atrapy o 20:00 z okolicą i zapasami jedzenia, leków i części */
function wejscieOkolicy(okolica: Miejsce[] | undefined, stock: Partial<GovInput['stock']> = {}, seed = 1): GovInput {
  const i = new Atrapa(seed).input();
  return { ...i, hour: 20, minute: 0, ...(okolica ? { okolica } : {}), stock: { ...i.stock, ...stock } };
}

const klucze = (cele: Cel[]): string[] => cele.map((c) => c.klucz);

describe('wybierzCeleNocy', () => {
  const okolica = [
    miejsce(1, 'szkola', 100),
    miejsce(2, 'apteka', 250),
    miejsce(3, 'spozywczy', 500),
    miejsce(4, 'apteka', 600),
  ];

  it('miejsca z kluczami z testu mają zapas, a puste klucze nie', () => {
    for (const m of okolica) expect(celZMiejsca(m).zapas).toBeGreaterThan(0);
    expect(celZMiejsca(miejsce(PUSTE, 'apteka', 250)).zapas).toBe(0);
  });

  it('blisko to najbliższe miejsce poza mapą lokalną (do 300 m), szkoła z mapy lokalnej nie jest propozycją', () => {
    const [blisko] = wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy(okolica));
    expect(blisko.klucz).toBe('poi:2:7');
    expect(blisko.kat).toBe('apteka');
    expect(blisko.odl).toBe(250);
    expect(blisko.range).toBe('blisko');
    expect(blisko.zapas).not.toBeNull();
  });

  it('daleko bierze miejsce z największym brakiem: przy braku jedzenia sklep spożywczy', () => {
    const cele = wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy(okolica, { supplies: 0, meds: 50 }));
    expect(klucze(cele)).toEqual(['poi:2:7', 'poi:3:7']);
    expect(cele[1].range).toBe('daleko');
    expect(cele[1].powrot).toBe(5);
  });

  it('przy braku leków apteka 600 m (a szkoła 100 m nigdy)', () => {
    const cele = wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy(okolica, { supplies: 50, meds: 0 }));
    expect(klucze(cele)).toEqual(['poi:2:7', 'poi:4:7']);
    for (const stock of [
      { supplies: 0, meds: 0 },
      { supplies: 50, meds: 50 },
      { supplies: 3, meds: 0 },
    ])
      expect(klucze(wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy(okolica, stock)))).not.toContain('poi:1:7');
  });

  it('miejsce wybrane jako blisko nie jest jednocześnie daleko', () => {
    // sama apteka 250 m ma największy brak leków, ale jest już „blisko”
    const cele = wybierzCeleNocy(
      zarzadMiasta(),
      wejscieOkolicy([miejsce(2, 'apteka', 250), miejsce(3, 'spozywczy', 500)], { supplies: 50, meds: 0 }),
    );
    expect(klucze(cele)).toEqual(['poi:2:7', 'poi:3:7']);
  });

  it('daleko liczy tylko jedzenie, leki i części: drewno i złom się nie liczą', () => {
    // kościół daje samo drewno (brak go przy zerowym zapasie), garaże złom, trochę części i drewna
    const i = wejscieOkolicy([miejsce(2, 'apteka', 250), miejsce(3, 'kosciol', 400), miejsce(4, 'garaz', 600)], {
      wood: 0,
      scrap: 100,
      parts: 0,
      supplies: 100,
      meds: 100,
    });
    expect(klucze(wybierzCeleNocy(zarzadMiasta(), i))).toEqual(['poi:2:7', 'poi:4:7']);
  });

  it('remis rozstrzyga mniejsza odległość, potem klucz, bez względu na kolejność w okolicy', () => {
    const dalekie = [miejsce(5, 'spozywczy', 450), miejsce(3, 'spozywczy', 450), miejsce(6, 'spozywczy', 500)];
    const blisko = miejsce(2, 'apteka', 250);
    for (const kolejnosc of [
      [blisko, ...dalekie],
      [...dalekie.reverse(), blisko],
    ])
      expect(klucze(wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy(kolejnosc)))).toEqual(['poi:2:7', 'poi:3:7']);
    // mniejsza odległość wygrywa z kluczem
    expect(
      klucze(
        wybierzCeleNocy(
          zarzadMiasta(),
          wejscieOkolicy([blisko, miejsce(3, 'spozywczy', 520), miejsce(6, 'spozywczy', 480)]),
        ),
      ),
    ).toEqual(['poi:2:7', 'poi:6:7']);
  });

  it('brak miejsca blisko (do 300 m): najbliższe poza kołem do 720 m, a drugie jako daleko', () => {
    const cele = wybierzCeleNocy(
      zarzadMiasta(),
      wejscieOkolicy([miejsce(3, 'spozywczy', 700), miejsce(2, 'apteka', 400), miejsce(1, 'szkola', 150)]),
    );
    expect(klucze(cele)).toEqual(['poi:2:7', 'poi:3:7']);
    expect(cele[0].range).toBe('daleko');
    expect(cele[0].powrot).toBe(5);
  });

  it('miejsce 193 m jest poza mapą lokalną, 192 m jeszcze na niej; 720 m wchodzi, 721 m nie', () => {
    const [blisko] = wybierzCeleNocy(
      zarzadMiasta(),
      wejscieOkolicy([miejsce(1, 'apteka', 192), miejsce(2, 'apteka', 193)]),
    );
    expect(blisko.klucz).toBe('poi:2:7');
    const [wDalekim] = wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy([miejsce(1, 'apteka', 720)]));
    expect(wDalekim.klucz).toBe('poi:1:7');
    const [zaDaleko] = wybierzCeleNocy(zarzadMiasta(), wejscieOkolicy([miejsce(1, 'apteka', 721)]));
    expect(zaDaleko.zapas).toBeNull();
  });

  it('jedno miejsce: blisko z okolicy, daleko z dzisiejszych TARGETS', () => {
    const st = zarzadMiasta();
    const i = wejscieOkolicy([miejsce(2, 'apteka', 250)]);
    const cele = wybierzCeleNocy(st, i);
    expect(cele[0].klucz).toBe('poi:2:7');
    expect(cele[1]).toEqual(celeZTargets(st, placeIn(i))[1]);
    expect(cele[1].zapas).toBeNull();
  });

  it('wyczerpane miejsce odpada: blisko jest następne, a bez następnego cele z TARGETS', () => {
    const st = zarzadMiasta();
    const apteka = miejsce(2, 'apteka', 250);
    st.miasto!.zabrano[apteka.klucz] = celZMiejsca(apteka).zapas!;
    const dalsze = wybierzCeleNocy(st, wejscieOkolicy([apteka, miejsce(3, 'spozywczy', 260)]));
    expect(dalsze[0].klucz).toBe('poi:3:7');
    expect(dalsze[1].zapas).toBeNull();
    const i = wejscieOkolicy([apteka]);
    expect(wybierzCeleNocy(st, i)).toEqual(celeZTargets(st, placeIn(i)));
  });

  it('miejsce, do którego idzie wyprawa dzienna, nie jest propozycją nocy (obie wyprawy nie biorą jednego zapasu)', () => {
    const st = zarzadMiasta();
    const apteka = miejsce(2, 'apteka', 250);
    st.wyprawy = [{ id: 1, cel: celZMiejsca(apteka), ids: ['a'], wyjscie: 600, powrot: 800 }];
    const [blisko] = wybierzCeleNocy(st, wejscieOkolicy([apteka, miejsce(3, 'spozywczy', 260)]));
    expect(blisko.klucz).toBe('poi:3:7');
    // wyprawa do innego miejsca niczego nie zabiera z propozycji
    st.wyprawy[0].cel = celZMiejsca(miejsce(4, 'apteka', 600));
    expect(wybierzCeleNocy(st, wejscieOkolicy([apteka, miejsce(3, 'spozywczy', 260)]))[0].klucz).toBe('poi:2:7');
  });

  describe('bez miejsc do wyboru karta ma dzisiejsze TARGETS, bez wyjątku', () => {
    const dzisiejsze = (st: GovState, i: GovInput): Cel[] => {
      const best = (r: 'blisko' | 'daleko') =>
        TARGETS.filter((t) => t.range === r).sort((a, b) => (st.visits[a.id] ?? 0) - (st.visits[b.id] ?? 0))[0];
      return [celZTarget(best('blisko'), placeIn(i)), celZTarget(best('daleko'), placeIn(i))];
    };
    const przypadki: [string, () => { st: GovState; i: GovInput }][] = [
      ['bez okolicy', () => ({ st: zarzadMiasta(), i: wejscieOkolicy(undefined) })],
      ['pusta okolica', () => ({ st: zarzadMiasta(), i: wejscieOkolicy([]) })],
      [
        'bez stanu miasta',
        () => ({
          st: newGov(1, 'zwykly'),
          i: wejscieOkolicy([miejsce(2, 'apteka', 250), miejsce(3, 'spozywczy', 500)]),
        }),
      ],
      [
        'miejsca tylko na mapie lokalnej',
        () => ({ st: zarzadMiasta(), i: wejscieOkolicy([miejsce(1, 'szkola', 100), miejsce(2, 'apteka', 192)]) }),
      ],
      [
        'miejsca tylko z zerowym zapasem',
        () => ({
          st: zarzadMiasta(),
          i: wejscieOkolicy([miejsce(PUSTE, 'apteka', 250), miejsce(9, 'spozywczy', 500)]),
        }),
      ],
      ['miejsca tylko za daleko', () => ({ st: zarzadMiasta(), i: wejscieOkolicy([miejsce(1, 'apteka', 800)]) })],
    ];
    for (const [opis, zloz] of przypadki)
      it(opis, () => {
        const { st, i } = zloz();
        const cele = wybierzCeleNocy(st, i);
        expect(cele).toEqual(dzisiejsze(st, i));
        expect(klucze(cele)).toEqual(['mieszkania', 'pawilon']);
        expect(cele.every((c) => c.zapas === null)).toBe(true);
      });

    it('wybór z TARGETS idzie według wizyt, jak dotąd', () => {
      const st = zarzadMiasta();
      st.visits = { mieszkania: 2, pawilon: 1, stacja: 1 };
      const i = wejscieOkolicy(undefined);
      expect(klucze(wybierzCeleNocy(st, i))).toEqual(['garaze', 'apteka']);
      expect(wybierzCeleNocy(st, i)).toEqual(dzisiejsze(st, i));
    });
  });
});

describe('karta nocy z miejscami z okolicy', () => {
  const okolica = [miejsce(1, 'szkola', 100), miejsce(2, 'apteka', 250), miejsce(3, 'spozywczy', 500)];

  const opcjeWypraw = (card: NightCard, k = 0) => card.people[k].options.filter((o) => o.key.startsWith('wyprawa:'));

  it('opcje wyprawy mają klucze blisko i daleko, cel miejsca i nazwę z odległością w obu językach', () => {
    const { card } = makeCard(zarzadMiasta(), wejscieOkolicy(okolica, { supplies: 0 }));
    const [blisko, daleko] = opcjeWypraw(card);
    expect([blisko.key, daleko.key]).toEqual(['wyprawa:blisko', 'wyprawa:daleko']);
    expect([blisko.target, daleko.target]).toEqual(['poi:2:7', 'poi:3:7']);
    expect([blisko.cel?.klucz, daleko.cel?.klucz]).toEqual(['poi:2:7', 'poi:3:7']);
    expect(blisko.label).toEqual({ pl: 'Wyprawa blisko: Apteka, 250 m', en: 'Short run: Pharmacy, 250 m' });
    expect(daleko.label).toEqual({ pl: 'Wyprawa daleko: Sklep spożywczy, 500 m', en: 'Long run: Food shop, 500 m' });
    expect(blisko.note?.pl).toContain('1:00');
    expect(daleko.note?.pl).toContain('świcie');
  });

  it('nazwa własna miejsca idzie w nawiasie po kategorii, a odległość za nią', () => {
    const { card } = makeCard(zarzadMiasta(), wejscieOkolicy([miejsce(2, 'apteka', 250, 'Pod Orłem')]));
    expect(opcjeWypraw(card)[0].label).toEqual({
      pl: 'Wyprawa blisko: Apteka (Pod Orłem), 250 m',
      en: 'Short run: Pharmacy (Pod Orłem), 250 m',
    });
  });

  it('łup na karcie jest przycięty do tego, co zostało w miejscu, i do udźwigu jednej osoby', () => {
    const st = zarzadMiasta();
    const apteka = miejsce(2, 'apteka', 250);
    st.miasto!.zabrano[apteka.klucz] = celZMiejsca(apteka).zapas! - 2;
    const [blisko, daleko] = opcjeWypraw(makeCard(st, wejscieOkolicy([apteka, miejsce(3, 'spozywczy', 500)])).card);
    // leki 1–3 przy dwóch sztukach w miejscu: 1–2; jedzenie 3–7 przy udźwigu 6: 3–6
    expect(blisko.gain).toEqual({ meds: [1, 2] });
    expect(daleko.gain).toEqual({ supplies: [3, UDZWIG_NA_OSOBE] });
  });

  it('ryzyko opcji liczy się z ryzyka celu przez expRisk', () => {
    const i = wejscieOkolicy(okolica);
    const st = zarzadMiasta();
    const [blisko] = opcjeWypraw(makeCard(st, i).card);
    expect(blisko.risk).toBe(expRisk(st, i.people[0], celZMiejsca(okolica[1])));
  });

  it('bez okolicy karta ma dzisiejsze opcje: cele z TARGETS z ich nazwami', () => {
    const [blisko, daleko] = opcjeWypraw(makeCard(zarzadMiasta(), wejscieOkolicy(undefined)).card);
    expect([blisko.target, daleko.target]).toEqual(['mieszkania', 'pawilon']);
    expect(blisko.cel?.zapas).toBeNull();
    expect(blisko.label.pl).toBe('Wyprawa blisko: opuszczone mieszkania w bloku obok');
    expect(blisko.label.pl).not.toMatch(/\d+ m$/);
  });

  it('osoba na wyprawie ma tylko sen z notatką, a zarząd nie daje jej warty ani wyprawy', () => {
    for (const mode of ['zombie', 'zwykly'] as const) {
      const st = newGov(1, mode);
      wlaczMiasto(st);
      const i = wejscieOkolicy(okolica, { supplies: 0, wood: 0, woodLoose: 0, woodSklad: 0 });
      // najlepsza kandydatka na wartę i wyprawę: wypoczęta, z obroną, ale poza mapą
      i.people = i.people.map((p, k) =>
        k === 0
          ? { ...p, away: true, needs: { ...p.needs, rest: 100 }, skills: { ...p.skills, obrona: 3 } }
          : { ...p, needs: { ...p.needs, rest: 70 } },
      );
      const { card, assign } = makeCard(st, i);
      const nieobecna = card.people[0];
      expect(nieobecna.options.map((o) => o.key)).toEqual(['sen']);
      expect(nieobecna.options[0].ok).toBe(true);
      expect(nieobecna.options[0].note?.pl).toMatch(/wyprawie/);
      expect(nieobecna.options[0].note?.en).toMatch(/supply run/);
      expect(nieobecna.proposal).toBe('sen');
      expect(assign[i.people[0].id]).toBe('sen');
      // pozostali nadal dostają swoje opcje i zarząd kogoś wysyła
      expect(card.people[1].options.length).toBeGreaterThan(1);
      expect(Object.values(assign).some((k) => k !== 'sen')).toBe(true);
    }
  });
});

/** noc z kartą z `makeCard` (dzień 1), w której pierwsza osoba idzie na `opcja`, reszta śpi; zatwierdzona jak przez `confirm` */
function zatwierdzNoc(
  okolica: Miejsce[] | undefined,
  opcja: 'wyprawa:blisko' | 'wyprawa:daleko',
  bezCel = false,
): { st: GovState; fx: GovEffects; id: string } {
  const st = zarzadMiasta();
  const i = wejscieOkolicy(okolica, { supplies: 0 });
  const { card, assign } = makeCard(st, i);
  // karta zapisana przed mapą miasta nie ma opisu celu w opcjach
  if (bezCel) for (const cp of card.people) for (const o of cp.options) delete o.cel;
  const id = i.people[0].id;
  // propozycja zarządu zostawiona na boku: tylko pierwsza osoba na wyprawie, reszta śpi
  for (const k of Object.keys(assign)) assign[k] = 'sen';
  assign[id] = opcja;
  st.night = {
    day: 1,
    card,
    assign,
    confirmed: false,
    raid: null,
    exp: [],
    lines: [],
    hurt: [],
    t0: st.trust,
    a0: st.anger,
    returned: [],
    loot: zeroStock(),
    slept: [],
  };
  const fx = emptyEffects();
  confirm(st, i, fx, false);
  return { st, fx, id };
}

describe('zatwierdzenie karty z celem', () => {
  const okolica = [miejsce(2, 'apteka', 250), miejsce(3, 'spozywczy', 500)];

  it('grupa wyprawy kopiuje cel z opcji, a wyjście ludzi jest na godzinę powrotu celu', () => {
    for (const [opcja, klucz, godzina] of [
      ['wyprawa:blisko', 'poi:2:7', 1],
      ['wyprawa:daleko', 'poi:3:7', 5],
    ] as const) {
      const { st, fx, id } = zatwierdzNoc(okolica, opcja);
      expect(st.night!.exp).toHaveLength(1);
      const grupa = st.night!.exp[0];
      expect([grupa.key, grupa.target, grupa.ids]).toEqual([klucz, klucz, [id]]);
      expect(grupa.cel?.klucz).toBe(klucz);
      expect(grupa.cel?.powrot).toBe(godzina);
      expect(fx.away).toEqual([{ id, day: 2, hour: godzina }]);
    }
  });

  it('karta bez okolicy: grupa z TARGETS też dostaje cel, a godzina powrotu jest ta sama co dotąd', () => {
    const { st, fx, id } = zatwierdzNoc(undefined, 'wyprawa:daleko');
    expect(st.night!.exp[0].target).toBe('pawilon');
    expect(st.night!.exp[0].cel?.zapas).toBeNull();
    expect(fx.away).toEqual([{ id, day: 2, hour: TARGETS.find((t) => t.id === 'pawilon')!.back }]);
  });

  it('karta sprzed zmiany (opcje bez cel): grupa bez cel, godzina i cel z TARGETS po id', () => {
    const { st, fx, id } = zatwierdzNoc(undefined, 'wyprawa:blisko', true);
    expect(st.night!.exp).toEqual([{ key: 'mieszkania', ids: [id], target: 'mieszkania' }]);
    expect(fx.away).toEqual([{ id, day: 2, hour: 1 }]);
  });
});

// ---------------------------------------------------------------- powrót i raport

/** noc z dnia 2 z zatwierdzoną grupą wyprawy (`cel` w grupie albo bez, jak w zapisie sprzed zmiany) */
function nocZGrupa(osob: number, target: string, cel?: Cel): { st: GovState; ids: string[]; atr: Atrapa } {
  const atr = new Atrapa(1);
  const st = zarzadMiasta();
  const ids = atr.people.slice(0, osob).map((p) => p.id);
  st.night = {
    day: 2,
    card: {} as NightCard,
    assign: {},
    confirmed: true,
    raid: null,
    exp: [{ key: target, ids, target, ...(cel ? { cel } : {}) }],
    lines: [],
    hurt: [],
    t0: st.trust,
    a0: st.anger,
    returned: [],
    loot: zeroStock(),
    slept: [],
  };
  return { st, ids, atr };
}

const tick = (st: GovState, atr: Atrapa, day: number, hour: number): GovEffects => {
  const fx = emptyEffects();
  nightTick(st, { ...atr.input(), day, hour, minute: 0 }, fx);
  return fx;
};

describe('powrót wyprawy z miejsca', () => {
  const dalekie = (): Cel => ({ ...celZMiejsca(miejsce(2, 'spozywczy', 500, 'Pod Orłem')), ryzyko: 0 });
  const bliskie = (): Cel => ({ ...celZMiejsca(miejsce(3, 'apteka', 250)), ryzyko: 0 });

  it('wraca o godzinie z celu: blisko o 1:00, daleko o 5:00, nie wcześniej', () => {
    for (const [cel, godzina] of [
      [bliskie(), 1],
      [dalekie(), 5],
    ] as const) {
      const { st, ids, atr } = nocZGrupa(2, cel.klucz, cel);
      expect(cel.powrot).toBe(godzina);
      const wczesniej = tick(st, atr, 3, godzina - 1);
      expect(wczesniej.back).toEqual([]);
      expect(st.night!.returned).toEqual([]);
      const fx = tick(st, atr, 3, godzina);
      expect(fx.back).toEqual(ids);
      expect(st.night!.returned).toEqual([cel.klucz]);
    }
  });

  it('rozlicza przez cel z grupy: zabrane rośnie, raport nazywa kategorię miejsca w obu językach', () => {
    const cel = dalekie();
    const { st, ids, atr } = nocZGrupa(2, cel.klucz, cel);
    tick(st, atr, 3, 5);
    expect(st.miasto!.wizyty[cel.klucz]).toBe(1);
    expect(st.miasto!.zabrano[cel.klucz]).toBeGreaterThan(0);
    expect(st.visits).toEqual({});
    expect(ids.length).toBe(2);
    const wpisy = st.night!.lines;
    expect(wpisy.some((l) => l.pl.includes('Sklep spożywczy (Pod Orłem)'))).toBe(true);
    expect(wpisy.some((l) => l.en.includes('Food shop (Pod Orłem)'))).toBe(true);
  });

  it('daleka wyprawa z miejsca męczy rano, bliska nie', () => {
    for (const [cel, zmeczeni] of [
      [bliskie(), false],
      [dalekie(), true],
    ] as const) {
      const { st, ids, atr } = nocZGrupa(2, cel.klucz, cel);
      tick(st, atr, 3, 6);
      expect(st.report!.tired).toEqual(zmeczeni ? ids : []);
    }
  });

  it('stara grupa bez cel kończy wyprawę po staremu: cel z TARGETS po id, bez stanu miasta', () => {
    for (const [target, godzina, zmeczeni] of [
      ['mieszkania', 1, false],
      ['pawilon', 5, true],
    ] as const) {
      const { st, ids, atr } = nocZGrupa(2, target);
      delete st.miasto;
      expect(tick(st, atr, 3, godzina - 1).back).toEqual([]);
      expect(tick(st, atr, 3, godzina).back).toEqual(ids);
      expect(st.visits[target]).toBe(1);
      expect(st.miasto).toBeUndefined();
      tick(st, atr, 3, 6);
      expect(st.report!.tired).toEqual(zmeczeni ? ids : []);
    }
  });
});

describe('pełny przebieg atrapy z okolicą', () => {
  it('zatwierdzona wyprawa wraca o godzinie celu, raport nazywa miejsce, a stan miasta zapamiętuje, co zabrano', () => {
    const seed = 4;
    const atr = new Atrapa(seed);
    atr.supplies = 2;
    atr.okolica = [miejsce(1, 'szkola', 100), miejsce(2, 'apteka', 250), miejsce(3, 'spozywczy', 500)];
    const gov = newGov(seed);
    wlaczMiasto(gov);
    // do wieczoru dnia 1: karta zatwierdzona z propozycji zarządu (brak jedzenia, więc ktoś idzie blisko)
    run(seed, 'propozycja', at(1, 23), { gov, atr });
    const grupa = gov.night!.exp[0];
    expect(grupa.target).toBe('poi:2:7');
    expect(grupa.cel?.klucz).toBe('poi:2:7');
    expect(grupa.cel?.powrot).toBe(1);
    for (const id of grupa.ids) expect(atr.away[id]).toBe(at(2, 1));
    // po powrocie i rannym raporcie
    run(seed, 'propozycja', at(2, 7), { gov, atr });
    expect(atr.away).toEqual({});
    const raport = gov.reports[0];
    expect(raport.lines.some((l) => l.pl.includes('Apteka'))).toBe(true);
    expect(raport.lines.some((l) => l.en.includes('Pharmacy'))).toBe(true);
    expect(gov.miasto!.wizyty['poi:2:7']).toBe(1);
    expect(gov.miasto!.ostatnia['poi:2:7']).toBe(2);
    expect(gov.miasto!.zabrano['poi:2:7']).toBeGreaterThan(0);
    expect(gov.visits).toEqual({});
  });

  it('bez okolicy ten sam przebieg idzie na TARGETS jak dotąd', () => {
    const seed = 4;
    const atr = new Atrapa(seed);
    atr.supplies = 2;
    const gov = newGov(seed);
    wlaczMiasto(gov);
    run(seed, 'propozycja', at(1, 23), { gov, atr });
    expect(gov.night!.exp[0].target).toBe('mieszkania');
    run(seed, 'propozycja', at(2, 7), { gov, atr });
    expect(gov.visits.mieszkania).toBe(1);
    expect(gov.miasto!.zabrano).toEqual({});
  });
});
