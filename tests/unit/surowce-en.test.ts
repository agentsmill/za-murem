/* Surowce po angielsku: menu wraku, łupu i warsztatu oraz opisy prac biorą NAPISY z src/sim/surowce.ts w bieżącym
   języku (stan gry bez zmian, w Node domyślnie polski jak w surowce.test.ts). Deski to „planks” jak na pasku, nie
   „boards”, bo „the board” to zarząd. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { createSim, type Job, type SimState, type Thing } from '../../src/sim/sim.ts';
import { wrecksOf, wreckTile } from '../../src/sim/surowce.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { polskieSlowa } from './po-angielsku.ts';

beforeEach(() => ustawJezyk('en'));
afterEach(() => ustawJezyk('pl'));

const w = mockBlockM2();
const size = w.size;
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const near = wrecksOf(w)[0];
const nearTile = wreckTile(near, size);
const model = near.model === 'polonez' ? 'the Polonez' : 'the Fiat 126p';
const thing = (st: SimState, kind: string, x: number, y: number, n: number, ww = 1): Thing => {
  const t: Thing = { id: st.nextThing++, kind, x, y, w: ww, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 };
  st.things.push(t);
  return t;
};
const job = (t: Job['t'], phase: number, what = '', from = -1): Job => ({
  t,
  target: -1,
  tile: 0,
  phase,
  from,
  t0: 0,
  until: 0,
  order: true,
  n: 0,
  what,
});

describe('surowce po angielsku', () => {
  it('wrak: przeszukanie, a po nim rozbiórka', () => {
    const st = createSim(w, 3, { core: 2 });
    const ids = core(st).map((p) => p.id);
    expect(commandsAt(st, w, ids, nearTile)[0].label).toBe(`Search ${model}`);
    st.wraki = [{ t: nearTile, s: 1 }];
    const labels = commandsAt(st, w, ids, nearTile).map((m) => m.label);
    expect(labels).toContain(`Strip ${model}`);
    for (const l of labels) expect(polskieSlowa(l)).toEqual([]);
  });

  it('łup za siatką i warsztat z drewnem i złomem', () => {
    const st = createSim(w, 3, { core: 2 });
    const ids = [core(st)[0].id];
    const heap = thing(st, 'zlom', near.x, near.y - 1, 9);
    expect(commandsAt(st, w, ids, heap.y * size + heap.x).map((m) => m.label)).toContain('Carry into the yard');
    const room = w.interior.rooms.find((r) => r.apt === 0 && r.kind === 'pokoj')!.id;
    const at = w.interior.room.findIndex((r, i) => r === room && w.interior.room[i + 1] === room && !w.blocked[i]);
    const ws = thing(st, 'warsztat', at % size, Math.floor(at / size), 0, 2);
    const free = w.fence.yard.filter((k) => !st.things.some((t) => t.x === k % size && t.y === Math.floor(k / size)));
    thing(st, 'drewno', free[0] % size, Math.floor(free[0] / size), 6);
    thing(st, 'zlom', free[1] % size, Math.floor(free[1] / size), 4);
    const labels = commandsAt(st, w, ids, ws.y * size + ws.x).map((m) => m.label);
    expect(labels).toEqual(expect.arrayContaining(['Saw wood into a plank', 'Saw wood into 3 planks']));
    expect(labels).toContain('Make a part from scrap');
    expect(labels.some((l) => /^Make [2-5] parts from scrap$/.test(l))).toBe(true);
    for (const l of labels) expect(l).not.toMatch(/\bboards?\b/);
  });

  it('opisy prac przy wraku, łupie i warsztacie', () => {
    const st = createSim(w, 3, { core: 2 });
    const p = core(st)[0];
    const texts: [Job, string][] = [
      [job('wreck', 0, 'szukaj'), 'Going to search the wreck.'],
      [job('wreck', 1, 'szukaj'), 'Searching the wreck.'],
      [job('wreck', 1, 'rozbierz'), 'Stripping the wreck.'],
      [job('carry', 0), 'Going for the loot.'],
      [job('carry', 1), 'Carrying the loot into the yard.'],
      [job('saw', 0, 'deski', 5), 'Going to the workshop.'],
      [job('saw', 1, 'deski', 5), 'Sawing planks (5 to go).'],
      [job('saw', 1, 'deski', 1), 'Sawing a plank.'],
      [job('saw', 1, 'czesci', 2), 'Making parts from scrap (2 to go).'],
    ];
    for (const [j, text] of texts) {
      p.job = j;
      expect(jobText(st, w, p)).toBe(text);
    }
    ustawJezyk('pl');
    p.job = job('saw', 1, 'deski', 5);
    expect(jobText(st, w, p)).toBe('Piłuje deski (jeszcze 5).');
  });
});
