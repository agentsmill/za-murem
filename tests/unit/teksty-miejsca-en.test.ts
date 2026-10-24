/* Teksty według miejsca po angielsku (słownik wspólnoty wordsEn z src/gov/miejsce.ts), jak teksty-miejsca.test.ts po
   polsku: w domu jednorodzinnym (Zielonki) okna, pomoc, samouczek, cele, pasek, karta osoby i mieszkania, menu budowy
   i poleceń bez słów z bloku (co-op, board, estate, stairwell, the gate bez garden), w bloku (Przymorze) zarząd
   i brama jak dotąd. Do tego epilogi zwycięstwa, drogi i cel R8, powody odmów w oknie planu wyprawy, podpowiedź
   „To arms!”, panel Pracy i linia o zgonie bez board, gate (bez garden), co-op, stairwell, carpet rack i cellar w domu. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LawPath } from '../../src/content/data.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { powodOdmowy } from '../../src/gov/dzienne.ts';
import { placeOf, wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import type { GovInput, Prompt } from '../../src/gov/typy.ts';
import { celZMiejsca, wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { type Droga, ocenDrogi, wlaczZwyciestwo } from '../../src/gov/zwyciestwo.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { gateTiles } from '../../src/sim/perimeter.ts';
import { PROGI_DOMYSLNE, type Priorytet, RODZAJE } from '../../src/sim/praca.ts';
import { createSim, type Job, Sim, STAY_MEAL } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { buildMenu, buildPanelHtml } from '../../src/ui/budowa.ts';
import { goalsOf } from '../../src/ui/cele.ts';
import { alarmTytul } from '../../src/ui/jezyk.ts';
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
import { opisRodzaju, pracaPanelHtml, type WidokPracy } from '../../src/ui/praca.ts';
import { comingText } from '../../src/ui/przybycie.ts';
import { nowyStanSciezki } from '../../src/ui/sciezka.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';
import { planWyprawySheet } from '../../src/ui/wyprawa.ts';
import { drogiSheet, epilogSheet, type StatyEpilogu } from '../../src/ui/zwyciestwo.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { celeR1, odczytZ } from './sciezka-pomoc.ts';

beforeEach(() => ustawJezyk('en'));
afterEach(() => ustawJezyk('pl'));

/** słowa z bloku, których w domu nie ma w angielskich tekstach interfejsu (siedziba w domu to dom komitetu, nie mieszkanie);
    „Research board” to tablica badań ze słowniczka, a nie zarząd, więc „board” po „research” wolno, tak jak „garden gate” */
const BLOKOWE =
  /co-op|(?<!research )\bboard\b|general meeting|\bestate\b|carpet rack|stairwell|\bblocks?\b|\bflats?\b|pavilion|common room|service charge|\bresidents?\b|(?<!garden )\bgate\b/i;

/** angielskie odpowiedniki bramy, zarządu, spółdzielni, klatki, trzepaka i piwnicy w epilogach zwycięstwa, drogach, oknie
    planu wyprawy, podpowiedzi alarmu, panelu Pracy i linii o zgonie (lista z przeglądu spójności); „block by block” i „A new
    estate” (nazwa drogi) zostają, bo to nie słownik miejsca */
const BLOKOWE_MIEJSCA =
  /co-op|(?<!research )\bboard\b|(?<!garden )\bgate\b|stairwell|carpet rack|cellar|basement|\bflats?\b/i;

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
    const goals: { key: string; text: string; how: string }[] = [15, 21].flatMap((hour) =>
      [false, true].flatMap((touch) => goalsOf(sim.st, gov, { touch, kitchen: 9, hour, words, wordsEn: e })),
    );
    expect(goals.find((g) => g.key === 'rozkaz')?.text).toBe('Send them to the dead tree in the garden.');
    const day2 = celeR1(sim.st, sim.w, gov, { touch: false, words, wordsEn: e });
    expect(day2.find((g) => g.key === 'przeszukaj')?.text).toBe('Search the house.');
    // najpierw zaznaczyć kogoś, potem prawy przycisk w pokoju domu; karta domu tylko pokazuje, co już przeszukane
    expect(day2.find((g) => g.key === 'przeszukaj')?.how).toBe(
      'Select someone from the committee and right-click inside a room of the house: “Search the …”. To see what has been searched, click the house while nobody is selected and read its card.',
    );
    const touchDay2 = celeR1(sim.st, sim.w, gov, { touch: true, words, wordsEn: e });
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
    expect(helpSheet(false, false, words, e).body).toContain(
      'Version 0.4 has nights behind the fence, building, a house to search, neighbours, the city map, research, roads to victory and Zombie mode. Power in eras 3–6 and the rest of the economy will come later.',
    );
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

