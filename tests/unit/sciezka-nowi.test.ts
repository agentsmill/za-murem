/* Cel „Przyjmijcie kogoś nowego” (R4 `nowi`, docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „R4.3”) na
   prawdziwej grze: symulacja, zarząd i ścieżka razem.

   Reguła A (oba tryby): cel liczy przyjęcia od otwarcia rozdziału, nie ludność netto. Przyjęciem jest nowy pionek zarządu
   albo mieszkańców (przyjęta grupa gości, zaproszony wędrowiec, nowa osoba z karty) i awans mieszkańca do zarządu (karta
   „Fachowiec”, „Wciągnąć do roboty”, w bloku to ta sama osoba bez zmiany ludności). Zgon po drodze ich nie cofa, przyjęcie
   sprzed otwarcia rozdziału się nie liczy, a lista pionków z chwili otwarcia przechodzi przez zapis i wczytanie. Nie liczą się
   pies i kot z kart, handlarz pod bramą ani wyrzucenie mieszkańca bramą (nie dodaje pionka i niczego nie cofa).

   Reguła B (tylko zombie): gdy od otwarcia R4 minęło tyle czasu przy ekranie, ile trzy doby gry przy 1× w prawdziwej grze (1880 s:
   doba to około 627 s, bo noc po karcie nocy biegnie 6×; nie trzy doby gry, bo karty idą w sekundach przy ekranie), a nikt nie
   został przyjęty, cel zalicza się sam i mówi o tym linią „Nikt nie został przyjęty, więc cel zaliczył się sam. …”; powód
   zaliczenia zostaje w stanie ścieżki (`zapasem`), a w trybie zwykłym zapasu nie ma nigdy.

   Goście pod bramą (zadanie 13): podpowiedź nazywa wybory, które istnieją na prawdziwych kartach danego trybu i miejsca,
   a „Przyjąć do spółdzielni” (w domu „Przyjąć do domu”) z prawdziwej karty gościa, który prosi o miejsce, zalicza cel dopiero po
   wyborze; „Wpuścić na noc” i „Odprawić” nie. Karta gościa (klocki, karty z 0.3, kroki łańcuchów) nie otwiera żadnej okazji.
   Podpowiedź ma jedno „Pokaż” (komunikat o idących od bramy ma „ten sam”), w zombie mówi „Ocaleni”, jak tytuł karty, a po
   angielsku cytuje wszystkie zaimki z kart (him, her, them).

   Koszt pliku (około 11 s zamiast 23 s): gry w bloku z mieszkańcami budowane raz na demo i tryb (klon), pętla po „Odprawić”
   kończy się 30 s po zejściu gościa z ulicy, a pętla łańcucha 600 s po pierwszej karcie z grupą; każda asercja zostaje. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makePerson, type Person } from '../../src/content/people.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { type Gosc, KTO, type KtoId } from '../../src/gov/goscie.ts';
import { CARD_HOUR, MORNING } from '../../src/gov/noc.ts';
import type { GovEffects, PlanGoscia, Prompt } from '../../src/gov/typy.ts';
import { planujGoscia, planujKarte, wizytaKarty } from '../../src/gov/wizyta.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { fitsMode, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent } from '../../src/gov/zarzad.ts';
import { hourOf, SPEEDS, START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, type Pawn, Sim, type SimOpts, type SimState, szansaZaproszenia } from '../../src/sim/sim.ts';
import { populacja } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { eventSheet } from '../../src/ui/okna.ts';
import { celeHtml } from '../../src/ui/sciezka.ts';
import { DOBY_NOWI_ZAPAS, EKRAN_NOWI_ZAPAS } from '../../src/ui/sciezka-rozdzialy.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { polski, polskieSlowa } from './po-angielsku.ts';
import { ustawLosowanie } from './praca-pomoc.ts';
import { knockHouse, meet, core as rdzen } from './sasiedzi-pomoc.ts';
import { bezSzwendaczy, dajMaterial } from './sciezka-mapy.ts';
import {
  bezObcych,
  cel,
  czasPrzyEkranie,
  DEMA,
  type Gra,
  graZSymulacji,
  klon,
  krok,
  nowaGra,
  odczyt,
  odpowiedz,
  otworz,
  poPierwszymRaporcie,
  poRaporcieZObcymi,
  przezZapis,
  sekunda,
  TRYBY,
  wDomu,
  wejscie,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const BLOKI = ['przymorze', 'lanciego'] as const;
const LINIA_PL = 'Nikt nie został przyjęty, więc cel zaliczył się sam. Gdy ktoś poprosi o miejsce, karta zapyta.';
const LINIA_EN =
  'Nobody was taken in, so the goal completed itself. When someone asks for a place, a card will ask you.';

/** skutki z jednego wywołania (jak `fx` z zarządu) */
function skutki(f: (e: GovEffects) => void): GovEffects {
  const e = emptyEffects();
  f(e);
  return e;
}

const nowaOsoba = (n: number): Person => makePerson(mulberry(n), new Set(), () => 100 + n);

/* Gry w bloku z mieszkańcami z generatora, budowane raz na demo i tryb (świat z mieszkańcami to 0,1 do 0,5 s procesora); test
   dostaje klon, jak z `poPierwszymRaporcie` i `poRaporcieZObcymi` w sciezka-pomoc.ts. */
const blokiZMieszkancami = new Map<string, Promise<Gra>>();

