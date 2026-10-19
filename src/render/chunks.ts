/* Zamówienia kawałków mapy. Widok co klatkę układa listę brakujących kawałków od środka ekranu,
   a malarz je rysuje: pula workerów z OffscreenCanvas (kilka kawałków naraz, poza głównym wątkiem)
   albo, gdy przeglądarka tego nie umie, główny wątek w limicie czasu na klatkę, jak dawniej.
   Zamówienie, które jeszcze nie trafiło do workera, a zniknęło z nowej listy (kawałek wyszedł
   z ekranu), przepada. Zmiana na mapie (ścięte drzewo, inny teren) idzie do workerów jako łatka
   sceny, a dotknięte kawałki dostają nową wersję: kawałek narysowany ze starych danych przepada.
   Otwarty sąsiedni budynek (M2 fala 2) to też łatka: jego wnętrze dokłada się do przekroju
   (dolozCzesc z section.ts), a wygląd drzwi sąsiadów (wyważone, zabite) idzie razem z nim.
   Moduł nie zależy od PixiJS, więc da się go sprawdzić w Node. */

import { drawChunk } from './art/chunkArt.ts';
import { CHUNK, type ChunkScene, chunkSceneOf, type Scene, treeChunks } from './art/scene.ts';
import { type DoorLook, dolozCzesc, type SectionPart, type SectionScene, ustawDrzwi } from './section.ts';

/** pikseli grafiki na kafelek: z bliska i z daleka */
export const LOD_NEAR = 32;
export const LOD_FAR = 8;

/** zamówienie: kawałek k (cy*n + cx) w skali s, w wersji v (rośnie po każdej zmianie na mapie) */
export interface Order {
  k: number;
  s: number;
  v: number;
  /** przekrój: wnętrze zamiast dachu (tylko z bliska) */
  cut?: boolean;
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
 * 2. z bliska: widoczne kawałki bez bliskiej tekstury, a gdzie trzeba przekroju (cutOf), bez
 *    przekroju (dach z bliska wystarczy do tego czasu jako zaślepka),
 * 3. reszta dalekich w tle, żeby oddalenie było od razu gotowe.
 */
export function planOrders(
  vis: readonly number[],
  total: number,
  has: (k: number, s: number, cut?: boolean) => boolean,
  near: boolean,
  ver: (k: number) => number = () => 0,
  cutOf: (k: number) => boolean = () => false,
): Order[] {
  const out: Order[] = [];
  const queued = new Uint8Array(total);
  for (const k of vis)
    if (!has(k, LOD_FAR) && !(near && (has(k, LOD_NEAR) || (cutOf(k) && has(k, LOD_NEAR, true))))) {
      out.push({ k, s: LOD_FAR, v: ver(k) });
      queued[k] = 1;
    }
  if (near)
    for (const k of vis) {
      if (cutOf(k)) {
        if (!has(k, LOD_NEAR, true)) out.push({ k, s: LOD_NEAR, v: ver(k), cut: true });
      } else if (!has(k, LOD_NEAR)) out.push({ k, s: LOD_NEAR, v: ver(k) });
    }
  for (let k = 0; k < total; k++) if (!queued[k] && !has(k, LOD_FAR)) out.push({ k, s: LOD_FAR, v: ver(k) });
  return out;
}

/** zmiana na mapie, po której trzeba przerysować kawałki */
export interface MapChange {
  /** kafelki ze zmienionym terenem (w.terr już zmienione); przerysują się też sąsiedzi */
  tiles?: readonly number[];
  /** drzewa, które zniknęły, np. ścięte (numery w w.trees) */
  felled?: readonly number[];
  /** naprawione uszkodzenia w przekroju (kafelki z section.damage) */
  fixed?: readonly number[];
  /** M2 fala 2: wnętrza otwartych sąsiednich budynków do dołożenia do przekroju */
  wnetrze?: readonly SectionPart[];
  /** wygląd drzwi sąsiadów (wyważone, zabite deskami, zwykłe) */
  drzwi?: readonly DoorLook[];
  /** widok pięter: piętro, które rysuje przekrój (0: parter), i scena typowego piętra (podaje się raz, potem
      wystarczy samo piętro). chunksTouched tego nie zna, więc samo GameView.redraw nic by nie unieważniło:
      piętro zmienia się przez GameView.ustawPietro, które zwiększa wersje kawałków z przekrojem. */
  pietro?: number;
  pietra?: SectionScene;
}

/**
 * Kawałki do przerysowania po zmianie, rosnąco: kafelek z ośmioma sąsiadami (krawędzie terenu
 * i ścian zależą od sąsiadów, także za granicą kawałka), drzewo ze wszystkimi kawałkami,
 * w których rysuje się jego korona albo cień, i cały prostokąt dołożonego wnętrza z zapasem kafelka.
 */
export function chunksTouched(sc: ChunkScene, ch: MapChange): number[] {
  const size = sc.w.size;
  const n = sc.chunks;
  const set = new Set<number>();
  for (const p of ch.wnetrze ?? [])
    for (
      let cy = Math.floor(Math.max(0, p.y0 - 1) / CHUNK);
      cy <= Math.floor(Math.min(size - 1, p.y0 + p.h) / CHUNK);
      cy++
    )
      for (
        let cx = Math.floor(Math.max(0, p.x0 - 1) / CHUNK);
        cx <= Math.floor(Math.min(size - 1, p.x0 + p.w) / CHUNK);
        cx++
      )
        set.add(cy * n + cx);
  for (const i of [...(ch.tiles ?? []), ...(ch.fixed ?? []), ...(ch.drzwi ?? []).map((d) => d.tile)]) {
    const x = i % size;
    const y = (i - x) / size;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        set.add(Math.floor(yy / CHUNK) * n + Math.floor(xx / CHUNK));
      }
  }
  for (const k of ch.felled ?? []) for (const c of treeChunks(sc.w.trees[k], n)) set.add(c);
  return [...set].sort((a, b) => a - b);
}

