/* Silnik ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „Zasady ścieżki”, „R0. Pierwszy
   dzień”): zasady rozdziałów sprawdzone na atrapie rozdziałów, których warunki test przestawia ręcznie, na prawdziwym
   odczycie gry z dema (liczniki `start`, wejście nietknięte). Rozdział otwiera się po zrobieniu albo przepadnięciu
   wszystkich celów poprzedniego (albo po własnym warunku otwarcia), bieżący cel to pierwszy niezrobiony, który nie
   czeka, cel czekający ma dopisek, przepada tylko cel z terminem, zaliczenie jest trwałe, cel nieistniejący na mapie nie
   blokuje rozdziału. Do tego rozdział R0 na prawdziwej symulacji: te same teksty i te same zaliczenia co `goalsOf`
   w całym pierwszym dniu na trzech demach w obu trybach, drewno na wieczór trwałe po tym, jak koza zje zapas, i przepadłe
   z kartą nocy. Na końcu przejście do R1: po zamknięciu pierwszego raportu (nie przy samym raporcie), także gdy samouczek
   nie jest skończony albo go nie ma, i w grze wczytanej ze stanem „pierwszy dzień”, w której raport jest już zamknięty. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import type { NightReport } from '../../src/gov/typy.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { goalsOf, NIGHT_WOOD } from '../../src/ui/cele.ts';
import {
  type DefCelu,
  type DefRozdzialu,
  jestStanSciezki,
  krokSciezki,
  licznikiStartu,
  nowyStanSciezki,
  ROZDZIALY,
  stanZZapisu,
  widokSciezki,
  zaliczony,
} from '../../src/ui/sciezka.ts';
import {
  cel,
  cele,
  DEMA,
  doKarty,
  type Gra,
  godzina,
  graj,
  klon,
  krok,
  nowaGra,
  odczyt,
  odpowiedz,
  poPierwszymRaporcie,
  sekunda,
  TRYBY,
  widok,
  zacznijSamouczek,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

/* ---------- atrapa rozdziałów ---------- */

/** flagi, które test przestawia; warunki celów atrapy czytają tylko je */
interface Flagi {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
  e: boolean;
  /** termin celu `b` minął */
  termin: boolean;
  /** cel `opc` istnieje na tej mapie */
  opc: boolean;
  /** cel `a` czeka */
  czeka: boolean;
  /** własny warunek otwarcia rozdziału r1 */
  otwarcie: boolean;
}

const flagi = (): Flagi => ({
  a: false,
  b: false,
  c: false,
  d: false,
  e: false,
  termin: false,
  opc: false,
  czeka: false,
  otwarcie: false,
});

const cl = (key: string, zrobiony: () => boolean, reszta: Partial<DefCelu> = {}): DefCelu => ({
  key,
  tekst: () => `cel ${key}`,
  jak: () => `jak ${key}`,
  zrobiony,
  ...reszta,
});

/** trzy rozdziały: r0 z celami a, b (z terminem) i opc (może nie istnieć), r1 z c i d, r2 z e */
function atrapa(f: Flagi, r1: Partial<DefRozdzialu> = {}): DefRozdzialu[] {
  return [
    {
      k: 'r0',
      tytul: () => 'Zero',
      cele: [
        cl('a', () => f.a, { czeka: () => (f.czeka ? 'czeka do 20:00' : null) }),
        cl('b', () => f.b, { przepadl: () => f.termin }),
        cl('opc', () => false, { jest: () => f.opc }),
      ],
    },
    { k: 'r1', tytul: () => 'Jeden', cele: [cl('c', () => f.c), cl('d', () => f.d)], ...r1 },
    { k: 'r2', tytul: () => 'Dwa', cele: [cl('e', () => f.e)] },
  ];
}

/** zamraża obiekt i wszystko, co w nim siedzi: zmiana wejścia w czystej funkcji rzuci wyjątek (moduły ES są ścisłe) */
function zamroz<T>(x: T): T {
  if (x && typeof x === 'object') {
    Object.freeze(x);
    for (const v of Object.values(x)) zamroz(v);
  }
  return x;
}

/** krok i widok na atrapie rozdziałów, na odczycie prawdziwej gry z dema */
function silnik(g: Gra, def: DefRozdzialu[]) {
  const krokA = () => {
    g.sciezka = krokSciezki(g.sciezka, odczyt(g), def);
    return g.sciezka;
  };
  const widokA = () => widokSciezki(g.sciezka, odczyt(g), def);
  return { krokA, widokA };
}

