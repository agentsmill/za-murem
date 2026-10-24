/* Stan ścieżki celów w zapisie interfejsu (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „Stan i zapis”,
   usterka U6): typy i czyste funkcje stanu (`src/ui/sciezka.ts`), pole `Save.cele` i jego kontrola kształtu
   w `readSave` (zły kształt to zapis bez pola, nie odrzucony zapis), stan z zapisu bez pola oraz zaliczenie drewna na
   wieczór, które po przeładowaniu zostaje, choć koza zjadła zapas (test na prawdziwej symulacji Przymorza i dwóch
   pozostałych dem). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import type { GovState } from '../../src/gov/typy.ts';
import { wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { wlaczZwyciestwo } from '../../src/gov/zwyciestwo.ts';
import { clockOf } from '../../src/sim/clock.ts';
import { commandFor } from '../../src/sim/orders.ts';
import { Sim, type Thing, trunkOf, wyprowadz } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { currentGoal, goalsOf, NIGHT_WOOD } from '../../src/ui/cele.ts';
import {
  jestStanSciezki,
  licznikiStartu,
  nowyStanSciezki,
  type StanSciezki,
  stanZZapisu,
  zalicz,
  zaliczony,
  zdarzenieUi,
} from '../../src/ui/sciezka.ts';
import { readSave, SAVE_KEY, SAVE_VERSION, type Save, writeSave } from '../../src/ui/zapis.ts';
import type { Loaded } from '../../src/world/load.ts';
import { core, newGame } from './sasiedzi-pomoc.ts';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

/** najmniejszy zapis, który przechodzi walidację `readSave` (sprawdza tylko wersje i `data.geo`) */
const zapis = (extra: Record<string, unknown> = {}): Save =>
  ({
    v: 1,
    at: 1,
    data: { geo: {} },
    seed: 2051,
    sim: { v: 3 },
    gov: { v: 1 },
    screen: 0,
    ...extra,
  }) as unknown as Save;

/** stan ścieżki z każdym polem, także z otwartą okazją: do próby zapisu i odczytu bez straty */
const bogaty = (): StanSciezki => ({
  v: 1,
  rozdzial: 'r4',
  od: 98765,
  start: {
    uchwaly: 2,
    raporty: 3,
    ludnosc: 7,
    lup: 11,
    spotkania: 4,
    kamienLudnosci: 1,
    osoby: [1, 2, 3, 4, 17, 18, 19],
    zarzad: [1, 2, 3, 4],
  },
  zrobione: { 'r0.drewno': 2081, 'r1.przeszukaj': 40000, 'o2.wymiana': 61000 },
  przepadle: ['r1.drewno2'],
  ui: { lista: 51000, drogi: 70000 },
  okazja: { k: 'o4', od: 97000, zabici: 5, cel: 12 },
});

/** stan bez jednego pola (zły kształt: pole brakuje) */
const bez = (pole: keyof StanSciezki): unknown => {
  const s: Partial<StanSciezki> = bogaty();
  delete s[pole];
  return s;
};

/** zamraża obiekt i wszystko, co w nim siedzi: zmiana wejścia w czystej funkcji rzuci wyjątek (moduły ES są ścisłe) */
function zamroz<T>(x: T): T {
  if (x && typeof x === 'object') {
    Object.freeze(x);
    for (const v of Object.values(x)) zamroz(v);
  }
  return x;
}

