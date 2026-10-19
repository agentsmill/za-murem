import { describe, expect, it } from 'vitest';
import { drawChunk } from '../../src/render/art/chunkArt.ts';
import type { BudynekGrafika } from '../../src/render/art/pixellab.ts';
import { buildScene, CHUNK, type Scene } from '../../src/render/art/scene.ts';
import { sectionPietra } from '../../src/render/pietro.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { buildWorld } from '../../src/world/world.ts';
import { atrapaPlotna, grafikaZPlikow } from './grafika-pomoc.ts';

/* Budynek z wyglądem z PixelLab (moduły i ozdoba) na wybranym piętrze, drawChunk w trybie piętra. Dwa budynki w jednym
   kawałku: muzeum z dwiema kondygnacjami (wygląd z ozdobą stojącą na ziemi przed frontem, portykiem) i wysoki blok
   o sześciu, przez który kawałek dostaje przekrój piętra. Scena piętra ma w `otwarte` każdy budynek od dwóch
   kondygnacji (muzeum też), więc o tym, czy muzeum pokazuje piętro, rozstrzyga dopiero jego `levels` wobec piętra. */

const g = grafikaZPlikow();

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

const geo: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [] };
geo.b.push({ p: rect(-30, -20, 22, 14), t: { building: 'yes', 'building:levels': '2' } });
geo.b.push({ p: rect(-4, -20, 20, 14), t: { building: 'apartments', 'building:levels': '6' } });
geo.rodzaje = [{ x: -19, y: -13, k: 'muzeum', n: '' }];
const w = buildWorld(geo, { seed: 1, size: 128 });
const sc: Scene = buildScene(w, g);
const pietra = sectionPietra(w)!;

const muzeum = w.buildings.find((b) => sc.styles[b.id].look === 'muzeum')!;
const blok = w.buildings.find((b) => b.levels === 6)!;
/** kawałek z muzeum i z początkiem bloku */
const KAWALEK = [Math.floor(muzeum.x0 / CHUNK), Math.floor(muzeum.y0 / CHUNK)] as const;
const SIDE = CHUNK * 32;
/** kolumny kafelków kawałka na lewo od bloku: muzeum z jego portykiem, bez bloku */
const DO_BLOKU = (blok.x0 - KAWALEK[0] * CHUNK) * 32;

function obraz(s: Scene, pietro: number): Uint32Array {
  const p = atrapaPlotna();
  drawChunk({ ...s, pietra: pietro ? pietra : null, pietro }, KAWALEK[0], KAWALEK[1], 32, p.canvas, pietro > 0);
  return p.px();
}

/** obraz bez ozdoby muzeum (reszta sceny ta sama) */
function bezOzdoby(s: Scene): Scene {
  const lg = s.art!.budynki!.muzeum as BudynekGrafika;
  return { ...s, art: { ...s.art!, budynki: { ...s.art!.budynki, muzeum: { ...lg, ozdoba: null } } } };
}

/** czy obrazy różnią się w kolumnach pikseli [0, do) kawałka */
function rozne(a: Uint32Array, b: Uint32Array, doKolumny = SIDE): boolean {
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < doKolumny; x++) if (a[y * SIDE + x] !== b[y * SIDE + x]) return true;
  return false;
}

describe('budynek z wyglądem z PixelLab na piętrze (drawChunk w trybie piętra)', () => {
  it('atrapa: muzeum ma wygląd z ozdobą, blok ma wyższe piętra i przekrój piętra obejmuje oba', () => {
    expect(muzeum.levels).toBe(2);
    expect(sc.styles[muzeum.id].look).toBe('muzeum');
    expect(g.budynki?.muzeum?.ozdoba).not.toBeNull();
    expect(pietra.otwarte?.has(muzeum.id)).toBe(true);
    expect(pietra.otwarte?.has(blok.id)).toBe(true);
    // ozdoba widać w zwykłym rysowaniu (bez niej obraz jest inny), więc testy niżej nie są puste
    expect(rozne(obraz(sc, 0), obraz(bezOzdoby(sc), 0), DO_BLOKU)).toBe(true);
  });

  it('piętro 2: muzeum (dwie kondygnacje) nie ma tego piętra, więc rysuje się jak bez przekroju, z ozdobą', () => {
    const zwykly = obraz(sc, 0);
    const na2 = obraz(sc, 2);
    expect(rozne(na2, zwykly, DO_BLOKU)).toBe(false);
    // i nie wyszło to z braku przekroju: blok (sześć kondygnacji) pokazuje piętro, więc po jego stronie obrazy się różnią
    expect(rozne(na2, zwykly)).toBe(true);
  });

  it('piętro 1: muzeum ma to piętro, więc pokazuje przekrój bez dachu i bez ozdoby', () => {
    const na1 = obraz(sc, 1);
    expect(rozne(na1, obraz(sc, 0), DO_BLOKU)).toBe(true);
    expect(rozne(na1, obraz(bezOzdoby(sc), 1))).toBe(false);
  });
});
