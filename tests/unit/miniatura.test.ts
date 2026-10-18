/* Miniatury budowli w menu budowy: sprite z rzeczSprite (ten sam co na mapie) przycięty do pikseli i dopasowany
   do pudełka z zachowaniem proporcji. Czysta funkcja bez DOM; rysowanie na <canvas> sprawdzają zrzuty. */

import { describe, expect, it } from 'vitest';
import type { Sprite } from '../../src/render/art/bryly.ts';
import { BUILD_KINDS } from '../../src/render/art/budowle.ts';
import { rgba } from '../../src/render/art/palette.ts';
import { rzeczSprite } from '../../src/render/art/pixellab.ts';
import { thumbPixels } from '../../src/ui/miniatura.ts';

/** prostokąt pikseli o alfa > 0 w sprite'ie, policzony niezależnie od kodu miniatury */
function bbox(sp: Sprite) {
  let x0 = sp.w;
  let y0 = sp.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++)
      if (sp.px[y * sp.w + x] >>> 24) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

describe('miniatury budowli', () => {
  it('każdy rodzaj: dłuższy bok dokładnie w pudełku, proporcje przyciętego sprite’a, są piksele', () => {
    for (const kind of BUILD_KINDS) {
      const sp = rzeczSprite({ kind, rot: 0, seed: 1 }, null);
      const r = thumbPixels(sp, 56)!;
      expect(r, kind).not.toBeNull();
      expect(Math.max(r.w, r.h), kind).toBe(56);
      expect(r.data.length, kind).toBe(r.w * r.h * 4);
      const b = bbox(sp);
      const scale = 56 / Math.max(b.w, b.h);
      expect(Math.abs(r.w - b.w * scale), kind).toBeLessThanOrEqual(1);
      expect(Math.abs(r.h - b.h * scale), kind).toBeLessThanOrEqual(1);
      expect(
        r.data.some((v, i) => i % 4 === 3 && v === 255),
        kind,
      ).toBe(true);
    }
  });

  it('pusty sprite daje null, a kolejność bajtów to R, G, B, A', () => {
    const empty: Sprite = { w: 3, h: 2, ax: 0, ay: 0, px: new Uint32Array(6) };
    expect(thumbPixels(empty, 56)).toBeNull();
    const one: Sprite = { w: 1, h: 1, ax: 0, ay: 0, px: Uint32Array.of(rgba(0xff8040)) };
    const r = thumbPixels(one, 4)!;
    expect([r.w, r.h]).toEqual([4, 4]);
    expect([...r.data.slice(0, 4)]).toEqual([0xff, 0x80, 0x40, 0xff]);
  });
});
