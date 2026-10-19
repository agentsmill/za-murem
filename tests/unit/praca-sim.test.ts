/* Szkielet automatu pracy w think() (src/sim/sim.ts, docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, „Kiedy
   pracują”): kolejność po potrzebach (zimno, gasnąca koza, potem rodzaje według priorytetów osoby), przerwania prac
   podjętych bez polecenia (AUTO_JOBS) i brak pętli „start, przerwanie, start” przy zimnie. Nowe rodzaje (NOWE) ruszają
   dopiero od pierwszego rana (bez poleceń samouczek się nie kończy, więc od dnia 3, 6:00), więc pierwsze doby bez
   poleceń mają ten sam skrót stanu co przed pracą ludzi; same rodzaje Drwal, Naprawy i Noszenie: praca-rodzaje.test.ts.
   Sceny są małe i deterministyczne: reszta zarządu jest na wyprawie (`away`, stoi w miejscu), badana osoba syta,
   wyspana i ciepła, dopóki test nie powie inaczej. */

import { describe, expect, it, vi } from 'vitest';
import { BUILDS, canPlace } from '../../src/sim/budowle.ts';
import { clockOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { fenceShape } from '../../src/sim/perimeter.ts';
import { automatRusza, NOWE, priorytet, RODZAJE } from '../../src/sim/praca.ts';
import { BURN_TICKS, type Job, type JobKind, type Pawn, type Sim, type Thing } from '../../src/sim/sim.ts';
import type { World } from '../../src/world/world.ts';
import { doRana, przelacznik, skonczSamouczek, wylaczAutomat } from './praca-pomoc.ts';
import { core, demoWorld, newGame, until } from './sasiedzi-pomoc.ts';

/** prywatne części Sim, po które sięgają sceny (kontrakt testowy, nie API gry) */
interface Prywatne {
  think(p: Pawn): void;
  work(p: Pawn, j: Job): boolean;
  newJob(t: JobKind, target: number, tile: number, order: boolean, phase?: number): Job;
  koza(): Thing | undefined;
  addWood(tile: number, n: number): void;
  pileAt(tile: number): Thing | undefined;
  insideAt(tile: number): boolean;
  release(p: Pawn): void;
  setJob(p: Pawn, j: Job, keepCarry: boolean): void;
  yardDanger(): boolean;
  regionOf(p: Pawn): number;
  dist2(p: Pawn, tile: number): number;
  coreBlocked: Uint8Array;
  reg: Int32Array;
  w: World;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

/** tick o godzinie `h` dnia `d` (gra zaczyna o 15:00 pierwszego dnia); zawsze wielokrotność 20 */
const tickO = (d: number, h: number): number => ((d - 1) * 24 + h - 15) * TICKS_PER_HOUR;

type Plan = Sim['st']['builds'][number];
interface Scena {
  sim: Sim;
  p: Pawn;
  /** plan budowy z kompletem materiałów, albo null */
  plan: Plan | null;
}

/** Gra na demie: po stu krokach reszta zarządu na wyprawie, badana osoba (pierwsza) bez pracy, syta, wyspana i ciepła,
    koza pali się na długo, pora dnia około 15:00. `plan`: ogródek na podwórku z doniesionymi materiałami. */
function scena(opcje: { plan?: boolean; skills?: Record<string, number>; key?: string } = {}): Scena {
  const key = opcje.key ?? 'przymorze';
  const sim = newGame(key, 'zwykly', 5);
  for (let i = 0; i < 100; i++) sim.step();
  // przełącznik „za siatkę” jest w trybie zwykłym domyślnie włączony, a sceny zakładają, że bez polecenia testu nikt
  // sam za siatkę nie wychodzi (test włącza go osobie, której to dotyczy)
  przelacznik(sim, core(sim), false);
  sim.step();
  const st = sim.st;
  const [p, ...reszta] = core(sim);
  for (const q of reszta) q.away = true;
  for (const q of core(sim)) {
    q.job = null;
    q.path = [];
    q.pi = 0;
    q.wait = st.tick;
    q.needs!.food = 90;
    q.needs!.rest = 90;
    q.needs!.warm = 60;
  }
  st.people[p.person].skills = { ...opcje.skills };
  prv(sim).koza()!.fuel = 3 * BURN_TICKS;
  let plan: Plan | null = null;
  if (opcje.plan) {
    const w = demoWorld(key);
    let at: { x: number; y: number; rot: number } | null = null;
    for (const rot of [0, 1])
      for (const i of fenceShape(w)?.yard ?? [])
        if (!at && canPlace(st, w, 'ogrodek', i % w.size, Math.floor(i / w.size), rot).ok)
          at = { x: i % w.size, y: Math.floor(i / w.size), rot };
    if (!at) throw new Error('brak miejsca na ogródek');
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', ...at });
    sim.step();
    plan = st.builds[0];
    plan.have = { ...BUILDS.ogrodek.cost };
  }
  odnow(sim, p);
  return { sim, p, plan };
}

/** zeruje pracę osoby przed kolejnym wywołaniem think() (krok gry sam woła think() bezczynnej osobie) */
function odnow(sim: Sim, p: Pawn): void {
  prv(sim).release(p);
  p.job = null;
  p.path = [];
  p.pi = 0;
  p.carry = 0;
  p.wait = sim.st.tick;
}

/** liczy rozpoczęte prace badanej osoby według rodzaju (setJob podglądany przez spy; jedno wywołanie na grę) */
function liczStarty(sim: Sim, p: Pawn): Partial<Record<JobKind, number>> {
  const n: Partial<Record<JobKind, number>> = {};
  const s = prv(sim);
  const org = s.setJob.bind(s);
  vi.spyOn(s, 'setJob').mockImplementation((pp, j, keep) => {
    if (pp === p) n[j.t] = (n[j.t] ?? 0) + 1;
    org(pp, j, keep);
  });
  return n;
}

const jaka = (p: Pawn): string => p.job?.t ?? '-';

/** polecenia ustawiające wszystkie rodzaje pracy osoby na 0 (po jednym kroku obowiązują) */
function wylaczWszystko(sim: Sim, p: Pawn): void {
  for (const r of RODZAJE) sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: 0 });
  sim.step();
  odnow(sim, p);
}

