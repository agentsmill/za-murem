/* Przekrój budynku: wnętrze zamiast dachu przy zbliżeniu. Dane według kontraktu `Interior`
   (docs/M1-wycinek.md, src/world/interior.ts na gałęzi świata), tu jako typy strukturalne, żeby
   rysowanie nie czekało na generator. Z wnętrza powstaje opis kafelka w kształcie `InteriorTile`
   z grafiki zastępczej (src/render/art/wnetrze.ts na gałęzi grafiki), a na razie maluje go
   flatInteriorColor płaskimi kolorami. Przy łączeniu wystarczy podmienić malarza na interiorColor,
   a sprite'y mebli na thingSprite: wejścia i wyjścia mają ten sam kształt. Czyste funkcje bez DOM. */

import type { Dir } from '../world/world.ts';
import { rgba, shade } from './art/palette.ts';

/** kody kafelka wnętrza jak IN w src/world/interior.ts */
export const IN = { NONE: 0, WALL: 1, DOOR: 2, STAIRS: 3, FLOOR: 4 } as const;

export type RoomKind = 'klatka' | 'przedpokoj' | 'pokoj' | 'kuchnia' | 'lazienka';
/** co widać na froncie ściany: wykończenie pomieszczenia na południe od niej albo elewację */
export type Face = RoomKind | 'out';

/** mebel albo inna rzecz na mapie (meble z wnętrza, później rzeczy z symulacji) */
export interface ThingLike {
  kind: string;
  /** lewy górny kafelek i wymiary po obrocie */
  x: number;
  y: number;
  w: number;
  h: number;
  /** ściana, przy której stoi: 0 góra, 1 prawo, 2 dół, 3 lewo */
  rot: 0 | 1 | 2 | 3;
}

/** wnętrze budynku według kontraktu; prawdziwe `Interior` pasuje do tego typu bez zmian */
export interface InteriorLike {
  building: number;
  /** kod kafelka (IN), size×size */
  cell: Uint8Array;
  /** numer pomieszczenia albo −1 */
  room: Int16Array;
  rooms: { id: number; kind: RoomKind; apt: number }[];
  doors: number[];
  windows: number[];
  furniture: ThingLike[];
  sklad: number[];
  home: number;
}

/** to, czego z wnętrza potrzebuje rysowanie kawałków (idzie do workera razem ze sceną) */
export interface SectionScene {
  building: number;
  cell: Uint8Array;
  room: Int16Array;
  /** rodzaj pomieszczenia po jego numerze */
  kinds: RoomKind[];
  windows: Set<number>;
  /** okna świecące nocą (ciepłe pomieszczenie) */
  lit: Set<number>;
}

export function sectionOf(int: InteriorLike): SectionScene {
  const kinds: RoomKind[] = [];
  for (const r of int.rooms) kinds[r.id] = r.kind;
  return {
    building: int.building,
    cell: int.cell,
    room: int.room,
    kinds,
    windows: new Set(int.windows),
    lit: new Set(),
  };
}

/** bity maski sąsiadów jak NB w wnetrze.ts */
export const NB = { N: 1, E: 2, S: 4, W: 8, NE: 16, SE: 32, SW: 64, NW: 128 } as const;

/** opis kafelka wnętrza: ten sam kształt co InteriorTile z grafiki zastępczej */
export type InteriorTileDesc =
  | { kind: 'floor'; room: RoomKind; walls?: number }
  | { kind: 'wall'; mask: number; outer?: boolean; out?: number; face?: Face; facade?: number }
  | { kind: 'door'; vertical: boolean; entrance?: boolean; face?: Face; facade?: number }
  | { kind: 'window'; mask: number; out: number; room: RoomKind; lit?: boolean; facade?: number }
  | { kind: 'stairs'; up: Dir; mask?: number };

const N8: readonly [number, number, number][] = [
  [0, -1, NB.N],
  [1, 0, NB.E],
  [0, 1, NB.S],
  [-1, 0, NB.W],
  [1, -1, NB.NE],
  [1, 1, NB.SE],
  [-1, 1, NB.SW],
  [-1, -1, NB.NW],
];

