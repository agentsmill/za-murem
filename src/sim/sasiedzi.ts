/* Sąsiednie budynki (M2 fala 2, docs/M2-fala-2.md): typy stanu, wnętrza z pamięcią na świat, drzwi (rodzaje,
   stan na start, przechodniość), budynek przy podwórku, znani sąsiedzi, łup usług i mieszkań, zapasy gospodarstw,
   lokatorzy zapasowi bez tabel generatora, zamiar i nastrój, wybory spotkania i ich skutki. Czyste funkcje świata
   i stanu: symulacja, menu poleceń, rysowanie i interfejs liczą z nich to samo.

   Kontrakt losowania: stany na start, łup i lokatorzy zapasowi losują tylko z ziarna świata, budynku, kafelka albo
   mieszkania (mulberry), nigdy ze st.rng. Skutki wyborów w spotkaniu dostają generator od symulacji (st.rng), więc gra,
   w której nikt nie dotyka cudzych drzwi, losuje dokładnie tak jak przed falą 2.

   Wnętrze sąsiada to wnętrze z generatora świata (buildInterior bez mieszkania zarządu); nie trafia do zapisu, bo
   wynika ze świata i numeru budynku. Pamięć wnętrz jest na obiekt świata (WeakMap), wspólna dla wszystkich, którzy
   pytają o ten sam świat. */

import type { BuildingClass } from '../content/data.ts';
import { makePerson, type Person } from '../content/people.ts';
import { clamp, mulberry, type Rng } from '../core/rng.ts';
import { type AptState, type AptWhy, type DamageKind, settleAptsOf } from '../world/apts.ts';
import { buildInterior, IN, type Interior, type RoomKind } from '../world/interior.ts';
import type { World } from '../world/world.ts';
import type { Mat } from './budowle.ts';
import { dayOf, hourOf, TICKS_PER_HOUR } from './clock.ts';
import { lootOf } from './mieszkania.ts';
import type { SimState } from './sim.ts';
import type { GameMode } from './tryb.ts';

// ---------------------------------------------------------------- typy stanu

/** stan drzwi: zamknięte (nie wiadomo, czy na klucz), sprawdzone na klucz, otwarte, wyważone, zabite deskami */
export type StanDrzwi = 'zamkniete' | 'na_klucz' | 'otwarte' | 'wywazone' | 'zabite';
export type Zamiar = 'zyczliwi' | 'nieufni' | 'wrodzy' | 'zdesperowani';
export type Nastroj = 'spokoj' | 'strach' | 'gniew' | 'zal' | 'nadzieja';
/** gdzie jest gospodarstwo: u siebie, odeszło z budynku, przyjęte do nas, nie żyje */
export type Gdzie = 'u_siebie' | 'odeszli' | 'u_nas' | 'nie_zyja';
export type WyborSpotkania =
  | 'rozmowa'
  | 'jedzenie'
  | 'zaproszenie'
  | 'zabranie'
  | 'odejscie'
  | 'obrona'
  | 'uspokojenie'
  | 'ucieczka';

/** osoba lokatora w kształcie pól osoby gry (bez id: dostaje je przy pierwszym spotkaniu) */
export type OsobaSasiada = Pick<Person, 'first' | 'name' | 'f' | 'prof' | 'skills' | 'age' | 'traits'> & {
  story?: string;
  ref?: string;
  rodzina?: string;
};

export interface Gospodarstwo {
  osoby: OsobaSasiada[];
  /** mieszkanie parteru (−1: wyżej) i numer wejścia klatki w b.entrances (−1: nie wiadomo) */
  apt: number;
  klatka: number;
  /** zarząd zna ich z imienia (karta budynku je wymienia) */
  znani: boolean;
  zamiar: Zamiar;
  nastroj: Nastroj;
  /** relacja z zarządem, −100 do 100 */
  rel: number;
  zapasy: Partial<Record<Mat, number>>;
  gdzie: Gdzie;
  /** ktoś bliski zmarł niedawno (z dziennika generatora) */
  zal?: boolean;
  /** indeksy osób w st.people od pierwszego spotkania, po kolei jak osoby */
  ludzie?: number[];
  /** pionki na mapie (w trakcie spotkania i po nim, dopóki zarząd jest w budynku) */
  pionki?: number[];
}

export interface MieszkanieSasiada {
  apt: number;
  stan: 'mieszkancy' | 'puste';
  why?: AptWhy;
  year?: number;
  /** gospodarstwo (indeks w domy) albo −1 */
  dom: number;
  /** tryb zombie: za drzwiami czeka szwendacz (do otwarcia drzwi) */
  zombie?: boolean;
  /** przeszukane pomieszczenia (lokalne numery), rosnąco */
  przeszukane: number[];
}

/** drzwi budynku w stanie: kafelek, stan i ukryty zamek (k: zamknięte na klucz, wychodzi przy próbie otwarcia) */
export interface DrzwiStan {
  t: number;
  s: StanDrzwi;
  k?: true;
}

export interface SasiedniBudynek {
  bid: number;
  /** drzwi na zewnątrz i drzwi wejściowe mieszkań, rosnąco po kafelku; stan liczony raz przy pierwszym dotknięciu */
  drzwi: DrzwiStan[];
  /** wnętrze dołączone do mapy (po pierwszych otwartych albo wyważonych drzwiach) */
  otwarty: boolean;
  /** czy na start ktoś tu mieszkał (stan drzwi na start) */
  ludzie: boolean;
  mieszkania: MieszkanieSasiada[];
  /** przeszukane pomieszczenia bez mieszkania (klatka, sala, hala, zaplecze), rosnąco */
  przeszukane: number[];
  domy: Gospodarstwo[];
  /** przeszukane piętra (etap 2) */
  pietra: number;
  /** ślady w pustych mieszkaniach do przekroju (wybite okna, wyważone drzwi, zalane i spalone podłogi); bez napraw */
  slady: { t: number; k: DamageKind }[];
  /** zawartość pustych mieszkań do położenia przy otwarciu: zepsute meble (indeksy mebli wnętrza) i sterty śmieci
      (x, y, wielkość); po otwarciu znika, bo meble i śmieci są już rzeczami w st.things */
  zawartosc?: { zepsute: number[]; smieci: [number, number, number][] };
}