/** gra w bloku z mieszkańcami z generatora (osoby z imionami i fachami: tylko z nimi jest karta „Fachowiec” z awansem) */
async function blokZMieszkancami(key: (typeof BLOKI)[number], mode: GameMode): Promise<Gra> {
  const klucz = `${key}:${mode}`;
  let baza = blokiZMieszkancami.get(klucz);
  if (!baza) {
    baza = (async () => {
      const demo = JSON.parse(
        fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'),
      );
      const { world, mieszkancy } = await swiatMieszkancow(demo, 5, 4);
      return graZSymulacji(key, mode, 5, new Sim(world, createSim(world, 5, { core: 4, mode, mieszkancy })));
    })();
    blokiZMieszkancami.set(klucz, baza);
  }
  return klon(await baza);
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
    if (p.job.phase === 1 && st.tick >= p.job.until - 1) ustawLosowanie(st, true, szansaZaproszenia(st, g.sim.w));
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

/** Sekundy przy ekranie, które gracz grający w danym tempie widzi w `doby` dób gry w prawdziwej grze. Liczy po zegarze gry, tick
    po ticku: dzień od porannego raportu (`MORNING`) do karty nocy (`CARD_HOUR`) w tempie gracza, a noc od karty do raportu 6×
    (`SPEEDS[3]`; src/main.ts: po zatwierdzeniu karty nocy gra przyspiesza czas do `NIGHT_PACE`, o ile gracz nie gra już
    szybciej). Czas przy ekranie liczy się tylko bez pauzy i bez otwartego okna, więc okna zarządu go nie dodają. */
function sekundyPrzyEkranie(doby: number, tempo: number): number {
  const noc = Math.max(tempo, SPEEDS[3]);
  // poranny raport drugiego dnia (6:00): od niego zaczyna się pełna doba
  const start = (((24 + MORNING) * 60 - START_MINUTES) * TICKS_PER_HOUR) / 60;
  let s = 0;
  for (let t = start; t < start + doby * TICKS_PER_DAY; t++) {
    const h = hourOf(t);
    s += 1 / (TICKS_PER_SECOND * (h >= MORNING && h < CARD_HOUR ? tempo : noc));
  }
  return s;
}

/** doba gry gracza w tempie 1× przy ekranie (około 627 s) */
const DOBA_S = sekundyPrzyEkranie(1, 1);
/** jedna doba po otwarciu rozdziału: daleko przed progiem */
const PRZED_PROGIEM_S = DOBA_S;
/** doba po progu: zapas już zadziałał */
const PO_PROGU_S = EKRAN_NOWI_ZAPAS + DOBA_S;

/** element listy z celem `nowi` z HTML okienka: reszta listy ma własne dopiski (np. lekcja pod zaliczonym celem „wkurzenie”) */
function liNowi(html: string): string {
  const m = /<li class="goal[^"]*" data-key="nowi"[^>]*>.*?<\/li>/.exec(html);
  expect(m, 'cel nowi jest w HTML okienka').not.toBeNull();
  return m![0];
}

/** Gra z rozdziałem R4 otwartym `doby` dób gry temu i `ekranTemu` sekund przy ekranie temu: tick i czas otwarcia cofnięte, żeby nie
    grać tylu dób (jak `zm.rozdzial` w zrzutach). Zapas mierzy tylko czas przy ekranie, a tick otwarcia liczą zapisy sprzed tej
    miary, więc dwie wielkości są tu niezależne. Czas przy ekranie z ułamkiem, jak `OdczytCelow.ekran`; tick sceny musi być
    wielokrotnością sekundy, żeby próg z równością nie zależał od błędu zaokrąglenia. */
function r4Otwarty(key: (typeof DEMA)[number], mode: GameMode, doby: number, ekranTemu: number): Gra {
  const g = poPierwszymRaporcie(key, mode);
  expect(g.sim.st.tick % TICKS_PER_SECOND, 'tick sceny to pełna sekunda').toBe(0);
  otworz(g, 'r4');
  g.sciezka = {
    ...g.sciezka,
    od: g.sim.st.tick - Math.round(doby * TICKS_PER_DAY),
    odEkran: czasPrzyEkranie(g.sim.st) - ekranTemu,
  };
  return g;
}

/** R4 otwarty `sekundy` sekund przy ekranie temu. Tick otwarcia cofnięty o tyle samo sekund (20 ticków na sekundę, jak gra bot
    ścieżki); w prawdziwej grze doba gry to mniej więcej 627 s, ale zapas tego ticku nie czyta. */
const r4PrzyEkranie = (key: (typeof DEMA)[number], mode: GameMode, sekundy: number): Gra =>
  r4Otwarty(key, mode, (sekundy * TICKS_PER_SECOND) / TICKS_PER_DAY, sekundy);

describe('R4 nowi, reguła B: próg zapasu to trzy doby gry przy tempie 1× w prawdziwej grze', () => {
  it.each([
    [1, 1880],
    [3, 760],
    [6, 480],
    [8, 360],
  ])('trzy doby gry przy tempie %s× to %s s przy ekranie (noc po karcie nocy biegnie 6×)', (tempo, sekundy) => {
    expect(sekundyPrzyEkranie(3, tempo)).toBeCloseTo(sekundy, 6);
  });

  it('EKRAN_NOWI_ZAPAS to trzy doby gry gracza w tempie 1×: 1880 s, nie 2880 s trzech dób bota', () => {
    // zegar gry: 14 godzin dnia po 40 s i 10 godzin nocy po 40 / 6 s
    expect(EKRAN_NOWI_ZAPAS).toBeCloseTo(sekundyPrzyEkranie(DOBY_NOWI_ZAPAS, 1), 6);
    expect(EKRAN_NOWI_ZAPAS).toBe(1880);
    // bot gra stałe 1× bez przyspieszania nocy (doba gry to 960 s przy ekranie), a gracz ma noc 6×: jego doba jest krótsza
    expect(DOBA_S).toBeCloseTo(626.667, 3);
    expect(DOBA_S).toBeLessThan(TICKS_PER_DAY / TICKS_PER_SECOND);
    // szybsze tempo daje krótsze doby, więc trzy doby gry przy 3×, 6× i 8× to mniej niż próg (gracz zobaczyłby ledwie kilka kart)
    for (const tempo of [3, 6, 8]) expect(sekundyPrzyEkranie(DOBY_NOWI_ZAPAS, tempo)).toBeLessThan(EKRAN_NOWI_ZAPAS);
  });
});

