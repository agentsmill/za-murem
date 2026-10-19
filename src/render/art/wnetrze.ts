/* Wnętrze siedziby rysowane kodem (grafika zastępcza): posadzki, ściany z krótkim frontem od
   południa, drzwi, okna i schody, 32 px na metr jak mapa. Czyste funkcje bez DOM: kolor piksela
   kafelka albo zapis kafelka do bufora Uint32Array w formacie rgba() z palette.ts, więc działa
   w Node, w głównym wątku i w workerze. Wzory liczone od współrzędnych świata, dlatego łączą się
   między kafelkami. Te same argumenty dają zawsze te same piksele. */

import type { Dir } from '../../world/world.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, rgba, shade } from './palette.ts';
import { stropKolor } from './strop.ts';

const PX = 32; // pikseli grafiki na metr (TILE ze scene.ts)
/** wysokość frontu ściany: dolny pas kafelka ściany, kiedy na południe od niej nie ma ściany */
export const FRONT = 12;
const FT = PX - FRONT; // pierwszy wiersz frontu

/** pomieszczenia z kontraktu wnętrza; sala, hala i zaplecze są w budynkach bez mieszkań */
export type RoomKind = 'klatka' | 'przedpokoj' | 'pokoj' | 'kuchnia' | 'lazienka' | 'sala' | 'hala' | 'zaplecze';
export const ROOM_KINDS: readonly RoomKind[] = [
  'klatka',
  'przedpokoj',
  'pokoj',
  'kuchnia',
  'lazienka',
  'sala',
  'hala',
  'zaplecze',
];
/** co widać na froncie ściany: wykończenie pomieszczenia na południe od niej albo elewację */
export type Face = RoomKind | 'out';

/** bity maski sąsiadów; ukosy są potrzebne tylko do narożników wewnętrznych */
export const NB = { N: 1, E: 2, S: 4, W: 8, NE: 16, SE: 32, SW: 64, NW: 128 } as const;

/**
 * Kafelek wnętrza.
 * - floor: posadzka; walls to maska sąsiednich ścian (ciemniej przy ścianach).
 * - wall: mask to sąsiedzi będący ścianą, oknem albo drzwiami; outer dla ściany zewnętrznej,
 *   out to strony wychodzące na zewnątrz budynku (ocieplenie), face to wykończenie frontu,
 *   facade to kolor elewacji (0xRRGGBB) dla face 'out'.
 * - door: vertical, gdy ściana biegnie z północy na południe; entrance dla drzwi frontowych
 *   (szkło w aluminium i domofon); face jak przy ścianie.
 * - window: zawsze w ścianie zewnętrznej; out to strona zewnętrzna (N albo S: okno w ścianie
 *   poziomej, E albo W: w pionowej), room to pomieszczenie po drugiej stronie, lit to nocne okno
 *   ze światłem z wnętrza.
 * - stairs: up to kierunek wchodzenia; mask to sąsiedzi będący schodami (poręcz z pozostałych boków).
 * - strop: widok piętra, płyta stropowa zakrywa posadzkę mieszkania; walls to maska sąsiednich ścian jak w floor.
 */
export type InteriorTile =
  | { kind: 'floor'; room: RoomKind; walls?: number }
  | { kind: 'wall'; mask: number; outer?: boolean; out?: number; face?: Face; facade?: number }
  | {
      kind: 'door';
      vertical: boolean;
      entrance?: boolean;
      face?: Face;
      facade?: number;
      broken?: boolean;
      /** zabite deskami (M2 fala 2): dwie deski w poprzek skrzydła */
      boarded?: boolean;
      /** zamknięte (widok piętra): skrzydło zamyka przejście zamiast progu */
      closed?: boolean;
    }
  | { kind: 'window'; mask: number; out: number; room: RoomKind; lit?: boolean; facade?: number; broken?: boolean }
  | { kind: 'stairs'; up: Dir; mask?: number }
  | { kind: 'strop'; walls?: number };

