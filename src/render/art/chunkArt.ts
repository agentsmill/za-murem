/* Rysowanie kawałka mapy (32×32 kafelki) do płótna: teren, cienie, dachy i fasady liczone
   piksel po pikselu, potem drzewa i detale dachów. Ta sama funkcja daje dwa poziomy szczegółów:
   32 px na kafelek (z bliska) i 8 px na kafelek (z daleka). Z grafiką z PixelLab (scena.art) trawnik
   i chodnik idą z kafelków Wanga, a bloki z modułów kawałka bloku (pixellab.ts); reszta zawsze z kodu.
   Kwadrat miasta obok domu (scena z `poczatek` i `brzeg`, zob. scene.ts i szew.ts) rysuje się tak, jakby leżał w jednej
   scenie z sąsiadami: szum, wzory fasad i dachów liczą się od współrzędnych miasta (początek kwadratu w pikselach),
   krawężniki, cienie terenu i kafelki Wanga przy krawędzi patrzą na teren sąsiada, a budynek przecięty szwem nie ma
   w tym miejscu attyki, krawędzi dachu ani fasady (ciągnie się dalej u sąsiada), a rząd kominów i anteny liczą się z ramki
   całego budynku (WorldBuilding.ramka), więc kawałki po obu stronach szwu mają jeden rząd. Współrzędne miasta są ujemne w kwadratach
   na zachód i północ od domu, więc wzory z resztą z dzielenia (okna, linie parkingu, pasy blachy, rzędy upraw) liczą ją
   funkcją `mod` (zawsze nieujemna), a nie `%`. Bez tych pól rysunek jest taki jak zawsze. */

import type { DamageKind } from '../../world/apts.ts';
import { T, type Tree } from '../../world/world.ts';
import { describeTile, IN } from '../section.ts';
import { type AnyCanvas, type Ctx2D, ctx2d, newCanvas } from './canvas.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, rgba, shade } from './palette.ts';
import {
  attykaKolor,
  type BudynekGrafika,
  blokKolor,
  dachProbkaKolor,
  kolumnaFasady,
  papaKolor,
  pasFasady,
  wangKafel,
  wangPiksel,
  wangRysuje,
} from './pixellab.ts';
import { deadTreeSprite } from './rzeczy.ts';
import { type ArtBuilding, type BStyle, CHUNK, type ChunkScene, SUB, TILE } from './scene.ts';
import { stropKolor } from './strop.ts';
import { wearColor } from './szkody.ts';
import { treeSprite } from './trees.ts';
import { type InteriorTile, interiorColor } from './wnetrze.ts';

const PAVED = new Set<number>([T.ROAD, T.PARKING]);

/** drobne śmieci po latach bez sprzątania: papier, folia, puszka, butelka */
const TRASH = [0xd8d2c0, 0x5a7fa0, 0xa04a38, 0x5e7a44] as const;
/** wyschnięta, niekoszona trawa */
const STRAW = 0x8a8648;

/** pęknięcie w asfalcie: wąska kręta linia z szumu, w niej czasem chwast */
function asphaltCrack(c: number, ax: number, ay: number): number {
  if (Math.abs(vnoise(ax, ay, 70, 27) - 0.5) >= 0.008) return c;
  return h2(ax >> 1, ay >> 1, 28) < 0.15 ? C.grass0 : 0x26272a;
}

/** teren z kafelków Wanga z grafiki z PixelLab (pseudokod terenu w groundColor) */
const WANG = -1;

/** Reszta z dzielenia zawsze nieujemna. Wzory (okna, linie parkingu, pasy blachy, rzędy upraw) liczą się od współrzędnych
    układu miasta, które w kwadratach na zachód i północ od domu są ujemne, a `%` ma wtedy znak dzielnej i warunki w rodzaju
    „reszta mniejsza od 3” zachodziłyby zawsze albo nigdy. Dla nieujemnych daje dokładnie to samo co `%` (dom bez zmian). */
const mod = (a: number, m: number): number => (a >= 0 ? a % m : ((a % m) + m) % m);

/**
 * Kolor terenu (0xRRGGBB) w punkcie grafiki (ax, ay) na kafelku i o kodzie t. wq: kafelki Wanga nad tym
 * kafelkiem (wangKafel), gdy teren idzie z grafiki z PixelLab; chodnik dostaje wtedy krawężnik od jezdni
 * jak chodnik z kodu, a przy ścianach i w cieniu ciemnieje jak cały teren.
 */
