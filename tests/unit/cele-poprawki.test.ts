/* Poprawki celów pierwszego i drugiego dnia (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, usterki U1–U5,
   U9 i U10) na prawdziwej symulacji: dema z public/demo (świat z ziarna adresu) w obu trybach i w obu językach.
   U1: podpowiedź pierwszej budowli bierze tylko budowle, które da się postawić (bez badań i z wolnym limitem).
   U2: noc zombie ze stadem, nie z szabrownikami. U3 i U4: drewno na wieczór, mebel najpierw do kozy, a w zombie bez
   drzewa w obrębie siatki palenie mebli zamiast ścinania drzewa wśród szwendaczy. U5: przeszukanie od zaznaczenia
   osoby. U9: „a barricade”. U10: koza w samouczku dokłada też sama. Każdy warunek sprawdzony przed zmianą stanu
   gry i po niej. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { BUILDS_EN } from '../../src/sim/budowle.en.ts';
import { BUILDS, type BuildKind } from '../../src/sim/budowle.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { type Sim, trunkOf } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { costText } from '../../src/ui/budowa.ts';
import { drzewoWObwodzie, type Goal, goalsOf, najtanszeBudowle } from '../../src/ui/cele.ts';
import type { Cel } from '../../src/ui/sciezka.ts';
import { FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { core, newGame, until } from './sasiedzi-pomoc.ts';
import { celeR1 } from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const DEMOS = ['przymorze', 'lanciego', 'zielonki'] as const;
type Demo = (typeof DEMOS)[number];
const MODES: readonly GameMode[] = ['zwykly', 'zombie'];
/** Zielonki to dom jednorodzinny, Przymorze i Lanciego to bloki */
const dom = (key: Demo) => key === 'zielonki';
/** czy po ścięciu suchego drzewa w obrębie siatki zostaje drzewo: w Zielonkach drugie w ogrodzie, na Przymorzu
    i na Lanciego jedynym było suche z samouczka (na Lanciego w podwórku stoi jeszcze krzak, który się nie liczy) */
const ZOSTAJE: Record<Demo, boolean> = { przymorze: false, lanciego: false, zielonki: true };

/** gra na demie w danym trybie: symulacja, zarząd w tym samym trybie i słowa miejsca po polsku i po angielsku */
function game(key: Demo, mode: GameMode = 'zwykly') {
  const sim = newGame(key, mode);
  return { sim, st: sim.st, w: sim.w, gov: newGov(1, mode), words: wordsOfWorld(sim.w), e: wordsEnOfWorld(sim.w) };
}
type Game = ReturnType<typeof game>;

/** cele pierwszego dnia; `w: true` daje celom świat gry (bez niego podpowiedź drewna jak w zwykłym trybie) */
const day1 = (g: Game, o: { touch?: boolean; hour?: number; wood?: number; w?: boolean } = {}): Goal[] =>
  goalsOf(g.st, g.gov, {
    touch: o.touch ?? false,
    kitchen: 9,
    hour: o.hour ?? 15,
    wood: o.wood ?? 0,
    words: g.words,
    wordsEn: g.e,
    ...(o.w ? { w: g.w } : {}),
  });
/** cele drugiego dnia (rozdział R1 ścieżki) dla takiego odczytu gry */
const day2 = (g: Game, touch = false): Cel[] => celeR1(g.st, g.w, g.gov, { touch, words: g.words, wordsEn: g.e });
const goal = <T extends { key: string }>(list: T[], key: string): T => list.find((x) => x.key === key)!;

/** drzewa (nie krzaki), których pień stoi na kafelku podwórka siatki: liczone tu wprost, inaczej niż w drzewoWObwodzie */
const wPodworku = (w: Game['w']): number[] => {
  const yard = new Set(w.fence.yard);
  return w.trees.flatMap((t, k) => (t.kind !== 2 && yard.has(trunkOf(w, t)) ? [k] : []));
};

/** zarząd ścina drzewo z polecenia i czeka, aż drzewo padnie; ścięcie z podwórka nie rusza świata (dema są wspólne) */
function sciac(sim: Sim, k: number) {
  const p = core(sim)[0];
  const fence = sim.w.fence;
  sim.push({ t: 'chop', ids: [p.id], tree: k });
  const kroki = until(sim, () => sim.st.felled.includes(k), 9000);
  expect(sim.st.felled, `drzewo ${k} padło po ${kroki} krokach`).toContain(k);
  expect(sim.w.fence, 'świat bez zmian').toBe(fence);
  expect(sim.w.fenceBaza).toBeUndefined();
}