/** kolory wnętrza; bazowe z palette.ts */
const K = {
  // lastryko w klatce
  terr0: 0x8f8a80,
  terr1: 0x9a958a,
  terr2: 0xa5a094,
  chipW: 0xd3cfc5,
  chipD: 0x4d4944,
  chipR: 0x8a5844,
  strip: 0x7a7262,
  // panele w pokoju
  pan0: 0xa07850,
  pan1: 0x8e6944,
  pan2: 0xaf875b,
  panWorn: 0xc4a47c,
  screed: 0x8a877f,
  // linoleum w kuchni: ośmiokąty z kostką
  lkLight: 0xcdbf9b,
  lkLine: 0x9d8e70,
  lkDot: 0x8b4a30,
  lkFade: 0xbcb091,
  backing: 0x8a8273,
  // linoleum w przedpokoju: nadruk mozaiki parkietowej
  lh0: 0x8a6440,
  lh1: 0x81603d,
  lh2: 0x926b45,
  lhSeam: 0x6e5034,
  // drobne kafelki w łazience
  bt0: 0xd3d8d4,
  bt1: 0xa7bfc6,
  grout: 0x8e9793,
  cement: 0x7e7c76,
  // beton w hali
  con0: 0x8b8984,
  con1: 0x84827d,
  con2: 0x93918b,
  oil: 0x2f2c28,
  // gładkie linoleum na zapleczu
  lp0: 0x8f9a86,
  lp1: 0x8a9581,
  lp2: 0x959f8c,
  // ściany: wierzch (przekrój) i ocieplenie
  capIn: 0x8a847a,
  capIn2: 0x837d73,
  capOut: 0x6d6963,
  capOut2: 0x67635d,
  edge: 0x2f2b27,
  styro: 0xd9d1bb,
  // wykończenia frontu
  whitewash: 0xd7d1c2,
  plaster: 0xa9a49a,
  tap0: 0xc8b88f,
  tap1: 0xb4a27a,
  tapDot: 0x8e6e50,
  hall0: 0xb9ad93,
  hall1: 0x9f9278,
  skirt: 0x5e4330,
  kitPaint: 0xd6ca97,
  tileW: 0xdcdcd3,
  tileB: 0xb3c9cf,
  // drzwi
  ven0: 0x8a5a36,
  ven1: 0x774c2d,
  frame: 0xd8d2c5,
  threshold: 0x8c6c48,
  handle: 0xc2bcac,
  alu: 0x5b4b3d,
  plate: 0x8e9193,
  screen: 0x1b2124,
  // okna
  pvc: 0xe4e1d9,
  glass: 0x8aa3b1,
  glassHi: 0xb3c7d1,
  sill: 0xe0dbcf,
  tin: 0x9a9d9d,
  nightGlass: 0x2d2822,
  nightGlint: 0x7d5c38,
  lace: 0xf8e2ad,
  pot: 0x9c5a3a,
  stick: 0x6b5a3a,
  // schody
  tread: 0xaaa59a,
  nosing: 0xc4bfb3,
  riser: 0x7d786e,
  rail: 0x5a3a26,
  railHi: 0x7a5236,
  steel: 0x3a3e3a,
} as const;

/** lamperia w klatce (olejna do wysokości półtora metra): zielona, niebieska, brązowa, oliwkowa */
/** kolory szyb (wybite okno zamienia je na dziurę z resztkami szkła) */
const GLASS = new Set<number>([K.glass, K.glassHi, K.nightGlass, K.nightGlint, C.window, C.windowHi, C.windowLit]);

const LAMP = [0x5f7356, 0x4f6a7a, 0x7a5f45, 0x7d8a5a] as const;
/** zasłony */
const CURTAIN = [0x8a3b32, 0x5d6b45, 0xa58a4a, 0x4a5a7a] as const;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** maska sąsiadów z predykatu (dx, dy) → czy tam stoi ściana, okno albo drzwi */
export function maskOf(isWall: (dx: number, dy: number) => boolean): number {
  let m = 0;
  if (isWall(0, -1)) m |= NB.N;
  if (isWall(1, 0)) m |= NB.E;
  if (isWall(0, 1)) m |= NB.S;
  if (isWall(-1, 0)) m |= NB.W;
  if (isWall(1, -1)) m |= NB.NE;
  if (isWall(1, 1)) m |= NB.SE;
  if (isWall(-1, 1)) m |= NB.SW;
  if (isWall(-1, -1)) m |= NB.NW;
  return m;
}

// ---------------------------------------------------------------- posadzki

function terrazzo(ax: number, ay: number, s: number, light = false): number {
  const n = vnoise(ax, ay, 40, s + 101);
  let c: number = n < 0.42 ? K.terr0 : n < 0.78 ? K.terr1 : K.terr2;
  if (light) c = shade(c, 1.12);
  const r = h2(ax, ay, s + 102);
  if (r < 0.05) c = K.chipD;
  else if (r < 0.1) c = K.chipW;
  else if (r < 0.115) c = K.chipR;
  else if (r < 0.15) c = shade(c, 0.92);
  const r2 = h2(ax >> 1, ay >> 1, s + 103);
  if (r2 < 0.012) c = K.chipW;
  else if (r2 > 0.992) c = K.chipD;
  // listwy dylatacyjne co metr (w sali co dwa)
  const grid = light ? 63 : 31;
  if ((ax & grid) === 0 || (ay & grid) === 0) c = K.strip;
  // wydeptane i brudne
  if (vnoise(ax, ay, 80, s + 104) > 0.7) c = shade(c, 0.92);
  return c;
}

