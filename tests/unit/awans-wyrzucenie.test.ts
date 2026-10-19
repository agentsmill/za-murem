/* Awans mieszkańca, wyjście bramą i sprawdzanie hałasu (docs/superpowers/specs/2026-10-19-wydarzenia-design.md,
   sekcja 2, „Skutki”). `awansuj`: pionek mieszkańca z osobą zostaje tym samym pionkiem i tą samą osobą, ale rodzaju
   `core` (bierze polecenia), z potrzebami i łóżkiem, które miał. `wyprowadz`: mieszkaniec albo osoba zarządu idzie
   do bramy drogą zarządu, za bramą ulicą do kafelka daleko od siatki i znika; łóżko jest wolne od razu, a zarząd od
   pierwszego odczytu nie widzi już tej osoby ani mieszkańca. `sprawdz`: osoba zarządu idzie na kafelek od strony
   podwórka, stoi tam 10 minut gry i wraca do swoich zajęć. Skutki zarządu `awans`, `wyrzuc`, `sprawdz` i host.
   Świat to blok M2 z siatką i bramą; mieszkańcom osoby dokładamy ręcznie (jak generator mieszkańców). */

import { describe, expect, it } from 'vitest';
import { makePerson, type Person } from '../../src/content/people.ts';
import { hashString, mulberry } from '../../src/core/rng.ts';
import type { GovEffects } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { makeHost } from '../../src/gov/wydarzenia.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { commandFor, jobText } from '../../src/sim/orders.ts';
import { awansuj, createSim, exitOf, type Pawn, Sim, type SimState, sprawdz, wyprowadz } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const size = w.size;
const TICKS_HOUR = 800;
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * TICKS_HOUR);
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const residents = (st: SimState) => st.pawns.filter((p) => p.kind === 'resident');
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const personId = (st: SimState, p: Pawn) => st.people[p.person].id;
const gate = new Set(w.fence.gate ? gateIndexes() : []);
const yard = new Set(w.fence.yard);
/** kafelki bramy z prostokąta w świecie */
function gateIndexes(): number[] {
  const g = w.fence.gate;
  const out: number[] = [];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) out.push(y * size + x);
  return out;
}

/** mieszkaniec z łóżkiem dostaje osobę (jak z generatora mieszkańców); zwraca pionek i id osoby */
function zOsoba(st: SimState, k = 0): { pawn: Pawn; id: string } {
  const lista = residents(st).filter((p) => st.things.some((t) => t.owner === p.id));
  const pawn = lista[k];
  const o: Person = makePerson(mulberry(40 + k), new Set(st.people.map((q) => q.first)), () => 200 + k);
  st.people.push(o);
  pawn.person = st.people.length - 1;
  return { pawn, id: o.id };
}

/** gra w ciągu dnia, żeby nikt nie szedł spać ani na wartę */
function gra(seed = 3, hour = 10): { st: SimState; sim: Sim } {
  const st = createSim(w, seed, { core: 2 });
  st.tick = atHour(1, hour);
  return { st, sim: new Sim(w, st) };
}

const fx = (f: (e: GovEffects) => void): GovEffects => {
  const e = emptyEffects();
  f(e);
  return e;
};

/** kroki do spełnienia warunku, najwyżej max ticków; zwraca, ile zrobiono (max: nie doszło) */
function dopoki(sim: Sim, ok: () => boolean, max: number): number {
  let n = 0;
  while (!ok() && n < max) {
    sim.step();
    n++;
  }
  return n;
}