describe('stan ścieżki: stan na start i czyste funkcje', () => {
  it('nowa gra zaczyna od pierwszego dnia: rozdział r0 od ticku 0, same zera i pusto', () => {
    expect(nowyStanSciezki()).toEqual({
      v: 1,
      rozdzial: 'r0',
      od: 0,
      start: { uchwaly: 0, raporty: 0, ludnosc: 0, lup: 0, spotkania: 0, kamienLudnosci: 0 },
      zrobione: {},
      przepadle: [],
      ui: {},
    });
    expect(jestStanSciezki(nowyStanSciezki())).toBe(true);
  });

  it('każdy stan na start to osobny obiekt, nic nie jest wspólne między grami', () => {
    const a = nowyStanSciezki();
    const b = nowyStanSciezki();
    a.zrobione['r0.drewno'] = 1;
    a.przepadle.push('x');
    a.ui.lista = 3;
    a.start.raporty = 9;
    expect(b).toEqual(nowyStanSciezki());
  });

  it('zdarzenie interfejsu zapisuje tick ostatniego zdarzenia i nie rusza wejścia', () => {
    const s = zamroz(bogaty());
    const przed = structuredClone(s);
    const t = zdarzenieUi(s, 'mieszkaniec', 80000);
    expect(t).not.toBe(s);
    expect(t.ui).toEqual({ lista: 51000, drogi: 70000, mieszkaniec: 80000 });
    expect(s).toEqual(przed);
    // ostatni tick wygrywa
    expect(zdarzenieUi(t, 'lista', 90000).ui.lista).toBe(90000);
    expect(t.ui.lista).toBe(51000);
    // reszta stanu przechodzi bez zmian
    expect({ ...t, ui: s.ui }).toEqual(s);
    for (const k of ['lista', 'mieszkaniec', 'budynek', 'drogi'] as const)
      expect(zdarzenieUi(nowyStanSciezki(), k, 5).ui).toEqual({ [k]: 5 });
  });

  it('zaliczenie celu zapisuje tick, nie rusza wejścia i jest trwałe: drugie zaliczenie nie zmienia ticku', () => {
    const s = zamroz(nowyStanSciezki());
    const t = zalicz(s, 'r0.drewno', 2200);
    expect(t).not.toBe(s);
    expect(s.zrobione).toEqual({});
    expect(t.zrobione).toEqual({ 'r0.drewno': 2200 });
    expect(zaliczony(s, 'r0.drewno')).toBe(false);
    expect(zaliczony(t, 'r0.drewno')).toBe(true);
    expect(zaliczony(t, 'r1.drewno2')).toBe(false);
    // pierwszy tick zostaje, wynik to dalej nowy obiekt
    const jeszcze = zalicz(zamroz(t), 'r0.drewno', 9000);
    expect(jeszcze).not.toBe(t);
    expect(jeszcze.zrobione['r0.drewno']).toBe(2200);
    // inne zaliczenia dochodzą obok
    expect(zalicz(t, 'r1.budowla', 30000).zrobione).toEqual({ 'r0.drewno': 2200, 'r1.budowla': 30000 });
  });

  it('wynik nie dzieli żadnego obiektu z wejściem: zmiana wyniku nie rusza wejścia', () => {
    const s = bogaty();
    for (const t of [zalicz(s, 'r2.sily', 5), zdarzenieUi(s, 'drogi', 7)]) {
      t.zrobione['r9.x'] = 1;
      t.przepadle.push('r9.y');
      t.ui.lista = 1;
      t.start.raporty = 99;
      t.okazja!.cel = 1;
      t.rozdzial = 'r8';
    }
    expect(s).toEqual(bogaty());
  });

  it('zaliczenie w ticku 0 też jest zaliczeniem (liczy się obecność klucza, nie wartość)', () => {
    expect(zaliczony(zalicz(nowyStanSciezki(), 'r0.zaznacz', 0), 'r0.zaznacz')).toBe(true);
  });

  it('klucze w rodzaju „constructor” nie udają zaliczeń', () => {
    const s = nowyStanSciezki();
    expect(zaliczony(s, 'constructor')).toBe(false);
    expect(zaliczony(s, '__proto__')).toBe(false);
    expect(zaliczony(s, 'toString')).toBe(false);
  });
});

