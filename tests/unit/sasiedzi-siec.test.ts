/* Gra sieciowa w fali 2 (docs/M2-fala-2.md): klatki zajęte przez inne drużyny są zamknięte na stałe. Klient zamienia
   klucze cudzych klatek na drzwi (drzwiObcych), symulacja dostaje je na start (SimOpts.zajete) albo poleceniem zajete:
   drzwi bez poleceń i nie do otwarcia, a po otwarciu budynku przez wolną klatkę wszystko za drzwiami zajętej zostaje
   zamknięte (przechodniość, przeszukanie). Na Lanciego z kluczami klatek z kafelków testowych. */

import { describe, expect, it } from 'vitest';
import type { ZajetaKlatka } from '../../src/net/protokol.ts';
import { doZajecia, drzwiObcych } from '../../src/net/siec.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { drzwiBudynku, moznaPrzeszukac, pokojeZajete, zaDrzwiami } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { klatkiBudynku, kluczBudynku } from '../../src/world/klucze.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';
import { until } from './sasiedzi-pomoc.ts';

const adr = ADDRESSES.find((a) => a.key === 'lanciego') as (typeof ADDRESSES)[number];
const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
const C = geo.c;
const w = buildWorld(geo, { seed: 1 });

/** blok z kilkoma klatkami najbliżej siedziby i jego klatki jako cudze (moja: false) */
function blokObok() {
  const hq = w.buildings[w.hq];
  const b = w.buildings
    .filter((x) => x.id !== w.hq && x.cls === 'blok' && kluczBudynku(x) && x.entrances.length > 1)
    .sort((a, c) => Math.hypot(a.x0 - hq.x0, a.y0 - hq.y0) - Math.hypot(c.x0 - hq.x0, c.y0 - hq.y0) || a.id - c.id)[0];
  const klatki: ZajetaKlatka[] = klatkiBudynku(b).map((k) => ({ ...doZajecia(k), moja: false }));
  return { b, klatki };
}

describe('gra sieciowa: klatki innych drużyn', () => {
  it('drzwiObcych: drzwi cudzych klatek budynku, bez naszych', () => {
    const { b, klatki } = blokObok();
    const d = drzwiObcych(w, C, klatki);
    expect(d.length).toBeGreaterThan(0);
    for (const t of d) expect(b.entrances.some((e) => e.tile === t)).toBe(true);
    expect(d).toEqual([...d].sort((x, y) => x - y));
    expect(
      drzwiObcych(
        w,
        C,
        klatki.map((k) => ({ ...k, moja: true })),
      ),
    ).toEqual([]);
    expect(drzwiObcych(w, C, [])).toEqual([]);
  });

  it('zajęte drzwi bez poleceń i nie do otwarcia; przez wolną klatkę budynek się otwiera, ale zajęta zostaje zamknięta', () => {
    const { b, klatki } = blokObok();
    const all = drzwiObcych(w, C, klatki);
    // jedna klatka cudza, reszta wolna
    const taken = all[0];
    const free = drzwiBudynku(w, b.id).zewn.find((d) => d.tile !== taken)!;
    const sim = new Sim(w, createSim(w, 1, { core: 2, zajete: [taken] }));
    expect(sim.st.zajete).toEqual([taken]);
    const p = sim.st.pawns.find((q) => q.kind === 'core')!;
    const items = commandsAt(sim.st, w, [p.id], taken).map((m) => m.cmd.t);
    expect(items).not.toContain('open');
    expect(items).not.toContain('force');
    expect(items).not.toContain('knock');
    sim.push({ t: 'force', ids: [p.id], door: taken });
    sim.step();
    expect(p.job?.t).not.toBe('door');
    // wolna klatka: otworzyć, a jak na klucz, wyważyć
    p.weapon = 'lom';
    for (const t of ['open', 'force'] as const) {
      sim.push({ t, ids: [p.id], door: free.tile });
      sim.step();
      until(sim, () => p.job?.t !== 'door', 8000);
      if (sim.st.sasiedzi?.budynki.find((x) => x.bid === b.id)?.otwarty) break;
    }
    const k = sim.st.sasiedzi!.budynki.findIndex((x) => x.bid === b.id);
    expect(sim.st.sasiedzi!.budynki[k].otwarty).toBe(true);
    // za zajętymi drzwiami nikt nie wejdzie i nic nie przeszuka
    const behind = zaDrzwiami(w, b.id, taken);
    for (const t of behind.tiles) {
      expect(sim.canWalk('core', t)).toBe(false);
      expect(sim.canWalk('szabrownik', t)).toBe(false);
    }
    const rooms = pokojeZajete(sim.st, w, b.id);
    expect(rooms.size).toBeGreaterThan(0);
    for (const r of rooms) expect(moznaPrzeszukac(sim.st, w, k, r)).toBeNull();
  });

  it('polecenie zajete zmienia listę od następnego kroku; pusta lista usuwa pole, a gra bez sieci go nie ma', () => {
    const { klatki } = blokObok();
    const d = drzwiObcych(w, C, klatki);
    const sim = new Sim(w, createSim(w, 1, { core: 2 }));
    expect(sim.st.zajete).toBeUndefined();
    const h0 = new Sim(w, createSim(w, 1, { core: 2 })).hash();
    expect(sim.hash()).toBe(h0);
    sim.push({ t: 'zajete', ids: [], drzwi: [...d].reverse() });
    sim.step();
    expect(sim.st.zajete).toEqual(d);
    sim.push({ t: 'zajete', ids: [], drzwi: [] });
    sim.step();
    expect(sim.st.zajete).toBeUndefined();
  });
});
