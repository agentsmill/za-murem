/* Odczyt stanu dla modułu zarządu (src/gov, karta nocy, uchwały) i dla interfejsu: ludzie zarządu z potrzebami,
   umiejętnościami i obecną pracą (people: tylko zarząd, z tego korzysta zarząd), mieszkańcy siedziby z osobą
   z generatora mieszkańców (lokatorzy: tylko do kart w interfejsie), zapasy drewna i jedzenia, czas. Czysta funkcja
   stanu i świata. Zwraca świeże obiekty (zwykły JSON), więc zmiany w wyniku nie ruszają symulacji. */

import type { Dom } from '../content/data.ts';
import type { Person } from '../content/people.ts';
import type { Tx } from '../core/jezyk.ts';
import type { World } from '../world/world.ts';
import { type AmmoKey, noAmmo, type WeaponId, weaponOf } from './bron.ts';
import { BUILDS, type BuildKind, footprint, type Mat } from './budowle.ts';
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
import type { AptGame } from './mieszkania.ts';
import type { Needs } from './needs.ts';
import { jobText } from './orders.ts';
import { durability, fenceShape } from './perimeter.ts';
import { LUP_MATS, uSasiada } from './sasiedzi.ts';
import {
  AMPUTATE_WINDOW,
  BURN_TICKS,
  type Burned,
  COOK_TICKS,
  FEVER_TICKS,
  type JobKind,
  type Mood,
  type Pawn,
  postKey,
  type SimState,
} from './sim.ts';
import { type GameMode, modeOf } from './tryb.ts';
import { crowdNear } from './zombie.ts';

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
  /** historia z własnej drużyny zarządu albo z generatora mieszkańców (brak: osoba z losowania z adresu) */
  story?: string;
  /** osoba z generatora mieszkańców: `Osoba.id` (klucz zmiany imienia); brak: osoba z losowania albo z drużyny */
  ref?: string;
  /** obecni krewni z generatora w jednej linijce, np. „mąż Marek (54)”; brak: nie ma albo osoba spoza generatora */
  rodzina?: string;
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
  /** na wyprawie poza mapą */
  away: boolean;
  /** posterunek warty tej nocy ('brama', 'd<id>', 'koza', 'siatka', 'wieza') albo null */
  post: string | null;
  /** broń w rękach albo null (gołe ręce) i amunicja do niej w magazynie (null: broń bez amunicji) */
  weapon: WeaponId | null;
  ammo: number | null;
  /** ugryzienie: kiedy, czy w rękę albo nogę, ile ticków do śmierci, czy da się jeszcze amputować; null: zdrowy */
  bite: { at: number; limb: boolean; left: number; amputate: boolean } | null;
  /** po amputacji */
  maimed: boolean;
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
  /** złom w stertach na podwórku (sztuki), deski tak samo */
  scrap: number;
  boards: number;
  /** części i leki (rzeczy na mapie i zapas z zarządu sprzed M2) */
  parts: number;
  meds: number;
  /** broń w magazynie i amunicja */
  arms: WeaponId[];
  ammo: Record<AmmoKey, number>;
  /** wszystkie materiały w sztukach (rzeczy na mapie): drewno bez kozy, deski, złom, części, jedzenie, leki */
  mats: Record<Mat, number>;
  /** łup we wnętrzach sąsiednich budynków (M2 fala 2): leży, ale nie jest nasz, dopóki ktoś go nie przyniesie; bez
      niczego u sąsiadów pola nie ma */
  uSasiadow?: Partial<Record<Mat, number>>;
}

/** mieszkanie siedziby dla interfejsu (karta mieszkania) */
export interface SimApt {
  apt: number;
  state: 'zarzad' | 'mieszkancy' | 'puste';
  why?: AptGame['why'];
  year?: number;
  /** nasze: zarząd albo zajęte */
  ours: boolean;
  /** uszkodzenia do naprawy, pomieszczenia i ile z nich przeszukane */
  damaged: number;
  rooms: number;
  searched: number;
}

/** plan budowy dla interfejsu i rysowania (duch z paskiem postępu) */
export interface SimBuild {
  id: number;
  kind: BuildKind;
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  /** postęp pracy 0–1 i materiały, których jeszcze brakuje */
  progress: number;
  missing: Partial<Record<Mat, number>>;
}

/** stan siatki dla zarządu (GovFence): otwarte dziury, średnia wytrzymałość, brama; kafelki dziury, żeby interfejs
    mógł nadać jej nazwę miejsca (name, w obu językach) przed podaniem zarządowi */
export interface SimFence {
  holes: { id: number; size: number; tiles: number[]; name?: Tx }[];
  durability: number;
  gateOpen: boolean;
}

