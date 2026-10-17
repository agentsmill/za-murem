/* Ludzie rysowani kodem (grafika zapasowa): 16 wyglądów, każdy w 4 kierunkach. Chód (4 klatki)
   i pozy pracy: niesienie naręcza drewna (4 klatki chodu), rąbanie siekierą (zamach, cios, uderzenie),
   klęczenie przy kozie (grzanie rąk, polano w ręce, polano wsunięte), gotowanie (mieszanie),
   siedzenie na krześle, warta z lampą (kołysze się), grzebanie na kolanach (przeszukiwanie,
   przebieranie śmieci, praca przy podłodze i grządkach), młotek (naprawa, budowa, łatanie),
   niesienie desek i złomu (4 klatki chodu) i drzemka na siedząco (wartownik, który przysnął).
   Do tego leżenie w 4 ułożeniach: w łóżku pod kocem (głowa na poduszce, pod kocem tylko zarys ciała)
   i na podłodze w ubraniu.
   Klatka 32×48 px (osoba ma około 1,4 m wysokości w skali gry), leżenie 48×48. Jeden atlas,
   rysowany samymi prostokątami (działa też z atrapą płótna w narzędziach); każdy wygląd zajmuje dwa
   wiersze, żeby atlas mieścił się w teksturze 4096 px także na telefonie. */

import { handOf } from './bron.ts';
import { type AnyCanvas, ctx2d, newCanvas } from './canvas.ts';
import { h2 } from './hash.ts';
import { css, mix, shade } from './palette.ts';

export const FW = 32;
export const FH = 48;
export const LOOKS = 16;
export const FRAMES = 4;

/** pozy w atlasie (kolumny po kolei: kierunek × klatki) */
export type Pose =
  | 'walk'
  | 'carry'
  | 'chop'
  | 'crouch'
  | 'cook'
  | 'sit'
  | 'guard'
  | 'swing'
  | 'aim'
  | 'search'
  | 'hammer'
  | 'planks'
  | 'scrap'
  | 'doze';
export const POSES: readonly Pose[] = [
  'walk',
  'carry',
  'chop',
  'crouch',
  'cook',
  'sit',
  'guard',
  'swing',
  'aim',
  'search',
  'hammer',
  'planks',
  'scrap',
  'doze',
];
export const POSE_FRAMES: Record<Pose, number> = {
  walk: 4,
  carry: 4,
  chop: 3,
  crouch: 3,
  cook: 2,
  sit: 1,
  guard: 2,
  swing: 3,
  aim: 2,
  search: 2,
  hammer: 2,
  planks: 4,
  scrap: 4,
  doze: 1,
};
const POSE_COL = {} as Record<Pose, number>;
let cols = 0;
for (const p of POSES) {
  POSE_COL[p] = cols;
  cols += 4 * POSE_FRAMES[p];
}
const COLS = cols;

/** leżenie: w łóżku pod kocem albo na podłodze; komórka LIE × LIE */
export type Lie = 'bed' | 'floor';
export const LIE = 48;
/** wiersze atlasu na wygląd: klatki póz idą wierszami, leżenie na końcu ostatniego wiersza */
const ROWS = 2;
const PER_ROW = Math.ceil((COLS * FW + 8 * LIE) / (ROWS * FW));
export const ATLAS_W = PER_ROW * FW;
export const ATLAS_H = LOOKS * ROWS * FH;

/** klatka pozy w atlasie: x, y, szerokość, wysokość (kotwica jak w chodzie: stopy w (16, 45)) */
export function frameRect(look: number, pose: Pose, dir: number, f: number): [number, number, number, number] {
  const c = POSE_COL[pose] + dir * POSE_FRAMES[pose] + f;
  return [(c % PER_ROW) * FW, (look * ROWS + Math.floor(c / PER_ROW)) * FH, FW, FH];
}

/** komórka leżenia; o to strona głowy: 0 góra, 1 prawo, 2 dół, 3 lewo */
export function lieRect(look: number, lie: Lie, o: number): [number, number, number, number] {
  const x = (COLS - (ROWS - 1) * PER_ROW) * FW + ((lie === 'bed' ? 0 : 4) + o) * LIE;
  return [x, (look * ROWS + ROWS - 1) * FH, LIE, LIE];
}

/** środek głowy w komórce leżenia (kotwica: tę kropkę kładzie się na poduszce) */
export function lieHead(o: number): [number, number] {
  return [
    [24, 10],
    [38, 24],
    [24, 38],
    [10, 24],
  ][o & 3] as [number, number];
}

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

// ---------------------------------------------------------------- pozy pracy

type Rect = (x: number, y: number, w: number, h: number, c: number) => void;

const OUT = 0x1a1716;
const SHOE = 0x221d1a;
const EYE = 0x1d1a18;
const BARK = 0x5a4632;
const BARK_D = 0x433426;
const CUT = 0xcdab79;
const HANDLE = 0x8a6a44;
const STEEL = 0x9fa2a1;
const EDGE = 0xd8dcdc;
const IRON = 0x37332f;
const FLAME = 0xffd27a;

/** prostokąty klatki (ox, oy) atlasu; mirror odbija w poziomie (kierunek 2 to odbity kierunek 3) */
function painter(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, mirror: boolean): Rect {
  return (x, y, rw, rh, c) => {
    ctx.fillStyle = css(c);
    ctx.fillRect(ox + (mirror ? w - x - rw : x), oy + y, rw, rh);
  };
}

