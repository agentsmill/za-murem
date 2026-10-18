/* Kafelki miasta: doczytywanie kafelków poza obszarem startowym, miejsca z nich i tło do rysowania mapy miasta
   (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Dwie warstwy danych miasta” i „Miejsca”).

   Okolica to `geo.poi` z zapisu (do 720 m, bez sieci). Reszta miasta doczytuje się dopiero przy oglądaniu mapy
   miasta: `KafelkiMiasta` pobiera kafelki OpenFreeMap przez wstrzyknięte `pobierz` (w grze `pobierzKafelek` z mvt.ts,
   w testach sztuczne), trzyma je w pamięci, dopóki wołający ich nie `zapomni`, i robi najwyżej 6 pobrań naraz. Błąd
   pobrania, wyjątek i uszkodzony kafelek dają `null` (nigdy wyjątek, nic na konsoli), a porażki nie zostają w pamięci,
   więc kolejne `daj` próbuje od nowa; kiedy ponawiać, rozstrzyga wołający. Pusty kafelek (204, 404) to kafelek bez
   warstw. Zdekodowany kafelek z=14 waży kilka MB: okno mapy (src/ui/miasto.ts) przerabia go na rysunek i miejsca, a potem
   woła `zapomnij`, więc pamięć trzyma okno, z własnym limitem. Kafelki spoza obszaru startowego nie trafiają do zapisu
   ani do stanu symulacji i zarządu: to tylko widok.

   `poiZKafelkow` zamienia warstwę poi kafelków poziomu 14 na surowe `GeoPoi` względem środka mapy, bez limitu promienia
   (toGeoT tnie do 720 m). Położenie liczy `rzutKafelka`, a kategorię, nazwę i klucz „poi:X:Y” `poiPunktu`, oba z mvt.ts
   i wspólne z toGeoT, więc ten sam sklep ma tu dokładnie to samo `k`, `x` i `y` co w świecie gry. Nazwy zostają z OSM:
   filtr imion (`nazwaDoOkolicy` z src/mieszkancy) robi wołający, a `miejscaZPoi` z miasto.ts składa z nich miejsca.
   Kafelek z innego poziomu niż 14 (pole `z`) jest pomijany, bo piksel jego punktu leży na innej siatce niż klucze.

   Tło mapy miasta: `rzutKafelkaZ` to wzór `rzutKafelka` dla kafelka dowolnego poziomu (dla z=14 wynik bit w bit ten
   sam), `kafelkiProstokata` mówi, które kafelki pokrywają prostokąt widoku, a `tloKafelka` oddaje odbiorcy wielokąty
   (woda, zieleń, las, zabudowa, budynki) i linie (rzeki, drogi, tory) w metrach od adresu: x na wschód, y na południe,
   bez obrotu świata, jak `geo` i `Miejsce`. Te dwie funkcje używają Math.cos i Merkatora z mvt.ts (sin, log, atan),
   jak geometria gry; to tylko rysowanie, nic z tego nie trafia do stanu symulacji ani zarządu.

   Bez PixiJS, bez `src/gov` i `src/sim`, bez Math.hypot: działa w Node, a sieć dochodzi tylko przez `pobierz`. */

import type { GeoPoi, Pt } from './geo.ts';
import type { LatLon } from './klucze.ts';
import {
  type DecodedTile,
  decode,
  lat2y,
  lon2x,
  poiPunktu,
  rzutKafelka,
  type TileFeature,
  tilesFor,
  WANT,
  x2lon,
  y2lat,
  Z,
} from './mvt.ts';

/** najwyżej tyle pobrań kafelków naraz */
const MAX_NARAZ = 6;

/** poziom kafelków dla tła całego miasta (woda, zieleń, drogi): kilka sztuk na miasto */
const Z_TLA = 12;
/** powyżej tylu metrów na piksel ekranu starcza tła z poziomu Z_TLA (punkt wyjścia, okno mapy może go dostroić) */
const PROG_M_NA_PIKSEL = 8;

/** Z jakiego poziomu brać kafelki przy danej skali widoku: powyżej 8 m/px niski poziom (12), inaczej 14. */
export function zKafelka(mNaPiksel: number): number {
  return mNaPiksel > PROG_M_NA_PIKSEL ? Z_TLA : Z;
}

