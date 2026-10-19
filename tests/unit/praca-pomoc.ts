/* Pomocniki testów pracy ludzi (src/sim/praca.ts): wyłączenie nowych rodzajów pracy w testach, które zakładają, że
   bezczynny zarząd robi tylko to, co robił przed automatem, przewinięcie gry do rana i skończenie samouczka.
   Żaden pomocnik nie losuje ani nie dotyka niczego poza stanem gry, który dostaje. */

import { dayOf, hourOf } from '../../src/sim/clock.ts';
import { NOWE } from '../../src/sim/praca.ts';
import type { Sim } from '../../src/sim/sim.ts';
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
