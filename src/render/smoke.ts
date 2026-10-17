/* Dym z rury palącej się kozy (rura wychodzi przez okno, dym idzie z zewnątrz ściany) i z ogniska.
   Kłęby liczone z czasu gry, bez losowania w stanie: kłąb i rodzi się co EVERY sekund, a z numeru
   (h2) bierze drobne przesunięcia. Wznosi się coraz wolniej, rośnie, znosi go wiatr (wolno zmienny
   z czasem) i rozwiewa. Wysokość w skali brył: 16 px na metr. Czyste funkcje bez PixiJS. */

import type { World } from '../world/world.ts';
import { h2 } from './art/hash.ts';
import type { ThingLike } from './section.ts';

export interface SmokeSource {
  /** stały klucz źródła (rodzaj i miejsce) */
  key: string;
  kind: 'koza' | 'ognisko';
  /** punkt na ziemi pod wylotem (metry) i wysokość wylotu (metry) */
  x: number;
  y: number;
  z: number;
  /** jak mocno ogień podświetla dym od dołu nocą (0..1): ognisko w pełni, koza przez okno słabiej */
  glow: number;
  seed: number;
}

export interface Puff {
  /** środek w pikselach świata */
  x: number;
  y: number;
  /** promień w pikselach */
  r: number;
  /** krycie 0..1 */
  a: number;
  /** podświetlenie od ognia 0..1 (nocą: od dołu, przy wylocie) */
  warm: number;
  /** numer kłębu (do kolejności rysowania) */
  i: number;
}

const TILE = 32;
/** pikseli ekranu na metr wysokości (jak ZPX brył) */
const ZPX = 16;
/** co ile sekund gry nowy kłąb */
export const EVERY = 0.18;
/** ile żyje kłąb (s): z kozy dłużej, z ogniska rozwiewa się szybciej */
export const LIFE: Record<SmokeSource['kind'], number> = { koza: 10, ognisko: 6.5 };
const RISE: Record<SmokeSource['kind'], number> = { koza: 1.4, ognisko: 1.6 };
const R0 = 3;
const R1: Record<SmokeSource['kind'], number> = { koza: 14, ognisko: 16 };

const STEP: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const windowSets = new WeakMap<object, Set<number>>();

/**
 * Źródła dymu z rzeczy: koza z fuel > 0 (wylot rury za oknem w stronę rot, jak rura w rzeczy.ts,
 * a bez okna obok półtora metra za kozą) i ognisko z fuel > 0.
 */
export function smokeSources(things: readonly ThingLike[], w: Pick<World, 'size' | 'interior'>): SmokeSource[] {
  const out: SmokeSource[] = [];
  const size = w.size;
  let windows = windowSets.get(w.interior);
  if (!windows) {
    windows = new Set(w.interior.windows);
    windowSets.set(w.interior, windows);
  }
  for (const t of things) {
    if ((t.fuel ?? 0) <= 0) continue;
    const seed = ((Math.imul(t.x, 73856093) ^ Math.imul(t.y, 19349663)) >>> 0) & 0xffff;
    if (t.kind === 'koza') {
      const [dx, dy] = STEP[t.rot & 3];
      let x = t.x + 0.5 + dx * 1.5;
      let y = t.y + 0.5 + dy * 1.5;
      for (let k = 1; k <= 2; k++) {
        const wx = t.x + dx * k;
        const wy = t.y + dy * k;
        if (wx < 0 || wy < 0 || wx >= size || wy >= size || !windows.has(wy * size + wx)) continue;
        x = wx + 0.5 + dx * 0.85;
        y = wy + 0.5 + dy * 0.85;
        break;
      }
      out.push({ key: `koza:${t.x}:${t.y}`, kind: 'koza', x, y, z: 1.7, glow: 0.45, seed });
    } else if (t.kind === 'ognisko')
      out.push({ key: `ognisko:${t.x}:${t.y}`, kind: 'ognisko', x: t.x + 0.5, y: t.y + 0.6, z: 0.35, glow: 1, seed });
  }
  return out;
}

/** wiatr w metrach na sekundę: słaby, z zachodu, wolno zmienny w czasie gry */
export function windAt(t: number): [number, number] {
  return [0.35 + 0.22 * Math.sin(t / 37) + 0.08 * Math.sin(t / 11 + 2), -0.08 + 0.14 * Math.sin(t / 53 + 1)];
}

/**
 * Kłęby źródła w chwili t (sekundy gry), dopisane do out. off: chwila, w której ogień zgasł (od niej
 * nie rodzą się nowe kłęby, stare dolatują). Te same argumenty dają te same kłęby.
 */
export function puffs(s: SmokeSource, t: number, out: Puff[], off = Number.POSITIVE_INFINITY): Puff[] {
  const life = LIFE[s.kind];
  const rise = RISE[s.kind];
  const [wx, wy] = windAt(t);
  const last = Math.floor(Math.min(t, off) / EVERY);
  for (let i = Math.ceil((t - life) / EVERY) - 1; i <= last; i++) {
    const born = (i + h2(i, s.seed, 71) * 0.5) * EVERY;
    const age = t - born;
    if (age <= 0 || age >= life || born > off) continue;
    const k = age / life;
    // wyżej kolumna rwie się na pojedyncze obłoczki
    if (k > 0.4 && h2(i, s.seed, 74) < (k - 0.4) * 1.1) continue;
    // coraz wolniej w górę, coraz mocniej z wiatrem (przy wylocie dym idzie prosto)
    const h = rise * (age - (age * age) / (2 * life * 1.3));
    const drift = age * (0.25 + 0.75 * Math.min(1, age / 3));
    const wobble = Math.sin(age * 1.6 + h2(i, s.seed, 72) * 6.283) * 0.12 * age;
    out.push({
      x: (s.x + wx * drift + wobble) * TILE,
      y: (s.y + wy * drift) * TILE - (s.z + h) * ZPX,
      r: R0 + (R1[s.kind] - R0) * k ** 0.7 * (0.85 + 0.3 * h2(i, s.seed, 73)),
      a: Math.min(1, age / 0.35) * (1 - k ** 1.6),
      warm: s.glow * Math.max(0, 1 - h / 2.4),
      i,
    });
  }
  return out;
}
