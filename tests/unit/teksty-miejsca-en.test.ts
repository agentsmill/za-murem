/* Teksty według miejsca po angielsku (słownik wspólnoty wordsEn z src/gov/miejsce.ts), jak teksty-miejsca.test.ts po
   polsku: w domu jednorodzinnym (Zielonki) okna, pomoc, samouczek, cele, pasek, karta osoby i mieszkania, menu budowy
   i poleceń bez słów z bloku (co-op, board, estate, stairwell, the gate bez garden), w bloku (Przymorze) zarząd
   i brama jak dotąd. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import type { Prompt } from '../../src/gov/typy.ts';
import { govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { gateTiles } from '../../src/sim/perimeter.ts';
import { createSim, type Job, Sim, STAY_MEAL } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { buildMenu, buildPanelHtml } from '../../src/ui/budowa.ts';
import { goalsDay2, goalsOf } from '../../src/ui/cele.ts';
import { personCard } from '../../src/ui/karta.ts';
import { aptCard, aptState, aptView } from '../../src/ui/mieszkania.ts';
import {
  burnSheet,
  endSheet,
  eventSheet,
  helpSheet,
  lawSheet,
  nightOdds,
  nightSheet,
  type Sheet,
} from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { comingText } from '../../src/ui/przybycie.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';

beforeEach(() => ustawJezyk('en'));
afterEach(() => ustawJezyk('pl'));

/** słowa z bloku, których w domu nie ma w angielskich tekstach interfejsu (siedziba w domu to dom komitetu, nie mieszkanie) */
const BLOKOWE =
  /co-op|\bboard\b|general meeting|\bestate\b|carpet rack|stairwell|\bblocks?\b|\bflats?\b|pavilion|common room|service charge|\bresidents?\b|(?<!garden )\bgate\b/i;

function game(key: string) {
  const { w, seed } = demoWorld(key);
  const sim = new Sim(w, createSim(w, seed, { core: 4 }));
  return { w, seed, sim, words: wordsOfWorld(w), e: wordsEnOfWorld(w) };
}

const visible = (html: string) => html.replace(/<[^>]*>/g, ' ');
const sheetTexts = (s: Sheet) => [s.kicker, s.title, s.body, s.foot].map(visible);
const tickAt = (h: number) => Math.round(((h * 60 - START_MINUTES) / 60) * TICKS_PER_HOUR);
const event = (): Extract<Prompt, { k: 'wydarzenie' }> => ({
  k: 'wydarzenie',
  id: 'x',
  title: { pl: 'T', en: 'T' },
  text: { pl: 'a', en: 'a' },
  choices: [],
});
const law = (day: number): Extract<Prompt, { k: 'uchwala' }> => ({ k: 'uchwala', day, first: day === 1, options: [] });
const job = (t: Job['t'], target: number): Job => ({
  t,
  target,
  tile: 0,
  phase: 1,
  from: -1,
  t0: 0,
  until: 0,
  order: false,
  n: 0,
  what: '',
});

function nightCard(key: string) {
  const { sim, seed, words, e } = game(key);
  sim.st.tick = tickAt(20);
  const gov = newGov(seed);
  const i = govInput(sim.st, sim.w, 100);
  govUpdate(gov, i);
  signLaw(gov, i, null);
  const p = pending(gov, i);
  if (p?.k !== 'karta') throw new Error(`zamiast karty: ${p?.k}`);
  return nightSheet(p.card, p.assign, nightOdds(gov, i, p.card, p.assign), words, e);
}