function panels(ax: number, ay: number, s: number): number {
  const row = ay >> 3; // deski po 25 cm
  const u = ax + Math.floor(h2(row, 7, s + 201) * 48);
  const col = Math.floor(u / 48); // po półtora metra
  const t = h2(col, row, s + 202);
  let c: number = t < 0.33 ? K.pan0 : t < 0.66 ? K.pan1 : K.pan2;
  // nadruk słojów: smużki wzdłuż deski
  const g = vnoise(u, (ay & 7) * 16 + row * 131, 16, s + 203);
  if (g > 0.74) c = shade(c, 0.9);
  else if (g < 0.12) c = shade(c, 1.06);
  // przetarcia
  if (vnoise(ax, ay, 72, s + 204) > 0.74) c = mix(c, K.panWorn, 0.35);
  // fugi
  if ((ay & 7) === 7) c = shade(c, 0.8);
  else if (mod(u, 48) === 0) c = shade(c, 0.72);
  // brak deski: widać wylewkę
  if (h2(col, row, s + 205) < 0.006) c = h2(ax, ay, s + 206) < 0.2 ? shade(K.screed, 0.88) : K.screed;
  return c;
}

/** linoleum w kuchni: kremowe ośmiokąty, rude kostki na stykach */
function linoKitchen(ax: number, ay: number, s: number): number {
  const cx = ax & 15;
  const cy = ay & 15;
  const dx = Math.min(cx, 16 - cx);
  const dy = Math.min(cy, 16 - cy);
  let c: number;
  if (dx + dy <= 2) c = K.lkDot;
  else if (dx + dy === 3 || cx === 0 || cy === 0) c = K.lkLine;
  else c = h2(ax, ay, s + 301) < 0.06 ? shade(K.lkLight, 0.95) : K.lkLight;
  // wytarte przejście: kolor blednie
  if (vnoise(ax, ay, 64, s + 302) > 0.66) c = mix(c, K.lkFade, 0.5);
  // przetarcia do podkładu w kilku miejscach
  if (h2(ax >> 5, ay >> 5, s + 304) < 0.08 && vnoise(ax, ay, 10, s + 303) > 0.84) c = K.backing;
  return c;
}

/** linoleum w przedpokoju: nadruk mozaiki parkietowej (kwadraty z czterech klepek) */
function linoHall(ax: number, ay: number, s: number): number {
  const bx = ax >> 4;
  const by = ay >> 4;
  const horiz = ((bx + by) & 1) === 0;
  const across = horiz ? ay & 15 : ax & 15;
  const along = horiz ? ax & 15 : ay & 15;
  const strip = across >> 2;
  const t = h2(bx * 4 + strip, by, s + 401);
  let c: number = t < 0.4 ? K.lh0 : t < 0.75 ? K.lh1 : K.lh2;
  if ((across & 3) === 3 || along === 15) c = K.lhSeam;
  else if (h2(horiz ? ax >> 2 : ax, horiz ? ay : ay >> 2, s + 402) < 0.1) c = shade(c, 0.92);
  if (vnoise(ax, ay, 56, s + 403) > 0.7) c = shade(c, 1.07); // wytarty połysk
  return c;
}

/** drobne kafelki w łazience: biel i błękit, tu i ówdzie pęknięty albo odpadnięty */
function bathTiles(ax: number, ay: number, s: number): number {
  const cx = ax & 7;
  const cy = ay & 7;
  if (cx === 7 || cy === 7) return K.grout;
  const t = h2(ax >> 3, ay >> 3, s + 501);
  if (t > 0.985) return h2(ax, ay, s + 502) < 0.3 ? shade(K.cement, 0.9) : K.cement;
  let c: number = t < 0.24 ? K.bt1 : K.bt0;
  if (t > 0.955 && cx === cy) c = shade(c, 0.66);
  else if (cx === 0 || cy === 0) c = shade(c, 1.04);
  if (vnoise(ax, ay, 48, s + 503) > 0.72) c = shade(c, 0.94);
  return c;
}

/** beton w hali: dylatacje co 3 m, rysy, plamy oleju */
function concrete(ax: number, ay: number, s: number): number {
  const n = vnoise(ax, ay, 56, s + 901);
  let c: number = n < 0.45 ? K.con0 : n < 0.8 ? K.con1 : K.con2;
  const r = h2(ax, ay, s + 902);
  if (r < 0.04) c = shade(c, 0.9);
  else if (r > 0.97) c = shade(c, 1.06);
  if (mod(ax, 96) === 0 || mod(ay, 96) === 0) return shade(K.con0, 0.75);
  if (Math.abs(vnoise(ax, ay, 22, s + 903) - 0.5) < 0.012 && vnoise(ax, ay, 90, s + 904) > 0.55) c = shade(c, 0.72);
  if (vnoise(ax, ay, 18, s + 905) > 0.84 && h2(ax >> 5, ay >> 5, s + 906) < 0.3) c = mix(c, K.oil, 0.45);
  return c;
}

