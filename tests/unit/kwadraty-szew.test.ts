/* Szwy między kwadratami miasta w rysowaniu (miasto z kwadratów, etap 1, zadanie 6): kawałki przy wspólnej krawędzi dwóch
   kwadratów rysują się tak, jakby oba były jedną sceną. Wzorcem jest scena złożona z czterech kwadratów 2×2 (jeden
   świat 2n × 2n, budynki przecięte szwami sklejone w jeden numer), a sprawdzanym - cztery sceny kwadratów połączone
   szwami (daneSzwu i nalozSzew) i narysowane z początkiem w układzie miasta (poczatek). Świat to deterministyczny
   opis globalny: teren z szumu, prostokątne budynki przecinające szwy i narożnik. Pikselami porównujemy cały obraz
   kawałków (atrapaPlotna zapisuje piksele z putImageData: teren, cienie z maski, fasady i dachy); detale rysowane
   ścieżkami (kominy, anteny, maszynownie) i drzewa nie wchodzą do porównania. */

import { describe, expect, it } from 'vitest';
import { drawChunk, drzewaKawalka } from '../../src/render/art/chunkArt.ts';
import { vnoise } from '../../src/render/art/hash.ts';
import type { Grafika } from '../../src/render/art/pixellab.ts';
import { buildScene, CHUNK, chunkSceneOf, type Scene, SUB, TILE } from '../../src/render/art/scene.ts';
import { daneSzwu, kawalkiSzwu, nalozSzew, PRZESUNIECIE, STRONY, type Strona } from '../../src/render/art/szew.ts';
import { T } from '../../src/world/terrain.ts';
import type { Tree, World, WorldBuilding } from '../../src/world/world.ts';
import { atrapaPlotna, grafikaZPlikow } from './grafika-pomoc.ts';

/** rysowanie kawałków w Node jest wolne, a cały zestaw testów chodzi równolegle */
const LIMIT_CZASU = 240_000;
const N = 64;
const CHUNKS = N / CHUNK;

interface Prost {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cls: WorldBuilding['cls'];
  levels: number;
}

/** budynki opisu globalnego (współrzędne w świecie 2N × 2N): przecinają szew pionowy x = 64, poziomy y = 64 i narożnik,
    stoją tuż pod szwem (cień rzucany na północ i wschód) i z dala od szwów; między nimi co najmniej kafelek przerwy */
const BUDYNKI: Prost[] = [
  { x0: 54, y0: 8, x1: 75, y1: 19, cls: 'blok', levels: 4 }, // przez szew pionowy, dwa kawałki obok siebie
  { x0: 10, y0: 52, x1: 23, y1: 77, cls: 'blok', levels: 3 }, // przez szew poziomy, kawałki jeden nad drugim
  { x0: 56, y0: 56, x1: 71, y1: 71, cls: 'sklep', levels: 1 }, // przez narożnik, cztery kawałki
  { x0: 90, y0: 78, x1: 99, y1: 88, cls: 'hala', levels: 1 }, // z dala od szwów w kwadracie D
  { x0: 28, y0: 72, x1: 40, y1: 80, cls: 'blok', levels: 16 }, // wysoki w C kilka metrów pod szwem (cień sięga do A)
  { x0: 30, y0: 56, x1: 38, y1: 62, cls: 'sklep', levels: 1 }, // w A nad nim: cień pada też na ten dach
  { x0: 66, y0: 90, x1: 72, y1: 99, cls: 'sklep', levels: 1 }, // tuż za szwem pionowym w kwadracie D
  { x0: 100, y0: 100, x1: 110, y1: 108, cls: 'blok', levels: 3 }, // z dala od szwów
  { x0: 4, y0: 4, x1: 12, y1: 12, cls: 'hala', levels: 1 }, // z dala od szwów
  { x0: 58, y0: 100, x1: 69, y1: 112, cls: 'blok', levels: 4 }, // przez szew pionowy w dolnej połowie
  { x0: 106, y0: 56, x1: 118, y1: 66, cls: 'blok', levels: 3 }, // przez szew poziomy w prawej połowie
  { x0: 45, y0: 30, x1: 60, y1: 40, cls: 'blok', levels: 16 }, // wysoki kilka metrów przed szwem pionowym w A (cień do B)
  { x0: 50, y0: 44, x1: 62, y1: 48, cls: 'blok', levels: 16 }, // wysoki tuż przed szwem pionowym w A (cień daleko w B)
  { x0: 84, y0: 52, x1: 96, y1: 74, cls: 'blok', levels: 16 }, // wysoki przez szew poziomy w B i D (fasada przez szew)
];

