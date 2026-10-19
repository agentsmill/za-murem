/* Rodzaje pracy Drwal, Naprawy i Noszenie w automacie bezczynnego zarządu oraz reguły „za siatką” (src/sim/sim.ts,
   docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, „Rodzaje pracy”, „Progi zapasów”, „Kiedy pracują”): zlecenia
   na prawdziwych mapach (Lanciego, Zielonki), rezerwacja zlecenia przez pracującego (dwóch ludzi nie bierze tego samego),
   brak zleceń bez materiału i drogi (nie kręcą się co sekundę), czego automat nie robi (drzewo na linii obwodu, suche
   drzewo przed samouczkiem, cudze mieszkania), kto może wyjść za siatkę i kiedy, wniesienie drewna zza siatki po
   ścięciu na polecenie, próg drewna tylko z obrębu siatki, tryb zombie i tempo z umiejętności.
   Sceny są małe i deterministyczne: reszta zarządu jest na wyprawie (`away`), badana osoba syta, wyspana i ciepła,
   a rodzaje, których test nie sprawdza, ma wyłączone, więc robi tylko to, co test zamierza (i ogień, którego nikt
   nie wyłącza). Gra jest przestawiona na dzień 2, 9:00 z skończonym samouczkiem (nowe rodzaje ruszają od pierwszego
   rana, `automatRusza`). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { BUILDS, canPlace } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { REPAIR } from '../../src/sim/mieszkania.ts';
import { fenceShape, type Hole, PATCH_HP } from '../../src/sim/perimeter.ts';
import { progi, RODZAJE, type RodzajPracy } from '../../src/sim/praca.ts';
import { drzwiBudynku } from '../../src/sim/sasiedzi.ts';
import {
  BURN_TICKS,
  chopTicks,
  createSim,
  type Job,
  type JobKind,
  naLiniiObwodu,
  PATCH_TICKS,
  type Pawn,
  Sim,
  spawnZombie,
  type Thing,
  trunkOf,
  woodFrom,
} from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { wspolnyPlot } from '../../src/world/plot.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { skonczSamouczek } from './praca-pomoc.ts';
import { core, demoWorld, doorWhere, newGame, pusto, until } from './sasiedzi-pomoc.ts';

/** prywatne części Sim, po które sięgają sceny (kontrakt testowy, nie API gry) */
interface Prywatne {
  think(p: Pawn): void;
  koza(): Thing | undefined;
  addWood(tile: number, n: number): void;
  insideAt(tile: number): boolean;
  naszTeren(tile: number): boolean;
  mozeTam(p: Pawn, tile: number): boolean;
  szwendaczBlisko(tile: number, r?: number): boolean;
  przySiatce(tile: number): boolean;
  zapasDrewna(): number;
  release(p: Pawn): void;
  setJob(p: Pawn, j: Job, keepCarry: boolean): void;
  regionOf(p: Pawn): number;
  dist2(p: Pawn, tile: number): number;
  chopSpot(p: Pawn, k: number): number;
  rebuild(): void;
  startPatch(p: Pawn, hole: Hole, order?: boolean): boolean;
  newJob(t: JobKind, target: number, tile: number, order: boolean, phase?: number): Job;
  work(p: Pawn, j: Job): boolean;
  lootNear(p: Pawn, anchor: number, order?: boolean): Thing | undefined;
  startPlot(p: Pawn, order?: boolean): boolean;
  tileOf(p: Pawn): number;
  exitTile: number;
  coreBlocked: Uint8Array;
  fenceMask: Uint8Array;
  yardMask: Uint8Array;
  reg: Int32Array;
  trunk: Int32Array;
  dry: number;
  w: World;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

/** tick o godzinie `h` dnia `d` (gra zaczyna o 15:00 pierwszego dnia); zawsze wielokrotność 20 */
const tickO = (d: number, h: number): number => ((d - 1) * 24 + h - 15) * TICKS_PER_HOUR;

interface Opcje {
  key?: string;
  tryb?: GameMode;
  /** gotowa gra (na przykład ze wspólnym płotem) zamiast nowej na demie */
  sim?: Sim;
  /** pierwsza osoba może wychodzić za siatkę */
  zaSiatke?: boolean;
  skills?: Record<string, number>;
  /** rodzaje (poza ogniem), które mają priorytet 1; reszta ma 0 */
  rodzaje?: RodzajPracy[];
  /** ile osób z zarządu pracuje (reszta na wyprawie) */
  osoby?: number;
  dzien?: number;
  godzina?: number;
  samouczek?: boolean;
}
interface Scena {
  sim: Sim;
  p: Pawn;
  ludzie: Pawn[];
}

/** Gra po sto kroków wolniejsza od startu: badane osoby syte, wyspane i ciepłe, koza pali się na długo, rodzaje pracy
    ustawione poleceniami (jeden krok), brak pracy w toku. */
function scena(o: Opcje = {}): Scena {
  const sim = o.sim ?? newGame(o.key ?? 'lanciego', o.tryb ?? 'zwykly', 5);
  sim.step();
  const st = sim.st;
  if (o.samouczek !== false) skonczSamouczek(sim);
  st.tick = tickO(o.dzien ?? 2, o.godzina ?? 9);
  // mieszkańcy siedzą w domu: ich własne drogi nie zakłócają liczenia dróg badanej osoby
  for (const q of st.pawns) if (q.kind === 'resident') q.away = true;
  const wszyscy = core(sim);
  const ludzie = wszyscy.slice(0, o.osoby ?? 1);
  for (const q of wszyscy) {
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
    if (o.zaSiatke) sim.push({ t: 'zasiatke', ids: [], osoba: q.person, on: true });
  }
  sim.step();
  for (const q of ludzie) odnow(sim, q);
  return { sim, p, ludzie };
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

/** liczy rozpoczęte prace osoby według rodzaju (setJob podglądany przez spy; jedno wywołanie na grę) */
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
const kafelek = (sim: Sim, p: Pawn): number => Math.floor(p.y) * sim.w.size + Math.floor(p.x);

/** Najbliższy osobie kafelek bez rzeczy, do którego da się dojść: `poza`, czyli poza siatką (i nie na samej siatce ani
    bramie), albo `podworko` (w obrębie siatki, ale nie w składzie, bo skład nie jest „stertą poza składem”). */
function wolnyKafelek(sim: Sim, p: Pawn, gdzie: 'poza' | 'podworko'): number {
  const s = prv(sim);
  const size = s.w.size;
  const region = s.regionOf(p);
  const sklad = new Set(sim.house?.sklad ?? []);
  const zajete = new Set(sim.st.things.map((t) => t.y * size + t.x));
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < size * size; i++) {
    if (s.coreBlocked[i] || s.reg[i] !== region || zajete.has(i) || s.fenceMask[i] === 1) continue;
    const wewnatrz = s.insideAt(i);
    if (gdzie === 'poza' ? wewnatrz : !wewnatrz || s.yardMask[i] !== 1 || sklad.has(i)) continue;
    const d = s.dist2(p, i);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Wolny kafelek poza naszym terenem, do którego da się dojść, dalej niż 3 kafelki od siatki (nie `przySiatce`) i co
    najmniej `odBramy` kafelków od bramy (Chebyshev); najbliższy osobie. */
function ulicaDaleko(sim: Sim, p: Pawn, odBramy = 0, odOsoby = 0): number {
  const s = prv(sim);
  const size = s.w.size;
  const region = s.regionOf(p);
  const zajete = new Set(sim.st.things.map((t) => t.y * size + t.x));
  const bx = s.exitTile % size;
  const by = Math.floor(s.exitTile / size);
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < size * size; i++) {
    if (s.coreBlocked[i] || s.reg[i] !== region || zajete.has(i) || s.naszTeren(i)) continue;
    if (Math.max(Math.abs((i % size) - bx), Math.abs(Math.floor(i / size) - by)) < odBramy) continue;
    const d = s.dist2(p, i);
    if (d < odOsoby * odOsoby) continue;
    if (d >= bd || s.przySiatce(i)) continue;
    bd = d;
    best = i;
  }
  return best;
}

/** nowa sterta materiału na kafelku (jak łup) */
function dodaj(sim: Sim, kind: string, n: number, tile: number): Thing {
  const size = sim.w.size;
  const proto = sim.st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
  const t: Thing = { ...proto, id: sim.st.nextThing++, kind, x: tile % size, y: Math.floor(tile / size), n, by: -1 };
  sim.st.things.push(t);
  return t;
}

/** sztuki drewna na podwórku i w składzie bez kozy: do ustawienia zapasu na dokładną liczbę */
function ustawZapas(sim: Sim, ile: number): void {
  const s = prv(sim);
  let zostalo = ile - s.zapasDrewna();
  for (const i of sim.house!.sklad) {
    if (zostalo <= 0) break;
    const n = Math.min(10, zostalo);
    s.addWood(i, n);
    zostalo -= n;
  }
  expect(s.zapasDrewna()).toBe(ile);
}

describe('drwal', () => {
  it('ścina poniżej progu i przestaje nad progiem (Lanciego, próg 30)', () => {
    const { sim, p } = scena({ zaSiatke: true, rodzaje: ['drwal'] });
    expect(progi(sim.st).drewno).toBe(30);
    const s = prv(sim);
    expect(s.zapasDrewna()).toBe(3); // tyle, ile jest w kozie
    // poniżej progu sam rusza do drzewa i ścina je bez polecenia
    until(sim, () => p.job?.t === 'chop', 200);
    expect(jaka(p)).toBe('chop');
    expect(p.job?.order).toBe(false);
    const k = p.job!.target;
    until(sim, () => sim.st.felled.includes(k), 6000);
    expect(sim.st.felled).toContain(k);

    // dokładnie na progu nie ścina, jedno poniżej progu tak (decyzja jednej sekundy, bez kroków, w których koza by
    // spalała drewno z zapasu)
    for (const [zapas, scina] of [
      [30, false],
      [29, true],
    ] as const) {
      const g = scena({ zaSiatke: true, rodzaje: ['drwal'] });
      ustawZapas(g.sim, zapas);
      prv(g.sim).think(g.p);
      expect(jaka(g.p), `zapas ${zapas}`).toBe(scina ? 'chop' : '-');
    }
    // i nad progiem przez dłużej nie rusza (ogień pali się wolno, zapas zostaje ponad progiem)
    const nad = scena({ zaSiatke: true, rodzaje: ['drwal'] });
    ustawZapas(nad.sim, 33);
    const starty = liczStarty(nad.sim, nad.p);
    for (let n = 0; n < 200; n++) nad.sim.step();
    expect(starty.chop ?? 0).toBe(0);
  });

  it('dwóch drwali nie bierze tego samego drzewa', () => {
    const { sim, ludzie } = scena({ zaSiatke: true, rodzaje: ['drwal'], osoby: 2 });
    const [a, b] = ludzie;
    // stoją w tym samym miejscu, więc najbliższe drzewo jest wspólne
    b.x = a.x;
    b.y = a.y;
    const s = prv(sim);
    s.think(a);
    s.think(b);
    expect(jaka(a)).toBe('chop');
    expect(jaka(b)).toBe('chop');
    expect(a.job!.target).not.toBe(b.job!.target);
    // w biegu nigdy dwie prace ścinania tego samego drzewa
    for (let n = 0; n < 2500; n++) {
      sim.step();
      const cele = sim.st.pawns.filter((q) => q.job?.t === 'chop').map((q) => q.job!.target);
      expect(new Set(cele).size, `krok ${n}`).toBe(cele.length);
    }
  });

  it('nie ścina suchego drzewa przed końcem kroku „ściąć” samouczka, po nim tak', () => {
    // dzień 3, 9:00 bez skończonego samouczka: nowe rodzaje działają (wyjście awaryjne), suche drzewo jest chronione
    const { sim, p } = scena({ rodzaje: ['drwal'], samouczek: false, dzien: 3 });
    const s = prv(sim);
    expect(sim.st.tut.step).toBeLessThan(TUT_STEPS.indexOf('sciete'));
    expect(s.naszTeren(s.trunk[s.dry])).toBe(true);
    const cele: number[] = [];
    const org = s.setJob.bind(s);
    vi.spyOn(s, 'setJob').mockImplementation((pp, j, keep) => {
      if (pp === p && j.t === 'chop') cele.push(j.target);
      org(pp, j, keep);
    });
    for (let n = 0; n < 4000; n++) sim.step();
    // bez przełącznika zostają tylko drzewa w podwórku: inne niż suche (jest ich więcej niż jedno)
    expect(cele.length).toBeGreaterThan(0);
    expect(cele).not.toContain(s.dry);
    expect(sim.st.felled).not.toContain(s.dry);
    // po kroku „ściąć” samouczka suche drzewo jest zwykłym drzewem
    sim.st.tut.step = TUT_STEPS.indexOf('sciete') + 1;
    odnow(sim, p);
    until(sim, () => p.job?.t === 'chop' && p.job.target === s.dry, 4000);
    expect(p.job?.target).toBe(s.dry);
  });

  it('nie ścina drzewa na linii obwodu (pień zamieniłby się w kafelek siatki)', () => {
    const w = zielonkiZPlotem();
    const sim = new Sim(w.w, w.st);
    const linia = liniowe(w.w, w.r);
    expect(linia.length).toBeGreaterThan(0);
    const { sim: s2, p } = scena({ sim, zaSiatke: true, rodzaje: ['drwal'] });
    const s = prv(s2);
    const size = s.w.size;
    // osoba stoi na ulicy przy takim drzewie, więc to ono jest najbliższe
    const { k, ulica } = linia[0];
    p.x = (ulica % size) + 0.5;
    p.y = Math.floor(ulica / size) + 0.5;
    let najblizsze = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < s.w.trees.length; i++) {
      if (s.chopSpot(p, i) < 0) continue;
      const d = s.dist2(p, s.trunk[i]);
      if (d < bd) {
        bd = d;
        najblizsze = i;
      }
    }
    expect(linia.map((x) => x.k)).toContain(najblizsze);
    s.think(p);
    expect(jaka(p)).toBe('chop');
    expect(p.job!.target).not.toBe(k);
    expect(linia.map((x) => x.k)).not.toContain(p.job!.target);
    expect(naLiniiObwodu(size, s.trunk[p.job!.target], (i) => s.yardMask[i] === 1)).toBe(false);
  });
});

describe('naprawy', () => {
  it('łatają dziurę, gdy jest materiał (z polecenia i bez), czas dzielony przez tempo', () => {
    const { sim, p } = scena({ rodzaje: ['naprawy'], skills: { bud: 4 } });
    const f = sim.st.fence!;
    expect(f.holes.some((h) => h.patch <= 0)).toBe(true);
    const mat = () => sim.st.things.filter((t) => t.kind === 'deski' || t.kind === 'zlom').reduce((a, t) => a + t.n, 0);
    const przed = mat();
    until(sim, () => p.job?.t === 'patch', 200);
    expect(jaka(p)).toBe('patch');
    expect(p.job?.order).toBe(false);
    const hole = f.holes.find((h) => h.id === p.job!.target)!;
    // czas łatania: bud 4 daje 1,4 (po pierwszym rankiem)
    until(sim, () => p.job?.t !== 'patch' || p.job.phase === 2, 3000);
    expect(p.job?.phase).toBe(2);
    expect(p.job!.until - p.job!.t0).toBe(Math.round(PATCH_TICKS / 1.4));
    until(sim, () => hole.patch > 0, 3000);
    expect(hole.patch).toBe(PATCH_HP);
    expect(mat()).toBe(przed - 3);
  });

  it('bez materiału na łatę nie kręcą się: godzina gry bez nowych dróg', () => {
    const { sim, p } = scena({ rodzaje: ['naprawy'] });
    sim.st.things = sim.st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'zlom' && t.kind !== 'czesci');
    const starty = liczStarty(sim, p);
    const przed = sim.stats.paths;
    for (let n = 0; n < TICKS_PER_HOUR; n++) sim.step();
    expect(sim.stats.paths - przed).toBeLessThanOrEqual(4);
    expect(starty.patch ?? 0).toBe(0);
    expect(starty.repair ?? 0).toBe(0);
    expect(sim.st.fence!.holes.some((h) => h.patch <= 0)).toBe(true);
    // z materiałem na ziemi rusza od razu (kontrola, że scena sprawdza to, co ma)
    dodaj(sim, 'deski', 3, wolnyKafelek(sim, p, 'podworko'));
    until(sim, () => p.job?.t === 'patch', 200);
    expect(jaka(p)).toBe('patch');
  });

  it('dziura bez miejsca, z którego da się ją łatać, nie kręci się (materiał jest, drogi do łaty nie ma)', () => {
    const { sim, p } = scena({ rodzaje: ['naprawy'] });
    const s = prv(sim);
    const size = s.w.size;
    // wszystkie wolne kafelki podwórka przy dziurach zawalone gruzem
    for (const h of sim.st.fence!.holes)
      for (const t of h.tiles)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const i = t + dy * size + dx;
            if (s.yardMask[i] === 1 && !s.coreBlocked[i] && !sim.st.things.some((x) => x.y * size + x.x === i))
              dodaj(sim, 'smieci', 1, i);
          }
    const starty = liczStarty(sim, p);
    const przed = sim.stats.paths;
    for (let n = 0; n < TICKS_PER_HOUR; n++) sim.step();
    expect(starty.patch ?? 0).toBe(0);
    expect(sim.stats.paths - przed).toBeLessThanOrEqual(4);
    expect(sim.st.fence!.holes.some((h) => h.patch <= 0)).toBe(true);
  });

