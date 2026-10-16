/* Rysowanie kawałka mapy (32×32 kafelki) do płótna: teren, cienie, dachy i fasady liczone
   piksel po pikselu, potem drzewa i detale dachów. Ta sama funkcja daje dwa poziomy szczegółów:
   32 px na kafelek (z bliska) i 8 px na kafelek (z daleka). */

import { T } from '../../world/world.ts';
import { type AnyCanvas, type Ctx2D, ctx2d } from './canvas.ts';
import { h2, vnoise } from './hash.ts';
import { C, mix, rgba, shade } from './palette.ts';
import { type BStyle, CHUNK, type ChunkScene, SUB, TILE } from './scene.ts';
import { treeSprite } from './trees.ts';

const PAVED = new Set<number>([T.ROAD, T.PARKING]);

/** kolor terenu (0xRRGGBB) w punkcie grafiki (ax, ay) na kafelku i o kodzie t */
function groundColor(sc: ChunkScene, t: number, i: number, ax: number, ay: number, px: number, py: number): number {
  const w = sc.w;
  const size = w.size;
  const x = i % size;
  const y = (i - x) / size;
  const nN = y > 0 ? w.terr[i - size] : t;
  const nS = y < size - 1 ? w.terr[i + size] : t;
  const nW = x > 0 ? w.terr[i - 1] : t;
  const nE = x < size - 1 ? w.terr[i + 1] : t;
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
  switch (t) {
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
      // trawa przy budynku zacieniona
      break;
    }
    case T.ROAD: {
      const n = vnoise(ax, ay, 160, 21);
      const r = h2(ax, ay, 22);
      c = n < 0.35 ? C.asph0 : n < 0.8 ? C.asph1 : C.asph2;
      if (r < 0.05) c = shade(c, 0.85);
      else if (r > 0.96) c = shade(c, 1.15);
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
      if (ax % 80 < 2 && (ay & 63) < 52) c = shade(C.line, 0.85);
      if (h2(ax >> 3, ay >> 3, 25) < 0.01) c = 0x2a2a2a;
      break;
    }
    case T.SIDEWALK: {
      // płyty 50×50 cm (16 px) z fugami
      const sx = ax >> 4;
      const sy = ay >> 4;
      const r = h2(sx, sy, 31);
      c = r < 0.3 ? C.slab1 : r > 0.85 ? C.slab2 : C.slab0;
      if (h2(sx, sy, 32) < 0.03) c = shade(c, 0.82);
      if ((ax & 15) === 0 || (ay & 15) === 0) {
        c = C.seam;
        if (h2(ax, ay, 33) < 0.25) c = C.grass0;
      } else if (h2(ax, ay, 34) < 0.04) c = shade(c, 0.92);
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
      if (ay % 14 < 5 && h2(ax >> 2, ay >> 2, 82) < 0.75) c = h2(ax >> 1, ay, 83) < 0.3 ? 0x7a9a44 : C.crop;
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
  if (sc.shadow[((ay >> 3) * S + (ax >> 3)) | 0]) c = mix(c, C.shadow, 0.34);
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
      const g = ax % 96;
      if (g < 4) return C.metal1;
      return yIn % 3 === 0 ? shade(C.metal2, 0.85) : C.metal2;
    }
    case 'sklep': {
      if (f === 0) {
        if (yIn >= st.floorH - 2) return h2(st.seed, 1, 5) < 0.5 ? 0x9c3b30 : 0x2f6a8f; // szyld
        return ax % 40 < 3 ? 0x5b5d5f : C.shopGlass;
      }
      break;
    }
    case 'dom': {
      const m = ax % 40;
      if (yIn >= 3 && yIn <= 7 && m >= 12 && m <= 25) return m === 12 || m === 25 ? 0xf2efe7 : C.window;
      return yIn === 0 && f > 0 ? shade(wall, 0.9) : wall;
    }
    default:
      break;
  }
  // blok i reszta: moduł 12 px, okno 6×4 z jasną ramą u góry
  const m = ax % 12;
  const g4 = Math.floor(ax / 24) % 4;
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

