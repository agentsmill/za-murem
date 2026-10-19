/* Zarząd spółdzielni w M1 (warstwa Frostpunka nad RimWorldem): karta nocy o 20:00, uchwały z zaufaniem
   i wkurzeniem jak w 0.3, wydarzenia w tempie liczonym w minutach przy ekranie. Bez rysowania i bez
   importów z src/sim: symulacja co krok podaje GovInput (odczyt jak snapshot()), dostaje GovEffects
   i stosuje je u siebie. Stan to zwykły JSON z własnym ziarnem, więc ten sam ciąg wejść i decyzji
   daje ten sam wynik, także po zapisie i wczytaniu.

   Użycie w pętli gry:
     const gov = newGov(seed);
     co krok: apply(govUpdate(gov, input));
     interfejs: pending(gov, input) → epilog zwycięstwa, raport, uchwała, karta nocy albo wydarzenie (w tej kolejności);
     odpowiedzi: setNight / confirmNight, signLaw, chooseEvent, ackReport (każda zwraca skutki).
   Wyprawa dzienna z mapy miasta (src/gov/dzienne.ts): `wyslijWyprawe` zapisuje ją w `st.wyprawy`, a `govUpdate` na
   początku kroku woła `wyprawyTick`, który rozlicza powroty (bez `st.wyprawy` nie robi nic).
   Drogi do zwycięstwa (src/gov/zwyciestwo.ts): na końcu kroku, po `checkOver` i tylko w trwającej grze, `govUpdate` woła
   `krokZwyciestwa` (kamienie milowe, licznik celu ludności, zwycięstwo; bez `st.zwyciestwo` z `wlaczZwyciestwo` nie robi
   nic), a `pending` oddaje epilog zwycięstwa przed raportem (pierwszy z kolejki `epilogi`). `grajDalej` zdejmuje pierwszy
   epilog, następny z kolejki pokazuje się zaraz po nim; zapis i gra zostają. */

import { ENDINGS_EN, przyczynaEn } from '../content/data.en.ts';
import { isTx, type Tx, tx, txOf } from '../core/jezyk.ts';
import { wyprawyTick } from './dzienne.ts';
import { placeIn, wordsEn, wordsOf } from './miejsce.ts';
import { CARD_DEADLINE, CARD_HOUR, confirm, makeCard, nightTick, setAssign } from './noc.ts';
import { FIRST_LAWS } from './tresc.ts';
import type { GameMode, GovEffects, GovInput, GovState, LawEffects, LawOption, Prompt } from './typy.ts';
import { lawEffects as effectsOfLaws, lawState, lawOptions as optionsOfLaws, sign } from './uchwaly.ts';
import { przyjeciaZUlicy, wiesci } from './wiesci.ts';
import { atHour, decision, emptyEffects, gameMin, logGov, mood, rnd, zeroStock } from './wspolne.ts';
import { choose, eventTick, eventView, FIRST_EVENT } from './wydarzenia.ts';
import { krokZwyciestwa } from './zwyciestwo.ts';

export const GOV_VERSION = 1;
/** wieczorne zebranie zarządu (uchwała) pół godziny przed kartą nocy */
export const LAW_HOUR = 19;
export const LAW_MINUTE = 30;

export function newGov(seed: number, mode: GameMode = 'zwykly'): GovState {
  const st: GovState = {
    v: 1,
    seed,
    rng: { s: (seed ^ 0x6a09e667) | 0 },
    trust: 50,
    anger: 20,
    laws: { signed: {}, last: -1e9, path: null },
    books: {},
    nextId: 100,
    ev: { next: FIRST_EVENT, done: {}, last: {}, active: null, when: 0 },
    night: null,
    cardDay: 0,
    lawDay: 0,
    lawPending: false,
    report: null,
    reports: [],
    evening: { campfire: false, burned: 0 },
    flags: { dog: false, flashlight: false, torch: false },
    tonight: { alert: 0, boost: 0, bonus: 0, bonusDay: 0 },
    visits: {},
    lastGuards: [],
    later: [],
    decisions: [],
    log: [],
    over: null,
    mode,
    deadN: 0,
  };
  st.ev.next = FIRST_EVENT + Math.floor(rnd(st) * 11);
  return st;
}

const busy = (st: GovState) => !!st.report || st.lawPending || (!!st.night && !st.night.confirmed);

/** krok zarządu: powroty wypraw dziennych, wieczorne zebranie, karta nocy, przebieg nocy, wydarzenia, koniec gry, drogi
    do zwycięstwa; zwraca skutki do zastosowania */
