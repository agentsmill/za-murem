/* Stany mieszkań i uszkodzenia (docs/M2-fala-1.md). Kontrakt: świat wypełnia, symulacja, rysowanie i
   interfejs czytają. Do czasu generatora mieszkańców z adresu stany losuje świat z ziarna budynku;
   generator poda je potem w tym samym kształcie (settleApts przyjmuje je z zewnątrz).
   Mieszkanie z kozą to mieszkanie zarządu. Z pozostałych mniej więcej połowa stoi pusta: z powodem i rokiem
   opuszczenia, a w środku zepsute meble, sterty śmieci i uszkodzenia według powodu. Wśród mieszkań, do których
   z podwórka da się dojść bez wychodzenia za siatkę, zawsze są mieszkańcy, a gdy takich mieszkań jest więcej,
   także puste do przeszukania. Śmieci są przechodnie, a wyważone drzwi zostają przejściem, więc nic tu nie
   zmienia blocked. Deterministycznie z ziarna świata i numeru budynku, zawartość każdego mieszkania z jego
   własnego ziarna. */

import { mulberry, type Rng } from '../core/rng.ts';
import { type Furniture, IN, type RoomKind } from './interior.ts';
import type { World } from './world.ts';

/** dlaczego mieszkanie jest puste */
export type AptWhy = 'wyjazd' | 'wymarcie' | 'splądrowanie' | 'zalanie' | 'pozar';

export interface AptState {
  /** budynek i numer mieszkania z wnętrza (Room.apt) */
  bid: number;
  apt: number;
  state: 'zarzad' | 'mieszkancy' | 'puste';
  why?: AptWhy;
  /** rok opuszczenia (2026–2051) */
  year?: number;
}

export type DamageKind = 'okno' | 'drzwi' | 'rura' | 'podloga' | 'piec';

export interface Damage {
  kind: DamageKind;
  /** kafelek uszkodzenia (okno i drzwi: kafelek ściany albo drzwi, reszta: posadzka) */
  tile: number;
  bid: number;
  apt: number;
}

/** sterta śmieci w pustym mieszkaniu (przechodnia); n: wielkość 1–3 */
export interface Smieci {
  kind: 'smieci';
  x: number;
  y: number;
  w: 1;
  h: 1;
  n: number;
}

/** z czego powstają stany mieszkań: siedziba z wnętrzem i siatką (podwórko) */
export type AptWorld = Pick<World, 'size' | 'seed' | 'blocked' | 'buildings' | 'hq' | 'interior' | 'fence'>;

export interface Apts {
  apts: AptState[];
  /** meble wnętrza siedziby; w pustych mieszkaniach część z broken */
  furniture: Furniture[];
  /** sterty śmieci w pustych mieszkaniach */
  trash: Smieci[];
  damage: Damage[];
}

interface Recipe {
  /** waga powodu przy losowaniu */
  weight: number;
  /** lata opuszczenia, od–do */
  years: [number, number];
  /** szansa, że mebel jest zniszczony */
  broken: number;
  /** liczba stert śmieci i ich wielkość, od–do */
  piles: [number, number];
  size: [number, number];
}

/** powody opuszczenia: wyjazdy na początku upadku, potem wymieranie, szaber, zalania i pożary bez napraw */
const RECIPES: Record<AptWhy, Recipe> = {
  wyjazd: { weight: 30, years: [2029, 2038], broken: 0, piles: [1, 2], size: [1, 1] },
  wymarcie: { weight: 25, years: [2035, 2050], broken: 0.1, piles: [1, 2], size: [1, 2] },
  splądrowanie: { weight: 20, years: [2036, 2051], broken: 0.5, piles: [2, 4], size: [1, 3] },
  zalanie: { weight: 15, years: [2034, 2051], broken: 0.7, piles: [1, 2], size: [1, 2] },
  pozar: { weight: 10, years: [2033, 2051], broken: 0.5, piles: [2, 3], size: [2, 3] },
};
const WHYS = Object.keys(RECIPES) as AptWhy[];

const between = (rnd: Rng, [lo, hi]: [number, number]) => lo + Math.floor(rnd() * (hi - lo + 1));

/** Stany mieszkań siedziby i zawartość pustych. given: stany z zewnątrz (generator mieszkańców); mieszkania
    bez stanu dostają domyślny z ziarna, a mieszkanie z kozą zawsze należy do zarządu. Pusty stan bez powodu
    albo roku dostaje je z ziarna mieszkania. Niczego nie zmienia w świecie: wynik nakłada applyApts. */