function groundColor(
  sc: ChunkScene,
  t: number,
  i: number,
  lax: number,
  lay: number,
  px: number,
  py: number,
  wq: Int32Array | null,
): number {
  const w = sc.w;
  const size = w.size;
  const x = i % size;
  const y = (i - x) / size;
  // lax i lay to piksel w kwadracie (cień z maski kwadratu), ax i ay ten sam piksel w układzie miasta (szum i wzory)
  const ax = lax + (sc.poczatek?.x ?? 0);
  const ay = lay + (sc.poczatek?.y ?? 0);
  // za krawędzią kwadratu teren sąsiada (brzeg), a bez sąsiada ten sam kod co kafelek, jak na brzegu mapy
  const br = sc.brzeg;
  const nN = y > 0 ? w.terr[i - size] : (br?.n?.[x] ?? t);
  const nS = y < size - 1 ? w.terr[i + size] : (br?.s?.[x] ?? t);
  const nW = x > 0 ? w.terr[i - 1] : (br?.w?.[y] ?? t);
  const nE = x < size - 1 ? w.terr[i + 1] : (br?.e?.[y] ?? t);
  // odległość do krawędzi kafelka od strony sąsiada o innym kodzie
  const edgeTo = (pred: (n: number) => boolean): number => {
    let d = 99;
    if (pred(nN)) d = Math.min(d, py);
    if (pred(nS)) d = Math.min(d, 31 - py);
    if (pred(nW)) d = Math.min(d, px);
    if (pred(nE)) d = Math.min(d, 31 - px);
    return d;
  };
  let c: number;
  switch (wq ? WANG : t) {
    case WANG: {
      c = wangPiksel(sc.art!.teren!, wq!, px, py);
      if (t === T.SIDEWALK || t === T.PATH) {
        const er = edgeTo((n2) => n2 === T.ROAD || n2 === T.PARKING);
        if (er < 3) c = er === 0 ? shade(C.curb, 0.8) : C.curb;
      }
      break;
    }
    case T.GRASS:
    case T.PARK:
    case T.WOOD: {
      const r = h2(ax >> 1, ay >> 1, 5);
      // dithering na granicach plam zamiast ostrych krawędzi
      const n = vnoise(ax, ay, 96, 3) * 0.6 + vnoise(ax, ay, 24, 4) * 0.4 + (r - 0.5) * 0.16;
      let base: number;
      if (t === T.WOOD) base = n < 0.45 ? C.wood0 : C.wood1;
      else if (t === T.PARK) base = n < 0.4 ? C.park0 : n < 0.75 ? C.park1 : C.grass2;
      else base = n < 0.3 ? C.grass0 : n < 0.62 ? C.grass1 : n < 0.88 ? C.grass2 : C.grass3;
      c = r < 0.16 ? shade(base, 0.95) : r > 0.88 ? shade(base, 1.04) : base;
      // kępki trawy i liście
      const k = h2(ax >> 1, ay >> 2, 9);
      if (k < 0.02) c = shade(base, 0.86);
      else if (k > 0.996) c = h2(ax >> 1, ay >> 1, 11) < 0.5 ? C.leaf0 : C.leaf1;
      if (t === T.WOOD && h2(ax >> 1, ay >> 1, 13) < 0.06) c = C.leaf2;
      else if (t !== T.WOOD) {
        // nikt nie kosi: płaty suchej trawy, kępy chwastów, gdzieniegdzie śmieć
        const dry = vnoise(ax, ay, 260, 17);
        if (dry > 0.6) c = mix(c, STRAW, (dry - 0.6) * 0.9);
        if (h2(ax >> 3, ay >> 3, 18) < 0.012 && h2(ax, ay, 19) < 0.45)
          c = h2(ax >> 1, ay, 20) < 0.7 ? 0x3d5426 : 0x9a8a50;
        if (h2(ax >> 1, ay >> 1, 21) < 0.0009) c = TRASH[Math.floor(h2(ax >> 1, ay >> 1, 22) * 4)];
      }
      // trawa przy budynku zacieniona
      break;
    }
    case T.ROAD: {
      const n = vnoise(ax, ay, 160, 21);
      const r = h2(ax, ay, 22);
      c = n < 0.35 ? C.asph0 : n < 0.8 ? C.asph1 : C.asph2;
      if (r < 0.05) c = shade(c, 0.85);
      else if (r > 0.96) c = shade(c, 1.15);
      c = asphaltCrack(c, ax, ay);
      // rynsztok przy krawężniku
      const e = edgeTo((n2) => !PAVED.has(n2) && n2 !== T.ROAD);
      if (e < 2) c = C.gutter;
      break;
    }
    case T.PARKING: {
      const r = h2(ax, ay, 23);
      c = vnoise(ax, ay, 120, 24) < 0.5 ? C.asph1 : C.asph2;
      if (r < 0.05) c = shade(c, 0.85);
      // linie miejsc parkingowych co 2,5 m
      if (mod(ax, 80) < 2 && (ay & 63) < 52) c = shade(C.line, 0.85);
      if (h2(ax >> 3, ay >> 3, 25) < 0.01) c = 0x2a2a2a;
      c = asphaltCrack(c, ax, ay);
      break;
    }
    case T.SIDEWALK: {
      // płyty 50×50 cm (16 px) z fugami
      const sx = ax >> 4;
      const sy = ay >> 4;
      const r = h2(sx, sy, 31);
      c = r < 0.3 ? C.slab1 : r > 0.85 ? C.slab2 : C.slab0;
      if (h2(sx, sy, 32) < 0.03) c = shade(c, 0.82);
      const u = ax & 15;
      const v = ay & 15;
      if (u === 0 || v === 0) {
        c = C.seam;
        if (h2(ax, ay, 33) < 0.25) c = C.grass0;
      } else if (h2(sx, sy, 38) < 0.02) {
        // zapadnięta płyta: ziemia z trawą
        c = h2(ax, ay, 39) < 0.35 ? C.grass1 : C.dirt1;
      } else {
        if (h2(ax, ay, 34) < 0.04) c = shade(c, 0.92);
        // pęknięta płyta: zygzak od krawędzi do krawędzi
        if (h2(sx, sy, 36) < 0.12) {
          const dir = h2(sx, sy, 37) < 0.5 ? 1 : -1;
          if (u === ((3 + Math.floor(h2(sx, sy, 40) * 10) + ((v * dir) >> 2)) & 15)) c = shade(c, 0.72);
        }
        // liście nawiane na chodnik
        if (h2(ax >> 1, ay >> 1, 41) < 0.01) c = h2(ax >> 2, ay >> 2, 42) < 0.5 ? C.leaf0 : C.leaf1;
      }
      // krawężnik od jezdni
      const er = edgeTo((n2) => n2 === T.ROAD || n2 === T.PARKING);
      if (er < 3) c = er === 0 ? shade(C.curb, 0.8) : C.curb;
      // trawa wchodzi na płyty
      const eg = edgeTo((n2) => n2 === T.GRASS || n2 === T.PARK || n2 === T.WOOD);
      if (eg < 3 && h2(ax, ay >> 1, 35) < (3 - eg) * 0.3) c = C.grass1;
      break;
    }
    case T.PATH: {
      const r = h2(ax >> 1, ay >> 1, 41);
      c = r < 0.3 ? C.dirt0 : r > 0.8 ? C.dirt2 : C.dirt1;
      if (h2(ax, ay, 42) < 0.02) c = 0x9a917f;
      const eg = edgeTo((n2) => n2 === T.GRASS || n2 === T.PARK || n2 === T.WOOD);
      if (eg < 5 && h2(ax >> 1, ay >> 1, 43) < (5 - eg) * 0.18) c = C.grass1;
      break;
    }
    case T.WATER: {
      const n = vnoise(ax, ay, 64, 51);
      c = n < 0.5 ? C.water1 : C.water0;
      const wave = (ay + Math.floor(vnoise(ax, 0, 40, 52) * 10)) % 14;
      if (wave === 0 && h2(ax >> 3, ay, 53) < 0.6) c = C.water2;
      const e = edgeTo((n2) => n2 !== T.WATER);
      if (e < 2) c = C.foam;
      else if (e < 5) c = C.water0;
      break;
    }
    case T.PLAY: {
      const r = h2(ax >> 1, ay >> 1, 61);
      c = r < 0.3 ? C.sand1 : C.sand0;
      if (h2(ax, ay, 62) < 0.03) c = shade(C.sand0, 1.08);
      const e = edgeTo((n2) => n2 !== T.PLAY);
      if (e < 4) c = e < 2 ? 0x8b6f4c : 0xa48557;
      break;
    }
    case T.PITCH: {
      c = (ax >> 6) & 1 ? C.turf0 : C.turf1;
      if (h2(ax, ay, 71) < 0.05) c = shade(c, 0.9);
      const e = edgeTo((n2) => n2 !== T.PITCH);
      if (e >= 6 && e < 9) c = C.line;
      break;
    }
    case T.ALLOT: {
      const r = h2(ax >> 1, ay >> 1, 81);
      c = r < 0.5 ? C.soil0 : C.soil1;
      if (mod(ay, 14) < 5 && h2(ax >> 2, ay >> 2, 82) < 0.75) c = h2(ax >> 1, ay, 83) < 0.3 ? 0x7a9a44 : C.crop;
      break;
    }
    default:
      c = 0xff00ff;
  }
  // przy ścianach budynków ciemniej
  const eb = edgeTo((n2) => n2 === T.BUILDING);
  if (eb < 5) c = shade(c, 0.74 + eb * 0.05);
  // cień budynków i drzew (oczka 8 px)
  const S = size * SUB;
  if (sc.shadow[((lay >> 3) * S + (lax >> 3)) | 0]) c = mix(c, C.shadow, 0.34);
  return c;
}