describe('silnik ścieżki: rozdziały na atrapie', () => {
  it('rozdział otwiera się dopiero po zrobieniu albo przepadnięciu wszystkich celów poprzedniego', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA } = silnik(g, atrapa(f));
    expect(krokA().rozdzial).toBe('r0');
    f.a = true;
    expect(krokA().rozdzial, 'b jeszcze niezrobiony i bez terminu').toBe('r0');
    f.termin = true;
    expect(krokA().rozdzial, 'b przepadł').toBe('r1');
    expect(g.sciezka.zrobione).toHaveProperty(['r0.a']);
    expect(g.sciezka.przepadle).toEqual(['r0.b']);
    // r1 otwiera się teraz w tym samym ticku, a r2 dopiero po c i d
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    f.c = true;
    expect(krokA().rozdzial).toBe('r1');
    f.d = true;
    expect(krokA().rozdzial).toBe('r2');
  });

  it('zrobienie wszystkich celów też otwiera następny rozdział (bez przepadnięcia)', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA } = silnik(g, atrapa(f));
    f.a = true;
    f.b = true;
    expect(krokA().rozdzial).toBe('r1');
    expect(g.sciezka.przepadle).toEqual([]);
  });

  it('własny warunek otwarcia: rozdział otwiera się mimo niezrobionych celów poprzedniego, a bez warunku nie otwiera się', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA } = silnik(g, atrapa(f, { otwiera: () => f.otwarcie }));
    expect(krokA().rozdzial).toBe('r0');
    // poprzedni rozdział skończony, ale warunek otwarcia (jak raport przed R1) jeszcze nie spełniony
    f.a = true;
    f.b = true;
    expect(krokA().rozdzial, 'r0 skończony, warunek otwarcia nie').toBe('r0');
    f.otwarcie = true;
    expect(krokA().rozdzial).toBe('r1');
    // i odwrotnie: warunek spełniony, poprzedni rozdział nieskończony
    const h = nowaGra('przymorze');
    const f2 = flagi();
    f2.otwarcie = true;
    const e2 = silnik(h, atrapa(f2, { otwiera: () => f2.otwarcie }));
    expect(e2.krokA().rozdzial).toBe('r1');
    expect(h.sciezka.zrobione).toEqual({});
    expect(h.sciezka.przepadle).toEqual([]);
  });

  it('rozdział z `jest` fałszywym jest pomijany: ścieżka idzie z r0 do r2', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA, widokA } = silnik(g, atrapa(f, { jest: () => false }));
    f.a = true;
    f.b = true;
    expect(krokA().rozdzial).toBe('r2');
    expect(widokA().rozdzial?.k).toBe('r2');
  });

  it('bieżący cel to pierwszy niezrobiony, który nie czeka', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA, widokA } = silnik(g, atrapa(f));
    krokA();
    let r = widokA().rozdzial!;
    expect(r.k).toBe('r0');
    expect(r.tytul).toBe('Zero');
    expect(r.cele.map((c) => c.key)).toEqual(['a', 'b']);
    expect(r.biezacy?.key).toBe('a');
    expect(r.biezacy).toBe(r.cele[0]);
    // zrobiony pierwszy: bieżący jest następny
    f.a = true;
    krokA();
    r = widokA().rozdzial!;
    expect(r.cele.map((c) => [c.key, c.done])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect(r.biezacy?.key).toBe('b');
    // cel zrobiony w środku listy nie przesuwa bieżącego celu przed siebie
    const h = nowaGra('przymorze');
    const f2 = flagi();
    const e2 = silnik(h, atrapa(f2));
    f2.b = true;
    e2.krokA();
    expect(e2.widokA().rozdzial?.biezacy?.key).toBe('a');
  });

  it('cel czekający ma dopisek i nie jest bieżący; gdy czekają wszystkie niezrobione, bieżącego nie ma', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    f.czeka = true;
    const { krokA, widokA } = silnik(g, atrapa(f));
    krokA();
    let r = widokA().rozdzial!;
    expect(r.cele[0]).toMatchObject({ key: 'a', done: false, czeka: 'czeka do 20:00' });
    expect(r.cele[1].czeka).toBeUndefined();
    expect(r.biezacy?.key).toBe('b');
    f.b = true;
    krokA();
    r = widokA().rozdzial!;
    expect(r.k).toBe('r0');
    expect(r.biezacy, 'jedyny niezrobiony cel czeka').toBeNull();
    expect(r.cele[0].czeka).toBe('czeka do 20:00');
    // cel zrobiony nie ma dopisku, choć jego `czeka` dalej zwraca tekst
    const h = nowaGra('przymorze');
    const f2 = flagi();
    f2.czeka = true;
    f2.a = true;
    const e2 = silnik(h, atrapa(f2));
    e2.krokA();
    const r2 = e2.widokA().rozdzial!;
    expect(r2.k).toBe('r0');
    expect(r2.cele[0]).toMatchObject({ key: 'a', done: true });
    expect(r2.cele[0].czeka).toBeUndefined();
    expect(r2.biezacy?.key).toBe('b');
  });

  it('cel z terminem przepada, kiedy termin minie bez zaliczenia; inne cele nigdy', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA, widokA } = silnik(g, atrapa(f));
    krokA();
    expect(g.sciezka.przepadle).toEqual([]);
    f.termin = true;
    krokA();
    // przepadł tylko b: a nie ma terminu, więc czeka dalej
    expect(g.sciezka.przepadle).toEqual(['r0.b']);
    expect(g.sciezka.rozdzial).toBe('r0');
    const r = widokA().rozdzial!;
    expect(r.cele.find((c) => c.key === 'b')).toMatchObject({ done: true, missed: true });
    expect(r.cele.find((c) => c.key === 'a')).toMatchObject({ done: false });
    expect(r.cele.find((c) => c.key === 'a')?.missed).toBeUndefined();
    // minęło sto kroków, a cel bez terminu nadal czeka
    for (let k = 0; k < 100; k++) krokA();
    expect(g.sciezka.przepadle).toEqual(['r0.b']);
    expect(g.sciezka.zrobione).toEqual({});
  });

  it('zaliczenie wygrywa z terminem (oba w tym samym kroku), a przepadły cel nie wraca', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA, widokA } = silnik(g, atrapa(f));
    f.b = true;
    f.termin = true;
    krokA();
    expect(g.sciezka.zrobione).toHaveProperty(['r0.b']);
    expect(g.sciezka.przepadle).toEqual([]);
    expect(widokA().rozdzial!.cele.find((c) => c.key === 'b')?.missed).toBeUndefined();
    // przepadły cel: warunek, który prawdziwy jest dopiero później, go nie ratuje
    const h = nowaGra('przymorze');
    const f2 = flagi();
    const e2 = silnik(h, atrapa(f2));
    f2.termin = true;
    e2.krokA();
    f2.b = true;
    e2.krokA();
    expect(h.sciezka.przepadle).toEqual(['r0.b']);
    expect(h.sciezka.zrobione).toEqual({});
    expect(e2.widokA().rozdzial!.cele.find((c) => c.key === 'b')).toMatchObject({ done: true, missed: true });
  });

  it('zaliczenie jest trwałe: warunek wraca do fałszu, a cel zostaje, także po zapisie i wczytaniu', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA, widokA } = silnik(g, atrapa(f));
    f.a = true;
    krokA();
    expect(zaliczony(g.sciezka, 'r0.a')).toBe(true);
    const tick = g.sciezka.zrobione['r0.a'];
    f.a = false;
    for (let k = 0; k < 50; k++) g.sim.step();
    krokA();
    expect(zaliczony(g.sciezka, 'r0.a')).toBe(true);
    expect(g.sciezka.zrobione['r0.a'], 'pierwszy tick zostaje').toBe(tick);
    expect(widokA().rozdzial!.cele[0]).toMatchObject({ key: 'a', done: true });
    // przez zapis (JSON jak z przeglądarki) i wczytanie
    const zapis = JSON.parse(JSON.stringify(g.sciezka));
    expect(jestStanSciezki(zapis)).toBe(true);
    const wczytany = stanZZapisu(zapis, g.sim.st, g.gov);
    expect(wczytany).toEqual(g.sciezka);
    expect(widokSciezki(wczytany, odczyt(g), atrapa(f)).rozdzial!.cele[0]).toMatchObject({ key: 'a', done: true });
    expect(krokSciezki(wczytany, odczyt(g), atrapa(f)).zrobione['r0.a']).toBe(tick);
  });

  it('cel z `jest` fałszywym nie wchodzi do listy i nie blokuje rozdziału', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA, widokA } = silnik(g, atrapa(f));
    krokA();
    expect(widokA().rozdzial!.cele.map((c) => c.key)).toEqual(['a', 'b']);
    f.a = true;
    f.b = true;
    // `opc` nie istnieje na tej mapie, a niezrobiony nie blokuje: r1 otwarty
    expect(krokA().rozdzial).toBe('r1');
    expect(g.sciezka.zrobione).not.toHaveProperty(['r0.opc']);
    // na mapie, na której cel istnieje, blokuje do zrobienia albo przepadnięcia
    const h = nowaGra('przymorze');
    const f2 = flagi();
    f2.opc = true;
    const e2 = silnik(h, atrapa(f2));
    f2.a = true;
    f2.b = true;
    expect(e2.krokA().rozdzial).toBe('r0');
    expect(e2.widokA().rozdzial!.cele.map((c) => c.key)).toEqual(['a', 'b', 'opc']);
  });

  it('liczniki `start` zapisują się przy otwarciu rozdziału i potem się nie zmieniają', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const { krokA } = silnik(g, atrapa(f));
    // przed otwarciem r1 liczniki to stan startu gry
    expect(krokA().start).toEqual(nowyStanSciezki().start);
    // stan gry tuż przed otwarciem: dwa raporty, dwie podpisane uchwały, trochę ticków
    g.gov.reports.push({} as NightReport, {} as NightReport);
    g.gov.laws.signed = { u_ognisko: true, u_kociol: true, u_cofnieta: false };
    for (let k = 0; k < 123; k++) g.sim.step();
    f.a = true;
    f.b = true;
    krokA();
    expect(g.sciezka.rozdzial).toBe('r1');
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    const spodziewane = licznikiStartu(g.sim.st, g.gov);
    expect(spodziewane).toMatchObject({ uchwaly: 2, raporty: 2 });
    expect(spodziewane.ludnosc).toBeGreaterThanOrEqual(4);
    expect(g.sciezka.start).toEqual(spodziewane);
    // później gra idzie dalej, a liczniki z chwili otwarcia zostają
    g.gov.reports.push({} as NightReport);
    g.gov.laws.signed.u_inna = true;
    for (let k = 0; k < 77; k++) g.sim.step();
    krokA();
    expect(g.sciezka.start).toEqual(spodziewane);
    expect(g.sciezka.od).toBe(g.sim.st.tick - 77);
  });

  it('rozdział, którego cele stan gry już spełnia, zalicza je od razu przy otwarciu i może zamknąć się w tym samym kroku', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    f.a = true;
    f.b = true;
    f.c = true;
    f.d = true;
    const { krokA } = silnik(g, atrapa(f));
    krokA();
    // r0 skończony, r1 otwarty i od razu skończony (c i d spełnione), r2 otwarty i czeka na e
    expect(g.sciezka.rozdzial).toBe('r2');
    expect(g.sciezka.zrobione).toEqual({
      'r0.a': g.sim.st.tick,
      'r0.b': g.sim.st.tick,
      'r1.c': g.sim.st.tick,
      'r1.d': g.sim.st.tick,
    });
    expect(g.sciezka.od).toBe(g.sim.st.tick);
  });

  it('po ostatnim rozdziale stan to „koniec”, widok nie ma rozdziału, okazji ani dróg, a dalsze kroki nic nie zmieniają', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    f.a = true;
    f.b = true;
    f.c = true;
    f.d = true;
    f.e = true;
    const { krokA, widokA } = silnik(g, atrapa(f));
    expect(krokA().rozdzial).toBe('koniec');
    expect(g.sciezka.zrobione).toHaveProperty(['r2.e']);
    expect(widokA()).toEqual({ okazja: null, rozdzial: null, drogi: null });
    const przed = structuredClone(g.sciezka);
    for (let k = 0; k < 5; k++) krokA();
    expect(g.sciezka).toEqual(przed);
  });

  it('stan z rozdziałem, którego nie ma wśród definicji, zostaje bez zmian, a widok nie ma rozdziału', () => {
    const g = nowaGra('przymorze');
    g.sciezka = { ...nowyStanSciezki(), rozdzial: 'r5', od: 500, zrobione: { 'r5.x': 7 } };
    const { krokA, widokA } = silnik(g, atrapa(flagi()));
    expect(krokA()).toEqual({ ...nowyStanSciezki(), rozdzial: 'r5', od: 500, zrobione: { 'r5.x': 7 } });
    expect(widokA().rozdzial).toBeNull();
  });

  it('krok i widok są czyste: wejście zostaje nietknięte, a wynik nie dzieli z nim obiektów', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    f.a = true;
    f.termin = true;
    const def = atrapa(f);
    const s = zamroz({ ...nowyStanSciezki(), zrobione: { 'x.y': 1 }, ui: { lista: 5 } });
    const przed = JSON.stringify(s);
    const o = odczyt(g);
    const stSim = JSON.stringify(g.sim.st);
    const stGov = JSON.stringify(g.gov);
    const t = krokSciezki(s, o, def);
    widokSciezki(t, o, def);
    widokSciezki(s, o, def);
    expect(JSON.stringify(s)).toBe(przed);
    expect(t).not.toBe(s);
    expect(t.zrobione).not.toBe(s.zrobione);
    expect(t.przepadle).not.toBe(s.przepadle);
    expect(t.ui).not.toBe(s.ui);
    expect(t.start).not.toBe(s.start);
    // symulacja i zarząd tylko czytane
    expect(JSON.stringify(g.sim.st)).toBe(stSim);
    expect(JSON.stringify(g.gov)).toBe(stGov);
    // krok bez zmian też zwraca kopię
    const u = krokSciezki(t, o, def);
    expect(u).toEqual(t);
    expect(u).not.toBe(t);
  });

  it('widok niesie tytuł rozdziału i pola celu: klucz, tekst, podpowiedź, `okno`', () => {
    const g = nowaGra('przymorze');
    const f = flagi();
    const def = atrapa(f);
    def[0] = { ...def[0], cele: [cl('a', () => f.a, { okno: 'karta' }), ...def[0].cele.slice(1)] };
    const { krokA, widokA } = silnik(g, def);
    krokA();
    expect(widokA().rozdzial!.cele[0]).toEqual({ key: 'a', text: 'cel a', how: 'jak a', done: false, okno: 'karta' });
    expect(widokA().rozdzial!.cele[1]).toEqual({ key: 'b', text: 'cel b', how: 'jak b', done: false });
  });
});

