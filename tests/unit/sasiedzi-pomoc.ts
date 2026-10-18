/* Pomocniki testów sąsiednich budynków (fala 2): światy dem, nowa gra, kroki do warunku, drzwi spełniające warunek
   na start (od budynków najbliżej siedziby), lokatorzy podawani przez test (Sim.lokatorzy). */

import fs from 'node:fs';
import path from 'node:path';
import { hashString } from '../../src/core/rng.ts';
import { drzwiBudynku, drzwiZewnNaStart, type LokatorzyBudynku, wnetrze } from '../../src/sim/sasiedzi.ts';
import { createSim, type Pawn, Sim } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const worlds = new Map<string, World>();

/** świat demo z ziarnem z adresu, jak w grze (jeden na plik testów) */
export function demoWorld(key: string): World {
  let w = worlds.get(key);
  if (!w) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    w = buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
    worlds.set(key, w);
  }
  return w;
}

/** nowa gra na demie (4 osoby zarządu) */
export function newGame(key: string, mode: GameMode = 'zwykly', seed = 5): Sim {
  const w = demoWorld(key);
  return new Sim(w, createSim(w, seed, { core: 4, mode }));
}

export const core = (sim: Sim): Pawn[] => sim.st.pawns.filter((p) => p.kind === 'core');

/** kroki symulacji, aż warunek będzie spełniony (najwyżej limit); zwraca liczbę kroków */
export function until(sim: Sim, cond: () => boolean, limit = 6000): number {
  let n = 0;
  while (!cond() && n < limit) {
    sim.step();
    n++;
  }
  return n;
}

/** pierwsze wejście budynku (od najbliższych siedzibie) danego rodzaju, którego stan na start spełnia warunek */
export function doorWhere(
  w: World,
  mode: GameMode,
  ok: (s: ReturnType<typeof drzwiZewnNaStart>, bid: number) => boolean,
  cls: readonly string[] = ['blok', 'dom'],
): { bid: number; door: number; out: number } {
  const size = w.size;
  const hq = w.buildings[w.hq].entrances[0].out;
  const d2 = (t: number) => ((t % size) - (hq % size)) ** 2 + (Math.floor(t / size) - Math.floor(hq / size)) ** 2;
  const list = w.buildings
    .filter((b) => b.id !== w.hq && b.entrances.length && cls.includes(b.cls))
    .sort((a, b) => d2(a.entrances[0].out) - d2(b.entrances[0].out));
  for (const b of list)
    for (const d of drzwiBudynku(w, b.id).zewn)
      if (d.wejscie >= 0 && ok(drzwiZewnNaStart(w, mode, b.id, d.tile), b.id))
        return { bid: b.id, door: d.tile, out: d.out };
  throw new Error('nie ma takich drzwi');
}

/** lokatorzy: wszystkie mieszkania budynku puste */
export const pusto =
  (w: World) =>
  (bid: number): LokatorzyBudynku => ({
    stany: [...Array(Math.max(0, ...wnetrze(w, bid).rooms.map((r) => r.apt + 1))).keys()].map((apt) => ({
      bid,
      apt,
      state: 'puste' as const,
    })),
    domy: [],
  });
