/* Budowle fali 1 M2 (docs/M2-fala-1.md): rodzaj, miejsce, rozmiar, koszt w materiałach i czas pracy.
   Kontrakt dla symulacji (właściciel), interfejsu i rysowania (tylko czytają). Koszty i czasy stroi bot.
   Nazwy i działanie budowli po angielsku leżą w budowle.en.ts; powód z canPlace służy tylko do wyświetlenia, więc
   jest od razu w bieżącym języku (symulacja patrzy tylko na ok). Pracownia (badania) jest jedna na grę: `max` w
   BuildDef, z powodem w canPlace. Budowle z technologii (docs/superpowers/specs/2026-10-19-badania-design.md, „Nowe
   budowle”): koza z beczki, kocioł, pieczarkarnia, szklarnia, barykada i wieża mają `tech` i stoją dopiero po badaniu.
   Dochodzą trzy miejsca: łazienka naszego mieszkania, klatka siedziby (w domu, który klatki nie ma, przedpokój
   naszego mieszkania) i „okno” dla kozy z beczki: pokój, kuchnia albo przedpokój naszego mieszkania, najwyżej 2 m od
   okna tego samego pomieszczenia (rura idzie wzdłuż ściany; w głębokich mieszkaniach okna mają tylko kuchnia i łazienka,
   a przy samym oknie stoi już koza zarządu). Tu są tylko dane i miejsca; działanie dopisują moduły, które z nich
   korzystają (symulacja, zarząd). Budowle z miejscem 'obwod' (zasieki, barykada) stoją na odcinku siatki:
   `naObwodzie` mówi o tym symulacji (wytrzymałość kafelka: ZASIEKI_HP, BARYKADA_HP w sim.ts), rysowaniu i płotowi
   z sąsiadem. */

import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { type Words, type WordsEn, wordsEnOfWorld, wordsOfWorld } from '../gov/miejsce.ts';
import type { World } from '../world/world.ts';
import { BUILDS_EN } from './budowle.en.ts';
import { TICKS_PER_HOUR } from './clock.ts';
import { type HouseLike, houseOf, kozaFront } from './house.ts';
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
  | 'pracownia'
  | 'koza_beczka'
  | 'kociol'
  | 'pieczarkarnia'
  | 'szklarnia'
  | 'barykada'
  | 'wieza';

/** gdzie wolno postawić: pokój, kuchnia albo łazienka w naszym mieszkaniu, klatka siedziby (w domu przedpokój naszego
    mieszkania), pokój, kuchnia albo przedpokój naszego mieszkania blisko okna (`okno`), podwórko za siatką, odcinek
    siatki */
export type BuildPlace = 'pokoj' | 'kuchnia' | 'lazienka' | 'klatka' | 'okno' | 'podworko' | 'obwod';

/** rodzaje pomieszczeń naszych mieszkań, w których stoi budowla z danym miejscem (miejsca bez wpisu to klatka,
    podwórko i obwód, które mają własne sprawdzenie) */
export const PLACE_ROOMS: Readonly<Partial<Record<BuildPlace, readonly string[]>>> = {
  pokoj: ['pokoj'],
  kuchnia: ['kuchnia'],
  lazienka: ['lazienka'],
  okno: ['pokoj', 'kuchnia', 'przedpokoj'],
};