/** Najbliższy osobie kafelek bez rzeczy, do którego da się dojść: `poza`, czyli poza siatką, albo `podworko`
    (w obrębie siatki, ale nie w składzie, bo skład nie jest „stertą poza składem”). */
function wolnyKafelek(sim: Sim, p: Pawn, gdzie: 'poza' | 'podworko'): number {
  const s = prv(sim);
  const size = s.w.size;
  const region = s.regionOf(p);
  const kandydaci: number[] = [];
  if (gdzie === 'podworko') kandydaci.push(...(fenceShape(s.w)?.yard ?? []));
  else for (let i = 0; i < size * size; i++) if (!s.insideAt(i)) kandydaci.push(i);
  const zajete = (i: number): boolean =>
    sim.st.things.some(
      (t) => i % size >= t.x && i % size < t.x + t.w && Math.floor(i / size) >= t.y && Math.floor(i / size) < t.y + t.h,
    );
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (const i of kandydaci) {
    if (s.coreBlocked[i] || s.reg[i] !== region || zajete(i)) continue;
    const d = s.dist2(p, i);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

describe('kolejność: koza, kuchnia, budowa', () => {
  it('osoba bez umiejętności: koza, kuchnia, budowa w tej samej kolejności co przed zmianą', () => {
    const { sim, p } = scena({ plan: true });
    const s = prv(sim);
    const koza = s.koza()!;
    // jest co robić we wszystkim naraz: koza gaśnie i leży drewno w składzie, trzeba gotować, plan czeka z materiałem
    s.addWood(sim.house!.sklad[0], 6);
    p.needs!.food = 30;
    koza.fuel = BURN_TICKS / 2;
    s.think(p);
    expect(jaka(p)).toBe('refuel');
    odnow(sim, p);
    koza.fuel = 3 * BURN_TICKS;
    koza.by = -1;
    s.think(p);
    expect(jaka(p)).toBe('cook');
    odnow(sim, p);
    p.needs!.food = 90;
    s.think(p);
    expect(jaka(p)).toBe('build');
  });

  it('priorytet rozstrzyga: budowniczy z umiejętnością 4 buduje przed gotowaniem, a osoba bez niej gotuje', () => {
    const budowniczy = scena({ plan: true, skills: { bud: 4 } });
    budowniczy.p.needs!.food = 30;
    prv(budowniczy.sim).think(budowniczy.p);
    expect(jaka(budowniczy.p)).toBe('build');
    const nowicjusz = scena({ plan: true });
    nowicjusz.p.needs!.food = 30;
    prv(nowicjusz.sim).think(nowicjusz.p);
    expect(jaka(nowicjusz.p)).toBe('cook');
  });

  it('stałe zajęcie idzie przed wszystkim z tabeli, także przy priorytecie 0', () => {
    const sc = scena({ plan: true });
    const { sim, p } = sc;
    p.needs!.food = 30;
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'budowa', prio: 0 });
    sim.step();
    odnow(sim, p);
    prv(sim).think(p);
    expect(jaka(p)).toBe('cook');
    odnow(sim, p);
    sim.push({ t: 'stale', ids: [], osoba: p.person, rodzaj: 'budowa' });
    sim.step();
    odnow(sim, p);
    prv(sim).think(p);
    expect(jaka(p)).toBe('build');
  });
});