/** Punkty sklepów i usług ze wszystkich kafelków poziomu 14 względem środka mapy c (szerokość, długość), bez limitu
    promienia: kolejność jak w toGeoT (kafelki po kolei, w kafelku cechy po kolei). Punkt leży w jednym kafelku (własny
    obszar bez bufora), więc kafelki sąsiednie nie powielają punktów. Wejścia nie zmienia. */
export function poiZKafelkow(tiles: readonly DecodedTile[], c: LatLon): GeoPoi[] {
  const rzut = rzutKafelka(c[0], c[1]);
  const out: GeoPoi[] = [];
  for (const T of tiles) {
    if (T.z !== undefined && T.z !== Z) continue;
    const warstwa = T.L.poi;
    if (!warstwa) continue;
    const E = warstwa.extent;
    for (const F of warstwa.features) {
      if (F.type !== 1 || !F.g) continue;
      for (const ring of F.g)
        for (const q of ring) {
          // własny obszar kafelka (bez bufora), jak w toGeoT
          if (!(q[0] >= 0 && q[0] < E && q[1] >= 0 && q[1] < E)) continue;
          const m = poiPunktu(F.tags, T, q, E);
          if (!m) continue;
          const [x, y] = rzut(T, E, q);
          out.push({ x, y, c: m.c, n: m.n, k: m.k });
        }
    }
  }
  return out;
}

/** Kafelki poziomu z pokrywające kwadrat o połowie boku promienM metrów wokół c (szerokość, długość): promień 0 to
    kafelek z punktem, a promień r pokrywa całe koło o promieniu r. Kafelki spoza świata (bieguny, południk 180) odpadają. */
export function kafelkiWokol(c: LatLon, promienM: number, z: number): [number, number][] {
  const n = 2 ** z;
  return tilesFor(c[0], c[1], promienM, z).filter(([x, y]) => x >= 0 && x < n && y >= 0 && y < n);
}

/** metry na stopień długości geograficznej na równiku i szerokości geograficznej, jak w rzutKafelka */
const M_NA_STOPIEN = 111320;
const M_NA_STOPIEN_SZER = 110574;
const pol = (v: number) => Math.round(v * 2) / 2;

/** Rzut punktu q (w jednostkach extent E) kafelka T dowolnego poziomu (pole `z`, brak to 14) na metry od środka mapy
    (lat0, lon0): wschód i południe, zaokrąglone do 0,5 m. Ten sam wzór co `rzutKafelka` z mvt.ts, tylko z poziomem
    z kafelka, więc dla z=14 daje dokładnie to samo; tło z=12 i budynki z=14 leżą w tym samym układzie co miejsca. */
export function rzutKafelkaZ(
  lat0: number,
  lon0: number,
): (T: Pick<DecodedTile, 'x' | 'y' | 'z'>, E: number, q: Pt) => Pt {
  const kx = M_NA_STOPIEN * Math.cos((lat0 * Math.PI) / 180);
  const ky = M_NA_STOPIEN_SZER;
  return (T, E, [px, py]) => {
    const n = 2 ** (T.z ?? Z);
    const lon = x2lon(T.x + px / E, n);
    const lat = y2lat(T.y + py / E, n);
    return [pol((lon - lon0) * kx), pol((lat0 - lat) * ky)];
  };
}

/** Kafelki poziomu z pokrywające prostokąt [x0, x1] × [y0, y1] w metrach od c (x na wschód, y na południe), wiersz po
    wierszu od północy; dla kwadratu wokół c to samo co `kafelkiWokol`. Kafelki spoza świata odpadają; odwrócony
    prostokąt i liczby nieskończone nie dają nic. */
export function kafelkiProstokata(
  c: LatLon,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
): [number, number][] {
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 < x0 || y1 < y0) return [];
  const [lat0, lon0] = c;
  const n = 2 ** z;
  const kx = M_NA_STOPIEN * Math.cos((lat0 * Math.PI) / 180);
  const tx0 = Math.max(0, Math.floor(lon2x(lon0 + x0 / kx, n)));
  const tx1 = Math.min(n - 1, Math.floor(lon2x(lon0 + x1 / kx, n)));
  const ty0 = Math.max(0, Math.floor(lat2y(lat0 - y0 / M_NA_STOPIEN_SZER, n)));
  const ty1 = Math.min(n - 1, Math.floor(lat2y(lat0 - y1 / M_NA_STOPIEN_SZER, n)));
  const out: [number, number][] = [];
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) out.push([x, y]);
  return out;
}