describe.each(DEMA)('R4 nowi, reguła B: zapas w zombie (%s)', (key) => {
  it('przed progiem cel czeka, po progu zalicza się sam, z linią w oknie', () => {
    const g = r4PrzyEkranie(key, 'zombie', EKRAN_NOWI_ZAPAS - 2);
    expect(cel(g, 'nowi').done, 'dwie sekundy przed progiem').toBe(false);
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
    for (let k = 0; k < 2 * TICKS_PER_SECOND; k++) g.sim.step();
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

  it('zapas liczy czas przy ekranie, nie doby gry: przy szybkim tempie trzy doby gry to jeszcze nie próg', () => {
    // 3,5 doby gry minęło, ale przy ekranie tylko 6 minut (tempo 8×): gracz widział ze trzy karty, zapasu jeszcze nie ma
    const szybko = r4Otwarty(key, 'zombie', 3.5, 360);
    expect(cel(szybko, 'nowi').done).toBe(false);
    expect(cel(szybko, 'nowi').uwaga).toBeUndefined();
    // dziesięć dób gry w niecałe 31 minut przy ekranie
    expect(cel(r4Otwarty(key, 'zombie', 10, EKRAN_NOWI_ZAPAS - 1), 'nowi').done).toBe(false);
    // próg to czas przy ekranie: równo 1880 sekund zalicza, także gdy gry minęło dużo więcej niż zwykle
    const g = r4Otwarty(key, 'zombie', 10, EKRAN_NOWI_ZAPAS);
    expect(cel(g, 'nowi').done).toBe(true);
    expect(cel(g, 'nowi').uwaga).toBe(LINIA_PL);
  });

  it('zapas zostawia ślad w stanie ścieżki: powód zaliczenia przeżywa zapis i wczytanie', () => {
    const g = r4PrzyEkranie(key, 'zombie', PO_PROGU_S);
    expect(g.sciezka.zapasem).toBeUndefined();
    krok(g);
    expect(g.sciezka.zapasem).toEqual(['r4.nowi']);
    const h = przezZapis(g);
    expect(h.sciezka.zapasem).toEqual(['r4.nowi']);
    expect(cel(h, 'nowi').uwaga).toBe(LINIA_PL);
  });

  it('okienko rysuje linię pod zaliczonym celem, bez przekreślenia (osobny element), a przed zapasem jej nie ma', () => {
    const g = r4PrzyEkranie(key, 'zombie', PO_PROGU_S);
    const html = celeHtml(widok(g), { otwarte: true, touch: false });
    expect(html).toContain(`<small class="goal-uwaga">${LINIA_PL}</small>`);
    expect(html).toMatch(
      /<li class="goal done" data-key="nowi"[^>]*>Przyjmijcie kogoś nowego\.<small class="goal-uwaga">/,
    );
    // zwinięte okienko pokazuje tylko bieżący cel (ludzie), więc linii w nim nie ma
    expect(celeHtml(widok(g), { otwarte: false, touch: false })).not.toContain(LINIA_PL);
    const wczesniej = r4PrzyEkranie(key, 'zombie', PRZED_PROGIEM_S);
    expect(liNowi(celeHtml(widok(wczesniej), { otwarte: true, touch: false }))).not.toContain('goal-uwaga');
  });

  it('linia zostaje po zapisie i wczytaniu, a późniejsze przyjęcie jej nie zmienia ani nie czyni nieprawdziwą', () => {
    const g = r4PrzyEkranie(key, 'zombie', PO_PROGU_S);
    expect(cel(g, 'nowi').uwaga).toBe(LINIA_PL);
    const h = przezZapis(g);
    expect(cel(h, 'nowi').uwaga).toBe(LINIA_PL);
    applyGov(
      h.sim.st,
      h.sim.w,
      skutki((e) => e.join.push(nowaOsoba(11))),
    );
    expect(cel(h, 'nowi').done).toBe(true);
    // linia opowiada o tym, jak cel się zaliczył (nikt nie został przyjęty, więc zaliczył się sam), a to się nie zmienia
    expect(cel(h, 'nowi').uwaga).toBe(LINIA_PL);
    expect(LINIA_PL).toMatch(/^Nikt nie został przyjęty, więc/);
  });

  it('przyjęcie przed progiem zalicza cel zwykłym tekstem, bez linii o zapasie', () => {
    const g = r4PrzyEkranie(key, 'zombie', PRZED_PROGIEM_S);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => e.join.push(nowaOsoba(12))),
    );
    const c = cel(g, 'nowi');
    expect(c.done).toBe(true);
    expect(c.uwaga).toBeUndefined();
    expect(g.sciezka.zapasem).toBeUndefined();
    // próg mija, a cel zaliczony przyjęciem nie dostaje linii o zapasie
    g.sim.st.tick += 5 * TICKS_PER_DAY;
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
    expect(liNowi(celeHtml(widok(g), { otwarte: true, touch: false }))).not.toContain('goal-uwaga');
  });

  it('przyjęcie w kroku, w którym mija próg, wygrywa z zapasem: bez linii i bez śladu zapasu', () => {
    const g = r4PrzyEkranie(key, 'zombie', PO_PROGU_S);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => e.join.push(nowaOsoba(14))),
    );
    expect(cel(g, 'nowi').done).toBe(true);
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
    expect(g.sciezka.zapasem).toBeUndefined();
  });

  it('R4 otwarty przez samą ścieżkę (po R3), nie hakiem: zapisuje czas przy ekranie, a zapas liczy się od niego', () => {
    const g = poPierwszymRaporcie(key, 'zombie');
    const t = g.sim.st.tick;
    g.sciezka = {
      ...g.sciezka,
      rozdzial: 'r3',
      zrobione: { ...g.sciezka.zrobione, 'r3.priorytet': t, 'r3.stale': t, 'r3.zapas': t },
    };
    krok(g);
    expect(g.sciezka.rozdzial).toBe('r4');
    expect(g.sciezka.odEkran).toBe(czasPrzyEkranie(g.sim.st));
    expect(cel(g, 'nowi').done).toBe(false);
    // doby gry mijają, a czas przy ekranie z nimi (20 ticków na sekundę, jak u bota): tuż przed progiem cel czeka, po progu zalicza się sam
    g.sim.st.tick += (EKRAN_NOWI_ZAPAS - 1) * TICKS_PER_SECOND;
    expect(cel(g, 'nowi').done).toBe(false);
    g.sim.st.tick += TICKS_PER_SECOND;
    expect(cel(g, 'nowi').done).toBe(true);
    expect(g.sciezka.zapasem).toEqual(['r4.nowi']);
  });

  it('zapis sprzed pomiaru czasu przy ekranie liczy doby gry jak dawniej i dalej pokazuje linię', () => {
    // R4 otwarty przed tą zmianą: stan nie ma czasu przy ekranie, a zapas liczył doby gry od ticku otwarcia (trzy doby bez 40 ticków)
    const g = r4Otwarty(key, 'zombie', DOBY_NOWI_ZAPAS, 0);
    g.sciezka.od += 40;
    delete g.sciezka.odEkran;
    expect(cel(g, 'nowi').done, 'dwie doby i prawie cała trzecia').toBe(false);
    for (let k = 0; k < 40; k++) g.sim.step();
    expect(cel(g, 'nowi').done, 'trzy doby gry').toBe(true);
    expect(cel(g, 'nowi').uwaga).toBe(LINIA_PL);
    // cel zaliczony zapasem w dawnej wersji nie ma listy `zapasem`, a linia stoi dalej
    const dawny = r4Otwarty(key, 'zombie', DOBY_NOWI_ZAPAS + 1, 0);
    delete dawny.sciezka.odEkran;
    dawny.sciezka.zrobione['r4.nowi'] = dawny.sim.st.tick;
    delete dawny.sciezka.zapasem;
    expect(cel(dawny, 'nowi').uwaga).toBe(LINIA_PL);
  });

  it('w zwykłym trybie zapasu nie ma nigdy: nawet po dziesięciu dobach przy otwartym R4 cel czeka', () => {
    const g = r4PrzyEkranie(key, 'zwykly', sekundyPrzyEkranie(10, 1));
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

/* ---------------------------------------------------------------- goście pod bramą z prawdziwych kart */

type OknoWydarzenia = Extract<Prompt, { k: 'wydarzenie' }>;

const KOMBINACJE = DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const));