  it('materiał na łatę i naprawę bierze tylko z naszego terenu, także z przełącznikiem; polecenie może z ulicy', () => {
    const { sim, p } = scena({ rodzaje: ['naprawy'], zaSiatke: true });
    const s = prv(sim);
    sim.st.things = sim.st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'zlom' && t.kind !== 'czesci');
    dodaj(sim, 'deski', 6, wolnyKafelek(sim, p, 'poza'));
    const hole = sim.st.fence!.holes.find((h) => h.patch <= 0)!;
    const starty = liczStarty(sim, p);
    const przed = sim.stats.paths;
    for (let n = 0; n < TICKS_PER_HOUR; n++) {
      sim.step();
      expect(s.naszTeren(kafelek(sim, p)), `krok ${n}`).toBe(true);
    }
    expect(starty.patch ?? 0).toBe(0);
    expect(sim.stats.paths - przed).toBeLessThanOrEqual(4);
    // wprost: łata bez polecenia nie zaczyna się, z polecenia tak (gracz może posłać po materiał na ulicę)
    odnow(sim, p);
    expect(s.startPatch(p, hole, false)).toBe(false);
    expect(jaka(p)).toBe('-');
    expect(s.startPatch(p, hole, true)).toBe(true);
    expect(p.job?.order).toBe(true);
  });

  it('łata i naprawa: materiał z podwórka, choć na ulicy leży bliżej', () => {
    const uklad = () => {
      const sc = scena({ rodzaje: ['naprawy'], zaSiatke: true });
      const { sim, p } = sc;
      const s = prv(sim);
      const size = s.w.size;
      sim.st.things = sim.st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'zlom' && t.kind !== 'czesci');
      const wolny = (i: number) =>
        !s.coreBlocked[i] && s.reg[i] === s.regionOf(p) && !sim.st.things.some((t) => t.y * size + t.x === i);
      // osoba na podwórku tuż przy siatce, sterta na ulicy tuż za nią
      let przy = -1;
      let ulica = -1;
      for (let a = 0; a < size * size && przy < 0; a++) {
        if (s.yardMask[a] !== 1 || !wolny(a) || s.fenceMask[a] === 1) continue;
        for (let dy = -2; dy <= 2 && przy < 0; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const b = a + dy * size + dx;
            if (b > 0 && b < size * size && !s.insideAt(b) && wolny(b) && s.fenceMask[b] !== 1) {
              przy = a;
              ulica = b;
              break;
            }
          }
      }
      expect(przy).toBeGreaterThanOrEqual(0);
      p.x = (przy % size) + 0.5;
      p.y = Math.floor(przy / size) + 0.5;
      // dalekie miejsce na podwórku (min. 10 m od osoby)
      const daleko = [...Array(size * size).keys()].find(
        (i) => s.yardMask[i] === 1 && wolny(i) && s.fenceMask[i] !== 1 && s.dist2(p, i) >= 100,
      )!;
      expect(daleko).toBeDefined();
      expect(s.dist2(p, ulica)).toBeLessThan(s.dist2(p, daleko));
      return { ...sc, s, ulica, daleko };
    };

    // łata: 3 deski na podwórku, 3 deski bliżej na ulicy
    const a = uklad();
    const hole = a.sim.st.fence!.holes.find((h) => h.patch <= 0)!;
    const zUlicy = dodaj(a.sim, 'deski', 3, a.ulica);
    const zPodworka = dodaj(a.sim, 'deski', 3, a.daleko);
    a.s.think(a.p);
    expect(jaka(a.p)).toBe('patch');
    expect(a.p.job?.from).toBe(zPodworka.id);
    until(a.sim, () => hole.patch > 0, 4000);
    expect(hole.patch).toBeGreaterThan(0);
    expect(zUlicy.n).toBe(3);
    expect(a.sim.st.things).toContain(zUlicy);

    // naprawa podłogi (2 deski): to samo
    const b = uklad();
    for (const h of b.sim.st.fence!.holes) h.patch = 100;
    b.s.rebuild();
    const zUlicy2 = dodaj(b.sim, 'deski', 2, b.ulica);
    const zPodworka2 = dodaj(b.sim, 'deski', 2, b.daleko);
    const d = b.sim.st.damage.find((x) => x.kind === 'podloga')!;
    b.sim.st.apts.find((x) => x.apt === d.apt)!.ours = true;
    b.s.think(b.p);
    expect(jaka(b.p)).toBe('repair');
    expect(b.p.job?.from).toBe(zPodworka2.id);
    until(b.sim, () => d.fixed, 8000);
    expect(d.fixed).toBe(true);
    expect(zUlicy2.n).toBe(2);
    expect(b.sim.st.things).toContain(zUlicy2);
  });

  it('naprawia uszkodzenie tylko w naszym mieszkaniu, nie wzmacnia siatki', () => {
    const { sim, p } = scena({ rodzaje: ['naprawy'] });
    const st = sim.st;
    const s = prv(sim);
    for (const h of st.fence!.holes) h.patch = 100; // dziury załatane: zostają uszkodzenia
    s.rebuild();
    const kloc = wolnyKafelek(sim, p, 'podworko');
    dodaj(sim, 'zlom', 4, kloc);
    dodaj(sim, 'czesci', 4, kloc + 1);
    dodaj(sim, 'deski', 6, kloc + 2);
    const mieszkanie = st.damage[0].apt;
    const nasze = () => st.apts.find((a) => a.apt === mieszkanie)!;
    expect(nasze().ours).toBe(false);
    const starty = liczStarty(sim, p);
    for (let n = 0; n < 600; n++) sim.step();
    expect(starty.repair ?? 0).toBe(0);
    expect(starty.brace ?? 0).toBe(0);
    expect(st.damage.every((d) => !d.fixed)).toBe(true);
    // mieszkanie zajęte przez zarząd: naprawia, bez polecenia
    nasze().ours = true;
    const doNaprawy = st.damage.filter((d) => d.apt === mieszkanie).length;
    until(sim, () => st.damage.filter((d) => d.apt === mieszkanie && d.fixed).length === doNaprawy, 12000);
    expect(st.damage.filter((d) => d.apt === mieszkanie && d.fixed).length).toBe(doNaprawy);
    expect(starty.repair).toBeGreaterThan(0);
    expect(starty.brace ?? 0).toBe(0);
  });
});

