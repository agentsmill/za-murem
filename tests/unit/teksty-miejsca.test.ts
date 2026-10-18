/* Teksty spoza zarządu według miejsca (słownik wspólnoty z src/gov/miejsce.ts): w domu jednorodzinnym (Zielonki)
   okna, pomoc, samouczek, cele, pasek, karta osoby i mieszkania, menu budowy i poleceń i powód nastroju bez słów
   z bloku, w bloku (Przymorze) po staremu. */

import { describe, expect, it } from 'vitest';
import { BLOK, placeOf, wordsOf, wordsOfWorld } from '../../src/gov/miejsce.ts';
import type { Prompt } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { gateTiles } from '../../src/sim/perimeter.ts';
import { createSim, type Job, Sim, STAY_MEAL } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { buildMenu, buildSheet } from '../../src/ui/budowa.ts';
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
import { govFence } from '../../src/ui/siatka.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { pl } from './po-angielsku.ts';

/** słowa z bloku, których w domu nie ma w tekstach interfejsu; łóżka piętrowe to nazwa łóżek, a mieszkanie zostaje
    nazwą mieszkania siedziby w grze, więc bez „piętr” i „mieszkani” */
const BLOKOWE = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszkańc/i;

/** gra na demie: symulacja z czterema osobami zarządu i słowa miejsca */
function game(key: string) {
  const { w, seed } = demoWorld(key);
  const sim = new Sim(w, createSim(w, seed, { core: 4 }));
  return { w, seed, sim, words: wordsOfWorld(w) };
}

/** tekst, który widać: bez znaczników i atrybutów (klucze jak „warta:brama” są w atrybutach) */
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

/** karta nocy o 20:00 pierwszego dnia z wejściem zarządu jak w grze (z opisem miejsca), uchwała odłożona */
function nightCard(key: string) {
  const { sim, seed, words } = game(key);
  sim.st.tick = tickAt(20);
  const gov = newGov(seed);
  const i = govInput(sim.st, sim.w, 100);
  govUpdate(gov, i);
  signLaw(gov, i, null);
  const p = pending(gov, i);
  if (p?.k !== 'karta') throw new Error(`zamiast karty: ${p?.k}`);
  return nightSheet(p.card, p.assign, nightOdds(gov, i, p.card, p.assign), words);
}

/** karta osoby ugryzionej w rękę, którą da się jeszcze uratować amputacją */
function bittenCard(key: string) {
  const { sim, w, words } = game(key);
  const p = snapshot(sim.st, w).people[0];
  return personCard({ ...p, bite: { at: 0, limb: true, left: TICKS_PER_HOUR, amputate: true } }, 0, undefined, false, {
    words,
  });
}

describe('słownik miejsca dla tekstów spoza zarządu', () => {
  it('w bloku brama, trzepak i spółdzielnia, w domu furtka, ogród i dom', () => {
    const pick = (w: ReturnType<typeof wordsOf>) => [
      w.zarzad.pelny,
      w.brama.d,
      w.brama.b,
      w.drzewo,
      w.zaTrzepakiem,
      w.mieszkamy,
    ];
    expect(pick(wordsOfWorld(demoWorld('przymorze').w))).toEqual([
      'zarząd spółdzielni',
      'bramy',
      'bramę',
      'przy trzepaku',
      'za trzepakiem',
      'w spółdzielni',
    ]);
    expect(pick(wordsOfWorld(demoWorld('zielonki').w))).toEqual([
      'komitet ulicy',
      'furtki',
      'furtkę',
      'w ogrodzie',
      null,
      'w domu',
    ]);
  });
  it('świat bez siedziby (atrapa) mówi jak blok', () => {
    expect(wordsOfWorld({ size: 0, buildings: [], hq: -1, pois: [], apts: [] })).toEqual(wordsOf(BLOK));
  });
});

