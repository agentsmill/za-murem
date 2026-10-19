import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawChunk, miejsceOzdoby } from '../../src/render/art/chunkArt.ts';
import { LOOKI, type LookBudynku } from '../../src/render/art/lookBudynku.ts';
import { rgba } from '../../src/render/art/palette.ts';
import {
  attykaKolor,
  type BudynekGrafika,
  blokKolor,
  dachProbkaKolor,
  kolumnaFasady,
  papaKolor,
  pasFasady,
  pietraWygladu,
} from '../../src/render/art/pixellab.ts';
import { buildScene, CHUNK, type Scene } from '../../src/render/art/scene.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { atrapaBudynki } from './atrapa-budynki.ts';
import { atrapaPlotna, grafikaZPlikow } from './grafika-pomoc.ts';

/* Wyglądy budynków z PixelLab w grze: styl budynku (wygląd, piętra, fasada), piksele fasady, dachu i ozdoby w kawałkach
   mapy, zapas z kodu bez grafiki i dema bez zmian. Mapa to atrapa z każdym z 11 wyglądów (atrapa-budynki.ts). */

const ROOT = path.resolve(import.meta.dirname, '../..');
const g = grafikaZPlikow();
const bez = { ...g, budynki: null };
const { geo, budynki: atrapa } = atrapaBudynki();
const w = buildWorld(geo, { seed: 1 });
const z = buildScene(w, g);
const size = w.size;

/** budynek świata najbliższy środkowi budynku z atrapy (mapa jest przy budowie obracana o drobny kąt) */
function budynekAtrapy(look: LookBudynku, k = 0) {
  const lista = atrapa.filter((a) => a.look === look);
  const a = lista[k];
  const cx = (a.x0 + a.x1) / 2 + size / 2;
  const cy = (a.y0 + a.y1) / 2 + size / 2;
  let naj = w.buildings[0];
  let d = Number.POSITIVE_INFINITY;
  for (const b of w.buildings) {
    const dd = Math.hypot((b.x0 + b.x1 + 1) / 2 - cx, (b.y0 + b.y1 + 1) / 2 - cy);
    if (dd < d) {
      d = dd;
      naj = b;
    }
  }
  return naj;
}

