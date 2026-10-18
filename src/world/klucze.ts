/* Klucze budynków i klatek wspólne dla wszystkich graczy (multiplayer,
   docs/superpowers/specs/2026-10-18-multiplayer-design.md).

   Numer budynku, kafelki i drzwi w świecie zależą od środka mapy (adresu gracza), obrotu siatki i zaokrągleń,
   więc nie nadają się na klucz. Klucz liczymy z obrysu w globalnych pikselach kafelków OpenFreeMap (poziom 14,
   4096 pikseli na kafelek, około 0,35 m): wierzchołki z kafelków są tam liczbami całkowitymi, takimi samymi u każdego
   gracza, który pobrał te kafelki, niezależnie od środka mapy. toGeoT (kafelki) i toGeo (Overpass, wierzchołki
   zaokrąglone do tej samej siatki pikseli) liczą je przed zaokrągleniem geometrii do pół metra i zapisują w tagach:
   - `zm:klucz`: „px:X:Y:DX:DY:S”, gdzie (X, Y) to najwyższy (przy remisie najbardziej zachodni) wierzchołek
     obrysu, (X + DX, Y + DY) najniższy (przy remisie najbardziej wschodni), wszystko w całych pikselach, a S mówi,
     po której stronie cięciwy między nimi leży budynek (1 lewa, 2 prawa, 3 obie). S odróżnia budynki o tych samych
     skrajnych wierzchołkach (dwa trójkąty ze wspólną ścianą po przekątnej). Liczone z całej budowli: ze wszystkich
     jej kawałków z pobranych kafelków, także tych, których gracz nie ma na mapie (daleko od środka albo maleńkie
     przy granicy kafelka).
   - `zm:os`: oś klatek „x1,y1,x2,y2” w globalnych pikselach: dłuższa oś najmniejszego prostokąta opisanego na
     obrysie, przez jego środek, od zachodu na wschód (przy osi dokładnie północ-południe od północy).
   Liczone są tylko dodawaniem, mnożeniem, dzieleniem i pierwiastkiem (dokładne w każdym silniku JS) i zapisywane
   przez toFixed, więc każdy gracz i każda przeglądarka dostają te same napisy. Ten sam budynek z Overpass ma zwykle
   ten sam klucz co z kafelków, ale nie zawsze (kafelki bywają uproszczone o piksel); wtedy zostaje dopasowanie
   po pozycji klatki.

   Klatki: każdy budynek ma max(1, round(długość osi / 20 m)) klatek równej długości wzdłuż osi (20 m jak
   w findEntrances), niezależnie od typu budynku w świecie, bo typ zależy od rastra i u dwóch graczy potrafi wyjść
   inny. Klucz klatki to „klucz budynku/numer” (od 1, od zachodniego końca osi), a jej pozycja to środek jej odcinka
   osi. Drzwi ze świata (Entrance) dostają klucz klatki, w której leży ich rzut na oś, więc te same drzwi w dwóch
   światach o innym środku i innym obrocie siatki mają ten sam klucz, o ile oba światy postawiły w budynku tyle drzwi,
   ile ma klatek. Dziś findEntrances liczy drzwi z prostokąta na siatce, a sklepom, szkołom i halom daje jedne drzwi,
   więc dwoje drzwi może trafić do jednej klatki, a klatka może zostać bez drzwi (do zmiany w etapie 2).
   Budynek bez tagów (demo i zapis sprzed kluczy, osiedle zapasowe) nie ma klucza: null.

   Czyste funkcje bez stanu; nie zmieniają świata ani symulacji. */

import type { Pt } from './geo.ts';
import type { Entrance, World, WorldBuilding } from './world.ts';