describe('noszenie', () => {
  /** gra na Lanciego z otwartym blokiem bez lokatorów i pracującą osobą; w budynku leży sterta desek */
  function zBlokiem(zaSiatke: boolean, otoczony: boolean, godzina = 9, drewno = false) {
    const w = demoWorld('lanciego');
    const { bid, door } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k, ['blok']);
    const sim = newGame('lanciego');
    sim.lokatorzy = pusto(w);
    const sc = scena({ sim, rodzaje: [], godzina, zaSiatke });
    const { p } = sc;
    sim.push({ t: 'open', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door' && p.job?.t !== 'go', 4000);
    const budynek = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    expect(budynek.otwarty).toBe(true);
    odnow(sim, p);
    p.needs!.food = 90;
    p.needs!.warm = 60;
    // noszenie włączone dopiero teraz, żeby osoba nie szła po łup z tego, co zostało po otwieraniu drzwi
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'noszenie', prio: 1 });
    sim.step();
    odnow(sim, p);
    if (otoczony) sim.st.plot = { bids: [bid] };
    const s = prv(sim);
    const size = s.w.size;
    const ulica = wolnyKafelek(sim, p, 'poza');
    const i = [...Array(size * size).keys()].find(
      (t) =>
        w.bid[t] === bid &&
        !s.coreBlocked[t] &&
        s.reg[t] === s.regionOf(p) &&
        !sim.st.things.some((x) => x.y * size + x.x === t),
    );
    expect(i, 'kafelek w budynku, do którego da się dojść').toBeDefined();
    // więcej niż naręcze (CARRY 6): dwa kursy po tę samą stertę, więc praca musi zostać „bez polecenia” do końca
    const sterta = dodaj(sim, drewno ? 'drewno' : 'deski', drewno ? 6 : 8, i!);
    return { sim, p, s, w, bid, sterta, ulica };
  }

  it('wnosi łup z otoczonego budynku bez przełącznika, praca bez polecenia przez wszystkie kursy', () => {
    const { sim, p, s, sterta, w, bid } = zBlokiem(false, true);
    expect(s.naszTeren(sterta.y * w.size + sterta.x)).toBe(true);
    expect(s.insideAt(sterta.y * w.size + sterta.x)).toBe(false);
    s.think(p);
    expect(jaka(p)).toBe('carry');
    expect(p.job?.order).toBe(false);
    const wBudynku = () =>
      sim.st.things.filter((t) => t.kind === 'deski' && w.bid[t.y * w.size + t.x] === bid).reduce((a, t) => a + t.n, 0);
    const naPodworku = () =>
      sim.st.things
        .filter((t) => t.kind === 'deski' && s.yardMask[t.y * w.size + t.x] === 1)
        .reduce((a, t) => a + t.n, 0);
    const przed = naPodworku();
    for (let n = 0; n < 6000 && (wBudynku() > 0 || p.job?.t === 'carry'); n++) {
      sim.step();
      if (p.job?.t === 'carry') expect(p.job.order, `krok ${n}`).toBe(false);
    }
    expect(wBudynku()).toBe(0);
    expect(naPodworku()).toBe(przed + 8);
  });

  it('z nieotoczonego budynku tylko z przełącznikiem i tylko za dnia', () => {
    const bez = zBlokiem(false, false);
    bez.s.think(bez.p);
    expect(jaka(bez.p)).toBe('-');
    const z = zBlokiem(true, false);
    z.s.think(z.p);
    expect(jaka(z.p)).toBe('carry');
    expect(z.p.job?.order).toBe(false);
    // nocą nie (poza wydaniem polecenia)
    const noc = zBlokiem(true, false, 23);
    noc.s.think(noc.p);
    expect(jaka(noc.p)).toBe('-');
  });

  it('ogień nocą wnosi drewno z otoczonego budynku (nasz teren) i nie przerywa się, z nieotoczonego nie', () => {
    const otoczony = zBlokiem(false, true, 23, true);
    otoczony.p.needs!.rest = 95; // wyspany, żeby nie szedł spać
    otoczony.s.think(otoczony.p);
    expect(jaka(otoczony.p)).toBe('haul');
    expect(otoczony.p.job?.order).toBe(false);
    const wBudynku = () =>
      otoczony.sim.st.things
        .filter((t) => t.kind === 'drewno' && otoczony.w.bid[t.y * otoczony.w.size + t.x] === otoczony.bid)
        .reduce((a, t) => a + t.n, 0);
    for (let n = 0; n < 3000 && wBudynku() > 0; n++) otoczony.sim.step();
    expect(wBudynku()).toBe(0);
    // praca przy stercie w otoczonym budynku nie przerywa się o północy (work(): noc kończy tylko pracę poza naszym terenem)
    const k = zBlokiem(false, true, 23, true);
    const sterta = k.sterta;
    const tile = sterta.y * k.w.size + sterta.x;
    k.p.x = (tile % k.w.size) + 0.5;
    k.p.y = Math.floor(tile / k.w.size) + 0.5;
    sterta.by = k.p.id;
    const j = k.s.newJob('haul', sterta.id, tile, false);
    k.p.job = j;
    k.sim.st.tick = tickO(2, 23);
    expect(k.s.work(k.p, j)).toBe(true);
    expect(k.p.carry).toBeGreaterThan(0);
    // ten sam budynek bez wspólnego płotu: nocą nikt nie idzie tam po drewno
    const obcy = zBlokiem(true, false, 23, true);
    obcy.p.needs!.rest = 95;
    obcy.s.think(obcy.p);
    expect(jaka(obcy.p)).toBe('-');
  });

  it('łup na ulicy: z przełącznikiem za dnia, bez niego nie', () => {
    for (const [zaSiatke, godzina, rusza] of [
      [false, 9, false],
      [true, 9, true],
      [true, 23, false],
    ] as const) {
      const { sim, p } = scena({ rodzaje: ['noszenie'], zaSiatke, godzina });
      const s = prv(sim);
      dodaj(sim, 'deski', 4, wolnyKafelek(sim, p, 'poza'));
      s.think(p);
      expect(jaka(p), `przełącznik ${zaSiatke}, ${godzina}:00`).toBe(rusza ? 'carry' : '-');
    }
  });

  it('kolejny kurs po łup (lootNear) bez polecenia nie sięga po ulicę, z polecenia tak', () => {
    const { sim, p } = scena({ rodzaje: ['noszenie'] });
    const s = prv(sim);
    const ulica = wolnyKafelek(sim, p, 'poza');
    const sterta = dodaj(sim, 'deski', 4, ulica);
    expect(s.lootNear(p, ulica, false)).toBeUndefined();
    expect(s.lootNear(p, ulica, true)).toBe(sterta);
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
    sim.step();
    expect(s.lootNear(p, ulica, false)).toBe(sterta);
    sim.st.tick = tickO(2, 23);
    expect(s.lootNear(p, ulica, false)).toBeUndefined();
  });

  it('bez miejsca na podwórku nie zaczyna noszenia, które i tak by się nie udało', () => {
    const { sim, p } = scena({ rodzaje: ['noszenie'], zaSiatke: true });
    const s = prv(sim);
    dodaj(sim, 'czesci', 4, wolnyKafelek(sim, p, 'poza'));
    // podwórko zawalone: żaden wolny kafelek na łup
    const podworko = (s.w as World & { fence: { yard: number[] } }).fence.yard;
    const size = s.w.size;
    for (const i of podworko)
      if (!s.coreBlocked[i] && !sim.st.things.some((t) => t.y * size + t.x === i)) dodaj(sim, 'smieci', 1, i);
    const starty = liczStarty(sim, p);
    const przed = sim.stats.paths;
    for (let n = 0; n < 400; n++) sim.step();
    expect(starty.carry ?? 0).toBe(0);
    expect(sim.stats.paths - przed).toBeLessThanOrEqual(4);
  });
});

