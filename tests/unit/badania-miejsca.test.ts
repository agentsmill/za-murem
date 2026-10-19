/* Miejsca przy stole pracowni: jedno źródło predykatu „miejsce zajęte” (`zajmujeMiejsce`, `wolneMiejsca` w
   src/sim/badania.ts) dla polecenia `study`, menu pracowni i podpowiedzi. Gdy zaznaczonych jest więcej osób niż wolnych
   miejsc, „Badać” wysyła do pracowni tyle osób, ile jest miejsc, a podpowiedź (`usiadaPodpowiedz` w src/ui/badania.ts)
   mówi, ile usiadło i że reszta nie ma miejsca. Stan z createSim na Przymorzu, umiejętności ręcznie. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { RESEARCH_SEATS, wolneMiejsca, zajmujeMiejsce } from '../../src/sim/badania.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { usiadaPodpowiedz } from '../../src/ui/badania.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

afterEach(() => ustawJezyk('pl'));

const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

/** pracownia z wyborem Spawania (Budowa 2 mają wszyscy czterej, t_okna zbadane), czterech z zarządu */
function zLab() {
  const st = createSim(w, seed, { core: 4 });
  for (const o of st.people) {
    o.skills = { bud: 2 };
    o.traits = [];
  }
  const i = allowedAnchors(st, w, 'pracownia', 0)[0];
  const lab: Thing = {
    id: st.nextThing++,
    kind: 'pracownia',
    x: i % w.size,
    y: Math.floor(i / w.size),
    w: 2,
    h: 1,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(lab);
  st.techDone = ['t_okna'];
  st.research = { cur: 't_spawanie', prog: {}, at: { t_okna: 1 } };
  return { st, lab, sim: new Sim(w, st), tile: lab.y * w.size + lab.x };
}

describe('wolneMiejsca i zajmujeMiejsce: jedno źródło', () => {
  it('miejsce zajmuje ten, kto idzie do stołu tej pracowni albo przy nim siedzi; inne prace i inne stoły się nie liczą', () => {
    const { st, lab, sim } = zLab();
    const [a, b, c, e] = rdzen(st);
    expect(zajmujeMiejsce(a, lab.id)).toBe(false);
    expect(sim.startResearch(a, true)).toBe(true);
    expect(zajmujeMiejsce(a, lab.id)).toBe(true);
    expect(zajmujeMiejsce(a, lab.id + 1)).toBe(false);
    b.job = { ...a.job!, t: 'haul' };
    expect(zajmujeMiejsce(b, lab.id)).toBe(false);
    expect(wolneMiejsca(st.pawns, lab.id)).toBe(RESEARCH_SEATS - 1);
    expect(sim.startResearch(c, true)).toBe(true);
    expect(wolneMiejsca(st.pawns, lab.id)).toBe(0);
    // zaznaczeni, którzy już siedzą, zwalniają swoje miejsca (zaraz dostaną to samo polecenie)
    expect(wolneMiejsca(st.pawns, lab.id, [a.id])).toBe(1);
    expect(wolneMiejsca(st.pawns, lab.id, [a.id, c.id])).toBe(2);
    expect(wolneMiejsca(st.pawns, lab.id, [e.id])).toBe(0);
  });

  it('polecenie sim.startResearch i menu pracowni mówią to samo o wolnym miejscu', () => {
    const { st, lab, sim, tile } = zLab();
    const [a, b, c, e] = rdzen(st);
    const badac = (ids: number[]) => commandsAt(st, w, ids, tile).find((m) => m.cmd.t === 'study')!;
    for (const [ktos, zajmuje] of [
      [b, 0],
      [c, 1],
    ] as const) {
      expect(badac([a.id]).off).toBeUndefined();
      expect(wolneMiejsca(st.pawns, lab.id, [a.id])).toBe(RESEARCH_SEATS - zajmuje);
      expect(sim.startResearch(ktos, true)).toBe(true);
    }
    expect(wolneMiejsca(st.pawns, lab.id, [a.id])).toBe(0);
    expect(badac([a.id]).off).toBe('Przy stole nie ma miejsca.');
    expect(sim.startResearch(a, true)).toBe(false);
    expect(sim.startResearch(e, true)).toBe(false);
  });
});

describe('„Badać” przy zbyt wielu zaznaczonych', () => {
  const idzieDoStolu = (st: SimState, lab: Thing) => rdzen(st).filter((p) => zajmujeMiejsce(p, lab.id));

  it('trzech zaznaczonych, dwa wolne miejsca: do stołu idą dwie osoby, trzecia nie dostaje pracy', () => {
    const { st, lab, sim } = zLab();
    const [a, b, c] = rdzen(st);
    sim.push({ t: 'study', ids: [a.id, b.id, c.id], thing: lab.id });
    sim.step();
    expect(idzieDoStolu(st, lab).map((p) => p.id)).toEqual([a.id, b.id]);
    expect(c.job?.t).not.toBe('research');
  });

  it('jedno miejsce zajęte przez kogoś spoza zaznaczenia: idzie tylko pierwszy z trójki', () => {
    const { st, lab, sim } = zLab();
    const [a, b, c, e] = rdzen(st);
    expect(sim.startResearch(e, true)).toBe(true);
    sim.push({ t: 'study', ids: [a.id, b.id, c.id], thing: lab.id });
    sim.step();
    expect(wolneMiejsca(st.pawns, lab.id, [a.id, b.id, c.id])).toBe(1);
    expect(idzieDoStolu(st, lab).map((p) => p.id)).toEqual([a.id, e.id]);
    expect(b.job?.t).not.toBe('research');
    expect(c.job?.t).not.toBe('research');
  });

  it('zaznaczony, który już siedzi, zachowuje swoje miejsce, reszta dzieli wolne', () => {
    const { st, lab, sim } = zLab();
    const [a, b, c] = rdzen(st);
    expect(sim.startResearch(c, true)).toBe(true);
    // c pierwszy w zaznaczeniu: zostaje, a z a i b siada tylko jeden
    sim.push({ t: 'study', ids: [c.id, a.id, b.id], thing: lab.id });
    sim.step();
    expect(idzieDoStolu(st, lab).map((p) => p.id)).toEqual([a.id, c.id]);
  });
});

describe('podpowiedź po „Badać”', () => {
  it('wszyscy usiądą: bez osobnej podpowiedzi (zostaje „Zajmie się badaniami.”)', () => {
    expect(usiadaPodpowiedz(2, 1)).toBeNull();
    expect(usiadaPodpowiedz(2, 2)).toBeNull();
    expect(usiadaPodpowiedz(1, 1)).toBeNull();
  });

  it('za mało miejsc: ile usiadło z ilu i że przy stole nie ma więcej miejsc, po polsku i po angielsku', () => {
    expect(usiadaPodpowiedz(1, 3)).toBe('Usiądą 1 z 3, przy stole nie ma więcej miejsc.');
    expect(usiadaPodpowiedz(2, 3)).toBe('Usiądą 2 z 3, przy stole nie ma więcej miejsc.');
    ustawJezyk('en');
    expect(usiadaPodpowiedz(1, 3)).toBe('1 of 3 will sit down, there are no more seats.');
    expect(usiadaPodpowiedz(2, 4)).toBe('2 of 4 will sit down, there are no more seats.');
  });

  it('żadnego wolnego miejsca: ten sam napis co wyszarzone „Badać” w menu', () => {
    expect(usiadaPodpowiedz(0, 2)).toBe('Przy stole nie ma miejsca.');
    ustawJezyk('en');
    expect(usiadaPodpowiedz(0, 2)).toBe('No free seat at the table.');
  });
});
