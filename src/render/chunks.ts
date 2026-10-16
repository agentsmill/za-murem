/* Zamówienia kawałków mapy. Widok co klatkę układa listę brakujących kawałków od środka ekranu,
   a malarz je rysuje: pula workerów z OffscreenCanvas (kilka kawałków naraz, poza głównym wątkiem)
   albo, gdy przeglądarka tego nie umie, główny wątek w limicie czasu na klatkę, jak dawniej.
   Zamówienie, które jeszcze nie trafiło do workera, a zniknęło z nowej listy (kawałek wyszedł
   z ekranu), przepada. Moduł nie zależy od PixiJS, więc da się go sprawdzić w Node. */

import { drawChunk } from './art/chunkArt.ts';
import { type ChunkScene, chunkSceneOf, type Scene } from './art/scene.ts';

/** pikseli grafiki na kafelek: z bliska i z daleka */
export const LOD_NEAR = 32;
export const LOD_FAR = 8;

/** zamówienie: kawałek k (cy*n + cx) w skali s */
export interface Order {
  k: number;
  s: number;
}

/** gotowy kawałek: płótno z głównego wątku albo ImageBitmap z workera */
export interface Done extends Order {
  src: HTMLCanvasElement | ImageBitmap;
}

/** kawałki z prostokąta [cx0, cx1]×[cy0, cy1] (indeksy cy*n + cx), od najbliższego kawałkowi (ccx, ccy) */
export function chunksByDistance(
  n: number,
  cx0: number,
  cy0: number,
  cx1: number,
  cy1: number,
  ccx: number,
  ccy: number,
): number[] {
  const order: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push(cy * n + cx);
  const dist = (k: number) => Math.abs((k % n) - ccx) + Math.abs(((k / n) | 0) - ccy);
  return order.sort((a, b) => dist(a) - dist(b));
}

/**
 * Lista zamówień, najważniejsze pierwsze:
 * 1. widoczne kawałki bez żadnej pasującej tekstury dostają szybki daleki (16 razy mniej pikseli),
 *    żeby zamiast dziury od razu coś było widać,
 * 2. z bliska: widoczne kawałki bez bliskiej tekstury,
 * 3. reszta dalekich w tle, żeby oddalenie było od razu gotowe.
 */
export function planOrders(
  vis: readonly number[],
  total: number,
  has: (k: number, s: number) => boolean,
  near: boolean,
): Order[] {
  const out: Order[] = [];
  const queued = new Uint8Array(total);
  for (const k of vis)
    if (!has(k, LOD_FAR) && !(near && has(k, LOD_NEAR))) {
      out.push({ k, s: LOD_FAR });
      queued[k] = 1;
    }
  if (near) for (const k of vis) if (!has(k, LOD_NEAR)) out.push({ k, s: LOD_NEAR });
  for (let k = 0; k < total; k++) if (!queued[k] && !has(k, LOD_FAR)) out.push({ k, s: LOD_FAR });
  return out;
}

export interface ChunkPainter {
  /** gdzie się rysuje (do pomiarów) */
  readonly kind: string;
  /** rysowanie poza głównym wątkiem padło: trzeba przejść na główny wątek */
  readonly failed: boolean;
  setScene(sc: Scene): void;
  /** nowa lista zamówień zastępuje poprzednią; budżet (ms) dotyczy rysowania w głównym wątku */
  order(list: readonly Order[], budgetMs: number): void;
  /** gotowe kawałki od ostatniego wywołania */
  take(): Done[];
  destroy(): void;
}

/** rysowanie w głównym wątku w limicie czasu na klatkę (zapas, gdy nie ma OffscreenCanvas w workerze) */
export class InlinePainter implements ChunkPainter {
  readonly kind = 'główny wątek';
  readonly failed = false;
  private sc: Scene | null = null;
  private done: Done[] = [];

  setScene(sc: Scene): void {
    this.sc = sc;
    this.done = [];
  }

  order(list: readonly Order[], budgetMs: number): void {
    const sc = this.sc;
    if (!sc) return;
    const t0 = performance.now();
    for (const o of list) {
      if (performance.now() - t0 >= budgetMs) break;
      const c = document.createElement('canvas');
      drawChunk(sc, o.k % sc.chunks, (o.k / sc.chunks) | 0, o.s, c);
      this.done.push({ k: o.k, s: o.s, src: c });
    }
  }

  take(): Done[] {
    const d = this.done;
    this.done = [];
    return d;
  }

  destroy(): void {}
}

/** wiadomości do workera */
export type ToWorker = { t: 'scene'; gen: number; sc: ChunkScene } | { t: 'draw'; gen: number; k: number; s: number };