/** poziom kafelków, z których liczone są klucze */
export const Z_KLUCZY = 14;
/** pikseli na bok kafelka (extent kafelków OpenFreeMap) */
export const KAFEL_PX = 4096;
/** liczba globalnych pikseli na obwodzie Ziemi na poziomie Z_KLUCZY */
const N_PX = 2 ** Z_KLUCZY * KAFEL_PX;
/** długość klatki wzdłuż bloku w metrach (jak findEntrances w world.ts) */
export const KLATKA_M = 20;
/** metry na stopień długości geograficznej na równiku, jak w geometrii gry (toGeoT, toGeo) */
const M_NA_STOPIEN = 111320;
/** metry na stopień szerokości geograficznej, jak w geometrii gry */
const M_NA_STOPIEN_SZER = 110574;

/** szerokość i długość geograficzna w stopniach */
export type LatLon = readonly [number, number];

/** tagi klucza dopisywane do budynku w geometrii (typ, a nie interfejs: pasuje do Record<string, string>) */
export type TagiKlucza = {
  'zm:klucz': string;
  'zm:os': string;
};

/** klatka budynku: klucz, numer od 1 i środek na osi (lat, lon zaokrąglone do 1e-6°, około 0,1 m) */
export interface Klatka {
  klucz: string;
  budynek: string;
  nr: number;
  lat: number;
  lon: number;
}

/** klucze jednego budynku świata */
export interface KluczeBudynku {
  /** klucz budynku („px:…”) */
  budynek: string;
  /** wszystkie klatki budynku w kolejności wzdłuż osi (dom, sklep i inne mają jedną) */
  klatki: Klatka[];
  /** klucz klatki dla każdego wejścia z b.entrances, w tej samej kolejności */
  wejscia: string[];
}

/** lat, lon → globalne piksele (Merkator, poziom Z_KLUCZY, KAFEL_PX na kafelek) */
export function pikselZ(lat: number, lon: number): Pt {
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * N_PX, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N_PX];
}

/** globalne piksele → [lat, lon] */
export function latLonZ(x: number, y: number): [number, number] {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / N_PX))) * 180) / Math.PI;
  return [lat, (x / N_PX) * 360 - 180];
}

/** metry na globalny piksel na danej szerokości (obwód jak w geometrii gry) */
const metrowNaPiksel = (lat: number) => (M_NA_STOPIEN * 360 * Math.cos((lat * Math.PI) / 180)) / N_PX;

/** liczba do klucza: zawsze całkowita (wierzchołki z kafelków i tak są całkowite, przycięte na brzegu bywają nie) */
const liczba = (v: number) => String(Math.round(v) || 0);