describe('w domu bez słów z bloku (Zielonki)', () => {
  const { words } = game('zielonki');

  it('okna: wydarzenie, uchwała, palenie mebli, pomoc i koniec gry', () => {
    expect(eventSheet(event(), words).kicker).toBe('Na ulicy');
    const later = lawSheet(law(3), words);
    expect([later.kicker, later.title]).toEqual(['Zebranie komitetu, dzień 3, 19:30', 'Uchwała komitetu']);
    expect(endSheet('odwolanie', words).title).toBe('Zebranie ulicy odwołało komitet');
    const sheets = [
      lawSheet(law(1), words),
      later,
      burnSheet('krzeslo', 'Anna Nowak', false, words),
      burnSheet('krzeslo', null, true, words),
      helpSheet(false, false, words),
      helpSheet(true, true, words),
      endSheet('odwolanie', words),
      endSheet('exodus', words),
      endSheet('pustka', words),
    ];
    for (const t of sheets.flatMap(sheetTexts)) expect(t).not.toMatch(BLOKOWE);
  });

  it('karta nocy: rada komitetu i posterunek przy furtce', () => {
    const card = nightCard('zielonki');
    expect(card.foot).toContain('Jak radzi komitet');
    for (const t of sheetTexts(card)) expect(t).not.toMatch(BLOKOWE);
  });

  it('samouczek i cele drugiego dnia', () => {
    const { sim } = game('zielonki');
    const gov = newGov(1);
    const goals = [15, 21].flatMap((hour) =>
      [false, true].flatMap((touch) => goalsOf(sim.st, gov, { touch, kitchen: 9, hour, words })),
    );
    expect(goals.find((g) => g.key === 'rozkaz')?.text).toBe('Wyślijcie go do suchego drzewa w ogrodzie.');
    goals.push(...goalsDay2(sim.st, gov, { touch: false, wood: 0, woodReady: false, holes: 2, words }));
    for (const g of goals) expect(`${g.text} ${g.how}`).not.toMatch(BLOKOWE);
  });

  it('pasek, przybysze, karta osoby i mieszkania, menu budowy', () => {
    const { sim, w, seed } = game('zielonki');
    const snap = snapshot(sim.st, w);
    for (const s of statsOf(snap, newGov(seed), words)) expect(s.title).not.toMatch(BLOKOWE);
    expect([1, 3, 5].map((n) => comingText(n, words))).toEqual([
      '1 osoba idzie od furtki',
      '3 osoby idą od furtki',
      '5 osób idzie od furtki',
    ]);
    expect(bittenCard('zielonki')).toContain('title="Ktoś z komitetu z medycyną utnie kończynę');
    const v = aptView(sim.st, w, 0, snap.apts)!;
    expect(aptState(v, words)).toBe('Mieszkanie komitetu ulicy');
    expect(visible(aptCard(v, false, words))).not.toMatch(BLOKOWE);
    const sheet = buildSheet(
      buildMenu({}, (kind) => kind !== 'magazyn', words),
      false,
      words,
    );
    expect(sheet.body).toContain('Dwa miejsca do spania, w domu zmieści się więcej ludzi.');
    for (const t of sheetTexts(sheet)) expect(t).not.toMatch(BLOKOWE);
  });

  it('menu poleceń przy furtce, praca w karcie osoby, miejsce na podwórku i powód nastroju', () => {
    const { sim, w } = game('zielonki');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const labels = commandsAt(sim.st, w, [core.id], gateTiles(w)[0]).map((m) => m.label);
    expect(labels).toContain('Pilnować furtki');
    expect(labels.some((l) => l === 'Otworzyć furtkę' || l === 'Zamknąć furtkę')).toBe(true);
    for (const l of labels) expect(l).not.toMatch(BLOKOWE);
    core.job = job('guard', 0);
    expect(jobText(sim.st, w, core)).toBe('Trzyma wartę przy furtce.');
    core.job = job('stay', STAY_MEAL);
    expect(jobText(sim.st, w, core)).toBe('Je wspólny posiłek przy stole komitetu.');
    expect(canPlace(sim.st, w, 'ogrodek', 0, 0, 0).why).toBe(
      'Tylko na podwórku za siatką, z dala od furtki, dziur i drzwi.',
    );
    applyGov(sim.st, w, { ...emptyEffects(), needs: [{ id: sim.st.people[core.person].id, d: { mood: -2 } }] });
    expect(core.moods.at(-1)?.why).toBe('Sprawy ulicy');
  });

  it('dziura przy trzepaku w domu nie jest „za trzepakiem”', () => {
    // podwórko 10 × 10, dziura w siatce u góry, trzepak tuż pod nią
    const yard = Array.from({ length: 64 }, (_, k) => (1 + Math.floor(k / 8)) * 10 + 1 + (k % 8));
    const src = {
      size: 10,
      seed: 1,
      fence: { tiles: [3, 4, 5, 6], hole: [5], yard },
      props: [{ kind: 'trzepak', x: 4, y: 2, w: 3, h: 1 }],
    };
    expect(pl(govFence(src)!.holes[0].name)).toBe('za trzepakiem');
    expect(pl(govFence(src, wordsOf(placeOf(demoWorld('zielonki').w)))!.holes[0].name)).toBe('od północy');
    // bez trzepaka (sterta na jego miejscu) dziura ma nazwę z kierunku
    expect(pl(govFence({ ...src, props: [{ ...src.props[0], kind: 'deski' }] })!.holes[0].name)).toBe('od północy');
  });
});