/** gładkie linoleum z arkuszy po dwa metry */
function linoPlain(ax: number, ay: number, s: number): number {
  const n = vnoise(ax, ay, 24, s + 951);
  let c: number = n < 0.45 ? K.lp0 : n < 0.8 ? K.lp1 : K.lp2;
  if (h2(ax, ay, s + 953) < 0.05) c = shade(c, 0.92);
  if (mod(ay, 64) === 0) return shade(K.lp0, 0.8);
  if (vnoise(ax, ay, 64, s + 952) > 0.72) c = shade(c, 1.06);
  return c;
}

function floorColor(room: RoomKind, ax: number, ay: number, s: number): number {
  switch (room) {
    case 'sala':
      return terrazzo(ax, ay, s, true);
    case 'hala':
      return concrete(ax, ay, s);
    case 'zaplecze':
      return linoPlain(ax, ay, s);
    case 'klatka':
      return terrazzo(ax, ay, s);
    case 'pokoj':
      return panels(ax, ay, s);
    case 'kuchnia':
      return linoKitchen(ax, ay, s);
    case 'przedpokoj':
      return linoHall(ax, ay, s);
    case 'lazienka':
      return bathTiles(ax, ay, s);
    default:
      return 0xff00ff;
  }
}

/** przyciemnienie posadzki przy ścianach */
function nearWalls(walls: number, px: number, py: number): number {
  let d = 9;
  if (walls & NB.N) d = Math.min(d, py);
  if (walls & NB.S) d = Math.min(d, 31 - py);
  if (walls & NB.W) d = Math.min(d, px);
  if (walls & NB.E) d = Math.min(d, 31 - px);
  if (walls & NB.NE) d = Math.min(d, Math.max(py, 31 - px));
  if (walls & NB.NW) d = Math.min(d, Math.max(py, px));
  if (walls & NB.SE) d = Math.min(d, Math.max(31 - py, 31 - px));
  if (walls & NB.SW) d = Math.min(d, Math.max(31 - py, px));
  return d === 0 ? 0.76 : d === 1 ? 0.85 : d === 2 ? 0.92 : 1;
}

// ---------------------------------------------------------------- ściany

function capColor(outer: boolean, ax: number, ay: number, s: number): number {
  const n = vnoise(ax, ay, 24, s + 601);
  const r = h2(ax, ay, s + 602);
  if (outer) {
    let c: number = n < 0.5 ? K.capOut : K.capOut2;
    if (r < 0.07)
      c = shade(c, 0.86); // kruszywo w betonie
    else if (r > 0.96) c = shade(c, 1.1);
    return c;
  }
  let c: number = n < 0.55 ? K.capIn : K.capIn2;
  if (r < 0.03) c = shade(c, 0.93);
  return c;
}

/** wykończenie frontu: f to wiersz od góry frontu (0..FRONT-1), ax kolumna świata */
function finish(face: Face, facade: number, ax: number, f: number, s: number): number {
  switch (face) {
    case 'hala': {
      // surowy beton z fugami płyt i zaciekami
      if (f === 11) return shade(K.con0, 0.7);
      if (mod(ax, 48) === 0 || f === 0) return shade(K.con0, 0.82);
      return h2(ax >> 1, f, s + 607) < 0.06 ? shade(K.con1, 0.9) : K.con1;
    }
    case 'klatka':
    case 'sala':
    case 'zaplecze': {
      // lamperia olejna, nad nią bielone
      const lamp = LAMP[Math.floor(h2(s, 1, 603) * LAMP.length)];
      if (f < 4) return f === 0 ? shade(K.whitewash, 0.9) : K.whitewash;
      if (f === 4) return shade(lamp, 0.62);
      if (f === 11) return shade(lamp, 0.7);
      if (h2(ax >> 1, f >> 1, s + 604) < 0.04) return K.plaster; // odprysk farby
      return (ax + f * 3) % 11 === 0 ? shade(lamp, 1.1) : lamp;
    }
    case 'pokoj': {
      // tapeta w pasy z drobnym wzorkiem, listwa przypodłogowa
      if (f >= 10) return f === 10 ? shade(K.skirt, 1.25) : K.skirt;
      if (f === 0) return shade(K.tap0, 0.86);
      const m = mod(ax, 8);
      if (m === 5 && f % 4 === 2) return K.tapDot;
      return m < 2 ? K.tap1 : K.tap0;
    }
    case 'przedpokoj': {
      // tapeta w romby
      if (f >= 10) return f === 10 ? shade(K.skirt, 1.25) : K.skirt;
      if (f === 0) return shade(K.hall0, 0.86);
      const d = Math.abs(mod(ax, 6) - 3) + Math.abs(mod(f, 6) - 3);
      return d === 3 ? K.hall1 : K.hall0;
    }
    case 'kuchnia': {
      // farba olejna, niżej pas glazury
      if (f < 5) return f === 0 ? shade(K.kitPaint, 0.86) : K.kitPaint;
      if (f === 5 || f === 8 || mod(ax + (f > 8 ? 2 : 0), 5) === 0) return shade(K.tileW, 0.8);
      return f === 11 ? shade(K.tileW, 0.88) : K.tileW;
    }
    case 'lazienka': {
      // glazura do sufitu
      if (f === 0) return shade(K.tileB, 0.8);
      if (f % 4 === 0 || mod(ax, 4) === 0) return shade(K.tileB, 0.82);
      return h2(ax >> 2, f >> 2, s + 605) < 0.2 ? K.tileW : K.tileB;
    }
    default: {
      // elewacja z cokołem
      if (f >= 9) return f === 9 ? shade(C.plinth, 1.12) : C.plinth;
      if (f === 0) return shade(facade, 0.84);
      if (mod(ax, 36) === 0) return shade(facade, 0.88);
      return h2(ax, f, s + 606) < 0.05 ? shade(facade, 0.94) : facade;
    }
  }
}