export function govUpdate(st: GovState, i: GovInput): GovEffects {
  const fx = emptyEffects();
  if (st.over) return fx;
  if (i.hour >= 18 && i.light?.campfire) st.evening.campfire = true;
  // powroty wypraw dziennych z mapy miasta (bez st.wyprawy nic: skróty botów bez mapy zostają)
  wyprawyTick(st, i, fx);
  const t = gameMin(i);
  // wieczorne zebranie: uchwała, kiedy odnowienie na to pozwala
  if (!st.lawPending && st.lawDay < i.day && t >= atHour(i.day, LAW_HOUR, LAW_MINUTE) && i.hour < CARD_DEADLINE) {
    st.lawDay = i.day;
    if (optionsOfLaws(st, i).some((o) => o.s === 'ok')) {
      st.lawPending = true;
      const z = wordsOf(placeIn(i)).zarzad.dk;
      const meeting = placeIn(i).kind === 'dom' ? 'Committee meeting' : 'Board meeting';
      logGov(
        st,
        i,
        i.day === 1
          ? tx(`Zebranie ${z} przy kozie: pierwsza uchwała.`, `${meeting} by the stove: the first resolution.`)
          : tx(`Zebranie ${z}: można podjąć uchwałę.`, `${meeting}: you can pass a resolution.`),
        true,
        fx,
      );
    }
  }
  if (st.lawPending && (i.hour >= CARD_DEADLINE || i.day > st.lawDay)) {
    st.lawPending = false;
    logGov(st, i, tx('Zebranie skończyło się bez uchwały.', 'The meeting ended without a resolution.'), false, fx);
  }
  // karta nocy o 20:00
  if (!st.night && st.cardDay < i.day && i.hour >= CARD_HOUR) {
    st.cardDay = i.day;
    const { card, assign } = makeCard(st, i);
    st.night = {
      day: i.day,
      card,
      assign,
      confirmed: false,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: st.trust,
      a0: st.anger,
      returned: [],
      loot: zeroStock(),
      slept: [],
    };
    logGov(st, i, tx(`Karta nocy. ${card.forecast.pl}`, `Night orders. ${card.forecast.en}`), true, fx);
  }
  if (st.night && !st.night.confirmed && (i.hour >= CARD_DEADLINE || i.day > st.night.day)) confirm(st, i, fx, true);
  nightTick(st, i, fx);
  mourn(st, i, fx);
  wiesci(st, i, fx);
  przyjeciaZUlicy(st, i, fx);
  eventTick(st, i, fx, busy(st));
  checkOver(st, i, fx);
  // drogi do zwycięstwa (bez wlaczZwyciestwo nic); w przegranej grze nikt już nie wygrywa
  if (!st.over) krokZwyciestwa(st, i, fx);
  return fx;
}

const CAUSE: Record<string, string> = { rany: 'od ran', gorączka: 'po ugryzieniu', amputacja: 'przy amputacji' };

/** nowe zgony: ktoś z zarządu to zaufanie −5 i wkurzenie +8, mieszkaniec −2 i +3; raz na zgon, linia do raportu */
function mourn(st: GovState, i: GovInput, fx: GovEffects): void {
  const dead = i.dead ?? [];
  const from = st.deadN ?? 0;
  if (dead.length <= from) return;
  st.deadN = dead.length;
  for (const d of dead.slice(from)) {
    const why = CAUSE[d.cause] ?? d.cause;
    const whyEn = przyczynaEn(d.cause);
    const line = d.id
      ? tx(`${d.name} nie żyje, ${why}.`, `${d.name} has died ${whyEn}.`)
      : tx(`Nie żyje jeden z mieszkańców, ${why}.`, `One of the ${wordsEn(placeIn(i)).mieszkancy} has died ${whyEn}.`);
    if (d.id) mood(st, -5, 8);
    else mood(st, -2, 3);
    if (st.night?.confirmed) st.night.lines.push(line);
    logGov(st, i, line, true, fx);
  }
}

function checkOver(st: GovState, i: GovInput, fx: GovEffects): void {
  if (st.over) return;
  if (!i.people.length) st.over = 'pustka';
  else if (st.anger >= 100) st.over = 'odwolanie';
  else if (st.trust <= 0) st.over = 'exodus';
  if (!st.over) return;
  // po angielsku tytuł zakończenia według miejsca („Game over: the street meeting recalled the committee.”)
  const t = (wordsEn(placeIn(i)).koniec[st.over] ?? ENDINGS_EN[st.over]).title;
  logGov(st, i, tx(`Koniec gry: ${st.over}.`, `Game over: ${t[0].toLowerCase()}${t.slice(1)}.`), true, fx);
}

/** co czeka na decyzję gracza, w kolejności: epilog zwycięstwa (pierwszy z kolejki, kolejne po „Graj dalej”), raport rano,
    uchwała, karta nocy, wydarzenie */
