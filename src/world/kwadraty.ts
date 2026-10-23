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
   Dla domu to dokładnie kafelki, które i tak pobiera gra. `seedKwadratu` daje ziarno kwadratu poza domem (drzewa, wraki):
   dom używa ziarna gry wprost, więc jego świat się nie zmienia. `czytajKwadraty` zamienia parametr adresu ?kwadraty=
   (do zrzutów i pomiarów) na listę kwadratów obok domu. */

import { hashString } from '../core/rng.ts';
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

/** kwadrat z klucza „sx,sy” w postaci, jaką daje kluczKwadratu (bez zer wiodących, plusa i minus zera); inny klucz to błąd */
export function zKlucza(k: string): [number, number] {
  const m = /^(0|-?[1-9]\d*),(0|-?[1-9]\d*)$/.exec(k);
  if (!m) throw new Error(`zły klucz kwadratu: „${k}”`);
  return [Number(m[1]), Number(m[2])];
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

/** Ziarno kwadratu poza domem: skrót (hashString) z napisu „ziarno:sx:sy” jako liczba całkowita bez znaku. */
export function seedKwadratu(seed: number, sx: number, sy: number): number {
  return Number.parseInt(hashString(`${seed}:${sx}:${sy}`), 16);
}

/** Budynki kwadratu (sx, sy) sąsiadujące kafelkami przez szew z budynkami domu: numer budynku kwadratu → numer budynku
    domu. To ten sam budynek po dwóch stronach granicy (dwa kawałki jednej budowli), więc kawałek sąsiada bierze od domu
    to, czego dom nie może zmienić (poziomy, styl). Sąsiadują kafelki leżące obok siebie przez granicę: wzdłuż boku dla
    czterech kwadratów obok domu, przez róg dla czterech narożnych; dalsze kwadraty nie mają szwu z domem (pusta mapa).
    Budynek kwadratu, który dotyka dwóch budynków domu, dostaje pierwszy napotkany od północy i zachodu. Dwa różne
    budynki tuż przy granicy, które się stykają, uchodzą za jeden (rzadkie i nieszkodliwe). */
export function budynkiZDomem(
  dom: Pick<World, 'size' | 'bid'>,
  w: Pick<World, 'size' | 'bid'>,
  sx: number,
  sy: number,
): Map<number, number> {
  const out = new Map<number, number>();
  if ((sx === 0 && sy === 0) || Math.abs(sx) > 1 || Math.abs(sy) > 1) return out;
  const n = dom.size;
  const para = (iw: number, id: number) => {
    const bw = w.bid[iw];
    const bd = dom.bid[id];
    if (bw >= 0 && bd >= 0 && !out.has(bw)) out.set(bw, bd);
  };
  if (sx !== 0 && sy !== 0) {
    const x = sx > 0 ? 0 : n - 1;
    const y = sy > 0 ? 0 : n - 1;
    para(y * n + x, (n - 1 - y) * n + (n - 1 - x));
  } else if (sy === 0) {
    const x = sx > 0 ? 0 : n - 1;
    for (let y = 0; y < n; y++) para(y * n + x, y * n + (n - 1 - x));
  } else {
    const y = sy > 0 ? 0 : n - 1;
    for (let x = 0; x < n; x++) para(y * n + x, (n - 1 - y) * n + x);
  }
  return out;
}

/** najwięcej kwadratów obok domu z parametru adresu (siedem na siedem bez domu); dalej to już sprawa wydajności (etap 5) */
export const MAX_KWADRATOW = 48;
/** najdalszy kwadrat od domu w każdą stronę (spec: do 16 kwadratów, czyli około 6 km) */
const MAX_ODLEGLOSC = 16;

/**
 * Kwadraty obok domu z parametru adresu ?kwadraty=:
 * - „3x3”, „5x5”, „7x7” (nieparzysty kwadrat siatki z domem pośrodku): wszystkie kwadraty poza domem, pierścień po
 *   pierścieniu od domu na zewnątrz, w każdym od kwadratu na północ od domu zgodnie z ruchem zegara (dla 3x3 to
 *   sasiedzi8: N, NE, E, SE, S, SW, W, NW);
 * - lista par „sx,sy” rozdzielonych średnikami, np. „1,0;0,-1”, w podanej kolejności;
 * bez domu (0, 0) i bez powtórzeń. Puste, błędne (zła para, parzysty albo niekwadratowy wymiar, za duża siatka,
 * kwadrat dalej niż 16 od domu, więcej niż MAX_KWADRATOW) i brak parametru dają pustą listę.
 */
export function czytajKwadraty(param: string | null): [number, number][] {
  if (!param) return [];
  const rozmiar = /^(\d+)[xX](\d+)$/.exec(param.trim());
  if (rozmiar) {
    const n = Number(rozmiar[1]);
    if (n !== Number(rozmiar[2]) || n % 2 === 0 || n < 3) return [];
    const out: [number, number][] = [];
    for (let r = 1; r <= (n - 1) / 2; r++) {
      // pierścień r zgodnie z ruchem zegara od (0, −r): górny bok w prawo, prawy w dół, dolny w lewo, lewy w górę
      for (let x = 0; x <= r; x++) out.push([x, -r]);
      for (let y = -r + 1; y <= r; y++) out.push([r, y]);
      for (let x = r - 1; x >= -r; x--) out.push([x, r]);
      for (let y = r - 1; y >= -r; y--) out.push([-r, y]);
      for (let x = -r + 1; x < 0; x++) out.push([x, -r]);
    }
    return out.length <= MAX_KWADRATOW ? out : [];
  }
  const out: [number, number][] = [];
  const widziane = new Set<string>();
  for (const el of param.split(';')) {
    const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(el);
    if (!m) return [];
    const sx = Number(m[1]);
    const sy = Number(m[2]);
    if (Math.abs(sx) > MAX_ODLEGLOSC || Math.abs(sy) > MAX_ODLEGLOSC) return [];
    const k = kluczKwadratu(sx, sy);
    if ((sx === 0 && sy === 0) || widziane.has(k)) continue;
    widziane.add(k);
    out.push([sx, sy]);
  }
  return out.length <= MAX_KWADRATOW ? out : [];
}
