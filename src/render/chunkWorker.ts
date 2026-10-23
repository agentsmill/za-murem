/* Worker rysujący kawałki mapy na OffscreenCanvas, poza głównym wątkiem. Sceny dostaje od puli (chunks.ts): scenę domu
   przy starcie gry, sceny kwadratów obok domu przy pierwszym zamówieniu z nich, i może je zwolnić (`drop`), kiedy pula
   trzyma ich za dużo. Potem zamówienia po jednym; gotowy kawałek odsyła jako ImageBitmap przekazany bez kopiowania.
   Nowa scena domu (nowa generacja) kasuje wszystkie sceny. Na starcie sprawdza, czy ma OffscreenCanvas z kontekstem 2D;
   jeśli nie, gra rysuje po staremu. */

import { drawChunk } from './art/chunkArt.ts';
import { CHUNK, type ChunkScene } from './art/scene.ts';
import { applyScenePatch, type FromWorker, type ToWorker } from './chunks.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(m: FromWorker, opts?: StructuredSerializeOptions): void;
};

/** sceny worker: dom pod numerem 0, kwadraty obok pod swoimi numerami */
const sceny = new Map<number, ChunkScene>();
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
    // nowa generacja to nowa gra: poprzednie sceny (domu i kwadratów) przestają obowiązywać
    if (m.gen !== gen) sceny.clear();
    gen = m.gen;
    sceny.set(m.q ?? 0, m.sc);
    return;
  }
  if (m.t === 'drop') {
    if (m.gen === gen) sceny.delete(m.q);
    return;
  }
  if (m.t === 'patch') {
    // łatka przychodzi przed zamówieniami, które mają ją już widzieć (wiadomości idą po kolei)
    const sc = sceny.get(m.p.q ?? 0);
    if (sc && m.gen === gen) applyScenePatch(sc, m.p);
    return;
  }
  try {
    const sc = sceny.get(m.q ?? 0);
    if (!sc || m.gen !== gen) throw new Error(`zamówienie do sceny ${m.q ?? 0} generacji ${m.gen}, a worker ma ${gen}`);
    const t0 = performance.now();
    const c = new OffscreenCanvas(CHUNK * m.s, CHUNK * m.s);
    drawChunk(sc, m.k % sc.chunks, (m.k / sc.chunks) | 0, m.s, c, m.cut);
    const bmp = c.transferToImageBitmap();
    scope.postMessage(
      {
        t: 'done',
        gen,
        k: m.k,
        s: m.s,
        v: m.v,
        cut: m.cut,
        ...(m.q ? { q: m.q } : {}),
        bmp,
        ms: performance.now() - t0,
      },
      { transfer: [bmp] },
    );
  } catch (err) {
    scope.postMessage({ t: 'fail', err: String(err) });
  }
};

scope.postMessage({ t: 'ready', ok: canDraw() });
