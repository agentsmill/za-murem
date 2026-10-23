/* Portret osoby na liście ludzi (src/ui/lista.ts): głowa i ramiona wycięte z klatki sprite'a, który rysuje mapa (postać
   z PixelLab albo rysowana kodem), wpisane w kwadrat. Ta sama klatka co na mapie, więc osobę z listy da się rozpoznać
   na mapie. Czysta część na pikselach (Uint32Array 0xAABBGGRR jak w sprite'ach gry), bez DOM; zamiana na obraz do
   `<img>` i wybór klatki są w `ikony.ts`. */

import type { Obraz } from '../render/art/pixellab.ts';
import type { LudziePixellab, OsobaLudzi, PionekLudzi } from '../render/ludziePixellab.ts';
import type { PoseView } from '../render/poses.ts';

/** bok portretu w pikselach sprite'a; CSS rysuje go dwa razy większy na komputerze (40 px), półtora raza na telefonie */
export const BOK_PORTRETU = 20;
/** wiersz portretu, od którego zaczyna się sylwetka: jeden przezroczysty wiersz nad głową */
const GORA = 1;
/** ile górnych wierszy sylwetki to głowa przy środkowaniu: oś postaci wyznacza głowa, nie rozłożone ramiona */
const WIERSZE_GLOWY = 10;

/**
 * Portret z klatki `r` = [x, y, szerokość, wysokość] obrazu `px` o szerokości `stride`: górne wiersze sylwetki w kwadracie
 * `bok` × `bok`, sylwetka od drugiego wiersza, głowa na środku, dół i boki ucięte. Piksele spoza prostokąta klatki (sąsiednie
 * klatki atlasu) nie wchodzą. `flip` odbija wynik poziomo (klatki wschodnie rysuje się lustrem). null dla pustej klatki.
 */
export function portretPikseli(
  px: Uint32Array,
  stride: number,
  r: readonly [x: number, y: number, w: number, h: number],
  flip: boolean,
  bok = BOK_PORTRETU,
): Uint32Array | null {
  const [rx, ry, rw, rh] = r;
  const zajete = (x: number, y: number) => px[(ry + y) * stride + rx + x] >>> 24 !== 0;
  let gora = -1;
  for (let y = 0; y < rh && gora < 0; y++) for (let x = 0; x < rw; x++) if (zajete(x, y)) gora = y;
  if (gora < 0) return null;
  // obrys głowy: kolumny zajęte w jej wierszach
  let g0 = rw;
  let g1 = -1;
  for (let y = gora; y < Math.min(rh, gora + WIERSZE_GLOWY); y++)
    for (let x = 0; x < rw; x++)
      if (zajete(x, y)) {
        if (x < g0) g0 = x;
        if (x > g1) g1 = x;
      }
  // kolumna klatki, która trafia w kolumnę 0 portretu: środek głowy na środku portretu
  const x0 = Math.floor((g0 + g1 + 1 - bok) / 2);
  const out = new Uint32Array(bok * bok);
  for (let oy = GORA; oy < bok; oy++) {
    const sy = gora + oy - GORA;
    if (sy >= rh) break;
    for (let ox = 0; ox < bok; ox++) {
      const sx = x0 + ox;
      if (sx >= 0 && sx < rw) out[oy * bok + (flip ? bok - 1 - ox : ox)] = px[(ry + sy) * stride + rx + sx];
    }
  }
  return out;
}

/** poza portretu: stanie przodem (południe, pierwsza klatka oddechu), jak pionek, który czeka na polecenie */
const STANIE: PoseView = { pose: 'walk', dir: 0, frame: 0 };

/**
 * Portret pionka z atlasu PixelLab: ta sama postać i ta sama wersja kolorystyczna, którą gra pionek na mapie
 * (`LudziePixellab` widoku; wersje zarządu muszą być już przypisane przez `przypiszZarzad`, co widok robi w każdej
 * klatce). `klucz` (postać i wersja) pozwala trzymać gotowy obraz w pamięci podręcznej. null, gdy obsada nie ma postaci
 * dla pionka (wtedy portret rysuje się z kodu) albo postać nie ma klatki stania.
 */
export function portretPixellab(
  dane: LudziePixellab,
  img: Obraz,
  pionek: PionekLudzi,
  osoby: readonly OsobaLudzi[],
  bok = BOK_PORTRETU,
): { klucz: string; px: Uint32Array } | null {
  const postac = dane.postacPionka(pionek, osoby);
  if (!postac) return null;
  // klatka jest jedną współdzieloną odpowiedzią: zużywam ją od razu
  const k = dane.klatka(postac, STANIE, false, 0, dane.wersjaPionka(pionek, postac));
  if (!k) return null;
  const zrodlo = k.wersja > 0 ? dane.pikseleWersji(k.zarzad, k.wersja) : img;
  const px = portretPikseli(zrodlo.px, zrodlo.w, [k.x, k.y, k.w, k.h], k.flip, bok);
  return px && { klucz: `${postac.id}|${k.wersja}`, px };
}
