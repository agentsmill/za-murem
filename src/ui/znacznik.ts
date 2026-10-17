/* Znacznik suchego drzewa: z której strony korony stoi etykieta „Suche drzewo”. Strona liczy się raz dla
   świata, więc etykieta jedzie razem z mapą i nie skacze: ta, pod którą nie ma bramy, siatki, rzeczy
   z podwórka ani budynków (na Przymorzu nad koroną jest brama, na Zielonkach siatka). Czyste funkcje
   świata, bez DOM. */

import type { World } from '../world/world.ts';

/** strona korony: wschód, zachód, nad koroną, pod pniem */
export type MarkSide = 'e' | 'w' | 'n' | 's';

export interface MarkSpot {
  /** punkt, w który celuje ogonek etykiety (metry) */
  x: number;
  y: number;
  side: MarkSide;
  /** prostokąt etykiety w metrach przy przybliżeniu 0,9 [x0, y0, x1, y1] i co pod nim leży (0: nic) */
  rect: [number, number, number, number];
  score: number;
}

/** etykieta w metrach przy przybliżeniu 0,9 (napis z ramką i ogonkiem około 125 × 25 px), z zapasem */
const LABEL_W = 4.4;
const LABEL_H = 0.8;
/** odstęp od brzegu korony */
const GAP = 0.15;
/** co znaczy kafelek pod etykietą: brama i siatka (tam stoi warta), rzeczy z podwórka, budynki */
const COST = { gate: 10, fence: 4, prop: 3, building: 2, outside: 10 };
/** pod pniem stoją ludzie przy ścinaniu, więc to ostatnie wyjście */
const SOUTH_EXTRA = 2;

/** wszystkie miejsca wokół korony z oceną (od najlepszego przy remisie: wschód, zachód, nad, pod) */
export function markSpots(w: World): MarkSpot[] {
  if (w.dryTree < 0) return [];
  const t = w.trees[w.dryTree];
  // korona jak w grafice suchego drzewa: koło o promieniu r (gałęzie do 0,96 r) nad pniem o lift
  const lift = t.kind === 2 ? 0.3 : 1.2;
  const r = (Math.round(t.r * 4) / 4) * 0.96;
  const cx = t.x;
  const cy = t.y - lift;
  const hw = LABEL_W / 2;
  const hh = LABEL_H / 2;
  const spots: Omit<MarkSpot, 'score'>[] = [
    { side: 'e', x: cx + r + GAP, y: cy, rect: [cx + r + GAP, cy - hh, cx + r + GAP + LABEL_W, cy + hh] },
    { side: 'w', x: cx - r - GAP, y: cy, rect: [cx - r - GAP - LABEL_W, cy - hh, cx - r - GAP, cy + hh] },
    { side: 'n', x: cx, y: cy - r - GAP, rect: [cx - hw, cy - r - GAP - LABEL_H, cx + hw, cy - r - GAP] },
    { side: 's', x: t.x, y: t.y + 0.5, rect: [t.x - hw, t.y + 0.5, t.x + hw, t.y + 0.5 + LABEL_H] },
  ];
  return spots.map((s) => ({ ...s, score: under(w, s.rect) + (s.side === 's' ? SOUTH_EXTRA : 0) }));
}

/** najlepsze miejsce na etykietę spośród stron sides (domyślnie wszystkich; na wąskim ekranie tylko nad
    i pod, bo z boku napis z koroną nie mieści się w szerokości telefonu) albo null bez suchego drzewa */
export function markSpot(w: World, sides: readonly MarkSide[] = ['e', 'w', 'n', 's']): MarkSpot | null {
  const all = markSpots(w).filter((s) => sides.includes(s.side));
  return all.length ? all.reduce((a, b) => (b.score < a.score ? b : a)) : null;
}

/** środek korony suchego drzewa (metry), w niego celuje strzałka przy krawędzi ekranu */
export function crownOf(w: World): { x: number; y: number } | null {
  if (w.dryTree < 0) return null;
  const t = w.trees[w.dryTree];
  return { x: t.x, y: t.y - (t.kind === 2 ? 0.3 : 1.2) };
}

/** ile kosztuje to, co leży pod prostokątem: każdy kafelek, którego dotyka prostokąt z zapasem 0,2 m */
function under(w: World, [x0, y0, x1, y1]: [number, number, number, number]): number {
  const g = w.fence.gate;
  const fence = new Set(w.fence.tiles);
  let sum = 0;
  for (let y = Math.floor(y0 - 0.2); y <= Math.floor(y1 + 0.2); y++)
    for (let x = Math.floor(x0 - 0.2); x <= Math.floor(x1 + 0.2); x++) {
      if (x < 0 || y < 0 || x >= w.size || y >= w.size) {
        sum += COST.outside;
        continue;
      }
      const i = y * w.size + x;
      // brama, siatka i rzeczy także kafelek niżej: kto tam stoi (warta przy bramie), sięga głową w ten wiersz
      for (const yy of [y, y + 1]) {
        if (yy >= w.size) continue;
        if (x >= g.x && x < g.x + g.w && yy >= g.y && yy < g.y + g.h) sum += COST.gate;
        else if (fence.has(yy * w.size + x)) sum += COST.fence;
        if (w.props.some((p) => x >= p.x && x < p.x + p.w && yy >= p.y && yy < p.y + p.h)) sum += COST.prop;
      }
      if (w.bid[i] >= 0) sum += COST.building;
    }
  return sum;
}