export interface Spotkanie {
  nr: number;
  /** indeks w st.sasiedzi.budynki i w domy budynku */
  b: number;
  dom: number;
  /** nasi i ich pionki */
  my: number[];
  oni: number[];
  gdzie: 'drzwi' | 'mieszkanie' | 'pietro';
  tick: number;
  /** wrodzy rzucają się od razu (obrona, uspokojenie, ucieczka) */
  atak: boolean;
  /** wyważyliśmy im drzwi */
  wywazone: boolean;
}

/** Napis dla interfejsu: wynik spotkania, zamek, pukanie bez odpowiedzi, szwendacz za drzwiami, ostrzeżenie. n rośnie
    przy każdym nowym, więc interfejs pokazuje każdy raz (i po wczytaniu zapisu nie powtarza starego). */
export interface Napis {
  n: number;
  co: string;
  tick: number;
  /** budynek (indeks w budynki) i gospodarstwo (indeks w domy), których dotyczy */
  b: number;
  dom?: number;
  /** co dostaliśmy albo oddaliśmy */
  ile?: Partial<Record<Mat, number>>;
  /** nasz pionek: ranny albo ten, który pracował przy drzwiach */
  kto?: number;
  /** co powiedzieli przy rozmowie */
  info?: Info;
}

export interface Sasiedzi {
  /** budynki po kolei, jak zarząd ich dotknął */
  budynki: SasiedniBudynek[];
  spotkanie: Spotkanie | null;
  /** licznik spotkań */
  nr: number;
  /** ostatni napis i licznik napisów */
  napis: Napis | null;
  n: number;
}

/** lokatorzy budynku z generatora mieszkańców albo zapasowi: stany mieszkań parteru i gospodarstwa na nich */
export interface LokatorzyBudynku {
  stany: AptState[];
  domy: { apt: number; klatka: number; osoby: OsobaSasiada[]; zal: boolean }[];
}

/** co lokatorzy mówią przy rozmowie: o innych lokatorach, o pustym mieszkaniu, o tym, że coś tu łazi */
export type Info = 'inni' | 'puste' | 'lazi' | 'nic';

// ---------------------------------------------------------------- liczby z projektu

const MIN = TICKS_PER_HOUR / 60;
/** czasy pracy przy drzwiach (ticki): z łomem wyważanie trwa o połowę krócej */
export const OTWIERANIE_TICKS = Math.round(2 * MIN);
export const PUKANIE_TICKS = Math.round(2 * MIN);
export const WYWAZ_KLATKA_TICKS = Math.round(40 * MIN);
export const WYWAZ_MIESZKANIE_TICKS = Math.round(20 * MIN);
export const ZABIJANIE_TICKS = Math.round(20 * MIN);
export const ODBIJANIE_TICKS = Math.round(5 * MIN);
/** zabicie drzwi deskami kosztuje tyle desek ze stert */
export const ZABIJANIE_DESKI = 2;
/** hałas (promień w metrach): otwieranie, pukanie, wyważanie klatki i domu, mieszkania (z łomem ciszej), deski */
export const HALAS = {
  otwieranie: 3,
  pukanie: 6,
  wywazanie: 25,
  wywazanieLom: 12,
  mieszkanie: 15,
  mieszkanieLom: 8,
  deski: 10,
  odbijanie: 3,
} as const;
/** znani sąsiedzi: tyle najbliższych budynków mieszkalnych, najwyżej tyle metrów od drzwi siedziby */
export const ZNANI_BUDYNKI = 3;
export const ZNANI_M = 120;
/** relacja na start: znani i reszta */
export const REL_ZNANI = 15;
/** udział gospodarstw poza domem za dnia (8:00–18:00) w zwykłym trybie */
export const POZA_DOMEM = 0.4;
/** tryb zombie: przeżyło tyle gospodarstw, w tylu mieszkaniach z wymarcia czeka szwendacz */
export const ZOMBIE_PRZEZYLO = 0.25;
export const ZOMBIE_W_MIESZKANIU = 0.5;
/** tryb zombie: rabusie wśród ocalałych (co siódme gospodarstwo) */
export const ZOMBIE_RABUSIE = 1 / 7;

/** numer pomieszczenia sąsiada wspólny dla całej mapy: budynek (indeks w stanie) i lokalny numer */
export const gid = (b: number, room: number): number => b * 4096 + room;
export const gidB = (g: number): number => Math.floor(g / 4096);
export const gidRoom = (g: number): number => g % 4096;

// ---------------------------------------------------------------- wnętrza i drzwi

type WorldLike = Pick<World, 'size' | 'terr' | 'bid' | 'buildings' | 'seed'>;
const interiors = new WeakMap<object, Map<number, Interior>>();
const doorMaps = new WeakMap<object, Map<number, DrzwiBudynku>>();

/** wnętrze budynku (bez mieszkania zarządu), liczone raz na świat */
export function wnetrze(w: WorldLike, bid: number): Interior {
  let m = interiors.get(w);
  if (!m) {
    m = new Map();
    interiors.set(w, m);
  }
  let it = m.get(bid);
  if (!it) {
    it = buildInterior(w, bid);
    m.set(bid, it);
  }
  return it;
}

/** rodzaje drzwi budynku */
export interface DrzwiBudynku {
  /** drzwi na zewnątrz: kafelek, wolny kafelek przed nimi, numer wejścia (b.entrances) albo −1 dla dołożonych */
  zewn: { tile: number; out: number; wejscie: number }[];
  /** drzwi wejściowe mieszkań: kafelek drzwi → mieszkanie */
  mieszkan: Map<number, number>;
  /** drzwi wejściowe mieszkań: kafelek drzwi → kafelek przed nimi (posadzka po drugiej stronie) */
  przed: Map<number, number>;
}

/** Drzwi budynku według rodzaju, liczone raz na świat: na zewnątrz (którykolwiek sąsiad poza budynkiem), wejściowe
    mieszkań (z jednej strony posadzka mieszkania, z drugiej klatka albo inne mieszkanie) i reszta (w środku jednego
    mieszkania, sali albo klatki: zawsze przechodnie, poza tą listą). */
