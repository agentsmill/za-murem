/* Odczyt stanu dla modułu zarządu (src/gov, karta nocy, uchwały) i dla interfejsu: ludzie zarządu z potrzebami,
   umiejętnościami i obecną pracą (people: tylko zarząd, z tego korzysta zarząd), mieszkańcy siedziby z osobą
   z generatora mieszkańców (lokatorzy: tylko do kart w interfejsie), zapasy drewna i jedzenia (drewno razem z ogniem
   we wszystkich paleniskach naszych mieszkań), czas, badania dla tablicy korkowej (`tablica`, src/ui/badania.ts;
   `GovInput.badania` to co innego: odczyt dla ramy zwycięstwa). Czysta funkcja stanu i świata. Zwraca świeże obiekty
   (zwykły JSON), więc zmiany w wyniku nie ruszają symulacji.
   Praca ludzi (src/sim/praca.ts) w odczycie: każda osoba niesie swój indeks w `st.people` (`osoba`, klucz ustawień),
   znacznik `sam` (zajęcie, które zaczęła bez polecenia gracza) i ustawienia pracy w kolejności `RODZAJE`
   (priorytety, stałe zajęcie, przełącznik „za siatkę”); cały odczyt ma progi zapasów i rodzaje widoczne w tej grze.
   `populacja` liczy ludzi pod zarządem (zarząd, także na wyprawie, i mieszkańcy siedziby, bez sąsiadów i gości):
   z niej bierze `GovInput.ludnosc` droga ludnościowa do zwycięstwa. */

import type { Dom, TechDom } from '../content/data.ts';
import { TECH_DOMS } from '../content/data.ts';
import type { Person } from '../content/people.ts';
import type { Tx } from '../core/jezyk.ts';
import type { World } from '../world/world.ts';
import {
  badaniaDom,
  badaniaWidoczne,
  type Kartka,
  kartka,
  odkrycia,
  PALENISKA,
  TECHS,
  tempoOsoby,
  znajacy,
} from './badania.ts';
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
import {
  type Priorytet,
  type Progi,
  priorytet,
  progi,
  RODZAJE,
  type RodzajPracy,
  staleZajecie,
  WPISY,
  zaSiatke,
} from './praca.ts';
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
  /** indeks osoby w `st.people`: klucz ustawień pracy ludzi (polecenia `prio`, `stale`, `zasiatke`) */
  osoba: number;
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
  /** Zajęcie bez polecenia gracza: osoba ma pracę (`job`) i zaczęła ją sama (`job.order === false`: praca z automatu,
      a także sen, posiłek i grzanie się). Bezczynny i wykonujący polecenie mają `false`. */
  sam: boolean;
  /** Ustawienia pracy ludzi tej osoby (src/sim/praca.ts): priorytety rodzajów w kolejności `RODZAJE` (0 nie robi,
      1 najważniejszy, 4 najmniej), stałe zajęcie albo null i przełącznik „może wychodzić za siatkę”. Ustawienia
      przyjmuje tylko zarząd, więc u mieszkańca z osobą to wartości domyślne. */
  praca: { prio: Priorytet[]; stale: RodzajPracy | null; zaSiatke: boolean };
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
  /** całe drewno w sztukach, razem z tym, co jest w ogniu: w kozie zarządu i w nowych paleniskach naszych mieszkań */
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

/** badania dla tablicy korkowej (src/ui/badania.ts): bieżące badanie, stan każdej kartki, kto siedzi przy stole, kto
    w osadzie zna dziedzinę, książki na półce i odkrycia; null bez pracowni i bez stanu badań */
export interface SimBadania {
  /** bieżące badanie (identyfikator technologii) albo null, gdy nic nie wybrano */
  cur: string | null;
  /** stan kartki każdej technologii, w kolejności `TECHS` */
  kartki: Kartka[];
  /** osoby siedzące przy stole (pionek w fazie siedzenia), z umiejętnością w dziedzinie bieżącego badania */
  siedza: { id: number; name: string; prof: string; skill: number }[];
  /** kto w osadzie zna dziedzinę (umiejętność co najmniej 1), od najlepszych: szczegóły kartki; dopisek do kontraktu
      z planu badań, bez niego tablica nie powiedziałaby, kogo posadzić przy stole */
  znaja: Partial<Record<TechDom, { name: string; prof: string; skill: number }[]>>;
  /** książki na półce osady w każdej dziedzinie (najwyżej 2) */
  ksiazki: Partial<Record<TechDom, number>>;
  /** ukończone technologie z tickiem ukończenia, od najstarszej */
  odkrycia: { id: string; tick: number }[];
  /** czy stoi pracownia (po rozbiórce stan badań zostaje, a pracowni nie ma) */
  pracownia: boolean;
  /** punkty postępu na godzinę gry, które daje obecna obsada stołu w dziedzinie bieżącego badania (0 bez badania) */
  tempo: number;
  /** to samo dla każdej dziedziny: tempo obecnej obsady, gdyby badanie było z tej dziedziny (szacunek czasu na kartce
      innej dziedziny niż bieżące badanie); `tempo` to wpis tej dziedziny, co bieżące badanie */
  tempoDom: Partial<Record<TechDom, number>>;
}

