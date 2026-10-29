/* Zapis gry w przeglądarce (localStorage): dane osiedla, z których świat odtwarza się deterministycznie,
   ziarno, stan symulacji, stan zarządu, stan ścieżki celów (`cele`, src/ui/sciezka.ts) i czas przy ekranie. Jeden zapis
   na przeglądarkę. Zapis nie zależy od języka; tylko etykieta wznowienia (`saveLabel`) jest w bieżącym języku.
   Kontrola kształtu w `readSave` jest dwojakiego rodzaju: pole, od którego zależy świat albo przebieg gry (wersje,
   `siec`, `pietra`, `osada`), przy złym kształcie odrzuca cały zapis, a `cele`, które dotyczy tylko interfejsu, przy złym
   kształcie znika z zapisu i reszta wczytuje się jak zawsze.
   Pole `osada` (stan drugiej gry na sąsiednim kwadracie, `?osada=1`, src/ui/osada.ts) jest opcjonalne i jest tylko w grze
   zaczętej z flagą: zapis bez flagi jest bajt w bajt taki jak przed osadą. Kształt stanu osady sprawdza tu `jestStanOsady`,
   strukturalnie, bez importu kodu osady (tylko typ): silnik AI nie wchodzi do gry bez flagi, a moduł osady importuje stąd
   `worldKey`. Zapis osady składa `poleOsady` i osłania jej wyjątek (zapis idzie wtedy bez osady, z jednym ostrzeżeniem), bo
   `save()` woła się z pętli klatek, a wyjątek w niej zatrzymałby grę. */

import { L } from '../core/jezyk.ts';
import { hashString } from '../core/rng.ts';
import type { GovState } from '../gov/typy.ts';
import { siecWlaczona } from '../net/flaga.ts';
import { clockOf, dayOf } from '../sim/clock.ts';
import type { SimState } from '../sim/sim.ts';
import { modeOf } from '../sim/tryb.ts';
import type { Loaded } from '../world/load.ts';
import type { World } from '../world/world.ts';
import type { StanOsady } from './osada.ts';
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
      samo), czy drużyna ma już dom, konto gry, wersja zapisu w chmurze, czy kod powrotu już się pokazał i czy drużyna
      została usunięta z serwera (gra bez sieci); brak: gra bez sieci */
  siec?: {
    zajete: string[];
    dom: boolean;
    utracony?: string;
    konto?: string;
    wersja?: number;
    kodPokazany?: boolean;
    usunieta?: boolean;
  };
  /** widok pięter (?pietra=1): świat buduje się z awansowanymi domami; nieobecne przy wyłączonej fladze, więc zapis
      sprzed zmiany i zapis bez flagi są bajt w bajt takie same. O fladze wczytanej gry decyduje to pole, nie adres */
  pietra?: true;
  /** druga gra na sąsiednim kwadracie (?osada=1, src/ui/osada.ts): stan osady (czeka, brak, jest z grą i geo kwadratu); nieobecne
      w grze bez flagi, więc jej zapis jest taki sam jak przed osadą. O fladze wczytanej gry decyduje to pole, nie adres
      (`osadaWlaczona`); zły kształt odrzuca cały zapis, bo od stanu osady zależy przebieg */
  osada?: StanOsady;
  /** stan ścieżki celów (src/ui/sciezka.ts): zaliczone i przepadłe cele, otwarty rozdział, okazja. Tylko interfejs:
      ani symulacja, ani zarząd go nie znają. Pole opcjonalne: zapis sprzed ścieżki go nie ma (ścieżka zaczyna wtedy
      od stanu na start, `stanZZapisu`), a pole o złym kształcie `readSave` zdejmuje z zapisu */
  cele?: StanSciezki;
}

/** czy gra ma widok pięter: zapis wygrywa z adresem (wczytana gra zachowuje to, z czym ją zaczęto), nowa gra czyta
    `?pietra=1` */
export const pietraWlaczone = (saved: Pick<Save, 'pietra'> | null, params: URLSearchParams): boolean =>
  saved ? saved.pietra === true : params.get('pietra') === '1';

/** czy gra ma osadę na sąsiednim kwadracie: zapis wygrywa z adresem (wczytana gra zachowuje to, z czym ją zaczęto), nowa gra czyta
    `?osada=1`. Nowa gra z włączoną siecią (`siecWlaczona`: `?siec=1` albo VITE_SIEC=1; gra z sąsiadami, src/net/gra.ts) osady nie
    dostaje: etap 2 nie łączy obu rzeczy (zapis do chmury, drużyny na jednym osiedlu), więc flaga `osada` przy sieci jest na razie
    wyłączona (`osadaOdrzuconaPrzezSiec`); `?siec=0` przywraca osadę także w budowie z VITE_SIEC=1. */
export const osadaWlaczona = (saved: Pick<Save, 'osada'> | null, params: URLSearchParams): boolean =>
  saved ? saved.osada !== undefined : params.get('osada') === '1' && !siecWlaczona(params);

/** czy nowa gra prosi o osadę (`?osada=1`) razem z włączoną siecią (gra z sąsiadami), więc osady nie będzie: o tym gra ostrzega raz
    w konsoli. Wczytana gra niczego nie odrzuca (ma osadę z zapisu albo nigdy jej nie miała). */
export const osadaOdrzuconaPrzezSiec = (saved: Pick<Save, 'osada'> | null, params: URLSearchParams): boolean =>
  !saved && params.get('osada') === '1' && siecWlaczona(params);

/** osady, o których `poleOsady` już ostrzegło: ostrzeżenie jest jedno na grę, bo zapis idzie co godzinę gry, a ten sam błąd wraca z
    każdym */
const ostrzezoneOsady = new WeakSet<object>();

