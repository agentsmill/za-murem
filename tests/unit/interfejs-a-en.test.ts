/* Interfejs, grupa A po angielsku (zadanie 5 w docs/superpowers/plans/2026-10-18-angielski.md): okna zarządu, menu,
   pomoc, koniec gry, pasek, cele dnia, przybysze, budowa i karta mieszkania z ustawJezyk('en') na tych samych
   atrapach co testy po polsku (interfejs.test.ts, interfejs-zombie.test.ts, budowa-ui.test.ts). Treść zarządu (nazwy
   posterunków, opcje karty nocy, uchwały, linie raportu, wydarzenia) tłumaczy inne zadanie, więc tu wchodzi jako Tx
   z zastępczym angielskim tekstem; po polsku okno z Tx wychodzi bajt w bajt takie samo jak ze zwykłym napisem. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ENDINGS_EN } from '../../src/content/data.en.ts';
import type { EndingId } from '../../src/content/data.ts';
import { type Tx, tr, tx, txOf, ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { BLOK, wordsEn, wordsOf } from '../../src/gov/miejsce.ts';
import { KOZA_KEY, makeCard } from '../../src/gov/noc.ts';
import type { GovInput, LawOption, NightCard, NightReport, Prompt } from '../../src/gov/typy.ts';
import { govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { BUILDS_EN, effectEnOf } from '../../src/sim/budowle.en.ts';
import { BUILDS, type BuildKind, canPlace, type Mat } from '../../src/sim/budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { MAT_EN, REPAIR_EN } from '../../src/sim/mieszkania.en.ts';
import { MAT_ACC, REPAIR } from '../../src/sim/mieszkania.ts';
import { BURNABLE, createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { placeEn } from '../../src/ui/budowa.en.ts';
import {
  allowedAnchors,
  buildItems,
  buildMenu,
  buildName,
  buildPanelHtml,
  costText,
  placeText,
  workText,
} from '../../src/ui/budowa.ts';
import { goalsDay2, goalsOf } from '../../src/ui/cele.ts';
import { DAMAGE_EN, WHY_SHORT_EN, WHY_TEXT_EN } from '../../src/ui/mieszkania.en.ts';
import { aptCard, aptState, aptView, DAMAGE_NAME, WHY_SHORT, WHY_TEXT } from '../../src/ui/mieszkania.ts';
import {
  burnSheet,
  confirmSheet,
  DANE_MIESZKANCOW,
  DANE_MIESZKANCOW_EN,
  endSheet,
  eventSheet,
  fuelHtml,
  helpSheet,
  lawSheet,
  lootText,
  menuSheet,
  nightOdds,
  nightSheet,
  oddsHtml,
  optionDetail,
  optionShort,
  reportSheet,
  type Sheet,
} from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { comingText } from '../../src/ui/przybycie.ts';
import { govFence, govLight } from '../../src/ui/siatka.ts';
import { esc } from '../../src/ui/tekst.ts';
import type { AptWhy, DamageKind } from '../../src/world/apts.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { mockBlock, mockBlockM2 } from './interior-mock.ts';
import { POLSKIE, polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

const DEMOS = ['przymorze', 'lanciego', 'zielonki'] as const;
const worlds = new Map<string, { w: World; seed: number }>();
/** demo gry z ziarnem z adresu, jak w przeglądarce */
function demo(key: string) {
  let c = worlds.get(key);
  if (!c) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
    c = { w: buildWorld(d.geo, { seed, street: d.street }), seed };
    worlds.set(key, c);
  }
  return c;
}
const fresh = (key: string = 'przymorze') => {
  const { w, seed } = demo(key);
  return { w, seed, sim: new Sim(w, createSim(w, seed, { core: 4 })) };
};
const tickAt = (h: number) => Math.round(((h * 60 - START_MINUTES) / 60) * TICKS_PER_HOUR);
const input = (sim: Sim, screen: number): GovInput => ({
  ...snapshot(sim.st, sim.w),
  screen,
  fence: govFence(sim.w),
  light: govLight(sim.st),
  hqName: 'Siedziba',
});
/** cały tekst okna */
const all = (s: Sheet) => `${s.kicker} ${s.title} ${s.body} ${s.foot}`;
/** tytuł gry i nazwy źródeł danych mieszkańców zostają po polsku */
const STALE = ['Za Murem', 'Warunki mieszkaniowe w Polsce', 'Prognoza ludności', 'Ministerstwo Cyfryzacji'];