describe('za siatką', () => {
  it('bez przełącznika nikt sam nie wychodzi za siatkę, także po drewno; z przełącznikiem tylko za dnia', () => {
    // wszystko włączone, drewno i łup na ulicy, drzewa za siatką: przez pół dnia osoba nie opuszcza naszego terenu
    const bez = scena({ rodzaje: ['drwal', 'naprawy', 'noszenie', 'warsztat', 'szaber'] });
    const s = prv(bez.sim);
    s.addWood(wolnyKafelek(bez.sim, bez.p, 'poza'), 6);
    dodaj(bez.sim, 'deski', 4, wolnyKafelek(bez.sim, bez.p, 'poza'));
    const ulicaPrzed = bez.sim.st.things.filter((t) => !s.insideAt(t.y * s.w.size + t.x)).map((t) => t.id);
    expect(ulicaPrzed.length).toBeGreaterThan(0);
    for (let n = 0; n < 6 * TICKS_PER_HOUR; n++) {
      bez.sim.step();
      expect(s.naszTeren(kafelek(bez.sim, bez.p)), `krok ${n}`).toBe(true);
    }
    for (const id of ulicaPrzed) expect(bez.sim.st.things.some((t) => t.id === id)).toBe(true);

    // z przełącznikiem za dnia: idzie po drewno z ulicy (ogień)
    const dzien = scena({ zaSiatke: true });
    const ulica = wolnyKafelek(dzien.sim, dzien.p, 'poza');
    prv(dzien.sim).addWood(ulica, 6);
    prv(dzien.sim).think(dzien.p);
    expect(jaka(dzien.p)).toBe('haul');
    expect(dzien.p.job?.tile).toBe(ulica);
    // nocą nie, nawet z przełącznikiem
    const noc = scena({ zaSiatke: true, godzina: 23 });
    prv(noc.sim).addWood(wolnyKafelek(noc.sim, noc.p, 'poza'), 6);
    prv(noc.sim).think(noc.p);
    expect(jaka(noc.p)).toBe('-');
    // przełącznik jednej osoby nie daje wyjścia drugiej
    const dwie = scena({ osoby: 2 });
    dwie.sim.push({ t: 'zasiatke', ids: [], osoba: dwie.ludzie[0].person, on: true });
    dwie.sim.step();
    const [a, b] = dwie.ludzie;
    odnow(dwie.sim, a);
    odnow(dwie.sim, b);
    prv(dwie.sim).addWood(wolnyKafelek(dwie.sim, a, 'poza'), 6);
    prv(dwie.sim).think(b);
    expect(jaka(b)).toBe('-');
    prv(dwie.sim).think(a);
    expect(jaka(a)).toBe('haul');
  });

  it('ścięcie na polecenie za siatką: ta sama osoba wnosi całe drewno z drzewa', () => {
    const { sim, p } = scena({ rodzaje: [] });
    const s = prv(sim);
    const size = s.w.size;
    // najbliższe drzewo za siatką, do którego da się dojść
    let k = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < s.w.trees.length; i++) {
      if (s.naszTeren(s.trunk[i]) || s.chopSpot(p, i) < 0) continue;
      const d = s.dist2(p, s.trunk[i]);
      if (d < bd) {
        bd = d;
        k = i;
      }
    }
    expect(k).toBeGreaterThanOrEqual(0);
    const pien = s.trunk[k];
    const drewno = woodFrom(s.w.trees[k]);
    // drewno w obrębie siatki bez kozy (koza spala część w trakcie próby)
    const wSiatce = (): number =>
      sim.st.things.filter((t) => t.kind === 'drewno' && s.naszTeren(t.y * size + t.x)).reduce((a, t) => a + t.n, 0) +
      p.carry;
    const przed = wSiatce();
    const widziane: string[] = [];
    sim.push({ t: 'chop', ids: [p.id], tree: k });
    until(
      sim,
      () => {
        const j = jaka(p) + (p.job?.order ? '!' : '');
        if (widziane[widziane.length - 1] !== j) widziane.push(j);
        const nadal = sim.st.things.some(
          (t) =>
            t.kind === 'drewno' &&
            Math.max(Math.abs(t.x - (pien % size)), Math.abs(t.y - Math.floor(pien / size))) <= 4 &&
            !s.naszTeren(t.y * size + t.x),
        );
        return sim.st.felled.includes(k) && !nadal && p.carry === 0;
      },
      8000,
    );
    expect(sim.st.felled).toContain(k);
    // wniosła cały pień drewna do obrębu siatki, jedna osoba, kursy z polecenia
    expect(wSiatce() - przed).toBe(drewno);
    expect(widziane).toContain('chop!');
    expect(widziane).toContain('haul!');
    expect(widziane.indexOf('haul!')).toBeGreaterThan(widziane.indexOf('chop!'));
    expect(sim.st.things.filter((t) => t.kind === 'drewno' && !s.naszTeren(t.y * size + t.x))).toHaveLength(0);
  });

  it('próg drewna liczy tylko drewno w obrębie siatki', () => {
    const { sim, p } = scena({ rodzaje: ['drwal'] });
    const s = prv(sim);
    expect(s.zapasDrewna()).toBe(3);
    // 40 sztuk na ulicy zapasu nie zmienia
    s.addWood(wolnyKafelek(sim, p, 'poza'), 40);
    expect(s.zapasDrewna()).toBe(3);
    const starty = liczStarty(sim, p);
    until(sim, () => p.job?.t === 'chop', 200);
    // ścina drzewo w podwórku, a nie stoi przy „pełnym” zapasie, którego nikt nie wniesie
    expect(jaka(p)).toBe('chop');
    expect(s.naszTeren(s.trunk[p.job!.target])).toBe(true);
    expect(starty.chop).toBe(1);

    // drewno luzem na podwórku i w składzie liczy się, w kozie też
    const g = scena({ rodzaje: ['drwal'] });
    const gs = prv(g.sim);
    gs.addWood(wolnyKafelek(g.sim, g.p, 'podworko'), 12);
    expect(gs.zapasDrewna()).toBe(15);
    g.p.carry = 0;
    ustawZapas(g.sim, 30);
    const g2 = liczStarty(g.sim, g.p);
    for (let n = 0; n < 300; n++) g.sim.step();
    expect(g2.chop ?? 0).toBe(0);
  });

  it('naszTeren i mozeTam: podwórko i otoczony budynek zawsze, ulica tylko z przełącznikiem i za dnia', () => {
    const { sim, p } = scena({ zaSiatke: true });
    const s = prv(sim);
    const podworko = wolnyKafelek(sim, p, 'podworko');
    const ulica = wolnyKafelek(sim, p, 'poza');
    expect(s.naszTeren(podworko)).toBe(true);
    expect(s.naszTeren(ulica)).toBe(false);
    expect(s.mozeTam(p, podworko)).toBe(true);
    expect(s.mozeTam(p, ulica)).toBe(true);
    sim.st.tick = tickO(2, 23);
    expect(s.mozeTam(p, ulica)).toBe(false);
    expect(s.mozeTam(p, podworko)).toBe(true);
    const bez = scena();
    expect(prv(bez.sim).mozeTam(bez.p, wolnyKafelek(bez.sim, bez.p, 'poza'))).toBe(false);
    // budynek za wspólnym płotem to nasz teren
    const w = demoWorld('lanciego');
    const budynek = w.buildings.find((b) => b.id !== w.hq && b.entrances.length)!;
    const kafel = w.bid.indexOf(budynek.id);
    expect(prv(bez.sim).naszTeren(kafel)).toBe(false);
    bez.sim.st.plot = { bids: [budynek.id] };
    expect(prv(bez.sim).naszTeren(kafel)).toBe(true);
  });
});