export interface SimSnapshot {
  /** tryb gry */
  mode: GameMode;
  /** praca ludzi w tej grze: progi zapasów (domyślne z poprawkami gracza; w trybie zombie dzidy domyślnie 12) i rodzaje pracy,
      które w niej istnieją, w kolejności `RODZAJE` (kolumny panelu; `badania` dopiero, gdy gra ma badania) */
  praca: { progi: Progi; widoczne: RodzajPracy[] };
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
  /** pali się koza zarządu albo któreś z nowych palenisk naszych mieszkań (koza z beczki, kocioł): karta nocy i raport
      poranny nie mają mówić o zimnej kuchni przy palącym się kotle. Ogień samej kozy zarządu to `stock.fireHours`. */
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
  /** tablica badań (src/ui/badania.ts); null bez pracowni i bez stanu badań. Nazwa inna niż `GovInput.badania`, które
      ma kształt odczytu dla ramy zwycięstwa */
  tablica: SimBadania | null;
}

/** odczyt badań dla tablicy: stan kartek w trybie gry, obsada stołu i tempo jej pracy (w bieżącej dziedzinie i w każdej) */
function badaniaOf(st: SimState): SimBadania | null {
  if (!badaniaWidoczne(st)) return null;
  const mode = modeOf(st);
  const dom = badaniaDom(st);
  const siedza: SimBadania['siedza'] = [];
  const tempoDom: Partial<Record<TechDom, number>> = Object.fromEntries(TECH_DOMS.map((d) => [d, 0]));
  for (const p of st.pawns) {
    if (p.job?.t !== 'research' || p.job.phase !== 1) continue;
    const o = st.people[p.person];
    if (!o) continue;
    siedza.push({ id: p.id, name: o.name, prof: o.prof, skill: dom ? (o.skills[dom] ?? 0) : 0 });
    for (const d of TECH_DOMS) tempoDom[d] = (tempoDom[d] ?? 0) + tempoOsoby(o, d);
  }
  return {
    cur: st.research?.cur ?? null,
    kartki: TECHS.map((t) => kartka(st, t.id, mode)),
    siedza,
    znaja: Object.fromEntries(TECH_DOMS.map((d) => [d, znajacy(st, d)])),
    ksiazki: { ...st.books },
    odkrycia: odkrycia(st),
    pracownia: st.things.some((t) => t.kind === 'pracownia'),
    tempo: dom ? (tempoDom[dom] ?? 0) : 0,
    tempoDom,
  };
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
    osoba: p.person,
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
    sam: !!p.job && p.job.order === false,
    praca: {
      prio: RODZAJE.map((r) => priorytet(st, p.person, r)),
      stale: staleZajecie(st, p.person),
      zaSiatke: zaSiatke(st, p.person),
    },
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

/** Ludzie pod naszym zarządem: pionki `core` (także na wyprawie za mapą) i `resident` (mieszkańcy siedziby, z osobą
    z generatora albo bez). Sąsiedzi z okolicznych budynków, szabrownicy, szwendacze, handlarz, wędrowcy, obce ekipy
    i tłum się nie liczą. Z tego liczby bierze `GovInput.ludnosc` (droga ludnościowa), więc nie ma drugiego sposobu
    liczenia ludności. Czysty odczyt. */
export function populacja(st: SimState): { zarzad: number; mieszkancy: number; razem: number } {
  let zarzad = 0;
  let mieszkancy = 0;
  for (const p of st.pawns) {
    if (p.kind === 'core') zarzad++;
    else if (p.kind === 'resident') mieszkancy++;
  }
  return { zarzad, mieszkancy, razem: zarzad + mieszkancy };
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
  // drewno w ogniu: koza zarządu (fuel liczone niżej) i nowe paleniska naszych mieszkań (koza z beczki, kocioł według
  // PALENISKA); zbiornik trzyma sztuki jak koza, więc sztuka to BURN_TICKS ognia niezależnie od wagi paleniska
  let woodFire = 0;
  // pali się któreś z nowych palenisk naszych mieszkań (razem z kozą zarządu daje `kozaLit`)
  let noweLit = false;
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
    else if (t.kind !== 'koza' && Object.hasOwn(PALENISKA, t.kind)) {
      woodFire += Math.ceil(t.fuel / BURN_TICKS);
      if (t.fuel > 0) noweLit = true;
    }
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
  const ludnosc = populacja(st);
  return {
    mode: modeOf(st),
    praca: { progi: progi(st), widoczne: RODZAJE.filter((r) => WPISY[r].widoczny(st)) },
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
    kozaLit: fuel > 0 || noweLit,
    people,
    lokatorzy,
    stock: {
      woodSklad,
      woodLoose,
      woodCarried,
      fireHours: fuel / TICKS_PER_HOUR,
      wood: woodSklad + woodLoose + woodCarried + Math.ceil(fuel / BURN_TICKS) + woodFire,
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
    residents: ludnosc.mieszkancy,
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
    tablica: badaniaOf(st),
  };
}
