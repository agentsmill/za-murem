/* Widok gry w PixiJS 8: kamera, kawałki mapy w dwóch poziomach szczegółów, pionki, noc.
   Rysowanie tylko czyta stan symulacji. Kawałki rysują na zamówienie workery (OffscreenCanvas),
   a bez nich główny wątek w limicie czasu na klatkę. Z bliska (32 px/kafelek) tylko widoczne,
   wyrzucane, gdy jest ich za dużo. Z daleka (8 px/kafelek) wszystkie, zamawiane na starcie.
   Noc to mapa światła nad światem (light.ts), mnożona przez obraz. Przekrój: przy zbliżeniu
   kawałki nad budynkiem z wnętrzem (scene.section) rysują się z wnętrzem zamiast dachu, a meble
   stoją w jednej warstwie z pionkami, sortowane po y. */

import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  type TextureSource,
  TextureStyle,
} from 'pixi.js';
import { minutesAt, TICKS_PER_SECOND } from '../sim/clock.ts';
import type { Pawn, SimState } from '../sim/sim.ts';
import { FH, frameRect, LIE, LOOKS, lieHead, lieRect, makePeopleAtlas, POSES } from './art/people.ts';
import { type Sprite as ArtSprite, FIRE_FRAMES, type ThingSpec, thingSprite } from './art/rzeczy.ts';
import { CHUNK, type Scene, TILE } from './art/scene.ts';
import {
  type ChunkPainter,
  chunksByDistance,
  chunksTouched,
  type Done,
  InlinePainter,
  LOD_FAR,
  LOD_NEAR,
  type MapChange,
  planOrders,
  poolSize,
  scenePatchOf,
  spawnChunkWorker,
  WorkerPainter,
  workersAvailable,
} from './chunks.ts';
import {
  fenceCodes,
  fenceStateFn,
  GAME_KINDS,
  type GameLike,
  gameLights,
  HEAPS,
  onTables,
  STRANGERS,
  strangerVisibility,
  type WindowSpot,
  windowSpots,
} from './game.ts';
import { darknessAt, type Light, lightAt } from './light.ts';
import { LightLayer } from './lightLayer.ts';
import { FeedWatch, type PoseView, poseOf } from './poses.ts';
import { burning, IN, specOf, type ThingLike } from './section.ts';
import { smokeSources } from './smoke.ts';
import { SmokeLayer } from './smokeLayer.ts';
import { fenceThings, mockWrecks } from './yard.ts';

const PHONE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** nowych tekstur rzeczy na klatkę (wrak to około 1 ms): reszta w następnych, bez zacięcia na starcie */
const NEW_ART_PER_FRAME = 8;
/** limit bliskich kawałków w pamięci (każdy to 4 MB tekstury i 4 MB płótna albo ImageBitmap);
    na telefonach mniej, bo Safari ma twardy limit pamięci płócien */
const MAX_NEAR = PHONE ? 16 : 48;
/** przekrój włącza się od tego zoomu, a wyłącza dopiero poniżej CUT_OFF (bez mrugania na granicy) */
export const CUT_ON = 0.6;
const CUT_OFF = 0.55;

interface ChunkSlot {
  sprite: Sprite;
  near: Texture | null;
  far: Texture | null;
  /** przekrój z bliska: wnętrze zamiast dachu (tylko kawałki nad budynkiem z wnętrzem) */
  cut: Texture | null;
  used: number;
  /** wersja: rośnie po każdej zmianie na mapie w tym kawałku */
  ver: number;
  /** tekstury sprzed zmiany (bity NEAR_BIT, FAR_BIT, CUT_BIT): widać je, dopóki nie przyjdą nowe */
  stale: number;
}