export function drzwiBudynku(w: WorldLike & Pick<World, 'blocked'>, bid: number): DrzwiBudynku {
  let m = doorMaps.get(w);
  if (!m) {
    m = new Map();
    doorMaps.set(w, m);
  }
  const have = m.get(bid);
  if (have) return have;
  const it = wnetrze(w, bid);
  const size = w.size;
  const b = w.buildings[bid];
  const out: DrzwiBudynku = { zewn: [], mieszkan: new Map(), przed: new Map() };
  const aptOf = (t: number) => (t >= 0 && it.room[t] >= 0 ? it.rooms[it.room[t]].apt : -2);
  for (const d of it.doors) {
    const x = d % size;
    const nb = [
      d >= size ? d - size : -1,
      x < size - 1 ? d + 1 : -1,
      d + size < size * size ? d + size : -1,
      x > 0 ? d - 1 : -1,
    ];
    const outside = nb.filter((n) => n >= 0 && w.bid[n] !== bid);
    if (outside.length) {
      const j = b.entrances.findIndex((e) => e.tile === d);
      const free = outside.find((n) => !w.blocked[n]) ?? outside[0];
      out.zewn.push({ tile: d, out: j >= 0 ? b.entrances[j].out : free, wejscie: j });
      continue;
    }
    // wejściowe mieszkania: naprzeciw siebie posadzki z różnych mieszkań albo mieszkania i klatki (apt −1)
    for (const [p, q] of [
      [nb[0], nb[2]],
      [nb[1], nb[3]],
    ]) {
      const a = aptOf(p);
      const c = aptOf(q);
      if (a === -2 || c === -2 || a === c) continue;
      // mieszkanie po tej stronie, która ma numer; między dwoma mieszkaniami to drzwi mniejszego
      const [apt, front] = a >= 0 && (c < 0 || a < c) ? [a, q] : [c, p];
      out.mieszkan.set(d, apt);
      out.przed.set(d, front);
    }
  }
  m.set(bid, out);
  return out;
}

/** drzwi budynku, których kafelek przed nimi leży na podwórku siedziby (po naszej stronie siatki) */
export function drzwiNaPodworko(w: WorldLike & Pick<World, 'blocked' | 'fence'>, bid: number): Set<number> {
  const yard = new Set(w.fence?.yard ?? []);
  return new Set(
    drzwiBudynku(w, bid)
      .zewn.filter((d) => yard.has(d.out))
      .map((d) => d.tile),
  );
}

const behindMemo = new WeakMap<object, Map<string, Set<number>>>();

/** Mieszkania za drzwiami: za drzwiami mieszkania to mieszkanie, za drzwiami na zewnątrz mieszkania, do których prowadzi
    wnętrze od tych drzwi bez przechodzenia przez drzwi mieszkań i inne drzwi na zewnątrz (dom: jego mieszkanie,
    blok: mieszkania tej klatki). Liczone raz na świat. */
export function mieszkaniaZaDrzwiami(w: WorldLike & Pick<World, 'blocked'>, bid: number, door: number): Set<number> {
  const dz = drzwiBudynku(w, bid);
  const own = dz.mieszkan.get(door);
  if (own !== undefined) return new Set([own]);
  let m = behindMemo.get(w);
  if (!m) {
    m = new Map();
    behindMemo.set(w, m);
  }
  const key = `${bid}:${door}`;
  const have = m.get(key);
  if (have) return have;
  const it = wnetrze(w, bid);
  const size = w.size;
  const outer = new Set(dz.zewn.map((d) => d.tile));
  const out = new Set<number>();
  const seen = new Set<number>([door]);
  const q = [door];
  while (q.length) {
    const c = q.pop()!;
    const x = c % size;
    for (const n of [c - size, x < size - 1 ? c + 1 : -1, c + size, x > 0 ? c - 1 : -1]) {
      if (n < 0 || n >= size * size || seen.has(n) || w.bid[n] !== bid) continue;
      const cell = it.cell[n];
      if (cell !== IN.FLOOR && cell !== IN.DOOR) continue;
      seen.add(n);
      if (cell === IN.DOOR) {
        const apt = dz.mieszkan.get(n);
        if (apt !== undefined) out.add(apt);
        else if (!outer.has(n)) q.push(n);
        continue;
      }
      const r = it.room[n];
      if (r >= 0 && it.rooms[r].apt >= 0) out.add(it.rooms[r].apt);
      q.push(n);
    }
  }
  m.set(key, out);
  return out;
}

/** Kafelek we wnętrzu sąsiedniego budynku (rzeczy tam nie są nasze, dopóki ktoś ich nie przyniesie): kafelek budynku
    innego niż siedziba. Rzeczy leżą na kafelkach budynków tylko w siedzibie i we wnętrzach otwartych sąsiadów. */
export function uSasiada(_st: Pick<SimState, 'sasiedzi'>, w: Pick<World, 'bid' | 'hq'>, tile: number): boolean {
  const bid = w.bid[tile];
  return bid >= 0 && bid !== w.hq;
}

/** przechodzi się przez drzwi w tym stanie */
export const przechodnie = (s: StanDrzwi): boolean => s === 'otwarte' || s === 'wywazone';

/** stan drzwi na kafelku w stanie budynku (undefined: to nie są drzwi tego budynku z listy) */
export const stanDrzwi = (b: SasiedniBudynek, tile: number): DrzwiStan | undefined => b.drzwi.find((d) => d.t === tile);

const doorRng = (seed: number, bid: number, tile: number) =>
  mulberry((Math.imul(seed | 0, 7919) ^ Math.imul(bid + 1, 104729) ^ Math.imul(tile + 1, 31337) ^ 0xd0025) >>> 0);

/** Stan drzwi na zewnątrz przy pierwszym dotknięciu budynku: z ludźmi na klucz w 70%, a w trybie zombie zawsze;
    bez ludzi 35% wyważone, 35% na klucz, reszta otwiera się klamką (zombie: 50% wyważone, 30% na klucz). Drzwi od
    ulicy budynku przy podwórku zawsze na klucz. */
export function drzwiNaStart(
  w: Pick<World, 'seed'>,
  mode: GameMode,
  bid: number,
  tile: number,
  ctx: { ludzie: boolean; odUlicy: boolean },
): DrzwiStan {
  if (ctx.odUlicy) return { t: tile, s: 'zamkniete', k: true };
  const r = doorRng(w.seed, bid, tile)();
  if (ctx.ludzie)
    return mode === 'zombie' || r < 0.7 ? { t: tile, s: 'zamkniete', k: true } : { t: tile, s: 'zamkniete' };
  const [forced, locked] = mode === 'zombie' ? [0.5, 0.8] : [0.35, 0.7];
  if (r < forced) return { t: tile, s: 'wywazone' };
  return r < locked ? { t: tile, s: 'zamkniete', k: true } : { t: tile, s: 'zamkniete' };
}

