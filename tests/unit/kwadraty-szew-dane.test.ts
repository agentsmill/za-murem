/* Szwy na prawdziwych danych (miasto z kwadratów, etap 1, zadanie 6): dom i trzech sąsiadów (E, S, SE) z kafelków
   testowych trzech adresów (różne kąty obrotu), rysowani szwami (daneSzwu i nalozSzew), mają wyglądać tak samo, jak jedna
   scena 768 × 768 złożona z tych samych tablic (budynki po obu stronach szwu, które stykają się kafelkami, sklejone w jeden
   numer). Style budynków są wspólne (jak w grze: ziarno z klucza i styl domu), drzew nie ma, a detale rysowane ścieżkami
   (kominy, anteny) nie wchodzą do porównania (atrapaPlotna zapisuje tylko piksele z putImageData). To dowód, że szew nie ma
   kreski, krawężnika ani uciętego budynku na prawdziwych danych, a nie tylko na syntetycznych (kwadraty-szew.test.ts). */

import { describe, expect, it } from 'vitest';
import { drawChunk, drzewaKawalka } from '../../src/render/art/chunkArt.ts';
import type { Grafika } from '../../src/render/art/pixellab.ts';
import { buildScene, CHUNK, przesunStyl, type Scene, TILE } from '../../src/render/art/scene.ts';
import { daneSzwu, nalozSzew, PRZESUNIECIE, STRONY } from '../../src/render/art/szew.ts';
import { buildKwadrat, buildWorld, type World, type WorldBuilding } from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';
import { atrapaPlotna, grafikaZPlikow } from './grafika-pomoc.ts';

const BOK = 384;
const KWADRATY: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** złożony świat 2 × 2 kwadraty, numer budynku złożonego dla każdego (kwadrat, budynek kwadratu) i numery budynków
    złożonych, w które sklejono dwa różne budynki z jednego kwadratu (dwa budynki w domu stykające się z tym samym
    budynkiem sąsiada): w złożonej scenie nie mają krawędzi między sobą, więc ich nie porównujemy */