/** do ilu metrów (kafelków, najdalej w prostej linii po kafelkach) od okna stoi budowla z miejscem `okno` */
export const ZASIEG_OKNA = 2;

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
  /** zdanie, gdy limit `max` jest wykorzystany; bez pola „<nazwa> już stoi.” (pasuje do rodzaju żeńskiego i do
      większości nazw w liczbie pojedynczej), budowla innego rodzaju gramatycznego daje tu własne */
  juzStoi?: Tx;
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
    // 14 desek (nie 16): bot z badaniami (zadanie 11 planu) nie stawiał pracowni w Zielonkach, gdzie brakowało jednej deski
    cost: { deski: 14, czesci: 4 },
    work: (3 * TICKS_PER_HOUR) / 2,
    max: 1,
    effect: 'Stół z lampą i półką na książki: przy nim dwie osoby naraz badają nowe technologie.',
  },
  koza_beczka: {
    name: 'Koza z beczki',
    place: 'okno',
    cat: 'dom',
    tech: 't_kozy',
    w: 1,
    h: 1,
    cost: { zlom: 8, czesci: 1 },
    work: TICKS_PER_HOUR,
    effect: 'Grzeje pomieszczenie i pali drewno jak koza w kuchni. Rura idzie przez okno, więc stoi blisko niego.',
  },
  kociol: {
    name: 'Kocioł',
    place: 'klatka',
    cat: 'dom',
    tech: 't_wezel',
    w: 2,
    h: 1,
    cost: { zlom: 20, czesci: 6 },
    work: 2 * TICKS_PER_HOUR,
    effect: 'Grzeje naraz wszystkie nasze mieszkania, ale pali dużo drewna.',
  },
  pieczarkarnia: {
    name: 'Pieczarkarnia',
    place: 'lazienka',
    cat: 'dom',
    tech: 't_grzyby',
    w: 1,
    h: 1,
    cost: { deski: 8 },
    work: TICKS_PER_HOUR,
    effect: 'Plon mniejszy niż w ogródku wiosną i latem, ale taki sam przez cały rok, także zimą.',
  },
  szklarnia: {
    name: 'Szklarnia',
    place: 'podworko',
    cat: 'podworko',
    tech: 't_szklarnia',
    w: 3,
    h: 2,
    cost: { deski: 10, czesci: 4 },
    work: (3 * TICKS_PER_HOUR) / 2,
    effect: 'Jak ogródek, ale zimą rodzi jak jesienią.',
  },
  barykada: {
    name: 'Barykada',
    place: 'obwod',
    cat: 'obwod',
    tech: 't_barykady',
    w: 1,
    h: 1,
    cost: { zlom: 16, deski: 2 },
    work: TICKS_PER_HOUR,
    effect: 'Z wraków, mocniejsza od zasieków, zamyka dziurę. Kosztuje głównie złom.',
  },
  wieza: {
    name: 'Wieża',
    place: 'podworko',
    cat: 'podworko',
    tech: 't_wieza',
    w: 2,
    h: 2,
    cost: { deski: 24, zlom: 6 },
    work: 2 * TICKS_PER_HOUR,
    max: 1,
    effect:
      'Posterunek „Warta na wieży” na karcie nocy: stojący tam dokłada połowę swojej warty do obrony każdego innego posterunku. Można mieć jedną.',
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

/** Powód, gdy limit `max` budowli jest wykorzystany (stojące plus plany), w bieżącym języku: „Pracownia już stoi.”,
    „The research room already stands.”, albo własne zdanie z `BuildDef.juzStoi`. null, gdy budowla nie ma limitu albo
    można postawić następną. Woła go canPlace i menu budowy (src/ui/budowa.ts), więc oba mówią to samo. */
export function limitWhy(st: Partial<Pick<SimState, 'things' | 'builds'>>, kind: BuildKind): string | null {
  const def = BUILDS[kind];
  if (def.max === undefined) return null;
  const ile =
    (st.things ?? []).filter((t) => t.kind === kind).length + (st.builds ?? []).filter((b) => b.kind === kind).length;
  if (ile < def.max) return null;
  if (def.juzStoi) return tr(def.juzStoi);
  const the = BUILDS_EN[kind].the;
  return L(`${def.name} już stoi.`, `${the.charAt(0).toUpperCase()}${the.slice(1)} already stands.`);
}

/** czy budowla jest odblokowana: bez `tech` zawsze, z `tech` po badaniu z `st.techDone` (pole jest nieobecne,
    dopóki ktoś nie odblokuje pierwszego badania, żeby skróty stanu istniejących gier się nie ruszyły) */
export function isUnlocked(st: Pick<SimState, 'techDone'>, kind: BuildKind): boolean {
  const t = BUILDS[kind].tech;
  return !t || !!st.techDone?.includes(t);
}

/** czy rzecz ze stanu to budowla stawiana na odcinku siatki (miejsce 'obwod': zasieki, barykada); inne rzeczy
    (sterty, meble) nie są ani budowlami, ani na obwodzie */
export const naObwodzie = (kind: string): boolean => BUILDS[kind as BuildKind]?.place === 'obwod';

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
  lazienka: (w, e) => tx(`Tylko w łazience ${w.lokal.w}.`, `Only in the bathroom of ${e.lokal.w}.`),
  okno: (w, e) =>
    tx(
      `Tylko w pokoju, kuchni albo przedpokoju ${w.lokal.d}, najwyżej ${ZASIEG_OKNA} m od okna.`,
      `Only in a room, the kitchen or the hallway of ${e.lokal.w}, within ${ZASIEG_OKNA} m of a window.`,
    ),
  klatka: () => tx('Tylko na klatce schodowej siedziby.', 'Only in the HQ stairwell.'),
  podworko: (w, e) =>
    tx(
      `Tylko na podwórku za siatką, z dala od ${w.brama.d}, dziur i drzwi.`,
      `Only in the yard inside the fence, away from ${e.brama}, holes and doors.`,
    ),
  obwod: () => tx('Tylko na odcinku siatki.', 'Only on a stretch of the fence.'),
};

/** powód odmowy dla budowli, której miejsce ma wariant: kocioł w domu bez klatki w przedpokoju (przedpokoj: true);
    reszta według WHY */