/** kolor fasady: fy liczony od dołu ściany (0 = ziemia) */
function facadeColor(st: BStyle, ax: number, fy: number, door: boolean, px: number): number {
  const top = st.base + st.levels * st.floorH;
  if (fy >= top) return shade(st.wall, 0.86); // gzyms
  if (door && fy < 11) {
    if (px >= 11 && px <= 20 && fy < 10) return fy < 1 ? 0x5c5852 : px === 11 || px === 20 ? 0x24201c : C.door;
    if (px >= 8 && px <= 23 && fy === 10) return C.canopy;
  }
  if (fy < st.base) {
    if (st.kind === 'garaz') return shade(C.metal1, 0.8);
    return C.plinth;
  }
  const f = Math.floor((fy - st.base) / st.floorH);
  const yIn = (fy - st.base) % st.floorH;
  const wall = st.kind === 'szkola' ? (((fy >> 2) + (ax >> 3)) & 1 ? C.brick0 : C.brick1) : st.wall;
  switch (st.kind) {
    case 'garaz': {
      // brama z poziomymi żebrami
      const g = mod(ax, 96);
      if (g < 4) return C.metal1;
      return yIn % 3 === 0 ? shade(C.metal2, 0.85) : C.metal2;
    }
    case 'sklep': {
      if (f === 0) {
        if (yIn >= st.floorH - 2) return h2(st.seed, 1, 5) < 0.5 ? 0x9c3b30 : 0x2f6a8f; // szyld
        return mod(ax, 40) < 3 ? 0x5b5d5f : C.shopGlass;
      }
      break;
    }
    case 'dom': {
      const m = mod(ax, 40);
      if (yIn >= 3 && yIn <= 7 && m >= 12 && m <= 25) return m === 12 || m === 25 ? 0xf2efe7 : C.window;
      return yIn === 0 && f > 0 ? shade(wall, 0.9) : wall;
    }
    default:
      break;
  }
  // blok i reszta: moduł 12 px, okno 6×4 z jasną ramą u góry
  const m = mod(ax, 12);
  const g4 = mod(Math.floor(ax / 24), 4);
  const balc = st.balconies && st.kind === 'blok' && (g4 === 1 || g4 === 2);
  if (balc && f > 0) {
    if (yIn === 0) return C.balcony; // płyta balkonu
    if (yIn <= 3) return (ax & 3) === 0 ? C.rail : st.accent; // balustrada z kolorowej blachy
  }
  if (balc && yIn === st.floorH - 1 && f + 1 < st.levels) return shade(wall, 0.7); // cień pod balkonem wyżej
  const wTop = st.floorH - 2;
  if (yIn >= 2 && yIn <= wTop && m >= 3 && m <= 8) {
    if (yIn === wTop) return 0xd9d6cf;
    const lit = h2(Math.floor(ax / 12), f, st.seed) < 0.06;
    if (lit) return 0x5f5844; // zasłonięte
    return m === 3 && yIn === wTop - 1 ? C.windowHi : C.window;
  }
  // zacieki pod oknami
  if (yIn <= 1 && m >= 4 && m <= 7 && h2(Math.floor(ax / 12), f, st.seed + 1) < 0.25) return shade(wall, 0.84);
  if (st.kind === 'blok' && ax % 36 === 0) return shade(wall, 0.88); // fugi płyt
  if (yIn === 0) return shade(wall, 0.92);
  return wall;
}

