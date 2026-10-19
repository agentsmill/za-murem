/* Geometria wielu kwadratów w widoku (miasto z kwadratów, etap 1, zadanie 6), część bez PixiJS: ramka kwadratów, widoczne
   kawałki od najbliższego kamerze, kandydaci do rysowania w tle i kwadraty na ekranie (kwadraty-widok.ts). Składanie tego w
   GameView (sprite'y, szwy, mgła, kamera) sprawdza druga część pliku na prawdziwym widoku bez przeglądarki. */

import type { Application, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CHUNK, TILE } from '../../src/render/art/scene.ts';
import { chunksByDistance } from '../../src/render/chunks.ts';
import { kandydaciTla, kwadratyNaEkranie, ramkaKwadratow, widoczneKawalki } from '../../src/render/kwadratyWidok.ts';
import { GameView } from '../../src/render/view.ts';
import { malaScena } from './kwadraty-pomoc.ts';

const SIZE = 384;
const BOK = SIZE * TILE; // 12288
const SPAN = CHUNK * TILE; // 1024
const N = SIZE / CHUNK; // 12

describe('ramka kwadratów', () => {
  it('sam dom to jeden kwadrat od zera, kwadraty wokół domu rozciągają ją o bok w każdą stronę', () => {
    expect(ramkaKwadratow([{ sx: 0, sy: 0 }], SIZE)).toEqual({ x0: 0, y0: 0, x1: BOK, y1: BOK });
    expect(
      ramkaKwadratow(
        [
          { sx: 0, sy: 0 },
          { sx: -1, sy: -1 },
          { sx: 1, sy: 1 },
        ],
        SIZE,
      ),
    ).toEqual({ x0: -BOK, y0: -BOK, x1: 2 * BOK, y1: 2 * BOK });
    expect(ramkaKwadratow([{ sx: 2, sy: -3 }], SIZE)).toEqual({ x0: 2 * BOK, y0: -3 * BOK, x1: 3 * BOK, y1: -2 * BOK });
  });
});

describe('widoczne kawałki', () => {
  const dom = [{ q: 0, sx: 0, sy: 0 }];

  it('dla samego domu to ta sama lista co chunksByDistance (kolejność jak dotąd), dla wielu kamer i okien', () => {
    let ziarno = 99;
    const los = () => {
      ziarno = (Math.imul(ziarno, 1664525) + 1013904223) >>> 0;
      return ziarno / 4294967296;
    };
    for (let i = 0; i < 80; i++) {
      const w = 200 + los() * 6000;
      const h = 200 + los() * 4000;
      const cam = { x: los() * BOK, y: los() * BOK };
      const v = { x0: cam.x - w / 2, y0: cam.y - h / 2, x1: cam.x + w / 2, y1: cam.y + h / 2 };
      const stare = chunksByDistance(
        N,
        Math.max(0, Math.floor(v.x0 / SPAN)),
        Math.max(0, Math.floor(v.y0 / SPAN)),
        Math.min(N - 1, Math.floor(v.x1 / SPAN)),
        Math.min(N - 1, Math.floor(v.y1 / SPAN)),
        (cam.x / SPAN) | 0,
        (cam.y / SPAN) | 0,
      );
      expect(widoczneKawalki(dom, SIZE, v, cam)).toEqual(stare.map((k) => ({ q: 0, k })));
    }
  });

  it('okno obejmujące szew dwóch kwadratów daje kawałki obu, najpierw przy kamerze', () => {
    const pola = [
      { q: 0, sx: 0, sy: 0 },
      { q: 1, sx: 1, sy: 0 },
    ];
    // kamera tuż przy szwie pionowym (x = BOK), okno 3 kawałki szerokie i 1 wysokie
    const cam = { x: BOK + 10, y: 5 * SPAN + 100 };
    const v = { x0: BOK - 1.5 * SPAN, y0: cam.y - 100, x1: BOK + 1.5 * SPAN, y1: cam.y + 100 };
    const lista = widoczneKawalki(pola, SIZE, v, cam);
    const wiersz = 5 * N;
    // kawałek q1 k=wiersz+0 (kolumna za szwem, odległość 0) pierwszy; potem q0 k=wiersz+11 (odległość 1) i q1 k=wiersz+1
    expect(lista[0]).toEqual({ q: 1, k: wiersz });
    expect(lista.slice(1, 3)).toEqual([
      { q: 0, k: wiersz + 11 },
      { q: 1, k: wiersz + 1 },
    ]);
    expect(lista).toHaveLength(4);
    expect(new Set(lista.map((c) => `${c.q}:${c.k}`)).size).toBe(4);
  });

  it('kwadrat poza oknem nie daje kawałków, okno poza wszystkimi kwadratami też nie', () => {
    const pola = [
      { q: 0, sx: 0, sy: 0 },
      { q: 1, sx: 3, sy: 3 },
    ];
    const cam = { x: 500, y: 500 };
    const v = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    expect(widoczneKawalki(pola, SIZE, v, cam).every((c) => c.q === 0)).toBe(true);
    expect(widoczneKawalki(pola, SIZE, { x0: -9000, y0: -9000, x1: -8000, y1: -8000 }, cam)).toEqual([]);
  });

  it('kamera na zachód od domu (ujemne współrzędne): kawałek pod kamerą jest pierwszy, nie jego sąsiad przy domu', () => {
    const pola = [
      { q: 0, sx: 0, sy: 0 },
      { q: 2, sx: -1, sy: 0 },
    ];
    // x = −1500 leży w kolumnie 10 kwadratu (−1, 0) (11 minus 1,46 kawałka od jego końca)
    const cam = { x: -1500, y: 500 };
    const v = { x0: -4000, y0: 400, x1: 1000, y1: 600 };
    const lista = widoczneKawalki(pola, SIZE, v, cam);
    expect(lista[0]).toEqual({ q: 2, k: 10 });
    expect(kandydaciTla(pola, SIZE, cam, false)[0]).toEqual({ q: 2, k: 10 });
  });

  it('numery kawałków kwadratów leżących na zachód i północ od domu (ujemne współrzędne) są poprawne', () => {
    const pola = [
      { q: 0, sx: 0, sy: 0 },
      { q: 2, sx: -1, sy: -1 },
    ];
    // okno wokół wspólnego rogu domu i kwadratu (−1, −1): w (−1, −1) to kawałek w prawym dolnym rogu (cx = cy = 11)
    const cam = { x: 0, y: 0 };
    const v = { x0: -100, y0: -100, x1: 100, y1: 100 };
    const lista = widoczneKawalki(pola, SIZE, v, cam);
    expect(lista).toContainEqual({ q: 2, k: 11 * N + 11 });
    expect(lista).toContainEqual({ q: 0, k: 0 });
    expect(lista).toHaveLength(2);
  });
});

