/* Praca ludzi (src/sim/praca.ts) razem z polecenie, które przeżywa walkę (Pawn.polecenie, Sim.przerwij i wznow, projekt
   w docs/superpowers/specs/2026-10-17-tryb-zombie-design.md). Scalenie `praca-ludzi` z `noc-integracja` f13ad36:
   - polecenia z pracy ludzi, które dają pionkowi pracę z order: true, idą tą samą drogą co inne rozkazy (Sim.rozkaz),
     więc polecenie zaproszenia wędrowca i pytania o rękę jest zapamiętywane i opisane w kronice;
   - polecenie gracza na pracę, którą osoba już robi z automatu, podnosi tę samą pracę do polecenia (order false → true,
     ten sam obiekt pracy), więc też trafia do pamięci i po walce wraca;
   - po wygranej walce wznowione polecenie ma pierwszeństwo przed automatem (think: wznow przed regułą powrotu do domu
     i przed rodzajami pracy);
   - automat nie wysyła nikogo na mapę miasta (wyprawy robi tylko karta nocy i gracz poleceniem 'away'). */

import { describe, expect, it } from 'vitest';
import { tekstPrzerwania } from '../../src/gov/znaleziska.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { RODZAJE } from '../../src/sim/praca.ts';
import {
  BURN_TICKS,
  createSim,
  type Job,
  type JobKind,
  type Pawn,
  POLECENIA_WZNAWIANE,
  Sim,
  type SimOpts,
  type SimState,
  spawnZombie,
  type Thing,
} from '../../src/sim/sim.ts';
import type { World } from '../../src/world/world.ts';
import { mockBlock, mockBlockM2, trunkTile } from './interior-mock.ts';
import { skonczSamouczek } from './praca-pomoc.ts';
import { newGame, core as zarzadu } from './sasiedzi-pomoc.ts';