const NEAR_BIT = 1;
const FAR_BIT = 2;
const CUT_BIT = 4;
const bitOf = (s: number, cut?: boolean) => (cut ? CUT_BIT : s === LOD_NEAR ? NEAR_BIT : FAR_BIT);
const texOf = (sl: ChunkSlot, s: number, cut?: boolean) => (cut ? sl.cut : s === LOD_NEAR ? sl.near : sl.far);

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
  /** noc: mapa światła nad światem */
  light = new LightLayer();
  /**
   * Źródła światła w metrach świata ({ x, y, r, color, strength, flicker }). Lista jest czytana
   * co klatkę, więc wystarczy ją podmieniać albo zmieniać w miejscu (np. ognisko, koza, latarka).
   */
  lights: Light[] = [];
  /** ciemność z ostatniej klatki (0 dzień … 1 noc) */
  darkness = 0;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  minZoom = 0.08;
  maxZoom = 3;
  scene: Scene | null = null;
  private slots: ChunkSlot[] = [];
  /** atlas ludzi i tekstury jego klatek (pozy, leżenie) brane w miarę potrzeby */
  private atlas: TextureSource | null = null;
  private poseTex = new Map<number, Texture>();
  /** dokładanie do kozy widać chwilę po wrzuceniu drewna */
  private feed = new FeedWatch();
  /** dym z kozy i ogniska nad mapą światła */
  readonly smoke = new SmokeLayer();
  /** rzeczy narysowane w ostatniej klatce (gra i dodatki): z nich źródła dymu */
  private drawn: readonly ThingLike[] = [];
  private pawnSprites = new Map<number, Sprite>();
  private prev = new Map<number, [number, number]>();
  private frameNo = 0;
  private nearIsLinear = false;
  private painter: ChunkPainter = new InlinePainter();
  /** milisekundy pracy przy kawałkach w głównym wątku w ostatniej klatce
      (z workerami tylko zamawianie i wstawianie gotowych) */
  chunkMs = 0;
  /** kawałki wstawione od startu (do pomiarów) */
  chunksMade = 0;
  chunksNear = 0;
  pendingFar = 0;
  /** czy wszystkie widoczne kawałki mają już właściwy poziom szczegółów (i rzeczy swoje sprite'y) */
  complete = false;
  /** rzeczy czekające na teksturę (limit nowych tekstur na klatkę) */
  private thingsPending = false;
  /** czy widać przekrój (zbliżenie nad budynkiem z wnętrzem) */
  private cutOn = false;
  /** kawałki nad budynkiem z wnętrzem */
  private cutChunks = new Set<number>();
  /** rzeczy w warstwie pionków: sprite, czy stoi we wnętrzu (widać ją tylko w przekroju), czy się pali */
  private things = new Map<string, { sprite: Sprite; thing: ThingLike; inside: boolean; fire: boolean }>();
  /** tekstury rzeczy po opisie sprite'a (rozmiar i kotwica zależą tylko od rodzaju i ustawienia) */
  private thingArt = new Map<string, { tex: Texture; sp: ArtSprite }>();
  /** rzeczy spoza gry (setThings: podgląd); w trybie gry bez rodzajów, które daje gra */
  private extras: readonly ThingLike[] = [];
  /**
   * stan gry z ostatniego syncGame: rzeczy (st.things, rzeczy ze świata, siatka) i rzeczy niezmienne
   * do pamięci kluczy; simHeaps: symulacja trzyma sterty u siebie, więc tych ze świata już nie ma
   */
  private game: {
    sim: GameLike;
    windows: WindowSpot[];
    props: ThingLike[];
    fence: ThingLike[];
    codes: Uint8Array | null;
    things: ThingLike[];
    simHeaps: boolean;
  } | null = null;
  /** atrapa wraków do podglądu (?wraki=atrapa), dopóki świat ich nie rozstawia */
  private mockWrecks = false;
  /** światła ze stanu gry (koza, okna, ognisko, warta); view.lights to dodatki (podgląd) */
  private gameLights: Light[] = [];
  /** rzeczy, które się nie zmieniają (trzepak, siatka) i ich klucze: bez liczenia opisu co klatkę */
  private fixed = new WeakSet<ThingLike>();
  private fixedKeys = new WeakMap<ThingLike, string | null>();

  /** workers: false wymusza rysowanie kawałków w głównym wątku (adres ?worker=0) */
  async init(host: HTMLElement, opts: { workers?: boolean } = {}): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    this.mockWrecks = typeof location !== 'undefined' && new URLSearchParams(location.search).get('wraki') === 'atrapa';
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
    this.root.addChild(
      this.terrain,
      this.marks,
      this.actors,
      this.light.sprite,
      this.light.glowSprite,
      this.smoke.container,
    );
    this.actors.sortableChildren = true;
    this.app.stage.addChild(this.root);
    this.atlas = Texture.from(makePeopleAtlas()).source;
    if (opts.workers !== false && workersAvailable())
      this.painter = new WorkerPainter(spawnChunkWorker, poolSize(navigator.hardwareConcurrency || 4, PHONE));
  }

  /** gdzie się rysują kawałki (do pomiarów) */
  get painting(): string {
    return this.painter.kind;
  }

  /** czy w tej klatce widać przekrój zamiast dachu */
  get section(): boolean {
    return this.cutOn;
  }

  get width() {
    return this.app.screen.width;
  }
  get height() {
    return this.app.screen.height;
  }

  setScene(sc: Scene): void {
    for (const s of this.slots) {
      if (s.near) dropTex(s.near);
      if (s.far) dropTex(s.far);
      if (s.cut) dropTex(s.cut);
      s.sprite.destroy();
    }
    this.slots = [];
    this.terrain.removeChildren();
    this.scene = sc;
    this.painter.setScene(sc);
    const n = sc.chunks;
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++) {
        const sprite = new Sprite();
        sprite.position.set(cx * CHUNK * TILE, cy * CHUNK * TILE);
        sprite.visible = false;
        this.terrain.addChild(sprite);
        this.slots.push({ sprite, near: null, far: null, cut: null, used: 0, ver: 0, stale: 0 });
      }
    this.pendingFar = n * n;
    this.cutChunks.clear();
    if (sc.section) {
      const b = sc.w.buildings[sc.section.building];
      for (let cy = Math.floor(b.y0 / CHUNK); cy <= Math.floor(b.y1 / CHUNK); cy++)
        for (let cx = Math.floor(b.x0 / CHUNK); cx <= Math.floor(b.x1 / CHUNK); cx++) this.cutChunks.add(cy * n + cx);
    }
    const side = sc.w.size * TILE;
    this.minZoom = Math.min(this.width, this.height) / side / 1.05;
  }

  /**
   * Przerysowuje kawałki pod zmianą na mapie, z workerami i bez: ścięte drzewa (felled) i kafelki
   * ze zmienionym terenem (tiles; w.terr trzeba zmienić przed wywołaniem). Do czasu nowych tekstur
   * widać stare, więc nic nie miga. Zwraca numery przerysowywanych kawałków.
   */
  redraw(ch: MapChange): number[] {
    const sc = this.scene;
    if (!sc) return [];
    for (const k of ch.felled ?? []) sc.treeGone[k] = 1;
    const touched = chunksTouched(sc, ch);
    this.painter.patch(scenePatchOf(sc, ch));
    for (const k of touched) {
      const s = this.slots[k];
      s.ver++;
      s.stale = (s.near ? NEAR_BIT : 0) | (s.far ? FAR_BIT : 0) | (s.cut ? CUT_BIT : 0);
    }
    return touched;
  }

  /** ścięte drzewa ze stanu gry (np. st.felled): przerysowuje kawałki tylko dla nowych */
  syncFelled(felled: readonly number[]): void {
    const sc = this.scene;
    if (!sc) return;
    const fresh = felled.filter((k) => !sc.treeGone[k]);
    if (fresh.length) this.redraw({ felled: fresh });
  }

  /**
   * Rzeczy (meble z interior.furniture, trzepak z world.props, potem st.things z symulacji) jako
   * sprite'y z grafiki zastępczej (thingSprite) w warstwie pionków, sortowane po y dolnej krawędzi.
   * Meble we wnętrzu widać tylko w przekroju, rzeczy na podwórku zawsze; koza i ognisko z ogniem
   * mają animację. Wołać, gdy lista się zmieni; rzeczy porównuje po miejscu i opisie sprite'a,
   * więc tanio też co klatkę.
   */
  setThings(list: readonly ThingLike[]): void {
    this.extras = list;
    this.applyThings();
  }

  /**
   * Rysowanie stanu gry, wołane co klatkę przed render: rzeczy z st.things (meble, drewno, zapasy,
   * pnie, koza z ogniem, garnek z posiłkiem na blacie stołu) plus rzeczy ze świata (trzepak, wraki,
   * sterty materiału, dopóki symulacja nie trzyma ich u siebie) i siatka ze stanem z sim.blocked
   * (łaty, dziury, brama), ścięte drzewa (przerysowanie kawałków), światła z gry (koza we wnętrzu,
   * okna pomieszczeń z sim.light, ognisko, lampy warty). Rzeczy i światła z setThings
   * i view.lights zostają jako dodatki.
   */
  syncGame(sim: GameLike): void {
    if (!this.scene) return;
    const w = sim.w;
    let g = this.game;
    if (!g || g.sim !== sim) {
      const props: ThingLike[] = w.props.map((p) => ({ rot: 0, ...p }));
      if (this.mockWrecks && !props.some((p) => p.kind === 'wrak')) props.push(...mockWrecks(w));
      g = { sim, windows: windowSpots(w), props, fence: [], codes: null, things: [], simHeaps: false };
      for (const t of g.props) this.fixed.add(t);
      this.game = g;
    }
    // sterty rysowane ze świata, dopóki symulacja nie zrobi z nich rzeczy; potem tylko ze stanu gry
    if (!g.simHeaps && sim.st.things.some((t) => HEAPS.has(t.kind))) {
      g.simHeaps = true;
      g.props = g.props.filter((t) => !HEAPS.has(t.kind));
    }
    this.syncFelled(sim.st.felled);
    // siatka liczona od nowa tylko po zmianie w blocked (łata, nowa dziura, brama)
    const codes = fenceCodes(w.fence, sim.blocked, w.size);
    if (!g.codes || codes.length !== g.codes.length || codes.some((c, k) => c !== g!.codes![k])) {
      g.codes = codes;
      g.fence = fenceThings(w.fence, w, fenceStateFn(w.fence, codes), codes[codes.length - 1] === 1);
      for (const t of g.fence) this.fixed.add(t);
    }
    g.things = [...onTables(sim.st.things), ...g.props, ...g.fence];
    this.applyThings();
    this.gameLights = gameLights(sim, g.windows);
  }

  /** rzeczy gry i dodatki do warstwy pionków (diff po miejscu i opisie sprite'a) */
  private applyThings(): void {
    const g = this.game;
    const list = g ? [...g.things, ...this.extras.filter((t) => !GAME_KINDS.has(t.kind))] : this.extras;
    this.drawn = list;
    const seen = new Set<string>();
    let fresh = 0;
    this.thingsPending = false;
    for (const t of list) {
      let key = this.fixedKeys.get(t);
      if (key === undefined) {
        const spec = specOf(t, 0);
        key = spec ? `${t.x}:${t.y}:${JSON.stringify(spec)}` : null;
        if (this.fixed.has(t)) this.fixedKeys.set(t, key);
      }
      if (!key) continue;
      seen.add(key);
      if (this.things.has(key)) continue;
      const spec = specOf(t, 0)!;
      if (!this.thingArt.has(JSON.stringify(spec)) && ++fresh > NEW_ART_PER_FRAME) {
        this.thingsPending = true;
        continue;
      }
      const art = this.artOf(spec);
      const sprite = new Sprite(art.tex);
      sprite.anchor.set(art.sp.ax / art.sp.w, art.sp.ay / art.sp.h);
      sprite.position.set((t.x + t.w / 2) * TILE, (t.y + t.h) * TILE);
      // rzecz na stole rysuje się po stole (na blacie), reszta po dolnej krawędzi podstawy
      sprite.zIndex = t.table !== undefined ? t.table + 0.01 : t.y + t.h;
      const inside = this.underRoof(t.x + 0.5, t.y + t.h - 0.5);
      sprite.visible = !inside || this.cutOn;
      this.actors.addChild(sprite);
      this.things.set(key, { sprite, thing: t, inside, fire: burning(t) });
    }
    for (const [key, e] of this.things)
      if (!seen.has(key)) {
        e.sprite.destroy();
        this.things.delete(key);
      }
  }

  private artOf(spec: ThingSpec): { tex: Texture; sp: ArtSprite } {
    const key = JSON.stringify(spec);
    let art = this.thingArt.get(key);
    if (!art) {
      const sp = thingSprite(spec);
      art = { tex: pixelTexture(sp), sp };
      this.thingArt.set(key, art);
    }
    return art;
  }

  /** czy kafelek leży we wnętrzu przekroju (dla świateł inside) */
  private insideFn = (x: number, y: number) => this.underRoof(x + 0.5, y + 0.5);

  /** czy punkt (metry) leży we wnętrzu przekroju, czyli pod dachem, gdy przekroju nie widać */
  private underRoof(x: number, y: number): boolean {
    const sec = this.scene?.section;
    if (!sec) return false;
    const size = this.scene!.w.size;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return tx >= 0 && ty >= 0 && tx < size && ty < size && sec.cell[ty * size + tx] !== IN.NONE;
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

  /** gotowe kawałki do slotów jako tekstury */
  private install(done: Done[]): void {
    for (const d of done) {
      const s = this.slots[d.k];
      const isNear = d.s === LOD_NEAR;
      const bit = bitOf(d.s, d.cut);
      const old = texOf(s, d.s, d.cut);
      // narysowany ze starych danych (zmiana przyszła w trakcie) albo podwójny: zostaje to, co jest
      if (d.v !== s.ver || (old && !(s.stale & bit))) {
        freeSrc(d.src);
        continue;
      }
      const t = Texture.from(d.src);
      // pamięcią rządzi limit bliskich kawałków, nie sprzątanie PixiJS (dla ImageBitmap domyślnie włączone)
      t.source.autoGarbageCollect = false;
      t.source.scaleMode = !isNear || this.nearIsLinear ? 'linear' : 'nearest';
      this.chunksMade++;
      if (d.cut) {
        s.cut = t;
        if (!old) this.chunksNear++;
      } else if (isNear) {
        s.near = t;
        if (!old) this.chunksNear++;
      } else {
        s.far = t;
        if (!old) this.pendingFar--;
      }
      s.stale &= ~bit;
      if (old) {
        if (s.sprite.texture === old) s.sprite.texture = t;
        dropTex(old);
      }
    }
  }

  /** zamawia brakujące kawałki (najpierw widoczne, od środka ekranu) i pokazuje gotowe */
  private updateChunks(budgetMs: number): void {
    const sc = this.scene!;
    const n = sc.chunks;
    const z = this.cam.zoom;
    const near = z >= 0.5;
    const linear = z < 1;
    if (linear !== this.nearIsLinear) {
      this.nearIsLinear = linear;
      for (const s of this.slots)
        for (const t of [s.near, s.cut]) if (t) t.source.scaleMode = linear ? 'linear' : 'nearest';
    }
    const t0 = performance.now();
    // gotowe od poprzedniej klatki; jeśli workery padły, dalej rysuje główny wątek
    this.install(this.painter.take());
    if (this.painter.failed) {
      this.painter = new InlinePainter();
      this.painter.setScene(sc);
    }
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.width, this.height);
    const span = CHUNK * TILE;
    const order = chunksByDistance(
      n,
      Math.max(0, Math.floor(x0 / span)),
      Math.max(0, Math.floor(y0 / span)),
      Math.min(n - 1, Math.floor(x1 / span)),
      Math.min(n - 1, Math.floor(y1 / span)),
      (this.cam.x / span) | 0,
      (this.cam.y / span) | 0,
    );
    const slots = this.slots;
    // tekstura sprzed zmiany na mapie się nie liczy: kawałek trzeba zamówić od nowa
    const has = (k: number, s: number, cut?: boolean) =>
      texOf(slots[k], s, cut) !== null && !(slots[k].stale & bitOf(s, cut));
    const wantCut = (k: number) => this.cutOn && this.cutChunks.has(k);
    // nowa lista zastępuje starą: kawałki, które wyszły z ekranu, wypadają z kolejki
    this.painter.order(
      planOrders(order, slots.length, has, near, (k) => slots[k].ver, wantCut),
      budgetMs,
    );
    this.install(this.painter.take());
    for (const s of slots) s.sprite.visible = false;
    let complete = true;
    for (const k of order) {
      const s = slots[k];
      s.used = this.frameNo;
      const cut = wantCut(k);
      // przekrój, a do czasu jego przyjścia dach z bliska; dach nigdy nie zastępuje przekroju odwrotnie
      const tex = (cut && s.cut) || (near && s.near) || s.far;
      if (cut ? !has(k, LOD_NEAR, true) : near ? !has(k, LOD_NEAR) : !has(k, LOD_FAR)) complete = false;
      if (tex) {
        if (s.sprite.texture !== tex) s.sprite.texture = tex;
        // skala co klatkę: po wyrzuceniu bliskiego kawałka sprite może już mieć daleką teksturę
        s.sprite.scale.set(tex === s.far ? LOD_NEAR / LOD_FAR : 1);
        s.sprite.visible = true;
      }
    }
    // limit pamięci: najdawniej widziane bliskie kawałki (z przekrojami) idą do kosza
    if (this.chunksNear > MAX_NEAR) {
      const old = this.slots
        .filter((s) => (s.near || s.cut) && s.used !== this.frameNo)
        .sort((a, b) => a.used - b.used);
      for (const s of old) {
        if (this.chunksNear <= MAX_NEAR) break;
        if (s.sprite.texture === s.near || s.sprite.texture === s.cut) {
          s.sprite.texture = s.far ?? Texture.EMPTY;
          s.sprite.scale.set(LOD_NEAR / LOD_FAR);
        }
        for (const t of [s.near, s.cut]) if (t) dropTex(t);
        this.chunksNear -= (s.near ? 1 : 0) + (s.cut ? 1 : 0);
        s.near = null;
        s.cut = null;
        s.stale &= ~(NEAR_BIT | CUT_BIT);
      }
    }
    this.complete = complete && !this.thingsPending;
    this.chunkMs = performance.now() - t0;
  }

  /** zapamiętuje pozycje przed krokiem symulacji (do płynnego ruchu między krokami) */
  beforeStep(st: SimState): void {
    for (const p of st.pawns) this.prev.set(p.id, [p.x, p.y]);
  }

  render(st: SimState, alpha: number, selected: ReadonlySet<number>): void {
    if (!this.scene) return;
    this.frameNo++;
    const z = this.cam.zoom;
    this.root.scale.set(z);
    this.root.position.set(Math.round(this.width / 2 - this.cam.x * z), Math.round(this.height / 2 - this.cam.y * z));
    this.cutOn = this.scene.section !== null && z >= (this.cutOn ? CUT_OFF : CUT_ON);
    this.updateChunks(this.frameNo < 3 ? 400 : 10);
    // światła: z gry i dodatki (ten sam ogień nie świeci dwa razy); we wnętrzu tylko w przekroju
    const time = performance.now() / 1000;
    const all = this.gameLights.length
      ? [
          ...this.gameLights,
          ...this.lights.filter(
            (l) => !this.gameLights.some((g) => !!g.inside === !!l.inside && Math.hypot(g.x - l.x, g.y - l.y) < 0.5),
          ),
        ]
      : this.lights;
    const lights = this.cutOn ? all : all.filter((l) => !l.inside);
    this.darkness = darknessAt(minutesAt(st.tick));
    // rzeczy: meble tylko w przekroju, ogień w kozie i ognisku co 150 ms następna klatka
    const flame = Math.floor(performance.now() / 150) % FIRE_FRAMES;
    for (const e of this.things.values()) {
      e.sprite.visible = !e.inside || this.cutOn;
      if (e.fire && e.sprite.visible) e.sprite.texture = this.artOf(specOf(e.thing, flame)!).tex;
    }
    // pionki: poza z pracy (rąbie, niesie drewno, klęczy przy kozie, gotuje, siedzi, śpi, wartuje)
    const seen = new Set<number>();
    this.marks.clear();
    const gameT = (st.tick + alpha) / TICKS_PER_SECOND;
    for (const p of st.pawns) {
      // na wyprawie poza mapą: nie rysujemy
      if (p.away) continue;
      seen.add(p.id);
      let sp = this.pawnSprites.get(p.id);
      if (!sp) {
        sp = new Sprite(Texture.EMPTY);
        this.actors.addChild(sp);
        this.pawnSprites.set(p.id, sp);
      }
      const pv = this.prev.get(p.id);
      const x = pv ? pv[0] + (p.x - pv[0]) * alpha : p.x;
      const y = pv ? pv[1] + (p.y - pv[1]) * alpha : p.y;
      const pose = poseOf(p, gameT, st.things, p.kind === 'core' && this.feed.feeding(p, st.tick));
      sp.texture = this.poseTexture(p.look % LOOKS, pose);
      if (pose.lie) {
        const [hx, hy] = lieHead(pose.lie.o);
        sp.anchor.set(hx / LIE, hy / LIE);
        sp.position.set(Math.round(pose.lie.x), Math.round(pose.lie.y));
      } else {
        sp.anchor.set(0.5, 45 / FH);
        sp.position.set(Math.round(x * TILE), Math.round(y * TILE));
      }
      sp.zIndex = pose.z ?? y;
      // pod dachem nie widać nikogo; w przekroju tak
      sp.visible = this.cutOn || !this.underRoof(x, y);
      // obcych widać tylko w świetle: w półmroku sam ciemny zarys, w ciemności nic
      if (STRANGERS.has(p.kind)) {
        const vis = strangerVisibility(this.darkness, lightAt(x, y - 0.5, lights, time, this.insideFn));
        sp.visible &&= vis > 0.08;
        sp.alpha = Math.min(1, vis * 1.6);
        const v = Math.min(1, vis * 1.4);
        const c = Math.round(24 + 231 * v);
        sp.tint = (c << 16) | (c << 8) | Math.min(255, c + 8);
      }
      if (selected.has(p.id) && sp.visible) this.markPawn(p, x, y);
    }
    for (const [id, sp] of this.pawnSprites)
      if (!seen.has(id)) {
        sp.destroy();
        this.pawnSprites.delete(id);
        this.feed.forget(id);
      }
    // dym z kozy (przez okno) i z ogniska, z czasu gry; widać go także przy dachu
    this.smoke.update(smokeSources(this.drawn, this.scene.w), gameT, this.darkness, z);
    // noc: ciemność z godziny gry, światła z gry i z listy
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.width, this.height);
    this.light.update(x0, y0, x1, y1, z, this.darkness, lights, time, this.insideFn);
  }

  /** klatka atlasu ludzi dla pozy (tekstury tworzone przy pierwszym użyciu) */
  private poseTexture(look: number, pv: PoseView): Texture {
    // klucz: pozy nieujemne (wygląd, poza, kierunek, klatka), leżenie ujemne (wygląd, łóżko albo podłoga, strona)
    const k = pv.lie
      ? -1 - (look * 8 + (pv.lie.kind === 'bed' ? 0 : 4) + pv.lie.o)
      : ((look * POSES.length + POSES.indexOf(pv.pose)) * 4 + pv.dir) * 4 + pv.frame;
    let tex = this.poseTex.get(k);
    if (!tex) {
      const [x, y, w, h] = pv.lie ? lieRect(look, pv.lie.kind, pv.lie.o) : frameRect(look, pv.pose, pv.dir, pv.frame);
      tex = new Texture({ source: this.atlas!, frame: new Rectangle(x, y, w, h) });
      this.poseTex.set(k, tex);
    }
    return tex;
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
      if (p.kind !== 'core' || p.away) continue;
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

/** zwalnia ImageBitmap od razu, bez czekania na odśmiecanie (zwykłe płótno nie ma czego zamknąć) */
function freeSrc(src: unknown): void {
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) src.close();
}

/** niszczy teksturę kawałka razem z jej obrazem */
function dropTex(t: Texture): void {
  const src: unknown = t.source.resource;
  t.destroy(true);
  freeSrc(src);
}

/** tekstura z bufora pikseli rgba() (0 przezroczysty), bez wygładzania */
function pixelTexture(sp: ArtSprite): Texture {
  const source = new BufferImageSource({
    resource: new Uint8Array(sp.px.buffer, sp.px.byteOffset, sp.px.byteLength),
    width: sp.w,
    height: sp.h,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    autoGarbageCollect: false,
  });
  return new Texture({ source });
}
