import { describe, expect, it } from 'vitest';
import { labelRegions } from '../../src/sim/path.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { applyInterior, buildInterior, IN, type Interior } from '../../src/world/interior.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World, type WorldBuilding } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
const geoWith = (b: Pt[], kind: string, levels: string): Geo => ({
  c: [0, 0],
  b: [{ p: b, t: { building: kind, 'building:levels': levels } }],
  r: [
    {
      l: [
        [-80, 12],
        [80, 12],
      ],
      h: 'residential',
    },
  ],
  a: [],
  w: [],
  poi: [],
});

const N4 = (i: number, size: number) => {
  const x = i % size;
  return [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size].filter((k) => k >= 0 && k < size * size);
};

/** wspólne sprawdzenia wnętrza siedziby */
function checkInterior(w: World, it: Interior) {
  const size = w.size;
  const hq = w.buildings[w.hq];
  expect(it.building).toBe(w.hq);
  // każdy kafelek wnętrza należy do siedziby, a brzeg siedziby to ściana albo drzwi
  for (let i = 0; i < size * size; i++) {
    if (it.cell[i] === IN.NONE) continue;
    expect(w.bid[i]).toBe(w.hq);
    const edge = N4(i, size).some((k) => w.bid[k] !== w.hq) || N4(i, size).length < 4;
    if (edge) expect([IN.WALL, IN.DOOR]).toContain(it.cell[i]);
  }
  // drzwi frontowe tam, gdzie wejścia
  for (const e of hq.entrances) expect(it.cell[e.tile]).toBe(IN.DOOR);
  // ściany i schody blokują przejście, posadzki i drzwi nie
  for (let i = 0; i < size * size; i++) {
    const c = it.cell[i];
    if (c !== IN.NONE) expect(w.blocked[i]).toBe(c === IN.WALL || c === IN.STAIRS ? 1 : 0);
  }
  // z pierwszych drzwi frontowych dojdzie się pieszo do każdego kafelka posadzki (meble jeszcze nie stoją).
  // Liczone po całej mapie, nie tylko przez wnętrze: klatki parteru nie łączą się w środku, a falowiec
  // na Przymorzu jest przecięty przejściami na trzy kawałki z osobnymi drzwiami.
  const reg = labelRegions(w.blocked, size);
  const home = reg[hq.entrances[0].out];
  const reach = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    if (it.cell[i] !== IN.FLOOR) continue;
    expect(it.room[i], 'posadzka bez pomieszczenia').toBeGreaterThanOrEqual(0);
    expect(reg[i], `posadzka ${i} nieosiągalna`).toBe(home);
    reach.add(it.room[i]);
  }
  for (const r of it.rooms) expect(reach.has(r.id), `pomieszczenie ${r.kind} ${r.id} nieosiągalne`).toBe(true);
  // koza: jedna, w kuchni mieszkania zarządu, przy ścianie zewnętrznej z oknem
  const kozy = it.furniture.filter((f) => f.kind === 'koza');
  expect(kozy).toHaveLength(1);
  const koza = kozy[0];
  const ki = koza.y * size + koza.x;
  const room = it.rooms[it.room[ki]];
  expect(room.kind).toBe('kuchnia');
  expect(room.apt).toBe(it.home);
  expect(N4(ki, size).some((k) => it.windows.includes(k))).toBe(true);
  // meble nie stoją na drzwiach ani tuż za nimi, nie wychodzą poza pomieszczenia
  const doorSide = new Set<number>();
  for (const d of it.doors) for (const k of N4(d, size)) doorSide.add(k);
  for (const f of it.furniture) {
    if (f.kind === 'krzeslo') continue;
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++) {
        const i = (f.y + dy) * size + f.x + dx;
        expect(it.room[i], `${f.kind} poza pomieszczeniem`).toBeGreaterThanOrEqual(0);
        expect(doorSide.has(i), `${f.kind} zastawia drzwi`).toBe(false);
      }
  }
  // skład drewna: wolne kafelki obok kozy
  expect(it.sklad.length).toBeGreaterThanOrEqual(2);
  for (const s of it.sklad) expect(it.room[s]).toBe(it.room[ki]);
  // przy kozie stoi stół z krzesłami: zarząd je w kuchni
  const stol = it.furniture.find((f) => f.kind === 'stol' && it.room[f.y * size + f.x] === it.room[ki]);
  expect(stol, 'w kuchni zarządu nie ma stołu').toBeTruthy();
  const chairs = it.furniture.filter((f) => f.kind === 'krzeslo' && it.room[f.y * size + f.x] === it.room[ki]);
  expect(chairs.length).toBeGreaterThanOrEqual(2);
  // w mieszkaniu zarządu są co najmniej 4 miejsca do spania
  const beds = it.furniture.filter(
    (f) => (f.kind === 'lozko' || f.kind === 'wersalka') && it.rooms[it.room[f.y * size + f.x]].apt === it.home,
  );
  expect(beds.length).toBeGreaterThanOrEqual(3);
}