describe('awansuj: mieszkaniec do zarządu', () => {
  it('ten sam pionek, ta sama osoba, kind core, bierze polecenia (commandFor)', () => {
    const { st, sim } = gra();
    const { pawn, id } = zOsoba(st);
    const pid = pawn.id;
    const osoba = pawn.person;
    const needs = { ...pawn.needs! };
    const lozko = st.things.find((t) => t.owner === pid)!;
    const cel = w.fence.yard.find((i) => !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size)))!;
    // mieszkaniec nie bierze poleceń
    expect(commandFor(st, w, [pid], cel)).toBeNull();
    const n = st.pawns.length;
    expect(awansuj(st, w, id)).toBe(true);
    expect(st.pawns).toHaveLength(n);
    expect(st.pawns.filter((p) => p.id === pid)).toHaveLength(1);
    expect(pawn.kind).toBe('core');
    expect(pawn.person).toBe(osoba);
    expect(personId(st, pawn)).toBe(id);
    expect(pawn.apt).toBe(-1);
    expect(pawn.needs).toEqual(needs);
    expect(lozko.owner).toBe(pid);
    // w odczytach: wśród zarządu, nie wśród mieszkańców
    const s = snapshot(st, w);
    expect(s.people.map((q) => q.id)).toContain(id);
    expect(s.lokatorzy.map((q) => q.id)).not.toContain(id);
    expect(govInput(st, w, 0).people.map((q) => q.id)).toContain(id);
    expect(govInput(st, w, 0).lokatorzy?.map((q) => q.id) ?? []).not.toContain(id);
    // bierze polecenia: idzie tam, gdzie go wysłano
    const cmd = commandFor(st, w, [pid], cel);
    expect(cmd).toEqual({ t: 'move', ids: [pid], to: cel });
    sim.push(cmd!);
    sim.step();
    expect(pawn.job?.t).toBe('go');
    dopoki(sim, () => tileOf(pawn) === cel, 2000);
    expect(tileOf(pawn)).toBe(cel);
  });

  it('nieznane id, osoba zarządu i ktoś, kto już wychodzi: false i nic się nie zmienia', () => {
    const { st } = gra();
    const { pawn, id } = zOsoba(st);
    const przed = hashString(JSON.stringify(st));
    expect(awansuj(st, w, 'nie ma takiego')).toBe(false);
    expect(awansuj(st, w, personId(st, core(st)[0]))).toBe(false);
    expect(hashString(JSON.stringify(st))).toBe(przed);
    expect(wyprowadz(st, w, id)).toBe(true);
    expect(awansuj(st, w, id)).toBe(false);
    expect(pawn.kind).toBe('resident');
  });
});

