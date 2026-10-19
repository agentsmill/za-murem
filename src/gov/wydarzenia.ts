/* Wydarzenia w M1: wybrane z 0.3 (bez zmiany treści, przez EventHost) i nowe z tresc.ts, z porą dnia.
   Harmonogram liczony w sekundach przy ekranie, nie w godzinach gry: w 0.3 wydarzenie przychodziło co
   14–30 godzin gry, czyli co 35–75 s, a przy nowym zegarze (godzina gry trwa 40 s) byłoby to co 9–20
   minut. Przez pierwsze 10 minut wydarzenie co 38–56 s, potem co 100–180 s. Nowe nie przychodzi,
   kiedy na decyzję czeka karta nocy, uchwała, raport albo poprzednie wydarzenie.
   Pierwszy dzień (decyzja Mateusza, 17.10.2026): dopóki kuchnia się nie nagrzeje, cisza bez losowych wydarzeń;
   koza pierwszy raz się pali, więc po chwili ktoś widzi dym i przychodzi; do rana drugiego dnia tylko wydarzenia
   pierwszej nocy (siatka, obcy, noc), reszta od drugiego dnia.
   Pule według trybu gry: wydarzenie ma opcjonalne `tryby` (brak: oba tryby), `fitsMode` sprawdza je razem z wykluczeniem
   wydarzeń ulicy w trybie zombie; karty o ludziach, których na mapie nie ma, w zombie nie przychodzą.
   Badania: technologie (`tech`), wiedza (`know`) i książki (`bookCount`, `addBook`) EventHost bierze z GovInput, czyli
   z symulacji, jak tablica badań; nowa książka idzie do skutków (GovEffects.books), a nie do stanu zarządu. */

import type { Cost, Res, TechDom } from '../content/data.ts';
import { type ActiveEvent, eventDef } from '../content/events.ts';
import { makePerson, type Person } from '../content/people.ts';
import { type Tx, tx, txCat } from '../core/jezyk.ts';
import { rngOf } from '../core/rng.ts';
import { freePlaces, placeIn, sasiedzi, wordsEn, wordsOf } from './miejsce.ts';
import { type GEventDef, type GovHost, NEW_EVENTS, OLD_EVENTS, type Pora, poraOf, REPEAT_GAP } from './tresc.ts';
import type { GovEffects, GovInput, GovPerson, GovState, LootKey, StockKey } from './typy.ts';
import { law } from './uchwaly.ts';
import { STREET_EVENTS } from './ulica.ts';
import { EVENTS_EN } from './warianty.en.ts';

/** wydarzenia ulicy (M2): żywi sąsiedzi i wyjścia za siatkę bez ryzyka, w trybie zombie nie pasują */
const STREET_IDS: ReadonlySet<string> = new Set(STREET_EVENTS.map((e) => e.id));

/** czy wydarzenie pasuje do trybu gry: jego `tryby` (brak: oba) i w trybie zombie bez wydarzeń ulicy */
export const fitsMode = (st: Pick<GovState, 'mode'>, e: Pick<GEventDef, 'id' | 'tryby'>): boolean => {
  const mode = st.mode ?? 'zwykly';
  return (e.tryby?.includes(mode) ?? true) && !(mode === 'zombie' && STREET_IDS.has(e.id));
};

import { drewno } from './warianty.ts';
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
/** dym z komina po tylu sekundach przy ekranie od pierwszego rozpalenia kozy (przy 1× w środku czekania na ciepło,
    tak żeby od poleceń samouczka do pierwszego okna i od dymu do pierwszego wydarzenia nie mijała więcej niż minuta) */
export const DYM_DELAY = 20;
/** po ciszy pierwsze losowe wydarzenie najwcześniej po tylu sekundach (nie razem z nowym celem samouczka) */
export const AFTER_WARM = 10;
/** cisza pierwszego dnia trwa do ciepłej kuchni, najpóźniej do tej godziny */
export const CALM_END = 18;
/** od tylu stopni kuchnia jest ciepła (jak WARM_ENOUGH w samouczku) */
export const WARM_KITCHEN = 18;

