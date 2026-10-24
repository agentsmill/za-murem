/* Teksty spoza zarządu według miejsca (słownik wspólnoty z src/gov/miejsce.ts): w domu jednorodzinnym (Zielonki)
   okna, pomoc, samouczek, cele, pasek, karta osoby i domu, menu budowy i poleceń i powód nastroju bez słów z bloku
   (także bez mieszkania: lokum komitetu to dom), a cel drugiego dnia „Przeszukajcie dom” da się zaliczyć; w bloku
   (Przymorze) po staremu. Do tego epilogi zwycięstwa, drogi i cel R8, powody odmów w oknie planu wyprawy, podpowiedź
   „Do broni!”, panel Pracy i linia o zgonie bez bramy, zarządu, spółdzielni, klatek, trzepaka i piwnicy w domu. */

import { describe, expect, it } from 'vitest';
import type { LawPath } from '../../src/content/data.ts';
import { powodOdmowy } from '../../src/gov/dzienne.ts';
import { BLOK, placeOf, waszeLokum, wordsEnOfWorld, wordsOf, wordsOfWorld } from '../../src/gov/miejsce.ts';
import type { GovInput, Prompt } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { celZMiejsca, wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { type Droga, ocenDrogi, wlaczZwyciestwo } from '../../src/gov/zwyciestwo.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { START_MINUTES, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
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
import { govFence } from '../../src/ui/siatka.ts';
import { planWyprawySheet } from '../../src/ui/wyprawa.ts';
import { drogiSheet, epilogSheet, type StatyEpilogu } from '../../src/ui/zwyciestwo.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { pl } from './po-angielsku.ts';
import { celeR1, odczytZ } from './sciezka-pomoc.ts';

/** słowa z bloku, których w domu nie ma w tekstach interfejsu, także mieszkanie i mieszkańcy (w domu jednorodzinnym
    lokum komitetu to dom, a ludzie to sąsiedzi); łóżka piętrowe to nazwa łóżek, więc bez „piętr” */
const BLOKOWE = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszka[nń]/i;

/** słowa z bloku, których w epilogach zwycięstwa, drogach, oknie planu wyprawy, podpowiedzi alarmu, panelu Pracy i linii
    o zgonie w domu nie ma (lista z przeglądu spójności); „osiedl” zostaje w nazwie drogi „Nowe osiedle”, więc nie wchodzi */
const BLOKOWE_MIEJSCA = /bram|zarząd|spółdziel|klatk|trzepak|piwnic/i;

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

describe('waszeLokum: lokum zarządu w dopełniaczu i w drugiej osobie, jedna funkcja dla dróg i dla ścieżki celów', () => {
  it('blok to „waszego mieszkania”, dom jednorodzinny „waszego domu”, świat bez siedziby jak blok', () => {
    expect(waszeLokum(wordsOfWorld(demoWorld('przymorze').w))).toBe('waszego mieszkania');
    expect(waszeLokum(wordsOfWorld(demoWorld('zielonki').w))).toBe('waszego domu');
    expect(waszeLokum(wordsOf(BLOK))).toBe('waszego mieszkania');
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
    const goals: { key: string; text: string; how: string }[] = [15, 21].flatMap((hour) =>
      [false, true].flatMap((touch) => goalsOf(sim.st, gov, { touch, kitchen: 9, hour, words })),
    );
    expect(goals.find((g) => g.key === 'rozkaz')?.text).toBe('Wyślijcie go do suchego drzewa w ogrodzie.');
    for (const touch of [false, true]) goals.push(...celeR1(sim.st, sim.w, gov, { touch, words }));
    expect(goals.map((g) => g.key)).toContain('dyzur');
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
    const sheet = buildPanelHtml(
      buildMenu({}, (kind) => kind !== 'magazyn', words),
      { tab: null, kind: null },
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
    expect(help).toContain(
      'W wersji 0.4 są noce za siatką, budowa, dom do przeszukania, sąsiedzi, mapa miasta, badania w pracowni, drogi do zwycięstwa i tryb zombie. Prąd w erach 3–6 i reszta gospodarki przyjdą później.',
    );
  });

  it('cel drugiego dnia: dom komitetu do przeszukania, pierwsze pomieszczenie zalicza cel', () => {
    const { sim, w } = game('zielonki');
    const core = sim.st.pawns.find((p) => p.kind === 'core')!;
    const gov = newGov(1);
    const goal = (touch: boolean) => celeR1(sim.st, w, gov, { touch, words }).find((g) => g.key === 'przeszukaj')!;
    expect([goal(false).text, goal(false).how]).toEqual([
      'Przeszukajcie dom.',
      'Zaznaczcie kogoś z komitetu i prawy przycisk w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: klik w dom, kiedy nikt nie jest zaznaczony.',
    ]);
    expect(goal(true).how).toBe(
      'Stuknijcie kogoś z komitetu i przytrzymajcie palec w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: stuknięcie w dom, kiedy nikt nie jest zaznaczony.',
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
    expect(pl(govFence(src)!.holes[0].name)).toBe('za trzepakiem');
    expect(pl(govFence(src, wordsOf(placeOf(demoWorld('zielonki').w)))!.holes[0].name)).toBe('od północy');
    // bez trzepaka (sterta na jego miejscu) dziura ma nazwę z kierunku
    expect(pl(govFence({ ...src, props: [{ ...src.props[0], kind: 'deski' }] })!.holes[0].name)).toBe('od północy');
  });
});

describe('w domu: zwycięstwo, wyprawa, alarm, Praca i zgon bez bramy, zarządu, spółdzielni, klatek, trzepaka i piwnicy', () => {
  const { w, seed, words } = game('zielonki');
  const e = wordsEnOfWorld(w);
  const place = placeOf(w);
  const STATY: StatyEpilogu = { dzien: 12, ludzi: 63, zmarli: 2, uchwaly: 3, spis: 2623 };
  const DROGI: Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];
  const SCIEZKI: (LawPath | null)[] = [null, 'porzadek', 'wspolnota', 'tech', 'base'];
  const body = (d: Droga, path: LawPath | null, mode: 'zwykly' | 'zombie' = 'zwykly') =>
    visible(epilogSheet(d, path, mode, STATY, words, e).body);

  it('epilogi: pięć dróg, każda ścieżka uchwał i oba tryby mówią furtką, komitetem, płotami i trawnikami', () => {
    for (const d of DROGI)
      for (const path of SCIEZKI)
        for (const mode of ['zwykly', 'zombie'] as const)
          for (const t of sheetTexts(epilogSheet(d, path, mode, STATY, words, e)))
            expect(t, `${d} ${path} ${mode}`).not.toMatch(BLOKOWE_MIEJSCA);
    expect(body('ludnosc', null)).toContain(
      'Na podwórku znowu jest gwarno. Na płotach wiszą grafiki dyżurów, dzieci mają swoją bandę, a ktoś już pisze regulamin koszenia trawników.',
    );
    expect(body('ludnosc', null)).toContain('Komitet ulicy dalej się spiera, czy to już osada, czy jeszcze ulica.');
    expect(body('ludnosc', 'porzadek')).toContain(
      'Furtka zamyka się o dwudziestej, a straż zna każdego nowego z imienia.',
    );
    expect(body('ludnosc', 'wspolnota')).toContain('Każdy dom ma swoje zebranie i swoją kłótnię o grafik');
    expect(body('technologia', null)).toContain('kładą nowe linie od waszej furtki przez całe miasto');
    expect(body('technologia', null, 'zombie')).toContain('wychodzą z furtki i czyszczą miasto');
  });

  it('drogi do zwycięstwa: „co dalej” ludności i serii poranków mówi komitetem, ekran dróg bez zarządu', () => {
    const i: GovInput = { ...new Atrapa(seed).input(), place };
    const gov = newGov(seed);
    wlaczZwyciestwo(gov);
    const ludnosc = (kamienie: number) => {
      gov.zwyciestwo!.kamienie = { ludnosc: kamienie };
      return ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!;
    };
    expect(ludnosc(0).dalej!.pl).toBe('Zbierzcie 10 osób pod komitetem ulicy.');
    expect(ludnosc(1).dalej!.pl).toBe('Zbierzcie 25 osób pod komitetem ulicy.');
    expect(ludnosc(2).dalej!.pl).toBe('Zbierzcie 50 osób pod komitetem ulicy.');
    expect(ludnosc(4).dalej!.pl).toContain('o 6:00 nikt z komitetu nie jest głodny');
    for (let k = 0; k <= 4; k++) {
      gov.zwyciestwo!.kamienie = { ludnosc: k };
      const ocena = ocenDrogi(gov, i);
      for (const d of ocena)
        for (const t of [d.dalej?.pl, d.wkrotce?.pl]) expect(t ?? '', `${d.droga} ${k}`).not.toMatch(BLOKOWE_MIEJSCA);
      expect(visible(drogiSheet(ocena).body), `ekran dróg, ${k} kamieni`).not.toMatch(BLOKOWE_MIEJSCA);
    }
  });

  it('cel R8 „ludność”: z drogi i zapasowy, oba pod komitetem ulicy', () => {
    const r8 = ROZDZIALY.find((r) => r.k === 'r8')!.cele.find((c) => c.key === 'ludnosc')!;
    const gov = newGov(seed);
    const o = odczytZ(new Sim(w, createSim(w, seed, { core: 4 })).st, w, gov);
    // bez dróg w zarządzie nie ma „co dalej” z ekranu dróg: zdanie zapasowe
    expect(r8.tekst(o, nowyStanSciezki())).toBe('Zbierzcie więcej osób pod komitetem ulicy.');
    wlaczZwyciestwo(gov);
    const z = odczytZ(new Sim(w, createSim(w, seed, { core: 4 })).st, w, gov);
    expect(r8.tekst(z, nowyStanSciezki())).toBe('Zbierzcie 10 osób pod komitetem ulicy.');
    for (const t of [r8.tekst(o, nowyStanSciezki()), r8.tekst(z, nowyStanSciezki()), r8.jak(z, nowyStanSciezki())])
      expect(t).not.toMatch(BLOKOWE_MIEJSCA);
  });

  it('okno planu wyprawy: powody odmów mówią komitetem i furtką', () => {
    const atr = new Atrapa(seed);
    const st = newGov(seed);
    wlaczMiasto(st);
    const i: GovInput = { ...atr.input(), day: 2, hour: 10, minute: 0, place };
    let cel = celZMiejsca({ klucz: 'poi:0:2', kat: 'apteka', x: 200, y: 0, odl: 200, nazwa: '' });
    for (let k = 0; cel.zapas === null || cel.zapas < 6; k++)
      cel = celZMiejsca({ klucz: `poi:${k}:2`, kat: 'apteka', x: 200, y: 0, odl: 200, nazwa: '' });
    expect(powodOdmowy(st, i, cel, [])!.pl).toBe('Wybierz kogoś z komitetu.');
    expect(powodOdmowy(st, i, cel, ['s999'])!.pl).toBe('Nie ma takiej osoby w komitecie.');
    const ugryziona: GovInput = { ...i, people: i.people.map((p, k) => (k === 0 ? { ...p, bitten: true } : p)) };
    expect(powodOdmowy(st, ugryziona, cel, [i.people[0].id])!.pl).toMatch(/nie wyjdzie za furtkę\.$/);
    // okno planu pokazuje ten sam powód nad podsumowaniem; imiona osób zostają poza sprawdzeniem (losowe nazwiska)
    const bezImion = (t: string) => i.people.reduce((a, p) => a.replaceAll(p.name, ''), t);
    const plan = planWyprawySheet(cel, i, st, new Set());
    expect(visible(plan.body)).toContain('Wybierz kogoś z komitetu.');
    for (const t of sheetTexts(plan)) expect(bezImion(t)).not.toMatch(BLOKOWE_MIEJSCA);
    const zUgryzionym = planWyprawySheet(cel, ugryziona, st, new Set([i.people[0].id]));
    expect(visible(zUgryzionym.body)).toContain('nie wyjdzie za furtkę.');
  });

  it('podpowiedź „Do broni!” z komitetem', () => {
    expect(alarmTytul(words, e).pl).toBe('Wszyscy zdolni z komitetu na wartę');
    expect(alarmTytul(game('przymorze').words, wordsEnOfWorld(demoWorld('przymorze').w)).pl).toBe(
      'Wszyscy zdolni z zarządu na wartę',
    );
  });

  it('panel Pracy: naprawy w domu, ostrzeżenie o Ogniu i pusty zarząd mówią komitetem', () => {
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
    const html = pracaPanelHtml(widok, false, words, e);
    expect(html).not.toMatch(BLOKOWE_MIEJSCA);
    expect(html).not.toMatch(/mieszkani/i);
    expect(html).toContain('Łatanie dziur w siatce i naprawy w naszym domu.');
    expect(html).toContain('Nikt w komitecie nie ma włączonego Ognia');
    expect(opisRodzaju('naprawy', false, words, e)).toBe('Łatanie dziur w siatce i naprawy w naszym domu.');
    const pusty = pracaPanelHtml({ ...widok, wiersze: [] }, false, words, e);
    expect(pusty).toContain('Nikogo w komitecie.');
    expect(pusty).not.toMatch(BLOKOWE_MIEJSCA);
  });

  it('zgon bezimiennego mieszkańca: „jeden z sąsiadów”', () => {
    const gov = newGov(seed);
    const i: GovInput = {
      ...new Atrapa(seed).input(),
      place,
      dead: [{ id: '', name: 'Ktoś', cause: 'rany', tick: 0 }],
    };
    govUpdate(gov, i);
    const linia = gov.log.map((l) => l.txt.pl).find((t) => t.startsWith('Nie żyje'));
    expect(linia).toBe('Nie żyje jeden z sąsiadów, od ran.');
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
    const body = buildPanelHtml(
      buildMenu({}, (kind) => kind !== 'magazyn', words),
      { tab: null, kind: null },
      false,
      words,
    ).body;
    expect(body).toContain('Dwa miejsca do spania, w spółdzielni zmieści się więcej ludzi.');
    expect(body).toContain('Nie ma gdzie postawić: brak wolnego miejsca w pokoju naszego mieszkania.');
    expect(body).toContain('Brakuje: deski 20, złom 10. Deski daje przeszukiwanie pustych mieszkań i rozbiórka mebli.');
    expect(body).toContain('Brakuje: złom 14, części 10. Złom daje przeszukiwanie i rozbiórka śmieci i sprzętów.');
    expect(canPlace(sim.st, w, 'warsztat', 0, 0, 0).why).toBe('Tylko w pokoju w naszym mieszkaniu.');
  });

  it('epilogi, „co dalej” ludności, alarm i panel Pracy po staremu: brama, klatki, trzepak, zarząd, spółdzielnia', () => {
    const { w, seed } = game('przymorze');
    const e = wordsEnOfWorld(w);
    const STATY: StatyEpilogu = { dzien: 12, ludzi: 63, zmarli: 2, uchwaly: 3 };
    const body = (path: LawPath | null, d: Droga = 'ludnosc', mode: 'zwykly' | 'zombie' = 'zwykly') =>
      visible(epilogSheet(d, path, mode, STATY, words, e).body);
    expect(body(null)).toContain(
      'Na klatkach wiszą grafiki dyżurów, dzieci mają swoją bandę, a ktoś już pisze regulamin trzepaka.',
    );
    expect(body(null)).toContain('Zarząd dalej się spiera, czy to już osada, czy jeszcze spółdzielnia.');
    expect(body('porzadek')).toContain('Brama zamyka się o dwudziestej, a straż zna każdego nowego z imienia.');
    expect(body('wspolnota')).toContain('Każda klatka ma swoje zebranie');
    expect(body(null, 'technologia')).toContain('od waszej bramy');
    expect(body(null, 'technologia', 'zombie')).toContain('wychodzą z bramy');
    // bez słów miejsca epilog mówi jak w bloku
    for (const path of [null, 'porzadek', 'wspolnota'] as const)
      expect(epilogSheet('ludnosc', path, 'zwykly', STATY)).toEqual(
        epilogSheet('ludnosc', path, 'zwykly', STATY, words, e),
      );
    const i: GovInput = { ...new Atrapa(seed).input(), place: placeOf(w) };
    const gov = newGov(seed);
    wlaczZwyciestwo(gov);
    const ludnosc = ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!;
    expect(ludnosc.dalej!.pl).toBe('Zbierzcie 10 osób pod zarządem.');
    gov.zwyciestwo!.kamienie = { ludnosc: 4 };
    expect(ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!.dalej!.pl).toContain(
      'o 6:00 nikt z zarządu nie jest głodny',
    );
    expect(alarmTytul(words, e).pl).toBe('Wszyscy zdolni z zarządu na wartę');
    expect(opisRodzaju('naprawy', false, words, e)).toBe('Łatanie dziur w siatce i naprawy w naszych mieszkaniach.');
    const widok: WidokPracy = {
      wiersze: [],
      widoczne: RODZAJE.filter((r) => r !== 'badania'),
      progi: { ...PROGI_DOMYSLNE },
      zombie: false,
      touch: false,
      kol: null,
      zlecen: 0,
    };
    expect(pracaPanelHtml(widok, false, words, e)).toContain('Nikogo w zarządzie.');
    // zgon bezimiennego mieszkańca: „jeden z mieszkańców”
    const gov2 = newGov(seed);
    govUpdate(gov2, { ...i, dead: [{ id: '', name: 'Ktoś', cause: 'rany', tick: 0 }] });
    expect(gov2.log.map((l) => l.txt.pl).find((t) => t.startsWith('Nie żyje'))).toBe(
      'Nie żyje jeden z mieszkańców, od ran.',
    );
  });

  it('cel drugiego dnia i pomoc: puste mieszkania, mieszkanie zarządu bez przeszukiwania', () => {
    const { sim, w } = game('przymorze');
    const goal = (touch: boolean) => celeR1(sim.st, w, null, { touch, words }).find((g) => g.key === 'przeszukaj')!;
    expect([goal(false).text, goal(false).how, goal(true).how]).toEqual([
      'Przeszukajcie puste mieszkanie.',
      'Zaznaczcie kogoś z zarządu i prawy przycisk w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: klik w mieszkanie, kiedy nikt nie jest zaznaczony.',
      'Stuknijcie kogoś z zarządu i przytrzymajcie palec w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: stuknięcie w mieszkanie, kiedy nikt nie jest zaznaczony.',
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
    expect(help).toContain(
      'W wersji 0.4 są noce za siatką, budowa, puste mieszkania do przeszukania i naprawy, sąsiedzi, mapa miasta, badania w pracowni, drogi do zwycięstwa i tryb zombie. Prąd w erach 3–6 i reszta gospodarki przyjdą później.',
    );
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
