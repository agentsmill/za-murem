/* Cel „Przyjmijcie kogoś nowego” (R4 `nowi`, docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „R4.3”) na
   prawdziwej grze: symulacja, zarząd i ścieżka razem.

   Reguła A (oba tryby): cel liczy przyjęcia od otwarcia rozdziału, nie ludność netto. Przyjęciem jest nowy pionek zarządu
   albo mieszkańców (przyjęta grupa gości, zaproszony wędrowiec, nowa osoba z karty) i awans mieszkańca do zarządu (karta
   „Fachowiec”, „Wciągnąć do roboty”, w bloku to ta sama osoba bez zmiany ludności). Zgon po drodze ich nie cofa, przyjęcie
   sprzed otwarcia rozdziału się nie liczy, a lista pionków z chwili otwarcia przechodzi przez zapis i wczytanie.

   Reguła B (tylko zombie): po trzech dobach gry przy otwartym R4 bez przyjęcia cel zalicza się sam i mówi o tym linią
   „Nikt nie zapukał: …”; w zwykłym trybie zapasu nie ma nigdy.

   Podpowiedź (po polsku i po angielsku, blok i dom) zostaje bez zmian i jest prawdziwa: wybory, które nazywa, zaliczają cel. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makePerson, type Person } from '../../src/content/people.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry, nextRandom } from '../../src/core/rng.ts';
import type { GovEffects, PlanGoscia } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent } from '../../src/gov/zarzad.ts';
import { TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { applyGov } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { createSim, type Pawn, Sim, type SimOpts, type SimState, szansaZaproszenia } from '../../src/sim/sim.ts';
import { populacja } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { celeHtml } from '../../src/ui/sciezka.ts';
import { DOBY_NOWI_ZAPAS } from '../../src/ui/sciezka-rozdzialy.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { polski, polskieSlowa } from './po-angielsku.ts';
import { knockHouse, meet, core as rdzen } from './sasiedzi-pomoc.ts';
import {
  cel,
  DEMA,
  type Gra,
  graZSymulacji,
  krok,
  otworz,
  poPierwszymRaporcie,
  przezZapis,
  TRYBY,
  wDomu,
  wejscie,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const BLOKI = ['przymorze', 'lanciego'] as const;
const LINIA_PL = 'Nikt nie zapukał: gdy ktoś poprosi o miejsce, karta zapyta.';
const LINIA_EN = 'Nobody knocked: when someone asks for a place, a card will ask you.';

/** skutki z jednego wywołania (jak `fx` z zarządu) */
function skutki(f: (e: GovEffects) => void): GovEffects {
  const e = emptyEffects();
  f(e);
  return e;
}

const nowaOsoba = (n: number): Person => makePerson(mulberry(n), new Set(), () => 100 + n);

/** gra w bloku z mieszkańcami z generatora (osoby z imionami i fachami: tylko z nimi jest karta „Fachowiec” z awansem) */
async function blokZMieszkancami(key: (typeof BLOKI)[number], mode: GameMode): Promise<Gra> {
  const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  const { world, mieszkancy } = await swiatMieszkancow(demo, 5, 4);
  return graZSymulacji(key, mode, 5, new Sim(world, createSim(world, 5, { core: 4, mode, mieszkancy })));
}

/** Karta „Fachowiec” z prawdziwego zarządu i prawdziwego wejścia gry, wybór „Wciągnąć do roboty”: skutki, jakie ma gra. */
function fachowiecWciagnac(g: Gra): GovEffects {
  const e = polski(M1_EVENTS.find((x) => x.id === 'fachowiec')!);
  const h = makeHost(g.gov, wejscie(g), emptyEffects());
  const d = e.make(h);
  const k = e.choices(h, d).findIndex((c) => c.label.startsWith('Wciągnąć do roboty'));
  expect(k, 'karta ma wybór „Wciągnąć do roboty”').toBeGreaterThanOrEqual(0);
  g.gov.ev.active = { id: 'fachowiec', d } as NonNullable<typeof g.gov.ev.active>;
  return chooseEvent(g.gov, wejscie(g), k);
}

/** stan gry po awansie mieszkańca: pionek, który jest teraz w zarządzie, a przy otwarciu rozdziału nie był */
const awansowani = (g: Gra, przed: ReadonlySet<number>): Pawn[] =>
  g.sim.st.pawns.filter((p) => p.kind === 'core' && !przed.has(p.id));

