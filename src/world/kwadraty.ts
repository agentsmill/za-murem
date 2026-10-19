/* Układ kwadratów miasta (projekt docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md, etap 1).
   Świat gry to kwadrat 384 m wokół adresu, obrócony do ścian domu. Miasto składa się z takich kwadratów na jednej
   siatce: kwadrat (sx, sy) leży o sx·bok na wschód i sy·bok na południe od domu w UKŁADZIE OBRÓCONYM (tym, w którym stoi
   siatka kafelków świata), a dom to (0, 0). Kwadrat (sx, sy) zajmuje globalne kafelki od sx·bok do sx·bok + bok − 1
   (tak samo y, y na południe). Moduł zna tylko układ i jego przeliczenia: nie importuje PixiJS, symulacji ani zarządu
   i niczego nie pobiera z sieci.

   Układ (`Uklad`): środek `c` ([lat, lon], jak geo.c), kąt obrotu `kat` (radiany, jak World.angle i rotateGeo) i bok.
   Współrzędne w `Geo` są w metrach od adresu BEZ obrotu (x na wschód, y na południe). `srodekKwadratu` daje środek
   kwadratu w tych współrzędnych, czyli cofa obrót, który rotateGeo robi przy budowie świata. Funkcje trygonometryczne
   są tu tylko po to, żeby odwrócić dokładnie ten sam obrót co rotateGeo; od nich nie zależy żadna decyzja symulacji,
   a odległości liczy się przez Math.sqrt.

   `kafelkiKwadratu` to kafelki OpenFreeMap z=14 do pobrania dla kwadratu: w promieniu 720 m od jego środka, tak samo
   jak dom pobiera je wokół adresu (load() w mvt.ts), więc klucze budynków liczą się z tych samych całych budowli.
   Dla domu to dokładnie kafelki, które i tak pobiera gra. */

import type { Geo, Pt } from './geo.ts';
import { tilesFor } from './mvt.ts';
import { dominantAngle } from './rotate.ts';
import type { World } from './world.ts';

/** bok kwadratu w metrach (kafelkach), jak SIZE w world.ts (test pilnuje zgodności) */
export const BOK_KWADRATU = 384;
/** promień pobierania kafelków wokół środka kwadratu: tak jak dom wokół adresu (load() w mvt.ts) */
export const PROMIEN_KAFELKOW = 720;
/** metry na stopień geograficzny, jak w geometrii gry (toGeoT, rzutKafelka) */
const M_NA_STOPIEN_SZER = 110574;
const M_NA_STOPIEN_DL = 111320;

export interface Uklad {
  /** środek układu, czyli adres: [lat, lon] jak geo.c */
  c: [number, number];
  /** obrót siatki względem północy w radianach, jak World.angle */
  kat: number;
  /** bok kwadratu w metrach (384) */
  bok: number;
}

/** bez minus zera: wyniki trafiają do porównań i kluczy */
const nz = (v: number) => (v === 0 ? 0 : v);

/** Układ domu z gotowego świata: środek z geo, kąt i bok ze świata. */
export function ukladDomu(geo: Pick<Geo, 'c'>, w: Pick<World, 'angle' | 'size'>): Uklad {
  return { c: [geo.c[0], geo.c[1]], kat: w.angle, bok: w.size };
}

/** Układ domu bez budowania świata: kąt liczony tak jak w buildWorld (dominantAngle po budynkach domu), więc taki sam
    jak World.angle tego geo. Dla narzędzi i testów, które nie mają świata domu. */
export function ukladZGeo(geo: Geo, bok: number = BOK_KWADRATU): Uklad {
  return { c: [geo.c[0], geo.c[1]], kat: dominantAngle(geo, bok / 2), bok };
}

/** klucz kwadratu: „sx,sy” */
export const kluczKwadratu = (sx: number, sy: number): string => `${sx},${sy}`;

/** kwadrat z klucza „sx,sy”; zły klucz to błąd */
export function zKlucza(k: string): [number, number] {
  const m = /^(-?\d+),(-?\d+)$/.exec(k);
  if (!m) throw new Error(`zły klucz kwadratu: „${k}”`);
  return [nz(Number(m[1])), nz(Number(m[2]))];
}

/** Środek kwadratu (sx, sy) w metrach od adresu w układzie NIEobróconym, czyli tym, w którym są współrzędne `Geo`.
    W układzie obróconym środek leży w (sx·bok, sy·bok); cofamy obrót, który rotateGeo robi o kąt układu. */
export function srodekKwadratu(u: Uklad, sx: number, sy: number): Pt {
  const c = Math.cos(u.kat);
  const s = Math.sin(u.kat);
  const x = sx * u.bok;
  const y = sy * u.bok;
  return [nz(x * c + y * s), nz(y * c - x * s)];
}

/** Kafelki z=14 w promieniu 720 m od środka kwadratu, wiersz po wierszu od północy (jak tilesFor). Środek w metrach
    przechodzi na szerokość i długość geograficzną tym samym wzorem co rzutKafelka (stałe 111320·cos(lat0) i 110574). */
export function kafelkiKwadratu(u: Uklad, sx: number, sy: number): [number, number][] {
  const [x, y] = srodekKwadratu(u, sx, sy);
  const [lat0, lon0] = u.c;
  const kx = M_NA_STOPIEN_DL * Math.cos((lat0 * Math.PI) / 180);
  return tilesFor(lat0 - y / M_NA_STOPIEN_SZER, lon0 + x / kx, PROMIEN_KAFELKOW);
}

/** Ośmiu sąsiadów kwadratu (sx, sy) w stałej kolejności: N, NE, E, SE, S, SW, W, NW (y rośnie na południe). */
export function sasiedzi8(sx: number, sy: number): [number, number][] {
  return [
    [sx, sy - 1],
    [sx + 1, sy - 1],
    [sx + 1, sy],
    [sx + 1, sy + 1],
    [sx, sy + 1],
    [sx - 1, sy + 1],
    [sx - 1, sy],
    [sx - 1, sy - 1],
  ];
}
