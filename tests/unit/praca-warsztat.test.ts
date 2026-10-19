import { describe, expect, it, vi } from 'vitest';
import { BUILDS, canPlace } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { inHomeApt } from '../../src/sim/house.ts';
import { REPAIR, searchable } from '../../src/sim/mieszkania.ts';
import { fenceShape, type Hole } from '../../src/sim/perimeter.ts';
import { progi, RODZAJE, type RodzajPracy, ZAPAS_OPALU } from '../../src/sim/praca.ts';
import { gid, gidRoom, moznaPrzeszukac, wnetrze } from '../../src/sim/sasiedzi.ts';
import {
  BURN_TICKS,
  COOK_TICKS,
  CRAFT_TICKS,
  type Job,
  type JobKind,
  type Pawn,
  Sim,
  spawnZombie,
  type Thing,
} from '../../src/sim/sim.ts';
import { RECIPES, wreckStage, wrecksOf, wreckTile } from '../../src/sim/surowce.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import type { World } from '../../src/world/world.ts';
import { graZPlanem, zbudujPlot } from './praca-blok.ts';
import { przelacznik, skonczSamouczek } from './praca-pomoc.ts';
import { core, demoWorld, doorWhere, newGame, pusto, until, wszyscy } from './sasiedzi-pomoc.ts';