describe('determinizm', () => {
  it('pół doby pracy trzech rodzajów: ten sam skrót, zapis i wczytanie w połowie nie zmieniają przebiegu', () => {
    const wynik = (przerwa: boolean) => {
      const { sim } = scena({ zaSiatke: true, rodzaje: ['drwal', 'naprawy', 'noszenie'], osoby: 4 });
      for (let n = 0; n < 4800; n++) sim.step();
      const dalej = przerwa ? new Sim(sim.w, JSON.parse(JSON.stringify(sim.st))) : sim;
      for (let n = 0; n < 4800; n++) dalej.step();
      return dalej;
    };
    const a = wynik(false);
    const b = wynik(false);
    const c = wynik(true);
    // zarząd naprawdę pracował: ścięte drzewa, załatane dziury
    expect(a.st.felled.length).toBeGreaterThan(0);
    expect(a.st.fence!.holes.some((h) => h.patch > 0)).toBe(true);
    expect(b.hash()).toBe(a.hash());
    expect(c.hash()).toBe(a.hash());
  });
});

describe('pilne potrzeby', () => {
  it('przy pilnej potrzebie nowe rodzaje nie ruszają (urgent przerwałby je w następnej sekundzie), po niej tak', () => {
    const { sim, p } = scena({ zaSiatke: true, rodzaje: ['drwal'] });
    // głodny, a nie ma co zjeść: potrzeba zostaje pilna
    sim.st.things = sim.st.things.filter((t) => t.kind !== 'jedzenie' && t.kind !== 'posilek');
    p.needs!.food = 5;
    const starty = liczStarty(sim, p);
    for (let n = 0; n < 200; n++) {
      p.needs!.food = 5;
      sim.step();
    }
    expect(starty.chop ?? 0).toBe(0);
    expect(starty.haul ?? 0).toBe(0);
    p.needs!.food = 90;
    until(sim, () => p.job?.t === 'chop', 400);
    expect(jaka(p)).toBe('chop');
  });
});

