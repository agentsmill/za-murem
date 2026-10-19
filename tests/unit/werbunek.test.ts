/* Werbunek wędrowców (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, część B): szansa zaproszenia z jedzenia,
   łóżka, napaści i celu wędrowca; osoba wędrowca z ziarna świata i numeru (nie ze st.rng); udane zaproszenie robi osobę
   zarządu z id w1 i domyślnymi priorytetami, przy pełnym zarządzie mieszkańca w wolnym łóżku (a bez łóżka albo w domu
   jednorodzinnym opcji nie ma); tryb zombie: ukryte ugryzienie bez pytania daje gorączkę, z pytaniem wędrowiec odchodzi;
   gra bez rozmów z wędrowcem ma ten sam skrót co przed werbunkiem (skróty z gałęzi bazowej dc6fdb5). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString, mulberry, nextRandom } from '../../src/core/rng.ts';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { commandsAt, jobText, type MenuItem } from '../../src/sim/orders.ts';
import { kolejnoscOsoby, priorytet, RODZAJE, ZARZAD_MAX } from '../../src/sim/praca.ts';
import {
  addCore,
  addResidents,
  capOf,
  createSim,
  okazjaWerbunku,
  type Pawn,
  removeResidents,
  Sim,
  type SimOpts,
  type SimState,
  szansaZaproszenia,
} from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import {
  celWedrowca,
  NAPISY,
  osobaWedrowca,
  szansaWerbunku,
  ugryzienieWedrowca,
  wiescEn,
  ZAPROS_TICKS,
} from '../../src/sim/wedrowcy.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { POLSKIE } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

const w = mockBlockM2();
const size = w.size;
const yard = new Set(w.fence.yard);
const FAR = tickAt(30, 10);
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const run = (sim: Sim, ok: () => boolean, max = 20000) => {
  let k = 0;
  for (; k < max && !ok(); k++) sim.step();
  return k;
};
/** jak run, ale bez szwendaczy, które tryb zombie sam stawia za dnia (przygotowanie sceny) */
const calm = (sim: Sim, ok: () => boolean, max = 20000) =>
  run(
    sim,
    () => {
      sim.st.pawns = sim.st.pawns.filter((p) => p.kind !== 'zombie');
      return ok();
    },
    max,
  );

/** gra z obcymi dnia 2 o 10:00; przychodzi tylko wędrowiec, najedzeni i ogrzani; ludzie ponad dwóch dokładani przez
    addCore, jeśli core > 2 w opcjach */
function gra(world: World, seed: number, opts: Partial<SimOpts> = {}): { sim: Sim; st: SimState; world: World } {
  const st = createSim(world, seed, { core: 2, obcy: true, ...opts });
  const sim = new Sim(world, st);
  st.tick = tickAt(2, 10);
  st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  const o = st.obcy!;
  o.next = FAR;
  o.wnext = st.tick;
  o.enext = FAR;
  for (const p of core(st)) {
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
  }
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 20 * TICKS_PER_HOUR;
  return { sim, st, world };
}

/** dokłada osoby przez addCore, aż zarząd ma n osób (zwykła ścieżka zdarzeń: bez losowania poza st.rng) */
function dopelnij(sim: Sim, world: World, n: number): void {
  const st = sim.st;
  for (let k = 0; core(st).length < n; k++)
    addCore(
      st,
      world,
      makePerson(mulberry(900 + k), new Set(st.people.map((q) => q.first)), () => st.nextId++),
    );
}

/** wędrowiec przy siatce po rozmowie: zwraca jego pionek i osobę z zarządu, która rozmawiała */
function pozagadaniu(sim: Sim, zombie = false): { t: Pawn; p: Pawn } {
  const st = sim.st;
  const step = zombie ? calm : run;
  sim.step();
  const t = st.pawns.find((q) => q.kind === 'wedrowiec')!;
  expect(t).toBeDefined();
  step(sim, () => t.job?.phase === 1);
  const p = core(st)[0];
  sim.push({ t: 'talk', ids: [p.id], target: t.id });
  step(sim, () => p.job?.t === 'talk' && p.job.phase === 1);
  step(sim, () => p.job?.t !== 'talk');
  expect(t.job?.what).toBe('zagadany');
  expect(st.obcy!.rozmowa?.id).toBe(t.id);
  return { t, p };
}

const menu = (sim: Sim, world: World, t: Pawn): MenuItem[] =>
  commandsAt(
    sim.st,
    world,
    core(sim.st).map((q) => q.id),
    Math.floor(t.y) * world.size + Math.floor(t.x),
  );
const zaprosMenu = (sim: Sim, world: World, t: Pawn) => menu(sim, world, t).find((m) => m.cmd.t === 'zapros');

/** ustawia st.rng tak, żeby następne losowanie wypadło poniżej szansy (ok) albo nie (!ok) */
function ustawLosowanie(st: SimState, ok: boolean, szansa: number): void {
  for (let s = 1; s < 100000; s++) {
    const r = { s };
    if (nextRandom(r) < szansa === ok) {
      st.rng.s = s;
      return;
    }
  }
  throw new Error('brak ziarna losowania');
}

/** polecenie zaproszenia (albo pytania o rękę) i przewinięcie aż do rozstrzygnięcia; losowanie ustawione tuż przed nim
    na prawdziwą szansę z chwili rozstrzygnięcia */