/** stan drzwi mieszkania na start: zamieszkane na klucz, ze szwendaczem tylko zamknięte, puste otwarte, a puste
    z wyważonymi drzwiami (uszkodzenie z przepisu splądrowania) wyważone */
export function drzwiMieszkaniaNaStart(tile: number, m: MieszkanieSasiada, wywazone: boolean): DrzwiStan {
  if (m.stan === 'mieszkancy') return { t: tile, s: 'zamkniete', k: true };
  if (m.zombie) return { t: tile, s: 'zamkniete' };
  return { t: tile, s: wywazone ? 'wywazone' : 'otwarte' };
}

/** budynek mieszkalny (blok albo dom) z mieszkaniami we wnętrzu */
export function mieszkalny(w: WorldLike, bid: number): boolean {
  const b = w.buildings[bid];
  return (b.cls === 'blok' || b.cls === 'dom') && wnetrze(w, bid).rooms.some((r) => r.apt >= 0);
}

const peopleMemo = new WeakMap<object, Map<number, boolean>>();

/** Na start ktoś tu mieszka, dla zamków na drzwiach: budynek mieszkalny z zamieszkanym mieszkaniem w stanach domyślnych
    (settleAptsOf). Czysta funkcja świata, bez generatora mieszkańców, więc menu i symulacja liczą zamki tak samo. */
export function ludzieNaStart(w: WorldLike, bid: number): boolean {
  let m = peopleMemo.get(w);
  if (!m) {
    m = new Map();
    peopleMemo.set(w, m);
  }
  let v = m.get(bid);
  if (v === undefined) {
    v = mieszkalny(w, bid) && settleAptsOf(w, wnetrze(w, bid)).apts.some((a) => a.state === 'mieszkancy');
    m.set(bid, v);
  }
  return v;
}

/** stan drzwi na zewnątrz przed pierwszym dotknięciem budynku (ten sam wpis tworzy symulacja) */
export function drzwiZewnNaStart(
  w: WorldLike & Pick<World, 'blocked' | 'fence'>,
  mode: GameMode,
  bid: number,
  tile: number,
): DrzwiStan {
  const yard = drzwiNaPodworko(w, bid);
  return drzwiNaStart(w, mode, bid, tile, { ludzie: ludzieNaStart(w, bid), odUlicy: yard.size > 0 && !yard.has(tile) });
}

/** cudze drzwi pod kafelkiem, do menu i poleceń */
export interface DrzwiPod {
  bid: number;
  tile: number;
  rodzaj: 'zewn' | 'mieszkanie';
  /** mieszkanie za drzwiami mieszkania (−1 dla drzwi na zewnątrz) */
  apt: number;
  /** kafelek, z którego się przy nich pracuje: przed drzwiami na zewnątrz, po drugiej stronie drzwi mieszkania */
  stand: number;
  s: StanDrzwi;
  /** drzwi od ulicy budynku przy podwórku: otwarte robią drogę z ulicy przez wnętrze na podwórko */
  wylom: boolean;
}

/** Cudze drzwi pod kafelkiem: same drzwi, kafelek przed wejściem z listy wejść budynku albo ściana i dach jeszcze
    nieotwartego budynku (wtedy najbliższe drzwi na zewnątrz). Drzwi mieszkań tylko w otwartym budynku. Stan ze stanu
    gry, a przed pierwszym dotknięciem z drzwiZewnNaStart. null: nic tu (także siedziba). */
export function drzwiPod(sas: Sasiedzi | undefined, w: World, mode: GameMode, tile: number): DrzwiPod | null {
  const size = w.size;
  let bid = w.bid[tile];
  let at = tile;
  if (bid < 0) {
    const b = w.buildings.find((x) => x.id !== w.hq && x.entrances.some((e) => e.out === tile));
    if (!b) return null;
    bid = b.id;
    at = b.entrances.find((e) => e.out === tile)!.tile;
  }
  if (bid === w.hq || !w.buildings[bid].entrances.length) return null;
  const rec = sas?.budynki.find((x) => x.bid === bid);
  const dz = drzwiBudynku(w, bid);
  let zewn = dz.zewn.find((d) => d.tile === at);
  const apt = dz.mieszkan.get(at);
  if (!zewn && apt === undefined) {
    // w otwartym budynku kafelki pomieszczeń mają własne polecenia
    if (rec?.otwarty || !dz.zewn.length) return null;
    const x = at % size;
    const y = Math.floor(at / size);
    const d2 = (t: number) => ((t % size) - x) ** 2 + (Math.floor(t / size) - y) ** 2;
    zewn = dz.zewn.reduce((a, b) => (d2(b.tile) < d2(a.tile) ? b : a));
  }
  if (zewn) {
    const yard = drzwiNaPodworko(w, bid);
    const s = (rec && stanDrzwi(rec, zewn.tile)?.s) ?? drzwiZewnNaStart(w, mode, bid, zewn.tile).s;
    return {
      bid,
      tile: zewn.tile,
      rodzaj: 'zewn',
      apt: -1,
      stand: zewn.out,
      s,
      wylom: yard.size > 0 && !yard.has(zewn.tile),
    };
  }
  if (!rec?.otwarty || apt === undefined) return null;
  return {
    bid,
    tile: at,
    rodzaj: 'mieszkanie',
    apt,
    stand: dz.przed.get(at)!,
    s: stanDrzwi(rec, at)?.s ?? 'otwarte',
    wylom: false,
  };
}

// ---------------------------------------------------------------- znani sąsiedzi

const knownMemo = new WeakMap<object, number[]>();

/** Budynki, których gospodarstwa zarząd zna z imienia (zwykły tryb): trzy najbliższe mieszkalne (blok, dom) poza
    siedzibą, najwyżej 120 m od jej drzwi (do najbliższego wejścia), rosnąco po odległości; liczby całkowite, bez
    Math.hypot. */
