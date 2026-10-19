/* Lokatorzy z wiedzą siadają w pracowni (docs/superpowers/specs/2026-10-19-badania-design.md, sekcja „Kto bada”):
   lokator siedziby (pionek `resident`) z osobą, która ma umiejętność co najmniej 1 w dziedzinie bieżącego badania,
   w swoich godzinach na podwórku (od `laws.workStart` do 18:00, nie noc, bez wroga na podwórku) siada na wolnym
   miejscu przy stole pracowni zamiast na podwórku. Bez wybranego badania, bez umiejętności, bez osoby, po 18:00 i jako
   sąsiad nikt nie siada; gdy dwa miejsca są zajęte, lokator robi to co dziś. Droga do stołu to mieszkanie zarządu,
   które dla lokatorów otwiera ten sam mechanizm co wspólny posiłek, tylko z innego powodu (zegar, pracownia, wybór
   badania i ktoś z wiedzą), więc zapis i wczytanie w środku sesji nie zmieniają przebiegu. Przymorze z dema,
   osoby lokatorów ustawione ręcznie (gra bez mieszkańców z adresu ich nie ma). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Dom } from '../../src/content/data.ts';
import { hashString } from '../../src/core/rng.ts';
import { kosztTech, tempoOsoby } from '../../src/sim/badania.ts';
import { footprint } from '../../src/sim/budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { homeMask, houseOf } from '../../src/sim/house.ts';
import { createSim, type Pawn, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });
/** mieszkanie zarządu z drzwiami (stół pracowni stoi przy drzwiach, więc siedzi się też w progu) */
const maska = homeMask(houseOf(w)!, w.size);

type Umiejetnosci = Partial<Record<Dom, number>>;

/** tick dnia 2 o danej godzinie (z ułamkiem) */
const tickAt = (godzina: number): number => Math.round(((1440 + godzina * 60 - START_MINUTES) * TICKS_PER_HOUR) / 60);
const kafelek = (p: Pawn): number => Math.floor(p.y) * w.size + Math.floor(p.x);
const wMieszkaniu = (p: Pawn): boolean => maska[kafelek(p)] === 1;

/** pracownia postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
function postaw(st: SimState): Thing {
  const i = allowedAnchors(st, w, 'pracownia', 0)[0];
  const f = footprint('pracownia', 0);
  const t: Thing = {
    id: st.nextThing++,
    kind: 'pracownia',
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
  /** godzina gry (dzień 2), domyślnie 10:00 */
  godzina?: number;
  /** umiejętności osoby kolejnego lokatora; null: lokator bez osoby; brakujące wpisy: osoba bez umiejętności */
  osoby?: (Umiejetnosci | null)[];
  /** bieżące badanie; null: nic nie wybrano; domyślnie t_konserwy (uprawa 1, koszt 12) */
  badanie?: string | null;
  pracownia?: boolean;
  /** uchwały od razu */
  prawa?: Partial<SimState['laws']>;
}

/** Przymorze: zarząd cztery osoby (uprawa 1 w t_konserwy ma ktoś z zarządu), pięciu lokatorów z osobami według
    `osoby`, pracownia, wybrane badanie. Wybór badania idzie poleceniem, więc działa od pierwszego kroku. */
function nowa(o: Opcje = {}) {
  const st = createSim(w, seed, { core: 4 });
  const prac = o.pracownia === false ? null : postaw(st);
  const lok = st.pawns.filter((p) => p.kind === 'resident');
  expect(lok).toHaveLength(5);
  lok.forEach((p, k) => {
    const sk = o.osoby ? o.osoby[k] : { uprawa: 1 };
    if (sk === null) return;
    st.people.push({ ...st.people[0], id: `lok${k}`, skills: { ...(sk ?? {}) }, traits: [] });
    p.person = st.people.length - 1;
  });
  st.tick = tickAt(o.godzina ?? 10);
  const sim = new Sim(w, st);
  const badanie = o.badanie === undefined ? 't_konserwy' : o.badanie;
  if (badanie) sim.push({ t: 'research', ids: [], tech: badanie });
  if (o.prawa) sim.push({ t: 'laws', ids: [], laws: o.prawa });
  return { st, sim, prac, lok };
}

const siedzi = (p: Pawn) => p.job?.t === 'research' && p.job.phase === 1;
const maPrace = (st: SimState) => st.pawns.filter((p) => p.job?.t === 'research');