describe('pierwsza doba bez poleceń', () => {
  /* Skróty policzone na czystym HEAD 0a6136c (przed zmianą think()): newGame(klucz, 'zwykly', 5), 4 osoby zarządu, ani
     jednego polecenia, kroki do ostatniego ticka przed 6:00 dnia 2 (tick 11999) i dnia 3 (tick 31199). Bez poleceń
     samouczek się nie kończy, więc bramka nowych rodzajów otwiera się dopiero w dniu 3 o 6:00. */
  const RANO_2 = tickO(2, 6) - 1;
  const RANO_3 = tickO(3, 6) - 1;
  const PRZED: Record<string, [string, string]> = {
    przymorze: ['e2c8f6b5', '0f293d8c'],
    lanciego: ['1dd6ee8e', '92999e51'],
    zielonki: ['0cd94aa5', '77ff5a92'],
  };

  it('pierwsza doba bez poleceń ma ten sam skrót co przed zmianą (Przymorze, Lanciego, Zielonki)', () => {
    for (const [key, [dzien2, dzien3]] of Object.entries(PRZED)) {
      const sim = newGame(key, 'zwykly', 5);
      while (sim.st.tick < RANO_2) sim.step();
      expect(clockOf(sim.st.tick)).toBe('05:59');
      expect(sim.hash(), `${key}, dzień 2, 5:59`).toBe(dzien2);
      while (sim.st.tick < RANO_3) sim.step();
      expect(clockOf(sim.st.tick)).toBe('05:59');
      expect(sim.hash(), `${key}, dzień 3, 5:59`).toBe(dzien3);
    }
  });
});

describe('zimno przed pracą', () => {
  it('zimno poniżej 10 przy czekającym planie budowy: najpierw ciepło, bez pętli budowa–przerwanie', () => {
    const { sim, p } = scena({ plan: true });
    p.needs!.warm = 8;
    const starty = liczStarty(sim, p);
    const widziane: string[] = [];
    for (let k = 0; k < 200; k++) {
      sim.step();
      if (p.job && widziane[widziane.length - 1] !== p.job.t) widziane.push(p.job.t);
    }
    expect(widziane[0]).toBe('warm');
    expect(starty.build ?? 0).toBeLessThanOrEqual(1);
  });

  it('gasnąca koza: dokłada przed budową (dziś tak samo), także przy cieple powyżej 10', () => {
    const { sim, p } = scena({ plan: true });
    const s = prv(sim);
    s.addWood(sim.house!.sklad[0], 6);
    s.koza()!.fuel = BURN_TICKS / 2;
    s.think(p);
    expect(jaka(p)).toBe('refuel');
  });
});

/* Przegląd końcowy (korekta decyzji „nowe rodzaje nie startują przy pilnej potrzebie”): pilna potrzeba blokuje nowe
   rodzaje i przerywa pracę bez polecenia tylko wtedy, gdy da się jej zaradzić (zimno: koza się pali albo jest drewno do
   dołożenia na naszym terenie; głód: posiłek albo zapasy). Praca z polecenia przerywa się jak dotąd. */