/** polecenia „Przeszukać …” (po angielsku „Search the …”) w pokojach siedziby dla podanych osób, z numerem pokoju */
function przeszukania(sim: Sim, ids: number[]): { room: number; label: string }[] {
  const { st, w } = sim;
  const out: { room: number; label: string }[] = [];
  for (const r of w.interior.rooms)
    for (const m of commandsAt(st, w, ids, w.interior.room.indexOf(r.id)))
      if (m.label.startsWith('Przeszukać ') || m.label.startsWith('Search the '))
        out.push({ room: r.id, label: m.label });
  return out;
}

describe('U1: podpowiedź pierwszej budowli bierze tylko budowle do postawienia', () => {
  const zTech = (Object.keys(BUILDS) as BuildKind[]).filter((k) => BUILDS[k].tech);
  const suma = (k: BuildKind) => Object.values(BUILDS[k].cost).reduce((a: number, v) => a + (v ?? 0), 0);

  it('bez badań: zasieki i ogródek, żadna budowla z badania; po badaniu wchodzi do listy', () => {
    for (const key of DEMOS)
      for (const mode of MODES) {
        const g = game(key, mode);
        const jak = goal(day2(g), 'budowla').how;
        expect(jak, `${key} ${mode}`).toContain('zasieki (złom 10) i ogródek (deski 14)');
        for (const k of zTech) expect(jak, `${key} ${mode} ${k}`).not.toContain(BUILDS[k].name.toLowerCase());
        expect(najtanszeBudowle(g.st)).toEqual(['zasieki', 'ogrodek']);
        // po badaniu grzybów pieczarkarnia (deski 8) jest najtańsza i wchodzi do podpowiedzi
        g.st.techDone = ['t_grzyby'];
        expect(najtanszeBudowle(g.st)).toEqual(['pieczarkarnia', 'zasieki']);
        expect(goal(day2(g), 'budowla').how, `${key} ${mode} po t_grzyby`).toContain(
          'pieczarkarnia (deski 8) i zasieki (złom 10)',
        );
        // koza z beczki (złom 8, części 1) po badaniu pieców
        g.st.techDone = ['t_grzyby', 't_kozy'];
        expect(najtanszeBudowle(g.st)).toEqual(['pieczarkarnia', 'koza_beczka']);
        expect(goal(day2(g), 'budowla').how).toContain('pieczarkarnia (deski 8) i koza z beczki (złom 8, części 1)');
      }
  });

  it('po angielsku te same dwie budowle, z kosztami w bieżącym języku', () => {
    ustawJezyk('en');
    for (const key of DEMOS)
      for (const mode of MODES) {
        const g = game(key, mode);
        const jak = goal(day2(g), 'budowla').how;
        const dwie = najtanszeBudowle(g.st).map((k) => `${BUILDS_EN[k].the} (${costText(BUILDS[k].cost)})`);
        expect(dwie).toEqual(['the barricade (scrap 10)', 'the vegetable patch (planks 14)']);
        expect(jak, `${key} ${mode}`).toContain(`The cheapest are ${dwie.join(' and ')}.`);
        for (const k of zTech) expect(jak, `${key} ${mode} ${k}`).not.toContain(BUILDS_EN[k].the);
        expect(polskieSlowa(jak), jak).toEqual([]);
      }
  });

  it('pracownia jest na liście przed postawieniem, a po postawieniu albo zaplanowaniu (limit 1) już nie', () => {
    for (const key of DEMOS) {
      const { st } = game(key);
      expect(najtanszeBudowle(st, 5), key).toEqual([
        'zasieki',
        'ogrodek',
        'pracownia',
        'lozka_pietrowe',
        'kuchnia_spoleczna',
      ]);
      // plan budowy pracowni zajmuje limit tak samo jak gotowa pracownia
      st.builds.push({ id: 9100, kind: 'pracownia', x: 0, y: 0, rot: 0, need: {}, have: {}, work: 0, by: -1 });
      expect(najtanszeBudowle(st, 5), `${key} z planem`).not.toContain('pracownia');
      st.builds.pop();
      expect(najtanszeBudowle(st, 5), `${key} bez planu`).toContain('pracownia');
      st.things.push({ ...st.things[0], id: 9101, kind: 'pracownia' });
      expect(najtanszeBudowle(st, 5), `${key} z pracownią`).not.toContain('pracownia');
      // budowle bez limitu zostają, kiedy już stoją: zasieki można stawiać dalej
      st.things.push({ ...st.things[0], id: 9102, kind: 'zasieki' });
      expect(najtanszeBudowle(st), key).toEqual(['zasieki', 'ogrodek']);
    }
  });

  it('lista jest posortowana po sumie kosztu, a remis rozstrzyga kolejność w BUILDS', () => {
    const { st } = game('przymorze');
    st.techDone = zTech.map((k) => BUILDS[k].tech as string);
    const wszystkie = najtanszeBudowle(st, 99);
    const wBuilds = Object.keys(BUILDS) as BuildKind[];
    // po wszystkich badaniach i bez pracowni na liście jest każda budowla
    expect([...wszystkie].sort()).toEqual([...wBuilds].sort());
    for (let i = 1; i < wszystkie.length; i++) {
      const [a, b] = [wszystkie[i - 1], wszystkie[i]];
      expect(suma(a)).toBeLessThanOrEqual(suma(b));
      if (suma(a) === suma(b)) expect(wBuilds.indexOf(a), `${a} przed ${b}`).toBeLessThan(wBuilds.indexOf(b));
    }
    expect(najtanszeBudowle(st, 3)).toEqual(wszystkie.slice(0, 3));
    expect(najtanszeBudowle(st)).toEqual(wszystkie.slice(0, 2));
  });
});