export function pending(st: GovState, i: GovInput): Prompt | null {
  const epilog = st.zwyciestwo?.epilogi[0];
  if (epilog) return { k: 'zwyciestwo', droga: epilog };
  if (st.report) return { k: 'raport', report: st.report };
  if (st.lawPending) {
    const first = st.lawDay === 1;
    const options = first
      ? FIRST_LAWS.map((id) => lawState(st, i, id))
      : optionsOfLaws(st, i).filter((o) => o.s === 'ok');
    return { k: 'uchwala', day: st.lawDay, first, options };
  }
  if (st.night && !st.night.confirmed) return { k: 'karta', card: st.night.card, assign: { ...st.night.assign } };
  const ev = eventView(st, i);
  return ev ? { k: 'wydarzenie', ...ev } : null;
}

/** przydział na karcie nocy (klucz opcji z karty); false, gdy nie wolno */
export const setNight = (st: GovState, id: string, key: string): boolean => setAssign(st, id, key);

/** zatwierdzenie karty nocy: wyprawy wychodzą, warta staje, plan napadu na tę noc */
export function confirmNight(st: GovState, i: GovInput): GovEffects {
  const fx = emptyEffects();
  confirm(st, i, fx, false);
  return fx;
}

/** podpis uchwały albo null: zarząd nic nie uchwala (pierwszego wieczoru kosztuje to trochę zaufania) */
export function signLaw(st: GovState, i: GovInput, id: string | null): GovEffects {
  const fx = emptyEffects();
  if (id === null) {
    if (!st.lawPending) return fx;
    st.lawPending = false;
    if (st.lawDay === 1) mood(st, -1, 0);
    decision(st, i, 'uchwala');
    logGov(
      st,
      i,
      tx(
        `${wordsOf(placeIn(i)).Zarzad} odłożył uchwałę na później.`,
        `${wordsEn(placeIn(i)).Zarzad} put the resolution off.`,
      ),
      false,
      fx,
    );
    return fx;
  }
  if (!sign(st, i, id)) return fx;
  if (st.lawPending) st.lawPending = false;
  decision(st, i, 'uchwala');
  checkOver(st, i, fx);
  return fx;
}

/** odpowiedź na wydarzenie (numer wyboru) */
export function chooseEvent(st: GovState, i: GovInput, k: number): GovEffects {
  const fx = emptyEffects();
  if (choose(st, i, fx, k)) checkOver(st, i, fx);
  return fx;
}

/** raport przeczytany; z odczytem gry także cisza po nim (najbliższe wydarzenie najwcześniej po QUIET s) */
export function ackReport(st: GovState, i?: GovInput): void {
  if (!st.report) return;
  st.report = null;
  if (i) decision(st, i, 'raport');
}

export const lawOptions = (st: GovState, i: GovInput): LawOption[] => optionsOfLaws(st, i);
export const lawEffects = (st: GovState): LawEffects => effectsOfLaws(st);

export function saveGov(st: GovState): string {
  return JSON.stringify(st);
}

export function loadGov(json: string): GovState {
  const st = JSON.parse(json) as GovState;
  if (st.v !== GOV_VERSION) throw new Error(`nieznana wersja zapisu zarządu: ${st.v}`);
  return normalizujTeksty(st);
}

/** tekst ze starego zapisu (polski napis) albo już w obu językach */
const txt = (t: unknown): Tx => (isTx(t) ? t : txOf(String(t ?? '')));
const optTxt = (t: unknown): Tx | undefined => (t === undefined || t === null ? undefined : txt(t));

/** Zapis sprzed angielskiej wersji ma w kronice, raportach, karcie nocy i liniach na rano zwykłe polskie napisy.
    Zamienia je w miejscu na Tx z tym samym tekstem w obu językach (stare wpisy zostają po polsku także po
    angielsku); zapis z Tx przechodzi bez zmian. Zwraca ten sam stan. */
export function normalizujTeksty(st: GovState): GovState {
  for (const l of st.log ?? []) l.txt = txt(l.txt);
  for (const l of st.later ?? []) l.line = txt(l.line);
  for (const r of [...(st.reports ?? []), ...(st.report ? [st.report] : [])]) r.lines = r.lines.map(txt);
  const n = st.night;
  if (n) {
    n.lines = n.lines.map(txt);
    const c = n.card;
    c.chanceWord = txt(c.chanceWord);
    c.forecast = txt(c.forecast);
    c.advice = txt(c.advice);
    for (const p of c.posts) p.name = txt(p.name);
    if (c.horde) c.horde.word = txt(c.horde.word);
    for (const p of c.people)
      for (const o of p.options) {
        o.label = txt(o.label);
        o.why = optTxt(o.why);
        o.note = optTxt(o.note);
        if (o.why === undefined) delete o.why;
        if (o.note === undefined) delete o.note;
      }
  }
  return st;
}

export type { GovEffects, GovInput, GovState, LawEffects, LawOption, Prompt } from './typy.ts';
