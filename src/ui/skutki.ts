/* Skutki zarządu w stanie symulacji: cienki adapter na czas, zanim sesja symulacji da applyGov(st, w, fx)
   w src/sim. DO PODMIANY: przy łączeniu main.ts importuje applyGov z src/sim zamiast stąd, a ten plik
   znika (ta sama sygnatura). Stosuje tylko zapasy (drewno i jedzenie), zmiany potrzeb i chwilowe nastroje.
   Wyprawy (away, back), warta (guards), napad (raid), łatanie (patch), nowi i odchodzący ludzie, pożar
   i choroby czekają na prawdziwą funkcję; złom, części i leki zostają na razie tylko w zarządzie. */

import type { GovEffects, GovNeeds } from '../gov/typy.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { houseOf } from '../sim/house.ts';
import { type SimState, STACK, type Thing } from '../sim/sim.ts';
import type { World } from '../world/world.ts';

const clamp100 = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);
const covers = (t: Thing, x: number, y: number) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;

function put(st: SimState, kind: string, tile: number, size: number, n: number): void {
  st.things.push({
    id: st.nextThing++,
    kind,
    x: tile % size,
    y: Math.floor(tile / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  });
}

/** zabiera n sztuk z rzeczy po kolei; zwraca, ile się nie zmieściło */
function take(st: SimState, list: Thing[], n: number): number {
  for (const t of list) {
    if (n <= 0) break;
    const k = Math.min(t.n, n);
    t.n -= k;
    n -= k;
    // pusty stos drewna znika jak w symulacji; zapasy jedzenia zostają jako miejsce z zerem
    if (t.kind === 'drewno' && t.n <= 0) st.things.splice(st.things.indexOf(t), 1);
  }
  return n;
}

/** drewno z wyprawy na skład przy kozie (stosy po STACK), a bez składu obok pierwszej osoby z zarządu */
function addWood(st: SimState, w: World, n: number): void {
  const size = w.size;
  const sklad = houseOf(w)?.sklad ?? [];
  for (const i of sklad) {
    if (n <= 0) return;
    const x = i % size;
    const y = Math.floor(i / size);
    const pile = st.things.find((t) => t.kind === 'drewno' && t.x === x && t.y === y);
    if (pile) {
      const k = Math.min(STACK - pile.n, n);
      if (k > 0) {
        pile.n += k;
        n -= k;
      }
    } else if (!w.blocked[i] && !st.things.some((t) => covers(t, x, y))) {
      const k = Math.min(STACK, n);
      put(st, 'drewno', i, size, k);
      n -= k;
    }
  }
  if (n <= 0) return;
  // skład pełny albo go nie ma: reszta na jednym stosie (ostatni kafelek składu albo przy zarządzie)
  const core = st.pawns.find((p) => p.kind === 'core');
  const at = sklad.length
    ? sklad[sklad.length - 1]
    : core
      ? Math.floor(core.y) * size + Math.floor(core.x)
      : Math.floor(size / 2) * size + Math.floor(size / 2);
  const pile = st.things.find((t) => t.kind === 'drewno' && t.y * size + t.x === at);
  if (pile) pile.n += n;
  else put(st, 'drewno', at, size, n);
}

/** jedzenie do zapasów zarządu (pierwsze miejsce z zapasami, a bez niego obok lodówki albo na składzie) */
function addFood(st: SimState, w: World, n: number): void {
  const food = st.things.find((t) => t.kind === 'jedzenie');
  if (food) {
    food.n += n;
    return;
  }
  const size = w.size;
  const fridge = st.things.find((t) => t.kind === 'lodowka');
  const sklad = houseOf(w)?.sklad ?? [];
  const at = fridge ? fridge.y * size + fridge.x : sklad[0];
  if (at !== undefined) put(st, 'jedzenie', at, size, n);
}

/** Skutki z govUpdate, confirmNight, signLaw i chooseEvent w stanie symulacji. DO PODMIANY na applyGov
    z src/sim (ta sama sygnatura). */
export function applyGov(st: SimState, w: World, fx: GovEffects): void {
  const size = w.size;
  const sklad = houseOf(w)?.sklad ?? [];
  const onSklad = (t: Thing) => sklad.includes(t.y * size + t.x);
  const wood = Math.round(fx.stock.wood);
  if (wood > 0) addWood(st, w, wood);
  else if (wood < 0) {
    // kradzież: najpierw drewno luzem (większe stosy najpierw), potem ze składu
    const piles = st.things.filter((t) => t.kind === 'drewno' && t.n > 0);
    const loose = piles.filter((t) => !onSklad(t)).sort((a, b) => b.n - a.n || a.id - b.id);
    const kept = piles.filter(onSklad).sort((a, b) => b.n - a.n || a.id - b.id);
    take(st, [...loose, ...kept], -wood);
  }
  const food = Math.round(fx.stock.supplies);
  if (food > 0) addFood(st, w, food);
  else if (food < 0)
    take(
      st,
      st.things.filter((t) => t.kind === 'jedzenie' && t.n > 0),
      -food,
    );
  const pawnOf = (id: string) => {
    const k = st.people.findIndex((p) => p.id === id);
    return k < 0 ? undefined : st.pawns.find((p) => p.kind === 'core' && p.person === k);
  };
  for (const e of fx.needs) {
    const p = pawnOf(e.id);
    if (!p?.needs) continue;
    for (const [k, v] of Object.entries(e.d) as [keyof GovNeeds, number][]) p.needs[k] = clamp100(p.needs[k] + v);
  }
  for (const m of fx.moods) {
    const p = pawnOf(m.id);
    if (!p) continue;
    const until = st.tick + Math.round(m.hours * TICKS_PER_HOUR);
    // ten sam powód drugi raz tylko przedłuża czas, jak addMood w symulacji
    const was = p.moods.find((q) => q.why === m.why);
    if (was) was.until = Math.max(was.until, until);
    else p.moods.push({ why: m.why, d: m.d, until });
  }
}
