/* Warstwa nocy w PixiJS: mapa światła z light.ts jako dwie małe tekstury bez wygładzania,
   rozciągnięte nad widocznym kawałkiem świata. Pierwsza mnoży obraz (ciemność i barwa świateł),
   druga dodaje nocną poświatę świateł. Bufory rosną tylko wtedy, gdy widok potrzebuje więcej
   komórek, więc przy zoomowaniu nie ma nowych tekstur co klatkę. W dzień warstwa jest ukryta
   i nic nie kosztuje. */

import { BufferImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import { gridFor, type Light, renderLightMap } from './light.ts';

export class LightLayer {
  /** mnożnik: ciemność i barwa świateł */
  readonly sprite = new Sprite();
  /** poświata świateł dodawana na wierzch */
  readonly glowSprite = new Sprite();
  /** milisekundy liczenia mapy w ostatniej klatce (do pomiarów) */
  ms = 0;
  private capW = 0;
  private capH = 0;
  private mul = new Uint8Array(0);
  private glow = new Uint8Array(0);
  private acc = new Float32Array(0);
  private sources: BufferImageSource[] = [];

  constructor() {
    this.sprite.blendMode = 'multiply';
    this.glowSprite.blendMode = 'add';
    this.sprite.visible = false;
    this.glowSprite.visible = false;
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
    inside?: (x: number, y: number) => boolean,
  ) {
    if (d <= 0.002) {
      this.sprite.visible = false;
      this.glowSprite.visible = false;
      this.ms = 0;
      return;
    }
    const t0 = performance.now();
    const g = gridFor(x0, y0, x1, y1, zoom);
    if (g.w > this.capW || g.h > this.capH || !this.sources.length)
      this.grow(Math.max(g.w, this.capW), Math.max(g.h, this.capH));
    renderLightMap(this.mul, this.glow, this.capW, this.acc, g, d, lights, time, 32, inside);
    for (const src of this.sources) src.update();
    for (const sp of [this.sprite, this.glowSprite]) {
      const tex = sp.texture;
      if (tex.frame.width !== g.w || tex.frame.height !== g.h) {
        tex.frame.width = g.w;
        tex.frame.height = g.h;
        tex.update();
      }
      sp.position.set(g.gx * g.cell, g.gy * g.cell);
      sp.scale.set(g.cell);
    }
    this.sprite.visible = true;
    this.glowSprite.visible = lights.length > 0;
    this.ms = performance.now() - t0;
  }

  private grow(w: number, h: number) {
    // z zapasem, żeby przy zoomowaniu nie powiększać co klatkę
    this.capW = Math.ceil((w + 8) / 16) * 16;
    this.capH = Math.ceil((h + 8) / 16) * 16;
    this.mul = new Uint8Array(this.capW * this.capH * 4);
    this.glow = new Uint8Array(this.capW * this.capH * 4);
    this.acc = new Float32Array(this.capW * this.capH * 6);
    this.sources = [];
    for (const [sp, buf] of [
      [this.sprite, this.mul],
      [this.glowSprite, this.glow],
    ] as const) {
      const old = sp.texture;
      const source = new BufferImageSource({
        resource: buf,
        width: this.capW,
        height: this.capH,
        format: 'rgba8unorm',
        scaleMode: 'nearest',
        autoGarbageCollect: false,
      });
      this.sources.push(source);
      // dynamic: ramka zmienia się przy zoomowaniu (bufor nie maleje), a sprite w PixiJS 8 przelicza
      // swój kształt po tex.update() tylko dla tekstur dynamicznych; bez tego po przybliżeniu z oddalenia
      // mapa światła miała rozmiar starej ramki i światła lądowały obok swoich miejsc
      sp.texture = new Texture({ source, frame: new Rectangle(0, 0, 1, 1), dynamic: true });
      if (old !== Texture.EMPTY) old.destroy(true);
    }
  }
}