describe('R1.2: reszta podpowiedzi pierwszej budowli', () => {
  it('materiał daje przeszukiwanie i rozbiórka; zasieki liczą się do obwodu tylko w zwykłym trybie', () => {
    for (const key of DEMOS) {
      const zwykly = goal(day2(game(key, 'zwykly')), 'budowla').how;
      const zombie = goal(day2(game(key, 'zombie')), 'budowla').how;
      expect(zwykly, key).toContain('Materiał pochodzi z przeszukiwania i rozbiórki.');
      expect(zombie, key).toContain('Materiał pochodzi z przeszukiwania i rozbiórki.');
      expect(zwykly, key).toContain('Zasieki liczą się też do obwodu.');
      expect(zombie, key).not.toContain('Zasieki liczą się też do obwodu.');
      // gdy zasieków nie ma wśród dwóch najtańszych, dopisku też nie ma
      const g = game(key, 'zwykly');
      g.st.techDone = ['t_grzyby', 't_kozy'];
      expect(goal(day2(g), 'budowla').how, key).not.toContain('Zasieki liczą się też do obwodu.');
    }
  });

  it('po angielsku, mysz i dotyk', () => {
    ustawJezyk('en');
    for (const key of DEMOS) {
      const g = game(key, 'zwykly');
      const mysz = goal(day2(g, false), 'budowla').how;
      const dotyk = goal(day2(g, true), 'budowla').how;
      expect(mysz, key).toContain('Searching and taking things apart give you materials.');
      expect(mysz, key).toContain('A barricade also counts for the perimeter.');
      expect(mysz.startsWith('Build (button at the top, or B): any structure will do.'), mysz).toBe(true);
      expect(dotyk.startsWith('The Build button at the top: any structure will do.'), dotyk).toBe(true);
      expect(goal(day2(game(key, 'zombie')), 'budowla').how).not.toContain('also counts for the perimeter');
    }
  });

  it('w domu jednorodzinnym sąsiednie domy jako drugie źródło desek i złomu, w bloku bez tego', () => {
    for (const key of DEMOS) {
      const g = game(key);
      const mysz = goal(day2(g, false), 'budowla').how;
      const dotyk = goal(day2(g, true), 'budowla').how;
      if (dom(key)) {
        expect(mysz).toContain('Deski i złom mają też sąsiednie domy: prawy przycisk na ich drzwiach.');
        expect(dotyk).toContain('Deski i złom mają też sąsiednie domy: przytrzymajcie palec na ich drzwiach.');
        expect(`${mysz} ${dotyk}`).not.toMatch(FORBIDDEN_DOM);
      } else {
        expect(mysz).not.toContain('sąsiednie domy');
        expect(dotyk).not.toContain('sąsiednie domy');
      }
    }
    ustawJezyk('en');
    for (const key of DEMOS) {
      const g = game(key);
      const mysz = goal(day2(g, false), 'budowla').how;
      const dotyk = goal(day2(g, true), 'budowla').how;
      if (dom(key)) {
        expect(mysz).toContain('The houses next door have planks and scrap too: right-click their door.');
        expect(dotyk).toContain('The houses next door have planks and scrap too: press and hold on their door.');
      } else {
        expect(mysz).not.toContain('next door');
        expect(dotyk).not.toContain('next door');
      }
    }
  });
});