export function znaniBudynki(w: Pick<World, 'size' | 'hq' | 'buildings'> & object): number[] {
  const have = knownMemo.get(w);
  if (have) return have;
  const size = w.size;
  const hq = w.buildings[w.hq];
  const door = hq?.entrances[0]?.out ?? -1;
  const out: number[] = [];
  if (door >= 0) {
    const dx = door % size;
    const dy = Math.floor(door / size);
    const lim = ZNANI_M * ZNANI_M;
    out.push(
      ...w.buildings
        .filter((b) => b.id !== w.hq && (b.cls === 'blok' || b.cls === 'dom') && b.entrances.length)
        .map((b) => ({
          id: b.id,
          d: Math.min(...b.entrances.map((e) => ((e.out % size) - dx) ** 2 + (Math.floor(e.out / size) - dy) ** 2)),
        }))
        .filter((x) => x.d <= lim)
        .sort((a, b) => a.d - b.d || a.id - b.id)
        .slice(0, ZNANI_BUDYNKI)
        .map((x) => x.id),
    );
  }
  knownMemo.set(w, out);
  return out;
}

// ---------------------------------------------------------------- łup

/** łup sal, hal i zapleczy według rodzaju budynku: materiał, szansa, od, do */
const USLUGI: Partial<Record<BuildingClass, [Mat, number, number, number][]>> = {
  sklep: [
    ['jedzenie', 0.6, 2, 5],
    ['czesci', 0.4, 1, 2],
    ['zlom', 0.4, 1, 2],
    ['deski', 0.2, 1, 1],
    ['leki', 0.1, 1, 1],
  ],
  przychodnia: [
    ['leki', 0.8, 1, 3],
    ['czesci', 0.3, 1, 1],
    ['zlom', 0.2, 1, 1],
    ['jedzenie', 0.1, 1, 1],
  ],
  szkola: [
    ['deski', 0.6, 1, 3],
    ['czesci', 0.3, 1, 2],
    ['jedzenie', 0.2, 1, 2],
    ['leki', 0.15, 1, 1],
  ],
  garaz: [
    ['zlom', 0.8, 1, 3],
    ['czesci', 0.5, 1, 2],
    ['deski', 0.3, 1, 2],
  ],
  hala: [
    ['zlom', 0.8, 1, 3],
    ['czesci', 0.5, 1, 2],
    ['deski', 0.3, 1, 2],
  ],
  kosciol: [
    ['deski', 0.5, 1, 2],
    ['jedzenie', 0.3, 1, 2],
    ['leki', 0.1, 1, 1],
  ],
};
const USLUGI_INNE: [Mat, number, number, number][] = [
  ['deski', 0.5, 1, 2],
  ['zlom', 0.5, 1, 2],
  ['czesci', 0.3, 1, 1],
  ['jedzenie', 0.2, 1, 2],
];

/** Łup pomieszczenia bez mieszkania (sala, hala, zaplecze, klatka): tabela rodzaju budynku, w dużym (od 30 kafelków)
    i na zapleczu druga kolejka głównych materiałów. rnd z ziarna świata, budynku i pomieszczenia. */
export function lupUslug(cls: BuildingClass, kind: RoomKind, area: number, rnd: Rng): Partial<Record<Mat, number>> {
  const table = USLUGI[cls] ?? USLUGI_INNE;
  const rolls = area >= 30 || kind === 'zaplecze' ? 2 : 1;
  const out: Partial<Record<Mat, number>> = {};
  table.forEach(([mat, chance, lo, hi], k) => {
    for (let n = 0; n < (k < 2 ? rolls : 1); n++)
      if (rnd() < chance) out[mat] = (out[mat] ?? 0) + lo + Math.floor(rnd() * (hi - lo + 1));
  });
  return out;
}

/** łup pomieszczenia pustego mieszkania: tabela fali 1 (lootOf), a w trybie zombie z mieszkania z wymarcia dwa razy
    więcej jedzenia (ludzie zmarli niedawno, w kuchni zostały konserwy) */
export function lupMieszkania(
  why: AptWhy,
  kind: RoomKind,
  area: number,
  rnd: Rng,
  mode: GameMode,
): Partial<Record<Mat, number>> {
  const out = lootOf(why, kind, area, rnd);
  if (mode === 'zombie' && why === 'wymarcie' && out.jedzenie) out.jedzenie *= 2;
  return out;
}

/** zapasy gospodarstwa: jedzenie według liczby osób (w trybie zombie połowa), czasem lek, część i deski */
export function zapasyDomu(osoby: number, mode: GameMode, rnd: Rng): Partial<Record<Mat, number>> {
  const n = Math.max(1, osoby);
  let jedzenie = 2 + n + Math.floor(rnd() * (2 + n));
  if (mode === 'zombie') jedzenie = Math.max(1, Math.floor(jedzenie / 2));
  const out: Partial<Record<Mat, number>> = { jedzenie };
  if (rnd() < 0.4) out.leki = 1;
  if (rnd() < 0.3) out.czesci = 1;
  if (rnd() < 0.3) out.deski = 1;
  return out;
}

/** generator łupu albo zapasów z ziarna świata, budynku i liczby (pomieszczenie, mieszkanie) */
export const rngOfPlace = (seed: number, bid: number, k: number, salt: number): Rng =>
  mulberry((Math.imul(seed | 0, 9973) ^ Math.imul(bid + 1, 15485863) ^ Math.imul(k + 1, 7919) ^ salt) >>> 0);

// ---------------------------------------------------------------- lokatorzy

/** wielkości gospodarstw zapasowych 1–4 osoby (wagi) */
const ROZMIARY: [number, number][] = [
  [1, 30],
  [2, 35],
  [3, 20],
  [4, 15],
];

/** Lokatorzy bez tabel generatora: stany z settleAptsOf (połowa pustych), w każdym zamieszkanym mieszkaniu
    gospodarstwo 1–4 osób z generatora fachowców 0.3, z ziarna świata, budynku i mieszkania. used: imiona już zajęte
    (dla czytelności kart; rośnie o nowe imiona). */
export function domyZapasowe(
  w: Pick<World, 'size' | 'seed' | 'buildings'>,
  it: Interior,
  used: Set<string>,
): LokatorzyBudynku {
  const stany = settleAptsOf(w, it).apts;
  const domy: LokatorzyBudynku['domy'] = [];
  for (const s of stany) {
    if (s.state !== 'mieszkancy') continue;
    const r = rngOfPlace(w.seed, it.building, s.apt, 0x10ca);
    let roll = r() * ROZMIARY.reduce((a, [, wt]) => a + wt, 0);
    const n = ROZMIARY.find(([, wt]) => (roll -= wt) < 0)?.[0] ?? 1;
    const osoby: OsobaSasiada[] = [];
    for (let k = 0; k < n; k++) {
      const p = makePerson(r, used, () => 0, { home: it.building });
      used.add(p.first);
      osoby.push({
        first: p.first,
        name: p.name,
        f: p.f,
        prof: p.prof,
        skills: p.skills,
        age: p.age,
        traits: p.traits,
      });
    }
    domy.push({ apt: s.apt, klatka: -1, osoby, zal: r() < 0.1 });
  }
  return { stany, domy };
}

