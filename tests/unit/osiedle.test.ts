/* Świat gry z mieszkańcami z generatora (src/sim/osiedle.ts): oznaczona mapa daje ten sam świat co nieoznaczona (poza
   tagami), nowa gra dostaje stany mieszkań z generatora, bez tabel albo po wyjątku zostaje stara ścieżka, a wznowienie
   zapisu z osobami z generatora odtwarza świat z chwili startu (stany mieszkań z zapisu, także bez tabel); zapis
   sprzed kroku 5 zostaje przy stanach M2. Na trzech demach i tabelach z public/ (atrapa `fetch` czyta pliki). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { aptsFrom } from '../../src/sim/mieszkania.ts';
import {
  mapaMieszkancow,
  mieszkancyNowejGry,
  mieszkancyZapisu,
  opcjaMieszkancow,
  stanyM2,
  stanyZapisu,
  zGeneratora,
} from '../../src/sim/osiedle.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { worldKey } from '../../src/ui/zapis.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
type NazwaDema = (typeof DEMA)[number];

const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

interface Demo {
  geo: Geo;
  addr: string;
  street: string;
  seed: number;
  dane: DaneMieszkancow;
}
const dema = new Map<NazwaDema, Demo>();
const demo = (n: NazwaDema): Demo => dema.get(n)!;

beforeAll(async () => {
  for (const n of DEMA) {
    const s = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${n}.json`), 'utf8')) as Demo;
    const dane = await wczytajDaneMieszkancow(s.geo.c[0], s.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${n}`);
    // ziarno jak w grze (main.ts): z adresu
    dema.set(n, { ...s, seed: Number.parseInt(hashString(s.addr), 16) || 2051, dane });
  }
});

afterEach(() => vi.restoreAllMocks());

/** świat do porównań: tablice jako skróty, bez tagów generatora */
const odcisk = (w: World): string =>
  JSON.stringify(
    {
      ...w,
      buildings: w.buildings.map(({ tags, ...b }) => {
        const { 'zm:bud': _, ...reszta } = tags;
        return { ...b, tags: reszta };
      }),
    },
    (_, v) => (ArrayBuffer.isView(v) ? hashString(Array.from(v as unknown as ArrayLike<number>).join(',')) : v),
  );
/** to, co stany mieszkań kładą na świat */
const mieszkania = (w: World) => ({
  apts: w.apts,
  damage: w.damage,
  furniture: w.interior.furniture,
  smieci: w.props.filter((p) => p.kind === 'smieci'),
});
const swiat = (d: Demo, geo: Geo = d.geo): World => buildWorld(geo, { seed: d.seed, street: d.street });
/** nowa gra jak w main.ts: oznaczona mapa, świat, mieszkańcy, createSim z opcją */
const nowaGra = (d: Demo, core = 4) => {
  const geo = mapaMieszkancow(d.geo, d.dane);
  const world = swiat(d, geo);
  const l = mieszkancyNowejGry(world, geo, d.dane, core);
  if (!l) throw new Error('bez mieszkańców z generatora');
  const st = createSim(world, d.seed, { core, mieszkancy: opcjaMieszkancow(l) });
  return { geo, world, l, st };
};
/** zapis gry: stan po kilku godzinach gry przez JSON (jak localStorage) */
const poGrze = (world: World, st: SimState): SimState => {
  const sim = new Sim(world, st);
  for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) sim.step();
  return JSON.parse(JSON.stringify(sim.st)) as SimState;
};