describe('kandydaci do rysowania w tle', () => {
  it('sam dom: wszystkie kawałki w kolejności numerów, jak dotąd', () => {
    const lista = kandydaciTla([{ q: 0, sx: 0, sy: 0 }], SIZE, { x: 0, y: 0 }, true);
    expect(lista).toEqual(Array.from({ length: N * N }, (_, k) => ({ q: 0, k })));
  });

  it('wiele kwadratów: wszystkie kawałki każdego raz, od najbliższego kamerze', () => {
    const pola = [
      { q: 0, sx: 0, sy: 0 },
      { q: 1, sx: 1, sy: 0 },
      { q: 2, sx: 0, sy: 1 },
    ];
    const cam = { x: BOK - 10, y: 10 };
    const lista = kandydaciTla(pola, SIZE, cam, false);
    expect(lista).toHaveLength(3 * N * N);
    expect(new Set(lista.map((c) => `${c.q}:${c.k}`)).size).toBe(3 * N * N);
    // kawałek pod kamerą (q0, cx = 11, cy = 0), potem w odległości 1 w kolejności kwadratów i numerów kawałków
    expect(lista[0]).toEqual({ q: 0, k: 11 });
    expect(lista.slice(1, 4)).toEqual([
      { q: 0, k: 10 },
      { q: 0, k: N + 11 },
      { q: 1, k: 0 },
    ]);
    // niemalejąca odległość (Manhattan w kawałkach miasta)
    const dist = (c: { q: number; k: number }) => {
      const p = pola[c.q];
      const gx = p.sx * N + (c.k % N);
      const gy = p.sy * N + Math.floor(c.k / N);
      return Math.abs(gx - Math.floor(cam.x / SPAN)) + Math.abs(gy - Math.floor(cam.y / SPAN));
    };
    for (let i = 1; i < lista.length; i++) expect(dist(lista[i])).toBeGreaterThanOrEqual(dist(lista[i - 1]));
  });
});

