/* Widok gry w PixiJS 8: kamera, kawałki mapy w dwóch poziomach szczegółów, pionki.
   Rysowanie tylko czyta stan symulacji. Kawałki z bliska (32 px/kafelek) robią się na żądanie,
   najwyżej kilka na klatkę, i są wyrzucane, gdy jest ich za dużo. Z daleka (8 px/kafelek)
   są wszystkie, liczone na starcie. */

import { Application, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';
import type { Pawn, SimState } from '../sim/sim.ts';
import { drawChunk } from './art/chunkArt.ts';
import { FH, FRAMES, FW, LOOKS, makePeopleAtlas } from './art/people.ts';
import { CHUNK, type Scene, TILE } from './art/scene.ts';

const LOD_NEAR = 32;
const LOD_FAR = 8;
const MAX_NEAR = 48;

interface ChunkSlot {
  sprite: Sprite;
  near: Texture | null;
  far: Texture | null;
  used: number;
}

export interface Camera {
  /** środek widoku w pikselach grafiki */
  x: number;
  y: number;
  zoom: number;
}

export class GameView {
  app = new Application();
  root = new Container();
  terrain = new Container();
  marks = new Graphics();
  actors = new Container();
  night = new Graphics();
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  minZoom = 0.08;
  maxZoom = 3;
  scene: Scene | null = null;
  private slots: ChunkSlot[] = [];
  private frames: Texture[] = [];
  private pawnSprites = new Map<number, Sprite>();
  private prev = new Map<number, [number, number]>();
  private frameNo = 0;
  private nearIsLinear = false;
  /** milisekundy rysowania kawałków w ostatniej klatce */
  chunkMs = 0;
  chunksNear = 0;
  pendingFar = 0;
  /** czy wszystkie widoczne kawałki mają już właściwy poziom szczegółów */
  complete = false;

  async init(host: HTMLElement): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      resizeTo: host,
      background: '#16181a',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.classList.add('game-canvas');
    this.root.addChild(this.terrain, this.marks, this.actors);
    this.actors.sortableChildren = true;
    this.app.stage.addChild(this.root, this.night);
    const atlas = Texture.from(makePeopleAtlas());
    for (let look = 0; look < LOOKS; look++)
      for (let k = 0; k < 4 * FRAMES; k++)
        this.frames.push(new Texture({ source: atlas.source, frame: new Rectangle(k * FW, look * FH, FW, FH) }));
  }

  get width() {
    return this.app.screen.width;
  }
  get height() {
    return this.app.screen.height;
  }

  setScene(sc: Scene): void {
    for (const s of this.slots) {
      s.near?.destroy(true);
      s.far?.destroy(true);
      s.sprite.destroy();
    }
    this.slots = [];
    this.terrain.removeChildren();
    this.scene = sc;
    const n = sc.chunks;
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++) {
        const sprite = new Sprite();
        sprite.position.set(cx * CHUNK * TILE, cy * CHUNK * TILE);
        sprite.visible = false;
        this.terrain.addChild(sprite);
        this.slots.push({ sprite, near: null, far: null, used: 0 });
      }
    this.pendingFar = n * n;
    const side = sc.w.size * TILE;
    this.minZoom = Math.min(this.width, this.height) / side / 1.05;
  }

  /** z ekranu (piksele CSS) do pikseli grafiki */
  toWorld(sx: number, sy: number): [number, number] {
    const z = this.cam.zoom;
    return [(sx - this.width / 2) / z + this.cam.x, (sy - this.height / 2) / z + this.cam.y];
  }

  zoomAt(sx: number, sy: number, f: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    const z = Math.max(this.minZoom, Math.min(this.maxZoom, this.cam.zoom * f));
    this.cam.zoom = z;
    this.cam.x = wx - (sx - this.width / 2) / z;
    this.cam.y = wy - (sy - this.height / 2) / z;
    this.clampCam();
  }

  clampCam(): void {
    if (!this.scene) return;
    const side = this.scene.w.size * TILE;
    this.cam.x = Math.max(0, Math.min(side, this.cam.x));
    this.cam.y = Math.max(0, Math.min(side, this.cam.y));
  }

  private makeTex(cx: number, cy: number, s: number): Texture {
    const c = document.createElement('canvas');
    drawChunk(this.scene!, cx, cy, s, c);
    const t = Texture.from(c);
    t.source.scaleMode = s === LOD_FAR ? 'linear' : this.nearIsLinear ? 'linear' : 'nearest';
    return t;
  }

  /** dorabia kawałki: najpierw widoczne, w limicie czasu na klatkę */
  private updateChunks(budgetMs: number): void {
    const sc = this.scene!;
    const n = sc.chunks;
    const z = this.cam.zoom;
    const near = z >= 0.5;
    const linear = z < 1;
    if (linear !== this.nearIsLinear) {
      this.nearIsLinear = linear;
      for (const s of this.slots) if (s.near) s.near.source.scaleMode = linear ? 'linear' : 'nearest';
    }
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.width, this.height);
    const span = CHUNK * TILE;
    const cx0 = Math.max(0, Math.floor(x0 / span));
    const cy0 = Math.max(0, Math.floor(y0 / span));
    const cx1 = Math.min(n - 1, Math.floor(x1 / span));
    const cy1 = Math.min(n - 1, Math.floor(y1 / span));
    const t0 = performance.now();
    const ccx = (this.cam.x / span) | 0;
    const ccy = (this.cam.y / span) | 0;
    // kolejność: od środka ekranu
    const order: number[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push(cy * n + cx);
    order.sort((a, b) => {
      const da = Math.abs((a % n) - ccx) + Math.abs(((a / n) | 0) - ccy);
      const db = Math.abs((b % n) - ccx) + Math.abs(((b / n) | 0) - ccy);
      return da - db;
    });
    for (const s of this.slots) s.sprite.visible = false;
    let complete = true;
    for (const k of order) {
      const s = this.slots[k];
      const cx = k % n;
      const cy = (k / n) | 0;
      s.used = this.frameNo;
      if (near && !s.near && performance.now() - t0 < budgetMs) {
        s.near = this.makeTex(cx, cy, LOD_NEAR);
        this.chunksNear++;
      }
      if (!s.far && (!near || !s.near) && performance.now() - t0 < budgetMs) {
        s.far = this.makeTex(cx, cy, LOD_FAR);
        this.pendingFar--;
      }
      const tex = near && s.near ? s.near : s.far;
      if ((near && !s.near) || (!near && !s.far)) complete = false;
      if (tex) {
        if (s.sprite.texture !== tex) {
          s.sprite.texture = tex;
          s.sprite.scale.set(tex === s.far ? LOD_NEAR / LOD_FAR : 1);
        }
        s.sprite.visible = true;
      }
    }
    // reszta dalekich kawałków w tle, żeby oddalenie było od razu gotowe
    if (this.pendingFar > 0)
      for (let k = 0; k < this.slots.length && performance.now() - t0 < budgetMs; k++) {
        const s = this.slots[k];
        if (!s.far) {
          s.far = this.makeTex(k % n, (k / n) | 0, LOD_FAR);
          this.pendingFar--;
        }
      }
    // limit pamięci: najdawniej widziane bliskie kawałki idą do kosza
    if (this.chunksNear > MAX_NEAR) {
      const withNear = this.slots.filter((s) => s.near && s.used !== this.frameNo).sort((a, b) => a.used - b.used);
      for (const s of withNear.slice(0, this.chunksNear - MAX_NEAR)) {
        if (s.sprite.texture === s.near) s.sprite.texture = s.far ?? Texture.EMPTY;
        s.near!.destroy(true);
        s.near = null;
        this.chunksNear--;
      }
    }
    this.complete = complete;
    this.chunkMs = performance.now() - t0;
  }

  /** zapamiętuje pozycje przed krokiem symulacji (do płynnego ruchu między krokami) */
  beforeStep(st: SimState): void {
    for (const p of st.pawns) this.prev.set(p.id, [p.x, p.y]);
  }

  render(st: SimState, alpha: number, selected: ReadonlySet<number>, nightAlpha: number): void {
    if (!this.scene) return;
    this.frameNo++;
    const z = this.cam.zoom;
    this.root.scale.set(z);
    this.root.position.set(Math.round(this.width / 2 - this.cam.x * z), Math.round(this.height / 2 - this.cam.y * z));
    this.updateChunks(this.frameNo < 3 ? 400 : 10);
    // pionki
    const seen = new Set<number>();
    this.marks.clear();
    for (const p of st.pawns) {
      seen.add(p.id);
      let sp = this.pawnSprites.get(p.id);
      if (!sp) {
        sp = new Sprite(this.frames[0]);
        sp.anchor.set(0.5, 45 / FH);
        this.actors.addChild(sp);
        this.pawnSprites.set(p.id, sp);
      }
      const pv = this.prev.get(p.id);
      const x = pv ? pv[0] + (p.x - pv[0]) * alpha : p.x;
      const y = pv ? pv[1] + (p.y - pv[1]) * alpha : p.y;
      const moving = p.pi < p.path.length;
      const f = moving ? Math.floor(p.walk * 2.6) % FRAMES : 0;
      sp.texture = this.frames[(p.look % LOOKS) * 4 * FRAMES + p.dir * FRAMES + f];
      sp.position.set(Math.round(x * TILE), Math.round(y * TILE));
      sp.zIndex = y;
      if (selected.has(p.id)) this.markPawn(p, x, y);
    }
    for (const [id, sp] of this.pawnSprites)
      if (!seen.has(id)) {
        sp.destroy();
        this.pawnSprites.delete(id);
      }
    // noc (prototyp: przyciemnienie całego ekranu)
    this.night.clear();
    if (nightAlpha > 0.01) this.night.rect(0, 0, this.width, this.height).fill({ color: 0x0b1030, alpha: nightAlpha });
  }

  private markPawn(p: Pawn, x: number, y: number): void {
    const g = this.marks;
    g.ellipse(x * TILE, y * TILE - 2, 14, 6).stroke({ width: 2, color: 0xf2c94c, alpha: 0.95 });
    if (p.pi < p.path.length) {
      const size = this.scene!.w.size;
      const last = p.path[p.path.length - 1];
      const tx = ((last % size) + 0.5) * TILE;
      const ty = (Math.floor(last / size) + 0.5) * TILE;
      g.moveTo(x * TILE, y * TILE);
      for (let k = p.pi; k < p.path.length; k += 3) {
        const t = p.path[k];
        g.lineTo(((t % size) + 0.5) * TILE, (Math.floor(t / size) + 0.5) * TILE);
      }
      g.lineTo(tx, ty).stroke({ width: 2, color: 0xf2c94c, alpha: 0.4 });
      g.circle(tx, ty, 6).stroke({ width: 2, color: 0xf2c94c, alpha: 0.8 });
    }
  }

  /** pionek pod punktem ekranu (tylko rdzeń) */
  pick(st: SimState, sx: number, sy: number): Pawn | null {
    const [wx, wy] = this.toWorld(sx, sy);
    let best: Pawn | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const p of st.pawns) {
      if (p.kind !== 'core') continue;
      const dx = wx / TILE - p.x;
      const dy = wy / TILE - p.y;
      if (Math.abs(dx) > 0.6 || dy < -1.5 || dy > 0.4) continue;
      const d = Math.abs(dx) + Math.abs(dy + 0.6);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** kafelek pod punktem ekranu */
  tileAt(sx: number, sy: number): number {
    const [wx, wy] = this.toWorld(sx, sy);
    const size = this.scene!.w.size;
    const tx = Math.max(0, Math.min(size - 1, Math.floor(wx / TILE)));
    const ty = Math.max(0, Math.min(size - 1, Math.floor(wy / TILE)));
    return ty * size + tx;
  }
}
