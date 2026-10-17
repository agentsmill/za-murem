/* Arkusz podglądu wraków, garnka z posiłkiem i stert materiału (M1, grafika zastępcza): maluch
   i polonez w czterech ustawieniach i we wszystkich wyglądach z ziarna, garnek na podłodze i na
   stole, sterty z World.props w trzech wielkościach i scena parkingu z ludźmi dla skali.
   Uruchomienie: node tools/arkusz-wraki.ts
   Wynik: shots/wraki-1x.png i shots/wraki-2x.png (shots/ jest w .gitignore). */

import fs from 'node:fs';
import path from 'node:path';
import { h2 } from '../src/render/art/hash.ts';
import { C } from '../src/render/art/palette.ts';
import { FH, FW, makePeopleAtlas } from '../src/render/art/people.ts';
import {
  footprint,
  type Rot,
  type Sprite,
  type ThingSpec,
  thingSprite,
  WRECK_MODELS,
} from '../src/render/art/rzeczy.ts';
import { pileSize, potSize, WRECK_LOOKS } from '../src/render/section.ts';
import { type FakeCanvas, fakeDocument, type Pix, Plotno } from './arkusz-plotno.ts';

const OUT = path.resolve(import.meta.dirname, '../shots');
fs.mkdirSync(OUT, { recursive: true });

const T = 32;
const BG = 0x24262a;
const INK = 0xd8d4c8;
const DIM = 0x8a8780;
const ROTS: Rot[] = [0, 1, 2, 3];

const p = new Plotno(1216, 1900, BG);
let y = 16;
p.text(16, y, 'za murem, m1: wraki, garnek i sterty (grafika zastępcza, 32 px na metr)', INK);
y += 20;

/** asfalt parkingu w kolorach mapy, z pęknięciami jak na kawałkach */
function asphalt(x0: number, y0: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const r = h2((x0 + i) >> 1, (y0 + j) >> 1, 3);
      p.rect(x0 + i, y0 + j, 1, 1, r < 0.35 ? C.asph0 : r < 0.8 ? C.asph1 : C.asph2);
    }
}

/** trawa (do garnka na podłodze i sterty: podwórko) */
function grass(x0: number, y0: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const r = h2((x0 + i) >> 1, (y0 + j) >> 1, 5);
      p.rect(x0 + i, y0 + j, 1, 1, r < 0.3 ? C.grass0 : r < 0.62 ? C.grass1 : r < 0.9 ? C.grass2 : C.grass3);
    }
}

/** podłoga kuchni: linoleum w kratkę */
function lino(x0: number, y0: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = (((x0 + i) >> 3) + ((y0 + j) >> 3)) & 1 ? 0x9a8f7a : 0x8a7f6a;
      p.rect(x0 + i, y0 + j, 1, 1, c);
    }
}

/** rzecz z kotwicą na środku dolnej krawędzi podstawy, podstawa od kafelka (x0, y0) arkusza */
function put(spec: ThingSpec, x0: number, y0: number): Sprite {
  const sp = thingSprite(spec);
  const fp = footprint(spec);
  p.blit(sp, x0 + (fp.w * T) / 2 - sp.ax, y0 + fp.h * T - sp.ay);
  return sp;
}

/** obrys podstawy rzeczy: kafelki, żeby było widać, czy sprite trzyma się kratki */
function grid(x0: number, y0: number, w: number, h: number) {
  for (let j = 0; j <= h; j++) p.rect(x0, y0 + j * T, w * T, 1, 0x50535a);
  for (let i = 0; i <= w; i++) p.rect(x0 + i * T, y0, 1, h * T, 0x50535a);
}

// ---------------------------------------------------------------- wraki w czterech ustawieniach

for (const model of WRECK_MODELS) {
  for (const seed of [0, 5]) {
    p.text(16, y, `${model}, ziarno ${seed}: rot 0 przodem na wschód, 1 na południe, 2 na zachód, 3 na północ`, DIM);
    y += 34;
    let x = 32;
    let rowH = 0;
    for (const rot of ROTS) {
      const spec: ThingSpec = { kind: 'wrak', model, rot, seed };
      const fp = footprint(spec);
      asphalt(x - 8, y - 8, fp.w * T + 16, fp.h * T + 16);
      grid(x, y, fp.w, fp.h);
      put(spec, x, y);
      p.text(x, y + fp.h * T + 12, `rot ${rot}: ${fp.w}×${fp.h}`, DIM);
      x += fp.w * T + 40;
      rowH = Math.max(rowH, fp.h * T);
    }
    y += rowH + 32;
  }
}

// ---------------------------------------------------------------- wszystkie wyglądy

