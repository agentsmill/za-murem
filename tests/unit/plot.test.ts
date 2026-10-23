/* Wspólny płot (M2 fala 2, etap 3, docs/M2-fala-2.md): kształt nowej siatki z czystej funkcji (korytarz od podwórka do
   drzwi budynku, szczelny obwód, brama i stare dziury na miejscu, jezdnia i limit długości) i przebieg w symulacji: plan
   z kosztem i czasem, donoszenie materiału, praca, nowa siatka od następnego kroku, łup w otoczonym budynku nasz,
   nocni goście nie wchodzą, zapis i wczytanie na świeżym świecie z tym samym kluczem i skrótem. Otoczenie zmienia świat
   w miejscu, więc testy symulacji budują własny świat zamiast wspólnego z pamięci. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { napisPikselami } from '../../src/render/art/cyfry.ts';
import { duchSprite } from '../../src/render/art/duch.ts';
import { rgba } from '../../src/render/art/palette.ts';
import { duchPlotu } from '../../src/render/plotDuch.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { drzwiBudynku, kosztPlotu, nocnyGosc, plotDla, uSasiada, wariantyPlotu } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { widokBudynku } from '../../src/ui/budynek.ts';
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
function graZPlotem(seed = 5, mode: 'zwykly' | 'zombie' = 'zwykly') {
  const w = swiezy('lanciego');
  const sim = new Sim(w, createSim(w, seed, { core: 4, mode }));
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

  it('nowe kafelki płotu: w trybie zombie tak mocne jak wzmocniona siatka, w zwykłym jak świeża łata', () => {
    for (const mode of ['zwykly', 'zombie'] as const) {
      const { w, sim, b, p, r } = graZPlotem(5, mode);
      const stare = new Map(w.fence.tiles.map((t, k) => [t, sim.st.fence!.hp[k]]));
      buduj(sim, b.id, p);
      expect(sim.st.plot?.bids, mode).toEqual([b.id]);
      const nowe = new Set(r.nowe);
      const hp = w.fence.tiles.map((t, k) => ({ t, v: sim.st.fence!.hp[k] })).filter((x) => nowe.has(x.t));
      expect(hp.length).toBeGreaterThan(20);
      // świeży płot z desek i złomu: w zombie 100 (wzmocniona siatka na starcie), w zwykłym 70 (łata)
      for (const x of hp) expect(x.v, `${mode} kafelek ${x.t}`).toBe(mode === 'zombie' ? 100 : 70);
      // stare kafelki zachowują swoją wytrzymałość (zombie: napór mógł ją zużyć, ale nie podnieść)
      for (const [k, t] of w.fence.tiles.entries())
        if (!nowe.has(t) && stare.has(t)) expect(sim.st.fence!.hp[k], mode).toBeLessThanOrEqual(stare.get(t)!);
    }
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

/** na naszym podwórku dokładnie tyle desek i złomu: nasze sterty znikają, nowe po 10 na wolnych kafelkach */
function materialy(sim: Sim, w: World, ile: { deski: number; zlom: number }) {
  const st = sim.st;
  const size = w.size;
  st.things = st.things.filter(
    (t) => !((t.kind === 'deski' || t.kind === 'zlom') && !uSasiada(st, w, t.y * size + t.x)),
  );
  const free = w.fence.yard.filter((i) => !w.blocked[i] && !st.things.some((t) => t.y * size + t.x === i));
  let k = 0;
  for (const [kind, n] of Object.entries(ile))
    for (let left = n; left > 0; left -= 10) {
      const i = free[k++];
      st.things.push({
        id: st.nextThing++,
        kind,
        x: i % size,
        y: Math.floor(i / size),
        w: 1,
        h: 1,
        rot: 0,
        n: Math.min(10, left),
        fuel: 0,
        by: -1,
        owner: -1,
      });
    }
}

/** nasze sztuki materiału (bez łupu w nieotoczonych cudzych budynkach) */
const naszych = (sim: Sim, w: World, kind: string) =>
  sim.st.things.reduce((a, t) => a + (t.kind === kind && !uSasiada(sim.st, w, t.y * w.size + t.x) ? t.n : 0), 0);