/** światło na podwórku dla zarządu (GovLight) */
export interface SimLight {
  campfire: boolean;
  gateLamp: boolean;
}

export interface SimSnapshot {
  /** tryb gry */
  mode: GameMode;
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
  /** zarząd (pionki rdzenia), w kolejności pionków */
  people: SimPerson[];
  /** mieszkańcy siedziby z osobą z generatora mieszkańców (opcja mieszkancy w createSim), w kolejności pionków; bez
      opcji i w zapisie sprzed niej pusta lista. Zarząd ich nie widzi (govInput bierze people). */
  lokatorzy: SimPerson[];
  stock: SimStock;
  /** spalone meble, po kolei */
  burned: Burned[];
  fence: SimFence;
  light: SimLight;
  /** mieszkańcy siedziby poza zarządem i ilu się zmieści */
  residents: number;
  cap: number;
  /** obcy (szabrownicy) na mapie */
  strangers: number;
  /** szwendacze: wszyscy na mapie, do 12 m od siatki, napierający na siatkę */
  /** crowd: największy tłok napierających przy jednym miejscu siatki (src/sim/zombie.ts, FENCE_BEARS) */
  zombies: { all: number; near: number; pressing: number; crowd: number };
  /** mieszkania siedziby (M2) i plany budowy */
  apts: SimApt[];
  builds: SimBuild[];
  /** napad tej nocy albo ostatni: faza (0 czekają, 1 za siatką, 2 wchodzą albo uciekają, 3 po wszystkim),
      rozstrzygnięcie i co wynieśli; null: nie było */
  raid: { phase: number; outcome: string; took: { wood: number; supplies: number; scrap: number } } | null;
}

/** amunicja w magazynie do broni (null: broń bez amunicji) */
function ammoFor(st: SimState, weapon: WeaponId | null): number | null {
  const a = weaponOf(weapon).ammo;
  return a ? (st.store.ammo?.[a] ?? 0) : null;
}

function zombieCounts(st: SimState, w: World): SimSnapshot['zombies'] {
  const out = { all: 0, near: 0, pressing: 0, crowd: 0 };
  const tiles = fenceShape(w)?.tiles ?? [];
  const size = w.size;
  const pressing = new Map<number, number>();
  for (const p of st.pawns) {
    if (p.kind !== 'zombie') continue;
    out.all++;
    if (p.job?.phase === 2) {
      out.pressing++;
      if (p.job.target >= 0) pressing.set(p.job.target, (pressing.get(p.job.target) ?? 0) + 1);
    }
    if (tiles.some((t) => Math.hypot((t % size) + 0.5 - p.x, Math.floor(t / size) + 0.5 - p.y) <= 12)) out.near++;
  }
  for (const t of pressing.keys()) out.crowd = Math.max(out.crowd, crowdNear(pressing, size, t));
  return out;
}

/** osoba pionka (zarząd albo mieszkaniec z osobą) dla zarządu i interfejsu */
function personOf(st: SimState, w: World, p: Pawn, who: Person): SimPerson {
  const h = houseOf(w);
  const size = w.size;
  const tick = st.tick;
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
    ...(who.story ? { story: who.story } : {}),
    ...(who.ref ? { ref: who.ref } : {}),
    ...(who.rodzina ? { rodzina: who.rodzina } : {}),
    needs: { ...p.needs! },
    moods: p.moods.map((m) => ({ ...m })),
    job: p.job ? p.job.t : null,
    doing: jobText(st, w, p),
    // śpi w łóżku albo przysypia na warcie
    asleep: (p.job?.t === 'sleep' && p.job.phase === 1) || (p.job?.t === 'guard' && p.job.phase === 4),
    inside: !p.away && !!h && (h.room[tile] >= 0 || h.doors.includes(tile)),
    tile,
    carry: p.carry,
    away: p.away,
    post: p.job?.t === 'guard' ? postKey(p.job.target) : null,
    weapon: p.weapon ?? null,
    ammo: ammoFor(st, p.weapon ?? null),
    bite:
      p.bite !== undefined
        ? {
            at: p.bite,
            limb: !!p.limb,
            left: p.bite + FEVER_TICKS - tick,
            amputate: !!p.limb && tick <= p.bite + AMPUTATE_WINDOW,
          }
        : null,
    maimed: !!p.maimed,
  };
}

