/* Pies i kot rysowani kodem (grafika zapasowa, bez zamówienia w PixelLab): burek w szaro-brązowych kłakach i rudy kot.
   Jeden atlas, rysowany samymi prostokątami (działa też z atrapą płótna w Node), kształtem jak atlas szwendaczy
   (`makeZombieAtlas` w people.ts): wiersz = rodzaj zwierzęcia, kolumny = poza × kierunek × klatka.
   Pozy: chód (4 klatki, widać zad, bok i przód), leżenie (2 klatki oddechu; zawsze z boku, zwinięty kot), szczekanie psa
   z głową w górę i otwartym pyskiem (2 klatki; kot dostaje tu czujne stanie, żeby atlas miał ten sam układ).
   Klatka 32×32 px, stopy zwierzęcia w (16, 29): pies ma w skali gry około 0,8 m długości, kot 0,5 m. Kierunki jak u ludzi:
   0 dół (przodem do patrzącego), 1 góra (tyłem), 2 lewo (odbicie prawej strony), 3 prawo.
   Kontrakt: `animalFrameRect(rodzaj, poza, kierunek, klatka)` daje prostokąt w atlasie, `makeAnimalAtlas()` rysuje go
   w całości; widok (PixiJS) tylko tnie z niego tekstury. */

import { type AnyCanvas, ctx2d, newCanvas } from './canvas.ts';
import { h2 } from './hash.ts';
import { css } from './palette.ts';

export type RodzajZwierzat = 'pies' | 'kot';
export type ZwierzePoza = 'chod' | 'lez' | 'szczek';

export const ZW_FW = 32;
export const ZW_FH = 32;
/** stopy zwierzęcia w klatce (kotwica sprite'a) */
export const ZW_KOTWICA: readonly [number, number] = [16, 29];
export const ZW_POZY: readonly ZwierzePoza[] = ['chod', 'lez', 'szczek'];
export const ZW_KLATKI: Record<ZwierzePoza, number> = { chod: 4, lez: 2, szczek: 2 };
export const ZW_RODZAJE: readonly RodzajZwierzat[] = ['pies', 'kot'];
const RZAD: Record<RodzajZwierzat, number> = { pies: 0, kot: 1 };

const KOLUMNA = {} as Record<ZwierzePoza, number>;
let kolumn = 0;
for (const p of ZW_POZY) {
  KOLUMNA[p] = kolumn;
  kolumn += 4 * ZW_KLATKI[p];
}
export const ZW_ATLAS_W = kolumn * ZW_FW;
export const ZW_ATLAS_H = ZW_RODZAJE.length * ZW_FH;

/** klatka zwierzęcia w atlasie: x, y, szerokość, wysokość */
export function animalFrameRect(
  rodzaj: RodzajZwierzat,
  poza: ZwierzePoza,
  dir: number,
  f: number,
): [number, number, number, number] {
  return [(KOLUMNA[poza] + (dir & 3) * ZW_KLATKI[poza] + f) * ZW_FW, RZAD[rodzaj] * ZW_FH, ZW_FW, ZW_FH];
}

type Rect = (x: number, y: number, w: number, h: number, c: number) => void;
/** część sylwetki: prostokąt z obrysem */
type Czesc = readonly [x: number, y: number, w: number, h: number, c: number];

const OUT = 0x1a1716;
const OKO = 0x1d1a18;
// burek: szaro-brązowy kundel z jaśniejszym pyskiem i piersią
const PIES = {
  futro: 0x8c7b68,
  cien: 0x65574a,
  jasne: 0xb8a98f,
  ucho: 0x4f4338,
  pysk: 0xc9bb9f,
  nos: 0x1d1a18,
  jezyk: 0xc4605a,
};
// kot: rudy w paski
const KOT = { futro: 0xd98a3b, cien: 0xa8601f, jasne: 0xf0b56a, brzuch: 0xf6e3c0, nos: 0xd88a8a, oko: 0x8fbf4a };

/** sylwetka: najpierw obrysy wszystkich części, potem ich wypełnienia, więc obrys jest tylko wokół całości */
function sylwetka(r: Rect, czesci: readonly Czesc[]): void {
  for (const [x, y, w, h] of czesci) r(x - 1, y - 1, w + 2, h + 2, OUT);
  for (const [x, y, w, h, c] of czesci) r(x, y, w, h, c);
}