export function settleApts(w: AptWorld, given?: readonly AptState[]): Apts {
  const { size, interior: it } = w;
  const bid = w.hq;
  const n = it.rooms.reduce((m, r) => Math.max(m, r.apt + 1), 0);
  const base = it.furniture.map(({ broken: _broken, ...f }): Furniture => f);
  if (!n) return { apts: [], furniture: base, trash: [], damage: [] };
  const aptAt = (t: number) => (it.room[t] >= 0 ? it.rooms[it.room[t]].apt : -1);

  // 1. domyślnie: losowa połowa pustych. Przy podwórku (mieszkania, do których mieszkańcy dojdą bez wychodzenia
  // za siatkę) jedno puste do przeszukania, gdy są tam co najmniej dwa, a reszta dla mieszkańców; pozostałe
  // puste dalej, w innych klatkach, a gdy tam brakuje mieszkań, także przy podwórku, ale nie wszystkie
  const rnd = mulberry(((w.seed * 6151) ^ (bid * 92821) ^ 0x5eed5) >>> 0);
  const others = [...Array(n).keys()].filter((a) => a !== it.home);
  shuffle(others, rnd);
  const want = Math.floor(others.length / 2) + (others.length % 2 === 1 && rnd() < 0.5 ? 1 : 0);
  const reach = reachable(w);
  const near = others.filter((a) => reach.has(a));
  const empty = new Set<number>();
  if (near.length >= 2) empty.add(near[0]);
  for (const a of [...others.filter((x) => !reach.has(x)), ...near.slice(1, -1)]) if (empty.size < want) empty.add(a);

  // 2. stany: z zewnątrz, gdy są, inaczej domyślne; powód i rok pustego z ziarna mieszkania
  const byApt = new Map((given ?? []).filter((g) => g.bid === bid).map((g) => [g.apt, g]));
  const apts: AptState[] = [];
  for (let a = 0; a < n; a++) {
    if (a === it.home) {
      apts.push({ bid, apt: a, state: 'zarzad' });
      continue;
    }
    const g = byApt.get(a);
    const gone = g ? g.state === 'puste' : empty.has(a);
    if (!gone) {
      apts.push({ bid, apt: a, state: 'mieszkancy' });
      continue;
    }
    const r = aptRng(w.seed, bid, a, 0x3a1e);
    let why = g?.why;
    if (!why) {
      let roll = r() * WHYS.reduce((s, k) => s + RECIPES[k].weight, 0);
      why = WHYS.find((k) => {
        roll -= RECIPES[k].weight;
        return roll < 0;
      }) as AptWhy;
    }
    apts.push({ bid, apt: a, state: 'puste', why, year: g?.year ?? between(r, RECIPES[why].years) });
  }

  // 3. zawartość pustych: zepsute meble, uszkodzenia, sterty śmieci
  const furniture = base.map((f) => ({ ...f }));
  const covered = new Set<number>();
  for (const f of furniture)
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) covered.add(y * size + x);
  const doorSide = new Set<number>();
  for (const d of it.doors) for (const k of near4(size, d)) doorSide.add(k);
  const floors: number[][] = Array.from({ length: n }, () => []);
  const b = w.buildings[bid];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const t = y * size + x;
      const a = aptAt(t);
      if (a >= 0 && it.cell[t] === IN.FLOOR) floors[a].push(t);
    }
  const kindOf = (t: number): RoomKind => it.rooms[it.room[t]].kind;
  const touches = (t: number, a: number) => near4(size, t).some((k) => it.cell[k] === IN.FLOOR && aptAt(k) === a);
  const open = (t: number) => !covered.has(t) && !doorSide.has(t);
  const trash: Smieci[] = [];
  const damage: Damage[] = [];
  for (const s of apts) {
    if (s.state !== 'puste' || !s.why) continue;
    const a = s.apt;
    const R = RECIPES[s.why];
    const r = aptRng(w.seed, bid, a, 0x5711);
    for (const f of furniture) if (aptAt(f.y * size + f.x) === a && r() < R.broken) f.broken = true;
    const hurt = (kind: DamageKind, from: number[]) => {
      const left = from.filter((t) => !damage.some((d) => d.kind === kind && d.tile === t));
      if (left.length) damage.push({ kind, tile: left[Math.floor(r() * left.length)], bid, apt: a });
    };
    const windows = it.windows.filter((t) => touches(t, a));
    // drzwi wejściowe: z jednej strony mieszkanie, z drugiej klatka, inne mieszkanie albo dwór
    const entry = it.doors.filter(
      (t) =>
        touches(t, a) &&
        near4(size, t).some((k) => k >= 0 && (it.cell[k] === IN.NONE || (it.cell[k] === IN.FLOOR && aptAt(k) !== a))),
    );
    const pipes = floors[a].filter(
      (t) =>
        (kindOf(t) === 'lazienka' || kindOf(t) === 'kuchnia') && near4(size, t).some((k) => it.cell[k] === IN.WALL),
    );
    const bath = pipes.filter((t) => kindOf(t) === 'lazienka');
    const stove = furniture
      .filter((f) => f.kind === 'kuchenka' && aptAt(f.y * size + f.x) === a)
      .map((f) => f.y * size + f.x);
    if (s.why === 'wyjazd' && r() < 0.3) hurt('okno', windows);
    if (s.why === 'wymarcie' && r() < 0.4) hurt('rura', bath.length ? bath : pipes);
    if (s.why === 'splądrowanie') {
      hurt('drzwi', entry);
      if (r() < 0.4) hurt('okno', windows);
    }
    if (s.why === 'zalanie') {
      hurt('rura', bath.length ? bath : pipes);
      const low = floors[a].filter((t) => open(t) && ['lazienka', 'kuchnia', 'przedpokoj'].includes(kindOf(t)));
      for (let k = between(r, [1, 2]); k > 0; k--) hurt('podloga', low.length ? low : floors[a].filter(open));
    }
    if (s.why === 'pozar') {
      hurt('okno', windows);
      if (r() < 0.5) hurt('piec', stove);
      if (r() < 0.6)
        hurt(
          'podloga',
          floors[a].filter((t) => open(t) && (kindOf(t) === 'pokoj' || kindOf(t) === 'kuchnia')),
        );
    }
    // śmieci na wolnej posadzce, nie w progu, z metrem przerwy między stertami
    const spots = floors[a].filter(open);
    shuffle(spots, r);
    const piles = between(r, R.piles);
    const mine: number[] = [];
    for (const t of spots) {
      if (mine.length >= piles) break;
      if (mine.some((m) => cheb(size, m, t) < 2)) continue;
      mine.push(t);
      trash.push({ kind: 'smieci', x: t % size, y: Math.floor(t / size), w: 1, h: 1, n: between(r, R.size) });
    }
    // każde puste ma coś do odzyskania albo do naprawienia
    if (!mine.length && !damage.some((d) => d.apt === a)) hurt('podloga', floors[a]);
  }
  trash.sort((p, q) => p.y - q.y || p.x - q.x);
  return { apts, furniture, trash, damage };
}

