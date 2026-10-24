/* Opis uchwały „Racje głodowe” mówi graczowi o koszcie, który daje reguła posiłków w symulacji: posiłek dopiero przy
   wyraźnym głodzie (RATION_HUNGRY) i najwyżej RATION_MEALS razy na dobę, więc na noc ludzie kładą się głodni. Bez tego zdania
   uchwała wyglądała na samą oszczędność, a zwykły bot i silnik osady AI, które ją podpisywały, głodowały przy pełnej spiżarni
   (docs/ocena/2026-10-24-glod-przy-zapasie.md). */

import { describe, expect, it } from 'vitest';
import { M1_LAWS_EN } from '../../src/gov/tresc.en.ts';
import { M1_LAWS } from '../../src/gov/tresc.ts';
import { RATION_HUNGRY, RATION_MEALS } from '../../src/sim/sim.ts';

describe('opis racji głodowych', () => {
  it('reguła posiłków, którą opis streszcza, jest taka jak w symulacji', () => {
    expect(RATION_MEALS).toBe(2);
    expect(RATION_HUNGRY).toBe(25);
  });
  it('po polsku mówi o głodzie, dwóch posiłkach i nocy', () => {
    const d = M1_LAWS.u_racje.desc;
    expect(d).toContain('dopiero przy wyraźnym głodzie');
    expect(d).toContain('najwyżej dwa razy na dobę');
    expect(d).toContain('na noc kładą się głodni');
  });
  it('po angielsku mówi to samo', () => {
    const d = M1_LAWS_EN.u_racje.desc;
    expect(d).toContain('only when they are really hungry');
    expect(d).toContain('at most twice a day');
    expect(d).toContain('go to bed hungry');
  });
});
