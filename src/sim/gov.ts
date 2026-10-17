/* Most między zarządem (src/gov) a symulacją: odczyt stanu w kształcie GovInput i stosowanie GovEffects u siebie.
   Zarząd liczy, symulacja robi: zapasy to rzeczy na mapie (drewno w stosach, zapasy w kuchni, złom w stertach),
   potrzeby i nastroje to pionki, wyprawa wychodzi bramą, warta staje przy siatce, łaty zamykają dziury, a napad
   z planu odgrywają szabrownicy. To, co wymaga przeliczenia przechodniości albo dróg (warta, wyprawa, łaty), idzie
   przez kolejkę poleceń w stanie, więc działa od następnego kroku i nie gubi się przy zapisie. */

import type { GovEffects, GovInput, LawEffects } from '../gov/typy.ts';
import type { World } from '../world/world.ts';
import { START_MINUTES, TICKS_PER_HOUR } from './clock.ts';
import { houseOf, inHomeApt } from './house.ts';
import { nearestFree } from './path.ts';
import { fenceShape, gateTiles } from './perimeter.ts';
import {
  addCore,
  addResidents,
  BURNABLE,
  type Laws,
  type Loot,
  type Pawn,
  planRaid,
  removeCore,
  removeResidents,
  type SimState,
  STACK,
  type Thing,
  takeStock,
} from './sim.ts';
import { snapshot } from './snapshot.ts';

/** tick dla minuty gry liczonej od północy pierwszego dnia (jak RaidPlan.at i GovEffects.away) */
export const tickOfMinute = (m: number): number => Math.round(((m - START_MINUTES) * TICKS_PER_HOUR) / 60);

/** Odczyt dla zarządu: snapshot w kształcie GovInput. screen: sekundy przy ekranie od startu gry bez pauzy
    (przy 1× to tick / 20; liczy je pętla gry, bo symulacja nie wie o tempie). */
export function govInput(st: SimState, w: World, screen: number, hqName?: string): GovInput {
  const s = snapshot(st, w);
  return {
    tick: s.tick,
    day: s.day,
    hour: s.hour,
    minute: s.minute,
    season: s.season,
    night: s.night,
    outdoor: s.outdoor,
    kitchen: s.kitchen,
    kozaLit: s.kozaLit,
    people: s.people,
    stock: {
      wood: s.stock.wood,
      woodSklad: s.stock.woodSklad,
      woodLoose: s.stock.woodLoose,
      supplies: s.stock.supplies,
      meals: s.stock.meals,
      scrap: s.stock.scrap,
      parts: s.stock.parts,
      meds: s.stock.meds,
    },
    screen,
    fence: s.fence,
    light: s.light,
    residents: s.residents,
    cap: s.cap,
    burned: s.burned,
    hqName,
  };
}

/** uchwały zarządu, które zmieniają symulację (do polecenia 'laws' albo Sim.setLaws) */
export function lawsFrom(l: LawEffects): Partial<Laws> {
  return { burnMood: l.burnMood, workStart: l.workStart, gateClosed: l.gateClosed };
}

const clamp100 = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

/** pionek zarządu osoby o id z generatora (s1, s2…) */
function pawnOf(st: SimState, id: string): Pawn | undefined {
  return st.pawns.find((p) => p.kind === 'core' && st.people[p.person]?.id === id);
}

/** Rozstrzygnięcie napadu w tym wywołaniu? Zarząd rozstrzyga w minucie napadu i pisze o tym w kronice („Szabrownicy
    weszli…”, „W nocy szabrownicy podeszli…”, „Ktoś kręcił się w nocy…”); przy wtargnięciu każdemu odejmuje dokładnie
    25 bezpieczeństwa i zabiera zapasy, przy odparciu każdemu dodaje dokładnie 8. Bez jawnego pola w GovEffects poznajemy
    to najpierw po wpisie, a bez wpisu po tych śladach u każdego z zarządu (propozycja zmiany API w raporcie). */