/** Czy kafelek (x, y) kwadratu, także tuż za jego krawędzią, należy do budynku bid: w kwadracie po numerze, za krawędzią
    po terenie sąsiada (brzeg): kafelek budynku za szwem to ten sam budynek, który ciągnie się dalej. */
function taSamaBryla(sc: ChunkScene, bid: number, x: number, y: number): boolean {
  const size = sc.w.size;
  if (x >= 0 && y >= 0 && x < size && y < size) return sc.w.bid[y * size + x] === bid;
  const br = sc.brzeg;
  if (!br) return false;
  if (x < 0) return br.w?.[y] === T.BUILDING;
  if (x >= size) return br.e?.[y] === T.BUILDING;
  if (y < 0) return br.n?.[x] === T.BUILDING;
  return br.s?.[x] === T.BUILDING;
}

function roofColor(
  sc: ChunkScene,
  st: BStyle,
  i: number,
  lax: number,
  lay: number,
  px: number,
  py: number,
  bid: number,
): number {
  const w = sc.w;
  const size = w.size;
  const x = i % size;
  const y = (i - x) / size;
  // lax i lay to piksel w kwadracie (grzbiet dachu), ax i ay ten sam piksel w układzie miasta (szum i wzór dachówek)
  const ax = lax + (sc.poczatek?.x ?? 0);
  const ay = lay + (sc.poczatek?.y ?? 0);
  const eN = taSamaBryla(sc, bid, x, y - 1) ? 99 : py;
  const eW = taSamaBryla(sc, bid, x - 1, y) ? 99 : px;
  const eE = taSamaBryla(sc, bid, x + 1, y) ? 99 : 31 - px;
  const edge = Math.min(eN, eW, eE);
  let c: number;
  switch (st.roof) {
    case 'tiles': {
      if (st.ridge === 'h') {
        const north = lay < st.ridgeAt;
        const row = Math.abs(lay - st.ridgeAt);
        c = north ? C.tile1 : C.tile2;
        if (row < 2) return 0x5e2a1d;
        if (row % 7 === 0 || ((ax + ((row / 7) | 0) * 5) % 10 === 0 && row % 7 < 6)) c = shade(c, 0.8);
      } else {
        const west = lax < st.ridgeAt;
        const col = Math.abs(lax - st.ridgeAt);
        c = west ? C.tile1 : C.tile2;
        if (col < 2) return 0x5e2a1d;
        if (col % 7 === 0 || ((ay + ((col / 7) | 0) * 5) % 10 === 0 && col % 7 < 6)) c = shade(c, 0.8);
      }
      if (edge < 2) c = shade(c, 0.7);
      return c;
    }
    case 'metal': {
      c = mod(ax, 6) < 3 ? C.metal0 : C.metal1;
      if (h2(ax >> 2, ay >> 2, st.seed) < 0.04) c = 0x7a5a3e; // rdza
      if (edge < 2) c = shade(c, 0.75);
      return c;
    }
    case 'gravel': {
      const r = h2(ax >> 1, ay >> 1, st.seed);
      c = r < 0.4 ? C.gravel1 : C.gravel0;
      break;
    }
    default: {
      // papa: pasy co metr, rzadkie łaty po naprawach i zastoiny wody
      const r = h2(ax, ay, 91);
      c = C.tar0;
      if ((ay & 31) === 0) c = shade(c, 0.93);
      const patch = vnoise(ax, ay, 56, st.seed & 0xffff);
      if (patch > 0.86) c = C.tar2;
      if (vnoise(ax, ay, 30, (st.seed + 7) & 0xffff) > 0.9) c = shade(c, 0.88);
      if (r < 0.05) c = shade(c, 0.95);
      else if (r > 0.98) c = shade(c, 1.06);
    }
  }
  // attyka
  if (edge < 4) c = edge === 3 ? C.parapetDark : C.parapet;
  return c;
}

/** czy punkt grafiki (px, py) leży na dachu budynku bid (poza fasadą) */
function onRoof(sc: ChunkScene, bid: number, px: number, py: number, margin: number): boolean {
  const size = sc.w.size;
  for (const [dx, dy] of [
    [-margin, -margin],
    [margin, -margin],
    [-margin, margin],
    [margin, margin],
  ]) {
    const x = Math.floor((px + dx) / TILE);
    const y = Math.floor((py + dy) / TILE);
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    const i = y * size + x;
    if (sc.w.bid[i] !== bid) return false;
    const fy = sc.south[i] * TILE + (31 - ((py + dy) & 31));
    if (fy < sc.styles[bid].facade + 6) return false;
  }
  return true;
}