describe('U2: noc w trybie zombie ze stadem, nie z szabrownikami', () => {
  it('po polsku: zombie ma stado, zwykły szabrowników, dzień bez zmian', () => {
    for (const key of DEMOS) {
      const zomb = game(key, 'zombie');
      const zwyk = game(key, 'zwykly');
      const nocZ = goal(day1(zomb, { hour: 22 }), 'noc').how;
      expect(nocZ, key).toBe(
        `Stado wychodzi z okolicy od 21:00 i do rana napiera na siatkę. Rano ${zomb.words.zarzad.krotko} dostanie raport.`,
      );
      expect(nocZ).not.toContain('Szabrownicy');
      expect(goal(day1(zwyk, { hour: 22 }), 'noc').how, key).toBe(
        `Szabrownicy przychodzą po dwudziestej trzeciej. Rano ${zwyk.words.zarzad.krotko} dostanie raport.`,
      );
      // nocą od 20:00 do 6:00 stado, za dnia zapowiedź zebrania i karty nocy jak w zwykłym trybie
      expect(goal(day1(zomb, { hour: 3 }), 'noc').how, key).toContain('Stado');
      expect(goal(day1(zomb, { hour: 15 }), 'noc').how, key).toBe(goal(day1(zwyk, { hour: 15 }), 'noc').how);
    }
  });

  it('po angielsku: herd zamiast looters', () => {
    ustawJezyk('en');
    for (const key of DEMOS) {
      const zomb = game(key, 'zombie');
      const zwyk = game(key, 'zwykly');
      const nocZ = goal(day1(zomb, { hour: 22 }), 'noc').how;
      expect(nocZ, key).toBe(
        `The herd comes out of the area from 21:00 and presses on the fence until morning. In the morning ${zomb.e.krotko} gets a report.`,
      );
      expect(nocZ).not.toContain('Looters');
      expect(goal(day1(zwyk, { hour: 22 }), 'noc').how, key).toBe(
        `Looters come after 23:00. In the morning ${zwyk.e.krotko} gets a report.`,
      );
      expect(polskieSlowa(nocZ), nocZ).toEqual([]);
    }
  });

  it('tryb bierze się też z zarządu, kiedy symulacja go nie ma (atrapa)', () => {
    const g = game('przymorze', 'zwykly');
    const noc = goalsOf(g.st, newGov(1, 'zombie'), { touch: false, kitchen: 9, hour: 22 }).find((x) => x.key === 'noc');
    expect(noc?.how).toContain('Stado');
  });
});

describe('U4: drewno na wieczór', () => {
  it('tytuł i podpowiedź: ogień do snu, mebel najpierw do kozy, reszta na skład', () => {
    for (const key of DEMOS)
      for (const mode of MODES)
        for (const touch of [false, true]) {
          const d = goal(day1(game(key, mode), { touch, wood: 2 }), 'drewno');
          expect(d.text).toBe('Przygotujcie drewno na wieczór.');
          expect(d.how, `${key} ${mode} ${touch}`).toContain('Drewna na zapas: 2 z 3, czyli ogień do snu.');
          expect(d.how).toContain('najpierw do kozy');
          expect(d.how).toContain('reszta na skład');
          expect(d.how).not.toContain('na noc');
        }
  });

  it('po angielsku', () => {
    ustawJezyk('en');
    for (const key of DEMOS)
      for (const touch of [false, true]) {
        const d = goal(day1(game(key, 'zwykly'), { touch, wood: 2 }), 'drewno');
        expect(d.text).toBe('Get wood in for the evening.');
        expect(d.how).toContain('Wood stocked: 2 of 3, enough fire to last till bedtime.');
        expect(d.how).toContain('it goes into the stove first, the rest onto the woodpile.');
        expect(polskieSlowa(d.text), d.text).toEqual([]);
        expect(polskieSlowa(d.how), d.how).toEqual([]);
      }
  });

  it('drewno drugiego dnia zostaje drewnem na całą noc', () => {
    const g = game('przymorze');
    expect(goal(day2(g), 'drewno2').text).toBe('Zbierzcie drewno na całą noc.');
    ustawJezyk('en');
    expect(goal(day2(g), 'drewno2').text).toBe('Get in enough wood for the whole night.');
  });
});