function zapros(sim: Sim, p: Pawn, t: Pawn, ok: boolean, how: 'zapros' | 'reka' = 'zapros', world: World = w): void {
  const st = sim.st;
  sim.push({ t: how, ids: [p.id], target: t.id });
  run(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
  expect(p.job?.what).toBe(how);
  while (p.job?.t === 'zapros') {
    if (how === 'zapros' && p.job.phase === 1 && st.tick >= p.job.until - 1)
      ustawLosowanie(st, ok, szansaZaproszenia(st, world));
    sim.step();
  }
}

describe('Szansa werbunku', () => {
  it('0,30 bazowo, +0,20 jedzenie, +0,15 łóżko, −0,30 napad, zakres 0,05–0,85, cel połowa', () => {
    const baza = { jedzenieNaGlowe: 0, wolneLozko: false, napadDwieDoby: false, maCel: false };
    expect(szansaWerbunku(baza)).toBeCloseTo(0.3);
    expect(szansaWerbunku({ ...baza, jedzenieNaGlowe: 2 })).toBeCloseTo(0.5);
    expect(szansaWerbunku({ ...baza, jedzenieNaGlowe: 1.99 })).toBeCloseTo(0.3);
    expect(szansaWerbunku({ ...baza, wolneLozko: true })).toBeCloseTo(0.45);
    expect(szansaWerbunku({ ...baza, napadDwieDoby: true })).toBeCloseTo(0.05);
    expect(szansaWerbunku({ jedzenieNaGlowe: 2, wolneLozko: true, napadDwieDoby: false, maCel: false })).toBeCloseTo(
      0.65,
    );
    expect(szansaWerbunku({ jedzenieNaGlowe: 0, wolneLozko: false, napadDwieDoby: true, maCel: true })).toBeCloseTo(
      0.025,
    );
    // górna granica 0,85 nie jest przekraczana
    expect(
      szansaWerbunku({ jedzenieNaGlowe: 9, wolneLozko: true, napadDwieDoby: false, maCel: false }),
    ).toBeLessThanOrEqual(0.85);
    // cel: połowa tego, co bez celu
    expect(szansaWerbunku({ jedzenieNaGlowe: 2, wolneLozko: true, napadDwieDoby: false, maCel: true })).toBeCloseTo(
      0.325,
    );
  });
});

describe('Osoba wędrowca', () => {
  it('z ziarna świata i numeru, ta sama przy powtórce, inna dla innego numeru i świata', () => {
    const a = osobaWedrowca(514719324, 17);
    expect(osobaWedrowca(514719324, 17)).toEqual(a);
    expect(a.id).toBe('');
    expect(a.first.length).toBeGreaterThan(0);
    expect(a.prof.length).toBeGreaterThan(0);
    expect(a.age).toBeGreaterThanOrEqual(18);
    const inne = new Set<string>();
    for (let nr = 1; nr <= 30; nr++) inne.add(JSON.stringify(osobaWedrowca(514719324, nr)));
    expect(inne.size).toBeGreaterThan(25);
    expect(JSON.stringify(osobaWedrowca(7, 17))).not.toBe(JSON.stringify(a));
  });

  it('połowa ma cel, co piąty ukrywa ugryzienie, każdy według własnego ziarna', () => {
    let cel = 0;
    let ugryz = 0;
    for (let nr = 1; nr <= 1000; nr++) {
      if (celWedrowca(1234, nr)) cel++;
      if (ugryzienieWedrowca(1234, nr)) ugryz++;
      expect(celWedrowca(1234, nr)).toBe(celWedrowca(1234, nr));
    }
    expect(cel).toBeGreaterThan(430);
    expect(cel).toBeLessThan(570);
    expect(ugryz).toBeGreaterThan(150);
    expect(ugryz).toBeLessThan(250);
  });

  it('rozmowa zapisuje osobę z ziarna, a st.rng zużywa tylko tyle co wieść; po angielsku wieść ma osobę', () => {
    const { sim, st } = gra(w, 3);
    const { t } = pozagadaniu(sim);
    const r = st.obcy!.rozmowa!;
    expect(r.osoba).toEqual(osobaWedrowca(w.seed, t.id, new Set(st.people.map((q) => q.first))));
    expect(r.cel).toBe(celWedrowca(w.seed, t.id));
    expect(r.ugryziony).toBe(false);
    expect(st.obcy!.werbunek).toBeUndefined();
    const text = st.obcy!.wiesc!.text;
    expect(text.startsWith('Wędrowiec mówi')).toBe(true);
    expect(text).toContain(`Przedstawia się: ${r.osoba.first}, ${r.osoba.prof.toLowerCase()}, ${r.osoba.age}`);
    expect(text.includes('Idzie do rodziny')).toBe(r.cel);
    const en = wiescEn(text);
    expect(POLSKIE.test(en.replace(r.osoba.first, '')), en).toBe(false);
    expect(en).toContain(`Introduces themselves: ${r.osoba.first}, `);
    expect(en.includes('Heading to family')).toBe(r.cel);
  });
});

describe('Zaproszenie do zarządu', () => {
  it('menu po rozmowie: „Zaprosić do nas (N% szans)” raz, z szansą z jedzenia, łóżka i celu', () => {
    const { sim, st } = gra(w, 3);
    const { t } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const item = zaprosMenu(sim, w, t)!;
    // zapasy na start są duże, w mieszkaniu zarządu jest więcej łóżek niż osób: 0,30 + 0,20 + 0,15
    expect(item.label).toBe('Zaprosić do nas (65% szans)');
    expect(item.off).toBeUndefined();
    expect(item.quick).toBe(false);
    expect(menu(sim, w, t).some((m) => m.cmd.t === 'reka')).toBe(false);
    st.obcy!.rozmowa!.cel = true;
    expect(zaprosMenu(sim, w, t)!.label).toBe(`Zaprosić do nas (${Math.round(0.325 * 100)}% szans)`);
    // po napaści w ciągu dwóch dób szansa spada o 0,30
    st.obcy!.rozmowa!.cel = false;
    st.obcy!.napady = [{ kto: 'handlarz', tick: st.tick - TICKS_PER_DAY }];
    expect(zaprosMenu(sim, w, t)!.label).toBe('Zaprosić do nas (35% szans)');
    st.obcy!.napady = [{ kto: 'wedrowiec', tick: st.tick - 2 * TICKS_PER_DAY - 1 }];
    expect(zaprosMenu(sim, w, t)!.label).toBe('Zaprosić do nas (65% szans)');
    // mało jedzenia: bez dodatku +0,20
    for (const th of st.things) if (th.kind === 'jedzenie' || th.kind === 'posilek') th.n = 0;
    expect(zaprosMenu(sim, w, t)!.label).toBe('Zaprosić do nas (45% szans)');
    // bez rozmowy (zagadany inny wędrowiec) i bez „zagadany” opcji nie ma
    st.obcy!.rozmowa!.id = -1;
    expect(zaprosMenu(sim, w, t)).toBeUndefined();
  });

  it('udane zaproszenie: osoba zarządu z id w1 w jego miejscu i z jego wyglądem, domyślne priorytety, wchodzi bramą', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const osoba = st.obcy!.rozmowa!.osoba;
    const before = { id: t.id, look: t.look, x: t.x, y: t.y };
    const idsBefore = core(st).length;
    const nextId = st.nextId;
    const nextPawn = st.nextPawn;
    zapros(sim, p, t, true);
    expect(t.kind).toBe('core');
    expect(t.id).toBe(before.id);
    expect(t.look).toBe(before.look);
    expect(Math.hypot(t.x - before.x, t.y - before.y)).toBeLessThan(1.5);
    expect(core(st)).toHaveLength(idsBefore + 1);
    const person = st.people[t.person];
    expect(person.id).toBe('w1');
    expect(person.name).toBe(osoba.name);
    expect(person.prof).toBe(osoba.prof);
    expect(person.age).toBe(osoba.age);
    expect(person.skills).toEqual(osoba.skills);
    expect(person.home).toBe(w.hq);
    expect(st.obcy!.werbunek).toBe(1);
    expect(st.obcy!.rozmowa).toBeUndefined();
    // liczniki s… i pionków bez zmian: osoba zwerbowana nie bierze numeru ze starych liczników
    expect(st.nextId).toBe(nextId);
    expect(st.nextPawn).toBe(nextPawn);
    expect(t.hp).toBeUndefined();
    expect(t.needs?.health).toBe(90);
    expect(t.bite).toBeUndefined();
    // domyślne priorytety z umiejętności, bez żadnego wpisu w ustawieniach pracy
    expect(st.praca).toBeUndefined();
    expect(priorytet(st, t.person, 'ogien')).toBe(1);
    expect(priorytet(st, t.person, 'noszenie')).toBe(3);
    expect(kolejnoscOsoby(st, t.person).length).toBeGreaterThan(0);
    for (const r of RODZAJE) expect(priorytet(st, t.person, r)).toBeGreaterThanOrEqual(0);
    // reszta zarządu ma nastrój, nowa osoba nie
    expect(p.moods.find((m) => m.why === 'Nowa osoba w zarządzie')?.d).toBe(3);
    expect(t.moods.some((m) => m.why === 'Nowa osoba w zarządzie')).toBe(false);
    // wchodzi bramą na podwórko
    expect(yard.has(tileOf(t))).toBe(false);
    run(sim, () => yard.has(tileOf(t)), 4000);
    expect(yard.has(tileOf(t))).toBe(true);
    // wędrowiec już nie przychodzi jako wędrowiec, a odczyt dla interfejsu widzi go w zarządzie
    expect(st.pawns.some((q) => q.kind === 'wedrowiec')).toBe(false);
    expect(snapshot(st, w).people.some((q) => q.id === 'w1' && q.pawn === t.id)).toBe(true);
  });

  it('nieudane: dziękuje i idzie dalej, bez kary i bez nowej osoby, a drugi raz zaprosić się nie da', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const people = st.people.length;
    zapros(sim, p, t, false);
    expect(t.kind).toBe('wedrowiec');
    expect(st.people).toHaveLength(people);
    expect(st.obcy!.werbunek).toBeUndefined();
    expect(st.obcy!.rozmowa).toBeUndefined();
    expect(st.obcy!.wiesc!.text).toBe('Wędrowiec dziękuje za zaproszenie i idzie dalej.');
    expect(wiescEn(st.obcy!.wiesc!.text)).toBe('The wanderer thanks you for the invitation and moves on.');
    expect(p.moods.some((m) => m.why === 'Nowa osoba w zarządzie')).toBe(false);
    expect(core(st).every((q) => q.moods.every((m) => m.why !== 'Napadliśmy na wędrowca'))).toBe(true);
    run(sim, () => (t.job?.phase ?? 4) >= 2, 4);
    expect(t.job?.phase).toBeGreaterThanOrEqual(2);
    expect(zaprosMenu(sim, w, t)).toBeUndefined();
    run(sim, () => !st.pawns.some((q) => q.kind === 'wedrowiec'));
    expect(st.pawns.some((q) => q.kind === 'wedrowiec')).toBe(false);
  });

  it('praca zaproszenia trwa dwie minuty przy siatce, ma opis, a wędrowiec zostaje do rozstrzygnięcia', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    sim.step();
    expect(p.job?.t).toBe('zapros');
    expect(p.job?.order).toBe(true);
    // drugie polecenie na tego samego wędrowca w trakcie nic nie zmienia
    const drugi = core(st)[1];
    sim.push({ t: 'zapros', ids: [drugi.id], target: t.id });
    sim.step();
    expect(drugi.job?.t).not.toBe('zapros');
    expect(zaprosMenu(sim, w, t)).toBeUndefined();
    run(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    expect(jobText(st, w, p)).toBe('Zaprasza wędrowca przez siatkę.');
    const t0 = st.tick;
    expect(yard.has(tileOf(p))).toBe(true);
    run(sim, () => p.job?.t !== 'zapros');
    expect(st.tick - t0).toBeLessThanOrEqual(ZAPROS_TICKS + 2);
    expect(st.tick - t0).toBeGreaterThanOrEqual(ZAPROS_TICKS - 2);
  });

  it('wędrowiec, który odszedł przed rozmową przy siatce, nie zostaje zwerbowany', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    sim.step();
    // ucieka, zanim osoba dojdzie
    t.job!.phase = 3;
    run(sim, () => p.job?.t !== 'zapros', 2000);
    expect(t.kind).toBe('wedrowiec');
    expect(st.obcy!.werbunek).toBeUndefined();
  });

  it('dwóch kolejnych zwerbowanych dostaje w1 i w2', () => {
    const { sim, st } = gra(w, 3);
    const a = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    zapros(sim, a.p, a.t, true);
    expect(st.people[a.t.person].id).toBe('w1');
    // następny wędrowiec
    const o = st.obcy!;
    o.wnext = st.tick;
    run(sim, () => st.pawns.some((q) => q.kind === 'wedrowiec'), 2000);
    const t2 = st.pawns.find((q) => q.kind === 'wedrowiec')!;
    run(sim, () => t2.job?.phase === 1);
    const p2 = core(st)[1];
    sim.push({ t: 'talk', ids: [p2.id], target: t2.id });
    run(sim, () => p2.job?.t === 'talk' && p2.job.phase === 1);
    run(sim, () => p2.job?.t !== 'talk');
    st.obcy!.rozmowa!.cel = false;
    zapros(sim, p2, t2, true);
    expect(st.people[t2.person].id).toBe('w2');
    expect(st.obcy!.werbunek).toBe(2);
    expect(new Set(st.people.map((q) => q.id)).size).toBe(st.people.length);
  });

  it('kronika zarządu dostaje jedną linię na zwerbowanego, bez zmiany zaufania; bez werbunku pola nie ma', () => {
    const { sim, st } = gra(w, 3);
    const gov = newGov(3);
    govUpdate(gov, govInput(st, w, 0));
    expect('werbunekN' in gov).toBe(false);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const trust = gov.trust;
    const anger = gov.anger;
    zapros(sim, p, t, true);
    const first = st.people[t.person].first;
    govUpdate(gov, govInput(st, w, 1));
    expect(gov.werbunekN).toBe(1);
    const line = gov.log.at(-1)!.txt;
    expect(line.pl).toBe(`Z ulicy do zarządu dołącza ${first}.`);
    expect(line.en).toBe(`${first} joins the board from the street.`);
    govUpdate(gov, govInput(st, w, 2));
    expect(gov.log.filter((l) => l.txt.pl.includes(`dołącza ${first}`))).toHaveLength(1);
    expect(gov.trust).toBeCloseTo(trust, 5);
    expect(gov.anger).toBeCloseTo(anger, 5);
  });

  it('po angielsku menu, opis pracy i nastrój mają angielskie napisy', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    ustawJezyk('en');
    expect(zaprosMenu(sim, w, t)!.label).toBe('Invite to join us (65% chance)');
    expect(tr(NAPISY.nastrojNowy)).toBe('New person on the board');
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    run(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    expect(jobText(st, w, p)).toBe('Inviting the wanderer through the fence.');
    expect(POLSKIE.test(tr(NAPISY.zaprosicMieszkanca(40))), 'mieszkaniec').toBe(false);
  });
});