/** treść zarządu jako Tx: polski tekst z karty (napis albo Tx) i zastępczy angielski */
const zastep = (s: Tx | string | undefined, en: string): Tx | undefined =>
  s === undefined ? undefined : tx(txOf(s).pl, en);
function kartaTx(card: NightCard): NightCard {
  return {
    ...card,
    chanceWord: zastep(card.chanceWord, 'high'),
    forecast: zastep(card.forecast, 'They may come tonight.'),
    advice: txOf(card.advice).pl ? zastep(card.advice, 'Patch the fence by day.') : card.advice,
    posts: card.posts.map((p) => ({ ...p, name: zastep(p.name, 'at the gate') })),
    horde: card.horde && { ...card.horde, word: zastep(card.horde.word, 'big') },
    people: card.people.map((p) => ({
      ...p,
      options: p.options.map((o) => ({
        ...o,
        label: zastep(o.label, 'Night option'),
        why: zastep(o.why, 'Too tired for that.'),
        note: zastep(o.note, 'Back by morning.'),
      })),
    })),
  } as unknown as NightCard;
}
function uchwalaTx(p: Extract<Prompt, { k: 'uchwala' }>): Extract<Prompt, { k: 'uchwala' }> {
  const options = p.options.map((o: LawOption) => ({
    ...o,
    name: zastep(o.name, 'Stairwell watches'),
    desc: zastep(o.desc, 'Someone stands at the gate every night.'),
    why: zastep(o.why, 'Pass another resolution first.'),
  }));
  return { ...p, options } as unknown as Extract<Prompt, { k: 'uchwala' }>;
}

/** sim o 20:00 pierwszego dnia z uchwałą i kartą nocy (jak atCard w interfejs.test.ts) */
function atCard(key: string = 'przymorze') {
  const { sim, seed } = fresh(key);
  sim.st.tick = tickAt(20);
  const gov = newGov(seed);
  govUpdate(gov, input(sim, 100));
  const law = pending(gov, input(sim, 100));
  signLaw(gov, input(sim, 100), null);
  const p = pending(gov, input(sim, 100));
  if (law?.k !== 'uchwala' || p?.k !== 'karta') throw new Error(`zamiast uchwały i karty: ${law?.k}, ${p?.k}`);
  return { sim, gov, law, p, i: input(sim, 100), names: p.card.people.map((c) => c.name) };
}

const ZERO = { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 };
const raport = (o: Partial<NightReport> = {}): NightReport =>
  ({
    day: 1,
    lines: [tx('Spokojna noc.', 'A quiet night.'), tx('Druga linia.', 'Second line.')],
    raid: 'odparty',
    stolen: ZERO,
    loot: { ...ZERO, wood: 4 },
    hurt: [],
    tired: [],
    trust: 51.5,
    anger: 19,
    dTrust: 1.5,
    dAnger: -1,
    ...o,
  }) as unknown as NightReport;
const wydarzenie = {
  k: 'wydarzenie',
  id: 'x',
  title: tx('Hałas <w nocy>', 'Noise <at night>'),
  text: tx('Raz.\nDwa.', 'One.\nTwo.'),
  choices: [
    { label: tx('Tak', 'Yes'), ok: true },
    { label: tx('Nie', 'No'), ok: false },
  ],
} as unknown as Extract<Prompt, { k: 'wydarzenie' }>;

