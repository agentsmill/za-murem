/* Ścięte drzewo na linii obwodu nie robi dziury (Mateusz, 18.10.2026: drzewa zrośnięte z płotem po ścięciu robiły
   dziurę, której nie dało się zamknąć ani łatą, ani zasiekami). Budynki, drzewa i woda domykają obwód same
   (src/world/fence.ts, src/world/plot.ts), więc pień poza podwórkiem, który styka się z nim bokiem, zostaje po ścięciu
   przeszkodą jak stojące drzewo. Pień w podwórku (suche drzewo przy trzepaku) zwalnia się jak dotąd. Przypadek z gry:
   wspólny płot wokół Domu nr 8 w Zielonkach domyka się pniem drzewa. Otoczenie zmienia świat w miejscu, więc każdy
   test buduje własny świat. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { labelRegions } from '../../src/sim/path.ts';
import { drzwiBudynku } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim, trunkOf } from '../../src/sim/sim.ts';
import { wspolnyPlot } from '../../src/world/plot.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

/** świeży świat dema (bez pamięci: symulacja zmieni w nim siatkę) */
function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** Zielonki ze wspólnym płotem wokół Domu nr 8 w trybie zombie: siatka cała, dziury załatane, brama zamknięta */
function zielonkiZPlotem() {
  const w = swiezy('zielonki');
  const b = w.buildings.find((x) => x.name === 'Dom nr 8')!;
  const r = wspolnyPlot(
    w,
    w.fence,
    drzwiBudynku(w, b.id).zewn.map((d) => ({ tile: d.tile, out: d.out })),
  );
  if (!r.ok) throw new Error('Dom nr 8 bez wspólnego płotu');
  const st = createSim(w, 5, { core: 4, mode: 'zombie' });
  st.plot = { bids: [b.id], ksztalt: { tiles: r.fence.tiles, hole: r.fence.hole, yard: r.fence.yard } };
  const f = st.fence!;
  f.hp = r.fence.tiles.map(() => 100);
  f.holes = r.fence.hole.length ? [{ id: 1, tiles: [...r.fence.hole], size: 0.5, patch: 70 }] : [];
  f.gateOpen = false;
  return { w, st, r };
}

describe('ścięte drzewo na linii obwodu', () => {
  it('pień domykający wspólny płot zostaje przeszkodą: szwendacz z ulicy nie wejdzie na podwórko', () => {
    const { w, st, r } = zielonkiZPlotem();
    const size = w.size;
    const yard = new Set(r.fence.yard);
    const line = new Set([...r.fence.tiles, ...r.fence.hole]);
    new Sim(w, st);
    // drzewa, których pień poza podwórkiem styka się z nim bokiem, a z drugiej strony ma wolną ulicę
    const zamykajace = w.trees
      .map((t, k) => ({ k, pien: trunkOf(w, t) }))
      .map((x) => ({
        ...x,
        ulica: [x.pien - size, x.pien + size, x.pien - 1, x.pien + 1].find(
          (n) => !yard.has(n) && !line.has(n) && !w.blocked[n],
        ),
      }))
      .filter(
        (x) =>
          !yard.has(x.pien) &&
          x.ulica !== undefined &&
          [x.pien - size, x.pien + size, x.pien - 1, x.pien + 1].some((n) => yard.has(n)),
      );
    expect(zamykajace.length).toBeGreaterThan(0);
    for (const { k, pien, ulica } of zamykajace) {
      const przed = new Sim(w, { ...st, felled: [] });
      const podworko = r.fence.yard.find((i) => !przed.blocked[i])!;
      const reg0 = labelRegions(przed.blocked, size);
      expect(reg0[podworko], `drzewo ${k} przed ścięciem`).not.toBe(reg0[ulica!]);
      const po = new Sim(w, { ...st, felled: [k] });
      expect(po.blocked[pien], `pień drzewa ${k}`).toBe(1);
      const reg1 = labelRegions(po.blocked, size);
      expect(reg1[podworko], `drzewo ${k} po ścięciu`).not.toBe(reg1[ulica!]);
    }
  });

  it('pień suchego drzewa w podwórku zwalnia się po ścięciu jak dotąd', () => {
    for (const key of ['przymorze', 'lanciego', 'zielonki']) {
      const w = swiezy(key);
      const pien = trunkOf(w, w.trees[w.dryTree]);
      expect(w.fence.yard, key).toContain(pien);
      const st = createSim(w, 5, { core: 4 });
      st.felled = [w.dryTree];
      expect(new Sim(w, st).blocked[pien], key).toBe(0);
    }
  });
});