/** Zamiar i nastrój na start z osoby, która mówi za gospodarstwo (najstarszy dorosły), z głodu i trybu: lubiany
    i optymista życzliwi, kłótliwy nieufny, kłótliwy i odważny wrogi, mało jedzenia przy dzieciach zdesperowani;
    w trybie zombie strach i co siódme gospodarstwo to rabusie. rnd z ziarna budynku i mieszkania. */
export function poczatek(
  osoby: readonly OsobaSasiada[],
  zapasy: Partial<Record<Mat, number>>,
  zal: boolean,
  mode: GameMode,
  rnd: Rng,
): { zamiar: Zamiar; nastroj: Nastroj } {
  const adults = osoby.filter((o) => o.age >= 18);
  const head = [...(adults.length ? adults : osoby)].sort((a, b) => b.age - a.age)[0];
  const t = new Set(head?.traits ?? []);
  const kids = osoby.some((o) => o.age < 16);
  const hungry = (zapasy.jedzenie ?? 0) < 2 + osoby.length;
  const r = rnd();
  let zamiar: Zamiar;
  if (mode === 'zombie' && r < ZOMBIE_RABUSIE) zamiar = 'wrodzy';
  else if (t.has('klotliwy')) zamiar = t.has('odwazny') ? 'wrodzy' : 'nieufni';
  else if (hungry && kids) zamiar = 'zdesperowani';
  else if (t.has('lubiany') || t.has('optymista')) zamiar = 'zyczliwi';
  // w trybie zombie wrodzy to tylko rabusie (wyżej), w zwykłym trochę wrogów bez powodu w cechach
  else zamiar = r < 0.5 ? 'nieufni' : r < 0.82 ? 'zyczliwi' : r < 0.94 || mode === 'zombie' ? 'zdesperowani' : 'wrodzy';
  let nastroj: Nastroj;
  if (zal) nastroj = 'zal';
  else if (zamiar === 'wrodzy') nastroj = 'gniew';
  else if (mode === 'zombie' || t.has('tchorz')) nastroj = 'strach';
  else if (zamiar === 'zdesperowani') nastroj = rnd() < 0.5 ? 'nadzieja' : 'strach';
  else nastroj = rnd() < 0.7 ? 'spokoj' : 'strach';
  return { zamiar, nastroj };
}

/** gospodarstwo w domu: nocą (22–6) i w trybie zombie zawsze, za dnia (8–18) w zwykłym trybie 60% (z ziarna dnia) */
export function wDomu(seed: number, bid: number, dom: number, day: number, hour: number, mode: GameMode): boolean {
  if (mode === 'zombie' || hour < 8 || hour >= 18) return true;
  return rngOfPlace(seed, bid, dom * 1000 + day, 0x7a7a)() >= POZA_DOMEM;
}

/** gospodarstwo budynku k jest teraz w domu */
export function domTeraz(
  st: Pick<SimState, 'sasiedzi' | 'tick' | 'mode'>,
  w: Pick<World, 'seed'>,
  k: number,
  dom: number,
): boolean {
  const b = st.sasiedzi?.budynki[k];
  if (!b?.domy[dom]) return false;
  return wDomu(w.seed, b.bid, dom, dayOf(st.tick), hourOf(st.tick), st.mode ?? 'zwykly');
}

/** Pomieszczenie sąsiada da się przeszukać (raz): w otwartym budynku sala, hala, zaplecze i klatka, puste mieszkanie,
    a mieszkanie lokatorów tylko pod ich nieobecność (szaber). */
export function moznaPrzeszukac(
  st: Pick<SimState, 'sasiedzi' | 'tick' | 'mode'>,
  w: WorldLike,
  k: number,
  room: number,
): 'tak' | 'szaber' | null {
  const b = st.sasiedzi?.budynki[k];
  if (!b?.otwarty) return null;
  const r = wnetrze(w, b.bid).rooms[room];
  if (!r) return null;
  if (r.apt < 0) return b.przeszukane.includes(room) ? null : 'tak';
  const m = b.mieszkania.find((x) => x.apt === r.apt);
  if (!m || m.przeszukane.includes(room)) return null;
  if (m.stan === 'puste') return 'tak';
  const g = b.domy[m.dom];
  return g && g.gdzie === 'u_siebie' && !domTeraz(st, w, k, m.dom) ? 'szaber' : null;
}

/** indeks wpisu otwartego budynku pod kafelkiem i lokalny numer pomieszczenia (null poza pomieszczeniami sąsiadów) */
export function pokojSasiada(
  st: Pick<SimState, 'sasiedzi'>,
  w: WorldLike,
  tile: number,
): { k: number; room: number } | null {
  const bid = w.bid[tile];
  if (bid < 0) return null;
  const k = st.sasiedzi?.budynki.findIndex((b) => b.bid === bid && b.otwarty) ?? -1;
  if (k < 0) return null;
  const room = wnetrze(w, bid).room[tile];
  return room >= 0 ? { k, room } : null;
}

// ---------------------------------------------------------------- spotkanie

export interface WyborKarty {
  k: WyborSpotkania;
  ok: boolean;
  /** szansa powodzenia (zaproszenie, uspokojenie, obrona) albo oporu (zabranie), 0–1 */
  szansa?: number;
}

/** kontekst wyborów: porcje jedzenia w zapasach za siatką, uzbrojeni z naszych przy spotkaniu, tryb, czy któryś
    z naszych jest lubiany albo gadatliwy (uspokojenie) */
export interface KontekstSpotkania {
  jedzenie: number;
  uzbrojeni: number;
  mode: GameMode;
  mowca: 'lubiany' | 'gadula' | null;
}

export const szansaZaproszenia = (g: Gospodarstwo, mode: GameMode): number =>
  clamp(
    0.15 +
      g.rel / 100 +
      (g.zamiar === 'zdesperowani' ? 0.35 : 0) +
      (g.zamiar === 'zyczliwi' ? 0.2 : 0) +
      (mode === 'zombie' && g.nastroj === 'strach' ? 0.2 : 0) +
      (g.nastroj === 'nadzieja' ? 0.1 : 0) -
      (g.zamiar === 'wrodzy' ? 0.6 : 0) -
      (g.nastroj === 'gniew' ? 0.2 : 0),
    0.02,
    0.95,
  );