function shadowAt(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(10,12,18,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** głowa jak w chodzie, dy w dół (siedzi, klęczy); dir 3 dla boku (kierunek 2 przez odbicie) */
function head(r: Rect, L: Look, dir: number, dy: number, eyes = true) {
  const side = dir >= 2;
  const hx = side ? 10 : 9;
  r(hx - 1, 5 + dy, 14, 15, OUT);
  r(hx, 6 + dy, 12, 13, L.skin);
  if (L.hood) {
    r(hx - 1, 4 + dy, 14, 7, shade(L.jacket, 0.9));
    if (dir === 1) r(hx - 1, 4 + dy, 14, 15, shade(L.jacket, 0.85));
  } else if (L.hat !== null) {
    r(hx - 1, 3 + dy, 14, 6, L.hat);
    r(hx - 1, 8 + dy, 14, 1, shade(L.hat, 0.7));
    if (dir === 1) r(hx, 9 + dy, 12, 8, L.hair);
  } else if (!L.bald) {
    r(hx - 1, 4 + dy, 14, 5, L.hair);
    if (dir === 1) r(hx - 1, 4 + dy, 14, 13, L.hair);
    else if (side) r(hx - 1, 4 + dy, 7, 10, L.hair);
    else {
      r(hx - 1, 4 + dy, 3, 9, L.hair);
      r(hx + 10, 4 + dy, 3, 9, L.hair);
    }
  } else if (dir === 1) r(hx, 10 + dy, 12, 6, shade(L.skin, 0.9));
  if (!eyes) return;
  if (dir === 0) {
    r(hx + 3, 12 + dy, 2, 2, EYE);
    r(hx + 7, 12 + dy, 2, 2, EYE);
    r(hx + 4, 16 + dy, 4, 1, shade(L.skin, 0.75));
  } else if (side) r(hx + 9, 12 + dy, 2, 2, EYE);
}

/** tułów w kurtce, dy w dół; h krótszy przy siedzeniu i klęczeniu */
function torso(r: Rect, L: Look, dir: number, dy: number, h = 14) {
  const side = dir >= 2;
  const tw = side ? 12 : 16;
  const tx = side ? 10 : 8;
  r(tx - 1, 18 + dy, tw + 2, h + 2, OUT);
  r(tx, 19 + dy, tw, h, L.jacket);
  r(tx, 19 + dy, tw, 2, shade(L.jacket, 1.15));
  if (dir === 0) r(15, 21 + dy, 2, h - 3, shade(L.jacket, 0.75));
}

/** nogi stojące albo w kroku (step −1..1, bob 0..1) */
function legs(r: Rect, L: Look, dir: number, step = 0, bob = 0) {
  if (dir < 2) {
    r(10, 32 + bob, 5, 12 - (step > 0 ? 2 : 0), OUT);
    r(17, 32 + bob, 5, 12 - (step < 0 ? 2 : 0), OUT);
    r(11, 32 + bob, 3, 11 - (step > 0 ? 2 : 0), L.pants);
    r(18, 32 + bob, 3, 11 - (step < 0 ? 2 : 0), L.pants);
    r(10, 42 - (step > 0 ? 2 : 0), 5, 2, SHOE);
    r(17, 42 - (step < 0 ? 2 : 0), 5, 2, SHOE);
    return;
  }
  const a = step * 3;
  r(13 + a, 32 + bob, 5, 12, OUT);
  r(14 + a, 32 + bob, 3, 11, L.pants);
  r(13 - a, 32 + bob, 5, 12, OUT);
  r(14 - a, 32 + bob, 3, 11, shade(L.pants, 0.8));
  r(13 + a, 42, 6, 2, SHOE);
}

/** rękaw z dłonią: od (x, y) w dół o h, dłoń na końcu */
function arm(r: Rect, L: Look, x: number, y: number, h: number, sleeve = 0.9) {
  r(x - 1, y - 1, 5, h + 2, OUT);
  r(x, y, 3, h - 2, shade(L.jacket, sleeve));
  r(x, y + h - 2, 3, 2, L.skin);
}

/** rękaw poziomy z dłonią na końcu (w prawo od x) */
function armSide(r: Rect, L: Look, x: number, y: number, w: number) {
  r(x - 1, y - 1, w + 2, 5, OUT);
  r(x, y, w - 2, 3, shade(L.jacket, 0.85));
  r(x + w - 2, y, 2, 3, L.skin);
}

/** polano z boku: kora i czoło po prawej */
function logSide(r: Rect, x: number, y: number, w: number) {
  r(x - 1, y - 1, w + 2, 5, OUT);
  r(x, y, w, 3, BARK);
  r(x, y, w, 1, shade(BARK, 1.2));
  r(x + w - 2, y, 2, 3, CUT);
}

/** czoło polana (koło 4×4 widziane od czoła) */
function logEnd(r: Rect, x: number, y: number) {
  r(x, y + 1, 4, 2, CUT);
  r(x + 1, y, 2, 4, CUT);
  r(x + 1, y + 1, 2, 2, shade(CUT, 0.8));
}

/** niesienie naręcza drewna: chód z polanami w rękach przed sobą */
function carry(r: Rect, L: Look, dir: number, f: number) {
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  const bob = f === 1 || f === 3 ? 1 : 0;
  legs(r, L, dir, step, bob);
  torso(r, L, dir, bob);
  if (dir === 0) {
    head(r, L, dir, bob);
    // trzy polana w poprzek piersi, dłonie po bokach
    for (let k = 0; k < 3; k++) {
      const y = 23 + bob + k * 3;
      r(6, y - 1, 20, 4, OUT);
      r(7, y, 18, 2, k === 1 ? BARK_D : BARK);
      r(6, y, 2, 2, CUT);
      r(24, y, 2, 2, CUT);
    }
    arm(r, L, 4, 21 + bob, 8);
    arm(r, L, 25, 21 + bob, 8);
  } else if (dir === 1) {
    head(r, L, dir, bob);
    // od tyłu: łokcie na boki, końce polan wystają za ramionami
    for (const x of [2, 26]) {
      r(x, 22 + bob, 4, 6, OUT);
      logEnd(r, x, 23 + bob);
    }
    arm(r, L, 5, 21 + bob, 7);
    arm(r, L, 24, 21 + bob, 7);
  } else {
    head(r, L, 3, bob);
    // z boku: czoła polan przed sobą, ręka pod spodem
    r(18, 21 + bob, 11, 11, OUT);
    logEnd(r, 19, 22 + bob);
    logEnd(r, 24, 22 + bob);
    logEnd(r, 21, 26 + bob);
    r(19, 26 + bob, 2, 4, BARK);
    r(25, 26 + bob, 3, 4, BARK);
    armSide(r, L, 15, 29 + bob, 12);
  }
}

/** siekiera: trzonek od (x0, y0) do (x1, y1) co piksel, ostrze 4×3 na końcu (dx: strona ostrza) */
function axe(r: Rect, x0: number, y0: number, x1: number, y1: number, dx: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n);
    const y = Math.round(y0 + ((y1 - y0) * k) / n);
    r(x, y, 2, 2, HANDLE);
  }
  const bx = dx > 0 ? x1 : x1 - 3;
  r(bx - 1, y1 - 2, 6, 5, OUT);
  r(bx, y1 - 1, 4, 3, STEEL);
  r(dx > 0 ? bx + 3 : bx, y1 - 1, 1, 3, EDGE);
}