/** Rodzaj pola na mapie miasta: zabudowa (osiedla, przemysł, usługi), zieleń (trawa, parki, cmentarze, boiska), las,
    woda i budynki. */
export type KlasaPola = 'zabudowa' | 'zielen' | 'las' | 'woda' | 'budynek';
/** Rodzaj linii: rzeka, strumień, tory, ścieżka, ulica, droga średnia (secondary, tertiary) i główna. */
export type KlasaLinii = 'rzeka' | 'strumien' | 'tory' | 'sciezka' | 'ulica' | 'srednia' | 'glowna';

/** Odbiorca tła z `tloKafelka`: pierścień wielokąta (zewnętrzny albo dziura, kierunek jak w kafelku, więc wypełnienie
    „nonzero” robi dziury) i linia, w metrach od adresu. */
export interface OdbiorcaTla {
  pole(k: KlasaPola, ring: Pt[]): void;
  linia(k: KlasaLinii, line: Pt[]): void;
}

/** klasy dróg OpenMapTiles na linie mapy miasta; reszta (prom, budowy, wyciągi) odpada */
const DROGI: Readonly<Record<string, KlasaLinii>> = {
  motorway: 'glowna',
  trunk: 'glowna',
  primary: 'glowna',
  secondary: 'srednia',
  tertiary: 'srednia',
  minor: 'ulica',
  service: 'ulica',
  busway: 'ulica',
  raceway: 'ulica',
  track: 'sciezka',
  path: 'sciezka',
  rail: 'tory',
  transit: 'tory',
};
/** cieki wodne; rowy i dreny odpadają */
const CIEKI: Readonly<Record<string, KlasaLinii>> = { river: 'rzeka', canal: 'rzeka', stream: 'strumien' };
/** klasy `landuse` rysowane jako zieleń i jako zabudowa; reszta (rolnicze, puste) zostaje tłem */
const LANDUSE_ZIELEN = new Set(['cemetery', 'pitch', 'stadium', 'playground', 'track', 'zoo', 'theme_park']);
const LANDUSE_ZABUDOWA = new Set([
  'residential',
  'commercial',
  'industrial',
  'retail',
  'railway',
  'garages',
  'suburb',
  'neighbourhood',
  'quarter',
  'education',
  'school',
  'university',
  'college',
  'hospital',
  'kindergarten',
  'library',
  'religious',
  'bus_station',
  'military',
]);

function klasaPola(warstwa: string, F: TileFeature): KlasaPola | null {
  const c = F.tags.class as string | undefined;
  if (warstwa === 'water') return 'woda';
  if (warstwa === 'park') return 'zielen';
  // część budynku nad ziemią (render_min_height) leży na obrysie innej części
  if (warstwa === 'building') return (F.tags.render_min_height as number) > 0 ? null : 'budynek';
  if (warstwa === 'landcover') return c === 'wood' ? 'las' : c === 'grass' || c === 'wetland' ? 'zielen' : null;
  if (warstwa === 'landuse')
    return c && LANDUSE_ZIELEN.has(c) ? 'zielen' : c && LANDUSE_ZABUDOWA.has(c) ? 'zabudowa' : null;
  return null;
}

function klasaLinii(warstwa: string, F: TileFeature): KlasaLinii | null {
  // tunele są pod ziemią: na mapie z góry ich nie widać
  if (F.tags.brunnel === 'tunnel') return null;
  const c = F.tags.class as string;
  if (warstwa === 'transportation') return Object.hasOwn(DROGI, c) ? DROGI[c] : null;
  if (warstwa === 'waterway') return Object.hasOwn(CIEKI, c) ? CIEKI[c] : null;
  return null;
}

/** Tło mapy miasta z kafelka T (dowolny poziom): wielokąty i linie po rzucie `rzut` (z `rzutKafelkaZ`) do odbiorcy, cecha
    po cesze, z buforem kafelka (sąsiednie kafelki zachodzą na siebie w tym samym kolorze, więc nic nie przycina).
    Punkty (sklepy, nazwy), tunele, części budynków nad ziemią, pola w warstwie dróg i nieznane klasy odpadają. */
