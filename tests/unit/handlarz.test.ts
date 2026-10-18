import { describe, expect, it } from 'vitest';
import { dayOf, hourOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import {
  firstVisit,
  HAGGLE_TICKS,
  OFFER_TIMES,
  priced,
  rollOffers,
  TRADER_FLEE,
  tickAt,
  WAIT_TICKS,
} from '../../src/sim/handlarz.ts';
import { commandFor, commandsAt, jobText } from '../../src/sim/orders.ts';
import { createSim, type Pawn, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const size = w.size;
const yard = new Set(w.fence.yard);
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const mat = (st: SimState, k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
const trader = (st: SimState): Pawn | undefined => st.pawns.find((p) => p.kind === 'handlarz');
const run = (sim: Sim, ok: () => boolean, max = 20000) => {
  let k = 0;
  for (; k < max && !ok(); k++) sim.step();
  return k;
};
/** gra z handlarzem, zegar na dzień 2 o 10:00 i wizyta od razu; zarząd syty i ciepły */
const visit = (seed = 3) => {
  const st = createSim(w, seed, { core: 2, obcy: true });
  const sim = new Sim(w, st);
  st.tick = tickAt(2, 10);
  st.obcy!.next = st.tick;
  for (const p of core(st)) {
    p.needs!.food = 100;
    p.needs!.warm = 100;
    p.needs!.rest = 100;
  }
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 10 * TICKS_PER_HOUR;
  return sim;
};
/** do chwili, w której handlarz czeka pod bramą */
const waiting = (sim: Sim) => run(sim, () => trader(sim.st)?.job?.phase === 1);
const put = (st: SimState, kind: string, n: number) => {
  const i = w.fence.yard.find((k) => !st.things.some((t) => t.x === k % size && t.y === Math.floor(k / size)))!;
  st.things.push({
    id: st.nextThing++,
    kind,
    x: i % size,
    y: Math.floor(i / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  } as Thing);
};

describe('Handlarz: włączanie i wizyty', () => {
  it('bez opcji nie ma handlarza ani pola w stanie; polecenie obcy go włącza, w trybie zombie przychodzi później', () => {
    const st = createSim(w, 3, { core: 2 });
    expect('obcy' in st).toBe(false);
    const sim = new Sim(w, st);
    sim.push({ t: 'obcy', ids: [] });
    sim.step();
    expect(st.obcy?.next).toBeGreaterThan(0);
    expect(dayOf(st.obcy!.next)).toBe(2);
    // w trybie zombie handlarz jest, ale rzadko (tests/unit/obcy-zombie.test.ts)
    const z = createSim(w, 3, { core: 2, mode: 'zombie', obcy: true });
    expect(dayOf(z.obcy!.next)).toBe(4);
  });

  it('z opcją pierwsza wizyta drugiego dnia między 10:00 a 12:00, ta sama przy tym samym ziarnie', () => {
    const a = createSim(w, 3, { core: 2, obcy: true });
    const b = createSim(w, 3, { core: 2, obcy: true });
    expect(a.obcy!.next).toBe(b.obcy!.next);
    expect(dayOf(a.obcy!.next)).toBe(2);
    expect(hourOf(a.obcy!.next)).toBeGreaterThanOrEqual(10);
    expect(hourOf(a.obcy!.next)).toBeLessThan(12);
    // reszta startu jak bez opcji (losowanie terminu idzie na końcu)
    const c = createSim(w, 3, { core: 2 });
    expect(a.people).toEqual(c.people);
    expect(a.pawns).toEqual(c.pawns);
  });

  it('towar: trzy oferty po dwa razy, pierwsza kupuje złom, ten sam przy tym samym stanie losowania', () => {
    const o1 = rollOffers({ s: 77 });
    expect(o1).toEqual(rollOffers({ s: 77 }));
    expect(o1).toHaveLength(3);
    expect(o1[0].take.zlom).toBeGreaterThan(0);
    for (const o of o1) expect(o.left).toBe(OFFER_TIMES);
    // różne stany losowania dają różny towar
    const kinds = new Set(Array.from({ length: 30 }, (_, k) => JSON.stringify(rollOffers({ s: k }))));
    expect(kinds.size).toBeGreaterThan(5);
    expect(firstVisit({ s: 5 })).toBeGreaterThan(0);
  });

  it('przychodzi z daleka po stronie ulicy, staje przy bramie z wózkiem, czeka do 3 godzin i odchodzi', () => {
    const sim = visit();
    const st = sim.st;
    sim.step();
    const t = trader(st)!;
    expect(t).toBeDefined();
    expect(st.obcy!.trader).toBe(t.id);
    expect(st.obcy!.offers).toHaveLength(3);
    expect(yard.has(Math.floor(t.y) * size + Math.floor(t.x))).toBe(false);
    waiting(sim);
    const cart = st.things.find((q) => q.kind === 'wozek')!;
    expect(cart.n).toBe(1);
    expect(yard.has(cart.y * size + cart.x)).toBe(false);
    // stoi tuż przy bramie, po stronie ulicy
    const g = w.fence.gate;
    expect(Math.abs(Math.floor(t.x) - g.x) + Math.abs(Math.floor(t.y) - g.y)).toBeLessThan(4);
    const t0 = st.tick;
    run(sim, () => trader(st)?.job?.phase !== 1);
    expect(st.tick - t0).toBeLessThanOrEqual(WAIT_TICKS + 1);
    expect(st.things.some((q) => q.kind === 'wozek')).toBe(false);
    run(sim, () => !trader(st));
    expect(st.obcy!.trader).toBe(-1);
    expect(st.obcy!.offers).toEqual([]);
    expect(dayOf(st.obcy!.next) - dayOf(t0)).toBeGreaterThanOrEqual(2);
    expect(dayOf(st.obcy!.next) - dayOf(t0)).toBeLessThanOrEqual(3);
  });

  it('termin w nocy przesuwa się na ranek', () => {
    const st = createSim(w, 3, { core: 2, obcy: true });
    const sim = new Sim(w, st);
    st.tick = tickAt(2, 22);
    st.obcy!.next = st.tick;
    sim.step();
    expect(trader(st)).toBeUndefined();
    expect(dayOf(st.obcy!.next)).toBe(3);
    expect(hourOf(st.obcy!.next)).toBeGreaterThanOrEqual(9);
  });

  it('zapis i wczytanie w trakcie wizyty nie zmienia przebiegu', () => {
    const sim = visit();
    waiting(sim);
    const copy = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    for (let k = 0; k < 4 * TICKS_PER_HOUR; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});

describe('Handlarz: wymiana i napaść', () => {
  it('menu na handlarzu: oferty, wyszarzona bez materiału z powodem, napaść z potwierdzeniem; domyślnego nie ma', () => {
    const sim = visit();
    const st = sim.st;
    waiting(sim);
    for (const t of st.things.filter((q) => ['zlom', 'czesci', 'leki', 'drewno', 'jedzenie', 'deski'].includes(q.kind)))
      t.n = 0;
    st.things = st.things.filter(
      (t) => t.n > 0 || !['zlom', 'czesci', 'leki', 'drewno', 'jedzenie', 'deski'].includes(t.kind),
    );
    const t = trader(st)!;
    const ids = core(st).map((p) => p.id);
    const tile = Math.floor(t.y) * size + Math.floor(t.x);
    const menu = commandsAt(st, w, ids, tile);
    const offers = menu.filter((m) => m.cmd.t === 'trade');
    expect(offers).toHaveLength(3);
    for (const m of offers) {
      expect(m.label.startsWith('Dać ')).toBe(true);
      expect(m.off?.startsWith('brakuje ')).toBe(true);
    }
    expect(menu.find((m) => m.cmd.t === 'rob')).toMatchObject({ label: 'Napaść na handlarza', confirm: true });
    expect(commandFor(st, w, ids, tile)?.t).toBe('move');
    // na wózku to samo
    const cart = st.things.find((q) => q.kind === 'wozek')!;
    expect(commandsAt(st, w, ids, cart.y * size + cart.x).filter((m) => m.cmd.t === 'trade')).toHaveLength(3);
  });

  it('wymiana: osoba idzie na podwórko pod bramę, targuje się, nasz materiał schodzi, towar na podwórku, oferta mniej', () => {
    const sim = visit();
    const st = sim.st;
    waiting(sim);
    const o = st.obcy!.offers[0];
    for (const [m, n] of Object.entries(o.take)) put(st, m, n * 2);
    const before = Object.fromEntries(
      ['zlom', 'deski', 'czesci', 'jedzenie', 'leki', 'drewno'].map((k) => [k, mat(st, k)]),
    );
    const p = core(st)[0];
    const ids = [p.id];
    const t = trader(st)!;
    const item = commandsAt(st, w, ids, Math.floor(t.y) * size + Math.floor(t.x)).find(
      (m) => m.cmd.t === 'trade' && (m.cmd as { offer: number }).offer === 0,
    )!;
    expect(item.off).toBeUndefined();
    sim.push(item.cmd);
    run(sim, () => p.job?.t === 'trade' && p.job.phase === 1);
    expect(yard.has(Math.floor(p.y) * size + Math.floor(p.x))).toBe(true);
    expect(jobText(st, w, p)).toBe('Targuje się z handlarzem.');
    const t0 = st.tick;
    run(sim, () => p.job?.t !== 'trade');
    expect(st.tick - t0).toBeGreaterThanOrEqual(HAGGLE_TICKS - 1);
    for (const [m, n] of Object.entries(o.take)) expect(before[m] - mat(st, m)).toBe(n);
    for (const [m, n] of Object.entries(o.give)) expect(mat(st, m) - before[m]).toBe(n);
    expect(st.obcy!.offers[0].left).toBe(OFFER_TIMES - 1);
  });

  /** napaść do chwili, w której handlarz staje do walki */
  const robbed = () => {
    const sim = visit();
    const st = sim.st;
    waiting(sim);
    const p = core(st)[0];
    sim.push({ t: 'rob', ids: [p.id] });
    run(sim, () => st.obcy!.napad >= 0);
    return { sim, st, p, t: trader(st)! };
  };

  it('napaść: handlarz rzuca wózek i staje do walki z siekierą jako wróg; towar za siatką, nastroje, napastnik walczy', () => {
    const sim = visit();
    const st = sim.st;
    waiting(sim);
    const goods: Record<string, number> = {};
    for (const o of st.obcy!.offers)
      for (const [m, n] of Object.entries(o.give)) goods[m] = (goods[m] ?? 0) + n * o.left;
    const before = Object.fromEntries(Object.keys(goods).map((k) => [k, mat(st, k)]));
    const p = core(st)[0];
    sim.push({ t: 'rob', ids: [p.id] });
    run(sim, () => st.obcy!.napad >= 0);
    const t = trader(st)!;
    expect(t.wrogi).toBe(true);
    expect(t.weapon).toBe('siekiera');
    expect(t.job?.phase).toBe(5);
    expect(jobText(st, w, t)).toBe('Walczy z siekierą.');
    expect(st.obcy!.offers).toEqual([]);
    expect(st.obcy!.napady).toHaveLength(1);
    for (const [m, n] of Object.entries(goods)) expect(mat(st, m) - before[m]).toBe(n);
    const cart = st.things.find((q) => q.kind === 'wozek')!;
    expect(cart.n).toBe(0);
    expect(p.moods.find((m) => m.why === 'Napadliśmy na handlarza')?.d).toBe(-6);
    expect(core(st)[1].moods.find((m) => m.why === 'Napadliśmy na handlarza')?.d).toBe(-3);
    expect(p.job?.t).toBe('fight');
    const menu = commandsAt(st, w, [p.id], Math.floor(t.y) * size + Math.floor(t.x));
    expect(menu.some((m) => m.label === 'Atakuj handlarza')).toBe(true);
    expect(menu.some((m) => m.cmd.t === 'trade')).toBe(false);
    // łup da się nieść na podwórko
    const heap = st.things.find(
      (q) => q.kind in goods && !yard.has(q.y * size + q.x) && Math.hypot(q.x - cart.x, q.y - cart.y) < 5,
    )!;
    expect(commandsAt(st, w, [p.id], heap.y * size + heap.x).some((m) => m.cmd.t === 'carry')).toBe(true);
  });

  it('wrogi handlarz oddaje: zarząd obrywa', () => {
    const { sim, st, p } = robbed();
    p.weapon = null;
    run(sim, () => core(st).some((q) => (q.needs?.health ?? 100) < 100), 4000);
    expect(core(st).some((q) => (q.needs?.health ?? 100) < 100)).toBe(true);
  });

  it('ucieczka: wieść u handlarzy (ceny w górę, wizyty rzadziej), napis, następny przyjdzie', () => {
    const { sim, st, t } = robbed();
    const day = dayOf(st.tick);
    t.hp = TRADER_FLEE - 1;
    sim.step();
    expect(t.job?.phase).toBe(3);
    run(sim, () => !trader(st));
    expect(st.obcy!.trader).toBe(-1);
    expect(st.obcy!.slawa?.lvl).toBe(1);
    expect(dayOf(st.obcy!.next) - day).toBeGreaterThanOrEqual(4);
    expect(st.obcy!.wiesc?.text.startsWith('Handlarz uciekł')).toBe(true);
    if (st.obcy!.zemsta) {
      const h = hourOf(st.obcy!.zemsta.at);
      expect(h >= 22 || h < 1).toBe(true);
      expect(st.obcy!.zemsta.n).toBeGreaterThanOrEqual(3);
    }
  });

  it('zabity handlarz: bez wieści u handlarzy, następny 3 dni później niż zwykle, zgon jako obcy', () => {
    const { sim, st, t } = robbed();
    const day = dayOf(st.tick);
    sim.wound(t, 500);
    sim.step();
    expect(trader(st)).toBeUndefined();
    expect(st.obcy!.trader).toBe(-1);
    expect(st.obcy!.slawa).toBeUndefined();
    expect(dayOf(st.obcy!.next) - day).toBeGreaterThanOrEqual(5);
    expect(st.obcy!.wiesc?.text).toBe('Handlarz nie żyje. Jego towar jest wasz.');
    expect(st.dead!.at(-1)).toMatchObject({ kind: 'handlarz', name: 'Handlarz' });
    for (const q of core(st)) expect(q.moods.some((m) => m.why.startsWith('Śmierć'))).toBe(false);
    expect(st.store.arms).toContain('siekiera');
  });

  it('zła sława: ceny razy 1 + 0,5 × poziom, poziom spada po 15 dniach', () => {
    const o = rollOffers({ s: 9 })[0];
    const p2 = priced(o, 2);
    for (const [m, n] of Object.entries(o.take)) expect(p2.take[m as keyof typeof o.take]).toBe(Math.ceil(n * 2));
    expect(priced(o, 0)).toBe(o);
    const sim = visit();
    const st = sim.st;
    st.obcy!.slawa = { lvl: 2, until: st.tick + 10 * 24 * TICKS_PER_HOUR };
    sim.step();
    for (const off of st.obcy!.offers) for (const n of Object.values(off.take)) expect(n % 2).toBe(0);
    st.obcy!.slawa.until = st.tick;
    sim.step();
    expect(st.obcy!.slawa.lvl).toBe(1);
  });

  it('posiłki: ludzie handlarza nocą pod siatką jako wrogowie z bronią, napis, o 4:00 odchodzą', () => {
    const st = createSim(w, 3, { core: 2, obcy: true });
    const sim = new Sim(w, st);
    st.tick = tickAt(2, 22);
    st.obcy!.next = tickAt(30, 10);
    st.obcy!.wnext = tickAt(30, 10);
    st.obcy!.enext = tickAt(30, 10);
    st.obcy!.zemsta = { at: st.tick, n: 3 };
    sim.step();
    const men = st.pawns.filter((q) => q.kind === 'zbir');
    expect(men).toHaveLength(3);
    for (const m of men) {
      expect(m.wrogi).toBe(true);
      expect(['kij', 'lom', 'noz']).toContain(m.weapon);
    }
    expect(st.obcy!.zemsta).toBeUndefined();
    expect(st.obcy!.wiesc?.text).toBe('Wracają ludzie handlarza: 3 osoby z pałkami pod siatką.');
    run(sim, () => !st.pawns.some((q) => q.kind === 'zbir'), 8 * TICKS_PER_HOUR);
    expect(st.pawns.some((q) => q.kind === 'zbir')).toBe(false);
    expect(hourOf(st.tick) < 5 || hourOf(st.tick) >= 22).toBe(true);
  });
});