/** wierzch ściany z obrysem tam, gdzie nie ma sąsiedniej ściany */
function capWithEdges(
  outer: boolean,
  m: number,
  out: number,
  facade: number,
  ax: number,
  ay: number,
  px: number,
  py: number,
  bottom: number,
  s: number,
): number {
  // ocieplenie od strony zewnętrznej: tynk, styropian
  if (outer && out) {
    const d = Math.min(
      out & NB.N ? py : 9,
      out & NB.S ? bottom - 1 - py : 9,
      out & NB.W ? px : 9,
      out & NB.E ? 31 - px : 9,
    );
    if (d === 0) return shade(facade, 0.92);
    if (d < 4) return h2(ax, ay, s + 607) < 0.08 ? shade(K.styro, 0.93) : K.styro;
  }
  let c = capColor(outer, ax, ay, s);
  const edge =
    (!(m & NB.N) && py === 0) ||
    (!(m & NB.W) && px === 0) ||
    (!(m & NB.E) && px === 31) ||
    // narożniki wewnętrzne
    (m & NB.N && m & NB.E && !(m & NB.NE) && px === 31 && py === 0) ||
    (m & NB.N && m & NB.W && !(m & NB.NW) && px === 0 && py === 0) ||
    (m & NB.S && m & NB.E && !(m & NB.SE) && px === 31 && py >= FT) ||
    (m & NB.S && m & NB.W && !(m & NB.SW) && px === 0 && py >= FT);
  if (edge) c = K.edge;
  else if (bottom < PX && py === bottom - 1) c = shade(c, 1.12); // oświetlona krawędź nad frontem
  return c;
}

function wallColor(
  t: Extract<InteriorTile, { kind: 'wall' }>,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
) {
  const m = t.mask;
  const facade = t.facade ?? C.wallGrey;
  const front = !(m & NB.S);
  if (front && py >= FT) {
    let c = finish(t.face ?? 'pokoj', facade, ax, py - FT, s);
    if ((!(m & NB.W) && px === 0) || (!(m & NB.E) && px === 31)) c = shade(c, 0.6); // koniec ściany
    return c;
  }
  return capWithEdges(!!t.outer, m, t.out ?? 0, facade, ax, ay, px, py, front ? FT : PX, s);
}

// ---------------------------------------------------------------- drzwi

