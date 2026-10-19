/* Klasa budynku po obu stronach szwu (miasto z kwadratów, etap 1, zadanie 6): dwa kawałki jednego budynku w sąsiednich
   kwadratach dostają tę samą klasę i te same piętra, także gdy miejsce (sklep, szkoła) leży tylko w jednym z nich. Klasę
   liczy classify z kategorii miejsc w budynku, więc w kwadracie miejsca przypisuje się budynkom po całym obrysie z geo
   (sklejone kawałki leżą w geo w całości), a nie po rastrze kwadratu, który widzi tylko swój kawałek. Dom liczy po rastrze jak
   zawsze, więc kawałek w kwadracie obok domu zgadza się z domem dzięki temu, że miejsce leży w obrysie budynku. */

import { describe, expect, it, vi } from 'vitest';
import { budynkiZDomem, sasiedzi8 } from '../../src/world/kwadraty.ts';
import { buildKwadrat, buildWorld, type World } from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';

const N = 384;

/** pary (budynek w a, budynek w b) kafelków przylegających przez szew: b leży o jeden kwadrat na wschód (dx = 1) albo na południe (dx = 0) od a */
function pary(a: World, b: World, dx: number): Array<[number, number]> {
  const widziane = new Set<string>();
  const out: Array<[number, number]> = [];
  for (let t = 0; t < N; t++) {
    const ia = dx ? t * N + N - 1 : (N - 1) * N + t;
    const ib = dx ? t * N : t;
    const x = a.bid[ia];
    const y = b.bid[ib];
    if (x < 0 || y < 0 || widziane.has(`${x}:${y}`)) continue;
    widziane.add(`${x}:${y}`);
    out.push([x, y]);
  }
  return out;
}

describe('klasa i piętra budynku przeciętego szwem', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: kawałki jednego budynku w sąsiednich kwadratach (z domem i bez) mają tę samą klasę i piętra`, () => {
      const seed = 7;
      const geoDomu = geoDomuTestowego(a);
      const uklad = ukladTestowy(a);
      const dom = buildWorld(geoDomu, { seed });
      const swiaty = new Map<string, World>([['0,0', dom]]);
      for (const [sx, sy] of sasiedzi8(0, 0))
        swiaty.set(`${sx},${sy}`, buildKwadrat(geoKwadratuTestowego(a, sx, sy), { seed, uklad, sx, sy, geoDomu }));
      let porownane = 0;
      const rozne: string[] = [];
      for (const [k, w] of swiaty) {
        const [sx, sy] = k.split(',').map(Number);
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ]) {
          const w2 = swiaty.get(`${sx + dx},${sy + dy}`);
          if (!w2) continue;
          for (const [i1, i2] of pary(w, w2, dx)) {
            const b1 = w.buildings[i1];
            const b2 = w2.buildings[i2];
            porownane++;
            if (b1.cls !== b2.cls || b1.levels !== b2.levels)
              rozne.push(`${k}→${sx + dx},${sy + dy}: ${b1.cls}${b1.levels} i ${b2.cls}${b2.levels}`);
          }
        }
      }
      expect(rozne).toEqual([]);
      expect(porownane).toBeGreaterThan(15);
    });
  }

  it('kawałek w kwadracie obok domu bierze klasę z miejsca leżącego w drugiej części budynku (szkoła w domu)', () => {
    // Przymorze: szkoła przecięta szwem domu i kwadratu (0, −1) ma w domu miejsce „szkoła”; kwadrat obok też widzi ją jako szkołę
    const a = ADDRESSES[0];
    const geoDomu = geoDomuTestowego(a);
    const uklad = ukladTestowy(a);
    const dom = buildWorld(geoDomu, { seed: 7 });
    const w = buildKwadrat(geoKwadratuTestowego(a, 0, -1), { seed: 7, uklad, sx: 0, sy: -1, geoDomu });
    const sasiedzi = budynkiZDomem(dom, w, 0, -1);
    const szkoly = [...sasiedzi].filter(([, hb]) => dom.buildings[hb].cls === 'szkola');
    expect(szkoly.length).toBeGreaterThan(0);
    for (const [nb] of szkoly) expect(w.buildings[nb].cls).toBe('szkola');
  });

  it('przypisanie miejsc do budynków kwadratu nie woła Math.hypot: decyzja nie zależy od silnika JS (plan: nowy kod decyzji bez hypot)', () => {
    // klasę budynku liczy classify z miejsc, a miejsce trafia do budynku po odległości od obrysu (6,5 m); świat kwadratu
    // wejdzie do symulacji, więc próg nie może zależeć od zaokrąglenia hypot, które różni się między silnikami
    const a = ADDRESSES[0];
    const geoDomu = geoDomuTestowego(a);
    const uklad = ukladTestowy(a);
    const geo = geoKwadratuTestowego(a, 1, 0);
    expect(geo.poi.length).toBeGreaterThan(10);
    const bezMiejsc = { ...geo, poi: [], rodzaje: [] };
    const wywolania = (g: typeof geo): number => {
      const szpieg = vi.spyOn(Math, 'hypot');
      try {
        buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0, geoDomu });
        return szpieg.mock.calls.length;
      } finally {
        szpieg.mockRestore();
      }
    };
    // reszta budowy (prostowanie, wraki) ma te same wywołania z miejscami i bez; różnica to przypisanie miejsc do budynków
    expect(wywolania(geo)).toBe(wywolania(bezMiejsc));
  });
});
