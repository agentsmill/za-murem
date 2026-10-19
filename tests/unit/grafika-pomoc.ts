/* Wspólne pomoce testów grafiki z PixelLab: grafika z public/assets jak w grze (obrazki dekoduje Node) i atrapa płótna
   dla drawChunk. */

import fs from 'node:fs';
import path from 'node:path';
import type { AnyCanvas } from '../../src/render/art/canvas.ts';
import { type Grafika, grafikaZ, type OpisGrafiki } from '../../src/render/art/pixellab.ts';
import { decodePng } from '../../tools/png.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** grafika z public/assets jak w grze, tylko obrazki dekoduje Node */
export function grafikaZPlikow(): Grafika {
  const dir = path.join(ROOT, 'public/assets');
  const opis = JSON.parse(fs.readFileSync(path.join(dir, 'grafika.json'), 'utf8')) as OpisGrafiki;
  const g = grafikaZ(opis, (plik) => {
    const d = decodePng(fs.readFileSync(path.join(dir, plik)));
    return { w: d.width, h: d.height, px: new Uint32Array(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length / 4) };
  });
  if (!g) throw new Error('grafika z public/assets się nie wczytała');
  return g;
}

/** atrapa płótna dla drawChunk: zapamiętuje tylko obraz z putImageData (teren, fasady, dachy i ozdoby piksel po pikselu),
    a detale rysowane ścieżkami pomija */
export function atrapaPlotna(): { canvas: AnyCanvas; px: () => Uint32Array } {
  let img: Uint32Array = new Uint32Array(0);
  const nic = () => {};
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (d: { data: Uint8ClampedArray }) => {
      img = new Uint32Array(d.data.buffer.slice(0));
    },
    save: nic,
    restore: nic,
    scale: nic,
    translate: nic,
    fillRect: nic,
    beginPath: nic,
    moveTo: nic,
    ellipse: nic,
    fill: nic,
    drawImage: nic,
    fillStyle: '',
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as AnyCanvas;
  return { canvas, px: () => img };
}
