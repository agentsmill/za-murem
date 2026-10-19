/* Koza z głową (godzina na sztukę drewna, `kozaWanted`: KOZA_WARM, KOZA_MIN, KOZA_EVENING) razem z rodzajem pracy Ogień
   (src/sim/praca.ts, priorytety osoby) po scaleniu `praca-ludzi` z `noc-integracja` f13ad36:
   - progi kozy mówią, KIEDY ogień jest potrzebny (`startRefuel` bez polecenia pyta `kozaWanted`), a priorytet rodzaju
     Ogień mówi, KTO dokłada: osoba z Ogniem 0 nie dokłada nigdy, z Ogniem większym od 0 tylko wtedy, gdy ogień jest
     potrzebny;
   - dwie osoby nie dokładają do tego samego paleniska;
   - gasnąca koza zarządu idzie przed priorytetami i dokłada do niej `think()` z kozą zarządu jako celem, więc reguła
     „najmniej ognia” (palenisko, któremu zostało najmniej czasu) działa tylko w rodzaju Ogień: świadoma decyzja po
     scaleniu z badaniami (koza z beczki, kocioł);
   - zapas drewna dla progu Drwala liczy to samo co pasek u góry (`snapshot().stock.wood`): ogień we wszystkich naszych
     paleniskach i drewno zdjęte z rąk na czas przerwanego polecenia, bez drewna na ulicy.
   Sim na atrapie bloku z interior-mock.ts (jak badania-premie.test.ts). */

import { describe, expect, it } from 'vitest';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { priorytet } from '../../src/sim/praca.ts';
import {
  BURN_TICKS,
  createSim,
  type Job,
  type JobKind,
  KOZA_EVENING,
  KOZA_MIN,
  KOZA_WARM,
  type Pawn,
  Sim,
  type SimState,
  type Thing,
} from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock } from './interior-mock.ts';
import { skonczSamouczek } from './praca-pomoc.ts';

const block = mockBlock();
const house = block.interior;
const size = block.size;

/** koza z beczki w pokoju zarządu i kocioł na klatce (2 × 1), jak w badania-premie.test.ts */
const BECZKA = [56, 61] as const;
const KOCIOL = [50, 66] as const;
/** pokoje naszych mieszkań w atrapie */
const NASZE = [1, 2, 3, 4];

const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - START_MINUTES / 60) * TICKS_PER_HOUR);

