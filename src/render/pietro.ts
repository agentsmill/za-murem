/* Scena typowego piętra (etap 1 widoku pięter, flaga ?pietra=1, docs/superpowers/specs/2026-10-18-pietra-design.md,
   „Co widać na piętrze” i „Piętra z pokojami i ścianami”). Jedna scena na całą mapę ze wszystkich budynków od dwóch
   kondygnacji, ułożona z szablonu parteru (buildInterior bez opcji home, więc bez mieszkania zarządu):
   - drzwi na brzegu obrysu stają się ścianą z oknem (wejścia są tylko na parterze);
   - w budynku innym niż blok i dom (sklep, szkoła, hala) ściany działowe i drzwi we wnętrzu stają się posadzką bez
     pomieszczenia, bo piętro takiego budynku to otwarta przestrzeń; schody i klatka zostają.
   Numery pomieszczeń rosną po budynkach. Czysta funkcja bez DOM, kształt jak SectionScene. */

import { buildInterior, IN, type InteriorWorld, type RoomKind } from '../world/interior.ts';
import type { SectionScene } from './section.ts';

/** brzeg obrysu budynku id: któryś z czterech sąsiadów nie należy do budynku albo kafelek leży na brzegu mapy
    (jak isEdge w src/world/interior.ts) */
function naBrzegu(w: InteriorWorld, i: number, id: number): boolean {
  const { size, bid } = w;
  const x = i % size;
  const y = (i - x) / size;
  if (x === 0 || y === 0 || x === size - 1 || y === size - 1) return true;
  return bid[i - 1] !== id || bid[i + 1] !== id || bid[i - size] !== id || bid[i + size] !== id;
}

/** Scena typowego piętra całej mapy albo null, gdy żaden budynek nie ma dwóch kondygnacji. */
export function sectionPietra(w: InteriorWorld): SectionScene | null {
  const wysokie = w.buildings.filter((b) => b.levels >= 2);
  if (!wysokie.length) return null;
  const { size, bid } = w;
  const cell = new Uint8Array(size * size);
  const room = new Int16Array(size * size).fill(-1);
  const kinds: RoomKind[] = [];
  const windows = new Set<number>();
  const otwarte = new Set<number>();
  for (const b of wysokie) {
    const it = buildInterior(w, b.id);
    const base = kinds.length;
    const mieszkalny = b.cls === 'blok' || b.cls === 'dom';
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * size + x;
        if (bid[i] !== b.id) continue;
        const brzeg = naBrzegu(w, i, b.id);
        let c = it.cell[i];
        let r = it.room[i] >= 0 ? base + it.room[i] : -1;
        if (c === IN.DOOR && brzeg) {
          c = IN.WALL;
          windows.add(i);
        } else if (!mieszkalny && !brzeg && (c === IN.WALL || c === IN.DOOR)) {
          c = IN.FLOOR;
          r = -1;
        }
        cell[i] = c;
        room[i] = r;
      }
    for (const t of it.windows) windows.add(t);
    for (const r of it.rooms) kinds.push(r.kind);
    otwarte.add(b.id);
  }
  return {
    building: -1,
    cell,
    room,
    kinds,
    windows,
    entrances: new Set(),
    lit: new Set(),
    seed: w.seed | 0,
    otwarte,
    pietro: true,
  };
}
