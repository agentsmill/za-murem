/* Ta sama twarz znajomego w każdym pionku (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 4): w grze
   z grafiką PixelLab postać pionka wybiera się z płci i wieku osoby oraz z numeru osoby, więc gość, ten sam człowiek po
   przyjęciu, powracający gość i szabrownik, który idzie z napadem jako znajomy (bez osoby), miały różne postacie, czasem
   nawet płci. Teraz postać (i wersja kolorystyczna) człowieka z historią zarządu jest czystą funkcją jego danych:
   płci, wieku i ziarna z wyglądu pionka i imienia (`wygladZnajomego` w content/people.ts), a pionek niesie je w polu
   `Pawn.wyglad` (gość z planu, szabrownik z `RaidPlan.znajomy`). Ludzie bez tego pola (zarząd, mieszkańcy z generatora,
   zwykli szabrownicy) wybierają postać jak dotąd; test przypina kilka z nich ze stałymi wartościami sprzed zmiany.
   Prawdziwa obsada PixelLab z manifestu (atlasy), animacje udawane, jak w ludzie-pixellab.test.ts; symulacja na bloku M2. */

import { describe, expect, it } from 'vitest';
import { makePerson, type Person, type Wyglad, wygladZnajomego } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import type { GoscRozkaz, GovEffects, PlanGoscia } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { wPlanieNapadu, type Znajomy } from '../../src/gov/znajomi.ts';
import type { KlatkaLudzi, OpisGrafiki, PostacLudzi } from '../../src/render/art/pixellab.ts';
import { LudziePixellab } from '../../src/render/ludziePixellab.ts';
import { applyGov } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { createSim, type Pawn, Sim, type SimState } from '../../src/sim/sim.ts';
import { atlasy } from '../../tools/atlasy.ts';
import { mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const FAR = tickAt(30, 10);

// ---------------------------------------------------------------- prawdziwa obsada

const opis = (atlasy().get('grafika.json') as OpisGrafiki).ludzie;
const klatki = (x: number, n = 4): KlatkaLudzi[] => Array.from({ length: n }, (_, i) => [x + i * 3, 1, 3, 5, 1, 4]);
const komplet = opis.postacie.map((p) => ({
  ...p,
  animacje: {
    chod: { kierunki: [klatki(0), klatki(20), klatki(40), 2] },
    stanie: { kierunki: [klatki(0), klatki(20), klatki(40), 2] },
  },
})) as PostacLudzi[];
/** nowy widok postaci (pamięć wyborów pusta), żeby pamięć jednego pionka nie ukrywała różnicy między dwoma */
const nowyWidok = () =>
  new LudziePixellab({ opis: { ...opis, postacie: komplet }, img: { w: 16, h: 16, px: new Uint32Array(256) } });
/** postać i wersja kolorystyczna pionka w widoku bez pamięci */
function figura(st: SimState, p: Pawn): string {
  const l = nowyWidok();
  const po = l.postacPionka(p, st.people);
  return po ? `${po.id}:${l.wersjaPionka(p, po)}` : 'kod';
}

// ---------------------------------------------------------------- symulacja

const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const minuteOf = (day: number, h: number) => (day - 1) * 1440 + h * 60;
const wyslij = (st: SimState, f: Partial<GovEffects>) => applyGov(st, w, { ...emptyEffects(), ...f });
const rozkazy = (id: string, ...co: GoscRozkaz[]): GovEffects['goscRozkaz'] => co.map((c) => ({ id, co: c }));

interface Czlowiek {
  first: string;
  name: string;
  f: boolean;
  age: number;
  look: number;
}
/** dorośli i dzieci, kobiety i mężczyźni, różne wyglądy: jedno z drugim pasuje do różnych postaci z obsady */
const LUDZIE: Czlowiek[] = [
  { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47, look: 9 },
  { first: 'Ewa', name: 'Ewa Nowak', f: true, age: 33, look: 4 },
  { first: 'Zofia', name: 'Zofia Mazur', f: true, age: 72, look: 12 },
  { first: 'Jakub', name: 'Jakub Mazur', f: false, age: 11, look: 15 },
  { first: 'Marta', name: 'Marta Wójcik', f: true, age: 9, look: 7 },
  { first: 'Piotr', name: 'Piotr Dąbrowski', f: false, age: 61, look: 5 },
];

const osoba = (c: Czlowiek, id: string): Person => ({
  ...makePerson(mulberry(7), new Set(), () => 900),
  id,
  first: c.first,
  name: c.name,
  f: c.f,
  age: c.age,
});
const plan = (id: string, c: Czlowiek): PlanGoscia => ({
  id,
  osoby: [osoba(c, `${id}p0`)],
  looks: [c.look],
  strona: 'n',
});

/** gra z obcymi, w której przychodzą tylko goście z planu */
function gra(): Sim {
  const st = createSim(w, 3, { core: 2, obcy: true });
  const sim = new Sim(w, st);
  st.tick = tickAt(2, 10);
  const o = st.obcy!;
  o.next = FAR;
  o.wnext = FAR;
  o.enext = FAR;
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 30 * 800;
  return sim;
}
function krok(sim: Sim, ok: () => boolean, max = 30000): void {
  for (let k = 0; k < max && !ok(); k++) {
    for (const p of sim.st.pawns)
      if (p.kind === 'core' && !p.away && p.needs) {
        p.needs.food = 100;
        p.needs.warm = 100;
        p.needs.rest = 100;
      }
    sim.step();
  }
}
const mowiacy = (st: SimState, id: string): Pawn => {
  const g = st.goscie!.find((x) => x.id === id)!;
  return st.pawns.find((p) => p.id === g.pawns[0])!;
};

/** gość o danym planie stoi pod bramą; zwraca jego pionek */
function poBramie(sim: Sim, p: PlanGoscia): Pawn {
  wyslij(sim.st, { gosc: p });
  krok(sim, () => sim.st.goscie?.find((g) => g.id === p.id)?.faza === 'brama', 6000);
  expect(sim.st.goscie!.find((g) => g.id === p.id)!.faza).toBe('brama');
  return mowiacy(sim.st, p.id);
}

/** znajomy z wpisu zarządu o tym człowieku (to, co zarząd niesie do planu napadu) */
const znajomy = (c: Czlowiek): Znajomy => ({
  id: 'g1p0',
  osoba: { first: c.first, name: c.name, f: c.f, age: c.age },
  look: c.look,
  kto: 'wedrowiec',
  jak: 'zlapany',
  nastawienie: -2,
  dzien: 1,
  wizyty: 1,
  ostatnio: 1,
});

/** szabrownicy z planu napadu ze znajomym c (stoją za siatką po 22:30) */
function szabrownicy(c: Czlowiek, ilu = 2): { st: SimState; wszyscy: Pawn[]; on: Pawn } {
  const st = createSim(w, 3, { core: 2 });
  st.tick = atHour(1, 21);
  const sim = new Sim(w, st);
  wyslij(st, {
    raid: {
      day: 1,
      at: minuteOf(1, 23),
      post: 'brama',
      where: { pl: 'przy bramie', en: 'at the gate' },
      attack: 4.6,
      people: ilu,
      znajomy: wPlanieNapadu(znajomy(c)),
    },
  });
  while (st.tick < atHour(1, 23)) sim.step();
  const wszyscy = st.pawns.filter((p) => p.kind === 'szabrownik');
  expect(wszyscy).toHaveLength(ilu);
  const ten = wszyscy.filter((p) => p.wyglad !== undefined);
  expect(ten, 'dokładnie jeden szabrownik ze znajomego').toHaveLength(1);
  return { st, wszyscy, on: ten[0] };
}

// ---------------------------------------------------------------- testy

describe('wygladZnajomego', () => {
  it('czysta funkcja płci, wieku i ziarna z wyglądu i imienia', () => {
    const a = wygladZnajomego(9, { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47 });
    expect(a).toEqual(wygladZnajomego(9, { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47 }));
    expect(a).toMatchObject({ f: false, age: 47 });
    expect(Number.isInteger(a.los) && a.los >= 0).toBe(true);
    // ziarno zależy od wyglądu i od imienia, nie od płci ani wieku (te idą osobno)
    const inny = (b: Wyglad) => b.los !== a.los;
    expect(inny(wygladZnajomego(10, { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 47 }))).toBe(true);
    expect(inny(wygladZnajomego(9, { first: 'Henryk', name: 'Henryk Nowak', f: false, age: 47 }))).toBe(true);
    expect(wygladZnajomego(9, { first: 'Henryk', name: 'Henryk Kowalski', f: false, age: 50 }).los).toBe(a.los);
  });

  it('plan napadu niesie ten sam wygląd co gość: wPlanieNapadu zgadza się z wygladZnajomego', () => {
    for (const c of LUDZIE) {
      const pl = wPlanieNapadu(znajomy(c));
      expect(pl.look).toBe(c.look);
      expect(pl.wyglad).toEqual(wygladZnajomego(c.look, c));
    }
  });
});

describe('ta sama postać: gość, szabrownik, powracający, przyjęty', () => {
  it('postać gościa pod bramą, szabrownika ze znajomego, powracającego gościa i tego samego po przyjęciu jest jedna', () => {
    let roznych = 0;
    for (const c of LUDZIE) {
      // gość pod bramą (pierwsza wizyta) i ta sama osoba po przyjęciu do osiedla albo do zarządu
      for (const co of ['zostan', 'zarzad'] as const) {
        const sim = gra();
        // inny gość najpierw, żeby osoba powracającego i osoba tego samego gościa miały różne numery w `people`
        poBramie(sim, plan('g1', c));
        const pion = mowiacy(sim.st, 'g1');
        const bramaFig = figura(sim.st, pion);
        expect(pion.wyglad, c.name).toEqual(wygladZnajomego(c.look, c));
        wyslij(sim.st, { goscRozkaz: rozkazy('g1', co) });
        sim.step();
        expect(pion.kind, co).not.toBe('gosc');
        expect(figura(sim.st, pion), `${c.name} po przyjęciu (${co})`).toBe(bramaFig);
      }
      // gość pod bramą w pierwszej wizycie
      const pierwsza = gra();
      const gosc = poBramie(pierwsza, plan('g1', c));
      const figGosc = figura(pierwsza.st, gosc);
      // ten sam człowiek wraca (inna gra, inny numer osoby: ktoś był przed nim)
      const druga = gra();
      poBramie(druga, plan('g1', { ...c, first: 'Obcy', name: 'Obcy Gość', look: (c.look % 12) + 4 }));
      const wraca = poBramie(druga, plan('g2', c));
      expect(druga.st.people.findIndex((p) => p.name === c.name)).not.toBe(
        pierwsza.st.people.findIndex((p) => p.name === c.name),
      );
      expect(figura(druga.st, wraca), `${c.name} wraca`).toBe(figGosc);
      // szabrownik ze znajomego: bez osoby w grze, ta sama postać
      const { st, on } = szabrownicy(c);
      expect(on.person).toBe(-1);
      expect(figura(st, on), `${c.name} w napadzie`).toBe(figGosc);
      // ta sama płeć i wiek co człowiek
      expect(on.wyglad).toMatchObject({ f: c.f, age: c.age });
      // kod rysuje oba tym samym numerem wyglądu
      expect(on.look).toBe(gosc.look);
      if (figGosc !== figura(pierwsza.st, { ...gosc, wyglad: undefined } as Pawn)) roznych++;
    }
    // stary wybór (bez pola) dawał inną postać niż nowy dla co najmniej części ludzi: test naprawdę coś sprawdza
    expect(roznych).toBeGreaterThan(0);
  });

  it('płeć postaci znajomego to jego płeć (szabrownik ze znajomego nie zmienia płci)', () => {
    for (const c of LUDZIE) {
      const { st, on } = szabrownicy(c);
      // widok bez pamięci dla każdego człowieka: pamięć wyborów idzie po numerze pionka, a ten w każdej grze jest ten sam
      const po = nowyWidok().postacPionka(on, st.people)!;
      expect(po.plec, c.name).toBe(c.f ? 'k' : 'm');
    }
  });

  it('zwykli szabrownicy i szabrownik bez znajomego nie mają pola, a losowanie symulacji jest to samo', () => {
    const c = LUDZIE[0];
    const bez = createSim(w, 3, { core: 2 });
    bez.tick = atHour(1, 21);
    const simB = new Sim(w, bez);
    wyslij(bez, {
      raid: { day: 1, at: minuteOf(1, 23), post: 'brama', where: { pl: 'a', en: 'a' }, attack: 4.6, people: 2 },
    });
    while (bez.tick < atHour(1, 23)) simB.step();
    for (const p of bez.pawns.filter((q) => q.kind === 'szabrownik')) expect(p.wyglad).toBeUndefined();
    const { st } = szabrownicy(c);
    expect(st.rng).toEqual(bez.rng);
  });
});

describe('ludzie bez pola wyglad wybierają postać jak dotąd', () => {
  /** wartości sprzed zmiany (ta sama obsada, te same osoby): postać i wersja kolorystyczna */
  const OSOBY = [
    { f: false, age: 70 },
    { f: true, age: 30 },
    { f: true, age: 8 },
    { f: false, age: 41 },
    { f: true, age: 55 },
    { f: false, age: 12 },
    { f: true, age: 77 },
    { f: false, age: 29 },
    { f: true, age: 19 },
    { f: false, age: 63 },
  ];
  const POSTACIE = [
    'kotwica-lekarz:3',
    'kotwica-matka:0',
    'kotwica-dziewczynka:1',
    'kotwica-weteran:4',
    'kotwica-kioskarka:3',
    'kotwica-chlopiec:2',
    'kotwica-dzialkowiczka:3',
    'kotwica-prompt-engineer:2',
    'kotwica-influencerka:3',
    'kotwica-lekarz:3',
  ];
  const SZABROWNICY: Record<number, string> = {
    4: 'kotwica-prompt-engineer:0',
    7: 'kotwica-ochroniarz:2',
    10: 'kotwica-budowlaniec:2',
    13: 'kotwica-kioskarka:1',
    16: 'kotwica-weteran:2',
    19: 'kotwica-pielegniarka:3',
  };

  it('mieszkańcy i zarząd z osobą: ta sama postać i wersja co przed zmianą', () => {
    const l = nowyWidok();
    OSOBY.forEach((_, k) => {
      for (const kind of ['resident', 'core', 'sasiad']) {
        const p = { id: 10 + k, kind, person: k, look: k };
        const po = l.postacPionka(p, OSOBY)!;
        expect(`${po.id}:${l.wersjaPionka(p, po)}`, `${kind} ${k}`).toBe(POSTACIE[k]);
      }
    });
  });

  it('pionek bez osoby (zwykły szabrownik, wędrowiec) dostaje postać po wyglądzie jak przed zmianą', () => {
    const l = nowyWidok();
    for (const [look, oczekiwana] of Object.entries(SZABROWNICY)) {
      const p = { id: 50 + Number(look), kind: 'szabrownik', person: -1, look: Number(look) };
      const po = l.postacPionka(p, OSOBY)!;
      expect(`${po.id}:${l.wersjaPionka(p, po)}`, `wygląd ${look}`).toBe(oczekiwana);
    }
  });

  it('pionek z polem wyglad nie wchodzi do wersji zarządu (przypiszZarzad pomija postać z mieszkańców)', () => {
    const l = nowyWidok();
    const gosc = { id: 5, kind: 'core', person: 2, look: 9, wyglad: wygladZnajomego(9, LUDZIE[1]) };
    const inny = { id: 6, kind: 'core', person: 0, look: 1 };
    l.przypiszZarzad([gosc, inny], OSOBY);
    const po = l.postacPionka(gosc, OSOBY)!;
    expect(po.zarzad).toBe(false);
    expect(l.postacPionka(inny, OSOBY)!.zarzad).toBe(true);
  });
});
