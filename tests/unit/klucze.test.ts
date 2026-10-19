import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Geo, type Pt, pip, polyArea } from '../../src/world/geo.ts';
import {
  KLATKA_M,
  type KluczeBudynku,
  klatkiBudynku,
  kluczBudynku,
  kluczeSwiata,
  latLonZ,
  liczbaKlatek,
  nrKlatki,
  pikselZ,
  tagiKlucza,
} from '../../src/world/klucze.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { toGeo } from '../../src/world/osm.ts';
import { buildWorld, LOAD_RADIUS, type World, type WorldBuilding } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles, overpassJson } from './fixtures.ts';

/** środek mapy przesunięty o dx metrów na wschód i dy na południe (jak adres sąsiada) */
function shifted(lat: number, lon: number, dx: number, dy: number): [number, number] {
  return [lat - dy / 110574, lon + dx / (111320 * Math.cos((lat * Math.PI) / 180))];
}

/** kafelek świata → globalne piksele (cofnięty obrót siatki, jak w grze) */
function absOf(w: World, c: readonly [number, number], i: number): Pt {
  const tx = (i % w.size) + 0.5 - w.size / 2;
  const ty = Math.floor(i / w.size) + 0.5 - w.size / 2;
  const cs = Math.cos(w.angle);
  const sn = Math.sin(w.angle);
  const kx = 111320 * Math.cos((c[0] * Math.PI) / 180);
  return pikselZ(c[0] - (ty * cs - tx * sn) / 110574, c[1] + (tx * cs + ty * sn) / kx);
}

/** globalne piksele → kafelek świata albo −1 poza mapą */
function tileOf(w: World, c: readonly [number, number], p: Pt): number {
  const [lat, lon] = latLonZ(p[0], p[1]);
  const x = (lon - c[1]) * 111320 * Math.cos((c[0] * Math.PI) / 180);
  const y = (c[0] - lat) * 110574;
  const cs = Math.cos(w.angle);
  const sn = Math.sin(w.angle);
  const tx = Math.floor(x * cs - y * sn + w.size / 2);
  const ty = Math.floor(x * sn + y * cs + w.size / 2);
  return tx < 0 || ty < 0 || tx >= w.size || ty >= w.size ? -1 : ty * w.size + tx;
}

interface Para {
  a: WorldBuilding;
  b: WorldBuilding;
  /** oba budynki całe na swoich mapach (nie dotykają brzegu) */
  cale: boolean;
}

/** Pary tych samych budynków w dwóch światach, niezależnie od kluczy: kafelki budynku z pierwszego świata
    przeniesione przez współrzędne geograficzne do drugiego; para, gdy co najmniej 60% trafia w jeden budynek. */
function pary(wA: World, cA: readonly [number, number], wB: World, cB: readonly [number, number]): Para[] {
  const tiles = new Map<number, number[]>();
  for (let i = 0; i < wA.bid.length; i++) {
    const b = wA.bid[i];
    if (b < 0) continue;
    const list = tiles.get(b) ?? [];
    list.push(i);
    tiles.set(b, list);
  }
  const inside = (w: World, b: WorldBuilding) => b.x0 > 1 && b.y0 > 1 && b.x1 < w.size - 2 && b.y1 < w.size - 2;
  const out: Para[] = [];
  for (const a of wA.buildings) {
    const votes = new Map<number, number>();
    let n = 0;
    for (const i of tiles.get(a.id) ?? []) {
      const j = tileOf(wB, cB, absOf(wA, cA, i));
      if (j < 0) continue;
      n++;
      if (wB.bid[j] >= 0) votes.set(wB.bid[j], (votes.get(wB.bid[j]) ?? 0) + 1);
    }
    if (n < 10) continue;
    let best = -1;
    let most = 0;
    for (const [b, v] of votes)
      if (v > most) {
        best = b;
        most = v;
      }
    if (best >= 0 && most >= n * 0.6) {
      const b = wB.buildings[best];
      out.push({ a, b, cale: inside(wA, a) && inside(wB, b) });
    }
  }
  return out;
}

/** prostokąt o bokach dl × szer metrów obrócony o kąt (stopnie) wokół (lat, lon), w globalnych pikselach */
function prostokat(lat: number, lon: number, dl: number, szer: number, kat: number, zaokr = false): Pt[] {
  const [cx, cy] = pikselZ(lat, lon);
  const mpp = (111320 * 360 * Math.cos((lat * Math.PI) / 180)) / 2 ** 26;
  const r = (kat * Math.PI) / 180;
  const pts: Pt[] = [
    [-dl / 2, -szer / 2],
    [dl / 2, -szer / 2],
    [dl / 2, szer / 2],
    [-dl / 2, szer / 2],
  ].map(([x, y]) => {
    const px = cx + (x * Math.cos(r) - y * Math.sin(r)) / mpp;
    const py = cy + (x * Math.sin(r) + y * Math.cos(r)) / mpp;
    return zaokr ? [Math.round(px), Math.round(py)] : [px, py];
  });
  return [...pts, pts[0]];
}