describe('wnętrze siedziby', () => {
  it('blok z dwiema klatkami: dwie klatki schodowe, cztery mieszkania', () => {
    const w = buildWorld(geoWith(rect(-24, -6, 48, 13), 'apartments', '5'), { seed: 3, size: 128 });
    const it = w.interior!;
    expect(it).toBeTruthy();
    checkInterior(w, it);
    expect(w.buildings[w.hq].entrances).toHaveLength(2);
    expect(it.rooms.filter((r) => r.kind === 'klatka')).toHaveLength(2);
    const apts = new Set(it.rooms.filter((r) => r.apt >= 0).map((r) => r.apt));
    expect(apts.size).toBe(4);
    for (const k of ['pokoj', 'kuchnia', 'lazienka', 'przedpokoj'])
      expect(it.rooms.some((r) => r.kind === k)).toBe(true);
  });

  it('dom: przedpokój, kuchnia, łazienka, pokój', () => {
    const w = buildWorld(geoWith(rect(-5, -4, 11, 10), 'house', '2'), { seed: 5, size: 96 });
    const it = w.interior!;
    checkInterior(w, it);
    for (const k of ['pokoj', 'kuchnia', 'lazienka', 'przedpokoj'])
      expect(it.rooms.some((r) => r.kind === k)).toBe(true);
    expect(it.rooms.some((r) => r.kind === 'klatka')).toBe(false);
  });

  it('ściany i schody blokują przejście, posadzki i drzwi nie', () => {
    const w = buildWorld(geoWith(rect(-24, -6, 48, 13), 'apartments', '5'), { seed: 3, size: 128 });
    const it = w.interior!;
    for (let i = 0; i < w.size * w.size; i++) {
      const c = it.cell[i];
      if (c === IN.NONE) continue;
      expect(w.blocked[i]).toBe(c === IN.WALL || c === IN.STAIRS ? 1 : 0);
    }
  });

  for (const a of ADDRESSES) {
    it(`${a.key}: wnętrze prawdziwej siedziby`, () => {
      const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
      checkInterior(w, w.interior!);
    });
  }

  it('ten sam świat i ziarno: to samo wnętrze', () => {
    const g = geoWith(rect(-24, -6, 48, 13), 'apartments', '5');
    const a = buildWorld(g, { seed: 9, size: 128 }).interior!;
    const b = buildWorld(g, { seed: 9, size: 128 }).interior!;
    expect(JSON.stringify(b.furniture)).toBe(JSON.stringify(a.furniture));
    expect([...b.cell]).toEqual([...a.cell]);
  });

  it('wnętrze wynika tylko ze świata, numeru budynku i ziarna (bez ukrytego stanu)', () => {
    const a = ADDRESSES[0];
    const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
    // gotowy świat (z nałożonym wnętrzem, suchym drzewem i trzepakiem) daje to samo wnętrze siedziby
    expect(buildInterior(w, w.hq, { home: true })).toEqual(w.interior);
    // wnętrze innego budynku nie zależy od tego, co już nałożono na świat
    const other = w.buildings.find((b) => b.id !== w.hq && b.cls === 'blok' && b.entrances.length)!;
    const before = buildInterior(w, other.id);
    applyInterior(w, buildInterior(w, w.buildings.find((b) => b.id !== w.hq && b.id !== other.id)!.id));
    expect(buildInterior(w, other.id)).toEqual(before);
  });

  it('bez home: nie ma kozy, składu ani mieszkania zarządu', () => {
    const a = ADDRESSES[1];
    const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
    const it = buildInterior(w, w.hq);
    expect(it.home).toBe(-1);
    expect(it.sklad).toEqual([]);
    expect(it.furniture.some((f) => f.kind === 'koza')).toBe(false);
    expect(it.rooms.filter((r) => r.kind === 'kuchnia').length).toBeGreaterThan(0);
  });

  it('nakładanie na świat: ściany i schody blokują, reszta nie; regiony liczone od nowa', () => {
    const a = ADDRESSES[2];
    const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
    const b = w.buildings.find((x) => x.id !== w.hq && x.cls === 'dom' && x.entrances.length)!;
    const door = b.entrances[0];
    const it = buildInterior(w, b.id);
    expect(w.blocked[door.tile]).toBe(1);
    const reg = applyInterior(w, it);
    expect(w.blocked[door.tile]).toBe(0);
    for (let i = 0; i < w.size * w.size; i++)
      if (it.cell[i] !== IN.NONE) expect(w.blocked[i]).toBe(it.cell[i] === IN.WALL || it.cell[i] === IN.STAIRS ? 1 : 0);
    expect([...reg]).toEqual([...labelRegions(w.blocked, w.size)]);
    // wnętrze łączy się z podwórkiem przez drzwi
    for (const r of it.rooms) {
      const i = it.room.findIndex((x, k) => x === r.id && it.cell[k] === IN.FLOOR);
      expect(reg[i]).toBe(reg[door.out]);
    }
  });
});

