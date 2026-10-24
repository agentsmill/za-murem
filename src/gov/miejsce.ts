/* Miejsce siedziby dla zarządu: dom albo blok, sąsiedzi, sklep, garaże, przychodnia i najwyższy budynek w okolicy,
   policzone raz ze świata, do tego słownik wspólnoty (w domu ulica i komitet ulicy, w bloku spółdzielnia i zarząd)
   i wolne miejsca dla mieszkańców. Z tego zarząd bierze warianty tekstów i warunki wydarzeń; słownik czytają też
   teksty spoza zarządu. Odległości w kwadratach liczb całkowitych, bez Math.hypot, żeby wynik był ten sam w każdej
   przeglądarce. Ze świata tylko typy: zarząd nie ciągnie za sobą kodu świata ani symulacji. `stronyOf` liczy ze świata,
   gdzie przy siatce jest strona garaży i strona najbliższego budynku mieszkalnego (kafelki dla „Sprawdzić” z krzyku
   i hałasu); wołają ją `govInput` (src/sim/gov.ts) i testy. `waszeLokum` zamienia „naszego mieszkania” (domu) ze słownika
   na „waszego …” w zdaniach, które mówią do zarządu na „wy”: drogi do zwycięstwa i cele ścieżki. */

import type { EndingId } from '../content/data.ts';
import type { World } from '../world/world.ts';
import { KONIEC_DOM_EN } from './tresc.en.ts';
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

/** to, czego strony potrzebują ze świata: budynki, siedziba, rozmiar, kafelki nie do przejścia i podwórko siatki */
export type StronyWorld = Pick<World, 'size' | 'buildings' | 'hq'> & {
  blocked?: Uint8Array;
  fence?: Pick<World['fence'], 'yard'>;
};

/** Kafelek podwórka przy siatce od strony najbliższych garaży (do 150 m od siedziby) i od strony najbliższego budynku
    mieszkalnego za siatką (blok albo dom do 120 m, bez siedziby i bez `wylaczone`, czyli budynków już otoczonych
    wspólnym płotem). Budynek to ten o najbliższym środku od środka siedziby (jak w `placeOf`), a kafelek to wolny kafelek
    podwórka o najbliższym kwadracie odległości od jego środka; remis rozstrzyga niższy numer. Same liczby całkowite,
    bez Math.hypot. Strony, których świat nie ma, nie występują; bez podwórka obiekt jest pusty. */
export function stronyOf(w: StronyWorld, wylaczone: ReadonlySet<number> = new Set()): NonNullable<GovInput['strony']> {
  const yard = w.fence?.yard ?? [];
  const hq = w.buildings[w.hq];
  if (!yard.length || !hq) return {};
  const size = w.size;
  const mid = (b: World['buildings'][number]): [number, number] => [
    Math.round((b.x0 + b.x1) / 2),
    Math.round((b.y0 + b.y1) / 2),
  ];
  const [hx, hy] = mid(hq);
  let garaz: { d: number; at: [number, number] } | null = null;
  let blok: { d: number; at: [number, number] } | null = null;
  for (let k = 0; k < w.buildings.length; k++) {
    if (k === w.hq || wylaczone.has(k)) continue;
    const b = w.buildings[k];
    const at = mid(b);
    const d = (at[0] - hx) ** 2 + (at[1] - hy) ** 2;
    if (b.cls === 'garaz' && d <= GARAGES * GARAGES && (!garaz || d < garaz.d)) garaz = { d, at };
    else if ((b.cls === 'blok' || b.cls === 'dom') && d <= NEAR * NEAR && (!blok || d < blok.d)) blok = { d, at };
  }
  /** wolny kafelek podwórka najbliższy punktowi */
  const najblizszy = (at: [number, number]): number => {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of yard) {
      if (w.blocked?.[t]) continue;
      const d = ((t % size) - at[0]) ** 2 + (Math.floor(t / size) - at[1]) ** 2;
      if (d < bd || (d === bd && t < best)) {
        bd = d;
        best = t;
      }
    }
    return best;
  };
  const out: NonNullable<GovInput['strony']> = {};
  if (garaz) {
    const t = najblizszy(garaz.at);
    if (t >= 0) out.garaze = t;
  }
  if (blok) {
    const t = najblizszy(blok.at);
    if (t >= 0) out.blok = t;
  }
  return out;
}