/** Nakłada stany i zawartość mieszkań na świat: stany, uszkodzenia, meble wnętrza i śmieci (na końcu props,
    poprzednie śmieci znikają). Można wołać ponownie, np. ze stanami od generatora mieszkańców. */
export function applyApts(w: Pick<World, 'apts' | 'damage' | 'props' | 'interior'>, r: Apts): void {
  w.apts = r.apts;
  w.damage = r.damage;
  w.interior.furniture = r.furniture;
  w.props = [...w.props.filter((p) => p.kind !== 'smieci'), ...r.trash];
}

/** mieszkania poza zarządem, do których z podwórka da się dojść bez wychodzenia za siatkę (siatka, dziury
    i brama zamknięte, mieszkanie zarządu zamknięte), jak dla mieszkańców w symulacji */
function reachable(w: AptWorld): Set<number> {
  const { size, fence, interior: it } = w;
  const out = new Set<number>();
  const aptAt = (t: number) => (it.room[t] >= 0 ? it.rooms[it.room[t]].apt : -1);
  const shut = new Uint8Array(size * size);
  for (const t of fence.tiles) shut[t] = 1;
  for (let y = fence.gate.y; y < fence.gate.y + fence.gate.h; y++)
    for (let x = fence.gate.x; x < fence.gate.x + fence.gate.w; x++) shut[y * size + x] = 1;
  const closed = (t: number) => t < 0 || w.blocked[t] === 1 || shut[t] === 1 || (it.home >= 0 && aptAt(t) === it.home);
  const yard = fence.yard.find((t) => !closed(t));
  if (yard === undefined) return out;
  // zalewanie od podwórka: siatka je zamyka, więc obejmuje tylko podwórko i wnętrze siedziby za nim
  const seen = new Uint8Array(size * size);
  const q = [yard];
  seen[yard] = 1;
  for (let k = 0; k < q.length; k++) {
    const a = aptAt(q[k]);
    if (a >= 0 && a !== it.home) out.add(a);
    for (const n of near4(size, q[k]))
      if (n >= 0 && !seen[n] && !closed(n)) {
        seen[n] = 1;
        q.push(n);
      }
  }
  return out;
}

/** ziarno mieszkania: zmiana stanu jednego mieszkania nie przestawia zawartości innych */
const aptRng = (seed: number, bid: number, apt: number, salt: number) =>
  mulberry(((seed * 6151) ^ (bid * 92821) ^ (apt * 15485863) ^ salt) >>> 0);

function shuffle<T>(a: T[], rnd: Rng): void {
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
}

function near4(size: number, t: number): number[] {
  const x = t % size;
  return [
    t >= size ? t - size : -1,
    x < size - 1 ? t + 1 : -1,
    t < size * (size - 1) ? t + size : -1,
    x > 0 ? t - 1 : -1,
  ];
}

const cheb = (size: number, a: number, b: number) =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