describe('mapa z tagami zm:bud', () => {
  it('świat z oznaczonej mapy jest taki sam jak z nieoznaczonej, poza samymi tagami', () => {
    for (const n of DEMA) {
      const d = demo(n);
      const geo = mapaMieszkancow(d.geo, d.dane);
      expect(geo, n).not.toBe(d.geo);
      const a = swiat(d);
      const b = swiat(d, geo);
      expect(
        b.buildings.some((x) => x.tags['zm:bud'] !== undefined),
        n,
      ).toBe(true);
      expect(odcisk(b), n).toBe(odcisk(a));
      expect(worldKey(b), n).toBe(worldKey(a));
    }
  });

  it('bez tabel ta sama mapa; wyjątek przy oznaczaniu: ta sama mapa i ostrzeżenie', () => {
    const d = demo('przymorze');
    expect(mapaMieszkancow(d.geo, null)).toBe(d.geo);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zle = { ...d.dane, kraj: null } as unknown as DaneMieszkancow;
    expect(mapaMieszkancow(d.geo, zle)).toBe(d.geo);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('nowa gra', () => {
  it('stany mieszkań siedziby z generatora na świecie, createSim czyta je ze świata', () => {
    for (const n of DEMA) {
      const { world, l, st } = nowaGra(demo(n));
      expect(world.apts, n).toEqual(
        l.stany.map((s) => ({
          ...s,
          ...(s.state === 'puste' ? { why: expect.any(String), year: expect.any(Number) } : {}),
        })),
      );
      expect(
        st.apts.map((a) => a.state),
        n,
      ).toEqual(l.stany.map((s) => s.state));
      expect(zGeneratora(st), n).toBe(true);
    }
  });

  it('bez tabel: null, świat nietknięty (stany M2)', () => {
    const d = demo('lanciego');
    const world = swiat(d);
    const przed = odcisk(world);
    expect(mieszkancyNowejGry(world, d.geo, null, 4)).toBeNull();
    expect(odcisk(world)).toBe(przed);
    expect(zGeneratora(createSim(world, d.seed, { core: 4 }))).toBe(false);
  });

  it('wyjątek w generatorze: null z ostrzeżeniem, świat nietknięty', () => {
    const d = demo('przymorze');
    const geo = mapaMieszkancow(d.geo, d.dane);
    const world = swiat(d, geo);
    const przed = odcisk(world);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zle = { ...d.dane, imiona: null } as unknown as DaneMieszkancow;
    expect(mieszkancyNowejGry(world, geo, zle, 4)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(odcisk(world)).toBe(przed);
  });

  it('powrót do stanów M2 (createSim z osobami z generatora się nie udał): świat jak bez generatora', () => {
    for (const n of DEMA) {
      const d = demo(n);
      const { geo, world } = nowaGra(d);
      const stary = odcisk(swiat(d, geo));
      // na Przymorzu generator daje inne puste mieszkania niż ziarno świata, więc powrót naprawdę coś zmienia
      if (n === 'przymorze') expect(odcisk(world), n).not.toBe(stary);
      stanyM2(world);
      expect(odcisk(world), n).toBe(stary);
    }
  });

  it('ta sama droga dwa razy daje ten sam świat i te same osoby', () => {
    const a = nowaGra(demo('przymorze'));
    const b = nowaGra(demo('przymorze'));
    expect(odcisk(b.world)).toBe(odcisk(a.world));
    expect(JSON.stringify(b.st)).toBe(JSON.stringify(a.st));
  });
});

describe('wznowienie zapisu', () => {
  it('zapis z osobami z generatora: świat ze stanami mieszkań z zapisu taki jak na starcie, z tabelami i bez', () => {
    for (const n of DEMA) {
      const d = demo(n);
      const start = nowaGra(d, n === 'zielonki' ? 2 : 4);
      const st = poGrze(start.world, start.st);
      expect(zGeneratora(st), n).toBe(true);
      // z tabelami: świat z oznaczonej mapy, budynek siedziby z generatora do imion i historii
      const geo = mapaMieszkancow(d.geo, d.dane);
      const w1 = swiat(d, geo);
      const l = mieszkancyZapisu(w1, geo, d.dane, st);
      expect(mieszkania(w1), n).toEqual(mieszkania(start.world));
      expect(JSON.stringify(l?.siedziba), n).toBe(JSON.stringify(start.l.siedziba));
      // bez tabel: świat z nieoznaczonej mapy, te same mieszkania, bez danych do imion
      const w2 = swiat(d);
      expect(mieszkancyZapisu(w2, d.geo, null, st), n).toBeNull();
      expect(mieszkania(w2), n).toEqual(mieszkania(start.world));
      // świat i stan gry mówią o mieszkaniach to samo
      const house = houseOf(w2)!;
      expect(
        aptsFrom(w2, house).map(({ apt, state, why, year }) => ({ apt, state, why, year })),
        n,
      ).toEqual(st.apts.map(({ apt, state, why, year }) => ({ apt, state, why, year })));
    }
  });

  it('zapis gry z generatorem bez osób z generatora (własna drużyna): świat ze stanami mieszkań z zapisu', () => {
    const d = demo('przymorze');
    const start = nowaGra(d);
    const st = poGrze(start.world, start.st);
    for (const p of st.people) delete p.ref;
    expect(zGeneratora(st)).toBe(false);
    const geo = mapaMieszkancow(d.geo, d.dane);
    const w = swiat(d, geo);
    // warunek wstępny: stany z generatora są inne niż M2 świata
    expect(mieszkania(w)).not.toEqual(mieszkania(start.world));
    expect(mieszkancyZapisu(w, geo, d.dane, st)).toBeNull();
    expect(mieszkania(w)).toEqual(mieszkania(start.world));
  });

  it('zapis sprzed kroku 5 (bez osób z generatora): świat ze stanami M2, z którymi powstał, bez danych do imion', () => {
    for (const n of DEMA) {
      const d = demo(n);
      const stary = swiat(d);
      const st = poGrze(stary, createSim(stary, d.seed, { core: 4 }));
      expect(zGeneratora(st), n).toBe(false);
      const geo = mapaMieszkancow(d.geo, d.dane);
      const w = swiat(d, geo);
      expect(mieszkancyZapisu(w, geo, d.dane, st), n).toBeNull();
      expect(mieszkania(w), n).toEqual(mieszkania(stary));
      expect(worldKey(w), n).toBe(worldKey(stary));
    }
  });

  it('stanyZapisu: stan, a pustego powód i rok; bez st.apts pusto', () => {
    const st = {
      apts: [
        { apt: 0, state: 'zarzad' as const, ours: true, searched: [] },
        { apt: 1, state: 'puste' as const, why: 'zalanie' as const, year: 2040, ours: false, searched: [3] },
        { apt: 2, state: 'mieszkancy' as const, ours: true, searched: [] },
      ],
    };
    expect(stanyZapisu(st, 7)).toEqual([
      { bid: 7, apt: 0, state: 'zarzad' },
      { bid: 7, apt: 1, state: 'puste', why: 'zalanie', year: 2040 },
      { bid: 7, apt: 2, state: 'mieszkancy' },
    ]);
    expect(stanyZapisu({} as Pick<SimState, 'apts'>, 7)).toEqual([]);
  });
});