describe('rozpoznanie wyglądu na atrapie z każdym wyglądem', () => {
  it('każdy z 11 wyglądów dostaje budynek, a blok siedziby i ulica bez wyglądów zostają jak były', () => {
    const wyglady = new Set(z.styles.map((s) => s.look).filter(Boolean));
    expect([...wyglady].sort()).toEqual([...LOOKI].sort());
    for (const a of atrapa) {
      const idx = atrapa.filter((q) => q.look === a.look).indexOf(a);
      const b = budynekAtrapy(a.look, idx);
      expect(z.styles[b.id].look, `${a.look} #${idx}`).toBe(a.look);
    }
    // budynki z wyglądem to dokładnie te z atrapy (6 kamienic i 10 pojedynczych), reszta (blok) bez wyglądu
    expect(z.styles.filter((s) => s.look)).toHaveLength(atrapa.length);
    expect(w.buildings.filter((b) => !z.styles[b.id].look)).toHaveLength(w.buildings.length - atrapa.length);
  });

  it('budynek z wyglądem to budynek z modułów: piętro z modułu, piętra z danych albo typowe, fasada nie głębsza niż budynek', () => {
    for (const b of w.buildings) {
      const s = z.styles[b.id];
      if (!s.look) continue;
      const lg = g.budynki?.[s.look] as BudynekGrafika;
      expect(s.mod).toBe(true);
      expect(s.floorH).toBe(lg.fasada.srodek[1]);
      const znane = Number.parseInt(b.tags['building:levels'], 10) > 0;
      const piętra = pietraWygladu(lg, Math.max(1, Math.min(b.levels, 16)), znane);
      expect(s.vis).toBe(piętra);
      const glebokosc = (b.y1 - b.y0 + 1) * 32;
      expect(s.facade).toBe(Math.min(pasFasady(lg.fasada, piętra).length, Math.max(10, glebokosc - 12)));
    }
  });

  it('kościół i remiza mają stałą liczbę pięter, budynek bez pięter w danych typową liczbę wyglądu', () => {
    const rect = (x: number, y: number, ww: number, h: number): Pt[] => [
      [x, y],
      [x + ww, y],
      [x + ww, y + h],
      [x, y + h],
      [x, y],
    ];
    const maly = (tagi: Record<string, string>, rodzaj: 'kosciol' | 'hotel'): Scene => {
      const gg: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [] };
      gg.b.push({ p: rect(-12, -20, 24, 16), t: { building: 'yes', ...tagi } });
      gg.rodzaje = [{ x: 0, y: -12, k: rodzaj, n: '' }];
      return buildScene(buildWorld(gg, { seed: 1, size: 128 }), g);
    };
    const kosciol = maly({ 'building:levels': '3' }, 'kosciol');
    expect(kosciol.styles[0].look).toBe('kosciol');
    expect(kosciol.styles[0].vis).toBe(g.budynki?.kosciol?.pietra);
    // w kawałku fasada ma tyle wierszy, ile pięter wyglądu, a nie ile w danych: górny wiersz pasa (gzyms) leży tuż pod dachem
    const lgk = g.budynki?.kosciol as BudynekGrafika;
    const wiersze = pasFasady(lgk.fasada, lgk.pietra);
    const fy = wiersze.length - 1;
    const x = 54;
    const y = 59 - Math.floor(fy / 32);
    const p = atrapaPlotna();
    drawChunk(kosciol, Math.floor(x / CHUNK), Math.floor(y / CHUNK), 32, p.canvas);
    const px = p.px()[((y % CHUNK) * 32 + (31 - (fy % 32))) * CHUNK * 32 + (x % CHUNK) * 32 + 7];
    expect(px).toBe(rgba(blokKolor(lgk.fasada, kolumnaFasady(lgk.fasada, x * 32 + 7, Number.NaN), wiersze[0])));
    const hotel = maly({}, 'hotel');
    expect(hotel.styles[0].look).toBe('hotel');
    expect(hotel.styles[0].vis).toBe(g.budynki?.hotel?.pietra);
    // hotel z danymi o piętrach ma tyle pięter, ile w danych
    const hotel3 = maly({ 'building:levels': '3' }, 'hotel');
    expect(hotel3.styles[0].vis).toBe(3);
  });

  it('bez budynków w grafice (zapas z kodu) nie ma żadnego wyglądu, a scena nie niesie ich do workerów', () => {
    const sc = buildScene(w, bez);
    expect(sc.styles.some((s) => s.look)).toBe(false);
    expect(sc.art?.budynki).toBeNull();
    expect(buildScene(w).styles.some((s) => s.look)).toBe(false);
  });
});

/** obraz kawałka z bliska (32 px na kafelek) */
const pamiec = new Map<string, Uint32Array>();
function kawalek(sc: Scene, nazwa: string, k: number): Uint32Array {
  const key = `${nazwa}:${k}`;
  let px = pamiec.get(key);
  if (!px) {
    const p = atrapaPlotna();
    drawChunk(sc, k % sc.chunks, (k / sc.chunks) | 0, 32, p.canvas);
    px = p.px();
    pamiec.set(key, px);
  }
  return px;
}
/** piksel świata (ax, ay) w pikselach grafiki (32 na kafelek) */
function pikselSwiata(sc: Scene, nazwa: string, ax: number, ay: number): number {
  const x = Math.floor(ax / 32);
  const y = Math.floor(ay / 32);
  const k = Math.floor(y / CHUNK) * sc.chunks + Math.floor(x / CHUNK);
  const side = CHUNK * 32;
  return kawalek(sc, nazwa, k)[(ay - Math.floor(y / CHUNK) * side) * side + (ax - Math.floor(x / CHUNK) * side)];
}