describe.each(BLOKI.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
  'R4 nowi, reguła A: karta „Fachowiec” w bloku z mieszkańcami (%s %s)',
  (key, mode) => {
    it('awans mieszkańca zalicza cel, choć ludność netto się nie zmienia', async () => {
      const g = await blokZMieszkancami(key, mode);
      otworz(g, 'r4');
      expect(cel(g, 'nowi').done).toBe(false);
      const przed = populacja(g.sim.st).razem;
      const zarzadPrzed = new Set(rdzen(g.sim).map((p) => p.id));
      const fx = fachowiecWciagnac(g);
      expect(fx.awans, 'w bloku to awans mieszkańca, nie nowa osoba').toHaveLength(1);
      expect(fx.join).toHaveLength(0);
      applyGov(g.sim.st, g.sim.w, fx);
      expect(awansowani(g, zarzadPrzed)).toHaveLength(1);
      expect(populacja(g.sim.st).razem, 'ludność bez zmiany: ten sam człowiek').toBe(przed);
      expect(cel(g, 'nowi').done).toBe(true);
      expect(g.sciezka.zrobione).toHaveProperty(['r4.nowi']);
      // zwykły tekst celu: zaliczył go awans, nie zapas
      expect(cel(g, 'nowi').text).toBe('Przyjmijcie kogoś nowego.');
    });

    it('awans sprzed otwarcia rozdziału się nie liczy, następne przyjęcie tak', async () => {
      const g = await blokZMieszkancami(key, mode);
      applyGov(g.sim.st, g.sim.w, fachowiecWciagnac(g));
      otworz(g, 'r4');
      expect(cel(g, 'nowi').done, 'awans sprzed otwarcia').toBe(false);
      applyGov(
        g.sim.st,
        g.sim.w,
        skutki((e) => e.join.push(nowaOsoba(31))),
      );
      expect(cel(g, 'nowi').done, 'nowa osoba po otwarciu').toBe(true);
    });
  },
);

describe.each(DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
  'R4 nowi, reguła A: przyjęcia, nie ludność netto (%s %s)',
  (key, mode) => {
    it('przyjęcie po zgonie zalicza cel, choć ludność wraca tylko do stanu z otwarcia', () => {
      const g = poPierwszymRaporcie(key, mode);
      otworz(g, 'r4');
      const { st, w } = g.sim;
      const start = populacja(st).razem;
      // zgon (odejście z zarządu): ludność o jeden mniej, nikt nie został przyjęty
      applyGov(
        st,
        w,
        skutki((e) => e.leave.push(st.people[rdzen(g.sim)[3].person].id)),
      );
      expect(populacja(st).razem).toBe(start - 1);
      expect(cel(g, 'nowi').done).toBe(false);
      applyGov(
        st,
        w,
        skutki((e) => e.join.push(nowaOsoba(4))),
      );
      expect(populacja(st).razem, 'bilans taki sam jak przy otwarciu').toBe(start);
      expect(cel(g, 'nowi').done, 'przyjęcie po zgonie').toBe(true);
    });

    it('przyjęcie sprzed otwarcia rozdziału się nie liczy', () => {
      const g = poPierwszymRaporcie(key, mode);
      applyGov(
        g.sim.st,
        g.sim.w,
        skutki((e) => e.join.push(nowaOsoba(6))),
      );
      otworz(g, 'r4');
      expect(cel(g, 'nowi').done).toBe(false);
      expect(g.sciezka.start.osoby).toContain(rdzen(g.sim).at(-1)!.id);
    });

    it('zgon w międzyczasie nie cofa przyjęcia: nowa osoba, która potem ginie, zostawia cel zaliczony', () => {
      const g = poPierwszymRaporcie(key, mode);
      otworz(g, 'r4');
      const { st, w } = g.sim;
      const osoba = nowaOsoba(7);
      applyGov(
        st,
        w,
        skutki((e) => e.join.push(osoba)),
      );
      expect(cel(g, 'nowi').done).toBe(true);
      applyGov(
        st,
        w,
        skutki((e) => e.leave.push(osoba.id)),
      );
      expect(cel(g, 'nowi').done).toBe(true);
    });
  },
);

