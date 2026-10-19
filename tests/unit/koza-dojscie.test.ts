/* Dojście do palenisk: koza z beczki (badania) otoczona ze wszystkich stron meblami i budowlami ma dalej dostawać drewno.
   Pomiar botem z badaniami (Przymorze, ziarno 11): koza z beczki w sypialni paliła się dwa dni z dwudziestu pięciu, bo od
   szóstego dnia magazyn, pracownia i wersalka zajęły wszystkie kafelki wokół niej, a `kozaStand` nie miał skąd dołożyć
   (−1 dla każdego z zarządu) i nikt nie dokładał, choć drewno leżało w składzie. Meble stoją na przechodnich kafelkach i
   pionek przechodzi przez nie, więc gdy wolnego kafelka obok nie ma, staje na zajętym.
   Test na prawdziwej symulacji (`Sim.step`) na atrapie bloku z interior-mock.ts, jak praca-koza.test.ts. */

import { describe, expect, it } from 'vitest';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { BURN_TICKS, createSim, KOZA_WARM, type Pawn, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';
import { skonczSamouczek } from './praca-pomoc.ts';

const block = mockBlock();
const house = block.interior;
const size = block.size;

/** koza z beczki w pokoju zarządu, jak w praca-koza.test.ts */
const BECZKA = [56, 61] as const;

const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - START_MINUTES / 60) * TICKS_PER_HOUR);

interface Prywatne {
  kozaStand(p: Pawn, koza: Thing): number;
  coreBlocked: Uint8Array;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

function rzecz(st: SimState, kind: string, x: number, y: number, over: Partial<Thing> = {}): Thing {
  const t: Thing = { id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n: 0, fuel: 0, by: -1, owner: -1, ...over };
  st.things.push(t);
  return t;
}

/** Dwie zmarznięte osoby z zarządu, dzień 2 o 12:00 po samouczku, sześć sztuk drewna w składzie, koza zarządu z zapasem
    ognia na trzy godziny (nie wymaga dokładania), zimna koza z beczki obok, a wokół niej meble (`zabudowana`) albo nic. */
function ustaw(zabudowana: boolean) {
  const st = createSim(block, 5, { core: 2 });
  const sim = new Sim(block, st);
  skonczSamouczek(sim);
  st.tick = atHour(2, 12);
  for (const r of [1, 2, 3, 4]) st.temps[r] = 20;
  const koza = st.things.find((t) => t.kind === 'koza')!;
  koza.fuel = 3 * BURN_TICKS;
  const sklad = house.sklad[0];
  rzecz(st, 'drewno', sklad % size, Math.floor(sklad / size), { n: 6 });
  const beczka = rzecz(st, 'koza_beczka', ...BECZKA);
  const rdzen = st.pawns.filter((p) => p.kind === 'core');
  for (const o of rdzen) {
    o.job = null;
    o.path = [];
    o.pi = 0;
    o.wait = st.tick;
    // zimno: ogień potrzebny (`kozaWanted`), reszta w normie, żeby nikt nie szedł jeść ani spać
    Object.assign(o.needs!, { food: 90, rest: 90, warm: KOZA_WARM - 5 });
  }
  let zasloniete = 0;
  if (zabudowana) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = BECZKA[0] + dx;
        const y = BECZKA[1] + dy;
        if ((dx === 0 && dy === 0) || prv(sim).coreBlocked[y * size + x]) continue;
        rzecz(st, 'stol', x, y);
        zasloniete++;
      }
  }
  return { st, sim, beczka, rdzen, zasloniete };
}

/** największy ogień, jaki koza z beczki miała w ciągu godziny gry */
function najwiekszyOgien(sim: Sim, beczka: Thing): number {
  let max = 0;
  for (let k = 0; k < TICKS_PER_HOUR; k++) {
    sim.step();
    max = Math.max(max, beczka.fuel);
  }
  return max;
}

describe('dojście do kozy z beczki', () => {
  it('kontrola: bez mebli wokół zimna koza z beczki dostaje drewno w ciągu godziny', () => {
    const { sim, beczka, zasloniete } = ustaw(false);
    expect(zasloniete).toBe(0);
    expect(najwiekszyOgien(sim, beczka)).toBeGreaterThan(0);
  });

  it('otoczona meblami ze wszystkich stron (wolnego kafelka nie ma) ma jednak kafelek, z którego się dokłada', () => {
    const { st, sim, beczka, rdzen, zasloniete } = ustaw(true);
    // wokół beczki stoi co najmniej jeden mebel, a żaden wolny kafelek nie został
    expect(zasloniete).toBeGreaterThan(0);
    const stand = prv(sim).kozaStand(rdzen[0], beczka);
    expect(stand).toBeGreaterThanOrEqual(0);
    // kafelek jest obok kozy i przechodni, a stoi na nim mebel (wolnych nie było)
    expect(Math.max(Math.abs((stand % size) - beczka.x), Math.abs(Math.floor(stand / size) - beczka.y))).toBe(1);
    expect(prv(sim).coreBlocked[stand]).toBeFalsy();
    expect(st.things.some((t) => t.kind === 'stol' && t.y * size + t.x === stand)).toBe(true);
  });

  it('otoczona meblami ze wszystkich stron dalej dostaje drewno w ciągu godziny', () => {
    const { sim, beczka } = ustaw(true);
    expect(najwiekszyOgien(sim, beczka)).toBeGreaterThan(0);
  });
});
