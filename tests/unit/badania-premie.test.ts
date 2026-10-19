/* Premie ery 1–2 i dokładanie do wszystkich palenisk (docs/superpowers/specs/2026-10-19-badania-design.md,
   „Technologie ery 1 i 2” i „Dokładanie do nowych źródeł ciepła”). Każda technologia ma przypadek z badaniem i
   przypadek bez niego, który daje dzisiejszą liczbę: t_okna (+3°C w heatStep), t_konserwy (plon ×1,2 z przenoszeniem
   ułamka w Thing.n), t_zielarstwo (lek z szansą 1/3 z generatora z ziarna), t_spawanie (części 1,5× szybciej),
   t_ambu (zdrowie wraca 1,6× szybciej); koza z beczki i kocioł (pali, grzeje, wybór paleniska do dokładania, dyżur
   przy kozie, wyliczenie drewna na noc); szklarnia i pieczarkarnia (plon). Sim na atrapie bloku z interior-mock.ts,
   bez zarządu na mapie (core 0) tam, gdzie liczy się sama mechanika. */

import { describe, expect, it } from 'vitest';
import { nightWood, WOOD_PER_HOUR } from '../../src/gov/noc.ts';
import { PALENISKA, PIECZARKI_PLON } from '../../src/sim/badania.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { HEAT_EVERY, heatStep, type RoomKind } from '../../src/sim/house.ts';
import { startNeeds, stepNeeds } from '../../src/sim/needs.ts';
import {
  BURN_TICKS,
  createSim,
  GARDEN_TICKS,
  GARDEN_YIELD,
  KOZA_CAP,
  type Pawn,
  Sim,
  type SimState,
  type Thing,
} from '../../src/sim/sim.ts';
import { pracaPrzepisu, RECIPES } from '../../src/sim/surowce.ts';
import { Atrapa } from './gov-atrapa.ts';
import { mockBlock } from './interior-mock.ts';

const block = mockBlock();
const house = block.interior;
const size = block.size;

/** kafelek w świecie atrapy (układ bloku przesunięty o (40, 58)) */
const tile = (x: number, y: number) => y * size + x;
const POKOJ = 1;
const PRZEDPOKOJ = 2;
const KUCHNIA = 3;
const LAZIENKA = 4;
const OBCY_POKOJ = 5;
const NASZE = [POKOJ, PRZEDPOKOJ, KUCHNIA, LAZIENKA];

const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - START_MINUTES / 60) * TICKS_PER_HOUR);

/** gra na atrapie bloku; core 0: nikt nie rusza rzeczy, tech: zbadane technologie (pole powstaje przy pierwszym użyciu) */
function gra(opts: { core?: number; tech?: string[]; seed?: number } = {}) {
  const st = createSim(block, opts.seed ?? 5, { core: opts.core ?? 0 });
  if (opts.tech) st.techDone = [...opts.tech];
  return { st, sim: new Sim(block, st) };
}

function rzecz(st: SimState, kind: string, x: number, y: number, over: Partial<Thing> = {}): Thing {
  const t: Thing = { id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n: 0, fuel: 0, by: -1, owner: -1, ...over };
  st.things.push(t);
  return t;
}

const jedzenie = (st: SimState) => st.things.filter((t) => t.kind === 'jedzenie').reduce((a, t) => a + t.n, 0);
const kozaZarzadu = (st: SimState) => st.things.find((t) => t.kind === 'koza')!;
const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const full = (kind: string) => KOZA_CAP * (PALENISKA[kind] ?? 1) * BURN_TICKS;

/** koza z beczki w pokoju zarządu i kocioł na klatce (2 × 1) */
const BECZKA = [56, 61] as const;
const KOCIOL = [50, 66] as const;