function zloz(swiaty: World[]): { swiat: World; numer: (s: number, id: number) => number; konflikty: Set<number> } {
  const n = 2 * BOK;
  const terr = new Uint8Array(n * n);
  const bid = new Int32Array(n * n).fill(-1);
  // klasy zbiorów: budynki łączą się, gdy ich kafelki stykają się przez szew (dom, kwadrat obok), cztery sąsiedztwa
  const rodzic = new Map<number, number>();
  const znajdz = (k: number): number => {
    let r = rodzic.get(k) ?? k;
    while ((rodzic.get(r) ?? r) !== r) r = rodzic.get(r) ?? r;
    rodzic.set(k, r);
    return r;
  };
  const sklej = (a: number, b: number) => {
    const ra = znajdz(a);
    const rb = znajdz(b);
    if (ra !== rb) rodzic.set(rb, ra);
  };
  const kluczB = (s: number, id: number) => s * 100000 + id;
  swiaty.forEach((w, s) => {
    const [sx, sy] = KWADRATY[s];
    for (let y = 0; y < BOK; y++)
      for (let x = 0; x < BOK; x++) {
        terr[(sy * BOK + y) * n + sx * BOK + x] = w.terr[y * BOK + x];
        if (w.bid[y * BOK + x] >= 0) rodzic.set(kluczB(s, w.bid[y * BOK + x]), kluczB(s, w.bid[y * BOK + x]));
      }
  });
  const kwadrat = (gx: number, gy: number) => Math.floor(gx / BOK) + 2 * Math.floor(gy / BOK);
  const budynekGlobalny = (gx: number, gy: number): number | null => {
    if (gx < 0 || gy < 0 || gx >= n || gy >= n) return null;
    const s = kwadrat(gx, gy);
    const id = swiaty[s].bid[(gy % BOK) * BOK + (gx % BOK)];
    return id !== undefined && id >= 0 ? kluczB(s, id) : null;
  };
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++) {
      const a = budynekGlobalny(gx, gy);
      if (!a) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const b = budynekGlobalny(gx + dx, gy + dy);
        if (b && kwadrat(gx, gy) !== kwadrat(gx + dx, gy + dy)) sklej(a, b);
      }
    }
  const numery = new Map<number, number>();
  const budynki: WorldBuilding[] = [];
  const numer = (s: number, id: number): number => {
    const r = znajdz(kluczB(s, id));
    let k = numery.get(r);
    if (k === undefined) {
      k = budynki.length;
      numery.set(r, k);
      const zrodlo = swiaty[Math.floor(r / 100000)].buildings[r % 100000];
      budynki.push({ ...zrodlo, id: k, entrances: [], x0: n, y0: n, x1: -1, y1: -1, tiles: 0 });
    }
    return k;
  };
  swiaty.forEach((w, s) => {
    const [sx, sy] = KWADRATY[s];
    for (let y = 0; y < BOK; y++)
      for (let x = 0; x < BOK; x++) {
        const id = w.bid[y * BOK + x];
        if (id < 0) continue;
        const k = numer(s, id);
        const gx = sx * BOK + x;
        const gy = sy * BOK + y;
        bid[gy * n + gx] = k;
        const b = budynki[k];
        b.x0 = Math.min(b.x0, gx);
        b.y0 = Math.min(b.y0, gy);
        b.x1 = Math.max(b.x1, gx);
        b.y1 = Math.max(b.y1, gy);
        b.tiles++;
      }
    for (const b of w.buildings)
      budynki[numer(s, b.id)].entrances.push(
        ...b.entrances.map((e) => ({
          ...e,
          tile: (sy * BOK + Math.floor(e.tile / BOK)) * n + sx * BOK + (e.tile % BOK),
          out: (sy * BOK + Math.floor(e.out / BOK)) * n + sx * BOK + (e.out % BOK),
        })),
      );
  });
  const swiat = {
    size: n,
    angle: 0,
    terr,
    bid,
    blocked: new Uint8Array(n * n),
    buildings: budynki,
    trees: swiaty.flatMap((w, s) =>
      w.trees.map((t) => ({ ...t, x: t.x + KWADRATY[s][0] * BOK, y: t.y + KWADRATY[s][1] * BOK })),
    ),
    pois: [],
    hq: -1,
    seed: 1,
    // suche drzewo ma tylko dom (jego drzewa idą w złożonym świecie pierwsze, więc numer ten sam)
    dryTree: swiaty[0].dryTree,
    props: [],
    apts: [],
    damage: [],
  } as unknown as World;
  // zbiory z dwoma różnymi budynkami z jednego kwadratu
  const konflikty = new Set<number>();
  const poKwadracie = new Map<number, Set<number>>();
  for (const k of rodzic.keys()) {
    const r = znajdz(k);
    const zbior = poKwadracie.get(r) ?? new Set<number>();
    if ([...zbior].some((m) => Math.floor(m / 100000) === Math.floor(k / 100000) && m !== k))
      konflikty.add(numer(Math.floor(r / 100000), r % 100000));
    zbior.add(k);
    poKwadracie.set(r, zbior);
  }
  return { swiat, numer, konflikty };
}

function pikseleKawalka(sc: Scene, cx: number, cy: number, s: number): Uint32Array {
  const p = atrapaPlotna();
  drawChunk(sc, cx, cy, s, p.canvas);
  return p.px();
}

