/* Obrót mapy tak, żeby dominujący kierunek ścian bloków leżał wzdłuż osi siatki.
   Histogram kątów krawędzi obrysów (modulo 90°, waga = długość krawędzi), szczyt histogramu
   wyznacza kierunek. Wybieramy obrót najbliższy północy, czyli najwyżej o 45°. */

import type { Geo, Pt } from './geo.ts';

const BINS = 180; // 0,5° na przedział w zakresie 0–90°
const QUARTER = Math.PI / 2;

/** kąt obrotu (radiany, od −π/4 do π/4), który ustawia ściany budynków wzdłuż osi;
    brane są budynki, które mają choć jeden punkt w kwadracie o połowie boku R */
export function dominantAngle(geo: Geo, R: number): number {
  const hist = new Float64Array(BINS);
  let total = 0;
  for (const b of geo.b) {
    if (!b.p.some(([x, y]) => Math.abs(x) <= R && Math.abs(y) <= R)) continue;
    for (const ring of [b.p, ...(b.pp || [])]) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const dx = ring[i + 1][0] - ring[i][0];
        const dy = ring[i + 1][1] - ring[i][1];
        const len = Math.hypot(dx, dy);
        if (len < 2) continue;
        let a = Math.atan2(dy, dx) % QUARTER;
        if (a < 0) a += QUARTER;
        hist[Math.min(BINS - 1, Math.floor((a / QUARTER) * BINS))] += len;
        total += len;
      }
    }
  }
  if (total < 40) return 0;
  // wygładzenie po okręgu (trójkąt ±2 przedziały)
  const sm = new Float64Array(BINS);
  for (let i = 0; i < BINS; i++) for (let k = -2; k <= 2; k++) sm[i] += hist[(i + k + BINS) % BINS] * (3 - Math.abs(k));
  let peak = 0;
  for (let i = 1; i < BINS; i++) if (sm[i] > sm[peak]) peak = i;
  // dokładniej: średnia ważona w oknie ±3° wokół szczytu (po okręgu)
  let sw = 0;
  let sa = 0;
  for (let k = -6; k <= 6; k++) {
    const i = (peak + k + BINS) % BINS;
    sw += hist[i];
    sa += hist[i] * (peak + k + 0.5);
  }
  const theta = ((sa / sw / BINS) * QUARTER + QUARTER) % QUARTER;
  let phi = -theta;
  if (phi < -Math.PI / 4) phi += QUARTER;
  return phi;
}

const rot = (p: Pt, c: number, s: number): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

/** odchylenie (radiany) ścian jednego budynku od osi siatki: średnia ważona długością
    z krawędzi odchylonych najwyżej o maxDev; null, jeśli takie krawędzie to mniej niż połowa obwodu */
export function buildingTilt(rings: Pt[][], maxDev = (10 * Math.PI) / 180): number | null {
  let sw = 0;
  let sd = 0;
  let per = 0;
  for (const ring of rings)
    for (let i = 0; i + 1 < ring.length; i++) {
      const dx = ring[i + 1][0] - ring[i][0];
      const dy = ring[i + 1][1] - ring[i][1];
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      per += len;
      let a = Math.atan2(dy, dx) % QUARTER;
      if (a > Math.PI / 4) a -= QUARTER;
      if (a <= -Math.PI / 4) a += QUARTER;
      if (Math.abs(a) > maxDev) continue;
      sw += len;
      sd += len * a;
    }
  if (!sw || sw < per / 2) return null;
  return sd / sw;
}

/** Prostuje budynki prawie równoległe do siatki: obrót wokół środka budynku, jeśli żaden
    punkt obrysu nie przesunie się o więcej niż tol metrów, a kąt nie przekracza maxDeg
    (smallMaxDeg dla budynków o promieniu do 12 m). Mały dom można obrócić mocniej, długi blok tylko trochę. */
export function straighten(geo: Geo, tol = 3.5, maxDeg = 8, smallMaxDeg = 20): Geo {
  return {
    ...geo,
    b: geo.b.map((b) => {
      const rings = [b.p, ...(b.pp || [])];
      const d = buildingTilt(rings, (22 * Math.PI) / 180);
      if (d === null || Math.abs(d) < 1e-4) return b;
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const ring of rings)
        for (const [x, y] of ring) {
          cx += x;
          cy += y;
          n++;
        }
      cx /= n;
      cy /= n;
      let far = 0;
      for (const ring of rings) for (const [x, y] of ring) far = Math.max(far, Math.hypot(x - cx, y - cy));
      // małe budynki (domy, garaże) można obrócić mocniej niż bloki
      const lim = ((far <= 12 ? smallMaxDeg : maxDeg) * Math.PI) / 180;
      // przesunięcie punktu przy obrocie o d: 2·r·sin(d/2)
      if (Math.abs(d) > lim || 2 * far * Math.sin(Math.abs(d) / 2) > tol) return b;
      const c = Math.cos(-d);
      const s = Math.sin(-d);
      const R = ([x, y]: Pt): Pt => {
        const [qx, qy] = rot([x - cx, y - cy], c, s);
        return [qx + cx, qy + cy];
      };
      return { ...b, p: b.p.map(R), ...(b.pp ? { pp: b.pp.map((q) => q.map(R)) } : {}) };
    }),
  };
}

/** obraca całą geometrię wokół punktu adresu (0, 0) */
export function rotateGeo(geo: Geo, phi: number): Geo {
  if (!phi) return geo;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const R = (p: Pt) => rot(p, c, s);
  return {
    ...geo,
    b: geo.b.map((b) => ({ ...b, p: b.p.map(R), ...(b.pp ? { pp: b.pp.map((q) => q.map(R)) } : {}) })),
    r: geo.r.map((r) => ({ ...r, l: r.l.map(R) })),
    ...(geo.pass ? { pass: geo.pass.map((r) => ({ ...r, l: r.l.map(R) })) } : {}),
    a: geo.a.map((a) => ({ ...a, p: a.p.map(R) })),
    w: geo.w.map((w) => ({ ...w, l: w.l.map(R) })),
    poi: geo.poi.map((p) => {
      const [x, y] = R([p.x, p.y]);
      return { ...p, x, y };
    }),
  };
}
