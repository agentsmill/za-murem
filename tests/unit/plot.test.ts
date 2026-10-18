/* Wspólny płot (M2 fala 2, etap 3, docs/M2-fala-2.md): kształt nowej siatki z czystej funkcji (korytarz od podwórka do
   drzwi budynku, szczelny obwód, brama i stare dziury na miejscu, jezdnia i limit długości) i przebieg w symulacji: plan
   z kosztem i czasem, donoszenie materiału, praca, nowa siatka od następnego kroku, łup w otoczonym budynku nasz,
   nocni goście nie wchodzą, zapis i wczytanie na świeżym świecie z tym samym kluczem i skrótem. Otoczenie zmienia świat
   w miejscu, więc testy symulacji budują własny świat zamiast wspólnego z pamięci. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { drzwiBudynku, kosztPlotu, nocnyGosc, plotDla } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { worldKey } from '../../src/ui/zapis.ts';
import { PLOT_MAX, wspolnyPlot } from '../../src/world/plot.ts';
import { T } from '../../src/world/terrain.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { core, demoWorld, until } from './sasiedzi-pomoc.ts';

/** świeży świat dema (bez pamięci: symulacja zmieni w nim siatkę) */
function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

const drzwiOf = (w: World, bid: number) => drzwiBudynku(w, bid).zewn.map((d) => ({ tile: d.tile, out: d.out }));
const byName = (w: World, name: string) => w.buildings.find((b) => b.name === name)!;

