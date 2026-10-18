/* Miejsce siedziby dla zarządu: dom albo blok, sąsiedzi, sklep, garaże, przychodnia i najwyższy budynek w okolicy,
   policzone raz ze świata, do tego słownik wspólnoty (w domu ulica i komitet ulicy, w bloku spółdzielnia i zarząd)
   i wolne miejsca dla mieszkańców. Z tego zarząd bierze warianty tekstów i warunki wydarzeń; słownik czytają też
   teksty spoza zarządu. Odległości w kwadratach liczb całkowitych, bez Math.hypot, żeby wynik był ten sam w każdej
   przeglądarce. Ze świata tylko typy: zarząd nie ciągnie za sobą kodu świata ani symulacji. */

import type { EndingId } from '../content/data.ts';
import type { World } from '../world/world.ts';
import { KONIEC_DOM } from './tresc.ts';
import type { GovInput, GovPlace } from './typy.ts';

/** to, czego opis miejsca potrzebuje ze świata */
export type PlaceWorld = Pick<World, 'size' | 'buildings' | 'hq' | 'pois' | 'apts'>;

/** promienie w metrach: sąsiedzi, sklep, garaże, przychodnia, wysoki budynek */
const NEAR = 120;
const SHOP = 300;
const GARAGES = 150;
const CLINIC = 300;
const TOWER = 200;
/** sklep od tylu m² to market, z którego dachu widać okolicę */
const MARKET_AREA = 1000;

const SHOP_POI: ReadonlySet<string> = new Set([
  'spozywczy',
  'sklep',
  'budowlany',
  'elektronika',
  'ubrania',
  'ogrodnik',
]);
const CLINIC_POI: ReadonlySet<string> = new Set(['przychodnia', 'apteka']);

/** bez opisu miejsca: blok wśród bloków ze sklepem, garażami i przychodnią, czyli to, co zakłada treść z 0.3 */
export const BLOK: GovPlace = {
  kind: 'blok',
  blocks: 4,
  houses: 0,
  near: 'bloki',
  shop: 150,
  garages: 100,
  clinic: 250,
  tower: 'blok',
};

const memo = new WeakMap<PlaceWorld, GovPlace>();

/** opis miejsca siedziby; liczony raz na świat (wołany co sekundę z govInput) */
export function placeOf(w: PlaceWorld): GovPlace {
  let p = memo.get(w);
  if (!p) {
    p = describePlace(w);
    memo.set(w, p);
  }
  return p;
}

/** opis z wejścia zarządu albo blok, gdy wejście go nie ma (atrapa w testach, stare przebiegi) */
export const placeIn = (i: Pick<GovInput, 'place'>): GovPlace => i.place ?? BLOK;

type TowerKind = NonNullable<GovPlace['tower']>;

function towerKind(b: World['buildings'][number]): TowerKind | null {
  if (b.cls === 'blok') return b.levels >= 9 ? 'wiezowiec' : b.levels >= 5 ? 'blok' : null;
  if (b.cls === 'szkola' || b.cls === 'kosciol' || b.cls === 'hala') return b.cls;
  if (b.cls === 'sklep' && b.area >= MARKET_AREA) return 'market';
  return null;
}