describe('pilna potrzeba, której nie da się zaradzić', () => {
  /** bez drewna (sterty i w rękach) i z zimną kozą */
  function bezDrewna(sim: Sim): void {
    sim.st.things = sim.st.things.filter((t) => t.kind !== 'drewno');
    for (const q of core(sim)) q.carry = 0;
    prv(sim).koza()!.fuel = 0;
  }

  it('sonda przeglądu: zmarznięty drwal przy zgasłej kozie bez drewna rąbie, a potem dokłada do kozy', () => {
    // Lanciego, dzień 2, 6:00 po samouczku, wszyscy z przełącznikiem „za siatkę”, pierwsza osoba ze stałym zajęciem
    // Drwal, drewna nie ma, koza zgasła, cały zarząd zmarznięty (ciepło 0)
    const sim = newGame('lanciego', 'zwykly', 5);
    sim.step();
    skonczSamouczek(sim);
    doRana(sim, 2);
    const ludzie = core(sim);
    for (const q of ludzie) sim.push({ t: 'zasiatke', ids: [], osoba: q.person, on: true });
    sim.push({ t: 'stale', ids: [], osoba: ludzie[0].person, rodzaj: 'drwal' });
    sim.step();
    bezDrewna(sim);
    for (const q of ludzie) {
      odnow(sim, q);
      q.needs!.warm = 0;
    }
    const p = ludzie[0];
    const koza = prv(sim).koza()!;
    const kolejno: string[] = [];
    let ktosDokladal = false;
    const zapisz = (): void => {
      const t = p.job?.t;
      if (t && kolejno[kolejno.length - 1] !== t) kolejno.push(t);
      if (ludzie.some((q) => q.job?.t === 'refuel')) ktosDokladal = true;
    };
    // w ciągu kwadransa gry drwal idzie rąbać (przed poprawką stał do południa)
    until(
      sim,
      () => {
        zapisz();
        return p.job?.t === 'chop';
      },
      TICKS_PER_HOUR / 4,
    );
    expect(p.job?.t, clockOf(sim.st.tick)).toBe('chop');
    expect(p.job?.order).toBe(false);
    // do 7:15 koza znów się pali (ktoś narąbał i dołożył), a do 12:15 ktoś z zarządu dokładał do niej po rąbaniu. Z godziną
    // palenia na sztukę drewna (koza z głową) nie musi to być sam drwal: dokłada ten, kto akurat jest wolny, bo drwal ze
    // stałym zajęciem rąbie dalej, dopóki w obrębie siatki jest mniej drewna niż próg
    const krok = (): boolean => {
      zapisz();
      return false;
    };
    until(sim, krok, TICKS_PER_HOUR);
    expect(koza.fuel, clockOf(sim.st.tick)).toBeGreaterThan(0);
    until(sim, krok, 5 * TICKS_PER_HOUR);
    expect(kolejno.indexOf('chop'), kolejno.join(' ')).toBe(0);
    expect(ktosDokladal, kolejno.join(' ')).toBe(true);
  });

  it('ciepło 8, zgasła koza bez drewna i plan budowy: buduje bez pętli start–przerwanie (sonda przeglądu)', () => {
    const { sim, p } = scena({ plan: true });
    bezDrewna(sim);
    p.needs!.warm = 8;
    // mieszkańcy w domu: liczą się tylko drogi badanej osoby
    for (const q of sim.st.pawns) if (q.kind === 'resident') q.away = true;
    const starty = liczStarty(sim, p);
    const drogi = sim.stats.paths;
    for (let k = 0; k < 2000; k++) sim.step();
    // przed poprawką 43 starty budowy w 2000 krokach (a z drogami mieszkańców 56 dróg A*)
    expect(starty.build ?? 0).toBeLessThanOrEqual(1);
    expect(sim.stats.paths - drogi).toBeLessThan(5);
  });

  it('praca z polecenia ustępuje pilnej potrzebie jak dotąd, także gdy nie da się jej zaradzić', () => {
    const { sim, p, plan } = scena({ plan: true });
    bezDrewna(sim);
    p.needs!.warm = 8;
    sim.push({ t: 'build', ids: [p.id], kind: plan!.kind, x: plan!.x, y: plan!.y, rot: plan!.rot });
    sim.step();
    expect(p.job?.t).toBe('build');
    expect(p.job?.order).toBe(true);
    until(sim, () => p.job?.t !== 'build' || p.job.order !== true, 2000);
    // polecenie przerwane przed końcem budowy (plan stoi), osoba bez pracy z polecenia
    expect(p.job?.order ?? false).toBe(false);
    expect(sim.st.builds.includes(plan!)).toBe(true);
  });

  it('głód: praca bez polecenia przerywa się, gdy jest co zjeść, a bez jedzenia trwa', () => {
    const przerwana = (jedzenie: boolean): boolean => {
      const { sim, p } = scena();
      const s = prv(sim);
      sim.st.tick = tickO(2, 12);
      if (!jedzenie) sim.st.things = sim.st.things.filter((t) => t.kind !== 'jedzenie' && t.kind !== 'posilek');
      p.needs!.food = 5;
      const j = s.newJob('chop', 0, prv(sim).w.size + 1, false, 1);
      j.until = sim.st.tick + 100000;
      p.job = j;
      return !s.work(p, j);
    };
    expect(przerwana(true)).toBe(true);
    expect(przerwana(false)).toBe(false);
  });
});