describe('kwadraty na ekranie', () => {
  it('numery kwadratów przecinających okno, od najbliższego kamerze', () => {
    const pola = [
      { q: 0, sx: 0, sy: 0 },
      { q: 1, sx: 1, sy: 0 },
      { q: 2, sx: 0, sy: 1 },
      { q: 3, sx: 5, sy: 5 },
    ];
    const cam = { x: BOK - 100, y: BOK - 100 };
    const v = { x0: cam.x - 400, y0: cam.y - 300, x1: cam.x + 400, y1: cam.y + 300 };
    // okno przy wspólnym rogu domu, (1, 0) i (0, 1); kwadratu (1, 1) nie ma na liście
    expect(kwadratyNaEkranie(pola, SIZE, v, cam)).toEqual([0, 1, 2]);
    expect(kwadratyNaEkranie(pola, SIZE, { x0: 0, y0: 0, x1: 100, y1: 100 }, { x: 50, y: 50 })).toEqual([0]);
    expect(kwadratyNaEkranie(pola, SIZE, { x0: -999, y0: -999, x1: -900, y1: -900 }, { x: -950, y: -950 })).toEqual([]);
  });
});

/* ---------- GameView z kwadratami (bez przeglądarki: dodawanie kwadratów, szwy, kamera, mgła) ---------- */