const RESIDENTIAL = new Set(['blok', 'dom']);

/** niezmienniki wnętrza dowolnego budynku (bez kozy, składu i łóżek zarządu); zwraca listę problemów */
function checkGeneric(w: World, b: WorldBuilding, it: Interior): string[] {
  const size = w.size;
  const bad: string[] = [];
  const fail = (m: string) => bad.length < 10 && bad.push(`${b.name} (${b.cls}, ${b.id}): ${m}`);
  if (it.building !== b.id || it.home !== -1 || it.sklad.length) fail('budynek, home albo skład');
  // wnętrze pokrywa dokładnie budynek, brzeg to ściana albo drzwi, numery pomieszczeń się zgadzają
  const outerDoors: number[] = [];
  for (let i = 0; i < size * size; i++) {
    const c = it.cell[i];
    if ((c !== IN.NONE) !== (w.bid[i] === b.id)) fail(`kafelek ${i} wnętrza poza budynkiem albo dziura`);
    if (c === IN.NONE) continue;
    const edge = N4(i, size).some((k) => w.bid[k] !== b.id) || N4(i, size).length < 4;
    if (edge && c !== IN.WALL && c !== IN.DOOR) fail(`brzeg ${i} to nie ściana ani drzwi`);
    if (edge && c === IN.DOOR) outerDoors.push(i);
    if (it.room[i] >= 0 !== (c === IN.FLOOR || c === IN.STAIRS)) fail(`room[${i}] nie pasuje do kafelka`);
  }
  it.rooms.forEach((r, k) => {
    if (r.id !== k) fail(`pomieszczenie ${k} ma id ${r.id}`);
    if (!RESIDENTIAL.has(b.cls) && r.apt !== -1) fail(`mieszkanie w budynku bez mieszkań`);
  });
  // drzwi frontowe na wejściach, każde drzwi zewnętrzne wychodzą na wolny teren
  for (const e of b.entrances) if (it.cell[e.tile] !== IN.DOOR) fail(`wejście ${e.tile} bez drzwi`);
  for (const d of outerDoors)
    if (!N4(d, size).some((k) => w.bid[k] < 0 && !w.blocked[k])) fail(`drzwi ${d} wychodzą w mur`);
  // od drzwi zewnętrznych przez wnętrze do każdego kafelka posadzki i każdego pomieszczenia
  const seen = new Uint8Array(size * size);
  const q = [...outerDoors];
  for (const d of q) seen[d] = 1;
  for (let k = 0; k < q.length; k++)
    for (const n of N4(q[k], size)) {
      if (seen[n] || (it.cell[n] !== IN.FLOOR && it.cell[n] !== IN.DOOR)) continue;
      seen[n] = 1;
      q.push(n);
    }
  const reached = new Set<number>();
  for (let i = 0; i < size * size; i++)
    if (it.cell[i] === IN.FLOOR) {
      if (!seen[i]) fail(`posadzka ${i} nieosiągalna`);
      reached.add(it.room[i]);
    }
  for (const r of it.rooms) if (!reached.has(r.id)) fail(`${r.kind} ${r.id} nieosiągalne`);
  // meble w pomieszczeniach, bez kozy, nie na sobie i (poza krzesłami) nie tuż przy drzwiach
  const doorSide = new Set<number>();
  for (const d of it.doors) for (const k of N4(d, size)) doorSide.add(k);
  const taken = new Set<number>();
  for (const f of it.furniture) {
    if (f.kind === 'koza') fail('koza poza siedzibą');
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++) {
        const i = (f.y + dy) * size + f.x + dx;
        if (it.cell[i] !== IN.FLOOR || it.room[i] !== it.room[f.y * size + f.x]) fail(`${f.kind} poza pomieszczeniem`);
        if (taken.has(i)) fail(`${f.kind} na innym meblu`);
        taken.add(i);
        if (f.kind !== 'krzeslo' && doorSide.has(i)) fail(`${f.kind} zastawia drzwi`);
      }
  }
  return bad;
}

