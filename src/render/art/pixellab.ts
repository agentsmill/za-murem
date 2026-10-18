/* Grafika z PixelLab (kotwica stylu zatwierdzona 18.10.2026): opis atlasów z public/assets (składa je
   tools/atlasy.ts z assets/raw) i czyste funkcje, które rysują z nich teren i bloki w kawałkach mapy.
   Działa w głównym wątku, w workerze i w Node. Bez atlasów gra rysuje wszystko kodem jak dawniej. */

import { T } from '../../world/terrain.ts';
import type { Sprite } from './bryly.ts';
import { h2 } from './hash.ts';
import { type ThingSpec, thingSprite } from './rzeczy.ts';

/** wersja formatu grafika.json; gra nie bierze atlasów w innej wersji */
export const WERSJA_GRAFIKI = 1;

/** opis atlasów w public/assets/grafika.json (prostokąty w pikselach plików atlasów) */
export interface OpisGrafiki {
  wersja: number;
  zrodlo: string;
  /** 16 kafelków Wanga 4×4: kafelek o narożnikach NW NE SW SE (bity od najstarszego, 1 = trawnik) o numerze k
      leży w kolumnie k % 4 i wierszu k >> 2 */
  teren: { id: string; plik: string; kafel: number };
  /** moduły bloku: wiersze [y, h] gzymsu z górnym piętrem, środkowego piętra (powtarzane) i parteru z cokołem,
      kolumny [x, w] wejścia (drzwi w kolumnie drzwi) i przęseł, profil attyki [x, n] od zewnątrz do środka */
  blok: {
    id: string;
    plik: string;
    gora: [number, number];
    srodek: [number, number];
    dol: [number, number];
    wejscie: [number, number];
    drzwi: number;
    przesla: [number, number];
    attyka: [number, number];
  };
  /** papa: tło z szumem (ciemne i jasne piksele) i szwami co szwy [x, y] px, rzadkie naklejki naklejka × naklejka
      w jednym rzędzie (gestosc: część kafelków dachu z naklejką) */
  dach: {
    id: string;
    plik: string;
    tlo: string;
    ciemny: string;
    jasny: string;
    szwy: [number, number];
    naklejka: number;
    naklejek: number;
    gestosc: number;
  };
  /** trzepak od frontu: stopy to wiersz pod stopami, podstawa to wiersz kafelka, na którym stoją stopy */
  trzepak: { id: string; plik: string; stopy: number; podstawa: number };
  /** obsada: wiersz na postać, w nim wersje (oryginał i przemalowania) po kierunki, klatki klatka × klatka */
  ludzie: {
    plik: string;
    klatka: number;
    kierunki: string[];
    wersje: string[];
    postacie: { id: string; co: string; zarzad: boolean; stopy: number }[];
  };
}

/** obraz z atlasu: piksele jak w ImageData czytanym przez Uint32Array (0xAABBGGRR), alfa tylko 0 albo 255 */
export interface Obraz {
  w: number;
  h: number;
  px: Uint32Array;
}

export interface Teren {
  img: Obraz;
}

export type Blok = Omit<OpisGrafiki['blok'], 'id' | 'plik'> & { img: Obraz };

export interface Dach {
  img: Obraz;
  /** kolory 0xRRGGBB */
  tlo: number;
  ciemny: number;
  jasny: number;
  szwy: [number, number];
  /** bok naklejki i ile ich jest w rzędzie */
  size: number;
  n: number;
  gestosc: number;
}

export interface Trzepak {
  img: Obraz;
  stopy: number;
  podstawa: number;
}

/** grafika do kawałków mapy (idzie do workerów razem ze sceną) */
export interface GrafikaKawalkow {
  teren: Teren | null;
  blok: Blok | null;
  dach: Dach | null;
}

/** grafika z PixelLab w grze; każda część osobno może jej nie mieć (wtedy ta część jest z kodu) */
export interface Grafika extends GrafikaKawalkow {
  trzepak: Trzepak | null;
}

const hex = (c: string) => Number.parseInt(c.slice(1), 16);