function doorColor(
  t: Extract<InteriorTile, { kind: 'door' }>,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
) {
  const ent = !!t.entrance;
  const facade = t.facade ?? C.wallGrey;
  const leaf = ent ? K.alu : K.ven0;
  if (t.boarded) {
    const c = boards(t.vertical, px, py, s);
    if (c !== null) return c;
  }
  if (t.closed) {
    const c = closedLeaf(t.vertical, leaf, ax, ay, px, py, s);
    if (c !== null) return c;
  }
  if (!t.vertical) {
    if (py >= FT) {
      // front: ościeżnica, skrzydło, nad nim kawałek ściany
      const f = py - FT;
      const face = t.face ?? 'pokoj';
      // wyważone: skrzydło wisi krzywo na dolnym zawiasie, w ościeżnicy ciemny otwór i drzazgi
      if (t.broken && px >= 3 && px <= 28 && f >= 2 && f <= 11) {
        if (px === 3 || px === 28) return h2(px, f, s + 711) < 0.4 ? K.ven1 : K.frame;
        const hang = px - 4 < (f - 3) * 1.6;
        if (hang && px <= 12) return h2(px, f, s + 712) < 0.2 ? shade(K.ven0, 0.7) : K.ven0;
        if (f === 11) return shade(K.threshold, 0.8);
        return h2(px >> 1, f, s + 713) < 0.06 ? 0x5a4a38 : 0x1e1a17;
      }
      if (px <= 2 || px >= 29 || f < 2) {
        // domofon przy drzwiach frontowych: czeka na aktualizację
        if (ent && px >= 29 && f >= 3 && f <= 8) {
          if (f >= 4 && f <= 5 && px >= 30) return f === 4 && px === 30 ? 0x56708a : K.screen;
          if (f === 7 && px === 30) return K.screen;
          return f === 3 || px === 29 ? shade(K.plate, 0.85) : K.plate;
        }
        return finish(face, facade, ax, f, s);
      }
      if (px === 3 || px === 28 || f === 2) return ent ? shade(K.alu, 0.8) : K.frame;
      if (f === 11) return shade(leaf, 0.55);
      if (ent) {
        // szkło w aluminiowej ramie
        if (px <= 5 || px >= 26 || f <= 3 || f >= 10) return K.alu;
        if (f === 7) return K.handle;
        return f === 4 && px < 12 ? C.windowHi : C.shopGlass;
      }
      if (px >= 22 && px <= 25 && f === 6) return px === 22 ? shade(K.handle, 0.7) : K.handle;
      if (px === 24 && f === 8) return 0x221c18;
      const g = vnoise(ax * 3, f, 9, s + 701);
      return g > 0.66 ? K.ven1 : g < 0.12 ? shade(K.ven0, 1.08) : K.ven0;
    }
    if (py >= FT - 2) {
      // przecięte skrzydło widziane z góry
      if (px <= 2 || px >= 29) return capWithEdges(ent, NB.E | NB.W, 0, facade, ax, ay, px, py, FT, s);
      if (px === 3 || px === 28) return ent ? shade(K.alu, 0.8) : K.frame;
      if (t.broken && px > 9) return threshold(ent, ax, ay, s);
      return py === FT - 2 ? shade(leaf, 1.15) : leaf;
    }
    // ościeże: kawałki ściany po bokach, w środku próg
    if (px <= 2 || px >= 29) {
      const c = capColor(ent, ax, ay, s);
      return py === 0 || px === 2 || px === 29 ? K.edge : c;
    }
    return threshold(ent, ax, ay, s);
  }
  // drzwi w ścianie pionowej: ościeża u góry i u dołu, skrzydło widać z góry jako listwę
  if (py <= 2 || py >= 29) {
    const c = capColor(ent, ax, ay, s);
    return px === 0 || px === 31 || py === 2 || py === 29 ? K.edge : c;
  }
  if (px >= 14 && px <= 16) {
    if (py === 3 || py === 28) return ent ? shade(K.alu, 0.8) : K.frame;
    // wyważone: skrzydło zostało tylko przy zawiasie, dalej drzazgi
    if (t.broken && py > 9) return h2(px, py, s + 714) < 0.25 ? K.ven1 : threshold(ent, ax, ay, s);
    return px === 14 ? shade(leaf, 1.15) : px === 16 ? shade(leaf, 0.75) : leaf;
  }
  return threshold(ent, ax, ay, s);
}

/** deski na zabitych drzwiach: na froncie (drzwi w ścianie poziomej) dwie deski w poprzek skrzydła, z góry (ościeże
    i drzwi w ścianie pionowej) deski w poprzek przejścia; gwoździe na końcach; null: tu nie ma deski */
function boards(vertical: boolean, px: number, py: number, s: number): number | null {
  const wood = (a: number, b: number) => {
    if (a === 0 || a === 27) return 0x2b2622; // gwóźdź
    return h2(a >> 2, b, s + 731) < 0.18 ? 0x6b5133 : b % 3 === 0 ? 0x7d603d : 0x8f7048;
  };
  if (!vertical) {
    if (py >= FT) {
      const f = py - FT;
      if (px >= 2 && px <= 29 && ((f >= 3 && f <= 4) || (f >= 8 && f <= 9))) return wood(px - 2, f);
      return null;
    }
    if (py >= FT - 2 && px >= 3 && px <= 28) return wood(px - 3, py);
    return null;
  }
  if (py >= 4 && py <= 27 && ((px >= 9 && px <= 11) || (px >= 20 && px <= 22))) return wood(py - 4, px);
  return null;
}

/** skrzydło zamkniętych drzwi widziane z góry, zamiast progu: jasna płyta drewna między ościeżnicami, klamka przy
    krawędzi; null: tu drzwi wyglądają jak zawsze (front ściany, ościeża, przecięte skrzydło przy froncie) */