/** prywatne części Sim, po które sięgają sceny (kontrakt testowy, nie API gry) */
interface Prywatne {
  think(p: Pawn): void;
  work(p: Pawn, j: Job): boolean;
  koza(): Thing | undefined;
  addWood(tile: number, n: number): void;
  naszTeren(tile: number): boolean;
  mozeTam(p: Pawn, tile: number): boolean;
  zapasDrewna(): number;
  rezerwaZlomu(): number;
  naszeObszary(): Int32Array;
  startSearch(p: Pawn, room: number, order?: boolean): boolean;
  startLoot(p: Pawn, bid: number, room: number, order?: boolean): boolean;
  startCarry(p: Pawn, id: number, order?: boolean): boolean;
  lootNear(p: Pawn, anchor: number, order?: boolean): Thing | undefined;
  dojdzieWDomu(p: Pawn, tile: number): boolean;
  idz(p: Pawn, tile: number, order: boolean): boolean;
  materialOk(p: Pawn, order: boolean, t: JobKind): ((tile: number) => boolean) | undefined;
  furnitureAt(x: number, y: number): boolean;
  exitTile: number;
  roomTiles: number[][];
  tileOf(p: Pawn): number;
  release(p: Pawn): void;
  setJob(p: Pawn, j: Job, keepCarry: boolean): void;
  newJob(t: JobKind, target: number, tile: number, order: boolean, phase?: number): Job;
  regionOf(p: Pawn): number;
  dist2(p: Pawn, tile: number): number;
  rebuild(): void;
  startPlot(p: Pawn, order?: boolean): boolean;
  coreBlocked: Uint8Array;
  yardMask: Uint8Array;
  fenceMask: Uint8Array;
  reg: Int32Array;
  w: World;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

/** tick o godzinie `h` dnia `d` (gra zaczyna o 15:00 pierwszego dnia); zawsze wielokrotność 20 */
const tickO = (d: number, h: number): number => ((d - 1) * 24 + h - 15) * TICKS_PER_HOUR;

/** Konteksty, w których droga pracy bez polecenia ma zostać na naszym terenie (zombie za dnia, tryb zwykły nocą), i
    ten, w którym wolno iść ulicą między częściami naszego terenu (tryb zwykły za dnia). */
const ZOMBIE_DZIEN = { tryb: 'zombie', godzina: 9 } as const;
const NOC = { tryb: 'zwykly', godzina: 23 } as const;
const DZIEN = { tryb: 'zwykly', godzina: 9 } as const;

interface Opcje {
  tryb?: GameMode;
  /** gotowa gra zamiast nowej na Lanciego */
  sim?: Sim;
  key?: string;
  zaSiatke?: boolean;
  skills?: Record<string, number>;
  /** rodzaje (poza ogniem), które mają priorytet 1; reszta ma 0 */
  rodzaje?: RodzajPracy[];
  osoby?: number;
  dzien?: number;
  godzina?: number;
  samouczek?: boolean;
}
interface Scena {
  sim: Sim;
  p: Pawn;
  ludzie: Pawn[];
  s: Prywatne;
}

/** Gra po stu krokach wolniejsza od startu: badane osoby syte, wyspane i ciepłe, koza pali się na długo, rodzaje pracy
    ustawione poleceniami (jeden krok), brak pracy w toku, reszta zarządu i mieszkańcy poza drogą. */
function scena(o: Opcje = {}): Scena {
  const sim = o.sim ?? newGame(o.key ?? 'lanciego', o.tryb ?? 'zwykly', 5);
  sim.step();
  const st = sim.st;
  if (o.samouczek !== false) skonczSamouczek(sim);
  st.tick = tickO(o.dzien ?? 2, o.godzina ?? 9);
  for (const q of st.pawns) if (q.kind === 'resident') q.away = true;
  const wszystkie = core(sim);
  const ludzie = wszystkie.slice(0, o.osoby ?? 1);
  for (const q of wszystkie) {
    q.away = !ludzie.includes(q);
    q.needs!.food = 90;
    q.needs!.rest = 90;
    q.needs!.warm = 60;
  }
  const p = ludzie[0];
  st.people[p.person].skills = { ...o.skills };
  prv(sim).koza()!.fuel = 3 * BURN_TICKS;
  for (const q of ludzie) {
    for (const r of RODZAJE) {
      if (r === 'ogien') continue;
      sim.push({ t: 'prio', ids: [], osoba: q.person, rodzaj: r, prio: o.rodzaje?.includes(r) ? 1 : 0 });
    }
  }
  // przełącznik „za siatkę” jest domyślnie włączony w trybie zwykłym, a te sceny zakładają, że bez `zaSiatke: true`
  // nikt z zarządu (także na wyprawie) sam za siatkę nie wychodzi, więc ustawiany jest jawnie każdemu
  przelacznik(sim, wszystkie, (q) => ludzie.includes(q) && !!o.zaSiatke);
  sim.step();
  for (const q of ludzie) odnow(sim, q);
  return { sim, p, ludzie, s: prv(sim) };
}

/** zeruje pracę osoby przed kolejnym wywołaniem think() */
function odnow(sim: Sim, p: Pawn): void {
  prv(sim).release(p);
  p.job = null;
  p.path = [];
  p.pi = 0;
  p.carry = 0;
  p.wait = sim.st.tick;
}

/** syta, wyspana i ciepła (długie przebiegi, w których nie sprawdzamy potrzeb) */
function podkarm(sim: Sim): void {
  for (const q of core(sim)) Object.assign(q.needs!, { food: 90, rest: 90, warm: 60, health: 100 });
}

/** liczy rozpoczęte prace osoby według rodzaju (setJob podglądany przez spy; jedno wywołanie na grę); `cele` zbiera
    pary (rodzaj, cel, `what`) każdej rozpoczętej pracy */
function liczStarty(sim: Sim, p: Pawn | null) {
  const n: Partial<Record<JobKind, number>> = {};
  const cele: { t: JobKind; target: number; what: string; order: boolean }[] = [];
  const s = prv(sim);
  const org = s.setJob.bind(s);
  vi.spyOn(s, 'setJob').mockImplementation((pp, j, keep) => {
    if (!p || pp === p) {
      n[j.t] = (n[j.t] ?? 0) + 1;
      cele.push({ t: j.t, target: j.target, what: j.what, order: j.order });
    }
    org(pp, j, keep);
  });
  return { n, cele };
}

const jaka = (p: Pawn): string => p.job?.t ?? '-';

/** wolne kafelki na podwórku (bez składu, bez rzeczy), do których da się dojść, od najbliższych osobie */
function wolneNaPodworku(sim: Sim, p: Pawn, ile: number, wyklucz: Set<number> = new Set()): number[] {
  const s = prv(sim);
  const size = s.w.size;
  const region = s.regionOf(p);
  const sklad = new Set(sim.house?.sklad ?? []);
  const zajete = new Set(sim.st.things.map((t) => t.y * size + t.x));
  const cand: number[] = [];
  for (let i = 0; i < size * size; i++)
    if (
      s.yardMask[i] === 1 &&
      s.fenceMask[i] !== 1 &&
      !s.coreBlocked[i] &&
      s.reg[i] === region &&
      !sklad.has(i) &&
      !zajete.has(i) &&
      !wyklucz.has(i) &&
      (sim.house?.room[i] ?? -1) < 0 // poza siedzibą: sterty leżą na podwórku
    )
      cand.push(i);
  cand.sort((a, b) => s.dist2(p, a) - s.dist2(p, b) || a - b);
  return cand.slice(0, ile);
}

/** sterta materiału na kafelku (jak łup) */
function dodaj(sim: Sim, kind: string, n: number, tile: number): Thing {
  const size = sim.w.size;
  const t: Thing = {
    id: sim.st.nextThing++,
    kind,
    x: tile % size,
    y: Math.floor(tile / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  sim.st.things.push(t);
  return t;
}

/** `n` sztuk materiału na podwórku w stertach po 10 */
function dodajMat(sim: Sim, p: Pawn, kind: string, n: number): void {
  const kafle = wolneNaPodworku(sim, p, Math.ceil(n / 10));
  for (let left = n, k = 0; left > 0; left -= 10, k++) dodaj(sim, kind, Math.min(10, left), kafle[k]);
}

const suma = (sim: Sim, kind: string): number =>
  sim.st.things.filter((t) => t.kind === kind).reduce((a, t) => a + t.n, 0);

/** warsztat (2×1) na podwórku, z wolnym miejscem obok do stania */
function postawWarsztat(sim: Sim, p: Pawn): Thing {
  const size = sim.w.size;
  const kafle = wolneNaPodworku(sim, p, 400);
  const i = kafle.find((k) => kafle.includes(k + 1) && kafle.includes(k - 1) && kafle.includes(k + 2))!;
  expect(i, 'miejsce na warsztat').toBeDefined();
  const t: Thing = {
    id: sim.st.nextThing++,
    kind: 'warsztat',
    x: i % size,
    y: Math.floor(i / size),
    w: 2,
    h: 1,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  sim.st.things.push(t);
  return t;
}

/** Sztuki drewna do ustawienia zapasu (`zapasDrewna`) na dokładną liczbę: najpierw skład (po 10 na kafelek), reszta
    stertami na podwórku. Pełny skład sprawia, że ogień nie nosi tych stert do składu (nie ma dokąd). */
function ustawZapas(sim: Sim, p: Pawn, ile: number): void {
  const s = prv(sim);
  let zostalo = ile - s.zapasDrewna();
  for (const i of sim.house!.sklad) {
    if (zostalo <= 0) break;
    const n = Math.min(10, zostalo);
    s.addWood(i, n);
    zostalo -= n;
  }
  for (const i of wolneNaPodworku(sim, p, Math.ceil(Math.max(0, zostalo) / 10))) {
    const n = Math.min(10, zostalo);
    if (n <= 0) break;
    s.addWood(i, n);
    zostalo -= n;
  }
  expect(s.zapasDrewna()).toBe(ile);
}

/** Scena z warsztatem na podwórku, bez desek, złomu i części na mapie (test ustawia dokładne zapasy), z załatanymi
    dziurami w siatce (rezerwa złomu na łaty zero) i bez szwendaczy. */
function zWarsztatem(o: Opcje = {}) {
  const sc = scena({ rodzaje: ['warsztat'], ...o });
  const { sim, p } = sc;
  const st = sim.st;
  st.things = st.things.filter((t) => !['deski', 'zlom', 'czesci'].includes(t.kind));
  st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
  for (const h of st.fence?.holes ?? []) h.patch = 100;
  prv(sim).rebuild();
  const warsztat = postawWarsztat(sim, p);
  return { ...sc, s: prv(sim), st, warsztat };
}

describe('warsztat', () => {
  it('warsztat robi deski do progu tylko z nadwyżki drewna ponad próg', () => {
    // próg drewna 30, desek 20: nadwyżka musi mieć co najmniej RECIPES.deski.n (2) sztuk, a desek ma być mniej niż 20
    for (const [zapas, deski, saw] of [
      [30, 5, false],
      [31, 5, false],
      [32, 5, true],
      [40, 5, true],
      [40, 20, false],
      [40, 19, true],
    ] as const) {
      const { sim, p, s } = zWarsztatem();
      expect(progi(sim.st)).toMatchObject({ drewno: 30, deski: 20 });
      if (deski) dodajMat(sim, p, 'deski', deski);
      ustawZapas(sim, p, zapas);
      s.think(p);
      expect(jaka(p), `zapas ${zapas}, deski ${deski}`).toBe(saw ? 'saw' : '-');
      if (saw) {
        expect(p.job!.what).toBe('deski');
        expect(p.job!.order).toBe(false);
        // po jednej sztuce na pracę
        expect(p.job!.from).toBe(1);
      }
    }
  });

  it('praca kończy się jedną deską z dwóch sztuk drewna i na progu desek już nie rusza', () => {
    const { sim, p } = zWarsztatem();
    dodajMat(sim, p, 'deski', 19);
    ustawZapas(sim, p, 40);
    const drewno = suma(sim, 'drewno');
    const { n } = liczStarty(sim, p);
    until(sim, () => (n.saw ?? 0) > 0 && p.job?.t !== 'saw', 3000);
    expect(suma(sim, 'deski')).toBe(20);
    expect(suma(sim, 'drewno')).toBe(drewno - RECIPES.deski.n);
    // 20 desek to próg: dalej nic, choć drewna jest ponad próg
    for (let k = 0; k < 600; k++) {
      podkarm(sim);
      sim.step();
    }
    expect(n.saw).toBe(1);
    expect(suma(sim, 'deski')).toBe(20);
  });

  it('próg zero i próg drewna wyłączają i wstrzymują deski; drewno na ulicy nie jest nadwyżką', () => {
    const wyniki: string[] = [];
    // próg desek 0: wyłączone
    let sc = zWarsztatem();
    ustawZapas(sc.sim, sc.p, 45);
    sc.sim.push({ t: 'prog', ids: [], co: 'deski', n: 0 });
    sc.sim.step();
    odnow(sc.sim, sc.p);
    sc.s.think(sc.p);
    wyniki.push(`deski 0: ${jaka(sc.p)}`);
    // próg drewna 44: zapas 45 daje tylko jedną sztukę nadwyżki
    sc = zWarsztatem();
    ustawZapas(sc.sim, sc.p, 45);
    sc.sim.push({ t: 'prog', ids: [], co: 'drewno', n: 44 });
    sc.sim.step();
    odnow(sc.sim, sc.p);
    sc.s.think(sc.p);
    wyniki.push(`drewno 44: ${jaka(sc.p)}`);
    // zapas 31 w obrębie siatki, a na ulicy dziesięć sztuk więcej: pasek u góry pokazałby 41, ale nadwyżki nie ma
    sc = zWarsztatem();
    ustawZapas(sc.sim, sc.p, 31);
    const s = prv(sc.sim);
    const ulica = [...Array(s.w.size * s.w.size).keys()].find(
      (i) => !s.coreBlocked[i] && s.reg[i] === s.regionOf(sc.p) && !s.naszTeren(i),
    )!;
    dodaj(sc.sim, 'drewno', 10, ulica);
    s.think(sc.p);
    wyniki.push(`ulica: ${jaka(sc.p)}`);
    expect(wyniki).toEqual(['deski 0: -', 'drewno 44: -', 'ulica: -']);
  });

  it('bez postawionego warsztatu nic nie robi', () => {
    const { sim, p, s, st } = zWarsztatem();
    st.things = st.things.filter((t) => t.kind !== 'warsztat');
    dodajMat(sim, p, 'deski', 2);
    dodajMat(sim, p, 'zlom', 20);
    ustawZapas(sim, p, 45);
    s.think(p);
    expect(jaka(p)).toBe('-');
  });

  it('tylko jedna osoba przy warsztacie, druga bierze inne zlecenie albo nic', () => {
    const { sim, ludzie, s } = zWarsztatem({ osoby: 2 });
    const [a, b] = ludzie;
    b.x = a.x;
    b.y = a.y;
    dodajMat(sim, a, 'deski', 3);
    ustawZapas(sim, a, 45);
    s.think(a);
    s.think(b);
    expect(jaka(a)).toBe('saw');
    expect(jaka(b)).toBe('-');
  });

  it('części ze złomu nie zjadają rezerwy na łaty i plany', () => {
    const rezerwa = (sim: Sim) => prv(sim).rezerwaZlomu();
    // bez dziur i planów: rezerwa zero
    const pusta = zWarsztatem();
    expect(rezerwa(pusta.sim)).toBe(0);
    // rezerwa 9: brak złomu planu (5 − 2 = 3) plus PATCH_COST (3) za każdą z dwóch otwartych dziur
    const przygotuj = (zlom: number, czesci: number) => {
      const sc = zWarsztatem();
      const { sim, p, st } = sc;
      const dziury: Hole[] = st.fence!.holes;
      expect(dziury.length).toBeGreaterThanOrEqual(3);
      dziury.forEach((h, k) => {
        h.patch = k < 2 ? 0 : 100;
      });
      sc.s.rebuild();
      const [miejsce] = wolneNaPodworku(sim, p, 1);
      st.builds.push({
        id: st.nextThing++,
        kind: 'kuchnia_spoleczna',
        x: miejsce % sim.w.size,
        y: Math.floor(miejsce / sim.w.size),
        rot: 0,
        need: { zlom: 14, czesci: 10 },
        have: { zlom: 11 },
        work: 0,
        by: -1,
      });
      expect(rezerwa(sim)).toBe(9);
      if (zlom) dodajMat(sim, p, 'zlom', zlom);
      if (czesci) dodajMat(sim, p, 'czesci', czesci);
      return sc;
    };
    for (const [zlom, czesci, saw] of [
      [9, 0, false],
      [10, 0, false],
      [11, 0, true],
      [40, 10, false],
      [40, 9, true],
    ] as const) {
      const { p, s } = przygotuj(zlom, czesci);
      s.think(p);
      expect(jaka(p), `złom ${zlom}, części ${czesci}`).toBe(saw ? 'saw' : '-');
      if (saw) {
        expect(p.job!.what).toBe('czesci');
        expect(p.job!.order).toBe(false);
        expect(p.job!.from).toBe(1);
      }
    }
    // dziur nie ma, plan nie czeka: cały złom ponad dwie sztuki idzie na części
    const wolny = zWarsztatem();
    dodajMat(wolny.sim, wolny.p, 'zlom', 2);
    wolny.s.think(wolny.p);
    expect(jaka(wolny.p)).toBe('saw');
  });

  it('dzida tylko dla nieuzbrojonych ponad dzidy w magazynie; w zwykłym trybie domyślnie wcale', () => {
    const bezBroni = (sim: Sim) => {
      for (const q of core(sim)) q.weapon = null;
      sim.st.store.arms = [];
    };
    const sprawdz = (tryb: GameMode, ustaw: (sim: Sim) => void) => {
      const sc = zWarsztatem({ tryb });
      const { sim, p, s } = sc;
      dodajMat(sim, p, 'deski', 2);
      dodajMat(sim, p, 'zlom', 1);
      bezBroni(sim);
      ustaw(sim);
      s.think(p);
      return sc;
    };
    // zombie: próg dzid 12, czterech nieuzbrojonych, magazyn pusty: dzida
    const z = sprawdz('zombie', () => {});
    expect(progi(z.sim.st).dzidy).toBe(12);
    expect(jaka(z.p)).toBe('craft');
    expect(z.p.job!.order).toBe(false);
    // dzid w magazynie tyle, ilu nieuzbrojonych: nic
    expect(jaka(sprawdz('zombie', (sim) => (sim.st.store.arms = ['dzida', 'dzida', 'dzida', 'dzida'])).p)).toBe('-');
    // jednego brakuje: dzida
    expect(jaka(sprawdz('zombie', (sim) => (sim.st.store.arms = ['dzida', 'dzida', 'dzida'])).p)).toBe('craft');
    // inna broń w magazynie nie jest dzidą
    expect(jaka(sprawdz('zombie', (sim) => (sim.st.store.arms = ['noz', 'lom'])).p)).toBe('craft');
    // wszyscy uzbrojeni: nic
    expect(
      jaka(
        sprawdz('zombie', (sim) => {
          for (const q of core(sim)) q.weapon = 'noz';
        }).p,
      ),
    ).toBe('-');
    // próg dzid osiągnięty, choć nieuzbrojonych więcej: nic
    const prog = sprawdz('zombie', (sim) => {
      sim.push({ t: 'prog', ids: [], co: 'dzidy', n: 3 });
      sim.step();
      sim.st.store.arms = ['dzida', 'dzida', 'dzida'];
      odnow(sim, core(sim)[0]);
    });
    expect(jaka(prog.p)).toBe('-');
    // zwykły tryb: próg 0, więc wcale; po ustawieniu progu 2 dzida jest
    const zwykly = sprawdz('zwykly', () => {});
    expect(progi(zwykly.sim.st).dzidy).toBe(0);
    expect(jaka(zwykly.p)).toBe('-');
    const ustawiony = sprawdz('zwykly', (sim) => {
      sim.push({ t: 'prog', ids: [], co: 'dzidy', n: 2 });
      sim.step();
      odnow(sim, core(sim)[0]);
    });
    expect(jaka(ustawiony.p)).toBe('craft');
  });

  it('bez postawionego warsztatu nie ma też dzidy (próg dzid w trybie zombie, materiał jest)', () => {
    const { sim, p, s, st } = zWarsztatem({ tryb: 'zombie' });
    for (const q of core(sim)) q.weapon = null;
    st.store.arms = [];
    dodajMat(sim, p, 'deski', 2);
    dodajMat(sim, p, 'zlom', 1);
    s.think(p);
    expect(jaka(p)).toBe('craft');
    st.things = st.things.filter((t) => t.kind !== 'warsztat');
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('-');
  });

  /* Przegląd końcowy: próg drewna 0 wyłącza Drwala, ale nie oddaje opału na deski. Deski z drewna są tylko z nadwyżki
     ponad max(próg drewna, ZAPAS_OPALU), a drewno z ulicy nie jest zapasem. */
  it('próg drewna 0 nie oddaje opału na deski: nadwyżka liczy się ponad ZAPAS_OPALU, drewno z ulicy się nie liczy', () => {
    expect(ZAPAS_OPALU).toBe(20);
    const { sim, p, s } = zWarsztatem();
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 0 });
    sim.step();
    odnow(sim, p);
    const ulica = [...Array(s.w.size * s.w.size).keys()].find(
      (i) => !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && !s.naszTeren(i),
    )!;
    dodaj(sim, 'drewno', 10, ulica);
    expect(s.zapasDrewna()).toBe(3);
    s.think(p);
    expect(jaka(p)).toBe('-');
    // drewno w składzie i na podwórku do zapasu opału: przy progu 0 dawniej szło na deski, teraz nie
    s.addWood(sim.house!.sklad[0], 4);
    s.think(p);
    expect(jaka(p), 'zapas 7').toBe('-');
    ustawZapas(sim, p, ZAPAS_OPALU + RECIPES.deski.n - 1);
    s.think(p);
    expect(jaka(p), `zapas ${ZAPAS_OPALU + RECIPES.deski.n - 1}`).toBe('-');
    // nadwyżka ponad zapas opału na jedną deskę: deska jest
    ustawZapas(sim, p, ZAPAS_OPALU + RECIPES.deski.n);
    s.think(p);
    expect(jaka(p), `zapas ${ZAPAS_OPALU + RECIPES.deski.n}`).toBe('saw');
    // próg drewna ponad zapas opału liczy się jak dotąd (próg 30: domyślne przypadki w teście wyżej)
  });

  it('deski i części na ulicy nie liczą się do zapasu (zapas to nasz teren)', () => {
    const { sim, p, s } = zWarsztatem();
    ustawZapas(sim, p, 40);
    const ulica = [...Array(s.w.size * s.w.size).keys()].find(
      (i) => !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && !s.naszTeren(i),
    )!;
    // 25 desek leży na ulicy: na podwórku desek nie ma, więc robi
    dodaj(sim, 'deski', 25, ulica);
    s.think(p);
    expect(jaka(p)).toBe('saw');
    expect(p.job!.what).toBe('deski');
  });

  it('prace w toku liczą się do progu: drugi warsztat nie robi deski ponad próg', () => {
    const { sim, ludzie, s } = zWarsztatem({ osoby: 2 });
    const [a, b] = ludzie;
    postawWarsztat(sim, a);
    b.x = a.x;
    b.y = a.y;
    // 19 desek przy progu 20 i bardzo dużo drewna: jedna deska do progu, więc tylko jedna praca
    dodajMat(sim, a, 'deski', 19);
    ustawZapas(sim, a, 60);
    s.think(a);
    s.think(b);
    expect(jaka(a)).toBe('saw');
    expect(jaka(b)).toBe('-');
  });

  it('dzida bez materiału albo już w robocie u kogoś innego nie powstaje; gotowa trafia do magazynu', () => {
    const { sim, ludzie, s, st } = zWarsztatem({ tryb: 'zombie', osoby: 2 });
    const [a, b] = ludzie;
    // deski i części wyłączone, żeby zostały same dzidy
    for (const co of ['deski', 'czesci'] as const) sim.push({ t: 'prog', ids: [], co, n: 0 });
    sim.step();
    odnow(sim, a);
    odnow(sim, b);
    for (const q of core(sim)) q.weapon = null;
    st.store.arms = [];
    b.x = a.x;
    b.y = a.y;
    // za mało złomu: nic (deski w dwóch stertach, bo sterta desek jest zajęta przez tego, kto robi z niej dzidę)
    dodajMat(sim, a, 'deski', 2);
    dodajMat(sim, a, 'deski', 2);
    s.think(a);
    expect(jaka(a)).toBe('-');
    dodajMat(sim, a, 'zlom', 2);
    // reszta zarządu na wyprawie: nieuzbrojonych dwóch (a i b), więc dwie dzidy, ale jedna w robocie liczy się jak w magazynie
    for (const q of core(sim)) q.weapon = q === a || q === b ? null : 'noz';
    odnow(sim, a);
    odnow(sim, b);
    s.think(a);
    expect(jaka(a)).toBe('craft');
    s.think(b);
    expect(jaka(b), 'druga dzida dla drugiego nieuzbrojonego').toBe('craft');
    s.release(b);
    b.job = null;
    // jedyny nieuzbrojony ma już dzidę w robocie: druga niepotrzebna
    b.weapon = 'noz';
    odnow(sim, b);
    s.think(b);
    expect(jaka(b)).toBe('-');
    const zlom = suma(sim, 'zlom');
    const deski = suma(sim, 'deski');
    until(sim, () => st.store.arms!.includes('dzida'), CRAFT_TICKS + 3000);
    expect(st.store.arms).toContain('dzida');
    expect(suma(sim, 'zlom')).toBe(zlom - 1);
    expect(suma(sim, 'deski')).toBe(deski - 2);
  });

  it('gotowa dzida zużywa materiał z podwórka, a nie z ulicy, choć sterta z ulicy ma niższy numer', () => {
    const { sim, p, s, st } = zWarsztatem({ tryb: 'zombie' });
    for (const q of core(sim)) q.weapon = null;
    st.store.arms = [];
    const ulica = [...Array(s.w.size * s.w.size).keys()].find(
      (i) => !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && !s.naszTeren(i),
    )!;
    const zUlicy = dodaj(sim, 'zlom', 6, ulica);
    dodaj(sim, 'deski', 6, ulica + 1);
    dodajMat(sim, p, 'deski', 2);
    dodajMat(sim, p, 'zlom', 1);
    s.think(p);
    expect(jaka(p)).toBe('craft');
    until(sim, () => st.store.arms!.includes('dzida'), CRAFT_TICKS + 3000);
    expect(st.store.arms).toContain('dzida');
    // z ulicy nic nie ubyło
    expect(zUlicy.n).toBe(6);
    expect(sim.st.things.filter((t) => t.kind === 'zlom' && t.id === zUlicy.id)).toHaveLength(1);
    expect(sim.st.things.filter((t) => t.kind === 'deski' && !s.naszTeren(t.y * s.w.size + t.x))).toHaveLength(1);
    expect(sim.st.things.filter((t) => t.kind === 'deski' && !s.naszTeren(t.y * s.w.size + t.x))[0].n).toBe(6);
  });

  it('dzida, deski i części robią się tylko z materiału na naszym terenie, nie z ulicy (także z przełącznikiem)', () => {
    for (const zaSiatke of [false, true]) {
      const { sim, p, s } = zWarsztatem({ tryb: 'zombie', zaSiatke });
      for (const q of core(sim)) q.weapon = null;
      sim.st.store.arms = [];
      const ulica = [...Array(s.w.size * s.w.size).keys()].find(
        (i) => !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && !s.naszTeren(i),
      )!;
      dodaj(sim, 'deski', 6, ulica);
      dodaj(sim, 'zlom', 6, ulica + 1);
      s.think(p);
      expect(jaka(p), `przełącznik ${zaSiatke}`).toBe('-');
    }
  });
});

describe('tempo z umiejętności: warsztat, dzida, gotowanie', () => {
  it('deska z polecenia: czas pracy dzielony przez 1 + 0,1 · wyższa z elek i it (elek 2 daje 1,2)', () => {
    for (const [dzien, godzina, mnoznik] of [
      [2, 9, 1.2],
      [1, 16, 1],
    ] as const) {
      const { sim, p } = zWarsztatem({ rodzaje: [], skills: { elek: 2, it: 1 }, dzien, godzina });
      ustawZapas(sim, p, 40);
      sim.push({ t: 'saw', ids: [p.id], what: 'deski', n: 1 });
      until(sim, () => p.job?.t === 'saw' && p.job.phase === 1, 3000);
      expect(p.job?.phase, `dzień ${dzien}`).toBe(1);
      // pierwszy dzień: czas bez zaokrąglenia, jak przed pracą ludzi (do dokładności odejmowania liczb zmiennoprzecinkowych)
      expect(p.job!.until - p.job!.t0, `dzień ${dzien}`).toBeCloseTo(
        mnoznik === 1 ? RECIPES.deski.work : Math.round(RECIPES.deski.work / mnoznik),
        6,
      );
    }
  });

  it('dzida z polecenia: CRAFT_TICKS dzielone przez tempo (it 4 daje 1,4)', () => {
    const { sim, p } = zWarsztatem({ rodzaje: [], skills: { it: 4 } });
    dodajMat(sim, p, 'deski', 2);
    dodajMat(sim, p, 'zlom', 1);
    sim.push({ t: 'craft', ids: [p.id], item: 'dzida' });
    until(sim, () => p.job?.t === 'craft' && p.job.phase === 1, 3000);
    expect(p.job?.phase).toBe(1);
    expect(p.job!.until - sim.st.tick).toBeLessThanOrEqual(Math.round(CRAFT_TICKS / 1.4));
    expect(p.job!.until - sim.st.tick).toBeGreaterThan(Math.round(CRAFT_TICKS / 1.4) - 2);
  });

  it('gotowanie dzieli czas przez tempo z uprawy (uprawa 4 daje 1,4), przed pierwszym rankiem w COOK_TICKS', () => {
    for (const [dzien, godzina, mnoznik] of [
      [2, 9, 1.4],
      [1, 16, 1],
    ] as const) {
      const { sim, p } = scena({ rodzaje: [], skills: { uprawa: 4 }, dzien, godzina });
      sim.push({ t: 'cook', ids: [p.id] });
      until(sim, () => p.job?.t === 'cook' && p.job.phase === 1, 3000);
      expect(p.job?.phase, `dzień ${dzien}`).toBe(1);
      expect(p.job!.until - p.job!.t0, `dzień ${dzien}`).toBe(
        mnoznik === 1 ? COOK_TICKS : Math.round(COOK_TICKS / mnoznik),
      );
    }
  });
});

/** plan ogródka na podwórku z kompletem materiałów (jak plan z menu budowy) */
function planOgrodka(sim: Sim) {
  const s = prv(sim);
  const w = s.w;
  const kafle = fenceShape(w)?.yard ?? [];
  for (const i of kafle)
    if (canPlace(sim.st, w, 'ogrodek', i % w.size, Math.floor(i / w.size), 0).ok) {
      sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: i % w.size, y: Math.floor(i / w.size), rot: 0 });
      sim.step();
      const plan = sim.st.builds[sim.st.builds.length - 1];
      plan.have = { ...BUILDS.ogrodek.cost };
      return plan;
    }
  throw new Error('brak miejsca na ogródek');
}