/** grafika z opisu i obrazków (obraz(plik) albo null, gdy pliku nie ma); w innej wersji opisu null */
export function grafikaZ(opis: OpisGrafiki, obraz: (plik: string) => Obraz | null): Grafika | null {
  if (opis.wersja !== WERSJA_GRAFIKI) return null;
  const teren = obraz(opis.teren.plik);
  const blok = obraz(opis.blok.plik);
  const dach = obraz(opis.dach.plik);
  const trzepak = obraz(opis.trzepak.plik);
  const { id: _b, plik: _p, ...moduly } = opis.blok;
  const d = opis.dach;
  return {
    teren: teren && { img: teren },
    blok: blok && { ...moduly, img: blok },
    dach: dach && {
      img: dach,
      tlo: hex(d.tlo),
      ciemny: hex(d.ciemny),
      jasny: hex(d.jasny),
      szwy: d.szwy,
      size: d.naklejka,
      n: d.naklejek,
      gestosc: d.gestosc,
    },
    trzepak: trzepak && { img: trzepak, stopy: opis.trzepak.stopy, podstawa: opis.trzepak.podstawa },
  };
}

/** kolor 0xRRGGBB piksela obrazu */
function rgbAt(o: Obraz, x: number, y: number): number {
  const p = o.px[y * o.w + x];
  return ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff);
}

// ---------------------------------------------------------------- teren

/** klasa terenu w narożniku kafelka Wanga: 1 trawnik (trawa, park, las), 0 chodnik i cała reszta (jezdnia,
    budynek, woda); poza mapą jak na jej brzegu */
export function wangKlasa(terr: ArrayLike<number>, size: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= size ? size - 1 : x;
  const cy = y < 0 ? 0 : y >= size ? size - 1 : y;
  const t = terr[cy * size + cx];
  return t === T.GRASS || t === T.PARK || t === T.WOOD ? 1 : 0;
}

/** czy teren o tym kodzie rysuje się z kafelków Wanga (trawnik, park, chodnik, ścieżka); reszta zostaje z kodu */
export const wangRysuje = (t: number): boolean => t === T.GRASS || t === T.PARK || t === T.SIDEWALK || t === T.PATH;

/** numer kafelka Wanga o narożniku NW w środku kafelka świata (x, y): narożniki NW NE SW SE od najstarszego bitu */
function wangNumer(terr: ArrayLike<number>, size: number, x: number, y: number): number {
  return (
    (wangKlasa(terr, size, x, y) << 3) |
    (wangKlasa(terr, size, x + 1, y) << 2) |
    (wangKlasa(terr, size, x, y + 1) << 1) |
    wangKlasa(terr, size, x + 1, y + 1)
  );
}

/**
 * Cztery kafelki Wanga nad kafelkiem świata (x, y), po ćwiartkach NW NE SW SE: numer | odbicie << 4. Kafelki Wanga
 * leżą na podwójnej siatce, przesunięte o pół kafelka: ich narożniki wypadają w środkach kafelków świata, więc
 * granica terenów leży na krawędzi kafelka świata. Jednolity kafelek (sam trawnik albo sam chodnik) jest odbity
 * w poziomie (bit 1) i w pionie (bit 2) według miejsca, żeby nie było widać powtórzeń.
 */
export function wangKafel(terr: ArrayLike<number>, size: number, x: number, y: number): Int32Array {
  const q = new Int32Array(4);
  for (let k = 0; k < 4; k++) {
    const wx = x - 1 + (k & 1);
    const wy = y - 1 + (k >> 1);
    const n = wangNumer(terr, size, wx, wy);
    const f = n === 0 || n === 15 ? Math.floor(h2(wx, wy, 4242) * 4) : 0;
    q[k] = n | (f << 4);
  }
  return q;
}

/** kolor 0xRRGGBB terenu w punkcie (px, py) kafelka świata z jego kafelkami Wanga (wangKafel) */
export function wangPiksel(t: Teren, q: Int32Array, px: number, py: number): number {
  const k = (px < 16 ? 0 : 1) | (py < 16 ? 0 : 2);
  const n = q[k] & 15;
  const f = q[k] >> 4;
  const u = px < 16 ? px + 16 : px - 16;
  const v = py < 16 ? py + 16 : py - 16;
  return rgbAt(t.img, (n & 3) * 32 + (f & 1 ? 31 - u : u), (n >> 2) * 32 + (f & 2 ? 31 - v : v));
}