describe('okna zarządu po angielsku', () => {
  it('karta nocy: napisy okna, opcje z ryzykiem i zyskiem, koza, każdy przydział', () => {
    const { gov, p, i, names } = atCard();
    ustawJezyk('en');
    const card = kartaTx(p.card);
    const none = Object.fromEntries(card.people.map((c) => [c.id, 'sen']));
    const one = { ...none, [card.people[0].id]: `warta:${card.posts[0].key}` };
    const koza = { ...none, [card.people[1].id]: KOZA_KEY };
    for (const as of [p.assign, none, one, koza]) {
      const s = nightSheet(card, as, nightOdds(gov, i, card, as));
      expect(polskieSlowa(all(s), names)).toEqual([]);
      expect(s.kicker).toBe('Night orders, 20:00');
      expect(s.title).toBe('First night behind the fence');
      expect(s.body).toContain('Raid chance');
      expect(s.body).toContain('If they get in, they take');
      expect(s.body).toContain('aria-label="Tonight: ');
      expect(s.foot).toContain('Start the night');
    }
    // propozycja zarządu wysyła kogoś na wyprawę, więc widać zysk z niej
    const html = nightSheet(card, p.assign, nightOdds(gov, i, card, p.assign)).body;
    expect(html).toMatch(/risk \d+%/);
    expect(html).toMatch(/wood \d+–\d+/);
    expect(html).toContain('The board suggests:');
    for (const c of card.people)
      for (const o of c.options) {
        const t = [optionShort(o, false), optionShort(o, true), optionDetail(o)].join(' ');
        expect(polskieSlowa(t, names), o.key).toEqual([]);
      }
    const exp = card.people[0].options.find((o) => o.key === 'wyprawa:blisko')!;
    expect(optionDetail(exp)).toMatch(/^Risk of trouble \d+%\. Might bring back: /);
    // bez uwagi zarządu i niedostępne bez powodu: zastępcze napisy okna
    const sen = card.people[0].options.find((o) => o.key === 'sen')!;
    expect(optionDetail({ ...sen, note: undefined })).toBe('Gets a full night’s sleep and wakes up with energy.');
    expect(optionShort({ ...sen, ok: false, why: undefined }, false)).toBe('Night option (not possible)');
    expect(optionDetail({ ...sen, ok: false, why: undefined })).toBe('Not possible.');
    // druga noc
    expect(nightSheet({ ...card, day: 2 }, none, nightOdds(gov, i, card, none)).title).toBe('Night 2');
  });

  it('koza w nocy i blok szansy: do rana, do północy, bez drewna, zgaśnie', () => {
    ustawJezyk('en');
    const v = (have: number, until: string, who: string[]) => fuelHtml({ have, need: 20, until }, who);
    expect(v(40, '6:00', ['Ania'])).toContain(
      '<b class="odd-v">till morning</b><em class="odd-note">stove watch: Ania · wood 40, the night needs 20 (2 an hour)',
    );
    expect(v(8, '0:00', ['Ania'])).toContain('till midnight');
    expect(v(5, '22:00', ['Ania', 'Bartek'])).toContain('till 22:00');
    expect(v(1, '20:00', ['Ania'])).toContain('no wood');
    expect(v(40, '6:00', [])).toContain('<b class="odd-v">goes out</b><em class="odd-note">no stove watch');
    for (const h of [v(40, '6:00', ['Ania']), v(8, '0:00', []), v(0, '20:00', ['Ania'])])
      expect(polskieSlowa(h, ['Ania', 'Bartek'])).toEqual([]);
    const { gov, p, i, names } = atCard();
    const card = kartaTx(p.card);
    const html = oddsHtml({ ...card, loss: { wood: 0, supplies: 0 } }, p.assign, nightOdds(gov, i, card, p.assign), {});
    expect(html).toContain('not much, it is all indoors');
    expect(polskieSlowa(html, names)).toEqual([]);
  });

  it('karta nocy w trybie zombie: stado i siatka zamiast szansy napadu', () => {
    const w = mockBlock();
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    const gov = newGov(3, 'zombie');
    const i = govInput(st, w, 0);
    const { card: c0, assign } = makeCard(gov, i);
    ustawJezyk('en');
    const card = kartaTx(c0);
    const names = card.people.map((c) => c.name);
    const s = nightSheet(card, assign, nightOdds(gov, i, card, assign));
    expect(polskieSlowa(all(s), names)).toEqual([]);
    expect(s.body).toContain('A herd is gathering beyond the fence.');
    const html = oddsHtml(card, assign, nightOdds(gov, i, card, assign), {});
    expect(html).toContain('Herd tonight');
    expect(html).toContain('<b class="odd-v">about ');
    expect(html).toContain('big · a shot draws more');
    expect(html).toContain('Fence');
    expect(html).not.toContain('Raid chance');
  });

  it('uchwała: napisy okna, drogi po angielsku, podpisana i zablokowana', () => {
    const { law } = atCard();
    ustawJezyk('en');
    const p = uchwalaTx(law);
    const first = lawSheet(p);
    expect(polskieSlowa(all(first), STALE)).toEqual([]);
    expect(first.kicker).toBe('Board meeting, day 1, 19:30');
    expect(first.title).toBe('First resolution');
    expect(first.body.match(/data-act="law"/g)?.length).toBe(3);
    expect(first.body).toContain('>Sign<');
    expect(first.foot).toContain('No resolution today (trust −1)');
    const opts = p.options.map(
      (o, k) =>
        ({
          ...o,
          s: k ? (k === 1 ? 'done' : 'lock') : 'ok',
          why: k === 2 ? tx('Najpierw inna uchwała', 'Pass another resolution first.') : undefined,
        }) as unknown as LawOption,
    );
    const later = lawSheet({ ...p, first: false, day: 3, options: [...opts, { ...opts[2], why: undefined }] });
    expect(polskieSlowa(all(later), STALE)).toEqual([]);
    expect(later.title).toBe('Board resolution');
    expect(later.body).toContain('Already in force.');
    expect(later.body).toContain('Pass another resolution first.');
    expect(later.body).toContain('Not possible right now.');
    expect(later.body).toMatch(/<span class="tag (porzadek|wspolnota)">(Order|Community)<\/span>/);
    expect(later.foot).toContain('No resolution today<');
  });

  it('wydarzenie, raport rano, palenie mebli, potwierdzenie', () => {
    ustawJezyk('en');
    const ev = eventSheet(wydarzenie);
    expect(ev.kicker).toBe('On the estate');
    expect(ev.title).toBe('Noise &lt;at night&gt;');
    expect(ev.body).toBe('<p>One.</p><p>Two.</p>');
    expect(ev.foot).toContain('>Yes<');
    expect(ev.foot.match(/disabled/g)?.length).toBe(1);
    const r = reportSheet(raport());
    expect(r.kicker).toBe('Morning report, day 2, 6:00');
    expect(r.title).toBe('Raid fought off');
    expect(r.body).toContain('A quiet night.');
    expect(r.body).toContain('Brought back</small><b>wood 4');
    expect(r.body).toContain('+1.5');
    expect(r.body).toContain('−1');
    expect(r.foot).toContain('New day');
    expect(polskieSlowa(all(r))).toEqual([]);
    const bad = reportSheet(
      raport({
        raid: 'wtargnięcie',
        stolen: { ...ZERO, wood: 3, supplies: 2 },
        hurt: [{ id: 'a', name: 'Anna Nowak', d: -12 }],
        kitchen: 19.4,
        koza: ['Anna Nowak'],
      }),
    );
    expect(bad.title).toBe('Looters got in');
    expect(bad.body).toContain('Kitchen this morning</small><b>19°C, stove watch: Anna Nowak');
    expect(bad.body).toContain('Taken</small><b>wood 3, food 2');
    expect(bad.body).toContain('Hurt</small><b>Anna Nowak, health −12');
    expect(polskieSlowa(all(bad), ['Anna Nowak'])).toEqual([]);
    expect(reportSheet(raport({ raid: 'brak' })).title).toBe('A quiet night');
    expect(lootText({ wood: -3, supplies: 0, scrap: 2 })).toBe('wood 3, scrap 2');
    for (const kind of [...Object.keys(BURNABLE), 'nieznany'])
      for (const [owner, softer] of [
        ['Anna Nowak', false],
        [null, true],
      ] as const)
        expect(polskieSlowa(all(burnSheet(kind, owner, softer)), ['Anna Nowak']), kind).toEqual([]);
    const wall = burnSheet('mebloscianka', 'Anna Nowak', false);
    expect(wall.title).toBe('Burn the wall unit?');
    expect(wall.body).toContain('Good for 6 pieces of wood, about 3 h of fire');
    expect(wall.body).toContain('It belongs to Anna Nowak');
    expect(burnSheet('krzeslo', null, true).body).toContain('Good for 1 piece of wood');
    expect(burnSheet('krzeslo', null, true).body).toContain('“Furniture for fuel” resolution halves that');
    const c = confirmSheet('Tear down the barricade');
    expect(c.kicker).toBe('Are you sure?');
    expect(polskieSlowa(all(c))).toEqual([]);
  });

  it('menu, pomoc i koniec gry', () => {
    ustawJezyk('en');
    const m = menuSheet('The game saves itself every game hour.');
    expect(m.body).toContain(esc(DANE_MIESZKANCOW_EN));
    expect(m.body).not.toContain(DANE_MIESZKANCOW);
    expect(m.body).toContain('>Sources and licences</a>');
    expect(m.body).toContain('How to play');
    expect(polskieSlowa(all(m), STALE)).toEqual([]);
    for (const touch of [false, true])
      for (const zombie of [false, true]) {
        const h = helpSheet(touch, zombie);
        expect(h.title).toBe('How to play');
        expect(polskieSlowa(all(h), STALE), `${touch} ${zombie}`).toEqual([]);
        if (zombie) expect(h.body).toMatch(/shambler/i);
        else expect(h.body).not.toMatch(/shambler/i);
      }
    expect(helpSheet(false).body).toContain('Right-click inside a flat for: Search, Take apart, Fix, Claim the flat.');
    expect(helpSheet(true).body).toContain(
      'Press and hold inside a flat for: Search, Take apart, Fix, Claim the flat.',
    );
    for (const id of Object.keys(ENDINGS_EN) as EndingId[]) {
      const e = endSheet(id);
      expect(e.kicker).toBe('Game over');
      expect(e.title).toBe(esc(ENDINGS_EN[id].title));
      expect(polskieSlowa(all(e))).toEqual([]);
    }
  });

  it('po polsku okna z treścią zarządu jako Tx są bajt w bajt takie same jak ze zwykłym napisem', () => {
    const { gov, p, i, law } = atCard();
    const card = kartaTx(p.card);
    for (const as of [p.assign, Object.fromEntries(card.people.map((c) => [c.id, KOZA_KEY]))])
      expect(nightSheet(card, as, nightOdds(gov, i, card, as))).toEqual(
        nightSheet(p.card, as, nightOdds(gov, i, p.card, as)),
      );
    expect(lawSheet(uchwalaTx(law))).toEqual(lawSheet(law));
    const plain = {
      ...wydarzenie,
      title: 'Hałas <w nocy>',
      text: 'Raz.\nDwa.',
      choices: [
        { label: 'Tak', ok: true },
        { label: 'Nie', ok: false },
      ],
    } as unknown as Extract<Prompt, { k: 'wydarzenie' }>;
    expect(eventSheet(wydarzenie)).toEqual(eventSheet(plain));
    const r = raport();
    expect(reportSheet(r)).toEqual(reportSheet({ ...r, lines: r.lines.map((l) => tr(l)) } as unknown as NightReport));
    // zmiana języka w trakcie: to samo okno w drugim języku i z powrotem
    ustawJezyk('en');
    const en = nightSheet(card, p.assign, nightOdds(gov, i, card, p.assign));
    ustawJezyk('pl');
    expect(nightSheet(card, p.assign, nightOdds(gov, i, card, p.assign)).kicker).toBe('Karta nocy, 20:00');
    expect(en.kicker).toBe('Night orders, 20:00');
  });
});