interface Prywatne {
  think(p: Pawn): void;
  zapasDrewna(): number;
  kozaWanted(): boolean;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

function rzecz(st: SimState, kind: string, x: number, y: number, over: Partial<Thing> = {}): Thing {
  const t: Thing = { id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n: 0, fuel: 0, by: -1, owner: -1, ...over };
  st.things.push(t);
  return t;
}
const kozaZarzadu = (st: SimState) => st.things.find((t) => t.kind === 'koza')!;
const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const jaka = (p: Pawn): string => p.job?.t ?? '-';

/** Dwie osoby zarządu w ciepłym mieszkaniu, dzień 2 o 12:00 po samouczku, sześć sztuk drewna w składzie (w jednym
    stosie albo, z `stosy` równym 2, w dwóch po trzy: wtedy drugą osobę od tej samej kozy powstrzymuje już tylko to, że
    koza ma obsługującego, a nie brak wolnego stosu), koza zarządu z podanym ogniem; nikt nie marznie, więc ogień nie
    jest potrzebny, dopóki test tego nie zmieni. */
function ustaw(ogienKozy: number, godzina = 12, stosy = 1) {
  const st = createSim(block, 5, { core: 2 });
  const sim = new Sim(block, st);
  skonczSamouczek(sim);
  st.tick = atHour(2, godzina);
  for (const r of NASZE) st.temps[r] = 20;
  const koza = kozaZarzadu(st);
  koza.fuel = ogienKozy;
  for (let k = 0; k < stosy; k++) {
    const sklad = house.sklad[k];
    rzecz(st, 'drewno', sklad % size, Math.floor(sklad / size), { n: 6 / stosy });
  }
  const [p, q] = rdzen(st);
  for (const o of [p, q]) {
    o.job = null;
    o.path = [];
    o.pi = 0;
    o.wait = st.tick;
    Object.assign(o.needs!, { food: 90, rest: 90, warm: 90 });
  }
  return { st, sim, koza, p, q };
}

describe('progi kozy i priorytet Ogień', () => {
  it('stałe progów: ogień potrzebny od ciepła poniżej KOZA_WARM, mieszkania poniżej KOZA_MIN i wieczorem od KOZA_EVENING', () => {
    expect(KOZA_WARM).toBe(60);
    expect(KOZA_MIN).toBe(12);
    expect(KOZA_EVENING).toBe(18);
    // godzina na sztukę drewna
    expect(BURN_TICKS).toBe(TICKS_PER_HOUR);
  });

  it('gdy ogień nie jest potrzebny (ciepło, południe), nikt z Ogniem 1 nie dokłada, choć koza gaśnie', () => {
    const { sim, p, q, koza } = ustaw(300);
    expect(prv(sim).kozaWanted()).toBe(false);
    expect(priorytet(sim.st, p.person, 'ogien')).toBe(1);
    prv(sim).think(p);
    prv(sim).think(q);
    expect(jaka(p)).not.toBe('refuel');
    expect(jaka(q)).not.toBe('refuel');
    expect(koza.by).toBe(-1);
  });

  it('gdy ogień jest potrzebny, dokłada osoba z Ogniem 1, a z Ogniem 0 nigdy', () => {
    const { sim, st, p, q, koza } = ustaw(300);
    // ktoś zaczyna marznąć: ogień potrzebny
    p.needs!.warm = KOZA_WARM - 5;
    q.needs!.warm = KOZA_WARM - 5;
    expect(prv(sim).kozaWanted()).toBe(true);
    // q wyłącza Ogień (stan jak po poleceniu `prio`; bez kroku symulacji, który sam dałby obu osobom pracę)
    st.praca = { osoby: { [q.person]: { prio: { ogien: 0 } } } };
    expect(priorytet(st, q.person, 'ogien')).toBe(0);
    prv(sim).think(q);
    expect(jaka(q)).not.toBe('refuel');
    expect(koza.by).not.toBe(q.id);
    prv(sim).think(p);
    expect(jaka(p)).toBe('refuel');
    expect(p.job?.target).toBe(koza.id);
    expect(koza.by).toBe(p.id);
  });

  it('dwie osoby z Ogniem 1 w tej samej sekundzie nie dokładają do tej samej kozy, także gdy drewna jest w dwóch stosach', () => {
    const { sim, p, q, koza } = ustaw(300, 12, 2);
    p.needs!.warm = KOZA_WARM - 5;
    q.needs!.warm = KOZA_WARM - 5;
    prv(sim).think(p);
    prv(sim).think(q);
    const dokladajacy = [p, q].filter((o) => jaka(o) === 'refuel' && o.job?.target === koza.id);
    expect(dokladajacy).toHaveLength(1);
    expect(koza.by).toBe(dokladajacy[0].id);
  });

  it('wieczorem (od KOZA_EVENING) ogień jest potrzebny bez marznięcia, a w tej samej sekundzie dokłada jedna osoba', () => {
    const { sim, p, q, koza } = ustaw(300, KOZA_EVENING + 0.5, 2);
    expect(prv(sim).kozaWanted()).toBe(true);
    prv(sim).think(p);
    prv(sim).think(q);
    expect([p, q].filter((o) => jaka(o) === 'refuel' && o.job?.target === koza.id)).toHaveLength(1);
  });
});

describe('gasnąca koza zarządu przed „najmniej ognia” z rodzaju Ogień', () => {
  it('think() dokłada najpierw do kozy zarządu, choć kociołowi zostało mniej czasu; rodzaj Ogień wybiera najmniej ognia', () => {
    // kocioł z 600 jednostkami ognia pali się 200 ticków (waga 3), koza zarządu z 300 jednostkami 300: gdyby wybór
    // szedł po „najmniej ognia”, wygrałby kocioł
    const a = ustaw(300);
    a.p.needs!.warm = KOZA_WARM - 5;
    const kociol = rzecz(a.st, 'kociol', ...KOCIOL, { w: 2, fuel: 600 });
    expect(prv(a.sim).kozaWanted()).toBe(true);
    const wybor = (sim: Sim, p: Pawn) => {
      const ok = (sim as unknown as { startRefuel(p: Pawn, order: boolean): boolean }).startRefuel(p, false);
      return ok && p.job?.t === 'refuel' ? p.job.target : -1;
    };
    expect(wybor(a.sim, a.p)).toBe(kociol.id);
    // ten sam stan, ale decyzję podejmuje think(): najpierw gasnąca koza zarządu
    const b = ustaw(300);
    b.p.needs!.warm = KOZA_WARM - 5;
    rzecz(b.st, 'kociol', ...KOCIOL, { w: 2, fuel: 600 });
    prv(b.sim).think(b.p);
    expect(jaka(b.p)).toBe('refuel');
    expect(b.p.job?.target).toBe(b.koza.id);
    // koza zarządu ma ponad sztukę, kocioł mało: step 1 nic nie robi, rodzaj Ogień dokłada do kotła
    const c = ustaw(BURN_TICKS * 2);
    c.p.needs!.warm = KOZA_WARM - 5;
    const kociolC = rzecz(c.st, 'kociol', ...KOCIOL, { w: 2, fuel: 600 });
    prv(c.sim).think(c.p);
    expect(jaka(c.p)).toBe('refuel');
    expect(c.p.job?.target).toBe(kociolC.id);
  });
});

describe('zapas drewna dla Drwala liczy to samo co pasek u góry', () => {
  it('ogień we wszystkich naszych paleniskach liczy się w sztukach po BURN_TICKS, niezależnie od wagi paleniska', () => {
    const { st, sim, koza } = ustaw(2 * BURN_TICKS);
    const przed = prv(sim).zapasDrewna();
    // drewno w składzie i dwie sztuki w kozie; pasek u góry liczy tyle samo (nic nie leży na ulicy i nikt nic nie niesie)
    expect(snapshot(st, block).stock.wood).toBe(przed);
    rzecz(st, 'koza_beczka', ...BECZKA, { fuel: 3 * BURN_TICKS });
    rzecz(st, 'kociol', ...KOCIOL, { w: 2, fuel: 5 * BURN_TICKS });
    // koza z beczki 3 sztuki, kocioł 5 sztuk (waga 3 zmienia tylko czas palenia, nie liczbę sztuk)
    expect(prv(sim).zapasDrewna()).toBe(przed + 3 + 5);
    expect(snapshot(st, block).stock.wood).toBe(prv(sim).zapasDrewna());
    // niepełna sztuka liczy się za sztukę (jak w pasku)
    koza.fuel = 1;
    expect(prv(sim).zapasDrewna()).toBe(przed - 2 + 1 + 3 + 5);
    expect(snapshot(st, block).stock.wood).toBe(prv(sim).zapasDrewna());
  });

  it('drewno zdjęte z rąk na czas przerwanego polecenia też liczy się do zapasu, tak jak w pasku', () => {
    const { st, sim, p } = ustaw(BURN_TICKS);
    const przed = prv(sim).zapasDrewna();
    // przerwane polecenie niosło 5 sztuk drewna (Polecenie.niesie): ręce puste, drewno wciąż przy człowieku
    p.polecenie = {
      c: { t: 'haul', ids: [p.id], thing: 0 },
      n: 1,
      od: st.tick,
      niesie: { job: nowaPraca(sim, p), drewno: 5 },
    };
    expect(prv(sim).zapasDrewna()).toBe(przed + 5);
    expect(snapshot(st, block).stock.wood).toBe(prv(sim).zapasDrewna());
  });
});

/** pusta praca noszenia do ułożenia zapamiętanego ładunku w próbie */
function nowaPraca(sim: Sim, p: Pawn): Job {
  const s = sim as unknown as { newJob(t: JobKind, target: number, tile: number, order: boolean): Job };
  return s.newJob('haul', -1, sim.tileOf(p), true);
}
