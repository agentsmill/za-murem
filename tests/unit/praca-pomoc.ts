/* Pomocniki testów pracy ludzi (src/sim/praca.ts) i werbunku wędrowców: wyłączenie nowych rodzajów pracy w testach, które
   zakładają, że bezczynny zarząd robi tylko to, co robił przed automatem, wyłączenie przełącznika „może wychodzić za siatkę”
   (w trybie zwykłym jest domyślnie włączony, `zaSiatkeDomyslnie`) w testach, które zakładają, że bez niego nikt sam nie
   wychodzi, przewinięcie gry do rana, skończenie samouczka i ustawienie losowania zaproszenia. Żaden pomocnik niczego nie
   losuje ani nie dotyka niczego poza stanem gry, który dostaje (losowanie zaproszenia ustawia tylko jego ziarno). */

import { nextRandom } from '../../src/core/rng.ts';
import { dayOf, hourOf } from '../../src/sim/clock.ts';
import { NOWE } from '../../src/sim/praca.ts';
import type { Pawn, Sim, SimState } from '../../src/sim/sim.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';

/** Wszystkim z zarządu rodzaje pracy z `NOWE` (drwal, naprawy, noszenie, warsztat, szaber, badania) na 0 przez
    polecenia i jeden krok: automat robi wtedy tylko to, co robił zarząd przed pracą ludzi (koza, kuchnia, budowa
    planów, noszenie drewna w obrębie siatki). Dla testów, które sprawdzają co innego niż automat. */
export function wylaczAutomat(sim: Sim): void {
  for (const p of sim.st.pawns) {
    if (p.kind !== 'core') continue;
    for (const r of NOWE) sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: 0 });
  }
  sim.step();
}

/** Przełącznik „może wychodzić za siatkę” wybranym pionkom rdzenia przez polecenie `zasiatke` (zadziała od następnego
    kroku). `on`: ta sama wartość dla wszystkich albo funkcja pionka. Wartość równa domyślnej trybu nie zostawia śladu
    w stanie, wartość przeciwna zapisuje jawne `true` albo `false`. */
export function przelacznik(sim: Sim, pionki: readonly Pawn[], on: boolean | ((p: Pawn) => boolean)): void {
  for (const p of pionki)
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: typeof on === 'function' ? on(p) : on });
}

/** Wszystkim z zarządu „może wychodzić za siatkę” na wyłączone (jawne `false` w trybie zwykłym, bez śladu w zombie) przez
    polecenia i jeden krok: stan z czasów, gdy przełącznik był domyślnie wyłączony. Dla testów, które zakładają, że bez
    przełącznika nikt sam za siatkę nie wychodzi. */
export function bezPrzelacznika(sim: Sim): void {
  przelacznik(
    sim,
    sim.st.pawns.filter((p) => p.kind === 'core'),
    false,
  );
  sim.step();
}

/** kroki, aż będzie dzień `dzien`, 6:00 (pierwszy tick tej godziny); gra już po tej chwili stoi w miejscu */
export function doRana(sim: Sim, dzien: number): void {
  const tick = (): number => sim.st.tick;
  while (dayOf(tick()) < dzien || (dayOf(tick()) === dzien && hourOf(tick()) < 6)) sim.step();
}

/** samouczek skończony (jak po ostatnim kroku); w świecie bez samouczka (`step` −1) bez zmian */
export function skonczSamouczek(sim: Sim): void {
  const tut = sim.st.tut;
  if (tut.step < 0) return;
  tut.step = TUT_STEPS.length;
  tut.at = TUT_STEPS.map((_, k) => ((tut.at[k] ?? -1) >= 0 ? tut.at[k] : sim.st.tick));
}

/** Ustawia st.rng tak, żeby następne losowanie wypadło poniżej szansy (`ok`) albo nie (`!ok`): wynik zaproszenia wędrowca
    (`decyzjaWerbunku` w src/sim/sim.ts) jest wtedy z góry znany, bez zgadywania ziarna. Wołać tuż przed rozstrzygnięciem,
    z prawdziwą szansą z chwili rozstrzygnięcia (`szansaZaproszenia`). */
export function ustawLosowanie(st: SimState, ok: boolean, szansa: number): void {
  for (let s = 1; s < 100000; s++) {
    if (nextRandom({ s }) < szansa === ok) {
      st.rng.s = s;
      return;
    }
  }
  throw new Error('brak ziarna losowania');
}