/**
 * Opis kafelka i (indeks na mapie size×size) przekroju sec albo null poza wnętrzem.
 * facade to kolor elewacji (0xRRGGBB) dla frontów ścian od strony ulicy.
 */
export function describeTile(sec: SectionScene, i: number, size: number, facade: number): InteriorTileDesc | null {
  const c = sec.cell[i];
  if (c === IN.NONE) return null;
  const x = i % size;
  const y = (i - x) / size;
  const at = (dx: number, dy: number): number => {
    const xx = x + dx;
    const yy = y + dy;
    return xx < 0 || yy < 0 || xx >= size || yy >= size ? IN.NONE : sec.cell[yy * size + xx];
  };
  const wallish = (dx: number, dy: number) => {
    const k = at(dx, dy);
    return k === IN.WALL || k === IN.DOOR;
  };
  const kindAt = (dx: number, dy: number): RoomKind | null => {
    const r = sec.room[(y + dy) * size + x + dx];
    return r >= 0 ? (sec.kinds[r] ?? null) : null;
  };
  let mask = 0;
  let out = 0;
  for (const [dx, dy, bit] of N8) {
    if (wallish(dx, dy)) mask |= bit;
    if (bit <= NB.W && at(dx, dy) === IN.NONE) out |= bit;
  }
  // front ściany: co jest na południe od niej (pomieszczenie albo ulica), gdy nie ma tam ściany
  const south = at(0, 1);
  const face: Face | undefined =
    south === IN.WALL || south === IN.DOOR ? undefined : south === IN.NONE ? 'out' : (kindAt(0, 1) ?? undefined);
  switch (c) {
    case IN.FLOOR:
      return { kind: 'floor', room: (sec.room[i] >= 0 && sec.kinds[sec.room[i]]) || 'pokoj', walls: mask };
    case IN.STAIRS: {
      let smask = 0;
      for (const [dx, dy, bit] of N8) if (at(dx, dy) === IN.STAIRS) smask |= bit;
      // wchodzi się od strony posadzki klatki
      const up: Dir = at(0, 1) === IN.FLOOR ? 'N' : at(0, -1) === IN.FLOOR ? 'S' : at(1, 0) === IN.FLOOR ? 'W' : 'E';
      return { kind: 'stairs', up, mask: smask };
    }
    case IN.DOOR:
      return {
        kind: 'door',
        vertical: wallish(0, -1) && wallish(0, 1),
        entrance: out !== 0,
        face,
        facade: face === 'out' ? facade : undefined,
      };
    default: {
      if (sec.windows.has(i) && out) {
        const side = out & NB.N ? NB.N : out & NB.S ? NB.S : out & NB.E ? NB.E : NB.W;
        const [ix, iy] = side === NB.N ? [0, 1] : side === NB.S ? [0, -1] : side === NB.E ? [-1, 0] : [1, 0];
        return {
          kind: 'window',
          mask,
          out: side,
          room: kindAt(ix, iy) ?? 'pokoj',
          lit: sec.lit.has(i),
          facade,
        };
      }
      return { kind: 'wall', mask, outer: out !== 0, out, face, facade: face === 'out' ? facade : undefined };
    }
  }
}

/** wysokość frontu ściany w pikselach (jak FRONT w wnetrze.ts) */
export const FRONT = 12;

const FLOOR_FLAT: Record<RoomKind, number> = {
  klatka: 0x9a958a,
  przedpokoj: 0x8c7f68,
  kuchnia: 0x9e9071,
  pokoj: 0xa07850,
  lazienka: 0xb2c0c2,
};
const WALL_FLAT: Record<RoomKind, number> = {
  klatka: 0xb8b29f,
  przedpokoj: 0xc4bba4,
  kuchnia: 0xcac7b0,
  pokoj: 0xd2cab6,
  lazienka: 0xb6c6c8,
};
const WALL_TOP = 0x45403a;