/** rąbanie: f 0 zamach, 1 cios w górze, 2 uderzenie */
function chop(r: Rect, L: Look, dir: number, f: number) {
  if (dir === 0) {
    legs(r, L, 0);
    torso(r, L, 0, 0);
    head(r, L, 0, 0);
    if (f === 0) {
      // siekiera na prawym ramieniu, ostrze przy głowie
      axe(r, 20, 26, 25, 5, 1);
      arm(r, L, 21, 20, 8);
      arm(r, L, 6, 21, 10);
    } else if (f === 1) {
      // nad głową
      axe(r, 16, 18, 16, 1, 1);
      arm(r, L, 11, 13, 8);
      arm(r, L, 18, 13, 8);
    } else {
      // uderzenie przed sobą, nisko
      axe(r, 16, 28, 16, 41, 1);
      arm(r, L, 10, 21, 10);
      arm(r, L, 19, 21, 10);
    }
    return;
  }
  if (dir === 1) {
    legs(r, L, 1);
    torso(r, L, 1, 0);
    if (f === 0) axe(r, 22, 22, 26, 4, 1);
    if (f === 1) axe(r, 16, 12, 16, 1, 1);
    head(r, L, 1, 0);
    if (f === 0) {
      arm(r, L, 22, 20, 7);
      arm(r, L, 6, 21, 10);
    } else if (f === 1) {
      arm(r, L, 11, 12, 8);
      arm(r, L, 18, 12, 8);
    } else {
      // uderzenie przed sobą: siekiery nie widać, ręce przed piersią
      arm(r, L, 8, 21, 8);
      arm(r, L, 21, 21, 8);
    }
    return;
  }
  // z boku (w prawo)
  legs(r, L, 3);
  torso(r, L, 3, 0);
  if (f === 0) {
    // siekiera wzniesiona za plecami
    axe(r, 15, 24, 5, 8, -1);
    head(r, L, 3, 0);
    arm(r, L, 13, 18, 8);
  } else if (f === 1) {
    head(r, L, 3, 0);
    axe(r, 17, 16, 22, 1, 1);
    arm(r, L, 16, 13, 8);
  } else {
    head(r, L, 3, 0);
    // cios w ziemię przed sobą
    axe(r, 19, 28, 27, 40, 1);
    armSide(r, L, 14, 26, 8);
  }
}

/** klęczenie przy kozie: f 0 grzeje ręce, 1 polano w ręce, 2 polano wsunięte */
function crouch(r: Rect, L: Look, dir: number, f: number) {
  const dy = 8;
  if (dir === 0) {
    // kolana na dole, ręce przed sobą (do patrzącego)
    r(9, 39, 6, 6, OUT);
    r(17, 39, 6, 6, OUT);
    r(10, 40, 4, 4, L.pants);
    r(18, 40, 4, 4, L.pants);
    torso(r, L, 0, dy, 13);
    head(r, L, 0, dy);
    if (f === 0) {
      arm(r, L, 8, 29, 7);
      arm(r, L, 21, 29, 7);
    } else {
      const y = f === 1 ? 34 : 36;
      r(9, y - 1, 15, 4, OUT);
      r(10, y, 13, 2, BARK);
      r(10, y, 2, 2, CUT);
      arm(r, L, 8, 29, 6);
      arm(r, L, 21, 29, 6);
    }
    return;
  }
  if (dir === 1) {
    // od tyłu: podeszwy butów pod pośladkami
    r(9, 41, 6, 4, OUT);
    r(17, 41, 6, 4, OUT);
    r(10, 42, 4, 2, SHOE);
    r(18, 42, 4, 2, SHOE);
    torso(r, L, 1, dy, 13);
    head(r, L, 1, dy);
    const up = f === 2 ? 1 : 0;
    arm(r, L, 6 + up, 28, 7);
    arm(r, L, 23 - up, 28, 7);
    return;
  }
  // z boku: jedno kolano w górze, drugie na ziemi, ręce przed sobą
  r(10, 41, 10, 4, OUT);
  r(11, 42, 8, 2, shade(L.pants, 0.8));
  r(17, 36, 7, 5, OUT);
  r(18, 37, 5, 3, L.pants);
  r(19, 38, 5, 7, OUT);
  r(20, 39, 3, 5, L.pants);
  r(20, 43, 5, 2, SHOE);
  torso(r, L, 3, dy, 11);
  head(r, L, 3, dy);
  if (f === 0) armSide(r, L, 15, 29, 11);
  else if (f === 1) {
    armSide(r, L, 15, 29, 9);
    logSide(r, 22, 29, 8);
  } else {
    armSide(r, L, 15, 29, 12);
    logSide(r, 26, 29, 5);
  }
}