function roofColor(
  sc: ChunkScene,
  st: BStyle,
  i: number,
  ax: number,
  ay: number,
  px: number,
  py: number,
  bid: number,
): number {
  const w = sc.w;
  const size = w.size;
  const x = i % size;
  const y = (i - x) / size;
  const other = (j: number, ok: boolean) => !ok || w.bid[j] !== bid;
  const eN = other(i - size, y > 0) ? py : 99;
  const eW = other(i - 1, x > 0) ? px : 99;
  const eE = other(i + 1, x < size - 1) ? 31 - px : 99;
  const edge = Math.min(eN, eW, eE);
  let c: number;
  switch (st.roof) {
    case 'tiles': {
      if (st.ridge === 'h') {
        const north = ay < st.ridgeAt;
        const row = Math.abs(ay - st.ridgeAt);
        c = north ? C.tile1 : C.tile2;
        if (row < 2) return 0x5e2a1d;
        if (row % 7 === 0 || ((ax + ((row / 7) | 0) * 5) % 10 === 0 && row % 7 < 6)) c = shade(c, 0.8);
      } else {
        const west = ax < st.ridgeAt;
        const col = Math.abs(ax - st.ridgeAt);
        c = west ? C.tile1 : C.tile2;
        if (col < 2) return 0x5e2a1d;
        if (col % 7 === 0 || ((ay + ((col / 7) | 0) * 5) % 10 === 0 && col % 7 < 6)) c = shade(c, 0.8);
      }
      if (edge < 2) c = shade(c, 0.7);
      return c;
    }
    case 'metal': {
      c = ax % 6 < 3 ? C.metal0 : C.metal1;
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
  const horiz = b.x1 - b.x0 >= b.y1 - b.y0;
  const box = (x: number, y: number, w: number, h: number, top: string, side: string) => {
    ctx.fillStyle = 'rgba(16,20,28,0.35)';
    ctx.fillRect(x + 4, y - 4, w, h);
    ctx.fillStyle = side;
    ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, h - 4);
  };
  // rząd kominów wentylacyjnych co ~5 m w osi dachu
  const midY = ((b.y0 * TILE + (b.y1 + 1) * TILE - st.facade) / 2) | 0;
  const midX = (((b.x0 + b.x1 + 1) * TILE) / 2) | 0;
  if (horiz) {
    for (let x = b.x0 * TILE + 80; x < (b.x1 + 1) * TILE - 80; x += 160) {
      if (!onRoof(sc, bid, x, midY, 24)) continue;
      box(x - 8, midY - 10, 16, 20, '#8b7f74', '#5f564e');
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(x - 4, midY - 7, 8, 5);
    }
  } else {
    for (let y = b.y0 * TILE + 80; y < (b.y1 + 1) * TILE - st.facade - 40; y += 160) {
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
  const n = 2 + Math.floor(h2(bid, 5, 6) * 4);
  for (let k = 0; k < n; k++) {
    const x = (b.x0 + 1 + h2(bid, k, 7) * (b.x1 - b.x0 - 1)) * TILE;
    const y = (b.y0 + 1 + h2(bid, k, 8) * (b.y1 - b.y0 - 1)) * TILE;
    if (!onRoof(sc, bid, x, y, 20)) continue;
    if (h2(bid, k, 9) < 0.5) {
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
 * Rysuje kawałek (cx, cy) w skali s pikseli na kafelek (32 albo 8) do płótna o boku CHUNK*s.
 * Płótno może być zwykłe (główny wątek) albo OffscreenCanvas (worker).
 */
export function drawChunk(sc: ChunkScene, cx: number, cy: number, s: number, canvas: AnyCanvas): void {
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
      for (let oy = 0; oy < s; oy++) {
        const py = oy * step + off;
        const ay = y * TILE + py;
        let o = (ty * s + oy) * side + tx * s;
        for (let ox = 0; ox < s; ox++) {
          const px = ox * step + off;
          const ax = x * TILE + px;
          let c: number;
          if (st) {
            const fy = sc.south[i] * TILE + (31 - py);
            const fh = Math.min(st.facade, sc.run[i] * TILE - 8);
            if (fy < fh) c = facadeColor(st, ax, fy, door && sc.south[i] === 0, px);
            else if (fy < fh + 3) c = fy === fh ? 0x3f3c38 : C.parapet;
            else c = roofColor(sc, st, i, ax, ay, px, py, bid);
          } else c = groundColor(sc, t, i, ax, ay, px, py);
          out[o++] = rgba(c);
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
    if (b.cls === 'blok' && st.levels >= 5) {
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
    if (st.roof === 'tar' && (b.cls === 'blok' || b.cls === 'inne' || b.cls === 'przychodnia' || b.cls === 'szkola')) {
      roofDetails(ctx, sc, b.id);
    }
    if (b.cls === 'dom') {
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
  // cienie drzew: miękkie elipsy w jednej ścieżce, żeby nakładające się nie ciemniały podwójnie
  const trees = sc.treesBy[cy * sc.chunks + cx];
  if (trees.length) {
    ctx.beginPath();
    for (const t of trees) {
      const sx = (t.x + t.r * 0.45) * TILE;
      const sy = (t.y - 1.2 - t.r * 0.55) * TILE;
      ctx.moveTo(sx + t.r * TILE * 0.95, sy);
      ctx.ellipse(sx, sy, t.r * TILE * 0.95, t.r * TILE * 0.76, 0, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(16,22,34,0.30)';
    ctx.fill();
  }
  // drzewa od tyłu do przodu
  for (const t of trees) {
    const sp = treeSprite(t);
    ctx.drawImage(sp.canvas, t.x * TILE - sp.ax, t.y * TILE - sp.ay);
  }
  ctx.restore();
}