export function snapshot(st: SimState, w: World): SimSnapshot {
  const size = w.size;
  // łup we wnętrzach sąsiadów (M2 fala 2) nie jest jeszcze nasz: liczy się osobno
  const obce = (t: { x: number; y: number }) => uSasiada(st, w, t.y * size + t.x);
  const count = (k: string) => st.things.reduce((a, t) => a + (t.kind === k && !obce(t) ? t.n : 0), 0);
  const uSasiadow: Partial<Record<Mat, number>> = {};
  const h = houseOf(w);
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
  let scrap = 0;
  let boards = 0;
  for (const t of st.things) {
    if (obce(t)) {
      if (LUP_MATS.has(t.kind)) uSasiadow[t.kind as Mat] = (uSasiadow[t.kind as Mat] ?? 0) + t.n;
      continue;
    }
    if (t.kind === 'drewno') {
      if (sklad.includes(t.y * size + t.x)) woodSklad += t.n;
      else woodLoose += t.n;
    } else if (t.kind === 'jedzenie') supplies += t.n;
    else if (t.kind === 'posilek') meals += t.n;
    else if (t.kind === 'zlom') scrap += t.n;
    else if (t.kind === 'deski') boards += t.n;
  }
  const people: SimPerson[] = st.pawns
    .filter((p) => p.kind === 'core')
    .map((p) => personOf(st, w, p, st.people[p.person]));
  // mieszkańcy z osobą i lokatorzy sąsiednich budynków na mapie (karta do odczytu)
  const lokatorzy: SimPerson[] = st.pawns
    .filter((p) => (p.kind === 'resident' || p.kind === 'sasiad') && p.person >= 0 && st.people[p.person])
    .map((p) => personOf(st, w, p, st.people[p.person]));
  const woodCarried = people.reduce((a, p) => a + p.carry, 0);
  const fuel = koza?.fuel ?? 0;
  const hour = hourOf(tick);
  return {
    mode: modeOf(st),
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
    lokatorzy,
    stock: {
      woodSklad,
      woodLoose,
      woodCarried,
      fireHours: fuel / TICKS_PER_HOUR,
      wood: woodSklad + woodLoose + woodCarried + Math.ceil(fuel / BURN_TICKS),
      supplies,
      meals,
      gasCooks: Math.floor((stove?.fuel ?? 0) / COOK_TICKS),
      scrap,
      boards,
      parts: count('czesci') + st.store.parts,
      meds: count('leki') + st.store.meds,
      arms: [...(st.store.arms ?? [])],
      ammo: { ...noAmmo(), ...st.store.ammo },
      mats: {
        drewno: woodSklad + woodLoose + woodCarried,
        deski: boards,
        zlom: scrap,
        czesci: count('czesci') + st.store.parts,
        jedzenie: supplies,
        leki: count('leki') + st.store.meds,
      },
      ...(Object.keys(uSasiadow).length ? { uSasiadow } : {}),
    },
    burned: st.burned.map((b) => ({ ...b })),
    fence:
      st.fence && fenceShape(w)
        ? {
            holes: st.fence.holes.filter((x) => !x.patch).map((x) => ({ id: x.id, size: x.size, tiles: [...x.tiles] })),
            durability: durability(w, st.fence),
            gateOpen: st.fence.gateOpen,
          }
        : { holes: [], durability: 1, gateOpen: true },
    light: {
      campfire: st.things.some((t) => t.kind === 'ognisko' && t.fuel > 0),
      // warta przy bramie stoi z lampą
      gateLamp: st.pawns.some((p) => !p.away && p.job?.t === 'guard' && p.job.phase === 1 && p.job.target === 0),
    },
    residents: st.pawns.filter((p) => p.kind === 'resident').length,
    cap: st.cap,
    strangers: st.pawns.filter((p) => p.kind === 'szabrownik').length,
    zombies: zombieCounts(st, w),
    apts: st.apts.map((a) => {
      const out: SimApt = {
        apt: a.apt,
        state: a.state,
        ours: a.ours,
        damaged: st.damage.filter((d) => d.apt === a.apt && !d.fixed).length,
        rooms: h ? h.rooms.filter((r) => r.apt === a.apt).length : 0,
        searched: a.searched.length,
      };
      if (a.why) out.why = a.why;
      if (a.year) out.year = a.year;
      return out;
    }),
    builds: st.builds.map((b) => {
      const { w: bw, h: bh } = footprint(b.kind, b.rot);
      const missing: Partial<Record<Mat, number>> = {};
      for (const [m, v] of Object.entries(b.need) as [Mat, number][]) {
        const left = v - (b.have[m] ?? 0);
        if (left > 0) missing[m] = left;
      }
      return {
        id: b.id,
        kind: b.kind,
        x: b.x,
        y: b.y,
        rot: b.rot,
        w: bw,
        h: bh,
        progress: Math.min(1, b.work / BUILDS[b.kind].work),
        missing,
      };
    }),
    raid: st.raid ? { phase: st.raid.phase, outcome: st.raid.outcome, took: { ...st.raid.took } } : null,
  };
}
