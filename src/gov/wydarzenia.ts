/* Wydarzenia w M1: wybrane z 0.3 (bez zmiany treści, przez EventHost) i nowe z tresc.ts, z porą dnia.
   Harmonogram liczony w sekundach przy ekranie, nie w godzinach gry: w 0.3 wydarzenie przychodziło co
   14–30 godzin gry, czyli co 35–75 s, a przy nowym zegarze (godzina gry trwa 40 s) byłoby to co 9–20
   minut. Przez pierwsze 10 minut wydarzenie co 38–56 s, potem co 100–180 s. Nowe nie przychodzi,
   kiedy na decyzję czeka karta nocy, uchwała, raport albo poprzednie wydarzenie. */

import type { Cost, Res, TechDom } from '../content/data.ts';
import { type ActiveEvent, eventDef } from '../content/events.ts';
import { makePerson, type Person } from '../content/people.ts';
import { rngOf } from '../core/rng.ts';
import { type GEventDef, type GovHost, NEW_EVENTS, OLD_EVENTS, type Pora, poraOf, REPEAT_GAP } from './tresc.ts';
import type { GovEffects, GovInput, GovPerson, GovState, LootKey, StockKey } from './typy.ts';
import { law } from './uchwaly.ts';
import {
  addNeeds,
  addStock,
  decision,
  emptyEffects,
  fenceOf,
  gameMin,
  logGov,
  mood,
  nightDay,
  rnd,
  stockNow,
} from './wspolne.ts';

/** pierwsze wydarzenie po tylu sekundach przy ekranie (samouczek ma swoje decyzje) */
export const FIRST_EVENT = 70;
/** do tej chwili gęściej: decyzja co minutę w pierwszych 10 minutach */
export const EARLY = 600;
/** po nieudanym losowaniu (nic nie pasowało) następna próba po tylu sekundach przy ekranie */
export const RETRY = 8;

const RES_KEY: Record<Res, StockKey | null> = {
  opal: 'wood',
  jedzenie: 'supplies',
  zlom: 'scrap',
  czesci: 'parts',
  leki: 'meds',
  prad: null,
};

/** wydarzenia M1: z 0.3 (z porą i ewentualnie nową wagą) i nowe */
export const M1_EVENTS: GEventDef[] = [
  ...OLD_EVENTS.map((o): GEventDef => {
    const d = eventDef(o.id);
    if (!d) throw new Error(`brak wydarzenia ${o.id} w treści 0.3`);
    return { ...d, when: o.when, w: o.w ?? d.w };
  }),
  ...NEW_EVENTS,
];
const byId = new Map(M1_EVENTS.map((e) => [e.id, e]));

const toPerson = (p: GovPerson): Person => ({
  id: p.id,
  first: p.first,
  name: p.name,
  f: p.f,
  prof: p.prof,
  skills: { ...p.skills },
  age: p.age,
  traits: [...p.traits],
  home: 0,
  assign: null,
  sick: p.needs.health < 30,
  dead: false,
  gone: false,
});

/** EventHost z 0.3 na stanie zarządu: zapasy z wejścia, zmiany idą do skutków fx */
export function makeHost(st: GovState, i: GovInput, fx: GovEffects): GovHost {
  const people = i.people.map(toPerson);
  const away = new Set(st.night?.confirmed ? st.night.exp.flatMap((e) => e.ids) : []);
  const res = (): Record<Res, number> => {
    const s = stockNow(i, fx);
    return { opal: s.wood, jedzenie: s.supplies, zlom: s.scrap, czesci: s.parts, leki: s.meds, prad: 0 };
  };
  const addRes = (k: Res, v: number) => {
    const key = RES_KEY[k];
    if (key) addStock(i, fx, key, v);
  };
  const nd = nightDay(i);
  const h: GovHost = {
    rng: rngOf(st.rng),
    get res() {
      return res();
    },
    get trust() {
      return st.trust;
    },
    t: gameMin(i),
    day: () => i.day,
    season: () => i.season,
    law: (id) => law(st, id),
    tech: () => false,
    know: (d) => Math.max(0, ...i.people.map((p) => p.skills[d] ?? 0)) + Math.min(2, st.books[d as TechDom] ?? 0),
    rule: () => true,
    pop: () => i.people.length + (i.residents ?? 0),
    cap: () => i.cap ?? i.people.length + (i.residents ?? 0) + 4,
    alive: () => people.filter((p) => !fx.leave.includes(p.id)),
    spec: (id) => people.find((p) => p.id === id),
    makePerson: (opts) => makePerson(rngOf(st.rng), new Set(people.map((p) => p.first)), () => st.nextId++, opts),
    joinPerson: (p) => {
      fx.join.push(p);
    },
    personLeaves: (p) => {
      fx.leave.push(p.id);
    },
    addPeople: (n) => {
      fx.residents += n;
    },
    addRes,
    have: (c: Cost) => Object.entries(c).every(([k, v]) => res()[k as Res] >= (v ?? 0)),
    pay: (c: Cost) => {
      for (const [k, v] of Object.entries(c)) addRes(k as Res, -(v ?? 0));
    },
    gain: (c: Cost) => {
      for (const [k, v] of Object.entries(c)) addRes(k as Res, v ?? 0);
    },
    mood: (dT, dA) => mood(st, dT, dA),
    addSick: (n) => {
      fx.sick += n;
    },
    log: (txt, big) => logGov(st, i, txt, !!big, fx),
    hqName: () => i.hqName ?? 'siedziby',
    buildingName: (b) => (b === 0 ? (i.hqName ?? 'siedziby') : 'z sąsiedztwa'),
    pickBuilding: (kind) => (kind === 'heated' ? (i.kozaLit ? 0 : null) : 0),
    anyHeated: () => i.kozaLit,
    removeResident: () => {
      fx.residents -= 1;
    },
    burnStaircase: () => {
      fx.fire = true;
    },
    hasWorking: () => false,
    bookCount: (d) => st.books[d] ?? 0,
    addBook: (d) => {
      st.books[d] = (st.books[d] ?? 0) + 1;
    },
    setAlertNight: () => {
      st.tonight.alert = nd;
    },
    setRaidBoost: () => {
      st.tonight.boost = nd;
    },
    setSmog: () => {},
    // dodatki M1
    hour: () => i.hour,
    holes: () => Math.max(0, fenceOf(i).holes.length - fx.patch),
    weakName: () => fenceOf(i, fx.patch).holes[0]?.name ?? 'w siatce',
    patchHole: () => {
      fx.patch += 1;
    },
    guardBonus: (v) => {
      if (st.tonight.bonusDay !== nd) {
        st.tonight.bonusDay = nd;
        st.tonight.bonus = 0;
      }
      st.tonight.bonus += v;
    },
    moodAll: (why, d, hours) => {
      for (const p of i.people) fx.moods.push({ id: p.id, why, d, hours });
    },
    needsAll: (d) => {
      for (const p of i.people) addNeeds(fx, p.id, d);
    },
    needsOf: (id, d) => addNeeds(fx, id, d),
    rested: () =>
      [...i.people]
        .filter((p) => !p.asleep && !away.has(p.id))
        .sort((a, b) => b.needs.rest - a.needs.rest || (a.id < b.id ? -1 : 1))[0] ?? null,
    flag: (k) => st.flags[k],
    setFlag: (k) => {
      st.flags[k] = true;
    },
    gateClosed: () => law(st, 'u_brama') && (i.hour >= 20 || i.hour < 6),
    guarded: () => !!st.night?.confirmed && Object.values(st.night.assign).some((k) => k.startsWith('warta:')),
    later: (stock, line) => {
      st.later.push({ day: nd, stock: stock as Partial<Record<LootKey, number>>, line });
    },
  };
  return h;
}