/** łatka sceny dla workerów: nowe wartości zmienionych kafelków i ścięte drzewa */
export interface ScenePatch {
  tiles: number[];
  terr: number[];
  felled: number[];
  /** naprawione uszkodzenia (kafelki), znikają z section.damage */
  fixed?: number[];
  /** wnętrza sąsiadów i wygląd ich drzwi (M2 fala 2) */
  wnetrze?: SectionPart[];
  drzwi?: DoorLook[];
  /** widok pięter: nowe piętro i scena typowego piętra (tylko gdy zmiana je podała) */
  pietro?: number;
  pietra?: SectionScene;
}

export function scenePatchOf(sc: ChunkScene, ch: MapChange): ScenePatch {
  const tiles = [...(ch.tiles ?? [])];
  return {
    tiles,
    terr: tiles.map((i) => sc.w.terr[i]),
    felled: [...(ch.felled ?? [])],
    fixed: [...(ch.fixed ?? [])],
    ...(ch.wnetrze?.length ? { wnetrze: [...ch.wnetrze] } : {}),
    ...(ch.drzwi?.length ? { drzwi: [...ch.drzwi] } : {}),
    ...(ch.pietro !== undefined ? { pietro: ch.pietro } : {}),
    ...(ch.pietra ? { pietra: ch.pietra } : {}),
  };
}

/** nakłada łatkę na kopię sceny w workerze */
export function applyScenePatch(sc: ChunkScene, p: ScenePatch): void {
  p.tiles.forEach((i, k) => {
    sc.w.terr[i] = p.terr[k];
  });
  for (const k of p.felled) sc.treeGone[k] = 1;
  for (const i of p.fixed ?? []) sc.section?.damage?.delete(i);
  if (sc.section) {
    for (const part of p.wnetrze ?? []) dolozCzesc(sc.section, part, sc.w.size);
    for (const d of p.drzwi ?? []) ustawDrzwi(sc.section, d);
  }
  if (p.pietro !== undefined) sc.pietro = p.pietro;
  if (p.pietra) sc.pietra = p.pietra;
}

export interface ChunkPainter {
  /** gdzie się rysuje (do pomiarów) */
  readonly kind: string;
  /** rysowanie poza głównym wątkiem padło: trzeba przejść na główny wątek */
  readonly failed: boolean;
  setScene(sc: Scene): void;
  /** nowa lista zamówień zastępuje poprzednią; budżet (ms) dotyczy rysowania w głównym wątku */
  order(list: readonly Order[], budgetMs: number): void;
  /** zmiana na mapie: kopie sceny poza głównym wątkiem dostają łatkę przed następnymi zamówieniami */
  patch(p: ScenePatch): void;
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
      drawChunk(sc, o.k % sc.chunks, (o.k / sc.chunks) | 0, o.s, c, o.cut);
      this.done.push({ k: o.k, s: o.s, v: o.v, cut: o.cut, src: c });
    }
  }

  /** główny wątek rysuje z tej samej sceny, którą zmienia gra, więc nie ma czego łatać */
  patch(): void {}

  take(): Done[] {
    const d = this.done;
    this.done = [];
    return d;
  }

  destroy(): void {}
}

/** wiadomości do workera */
export type ToWorker =
  | { t: 'scene'; gen: number; sc: ChunkScene }
  | { t: 'draw'; gen: number; k: number; s: number; v: number; cut?: boolean }
  | { t: 'patch'; gen: number; p: ScenePatch };

/** wiadomości od workera */
export type FromWorker =
  | { t: 'ready'; ok: boolean }
  | { t: 'done'; gen: number; k: number; s: number; v: number; cut?: boolean; bmp: ImageBitmap; ms: number }
  | { t: 'fail'; err: string };

/** to, czego pula potrzebuje od workera (w testach podróbka) */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: ToWorker, opts?: StructuredSerializeOptions): void;
  terminate(): void;
}

const key = (k: number, s: number, cut?: boolean) => (k * 64 + s) * 2 + (cut ? 1 : 0);

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
    this.queue = list.filter((o) => !this.busy.has(key(o.k, o.s, o.cut)));
    this.pump();
  }

  take(): Done[] {
    const d = this.done;
    this.done = [];
    return d;
  }

  patch(p: ScenePatch): void {
    if (this.failed) return;
    for (const h of this.hands) h.w.postMessage({ t: 'patch', gen: this.gen, p });
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
      h.job = key(o.k, o.s, o.cut);
      this.busy.add(h.job);
      h.w.postMessage({ t: 'draw', gen: this.gen, k: o.k, s: o.s, v: o.v, cut: o.cut });
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
        this.busy.delete(key(m.k, m.s, m.cut));
        this.done.push({ k: m.k, s: m.s, v: m.v, cut: m.cut, src: m.bmp });
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