/** jacy sąsiedzi są w okolicy (w 120 m): bloki, domy albo nikt (null); jedno źródło słów o sąsiadach w wydarzeniach */
export const sasiedzi = (p: GovPlace): 'bloki' | 'domy' | null => (p.near === 'nikt' ? null : p.near);

/** Słowa wspólnoty według miejsca. Kontrakt także dla tekstów spoza zarządu (okna, pomoc, cele, pasek, karta osoby
    i mieszkania, menu poleceń i budowy, powód nastroju): ich warianty dla domu i bloku są tutaj, a nie w warunkach
    przy tekstach, żeby dało się je przetłumaczyć w jednym miejscu. */
export interface Words {
  /** spółdzielnia | ulica: mianownik, dopełniacz i „w czym” (w spółdzielni | na ulicy) */
  wspolnota: { m: string; d: string; w: string };
  /** zarząd | komitet ulicy: mianownik, dopełniacz, narzędnik („pod zarządem | pod komitetem ulicy”), krótko (zarząd |
      komitet), krótki dopełniacz (zarządu | komitetu, np. „Zebranie komitetu przy kozie”), krótki miejscownik („w zarządzie |
      w komitecie”: l bez przyimka) i pełna nazwa w bierniku (zarząd spółdzielni | komitet ulicy, „Prowadzicie …”) */
  zarzad: { m: string; d: string; n: string; krotko: string; dk: string; l: string; pelny: string };
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
      menu poleceń, ze stanem lokum małą literą („mieszkanie 3, puste od 2034, wyjazd”; w domu sam stan), wiele: gdzie
      zarząd naprawia („w naszych mieszkaniach”: w bloku może zająć więcej niż jedno; w domu „w naszym domu”). */
  lokal: {
    M: string;
    d: string;
    w: string;
    wiele: string;
    nr: (n: number) => string;
    menu: (n: number, stan: string) => string;
  };
  /** Co przeszukiwać: w bloku puste mieszkania, w domu pomieszczenia domu komitetu (decyzja Mateusza 18.10.2026).
      b: cel („Przeszukajcie puste mieszkanie.”), d: „przeszukiwanie pustych mieszkań”, w: gdzie leży mebel do spalenia,
      kiedy drzewa stoją wśród szwendaczy („w pustym mieszkaniu” | „w domu”), jak: podpowiedź do celu drugiego dnia
      (najpierw zaznaczyć osobę, potem polecenie „Przeszukać …” w pomieszczeniu, karta jako sposób na znalezienie pustego),
      obok: dopisek do podpowiedzi pierwszej budowli o sąsiednich domach jako drugim źródle desek i złomu (w bloku null),
      karta: polecenia na karcie lokum, pomoc: zdanie o karcie w pomocy, naglowek: sekcja pomocy, wersja: co jest
      w wersji 0.4, zrodla: skąd deski, złom i części, w dopełniaczu po „pochodzą z” („Deski pochodzą z przeszukiwania pustych
      mieszkań i rozbiórki mebli.”; rzeczownik w mianowniku z czasownikiem „daje” czytał się jak „deski dają przeszukiwanie”). */
  szukanie: {
    b: string;
    d: string;
    w: string;
    jak: { mysz: string; dotyk: string };
    obok: { mysz: string; dotyk: string } | null;
    karta: { mysz: string; dotyk: string };
    pomoc: { mysz: string; dotyk: string };
    naglowek: string;
    wersja: string;
    zrodla: { deski: string; zlom: string; czesci: string };
  };
  /** skąd przychodzi sąsiad z innego budynku: z bloku obok | zza płotu (według sąsiadów, w samotnym miejscu według
      siedziby). Wydarzenia mówią o sąsiadach tylko wtedy, gdy są (GovHost.neighbour: także „z waszej klatki”). */
  sasiad: string;
  /** epilog zwycięstwa (src/ui/zwyciestwo.ts), kawałki zdań, które w domu mówią o płotach, domach i trawnikach zamiast
      o klatkach i trzepaku. grafiki: gdzie wiszą grafiki dyżurów („Na klatkach” | „Na płotach”), kazda: „Każda klatka |
      Każdy dom” (ma swoje zebranie), regulamin: czego regulamin ktoś już pisze („regulamin trzepaka” | „regulamin
      koszenia trawników”). */
  epilog: { grafiki: string; kazda: string; regulamin: string };
}