describe('wyprowadz: wyjście bramą', () => {
  it('mieszkaniec: wychodzi bramą, ulicą dalej i znika w ciągu 2 h gry, residents −1, łóżko wolne od razu', () => {
    const { st, sim } = gra();
    const { pawn, id } = zOsoba(st);
    const pid = pawn.id;
    const r0 = residents(st).length;
    const lozko = st.things.find((t) => t.owner === pid)!;
    expect(govInput(st, w, 0).residents).toBe(r0);
    expect(wyprowadz(st, w, id)).toBe(true);
    // od razu: łóżko wolne, mieszkańców o jednego mniej dla zarządu, w wejściu nie ma też jego samego
    expect(lozko.owner).toBe(-1);
    expect(govInput(st, w, 0).residents).toBe(r0 - 1);
    expect(govInput(st, w, 0).lokatorzy?.map((q) => q.id) ?? []).not.toContain(id);
    expect(pawn.job?.t).toBe('odejscie');
    expect(jobText(st, w, pawn)).not.toBe('');
    const start = st.tick;
    let przezBrame = false;
    let naUlicy = false;
    let maxOdSiatki = 0;
    const exit = exitOf(w);
    const ex = exit % size;
    const ey = Math.floor(exit / size);
    while (st.pawns.includes(pawn) && st.tick < start + 2 * TICKS_HOUR) {
      sim.step();
      if (!st.pawns.includes(pawn)) break;
      const i = tileOf(pawn);
      if (gate.has(i)) przezBrame = true;
      if (przezBrame && !yard.has(i) && w.bid[i] < 0) naUlicy = true;
      maxOdSiatki = Math.max(maxOdSiatki, Math.abs((i % size) - ex) + Math.abs(Math.floor(i / size) - ey));
    }
    expect(st.pawns.includes(pawn)).toBe(false);
    expect(przezBrame).toBe(true);
    expect(naUlicy).toBe(true);
    // poszedł daleko za bramę, nie zniknął tuż za nią
    expect(maxOdSiatki).toBeGreaterThan(30);
    expect(st.tick - start).toBeLessThan(2 * TICKS_HOUR);
    expect(residents(st)).toHaveLength(r0 - 1);
    expect(govInput(st, w, 0).residents).toBe(r0 - 1);
    expect(lozko.owner).toBe(-1);
  });

  it('osoba zarządu: wychodzi bramą, znika, nie ma jej w people zarządu (ani od razu, ani później)', () => {
    const { st, sim } = gra();
    const p = core(st)[0];
    const id = personId(st, p);
    const inni = core(st).length - 1;
    // niesie drewno: zostaje na ziemi
    p.carry = 4;
    const drewno = (): number => st.things.filter((t) => t.kind === 'drewno').reduce((a, t) => a + t.n, 0);
    const d0 = drewno();
    expect(govInput(st, w, 0).people.map((q) => q.id)).toContain(id);
    expect(wyprowadz(st, w, id)).toBe(true);
    expect(p.carry).toBe(0);
    expect(drewno()).toBe(d0 + 4);
    expect(govInput(st, w, 0).people.map((q) => q.id)).not.toContain(id);
    expect(govInput(st, w, 0).people).toHaveLength(inni);
    expect(st.people.find((o) => o.id === id)?.gone).toBe(true);
    const start = st.tick;
    let przezBrame = false;
    while (st.pawns.includes(p) && st.tick < start + 2 * TICKS_HOUR) {
      sim.step();
      if (gate.has(tileOf(p))) przezBrame = true;
    }
    expect(st.pawns.includes(p)).toBe(false);
    expect(przezBrame).toBe(true);
    expect(govInput(st, w, 0).people.map((q) => q.id)).not.toContain(id);
    expect(snapshot(st, w).people.map((q) => q.id)).not.toContain(id);
    expect(core(st)).toHaveLength(inni);
  });

  it('wychodzący nie bierze poleceń ani nie wraca do planu dnia, a drugie wyprowadzenie nic nie zmienia', () => {
    const { st, sim } = gra();
    const p = core(st)[0];
    const id = personId(st, p);
    expect(wyprowadz(st, w, id)).toBe(true);
    const przed = hashString(JSON.stringify(st));
    expect(wyprowadz(st, w, id)).toBe(false);
    expect(hashString(JSON.stringify(st))).toBe(przed);
    sim.push({ t: 'guard', ids: [p.id], post: 'brama' });
    sim.push({ t: 'move', ids: [p.id], to: w.fence.yard[3] });
    for (let k = 0; k < 40; k++) sim.step();
    expect(p.job?.t).toBe('odejscie');
  });

  it('nieznane id: false; zarząd na wyprawie znika od razu', () => {
    const { st } = gra();
    expect(wyprowadz(st, w, 'nie ma takiego')).toBe(false);
    const p = core(st)[0];
    p.away = true;
    expect(wyprowadz(st, w, personId(st, p))).toBe(true);
    expect(st.pawns.includes(p)).toBe(false);
  });
});

