/* Opis uchwały „Racje głodowe” mówi graczowi o koszcie, który daje reguła posiłków w symulacji: posiłek dopiero przy
   wyraźnym głodzie (RATION_HUNGRY) i najwyżej RATION_MEALS razy na dobę, więc na noc ludzie kładą się głodni. Bez tego zdania
   uchwała wyglądała na samą oszczędność, a zwykły bot i silnik osady AI, które ją podpisywały, głodowały przy pełnej spiżarni
   (docs/ocena/2026-10-24-glod-przy-zapasie.md). Oszczędność opisuje prawdziwie: porcja jest o 25% mniejsza (mnożnik 0,75),
   a zjedzone jedzenie spada o kilka procent (zmierzone około 7% w tests/unit/racje.test.ts, odkąd śpiący jedzą w nocy
   z głodu), więc opis nie obiecuje, że „jedzenie schodzi o 25% wolniej”. */

import { describe, expect, it } from 'vitest';
import { M1_LAWS_EN } from '../../src/gov/tresc.en.ts';
import { M1_LAWS } from '../../src/gov/tresc.ts';
import { lawEffects, newGov } from '../../src/gov/zarzad.ts';
import { RATION_HUNGRY, RATION_MEALS } from '../../src/sim/sim.ts';

describe('opis racji głodowych', () => {
  it('reguła posiłków, którą opis streszcza, jest taka jak w symulacji', () => {
    expect(RATION_MEALS).toBe(2);
    expect(RATION_HUNGRY).toBe(25);
  });
  it('mniejsza porcja w opisie to mnożnik uchwały: 0,75, czyli o 25% mniej na posiłek', () => {
    const st = newGov(1);
    expect(lawEffects(st).foodMult).toBe(1);
    st.laws.signed.u_racje = true;
    expect(lawEffects(st).foodMult).toBe(0.75);
  });
  it('po polsku mówi o mniejszych porcjach, głodzie, dwóch posiłkach i nocy, a nie o jedzeniu schodzącym o 25% wolniej', () => {
    const d = M1_LAWS.u_racje.desc;
    expect(d).toContain('Porcje są o 25% mniejsze');
    expect(d).toContain('dopiero przy wyraźnym głodzie');
    expect(d).toContain('najwyżej dwa razy na dobę');
    expect(d).toContain('na noc kładą się głodni');
    expect(d).not.toContain('wolniej');
  });
  it('po angielsku mówi to samo', () => {
    const d = M1_LAWS_EN.u_racje.desc;
    expect(d).toContain('Portions are 25% smaller');
    expect(d).toContain('only when they are really hungry');
    expect(d).toContain('at most twice a day');
    expect(d).toContain('go to bed hungry');
    expect(d).not.toContain('more slowly');
  });
});
