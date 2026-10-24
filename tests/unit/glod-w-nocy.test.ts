/* Głód w nocy, propozycja do decyzji Mateusza (docs/ocena/2026-10-24-glod-przy-zapasie.md, rozdział 8a): `wantsMeal`
   mówi „z wielkiego głodu zawsze”, a racje mają wyjątek „poza wielkim głodem” (trzeci posiłek poniżej STARVING), ale śpiący
   zarząd nocą nie wstawał na posiłek nawet przy najedzeniu 0 i pełnej spiżarni. Przy racjach, gdzie drugi posiłek wypada
   przed południem, zostawiało to ludzi co noc z najedzeniem 0–10. Wartownik dalej nie schodzi z posterunku na posiłek. */

import { describe, expect, it } from 'vitest';
import { createSim, type Laws, Sim, type SimState, STARVING } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const atHour = (day: number, hh: number) => Math.round(((day - 1) * 24 + hh - 15) * 800);
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const RACJE: Partial<Laws> = { foodMult: 0.75 };

/** gra z pełną spiżarnią: jedzenia 100 porcji i drewno w składzie dokładane co rano, żeby zapas niczego nie ograniczał */
function gra(laws: Partial<Laws>) {
  const st = createSim(w, 3, { core: 4 });
  const sim = new Sim(w, st);
  if (Object.keys(laws).length) sim.setLaws(laws);
  const zasil = () => {
    const jedz = st.things.find((t) => t.kind === 'jedzenie');
    if (jedz) jedz.n = Math.max(jedz.n, 100);
    for (const i of w.interior.sklad) {
      const pile = st.things.find((t) => t.kind === 'drewno' && t.y * size + t.x === i);
      if (pile) pile.n = 10;
      else
        st.things.push({
          id: st.nextThing++,
          kind: 'drewno',
          x: i % size,
          y: Math.floor(i / size),
          w: 1,
          h: 1,
          rot: 0,
          n: 10,
          fuel: 0,
          by: -1,
          owner: -1,
        });
    }
  };
  zasil();
  return { st, sim, zasil };
}

describe('głód w nocy', () => {
  it('śpiący z najedzeniem poniżej STARVING wstaje w nocy i je, choć racje zabraniają posiłku ponad dwa na dobę', () => {
    const { st, sim } = gra(RACJE);
    while (st.tick < atHour(2, 23)) sim.step();
    const kto = core(st).find((p) => p.job?.t === 'sleep' && p.job.phase === 1);
    expect(kto).toBeDefined();
    const p = kto!;
    // wyczerpany limit dwóch posiłków od 6:00 i głód: tylko wyjątek „z wielkiego głodu” może go nakarmić
    p.ate = 2;
    p.needs!.food = 6;
    const meal0 = p.lastMeal;
    while (st.tick < atHour(3, 1)) sim.step();
    expect(p.lastMeal).not.toBe(meal0);
    expect(p.needs!.food).toBeGreaterThan(STARVING);
  });

  it('najedzony śpi dalej: reguła dotyczy tylko wielkiego głodu', () => {
    const { st, sim } = gra(RACJE);
    while (st.tick < atHour(2, 23)) sim.step();
    const p = core(st).find((q) => q.job?.t === 'sleep' && q.job.phase === 1)!;
    p.ate = 2;
    p.needs!.food = 40;
    const meal0 = p.lastMeal;
    while (st.tick < atHour(3, 1)) sim.step();
    expect(p.lastMeal).toBe(meal0);
    expect(p.job?.t).toBe('sleep');
  });

  it('racje przy pełnej spiżarni: w nocy nikt nie śpi z najedzeniem poniżej STARVING (pięć dób)', () => {
    const { st, sim, zasil } = gra(RACJE);
    let godzin = 0;
    for (let day = 2; day <= 6; day++) {
      zasil();
      while (st.tick < atHour(day + 1, 6)) {
        sim.step();
        if (st.tick % 20 || st.tick < atHour(2, 6)) continue;
        for (const p of core(st))
          if (!p.away && p.job?.t === 'sleep' && p.job.phase === 1 && p.needs!.food < STARVING) godzin += 1 / 40;
      }
    }
    // przed poprawką: ok. 40 godzin śpiących z najedzeniem poniżej 10 w pięć dób (cztery osoby, pełna spiżarnia)
    expect(godzin).toBeLessThan(2);
  });
});
