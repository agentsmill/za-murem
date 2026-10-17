/* Interfejs M1 bez przeglądarki: adapter skutków zarządu, siatka dla zarządu, cele dnia, treść okien,
   pasek stanu, karta osoby, zapis i spięcie symulacji z zarządem przez pierwszą noc jak w main.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { KOZA_KEY } from '../../src/gov/noc.ts';
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
import { applyGov } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
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
  oddsHtml,
  optionDetail,
  optionShort,
  plural,
  reportSheet,
} from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { govFence, govLight } from '../../src/ui/siatka.ts';
import { deg, esc, num, pct, signed } from '../../src/ui/tekst.ts';
import { clearSave, readSave, SAVE_KEY, type Save, saveLabel, worldKey, writeSave } from '../../src/ui/zapis.ts';
import { crownOf, markSpot, under } from '../../src/ui/znacznik.ts';
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

describe('etykieta suchego drzewa', () => {
  /** kafelki pod prostokątem napisu (bez zapasu) i wiersz niżej, gdzie stoją ludzie i rzeczy */
  const tilesUnder = ([x0, y0, x1, y1]: readonly number[]) => {
    const out: [number, number][] = [];
    for (let y = Math.floor(y0); y <= Math.floor(y1) + 1; y++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) out.push([x, y]);
    return out;
  };
  const gateAt = (w: World, x: number, y: number) => {
    const g = w.fence.gate;
    return x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h;
  };
  const fenceAt = (w: World, x: number, y: number) => w.fence.tiles.includes(y * w.size + x);
  const propAt = (w: World, x: number, y: number) =>
    w.props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);

  for (const [screen, sides] of [
    ['komputer', undefined],
    ['telefon', ['n', 's']],
  ] as const)
    it.each(DEMOS)(
      `%s, ${screen}: pod napisem ani bramy, siatki, rzeczy, ani budynków; ogonek w stronę korony`,
      (key) => {
        const { w } = demo(key);
        const spot = markSpot(w, sides)!;
        expect(spot.under).toBe(0);
        if (sides) expect(sides).toContain(spot.side);
        for (const [x, y] of tilesUnder(spot.rect)) {
          expect(gateAt(w, x, y), `brama ${x},${y}`).toBe(false);
          expect(fenceAt(w, x, y), `siatka ${x},${y}`).toBe(false);
          expect(propAt(w, x, y), `rzecz ${x},${y}`).toBe(false);
          if (y <= Math.floor(spot.rect[3])) expect(w.bid[y * w.size + x], `budynek ${x},${y}`).toBe(-1);
        }
        // ogonek celuje w koronę: napis leży po tej stronie korony, którą mówi side, kreska najwyżej 3,5 m
        const c = crownOf(w)!;
        if (spot.side === 'e') expect(spot.x).toBeGreaterThan(c.x);
        if (spot.side === 'w') expect(spot.x).toBeLessThan(c.x);
        if (spot.side === 'n') expect(spot.y).toBeLessThan(c.y);
        if (spot.side === 's') expect(spot.y).toBeGreaterThan(c.y);
        expect(spot.lead).toBeLessThanOrEqual(3.5);
        // liczona raz dla świata: te same dane, to samo miejsce
        expect(markSpot(w, sides)).toEqual(spot);
      },
    );

  it('brama albo siatka pod wybranym miejscem przestawiają etykietę gdzie indziej', () => {
    for (const key of DEMOS) {
      const { w } = demo(key);
      const spot = markSpot(w)!;
      // brama dokładnie pod środkiem napisu
      const mx = Math.floor((spot.rect[0] + spot.rect[2]) / 2);
      const my = Math.floor((spot.rect[1] + spot.rect[3]) / 2);
      const moved = { ...w, fence: { ...w.fence, gate: { x: mx, y: my, w: 2, h: 1, rot: 0 as const } } };
      const again = markSpot(moved)!;
      expect(again.under, key).toBe(0);
      expect(
        tilesUnder(again.rect).some(([x, y]) => gateAt(moved, x, y)),
        key,
      ).toBe(false);
      // siatka wzdłuż całego napisu
      const extra = tilesUnder(spot.rect).map(([x, y]) => y * w.size + x);
      const fenced = { ...w, fence: { ...w.fence, tiles: [...w.fence.tiles, ...extra] } };
      const third = markSpot(fenced)!;
      expect(third.under, key).toBe(0);
      expect(
        tilesUnder(third.rect).some(([x, y]) => fenceAt(fenced, x, y)),
        key,
      ).toBe(false);
    }
  });

  it('śmieci w mieszkaniach (rzeczy w budynkach) nie liczą się pod etykietą, rzeczy na podwórku tak', () => {
    const { w } = demo('przymorze');
    const at = (p: { x: number; y: number }) => w.bid[p.y * w.size + p.x];
    const inside = w.props.find((p) => p.kind === 'smieci' && at(p) >= 0)!;
    expect(inside).toBeTruthy();
    const r1 = [inside.x, inside.y, inside.x + 1, inside.y + 1] as const;
    expect(under(w, r1)).toBe(under({ ...w, props: w.props.filter((p) => p !== inside) }, r1));
    const outside = w.props.find((p) => at(p) < 0)!;
    const r2 = [outside.x, outside.y, outside.x + 1, outside.y + 1] as const;
    expect(under(w, r2)).toBeGreaterThan(under({ ...w, props: w.props.filter((p) => p !== outside) }, r2));
  });

  it('bez suchego drzewa nie ma etykiety', () => {
    const { w } = demo('przymorze');
    expect(markSpot({ ...w, dryTree: -1 })).toBeNull();
    expect(crownOf({ ...w, dryTree: -1 })).toBeNull();
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

describe('dyżur przy kozie', () => {
  it('karta nocy, posterunek w symulacji, pasek i raport rano o kuchni', () => {
    const { sim, w, seed } = fresh();
    sim.st.tick = tickAt(20);
    // od 20:00 do 6:00 koza zje 20 sztuk (2 na godzinę); 40 w zapasie, bo szabrownicy mogą część wynieść
    const wood = emptyEffects();
    wood.stock.wood = 40;
    applyGov(sim.st, w, wood);
    const gov = newGov(seed);
    govUpdate(gov, input(sim, 100));
    signLaw(gov, input(sim, 100), null);
    const p = pending(gov, input(sim, 100));
    if (p?.k !== 'karta') throw new Error(`zamiast karty: ${p?.k}`);
    const i = input(sim, 100);
    const who = p.card.people[0];
    const koza = who.options.find((o) => o.key === KOZA_KEY)!;
    expect(optionShort(koza, false)).toBe('Czuwa przy kozie');
    expect(optionDetail(koza)).toBe('Nie śpi i pilnuje ognia w kozie, drewna starczy do rana.');
    expect(p.card.wood).toEqual({ have: 40, need: 20, until: '6:00' });
    // pas „Koza w nocy”: bez dyżuru zgaśnie, z dyżurem do rana; dyżur nie odstrasza szabrowników
    const none = Object.fromEntries(p.card.people.map((c) => [c.id, 'sen']));
    const duty = { ...none, [who.id]: KOZA_KEY };
    const names = { [who.id]: who.name };
    expect(nightSheet(p.card, none, nightOdds(gov, i, p.card, none)).body).toContain(
      '<small class="odd-k">Koza w nocy</small><b class="odd-v">zgaśnie</b><em class="odd-note">nikt nie czuwa · drewno 40 szt., noc zje 20 (2 na godzinę)',
    );
    expect(oddsHtml(p.card, duty, nightOdds(gov, i, p.card, duty), names)).toContain(
      `<b class="odd-v">do rana</b><em class="odd-note">czuwa ${esc(who.name)} · drewno 40 szt., noc zje 20`,
    );
    expect(nightOdds(gov, i, p.card, duty).now).toBe(nightOdds(gov, i, p.card, none).now);
    // zatwierdzenie: osoba idzie do kozy (posterunek 'koza' w odczycie), pasek o tym mówi
    for (const c of p.card.people) setNight(gov, c.id, c.id === who.id ? KOZA_KEY : 'sen');
    applyGov(sim.st, w, confirmNight(gov, input(sim, 100)));
    for (let t = 0; t < TICKS_PER_SECOND * 5; t++) sim.step();
    const snap = snapshot(sim.st, w);
    expect(snap.people.find((q) => q.id === who.id)?.post).toBe('koza');
    expect(statsOf(snap, gov).find((x) => x.id === 'sFire')?.title).toContain(
      `Przy kozie czuwa ${who.name}: dokłada do rana.`,
    );
    // noc z zarządem do raportu
    let screen = 100;
    for (let t = 0; t < 12 * TICKS_PER_HOUR && !gov.reports.length; t++) {
      sim.step();
      if (sim.st.tick % TICKS_PER_SECOND) continue;
      screen++;
      applyGov(sim.st, w, govUpdate(gov, input(sim, screen)));
      const q = pending(gov, input(sim, screen));
      if (q?.k === 'wydarzenie')
        applyGov(
          sim.st,
          w,
          chooseEvent(
            gov,
            input(sim, screen),
            Math.max(
              0,
              q.choices.findIndex((c) => c.ok),
            ),
          ),
        );
    }
    const r = gov.reports[0];
    expect(r).toBeDefined();
    expect(r.koza).toEqual([who.name]);
    expect(r.fire).toBeGreaterThan(0.9);
    expect(r.kitchen).toBeGreaterThanOrEqual(18);
    expect(r.lines).toContain(
      `${who.name} ${who.name.split(' ')[0].endsWith('a') ? 'czuwała' : 'czuwał'} przy kozie i ogień palił się całą noc. Rano w kuchni ciepło, ${Math.round(r.kitchen!)}°C.`,
    );
    expect(reportSheet(r).body).toContain(
      `<li class="tal good"><small class="tal-k">Kuchnia rano</small><b>${Math.round(r.kitchen!)}°C, przy kozie ${esc(who.name)}</b></li>`,
    );
  });
});

describe('pasek i karta osoby', () => {
  it('stan osiedla na starcie: zimna kuchnia, brak drewna', () => {
    const { sim, w, seed } = fresh();
    const s = statsOf(snapshot(sim.st, w), newGov(seed));
    expect(s.map((x) => x.id)).toEqual([
      'sOut',
      'sKit',
      'sFire',
      'sWood',
      'sBoards',
      'sScrap',
      'sParts',
      'sMats',
      'sFood',
      'sTrust',
      'sAnger',
    ]);
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