describe('kształt stanu ścieżki', () => {
  it('rozpoznaje poprawny stan, także z otwartą okazją i bez jej pól opcjonalnych', () => {
    expect(jestStanSciezki(bogaty())).toBe(true);
    expect(jestStanSciezki({ ...bogaty(), okazja: { k: 'o7', od: 3 } })).toBe(true);
    expect(jestStanSciezki({ ...bogaty(), rozdzial: 'koniec' })).toBe(true);
    // pole dopisane przez nowszą wersję nie przeszkadza
    expect(jestStanSciezki({ ...bogaty(), nowe: 1 })).toBe(true);
  });

  it('numery pionków z chwili otwarcia są opcjonalne (zapis sprzed nich), ale jeśli są, to listy liczb', () => {
    const bezPionkow = (): StanSciezki => {
      const s = bogaty();
      delete s.start.osoby;
      delete s.start.zarzad;
      return s;
    };
    expect(jestStanSciezki(bezPionkow())).toBe(true);
    expect(jestStanSciezki({ ...bezPionkow(), start: { ...bezPionkow().start, osoby: [1, 2] } })).toBe(true);
    for (const zle of ['1,2', {}, [1, 'a'], [1, Number.NaN], [[1]], null]) {
      expect(jestStanSciezki({ ...bogaty(), start: { ...bogaty().start, osoby: zle } }), `osoby ${String(zle)}`).toBe(
        false,
      );
      expect(jestStanSciezki({ ...bogaty(), start: { ...bogaty().start, zarzad: zle } }), `zarzad ${String(zle)}`).toBe(
        false,
      );
    }
  });

  it('odrzuca to, co nie jest stanem', () => {
    for (const zle of [undefined, null, 0, 5, 'r1', true, [], [bogaty()], () => 1])
      expect(jestStanSciezki(zle), String(zle)).toBe(false);
  });
});

