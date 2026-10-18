/* Teksty spoza zarządu według miejsca (słownik wspólnoty z src/gov/miejsce.ts): w domu jednorodzinnym (Zielonki)
   okna, pomoc, samouczek, cele, pasek, karta osoby i domu, menu budowy i poleceń i powód nastroju bez słów z bloku
   (także bez mieszkania: lokum komitetu to dom), a cel drugiego dnia „Przeszukajcie dom” da się zaliczyć; w bloku
   (Przymorze) po staremu. */

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

/** słowa z bloku, których w domu nie ma w tekstach interfejsu, także mieszkanie i mieszkańcy (w domu jednorodzinnym
    lokum komitetu to dom, a ludzie to sąsiedzi); łóżka piętrowe to nazwa łóżek, więc bez „piętr” */
const BLOKOWE = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszka[nń]/i;

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
  title: 'T',
  text: 'a',
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
    expect(statsOf(snap, null, words).find((s) => s.id === 'sBoards')?.title).toBe(
      'Deski: 4. Na łaty, naprawy i budowę. Dają je przeszukiwanie domu i rozbiórka gruzu.',
    );
    // karta domu komitetu: bez numeru mieszkania, z pomieszczeniami do przeszukania
    const v = aptView(sim.st, w, 0, snap.apts)!;
    expect(aptState(v, words)).toBe('Dom komitetu ulicy');
    for (const touch of [false, true]) {
      const card = visible(aptCard(v, touch, words));
      expect(card).not.toMatch(BLOKOWE);
      expect(card).toContain(' Dom ');
      expect(card).toContain('Przeszukane: 0 z 5');
      expect(card).toContain(touch ? 'Przytrzymajcie palec w domu: Przeszukać.' : 'Prawy przycisk w domu: Przeszukać.');
    }
    const sheet = buildSheet(
      buildMenu({}, (kind) => kind !== 'magazyn', words),
      false,
      words,
    );
    expect(sheet.body).toContain('Dwa miejsca do spania, w domu zmieści się więcej ludzi.');
    expect(sheet.body).toContain('Nie ma gdzie postawić: brak wolnego miejsca w pokoju naszego domu.');
    expect(sheet.body).toContain('Brakuje: deski 20, złom 10. Deski daje przeszukiwanie domu i rozbiórka gruzu.');
    expect(sheet.body).toContain('Brakuje: złom 14, części 10. Złom daje przeszukiwanie domu i rozbiórka gruzu.');
    for (const t of sheetTexts(sheet)) expect(t).not.toMatch(BLOKOWE);
    expect(canPlace(sim.st, w, 'warsztat', 0, 0, 0).why).toBe('Tylko w pokoju w naszym domu.');
    expect(canPlace(sim.st, w, 'kuchnia_spoleczna', 0, 0, 0).why).toBe('Tylko w kuchni w naszym domu.');
    const help = helpSheet(false, false, words).body;
    expect(help).toContain('<h3 class="help-h">Budowa i przeszukiwanie domu</h3>');
    expect(help).toContain(
      'Klik w dom pokazuje jego kartę: co w nim już przeszukane. Prawy przycisk w domu: Przeszukać.',
    );
    expect(help).toContain('W wersji 0.4 są noce za siatką, budowa, dom do przeszukania, przybysze i tryb zombie.');
  });

  it('cel drugiego dnia: dom komitetu do przeszukania, pierwsze pomieszczenie zalicza cel', () => {
    const { sim, w } = game('zielonki');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const gov = newGov(1);
    const goal = (touch: boolean) =>
      goalsDay2(sim.st, gov, { touch, wood: 0, woodReady: false, holes: 0, words }).find(
        (g) => g.key === 'przeszukaj',
      )!;
    expect([goal(false).text, goal(false).how]).toEqual([
      'Przeszukajcie dom.',
      'Kliknijcie dom: karta pokaże, co w nim już przeszukane. Potem prawy przycisk w domu: „Przeszukać”.',
    ]);
    expect(goal(true).how).toBe(
      'Stuknijcie dom: karta pokaże, co w nim już przeszukane. Potem przytrzymajcie palec w domu: „Przeszukać”.',
    );
    expect(goal(false).done).toBe(false);
    // dom ma jedno mieszkanie, komitetu: każde jego pomieszczenie da się przeszukać, zająć nie ma czego
    const room = w.interior.rooms.find((r) => r.kind === 'pokoj')!;
    const tile = w.interior.room.indexOf(room.id);
    const labels = () => commandsAt(sim.st, w, [core.id], tile).map((m) => m.label);
    expect(labels()).toContain('Przeszukać pokój');
    expect(labels()).not.toContain('Zająć mieszkanie');
    for (const l of labels()) expect(l).not.toMatch(BLOKOWE);
    const mats = () => sim.st.things.filter((t) => ['deski', 'zlom', 'czesci', 'jedzenie', 'leki'].includes(t.kind));
    const before = mats().reduce((a, t) => a + t.n, 0);
    sim.push({ t: 'search', ids: [core.id], room: room.id });
    for (let k = 0; k < 6000 && !sim.st.apts[0].searched.includes(room.id); k++) sim.step();
    expect(sim.st.apts[0].searched).toEqual([room.id]);
    expect(mats().reduce((a, t) => a + t.n, 0)).toBeGreaterThan(before);
    expect(goal(false).done).toBe(true);
    // przeszukane pomieszczenie znika z menu, karta domu je liczy
    expect(labels()).not.toContain('Przeszukać pokój');
    const v = aptView(sim.st, w, 0, snapshot(sim.st, w).apts)!;
    expect(visible(aptCard(v, false, words))).toContain('Przeszukane: 1 z 5');
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
    expect(govFence(src)!.holes[0].name).toBe('za trzepakiem');
    expect(govFence(src, wordsOf(placeOf(demoWorld('zielonki').w)))!.holes[0].name).toBe('od północy');
    // bez trzepaka (sterta na jego miejscu) dziura ma nazwę z kierunku
    expect(govFence({ ...src, props: [{ ...src.props[0], kind: 'deski' }] })!.holes[0].name).toBe('od północy');
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
    expect(stats.find((s) => s.id === 'sBoards')?.title).toMatch(
      /Na łaty, naprawy i budowę\. Dają je przeszukiwanie pustych mieszkań i rozbiórka mebli\.$/,
    );
    // mieszkanie zarządu bez przeszukiwania, puste z numerem, poleceniami i przeszukaniem
    const snap = snapshot(sim.st, w);
    const zarzad = aptView(sim.st, w, sim.st.apts.find((a) => a.ours)!.apt, snap.apts)!;
    expect(aptState(zarzad, words)).toBe('Mieszkanie zarządu');
    expect(zarzad.search).toBe(false);
    expect(aptCard(zarzad, false, words)).not.toContain('Przeszukane');
    const empty = aptView(sim.st, w, sim.st.apts.find((a) => a.state === 'puste')!.apt, snap.apts)!;
    const card = aptCard(empty, false, words);
    expect(card).toContain(`<h2>Mieszkanie ${empty.apt + 1}</h2>`);
    expect(card).toContain('Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.');
    expect(aptCard(empty, true, words)).toContain(
      'Przytrzymajcie palec w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
    );
    const body = buildSheet(
      buildMenu({}, (kind) => kind !== 'magazyn', words),
      false,
      words,
    ).body;
    expect(body).toContain('Dwa miejsca do spania, w spółdzielni zmieści się więcej ludzi.');
    expect(body).toContain('Nie ma gdzie postawić: brak wolnego miejsca w pokoju naszego mieszkania.');
    expect(body).toContain('Brakuje: deski 20, złom 10. Deski daje przeszukiwanie pustych mieszkań i rozbiórka mebli.');
    expect(body).toContain('Brakuje: złom 14, części 10. Złom daje przeszukiwanie i rozbiórka śmieci i sprzętów.');
    expect(canPlace(sim.st, w, 'warsztat', 0, 0, 0).why).toBe('Tylko w pokoju w naszym mieszkaniu.');
  });

  it('cel drugiego dnia i pomoc: puste mieszkania, mieszkanie zarządu bez przeszukiwania', () => {
    const { sim, w } = game('przymorze');
    const goal = (touch: boolean) =>
      goalsDay2(sim.st, null, { touch, wood: 0, woodReady: false, holes: 0, words }).find(
        (g) => g.key === 'przeszukaj',
      )!;
    expect([goal(false).text, goal(false).how, goal(true).how]).toEqual([
      'Przeszukajcie puste mieszkanie.',
      'Kliknijcie mieszkanie w siedzibie: karta pokaże, czy jest puste i co w nim zostało. Potem prawy przycisk w nim: „Przeszukać”.',
      'Stuknijcie mieszkanie w siedzibie: karta pokaże, czy jest puste i co w nim zostało. Potem przytrzymajcie w nim palec: „Przeszukać”.',
    ]);
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const home = sim.st.apts.find((a) => a.state === 'zarzad')!.apt;
    const room = w.interior.rooms.find((r) => r.apt === home && r.kind === 'pokoj')!;
    const labels = commandsAt(sim.st, w, [core.id], w.interior.room.indexOf(room.id)).map((m) => m.label);
    expect(labels.some((l) => l.startsWith('Przeszukać'))).toBe(false);
    const help = helpSheet(false, false, words).body;
    expect(help).toContain('<h3 class="help-h">Budowa i puste mieszkania</h3>');
    expect(help).toContain(
      'Klik w mieszkanie siedziby pokazuje jego kartę: czy jest puste, dlaczego, co do naprawy i co już przeszukane. Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
    );
    expect(help).toContain('Deski, złom i części dają przeszukiwanie pustych mieszkań i rozbiórka.');
    expect(help).toContain('budowa, puste mieszkania do przeszukania i naprawy, przybysze i tryb zombie.');
    expect(helpSheet(true, false, words).body).toContain(
      'Stuknięcie w mieszkanie siedziby pokazuje jego kartę: czy jest puste, dlaczego, co do naprawy i co już przeszukane. Przytrzymanie palca w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
    );
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
