/* Pozy pionków z pracy w symulacji (pawn.job: t, phase) i z rąk (carry): rąbanie i rozbieranie mebla
   siekierą, niesienie naręcza drewna, klęczenie przy kozie (grzanie rąk, dokładanie drewna),
   gotowanie, siedzenie na krześle przy stole, sen w łóżku pod kocem albo na podłodze, warta z lampą
   (praca 'guard' przy bramie albo dziurze) i czuwanie przy kozie (guard na posterunku KOZA_POST). Klatki liczone z czasu gry, bez stanu w symulacji.
   Dokładanie do kozy trwa w symulacji jeden tick, więc widok pamięta je chwilę (FeedWatch).
   Czyste funkcje bez PixiJS. */

import { FRAMES, type Lie, lieHead, type Pose } from './art/people.ts';
import type { ThingLike } from './section.ts';

/** to, czego poza potrzebuje z pionka (Pawn z symulacji pasuje bez zmian) */
export interface PawnLike {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** 0 dół, 1 góra, 2 lewo, 3 prawo */
  dir: number;
  walk: number;
  pi: number;
  path: { length: number };
  carry: number;
  job: { t: string; phase: number; target: number } | null;
}

export type ThingWithId = ThingLike & { id?: number };

export interface PoseView {
  pose: Pose;
  dir: number;
  frame: number;
  /** leży: w łóżku albo na podłodze, o to strona głowy, (x, y) punkt głowy w pikselach świata */
  lie?: { kind: Lie; o: number; x: number; y: number };
  /** kolejność rysowania, gdy inna niż y pionka (po łóżku, przed albo po krześle) */
  z?: number;
}

const TILE = 32;
const BEDS = new Set(['lozko', 'wersalka']);
/** wierzch materaca łóżka i siedziska wersalki w pikselach ekranu (lozko, wersalka w rzeczy.ts) */
const MATTRESS = 9;
/** posterunek warty przy kozie zarządu (KOZA_POST w sim.ts): czuwa przy ogniu, bez latarni */
export const KOZA_POST = -1;
/** cykl czuwania przy kozie (s gry): tyle klęczy przy ogniu, resztę stoi */
const VIGIL = 19;
const VIGIL_KNEEL = 14;
/** ułożenie śpiącego na podłodze według kierunku: głową w górę, w górę, w lewo, w prawo */
const FLOOR_O = [0, 0, 3, 1] as const;

/** punkt poduszki śpiącego (piksele świata) i strona głowy: łóżko głową do ściany rot, wersalka wzdłuż */
export function bedHead(bed: ThingLike): { x: number; y: number; o: number } {
  const rot = bed.rot & 3;
  const sofa = bed.kind === 'wersalka';
  // model łóżka 32 × 64 z poduszką w (16, 10), wersalki 64 × 32 z głową w (11, 18); obrót jak place() w bryly.ts
  const [W, D, mx, my] = sofa ? [64, 32, 11, 18] : [32, 64, 16, 10];
  const [X, Y] = rot === 1 ? [D - my, mx] : rot === 2 ? [W - mx, D - my] : rot === 3 ? [my, W - mx] : [mx, my];
  return { x: bed.x * TILE + X, y: bed.y * TILE + Y - MATTRESS, o: sofa ? (rot + 3) % 4 : rot };
}

const covers = (t: ThingLike, x: number, y: number) =>
  Math.floor(x) >= t.x && Math.floor(x) < t.x + t.w && Math.floor(y) >= t.y && Math.floor(y) < t.y + t.h;

/**
 * Poza pionka w chwili t (sekundy gry). feeding: właśnie dokłada do kozy (FeedWatch). Praca w fazie 1
 * (na miejscu) daje pozę pracy, drewno w rękach naręcze w chodzie, reszta to zwykły chód.
 */
