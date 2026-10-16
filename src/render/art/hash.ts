/* Szybkie skróty całkowitoliczbowe do deterministycznego szumu w grafice. */

/** liczba z [0, 1) zależna tylko od (x, y, s) */
export function h2(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** gładki szum wartości (dwuliniowy) o oczku cell */
export function vnoise(x: number, y: number, cell: number, s = 0): number {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const a = h2(ix, iy, s);
  const b = h2(ix + 1, iy, s);
  const c = h2(ix, iy + 1, s);
  const d = h2(ix + 1, iy + 1, s);
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
