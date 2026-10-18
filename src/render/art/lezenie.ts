/* Leżenie i zwłoki postaci z PixelLab bez nowych generacji: komórka leżenia powstaje z klatki stania przodem (kierunek
   południowy, klatka 0) obróconej o ćwiartki tak, żeby głowa leżała po stronie o (0 góra, 1 prawo, 2 dół, 3 lewo, jak
   lieHead w leżeniu z kodu, art/people.ts). Na podłodze: cała sylwetka na lekkim cieniu, środkiem komórki (zwłoki
   kładzie się środkiem). W łóżku: sama głowa z karkiem i półprzezroczysty koc w kształcie z kodu od karku w stronę nóg
   (łóżko z kocem rysuje rzecz pod spodem). Czyste funkcje na pikselach jak w atlasie (0xAABBGGRR), bez PixiJS. Cień i koc
   mają alfę prostą, nie mnożoną: tekstura z komórki ma ją mnożyć przy wgraniu, jak każda inna z atlasu. */

import type { Lie } from './people.ts';
import type { Obraz } from './pixellab.ts';

/** komórka leżenia: obraz kwadratowy i środek głowy w nim, w pikselach (kotwica leżącego: tę kropkę kładzie się na
    poduszce, a leżącemu na podłodze tam, gdzie upadł) */
export interface KomorkaLezenia extends Obraz {
  hx: number;
  hy: number;
}

/** pusty pas wokół sylwetki: miejsce na cień */
const MARGINES = 3;
/** środek głowy w sylwetce przodem: tyle jej wysokości od czubka */
const GLOWA = 0.17;
/** w łóżku widać sylwetkę od czubka do tej części jej wysokości (głowa z karkiem), niżej jest koc */
const KARK = 0.38;
/** połowa szerokości koca: najmniej i najwięcej pikseli od osi ciała (z ramion, żeby nie wystawały spod koca) */
const POL_KOCA = [7, 12] as const;
/** najdalej tyle pikseli od osi ciała widać w łóżku: rekwizyty dalej (kij do selfie) zostają pod kocem */
const ZASIEG_LOZKA = POL_KOCA[1] + 1;
/** kolor i krycie cienia pod ciałem (rgba(10,12,18,0.3) jak w leżeniu z kodu) */
const CIEN = 0x4d120c0a;
/** warstwy koca (0xAABBGGRR): zarys ciała ciemniej, oświetlony brzeg, wywinięty koc pod brodą, koniec przy stopach */
const KOC_CIEN = 0x29000000;
const KOC_BRZEG = 0x24ffffff;
const KOC_ZAWIJ = 0x38ffffff;
const KOC_STOPY = 0x1f000000;

/** obrót obrazu o `cwiartki` × 90° zgodnie z ruchem wskazówek zegara (ujemne i duże liczą się modulo 4); zawsze kopia */
export function obroc(img: Obraz, cwiartki: number): Obraz {
  const k = ((cwiartki % 4) + 4) % 4;
  const { w, h, px } = img;
  if (k === 0) return { w, h, px: px.slice() };
  const nw = k === 2 ? w : h;
  const nh = k === 2 ? h : w;
  const out = new Uint32Array(nw * nh);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      // nowy(x, y) z którego starego: 90° (y, h−1−x), 180° (w−1−x, h−1−y), 270° (w−1−y, x)
      const sx = k === 1 ? y : k === 2 ? w - 1 - x : w - 1 - y;
      const sy = k === 1 ? h - 1 - x : k === 2 ? h - 1 - y : x;
      out[y * nw + x] = px[sy * w + sx];
    }
  return { w: nw, h: nh, px: out };
}

/** wycinek obrazu [x, y, w, h] jako osobny obraz; część poza obrazem jest przezroczysta */
export function wytnij(img: Obraz, x: number, y: number, w: number, h: number): Obraz {
  const px = new Uint32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const sx = x + c;
      const sy = y + r;
      if (sx >= 0 && sx < img.w && sy >= 0 && sy < img.h) px[r * w + c] = img.px[sy * img.w + sx];
    }
  return { w, h, px };
}

/** piksel `src` nałożony na `dst` (obie alfy proste, nie mnożone): zwykłe „nad” */
export function nad(dst: number, src: number): number {
  const sa = src >>> 24;
  if (sa === 0) return dst;
  const da = dst >>> 24;
  if (sa === 255 || da === 0) return src;
  const stary = (da * (255 - sa)) / 255;
  const a = sa + stary;
  const kanal = (przesuniecie: number) =>
    Math.round((((src >>> przesuniecie) & 255) * sa + ((dst >>> przesuniecie) & 255) * stary) / a);
  return ((Math.round(a) << 24) | (kanal(16) << 16) | (kanal(8) << 8) | kanal(0)) >>> 0;
}

/** prostokąt [x1, x2) × [y1, y2) w kolorze `kolor` nałożony na obraz */
function prostokat(c: Obraz, x1: number, y1: number, x2: number, y2: number, kolor: number): void {
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) c.px[y * c.w + x] = nad(c.px[y * c.w + x], kolor);
}

/** pierwsze `wiersze` wierszy obrazu `src` nałożone na komórkę w (x0, y0) */
function nalozWiersze(c: Obraz, src: Obraz, x0: number, y0: number, wiersze: number): void {
  for (let r = 0; r < wiersze; r++)
    for (let x = 0; x < src.w; x++) {
      const i = (y0 + r) * c.w + x0 + x;
      c.px[i] = nad(c.px[i], src.px[r * src.w + x]);
    }
}