const BLOKOWE: Omit<Words, 'sasiad'> = {
  wspolnota: { m: 'spółdzielnia', d: 'spółdzielni', w: 'w spółdzielni' },
  zarzad: {
    m: 'zarząd',
    d: 'zarządu',
    n: 'zarządem',
    krotko: 'zarząd',
    dk: 'zarządu',
    l: 'zarządzie',
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
    wiele: 'w naszych mieszkaniach',
    nr: (n) => `Mieszkanie ${n}`,
    menu: (n, stan) => `mieszkanie ${n}, ${stan}`,
  },
  szukanie: {
    b: 'puste mieszkanie',
    d: 'pustych mieszkań',
    w: 'w pustym mieszkaniu',
    // lewy klik w puste miejsce zdejmuje zaznaczenie, a prawy przycisk bez zaznaczonej osoby nic nie daje: najpierw
    // osoba, potem polecenie; karta mieszkania (klik bez zaznaczenia) mówi tylko, które jest puste
    jak: {
      mysz: 'Zaznaczcie kogoś z zarządu i prawy przycisk w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: klik w mieszkanie, kiedy nikt nie jest zaznaczony.',
      dotyk:
        'Stuknijcie kogoś z zarządu i przytrzymajcie palec w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: stuknięcie w mieszkanie, kiedy nikt nie jest zaznaczony.',
    },
    obok: null,
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
      deski: 'przeszukiwania pustych mieszkań i rozbiórki mebli',
      zlom: 'przeszukiwania i rozbiórki śmieci i sprzętów',
      czesci: 'przeszukiwania i rozbiórki sprzętów',
    },
  },
  epilog: { grafiki: 'Na klatkach', kazda: 'Każda klatka', regulamin: 'regulamin trzepaka' },
};