/** cień pod stopami */
function cien(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(10,12,18,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** pomalowanie klatki (ox, oy); mirror odbija w poziomie (kierunek 2 to odbity kierunek 3) */
function painter(ctx: CanvasRenderingContext2D, ox: number, oy: number, mirror: boolean): Rect {
  return (x, y, w, h, c) => {
    ctx.fillStyle = css(c);
    ctx.fillRect(ox + (mirror ? ZW_FW - x - w : x), oy + y, w, h);
  };
}

/** przesunięcia nóg w chodzie (przednia bliższa, przednia dalsza, tylna bliższa, tylna dalsza) w kolejnych klatkach */
const KROK = {
  fn: [2, 0, -2, 0],
  ff: [-2, 0, 2, 0],
  bn: [-2, 0, 2, 0],
  bf: [2, 0, -2, 0],
} as const;

/** kłaki: kilka ciemniejszych i jaśniejszych punktów na korpusie, zawsze w tych samych miejscach */
function klaki(r: Rect, x: number, y: number, w: number, h: number, seed: number): void {
  for (let k = 0; k < 6; k++) {
    const px = x + Math.floor(h2(seed, k, 71) * w);
    const py = y + Math.floor(h2(seed, k, 72) * h);
    r(px, py, 1, 1, k < 3 ? PIES.cien : PIES.jasne);
  }
}

// ---------------------------------------------------------------- pies

/** pies z boku, głową w prawo: stanie i chód (f: klatka chodu, kuca: tylko stanie), szczekanie (glowa: o ile wyżej
    głowa, pysk: otwarty) */
function psiBok(r: Rect, f: number, o: { chod: boolean; glowa?: number; pysk?: boolean; odrzut?: number }): void {
  const g = o.glowa ?? 0;
  const dx = o.odrzut ?? 0;
  const bob = o.chod && (f === 1 || f === 3) ? 1 : 0;
  const noga = (x: number, off: number): Czesc => {
    const lift = o.chod && off === 0 ? 2 : 0;
    return [x + (o.chod ? off : 0), 21 + bob, 2, 8 - bob - lift, PIES.cien];
  };
  const wag = o.chod ? (f % 2 === 0 ? 0 : 1) : 0;
  const czesci: Czesc[] = [
    // dalsze nogi (ciemniejsze)
    noga(12 + dx, o.chod ? KROK.bf[f] : 0),
    noga(16 + dx, o.chod ? KROK.ff[f] : 0),
    // ogon do góry i w bok, merda
    [5 + dx, 13 + bob + wag, 3, 2, PIES.futro],
    [4 + dx, 11 + bob + wag, 2, 3, PIES.cien],
    // korpus
    [8 + dx, 14 + bob, 14, 8, PIES.futro],
    // głowa, pysk, ucho
    [20 + dx, 10 + bob - g, 8, 7, PIES.futro],
    [27 + dx, 13 + bob - g, 3, 3, PIES.pysk],
    // bliższe nogi
    [9 + dx + (o.chod ? KROK.bn[f] : 0), 21 + bob, 2, 8 - bob - (o.chod && KROK.bn[f] === 0 ? 1 : 0), PIES.futro],
    [19 + dx + (o.chod ? KROK.fn[f] : 0), 21 + bob, 2, 8 - bob - (o.chod && KROK.fn[f] === 0 ? 1 : 0), PIES.futro],
  ];
  sylwetka(r, czesci);
  // jaśniejsza pierś i brzuch, kłaki
  r(10 + dx, 20 + bob, 10, 2, PIES.jasne);
  r(19 + dx, 17 + bob, 3, 4, PIES.jasne);
  klaki(r, 9 + dx, 14 + bob, 12, 5, 3);
  // ucho oklapnięte, oko, nos
  r(22 + dx, 10 + bob - g, 3, 5, PIES.ucho);
  r(25 + dx, 12 + bob - g, 1, 1, OKO);
  r(29 + dx, 13 + bob - g, 1, 1, PIES.nos);
  if (o.pysk) {
    // pysk otwarty: ciemna szczelina i różowy język
    r(27 + dx, 16 + bob - g, 3, 2, OUT);
    r(28 + dx, 16 + bob - g, 2, 1, PIES.jezyk);
  }
}

/** pies przodem (kierunek 0) albo tyłem (kierunek 1) */
function psiPrzod(r: Rect, f: number, tylem: boolean, o: { chod: boolean; pysk?: boolean }): void {
  const bob = o.chod && (f === 1 || f === 3) ? 1 : 0;
  const lewa = o.chod ? [0, 1, 0, 0][f] : 0;
  const prawa = o.chod ? [0, 0, 0, 1][f] : 0;
  const czesci: Czesc[] = [
    // nogi
    [11, 23 + bob, 3, 6 - bob - lewa, PIES.futro],
    [18, 23 + bob, 3, 6 - bob - prawa, PIES.futro],
    // korpus
    [10, 15 + bob, 12, 9, PIES.futro],
    // głowa
    [11, 8 + bob, 10, 8, tylem ? PIES.cien : PIES.futro],
  ];
  if (tylem) czesci.push([15, 10 + bob + (f % 2), 2, 6, PIES.futro]);
  sylwetka(r, czesci);
  // uszy po bokach głowy
  r(9, 9 + bob, 3, 6, PIES.ucho);
  r(20, 9 + bob, 3, 6, PIES.ucho);
  if (tylem) {
    // widać kark i zad z ogonem
    r(13, 10 + bob, 6, 4, PIES.cien);
    r(14, 20 + bob, 4, 3, PIES.jasne);
    klaki(r, 11, 16 + bob, 10, 5, 5);
    return;
  }
  r(14, 12 + bob, 4, 4, PIES.pysk);
  r(14, 11 + bob, 1, 1, OKO);
  r(17, 11 + bob, 1, 1, OKO);
  r(15, 12 + bob, 2, 1, PIES.nos);
  if (o.pysk) {
    r(15, 15 + bob, 2, 2, OUT);
    r(15, 16 + bob, 2, 1, PIES.jezyk);
  }
  r(13, 20 + bob, 6, 3, PIES.jasne);
  klaki(r, 11, 16 + bob, 10, 5, 7);
}

/** pies leży zwinięty na boku, głową w prawo; oddech: klatka 1 unosi grzbiet */
function psiLezy(r: Rect, f: number): void {
  const b = f === 1 ? 1 : 0;
  sylwetka(r, [
    [4, 25, 5, 2, PIES.cien],
    [7, 20 + (1 - b), 15, 8 - (1 - b), PIES.futro],
    [20, 21, 8, 7, PIES.futro],
    [27, 24, 3, 3, PIES.pysk],
    [22, 27, 7, 2, PIES.jasne],
  ]);
  klaki(r, 8, 21 - b, 12, 4, 11);
  r(21, 21, 3, 5, PIES.ucho);
  r(25, 23, 2, 1, OKO);
  r(29, 24, 1, 1, PIES.nos);
  r(10, 26, 9, 1, PIES.jasne);
}

// ---------------------------------------------------------------- kot

/** kot z boku, głową w prawo: stanie i chód */
function kotBok(r: Rect, f: number, chod: boolean, czujny = false): void {
  const bob = chod && (f === 1 || f === 3) ? 1 : 0;
  const noga = (x: number, off: number, kolor: number): Czesc => {
    const lift = chod && off === 0 && kolor === KOT.cien ? 2 : chod && off === 0 ? 1 : 0;
    return [x + (chod ? off : 0), 22 + bob, 2, 7 - bob - lift, kolor];
  };
  const g = czujny ? 1 : 0;
  sylwetka(r, [
    noga(12, chod ? KROK.bf[f] : 0, KOT.cien),
    noga(18, chod ? KROK.ff[f] : 0, KOT.cien),
    // ogon długi, do góry
    [8, 19 + bob, 3, 2, KOT.futro],
    [5, 13 + bob, 3, 8, KOT.futro],
    [5, 11 + bob, 3, 2, KOT.cien],
    // korpus, głowa, uszy
    [9, 17 + bob, 13, 6, KOT.futro],
    [20, 14 + bob - g, 7, 7, KOT.futro],
    [20, 12 + bob - g, 2, 2, KOT.futro],
    [25, 12 + bob - g, 2, 2, KOT.futro],
    noga(10, chod ? KROK.bn[f] : 0, KOT.futro),
    noga(20, chod ? KROK.fn[f] : 0, KOT.futro),
  ]);
  // paski na grzbiecie i ogonie, jasny brzuch, pyszczek
  for (const x of [11, 14, 17]) r(x, 17 + bob, 1, 3, KOT.cien);
  r(5, 15 + bob, 3, 1, KOT.cien);
  r(5, 18 + bob, 3, 1, KOT.cien);
  r(10, 21 + bob, 10, 2, KOT.brzuch);
  r(23, 18 + bob - g, 3, 2, KOT.brzuch);
  r(23, 16 + bob - g, 2, 1, KOT.oko);
  r(26, 17 + bob - g, 1, 1, KOT.nos);
  r(23, 14 + bob - g, 1, 1, KOT.cien);
}

/** kot przodem albo tyłem */
function kotPrzod(r: Rect, f: number, tylem: boolean, chod: boolean): void {
  const bob = chod && (f === 1 || f === 3) ? 1 : 0;
  sylwetka(r, [
    [12, 23 + bob, 3, 6 - bob, KOT.futro],
    [17, 23 + bob, 3, 6 - bob, KOT.futro],
    [11, 17 + bob, 10, 7, KOT.futro],
    [11, 10 + bob, 10, 8, KOT.futro],
    [11, 7 + bob, 2, 3, KOT.futro],
    [19, 7 + bob, 2, 3, KOT.futro],
  ]);
  if (tylem) {
    // ogon do góry po środku, paski na grzbiecie
    r(15, 11 + bob, 2, 11, KOT.cien);
    for (const y of [17, 20]) r(12, y + bob, 8, 1, KOT.cien);
    return;
  }
  r(13, 13 + bob, 1, 1, KOT.oko);
  r(18, 13 + bob, 1, 1, KOT.oko);
  r(15, 15 + bob, 2, 1, KOT.nos);
  r(13, 10 + bob, 1, 2, KOT.cien);
  r(18, 10 + bob, 1, 2, KOT.cien);
  r(14, 18 + bob, 4, 5, KOT.brzuch);
  for (const y of [18, 21]) {
    r(11, y + bob, 2, 1, KOT.cien);
    r(19, y + bob, 2, 1, KOT.cien);
  }
}

/** kot śpi zwinięty w kłębek, ogon owija pyszczek; oddech: klatka 1 unosi grzbiet */
function kotLezy(r: Rect, f: number): void {
  const b = f === 1 ? 1 : 0;
  sylwetka(r, [
    [8, 21 + (1 - b), 16, 7 - (1 - b), KOT.futro],
    [19, 21, 7, 7, KOT.futro],
    [19, 19, 2, 2, KOT.futro],
    [24, 19, 2, 2, KOT.futro],
    [9, 27, 16, 2, KOT.cien],
  ]);
  for (const x of [11, 14, 17]) r(x, 21 + (1 - b), 1, 3, KOT.cien);
  r(21, 25, 4, 1, OKO);
  r(25, 24, 1, 1, KOT.nos);
  r(9, 28, 4, 1, KOT.futro);
}

// ---------------------------------------------------------------- atlas

function rysuj(ctx: CanvasRenderingContext2D, rodzaj: RodzajZwierzat, poza: ZwierzePoza, dir: number, f: number): void {
  const [x, y] = animalFrameRect(rodzaj, poza, dir, f);
  const bok = dir >= 2;
  const lezy = poza === 'lez';
  // leżący jest zawsze z boku: góra i dół to prawa i lewa strona
  const prawo = lezy ? dir === 0 || dir === 3 : dir === 3;
  const r = painter(ctx, x, y, bok || lezy ? !prawo : false);
  cien(ctx, x + 16, y + 29, lezy ? 13 : rodzaj === 'pies' ? 11 : 8, 3);
  if (rodzaj === 'pies') {
    if (lezy) psiLezy(r, f);
    else if (poza === 'szczek') {
      if (bok) psiBok(r, 0, { chod: false, glowa: 2, pysk: f === 0, odrzut: f === 1 ? -1 : 0 });
      else psiPrzod(r, 0, dir === 1, { chod: false, pysk: f === 0 });
    } else if (bok) psiBok(r, f, { chod: true });
    else psiPrzod(r, f, dir === 1, { chod: true });
  } else if (lezy) kotLezy(r, f);
  else if (bok) kotBok(r, poza === 'chod' ? f : 0, poza === 'chod', poza === 'szczek');
  else kotPrzod(r, poza === 'chod' ? f : 0, dir === 1, poza === 'chod');
}

/** atlas zwierząt: wiersz = rodzaj (pies, kot); kolumny: chód (kierunek × 4), leżenie (kierunek × 2), szczekanie
    (kierunek × 2) */
export function makeAnimalAtlas(): AnyCanvas {
  const c = newCanvas(ZW_ATLAS_W, ZW_ATLAS_H);
  const ctx = ctx2d(c) as CanvasRenderingContext2D;
  for (const rodzaj of ZW_RODZAJE)
    for (const poza of ZW_POZY)
      for (let dir = 0; dir < 4; dir++) for (let f = 0; f < ZW_KLATKI[poza]; f++) rysuj(ctx, rodzaj, poza, dir, f);
  return c;
}