/** otoczka wypukła (łańcuch monotoniczny Andrew), bez powtórzeń i punktów współliniowych */
function otoczka(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Tagi klucza z obrysu w globalnych pikselach (pierścienie budynku i jego sklejonych części). Null, gdy obrys
    jest zdegenerowany (mniej niż trzy punkty niewspółliniowe). */
export function tagiKlucza(pierscienie: readonly (readonly Pt[])[]): TagiKlucza | null {
  let lo: Pt | null = null;
  let hi: Pt | null = null;
  const pts: Pt[] = [];
  for (const r of pierscienie)
    for (const q of r) {
      pts.push([q[0], q[1]]);
      if (!lo || q[1] < lo[1] || (q[1] === lo[1] && q[0] < lo[0])) lo = [q[0], q[1]];
      if (!hi || q[1] > hi[1] || (q[1] === hi[1] && q[0] > hi[0])) hi = [q[0], q[1]];
    }
  if (!lo || !hi) return null;
  // dalej we współrzędnych względem najwyższego wierzchołka: małe liczby, bez utraty dokładności
  const [ox, oy] = lo;
  const hull = otoczka(pts.map(([x, y]) => [x - ox, y - oy]));
  if (hull.length < 3) return null;
  // strony cięciwy od najwyższego do najniższego wierzchołka, po których budynek ma wierzchołki (dalej niż 2 piksele):
  // 1 lewa, 2 prawa, 3 obie. Odróżnia budynki o tych samych skrajnych wierzchołkach (dwa trójkąty ze wspólną ścianą
  // po przekątnej), a piksel różnicy między kafelkami a Overpass go nie zmienia
  const tx = hi[0] - ox;
  const ty = hi[1] - oy;
  const prog = 2 * Math.sqrt(tx * tx + ty * ty);
  let strony = 0;
  for (const [x, y] of hull) {
    const w = tx * y - ty * x;
    if (w > prog) strony |= 1;
    else if (w < -prog) strony |= 2;
  }
  // najmniejszy prostokąt opisany: jeden z boków leży na boku otoczki
  let best: { area: number; ux: number; uy: number; u0: number; u1: number; v0: number; v1: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % hull.length];
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!d) continue;
    const ux = dx / d;
    const uy = dy / d;
    let u0 = Number.POSITIVE_INFINITY;
    let u1 = Number.NEGATIVE_INFINITY;
    let v0 = Number.POSITIVE_INFINITY;
    let v1 = Number.NEGATIVE_INFINITY;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = y * ux - x * uy;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uy, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { ux, uy, u0, u1, v0, v1 } = best;
  // środek prostokąta: u wzdłuż (ux, uy), v wzdłuż (−uy, ux)
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const cx = cu * ux - cv * uy;
  const cy = cu * uy + cv * ux;
  // dłuższy bok wyznacza oś
  const [ex, ey, half] = u1 - u0 >= v1 - v0 ? [ux, uy, (u1 - u0) / 2] : [-uy, ux, (v1 - v0) / 2];
  let a: Pt = [cx - ex * half, cy - ey * half];
  let b: Pt = [cx + ex * half, cy + ey * half];
  if (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1])) [a, b] = [b, a];
  return {
    'zm:klucz': `px:${liczba(ox)}:${liczba(oy)}:${liczba(hi[0] - ox)}:${liczba(hi[1] - oy)}:${strony}`,
    'zm:os': [a[0] + ox, a[1] + oy, b[0] + ox, b[1] + oy].map((v) => v.toFixed(2)).join(','),
  };
}

/** oś klatek z tagu: [x1, y1, x2, y2] w globalnych pikselach albo null */
function osBudynku(tags: Readonly<Record<string, string>>): [number, number, number, number] | null {
  const s = tags['zm:os'];
  if (!s) return null;
  const v = s.split(',').map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  return [v[0], v[1], v[2], v[3]];
}

/** klucz budynku („px:…”) albo null, gdy budynek nie ma tagów klucza */
export function kluczBudynku(b: Pick<WorldBuilding, 'tags'>): string | null {
  return b.tags['zm:klucz'] && osBudynku(b.tags) ? b.tags['zm:klucz'] : null;
}

/** liczba klatek: jedna na każde KLATKA_M metrów osi, co najmniej jedna; 0 bez tagów klucza */
export function liczbaKlatek(b: Pick<WorldBuilding, 'tags'>): number {
  const os = osBudynku(b.tags);
  if (!os || !kluczBudynku(b)) return 0;
  const dx = os[2] - os[0];
  const dy = os[3] - os[1];
  const [lat] = latLonZ((os[0] + os[2]) / 2, (os[1] + os[3]) / 2);
  return Math.max(1, Math.round((Math.sqrt(dx * dx + dy * dy) * metrowNaPiksel(lat)) / KLATKA_M));
}

const do6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** wszystkie klatki budynku wzdłuż osi, od zachodniego końca; pusta lista bez tagów klucza */
export function klatkiBudynku(b: Pick<WorldBuilding, 'tags'>): Klatka[] {
  const budynek = kluczBudynku(b);
  const os = osBudynku(b.tags);
  const n = liczbaKlatek(b);
  if (!budynek || !os || !n) return [];
  const out: Klatka[] = [];
  for (let nr = 1; nr <= n; nr++) {
    const t = (nr - 0.5) / n;
    const [lat, lon] = latLonZ(os[0] + (os[2] - os[0]) * t, os[1] + (os[3] - os[1]) * t);
    out.push({ klucz: `${budynek}/${nr}`, budynek, nr, lat: do6(lat), lon: do6(lon) });
  }
  return out;
}