/** prywatne części Sim, po które sięgają sceny (kontrakt testowy, nie API gry) */
interface Prywatne {
  think(p: Pawn): void;
  koza(): Thing | undefined;
  release(p: Pawn): void;
  startChop(p: Pawn, k: number, order: boolean): boolean;
  newJob(t: JobKind, target: number, tile: number, order: boolean, phase?: number): Job;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;
const jaka = (p: Pawn): string => p.job?.t ?? '-';

/* ---------- zaproszenie wędrowca i pytanie o rękę ---------- */

const wM2 = mockBlockM2();
const FAR = tickAt(30, 10);
const kto = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const run = (sim: Sim, ok: () => boolean, max = 20000) => {
  let k = 0;
  for (; k < max && !ok(); k++) sim.step();
  return k;
};
/** jak run, ale bez szwendaczy, które tryb zombie sam stawia za dnia */
const calm = (sim: Sim, ok: () => boolean, max = 20000) =>
  run(
    sim,
    () => {
      sim.st.pawns = sim.st.pawns.filter((p) => p.kind !== 'zombie');
      return ok();
    },
    max,
  );

/** gra z obcymi dnia 2 o 10:00; przychodzi tylko wędrowiec, najedzeni i ogrzani (jak w werbunek.test.ts) */
function gra(world: World, seed: number, opts: Partial<SimOpts> = {}): { sim: Sim; st: SimState } {
  const st = createSim(world, seed, { core: 2, obcy: true, ...opts });
  const sim = new Sim(world, st);
  st.tick = tickAt(2, 10);
  st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  const o = st.obcy!;
  o.next = FAR;
  o.wnext = st.tick;
  o.enext = FAR;
  for (const p of kto(st)) {
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
  }
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 20 * TICKS_PER_HOUR;
  return { sim, st };
}

/** wędrowiec przy siatce po rozmowie: jego pionek i osoba z zarządu, która rozmawiała */
function pozagadaniu(sim: Sim, zombie = false): { t: Pawn; p: Pawn } {
  const st = sim.st;
  const step = zombie ? calm : run;
  sim.step();
  const t = st.pawns.find((q) => q.kind === 'wedrowiec')!;
  expect(t).toBeDefined();
  step(sim, () => t.job?.phase === 1);
  const p = kto(st)[0];
  sim.push({ t: 'talk', ids: [p.id], target: t.id });
  step(sim, () => p.job?.t === 'talk' && p.job.phase === 1);
  step(sim, () => p.job?.t !== 'talk');
  expect(t.job?.what).toBe('zagadany');
  return { t, p };
}

describe('zaproszenie i pytanie o rękę są poleceniami do wznowienia', () => {
  it('lista poleceń do wznawiania ma zaproszenie i pytanie o rękę, a kronika ich opisy po polsku i po angielsku', () => {
    expect(POLECENIA_WZNAWIANE as readonly string[]).toContain('zapros');
    expect(POLECENIA_WZNAWIANE as readonly string[]).toContain('reka');
    const zapros = tekstPrzerwania({ imie: 'Ola', co: 'zapros' });
    const reka = tekstPrzerwania({ imie: 'Ola', co: 'reka' });
    expect(zapros.pl).toBe('Ola przerywa: zapraszanie wędrowca (szwendacze).');
    expect(zapros.en).toBe('Ola breaks off: inviting the wanderer (shamblers).');
    expect(reka.pl).toBe('Ola przerywa: pytanie wędrowca o rękę (szwendacze).');
    expect(reka.en).toBe('Ola breaks off: asking the wanderer to show their arm (shamblers).');
  });

  it('zaproszenie od gracza zapamiętuje polecenie z celem wędrowca, a skończona praca je kasuje', () => {
    const { sim } = gra(wM2, 3);
    const { t, p } = pozagadaniu(sim);
    expect(p.polecenie).toBeUndefined();
    sim.push({ t: 'zapros', ids: [p.id], target: t.id });
    run(sim, () => p.job?.t === 'zapros');
    expect(p.job?.t).toBe('zapros');
    expect(p.job?.order).toBe(true);
    expect(p.polecenie?.c).toEqual({ t: 'zapros', ids: [p.id], target: t.id });
    expect(p.polecenie?.n).toBe(1);
    expect(p.polecenie?.od).toBeUndefined();
    run(sim, () => p.job?.t !== 'zapros');
    expect(p.polecenie).toBeUndefined();
  });

  it('pytanie o rękę w trybie zombie też', () => {
    const { sim } = gra(wM2, 3, { mode: 'zombie' });
    const { t, p } = pozagadaniu(sim, true);
    sim.push({ t: 'reka', ids: [p.id], target: t.id });
    calm(sim, () => p.job?.t === 'zapros');
    expect(p.job?.what).toBe('reka');
    expect(p.polecenie?.c).toEqual({ t: 'reka', ids: [p.id], target: t.id });
    calm(sim, () => p.job?.t !== 'zapros');
    expect(p.polecenie).toBeUndefined();
  });

  it('przerwane zaproszenie wraca po walce tą samą drogą co od gracza, dopóki wędrowiec czeka przy siatce', () => {
    const { sim, st } = gra(wM2, 3);
    const { t, p } = pozagadaniu(sim);
    // polecenie przerwane przed chwilą (walka w trakcie dojścia do wędrowca); pionek bezczynny, nic nie grozi
    p.polecenie = { c: { t: 'zapros', ids: [p.id], target: t.id }, n: 1, od: st.tick - 10 };
    run(sim, () => p.job?.t === 'zapros', 400);
    expect(p.job?.t).toBe('zapros');
    expect(p.job?.target).toBe(t.id);
    expect(p.polecenie?.n).toBe(2);
    // gdy wędrowiec już poszedł, wznowienie nie daje pracy i polecenie znika bez śladu w kronice
    const { sim: sim2, st: st2 } = gra(wM2, 3);
    const g = pozagadaniu(sim2);
    g.p.polecenie = { c: { t: 'zapros', ids: [g.p.id], target: 99999 }, n: 1, od: st2.tick - 10 };
    run(sim2, () => !g.p.polecenie, 400);
    expect(g.p.polecenie).toBeUndefined();
    expect(g.p.job?.t).not.toBe('zapros');
    expect(st2.przerwane).toBeUndefined();
  });
});

/* ---------- polecenie na pracę, którą osoba już robi z automatu ---------- */

/** Przymorze, dzień 2, 9:00, samouczek skończony; pierwsza osoba ma tylko Szaber (priorytet 1), reszta na wyprawie */
function szaberPrzymorze() {
  const sim = newGame('przymorze', 'zwykly', 5);
  sim.step();
  skonczSamouczek(sim);
  const st = sim.st;
  st.tick = ((2 - 1) * 24 + 9 - 15) * TICKS_PER_HOUR;
  for (const q of st.pawns) if (q.kind === 'resident') q.away = true;
  const wszyscy = zarzadu(sim);
  const p = wszyscy[0];
  for (const q of wszyscy) {
    q.away = q !== p;
    q.needs!.food = 90;
    q.needs!.rest = 90;
    q.needs!.warm = 60;
  }
  prv(sim).koza()!.fuel = 3 * BURN_TICKS;
  for (const r of RODZAJE)
    if (r !== 'ogien') sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: r === 'szaber' ? 1 : 0 });
  sim.step();
  prv(sim).release(p);
  p.job = null;
  p.path = [];
  p.pi = 0;
  p.wait = st.tick;
  return { sim, p };
}