describe('U3: drewno w trybie zombie nie wysyła pod szwendaczy', () => {
  it('drzewa w obrębie siatki na demach: suche z samouczka, w Zielonkach jeszcze jedno w ogrodzie', () => {
    for (const key of DEMOS) {
      const { w } = game(key);
      const drzewa = wPodworku(w);
      expect(drzewa, key).toContain(w.dryTree);
      expect(drzewa.length, key).toBe(ZOSTAJE[key] ? 2 : 1);
    }
  });

  it('suche drzewo w trakcie samouczka nie liczy się, bez samouczka jest zwykłym drzewem, ścięte i krzak nie', () => {
    for (const key of DEMOS) {
      const { st, w } = game(key);
      expect(st.tut.step, 'samouczek trwa').toBeGreaterThanOrEqual(0);
      expect(st.tut.step).toBeLessThan(TUT_STEPS.length);
      // w trakcie samouczka suche drzewo jest zarezerwowane dla jego kroków: zostaje tylko drugie drzewo, jeśli jest
      expect(drzewoWObwodzie(st, w), `${key} w samouczku`).toBe(ZOSTAJE[key]);
      // bez samouczka suche drzewo to zwykłe drzewo w obrębie siatki
      st.tut.step = -1;
      expect(drzewoWObwodzie(st, w), `${key} bez samouczka`).toBe(true);
      // po samouczku (suche drzewo ścięte) liczy się to samo co w jego trakcie
      st.tut.step = TUT_STEPS.length;
      st.felled.push(w.dryTree);
      expect(drzewoWObwodzie(st, w), `${key} po samouczku`).toBe(ZOSTAJE[key]);
      // ścięte drzewa nie liczą się
      for (const k of wPodworku(w)) if (!st.felled.includes(k)) st.felled.push(k);
      st.felled.sort((a, b) => a - b);
      expect(drzewoWObwodzie(st, w), `${key} po ścięciu wszystkich`).toBe(false);
    }
  });

  it('krzak w podwórku nie jest drzewem do ścięcia (Lanciego)', () => {
    const { st, w } = game('lanciego');
    const yard = new Set(w.fence.yard);
    const krzak = w.trees.findIndex((t) => t.kind === 2 && yard.has(trunkOf(w, t)));
    expect(krzak, 'na Lanciego krzak stoi w podwórku').toBeGreaterThanOrEqual(0);
    st.tut.step = -1;
    st.felled.push(w.dryTree);
    expect(st.felled).not.toContain(krzak);
    expect(drzewoWObwodzie(st, w)).toBe(false);
  });

  it('w zombie po samouczku: Przymorze i Lanciego palą meble, Zielonki mają drzewo w ogrodzie', () => {
    for (const key of DEMOS) {
      const g = game(key, 'zombie');
      // w trakcie samouczka suche drzewo jest zarezerwowane dla kroków, więc liczy się tylko drugie drzewo, jeśli jest
      const przed = goal(day1(g, { w: true, wood: 1 }), 'drewno').how;
      expect(przed, `${key} w samouczku`).toContain(ZOSTAJE[key] ? 'Ściąć drzewo' : 'Spalić');
      expect(drzewoWObwodzie(g.st, g.w), `${key} w samouczku`).toBe(ZOSTAJE[key]);
      // prawdziwe ścięcie suchego drzewa z polecenia, jak w pierwszych minutach gry
      sciac(g.sim, g.w.dryTree);
      g.st.tut.step = TUT_STEPS.length;
      const po = goal(day1(g, { w: true, wood: 1 }), 'drewno').how;
      expect(drzewoWObwodzie(g.st, g.w), `${key} po ścięciu`).toBe(ZOSTAJE[key]);
      if (ZOSTAJE[key]) {
        expect(po, key).toContain('Prawy przycisk na drzewie: „Ściąć drzewo”.');
        expect(po).not.toContain('Spalić');
      } else {
        expect(po, key).toContain('Drewna na zapas: 1 z 3, czyli ogień do snu.');
        expect(po).toContain('Drzewa za siatką stoją wśród szwendaczy');
        expect(po).toContain(`prawy przycisk na meblu ${g.words.szukanie.w}: „Spalić …”.`);
        expect(po).toContain('Trafi najpierw do kozy, reszta na skład.');
        expect(po).not.toContain('Ściąć drzewo');
      }
      // ostatnie drzewo w obrębie siatki pada: Zielonki też przechodzą na meble
      if (ZOSTAJE[key]) {
        const drugie = wPodworku(g.w).find((k) => !g.st.felled.includes(k))!;
        sciac(g.sim, drugie);
        expect(drzewoWObwodzie(g.st, g.w), `${key} po drugim drzewie`).toBe(false);
        const koniec = goal(day1(g, { w: true }), 'drewno').how;
        expect(koniec, key).toContain('Spalić');
        expect(koniec).not.toContain('Ściąć drzewo');
      }
    }
  });

  it('dotyk: pień drzewa albo przytrzymanie palca na meblu', () => {
    const g = game('przymorze', 'zombie');
    sciac(g.sim, g.w.dryTree);
    const drzewo = goal(day1(g, { touch: true }), 'drewno').how;
    expect(drzewo).toContain('Stuknijcie pień drzewa.');
    expect(drzewo).toContain('spalcie mebel (przytrzymajcie na nim palec): trafi najpierw do kozy, reszta na skład.');
    const bez = goal(day1(g, { touch: true, w: true }), 'drewno').how;
    expect(bez).toContain(`przytrzymajcie palec na meblu ${g.words.szukanie.w}: „Spalić …”.`);
    expect(bez).not.toContain('Stuknijcie pień');
  });

  it('po angielsku, także w domu', () => {
    ustawJezyk('en');
    for (const key of DEMOS) {
      const g = game(key, 'zombie');
      sciac(g.sim, g.w.dryTree);
      for (const touch of [false, true]) {
        const po = goal(day1(g, { touch, w: true, wood: 1 }), 'drewno').how;
        expect(polskieSlowa(po), po).toEqual([]);
        if (ZOSTAJE[key])
          expect(po).toContain(touch ? 'Tap the trunk of a tree.' : 'Right-click a tree: “Chop down the tree”.');
        else {
          expect(po).toContain('The trees outside the fence are among the shamblers: ');
          expect(po).toContain(
            `${touch ? 'press and hold on' : 'right-click'} a piece of furniture ${g.e.szukanie.w}: “Burn the …”.`,
          );
          expect(po).toContain('It goes into the stove first, the rest onto the woodpile.');
        }
      }
    }
    expect(game('zielonki').e.szukanie.w).toBe('in the house');
    expect(game('przymorze').e.szukanie.w).toBe('in an empty flat');
  });

  it('bez drzew w obrębie siatki: w bloku mowa o pustym mieszkaniu, w domu o domu i bez słów z bloku', () => {
    for (const key of ['zielonki', 'przymorze'] as const) {
      const g = game(key, 'zombie');
      g.st.tut.step = TUT_STEPS.length;
      for (const k of wPodworku(g.w)) g.st.felled.push(k);
      g.st.felled.sort((a, b) => a - b);
      const po = goal(day1(g, { w: true }), 'drewno').how;
      if (dom(key)) {
        expect(po).toContain('prawy przycisk na meblu w domu: „Spalić …”.');
        expect(po).not.toMatch(FORBIDDEN_DOM);
      } else expect(po).toContain('prawy przycisk na meblu w pustym mieszkaniu: „Spalić …”.');
    }
  });

  it('w zwykłym trybie zawsze drzewo, także bez drzewa w obrębie siatki i bez świata', () => {
    for (const key of DEMOS) {
      const g = game(key, 'zwykly');
      sciac(g.sim, g.w.dryTree);
      for (const w of [true, false]) {
        const po = goal(day1(g, { w }), 'drewno').how;
        expect(po, `${key} świat ${w}`).toContain('Prawy przycisk na drzewie: „Ściąć drzewo”.');
        expect(po).toContain('W ostateczności spalcie mebel: trafi najpierw do kozy, reszta na skład.');
        expect(po).not.toContain('Spalić');
      }
    }
  });

  it('w zombie bez świata podpowiedź jak w zwykłym trybie', () => {
    const g = game('przymorze', 'zombie');
    sciac(g.sim, g.w.dryTree);
    expect(goal(day1(g, { w: false }), 'drewno').how).toContain('Prawy przycisk na drzewie: „Ściąć drzewo”.');
    expect(goal(day1(g, { w: true }), 'drewno').how).not.toContain('Ściąć drzewo');
  });
});