p.text(
  16,
  y,
  `wyglądy z ziarna (0..${WRECK_LOOKS - 1}): lakier, rdza, szyby, drzwi z innego auta, brak pokrywy, bagażnik`,
  DIM,
);
y += 34;
for (const model of WRECK_MODELS) {
  let x = 32;
  const [lw, lh] = model === 'maluch' ? [3, 2] : [4, 2];
  const perRow = model === 'maluch' ? 6 : 4;
  for (let k = 0; k < WRECK_LOOKS; k++) {
    if (k > 0 && k % perRow === 0) {
      x = 32;
      y += lh * T + 40;
    }
    asphalt(x - 6, y - 6, lw * T + 12, lh * T + 12);
    put({ kind: 'wrak', model, rot: 0, seed: k }, x, y);
    p.text(x, y + lh * T + 10, `${model} ${k}`, DIM);
    x += lw * T + 44;
  }
  y += lh * T + 48;
}

// ---------------------------------------------------------------- garnek

p.text(16, y, 'garnek z posiłkiem: porcje 0, 1–2, 3–5, 6+ (na podłodze i na stole), stół obrócony', DIM);
y += 34;
{
  let x = 32;
  for (const n of [0, 2, 4, 7]) {
    grass(x - 4, y - 8, T + 8, T + 12);
    put({ kind: 'posilek', size: potSize(n), seed: 3 }, x, y);
    p.text(x, y + T + 10, `${n} porcji`, DIM);
    x += T + 32;
  }
  x += 16;
  for (const n of [0, 2, 4, 7]) {
    lino(x - 4, y - 16, 2 * T + 8, T + 20);
    put({ kind: 'stol', rot: 0, seed: 11 }, x, y);
    put({ kind: 'posilek', size: potSize(n), table: true, seed: 3 + n }, x, y);
    p.text(x, y + T + 10, `stół, ${n}`, DIM);
    x += 2 * T + 28;
  }
  lino(x - 4, y - 16, T + 8, 2 * T + 20);
  put({ kind: 'stol', rot: 1, seed: 11 }, x, y);
  put({ kind: 'posilek', size: 3, table: true, seed: 8 }, x, y);
  p.text(x, y + 2 * T + 10, 'stół rot 1', DIM);
  y += 2 * T + 40;
}

// ---------------------------------------------------------------- sterty

p.text(16, y, 'sterty z world.props: gruz, deski, złom, n sztuk → wielkość', DIM);
y += 34;
{
  let x = 32;
  for (const kind of ['gruz', 'deski', 'zlom'] as const)
    for (const n of [2, 4, 7]) {
      grass(x - 4, y - 16, T + 8, T + 20);
      put({ kind, size: pileSize(n), seed: 9 }, x, y);
      p.text(x, y + T + 10, `${kind} ${n}`, DIM);
      x += T + 30;
    }
  y += T + 40;
}

// ---------------------------------------------------------------- scena: parking z ludźmi

fakeDocument();
const atlas: Pix = (makePeopleAtlas() as unknown as FakeCanvas).toPix();
function pawn(look: number, dir: number): Sprite {
  const px = new Uint32Array(FW * FH);
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) px[j * FW + i] = atlas.px[(look * FH + j) * atlas.w + dir * 4 * FW + i];
  return { w: FW, h: FH, ax: 16, ay: 45, px };
}

p.text(16, y, 'scena: parking pod blokiem, ludzie dla skali', DIM);
y += 20;
{
  const x0 = 32;
  const y0 = y;
  const W = 22;
  const H = 9;
  asphalt(x0, y0, W * T, H * T);
  // linie miejsc postojowych
  for (let i = 0; i <= 7; i++) p.rect(x0 + 16 + i * 80, y0 + 8, 2, 72, 0x8f8c84);
  const items: { sp: Sprite; x: number; y: number }[] = [];
  const at = (spec: ThingSpec, tx: number, ty: number) => {
    const fp = footprint(spec);
    items.push({ sp: thingSprite(spec), x: x0 + (tx + fp.w / 2) * T, y: y0 + (ty + fp.h) * T });
  };
  at({ kind: 'wrak', model: 'maluch', rot: 1, seed: 1 }, 1, 0);
  at({ kind: 'wrak', model: 'polonez', rot: 1, seed: 2 }, 6, 0);
  at({ kind: 'wrak', model: 'maluch', rot: 3, seed: 7 }, 13, 0);
  at({ kind: 'wrak', model: 'polonez', rot: 0, seed: 9 }, 3, 6);
  at({ kind: 'wrak', model: 'maluch', rot: 2, seed: 4 }, 12, 6);
  items.push({ sp: pawn(0, 0), x: x0 + 9.5 * T, y: y0 + 5.2 * T });
  items.push({ sp: pawn(3, 2), x: x0 + 11 * T, y: y0 + 7.6 * T });
  items.push({ sp: pawn(5, 1), x: x0 + 17.5 * T, y: y0 + 4.4 * T });
  for (const it of items.sort((a, b) => a.y - b.y)) p.blit(it.sp, it.x - it.sp.ax, it.y - it.sp.ay);
  y += H * T + 16;
}

const used = Math.min(p.h, y + 8);
const sheet = p.crop(0, 0, p.w, used);
sheet.save(path.join(OUT, 'wraki-1x.png'));
sheet.save(path.join(OUT, 'wraki-2x.png'), 2);
console.log(`arkusz: shots/wraki-1x.png i wraki-2x.png (${p.w}×${used})`);
