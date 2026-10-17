import { describe, expect, it } from 'vitest';
import { labelRegions } from '../../src/sim/path.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { IN, type Interior } from '../../src/world/interior.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
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
});