/** n kroków; zwraca, którzy lokatorzy mieli w tym czasie pracę przy stole i którzy byli w mieszkaniu zarządu */
function biegnij(sim: Sim, n: number) {
  const siadali = new Set<number>();
  const weszli = new Set<number>();
  for (let k = 0; k < n; k++) {
    sim.step();
    for (const p of sim.st.pawns) {
      if (p.job?.t === 'research') siadali.add(p.id);
      if (p.kind === 'resident' && wMieszkaniu(p)) weszli.add(p.id);
    }
  }
  return { siadali, weszli };
}

/** ile kafelków mieszkania zarządu jest przechodnich dla mieszkańców: 0, gdy ich drzwi do niego są zamknięte */
function przechodnie(sim: Sim): number {
  const { blocked } = (sim as unknown as { lay: { resident: { blocked: Uint8Array } } }).lay.resident;
  let n = 0;
  for (let i = 0; i < blocked.length; i++) if (maska[i] && !blocked[i]) n++;
  return n;
}

const krokow = (sim: Sim, n: number) => {
  for (let k = 0; k < n; k++) sim.step();
};

/** kroki, aż pionek siedzi przy stole */
function doStolu(sim: Sim, p: Pawn, max = 4000) {
  for (let k = 0; k < max && !siedzi(p); k++) sim.step();
  expect(siedzi(p)).toBe(true);
}

