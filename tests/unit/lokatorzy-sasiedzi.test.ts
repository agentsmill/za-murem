/* Lokatorzy sąsiednich budynków z generatora mieszkańców (src/sim/lokatorzy.ts, zrodloLokatorow; fala 2): te same
   osoby przy każdym pytaniu, osoby z odnośnikiem i bez numerów mieszkań i pięter w tekstach, stany wszystkich mieszkań
   parteru, gospodarstwa tylko w zamieszkanych, numer klatki z wejścia, a w symulacji wpis budynku z tymi osobami. Na
   demach Lanciego i Batowic z tabelami z public/data/mieszkancy/ (atrapa fetch czyta pliki). */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { zrodloLokatorow } from '../../src/sim/lokatorzy.ts';
import { drzwiBudynku, type LokatorzyBudynku, wnetrze } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { core, doorWhere, until } from './sasiedzi-pomoc.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

const dema = new Map<string, { world: World; geo: Geo; dane: DaneMieszkancow }>();

beforeAll(async () => {
  for (const nazwa of ['lanciego', 'zielonki']) {
    const d = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${nazwa}.json`), 'utf8')) as {
      geo: Geo;
      addr: string;
      street?: string;
    };
    const dane = await wczytajDaneMieszkancow(d.geo.c[0], d.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${nazwa}`);
    const geo = oznaczGeo(d.geo, budynkiZCzlonkami(d.geo, dane.gmina, dane.kraj));
    const world = buildWorld(geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
    dema.set(nazwa, { world, geo, dane });
  }
}, 60_000);

const near = (w: World, cls: string) => doorWhere(w, 'zwykly', () => true, [cls]).bid;

describe('lokatorzy sąsiednich budynków z generatora', () => {
  it('ten sam budynek: te same osoby; osoby z odnośnikiem, bez numerów mieszkań i pięter', () => {
    const { world, geo, dane } = dema.get('lanciego')!;
    const bid = near(world, 'blok');
    const a = zrodloLokatorow(world, geo, dane)(bid)!;
    const b = zrodloLokatorow(world, geo, dane)(bid)!;
    expect(b).toEqual(a);
    expect(a.domy.length).toBeGreaterThan(0);
    for (const d of a.domy)
      for (const o of d.osoby) {
        expect(o.ref).toBeTruthy();
        expect(RODO.test(o.story ?? '')).toBe(false);
        expect(RODO.test(o.rodzina ?? '')).toBe(false);
      }
  });

  it('stany wszystkich mieszkań parteru, gospodarstwa tylko w zamieszkanych, klatka z wejścia', () => {
    const { world, geo, dane } = dema.get('lanciego')!;
    const bid = near(world, 'blok');
    const n = Math.max(...wnetrze(world, bid).rooms.map((r) => r.apt)) + 1;
    const l: LokatorzyBudynku = zrodloLokatorow(world, geo, dane)(bid)!;
    expect(l.stany.map((s) => s.apt)).toEqual([...Array(n).keys()]);
    const lived = l.stany.filter((s) => s.state === 'mieszkancy').map((s) => s.apt);
    expect(l.domy.map((d) => d.apt)).toEqual(lived);
    const wejscia = drzwiBudynku(world, bid).zewn.filter((d) => d.wejscie >= 0).length;
    for (const d of l.domy) {
      expect(d.klatka).toBeGreaterThanOrEqual(0);
      expect(d.klatka).toBeLessThan(wejscia);
    }
    for (const s of l.stany.filter((x) => x.state === 'puste' && x.why)) expect(s.year).toBeGreaterThanOrEqual(2029);
  });

  it('w grze wpis budynku dostaje osoby z generatora (dom w Batowicach)', () => {
    const { world, geo, dane } = dema.get('zielonki')!;
    const sim = new Sim(world, createSim(world, 5, { core: 4 }));
    sim.lokatorzy = zrodloLokatorow(world, geo, dane);
    const { bid, door } = doorWhere(world, 'zwykly', () => true, ['dom']);
    const p = core(sim)[0];
    sim.push({ t: 'knock', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    const b = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    const l = zrodloLokatorow(world, geo, dane)(bid)!;
    expect(b.domy.map((d) => d.osoby.map((o) => o.ref))).toEqual(l.domy.map((d) => d.osoby.map((o) => o.ref)));
  });
});
