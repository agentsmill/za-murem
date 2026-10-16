/* Symulacja (prototyp M1): pionki rdzenia sterowane poleceniami i tłum z prostym planem.
   Stały krok, ziarno w stanie, polecenia z kolejki. Stan to zwykły obiekt (JSON),
   rysowanie tylko go czyta. Ten sam świat, ziarno i polecenia dają ten sam stan. */

import { PROFS } from '../content/data.ts';
import { makePerson, type Person } from '../content/people.ts';
import { hashString, nextRandom, pick, type RngState, rngOf } from '../core/rng.ts';
import type { World } from '../world/world.ts';
import { TICKS_PER_SECOND } from './clock.ts';
import { nearestFree, PathFinder } from './path.ts';

/** kafelków na tick: 4 kafelki na sekundę przy 1× */
export const WALK_SPEED = 4 / TICKS_PER_SECOND;
/** najwyżej tyle wyszukiwań ścieżek tłumu na jeden krok symulacji */
export const PATHS_PER_TICK = 4;

export type Facing = 0 | 1 | 2 | 3; // dół, góra, lewo, prawo

export interface Pawn {
  id: number;
  kind: 'core' | 'crowd';
  /** osoba z rdzenia (indeks w state.people) albo −1 */
  person: number;
  look: number;
  x: number;
  y: number;
  path: number[];
  pi: number;
  dir: Facing;
  walk: number;
  /** tick, do którego stoi */
  wait: number;
  /** kafelek, wokół którego się kręci (wejście do klatki) */
  home: number;
  /** cel, do którego trzeba wyznaczyć drogę (−1: brak) */
  want: number;
}

export interface SimState {
  v: 1;
  seed: number;
  tick: number;
  rng: RngState;
  people: Person[];
  pawns: Pawn[];
  /** licznik identyfikatorów osób (jak S.nextId w 0.3) */
  nextId: number;
  /** licznik identyfikatorów pionków */
  nextPawn: number;
  /** statystyki do pomiarów */
  stats: { paths: number; failed: number; nodes: number };
}

export type Command = { t: 'move'; ids: number[]; to: number };

export interface SimOpts {
  core?: number;
  crowd?: number;
}

/** wolne kafelki przed wejściami do budynków mieszkalnych, najbliżej siedziby najpierw */
function homeTiles(w: World): number[] {
  const hq = w.buildings[w.hq];
  const hx = (hq.x0 + hq.x1) / 2;
  const hy = (hq.y0 + hq.y1) / 2;
  return w.buildings
    .filter((b) => b.cls === 'blok' || b.cls === 'dom')
    .map((b) => ({ b, d: Math.hypot((b.x0 + b.x1) / 2 - hx, (b.y0 + b.y1) / 2 - hy) }))
    .sort((p, q) => p.d - q.d || p.b.id - q.b.id)
    .flatMap(({ b }) => b.entrances.map((e) => e.out));
}

export function createSim(w: World, seed: number, opts: SimOpts = {}): SimState {
  const st: SimState = {
    v: 1,
    seed,
    tick: 0,
    rng: { s: seed | 0 },
    people: [],
    pawns: [],
    nextId: 1,
    nextPawn: 1,
    stats: { paths: 0, failed: 0, nodes: 0 },
  };
  const rnd = rngOf(st.rng);
  const hq = w.buildings[w.hq];
  const door = hq.entrances[0]?.out ?? nearestFree(w.blocked, w.size, ((hq.y1 + 1) * w.size + hq.x0) | 0);
  // rdzeń: zarząd z fachem w podstawowych dziedzinach, jak na starcie 0.3
  const need = ['cieplo', 'bud', 'med', 'uprawa'] as const;
  const core = opts.core ?? 4;
  for (let k = 0; k < core; k++) {
    const d = need[k % need.length];
    const profs = PROFS.filter((p) => (p[2][d] || 0) >= 1 && (p[2][d] || 0) <= 3);
    const p = makePerson(rnd, new Set(st.people.map((q) => q.first)), () => st.nextId++, {
      prof: pick(profs, rnd),
      home: w.hq,
    });
    st.people.push(p);
    const at = spawnNear(w, door, k, rnd);
    st.pawns.push(newPawn(st, w, 'core', st.people.length - 1, at, door, k));
  }
  const homes = homeTiles(w);
  const crowd = opts.crowd ?? 0;
  for (let k = 0; k < crowd; k++) {
    const home = homes.length ? homes[k % Math.min(homes.length, 24)] : door;
    const at = spawnNear(w, home, k, rnd);
    const p = newPawn(st, w, 'crowd', -1, at, home, 4 + Math.floor(rnd() * 12));
    p.wait = Math.floor(rnd() * 200);
    st.pawns.push(p);
  }
  return st;
}

