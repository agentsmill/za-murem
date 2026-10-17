import { describe, expect, it } from 'vitest';
import { mulberry } from '../../src/core/rng.ts';
import { lootOf } from '../../src/sim/mieszkania.ts';
import { createSim, FOOD_START } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

/* Więcej jedzenia (Mateusz po raporcie o głodzie zarządu): zapasy na start starczają czterem osobom na pięć dni
   dwóch posiłków, a kuchnie w opuszczonych mieszkaniach dają konserwy, także po zalaniu i pożarze. */

const avg = (why: Parameters<typeof lootOf>[0], kind: Parameters<typeof lootOf>[1]) => {
  let sum = 0;
  for (let k = 1; k <= 400; k++) sum += lootOf(why, kind, 12, mulberry(k * 7919)).jedzenie ?? 0;
  return sum / 400;
};

describe('jedzenie', () => {
  it('zapasy na start: dwa posiłki dziennie dla czterech osób na pięć dni', () => {
    expect(FOOD_START).toBeGreaterThanOrEqual(36);
    const st = createSim(mockBlock(), 3, { core: 4 });
    expect(st.things.filter((t) => t.kind === 'jedzenie').reduce((a, t) => a + t.n, 0)).toBe(FOOD_START);
  });

  it('kuchnia w opuszczonym mieszkaniu daje konserwy: po wyjeździe średnio co najmniej 2, po zalaniu i pożarze też coś', () => {
    expect(avg('wyjazd', 'kuchnia')).toBeGreaterThanOrEqual(2);
    expect(avg('wymarcie', 'kuchnia')).toBeGreaterThanOrEqual(1.2);
    expect(avg('zalanie', 'kuchnia')).toBeGreaterThan(0.5);
    expect(avg('pozar', 'kuchnia')).toBeGreaterThan(0.3);
    // w pokoju mniej niż w kuchni
    expect(avg('wyjazd', 'pokoj')).toBeLessThan(avg('wyjazd', 'kuchnia'));
  });
});