describe('wspólny płot z jednego materiału', () => {
  it('koszt: deska i złom na metr albo 2 sztuki jednego materiału; drzwi zawsze 2 deski, czas ten sam', () => {
    const r = { dlugosc: 65, zabic: [11, 22] };
    expect(kosztPlotu(r).need).toEqual({ deski: 69, zlom: 65 });
    expect(kosztPlotu(r, 'mieszany')).toEqual(kosztPlotu(r));
    expect(kosztPlotu(r, 'deski').need).toEqual({ deski: 134 });
    expect(kosztPlotu(r, 'zlom').need).toEqual({ zlom: 130, deski: 4 });
    expect(kosztPlotu({ dlugosc: 10, zabic: [] }, 'zlom').need).toEqual({ zlom: 20 });
    expect(kosztPlotu(r, 'deski').total).toBe(kosztPlotu(r).total);
    expect(kosztPlotu(r, 'zlom').total).toBe(kosztPlotu(r).total);
    // bez nowych metrów (sam budynek przy podwórku) warianty kosztują tyle samo: w menu tylko jeden
    expect(wariantyPlotu({ dlugosc: 0, zabic: [11] }, { deski: 50, zlom: 50 })).toEqual(['mieszany']);
    expect(wariantyPlotu(r, { deski: 69, zlom: 65 })).toEqual(['mieszany']);
    expect(wariantyPlotu(r, { deski: 134, zlom: 0 })).toEqual(['deski']);
  });

  it('menu: wariant, na który starcza materiału, kilka z wyborem, a bez materiału deska i złom jak dotąd', () => {
    const { w, sim, b, p, r } = graZPlotem();
    const m = r.dlugosc;
    const z = r.zabic.length;
    const plot = () => commandsAt(sim.st, w, [p.id], b.entrances[0].tile).filter((i) => i.cmd.t === 'enclose');
    const warianty = () => plot().map((i) => (i.cmd.t === 'enclose' ? i.cmd.wariant : null));
    materialy(sim, w, { deski: 2 * m + 2 * z, zlom: m - 1 });
    expect(warianty()).toEqual(['deski']);
    expect(plot()[0].label).toMatch(new RegExp(`^Otoczyć wspólnym płotem z desek \\(${m} m: ${2 * m + 2 * z} desek, `));
    materialy(sim, w, { deski: 2 * z, zlom: 2 * m });
    expect(warianty()).toEqual(['zlom']);
    expect(plot()[0].label).toMatch(new RegExp(`^Otoczyć wspólnym płotem ze złomu \\(${m} m: ${2 * m} złomu, `));
    materialy(sim, w, { deski: 2 * m + 2 * z, zlom: 2 * m });
    expect(warianty()).toEqual(['mieszany', 'deski', 'zlom']);
    materialy(sim, w, { deski: m + 2 * z, zlom: m });
    expect(warianty()).toEqual(['mieszany']);
    expect(plot()[0].label).toMatch(new RegExp(`^Otoczyć wspólnym płotem \\(${m} m: `));
    materialy(sim, w, { deski: 0, zlom: 0 });
    expect(warianty()).toEqual(['mieszany']);
    expect(plot().every((i) => i.confirm)).toBe(true);
  });

  it('plan pamięta wybór: płot ze złomu bierze złom, a deski tylko na drzwi', () => {
    const { w, sim, b, p, r } = graZPlotem();
    const m = r.dlugosc;
    const z = r.zabic.length;
    materialy(sim, w, { deski: 2 * z + 6, zlom: 2 * m + 6 });
    const deski0 = naszych(sim, w, 'deski');
    const zlom0 = naszych(sim, w, 'zlom');
    sim.push({ t: 'enclose', ids: [p.id], bid: b.id, wariant: 'zlom' });
    sim.step();
    expect(sim.st.plot?.plan?.wariant).toBe('zlom');
    expect(sim.st.plot?.plan?.need).toEqual(kosztPlotu(r, 'zlom').need);
    buduj(sim, b.id, p);
    expect(sim.st.plot?.bids).toEqual([b.id]);
    expect(naszych(sim, w, 'zlom')).toBe(zlom0 - 2 * m);
    expect(naszych(sim, w, 'deski')).toBe(deski0 - 2 * z);
  });

  it('stary zapis z planem bez wariantu: deska i złom, ten sam skrót i przebieg', () => {
    const { sim, b, p } = graZPlotem();
    sim.push({ t: 'enclose', ids: [p.id], bid: b.id });
    for (let k = 0; k < 200; k++) sim.step();
    expect(sim.st.plot?.plan?.wariant).toBe('mieszany');
    const old = JSON.parse(JSON.stringify(sim.st)) as SimState;
    delete (old.plot!.plan as { wariant?: string }).wariant;
    const copy = new Sim(swiezy('lanciego'), old);
    expect(copy.st.plot?.plan?.wariant).toBe('mieszany');
    expect(copy.hash()).toBe(sim.hash());
    for (let k = 0; k < 400; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});

describe('duch planu wspólnego płotu', () => {
  it('nowe kafelki z plotDla jak w menu, postęp jak na karcie budynku; bez planu nic, stan bez zmian', () => {
    const { w, sim, b, p, r } = graZPlotem();
    expect(duchPlotu(sim.st, w)).toBeNull();
    sim.push({ t: 'enclose', ids: [p.id], bid: b.id });
    sim.step();
    const plan = sim.st.plot!.plan!;
    const h = sim.hash();
    const d = duchPlotu(sim.st, w)!;
    expect(sim.hash()).toBe(h);
    expect(d.bid).toBe(b.id);
    expect(d.tiles).toEqual(r.nowe);
    expect(r.nowe).toContain(d.znak);
    // sprite'y siatki na każdym nowym kafelku, z maską przyszłej siatki; łączniki po skosie tylko przy nowych
    const size = w.size;
    const on = new Set(d.siatka.map((t) => t.y * size + t.x));
    for (const t of r.nowe) expect(on.has(t)).toBe(true);
    const nowe = new Set(r.nowe);
    const blisko = (i: number) =>
      [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1].some((o) => nowe.has(i + o));
    for (const t of d.siatka) {
      expect(t.kind).toBe('siatka');
      const i = t.y * size + t.x;
      if (nowe.has(i)) continue;
      // łącznik po skosie: nie kafelek siatki, tuż przy nowym kafelku
      expect(r.fence.tiles).not.toContain(i);
      expect(blisko(i)).toBe(true);
    }
    // postęp jak na karcie budynku: 40% pracy, materiału jeszcze nie ma
    expect(d.pct).toBe(0);
    expect(d.mats).toBe(0);
    plan.work = Math.round(plan.total * 0.4);
    plan.have = { deski: Math.floor((plan.need.deski ?? 0) / 2) };
    const rec = sim.st.sasiedzi!.budynki.find((x) => x.bid === b.id)!;
    const karta = widokBudynku(w, rec, true, sim.st.plot).plot.pct;
    const d2 = duchPlotu(sim.st, w)!;
    expect(karta).toBe(40);
    expect(d2.pct).toBe(karta);
    expect(d2.mats).toBeCloseTo(
      Math.floor((plan.need.deski ?? 0) / 2) / ((plan.need.deski ?? 0) + (plan.need.zlom ?? 0)),
    );
    // kształt z pamięci, dopóki nic się nie zmieni
    expect(d2.tiles).toBe(d.tiles);
    // po skończonej pracy ducha nie ma
    buduj(sim, b.id, p);
    expect(sim.st.plot?.bids).toEqual([b.id]);
    expect(duchPlotu(sim.st, w)).toBeNull();
  });

  // zasieki i barykada z wraków stoją na siatce tak samo: korytarz płotu ich nie przekracza
  for (const kind of ['zasieki', 'barykada'] as const)
    it(`${kind} na siatce zmieniają ducha tak samo jak menu i pracę`, () => {
      const { w, sim, b, p, r } = graZPlotem();
      sim.push({ t: 'enclose', ids: [p.id], bid: b.id });
      sim.step();
      expect(duchPlotu(sim.st, w)?.tiles).toEqual(r.nowe);
      const t = r.usuniete[Math.floor(r.usuniete.length / 2)];
      sim.st.things.push({
        id: sim.st.nextThing++,
        kind,
        x: t % w.size,
        y: Math.floor(t / w.size),
        w: 1,
        h: 1,
        rot: 0,
        n: 1,
        fuel: 0,
        by: -1,
        owner: -1,
      });
      const r2 = plotDla(sim.st, w, b.id);
      expect(r2?.ok ? r2.nowe : null).not.toEqual(r.nowe);
      expect(duchPlotu(sim.st, w)?.tiles ?? null).toEqual(r2?.ok ? r2.nowe : null);
    });

  it('rysunek planu ze sprite’a: kryjące piksele w błękicie (ciemne ciemniej), cień i puste znikają', () => {
    const sp = { w: 2, h: 2, ax: 1, ay: 2, px: Uint32Array.of(rgba(0x262321), rgba(0xf0f0f0), 0x60000000, 0) };
    const d = duchSprite(sp);
    expect([d.w, d.h, d.ax, d.ay]).toEqual([2, 2, 1, 2]);
    expect(d.px[2]).toBe(0);
    expect(d.px[3]).toBe(0);
    const rgb = (c: number) => [c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, c >>> 24];
    const [r0, g0, b0, a0] = rgb(d.px[0]);
    const [r1, g1, b1, a1] = rgb(d.px[1]);
    expect(a0).toBe(255);
    expect(a1).toBe(255);
    // niebieski przeważa, a jasny piksel zostaje jaśniejszy niż ciemny
    expect(b0).toBeGreaterThan(r0);
    expect(b1).toBeGreaterThan(r1);
    expect(r1 + g1 + b1).toBeGreaterThan(r0 + g0 + b0);
    // oryginał bez zmian
    expect(sp.px[0]).toBe(rgba(0x262321));
  });

  it('procent cyframi z pikseli: 3×5 na znak, przerwa 1', () => {
    const n = napisPikselami('40%');
    expect(n.w).toBe(11);
    expect(n.h).toBe(5);
    for (const [x, y] of n.px) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(11);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(5);
      expect(x % 4).not.toBe(3);
    }
    // jedynka: 8 pikseli; każda cyfra ma swój wzór
    expect(napisPikselami('1').px).toHaveLength(8);
    const wzory = new Set([...'0123456789%'].map((c) => JSON.stringify(napisPikselami(c).px)));
    expect(wzory.size).toBe(11);
  });
});
