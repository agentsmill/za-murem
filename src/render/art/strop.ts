/* Strop pięter „Ciepły tynk” (strop-tynk w assets/manifest.json, pola uzycie są źródłem prawdy dla stałych poniżej):
   płyta stropowa pod beżowym tynkiem widziana z góry. Tło rysuje kod z samego koloru, drobnego ziarna i szwów płyt,
   bo kafelki PixelLab są płaskie; z kafelków zostają rzadkie naklejki (plama zalania, rysa, łata, pleśń). Wszystko
   liczone od współrzędnych świata, więc wzór łączy się między kafelkami. Bez atlasu (?grafika=kod, brak plików) strop
   jest z samego kodu, bez naklejek. Czysta funkcja, działa w Node i w workerze. */

import { h2, vnoise } from './hash.ts';
import type { Obraz } from './pixellab.ts';

/** naklejki stropu z atlasu: `naklejek` komórek `naklejka` × `naklejka` px w jednym rzędzie, piksel z alfą 0 przepuszcza
    tło; gestosc: część kafelków 32 px z naklejką. Bez obrazu (img: null) strop jest z samego kodu. */
export interface Strop {
  img: Obraz | null;
  naklejka: number;
  naklejek: number;
  gestosc: number;
}

/** kolory 0xRRGGBB i przepis ziarna; warstwy od spodu: kurz, posredni, ciemny, brazowy (późniejsza zakrywa wcześniejszą).
    Piksel warstwy „po pikselu” ma kolor, gdy h2(ax, ay, sol) < udzial. Warstwa „pole” to szum wartościowy o kracie
    `krata` px plus drugie pole 2,2 raza drobniejsze (nie mniej niż 2 px) z wagą 0,3; piksele, w których pole jest
    niższe od `prog`, mają kolor. Próg dla udziału to jego kwantyl pola (zmierzony na 4096 × 4096 px), więc jeśli
    zmienisz kratę, sol albo wagę, przelicz go. */
export const STROP = {
  tlo: 0xe0b48c,
  szwy: [96, 64] as [number, number],
  szwyKolor: 0xb07a55,
  kurz: { kolor: 0xcac6bc, udzial: 0.28, sol: 71 },
  posredni: { kolor: 0xb7b2a6, udzial: 0.05, krata: 3, sol: 72, prog: 0.2194 },
  ciemny: { kolor: 0x9a958a, udzial: 0.01, krata: 2, sol: 74, prog: 0.1098 },
  brazowy: { kolor: 0x765e42, udzial: 0.02, sol: 76 },
};

/** pole ziarna w [0, 1) w punkcie świata (ax, ay): krata i jej drobniejsza kopia (sol + 1) */
function pole(ax: number, ay: number, krata: number, sol: number): number {
  return (vnoise(ax, ay, krata, sol) + 0.3 * vnoise(ax, ay, Math.max(2, krata / 2.2), sol + 1)) / 1.3;
}

/**
 * Kolor 0xRRGGBB stropu w punkcie (ax, ay) świata w pikselach. Kolejność jak w papaKolor: rzadka naklejka w kafelku
 * 32 px (miejsce, rodzaj i obecność z kafelka), szew płyt, ziarno. Ziarno sprawdzane od wierzchniej warstwy, z wyjściem
 * przy pierwszej, która trafia, co daje to samo co malowanie warstw od spodu.
 */
export function stropKolor(s: Strop | null, ax: number, ay: number): number {
  if (s?.img) {
    const cx = ax >> 5;
    const cy = ay >> 5;
    if (h2(cx, cy, 2) < s.gestosc) {
      // przy naklejce na cały kafelek (32 px) zapas room to 1, więc przesunięcie jest zerowe
      const room = 32 - s.naklejka + 1;
      const qx = (ax & 31) - Math.floor(h2(cx, cy, 4) * room);
      const qy = (ay & 31) - Math.floor(h2(cx, cy, 5) * room);
      if (qx >= 0 && qy >= 0 && qx < s.naklejka && qy < s.naklejka) {
        const p = s.img.px[qy * s.img.w + Math.floor(h2(cx, cy, 3) * s.naklejek) * s.naklejka + qx];
        if (p >>> 24) return ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff);
      }
    }
  }
  if (ax % STROP.szwy[0] === 0 || ay % STROP.szwy[1] === 0) return STROP.szwyKolor;
  const { brazowy, ciemny, posredni, kurz } = STROP;
  if (h2(ax, ay, brazowy.sol) < brazowy.udzial) return brazowy.kolor;
  if (pole(ax, ay, ciemny.krata, ciemny.sol) < ciemny.prog) return ciemny.kolor;
  if (pole(ax, ay, posredni.krata, posredni.sol) < posredni.prog) return posredni.kolor;
  if (h2(ax, ay, kurz.sol) < kurz.udzial) return kurz.kolor;
  return STROP.tlo;
}