describe('budowa: tempo', () => {
  it('budowa z bud 3 idzie 1,3 raza szybciej, bez umiejętności i przed pierwszym rankiem w BUILDS.work', () => {
    const czas = (skills: Record<string, number>, dzien = 2, godzina = 9) => {
      const { sim, p } = scena({ rodzaje: ['budowa'], skills, dzien, godzina });
      const plan = planOgrodka(sim);
      odnow(sim, p);
      let robota = 0;
      for (let k = 0; k < 4000 && sim.st.builds.includes(plan); k++) {
        sim.step();
        if (plan.work > 0) robota++;
      }
      expect(sim.st.builds.includes(plan)).toBe(false);
      return robota;
    };
    const praca = BUILDS.ogrodek.work;
    const bez = czas({});
    expect(bez).toBe(praca);
    const bud3 = czas({ bud: 3 });
    expect(bud3).toBe(Math.ceil(praca / 1.3));
    expect(bez / bud3).toBeCloseTo(1.3, 1);
    // pierwszy dzień gry bez zmian także u fachowca
    expect(czas({ bud: 3 }, 1, 16)).toBe(praca);
  });

  it('plan płotu też dodaje tempo do pracy (bud 3: 1,3 na tick)', () => {
    const { sim, p, st } = zWarsztatem({ rodzaje: ['budowa'], skills: { bud: 3 } });
    const s = prv(sim);
    const [stand] = wolneNaPodworku(sim, p, 1);
    st.plot = {
      bids: [],
      plan: {
        bid: 0,
        need: { zlom: 4 },
        have: { zlom: 4 },
        work: 0,
        total: 100000,
        by: -1,
        stand,
        wariant: 'mieszany',
      },
    };
    expect(s.startPlot(p, false)).toBe(true);
    p.x = (stand % s.w.size) + 0.5;
    p.y = Math.floor(stand / s.w.size) + 0.5;
    for (let k = 0; k < 100; k++) expect(s.work(p, p.job!)).toBe(true);
    expect(st.plot.plan!.work).toBeCloseTo(130, 6);
  });
});

/** wszystkie pomieszczenia siedziby przeszukane, żeby Szaber nie miał tam roboty (zostają cudze budynki i wraki) */
function bezPokoi(sc: Pick<Scena, 'sim' | 'p'>): void {
  const { sim } = sc;
  for (const g of sim.st.apts) g.searched = sim.house!.rooms.filter((r) => r.apt === g.apt).map((r) => r.id);
  odnow(sim, sc.p);
}

/** blok Lanciego otwarty przez osobę (drzwi odblokowane), z lokatorami albo pustymi mieszkaniami, z szabrem */
function zBlokiem(o: {
  lokatorzy: 'pusto' | 'wszyscy';
  otoczony: boolean;
  zaSiatke?: boolean;
  godzina?: number;
  tryb?: GameMode;
}) {
  const w = demoWorld('lanciego');
  const { bid, door } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k, ['blok']);
  const sim = newGame('lanciego', o.tryb ?? 'zwykly');
  sim.lokatorzy = o.lokatorzy === 'pusto' ? pusto(w) : wszyscy(w, ['lubiany']);
  const sc = scena({ sim, rodzaje: [], godzina: o.godzina ?? 9, zaSiatke: o.zaSiatke });
  const { p } = sc;
  sim.push({ t: 'open', ids: [p.id], door });
  sim.step();
  until(sim, () => p.job?.t !== 'door' && p.job?.t !== 'go', 4000);
  const k = sim.st.sasiedzi!.budynki.findIndex((b) => b.bid === bid);
  const b = sim.st.sasiedzi!.budynki[k];
  expect(b.otwarty).toBe(true);
  podkarm(sim);
  bezPokoi({ sim, p });
  if (o.otoczony) sim.st.plot = { bids: [bid] };
  // szaber włączony dopiero teraz; reszta rodzajów zostaje wyłączona
  sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'szaber', prio: 1 });
  sim.step();
  odnow(sim, p);
  return { sim, p, s: prv(sim), w, bid, k, b };
}

/** numery pomieszczeń budynku (lokalne), do których osoba dojdzie bez wychodzenia z naszego terenu: mają posadzkę w jej
    spójnym obszarze */
function dostepnePokoje(sim: Sim, p: Pawn, k: number): number[] {
  const s = prv(sim);
  const obszary = s.naszeObszary();
  const od = obszary[s.tileOf(p)];
  const pokoje: number[] = [];
  if (od < 0) return pokoje;
  for (let room = 0; room < 400; room++)
    if (sim.kafelkiPokoju(gid(k, room)).some((i) => obszary[i] === od)) pokoje.push(room);
  return pokoje;
}

/** Świat ze zbudowanym wspólnym płotem wokół Bloku nr 10F (Lanciego, puste mieszkania): budynek jest już nasz, korytarz
    łączy go z podwórkiem. Gra stoi na dniu 2, 9:00, pierwsza osoba ma tylko Szaber (priorytet 1), reszta zarządu jest na
    wyprawie, pomieszczenia siedziby przeszukane, więc zostaje sam blok. */
function blokOtoczony() {
  const g = graZPlanem(true);
  const { sim, p, b, w } = g;
  zbudujPlot(g);
  expect(sim.st.plot?.bids).toContain(b.id);
  skonczSamouczek(sim);
  sim.st.tick = tickO(2, 9);
  for (const q of core(sim)) q.away = q !== p;
  for (const r of RODZAJE)
    if (r !== 'ogien') sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: r === 'szaber' ? 1 : 0 });
  sim.step();
  podkarm(sim);
  bezPokoi({ sim, p });
  const k = sim.st.sasiedzi!.budynki.findIndex((x) => x.bid === b.id);
  return { sim, p, s: prv(sim), w, bid: b.id, k, b: sim.st.sasiedzi!.budynki[k] };
}

describe('polecenie na przeszukanie, które osoba już robi sama', () => {
  it('przeszukanie: polecenie gracza na pokój, który osoba przeszukuje z automatu, robi z tego pracę z polecenia', () => {
    const { sim, p, s } = scena({ key: 'przymorze', rodzaje: ['szaber'] });
    s.think(p);
    expect(jaka(p)).toBe('search');
    const j = p.job!;
    expect(j.order).toBe(false);
    sim.push({ t: 'search', ids: [p.id], room: j.target });
    sim.step();
    expect(p.job).toBe(j);
    expect(j.order).toBe(true);
    // drugi z zarządu dalej nie dostaje pokoju, który ktoś już przeszukuje
    expect(s.startSearch(core(sim)[1], j.target, true)).toBe(false);
  });
});