/** szansa, że lokatorzy bronią swoich zapasów: z zamiaru i nastroju, mniej przy każdym uzbrojonym z naszych */
export const szansaOporu = (g: Gospodarstwo, uzbrojeni: number): number =>
  clamp(
    { wrodzy: 0.7, nieufni: 0.35, zyczliwi: 0.15, zdesperowani: 0.5 }[g.zamiar] +
      (g.nastroj === 'gniew' ? 0.1 : 0) -
      (g.nastroj === 'strach' ? 0.1 : 0) -
      0.2 * Math.min(2, uzbrojeni),
    0.05,
    0.95,
  );

/** szansa, że wściekłych lokatorów da się uspokoić */
export const szansaUspokojenia = (g: Gospodarstwo, mowca: KontekstSpotkania['mowca']): number =>
  clamp(
    0.35 + g.rel / 200 + (mowca === 'lubiany' ? 0.2 : mowca === 'gadula' ? 0.1 : 0) - (g.nastroj === 'gniew' ? 0.1 : 0),
    0.05,
    0.9,
  );

/** szansa wygranej szarpaniny (obrona albo opór przy zabieraniu) */
export const szansaWalki = (uzbrojeni: number): number => clamp(0.45 + 0.2 * Math.min(2, uzbrojeni), 0.1, 0.9);

/** Wybory karty spotkania: przy ataku obrona, uspokojenie i ucieczka; inaczej rozmowa, jedzenie (przy 2 porcjach),
    zaproszenie (od relacji 20 albo dla życzliwych i zdesperowanych), zabranie zapasów i odejście. */
export function wybory(sp: Pick<Spotkanie, 'atak'>, g: Gospodarstwo, ctx: KontekstSpotkania): WyborKarty[] {
  if (sp.atak)
    return [
      { k: 'obrona', ok: true, szansa: szansaWalki(ctx.uzbrojeni) },
      { k: 'uspokojenie', ok: true, szansa: szansaUspokojenia(g, ctx.mowca) },
      { k: 'ucieczka', ok: true },
    ];
  const out: WyborKarty[] = [
    { k: 'rozmowa', ok: true },
    { k: 'jedzenie', ok: ctx.jedzenie >= 2 },
  ];
  if (g.rel >= 20 || g.zamiar === 'zyczliwi' || g.zamiar === 'zdesperowani')
    out.push({ k: 'zaproszenie', ok: g.gdzie === 'u_siebie', szansa: szansaZaproszenia(g, ctx.mode) });
  out.push({ k: 'zabranie', ok: true, szansa: szansaOporu(g, ctx.uzbrojeni) });
  out.push({ k: 'odejscie', ok: true });
  return out;
}

/** skutek wyboru do zastosowania przez symulację */
export interface Skutek {
  /** identyfikator zdania wyniku do interfejsu */
  co: string;
  rel: number;
  zamiar: Zamiar;
  nastroj: Nastroj;
  /** spotkanie się kończy (false: dalej karta, np. po udanym uspokojeniu) */
  koniec: boolean;
  /** dajemy tyle porcji jedzenia */
  dajemy?: number;
  /** przyjmują zaproszenie */
  zaproszeni?: boolean;
  /** ich zapasy zostają na ziemi dla nas */
  zabrane?: boolean;
  /** obrażenia naszej osoby i jednego z nich */
  ranaNasza?: number;
  ranaIch?: number;
  /** lokatorzy odchodzą z budynku */
  uciekaja?: boolean;
  /** nasza osoba wraca do siedziby */
  odwrot?: boolean;
  info?: Info;
}

/** Skutek wyboru. r: generator symulacji (st.rng), woła się go tylko tu. info: co mogą powiedzieć przy rozmowie
    (symulacja wie, czy są inni lokatorzy, puste mieszkanie albo szwendacz). */
export function skutek(
  k: WyborSpotkania,
  g: Gospodarstwo,
  sp: Pick<Spotkanie, 'atak' | 'wywazone'>,
  ctx: KontekstSpotkania,
  info: Info,
  r: Rng,
): Skutek {
  const base = { rel: g.rel, zamiar: g.zamiar, nastroj: g.nastroj, koniec: true };
  const rel = (d: number) => clamp(g.rel + d, -100, 100);
  const wound = () => 15 + Math.floor(r() * 16);
  switch (k) {
    case 'rozmowa':
      return { ...base, co: 'rozmowa', rel: rel(10), nastroj: g.nastroj === 'strach' ? 'spokoj' : g.nastroj, info };
    case 'jedzenie':
      return {
        ...base,
        co: 'jedzenie',
        rel: rel(25),
        nastroj: 'nadzieja',
        zamiar: g.zamiar === 'zdesperowani' || g.zamiar === 'nieufni' ? 'zyczliwi' : g.zamiar,
        dajemy: 2,
      };
    case 'zaproszenie': {
      const yes = r() < szansaZaproszenia(g, ctx.mode);
      return yes
        ? { ...base, co: 'zaproszenie_tak', rel: rel(10), nastroj: 'nadzieja', zaproszeni: true }
        : { ...base, co: 'zaproszenie_nie', rel: rel(2) };
    }
    case 'zabranie': {
      const stolen = { ...base, rel: -80, zamiar: 'wrodzy' as const, nastroj: 'gniew' as const };
      if (r() >= szansaOporu(g, ctx.uzbrojeni)) return { ...stolen, co: 'zabranie', zabrane: true };
      // opór: szarpanina
      if (r() < szansaWalki(ctx.uzbrojeni))
        return { ...stolen, co: 'zabranie_wygrana', zabrane: true, ranaIch: wound(), uciekaja: r() < 0.5 };
      return { ...stolen, co: 'zabranie_przegrana', ranaNasza: wound() };
    }
    case 'odejscie':
      return { ...base, co: 'odejscie', rel: sp.wywazone ? rel(-5) : g.rel };
    case 'obrona':
      if (r() < szansaWalki(ctx.uzbrojeni))
        return { ...base, co: 'obrona_wygrana', rel: rel(-30), ranaIch: wound() + 5, uciekaja: true };
      return { ...base, co: 'obrona_przegrana', rel: rel(-10), ranaNasza: wound() + 5, odwrot: true };
    case 'uspokojenie':
      if (r() < szansaUspokojenia(g, ctx.mowca))
        return {
          ...base,
          co: 'uspokojenie_tak',
          rel: Math.max(0, g.rel),
          zamiar: 'nieufni',
          nastroj: 'strach',
          koniec: false,
        };
      return { ...base, co: 'uspokojenie_nie', rel: rel(-10), ranaNasza: wound(), odwrot: true };
    case 'ucieczka':
      return { ...base, co: 'ucieczka', rel: rel(-10), odwrot: true };
  }
}

