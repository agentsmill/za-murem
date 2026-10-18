import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnyCanvas } from '../../src/render/art/canvas.ts';
import { drawChunk } from '../../src/render/art/chunkArt.ts';
import { rgba } from '../../src/render/art/palette.ts';
import {
  attykaKolor,
  type Blok,
  blokKolor,
  type Grafika,
  grafikaZ,
  kolumnaFasady,
  type Obraz,
  type OpisGrafiki,
  papaKolor,
  pasFasady,
  rzeczSprite,
  trzepakSprite,
  wangKafel,
  wangKlasa,
  wangKolor,
  wangPiksel,
} from '../../src/render/art/pixellab.ts';
import { thingSprite } from '../../src/render/art/rzeczy.ts';
import { buildScene, CHUNK, chunkSceneOf, type Scene } from '../../src/render/art/scene.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { T } from '../../src/world/terrain.ts';
import { buildWorld } from '../../src/world/world.ts';
import { decodePng } from '../../tools/png.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** grafika z public/assets jak w grze, tylko obrazki dekoduje Node */
function zPlikow(): Grafika {
  const dir = path.join(ROOT, 'public/assets');
  const opis = JSON.parse(fs.readFileSync(path.join(dir, 'grafika.json'), 'utf8')) as OpisGrafiki;
  const g = grafikaZ(opis, (plik) => {
    const d = decodePng(fs.readFileSync(path.join(dir, plik)));
    return { w: d.width, h: d.height, px: new Uint32Array(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length / 4) };
  });
  if (!g) throw new Error('grafika z public/assets się nie wczytała');
  return g;
}

/** arkusz Wanga do sprawdzania siatki: ćwiartka kafelka ma kolor swojego narożnika (trawnik 0x00ff00, chodnik
    0x0000ff), więc dobrze ułożony teren ma każdy kafelek świata w jednym kolorze, swoim */
function arkuszCwiartek(): Obraz {
  const px = new Uint32Array(128 * 128);
  for (let n = 0; n < 16; n++)
    for (let v = 0; v < 32; v++)
      for (let u = 0; u < 32; u++) {
        const bit = 3 - ((v < 16 ? 0 : 2) + (u < 16 ? 0 : 1));
        // kolory jak w ImageData: 0xAABBGGRR
        px[((n >> 2) * 32 + v) * 128 + (n % 4) * 32 + u] = (n >> bit) & 1 ? 0xff00ff00 : 0xffff0000;
      }
  return { w: 128, h: 128, px };
}

const KOD = [T.GRASS, T.SIDEWALK, T.PARK, T.PATH, T.ROAD, T.BUILDING, T.WOOD, T.WATER];

describe('teren z kafelków Wanga na podwójnej siatce', () => {
  it('narożniki kafelka Wanga w środkach kafelków świata: każdy kafelek świata ma kolor swojego terenu', () => {
    const size = 12;
    const terr = new Uint8Array(size * size);
    for (let i = 0; i < terr.length; i++) terr[i] = KOD[(i * 7 + ((i / size) | 0) * 3) % KOD.length];
    const teren = { img: arkuszCwiartek() };
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const want = wangKlasa(terr, size, x, y) ? 0x00ff00 : 0x0000ff;
        const q = wangKafel(terr, size, x, y);
        for (let py = 0; py < 32; py += 3)
          for (let px = 0; px < 32; px += 3) {
            expect(wangKolor(teren, terr, size, x, y, px, py), `${x},${y} ${px},${py}`).toBe(want);
            expect(wangPiksel(teren, q, px, py)).toBe(want);
          }
      }
  });

  it('trawnik to trawa, park i las; chodnik to chodnik i cała reszta, a poza mapą jak na jej brzegu', () => {
    const size = 3;
    const terr = Uint8Array.from([T.GRASS, T.PARK, T.WOOD, T.SIDEWALK, T.PATH, T.ROAD, T.BUILDING, T.WATER, T.PLAY]);
    expect([...Array(9).keys()].map((i) => wangKlasa(terr, size, i % 3, (i / 3) | 0))).toEqual([
      1, 1, 1, 0, 0, 0, 0, 0, 0,
    ]);
    expect(wangKlasa(terr, size, -1, -1)).toBe(1);
    expect(wangKlasa(terr, size, 5, 0)).toBe(1);
    expect(wangKlasa(terr, size, 1, 9)).toBe(0);
  });

  it('jednolite kafelki odbijają się różnie w różnych miejscach, kafelki z przejściem nigdy', () => {
    const g = zPlikow();
    const size = 40;
    const trawa = new Uint8Array(size * size).fill(T.GRASS);
    // ten sam piksel kafelka Wanga w różnych miejscach jednolitego trawnika: przynajmniej trzy z czterech odbić
    const warianty = new Set<number>();
    for (let k = 0; k < 40; k++) warianty.add(wangKolor(g.teren!, trawa, size, k % 20, (k * 7) % 20, 20, 21));
    expect(warianty.size).toBeGreaterThan(1);
    // pas chodnika przez trawnik: kafelki z przejściem leżą tak samo w każdym miejscu pasa
    const pas = new Uint8Array(size * size).fill(T.GRASS);
    for (let x = 0; x < size; x++) pas[10 * size + x] = T.SIDEWALK;
    const wiersz = (x: number) => [...Array(32).keys()].map((py) => wangKolor(g.teren!, pas, size, x, 10, 7, py));
    for (let x = 3; x < 30; x += 5) expect(wiersz(x)).toEqual(wiersz(2));
  });
});