describe.each(BLOKI.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
  'R4 nowi: zapis i wczytanie w środku rozdziału (%s %s)',
  (key, mode) => {
    it('lista pionków z otwarcia przechodzi przez zapis: awans po wczytaniu zalicza cel, awans sprzed otwarcia nie', async () => {
      const g = await blokZMieszkancami(key, mode);
      applyGov(g.sim.st, g.sim.w, fachowiecWciagnac(g));
      otworz(g, 'r4');
      const h = przezZapis(g);
      expect(h.sciezka.start.osoby).toEqual(g.sciezka.start.osoby);
      expect(h.sciezka.start.zarzad).toEqual(g.sciezka.start.zarzad);
      expect(cel(h, 'nowi').done, 'awans sprzed otwarcia po wczytaniu').toBe(false);
      applyGov(
        h.sim.st,
        h.sim.w,
        skutki((e) => e.join.push(nowaOsoba(8))),
      );
      expect(cel(h, 'nowi').done).toBe(true);
    });

    it('przyjęcie, którego ścieżka jeszcze nie zobaczyła, przechodzi przez zapis razem z grą i zalicza cel po wczytaniu', async () => {
      const g = await blokZMieszkancami(key, mode);
      otworz(g, 'r4');
      applyGov(g.sim.st, g.sim.w, fachowiecWciagnac(g));
      // bez kroku ścieżki między przyjęciem a zapisem: lista z otwarcia i pionki w grze razem mówią, że ktoś awansował
      expect(g.sciezka.zrobione).not.toHaveProperty(['r4.nowi']);
      const h = przezZapis(g);
      expect(cel(h, 'nowi').done).toBe(true);
    });

    it('zaliczony cel zostaje zaliczony po zapisie i wczytaniu', async () => {
      const g = await blokZMieszkancami(key, mode);
      otworz(g, 'r4');
      applyGov(g.sim.st, g.sim.w, fachowiecWciagnac(g));
      expect(cel(g, 'nowi').done).toBe(true);
      const h = przezZapis(g);
      expect(h.sciezka.zrobione).toHaveProperty(['r4.nowi']);
      expect(cel(h, 'nowi').done).toBe(true);
    });
  },
);

describe('R4 nowi: stary zapis bez listy pionków liczy ludność netto jak dawniej', () => {
  it('bez `osoby` i `zarzad` w `start` cel czeka na większą ludność niż przy otwarciu', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    otworz(g, 'r4');
    delete g.sciezka.start.osoby;
    delete g.sciezka.start.zarzad;
    const h = przezZapis(g);
    expect(h.sciezka.start.osoby).toBeUndefined();
    const { st, w } = h.sim;
    // awans bez zmiany ludności i przyjęcie po zgonie nie wystarczą, dopiero ludność większa niż przy otwarciu
    applyGov(
      st,
      w,
      skutki((e) => e.leave.push(st.people[rdzen(h.sim)[3].person].id)),
    );
    applyGov(
      st,
      w,
      skutki((e) => e.join.push(nowaOsoba(9))),
    );
    expect(cel(h, 'nowi').done).toBe(false);
    applyGov(
      st,
      w,
      skutki((e) => e.join.push(nowaOsoba(10))),
    );
    expect(cel(h, 'nowi').done).toBe(true);
  });
});

/* ---------------------------------------------------------------- goście i wędrowcy na prawdziwej symulacji */

const FAR = tickAt(30, 10);
const swiat = mockBlockM2();

/** gra z obcymi dnia 2 o 10:00 na świecie z siatką i bramą; nic poza tym, co test sam wystawi, nie przychodzi */
function graZObcymi(seed: number, opcje: Partial<SimOpts> = {}): Gra {
  const st: SimState = createSim(swiat, seed, { core: 4, obcy: true, ...opcje });
  const sim = new Sim(swiat, st);
  st.tick = tickAt(2, 10);
  st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  const o = st.obcy!;
  o.next = FAR;
  o.wnext = FAR;
  o.enext = FAR;
  for (const p of st.pawns) {
    if (p.kind === 'core' && p.needs) {
      p.needs.food = 100;
      p.needs.warm = 100;
      p.needs.rest = 100;
    }
  }
  return graZSymulacji('przymorze', 'zwykly', seed, sim);
}

function plan(n: number, k: number): PlanGoscia {
  return {
    id: `g${k}`,
    osoby: Array.from({ length: n }, (_, i) => ({ ...nowaOsoba(500 + 10 * k + i), id: `g${k}p${i}` })),
    looks: Array.from({ length: n }, (_, i) => 4 + i),
    strona: 'n',
  };
}

