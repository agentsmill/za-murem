/* Znacznik suchego drzewa: gdzie stoi etykieta „Suche drzewo”. Miejsce liczy się raz dla świata i układu
   ekranu, więc etykieta jedzie razem z mapą i nie skacze. Szukam wokół korony (z boku na kilku wysokościach,
   nad koroną i pod pniem z kilkoma przesunięciami, w kilku odległościach od korony) miejsca, pod którym nie
   ma bramy, siatki, rzeczy z podwórka ani budynków; bliżej korony lepiej, a odstęp od niej zaznacza kreska
   od ogonka. Czyste funkcje świata, bez DOM. */

import type { World } from '../world/world.ts';

/** strona korony, po której stoi napis: wschód, zachód, nad koroną, pod pniem */
export type MarkSide = 'e' | 'w' | 'n' | 's';

export interface MarkSpot {
  /** czubek ogonka etykiety (metry) */
  x: number;
  y: number;
  side: MarkSide;
  /** kreska od ogonka w stronę korony (metry; 0: ogonek przy samej koronie) */
  lead: number;
  /** prostokąt napisu w metrach przy przybliżeniu 1 [x0, y0, x1, y1] */
  rect: [number, number, number, number];
  /** co leży pod napisem: brama, siatka, rzeczy, budynki (0: nic) */
  under: number;
  /** ocena do wyboru: to, co pod napisem, i kara za odległość od korony i przesunięcie */
  score: number;
}

/** napis w metrach przy przybliżeniu 1 (ramka z tekstem około 120 × 21 px) i odstęp od ogonka (10 px) */
const LABEL_W = 3.9;
const LABEL_H = 0.7;
const TAIL = 0.3;
/** odstęp ogonka od brzegu korony i zapas wokół napisu */
const GAP = 0.15;
const MARGIN = 0.15;
/** co znaczy kafelek pod napisem: brama i siatka (tam stoi warta), rzeczy z podwórka, budynki */
const COST = { gate: 10, fence: 4, prop: 3, building: 2, outside: 10 };
/** pod pniem stoją ludzie przy ścinaniu, więc to gorsze miejsce */
const SOUTH_EXTRA = 2;
/** odległości ogonka od korony (metry) i kara za metr: bliżej lepiej, ale nie kosztem tego, co pod napisem */
const LEADS = [0, 0.75, 1.5, 2.5, 3.5];
const PER_LEAD = 0.4;
/** przesunięcie wzdłuż korony w ułamkach promienia i kara za nie */
const SLIDES = [0, -0.35, 0.35, -0.7, 0.7];
const PER_SLIDE = 0.3;
const SIDES: readonly MarkSide[] = ['e', 'w', 'n', 's'];

/** wszystkie miejsca wokół korony z oceną; przy remisie wygrywa wcześniejsze (bliżej, bez przesunięcia,
    potem wschód, zachód, nad, pod) */
export function markSpots(w: World): MarkSpot[] {
  if (w.dryTree < 0) return [];
  const t = w.trees[w.dryTree];
  // korona jak w grafice suchego drzewa: koło o promieniu r (gałęzie do 0,96 r) nad pniem o lift
  const lift = t.kind === 2 ? 0.3 : 1.2;
  const r = (Math.round(t.r * 4) / 4) * 0.96;
  const cx = t.x;
  const cy = t.y - lift;
  const out: MarkSpot[] = [];
  for (const lead of LEADS)
    for (const slide of SLIDES)
      for (const side of SIDES) {
        let x: number;
        let y: number;
        let rect: MarkSpot['rect'];
        if (side === 'e' || side === 'w') {
          const k = side === 'e' ? 1 : -1;
          x = cx + k * (r + GAP + lead);
          y = cy + slide * r;
          const near = x + k * TAIL;
          const far = near + k * LABEL_W;
          rect = [Math.min(near, far), y - LABEL_H / 2, Math.max(near, far), y + LABEL_H / 2];
        } else if (side === 'n') {
          x = cx + slide * r;
          y = cy - r - GAP - lead;
          rect = [x - LABEL_W / 2, y - TAIL - LABEL_H, x + LABEL_W / 2, y - TAIL];
        } else {
          x = t.x + slide * r;
          y = t.y + 0.5 + lead;
          rect = [x - LABEL_W / 2, y + TAIL, x + LABEL_W / 2, y + TAIL + LABEL_H];
        }
        const u = under(w, rect);
        const score = u + (side === 's' ? SOUTH_EXTRA : 0) + PER_LEAD * lead + PER_SLIDE * Math.abs(slide);
        out.push({ x, y, side, lead, rect, under: u, score });
      }
  return out;
}

/** najlepsze miejsce na etykietę spośród stron sides (domyślnie wszystkich; na wąskim ekranie tylko nad
    i pod, bo z boku napis z koroną nie mieści się w szerokości telefonu) albo null bez suchego drzewa */
export function markSpot(w: World, sides: readonly MarkSide[] = SIDES): MarkSpot | null {
  const all = markSpots(w).filter((s) => sides.includes(s.side));
  return all.length ? all.reduce((a, b) => (b.score < a.score ? b : a)) : null;
}

/** środek korony suchego drzewa (metry), w niego celuje strzałka przy krawędzi ekranu */
export function crownOf(w: World): { x: number; y: number } | null {
  if (w.dryTree < 0) return null;
  const t = w.trees[w.dryTree];
  return { x: t.x, y: t.y - (t.kind === 2 ? 0.3 : 1.2) };
}

/** co leży pod prostokątem: każdy kafelek, którego dotyka prostokąt z zapasem; bramę, siatkę i rzeczy także
    kafelek niżej, bo kto tam stoi (warta przy bramie) albo co tam stoi, sięga w górę w ten wiersz */
export function under(w: World, [x0, y0, x1, y1]: readonly [number, number, number, number]): number {
  const g = w.fence.gate;
  const fence = new Set(w.fence.tiles);
  let sum = 0;
  for (let y = Math.floor(y0 - MARGIN); y <= Math.floor(y1 + MARGIN); y++)
    for (let x = Math.floor(x0 - MARGIN); x <= Math.floor(x1 + MARGIN); x++) {
      if (x < 0 || y < 0 || x >= w.size || y >= w.size) {
        sum += COST.outside;
        continue;
      }
      for (const yy of [y, y + 1]) {
        if (yy >= w.size) continue;
        if (x >= g.x && x < g.x + g.w && yy >= g.y && yy < g.y + g.h) sum += COST.gate;
        else if (fence.has(yy * w.size + x)) sum += COST.fence;
        if (w.props.some((p) => x >= p.x && x < p.x + p.w && yy >= p.y && yy < p.y + p.h)) sum += COST.prop;
      }
      if (w.bid[y * w.size + x] >= 0) sum += COST.building;
    }
  return sum;
}