/** zarząd prowadzi wizytę gościa, która jeszcze się nie skończyła (np. dzieci wpuszczone na noc, które rano wychodzą bramą) */
const trwaWizyta = (g: Gra): boolean => !!g.gov.goscie?.aktywny && !g.gov.goscie.aktywny.koniec;

/** Gra z obcymi, w której dzieje się tylko to, co test zaplanuje: drugi dzień rano, R4 otwarty, bez losowych wizyt, bez kart
    z puli i (w zombie) bez szwendaczy. Wizyta z pierwszej doby (goście wpuszczeni na noc) kończy się, zanim test zacznie swoją,
    bo zarząd prowadzi jedną naraz. */
function cichaGra(key: (typeof DEMA)[number], mode: GameMode): Gra {
  const g = bezObcych(poRaporcieZObcymi(key, mode));
  g.gov.ev.next = 1e9;
  for (let n = 0; n < 2 * 960 && trwaWizyta(g); n++) {
    bezSzwendaczy(g);
    sekunda(g);
  }
  expect(trwaWizyta(g), 'wcześniejsza wizyta się skończyła').toBe(false);
  bezSzwendaczy(g);
  // okazje ruszają dopiero po krokach samouczka: bez tego brak okazji przy gościu niczego by nie dowodził
  expect([TUT_STEPS.length, -1]).toContain(g.sim.st.tut.step);
  otworz(g, 'r4');
  return g;
}

/** Planuje prawdziwego gościa z klocków przez zarząd (`planujGoscia`, jak `eventTick`) i wysyła jego plan do symulacji. Ziarno
    zarządu przestawia na pierwsze, które daje gościa spełniającego `ok` (losowanie klocków jest stałe dla ziarna). */
function zaplanujGoscia(g: Gra, ok: (x: Gosc) => boolean, od = 1): Gosc {
  const i = wejscie(g);
  for (let s = od; s < od + 5000; s++) {
    const proba = structuredClone(g.gov);
    proba.rng.s = s;
    if (!ok(planujGoscia(proba, i, emptyEffects(), 'dzien'))) continue;
    g.gov.rng.s = s;
    const fx = emptyEffects();
    const gosc = planujGoscia(g.gov, i, fx, 'dzien');
    applyGov(g.sim.st, g.sim.w, fx);
    return gosc;
  }
  throw new Error('żaden stan losowania zarządu nie dał takiego gościa');
}

/** Gra sekunda po sekundzie, aż grupa stanie pod bramą i otworzy się jej karta; zwraca otwartą kartę o danym id. */
function doKartyGoscia(g: Gra, id = 'gosc'): OknoWydarzenia {
  for (let n = 0; n < 2 * 960; n++) {
    bezSzwendaczy(g);
    const p = sekunda(g, { stoj: ['wydarzenie'] });
    if (p?.k === 'wydarzenie') {
      expect(p.id, 'otwarta karta to karta wizyty').toBe(id);
      return p;
    }
  }
  throw new Error(`karta ${id} się nie otworzyła`);
}

/** Wybór na otwartej karcie po początku polskiego napisu: skutki idą do symulacji, jak po kliknięciu. */
function wybierz(g: Gra, p: OknoWydarzenia, poczatek: string): void {
  const k = p.choices.findIndex((c) => c.label.pl.startsWith(poczatek));
  expect(k, `wybór „${poczatek}” wśród: ${p.choices.map((c) => c.label.pl).join(' | ')}`).toBeGreaterThanOrEqual(0);
  expect(p.choices[k].ok, `wybór „${poczatek}” dostępny`).toBe(true);
  applyGov(g.sim.st, g.sim.w, chooseEvent(g.gov, wejscie(g), k));
  g.sim.step();
}

