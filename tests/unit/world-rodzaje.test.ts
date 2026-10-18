import { describe, expect, it } from 'vitest';
import type { Geo, GeoRodzaj, Pt } from '../../src/world/geo.ts';
import { buildWorld } from '../../src/world/world.ts';

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

/** dwa budynki: większy A (x −30…10, y −20…−8) i mniejszy B (x 30…50, y 10…22), w kolejności malejącego pola */
function geoZRodzajami(rodzaje: GeoRodzaj[] | undefined): Geo {
  const g: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [] };
  g.b.push({ p: rect(-30, -20, 40, 12), t: { building: 'yes', 'building:levels': '3' } });
  g.b.push({ p: rect(30, 10, 20, 12), t: { building: 'yes' } });
  if (rodzaje) g.rodzaje = rodzaje;
  return g;
}

describe('rodzaje punktów przypisane do budynków świata', () => {
  // mapa jest przy budowie obracana o drobny kąt prostujący budynki, więc punkty nie leżą dokładnie na granicy 6,5 m
  const rodzaje: GeoRodzaj[] = [
    { x: -10, y: -14, k: 'muzeum', n: 'Muzeum w środku A' },
    { x: 35, y: 12, k: 'urzad', n: 'Urząd w środku B' },
    { x: 33, y: 5.5, k: 'hotel', n: 'Hotel 4,5 m nad B' },
    { x: 33, y: 0, k: 'teatr', n: 'Teatr 10 m nad B' },
    { x: 60, y: 60, k: 'kosciol', n: 'Kościół w polu' },
  ];

  it('punkt w budynku i punkt blisko budynku dają mu rodzaj (po kolei alfabetycznie), dalsze punkty nikomu', () => {
    const w = buildWorld(geoZRodzajami(rodzaje), { seed: 1, size: 128 });
    expect(w.buildings).toHaveLength(2);
    expect(w.buildings[0].rodzaje).toEqual(['muzeum']);
    expect(w.buildings[1].rodzaje).toEqual(['hotel', 'urzad']);
    const wszystkie = w.buildings.flatMap((b) => b.rodzaje ?? []);
    expect(wszystkie).not.toContain('teatr');
    expect(wszystkie).not.toContain('kosciol');
  });

  it('bez rodzajów budynek nie ma pola rodzaje w ogóle', () => {
    const w = buildWorld(geoZRodzajami(undefined), { seed: 1, size: 128 });
    for (const b of w.buildings) expect('rodzaje' in b).toBe(false);
  });

  it('rodzaje nie zmieniają klasy, pięter, nazwy ani kategorii budynków', () => {
    const z = buildWorld(geoZRodzajami(rodzaje), { seed: 1, size: 128 });
    const bez = buildWorld(geoZRodzajami(undefined), { seed: 1, size: 128 });
    const bezRodzajow = (b: (typeof z.buildings)[number]) => {
      const { rodzaje: _r, ...reszta } = b;
      return reszta;
    };
    expect(z.buildings.map(bezRodzajow)).toEqual(bez.buildings.map(bezRodzajow));
    expect(z.hq).toBe(bez.hq);
  });

  it('obrót mapy obraca też punkty: punkt w środku obróconego budynku zostaje w nim', () => {
    // prostokąt 40×12 obrócony o 20° wokół swojego środka (−10, −14), punkt w tym środku
    const fi = (20 * Math.PI) / 180;
    const [cx, cy] = [-10, -14];
    const obrot = ([x, y]: Pt): Pt => [
      cx + (x - cx) * Math.cos(fi) - (y - cy) * Math.sin(fi),
      cy + (x - cx) * Math.sin(fi) + (y - cy) * Math.cos(fi),
    ];
    const g: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [] };
    g.b.push({ p: rect(-30, -20, 40, 12).map(obrot), t: { building: 'yes' } });
    g.rodzaje = [{ x: cx, y: cy, k: 'dworzec', n: 'Dworzec' }];
    const w = buildWorld(g, { seed: 1, size: 128 });
    expect(w.angle).not.toBe(0);
    expect(w.buildings[0].rodzaje).toEqual(['dworzec']);
  });
});
