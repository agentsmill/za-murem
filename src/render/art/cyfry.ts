/* Cyfry z pikseli do liczb nad mapą rysowanych kodem (pierwszy: procent na duchu planu wspólnego płotu, plotLayer.ts):
   znak 3×5 pikseli, przerwa 1 piksel. Czyste dane i funkcja bez PixiJS: piksele do zamalowania, rysuje je warstwa. */

/** szerokość i wysokość znaku w pikselach */
export const GLIF_W = 3;
export const GLIF_H = 5;

/** znaki: pięć wierszy po trzy piksele od góry (1: zamalowany) */
const GLIFY: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '%': ['101', '001', '010', '100', '101'],
};

/** napis pikselami: szerokość, wysokość i piksele [x, y] od lewego górnego rogu; nieznany znak to odstęp */
export function napisPikselami(s: string): { w: number; h: number; px: [number, number][] } {
  const znaki = [...s];
  const px: [number, number][] = [];
  znaki.forEach((c, k) => {
    const g = GLIFY[c];
    if (!g) return;
    for (let y = 0; y < GLIF_H; y++)
      for (let x = 0; x < GLIF_W; x++) if (g[y][x] === '1') px.push([k * (GLIF_W + 1) + x, y]);
  });
  return { w: znaki.length ? znaki.length * (GLIF_W + 1) - 1 : 0, h: GLIF_H, px };
}
