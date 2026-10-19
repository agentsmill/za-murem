/* Obrót mapy tak, żeby dominujący kierunek ścian bloków leżał wzdłuż osi siatki.
   Histogram kątów krawędzi obrysów (modulo 90°, waga = długość krawędzi), szczyt histogramu
   wyznacza kierunek. Wybieramy obrót najbliższy północy, czyli najwyżej o 45°.
   Prostowanie budynków (straighten) ma też wariant dla kwadratów obok domu (straightenZDomem): dom wygrywa na szwie. */

import type { Geo, GeoBuilding, Pt } from './geo.ts';

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

/** parametry prostowania jednego budynku: obrót o −d wokół punktu (cx, cy) */
export interface Prostowanie {
  d: number;
  cx: number;
  cy: number;
}

/** Decyzja o prostowaniu budynku z jego pierścieni (zewnętrznego i części): obrót o −d wokół środka wierzchołków, jeśli
    żaden punkt obrysu nie przesunie się o więcej niż tol metrów, a kąt nie przekracza maxDeg (smallMaxDeg dla budynków
    o promieniu do 12 m). Mały dom można obrócić mocniej, długi blok tylko trochę. Null: budynek zostaje, jak jest. */
export function parametryProstowania(
  rings: readonly (readonly Pt[])[],
  tol = 3.5,
  maxDeg = 8,
  smallMaxDeg = 20,
): Prostowanie | null {
  const d = buildingTilt(rings as Pt[][], (22 * Math.PI) / 180);
  if (d === null || Math.abs(d) < 1e-4) return null;
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
  if (Math.abs(d) > lim || 2 * far * Math.sin(Math.abs(d) / 2) > tol) return null;
  return { d, cx, cy };
}

/** obrót punktu zgodnie z parametrami prostowania: −d wokół (cx, cy) */
function obrotProstowania(pr: Prostowanie): (p: Pt) => Pt {
  const c = Math.cos(-pr.d);
  const s = Math.sin(-pr.d);
  return ([x, y]) => {
    const [qx, qy] = rot([x - pr.cx, y - pr.cy], c, s);
    return [qx + pr.cx, qy + pr.cy];
  };
}

/** Obraca wszystkie pierścienie budynku zgodnie z parametrami prostowania. */
export function zastosujProstowanie(b: GeoBuilding, pr: Prostowanie): GeoBuilding {
  const R = obrotProstowania(pr);
  return { ...b, p: b.p.map(R), ...(b.pp ? { pp: b.pp.map((q) => q.map(R)) } : {}) };
}

/** Prostuje budynki prawie równoległe do siatki (parametryProstowania). */
export function straighten(geo: Geo, tol = 3.5, maxDeg = 8, smallMaxDeg = 20): Geo {
  return {
    ...geo,
    b: geo.b.map((b) => {
      const pr = parametryProstowania([b.p, ...(b.pp || [])], tol, maxDeg, smallMaxDeg);
      return pr ? zastosujProstowanie(b, pr) : b;
    }),
  };
}

/** Prostowanie kwadratu obok domu z regułą „dom wygrywa na szwie” (projekt miasta z kwadratów). Świat domu się nie
    zmienia, więc sąsiad ma się do niego dopasować. Kawałek budynku (pierścień po obrocie, ta sama współrzędna co w geo
    domu), który jest też w geo domu, dostaje dokładnie ten obrót, który wyszedł w domu z jego budynku (kąt i środek z
    kawałków, jakie dom ma; dom decyduje też, czy prostować w ogóle). Dzięki temu część budynku w domu jest u sąsiada
    bit w bit taka sama. Kawałki, których dom nie ma (daleko od jego środka albo maleńkie), dostają ten sam obrót jak
    jedna bryła, ale tylko gdy żaden ich wierzchołek nie rusza się o więcej niż tol metrów, tak jak zwykłe prostowanie:
    dom prostuje swoją część, więc koniec bardzo długiego bloku wokół jej środka przesunąłby się o wiele metrów, a tak
    zostaje na miejscu i pęknięcie na styku kawałków jest mniejsze niż tol. Gdy kawałki budynku należą do kilku różnych
    budynków domu, każdy dostaje obrót swojego, a kawałki bez odpowiednika zostają. Budynek bez kawałków w domu
    prostuje się jak zwykle, z całej budowli, więc dwa sąsiednie kwadraty bez domu obracają go tak samo. Obie geo mają
    być już obrócone kątem układu domu (rotateGeo), ale jeszcze nie wyprostowane. */
export function straightenZDomem(geo: Geo, dom: Geo, tol = 3.5, maxDeg = 8, smallMaxDeg = 20): Geo {
  const wDomu = new Map<string, GeoBuilding>();
  for (const b of dom.b) for (const ring of [b.p, ...(b.pp || [])]) wDomu.set(JSON.stringify(ring), b);
  const paramyDomu = new Map<GeoBuilding, Prostowanie | null>();
  const paramy = (h: GeoBuilding): Prostowanie | null => {
    let pr = paramyDomu.get(h);
    if (pr === undefined) {
      pr = parametryProstowania([h.p, ...(h.pp || [])], tol, maxDeg, smallMaxDeg);
      paramyDomu.set(h, pr);
    }
    return pr;
  };
  // pierścień rusza się o nie więcej niż tol metrów
  const wTolerancji = (ring: readonly Pt[], R: (p: Pt) => Pt) =>
    ring.every((q) => {
      const r = R(q);
      return Math.sqrt((r[0] - q[0]) * (r[0] - q[0]) + (r[1] - q[1]) * (r[1] - q[1])) <= tol;
    });
  return {
    ...geo,
    b: geo.b.map((b) => {
      const pierscienie = [b.p, ...(b.pp || [])];
      const domowe = pierscienie.map((ring) => wDomu.get(JSON.stringify(ring)));
      const rozne = new Set(domowe.filter((h): h is GeoBuilding => !!h));
      if (!rozne.size) {
        const pr = parametryProstowania(pierscienie, tol, maxDeg, smallMaxDeg);
        return pr ? zastosujProstowanie(b, pr) : b;
      }
      // kawałki bez odpowiednika w domu: obrót jedynego budynku domu, do którego należą pozostałe kawałki (przy kilku nie
      // wiadomo którego, więc zostają)
      const wzor = rozne.size === 1 ? paramy([...rozne][0]) : null;
      const nowe = pierscienie.map((ring, k) => {
        const h = domowe[k];
        const pr = h ? paramy(h) : wzor;
        if (!pr) return ring;
        const R = obrotProstowania(pr);
        return h || wTolerancji(ring, R) ? ring.map(R) : ring;
      });
      return { ...b, p: nowe[0], ...(b.pp ? { pp: nowe.slice(1) } : {}) };
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
    ...(geo.rodzaje
      ? {
          rodzaje: geo.rodzaje.map((p) => {
            const [x, y] = R([p.x, p.y]);
            return { ...p, x, y };
          }),
        }
      : {}),
  };
}
