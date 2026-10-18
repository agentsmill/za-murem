/* Wspólny płot (M2 fala 2, etap 3, docs/M2-fala-2.md): nowy kształt siatki, który obejmuje sąsiedni budynek razem
   z naszym podwórkiem. Czysta funkcja świata i obecnej siatki: podwórko rośnie o korytarz wolnych kafelków od
   podwórka do drzwi budynku (najkrótsza droga, poszerzona o metr z każdej strony), a siatka staje na wolnych kafelkach
   tuż za nowym podwórkiem tak jak w buildFence: bokiem zamyka obwód, po skosie domyka rogi. Korytarz nie wchodzi na
   jezdnię ani na chodnik przy ulicy (z kafelkami tuż przy nich) i nie przechodzi przez bramę, więc brama zostaje.
   Odcinki starej siatki, przez które przeszedł korytarz, znikają, a stare dziury zostają, jeśli dalej są na obwodzie.
   Drzwi budynku, do których korytarz nie sięga (inne niż najbliższe, do 25 m dalej), zostają na obwodzie i trzeba je
   zabić deskami, bo inaczej przez wnętrze byłaby droga z ulicy na podwórko. Gdy do drzwi nie da się dojść bez jezdni
   albo nowego płotu byłoby więcej niż PLOT_MAX metrów, wynik mówi dlaczego. Deterministycznie, bez losowania. */

import { labelRegions } from '../sim/path.ts';
import { type Fence, yardEdges } from './fence.ts';
import { T } from './terrain.ts';
import type { World } from './world.ts';

/** najwięcej nowego płotu w metrach */
export const PLOT_MAX = 120;
/** inne drzwi budynku dołącza się do podwórka, gdy dojście do nich jest najwyżej tyle kafelków */
const DRUGIE_DRZWI = 25;

export type PlotWorld = Pick<World, 'size' | 'terr' | 'bid' | 'blocked'>;

export interface PlotDrzwi {
  /** kafelek drzwi (należy do budynku) i wolny kafelek przed nimi */
  tile: number;
  out: number;
}

export type PlotWynik =
  | {
      ok: true;
      /** nowa siatka (kafelki rosnąco, stare dziury na obwodzie, ta sama brama, nowe podwórko) */
      fence: Fence;
      /** kafelki nowego płotu (nie było ich w starej siatce) i starej siatki, które znikają w środku */
      nowe: number[];
      usuniete: number[];
      /** drzwi budynku zostające na obwodzie: do zabicia deskami */
      zabic: number[];
      /** metry nowego płotu */
      dlugosc: number;
    }
  | { ok: false; why: 'jezdnia' | 'dlugi' | 'brak'; dlugosc?: number };

/** Nowy kształt siatki z sąsiednim budynkiem w środku (drzwi: jego drzwi na zewnątrz; unikaj: kafelki, których
    korytarz nie rusza, np. zasieki na siatce). */