describe('blok z modułów kawałka bloku', () => {
  const g = zPlikow();
  const b = g.blok!;

  it('pas fasady: gzyms z górnym piętrem, środkowe piętra po 13 px, parter z cokołem', () => {
    const [gy, gh] = b.gora;
    const [sy, sh] = b.srodek;
    const [dy, dh] = b.dol;
    expect(sh).toBe(13);
    for (const n of [2, 4, 11]) {
      const rows = pasFasady(b, n);
      expect(rows).toHaveLength(gh + (n - 2) * sh + dh);
      expect(rows.slice(0, gh)).toEqual([...Array(gh).keys()].map((k) => gy + k));
      expect(rows.slice(-dh)).toEqual([...Array(dh).keys()].map((k) => dy + k));
      for (let p = 0; p < n - 2; p++)
        expect(rows.slice(gh + p * sh, gh + (p + 1) * sh)).toEqual([...Array(sh).keys()].map((k) => sy + k));
    }
    // parterowy: sam gzyms (bez górnego piętra) nad parterem
    expect(pasFasady(b, 1)).toEqual([
      ...[...Array(gh - sh).keys()].map((k) => gy + k),
      ...[...Array(dh).keys()].map((k) => dy + k),
    ]);
  });

  it('wejście z drzwiami nad kafelkiem drzwi, gdzie indziej przęsła po x świata', () => {
    const drzwi = 10 * 32 + 16;
    const lewa = drzwi - b.drzwi;
    expect(kolumnaFasady(b, drzwi, drzwi)).toBe(b.wejscie[0] + b.drzwi);
    expect(kolumnaFasady(b, lewa, drzwi)).toBe(b.wejscie[0]);
    expect(kolumnaFasady(b, lewa + b.wejscie[1] - 1, drzwi)).toBe(b.wejscie[0] + b.wejscie[1] - 1);
    const p = (ax: number) => b.przesla[0] + (((ax % b.przesla[1]) + b.przesla[1]) % b.przesla[1]);
    expect(kolumnaFasady(b, lewa - 1, drzwi)).toBe(p(lewa - 1));
    expect(kolumnaFasady(b, lewa + b.wejscie[1], drzwi)).toBe(p(lewa + b.wejscie[1]));
    expect(kolumnaFasady(b, 777, Number.NaN)).toBe(p(777));
  });

  it('papa: szwy co tyle pikseli, ile w opisie, poza naklejkami tło z rzadkim szumem', () => {
    const d = g.dach!;
    let tlo = 0;
    let razem = 0;
    for (let ay = 1; ay < 640; ay += 7)
      for (let ax = 1; ax < 640; ax += 5) {
        if (ax % d.szwy[0] === 0 || ay % d.szwy[1] === 0) continue;
        razem++;
        if (papaKolor(d, ax, ay) === d.tlo) tlo++;
      }
    expect(tlo / razem).toBeGreaterThan(0.75);
    // szew poza naklejką: ciemny
    const szwy: number[] = [];
    for (let ay = 3; ay < 600; ay += 11) szwy.push(papaKolor(d, d.szwy[0] * 3, ay));
    expect(szwy.filter((c) => c === d.ciemny).length / szwy.length).toBeGreaterThan(0.6);
  });

  it('naklejki: w kafelku z naklejką jej piksele, w kafelku bez naklejki samo tło, szwy i szum', () => {
    const d = g.dach!;
    const kolory = (cx: number, cy: number) => {
      const s = new Set<number>();
      for (let v = 0; v < 32; v++) for (let u = 0; u < 32; u++) s.add(papaKolor(d, cx * 32 + u, cy * 32 + v));
      return s;
    };
    let z = 0;
    let bez = 0;
    for (let k = 0; k < 400; k++) {
      const s = kolory(k % 20, (k / 20) | 0);
      if ([...s].some((c) => c !== d.tlo && c !== d.ciemny && c !== d.jasny)) z++;
      else bez++;
    }
    expect(z / 400).toBeGreaterThan(d.gestosc * 0.5);
    expect(z / 400).toBeLessThan(d.gestosc * 1.5);
    expect(bez).toBeGreaterThan(z);
  });
});

