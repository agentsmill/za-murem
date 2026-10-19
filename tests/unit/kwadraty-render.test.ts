/* Rysowanie wielu kwadratów (miasto z kwadratów, etap 1, zadanie 6), część bez PixiJS: zamówienia kawałków z numerem
   kwadratu, plan zamówień z budżetem tekstur i poziomem „bardzo daleko”, pula workerów z kilkoma scenami (scena kwadratu
   idzie do workera przy pierwszym zamówieniu, najwyżej dziewięć naraz) i łatki sceny kwadratu. Widok (view.ts) składa
   to w całość; jego część bez przeglądarki sprawdza kwadraty-widok.test.ts. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../src/render/art/scene.ts';
import { kawalkiSzwu, type Strona } from '../../src/render/art/szew.ts';
import {
  budzety,
  type FromWorker,
  LOD_FAR,
  LOD_NEAR,
  LOD_VERY_FAR,
  MAX_SCEN_WORKERA,
  type Order,
  ofiary,
  type PlanWiele,
  planOrders,
  planOrdersWiele,
  poziomZoomu,
  type ToWorker,
  type WorkerLike,
  WorkerPainter,
  ZOOM_NEAR,
  ZOOM_VERY_FAR,
} from '../../src/render/chunks.ts';
import { malaScena } from './kwadraty-pomoc.ts';

const mala = (seed = 1): Scene => malaScena(seed);

type Bitmap = ImageBitmap & { closed: boolean };
function bitmap(): Bitmap {
  const b = {
    closed: false,
    close: () => {
      b.closed = true;
    },
  };
  return b as unknown as Bitmap;
}

/** podróbka workera: zapisuje, co dostał, a odpowiada, kiedy każe test */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: ToWorker[] = [];
  postMessage(m: ToWorker): void {
    this.sent.push(m);
  }
  terminate(): void {}
  reply(m: FromWorker): void {
    this.onmessage?.({ data: m } as MessageEvent);
  }
  ready(): void {
    this.reply({ t: 'ready', ok: true });
  }
  rodzaje(): string[] {
    return this.sent.map((m) => (m.t === 'scene' || m.t === 'drop' ? `${m.t}${m.q ?? 0}` : m.t));
  }
  draws(): Array<{ k: number; s: number; q: number }> {
    return this.sent.flatMap((m) => (m.t === 'draw' ? [{ k: m.k, s: m.s, q: m.q ?? 0 }] : []));
  }
  /** oddaje ostatnie zamówienie jako gotowe */
  finish(): Bitmap {
    const d = this.sent.findLast((m) => m.t === 'draw');
    if (d?.t !== 'draw') throw new Error('worker nic nie rysuje');
    const bmp = bitmap();
    this.reply({ t: 'done', gen: d.gen, k: d.k, s: d.s, v: d.v, q: d.q, bmp, ms: 1 });
    return bmp;
  }
}

function pool(count: number) {
  const fakes: FakeWorker[] = [];
  const p = new WorkerPainter(() => {
    const f = new FakeWorker();
    fakes.push(f);
    return f;
  }, count);
  return { p, fakes };
}