describe('tryb zombie', () => {
  /** gra w trybie zombie bez szwendaczy, z jedną otwartą dziurą (reszta załatana); materiał na łatę leży na podwórku od startu */
  function zDziura() {
    const sc = scena({ tryb: 'zombie', rodzaje: ['naprawy'] });
    const { sim } = sc;
    const st = sim.st;
    const s = prv(sim);
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    // w trybie zombie siatka startuje cała: jedna dziura otwarta, reszta załatana
    const dziura = st.fence!.holes[0];
    for (const h of st.fence!.holes) h.patch = h === dziura ? 0 : 100;
    s.rebuild();
    return { ...sc, s, st, dziura };
  }

  it('automat nie łata dziury, gdy szwendacz jest bliżej niż 10 m; z polecenia łata', () => {
    const { sim, p, s, st, dziura } = zDziura();
    // bez szwendacza łata
    s.think(p);
    expect(jaka(p)).toBe('patch');
    expect(p.job?.order).toBe(false);
    odnow(sim, p);
    // szwendacz przy dziurze: automat czeka, nie kręci się
    const z = spawnZombie(st, s.w, dziura.tiles[0], 0);
    expect(s.szwendaczBlisko(dziura.tiles[0])).toBe(true);
    const starty = liczStarty(sim, p);
    const przed = sim.stats.paths;
    s.think(p);
    expect(jaka(p)).toBe('-');
    for (let n = 0; n < 60; n++) {
      z.x = (dziura.tiles[0] % s.w.size) + 0.5;
      z.y = Math.floor(dziura.tiles[0] / s.w.size) + 0.5;
      z.job = null;
      sim.step();
    }
    expect(starty.patch ?? 0).toBe(0);
    expect(sim.stats.paths - przed).toBeLessThanOrEqual(2);
    // z polecenia gracz może
    sim.push({ t: 'patch', ids: [p.id], hole: dziura.id });
    sim.step();
    expect(jaka(p)).toBe('patch');
    expect(p.job?.order).toBe(true);
  });

  it('szwendaczBlisko: tylko w trybie zombie, strefa mniejsza niż 10 kafelków (Chebyshev); przySiatce do 3 kafelków', () => {
    const { s, st, dziura } = zDziura();
    const size = s.w.size;
    const t = dziura.tiles[0];
    const x = t % size;
    const y = Math.floor(t / size);
    const z = spawnZombie(st, s.w, t, 0);
    const na = (dx: number, dy: number) => {
      z.x = x + dx + 0.5;
      z.y = y + dy + 0.5;
      return s.szwendaczBlisko(t);
    };
    expect(na(0, 0)).toBe(true);
    expect(na(9, -9)).toBe(true);
    expect(na(10, 0)).toBe(false);
    expect(na(0, 10)).toBe(false);
    expect(s.szwendaczBlisko(t, 4)).toBe(false);
    // martwy albo na wyprawie nie liczy się
    z.x = x + 0.5;
    z.y = y + 0.5;
    z.away = true;
    expect(s.szwendaczBlisko(t)).toBe(false);
    z.away = false;
    expect(s.szwendaczBlisko(t)).toBe(true);
    // przy siatce
    expect(s.przySiatce(t)).toBe(true);
    expect(s.przySiatce(t + 3)).toBe(true);
    const daleko = s.w.size * (y + 40) + x;
    expect(s.przySiatce(daleko)).toBe(false);
    // w zwykłym trybie szwendacz nic nie znaczy
    st.mode = 'zwykly';
    expect(s.szwendaczBlisko(t)).toBe(false);
  });

  it('praca bez polecenia przy siatce (noszenie drewna z ulicy) pomijana przy szwendaczu', () => {
    const { sim, p, s, st } = zDziura();
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
    sim.step();
    odnow(sim, p);
    const size = s.w.size;
    // sterta tuż za siatką, przy której jest dziura
    const stos = [...s.fenceMask.keys()]
      .filter((i) => s.fenceMask[i] === 1)
      .flatMap((i) => [i - size, i + size, i - 1, i + 1])
      .find(
        (i) =>
          !s.insideAt(i) &&
          !s.coreBlocked[i] &&
          s.reg[i] === s.regionOf(p) &&
          !st.things.some((t) => t.y * size + t.x === i),
      );
    expect(stos).toBeDefined();
    expect(s.przySiatce(stos!)).toBe(true);
    s.addWood(stos!, 6);
    spawnZombie(st, s.w, stos!, 0);
    s.think(p);
    expect(jaka(p)).toBe('-');
    // bez szwendacza ta sama sterta jest do zabrania
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    s.think(p);
    expect(jaka(p)).toBe('haul');
  });
});

/** Plan budowy na wolnym miejscu: zasieki na kafelku siatki albo ogródek na podwórku (jak plan z menu budowy). */
function planBudowy(sim: Sim, kind: 'zasieki' | 'ogrodek') {
  const s = prv(sim);
  const w = s.w;
  const kafle = kind === 'zasieki' ? (fenceShape(w)?.tiles ?? []) : (fenceShape(w)?.yard ?? []);
  let at: { x: number; y: number; rot: number } | null = null;
  for (const rot of [0, 1])
    for (const i of kafle)
      if (!at && canPlace(sim.st, w, kind, i % w.size, Math.floor(i / w.size), rot).ok)
        at = { x: i % w.size, y: Math.floor(i / w.size), rot };
  if (!at) throw new Error(`brak miejsca na ${kind}`);
  return { at, tile: at.y * w.size + at.x };
}