describe('zapis: pole cele', () => {
  it('stan ścieżki przechodzi przez writeSave i readSave bez zmian', () => {
    const store = memory();
    const s = bogaty();
    expect(writeSave(zapis({ cele: s }), store)).toBe(true);
    const back = readSave(store);
    expect(back).not.toBeNull();
    expect(back?.cele).toEqual(s);
    expect(JSON.parse(store.m.get(SAVE_KEY)!).cele).toEqual(s);
  });

  it('pole jest opcjonalne: zapis bez cele wczytuje się jak dotąd, a numer wersji zapisu się nie zmienia', () => {
    const store = memory();
    expect(writeSave(zapis({ pietra: true }), store)).toBe(true);
    const back = readSave(store);
    expect(back).not.toBeNull();
    expect(back?.cele).toBeUndefined();
    expect('cele' in back!).toBe(false);
    expect(back?.pietra).toBe(true);
    expect(SAVE_VERSION).toBe(1);
    expect(back?.v).toBe(1);
  });

  const ZLE: [string, unknown][] = [
    ['liczba', 5],
    ['tekst', 'r1'],
    ['null', null],
    ['prawda', true],
    ['pusta tablica', []],
    ['tablica ze stanem', [bogaty()]],
    ['zrobione z wartością tekstową', { ...bogaty(), zrobione: { 'r0.drewno': 'tak' } }],
    ['zrobione z wartością null', { ...bogaty(), zrobione: { 'r0.drewno': null } }],
    ['zrobione jako tablica', { ...bogaty(), zrobione: [] }],
    ['zrobione jako liczba', { ...bogaty(), zrobione: 3 }],
    ['inna wersja stanu', { ...bogaty(), v: 2 }],
    ['bez wersji stanu', bez('v')],
    ['nieznany rozdział', { ...bogaty(), rozdzial: 'r9' }],
    ['rozdział jako liczba', { ...bogaty(), rozdzial: 1 }],
    ['bez rozdziału', bez('rozdzial')],
    ['tick otwarcia jako tekst', { ...bogaty(), od: '5' }],
    ['tick otwarcia NaN (w JSON null)', { ...bogaty(), od: Number.NaN }],
    ['bez start', bez('start')],
    ['start z jednym licznikiem', { ...bogaty(), start: { uchwaly: 0 } }],
    ['start z licznikiem tekstowym', { ...bogaty(), start: { ...bogaty().start, lup: '3' } }],
    ['przepadle jako obiekt', { ...bogaty(), przepadle: {} }],
    ['przepadle z liczbą', { ...bogaty(), przepadle: ['r1.drewno2', 3] }],
    ['ui z wartością tekstową', { ...bogaty(), ui: { lista: 'x' } }],
    ['ui jako tablica', { ...bogaty(), ui: [1] }],
    ['okazja z nieznanym kluczem', { ...bogaty(), okazja: { k: 'o9', od: 1 } }],
    ['okazja bez ticku otwarcia', { ...bogaty(), okazja: { k: 'o1' } }],
    ['okazja z licznikiem zabitych jako tekst', { ...bogaty(), okazja: { k: 'o4', od: 1, zabici: 'trzech' } }],
    ['okazja z celem jako tablica', { ...bogaty(), okazja: { k: 'o5', od: 1, cel: [3] } }],
    ['okazja null', { ...bogaty(), okazja: null }],
  ];

  it.each(ZLE)('zły kształt (%s): zapis wczytuje się bez pola cele, reszta cała', (_nazwa, cele) => {
    const store = memory();
    // zapis idzie przez JSON jak z przeglądarki i z chmury: tak samo wygląda to, co readSave dostaje
    store.m.set(SAVE_KEY, JSON.stringify(zapis({ pietra: true, siec: { zajete: ['a'], dom: true }, cele })));
    const back = readSave(store);
    expect(back, 'zapis nie jest odrzucony').not.toBeNull();
    expect('cele' in back!).toBe(false);
    expect(back?.pietra).toBe(true);
    expect(back?.siec).toEqual({ zajete: ['a'], dom: true });
    expect(back?.seed).toBe(2051);
    expect(back?.sim).toEqual({ v: 3 });
    expect(back?.gov).toEqual({ v: 1 });
  });

  it('zły kształt cele nie ratuje zapisu, który i tak jest zły: zła wersja gry dalej go odrzuca', () => {
    const store = memory();
    store.m.set(SAVE_KEY, JSON.stringify(zapis({ v: 2, cele: bogaty() })));
    expect(readSave(store)).toBeNull();
    store.m.set(SAVE_KEY, JSON.stringify(zapis({ pietra: false, cele: bogaty() })));
    expect(readSave(store)).toBeNull();
  });

  it('pole dopisane przez nowszą wersję w środku stanu nie psuje zapisu, a stanZZapisu je gubi', () => {
    const store = memory();
    store.m.set(SAVE_KEY, JSON.stringify(zapis({ cele: { ...bogaty(), nowe: 1 } })));
    const back = readSave(store);
    expect(back?.cele).toBeDefined();
    const st = newGame('przymorze').st;
    const s = stanZZapisu(back?.cele, st, newGov(1));
    expect(s).toEqual(bogaty());
    expect('nowe' in s).toBe(false);
  });
});