function krokuj(g: Gra, ok: () => boolean, limit = 30000): void {
  for (let k = 0; k < limit && !ok(); k++) g.sim.step();
  expect(ok(), 'warunek spełniony w limicie kroków').toBe(true);
}

/** grupa gości stoi pod bramą (faza `brama`) */
function podBrame(g: Gra, k: number, n = 2): void {
  applyGov(
    g.sim.st,
    g.sim.w,
    skutki((e) => (e.gosc = plan(n, k))),
  );
  krokuj(g, () => g.sim.st.goscie?.find((x) => x.id === `g${k}`)?.faza === 'brama', 6000);
}

describe('R4 nowi, reguła A: goście pod bramą', () => {
  it('„Przyjąć” (rozkaz zostan) zalicza cel, a „Wpuścić na noc” nie', () => {
    const g = graZObcymi(3);
    otworz(g, 'r4');
    podBrame(g, 1);
    expect(cel(g, 'nowi').done, 'goście pod bramą jeszcze nie są przyjęci').toBe(false);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => (e.goscRozkaz = [{ id: 'g1', co: 'noc' }])),
    );
    krokuj(g, () => g.sim.st.goscie!.find((x) => x.id === 'g1')!.faza === 'w_srodku', 2000);
    expect(cel(g, 'nowi').done, 'wpuszczeni na noc to nie nowi mieszkańcy').toBe(false);
    podBrame(g, 2, 3);
    const przed = populacja(g.sim.st).razem;
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => (e.goscRozkaz = [{ id: 'g2', co: 'zostan' }])),
    );
    g.sim.step();
    expect(populacja(g.sim.st).razem).toBe(przed + 3);
    expect(cel(g, 'nowi').done).toBe(true);
  });

  it('„Przyjąć do zarządu” (rozkaz zarzad): mówiący awansuje, reszta zostaje mieszkańcami', () => {
    const g = graZObcymi(3);
    otworz(g, 'r4');
    podBrame(g, 1, 1);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => (e.goscRozkaz = [{ id: 'g1', co: 'zarzad' }])),
    );
    g.sim.step();
    expect(rdzen(g.sim)).toHaveLength(5);
    expect(cel(g, 'nowi').done).toBe(true);
  });

  it('grupa przyjęta przed otwarciem rozdziału się nie liczy', () => {
    const g = graZObcymi(3);
    podBrame(g, 1);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => (e.goscRozkaz = [{ id: 'g1', co: 'zostan' }])),
    );
    for (let k = 0; k < 400; k++) g.sim.step();
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
  });

  it('gość pod bramą w chwili otwarcia rozdziału, przyjęty potem, się liczy', () => {
    const g = graZObcymi(3);
    podBrame(g, 1);
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => (e.goscRozkaz = [{ id: 'g1', co: 'zostan' }])),
    );
    g.sim.step();
    expect(cel(g, 'nowi').done).toBe(true);
  });
});

/** wędrowiec przy siatce po rozmowie (jak w tests/unit/werbunek.test.ts): zwraca jego pionek i osobę z zarządu */
function pozagadaniu(g: Gra): { t: Pawn; p: Pawn } {
  const { st } = g.sim;
  st.obcy!.wnext = st.tick;
  g.sim.step();
  const t = st.pawns.find((q) => q.kind === 'wedrowiec')!;
  expect(t).toBeDefined();
  krokuj(g, () => t.job?.phase === 1);
  const p = rdzen(g.sim)[0];
  g.sim.push({ t: 'talk', ids: [p.id], target: t.id });
  krokuj(g, () => p.job?.t === 'talk' && p.job.phase === 1);
  krokuj(g, () => p.job?.t !== 'talk');
  expect(t.job?.what).toBe('zagadany');
  st.obcy!.rozmowa!.cel = false;
  return { t, p };
}