/** gotowanie: ręka nad garnkiem z łyżką, f to pół ruchu mieszania */
function cook(r: Rect, L: Look, dir: number, f: number) {
  legs(r, L, dir < 2 ? dir : 3);
  if (dir === 0) {
    torso(r, L, 0, 0);
    head(r, L, 0, 0);
    arm(r, L, 6, 21, 10);
    const x = f ? 16 : 18;
    arm(r, L, x, 22, 9);
    r(x + 1, 31, 1, 5, STEEL); // łyżka w dół, do garnka
    return;
  }
  if (dir === 1) {
    torso(r, L, 1, 0);
    head(r, L, 1, 0);
    arm(r, L, 6, 21, 10);
    arm(r, L, f ? 21 : 22, 20, 8);
    return;
  }
  torso(r, L, 3, 0);
  head(r, L, 3, 0);
  const w = f ? 10 : 12;
  armSide(r, L, 15, 25, w);
  r(15 + w - 1, 28, 1, 6, STEEL);
}

/** siedzenie na krześle: niżej o 7 px, nogi zgięte, ręce na stole przed sobą */
function sit(r: Rect, L: Look, dir: number) {
  const dy = 7;
  if (dir === 0) {
    // uda skrócone (do patrzącego): kolana, łydki, buty
    r(9, 38, 6, 7, OUT);
    r(17, 38, 6, 7, OUT);
    r(10, 39, 4, 2, shade(L.pants, 1.15));
    r(18, 39, 4, 2, shade(L.pants, 1.15));
    r(10, 41, 4, 2, L.pants);
    r(18, 41, 4, 2, L.pants);
    r(9, 43, 6, 2, SHOE);
    r(17, 43, 6, 2, SHOE);
    torso(r, L, 0, dy, 12);
    head(r, L, 0, dy);
    arm(r, L, 7, 28, 8);
    arm(r, L, 22, 28, 8);
    return;
  }
  if (dir === 1) {
    torso(r, L, 1, dy, 13);
    head(r, L, 1, dy);
    arm(r, L, 6, 27, 8);
    arm(r, L, 23, 27, 8);
    return;
  }
  // z boku: udo poziomo do przodu, łydka w dół
  r(13, 35, 11, 5, OUT);
  r(14, 36, 9, 3, L.pants);
  r(20, 38, 5, 7, OUT);
  r(21, 39, 3, 5, L.pants);
  r(21, 43, 5, 2, SHOE);
  torso(r, L, 3, dy, 11);
  head(r, L, 3, dy);
  armSide(r, L, 15, 28, 10);
}

/** latarnia: kabłąk, czapka, szkło z płomieniem, podstawa */
function lantern(r: Rect, x: number, y: number) {
  r(x + 1, y - 2, 3, 1, IRON);
  r(x - 1, y - 1, 7, 9, OUT);
  r(x, y, 5, 1, IRON);
  r(x, y + 1, 5, 5, 0xc9a54a);
  r(x + 1, y + 2, 3, 3, FLAME);
  r(x, y + 6, 5, 1, IRON);
}

/** warta z lampą naftową w ręce; f to kołysanie lampy */
function guard(r: Rect, L: Look, dir: number, f: number) {
  legs(r, L, dir < 2 ? dir : 3);
  const s = f ? 1 : 0;
  if (dir === 0) {
    torso(r, L, 0, 0);
    head(r, L, 0, 0);
    arm(r, L, 6, 21, 10);
    arm(r, L, 23, 21, 9);
    lantern(r, 22 + s, 31);
    return;
  }
  if (dir === 1) {
    lantern(r, 22 + s, 31);
    torso(r, L, 1, 0);
    head(r, L, 1, 0);
    arm(r, L, 6, 21, 10);
    arm(r, L, 23, 21, 9);
    return;
  }
  torso(r, L, 3, 0);
  head(r, L, 3, 0);
  // ręka lekko do przodu, lampa przed sobą
  r(15, 19, 5, 9, OUT);
  r(16, 20, 3, 7, shade(L.jacket, 0.85));
  armSide(r, L, 16, 26, 6);
  lantern(r, 20 + s, 30);
}

const PLANK = 0xb48c5c;
const PLANK_D = 0x8a6a44;
const SCRAP = 0x7d8288;
const SCRAP_HI = 0xa3a8ad;
const RUST = 0x8a5232;

/** nogi klęczącego jak przy kozie (crouch): od przodu kolana, od tyłu podeszwy, z boku jedno kolano w górze */
function kneel(r: Rect, L: Look, dir: number) {
  if (dir === 0) {
    r(9, 39, 6, 6, OUT);
    r(17, 39, 6, 6, OUT);
    r(10, 40, 4, 4, L.pants);
    r(18, 40, 4, 4, L.pants);
  } else if (dir === 1) {
    r(9, 41, 6, 4, OUT);
    r(17, 41, 6, 4, OUT);
    r(10, 42, 4, 2, SHOE);
    r(18, 42, 4, 2, SHOE);
  } else {
    r(10, 41, 10, 4, OUT);
    r(11, 42, 8, 2, shade(L.pants, 0.8));
    r(17, 36, 7, 5, OUT);
    r(18, 37, 5, 3, L.pants);
    r(19, 38, 5, 7, OUT);
    r(20, 39, 3, 5, L.pants);
    r(20, 43, 5, 2, SHOE);
  }
}

/** puszka w dłoni (znalezisko) */
function can(r: Rect, x: number, y: number) {
  r(x, y, 4, 5, OUT);
  r(x + 1, y + 1, 2, 3, STEEL);
}

/**
 * Grzebanie na kolanach (przeszukiwanie, przebieranie śmieci, praca przy podłodze, rurze i grządkach):
 * f 0 ręce nisko przed sobą, f 1 jedna ręka podnosi znalezisko.
 */