describe('pasek, cele i przybysze po angielsku', () => {
  it('pasek: podpowiedzi i wartości w trybie zwykłym i zombie, z dyżurem przy kozie i bez kuchni', () => {
    const { sim, seed } = fresh();
    const snap = snapshot(sim.st, sim.w);
    const names = snap.people.map((p) => p.name);
    ustawJezyk('en');
    const by = Object.fromEntries(statsOf(snap, newGov(seed)).map((x) => [x.id, x]));
    expect(by.sFire).toMatchObject({ value: 'cold', level: 'bad' });
    expect(by.sOut.title).toMatch(/^Outside −?\d+°C, autumn$/);
    expect(by.sTrust.title).toBe('Residents’ trust in the board (0–100). At zero, people leave.');
    const watch = {
      ...snap,
      kozaLit: true,
      stock: { ...snap.stock, fireHours: 2.5 },
      people: snap.people.map((p, k) => (k ? p : { ...p, post: 'koza' })),
    };
    const lit = Object.fromEntries(statsOf(watch, null).map((x) => [x.id, x]));
    expect(lit.sFire.value).toBe('2.5 h');
    expect(lit.sFire.title).toBe(
      `Fire in the stove for 2.5 h. The board keeps feeding it while there is wood. On stove watch: ${snap.people[0].name}, keeping it going till morning.`,
    );
    expect(lit.sKit.title).toContain('the stove has 2.5 h of fire left');
    const w = mockBlock();
    const z = new Sim(w, createSim(w, 3, { core: 2, mode: 'zombie' }));
    z.step();
    const zs = statsOf(snapshot(z.st, w), newGov(3, 'zombie'));
    expect(zs.find((x) => x.id === 'sHorde')?.title).toMatch(/^Shamblers at the fence: \d+/);
    for (const s of [
      ...statsOf(snap, newGov(seed)),
      ...statsOf(watch, null),
      ...statsOf({ ...snap, kitchen: null }, null),
      ...statsOf({ ...snap, season: 1 }, null),
      ...zs,
    ])
      expect(
        polskieSlowa(`${s.value} ${s.title}`, [...names, ...snapshot(z.st, w).people.map((p) => p.name)]),
        s.id,
      ).toEqual([]);
    expect(statsOf({ ...snap, kitchen: null }, null).find((x) => x.id === 'sKit')?.title).toBe(
      'HQ has no kitchen with a stove',
    );
  });

  it('cele pierwszego i drugiego dnia: każdy krok, mysz i dotyk, zwykły i zombie', () => {
    const { sim, seed } = fresh();
    const st = sim.st;
    ustawJezyk('en');
    const gov = newGov(seed);
    const texts: string[] = [];
    for (let step = 0; step <= TUT_STEPS.length; step++)
      for (const touch of [false, true])
        for (const hour of [15, 21]) {
          st.tut.step = step;
          for (const g of goalsOf(st, gov, { touch, kitchen: 9, hour, wood: 2 })) texts.push(g.text, g.how);
        }
    st.tut.step = 0;
    const g = goalsOf(st, null, { touch: false, kitchen: 9, hour: 15, wood: 2 });
    expect(g[0]).toMatchObject({
      text: 'Select someone from the board.',
      how: 'Click a person in the HQ kitchen.',
    });
    expect(g.find((x) => x.key === 'cieplo')?.how).toContain('The kitchen is at 9°C now.');
    expect(g.find((x) => x.key === 'drewno')?.how).toContain('Wood stocked: 2 of 6.');
    expect(goalsOf(st, null, { touch: true, kitchen: 9, hour: 15 })[0].how).toBe('Tap a person in the HQ kitchen.');
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const touch of [false, true]) {
        const gv = newGov(seed, mode);
        gv.reports.push({} as NightReport);
        const g2 = goalsDay2(st, gv, { touch, wood: 3, woodReady: false, holes: 2 });
        for (const x of g2) texts.push(x.text, x.how);
        const b = g2.find((x) => x.key === 'budowla')!;
        const cheap = (Object.keys(BUILDS) as BuildKind[])
          .map((k) => ({ k, n: Object.values(BUILDS[k].cost).reduce((a: number, v) => a + (v ?? 0), 0) }))
          .sort((x, y) => x.n - y.n)
          .slice(0, 2);
        for (const { k } of cheap) expect(b.how).toContain(`${BUILDS_EN[k].the} (${costText(BUILDS[k].cost)})`);
        if (mode === 'zombie')
          expect(g2.find((x) => x.key === 'dzida')?.how).toContain('“Make a spear” (2 planks and 1 scrap)');
        else expect(g2.find((x) => x.key === 'obwod')?.how).toContain('Open holes: 2.');
      }
    for (const t of texts) expect(polskieSlowa(t), t).toEqual([]);
  });

  it('przybysze zza bramy', () => {
    ustawJezyk('en');
    expect(comingText(1)).toBe('1 person is coming in from the gate');
    for (const n of [2, 5, 22]) expect(comingText(n)).toBe(`${n} people are coming in from the gate`);
  });
});