/** losowanie wydarzenia z puli pory dnia, jak pickEvent w 0.3 */
function pickGovEvent(st: GovState, h: GovHost, pora: Pora): ActiveEvent | null {
  const fresh = (e: GEventDef) =>
    st.ev.last[e.id] === undefined || h.t - st.ev.last[e.id] >= (e.gap ?? REPEAT_GAP) * 60;
  const pool = M1_EVENTS.filter((e) => e.when.includes(pora) && !(e.once && st.ev.done[e.id]) && fresh(e))
    .map((e) => [e, e.w(h)] as const)
    .filter((x) => x[1] > 0);
  const tot = pool.reduce((a, x) => a + x[1], 0);
  if (!tot) return null;
  let r = h.rng() * tot;
  for (const [e, w] of pool) {
    r -= w;
    if (r <= 0) {
      const d = e.make(h);
      if (!d) return null;
      st.ev.done[e.id] = true;
      st.ev.last[e.id] = h.t;
      return { id: e.id, d };
    }
  }
  return null;
}

/** odstęp do następnego wydarzenia w sekundach przy ekranie */
export const nextGap = (st: GovState, screen: number): number =>
  screen < EARLY ? 38 + Math.floor(rnd(st) * 19) : 100 + Math.floor(rnd(st) * 81);

/** harmonogram: nowe wydarzenie, gdy minął odstęp, jest pora dnia z pulą i nic nie czeka na decyzję */
export function eventTick(st: GovState, i: GovInput, fx: GovEffects, busy: boolean): void {
  if (st.ev.active || busy || i.screen < st.ev.next) return;
  const pora = poraOf(i.hour);
  if (!pora) return;
  st.ev.next = i.screen + nextGap(st, i.screen);
  const ev = pickGovEvent(st, makeHost(st, i, fx), pora);
  // nic nie pasowało (pusta pula tej pory albo warunek wydarzenia): następna próba niedługo, nie po pełnym odstępie
  if (!ev) {
    st.ev.next = i.screen + RETRY;
    return;
  }
  st.ev.active = ev;
  st.ev.when = i.screen;
  const def = byId.get(ev.id)!;
  logGov(st, i, def.title(makeHost(st, i, fx), ev.d), false, fx);
}

export function eventView(st: GovState, i: GovInput) {
  const ev = st.ev.active;
  if (!ev) return null;
  const def = byId.get(ev.id)!;
  const h = makeHost(st, i, emptyEffects());
  return {
    id: ev.id,
    title: def.title(h, ev.d),
    text: def.text(h, ev.d),
    choices: def.choices(h, ev.d).map((c) => ({ label: c.label, ok: c.ok })),
  };
}

/** wybór odpowiedzi; zwraca false, gdy nie ma wydarzenia albo odpowiedź jest niedostępna */
export function choose(st: GovState, i: GovInput, fx: GovEffects, k: number): boolean {
  const ev = st.ev.active;
  if (!ev) return false;
  const def = byId.get(ev.id)!;
  const h = makeHost(st, i, fx);
  const c = def.choices(h, ev.d)[k];
  if (!c?.ok) return false;
  st.ev.active = null;
  logGov(st, i, `${def.title(h, ev.d)}: ${c.label}.`, false, fx);
  c.run();
  decision(st, i, 'wydarzenie');
  // odstęp liczy się od decyzji, żeby wydarzenia nie przychodziły jedno za drugim
  st.ev.next = Math.max(st.ev.next, i.screen + nextGap(st, i.screen));
  return true;
}