function search(r: Rect, L: Look, dir: number, f: number) {
  const dy = 8;
  kneel(r, L, dir);
  if (dir === 0) {
    torso(r, L, 0, dy, 13);
    head(r, L, 0, dy + 1);
    arm(r, L, 8, 30, 10);
    if (f === 0) arm(r, L, 21, 30, 10);
    else {
      arm(r, L, 21, 27, 7);
      can(r, 21, 31);
    }
    return;
  }
  if (dir === 1) {
    torso(r, L, 1, dy, 13);
    head(r, L, 1, dy + 1);
    // od tyłu łokcie na boki, ręce pracują przed sobą
    arm(r, L, 6 + f, 28, 8);
    arm(r, L, 23 - f, 28 + f, 8);
    return;
  }
  torso(r, L, 3, dy, 11);
  head(r, L, 3, dy + 1);
  if (f === 0) {
    // ręka w dół przed siebie, dłoń przy ziemi
    r(19, 30, 5, 11, OUT);
    r(20, 31, 3, 8, shade(L.jacket, 0.85));
    r(20, 39, 3, 2, L.skin);
  } else {
    armSide(r, L, 15, 29, 10);
    can(r, 24, 27);
  }
}

/** młotek w dłoni (x, y): w górę (zamach) albo w przód (uderzenie), obuch w poprzek trzonka */
function hammerTool(r: Rect, x: number, y: number, up: boolean) {
  if (up) {
    r(x, y - 8, 2, 9, HANDLE);
    r(x - 3, y - 11, 8, 4, OUT);
    r(x - 2, y - 10, 6, 2, STEEL);
  } else {
    r(x, y, 6, 2, HANDLE);
    r(x + 5, y - 3, 4, 8, OUT);
    r(x + 6, y - 2, 2, 6, STEEL);
  }
}

/** młotek (naprawa, budowa, łatanie siatki, zajmowanie mieszkania): f 0 zamach, f 1 uderzenie */
function hammer(r: Rect, L: Look, dir: number, f: number) {
  if (dir === 0) {
    legs(r, L, 0);
    torso(r, L, 0, 0);
    head(r, L, 0, 0);
    // lewa ręka przytrzymuje, prawa z młotkiem
    arm(r, L, 7, 21, 9);
    if (f === 0) {
      arm(r, L, 22, 12, 8);
      hammerTool(r, 23, 13, true);
    } else {
      arm(r, L, 19, 21, 9);
      r(17, 29, 8, 5, OUT);
      r(18, 30, 6, 3, STEEL);
    }
    return;
  }
  if (dir === 1) {
    legs(r, L, 1);
    torso(r, L, 1, 0);
    if (f === 0) hammerTool(r, 23, 13, true);
    head(r, L, 1, 0);
    arm(r, L, 6, 21, 10);
    if (f === 0) arm(r, L, 22, 12, 8);
    else arm(r, L, 20, 21, 8);
    return;
  }
  legs(r, L, 3);
  torso(r, L, 3, 0);
  head(r, L, 3, 0);
  if (f === 0) {
    // ręka uniesiona przed twarzą, młotek nad nią
    arm(r, L, 22, 12, 8);
    hammerTool(r, 23, 13, true);
  } else {
    armSide(r, L, 15, 25, 9);
    hammerTool(r, 22, 26, false);
  }
}

/** niesienie desek: chód z dwiema deskami w rękach, dłuższymi niż rozstaw ramion */
function planks(r: Rect, L: Look, dir: number, f: number) {
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  const bob = f === 1 || f === 3 ? 1 : 0;
  legs(r, L, dir, step, bob);
  torso(r, L, dir, bob);
  if (dir === 0) {
    head(r, L, dir, bob);
    // stos desek na wysokości pasa, szerszy niż rozstaw rąk
    r(0, 27 + bob, 32, 7, OUT);
    r(1, 28 + bob, 30, 2, PLANK);
    r(1, 31 + bob, 30, 2, PLANK_D);
    r(1, 28 + bob, 1, 5, shade(PLANK, 1.2));
    r(30, 28 + bob, 1, 5, shade(PLANK, 1.2));
    arm(r, L, 5, 21 + bob, 9);
    arm(r, L, 24, 21 + bob, 9);
  } else if (dir === 1) {
    head(r, L, dir, bob);
    // od tyłu: końce desek wystają po bokach
    for (const x of [0, 26]) {
      r(x, 23 + bob, 6, 8, OUT);
      r(x + 1, 24 + bob, 4, 2, PLANK);
      r(x + 1, 28 + bob, 4, 2, PLANK_D);
    }
    arm(r, L, 5, 21 + bob, 8);
    arm(r, L, 24, 21 + bob, 8);
  } else {
    head(r, L, 3, bob);
    // z boku: deski wzdłuż, przed i za plecami, dłoń pod spodem
    r(1, 23 + bob, 31, 6, OUT);
    r(2, 24 + bob, 29, 2, PLANK);
    r(2, 26 + bob, 29, 2, PLANK_D);
    armSide(r, L, 15, 28 + bob, 10);
  }
}

/** niesienie złomu: chód z blachą i rurą w rękach */
function scrap(r: Rect, L: Look, dir: number, f: number) {
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  const bob = f === 1 || f === 3 ? 1 : 0;
  legs(r, L, dir, step, bob);
  torso(r, L, dir, bob);
  if (dir === 0) {
    head(r, L, dir, bob);
    // blacha z rdzą przed piersią, rura na wierzchu
    r(6, 23 + bob, 20, 10, OUT);
    r(7, 24 + bob, 18, 8, SCRAP);
    r(9, 26 + bob, 3, 2, RUST);
    r(18, 29 + bob, 4, 2, RUST);
    r(3, 22 + bob, 26, 3, OUT);
    r(4, 23 + bob, 24, 1, SCRAP_HI);
    arm(r, L, 4, 21 + bob, 9);
    arm(r, L, 25, 21 + bob, 9);
  } else if (dir === 1) {
    head(r, L, dir, bob);
    // od tyłu: brzeg blachy i koniec rury po bokach
    r(2, 23 + bob, 5, 9, OUT);
    r(3, 24 + bob, 3, 7, SCRAP);
    r(25, 22 + bob, 6, 3, OUT);
    r(26, 23 + bob, 4, 1, SCRAP_HI);
    arm(r, L, 5, 21 + bob, 8);
    arm(r, L, 24, 21 + bob, 8);
  } else {
    head(r, L, 3, bob);
    // z boku: blacha przed sobą, krótka rura na wierzchu
    r(16, 21 + bob, 12, 12, OUT);
    r(17, 22 + bob, 10, 10, SCRAP);
    r(19, 24 + bob, 3, 2, RUST);
    r(15, 20 + bob, 14, 3, OUT);
    r(16, 21 + bob, 12, 1, SCRAP_HI);
    armSide(r, L, 13, 28 + bob, 11);
  }
}

