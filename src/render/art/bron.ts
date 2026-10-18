/* Broń w ręce rysowana kodem (grafika zastępcza): nakładka na klatkę człowieka z atlasu ludzi. Komórka 64×64,
   w niej klatka postaci 32×48 przesunięta o (16, 8), więc kotwica (stopy) wypada w (32, 53), a broń może
   wystawać poza klatkę postaci (dzida, strzał z boku). Położenie dłoni i kąt broni dla każdej pozy daje handOf;
   z tego samego korzysta atlas ludzi, rysując rękę do dłoni. Kierunek 2 to odbity kierunek 3. */

import type { WeaponId } from '../../sim/bron.ts';
import { type AnyCanvas, ctx2d, newCanvas } from './canvas.ts';
import { css, shade } from './palette.ts';

export type ArmPose = 'hold' | 'swing' | 'aim';
/** komórki na kierunek: trzymanie, cios (3 klatki), celowanie (2 klatki) */
export const ARM_SLOTS = 6;
export const slotOf = (pose: ArmPose, f: number): number => (pose === 'hold' ? 0 : pose === 'swing' ? 1 + f : 4 + f);
/** broń z nakładką (gołe ręce bez) w kolejności wierszy atlasu */
export const ARMED: readonly WeaponId[] = ['noz', 'siekiera', 'lom', 'kij', 'dzida', 'kusza', 'rewolwer', 'strzelba'];
export const CELL = 64;
/** przesunięcie klatki postaci w komórce i kotwica (stopy) */
export const OX = 16;
export const OY = 8;
export const ANCHOR_Y = OY + 45;
export const WEAPON_W = 4 * ARM_SLOTS * CELL;
export const WEAPON_H = ARMED.length * CELL;

const RANGED = new Set<WeaponId>(['kusza', 'rewolwer', 'strzelba']);
export const isRangedId = (id: WeaponId | null | undefined): boolean => !!id && RANGED.has(id);

/** komórka atlasu broni: x, y, szerokość, wysokość */
export function weaponRect(id: WeaponId, pose: ArmPose, dir: number, f: number): [number, number, number, number] {
  const row = ARMED.indexOf(id);
  return [((dir & 3) * ARM_SLOTS + slotOf(pose, f)) * CELL, Math.max(0, row) * CELL, CELL, CELL];
}

export interface Hand {
  /** dłoń w pikselach klatki postaci 32×48 */
  x: number;
  y: number;
  /** kąt broni: 0 w prawo, π/2 w dół */
  a: number;
  /** skrót perspektywy: broń skierowana do patrzącego albo od niego jest krótsza */
  k: number;
}

const SPEAR = new Set<WeaponId>(['dzida']);
/** dzida bije pchnięciem: w pozie celowania, nie zamachu */
export const thrusts = (id: WeaponId | null | undefined): boolean => !!id && SPEAR.has(id);

/** dłoń z bronią dla pozy i kierunku (0 przód, 1 tył, 3 bok w prawo; 2 przez odbicie 3) */
export function handOf(pose: ArmPose, dir: number, f: number, id: WeaponId | null = null): Hand {
  const d = dir === 2 ? 3 : dir;
  const spear = !!id && SPEAR.has(id);
  const gun = isRangedId(id);
  if (pose === 'hold') {
    if (d === 3) return spear ? { x: 18, y: 30, a: -1.35, k: 1 } : { x: 17, y: 30, a: gun ? 1.0 : 1.2, k: 1 };
    const x = d === 0 ? 25 : 7;
    return spear ? { x, y: 30, a: -Math.PI / 2, k: 1 } : { x, y: 30, a: Math.PI / 2, k: 0.8 };
  }
  if (pose === 'aim') {
    if (d === 3) return f === 0 ? { x: 23, y: 24, a: 0, k: 1 } : { x: 21, y: 23, a: -0.2, k: 1 };
    if (d === 0) return { x: 16, y: f === 0 ? 27 : 26, a: Math.PI / 2, k: 0.45 };
    return { x: 16, y: f === 0 ? 18 : 19, a: -Math.PI / 2, k: 0.45 };
  }
  // cios (dzidą się nie zamachuje: jej cios to pchnięcie w pozie celowania)
  if (d === 3)
    return [
      { x: 12, y: 13, a: -2.4, k: 1 },
      { x: 23, y: 21, a: -0.3, k: 1 },
      { x: 21, y: 31, a: 0.9, k: 1 },
    ][f];
  if (d === 0)
    return [
      { x: 25, y: 12, a: -Math.PI / 2, k: 1 },
      { x: 21, y: 22, a: Math.PI / 2 + 0.4, k: 0.6 },
      { x: 17, y: 30, a: Math.PI / 2, k: 0.7 },
    ][f];
  return [
    { x: 7, y: 12, a: -Math.PI / 2, k: 1 },
    { x: 11, y: 20, a: -Math.PI / 2 - 0.4, k: 0.6 },
    { x: 15, y: 26, a: -Math.PI / 2, k: 0.6 },
  ][f];
}

/** kształt broni: długość (piksele), gdzie trzyma (ułamek od tyłu), kolory i główka na końcu */
interface Shape {
  len: number;
  grip: number;
  body: number;
  thick: number;
  /** kolor i długość końcówki (ostrze, grot, lufa) */
  tip: number;
  tipLen: number;
  /** kolor i długość tyłu (rękojeść, kolba) */
  butt: number;
  buttLen: number;
}