describe('t_okna: heatStep z dodatkiem do temperatury bazowej', () => {
  const kinds: RoomKind[] = ['pokoj', 'pokoj'];

  it('pokój bez ognia ustala się o 3°C wyżej, a pokój bez dodatku zostaje jak dziś', () => {
    const z = [9, 9];
    const bez = [9, 9];
    for (let k = 0; k < 4000; k++) {
      heatStep(z, kinds, [], [], 0, [3, 0]);
      heatStep(bez, kinds, [], [], 0);
    }
    // na zewnątrz 0°C, izolacja pokoju 2°C
    expect(bez[0]).toBeCloseTo(2, 1);
    expect(z[0]).toBeCloseTo(5, 1);
    expect(z[0] - bez[0]).toBeCloseTo(3, 1);
    expect(z[1]).toBe(bez[1]);
  });

  it('bez parametru i z samymi zerami dokładnie ten sam przebieg co dziś, także z ogniem', () => {
    const a = [9, 4];
    const b = [9, 4];
    const c = [9, 4];
    const links: [number, number][] = [[0, 1]];
    for (let k = 0; k < 300; k++) {
      heatStep(a, kinds, links, [0], -3);
      heatStep(b, kinds, links, [0], -3, [0, 0]);
      heatStep(c, kinds, links, [0], -3, undefined);
    }
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('w grze: po t_okna pokoje naszych mieszkań są o 3°C cieplejsze, cudze mieszkanie i klatka bez zmian', () => {
    const z = gra({ tech: ['t_okna'] });
    const bez = gra();
    // bez ognia pomieszczenie ustala się powoli (stała czasowa 10 godzin), więc 50 godzin
    for (let k = 0; k < 50 * TICKS_PER_HOUR; k++) {
      z.sim.step();
      bez.sim.step();
    }
    for (const r of NASZE) expect(z.st.temps[r] - bez.st.temps[r], `pokój ${r}`).toBeCloseTo(3, 0);
    for (const r of [0, OBCY_POKOJ]) expect(z.st.temps[r], `pokój ${r}`).toBe(bez.st.temps[r]);
  });

  it('inne badanie nie daje ciepła', () => {
    const z = gra({ tech: ['t_konserwy'] });
    const bez = gra();
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) {
      z.sim.step();
      bez.sim.step();
    }
    expect(z.st.temps).toEqual(bez.st.temps);
  });
});

describe('koza z beczki: pali drewno i grzeje swój pokój', () => {
  it('pół godziny na sztukę jak koza zarządu, pokój cieplejszy niż u bliźniaka bez niej, światło w pokoju', () => {
    const z = gra();
    const bez = gra();
    const beczka = rzecz(z.st, 'koza_beczka', ...BECZKA, { fuel: full('koza_beczka') });
    for (let k = 0; k < TICKS_PER_HOUR; k++) {
      z.sim.step();
      bez.sim.step();
    }
    // godzina to 2 sztuki z 4: 800 z 1600 ticków ognia
    expect(beczka.fuel).toBe(full('koza_beczka') - 2 * BURN_TICKS);
    expect(z.st.temps[POKOJ] - bez.st.temps[POKOJ]).toBeGreaterThan(4);
    expect(z.sim.boost[POKOJ]).toBeGreaterThan(0);
    expect(z.sim.light[POKOJ]).toBe(1);
    expect(bez.sim.boost[POKOJ]).toBe(0);
  });

  it('zimna koza z beczki nie grzeje i nie świeci', () => {
    const z = gra();
    rzecz(z.st, 'koza_beczka', ...BECZKA, { fuel: 0 });
    for (let k = 0; k < 400; k++) z.sim.step();
    expect(z.sim.boost[POKOJ]).toBe(0);
    expect(z.sim.light[POKOJ]).toBe(0);
  });

  it('wagi drewna: koza i koza z beczki jedna, kocioł trzy; koza zarządu pali jak dawniej (sztuka w pół godziny)', () => {
    expect(PALENISKA).toEqual({ koza: 1, koza_beczka: 1, kociol: 3 });
    const z = gra();
    const koza = kozaZarzadu(z.st);
    koza.fuel = full('koza');
    for (let k = 0; k < TICKS_PER_HOUR; k++) z.sim.step();
    expect(koza.fuel).toBe(full('koza') - 2 * BURN_TICKS);
  });
});

describe('kocioł: wszystkie pokoje naszych mieszkań, drewno trzy razy szybciej', () => {
  it('zjada trzy razy więcej drewna na godzinę niż koza z beczki i ma trzy razy większy zbiornik', () => {
    const z = gra();
    const beczka = rzecz(z.st, 'koza_beczka', ...BECZKA, { fuel: full('koza_beczka') });
    const kociol = rzecz(z.st, 'kociol', ...KOCIOL, { w: 2, fuel: full('kociol') });
    expect(PALENISKA.kociol).toBe(3);
    expect(full('kociol')).toBe(3 * full('koza_beczka'));
    for (let k = 0; k < TICKS_PER_HOUR; k++) z.sim.step();
    const beczkaZjadla = full('koza_beczka') - beczka.fuel;
    const kociolZjadl = full('kociol') - kociol.fuel;
    expect(beczkaZjadla).toBe(2 * BURN_TICKS);
    expect(kociolZjadl).toBe(3 * beczkaZjadla);
    // w sztukach drewna: 2 i 6 na godzinę
    expect(kociolZjadl / BURN_TICKS).toBe(6);
  });

  it('grzeje wszystkie pomieszczenia naszego mieszkania, a cudze mieszkanie najwyżej przez drzwi klatki', () => {
    const z = gra();
    const bez = gra();
    rzecz(z.st, 'kociol', ...KOCIOL, { w: 2, fuel: full('kociol') });
    for (let k = 0; k < TICKS_PER_HOUR; k++) {
      z.sim.step();
      bez.sim.step();
    }
    const zysk = (r: number) => z.st.temps[r] - bez.st.temps[r];
    for (const r of NASZE) expect(zysk(r), `pokój ${r}`).toBeGreaterThan(4);
    // obcy pokój dostaje ciepło tylko przez klatkę (dwie pary drzwi: ćwierć ocieplenia), więc dużo mniej
    expect(zysk(OBCY_POKOJ)).toBeLessThan(zysk(POKOJ) / 2);
  });

  it('świeci tylko w swoim pomieszczeniu (klatka), przez drzwi w półmroku, a nie w oknach całego mieszkania', () => {
    const z = gra();
    rzecz(z.st, 'kociol', ...KOCIOL, { w: 2, fuel: full('kociol') });
    for (let k = 0; k < 400; k++) z.sim.step();
    const klatka = house.room[tile(...KOCIOL)];
    expect(klatka).toBe(0);
    expect(z.sim.light[klatka]).toBe(1);
    // drzwi z klatki: przedpokój naszego mieszkania i cudzy pokój w półmroku, reszta naszych pokoi ciemna
    expect(z.sim.light[PRZEDPOKOJ]).toBe(0.5);
    expect(z.sim.light[OBCY_POKOJ]).toBe(0.5);
    for (const r of [POKOJ, KUCHNIA, LAZIENKA]) expect(z.sim.light[r], `światło ${r}`).toBe(0);
    // a ciepło idzie do wszystkich naszych pokoi mimo to
    for (const r of NASZE) expect(z.sim.boost[r], `ciepło ${r}`).toBeGreaterThan(0);
  });

  it('kocioł razem z kozą zarządu: kuchnia też świeci, a grzeją obie rzeczy naraz', () => {
    const z = gra();
    kozaZarzadu(z.st).fuel = full('koza');
    rzecz(z.st, 'kociol', ...KOCIOL, { w: 2, fuel: full('kociol') });
    for (let k = 0; k < 400; k++) z.sim.step();
    expect(z.sim.light[KUCHNIA]).toBe(1);
    expect(z.sim.light[0]).toBe(1);
    expect(z.sim.light[POKOJ]).toBe(0);
    expect(z.sim.light[LAZIENKA]).toBe(0);
  });

  it('bez ognia w kotle nie grzeje nic', () => {
    const z = gra();
    const bez = gra();
    rzecz(z.st, 'kociol', ...KOCIOL, { w: 2, fuel: 0 });
    for (let k = 0; k < 800; k++) {
      z.sim.step();
      bez.sim.step();
    }
    expect(z.st.temps).toEqual(bez.st.temps);
  });
});

describe('dokładanie: bezczynny zarząd dokłada do paleniska, któremu zostało najmniej ognia', () => {
  const sklad = house.sklad[0];
  /** gra z dwiema osobami, drewnem w składzie i koza zarządu na zadanym ogniu; sztuki drewna w składzie to 6 */
  function ustaw(ogienKozy: number) {
    const g = gra({ core: 2 });
    const koza = kozaZarzadu(g.st);
    koza.fuel = ogienKozy;
    rzecz(g.st, 'drewno', sklad % size, Math.floor(sklad / size), { n: 6 });
    return { ...g, koza, p: rdzen(g.st)[0], q: rdzen(g.st)[1] };
  }
  /** bezczynny zarząd szuka palenisk: `startRefuel(p, false)` z domyślnym celem; id wybranego albo −1 */
  function wybor(sim: Sim, p: Pawn): number {
    const ok = (sim as unknown as { startRefuel(p: Pawn, order: boolean): boolean }).startRefuel(p, false);
    return ok && p.job?.t === 'refuel' ? p.job.target : -1;
  }

  it('z jedną kozą zarządu wybór jest ten sam co dziś: koza, gdy zostało mniej niż sztuka, a nic, gdy więcej', () => {
    const a = ustaw(300);
    expect(wybor(a.sim, a.p)).toBe(a.koza.id);
    const b = ustaw(BURN_TICKS);
    expect(wybor(b.sim, b.p)).toBe(-1);
    expect(b.p.job).toBeNull();
  });

  it('koza z beczki z mniejszym ogniem wygrywa z kozą zarządu, a przy remisie wygrywa koza zarządu', () => {
    const a = ustaw(300);
    const beczka = rzecz(a.st, 'koza_beczka', ...BECZKA, { fuel: 100 });
    expect(wybor(a.sim, a.p)).toBe(beczka.id);
    const b = ustaw(200);
    rzecz(b.st, 'koza_beczka', ...BECZKA, { fuel: 200 });
    expect(wybor(b.sim, b.p)).toBe(b.koza.id);
  });

  it('palenisko zajęte przez kogoś innego albo pełne się pomija', () => {
    const a = ustaw(300);
    rzecz(a.st, 'koza_beczka', ...BECZKA, { fuel: 100, by: a.q.id });
    expect(wybor(a.sim, a.p)).toBe(a.koza.id);
    // pełna koza z beczki (nie zmieści się nawet sztuka) przy zimnej kozie zarządu: dokłada do zarządu
    const b = ustaw(0);
    rzecz(b.st, 'koza_beczka', ...BECZKA, { fuel: full('koza_beczka') });
    expect(wybor(b.sim, b.p)).toBe(b.koza.id);
  });

  it('kocioł liczy się czasem do końca ognia: ogień w jednostkach drewna dzieli przez wagę', () => {
    // kocioł z 1000 jednostek ognia pali się 333 ticki, koza z 380 jednostkami 380: kocioł pierwszy
    const a = ustaw(380);
    const kociol = rzecz(a.st, 'kociol', ...KOCIOL, { w: 2, fuel: 1000 });
    expect(wybor(a.sim, a.p)).toBe(kociol.id);
    // kocioł z 1300 ma ponad pół godziny ognia (433 ticki): jeszcze nie dokłada
    const b = ustaw(380);
    rzecz(b.st, 'kociol', ...KOCIOL, { w: 2, fuel: 1300 });
    expect(wybor(b.sim, b.p)).toBe(b.koza.id);
    // prawie pełny kocioł (12 sztuk) nie dokłada, a koza zarządu ma ponad sztukę
    const c = ustaw(BURN_TICKS);
    rzecz(c.st, 'kociol', ...KOCIOL, { w: 2, fuel: full('kociol') - 100 });
    expect(wybor(c.sim, c.p)).toBe(-1);
  });

  it('w trakcie gry zarząd rozpala wszystkie zimne paleniska z zapasu drewna w składzie', () => {
    const g = ustaw(0);
    const beczka = rzecz(g.st, 'koza_beczka', ...BECZKA, { fuel: 0 });
    const kociol = rzecz(g.st, 'kociol', ...KOCIOL, { w: 2, fuel: 0 });
    g.st.things.find((t) => t.kind === 'drewno')!.n = 40;
    const max = new Map<number, number>();
    for (let k = 0; k < 3 * TICKS_PER_HOUR; k++) {
      g.sim.step();
      for (const t of [g.koza, beczka, kociol]) max.set(t.id, Math.max(max.get(t.id) ?? 0, t.fuel));
    }
    expect(max.get(g.koza.id)).toBeGreaterThan(0);
    expect(max.get(beczka.id)).toBeGreaterThan(0);
    expect(max.get(kociol.id)).toBeGreaterThan(0);
  });

  it('polecenie „dołóż” przyjmuje kozę z beczki i kocioł, tak jak kozę i ognisko', () => {
    for (const [kind, x, y, w] of [
      ['koza_beczka', ...BECZKA, 1],
      ['kociol', ...KOCIOL, 2],
    ] as const) {
      const g = ustaw(full('koza'));
      const palenisko = rzecz(g.st, kind, x, y, { w, fuel: 0 });
      g.sim.push({ t: 'refuel', ids: [g.p.id], thing: palenisko.id });
      g.sim.step();
      expect(g.p.job?.t, kind).toBe('refuel');
      expect(g.p.job?.target, kind).toBe(palenisko.id);
    }
  });

  it('dyżur przy kozie dokłada też do kozy z beczki i do kotła', () => {
    const g = ustaw(full('koza'));
    const beczka = rzecz(g.st, 'koza_beczka', ...BECZKA, { fuel: 0 });
    g.st.things.find((t) => t.kind === 'drewno')!.n = 12;
    g.sim.push({ t: 'guard', ids: [g.p.id], post: 'koza' });
    let max = 0;
    for (let k = 0; k < 2 * TICKS_PER_HOUR && max === 0; k++) {
      g.sim.step();
      max = Math.max(max, beczka.fuel);
    }
    expect(max).toBeGreaterThan(0);
    expect(g.p.job?.t).toBe('guard');
  });
});

describe('karta nocy: nightWood i GovInput.paleniska', () => {
  const base = new Atrapa(2).input();
  const at = (hour: number, wood: number, paleniska?: number) => ({
    ...base,
    hour,
    minute: 0,
    kitchen: 19,
    kozaLit: true,
    stock: { ...base.stock, wood },
    ...(paleniska === undefined ? {} : { paleniska }),
  });

  it('bez pola i z jednym paleniskiem liczy jak dziś', () => {
    expect(nightWood(at(22, 20))).toEqual({ have: 20, need: 16, until: '6:00' });
    expect(nightWood(at(22, 20, 1))).toEqual(nightWood(at(22, 20)));
    expect(nightWood(at(20, 8))).toEqual({ have: 8, need: 20, until: '0:00' });
  });

  it('z paleniska: 3 potrzeba trzy razy więcej drewna i starcza na trzy razy krócej', () => {
    expect(nightWood(at(22, 60, 3))).toEqual({ have: 60, need: 3 * 16, until: '6:00' });
    expect(nightWood(at(22, 20, 3))).toEqual({ have: 20, need: 48, until: '1:00' });
    expect(nightWood(at(22, 20, 3)).need).toBe(3 * nightWood(at(22, 20)).need);
    expect(WOOD_PER_HOUR).toBe(2);
  });

  it('govInput niesie liczbę palenisk dopiero, gdy stoją nowe (koza zarządu 1, beczka 1, kocioł 3)', () => {
    const g = gra();
    expect(govInput(g.st, block, 0).paleniska).toBeUndefined();
    rzecz(g.st, 'koza_beczka', ...BECZKA);
    expect(govInput(g.st, block, 0).paleniska).toBe(2);
    rzecz(g.st, 'kociol', ...KOCIOL, { w: 2 });
    expect(govInput(g.st, block, 0).paleniska).toBe(5);
  });

  it('govInput liczy tylko paleniska, które stoją: bez kozy zarządu nie dolicza „1”', () => {
    const g = gra();
    g.st.things = g.st.things.filter((t) => t.kind !== 'koza');
    // bez kozy i bez nowych palenisk pola nie ma (karta liczy jedną kozę po staremu)
    expect(govInput(g.st, block, 0).paleniska).toBeUndefined();
    rzecz(g.st, 'koza_beczka', ...BECZKA);
    expect(govInput(g.st, block, 0).paleniska).toBe(1);
    rzecz(g.st, 'kociol', ...KOCIOL, { w: 2 });
    expect(govInput(g.st, block, 0).paleniska).toBe(4);
  });

  it('koza spoza mieszkania zarządu nie jest kozą zarządu i nie liczy się do palenisk', () => {
    const g = gra();
    g.st.things = g.st.things.filter((t) => t.kind !== 'koza');
    // pokój cudzego mieszkania (OBCY_POKOJ) ma kafelek poza mieszkaniem zarządu
    const obcy = house.rooms.find((r) => r.id === OBCY_POKOJ)!;
    const i = [...Array(size * size).keys()].find((k) => house.room[k] === obcy.id)!;
    rzecz(g.st, 'koza', i % size, Math.floor(i / size));
    rzecz(g.st, 'koza_beczka', ...BECZKA);
    expect(govInput(g.st, block, 0).paleniska).toBe(1);
  });
});

describe('plon ogródka, szklarni i pieczarkarni', () => {
  const OGRODEK = [54, 75] as const;
  const SZKLARNIA = [60, 75] as const;
  const PIECZARKARNIA = [61, 69] as const;

  /** jeden plon: rzecz tuż przed progiem, krok ciepła ją przekracza; zwraca przyrost jedzenia */
  function plon(g: ReturnType<typeof gra>, t: Thing): number {
    while (g.st.tick % HEAT_EVERY !== 0) g.sim.step();
    const przed = jedzenie(g.st);
    t.fuel = GARDEN_TICKS - HEAT_EVERY;
    g.sim.step();
    return jedzenie(g.st) - przed;
  }
  const sezon = (nr: number) => atHour(1 + nr * 10, 12);
  const SEZONY = ['jesień', 'zima', 'wiosna', 'lato'];

  it('ogródek daje plon według pory roku jak dziś, bez badań i z cudzym badaniem', () => {
    for (const tech of [undefined, ['t_okna']]) {
      SEZONY.forEach((nazwa, nr) => {
        const g = gra({ tech });
        g.st.tick = sezon(nr);
        const o = rzecz(g.st, 'ogrodek', ...OGRODEK, { w: 3, h: 2 });
        expect(plon(g, o), nazwa).toBe(GARDEN_YIELD[nr]);
        expect(o.n, nazwa).toBe(0);
      });
    }
  });

  it('t_konserwy: dziesięć plonów daje dokładnie 1,2 × plon bez badania, ułamek siedzi w Thing.n', () => {
    SEZONY.forEach((nazwa, nr) => {
      const z = gra({ tech: ['t_konserwy'] });
      const bez = gra();
      z.st.tick = sezon(nr);
      bez.st.tick = sezon(nr);
      const oz = rzecz(z.st, 'ogrodek', ...OGRODEK, { w: 3, h: 2 });
      const ob = rzecz(bez.st, 'ogrodek', ...OGRODEK, { w: 3, h: 2 });
      let sumaZ = 0;
      let sumaB = 0;
      for (let k = 0; k < 10; k++) {
        sumaZ += plon(z, oz);
        sumaB += plon(bez, ob);
        expect(oz.n, `${nazwa} plon ${k}`).toBeGreaterThanOrEqual(0);
        expect(oz.n, `${nazwa} plon ${k}`).toBeLessThan(1);
      }
      expect(sumaB, nazwa).toBe(10 * GARDEN_YIELD[nr]);
      expect(sumaZ, nazwa).toBe(12 * GARDEN_YIELD[nr]);
    });
  });

  it('t_konserwy dotyczy też szklarni i pieczarkarni, a ułamek jest osobny dla każdej rzeczy', () => {
    const g = gra({ tech: ['t_konserwy'] });
    g.st.tick = sezon(0);
    const s = rzecz(g.st, 'szklarnia', ...SZKLARNIA, { w: 3, h: 2 });
    const p = rzecz(g.st, 'pieczarkarnia', ...PIECZARKARNIA);
    let suma = 0;
    for (let k = 0; k < 10; k++) {
      while (g.st.tick % HEAT_EVERY !== 0) g.sim.step();
      const przed = jedzenie(g.st);
      s.fuel = GARDEN_TICKS - HEAT_EVERY;
      p.fuel = GARDEN_TICKS - HEAT_EVERY;
      g.sim.step();
      suma += jedzenie(g.st) - przed;
    }
    // jesienią szklarnia 2 i pieczarkarnia 2: razem 10 × 4 × 1,2
    expect(GARDEN_YIELD[0]).toBe(2);
    expect(PIECZARKI_PLON).toBe(2);
    expect(suma).toBe(48);
  });

  it('szklarnia zimą rodzi jak jesienią, w pozostałych porach jak ogródek; ogródek zimą swój zimowy', () => {
    SEZONY.forEach((nazwa, nr) => {
      const g = gra();
      g.st.tick = sezon(nr);
      const s = rzecz(g.st, 'szklarnia', ...SZKLARNIA, { w: 3, h: 2 });
      expect(plon(g, s), nazwa).toBe(GARDEN_YIELD[nr === 1 ? 0 : nr]);
    });
    expect(GARDEN_YIELD[1]).toBe(0);
    const g = gra();
    g.st.tick = sezon(1);
    const o = rzecz(g.st, 'ogrodek', ...OGRODEK, { w: 3, h: 2 });
    expect(plon(g, o)).toBe(0);
  });

  it('pieczarkarnia daje stały plon przez cały rok, w swoim pomieszczeniu', () => {
    for (const [nazwa, nr] of SEZONY.map((s, i) => [s, i] as const)) {
      const g = gra();
      g.st.tick = sezon(nr);
      const p = rzecz(g.st, 'pieczarkarnia', ...PIECZARKARNIA);
      expect(plon(g, p), nazwa).toBe(PIECZARKI_PLON);
    }
    const g = gra();
    const p = rzecz(g.st, 'pieczarkarnia', ...PIECZARKARNIA);
    const wLazience = (st: SimState) =>
      st.things
        .filter((t) => t.kind === 'jedzenie' && house.room[tile(t.x, t.y)] === LAZIENKA)
        .reduce((a, t) => a + t.n, 0);
    const przed = wLazience(g.st);
    plon(g, p);
    expect(wLazience(g.st) - przed).toBe(PIECZARKI_PLON);
  });
});

describe('t_zielarstwo: lek z plonu ogródka', () => {
  const OGRODEK = [54, 75] as const;
  function trzydziesci(tech: string[] | undefined, seed = 5) {
    const g = gra({ tech, seed });
    g.st.tick = atHour(1, 12);
    const o = rzecz(g.st, 'ogrodek', ...OGRODEK, { w: 3, h: 2 });
    const przed = g.st.store.meds;
    for (let k = 0; k < 30; k++) {
      while (g.st.tick % HEAT_EVERY !== 0) g.sim.step();
      o.fuel = GARDEN_TICKS - HEAT_EVERY;
      g.sim.step();
      // następny plon w innym ticku (inne wejście losowania)
      for (let i = 0; i < 7 * HEAT_EVERY; i++) g.sim.step();
    }
    return { razem: g.st.store.meds - przed, rng: g.st.rng.s };
  }

  it('w 30 plonach jest między 5 a 15 leków, deterministycznie, a bez badania ani jednego', () => {
    const a = trzydziesci(['t_zielarstwo']);
    expect(a.razem).toBeGreaterThanOrEqual(5);
    expect(a.razem).toBeLessThanOrEqual(15);
    expect(trzydziesci(['t_zielarstwo']).razem).toBe(a.razem);
    expect(trzydziesci(undefined).razem).toBe(0);
    expect(trzydziesci(['t_konserwy']).razem).toBe(0);
  });

  it('losowanie nie rusza st.rng: ten sam generator gry z badaniem i bez', () => {
    expect(trzydziesci(['t_zielarstwo']).rng).toBe(trzydziesci(undefined).rng);
  });

  it('zimą ogródek nic nie rodzi, więc i leku nie ma', () => {
    const g = gra({ tech: ['t_zielarstwo'] });
    g.st.tick = atHour(11, 12);
    const o = rzecz(g.st, 'ogrodek', ...OGRODEK, { w: 3, h: 2 });
    for (let k = 0; k < 30; k++) {
      while (g.st.tick % HEAT_EVERY !== 0) g.sim.step();
      o.fuel = GARDEN_TICKS - HEAT_EVERY;
      g.sim.step();
    }
    expect(g.st.store.meds).toBe(0);
  });
});

describe('t_spawanie: części 1,5× szybciej', () => {
  it('pracaPrzepisu: części dzielone przez 1,5 tylko po badaniu, deski bez zmian', () => {
    expect(pracaPrzepisu('czesci', ['t_spawanie'])).toBe(RECIPES.czesci.work / 1.5);
    expect(pracaPrzepisu('czesci')).toBe(RECIPES.czesci.work);
    expect(pracaPrzepisu('czesci', [])).toBe(RECIPES.czesci.work);
    expect(pracaPrzepisu('czesci', ['t_okna'])).toBe(RECIPES.czesci.work);
    expect(pracaPrzepisu('deski', ['t_spawanie'])).toBe(RECIPES.deski.work);
    expect(pracaPrzepisu('deski')).toBe(RECIPES.deski.work);
  });

  /** zarząd przy warsztacie robi jedną część ze złomu; zwraca czas jednej sztuki (j.until − j.t0) */
  function czasCzesci(tech?: string[]): number {
    const g = gra({ core: 1, tech });
    const [p] = rdzen(g.st);
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
    kozaZarzadu(g.st).fuel = 10 * TICKS_PER_HOUR;
    rzecz(g.st, 'warsztat', 60, 61, { w: 2, h: 1 });
    rzecz(g.st, 'zlom', 56, 61, { n: 4 });
    g.sim.push({ t: 'saw', ids: [p.id], what: 'czesci', n: 1 });
    for (let k = 0; k < 4000 && !(p.job?.t === 'saw' && p.job.phase === 1); k++) g.sim.step();
    expect(p.job?.t).toBe('saw');
    return p.job!.until - p.job!.t0;
  }

  it('w grze jedna część trwa godzinę, a po t_spawanie 40 minut', () => {
    expect(czasCzesci()).toBe(RECIPES.czesci.work);
    expect(czasCzesci(['t_spawanie'])).toBe(RECIPES.czesci.work / 1.5);
    expect(czasCzesci(['t_okna'])).toBe(RECIPES.czesci.work);
  });
});

describe('t_ambu: zdrowie wraca 1,6× szybciej', () => {
  const zdrowy = { temp: 21, fire: false, asleep: false, busy: false, dark: false, inside: true, company: 2 };

  it('stepNeeds: przyrost zdrowia razy heal, domyślnie 1, a ubytek (głód, zimno) bez zmian', () => {
    const od = (heal?: number) => {
      const n = { ...startNeeds(), health: 40, food: 80, warm: 80, rest: 80 };
      stepNeeds(n, { ...zdrowy, ...(heal === undefined ? {} : { heal }) }, 1);
      return n.health - 40;
    };
    expect(od()).toBeCloseTo(0.5, 10);
    expect(od(1)).toBe(od());
    expect(od(1.6)).toBeCloseTo(0.8, 10);
    // głodny traci zdrowie tak samo z premią i bez
    const glodny = (heal?: number) => {
      const n = { ...startNeeds(), health: 40, food: 5, warm: 80, rest: 80 };
      stepNeeds(n, { ...zdrowy, ...(heal === undefined ? {} : { heal }) }, 1);
      return n.health;
    };
    expect(glodny(1.6)).toBe(glodny());
  });

  /** zdrowie osoby zarządu po godzinie gry, od 40 (syta, ciepła, wypoczęta) */
  function zdrowieJutro(tech?: string[]): number {
    const g = gra({ core: 1, tech });
    const [p] = rdzen(g.st);
    p.needs = { food: 100, warm: 100, rest: 100, health: 40, safe: 60, mood: 0 };
    kozaZarzadu(g.st).fuel = 10 * TICKS_PER_HOUR;
    for (let k = 0; k < TICKS_PER_HOUR; k++) g.sim.step();
    return p.needs!.health - 40;
  }

  it('w grze: z t_ambu zdrowie wraca 1,6 razy więcej niż bez badania', () => {
    const bez = zdrowieJutro();
    expect(bez).toBeGreaterThan(0);
    expect(zdrowieJutro(['t_ambu']) / bez).toBeCloseTo(1.6, 1);
    expect(zdrowieJutro(['t_okna'])).toBe(bez);
  });
});
