/* Geometria obrysów budynków dla generatora mieszkańców: pole, środek, najmniejszy obrócony prostokąt i bliskość
   dwóch obrysów. Tylko `+ - * /`, pierwiastek (`Math.sqrt` jest zaokrąglany poprawnie w każdym silniku), porównania
   i `Math.round/min/max`, bez trygonometrii, więc wynik jest taki sam w każdej przeglądarce i w Node.
   Obrys budynku to lista pierścieni: zewnętrzny `p` i części `pp` (budynek przecięty granicą kafelków); każdy jest
   zamknięty, a razem tworzą sumę (części nie są dziurami), jak w src/world/world.ts. */

import { type GeoBuilding, type Pt, pip, polyArea } from '../world/geo.ts';

export type Pierscienie = readonly (readonly Pt[])[];

export interface Ramka {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const pierscienieBudynku = (b: GeoBuilding): Pierscienie => (b.pp ? [b.p, ...b.pp] : [b.p]);

/** Suma pól pierścieni (każde bez znaku, jak `polyArea`). */
export function pole(p: Pierscienie): number {
  let suma = 0;
  for (const r of p) suma += polyArea(r);
  return suma;
}

export function ramka(p: Pierscienie): Ramka {
  const wynik = {
    x0: Number.POSITIVE_INFINITY,
    y0: Number.POSITIVE_INFINITY,
    x1: Number.NEGATIVE_INFINITY,
    y1: Number.NEGATIVE_INFINITY,
  };
  for (const r of p) {
    for (const [x, y] of r) {
      wynik.x0 = Math.min(wynik.x0, x);
      wynik.y0 = Math.min(wynik.y0, y);
      wynik.x1 = Math.max(wynik.x1, x);
      wynik.y1 = Math.max(wynik.y1, y);
    }
  }
  return wynik;
}

/** Czy ramki zachodzą na siebie po rozszerzeniu pierwszej o `zapas`. */
export const ramkiBlisko = (a: Ramka, b: Ramka, zapas: number): boolean =>
  a.x0 - zapas < b.x1 && b.x0 - zapas < a.x1 && a.y0 - zapas < b.y1 && b.y0 - zapas < a.y1;

/** Środek ciężkości obrysu: środki pierścieni ważone ich polem. Liczone względem pierwszego wierzchołka każdego
    pierścienia, żeby duże współrzędne nie gubiły cyfr. Obrys bez pola (zdegenerowany) daje średnią wierzchołków. */
export function srodek(p: Pierscienie): Pt {
  let wagi = 0;
  let sx = 0;
  let sy = 0;
  for (const r of p) {
    if (r.length === 0) continue;
    const [x0, y0] = r[0];
    let a2 = 0; // podwojone pole ze znakiem
    let mx = 0;
    let my = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xj = r[j][0] - x0;
      const yj = r[j][1] - y0;
      const xi = r[i][0] - x0;
      const yi = r[i][1] - y0;
      const c = xj * yi - xi * yj;
      a2 += c;
      mx += (xj + xi) * c;
      my += (yj + yi) * c;
    }
    if (a2 === 0) continue;
    const w = a2 < 0 ? -a2 : a2;
    wagi += w;
    sx += w * (x0 + mx / (3 * a2));
    sy += w * (y0 + my / (3 * a2));
  }
  if (wagi > 0) return [sx / wagi, sy / wagi];
  let n = 0;
  let mx = 0;
  let my = 0;
  for (const r of p) {
    for (const [x, y] of r) {
      mx += x;
      my += y;
      n++;
    }
  }
  return n > 0 ? [mx / n, my / n] : [0, 0];
}

/** Otoczka wypukła (łańcuch monotoniczny Andrew), przeciwnie do ruchu wskazówek zegara, bez powtórzeń. */
function otoczka(punkty: readonly Pt[]): Pt[] {
  const posortowane = [...punkty].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const u: Pt[] = [];
  for (const q of posortowane) {
    const o = u[u.length - 1];
    if (!o || o[0] !== q[0] || o[1] !== q[1]) u.push(q);
  }
  if (u.length < 3) return u;
  const iloczyn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const dol: Pt[] = [];
  for (const q of u) {
    while (dol.length >= 2 && iloczyn(dol[dol.length - 2], dol[dol.length - 1], q) <= 0) dol.pop();
    dol.push(q);
  }
  const gora: Pt[] = [];
  for (let i = u.length - 1; i >= 0; i--) {
    const q = u[i];
    while (gora.length >= 2 && iloczyn(gora[gora.length - 2], gora[gora.length - 1], q) <= 0) gora.pop();
    gora.push(q);
  }
  dol.pop();
  gora.pop();
  return dol.concat(gora);
}

