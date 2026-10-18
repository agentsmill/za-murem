import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { labelRegions } from '../../src/sim/path.ts';
import { type AptState, type AptWhy, applyApts, settleApts, settleAptsOf } from '../../src/world/apts.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { buildInterior, IN } from '../../src/world/interior.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const WHY: AptWhy[] = ['wyjazd', 'wymarcie', 'splądrowanie', 'zalanie', 'pozar'];

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
/** długi blok przy ulicy, przed nim park: kilka klatek i kilkanaście mieszkań na parterze */
const blockGeo = (): Geo => ({
  c: [0, 0],
  b: [{ p: rect(-40, -20, 80, 12), t: { building: 'apartments', 'building:levels': '5' } }],
  r: [{ l: [[-90, 16] as Pt, [90, 16] as Pt], h: 'residential' }],
  a: [{ p: rect(-80, -6, 160, 14), k: 'park' }],
  w: [],
  poi: [],
});
const address = (key: string, seed = 1) => {
  const a = ADDRESSES.find((x) => x.key === key)!;
  return buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed });
};
const demo = (key: string) => {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
};

/** numer mieszkania pod kafelkiem albo −1 */
const aptAt = (w: World, t: number) => {
  const r = w.interior.room[t];
  return r >= 0 ? w.interior.rooms[r].apt : -1;
};
const near4 = (w: World, t: number) => [t - w.size, t + 1, t + w.size, t - 1];

/** mieszkania (poza zarządem) osiągalne z podwórka bez wychodzenia za siatkę, jak mieszkańcy w symulacji */
function reachable(w: World): Set<number> {
  const { size, fence, interior: it } = w;
  const closed = w.blocked.slice();
  for (const t of [...fence.tiles, ...fence.hole]) closed[t] = 1;
  for (let y = fence.gate.y; y < fence.gate.y + fence.gate.h; y++)
    for (let x = fence.gate.x; x < fence.gate.x + fence.gate.w; x++) closed[y * size + x] = 1;
  for (let i = 0; i < size * size; i++) if (aptAt(w, i) === it.home && it.home >= 0) closed[i] = 1;
  const reg = labelRegions(closed, size);
  const yard = fence.yard.find((i) => !closed[i]);
  const out = new Set<number>();
  if (yard === undefined) return out;
  for (let i = 0; i < size * size; i++) {
    const a = aptAt(w, i);
    if (a >= 0 && a !== it.home && !closed[i] && reg[i] === reg[yard]) out.add(a);
  }
  return out;
}

/** wspólne sprawdzenia stanów i zawartości mieszkań siedziby; given: stany podane z zewnątrz, wtedy bez
    sprawdzania rozkładu (połowa pustych, mieszkańcy przy podwórku), bo o nim decyduje generator */
