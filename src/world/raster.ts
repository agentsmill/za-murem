/* Rasteryzacja geometrii na siatkę kafelków 1 m. Siatka ma size×size kafelków, punkt adresu
   (0, 0) leży w jej środku, kafelek (i, j) ma środek w metrach (i − size/2 + ½, j − size/2 + ½). */

import type { Pt } from './geo.ts';

/** wypełnia pierścień regułą parzystości: kafelki, których środek leży w środku */
export function fillRing(ring: readonly Pt[], size: number, cb: (i: number) => void): void {
  const n = ring.length;
  if (n < 3) return;
  const closed = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
  const m = closed ? n - 1 : n;
  const half = size / 2;
  let miny = Number.POSITIVE_INFINITY;
  let maxy = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < m; k++) {
    const y = ring[k][1];
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  const j0 = Math.max(0, Math.ceil(miny + half - 0.5));
  const j1 = Math.min(size - 1, Math.floor(maxy + half - 0.5));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const yc = j - half + 0.5;
    xs.length = 0;
    for (let k = 0; k < m; k++) {
      const [x1, y1] = ring[k];
      const [x2, y2] = ring[(k + 1) % m];
      if (y1 > yc !== y2 > yc) xs.push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // kafelki ze środkiem w przedziale [xa, xb)
      const i0 = Math.max(0, Math.ceil(xs[k] + half - 0.5));
      const i1 = Math.min(size - 1, Math.ceil(xs[k + 1] + half - 0.5) - 1);
      for (let i = i0; i <= i1; i++) cb(j * size + i);
    }
  }
}

/** pas o szerokości width wzdłuż odcinka a–b (z zaokrąglonymi końcami) */
export function stampSegment(a: Pt, b: Pt, width: number, size: number, cb: (i: number) => void): void {
  const half = size / 2;
  const r = width / 2;
  const i0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r + half));
  const i1 = Math.min(size - 1, Math.floor(Math.max(a[0], b[0]) + r + half));
  const j0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r + half));
  const j1 = Math.min(size - 1, Math.floor(Math.max(a[1], b[1]) + r + half));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) {
    const cy = j - half + 0.5;
    for (let i = i0; i <= i1; i++) {
      const cx = i - half + 0.5;
      let t = L2 ? ((cx - a[0]) * dx + (cy - a[1]) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a[0] + t * dx - cx;
      const py = a[1] + t * dy - cy;
      if (px * px + py * py <= r2) cb(j * size + i);
    }
  }
}

export function stampLine(line: readonly Pt[], width: number, size: number, cb: (i: number) => void): void {
  for (let k = 0; k + 1 < line.length; k++) stampSegment(line[k], line[k + 1], width, size, cb);
}
