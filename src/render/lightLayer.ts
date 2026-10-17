/* Warstwa nocy w PixiJS: mapa światła z light.ts jako mała tekstura bez wygładzania, rozciągnięta
   nad widocznym kawałkiem świata i mnożona przez obraz (tryb multiply). Bufor rośnie tylko wtedy,
   gdy widok potrzebuje więcej komórek, więc przy zoomowaniu nie ma nowej tekstury co klatkę.
   W dzień warstwa jest ukryta i nic nie kosztuje. */

import { BufferImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import { gridFor, type Light, renderLightMap } from './light.ts';

export class LightLayer {
  readonly sprite = new Sprite();
  /** milisekundy liczenia mapy w ostatniej klatce (do pomiarów) */
  ms = 0;
  private capW = 0;
  private capH = 0;
  private buf = new Uint8Array(0);
  private acc = new Float32Array(0);
  private source: BufferImageSource | null = null;

  constructor() {
    this.sprite.blendMode = 'multiply';
    this.sprite.visible = false;
  }

  /**
   * Odświeża mapę dla widocznego prostokąta świata [x0, x1]×[y0, y1] (piksele grafiki).
   * d to ciemność 0..1, time sekundy (migotanie).
   */
  update(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    zoom: number,
    d: number,
    lights: readonly Light[],
    time: number,
  ) {
    if (d <= 0.002) {
      this.sprite.visible = false;
      this.ms = 0;
      return;
    }
    const t0 = performance.now();
    const g = gridFor(x0, y0, x1, y1, zoom);
    if (g.w > this.capW || g.h > this.capH || !this.source)
      this.grow(Math.max(g.w, this.capW), Math.max(g.h, this.capH));
    renderLightMap(this.buf, this.capW, this.acc, g, d, lights, time);
    this.source!.update();
    const tex = this.sprite.texture;
    if (tex.frame.width !== g.w || tex.frame.height !== g.h) {
      tex.frame.width = g.w;
      tex.frame.height = g.h;
      tex.update();
    }
    this.sprite.position.set(g.gx * g.cell, g.gy * g.cell);
    this.sprite.scale.set(g.cell);
    this.sprite.visible = true;
    this.ms = performance.now() - t0;
  }

  private grow(w: number, h: number) {
    // z zapasem, żeby przy zoomowaniu nie powiększać co klatkę
    this.capW = Math.ceil((w + 8) / 16) * 16;
    this.capH = Math.ceil((h + 8) / 16) * 16;
    this.buf = new Uint8Array(this.capW * this.capH * 4);
    this.acc = new Float32Array(this.capW * this.capH * 3);
    const old = this.sprite.texture;
    this.source = new BufferImageSource({
      resource: this.buf,
      width: this.capW,
      height: this.capH,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
      autoGarbageCollect: false,
    });
    this.sprite.texture = new Texture({ source: this.source, frame: new Rectangle(0, 0, 1, 1) });
    if (old !== Texture.EMPTY) old.destroy(true);
  }
}
