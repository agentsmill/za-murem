/* Rodzaj pracy „Badania” w tabeli Pracy (kontrakt z projektu pracy ludzi, sekcja „Rodzaje pracy”, wpięty przy scaleniu
   z gałęzią `badania`): wpis `WPISY.badania` (umiejętność to poziom osoby w dziedzinie bieżącego badania, rodzaj jest
   widoczny, gdy stoi pracownia albo istnieje stan badań, `znajdz` to `sim.startResearch`), tempo z krzywej wspólnej
   z badaniami, kolumna ukryta bez pracowni i automat: wolny zarząd z priorytetem Badań siada do stołu sam od pierwszego
   rana, a bez pracowni, bez wybranego badania, w nocy i przy pilnej potrzebie nie siada (praca `research` jest w
   M2_JOBS, więc bez polecenia ustępuje jak inne prace automatu). Sceny są małe: jedna osoba pracuje, reszta zarządu i
   mieszkańcy są na wyprawie, praca siedzi na dniu 2, 6:00 po samouczku. */

import { describe, expect, it } from 'vitest';
import { badaniaDom, badaniaWidoczne, tempoOsoby } from '../../src/sim/badania.ts';
import { type BuildKind, footprint } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import {
  domyslnyPriorytet,
  kolejnoscOsoby,
  priorytet,
  RODZAJE,
  tempoPoziomu,
  tempoPracy,
  WPISY,
} from '../../src/sim/praca.ts';
import { BURN_TICKS, type Pawn, type Sim, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { skonczSamouczek } from './praca-pomoc.ts';
import { core, demoWorld, newGame } from './sasiedzi-pomoc.ts';

const KLUCZ = 'przymorze';
const w = demoWorld(KLUCZ);

/** t_okna: dziedzina `bud`, poziom 1, koszt 12 (najtańsza technologia pierwszej ery) */
const TECH = 't_okna';

/** prywatne części Sim, po które sięga scena (kontrakt testowy, nie API gry) */
interface Prywatne {
  koza(): Thing | undefined;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

/** gotowa pracownia postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
function postawPracownie(sim: Sim): Thing {
  const st = sim.st;
  const kind: BuildKind = 'pracownia';
  const i = allowedAnchors(st, w, kind, 0)[0];
  const f = footprint(kind, 0);
  const t: Thing = {
    id: st.nextThing++,
    kind,
    x: i % w.size,
    y: Math.floor(i / w.size),
    w: f.w,
    h: f.h,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(t);
  return t;
}

interface Opcje {
  pracownia?: boolean;
  /** wybrane badanie (polecenie `research`) */
  badanie?: boolean;
  /** ile osób z zarządu pracuje (reszta na wyprawie) */
  osoby?: number;
  /** umiejętności wszystkich pracujących osób */
  skills?: Record<string, number>;
  dzien?: number;
  godzina?: number;
  samouczek?: boolean;
  /** priorytet Badań ustawiony poleceniem (bez tego domyślny) */
  prio?: 0 | 1 | 2 | 3 | 4;
}
interface Scena {
  sim: Sim;
  ludzie: Pawn[];
  pracownia?: Thing;
}

/** Gra na Przymorzu: pracujący syci, wyspani i ciepli, koza pali się na długo, wszystkie rodzaje poza ogniem i Badaniami
    na 0 (robi tylko to, co test zamierza), reszta zarządu i mieszkańcy na wyprawie, dzień 2, 6:00 po samouczku. */
function scena(o: Opcje = {}): Scena {
  const sim = newGame(KLUCZ, 'zwykly', 5);
  sim.step();
  const st = sim.st;
  if (o.samouczek !== false) skonczSamouczek(sim);
  st.tick = tickAt(o.dzien ?? 2, o.godzina ?? 6);
  for (const q of st.pawns) if (q.kind === 'resident') q.away = true;
  const wszyscy = core(sim);
  const ludzie = wszyscy.slice(0, o.osoby ?? 1);
  for (const q of wszyscy) {
    q.away = !ludzie.includes(q);
    q.needs!.food = 90;
    q.needs!.rest = 90;
    q.needs!.warm = 60;
  }
  for (const q of ludzie) st.people[q.person].skills = { ...o.skills };
  prv(sim).koza()!.fuel = 3 * BURN_TICKS;
  const pracownia = o.pracownia === false ? undefined : postawPracownie(sim);
  if (o.badanie !== false && pracownia) {
    sim.push({ t: 'research', ids: [], tech: TECH });
  }
  for (const q of ludzie) {
    for (const r of RODZAJE) {
      if (r === 'ogien' || r === 'badania') continue;
      sim.push({ t: 'prio', ids: [], osoba: q.person, rodzaj: r, prio: 0 });
    }
    if (o.prio !== undefined) sim.push({ t: 'prio', ids: [], osoba: q.person, rodzaj: 'badania', prio: o.prio });
  }
  sim.step();
  // czyste zadanie przed pierwszym think()
  for (const q of ludzie) {
    q.job = null;
    q.path = [];
    q.pi = 0;
    q.carry = 0;
    q.wait = st.tick;
  }
  return { sim, ludzie, pracownia };
}

/** czy ktoś w grze ma pracę badania */
const badajacy = (sim: Sim): Pawn[] => sim.st.pawns.filter((p) => p.job?.t === 'research');

/** kroki, aż ktoś będzie miał pracę badania (najwyżej limit); zwraca liczbę kroków */
function doBadania(sim: Sim, limit = 600): number {
  let n = 0;
  while (!badajacy(sim).length && n < limit) {
    sim.step();
    n++;
  }
  return n;
}

const kroki = (sim: Sim, n: number): void => {
  for (let k = 0; k < n; k++) sim.step();
};

describe('wpis badania w WPISY', () => {
  it('bez pracowni i bez stanu badań: niewidoczny, umiejętność 0, priorytet 0, poza kolejnością', () => {
    const { sim, ludzie } = scena({ pracownia: false, skills: { bud: 4, it: 4 } });
    const st = sim.st;
    expect(badaniaWidoczne(st)).toBe(false);
    expect(WPISY.badania.widoczny(st)).toBe(false);
    expect(badaniaDom(st)).toBeNull();
    expect(WPISY.badania.umiejetnosc(st, st.people[ludzie[0].person])).toBe(0);
    expect(domyslnyPriorytet(st, st.people[ludzie[0].person], 'badania')).toBe(0);
    expect(kolejnoscOsoby(st, ludzie[0].person)).not.toContain('badania');
    expect(sim.ileZlecen('badania')).toBe(0);
  });

  it('z pracownią jest widoczny; bez wybranego badania umiejętność 0 i domyślny priorytet 0 (nie robi)', () => {
    const { sim, ludzie } = scena({ badanie: false, skills: { bud: 4 } });
    const st = sim.st;
    expect(badaniaWidoczne(st)).toBe(true);
    expect(WPISY.badania.widoczny(st)).toBe(true);
    expect(badaniaDom(st)).toBeNull();
    const o = st.people[ludzie[0].person];
    expect(WPISY.badania.umiejetnosc(st, o)).toBe(0);
    expect(domyslnyPriorytet(st, o, 'badania')).toBe(0);
    // kolumna jest, ale osoba jej sama nie bierze; włączona przez gracza (priorytet albo stałe zajęcie) wchodzi do kolejności
    expect(kolejnoscOsoby(st, ludzie[0].person)).not.toContain('badania');
    sim.push({ t: 'prio', ids: [], osoba: ludzie[0].person, rodzaj: 'badania', prio: 2 });
    sim.step();
    expect(kolejnoscOsoby(st, ludzie[0].person)).toContain('badania');
    expect(sim.ileZlecen('badania')).toBe(0);
  });

  it('umiejętność to poziom osoby w dziedzinie bieżącego badania, a z niej wynika domyślny priorytet', () => {
    const { sim, ludzie } = scena({ skills: { bud: 3, cieplo: 4 } });
    const st = sim.st;
    expect(badaniaDom(st)).toBe('bud');
    const o = st.people[ludzie[0].person];
    expect(WPISY.badania.umiejetnosc(st, o)).toBe(3);
    expect(domyslnyPriorytet(st, o, 'badania')).toBe(1);
    o.skills = { bud: 1 };
    expect(domyslnyPriorytet(st, o, 'badania')).toBe(2);
    // umiejętność w innej dziedzinie niż badanie nie liczy się
    o.skills = { cieplo: 4, it: 4 };
    expect(WPISY.badania.umiejetnosc(st, o)).toBe(0);
    expect(domyslnyPriorytet(st, o, 'badania')).toBe(0);
    expect(priorytet(st, ludzie[0].person, 'badania')).toBe(0);
    expect(kolejnoscOsoby(st, ludzie[0].person)).not.toContain('badania');
    // bez umiejętności w ogóle też 0
    o.skills = {};
    expect(domyslnyPriorytet(st, o, 'badania')).toBe(0);
  });

  it('stan badań bez pracowni (po rozbiórce) zostawia rodzaj widocznym, ale nikt nie siada', () => {
    const { sim, pracownia } = scena({ skills: { bud: 3 } });
    const st = sim.st;
    st.things = st.things.filter((t) => t !== pracownia);
    expect(st.research?.cur).toBe(TECH);
    expect(WPISY.badania.widoczny(st)).toBe(true);
    kroki(sim, 400);
    expect(badajacy(sim)).toEqual([]);
    expect(sim.ileZlecen('badania')).toBe(0);
  });

  it('znajdz to sim.startResearch: siada przy stole i zwraca true, bez badania false', () => {
    const { sim, ludzie } = scena({ skills: { bud: 3 } });
    expect(WPISY.badania.znajdz!(sim, ludzie[0])).toBe(true);
    expect(ludzie[0].job?.t).toBe('research');
    expect(ludzie[0].job?.order).toBe(false);
    const { sim: bez, ludzie: l2 } = scena({ badanie: false, skills: { bud: 3 } });
    expect(WPISY.badania.znajdz!(bez, l2[0])).toBe(false);
    expect(l2[0].job).toBeNull();
  });

  it('odczyt dla panelu: kolumna widoczna z pracownią, liczba zleceń to wolne miejsca przy stole', () => {
    const { sim, ludzie, pracownia } = scena({ skills: { bud: 3 } });
    const st = sim.st;
    expect(snapshot(st, w).praca.widoczne).toContain('badania');
    expect(sim.ileZlecen('badania')).toBe(2);
    expect(WPISY.badania.znajdz!(sim, ludzie[0])).toBe(true);
    expect(sim.ileZlecen('badania')).toBe(1);
    expect(st.things).toContain(pracownia);
    const { sim: bez } = scena({ pracownia: false });
    expect(snapshot(bez.st, w).praca.widoczne).not.toContain('badania');
  });
});

/* Przegląd końcowy: domyślny priorytet Badań zależy od dziedziny bieżącego badania i zmienia się w grze, więc jawny wybór
   gracza zostaje w stanie także wtedy, gdy w chwili ustawienia był równy domyślnemu. */
describe('jawny priorytet Badań nie zwija się do domyślnego', () => {
  /** badanie t_okna (bud); pierwsza osoba zna bud (domyślnie 1), druga tylko ciepło (domyślnie 0; jej wiedza pozwala
      potem wybrać t_kozy) */
  function dwie(): { sim: Sim; fachowiec: number; laik: number } {
    const { sim, ludzie } = scena({ osoby: 2, skills: { bud: 3 } });
    const st = sim.st;
    const [fachowiec, laik] = ludzie.map((q) => q.person);
    st.people[laik].skills = { cieplo: 3 };
    expect(priorytet(st, fachowiec, 'badania')).toBe(1);
    expect(priorytet(st, laik, 'badania')).toBe(0);
    return { sim, fachowiec, laik };
  }
  /** po zmianie badania na t_kozy (ciepło): fachowiec domyślnie 0, laik 1 */
  const naKozy = (sim: Sim): void => {
    sim.push({ t: 'research', ids: [], tech: 't_kozy' });
    sim.step();
    expect(badaniaDom(sim.st)).toBe('cieplo');
  };

  it('jawne ustawienie równe domyślnemu zostaje po zmianie dziedziny badania', () => {
    const { sim, fachowiec, laik } = dwie();
    sim.push({ t: 'prio', ids: [], osoba: fachowiec, rodzaj: 'badania', prio: 1 });
    sim.push({ t: 'prio', ids: [], osoba: laik, rodzaj: 'badania', prio: 0 });
    sim.step();
    naKozy(sim);
    expect(priorytet(sim.st, fachowiec, 'badania')).toBe(1);
    expect(priorytet(sim.st, laik, 'badania')).toBe(0);
  });

  it('0 dla fachowca i 1 dla laika zostają po zmianie dziedziny badania', () => {
    const { sim, fachowiec, laik } = dwie();
    sim.push({ t: 'prio', ids: [], osoba: fachowiec, rodzaj: 'badania', prio: 0 });
    sim.push({ t: 'prio', ids: [], osoba: laik, rodzaj: 'badania', prio: 1 });
    sim.step();
    naKozy(sim);
    expect(priorytet(sim.st, fachowiec, 'badania')).toBe(0);
    expect(priorytet(sim.st, laik, 'badania')).toBe(1);
  });
});

/* Przegląd końcowy: badanie bez polecenia idzie do stołu jak każda praca automatu (`idz`, `mozeSam`): pracownia może stać
   w innej klatce bloku, do której droga prowadzi ulicą, a tej drogi automat w trybie zombie i nocą nie bierze. */
describe('droga do pracowni w innej klatce bloku', () => {
  interface Drogi {
    naszeObszary(): Int32Array;
    roomTiles: number[][];
    tileOf(p: Pawn): number;
    regionOf(p: Pawn): number;
    reg: Int32Array;
    coreBlocked: Uint8Array;
  }
  /** Przymorze w trybie `tryb` bez szwendaczy, dzień 2, 9:00; jedna osoba z bud 3, pracownia w pokoju innej klatki bloku
      siedziby (osiągalnym tylko ulicą), wybrane badanie t_okna */
  function wDrugiejKlatce(tryb: 'zwykly' | 'zombie'): { sim: Sim; p: Pawn } {
    const sim = newGame(KLUCZ, tryb, 5);
    sim.step();
    const st = sim.st;
    skonczSamouczek(sim);
    st.tick = tickAt(2, 9);
    st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
    for (const q of st.pawns) if (q.kind === 'resident') q.away = true;
    const [p, ...reszta] = core(sim);
    for (const q of reszta) q.away = true;
    p.needs = { ...p.needs!, food: 90, rest: 90, warm: 60 };
    st.people[p.person].skills = { bud: 3 };
    prv(sim).koza()!.fuel = 3 * BURN_TICKS;
    const s = sim as unknown as Drogi;
    const obszary = s.naszeObszary();
    const od = obszary[s.tileOf(p)];
    const size = w.size;
    // pokój innej klatki: jego kafelki w innym obszarze naszego terenu, ale w tym samym obszarze mapy (dojście ulicą)
    let at = -1;
    for (const r of sim.house!.rooms) {
      if (r.kind !== 'pokoj' || at >= 0) continue;
      const tiles = new Set(s.roomTiles[r.id]);
      const t0 = s.roomTiles[r.id][0];
      if (obszary[t0] < 0 || obszary[t0] === od || s.reg[t0] !== s.regionOf(p)) continue;
      at =
        s.roomTiles[r.id].find(
          (i) =>
            tiles.has(i + 1) &&
            !s.coreBlocked[i] &&
            !s.coreBlocked[i + 1] &&
            !st.things.some((t) => [i, i + 1].includes(t.y * size + t.x)),
        ) ?? -1;
    }
    expect(at, 'pokój w innej klatce').toBeGreaterThanOrEqual(0);
    st.things.push({
      id: st.nextThing++,
      kind: 'pracownia',
      x: at % size,
      y: Math.floor(at / size),
      w: 2,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    sim.push({ t: 'research', ids: [], tech: TECH });
    sim.step();
    expect(badaniaDom(st)).toBe('bud');
    p.job = null;
    p.path = [];
    p.pi = 0;
    st.tick = tickAt(2, 9);
    return { sim, p };
  }

  it('w trybie zombie bez polecenia nie idzie ulicą do pracowni w innej klatce (i nie liczy drogi), z polecenia idzie', () => {
    const { sim, p } = wDrugiejKlatce('zombie');
    const drogi = sim.stats.paths;
    expect(sim.startResearch(p)).toBe(false);
    expect(p.job).toBeNull();
    expect(sim.stats.paths).toBe(drogi);
    expect(sim.startResearch(p, true)).toBe(true);
    expect(p.job?.order).toBe(true);
  });

  it('w trybie zwykłym za dnia przejście chodnikiem między klatkami jest dozwolone, jak przy noszeniu materiału', () => {
    const { sim, p } = wDrugiejKlatce('zwykly');
    expect(sim.startResearch(p)).toBe(true);
    expect(p.job?.t).toBe('research');
    expect(p.job?.order).toBe(false);
  });
});

describe('tempo badań: krzywa wspólna z pracą ludzi', () => {
  it('tempoOsoby to TEMPO_BAZOWE · tempoPoziomu · cechy (cechy tylko tu, raz)', () => {
    const o = { skills: { bud: 2 }, traits: ['pracowity'] };
    expect(tempoOsoby(o, 'bud')).toBeCloseTo(1.1 * tempoPoziomu(2) * 1.1, 10);
    expect(tempoPoziomu(0)).toBe(1);
    expect(tempoPoziomu(2)).toBeCloseTo(1.2, 10);
  });

  it('tempoPracy(…, badania): 1 przed pierwszym rankiem i bez badania, potem 1 + 0,1 · poziom w dziedzinie badania', () => {
    const { sim, ludzie } = scena({ skills: { bud: 3, cieplo: 2 }, dzien: 1, godzina: 17, samouczek: false });
    const st = sim.st;
    const p = ludzie[0];
    expect(tempoPracy(st, p, 'badania')).toBe(1);
    skonczSamouczek(sim);
    st.tick = tickAt(2, 6);
    expect(tempoPracy(st, p, 'badania')).toBeCloseTo(1.3, 10);
    st.research!.cur = null;
    expect(tempoPracy(st, p, 'badania')).toBe(1);
    st.research!.cur = 't_kozy'; // dziedzina cieplo
    expect(tempoPracy(st, p, 'badania')).toBeCloseTo(1.2, 10);
  });
});

describe('automat: badania bez polecenia', () => {
  it('z pracownią i wybranym badaniem wolny zarząd siada do stołu sam od pierwszego rana', () => {
    const { sim, ludzie, pracownia } = scena({ skills: { bud: 2 } });
    const n = doBadania(sim);
    expect(n).toBeLessThan(600);
    const p = ludzie[0];
    expect(p.job?.t).toBe('research');
    // praca bez polecenia: ustępuje nocy, pilnej potrzebie i wrogowi jak inne prace automatu
    expect(p.job?.order).toBe(false);
    expect(p.job?.target).toBe(pracownia!.id);
    // dochodzi, siada i badanie rośnie
    kroki(sim, 400);
    expect(p.job?.t).toBe('research');
    expect(p.job?.phase).toBe(1);
    expect(sim.st.research!.prog[TECH]).toBeGreaterThan(0);
  });

  it('osoba bez umiejętności w dziedzinie badania sama nie siada (domyślnie 0), a umiejętna tak', () => {
    const { sim, ludzie } = scena({ osoby: 2, skills: { bud: 2 } });
    // wiedzę w budownictwie daje druga osoba (bud 2), pierwsza nie umie nic (badanie jest już wybrane)
    sim.st.people[ludzie[0].person].skills = {};
    expect(domyslnyPriorytet(sim.st, sim.st.people[ludzie[0].person], 'badania')).toBe(0);
    expect(domyslnyPriorytet(sim.st, sim.st.people[ludzie[1].person], 'badania')).toBe(2);
    doBadania(sim);
    kroki(sim, 1000);
    expect(badajacy(sim).map((p) => p.id)).toEqual([ludzie[1].id]);
    expect(ludzie[0].job?.t).not.toBe('research');
  });

  it('gracz może włączyć badania osobie bez umiejętności: wtedy siada i ona (wiedzę ma ktoś inny z zarządu)', () => {
    const { sim, ludzie } = scena({ osoby: 2, skills: { bud: 2 } });
    sim.st.people[ludzie[0].person].skills = {};
    sim.push({ t: 'prio', ids: [], osoba: ludzie[0].person, rodzaj: 'badania', prio: 3 });
    sim.step();
    expect(priorytet(sim.st, ludzie[0].person, 'badania')).toBe(3);
    doBadania(sim);
    kroki(sim, 1000);
    expect(
      badajacy(sim)
        .map((p) => p.id)
        .sort(),
    ).toEqual(ludzie.map((p) => p.id).sort());
  });

  it('przy stole są tylko dwa miejsca: trzecia osoba robi coś innego', () => {
    const { sim, ludzie } = scena({ osoby: 3, skills: { bud: 2 } });
    kroki(sim, 1000);
    expect(badajacy(sim)).toHaveLength(2);
    expect(ludzie.filter((p) => p.job?.t === 'research')).toHaveLength(2);
    expect(sim.ileZlecen('badania')).toBe(0);
  });

  it('przed pierwszym rankiem (dzień 1, samouczek trwa) nikt nie siada sam', () => {
    const { sim } = scena({ skills: { bud: 2 }, dzien: 1, godzina: 17, samouczek: false });
    kroki(sim, 600);
    expect(badajacy(sim)).toEqual([]);
  });

  it('bez pracowni nikt nie bada, kolumna jest ukryta i stanu badań nie ma', () => {
    const { sim } = scena({ pracownia: false, skills: { bud: 4, it: 4 } });
    kroki(sim, 1000);
    expect(badajacy(sim)).toEqual([]);
    expect('research' in sim.st).toBe(false);
    expect(snapshot(sim.st, w).praca.widoczne).not.toContain('badania');
  });

  it('z pracownią, ale bez wybranego badania nikt nie siada', () => {
    const { sim } = scena({ badanie: false, skills: { bud: 4 } });
    kroki(sim, 1000);
    expect(badajacy(sim)).toEqual([]);
  });

  it('priorytet 0 wyłącza badania, a priorytet 1 stawia je przed resztą', () => {
    const { sim } = scena({ skills: { bud: 2 }, prio: 0 });
    kroki(sim, 1000);
    expect(badajacy(sim)).toEqual([]);
    const { sim: jeden, ludzie } = scena({ skills: { bud: 2 }, prio: 1 });
    expect(priorytet(jeden.st, ludzie[0].person, 'badania')).toBe(1);
    doBadania(jeden);
    expect(ludzie[0].job?.t).toBe('research');
  });

  it('w nocy nikt sam nie siada do stołu', () => {
    const { sim } = scena({ skills: { bud: 2 }, godzina: 22 });
    kroki(sim, 400);
    expect(badajacy(sim)).toEqual([]);
  });

  it('pilna potrzeba i noc podnoszą od stołu osobę, która usiadła bez polecenia', () => {
    const { sim, ludzie } = scena({ skills: { bud: 2 } });
    doBadania(sim);
    kroki(sim, 400);
    const p = ludzie[0];
    expect(p.job?.t).toBe('research');
    // pilna potrzeba (głód poniżej 10): wstaje przy najbliższym sprawdzeniu, nawet gdyby miała tam wrócić
    p.needs!.food = 4;
    kroki(sim, 40);
    expect(p.job?.t).not.toBe('research');

    // noc kończy pracę bez polecenia
    const { sim: noc, ludzie: l2 } = scena({ skills: { bud: 2 }, godzina: 18 });
    doBadania(noc);
    kroki(noc, 400);
    expect(l2[0].job?.t).toBe('research');
    noc.st.tick = tickAt(2, 22) - (tickAt(2, 22) % 20);
    for (const q of l2) q.needs = { ...q.needs!, food: 90, rest: 90, warm: 60 };
    kroki(noc, 40);
    expect(l2[0].job?.t).not.toBe('research');
  });

  it('badania nie przerywają polecenia gracza „Badać” pracą automatu, a zlecone dalej idzie z order', () => {
    const { sim, ludzie, pracownia } = scena({ skills: { bud: 2 }, prio: 0 });
    sim.push({ t: 'study', ids: [ludzie[0].id], thing: pracownia!.id });
    sim.step();
    expect(ludzie[0].job?.t).toBe('research');
    expect(ludzie[0].job?.order).toBe(true);
  });

  it(`w ciągu doby postęp rośnie tempem z krzywej (${TICKS_PER_HOUR} ticków na godzinę gry)`, () => {
    const { sim, ludzie } = scena({ skills: { bud: 2 } });
    doBadania(sim);
    kroki(sim, 400);
    const p = ludzie[0];
    expect(p.job?.phase).toBe(1);
    const przed = sim.st.research!.prog[TECH] ?? 0;
    kroki(sim, TICKS_PER_HOUR);
    const po = sim.st.research!.prog[TECH] ?? 0;
    // godzina przy stole jednej osoby: TEMPO_BAZOWE · (1 + 0,1 · 2) punktów
    expect(po - przed).toBeCloseTo(tempoOsoby(sim.st.people[p.person], 'bud'), 5);
  });
});
