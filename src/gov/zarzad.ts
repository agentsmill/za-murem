/* Zarząd spółdzielni w M1 (warstwa Frostpunka nad RimWorldem): karta nocy o 20:00, uchwały z zaufaniem
   i wkurzeniem jak w 0.3, wydarzenia w tempie liczonym w minutach przy ekranie. Bez rysowania i bez
   importów z src/sim: symulacja co krok podaje GovInput (odczyt jak snapshot()), dostaje GovEffects
   i stosuje je u siebie. Stan to zwykły JSON z własnym ziarnem, więc ten sam ciąg wejść i decyzji
   daje ten sam wynik, także po zapisie i wczytaniu.

   Użycie w pętli gry:
     const gov = newGov(seed);
     co krok: apply(govUpdate(gov, input));
     interfejs: pending(gov, input) → karta, uchwała, wydarzenie albo raport;
     odpowiedzi: setNight / confirmNight, signLaw, chooseEvent, ackReport (każda zwraca skutki). */

import { CARD_DEADLINE, CARD_HOUR, confirm, makeCard, nightTick, setAssign } from './noc.ts';
import { FIRST_LAWS } from './tresc.ts';
import type { GovEffects, GovInput, GovState, LawEffects, LawOption, Prompt } from './typy.ts';
import { lawEffects as effectsOfLaws, lawState, lawOptions as optionsOfLaws, sign } from './uchwaly.ts';
import { atHour, decision, emptyEffects, gameMin, logGov, mood, rnd, zeroStock } from './wspolne.ts';
import { choose, eventTick, eventView, FIRST_EVENT } from './wydarzenia.ts';

export const GOV_VERSION = 1;
/** wieczorne zebranie zarządu (uchwała) pół godziny przed kartą nocy */
export const LAW_HOUR = 19;
export const LAW_MINUTE = 30;

export function newGov(seed: number): GovState {
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
  };
  st.ev.next = FIRST_EVENT + Math.floor(rnd(st) * 11);
  return st;
}

const busy = (st: GovState) => !!st.report || st.lawPending || (!!st.night && !st.night.confirmed);

/** krok zarządu: wieczorne zebranie, karta nocy, przebieg nocy, wydarzenia; zwraca skutki do zastosowania */
export function govUpdate(st: GovState, i: GovInput): GovEffects {
  const fx = emptyEffects();
  if (st.over) return fx;
  if (i.hour >= 18 && i.light?.campfire) st.evening.campfire = true;
  const t = gameMin(i);
  // wieczorne zebranie: uchwała, kiedy odnowienie na to pozwala
  if (!st.lawPending && st.lawDay < i.day && t >= atHour(i.day, LAW_HOUR, LAW_MINUTE) && i.hour < CARD_DEADLINE) {
    st.lawDay = i.day;
    if (optionsOfLaws(st, i).some((o) => o.s === 'ok')) {
      st.lawPending = true;
      logGov(
        st,
        i,
        i.day === 1 ? 'Zebranie zarządu przy kozie: pierwsza uchwała.' : 'Zebranie zarządu: można podjąć uchwałę.',
        true,
        fx,
      );
    }
  }
  if (st.lawPending && (i.hour >= CARD_DEADLINE || i.day > st.lawDay)) {
    st.lawPending = false;
    logGov(st, i, 'Zebranie skończyło się bez uchwały.', false, fx);
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
    logGov(st, i, `Karta nocy. ${card.forecast}`, true, fx);
  }
  if (st.night && !st.night.confirmed && (i.hour >= CARD_DEADLINE || i.day > st.night.day)) confirm(st, i, fx, true);
  nightTick(st, i, fx);
  eventTick(st, i, fx, busy(st));
  checkOver(st, i, fx);
  return fx;
}

function checkOver(st: GovState, i: GovInput, fx: GovEffects): void {
  if (st.over) return;
  if (!i.people.length) st.over = 'pustka';
  else if (st.anger >= 100) st.over = 'odwolanie';
  else if (st.trust <= 0) st.over = 'exodus';
  if (st.over) logGov(st, i, `Koniec gry: ${st.over}.`, true, fx);
}

/** co czeka na decyzję gracza, w kolejności: raport rano, uchwała, karta nocy, wydarzenie */
export function pending(st: GovState, i: GovInput): Prompt | null {
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
    logGov(st, i, 'Zarząd odłożył uchwałę na później.', false, fx);
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
  return st;
}

export type { GovEffects, GovInput, GovState, LawEffects, LawOption, Prompt } from './typy.ts';