describe('polecenie gracza podnosi pracę z automatu i zostaje zapamiętane', () => {
  it('przeszukanie: polecenie na pokój, który osoba przeszukuje sama, trafia do pamięci polecenia', () => {
    const { sim, p } = szaberPrzymorze();
    prv(sim).think(p);
    expect(jaka(p)).toBe('search');
    const j = p.job!;
    expect(j.order).toBe(false);
    expect(p.polecenie).toBeUndefined();
    sim.push({ t: 'search', ids: [p.id], room: j.target });
    sim.step();
    // ta sama praca, ale z polecenia i zapamiętana jak każde polecenie
    expect(p.job).toBe(j);
    expect(j.order).toBe(true);
    expect(p.polecenie?.c).toEqual({ t: 'search', ids: [p.id], room: j.target });
    expect(p.polecenie?.n).toBe(1);
    // skończona praca kończy polecenie
    let k = 0;
    while (p.polecenie && k++ < 8000) sim.step();
    expect(p.polecenie).toBeUndefined();
  });
});

/* tryb zombie na atrapie bloku: szwendacz wchodzi w walkę z pionkiem rąbiącym drzewo za siatką */
const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pick<Pawn, 'x' | 'y'>) => Math.floor(p.y) * size + Math.floor(p.x);
const inside = (t: number) => yard.has(t) || w.interior.room[t] >= 0 || w.interior.doors.includes(t);
const gate = w.fence.gate;
const gx = gate.x + gate.w / 2;
const gy = gate.y + gate.h / 2;
/** drzewo za siatką najbliżej bramy, ale co najmniej 10 m od niej (nie krzak, korona od 2 m) */
const DRZEWO = (() => {
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    if (t.kind === 2 || t.r < 2 || inside(trunkTile(w, k))) return;
    const d = Math.hypot(t.x - gx, t.y - gy);
    if (d >= 10 && d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
})();

function scenaZombie() {
  const st = createSim(w, 3, { core: 1, mode: 'zombie' });
  st.tick = atHour(2, 10.1);
  const sim = new Sim(w, st);
  const swoje = new Set<number>();
  const zamiec = () => {
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie' || swoje.has(p.id));
  };
  zamiec();
  const a = st.pawns.find((p) => p.kind === 'core')!;
  a.weapon = 'lom';
  Object.assign(a.needs!, { food: 95, warm: 95, rest: 95 });
  const krok = (n = 1) => {
    for (let k = 0; k < n; k++) {
      sim.step();
      zamiec();
    }
  };
  const az = (warunek: () => boolean, limit: number) => {
    let n = 0;
    while (!warunek() && n < limit) {
      krok();
      n++;
    }
    return n;
  };
  const szwendacz = (p: Pawn, d = 5) => {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ]) {
      const tile = tileOf({ x: p.x + dx, y: p.y + dy });
      if (!sim.canWalk('zombie', tile) || inside(tile)) continue;
      const z = spawnZombie(st, w, tile, 3);
      z.job!.phase = 1;
      swoje.add(z.id);
      return z;
    }
    throw new Error('nie ma gdzie postawić szwendacza');
  };
  return { st, sim, a, krok, az, szwendacz };
}

describe('praca z automatu podniesiona do polecenia wraca po walce', () => {
  it('ścinanie za siatką: osoba z przełącznikiem rąbie sama, gracz przejmuje drzewo, walka go nie traci', () => {
    const s = scenaZombie();
    s.sim.push({ t: 'zasiatke', ids: [], osoba: s.a.person, on: true });
    s.krok();
    // praca z automatu (bez polecenia): rąbie drzewo za siatką
    expect(prv(s.sim).startChop(s.a, DRZEWO, false)).toBe(true);
    s.az(() => s.a.job?.t === 'chop' && s.a.job.phase === 1, 600);
    const j = s.a.job!;
    expect(j.t).toBe('chop');
    expect(j.order).toBe(false);
    expect(s.a.polecenie).toBeUndefined();
    // polecenie gracza na to samo drzewo: ta sama praca, ale z polecenia i w pamięci
    s.sim.push({ t: 'chop', ids: [s.a.id], tree: DRZEWO });
    s.krok();
    expect(s.a.job).toBe(j);
    expect(j.order).toBe(true);
    expect(s.a.polecenie?.c).toEqual({ t: 'chop', ids: [s.a.id], tree: DRZEWO });
    expect(s.a.polecenie?.n).toBe(1);
    // walka z szwendaczem przerywa pracę, a po wygranej pionek wraca do tego samego drzewa (pierwszeństwo przed automatem)
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'fight', 300);
    expect(s.a.job?.t).toBe('fight');
    expect(s.a.polecenie?.od).toBeDefined();
    s.sim.wound(z, 999);
    s.krok(3);
    expect(s.a.job).toMatchObject({ t: 'chop', target: DRZEWO, order: true });
    expect(s.a.polecenie?.n).toBe(2);
    // drzewo pada, a pionek ani razu nie schował się w siedzibie
    let weszla = false;
    s.az(() => {
      if (inside(tileOf(s.a))) weszla = true;
      return s.st.felled.includes(DRZEWO);
    }, 3000);
    expect(s.st.felled).toContain(DRZEWO);
    expect(weszla).toBe(false);
  });
});