/** zaproszenie wędrowca z wylosowaną zgodą (ziarno losowania ustawione tuż przed rozstrzygnięciem) */
function zapros(g: Gra, p: Pawn, t: Pawn): void {
  const { st } = g.sim;
  g.sim.push({ t: 'zapros', ids: [p.id], target: t.id });
  krokuj(g, () => p.job?.t === 'zapros' && p.job.phase === 1);
  while (p.job?.t === 'zapros') {
    if (p.job.phase === 1 && st.tick >= p.job.until - 1) {
      const szansa = szansaZaproszenia(st, g.sim.w);
      for (let s = 1; s < 100000; s++) {
        if (nextRandom({ s }) < szansa) {
          st.rng.s = s;
          break;
        }
      }
    }
    g.sim.step();
  }
}

describe('R4 nowi, reguła A: zaproszony wędrowiec', () => {
  it('udane zaproszenie zalicza cel, rozmowa bez zaproszenia nie', () => {
    const g = graZObcymi(3);
    otworz(g, 'r4');
    const { t, p } = pozagadaniu(g);
    expect(cel(g, 'nowi').done, 'sama rozmowa').toBe(false);
    zapros(g, p, t);
    expect(g.sim.st.obcy!.werbunek).toBe(1);
    expect(rdzen(g.sim)).toHaveLength(5);
    expect(cel(g, 'nowi').done).toBe(true);
  });

  it('wędrowiec zaproszony przed otwarciem rozdziału się nie liczy', () => {
    const g = graZObcymi(3);
    const { t, p } = pozagadaniu(g);
    zapros(g, p, t);
    expect(g.sim.st.obcy!.werbunek).toBe(1);
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
  });
});

describe('R4 nowi, reguła A: zaproszeni sąsiedzi', () => {
  it('zgoda na zaproszenie w drzwiach sąsiadów zalicza cel (pionki sąsiadów stają się mieszkańcami)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { sim } = knockHouse(seed);
      const g = graZSymulacji('zielonki', 'zwykly', seed, sim);
      otworz(g, 'r4');
      expect(cel(g, 'nowi').done).toBe(false);
      meet(sim, 'zaproszenie');
      if (sim.st.sasiedzi!.napis?.co !== 'zaproszenie_tak') {
        expect(cel(g, 'nowi').done, 'odmowa niczego nie zalicza').toBe(false);
        continue;
      }
      expect(cel(g, 'nowi').done, 'zgoda').toBe(true);
      return;
    }
    throw new Error('żadne ziarno nie dało zgody');
  });
});

/* ---------------------------------------------------------------- reguła B */

/** gra z rozdziałem R4 otwartym `doby` dób temu: tick otwarcia cofnięty, żeby nie grać tylu dób (jak `zm.rozdzial` w zrzutach) */
function r4OtwartyDobyTemu(key: (typeof DEMA)[number], mode: GameMode, doby: number, kroki = 0): Gra {
  const g = poPierwszymRaporcie(key, mode);
  otworz(g, 'r4');
  g.sciezka = { ...g.sciezka, od: g.sim.st.tick - doby * TICKS_PER_DAY + kroki };
  return g;
}