/**
 * Płaski kolor piksela (px, py w 0..31) kafelka wnętrza (tx, ty): zastępca interiorColor
 * z grafiki, z tym samym wejściem. Posadzki według pomieszczenia, ściany ciemnym wierzchem
 * z jasnym frontem od południa, okna z szybą, drzwi, schody w pasy.
 */
export function flatInteriorColor(t: InteriorTileDesc, _tx: number, _ty: number, px: number, py: number): number {
  const front = py >= 32 - FRONT;
  switch (t.kind) {
    case 'floor':
      return FLOOR_FLAT[t.room];
    case 'stairs': {
      const along = t.up === 'N' || t.up === 'S' ? py : px;
      return (along >> 2) & 1 ? 0x8a857a : 0x6f6a60;
    }
    case 'door': {
      if (front && t.face) return t.entrance ? 0x55606a : 0x6b4a2f;
      const leaf = t.vertical ? px >= 12 && px < 20 : py >= 12 && py < 20;
      return leaf ? (t.entrance ? 0x55606a : 0x6b4a2f) : 0x7d776c;
    }
    case 'window': {
      // front okna w ścianie poziomej: od ulicy elewacja, od środka farba pokoju; szyba w środku frontu
      if (front && (t.out === NB.S || t.out === NB.N)) {
        const pane = px >= 9 && px < 23 && py >= 32 - FRONT + 2 && py < 30;
        if (pane) return t.lit ? 0xf0c66a : 0x8fb4c8;
        return t.out === NB.S ? shade(t.facade ?? 0xb7b2a6, 0.95) : WALL_FLAT[t.room];
      }
      const glass = t.out === NB.N || t.out === NB.S ? py >= 12 && py < 20 : px >= 12 && px < 20;
      return glass ? (t.lit ? 0xf0c66a : 0x8fb4c8) : WALL_TOP;
    }
    default: {
      if (front && t.face) return t.face === 'out' ? (t.facade ?? 0xb7b2a6) : WALL_FLAT[t.face];
      return WALL_TOP;
    }
  }
}

/** sprite rzeczy w formacie grafiki zastępczej: piksele rgba() (0 przezroczysty), kotwica na środku dolnej krawędzi podstawy */
export interface PixelSprite {
  w: number;
  h: number;
  ax: number;
  ay: number;
  px: Uint32Array;
}

/** wysokość (px ekranu) i kolory płaskich mebli: wierzch, front */
const THING_FLAT: Record<string, [number, number, number]> = {
  koza: [13, 0x37332f, 0x262321],
  stol: [12, 0x8a6a48, 0x6a5034],
  krzeslo: [14, 0x7a5a3a, 0x5a4028],
  kuchenka: [14, 0xe2dccb, 0xb9b2a2],
  lodowka: [24, 0xd9dcd6, 0xa9aca6],
  lozko: [8, 0x6b7f9a, 0x4f5f75],
  wersalka: [13, 0x7a5f6e, 0x5a4552],
  mebloscianka: [32, 0x6f5136, 0x4e3a27],
  wanna: [10, 0xe8e6df, 0xbfbcb3],
  sedes: [6, 0xeae8e2, 0xc2c0b8],
  umywalka: [14, 0xe0ddd5, 0xb8b5ad],
};

/**
 * Płaski sprite rzeczy w*h kafelków: wierzch przesunięty w górę o wysokość mebla, pod nim front
 * od południa, ciemny obrys. Zastępca thingSprite z grafiki (ten sam format i kotwica).
 */
export function flatThingSprite(t: ThingLike): PixelSprite {
  const [hgt, top, side] = THING_FLAT[t.kind] ?? [10, 0x8a8478, 0x6a655c];
  const W = t.w * 32;
  const D = t.h * 32;
  const H = D + hgt;
  const px = new Uint32Array(W * H);
  const edge = rgba(shade(side, 0.6));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const border = x === 0 || x === W - 1 || y === 0 || y === H - 1 || y === D;
      px[y * W + x] = border ? edge : rgba(y < D ? top : side);
    }
  return { w: W, h: H, ax: W / 2, ay: H, px };
}
