/* Wzory rysowane kodem w kwadratach na zachód i północ od domu (miasto z kwadratów, etap 1, przegląd całej gałęzi).
   Kwadrat (sx, sy) zaczyna się w (sx·bok, sy·bok) pikseli układu miasta, więc dla sx < 0 albo sy < 0 współrzędne wzorów
   (ax, ay w chunkArt.ts) są ujemne, a reszta z dzielenia (%) w JavaScripcie ma wtedy znak dzielnej: warunki w rodzaju
   „ax % 12 w 3..8” albo „ax % 80 < 2” przestają działać (zero okien, parking cały w liniach). Test porównuje ten sam
   budynek, ten sam parking i te same działki w kwadracie po stronie dodatniej i ujemnej: wzór musi mieć to samo
   okno, szybę, bramę, pas blachy, linię i rząd, a moduł fasady 12 px musi trzymać fazę układu miasta po obu stronach
   zera (kolumny okien liczone od współrzędnej miasta, nie od lewej krawędzi kwadratu). Porównanie ze sceną złożoną
   (kwadraty-szew*.test.ts) tego nie łapie, bo błąd miałaby po obu stronach. Rysowanie bez grafiki z PixelLab, plótno
   atrapa (zapisuje piksele z putImageData: teren, fasady, dachy). */

import { describe, expect, it } from 'vitest';
import { drawChunk } from '../../src/render/art/chunkArt.ts';
import { C, rgba, shade } from '../../src/render/art/palette.ts';
import { buildScene, TILE } from '../../src/render/art/scene.ts';
import { T } from '../../src/world/terrain.ts';
import type { World, WorldBuilding } from '../../src/world/world.ts';
import { atrapaPlotna } from './grafika-pomoc.ts';

/** bok sceny w kafelkach i w pikselach grafiki (kwadrat testowy jest mniejszy od 384, wzory nie zależą od rozmiaru) */
const N = 64;
const BOK = N * TILE;

/** świat N × N z jednym terenem; z budynkiem (prostokąt 20 × 13 kafelków pośrodku pierwszego kawałka), gdy podano klasę */
function swiat(teren: number, budynek?: { cls: WorldBuilding['cls']; levels: number }): World {
  const terr = new Uint8Array(N * N).fill(teren);
  const bid = new Int32Array(N * N).fill(-1);
  const buildings: WorldBuilding[] = [];
  if (budynek) {
    const b = { x0: 8, y0: 8, x1: 27, y1: 20 };
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        terr[y * N + x] = T.BUILDING;
        bid[y * N + x] = 0;
      }
    buildings.push({
      id: 0,
      cls: budynek.cls,
      levels: budynek.levels,
      name: 'b',
      area: 260,
      tiles: 260,
      ...b,
      cats: [],
      entrances: [],
      tags: {},
    });
  }
  return {
    size: N,
    angle: 0,
    terr,
    bid,
    blocked: new Uint8Array(N * N),
    buildings,
    trees: [],
    pois: [],
    hq: -1,
    seed: 1,
    dryTree: -1,
    props: [],
    apts: [],
    damage: [],
  } as unknown as World;
}

/** piksele pierwszego kawałka sceny z początkiem (sx·bok, sy·bok), 32 px na kafelek (jeden piksel to jeden piksel wzoru) */
function kawalek(w: World, sx: number, sy: number, styl?: Record<string, unknown>): Uint32Array {
  const sc = buildScene(w, null, { poczatek: { x: sx * BOK, y: sy * BOK } });
  // ten sam wygląd w obu kwadratach, jak budynek o tym samym kluczu: ziarno, dach i brak grzbietu ustawione jawnie
  if (styl) sc.styles[0] = { ...sc.styles[0], ...styl } as (typeof sc.styles)[0];
  const p = atrapaPlotna();
  drawChunk(sc, 0, 0, 32, p.canvas);
  return p.px();
}

const ile = (px: Uint32Array, kolor: number): number => px.reduce((a, v) => a + (v === rgba(kolor) ? 1 : 0), 0);
/** reszta z dzielenia zawsze nieujemna: to, co wzór fasady liczy dla ujemnych współrzędnych miasta */
const mod = (a: number, m: number): number => ((a % m) + m) % m;

/** kwadraty po stronie dodatniej i ujemnej: wschód i zachód (x), południe i północ (y) */
const PARY: Array<{ nazwa: string; dodatni: [number, number]; ujemny: [number, number] }> = [
  { nazwa: 'wschód i zachód od domu', dodatni: [1, 0], ujemny: [-1, 0] },
  { nazwa: 'południe i północ od domu', dodatni: [0, 1], ujemny: [0, -1] },
  { nazwa: 'przekątne: południowy wschód i północny zachód', dodatni: [1, 1], ujemny: [-1, -1] },
];