describe('U5: przeszukanie od zaznaczenia osoby', () => {
  const POCZATEK = {
    pl: { mysz: 'Zaznaczcie kogoś z ', dotyk: 'Stuknijcie kogoś z ' },
    en: { mysz: 'Select someone from ', dotyk: 'Tap someone from ' },
  } as const;

  it('podpowiedź zaczyna się od zaznaczenia i mówi o „Przeszukać …” (blok i dom, mysz i dotyk, oba języki)', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      for (const key of DEMOS)
        for (const touch of [false, true]) {
          const g = game(key);
          const jak = goal(day2(g, touch), 'przeszukaj').how;
          const start = POCZATEK[lang][touch ? 'dotyk' : 'mysz'];
          expect(jak.startsWith(start), `${lang} ${key} ${touch}: ${jak}`).toBe(true);
          expect(jak).toContain(lang === 'pl' ? g.words.zarzad.dk : g.e.krotko);
          expect(jak).toContain(lang === 'pl' ? '„Przeszukać …”' : '“Search the …”');
          expect(jak).toContain(
            lang === 'pl' ? 'kiedy nikt nie jest zaznaczony' : 'while nobody is selected and read its card',
          );
          if (lang === 'en') expect(polskieSlowa(jak), jak).toEqual([]);
          else if (dom(key)) expect(jak).not.toMatch(FORBIDDEN_DOM);
        }
    }
  });

  it('pełne brzmienie w bloku i w domu, mysz i dotyk', () => {
    const blok = game('przymorze');
    const dm = game('zielonki');
    expect(goal(day2(blok, false), 'przeszukaj').how).toBe(
      'Zaznaczcie kogoś z zarządu i prawy przycisk w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: klik w mieszkanie, kiedy nikt nie jest zaznaczony.',
    );
    expect(goal(day2(blok, true), 'przeszukaj').how).toBe(
      'Stuknijcie kogoś z zarządu i przytrzymajcie palec w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: stuknięcie w mieszkanie, kiedy nikt nie jest zaznaczony.',
    );
    expect(goal(day2(dm, false), 'przeszukaj').how).toBe(
      'Zaznaczcie kogoś z komitetu i prawy przycisk w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: klik w dom, kiedy nikt nie jest zaznaczony.',
    );
    expect(goal(day2(dm, true), 'przeszukaj').how).toBe(
      'Stuknijcie kogoś z komitetu i przytrzymajcie palec w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: stuknięcie w dom, kiedy nikt nie jest zaznaczony.',
    );
    ustawJezyk('en');
    expect(goal(day2(blok, false), 'przeszukaj').how).toBe(
      'Select someone from the board and right-click inside an empty flat: “Search the …”. To see which flats are empty, click a flat while nobody is selected and read its card.',
    );
    expect(goal(day2(blok, true), 'przeszukaj').how).toBe(
      'Tap someone from the board and press and hold inside an empty flat: “Search the …”. To see which flats are empty, tap a flat while nobody is selected and read its card.',
    );
    expect(goal(day2(dm, false), 'przeszukaj').how).toBe(
      'Select someone from the committee and right-click inside a room of the house: “Search the …”. To see what has been searched, click the house while nobody is selected and read its card.',
    );
    expect(goal(day2(dm, true), 'przeszukaj').how).toBe(
      'Tap someone from the committee and press and hold inside a room of the house: “Search the …”. To see what has been searched, tap the house while nobody is selected and read its card.',
    );
  });

  it('w grze tak to działa: bez zaznaczonej osoby menu jest puste, z osobą są polecenia „Przeszukać …”', () => {
    for (const key of DEMOS) {
      const g = game(key);
      expect(przeszukania(g.sim, []), `${key} bez zaznaczenia`).toEqual([]);
      const id = core(g.sim)[0].id;
      const pl = przeszukania(g.sim, [id]);
      expect(pl.length, `${key} z zarządem`).toBeGreaterThan(0);
      for (const { label } of pl) expect(label).toMatch(/^Przeszukać \S/);
      ustawJezyk('en');
      for (const { label } of przeszukania(g.sim, [id])) expect(label).toMatch(/^Search the \S/);
      ustawJezyk('pl');
    }
  });

  it('cel zalicza się dopiero po przeszukaniu pomieszczenia poleceniem z menu', () => {
    for (const key of DEMOS) {
      const g = game(key);
      expect(goal(day2(g), 'przeszukaj').done, `${key} przed`).toBe(false);
      const p = core(g.sim)[0];
      const cel = przeszukania(g.sim, [p.id])[0];
      expect(cel, `${key}: jest co przeszukać`).toBeTruthy();
      g.sim.push({ t: 'search', ids: [p.id], room: cel.room });
      until(g.sim, () => g.st.apts.some((a) => a.searched.length > 0), 9000);
      expect(
        g.st.apts.some((a) => a.searched.includes(cel.room)),
        `${key}: pokój przeszukany`,
      ).toBe(true);
      expect(goal(day2(g), 'przeszukaj').done, `${key} po`).toBe(true);
    }
  });
});

