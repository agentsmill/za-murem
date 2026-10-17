/* Interfejs M1 bez przeglądarki: adapter skutków zarządu, siatka dla zarządu, cele dnia, treść okien,
   pasek stanu, karta osoby, zapis i spięcie symulacji z zarządem przez pierwszą noc jak w main.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import type { GovInput, GovState, Prompt } from '../../src/gov/typy.ts';
import { emptyEffects, gameMin, QUIET } from '../../src/gov/wspolne.ts';
import { eventTick, M1_EVENTS, RETRY } from '../../src/gov/wydarzenia.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  newGov,
  pending,
  setNight,
  signLaw,
} from '../../src/gov/zarzad.ts';
import { START_MINUTES, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { createSim, Sim, type SimState, STACK } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { currentGoal, goalsOf, markTree } from '../../src/ui/cele.ts';
import { needLevel, personCard } from '../../src/ui/karta.ts';
import {
  burnSheet,
  eventSheet,
  lawSheet,
  lootText,
  nightOdds,
  nightSheet,
  optionDetail,
  plural,
  reportSheet,
} from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { govFence, govLight } from '../../src/ui/siatka.ts';
import { applyGov } from '../../src/ui/skutki.ts';
import { deg, esc, num, pct, signed } from '../../src/ui/tekst.ts';
import { clearSave, readSave, SAVE_KEY, type Save, saveLabel, worldKey, writeSave } from '../../src/ui/zapis.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const DEMOS = ['przymorze', 'lanciego', 'zielonki'];
const cache = new Map<string, { w: World; seed: number; data: Save['data'] }>();
/** demo gry z ziarnem z adresu, jak w przeglądarce */
function demo(key: string) {
  let c = cache.get(key);
  if (!c) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
    c = {
      w: buildWorld(d.geo, { seed, street: d.street }),
      seed,
      data: { geo: d.geo, name: d.name, addr: d.addr, street: d.street, src: 'demo' },
    };
    cache.set(key, c);
  }
  return c;
}
const fresh = (key = 'przymorze', crowd = 0) => {
  const { w, seed } = demo(key);
  return { w, seed, sim: new Sim(w, createSim(w, seed, { core: 4, crowd })) };
};
/** tick dla godziny dnia 1 (z ułamkiem) */
const tickAt = (h: number) => Math.round(((h * 60 - START_MINUTES) / 60) * TICKS_PER_HOUR);
const input = (sim: Sim, screen: number): GovInput => ({
  ...snapshot(sim.st, sim.w),
  screen,
  fence: govFence(sim.w),
  light: govLight(sim.st),
  hqName: 'Siedziba',
});

describe('teksty', () => {
  it('liczby po polsku z prawdziwym minusem', () => {
    expect(num(1.5)).toBe('1,5');
    expect(num(-2)).toBe('−2');
    expect(num(-0.04)).toBe('0');
    expect(signed(0)).toBe('0');
    expect(signed(2.25)).toBe('+2,3');
    expect(signed(-1.5)).toBe('−1,5');
    expect(deg(-3.4)).toBe('−3°C');
    expect(pct(0.333)).toBe('33%');
    expect(esc('<a "b">&')).toBe('&lt;a &quot;b&quot;&gt;&amp;');
  });
  it('odmiana sztuk', () => {
    expect([1, 2, 4, 5, 12, 14, 22, 25].map((n) => plural(n, 'sztukę', 'sztuki', 'sztuk'))).toEqual([
      'sztukę',
      'sztuki',
      'sztuki',
      'sztuk',
      'sztuk',
      'sztuk',
      'sztuki',
      'sztuk',
    ]);
    expect(lootText({ wood: -3, supplies: 0, scrap: 2 })).toBe('drewno 3, złom 2');
  });
});

