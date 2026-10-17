/* Warstwa dymu nad mapą światła: pula sprite'ów z pikselowymi kłębami (tekstury dla promieni 1..MAX_R
   w szarości, barwione tintem). W dzień jasnoszary, nocą chłodny i przygaszony, przy wylocie
   podświetlony od dołu ciepłym światłem ognia (tekstura jaśniejsza od spodu). Z daleka kłęby nie
   maleją poniżej kilku pikseli ekranu, więc dym z kozy widać z daleka. Kilkadziesiąt sprite'ów,
   bez rysowania po płótnie co klatkę. */

import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { h2 } from './art/hash.ts';
import { mix } from './art/palette.ts';
import { LIFE, type Puff, puffs, type SmokeSource } from './smoke.ts';

const MAX_R = 20;
/** najmniejszy kłąb na ekranie (piksele ekranu): z daleka dym się nie gubi */
const MIN_SCREEN_R = 3;
const DAY: Record<SmokeSource['kind'], number> = { koza: 0xdedcd6, ognisko: 0xc8c2b8 };
const NIGHT = 0x5c6272;
const WARM = 0xffa860;

/** kłąb: koło z poszarpanym, kropkowanym brzegiem; lit: jaśniejszy od spodu (ogień pod nim) */
function puffTexture(r: number, lit: boolean): Texture {
  const n = 2 * r + 1;
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x - r;
      const dy = y - r;
      const d = Math.hypot(dx, dy) / (r + 0.5);
      const edge = 1 - 0.18 * h2(x, y, 5101 + r);
      if (d > edge) continue;
      // brzeg w kratkę (miękko, ale pikselowo)
      if (d > edge - 0.22 && r > 1 && (x + y) % 2 === 0) continue;
      // światło z góry z lewej w dzień, od dołu przy ogniu
      const l = lit ? dy / (r + 0.5) : -(dx + dy) / (2 * (r + 0.5));
      const v = l > 0.25 ? 255 : l > -0.2 ? 222 : 190;
      const o = (y * n + x) * 4;
      px[o] = v;
      px[o + 1] = v;
      px[o + 2] = v;
      px[o + 3] = 255;
    }
  const source = new BufferImageSource({
    resource: px,
    width: n,
    height: n,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    autoGarbageCollect: false,
  });
  return new Texture({ source });
}

export class SmokeLayer {
  readonly container = new Container();
  private pool: Sprite[] = [];
  private day: Texture[] = [];
  private lit: Texture[] = [];
  /** źródła z poprzedniej klatki i zgaszone, które jeszcze dymią (chwila zgaszenia) */
  private live = new Map<string, SmokeSource>();
  private dying = new Map<string, { s: SmokeSource; off: number }>();
  private buf: Puff[] = [];

  constructor() {
    for (let r = 1; r <= MAX_R; r++) {
      this.day.push(puffTexture(r, false));
      this.lit.push(puffTexture(r, true));
    }
  }

  /** ile kłębów widać (do pomiarów i zrzutów) */
  count = 0;

  /**
   * Kłęby w chwili t (sekundy gry) ze źródeł z tej klatki; zgaszone dolatują do końca życia.
   * darkness: ciemność nocy 0..1, zoom: skala kamery.
   */
  update(sources: readonly SmokeSource[], t: number, darkness: number, zoom: number): void {
    const now = new Map(sources.map((s) => [s.key, s]));
    for (const [k, s] of this.live) if (!now.has(k)) this.dying.set(k, { s, off: t });
    for (const k of now.keys()) this.dying.delete(k);
    this.live = now;
    const out = this.buf;
    out.length = 0;
    const kinds: SmokeSource['kind'][] = [];
    for (const s of sources) {
      const from = out.length;
      puffs(s, t, out);
      for (let k = from; k < out.length; k++) kinds.push(s.kind);
    }
    for (const [k, d] of this.dying) {
      if (t > d.off + LIFE[d.s.kind] || t < d.off) {
        this.dying.delete(k);
        continue;
      }
      const from = out.length;
      puffs(d.s, t, out, d.off);
      for (let k2 = from; k2 < out.length; k2++) kinds.push(d.s.kind);
    }
    const minR = MIN_SCREEN_R / Math.max(0.05, zoom);
    for (let k = 0; k < out.length; k++) {
      const p = out[k];
      let sp = this.pool[k];
      if (!sp) {
        sp = new Sprite(this.day[0]);
        sp.anchor.set(0.5);
        this.pool.push(sp);
        this.container.addChild(sp);
      }
      const r = Math.max(1, Math.min(MAX_R, Math.round(Math.max(p.r, minR))));
      const warm = p.warm * darkness;
      sp.texture = (warm > 0.15 ? this.lit : this.day)[r - 1];
      sp.position.set(Math.round(p.x), Math.round(p.y));
      const base = mix(DAY[kinds[k]], NIGHT, darkness);
      sp.tint = mix(base, WARM, Math.min(1, warm * 1.5));
      sp.alpha = p.a * (0.72 - 0.1 * darkness);
      sp.visible = true;
    }
    for (let k = out.length; k < this.pool.length; k++) this.pool[k].visible = false;
    this.count = out.length;
  }
}
