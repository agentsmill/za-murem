import { describe, expect, it } from 'vitest';
import type { LudzieGrafika, OpisGrafiki } from '../../src/render/art/pixellab.ts';
import { LudzieLayer } from '../../src/render/ludzieLayer.ts';
import type { PoseView } from '../../src/render/poses.ts';
import { type Atlas, atlasy } from '../../tools/atlasy.ts';

const wynik = atlasy();
const opis = (wynik.get('grafika.json') as OpisGrafiki).ludzie;
const atlas = wynik.get(opis.plik) as Atlas;
const grafika: LudzieGrafika = {
  opis,
  img: { w: atlas.w, h: atlas.h, px: new Uint32Array(atlas.rgba.buffer.slice(0)) },
};
const poza = (over: Partial<PoseView> = {}): PoseView => ({ pose: 'walk', dir: 0, frame: 0, ...over });
const postac = (id: string) => opis.postacie.find((p) => p.id === id)!;

describe('warstwa postaci z PixelLab (tekstury Pixi z atlasu ludzie.png)', () => {
  const warstwa = new LudzieLayer(grafika);

  it('tekstura to prostokąt klatki z atlasu, kotwica stóp i lustro idą z opisu', () => {
    const kibic = postac('kotwica-kibic');
    const pv = poza({ dir: 1, frame: 2 });
    const k = warstwa.klatka(kibic, pv, true, 0, 0)!;
    const d = warstwa.dane.klatka(kibic, pv, true, 0, 0)!;
    expect([k.tex.frame.x, k.tex.frame.y, k.tex.frame.width, k.tex.frame.height]).toEqual([d.x, d.y, d.w, d.h]);
    expect([k.ax, k.ay, k.w, k.h, k.flip, k.zastepcza]).toEqual([d.ax, d.ay, d.w, d.h, d.flip, false]);
    expect(k.tex.source.width).toBe(atlas.w);
  });

  it('ta sama klatka daje tę samą teksturę, a wersja kolorystyczna własne źródło z innymi kolorami ubrania', () => {
    const kibic = postac('kotwica-kibic');
    const pv = poza({ dir: 0, frame: 1 });
    const baza = warstwa.klatka(kibic, pv, true, 0, 0)!.tex;
    expect(warstwa.klatka(kibic, pv, true, 5, 0)!.tex).toBe(baza);
    const w2 = warstwa.klatka(kibic, pv, true, 0, 2)!.tex;
    expect(w2.source).not.toBe(baza.source);
    expect(warstwa.klatka(kibic, pv, true, 0, 2)!.tex).toBe(w2);
    expect(warstwa.klatka(kibic, pv, true, 0, 3)!.tex.source).not.toBe(w2.source);
    const px = (s: typeof baza.source) => {
      const b = s.resource as Uint8Array;
      return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    };
    const a = px(baza.source);
    const b = px(w2.source);
    let rozne = 0;
    for (let r = 0; r < baza.frame.height; r++)
      for (let c = 0; c < baza.frame.width; c++) {
        const i = (baza.frame.y + r) * baza.source.width + baza.frame.x + c;
        const j = (w2.frame.y + r) * w2.source.width + w2.frame.x + c;
        if (a[i] !== b[j]) rozne++;
      }
    expect(rozne).toBeGreaterThan(20);
  });

  it('klatki zarządu w wersji leżą w kopii pasa zarządu, o wysokość pasa niżej niż w atlasie', () => {
    const emeryt = postac('kotwica-emeryt');
    const pv = poza({ dir: 1 });
    const baza = warstwa.klatka(emeryt, pv, true, 0, 0)!.tex;
    const w1 = warstwa.klatka(emeryt, pv, true, 0, 1)!.tex;
    expect(w1.frame.y).toBe(baza.frame.y - opis.regiony.zarzad[0]);
    expect(w1.source.height).toBe(opis.regiony.zarzad[1] - opis.regiony.zarzad[0]);
  });

  it('brak pracy daje null, a zastępcza klatka niesie znacznik z danych', () => {
    const kibic = postac('kotwica-kibic');
    expect(warstwa.klatka(kibic, poza({ pose: 'chop' }), false, 0, 0)).toBeNull();
    expect(warstwa.klatka(kibic, poza({ pose: 'swing' }), false, 0, 0)!.zastepcza).toBe(true);
  });

  it('wybór postaci i wersji przechodzi przez warstwę, a destroy zwalnia źródła tekstur', () => {
    const l = new LudzieLayer(grafika);
    const p = { id: 1, kind: 'core', person: 0, look: 0 };
    expect(l.dane.postacPionka(p, [{ f: false, age: 70 }])?.id).toBe('kotwica-emeryt');
    l.klatka(postac('kotwica-emeryt'), poza(), true, 0, 2);
    expect(() => l.destroy()).not.toThrow();
  });
});