describe.each(KOMBINACJE)('R4 nowi: gość pod bramą z prawdziwej karty (%s %s)', (key, mode) => {
  const zombie = mode === 'zombie';
  const dom = wDomu(key);
  const przyjecie = dom ? 'Przyjąć do domu' : 'Przyjąć do spółdzielni';
  /** gość, który chce dołączyć i mówi prawdę; w zombie ocaleni, o których mówi podpowiedź */
  const dolacza = (x: Gosc): boolean =>
    x.chce === 'dolaczyc' && x.haczyk === 'prawda' && (!zombie || x.kto === 'ocaleni');

  it('karta ma „Pokaż” i wybór z podpowiedzi, a „Przyjąć do …” zalicza cel dopiero po wyborze', () => {
    const g = cichaGra(key, mode);
    expect(cel(g, 'nowi').done).toBe(false);
    zaplanujGoscia(g, dolacza);
    const p = doKartyGoscia(g);
    // karta niesie miejsce na mapie, więc ma przycisk „Pokaż”, który o nim mówi podpowiedź
    expect(p.gdzie).toBeDefined();
    const o = odczyt(g);
    expect(eventSheet(p, o.words, o.wordsEn).foot).toContain('data-act="event-show"');
    // tytuł karty ma to samo miejsce co podpowiedź, a w zombie i to samo słowo o gościach: „Ocaleni pod bramą”
    const miejsce = dom ? 'pod furtką' : 'pod bramą';
    expect(p.title.pl.endsWith(miejsce)).toBe(true);
    const jak = cel(g, 'nowi').how;
    if (zombie) {
      expect(p.title.pl).toBe(`Ocaleni ${miejsce}`);
      expect(jak).toContain(`${p.title.pl} mają kartę z „Pokaż”`);
    } else expect(jak).toContain(`Gość ${miejsce} ma kartę z „Pokaż”`);
    // wybór, który cytuje podpowiedź, jest na tej karcie
    expect(jak).toContain(`„${przyjecie}”`);
    expect(p.choices.some((c) => c.ok && c.label.pl.startsWith(przyjecie))).toBe(true);
    // po angielsku tak samo; zaimek w napisie karty zależy od gościa (him, her albo them), więc podpowiedź cytuje wszystkie trzy
    ustawJezyk('en');
    const wUjeciu = dom ? 'the house' : 'the co-op';
    const jakEn = cel(g, 'nowi').how;
    expect(jakEn).toContain(`“Take him/her/them into ${wUjeciu}”`);
    if (zombie) expect(jakEn).toContain(`${p.title.en} have a card with “Show”`);
    expect(p.choices.some((c) => c.ok && new RegExp(`^Take (?:him|her|them) into ${wUjeciu}`).test(c.label.en))).toBe(
      true,
    );
    ustawJezyk('pl');
    // karta otwarta, nikt jeszcze nie przyjęty: cel czeka
    expect(cel(g, 'nowi').done).toBe(false);
    wybierz(g, p, przyjecie);
    expect(cel(g, 'nowi').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r4.nowi']);
    // przyjęcie, nie zapas: zwykły tekst, bez linii
    expect(cel(g, 'nowi').uwaga).toBeUndefined();
  });

  it.each(['Wpuścić na noc', 'Odprawić'])('„%s” nie zalicza celu', (wybor) => {
    const g = cichaGra(key, mode);
    zaplanujGoscia(g, dolacza);
    const p = doKartyGoscia(g);
    wybierz(g, p, wybor);
    // grupa wchodzi na noc albo odchodzi: przez kilka godzin gry nikt nie zostaje na stałe
    for (let n = 0; n < 200; n++) {
      bezSzwendaczy(g);
      sekunda(g);
    }
    expect(cel(g, 'nowi').done).toBe(false);
  });

  it('gość pod bramą odprawiony przed otwarciem rozdziału, przyjęty po otwarciu, się liczy; przyjęty przed nim nie', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    g.gov.ev.next = 1e9;
    bezSzwendaczy(g);
    zaplanujGoscia(g, dolacza);
    const p = doKartyGoscia(g);
    // karta otwarta, rozdział otwiera się dopiero teraz: grupa pod bramą nie jest jeszcze przyjęta, więc potem się liczy
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
    wybierz(g, p, przyjecie);
    expect(cel(g, 'nowi').done).toBe(true);
    // ta sama grupa przyjęta przed otwarciem rozdziału: cel nie jest zaliczony
    const h = bezObcych(poRaporcieZObcymi(key, mode));
    h.gov.ev.next = 1e9;
    bezSzwendaczy(h);
    zaplanujGoscia(h, dolacza);
    const q = doKartyGoscia(h);
    wybierz(h, q, przyjecie);
    otworz(h, 'r4');
    expect(cel(h, 'nowi').done).toBe(false);
  });
});

describe.each(DEMA)('R4 nowi: zapas po odprawionym gościu (zombie, %s)', (key) => {
  it('gracz odprawił prosącego o miejsce, nikt nie został przyjęty: po progu zapas zalicza cel, a linia mówi prawdę', () => {
    const g = cichaGra(key, 'zombie');
    zaplanujGoscia(g, (x) => x.chce === 'dolaczyc' && x.haczyk === 'prawda' && x.kto === 'ocaleni');
    const p = doKartyGoscia(g);
    const przed = g.gov.decisions.length;
    wybierz(g, p, 'Odprawić');
    // gracz dostał ofertę przyjęcia i ją odrzucił: zarząd zapisał decyzję o karcie, a ludność się nie zmieniła
    expect(g.gov.decisions.slice(przed).some((d) => d.k === 'wydarzenie')).toBe(true);
    expect(cel(g, 'nowi').done).toBe(false);
    // czas przy ekranie mija (bez grania godziny po godzinie): próg zapasu
    g.sciezka = { ...g.sciezka, odEkran: czasPrzyEkranie(g.sim.st) - EKRAN_NOWI_ZAPAS };
    const c = cel(g, 'nowi');
    expect(c.done).toBe(true);
    // „Nikt nie zapukał” byłoby nieprawdą: ktoś prosił o miejsce, a gracz go odprawił; linia mówi tylko, że nikt nie został przyjęty
    expect(c.uwaga).toBe(LINIA_PL);
    expect(c.uwaga).not.toMatch(/zapuka/);
    expect(g.sciezka.zapasem).toEqual(['r4.nowi']);
  });
});