describe('Pełny zarząd i łóżka mieszkańców', () => {
  it('zwerbowany zostaje mieszkańcem w wolnym łóżku; menu mówi o mieszkańcu; zarząd się nie powiększa', () => {
    const { sim, st } = gra(w, 3);
    dopelnij(sim, w, ZARZAD_MAX);
    expect(core(st)).toHaveLength(ZARZAD_MAX);
    removeResidents(st, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const item = zaprosMenu(sim, w, t)!;
    // 40 porcji na 12 osób to ponad dwie na głowę: 0,30 + 0,20 + 0,15 za wolne łóżko mieszkańca
    expect(item.label).toBe('Zaprosić do nas jako mieszkańca (65%)');
    expect(item.off).toBeUndefined();
    const residents = st.pawns.filter((q) => q.kind === 'resident').length;
    zapros(sim, p, t, true);
    expect(t.kind).toBe('resident');
    expect(core(st)).toHaveLength(ZARZAD_MAX);
    expect(st.pawns.filter((q) => q.kind === 'resident')).toHaveLength(residents + 1);
    expect(st.people[t.person].id).toBe('w1');
    expect(t.apt).toBe(1);
    expect(t.job?.t).toBe('arrive');
    expect(t.job?.target).toBe(1);
    const bed = st.things.find((th) => th.owner === t.id);
    expect(bed).toBeDefined();
    expect(['lozko', 'wersalka', 'lozka_pietrowe']).toContain(bed!.kind);
    // nowa osoba w zarządzie to nie to samo: nastroju dla zarządu nie ma
    expect(core(st).some((q) => q.moods.some((m) => m.why === 'Nowa osoba w zarządzie'))).toBe(false);
    // odczyt dla interfejsu widzi go wśród mieszkańców z osobą
    expect(snapshot(st, w).lokatorzy.some((q) => q.id === 'w1' && q.pawn === t.id)).toBe(true);
    // dochodzi do swojego mieszkania
    run(sim, () => t.job?.t !== 'arrive' || tileOf(t) === t.job.tile, 4000);
    expect(t.job?.t === 'arrive' ? tileOf(t) === t.job.tile : true).toBe(true);
    // kronika: zamieszka jako mieszkaniec
    const gov = newGov(3);
    govUpdate(gov, govInput(st, w, 0));
    expect(gov.log.at(-1)!.txt.pl).toBe(
      `${st.people[t.person].first} zamieszka u nas jako ${st.people[t.person].f ? 'mieszkanka' : 'mieszkaniec'}.`,
    );
  });

  it('bez wolnego łóżka mieszkańców opcja jest wyszarzona z napisem „Brak miejsca”, a polecenie nic nie robi', () => {
    const { sim, st } = gra(w, 3);
    dopelnij(sim, w, ZARZAD_MAX);
    removeResidents(st, 3);
    addResidents(st, w, 2);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const item = zaprosMenu(sim, w, t)!;
    expect(item.label).toBe('Zaprosić do nas');
    expect(item.off).toBe('Brak miejsca');
    ustawJezyk('en');
    expect(zaprosMenu(sim, w, t)!.off).toBe('No room');
    ustawJezyk('pl');
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    sim.step();
    sim.step();
    expect(p.job?.t).not.toBe('zapros');
    expect(t.kind).toBe('wedrowiec');
  });

  it('zarząd o jedną osobę poniżej limitu: do zarządu; z limitem: tylko mieszkaniec', () => {
    const { sim, st } = gra(w, 3);
    dopelnij(sim, w, ZARZAD_MAX - 1);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    expect(zaprosMenu(sim, w, t)!.label).toMatch(/^Zaprosić do nas \(\d+% szans\)$/);
    zapros(sim, p, t, true);
    expect(core(st)).toHaveLength(ZARZAD_MAX);
    expect(t.kind).toBe('core');
  });
});

/** prawdziwe demo na świeżym świecie (jak praca-blok.ts) */
function swiezy(key: string): World {
  const dir = path.resolve(import.meta.dirname, '../../public/demo');
  const demo = JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), 'utf8'));
  return buildWorld(demo.geo, { seed: Number.parseInt(hashString(demo.addr), 16) || 2051, street: demo.street });
}