function closedLeaf(
  vertical: boolean,
  leaf: number,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
): number | null {
  // u biegnie wzdłuż skrzydła, v w poprzek: słoje wzdłuż, wierzch jaśniejszy od frontu
  const wood = (u: number, v: number) => {
    const g = vnoise(u, v * 3, 9, s + 703);
    return shade(g > 0.66 ? K.ven1 : g < 0.12 ? shade(leaf, 1.08) : leaf, 1.12);
  };
  if (!vertical) {
    if (py >= FT - 2 || px <= 2 || px >= 29) return null;
    if (px === 3 || px === 28) return K.frame;
    if (py === 0) return K.edge;
    if (px >= 23 && px <= 24 && py >= 9 && py <= 10) return K.handle;
    return wood(ax, ay);
  }
  if (py <= 2 || py >= 29) return null;
  if (py === 3 || py === 28) return K.frame;
  if (px === 0 || px === 31) return K.edge;
  if (py >= 23 && py <= 24 && px >= 9 && px <= 10) return K.handle;
  return wood(ay, ax);
}

function threshold(ent: boolean, ax: number, ay: number, s: number): number {
  if (ent) return shade(terrazzo(ax, ay, s), 0.92);
  return (ay & 3) === 3
    ? shade(K.threshold, 0.85)
    : h2(ax >> 2, ay, s + 702) < 0.15
      ? shade(K.threshold, 1.06)
      : K.threshold;
}

// ---------------------------------------------------------------- okna

/**
 * Wierzch okna w przekroju; a to odległość od zewnętrznej krawędzi ściany, b położenie wzdłuż ściany.
 * Warstwy: tynk i styropian, blaszany parapet, rama, szyba, rama, parapet wewnętrzny, dalej beton.
 */
function windowCap(lit: boolean, facade: number, a: number, b: number, ax: number, ay: number, s: number): number {
  if (a < 1) return shade(facade, 0.92);
  if (a < 3) return K.styro;
  const jamb = b <= 1 || b >= 30;
  if (jamb || a >= 17) {
    // ościeże i beton za parapetem
    const c = capColor(true, ax, ay, s);
    return jamb && a <= 16 && (b === 1 || b === 30) ? K.edge : c;
  }
  if (a < 5) return a === 3 ? shade(K.tin, 1.1) : K.tin;
  if (a === 5 || a === 10) return K.pvc;
  if (a < 10) {
    if (lit) return a === 7 ? 0xfbe3a0 : C.windowLit;
    return a === 6 ? K.glassHi : K.glass;
  }
  // parapet wewnętrzny, czasem doniczka z uschniętym kwiatkiem
  const pot = h2(Math.floor(ax / 32), Math.floor(ay / 32), s + 801) < 0.35;
  if (pot && b >= 20 && b <= 24 && a >= 12 && a <= 15)
    return a === 12 || b === 20 || b === 24 ? shade(K.pot, 0.8) : K.pot;
  if (pot && b >= 21 && b <= 23 && a === 11) return K.stick;
  return a === 16 ? shade(K.sill, 0.8) : K.sill;
}

/** front okna od środka: ściana pokoju, rama, szyby, zasłony */
function windowInside(room: RoomKind, lit: boolean, ax: number, f: number, b: number, s: number): number {
  const home = room === 'pokoj' || room === 'kuchnia' || room === 'przedpokoj';
  const curtains = home && h2(Math.floor(ax / 32), 3, s + 802) < 0.7;
  const cc = CURTAIN[Math.floor(h2(Math.floor(ax / 32), 4, s + 803) * CURTAIN.length)];
  if (curtains && f >= 1 && f <= 10 && ((b >= 2 && b <= 5) || (b >= 26 && b <= 29)))
    return (b & 1) === 0 ? cc : shade(cc, 0.8);
  if (f === 10 && b >= 2 && b <= 29) return K.sill;
  if (b < 3 || b > 28 || f < 1 || f > 9) return finish(room, C.wallGrey, ax, f, s);
  if (b === 3 || b === 28 || f === 1 || f === 9 || b === 15 || b === 16) return K.pvc;
  if (lit) return (b + f * 2) % 9 === 0 ? K.nightGlint : K.nightGlass;
  if (f <= 3) return K.glassHi;
  return (b + f) % 13 === 0 ? K.glassHi : K.glass;
}

/** front okna od zewnątrz: elewacja, rama, szyby (nocą ciepłe światło i firanka), parapet z blachy */
function windowOutside(facade: number, lit: boolean, ax: number, f: number, b: number, s: number): number {
  if (f === 9 && b >= 3 && b <= 28) return K.tin;
  if (b < 4 || b > 27 || f < 1 || f > 8) return finish('out', facade, ax, f, s);
  if (b === 4 || b === 27 || f === 1 || f === 8 || b === 15 || b === 16) return K.pvc;
  if (lit) return f <= 3 && ((b + f) & 1) === 0 ? K.lace : C.windowLit;
  return f === 2 && b < 10 ? C.windowHi : C.window;
}

