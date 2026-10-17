import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScene, chunkSceneOf, type Scene } from '../../src/render/art/scene.ts';
import {
  applyScenePatch,
  chunksByDistance,
  chunksTouched,
  type FromWorker,
  LOD_FAR,
  LOD_NEAR,
  type Order,
  planOrders,
  poolSize,
  scenePatchOf,
  type ToWorker,
  type WorkerLike,
  WorkerPainter,
} from '../../src/render/chunks.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

let scene: Scene | null = null;
/** prawdziwa scena Przymorza (raz na plik) */
function przymorze(): Scene {
  if (!scene) {
    const a = ADDRESSES[0];
    scene = buildScene(buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 }));
  }
  return scene;
}

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
  terminated = false;
  postMessage(m: ToWorker): void {
    this.sent.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(m: FromWorker): void {
    this.onmessage?.({ data: m } as MessageEvent);
  }
  draws(): Order[] {
    return this.sent.flatMap((m) => (m.t === 'draw' ? [{ k: m.k, s: m.s, v: m.v }] : []));
  }
  /** oddaje ostatnie zamówienie jako gotowe */
  finish(): Bitmap {
    const d = this.sent.findLast((m) => m.t === 'draw');
    if (d?.t !== 'draw') throw new Error('worker nic nie rysuje');
    const bmp = bitmap();
    this.reply({ t: 'done', gen: d.gen, k: d.k, s: d.s, v: d.v, bmp, ms: 1 });
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

const near = (k: number, v = 0): Order => ({ k, s: LOD_NEAR, v });
const far = (k: number, v = 0): Order => ({ k, s: LOD_FAR, v });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dane sceny dla workera', () => {
  it('przechodzą przez structuredClone (jak postMessage) bez zmian', () => {
    const sc = przymorze();
    const cs = chunkSceneOf(sc);
    const copy = structuredClone(cs);
    expect(copy.w.terr).toEqual(sc.w.terr);
    expect(copy.w.bid).toEqual(sc.w.bid);
    expect(copy.shadow).toEqual(sc.shadow);
    expect(copy.south).toEqual(sc.south);
    expect(copy.run).toEqual(sc.run);
    expect(copy.styles).toEqual(sc.styles);
    expect(copy.doors).toEqual(sc.doors);
    expect(copy.treesBy).toEqual(sc.treesBy);
    expect(copy.chunks).toBe(sc.chunks);
  });

  it('niosą tylko to, czego potrzebuje rysowanie (bez siatek symulacji, nazw i tagów)', () => {
    const cs = chunkSceneOf(przymorze());
    expect(Object.keys(cs.w).sort()).toEqual(['bid', 'buildings', 'size', 'terr', 'trees']);
    expect(Object.keys(cs.w.buildings[0]).sort()).toEqual(['cls', 'entrances', 'id', 'x0', 'x1', 'y0', 'y1']);
  });
});

describe('kolejność zamówień', () => {
  it('od środka ekranu, przy równej odległości wierszami', () => {
    // 3×3 kawałki wokół (1, 1) na mapie 12×12
    expect(chunksByDistance(12, 0, 0, 2, 2, 1, 1)).toEqual([13, 1, 12, 14, 25, 0, 2, 24, 26]);
  });

  it('z bliska: najpierw szybkie dalekie dla widocznych, potem bliskie, na końcu reszta dalekich', () => {
    const vis = [5, 4, 6];
    const list = planOrders(vis, 9, () => false, true);
    expect(list).toEqual([
      far(5),
      far(4),
      far(6),
      near(5),
      near(4),
      near(6),
      far(0),
      far(1),
      far(2),
      far(3),
      far(7),
      far(8),
    ]);
  });

  it('z bliska, gdy dalekie już są: tylko brakujące bliskie widoczne', () => {
    const has = (k: number, s: number) => s === LOD_FAR || k === 4;
    expect(planOrders([5, 4, 6], 9, has, true)).toEqual([near(5), near(6)]);
  });

  it('z daleka: bez bliskich, widoczne pierwsze', () => {
    expect(planOrders([2, 1], 4, () => false, false)).toEqual([far(2), far(1), far(0), far(3)]);
  });

  it('nic nie brakuje: pusta lista', () => {
    expect(planOrders([0, 1], 4, () => true, true)).toEqual([]);
  });
});