describe('trzepak z PixelLab', () => {
  it('stopy stoją w wierszu podstawy kafelka, sprite w środku podstawy 3×1', () => {
    const t = zPlikow().trzepak!;
    const sp = trzepakSprite(t);
    expect([sp.w, sp.h]).toEqual([t.img.w, t.img.h]);
    expect(sp.ax).toBe(t.img.w / 2);
    // kotwica rzeczy to dolna krawędź podstawy (1 kafelek), stopy t.podstawa px pod górną krawędzią kafelka
    expect(sp.ay - t.stopy).toBe(32 - t.podstawa);
    // piksele jak w atlasie, a przezroczyste to 0 (jak w sprite'ach rzeczy z kodu)
    expect(sp.px).not.toBe(t.img.px);
    expect([...sp.px]).toEqual([...t.img.px].map((p) => (p >>> 24 ? p : 0)));
    expect(sp.px.some((p) => p === 0)).toBe(true);
  });
});

describe('grafika z opisu', () => {
  it('bez jednego obrazka reszta grafiki zostaje, a w innej wersji opisu nie ma żadnej', () => {
    const dir = path.join(ROOT, 'public/assets');
    const opis = JSON.parse(fs.readFileSync(path.join(dir, 'grafika.json'), 'utf8')) as OpisGrafiki;
    const obraz = (plik: string) => {
      if (plik === opis.dach.plik) return null;
      const d = decodePng(fs.readFileSync(path.join(dir, plik)));
      return { w: d.width, h: d.height, px: new Uint32Array(d.rgba.buffer) };
    };
    const g = grafikaZ(opis, obraz)!;
    expect(g.dach).toBeNull();
    expect(g.teren && g.blok && g.trzepak).toBeTruthy();
    expect((g.blok as Blok).srodek[1]).toBe(13);
    expect(grafikaZ({ ...opis, wersja: opis.wersja + 1 }, obraz)).toBeNull();
  });
});

describe('scena z grafiką z PixelLab', () => {
  const a = ADDRESSES[0];
  const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 });
  const g = zPlikow();
  const z = buildScene(w, g);
  const bez = buildScene(w);

  it('bloki z modułów: 13 px na piętro, fasada z pasa modułów (najwyżej głębokość bloku), reszta jak bez grafiki', () => {
    let bloki = 0;
    for (const b of w.buildings) {
      const s = z.styles[b.id];
      if (b.cls !== 'blok') {
        expect(s).toEqual(bez.styles[b.id]);
        continue;
      }
      bloki++;
      expect(s.mod).toBe(true);
      expect(s.floorH).toBe(13);
      const glebokosc = (b.y1 - b.y0 + 1) * 32;
      expect(s.facade).toBe(Math.min(pasFasady(g.blok!, s.levels).length, Math.max(10, glebokosc - 12)));
    }
    expect(bloki).toBeGreaterThan(5);
  });

  it('bez grafiki bloki jak dawniej: 9 px na piętro, bez modułów', () => {
    for (const b of w.buildings)
      if (b.cls === 'blok') {
        expect(bez.styles[b.id].floorH).toBe(9);
        expect(bez.styles[b.id].mod).toBeFalsy();
      }
    expect(bez.art).toBeNull();
  });

  it('cienie, kolumny budynków i drzwi nie zależą od grafiki', () => {
    expect(z.shadow).toEqual(bez.shadow);
    expect(z.south).toEqual(bez.south);
    expect(z.run).toEqual(bez.run);
    expect(z.doors).toEqual(bez.doors);
  });

  it('grafika kawałków jedzie do workera ze sceną (bez trzepaka), także przez structuredClone', () => {
    const cs = chunkSceneOf(z);
    expect(Object.keys(cs.art!).sort()).toEqual(['blok', 'dach', 'teren']);
    const copy = structuredClone(cs);
    expect(copy.art!.teren!.img.px).toEqual(g.teren!.img.px);
    expect(copy.art!.blok!.srodek).toEqual(g.blok!.srodek);
    expect(copy.art!.dach!.tlo).toBe(g.dach!.tlo);
    expect(chunkSceneOf(bez).art).toBeNull();
  });
});