/** długość osi klatek w metrach z tagu zm:os */
function dlugoscOsi(os: string): number {
  const [x1, y1, x2, y2] = os.split(',').map(Number);
  const [lat] = latLonZ((x1 + x2) / 2, (y1 + y2) / 2);
  return (Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 111320 * 360 * Math.cos((lat * Math.PI) / 180)) / 2 ** 26;
}

describe('klucze budynków i klatek (src/world/klucze.ts)', () => {
  it('pikselZ i latLonZ są odwrotne, a piksel na poziomie 14 to około 0,35 m w Gdańsku', () => {
    const [x, y] = pikselZ(54.4093, 18.5991);
    const [lat, lon] = latLonZ(x, y);
    expect(lat).toBeCloseTo(54.4093, 9);
    expect(lon).toBeCloseTo(18.5991, 9);
    const [, lon2] = latLonZ(x + 1, y);
    expect((lon2 - lon) * 111320 * Math.cos((lat * Math.PI) / 180)).toBeCloseTo(0.35, 2);
  });

  it('tagi z obrysu nie zależą od kolejności wierzchołków, kierunku obiegu ani podziału na części', () => {
    const ring = prostokat(54.41, 18.6, 50, 12, 23, true);
    const base = tagiKlucza([ring]);
    expect(base).not.toBeNull();
    const open = ring.slice(0, -1);
    for (let s = 1; s < open.length; s++) {
      const rot = [...open.slice(s), ...open.slice(0, s)];
      expect(tagiKlucza([[...rot, rot[0]]])).toEqual(base);
      const rev = rot.slice().reverse();
      expect(tagiKlucza([[...rev, rev[0]]])).toEqual(base);
    }
    // budynek przecięty granicą kafelków: dwie części z tymi samymi wierzchołkami skrajnymi i tą samą otoczką
    const [p0, p1, p2, p3] = open;
    const m01: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const m23: Pt = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
    expect(
      tagiKlucza([
        [p0, m01, m23, p3, p0],
        [m01, p1, p2, m23, m01],
      ]),
    ).toEqual(base);
  });

  it('klucz to skrajne wierzchołki, oś to dłuższy bok od zachodu, klatka co 20 m', () => {
    for (const kat of [0, 17, 45, 73, 90, 133, -60]) {
      const ring = prostokat(54.41, 18.6, 100, 12, kat, true);
      const t = tagiKlucza([ring]);
      expect(t, `${kat}°`).not.toBeNull();
      if (!t) continue;
      const pts = ring.slice(0, -1);
      const lo = pts.reduce((m, p) => (p[1] < m[1] || (p[1] === m[1] && p[0] < m[0]) ? p : m));
      const hi = pts.reduce((m, p) => (p[1] > m[1] || (p[1] === m[1] && p[0] > m[0]) ? p : m));
      // prostokąt ma wierzchołki po obu stronach cięciwy od najwyższego do najniższego (3)
      expect(t['zm:klucz']).toBe(`px:${lo[0]}:${lo[1]}:${hi[0] - lo[0]}:${hi[1] - lo[1]}:3`);
      // oś wzdłuż dłuższego boku (zaokrąglenie wierzchołków do piksela: ±0,5 m), od zachodu na wschód
      expect(Math.abs(dlugoscOsi(t['zm:os']) - 100), `${kat}°`).toBeLessThan(0.5);
      const [x1, y1, x2, y2] = t['zm:os'].split(',').map(Number);
      expect(x1 < x2 || (x1 === x2 && y1 < y2)).toBe(true);
      const b = { tags: t };
      expect(liczbaKlatek(b)).toBe(5);
      const kl = klatkiBudynku(b);
      expect(kl.map((k) => k.klucz)).toEqual([1, 2, 3, 4, 5].map((n) => `${t['zm:klucz']}/${n}`));
      // środki klatek co 20 m wzdłuż osi, numer klatki z rzutu jej środka na oś
      for (const k of kl) expect(nrKlatki(b, pikselZ(k.lat, k.lon))).toBe(k.nr);
    }
    // długość na granicy zaokrąglenia nie decyduje o niczym poza liczbą klatek: 29 m to jedna, 31 m dwie
    expect(liczbaKlatek({ tags: tagiKlucza([prostokat(54.41, 18.6, 29, 10, 0)]) ?? {} })).toBe(1);
    expect(liczbaKlatek({ tags: tagiKlucza([prostokat(54.41, 18.6, 31, 10, 0)]) ?? {} })).toBe(2);
    expect(KLATKA_M).toBe(20);
  });

  it('dwa budynki o tych samych skrajnych wierzchołkach (ściana po przekątnej) mają różne klucze', () => {
    const [x, y] = pikselZ(54.41, 18.6).map(Math.round);
    const lewy = tagiKlucza([
      [
        [x, y],
        [x + 60, y + 120],
        [x, y + 120],
        [x, y],
      ],
    ]);
    const prawy = tagiKlucza([
      [
        [x, y],
        [x + 60, y],
        [x + 60, y + 120],
        [x, y],
      ],
    ]);
    expect(lewy?.['zm:klucz']).toBe(`px:${x}:${y}:60:120:1`);
    expect(prawy?.['zm:klucz']).toBe(`px:${x}:${y}:60:120:2`);
    // piksel różnicy w wierzchołku, który nie jest skrajny (kafelki a Overpass), klucza nie zmienia
    const obok = tagiKlucza([
      [
        [x, y],
        [x + 61, y + 1],
        [x + 60, y + 120],
        [x, y],
      ],
    ]);
    expect(obok?.['zm:klucz']).toBe(prawy?.['zm:klucz']);
  });

  it('budynek bez tagów (demo sprzed kluczy, osiedle zapasowe) nie ma klucza', () => {
    const d = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    ) as { geo: Geo };
    // dema w repo są przegenerowane i mają klucze; demo sprzed kluczy to to samo demo bez tagów zm:klucz i zm:os
    expect(d.geo.b.every((b) => b.t['zm:klucz'] && b.t['zm:os'])).toBe(true);
    for (const b of d.geo.b) {
      delete b.t['zm:klucz'];
      delete b.t['zm:os'];
    }
    expect(d.geo.b.some((b) => b.t['zm:klucz'])).toBe(false);
    const w = buildWorld(d.geo, { seed: 1 });
    expect(kluczeSwiata(w, d.geo.c).every((k) => k === null)).toBe(true);
    expect(kluczBudynku(w.buildings[0])).toBeNull();
    expect(klatkiBudynku(w.buildings[0])).toEqual([]);
    expect(tagiKlucza([[[0, 0]]])).toBeNull();
    expect(tagiKlucza([])).toBeNull();
  });

  for (const a of ADDRESSES) {
    it(`${a.key}: ten sam budynek z innego środka mapy i przy innym obrocie siatki ma te same klucze`, () => {
      const tiles = decodedTiles(a);
      const geoA = toGeoT(tiles, a.lat, a.lon, LOAD_RADIUS);
      const wA = buildWorld(geoA, { seed: 1 });
      const kA = kluczeSwiata(wA, geoA.c);
      // każdy budynek z kafelków ma klucz, klucze w świecie się nie powtarzają
      expect(kA.every((k) => k !== null)).toBe(true);
      expect(new Set(kA.map((k) => k?.budynek)).size).toBe(wA.buildings.length);
      let rotated = 0;
      let full = 0;
      let doors = 0;
      for (const [dx, dy] of [
        [90, 60],
        [-120, 40],
        [60, -150],
      ]) {
        const geoB = toGeoT(tiles, ...shifted(a.lat, a.lon, dx, dy), LOAD_RADIUS);
        const wB = buildWorld(geoB, { seed: 1 });
        const kB = kluczeSwiata(wB, geoB.c);
        if (Math.abs(wA.angle - wB.angle) > (5 * Math.PI) / 180) rotated++;
        const ps = pary(wA, geoA.c, wB, geoB.c);
        expect(ps.length, `${dx},${dy}`).toBeGreaterThan(10);
        for (const { a: bA, b: bB, cale } of ps) {
          const ka = kA[bA.id] as KluczeBudynku;
          const kb = kB[bB.id] as KluczeBudynku;
          // klucz budynku: także budynki ucięte brzegiem mapy
          expect(kb.budynek, `${bA.name} / ${bB.name}`).toBe(ka.budynek);
          if (!cale) continue;
          full++;
          // klatki (klucze i pozycje) wynikają z obrysu, nie ze świata
          expect(kb.klatki).toEqual(ka.klatki);
          // drzwi: ten sam klucz, kiedy oba światy postawiły tyle drzwi, ile budynek ma klatek
          const n = ka.klatki.length;
          if (bA.entrances.length === n && bB.entrances.length === n) {
            doors++;
            expect(kb.wejscia).toEqual(ka.wejscia);
            expect(new Set(ka.wejscia).size).toBe(n);
          }
          // każde drzwi trafiają do którejś z klatek budynku
          for (const k of [...ka.wejscia, ...kb.wejscia]) expect(ka.klatki.map((x) => x.klucz)).toContain(k);
        }
      }
      expect(full).toBeGreaterThan(30);
      expect(doors).toBeGreaterThan(full * 0.7);
      // na Przymorzu i w Zielonkach przesunięty środek daje inny obrót siatki (dominujący kierunek ścian)
      if (a.key !== 'lanciego') expect(rotated).toBeGreaterThan(0);
    });
  }

  it('budynki przecięte granicą kafelków i ucięte brzegiem mapy: ten sam klucz z gęstej siatki środków', () => {
    // punkty w budynkach przeciętych granicą kafelków (z maleńkimi kawałkami przy granicy) i w bloku, z którego
    // gracz 300 m na północ widzi na mapie tylko jeden z czterech kawałków; metry na wschód i południe od adresu
    const proby: [string, number, number][] = [
      ['lanciego', 404, -255],
      ['lanciego', 150, -257],
      ['lanciego', 400, -265],
      ['lanciego', 26, -291],
      ['zielonki', -406, 272],
      ['przymorze', -540, 340],
      ['przymorze', -301, 352],
      ['przymorze', 517, 349],
    ];
    const metryOd = (c: readonly [number, number], lat: number, lon: number): Pt => [
      (lon - c[1]) * 111320 * Math.cos((c[0] * Math.PI) / 180),
      (c[0] - lat) * 110574,
    ];
    for (const [key, bx, by] of proby) {
      const a = ADDRESSES.find((x) => x.key === key) as (typeof ADDRESSES)[number];
      const tiles = decodedTiles(a);
      const [plat, plon] = shifted(a.lat, a.lon, bx, by);
      const klucze = new Set<string>();
      // środki 100 m na zachód od punktu, przesuwane o ułamki metra (inne zaokrąglenia do pół metra),
      // i środki 300 m dalej we wszystkie strony (punkt przy brzegu mapy)
      const srodki: [number, number][] = [];
      for (let i = 0; i < 16; i++) srodki.push([-100 + i * 0.13, 50 + (i % 4) * 0.17]);
      for (const [dx, dy] of [
        [0, -300],
        [0, 300],
        [-300, 0],
        [300, 0],
      ])
        srodki.push([dx, dy]);
      for (const [dx, dy] of srodki) {
        const c = shifted(plat, plon, dx, dy);
        const geo = toGeoT(tiles, c[0], c[1], LOAD_RADIUS);
        const [x, y] = metryOd(geo.c, plat, plon);
        const trafione = geo.b.filter((b) => [b.p, ...(b.pp ?? [])].some((q) => pip(x, y, q)));
        if (!trafione.length) continue;
        trafione.sort((u, v) => polyArea(u.p) - polyArea(v.p));
        klucze.add(trafione[0].t['zm:klucz']);
      }
      expect([...klucze], `${key} ${bx},${by}`).toHaveLength(1);
    }
  });

  it('Overpass: ten sam budynek co z kafelków ma zwykle ten sam klucz i oś', () => {
    const a = ADDRESSES[0];
    const tiles = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const over = toGeo(overpassJson() as Parameters<typeof toGeo>[0], a.lat, a.lon);
    expect(over.b.every((b) => b.t['zm:klucz'] && b.t['zm:os'])).toBe(true);
    // porównujemy budynki z Overpass, których środek leży w budynku z kafelków (Overpass ma też dalekie sklepy)
    const center = (p: Pt[]): Pt => {
      const r = p.slice(0, -1);
      return [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length];
    };
    let both = 0;
    let sameKey = 0;
    let sameAxis = 0;
    for (const o of over.b) {
      const [x, y] = center(o.p);
      if (Math.hypot(x, y) > 200) continue;
      const t = tiles.b.find((b) => {
        const r = b.p;
        let inside = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++)
          if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0])
            inside = !inside;
        return inside;
      });
      if (!t) continue;
      both++;
      if (t.t['zm:klucz'] === o.t['zm:klucz']) sameKey++;
      if (t.t['zm:os'] === o.t['zm:os']) sameAxis++;
    }
    expect(both).toBeGreaterThan(30);
    expect(sameKey / both).toBeGreaterThan(0.85);
    expect(sameAxis / both).toBeGreaterThan(0.75);
  });
});