describe('polecenie gracza i ustawienia', () => {
  it('polecenie gracza w trakcie pracy z automatu wygrywa od razu i po końcu wraca automat', () => {
    const { sim, p, plan } = scena({ plan: true, skills: { bud: 4 } });
    p.needs!.food = 30; // kuchnia czeka, ale budowniczy z priorytetem 1 buduje przed nią
    until(sim, () => p.job?.t === 'build', 400);
    expect(p.job?.t).toBe('build');
    expect(p.job?.order).toBe(false);
    expect(plan!.by).toBe(p.id);
    // rozkaz gracza zastępuje ją w następnym kroku, plan wraca do wolnych
    sim.push({ t: 'move', ids: [p.id], to: sim.house!.sklad[0] });
    sim.step();
    expect(p.job?.t).toBe('go');
    expect(p.job?.order).toBe(true);
    expect(plan!.by).toBe(-1);
    // dopóki rozkaz trwa, automat nie wraca (czeka godzinę gry na miejscu)
    for (let k = 0; k < 300; k++) sim.step();
    expect(p.job?.t).toBe('go');
    // po końcu rozkazu znów priorytety osoby: budowa przed kuchnią
    until(sim, () => p.job?.t !== 'go', 3000);
    expect(jaka(p)).toBe('build');
    expect(p.job?.order).toBe(false);
  });

  it('wszystkie rodzaje na 0: je, śpi i grzeje się, poza tym stoi', () => {
    // stoi: jest plan z materiałem, drewno poza składem, gotowanie do zrobienia, a nie robi nic
    const stoi = scena({ plan: true });
    wylaczWszystko(stoi.sim, stoi.p);
    prv(stoi.sim).addWood(wolnyKafelek(stoi.sim, stoi.p, 'poza'), 6);
    stoi.p.needs!.food = 30;
    const starty = liczStarty(stoi.sim, stoi.p);
    for (let k = 0; k < 200; k++) stoi.sim.step();
    expect(starty).toEqual({});
    expect(stoi.p.job).toBeNull();
    // je
    const je = scena({ plan: true });
    wylaczWszystko(je.sim, je.p);
    je.p.needs!.food = 8;
    prv(je.sim).think(je.p);
    expect(jaka(je.p)).toBe('eat');
    // śpi
    const spi = scena({ plan: true });
    wylaczWszystko(spi.sim, spi.p);
    spi.p.needs!.rest = 10;
    prv(spi.sim).think(spi.p);
    expect(jaka(spi.p)).toBe('sleep');
    // grzeje się: i przy cieple poniżej 10, i poniżej COLD
    for (const warm of [8, 30]) {
      const grzeje = scena({ plan: true });
      wylaczWszystko(grzeje.sim, grzeje.p);
      grzeje.p.needs!.warm = warm;
      prv(grzeje.sim).think(grzeje.p);
      expect(jaka(grzeje.p), `ciepło ${warm}`).toBe('warm');
    }
  });

  /* Rozstrzygnięcie sterującego (zadanie 4): wybór gracza „Ogień: nie robi” wygrywa z dawnym obyczajem, że gasnącą
     kozę dokłada każdy bezczynny. Zadanie 3 przypięło odwrotnie (dokłada także osoba ze wszystkimi rodzajami na 0);
     teraz dokłada ten, kto ma Ogień włączony (priorytet większy od 0 albo stałe zajęcie Ogień). */
  it('gasnąca koza: dokłada ten, kto ma Ogień włączony (priorytet albo stałe zajęcie); wyłączony Ogień znaczy, że nie dokłada', () => {
    const gasnaca = (ustaw?: (sim: Sim, p: Pawn) => void): string => {
      const { sim, p } = scena();
      wylaczWszystko(sim, p);
      if (ustaw) {
        ustaw(sim, p);
        sim.step();
        odnow(sim, p);
      }
      const s = prv(sim);
      s.addWood(sim.house!.sklad[0], 6);
      s.koza()!.fuel = BURN_TICKS / 2;
      s.think(p);
      return jaka(p);
    };
    // wszystkie rodzaje na 0, w tym Ogień: nie dokłada (je, śpi i grzeje się, poza tym stoi)
    expect(gasnaca()).toBe('-');
    // Ogień z priorytetem 4 (najmniej ważny, ale włączony): dokłada
    expect(gasnaca((sim, p) => sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'ogien', prio: 4 }))).toBe(
      'refuel',
    );
    // stałe zajęcie Ogień przy priorytecie 0 w tabeli: włącza ten rodzaj, więc dokłada
    expect(gasnaca((sim, p) => sim.push({ t: 'stale', ids: [], osoba: p.person, rodzaj: 'ogien' }))).toBe('refuel');
    // inny rodzaj włączony nie wystarcza: Ogień ma osobny wybór
    expect(gasnaca((sim, p) => sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'budowa', prio: 1 }))).toBe('-');
  });
});