/** drzemka na siedząco: siedzi na ziemi z kolanami w górze, głowa opadła na pierś, oczy zamknięte */
function doze(r: Rect, L: Look, dir: number) {
  const dy = 11;
  const hd = dy + 2;
  if (dir === 0) {
    torso(r, L, 0, dy, 10);
    head(r, L, 0, hd, false);
    r(12, 13 + hd, 2, 1, EYE);
    r(16, 13 + hd, 2, 1, EYE);
    // kolana przed tułowiem, buty na ziemi, ręce oparte na kolanach
    r(9, 33, 6, 10, OUT);
    r(17, 33, 6, 10, OUT);
    r(10, 34, 4, 8, L.pants);
    r(18, 34, 4, 8, L.pants);
    r(9, 42, 6, 3, SHOE);
    r(17, 42, 6, 3, SHOE);
    arm(r, L, 7, 31, 6);
    arm(r, L, 22, 31, 6);
    return;
  }
  if (dir === 1) {
    r(7, 42, 6, 3, OUT);
    r(19, 42, 6, 3, OUT);
    r(8, 43, 4, 1, SHOE);
    r(20, 43, 4, 1, SHOE);
    torso(r, L, 1, dy, 10);
    head(r, L, 1, dy + 1);
    arm(r, L, 6, 31, 7);
    arm(r, L, 23, 31, 7);
    return;
  }
  torso(r, L, 3, dy, 10);
  head(r, L, 3, hd, false);
  r(19, 13 + hd, 2, 1, EYE);
  // udo w górę do kolana, łydka w dół, ręka na kolanie
  r(14, 33, 11, 6, OUT);
  r(15, 34, 9, 4, L.pants);
  r(21, 34, 5, 10, OUT);
  r(22, 35, 3, 8, L.pants);
  r(21, 42, 6, 2, SHOE);
  armSide(r, L, 14, 31, 9);
}

/** leżenie w komórce LIE × LIE: ciało wzdłuż u (od głowy), w poprzek v (−7..7); o: strona głowy */
function lie(ctx: CanvasRenderingContext2D, ox: number, oy: number, L: Look, kind: Lie, o: number) {
  // prostokąt w układzie ciała (u, v, du, dv) zamieniony na prostokąt komórki przy obrocie o 90°
  const r = (u: number, v: number, du: number, dv: number, c: number | string) => {
    let x: number;
    let y: number;
    let w: number;
    let h: number;
    if (o === 0) [x, y, w, h] = [24 + v, 4 + u, dv, du];
    else if (o === 1) [x, y, w, h] = [44 - u - du, 24 + v, du, dv];
    else if (o === 2) [x, y, w, h] = [24 - v - dv, 44 - u - du, dv, du];
    else [x, y, w, h] = [4 + u, 24 - v - dv, du, dv];
    ctx.fillStyle = typeof c === 'number' ? css(c) : c;
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  if (kind === 'floor') {
    // na podłodze w ubraniu, na plecach: cień, nogi, tułów, ręce wzdłuż ciała
    r(2, -8, 38, 17, 'rgba(10,12,18,0.3)');
    r(26, -6, 14, 5, OUT);
    r(26, 1, 14, 5, OUT);
    r(26, -5, 12, 3, L.pants);
    r(26, 2, 12, 3, L.pants);
    r(37, -6, 3, 5, SHOE);
    r(37, 1, 3, 5, SHOE);
    r(10, -8, 18, 16, OUT);
    r(11, -7, 16, 14, L.jacket);
    r(11, -7, 16, 2, shade(L.jacket, 1.15));
    r(14, -1, 12, 2, shade(L.jacket, 0.75));
    r(12, -10, 13, 4, OUT);
    r(12, 6, 13, 4, OUT);
    r(13, -9, 10, 2, shade(L.jacket, 0.9));
    r(13, 7, 10, 2, shade(L.jacket, 0.9));
    r(23, -9, 2, 2, L.skin);
    r(23, 7, 2, 2, L.skin);
  } else {
    // pod kocem: zarys ciała ciemniej, oświetlony brzeg jaśniej, wywinięty koc pod brodą
    r(12, -7, 27, 14, 'rgba(0,0,0,0.16)');
    r(14, -7, 23, 2, 'rgba(255,255,255,0.14)');
    r(12, -7, 2, 14, 'rgba(255,255,255,0.22)');
    r(37, -5, 2, 10, 'rgba(0,0,0,0.12)');
  }
  // głowa z góry: włosy od strony czubka, twarz z zamkniętymi oczami
  r(-1, -7, 13, 14, OUT);
  r(0, -6, 11, 12, L.skin);
  if (L.hood) r(0, -6, 4, 12, shade(L.jacket, 0.9));
  else if (L.hat !== null) r(0, -6, 4, 12, L.hat);
  else if (!L.bald) {
    r(0, -6, 4, 12, L.hair);
    r(0, -6, 7, 2, L.hair);
    r(0, 4, 7, 2, L.hair);
  }
  r(5, -3, 1, 2, EYE);
  r(5, 1, 1, 2, EYE);
  r(8, -1, 1, 2, shade(L.skin, 0.75));
}

// ---------------------------------------------------------------- walka

/** ręka od barku (x0, y0) do dłoni (x1, y1): rękaw kwadracikami wzdłuż linii, dłoń na końcu */
function limb(r: Rect, L: Look, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (const pass of [0, 1])
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n) - 1;
      const y = Math.round(y0 + ((y1 - y0) * k) / n) - 1;
      if (pass === 0) r(x - 1, y - 1, 5, 5, OUT);
      else r(x, y, 3, 3, k >= n - 1 ? L.skin : shade(L.jacket, 0.88));
    }
}