/** Napis wyboru na karcie po angielsku niesie zaimek gościa: jeden mężczyzna to „him”, jedna kobieta „her”, grupa „them”. Podpowiedź
    cytuje wszystkie trzy naraz („Take him/her/them into …”), więc zaimek z każdej prawdziwej karty musi być jednym z nich. Dwa
    układy (blok w zwykłym trybie, dom w zombie) wystarczą: napis składa ta sama funkcja we wszystkich. */
describe.each([
  ['przymorze', 'zwykly'],
  ['zielonki', 'zombie'],
] as const)('R4 nowi: zaimek w angielskim napisie karty gościa (%s %s)', (key, mode) => {
  const wUjeciu = wDomu(key) ? 'the house' : 'the co-op';
  const ZAIMKI: readonly (readonly [string, (x: Gosc) => boolean])[] = [
    ['him', (x) => x.osoby.length === 1 && !x.osoby[0].f],
    ['her', (x) => x.osoby.length === 1 && x.osoby[0].f],
    ['them', (x) => x.osoby.length > 1],
  ];

  it.each(ZAIMKI)('zaimek „%s” z karty jest wśród cytowanych w podpowiedzi', (zaimek, ten) => {
    const g = cichaGra(key, mode);
    // dowolny gość, który chce dołączyć: napis przyjęcia składa ta sama funkcja dla każdego rodzaju gościa
    zaplanujGoscia(g, (x) => x.chce === 'dolaczyc' && x.haczyk === 'prawda' && ten(x));
    const p = doKartyGoscia(g);
    expect(p.choices.some((c) => c.ok && c.label.en.startsWith(`Take ${zaimek} into ${wUjeciu}`))).toBe(true);
    ustawJezyk('en');
    const cytat = new RegExp(`“Take ([a-z/]+) into ${wUjeciu}”`).exec(cel(g, 'nowi').how);
    expect(cytat, 'podpowiedź cytuje wybór przyjęcia').not.toBeNull();
    expect(cytat![1].split('/')).toEqual(['him', 'her', 'them']);
    expect(cytat![1].split('/')).toContain(zaimek);
  });
});

/* ---------------------------------------------------------------- wyrzucenie bramą, zwierzęta i handlarz */

/** wybór prawdziwej karty po początku napisu, dla danych z jej `make` na prawdziwym hoście; skutki zwraca, nie stosuje */
function wybierzKarte(g: Gra, id: string, poczatek: string): GovEffects {
  const e = polski(M1_EVENTS.find((x) => x.id === id)!);
  const h = makeHost(g.gov, wejscie(g), emptyEffects());
  const d = e.make(h);
  const k = e.choices(h, d).findIndex((c) => c.label.startsWith(poczatek));
  expect(k, `karta ${id} ma wybór „${poczatek}”`).toBeGreaterThanOrEqual(0);
  g.gov.ev.active = { id, d } as NonNullable<typeof g.gov.ev.active>;
  return chooseEvent(g.gov, wejscie(g), k);
}

describe.each(BLOKI.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
  'R4 nowi: wyrzucenie mieszkańca bramą (%s %s)',
  (key, mode) => {
    it('prawdziwa karta „Kradzież z piwnicy” z wyrzuceniem sprawcy nie zalicza celu', async () => {
      const g = await blokZMieszkancami(key, mode);
      otworz(g, 'r4');
      const przed = populacja(g.sim.st).razem;
      const fx = wybierzKarte(g, 'kradziez', 'Wyrzucić sprawcę');
      expect(fx.wyrzuc, 'karta wyprowadza mieszkańca bramą').toHaveLength(1);
      applyGov(g.sim.st, g.sim.w, fx);
      expect(g.sim.st.pawns.some((p) => p.job?.t === 'odejscie')).toBe(true);
      // idzie do bramy, ulicą i znika: przez cały ten czas nikt nie został przyjęty
      for (let n = 0; n < 6000; n++) {
        g.sim.step();
        if (n % 200 === 0) expect(cel(g, 'nowi').done).toBe(false);
      }
      expect(g.sim.st.pawns.some((p) => p.job?.t === 'odejscie')).toBe(false);
      expect(populacja(g.sim.st).razem).toBe(przed - 1);
      expect(cel(g, 'nowi').done).toBe(false);
    });

    it('wyrzucenie niczego nie cofa: przyjęty, a potem wyprowadzony bramą, zostawia cel zaliczony', async () => {
      const g = await blokZMieszkancami(key, mode);
      otworz(g, 'r4');
      const zarzadPrzed = new Set(rdzen(g.sim).map((p) => p.id));
      applyGov(g.sim.st, g.sim.w, fachowiecWciagnac(g));
      expect(cel(g, 'nowi').done).toBe(true);
      const awansowany = awansowani(g, zarzadPrzed)[0];
      const id = g.sim.st.people[awansowany.person].id;
      applyGov(
        g.sim.st,
        g.sim.w,
        skutki((e) => (e.wyrzuc = [id])),
      );
      for (let n = 0; n < 6000; n++) g.sim.step();
      expect(g.sim.st.pawns.includes(awansowany), 'wyszedł bramą').toBe(false);
      expect(cel(g, 'nowi').done).toBe(true);
      expect(cel(g, 'nowi').uwaga).toBeUndefined();
    });
  },
);