describe('tryb zombie: budowa i zlecenia poza naszym terenem', () => {
  /** zombie, osoba z budową (i przełącznikiem, jeśli trzeba), bez szwendaczy */
  function zScena(rodzaje: RodzajPracy[], zaSiatke = false) {
    const sc = scena({ tryb: 'zombie', rodzaje, zaSiatke });
    sc.sim.st.pawns = sc.sim.st.pawns.filter((q) => q.kind !== 'zombie');
    return { ...sc, s: prv(sc.sim), st: sc.sim.st };
  }

  it('automat nie buduje zasieków przy szwendaczu (bliżej niż 10 m), bez niego buduje; z polecenia buduje', () => {
    const { sim, p, s, st } = zScena(['budowa']);
    const { at, tile } = planBudowy(sim, 'zasieki');
    sim.push({ t: 'build', ids: [], kind: 'zasieki', ...at });
    sim.step();
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    const plan = st.builds[0];
    plan.have = { ...BUILDS.zasieki.cost };
    expect(s.przySiatce(tile)).toBe(true);
    odnow(sim, p);
    spawnZombie(st, s.w, tile, 0);
    const starty = liczStarty(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('-');
    expect(plan.by).toBe(-1);
    for (let n = 0; n < 40; n++) {
      // szwendacz stoi przy zasiekach przez dwie sekundy
      for (const z of st.pawns.filter((q) => q.kind === 'zombie')) {
        z.x = (tile % s.w.size) + 0.5;
        z.y = Math.floor(tile / s.w.size) + 0.5;
        z.job = null;
      }
      sim.step();
    }
    expect(starty.build ?? 0).toBe(0);
    // szwendacz poszedł sobie: buduje
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    odnow(sim, p);
    s.think(p);
    expect(jaka(p)).toBe('build');
    expect(p.job?.order).toBe(false);
    // z polecenia także przy szwendaczu
    odnow(sim, p);
    spawnZombie(st, s.w, tile, 0);
    sim.push({ t: 'build', ids: [p.id], kind: 'zasieki', ...at });
    sim.step();
    expect(jaka(p)).toBe('build');
    expect(p.job?.order).toBe(true);
  });

  it('dokańczanie wspólnego płotu bez polecenia też omija szwendacza przy stanowisku', () => {
    const { p, s, st } = zScena([]);
    const size = s.w.size;
    // stanowisko płotu: wolny kafelek podwórka tuż przy siatce
    const stand = [...Array(size * size).keys()].find(
      (i) =>
        s.yardMask[i] === 1 &&
        s.fenceMask[i] !== 1 &&
        !s.coreBlocked[i] &&
        s.reg[i] === s.regionOf(p) &&
        s.przySiatce(i) &&
        !st.things.some((t) => t.y * size + t.x === i),
    )!;
    expect(stand).toBeDefined();
    st.plot = {
      bids: [],
      plan: { bid: 0, need: { zlom: 4 }, have: { zlom: 4 }, work: 0, total: 10, by: -1, stand, wariant: 'mieszany' },
    };
    spawnZombie(st, s.w, stand, 0);
    expect(s.startPlot(p, false)).toBe(false);
    expect(jaka(p)).toBe('-');
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    expect(s.startPlot(p, false)).toBe(true);
    expect(p.job?.order).toBe(false);
  });

  it('z przełącznikiem zlecenie poza naszym terenem tylko bez szwendacza bliżej niż 10 m od celu (mozeTam)', () => {
    // łup i drewno na ulicy, dalej niż 3 kafelki od siatki: z szwendaczem obok nikt po nie nie idzie, bez niego tak
    for (const [co, praca] of [
      ['deski', 'carry'],
      ['drewno', 'haul'],
    ] as const) {
      const { sim, p, s, st } = zScena(['noszenie'], true);
      const u = ulicaDaleko(sim, p);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(s.przySiatce(u), co).toBe(false);
      expect(s.mozeTam(p, u), co).toBe(true);
      if (co === 'deski') dodaj(sim, 'deski', 4, u);
      else s.addWood(u, 6);
      const z = spawnZombie(st, s.w, u, 0);
      z.x = (u % s.w.size) + 5.5; // pięć kafelków obok
      z.y = Math.floor(u / s.w.size) + 0.5;
      expect(s.szwendaczBlisko(u), co).toBe(true);
      expect(s.mozeTam(p, u), co).toBe(false);
      s.think(p);
      expect(jaka(p), `${co} przy szwendaczu`).toBe('-');
      st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
      s.think(p);
      expect(jaka(p), `${co} bez szwendacza`).toBe(praca);
    }
    // na naszym terenie szwendacz za siatką tej reguły nie uruchamia
    const { sim, p, s, st } = zScena([], true);
    const podworko = wolnyKafelek(sim, p, 'podworko');
    const z = spawnZombie(st, s.w, podworko, 0);
    z.x = (podworko % s.w.size) + 2.5;
    expect(s.szwendaczBlisko(podworko)).toBe(true);
    expect(s.mozeTam(p, podworko)).toBe(true);
  });

  it('z przełącznikiem nie wychodzi też wtedy, gdy szwendacz jest przy osobie albo przy wyjściu za bramę, choć cel jest czysty', () => {
    for (const gdzie of ['przy osobie', 'przy bramie'] as const) {
      const { sim, p, s, st } = zScena(['noszenie'], true);
      const u = ulicaDaleko(sim, p, 12, 14);
      expect(u, gdzie).toBeGreaterThanOrEqual(0);
      dodaj(sim, 'deski', 4, u);
      expect(s.mozeTam(p, u), `${gdzie}, bez szwendacza`).toBe(true);
      const miejsce = gdzie === 'przy osobie' ? s.tileOf(p) : s.exitTile;
      const z = spawnZombie(st, s.w, miejsce, 0);
      z.x = (miejsce % s.w.size) + 0.5;
      z.y = Math.floor(miejsce / s.w.size) + 0.5;
      // sam cel jest daleko od szwendacza, a mimo to zlecenia nie ma
      expect(s.szwendaczBlisko(u), gdzie).toBe(false);
      expect(s.mozeTam(p, u), gdzie).toBe(false);
      s.think(p);
      expect(jaka(p), gdzie).toBe('-');
      st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
      s.think(p);
      expect(jaka(p), `${gdzie}, po odejściu szwendacza`).toBe('carry');
    }
  });

  it('drwal z przełącznikiem omija drzewo, przy którym stoi szwendacz, i bierze inne', () => {
    const { sim, p, s, st } = zScena(['drwal'], true);
    // drzewa w podwórku i blisko bramy albo osoby ścięte, żeby najbliższe było za siatką i dalej niż 10 m od bramy
    // i od osoby (inaczej szwendacz przy drzewie byłby też przy wyjściu albo przy osobie)
    const size = s.w.size;
    const daleko = (a: number, b: number) =>
      Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size))) >= 12;
    for (let k = 0; k < s.w.trees.length; k++)
      if (s.naszTeren(s.trunk[k]) || !daleko(s.trunk[k], s.exitTile) || !daleko(s.trunk[k], s.tileOf(p)))
        st.felled.push(k);
    st.felled.sort((a, b) => a - b);
    s.think(p);
    expect(jaka(p)).toBe('chop');
    const k1 = p.job!.target;
    const t1 = s.trunk[k1];
    expect(s.naszTeren(t1)).toBe(false);
    odnow(sim, p);
    const z = spawnZombie(st, s.w, t1, 0);
    z.x = (t1 % s.w.size) + 0.5;
    z.y = Math.floor(t1 / s.w.size) + 0.5;
    s.think(p);
    expect(jaka(p)).toBe('chop');
    expect(p.job!.target).not.toBe(k1);
    expect(s.szwendaczBlisko(s.trunk[p.job!.target])).toBe(false);
  });

  it('praca bez polecenia osoby poza naszym terenem przerywa się, gdy szwendacz jest bliżej niż 10 m od niej', () => {
    /** praca ścinania w toku (do końca daleko) osoby stojącej na ulicy; szwendacz `dx` kafelków obok */
    const trwa = (order: boolean, dx: number | null, naTerenie = false): boolean => {
      const { sim, p, s, st } = zScena([], true);
      const tile = naTerenie ? wolnyKafelek(sim, p, 'podworko') : ulicaDaleko(sim, p);
      p.x = (tile % s.w.size) + 0.5;
      p.y = Math.floor(tile / s.w.size) + 0.5;
      p.path = [];
      p.pi = 0;
      st.tick = tickO(2, 12);
      if (dx !== null) {
        const z = spawnZombie(st, s.w, tile, 0);
        z.x = p.x + dx;
        z.y = p.y;
      }
      const j = s.newJob('chop', 0, tile, order, 1);
      j.until = st.tick + 100000;
      p.job = j;
      return s.work(p, j);
    };
    expect(trwa(false, 5)).toBe(false); // zbliża się szwendacz: wraca
    expect(trwa(false, 9)).toBe(false);
    expect(trwa(false, 12)).toBe(true); // dalej niż 10 m: pracuje
    expect(trwa(false, null)).toBe(true);
    expect(trwa(true, 5)).toBe(true); // z polecenia gracz decyduje
    expect(trwa(false, 5, true)).toBe(true); // na naszym terenie ta reguła nie działa
  });

  it('w drodze za siatkę praca bez polecenia przerywa się, gdy szwendacz zbliży się do osoby (dalej niż zasięg obrony, bliżej niż 10 m)', () => {
    const przebieg = (szwendacz: boolean): string => {
      const { sim, p, s, st } = zScena([], true);
      const ulica = ulicaDaleko(sim, p, 12);
      s.addWood(ulica, 6);
      s.think(p);
      expect(jaka(p)).toBe('haul');
      until(sim, () => !s.naszTeren(s.tileOf(p)), 3000);
      expect(s.naszTeren(s.tileOf(p))).toBe(false);
      expect(p.pi).toBeLessThan(p.path.length); // jeszcze w drodze
      if (szwendacz) {
        const z = spawnZombie(st, s.w, s.tileOf(p), 0);
        z.x = p.x + 8;
        z.y = p.y;
      }
      for (let n = 0; n < 2 * 20; n++) {
        for (const z of st.pawns.filter((q) => q.kind === 'zombie')) {
          z.x = p.x + 8;
          z.y = p.y;
          z.job = null;
        }
        sim.step();
      }
      return jaka(p);
    };
    expect(przebieg(false)).toBe('haul');
    expect(przebieg(true)).not.toBe('haul');
  });
});