/** Pole `osada` do zapisu gry (`Save`): `{ osada }` ze stanem drugiej gry, a bez niej (gra bez flagi) puste, więc zapis bez flagi
    jest bajt w bajt taki jak przed osadą. `save()` w src/main.ts woła się z pętli klatek (raz na godzinę gry), a wyjątek w niej
    zatrzymuje ticker PixiJS i grę do przeładowania, więc osada, której `zapisz()` rzuci, nie przewraca zapisu: pole jest wtedy
    puste (zapis idzie bez osady, a wczytana gra rusza bez niej, bo o osadzie decyduje zapis, nie adres), a `ostrzez` dostaje błąd
    najwyżej raz na osadę (domyślnie jedno ostrzeżenie w konsoli). Reszta zapisu, czyli nasza gra, nie traci przez to postępu. */
export function poleOsady(
  o: { zapisz(): StanOsady } | null,
  ostrzez: (blad: unknown) => void = (blad) =>
    console.warn(
      'Osada AI: nie udało się zapisać osady, zapis idzie bez niej (po wczytaniu gra będzie bez osady)',
      blad,
    ),
): { osada?: StanOsady } {
  if (!o) return {};
  try {
    return { osada: o.zapisz() };
  } catch (e) {
    if (!ostrzezoneOsady.has(o)) {
      ostrzezoneOsady.add(o);
      ostrzez(e);
    }
    return {};
  }
}

/** adres ekranu startowego po „od nowa”: ta sama strona, a z adresu przechodzą tylko parametry, które zmieniają samą grę albo
    jej język, dopóki są w adresie: `siec` (tylko gdy odróżnia grę od domyślnej budowy strony: `siec=1` bez VITE_SIEC, `siec=0` z
    VITE_SIEC=1), `pietra=1`, `osada=1`, `lancuchy=0` (łańcuchy są domyślnie włączone, więc przenosi się tylko wyłączenie) i `lang=`
    (jak jest). Reszta (`demo`, `seed`, `godzina`, `cam`, `speed`...) służy zrzutom i próbom jednej gry i nie wraca na ekran
    startowy. */
export function adresStartowy(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const q = new URLSearchParams();
  const siec = siecWlaczona(params);
  if (siec !== siecWlaczona(new URLSearchParams())) q.set('siec', siec ? '1' : '0');
  if (params.get('pietra') === '1') q.set('pietra', '1');
  if (params.get('osada') === '1') q.set('osada', '1');
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

const jestObiektem = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const jestLiczba = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** klucz kwadratu „sx,sy” w postaci, jaką daje `kluczKwadratu` (bez zer wiodących i plusa) */
const KLUCZ_KWADRATU = /^(0|-?[1-9]\d*),(0|-?[1-9]\d*)$/;

/** zapisane geo kwadratu: środek i listy budynków, dróg, terenów, wód i miejsc (resztę czyta budowa świata) */
const jestGeoOsady = (x: unknown): boolean =>
  jestObiektem(x) &&
  Array.isArray(x.c) &&
  x.c.length === 2 &&
  x.c.every(jestLiczba) &&
  ['b', 'r', 'a', 'w', 'poi'].every((k) => Array.isArray(x[k]));

/** zapisana gra osady (`ZapisGryAi`): wersje gry, symulacji, zarządu i pamięci silnika, ziarno i opcje */
const jestGraOsady = (x: unknown): boolean =>
  jestObiektem(x) &&
  x.v === 1 &&
  jestLiczba(x.seed) &&
  jestObiektem(x.opts) &&
  jestObiektem(x.sim) &&
  x.sim.v === 3 &&
  jestObiektem(x.gov) &&
  x.gov.v === 1 &&
  jestObiektem(x.pamiec) &&
  x.pamiec.v === 1;

/** Czy `x` ma kształt `StanOsady` (src/ui/osada.ts): wersja 1 i jeden z trzech stanów; „jest” z kluczem kwadratu, geo, odciskiem
    świata, zapisem gry, flagą odkrycia, licznikiem odwołań (liczba całkowita od 0) oraz ewentualnym kontaktem i upadkiem. Kontrola
    kształtu, nie wartości: wczytanie osady łapie resztę (odcisk świata, uszkodzoną symulację) i wtedy zostaje „brak”. */
export function jestStanOsady(x: unknown): x is StanOsady {
  if (!jestObiektem(x) || x.v !== 1) return false;
  if (x.stan === 'czeka') return true;
  if (x.stan === 'brak') return x.powod === 'dane' || x.powod === 'regula' || x.powod === 'blad';
  if (x.stan !== 'jest') return false;
  const kontakt = x.kontakt;
  const upadla = x.upadla;
  return (
    typeof x.klucz === 'string' &&
    KLUCZ_KWADRATU.test(x.klucz) &&
    jestGeoOsady(x.geo) &&
    typeof x.world === 'string' &&
    jestGraOsady(x.gra) &&
    typeof x.odkryta === 'boolean' &&
    (kontakt === undefined ||
      (jestObiektem(kontakt) &&
        jestLiczba(kontakt.dzien) &&
        jestLiczba(kontakt.ludnosc) &&
        jestLiczba(kontakt.budowle))) &&
    typeof x.odwolania === 'number' &&
    Number.isInteger(x.odwolania) &&
    x.odwolania >= 0 &&
    (upadla === undefined ||
      (jestObiektem(upadla) && jestLiczba(upadla.dzien) && (upadla.powod === 'pustka' || upadla.powod === 'exodus')))
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
    // stan osady decyduje o przebiegu drugiej gry (i o tym, czy gra ma ją w ogóle), więc zły kształt to zły zapis
    if (s.osada !== undefined && !jestStanOsady(s.osada)) return null;
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