describe.each(TRYBY)('R4 nowi: pies i kot nie są nowymi ludźmi (%s)', (mode) => {
  it('prawdziwe karty „Pies przy siatce” i „Kot” dodają pionki zwierząt, a cel czeka', () => {
    const g = nowaGra('przymorze', mode);
    otworz(g, 'r4');
    expect(g.sim.st.pawns.some((p) => p.kind === 'pies' || p.kind === 'kot')).toBe(false);
    const przed = populacja(g.sim.st).razem;
    applyGov(g.sim.st, g.sim.w, wybierzKarte(g, 'pies', 'Przygarnąć'));
    applyGov(g.sim.st, g.sim.w, wybierzKarte(g, 'kot', 'Uwolnić i przygarnąć'));
    // zarząd prosi symulację o zwierzęta, a ta wystawia pionki
    for (let n = 0; n < 60; n++) sekunda(g);
    expect(g.sim.st.pawns.filter((p) => p.kind === 'pies')).toHaveLength(1);
    expect(g.sim.st.pawns.filter((p) => p.kind === 'kot')).toHaveLength(1);
    expect(populacja(g.sim.st).razem, 'zwierzęta nie są ludnością').toBe(przed);
    expect(cel(g, 'nowi').done).toBe(false);
  });
});

describe('R4 nowi: handlarz pod bramą nie jest nowym człowiekiem', () => {
  it('handlarz staje pod bramą, handluje i odchodzi, a cel czeka', () => {
    const g = graZObcymi(3);
    otworz(g, 'r4');
    const { st, w } = g.sim;
    st.obcy!.next = st.tick;
    krokuj(g, () => !!st.pawns.find((p) => p.kind === 'handlarz' && p.job?.phase === 1), 6000);
    const h = st.pawns.find((p) => p.kind === 'handlarz')!;
    expect(cel(g, 'nowi').done, 'handlarz pod bramą').toBe(false);
    // wymiana z menu na handlarzu, z materiałem na zapłatę
    dajMaterial(g, { zlom: 20, czesci: 10, leki: 5, jedzenie: 10, deski: 10, drewno: 10 });
    const handel = commandsAt(st, w, [rdzen(g.sim)[0].id], Math.floor(h.y) * w.size + Math.floor(h.x)).find(
      (m) => m.cmd.t === 'trade' && !m.off,
    );
    expect(handel?.label).toMatch(/^Dać /);
    g.sim.push(handel!.cmd);
    krokuj(g, () => st.obcy!.offers.some((o) => o.left < 2), 6000);
    expect(cel(g, 'nowi').done, 'po wymianie').toBe(false);
    // handlarz odchodzi
    krokuj(g, () => !st.pawns.some((p) => p.kind === 'handlarz'), 20000);
    expect(cel(g, 'nowi').done, 'po odejściu handlarza').toBe(false);
  });
});

/* ---------------------------------------------------------------- okazje nie dublują karty gościa */

describe.each(KOMBINACJE)('okazje a karta gościa: %s %s', (key, mode) => {
  const dom = wDomu(key);
  const kto = Object.keys(KTO).filter((k) => KTO[k as KtoId].tryby.includes(mode)) as KtoId[];

  it.each(kto)('gość „%s” od planu do końca wizyty nie otwiera żadnej okazji, także przy otwartej karcie', (rodzaj) => {
    const g = cichaGra(key, mode);
    zaplanujGoscia(g, (x) => x.kto === rodzaj);
    const bezOkazji = (kiedy: string): void => {
      expect(widok(g).okazja, `okazja ${g.sciezka.okazja?.k} ${kiedy}`).toBeNull();
    };
    bezOkazji('po planie');
    const p = doKartyGoscia(g);
    bezOkazji('przy otwartej karcie');
    // wizyta toczy się dalej po decyzji: odprawa (grupa idzie ulicą z powrotem) i potem cisza. Pętla kończy się 30 s po tym, jak
    // z ulicy znika ostatni pionek gościa (grupy znikają po 26 do 35 s; 400 s to zapas), bo dalej nie ma już wizyty do sprawdzania
    wybierz(g, p, 'Odprawić');
    let bezGosci = 0;
    for (let n = 0; n < 400 && bezGosci < 30; n++) {
      bezSzwendaczy(g);
      sekunda(g);
      bezGosci = g.sim.st.pawns.some((x) => x.kind === 'gosc') ? 0 : bezGosci + 1;
      if (n % 20 === 0) bezOkazji(`${n} s po odprawie`);
    }
    expect(bezGosci, 'odprawiona grupa zeszła z ulicy').toBeGreaterThanOrEqual(30);
    bezOkazji('po wizycie');
  });

  // karty z 0.3, w których ktoś staje pod bramą: uchodźcy i influencerka tylko w zwykłym trybie, dzieci w obu, sąsiad z karty
  // „Fachowiec” tylko w domu (w bloku fachowiec jest już w środku, więc przy bramie nikt nie stoi)
  const karty = ['uchodzcy', 'influencer', 'dzieci', 'fachowiec'].filter(
    (id) => (id !== 'fachowiec' || dom) && fitsMode({ mode }, M1_EVENTS.find((x) => x.id === id)!),
  );

  it.each(karty)('karta „%s” z 0.3 z gościem pod bramą nie otwiera okazji', (id) => {
    const g = cichaGra(key, mode);
    const def = M1_EVENTS.find((x) => x.id === id)!;
    const fx = emptyEffects();
    const h = makeHost(g.gov, wejscie(g), fx);
    expect(planujKarte(g.gov, wejscie(g), fx, def, h, def.make(h)), 'karta wystawia grupę pod bramą').toBe(true);
    applyGov(g.sim.st, g.sim.w, fx);
    expect(widok(g).okazja, 'grupa w drodze').toBeNull();
    const p = doKartyGoscia(g, id);
    expect(p.gdzie, 'karta ma „Pokaż”').toBeDefined();
    expect(widok(g).okazja, 'karta otwarta').toBeNull();
  });
});