describe('adapter skutków zarządu (do podmiany na applyGov z src/sim)', () => {
  it('drewno z wyprawy idzie na skład, kradzież najpierw z drewna luzem', () => {
    const { sim, w } = fresh();
    const st = sim.st;
    const fx = emptyEffects();
    fx.stock.wood = 13;
    applyGov(st, w, fx);
    let s = snapshot(st, w).stock;
    expect(s.woodSklad).toBe(13);
    expect(st.things.filter((t) => t.kind === 'drewno').every((t) => t.n <= STACK)).toBe(true);
    // stos luzem na podwórku
    const yard = w.fence.yard.find((i) => !w.blocked[i] && !st.things.some((t) => t.y * w.size + t.x === i))!;
    st.things.push({
      id: st.nextThing++,
      kind: 'drewno',
      x: yard % w.size,
      y: Math.floor(yard / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 4,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    const steal = emptyEffects();
    steal.stock.wood = -6;
    applyGov(st, w, steal);
    s = snapshot(st, w).stock;
    expect(s.woodLoose).toBe(0);
    expect(s.woodSklad).toBe(11);
    expect(st.things.some((t) => t.kind === 'drewno' && t.n <= 0)).toBe(false);
  });

  it('jedzenie, potrzeby i nastroje', () => {
    const { sim, w } = fresh();
    const st = sim.st;
    const food0 = snapshot(st, w).stock.supplies;
    const fx = emptyEffects();
    fx.stock.supplies = 5;
    const who = st.people[0].id;
    const pawn = st.pawns.find((p) => p.person === 0)!;
    const rest0 = pawn.needs!.rest;
    fx.needs.push({ id: who, d: { rest: -30, health: -500 } });
    fx.moods.push({ id: who, why: 'Całą noc na warcie', d: -2, hours: 8 });
    fx.moods.push({ id: who, why: 'Całą noc na warcie', d: -2, hours: 12 });
    applyGov(st, w, fx);
    expect(snapshot(st, w).stock.supplies).toBe(food0 + 5);
    expect(pawn.needs!.rest).toBe(Math.max(0, rest0 - 30));
    expect(pawn.needs!.health).toBe(0);
    expect(pawn.moods).toEqual([{ why: 'Całą noc na warcie', d: -2, until: st.tick + 12 * TICKS_PER_HOUR }]);
    const eat = emptyEffects();
    eat.stock.supplies = -1000;
    applyGov(st, w, eat);
    expect(snapshot(st, w).stock.supplies).toBe(0);
  });
});

describe('siatka dla zarządu', () => {
  it.each(DEMOS)('%s: dziury ze świata z nazwą i wielkością', (key) => {
    const { w } = demo(key);
    const f = govFence(w)!;
    expect(f.holes.length).toBe(w.fence.hole.length);
    expect(f.holes.length).toBeGreaterThanOrEqual(2);
    expect(f.holes.map((h) => h.id)).toEqual(f.holes.map((_, k) => k + 1));
    for (const h of f.holes) {
      expect(h.size).toBeGreaterThanOrEqual(0.4);
      expect(h.size).toBeLessThanOrEqual(0.85);
      expect(h.name).toMatch(/^(od |za trzepakiem|przy suchym drzewie)/);
    }
    expect(new Set(f.holes.map((h) => h.name)).size).toBe(f.holes.length);
    expect(govFence(w)).toEqual(f);
  });
  it('bez siatki w świecie zarząd sam zakłada dziurę', () => {
    expect(govFence({ size: 10, seed: 1 })).toBeUndefined();
  });
});

describe('cele pierwszego dnia', () => {
  it('kroki samouczka po kolei, zaznaczenie od razu, noc po raporcie', () => {
    const { sim } = fresh();
    const st = sim.st;
    const o = { touch: false, kitchen: 9, hour: 15 };
    let g = goalsOf(st, null, o);
    expect(g.map((x) => x.key)).toEqual([...TUT_STEPS, 'drewno', 'noc']);
    expect(currentGoal(g)?.key).toBe('zaznacz');
    expect(currentGoal(goalsOf(st, null, { ...o, selected: true }))?.key).toBe('rozkaz');
    expect(goalsOf(st, null, { ...o, touch: true })[0].how).not.toBe(g[0].how);
    expect(markTree(st)).toBe(true);
    st.tut.step = 3;
    g = goalsOf(st, null, o);
    expect(g.filter((x) => x.done).map((x) => x.key)).toEqual(['zaznacz', 'rozkaz', 'sciete']);
    expect(markTree(st)).toBe(false);
    st.tut.step = 5;
    expect(currentGoal(goalsOf(st, null, o))?.how).toContain('W kuchni teraz 9°C');
    st.tut.step = TUT_STEPS.length;
    const gov = newGov(1);
    // drewno na noc: postęp w podpowiedzi, zaliczone raz osiągnięte, przepada z kartą nocy
    const wood = currentGoal(goalsOf(st, gov, { ...o, wood: 2 }))!;
    expect(wood.key).toBe('drewno');
    expect(wood.how).toContain('Drewna na zapas: 2 z 6');
    expect(currentGoal(goalsOf(st, gov, { ...o, wood: 1, woodReady: true }))?.key).toBe('noc');
    gov.night = { confirmed: true } as GovState['night'];
    const lapsed = goalsOf(st, gov, o).find((x) => x.key === 'drewno')!;
    expect(lapsed).toMatchObject({ done: true, missed: true });
    gov.night = null;
    gov.reports.push({} as GovState['reports'][number]);
    expect(currentGoal(goalsOf(st, gov, o))).toBeNull();
    st.tut.step = -1;
    expect(goalsOf(st, gov, o).map((x) => x.key)).toEqual(['noc']);
  });
});

/** sim o 20:00 pierwszego dnia z kartą nocy (uchwała odłożona) */
function atCard() {
  const { sim, w, seed } = fresh();
  sim.st.tick = tickAt(20);
  const gov = newGov(seed);
  govUpdate(gov, input(sim, 100));
  signLaw(gov, input(sim, 100), null);
  const p = pending(gov, input(sim, 100));
  if (p?.k !== 'karta') throw new Error(`zamiast karty: ${p?.k}`);
  return { sim, w, gov, p };
}

describe('okna zarządu', () => {
  it('karta nocy: każda osoba, każda opcja z ryzykiem i zyskiem przed decyzją', () => {
    const { sim, gov, p } = atCard();
    const i = input(sim, 100);
    const html = nightSheet(p.card, p.assign, nightOdds(gov, i, p.card, p.assign)).body;
    for (const c of p.card.people) {
      expect(html).toContain(esc(c.name));
      for (const o of c.options) expect(html).toContain(`value="${o.key}"`);
    }
    expect(html).toMatch(/ryzyko \d+%/);
    expect(html).toMatch(/drewno \d+–\d+/);
    expect(html).toContain('data-odds');
    const exp = p.card.people[0].options.find((o) => o.key === 'wyprawa:blisko')!;
    expect(optionDetail(exp)).toMatch(/^Ryzyko kłopotów \d+%\. Może przynieść: /);
    // warta odstrasza: z jedną osobą przy siatce szansa spada
    const none = Object.fromEntries(p.card.people.map((c) => [c.id, 'sen']));
    const one = { ...none, [p.card.people[0].id]: `warta:${p.card.posts[0].key}` };
    expect(nightOdds(gov, i, p.card, none).now).toBe(p.card.chance);
    expect(nightOdds(gov, i, p.card, one).now).toBeLessThan(p.card.chance);
    expect(setNight(gov, p.card.people[0].id, 'warta:brama')).toBe(true);
  });

  it('uchwała, wydarzenie, raport i palenie mebli', () => {
    const { sim, seed } = fresh();
    sim.st.tick = tickAt(19.5);
    const gov = newGov(seed);
    govUpdate(gov, input(sim, 50));
    const law = pending(gov, input(sim, 50)) as Extract<Prompt, { k: 'uchwala' }>;
    expect(law.k).toBe('uchwala');
    const s = lawSheet(law);
    expect(s.body.match(/data-act="law"/g)?.length).toBe(3);
    expect(s.foot).toContain('zaufanie −1');
    const ev = eventSheet({
      k: 'wydarzenie',
      id: 'x',
      title: 'Hałas <w nocy>',
      text: 'Raz.\nDwa.',
      choices: [
        { label: 'Tak', ok: true },
        { label: 'Nie', ok: false },
      ],
    });
    expect(ev.title).toBe('Hałas &lt;w nocy&gt;');
    expect(ev.body).toBe('<p>Raz.</p><p>Dwa.</p>');
    expect(ev.foot.match(/disabled/g)?.length).toBe(1);
    const zero = { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 };
    const r = reportSheet({
      day: 1,
      lines: ['Spokojna noc.'],
      raid: 'odparty',
      stolen: zero,
      loot: { ...zero, wood: 4 },
      hurt: [],
      tired: [],
      trust: 51.5,
      anger: 19,
      dTrust: 1.5,
      dAnger: -1,
    });
    expect(r.title).toBe('Napad odparty');
    expect(r.body).toContain('drewno 4');
    expect(r.body).toContain('+1,5');
    expect(r.body).toContain('−1');
    expect(burnSheet('mebloscianka', 'Anna Nowak', false).body).toContain('Da 6 sztuk drewna, około 3 h ognia');
    expect(burnSheet('krzeslo', null, true).body).toContain('łagodzi to o połowę');
  });
});

describe('rytm zarządu po playteście', () => {
  it('po uchwale, karcie i raporcie najbliższe wydarzenie najwcześniej po QUIET s (bez okien jedno po drugim)', () => {
    const { sim, seed } = fresh();
    sim.st.tick = tickAt(19.5);
    const gov = newGov(seed);
    gov.ev.next = 0;
    govUpdate(gov, input(sim, 180));
    signLaw(gov, input(sim, 181), 'u_warty');
    expect(gov.ev.next).toBeGreaterThanOrEqual(181 + QUIET);
    gov.report = {} as GovState['report'];
    gov.ev.next = 0;
    ackReport(gov, input(sim, 300));
    expect(gov.report).toBeNull();
    expect(gov.ev.next).toBe(300 + QUIET);
  });
  it('gdy żadne wydarzenie nie pasuje, następna próba po RETRY s, a nie po pełnym odstępie', () => {
    const { sim, seed } = fresh();
    sim.st.tick = tickAt(16);
    const gov = newGov(seed);
    const i = input(sim, 200);
    // wszystkie wydarzenia „przed chwilą”: żadne nie jest świeże
    for (const e of M1_EVENTS) gov.ev.last[e.id] = gameMin(i);
    gov.ev.next = 0;
    eventTick(gov, i, emptyEffects(), false);
    expect(gov.ev.active).toBeNull();
    expect(gov.ev.next).toBe(200 + RETRY);
  });
});

describe('pasek i karta osoby', () => {
  it('stan osiedla na starcie: zimna kuchnia, brak drewna', () => {
    const { sim, w, seed } = fresh();
    const s = statsOf(snapshot(sim.st, w), newGov(seed));
    expect(s.map((x) => x.id)).toEqual(['sOut', 'sKit', 'sFire', 'sWood', 'sFood', 'sTrust', 'sAnger']);
    const by = Object.fromEntries(s.map((x) => [x.id, x]));
    expect(by.sKit.level).toBe('bad');
    expect(by.sFire).toMatchObject({ value: 'zimna', level: 'bad' });
    expect(by.sWood).toMatchObject({ value: '0', level: 'bad' });
    expect(by.sTrust).toMatchObject({ value: '50', level: 'ok' });
    expect(statsOf(snapshot(sim.st, w), null).find((x) => x.id === 'sTrust')?.value).toBe('–');
  });
  it('karta: sześć potrzeb, nastroje od najgorszego, noc i robota', () => {
    const { sim, w } = fresh();
    const p = sim.st.pawns.find((q) => q.kind === 'core')!;
    p.moods.push({ why: 'Ciepły posiłek', d: 4, until: sim.st.tick + 100 });
    p.moods.push({ why: 'Spalili moje łóżko', d: -18, until: sim.st.tick + 100 });
    p.moods.push({ why: 'Stare', d: -1, until: sim.st.tick });
    const who = snapshot(sim.st, w).people.find((q) => q.pawn === p.id)!;
    const html = personCard(who, sim.st.tick, 'Tej nocy: warta przy bramie.');
    for (const n of ['Najedzenie', 'Ciepło', 'Siły', 'Zdrowie', 'Bezpieczeństwo', 'Nastrój']) expect(html).toContain(n);
    expect(html.indexOf('Spalili moje łóżko')).toBeLessThan(html.indexOf('Ciepły posiłek'));
    expect(html).not.toContain('Stare');
    expect(html).toContain('−18');
    expect(html).toContain('Tej nocy: warta przy bramie.');
    expect(html).toContain(esc(who.doing));
    expect([needLevel(10), needLevel(30), needLevel(80)]).toEqual(['bad', 'mid', 'ok']);
  });
});

describe('zapis gry', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it('zapis i odczyt ze stanem symulacji i zarządu; zła wersja i brak miejsca', () => {
    const { sim, seed } = fresh();
    const { data } = demo('przymorze');
    const gov = newGov(seed);
    const save: Save = { v: 1, at: 1, data, seed, sim: sim.st, gov, screen: 12.5 };
    const store = memory();
    expect(writeSave(save, store)).toBe(true);
    const back = readSave(store)!;
    expect(back.sim).toEqual(sim.st);
    expect(back.gov).toEqual(gov);
    expect(saveLabel(back)).toBe(`${data.name}, dzień 1, 15:00`);
    // wczytany stan daje tę samą symulację
    const again = new Sim(sim.w, back.sim);
    for (let k = 0; k < 200; k++) {
      sim.step();
      again.step();
    }
    expect(again.hash()).toBe(sim.hash());
    store.m.set(SAVE_KEY, JSON.stringify({ ...save, v: 2 }));
    expect(readSave(store)).toBeNull();
    store.m.set(SAVE_KEY, '{nie json');
    expect(readSave(store)).toBeNull();
    clearSave(store);
    expect(store.m.size).toBe(0);
    const full = {
      ...memory(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(writeSave(save, full)).toBe(false);
    expect(writeSave(save, null)).toBe(false);
  });
  it('odcisk świata: ten sam dla tego samego osiedla, inny dla innego', () => {
    const a = worldKey(demo('przymorze').w);
    expect(worldKey(demo('przymorze').w)).toBe(a);
    expect(worldKey(demo('zielonki').w)).not.toBe(a);
    const { w } = demo('przymorze');
    expect(worldKey({ ...w, trees: w.trees.slice(1) })).not.toBe(a);
  });
});

/** pętla jak w main.ts: symulacja, co sekundę przy ekranie zarząd i jego skutki, decyzje wg propozycji */
function firstNight(key: string) {
  const { sim, w, seed } = fresh(key, 6);
  const gov = newGov(seed);
  let screen = 0;
  const decisions: string[] = [];
  for (let t = 1; t < 2 * 24 * TICKS_PER_HOUR && !gov.reports.length; t++) {
    sim.step();
    if (t % TICKS_PER_SECOND) continue;
    screen++;
    applyGov(sim.st, w, govUpdate(gov, input(sim, screen)));
    for (let p = pending(gov, input(sim, screen)); p; p = pending(gov, input(sim, screen))) {
      decisions.push(p.k);
      const i = input(sim, screen);
      if (p.k === 'raport') ackReport(gov);
      else if (p.k === 'uchwala') applyGov(sim.st, w, signLaw(gov, i, p.options.find((o) => o.s === 'ok')?.id ?? null));
      else if (p.k === 'karta') applyGov(sim.st, w, confirmNight(gov, i));
      else
        applyGov(
          sim.st,
          w,
          chooseEvent(
            gov,
            i,
            Math.max(
              0,
              p.choices.findIndex((c) => c.ok),
            ),
          ),
        );
    }
  }
  return { sim, gov, decisions };
}

describe('pierwsza noc: symulacja z zarządem przez adapter', () => {
  it.each(DEMOS)('%s: uchwała, karta, raport rano, skutki w stanie gry', (key) => {
    const a = firstNight(key);
    const r = a.gov.reports[0];
    expect(r).toBeDefined();
    // wydarzenia przychodzą też po południu; zebranie, karta i raport po kolei
    expect(a.decisions.filter((k) => k !== 'wydarzenie')).toEqual(['uchwala', 'karta', 'raport']);
    const st: SimState = a.sim.st;
    expect(st.things.every((t) => Number.isInteger(t.n) && t.n >= 0)).toBe(true);
    for (const p of st.pawns.filter((q) => q.kind === 'core'))
      for (const v of Object.values(p.needs!)) expect(v).toBeGreaterThanOrEqual(0);
    // wartownicy mają nastrój z nocy na warcie
    if (r.tired.length) {
      const moods = st.pawns.flatMap((p) => p.moods.map((m) => m.why));
      expect(moods).toContain('Całą noc na warcie');
    }
    // deterministycznie: drugi przebieg daje ten sam stan
    const b = firstNight(key);
    expect(b.sim.hash()).toBe(a.sim.hash());
    expect(JSON.stringify(b.gov)).toBe(JSON.stringify(a.gov));
  });
});
