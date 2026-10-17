/* Zapis gry w przeglądarce (localStorage): dane osiedla, z których świat odtwarza się deterministycznie,
   ziarno, stan symulacji, stan zarządu i czas przy ekranie. Jeden zapis na przeglądarkę. */

import { hashString } from '../core/rng.ts';
import type { GovState } from '../gov/typy.ts';
import { clockOf, dayOf } from '../sim/clock.ts';
import type { SimState } from '../sim/sim.ts';
import type { Loaded } from '../world/load.ts';
import type { World } from '../world/world.ts';

export const SAVE_KEY = 'za-murem-0.4-zapis';
export const SAVE_VERSION = 1;

export interface Save {
  v: 1;
  /** chwila zapisu (ms od 1970) */
  at: number;
  data: Loaded;
  seed: number;
  sim: SimState;
  gov: GovState;
  /** sekundy przy ekranie bez pauzy */
  screen: number;
  cam?: { x: number; y: number; zoom: number };
  /** odcisk świata (worldKey): po zmianie generatora stary stan nie pasuje do nowego wnętrza */
  world?: string;
}

/** odcisk świata z danych osiedla: inna wersja generatora daje inny odcisk */
export function worldKey(
  w: Pick<World, 'size' | 'hq' | 'buildings' | 'trees' | 'dryTree'> & {
    fence?: { tiles: number[] };
    interior?: { rooms: unknown[]; furniture: unknown[] } | null;
  },
): string {
  return hashString(
    JSON.stringify([
      w.size,
      w.hq,
      w.buildings.length,
      w.trees.length,
      w.dryTree,
      w.fence?.tiles.length ?? 0,
      w.interior?.rooms.length ?? 0,
      w.interior?.furniture.length ?? 0,
    ]),
  );
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** zapis; false, gdy przeglądarka nie pozwala (tryb prywatny, brak miejsca) */
export function writeSave(s: Save, to: Store | null = store()): boolean {
  if (!to) return false;
  try {
    to.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    console.warn('zapis gry', e);
    return false;
  }
}

/** zapis albo null, gdy go nie ma albo jest z innej wersji */
export function readSave(from: Store | null = store()): Save | null {
  try {
    const raw = from?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    if (s.v !== SAVE_VERSION || s.sim?.v !== 2 || s.gov?.v !== 1 || !s.data?.geo) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSave(from: Store | null = store()): void {
  try {
    from?.removeItem(SAVE_KEY);
  } catch {
    // nic: bez dostępu do pamięci nie ma też zapisu
  }
}

/** „Przymorze, dzień 2, 06:40” na przycisk ekranu startowego */
export const saveLabel = (s: Save): string => `${s.data.name}, dzień ${dayOf(s.sim.tick)}, ${clockOf(s.sim.tick)}`;