describe('kawałki mapy z wyglądami budynków', () => {
  for (const look of LOOKI) {
    it(`${look}: fasada z modułów pod drzwiami, dach z próbki albo papy, ozdoba z atlasu`, () => {
      const lg = g.budynki?.[look] as BudynekGrafika;
      const idx = look === 'kamienica' ? 1 : 0;
      const b = budynekAtrapy(look, idx);
      const st = z.styles[b.id];
      const vis = st.vis as number;
      const rows = pasFasady(lg.fasada, vis);
      // drzwi od południa: dolny wiersz pasa pod drzwiami i wiersz 7 od dołu 3 px w prawo od środka drzwi
      const drzwi = b.entrances.find((e) => e.dir === 'S' && z.run[e.tile] * 32 - 8 >= st.facade);
      // portyk stoi na ziemi przy wejściu i zasłania fasadę pod drzwiami (tam sprawdza się jego piksele niżej)
      const zasloniete = lg.ozdoba?.kotwica === 'ziemia' && lg.ozdoba.polozenie === 'wejscie';
      if (drzwi && !zasloniete) {
        const x = drzwi.tile % size;
        const y = (drzwi.tile - x) / size;
        const dx = x * 32 + 16;
        expect(pikselSwiata(z, 'z', dx, y * 32 + 31), 'parter pod drzwiami').toBe(
          rgba(blokKolor(lg.fasada, lg.fasada.wejscie[0] + lg.fasada.drzwi, rows[rows.length - 1])),
        );
        expect(pikselSwiata(z, 'z', dx + 3, y * 32 + 24), 'wiersz 7 od dołu').toBe(
          rgba(blokKolor(lg.fasada, kolumnaFasady(lg.fasada, dx + 3, dx), rows[rows.length - 8])),
        );
      }
      // dach: kafelek w środku dachu (poza fasadą i attyką): próbka dachu albo papa
      let sprawdzonyDach = false;
      for (let y = b.y0 + 1; y < b.y1 && !sprawdzonyDach; y++)
        for (let x = b.x0 + 1; x < b.x1 && !sprawdzonyDach; x++) {
          const i = y * size + x;
          if (w.bid[i] !== b.id || w.bid[i - 1] !== b.id || w.bid[i + 1] !== b.id || w.bid[i - size] !== b.id) continue;
          if (z.south[i] * 32 < st.facade + 32) continue;
          const ax = x * 32 + 11;
          const ay = y * 32 + 13;
          const oczekiwany = lg.dach ? dachProbkaKolor(lg.dach, ax, ay, st.seed) : papaKolor(g.dach as never, ax, ay);
          expect(pikselSwiata(z, 'z', ax, ay), 'dach').toBe(rgba(oczekiwany));
          sprawdzonyDach = true;
        }
      expect(sprawdzonyDach).toBe(true);
      // krawędź dachu od północy: profil attyki
      const xm = Math.floor((b.x0 + b.x1) / 2);
      if (w.bid[b.y0 * size + xm] === b.id && z.south[b.y0 * size + xm] * 32 >= st.facade + 32)
        for (let e = 0; e < lg.fasada.attyka[1]; e++)
          expect(pikselSwiata(z, 'z', xm * 32 + 16, b.y0 * 32 + e), `attyka ${e}`).toBe(
            rgba(attykaKolor(lg.fasada, e)),
          );
      // ozdoba: pierwszy nieprzezroczysty piksel sprite'a leży w kawałku dokładnie tak, jak w atlasie
      if (lg.ozdoba) {
        const oz = lg.ozdoba;
        const [sx, sy] = miejsceOzdoby(w, b, st, oz);
        let sprawdzone = 0;
        for (let v = 0; v < oz.img.h && sprawdzone < 5; v += 3)
          for (let u = 0; u < oz.img.w && sprawdzone < 5; u += 3) {
            const p = oz.img.px[v * oz.img.w + u];
            if (!(p >>> 24)) continue;
            expect(pikselSwiata(z, 'z', sx + u, sy + v), `ozdoba ${u},${v}`).toBe(p);
            sprawdzone++;
          }
        expect(sprawdzone).toBe(5);
        // bez wyglądów w grafice w tym miejscu nie ma ozdoby (teren, dach albo ściana z kodu)
        expect(pikselSwiata(buildScene(w, bez), 'bez', sx + 3, sy + 3)).not.toBeUndefined();
      }
    });
  }

  it('bez wyglądów w grafice budynek jest rysowany jak dawniej: ratusz z atrapy (pole ponad 350 m²) to blok z modułów bloku', () => {
    const sc = buildScene(w, bez);
    const b = budynekAtrapy('ratusz');
    expect(b.cls).toBe('blok');
    const st = sc.styles[b.id];
    expect(st.look).toBeUndefined();
    expect(st.mod).toBe(true);
    expect(st.floorH).toBe(g.blok?.srodek[1]);
    // środek dachu: z wyglądem próbka dachówki ratusza, bez niego papa jak w blokach
    const lg = g.budynki?.ratusz as BudynekGrafika;
    const ax = ((b.x0 + b.x1 + 1) / 2) * 32 + 5;
    const ay = (b.y0 + 2) * 32 + 9;
    expect(pikselSwiata(z, 'z', ax, ay)).toBe(rgba(dachProbkaKolor(lg.dach as never, ax, ay, z.styles[b.id].seed)));
    expect(pikselSwiata(sc, 'bez', ax, ay)).toBe(rgba(papaKolor(g.dach as never, ax, ay)));
  });
});