describe('szaber', () => {
  it('szaber przeszukuje puste pomieszczenie w otoczonym budynku, nigdy mieszkania z lokatorami ani cudzych drzwi', () => {
    // otoczony budynek bez lokatorów, bez przełącznika: przeszukuje, praca bez polecenia
    const a = blokOtoczony();
    const drzwiPrzed = a.b.drzwi.map((d) => d.s);
    const dostepne = dostepnePokoje(a.sim, a.p, a.k);
    // blok ma 30 pomieszczeń, ale osiągalne bez ulicy tylko te z pierwszej klatki (dwa mieszkania i klatka)
    expect(dostepne.length).toBeGreaterThanOrEqual(8);
    expect(dostepne.length).toBeLessThan(15);
    const { n, cele } = liczStarty(a.sim, a.p);
    a.s.think(a.p);
    expect(jaka(a.p)).toBe('loot');
    expect(a.p.job?.order).toBe(false);
    const przeszukanePokoje = () =>
      a.b.przeszukane.length + a.b.mieszkania.reduce((x, m) => x + m.przeszukane.length, 0);
    // przeszukanie i noszenie łupu każdego pokoju trwa kilkaset sekund gry, a noc przerywa pracę
    let krok = 0;
    while (przeszukanePokoje() < dostepne.length && krok++ < 60000) {
      if (krok % 100 === 0) podkarm(a.sim);
      a.sim.step();
    }
    // wszystkie osiągalne pomieszczenia przeszukane, żadne inne
    expect(przeszukanePokoje()).toBe(dostepne.length);
    expect(n.door ?? 0).toBe(0);
    expect(a.b.drzwi.map((d) => d.s)).toEqual(drzwiPrzed);
    const lupy = cele.filter((x) => x.t === 'loot');
    // każde pomieszczenie raz (praca przerwana nocą zaczyna się od nowa, więc startów bywa więcej)
    expect(new Set(lupy.map((x) => x.target)).size).toBe(dostepne.length);
    expect(lupy.every((x) => !x.order)).toBe(true);
    for (const x of lupy) expect(dostepne, `pokój ${gidRoom(x.target)}`).toContain(gidRoom(x.target));
    // łup z przeszukania trafił na podwórko (praca bez polecenia przeszła w noszenie)
    expect(a.sim.st.things.some((t) => ['deski', 'zlom', 'czesci', 'jedzenie', 'leki'].includes(t.kind))).toBe(true);
    for (const m of a.b.mieszkania) expect(m.stan).toBe('puste');
  });

  /** Przymorze: osoba z Szabrem, pokoje siedziby osiągalne bez ulicy już przeszukane (zostają pokoje z drugich klatek
      bloku, dojście tylko ulicą); w trybie zombie bez szwendaczy. */
  function zostajaDrugieKlatki(o: Opcje) {
    const sc = scena({ key: 'przymorze', rodzaje: ['szaber'], ...o });
    const { sim, p, s } = sc;
    const st = sim.st;
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    const obszary = s.naszeObszary();
    const od = obszary[s.tileOf(p)];
    expect(od).toBeGreaterThanOrEqual(0);
    const puste = sim.house!.rooms.filter((r) => {
      const g = st.apts.find((x) => x.apt === r.apt);
      return !!g && searchable(s.w, g);
    });
    const wDomu = puste.filter((r) => obszary[s.roomTiles[r.id][0]] === od);
    const daleko = puste.filter(
      (r) => obszary[s.roomTiles[r.id][0]] !== od && s.reg[s.roomTiles[r.id][0]] === s.regionOf(p),
    );
    expect(wDomu.length).toBeGreaterThan(0);
    expect(daleko.length, 'pokoje osiągalne tylko ulicą').toBeGreaterThan(0);
    for (const r of wDomu) st.apts.find((x) => x.apt === r.apt)!.searched.push(r.id);
    return { ...sc, daleko: daleko.map((r) => r.id) };
  }

  it('pokój w innej klatce bloku w trybie zombie: automat go nie bierze i nie liczy do niego dróg, polecenie i przełącznik tak', () => {
    const { sim, p, s, daleko } = zostajaDrugieKlatki({ ...ZOMBIE_DZIEN });
    const cel = daleko[0];
    expect(s.startSearch(p, cel, false)).toBe(false);
    expect(jaka(p)).toBe('-');
    const paths = sim.stats.paths;
    for (let k = 0; k < 6; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    // rodzaj Szaber nie liczy do takich pokoi dróg (pozostałe rodzaje nie mają tu roboty)
    expect(sim.stats.paths).toBe(paths);
    // z polecenia pokój jest do wzięcia
    expect(s.startSearch(p, cel, true)).toBe(true);
    expect(p.job?.order).toBe(true);
    // z przełącznikiem (za dnia, bez szwendaczy przy osobie) też
    const z = zostajaDrugieKlatki({ ...ZOMBIE_DZIEN, zaSiatke: true });
    z.s.think(z.p);
    expect(jaka(z.p)).toBe('search');
    expect(z.p.job?.order).toBe(false);
  });

  it('pokój w innej klatce bloku w trybie zwykłym za dnia: Szaber nie bierze go bez przełącznika (0 dróg), z przełącznikiem tak, ulicą', () => {
    const { sim, p, s, daleko } = zostajaDrugieKlatki({ ...DZIEN });
    expect(s.startSearch(p, daleko[0], false)).toBe(false);
    const paths = sim.stats.paths;
    for (let k = 0; k < 6; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths).toBe(paths);
    // z polecenia pokój jest do wzięcia
    expect(s.startSearch(p, daleko[0], true)).toBe(true);
    // z przełącznikiem za dnia Szaber idzie tam ulicą
    const z = zostajaDrugieKlatki({ ...DZIEN, zaSiatke: true });
    z.s.think(z.p);
    expect(jaka(z.p)).toBe('search');
    expect(z.p.job?.order).toBe(false);
    expect(
      z.p.path.every((t) => z.s.naszTeren(t)),
      'droga prowadzi ulicą',
    ).toBe(false);
  });

  it('Szaber a materiał: ten sam pokój z drugiej klatki odpada dla Szabru, a stos drewna w drugiej klatce jest noszony ulicą', () => {
    // jedna scena: osoba ma Szaber i Ogień (haul); w drugiej klatce leży stos drewna, a pokoje siedziby do przeszukania
    // też są tylko w drugich klatkach
    const { sim, p, s, daleko } = zostajaDrugieKlatki({ ...DZIEN });
    const { obca } = (() => {
      const ob = s.naszeObszary();
      const od = ob[s.tileOf(p)];
      const tile = s.roomTiles[daleko[0]].find((i) => ob[i] !== od && s.reg[i] === s.regionOf(p))!;
      return { obca: tile };
    })();
    s.addWood(obca, 6);
    odnow(sim, p);
    s.think(p);
    // pokój odpada, wolne drewno jest brane (Ogień przed Szabrem w kolejności kolumn)
    expect(jaka(p)).toBe('haul');
  });

  it('droga do pokoju w innej klatce tego samego bloku: Szaber bez przełącznika zostaje na naszym terenie, z przełącznikiem idzie ulicą', () => {
    const droga = (tryb: 'zombie' | 'zwykly', zaSiatke: boolean) => {
      const { sim, p, s } = scena({ key: 'przymorze', rodzaje: ['szaber'], tryb, zaSiatke });
      const lista: { wychodzi: boolean }[] = [];
      const oryginal = s.setJob.bind(s);
      vi.spyOn(s, 'setJob').mockImplementation((pp, j, keep) => {
        if (pp === p && !j.order && j.t === 'search') lista.push({ wychodzi: pp.path.some((t) => !s.naszTeren(t)) });
        oryginal(pp, j, keep);
      });
      for (let krok = 0; krok < 12000; krok++) {
        if (krok % 100 === 0) {
          podkarm(sim);
          sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
        }
        sim.step();
      }
      return { lista, przeszukane: sim.st.apts.reduce((x, g) => x + g.searched.length, 0) };
    };
    const zombie = droga('zombie', false);
    const zwykly = droga('zwykly', false);
    const przelacznik = droga('zwykly', true);
    expect(zombie.lista.length).toBeGreaterThan(0);
    expect(zombie.lista.some((x) => x.wychodzi)).toBe(false);
    // w trybie zwykłym za dnia bez przełącznika też tylko po naszym terenie: te same pokoje co w zombie
    expect(zwykly.lista.some((x) => x.wychodzi)).toBe(false);
    expect(zwykly.przeszukane).toBe(zombie.przeszukane);
    // z przełącznikiem osiągalne są też pokoje z drugich klatek, przez ulicę
    expect(przelacznik.lista.some((x) => x.wychodzi)).toBe(true);
    expect(przelacznik.przeszukane).toBeGreaterThan(zwykly.przeszukane);
  });

  it('z lokatorami: tylko klatka, nigdy mieszkania (także te, z których wyszli), stosunek bez zmian', () => {
    const a = zBlokiem({ lokatorzy: 'wszyscy', otoczony: true });
    // drzwi mieszkań otwarte, żeby pokoje lokatorów były osiągalne: automat i tak ich nie rusza
    for (const d of a.b.drzwi) d.s = 'otwarte';
    a.s.rebuild();
    const dostepne = dostepnePokoje(a.sim, a.p, a.k);
    expect(dostepne.length).toBeGreaterThan(8);
    // dzień, w którym lokatorzy są za dnia poza domem: ich pokoje są do szabru (moznaPrzeszukac: 'szaber'), więc gracz
    // mógłby je okraść, a automat nie może
    const szaber = () => dostepne.filter((room) => moznaPrzeszukac(a.sim.st, a.w, a.k, room) === 'szaber');
    for (let dzien = 2; dzien < 40 && szaber().length < 3; dzien++) a.sim.st.tick = tickO(dzien, 9);
    expect(szaber().length, 'osiągalne pokoje lokatorów pod ich nieobecność').toBeGreaterThanOrEqual(3);
    const relPrzed = a.b.domy.map((g) => g.rel);
    // sam start pracy z automatu (startLoot bez polecenia) nie przyjmuje pokoju lokatorów, polecenie gracza tak
    const lokatorow = szaber()[0];
    expect(a.s.startLoot(a.p, a.bid, lokatorow, false)).toBe(false);
    expect(jaka(a.p)).toBe('-');
    // praca z automatu, której pokój zmienił stan w trakcie, kończy się; ta sama praca z polecenia trwa
    const plytki = a.sim.kafelkiPokoju(gid(a.k, lokatorow)).filter((i) => a.s.reg[i] === a.s.regionOf(a.p));
    const na = plytki[0];
    a.p.x = (na % a.w.size) + 0.5;
    a.p.y = Math.floor(na / a.w.size) + 0.5;
    const doKtorejPraca = (order: boolean) => {
      odnow(a.sim, a.p);
      const j = a.s.newJob('loot', gid(a.k, lokatorow), na, order);
      a.p.job = j;
      return a.s.work(a.p, j);
    };
    expect(doKtorejPraca(false)).toBe(false);
    expect(doKtorejPraca(true)).toBe(true);
    // z polecenia gracza start też przechodzi (szaber gracza z konsekwencjami po jego stronie)
    odnow(a.sim, a.p);
    expect(a.s.startLoot(a.p, a.bid, lokatorow, true)).toBe(true);
    odnow(a.sim, a.p);
    // osoba stoi w pokoju lokatorów, który jest tuż obok: bierze klatkę, choć mieszkanie lokatorów jest bliżej
    const size = a.w.size;
    const pokoje = szaber();
    const sasiad = a.sim
      .kafelkiPokoju(gid(a.k, pokoje[pokoje.length - 1]))
      .filter((i) => a.s.reg[i] === a.s.regionOf(a.p))
      .pop()!;
    a.p.x = (sasiad % size) + 0.5;
    a.p.y = Math.floor(sasiad / size) + 0.5;
    odnow(a.sim, a.p);
    const { cele } = liczStarty(a.sim, a.p);
    a.s.think(a.p);
    expect(jaka(a.p)).toBe('loot');
    expect(wnetrze(a.w, a.bid).rooms[gidRoom(a.p.job!.target)].apt, 'klatka, nie mieszkanie lokatorów').toBe(-1);
    // dalej do 18:00, kiedy lokatorzy wracają
    for (let krok = 0; krok < 3000; krok++) {
      if (krok % 100 === 0) podkarm(a.sim);
      a.sim.step();
    }
    const lupy = cele.filter((x) => x.t === 'loot');
    expect(lupy.length, 'klatki przeszukane').toBeGreaterThan(0);
    // mieszkania lokatorów nietknięte
    for (const m of a.b.mieszkania) expect(m.przeszukane).toEqual([]);
    expect(a.b.domy.map((g) => g.rel)).toEqual(relPrzed);
    expect(a.b.przeszukane.length).toBeGreaterThan(0);
  });

  it('z nieotoczonego budynku tylko z przełącznikiem i tylko za dnia', () => {
    const bez = zBlokiem({ lokatorzy: 'pusto', otoczony: false });
    bez.s.think(bez.p);
    expect(jaka(bez.p)).toBe('-');
    const z = zBlokiem({ lokatorzy: 'pusto', otoczony: false, zaSiatke: true });
    z.s.think(z.p);
    expect(jaka(z.p)).toBe('loot');
    expect(z.p.job?.order).toBe(false);
    const noc = zBlokiem({ lokatorzy: 'pusto', otoczony: false, zaSiatke: true, godzina: 23 });
    noc.p.needs!.rest = 95;
    noc.s.think(noc.p);
    expect(jaka(noc.p)).toBe('-');
  });

  it('nie otwiera i nie wyważa zamkniętych drzwi: budynek bez otwarcia przez gracza zostaje zamknięty', () => {
    const w = demoWorld('lanciego');
    const sim = newGame('lanciego');
    sim.lokatorzy = pusto(w);
    const { p } = scena({ sim, rodzaje: ['szaber'], zaSiatke: true });
    const { n } = liczStarty(sim, p);
    for (let krok = 0; krok < 2000; krok++) {
      if (krok % 100 === 0) podkarm(sim);
      sim.step();
    }
    expect(n.door ?? 0).toBe(0);
    expect(n.loot ?? 0).toBe(0);
    for (const b of sim.st.sasiedzi?.budynki ?? []) expect(b.otwarty).toBe(false);
  });

  it('w siedzibie przeszukuje tylko puste mieszkania, choć mieszkanie lokatorów jest bliżej', () => {
    const { sim, p, s } = scena({ rodzaje: ['szaber'] });
    const st = sim.st;
    const h = sim.house!;
    const stan = (apt: number) => st.apts.find((x) => x.apt === apt)?.state;
    // osoba stoi w pokoju mieszkania lokatorów
    const obcePokoje = h.rooms.filter((r) => stan(r.apt) === 'mieszkancy').map((r) => r.id);
    expect(obcePokoje.length).toBeGreaterThan(0);
    const kafelek = [...Array(s.w.size * s.w.size).keys()].find(
      (i) => obcePokoje.includes(h.room[i]) && !s.coreBlocked[i] && s.reg[i] === s.regionOf(p),
    )!;
    expect(kafelek).toBeDefined();
    p.x = (kafelek % s.w.size) + 0.5;
    p.y = Math.floor(kafelek / s.w.size) + 0.5;
    odnow(sim, p);
    const { cele } = liczStarty(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('search');
    expect(p.job?.order).toBe(false);
    expect(stan(h.rooms[p.job!.target].apt)).toBe('puste');
    for (let krok = 0; krok < 5000; krok++) {
      if (krok % 100 === 0) podkarm(sim);
      sim.step();
    }
    const szukane = cele.filter((c) => c.t === 'search');
    expect(szukane.length).toBeGreaterThanOrEqual(2);
    for (const c of szukane) expect(stan(h.rooms[c.target].apt), `pokój ${c.target}`).toBe('puste');
    for (const g of st.apts) if (g.state !== 'puste') expect(g.searched, `mieszkanie ${g.apt}`).toEqual([]);
  });

  it('w trybie zombie nie wchodzi do pokoju siedziby, w którym jest szwendacz (bliżej niż 10 m), bez niego tak', () => {
    const { sim, p, s } = scena({ key: 'zielonki', tryb: 'zombie', rodzaje: ['szaber'] });
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    const h = sim.house!;
    const kafelek = h.rooms.flatMap((r) => s.roomTiles[r.id]).find((i) => s.reg[i] === s.regionOf(p))!;
    const zombie = spawnZombie(sim.st, s.w, kafelek, 0);
    s.think(p);
    expect(jaka(p)).toBe('-');
    sim.st.pawns = sim.st.pawns.filter((q) => q !== zombie);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('search');
  });

  it('w domu komitetu przeszukuje pomieszczenia domu (Zielonki)', () => {
    const { sim, p, s } = scena({ key: 'zielonki', rodzaje: ['szaber'] });
    s.think(p);
    expect(jaka(p)).toBe('search');
    expect(p.job?.order).toBe(false);
    expect(sim.st.apts.find((a) => a.apt === sim.house!.rooms[p.job!.target].apt)?.state).toBe('zarzad');
  });

  it('wraki: tylko szukanie, tylko z przełącznikiem i za dnia, bez rozbiórki; dwóch ludzi nie bierze tego samego', () => {
    // bez przełącznika wraki na ulicy nie są nasze
    const bez = scena({ rodzaje: ['szaber'] });
    bezPokoi(bez);
    const ws = wrecksOf(bez.sim.w).map((r) => wreckTile(r, bez.sim.w.size));
    expect(ws.length).toBeGreaterThan(1);
    expect(ws.every((t) => !prv(bez.sim).naszTeren(t))).toBe(true);
    prv(bez.sim).think(bez.p);
    expect(jaka(bez.p)).toBe('-');
    // z przełącznikiem za dnia: przeszukanie wraku, praca bez polecenia
    const z = scena({ rodzaje: ['szaber'], zaSiatke: true });
    bezPokoi(z);
    prv(z.sim).think(z.p);
    expect(jaka(z.p)).toBe('wreck');
    expect(z.p.job?.what).toBe('szukaj');
    expect(z.p.job?.order).toBe(false);
    // nocą nie
    const noc = scena({ rodzaje: ['szaber'], zaSiatke: true, godzina: 23 });
    bezPokoi(noc);
    noc.p.needs!.rest = 95;
    prv(noc.sim).think(noc.p);
    expect(jaka(noc.p)).toBe('-');
    // dwie osoby: dwa różne wraki
    const dwie = scena({ rodzaje: ['szaber'], zaSiatke: true, osoby: 2 });
    bezPokoi(dwie);
    const [a, b] = dwie.ludzie;
    b.x = a.x;
    b.y = a.y;
    odnow(dwie.sim, b);
    prv(dwie.sim).think(a);
    prv(dwie.sim).think(b);
    expect(jaka(a)).toBe('wreck');
    expect(jaka(b)).toBe('wreck');
    expect(a.job!.target).not.toBe(b.job!.target);
  });

  it('po przeszukaniu wraku nie rozbiera go sam (hałas i dwie godziny pracy zostają poleceniem)', () => {
    const sc = scena({ rodzaje: ['szaber'], zaSiatke: true });
    bezPokoi(sc);
    const { sim, p } = sc;
    const { cele } = liczStarty(sim, p);
    const w = sim.w;
    for (let krok = 0; krok < 6000; krok++) {
      if (krok % 100 === 0) podkarm(sim);
      sim.step();
    }
    const wraki = cele.filter((c) => c.t === 'wreck');
    expect(wraki.length).toBeGreaterThanOrEqual(1);
    expect(wraki.every((c) => c.what === 'szukaj' && !c.order)).toBe(true);
    const stany = wrecksOf(w).map((r) => wreckStage(sim.st.wraki, wreckTile(r, w.size)));
    expect(stany.some((s) => s === 1)).toBe(true);
    expect(stany.every((s) => s < 2)).toBe(true);
  });

  it('w trybie zombie omija wrak, przy którym stoi szwendacz (bliżej niż 10 m)', () => {
    const sc = scena({ tryb: 'zombie', rodzaje: ['szaber'], zaSiatke: true });
    sc.sim.st.pawns = sc.sim.st.pawns.filter((q) => q.kind !== 'zombie');
    bezPokoi(sc);
    const { sim, p } = sc;
    const s = prv(sim);
    // wszystkie wraki poza jednym przeszukane, przy tym jednym szwendacz: nic; bez niego przeszukanie
    const wraki = wrecksOf(s.w).map((r) => wreckTile(r, s.w.size));
    expect(wraki.length).toBeGreaterThan(1);
    const [cel, ...reszta] = wraki;
    sim.st.wraki = reszta.map((t) => ({ t, s: 1 as const })).sort((a, b) => a.t - b.t);
    odnow(sim, p);
    const zombie = spawnZombie(sim.st, s.w, cel, 0);
    s.think(p);
    expect(jaka(p)).toBe('-');
    sim.st.pawns = sim.st.pawns.filter((q) => q !== zombie);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('wreck');
    expect(p.job!.target).toBe(cel);
  });
});

describe('zimno przed nowymi rodzajami o niskim priorytecie', () => {
  /** pierwsza osoba z Szabrem na `prio`, ciepłem `warm` i pustymi mieszkaniami siedziby do przeszukania */
  function zimna(prio: 0 | 1 | 2 | 3 | 4, warm: number, stale?: RodzajPracy) {
    const sc = scena({ rodzaje: [] });
    const { sim, p } = sc;
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'szaber', prio });
    if (stale) sim.push({ t: 'stale', ids: [], osoba: p.person, rodzaj: stale });
    sim.step();
    odnow(sim, p);
    p.needs!.warm = warm;
    return sc;
  }

  it('ciepło poniżej COLD: ogrzanie przed Szabrem z priorytetem 3 i 4, po nim przy 1 i 2 oraz przy stałym zajęciu', () => {
    for (const [prio, warm, stale, oczekiwane] of [
      [3, 30, undefined, 'warm'],
      [4, 30, undefined, 'warm'],
      [3, 60, undefined, 'search'],
      [2, 30, undefined, 'search'],
      [1, 30, undefined, 'search'],
      [0, 30, 'szaber', 'search'],
    ] as const) {
      const { p, s } = zimna(prio, warm, stale);
      s.think(p);
      expect(jaka(p), `priorytet ${prio}, ciepło ${warm}, stałe ${stale ?? '-'}`).toBe(oczekiwane);
    }
  });

  it('zimno nie wyprzedza budowy planów z priorytetem 3: stary rodzaj jak przed automatem', () => {
    const { sim, p, s } = scena({ rodzaje: ['budowa'] });
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'budowa', prio: 3 });
    sim.step();
    planOgrodka(sim);
    odnow(sim, p);
    p.needs!.warm = 30;
    s.think(p);
    expect(jaka(p)).toBe('build');
  });
});