describe('łańcuch noszenia drewna po ścięciu na polecenie za siatką', () => {
  /** drewno luzem poza siatką i podwórkiem */
  const drewnoPoza = (st: SimState): number =>
    st.things.filter((t) => t.kind === 'drewno' && !inside(t.y * size + t.x)).reduce((acc, t) => acc + t.n, 0);

  it('walka w drodze po kolejny stos z pustymi rękami nie kończy noszenia: pionek wraca do drewna z tego drzewa', () => {
    const s = scenaZombie();
    s.sim.push({ t: 'chop', ids: [s.a.id], tree: DRZEWO });
    s.az(() => s.st.felled.includes(DRZEWO), 4000);
    expect(s.st.felled).toContain(DRZEWO);
    // po pierwszym kursie wraca za bramę po następny stos: ręce puste, kurs z ścinania (j.from to pień)
    s.az(() => s.a.job?.t === 'haul' && s.a.job.phase === 0 && s.a.carry === 0 && inside(tileOf(s.a)), 3000);
    s.az(() => s.a.job?.t === 'haul' && s.a.job.phase === 0 && s.a.carry === 0 && !inside(tileOf(s.a)), 600);
    expect(s.a.job).toMatchObject({ t: 'haul', phase: 0, order: true });
    const pien = s.a.job!.from;
    expect(pien).toBeGreaterThanOrEqual(0);
    expect(s.a.carry).toBe(0);
    expect(drewnoPoza(s.st)).toBeGreaterThan(0);
    const z = s.szwendacz(s.a, 5);
    s.az(() => s.a.job?.t === 'fight', 100);
    expect(s.a.job?.t).toBe('fight');
    expect(s.a.polecenie?.od).toBeDefined();
    s.sim.wound(z, 999);
    s.krok(3);
    // dalej nosi drewno z tego drzewa (ten sam pień), a nie stoi godzinę przy pniu
    expect(s.a.job).toMatchObject({ t: 'haul', order: true, from: pien });
    expect(s.a.polecenie?.n).toBe(2);
    // całe drewno z drzewa trafia na podwórko, polecenie się kończy
    s.az(() => !s.a.job && drewnoPoza(s.st) === 0, 6000);
    expect(drewnoPoza(s.st)).toBe(0);
    expect(s.a.carry).toBe(0);
    expect(s.a.polecenie).toBeUndefined();
    expect(inside(tileOf(s.a))).toBe(true);
  });
});

/* ---------- automat a mapa miasta ---------- */

describe('automat pracy nie wysyła nikogo za bramę na wyprawę', () => {
  it('trzy doby z automatem w obu trybach: żadnej pracy leave i nikt na wyprawie, choć wszyscy mogą wychodzić za siatkę', () => {
    for (const tryb of ['zwykly', 'zombie'] as const) {
      const sim = newGame('przymorze', tryb, 5);
      sim.step();
      for (const p of zarzadu(sim)) sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
      const rodzaje = new Set<string>();
      for (let k = 0; k < 3 * TICKS_PER_DAY; k++) {
        sim.step();
        for (const p of sim.st.pawns) {
          if (p.kind !== 'core') continue;
          if (p.job) rodzaje.add(p.job.t);
          expect(p.away, `${tryb}, krok ${k}`).toBe(false);
        }
      }
      expect(rodzaje.has('leave')).toBe(false);
      // automat naprawdę pracował, więc brak wypraw nie wynika z bezczynności
      expect(rodzaje.size).toBeGreaterThan(4);
    }
  });
});
