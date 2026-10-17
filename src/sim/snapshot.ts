/* Odczyt stanu dla modułu zarządu (src/gov, karta nocy, uchwały) i dla interfejsu: ludzie zarządu z potrzebami,
   umiejętnościami i obecną pracą, zapasy drewna i jedzenia, czas. Czysta funkcja stanu i świata. Zwraca świeże
   obiekty (zwykły JSON), więc zmiany w wyniku nie ruszają symulacji. */

import type { Dom } from '../content/data.ts';
import type { World } from '../world/world.ts';
import {
  clockOf,
  daylight,
  dayOf,
  hourOf,
  minutesAt,
  outdoorTemp,
  SEASONS,
  seasonOf,
  TICKS_PER_HOUR,
} from './clock.ts';
import { houseOf, inHomeApt } from './house.ts';
import type { Needs } from './needs.ts';
import { jobText } from './orders.ts';
import { durability, fenceShape } from './perimeter.ts';
import { BURN_TICKS, type Burned, COOK_TICKS, type JobKind, type Mood, type SimState } from './sim.ts';

export interface SimPerson {
  /** id pionka: do poleceń dla symulacji */
  pawn: number;
  /** id osoby z generatora (s1, s2…) */
  id: string;
  name: string;
  first: string;
  /** kobieta (do odmiany w tekstach) */
  f: boolean;
  age: number;
  prof: string;
  skills: Partial<Record<Dom, number>>;
  traits: string[];
  needs: Needs;
  /** chwilowe nastroje z powodami, np. „Spalili moje łóżko” */
  moods: Mood[];
  /** bieżąca praca albo null, gdy bezczynny */
  job: JobKind | null;
  /** opis do karty osoby, np. „Rąbie suche drzewo.” */
  doing: string;
  asleep: boolean;
  /** pod dachem, w pomieszczeniu siedziby */
  inside: boolean;
  tile: number;
  /** sztuki drewna w rękach */
  carry: number;
}

export interface SimStock {
  /** drewno w sztukach: w składzie przy kozie, luzem na ziemi, w rękach */
  woodSklad: number;
  woodLoose: number;
  woodCarried: number;
  /** ogień w kozie zarządu, w godzinach gry */
  fireHours: number;
  /** całe drewno w sztukach, razem z tym, co jest w kozie */
  wood: number;
  /** zapasy jedzenia (porcje) i ugotowane porcje w garnkach */
  supplies: number;
  meals: number;
  /** na ile gotowań starczy gazu w butli */
  gasCooks: number;
}

/** stan siatki dla zarządu (GovFence): otwarte dziury, średnia wytrzymałość, brama */
export interface SimFence {
  holes: { id: number; size: number; name?: string }[];
  durability: number;
  gateOpen: boolean;
}

/** światło na podwórku dla zarządu (GovLight) */
export interface SimLight {
  campfire: boolean;
  gateLamp: boolean;
}

export interface SimSnapshot {
  tick: number;
  day: number;
  hour: number;
  minute: number;
  /** „15:00” */
  clock: string;
  /** 0 jesień, 1 zima, 2 wiosna, 3 lato */
  season: number;
  seasonName: string;
  /** pora snu (22–6) */
  night: boolean;
  /** światło dnia 0–1 */
  daylight: number;
  /** temperatura na zewnątrz i w kuchni zarządu (°C; null, gdy świat nie ma wnętrza) */
  outdoor: number;
  kitchen: number | null;
  kozaLit: boolean;
  people: SimPerson[];
  stock: SimStock;
  /** spalone meble, po kolei */
  burned: Burned[];
  fence: SimFence;
  light: SimLight;
  /** mieszkańcy siedziby poza zarządem i ilu się zmieści */
  residents: number;
  cap: number;
}

export function snapshot(st: SimState, w: World): SimSnapshot {
  const h = houseOf(w);
  const size = w.size;
  const tick = st.tick;
  const ours = (kind: string) =>
    h ? st.things.find((t) => t.kind === kind && inHomeApt(h, t.y * size + t.x)) : undefined;
  const koza = ours('koza');
  const stove = ours('kuchenka');
  const kitchen = koza && h ? h.room[koza.y * size + koza.x] : -1;
  const sklad = h ? h.sklad : [];
  let woodSklad = 0;
  let woodLoose = 0;
  let supplies = 0;
  let meals = 0;
  for (const t of st.things) {
    if (t.kind === 'drewno') {
      if (sklad.includes(t.y * size + t.x)) woodSklad += t.n;
      else woodLoose += t.n;
    } else if (t.kind === 'jedzenie') supplies += t.n;
    else if (t.kind === 'posilek') meals += t.n;
  }
  const people: SimPerson[] = st.pawns
    .filter((p) => p.kind === 'core')
    .map((p) => {
      const who = st.people[p.person];
      const tile = Math.floor(p.y) * size + Math.floor(p.x);
      return {
        pawn: p.id,
        id: who.id,
        name: who.name,
        first: who.first,
        f: who.f,
        age: who.age,
        prof: who.prof,
        skills: { ...who.skills },
        traits: [...who.traits],
        needs: { ...p.needs! },
        moods: p.moods.map((m) => ({ ...m })),
        job: p.job ? p.job.t : null,
        doing: jobText(st, w, p),
        asleep: p.job?.t === 'sleep' && p.job.phase === 1,
        inside: !!h && (h.room[tile] >= 0 || h.doors.includes(tile)),
        tile,
        carry: p.carry,
      };
    });
  const woodCarried = people.reduce((a, p) => a + p.carry, 0);
  const fuel = koza?.fuel ?? 0;
  const hour = hourOf(tick);
  return {
    tick,
    day: dayOf(tick),
    hour,
    minute: Math.floor(minutesAt(tick)) % 60,
    clock: clockOf(tick),
    season: seasonOf(tick),
    seasonName: SEASONS[seasonOf(tick)],
    night: hour >= 22 || hour < 6,
    daylight: daylight(tick),
    outdoor: outdoorTemp(st.seed, tick),
    kitchen: kitchen >= 0 ? st.temps[kitchen] : null,
    kozaLit: fuel > 0,
    people,
    stock: {
      woodSklad,
      woodLoose,
      woodCarried,
      fireHours: fuel / TICKS_PER_HOUR,
      wood: woodSklad + woodLoose + woodCarried + Math.ceil(fuel / BURN_TICKS),
      supplies,
      meals,
      gasCooks: Math.floor((stove?.fuel ?? 0) / COOK_TICKS),
    },
    burned: st.burned.map((b) => ({ ...b })),
    fence:
      st.fence && fenceShape(w)
        ? {
            holes: st.fence.holes.filter((x) => !x.patch).map((x) => ({ id: x.id, size: x.size })),
            durability: durability(w, st.fence),
            gateOpen: st.fence.gateOpen,
          }
        : { holes: [], durability: 1, gateOpen: true },
    light: {
      campfire: st.things.some((t) => t.kind === 'ognisko' && t.fuel > 0),
      gateLamp: false,
    },
    residents: st.pawns.filter((p) => p.kind === 'resident').length,
    cap: st.cap,
  };
}
