/* Interfejs trybu zombie i broni bez przeglądarki: pasek, karta osoby, karta nocy, zapis, pomoc. */

import { describe, expect, it } from 'vitest';
import { LORE, LORE_ZOMBIE } from '../../src/content/data.ts';
import { makeCard } from '../../src/gov/noc.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { govInput } from '../../src/sim/gov.ts';
import { AMPUTATE_WINDOW, createSim, infect, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { personCard } from '../../src/ui/karta.ts';
import { helpSheet, nightOdds, oddsHtml } from '../../src/ui/okna.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { type Save, saveLabel } from '../../src/ui/zapis.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();

describe('interfejs trybu zombie', () => {
  it('pasek: w trybie zombie siatka i stado zamiast temperatury na dworze, w zwykłym bez zmian', () => {
    const z = new Sim(w, createSim(w, 3, { core: 2, mode: 'zombie' }));
    z.step();
    const ids = statsOf(snapshot(z.st, w), newGov(3, 'zombie')).map((s) => s.id);
    expect(ids).toEqual([
      'sFence',
      'sHorde',
      'sKit',
      'sFire',
      'sWood',
      'sBoards',
      'sScrap',
      'sParts',
      'sMats',
      'sFood',
      'sTrust',
      'sAnger',
    ]);
    const by = Object.fromEntries(statsOf(snapshot(z.st, w), null).map((s) => [s.id, s]));
    expect(by.sFence).toMatchObject({ value: '100%', level: 'ok' });
    expect(by.sHorde.value).toBe(String(snapshot(z.st, w).zombies.near));
    const n = new Sim(w, createSim(w, 3, { core: 2 }));
    expect(statsOf(snapshot(n.st, w), null).map((s) => s.id)).toEqual([
      'sOut',
      'sKit',
      'sFire',
      'sWood',
      'sBoards',
      'sScrap',
      'sParts',
      'sMats',
      'sFood',
      'sTrust',
      'sAnger',
    ]);
  });

  it('karta osoby: broń z amunicją i przycisk zmiany, ugryzienie z amputacją tylko w oknie, kikut', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2, mode: 'zombie' }));
    const [p, q] = sim.st.pawns.filter((x) => x.kind === 'core');
    const card = () => personCard(snapshot(sim.st, w).people.find((x) => x.pawn === p.id)!, sim.st.tick);
    expect(card()).toContain('rewolwer');
    expect(card()).toContain('12 naboi');
    expect(card()).toContain('data-card="arm"');
    infect(sim.st, p, true);
    expect(card()).toMatch(/Ugryzion/);
    expect(card()).toContain('data-card="amputate"');
    for (let k = 0; k < AMPUTATE_WINDOW + 20; k++) sim.step();
    if (sim.st.pawns.includes(p)) expect(card()).not.toContain('data-card="amputate"');
    const other = snapshot(sim.st, w).people.find((x) => x.pawn === q.id)!;
    expect(personCard({ ...other, maimed: true }, sim.st.tick)).toContain('kikut');
    expect(personCard({ ...other, weapon: null }, sim.st.tick)).toContain('gołe ręce');
  });

  it('karta nocy w trybie zombie: stado i siatka zamiast szansy napadu', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    const gov = newGov(3, 'zombie');
    const i = govInput(st, w, 0);
    const { card, assign } = makeCard(gov, i);
    const html = oddsHtml(card, assign, nightOdds(gov, i, card, assign), {});
    expect(html).toContain('Stado nocą');
    expect(html).toContain('Siatka');
    expect(html).not.toContain('Spróbują wejść');
  });

  it('zapis z trybem zombie ma to w etykiecie, pomoc i wstęp mówią o szwendaczach', () => {
    const st = createSim(w, 3, { core: 2, mode: 'zombie' });
    const save = { v: 1, at: 1, data: { name: 'Atrapia' }, seed: 3, sim: st, gov: newGov(3, 'zombie'), screen: 0 };
    expect(saveLabel(save as unknown as Save)).toBe('Atrapia (zombie), dzień 1, 15:00');
    expect(helpSheet(false, true).body).toMatch(/szwendacz/i);
    expect(helpSheet(false, false).body).not.toMatch(/szwendacz/i);
    expect(LORE_ZOMBIE).toMatch(/2051/);
    expect(LORE_ZOMBIE).not.toBe(LORE);
  });
});