/* ---------- jedna reguła „za siatką” i „w obrębie naszego terenu” dla prac bez polecenia ---------- */

describe('praca bez polecenia nie wychodzi z naszego terenu', () => {
  /** Przymorze: gra w dzień (albo w nocy), bez materiałów z początku gry; blok ma drugą klatkę, do której z podwórka
      dochodzi się tylko ulicą (osobny spójny obszar naszego terenu). */
  function przymorze(o: Opcje = {}) {
    const sc = scena({ key: 'przymorze', ...o });
    const { sim } = sc;
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    sim.st.things = sim.st.things.filter((t) => !['deski', 'zlom', 'czesci', 'drewno'].includes(t.kind));
    return { ...sc, s: prv(sim), st: sim.st };
  }

  /** wolne kafelki pokoi siedziby w innym obszarze naszego terenu niż osoba, ale w jej obszarze ruchu (dojście ulicą),
      od najbliższych osobie */
  function wInnejKlatce(sim: Sim, p: Pawn, ile = 1): number[] {
    const s = prv(sim);
    const ob = s.naszeObszary();
    const od = ob[s.tileOf(p)];
    expect(od).toBeGreaterThanOrEqual(0);
    const size = s.w.size;
    const zajete = new Set(sim.st.things.map((t) => t.y * size + t.x));
    const kafle = sim
      .house!.rooms.flatMap((r) => s.roomTiles[r.id])
      .filter((t) => ob[t] >= 0 && ob[t] !== od && s.reg[t] === s.regionOf(p) && !zajete.has(t));
    kafle.sort((a, b) => s.dist2(p, a) - s.dist2(p, b) || a - b);
    expect(kafle.length, 'drugi obszar naszego terenu osiągalny ulicą').toBeGreaterThanOrEqual(ile);
    return kafle.slice(0, ile);
  }

  /** Osoba stoi tuż przy pokoju z drugiej klatki (po stronie podwórka), a daleko od niej leży wolny kafelek podwórka:
      sterta w drugiej klatce jest bliżej, sterta na podwórku dalej. */
  function bliskoDrugiejKlatki(sim: Sim, p: Pawn) {
    const s = prv(sim);
    const ob = s.naszeObszary();
    const od = ob[s.tileOf(p)];
    const [obca] = wInnejKlatce(sim, p);
    const size = s.w.size;
    const zajete = new Set(sim.st.things.map((t) => t.y * size + t.x));
    const swoje: number[] = [];
    for (let i = 0; i < size * size; i++)
      if (ob[i] === od && !s.coreBlocked[i] && !zajete.has(i) && s.yardMask[i] === 1) swoje.push(i);
    const d = (a: number, b: number) =>
      ((a % size) - (b % size)) ** 2 + (Math.floor(a / size) - Math.floor(b / size)) ** 2;
    // stanowisko osoby: kafelek podwórka najbliżej obcego pokoju; sterta swoja: najdalszy kafelek podwórka od niej
    const przy = swoje.reduce((best, i) => (d(i, obca) < d(best, obca) ? i : best), swoje[0]);
    p.x = (przy % size) + 0.5;
    p.y = Math.floor(przy / size) + 0.5;
    odnow(sim, p);
    const dalej = swoje.reduce((best, i) => (d(i, przy) > d(best, przy) ? i : best), swoje[0]);
    expect(s.dist2(p, dalej)).toBeGreaterThan(s.dist2(p, obca));
    return { obca, swoja: dalej };
  }

  /** zapisuje, czy droga każdej rozpoczętej pracy bez polecenia mieści się w naszym terenie (ścieżka w chwili startu) */
  function sledz(sim: Sim, p: Pawn) {
    const s = prv(sim);
    const trasy: { t: JobKind; wChwili: boolean; from: number; tile: number }[] = [];
    const org = s.setJob.bind(s);
    vi.spyOn(s, 'setJob').mockImplementation((pp, j, keep) => {
      if (pp === p && !j.order)
        trasy.push({ t: j.t, wChwili: pp.path.every((t) => s.naszTeren(t)), from: j.from, tile: j.tile });
      org(pp, j, keep);
    });
    return trasy;
  }

  /** `krok` kroków gry. Domyślnie w każdym kroku osoba stoi na naszym terenie; z `wolnoPoza` może go opuszczać (droga
      ulicą między częściami naszego terenu). Zwraca, czy choć raz była poza nim. W trybie zombie co 50 kroków znikają
      szwendacze, żeby test mierzył zasadę dróg, a nie spotkanie ze stadem. */
  function ruch(sim: Sim, p: Pawn, krok: number, wolnoPoza = false): boolean {
    const s = prv(sim);
    let poza = false;
    for (let k = 0; k < krok; k++) {
      if (k % 50 === 0) {
        podkarm(sim);
        if (sim.st.mode === 'zombie') sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
      }
      sim.step();
      const na = s.naszTeren(s.tileOf(p));
      if (!na) poza = true;
      if (!wolnoPoza) expect(na, `krok ${k}: ${jaka(p)}`).toBe(true);
    }
    return poza;
  }

  it('noszenie drewna do składu: w trybie zombie i nocą stos w drugiej klatce odpada, własny stos jest brany po naszym terenie', () => {
    for (const [nazwa, ctx] of [
      ['zombie za dnia', ZOMBIE_DZIEN],
      ['tryb zwykły nocą', NOC],
    ] as const) {
      const { sim, p, s, st } = przymorze({ rodzaje: [], ...ctx });
      p.needs!.rest = 95;
      const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
      s.addWood(obca, 6);
      const trasy = sledz(sim, p);
      const paths = sim.stats.paths;
      for (let k = 0; k < 5; k++) {
        odnow(sim, p);
        s.think(p);
        expect(jaka(p), `${nazwa}, próba ${k}`).toBe('-');
      }
      // bez nowych dróg (stos odpada przed liczeniem drogi) i bez ruszania się z miejsca
      expect(sim.stats.paths - paths).toBe(0);
      ruch(sim, p, 200);
      expect(trasy.filter((x) => x.t === 'haul')).toHaveLength(0);
      // własny stos, choć dalszy: brany, droga w obrębie naszego terenu
      s.addWood(swoja, 6);
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `${nazwa}, własny stos`).toBe('haul');
      expect(
        p.path.every((t) => s.naszTeren(t)),
        'droga po naszym terenie',
      ).toBe(true);
      const stos = st.things.find((t) => t.id === p.job!.target)!;
      expect(stos.y * s.w.size + stos.x).toBe(swoja);
      ruch(sim, p, 600);
    }
  });

  it('noszenie drewna do składu: w trybie zwykłym za dnia stos w drugiej klatce jest noszony ulicą i praca się kończy', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: [], ...DZIEN });
    const { obca } = bliskoDrugiejKlatki(sim, p);
    s.addWood(obca, 6);
    const stos = st.things.find((t) => t.kind === 'drewno' && t.y * s.w.size + t.x === obca)!;
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('haul');
    expect(p.job!.target).toBe(stos.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga prowadzi ulicą',
    ).toBe(false);
    const poza = ruch(sim, p, 1500, true);
    expect(poza).toBe(true);
    // drewno zabrane (jednym kursem) i osoba wróciła na nasz teren
    expect(st.things.includes(stos)).toBe(false);
    expect(s.naszTeren(s.tileOf(p))).toBe(true);
  });

  it('łatanie dziury w trybie zombie: materiał w drugiej klatce odpada i nie zasłania dalszego materiału na podwórku', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['naprawy'], ...ZOMBIE_DZIEN });
    // w trybie zombie dziury są na starcie załatane: jedna otwarta
    st.fence!.holes[0].patch = 0;
    s.rebuild();
    expect(st.fence!.holes.some((h) => h.patch <= 0)).toBe(true);
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const obcaSterta = dodaj(sim, 'deski', 6, obca);
    const paths = sim.stats.paths;
    for (let k = 0; k < 5; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths - paths).toBe(0);
    const swojaSterta = dodaj(sim, 'deski', 6, swoja);
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('patch');
    expect(p.job!.from).toBe(swojaSterta.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga po naszym terenie',
    ).toBe(true);
    ruch(sim, p, 700);
    expect(obcaSterta.n).toBe(6);
    expect(st.fence!.holes.some((h) => h.patch > 0)).toBe(true);
  });

  it('łatanie dziury w trybie zwykłym za dnia: najbliższy materiał z drugiej klatki jest noszony ulicą', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['naprawy'], ...DZIEN });
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const obcaSterta = dodaj(sim, 'deski', 6, obca);
    dodaj(sim, 'deski', 6, swoja);
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('patch');
    expect(p.job!.from, 'najbliższa sterta').toBe(obcaSterta.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga prowadzi ulicą',
    ).toBe(false);
    const dziury = st.fence!.holes.filter((h) => h.patch > 0).length;
    const poza = ruch(sim, p, 1500, true);
    expect(poza).toBe(true);
    expect(st.fence!.holes.filter((h) => h.patch > 0).length).toBeGreaterThan(dziury);
    expect(obcaSterta.n).toBe(3);
  });

  it('budowa w trybie zombie: materiał w drugiej klatce odpada, a materiał z podwórka jest noszony po naszym terenie', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...ZOMBIE_DZIEN });
    for (const h of st.fence!.holes) h.patch = 100;
    s.rebuild();
    const plan = planOgrodka(sim);
    plan.have = {};
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const obcaSterta = dodaj(sim, 'deski', BUILDS.ogrodek.cost.deski!, obca);
    const paths = sim.stats.paths;
    for (let k = 0; k < 5; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths - paths).toBe(0);
    const swojaSterta = dodaj(sim, 'deski', BUILDS.ogrodek.cost.deski!, swoja);
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('build');
    expect(p.job!.from).toBe(swojaSterta.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga po naszym terenie',
    ).toBe(true);
    // kolejne kursy (takeFor, praca przy planie) też po naszym terenie, a obca sterta nietknięta
    ruch(sim, p, 1800);
    expect(obcaSterta.n).toBe(BUILDS.ogrodek.cost.deski);
    expect(st.builds.includes(plan) || st.things.some((t) => t.kind === 'ogrodek')).toBe(true);
  });

  it('budowa w trybie zwykłym za dnia: materiał z drugiej klatki jest noszony ulicą, plan się kończy', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...DZIEN });
    for (const h of st.fence!.holes) h.patch = 100;
    s.rebuild();
    const plan = planOgrodka(sim);
    plan.have = {};
    const { obca } = bliskoDrugiejKlatki(sim, p);
    const obcaSterta = dodaj(sim, 'deski', BUILDS.ogrodek.cost.deski!, obca);
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('build');
    expect(p.job!.from).toBe(obcaSterta.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga prowadzi ulicą',
    ).toBe(false);
    const poza = ruch(sim, p, 6000, true);
    expect(poza).toBe(true);
    expect(st.builds.includes(plan)).toBe(false);
    expect(st.things.some((t) => t.kind === 'ogrodek')).toBe(true);
  });

  it('plan budowy w pokoju z drugiej klatki: w trybie zombie materiał nie jest do niego noszony i porzucany co sekundę', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...ZOMBIE_DZIEN });
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const plan = {
      id: st.nextThing++,
      kind: 'magazyn' as const,
      x: obca % sim.w.size,
      y: Math.floor(obca / sim.w.size),
      rot: 0,
      need: { deski: 30 },
      have: {},
      work: 0,
      by: -1,
    };
    st.builds.push(plan);
    dodaj(sim, 'deski', 10, swoja);
    dodaj(sim, 'deski', 10, wolneNaPodworku(sim, p, 3)[2]);
    dodaj(sim, 'deski', 10, wolneNaPodworku(sim, p, 3)[1]);
    const trasy = sledz(sim, p);
    const paths = sim.stats.paths;
    for (let k = 0; k < 10; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths - paths).toBe(0);
    ruch(sim, p, 300);
    expect(trasy.filter((x) => x.t === 'build')).toHaveLength(0);
    // z przełącznikiem (za dnia, bez szwendaczy) plan jest do wzięcia
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
    sim.step();
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('build');
  });

  it('plan budowy w pokoju z drugiej klatki: w trybie zwykłym za dnia materiał jest noszony ulicą bez przełącznika', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...DZIEN });
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const plan = {
      id: st.nextThing++,
      kind: 'magazyn' as const,
      x: obca % sim.w.size,
      y: Math.floor(obca / sim.w.size),
      rot: 0,
      need: { deski: 30 },
      have: {},
      work: 0,
      by: -1,
    };
    st.builds.push(plan);
    dodaj(sim, 'deski', 10, swoja);
    dodaj(sim, 'deski', 10, wolneNaPodworku(sim, p, 3)[2]);
    dodaj(sim, 'deski', 10, wolneNaPodworku(sim, p, 3)[1]);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('build');
    const poza = ruch(sim, p, 1500, true);
    expect(poza).toBe(true);
    expect(st.builds.find((b) => b.id === plan.id)?.have.deski ?? 0).toBeGreaterThan(0);
  });

  it('plan wspólnego płotu w trybie zombie: brakujący złom w drugiej klatce nie liczy dróg co sekundę i nie zasłania dalszego złomu', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...ZOMBIE_DZIEN });
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const [stand] = wolneNaPodworku(sim, p, 1);
    st.plot = {
      bids: [],
      plan: { bid: 0, need: { zlom: 4 }, have: {}, work: 0, total: 100000, by: -1, stand, wariant: 'mieszany' },
    };
    const obcaSterta = dodaj(sim, 'zlom', 8, obca);
    const paths = sim.stats.paths;
    for (let k = 0; k < 10; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths - paths, 'dziesięć prób bez ani jednej drogi A*').toBe(0);
    expect(st.plot.plan!.by).toBe(-1);
    // dalszy złom na podwórku: plan bierze jego, a nie bliższy obcy
    const swojaSterta = dodaj(sim, 'zlom', 8, swoja);
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('plot');
    expect(p.job!.from).toBe(swojaSterta.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga po naszym terenie',
    ).toBe(true);
    expect(obcaSterta.n).toBe(8);
  });

  it('plan wspólnego płotu poza zasadą dróg: złom poza naszym terenem bez przełącznika nie liczy dróg, z przełącznikiem jest brany', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...DZIEN });
    const [stand] = wolneNaPodworku(sim, p, 1);
    st.plot = {
      bids: [],
      plan: { bid: 0, need: { zlom: 4 }, have: {}, work: 0, total: 100000, by: -1, stand, wariant: 'mieszany' },
    };
    const size = s.w.size;
    const ulica = [...Array(size * size).keys()].find(
      (i) => !s.naszTeren(i) && !s.coreBlocked[i] && s.reg[i] === s.regionOf(p),
    )!;
    dodaj(sim, 'zlom', 8, ulica);
    const paths = sim.stats.paths;
    for (let k = 0; k < 10; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths - paths, 'dziesięć prób bez ani jednej drogi A*').toBe(0);
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
    sim.step();
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('plot');
  });

  it('plan wspólnego płotu w trybie zwykłym za dnia: najbliższy złom z drugiej klatki jest noszony ulicą', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: ['budowa'], ...DZIEN });
    const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
    const [stand] = wolneNaPodworku(sim, p, 1);
    st.plot = {
      bids: [],
      plan: { bid: 0, need: { zlom: 4 }, have: {}, work: 0, total: 100000, by: -1, stand, wariant: 'mieszany' },
    };
    const obcaSterta = dodaj(sim, 'zlom', 8, obca);
    dodaj(sim, 'zlom', 8, swoja);
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('plot');
    expect(p.job!.from).toBe(obcaSterta.id);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga prowadzi ulicą',
    ).toBe(false);
    const poza = ruch(sim, p, 1500, true);
    expect(poza).toBe(true);
    expect(st.plot.plan!.have.zlom).toBe(4);
  });

  it('naprawa uszkodzenia w mieszkaniu z drugiej klatki: w trybie zombie nie, w zwykłym za dnia ulicą tak', () => {
    for (const [nazwa, tryb] of [
      ['zombie', 'zombie'],
      ['zwykły', 'zwykly'],
    ] as const) {
      const { sim, p, s } = scena({ rodzaje: ['naprawy'], tryb });
      const st = sim.st;
      st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
      for (const h of st.fence!.holes) h.patch = 100;
      s.rebuild();
      const kloc = wolneNaPodworku(sim, p, 3);
      dodaj(sim, 'zlom', 4, kloc[0]);
      dodaj(sim, 'czesci', 4, kloc[1]);
      dodaj(sim, 'deski', 6, kloc[2]);
      st.apts.find((a) => a.apt === st.damage[0].apt)!.ours = true;
      const ob = s.naszeObszary();
      // uszkodzenie leży w innym obszarze naszego terenu niż osoba (Lanciego: druga klatka bloku)
      expect(ob[st.damage[0].tile]).not.toBe(ob[s.tileOf(p)]);
      const { n } = liczStarty(sim, p);
      const paths = sim.stats.paths;
      const poza = ruch(sim, p, tryb === 'zwykly' ? 3000 : 600, tryb === 'zwykly');
      if (tryb === 'zwykly') {
        expect(n.repair ?? 0, nazwa).toBeGreaterThan(0);
        expect(poza, 'droga do drugiej klatki prowadzi ulicą').toBe(true);
        expect(st.damage.some((d) => d.fixed)).toBe(true);
      } else {
        expect(n.repair ?? 0, nazwa).toBe(0);
        // nie liczy dróg do takiego uszkodzenia co sekundę
        expect(sim.stats.paths - paths).toBeLessThanOrEqual(4);
      }
    }
  });

  /** Okna mieszkania zarządu: scena z osobą z Naprawami, bez szwendaczy i bez materiału, z załatanymi dziurami.
      Kafelek okna to ściana zewnętrzna (poza naszym terenem); `miejsca` to kafelki przy oknie, na których da się stanąć
      (jak w `repairStand`: bez ścian i mebli, w obszarze ruchu osoby). */
  function oknaZarzadu(key: string, o: Opcje) {
    const sc = scena({ key, rodzaje: ['naprawy'], ...o });
    const { sim, p, s } = sc;
    const st = sim.st;
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    st.things = st.things.filter((t) => !['deski', 'zlom', 'czesci', 'drewno'].includes(t.kind));
    for (const h of st.fence!.holes) h.patch = 100;
    s.rebuild();
    const house = sim.house!;
    const size = s.w.size;
    const okna = house.windows.filter((t) => [t - 1, t + 1, t - size, t + size].some((k) => inHomeApt(house, k)));
    expect(okna.length, key).toBeGreaterThan(0);
    expect(
      okna.every((t) => !s.naszTeren(t)),
      `${key}: okno poza naszym terenem`,
    ).toBe(true);
    const miejsca = (t: number): number[] =>
      [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1]
        .map((dd) => t + dd)
        .filter(
          (k) => !s.coreBlocked[k] && s.reg[k] === s.regionOf(p) && !s.furnitureAt(k % size, Math.floor(k / size)),
        );
    return { ...sc, st, house, size, okna, miejsca };
  }

  /** Kroki gry do warunku (najwyżej `limit`): liczy naprawy przerwane przed końcem (osoba porzuca pracę `repair`, a
      uszkodzenie zostaje) i kroki osoby poza naszym terenem. */
  function naprawiaj(sim: Sim, p: Pawn, koniec: () => boolean, limit: number) {
    const s = prv(sim);
    let przerwane = 0;
    let krokiNaUlicy = 0;
    let bylo = -1;
    for (let k = 0; k < limit && !koniec(); k++) {
      if (k % 50 === 0) {
        podkarm(sim);
        sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
      }
      sim.step();
      if (!s.naszTeren(s.tileOf(p))) krokiNaUlicy++;
      const teraz = p.job?.t === 'repair' ? p.job.target : -1;
      if (bylo >= 0 && teraz !== bylo && !sim.st.damage[bylo].fixed) przerwane++;
      bylo = teraz;
    }
    return { przerwane, krokiNaUlicy };
  }

  it('okna w mieszkaniu zarządu: Naprawy naprawiają je w trybie zombie i zwykłym za dnia z naszego terenu, bez przerywania pracy', () => {
    const wyniki: Record<string, unknown> = {};
    const oczekiwane: Record<string, unknown> = {};
    for (const key of ['lanciego', 'przymorze'] as const)
      for (const [nazwa, ctx, zaSiatke] of [
        ['zombie za dnia', ZOMBIE_DZIEN, false],
        ['tryb zwykły za dnia', DZIEN, false],
        ['tryb zwykły za dnia z przełącznikiem', DZIEN, true],
      ] as const) {
        const opis = `${key}, ${nazwa}`;
        const { sim, p, s, st, house, okna, miejsca } = oknaZarzadu(key, { ...ctx, zaSiatke });
        const od = s.naszeObszary()[s.tileOf(p)];
        const ob = s.naszeObszary();
        // część okien wychodzi na ulicę: przy nich najbliższe miejsce bywa po stronie ulicy
        expect(
          okna.some((t) => miejsca(t).some((k) => !s.naszTeren(k))),
          `${opis}: okno od ulicy`,
        ).toBe(true);
        // bez przełącznika naprawia się tylko z miejsca w naszej części terenu (od środka albo z podwórka); okno, przy
        // którym da się stanąć tylko na ulicy (Lanciego: w środku pod oknem stoją meble), zostaje dla polecenia
        const doNaprawy = okna.filter((t) => miejsca(t).some((k) => zaSiatke || ob[k] === od));
        expect(doNaprawy.length, opis).toBeGreaterThan(0);
        st.damage = okna.map((tile) => ({ kind: 'okno' as const, tile, apt: house.home, fixed: false, have: {} }));
        dodajMat(sim, p, 'deski', REPAIR.okno.cost.deski! * okna.length);
        const { n } = liczStarty(sim, p);
        const naprawione = () => st.damage.filter((d) => d.fixed).map((d) => d.tile);
        const { przerwane, krokiNaUlicy } = naprawiaj(sim, p, () => naprawione().length === doNaprawy.length, 8000);
        // po naprawie wszystkiego, co się da, nie liczy dróg do okna od ulicy co sekundę
        const drogi = sim.stats.paths;
        naprawiaj(sim, p, () => false, 600);
        wyniki[opis] = {
          naprawione: naprawione().sort((a, b) => a - b),
          przerwane,
          starty: n.repair ?? 0,
          ...(zaSiatke ? {} : { krokiNaUlicy, drogiPotem: sim.stats.paths - drogi <= 4 }),
        };
        // każde okno naprawione jedną pracą, bez przerwania w połowie, a bez przełącznika ani kroku po ulicy
        oczekiwane[opis] = {
          naprawione: [...doNaprawy].sort((a, b) => a - b),
          przerwane: 0,
          starty: doNaprawy.length,
          ...(zaSiatke ? {} : { krokiNaUlicy: 0, drogiPotem: true }),
        };
      }
    expect(wyniki).toEqual(oczekiwane);
  });

  it('okno od ulicy: miejsce do naprawy liczone od sterty (i od osoby, gdy deski już są przy oknie) też leży na naszym terenie, praca nie przerywa się', () => {
    const wyniki: Record<string, unknown> = {};
    const oczekiwane: Record<string, unknown> = {};
    // Przymorze: róg podwórka przy ulicy, z którego najbliżej do okna zarządu po stronie ulicy
    for (const [nazwa, ctx, przyOknie] of [
      ['zombie za dnia', ZOMBIE_DZIEN, false],
      ['tryb zwykły za dnia', DZIEN, false],
      ['zombie za dnia, deski już przy oknie', ZOMBIE_DZIEN, true],
      ['tryb zwykły za dnia, deski już przy oknie', DZIEN, true],
    ] as const) {
      const opis = `przymorze, ${nazwa}`;
      const { sim, p, s, st, house, size, okna, miejsca } = oknaZarzadu('przymorze', ctx);
      const ob = s.naszeObszary();
      const od = ob[s.tileOf(p)];
      const sklad = new Set(house.sklad);
      const d2 = (a: number, b: number) =>
        ((a % size) - (b % size)) ** 2 + (Math.floor(a / size) - Math.floor(b / size)) ** 2;
      const najblizsze = (z: number, cand: number[]) =>
        cand.reduce((b, k) => (d2(z, k) < d2(z, b) || (d2(z, k) === d2(z, b) && k < b) ? k : b), cand[0]);
      // Okno, przy którym jest miejsce w mieszkaniu, i najbliższy mu kafelek podwórka, od którego najbliższe miejsce
      // przy oknie leży na ulicy: tam leżą deski. Osoba stoi w mieszkaniu przy oknie, więc od niej miejsce jest
      // w środku; po wzięciu desek miejsce liczy się od sterty. W wariancie „deski już przy oknie” (naprawa przerwana
      // wcześniej) osoba stoi na tym kafelku podwórka i od razu idzie do pracy.
      let okno = -1;
      let sterta = -1;
      let wSrodku = -1;
      for (const t of okna) {
        const m = miejsca(t);
        const srodek = m.find((k) => inHomeApt(house, k));
        if (srodek === undefined || !m.some((k) => !s.naszTeren(k))) continue;
        let best = -1;
        for (let i = 0; i < size * size; i++) {
          if (ob[i] !== od || s.yardMask[i] !== 1 || s.fenceMask[i] === 1 || s.coreBlocked[i] || sklad.has(i)) continue;
          if (s.naszTeren(najblizsze(i, m)) || (best >= 0 && d2(i, t) >= d2(best, t))) continue;
          best = i;
        }
        if (best < 0) continue;
        okno = t;
        sterta = best;
        wSrodku = srodek;
        break;
      }
      expect(okno, `${opis}: okno, do którego od sterty najbliżej z ulicy`).toBeGreaterThanOrEqual(0);
      const start = przyOknie ? sterta : wSrodku;
      p.x = (start % size) + 0.5;
      p.y = Math.floor(start / size) + 0.5;
      odnow(sim, p);
      st.damage = [{ kind: 'okno', tile: okno, apt: house.home, fixed: false, have: {} }];
      if (przyOknie) st.damage[0].have = { ...REPAIR.okno.cost };
      else dodaj(sim, 'deski', REPAIR.okno.cost.deski!, sterta);
      const { n } = liczStarty(sim, p);
      const wynik = naprawiaj(sim, p, () => st.damage[0].fixed, 3000);
      wyniki[opis] = { naprawione: st.damage[0].fixed, starty: n.repair ?? 0, ...wynik };
      oczekiwane[opis] = { naprawione: true, starty: 1, przerwane: 0, krokiNaUlicy: 0 };
    }
    expect(wyniki).toEqual(oczekiwane);
  });

  it('przełącznik nie omija reguły szwendaczy: w trybie zombie przy osobie stos w drugiej klatce odpada, bez szwendacza jest brany ulicą', () => {
    const { sim, p, s, st } = przymorze({ rodzaje: [], tryb: 'zombie', zaSiatke: true });
    const { obca } = bliskoDrugiejKlatki(sim, p);
    s.addWood(obca, 6);
    // osoba przy siatce, szwendacz za siatką bliżej niż 10 kafelków (nie na podwórku, więc nie alarm)
    const size = s.w.size;
    const przy = [...Array(size * size).keys()]
      .filter((i) => s.yardMask[i] === 1 && !s.coreBlocked[i] && s.reg[i] === s.regionOf(p))
      .find((i) => [-1, 1, -size, size].some((d) => s.fenceMask[i + d] === 1));
    expect(przy).toBeDefined();
    p.x = ((przy as number) % size) + 0.5;
    p.y = Math.floor((przy as number) / size) + 0.5;
    const ulica = [...Array(size * size).keys()].find(
      (i) =>
        !s.naszTeren(i) && !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && s.dist2(p, i) > 9 && s.dist2(p, i) < 49,
    )!;
    expect(ulica).toBeDefined();
    const zombie = spawnZombie(st, s.w, ulica, 0);
    odnow(sim, p);
    expect(s.dojdzieWDomu(p, obca)).toBe(false);
    s.think(p);
    expect(jaka(p)).toBe('-');
    st.pawns = st.pawns.filter((q) => q !== zombie);
    odnow(sim, p);
    expect(s.dojdzieWDomu(p, obca)).toBe(true);
    s.think(p);
    expect(jaka(p)).toBe('haul');
  });

  it('idz i filtr materiału: zasada dróg w jednym miejscu (tryb, pora, przełącznik), cel poza naszym terenem wciąż z przełącznikiem', () => {
    // [tryb, godzina, przełącznik, czy wolno do drugiej klatki bloku]
    const przypadki = [
      ['zwykly', 9, false, true],
      ['zwykly', 9, true, true],
      ['zwykly', 23, false, false],
      ['zwykly', 23, true, false],
      ['zombie', 9, false, false],
      ['zombie', 9, true, true],
    ] as const;
    for (const [tryb, godzina, zaSiatke, wolno] of przypadki) {
      const nazwa = `${tryb} ${godzina}:00, przełącznik ${zaSiatke}`;
      const { sim, p, s } = przymorze({ rodzaje: [], tryb, godzina, zaSiatke });
      p.needs!.rest = 95;
      const { obca, swoja } = bliskoDrugiejKlatki(sim, p);
      const sciezka = p.path;
      const idzie = s.idz(p, obca, false);
      expect(
        [idzie, ...(['build', 'plot', 'repair'] as const).map((r) => s.materialOk(p, false, r)!(obca))],
        nazwa,
      ).toEqual([wolno, wolno, wolno, wolno]);
      // własny kafelek zawsze; polecenie bez filtra
      expect(s.materialOk(p, false, 'build')!(swoja), nazwa).toBe(true);
      expect(s.materialOk(p, false, 'repair')!(swoja), nazwa).toBe(true);
      expect(s.materialOk(p, true, 'build'), nazwa).toBeUndefined();
      if (wolno)
        expect(
          p.path.some((t) => !s.naszTeren(t)),
          `${nazwa}: droga ulicą`,
        ).toBe(true);
      else expect(p.path === sciezka, `${nazwa}: droga bez zmian`).toBe(true);
    }
    // cel poza naszym terenem (ulica): w trybie zwykłym za dnia też tylko z przełącznikiem, nocą wcale
    for (const [godzina, zaSiatke, wolno] of [
      [9, false, false],
      [9, true, true],
      [23, true, false],
    ] as const) {
      const { sim, p, s } = przymorze({ rodzaje: [], godzina, zaSiatke });
      p.needs!.rest = 95;
      const size = s.w.size;
      const ulica = [...Array(size * size).keys()].find(
        (i) => !s.naszTeren(i) && !s.coreBlocked[i] && s.reg[i] === s.regionOf(p),
      )!;
      odnow(sim, p);
      expect(s.mozeTam(p, ulica), `${godzina}:00, przełącznik ${zaSiatke}`).toBe(wolno);
      expect(s.materialOk(p, false, 'build')!(ulica)).toBe(wolno);
      expect(s.materialOk(p, false, 'repair')!(ulica), 'naprawa tylko z naszego terenu').toBe(false);
      expect(s.idz(p, ulica, false)).toBe(wolno);
    }
    // osoba na ulicy wraca do domu bez przełącznika; nocą droga po wejściu na podwórko już z niego nie wychodzi
    const { sim, p, s } = przymorze({ rodzaje: [], godzina: 23 });
    p.needs!.rest = 95;
    const [dom] = wolneNaPodworku(sim, p, 1);
    const size = s.w.size;
    const ulica = [...Array(size * size).keys()].find(
      (i) => !s.naszTeren(i) && !s.coreBlocked[i] && s.reg[i] === s.regionOf(p),
    )!;
    p.x = (ulica % size) + 0.5;
    p.y = Math.floor(ulica / size) + 0.5;
    odnow(sim, p);
    expect(s.idz(p, dom, false)).toBe(true);
    const wejscie = p.path.findIndex((t) => s.naszTeren(t));
    expect(wejscie).toBeGreaterThan(0);
    expect(p.path.slice(wejscie).every((t) => s.naszTeren(t))).toBe(true);
  });

  it('noszenie łupu: stos w budynku z wpisem w st.plot.bids, ale bez korytarza do podwórka, w trybie zombie odpada', () => {
    const a = zBlokiem({ lokatorzy: 'pusto', otoczony: true });
    const { sim, p, s } = a;
    // blok otwarty w trybie zwykłym (w zombie drzwi są inaczej zamknięte), dalej gra jak w trybie zombie
    sim.st.mode = 'zombie';
    s.rebuild();
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'szaber', prio: 0 });
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'noszenie', prio: 1 });
    sim.step();
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    // osoba na podwórku, stos w budynku (nasz teren z wpisu, ale osobny obszar)
    const [stoi] = wolneNaPodworku(sim, p, 1);
    p.x = (stoi % s.w.size) + 0.5;
    p.y = Math.floor(stoi / s.w.size) + 0.5;
    const ob = s.naszeObszary();
    const w = s.w;
    const wBudynku = [...Array(w.size * w.size).keys()].find(
      (t) =>
        w.bid[t] === a.bid &&
        !s.coreBlocked[t] &&
        s.reg[t] === s.regionOf(p) &&
        ob[t] >= 0 &&
        ob[t] !== ob[s.tileOf(p)],
    )!;
    expect(wBudynku, 'budynek jest osobnym obszarem naszego terenu').toBeDefined();
    const sterta = dodaj(sim, 'deski', 8, wBudynku);
    odnow(sim, p);
    const paths = sim.stats.paths;
    expect(s.lootNear(p, wBudynku, false)).toBeUndefined();
    expect(s.startCarry(p, sterta.id, false)).toBe(false);
    for (let k = 0; k < 5; k++) {
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `próba ${k}`).toBe('-');
    }
    expect(sim.stats.paths - paths).toBe(0);
    // z polecenia stos jest do wzięcia, jak dotąd
    expect(s.lootNear(p, wBudynku, true)).toBe(sterta);
    expect(s.startCarry(p, sterta.id, true)).toBe(true);
  });

  it('noszenie łupu: ten sam budynek w trybie zwykłym za dnia jest obsługiwany ulicą, łup trafia na podwórko', () => {
    const a = zBlokiem({ lokatorzy: 'pusto', otoczony: true });
    const { sim, p, s } = a;
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'szaber', prio: 0 });
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'noszenie', prio: 1 });
    sim.step();
    const [stoi] = wolneNaPodworku(sim, p, 1);
    p.x = (stoi % s.w.size) + 0.5;
    p.y = Math.floor(stoi / s.w.size) + 0.5;
    const ob = s.naszeObszary();
    const w = s.w;
    const wBudynku = [...Array(w.size * w.size).keys()].find(
      (t) =>
        w.bid[t] === a.bid &&
        !s.coreBlocked[t] &&
        s.reg[t] === s.regionOf(p) &&
        ob[t] >= 0 &&
        ob[t] !== ob[s.tileOf(p)],
    )!;
    const sterta = dodaj(sim, 'deski', 8, wBudynku);
    const naPodworku = () =>
      sim.st.things
        .filter((t) => t.kind === 'deski' && s.yardMask[t.y * w.size + t.x] === 1)
        .reduce((x, t) => x + t.n, 0);
    const przed = naPodworku();
    const _trasy = sledz(sim, p);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('carry');
    expect(p.job!.order).toBe(false);
    expect(
      p.path.every((t) => s.naszTeren(t)),
      'droga ulicą',
    ).toBe(false);
    const poza = ruch(sim, p, 3000, true);
    expect(poza).toBe(true);
    expect(sim.st.things.includes(sterta)).toBe(false);
    expect(naPodworku()).toBe(przed + 8);
  });
});