describe('po angielsku w domu bez słów z bloku (Zielonki)', () => {
  const { words, e } = game('zielonki');

  it('okna: wydarzenie, uchwała, palenie mebli, pomoc i koniec gry', () => {
    expect(eventSheet(event(), words, e).kicker).toBe('On the street');
    const later = lawSheet(law(3), words, e);
    expect([later.kicker, later.title]).toEqual(['Committee meeting, day 3, 19:30', 'Committee resolution']);
    expect(endSheet('odwolanie', words, e).title).toBe('The street meeting recalled the committee');
    const sheets = [
      lawSheet(law(1), words, e),
      later,
      burnSheet('krzeslo', 'Anna Nowak', false, words, e),
      burnSheet('krzeslo', null, true, words, e),
      helpSheet(false, false, words, e),
      helpSheet(true, true, words, e),
      endSheet('odwolanie', words, e),
      endSheet('exodus', words, e),
      endSheet('pustka', words, e),
    ];
    for (const t of sheetTexts(sheets.flat()[0])) expect(t).not.toMatch(BLOKOWE);
    for (const s of sheets)
      for (const t of sheetTexts(s)) {
        expect(t).not.toMatch(BLOKOWE);
        expect(polskieSlowa(t, ['Anna Nowak', 'Za Murem'])).toEqual([]);
      }
  });

  it('karta nocy: rada komitetu i posterunek przy furtce', () => {
    const card = nightCard('zielonki');
    expect(card.foot).toContain('As the committee suggests');
    for (const t of sheetTexts(card)) expect(t).not.toMatch(BLOKOWE);
  });

  it('samouczek i cele drugiego dnia', () => {
    const { sim } = game('zielonki');
    const gov = newGov(1);
    const goals = [15, 21].flatMap((hour) =>
      [false, true].flatMap((touch) => goalsOf(sim.st, gov, { touch, kitchen: 9, hour, words, wordsEn: e })),
    );
    expect(goals.find((g) => g.key === 'rozkaz')?.text).toBe('Send them to the dead tree in the garden.');
    const day2 = goalsDay2(sim.st, gov, { touch: false, wood: 0, woodReady: false, holes: 2, words, wordsEn: e });
    expect(day2.find((g) => g.key === 'przeszukaj')?.text).toBe('Search the house.');
    // najpierw zaznaczyć kogoś, potem prawy przycisk w pokoju domu; karta domu tylko pokazuje, co już przeszukane
    expect(day2.find((g) => g.key === 'przeszukaj')?.how).toBe(
      'Select someone from the committee and right-click inside a room of the house: “Search the …”. To see what has been searched, click the house while nobody is selected and read its card.',
    );
    const touchDay2 = goalsDay2(sim.st, gov, { touch: true, wood: 0, woodReady: false, holes: 2, words, wordsEn: e });
    expect(touchDay2.find((g) => g.key === 'przeszukaj')?.how).toBe(
      'Tap someone from the committee and press and hold inside a room of the house: “Search the …”. To see what has been searched, tap the house while nobody is selected and read its card.',
    );
    goals.push(...day2, ...touchDay2);
    for (const g of goals) expect(`${g.text} ${g.how}`).not.toMatch(BLOKOWE);
  });

  it('pasek, przybysze, karta osoby i mieszkania, menu budowy', () => {
    const { sim, w, seed } = game('zielonki');
    const snap = snapshot(sim.st, w);
    for (const s of statsOf(snap, newGov(seed), words, e)) expect(s.title).not.toMatch(BLOKOWE);
    expect([1, 3].map((n) => comingText(n, words, e))).toEqual([
      '1 person is coming in from the garden gate',
      '3 people are coming in from the garden gate',
    ]);
    const p = snapshot(sim.st, w).people[0];
    const bitten = personCard(
      { ...p, bite: { at: 0, limb: true, left: TICKS_PER_HOUR, amputate: true } },
      0,
      undefined,
      false,
      {
        words,
        wordsEn: e,
      },
    );
    expect(bitten).toContain('title="Someone from the committee with Medicine takes the limb off');
    const v = aptView(sim.st, w, 0, snap.apts)!;
    expect(aptState(v, words, e)).toBe('The committee’s house');
    expect(visible(aptCard(v, false, words, e))).not.toMatch(BLOKOWE);
    expect(aptCard(v, false, words, e)).toContain('<h2>The house</h2>');
    expect(helpSheet(false, false, words, e).body).toContain('Building and searching the house');
    const sheet = buildPanelHtml(
      buildMenu({}, (kind) => kind !== 'magazyn', words, e),
      { tab: null, kind: null },
      false,
      words,
      e,
    );
    expect(sheet.body).toContain('Sleeps two, so there is room for more people in the house.');
    for (const t of sheetTexts(sheet)) expect(t).not.toMatch(BLOKOWE);
  });

  it('menu poleceń przy furtce, praca w karcie osoby i miejsce na podwórku', () => {
    const { sim, w } = game('zielonki');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const labels = commandsAt(sim.st, w, [core.id], gateTiles(w)[0]).map((m) => m.label);
    expect(labels).toContain('Keep watch at the garden gate');
    expect(labels.some((l) => l === 'Open the garden gate' || l === 'Close the garden gate')).toBe(true);
    for (const l of labels) expect(l).not.toMatch(BLOKOWE);
    core.job = job('guard', 0);
    expect(jobText(sim.st, w, core)).toBe('On watch at the garden gate.');
    core.job = job('stay', STAY_MEAL);
    expect(jobText(sim.st, w, core)).toBe('Having the shared meal at the committee’s table.');
    expect(canPlace(sim.st, w, 'ogrodek', 0, 0, 0).why).toBe(
      'Only in the yard inside the fence, away from the garden gate, holes and doors.',
    );
  });
});

describe('po angielsku w bloku (Przymorze)', () => {
  const { words, e } = game('przymorze');

  it('zarząd, brama i spółdzielnia jak dotąd', () => {
    expect(eventSheet(event(), words, e).kicker).toBe('On the estate');
    expect(lawSheet(law(3), words, e).title).toBe('Board resolution');
    expect(helpSheet(false, false, words, e).body).toContain('You are the board of a housing co-op in 2051.');
    expect(comingText(1, words, e)).toBe('1 person is coming in from the gate');
    const { sim, w } = game('przymorze');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const labels = commandsAt(sim.st, w, [core.id], gateTiles(w)[0]).map((m) => m.label);
    expect(labels).toContain('Keep watch at the gate');
  });

  it('cel przeszukania: zaznaczyć osobę z zarządu, potem prawy przycisk w pustym mieszkaniu', () => {
    const { sim } = game('przymorze');
    const day2 = (touch: boolean) =>
      goalsDay2(sim.st, null, { touch, wood: 0, woodReady: false, holes: 2, words, wordsEn: e }).find(
        (g) => g.key === 'przeszukaj',
      )!;
    expect(day2(false).text).toBe('Search an empty flat.');
    expect(day2(false).how).toBe(
      'Select someone from the board and right-click inside an empty flat: “Search the …”. To see which flats are empty, click a flat while nobody is selected and read its card.',
    );
    expect(day2(true).how).toBe(
      'Tap someone from the board and press and hold inside an empty flat: “Search the …”. To see which flats are empty, tap a flat while nobody is selected and read its card.',
    );
  });
});
