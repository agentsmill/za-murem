/* Duch planu wspólnego płotu (M2 fala 2, etap 3, docs/M2-fala-2.md). Dopóki w stanie jest plan (st.plot.plan), mapa
   pokazuje przyszły obwód półprzezroczyście: nowe kafelki z plotDla, ten sam kształt, który liczy menu i który
   postawi praca, gdyby skończyła się teraz. Sprite'y siatki mają maski sąsiadów z całej przyszłej siatki
   (fenceThings), więc duch łączy się ze starą siatką i z budynkami jak gotowy płot; łączniki po skosie tylko przy
   nowych kafelkach. Postęp jak na karcie budynku (procentPlotu) i materiały doniesione do potrzebnych.

   Czysta funkcja stanu i świata bez PixiJS (rysuje plotLayer.ts), nic nie zapisuje w stanie. plotDla przechodzi
   całą mapę, więc kształt liczy się od nowa tylko po zmianie tego, od czego zależy: budynek planu, siatka świata
   (wspólny płot podmienia obiekt w.fence), zasieki i otoczone budynki. Pamięć jest na obiekt świata. */

import { plotDla, procentPlotu, type StanPlotu } from '../sim/sasiedzi.ts';
import type { Fence } from '../world/fence.ts';
import type { World } from '../world/world.ts';
import type { ThingLike } from './section.ts';
import { fenceThings } from './yard.ts';

export interface DuchPlotu {
  bid: number;
  /** nowe kafelki płotu, rosnąco (jak PlotWynik.nowe) */
  tiles: readonly number[];
  /** sprite'y siatki na nowych kafelkach i łączniki po skosie przy nich */
  siatka: readonly ThingLike[];
  /** kafelek pod postępem: nowy kafelek najbliżej środka nowego płotu */
  znak: number;
  /** praca w procentach jak na karcie budynku (najwyżej 99) */
  pct: number;
  /** materiały doniesione do potrzebnych, 0..1 */
  mats: number;
}

type Ksztalt = Pick<DuchPlotu, 'bid' | 'tiles' | 'siatka' | 'znak'>;

interface Pamiec {
  fence: Fence;
  bid: number;
  zasieki: string;
  otoczone: number;
  ksztalt: Ksztalt | null;
}

const pamiec = new WeakMap<World, Pamiec>();

/** duch planu płotu ze stanu albo null (bez planu, gdy płotu już się nie da postawić albo nie ma nowych metrów) */
export function duchPlotu(st: StanPlotu, w: World): DuchPlotu | null {
  const plan = st.plot?.plan;
  if (!plan) return null;
  const size = w.size;
  const zasieki = st.things
    .filter((t) => t.kind === 'zasieki')
    .map((t) => t.y * size + t.x)
    .join();
  const otoczone = st.plot?.bids.length ?? 0;
  let m = pamiec.get(w);
  if (!m || m.fence !== w.fence || m.bid !== plan.bid || m.zasieki !== zasieki || m.otoczone !== otoczone) {
    m = { fence: w.fence, bid: plan.bid, zasieki, otoczone, ksztalt: ksztaltDucha(st, w, plan.bid) };
    pamiec.set(w, m);
  }
  if (!m.ksztalt) return null;
  const sum = (r: Partial<Record<string, number>>) => Object.values(r).reduce((a: number, v) => a + (v ?? 0), 0);
  const need = sum(plan.need);
  return { ...m.ksztalt, pct: procentPlotu(plan), mats: need > 0 ? Math.min(1, sum(plan.have) / need) : 1 };
}

function ksztaltDucha(st: StanPlotu, w: World, bid: number): Ksztalt | null {
  const r = plotDla(st, w, bid);
  if (!r?.ok || !r.nowe.length) return null;
  const size = w.size;
  const nowe = new Set(r.nowe);
  const siatki = new Set(r.fence.tiles);
  const przyNowym = (i: number) => {
    const x = i % size;
    const y = (i - x) / size;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size && nowe.has(ny * size + nx)) return true;
      }
    return false;
  };
  const siatka = fenceThings(r.fence, w).filter((t) => {
    const i = t.y * size + t.x;
    return t.kind === 'siatka' && (nowe.has(i) || (!siatki.has(i) && przyNowym(i)));
  });
  // postęp nad nowym kafelkiem najbliżej środka nowego płotu
  let cx = 0;
  let cy = 0;
  for (const t of r.nowe) {
    cx += t % size;
    cy += Math.floor(t / size);
  }
  cx /= r.nowe.length;
  cy /= r.nowe.length;
  let znak = r.nowe[0];
  let best = Number.POSITIVE_INFINITY;
  for (const t of r.nowe) {
    const d = ((t % size) - cx) ** 2 + (Math.floor(t / size) - cy) ** 2;
    if (d < best) {
      best = d;
      znak = t;
    }
  }
  return { bid, tiles: r.nowe, siatka, znak };
}