/** atrapa płótna dla drawChunk: zapamiętuje tylko obraz z putImageData (teren, fasady i dachy piksel po pikselu),
    a detale rysowane ścieżkami pomija */
function plotno(): { canvas: AnyCanvas; px: () => Uint32Array } {
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

describe('kawałki mapy z grafiką z PixelLab', () => {
  const a = ADDRESSES[0];
  const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, 192 * 1.5), { seed: 1 });
  const g = zPlikow();
  const z = buildScene(w, g);
  const bez = buildScene(w);
  const size = w.size;
  const memo = new Map<string, Uint32Array>();
  /** obraz kawałka z bliska (32 px na kafelek) */
  const kawalek = (sc: Scene, k: number) => {
    const key = `${sc === z ? 'z' : 'bez'}:${k}`;
    let px = memo.get(key);
    if (!px) {
      const p = plotno();
      drawChunk(sc, k % sc.chunks, (k / sc.chunks) | 0, 32, p.canvas);
      px = p.px();
      memo.set(key, px);
    }
    return px;
  };
  /** piksel (px, py) kafelka świata (x, y) w obrazie jego kawałka */
  const piksel = (sc: Scene, x: number, y: number, px: number, py: number) => {
    const k = Math.floor(y / CHUNK) * sc.chunks + Math.floor(x / CHUNK);
    const side = CHUNK * 32;
    return kawalek(sc, k)[((y % CHUNK) * 32 + py) * side + (x % CHUNK) * 32 + px];
  };
  const cien = (x: number, y: number, px: number, py: number) =>
    z.shadow[((y * 32 + py) >> 3) * size * 4 + ((x * 32 + px) >> 3)];
  const przyScianie = (i: number) => [i - size, i + size, i - 1, i + 1].some((j) => w.terr[j] === T.BUILDING);

  it('trawnik i chodnik z kafelków Wanga (poza cieniem i ścianami kolor prosto z kafelka)', () => {
    let sprawdzone = 0;
    for (let i = size * 40; i < size * (size - 40) && sprawdzone < 60; i += 37) {
      const x = i % size;
      const y = (i - x) / size;
      const t = w.terr[i];
      if (!(t === T.GRASS || t === T.SIDEWALK) || przyScianie(i)) continue;
      // chodnik bez jezdni obok (krawężnik od jezdni jest jak w kodzie)
      if ([i - size, i + size, i - 1, i + 1].some((j) => w.terr[j] === T.ROAD || w.terr[j] === T.PARKING)) continue;
      for (const [px, py] of [
        [3, 4],
        [16, 16],
        [29, 30],
      ]) {
        if (cien(x, y, px, py)) continue;
        expect(piksel(z, x, y, px, py), `${x},${y}`).toBe(rgba(wangKolor(g.teren!, w.terr, size, x, y, px, py)));
        sprawdzone++;
      }
    }
    expect(sprawdzone).toBeGreaterThan(30);
  });

  it('chodnik z kafelków Wanga przy jezdni ma krawężnik jak chodnik z kodu', () => {
    let sprawdzone = 0;
    for (let i = size * 30; i < size * (size - 30) && sprawdzone < 40; i++) {
      const x = i % size;
      const y = (i - x) / size;
      if (w.terr[i] !== T.SIDEWALK || w.terr[i + 1] !== T.ROAD || przyScianie(i)) continue;
      // przy samej jezdni ciemniejszy krawężnik, dwa piksele dalej jasny, jak w groundColor bez grafiki
      for (const py of [8, 20]) {
        if (cien(x, y, 31, py) || cien(x, y, 29, py)) continue;
        expect(piksel(z, x, y, 31, py)).toBe(piksel(bez, x, y, 31, py));
        expect(piksel(z, x, y, 29, py)).toBe(piksel(bez, x, y, 29, py));
        sprawdzone++;
      }
    }
    expect(sprawdzone).toBeGreaterThan(10);
  });

  it('jezdnia, woda i budynki inne niż bloki rysują się jak bez grafiki', () => {
    let sprawdzone = 0;
    for (let i = size * 30; i < size * (size - 30) && sprawdzone < 200; i += 13) {
      const x = i % size;
      const y = (i - x) / size;
      const t = w.terr[i];
      const b = w.bid[i];
      const inny = t === T.ROAD ? true : b >= 0 && w.buildings[b].cls !== 'blok';
      if (!inny) continue;
      // jezdnia przy trawniku: jej piksele przy samej krawędzi zależą tylko od kodu (rynsztok), więc też jak dawniej
      expect(piksel(z, x, y, 8, 9), `${x},${y}`).toBe(piksel(bez, x, y, 8, 9));
      sprawdzone++;
    }
    expect(sprawdzone).toBeGreaterThan(50);
  });

  it('blok z modułów: nad drzwiami moduł wejścia od ziemi, dalej przęsła, na dachu papa z attyką', () => {
    const b = g.blok!;
    let drzwi = 0;
    for (const bud of w.buildings) {
      if (bud.cls !== 'blok') continue;
      const st = z.styles[bud.id];
      const rows = pasFasady(b, st.levels);
      for (const e of bud.entrances) {
        if (e.dir !== 'S') continue;
        const x = e.tile % size;
        const y = (e.tile - x) / size;
        if (z.run[e.tile] * 32 - 8 < st.facade) continue;
        const dx = x * 32 + 16;
        // drzwi: dolny wiersz pasa (parter), kolumna drzwi modułu wejścia
        expect(piksel(z, x, y, 16, 31)).toBe(rgba(blokKolor(b, b.wejscie[0] + b.drzwi, rows[rows.length - 1])));
        // wiersz 20 od ziemi, 3 px w prawo od środka drzwi
        expect(piksel(z, x, y, 19, 11)).toBe(rgba(blokKolor(b, kolumnaFasady(b, dx + 3, dx), rows[rows.length - 21])));
        drzwi++;
      }
      // attyka przy północnej krawędzi dachu i papa w środku kafelka dachu (poza fasadą)
      for (let x = bud.x0; x <= bud.x1; x++) {
        const i = bud.y0 * size + x;
        if (w.bid[i] !== bud.id || z.south[i] * 32 < st.facade + 32) continue;
        for (let e = 0; e < b.attyka[1]; e++) expect(piksel(z, x, bud.y0, 16, e)).toBe(rgba(attykaKolor(b, e)));
        const ax = x * 32 + 16;
        const ay = bud.y0 * 32 + 20;
        const wsrodku = w.bid[i - 1] === bud.id && w.bid[i + 1] === bud.id;
        if (wsrodku) expect(piksel(z, x, bud.y0, 16, 20)).toBe(rgba(papaKolor(g.dach!, ax, ay)));
      }
    }
    expect(drzwi).toBeGreaterThan(3);
  });
});

describe('rzeczy z grafiką z PixelLab', () => {
  it('trzepak od frontu (3×1) z PixelLab, bokiem (1×3) i bez grafiki z kodu, inne rzeczy zawsze z kodu', () => {
    const g = zPlikow();
    const front = trzepakSprite(g.trzepak!);
    expect(rzeczSprite({ kind: 'trzepak', rot: 0, seed: 3 }, g)).toEqual(front);
    expect(rzeczSprite({ kind: 'trzepak', rot: 2, seed: 5 }, g)).toEqual(front);
    expect(rzeczSprite({ kind: 'trzepak', rot: 1, seed: 3 }, g)).toEqual(
      thingSprite({ kind: 'trzepak', rot: 1, seed: 3 }),
    );
    expect(rzeczSprite({ kind: 'trzepak', rot: 0, seed: 3 }, null)).toEqual(
      thingSprite({ kind: 'trzepak', rot: 0, seed: 3 }),
    );
    expect(rzeczSprite({ kind: 'lawka', rot: 0, seed: 1 }, g)).toEqual(thingSprite({ kind: 'lawka', rot: 0, seed: 1 }));
  });
});
