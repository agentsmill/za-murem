/* Wspólne drobiazgi zarządu: puste skutki, czas gry w minutach, kronika (wpisy w obu językach, Tx), zaufanie
   i wkurzenie. */

import { type Tx, tx } from '../core/jezyk.ts';
import { clamp, nextRandom } from '../core/rng.ts';
import { placeIn } from './miejsce.ts';
import { HOLE_NAMES_DOM_EN, HOLE_NAMES_EN, LOOT_LABEL_EN } from './tresc.en.ts';
import { HOLE_NAMES, HOLE_NAMES_DOM, LOOT_LABEL } from './tresc.ts';
import type { GovEffects, GovFence, GovInput, GovNeeds, GovState, StockDelta, StockKey } from './typy.ts';

export const STOCK_KEYS: readonly StockKey[] = ['wood', 'supplies', 'scrap', 'parts', 'meds'];

export const zeroStock = (): StockDelta => ({ wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 });

export const emptyEffects = (): GovEffects => ({
  stock: zeroStock(),
  needs: [],
  moods: [],
  away: [],
  back: [],
  join: [],
  leave: [],
  residents: 0,
  sick: 0,
  patch: 0,
  fire: false,
  raid: null,
  guards: [],
  log: [],
  raidResult: null,
});

/** minuta gry od północy pierwszego dnia */
export const gameMin = (i: Pick<GovInput, 'day' | 'hour' | 'minute'>): number =>
  (i.day - 1) * 1440 + i.hour * 60 + i.minute;
/** minuta gry dla godziny h dnia day (h może być ≥ 24) */
export const atHour = (day: number, h: number, m = 0): number => (day - 1) * 1440 + h * 60 + m;
/** noc należy do dnia, w którym zaczęła się o 20:00: przed szóstą rano to jeszcze noc wczorajsza */
export const nightDay = (i: Pick<GovInput, 'day' | 'hour'>): number => (i.hour < 6 ? i.day - 1 : i.day);

const pad = (n: number) => String(n).padStart(2, '0');
export const clockOf = (i: Pick<GovInput, 'hour' | 'minute'>): string => `${pad(i.hour)}:${pad(i.minute)}`;

export const round1 = (v: number): number => Math.round(v * 10) / 10;
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** liczba z [0, 1) z generatora zapisanego w stanie */
export const rnd = (st: GovState): number => nextRandom(st.rng);
/** liczba całkowita z [a, b] */
export const rint = (st: GovState, a: number, b: number): number => a + Math.floor(rnd(st) * (b - a + 1));

export function logGov(st: GovState, i: GovInput, txt: Tx, big = false, fx?: GovEffects): void {
  st.log.push({ day: i.day, clock: clockOf(i), txt, big });
  if (st.log.length > 300) st.log.splice(0, st.log.length - 300);
  fx?.log.push(txt);
}

/** zaufanie i wkurzenie jak mood() w 0.3 */
export function mood(st: GovState, dTrust: number, dAnger: number): void {
  if (dTrust) st.trust = round2(clamp(st.trust + dTrust, 0, 100));
  if (dAnger) st.anger = round2(clamp(st.anger + dAnger, 0, 100));
}

/** po decyzji gracza najbliższe wydarzenie najwcześniej po tylu sekundach przy ekranie (bez okien jedno po drugim) */
export const QUIET = 20;

export function decision(st: GovState, i: GovInput, k: string): void {
  st.decisions.push({ s: i.screen, k });
  if (st.decisions.length > 400) st.decisions.splice(0, st.decisions.length - 400);
  st.ev.next = Math.max(st.ev.next, i.screen + QUIET);
}

export function addNeeds(fx: GovEffects, id: string, d: Partial<GovNeeds>): void {
  const e = fx.needs.find((n) => n.id === id);
  if (!e) {
    fx.needs.push({ id, d: { ...d } });
    return;
  }
  for (const [k, v] of Object.entries(d) as [keyof GovNeeds, number][]) e.d[k] = (e.d[k] ?? 0) + v;
}

/** zapasy po zmianach z bieżącego wywołania */
export function stockNow(i: GovInput, fx: GovEffects): StockDelta {
  return {
    wood: Math.max(0, i.stock.wood + fx.stock.wood),
    supplies: Math.max(0, i.stock.supplies + fx.stock.supplies),
    scrap: Math.max(0, (i.stock.scrap ?? 0) + fx.stock.scrap),
    parts: Math.max(0, (i.stock.parts ?? 0) + fx.stock.parts),
    meds: Math.max(0, (i.stock.meds ?? 0) + fx.stock.meds),
  };
}

/** zmiana zapasu, która nie zejdzie poniżej zera */
export function addStock(i: GovInput, fx: GovEffects, k: StockKey, v: number): number {
  const now = stockNow(i, fx)[k];
  const d = Math.max(v, -now);
  fx.stock[k] += d;
  return d;
}

/** „drewno 3, jedzenie 2” do środka zdania (wartości bezwzględne, bez zer) */
export function stockText(d: Partial<StockDelta>): string {
  return (Object.entries(d) as [StockKey, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${LOOT_LABEL[k].toLowerCase()} ${Math.abs(v)}`)
    .join(', ');
}

/** to samo w obu językach: „drewno 3, jedzenie 2”, „wood 3, food 2”; pusty, gdy same zera */
export function stockTx(d: Partial<StockDelta>): Tx {
  const en = (Object.entries(d) as [StockKey, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${LOOT_LABEL_EN[k].toLowerCase()} ${Math.abs(v)}`)
    .join(', ');
  return tx(stockText(d), en);
}

/** siatka z wejścia; bez niej jedna dziura i brama (atrapa do czasu tury 2). Nazwy dziur w obu językach: z wejścia
    albo z list HOLE_NAMES po numerze dziury. */
export function fenceOf(i: GovInput, patched = 0): GovFence {
  const f: GovFence = i.fence ?? {
    holes: [{ id: 0, size: 0.6, name: tx('w siatce', 'in the fence') }],
    durability: 0.5,
  };
  const dom = placeIn(i).kind === 'dom';
  const names = dom ? HOLE_NAMES_DOM : HOLE_NAMES;
  const namesEn = dom ? HOLE_NAMES_DOM_EN : HOLE_NAMES_EN;
  const at = (id: number) => (((id - 1) % names.length) + names.length) % names.length;
  const holes = [...f.holes]
    .sort((a, b) => b.size - a.size || a.id - b.id)
    .slice(patched)
    .map((h) => ({ ...h, name: h.name ?? tx(names[at(h.id)], namesEn[at(h.id)]) }));
  return { holes, durability: f.durability, gateOpen: f.gateOpen };
}

/** ile mebli spalono (wejście podaje liczbę albo listę jak snapshot symulacji) */
export const burnedCount = (b: GovInput['burned']): number => (Array.isArray(b) ? b.length : ((b as number) ?? 0));
