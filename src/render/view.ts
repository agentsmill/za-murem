/* Widok gry w PixiJS 8: kamera, kawałki mapy w dwóch poziomach szczegółów, pionki, noc.
   Rysowanie tylko czyta stan symulacji. Kawałki rysują na zamówienie workery (OffscreenCanvas),
   a bez nich główny wątek w limicie czasu na klatkę. Z bliska (32 px/kafelek) tylko widoczne,
   wyrzucane, gdy jest ich za dużo. Z daleka (8 px/kafelek) wszystkie, zamawiane na starcie.
   Noc to mapa światła nad światem (light.ts), mnożona przez obraz. Przekrój: przy zbliżeniu
   kawałki nad budynkiem z wnętrzem (scene.section) rysują się z wnętrzem zamiast dachu, a meble
   stoją w jednej warstwie z pionkami, sortowane po y. Otwarte sąsiednie budynki (M2 fala 2) dokładają
   swoje wnętrza do tego samego przekroju łatką sceny (przekrojSasiadow.ts), razem z wyglądem drzwi, a plan
   wspólnego płotu rysuje się jako duch przyszłego obwodu z postępem (plotDuch.ts, plotLayer.ts). Z grafiką
   z PixelLab (setGrafika) trzepak jest z PixelLab, teren i bloki rysują kawałki ze sceny (scene.art), a pionki
   rysuje postać z animacji PixelLab (ludzieLayer.ts), gdy obsada ma daną pozę: inaczej kod. Leżącego pionka i zwłoki
   składa warstwa z klatki stania przodem (art/lezenie.ts). Zmianę leżenia na podłodze widok sam zamienia w przejście
   (przejscia.ts): kładzenie się i wstawanie grają raz z animacji PixelLab, a zwłoki członka zarządu, który zginął
   podczas gry, upadają i zostają na ostatniej klatce upadku; stan tych przejść jest tylko tu, nie w SimState. */

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
import type { WeaponId } from '../sim/bron.ts';
import { minutesAt, TICKS_PER_SECOND } from '../sim/clock.ts';
import { TRADER_HP, ZBIR_HP } from '../sim/handlarz.ts';
import { NOISE_TICKS, type Pawn, type SimState, STRANGER_HP } from '../sim/sim.ts';
import { WANDERER_HP } from '../sim/wedrowcy.ts';
import { ZOMBIE_HP } from '../sim/zombie.ts';
import { czasPrzejscia } from './art/animacjePozy.ts';
import { ANCHOR_Y, type ArmPose, CELL, makeWeaponAtlas, thrusts, weaponRect } from './art/bron.ts';
import { korektaDloni } from './art/bronPixellab.ts';
import {
  FH,
  frameRect,
  LIE,
  LOOKS,
  lieHead,
  lieRect,
  makePeopleAtlas,
  makeZombieAtlas,
  outlineAtlas,
  POSES,
  ZLOOKS,
  zFrameRect,
  zLieRect,
} from './art/people.ts';
import { type Grafika, type PostacLudzi, rzeczSprite } from './art/pixellab.ts';
import { type Sprite as ArtSprite, FIRE_FRAMES, type ThingSpec } from './art/rzeczy.ts';
import { CHUNK, type Scene, TILE } from './art/scene.ts';
import { mockWear, type WearMock } from './atrapy.ts';
import { BuildLayer, type BuildPlan, type Placement } from './buildLayer.ts';
import {
  applyScenePatch,
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
  isBoard,
  isLokator,
  onTables,
  pawnAt,
  STRANGERS,
  strangerVisibility,
  type WindowSpot,
  windowSpots,
} from './game.ts';
import { darknessAt, type Light, lightAt } from './light.ts';
import { LightLayer } from './lightLayer.ts';
import { type KlatkaTekstury, LudzieLayer } from './ludzieLayer.ts';
import { chunkiParteru, chunkiPietra, przekrojPietra, wnetrzaParteru } from './pietroWidok.ts';
import { type DuchPlotu, duchPlotu } from './plotDuch.ts';
import { PlotLayer } from './plotLayer.ts';
import { crowdJitter, FeedWatch, type PoseCtx, type PoseView, poseOf } from './poses.ts';
import { kierunekAnimacjiLezenia, kierunekZwlok, NoweZwloki, PrzejsciaPionkow, STRONA_PODLOGI } from './przejscia.ts';
import { PrzekrojSasiadow } from './przekrojSasiadow.ts';
import { burning, IN, type SectionScene, setWear, specOf, type ThingLike } from './section.ts';
import { smokeSources } from './smoke.ts';
import { SmokeLayer } from './smokeLayer.ts';
import { TreeLayer } from './treeLayer.ts';
import { fenceThings, mockWrecks } from './yard.ts';