/** budynki z wyglądem w demach z public/demo (przegenerowanych z rodzajami punktów): nazwa budynku → wygląd; Lanciego nie
    ma żadnego (bloki z wielkiej płyty to nie kamienice, punkt urzędu stoi w dwunastopiętrowym bloku) */
const WYGLADY_DEM: Record<string, Record<string, LookBudynku>> = {
  przymorze: { 'Blok nr 19': 'urzad' },
  lanciego: {},
  zielonki: { 'Hala nr 106': 'urzad' },
};

describe('dema po dodaniu wyglądów budynków', () => {
  for (const key of ['przymorze', 'lanciego', 'zielonki']) {
    it(`demo ${key}: wygląd mają tylko budynki z urzędem, a kawałki mapy poza nimi są co do piksela takie same jak bez wyglądów`, () => {
      const demo = JSON.parse(fs.readFileSync(path.join(ROOT, `public/demo/${key}.json`), 'utf8'));
      const sw = buildWorld(demo.geo, { seed: 1, street: demo.street });
      const z1 = buildScene(sw, g);
      const z0 = buildScene(sw, bez);
      const zWygladem = sw.buildings.filter((b) => z1.styles[b.id].look);
      expect(Object.fromEntries(zWygladem.map((b) => [b.name, z1.styles[b.id].look]))).toEqual(WYGLADY_DEM[key]);
      // kawałki obrysu takiego budynku i jeden kawałek wokół (ozdoby: wieża, portyk, fasada sięgają za obrys) wolno
      // rysować inaczej, wszystkie pozostałe mają być takie same
      const wokol = new Set<number>();
      for (const b of zWygladem)
        for (let cy = Math.floor(b.y0 / CHUNK) - 1; cy <= Math.floor(b.y1 / CHUNK) + 1; cy++)
          for (let cx = Math.floor(b.x0 / CHUNK) - 1; cx <= Math.floor(b.x1 / CHUNK) + 1; cx++)
            wokol.add(cy * z1.chunks + cx);
      const rysuj = (k: number) => {
        const a = atrapaPlotna();
        const b = atrapaPlotna();
        drawChunk(z1, k % z1.chunks, (k / z1.chunks) | 0, 32, a.canvas);
        drawChunk(z0, k % z0.chunks, (k / z0.chunks) | 0, 32, b.canvas);
        return Buffer.from(a.px().buffer).equals(Buffer.from(b.px().buffer));
      };
      let razem = 0;
      for (let k = 0; k < z1.chunks * z1.chunks; k += 7) {
        if (wokol.has(k)) continue;
        expect(rysuj(k), `kawałek ${k}`).toBe(true);
        razem++;
      }
      expect(razem).toBeGreaterThan(4);
      // sam budynek z wyglądem jest rysowany inaczej niż bez niego: gdzieś w jego obrysie kawałek się różni
      for (const b of zWygladem) {
        let rozne = 0;
        for (let cy = Math.floor(b.y0 / CHUNK); cy <= Math.floor(b.y1 / CHUNK); cy++)
          for (let cx = Math.floor(b.x0 / CHUNK); cx <= Math.floor(b.x1 / CHUNK); cx++)
            if (!rysuj(cy * z1.chunks + cx)) rozne++;
        expect(rozne, b.name).toBeGreaterThan(0);
      }
    });
  }
});