const zam = (q: number, k: number, s = LOD_NEAR, v = 0): Order => ({ k, s, v, ...(q ? { q } : {}) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('poziom szczegółów z zoomu', () => {
  it('z bliska od zoomu 0,5, daleko do 0,125, a poniżej bardzo daleko, ale tylko gdy kwadratów jest więcej niż dom', () => {
    expect(ZOOM_NEAR).toBe(0.5);
    expect(ZOOM_VERY_FAR).toBe(0.125);
    expect(poziomZoomu(1, true)).toBe('blisko');
    expect(poziomZoomu(0.5, true)).toBe('blisko');
    expect(poziomZoomu(0.4999, true)).toBe('daleko');
    expect(poziomZoomu(0.125, true)).toBe('daleko');
    expect(poziomZoomu(0.1249, true)).toBe('bardzo-daleko');
    expect(poziomZoomu(0.02, true)).toBe('bardzo-daleko');
    // sam dom rysuje się jak zawsze: najdalszy poziom to 8 px na kafelek
    expect(poziomZoomu(0.07, false)).toBe('daleko');
    expect(poziomZoomu(0.5, false)).toBe('blisko');
  });

  it('poziom „bardzo daleko” to 2 piksele na metr, w przeciwieństwie do 8 i 32', () => {
    expect(LOD_VERY_FAR).toBe(2);
    expect(LOD_FAR).toBe(8);
    expect(LOD_NEAR).toBe(32);
  });
});

describe('budżety tekstur', () => {
  it('telefon: 144 dalekie, komputer: do 432; bliskie jak dotąd', () => {
    expect(budzety(true)).toEqual({ bliskie: 16, dalekie: 144, bardzoDalekie: 1296 });
    expect(budzety(false)).toEqual({ bliskie: 48, dalekie: 432, bardzoDalekie: 3600 });
  });

  it('ofiary: najdawniej widziane ponad limit, nigdy te widoczne w tej klatce', () => {
    const k = [
      { id: 'a', uzyte: 5 },
      { id: 'b', uzyte: 9 },
      { id: 'c', uzyte: 2 },
      { id: 'd', uzyte: 9 },
      { id: 'e', uzyte: 3 },
    ];
    expect(ofiary(k, 5, 9)).toEqual([]);
    expect(ofiary(k, 3, 9)).toEqual(['c', 'e']);
    // limit 1: trzeba wyrzucić cztery, ale b i d są widoczne w tej klatce (9), więc wypadają tylko trzy
    expect(ofiary(k, 1, 9)).toEqual(['c', 'e', 'a']);
    expect(ofiary(k, 0, 99)).toEqual(['c', 'e', 'a', 'b', 'd']);
  });
});

/** plan dla dziewięciu kwadratów po 144 kawałki (12 × 12): widoczne i stan tekstur z mapy */
function plan(opcje: {
  vis: Array<[number, number]>;
  jest?: (q: number, k: number, s: number, cut?: boolean) => boolean;
  zapas?: number;
  kwadratow?: number;
  cut?: (q: number, k: number) => boolean;
}): PlanWiele {
  const kw = opcje.kwadratow ?? 9;
  const tlo = Array.from({ length: kw * 144 }, (_, i) => ({ q: Math.floor(i / 144), k: i % 144 }));
  return {
    vis: opcje.vis.map(([q, k]) => ({ q, k })),
    tlo,
    has: opcje.jest ?? (() => false),
    ver: () => 0,
    cutOf: opcje.cut ?? (() => false),
    zapas: opcje.zapas ?? 100,
  };
}

describe('plan zamówień dla wielu kwadratów', () => {
  it('dla jednego kwadratu daje to samo co planOrders (z bliska i z daleka, w różnych stanach tekstur)', () => {
    let ziarno = 12345;
    const los = () => {
      ziarno = (Math.imul(ziarno, 1103515245) + 12345) >>> 0;
      return ziarno / 4294967296;
    };
    for (let proba = 0; proba < 60; proba++) {
      const vis = Array.from({ length: 12 }, () => Math.floor(los() * 144));
      const wizyt = [...new Set(vis)];
      const stan = new Map<string, boolean>();
      const jest = (k: number, s: number, cut?: boolean) => {
        const klucz = `${k}:${s}:${cut ? 1 : 0}`;
        let v = stan.get(klucz);
        if (v === undefined) stan.set(klucz, (v = los() < 0.4));
        return v;
      };
      const cutOf = (k: number) => k % 5 === 0;
      const ver = (k: number) => k % 3;
      for (const [poziom, blisko] of [
        ['blisko', true],
        ['daleko', false],
      ] as const) {
        const stary = planOrders(wizyt, 144, jest, blisko, ver, cutOf);
        const nowy = planOrdersWiele(poziom, {
          vis: wizyt.map((k) => ({ q: 0, k })),
          tlo: Array.from({ length: 144 }, (_, k) => ({ q: 0, k })),
          has: (_q, k, s, cut) => jest(k, s, cut),
          ver: (_q, k) => ver(k),
          cutOf: (_q, k) => cutOf(k),
          zapas: Number.POSITIVE_INFINITY,
        });
        expect(nowy).toEqual(stary);
      }
    }
  });

  it('dziewięć kwadratów, zoom 0,3: najpierw widoczne kawałki domu, dalekie tła tylko w budżecie, bez bliskich', () => {
    const vis: Array<[number, number]> = [];
    for (let k = 50; k < 70; k++) vis.push([0, k]);
    vis.push([1, 3], [1, 4]);
    const zapas = budzety(false).dalekie - vis.length;
    const lista = planOrdersWiele('daleko', plan({ vis, zapas }));
    expect(lista.slice(0, 20).every((o) => !o.q && o.s === LOD_FAR)).toBe(true);
    expect(lista[20]).toMatchObject({ q: 1, k: 3 });
    expect(lista.every((o) => o.s === LOD_FAR)).toBe(true);
    // widoczne (22) plus tło w budżecie: razem nie więcej niż MAX_FAR tekstur dalekich
    expect(lista.length).toBe(budzety(false).dalekie);
    expect(new Set(lista.map((o) => `${o.q ?? 0}:${o.k}`)).size).toBe(lista.length);
  });

  it('tekstury, które już są, nie liczą się do zamówień ani do zapasu tła', () => {
    const maDom = (q: number, _k: number, s: number) => q === 0 && s === LOD_FAR;
    const lista = planOrdersWiele(
      'daleko',
      plan({
        vis: [[0, 5]],
        jest: maDom,
        zapas: 3,
      }),
    );
    // dom ma wszystkie dalekie, więc tło idzie od pierwszego kwadratu (q = 1), tylko trzy kawałki
    expect(lista).toEqual([zam(1, 0, LOD_FAR), zam(1, 1, LOD_FAR), zam(1, 2, LOD_FAR)]);
  });

  it('zapas zero: tylko widoczne kawałki bez tekstury', () => {
    const lista = planOrdersWiele('daleko', plan({ vis: [[2, 7]], zapas: 0 }));
    expect(lista).toEqual([zam(2, 7, LOD_FAR)]);
  });

  it('z bliska: dalekie zastępstwo, potem bliskie i przekroje dla widocznych, tło dalekie w budżecie, numery kwadratów', () => {
    const cut = (q: number, k: number) => q === 1 && k === 4;
    const lista = planOrdersWiele(
      'blisko',
      plan({
        vis: [
          [0, 10],
          [1, 4],
        ],
        cut,
        zapas: 2,
      }),
    );
    expect(lista).toEqual([
      zam(0, 10, LOD_FAR),
      zam(1, 4, LOD_FAR),
      zam(0, 10, LOD_NEAR),
      { k: 4, s: LOD_NEAR, v: 0, cut: true, q: 1 },
      zam(0, 0, LOD_FAR),
      zam(0, 1, LOD_FAR),
    ]);
  });

  it('przy dużym oddaleniu zamawia tylko poziom „bardzo daleko”: ani bliskich, ani dalekich', () => {
    const vis: Array<[number, number]> = [];
    for (let q = 0; q < 9; q++) for (let k = 0; k < 144; k += 4) vis.push([q, k]);
    const lista = planOrdersWiele('bardzo-daleko', plan({ vis, zapas: 500 }));
    expect(lista.length).toBeGreaterThan(vis.length);
    expect(lista.every((o) => o.s === LOD_VERY_FAR && !o.cut)).toBe(true);
    // widoczne bez żadnej tekstury idą pierwsze, w kolejności widoczności
    expect(lista.slice(0, vis.length).map((o) => [o.q ?? 0, o.k])).toEqual(vis);
  });

  it('bardzo daleko: widoczny kawałek z daleką teksturą jej nie wymaga, ale dostaje swoją bardzo daleką z tła', () => {
    const maFar = (_q: number, _k: number, s: number) => s === LOD_FAR;
    const lista = planOrdersWiele('bardzo-daleko', plan({ vis: [[0, 5]], jest: maFar, zapas: 5 }));
    // widoczny (0, 5) ma daleką, więc nie jest pilny, ale wchodzi do tła pierwszy w kolejności tła (kawałek 0 domu pierwszy)
    expect(lista.map((o) => [o.q ?? 0, o.k, o.s])).toEqual([
      [0, 0, LOD_VERY_FAR],
      [0, 1, LOD_VERY_FAR],
      [0, 2, LOD_VERY_FAR],
      [0, 3, LOD_VERY_FAR],
      [0, 4, LOD_VERY_FAR],
    ]);
  });

  it('przy oddaleniu nie ma zamówień bliskich nawet dla widocznych z przekrojem', () => {
    const lista = planOrdersWiele(
      'daleko',
      plan({
        vis: [
          [0, 1],
          [1, 2],
        ],
        cut: () => true,
        zapas: 10,
      }),
    );
    expect(lista.some((o) => o.s === LOD_NEAR || o.cut)).toBe(false);
  });
});

describe('pula workerów z kilkoma scenami', () => {
  it('zamówienia różnych kwadratów o tym samym kawałku to osobne zamówienia (klucz zawiera numer kwadratu)', () => {
    const { p, fakes } = pool(2);
    p.setScene(mala(1));
    p.dodajScene(1, mala(2));
    for (const f of fakes) f.ready();
    p.order([zam(0, 1), zam(1, 1)]);
    expect(fakes.flatMap((f) => f.draws())).toEqual([
      { k: 1, s: LOD_NEAR, q: 0 },
      { k: 1, s: LOD_NEAR, q: 1 },
    ]);
    // te same dwa zamówienia jeszcze raz: oba są już rysowane, więc nic nowego
    p.order([zam(0, 1), zam(1, 1)]);
    expect(fakes.flatMap((f) => f.draws()).length).toBe(2);
  });

  it('kawałek kwadratu 0 w trakcie rysowania nie blokuje tego samego kawałka kwadratu 1', () => {
    const { p, fakes } = pool(1);
    p.setScene(mala(1));
    p.dodajScene(1, mala(2));
    fakes[0].ready();
    p.order([zam(0, 1)]);
    p.order([zam(0, 1), zam(1, 1)]);
    fakes[0].finish();
    expect(fakes[0].draws()).toEqual([
      { k: 1, s: LOD_NEAR, q: 0 },
      { k: 1, s: LOD_NEAR, q: 1 },
    ]);
  });

  it('gotowy kawałek kwadratu wraca z numerem kwadratu, kawałek domu bez niego', () => {
    const { p, fakes } = pool(2);
    p.setScene(mala(1));
    p.dodajScene(3, mala(2));
    for (const f of fakes) f.ready();
    p.order([zam(3, 2, LOD_FAR, 4), zam(0, 2, LOD_FAR, 1)]);
    fakes[0].finish();
    fakes[1].finish();
    const gotowe = p.take();
    expect(gotowe.map((d) => [d.q, d.k, d.s, d.v])).toEqual([
      [3, 2, LOD_FAR, 4],
      [undefined, 2, LOD_FAR, 1],
    ]);
  });

  it('scenę kwadratu worker dostaje tuż przed pierwszym zamówieniem, raz; scena domu jak dotąd od razu', () => {
    const { p, fakes } = pool(2);
    p.setScene(mala(1));
    p.dodajScene(1, mala(2));
    for (const f of fakes) expect(f.rodzaje()).toEqual(['scene0']);
    for (const f of fakes) f.ready();
    p.order([zam(1, 1, LOD_FAR), zam(1, 2, LOD_FAR), zam(1, 3, LOD_FAR)]);
    expect(fakes[0].rodzaje()).toEqual(['scene0', 'scene1', 'draw']);
    expect(fakes[1].rodzaje()).toEqual(['scene0', 'scene1', 'draw']);
    fakes[0].finish();
    expect(fakes[0].rodzaje()).toEqual(['scene0', 'scene1', 'draw', 'draw']);
  });

  it('łatka kwadratu idzie tylko do workerów, które mają jego scenę, łatka domu do wszystkich z domem', () => {
    const { p, fakes } = pool(2);
    p.setScene(mala(1));
    p.dodajScene(1, mala(2));
    for (const f of fakes) f.ready();
    // tylko pierwszy worker dostaje zamówienie z kwadratu 1, więc tylko on ma jego scenę
    p.order([zam(1, 0, LOD_FAR)]);
    p.patch({ q: 1, tiles: [], terr: [], felled: [] });
    p.patch({ tiles: [], terr: [], felled: [] });
    expect(fakes[0].rodzaje()).toEqual(['scene0', 'scene1', 'draw', 'patch', 'patch']);
    expect(fakes[1].rodzaje()).toEqual(['scene0', 'patch']);
  });

  it(`worker trzyma najwyżej ${MAX_SCEN_WORKERA} scen: najdawniej użyta wypada (drop) i wraca przy następnym zamówieniu`, () => {
    expect(MAX_SCEN_WORKERA).toBeGreaterThanOrEqual(9);
    const { p, fakes } = pool(1);
    const f = fakes[0];
    p.setScene(mala(1));
    for (let q = 1; q <= MAX_SCEN_WORKERA + 1; q++) p.dodajScene(q, mala(q + 1));
    f.ready();
    const zamow = (q: number) => {
      p.order([zam(q, 0, LOD_FAR)]);
      f.finish();
    };
    for (let q = 1; q < MAX_SCEN_WORKERA; q++) zamow(q);
    // dom i kwadraty 1..(MAX − 1): MAX scen, nic nie wypadło
    expect(f.rodzaje().filter((r) => r.startsWith('drop'))).toEqual([]);
    zamow(MAX_SCEN_WORKERA);
    // dom (najdawniej użyty) wypada, kiedy dochodzi kolejna scena
    expect(f.rodzaje().filter((r) => r.startsWith('drop'))).toEqual(['drop0']);
    // dom wraca przy następnym zamówieniu z domu i wypiera kwadrat 1
    p.order([zam(0, 5, LOD_FAR)]);
    expect(f.rodzaje().slice(-3)).toEqual(['scene0', 'drop1', 'draw']);
  });

  it('nowa scena domu zapomina kwadraty: zamówienie z nieznanego kwadratu jest pomijane, a po dodajScene wraca', () => {
    const { p, fakes } = pool(1);
    p.setScene(mala(1));
    p.dodajScene(1, mala(2));
    fakes[0].ready();
    p.setScene(mala(3));
    p.order([zam(1, 0, LOD_FAR), zam(0, 0, LOD_FAR)]);
    expect(fakes[0].draws()).toEqual([{ k: 0, s: LOD_FAR, q: 0 }]);
    p.dodajScene(1, mala(4));
    fakes[0].finish();
    p.order([zam(1, 0, LOD_FAR)]);
    expect(fakes[0].draws().at(-1)).toEqual({ k: 0, s: LOD_FAR, q: 1 });
  });

  it('kawałek z poprzedniej sceny domu (inna generacja) jest odrzucany także dla kwadratu', () => {
    const { p, fakes } = pool(1);
    p.setScene(mala(1));
    p.dodajScene(1, mala(2));
    fakes[0].ready();
    p.order([zam(1, 0, LOD_FAR)]);
    p.setScene(mala(3));
    const bmp = fakes[0].finish();
    expect(bmp.closed).toBe(true);
    expect(p.take()).toEqual([]);
  });
});

describe('szew po dodaniu sąsiada przerysowuje tylko kawałki przy wspólnej krawędzi', () => {
  const kawalki = (n: number, s: Strona) => kawalkiSzwu(n, s).sort((a, b) => a - b);
  it('dodanie sąsiada na wschodzie: 12 kawałków kolumny cx = 11 domu, a sąsiad dostaje kolumnę cx = 0', () => {
    expect(kawalki(12, 'e')).toEqual(Array.from({ length: 12 }, (_, cy) => cy * 12 + 11));
    expect(kawalki(12, 'w')).toEqual(Array.from({ length: 12 }, (_, cy) => cy * 12));
  });
  it('narożnik to jeden kawałek', () => {
    for (const s of ['ne', 'se', 'sw', 'nw'] as const) expect(kawalki(12, s)).toHaveLength(1);
  });
});
