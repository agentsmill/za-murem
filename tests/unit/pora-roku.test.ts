/* Podpis pory roku na zegarze nad paskiem (src/ui/pasek.ts, `sezonPodpis`): pora roku i rok idą z zegara gry, a nie ze stałego
   napisu „jesień 2051”, który zostawał także w zimie. Pora jest tą, według której liczy się pogoda (`seasonOf`), po polsku
   i po angielsku. Wpisanie podpisu do DOM robi `hud()` w src/main.ts (zimowy zrzut: `npm run shots -- pora-roku`). */

import { describe, expect, it } from 'vitest';
import { SEASONS_EN } from '../../src/content/data.en.ts';
import { dayOf, outdoorTemp, SEASON_DAYS, SEASONS, seasonOf, TICKS_PER_DAY, yearOf } from '../../src/sim/clock.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { sezonPodpis } from '../../src/ui/pasek.ts';
import { demoWorld } from './miejsce-pomoc.ts';

/** tick o północy dnia `d` (dzień 1 zaczyna się o 15:00, więc tick 0 to dzień 1; północ przed dniem d to koniec dnia d − 1) */
const tickDnia = (d: number, godzina = 12): number => (d - 1) * TICKS_PER_DAY + ((godzina - 15) * TICKS_PER_DAY) / 24;

describe('sezonPodpis: pora roku i rok z zegara gry', () => {
  it('dzień 1 to jesień 2051, dzień 11 zima 2051, dzień 21 wiosna 2052, dzień 31 lato 2052', () => {
    expect(sezonPodpis(0).pl).toBe('jesień 2051');
    expect(sezonPodpis(0).en).toBe('autumn 2051');
    for (const [dzien, pl, en] of [
      [1, 'jesień 2051', 'autumn 2051'],
      [10, 'jesień 2051', 'autumn 2051'],
      [11, 'zima 2051', 'winter 2051'],
      [20, 'zima 2051', 'winter 2051'],
      [21, 'wiosna 2052', 'spring 2052'],
      [30, 'wiosna 2052', 'spring 2052'],
      [31, 'lato 2052', 'summer 2052'],
      [40, 'lato 2052', 'summer 2052'],
      [41, 'jesień 2052', 'autumn 2052'],
      [51, 'zima 2052', 'winter 2052'],
      [61, 'wiosna 2053', 'spring 2053'],
    ] as const) {
      const t = tickDnia(dzien);
      expect(dayOf(t), `dzień ${dzien}`).toBe(dzien);
      expect(sezonPodpis(t), `dzień ${dzien}`).toEqual({ pl, en });
    }
  });

  it('pora w podpisie jest tą, według której liczy się pogoda (seasonOf), w każdej dobie i o każdej porze', () => {
    for (let d = 1; d <= 130; d++)
      for (const h of [0, 6, 12, 18, 23]) {
        const t = tickDnia(d, h);
        const s = seasonOf(t);
        expect(sezonPodpis(t).pl.split(' ')[0], `dzień ${d} ${h}:00`).toBe(SEASONS[s]);
        expect(sezonPodpis(t).en.split(' ')[0], `dzień ${d} ${h}:00`).toBe(SEASONS_EN[s]);
        expect(s, `dzień ${d} ${h}:00`).toBe(Math.floor((dayOf(t) - 1) / SEASON_DAYS) % 4);
      }
  });

  it('podpis zmienia się dokładnie z początkiem pory (o północy dnia 11), a rok z początkiem wiosny', () => {
    const polnoc = (d: number) => tickDnia(d, 0);
    expect(sezonPodpis(polnoc(11) - 1).pl).toBe('jesień 2051');
    expect(sezonPodpis(polnoc(11)).pl).toBe('zima 2051');
    expect(yearOf(polnoc(21) - 1)).toBe(2051);
    expect(yearOf(polnoc(21))).toBe(2052);
    // rok rośnie co 40 dni i nigdy nie maleje
    let rok = yearOf(0);
    for (let d = 1; d <= 400; d++) {
      const r = yearOf(tickDnia(d));
      expect(r).toBeGreaterThanOrEqual(rok);
      rok = r;
    }
    expect(yearOf(tickDnia(400))).toBe(2051 + Math.floor((Math.floor(399 / SEASON_DAYS) + 2) / 4));
  });

  it('pogoda zgadza się z podpisem: w „zimie” średnio zimniej niż w „jesieni” i „wiośnie”', () => {
    const srednia = (od: number) => {
      let suma = 0;
      for (let d = od; d < od + SEASON_DAYS; d++) suma += outdoorTemp(7, tickDnia(d));
      return suma / SEASON_DAYS;
    };
    expect(sezonPodpis(tickDnia(15)).pl).toMatch(/^zima/);
    expect(srednia(11)).toBeLessThan(srednia(1));
    expect(srednia(11)).toBeLessThan(srednia(21));
    expect(srednia(11)).toBeLessThan(-3);
  });

  it('migawka symulacji w zimie (dzień 12) ma tę samą porę co podpis', () => {
    const { w, seed } = demoWorld('zielonki');
    const sim = new Sim(w, createSim(w, seed, { core: 4 }));
    sim.st.tick = tickDnia(12);
    const snap = snapshot(sim.st, w);
    expect(snap.seasonName).toBe('zima');
    expect(sezonPodpis(sim.st.tick).pl).toBe('zima 2051');
    expect(sezonPodpis(sim.st.tick).en).toBe('winter 2051');
    expect(snap.day).toBe(12);
  });
});
