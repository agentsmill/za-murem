/* Duch planu wspólnego płotu w widoku (M2 fala 2, etap 3, docs/M2-fala-2.md): siatka przyszłego obwodu jako
   półprzezroczysty rysunek planu (art/duch.ts: jasny błękit, bo odcień tylko przyciemnia i ciemna siatka udawałaby
   gotową) w warstwie pionków sortowanej po y, a pod nią na ziemi niebieski ślad nowych kafelków (pod wszystkimi
   rzeczami i pionkami; z daleka mocniejszy, bo sprite'y siatki są wtedy drobne). Nad mapą światła postęp nad środkiem
   nowego płotu: procent pracy cyframi z pikseli i pasek materiałów (bursztynowy) i pracy (zielony) jak przy planach
   budowy, w stałym rozmiarze na ekranie, więc widać go w obu poziomach zbliżenia i nocą. Warstwa tylko czyta ducha
   z plotDuch.ts. */

import { BufferImageSource, type Container, Graphics, Sprite, Texture } from 'pixi.js';
import { napisPikselami } from './art/cyfry.ts';
import { duchSprite } from './art/duch.ts';
import { type ThingSpec, thingSprite } from './art/rzeczy.ts';
import { TILE } from './art/scene.ts';
import type { DuchPlotu } from './plotDuch.ts';

/** rysunek planu siatki: mocniej niż duch budowli, bo siatka jest cienka */
const ALPHA = 0.75;
/** ślad kafelków na ziemi: z daleka (kawałki 8 px na metr) mocniejszy niż z bliska */
const TRACE = 0x7fb0ff;
const TRACE_FAR = 0.6;
const TRACE_NEAR = 0.32;
const FAR_BELOW = 0.5;
/** postęp w pikselach ekranu: piksel cyfry, pasek i margines */
const DIGIT = 2;
const BAR_W = 40;
const PAD = 3;

export class PlotLayer {
  private readonly actors: Container;
  /** ślad nowych kafelków na ziemi (w pikselach grafiki), w warstwie pionków pod wszystkim */
  private readonly trace = new Graphics();
  /** postęp nad środkiem nowego płotu (w pikselach ekranu: skala 1 / zoom) */
  private readonly label = new Graphics();
  private sprites: Sprite[] = [];
  /** rysunki planu po opisie sprite'a siatki (maska, słupek) */
  private art = new Map<string, { tex: Texture; ax: number; ay: number }>();
  /** kafelki, z których są sprite'y i ślad (ten sam obiekt, dopóki duch ma ten sam kształt) */
  private shape: readonly number[] | null = null;
  private labelKey = '';
  /** szerokość mapy w kafelkach (do zamiany indeksów kafelków na pozycje) */
  mapSize = 1;

  constructor(actors: Container, overlay: Container) {
    this.actors = actors;
    // pod krwią (−1), rzeczami i pionkami
    this.trace.zIndex = -2;
    actors.addChild(this.trace);
    overlay.addChild(this.label);
  }

  /** ile sprite'ów ducha jest na mapie (do zrzutów) */
  get count(): number {
    return this.sprites.length;
  }

  update(d: DuchPlotu | null, zoom: number): void {
    if (!d) {
      this.clear();
      return;
    }
    if (d.tiles !== this.shape) this.build(d);
    this.trace.alpha = zoom < FAR_BELOW ? TRACE_FAR : TRACE_NEAR;
    const key = `${d.pct}:${Math.round(d.mats * BAR_W)}`;
    if (key !== this.labelKey) {
      this.labelKey = key;
      this.drawLabel(d);
    }
    const size = this.mapSize;
    const x = d.znak % size;
    const y = (d.znak - x) / size;
    this.label.position.set((x + 0.5) * TILE, y * TILE - 6);
    this.label.scale.set(1 / zoom);
    this.label.visible = true;
  }

  private build(d: DuchPlotu): void {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    for (const t of d.siatka) {
      if (!t.spec) continue;
      const art = this.artOf(t.spec);
      const s = new Sprite(art.tex);
      s.anchor.set(art.ax, art.ay);
      s.position.set((t.x + t.w / 2) * TILE, (t.y + t.h) * TILE);
      s.zIndex = t.y + t.h;
      s.alpha = ALPHA;
      this.actors.addChild(s);
      this.sprites.push(s);
    }
    const g = this.trace;
    g.clear();
    const size = this.mapSize;
    for (const i of d.tiles) {
      const x = i % size;
      const y = (i - x) / size;
      g.rect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6).fill(TRACE);
    }
    this.shape = d.tiles;
  }

  /** rysunek planu sprite'a (z pamięci); kotwica jak w gotowej rzeczy */
  private artOf(spec: ThingSpec): { tex: Texture; ax: number; ay: number } {
    const key = JSON.stringify(spec);
    let a = this.art.get(key);
    if (!a) {
      const sp = duchSprite(thingSprite(spec));
      const source = new BufferImageSource({
        resource: new Uint8Array(sp.px.buffer, sp.px.byteOffset, sp.px.byteLength),
        width: sp.w,
        height: sp.h,
        format: 'rgba8unorm',
        scaleMode: 'nearest',
        autoGarbageCollect: false,
      });
      a = { tex: new Texture({ source }), ax: sp.ax / sp.w, ay: sp.ay / sp.h };
      this.art.set(key, a);
    }
    return a;
  }

  /** procent pracy cyframi z pikseli nad paskiem materiałów i pracy; środek dolnej krawędzi w punkcie (0, 0) */
  private drawLabel(d: DuchPlotu): void {
    const g = this.label;
    g.clear();
    const text = napisPikselami(`${d.pct}%`);
    const tw = text.w * DIGIT;
    const th = text.h * DIGIT;
    const w = Math.max(tw, BAR_W) + 2 * PAD;
    const h = PAD + th + PAD + 6 + PAD;
    g.rect(-w / 2, -h, w, h).fill({ color: 0x15171a, alpha: 0.85 });
    const tx = -tw / 2;
    const ty = -h + PAD;
    for (const [px, py] of text.px) g.rect(tx + px * DIGIT, ty + py * DIGIT, DIGIT, DIGIT).fill(0xf2ead8);
    const bx = -BAR_W / 2;
    const by = -PAD - 6;
    g.rect(bx, by, BAR_W, 6).fill({ color: 0x2a2d31 });
    if (d.mats > 0) g.rect(bx, by, Math.max(1, Math.round(BAR_W * d.mats)), 3).fill(0xd8a040);
    if (d.pct > 0) g.rect(bx, by + 3, Math.max(1, Math.round((BAR_W * d.pct) / 100)), 3).fill(0x6fbf5a);
  }

  private clear(): void {
    if (!this.shape && !this.sprites.length) return;
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    this.shape = null;
    this.labelKey = '';
    this.trace.clear();
    this.label.clear();
    this.label.visible = false;
  }
}
