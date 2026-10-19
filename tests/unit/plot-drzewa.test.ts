/* Ścięte drzewo na linii obwodu nie robi dziury (Mateusz, 18.10.2026: drzewa zrośnięte z płotem po ścięciu robiły
   dziurę po obu stronach pnia i w jego miejscu, której nie dało się zamknąć ani łatą, ani zasiekami). Budynki, drzewa
   i woda domykają obwód same (src/world/fence.ts, src/world/plot.ts), a siatka rysuje się tylko do sąsiedniej siatki,
   bramy albo ściany, więc przy pniu się urywała. Pień poza podwórkiem, który styka się z nim bokiem, po ścięciu staje
   się kafelkiem siatki: płot jest ciągły, bierze zasieki, a pnia na mapie już nie ma. Pień w podwórku (suche drzewo
   przy trzepaku) zwalnia się jak dotąd. Przypadek z gry: wspólny płot wokół Domu nr 8 w Zielonkach domyka się pniem
   drzewa. Otoczenie i nowa siatka zmieniają świat w miejscu, więc każdy przypadek buduje własny świat. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { labelRegions } from '../../src/sim/path.ts';
import { PATCH_HP, REINFORCED_HP } from '../../src/sim/perimeter.ts';
import { drzwiBudynku } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim, type SimState, trunkOf } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { wspolnyPlot } from '../../src/world/plot.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { until } from './sasiedzi-pomoc.ts';

/** świeży świat dema (bez pamięci: symulacja zmieni w nim siatkę) */
function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** Zielonki ze wspólnym płotem wokół Domu nr 8: siatka cała, dziury załatane, brama zamknięta */
function zielonkiZPlotem(mode: GameMode = 'zombie') {
  const w = swiezy('zielonki');
  const b = w.buildings.find((x) => x.name === 'Dom nr 8')!;
  const r = wspolnyPlot(
    w,
    w.fence,
    drzwiBudynku(w, b.id).zewn.map((d) => ({ tile: d.tile, out: d.out })),
  );
  if (!r.ok) throw new Error('Dom nr 8 bez wspólnego płotu');
  const st = createSim(w, 5, { core: 4, mode });
  st.plot = { bids: [b.id], ksztalt: { tiles: r.fence.tiles, hole: r.fence.hole, yard: r.fence.yard } };
  const f = st.fence!;
  f.hp = r.fence.tiles.map(() => 100);
  f.holes = r.fence.hole.length ? [{ id: 1, tiles: [...r.fence.hole], size: 0.5, patch: 70 }] : [];
  f.gateOpen = false;
  return { w, st, r };
}

/** drzewa, których pień poza podwórkiem styka się z nim bokiem, a z drugiej strony ma wolną ulicę */
function zamykajace(w: World, r: { fence: { tiles: number[]; hole: number[]; yard: number[] } }) {
  const size = w.size;
  const yard = new Set(r.fence.yard);
  const line = new Set([...r.fence.tiles, ...r.fence.hole]);
  const sasiedzi = (i: number) => [i - size, i + size, i - 1, i + 1];
  return w.trees
    .map((t, k) => ({ k, pien: trunkOf(w, t) }))
    .map((x) => ({ ...x, ulica: sasiedzi(x.pien).find((n) => !yard.has(n) && !line.has(n) && !w.blocked[n]) }))
    .filter((x) => !yard.has(x.pien) && x.ulica !== undefined && sasiedzi(x.pien).some((n) => yard.has(n)));
}

/** czy obcy z ulicy dojdzie na podwórko (warstwa fizyczna: dziury załatane, brama zamknięta) */
function otwarte(sim: Sim, w: World, podworko: number, ulica: number): boolean {
  const reg = labelRegions(sim.blocked, w.size);
  return reg[podworko] === reg[ulica];
}

const pienNaMapie = (st: SimState, w: World, t: number) =>
  st.things.some((x) => x.kind === 'pien' && x.y * w.size + x.x === t);