/** drzewa opisu globalnego (współrzędne w świecie 2N × 2N): przy szwach (pień kilka metrów od nich, korony i cienie
    sięgają przez szew), na szwie pionowym x = 64 i poziomym y = 64, w narożniku i z dala od szwów; różne wielkości */
const DRZEWA: Tree[] = [
  { x: 62.2, y: 20.5, kind: 0, r: 3.6, seed: 11 },
  { x: 65.8, y: 22.1, kind: 1, r: 3.0, seed: 12 },
  { x: 30.4, y: 61.9, kind: 0, r: 3.4, seed: 13 },
  { x: 31.2, y: 66.3, kind: 0, r: 2.2, seed: 14 },
  { x: 61.5, y: 61.7, kind: 0, r: 3.6, seed: 15 },
  { x: 66.2, y: 66.4, kind: 1, r: 3.1, seed: 16 },
  { x: 62.6, y: 66.1, kind: 0, r: 2.6, seed: 17 },
  { x: 66.7, y: 62.4, kind: 2, r: 1.4, seed: 18 },
  { x: 100.3, y: 40.2, kind: 0, r: 3.5, seed: 19 },
  { x: 5.5, y: 100.8, kind: 0, r: 2.9, seed: 20 },
  { x: 90.9, y: 61.8, kind: 1, r: 3.3, seed: 21 },
  { x: 91.4, y: 66.6, kind: 0, r: 3.6, seed: 22 },
  { x: 3.1, y: 3.4, kind: 0, r: 3.0, seed: 23 },
  { x: 123.4, y: 123.2, kind: 0, r: 3.2, seed: 24 },
  { x: 40.0, y: 40.0, kind: 0, r: 3.5, seed: 25 },
  { x: 40.2, y: 69.9, kind: 1, r: 3.4, seed: 26 },
  { x: 76.5, y: 33.3, kind: 0, r: 3.6, seed: 27 },
  { x: 50.8, y: 10.7, kind: 0, r: 3.1, seed: 28 },
  { x: 70.1, y: 100.4, kind: 0, r: 3.6, seed: 29 },
  { x: 12.4, y: 80.8, kind: 1, r: 2.5, seed: 30 },
];

/** którą przekątną szachownicy wokół wspólnego rogu zajmuje trawa: 0 to (63, 63) i (64, 64), 1 to (64, 63) i (63, 64) */
let przekatna = 0;

/** początek bloku czterech kwadratów w kwadratach miasta: (0, 0) to dom i sąsiedzi na wschód i południe od niego, (−1, −1)
    to kwadraty na zachód i północ od domu, czyli ujemne współrzędne układu miasta */
let poczatekBloku: [number, number] = [0, 0];

/** kod terenu w punkcie globalnym: szum o kilku skalach, od wody po trawę; cztery kafelki wokół wspólnego rogu
    kwadratów to szachownica (trawa i jezdnia), więc kafelki Wanga przy rogu zależą od kafelka po przekątnej */
function teren(gx: number, gy: number): number {
  if (gx >= N - 1 && gx <= N && gy >= N - 1 && gy <= N) return (gx === gy ? 0 : 1) === przekatna ? T.GRASS : T.ROAD;
  const v = vnoise(gx + 0.5, gy + 0.5, 9, 11);
  const w = vnoise(gx + 0.5, gy + 0.5, 6, 12);
  if (v < 0.1) return T.WATER;
  if (v < 0.28) return T.ROAD;
  if (v < 0.34) return T.SIDEWALK;
  if (v < 0.42) return T.PARKING;
  if (v < 0.48) return T.PATH;
  if (v < 0.6) return T.PARK;
  return w < 0.3 ? T.WOOD : T.GRASS;
}