/**
 * Głowa z karkiem do łóżka: pierwsze `wiersze` wierszy sylwetki w kolumnach [od, do_), tylko piksele spójne (8 sąsiadów)
 * z pikselem (sx, sy) na głowie. Urwane kawałki rekwizytów (kij do selfie, którego ręka jest pod kocem) znikają. Gdy
 * (sx, sy) wypada na przezroczystym pikselu, zostaje cały wycinek.
 */
function glowaZKarkiem(front: Obraz, wiersze: number, od: number, do_: number, sx: number, sy: number): Obraz {
  const { w } = front;
  const wynik: Obraz = { w, h: wiersze, px: new Uint32Array(w * wiersze) };
  const jest = (x: number, y: number) =>
    x >= od && x < do_ && y >= 0 && y < wiersze && front.px[y * w + x] >>> 24 !== 0;
  if (!jest(sx, sy)) {
    for (let y = 0; y < wiersze; y++) for (let x = od; x < do_; x++) wynik.px[y * w + x] = front.px[y * w + x];
    return wynik;
  }
  wynik.px[sy * w + sx] = front.px[sy * w + sx];
  const stos = [sy * w + sx];
  for (let i = stos.pop(); i !== undefined; i = stos.pop()) {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * w + x + dx;
        if (!jest(x + dx, y + dy) || wynik.px[j]) continue;
        wynik.px[j] = front.px[j];
        stos.push(j);
      }
  }
  return wynik;
}

/** cień pod ciałem: elipsa na środku komórki, wzdłuż ciała o jeden piksel dłuższa, w poprzek o dwa szersza */
function cien(c: Obraz, dlugosc: number, szerokosc: number): void {
  const ry = dlugosc / 2 + 1;
  const rx = Math.min(szerokosc, 20) / 2 + 2;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const dx = (x + 0.5 - c.w / 2) / rx;
      const dy = (y + 0.5 - c.h / 2) / ry;
      if (dx * dx + dy * dy <= 1) c.px[y * c.w + x] = nad(c.px[y * c.w + x], CIEN);
    }
}

/** połowa szerokości koca z rozpiętości sylwetki w wierszu `wiersz` (ostatni widoczny nad kocem: ramiona) */
function polKoca(front: Obraz, wiersz: number): number {
  let od = front.w;
  let do_ = -1;
  for (let x = 0; x < front.w; x++)
    if (front.px[wiersz * front.w + x] >>> 24) {
      od = Math.min(od, x);
      do_ = x;
    }
  const rozpietosc = do_ < 0 ? front.w : do_ - od + 1;
  return Math.max(POL_KOCA[0], Math.min(POL_KOCA[1], Math.ceil(rozpietosc / 2)));
}

/** koc od karku (wiersz yk) do stóp (yb) wokół osi ciała w kolumnie cx, o szerokości 2·pol (układ jak lie() w kodzie) */
function koc(c: Obraz, cx: number, yk: number, yb: number, pol: number): void {
  const x1 = cx - pol;
  const x2 = cx + pol;
  prostokat(c, x1, yk - 2, x2, yb, KOC_CIEN);
  prostokat(c, x1, yk + 2, x1 + 2, yb - 2, KOC_BRZEG);
  prostokat(c, x1, yk, x2, yk + 2, KOC_ZAWIJ);
  prostokat(c, x1 + 2, yb - 2, x2 - 2, yb, KOC_STOPY);
}

/**
 * Komórka leżenia z klatki stania przodem `front` (ax: środek korpusu w jej szerokości) dla strony głowy o (0 góra,
 * 1 prawo, 2 dół, 3 lewo). `floor`: cała sylwetka na cieniu, na środku komórki; `bed`: głowa z karkiem i koc. Komórka
 * jest kwadratem o boku większym od sylwetki, środek głowy ma współrzędne całkowite (kotwica leży na granicy pikseli,
 * więc rysunek zostaje ostry).
 */
export function komorkaLezenia(front: Obraz, ax: number, rodzaj: Lie, o: number): KomorkaLezenia {
  const { w, h } = front;
  const b = Math.max(w, h) + 2 * MARGINES;
  const x0 = (b - w) >> 1;
  const y0 = (b - h) >> 1;
  // składamy głową do góry, a na końcu obracamy całą komórkę
  const pion: Obraz = { w: b, h: b, px: new Uint32Array(b * b) };
  if (rodzaj === 'floor') {
    cien(pion, h, w);
    nalozWiersze(pion, front, x0, y0, h);
  } else {
    const kark = Math.round(h * KARK);
    koc(pion, x0 + ax, y0 + kark, y0 + h, polKoca(front, kark - 1));
    const glowa = glowaZKarkiem(
      front,
      kark,
      Math.max(0, ax - ZASIEG_LOZKA),
      Math.min(w, ax + ZASIEG_LOZKA),
      ax,
      Math.round(h * GLOWA),
    );
    nalozWiersze(pion, glowa, x0, y0, kark);
  }
  const gx = x0 + ax;
  const gy = y0 + Math.round(h * GLOWA);
  // środek głowy po obrocie komórki zgodnie z zegarem o 90° · o
  const [hx, hy] = [
    [gx, gy],
    [b - gy, gx],
    [b - gx, b - gy],
    [gy, b - gx],
  ][o & 3];
  return { ...obroc(pion, o), hx, hy };
}