export function poseOf(p: PawnLike, t: number, things: readonly ThingWithId[], feeding = false): PoseView {
  const moving = p.pi < p.path.length;
  const step = moving ? Math.floor(p.walk * 2.6) % FRAMES : 0;
  const dir = p.dir & 3;
  // pionki nie pracują w takt
  const tt = t + (p.id % 7) * 0.13;
  const j = p.job;
  if (!moving && feeding) return { pose: 'crouch', dir, frame: 1 + (Math.floor(tt * 2.5) % 2) };
  if (!moving && j && j.phase === 1)
    switch (j.t) {
      case 'chop':
      case 'burn':
        return { pose: 'chop', dir, frame: [0, 0, 1, 2][Math.floor(tt * 5) % 4] };
      case 'warm':
        return { pose: 'crouch', dir, frame: 0 };
      case 'cook':
        return { pose: 'cook', dir, frame: Math.floor(tt * 2) % 2 };
      case 'guard': {
        if (j.target !== KOZA_POST) return { pose: 'guard', dir, frame: Math.floor(tt) % 2 };
        // czuwanie przy kozie: na krześle siedzi, bez krzesła klęczy przy ogniu i co jakiś czas wstaje
        const chair = things.find((c) => c.kind === 'krzeslo' && covers(c, p.x, p.y));
        if (chair) return { pose: 'sit', dir, frame: 0, z: chair.y + chair.h + (dir === 1 ? -0.01 : 0.01) };
        return (tt + p.id * 3.7) % VIGIL < VIGIL_KNEEL
          ? { pose: 'crouch', dir, frame: 0 }
          : { pose: 'walk', dir, frame: 0 };
      }
      case 'eat': {
        // na krześle siedzi; plecami do patrzącego za oparciem (krzesło rysuje się po nim)
        const chair = things.find((c) => c.kind === 'krzeslo' && covers(c, p.x, p.y));
        if (chair) return { pose: 'sit', dir, frame: 0, z: chair.y + chair.h + (dir === 1 ? -0.01 : 0.01) };
        break;
      }
      case 'sleep': {
        const bed = things.find((b) => b.id === j.target && BEDS.has(b.kind));
        if (bed) {
          const h = bedHead(bed);
          return { pose: 'walk', dir, frame: 0, lie: { kind: 'bed', ...h }, z: bed.y + bed.h + 0.02 };
        }
        const o = FLOOR_O[dir];
        const [hx, hy] = lieHead(o);
        return {
          pose: 'walk',
          dir,
          frame: 0,
          lie: { kind: 'floor', o, x: p.x * TILE + hx - 24, y: p.y * TILE + hy - 26 },
          z: p.y,
        };
      }
    }
  if (p.carry > 0) return { pose: 'carry', dir, frame: step };
  return { pose: 'walk', dir, frame: step };
}

/** jak długo widać dokładanie do kozy po wrzuceniu drewna: 2 s gry (20 ticków na sekundę) */
export const FEED_TICKS = 40;

/**
 * Dokładanie do kozy: w symulacji drewno z rąk trafia do kozy w jednym ticku (koniec pracy refuel albo
 * powrót czuwającego na posterunek). Widok zauważa spadek drewna w rękach po drodze z drewnem do kozy
 * (refuel w fazie 1, guard w fazie 3) i pokazuje klęczenie z polanem przez FEED_TICKS, dopóki pionek
 * stoi w miejscu.
 */
export class FeedWatch {
  private last = new Map<number, { carry: number; refuel: boolean }>();
  private until = new Map<number, { tick: number; x: number; y: number }>();

  feeding(p: PawnLike, tick: number): boolean {
    const prev = this.last.get(p.id);
    // drewno do kozy niesie praca refuel (faza 1) albo czuwający przy kozie (guard, faza 3)
    const refuel =
      !!p.job && ((p.job.t === 'refuel' && p.job.phase === 1) || (p.job.t === 'guard' && p.job.phase === 3));
    if (prev?.refuel && p.carry < prev.carry) this.until.set(p.id, { tick: tick + FEED_TICKS, x: p.x, y: p.y });
    this.last.set(p.id, { carry: p.carry, refuel });
    const f = this.until.get(p.id);
    if (!f) return false;
    if (tick >= f.tick || Math.hypot(p.x - f.x, p.y - f.y) > 0.3) {
      this.until.delete(p.id);
      return false;
    }
    return true;
  }

  forget(id: number): void {
    this.last.delete(id);
    this.until.delete(id);
  }
}