describe('sprawdz: osoba zarządu idzie, stoi i wraca', () => {
  it('idzie od strony podwórka, stoi 10 minut gry i wraca do zajęć', () => {
    const { st, sim } = gra();
    const p = core(st)[0];
    const id = personId(st, p);
    // cel: kafelek siatki (zablokowany), więc ma stanąć na podwórku tuż obok
    const siatka = w.fence.tiles[Math.floor(w.fence.tiles.length / 2)];
    expect(yard.has(siatka)).toBe(false);
    expect(sprawdz(st, w, id, siatka)).toBe(true);
    expect(p.job?.t).toBe('sprawdz');
    expect(jobText(st, w, p)).not.toBe('');
    const start = st.tick;
    // ticki w tym świecie bywają ujemne (gra od 15:00 pierwszego dnia), więc brak to null, nie −1
    let przyszedl: number | null = null;
    let skonczyl: number | null = null;
    while (st.tick < start + 3000 && skonczyl === null) {
      sim.step();
      if (przyszedl === null && p.job?.t === 'sprawdz' && p.job.phase === 1) przyszedl = st.tick;
      if (przyszedl !== null && p.job?.t !== 'sprawdz') skonczyl = st.tick;
    }
    expect(przyszedl).not.toBeNull();
    expect(skonczyl).not.toBeNull();
    expect(przyszedl!).toBeGreaterThan(start);
    // 10 minut gry to 1/6 godziny
    expect(skonczyl! - przyszedl!).toBeGreaterThanOrEqual(Math.round(TICKS_HOUR / 6) - 1);
    expect(skonczyl! - przyszedl!).toBeLessThanOrEqual(Math.round(TICKS_HOUR / 6) + 3);
    // stał na podwórku, blisko siatki
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const sx = siatka % size;
    const sy = Math.floor(siatka / size);
    expect(Math.max(Math.abs(x - sx), Math.abs(y - sy))).toBeLessThanOrEqual(4);
    // wraca do zajęć: dalej żyje i może dostać pracę (nie stoi w nieskończoność na posterunku)
    for (let k = 0; k < 800; k++) sim.step();
    expect(p.job?.t).not.toBe('sprawdz');
    expect(st.pawns.includes(p)).toBe(true);
  });

  it('osoba, której nie ma, mieszkaniec i ktoś, kto wychodzi: false', () => {
    const { st } = gra();
    const { id } = zOsoba(st);
    const siatka = w.fence.tiles[0];
    expect(sprawdz(st, w, 'nie ma takiego', siatka)).toBe(false);
    // sprawdzać hałas może tylko zarząd
    expect(sprawdz(st, w, id, siatka)).toBe(false);
    const p = core(st)[0];
    expect(wyprowadz(st, w, personId(st, p))).toBe(true);
    expect(sprawdz(st, w, personId(st, p), siatka)).toBe(false);
  });
});

describe('potrzeby i nastroje dla każdego pionka z osobą', () => {
  it('fx.moods i fx.needs trafiają do mieszkańca z osobą, a zarząd działa jak dotąd', () => {
    const { st } = gra();
    const { pawn, id } = zOsoba(st);
    const zarzad = core(st)[0];
    const zid = personId(st, zarzad);
    const food = pawn.needs!.food;
    const zfood = zarzad.needs!.food;
    applyGov(
      st,
      w,
      fx((e) => {
        e.moods.push({ id, why: 'Pożegnaliśmy sąsiada', d: 2, hours: 24 });
        e.moods.push({ id: zid, why: 'Pożegnaliśmy sąsiada', d: 2, hours: 24 });
        e.moods.push({ id: 'nie ma takiego', why: 'Nic', d: 2, hours: 1 });
        e.needs.push({ id, d: { food: -10, mood: -3 } });
        e.needs.push({ id: zid, d: { food: -10 } });
      }),
    );
    expect(pawn.moods.find((m) => m.why === 'Pożegnaliśmy sąsiada')).toMatchObject({ d: 2 });
    expect(pawn.moods.find((m) => m.why === 'Pożegnaliśmy sąsiada')!.until).toBe(st.tick + 24 * TICKS_HOUR);
    expect(pawn.needs!.food).toBe(food - 10);
    expect(pawn.moods.some((m) => m.d === -3)).toBe(true);
    expect(zarzad.moods.some((m) => m.why === 'Pożegnaliśmy sąsiada')).toBe(true);
    expect(zarzad.needs!.food).toBe(zfood - 10);
  });

  it('mieszkaniec bez osoby (id tylko u zarządu) nie dostaje cudzych skutków', () => {
    const { st } = gra();
    const bez = residents(st).find((p) => p.person < 0)!;
    const przed = JSON.stringify(bez.moods);
    applyGov(
      st,
      w,
      fx((e) => e.moods.push({ id: personId(st, core(st)[0]), why: 'Tylko zarząd', d: 1, hours: 1 })),
    );
    expect(JSON.stringify(bez.moods)).toBe(przed);
  });
});