const PHONE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** od tej ciemności zaznaczenie i droga rysują się nad mapą światła, a zaznaczeni dostają zarys */
const NIGHT_MARKS = 0.35;
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
  /** ziemia: ślady pod rzeczami i pionkami (duch planu wspólnego płotu); warstwa pionków ma same sprite'y */
  readonly ground = new Container();
  marks = new Graphics();
  actors = new Container();
  /** drzewa z bliska jako sprite'y w warstwie pionków (z daleka są w kawałkach) */
  readonly trees = new TreeLayer(this.actors);
  /** zarysy zarządu za koronami drzew: na wierzchu, także nocą (nad mapą światła) */
  readonly xray = new Container();
  private xraySprites = new Map<number, Sprite>();
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
  /** ten sam układ klatek, sam zarys postaci (do pokazania kogoś za koroną) */
  private outline: TextureSource | null = null;
  private outlineTex = new Map<number, Texture>();
  /** atlas szwendaczy i nakładek broni z teksturami klatek */
  private zatlas: TextureSource | null = null;
  private zTex = new Map<number, Texture>();
  private warms: TextureSource | null = null;
  private wTex = new Map<string, Texture>();
  /** broń w ręce (nakładka) i zwłoki, trupy na ziemi: po id pionka i id rzeczy */
  private weaponSprites = new Map<number, Sprite>();
  private corpseSprites = new Map<number, Sprite>();
  /** dokładanie do kozy widać chwilę po wrzuceniu drewna */
  private feed = new FeedWatch();
  /** dym z kozy i ogniska nad mapą światła */
  readonly smoke = new SmokeLayer();
  /** rzeczy narysowane w ostatniej klatce (gra i dodatki): z nich źródła dymu */
  private drawn: readonly ThingLike[] = [];
  private pawnSprites = new Map<number, Sprite>();
  /** ostatnia poza każdego pionka: zrzuty czytają ją zamiast klatki atlasu (z PixelLab klatka nie mówi, jaka to poza) */
  readonly poses = new Map<number, PoseView>();
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
  /** kawałki z przekrojem: nad budynkiem z wnętrzem (parter) albo nad budynkami z wybranym piętrem (pietroNr od 1) */
  private cutChunks = new Set<number>();
  /** wybrane piętro (widok pięter): 0 to parter, przekrój siedziby jak zawsze; od 1 przekrój typowego piętra */
  private pietroNr = 0;
  /** rzeczy w warstwie pionków: sprite, czy stoi we wnętrzu (widać ją tylko w przekroju), czy się pali */
  private things = new Map<string, { sprite: Sprite; thing: ThingLike; inside: boolean; fire: boolean }>();
  /** tekstury rzeczy po opisie sprite'a (rozmiar i kotwica zależą tylko od rodzaju i ustawienia) */
  private thingArt = new Map<string, { tex: Texture; sp: ArtSprite }>();
  /** rzeczy spoza gry (setThings: podgląd); w trybie gry bez rodzajów, które daje gra */
  private extras: readonly ThingLike[] = [];
  /**
   * stan gry z ostatniego syncGame: rzeczy (st.things, rzeczy ze świata, siatka) i rzeczy niezmienne
   * do pamięci kluczy; simKinds: rodzaje stert, które symulacja trzyma u siebie (tych ze świata już
   * nie ma)
   */
  private game: {
    sim: GameLike;
    windows: WindowSpot[];
    props: ThingLike[];
    fence: ThingLike[];
    codes: Uint8Array | null;
    things: ThingLike[];
    simKinds: Set<string>;
    /** podpis st.wraki z ostatniej klatki (stan wraków zmienia opis sprite'a) */
    wrecks: string;
  } | null = null;
  /** atrapa wraków do podglądu (?wraki=atrapa), dopóki świat ich nie rozstawia */
  private mockWrecks = false;
  /**
   * atrapa pustych mieszkań (?mieszkania=atrapa): zastępuje stany, uszkodzenia, śmieci i zepsucia ze świata
   * i ze stanu gry
   */
  private mockWearOn = false;
  private wearMock: WearMock | null = null;
  /** naprawione uszkodzenia (st.damage z fixed) już zdjęte z przekroju */
  private fixedSeen = new Set<number>();
  /** M2 fala 2: wnętrza sąsiadów dołożone do przekroju i wersja sąsiadów z symulacji, z której są */
  private przekrojSas = new PrzekrojSasiadow();
  private wersjaSas = -1;
  /** plany budowy z ostatniego syncGame (st.builds) */
  private plans: readonly BuildPlan[] = [];
  /** paski postępu planów i podgląd stawiania, nad mapą światła */
  readonly buildOverlay = new Container();
  /** budowa: duchy planów w warstwie pionków, paski i podgląd stawiania */
  readonly builds = new BuildLayer(this.actors, this.buildOverlay);
  /** M2 fala 2, etap 3: duch planu wspólnego płotu (siatka w warstwie pionków, ślad na ziemi, postęp nad mapą
      światła) */
  readonly plotDuch = new PlotLayer(this.actors, this.ground, this.buildOverlay);
  /** duch planu płotu z ostatniego syncGame (null: nie ma planu) */
  private duch: DuchPlotu | null = null;
  /** światła ze stanu gry (koza, okna, ognisko, warta); view.lights to dodatki (podgląd) */
  private gameLights: Light[] = [];
  /** rzeczy, które się nie zmieniają (trzepak, siatka) i ich klucze: bez liczenia opisu co klatkę */
  private fixed = new WeakSet<ThingLike>();
  private fixedKeys = new WeakMap<ThingLike, string | null>();
  /** grafika z PixelLab (trzepak i ludzie; teren i bloki idą ze sceną) albo null: wszystko z kodu */
  grafika: Grafika | null = null;
  /** postacie z PixelLab (animacje z atlasu ludzie.png) albo null: pionki rysuje kod */
  private ludzie: LudzieLayer | null = null;
  /** kładzenie się i wstawanie pionków z PixelLab na podłodze (stan tylko w widoku) */
  private przejscia = new PrzejsciaPionkow();
  /** zwłoki powstałe podczas gry (tylko one upadają) i ostatnie kierunki członków zarządu */
  private zwlokiNowe = new NoweZwloki();
  /** upadki zwłok w toku: numer rzeczy → czas gry startu, kierunek upadku, postać i wersja kolorystyczna */
  private upadki = new Map<number, { start: number; dir: number; postac: PostacLudzi; wersja: number }>();

  /** workers: false wymusza rysowanie kawałków w głównym wątku (adres ?worker=0) */
  async init(host: HTMLElement, opts: { workers?: boolean } = {}): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    this.mockWrecks = typeof location !== 'undefined' && new URLSearchParams(location.search).get('wraki') === 'atrapa';
    this.mockWearOn =
      typeof location !== 'undefined' && new URLSearchParams(location.search).get('mieszkania') === 'atrapa';
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
      this.ground,
      this.marks,
      this.actors,
      this.light.sprite,
      this.light.glowSprite,
      this.xray,
      this.buildOverlay,
      this.smoke.container,
    );
    this.actors.sortableChildren = true;
    this.app.stage.addChild(this.root);
    const people = makePeopleAtlas();
    this.atlas = Texture.from(people).source;
    this.outline = Texture.from(outlineAtlas(people) as HTMLCanvasElement).source;
    this.zatlas = Texture.from(makeZombieAtlas() as HTMLCanvasElement).source;
    this.warms = Texture.from(makeWeaponAtlas() as HTMLCanvasElement).source;
    if (opts.workers !== false && workersAvailable())
      this.painter = new WorkerPainter(spawnChunkWorker, poolSize(navigator.hardwareConcurrency || 4, PHONE));
  }

  /** grafika z PixelLab do rzeczy (przed setScene; tekstury rzeczy z poprzedniej grafiki idą do kosza) */
  setGrafika(g: Grafika | null): void {
    if (g === this.grafika) return;
    this.grafika = g;
    this.ludzie?.destroy();
    this.ludzie = g?.ludzie ? new LudzieLayer(g.ludzie) : null;
    // zwłoki dostają teksturę raz, przy powstaniu: po zmianie grafiki rysują się od nowa, bez upadku (nie są nowe)
    for (const sp of this.corpseSprites.values()) sp.destroy();
    this.corpseSprites.clear();
    this.upadki.clear();
    this.przejscia = new PrzejsciaPionkow();
    for (const e of this.things.values()) e.sprite.destroy();
    this.things.clear();
    for (const a of this.thingArt.values()) a.tex.destroy(true);
    this.thingArt.clear();
  }

  /** gdzie się rysują kawałki (do pomiarów) */
  get painting(): string {
    return this.painter.kind;
  }

  /** czy w tej klatce widać przekrój zamiast dachu */
  get section(): boolean {
    return this.cutOn;
  }

  /** wybrane piętro: 0 to parter, od 1 przekrój typowego piętra (ustawPietro) */
  get pietro(): number {
    return this.pietroNr;
  }

  /** czy w tej klatce widać przekrój piętra (od pierwszego) zamiast dachu */
  pietroAktywne(): boolean {
    return przekrojPietra(this.cutOn, this.pietroNr);
  }

  /** czy w tej klatce widać wnętrza parteru: przekrój na parterze. Na piętrze osoby, rzeczy i światła we wnętrzach
      siedziby i otwartych sąsiadów są schowane tak jak pod dachem (underRoof). */
  get wnetrza(): boolean {
    return wnetrzaParteru(this.cutOn, this.pietroNr);
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
    // atrapa pustych mieszkań w przekroju (zamiast stanów i uszkodzeń ze świata), zanim scena pójdzie
    // do workerów
    this.wearMock = null;
    this.fixedSeen.clear();
    this.przekrojSas = new PrzekrojSasiadow();
    this.wersjaSas = -1;
    if (this.mockWearOn && sc.section) {
      this.wearMock = mockWear(sc.w);
      setWear(sc.section, this.wearMock.damage, this.wearMock.apts);
    }
    this.builds.mapSize = sc.w.size;
    this.plotDuch.mapSize = sc.w.size;
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
    // widok bierze piętro ze sceny (buildScene: 0, parter)
    this.pietroNr = sc.pietro;
    this.cutChunks = this.kawalkiPrzekroju(sc, sc.pietro);
    const side = sc.w.size * TILE;
    this.minZoom = Math.min(this.width, this.height) / side / 1.05;
  }

  /**
   * Przerysowuje kawałki pod zmianą na mapie, z workerami i bez: ścięte drzewa (felled), kafelki
   * ze zmienionym terenem (tiles; w.terr trzeba zmienić przed wywołaniem), naprawy, wnętrza sąsiadów
   * i ich drzwi. Scena głównego wątku dostaje tę samą łatkę co kopie w workerach. Do czasu nowych
   * tekstur widać stare, więc nic nie miga. Zwraca numery przerysowywanych kawałków.
   */
  redraw(ch: MapChange): number[] {
    const sc = this.scene;
    if (!sc) return [];
    const patch = scenePatchOf(sc, ch);
    applyScenePatch(sc, patch);
    const touched = chunksTouched(sc, ch);
    this.painter.patch(patch);
    for (const k of touched) {
      const s = this.slots[k];
      s.ver++;
      s.stale = (s.near ? NEAR_BIT : 0) | (s.far ? FAR_BIT : 0) | (s.cut ? CUT_BIT : 0);
    }
    return touched;
  }

  /** kawałki z przekrojem dla piętra L: od 1 budynki, które to piętro mają, na parterze siedziba i otwarci sąsiedzi */
  private kawalkiPrzekroju(sc: Scene, L: number): Set<number> {
    return L >= 1 ? chunkiPietra(sc, L) : chunkiParteru(sc);
  }

  /**
   * Wybór piętra (widok pięter): 0 to parter, przekrój siedziby jak zawsze; od 1 przekrój typowego piętra ze sceny
   * sec, którą wystarczy podać raz (przy 0 i przy następnych wyborach może być null). Łatka {pietro, pietra} idzie
   * do workerów i na scenę głównego wątku. chunksTouched nie zna piętra, więc redraw nic by nie unieważnił: kawałki
   * z przekrojem, stare i nowe, dostają nową wersję i tylko ich przekrój jest nieaktualny (NEAR_BIT i FAR_BIT
   * zostają). Zamówienie rysowane przy poprzednim piętrze wraca z dawną wersją i install je odrzuca, więc wygrywa
   * ostatni wybór; do czasu nowego przekroju widać stary, bez mrugania.
   */
  ustawPietro(L: number, sec: SectionScene | null): void {
    const sc = this.scene;
    if (!sc) return;
    // scenę piętra wysyła się raz: ta sama jest już w scenie i w kopiach u workerów
    const patch = scenePatchOf(sc, sec && sec !== sc.pietra ? { pietro: L, pietra: sec } : { pietro: L });
    applyScenePatch(sc, patch);
    this.painter.patch(patch);
    const stare = this.cutChunks;
    this.pietroNr = L;
    this.cutChunks = this.kawalkiPrzekroju(sc, L);
    for (const k of new Set([...stare, ...this.cutChunks])) {
      const s = this.slots[k];
      s.ver++;
      if (s.cut) s.stale |= CUT_BIT;
    }
    this.odswiezWnetrza();
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
   * sprite'y z grafiki zastępczej (thingSprite; trzepak z PixelLab, gdy jest grafika) w warstwie pionków,
   * sortowane po y dolnej krawędzi.
   * Meble we wnętrzu widać tylko w przekroju, rzeczy na podwórku zawsze; koza i ognisko z ogniem
   * mają animację. Wołać, gdy lista się zmieni; rzeczy porównuje po miejscu i opisie sprite'a,
   * więc tanio też co klatkę.
   */
  setThings(list: readonly ThingLike[]): void {
    this.extras = list;
    this.applyThings();
  }

  /**
   * Podgląd stawiania z trybu budowy: duch budowli w (x, y, rot) na zielono, gdy ok, inaczej na
   * czerwono, jego kafelki i podświetlone kafelki dozwolone (tiles.ok) i niedozwolone (tiles.bad);
   * null chowa podgląd. Kafelki to indeksy świata (y · size + x).
   */
  setPlacement(p: Placement | null): void {
    this.builds.setPlacement(p);
  }

  /** uszkodzenia, plany i łóżka piętrowe z dwojgiem śpiących do póz prac M2 i snu (co klatkę) */
  private poseCtx(st: SimState): PoseCtx {
    let sleepers: Map<number, number> | null = null;
    for (const p of st.pawns)
      if (p.job?.t === 'sleep' && p.job.phase === 1 && p.job.target >= 0) {
        sleepers ??= new Map();
        sleepers.set(p.job.target, (sleepers.get(p.job.target) ?? 0) + 1);
      }
    const bunkFull = new Set<number>();
    for (const [id, n] of sleepers ?? []) if (n > 1) bunkFull.add(id);
    return {
      damage: (st as { damage?: readonly { kind: string }[] }).damage,
      builds: this.plans,
      bunkFull,
    };
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
    this.syncSasiedzi(sim);
    let g = this.game;
    // z atrapą pustych mieszkań śmieci i zepsute meble tylko z atrapy, bez tych ze świata i ze stanu gry
    const mock = this.wearMock;
    if (!g || g.sim !== sim) {
      const props: ThingLike[] = w.props
        .filter((p) => !mock || (p.kind as string) !== 'smieci')
        .map((p) => ({ rot: 0, ...p }));
      if (this.mockWrecks && !props.some((p) => p.kind === 'wrak')) props.push(...mockWrecks(w));
      if (mock) props.push(...mock.trash);
      g = { sim, windows: windowSpots(w), props, fence: [], codes: null, things: [], simKinds: new Set(), wrecks: '' };
      for (const t of g.props) this.fixed.add(t);
      this.game = g;
    }
    // sterty i śmieci rysowane ze świata, dopóki symulacja nie zrobi z nich rzeczy; potem tylko ze stanu gry
    for (const t of sim.st.things)
      if (HEAPS.has(t.kind) && !g.simKinds.has(t.kind) && !(mock && t.kind === 'smieci')) {
        g.simKinds.add(t.kind);
        g.props = g.props.filter((p) => p.kind !== t.kind);
      }
    // naprawione uszkodzenia znikają z przekroju: wpisy st.damage z fixed (zmienia się tylko na true)
    const damage = (sim.st as { damage?: readonly { tile: number; fixed: boolean }[] }).damage;
    if (damage) {
      const fresh: number[] = [];
      for (const d of damage) if (d.fixed && !this.fixedSeen.has(d.tile)) fresh.push(d.tile);
      if (fresh.length) {
        for (const i of fresh) this.fixedSeen.add(i);
        this.redraw({ fixed: fresh });
      }
    }
    // wraki przeszukane i rozebrane: nowy opis sprite'a (nowy obiekt, bo klucze rzeczy ze świata są zapamiętane)
    const wraki = sim.st.wraki;
    const sig = wraki?.map((m) => `${m.t}:${m.s}`).join() ?? '';
    if (sig !== g.wrecks) {
      g.wrecks = sig;
      const size = w.size;
      g.props = g.props.map((p) => {
        if (p.kind !== 'wrak') return p;
        const s = wraki?.find((m) => m.t === p.y * size + p.x)?.s ?? 0;
        if ((p.stage ?? 0) === s) return p;
        const q = { ...p, stage: s || undefined };
        this.fixed.add(q);
        return q;
      });
    }
    this.plans = (sim.st as { builds?: readonly BuildPlan[] }).builds ?? [];
    // plan wspólnego płotu: przyszły obwód (kształt z pamięci, liczony od nowa po zmianie planu, siatki albo zasieków)
    this.duch = duchPlotu(sim.st, w);
    this.syncFelled(sim.st.felled);
    // siatka liczona od nowa tylko po zmianie w blocked (łata, nowa dziura, brama)
    const codes = fenceCodes(w.fence, sim.blocked, w.size, sim.st.fence);
    if (!g.codes || codes.length !== g.codes.length || codes.some((c, k) => c !== g!.codes![k])) {
      g.codes = codes;
      g.fence = fenceThings(w.fence, w, fenceStateFn(w.fence, codes), codes[codes.length - 1] === 1);
      for (const t of g.fence) this.fixed.add(t);
    }
    // zepsute meble ze stanu gry (symulacja przepisuje broken z mebli świata), z atrapą tylko z atrapy;
    // okopcona kuchenka na kafelku uszkodzenia piec (po naprawie znowu cała); zasieki stoją zamiast
    // odcinka siatki
    let things = onTables(sim.st.things);
    if (mock) things = things.filter((t) => t.kind !== 'smieci');
    const stoves: number[] = [];
    for (const [i, k] of this.scene.section?.damage ?? []) if (k === 'piec') stoves.push(i);
    if (mock || stoves.length) {
      const size = w.size;
      const onStove = (t: ThingLike) =>
        stoves.some((i) => {
          const x = i % size;
          const y = (i - x) / size;
          return x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
        });
      things = things.map((t) => {
        const broken = mock ? mock.broken.has(`${t.x},${t.y}`) : !!t.broken;
        const burnt = !!t.burnt || onStove(t);
        return broken === !!t.broken && burnt === !!t.burnt
          ? t
          : { ...t, broken: broken || undefined, burnt: burnt || undefined };
      });
    }
    const wire = new Set(sim.st.things.filter((t) => t.kind === 'zasieki').map((t) => t.y * w.size + t.x));
    const fence = wire.size ? g.fence.filter((t) => !wire.has(t.y * w.size + t.x)) : g.fence;
    g.things = [...things, ...g.props, ...fence];
    this.applyThings();
    this.gameLights = gameLights(sim, g.windows);
  }

  /** Otwarte sąsiednie budynki (M2 fala 2): po zmianie wersji w symulacji nowe wnętrza i drzwi idą do przekroju,
      ich kawałki dostają przekrój, a rzeczy, które stoją teraz we wnętrzu, widać już tylko w przekroju. */
  private syncSasiedzi(sim: GameLike): void {
    const sc = this.scene!;
    const ver = sim.wersjaSasiadow ?? 0;
    if (!sc.section || ver === this.wersjaSas) return;
    this.wersjaSas = ver;
    const z = this.przekrojSas.zmiany(sim.w, sc.section, sim.st.sasiedzi);
    if (!z) return;
    this.redraw(z);
    // na piętrze kawałki z przekrojem to budynki z tym piętrem; kawałki sąsiada wrócą ze zbiorem parteru (chunkiParteru)
    if (this.pietroNr === 0) {
      const n = sc.chunks;
      for (const p of z.wnetrze)
        for (let cy = Math.floor(p.y0 / CHUNK); cy <= Math.floor((p.y0 + p.h - 1) / CHUNK); cy++)
          for (let cx = Math.floor(p.x0 / CHUNK); cx <= Math.floor((p.x0 + p.w - 1) / CHUNK); cx++)
            this.cutChunks.add(cy * n + cx);
    }
    if (z.wnetrze.length) this.odswiezWnetrza();
  }

  /** na nowo liczy, które rzeczy stoją we wnętrzu (pod dachem siedziby albo otwartego sąsiada) */
  private odswiezWnetrza(): void {
    for (const e of this.things.values()) e.inside = this.underRoof(e.thing.x + 0.5, e.thing.y + e.thing.h - 0.5);
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
      // rzecz na stole rysuje się po stole (na blacie), krew pod wszystkim, reszta po dolnej krawędzi podstawy
      sprite.zIndex = t.table !== undefined ? t.table + 0.01 : t.kind === 'krew' ? -1 : t.y + t.h;
      const inside = this.underRoof(t.x + 0.5, t.y + t.h - 0.5);
      sprite.visible = !inside || this.wnetrza;
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
      const sp = rzeczSprite(spec, this.grafika);
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
    // drzewa z bliska jako sprite'y z widocznych kawałków, z daleka schowane (są w kawałkach)
    this.trees.update(sc, order, near, linear);
    this.complete = complete && !this.thingsPending && !this.trees.pending;
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
    const lights = this.wnetrza ? all : all.filter((l) => !l.inside);
    this.darkness = darknessAt(minutesAt(st.tick));
    // nocą zaznaczenie i droga nad mapą światła (inaczej ciemnieją razem z ziemią), w dzień pod pionkami, nad śladami
    // na ziemi
    const marksAt =
      this.darkness > NIGHT_MARKS
        ? this.root.getChildIndex(this.light.glowSprite)
        : this.root.getChildIndex(this.ground) + 1;
    if (this.root.getChildIndex(this.marks) !== marksAt) this.root.setChildIndex(this.marks, marksAt);
    // rzeczy: meble tylko w przekroju, ogień w kozie i ognisku co 150 ms następna klatka
    const flame = Math.floor(performance.now() / 150) % FIRE_FRAMES;
    for (const e of this.things.values()) {
      e.sprite.visible = !e.inside || this.wnetrza;
      if (e.fire && e.sprite.visible) e.sprite.texture = this.artOf(specOf(e.thing, flame)!).tex;
    }
    // plany budowy: duchy budowli z paskiem postępu (w budynku tylko w przekroju)
    this.builds.update(
      this.plans,
      (spec) => this.artOf(spec),
      (x, y) => !this.wnetrza && this.underRoof(x, y),
    );
    this.plotDuch.update(this.duch, z);
    // pionki: poza z pracy (rąbie, niesie drewno albo materiał, klęczy, gotuje, siedzi, śpi, wartuje,
    // przeszukuje, naprawia, buduje); prace M2 biorą rodzaj uszkodzenia i planu ze stanu gry
    const seen = new Set<number>();
    this.marks.clear();
    const gameT = (st.tick + alpha) / TICKS_PER_SECOND;
    const ctx = this.poseCtx(st);
    // wersje kolorystyczne zarządu z jego składu (także ludzie na wyprawie), zanim ktokolwiek się narysuje
    this.ludzie?.dane.przypiszZarzad(st.pawns, st.people);
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
      const pose = poseOf(p, gameT, st.things, p.kind === 'core' && this.feed.feeding(p, st.tick), ctx);
      this.poses.set(p.id, pose);
      // zmiana leżenia na podłodze uruchamia kładzenie się albo wstawanie; ostatni kierunek i leżenie członka zarządu
      // zna widok, kiedy jego pionek zniknie, a zwłoki zaczną upadek
      this.przejscia.obserwuj(p.id, pose.lie?.kind ?? null, gameT, x, y, pose.dir);
      if (p.kind === 'core' && p.person >= 0) {
        const postac = this.ludzie?.dane.postacPionka(p, st.people);
        const wersja = postac ? this.ludzie!.dane.wersjaPionka(p, postac) : 0;
        this.zwlokiNowe.zapamietaj(p.person, pose.dir, !!pose.lie, wersja);
      }
      // postać z PixelLab, gdy obsada ma tę pracę (leżącą składa lezenie.ts z jej klatki stania); szwendacze i brakujące
      // prace rysuje kod. przej, lp i ll to ten sam współdzielony wynik warstwy, więc wołamy tylko jedno z nich: co
      // najwyżej jedno jest niepuste.
      const przej = this.ludziePrzejscie(p, st, pose, gameT);
      const lp = przej ? przej.kl : this.ludzieKlatka(p, st, pose, gameT);
      const ll = lp ? null : this.ludzieLezenie(p, st, pose);
      const pl = lp ?? ll;
      sp.texture = pl
        ? pl.tex
        : pose.zpose
          ? this.zombieTexture(p.look, pose)
          : this.frameTexture(this.poseTex, this.atlas!, p.look % LOOKS, pose);
      sp.scale.x = lp?.flip ? -1 : 1;
      // kładzenie się gra klatkami stojącymi na stopach (jak zwykła klatka), więc pozycja jak u stojącego, a nie leżącego
      if (pose.lie && !przej) {
        const [hx, hy] = lieHead(pose.lie.o);
        let dx = 0;
        let dy = 0;
        if (ll) {
          sp.anchor.set(ll.ax / ll.w, ll.ay / ll.h);
          // na podłodze poza z kodu liczy położenie z komórki LIE × LIE o głowie w lieHead(o), a komórka z PixelLab ma
          // inny rozmiar i głowę gdzie indziej: jej środek ma stanąć tam, gdzie środek komórki z kodu (w łóżku
          // kotwicą jest poduszka, bez poprawki)
          if (pose.lie.kind === 'floor') {
            dx = ll.ax - ll.w / 2 - (hx - LIE / 2);
            dy = ll.ay - ll.h / 2 - (hy - LIE / 2);
          }
        } else sp.anchor.set(hx / LIE, hy / LIE);
        sp.position.set(Math.round(pose.lie.x + dx), Math.round(pose.lie.y + dy));
      } else {
        if (lp) sp.anchor.set(lp.ax / lp.w, lp.ay / lp.h);
        else sp.anchor.set(0.5, 45 / FH);
        // napierający na siatkę stoją na środkach kafelków: tłum rozsuwamy w widoku, żeby nie był jednym sprite'em
        const [jx, jy] = p.kind === 'zombie' && p.job?.phase === 2 ? this.crowdOffset(p) : [0, 0];
        // pobudka: pionek rusza z miejsca, w którym leżał (od pobudki zdążył już ruszyć ścieżką), a prawdziwe położenie
        // dogania do końca animacji, na początku powoli, na końcu szybciej, jak ktoś, kto wstał i dopiero idzie
        let px = x;
        let py = y;
        if (przej?.pr.rodzaj === 'wstawanie') {
          const e = przej.u * przej.u;
          px = przej.pr.x + (x - przej.pr.x) * e;
          py = przej.pr.y + (y - przej.pr.y) * e;
        }
        sp.position.set(Math.round((px + jx) * TILE), Math.round((py + jy) * TILE));
      }
      sp.zIndex = pose.z ?? y;
      // pod dachem nie widać nikogo; w przekroju tak; kto przeszukuje piętro sąsiada, jest na górze (M2 fala 2)
      sp.visible = (this.wnetrza || !this.underRoof(x, y)) && !(p.job?.t === 'upstairs' && p.job.phase === 1);
      // obcych widać tylko w świetle: w półmroku sam ciemny zarys, w ciemności nic (szwendacza ciemny zarys)
      if (STRANGERS.has(p.kind)) {
        const vis = strangerVisibility(this.darkness, lightAt(x, y - 0.5, lights, time, this.insideFn), p.kind);
        sp.visible &&= vis > 0.08;
        sp.alpha = Math.min(1, vis * 1.6);
        const v = Math.min(1, vis * 1.4);
        const c = Math.round(24 + 231 * v);
        sp.tint = (c << 16) | (c << 8) | Math.min(255, c + 8);
      }
      if (selected.has(p.id) && sp.visible) this.markPawn(p, x, y);
      // broń w ręce: nakładka w tej samej klatce co postać (za plecami, gdy idzie od patrzącego)
      // wrogi człowiek (napadnięty handlarz, jego ludzie) też ma broń w ręce
      const wid = (p.kind === 'core' || p.wrogi) && !pose.lie && !przej ? (p.weapon ?? null) : null;
      let ws = this.weaponSprites.get(p.id);
      // postać z PixelLab celuje z pistoletem narysowanym w klatkach, więc nakładka broni tylko przy innych pozach
      // (klatka zastępcza, czyli stanie mieszkańca bez celowania, broni nie ma: nakładka rysuje się jak przy kodzie)
      if (wid && pose.arm && sp.visible && !(lp && !lp.zastepcza && pose.arm === 'aim' && !thrusts(wid))) {
        if (!ws) {
          ws = new Sprite(Texture.EMPTY);
          this.actors.addChild(ws);
          this.weaponSprites.set(p.id, ws);
        }
        ws.texture = this.weaponTexture(wid, pose.arm, pose.dir, pose.frame);
        ws.anchor.set(0.5, ANCHOR_Y / CELL);
        ws.position.copyFrom(sp.position);
        // klatki ciosu z PixelLab mają dłoń gdzie indziej niż klatki z kodu: przesunięcie z pomiaru (bronPixellab.ts)
        if (lp && !lp.zastepcza) {
          const [kx, ky] = korektaDloni(pose.arm, pose.dir, pose.frame);
          ws.position.x += kx;
          ws.position.y += ky;
        }
        ws.zIndex = sp.zIndex + (pose.dir === 1 ? -0.001 : 0.001);
        ws.visible = true;
      } else if (ws) ws.visible = false;
      // ktoś z zarządu za koroną drzewa: jego zarys na wierzchu (korona zostaje pełna); nocą zaznaczeni
      // dostają słabszy zarys, żeby nie ginęli w ciemności
      const behind = p.kind === 'core' && sp.visible && !pose.lie && this.trees.covering(x, y);
      const lost = !behind && sp.visible && selected.has(p.id) && this.darkness > NIGHT_MARKS;
      let xr = this.xraySprites.get(p.id);
      if (behind || lost) {
        if (!xr) {
          xr = new Sprite(Texture.EMPTY);
          this.xray.addChild(xr);
          this.xraySprites.set(p.id, xr);
        }
        xr.alpha = behind ? 0.85 : 0.5;
        xr.texture = pl ? pl.tex : this.frameTexture(this.outlineTex, this.outline!, p.look % LOOKS, pose);
        xr.scale.x = sp.scale.x;
        xr.anchor.copyFrom(sp.anchor);
        xr.position.copyFrom(sp.position);
        xr.visible = true;
      } else if (xr) xr.visible = false;
    }
    for (const [id, sp] of this.pawnSprites)
      if (!seen.has(id)) {
        sp.destroy();
        this.pawnSprites.delete(id);
        this.ludzie?.dane.zapomnij(id);
        this.przejscia.zapomnij(id);
        this.poses.delete(id);
        this.feed.forget(id);
        this.xraySprites.get(id)?.destroy();
        this.xraySprites.delete(id);
        this.weaponSprites.get(id)?.destroy();
        this.weaponSprites.delete(id);
      }
    this.drawCorpses(st, gameT);
    this.drawCombat(st);
    // dym z kozy (przez okno) i z ogniska, z czasu gry; widać go także przy dachu
    this.smoke.update(
      smokeSources(this.drawn, this.scene.w),
      gameT,
      this.darkness,
      z,
      (px, py) => this.wnetrza && this.underRoof(px / TILE, py / TILE),
    );
    // noc: ciemność z godziny gry, światła z gry i z listy
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.width, this.height);
    this.light.update(x0, y0, x1, y1, z, this.darkness, lights, time, this.insideFn);
  }

  /** klatka postaci z PixelLab dla pionka w pozie albo null (kod): nie szwendacz, nie leży, obsada ma tę pracę */
  private ludzieKlatka(p: Pawn, st: SimState, pose: PoseView, gameT: number) {
    if (!this.ludzie || pose.zpose || pose.lie) return null;
    const postac = this.ludzie.dane.postacPionka(p, st.people);
    if (!postac) return null;
    // dzida bije pchnięciem w pozie celowania, ale klatki celowania z PixelLab mają pistolet w rękach: pchnięcie to cios
    const pv: PoseView =
      pose.pose === 'aim' && thrusts(p.weapon) ? { ...pose, pose: 'swing', frame: pose.frame === 0 ? 0 : 1 } : pose;
    // czas pionka jak w poseOf: pionki nie pracują w takt
    return this.ludzie.klatka(
      postac,
      pv,
      p.pi < p.path.length,
      gameT + (p.id % 7) * 0.13,
      this.ludzie.dane.wersjaPionka(p, postac),
    );
  }

  /** klatka przejścia pionka z PixelLab (kładzenie się albo wstawanie na podłodze), jego przejście i postęp od 0 do 1;
      null: brak przejścia, postać nie ma animacji (wtedy leży od razu, a po pobudce od razu stoi) albo przejście właśnie
      się skończyło (znika). Animacja jest z zachodu albo jego lustra, po stronie głowy leżącego (z kierunku pionka z
      chwili leżenia), więc łączy się z komórką leżenia bez skoku. */
  private ludziePrzejscie(p: Pawn, st: SimState, pose: PoseView, gameT: number) {
    const pr = this.przejscia.aktywne(p.id);
    if (!pr) return null;
    const postac = this.ludzie && !pose.zpose ? this.ludzie.dane.postacPionka(p, st.people) : null;
    const n = postac ? this.ludzie!.dane.klatekPrzejscia(postac, pr.rodzaj) : 0;
    const czas = gameT - pr.start;
    const kl =
      postac && n > 0
        ? this.ludzie!.przejscie(
            postac,
            pr.rodzaj,
            kierunekAnimacjiLezenia(STRONA_PODLOGI[pr.dir & 3]),
            czas,
            this.ludzie!.dane.wersjaPionka(p, postac),
          )
        : null;
    if (!kl) {
      this.przejscia.zakoncz(p.id);
      return null;
    }
    return { kl, pr, u: Math.min(1, Math.max(0, czas / czasPrzejscia(pr.rodzaj, n))) };
  }

  /** komórka leżenia postaci z PixelLab dla leżącego pionka (w łóżku albo na podłodze) albo null (kod): nie szwendacz,
      obsada ma jego postać z klatką stania przodem. Postać z kładzeniem i wstawaniem leży na podłodze głową po stronie,
      po której kończy się jej upadek w kierunku pionka (STRONA_PODLOGI), żeby przejście łączyło się z leżeniem. */
  private ludzieLezenie(p: Pawn, st: SimState, pose: PoseView) {
    if (!this.ludzie || pose.zpose || !pose.lie) return null;
    const postac = this.ludzie.dane.postacPionka(p, st.people);
    if (!postac) return null;
    const o =
      pose.lie.kind === 'floor' && this.ludzie.dane.maPrzejscie(postac, 'wstawanie')
        ? STRONA_PODLOGI[pose.dir & 3]
        : pose.lie.o;
    return this.ludzie.lezenie(postac, this.ludzie.dane.wersjaPionka(p, postac), o, pose.lie.kind);
  }

  /** postać zwłok człowieka z PixelLab, jej wersja kolorystyczna i indeks osoby zmarłego z zarządu (−1: inny zmarły).
      Zmarły z zarządu to ta sama postać co za życia (wpis zmarłych zna id osoby), inni to dorosły mieszkaniec po
      wyglądzie z gry (rzecz zna tylko wygląd). null: zwłoki rysuje kod */
  private zwlokiPostac(st: SimState, t: { id: number; n: number; dead?: number }) {
    if (!this.ludzie) return null;
    const zmarly = t.dead !== undefined ? st.dead?.[t.dead] : undefined;
    const osoba = zmarly?.kind === 'core' && zmarly.id ? st.people.findIndex((q) => q.id === zmarly.id) : -1;
    const dane = this.ludzie.dane;
    const postac = (osoba >= 0 ? dane.postacOsoby(osoba, st.people, true) : null) ?? dane.postacZwlok(t.n);
    if (!postac) return null;
    const wersja = dane.wersjaPionka(
      { id: t.id, kind: osoba >= 0 ? 'core' : 'zwloki', person: osoba, look: t.n },
      postac,
    );
    return { postac, wersja, osoba };
  }

  /** zwłoki bez upadku z PixelLab, na podłodze: komórka leżenia z klatki stania; jej środek to środek ciała, więc kładzie
      się ją środkiem kafelka. null: zwłoki rysuje kod */
  private zwlokiLudzi(zw: { postac: PostacLudzi; wersja: number }, o: number) {
    return this.ludzie?.lezenie(zw.postac, zw.wersja, o, 'floor') ?? null;
  }

  /** klatka z atlasu (upadek albo ostatnia klatka upadku) na sprite'cie zwłok: kotwica w środku leżącego ciała */
  private ustawKlatke(sp: Sprite, kl: KlatkaTekstury): void {
    sp.texture = kl.tex;
    sp.anchor.set(kl.ax / kl.w, kl.ay / kl.h);
    sp.scale.x = kl.flip ? -1 : 1;
  }

  /** klatka atlasu szwendaczy: chód albo ugryzienie, kierunek, klatka */
  private zombieTexture(look: number, pv: PoseView): Texture {
    const k = ((((look % 16) * 2 + (pv.zpose === 'bite' ? 1 : 0)) * 4 + pv.dir) * 4 + pv.frame) | 0;
    let tex = this.zTex.get(k);
    if (!tex) {
      const [x, y, w, h] = zFrameRect(look, pv.zpose ?? 'lurch', pv.dir, pv.frame);
      tex = new Texture({ source: this.zatlas!, frame: new Rectangle(x, y, w, h) });
      this.zTex.set(k, tex);
    }
    return tex;
  }

  /** trup szwendacza na ziemi (wygląd, strona głowy): w zTex pod ujemnym kluczem, jak leżenie w frameTexture */
  private zombieLieTexture(look: number, o: number): Texture {
    const k = -1 - ((look % ZLOOKS) * 4 + (o & 3));
    let tex = this.zTex.get(k);
    if (!tex) {
      const [x, y, w, h] = zLieRect(look, o);
      tex = new Texture({ source: this.zatlas!, frame: new Rectangle(x, y, w, h) });
      this.zTex.set(k, tex);
    }
    return tex;
  }

  /** komórka nakładki broni */
  private weaponTexture(id: WeaponId, pose: ArmPose, dir: number, f: number): Texture {
    const k = `${id}:${pose}:${dir}:${f}`;
    let tex = this.wTex.get(k);
    if (!tex) {
      const [x, y, w, h] = weaponRect(id, pose, dir, f);
      tex = new Texture({ source: this.warms!, frame: new Rectangle(x, y, w, h) });
      this.wTex.set(k, tex);
    }
    return tex;
  }

  /** zwłoki ludzi (postać z PixelLab albo atlas ludzi z kodu, leżenie na podłodze) i trupy szwendaczy (atlas szwendaczy)
      na ziemi. Zwłoki członka zarządu, który zginął podczas gry, upadają (animacja z PixelLab, raz) i zostają na jej
      ostatniej klatce; te z wczytanej gry albo po śmierci we śnie leżą od razu. Inne zwłoki to komórka leżenia. */
  private drawCorpses(st: SimState, gameT: number): void {
    const seen = new Set<number>();
    for (const t of st.things) {
      if (t.kind !== 'zwloki' && t.kind !== 'trup') continue;
      seen.add(t.id);
      // pierwsze pytanie o rzecz po pierwszej klatce widoku to zgon, który zdarzył się podczas gry
      const nowe = this.zwlokiNowe.nowe(t.id);
      let sp = this.corpseSprites.get(t.id);
      if (!sp) {
        const o = t.id & 3;
        const zw = t.kind === 'zwloki' ? this.zwlokiPostac(st, t) : null;
        const upadek = zw && this.ludzie!.dane.maPrzejscie(zw.postac, 'smierc');
        // kierunek upadku: ostatni, w którym patrzył zmarły (pionek znika w tym samym ticku), albo z numeru rzeczy
        const dir = zw && nowe ? this.zwlokiNowe.kierunekZgonu(zw.osoba, t.id) : kierunekZwlok(t.id);
        // zwłoki nowe mają to ubranie, w którym zginął pionek (wersja zwłok z danych to oryginał)
        const wersja = (zw && nowe ? this.zwlokiNowe.wersjaZgonu(zw.osoba) : undefined) ?? zw?.wersja ?? 0;
        const lz = zw && !upadek ? this.zwlokiLudzi(zw, o) : null;
        const tex = lz
          ? lz.tex
          : upadek
            ? Texture.EMPTY
            : t.kind === 'trup'
              ? this.zombieLieTexture(t.n, o)
              : this.frameTexture(this.poseTex, this.atlas!, t.n % LOOKS, {
                  pose: 'walk',
                  dir: 0,
                  frame: 0,
                  lie: { kind: 'floor', o, x: 0, y: 0 },
                });
        sp = new Sprite(tex);
        sp.anchor.set(0.5, 0.5);
        if (zw && upadek) {
          // ostatnia klatka upadku to leżenie; gdy zwłoki są nowe, upadek gra od początku (poniżej)
          this.ustawKlatke(sp, this.ludzie!.zwloki(zw.postac, dir, wersja)!);
          if (nowe && !this.zwlokiNowe.lezal(zw.osoba))
            this.upadki.set(t.id, { start: gameT, dir, postac: zw.postac, wersja });
        }
        sp.position.set((t.x + 0.5) * TILE, (t.y + 0.5) * TILE);
        // leży na ziemi: rysuje się przed tymi, którzy stoją nad nim
        sp.zIndex = t.y + 0.3;
        this.actors.addChild(sp);
        this.corpseSprites.set(t.id, sp);
      }
      sp.visible = this.wnetrza || !this.underRoof(t.x + 0.5, t.y + 0.5);
    }
    for (const [id, sp] of this.corpseSprites)
      if (!seen.has(id)) {
        sp.destroy();
        this.corpseSprites.delete(id);
        this.upadki.delete(id);
      }
    // upadki w toku: klatka z czasu od startu, a po ostatniej sprite zostaje na klatce, na której leżą zwłoki
    for (const [id, u] of this.upadki) {
      const sp = this.corpseSprites.get(id);
      const kl = sp && this.ludzie?.przejscie(u.postac, 'smierc', u.dir, gameT - u.start, u.wersja);
      if (sp && kl) {
        this.ustawKlatke(sp, kl);
        continue;
      }
      const lezy = this.ludzie?.zwloki(u.postac, u.dir, u.wersja);
      if (sp && lezy) this.ustawKlatke(sp, lezy);
      this.upadki.delete(id);
    }
    this.zwlokiNowe.koniecKlatki();
  }

  /** rozsunięcie napierającego szwendacza (kafelki): od siatki, którą naciska (job.target), wzdłuż niej i w głąb ulicy */
  private crowdOffset(p: Pawn): [number, number] {
    const size = this.scene!.w.size;
    const t = p.job!.target;
    const dx = (t % size) + 0.5 - p.x;
    const dy = Math.floor(t / size) + 0.5 - p.y;
    const away: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [dx > 0 ? -1 : 1, 0] : [0, dy > 0 ? -1 : 1];
    return crowdJitter(p.id, t >= 0 ? away : [0, 1]);
  }

  /** paski życia rannych w walce i krąg hałasu po strzale (w warstwie zaznaczeń) */
  private drawCombat(st: SimState): void {
    const g = this.marks;
    for (const p of st.pawns) {
      if (p.away) continue;
      const sp = this.pawnSprites.get(p.id);
      if (!sp?.visible || sp.alpha < 0.3) continue;
      const max =
        p.kind === 'zombie'
          ? ZOMBIE_HP
          : p.kind === 'szabrownik'
            ? STRANGER_HP
            : p.kind === 'handlarz'
              ? TRADER_HP
              : p.kind === 'wedrowiec' || p.kind === 'obcy'
                ? WANDERER_HP
                : p.kind === 'zbir'
                  ? ZBIR_HP
                  : 100;
      const hp = p.needs ? p.needs.health : (p.hp ?? max);
      const busy =
        p.kind === 'zombie' ||
        p.kind === 'szabrownik' ||
        ((p.kind === 'handlarz' || p.kind === 'wedrowiec' || p.kind === 'obcy') && p.job?.phase === 3) ||
        !!p.wrogi ||
        p.job?.t === 'fight' ||
        (p.job?.t === 'guard' && p.job.phase === 1) ||
        p.bite !== undefined;
      if (!busy || hp >= max) continue;
      const v = Math.max(0, hp / max);
      const x = sp.x - 10;
      const y = sp.y - 46;
      g.rect(x - 1, y - 1, 22, 5).fill({ color: 0x14100e, alpha: 0.85 });
      g.rect(x, y, 20 * v, 3).fill({ color: v > 0.6 ? 0x7cc46a : v > 0.3 ? 0xe6a540 : 0xde5a43 });
    }
    for (const n of st.noise ?? []) {
      if (n.r < 20) continue;
      const age = Math.min(1, (st.tick - (n.until - NOISE_TICKS)) / NOISE_TICKS);
      g.circle(n.x * TILE, n.y * TILE, Math.max(1, n.r * TILE * age)).stroke({
        width: 3,
        color: 0xffe0a0,
        alpha: 0.45 * (1 - age),
      });
    }
  }

  /** klatka atlasu ludzi (albo zarysów) dla pozy; tekstury tworzone przy pierwszym użyciu */
  private frameTexture(cache: Map<number, Texture>, source: TextureSource, look: number, pv: PoseView): Texture {
    // klucz: pozy nieujemne (wygląd, poza, kierunek, klatka), leżenie ujemne (wygląd, łóżko albo podłoga, strona)
    const k = pv.lie
      ? -1 - (look * 8 + (pv.lie.kind === 'bed' ? 0 : 4) + pv.lie.o)
      : ((look * POSES.length + POSES.indexOf(pv.pose)) * 4 + pv.dir) * 4 + pv.frame;
    let tex = cache.get(k);
    if (!tex) {
      const [x, y, w, h] = pv.lie ? lieRect(look, pv.lie.kind, pv.lie.o) : frameRect(look, pv.pose, pv.dir, pv.frame);
      tex = new Texture({ source, frame: new Rectangle(x, y, w, h) });
      cache.set(k, tex);
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

  /** pionek pod punktem ekranu (tylko rdzeń). Bez przekroju piętra bez sprawdzania widoczności, jak zawsze (parter
      i piętro wybrane, ale oglądane z daleka); gdy widać przekrój piętra od pierwszego, wnętrza parteru są schowane pod
      stropem albo dachem, więc ukrytego nie da się kliknąć */
  pick(st: SimState, sx: number, sy: number): Pawn | null {
    const [wx, wy] = this.toWorld(sx, sy);
    const aktywne = this.pietroAktywne();
    return pawnAt(st.pawns, wx / TILE, wy / TILE, (p) => isBoard(p) && (!aktywne || !this.underRoof(p.x, p.y)));
  }

  /** mieszkaniec siedziby pod punktem ekranu: tylko pionki `resident` z osobą z generatora (person ≥ 0), bo tylko
      one mają kartę, i tylko widoczne (pod dachem bez przekroju nikogo nie widać, więc nie da się go kliknąć).
      Zarząd ma pierwszeństwo, więc wołający pyta najpierw `pick`. */
  pickResident(st: SimState, sx: number, sy: number): Pawn | null {
    const [wx, wy] = this.toWorld(sx, sy);
    return pawnAt(st.pawns, wx / TILE, wy / TILE, (p) => isLokator(p) && (this.wnetrza || !this.underRoof(p.x, p.y)));
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
