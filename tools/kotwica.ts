/* Kotwica stylu z PixelLab obok grafiki rysowanej kodem, do npm run shots (scenariusze kotwica-*).
   Surowe pliki z assets/raw (opis, koszty, moduły bloku i naklejki dachu w assets/manifest.json) idą do strony
   jako data URL i do sceny Pixi tylko na czas zrzutu. Gra ich nie używa, dopóki Mateusz nie zatwierdzi kotwicy,
   a każdy obiekt ma dalej wersję rysowaną kodem. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { waitIdle } from './browser.ts';
import { decodePng, encodePng } from './png.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = (rel: string) => fs.readFileSync(path.join(ROOT, rel));
const png = (rel: string) => `data:image/png;base64,${file(rel).toString('base64')}`;
const json = <T>(rel: string) => JSON.parse(file(rel).toString('utf8')) as T;

/** kolejność kierunków postaci z PixelLab, od południa zgodnie z zegarem */
const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

/** jak z kawałka bloku składać fasady (assets/manifest.json, kotwica-blok.moduly), prostokąty w pikselach pliku */
interface Moduly {
  /** profil attyki [x, y, 1, n]: od zewnątrz do środka */
  attyka: [number, number, number, number];
  /** pas fasady: od wiersza y gzyms z górnym piętrem (gora wierszy), środkowe piętro [y, h], parter z cokołem [y, h] */
  fasada: { y: number; gora: number; pietro: [number, number]; dol: [number, number] };
  /** przęsła powtarzane wzdłuż ściany [x, w] */
  przesla: [number, number];
  /** wejście [x, w] i środek drzwi w nim */
  wejscie: [number, number];
  drzwi: number;
}

/** dach z kafelków papy (kotwica-blok-dach.uzycie): tło, szwy co [x, y] px, naklejki ze środków kafelków */
interface Dach {
  tlo: string;
  szwy: [number, number];
  naklejki: number[];
  wnetrze: [number, number, number, number];
  gestosc: number;
}

/** kolory ubrania postaci do przemalowania (tylko w tych wierszach, żeby nie ruszyć skóry dłoni i twarzy) */
interface Przemalowanie {
  kolory: string[];
  wiersze: [number, number];
}

interface Asset {
  id: string;
  co: string;
  narzedzie: string;
  koszt: number;
  status: string;
  wybrany?: string;
  moduly?: Moduly;
  uzycie?: Dach;
  przemalowanie?: Przemalowanie;
  pochodne?: { koszt: number }[];
}

/** paleta gry z kotwicy (assets/palette.json): kolory i rampy do przemalowań, od najciemniejszego */
interface Paleta {
  nazwa: string;
  kolory: string[];
  rampy: Record<string, string[]>;
}

interface Manifest {
  /** postacie zarządu i mieszkańców w kolejności obsadzania pionków (najpierw zarząd) */
  zarzad: string[];
  mieszkancy: string[];
  assety: Asset[];
}

interface WangTile {
  corners: Record<'NW' | 'NE' | 'SW' | 'SE', 'upper' | 'lower'>;
  bounding_box: { x: number; y: number };
}

/** wszystko, czego strona potrzebuje do podmiany: obrazki jako data URL i opis modułów */
export interface Kotwica {
  tileset: string;
  /** narożniki NW NE SW SE (1 = trawa) → miejsce kafelka w arkuszu */
  wang: { c: string; x: number; y: number }[];
  trzepak: string;
  /** wiersz pod stopami trzepaka (kotwica sprite'a) */
  stopy: number;
  /** obsada: najpierw zarząd, potem mieszkańcy; 8 kierunków od południa, wiersz pod stopami i przemalowania
      (te same 8 kierunków w kolejnych rampach palety) */
  ludzie: { kierunki: string[]; stopy: number; warianty: string[][] }[];
  /** ilu pierwszych z obsady to zarząd */
  zarzad: number;
  blok: string;
  moduly: Moduly;
  dach: Omit<Dach, 'naklejki'> & { naklejki: string[]; ciemny: string; jasny: string };
}

const manifest = () => json<Manifest>('assets/manifest.json');
const paleta = () => json<Paleta>('assets/palette.json');
const asset = (m: Manifest, id: string) => m.assety.find((a) => a.id === id)!;

/** wiersz pod najniższym nieprzezroczystym pikselem */
function stopy(rel: string): number {
  const { width, height, rgba } = decodePng(file(rel));
  for (let y = height - 1; y >= 0; y--) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3]) return y + 1;
  return height;
}