describe('szwy na prawdziwych danych: dom i trzech sąsiadów jak jedna scena', () => {
  const art: Grafika = { ...grafikaZPlikow(), budynki: null };
  for (const a of ADDRESSES) {
    it(`${a.key}: kawałki wszystkich czterech kwadratów są takie jak w scenie złożonej (8 px), przy szwach także z bliska (32 px)`, () => {
      const seed = 7;
      const geoDomu = geoDomuTestowego(a);
      const uklad = ukladTestowy(a);
      const dom = buildWorld(geoDomu, { seed });
      const swiaty = [dom];
      for (const [sx, sy] of KWADRATY.slice(1))
        swiaty.push(buildKwadrat(geoKwadratuTestowego(a, sx, sy), { seed, uklad, sx, sy, geoDomu }));
      const { swiat, numer, konflikty } = zloz(swiaty);
      const wzor = buildScene(swiat, art);
      // bez drzew (korony rysuje płótno, którego atrapa nie ma); drzewa sprawdza następny test
      wzor.treeGone.fill(1);
      for (const s of wzor.styles) if (s.roof === 'tar') s.roof = 'gravel';
      // style: część w kwadracie ma styl złożonego budynku przesunięty do układu kwadratu (jak styl domu w grze)
      const sceny = swiaty.map((w, s) => {
        const [sx, sy] = KWADRATY[s];
        const sc = buildScene(w, art, { poczatek: { x: sx * BOK * TILE, y: sy * BOK * TILE } });
        for (const b of w.buildings)
          sc.styles[b.id] = przesunStyl(wzor.styles[numer(s, b.id)], sx * BOK * TILE, sy * BOK * TILE);
        sc.treeGone.fill(1);
        return sc;
      });
      sceny.forEach((sc, s) => {
        const [sx, sy] = KWADRATY[s];
        for (const strona of STRONY) {
          const [dx, dy] = PRZESUNIECIE[strona];
          const i = KWADRATY.findIndex(([x, y]) => x === sx + dx && y === sy + dy);
          if (i >= 0) nalozSzew(sc, daneSzwu(sc, sceny[i], strona));
        }
      });
      const n = wzor.chunks;
      const roznice: string[] = [];
      let porownane = 0;
      let kawalkiZBudynkiem = 0;
      let pominiete = 0;
      // kawałek ze sklejonymi różnymi budynkami (z kafelkiem tego budynku w odległości najwyżej jednego kafelka) pomijamy
      const zKonfliktem = (cx: number, cy: number) => {
        for (let y = Math.max(0, cy * CHUNK - 1); y <= Math.min(2 * BOK - 1, (cy + 1) * CHUNK); y++)
          for (let x = Math.max(0, cx * CHUNK - 1); x <= Math.min(2 * BOK - 1, (cx + 1) * CHUNK); x++)
            if (konflikty.has(swiat.bid[y * 2 * BOK + x])) return true;
        return false;
      };
      // 8 px na kafelek: pasy czterech kawałków po obu stronach szwów i cztery narożne kawałki sceny złożonej (daleko od
      // szwów: sprawdza, że szum liczy się od współrzędnych miasta); 32 px: kawałki przy szwach co trzeci i cztery przy
      // wspólnym rogu
      const przySzwie = (c: number) => c >= 10 && c <= 13;
      const narozny = (cx: number, cy: number) => (cx === 0 || cx === n - 1) && (cy === 0 || cy === n - 1);
      for (const s of [8, 32]) {
        const side = CHUNK * s;
        for (let cy = 0; cy < n; cy++)
          for (let cx = 0; cx < n; cx++) {
            if (s === 8 && !przySzwie(cx) && !przySzwie(cy) && !narozny(cx, cy)) continue;
            const naSzwie = (cx === 11 || cx === 12 || cy === 11 || cy === 12) && (cx + cy) % 3 === 0;
            const wspolnyRog = (cx === 11 || cx === 12) && (cy === 11 || cy === 12);
            if (s === 32 && !naSzwie && !wspolnyRog) continue;
            if (konflikty.size && zKonfliktem(cx, cy)) {
              pominiete++;
              continue;
            }
            const sx = Math.floor(cx / (n / 2));
            const sy = Math.floor(cy / (n / 2));
            const i = KWADRATY.findIndex(([x, y]) => x === sx && y === sy);
            const kx = cx - sx * (n / 2);
            const ky = cy - sy * (n / 2);
            const p = pikseleKawalka(wzor, cx, cy, s);
            const q = pikseleKawalka(sceny[i], kx, ky, s);
            porownane++;
            for (let k = 0; k < p.length; k++)
              if (p[k] !== q[k] && roznice.length < 8)
                roznice.push(
                  `s=${s} kawałek (${cx},${cy}) piksel (${k % side},${Math.floor(k / side)}): ${p[k].toString(16)} kontra ${q[k].toString(16)}`,
                );
            if (
              s === 8 &&
              swiat.buildings.some(
                (b) => b.x0 < (cx + 1) * CHUNK && b.x1 >= cx * CHUNK && b.y0 < (cy + 1) * CHUNK && b.y1 >= cy * CHUNK,
              )
            )
              kawalkiZBudynkiem++;
          }
      }
      expect(roznice).toEqual([]);
      // pominięte tylko okolice skleconych kompleksów (kilka kawałków w obu poziomach), reszta porównana
      expect(pominiete).toBeLessThan(20);
      console.log(
        `  ${a.key}: porównano ${porownane} kawałków, pominięto ${pominiete}, zbiorów z konfliktem ${konflikty.size}`,
      );
      expect(porownane).toBeGreaterThan(150);
      expect(kawalkiZBudynkiem).toBeGreaterThan(15);
    });
  }

  for (const a of ADDRESSES) {
    it(`${a.key}: drzewa rysowane w każdym kawałku (własne i obce przez szew) to dokładnie drzewa sceny złożonej`, () => {
      const seed = 7;
      const geoDomu = geoDomuTestowego(a);
      const uklad = ukladTestowy(a);
      const swiaty = [buildWorld(geoDomu, { seed })];
      for (const [sx, sy] of KWADRATY.slice(1))
        swiaty.push(buildKwadrat(geoKwadratuTestowego(a, sx, sy), { seed, uklad, sx, sy, geoDomu }));
      const { swiat } = zloz(swiaty);
      const wzor = buildScene(swiat, null);
      const sceny = swiaty.map((w, s) =>
        buildScene(w, null, { poczatek: { x: KWADRATY[s][0] * BOK * TILE, y: KWADRATY[s][1] * BOK * TILE } }),
      );
      sceny.forEach((sc, s) => {
        const [sx, sy] = KWADRATY[s];
        for (const strona of STRONY) {
          const [dx, dy] = PRZESUNIECIE[strona];
          const i = KWADRATY.findIndex(([x, y]) => x === sx + dx && y === sy + dy);
          if (i >= 0) nalozSzew(sc, daneSzwu(sc, sceny[i], strona));
        }
      });
      const n = wzor.chunks;
      const jak = (sc: Scene, ox: number, oy: number, cx: number, cy: number) =>
        drzewaKawalka(sc, cx, cy).map((d) => `${d.t.seed}:${d.t.x + ox}:${d.t.y + oy}:${d.sucha ? 1 : 0}`);
      const roznice: string[] = [];
      let zObcymi = 0;
      for (let cy = 0; cy < n; cy++)
        for (let cx = 0; cx < n; cx++) {
          const s = Math.floor(cx / (n / 2)) + 2 * Math.floor(cy / (n / 2));
          const [sx, sy] = KWADRATY[s];
          const kx = cx - sx * (n / 2);
          const ky = cy - sy * (n / 2);
          const oczekiwane = jak(wzor, 0, 0, cx, cy);
          const dane = jak(sceny[s], sx * BOK, sy * BOK, kx, ky);
          if (JSON.stringify(oczekiwane) !== JSON.stringify(dane) && roznice.length < 5)
            roznice.push(`kawałek (${cx},${cy}): ${oczekiwane.length} kontra ${dane.length} drzew`);
          if ((sceny[s].obce?.[ky * (n / 2) + kx]?.length ?? 0) > 0) zObcymi++;
        }
      expect(roznice).toEqual([]);
      expect(zObcymi).toBeGreaterThan(5);
    });
  }
});
