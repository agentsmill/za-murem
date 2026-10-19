/* Budowle fali 1 M2 (docs/M2-fala-1.md): rodzaj, miejsce, rozmiar, koszt w materiałach i czas pracy.
   Kontrakt dla symulacji (właściciel), interfejsu i rysowania (tylko czytają). Koszty i czasy stroi bot.
   Nazwy i działanie budowli po angielsku leżą w budowle.en.ts; powód z canPlace służy tylko do wyświetlenia, więc
   jest od razu w bieżącym języku (symulacja patrzy tylko na ok). Pracownia (badania) jest jedna na grę: `max` w
   BuildDef, z powodem w canPlace. */

import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { type Words, type WordsEn, wordsEnOfWorld, wordsOfWorld } from '../gov/miejsce.ts';
import type { World } from '../world/world.ts';
import { BUILDS_EN } from './budowle.en.ts';
import { TICKS_PER_HOUR } from './clock.ts';
import { houseOf } from './house.ts';
import { fenceShape, gateTiles } from './perimeter.ts';
import type { SimState } from './sim.ts';

/** materiały z odzysku i zapasy */
export type Mat = 'drewno' | 'deski' | 'zlom' | 'czesci' | 'jedzenie' | 'leki';

export type BuildKind =
  | 'warsztat'
  | 'kuchnia_spoleczna'
  | 'magazyn'
  | 'lozka_pietrowe'
  | 'ogrodek'
  | 'zasieki'
  | 'pracownia';

/** gdzie wolno postawić: pokój albo kuchnia w naszym mieszkaniu, podwórko za siatką, odcinek siatki */
export type BuildPlace = 'pokoj' | 'kuchnia' | 'podworko' | 'obwod';

/** zakładka w menu budowy; kolejna dojdzie razem z budowlami, które do niej należą (jedzenie, prąd, obrona);
    „cuda” (bardzo drogie budowle końcowe z późnych er) nie ma jeszcze żadnej budowli, więc menu jej nie pokazuje */
export type BuildCat = 'dom' | 'podworko' | 'obwod' | 'cuda';
/** kolejność zakładek w menu */
export const BUILD_CATS: readonly BuildCat[] = ['dom', 'podworko', 'obwod', 'cuda'];

export interface BuildDef {
  name: string;
  place: BuildPlace;
  /** zakładka w menu budowy */
  cat: BuildCat;
  /** badanie, które odblokowuje budowlę (`st.techDone`); bez pola budowla jest dostępna od początku */
  tech?: string;
  /** rozmiar w kafelkach przy rot 0 (przy rot 1 i 3 zamienione) */
  w: number;
  h: number;
  cost: Partial<Record<Mat, number>>;
  /** praca w tickach symulacji, jeden pionek */
  work: number;
  /** ile takich budowli wolno mieć naraz (stojące plus plany); bez pola: bez limitu */
  max?: number;
  /** jedno zdanie do menu budowy; zdanie zależne od miejsca bierze słowa ze słownika wspólnoty (effectOf) */
  effect: string | ((w: Words) => string);
}