/** liczba pikseli koloru po obu stronach nie różni się o więcej niż jedną czwartą, a po dodatniej jest ich dość (test mierzy) */
function podobnie(a: number, b: number, minimum: number): void {
  expect(a).toBeGreaterThan(minimum);
  expect(Math.abs(b - a)).toBeLessThanOrEqual(a / 4);
}

describe('wzory z kodu w kwadratach o ujemnych współrzędnych miasta', () => {
  for (const { nazwa, dodatni, ujemny } of PARY) {
    describe(nazwa, () => {
      for (const [cls, levels, kolor, opis] of [
        ['blok', 4, C.window, 'okna bloku'],
        ['dom', 2, C.window, 'okna domu'],
        ['sklep', 1, C.shopGlass, 'szyby sklepu'],
      ] as const) {
        it(`${opis} są po obu stronach zera`, () => {
          const styl = { seed: 12345, roof: 'gravel', ridge: null };
          const a = kawalek(swiat(T.GRASS, { cls, levels }), dodatni[0], dodatni[1], styl);
          const b = kawalek(swiat(T.GRASS, { cls, levels }), ujemny[0], ujemny[1], styl);
          podobnie(ile(a, kolor), ile(b, kolor), 500);
        });
      }

      it('brama garażu: słupki co 96 px, a nie cała brama w kolorze słupka', () => {
        const styl = { seed: 12345, roof: 'gravel', ridge: null };
        const a = kawalek(swiat(T.GRASS, { cls: 'garaz', levels: 1 }), dodatni[0], dodatni[1], styl);
        const b = kawalek(swiat(T.GRASS, { cls: 'garaz', levels: 1 }), ujemny[0], ujemny[1], styl);
        podobnie(ile(a, C.metal1), ile(b, C.metal1), 50);
      });

      it('blacha na dachu ma pasy co 6 px: po połowie dwóch odcieni', () => {
        const styl = { seed: 12345, roof: 'metal', ridge: null };
        for (const [sx, sy] of [dodatni, ujemny]) {
          const px = kawalek(swiat(T.GRASS, { cls: 'blok', levels: 4 }), sx, sy, styl);
          const c0 = ile(px, C.metal0);
          const c1 = ile(px, C.metal1);
          expect(c0).toBeGreaterThan(10000);
          expect(Math.abs(c0 - c1)).toBeLessThanOrEqual(c0 / 4);
        }
      });

      it('parking ma linie miejsc co 2,5 m i działki rzędy upraw jak po stronie dodatniej', () => {
        const linia = shade(C.line, 0.85);
        const a = kawalek(swiat(T.PARKING), dodatni[0], dodatni[1]);
        const b = kawalek(swiat(T.PARKING), ujemny[0], ujemny[1]);
        // linie to 2 z 80 kolumn i 52 z 64 wierszy: około dwóch procent pikseli, nie połowa i nie zero
        expect(ile(a, linia) / a.length).toBeGreaterThan(0.01);
        expect(ile(a, linia) / a.length).toBeLessThan(0.04);
        expect(ile(b, linia) / b.length).toBeGreaterThan(0.01);
        expect(ile(b, linia) / b.length).toBeLessThan(0.04);
        const ua = kawalek(swiat(T.ALLOT), dodatni[0], dodatni[1]);
        const ub = kawalek(swiat(T.ALLOT), ujemny[0], ujemny[1]);
        // rzędy to 5 z 14 wierszy, w trzech czwartych z uprawą (siedem dziesiątych plon): około piątej części pikseli
        for (const px of [ua, ub]) {
          expect(ile(px, C.crop) / px.length).toBeGreaterThan(0.1);
          expect(ile(px, C.crop) / px.length).toBeLessThan(0.3);
        }
      });
    });
  }

  it('kolumny okien bloku mają fazę układu miasta po obu stronach zera: wszystkie reszty od 3 do 8 z 12, żadnej poza nimi', () => {
    for (const sx of [3, 1, -1, -3]) {
      const px = kawalek(swiat(T.GRASS, { cls: 'blok', levels: 4 }), sx, 0, {
        seed: 12345,
        roof: 'gravel',
        ridge: null,
      });
      const okno = rgba(C.window);
      const reszty = new Set<number>();
      for (let i = 0; i < px.length; i++)
        if (px[i] === okno) {
          const x = i % 1024; // kolumna w kawałku = kolumna w kwadracie (kawałek 0)
          reszty.add(mod(x + sx * BOK, 12));
        }
      expect(
        [...reszty].sort((x, y) => x - y),
        `kwadrat sx = ${sx}`,
      ).toEqual([3, 4, 5, 6, 7, 8]);
    }
  });
});