describe('po angielsku w domu: zwycięstwo, wyprawa, alarm, Praca i zgon bez board, gate, co-op, stairwell, carpet rack i cellar', () => {
  const { w, seed, words, e } = game('zielonki');
  const place = placeOf(w);
  const STATY: StatyEpilogu = { dzien: 12, ludzi: 63, zmarli: 2, uchwaly: 3, spis: 2623 };
  const DROGI: Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];
  const SCIEZKI: (LawPath | null)[] = [null, 'porzadek', 'wspolnota', 'tech', 'base'];
  const body = (d: Droga, path: LawPath | null, mode: 'zwykly' | 'zombie' = 'zwykly') =>
    visible(epilogSheet(d, path, mode, STATY, words, e).body);

  it('epilogi: pięć dróg, każda ścieżka uchwał i oba tryby mówią garden gate, committee, fences i lawns', () => {
    for (const d of DROGI)
      for (const path of SCIEZKI)
        for (const mode of ['zwykly', 'zombie'] as const)
          for (const t of sheetTexts(epilogSheet(d, path, mode, STATY, words, e))) {
            expect(t, `${d} ${path} ${mode}`).not.toMatch(BLOKOWE_MIEJSCA);
            expect(polskieSlowa(t), `${d} ${path} ${mode}`).toEqual([]);
          }
    expect(body('ludnosc', null)).toContain(
      'The yard is noisy again. Rotas hang on the fences, the kids have their own gang, and someone is already drafting rules for mowing the lawns.',
    );
    expect(body('ludnosc', null)).toContain(
      'The street committee is still arguing whether this is a settlement now or still a street.',
    );
    expect(body('ludnosc', 'porzadek')).toContain(
      'The garden gate shuts at eight and the watch knows every newcomer by name.',
    );
    expect(body('ludnosc', 'wspolnota')).toContain('Every house has its own meeting and its own row over the rota');
    expect(body('technologia', null)).toContain('laying new lines from your garden gate across the whole city');
    expect(body('technologia', null, 'zombie')).toContain('march out of the garden gate and clear the city');
  });

  it('drogi do zwycięstwa: „co dalej” ludności i serii poranków mówi committee, ekran dróg bez board', () => {
    const i: GovInput = { ...new Atrapa(seed).input(), place };
    const gov = newGov(seed);
    wlaczZwyciestwo(gov);
    const ludnosc = (kamienie: number) => {
      gov.zwyciestwo!.kamienie = { ludnosc: kamienie };
      return ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!;
    };
    expect(ludnosc(0).dalej!.en).toBe('Get 10 people under the street committee.');
    expect(ludnosc(2).dalej!.en).toBe('Get 50 people under the street committee.');
    expect(ludnosc(4).dalej!.en).toContain('at 6:00 nobody on the committee is hungry');
    for (let k = 0; k <= 4; k++) {
      gov.zwyciestwo!.kamienie = { ludnosc: k };
      const ocena = ocenDrogi(gov, i);
      for (const d of ocena)
        for (const t of [d.dalej?.en, d.wkrotce?.en]) expect(t ?? '', `${d.droga} ${k}`).not.toMatch(BLOKOWE_MIEJSCA);
      expect(visible(drogiSheet(ocena).body), `ekran dróg, ${k} kamieni`).not.toMatch(BLOKOWE_MIEJSCA);
    }
  });

  it('cel R8 „ludność”: z drogi i zapasowy, oba pod street committee', () => {
    const r8 = ROZDZIALY.find((r) => r.k === 'r8')!.cele.find((c) => c.key === 'ludnosc')!;
    const gov = newGov(seed);
    const o = odczytZ(new Sim(w, createSim(w, seed, { core: 4 })).st, w, gov);
    expect(r8.tekst(o, nowyStanSciezki())).toBe('Get more people under the street committee.');
    wlaczZwyciestwo(gov);
    const z = odczytZ(new Sim(w, createSim(w, seed, { core: 4 })).st, w, gov);
    expect(r8.tekst(z, nowyStanSciezki())).toBe('Get 10 people under the street committee.');
    for (const t of [r8.tekst(o, nowyStanSciezki()), r8.tekst(z, nowyStanSciezki()), r8.jak(z, nowyStanSciezki())])
      expect(t).not.toMatch(BLOKOWE_MIEJSCA);
  });

  it('okno planu wyprawy: powody odmów mówią committee i garden gate', () => {
    const atr = new Atrapa(seed);
    const st = newGov(seed);
    wlaczMiasto(st);
    const i: GovInput = { ...atr.input(), day: 2, hour: 10, minute: 0, place };
    let cel = celZMiejsca({ klucz: 'poi:0:2', kat: 'apteka', x: 200, y: 0, odl: 200, nazwa: '' });
    for (let k = 0; cel.zapas === null || cel.zapas < 6; k++)
      cel = celZMiejsca({ klucz: `poi:${k}:2`, kat: 'apteka', x: 200, y: 0, odl: 200, nazwa: '' });
    expect(powodOdmowy(st, i, cel, [])!.en).toBe('Select someone from the committee.');
    expect(powodOdmowy(st, i, cel, ['s999'])!.en).toBe('There is no such person on the committee.');
    const ugryziona: GovInput = { ...i, people: i.people.map((p, k) => (k === 0 ? { ...p, bitten: true } : p)) };
    expect(powodOdmowy(st, ugryziona, cel, [i.people[0].id])!.en).toMatch(
      /has been bitten and is not going past the garden gate\.$/,
    );
    const bezImion = (t: string) => i.people.reduce((a, p) => a.replaceAll(p.name, ''), t);
    const plan = planWyprawySheet(cel, i, st, new Set());
    expect(visible(plan.body)).toContain('Select someone from the committee.');
    for (const t of sheetTexts(plan)) expect(bezImion(t)).not.toMatch(BLOKOWE_MIEJSCA);
  });

  it('podpowiedź „To arms!” z committee', () => {
    expect(alarmTytul(words, e).en).toBe('Everyone fit on the committee goes on watch');
    expect(alarmTytul(game('przymorze').words, game('przymorze').e).en).toBe('Everyone fit on the board goes on watch');
  });

  it('panel Pracy: naprawy w domu, ostrzeżenie o Ogniu i pusty zarząd mówią committee', () => {
    const prio = RODZAJE.map(() => 0 as Priorytet);
    const widok: WidokPracy = {
      wiersze: [{ osoba: 0, imie: 'Anna', zawod: 'Hydraulik', prio, stale: null, zaSiatke: false }],
      widoczne: RODZAJE.filter((r) => r !== 'badania'),
      progi: { ...PROGI_DOMYSLNE },
      zombie: false,
      touch: false,
      kol: 'naprawy',
      zlecen: 3,
    };
    const html = pracaPanelHtml(widok, true, words, e);
    expect(html).not.toMatch(BLOKOWE_MIEJSCA);
    expect(html).toContain('Patching holes in the fence and repairs in our house.');
    expect(html).toContain('Nobody on the committee has Fire switched on');
    expect(opisRodzaju('naprawy', true, words, e)).toBe('Patching holes in the fence and repairs in our house.');
    const pusty = pracaPanelHtml({ ...widok, wiersze: [] }, true, words, e);
    expect(pusty).toContain('Nobody on the committee.');
    expect(pusty).not.toMatch(BLOKOWE_MIEJSCA);
  });

  it('zgon bezimiennego mieszkańca: „One of the neighbours”', () => {
    const gov = newGov(seed);
    const i: GovInput = {
      ...new Atrapa(seed).input(),
      place,
      dead: [{ id: '', name: 'Ktoś', cause: 'rany', tick: 0 }],
    };
    govUpdate(gov, i);
    const linia = gov.log.map((l) => l.txt.en).find((t) => t.startsWith('One of the'));
    expect(linia).toMatch(/^One of the neighbours has died/);
  });
});