describe('wspólny płot: kształt', () => {
  it('Lanciego 10F: korytarz do wszystkich klatek, szczelny obwód, brama i dziury na miejscu', () => {
    const w = demoWorld('lanciego');
    const b = byName(w, 'Blok nr 10F');
    const r = wspolnyPlot(w, w.fence, drzwiOf(w, b.id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toEqual(wspolnyPlot(w, w.fence, drzwiOf(w, b.id)));
    const yard = new Set(r.fence.yard);
    const tiles = new Set(r.fence.tiles);
    for (const t of w.fence.yard) expect(yard.has(t)).toBe(true);
    for (const d of drzwiOf(w, b.id)) expect(yard.has(d.out)).toBe(true);
    expect(r.zabic).toEqual([]);
    for (const t of tiles) expect(yard.has(t)).toBe(false);
    expect(r.fence.gate).toEqual(w.fence.gate);
    for (const h of r.fence.hole) {
      expect(tiles.has(h)).toBe(true);
      expect(w.fence.hole).toContain(h);
    }
    expect(r.dlugosc).toBe(r.nowe.length);
    expect(r.dlugosc).toBeLessThanOrEqual(PLOT_MAX);
    // nowe podwórko nie wchodzi na jezdnię, a każdy jego sąsiad bokiem to podwórko, siatka, brama, budynek albo przeszkoda
    const size = w.size;
    const gate = new Set<number>();
    for (let y = w.fence.gate.y; y < w.fence.gate.y + w.fence.gate.h; y++)
      for (let x = w.fence.gate.x; x < w.fence.gate.x + w.fence.gate.w; x++) gate.add(y * size + x);
    const old = new Set(w.fence.tiles);
    for (const t of r.fence.yard) {
      if (!w.fence.yard.includes(t)) expect(w.terr[t]).not.toBe(T.ROAD);
      for (const n of [t - size, t + 1, t + size, t - 1]) {
        const ok = yard.has(n) || tiles.has(n) || gate.has(n) || w.bid[n] >= 0 || (w.blocked[n] === 1 && !old.has(n));
        expect(ok, `kafelek ${n} przy podwórku`).toBe(true);
      }
    }
  });

  it('dom w Zielonkach się da, za długi płot i jezdnia mówią dlaczego', () => {
    const z = demoWorld('zielonki');
    expect(wspolnyPlot(z, z.fence, drzwiOf(z, byName(z, 'Dom nr 12').id)).ok).toBe(true);
    const dlugi = wspolnyPlot(z, z.fence, drzwiOf(z, byName(z, 'Dom 31').id));
    expect(dlugi).toMatchObject({ ok: false, why: 'dlugi' });
    if (!dlugi.ok) expect(dlugi.dlugosc).toBeGreaterThan(PLOT_MAX);
    const p = demoWorld('przymorze');
    expect(wspolnyPlot(p, p.fence, drzwiOf(p, byName(p, 'Blok nr 8B').id))).toMatchObject({
      ok: false,
      why: 'jezdnia',
    });
  });

  it('kafelków do ominięcia (zasieki) korytarz nie rusza', () => {
    const w = demoWorld('lanciego');
    const b = byName(w, 'Blok nr 10F');
    const r = wspolnyPlot(w, w.fence, drzwiOf(w, b.id));
    if (!r.ok) throw new Error('10F');
    const unikaj = new Set(r.usuniete);
    const r2 = wspolnyPlot(w, w.fence, drzwiOf(w, b.id), unikaj);
    if (r2.ok) {
      for (const t of r2.usuniete) expect(unikaj.has(t)).toBe(false);
      for (const t of unikaj) expect(r2.fence.tiles).toContain(t);
    }
  });
});

/** gra na świeżym świecie Lanciego z otwartym 10F i materiałem na płot na podwórku */
function graZPlotem(seed = 5) {
  const w = swiezy('lanciego');
  const sim = new Sim(w, createSim(w, seed, { core: 4 }));
  const b = byName(w, 'Blok nr 10F');
  const p = core(sim)[0];
  p.weapon = 'lom';
  const door = b.entrances[0].tile;
  for (const t of ['open', 'force'] as const) {
    sim.push({ t, ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door', 8000);
    if (sim.st.sasiedzi?.budynki.find((x) => x.bid === b.id)?.otwarty) break;
  }
  const r = plotDla(sim.st, w, b.id);
  if (!r?.ok) throw new Error('10F bez płotu');
  // materiał na podwórku: sterty po 10 na wolnych kafelkach przy drzwiach siedziby
  const { need } = kosztPlotu(r);
  const proto = sim.st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
  const free = w.fence.yard.filter((i) => !w.blocked[i] && !sim.st.things.some((t) => t.y * w.size + t.x === i));
  let k = 0;
  for (const [m, n] of Object.entries(need) as [string, number][])
    for (let left = n + 4; left > 0; left -= 10) {
      const i = free[k++];
      sim.st.things.push({
        ...proto,
        id: sim.st.nextThing++,
        kind: m,
        x: i % w.size,
        y: Math.floor(i / w.size),
        n: Math.min(10, left),
        by: -1,
      });
    }
  return { w, sim, b, p, r };
}

/** buduje płot do końca (po przerwaniu przez potrzeby polecenie jeszcze raz) */
function buduj(sim: Sim, bid: number, p: ReturnType<typeof core>[number]) {
  sim.push({ t: 'enclose', ids: [p.id], bid });
  sim.step();
  for (let n = 0; n < 60_000 && !sim.st.plot?.bids.includes(bid); n++) {
    sim.step();
    if (n % 400 === 0 && sim.st.plot?.plan && p.job?.t !== 'plot' && !sim.st.cmds.length)
      sim.push({ t: 'enclose', ids: [p.id], bid });
  }
}

describe('wspólny płot w symulacji', () => {
  it('menu z kosztem i czasem, plan, materiał, praca i nowa siatka; klucz zapisu ze świata', () => {
    const { w, sim, b, p, r } = graZPlotem();
    const base = worldKey(w);
    const items = commandsAt(sim.st, w, [p.id], b.entrances[0].tile);
    const it = items.find((m) => m.cmd.t === 'enclose');
    expect(it?.label).toMatch(new RegExp(`^Otoczyć wspólnym płotem \\(${r.dlugosc} m: `));
    expect(it?.confirm).toBe(true);
    const tiles0 = w.fence.tiles.length;
    buduj(sim, b.id, p);
    expect(sim.st.plot?.bids).toEqual([b.id]);
    expect(sim.st.plot?.plan).toBeUndefined();
    expect(w.fenceBaza?.tiles.length).toBe(tiles0);
    expect(w.fence.tiles).toEqual(r.fence.tiles);
    expect(sim.st.fence!.hp).toHaveLength(w.fence.tiles.length);
    expect(sim.st.sasiedzi!.napis?.co).toBe('plot_gotowy');
    // korytarz przechodni, nowa siatka nie; wejścia 10F na podwórku
    for (const t of r.nowe) expect(sim.canWalk('core', t)).toBe(false);
    for (const d of drzwiOf(w, b.id)) expect(w.fence.yard).toContain(d.out);
    expect(worldKey(w)).toBe(base);
    // menu już nie proponuje płotu
    expect(commandsAt(sim.st, w, [p.id], b.entrances[0].tile).some((m) => m.cmd.t === 'enclose')).toBe(false);
  });

  it('łup w otoczonym budynku jest nasz, nocni goście nie wchodzą, zapis i wczytanie dają ten sam przebieg', () => {
    const { w, sim, b, p } = graZPlotem();
    buduj(sim, b.id, p);
    expect(sim.st.plot?.bids).toContain(b.id);
    // sterta części w środku 10F liczy się do zapasów
    const inside = w.fence.yard.find((i) => drzwiOf(w, b.id).some((d) => d.out === i))!;
    const before = snapshot(sim.st, w).stock.mats.czesci;
    const proto = sim.st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
    const room = [...Array(w.size * w.size).keys()].find(
      (i) => w.bid[i] === b.id && sim.canWalk('core', i) && Math.abs((i % w.size) - (inside % w.size)) < 6,
    )!;
    sim.st.things.push({
      ...proto,
      id: sim.st.nextThing++,
      kind: 'czesci',
      x: room % w.size,
      y: Math.floor(room / w.size),
      n: 3,
      by: -1,
    });
    expect(snapshot(sim.st, w).stock.mats.czesci).toBe(before + 3);
    // noc, w którą bez płotu przyszliby szabrownicy
    const rec = sim.st.sasiedzi!.budynki.find((x) => x.bid === b.id)!;
    let t = sim.st.tick;
    while (!(t % TICKS_PER_HOUR === 0 && hourOf(t) === 2 && nocnyGosc(w.seed, b.id, dayOf(t), 'zwykly', true))) t++;
    expect(t - sim.st.tick).toBeLessThan(60 * TICKS_PER_DAY);
    sim.st.tick = t;
    sim.step();
    expect(rec.noc).toBeUndefined();
    // zapis i wczytanie na świeżym świecie: ten sam kształt siatki, klucz i dalszy przebieg
    const w2 = swiezy('lanciego');
    const copy = new Sim(w2, JSON.parse(JSON.stringify(sim.st)) as SimState);
    expect(w2.fence.tiles).toEqual(w.fence.tiles);
    expect(worldKey(w2)).toBe(worldKey(w));
    for (let k = 0; k < 400; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});