describe('przerwania prac podjętych bez polecenia (AUTO_JOBS)', () => {
  type Powod = 'pilna' | 'noc' | 'wrog';
  type Rodzaj = 'chop' | 'craft' | 'haul';

  /** Czy praca `rodzaj` (z polecenia albo bez) przerywa się w work() z powodu `powod`. Reszta potrzeb jest w porządku,
      osoba stoi poza siatką (wróg na podwórku przerywa tylko pracujących na zewnątrz). Noszenie ocenia się po tym,
      czy zdążyło zabrać drewno ze sterty (work() przerwane nic nie bierze); `wSiatce`: sterta w obrębie siatki. */
  function przerwana(rodzaj: Rodzaj, order: boolean, powod: Powod, wSiatce = false): boolean {
    const sc = scena();
    const { sim, p } = sc;
    const s = prv(sim);
    const size = s.w.size;
    const tile = wSiatce ? sim.house!.sklad[0] : wolnyKafelek(sim, p, 'poza');
    p.x = (tile % size) + 0.5;
    p.y = Math.floor(tile / size) + 0.5;
    p.path = [];
    p.pi = 0;
    sim.st.tick = powod === 'noc' ? tickO(1, 23) : tickO(2, 12);
    if (powod === 'pilna') p.needs!.food = 5;
    if (powod === 'wrog') vi.spyOn(s, 'yardDanger').mockReturnValue(true);
    let j: Job;
    if (rodzaj === 'haul') {
      s.addWood(tile, 4);
      const pile = s.pileAt(tile)!;
      pile.by = p.id;
      j = s.newJob('haul', pile.id, tile, order);
    } else {
      // praca w toku, do końca daleko
      j = s.newJob(rodzaj, rodzaj === 'chop' ? 0 : -1, tile, order, 1);
      j.until = sim.st.tick + 100000;
    }
    p.job = j;
    const trwa = s.work(p, j);
    return rodzaj === 'haul' ? p.carry === 0 : !trwa;
  }

  it('praca bez polecenia z AUTO_JOBS przerywa się nocą i przy wrogu na podwórku, a pilna potrzeba też; z polecenia nie', () => {
    for (const rodzaj of ['chop', 'craft', 'haul'] as const)
      for (const powod of ['pilna', 'noc', 'wrog'] as const) {
        expect(przerwana(rodzaj, false, powod), `${rodzaj} bez polecenia, ${powod}`).toBe(true);
        expect(przerwana(rodzaj, true, powod), `${rodzaj} z polecenia, ${powod}`).toBe(false);
      }
  });

  it('noszenie drewna w obrębie siatki trwa w nocy, ale przerywa się przy pilnej potrzebie', () => {
    expect(przerwana('haul', false, 'noc', true)).toBe(false);
    expect(przerwana('haul', false, 'pilna', true)).toBe(true);
  });

  it('nocą bezczynny nie zaczyna noszenia drewna zza siatki, z obrębu siatki tak; za dnia zza siatki tylko z przełącznikiem', () => {
    const noc = () => {
      const sc = scena();
      sc.sim.st.tick = tickO(1, 23);
      sc.p.needs!.rest = 95; // wyspany, żeby nie szedł spać
      return sc;
    };
    // za siatką: nocą stoi
    const zaSiatka = noc();
    prv(zaSiatka.sim).addWood(wolnyKafelek(zaSiatka.sim, zaSiatka.p, 'poza'), 6);
    prv(zaSiatka.sim).think(zaSiatka.p);
    expect(jaka(zaSiatka.p)).toBe('-');
    // za dnia: zadanie 4 zmieniło dzisiejsze startHaul, które brało najbliższą stertę z całego obszaru, także zza bramy;
    // teraz stertę spoza siatki bierze tylko osoba z przełącznikiem „Może wychodzić za siatkę” (mozeTam)
    const dzien = scena();
    dzien.sim.st.tick = tickO(2, 12);
    const zewnatrz = wolnyKafelek(dzien.sim, dzien.p, 'poza');
    prv(dzien.sim).addWood(zewnatrz, 6);
    prv(dzien.sim).think(dzien.p);
    expect(jaka(dzien.p)).toBe('-');
    dzien.sim.push({ t: 'zasiatke', ids: [], osoba: dzien.p.person, on: true });
    dzien.sim.step();
    odnow(dzien.sim, dzien.p);
    prv(dzien.sim).think(dzien.p);
    expect(jaka(dzien.p)).toBe('haul');
    expect(dzien.p.job?.tile).toBe(zewnatrz);
    // w obrębie siatki (podwórko): nocą niesie, jak dotąd
    const wSiatce = noc();
    const podworko = wolnyKafelek(wSiatce.sim, wSiatce.p, 'podworko');
    expect(prv(wSiatce.sim).insideAt(podworko)).toBe(true);
    prv(wSiatce.sim).addWood(podworko, 6);
    prv(wSiatce.sim).think(wSiatce.p);
    expect(jaka(wSiatce.p)).toBe('haul');
    expect(wSiatce.p.job?.tile).toBe(podworko);
  });
});