export const BUILDS: Record<BuildKind, BuildDef> = {
  warsztat: {
    name: 'Warsztat',
    place: 'pokoj',
    cat: 'dom',
    w: 2,
    h: 1,
    cost: { deski: 20, zlom: 10 },
    work: (3 * TICKS_PER_HOUR) / 2,
    effect: 'Łaty i naprawy idą szybciej, a rozbiórka daje więcej.',
  },
  kuchnia_spoleczna: {
    name: 'Kuchnia społeczna',
    place: 'kuchnia',
    cat: 'dom',
    w: 2,
    h: 1,
    cost: { zlom: 14, czesci: 10 },
    work: (3 * TICKS_PER_HOUR) / 2,
    effect: 'Jedno gotowanie dla wszystkich, mniej jedzenia na osobę.',
  },
  magazyn: {
    name: 'Magazyn',
    place: 'pokoj',
    cat: 'dom',
    w: 2,
    h: 2,
    cost: { deski: 30 },
    work: (3 * TICKS_PER_HOUR) / 2,
    effect: 'Zapasy w magazynie trudniej ukraść przy napadzie.',
  },
  lozka_pietrowe: {
    name: 'Łóżka piętrowe',
    place: 'pokoj',
    cat: 'dom',
    w: 1,
    h: 2,
    cost: { deski: 20 },
    work: TICKS_PER_HOUR,
    effect: (w) => `Dwa miejsca do spania, ${w.mieszkamy} zmieści się więcej ludzi.`,
  },
  ogrodek: {
    name: 'Ogródek',
    place: 'podworko',
    cat: 'podworko',
    w: 3,
    h: 2,
    cost: { deski: 14 },
    work: TICKS_PER_HOUR,
    effect: 'Po kilku dniach daje jedzenie, latem więcej, jesienią mało.',
  },
  zasieki: {
    name: 'Zasieki',
    place: 'obwod',
    cat: 'obwod',
    w: 1,
    h: 1,
    cost: { zlom: 10 },
    work: (3 * TICKS_PER_HOUR) / 4,
    effect: 'Mocniejsze od siatki i łaty, zamykają dziurę.',
  },
  pracownia: {
    name: 'Pracownia',
    place: 'pokoj',
    cat: 'dom',
    w: 2,
    h: 1,
    cost: { deski: 16, czesci: 4 },
    work: (3 * TICKS_PER_HOUR) / 2,
    max: 1,
    effect: 'Stół z lampą i półką na książki: przy nim dwie osoby naraz badają nowe technologie.',
  },
};

/** plan budowy w toku (st.builds): materiały doniesione (have) z potrzebnych (need) i praca w tickach (work);
    by: pionek, który przy nim pracuje (−1: nikt). Gotowa budowla to rzecz w st.things o tym samym id i kind. */
export interface BuildPlan {
  id: number;
  kind: BuildKind;
  /** lewy górny kafelek i obrót (rozmiar z BUILDS, przy rot 1 i 3 zamieniony) */
  x: number;
  y: number;
  rot: number;
  need: Partial<Record<Mat, number>>;
  have: Partial<Record<Mat, number>>;
  work: number;
  by: number;
}

/** czy budowla jest odblokowana: bez `tech` zawsze, z `tech` po badaniu z `st.techDone` (pole jest nieobecne,
    dopóki ktoś nie odblokuje pierwszego badania, żeby skróty stanu istniejących gier się nie ruszyły) */
export function isUnlocked(st: Pick<SimState, 'techDone'>, kind: BuildKind): boolean {
  const t = BUILDS[kind].tech;
  return !t || !!st.techDone?.includes(t);
}

