/* Kafelki miasta: doczytywanie kafelków poza obszarem startowym i miejsca z nich
   (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Dwie warstwy danych miasta” i „Miejsca”).

   Okolica to `geo.poi` z zapisu (do 720 m, bez sieci). Reszta miasta doczytuje się dopiero przy oglądaniu mapy
   miasta: `KafelkiMiasta` pobiera kafelki OpenFreeMap przez wstrzyknięte `pobierz` (w grze `pobierzKafelek` z mvt.ts,
   w testach sztuczne), trzyma je w pamięci na czas sesji i robi najwyżej 6 pobrań naraz. Błąd pobrania, wyjątek
   i uszkodzony kafelek dają `null` (nigdy wyjątek, nic na konsoli), a porażki nie zostają w pamięci, więc kolejne
   `daj` próbuje od nowa; kiedy ponawiać, rozstrzyga wołający. Pusty kafelek (204, 404) to kafelek bez warstw.
   Kafelki spoza obszaru startowego nie trafiają do zapisu ani do stanu symulacji i zarządu: to tylko widok.

   `poiZKafelkow` zamienia warstwę poi kafelków poziomu 14 na surowe `GeoPoi` względem środka mapy, bez limitu promienia
   (toGeoT tnie do 720 m). Położenie liczy `rzutKafelka`, a kategorię, nazwę i klucz „poi:X:Y” `poiPunktu`, oba z mvt.ts
   i wspólne z toGeoT, więc ten sam sklep ma tu dokładnie to samo `k`, `x` i `y` co w świecie gry. Nazwy zostają z OSM:
   filtr imion (`nazwaDoOkolicy` z src/mieszkancy) robi wołający, a `miejscaZPoi` z miasto.ts składa z nich miejsca.
   Kafelek z innego poziomu niż 14 (pole `z`) jest pomijany, bo piksel jego punktu leży na innej siatce niż klucze.

   Bez PixiJS, bez `src/gov` i `src/sim`, bez Math.hypot, sin i cos: działa w Node, a sieć dochodzi tylko przez `pobierz`. */

import type { GeoPoi } from './geo.ts';
import type { LatLon } from './klucze.ts';
import { type DecodedTile, decode, poiPunktu, rzutKafelka, tilesFor, WANT, Z } from './mvt.ts';

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

/** Pamięć kafelków miasta na czas sesji z ograniczeniem liczby pobrań naraz. */
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
      w = this.wczytaj(z, x, y).then((t) => {
        if (!t) this.pamiec.delete(klucz);
        return t;
      });
      this.pamiec.set(klucz, w);
    }
    return w;
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