export function tloKafelka(T: DecodedTile, rzut: ReturnType<typeof rzutKafelkaZ>, o: OdbiorcaTla): void {
  for (const warstwa in T.L) {
    const L = T.L[warstwa];
    const E = L.extent;
    for (const F of L.features) {
      if (!F.g) continue;
      if (F.type === 3) {
        const k = klasaPola(warstwa, F);
        if (!k) continue;
        for (const ring of F.g)
          if (ring.length >= 3)
            o.pole(
              k,
              ring.map((q) => rzut(T, E, q)),
            );
      } else if (F.type === 2) {
        const k = klasaLinii(warstwa, F);
        if (!k) continue;
        for (const line of F.g)
          if (line.length >= 2)
            o.linia(
              k,
              line.map((q) => rzut(T, E, q)),
            );
      }
    }
  }
}

/** Pamięć kafelków miasta (do `zapomnij`) z ograniczeniem liczby pobrań naraz. */
export class KafelkiMiasta {
  private readonly pobierz: (z: number, x: number, y: number) => Promise<Uint8Array | null>;
  /** udane (i trwające) pobrania po „z/x/y”: równoległe `daj` tego samego kafelka dzielą jedno pobranie */
  private readonly pamiec = new Map<string, Promise<DecodedTile | null>>();
  private wolne = MAX_NARAZ;
  private readonly czeka: (() => void)[] = [];

  constructor(pobierz: (z: number, x: number, y: number) => Promise<Uint8Array | null>) {
    this.pobierz = pobierz;
  }

  /** Kafelek (z, x, y): z pamięci albo z jednego pobrania. `null`, gdy pobranie zawiodło albo kafelka nie da się
      odczytać; taka porażka nie zostaje w pamięci. */
  daj(z: number, x: number, y: number): Promise<DecodedTile | null> {
    const klucz = `${z}/${x}/${y}`;
    let w = this.pamiec.get(klucz);
    if (!w) {
      const nowe: Promise<DecodedTile | null> = this.wczytaj(z, x, y).then((t) => {
        // porażka kasuje tylko swój wpis: po `zapomnij` i nowym `daj` w pamięci może już być inne pobranie
        if (!t && this.pamiec.get(klucz) === nowe) this.pamiec.delete(klucz);
        return t;
      });
      w = nowe;
      this.pamiec.set(klucz, w);
    }
    return w;
  }

  /** Zwalnia kafelek (z, x, y) z pamięci: następne `daj` pobierze go od nowa. Pobranie w toku kończy się normalnie dla
      tych, którzy już na nie czekają. Nieznany kafelek: nic. */
  zapomnij(z: number, x: number, y: number): void {
    this.pamiec.delete(`${z}/${x}/${y}`);
  }

  /** Kafelki poziomu z pokrywające kwadrat wokół c (kolejność jak `kafelkiWokol`): te, które się udało dostać, i
      liczba brakujących. Pobiera najwyżej 6 naraz, resztę kolejkuje. */
  async dajObszar(c: LatLon, promienM: number, z: number): Promise<{ tiles: DecodedTile[]; brak: number }> {
    const wyniki = await Promise.all(kafelkiWokol(c, promienM, z).map(([x, y]) => this.daj(z, x, y)));
    const tiles = wyniki.filter((t): t is DecodedTile => t !== null);
    return { tiles, brak: wyniki.length - tiles.length };
  }

  private async wczytaj(z: number, x: number, y: number): Promise<DecodedTile | null> {
    await this.zajmij();
    let bajty: Uint8Array | null;
    try {
      bajty = await this.pobierz(z, x, y);
    } catch {
      bajty = null;
    } finally {
      this.zwolnij();
    }
    if (!bajty) return null;
    try {
      return { x, y, z, L: bajty.length ? decode(bajty, WANT) : {} };
    } catch {
      return null;
    }
  }

  /** Zajmuje miejsce na jedno pobranie; gdy wszystkie 6 jest zajętych, czeka w kolejce (po kolei). */
  private async zajmij(): Promise<void> {
    if (this.wolne > 0) {
      this.wolne--;
      return;
    }
    await new Promise<void>((dalej) => this.czeka.push(dalej));
  }

  /** Oddaje miejsce: następny w kolejce dostaje je od razu, inaczej wraca do puli. */
  private zwolnij(): void {
    const nastepny = this.czeka.shift();
    if (nastepny) nastepny();
    else this.wolne++;
  }
}
