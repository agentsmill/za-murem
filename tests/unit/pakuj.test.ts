import { describe, expect, it } from 'vitest';
import { pakuj } from '../../tools/pakuj.ts';

const nachodza = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('pakowanie klatek w atlas (tools/pakuj.ts)', () => {
  const losowe = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ w: 8 + ((i * 37) % 41), h: 10 + ((i * 53) % 47) }));

  it('żadne dwie klatki się nie nakładają i wszystkie mieszczą się w szerokości', () => {
    const klatki = losowe(300);
    const { miejsca, wysokosc } = pakuj(klatki, 512, 2);
    expect(miejsca).toHaveLength(300);
    miejsca.forEach((m, i) => {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.x + klatki[i].w).toBeLessThanOrEqual(512);
      expect(m.y + klatki[i].h).toBeLessThanOrEqual(wysokosc);
    });
    for (let i = 0; i < miejsca.length; i++)
      for (let j = i + 1; j < miejsca.length; j++)
        expect(
          nachodza(
            { ...miejsca[i], w: klatki[i].w, h: klatki[i].h },
            { ...miejsca[j], w: klatki[j].w, h: klatki[j].h },
          ),
          `${i} i ${j}`,
        ).toBe(false);
  });

  it('zostawia odstęp między klatkami, żeby skalowanie nie łapało sąsiada', () => {
    const klatki = losowe(60);
    const { miejsca } = pakuj(klatki, 400, 3);
    for (let i = 0; i < miejsca.length; i++)
      for (let j = i + 1; j < miejsca.length; j++) {
        const a = { ...miejsca[i], x: miejsca[i].x - 2, y: miejsca[i].y - 2, w: klatki[i].w + 4, h: klatki[i].h + 4 };
        const b = { ...miejsca[j], w: klatki[j].w, h: klatki[j].h };
        expect(nachodza(a, b), `${i} i ${j}`).toBe(false);
      }
  });

  it('jest deterministyczne i oddaje miejsca w kolejności wejścia', () => {
    const klatki = losowe(80);
    const a = pakuj(klatki, 600, 2);
    expect(pakuj(klatki, 600, 2)).toEqual(a);
    // klatka o numerze i leży tam, gdzie mówi miejsca[i]
    expect(a.miejsca.map((m) => typeof m.x)).toEqual(Array(80).fill('number'));
  });

  it('klatka szersza od atlasu to błąd, a pusta lista daje pusty atlas', () => {
    expect(() => pakuj([{ w: 600, h: 10 }], 512, 2)).toThrow('szersza');
    expect(pakuj([], 512, 2)).toEqual({ miejsca: [], wysokosc: 0 });
  });
});