describe('po angielsku w bloku (Przymorze)', () => {
  const { words, e } = game('przymorze');

  it('zarząd, brama i spółdzielnia jak dotąd', () => {
    expect(eventSheet(event(), words, e).kicker).toBe('On the estate');
    expect(lawSheet(law(3), words, e).title).toBe('Board resolution');
    expect(helpSheet(false, false, words, e).body).toContain('You are the board of a housing co-op in 2051.');
    expect(helpSheet(false, false, words, e).body).toContain(
      'Version 0.4 has nights behind the fence, building, empty flats to search and repair, neighbours, the city map, research, roads to victory and Zombie mode. Power in eras 3–6 and the rest of the economy will come later.',
    );
    expect(comingText(1, words, e)).toBe('1 person is coming in from the gate');
    const { sim, w } = game('przymorze');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const labels = commandsAt(sim.st, w, [core.id], gateTiles(w)[0]).map((m) => m.label);
    expect(labels).toContain('Keep watch at the gate');
  });

  it('epilogi, „co dalej” ludności, alarm i panel Pracy jak dotąd: gate, stairwells, carpet rack, board, co-op', () => {
    const { w, seed } = game('przymorze');
    const STATY: StatyEpilogu = { dzien: 12, ludzi: 63, zmarli: 2, uchwaly: 3 };
    const body = (path: LawPath | null, d: Droga = 'ludnosc', mode: 'zwykly' | 'zombie' = 'zwykly') =>
      visible(epilogSheet(d, path, mode, STATY, words, e).body);
    expect(body(null)).toContain(
      'Rotas hang in the stairwells, the kids have their own gang, and someone is already drafting rules for the carpet rack.',
    );
    expect(body(null)).toContain(
      'The board is still arguing whether this is a settlement now or still a housing co-op.',
    );
    expect(body('porzadek')).toContain('The gate shuts at eight and the watch knows every newcomer by name.');
    expect(body('wspolnota')).toContain('Every stairwell has its own meeting');
    expect(body(null, 'technologia')).toContain('from your gate across the whole city');
    expect(body(null, 'technologia', 'zombie')).toContain('march out of the gate and clear the city');
    for (const path of [null, 'porzadek', 'wspolnota'] as const)
      expect(epilogSheet('ludnosc', path, 'zwykly', STATY)).toEqual(
        epilogSheet('ludnosc', path, 'zwykly', STATY, words, e),
      );
    const i: GovInput = { ...new Atrapa(seed).input(), place: placeOf(w) };
    const gov = newGov(seed);
    wlaczZwyciestwo(gov);
    expect(ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!.dalej!.en).toBe('Get 10 people under the board.');
    gov.zwyciestwo!.kamienie = { ludnosc: 4 };
    expect(ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!.dalej!.en).toContain(
      'at 6:00 nobody on the board is hungry',
    );
    expect(alarmTytul(words, e).en).toBe('Everyone fit on the board goes on watch');
    expect(opisRodzaju('naprawy', true, words, e)).toBe('Patching holes in the fence and repairs in our flats.');
    const widok: WidokPracy = {
      wiersze: [],
      widoczne: RODZAJE.filter((r) => r !== 'badania'),
      progi: { ...PROGI_DOMYSLNE },
      zombie: false,
      touch: false,
      kol: null,
      zlecen: 0,
    };
    expect(pracaPanelHtml(widok, true, words, e)).toContain('Nobody on the board.');
    const gov2 = newGov(seed);
    govUpdate(gov2, { ...i, dead: [{ id: '', name: 'Ktoś', cause: 'rany', tick: 0 }] });
    expect(gov2.log.map((l) => l.txt.en).find((t) => t.startsWith('One of the'))).toMatch(
      /^One of the residents has died/,
    );
  });

  it('cel przeszukania: zaznaczyć osobę z zarządu, potem prawy przycisk w pustym mieszkaniu', () => {
    const { sim, w } = game('przymorze');
    const day2 = (touch: boolean) =>
      celeR1(sim.st, w, null, { touch, words, wordsEn: e }).find((g) => g.key === 'przeszukaj')!;
    expect(day2(false).text).toBe('Search an empty flat.');
    expect(day2(false).how).toBe(
      'Select someone from the board and right-click inside an empty flat: “Search the …”. To see which flats are empty, click a flat while nobody is selected and read its card.',
    );
    expect(day2(true).how).toBe(
      'Tap someone from the board and press and hold inside an empty flat: “Search the …”. To see which flats are empty, tap a flat while nobody is selected and read its card.',
    );
  });
});