function windowColor(
  t: Extract<InteriorTile, { kind: 'window' }>,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
) {
  const c = windowPixel(t, ax, ay, px, py, s);
  // wybite: zamiast szyby ciemna dziura, przy ramie ostre resztki szkła
  if (t.broken && GLASS.has(c)) return h2(ax, ay, s + 721) < 0.22 ? K.glassHi : 0x16181a;
  return c;
}

function windowPixel(
  t: Extract<InteriorTile, { kind: 'window' }>,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
) {
  const lit = !!t.lit && !t.broken;
  const facade = t.facade ?? C.wallGrey;
  const vertical = (t.out & (NB.E | NB.W)) !== 0;
  const front = !(t.mask & NB.S);
  if (front && py >= FT) {
    const f = py - FT;
    if (vertical) return finish(t.room, facade, ax, f, s);
    return t.out & NB.N ? windowInside(t.room, lit, ax, f, px, s) : windowOutside(facade, lit, ax, f, px, s);
  }
  const T = front ? FT : PX;
  if (vertical) return windowCap(lit, facade, t.out & NB.E ? 31 - px : px, py, ax, ay, s);
  return windowCap(lit, facade, t.out & NB.N ? py : T - 1 - py, px, ax, ay, s);
}

// ---------------------------------------------------------------- schody

function stairsColor(
  t: Extract<InteriorTile, { kind: 'stairs' }>,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
) {
  const m = t.mask ?? 0;
  const ns = t.up === 'N' || t.up === 'S';
  // poręcz: stalowa balustrada z brązowym pochwytem z boku biegu
  const side = ns
    ? Math.min(m & NB.W ? 9 : px, m & NB.E ? 9 : 31 - px)
    : Math.min(m & NB.N ? 9 : py, m & NB.S ? 9 : 31 - py);
  if (side === 0) return K.steel;
  if (side === 1) return K.railHi;
  if (side === 2) return K.rail;
  if (side === 3) return shade(terrazzo(ax, ay, s), 0.7);
  const f = (ns ? ay : ax) & 7;
  const base = mix(terrazzo(ax, ay, s + 9), K.tread, 0.5);
  switch (t.up) {
    case 'N':
      // stopnie rosną ku północy: widać podstopnice od południa
      return f <= 4 ? base : f === 5 ? K.nosing : K.riser;
    case 'S':
      return f === 0 ? shade(K.riser, 0.8) : f === 7 ? K.nosing : base;
    case 'E':
      return f === 0 ? K.nosing : f === 7 ? shade(K.riser, 0.85) : base;
    default:
      return f === 7 ? K.nosing : f === 0 ? shade(K.riser, 0.85) : base;
  }
}

// ---------------------------------------------------------------- wejście

/**
 * Kolor (0xRRGGBB) piksela (px, py) w kafelku wnętrza (tx, ty); px, py w 0..31.
 * seed różnicuje zużycie i kolory (np. lamperię w klatce).
 */
export function interiorColor(t: InteriorTile, tx: number, ty: number, px: number, py: number, seed = 0): number {
  const ax = tx * PX + px;
  const ay = ty * PX + py;
  const s = seed | 0;
  switch (t.kind) {
    case 'floor': {
      const c = floorColor(t.room, ax, ay, s);
      const k = t.walls ? nearWalls(t.walls, px, py) : 1;
      return k < 1 ? shade(c, k) : c;
    }
    case 'wall':
      return wallColor(t, ax, ay, px, py, s);
    case 'door':
      return doorColor(t, ax, ay, px, py, s);
    case 'window':
      return windowColor(t, ax, ay, px, py, s);
    case 'stairs':
      return stairsColor(t, ax, ay, px, py, s);
    case 'strop':
      return stropKolor(null, ax, ay);
    default:
      return 0xff00ff;
  }
}

/**
 * Rysuje kafelek (tx, ty) do bufora dst (szerokość dw, wysokość z długości) od piksela (ox, oy).
 * scale to pikseli na kafelek: 32 z bliska albo mniej (próbkowanie jak w chunkArt). Piksele poza
 * buforem są pomijane.
 */
export function drawInteriorTile(
  dst: Uint32Array,
  dw: number,
  ox: number,
  oy: number,
  t: InteriorTile,
  tx: number,
  ty: number,
  seed = 0,
  scale = PX,
): void {
  const dh = Math.floor(dst.length / dw);
  const step = PX / scale;
  const off = step >> 1;
  for (let j = 0; j < scale; j++) {
    const y = oy + j;
    if (y < 0 || y >= dh) continue;
    const py = j * step + off;
    for (let i = 0; i < scale; i++) {
      const x = ox + i;
      if (x < 0 || x >= dw) continue;
      dst[y * dw + x] = rgba(interiorColor(t, tx, ty, i * step + off, py, seed));
    }
  }
}