describe.each(DEMA)('R4 nowi, reguła B: zapas w zombie (%s)', (key) => {
  it('przed końcem trzeciej doby cel czeka, po trzeciej zalicza się sam, z linią w oknie', () => {
    const g = r4OtwartyDobyTemu(key, 'zombie', DOBY_NOWI_ZAPAS, 40);
    expect(cel(g, 'nowi').done, 'dwie doby i prawie cała trzecia').toBe(false);
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
    for (let k = 0; k < 40; k++) g.sim.step();
    const c = cel(g, 'nowi');
    expect(c.done).toBe(true);
    // cel zostaje ze swoim tekstem, a pod nim stoi linia, czemu zaliczył się sam
    expect(c.text).toBe('Przyjmijcie kogoś nowego.');
    expect(c.uwaga).toBe(LINIA_PL);
    expect(g.sciezka.zrobione).toHaveProperty(['r4.nowi']);
    ustawJezyk('en');
    expect(cel(g, 'nowi').text).toBe('Take someone new in.');
    expect(cel(g, 'nowi').uwaga).toBe(LINIA_EN);
    expect(polskieSlowa(cel(g, 'nowi').uwaga!)).toEqual([]);
  });

  it('okienko rysuje linię pod zaliczonym celem, bez przekreślenia (osobny element), a przed zapasem jej nie ma', () => {
    const g = r4OtwartyDobyTemu(key, 'zombie', DOBY_NOWI_ZAPAS + 1);
    const html = celeHtml(widok(g), { otwarte: true, touch: false });
    expect(html).toContain(`<small class="goal-uwaga">${LINIA_PL}</small>`);
    expect(html).toMatch(
      /<li class="goal done" data-key="nowi"[^>]*>Przyjmijcie kogoś nowego\.<small class="goal-uwaga">/,
    );
    // zwinięte okienko pokazuje tylko bieżący cel (ludzie), więc linii w nim nie ma
    expect(celeHtml(widok(g), { otwarte: false, touch: false })).not.toContain('goal-uwaga');
    const wczesniej = r4OtwartyDobyTemu(key, 'zombie', 1);
    expect(celeHtml(widok(wczesniej), { otwarte: true, touch: false })).not.toContain('goal-uwaga');
  });

  it('linia zostaje po zapisie i wczytaniu, a późniejsze przyjęcie jej nie zmienia', () => {
    const g = r4OtwartyDobyTemu(key, 'zombie', DOBY_NOWI_ZAPAS + 1);
    expect(cel(g, 'nowi').uwaga).toBe(LINIA_PL);
    const h = przezZapis(g);
    expect(cel(h, 'nowi').uwaga).toBe(LINIA_PL);
    applyGov(
      h.sim.st,
      h.sim.w,
      skutki((e) => e.join.push(nowaOsoba(11))),
    );
    expect(cel(h, 'nowi').done).toBe(true);
    expect(cel(h, 'nowi').uwaga).toBe(LINIA_PL);
  });

  it('przyjęcie przed trzecią dobą zalicza cel zwykłym tekstem, bez linii o zapasie', () => {
    const g = r4OtwartyDobyTemu(key, 'zombie', 1);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => e.join.push(nowaOsoba(12))),
    );
    const c = cel(g, 'nowi');
    expect(c.done).toBe(true);
    expect(c.uwaga).toBeUndefined();
    // trzecia doba mija, a cel zaliczony przyjęciem nie dostaje linii o zapasie
    g.sim.st.tick += 5 * TICKS_PER_DAY;
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
    expect(celeHtml(widok(g), { otwarte: true, touch: false })).not.toContain('goal-uwaga');
  });

  it('w zwykłym trybie zapasu nie ma nigdy: nawet po dziesięciu dobach przy otwartym R4 cel czeka', () => {
    const g = r4OtwartyDobyTemu(key, 'zwykly', 10);
    const c = cel(g, 'nowi');
    expect(c.done).toBe(false);
    expect(c.uwaga).toBeUndefined();
    expect(g.sciezka.zrobione).not.toHaveProperty(['r4.nowi']);
    // i przyjęcie dalej go zalicza, bez linii o zapasie
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => e.join.push(nowaOsoba(13))),
    );
    expect(krok(g).zrobione).toHaveProperty(['r4.nowi']);
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- podpowiedź */

describe.each(DEMA)('R4 nowi: podpowiedź nazywa wybory, które zaliczają cel (%s)', (key) => {
  it('po polsku i po angielsku mówi o tych samych dwóch kartach i o „Pokaż”, w bloku i w domu tak samo', () => {
    const g = poPierwszymRaporcie(key, 'zwykly');
    otworz(g, 'r4');
    const pl = cel(g, 'nowi').how;
    for (const nazwa of ['„Przyjąć wszystkich”', '„Wciągnąć do roboty”', '„Pokaż”']) expect(pl).toContain(nazwa);
    ustawJezyk('en');
    const en = cel(g, 'nowi').how;
    for (const nazwa of ['“Take everyone in”', '“Put him to work”', '“Show”']) expect(en).toContain(nazwa);
    expect(polskieSlowa(en)).toEqual([]);
  });

  it('„Wciągnąć do roboty” z prawdziwej karty „Fachowiec” zalicza cel: awansem w bloku, nową osobą w domu', async () => {
    const blok = !wDomu(key);
    const g = blok
      ? await blokZMieszkancami(key as (typeof BLOKI)[number], 'zwykly')
      : poPierwszymRaporcie(key, 'zwykly');
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
    const fx = fachowiecWciagnac(g);
    expect((fx.awans?.length ?? 0) + fx.join.length, 'karta kogoś bierze').toBe(1);
    if (blok) expect(fx.awans).toHaveLength(1);
    else expect(fx.join).toHaveLength(1);
    applyGov(g.sim.st, g.sim.w, fx);
    expect(cel(g, 'nowi').done).toBe(true);
  });
});