/** wiadomości od workera */
export type FromWorker =
  | { t: 'ready'; ok: boolean }
  | { t: 'done'; gen: number; k: number; s: number; bmp: ImageBitmap; ms: number }
  | { t: 'fail'; err: string };

/** to, czego pula potrzebuje od workera (w testach podróbka) */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: ToWorker, opts?: StructuredSerializeOptions): void;
  terminate(): void;
}

const key = (k: number, s: number) => k * 64 + s;

interface Hand {
  w: WorkerLike;
  ready: boolean;
  /** klucz rysowanego zamówienia albo −1 */
  job: number;
}

/**
 * Pula workerów. Każdy dostaje scenę raz, potem po jednym zamówieniu naraz: następne zaraz po
 * oddaniu poprzedniego, zawsze najważniejsze z najświeższej listy. Dzięki temu anulowanie jest
 * proste: czego nie ma na nowej liście, nie pójdzie do workera. Kawałek, który worker już rysuje,
 * dochodzi do końca i trafia do pamięci (limit bliskich i tak go wyrzuci pierwszego).
 */
export class WorkerPainter implements ChunkPainter {
  readonly kind: string;
  failed = false;
  /** milisekundy rysowania w workerach (suma, do pomiarów) */
  workMs = 0;
  private hands: Hand[] = [];
  private queue: Order[] = [];
  private busy = new Set<number>();
  private done: Done[] = [];
  private gen = 0;

  constructor(spawn: () => WorkerLike, count: number) {
    this.kind = `worker ×${count}`;
    try {
      for (let i = 0; i < count; i++) {
        const h: Hand = { w: spawn(), ready: false, job: -1 };
        h.w.onmessage = (e) => this.onMessage(h, e.data as FromWorker);
        h.w.onerror = (e) => {
          e.preventDefault();
          this.fail(e.message || 'nie dało się uruchomić workera');
        };
        this.hands.push(h);
      }
    } catch (err) {
      this.fail(String(err));
    }
  }

  setScene(sc: Scene): void {
    if (this.failed) return;
    this.gen++;
    this.queue = [];
    this.busy.clear();
    for (const d of this.done) (d.src as ImageBitmap).close();
    this.done = [];
    // każdy worker dostaje własną kopię: tablice terenu i budynków są potrzebne też symulacji
    const msg: ToWorker = { t: 'scene', gen: this.gen, sc: chunkSceneOf(sc) };
    try {
      for (const h of this.hands) h.w.postMessage(msg);
    } catch (err) {
      this.fail(String(err));
    }
  }

  order(list: readonly Order[]): void {
    this.queue = list.filter((o) => !this.busy.has(key(o.k, o.s)));
    this.pump();
  }

  take(): Done[] {
    const d = this.done;
    this.done = [];
    return d;
  }

  destroy(): void {
    for (const h of this.hands) h.w.terminate();
    this.hands = [];
  }

  /** wolne workery dostają najważniejsze zamówienia z kolejki */
  private pump(): void {
    for (const h of this.hands) {
      if (!h.ready || h.job >= 0) continue;
      const o = this.queue.shift();
      if (!o) return;
      h.job = key(o.k, o.s);
      this.busy.add(h.job);
      h.w.postMessage({ t: 'draw', gen: this.gen, k: o.k, s: o.s });
    }
  }

  private onMessage(h: Hand, m: FromWorker): void {
    if (m.t === 'fail') {
      this.fail(m.err);
      return;
    }
    if (m.t === 'ready') {
      if (!m.ok) {
        this.fail('w workerze nie ma OffscreenCanvas z kontekstem 2D');
        return;
      }
      h.ready = true;
    } else {
      h.job = -1;
      if (m.gen === this.gen) {
        this.busy.delete(key(m.k, m.s));
        this.done.push({ k: m.k, s: m.s, src: m.bmp });
        this.workMs += m.ms;
      } else m.bmp.close(); // kawałek poprzedniej sceny
    }
    this.pump();
  }

  private fail(why: string): void {
    if (this.failed) return;
    this.failed = true;
    console.warn(`Kawałki mapy rysuje główny wątek, bo worker nie działa: ${why}`);
    this.destroy();
  }
}

/** czy przeglądarka w ogóle ma to, czego potrzebuje rysowanie w workerze */
export function workersAvailable(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  );
}

/** ile workerów: jeden rdzeń zostaje dla gry, na telefonie najwyżej dwa (każdy trzyma kopię sceny) */
export function poolSize(cores: number, phone: boolean): number {
  return Math.max(1, Math.min(phone ? 2 : 3, cores - 1));
}

export const spawnChunkWorker = (): WorkerLike =>
  new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module', name: 'kawałki mapy' });
