import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { type Command, createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const a = ADDRESSES[0];
const world: World = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 3 });

/** polecenia zaplanowane na konkretne ticki */
function script(w: World): [number, Command][] {
  const s = w.size;
  return [
    [10, { t: 'move', ids: [1], to: 150 * s + 150 }],
    [500, { t: 'move', ids: [2, 3], to: 220 * s + 210 }],
    [TICKS_PER_DAY + 7, { t: 'move', ids: [1, 2, 3, 4], to: 100 * s + 260 }],
    [3 * TICKS_PER_DAY, { t: 'move', ids: [4], to: 300 * s + 90 }],
  ];
}

function run(seed: number, ticks: number, cmds: [number, Command][], from?: SimState): Sim {
  const sim = new Sim(world, from ?? createSim(world, seed, { core: 4, crowd: 6 }));
  let k = 0;
  const sorted = cmds.slice().sort((p, q) => p[0] - q[0]);
  const end = sim.st.tick + ticks;
  while (sim.st.tick < end) {
    while (k < sorted.length && sorted[k][0] <= sim.st.tick) {
      if (sorted[k][0] === sim.st.tick) sim.push(sorted[k][1]);
      k++;
    }
    sim.step();
  }
  return sim;
}

describe('symulacja jest deterministyczna', () => {
  it('ten sam adres, ziarno i polecenia: ten sam skrót po 10 dniach', () => {
    const a1 = run(42, 10 * TICKS_PER_DAY, script(world));
    const a2 = run(42, 10 * TICKS_PER_DAY, script(world));
    expect(a1.hash()).toBe(a2.hash());
    expect(a1.st.stats.paths).toBeGreaterThan(100);
    const b = run(43, 10 * TICKS_PER_DAY, script(world));
    expect(b.hash()).not.toBe(a1.hash());
  });

  it('zapis do JSON i wczytanie nie zmienia dalszego przebiegu', () => {
    const half = run(7, 2000, script(world));
    const saved = JSON.stringify(half.st);
    const cont = run(7, 3000, script(world), JSON.parse(saved));
    const whole = run(7, 5000, script(world));
    expect(cont.hash()).toBe(whole.hash());
  });

  it('pionek idzie tam, gdzie go wysłano', () => {
    const sim = new Sim(world, createSim(world, 1, { core: 1 }));
    const s = world.size;
    const target = 160 * s + 170;
    sim.push({ t: 'move', ids: [1], to: target });
    for (let k = 0; k < 4000 && (sim.st.tick < 2 || sim.st.pawns[0].path.length); k++) sim.step();
    const p = sim.st.pawns[0];
    const dist = Math.hypot(p.x - (170 + 0.5), p.y - (160 + 0.5));
    expect(dist).toBeLessThan(6);
    expect(sim.st.people).toHaveLength(1);
    expect(sim.st.people[0].name.length).toBeGreaterThan(3);
  });
});