describe('rezerwa na łaty i plany dla dzidy', () => {
  it('dzida nie zjada materiału na otwartą dziurę ani na plan: tylko ponad rezerwę desek i złomu', () => {
    // jedna otwarta dziura: rezerwa 3 deski i 3 złomu; dzida to 2 deski i 1 złom
    for (const [deski, zlom, dzida] of [
      [4, 4, false],
      [5, 3, false],
      [5, 4, true],
      [8, 9, true],
    ] as const) {
      const { sim, p, s, st } = zWarsztatem({ tryb: 'zombie' });
      st.fence!.holes.forEach((h, k) => {
        h.patch = k === 0 ? 0 : 100;
      });
      s.rebuild();
      for (const q of core(sim)) q.weapon = null;
      st.store.arms = [];
      dodajMat(sim, p, 'deski', deski);
      dodajMat(sim, p, 'zlom', zlom);
      // deski i części wyłączone, żeby zostały same dzidy
      for (const co of ['deski', 'czesci'] as const) sim.push({ t: 'prog', ids: [], co, n: 0 });
      sim.step();
      odnow(sim, p);
      s.think(p);
      expect(jaka(p), `deski ${deski}, złom ${zlom}`).toBe(dzida ? 'craft' : '-');
    }
  });

  it('plan budowy też trzyma rezerwę desek: brakujące deski planu nie idą na dzidę', () => {
    const { sim, p, s, st } = zWarsztatem({ tryb: 'zombie' });
    for (const q of core(sim)) q.weapon = null;
    st.store.arms = [];
    for (const co of ['deski', 'czesci'] as const) sim.push({ t: 'prog', ids: [], co, n: 0 });
    sim.step();
    const [miejsce] = wolneNaPodworku(sim, p, 1);
    st.builds.push({
      id: st.nextThing++,
      kind: 'magazyn',
      x: miejsce % sim.w.size,
      y: Math.floor(miejsce / sim.w.size),
      rot: 0,
      need: { deski: 30 },
      have: { deski: 20 },
      work: 0,
      by: -1,
    });
    dodajMat(sim, p, 'deski', 11);
    dodajMat(sim, p, 'zlom', 3);
    odnow(sim, p);
    // brak 10 desek planu: z 11 zostaje 1, a na dzidę trzeba 2
    s.think(p);
    expect(jaka(p)).toBe('-');
    dodajMat(sim, p, 'deski', 1);
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('craft');
  });
});