describe('stan ścieżki z zapisu', () => {
  const st = newGame('przymorze').st;
  const jedenRaport = (): GovState => {
    const gov = newGov(1);
    gov.reports.push({} as GovState['reports'][number]);
    return gov;
  };

  it('poprawne pole wraca jako kopia: równa, ale osobny obiekt, także w środku', () => {
    const raw = bogaty();
    const s = stanZZapisu(raw, st, newGov(1));
    expect(s).toEqual(raw);
    expect(s).not.toBe(raw);
    expect(s.start).not.toBe(raw.start);
    // listy numerów pionków z chwili otwarcia: równe, ale osobne tablice
    expect(s.start.osoby).toEqual(raw.start.osoby);
    expect(s.start.osoby).not.toBe(raw.start.osoby);
    expect(s.start.zarzad).not.toBe(raw.start.zarzad);
    expect(s.zrobione).not.toBe(raw.zrobione);
    expect(s.przepadle).not.toBe(raw.przepadle);
    expect(s.ui).not.toBe(raw.ui);
    expect(s.okazja).not.toBe(raw.okazja);
    s.zrobione['r9.x'] = 1;
    expect(raw.zrobione).not.toHaveProperty('r9.x');
    // poprawne pole wygrywa także wtedy, gdy raportów jeszcze nie ma albo już są
    expect(stanZZapisu(raw, st, jedenRaport())).toEqual(raw);
    expect(stanZZapisu(raw, st, null)).toEqual(raw);
  });

  it('bez pola i bez raportu: pierwszy dzień', () => {
    for (const raw of [undefined, null, 7, 'r1', [], { v: 1 }, { ...bogaty(), zrobione: { a: 'b' } }]) {
      expect(stanZZapisu(raw, st, newGov(1)), JSON.stringify(raw)).toEqual(nowyStanSciezki());
      expect(stanZZapisu(raw, st, null), JSON.stringify(raw)).toEqual(nowyStanSciezki());
    }
  });

  it('bez pola i z jednym raportem: drugi dzień otwarty w chwili wczytania, ze stanem liczników', () => {
    const w = newGame('przymorze');
    w.st.tick = 123456;
    const gov = jedenRaport();
    for (const raw of [undefined, null, 'zły', { ...bogaty(), rozdzial: 'r11' }]) {
      const s = stanZZapisu(raw, w.st, gov);
      expect(s.rozdzial, JSON.stringify(raw)).toBe('r1');
      expect(s.od).toBe(123456);
      expect(s.zrobione).toEqual({});
      expect(s.przepadle).toEqual([]);
      expect(s.ui).toEqual({});
      expect(s.okazja).toBeUndefined();
      expect(s.start).toEqual(licznikiStartu(w.st, gov));
      expect(s.start.raporty).toBe(1);
      expect(jestStanSciezki(s)).toBe(true);
    }
    // więcej raportów: tak samo
    gov.reports.push({} as GovState['reports'][number]);
    expect(stanZZapisu(undefined, w.st, gov).rozdzial).toBe('r1');
    expect(stanZZapisu(undefined, w.st, gov).start.raporty).toBe(2);
  });

  it('liczniki z chwili wczytania: uchwały, raporty, ludność, łup, spotkania i kamienie ludności', () => {
    const sim = newGame('przymorze');
    const gov = jedenRaport();
    // pusty stan gry i zarządu (bez mapy miasta, dróg i sąsiadów): same zera poza ludnością i raportami
    const ludzie = sim.st.pawns.filter((p) => p.kind === 'core' || p.kind === 'resident').length;
    expect(ludzie).toBeGreaterThanOrEqual(4);
    // numery pionków zarządu i mieszkańców z chwili otwarcia (cel „Przyjmijcie kogoś nowego” liczy od nich przyjęcia)
    const numery = (rodzaje: string[]) => sim.st.pawns.filter((p) => rodzaje.includes(p.kind)).map((p) => p.id);
    expect(licznikiStartu(sim.st, gov)).toEqual({
      uchwaly: 0,
      raporty: 1,
      ludnosc: ludzie,
      lup: 0,
      spotkania: 0,
      kamienLudnosci: 0,
      osoby: numery(['core', 'resident']),
      zarzad: numery(['core']),
    });
    // zapełniony: podpisane uchwały (fałsz się nie liczy), łup z miejsc, kamienie ludności, spotkania z sąsiadami
    gov.laws.signed = { u_kociol: true, u_ognisko: true, u_cofnieta: false };
    wlaczMiasto(gov);
    gov.miasto!.zabrano = { 'poi:1:2': 3, 'poi:4:5': 2 };
    wlaczZwyciestwo(gov);
    gov.zwyciestwo!.kamienie = { ludnosc: 2, teren: 1 };
    sim.st.sasiedzi = { budynki: [], spotkanie: null, nr: 3, napis: null, n: 0 };
    // ktoś odchodzi bramą (wydarzenia): dla zarządu już nie istnieje; obcy i sąsiedzi się nie liczą
    const odchodzi = sim.st.pawns.find((p) => p.kind === 'core')!;
    expect(wyprowadz(sim.st, sim.w, sim.st.people[odchodzi.person].id)).toBe(true);
    expect(licznikiStartu(sim.st, gov)).toEqual({
      uchwaly: 2,
      raporty: 1,
      ludnosc: ludzie - 1,
      lup: 5,
      spotkania: 3,
      kamienLudnosci: 2,
      // idący do bramy pionek jest jeszcze pionkiem zarządu, więc lista z chwili otwarcia go ma (ludność już nie)
      osoby: numery(['core', 'resident']),
      zarzad: numery(['core']),
    });
  });

  it('stan z zapisu i liczniki tylko czytają: symulacja i zarząd zostają bez zmian', () => {
    const sim = newGame('przymorze');
    const gov = jedenRaport();
    for (let k = 0; k < 50; k++) sim.step();
    const hash = sim.hash();
    const jsonSim = JSON.stringify(sim.st);
    const jsonGov = JSON.stringify(gov);
    stanZZapisu(undefined, sim.st, gov);
    stanZZapisu(bogaty(), sim.st, gov);
    licznikiStartu(sim.st, gov);
    expect(sim.hash()).toBe(hash);
    expect(JSON.stringify(sim.st)).toBe(jsonSim);
    expect(JSON.stringify(gov)).toBe(jsonGov);
  });

  it('gra bez zarządu w odczycie (null): same zera poza ludnością', () => {
    const sim = newGame('przymorze');
    expect(licznikiStartu(sim.st, null)).toMatchObject({
      uchwaly: 0,
      raporty: 0,
      lup: 0,
      spotkania: 0,
      kamienLudnosci: 0,
    });
  });
});