/** kolor terenu z kafelków Wanga w punkcie (px, py) kafelka świata (x, y) */
export const wangKolor = (
  t: Teren,
  terr: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  px: number,
  py: number,
): number => wangPiksel(t, wangKafel(terr, size, x, y), px, py);

// ---------------------------------------------------------------- blok z modułów

/** wiersze atlasu bloku od góry do dołu pasa fasady o tylu piętrach: gzyms z górnym piętrem, środkowe piętra,
    parter z cokołem; parterowy ma sam gzyms nad parterem */
export function pasFasady(b: Blok, levels: number): number[] {
  const rows: number[] = [];
  const take = (y0: number, n: number) => {
    for (let r = 0; r < n; r++) rows.push(y0 + r);
  };
  take(b.gora[0], levels > 1 ? b.gora[1] : b.gora[1] - b.srodek[1]);
  for (let n = 0; n < levels - 2; n++) take(b.srodek[0], b.srodek[1]);
  take(b.dol[0], b.dol[1]);
  return rows;
}

/** kolumna atlasu bloku w punkcie ax fasady (piksele świata): moduł wejścia, gdy ax leży nad drzwiami o środku
    doorX (NaN: bez drzwi), inaczej przęsło powtarzane po x świata */
export function kolumnaFasady(b: Blok, ax: number, doorX: number): number {
  const d = ax - (doorX - b.drzwi);
  if (d >= 0 && d < b.wejscie[1]) return b.wejscie[0] + d;
  const w = b.przesla[1];
  return b.przesla[0] + (((ax % w) + w) % w);
}

/** kolor 0xRRGGBB modułu bloku w kolumnie i wierszu atlasu */
export const blokKolor = (b: Blok, x: number, y: number): number => rgbAt(b.img, x, y);

/** kolor attyki w odległości e od krawędzi dachu (0 = sama krawędź, mniej niż b.attyka[1]) */
export const attykaKolor = (b: Blok, e: number): number => rgbAt(b.img, b.attyka[0], e);

/** kolor 0xRRGGBB papy w punkcie dachu (piksele świata): rzadka naklejka w kafelku 32 px (miejsce i rodzaj
    z kafelka), szwy arkuszy, poza nimi tło z rzadkimi ciemnymi i jasnymi pikselami */
export function papaKolor(d: Dach, ax: number, ay: number): number {
  const cx = ax >> 5;
  const cy = ay >> 5;
  if (h2(cx, cy, 2) < d.gestosc) {
    const room = 32 - d.size + 1;
    const qx = (ax & 31) - Math.floor(h2(cx, cy, 4) * room);
    const qy = (ay & 31) - Math.floor(h2(cx, cy, 5) * room);
    if (qx >= 0 && qy >= 0 && qx < d.size && qy < d.size) {
      const x = Math.floor(h2(cx, cy, 3) * d.n) * d.size + qx;
      if (d.img.px[qy * d.img.w + x] >>> 24) return rgbAt(d.img, x, qy);
    }
  }
  if (ax % d.szwy[0] === 0 || ay % d.szwy[1] === 0) return d.ciemny;
  const r = h2(ax, ay, 6);
  return r < 0.025 ? d.ciemny : r < 0.05 ? d.jasny : d.tlo;
}

// ---------------------------------------------------------------- trzepak

/** trzepak z PixelLab jako sprite rzeczy 3×1 (rzeczy.ts): kotwica w środku dolnej krawędzi podstawy, stopy
    w wierszu podstawy kafelka jak betonowe stopy trzepaka z kodu */
export function trzepakSprite(t: Trzepak): Sprite {
  const px = Uint32Array.from(t.img.px, (p) => (p >>> 24 ? p : 0));
  return { w: t.img.w, h: t.img.h, ax: t.img.w / 2, ay: t.stopy + 32 - t.podstawa, px };
}

/** sprite rzeczy na mapie: trzepak od frontu (3×1, rot 0 i 2) z PixelLab, gdy jest grafika; trzepak bokiem
    (1×3, PixelLab dał tylko widok od frontu) i wszystkie inne rzeczy z kodu (rzeczy.ts) */
export function rzeczSprite(spec: ThingSpec, g: Grafika | null): Sprite {
  if (spec.kind === 'trzepak' && g?.trzepak && !(spec.rot & 1)) return trzepakSprite(g.trzepak);
  return thingSprite(spec);
}
