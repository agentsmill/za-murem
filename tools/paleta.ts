/* Dociąganie obrazów do palety gry (assets/palette.json), tak jak robi to reduce_colors z PixelLab: każdy kolor idzie
   na najbliższy kolor palety, bez ditheringu, a przezroczyste piksele zostają. Odległość liczona w OKLab z wagą
   jasności 0,25 (PixelLab nie podaje swojej metryki, ta odtwarza jego wybór co do piksela: test porównuje 192
   statyczne obrazy postaci z assets/raw/<postać>/paleta, a przy dobieraniu wagi także klatki animacji). Dzięki temu
   animacje nie wymagają osobnego wywołania PixelLab na każdą paczkę klatek. */

/** waga jasności (L) wobec barwy (a, b) w odległości OKLab */
export const WAGA_JASNOSCI = 0.25;

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** kolor sRGB (0 do 255) w OKLab */
function oklab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Obraz RGBA (4 bajty na piksel) po dociągnięciu do palety (kolory #rrggbb). Zwraca nową tablicę, wejście zostaje.
 * Piksele z alfą 0 nie zmieniają się, widoczne dostają kolor palety o tej samej alfie.
 */
export function dociagnijDoPalety(rgba: Uint8Array, paleta: readonly string[]): Uint8Array {
  const rgb = paleta.map((c) => {
    const n = Number.parseInt(c.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  });
  const lab = rgb.map(([r, g, b]) => oklab(r, g, b));
  const pamiec = new Map<number, number>();
  const najblizszy = (r: number, g: number, b: number): number => {
    const klucz = (r << 16) | (g << 8) | b;
    const znany = pamiec.get(klucz);
    if (znany !== undefined) return znany;
    const [L, A, B] = oklab(r, g, b);
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let k = 0; k < lab.length; k++) {
      const d = WAGA_JASNOSCI * (L - lab[k][0]) ** 2 + (A - lab[k][1]) ** 2 + (B - lab[k][2]) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    pamiec.set(klucz, best);
    return best;
  };
  const out = Uint8Array.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (!out[i + 3]) continue;
    const [r, g, b] = rgb[najblizszy(out[i], out[i + 1], out[i + 2])];
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}