describe('badania: lokator z wiedzą w pracowni', () => {
  it('o 10:00 lokator z uprawą 1 dochodzi do stołu, siada, a postęp badania rośnie o jego tempo', () => {
    const { st, sim, prac, lok } = nowa({ osoby: [{ uprawa: 1 }, null, { bud: 3 }, { uprawa: 0 }, { med: 2 }] });
    const [l] = lok;
    doStolu(sim, l);
    expect(l.job!.target).toBe(prac!.id);
    expect(l.job!.order).toBe(false);
    // siedzi na kafelku obok obrysu stołu (2×1), a nie w stole
    const t = l.job!.tile;
    expect(kafelek(l)).toBe(t);
    const [tx, ty] = [t % w.size, Math.floor(t / w.size)];
    expect(tx).toBeGreaterThanOrEqual(prac!.x - 1);
    expect(tx).toBeLessThanOrEqual(prac!.x + prac!.w);
    expect(ty).toBeGreaterThanOrEqual(prac!.y - 1);
    expect(ty).toBeLessThanOrEqual(prac!.y + prac!.h);
    expect(tx >= prac!.x && tx < prac!.x + prac!.w && ty >= prac!.y && ty < prac!.y + prac!.h).toBe(false);

    const na = tempoOsoby(st.people[l.person], 'uprawa') / TICKS_PER_HOUR;
    const p0 = st.research!.prog.t_konserwy ?? 0;
    // gdyby ktoś jeszcze siedział, postęp byłby większy: siedzi dokładnie jedna osoba
    expect(maPrace(st).filter(siedzi)).toEqual([l]);
    for (let k = 0; k < 100; k++) sim.step();
    expect(siedzi(l)).toBe(true);
    expect(st.research!.prog.t_konserwy - p0).toBeCloseTo(100 * na, 9);
  });

  it('do stołu idą tylko lokatorzy z wiedzą: bez umiejętności, z inną dziedziną i bez osoby zostają przy swoim', () => {
    const { st, sim, lok } = nowa({ osoby: [{ uprawa: 1 }, null, { bud: 3 }, { uprawa: 0 }, { med: 2 }] });
    const { siadali } = biegnij(sim, 3000);
    expect([...siadali]).toEqual([lok[0].id]);
    expect(st.research!.prog.t_konserwy).toBeGreaterThan(0);
  });

  it('lokator bez umiejętności w dziedzinie badania nie siada, a mieszkanie zarządu zostaje zamknięte', () => {
    const { sim } = nowa({ osoby: [{ uprawa: 0 }, { bud: 3 }, { med: 1 }, {}, { uprawa: 0 }] });
    const { siadali, weszli } = biegnij(sim, 4000);
    expect(siadali.size).toBe(0);
    expect(weszli.size).toBe(0);
  });

  it('lokator bez osoby nie siada, choć miejsce jest wolne', () => {
    const { st, sim, lok } = nowa({ osoby: [null, { uprawa: 1 }, null, null, null] });
    const { siadali } = biegnij(sim, 3000);
    expect([...siadali]).toEqual([lok[1].id]);
    expect(lok[0].person).toBe(-1);
    expect(st.research!.prog.t_konserwy).toBeGreaterThan(0);
  });

  it('bez wybranego badania nikt nie siada, a gdy badanie zostanie wybrane, siada ten z wiedzą', () => {
    const { st, sim, lok } = nowa({ badanie: null, osoby: [{ uprawa: 1 }, { uprawa: 2 }, null, null, null] });
    const bez = biegnij(sim, 2500);
    expect(bez.siadali.size).toBe(0);
    expect(bez.weszli.size).toBe(0);
    expect(st.research).toBeUndefined();

    sim.push({ t: 'research', ids: [], tech: 't_konserwy' });
    doStolu(sim, lok[0]);
    doStolu(sim, lok[1]);
    expect(st.research!.cur).toBe('t_konserwy');
  });

  it('o 19:00 nikt nie siada, nawet z wiedzą i z wybranym badaniem', () => {
    const { st, sim } = nowa({ godzina: 19 });
    const { siadali } = biegnij(sim, 2500);
    expect(siadali.size).toBe(0);
    expect(st.research!.prog.t_konserwy ?? 0).toBe(0);
  });

  it('przed początkiem pracy (7:00, uchwała o zebraniach przesuwa ją na 9:00) lokator jeszcze nie siada', () => {
    const rano = nowa({ godzina: 7 });
    expect(biegnij(rano.sim, 400).siadali.size).toBe(0);

    const zebrania = nowa({ godzina: 8, prawa: { workStart: 9 } });
    expect(biegnij(zebrania.sim, 600).siadali.size).toBe(0);
    for (let k = 0; k < 2500 && !zebrania.lok.some(siedzi); k++) zebrania.sim.step();
    expect(zebrania.lok.some(siedzi)).toBe(true);
  });

  it('o 18:00 lokator wstaje od stołu, a postęp badania się zatrzymuje', () => {
    const { st, sim, lok } = nowa({ godzina: 15, osoby: [{ uprawa: 1 }, null, null, null, null] });
    doStolu(sim, lok[0]);
    const osiemnasta = tickAt(18);
    while (st.tick < osiemnasta - 1) sim.step();
    expect(siedzi(lok[0])).toBe(true);
    const przed = st.research!.prog.t_konserwy;
    expect(przed).toBeGreaterThan(0);
    expect(przed).toBeLessThan(kosztTech('t_konserwy'));

    sim.step();
    sim.step();
    expect(maPrace(st)).toEqual([]);
    // wstał w mieszkaniu zarządu: jego drzwi zostają otwarte, dopóki stamtąd nie wyjdzie
    expect(wMieszkaniu(lok[0])).toBe(true);
    expect(przechodnie(sim)).toBeGreaterThan(0);
    const po = st.research!.prog.t_konserwy;
    for (let k = 0; k < 800; k++) sim.step();
    expect(maPrace(st)).toEqual([]);
    expect(st.research!.prog.t_konserwy).toBe(po);
    expect(st.research!.cur).toBe('t_konserwy');
    expect(wMieszkaniu(lok[0])).toBe(false);
    expect(przechodnie(sim)).toBe(0);
  });

  it('głodny lokator (pilna potrzeba) nie siada do badań, bo praca przy stole ustępuje potrzebie', () => {
    const { sim, lok } = nowa({ osoby: [{ uprawa: 1 }, null, null, null, null] });
    lok[0].needs!.food = 5;
    expect(biegnij(sim, 1200).siadali.size).toBe(0);
  });

  it('pora wspólnego posiłku bez miejsca przy stole zarządu: lokator nie wraca co chwilę do badania, jest na podwórku', () => {
    const { st, sim, lok } = nowa({
      godzina: 12.75,
      osoby: [{ uprawa: 1 }, null, null, null, null],
      prawa: { sharedMeals: true },
    });
    (sim as unknown as { mealSpot: () => number }).mealSpot = () => -1;
    let starty = 0;
    let bylNaPodworku = false;
    let poprzednio = false;
    while (st.tick < tickAt(14)) {
      sim.step();
      const bada = lok[0].job?.t === 'research';
      if (st.tick > tickAt(13) && bada && !poprzednio) starty++;
      if (st.tick > tickAt(13) + 100 && lok[0].job?.t === 'stay') bylNaPodworku = true;
      poprzednio = bada;
    }
    expect(starty).toBe(0);
    expect(bylNaPodworku).toBe(true);
  });

  it('dwa miejsca przy stole: trzeci lokator z wiedzą robi to co dziś, czyli zostaje na podwórku', () => {
    const { st, sim, lok } = nowa({ osoby: [{ uprawa: 1 }, { uprawa: 2 }, { uprawa: 1 }, null, null] });
    const { siadali } = biegnij(sim, 3000);
    expect(siadali.size).toBe(2);
    expect(maPrace(st)).toHaveLength(2);
    const trzeci = lok.find((p) => !siadali.has(p.id) && p.person >= 0)!;
    expect(trzeci.job?.t).not.toBe('research');
    // nikt nie siedzi w tym samym miejscu
    const kafle = maPrace(st).map((p) => p.job!.tile);
    expect(new Set(kafle).size).toBe(2);
  });

  it('wróg na podwórku: lokator z wiedzą nie wychodzi do pracowni', () => {
    const { sim } = nowa();
    (sim as unknown as { yardDanger: () => boolean }).yardDanger = () => true;
    expect(biegnij(sim, 1500).siadali.size).toBe(0);
  });

  it('sąsiad z umiejętnością nie siada, choć lokator z wiedzą otworzył drogę do pracowni', () => {
    const { st, sim, lok } = nowa({ osoby: [{ uprawa: 1 }, { uprawa: 2 }, null, null, null] });
    const sasiad = lok[1];
    sasiad.kind = 'sasiad';
    const { siadali } = biegnij(sim, 3000);
    expect([...siadali]).toEqual([lok[0].id]);
    expect(st.pawns.find((p) => p.id === sasiad.id)?.job?.t).not.toBe('research');
  });

  it('wspólny posiłek: lokator odchodzi od stołu na obiad, je i wraca do badania', () => {
    const { st, sim, lok } = nowa({
      godzina: 11,
      osoby: [{ uprawa: 1 }, null, null, null, null],
      prawa: { sharedMeals: true },
    });
    const [l] = lok;
    doStolu(sim, l);
    // do 13:00 siedzi; obiad (13:00 do 14:00) przerywa badanie, a lastMeal pokazuje, że zjadł
    while (st.tick < tickAt(13) + 60) sim.step();
    let jadl = false;
    while (st.tick < tickAt(15)) {
      sim.step();
      if (l.lastMeal >= tickAt(13)) jadl = true;
    }
    expect(jadl).toBe(true);
    doStolu(sim, l, 2000);
    expect(st.tick).toBeLessThan(tickAt(18));
  });

  it('po końcu pracy mieszkanie zarządu jest znów puste od lokatorów', () => {
    const { st, sim, lok } = nowa({ godzina: 16, osoby: [{ uprawa: 1 }, null, null, null, null] });
    doStolu(sim, lok[0]);
    while (st.tick < tickAt(19)) sim.step();
    expect(lok.some(wMieszkaniu)).toBe(false);
    // drzwi znów zamknięte: ani przez 20:00 do 6:00 nikt nie wchodzi
    expect(biegnij(sim, 4000).weszli.size).toBe(0);
  });

  it('zmiana badania na dziedzinę, w której lokator nic nie umie, podnosi go od stołu (a z wiedzą w nowej zostaje)', () => {
    const bez = nowa({ osoby: [{ uprawa: 1 }, null, null, null, null] });
    doStolu(bez.sim, bez.lok[0]);
    const prog = bez.st.research!.prog.t_konserwy;
    bez.sim.push({ t: 'research', ids: [], tech: 't_okna' });
    bez.sim.step();
    expect(bez.st.research!.cur).toBe('t_okna');
    // budowa 1: osoba lokatora jej nie zna, więc przy stole nie zostaje, choć jest dopiero 10:00
    bez.sim.step();
    expect(maPrace(bez.st)).toEqual([]);
    expect(biegnij(bez.sim, 2000).siadali.size).toBe(0);
    expect(bez.st.research!.prog.t_okna ?? 0).toBe(0);
    expect(bez.st.research!.prog.t_konserwy).toBe(prog);

    // ten sam krok z lokatorem, który zna też budowę: zostaje i bada nowe
    const z = nowa({ osoby: [{ uprawa: 1, bud: 1 }, null, null, null, null] });
    doStolu(z.sim, z.lok[0]);
    z.sim.push({ t: 'research', ids: [], tech: 't_okna' });
    krokow(z.sim, 10);
    expect(siedzi(z.lok[0])).toBe(true);
    expect(z.st.research!.prog.t_okna).toBeGreaterThan(0);
  });

  it('koniec badania podnosi lokatora od stołu, a następnej dziedziny bez wiedzy nie podejmuje', () => {
    const { st, sim, lok } = nowa({ osoby: [{ uprawa: 1 }, null, null, null, null] });
    doStolu(sim, lok[0]);
    st.research!.prog.t_konserwy = kosztTech('t_konserwy') - 0.001;
    sim.step();
    sim.step();
    expect(st.techDone).toEqual(['t_konserwy']);
    expect(st.research!.cur).toBeNull();
    expect(maPrace(st)).toEqual([]);
    expect(biegnij(sim, 2000).siadali.size).toBe(0);
  });
});