/** kominy wentylacyjne w rzędzie wzdłuż bloku, wyłazy nad klatkami, anteny i talerze */
function roofDetails(ctx: Ctx2D, sc: ChunkScene, bid: number): void {
  const b = sc.w.buildings[bid];
  const st = sc.styles[bid];
  // ramka budynku: przecięty granicą okna budynek w kwadracie obok domu ma ramkę całego budynku (WorldBuilding.ramka), więc
  // rząd kominów i anteny liczą się z niej i kawałki po obu stronach szwu mają jeden rząd (każdy rysuje te, które leżą na
  // jego dachu: onRoof); numer anten idzie wtedy z ziarna stylu (z klucza budynku), a nie z numeru w kwadracie. Dom i
  // budynek w całości w oknie liczą z kafelków i z numeru jak zawsze.
  const ram = b.ramka ?? b;
  const sid = b.ramka ? st.seed : bid;
  const horiz = ram.x1 - ram.x0 >= ram.y1 - ram.y0;
  const box = (x: number, y: number, w: number, h: number, top: string, side: string) => {
    ctx.fillStyle = 'rgba(16,20,28,0.35)';
    ctx.fillRect(x + 4, y - 4, w, h);
    ctx.fillStyle = side;
    ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, h - 4);
  };
  // rząd kominów wentylacyjnych co ~5 m w osi dachu
  const midY = ((ram.y0 * TILE + (ram.y1 + 1) * TILE - st.facade) / 2) | 0;
  const midX = (((ram.x0 + ram.x1 + 1) * TILE) / 2) | 0;
  if (horiz) {
    for (let x = ram.x0 * TILE + 80; x < (ram.x1 + 1) * TILE - 80; x += 160) {
      if (!onRoof(sc, bid, x, midY, 24)) continue;
      box(x - 8, midY - 10, 16, 20, '#8b7f74', '#5f564e');
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(x - 4, midY - 7, 8, 5);
    }
  } else {
    for (let y = ram.y0 * TILE + 80; y < (ram.y1 + 1) * TILE - st.facade - 40; y += 160) {
      if (!onRoof(sc, bid, midX, y, 24)) continue;
      box(midX - 8, y - 10, 16, 20, '#8b7f74', '#5f564e');
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(midX - 4, y - 7, 8, 5);
    }
  }
  // wyłazy nad klatkami
  for (const e of b.entrances) {
    const ex = e.tile % sc.w.size;
    const ey = Math.floor(e.tile / sc.w.size);
    const hx = horiz ? ex * TILE : midX - 12;
    const hy = horiz ? midY + 36 : ey * TILE;
    if (!onRoof(sc, bid, hx + 12, hy + 12, 16)) continue;
    box(hx, hy, 24, 24, '#77736c', '#4f4c47');
    ctx.fillStyle = '#5c5953';
    ctx.fillRect(hx + 4, hy + 4, 16, 12);
  }
  // anteny i talerze satelitarne
  const n = 2 + Math.floor(h2(sid, 5, 6) * 4);
  for (let k = 0; k < n; k++) {
    const x = (ram.x0 + 1 + h2(sid, k, 7) * (ram.x1 - ram.x0 - 1)) * TILE;
    const y = (ram.y0 + 1 + h2(sid, k, 8) * (ram.y1 - ram.y0 - 1)) * TILE;
    if (!onRoof(sc, bid, x, y, 20)) continue;
    if (h2(sid, k, 9) < 0.5) {
      ctx.fillStyle = 'rgba(16,20,28,0.35)';
      ctx.fillRect(x + 2, y - 16, 2, 18);
      ctx.fillStyle = '#3a3836';
      ctx.fillRect(x, y - 18, 2, 18);
      ctx.fillRect(x - 8, y - 16, 18, 2);
      ctx.fillRect(x - 6, y - 11, 14, 2);
    } else {
      ctx.fillStyle = 'rgba(16,20,28,0.35)';
      ctx.beginPath();
      ctx.ellipse(x + 4, y - 3, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9c7c0';
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8d8b85';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }
}

/**
 * Lewy górny róg ozdoby wyglądu budynku (wieża, kopuła, portyk, wieża remizy) w pikselach świata. Ozdoba stoi przy
 * głównym wejściu od południa (najbliższym osi budynku), a bez takiego wejścia na osi budynku; polozenie „prawo” albo
 * „lewo” stawia ją na końcu południowej ściany. Podstawa leży na linii gzymsu fasady (korona nad dachem) albo na ziemi
 * przed budynkiem (portyk ze schodami wystaje na kafelki przed ścianą).
 */
export function miejsceOzdoby(
  w: ChunkScene['w'],
  b: ArtBuilding,
  st: Pick<BStyle, 'facade'>,
  oz: NonNullable<BudynekGrafika['ozdoba']>,
): [number, number] {
  const size = w.size;
  const mid = (b.x0 + b.x1 + 1) / 2;
  let cx = mid * TILE;
  let podstawa = (b.y1 + 1) * TILE;
  let blisko = Number.POSITIVE_INFINITY;
  for (const e of b.entrances) {
    if (e.dir !== 'S') continue;
    const ex = e.tile % size;
    const ey = (e.tile - ex) / size;
    const d = Math.abs(ex + 0.5 - mid);
    if (d < blisko) {
      blisko = d;
      cx = (ex + 0.5) * TILE;
      podstawa = (ey + 1) * TILE;
    }
  }
  if (oz.polozenie === 'prawo') {
    cx = (b.x1 + 1) * TILE - (oz.img.w - oz.ax) - 2;
    podstawa = (b.y1 + 1) * TILE;
  } else if (oz.polozenie === 'lewo') {
    cx = b.x0 * TILE + oz.ax + 2;
    podstawa = (b.y1 + 1) * TILE;
  }
  const y = oz.kotwica === 'gzyms' ? podstawa - st.facade - oz.ay : podstawa - oz.ay;
  return [Math.round(cx - oz.ax), Math.round(y)];
}

/**
 * Rysuje kawałek (cx, cy) w skali s pikseli na kafelek (32 albo 8) do płótna o boku CHUNK*s.
 * Płótno może być zwykłe (główny wątek) albo OffscreenCanvas (worker). cut: przekrój, czyli
 * nad wnętrzem sc.section kafelki wnętrza zamiast dachu i fasady.
 */
export function drawChunk(sc: ChunkScene, cx: number, cy: number, s: number, canvas: AnyCanvas, cut = false): void {
  const w = sc.w;
  const size = w.size;
  const side = CHUNK * s;
  canvas.width = side;
  canvas.height = side;
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(side, side);
  const out = new Uint32Array(img.data.buffer);
  const step = TILE / s;
  const off = step >> 1;
  // początek kwadratu w układzie miasta (0 w domu): szum i wzory fasad i dachów od współrzędnych miasta, odbicia kafelków
  // Wanga od ich numerów w mieście, więc kawałki sąsiednich kwadratów łączą się bez szwu
  const GX = sc.poczatek?.x ?? 0;
  const GY = sc.poczatek?.y ?? 0;
  const wangGX = GX / TILE;
  const wangGY = GY / TILE;
  // tryb piętra (przekrój, sc.pietro od 1 i scena piętra): zamiast wnętrza siedziby typowe piętro mapy, ale tylko
  // w budynkach o więcej niż sc.pietro kondygnacjach (levels budynku, bo styl tnie je do 16); niższe rysują się jak
  // bez przekroju, czyli dachem
  const pietro = cut && sc.pietro >= 1 && sc.pietra ? sc.pietro : 0;
  const sec = pietro ? sc.pietra : cut ? sc.section : null;
  // scena piętra nie ma jednego budynku (building −1): elewację każdego kafelka bierze jego budynek
  const facade = sec && sec.building >= 0 ? sc.styles[sec.building].wall : 0;
  const teren = sc.art?.teren ?? null;
  const blok = sc.art?.blok ?? null;
  const dach = sc.art?.dach ?? null;
  const budynki = sc.art?.budynki ?? null;
  // otwarty w przekroju: wnętrze zamiast dachu, więc bez ozdób, maszynowni, kominów i anten; na piętrze tylko budynki,
  // które mają to piętro (scena piętra ma w otwarte wszystkie od dwóch kondygnacji), niższe zostają z dachem i ozdobami
  const otwarty = (b: ArtBuilding) =>
    sec !== null && (b.id === sec.building || (!!sec.otwarte?.has(b.id) && (!pietro || b.levels > pietro)));
  /** pas fasady z modułów (wiersze atlasu od góry) po numerze budynku */
  const pasy = new Map<number, number[]>();
  for (let ty = 0; ty < CHUNK; ty++) {
    const y = cy * CHUNK + ty;
    if (y >= size) break;
    for (let tx = 0; tx < CHUNK; tx++) {
      const x = cx * CHUNK + tx;
      if (x >= size) break;
      const i = y * size + x;
      const t = w.terr[i];
      const bid = w.bid[i];
      const st = bid >= 0 ? sc.styles[bid] : null;
      const door = bid >= 0 && sc.doors.get(i) === 'S';
      // przekrój: opis kafelka wnętrza raz na kafelek, piksele z grafiki zastępczej (wnetrze.ts),
      // na nich ślady pustego mieszkania i uszkodzenia posadzki (szkody.ts)
      // fasada z budynku kafelka: w przekroju są też otwarte sąsiednie budynki (M2 fala 2)
      const inner: InteriorTile | null =
        sec && sec.cell[i] !== IN.NONE && (!pietro || (bid >= 0 && w.buildings[bid].levels > pietro))
          ? describeTile(sec, i, size, bid >= 0 ? sc.styles[bid].wall : facade)
          : null;
      const dmg = inner ? sec!.damage?.get(i) : undefined;
      const rid = inner ? sec!.room[i] : -1;
      const why = rid >= 0 ? sec!.why?.get(sec!.roomApt?.[rid] ?? -1) : undefined;
      // sąsiedzi z uszkodzeniem danego rodzaju (bity N 1, E 2, S 4, W 8): zalana podłoga łączy się
      // z sąsiednią, sadza od okopconego pieca wchodzi na posadzkę obok
      const around = (k: DamageKind) => {
        const at = (j: number) => (sec!.damage!.get(j) === k ? 1 : 0);
        return at(i - size) | (at(i + 1) << 1) | (at(i + size) << 2) | (at(i - 1) << 3);
      };
      const hurt = inner?.kind === 'floor' && !!sec!.damage?.size;
      const wet = hurt && dmg === 'podloga' ? around('podloga') : 0;
      const soot = hurt && dmg !== 'piec' ? around('piec') : 0;
      // teren z kafelków Wanga: cztery kafelki nad tym kafelkiem świata (podwójna siatka)
      const wq =
        !inner && !st && teren && wangRysuje(t) ? wangKafel(w.terr, size, x, y, sc.brzeg, wangGX, wangGY) : null;
      // blok z modułów: pas fasady, środki drzwi od południa przy dole tej kolumny (moduł wejścia sięga
      // do sąsiedniej kolumny) i krawędzie dachu z attyką
      const lg = !inner && st?.look ? (budynki?.[st.look] ?? null) : null;
      const mod = !inner && st?.mod ? (lg ? lg.fasada : blok) : null;
      let rows: number[] = [];
      const doorsX: number[] = [];
      let eN = false;
      let eW = false;
      let eE = false;
      if (mod) {
        rows = pasy.get(bid) ?? pasFasady(mod, st!.vis ?? st!.levels);
        pasy.set(bid, rows);
        const yb = y + sc.south[i];
        for (let dx = -1; dx <= 1; dx++) {
          const j = yb * size + x + dx;
          // drzwi liczą się od dołu budynku, który przy szwie leży u sąsiada (yb poza kwadratem): tam ich nie ma
          if (yb < size && x + dx >= 0 && x + dx < size && w.bid[j] === bid && sc.doors.get(j) === 'S')
            doorsX.push(GX + (x + dx) * TILE + TILE / 2);
        }
        eN = !taSamaBryla(sc, bid, x, y - 1);
        eW = !taSamaBryla(sc, bid, x - 1, y);
        eE = !taSamaBryla(sc, bid, x + 1, y);
      }
      for (let oy = 0; oy < s; oy++) {
        const py = oy * step + off;
        const ay = y * TILE + py;
        let o = (ty * s + oy) * side + tx * s;
        for (let ox = 0; ox < s; ox++) {
          const px = ox * step + off;
          const ax = x * TILE + px;
          // ten sam piksel w układzie miasta: szum, wzory fasad i dachów
          const gax = GX + ax;
          const gay = GY + ay;
          let c: number;
          if (inner) {
            // strop piętra z naklejkami z grafiki sceny (bez niej sam kod, jak interiorColor)
            c =
              inner.kind === 'strop'
                ? stropKolor(sc.art?.strop ?? null, gax, gay)
                : interiorColor(inner, x, y, px, py, sec!.seed);
            if (dmg || why || soot) c = wearColor(c, inner, why, dmg, gax, gay, px, py, sec!.seed, wet, soot);
          } else if (mod) {
            const fy = sc.south[i] * TILE + (31 - py);
            const fh = Math.min(st!.facade, sc.run[i] * TILE - 8);
            if (fy < fh) {
              let dX = Number.NaN;
              for (const d of doorsX) if (gax >= d - mod.drzwi && gax < d - mod.drzwi + mod.wejscie[1]) dX = d;
              c = blokKolor(mod, kolumnaFasady(mod, gax, dX), rows[rows.length - 1 - fy]);
            } else {
              const e = Math.min(eN ? py : TILE, eW ? px : TILE, eE ? 31 - px : TILE);
              if (e < mod.attyka[1]) c = attykaKolor(mod, e);
              else if (lg?.dach) c = dachProbkaKolor(lg.dach, gax, gay, st!.seed);
              else c = dach ? papaKolor(dach, gax, gay) : roofColor(sc, st!, i, ax, ay, px, py, bid);
            }
          } else if (st) {
            const fy = sc.south[i] * TILE + (31 - py);
            const fh = Math.min(st.facade, sc.run[i] * TILE - 8);
            if (fy < fh) c = facadeColor(st, gax, fy, door && sc.south[i] === 0, px);
            else if (fy < fh + 3) c = fy === fh ? 0x3f3c38 : C.parapet;
            else c = roofColor(sc, st, i, ax, ay, px, py, bid);
          } else c = groundColor(sc, t, i, ax, ay, px, py, wq);
          out[o++] = rgba(c);
        }
      }
    }
  }
  // ozdoby wyglądów budynków (wieża, kopuła, portyk): piksele sprite'a wpisane do obrazu kawałka tak jak teren i fasady
  // (próbkowanie od środka piksela), więc działają tak samo w workerze, w głównym wątku i w Node; budynki otwarte
  // w przekroju ich nie mają
  if (budynki) {
    const wx0 = cx * CHUNK * TILE;
    const wy0 = cy * CHUNK * TILE;
    for (const b of w.buildings) {
      const st = sc.styles[b.id];
      const oz = st.look ? budynki[st.look]?.ozdoba : null;
      if (!oz || otwarty(b)) continue;
      const [sx, sy] = miejsceOzdoby(w, b, st, oz);
      const ox0 = Math.max(0, Math.ceil((sx - wx0 - off) / step));
      const ox1 = Math.min(side - 1, Math.floor((sx + oz.img.w - 1 - wx0 - off) / step));
      const oy0 = Math.max(0, Math.ceil((sy - wy0 - off) / step));
      const oy1 = Math.min(side - 1, Math.floor((sy + oz.img.h - 1 - wy0 - off) / step));
      for (let oy = oy0; oy <= oy1; oy++) {
        const v = wy0 + oy * step + off - sy;
        for (let ox = ox0; ox <= ox1; ox++) {
          const p = oz.img.px[v * oz.img.w + (wx0 + ox * step + off - sx)];
          if (p >>> 24) out[oy * side + ox] = p;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const k = s / TILE;
  // maszynownie wind nad klatkami bloków, kominy domów
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-cx * CHUNK * TILE, -cy * CHUNK * TILE);
  const x0 = cx * CHUNK - 8;
  const x1 = (cx + 1) * CHUNK + 8;
  const y0 = cy * CHUNK - 8;
  const y1 = (cy + 1) * CHUNK + 8;
  for (const b of w.buildings) {
    if (b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1) continue;
    const st = sc.styles[b.id];
    // otwarty w przekroju: bez maszynowni, kominów i anten (daszki nad wejściami zostają)
    const open = otwarty(b);
    // bloki z modułów PixelLab mają dach z samej papy z naklejkami, bez maszynowni, kominów i anten z kodu
    if (!open && b.cls === 'blok' && st.levels >= 5 && !st.mod) {
      for (const e of b.entrances) {
        const ex = e.tile % size;
        const ey = (e.tile - ex) / size;
        let bx: number;
        let by: number;
        if (e.dir === 'S' || e.dir === 'N') {
          bx = ex * TILE - 32;
          by = ((b.y0 + b.y1 + 1) / 2) * TILE - st.facade / 2 - 40;
        } else {
          bx = ((b.x0 + b.x1 + 1) / 2) * TILE - 40;
          by = ey * TILE - 32;
        }
        ctx.fillStyle = '#2b2a2866';
        ctx.fillRect(bx + 6, by - 6, 80, 80);
        ctx.fillStyle = '#8f8a81';
        ctx.fillRect(bx, by, 80, 80);
        ctx.fillStyle = '#a19c92';
        ctx.fillRect(bx + 3, by + 3, 74, 60);
        ctx.fillStyle = '#6f6b64';
        ctx.fillRect(bx, by + 66, 80, 14);
        ctx.fillStyle = '#4a4744';
        ctx.fillRect(bx + 30, by + 68, 20, 10);
      }
    }
    if (
      !open &&
      !st.mod &&
      st.roof === 'tar' &&
      (b.cls === 'blok' || b.cls === 'inne' || b.cls === 'przychodnia' || b.cls === 'szkola')
    ) {
      roofDetails(ctx, sc, b.id);
    }
    if (!open && b.cls === 'dom') {
      const vx = b.x0 + Math.floor((b.x1 - b.x0) * (0.25 + h2(b.id, 9, 3) * 0.5));
      const vy = b.y0 + 1;
      ctx.fillStyle = '#2f2d2b66';
      ctx.fillRect(vx * TILE + 18, vy * TILE - 4, 18, 22);
      ctx.fillStyle = '#7d4433';
      ctx.fillRect(vx * TILE + 12, vy * TILE, 18, 24);
      ctx.fillStyle = '#5a2f23';
      ctx.fillRect(vx * TILE + 12, vy * TILE, 18, 4);
      ctx.fillStyle = '#2a2624';
      ctx.fillRect(vx * TILE + 16, vy * TILE + 1, 10, 2);
    }
    // wejścia z boków i od tyłu: daszek i stopień przed drzwiami
    for (const e of b.entrances) {
      if (e.dir === 'S') continue;
      const ox = e.out % size;
      const oy = (e.out - ox) / size;
      ctx.fillStyle = '#8d8a82';
      if (e.dir === 'N') {
        ctx.fillRect(ox * TILE + 6, oy * TILE + 18, 20, 14);
        ctx.fillStyle = '#d3cfc6';
        ctx.fillRect(ox * TILE + 2, oy * TILE + 24, 28, 8);
      } else {
        const left = e.dir === 'W';
        ctx.fillRect(ox * TILE + (left ? 18 : 0), oy * TILE + 6, 14, 20);
        ctx.fillStyle = '#d3cfc6';
        ctx.fillRect(ox * TILE + (left ? 24 : 0), oy * TILE + 2, 8, 28);
      }
    }
  }
  // cienie drzew: miękkie elipsy w trzech warstwach (każda w jednej ścieżce, żeby nakładające się
  // nie ciemniały podwójnie), od szerokiej i jasnej do węższej i ciemniejszej w środku; ścięte drzewa
  // (treeGone) już się nie rysują, suche (bez liści) ma cień lżejszy i mniejszy; drzewa sąsiednich kwadratów, które
  // sięgają kawałka przez szew, rysują się razem z własnymi
  const list = drzewaKawalka(sc, cx, cy);
  const shade = (ds: readonly DrzewoKawalka[], k: number, a: number) => {
    if (!ds.length) return;
    for (const [m, f] of SOFT) {
      ctx.beginPath();
      for (const { t } of ds) {
        const sx = (t.x + t.r * 0.45) * TILE;
        const sy = (t.y - 1.2 - t.r * 0.55) * TILE;
        const rx = t.r * TILE * 0.95 * k * m;
        ctx.moveTo(sx + rx, sy);
        ctx.ellipse(sx, sy, rx, t.r * TILE * 0.76 * k * m, 0, 0, Math.PI * 2);
      }
      ctx.fillStyle = `rgba(16,22,34,${(a * f).toFixed(3)})`;
      ctx.fill();
    }
  };
  shade(
    list.filter((d) => !d.sucha),
    1,
    0.3,
  );
  shade(
    list.filter((d) => d.sucha),
    0.8,
    0.13,
  );
  // drzewa od tyłu do przodu, ale tylko z daleka: z bliska stoją jako sprite'y w warstwie pionków
  // (treeLayer.ts), sortowane po y razem z pionkami
  if (s < TILE)
    for (const { t, sucha } of list) {
      const sp = sucha ? deadTree(t) : treeSprite(t);
      ctx.drawImage(sp.canvas, t.x * TILE - sp.ax, t.y * TILE - sp.ay);
    }
  ctx.restore();
}

/** drzewo rysowane w kawałku: opis i czy to suche drzewo (bez liści) */
export interface DrzewoKawalka {
  t: Tree;
  sucha: boolean;
}

/**
 * Drzewa rysowane w kawałku (cx, cy) w kolejności od tyłu do przodu (rosnące y, potem x): własne, które nie są ścięte,
 * i obce z kwadratów obok, których cień albo korona sięga kawałka przez szew (sc.obce). Bez obcych to lista z treesBy,
 * jak zawsze. Współrzędne w układzie sceny.
 */
export function drzewaKawalka(sc: ChunkScene, cx: number, cy: number): DrzewoKawalka[] {
  const k = cy * sc.chunks + cx;
  const trees = sc.w.trees;
  const wlasne: DrzewoKawalka[] = [];
  for (const i of sc.treesBy[k]) if (!sc.treeGone[i]) wlasne.push({ t: trees[i], sucha: i === sc.dryTree });
  const obce = sc.obce?.[k];
  if (!obce?.length) return wlasne;
  // scalenie dwóch list posortowanych po (y, x); przy remisie własne pierwsze
  const out: DrzewoKawalka[] = [];
  let a = 0;
  let b = 0;
  while (a < wlasne.length || b < obce.length) {
    if (b >= obce.length) out.push(wlasne[a++]);
    else if (a >= wlasne.length) out.push({ t: obce[b++], sucha: false });
    else {
      const w = wlasne[a].t;
      const o = obce[b];
      if (w.y < o.y || (w.y === o.y && w.x <= o.x)) out.push(wlasne[a++]);
      else out.push({ t: obce[b++], sucha: false });
    }
  }
  return out;
}

/** warstwy miękkiego cienia drzewa: skala elipsy i udział krycia (razem w środku pełne krycie) */
const SOFT: readonly (readonly [number, number])[] = [
  [1.12, 0.3],
  [0.96, 0.35],
  [0.78, 0.5],
];

const deadCache = new Map<string, { canvas: AnyCanvas; ax: number; ay: number }>();

/** suche drzewo z grafiki zastępczej (rzeczy.ts) jako płótno, w tej samej ramce co żywe */
function deadTree(t: { x: number; y: number; r: number; kind: 0 | 1 | 2; seed: number }) {
  const key = `${t.kind}:${t.r}:${t.seed}`;
  let hit = deadCache.get(key);
  if (!hit) {
    const sp = deadTreeSprite(t);
    const canvas = newCanvas(sp.w, sp.h);
    const ctx = ctx2d(canvas);
    const img = ctx.createImageData(sp.w, sp.h);
    new Uint32Array(img.data.buffer).set(sp.px);
    ctx.putImageData(img, 0, 0);
    hit = { canvas, ax: sp.ax, ay: sp.ay };
    deadCache.set(key, hit);
  }
  return hit;
}