const dziesiate = (v: number): number => Math.round(v * 10) / 10;

/** Szerokość i długość obrysu (w metrach, do 0,1) z prostokąta o najmniejszym polu, którego bok leży wzdłuż
    krawędzi otoczki. Najmniejszy prostokąt zawsze ma bok wzdłuż jakiejś krawędzi otoczki, więc wystarczy sprawdzić
    kierunki jej krawędzi; liczymy je z wektorów i iloczynów skalarnych, bez kątów. Szerokość to krótszy bok. */
export function najmniejszyProstokat(p: Pierscienie): { szerokosc: number; dlugosc: number } {
  const h = otoczka(p.flat());
  if (h.length < 3) {
    if (h.length < 2) return { szerokosc: 0, dlugosc: 0 };
    const dx = h[1][0] - h[0][0];
    const dy = h[1][1] - h[0][1];
    return { szerokosc: 0, dlugosc: dziesiate(Math.sqrt(dx * dx + dy * dy)) };
  }
  let najmniejsze = Number.POSITIVE_INFINITY;
  let krotszy = 0;
  let dluzszy = 0;
  for (let i = 0; i < h.length; i++) {
    const dx = h[(i + 1) % h.length][0] - h[i][0];
    const dy = h[(i + 1) % h.length][1] - h[i][1];
    const dl = Math.sqrt(dx * dx + dy * dy);
    if (dl < 1e-9) continue;
    const ux = dx / dl;
    const uy = dy / dl;
    let a0 = Number.POSITIVE_INFINITY;
    let a1 = Number.NEGATIVE_INFINITY;
    let b0 = Number.POSITIVE_INFINITY;
    let b1 = Number.NEGATIVE_INFINITY;
    for (const [x, y] of h) {
      const a = x * ux + y * uy; // składowa wzdłuż krawędzi
      const b = y * ux - x * uy; // składowa prostopadła
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      b0 = Math.min(b0, b);
      b1 = Math.max(b1, b);
    }
    const w = a1 - a0;
    const d = b1 - b0;
    if (w * d < najmniejsze) {
      najmniejsze = w * d;
      krotszy = Math.min(w, d);
      dluzszy = Math.max(w, d);
    }
  }
  return { szerokosc: dziesiate(krotszy), dlugosc: dziesiate(dluzszy) };
}

/** Czy punkt leży w którymkolwiek pierścieniu (suma pierścieni). */
export const wObrysie = (x: number, y: number, p: Pierscienie): boolean => p.some((r) => pip(x, y, r));

/** Kwadrat odległości punktu od odcinka (ax, ay)–(bx, by). */
function punktOdcinekKw(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** Kwadrat odległości punktu od najbliższej krawędzi obrysu (0 nie znaczy „w środku”, tylko „na krawędzi”). */
export function odlegloscPunktuKw(x: number, y: number, p: Pierscienie): number {
  let najmniej = Number.POSITIVE_INFINITY;
  for (const r of p) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      najmniej = Math.min(najmniej, punktOdcinekKw(x, y, r[j][0], r[j][1], r[i][0], r[i][1]));
    }
  }
  return najmniej;
}

/** Kwadrat odległości dwóch odcinków: 0, gdy się przecinają, inaczej najmniejsza z czterech odległości końców. */
function odcinkiKw(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const kier = (o: Pt, p: Pt, q: Pt) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (kier(a, b, c) * kier(a, b, d) < 0 && kier(c, d, a) * kier(c, d, b) < 0) return 0;
  return Math.min(
    punktOdcinekKw(a[0], a[1], c[0], c[1], d[0], d[1]),
    punktOdcinekKw(b[0], b[1], c[0], c[1], d[0], d[1]),
    punktOdcinekKw(c[0], c[1], a[0], a[1], b[0], b[1]),
    punktOdcinekKw(d[0], d[1], a[0], a[1], b[0], b[1]),
  );
}

/** Czy dwa obrysy są bliżej niż `d` metrów od siebie: wspólna krawędź, dotknięcie, nałożenie i obrys w obrysie
    liczą się jako odległość 0. Ramki mają już być sprawdzone przez wywołującego (`ramkiBlisko`). */
export function blizejNiz(a: Pierscienie, b: Pierscienie, d: number): boolean {
  for (const r of a) if (r.length > 0 && wObrysie(r[0][0], r[0][1], b)) return true;
  for (const r of b) if (r.length > 0 && wObrysie(r[0][0], r[0][1], a)) return true;
  const prog = d * d;
  for (const r of a) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      for (const s of b) {
        for (let m = 0, n = s.length - 1; m < s.length; n = m++) {
          if (odcinkiKw(r[j], r[i], s[n], s[m]) < prog) return true;
        }
      }
    }
  }
  return false;
}
