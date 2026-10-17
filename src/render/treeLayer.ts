/* Drzewa z bliska jako sprite'y w warstwie pionków, sortowane po y pnia razem z pionkami i rzeczami:
   pionek za drzewem chowa się za koroną, przed drzewem stoi przed nią. Bliskie kawałki mapy
   (32 px na kafelek, także przekrój) rysują już tylko cień drzewa, dalekie (8 px) mają drzewa
   w sobie, więc przy oddaleniu sprite'ów nie ma i nic nie kosztują. Suche drzewo z grafiki
   zastępczej, ścięte (treeGone) znikają. Za koroną ktoś z zarządu nie ginie: widok rysuje jego
   zarys na wierzchu (covering mówi, czy punkt leży za którąś z koron). */

import { BufferImageSource, type Container, Sprite, Texture } from 'pixi.js';
import type { Tree } from '../world/world.ts';
import { deadTreeSprite } from './art/rzeczy.ts';
import type { ChunkScene } from './art/scene.ts';
import { treeKey, treeReady, treeSprite } from './art/trees.ts';

const TILE = 32;
/** nowych tekstur drzew na klatkę (zwykle kilkadziesiąt wyglądów na całą mapę) */
const NEW_PER_FRAME = 12;

interface Art {
  tex: Texture;
  /** pień w pikselach tekstury */
  ax: number;
  ay: number;
  w: number;
  h: number;
}

/**
 * Czy pionek stojący w (x, y) metrów chowa się za koroną: stoi na północ od pnia, a stopy ma poniżej
 * górnego brzegu korony (środek korony jest o lift nad pniem), w jej szerokości z zapasem na pionka.
 */
export function behindCrown(t: Tree, x: number, y: number): boolean {
  const lift = t.kind === 2 ? 0.3 : 1.2;
  return y < t.y && t.y - y < t.r + lift + 0.3 && Math.abs(x - t.x) < t.r + 0.4;
}

export class TreeLayer {
  private sprites = new Map<number, Sprite>();
  private arts = new Map<string, Art>();
  /** drzewa z widocznych kawałków (liczone od nowa, gdy zmieni się zestaw kawałków) */
  private wanted: number[] = [];
  private sig = '';
  private linear = false;
  private trees: readonly Tree[] = [];
  /** drzewa czekające na teksturę (limit nowych tekstur na klatkę) */
  pending = false;

  private readonly layer: Container;

  constructor(layer: Container) {
    this.layer = layer;
  }

  /** ile sprite'ów drzew widać (do pomiarów i zrzutów) */
  get count(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.visible) n++;
    return n;
  }

  /** czy punkt (metry) leży za koroną któregoś z widocznych drzew */
  covering(x: number, y: number): boolean {
    for (const [k, sp] of this.sprites) if (sp.visible && behindCrown(this.trees[k], x, y)) return true;
    return false;
  }

  /**
   * Drzewa z kawałków order jako sprite'y; near false (z daleka) chowa je wszystkie. linear:
   * wygładzanie jak w bliskich kawałkach (przy zoomie poniżej 1).
   */
  update(sc: ChunkScene, order: readonly number[], near: boolean, linear: boolean): void {
    this.trees = sc.w.trees;
    if (!near) {
      for (const s of this.sprites.values()) s.visible = false;
      this.pending = false;
      return;
    }
    if (linear !== this.linear) {
      this.linear = linear;
      for (const a of this.arts.values()) a.tex.source.scaleMode = linear ? 'linear' : 'nearest';
    }
    const sig = order.join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      const set = new Set<number>();
      for (const k of order) for (const t of sc.treesBy[k]) set.add(t);
      this.wanted = [...set];
      const keep = new Set(this.wanted);
      for (const [k, s] of this.sprites)
        if (!keep.has(k)) {
          s.destroy();
          this.sprites.delete(k);
        }
    }
    const trees = sc.w.trees;
    let fresh = 0;
    this.pending = false;
    for (const k of this.wanted) {
      let sp = this.sprites.get(k);
      if (sc.treeGone[k]) {
        if (sp) {
          sp.destroy();
          this.sprites.delete(k);
        }
        continue;
      }
      const t = trees[k];
      if (!sp) {
        const dry = k === sc.dryTree;
        const key = dry ? `suche:${k}` : treeKey(t);
        let art = this.arts.get(key);
        if (!art) {
          if (!dry && !treeReady(t) && fresh >= NEW_PER_FRAME) {
            this.pending = true;
            continue;
          }
          fresh++;
          art = dry ? deadArt(t) : liveArt(t);
          art.tex.source.scaleMode = this.linear ? 'linear' : 'nearest';
          this.arts.set(key, art);
        }
        sp = new Sprite(art.tex);
        // lewy górny róg na całym pikselu: ostre piksele przy ruchu kamery
        sp.position.set(Math.round(t.x * TILE - art.ax), Math.round(t.y * TILE - art.ay));
        sp.zIndex = t.y;
        this.layer.addChild(sp);
        this.sprites.set(k, sp);
      }
      sp.visible = true;
    }
  }
}

/** żywe drzewo: płótno z trees.ts (to samo co w kawałkach) */
function liveArt(t: Tree): Art {
  const sp = treeSprite(t);
  const tex = Texture.from(sp.canvas as HTMLCanvasElement);
  return { tex, ax: sp.ax, ay: sp.ay, w: sp.canvas.width, h: sp.canvas.height };
}

/** suche drzewo z grafiki zastępczej (piksele rgba) */
function deadArt(t: Tree): Art {
  const sp = deadTreeSprite(t);
  const source = new BufferImageSource({
    resource: new Uint8Array(sp.px.buffer, sp.px.byteOffset, sp.px.byteLength),
    width: sp.w,
    height: sp.h,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    autoGarbageCollect: false,
  });
  return { tex: new Texture({ source }), ax: sp.ax, ay: sp.ay, w: sp.w, h: sp.h };
}