describe('GameView: kwadraty obok domu', () => {
  const MALY = 64;
  const MBOK = MALY * TILE; // 2048

  function widok(w = 1440, h = 900): GameView {
    const v = new GameView();
    v.app = { screen: { width: w, height: h } } as unknown as Application;
    return v;
  }
  const dom = (budynki?: Parameters<typeof malaScena>[2]) => malaScena(1, MALY, budynki);

  it('dodajKwadrat zwraca kolejne numery od 1, ustawia sprite’y w układzie miasta i nie przyjmuje kwadratu dwa razy', () => {
    const v = widok();
    expect(() => v.dodajKwadrat(1, 0, malaScena(2))).toThrow(/setScene/);
    v.setScene(dom());
    expect(v.dodajKwadrat(1, 0, malaScena(2))).toBe(1);
    expect(v.dodajKwadrat(0, -1, malaScena(3))).toBe(2);
    expect(() => v.dodajKwadrat(1, 0, malaScena(4))).toThrow(/już jest/);
    expect(() => v.dodajKwadrat(0, 0, malaScena(4))).toThrow(/już jest/);
    expect(() => v.dodajKwadrat(5, 5, malaScena(4, 128))).toThrow(/rozmiar/);
    expect(v.kwadratyObok()).toEqual([
      { q: 1, sx: 1, sy: 0 },
      { q: 2, sx: 0, sy: -1 },
    ]);
    const polozenia = v.terrain.children.map((c) => [c.x, c.y]);
    expect(polozenia).toHaveLength(12);
    // dom: (0, 0), (1024, 0), (0, 1024), (1024, 1024); kwadrat (1, 0) o bok dalej na wschód; (0, −1) o bok na północ
    expect(polozenia.slice(0, 4)).toEqual([
      [0, 0],
      [1024, 0],
      [0, 1024],
      [1024, 1024],
    ]);
    expect(polozenia.slice(4, 8)).toEqual([
      [MBOK, 0],
      [MBOK + 1024, 0],
      [MBOK, 1024],
      [MBOK + 1024, 1024],
    ]);
    expect(polozenia.slice(8, 12)).toEqual([
      [0, -MBOK],
      [1024, -MBOK],
      [0, -MBOK + 1024],
      [1024, -MBOK + 1024],
    ]);
  });

  it('scena kwadratu dostaje początek w układzie miasta, jeśli budujący go nie podał', () => {
    const v = widok();
    v.setScene(dom());
    const k = malaScena(2);
    expect(k.poczatek).toBeUndefined();
    v.dodajKwadrat(-1, 2, k);
    expect(k.poczatek).toEqual({ x: -MBOK, y: 2 * MBOK });
    const j = malaScena(3);
    j.poczatek = { x: 7, y: 8 };
    v.dodajKwadrat(1, 1, j);
    expect(j.poczatek).toEqual({ x: 7, y: 8 });
  });

  it('szew z domem: oba kwadraty dostają pasy terenu sąsiada, a przerysowują się tylko kawałki przy wspólnej krawędzi', () => {
    const v = widok();
    const d = dom();
    v.setScene(d);
    const k = malaScena(2);
    // tekstury, których wersja ma się unieważnić
    const fake = {} as unknown as Texture;
    const slotDomu = (v as unknown as { slots: Array<{ ver: number; stale: number; far: Texture | null }> }).slots;
    for (const s of slotDomu) s.far = fake;
    v.dodajKwadrat(1, 0, k);
    expect(d.brzeg?.e).toEqual(Uint8Array.from({ length: MALY }, (_, y) => k.w.terr[y * MALY]));
    expect(k.brzeg?.w).toEqual(Uint8Array.from({ length: MALY }, (_, y) => d.w.terr[y * MALY + MALY - 1]));
    // 2 × 2 kawałki: kolumna cx = 1 domu (kawałki 1 i 3) dostaje nową wersję i jest nieaktualna, cx = 0 nie
    expect(slotDomu.map((s) => s.ver)).toEqual([0, 1, 0, 1]);
    expect(slotDomu.map((s) => s.stale)).toEqual([0, 2, 0, 2]);
    expect(d.brzeg?.n).toBeUndefined();
    expect(d.brzeg?.s).toBeUndefined();
  });

  it('narożnik: kwadrat po przekątnej dokłada tylko kod terenu za rogiem i unieważnia jeden kawałek', () => {
    const v = widok();
    const d = dom();
    v.setScene(d);
    const slotDomu = (v as unknown as { slots: Array<{ ver: number }> }).slots;
    const k = malaScena(2);
    v.dodajKwadrat(1, 1, k);
    expect(d.brzeg).toEqual({ se: k.w.terr[0] });
    expect(slotDomu.map((s) => s.ver)).toEqual([0, 0, 0, 1]);
    expect(k.brzeg).toEqual({ nw: d.w.terr[MALY * MALY - 1] });
  });

  it('budynek przecięty szwem poziomym: scena domu liczy fasadę od dołu całego budynku', () => {
    const v = widok();
    const d = dom([{ x0: 10, y0: 55, x1: 20, y1: 63 }]);
    v.setScene(d);
    const kolumna = 63 * MALY + 15;
    expect(d.south[kolumna]).toBe(0);
    v.dodajKwadrat(0, 1, malaScena(2, MALY, [{ x0: 10, y0: 0, x1: 20, y1: 5 }]));
    // budynek w kwadracie poniżej ma w tej kolumnie 6 kafelków: dolny kafelek domu ma ich pod sobą 6
    expect(d.south[kolumna]).toBe(6);
    expect(d.run[kolumna]).toBe(9 + 6);
    expect(d.south[55 * MALY + 15]).toBe(8 + 6);
  });

  it('malarz dostaje scenę kwadratu i łatki szwów z numerem kwadratu (dom bez numeru)', () => {
    const v = widok();
    const d = dom();
    v.setScene(d);
    const zapis: string[] = [];
    (v as unknown as { painter: unknown }).painter = {
      dodajScene: (q: number, sc: unknown) => zapis.push(`scena ${q} ${sc === k ? 'ta' : 'inna'}`),
      patch: (p: { q?: number; szwy?: Array<{ strona: string }> }) =>
        zapis.push(`łatka ${p.q ?? 'dom'} ${(p.szwy ?? []).map((x) => x.strona).join()}`),
      setScene: () => {},
      failed: false,
    };
    const k = malaScena(2);
    v.dodajKwadrat(1, 0, k);
    // kwadrat dostaje szew od domu po zachodniej stronie, dom od kwadratu po wschodniej
    expect(zapis).toEqual(['scena 1 ta', 'łatka 1 w', 'łatka dom e']);
  });

  it('ścięte drzewo domu przy szwie znika też z drzew obcych kwadratu obok', () => {
    const v = widok();
    const drzewo = { x: 62, y: 20, kind: 0 as const, r: 3.4, seed: 5 };
    const d = malaScena(1, MALY, [], [drzewo]);
    v.setScene(d);
    const k = malaScena(2);
    v.dodajKwadrat(1, 0, k);
    // drzewo domu 2 m od wschodniej krawędzi sięga kwadratu obok: jest w jego drzewach obcych (w jego układzie: x − 64)
    expect(k.obce?.flat().map((t) => [t.x, t.y, t.seed])).toContainEqual([62 - MALY, 20, 5]);
    v.redraw({ felled: [0] });
    expect(k.obce?.flat().length ?? 0).toBe(0);
    expect(k.brzeg?.drzewa?.w).toBeUndefined();
  });

  it('kamera mieści się w prostokącie kwadratów, a najmniejszy zoom pokazuje je wszystkie', () => {
    const v = widok(1440, 900);
    v.setScene(dom());
    v.cam = { x: -999, y: 99999, zoom: 1 };
    v.clampCam();
    expect([v.cam.x, v.cam.y]).toEqual([0, MBOK]);
    expect(v.minZoom).toBe(Math.min(1440, 900) / MBOK / 1.05);
    expect(v.maKwadraty).toBe(false);
    for (const [sx, sy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ])
      v.dodajKwadrat(sx, sy, malaScena(2));
    v.cam = { x: -99999, y: 99999, zoom: 1 };
    v.clampCam();
    expect([v.cam.x, v.cam.y]).toEqual([-MBOK, 2 * MBOK]);
    expect(v.minZoom).toBe(Math.min(1440 / (3 * MBOK), 900 / (3 * MBOK)) / 1.05);
    expect(v.srodek).toEqual({ x: MBOK / 2, y: MBOK / 2 });
    expect(v.maKwadraty).toBe(true);
  });

  it('kafelek pod punktem ekranu: poza domem −1, gdy są kwadraty obok; bez nich najbliższy kafelek brzegu jak dotąd', () => {
    const v = widok(1440, 900);
    v.setScene(dom());
    v.cam = { x: 1000, y: 1000, zoom: 1 };
    // środek ekranu (720, 450) to (1000, 1000) px, czyli kafelek (31, 31); punkt o 1100 px na lewo to x = −100
    expect(v.tileAt(720, 450)).toBe(31 * MALY + 31);
    expect(v.tileAt(-380, 450)).toBe(31 * MALY + 0);
    v.dodajKwadrat(-1, 0, malaScena(2));
    expect(v.tileAt(720, 450)).toBe(31 * MALY + 31);
    expect(v.tileAt(-380, 450)).toBe(-1);
    // także kwadrat, o który poproszono bez danych
    const w = widok();
    w.setScene(dom());
    w.cam = { x: 1000, y: 1000, zoom: 1 };
    w.dodajBrakDanych(0, -1);
    expect(w.tileAt(720, -2000)).toBe(-1);
  });

  it('kwadraty na ekranie: dom i sąsiad przy szwie, od najbliższego środkowi', () => {
    const v = widok(1440, 900);
    v.setScene(dom());
    v.dodajKwadrat(1, 0, malaScena(2));
    v.dodajKwadrat(0, 1, malaScena(3));
    v.cam = { x: MBOK, y: 1000, zoom: 0.5 };
    expect(v.kwadratyWidoczne()).toEqual([0, 1]);
    v.cam = { x: 3500, y: 1000, zoom: 1 };
    expect(v.kwadratyWidoczne()).toEqual([1]);
  });

  it('nowa scena domu zapomina kwadraty: numery znów od 1, sprite’y sąsiadów zniszczone', () => {
    const v = widok();
    v.setScene(dom());
    v.dodajKwadrat(1, 0, malaScena(2));
    v.dodajKwadrat(0, 1, malaScena(3));
    expect(v.terrain.children).toHaveLength(12);
    v.setScene(dom());
    expect(v.kwadratyObok()).toEqual([]);
    expect(v.terrain.children).toHaveLength(4);
    expect(v.maKwadraty).toBe(false);
    expect(v.dodajKwadrat(1, 0, malaScena(2))).toBe(1);
  });

  it('mgła: ring wokół odkrytych kwadratów, a kwadrat bez danych ma napis', () => {
    const v = widok();
    v.setScene(dom());
    expect(v.mgla.liczba).toBe(0);
    v.dodajBrakDanych(1, 0);
    // wokół domu i (1, 0): prostokąt 4 × 3 bez domu, a (1, 0) jest bez danych
    expect(v.mgla.liczba).toBe(11);
    expect(v.mgla.kwadraty.filter((p) => p.brakDanych)).toEqual([{ sx: 1, sy: 0, brakDanych: true }]);
    const w = widok();
    w.setScene(dom());
    for (const [sx, sy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ])
      w.dodajKwadrat(sx, sy, malaScena(2));
    expect(w.mgla.liczba).toBe(16);
    expect(w.mgla.kwadraty.some((p) => p.brakDanych)).toBe(false);
  });

  it('pamięć kawałków na starcie jest pusta', () => {
    const v = widok();
    v.setScene(dom());
    v.dodajKwadrat(1, 0, malaScena(2));
    expect(v.pamiecKawalkow()).toEqual({ bliskie: 0, dalekie: 0, bardzoDalekie: 0, kwadraty: 1 });
  });
});