describe('w bloku po staremu (Przymorze)', () => {
  const { words } = game('przymorze');

  it('okna, pomoc i koniec gry', () => {
    expect(eventSheet(event(), words).kicker).toBe('Na osiedlu');
    const later = lawSheet(law(3), words);
    expect([later.kicker, later.title]).toEqual(['Zebranie zarządu, dzień 3, 19:30', 'Uchwała zarządu']);
    expect(lawSheet(law(1), words).body).toContain('Mieszkańcy czekają, jakie zasady ustalicie');
    expect(burnSheet('krzeslo', 'Anna Nowak', false, words).body).toContain('a reszta zarządu też to poczuje');
    const help = helpSheet(false, false, words).body;
    expect(help).toContain('<h3 class="help-h">Zarząd</h3>');
    expect(help).toContain('Prowadzicie zarząd spółdzielni w 2051 roku.');
    expect(help).toContain('przy pełnym wkurzeniu walne odwoła zarząd.');
    expect(endSheet('odwolanie', words).title).toBe('Walne odwołało zarząd');
    expect(nightCard('przymorze').foot).toContain('Jak radzi zarząd');
    expect(bittenCard('przymorze')).toContain('title="Ktoś z zarządu z medycyną utnie kończynę');
    // bez słów z miejsca okna mówią jak w bloku
    expect(helpSheet(true)).toEqual(helpSheet(true, false, words));
    expect(eventSheet(event())).toEqual(eventSheet(event(), words));
  });

  it('samouczek, pasek, przybysze, karta mieszkania i menu budowy', () => {
    const { sim, w, seed } = game('przymorze');
    const goals = goalsOf(sim.st, null, { touch: false, kitchen: 9, hour: 15, words });
    expect(goals.slice(0, 2).map((g) => g.text)).toEqual([
      'Zaznaczcie kogoś z zarządu.',
      'Wyślijcie go do suchego drzewa przy trzepaku.',
    ]);
    const stats = statsOf(snapshot(sim.st, w), newGov(seed), words);
    expect(stats.find((s) => s.id === 'sTrust')?.title).toBe(
      'Zaufanie mieszkańców do zarządu (0–100). Przy zerze ludzie odejdą.',
    );
    expect(stats.find((s) => s.id === 'sAnger')?.title).toBe(
      'Wkurzenie mieszkańców (0–100). Przy stu walne odwoła zarząd.',
    );
    expect(comingText(3, words)).toBe('3 osoby idą od bramy');
    const zarzad = sim.st.apts.find((a) => a.ours)!.apt;
    expect(aptState(aptView(sim.st, w, zarzad, snapshot(sim.st, w).apts)!, words)).toBe('Mieszkanie zarządu');
    expect(
      buildSheet(
        buildMenu({}, () => true, words),
        false,
        words,
      ).body,
    ).toContain('Dwa miejsca do spania, w spółdzielni zmieści się więcej ludzi.');
  });

  it('menu poleceń przy bramie, praca w karcie osoby, miejsce na podwórku i powód nastroju', () => {
    const { sim, w } = game('przymorze');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    expect(commandsAt(sim.st, w, [core.id], gateTiles(w)[0]).map((m) => m.label)).toContain('Pilnować bramy');
    core.job = job('guard', 0);
    expect(jobText(sim.st, w, core)).toBe('Trzyma wartę przy bramie.');
    core.job = job('stay', STAY_MEAL);
    expect(jobText(sim.st, w, core)).toBe('Je wspólny posiłek przy stole zarządu.');
    expect(canPlace(sim.st, w, 'ogrodek', 0, 0, 0).why).toBe(
      'Tylko na podwórku za siatką, z dala od bramy, dziur i drzwi.',
    );
    applyGov(sim.st, w, { ...emptyEffects(), needs: [{ id: sim.st.people[core.person].id, d: { mood: -2 } }] });
    expect(core.moods.at(-1)?.why).toBe('Sprawy spółdzielni');
  });
});