const SHAPES: Record<Exclude<WeaponId, 'piesci'>, Shape> = {
  noz: { len: 8, grip: 0.3, body: 0xc4c8c8, thick: 1, tip: 0xe6eaea, tipLen: 3, butt: 0x3a2a1c, buttLen: 3 },
  siekiera: { len: 13, grip: 0.15, body: 0x8a6a44, thick: 2, tip: 0xa0a4a3, tipLen: 3, butt: 0x6a5034, buttLen: 2 },
  lom: { len: 14, grip: 0.2, body: 0x4a4643, thick: 2, tip: 0x6a6460, tipLen: 2, butt: 0x4a4643, buttLen: 1 },
  kij: { len: 13, grip: 0.15, body: 0x6b4f33, thick: 2, tip: 0x6b4f33, tipLen: 5, butt: 0x4a3524, buttLen: 2 },
  dzida: { len: 26, grip: 0.4, body: 0x7a5c3a, thick: 2, tip: 0xc8ccc9, tipLen: 4, butt: 0x5a4430, buttLen: 2 },
  kusza: { len: 11, grip: 0.4, body: 0x5a4028, thick: 2, tip: 0x3a2a1c, tipLen: 2, butt: 0x3a2a1c, buttLen: 3 },
  rewolwer: { len: 7, grip: 0.15, body: 0x2c2c30, thick: 2, tip: 0x45454a, tipLen: 3, butt: 0x5a3a24, buttLen: 2 },
  strzelba: { len: 17, grip: 0.35, body: 0x2c2c30, thick: 2, tip: 0x3a3a40, tipLen: 6, butt: 0x6a4a2c, buttLen: 6 },
};

type Px = (x: number, y: number, w: number, h: number, c: number) => void;

/** broń od tyłu do końcówki wzdłuż kąta a, z dłonią w (hx, hy) w ułamku grip długości */
export function drawWeapon(px: Px, id: WeaponId, hand: Hand): void {
  if (id === 'piesci') return;
  const s = SHAPES[id];
  const len = Math.max(3, Math.round(s.len * hand.k));
  const ux = Math.cos(hand.a);
  const uy = Math.sin(hand.a);
  const bx = hand.x - ux * len * s.grip;
  const by = hand.y - uy * len * s.grip;
  const outline = 0x1a1716;
  // obrys, potem ciało: kwadraciki wzdłuż linii (piksel po pikselu, jak siekiera w atlasie ludzi)
  for (const pass of [0, 1])
    for (let k = 0; k <= len; k++) {
      const x = Math.round(bx + ux * k);
      const y = Math.round(by + uy * k);
      const t = s.thick;
      if (pass === 0) {
        px(x - 1, y - 1, t + 2, t + 2, outline);
        continue;
      }
      const c = k >= len - s.tipLen * hand.k ? s.tip : k <= s.buttLen * hand.k ? s.butt : s.body;
      px(x, y, t, t, k % 4 === 1 ? shade(c, 1.12) : c);
    }
  const tx = Math.round(bx + ux * len);
  const ty = Math.round(by + uy * len);
  // główki: siekiera (ostrze w poprzek), łom (hak), kij (gwoździe), kusza (łuk w poprzek), dzida (grot)
  const nx = -uy;
  const ny = ux;
  if (id === 'siekiera')
    for (let k = -3; k <= 2; k++) {
      px(Math.round(tx - ux * 2 + nx * k) - 1, Math.round(ty - uy * 2 + ny * k) - 1, 4, 4, outline);
      px(Math.round(tx - ux * 2 + nx * k), Math.round(ty - uy * 2 + ny * k), 2, 2, k === -3 ? 0xdde1e1 : 0xa0a4a3);
    }
  else if (id === 'lom') {
    px(Math.round(tx + nx * 2), Math.round(ty + ny * 2), 2, 2, 0x5a5552);
    px(Math.round(tx + nx), Math.round(ty + ny), 2, 2, 0x5a5552);
  } else if (id === 'kij')
    for (const k of [1, 3]) px(Math.round(tx - ux * k + nx * 2), Math.round(ty - uy * k + ny * 2), 1, 1, 0xd8dcdc);
  else if (id === 'kusza')
    for (let k = -4; k <= 4; k++)
      px(
        Math.round(tx - ux * 3 + nx * k),
        Math.round(ty - uy * 3 + ny * k),
        1,
        1,
        Math.abs(k) === 4 ? 0x2a1e14 : 0x6a4a2c,
      );
  else if (id === 'dzida') px(tx - 1, ty - 1, 3, 3, 0xe6eaea);
}

/** atlas nakładek broni: wiersz = broń, kolumny: kierunek × (trzymanie, cios 3, celowanie 2) */
export function makeWeaponAtlas(): AnyCanvas {
  const c = newCanvas(WEAPON_W, WEAPON_H);
  const ctx = ctx2d(c);
  for (const id of ARMED) {
    for (let dir = 0; dir < 4; dir++)
      for (const [pose, frames] of [
        ['hold', 1],
        ['swing', 3],
        ['aim', 2],
      ] as const)
        for (let f = 0; f < frames; f++) {
          const [x, y] = weaponRect(id, pose, dir, f);
          const mirror = dir === 2;
          const px: Px = (qx, qy, w, h, col) => {
            ctx.fillStyle = css(col);
            const cx = OX + qx;
            ctx.fillRect(x + (mirror ? CELL - cx - w : cx), y + OY + qy, w, h);
          };
          drawWeapon(px, id, handOf(pose, dir, f, id));
        }
  }
  return c;
}