function raidOutcome(st: SimState, fx: GovEffects): '' | 'odparty' | 'wtargnięcie' {
  const r = st.raid;
  if (!r?.gov || r.outcome || r.phase >= 3 || st.tick < r.at - 1) return '';
  if (fx.log.some((l) => l.startsWith('Szabrownicy weszli'))) return 'wtargnięcie';
  if (fx.log.some((l) => l.startsWith('W nocy szabrownicy podeszli') || l.startsWith('Ktoś kręcił się w nocy')))
    return 'odparty';
  const ids = st.pawns.filter((p) => p.kind === 'core').map((p) => st.people[p.person].id);
  const all = (v: number) => ids.length > 0 && ids.every((id) => fx.needs.find((n) => n.id === id)?.d.safe === v);
  if (all(-25)) return 'wtargnięcie';
  if (all(8)) return 'odparty';
  return '';
}

/** wolny kafelek podwórka przy bramie na nowy stos (drewno, złom przyniesione z wyprawy) */
function yardSpot(st: SimState, w: World, kind: string, n: number): number {
  const size = w.size;
  const shape = fenceShape(w);
  const gate = gateTiles(w);
  const from = gate.length ? gate[0] : (w.buildings[w.hq]?.entrances[0]?.out ?? 0);
  const fx = from % size;
  const fy = Math.floor(from / size);
  const tiles = (shape?.yard ?? []).filter((i) => !w.blocked[i]);
  // najbliżej bramy, ale nie w przejściu: co najmniej dwa kroki od niej
  tiles.sort(
    (a, b) =>
      Math.hypot((a % size) - fx, Math.floor(a / size) - fy) - Math.hypot((b % size) - fx, Math.floor(b / size) - fy) ||
      a - b,
  );
  for (const i of tiles) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (gate.some((g) => Math.max(Math.abs((g % size) - x), Math.abs(Math.floor(g / size) - y)) < 2)) continue;
    const here = st.things.filter((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
    if (!here.length || (here.length === 1 && here[0].kind === kind && here[0].n + n <= STACK)) return i;
  }
  return nearestFree(w.blocked, size, from);
}

/** dokłada n sztuk na stos danego rodzaju na kafelku (nowy albo istniejący) */
function heapAt(st: SimState, w: World, kind: string, i: number, n: number): void {
  const x = i % w.size;
  const y = Math.floor(i / w.size);
  const t = st.things.find((q) => q.kind === kind && q.x === x && q.y === y);
  if (t) t.n += n;
  else st.things.push({ id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 });
}

/** przybytek: drewno i złom w stosach przy bramie (zarząd sam zaniesie drewno do składu), zapasy do kuchni */
function give(st: SimState, w: World, k: keyof Loot, n: number): void {
  if (k === 'supplies') {
    const food = st.things.find((t) => t.kind === 'jedzenie');
    if (food) {
      food.n += n;
      return;
    }
    const h = houseOf(w);
    const size = w.size;
    // bez zapasów: przy lodówce zarządu, a bez niej przed drzwiami siedziby
    const fridge = h ? st.things.find((t) => t.kind === 'lodowka' && inHomeApt(h, t.y * size + t.x)) : undefined;
    const at = fridge ? nearestFree(w.blocked, size, fridge.y * size + fridge.x) : yardSpot(st, w, 'jedzenie', n);
    heapAt(st, w, 'jedzenie', at, n);
    return;
  }
  const kind = k === 'wood' ? 'drewno' : 'zlom';
  for (let left = n; left > 0; ) {
    const part = k === 'wood' ? Math.min(STACK, left) : left;
    heapAt(st, w, kind, yardSpot(st, w, kind, part), part);
    left -= part;
  }
}

/** Skutki zarządu w symulacji. Wołać zaraz po govUpdate, signLaw, confirmNight albo chooseEvent z tym samym stanem,
    który poszedł do govInput. Uchwały idą osobno: Sim.setLaws(lawsFrom(lawEffects(gov))). */
export function applyGov(st: SimState, w: World, fx: GovEffects): void {
  const cmd = (c: SimState['cmds'][number]) => st.cmds.push(c);
  // napad: plan na tę noc, a w minucie napadu rozstrzygnięcie (łup wyniosą szabrownicy, nie znika od razu)
  if (fx.raid) planRaid(st, tickOfMinute(fx.raid.at), fx.raid.post, true);
  const out = raidOutcome(st, fx);
  const loot: Loot = { wood: 0, supplies: 0, scrap: 0 };
  if (out && st.raid) {
    st.raid.outcome = out;
    if (out === 'wtargnięcie') {
      for (const k of ['wood', 'supplies', 'scrap'] as const) loot[k] = Math.max(0, -fx.stock[k]);
      st.raid.loot = { ...loot };
    }
  }
  // ludzie: najpierw nowi, żeby skutki dla nich trafiły na miejsce
  for (const p of fx.join) if (!pawnOf(st, p.id)) addCore(st, w, p);
  for (const { id, d } of fx.needs) {
    const p = pawnOf(st, id);
    if (!p?.needs) continue;
    for (const [k, v] of Object.entries(d) as [keyof typeof d, number][]) {
      if (k === 'mood') p.moods.push({ why: 'Sprawy spółdzielni', d: v, until: st.tick + 12 * TICKS_PER_HOUR });
      else p.needs[k] = clamp100(p.needs[k] + v);
    }
  }
  for (const m of fx.moods) {
    const p = pawnOf(st, m.id);
    if (!p) continue;
    const until = st.tick + Math.round(m.hours * TICKS_PER_HOUR);
    const same = p.moods.find((q) => q.why === m.why);
    if (same) same.until = Math.max(same.until, until);
    else p.moods.push({ why: m.why, d: m.d, until });
  }
  const ids = (list: readonly string[]) => list.map((id) => pawnOf(st, id)?.id ?? -1).filter((id) => id >= 0);
  if (fx.away.length) cmd({ t: 'away', ids: ids(fx.away.map((a) => a.id)) });
  if (fx.back.length) cmd({ t: 'back', ids: ids(fx.back) });
  for (const g of fx.guards) cmd({ t: 'guard', ids: ids([g.id]), post: g.post });
  for (const id of fx.leave) removeCore(st, id);
  if (fx.residents > 0) addResidents(st, w, fx.residents);
  else if (fx.residents < 0) removeResidents(st, -fx.residents);
  // zapasy (bez łupu napadu, który wyniosą szabrownicy)
  for (const k of ['wood', 'supplies', 'scrap'] as const) {
    const d = fx.stock[k] + loot[k];
    if (d > 0) give(st, w, k, d);
    else if (d < 0) takeStock(st, w, k, -d);
  }
  st.store.parts = Math.max(0, st.store.parts + fx.stock.parts);
  st.store.meds = Math.max(0, st.store.meds + fx.stock.meds);
  if (fx.patch > 0) cmd({ t: 'mend', ids: [], n: fx.patch });
  if (fx.fire) stairFire(st, w);
  if (fx.sick > 0) sicken(st, fx.sick);
}

/** pożar od kozy (zdarzenie zarządu): spala najbliższy kozie zarządu mebel, który się pali, i straszy wszystkich */
function stairFire(st: SimState, w: World): void {
  const h = houseOf(w);
  const size = w.size;
  const koza = h ? st.things.find((t) => t.kind === 'koza' && inHomeApt(h, t.y * size + t.x)) : undefined;
  if (koza) {
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of st.things) {
      if (!BURNABLE[t.kind]) continue;
      const d = (t.x - koza.x) ** 2 + (t.y - koza.y) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best) {
      const r = h!.room[best.y * size + best.x];
      st.burned.push({ tick: st.tick, kind: best.kind, apt: r >= 0 ? h!.rooms[r].apt : -1, by: -1 });
      st.things.splice(st.things.indexOf(best), 1);
    }
  }
  for (const p of st.pawns)
    if (p.needs && !p.away) {
      p.needs.safe = clamp100(p.needs.safe - 10);
      p.moods.push({ why: 'Pożar od kozy', d: -6, until: st.tick + 24 * TICKS_PER_HOUR });
    }
}

/** chorzy do rozdania (choroby przyjdą w M2): najzdrowsi z zarządu słabną i gorzej się czują przez dobę */
function sicken(st: SimState, n: number): void {
  const list = st.pawns
    .filter((p) => p.kind === 'core' && p.needs && !p.away)
    .sort((a, b) => b.needs!.health - a.needs!.health || a.id - b.id);
  for (const p of list.slice(0, n)) {
    p.needs!.health = clamp100(p.needs!.health - 20);
    p.moods.push({ why: 'Choroba', d: -4, until: st.tick + 24 * TICKS_PER_HOUR });
  }
}