/** cios bronią do walki wręcz: zamach, uderzenie, dokończenie; ręka do dłoni z handOf (broń to nakładka) */
function swing(r: Rect, L: Look, dir: number, f: number) {
  const h = handOf('swing', dir, f);
  legs(r, L, dir, dir === 3 && f === 1 ? 1 : 0, 0);
  if (dir === 3) {
    arm(r, L, 13, 21, 9, 0.75);
    torso(r, L, dir, f === 1 ? 1 : 0);
    head(r, L, dir, f === 1 ? 1 : 0);
    limb(r, L, 16, 21, h.x, h.y);
  } else if (dir === 0) {
    torso(r, L, dir, 0);
    arm(r, L, 5, 20, 11);
    head(r, L, dir, 0);
    limb(r, L, 24, 21, h.x, h.y);
  } else {
    limb(r, L, 8, 21, h.x, h.y);
    torso(r, L, dir, 0);
    arm(r, L, 23, 20, 11);
    head(r, L, dir, 0);
  }
}

/** celowanie oburącz (broń palna, kusza) albo pchnięcie dzidą; druga klatka to odrzut */
function aim(r: Rect, L: Look, dir: number, f: number) {
  const h = handOf('aim', dir, f);
  legs(r, L, dir, 0, 0);
  if (dir === 3) {
    limb(r, L, 14, 22, h.x - 2, h.y + 1);
    torso(r, L, dir, 0);
    head(r, L, dir, 0);
    limb(r, L, 17, 21, h.x, h.y);
  } else if (dir === 0) {
    torso(r, L, dir, 0);
    head(r, L, dir, 0);
    limb(r, L, 8, 21, h.x - 1, h.y);
    limb(r, L, 24, 21, h.x + 1, h.y);
  } else {
    limb(r, L, 8, 21, h.x - 1, h.y);
    limb(r, L, 24, 21, h.x + 1, h.y);
    torso(r, L, dir, 0);
    head(r, L, dir, 0);
  }
}

// ---------------------------------------------------------------- szwendacze

/** wiersze atlasu szwendaczy: zgniłe wersje tych samych 16 wyglądów (zmarły sąsiad wstaje w swoim ubraniu) */
export const ZLOOKS = 16;
export type ZPose = 'lurch' | 'bite';
export const ZPOSE_FRAMES: Record<ZPose, number> = { lurch: 4, bite: 2 };
const ZCOLS = 4 * ZPOSE_FRAMES.lurch + 4 * ZPOSE_FRAMES.bite;
export const ZATLAS_W = ZCOLS * FW + 4 * LIE;
export const ZATLAS_H = ZLOOKS * FH;

const ZSKIN = [0x8f9c7a, 0x7f8c6c, 0x9aa088, 0x76846a];
const ROT = 0x2a1c18;
const DEAD_EYE = 0xd8d0a0;
const MOUTH = 0x3a0c0c;
const BLOOD = 0x6a1612;

/** wygląd szwendacza: szarozielona skóra, wyblakłe i brudne ubranie, przyprószone włosy */
export function zombieLook(i: number): Look {
  const L = lookOf(i % LOOKS);
  return {
    ...L,
    skin: ZSKIN[i % ZSKIN.length],
    jacket: mix(L.jacket, 0x55554c, 0.45),
    pants: mix(L.pants, 0x3a3a34, 0.4),
    hair: shade(L.hair, 0.8),
    hat: L.hat === null ? null : mix(L.hat, 0x55554c, 0.4),
  };
}

export function zFrameRect(look: number, pose: ZPose, dir: number, f: number): [number, number, number, number] {
  const col = pose === 'lurch' ? dir * ZPOSE_FRAMES.lurch + f : 4 * ZPOSE_FRAMES.lurch + dir * ZPOSE_FRAMES.bite + f;
  return [col * FW, (look % ZLOOKS) * FH, FW, FH];
}

/** trup szwendacza na ziemi; o to strona głowy */
export function zLieRect(look: number, o: number): [number, number, number, number] {
  return [ZCOLS * FW + (o & 3) * LIE, (look % ZLOOKS) * FH, LIE, LIE];
}

/** twarz szwendacza: zapadnięte oczy z bielmem, otwarte usta, krew na brodzie */
function zface(r: Rect, dir: number, dy: number, open = 0) {
  if (dir === 0) {
    r(11, 11 + dy, 4, 3, ROT);
    r(16, 11 + dy, 4, 3, ROT);
    r(12, 12 + dy, 2, 1, DEAD_EYE);
    r(17, 12 + dy, 2, 1, DEAD_EYE);
    r(12, 15 + dy, 6, 2 + open, MOUTH);
    r(13, 17 + dy + open, 1, 2, BLOOD);
  } else if (dir === 3) {
    r(18, 11 + dy, 3, 3, ROT);
    r(19, 12 + dy, 1, 1, DEAD_EYE);
    r(18, 15 + dy, 4, 2 + open, MOUTH);
    r(20, 17 + dy + open, 1, 2, BLOOD);
  }
}

/** plamy i dziury w ubraniu */
function stains(r: Rect, dir: number, dy: number, seed: number) {
  const side = dir >= 2;
  const x0 = side ? 11 : 9;
  for (let k = 0; k < 4; k++) {
    const x = x0 + Math.floor(h2(seed, k, 4401) * (side ? 9 : 13));
    const y = 21 + dy + Math.floor(h2(seed, k, 4402) * 9);
    r(x, y, 1 + (k & 1), 2, k < 2 ? BLOOD : ROT);
  }
}

