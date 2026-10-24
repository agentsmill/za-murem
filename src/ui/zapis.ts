/* Zapis gry w przeglądarce (localStorage): dane osiedla, z których świat odtwarza się deterministycznie,
   ziarno, stan symulacji, stan zarządu, stan ścieżki celów (`cele`, src/ui/sciezka.ts) i czas przy ekranie. Jeden zapis
   na przeglądarkę. Zapis nie zależy od języka; tylko etykieta wznowienia (`saveLabel`) jest w bieżącym języku.
   Kontrola kształtu w `readSave` jest dwojakiego rodzaju: pole, od którego zależy świat albo przebieg gry (wersje,
   `siec`, `pietra`), przy złym kształcie odrzuca cały zapis, a `cele`, które dotyczy tylko interfejsu, przy złym
   kształcie znika z zapisu i reszta wczytuje się jak zawsze. */

import { L } from '../core/jezyk.ts';
import { hashString } from '../core/rng.ts';
import type { GovState } from '../gov/typy.ts';
import { clockOf, dayOf } from '../sim/clock.ts';
import type { SimState } from '../sim/sim.ts';
import { modeOf } from '../sim/tryb.ts';
import type { Loaded } from '../world/load.ts';
import type { World } from '../world/world.ts';
import { jestStanSciezki, type StanSciezki } from './sciezka.ts';

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
  /** gra sieciowa (src/net/siec.ts, StanSieci): budynki, które nie mogą być siedzibą (świat buduje się z nimi tak
      samo), czy drużyna ma już dom, konto gry i wersja zapisu w chmurze; brak: gra bez sieci */
  siec?: { zajete: string[]; dom: boolean; utracony?: string; konto?: string; wersja?: number };
  /** widok pięter (?pietra=1): świat buduje się z awansowanymi domami; nieobecne przy wyłączonej fladze, więc zapis
      sprzed zmiany i zapis bez flagi są bajt w bajt takie same. O fladze wczytanej gry decyduje to pole, nie adres */
  pietra?: true;
  /** stan ścieżki celów (src/ui/sciezka.ts): zaliczone i przepadłe cele, otwarty rozdział, okazja. Tylko interfejs:
      ani symulacja, ani zarząd go nie znają. Pole opcjonalne: zapis sprzed ścieżki go nie ma (ścieżka zaczyna wtedy
      od stanu na start, `stanZZapisu`), a pole o złym kształcie `readSave` zdejmuje z zapisu */
  cele?: StanSciezki;
}

/** czy gra ma widok pięter: zapis wygrywa z adresem (wczytana gra zachowuje to, z czym ją zaczęto), nowa gra czyta
    `?pietra=1` */
export const pietraWlaczone = (saved: Pick<Save, 'pietra'> | null, params: URLSearchParams): boolean =>
  saved ? saved.pietra === true : params.get('pietra') === '1';

/** adres ekranu startowego po „od nowa”: ta sama strona, a z adresu przechodzą tylko parametry, które zmieniają samą grę albo
    jej język, dopóki są w adresie: `siec=1`, `pietra=1`, `lancuchy=0` (łańcuchy są domyślnie włączone, więc przenosi się tylko
    wyłączenie) i `lang=` (jak jest). Reszta (`demo`, `seed`, `godzina`, `cam`, `speed`...) służy zrzutom i próbom jednej gry
    i nie wraca na ekran startowy. */
export function adresStartowy(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const q = new URLSearchParams();
  if (params.get('siec') === '1') q.set('siec', '1');
  if (params.get('pietra') === '1') q.set('pietra', '1');
  if (params.get('lancuchy') === '0') q.set('lancuchy', '0');
  const lang = params.get('lang');
  if (lang) q.set('lang', lang);
  const s = q.toString();
  return pathname + (s ? `?${s}` : '');
}

/** odcisk świata z danych osiedla: inna wersja generatora daje inny odcisk */
export function worldKey(
  w: Pick<World, 'size' | 'hq' | 'buildings' | 'trees' | 'dryTree'> & {
    fence?: { tiles: number[] };
    /** siatka sprzed wspólnego płotu (M2 fala 2): klucz liczy się ze świata, nie z gry */
    fenceBaza?: { tiles: number[] };
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
      (w.fenceBaza ?? w.fence)?.tiles.length ?? 0,
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
    if (s.v !== SAVE_VERSION || s.sim?.v !== 3 || s.gov?.v !== 1 || !s.data?.geo) return null;
    // stan gry sieciowej buduje świat (lista wykluczeń), więc zły kształt to zły zapis (także z chmury)
    if (s.siec && !(Array.isArray(s.siec.zajete) && s.siec.zajete.every((k) => typeof k === 'string'))) return null;
    // flaga pięter buduje świat, więc inna wartość niż `true` (także `false`) to zły zapis
    if (s.pietra !== undefined && s.pietra !== true) return null;
    // stan ścieżki celów to sprawa samego interfejsu, więc zły kształt (także z chmury) to brak pola, a nie zły zapis
    if (s.cele !== undefined && !jestStanSciezki(s.cele)) delete s.cele;
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

/** „Przymorze, dzień 2, 06:40” (po angielsku „Przymorze, day 2, 06:40”) na przycisk ekranu startowego */
export const saveLabel = (s: Save): string =>
  `${s.data.name}${modeOf(s.sim) === 'zombie' ? ' (zombie)' : ''}, ${L('dzień', 'day')} ${dayOf(s.sim.tick)}, ${clockOf(s.sim.tick)}`;