describe('U9: „a barricade” w angielskim celu obwodu', () => {
  it('mały rodzajnik przed zasiekami, mysz i dotyk', () => {
    ustawJezyk('en');
    for (const key of DEMOS)
      for (const touch of [false, true]) {
        const jak = goal(day2(game(key, 'zwykly'), touch), 'obwod').how;
        expect(jak, `${key} ${touch}`).toContain('a barricade in place of a stretch of fence');
        expect(jak).not.toContain('a Barricade');
      }
  });
});

describe('U10: krok z kozą mówi, że ktoś dołoży sam', () => {
  it('po polsku, mysz i dotyk', () => {
    for (const key of DEMOS)
      for (const touch of [false, true]) {
        const koza = goal(day1(game(key), { touch }), 'koza');
        expect(koza.text).toBe('Rozpalcie kozę.');
        expect(koza.how.endsWith(' Kto ma drewno, dołoży też sam.'), koza.how).toBe(true);
        expect(koza.how).toContain(
          touch ? 'Stuknijcie kozę w kuchni.' : 'Prawy przycisk na kozie w kuchni: „Dołożyć do kozy”.',
        );
      }
  });

  it('po angielsku, mysz i dotyk', () => {
    ustawJezyk('en');
    for (const key of DEMOS)
      for (const touch of [false, true]) {
        const koza = goal(day1(game(key), { touch }), 'koza');
        expect(koza.how.endsWith(' Whoever has wood will also feed it on their own.'), koza.how).toBe(true);
        expect(koza.how).toContain(
          touch ? 'Tap the stove in the kitchen.' : 'Right-click the stove in the kitchen: “Feed the stove”.',
        );
        expect(polskieSlowa(koza.how), koza.how).toEqual([]);
      }
  });
});

describe('słownik miejsca', () => {
  it('gdzie palić meble: w bloku w pustym mieszkaniu, w domu w domu', () => {
    const blok = game('przymorze');
    const dm = game('zielonki');
    expect([blok.words.szukanie.w, blok.e.szukanie.w]).toEqual(['w pustym mieszkaniu', 'in an empty flat']);
    expect([dm.words.szukanie.w, dm.e.szukanie.w]).toEqual(['w domu', 'in the house']);
    // skąd jeszcze deski i złom: sąsiednie domy tylko przy domu jednorodzinnym
    expect(blok.words.szukanie.obok).toBeNull();
    expect(blok.e.szukanie.obok).toBeNull();
    expect(dm.words.szukanie.obok).not.toBeNull();
    expect(dm.e.szukanie.obok).not.toBeNull();
  });
});