/** dom jednorodzinny wśród domów (jak Zielonki) */
const DOM = { ...BLOK, kind: 'dom' as const, near: 'domy' as const };

describe('budowa i mieszkania po angielsku', () => {
  it('angielskie tablice mają wszystkie klucze polskich i nie mają polskich liter', () => {
    const pary: [Record<string, unknown>, Record<string, unknown>][] = [
      [BUILDS, BUILDS_EN],
      [MAT_ACC, MAT_EN],
      [REPAIR, REPAIR_EN],
      [DAMAGE_NAME, DAMAGE_EN],
      [WHY_SHORT, WHY_SHORT_EN],
      [WHY_TEXT, WHY_TEXT_EN],
    ];
    for (const [pl, en] of pary) {
      expect(Object.keys(en).sort()).toEqual(Object.keys(pl).sort());
      for (const v of Object.values(en)) {
        const t = typeof v === 'function' ? v(2040) : JSON.stringify(v);
        expect(POLSKIE.test(t), t).toBe(false);
      }
    }
    // gdzie wolno stawiać: po angielsku dla bloku i dla domu, jak placeText ze słownikiem miejsca
    for (const place of ['pokoj', 'kuchnia', 'podworko', 'obwod'] as const)
      for (const p of [BLOK, DOM]) {
        expect(placeText(place, wordsOf(p))).toBeTruthy();
        expect(POLSKIE.test(placeEn(place, wordsEn(p)))).toBe(false);
      }
    expect(placeEn('pokoj', wordsEn(DOM))).toBe('in a room of your house');
  });

  it('menu budowy: kategorie, nazwy, koszt i czas po angielsku, powody braku', () => {
    ustawJezyk('en');
    const menu = buildMenu({ deski: 999, zlom: 999, czesci: 999 }, () => true);
    expect(menu.map((c) => c.title)).toEqual(['Home', 'Yard', 'Perimeter']);
    for (const b of menu.flatMap((c) => c.items)) {
      expect(b).toMatchObject({ name: BUILDS_EN[b.kind].name, effect: effectEnOf(b.kind, wordsEn(BLOK)), ok: true });
      for (const [m, n] of Object.entries(BUILDS[b.kind].cost) as [Mat, number][])
        if (n > 0) expect(b.cost).toContain(`${MAT_EN[m]} ${n}`);
    }
    expect(buildName('zasieki')).toBe('Barricade');
    expect(menu.flatMap((c) => c.items).find((b) => b.kind === 'warsztat')!.place).toBe('in a room of your flat');
    expect(workText(TICKS_PER_HOUR)).toBe('1 h of work');
    expect(workText((3 * TICKS_PER_HOUR) / 4)).toBe('45 min of work');
    expect(workText((3 * TICKS_PER_HOUR) / 2)).toBe('1.5 h of work');
    expect(workText((5 * TICKS_PER_HOUR) / 4)).toBe('1 h 15 min of work');
    const poor = buildMenu({ deski: 1 }, () => true)
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'warsztat')!;
    expect(poor.why).toBe(
      `Still needed: planks ${(BUILDS.warsztat.cost.deski ?? 0) - 1}, scrap ${BUILDS.warsztat.cost.zlom}. Planks come from searching empty flats and taking furniture apart.`,
    );
    const k = buildMenu({ zlom: 999, czesci: 999 }, (kind) => kind !== 'kuchnia_spoleczna')
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'kuchnia_spoleczna')!;
    expect(k.why).toBe('Nowhere to put it: no free space in the kitchen of your flat.');
    for (const touch of [false, true])
      for (const have of [{}, BUILDS.warsztat.cost, { deski: 999, zlom: 999, czesci: 999 }])
        for (const tab of ['dom', 'podworko', 'obwod'] as const) {
          const s = buildPanelHtml(
            buildMenu(have, (kind) => kind !== 'ogrodek'),
            { tab, kind: null },
            touch,
          );
          expect(polskieSlowa(all(s))).toEqual([]);
          expect(s.kicker).toBe(touch ? 'Build' : 'Build (B)');
          expect(s.body).toContain(touch ? 'Tap to place the plan' : 'Left-click places the plan, R rotates');
        }
    const none = buildPanelHtml([], { tab: null, kind: null }, false);
    expect(none.body).toContain('Nothing can be built yet.');
    expect(polskieSlowa(all(none))).toEqual([]);
  });

  it('polecenia przy planach i budowlach, powody z canPlace', () => {
    const { w, sim } = fresh();
    const st = sim.st;
    const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
    sim.step();
    const core = st.pawns.find((p) => p.kind === 'core')!;
    const stock = snapshot(st, w).stock;
    ustawJezyk('en');
    expect(buildItems(st, w, [core.id], a, stock).map((i) => i.label)).toEqual(['Cancel the plan']);
    expect(buildItems(st, w, [core.id], a, { ...stock, boards: 999 }).map((i) => i.label)).toEqual([
      'Build the vegetable patch',
      'Cancel the plan',
    ]);
    // plan już stoi: drugi w tym miejscu nie
    expect(canPlace(st, w, 'ogrodek', a % w.size, Math.floor(a / w.size), 0).why).toBe(
      'There is already a build plan here.',
    );
    const f = allowedAnchors(st, w, 'zasieki', 0)[0];
    st.things.push({
      ...st.things[0],
      id: 9001,
      kind: 'zasieki',
      x: f % w.size,
      y: Math.floor(f / w.size),
      w: 1,
      h: 1,
    });
    expect(buildItems(st, w, [core.id], f, stock).map((i) => i.label)).toEqual(['Tear down the barricade']);
    const whys = new Set<string>();
    const region = [...w.fence.tiles, ...w.fence.yard];
    w.interior.room.forEach((r, i) => {
      if (r >= 0) region.push(i);
    });
    for (const kind of Object.keys(BUILDS) as BuildKind[])
      for (const i of region.filter((_, k) => k % 5 === 0)) {
        const why = canPlace(st, w, kind, i % w.size, Math.floor(i / w.size), 0).why;
        if (why) whys.add(why);
      }
    whys.add(canPlace(st, w, 'magazyn', -1, 0, 0).why ?? '');
    for (const why of [
      'Off the map.',
      'Something is in the way.',
      'Only on a stretch of the fence.',
      'Only in the yard inside the fence, away from the gate, holes and doors.',
      'Only in a room of your flat.',
      'Only in the kitchen of your flat.',
    ])
      expect(whys).toContain(why);
    for (const why of whys) expect(polskieSlowa(why), why).toEqual([]);
  });

  it.each(DEMOS)('%s: karta każdego mieszkania siedziby, mysz i dotyk', (key) => {
    const { w, sim } = fresh(key);
    const st = sim.st;
    const snap = snapshot(st, w);
    ustawJezyk('en');
    for (const g of st.apts) {
      const v = aptView(st, w, g.apt, snap.apts)!;
      for (const touch of [false, true]) expect(polskieSlowa(aptCard(v, touch)), `${g.apt}`).toEqual([]);
      expect(aptCard(v, false)).toContain(`<h2>Flat ${g.apt + 1}</h2>`);
      if (g.state === 'zarzad') expect(aptState(v)).toBe('The board’s flat');
      if (g.state === 'mieszkancy') expect(aptState(v)).toBe('People live here');
      if (g.state === 'puste' && g.why) {
        expect(aptState(v)).toBe(`Empty since ${g.year}, ${WHY_SHORT_EN[g.why]}`);
        expect(aptCard(v, false)).toContain(esc(WHY_TEXT_EN[g.why](g.year!)));
        expect(aptCard(v, false)).toContain(`Searched: 0 of ${v.roomCount}`);
        expect(aptCard(v, false)).toContain('Right-click inside the flat: Search, Take apart, Fix, Claim the flat.');
        for (const d of v.damages) expect(d.name).toBe(DAMAGE_EN[d.kind]);
      }
    }
  });

  it('karta pustego mieszkania: każdy powód, zajęte i naprawione, miejsca do spania', () => {
    const w = mockBlockM2();
    const st = createSim(w, 3, { core: 2 });
    const snap = snapshot(st, w);
    const empty = st.apts.find((a) => a.state === 'puste' && st.damage.some((d) => d.apt === a.apt))!;
    ustawJezyk('en');
    let v = aptView(st, w, empty.apt, snap.apts)!;
    expect(aptCard(v, false)).toContain(`Repairs (${v.damaged})`);
    for (const d of v.damages)
      expect(aptCard(v, false)).toContain(
        `${DAMAGE_EN[d.kind]}</span><b class="apt-c">${costText(REPAIR[d.kind].cost)}`,
      );
    empty.ours = true;
    empty.searched.push(v.rooms[0].id);
    st.damage[v.damages[0].id].fixed = true;
    v = aptView(st, w, empty.apt, snapshot(st, w).apts)!;
    const html = aptCard(v, true);
    expect(aptState(v)).toBe(`Claimed by the board, empty since ${empty.year}, ${WHY_SHORT_EN[empty.why!]}`);
    expect(html).toContain(`Searched: 1 of ${v.roomCount}`);
    expect(html).toContain('>repaired<');
    expect(html).toContain('>searched<');
    expect(html).toContain('Press and hold inside the flat');
    expect(polskieSlowa(html)).toEqual([]);
    for (const why of Object.keys(WHY_TEXT_EN) as AptWhy[])
      for (const ours of [false, true])
        for (const beds of [0, 1, 3]) {
          const vv = { ...v, state: 'puste' as const, why, year: 2040, ours, beds };
          const t = `${aptState(vv)} ${aptCard(vv, false)} ${aptCard(vv, true)}`;
          expect(polskieSlowa(t), why).toEqual([]);
          if (beds)
            expect(aptCard(vv, false)).toContain(
              `${ours ? 'Once repaired' : 'Once claimed and repaired'}: sleeps ${beds}.`,
            );
        }
    const kinds = Object.keys(DAMAGE_EN) as DamageKind[];
    expect(kinds.map((k) => DAMAGE_EN[k])).toEqual([
      'Broken window',
      'Kicked-in door',
      'Leaking pipe',
      'Ruined floor',
      'Broken cooker',
    ]);
  });
});