/* ---------- budowa dokańcza plan wspólnego płotu ---------- */

describe('budowa: dokańczanie planu wspólnego płotu', () => {
  /** plan płotu z kompletem materiałów, osoba z Budową (priorytet 1) bez planu z menu */
  function zPlanem(o: Opcje = {}) {
    const sc = scena({ rodzaje: ['budowa'], ...o });
    const { sim, p } = sc;
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    sim.st.builds = [];
    // materiał z początku gry zniknął: test sam rozkłada sterty
    sim.st.things = sim.st.things.filter((t) => !['deski', 'zlom', 'czesci'].includes(t.kind));
    const [stand] = wolneNaPodworku(sim, p, 1);
    sim.st.plot = {
      bids: [],
      plan: { bid: 0, need: { zlom: 4 }, have: { zlom: 4 }, work: 0, total: 5000, by: -1, stand, wariant: 'mieszany' },
    };
    return { ...sc, s: prv(sim), st: sim.st };
  }

  it('od pierwszego rana (po samouczku) dokańcza plan, wcześniej, nocą i bez końca samouczka nie', () => {
    const rano = zPlanem();
    rano.s.think(rano.p);
    expect(jaka(rano.p)).toBe('plot');
    expect(rano.p.job?.order).toBe(false);
    expect(rano.st.plot!.plan!.by).toBe(rano.p.id);
    // pierwszy dzień gry bez zmian: plan czeka na gracza
    const pierwszy = zPlanem({ dzien: 1, godzina: 16 });
    pierwszy.s.think(pierwszy.p);
    expect(jaka(pierwszy.p)).toBe('-');
    // dzień 2 bez końca samouczka: jeszcze nie, od dnia 3 tak (wyjście awaryjne)
    const bez = zPlanem({ samouczek: false });
    bez.s.think(bez.p);
    expect(jaka(bez.p)).toBe('-');
    const trzeci = zPlanem({ samouczek: false, dzien: 3 });
    trzeci.s.think(trzeci.p);
    expect(jaka(trzeci.p)).toBe('plot');
    // noc
    const noc = zPlanem({ godzina: 23 });
    noc.p.needs!.rest = 95;
    noc.s.think(noc.p);
    expect(jaka(noc.p)).toBe('-');
  });

  it('plan z materiałem do doniesienia: bierze tylko to, co wolno bez polecenia', () => {
    const { sim, p, s, st } = zPlanem();
    st.plot!.plan!.have = {};
    // złom leży tylko na ulicy: bez przełącznika nikt po niego nie idzie, z przełącznikiem tak
    const ulica = [...Array(s.w.size * s.w.size).keys()].find(
      (i) => !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && !s.naszTeren(i) && !s.fenceMask[i],
    )!;
    dodaj(sim, 'zlom', 8, ulica);
    s.think(p);
    expect(jaka(p)).toBe('-');
    expect(st.plot!.plan!.by).toBe(-1);
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
    sim.step();
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('plot');
    expect(p.job?.order).toBe(false);
  });

  it('dwóch ludzi nie bierze tego samego planu płotu', () => {
    const { ludzie, s } = zPlanem({ osoby: 2 });
    const [a, b] = ludzie;
    b.x = a.x;
    b.y = a.y;
    s.think(a);
    s.think(b);
    expect(jaka(a)).toBe('plot');
    expect(jaka(b)).toBe('-');
  });

  it('plan zaczęty przez gracza i porzucony kończy się sam: obwód stoi, a zarząd pracuje bez nowych poleceń', () => {
    const { sim, b, p } = graZPlanem();
    const s = prv(sim);
    // gracz zostawia robotę w połowie: reszta rano drugiego dnia
    odnow(sim, p);
    skonczSamouczek(sim);
    sim.st.tick = tickO(2, 9);
    for (const q of core(sim)) q.away = q !== p;
    for (const r of RODZAJE) {
      if (r !== 'ogien') sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: r === 'budowa' ? 1 : 0 });
    }
    sim.step();
    odnow(sim, p);
    const { cele } = liczStarty(sim, p);
    expect(sim.st.plot?.plan).toBeDefined();
    for (let krok = 0; krok < 30000 && !sim.st.plot?.bids.includes(b.id); krok++) {
      if (krok % 100 === 0) podkarm(sim);
      sim.step();
    }
    expect(sim.st.plot?.bids).toContain(b.id);
    expect(sim.st.plot?.plan).toBeUndefined();
    const plot = cele.filter((c) => c.t === 'plot');
    expect(plot.length).toBeGreaterThan(0);
    expect(plot.every((c) => !c.order)).toBe(true);
    void s;
  });
});

describe('determinizm', () => {
  it('pół doby warsztatu i szabru: ten sam skrót, zapis i wczytanie w połowie nie zmieniają przebiegu', () => {
    const wynik = (przerwa: boolean) => {
      const { sim, p } = zWarsztatem({ rodzaje: ['warsztat', 'szaber'], zaSiatke: true, osoby: 3 });
      dodajMat(sim, p, 'zlom', 12);
      dodajMat(sim, p, 'deski', 3);
      ustawZapas(sim, p, 44);
      for (let n = 0; n < 4800; n++) sim.step();
      const dalej = przerwa ? new Sim(sim.w, JSON.parse(JSON.stringify(sim.st))) : sim;
      for (let n = 0; n < 4800; n++) dalej.step();
      return dalej;
    };
    const a = wynik(false);
    const b = wynik(false);
    const c = wynik(true);
    // zarząd naprawdę pracował: części, deski albo przeszukane pomieszczenia
    const praca = suma(a, 'czesci') + suma(a, 'deski') + a.st.apts.reduce((x, g) => x + g.searched.length, 0);
    expect(praca).toBeGreaterThan(3);
    expect(b.hash()).toBe(a.hash());
    expect(c.hash()).toBe(a.hash());
  });
});