const ULICZNE: Omit<Words, 'sasiad'> = {
  wspolnota: { m: 'ulica', d: 'ulicy', w: 'na ulicy' },
  zarzad: {
    m: 'komitet ulicy',
    d: 'komitetu ulicy',
    n: 'komitetem ulicy',
    krotko: 'komitet',
    dk: 'komitetu',
    l: 'komitecie',
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
    wiele: 'w naszym domu',
    nr: () => 'Dom',
    menu: (_n, stan) => stan,
  },
  szukanie: {
    b: 'dom',
    d: 'domu',
    w: 'w domu',
    jak: {
      mysz: 'Zaznaczcie kogoś z komitetu i prawy przycisk w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: klik w dom, kiedy nikt nie jest zaznaczony.',
      dotyk:
        'Stuknijcie kogoś z komitetu i przytrzymajcie palec w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: stuknięcie w dom, kiedy nikt nie jest zaznaczony.',
    },
    // dom komitetu przeszukuje się w godzinę, więc materiału brakuje wcześniej niż w bloku: pomagają sąsiednie domy
    obok: {
      mysz: 'Deski i złom mają też sąsiednie domy: prawy przycisk na ich drzwiach.',
      dotyk: 'Deski i złom mają też sąsiednie domy: przytrzymajcie palec na ich drzwiach.',
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
      deski: 'przeszukiwania domu i rozbiórki gruzu',
      zlom: 'przeszukiwania domu i rozbiórki gruzu',
      czesci: 'przeszukiwania domu',
    },
  },
  epilog: { grafiki: 'Na płotach', kazda: 'Każdy dom', regulamin: 'regulamin koszenia trawników' },
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

/** Lokum zarządu w dopełniaczu, w drugiej osobie: „waszego mieszkania” w bloku, „waszego domu” w domu jednorodzinnym.
    Słownik (`Words.lokal.d`) mówi „naszego …”, a zdania „co dalej” dróg do zwycięstwa (src/gov/zwyciestwo.ts) i cele
    ścieżki (src/ui/sciezka-rozdzialy.ts) zwracają się do zarządu na „wy”; ta jedna funkcja robi tę zamianę dla obu. */
export const waszeLokum = (w: Pick<Words, 'lokal'>): string => w.lokal.d.replace(/^naszego /, 'waszego ');

/** Słowa wspólnoty po angielsku, jak Words (docs/SLOWNICZEK-EN.md), z tych samych warunków. Bez przypadków,
    z rodzajnikiem tam, gdzie zdanie go potrzebuje; wielka litera na początek zdania przez `Zarzad`. */
export interface WordsEn {
  /** the co-op | the street */
  wspolnota: string;
  /** the board | the street committee */
  zarzad: string;
  /** pełna nazwa jak Words.zarzad.pelny: the board of a housing co-op | the street committee */
  pelny: string;
  /** The board | The street committee */
  Zarzad: string;
  /** krótko: the board | the committee */
  krotko: string;
  /** your board | your street committee („This is your board.”) */
  wasz: string;
  /** zebranie i uchwała na początek zdania: Board meeting | Committee meeting, Board resolution | Committee resolution */
  zebranie: string;
  uchwala: string;
  /** the general meeting | the street meeting */
  walne: string;
  /** nagłówek okna wydarzenia: On the estate | On the street */
  naglowek: string;
  /** residents | neighbours */
  mieszkancy: string;
  /** the gate | the garden gate */
  brama: string;
  /** gdzie stoi suche drzewo z samouczka: by the carpet rack | in the garden */
  drzewo: string;
  /** dziura tuż przy trzepaku: behind the carpet rack; w domu null */
  zaTrzepakiem: string | null;
  /** gdzie przybywa miejsc do spania: in the co-op | in the house */
  mieszkamy: string;
  /** zakończenia gry w wersji dla miejsca, jak Words.koniec */
  koniec: Partial<Record<EndingId, { title: string; text: string }>>;
  /** Nasze lokum w siedzibie jak Words.lokal: noun flat | house („The board’s flat”, „The committee’s house”),
      w: „Only in a room of your flat.”, nr: nazwa na karcie („Flat 3” | „The house”), menu: nagłówek menu poleceń
      ze stanem lokum („flat 3, empty since 2034, moved out”; w domu sam stan). */
  lokal: {
    noun: string;
    w: string;
    /** gdzie zarząd naprawia, po „in”: „our flats” (w bloku może zająć więcej niż jedno) | „our house” */
    wiele: string;
    nr: (n: number) => string;
    menu: (n: number, stan: string) => string;
  };
  /** co przeszukiwać, jak Words.szukanie: puste mieszkania albo dom komitetu */
  szukanie: {
    /** cel: „Search an empty flat.” | „Search the house.” */
    b: string;
    /** „searching empty flats” | „searching the house” */
    d: string;
    /** gdzie leży mebel do spalenia: „in an empty flat” | „in the house” */
    w: string;
    jak: { mysz: string; dotyk: string };
    /** dopisek o sąsiednich domach jako drugim źródle desek i złomu (w bloku null) */
    obok: { mysz: string; dotyk: string } | null;
    karta: { mysz: string; dotyk: string };
    pomoc: { mysz: string; dotyk: string };
    naglowek: string;
    wersja: string;
    /** skąd deski, złom i części („Planks come from …”, „to get more” w pasku) */
    zrodla: { deski: string; zlom: string; czesci: string };
  };
  /** from the block next door | from over the fence (jak Words.sasiad) */
  sasiad: string;
  /** epilog zwycięstwa jak Words.epilog. grafiki: „Rotas hang ___” (in the stairwells | on the fences), kazda: „Every
      stairwell | Every house” (has its own meeting), regulamin: „rules for ___” (the carpet rack | mowing the lawns),
      jeszcze: „a settlement now or still ___” (a housing co-op | a street) */
  epilog: { grafiki: string; kazda: string; regulamin: string; jeszcze: string };
}

const BLOKOWE_EN: Omit<WordsEn, 'sasiad'> = {
  wspolnota: 'the co-op',
  zarzad: 'the board',
  pelny: 'the board of a housing co-op',
  Zarzad: 'The board',
  krotko: 'the board',
  wasz: 'your board',
  zebranie: 'Board meeting',
  uchwala: 'Board resolution',
  walne: 'the general meeting',
  naglowek: 'On the estate',
  mieszkancy: 'residents',
  brama: 'the gate',
  drzewo: 'by the carpet rack',
  zaTrzepakiem: 'behind the carpet rack',
  mieszkamy: 'in the co-op',
  koniec: {},
  lokal: {
    noun: 'flat',
    w: 'your flat',
    wiele: 'our flats',
    nr: (n) => `Flat ${n}`,
    menu: (n, stan) => `flat ${n}, ${stan}`,
  },
  szukanie: {
    b: 'an empty flat',
    d: 'empty flats',
    w: 'in an empty flat',
    jak: {
      mysz: 'Select someone from the board and right-click inside an empty flat: “Search the …”. To see which flats are empty, click a flat while nobody is selected and read its card.',
      dotyk:
        'Tap someone from the board and press and hold inside an empty flat: “Search the …”. To see which flats are empty, tap a flat while nobody is selected and read its card.',
    },
    obok: null,
    karta: {
      mysz: 'Right-click inside the flat: Search, Take apart, Fix, Claim the flat.',
      dotyk: 'Press and hold inside the flat: Search, Take apart, Fix, Claim the flat.',
    },
    pomoc: {
      mysz: 'Click a flat at HQ to see its card: whether it is empty, why, what needs repairing and what has been searched. Right-click inside a flat for: Search, Take apart, Fix, Claim the flat.',
      dotyk:
        'Tap a flat at HQ to see its card: whether it is empty, why, what needs repairing and what has been searched. Press and hold inside a flat for: Search, Take apart, Fix, Claim the flat.',
    },
    naglowek: 'Building and empty flats',
    wersja: 'empty flats to search and repair',
    zrodla: {
      deski: 'searching empty flats and taking furniture apart',
      zlom: 'searching, clearing rubbish and taking appliances apart',
      czesci: 'searching and taking appliances apart',
    },
  },
  epilog: {
    grafiki: 'in the stairwells',
    kazda: 'Every stairwell',
    regulamin: 'the carpet rack',
    jeszcze: 'a housing co-op',
  },
};

const ULICZNE_EN: Omit<WordsEn, 'sasiad'> = {
  wspolnota: 'the street',
  zarzad: 'the street committee',
  pelny: 'the street committee',
  Zarzad: 'The street committee',
  krotko: 'the committee',
  wasz: 'your street committee',
  zebranie: 'Committee meeting',
  uchwala: 'Committee resolution',
  walne: 'the street meeting',
  naglowek: 'On the street',
  mieszkancy: 'neighbours',
  brama: 'the garden gate',
  drzewo: 'in the garden',
  zaTrzepakiem: null,
  mieszkamy: 'in the house',
  koniec: KONIEC_DOM_EN,
  // dom komitetu to jedyne mieszkanie siedziby: bez numeru, przeszukuje się jego pomieszczenia
  lokal: {
    noun: 'house',
    w: 'your house',
    wiele: 'our house',
    nr: () => 'The house',
    menu: (_n, stan) => stan,
  },
  szukanie: {
    b: 'the house',
    d: 'the house',
    w: 'in the house',
    jak: {
      mysz: 'Select someone from the committee and right-click inside a room of the house: “Search the …”. To see what has been searched, click the house while nobody is selected and read its card.',
      dotyk:
        'Tap someone from the committee and press and hold inside a room of the house: “Search the …”. To see what has been searched, tap the house while nobody is selected and read its card.',
    },
    obok: {
      mysz: 'The houses next door have planks and scrap too: right-click their door.',
      dotyk: 'The houses next door have planks and scrap too: press and hold on their door.',
    },
    karta: {
      mysz: 'Right-click inside the house: Search.',
      dotyk: 'Press and hold inside the house: Search.',
    },
    pomoc: {
      mysz: 'Clicking the house shows its card: what has already been searched. Right-click inside the house: Search.',
      dotyk:
        'Tapping the house shows its card: what has already been searched. Press and hold inside the house: Search.',
    },
    naglowek: 'Building and searching the house',
    wersja: 'a house to search',
    zrodla: {
      deski: 'searching the house and clearing rubble',
      zlom: 'searching the house and clearing rubble',
      czesci: 'searching the house',
    },
  },
  epilog: {
    grafiki: 'on the fences',
    kazda: 'Every house',
    regulamin: 'mowing the lawns',
    jeszcze: 'a street',
  },
};

/** angielski słownik dla miejsca, z tych samych warunków co wordsOf */
export function wordsEn(p: GovPlace): WordsEn {
  const s = sasiedzi(p);
  const houses = s === 'domy' || (s === null && p.kind === 'dom');
  return {
    ...(p.kind === 'dom' ? ULICZNE_EN : BLOKOWE_EN),
    sasiad: houses ? 'from over the fence' : 'from the block next door',
  };
}

/** angielski słownik dla świata gry, jak wordsOfWorld */
export const wordsEnOfWorld = (w: PlaceWorld): WordsEn => wordsEn(placeOfWorld(w));

/** wolne miejsca dla mieszkańców (miejsca minus mieszkańcy); bez danych o miejscach cztery, jak dotąd */
export function freePlaces(i: Pick<GovInput, 'cap' | 'residents'>): number {
  if (i.cap === undefined) return 4;
  return Math.max(0, i.cap - (i.residents ?? 0));
}