describe('zapis w połowie drogi', () => {
  it('zapis i wczytanie w połowie drogi wyrzuconego nie zmienia skrótu po 2 h', () => {
    const przygotuj = (): SimState => {
      const { st } = gra();
      const { id } = zOsoba(st);
      wyprowadz(st, w, id);
      wyprowadz(st, w, personId(st, core(st)[0]));
      return st;
    };
    const dwieGodziny = 2 * TICKS_HOUR;
    // bez zapisu
    const a = przygotuj();
    const simA = new Sim(w, a);
    const start = a.tick;
    for (let k = 0; k < dwieGodziny; k++) simA.step();
    // z zapisem po 300 krokach (obaj jeszcze idą ulicą albo do bramy)
    const b = przygotuj();
    const simB = new Sim(w, b);
    for (let k = 0; k < 300; k++) simB.step();
    expect(b.pawns.some((p) => p.job?.t === 'odejscie')).toBe(true);
    const wczytany: SimState = JSON.parse(JSON.stringify(b));
    const simC = new Sim(w, wczytany);
    for (let k = 300; k < dwieGodziny; k++) simC.step();
    expect(wczytany.tick).toBe(start + dwieGodziny);
    expect(simC.hash()).toBe(simA.hash());
    expect(wczytany.pawns.some((p) => p.job?.t === 'odejscie')).toBe(false);
  });
});

describe('applyGov: awans, wyrzucenie i sprawdzenie', () => {
  it('stosuje fx.awans, fx.wyrzuc i fx.sprawdz', () => {
    const { st } = gra();
    const a = zOsoba(st, 0);
    const b = zOsoba(st, 1);
    const zarzad = core(st);
    const c = zarzad[0];
    const d = zarzad[1];
    const siatka = w.fence.tiles[0];
    applyGov(
      st,
      w,
      fx((e) => {
        e.awans = [a.id, 'nie ma takiego'];
        e.wyrzuc = [b.id, personId(st, d)];
        e.sprawdz = [{ id: personId(st, c), tile: siatka }];
      }),
    );
    expect(a.pawn.kind).toBe('core');
    expect(b.pawn.job?.t).toBe('odejscie');
    expect(d.job?.t).toBe('odejscie');
    expect(c.job?.t).toBe('sprawdz');
  });

  it('bez nowych skutków applyGov nic nie zmienia', () => {
    const { st } = gra();
    zOsoba(st, 0);
    const przed = hashString(JSON.stringify(st));
    applyGov(st, w, emptyEffects());
    expect(hashString(JSON.stringify(st))).toBe(przed);
  });
});

describe('GovHost: awansuj, wyrzuc, sprawdz', () => {
  it('host zapisuje skutki w fx, a wyrzucona osoba zarządu znika z alive()', () => {
    const { st } = gra();
    const { id } = zOsoba(st);
    const zid = personId(st, core(st)[0]);
    const e = emptyEffects();
    const h = makeHost(newGov(7), govInput(st, w, 0), e);
    expect(e.awans).toBeUndefined();
    expect(h.alive().map((p) => p.id)).toContain(zid);
    h.awansuj(id);
    h.wyrzuc(zid);
    h.sprawdz(zid, 123);
    expect(e.awans).toEqual([id]);
    expect(e.wyrzuc).toEqual([zid]);
    expect(e.sprawdz).toEqual([{ id: zid, tile: 123 }]);
    expect(h.alive().map((p) => p.id)).not.toContain(zid);
    // to samo id drugi raz nie dubluje skutku
    h.awansuj(id);
    h.wyrzuc(zid);
    expect(e.awans).toEqual([id]);
    expect(e.wyrzuc).toEqual([zid]);
  });
});