/* ---------- U6 na prawdziwej symulacji ---------- */

/** demo jak w grze: dane osiedla do zapisu (świat i ziarno z adresu buduje newGame) */
function daneDema(key: string): Loaded {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return { geo: d.geo, name: d.name, addr: d.addr, street: d.street, src: 'demo' };
}

/** zapas drewna jak w `renderGoals` (src/main.ts): skład, luzem i w rękach */
const zapasDrewna = (sim: Sim): number => {
  const s = snapshot(sim.st, sim.w).stock;
  return s.woodSklad + s.woodLoose + s.woodCarried;
};

/** kładzie drewno na kafelku składu (stan to zwykły JSON, więc test może go ułożyć sam, jak po spaleniu mebla) */
function dolozDrewno(sim: Sim, n: number): void {
  const { st, w } = sim;
  const tile = w.interior.sklad[0];
  const rzecz: Thing = {
    id: st.nextThing++,
    kind: 'drewno',
    x: tile % w.size,
    y: Math.floor(tile / w.size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(rzecz);
}

describe('U6: drewno na wieczór zaliczone przed przeładowaniem zostaje zaliczone', () => {
  it.each(['przymorze', 'lanciego', 'zielonki'])(
    '%s: samouczek, 3 sztuki w składzie, koza je zjada, zapis, wczytanie, cel dalej zaliczony',
    (key) => {
      const sim = newGame(key);
      const { st, w } = sim;
      const seed = 5;
      const gov = newGov(seed);
      // samouczek: zaznaczenie i ścięcie suchego drzewa, reszta (skład, koza, ciepło) idzie sama
      const marek = core(sim)[0];
      sim.push({ t: 'select', ids: [marek.id] });
      sim.push(commandFor(st, w, [marek.id], trunkOf(w, w.trees[w.dryTree]))!);
      for (let k = 0; k < 9000 && st.tut.step < TUT_STEPS.length; k++) sim.step();
      expect(st.tut.step).toBe(TUT_STEPS.length);
      // gracz pali mebel albo rąbie drzewo: w składzie leży dokładnie tyle, ile wystarcza na ogień do snu (3 sztuki)
      dolozDrewno(sim, NIGHT_WOOD - zapasDrewna(sim));
      expect(zapasDrewna(sim)).toBe(NIGHT_WOOD);
      // `renderGoals` zalicza cel w chwili, gdy samouczek się skończył, a zapas ma co najmniej NIGHT_WOOD
      let cele = nowyStanSciezki();
      if (st.tut.step >= TUT_STEPS.length && zapasDrewna(sim) >= NIGHT_WOOD) cele = zalicz(cele, 'r0.drewno', st.tick);
      expect(zaliczony(cele, 'r0.drewno')).toBe(true);
      // koza zjada zapas przed wieczorem
      let kroki = 0;
      while (zapasDrewna(sim) >= NIGHT_WOOD && kroki < 4000) {
        sim.step();
        kroki++;
      }
      expect(zapasDrewna(sim), `koza zjadła zapas po ${kroki} krokach`).toBeLessThan(NIGHT_WOOD);
      const godzina = snapshot(st, w).hour;
      expect(godzina, `jest ${clockOf(st.tick)}`).toBeLessThan(20);
      expect(gov.reports.length).toBe(0);

      // zapis jak `save()` z main.ts, przez pamięć przeglądarki i z powrotem
      const store = memory();
      const s: Save = {
        v: 1,
        at: 1,
        data: daneDema(key),
        seed,
        sim: st,
        gov,
        screen: 0,
        cele,
      };
      expect(writeSave(s, store)).toBe(true);
      const back = readSave(store)!;
      expect(back.cele).toEqual(cele);

      // wczytanie jak `enter()`: stan ścieżki z zapisu, symulacja ze stanu z zapisu
      const wczytana = new Sim(w, back.sim);
      const sciezka = stanZZapisu(back.cele, back.sim, back.gov);
      expect(zaliczony(sciezka, 'r0.drewno')).toBe(true);
      const snap = snapshot(back.sim, w);
      const cele1 = (woodReady: boolean, noc = false) => {
        back.gov.night = noc ? ({ confirmed: true } as GovState['night']) : null;
        return goalsOf(back.sim, back.gov, {
          touch: false,
          kitchen: snap.kitchen,
          hour: snap.hour,
          wood: zapasDrewna(wczytana),
          woodReady,
          words: wordsOfWorld(w),
          wordsEn: wordsEnOfWorld(w),
          w,
        });
      };
      const drewno = (l: ReturnType<typeof cele1>) => l.find((g) => g.key === 'drewno')!;
      // po wczytaniu zapasu już nie ma, a cel jest zaliczony: dalej bieżący jest „noc”, a karta nocy go nie skreśla
      expect(zapasDrewna(wczytana)).toBeLessThan(NIGHT_WOOD);
      expect(drewno(cele1(zaliczony(sciezka, 'r0.drewno')))).toMatchObject({ done: true });
      expect(drewno(cele1(zaliczony(sciezka, 'r0.drewno'))).missed).toBeFalsy();
      expect(currentGoal(cele1(zaliczony(sciezka, 'r0.drewno')))?.key).toBe('noc');
      expect(drewno(cele1(zaliczony(sciezka, 'r0.drewno'), true))).toMatchObject({ done: true });
      expect(drewno(cele1(zaliczony(sciezka, 'r0.drewno'), true)).missed).toBeFalsy();

      // tak było przed poprawką: zaliczenie żyło tylko w pamięci strony i po przeładowaniu przepadało
      expect(drewno(cele1(false))).toMatchObject({ done: false });
      expect(currentGoal(cele1(false))?.key).toBe('drewno');
      expect(drewno(cele1(false, true))).toMatchObject({ done: true, missed: true });

      // wczytana gra żyje dalej tak samo jak ta, z której zapis powstał
      for (let k = 0; k < 200; k++) {
        sim.step();
        wczytana.step();
      }
      expect(wczytana.hash()).toBe(sim.hash());
    },
  );
});
