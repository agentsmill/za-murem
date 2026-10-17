import { describe, expect, it } from 'vitest';
import { createSim, FOOD_START } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

/* Więcej jedzenia (Mateusz po raporcie o głodzie zarządu): zapasy na start starczają czterem osobom na pięć dni
   dwóch posiłków. */

describe('jedzenie', () => {
  it('zapasy na start: dwa posiłki dziennie dla czterech osób na pięć dni', () => {
    expect(FOOD_START).toBeGreaterThanOrEqual(36);
    const st = createSim(mockBlock(), 3, { core: 4 });
    expect(st.things.filter((t) => t.kind === 'jedzenie').reduce((a, t) => a + t.n, 0)).toBe(FOOD_START);
  });
});