export function wspolnyPlot(
  w: PlotWorld,
  f: Fence,
  drzwi: readonly PlotDrzwi[],
  unikaj: ReadonlySet<number> = new Set(),
): PlotWynik {
  const { size, terr, bid, blocked } = w;
  const N = size * size;
  if (!f.tiles.length || !drzwi.length) return { ok: false, why: 'brak' };
  const xy = (i: number): [number, number] => [i % size, Math.floor(i / size)];
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1);
  const near4 = (i: number) => {
    const [x, y] = xy(i);
    return [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
  };
  const around = (i: number) => {
    const [x, y] = xy(i);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push(at(x + dx, y + dy));
    return out;
  };
  const fenceSet = new Set(f.tiles);
  const gate = new Set<number>();
  for (let y = f.gate.y; y < f.gate.y + f.gate.h; y++)
    for (let x = f.gate.x; x < f.gate.x + f.gate.w; x++) if (f.gate.w > 0) gate.add(y * size + x);
  const { roadSide, streetSide } = yardEdges(size, terr);
  /** wolny kafelek bez budynku: także stara siatka, ale nie brama (pierścień siatki) */
  const free1 = (i: number) => i >= 0 && bid[i] < 0 && (!blocked[i] || fenceSet.has(i)) && !gate.has(i);
  /** korytarz: jak wyżej, bez kafelków do ominięcia (zasieki zostają na siatce) */
  const free0 = (i: number) => free1(i) && !unikaj.has(i);
  const allowed = (i: number) => free0(i) && !roadSide(i) && !streetSide(i);
  const Y = new Uint8Array(N);
  for (const t of f.yard) Y[t] = 1;
  const yardList = [...f.yard];

  /** najkrótsza droga od podwórka do któregoś z celów (BFS po dozwolonych kafelkach), najwyżej limit kroków */
  const path = (cele: Set<number>, ok: (i: number) => boolean, limit: number): number[] | null => {
    const prev = new Int32Array(N).fill(-2);
    let layer: number[] = [];
    for (const t of yardList) {
      prev[t] = -1;
      layer.push(t);
    }
    for (let d = 0; d < limit && layer.length; d++) {
      const next: number[] = [];
      for (const c of layer)
        for (const n of near4(c)) {
          if (n < 0 || prev[n] !== -2 || !ok(n)) continue;
          prev[n] = c;
          if (cele.has(n)) {
            const out: number[] = [];
            for (let k = n; k >= 0 && !Y[k]; k = prev[k]) out.push(k);
            return out;
          }
          next.push(n);
        }
      layer = next;
    }
    return null;
  };
  const dodaj = (p: number[]) => {
    // korytarz: droga poszerzona o metr na boki (tylko dozwolone kafelki)
    const add = new Set<number>(p);
    for (const t of p) for (const n of around(t)) if (allowed(n)) add.add(n);
    for (const t of add)
      if (!Y[t]) {
        Y[t] = 1;
        yardList.push(t);
      }
  };

  const outs = new Map(drzwi.map((d) => [d.out, d.tile]));
  const covered = () => drzwi.filter((d) => Y[d.out]);
  if (!covered().length) {
    const p = path(new Set(outs.keys()), allowed, 400);
    if (!p) return { ok: false, why: path(new Set(outs.keys()), free0, 400) ? 'jezdnia' : 'brak' };
    dodaj(p);
  }
  // pozostałe drzwi: dołączone, gdy blisko, inaczej do zabicia
  for (const d of drzwi) {
    if (Y[d.out] || !allowed(d.out)) continue;
    const p = path(new Set([d.out]), allowed, DRUGIE_DRZWI);
    if (p) dodaj(p);
  }

  // siatka: bokiem zamyka obwód, po skosie domyka róg (jak w buildFence)
  const F = new Uint8Array(N);
  const walk = (i: number) => i >= 0 && terr[i] === T.SIDEWALK;
  for (const t of yardList)
    for (const n of around(t)) {
      if (n < 0 || Y[n] || !free1(n)) continue;
      const [tx, ty] = xy(t);
      const [nx, ny] = xy(n);
      if (tx === nx || ty === ny) F[n] = 1;
      else if (!F[n] && terr[n] !== T.ROAD && !walk(n) && !outs.has(n)) F[n] = 2;
    }
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) if (F[i]) tiles.push(i);
  const nowe = tiles.filter((t) => !fenceSet.has(t));
  const usuniete = f.tiles.filter((t) => !F[t]);
  if (nowe.length > PLOT_MAX) return { ok: false, why: 'dlugi', dlugosc: nowe.length };

  // szczelność: z nową siatką, bramą i zabitymi drzwiami podwórko nie łączy się z resztą mapy
  const zabic = drzwi.filter((d) => !Y[d.out]).map((d) => d.tile);
  const closed = blocked.slice();
  for (const t of usuniete) closed[t] = 0;
  for (const t of tiles) closed[t] = 1;
  for (const t of gate) closed[t] = 1;
  const reg = labelRegions(closed, size);
  const inner = reg[f.yard[0]];
  // obszar podwórka (z wnętrzem siedziby, które w blocked jest przechodnie) nie może sięgać brzegu mapy
  for (let k = 0; k < size; k++)
    for (const i of [k, (size - 1) * size + k, k * size, k * size + size - 1])
      if (!closed[i] && reg[i] === inner) return { ok: false, why: 'brak' };

  const yard = yardList.slice().sort((p, q) => p - q);
  return {
    ok: true,
    fence: { tiles, hole: f.hole.filter((t) => F[t]), gate: f.gate, yard },
    nowe,
    usuniete,
    zabic: zabic.sort((p, q) => p - q),
    dlugosc: nowe.length,
  };
}
