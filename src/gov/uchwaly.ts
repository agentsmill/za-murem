/* Uchwały, zaufanie i wkurzenie jak w 0.3: wykluczające się drogi Porządku i Wspólnoty, warunki,
   odnowienie (LAW_CD, 36 godzin gry między uchwałami), skutki od razu i codzienne. Dzienna zmiana
   zaufania i wkurzenia liczona rano z tego, co da się odczytać z symulacji (zimno, głód, ognisko,
   bezpieczeństwo, spalone meble, cechy ludzi) w miejsce budynków i kuchni z 0.3. */

import { LAW_CD } from '../content/data.ts';
import { tx, txJoin } from '../core/jezyk.ts';
import { placeIn, wordsOf } from './miejsce.ts';
import { lawDescTx, lawNameTx, M1_LAWS } from './tresc.ts';
import type { GovInput, GovState, LawEffects, LawOption } from './typy.ts';
import { burnedCount, gameMin, logGov, mood, round2 } from './wspolne.ts';

export const law = (st: GovState, id: string): boolean => !!st.laws.signed[id];

export function lawState(st: GovState, i: GovInput, id: string): LawOption {
  const L = M1_LAWS[id];
  const place = placeIn(i);
  const base = { id, name: lawNameTx(id, place), path: L.path, desc: lawDescTx(id, place) };
  if (law(st, id)) return { ...base, s: 'done' };
  if (L.path === 'porzadek' && st.laws.path === 'wspolnota')
    return { ...base, s: 'lock', why: tx('Wybraliście drogę wspólnoty.', 'You chose the path of community.') };
  if (L.path === 'wspolnota' && st.laws.path === 'porzadek')
    return { ...base, s: 'lock', why: tx('Wybraliście drogę porządku.', 'You chose the path of order.') };
  const miss = (L.req ?? []).filter((r) => !law(st, r));
  if (miss.length) {
    const need = txJoin(
      miss.map((r) => lawNameTx(r, place)),
      ', ',
    );
    return { ...base, s: 'lock', why: tx(`Najpierw: ${need.pl}`, `First: ${need.en}`) };
  }
  const cd = LAW_CD - (gameMin(i) - st.laws.last);
  const h = Math.ceil(cd / 60);
  if (cd > 0) return { ...base, s: 'cd', why: tx(`Kolejną uchwałę za ${h} h.`, `Next resolution in ${h} h.`) };
  return { ...base, s: 'ok' };
}

export const lawOptions = (st: GovState, i: GovInput): LawOption[] =>
  Object.keys(M1_LAWS).map((id) => lawState(st, i, id));

/** podpis uchwały; false, gdy nie wolno */
export function sign(st: GovState, i: GovInput, id: string): boolean {
  if (!M1_LAWS[id] || lawState(st, i, id).s !== 'ok') return false;
  const L = M1_LAWS[id];
  st.laws.signed[id] = true;
  st.laws.last = gameMin(i);
  if (L.path === 'porzadek' || L.path === 'wspolnota') st.laws.path = L.path;
  if (L.imm) mood(st, L.imm[0], L.imm[1]);
  const place = placeIn(i);
  const name = lawNameTx(id, place);
  logGov(
    st,
    i,
    tx(
      `Uchwała ${wordsOf(place).zarzad.dk}: ${name.pl}.`,
      `${place.kind === 'dom' ? 'Committee' : 'Board'} resolution: ${name.en}.`,
    ),
    true,
  );
  return true;
}

export function lawEffects(st: GovState): LawEffects {
  return {
    foodMult: (law(st, 'u_racje') ? 0.75 : 1) * (law(st, 'u_kociol') ? 1.1 : 1),
    burnMood: law(st, 'u_meble') ? 0.5 : 1,
    sharedMeals: law(st, 'u_kociol'),
    workStart: law(st, 'u_zebrania') ? 9 : 8,
    gateClosed: law(st, 'u_brama'),
  };
}

/**
 * Dzienna zmiana zaufania i wkurzenia (newDay z 0.3), liczona rano. Zwraca [zaufanie, wkurzenie].
 * Zamiast udziału zmarzniętych w budynkach: udział zarządu z ciepłem poniżej 40; zamiast kuchni:
 * udział najedzonych; ognisko wieczorem jak w 0.3; do tego bezpieczeństwo i spalone meble.
 */
export function dailyDrift(st: GovState, i: GovInput): [number, number] {
  const ppl = i.people;
  const n = Math.max(1, ppl.length);
  const share = (f: (p: (typeof ppl)[number]) => boolean) => ppl.filter(f).length / n;
  let a = -0.5;
  let tr = -0.5;
  const cold = share((p) => p.needs.warm < 40);
  a += 6 * cold;
  tr -= 3 * cold;
  tr += 0.4 * share((p) => p.needs.warm >= 60);
  if (st.evening.campfire) a -= 0.4;
  const fed = share((p) => p.needs.food >= 50);
  a -= 1 * fed;
  tr += 0.5 * fed;
  a += 2 * share((p) => p.needs.food < 25);
  const safe = ppl.reduce((s, p) => s + p.needs.safe, 0) / n;
  if (safe < 35) a += 1;
  else if (safe > 70) tr += 0.3;
  for (const [id, L] of Object.entries(M1_LAWS))
    if (law(st, id) && L.daily) {
      tr += L.daily[0];
      a += L.daily[1];
    }
  for (const p of ppl) {
    if (p.traits.includes('lubiany')) tr += 0.3;
    if (p.traits.includes('klotliwy')) a += 0.3;
    if (p.traits.includes('optymista')) a -= 0.2;
  }
  const burned = Math.max(0, burnedCount(i.burned) - st.evening.burned);
  a += 0.3 * burned * (law(st, 'u_meble') ? 0.5 : 1);
  st.evening = { campfire: false, burned: burnedCount(i.burned) };
  const dT = round2(tr);
  const dA = round2(a);
  mood(st, dT, dA);
  return [dT, dA];
}