/** pierwszy dzień i pierwsza noc, do 8:00 drugiego dnia: tylko wydarzenia z flagą first */
export const firstNight = (i: Pick<GovInput, 'day' | 'hour'>): boolean => i.day === 1 || (i.day === 2 && i.hour < 8);

/** Cisza pierwszego dnia: do pierwszej ciepłej kuchni, najpóźniej do CALM_END. Przy okazji zapisuje jej koniec
    (ev.warm); bez kuchni (świat bez wnętrza) i od drugiego dnia ciszy nie ma. */
export function calm(st: GovState, i: GovInput): boolean {
  if (st.ev.warm !== undefined) return false;
  if (i.day > 1 || i.kitchen === null || i.kitchen >= WARM_KITCHEN || i.hour >= CALM_END) {
    st.ev.warm = i.screen;
    return false;
  }
  return true;
}

const RES_KEY: Record<Res, StockKey | null> = {
  opal: 'wood',
  jedzenie: 'supplies',
  zlom: 'scrap',
  czesci: 'parts',
  leki: 'meds',
  prad: null,
};

/** wydarzenia M1: z 0.3 z nakładką (pora, waga z miejscem, teksty według miejsca, drewno zamiast opału) i nowe.
    Teksty wydarzeń z 0.3 są po polsku; angielskie daje EVENTS_EN (warianty.en.ts) z tych samych danych, a bez wpisu
    angielska strona to polski tekst. */
export const M1_EVENTS: GEventDef[] = [
  ...OLD_EVENTS.map((o): GEventDef => {
    const d = eventDef(o.id);
    if (!d) throw new Error(`brak wydarzenia ${o.id} w treści 0.3`);
    const base = (h: GovHost, x: unknown) => d.choices(h, x).map((c) => ({ ...c, label: drewno(c.label) }));
    const w = o.w;
    const en = () => EVENTS_EN[o.id];
    const title = (h: GovHost, x: unknown) => o.title?.(h, x) ?? drewno(d.title(h, x));
    const text = (h: GovHost, x: unknown) => o.text?.(h, x) ?? drewno(d.text(h, x));
    return {
      id: d.id,
      once: d.once,
      when: o.when,
      tryby: o.tryby,
      first: o.first,
      w: w ? (h) => w(h, d.w(h)) : d.w,
      make: o.make ?? d.make,
      title: (h, x) => {
        const pl = title(h, x);
        return tx(pl, en()?.title(h, x) ?? pl);
      },
      text: (h, x) => {
        const pl = text(h, x);
        return tx(pl, en()?.text(h, x) ?? pl);
      },
      choices: (h, x) => {
        const b = base(h, x);
        let pl = b;
        if (o.choices) pl = o.choices(h, x, b);
        else {
          const ls = o.labels?.(h, x) ?? [];
          pl = b.map((c, k) => ({ ...c, label: ls[k] ?? c.label }));
        }
        const labels = en()?.labels(
          h,
          x,
          pl.map((c) => c.label),
        );
        return pl.map((c, k) => ({ ...c, label: tx(c.label, labels?.[k] ?? c.label) }));
      },
      log: o.log,
    };
  }),
  ...NEW_EVENTS,
  ...STREET_EVENTS,
];
const byId = new Map(M1_EVENTS.map((e) => [e.id, e]));
// „Słoik od sąsiadki” z M1 to teraz dym z komina: stary zapis z tym oknem otwartym albo już zamkniętym działa dalej
byId.set('sasiadka', byId.get('dym')!);

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

/** EventHost z 0.3 na stanie zarządu: zapasy z wejścia, zmiany idą do skutków fx; z wydarzeniem ev wpisy do kroniki
    z jego wyborów mają drewno zamiast opału i zwroty według miejsca, a z danymi i numerem wyboru (pick) polski wpis
    z 0.3 dostaje angielski z EVENTS_EN */