/** rozmiar budowli przy danym obrocie */
export function footprint(kind: BuildKind, rot: number): { w: number; h: number } {
  const d = BUILDS[kind];
  return rot % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/** kafelki budowli (lewy górny róg x, y, obrót rot) */
export function buildTiles(kind: BuildKind, x: number, y: number, rot: number, size: number): number[] {
  const { w, h } = footprint(kind, rot);
  const out: number[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push((y + dy) * size + x + dx);
  return out;
}

/** zdanie o działaniu budowli według miejsca */
export function effectOf(kind: BuildKind, w: Words): string {
  const e = BUILDS[kind].effect;
  return typeof e === 'string' ? e : e(w);
}

/** powód „nie tutaj” w obu językach ze słowami ze słownika wspólnoty: nasze mieszkanie albo dom, brama albo furtka */
const WHY: Record<BuildPlace, (w: Words, e: WordsEn) => Tx> = {
  pokoj: (w, e) => tx(`Tylko w pokoju ${w.lokal.w}.`, `Only in a room of ${e.lokal.w}.`),
  kuchnia: (w, e) => tx(`Tylko w kuchni ${w.lokal.w}.`, `Only in the kitchen of ${e.lokal.w}.`),
  podworko: (w, e) =>
    tx(
      `Tylko na podwórku za siatką, z dala od ${w.brama.d}, dziur i drzwi.`,
      `Only in the yard inside the fence, away from ${e.brama}, holes and doors.`,
    ),
  obwod: () => tx('Tylko na odcinku siatki.', 'Only on a stretch of the fence.'),
};

/** Czy budowlę wolno postawić (podgląd trybu stawiania i polecenie 'build'): w pomieszczeniu właściwego rodzaju
    w naszym mieszkaniu (bez składu drewna), na wolnym podwórku z dala od bramy, dziur i wejść albo na odcinku siatki
    (także na dziurze, nie na bramie); nie na rzeczach i nie na innym planie. Czysta funkcja stanu i świata. */
/** rzeczy, które nie zajmują miejsca (krew, trupy, zwłoki): plan budowy i ognisko mogą stanąć na nich */
export const GHOST_KINDS: ReadonlySet<string> = new Set(['zwloki', 'trup', 'krew']);

export function canPlace(
  st: SimState,
  w: World,
  kind: BuildKind,
  x: number,
  y: number,
  rot: number,
): { ok: boolean; why?: string } {
  const def = BUILDS[kind];
  if (!isUnlocked(st, kind)) return { ok: false, why: L('Wymaga badania.', 'Needs research.') };
  if (
    def.max !== undefined &&
    st.things.filter((t) => t.kind === kind).length + st.builds.filter((b) => b.kind === kind).length >= def.max
  ) {
    const the = BUILDS_EN[kind].the;
    return {
      ok: false,
      why: L(`${def.name} już stoi.`, `${the.charAt(0).toUpperCase()}${the.slice(1)} already stands.`),
    };
  }
  const size = w.size;
  const { w: bw, h: bh } = footprint(kind, rot);
  if (x < 0 || y < 0 || x + bw > size || y + bh > size) return { ok: false, why: L('Poza mapą.', 'Off the map.') };
  const tiles = buildTiles(kind, x, y, rot, size);
  const no = { ok: false, why: tr(WHY[def.place](wordsOfWorld(w), wordsEnOfWorld(w))) };
  const h = houseOf(w);
  const shape = fenceShape(w);
  if (def.place === 'pokoj' || def.place === 'kuchnia') {
    if (!h) return no;
    for (const i of tiles) {
      const r = h.room[i];
      if (r < 0 || w.blocked[i] || h.sklad.includes(i) || h.rooms[r].kind !== def.place) return no;
      if (!st.apts.find((a) => a.apt === h.rooms[r].apt)?.ours) return no;
    }
  } else if (def.place === 'podworko') {
    if (!shape) return no;
    const keep = [...gateTiles(w), ...shape.hole, ...w.buildings.flatMap((b) => b.entrances.map((e) => e.out))];
    const near = (a: number, b: number) =>
      Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size))) <= 1;
    for (const i of tiles) if (!shape.yard.includes(i) || w.blocked[i] || keep.some((k) => near(k, i))) return no;
  } else {
    if (!shape || tiles.length !== 1 || !shape.tiles.includes(tiles[0]) || gateTiles(w).includes(tiles[0])) return no;
  }
  const covers = (t: { x: number; y: number; w: number; h: number }, i: number) => {
    const ix = i % size;
    const iy = Math.floor(i / size);
    return ix >= t.x && ix < t.x + t.w && iy >= t.y && iy < t.y + t.h;
  };
  for (const i of tiles)
    if (st.things.some((t) => !GHOST_KINDS.has(t.kind) && covers(t, i)))
      return { ok: false, why: L('Tu coś stoi.', 'Something is in the way.') };
  for (const b of st.builds) {
    const f = footprint(b.kind, b.rot);
    if (tiles.some((i) => covers({ x: b.x, y: b.y, w: f.w, h: f.h }, i)))
      return { ok: false, why: L('Tu już jest plan budowy.', 'There is already a build plan here.') };
  }
  return { ok: true };
}