/* ---------- rozdział R0 na prawdziwej symulacji ---------- */

/** zapas drewna jak w oknie celów od zawsze: skład, luzem i w rękach (bez drewna w ogniu) */
const zapas = (g: Gra): number => {
  const s = odczyt(g).snap.stock;
  return s.woodSklad + s.woodLoose + s.woodCarried;
};

/** to, co zwraca `goalsOf` dla odczytu gry z tej chwili, z zaliczeniem drewna ze stanu ścieżki */
const stare = (g: Gra, touch = false) => {
  const o = odczyt(g, { touch });
  return goalsOf(o.st, o.gov, {
    touch,
    kitchen: o.snap.kitchen,
    hour: o.snap.hour,
    selected: false,
    wood: zapas(g),
    woodReady: zaliczony(g.sciezka, 'r0.drewno'),
    words: o.words,
    wordsEn: o.wordsEn,
    w: o.w,
  });
};

describe('R0: pierwszy dzień to goalsOf w rozdziale', () => {
  it('ROZDZIAŁY zaczyna pierwszy dzień', () => {
    expect(ROZDZIALY[0].k).toBe('r0');
  });

  it.each(DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
    '%s %s: na starcie osiem celów z tymi samymi tekstami co goalsOf, bieżący to zaznaczenie',
    (key, mode) => {
      const g = nowaGra(key, mode);
      const w = widok(g).rozdzial!;
      expect(w.k).toBe('r0');
      expect(w.tytul).toBe('Pierwszy dzień');
      expect(w.cele.map((c) => c.key)).toEqual([...TUT_STEPS, 'drewno', 'noc']);
      const s = stare(g);
      expect(w.cele.map((c) => [c.key, c.text, c.how])).toEqual(s.map((x) => [x.key, x.text, x.how]));
      expect(w.cele.every((c) => !c.done && !c.czeka && !c.okno)).toBe(true);
      expect(w.biezacy?.key).toBe('zaznacz');
      // dotyk i angielski mówią to samo co goalsOf
      expect(widok(g, { touch: true }).rozdzial!.cele.map((c) => c.how)).toEqual(stare(g, true).map((x) => x.how));
      ustawJezyk('en');
      expect(widok(g).rozdzial!.tytul).toBe('Day one');
      expect(widok(g).rozdzial!.cele.map((c) => [c.text, c.how])).toEqual(stare(g).map((x) => [x.text, x.how]));
    },
  );

  it('zaznaczenie w interfejsie zalicza krok „zaznacz” od razu i na stałe, także gdy zaznaczenie zniknie', () => {
    const g = nowaGra('przymorze');
    expect(cel(g, 'zaznacz').done).toBe(false);
    expect(cel(g, 'zaznacz', { zaznaczony: true }).done).toBe(true);
    expect(widok(g, { zaznaczony: true }).rozdzial!.biezacy?.key).toBe('rozkaz');
    // zaznaczenie zdjęte (klik w puste miejsce), a krok samouczka dalej niezrobiony w symulacji: ptaszek zostaje
    expect(cel(g, 'zaznacz', { zaznaczony: false }).done).toBe(true);
    expect(zaliczony(g.sciezka, 'r0.zaznacz')).toBe(true);
  });

  it('kroki samouczka zaliczają się razem z symulacją po jednym i nie cofają się, a po samouczku bieżący cel to drewno na wieczór', () => {
    const g = nowaGra('przymorze');
    zacznijSamouczek(g);
    const zrobione: number[] = [];
    graj(g, (x) => {
      zrobione.push(cele(x).filter((c) => c.done).length);
      return x.sim.st.tut.step >= TUT_STEPS.length;
    });
    // liczba zrobionych celów rośnie, nigdy nie maleje, i przechodzi przez co najmniej trzy różne wartości
    for (let k = 1; k < zrobione.length; k++)
      expect(zrobione[k], `sekunda ${k}`).toBeGreaterThanOrEqual(zrobione[k - 1]);
    expect(new Set(zrobione).size).toBeGreaterThanOrEqual(3);
    const c = cele(g);
    expect(c.slice(0, TUT_STEPS.length).every((x) => x.done)).toBe(true);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('drewno');
    // krok samouczka nie cofa się razem z tym, co symulacja z niego zrobiła
    expect(g.sciezka.zrobione).toHaveProperty(['r0.koza']);
  });

  it.each(DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
    '%s %s: cały pierwszy dzień te same zaliczenia i przepadnięcia co goalsOf (drewno ze stanu ścieżki)',
    (key, mode) => {
      const g = nowaGra(key, mode);
      zacznijSamouczek(g);
      let porownan = 0;
      let sekund = 0;
      graj(
        g,
        (x) => {
          sekund++;
          if (sekund % 10 !== 0) return false;
          const c = cele(x);
          const s = stare(x);
          porownan++;
          expect(
            c.map((y) => [y.key, y.done, !!y.missed]),
            `po ${sekund} s`,
          ).toEqual(s.map((y) => [y.key, y.done, !!y.missed]));
          return false;
        },
        { stoj: ['raport'] },
      );
      // gra staje na raporcie po pierwszej nocy: porównano cały pierwszy dzień
      expect(porownan).toBeGreaterThanOrEqual(55);
      expect(g.gov.reports.length).toBe(1);
      // przy otwartym raporcie pierwszy dzień ma wszystkie osiem celów skończone (noc przetrwana)
      const c = cele(g);
      expect(c.every((y) => y.done)).toBe(true);
      expect(cel(g, 'noc').done).toBe(true);
    },
    120_000,
  );

  it('drewno na wieczór: fałsz przed zapasem, prawda po nim, trwałe po tym, jak koza zje zapas, także po wczytaniu', () => {
    const g = nowaGra('przymorze');
    zacznijSamouczek(g);
    graj(g, (x) => x.sim.st.tut.step >= TUT_STEPS.length);
    expect(godzina(g)).toBeLessThan(20);
    // po samouczku koza zjada resztę drewna: zapasu na wieczór jeszcze nie ma
    expect(zapas(g)).toBeLessThan(NIGHT_WOOD);
    expect(cel(g, 'drewno').done).toBe(false);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('drewno');
    // dwie sztuki to jeszcze nie ogień do snu
    dolozDrewno(g, 2 - zapas(g));
    expect(cel(g, 'drewno').done).toBe(false);
    // trzy sztuki zaliczają cel
    dolozDrewno(g, NIGHT_WOOD - zapas(g));
    expect(zapas(g)).toBe(NIGHT_WOOD);
    expect(cel(g, 'drewno').done).toBe(true);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('noc');
    // koza zjada zapas przed wieczorem, a cel zostaje zaliczony
    let sekund = 0;
    while (zapas(g) >= NIGHT_WOOD && sekund++ < 400) sekunda(g);
    expect(zapas(g)).toBeLessThan(NIGHT_WOOD);
    expect(godzina(g)).toBeLessThan(20);
    expect(cel(g, 'drewno')).toMatchObject({ done: true });
    expect(cel(g, 'drewno').missed).toBeUndefined();
    // po zapisie i wczytaniu (stan ścieżki przez JSON) nadal zaliczone
    const h = klon(g);
    h.sciezka = stanZZapisu(JSON.parse(JSON.stringify(g.sciezka)), h.sim.st, h.gov);
    expect(zapas(h)).toBeLessThan(NIGHT_WOOD);
    expect(cel(h, 'drewno')).toMatchObject({ done: true });
  });

  it('drewno na wieczór przepada z kartą nocy, ale nie z samą kartą na ekranie', () => {
    const g = nowaGra('lanciego');
    zacznijSamouczek(g);
    graj(g, (x) => x.sim.st.tut.step >= TUT_STEPS.length);
    expect(zapas(g)).toBeLessThan(NIGHT_WOOD);
    const card = doKarty(g);
    expect(card.day).toBe(1);
    // karta otwarta, nikt jej jeszcze nie zatwierdził: termin trwa
    expect(g.gov.night?.confirmed).toBe(false);
    expect(cel(g, 'drewno')).toMatchObject({ done: false });
    expect(cel(g, 'drewno').missed).toBeUndefined();
    expect(widok(g).rozdzial!.biezacy?.key).toBe('drewno');
    // karta zatwierdzona, a zapas pojawia się dopiero po terminie, zanim ścieżka zdążyła go zobaczyć przed kartą: cel
    // przepadł (skreślony, ale policzony jak zrobiony), bieżący cel to noc; zaliczyć się po terminie już nie da
    g.gov.night!.confirmed = true;
    dolozDrewno(g, 10);
    expect(zapas(g)).toBeGreaterThanOrEqual(NIGHT_WOOD);
    expect(cel(g, 'drewno')).toMatchObject({ done: true, missed: true });
    expect(g.sciezka.przepadle).toEqual(['r0.drewno']);
    expect(zaliczony(g.sciezka, 'r0.drewno')).toBe(false);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('noc');
    // i dalej: przepadły cel nie wraca, choćby zapasu przybywało
    dolozDrewno(g, 10);
    for (let k = 0; k < 20; k++) sekunda(g);
    expect(cel(g, 'drewno')).toMatchObject({ done: true, missed: true });
    expect(zaliczony(g.sciezka, 'r0.drewno')).toBe(false);
  });

  it('drewno na wieczór zaliczone przed kartą nocy zostaje zaliczone po jej zatwierdzeniu', () => {
    const g = nowaGra('zielonki');
    zacznijSamouczek(g);
    graj(g, (x) => x.sim.st.tut.step >= TUT_STEPS.length);
    dolozDrewno(g, NIGHT_WOOD + 1 - zapas(g));
    expect(cel(g, 'drewno').done).toBe(true);
    doKarty(g);
    g.gov.night!.confirmed = true;
    expect(cel(g, 'drewno')).toMatchObject({ done: true });
    expect(cel(g, 'drewno').missed).toBeUndefined();
    expect(g.sciezka.przepadle).toEqual([]);
  });

  it('samouczek wyłączony (krok −1): R0 ma tylko cel nocy', () => {
    const g = nowaGra('przymorze');
    g.sim.st.tut.step = -1;
    const w = widok(g).rozdzial!;
    expect(w.cele.map((c) => c.key)).toEqual(['noc']);
    expect(w.biezacy?.key).toBe('noc');
  });

  it('dopóki raport jest otwarty, pierwszy dzień stoi (8 z 8), a R1 nie jest jeszcze otwarty', () => {
    const g = nowaGra('przymorze');
    zacznijSamouczek(g);
    const p = graj(g, () => false, { stoj: ['raport'] });
    expect(p?.k).toBe('raport');
    expect(g.gov.reports.length).toBe(1);
    expect(g.sciezka.rozdzial).toBe('r0');
    const w = widok(g).rozdzial!;
    expect(w.k).toBe('r0');
    expect(w.cele.filter((c) => c.done)).toHaveLength(w.cele.length);
    expect(w.biezacy).toBeNull();
  });
});