/** Środek ściany z drzwiami (między kafelkiem drzwi a kafelkiem przed nimi) w globalnych pikselach. srodek to
    punkt adresu, wokół którego zbudowano świat (geo.c); obrót siatki cofamy jak w rotateGeo. */
export function pikselWejscia(w: Pick<World, 'size' | 'angle'>, e: Entrance, srodek: LatLon): Pt {
  const s = w.size;
  const tx = ((e.tile % s) + (e.out % s)) / 2 + 0.5 - s / 2;
  const ty = (Math.floor(e.tile / s) + Math.floor(e.out / s)) / 2 + 0.5 - s / 2;
  const c = Math.cos(w.angle);
  const sn = Math.sin(w.angle);
  const x = tx * c + ty * sn;
  const y = ty * c - tx * sn;
  const [lat0, lon0] = srodek;
  const kx = M_NA_STOPIEN * Math.cos((lat0 * Math.PI) / 180);
  return pikselZ(lat0 - y / M_NA_STOPIEN_SZER, lon0 + x / kx);
}

/** numer klatki (od 1), w której leży punkt w globalnych pikselach: rzut na oś budynku; 0 bez tagów klucza */
export function nrKlatki(b: Pick<WorldBuilding, 'tags'>, p: Pt): number {
  const os = osBudynku(b.tags);
  const n = liczbaKlatek(b);
  if (!os || !n) return 0;
  if (n === 1) return 1;
  const dx = os[2] - os[0];
  const dy = os[3] - os[1];
  const t = ((p[0] - os[0]) * dx + (p[1] - os[1]) * dy) / (dx * dx + dy * dy);
  return Math.min(n - 1, Math.max(0, Math.floor(t * n))) + 1;
}

/** klucz klatki dla wejścia ze świata albo null, gdy budynek nie ma tagów klucza */
export function kluczWejscia(
  w: Pick<World, 'size' | 'angle'>,
  b: Pick<WorldBuilding, 'tags'>,
  e: Entrance,
  srodek: LatLon,
): string | null {
  const budynek = kluczBudynku(b);
  const nr = nrKlatki(b, pikselWejscia(w, e, srodek));
  return budynek && nr ? `${budynek}/${nr}` : null;
}

/** klucze wszystkich budynków świata (indeks jak w w.buildings); null dla budynku bez tagów klucza */
export function kluczeSwiata(w: Pick<World, 'size' | 'angle' | 'buildings'>, srodek: LatLon): (KluczeBudynku | null)[] {
  return w.buildings.map((b) => {
    const budynek = kluczBudynku(b);
    if (!budynek) return null;
    return {
      budynek,
      klatki: klatkiBudynku(b),
      wejscia: b.entrances.map((e) => kluczWejscia(w, b, e, srodek) as string),
    };
  });
}

/** Prostokąt w stopniach (s, w, n, e) obejmujący całą mapę świata z zapasem `zapasM` metrów: do zapytania
    o zajęte klatki. Zapas łapie klatki budynków uciętych brzegiem mapy, których środek leży już poza nią. */
export function prostokatMapy(
  w: Pick<World, 'size' | 'angle'>,
  srodek: LatLon,
  zapasM = 150,
): { s: number; w: number; n: number; e: number } {
  const h = w.size / 2 + zapasM;
  const c = Math.cos(w.angle);
  const sn = Math.sin(w.angle);
  const [lat0, lon0] = srodek;
  const kx = M_NA_STOPIEN * Math.cos((lat0 * Math.PI) / 180);
  const lat: number[] = [];
  const lon: number[] = [];
  for (const [tx, ty] of [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ]) {
    lat.push(lat0 - (ty * c - tx * sn) / M_NA_STOPIEN_SZER);
    lon.push(lon0 + (tx * c + ty * sn) / kx);
  }
  return { s: Math.min(...lat), w: Math.min(...lon), n: Math.max(...lat), e: Math.max(...lon) };
}