/** świat okna (ox, oy, size) opisu globalnego: teren i budynki przycięte do okna, numery budynków w kolejności opisu;
    scalony (ox = oy = 0, size = 2N) ma jeden numer na budynek */
function swiat(ox: number, oy: number, size: number, budynki: readonly Prost[], drzewa: readonly Tree[] = []): World {
  const terr = new Uint8Array(size * size);
  const bid = new Int32Array(size * size).fill(-1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) terr[y * size + x] = teren(ox + x, oy + y);
  const buildings: WorldBuilding[] = [];
  for (const b of budynki) {
    const x0 = Math.max(b.x0, ox);
    const x1 = Math.min(b.x1, ox + size - 1);
    const y0 = Math.max(b.y0, oy);
    const y1 = Math.min(b.y1, oy + size - 1);
    if (x0 > x1 || y0 > y1) continue;
    const id = buildings.length;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        terr[(y - oy) * size + (x - ox)] = T.BUILDING;
        bid[(y - oy) * size + (x - ox)] = id;
      }
    buildings.push({
      id,
      cls: b.cls,
      levels: b.levels,
      name: `b${id}`,
      area: (x1 - x0 + 1) * (y1 - y0 + 1),
      tiles: (x1 - x0 + 1) * (y1 - y0 + 1),
      x0: x0 - ox,
      y0: y0 - oy,
      x1: x1 - ox,
      y1: y1 - oy,
      cats: [],
      entrances: [],
      tags: {},
    });
  }
  return {
    size,
    angle: 0,
    terr,
    bid,
    blocked: new Uint8Array(size * size),
    buildings,
    trees: drzewa
      .filter((t) => t.x >= ox && t.x < ox + size && t.y >= oy && t.y < oy + size)
      .map((t) => ({ ...t, x: t.x - ox, y: t.y - oy })),
    pois: [],
    hq: -1,
    seed: 1,
    dryTree: -1,
    props: [],
    apts: [],
    damage: [],
  } as unknown as World;
}

/** numer budynku opisu, z którego powstał budynek okna (przez środek jego pierwszego kafelka) */
function numerOpisu(w: World, ox: number, oy: number, id: number, budynki: readonly Prost[]): number {
  const b = w.buildings[id];
  const gx = ox + b.x0;
  const gy = oy + b.y0;
  return budynki.findIndex((p) => gx >= p.x0 && gx <= p.x1 && gy >= p.y0 && gy <= p.y1);
}

const KWADRATY: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** strona, po której leży sąsiad (dx, dy) */
function strona(dx: number, dy: number): Strona {
  return `${dy < 0 ? 'n' : dy > 0 ? 's' : ''}${dx > 0 ? 'e' : dx < 0 ? 'w' : ''}` as Strona;
}

/** cztery sceny kwadratów połączone szwami z początkiem w układzie miasta i scena złożona (wzorzec); style budynków
    przeciętych szwem są wspólne (w grze robi to ziarno z klucza budynku i styl domu), dachy bez detali ścieżkami */
function uklad(
  art: Grafika | null,
  polaczone = true,
  budynki: readonly Prost[] = BUDYNKI,
  drzewa: readonly Tree[] = [],
) {
  const scalony = swiat(0, 0, 2 * N, budynki, drzewa);
  const wzor = buildScene(scalony, art, {
    poczatek: { x: poczatekBloku[0] * N * TILE, y: poczatekBloku[1] * N * TILE },
  });
  for (const s of wzor.styles) if (s.roof === 'tar') s.roof = 'gravel';
  const sceny = new Map<string, Scene>();
  for (const [sx, sy] of KWADRATY) {
    const w = swiat(sx * N, sy * N, N, budynki, drzewa);
    const sc = buildScene(w, art, {
      poczatek: { x: (poczatekBloku[0] + sx) * N * TILE, y: (poczatekBloku[1] + sy) * N * TILE },
    });
    // wspólny styl: ten sam budynek opisu ma styl budynku ze sceny złożonej (jej numery to numery opisu)
    for (const b of w.buildings) sc.styles[b.id] = { ...wzor.styles[numerOpisu(w, sx * N, sy * N, b.id, budynki)] };
    sceny.set(`${sx},${sy}`, sc);
  }
  if (polaczone)
    for (const [sx, sy] of KWADRATY)
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]) {
        const sasiad = sceny.get(`${sx + dx},${sy + dy}`);
        const sc = sceny.get(`${sx},${sy}`) as Scene;
        if (sasiad) nalozSzew(sc, daneSzwu(sc, sasiad, strona(dx, dy)));
      }
  return { wzor, sceny };
}