describe('Dom jednorodzinny (Zielonki)', () => {
  it('przy pełnym zarządzie zaproszenia nie ma wcale, przy niepełnym jest', () => {
    const world = swiezy('zielonki');
    const { sim, st } = gra(world, 5, { core: 4, mode: 'zwykly' });
    const { t } = pozagadaniu(sim);
    expect(zaprosMenu(sim, world, t)).toBeDefined();
    dopelnij(sim, world, ZARZAD_MAX);
    expect(core(st)).toHaveLength(ZARZAD_MAX);
    expect(zaprosMenu(sim, world, t)).toBeUndefined();
    // polecenie z pominięciem menu też nic nie robi
    const p = core(st)[0];
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    sim.step();
    sim.step();
    expect(p.job?.t).not.toBe('zapros');
  });
});

describe('Prawdziwe demo: zwerbowany wchodzi bramą', () => {
  it.each(['przymorze', 'lanciego', 'zielonki'])(
    '%s: zaproszony przy siatce idzie na podwórko i do siedziby',
    (key) => {
      const world = swiezy(key);
      const dom = new Set(world.fence.yard);
      const { sim, st } = gra(world, 4, { core: 4, mode: 'zwykly' });
      const { t, p } = pozagadaniu(sim);
      st.obcy!.rozmowa!.cel = false;
      zapros(sim, p, t, true, 'zapros', world);
      expect(t.kind).toBe('core');
      expect(st.people[t.person].id).toBe('w1');
      const tile = () => Math.floor(t.y) * world.size + Math.floor(t.x);
      expect(dom.has(tile())).toBe(false);
      run(sim, () => dom.has(tile()), 6000);
      expect(dom.has(tile())).toBe(true);
    },
  );
});