describe('ścięte drzewo na linii obwodu', () => {
  it('w grze: drwal ścina pień domykający wspólny płot, pień staje się siatką, płot cały, zasieki można postawić', () => {
    const probny = zielonkiZPlotem('zwykly');
    const drzewa = zamykajace(probny.w, probny.r);
    expect(drzewa.length).toBeGreaterThan(0);
    const { k, pien, ulica } = drzewa[0];
    const { w, st } = zielonkiZPlotem('zwykly');
    const sim = new Sim(w, st);
    const podworko = w.fence.yard.find((i) => !sim.blocked[i])!;
    expect(otwarte(sim, w, podworko, ulica!), 'przed ścięciem').toBe(false);
    const drwal = sim.st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'chop', ids: [drwal.id], tree: k });
    until(sim, () => sim.st.felled.includes(k), 20_000);
    expect(sim.st.felled).toContain(k);
    expect(w.fence.tiles).toContain(pien);
    expect(sim.st.fence!.hp[w.fence.tiles.indexOf(pien)]).toBe(PATCH_HP);
    expect(sim.blocked[pien]).toBe(1);
    expect(otwarte(sim, w, podworko, ulica!), 'po ścięciu').toBe(false);
    expect(pienNaMapie(sim.st, w, pien)).toBe(false);
    expect(canPlace(sim.st, w, 'zasieki', pien % w.size, Math.floor(pien / w.size), 0).ok).toBe(true);
    // zapis i wczytanie na świeżym świecie: ta sama siatka i ten sam dalszy przebieg
    const zapis = JSON.stringify(sim.st);
    const w2 = swiezy('zielonki');
    const sim2 = new Sim(w2, JSON.parse(zapis));
    expect(w2.fence.tiles).toEqual(w.fence.tiles);
    for (let n = 0; n < 400; n++) {
      sim.step();
      sim2.step();
    }
    expect(sim2.hash()).toBe(sim.hash());
  });

  it('stary zapis z pniem ściętym przed naprawą: po wczytaniu pień jest siatką (tryb zombie: wzmocniona)', () => {
    const probny = zielonkiZPlotem();
    for (const { k, pien, ulica } of zamykajace(probny.w, probny.r)) {
      const { w, st } = zielonkiZPlotem();
      const przed = new Sim(w, structuredClone(st));
      const podworko = w.fence.yard.find((i) => !przed.blocked[i])!;
      expect(otwarte(przed, w, podworko, ulica!), `drzewo ${k} przed ścięciem`).toBe(false);
      // stan jak ze starej wersji: drzewo ścięte, pień leży na mapie, siatka bez jego kafelka
      const w2 = zielonkiZPlotem().w;
      const stary = structuredClone(st);
      stary.felled = [k];
      stary.things.push({
        ...stary.things[0],
        id: stary.nextThing++,
        kind: 'pien',
        x: pien % w2.size,
        y: Math.floor(pien / w2.size),
        w: 1,
        h: 1,
      });
      const po = new Sim(w2, stary);
      expect(w2.fence.tiles, `drzewo ${k}`).toContain(pien);
      expect(po.st.fence!.hp[w2.fence.tiles.indexOf(pien)]).toBe(REINFORCED_HP);
      expect(po.blocked[pien]).toBe(1);
      expect(otwarte(po, w2, podworko, ulica!), `drzewo ${k} po ścięciu`).toBe(false);
      expect(pienNaMapie(po.st, w2, pien)).toBe(false);
    }
  });

  it('pień suchego drzewa w podwórku zwalnia się po ścięciu jak dotąd, siatka bez zmian', () => {
    for (const key of ['przymorze', 'lanciego', 'zielonki']) {
      const w = swiezy(key);
      const pien = trunkOf(w, w.trees[w.dryTree]);
      expect(w.fence.yard, key).toContain(pien);
      const kafelki = [...w.fence.tiles];
      const st = createSim(w, 5, { core: 4 });
      st.felled = [w.dryTree];
      expect(new Sim(w, st).blocked[pien], key).toBe(0);
      expect(w.fence.tiles, key).toEqual(kafelki);
      expect(st.plot, key).toBeUndefined();
    }
  });
});