describe('badania: droga lokatorów do mieszkania zarządu', () => {
  it('w grze bez badań wspólny posiłek otwiera i zamyka mieszkanie zarządu jak przed pracownią, także po zdjęciu uchwały', () => {
    const { st, sim, lok } = nowa({
      pracownia: false,
      badanie: null,
      godzina: 12.5,
      osoby: [null, null, null, null, null],
      prawa: { sharedMeals: true },
    });
    expect(st.research).toBeUndefined();
    // obiad: mieszkańcy wchodzą do stołu zarządu
    for (let k = 0; k < 3000 && !lok.some(wMieszkaniu); k++) sim.step();
    expect(lok.some(wMieszkaniu)).toBe(true);
    expect(przechodnie(sim)).toBeGreaterThan(0);
    // uchwała zdjęta, gdy ktoś je jeszcze u zarządu: bez badań drzwi zamykają się od razu, jak dotąd
    sim.push({ t: 'laws', ids: [], laws: { sharedMeals: false } });
    sim.step();
    expect(przechodnie(sim)).toBe(0);
  });

  it('otwiera się w kroku, w którym wybrano badanie (nie dopiero o pełnej godzinie), i zamyka po zdjęciu wyboru', () => {
    const { sim } = nowa({ badanie: null, osoby: [{ uprawa: 1 }, null, null, null, null] });
    krokow(sim, 100);
    expect(przechodnie(sim)).toBe(0);
    sim.push({ t: 'research', ids: [], tech: 't_konserwy' });
    sim.step();
    expect(przechodnie(sim)).toBeGreaterThan(0);
    sim.push({ t: 'research', ids: [], tech: null });
    sim.step();
    expect(przechodnie(sim)).toBe(0);
  });

  it('otwiera się dla wszystkich lokatorów naraz, ale tylko gdy któryś z nich ma wiedzę', () => {
    const z = nowa({ osoby: [null, { uprawa: 1 }, null, null, null] });
    krokow(z.sim, 5);
    expect(przechodnie(z.sim)).toBeGreaterThan(0);

    // nikt z wiedzą (także dziedzina inna niż badanie) albo wiedzę ma tylko sąsiad: zamknięte
    for (const osoby of [
      [{ uprawa: 0 }, { bud: 3 }, null, {}, { med: 2 }],
      [null, { uprawa: 2 }, null, null, null],
    ]) {
      const bez = nowa({ osoby });
      if (osoby[1] && 'uprawa' in osoby[1]) bez.lok[1].kind = 'sasiad';
      krokow(bez.sim, 5);
      expect(przechodnie(bez.sim)).toBe(0);
    }
  });

  it('zamknięte bez pracowni, o 19:00 i przed początkiem pracy, choć lokator ma wiedzę i badanie jest wybrane', () => {
    const osoby = [{ uprawa: 1 }, null, null, null, null];
    for (const o of [{ pracownia: false }, { godzina: 19 }, { godzina: 7.5 }]) {
      const { sim } = nowa({ osoby, ...o });
      krokow(sim, 50);
      expect(przechodnie(sim), JSON.stringify(o)).toBe(0);
    }
  });

  it('otwiera się z początkiem pracy (8:00) i nie wcześniej', () => {
    const { st, sim } = nowa({ godzina: 7.5, osoby: [{ uprawa: 1 }, null, null, null, null] });
    while (st.tick < tickAt(8) - 1) sim.step();
    expect(przechodnie(sim)).toBe(0);
    sim.step();
    sim.step();
    expect(przechodnie(sim)).toBeGreaterThan(0);
  });
});

