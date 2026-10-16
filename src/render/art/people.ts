/* Ludzie rysowani kodem (grafika zapasowa): 16 wyglądów × 4 kierunki × 4 klatki chodu,
   klatka 32×48 px (osoba ma około 1,4 m wysokości w skali gry). Jeden atlas na wszystkich. */

import { h2 } from './hash.ts';
import { css, shade } from './palette.ts';

export const FW = 32;
export const FH = 48;
export const LOOKS = 16;
export const FRAMES = 4;

const SKIN = [0xe9c2a0, 0xd9a882, 0xc68f69, 0xf0cfb2];
const HAIR = [0x2b211b, 0x5a3b26, 0x8c6a3f, 0xb9b2a6, 0x1d1d1f, 0xa2522c, 0xd8cfb8];
// kurtki: szare, khaki, bordo, granat, zieleń, pomarańcz kamizelki, niebieska bluza
const JACKET = [0x4a4f57, 0x6b6a4a, 0x7a2f2f, 0x2f3d5a, 0x3f5a3a, 0xc4762b, 0x3f6f9a, 0x8a7a66, 0x5b3f63];
const PANTS = [0x2b2f38, 0x3a3a3a, 0x4a4033, 0x25344d, 0x5a5550];

export interface Look {
  skin: number;
  hair: number;
  jacket: number;
  pants: number;
  hood: boolean;
  bald: boolean;
  hat: number | null;
}

export function lookOf(i: number): Look {
  const r = (k: number) => h2(i, k, 4242);
  const hatRoll = r(6);
  return {
    skin: SKIN[Math.floor(r(1) * SKIN.length)],
    hair: HAIR[Math.floor(r(2) * HAIR.length)],
    jacket: JACKET[Math.floor(r(3) * JACKET.length)],
    pants: PANTS[Math.floor(r(4) * PANTS.length)],
    hood: r(5) < 0.2,
    bald: r(7) < 0.12,
    hat: hatRoll < 0.25 ? [0x7a2a2a, 0x2f3d5a, 0x5a5a3a, 0xd0c8b8][Math.floor(r(8) * 4)] : null,
  };
}

/**
 * Rysuje jedną klatkę: dir 0 dół, 1 góra, 2 lewo, 3 prawo; frame 0..3 (0 i 2 stoi, 1 i 3 krok).
 */
function drawFrame(ctx: CanvasRenderingContext2D, ox: number, oy: number, L: Look, dir: number, frame: number) {
  const r = (x: number, y: number, w: number, h: number, c: number) => {
    ctx.fillStyle = css(c);
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const bob = frame === 1 || frame === 3 ? 1 : 0;
  const outline = 0x1a1716;
  // cień pod stopami
  ctx.fillStyle = 'rgba(10,12,18,0.35)';
  ctx.beginPath();
  ctx.ellipse(ox + 16, oy + 45, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  const side = dir >= 2;
  const flip = dir === 2 ? -1 : 1;
  // nogi
  if (!side) {
    r(10, 32 + bob, 5, 12 - (step > 0 ? 2 : 0), outline);
    r(17, 32 + bob, 5, 12 - (step < 0 ? 2 : 0), outline);
    r(11, 32 + bob, 3, 11 - (step > 0 ? 2 : 0), L.pants);
    r(18, 32 + bob, 3, 11 - (step < 0 ? 2 : 0), L.pants);
    r(10, 42 - (step > 0 ? 2 : 0), 5, 2, 0x221d1a);
    r(17, 42 - (step < 0 ? 2 : 0), 5, 2, 0x221d1a);
  } else {
    const a = step * 3;
    r(13 + a * flip, 32 + bob, 5, 12, outline);
    r(14 + a * flip, 32 + bob, 3, 11, L.pants);
    r(13 - a * flip, 32 + bob, 5, 12, outline);
    r(14 - a * flip, 32 + bob, 3, 11, shade(L.pants, 0.8));
    r(12 + a * flip + (flip > 0 ? 1 : 0), 42, 6, 2, 0x221d1a);
  }
  // tułów (kurtka)
  const tw = side ? 12 : 16;
  const tx = side ? 10 : 8;
  r(tx - 1, 18 + bob, tw + 2, 16, outline);
  r(tx, 19 + bob, tw, 14, L.jacket);
  r(tx, 19 + bob, tw, 2, shade(L.jacket, 1.15));
  if (dir === 0) r(15, 21 + bob, 2, 11, shade(L.jacket, 0.75)); // zamek
  // ręce
  if (!side) {
    r(5, 20 + bob + step, 4, 11, outline);
    r(23, 20 + bob - step, 4, 11, outline);
    r(6, 21 + bob + step, 3, 9, shade(L.jacket, 0.9));
    r(23, 21 + bob - step, 3, 9, shade(L.jacket, 0.9));
    r(6, 30 + bob + step, 3, 2, L.skin);
    r(23, 30 + bob - step, 3, 2, L.skin);
  } else {
    r(14 + step * 2 * flip, 20 + bob, 5, 11, outline);
    r(15 + step * 2 * flip, 21 + bob, 3, 9, shade(L.jacket, 0.85));
    r(15 + step * 2 * flip, 30 + bob, 3, 2, L.skin);
  }
  // głowa
  const hx = side ? 10 : 9;
  r(hx - 1, 5 + bob, 14, 15, outline);
  r(hx, 6 + bob, 12, 13, L.skin);
  if (L.hood) {
    r(hx - 1, 4 + bob, 14, 7, shade(L.jacket, 0.9));
    if (dir === 1) r(hx - 1, 4 + bob, 14, 15, shade(L.jacket, 0.85));
  } else if (L.hat !== null) {
    r(hx - 1, 3 + bob, 14, 6, L.hat);
    r(hx - 1, 8 + bob, 14, 1, shade(L.hat, 0.7));
    if (dir === 1) r(hx, 9 + bob, 12, 8, L.hair);
  } else if (!L.bald) {
    r(hx - 1, 4 + bob, 14, 5, L.hair);
    if (dir === 1) r(hx - 1, 4 + bob, 14, 13, L.hair);
    else if (side) r(dir === 2 ? hx + 6 : hx - 1, 4 + bob, 7, 10, L.hair);
    else {
      r(hx - 1, 4 + bob, 3, 9, L.hair);
      r(hx + 10, 4 + bob, 3, 9, L.hair);
    }
  } else if (dir === 1) r(hx, 10 + bob, 12, 6, shade(L.skin, 0.9));
  // twarz
  if (dir === 0) {
    r(hx + 3, 12 + bob, 2, 2, 0x1d1a18);
    r(hx + 7, 12 + bob, 2, 2, 0x1d1a18);
    r(hx + 4, 16 + bob, 4, 1, shade(L.skin, 0.75));
  } else if (side) {
    const ex = dir === 2 ? hx + 1 : hx + 9;
    r(ex, 12 + bob, 2, 2, 0x1d1a18);
  }
}

/** atlas: wiersz = wygląd, kolumny = kierunek × klatka */
export function makePeopleAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FW * 4 * FRAMES;
  c.height = FH * LOOKS;
  const ctx = c.getContext('2d')!;
  for (let look = 0; look < LOOKS; look++) {
    const L = lookOf(look);
    for (let dir = 0; dir < 4; dir++)
      for (let f = 0; f < FRAMES; f++) drawFrame(ctx, (dir * FRAMES + f) * FW, look * FH, L, dir, f);
  }
  return c;
}