function spawnNear(w: World, i: number, k: number, rnd: () => number): number {
  const size = w.size;
  const x = (i % size) + Math.round((rnd() - 0.5) * 6) + (k % 3) - 1;
  const y = Math.floor(i / size) + Math.round((rnd() - 0.5) * 4);
  const cx = Math.max(0, Math.min(size - 1, x));
  const cy = Math.max(0, Math.min(size - 1, y));
  return nearestFree(w.blocked, size, cy * size + cx);
}

function newPawn(
  st: SimState,
  w: World,
  kind: Pawn['kind'],
  person: number,
  at: number,
  home: number,
  look: number,
): Pawn {
  return {
    id: st.nextPawn++,
    kind,
    person,
    look,
    x: (at % w.size) + 0.5,
    y: Math.floor(at / w.size) + 0.5,
    path: [],
    pi: 0,
    dir: 0,
    walk: 0,
    wait: 0,
    home,
    want: -1,
  };
}

/** Sim trzyma PathFinder poza stanem (to tylko bufor roboczy). */
export class Sim {
  readonly w: World;
  st: SimState;
  private pf: PathFinder;
  private queue: Command[] = [];

  constructor(w: World, st: SimState) {
    this.w = w;
    this.st = st;
    this.pf = new PathFinder(w.size);
  }

  push(c: Command): void {
    this.queue.push(c);
  }

  tileOf(p: Pawn): number {
    return Math.floor(p.y) * this.w.size + Math.floor(p.x);
  }

  private route(p: Pawn, goal: number): boolean {
    const w = this.w;
    const g = nearestFree(w.blocked, w.size, goal);
    const s = nearestFree(w.blocked, w.size, this.tileOf(p));
    const path = this.pf.find(w.blocked, s, g);
    this.st.stats.paths++;
    this.st.stats.nodes += this.pf.expanded;
    if (!path) {
      this.st.stats.failed++;
      return false;
    }
    p.path = path;
    p.pi = 0;
    return true;
  }

  /** jeden krok symulacji */
  step(): void {
    const st = this.st;
    const w = this.w;
    const size = w.size;
    const rnd = () => nextRandom(st.rng);
    for (const c of this.queue.splice(0)) {
      if (c.t === 'move') {
        c.ids.forEach((id, k) => {
          const p = st.pawns.find((q) => q.id === id);
          if (!p) return;
          // kilka osób naraz: rozstawione obok siebie
          const off = k === 0 ? 0 : (k % 3) - 1 + Math.floor(k / 3) * size;
          if (this.route(p, Math.max(0, Math.min(size * size - 1, c.to + off)))) p.want = -1;
        });
      }
    }
    let budget = PATHS_PER_TICK;
    for (const p of st.pawns) {
      if (p.pi < p.path.length) {
        this.walk(p);
        continue;
      }
      if (p.kind !== 'crowd' || st.tick < p.wait) continue;
      if (p.want < 0) {
        // tłum: spacer w promieniu 28 m od swojej klatki
        const hx = p.home % size;
        const hy = Math.floor(p.home / size);
        const tx = Math.max(0, Math.min(size - 1, hx + Math.round((rnd() - 0.5) * 56)));
        const ty = Math.max(0, Math.min(size - 1, hy + Math.round((rnd() - 0.5) * 56)));
        p.want = ty * size + tx;
      }
      if (budget <= 0) continue;
      budget--;
      this.route(p, p.want);
      p.want = -1;
      p.wait = st.tick + 60 + Math.floor(rnd() * 240);
    }
    st.tick++;
  }

  private walk(p: Pawn): void {
    const size = this.w.size;
    let left = WALK_SPEED;
    while (left > 1e-9 && p.pi < p.path.length) {
      const t = p.path[p.pi];
      const tx = (t % size) + 0.5;
      const ty = Math.floor(t / size) + 0.5;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dx) > Math.abs(dy) + 1e-9) p.dir = dx > 0 ? 3 : 2;
      else if (Math.abs(dy) > 1e-9) p.dir = dy > 0 ? 0 : 1;
      if (d <= left) {
        p.x = tx;
        p.y = ty;
        left -= d;
        p.pi++;
      } else {
        p.x += (dx / d) * left;
        p.y += (dy / d) * left;
        left = 0;
      }
    }
    p.walk += WALK_SPEED - left;
    if (p.pi >= p.path.length) {
      p.path = [];
      p.pi = 0;
    }
  }

  hash(): string {
    return hashString(JSON.stringify(this.st));
  }
}
