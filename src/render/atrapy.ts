/* Atrapa pustych mieszkań do podglądu (?mieszkania=atrapa): zamiast World.apts, World.damage, śmieci
   w World.props i Furniture.broken ze świata (kontrakt M2, src/world/apts.ts) oraz śmieci i zepsuć
   ze stanu gry, także gdy świat i symulacja już je dają, żeby scenariusze pokazywały każdy wygląd
   niezależnie od losowania świata. Mieszkanie
   z kozą zarządu jest zarządu, pozostałe na przemian zamieszkane i puste z kolejnymi przyczynami,
   a puste dostają uszkodzenia, śmieci i zepsute meble według przyczyny. Miejsca uszkodzeń jak
   w świecie (piec na kafelku kuchenki, rura przy ścianie łazienki albo kuchni), ale tak, żeby było
   widać każdy wygląd: zwęgloną podłogę po pożarze, kałuże po zalaniu, wyrwane deski po wyjeździe.
   Deterministycznie. */

import type { AptState, AptWhy, Damage } from '../world/apts.ts';
import { IN } from '../world/interior.ts';
import type { World } from '../world/world.ts';
import type { ThingLike } from './section.ts';

const WHYS: readonly AptWhy[] = ['splądrowanie', 'pozar', 'zalanie', 'wymarcie', 'wyjazd'];

export interface WearMock {
  apts: AptState[];
  damage: Damage[];
  /** sterty śmieci jak w World.props: { kind: 'smieci', x, y, w: 1, h: 1, n }, n to wielkość 1–3 */
  trash: ThingLike[];
  /** zepsute meble po miejscu "x,y" */
  broken: Set<string>;
}

export function mockWear(w: Pick<World, 'size' | 'interior'>): WearMock {
  const int = w.interior;
  const size = w.size;
  const bid = int.building;
  const tilesOf = new Map<number, number[]>();
  for (let i = 0; i < size * size; i++) {
    const r = int.room[i];
    if (r < 0) continue;
    const apt = int.rooms[r]?.apt ?? -1;
    if (apt < 0) continue;
    let l = tilesOf.get(apt);
    if (!l) tilesOf.set(apt, (l = []));
    l.push(i);
  }
  const koza = int.furniture.find((f) => f.kind === 'koza');
  const home = koza ? (int.rooms[int.room[koza.y * size + koza.x]]?.apt ?? -1) : -1;
  const taken = new Set<number>();
  for (const f of int.furniture)
    for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) taken.add((f.y + dy) * size + f.x + dx);
  const free = (i: number) => int.cell[i] === IN.FLOOR && !taken.has(i);
  const near = (i: number, ok: (j: number) => boolean) =>
    [i - size, i + 1, i + size, i - 1].some((j) => j >= 0 && j < size * size && ok(j));
  const apts: AptState[] = [];
  const damage: Damage[] = [];
  const trash: ThingLike[] = [];
  const broken = new Set<string>();
  let k = 0;
  const apartments = [...tilesOf.keys()].sort((a, b) => a - b);
  for (const apt of apartments) {
    if (apt === home) {
      apts.push({ bid, apt, state: 'zarzad' });
      continue;
    }
    if (k++ % 2 === 1) {
      apts.push({ bid, apt, state: 'mieszkancy' });
      continue;
    }
    const why = WHYS[Math.floor(k / 2) % WHYS.length];
    apts.push({ bid, apt, state: 'puste', why, year: 2026 + ((apt * 7) % 25) });
    const tiles = tilesOf.get(apt)!;
    const floor = tiles.filter(free);
    const roomKind = (i: number) => int.rooms[int.room[i]]?.kind;
    const mine = new Set(tiles);
    if (why === 'splądrowanie') {
      // wyważone drzwi wejściowe: drzwi przy pomieszczeniu mieszkania i przy klatce
      for (const i of tiles)
        for (const d of [i - size, i + 1, i + size, i - 1])
          if (int.cell[d] === IN.DOOR && near(d, (j) => int.room[j] >= 0 && (int.rooms[int.room[j]]?.apt ?? -1) < 0)) {
            if (!damage.some((x) => x.tile === d)) damage.push({ kind: 'drzwi', tile: d, bid, apt });
          }
    }
    if (why === 'pozar') {
      const win = int.windows.find((wi) => near(wi, (j) => mine.has(j)));
      if (win !== undefined) damage.push({ kind: 'okno', tile: win, bid, apt });
      // okopcony piec na kafelku kuchenki, jak w świecie
      const stove = int.furniture.find((f) => f.kind === 'kuchenka' && mine.has(f.y * size + f.x));
      if (stove) damage.push({ kind: 'piec', tile: stove.y * size + stove.x, bid, apt });
      const burnt = floor.find((i) => roomKind(i) === 'pokoj');
      if (burnt !== undefined) damage.push({ kind: 'podloga', tile: burnt, bid, apt });
    }
    if (why === 'wyjazd') {
      const hole = floor.find((i) => roomKind(i) === 'pokoj') ?? floor[0];
      if (hole !== undefined) damage.push({ kind: 'podloga', tile: hole, bid, apt });
    }
    if (why === 'zalanie') {
      const wet = floor.filter((i) => roomKind(i) === 'lazienka' || roomKind(i) === 'kuchnia');
      const pipe = wet.find((i) => near(i, (j) => int.cell[j] === IN.WALL)) ?? floor[0];
      if (pipe !== undefined) damage.push({ kind: 'rura', tile: pipe, bid, apt });
      for (const i of floor.filter((x) => x !== pipe).slice(0, 3)) damage.push({ kind: 'podloga', tile: i, bid, apt });
    }
    if (why === 'splądrowanie' || why === 'pozar' || why === 'zalanie') {
      // zepsuta mniej więcej co druga rzecz w mieszkaniu
      int.furniture.forEach((f, n) => {
        if (mine.has(f.y * size + f.x) && n % 2 === 0) broken.add(`${f.x},${f.y}`);
      });
    }
    if (why === 'splądrowanie' || why === 'pozar') {
      const spots = floor.filter((i) => !damage.some((d) => d.tile === i));
      for (let t = 0; t < Math.min(3, spots.length); t++) {
        const i = spots[Math.floor(((t + 1) * spots.length) / 4) % spots.length];
        trash.push({ kind: 'smieci', x: i % size, y: Math.floor(i / size), w: 1, h: 1, rot: 0, n: 1 + ((i + t) % 3) });
      }
    }
  }
  return { apts, damage, trash, broken };
}