function pikselKawalka(sc: Scene, cx: number, cy: number, s: number): Uint32Array {
  const p = atrapaPlotna();
  drawChunk(sc, cx, cy, s, p.canvas);
  return p.px();
}

/** liczba różniących się pikseli i opis pierwszych różnic: kawałek wzorca (cx, cy) kontra kawałek kwadratu */
function roznice(wzor: Scene, sceny: Map<string, Scene>, s: number, tylko?: (cx: number, cy: number) => boolean) {
  const out: string[] = [];
  let ile = 0;
  const side = CHUNK * s;
  for (let cy = 0; cy < 2 * CHUNKS; cy++)
    for (let cx = 0; cx < 2 * CHUNKS; cx++) {
      if (tylko && !tylko(cx, cy)) continue;
      const sx = Math.floor(cx / CHUNKS);
      const sy = Math.floor(cy / CHUNKS);
      const a = pikselKawalka(wzor, cx, cy, s);
      const b = pikselKawalka(sceny.get(`${sx},${sy}`) as Scene, cx - sx * CHUNKS, cy - sy * CHUNKS, s);
      for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i]) {
          ile++;
          if (out.length < 6)
            out.push(
              `kawałek (${cx},${cy}) piksel (${i % side},${Math.floor(i / side)}): ${a[i].toString(16)} kontra ${b[i].toString(16)}`,
            );
        }
    }
  return { ile, out };
}