describe('pula workerów', () => {
  it('scenę wysyła raz każdemu workerowi', () => {
    const { p, fakes } = pool(2);
    p.setScene(przymorze());
    for (const f of fakes) expect(f.sent.map((m) => m.t)).toEqual(['scene']);
  });

  it('czeka na gotowość workera, potem rysuje kilka naraz, po jednym na worker', () => {
    const { p, fakes } = pool(2);
    p.setScene(przymorze());
    p.order([near(1), near(2), near(3)]);
    expect(fakes[0].draws()).toEqual([]);
    fakes[0].reply({ t: 'ready', ok: true });
    fakes[1].reply({ t: 'ready', ok: true });
    expect(fakes[0].draws()).toEqual([near(1)]);
    expect(fakes[1].draws()).toEqual([near(2)]);
  });

  it('kawałek, który wyszedł z ekranu, nie trafia do workera, a gotowy wraca w take()', () => {
    const { p, fakes } = pool(2);
    p.setScene(przymorze());
    for (const f of fakes) f.reply({ t: 'ready', ok: true });
    p.order([near(1), near(2), near(3)]);
    // kamera pojechała: 3 już niepotrzebny, za to 4
    p.order([near(4)]);
    const bmp = fakes[0].finish();
    expect(fakes[0].draws()).toEqual([near(1), near(4)]);
    expect(fakes.flatMap((f) => f.draws())).not.toContainEqual(near(3));
    expect(p.take()).toEqual([{ ...near(1), src: bmp }]);
    expect(p.take()).toEqual([]);
  });

  it('nie zamawia drugi raz kawałka, który worker właśnie rysuje', () => {
    const { p, fakes } = pool(2);
    p.setScene(przymorze());
    for (const f of fakes) f.reply({ t: 'ready', ok: true });
    p.order([near(1), near(2)]);
    p.order([near(2), near(1), far(7)]);
    fakes[1].finish();
    expect(fakes[1].draws()).toEqual([near(2), far(7)]);
    expect(fakes[0].draws()).toEqual([near(1)]);
  });

  it('kawałek poprzedniej sceny jest odrzucany, a jego ImageBitmap zamknięty', () => {
    const { p, fakes } = pool(1);
    p.setScene(przymorze());
    fakes[0].reply({ t: 'ready', ok: true });
    p.order([near(1)]);
    p.setScene(przymorze());
    const bmp = fakes[0].finish();
    expect(bmp.closed).toBe(true);
    expect(p.take()).toEqual([]);
  });

  it('worker bez OffscreenCanvas 2D: pula się poddaje i zamyka workery', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { p, fakes } = pool(2);
    p.setScene(przymorze());
    fakes[1].reply({ t: 'ready', ok: false });
    expect(p.failed).toBe(true);
    expect(fakes.every((f) => f.terminated)).toBe(true);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('błąd ładowania workera albo rysowania też przełącza na główny wątek', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = pool(1);
    a.fakes[0].onerror?.({ message: 'nie ma pliku', preventDefault() {} } as unknown as ErrorEvent);
    expect(a.p.failed).toBe(true);
    const b = pool(1);
    b.p.setScene(przymorze());
    b.fakes[0].reply({ t: 'ready', ok: true });
    b.p.order([near(1)]);
    b.fakes[0].reply({ t: 'fail', err: 'brak pamięci' });
    expect(b.p.failed).toBe(true);
  });

  it('wielkość puli: rdzeń dla gry, najwyżej trzy, na telefonie dwa', () => {
    expect(poolSize(10, false)).toBe(3);
    expect(poolSize(3, false)).toBe(2);
    expect(poolSize(1, false)).toBe(1);
    expect(poolSize(8, true)).toBe(2);
  });
});

describe('przerysowanie po zmianie na mapie', () => {
  it('kafelek w środku kawałka dotyka tylko jego, kafelek w narożniku czterech', () => {
    const sc = przymorze();
    const n = sc.chunks;
    const size = sc.w.size;
    // kawałek (3, 2), kafelek (3·32 + 10, 2·32 + 10)
    expect(chunksTouched(sc, { tiles: [(2 * 32 + 10) * size + 3 * 32 + 10] })).toEqual([2 * n + 3]);
    // kafelek (64, 64) leży w kawałku (2, 2), ale jego sąsiedzi także w (1, 1), (2, 1) i (1, 2)
    expect(chunksTouched(sc, { tiles: [64 * size + 64] })).toEqual([n + 1, n + 2, 2 * n + 1, 2 * n + 2]);
  });

  it('ścięte drzewo dotyka dokładnie tych kawałków, w których się rysuje', () => {
    const sc = przymorze();
    for (const t of [0, 7, 99, sc.w.trees.length - 1]) {
      const drawnIn = sc.treesBy.flatMap((list, k) => (list.includes(t) ? [k] : []));
      expect(chunksTouched(sc, { felled: [t] })).toEqual(drawnIn);
    }
  });

  it('łatka przenosi nowy teren i ścięte drzewa do kopii sceny w workerze', () => {
    const sc = przymorze();
    const copy = structuredClone(chunkSceneOf(sc));
    const i = 100 * sc.w.size + 120;
    const was = sc.w.terr[i];
    sc.w.terr[i] = was === 5 ? 0 : 5;
    applyScenePatch(copy, scenePatchOf(sc, { tiles: [i], felled: [3] }));
    expect(copy.w.terr[i]).toBe(sc.w.terr[i]);
    expect(copy.treeGone[3]).toBe(1);
    expect(copy.w.terr).toEqual(sc.w.terr);
    sc.w.terr[i] = was;
  });

  it('po zmianie zamawiany jest tylko dotknięty kawałek, w nowej wersji', () => {
    const vis = [5, 4, 6];
    const dirty = new Set([4]);
    const ver = (k: number) => (k === 4 ? 1 : 0);
    const list = planOrders(vis, 9, (k) => !dirty.has(k), true, ver);
    expect(list).toEqual([far(4, 1), near(4, 1)]);
  });

  it('łatka idzie do każdego workera przed następnymi zamówieniami, wersja wraca z wynikiem', () => {
    const { p, fakes } = pool(2);
    p.setScene(przymorze());
    for (const f of fakes) f.reply({ t: 'ready', ok: true });
    p.patch({ tiles: [5], terr: [3], felled: [] });
    p.order([near(1, 2), near(2, 7)]);
    for (const f of fakes) expect(f.sent.map((m) => m.t)).toEqual(['scene', 'patch', 'draw']);
    fakes[0].finish();
    expect(p.take()).toEqual([expect.objectContaining({ k: 1, s: LOD_NEAR, v: 2 })]);
  });
});