function checkApts(w: World, given = false) {
  const { size, interior: it } = w;
  const n = Math.max(-1, ...it.rooms.map((r) => r.apt)) + 1;
  const state = new Map(w.apts.map((a) => [a.apt, a]));
  // każde mieszkanie siedziby ma jeden stan
  expect(w.apts.map((a) => a.apt).sort((p, q) => p - q)).toEqual([...Array(n).keys()]);
  for (const a of w.apts) expect(a.bid).toBe(w.hq);
  // zarząd mieszka tam, gdzie wnętrze postawiło kozę
  expect(w.apts.filter((a) => a.state === 'zarzad').map((a) => a.apt)).toEqual(it.home >= 0 ? [it.home] : []);
  // puste to mniej więcej połowa pozostałych, z powodem i rokiem opuszczenia
  const others = w.apts.filter((a) => a.state !== 'zarzad');
  const empty = others.filter((a) => a.state === 'puste');
  if (!given) expect(Math.abs(empty.length - others.length / 2)).toBeLessThanOrEqual(1);
  for (const a of w.apts)
    if (a.state === 'puste') {
      expect(WHY).toContain(a.why);
      expect(a.year).toBeGreaterThanOrEqual(2026);
      expect(a.year).toBeLessThanOrEqual(2051);
    } else {
      expect(a.why).toBeUndefined();
      expect(a.year).toBeUndefined();
    }
  // z podwórka da się dojść do mieszkań mieszkańców, a gdy osiągalnych jest więcej, także do pustego
  const reach = given ? [] : [...reachable(w)];
  if (reach.length)
    expect(
      reach.some((a) => state.get(a)?.state === 'mieszkancy'),
      'brak mieszkańców przy podwórku',
    ).toBe(true);
  if (reach.length >= 2)
    expect(
      reach.some((a) => state.get(a)?.state === 'puste'),
      'brak pustego przy podwórku',
    ).toBe(true);
  const empt = (a: number) => state.get(a)?.state === 'puste';
  // śmieci: sterty 1×1 na wolnej posadzce pustych mieszkań, przechodnie, nie na meblach
  const covered = new Set<number>();
  for (const f of it.furniture)
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) covered.add(y * size + x);
  const trash = w.props.filter((p) => p.kind === 'smieci');
  const seen = new Set<number>();
  for (const p of trash) {
    expect([p.w, p.h]).toEqual([1, 1]);
    expect(p.n).toBeGreaterThanOrEqual(1);
    expect(p.n).toBeLessThanOrEqual(3);
    const t = p.y * size + p.x;
    expect(it.cell[t], 'śmieci nie na posadzce').toBe(IN.FLOOR);
    expect(empt(aptAt(w, t)), 'śmieci poza pustym mieszkaniem').toBe(true);
    expect(w.blocked[t], 'śmieci blokują').toBe(0);
    expect(covered.has(t), 'śmieci na meblu').toBe(false);
    expect(seen.has(t), 'dwie sterty na kafelku').toBe(false);
    seen.add(t);
  }
  // zepsute meble tylko w pustych mieszkaniach
  for (const f of it.furniture) if (f.broken) expect(empt(aptAt(w, f.y * size + f.x)), `zepsuty ${f.kind}`).toBe(true);
  // uszkodzenia: w pustym mieszkaniu, na kafelku zgodnym z rodzajem
  for (const d of w.damage) {
    expect(d.bid).toBe(w.hq);
    expect(empt(d.apt), `uszkodzenie ${d.kind} poza pustym`).toBe(true);
    const touches = near4(w, d.tile).some((k) => it.cell[k] === IN.FLOOR && aptAt(w, k) === d.apt);
    if (d.kind === 'okno') {
      expect(it.windows).toContain(d.tile);
      expect(touches).toBe(true);
    } else if (d.kind === 'drzwi') {
      expect(it.cell[d.tile]).toBe(IN.DOOR);
      expect(touches).toBe(true);
      // wyważone drzwi zostają przejściem
      expect(w.blocked[d.tile]).toBe(0);
    } else {
      expect(it.cell[d.tile]).toBe(IN.FLOOR);
      expect(aptAt(w, d.tile)).toBe(d.apt);
      const kind = it.rooms[it.room[d.tile]].kind;
      if (d.kind === 'rura') expect(['lazienka', 'kuchnia']).toContain(kind);
      if (d.kind === 'piec') expect(kind).toBe('kuchnia');
    }
  }
  expect(new Set(w.damage.map((d) => `${d.kind}:${d.tile}`)).size).toBe(w.damage.length);
  // każde puste ma coś do odzyskania albo do naprawienia; powód widać po uszkodzeniach
  for (const a of empty) {
    const dmg = w.damage.filter((d) => d.apt === a.apt).map((d) => d.kind);
    const junk = trash.filter((p) => aptAt(w, p.y * size + p.x) === a.apt);
    expect(dmg.length + junk.length, `puste ${a.apt} bez niczego`).toBeGreaterThan(0);
    if (a.why === 'splądrowanie') expect(dmg).toContain('drzwi');
    if (a.why === 'zalanie') expect(dmg).toEqual(expect.arrayContaining(['rura', 'podloga']));
    const hasWindow = it.windows.some((t) => near4(w, t).some((k) => aptAt(w, k) === a.apt));
    if (a.why === 'pozar' && hasWindow) expect(dmg).toContain('okno');
  }
  // zarząd i mieszkańcy bez śmieci, uszkodzeń i zepsutych mebli
  for (const a of w.apts.filter((x) => x.state !== 'puste')) {
    expect(w.damage.some((d) => d.apt === a.apt)).toBe(false);
    expect(trash.some((p) => aptAt(w, p.y * size + p.x) === a.apt)).toBe(false);
  }
  // trzepak dalej pierwszy w props, śmieci na końcu
  if (w.props.length) expect(w.props[0].kind).toBe('trzepak');
  const firstTrash = w.props.findIndex((p) => p.kind === 'smieci');
  if (firstTrash >= 0) expect(w.props.slice(firstTrash).every((p) => p.kind === 'smieci')).toBe(true);
}