export function makeHost(
  st: GovState,
  i: GovInput,
  fx: GovEffects,
  ev?: GEventDef,
  pick?: { d: unknown; k: number },
): GovHost {
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
    // Fisher-Yates z ziarna zarządu: ten sam wynik w każdym silniku JS (sort z losowym porównaniem daje różne)
    shuffle: (a) => {
      for (let k = a.length - 1; k > 0; k--) {
        const j = Math.floor(h.rng() * (k + 1));
        [a[k], a[j]] = [a[j], a[k]];
      }
      return a;
    },
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
    // technologie i wiedza z symulacji (jedna wiedza z tablicą badań: zarząd, lokatorzy i książki); bez nich, w testach
    // z ręcznym wejściem, po staremu
    tech: (id) => !!i.techDone?.includes(id),
    know: (d) =>
      i.know?.[d as TechDom] ??
      Math.max(0, ...i.people.map((p) => p.skills[d] ?? 0)) + Math.min(2, st.books[d as TechDom] ?? 0),
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
    log: (txt, big) => {
      if (typeof txt !== 'string') return logGov(st, i, txt, !!big, fx);
      let line = drewno(txt);
      for (const [a, b] of Object.entries(ev?.log?.(h) ?? {})) line = line.replaceAll(a, b);
      const en = ev && pick ? EVENTS_EN[ev.id]?.log?.(line, h, pick.d, pick.k) : null;
      logGov(st, i, tx(line, en ?? line), !!big, fx);
    },
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
    // książki mieszkają w symulacji; nowa idzie do skutków, a do liczenia wlicza się ta, która w tym kroku już czeka
    bookCount: (d) => (i.books?.[d] ?? 0) + (fx.books?.filter((b) => b === d).length ?? 0),
    addBook: (d) => {
      (fx.books ??= []).push(d);
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
    weakName: () => fenceOf(i, fx.patch).holes[0]?.name ?? tx('w siatce', 'in the fence'),
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
    place: () => placeIn(i),
    free: () => freePlaces(i),
    residents: () => i.residents ?? 0,
    outdoor: () => i.outdoor,
    campfire: () => !!i.light?.campfire,
    words: () => wordsOf(placeIn(i)),
    wordsEn: () => wordsEn(placeIn(i)),
    neighbour: () => {
      const p = placeIn(i);
      if (p.kind === 'blok' && (i.residents ?? 0) > 0) return 'z waszej klatki';
      const s = sasiedzi(p);
      return s === null ? null : s === 'bloki' ? 'z bloku obok' : 'zza płotu';
    },
    neighbourEn: () => {
      const p = placeIn(i);
      if (p.kind === 'blok' && (i.residents ?? 0) > 0) return 'from your stairwell';
      const s = sasiedzi(p);
      return s === null ? null : s === 'bloki' ? 'from the block next door' : 'from over the fence';
    },
    neighbours: () => sasiedzi(placeIn(i)),
  };
  return h;
}

/** wydarzenie przychodzi: dane z make (null: nie przychodzi), wpis do ewidencji powtórek */
function activate(st: GovState, h: GovHost, e: GEventDef): ActiveEvent | null {
  const d = e.make(h);
  if (!d) return null;
  st.ev.done[e.id] = true;
  st.ev.last[e.id] = h.t;
  return { id: e.id, d };
}

/** losowanie wydarzenia z puli pory dnia, jak pickEvent w 0.3; pierwszej nocy tylko z flagą first */
function pickGovEvent(st: GovState, h: GovHost, pora: Pora, first: boolean): ActiveEvent | null {
  const fresh = (e: GEventDef) =>
    st.ev.last[e.id] === undefined || h.t - st.ev.last[e.id] >= (e.gap ?? REPEAT_GAP) * 60;
  const pool = M1_EVENTS.filter(
    (e) => e.when.includes(pora) && (!first || e.first) && !(e.once && st.ev.done[e.id]) && fresh(e) && fitsMode(st, e),
  )
    .map((e) => [e, e.w(h)] as const)
    .filter((x) => x[1] > 0);
  const tot = pool.reduce((a, x) => a + x[1], 0);
  if (!tot) return null;
  let r = h.rng() * tot;
  for (const [e, w] of pool) {
    r -= w;
    if (r <= 0) return activate(st, h, e);
  }
  return null;
}