describe('wnętrze dowolnego budynku', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: każdy budynek z wejściem dostaje poprawne wnętrze`, () => {
      const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 1 });
      const classes = new Set<string>();
      const bad: string[] = [];
      for (const b of w.buildings) {
        if (!b.entrances.length) continue;
        bad.push(...checkGeneric(w, b, buildInterior(w, b.id)));
        classes.add(b.cls);
      }
      expect(bad).toEqual([]);
      expect(classes.size).toBeGreaterThanOrEqual(3);
    });
  }

  it('sklep i garaż obok siedziby: prosty układ bez mieszkań, garaż to jedno pomieszczenie', () => {
    const g = geoWith(rect(-10, -6, 20, 12), 'apartments', '4');
    g.b.push({ p: rect(20, -5, 24, 12), t: { building: 'retail', 'building:levels': '1' } });
    g.b.push({ p: rect(-30, -2, 6, 5), t: { building: 'garage', 'building:levels': '1' } });
    const w = buildWorld(g, { seed: 2, size: 128 });
    const shop = w.buildings.find((b) => b.cls === 'sklep')!;
    const it = buildInterior(w, shop.id);
    expect(checkGeneric(w, shop, it)).toEqual([]);
    expect(it.rooms.some((r) => r.kind === 'sala')).toBe(true);
    expect(it.rooms.some((r) => r.kind === 'zaplecze')).toBe(true);
    const garage = w.buildings.find((b) => b.cls === 'garaz')!;
    const gi = buildInterior(w, garage.id);
    expect(checkGeneric(w, garage, gi)).toEqual([]);
    expect(gi.rooms.map((r) => r.kind)).toEqual(['hala']);
  });
});