describe('pomocniki testów pracy (praca-pomoc.ts)', () => {
  it('wylaczAutomat zeruje nowe rodzaje każdemu z zarządu, a stare zostawia', () => {
    const sim = newGame('przymorze', 'zwykly', 5);
    const przed = core(sim).map((p) => RODZAJE.filter((r) => !NOWE.has(r)).map((r) => priorytet(sim.st, p.person, r)));
    wylaczAutomat(sim);
    for (const p of core(sim)) for (const r of NOWE) expect(priorytet(sim.st, p.person, r), `${p.person} ${r}`).toBe(0);
    const po = core(sim).map((p) => RODZAJE.filter((r) => !NOWE.has(r)).map((r) => priorytet(sim.st, p.person, r)));
    expect(po).toEqual(przed);
  });

  it('doRana staje na pierwszym ticku 6:00 podanego dnia, a skonczSamouczek otwiera bramkę nowych rodzajów', () => {
    const sim = newGame('przymorze', 'zwykly', 5);
    doRana(sim, 2);
    expect(clockOf(sim.st.tick)).toBe('06:00');
    expect(sim.st.tick).toBe(tickO(2, 6));
    expect(automatRusza(sim.st)).toBe(false); // samouczek się nie skończył
    skonczSamouczek(sim);
    expect(automatRusza(sim.st)).toBe(true);
    doRana(sim, 3);
    expect(sim.st.tick).toBe(tickO(3, 6));
  });
});