function whyNo(def: BuildDef, w: Words, e: WordsEn, przedpokoj: boolean): Tx {
  if (def.place === 'klatka' && przedpokoj)
    return tx(`Tylko w przedpokoju ${w.lokal.w}.`, `Only in the hallway of ${e.lokal.w}.`);
  return WHY[def.place](w, e);
}

/** Czy kafelek wnętrza i jest blisko okna swojego pomieszczenia: okno ściany zewnętrznej, którego któryś sąsiad z czterech
    stron leży w tym samym pomieszczeniu, w odległości najwyżej ZASIEG_OKNA kafelków (po współrzędnych, jak „kwadrat”). */
export function nearWindow(h: Pick<HouseLike, 'windows' | 'room'>, i: number, size: number): boolean {
  const r = h.room[i];
  if (r < 0) return false;
  const [x, y] = [i % size, Math.floor(i / size)];
  return h.windows.some((s) => {
    if (Math.max(Math.abs((s % size) - x), Math.abs(Math.floor(s / size) - y)) > ZASIEG_OKNA) return false;
    return h.room[s - 1] === r || h.room[s + 1] === r || h.room[s - size] === r || h.room[s + size] === r;
  });
}

/** Pomieszczenia, w których stoi kocioł (place 'klatka'): klatki siedziby, z których drzwi prowadzą do pomieszczenia
    naszego mieszkania; w domu, gdzie klatki nie ma (albo żadna nie łączy się z naszym mieszkaniem), przedpokoje
    naszych mieszkań. `przedpokoj` mówi, który z dwóch przypadków zaszedł (do powodu odmowy). */
export function boilerRooms(
  st: Pick<SimState, 'apts'>,
  h: HouseLike,
  size: number,
): { rooms: ReadonlySet<number>; przedpokoj: boolean } {
  const ours = new Set(st.apts.filter((a) => a.ours).map((a) => a.apt));
  const klatki = new Set<number>();
  for (const d of h.doors) {
    const rs = [d - 1, d + 1, d - size, d + size].map((n) => h.room[n]).filter((r) => r !== undefined && r >= 0);
    const k = rs.find((r) => h.rooms[r].kind === 'klatka');
    if (k !== undefined && rs.some((r) => ours.has(h.rooms[r].apt))) klatki.add(k);
  }
  if (klatki.size) return { rooms: klatki, przedpokoj: false };
  const rooms = new Set<number>();
  for (const r of h.rooms) if (r.kind === 'przedpokoj' && ours.has(r.apt)) rooms.add(r.id);
  return { rooms, przedpokoj: true };
}

/** Czy budowlę wolno postawić (podgląd trybu stawiania i polecenie 'build'): w pomieszczeniu właściwego rodzaju
    w naszym mieszkaniu (bez składu drewna; koza z beczki w pokoju, kuchni albo przedpokoju, blisko okna, i bez
    kafelka przed kozą zarządu), kocioł na klatce siedziby (w domu w przedpokoju, tak samo bez składu), na wolnym
    podwórku z dala od bramy, dziur i wejść albo na odcinku siatki (także na dziurze, nie na bramie); nie na rzeczach
    i nie na innym planie. Czysta funkcja stanu i świata. */
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
  const limit = limitWhy(st, kind);
  if (limit) return { ok: false, why: limit };
  const size = w.size;
  const { w: bw, h: bh } = footprint(kind, rot);
  if (x < 0 || y < 0 || x + bw > size || y + bh > size) return { ok: false, why: L('Poza mapą.', 'Off the map.') };
  const tiles = buildTiles(kind, x, y, rot, size);
  const nie = (przedpokoj = false) => ({
    ok: false,
    why: tr(whyNo(def, wordsOfWorld(w), wordsEnOfWorld(w), przedpokoj)),
  });
  const no = nie();
  const h = houseOf(w);
  const shape = fenceShape(w);
  const kinds = PLACE_ROOMS[def.place];
  // kafelek przed kozą zarządu generator wnętrza zostawia wolny, żeby było skąd dokładać: koza z beczki (miejsce
  // 'okno') go nie zajmie; inne budowle go nie omijają, żeby gra bez badań szła jak dawniej
  const front = h && def.place === 'okno' ? kozaFront(h, size) : -1;
  if (kinds) {
    if (!h) return no;
    for (const i of tiles) {
      const r = h.room[i];
      if (r < 0 || w.blocked[i] || h.sklad.includes(i) || i === front || !kinds.includes(h.rooms[r].kind)) return no;
      if (!st.apts.find((a) => a.apt === h.rooms[r].apt)?.ours) return no;
      if (def.place === 'okno' && !nearWindow(h, i, size)) return no;
    }
  } else if (def.place === 'klatka') {
    if (!h) return no;
    const { rooms, przedpokoj } = boilerRooms(st, h, size);
    for (const i of tiles) {
      const r = h.room[i];
      if (r < 0 || w.blocked[i] || h.sklad.includes(i) || !rooms.has(r)) return nie(przedpokoj);
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