/** postać po dociągnięciu do palety, w danym kierunku */
const postac = (id: string, d: string) => `assets/raw/${id}/paleta/${d}.png`;

/** jasność koloru #rrggbb */
function jasnosc(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/**
 * Przemalowanie ubrania na inną rampę palety: najciemniejszy kolor ubrania przechodzi na pierwszy kolor rampy,
 * następny na drugi i tak dalej, tylko w wierszach ubrania. Z kilku postaci z PixelLab robi tłum bez kolejnych
 * generacji.
 */
export function przemaluj(rel: string, p: Przemalowanie, rampa: string[]): string {
  const { width, height, rgba } = decodePng(file(rel));
  const z = [...p.kolory].sort((a, b) => jasnosc(a) - jasnosc(b));
  const hex = (c: string) => Number.parseInt(c.slice(1), 16);
  const mapa = new Map(z.map((c, i) => [hex(c), hex(rampa[Math.min(i, rampa.length - 1)])]));
  const out = Uint8Array.from(rgba);
  for (let y = p.wiersze[0]; y < Math.min(height, p.wiersze[1]); y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = out[i + 3] ? mapa.get((out[i] << 16) | (out[i + 1] << 8) | out[i + 2]) : undefined;
      if (c === undefined) continue;
      out[i] = c >> 16;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
    }
  return `data:image/png;base64,${Buffer.from(encodePng(width, height, out)).toString('base64')}`;
}

/** kolory skóry, których przemalowanie nie rusza */
const SKORA = new Set(['#1a1c22', '#e0b48c', '#e3b79a']);

/**
 * Ubranie postaci bez opisu w manifeście: najczęstsze kolory tułowia (od 30 do 66% wysokości sylwetki w widoku
 * od południa) bez obrysu, skóry i kolorów głowy (włosy, czapka, cień twarzy), najwyżej cztery.
 */
function ubranie(id: string): Przemalowanie {
  const { width, height, rgba } = decodePng(file(postac(id, 'south')));
  let top = height;
  let bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (rgba[(y * width + x) * 4 + 3]) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
  const h = bottom - top;
  const liczby = (y0: number, y1: number) => {
    const n = new Map<string, number>();
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (!rgba[i + 3]) continue;
        const c = `#${[rgba[i], rgba[i + 1], rgba[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        n.set(c, (n.get(c) ?? 0) + 1);
      }
    return n;
  };
  const glowa = liczby(top, top + Math.round(h * 0.22));
  const kolory = [...liczby(top + Math.round(h * 0.3), top + Math.round(h * 0.66))]
    .filter(([c, n]) => n >= 8 && !SKORA.has(c) && (glowa.get(c) ?? 0) <= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c]) => c);
  return { kolory, wiersze: [top + Math.round(h * 0.27), top + Math.round(h * 0.75)] };
}

/** kafelki dachu w kolejności wariantów (PixelLab nazywa pliki od pierwszego opisu, numer wariantu na końcu) */
function dachowki(): string[] {
  const dir = 'assets/raw/kotwica-blok-dach';
  const nr = (f: string) => Number(/(\d+)\.png$/.exec(f)![1]);
  return fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.png'))
    .sort((a, b) => nr(a) - nr(b))
    .map((f) => `${dir}/${f}`);
}

export function kotwica(): Kotwica {
  const m = manifest();
  const pal = paleta();
  const blok = asset(m, 'kotwica-blok');
  const dach = asset(m, 'kotwica-blok-dach').uzycie!;
  const meta = json<{ tileset_data: { tiles: WangTile[] } }>('assets/raw/kotwica-chodnik-trawa/metadata.json');
  const kafle = dachowki();
  return {
    tileset: png('assets/raw/kotwica-chodnik-trawa/tileset.png'),
    wang: meta.tileset_data.tiles.map((t) => ({
      c: (['NW', 'NE', 'SW', 'SE'] as const).map((k) => (t.corners[k] === 'upper' ? 1 : 0)).join(''),
      x: t.bounding_box.x,
      y: t.bounding_box.y,
    })),
    trzepak: png('assets/raw/kotwica-trzepak/trzepak.png'),
    stopy: stopy('assets/raw/kotwica-trzepak/trzepak.png'),
    ludzie: [...m.zarzad, ...m.mieszkancy].map((id) => {
      const p = asset(m, id).przemalowanie ?? ubranie(id);
      return {
        kierunki: DIRS.map((d) => png(postac(id, d))),
        stopy: stopy(postac(id, 'south')),
        warianty: Object.values(pal.rampy).map((r) => DIRS.map((d) => przemaluj(postac(id, d), p, r))),
      };
    }),
    zarzad: m.zarzad.length,
    blok: png(blok.wybrany!),
    moduly: blok.moduly!,
    dach: {
      ...dach,
      naklejki: dach.naklejki.map((i) => png(kafle[i])),
      ciemny: pal.kolory[0],
      jasny: pal.kolory[2],
    },
  };
}

/** wycinek przy siedzibie w Lanciego: fasada z dachem (przekroj=0), podwórko z trzepakiem, zarząd, chodnik */
const KADR = { w: 960, h: 720, zoom: 2 };
const UI = '#top, #goals, #hint, #treeMark, #card, #box, #klatki, #arrive, .mapctl { display: none !important; }';

/** zarząd stoi przy trzepaku, reszta ludzi daleko, meble siedziby (przy przekroj=0 leżałyby na dachu) schowane */
async function ustaw(page: Page) {
  await page.evaluate(
    ([w, h, zoom]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const size = sim.w.size;
      const tz = sim.w.props.find((p) => p.kind === 'trzepak')!;
      // kierunki pionków: 0 południe, 1 północ, 2 zachód, 3 wschód
      const spots: [number, number, number][] = [
        [tz.x - 1.5, tz.y + 0.9, 3],
        [tz.x + 1.5, tz.y + 1.6, 0],
        [tz.x + 4.5, tz.y + 0.9, 2],
        [tz.x + 6, tz.y + 1.4, 0],
      ];
      let k = 0;
      for (const p of st.pawns) {
        const [x, y, dir] = p.kind === 'core' && k < spots.length ? spots[k++] : [1.5, 1.5, 0];
        Object.assign(p, { x, y, path: [], pi: 0, dir, job: null, carry: 0, wait: st.tick + 99999 });
      }
      const v = zm.view as unknown as {
        things: Map<string, { thing: { x: number; y: number }; inside: boolean }>;
        width: number;
        height: number;
      };
      for (const e of v.things.values())
        if (sim.w.bid[Math.floor(e.thing.y) * size + Math.floor(e.thing.x)] >= 0) e.inside = true;
      // kadr: nad trzepakiem kilka kafelków dachu, pod nim siatka i chodnik
      zm.setCam(tz.x + tz.w / 2 + 0.5, tz.y + 0.2, zoom);
      if (v.width !== w || v.height !== h) throw new Error(`płótno ${v.width}×${v.height} zamiast ${w}×${h}`);
    },
    [KADR.w, KADR.h, KADR.zoom] as const,
  );
}

/**
 * Podmiana w scenie Pixi na czas zrzutu: trawnik i chodnik z kafelków Wanga (podwójna siatka, żeby granica
 * terenów wypadła na krawędzi kafelka świata, z cieniami budynków jak w grze), bloki z modułów (dach z papy
 * z naklejkami i attyką, pas fasady z tyloma piętrami, ile ma budynek, i wejściem nad drzwiami), trzepak i zarząd
 * z różnych postaci.
 */
async function podmien(page: Page, k: Kotwica) {
  await page.evaluate(async (k) => {
    const T = 32;
    const zm = window.zm!;
    const sim = zm.sim!;
    const w = sim.w;
    const size = w.size;
    type Tex = { source: { scaleMode: string } };
    type Spr = {
      position: { set: (x: number, y: number) => void };
      anchor: { set: (x: number, y: number) => void };
      zIndex: number;
    };
    type Box = { addChild: (s: Spr) => void; children: { texture?: Tex; constructor: unknown }[] };
    const v = zm.view as unknown as {
      cam: { x: number; y: number; zoom: number };
      width: number;
      height: number;
      terrain: Box;
      actors: Box;
      things: Map<string, { thing: { kind: string }; inside: boolean }>;
      scene: { shadow: Uint8Array; styles: { levels: number }[] };
    };
    const load = (src: string) =>
      new Promise<HTMLImageElement>((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = fail;
        im.src = src;
      });
    const canvas = (cw: number, ch: number) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.imageSmoothingEnabled = false;
      return [c, g] as const;
    };
    const pixels = (im: HTMLImageElement) => {
      const [, g] = canvas(im.width, im.height);
      g.drawImage(im, 0, 0);
      return g.getImageData(0, 0, im.width, im.height);
    };
    const [sheet, trz, blok] = await Promise.all([k.tileset, k.trzepak, k.blok].map(load));
    // obsada: postać z PixelLab, potem ta sama w kolejnych przemalowaniach
    const wersje = [
      ...k.ludzie.map((l) => ({ kierunki: l.kierunki, stopy: l.stopy })),
      ...k.ludzie[0].warianty.flatMap((_, r) => k.ludzie.map((l) => ({ kierunki: l.warianty[r], stopy: l.stopy }))),
    ];
    const ludzie = await Promise.all(wersje.map((l) => Promise.all(l.kierunki.map(load))));
    const naklejki = (await Promise.all(k.dach.naklejki.map(load))).map(pixels);
    // klasy Pixi z sprite'a, który już jest w scenie (strona nie wystawia modułu pixi.js); tylko taki, którego
    // tekstura ma Texture.from, bo warstwy w actors (np. plotLayer) trzymają pod `texture` co innego
    const any = [...v.actors.children, ...v.terrain.children].find(
      (c) => typeof (c.texture as { constructor?: { from?: unknown } } | undefined)?.constructor?.from === 'function',
    )!;
    const SpriteC = any.constructor as new (t: Tex) => Spr;
    const TextureC = any.texture!.constructor as unknown as { from: (s: CanvasImageSource) => Tex };
    const sprite = (src: CanvasImageSource) => {
      const t = TextureC.from(src);
      t.source.scaleMode = 'nearest';
      return new SpriteC(t);
    };
    const mod = (a: number, n: number) => ((a % n) + n) % n;
    const hash = (a: number, b: number, s: number) => {
      let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 362437);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const rgb = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return [n >> 16, (n >> 8) & 255, n & 255, 255];
    };
    // widoczne kafelki z zapasem
    const z = v.cam.zoom;
    const tx0 = Math.max(0, Math.floor((v.cam.x - v.width / 2 / z) / T) - 1);
    const ty0 = Math.max(0, Math.floor((v.cam.y - v.height / 2 / z) / T) - 1);
    const tx1 = Math.min(size - 1, Math.ceil((v.cam.x + v.width / 2 / z) / T) + 1);
    const ty1 = Math.min(size - 1, Math.ceil((v.cam.y + v.height / 2 / z) / T) + 1);

    // teren: 1 trawa, 0 chodnik albo ścieżka, −1 reszta (zostaje z kodu); kody jak w src/world/terrain.ts
    const kind = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return -1;
      const t = w.terr[y * size + x];
      return t === 0 ? 1 : t === 4 || t === 5 ? 0 : -1;
    };
    const wang = new Map(k.wang.map((t) => [t.c, t]));
    const [gc, g] = canvas((tx1 - tx0 + 1) * T, (ty1 - ty0 + 1) * T);
    for (let y = ty0 - 1; y <= ty1; y++)
      for (let x = tx0 - 1; x <= tx1; x++) {
        const c = [kind(x, y), kind(x + 1, y), kind(x, y + 1), kind(x + 1, y + 1)];
        if (c.every((q) => q < 0)) continue;
        const key = c.map((q) => (q === 1 ? 1 : 0)).join('');
        const t = wang.get(key)!;
        // jednolity kafelek (sama trawa albo sam chodnik) odbity losowo, żeby nie było widać powtórzeń
        const flip = key === '0000' || key === '1111' ? Math.floor(hash(x, y, 1) * 4) : 0;
        g.save();
        g.translate((x - tx0) * T + T / 2 + (flip & 1 ? T : 0), (y - ty0) * T + T / 2 + (flip & 2 ? T : 0));
        g.scale(flip & 1 ? -1 : 1, flip & 2 ? -1 : 1);
        g.drawImage(sheet, t.x, t.y, T, T, 0, 0, T, T);
        g.restore();
      }
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) if (kind(x, y) < 0) g.clearRect((x - tx0) * T, (y - ty0) * T, T, T);
    // cienie budynków jak w kawałkach gry: oczka 8 px zmieszane z kolorem cienia (0,34)
    const S = size * 4;
    g.fillStyle = 'rgba(16, 22, 34, 0.34)';
    for (let y = ty0 * 4; y < (ty1 + 1) * 4; y++)
      for (let x = tx0 * 4; x < (tx1 + 1) * 4; x++)
        if (v.scene.shadow[y * S + x] && kind(x >> 2, y >> 2) >= 0) g.fillRect(x * 8 - tx0 * T, y * 8 - ty0 * T, 8, 8);
    const ground = sprite(gc);
    ground.position.set(tx0 * T, ty0 * T);
    v.terrain.addChild(ground);

    // bloki z modułów: pas fasady przy każdej południowej krawędzi (tyle pięter, ile ma budynek), nad nim papa
    // z attyką; domy, garaże i pawilony zostają z kodu
    const M = k.moduly;
    const src = pixels(blok).data;
    const [ax0, ay0, , attN] = M.attyka;
    const D = k.dach;
    const tlo = rgb(D.tlo);
    const ciemny = rgb(D.ciemny);
    const jasny = rgb(D.jasny);
    const [nx0, ny0, nw, nh] = D.wnetrze;
    /** kolor papy w punkcie: tło z szumem, szwy arkuszy, rzadko naklejka (piksele w kolorze tła przezroczyste) */
    const papa = (ax: number, ay: number): ArrayLike<number> => {
      const cx = Math.floor(ax / T);
      const cy = Math.floor(ay / T);
      if (hash(cx, cy, 2) < D.gestosc) {
        const n = naklejki[Math.floor(hash(cx, cy, 3) * naklejki.length)];
        const qx = mod(ax, T) - Math.floor(hash(cx, cy, 4) * (T - nw + 1));
        const qy = mod(ay, T) - Math.floor(hash(cx, cy, 5) * (T - nh + 1));
        if (qx >= 0 && qy >= 0 && qx < nw && qy < nh) {
          const j = ((ny0 + qy) * n.width + nx0 + qx) * 4;
          const p = n.data.subarray(j, j + 4);
          if (p[3] && (p[0] !== tlo[0] || p[1] !== tlo[1] || p[2] !== tlo[2])) return p;
        }
      }
      if (mod(ax, D.szwy[0]) === 0 || mod(ay, D.szwy[1]) === 0) return ciemny;
      const r = hash(ax, ay, 6);
      return r < 0.025 ? ciemny : r < 0.05 ? jasny : tlo;
    };
    /** wiersze kawałka bloku na pas fasady o tylu piętrach: gzyms z górnym piętrem, środkowe piętra, parter */
    const pas = (levels: number) => {
      const rows: number[] = [];
      const take = (y0: number, n: number) => {
        for (let r = 0; r < n; r++) rows.push(y0 + r);
      };
      // parterowy budynek: sam gzyms nad parterem
      take(M.fasada.y, levels > 1 ? M.fasada.gora : M.fasada.gora - M.fasada.pietro[1]);
      for (let n = 0; n < levels - 2; n++) take(M.fasada.pietro[0], M.fasada.pietro[1]);
      take(M.fasada.dol[0], M.fasada.dol[1]);
      return rows;
    };
    for (const b of w.buildings) {
      if (b.cls !== 'blok' || b.x1 < tx0 || b.x0 > tx1 || b.y1 < ty0 || b.y0 > ty1) continue;
      const rows = pas(v.scene.styles[b.id].levels);
      const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && w.bid[y * size + x] === b.id;
      const doors = b.entrances
        .filter((e) => e.dir === 'S')
        .map((e) => ({ x: (e.tile % size) * T + T / 2, bottom: (Math.floor(e.tile / size) + 1) * T }));
      const bx0 = Math.max(b.x0, tx0);
      const by0 = Math.max(b.y0, ty0);
      const bx1 = Math.min(b.x1, tx1);
      const by1 = Math.min(b.y1, ty1);
      const out = new ImageData((bx1 - bx0 + 1) * T, (by1 - by0 + 1) * T);
      for (let ty = by0; ty <= by1; ty++)
        for (let tx = bx0; tx <= bx1; tx++) {
          if (!inB(tx, ty)) continue;
          let below = 0;
          while (inB(tx, ty + below + 1)) below++;
          let above = 0;
          while (inB(tx, ty - above - 1)) above++;
          const bottom = (ty + below + 1) * T;
          const fh = Math.min(rows.length, (below + above + 1) * T - 8);
          const edgeN = !inB(tx, ty - 1);
          const edgeW = !inB(tx - 1, ty);
          const edgeE = !inB(tx + 1, ty);
          for (let py = 0; py < T; py++)
            for (let px = 0; px < T; px++) {
              const ax = tx * T + px;
              const ay = ty * T + py;
              const fy = bottom - 1 - ay;
              const i = ((ay - by0 * T) * out.width + (ax - bx0 * T)) * 4;
              let sx: number;
              let sy: number;
              if (fy < fh) {
                // fasada: wiersz pasa od dołu; przęsła po x świata, nad drzwiami wejście
                sy = rows[rows.length - 1 - fy];
                const d = doors.find(
                  (q) => q.bottom === bottom && ax >= q.x - M.drzwi && ax < q.x - M.drzwi + M.wejscie[1],
                );
                sx = d ? M.wejscie[0] + ax - (d.x - M.drzwi) : M.przesla[0] + mod(ax, M.przesla[1]);
              } else {
                const e = Math.min(edgeN ? py : T, edgeW ? px : T, edgeE ? T - 1 - px : T);
                if (e >= attN) {
                  out.data.set(papa(ax, ay), i);
                  continue;
                }
                sx = ax0;
                sy = ay0 + e;
              }
              const j = (sy * blok.width + sx) * 4;
              out.data.set(src.subarray(j, j + 4), i);
            }
        }
      const [oc, og] = canvas(out.width, out.height);
      og.putImageData(out, 0, 0);
      const house = sprite(oc);
      house.position.set(bx0 * T, by0 * T);
      v.terrain.addChild(house);
    }

    // trzepak: z kodu schowany, z PixelLab stopami tam, gdzie stopy betonowe z kodu (wiersz 20 kafelka)
    const tz = w.props.find((p) => p.kind === 'trzepak')!;
    for (const e of v.things.values()) if (e.thing.kind === 'trzepak') e.inside = true;
    const ts = sprite(trz);
    ts.anchor.set(0.5, k.stopy / trz.height);
    ts.position.set((tz.x + tz.w / 2) * T, tz.y * T + 20);
    ts.zIndex = tz.y + tz.h;
    v.actors.addChild(ts);

    // ludzie: zarząd dostaje pierwsze postacie z obsady, mieszkańcy następne, a gdy postaci zabraknie, idą ich
    // przemalowania; kierunek jak pionek z kodu (0 południe, 1 północ, 2 zachód, 3 wschód), pionek z kodu poza kadrem
    const face = [0, 4, 6, 2];
    const kolej = [
      ...sim.st.pawns.filter((p) => p.kind === 'core'),
      ...sim.st.pawns.filter((p) => p.kind === 'resident'),
    ];
    let zw = 0;
    let mw = k.zarzad;
    for (const p of kolej) {
      const z = p.kind === 'core' ? zw++ % k.zarzad : mw++ % ludzie.length;
      const im = ludzie[z][face[p.dir]];
      const s = sprite(im);
      s.anchor.set(0.5, wersje[z].stopy / im.height);
      s.position.set(Math.round(p.x * T), Math.round(p.y * T));
      s.zIndex = p.y;
      v.actors.addChild(s);
      Object.assign(p, { x: 1.5, y: 1.5 });
    }
  }, k);
}

/** ten sam kadr gry dziś i z kotwicą z PixelLab, obok siebie; ustawKadr przygotowuje kadr przed oboma zrzutami */
async function przedPo(page: Page, base: string, query: string, ustawKadr: (page: Page) => Promise<void>, po: string) {
  await page.setViewportSize({ width: KADR.w, height: KADR.h });
  await page.goto(`${base}?${query}`);
  await waitIdle(page);
  await page.addStyleTag({ content: UI });
  await ustawKadr(page);
  await waitIdle(page);
  const a = (await page.screenshot()).toString('base64');
  await podmien(page, kotwica());
  await waitIdle(page);
  const b = (await page.screenshot()).toString('base64');
  // gra przestaje chodzić w tle, zanim strona dostanie zestawienie
  await page.goto('about:blank');
  await page.setViewportSize({ width: KADR.w * 2 + 12, height: KADR.h + 40 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #1a1c22; color: #e3e0d6; font: 600 15px/1 system-ui, sans-serif; display: flex; gap: 12px; }
    figure { margin: 0; } figcaption { height: 40px; display: flex; align-items: center; padding-left: 12px; }
    img { display: block; }
  </style>
  <figure><figcaption>Dziś: grafika rysowana kodem</figcaption><img src="data:image/png;base64,${a}"></figure>
  <figure><figcaption>${po}</figcaption><img src="data:image/png;base64,${b}"></figure>`);
}

/** podwórko siedziby w Lanciego: fasada z dachem, trawnik, trzepak, zarząd i chodnik */
export const kotwicaStylu = (page: Page, base: string) =>
  przedPo(
    page,
    base,
    'demo=lanciego&speed=0&cam=hq,1&przekroj=0',
    ustaw,
    'Kotwica z PixelLab: trawnik z chodnikiem, trzepak, zarząd, blok',
  );

/** tłum przy siedzibie: zarząd i dosztukowani mieszkańcy (kopie pionka mieszkańca, każdy w innym wyglądzie z kodu)
    na wolnych kafelkach trawy i chodnika wokół trzepaka, od najbliższych */
async function ustawTlum(page: Page, ile: number) {
  await page.evaluate(
    ([ile, zoom]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const w = sim.w;
      const size = w.size;
      const tz = w.props.find((p) => p.kind === 'trzepak')!;
      const wolne: [number, number][] = [];
      for (let y = tz.y - 1; y <= tz.y + 6; y++)
        for (let x = tz.x - 7; x <= tz.x + 10; x++) {
          const i = y * size + x;
          const t = w.terr[i];
          if ((x + y) % 2 || sim.blocked[i] || !(t === 0 || t === 4 || t === 5)) continue;
          if (y === tz.y && x >= tz.x && x < tz.x + tz.w) continue;
          wolne.push([x, y]);
        }
      const d = (q: [number, number]) => Math.hypot(q[0] - tz.x - 1, q[1] - tz.y - 2);
      wolne.sort((a, b) => d(a) - d(b));
      const ludzie = () => st.pawns.filter((p) => p.kind === 'core' || p.kind === 'resident');
      const wzor = st.pawns.find((p) => p.kind === 'resident')!;
      let id = Math.max(...st.pawns.map((p) => p.id)) + 1;
      while (ludzie().length < ile) st.pawns.push({ ...wzor, id: id++ });
      ludzie().forEach((p, k) => {
        const [x, y] = wolne[k % wolne.length];
        Object.assign(p, {
          x: x + 0.3 + ((k * 7) % 5) / 10,
          y: y + 0.6,
          path: [],
          pi: 0,
          dir: [0, 3, 0, 2, 0, 1][k % 6],
          job: null,
          carry: 0,
          wait: st.tick + 99999,
          look: k % 16,
          away: false,
        });
      });
      // meble siedziby (przy przekroj=0 leżałyby na dachu) schowane jak na podwórku
      const v = zm.view as unknown as { things: Map<string, { thing: { x: number; y: number }; inside: boolean }> };
      for (const e of v.things.values())
        if (w.bid[Math.floor(e.thing.y) * size + Math.floor(e.thing.x)] >= 0) e.inside = true;
      zm.setCam(tz.x + 1.5, tz.y + 2, zoom);
    },
    [ile, 1.5] as const,
  );
}

/** tyle osób w kadrze z tłumem: więcej niż postaci w obsadzie, żeby było widać przemalowania */
const TLUM = 36;

/** tłum na podwórku: pionki z kodu (16 wyglądów) i ta sama liczba osób z obsady PixelLab i jej przemalowań */
export const kotwicaTlum = (page: Page, base: string) =>
  przedPo(
    page,
    base,
    'demo=lanciego&speed=0&cam=hq,1&przekroj=0',
    (p) => ustawTlum(p, TLUM),
    `Kotwica z PixelLab: ${TLUM} osób z ${kotwica().ludzie.length} postaci i ich przemalowań`,
  );

/** najwyższy blok w Lanciego od strony wejścia: moduły piętra składają się do każdej wysokości */
export const kotwicaWysokiBlok = (page: Page, base: string) =>
  przedPo(
    page,
    base,
    'demo=lanciego&speed=0',
    async (p) => {
      const pietra = await p.evaluate(() => {
        const zm = window.zm!;
        const w = zm.sim!.w;
        const bloki = w.buildings.filter(
          (b) => b.cls === 'blok' && b.id !== w.hq && b.entrances.some((e) => e.dir === 'S'),
        );
        const b = bloki.sort((a, c) => c.levels - a.levels)[0];
        const e = b.entrances.find((q) => q.dir === 'S')!;
        zm.setCam((e.tile % w.size) + 0.5, Math.floor(e.tile / w.size) - 4, 1.25);
        return b.levels;
      });
      if (pietra < 9) throw new Error(`najwyższy blok ma tylko ${pietra} pięter`);
    },
    'Kotwica z PixelLab: najwyższy blok osiedla z tych samych modułów piętra',
  );

/** arkusz kotwicy: zatwierdzone assety w powiększeniu, z narzędziem i kosztem, zarząd z przemalowaniami, paleta */
export async function kotwicaArkusz(page: Page) {
  const m = manifest();
  const k = kotwica();
  const koszt = (a: Asset) => a.koszt + (a.pochodne ?? []).reduce((s, p) => s + p.koszt, 0);
  const gen = (n: number) => `${n.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} gen.`;
  const opis = (id: string, co: string) => {
    const a = asset(m, id);
    return `<h2>${co}<small>${a.narzedzie} · ${gen(koszt(a))}</small></h2>`;
  };
  const img = (src: string, zoom: number) => `<img src="${src}" style="zoom:${zoom}">`;
  const pal = paleta();
  const rampy = Object.keys(pal.rampy);
  const zarzad = m.zarzad.map((id, i) => {
    const a = asset(m, id);
    const l = k.ludzie[i];
    const warianty = rampy.map((n, r) => `<figure>${img(l.warianty[r][0], 2)}<figcaption>${n}</figcaption></figure>`);
    return `<div class="row"><div>${opis(id, a.co)}${l.kierunki.map((s) => img(s, 2)).join('')}</div>
      <div><h2>Przemalowania w kodzie<small>0 gen.</small></h2>${warianty.join('')}</div></div>`;
  });
  const mieszkancy = m.mieszkancy.map(
    (id, i) =>
      `<figure>${img(k.ludzie[k.zarzad + i].kierunki[0], 2)}<figcaption>${asset(m, id).co}</figcaption></figure>`,
  );
  const wybrane = [
    'kotwica-chodnik-trawa',
    'kotwica-trzepak',
    ...m.zarzad,
    ...m.mieszkancy,
    'kotwica-blok',
    'kotwica-blok-dach',
  ];
  const naKotwice = wybrane.reduce((s, id) => s + koszt(asset(m, id)), 0);
  const razem = m.assety.reduce((s, a) => s + koszt(a), 0);
  const kafle = dachowki().map((f) => img(png(f), 2));
  await page.setViewportSize({ width: 1440, height: 1630 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px 32px; background: #26292e; color: #e3e0d6; font: 14px/1.4 system-ui, sans-serif; }
    h1 { font-size: 22px; margin: 0 0 4px; } p { margin: 0 0 18px; color: #b7b2a6; }
    h2 { font-size: 15px; margin: 0 0 8px; } h2 small { display: block; font-weight: 400; color: #9a958a; }
    img { image-rendering: pixelated; vertical-align: bottom; }
    figure { display: inline-block; margin: 0 6px 0 0; text-align: center; }
    figcaption { font-size: 11px; color: #9a958a; }
    .row { display: flex; gap: 40px; margin-bottom: 18px; align-items: flex-start; }
    .ludzie { display: grid; grid-template-columns: repeat(10, 128px); gap: 4px 0; margin-bottom: 18px; }
    .ludzie figcaption { width: 120px; }
    .tiles { display: grid; grid-template-columns: repeat(4, 64px); gap: 6px; }
    .pal { display: grid; grid-template-columns: repeat(16, 76px); gap: 4px; }
    .pal div { height: 40px; font: 11px/1 ui-monospace, monospace; display: flex; align-items: flex-end; padding: 3px; }
  </style>
  <h1>Kotwica stylu z PixelLab, zatwierdzona 18.10.2026</h1>
  <p>Wybrane assety: ${gen(naKotwice)} Razem z odrzuconymi próbami ${gen(razem)} z 2000 w abonamencie, 0 USD. Każda następna postać to 2 gen., warianty kolorów ubrań robi kod za darmo. Szczegóły w assets/manifest.json.</p>
  ${zarzad.join('')}
  ${mieszkancy.length ? `<h2>Mieszkańcy: ${mieszkancy.length} postaci<small>create_character v3 · po 2 gen.</small></h2><div class="ludzie">${mieszkancy.join('')}</div>` : ''}
  <div class="row">
    <div>${opis('kotwica-trzepak', 'Trzepak 96×64')}${img(k.trzepak, 2)}</div>
    <div>${opis('kotwica-chodnik-trawa', 'Chodnik i trawnik, 16 kafelków 32 px')}${img(k.tileset, 2)}</div>
    <div>${opis('kotwica-blok', 'Kawałek bloku, 13 px na piętro (gra ma dziś 9)')}${img(k.blok, 2)}</div>
    <div>${opis('kotwica-blok-dach', 'Dach: 16 wariantów papy')}<div class="tiles">${kafle.join('')}</div></div>
  </div>
  <h2>Paleta ${pal.nazwa} (assets/palette.json), 32 kolory z palette.ts</h2>
  <div class="pal">${pal.kolory
    .map(
      (c) =>
        `<div style="background:${c};color:${Number.parseInt(c.slice(1, 3), 16) > 150 ? '#1a1c22' : '#e3e0d6'}">${c}</div>`,
    )
    .join('')}</div>`);
}