/** chwiejny chód z rękami przed sobą; bite: rzut z ugryzieniem (głowa niżej i do przodu) */
function lurch(r: Rect, L: Look, dir: number, f: number, seed: number, lunge = 0) {
  const step = lunge ? 0 : f === 1 ? 1 : f === 3 ? -1 : 0;
  const bob = lunge ? 1 : f === 1 || f === 3 ? 1 : 0;
  const dy = bob + 1 + lunge;
  legs(r, L, dir, step, bob);
  if (dir === 3) {
    // głowa wysunięta do przodu
    const fw: Rect = (x, y, w, h, c) => r(x + 2 + lunge, y, w, h, c);
    armSide(r, L, 13, 23 + bob, 13 + lunge * 2);
    torso(r, L, dir, bob);
    stains(r, dir, bob, seed);
    head(fw, L, dir, dy, false);
    zface(fw, dir, dy, lunge);
    armSide(r, L, 15, 22 + bob, 13 + lunge * 2);
  } else if (dir === 0) {
    torso(r, L, dir, bob);
    stains(r, dir, bob, seed);
    arm(r, L, 6, 20 + bob, 7 + lunge * 2);
    arm(r, L, 23, 20 + bob, 7 + lunge * 2);
    head(r, L, dir, dy, false);
    zface(r, dir, dy, lunge);
  } else {
    torso(r, L, dir, bob);
    r(5, 19 + bob, 4, 5, OUT);
    r(23, 19 + bob, 4, 5, OUT);
    r(6, 20 + bob, 2, 3, shade(L.jacket, 0.85));
    r(24, 20 + bob, 2, 3, shade(L.jacket, 0.85));
    head(r, L, dir, dy, false);
  }
}

/** atlas szwendaczy: wiersz = wygląd; kolumny: chód (kierunek × 4), ugryzienie (kierunek × 2), trup × 4 */
export function makeZombieAtlas(): AnyCanvas {
  const c = newCanvas(ZATLAS_W, ZATLAS_H);
  const ctx = ctx2d(c) as CanvasRenderingContext2D;
  for (let look = 0; look < ZLOOKS; look++) {
    const L = zombieLook(look);
    for (const pose of ['lurch', 'bite'] as const)
      for (let dir = 0; dir < 4; dir++)
        for (let f = 0; f < ZPOSE_FRAMES[pose]; f++) {
          const [x, y] = zFrameRect(look, pose, dir, f);
          const r = painter(ctx, x, y, FW, dir === 2);
          shadowAt(ctx, x + 16, y + 45, 9, 3);
          lurch(r, L, dir === 2 ? 3 : dir, f, look * 7 + dir, pose === 'bite' ? 1 + f : 0);
        }
    for (let o = 0; o < 4; o++) {
      const [x, y] = zLieRect(look, o);
      // kałuża pod trupem
      ctx.fillStyle = 'rgba(52,10,8,0.5)';
      ctx.beginPath();
      ctx.ellipse(x + 24, y + 25, 12, 6, (o & 1) * (Math.PI / 2), 0, Math.PI * 2);
      ctx.fill();
      lie(ctx, x, y, L, 'floor', o);
    }
  }
  return c;
}

/** atlas: wiersz = wygląd; kolumny: pozy (kierunek × klatki), potem leżenie (w łóżku, na podłodze) × 4 */
export function makePeopleAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const ctx = c.getContext('2d')!;
  for (let look = 0; look < LOOKS; look++) {
    const L = lookOf(look);
    for (let dir = 0; dir < 4; dir++)
      for (let f = 0; f < FRAMES; f++) {
        const [x, y] = frameRect(look, 'walk', dir, f);
        drawFrame(ctx, x, y, L, dir, f);
      }
    for (const pose of POSES) {
      if (pose === 'walk') continue;
      for (let dir = 0; dir < 4; dir++)
        for (let f = 0; f < POSE_FRAMES[pose]; f++) {
          const [x, y] = frameRect(look, pose, dir, f);
          const r = painter(ctx, x, y, FW, dir === 2);
          const d = dir === 2 ? 3 : dir;
          const low = pose === 'crouch' || pose === 'sit' || pose === 'search' || pose === 'doze';
          shadowAt(ctx, x + 16, y + 45, low ? 10 : 9, 3);
          if (pose === 'carry') carry(r, L, d, f);
          else if (pose === 'chop') chop(r, L, d, f);
          else if (pose === 'crouch') crouch(r, L, d, f);
          else if (pose === 'cook') cook(r, L, d, f);
          else if (pose === 'sit') sit(r, L, d);
          else if (pose === 'swing') swing(r, L, d, f);
          else if (pose === 'aim') aim(r, L, d, f);
          else if (pose === 'search') search(r, L, d, f);
          else if (pose === 'hammer') hammer(r, L, d, f);
          else if (pose === 'planks') planks(r, L, d, f);
          else if (pose === 'scrap') scrap(r, L, d, f);
          else if (pose === 'doze') doze(r, L, d);
          else guard(r, L, d, f);
        }
    }
    for (const kind of ['bed', 'floor'] as const)
      for (let o = 0; o < 4; o++) {
        const [x, y] = lieRect(look, kind, o);
        lie(ctx, x, y, L, kind, o);
      }
  }
  return c;
}

/** kolor zarysu pionka widzianego przez koronę drzewa */
const XRAY: readonly [number, number, number] = [246, 231, 176];

/**
 * Zarys postaci z atlasu: brzeg sylwetki szeroki na piksel w kolorze XRAY, reszta przezroczysta, w tym
 * cień pod stopami (półprzezroczysty). Ten sam układ klatek co atlas. Widok rysuje go na wierzchu, gdy
 * ktoś z zarządu stoi za koroną drzewa, zamiast przyciemniać całą koronę. Tylko w przeglądarce
 * (czyta piksele płótna).
 */
export function outlineAtlas(src: AnyCanvas): AnyCanvas {
  const w = src.width;
  const h = src.height;
  const a = ctx2d(src).getImageData(0, 0, w, h).data;
  const out = newCanvas(w, h);
  const ctx = ctx2d(out);
  const img = ctx.createImageData(w, h);
  const o = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] >= 200;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) || (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) continue;
      const i = (y * w + x) * 4;
      o[i] = XRAY[0];
      o[i + 1] = XRAY[1];
      o[i + 2] = XRAY[2];
      o[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return out;
}