describe('stany mieszkań siedziby i zawartość pustych', () => {
  for (const a of ADDRESSES)
    it(`${a.key}: zarząd, mieszkańcy i puste z powodem; w pustych śmieci, uszkodzenia i zepsute meble`, () => {
      checkApts(address(a.key));
    });
  for (const key of ['przymorze', 'lanciego', 'zielonki'])
    it(`demo ${key} z ziarnem z adresu`, () => {
      checkApts(demo(key));
    });

  it('sztuczny długi blok: kilkanaście mieszkań, mniej więcej połowa pustych, każdy powód z zawartością', () => {
    const whys = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const w = buildWorld(blockGeo(), { seed, size: 192 });
      expect(w.apts.length).toBeGreaterThanOrEqual(6);
      checkApts(w);
      for (const a of w.apts) if (a.why) whys.add(a.why);
    }
    expect([...whys].sort()).toEqual([...WHY].sort());
  });

  it('przy podwórku jedno puste do przeszukania, reszta dla mieszkańców z M1', () => {
    for (const w of [address('przymorze'), address('lanciego'), demo('przymorze'), demo('lanciego')]) {
      const reach = [...reachable(w)];
      expect(reach.length).toBeGreaterThanOrEqual(2);
      const empty = reach.filter((a) => w.apts.find((s) => s.apt === a)?.state === 'puste');
      expect(empty).toHaveLength(1);
    }
  });

  it('ten sam świat i ziarno: te same stany i zawartość; inne ziarno: inne', () => {
    const w1 = address('przymorze', 3);
    const w2 = address('przymorze', 3);
    expect(w2.apts).toEqual(w1.apts);
    expect(w2.damage).toEqual(w1.damage);
    expect(w2.props).toEqual(w1.props);
    expect(w2.interior.furniture).toEqual(w1.interior.furniture);
    const layouts = new Set<string>();
    for (let s = 1; s <= 5; s++) layouts.add(JSON.stringify(address('przymorze', s).apts));
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('stany z zewnątrz (generator mieszkańców): zawartość idzie za nimi, zarząd zostaje przy kozie', () => {
    const w = address('przymorze');
    const home = w.interior.home;
    const others = w.apts.filter((a) => a.apt !== home);
    // wszyscy mieszkają: nic pustego, żadnych śmieci, uszkodzeń ani zepsutych mebli
    const full: AptState[] = others.map((a) => ({ bid: w.hq, apt: a.apt, state: 'mieszkancy' }));
    applyApts(w, settleApts(w, full));
    expect(w.apts.filter((a) => a.state === 'puste')).toEqual([]);
    expect(w.props.some((p) => p.kind === 'smieci')).toBe(false);
    expect(w.damage).toEqual([]);
    expect(w.interior.furniture.some((f) => f.broken)).toBe(false);
    // jedno spalone mieszkanie i próba oddania mieszkania zarządu: zarząd zostaje, spalone ma wybite okno
    const burnt = others.find((a) => w.interior.windows.some((t) => near4(w, t).some((k) => aptAt(w, k) === a.apt)))!;
    const given: AptState[] = [
      { bid: w.hq, apt: home, state: 'puste', why: 'wyjazd', year: 2030 },
      { bid: w.hq, apt: burnt.apt, state: 'puste', why: 'pozar', year: 2044 },
    ];
    applyApts(w, settleApts(w, given));
    expect(w.apts.find((a) => a.apt === home)?.state).toBe('zarzad');
    expect(w.apts.find((a) => a.apt === burnt.apt)).toEqual({
      bid: w.hq,
      apt: burnt.apt,
      state: 'puste',
      why: 'pozar',
      year: 2044,
    });
    expect(w.damage.filter((d) => d.apt === burnt.apt).map((d) => d.kind)).toContain('okno');
    // ponowne nałożenie nie dubluje śmieci, a trzepak, sterty i wraki zostają
    const before = w.props.filter((p) => p.kind !== 'smieci');
    applyApts(w, settleApts(w, given));
    expect(w.props.filter((p) => p.kind !== 'smieci')).toEqual(before);
    checkApts(w, true);
  });

  it('dom bez innych mieszkań: tylko mieszkanie zarządu', () => {
    const w = address('zielonki');
    expect(w.apts).toEqual([{ bid: w.hq, apt: w.interior.home, state: 'zarzad' }]);
    expect(w.damage).toEqual([]);
  });
});

describe('stany i zawartość mieszkań dowolnego budynku (fala 2)', () => {
  /** blok przy siedzibie na Lanciego (23 m od jej drzwi, trzy klatki) */
  const lanciego = () => {
    const w = demo('lanciego');
    return { w, b: w.buildings.find((x) => x.name === 'Blok nr 10F')! };
  };
  const aptsOf = (it: { rooms: { apt: number }[] }) => Math.max(-1, ...it.rooms.map((r) => r.apt)) + 1;

  it('settleApts siedziby bez zmian po wydzieleniu zawartości pustych', () => {
    // skróty policzone na pelna-gra 80d0fed przed wydzieleniem
    const got = ['przymorze', 'lanciego', 'zielonki'].map((k) => hashString(JSON.stringify(settleApts(demo(k)))));
    expect(got).toEqual(['d885a027', 'fb8901c1', '05c01e08']);
  });

  it('settleAptsOf: połowa pustych z powodem i rokiem, bez mieszkania zarządu, deterministycznie', () => {
    const { w, b } = lanciego();
    const it1 = buildInterior(w, b.id);
    const n = aptsOf(it1);
    expect(n).toBeGreaterThanOrEqual(4);
    const r = settleAptsOf(w, it1);
    expect(r.apts.map((a) => a.apt)).toEqual([...Array(n).keys()]);
    expect(r.apts.every((a) => a.bid === b.id && a.state !== 'zarzad')).toBe(true);
    const empty = r.apts.filter((a) => a.state === 'puste');
    expect(Math.abs(empty.length - n / 2)).toBeLessThanOrEqual(1);
    for (const a of empty) {
      expect(WHY).toContain(a.why);
      expect(a.year).toBeGreaterThanOrEqual(2026);
      expect(a.year).toBeLessThanOrEqual(2051);
    }
    // zawartość tylko w pustych mieszkaniach tego budynku
    for (const d of r.damage) {
      expect(d.bid).toBe(b.id);
      expect(empty.some((a) => a.apt === d.apt)).toBe(true);
    }
    for (const t of r.trash) expect(w.bid[t.y * w.size + t.x]).toBe(b.id);
    expect(r.furniture.length).toBe(it1.furniture.length);
    expect(settleAptsOf(w, buildInterior(w, b.id))).toEqual(r);
  });

  it('settleAptsOf: stany z zewnątrz wygrywają, zawartość idzie za nimi', () => {
    const { w, b } = lanciego();
    const it1 = buildInterior(w, b.id);
    const given: AptState[] = [...Array(aptsOf(it1)).keys()].map((apt) =>
      apt === 0
        ? { bid: b.id, apt, state: 'puste', why: 'zalanie', year: 2040 }
        : { bid: b.id, apt, state: 'mieszkancy' },
    );
    const r = settleAptsOf(w, it1, given);
    expect(r.apts).toEqual(given);
    expect(r.damage.map((d) => d.kind)).toContain('rura');
    expect(r.damage.every((d) => d.apt === 0)).toBe(true);
    expect(r.trash.every((t) => it1.rooms[it1.room[t.y * w.size + t.x]].apt === 0)).toBe(true);
  });
});
