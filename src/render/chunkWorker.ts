/* Worker rysujący kawałki mapy na OffscreenCanvas, poza głównym wątkiem. Scenę dostaje raz,
   potem zamówienia po jednym; gotowy kawałek odsyła jako ImageBitmap przekazany bez kopiowania.
   Na starcie sprawdza, czy ma OffscreenCanvas z kontekstem 2D; jeśli nie, gra rysuje po staremu. */

import { drawChunk } from './art/chunkArt.ts';
import { CHUNK, type ChunkScene } from './art/scene.ts';
import { applyScenePatch, type FromWorker, type ToWorker } from './chunks.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(m: FromWorker, opts?: StructuredSerializeOptions): void;
};

let sc: ChunkScene | null = null;
let gen = -1;

function canDraw(): boolean {
  try {
    return typeof OffscreenCanvas !== 'undefined' && new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {
    return false;
  }
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'scene') {
    sc = m.sc;
    gen = m.gen;
    return;
  }
  if (m.t === 'patch') {
    // łatka przychodzi przed zamówieniami, które mają ją już widzieć (wiadomości idą po kolei)
    if (sc && m.gen === gen) applyScenePatch(sc, m.p);
    return;
  }
  try {
    if (!sc || m.gen !== gen) throw new Error(`zamówienie do sceny ${m.gen}, a worker ma ${gen}`);
    const t0 = performance.now();
    const c = new OffscreenCanvas(CHUNK * m.s, CHUNK * m.s);
    drawChunk(sc, m.k % sc.chunks, (m.k / sc.chunks) | 0, m.s, c);
    const bmp = c.transferToImageBitmap();
    scope.postMessage({ t: 'done', gen, k: m.k, s: m.s, v: m.v, bmp, ms: performance.now() - t0 }, { transfer: [bmp] });
  } catch (err) {
    scope.postMessage({ t: 'fail', err: String(err) });
  }
};

scope.postMessage({ t: 'ready', ok: canDraw() });