/** łańcuchy z kartami, na których ktoś staje pod bramą (src/gov/watki-tresc.ts): dwa w zwykłym trybie i dwa w zombie */
const LANCUCHY: readonly (readonly [(typeof DEMA)[number], GameMode, string])[] = [
  ['zielonki', 'zwykly', 'woda'],
  ['przymorze', 'zwykly', 'ostrzega'],
  ['przymorze', 'zombie', 'dobicie'],
  ['przymorze', 'zombie', 'dach'],
];

describe.each(LANCUCHY)('okazje a karta kroku łańcucha z gościem (%s %s, łańcuch „%s”)', (key, mode, lancuch) => {
  it('karty łańcucha z grupą pod bramą (pierwsza i druga, jeśli przyjdzie w 600 s) mają „Pokaż” i nie otwierają okazji', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    // jeden łańcuch jako wątek sezonu, zwykła pula zamrożona (jak w tests/unit/watki-tresc-gra.test.ts)
    g.gov.lancuchy = true;
    g.gov.watki = { wybrane: [lancuch], haki: {}, krok: {} };
    for (const e of M1_EVENTS) g.gov.ev.last[e.id] = 1e12;
    g.gov.ev.done.dym = true;
    otworz(g, 'r4');
    // pętla kończy się po drugiej karcie z grupą albo 600 s po pierwszej (łańcuchy „dobicie” i „dach” w zombie dają drugą kartę
    // za późno albo wcale, a granie do końca limitu kosztowało po 3 s procesora na łańcuch)
    let karty = 0;
    let pierwsza = -1;
    for (let n = 0; n < 5 * 960 && karty < 2 && (pierwsza < 0 || n - pierwsza < 600); n++) {
      bezSzwendaczy(g);
      const p = sekunda(g, { stoj: ['wydarzenie'] });
      if (p?.k !== 'wydarzenie') continue;
      if (wizytaKarty(g.gov.ev.active)) {
        if (karty === 0) pierwsza = n;
        karty++;
        expect(p.gdzie, `karta ${p.id} z grupą pod bramą ma „Pokaż”`).toBeDefined();
        expect(widok(g).okazja, `okazja przy karcie ${p.id}`).toBeNull();
      }
      odpowiedz(g, p);
    }
    expect(karty, 'łańcuch dał kartę z gościem pod bramą').toBeGreaterThanOrEqual(1);
  });
});

/* ---------------------------------------------------------------- podpowiedź */

describe.each(KOMBINACJE)('R4 nowi: podpowiedź nazywa wybory, które zaliczają cel (%s %s)', (key, mode) => {
  const zombie = mode === 'zombie';
  const dom = wDomu(key);

  it('po polsku i po angielsku mówi o gościu pod bramą i „Pokaż”; „Przyjąć wszystkich” tylko w zwykłym trybie', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    const pl = cel(g, 'nowi').how;
    for (const nazwa of ['„Wciągnąć do roboty”', '„Pokaż”', dom ? '„Przyjąć do domu”' : '„Przyjąć do spółdzielni”'])
      expect(pl).toContain(nazwa);
    expect(pl).toContain(dom ? 'pod furtką' : 'pod bramą');
    // „Pokaż” ma w podpowiedzi jedno znaczenie: drugi raz (komunikat o ludziach idących od bramy) to ten sam przycisk
    expect(pl).toContain('komunikat o ich drodze ma ten sam „Pokaż”');
    if (zombie) {
      expect(pl).toContain('Ocaleni');
      expect(pl, 'zombie: „Ocaleni”, jak w tytule karty, nie „Ocalali”').not.toContain('Ocalali');
      expect(pl, 'karty zombie nie mają „Przyjąć wszystkich”').not.toContain('Przyjąć wszystkich');
    } else expect(pl).toContain('„Przyjąć wszystkich”');
    ustawJezyk('en');
    const en = cel(g, 'nowi').how;
    for (const nazwa of [
      '“Put him/her to work”',
      '“Show”',
      `“Take him/her/them into ${dom ? 'the house' : 'the co-op'}”`,
    ])
      expect(en).toContain(nazwa);
    expect(en).toContain('the notice about them coming in has the same “Show”');
    if (zombie) {
      expect(en).toContain('Survivors at');
      expect(en).not.toContain('Take everyone in');
    } else expect(en).toContain('“Take everyone in”');
    expect(polskieSlowa(en)).toEqual([]);
  });

  it('„Wciągnąć do roboty” z prawdziwej karty „Fachowiec” zalicza cel: awansem w bloku, nową osobą w domu', async () => {
    const blok = !dom;
    const g = blok ? await blokZMieszkancami(key as (typeof BLOKI)[number], mode) : poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
    const fx = fachowiecWciagnac(g);
    expect((fx.awans?.length ?? 0) + fx.join.length, 'karta kogoś bierze').toBe(1);
    if (blok) expect(fx.awans).toHaveLength(1);
    else expect(fx.join).toHaveLength(1);
    applyGov(g.sim.st, g.sim.w, fx);
    expect(cel(g, 'nowi').done).toBe(true);
  });

  it(`„Przyjąć wszystkich” z karty „Ludzie pod bramą” ${zombie ? 'nie istnieje w zombie' : 'zalicza cel'}`, () => {
    const def = M1_EVENTS.find((x) => x.id === 'uchodzcy')!;
    expect(fitsMode({ mode }, def), 'karta w puli tego trybu').toBe(!zombie);
    if (zombie) return;
    const g = cichaGra(key, mode);
    const fx = emptyEffects();
    const h = makeHost(g.gov, wejscie(g), fx);
    expect(planujKarte(g.gov, wejscie(g), fx, def, h, def.make(h))).toBe(true);
    applyGov(g.sim.st, g.sim.w, fx);
    const p = doKartyGoscia(g, 'uchodzcy');
    expect(cel(g, 'nowi').done, 'karta otwarta').toBe(false);
    wybierz(g, p, 'Przyjąć wszystkich');
    expect(cel(g, 'nowi').done).toBe(true);
  });
});