describe('szwy między kwadratami: kawałki przy szwie jak w jednej scenie', () => {
  // bez grafiki z PixelLab (kod) i z grafiką (kafelki Wanga, bloki z modułów, papa z naklejkami)
  const warianty: [string, Grafika | null][] = [
    ['grafika z kodu', null],
    ['grafika z PixelLab', { ...grafikaZPlikow(), budynki: null }],
  ];
  for (const [nazwa, art] of warianty) {
    for (const s of [8, 32]) {
      it(
        `${nazwa}, ${s} px na kafelek: wszystkie kawałki czterech kwadratów są takie jak w scenie złożonej`,
        () => {
          const { wzor, sceny } = uklad(art);
          const r = roznice(wzor, sceny, s);
          expect(r.out).toEqual([]);
          expect(r.ile).toBe(0);
        },
        LIMIT_CZASU,
      );
    }
  }

  it('narożnik czterech kwadratów bez budynku: kafelki Wanga patrzą na kafelek po przekątnej (szachownica trawa i jezdnia)', () => {
    // bez budynku na rogu, za to z wysokim blokiem w kwadracie C tuż przy rogu (jego cień sięga na południowy zachód B)
    const bezNarozaBudynku: Prost[] = [
      ...BUDYNKI.filter((b) => !(b.x0 <= N && b.x1 >= N - 1 && b.y0 <= N && b.y1 >= N - 1)),
      { x0: 48, y0: 66, x1: 60, y1: 72, cls: 'blok', levels: 16 },
    ];
    expect(bezNarozaBudynku.length).toBe(BUDYNKI.length);
    // trawa na jednej przekątnej szachownicy, potem na drugiej: każdy z czterech narożników patrzy na kafelek trawy
    for (const p of [0, 1]) {
      przekatna = p;
      try {
        for (const s of [8, 32]) {
          const { wzor, sceny } = uklad({ ...grafikaZPlikow(), budynki: null }, true, bezNarozaBudynku);
          const r = roznice(wzor, sceny, s, (cx, cy) => (cx === 1 || cx === 2) && (cy === 1 || cy === 2));
          expect(r.out).toEqual([]);
          expect(r.ile).toBe(0);
        }
      } finally {
        przekatna = 0;
      }
    }
  });

  it(
    'kwadraty na zachód i północ od domu (ujemne współrzędne miasta): kawałki wszystkich czterech są takie jak w scenie złożonej',
    () => {
      // ten sam opis świata, ale blok stoi w układzie miasta od (−1, −1): szum, wzory i kafelki Wanga liczą się z ujemnych
      // współrzędnych i muszą schodzić się na szwach tak samo jak w dodatnich
      poczatekBloku = [-1, -1];
      try {
        for (const [art, s] of [
          [null, 8],
          [null, 32],
          [{ ...grafikaZPlikow(), budynki: null }, 8],
        ] as const) {
          const { wzor, sceny } = uklad(art);
          expect(sceny.get('0,0')?.poczatek).toEqual({ x: -N * TILE, y: -N * TILE });
          const r = roznice(wzor, sceny, s);
          expect(r.out).toEqual([]);
          expect(r.ile).toBe(0);
        }
      } finally {
        poczatekBloku = [0, 0];
      }
    },
    LIMIT_CZASU,
  );

  it('maska cieni każdego kwadratu po nałożeniu szwów to wycinek maski sceny złożonej (także dachy bez cienia)', () => {
    const { wzor, sceny } = uklad(null);
    const S = N * SUB;
    const S2 = 2 * S;
    let zCieniem = 0;
    for (const [sx, sy] of KWADRATY) {
      const sc = sceny.get(`${sx},${sy}`) as Scene;
      const roznych: string[] = [];
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const a = wzor.shadow[(sy * S + y) * S2 + sx * S + x];
          if (a) zCieniem++;
          if (a !== sc.shadow[y * S + x] && roznych.length < 5)
            roznych.push(`(${x},${y}): ${a} kontra ${sc.shadow[y * S + x]}`);
        }
      expect(roznych, `kwadrat ${sx},${sy}`).toEqual([]);
    }
    expect(zCieniem).toBeGreaterThan(1000);
  });

  it('drzewa: cienie i korony drzew sąsiada, które sięgają kawałka przez szew, rysują się w nim jak w scenie złożonej', () => {
    // ścięte drzewa (tu seed 13 i 22 przy szwach) nie rysują się ani u siebie, ani jako obce u sąsiada: szwy nakłada się po
    // ścięciu, więc scena sąsiada ich nie dostaje
    const { wzor, sceny } = uklad(null, false, BUDYNKI, DRZEWA);
    for (const sc of [wzor, ...sceny.values()])
      sc.w.trees.forEach((t, k) => {
        if (t.seed === 13 || t.seed === 22) sc.treeGone[k] = 1;
      });
    for (const [sx, sy] of KWADRATY)
      for (const strona of STRONY) {
        const [dx, dy] = PRZESUNIECIE[strona];
        const sasiad = sceny.get(`${sx + dx},${sy + dy}`);
        const sc = sceny.get(`${sx},${sy}`) as Scene;
        if (sasiad) nalozSzew(sc, daneSzwu(sc, sasiad, strona));
      }
    let zPozyczonymi = 0;
    for (let cy = 0; cy < 2 * CHUNKS; cy++)
      for (let cx = 0; cx < 2 * CHUNKS; cx++) {
        const sx = Math.floor(cx / CHUNKS);
        const sy = Math.floor(cy / CHUNKS);
        const sc = sceny.get(`${sx},${sy}`) as Scene;
        const jak = (s: Scene, ox: number, oy: number, x: number, y: number) =>
          drzewaKawalka(s, x, y).map((d) => `${d.t.seed}:${d.t.x + ox}:${d.t.y + oy}:${d.sucha ? 1 : 0}`);
        const oczekiwane = jak(wzor, 0, 0, cx, cy);
        const dane = jak(sc, sx * N, sy * N, cx - sx * CHUNKS, cy - sy * CHUNKS);
        expect(dane, `kawałek (${cx},${cy})`).toEqual(oczekiwane);
        if (
          drzewaKawalka(sc, cx - sx * CHUNKS, cy - sy * CHUNKS).length >
          (sc.treesBy[(cy % CHUNKS) * CHUNKS + (cx % CHUNKS)] ?? []).length
        )
          zPozyczonymi++;
      }
    // są kawałki, w których rysuje się drzewo spoza kwadratu (test sprawdza coś), a ścięte nie rysują się nigdzie
    expect(zPozyczonymi).toBeGreaterThan(4);
    for (const sc of sceny.values())
      for (const l of sc.obce ?? []) for (const t of l) expect([13, 22]).not.toContain(t.seed);
  });

  it('wynik nie zależy od kolejności nakładania szwów, a nałożenie drugi raz nic nie zmienia', () => {
    const a = uklad(null).sceny;
    const b = uklad(null).sceny;
    // b: szwy jeszcze raz, w odwrotnej kolejności stron i kwadratów
    for (const [sx, sy] of [...KWADRATY].reverse())
      for (const strona of [...STRONY].reverse()) {
        const [dx, dy] = PRZESUNIECIE[strona];
        const sasiad = b.get(`${sx + dx},${sy + dy}`);
        const sc = b.get(`${sx},${sy}`) as Scene;
        if (sasiad) nalozSzew(sc, daneSzwu(sc, sasiad, strona));
      }
    for (const [sx, sy] of KWADRATY) {
      const x = a.get(`${sx},${sy}`) as Scene;
      const y = b.get(`${sx},${sy}`) as Scene;
      expect(y.shadow).toEqual(x.shadow);
      expect(y.south).toEqual(x.south);
      expect(y.run).toEqual(x.run);
      expect(y.brzeg).toEqual(x.brzeg);
      expect(y.obce).toEqual(x.obce);
    }
  });

  it('scena z brzegiem i początkiem przechodzi przez structuredClone do workera bez zmian', () => {
    const { sceny } = uklad(null);
    const sc = sceny.get('0,0') as Scene;
    expect(sc.poczatek).toEqual({ x: 0, y: 0 });
    const b = sceny.get('1,1') as Scene;
    const kopia = structuredClone(chunkSceneOf(b));
    expect(kopia.poczatek).toEqual({ x: N * TILE, y: N * TILE });
    expect(kopia.brzeg).toEqual(b.brzeg);
    expect(kopia.brzeg?.n).toBeInstanceOf(Uint8Array);
    expect(kopia.shadow).toEqual(b.shadow);
  });

  it('bez szwów te same kawałki się różnią (test coś sprawdza)', () => {
    const { wzor, sceny } = uklad(null, false);
    // przy szwach: kawałki przylegające do szwu pionowego (cx 1 i 2) albo poziomego (cy 1 i 2)
    const r = roznice(wzor, sceny, 8, (cx, cy) => cx === 1 || cx === 2 || cy === 1 || cy === 2);
    expect(r.ile).toBeGreaterThan(200);
    // kawałki dalekie od szwów nie różnią się nawet bez nich (rogi okna 2N × 2N): dowód, że poczatek wyrównuje szum
    const dalekie = roznice(wzor, sceny, 8, (cx, cy) => (cx === 0 || cx === 3) && (cy === 0 || cy === 3));
    expect(dalekie.ile).toBe(0);
  });

  it('szwy dotykają tylko kawałków przy wspólnej krawędzi', () => {
    expect(kawalkiSzwu(12, 'e').sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, cy) => cy * 12 + 11));
    expect(kawalkiSzwu(12, 'w').sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, cy) => cy * 12));
    expect(kawalkiSzwu(12, 's').sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, cx) => 11 * 12 + cx));
    expect(kawalkiSzwu(12, 'n').sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, cx) => cx));
    expect(kawalkiSzwu(12, 'se')).toEqual([143]);
    expect(kawalkiSzwu(12, 'nw')).toEqual([0]);
    expect(kawalkiSzwu(12, 'ne')).toEqual([11]);
    expect(kawalkiSzwu(12, 'sw')).toEqual([132]);
  });
});