describe('przejście z R0 do R1', () => {
  it.each(DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
    '%s %s: R1 otwiera się po zamknięciu pierwszego raportu, nie przy samym raporcie',
    (key, mode) => {
      const g = nowaGra(key, mode);
      zacznijSamouczek(g);
      const p = graj(g, () => false, { stoj: ['raport'] });
      expect(p?.k).toBe('raport');
      // raport istnieje i jest otwarty: pierwszy dzień (osiem z ośmiu), R1 jeszcze nie
      expect(krok(g).rozdzial).toBe('r0');
      expect(widok(g).rozdzial?.k).toBe('r0');
      // przeczytany raport otwiera drugi dzień w tym samym kroku ścieżki
      odpowiedz(g, p!);
      expect(g.gov.report).toBeNull();
      const tick = g.sim.st.tick;
      expect(krok(g).rozdzial).toBe('r1');
      expect(g.sciezka.od).toBe(tick);
      expect(g.sciezka.start.raporty).toBe(1);
      expect(g.sciezka.start).toEqual(licznikiStartu(g.sim.st, g.gov));
      const w = widok(g).rozdzial!;
      expect(w.k).toBe('r1');
      expect(w.tytul).toBe('Drugi dzień');
      ustawJezyk('en');
      expect(widok(g).rozdzial!.tytul).toBe('Day two');
    },
    120_000,
  );

  it('samouczek pominięty: po zamknięciu raportu i tak drugi dzień, a pierwszy znika z okienka', () => {
    const g = nowaGra('przymorze');
    // nikt nie rąbie suchego drzewa: samouczek nie dochodzi do końca przez całą pierwszą dobę
    const p = graj(g, () => false, { stoj: ['raport'] });
    expect(p?.k).toBe('raport');
    expect(g.sim.st.tut.step).toBeLessThan(TUT_STEPS.length);
    expect(krok(g).rozdzial).toBe('r0');
    const przed = widok(g).rozdzial!;
    expect(przed.k).toBe('r0');
    // tak wyglądało okienko drugiego dnia przed zmianą: „Pierwszy dzień” z niezrobionymi krokami samouczka
    expect(przed.cele.filter((c) => c.done).length).toBeLessThan(przed.cele.length);
    expect(TUT_STEPS as readonly string[]).toContain(przed.biezacy?.key);
    odpowiedz(g, p!);
    expect(krok(g).rozdzial).toBe('r1');
    const w = widok(g).rozdzial!;
    expect(w.k).toBe('r1');
    expect(w.tytul).toBe('Drugi dzień');
    expect(w.cele.map((c) => c.key)).not.toContain('zaznacz');
    // samouczka nikt nie skończył (ostatnie kroki i drewno niezaliczone), a pierwszy dzień już nie wraca
    expect(g.sciezka.zrobione).not.toHaveProperty(['r0.cieplo']);
    expect(g.sciezka.zrobione).not.toHaveProperty(['r0.drewno']);
    // drewno na wieczór przepadło z kartą nocy, jak zawsze
    expect(g.sciezka.przepadle).toEqual(['r0.drewno']);
    for (let k = 0; k < 120; k++) sekunda(g);
    expect(widok(g).rozdzial!.k).toBe('r1');
  });

  it('samouczek wyłączony na całą dobę: raport i tak otwiera drugi dzień', () => {
    const g = nowaGra('lanciego');
    g.sim.st.tut.step = -1;
    const p = graj(g, () => false, { stoj: ['raport'] });
    expect(p?.k).toBe('raport');
    expect(widok(g).rozdzial!.cele.map((c) => c.key)).toEqual(['noc']);
    odpowiedz(g, p!);
    expect(krok(g).rozdzial).toBe('r1');
  });

  it('gra wczytana ze stanem „pierwszy dzień”, w której raport jest już zamknięty, otwiera drugi dzień przy pierwszym kroku', () => {
    // zapis z budowy stanu ścieżki (zadanie 4) trzyma `r0` przez całą grę
    const g = poPierwszymRaporcie('zielonki');
    for (let k = 0; k < 300; k++) sekunda(g);
    g.sciezka = nowyStanSciezki();
    const tick = g.sim.st.tick;
    expect(g.gov.reports.length).toBe(1);
    expect(g.gov.report).toBeNull();
    krok(g);
    expect(g.sciezka.rozdzial).toBe('r1');
    expect(g.sciezka.od).toBe(tick);
    expect(g.sciezka.start.raporty).toBe(1);
    // gra sprzed kilku dób: kilka raportów, żaden otwarty
    g.sciezka = nowyStanSciezki();
    g.gov.reports.push({} as NightReport, {} as NightReport);
    expect(krok(g).rozdzial).toBe('r1');
    expect(g.sciezka.start.raporty).toBe(3);
  });

  it('gra bez zarządu zostaje w pierwszym dniu', () => {
    const g = nowaGra('przymorze');
    const o = { ...odczyt(g), gov: null, input: null };
    expect(krokSciezki(g.sciezka, o).rozdzial).toBe('r0');
    expect(widokSciezki(g.sciezka, o).rozdzial?.k).toBe('r0');
  });

  it('gra po pierwszym raporcie jest wspólna dla testów, ale każdy dostaje własny klon', () => {
    const g = poPierwszymRaporcie('przymorze');
    const h = poPierwszymRaporcie('przymorze');
    expect(g.sciezka.rozdzial).toBe('r1');
    expect(JSON.stringify(g.sim.st)).toBe(JSON.stringify(h.sim.st));
    for (let i = 0; i < 40; i++) sekunda(g);
    expect(g.sim.st.tick).toBeGreaterThan(h.sim.st.tick);
    expect(JSON.stringify(poPierwszymRaporcie('przymorze').sim.st)).toBe(JSON.stringify(h.sim.st));
  });
});

/** sterta drewna w składzie (stan to zwykły JSON, więc test może ułożyć ją sam, jak po spaleniu mebla) */
function dolozDrewno(g: Gra, n: number): void {
  if (n <= 0) return;
  const { st, w } = g.sim;
  const kafelek = w.interior.sklad[0];
  st.things.push({
    id: st.nextThing++,
    kind: 'drewno',
    x: kafelek % w.size,
    y: Math.floor(kafelek / w.size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  });
}