/** początek spotkania: wrodzy po wyważeniu ich drzwi albo w gniewie nocą rzucają się od razu */
export const atakOdRazu = (g: Gospodarstwo, wywazone: boolean, noc: boolean): boolean =>
  g.zamiar === 'wrodzy' && (wywazone || (noc && g.nastroj === 'gniew'));

/** po wyważeniu albo hałasie pod drzwiami: nastrój tych, którzy są w domu */
export function poHalasie(g: Gospodarstwo, noc: boolean): Pick<Gospodarstwo, 'nastroj' | 'rel'> {
  const angry = g.zamiar === 'wrodzy' || g.osoby.some((o) => o.traits.includes('odwazny'));
  return { nastroj: noc || angry ? (angry ? 'gniew' : 'strach') : g.nastroj, rel: clamp(g.rel - 20, -100, 100) };
}

/** komórka wnętrza blokuje (ściana, schody) */
export const solidCell = (c: number): boolean => c === IN.WALL || c === IN.STAIRS;

/** materiały, które z sąsiadów nosi się do siedziby */
export const LUP_MATS: ReadonlySet<string> = new Set(['deski', 'zlom', 'czesci', 'jedzenie', 'leki', 'drewno']);

// ---------------------------------------------------------------- wpis budynku

/** Wpis budynku przy pierwszym dotknięciu jego drzwi. Lokatorzy z generatora mieszkańców albo zapasowi (lok, null dla
    budynku bez mieszkań); mieszkanie „zamieszkane” bez osób stoi puste, bo nie ma kogo spotkać. W trybie zombie
    przeżywa co czwarte gospodarstwo, reszta mieszkań stoi pusta z wymarcia (2051), a w co drugim takim za drzwiami czeka
    szwendacz. Stany i zawartość pustych z settleAptsOf, drzwi na zewnątrz i mieszkań ze stanem na start, zapasy,
    zamiar i nastrój gospodarstw, znani sąsiedzi. Czysta funkcja: losowania z ziarna świata, budynku i mieszkania. */
export function nowyBudynek(w: World, mode: GameMode, bid: number, lok: LokatorzyBudynku | null): SasiedniBudynek {
  const it = wnetrze(w, bid);
  const dz = drzwiBudynku(w, bid);
  const n = it.rooms.reduce((m, r) => Math.max(m, r.apt + 1), 0);
  const home = mieszkalny(w, bid);
  const known = mode !== 'zombie' && znaniBudynki(w).includes(bid);
  const domy: Gospodarstwo[] = [];
  const stany: AptState[] = [];
  const domOf = new Map<number, number>();
  const zombieApt = new Set<number>();
  for (let a = 0; a < n; a++) {
    const s = home ? lok?.stany.find((x) => x.apt === a) : undefined;
    const h = home ? lok?.domy.find((d) => d.apt === a) : undefined;
    if (s?.state === 'mieszkancy' && h?.osoby.length) {
      if (mode === 'zombie' && rngOfPlace(w.seed, bid, a, 0x2b1e)() >= ZOMBIE_PRZEZYLO) {
        stany.push({ bid, apt: a, state: 'puste', why: 'wymarcie', year: 2051 });
        if (rngOfPlace(w.seed, bid, a, 0x2b1f)() < ZOMBIE_W_MIESZKANIU) zombieApt.add(a);
        continue;
      }
      const zapasy = zapasyDomu(h.osoby.length, mode, rngOfPlace(w.seed, bid, a, 0x5a9a));
      const start = poczatek(h.osoby, zapasy, h.zal, mode, rngOfPlace(w.seed, bid, a, 0x3e3e));
      domOf.set(a, domy.length);
      domy.push({
        osoby: h.osoby.map((o) => ({ ...o, skills: { ...o.skills }, traits: [...o.traits] })),
        apt: a,
        klatka: h.klatka,
        znani: known,
        ...start,
        // znani: sympatia, a wrogich znamy od złej strony (niechęć)
        rel: known ? (start.zamiar === 'wrodzy' ? -REL_ZNANI : REL_ZNANI) : 0,
        zapasy,
        gdzie: 'u_siebie',
        ...(h.zal ? { zal: true } : {}),
      });
      stany.push({ bid, apt: a, state: 'mieszkancy' });
    } else if (s?.state === 'puste') stany.push({ ...s, bid });
    else stany.push({ bid, apt: a, state: 'puste' });
  }
  const r = settleAptsOf(w, it, stany);
  const mieszkania: MieszkanieSasiada[] = r.apts.map((x) => ({
    apt: x.apt,
    stan: x.state === 'mieszkancy' ? 'mieszkancy' : 'puste',
    ...(x.why ? { why: x.why } : {}),
    ...(x.year ? { year: x.year } : {}),
    dom: domOf.get(x.apt) ?? -1,
    ...(zombieApt.has(x.apt) ? { zombie: true } : {}),
    przeszukane: [],
  }));
  const drzwi: DrzwiStan[] = dz.zewn.map((d) => drzwiZewnNaStart(w, mode, bid, d.tile));
  for (const [tile, apt] of dz.mieszkan) {
    const m = mieszkania[apt];
    const wywazone = r.damage.some((x) => x.kind === 'drzwi' && x.tile === tile);
    if (m) drzwi.push(drzwiMieszkaniaNaStart(tile, m, wywazone));
  }
  drzwi.sort((a, b) => a.t - b.t);
  const zepsute: number[] = [];
  r.furniture.forEach((f, k) => {
    if (f.broken) zepsute.push(k);
  });
  return {
    bid,
    drzwi,
    otwarty: false,
    ludzie: ludzieNaStart(w, bid),
    mieszkania,
    przeszukane: [],
    domy,
    pietra: 0,
    slady: r.damage.map((d) => ({ t: d.tile, k: d.kind })),
    zawartosc: { zepsute, smieci: r.trash.map((t) => [t.x, t.y, t.n]) },
  };
}