/** dym z komina czeka: koza paliła się pierwszego dnia (albo pierwszej nocy), dymu jeszcze nie było, sąsiad jest */
const dymWaits = (st: GovState, h: GovHost): boolean =>
  !st.ev.done.dym && !st.ev.done.sasiadka && (st.ev.lit ?? -1) >= 0 && h.neighbour() !== null;

/** odstęp do następnego wydarzenia w sekundach przy ekranie */
export const nextGap = (st: GovState, screen: number): number =>
  screen < EARLY ? 38 + Math.floor(rnd(st) * 19) : 100 + Math.floor(rnd(st) * 81);

/** harmonogram: nowe wydarzenie, gdy minął odstęp, jest pora dnia z pulą i nic nie czeka na decyzję; pierwszego
    dnia cisza do ciepłej kuchni i dym z komina z sytuacji */
export function eventTick(st: GovState, i: GovInput, fx: GovEffects, busy: boolean): void {
  // okno z zapisu, którego gra już nie zna (zmieniona pula), znika zamiast blokować grę
  if (st.ev.active && !byId.has(st.ev.active.id)) st.ev.active = null;
  // pierwsze rozpalenie kozy widać zawsze; dym tylko wtedy, gdy stało się pierwszego dnia albo pierwszej nocy
  if (st.ev.lit === undefined && i.kozaLit) st.ev.lit = firstNight(i) ? i.screen : -1;
  const quiet = calm(st, i);
  if (st.ev.active || busy) return;
  const h = makeHost(st, i, fx);
  if (dymWaits(st, h)) {
    const def = byId.get('dym');
    if (def && i.screen >= (st.ev.lit ?? 0) + DYM_DELAY && poraOf(i.hour)) show(st, i, fx, activate(st, h, def));
    return;
  }
  if (quiet || i.screen < st.ev.next || i.screen < (st.ev.warm ?? 0) + AFTER_WARM) return;
  const pora = poraOf(i.hour);
  if (!pora) return;
  st.ev.next = i.screen + nextGap(st, i.screen);
  const ev = pickGovEvent(st, h, pora, firstNight(i));
  // nic nie pasowało (pusta pula tej pory albo warunek wydarzenia): następna próba niedługo, nie po pełnym odstępie
  if (!ev) {
    st.ev.next = i.screen + RETRY;
    return;
  }
  show(st, i, fx, ev);
}

/** wydarzenie czeka na decyzję gracza; tytuł do kroniki */
function show(st: GovState, i: GovInput, fx: GovEffects, ev: ActiveEvent | null): void {
  if (!ev) return;
  st.ev.active = ev;
  st.ev.when = i.screen;
  const def = byId.get(ev.id)!;
  logGov(st, i, def.title(makeHost(st, i, fx), ev.d), false, fx);
}

export function eventView(
  st: GovState,
  i: GovInput,
): { id: string; title: Tx; text: Tx; choices: { label: Tx; ok: boolean }[] } | null {
  const ev = st.ev.active;
  const def = ev && byId.get(ev.id);
  if (!ev || !def) return null;
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
  const def = byId.get(ev.id);
  if (!def) {
    st.ev.active = null;
    return false;
  }
  const h = makeHost(st, i, fx, def, { d: ev.d, k });
  const c = def.choices(h, ev.d)[k];
  if (!c?.ok) return false;
  st.ev.active = null;
  logGov(st, i, txCat(def.title(h, ev.d), ': ', c.label, '.'), false, fx);
  c.run();
  decision(st, i, 'wydarzenie');
  // odstęp liczy się od decyzji, żeby wydarzenia nie przychodziły jedno za drugim
  st.ev.next = Math.max(st.ev.next, i.screen + nextGap(st, i.screen));
  return true;
}
