/* Rasteryzacja geometrii na siatkę kafelków 1 m. Siatka ma size×size kafelków, punkt adresu
   (0, 0) leży w jej środku, kafelek (i, j) ma środek w metrach (i − size/2 + ½, j − size/2 + ½).
   Okno można przesunąć o (ox, oy) metrów (domyślnie 0): kafelek (i, j) ma wtedy środek w metrach
   (i − size/2 + ½ + ox, j − size/2 + ½ + oy). Tak rastruje się kwadraty miasta obok domu (src/world/kwadraty.ts):
   kwadrat (sx, sy) to okno przesunięte o (sx·size, sy·size) na tej samej geometrii. Bez przesunięcia wyniki są co do
   bitu takie same jak przed jego dodaniem (świat domu). */

import type { Pt } from './geo.ts';

/** wypełnia pierścień regułą parzystości: kafelki, których środek leży w środku (okno przesunięte o ox, oy) */
export function fillRing(ring: readonly Pt[], size: number, cb: (i: number) => void, ox = 0, oy = 0): void {
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
  const j0 = Math.max(0, Math.ceil(miny - oy + half - 0.5));
  const j1 = Math.min(size - 1, Math.floor(maxy - oy + half - 0.5));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const yc = j - half + 0.5 + oy;
    xs.length = 0;
    for (let k = 0; k < m; k++) {
      const [x1, y1] = ring[k];
      const [x2, y2] = ring[(k + 1) % m];
      if (y1 > yc !== y2 > yc) xs.push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // kafelki ze środkiem w przedziale [xa, xb)
      const i0 = Math.max(0, Math.ceil(xs[k] - ox + half - 0.5));
      const i1 = Math.min(size - 1, Math.ceil(xs[k + 1] - ox + half - 0.5) - 1);
      for (let i = i0; i <= i1; i++) cb(j * size + i);
    }
  }
}

/** pas o szerokości width wzdłuż odcinka a–b (z zaokrąglonymi końcami; okno przesunięte o ox, oy) */
export function stampSegment(a: Pt, b: Pt, width: number, size: number, cb: (i: number) => void, ox = 0, oy = 0): void {
  const half = size / 2;
  const r = width / 2;
  const i0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r + half - ox));
  const i1 = Math.min(size - 1, Math.floor(Math.max(a[0], b[0]) + r + half - ox));
  const j0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r + half - oy));
  const j1 = Math.min(size - 1, Math.floor(Math.max(a[1], b[1]) + r + half - oy));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) {
    const cy = j - half + 0.5 + oy;
    for (let i = i0; i <= i1; i++) {
      const cx = i - half + 0.5 + ox;
      let t = L2 ? ((cx - a[0]) * dx + (cy - a[1]) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a[0] + t * dx - cx;
      const py = a[1] + t * dy - cy;
      if (px * px + py * py <= r2) cb(j * size + i);
    }
  }
}

export function stampLine(
  line: readonly Pt[],
  width: number,
  size: number,
  cb: (i: number) => void,
  ox = 0,
  oy = 0,
): void {
  for (let k = 0; k + 1 < line.length; k++) stampSegment(line[k], line[k + 1], width, size, cb, ox, oy);
}