function describePlace(w: PlaceWorld): GovPlace {
  const hq = w.buildings[w.hq];
  const hx = Math.round((hq.x0 + hq.x1) / 2);
  const hy = Math.round((hq.y0 + hq.y1) / 2);
  const dist2 = (x: number, y: number) => {
    const dx = Math.round(x) - hx;
    const dy = Math.round(y) - hy;
    return dx * dx + dy * dy;
  };
  let blocks = 0;
  let houses = 0;
  let shop = Number.POSITIVE_INFINITY;
  let garages = Number.POSITIVE_INFINITY;
  let clinic = Number.POSITIVE_INFINITY;
  let tower: { kind: TowerKind; levels: number; area: number; d: number } | null = null;
  for (let k = 0; k < w.buildings.length; k++) {
    if (k === w.hq) continue;
    const b = w.buildings[k];
    const d = dist2((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    if (d <= NEAR * NEAR) {
      if (b.cls === 'blok') blocks++;
      else if (b.cls === 'dom') houses++;
    }
    if (b.cls === 'sklep') shop = Math.min(shop, d);
    else if (b.cls === 'garaz') garages = Math.min(garages, d);
    else if (b.cls === 'przychodnia') clinic = Math.min(clinic, d);
    const kind = d <= TOWER * TOWER ? towerKind(b) : null;
    if (
      kind &&
      (!tower ||
        b.levels > tower.levels ||
        (b.levels === tower.levels && (b.area > tower.area || (b.area === tower.area && d < tower.d))))
    )
      tower = { kind, levels: b.levels, area: b.area, d };
  }
  // punkty z mapy są w metrach od środka mapy, budynki w kafelkach od rogu (jak w buildWorld: p.x + half);
  // atrapy światów w testach symulacji nie mają punktów ani stanów mieszkań
  const half = (w.size ?? 0) / 2;
  for (const q of w.pois ?? []) {
    if (SHOP_POI.has(q.c)) shop = Math.min(shop, dist2(q.x + half, q.y + half));
    else if (CLINIC_POI.has(q.c)) clinic = Math.min(clinic, dist2(q.x + half, q.y + half));
  }
  const apts = w.apts ? w.apts.filter((a) => a.bid === w.hq).length : null;
  const kind: GovPlace['kind'] = hq.cls === 'dom' || (apts !== null && apts <= 1 && hq.levels <= 2) ? 'dom' : 'blok';
  const near: GovPlace['near'] =
    blocks + houses === 0
      ? 'nikt'
      : blocks > houses
        ? 'bloki'
        : houses > blocks
          ? 'domy'
          : kind === 'dom'
            ? 'domy'
            : 'bloki';
  const within = (d2: number, r: number) => (d2 <= r * r ? Math.round(Math.sqrt(d2)) : null);
  return {
    kind,
    blocks,
    houses,
    near,
    shop: within(shop, SHOP),
    garages: within(garages, GARAGES),
    clinic: within(clinic, CLINIC),
    tower: tower?.kind ?? null,
  };
}

/** jacy sąsiedzi są w okolicy (w 120 m): bloki, domy albo nikt (null); jedno źródło słów o sąsiadach w wydarzeniach */
export const sasiedzi = (p: GovPlace): 'bloki' | 'domy' | null => (p.near === 'nikt' ? null : p.near);

/** Słowa wspólnoty według miejsca. Kontrakt także dla tekstów spoza zarządu (okna, pomoc, cele, pasek, karta osoby
    i mieszkania, menu poleceń i budowy, powód nastroju): ich warianty dla domu i bloku są tutaj, a nie w warunkach
    przy tekstach, żeby dało się je przetłumaczyć w jednym miejscu. */
export interface Words {
  /** spółdzielnia | ulica: mianownik, dopełniacz i „w czym” (w spółdzielni | na ulicy) */
  wspolnota: { m: string; d: string; w: string };
  /** zarząd | komitet ulicy: mianownik, dopełniacz, narzędnik, krótko (zarząd | komitet), krótki dopełniacz
      (zarządu | komitetu, np. „Zebranie komitetu przy kozie”) i pełna nazwa w bierniku (zarząd spółdzielni |
      komitet ulicy, „Prowadzicie …”) */
  zarzad: { m: string; d: string; n: string; krotko: string; dk: string; pelny: string };
  /** na początek zdania */
  Zarzad: string;
  /** zebranie, które może odwołać zarząd */
  walne: string;
  /** nagłówek okna wydarzenia */
  naglowek: string;
  mieszkancy: { m: string; d: string };
  /** wejście w siatce: brama | furtka (mianownik, dopełniacz „od bramy”, biernik „Zamknąć furtkę”, „przy”, „pod”) */
  brama: { m: string; d: string; b: string; przy: string; pod: string };
  /** gdzie stoi suche drzewo z samouczka: przy trzepaku | w ogrodzie (w domu trzepak zastąpią rzeczy z ogrodu) */
  drzewo: string;
  /** nazwa dziury w siatce tuż przy trzepaku; w domu null, wtedy dziura ma nazwę z kierunku */
  zaTrzepakiem: string | null;
  /** gdzie przybywa miejsc do spania: w spółdzielni | w domu („na ulicy” brzmiałoby jak bez dachu nad głową) */
  mieszkamy: string;
  /** zakończenia gry w wersji dla miejsca; tych, których tu nie ma, gra bierze z 0.3 */
  koniec: Partial<Record<EndingId, { title: string; text: string }>>;
  /** Nasze lokum w siedzibie: w bloku mieszkanie zarządu, w domu jednorodzinnym cały dom komitetu (jedyne mieszkanie
      siedziby). M: na początek zdania („Mieszkanie zarządu”), d: „w pokoju naszego mieszkania”, w: „Tylko w kuchni
      w naszym mieszkaniu.”, nr: nazwa na karcie („Mieszkanie 3”; dom bez numeru), menu: gdzie jesteśmy w nagłówku
      menu poleceń, ze stanem lokum małą literą („mieszkanie 3, puste od 2034, wyjazd”; w domu sam stan). */
  lokal: { M: string; d: string; w: string; nr: (n: number) => string; menu: (n: number, stan: string) => string };
  /** Co przeszukiwać: w bloku puste mieszkania, w domu pomieszczenia domu komitetu (decyzja Mateusza 18.10.2026).
      b: cel („Przeszukajcie puste mieszkanie.”), d: „przeszukiwanie pustych mieszkań”, jak: podpowiedź do celu drugiego
      dnia, karta: polecenia na karcie lokum, pomoc: zdanie o karcie w pomocy, naglowek: sekcja pomocy, wersja: co jest
      w wersji 0.4, zrodla: skąd deski, złom i części („Deski daje …”, „Dają je …”). */
  szukanie: {
    b: string;
    d: string;
    jak: { mysz: string; dotyk: string };
    karta: { mysz: string; dotyk: string };
    pomoc: { mysz: string; dotyk: string };
    naglowek: string;
    wersja: string;
    zrodla: { deski: string; zlom: string; czesci: string };
  };
  /** skąd przychodzi sąsiad z innego budynku: z bloku obok | zza płotu (według sąsiadów, w samotnym miejscu według
      siedziby). Wydarzenia mówią o sąsiadach tylko wtedy, gdy są (GovHost.neighbour: także „z waszej klatki”). */
  sasiad: string;
}

const BLOKOWE: Omit<Words, 'sasiad'> = {
  wspolnota: { m: 'spółdzielnia', d: 'spółdzielni', w: 'w spółdzielni' },
  zarzad: {
    m: 'zarząd',
    d: 'zarządu',
    n: 'zarządem',
    krotko: 'zarząd',
    dk: 'zarządu',
    pelny: 'zarząd spółdzielni',
  },
  Zarzad: 'Zarząd',
  walne: 'walne',
  naglowek: 'Na osiedlu',
  mieszkancy: { m: 'mieszkańcy', d: 'mieszkańców' },
  brama: { m: 'brama', d: 'bramy', b: 'bramę', przy: 'przy bramie', pod: 'pod bramą' },
  drzewo: 'przy trzepaku',
  zaTrzepakiem: 'za trzepakiem',
  mieszkamy: 'w spółdzielni',
  koniec: {},
  lokal: {
    M: 'Mieszkanie',
    d: 'naszego mieszkania',
    w: 'w naszym mieszkaniu',
    nr: (n) => `Mieszkanie ${n}`,
    menu: (n, stan) => `mieszkanie ${n}, ${stan}`,
  },
  szukanie: {
    b: 'puste mieszkanie',
    d: 'pustych mieszkań',
    jak: {
      mysz: 'Kliknijcie mieszkanie w siedzibie: karta pokaże, czy jest puste i co w nim zostało. Potem prawy przycisk w nim: „Przeszukać”.',
      dotyk:
        'Stuknijcie mieszkanie w siedzibie: karta pokaże, czy jest puste i co w nim zostało. Potem przytrzymajcie w nim palec: „Przeszukać”.',
    },
    karta: {
      mysz: 'Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
      dotyk: 'Przytrzymajcie palec w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
    },
    pomoc: {
      mysz: 'Klik w mieszkanie siedziby pokazuje jego kartę: czy jest puste, dlaczego, co do naprawy i co już przeszukane. Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
      dotyk:
        'Stuknięcie w mieszkanie siedziby pokazuje jego kartę: czy jest puste, dlaczego, co do naprawy i co już przeszukane. Przytrzymanie palca w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
    },
    naglowek: 'Budowa i puste mieszkania',
    wersja: 'puste mieszkania do przeszukania i naprawy',
    zrodla: {
      deski: 'przeszukiwanie pustych mieszkań i rozbiórka mebli',
      zlom: 'przeszukiwanie i rozbiórka śmieci i sprzętów',
      czesci: 'przeszukiwanie i rozbiórka sprzętów',
    },
  },
};

const ULICZNE: Omit<Words, 'sasiad'> = {
  wspolnota: { m: 'ulica', d: 'ulicy', w: 'na ulicy' },
  zarzad: {
    m: 'komitet ulicy',
    d: 'komitetu ulicy',
    n: 'komitetem ulicy',
    krotko: 'komitet',
    dk: 'komitetu',
    pelny: 'komitet ulicy',
  },
  Zarzad: 'Komitet ulicy',
  walne: 'zebranie ulicy',
  naglowek: 'Na ulicy',
  mieszkancy: { m: 'sąsiedzi', d: 'sąsiadów' },
  brama: { m: 'furtka', d: 'furtki', b: 'furtkę', przy: 'przy furtce', pod: 'pod furtką' },
  drzewo: 'w ogrodzie',
  zaTrzepakiem: null,
  mieszkamy: 'w domu',
  koniec: KONIEC_DOM,
  // dom ma jedno mieszkanie, komitetu: na karcie i w menu poleceń bez numeru, a przeszukuje się jego pomieszczenia
  lokal: {
    M: 'Dom',
    d: 'naszego domu',
    w: 'w naszym domu',
    nr: () => 'Dom',
    menu: (_n, stan) => stan,
  },
  szukanie: {
    b: 'dom',
    d: 'domu',
    jak: {
      mysz: 'Kliknijcie dom: karta pokaże, co w nim już przeszukane. Potem prawy przycisk w domu: „Przeszukać”.',
      dotyk: 'Stuknijcie dom: karta pokaże, co w nim już przeszukane. Potem przytrzymajcie palec w domu: „Przeszukać”.',
    },
    karta: {
      mysz: 'Prawy przycisk w domu: Przeszukać.',
      dotyk: 'Przytrzymajcie palec w domu: Przeszukać.',
    },
    pomoc: {
      mysz: 'Klik w dom pokazuje jego kartę: co w nim już przeszukane. Prawy przycisk w domu: Przeszukać.',
      dotyk: 'Stuknięcie w dom pokazuje jego kartę: co w nim już przeszukane. Przytrzymanie palca w domu: Przeszukać.',
    },
    naglowek: 'Budowa i przeszukiwanie domu',
    wersja: 'dom do przeszukania',
    zrodla: {
      deski: 'przeszukiwanie domu i rozbiórka gruzu',
      zlom: 'przeszukiwanie domu i rozbiórka gruzu',
      czesci: 'przeszukiwanie domu',
    },
  },
};

/** słownik dla miejsca: w domu ulica i komitet ulicy, w bloku spółdzielnia i zarząd (decyzja Mateusza, 17.10.2026) */
export function wordsOf(p: GovPlace): Words {
  const s = sasiedzi(p);
  const houses = s === 'domy' || (s === null && p.kind === 'dom');
  return { ...(p.kind === 'dom' ? ULICZNE : BLOKOWE), sasiad: houses ? 'zza płotu' : 'z bloku obok' };
}

/** opis miejsca dla świata gry (symulacja i interfejs); świat bez siedziby (atrapy w testach) to blok */
export const placeOfWorld = (w: PlaceWorld): GovPlace => (w.buildings[w.hq] ? placeOf(w) : BLOK);

/** słownik dla świata gry (teksty symulacji i interfejsu); świat bez siedziby (atrapy w testach) mówi jak blok */
export const wordsOfWorld = (w: PlaceWorld): Words => wordsOf(placeOfWorld(w));

/** wolne miejsca dla mieszkańców (miejsca minus mieszkańcy); bez danych o miejscach cztery, jak dotąd */
export function freePlaces(i: Pick<GovInput, 'cap' | 'residents'>): number {
  if (i.cap === undefined) return 4;
  return Math.max(0, i.cap - (i.residents ?? 0));
}
