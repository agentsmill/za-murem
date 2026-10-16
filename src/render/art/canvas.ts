/* Płótno do grafiki rysowanej kodem: w oknie zwykły <canvas>, w workerze OffscreenCanvas.
   Ten sam kod rysowania działa w obu miejscach. */

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** nowe płótno w×h: w głównym wątku element <canvas>, w workerze (bez document) OffscreenCanvas */
export function newCanvas(w: number, h: number): AnyCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** kontekst 2D płótna dowolnego rodzaju */
export function ctx2d(c: AnyCanvas): Ctx2D {
  const ctx = 'transferToImageBitmap' in c ? c.getContext('2d') : c.getContext('2d');
  if (!ctx) throw new Error('płótno bez kontekstu 2D');
  return ctx;
}