describe('badania: lokatorzy a determinizm', () => {
  it('ten sam przebieg dwa razy daje ten sam skrót, z lokatorami przy stole', () => {
    const run = () => {
      const { sim, lok } = nowa({ osoby: [{ uprawa: 1 }, { uprawa: 2 }, { uprawa: 1 }, null, null] });
      biegnij(sim, 3500);
      expect(lok.filter(siedzi)).toHaveLength(2);
      return sim.hash();
    };
    expect(run()).toBe(run());
  });

  /** kopia z JSON-a stanu (jak zapis i wczytanie), która przechodzi dalej n kroków razem z oryginałem */
  const rownolegle = (sim: Sim, n: number) => {
    const wczytany = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    // droga do mieszkania zarządu od razu taka sama, jeszcze przed pierwszym krokiem wczytanej gry
    expect(przechodnie(wczytany)).toBe(przechodnie(sim));
    krokow(sim, n);
    krokow(wczytany, n);
    expect(wczytany.hash()).toBe(sim.hash());
  };

  it('zapis tuż po wyborze badania w środku godziny: drzwi otwarte w tym samym kroku, więc wczytanie niczego nie zmienia', () => {
    const { sim, lok } = nowa({ badanie: null, osoby: [{ uprawa: 1 }, { uprawa: 2 }, null, null, null] });
    krokow(sim, 100);
    sim.push({ t: 'research', ids: [], tech: 't_konserwy' });
    sim.step();
    rownolegle(sim, 2500);
    expect(lok.filter(siedzi)).toHaveLength(2);
  });

  it('zapis w trakcie sesji, gdy oboje siedzą przy stole', () => {
    const { st, sim } = nowa({ osoby: [{ uprawa: 1 }, { uprawa: 2 }, null, null, null] });
    krokow(sim, 1500);
    expect(maPrace(st).filter(siedzi)).toHaveLength(2);
    rownolegle(sim, 800);
  });

  it('zapis w kroku, w którym badanie się kończy, a lokatorzy wstają od stołu', () => {
    const { st, sim } = nowa({ osoby: [{ uprawa: 1 }, { uprawa: 2 }, null, null, null] });
    krokow(sim, 1500);
    st.research!.prog.t_konserwy = kosztTech('t_konserwy') - 0.002;
    for (let k = 0; k < 400 && !st.techDone; k++) sim.step();
    expect(st.techDone).toEqual(['t_konserwy']);
    rownolegle(sim, 1500);
  });

  it('zapis po 18:00, gdy lokator stoi jeszcze w mieszkaniu zarządu i wychodzi', () => {
    const { st, sim, lok } = nowa({ godzina: 15, osoby: [{ uprawa: 1 }, null, null, null, null] });
    doStolu(sim, lok[0]);
    while (st.tick < tickAt(18) + 3) sim.step();
    expect(wMieszkaniu(lok[0])).toBe(true);
    rownolegle(sim, 1200);
  });

  it('bez pracowni stan jest taki jak przed zmianą, choć badanie jest wybrane, lokatorzy mają wiedzę i obowiązuje kocioł', () => {
    // skrót z gałęzi sprzed zadania 4 (b36384d) dla tego samego przebiegu: 10 godzin od 10:00 do 20:00 przez obiad i kolację
    const { sim, st } = nowa({
      pracownia: false,
      osoby: [{ uprawa: 1 }, { uprawa: 2 }, null, { uprawa: 1 }, { uprawa: 1 }],
      prawa: { sharedMeals: true },
    });
    for (let k = 0; k < 8000; k++) sim.step();
    expect(st.research).toEqual({ cur: 't_konserwy', prog: {}, at: {} });
    expect(maPrace(st)).toEqual([]);
    expect(sim.hash()).toBe(SKROT_BEZ_PRACOWNI);
  });
});

/** Skrót stanu bez pracowni po 8000 krokach z `nowa`, policzony na gałęzi przed zadaniem 4. Zmienia się tylko razem
    z resztą symulacji (jak skróty w druzyna-sim.test.ts), a nie z samą pracownią. */
const SKROT_BEZ_PRACOWNI = '6a255af6';