describe('budowa bez polecenia: skąd bierze materiał', () => {
  function zPlanem(opcje: { zaSiatke?: boolean; godzina?: number }) {
    const sc = scena({ rodzaje: ['budowa'], ...opcje });
    const { sim, p } = sc;
    const s = prv(sim);
    sim.st.things = sim.st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'zlom' && t.kind !== 'czesci');
    const { at } = planBudowy(sim, 'ogrodek');
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', ...at });
    sim.step();
    odnow(sim, p);
    const plan = sim.st.builds[0];
    // cały materiał na ulicy, na jednej stercie
    const ulica = dodaj(sim, 'deski', BUILDS.ogrodek.cost.deski!, ulicaDaleko(sim, p));
    return { ...sc, s, at, plan, ulica };
  }

  it('bez przełącznika nie wychodzi po materiał na ulicę, z przełącznikiem za dnia tak, z polecenia zawsze', () => {
    const bez = zPlanem({});
    const starty = liczStarty(bez.sim, bez.p);
    const przed = bez.sim.stats.paths;
    bez.s.think(bez.p);
    expect(jaka(bez.p)).toBe('-');
    for (let n = 0; n < TICKS_PER_HOUR; n++) {
      bez.sim.step();
      expect(bez.s.naszTeren(kafelek(bez.sim, bez.p)), `krok ${n}`).toBe(true);
    }
    expect(starty.build ?? 0).toBe(0);
    expect(bez.sim.stats.paths - przed).toBeLessThanOrEqual(4);

    const z = zPlanem({ zaSiatke: true });
    z.s.think(z.p);
    expect(jaka(z.p)).toBe('build');
    expect(z.p.job?.order).toBe(false);
    expect(z.p.job?.from).toBe(z.ulica.id);
    // nocą nie, nawet z przełącznikiem
    const noc = zPlanem({ zaSiatke: true, godzina: 23 });
    noc.s.think(noc.p);
    expect(jaka(noc.p)).toBe('-');

    // z polecenia gracz posyła po materiał na ulicę bez przełącznika, jak dotąd
    const rozkaz = zPlanem({});
    rozkaz.sim.push({ t: 'build', ids: [rozkaz.p.id], kind: 'ogrodek', ...rozkaz.at });
    rozkaz.sim.step();
    expect(jaka(rozkaz.p)).toBe('build');
    expect(rozkaz.p.job?.order).toBe(true);
    expect(rozkaz.p.job?.from).toBe(rozkaz.ulica.id);
  });
});

describe('zapas drewna w rękach', () => {
  it('zapasDrewna liczy drewno niesione na naszym terenie, nie liczy niesionego poza nim ani na wyprawie', () => {
    const { sim, ludzie } = scena({ osoby: 2 });
    const [a, b] = ludzie;
    const s = prv(sim);
    const podworko = wolnyKafelek(sim, a, 'podworko');
    const ulica = wolnyKafelek(sim, a, 'poza');
    const na = (q: Pawn, tile: number) => {
      q.x = (tile % s.w.size) + 0.5;
      q.y = Math.floor(tile / s.w.size) + 0.5;
    };
    const baza = s.zapasDrewna();
    na(a, podworko);
    a.carry = 5;
    expect(s.zapasDrewna()).toBe(baza + 5);
    na(a, ulica);
    expect(s.zapasDrewna()).toBe(baza);
    na(a, podworko);
    a.away = true;
    expect(s.zapasDrewna()).toBe(baza);
    a.away = false;
    na(b, podworko);
    b.carry = 3;
    expect(s.zapasDrewna()).toBe(baza + 8);
  });
});

describe('tempo z umiejętności', () => {
  it('drwal z cieplo 4 ścina w Math.round(chopTicks / 1.4), przed pierwszym rankiem w chopTicks', () => {
    for (const [dzien, godzina, mnoznik] of [
      [2, 9, 1.4],
      [1, 16, 1],
    ] as const) {
      const { sim, p } = scena({ rodzaje: [], skills: { cieplo: 4 }, dzien, godzina });
      const s = prv(sim);
      sim.push({ t: 'chop', ids: [p.id], tree: s.dry });
      until(sim, () => p.job?.t === 'chop' && p.job.phase === 1, 4000);
      expect(p.job?.phase, `dzień ${dzien}`).toBe(1);
      const drzewo = s.w.trees[s.dry];
      expect(p.job!.until - p.job!.t0, `dzień ${dzien}`).toBe(Math.round(chopTicks(drzewo) / mnoznik));
    }
  });

  it('naprawa uszkodzenia też dzieli czas przez tempo (bud 2 daje 1,2)', () => {
    const { sim, p } = scena({ rodzaje: ['naprawy'], skills: { bud: 2 } });
    const st = sim.st;
    const s = prv(sim);
    for (const h of st.fence!.holes) h.patch = 100;
    s.rebuild();
    const kloc = wolnyKafelek(sim, p, 'podworko');
    dodaj(sim, 'zlom', 4, kloc);
    dodaj(sim, 'czesci', 4, kloc + 1);
    dodaj(sim, 'deski', 6, kloc + 2);
    st.apts.find((a) => a.apt === st.damage[0].apt)!.ours = true;
    until(sim, () => p.job?.t === 'repair' && p.job.until > 0, 6000);
    expect(jaka(p)).toBe('repair');
    expect(p.job!.until - p.job!.t0).toBe(Math.round(REPAIR[st.damage[p.job!.target].kind].work / 1.2));
  });
});

/* ---------- Zielonki ze wspólnym płotem wokół Domu nr 8 (jak w plot-drzewa.test.ts) ---------- */

function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** Zielonki ze wspólnym płotem wokół Domu nr 8: siatka cała, dziury załatane, brama zamknięta */
function zielonkiZPlotem() {
  const w = swiezy('zielonki');
  const b = w.buildings.find((x) => x.name === 'Dom nr 8')!;
  const r = wspolnyPlot(
    w,
    w.fence,
    drzwiBudynku(w, b.id).zewn.map((d) => ({ tile: d.tile, out: d.out })),
  );
  if (!r.ok) throw new Error('Dom nr 8 bez wspólnego płotu');
  const st = createSim(w, 5, { core: 4, mode: 'zwykly' });
  st.plot = { bids: [b.id], ksztalt: { tiles: r.fence.tiles, hole: r.fence.hole, yard: r.fence.yard } };
  const f = st.fence!;
  f.hp = r.fence.tiles.map(() => 100);
  f.holes = r.fence.hole.length ? [{ id: 1, tiles: [...r.fence.hole], size: 0.5, patch: 70 }] : [];
  f.gateOpen = false;
  return { w, st, r };
}

/** drzewa, których pień poza podwórkiem styka się z nim bokiem, a z drugiej strony ma wolną ulicę */
function liniowe(w: World, r: { fence: { tiles: number[]; hole: number[]; yard: number[] } }) {
  const size = w.size;
  const yard = new Set(r.fence.yard);
  const line = new Set([...r.fence.tiles, ...r.fence.hole]);
  const sasiedzi = (i: number) => [i - size, i + size, i - 1, i + 1];
  return w.trees
    .map((t, k) => ({ k, pien: trunkOf(w, t) }))
    .map((x) => ({ ...x, ulica: sasiedzi(x.pien).find((n) => !yard.has(n) && !line.has(n) && !w.blocked[n]) }))
    .filter((x) => !yard.has(x.pien) && x.ulica !== undefined && sasiedzi(x.pien).some((n) => yard.has(n)))
    .map((x) => ({ k: x.k, pien: x.pien, ulica: x.ulica as number }));
}