describe('Tryb zombie: ugryzienie wędrowca', () => {
  const zombie = () => gra(w, 3, { core: 2, mode: 'zombie' });

  it('w trybie zombie menu ma „Zapytać o rękę” przed zaproszeniem, a w zwykłym go nie ma', () => {
    const { sim, st } = zombie();
    const { t } = pozagadaniu(sim, true);
    st.obcy!.rozmowa!.cel = false;
    const m = menu(sim, w, t);
    const k = m.findIndex((x) => x.cmd.t === 'reka');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(m[k].label).toBe('Zapytać o rękę');
    expect(m.findIndex((x) => x.cmd.t === 'zapros')).toBeGreaterThan(k);
    ustawJezyk('en');
    expect(menu(sim, w, t).find((x) => x.cmd.t === 'reka')!.label).toBe('Ask to see their arm');
  });

  it('ukryte ugryzienie bez pytania: gorączka od chwili ugryzienia, jak u sąsiadów', () => {
    const { sim, st } = zombie();
    const { t, p } = pozagadaniu(sim, true);
    st.obcy!.rozmowa!.cel = false;
    st.obcy!.rozmowa!.ugryziony = true;
    zapros(sim, p, t, true);
    expect(t.kind).toBe('core');
    expect(t.bite).toBeDefined();
    expect(st.tick - t.bite!).toBeGreaterThanOrEqual(TICKS_PER_HOUR);
    expect(st.tick - t.bite!).toBeLessThanOrEqual(7 * TICKS_PER_HOUR);
    const fever = t.moods.find((m) => m.why === 'Gorączka po ugryzieniu')!;
    expect(fever.d).toBe(-15);
    expect(t.limb).toBe(true);
  });

  it('z pytaniem o rękę ugryziony odchodzi bez werbunku, a pytanie raz', () => {
    const { sim, st } = zombie();
    const { t, p } = pozagadaniu(sim, true);
    st.obcy!.rozmowa!.cel = false;
    st.obcy!.rozmowa!.ugryziony = true;
    const people = st.people.length;
    sim.push({ t: 'reka', ids: [p.id], target: t.id });
    calm(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    expect(jobText(st, w, p)).toBe('Pyta wędrowca o rękę.');
    calm(sim, () => p.job?.t !== 'zapros');
    expect(t.kind).toBe('wedrowiec');
    expect(st.people).toHaveLength(people);
    expect(st.obcy!.werbunek).toBeUndefined();
    expect(st.obcy!.rozmowa).toBeUndefined();
    expect(st.obcy!.wiesc!.text).toBe('Ocalały nie chce pokazać ręki i odchodzi.');
    calm(sim, () => (t.job?.phase ?? 4) >= 2, 4);
    expect(t.job?.phase).toBeGreaterThanOrEqual(2);
    expect(zaprosMenu(sim, w, t)).toBeUndefined();
  });

  it('zdrowy po pytaniu o rękę: można go zaprosić, bez gorączki, a pytać drugi raz się nie da', () => {
    const { sim, st } = zombie();
    const { t, p } = pozagadaniu(sim, true);
    st.obcy!.rozmowa!.cel = false;
    st.obcy!.rozmowa!.ugryziony = false;
    sim.push({ t: 'reka', ids: [p.id], target: t.id });
    calm(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    calm(sim, () => p.job?.t !== 'zapros');
    expect(st.obcy!.rozmowa?.pytali).toBe(true);
    expect(st.obcy!.wiesc!.text).toBe('Ocalały podwija rękaw: ani śladu zębów.');
    expect(menu(sim, w, t).some((m) => m.cmd.t === 'reka')).toBe(false);
    expect(zaprosMenu(sim, w, t)).toBeDefined();
    // polecenie z pominięciem menu też nie zadziała drugi raz
    sim.push({ t: 'reka', ids: [p.id], target: t.id });
    sim.step();
    sim.step();
    expect(p.job?.t).not.toBe('zapros');
    // zaproszony po sprawdzeniu ręki nie ma gorączki, nawet jeśli ugryzienie było
    st.obcy!.rozmowa!.ugryziony = true;
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    calm(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    ustawLosowanie(st, true, szansaZaproszenia(st, w));
    calm(sim, () => p.job?.t !== 'zapros');
    expect(t.kind).toBe('core');
    expect(t.bite).toBeUndefined();
  });

  it('w zwykłym trybie pytanie o rękę nic nie robi, a ugryzienia nie ma', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    expect(st.obcy!.rozmowa!.ugryziony).toBe(false);
    sim.push({ t: 'reka', ids: [p.id], target: t.id });
    sim.step();
    sim.step();
    expect(p.job?.t).not.toBe('zapros');
  });
});

/* Skróty „jak przed zmianą” w tym pliku to przebieg bez rozmów, czyli bez kodu werbunku w akcji. Pierwszy raz liczone na
   gałęzi bazowej dc6fdb5 sprzed werbunku; potem przypięte od nowa po scaleniu z `pelna-gra` b49c11c (książki z badań),
   więc porównują z przebiegiem po scaleniu, a nie z dc6fdb5; i jeszcze raz po poprawkach przeglądu końcowego: zmienia je
   tylko poprawka pilnej potrzeby (`pilneDoZaradzenia` zamiast `urgent` w think() i work()), bo z nią cofniętą wracają
   dawne wartości (mock 46266382, a6dda24c, be1d87c6; Przymorze 0384b5e7; Zielonki 2219d72d bez zmian); i jeszcze raz po
   decyzji Mateusza z 19.10.2026 o przełączniku „może wychodzić za siatkę” domyślnie włączonym w trybie zwykłym:
   zmienia on skróty całego trybu zwykłego (oba mocki, Przymorze, Zielonki; tryb zombie bez zmian, bo tam jest domyślnie
   wyłączony), bo zarząd bez polecenia wychodzi za dnia po drewno, łupy i szaber za siatkę. Z domyślną cofniętą na
   wyłączony wracają dokładnie dawne wartości (mock 1efcc694, 3c818c59; Przymorze b1cf8d4c; Zielonki 2219d72d); i jeszcze
   raz po decyzji kontrolera z 19.10.2026, że ścinanie z automatu za siatką kończy się wniesieniem całego drewna z drzewa
   (`haulOn` bez polecenia): zmienia skróty trybu zwykłego, a z dawnym `haulOn` (tylko z polecenia) wracają wartości
   z poprzedniego zdania (mock bbf6d867, 4b0de639; Przymorze da778c72; Zielonki 271ad242), tryb zombie bez zmian; i jeszcze
   raz po warunku, że Drwal nie rusza do drzew za siatką, gdy w składzie nie ma miejsca na ich drewno (`startDrwal`): bez
   tego warunku wracają wartości: mock 25337290, 8caed666; Przymorze 9f9e2962; Zielonki b4f9ea8f. */
describe('Gra bez rozmów z wędrowcem', () => {
  /** gra z obcymi przez trzy doby bez żadnego polecenia (skróty: komentarz nad blokiem) */
  const bez = (world: World, seed: number, opts: Partial<SimOpts>) => {
    const sim = new Sim(world, createSim(world, seed, { obcy: true, ...opts }));
    const widziani = new Set<number>();
    for (let k = 0; k < 3 * TICKS_PER_DAY; k++) {
      sim.step();
      for (const p of sim.st.pawns) if (p.kind === 'wedrowiec') widziani.add(p.id);
    }
    return { hash: sim.hash(), wedrowcow: widziani.size, st: sim.st };
  };

  it('ten sam skrót co przed zmianą, mimo że wędrowcy przychodzą i odchodzą', () => {
    const a = bez(w, 3, { core: 2 });
    expect(a.wedrowcow).toBeGreaterThanOrEqual(3);
    // skróty przeliczone po scaleniu przełącznika „za siatkę” domyślnie włączonego (praca-ludzi) z kozą z głową
    // i wydarzeniami etapów 1–2: każda strona osobno dawała 11b2b8b3 i ce9fc89e, razem automat wcześniej idzie po drewno za siatkę
    expect(a.hash).toBe('f77e096b');
    expect(a.st.obcy!.rozmowa).toBeUndefined();
    expect('werbunek' in a.st.obcy!).toBe(false);
    expect(bez(w, 7, { core: 4 }).hash).toBe('a5eeb997');
    expect(bez(w, 3, { core: 4, mode: 'zombie' }).hash).toBe('07139a8c');
  });

  it('ten sam skrót co przed zmianą na prawdziwych demach (Przymorze, Zielonki)', () => {
    // Skróty przeliczone po scaleniu z `pelna-gra` b49c11c (przed nim: Przymorze 143e6ce4, Zielonki 732dc2e0). Pierwsza
    // różnica wypada w dobie 3 przed 8:00: Szaber (automat pracy ludzi) przeszukuje pomieszczenie, a przeszukanie z
    // gałęzi `badania` losuje książkę i dopisuje do stanu `books` i `bookLog`. Poza tymi polami stan w tym ticku jest
    // ten sam co przed scaleniem; werbunek nic tu nie zmienia (przebieg bez rozmów).
    // Zielonki przeliczone po scaleniu z `noc-integracja` f13ad36 (przed nim 2219d72d): koza z głową (sztuka drewna pali się
    // godzinę, `BURN_TICKS`; bez polecenia dokłada się tylko wtedy, gdy ogień jest potrzebny, `kozaWanted`; suche drzewo
    // z samouczka daje połowę drewna, `dryWood`). Sprawdzone od drugiej strony: z `BURN_TICKS` pół godziny, `kozaWanted`
    // zawsze prawdziwą i `dryWood` równym `woodFrom` ten sam przebieg znów daje 2219d72d, a Przymorze nie zmienia się wcale.
    // Przeliczone znów po scaleniu z pełną grą (wydarzenia etapów 1–2) i z przełącznikiem „za siatkę” domyślnie
    // włączonym w trybie zwykłym (decyzja Mateusza 19.10.2026; na praca-ludzi były edbb0234 i 59c8df21, a przed
    // tym scaleniem b1cf8d4c i a9cefa21).
    expect(bez(swiezy('przymorze'), 5, { core: 4, mode: 'zwykly' }).hash).toBe('60cdcbe4');
    expect(bez(swiezy('zielonki'), 5, { core: 4, mode: 'zwykly' }).hash).toBe('d1bc0167');
  });
});

/** kolejny wędrowiec po rozmowie: czeka na jego przyjście (termin ustawiony na teraz, także po zmroku następnego dnia) */
function kolejnaRozmowa(sim: Sim): { t: Pawn; p: Pawn } {
  const st = sim.st;
  st.obcy!.wnext = st.tick;
  run(sim, () => st.pawns.some((q) => q.kind === 'wedrowiec'));
  const t = st.pawns.find((q) => q.kind === 'wedrowiec')!;
  expect(t).toBeDefined();
  run(sim, () => t.job?.phase === 1);
  const p = core(st)[0];
  sim.push({ t: 'talk', ids: [p.id], target: t.id });
  run(sim, () => p.job?.t === 'talk' && p.job.phase === 1);
  run(sim, () => p.job?.t !== 'talk');
  expect(t.job?.what).toBe('zagadany');
  st.obcy!.rozmowa!.cel = false;
  return { t, p };
}

describe('Miejsce ponad limit zarządu: łóżko i pojemność', () => {
  it('Lanciego z pełnym zarządem: zwerbowani zatrzymują się na capOf, choć łóżek jest więcej', () => {
    const world = swiezy('lanciego');
    const { sim, st } = gra(world, 4, { core: 4, mode: 'zwykly' });
    dopelnij(sim, world, ZARZAD_MAX);
    const mieszkancy = () => st.pawns.filter((q) => q.kind === 'resident').length;
    const cap = capOf(st, world);
    expect(mieszkancy()).toBeLessThan(cap);
    // dopóki jest miejsce (łóżko i pojemność), zaproszenie prowadzi do mieszkańca
    let przyjeci = 0;
    while (okazjaWerbunku(st, world).dokad === 'mieszkaniec') {
      expect(przyjeci, 'pętla się nie kończy').toBeLessThan(10);
      const { t, p } = kolejnaRozmowa(sim);
      expect(zaprosMenu(sim, world, t)!.label).toMatch(/^Zaprosić do nas jako mieszkańca \(\d+%\)$/);
      zapros(sim, p, t, true, 'zapros', world);
      expect(t.kind).toBe('resident');
      przyjeci++;
    }
    expect(przyjeci).toBeGreaterThan(0);
    // stanęło na pojemności: nie więcej mieszkańców niż capOf
    expect(mieszkancy()).toBe(capOf(st, world));
    expect(mieszkancy()).toBe(cap);
    expect(okazjaWerbunku(st, world)).toMatchObject({ dokad: 'brak', apt: -1, wolneLozko: false });
    // następny wędrowiec: opcja wyszarzona, szansy nie ma, polecenie nic nie robi
    const { t, p } = kolejnaRozmowa(sim);
    const item = zaprosMenu(sim, world, t)!;
    expect(item.off).toBe('Brak miejsca');
    expect(szansaZaproszenia(st, world)).toBe(0);
    ustawJezyk('en');
    expect(zaprosMenu(sim, world, t)!.off).toBe('No room');
    ustawJezyk('pl');
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    sim.step();
    sim.step();
    expect(p.job?.t).not.toBe('zapros');
    expect(t.kind).toBe('wedrowiec');
    expect(mieszkancy()).toBe(cap);
  });

  it('miejsce liczy się od nowa w chwili decyzji: pojemność zajęta w trakcie zaproszenia odprawia wędrowca', () => {
    const world = swiezy('lanciego');
    const { sim, st } = gra(world, 4, { core: 4, mode: 'zwykly' });
    dopelnij(sim, world, ZARZAD_MAX);
    const cap = capOf(st, world);
    // do pojemności brakuje jednego mieszkańca
    // pętle z ograniczeniem: gdy removeResidents albo addResidents nic nie zmienia, test pada z opisem zamiast wisieć
    const ilu = (): number => st.pawns.filter((q) => q.kind === 'resident').length;
    while (ilu() > cap - 1) if (removeResidents(st, 1) === 0) throw new Error('removeResidents nikogo nie usunął');
    while (ilu() < cap - 1) if (addResidents(st, world, 1) === 0) throw new Error('addResidents nikogo nie dodał');
    expect(st.pawns.filter((q) => q.kind === 'resident')).toHaveLength(cap - 1);
    const { t, p } = kolejnaRozmowa(sim);
    expect(okazjaWerbunku(st, world).dokad).toBe('mieszkaniec');
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    run(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    // w trakcie zaproszenia ktoś inny zajmuje ostatnie miejsce (przyjęci zza bramy z uchwały)
    addResidents(st, world, 1, true);
    expect(okazjaWerbunku(st, world).dokad).toBe('brak');
    ustawLosowanie(st, true, 0.85);
    run(sim, () => p.job?.t !== 'zapros');
    expect(t.kind).toBe('wedrowiec');
    expect(st.obcy!.werbunek).toBeUndefined();
    expect(st.pawns.filter((q) => q.kind === 'resident')).toHaveLength(cap);
    // wieść mówi prawdziwy powód: miejsca już nie ma (nie „dziękuje i idzie dalej”), po polsku i po angielsku
    expect(st.obcy!.wiesc!.text).toBe('Nie mamy już dla wędrowca miejsca, więc idzie dalej.');
    expect(wiescEn(st.obcy!.wiesc!.text)).toBe('We have no room left for the wanderer, so they move on.');
    expect(NAPISY.bezMiejsca(true).pl).toBe('Nie mamy już dla ocalałego miejsca, więc idzie dalej.');
    expect(NAPISY.bezMiejsca(true).en).toBe('We have no room left for the survivor, so they move on.');
  });
});

describe('Wędrowiec czeka po rozmowie', () => {
  it('po rozmowie stoi przy siatce jeszcze godzinę gry: po pół godzinie dalej można go zaprosić', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    const koniec = st.tick;
    const miejsce = tileOf(t);
    // 30 minut gry po rozmowie: wędrowiec nadal przy siatce, nie odszedł i nie zniknął
    run(sim, () => st.tick >= koniec + TICKS_PER_HOUR / 2);
    expect(st.pawns.includes(t)).toBe(true);
    expect(t.kind).toBe('wedrowiec');
    expect(t.job?.phase).toBe(1);
    expect(tileOf(t)).toBe(miejsce);
    expect(st.obcy!.rozmowa?.id).toBe(t.id);
    // i zaproszenie jeszcze działa
    expect(zaprosMenu(sim, w, t)).toBeDefined();
    zapros(sim, p, t, true);
    expect(t.kind).toBe('core');
    expect(st.people[t.person].id).toBe('w1');
  });

  it('bez zaproszenia odchodzi dopiero po godzinie od rozmowy, a nie po dziesięciu minutach', () => {
    const { sim, st } = gra(w, 3);
    const { t } = pozagadaniu(sim);
    const koniec = st.tick;
    // rozmowa skończyła się w kroku tuż przed „koniec”
    expect(t.job!.until).toBeGreaterThanOrEqual(koniec - 2 + TICKS_PER_HOUR);
    run(sim, () => st.tick >= koniec + TICKS_PER_HOUR - 20);
    expect(t.job?.phase).toBe(1);
    run(sim, () => (t.job?.phase ?? 4) >= 2, 4000);
    expect(t.job?.phase).toBeGreaterThanOrEqual(2);
    expect(st.tick - koniec).toBeLessThanOrEqual(TICKS_PER_HOUR + 40);
  });

  it('gra bez rozmów ma te same skróty co przed zmianą (przedłużenie tylko po rozmowie)', () => {
    const bez = (world: World, seed: number, opts: Partial<SimOpts>) => {
      const sim = new Sim(world, createSim(world, seed, { obcy: true, ...opts }));
      for (let k = 0; k < 3 * TICKS_PER_DAY; k++) sim.step();
      return sim.hash();
    };
    // skróty przeliczone po scaleniu przełącznika „za siatkę” domyślnie włączonego (praca-ludzi) z kozą z głową
    // i wydarzeniami etapów 1–2: każda strona osobno dawała 11b2b8b3 i ce9fc89e, razem automat wcześniej idzie po drewno za siatkę
    expect(bez(w, 3, { core: 2 })).toBe('f77e096b');
    expect(bez(w, 7, { core: 4 })).toBe('a5eeb997');
  });
});

describe('Zapis i wczytanie w trakcie zaproszenia', () => {
  it('nie zmieniają przebiegu', () => {
    const { sim, st } = gra(w, 3);
    const { t, p } = pozagadaniu(sim);
    st.obcy!.rozmowa!.cel = false;
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    run(sim, () => p.job?.t === 'zapros' && p.job.phase === 1);
    const copy = new Sim(w, JSON.parse(JSON.stringify(st)) as SimState);
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
    expect(t.id).toBeGreaterThan(0);
  });
});