describe('miejsceOzdoby: gdzie stoi wieża, kopuła, portyk', () => {
  const budynek = (entrances: { tile: number; dir: 'N' | 'S' | 'E' | 'W' }[] = []) => ({
    id: 0,
    cls: 'inne' as const,
    x0: 10,
    y0: 10,
    x1: 29,
    y1: 20,
    levels: 1,
    entrances: entrances.map((e) => ({ ...e, out: e.tile })),
  });
  const swiat = { size: 100 } as World;
  const oz = (kotwica: 'gzyms' | 'ziemia', polozenie: 'wejscie' | 'prawo' | 'lewo') => ({
    img: { w: 40, h: 60, px: new Uint32Array(0) },
    ax: 20,
    ay: 55,
    kotwica,
    polozenie,
  });

  it('bez wejścia od południa na osi budynku, korona na linii gzymsu (podstawa nad fasadą)', () => {
    // oś: kafelki 10–29 mają środek 20 (640 px), południowa krawędź kafelka 20 to 672 px, fasada 50 px, podstawa 55 px
    expect(miejsceOzdoby(swiat, budynek(), { facade: 50 }, oz('gzyms', 'wejscie'))).toEqual([620, 672 - 50 - 55]);
  });

  it('portyk stoi na ziemi: podstawa na południowej krawędzi, bez wysokości fasady', () => {
    expect(miejsceOzdoby(swiat, budynek(), { facade: 50 }, oz('ziemia', 'wejscie'))).toEqual([620, 672 - 55]);
  });

  it('przy wejściu od południa najbliższym osi budynku, a wejścia z innych stron nie liczą się', () => {
    // wejścia w kolumnach 14 i 24 w wierszu 20 (kafelek 20 * 100 + x) oraz od wschodu w kolumnie 20: wygrywa 24 (4,5 od osi)
    const e = [
      { tile: 20 * 100 + 14, dir: 'S' as const },
      { tile: 20 * 100 + 24, dir: 'S' as const },
      { tile: 15 * 100 + 20, dir: 'E' as const },
    ];
    expect(miejsceOzdoby(swiat, budynek(e), { facade: 50 }, oz('gzyms', 'wejscie'))).toEqual([
      24.5 * 32 - 20,
      672 - 50 - 55,
    ]);
  });

  it('na końcu ściany: prawo i lewo, bez względu na wejście', () => {
    const e = [{ tile: 20 * 100 + 14, dir: 'S' as const }];
    // prawy koniec: (29 + 1) * 32 = 960 minus część sprite'a na prawo od osi (40 − 20) minus 2 px, a potem lewy róg o ax
    expect(miejsceOzdoby(swiat, budynek(e), { facade: 50 }, oz('ziemia', 'prawo'))).toEqual([
      960 - 20 - 2 - 20,
      672 - 55,
    ]);
    // lewy koniec: 10 * 32 plus ax plus 2 px, lewy róg o ax
    expect(miejsceOzdoby(swiat, budynek(e), { facade: 50 }, oz('ziemia', 'lewo'))).toEqual([
      320 + 20 + 2 - 20,
      672 - 55,
    ]);
  });
});
