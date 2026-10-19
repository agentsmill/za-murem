/* Zamówienia kawałków mapy. Widok co klatkę układa listę brakujących kawałków od środka ekranu,
   a malarz je rysuje: pula workerów z OffscreenCanvas (kilka kawałków naraz, poza głównym wątkiem)
   albo, gdy przeglądarka tego nie umie, główny wątek w limicie czasu na klatkę, jak dawniej.
   Zamówienie, które jeszcze nie trafiło do workera, a zniknęło z nowej listy (kawałek wyszedł
   z ekranu), przepada. Zmiana na mapie (ścięte drzewo, inny teren) idzie do workerów jako łatka
   sceny, a dotknięte kawałki dostają nową wersję: kawałek narysowany ze starych danych przepada.
   Otwarty sąsiedni budynek (M2 fala 2) to też łatka: jego wnętrze dokłada się do przekroju
   (dolozCzesc z section.ts), a wygląd drzwi sąsiadów (wyważone, zabite) idzie razem z nim.
   Kwadraty miasta obok domu (src/world/kwadraty.ts) to osobne sceny: zamówienie niesie numer kwadratu `q` (brak: dom),
   plan zamówień mieści się w budżecie tekstur (dalekie w kilkuset sztukach, a przy dużym oddaleniu poziom „bardzo
   daleko”, 2 px na kafelek), a pula workerów dostaje scenę kwadratu dopiero przy pierwszym zamówieniu i trzyma ich
   najwyżej MAX_SCEN_WORKERA (najdawniej użyta wypada). Szwy między kwadratami to łatki sceny (szew.ts).
   Moduł nie zależy od PixiJS, więc da się go sprawdzić w Node. */

import { drawChunk } from './art/chunkArt.ts';
import { CHUNK, type ChunkScene, chunkSceneOf, type Scene, treeChunks } from './art/scene.ts';
import { type DaneSzwu, nalozSzew } from './art/szew.ts';
import { type DoorLook, dolozCzesc, type SectionPart, type SectionScene, ustawDrzwi } from './section.ts';

/** pikseli grafiki na kafelek: z bliska, z daleka i (przy dużym oddaleniu kilku kwadratów) bardzo daleko */
export const LOD_NEAR = 32;
export const LOD_FAR = 8;
export const LOD_VERY_FAR = 2;

/** zoom, od którego rysują się kawałki z bliska (i przekroje), i zoom, poniżej którego (przy kilku kwadratach) kawałki
    rysują się bardzo daleko */
export const ZOOM_NEAR = 0.5;
export const ZOOM_VERY_FAR = 0.125;

/** zamówienie: kawałek k (cy*n + cx) w skali s, w wersji v (rośnie po każdej zmianie na mapie) */
export interface Order {
  k: number;
  s: number;
  v: number;
  /** przekrój: wnętrze zamiast dachu (tylko z bliska) */
  cut?: boolean;
  /** numer kwadratu w widoku; brak: dom (kwadrat 0) */
  q?: number;
}

/** gotowy kawałek: płótno z głównego wątku albo ImageBitmap z workera */
export interface Done extends Order {
  src: HTMLCanvasElement | ImageBitmap;
}

/** kawałki z prostokąta [cx0, cx1]×[cy0, cy1] (indeksy cy*n + cx), od najbliższego kawałkowi (ccx, ccy) */
export function chunksByDistance(
  n: number,
  cx0: number,
  cy0: number,
  cx1: number,
  cy1: number,
  ccx: number,
  ccy: number,
): number[] {
  const order: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push(cy * n + cx);
  const dist = (k: number) => Math.abs((k % n) - ccx) + Math.abs(((k / n) | 0) - ccy);
  return order.sort((a, b) => dist(a) - dist(b));
}

/**
 * Lista zamówień, najważniejsze pierwsze:
 * 1. widoczne kawałki bez żadnej pasującej tekstury dostają szybki daleki (16 razy mniej pikseli),
 *    żeby zamiast dziury od razu coś było widać,
 * 2. z bliska: widoczne kawałki bez bliskiej tekstury, a gdzie trzeba przekroju (cutOf), bez
 *    przekroju (dach z bliska wystarczy do tego czasu jako zaślepka),
 * 3. reszta dalekich w tle, żeby oddalenie było od razu gotowe.
 */
export function planOrders(
  vis: readonly number[],
  total: number,
  has: (k: number, s: number, cut?: boolean) => boolean,
  near: boolean,
  ver: (k: number) => number = () => 0,
  cutOf: (k: number) => boolean = () => false,
): Order[] {
  const out: Order[] = [];
  const queued = new Uint8Array(total);
  for (const k of vis)
    if (!has(k, LOD_FAR) && !(near && (has(k, LOD_NEAR) || (cutOf(k) && has(k, LOD_NEAR, true))))) {
      out.push({ k, s: LOD_FAR, v: ver(k) });
      queued[k] = 1;
    }
  if (near)
    for (const k of vis) {
      if (cutOf(k)) {
        if (!has(k, LOD_NEAR, true)) out.push({ k, s: LOD_NEAR, v: ver(k), cut: true });
      } else if (!has(k, LOD_NEAR)) out.push({ k, s: LOD_NEAR, v: ver(k) });
    }
  for (let k = 0; k < total; k++) if (!queued[k] && !has(k, LOD_FAR)) out.push({ k, s: LOD_FAR, v: ver(k) });
  return out;
}

/** poziom szczegółów widoku: z bliska (32 px na kafelek, przekroje), daleko (8 px) albo bardzo daleko (2 px) */
export type Poziom = 'blisko' | 'daleko' | 'bardzo-daleko';

/**
 * Poziom szczegółów z zoomu. Bardzo daleko tylko przy kilku kwadratach: sam dom (144 kawałki) mieści się w budżecie
 * dalekich tekstur przy każdym oddaleniu i rysuje się jak zawsze.
 */
export function poziomZoomu(zoom: number, wieleKwadratow: boolean): Poziom {
  if (zoom >= ZOOM_NEAR) return 'blisko';
  return wieleKwadratow && zoom < ZOOM_VERY_FAR ? 'bardzo-daleko' : 'daleko';
}

/** ile tekstur kawałków każdego poziomu wolno trzymać w pamięci (łącznie ze wszystkich kwadratów) */
export interface Budzety {
  /** bliskie razem z przekrojami: 4 MiB sztuka */
  bliskie: number;
  /** dalekie, 8 px na kafelek: 256 KiB sztuka (144 to wszystkie kawałki jednego kwadratu) */
  dalekie: number;
  /** bardzo dalekie, 2 px na kafelek: 16 KiB sztuka (3600 to pięć na pięć kwadratów) */
  bardzoDalekie: number;
}

export function budzety(telefon: boolean): Budzety {
  return telefon
    ? { bliskie: 16, dalekie: 144, bardzoDalekie: 1296 }
    : { bliskie: 48, dalekie: 432, bardzoDalekie: 3600 };
}

/**
 * Które tekstury wyrzucić z pamięci, żeby zostało najwyżej `limit`: te najdawniej widziane (uzyte to numer klatki, w której
 * kawałek ostatnio był na ekranie), nigdy widoczne w klatce `klatka`. Gdy widocznych jest więcej niż limit, nadmiar zostaje.
 */
export function ofiary<T>(kandydaci: readonly { id: T; uzyte: number }[], limit: number, klatka: number): T[] {
  const nadmiar = kandydaci.length - limit;
  if (nadmiar <= 0) return [];
  return kandydaci
    .filter((c) => c.uzyte !== klatka)
    .sort((a, b) => a.uzyte - b.uzyte)
    .slice(0, nadmiar)
    .map((c) => c.id);
}

/** kawałek wielu kwadratów: numer kwadratu i numer kawałka w nim */
export interface Kawalek {
  q: number;
  k: number;
}

/** to, czego plan zamówień dla wielu kwadratów potrzebuje od widoku */
export interface PlanWiele {
  /** widoczne kawałki wszystkich kwadratów, od najbliższego środka ekranu */
  vis: readonly Kawalek[];
  /** kandydaci do rysowania w tle (zwykle wszystkie kawałki, od najbliższego kamerze) */
  tlo: readonly Kawalek[];
  has(q: number, k: number, s: number, cut?: boolean): boolean;
  ver(q: number, k: number): number;
  cutOf(q: number, k: number): boolean;
  /** ile zamówień w tle wolno dołożyć: budżet tekstur poziomu minus to, co już jest i czeka jako widoczne */
  zapas: number;
}

/**
 * Lista zamówień dla wielu kwadratów, najważniejsze pierwsze (dla jednego kwadratu i dowolnego zapasu to samo co
 * planOrders):
 * 1. widoczne kawałki bez żadnej pasującej tekstury dostają szybką daleką (bardzo dalekie bez dalekiej ani bardzo dalekiej),
 * 2. z bliska: widoczne bez bliskiej tekstury, a gdzie trzeba przekroju, bez przekroju,
 * 3. tło: kawałki bez tekstury poziomu (daleko albo bardzo daleko) w kolejności `tlo`, najwyżej `zapas`.
 * Przy oddaleniu nie ma zamówień bliskich, a przy „bardzo daleko” dalekich.
 */
export function planOrdersWiele(poziom: Poziom, p: PlanWiele): Order[] {
  const out: Order[] = [];
  const near = poziom === 'blisko';
  const tier = poziom === 'bardzo-daleko' ? LOD_VERY_FAR : LOD_FAR;
  const queued = new Set<number>();
  const id = (c: Kawalek) => c.q * 4096 + c.k;
  const order = (c: Kawalek, s: number, cut?: boolean): Order => ({
    k: c.k,
    s,
    v: p.ver(c.q, c.k),
    ...(cut ? { cut: true } : {}),
    ...(c.q ? { q: c.q } : {}),
  });
  for (const c of p.vis) {
    const brak =
      tier === LOD_VERY_FAR
        ? !p.has(c.q, c.k, LOD_VERY_FAR) && !p.has(c.q, c.k, LOD_FAR)
        : !p.has(c.q, c.k, LOD_FAR) &&
          !(near && (p.has(c.q, c.k, LOD_NEAR) || (p.cutOf(c.q, c.k) && p.has(c.q, c.k, LOD_NEAR, true))));
    if (brak) {
      out.push(order(c, tier));
      queued.add(id(c));
    }
  }
  if (near)
    for (const c of p.vis) {
      if (p.cutOf(c.q, c.k)) {
        if (!p.has(c.q, c.k, LOD_NEAR, true)) out.push(order(c, LOD_NEAR, true));
      } else if (!p.has(c.q, c.k, LOD_NEAR)) out.push(order(c, LOD_NEAR));
    }
  let zapas = p.zapas;
  for (const c of p.tlo) {
    if (zapas <= 0) break;
    if (queued.has(id(c)) || p.has(c.q, c.k, tier)) continue;
    out.push(order(c, tier));
    zapas--;
  }
  return out;
}

/** zmiana na mapie, po której trzeba przerysować kawałki */
export interface MapChange {
  /** kafelki ze zmienionym terenem (w.terr już zmienione); przerysują się też sąsiedzi */
  tiles?: readonly number[];
  /** drzewa, które zniknęły, np. ścięte (numery w w.trees) */
  felled?: readonly number[];
  /** naprawione uszkodzenia w przekroju (kafelki z section.damage) */
  fixed?: readonly number[];
  /** M2 fala 2: wnętrza otwartych sąsiednich budynków do dołożenia do przekroju */
  wnetrze?: readonly SectionPart[];
  /** wygląd drzwi sąsiadów (wyważone, zabite deskami, zwykłe) */
  drzwi?: readonly DoorLook[];
  /** widok pięter: piętro, które rysuje przekrój (0: parter), i scena typowego piętra (podaje się raz, potem
      wystarczy samo piętro). chunksTouched tego nie zna, więc samo GameView.redraw nic by nie unieważniło:
      piętro zmienia się przez GameView.ustawPietro, które zwiększa wersje kawałków z przekrojem. */
  pietro?: number;
  pietra?: SectionScene;
}

/**
 * Kawałki do przerysowania po zmianie, rosnąco: kafelek z ośmioma sąsiadami (krawędzie terenu
 * i ścian zależą od sąsiadów, także za granicą kawałka), drzewo ze wszystkimi kawałkami,
 * w których rysuje się jego korona albo cień, i cały prostokąt dołożonego wnętrza z zapasem kafelka.
 */
export function chunksTouched(sc: ChunkScene, ch: MapChange): number[] {
  const size = sc.w.size;
  const n = sc.chunks;
  const set = new Set<number>();
  for (const p of ch.wnetrze ?? [])
    for (
      let cy = Math.floor(Math.max(0, p.y0 - 1) / CHUNK);
      cy <= Math.floor(Math.min(size - 1, p.y0 + p.h) / CHUNK);
      cy++
    )
      for (
        let cx = Math.floor(Math.max(0, p.x0 - 1) / CHUNK);
        cx <= Math.floor(Math.min(size - 1, p.x0 + p.w) / CHUNK);
        cx++
      )
        set.add(cy * n + cx);
  for (const i of [...(ch.tiles ?? []), ...(ch.fixed ?? []), ...(ch.drzwi ?? []).map((d) => d.tile)]) {
    const x = i % size;
    const y = (i - x) / size;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        set.add(Math.floor(yy / CHUNK) * n + Math.floor(xx / CHUNK));
      }
  }
  for (const k of ch.felled ?? []) for (const c of treeChunks(sc.w.trees[k], n)) set.add(c);
  return [...set].sort((a, b) => a - b);
}

/** łatka sceny dla workerów: nowe wartości zmienionych kafelków i ścięte drzewa */
export interface ScenePatch {
  /** numer kwadratu, którego sceny dotyczy łatka; brak: dom */
  q?: number;
  tiles: number[];
  terr: number[];
  felled: number[];
  /** naprawione uszkodzenia (kafelki), znikają z section.damage */
  fixed?: number[];
  /** wnętrza sąsiadów i wygląd ich drzwi (M2 fala 2) */
  wnetrze?: SectionPart[];
  drzwi?: DoorLook[];
  /** widok pięter: nowe piętro i scena typowego piętra (tylko gdy zmiana je podała) */
  pietro?: number;
  pietra?: SectionScene;
  /** szwy z sąsiednimi kwadratami: pasy terenu, ciągi budynków i cień sąsiada (szew.ts) */
  szwy?: DaneSzwu[];
}

export function scenePatchOf(sc: ChunkScene, ch: MapChange): ScenePatch {
  const tiles = [...(ch.tiles ?? [])];
  return {
    tiles,
    terr: tiles.map((i) => sc.w.terr[i]),
    felled: [...(ch.felled ?? [])],
    fixed: [...(ch.fixed ?? [])],
    ...(ch.wnetrze?.length ? { wnetrze: [...ch.wnetrze] } : {}),
    ...(ch.drzwi?.length ? { drzwi: [...ch.drzwi] } : {}),
    ...(ch.pietro !== undefined ? { pietro: ch.pietro } : {}),
    ...(ch.pietra ? { pietra: ch.pietra } : {}),
  };
}

/** nakłada łatkę na kopię sceny w workerze */
export function applyScenePatch(sc: ChunkScene, p: ScenePatch): void {
  p.tiles.forEach((i, k) => {
    sc.w.terr[i] = p.terr[k];
  });
  for (const k of p.felled) sc.treeGone[k] = 1;
  for (const i of p.fixed ?? []) sc.section?.damage?.delete(i);
  if (sc.section) {
    for (const part of p.wnetrze ?? []) dolozCzesc(sc.section, part, sc.w.size);
    for (const d of p.drzwi ?? []) ustawDrzwi(sc.section, d);
  }
  if (p.pietro !== undefined) sc.pietro = p.pietro;
  if (p.pietra) sc.pietra = p.pietra;
  for (const d of p.szwy ?? []) nalozSzew(sc, d);
}

export interface ChunkPainter {
  /** gdzie się rysuje (do pomiarów) */
  readonly kind: string;
  /** rysowanie poza głównym wątkiem padło: trzeba przejść na główny wątek */
  readonly failed: boolean;
  /** scena domu (kwadrat 0): zaczyna nowy rysunek, kwadraty obok domu są zapominane */
  setScene(sc: Scene): void;
  /** scena kwadratu obok domu o numerze q (od 1): rysowanie z niej na zamówienia z tym q; worker dostaje ją dopiero
      przy pierwszym zamówieniu */
  dodajScene(q: number, sc: Scene): void;
  /** nowa lista zamówień zastępuje poprzednią; budżet (ms) dotyczy rysowania w głównym wątku */
  order(list: readonly Order[], budgetMs: number): void;
  /** zmiana na mapie: kopie sceny poza głównym wątkiem dostają łatkę przed następnymi zamówieniami (p.q: kwadrat) */
  patch(p: ScenePatch): void;
  /** gotowe kawałki od ostatniego wywołania */
  take(): Done[];
  destroy(): void;
}

/** rysowanie w głównym wątku w limicie czasu na klatkę (zapas, gdy nie ma OffscreenCanvas w workerze) */
export class InlinePainter implements ChunkPainter {
  readonly kind = 'główny wątek';
  readonly failed = false;
  private scenes = new Map<number, Scene>();
  private done: Done[] = [];

  setScene(sc: Scene): void {
    this.scenes.clear();
    this.scenes.set(0, sc);
    this.done = [];
  }

  dodajScene(q: number, sc: Scene): void {
    this.scenes.set(q, sc);
  }

  order(list: readonly Order[], budgetMs: number): void {
    if (!this.scenes.size) return;
    const t0 = performance.now();
    for (const o of list) {
      if (performance.now() - t0 >= budgetMs) break;
      const sc = this.scenes.get(o.q ?? 0);
      if (!sc) continue;
      const c = document.createElement('canvas');
      drawChunk(sc, o.k % sc.chunks, (o.k / sc.chunks) | 0, o.s, c, o.cut);
      this.done.push({ k: o.k, s: o.s, v: o.v, cut: o.cut, ...(o.q ? { q: o.q } : {}), src: c });
    }
  }

  /** główny wątek rysuje z tych samych scen, które zmienia gra, więc nie ma czego łatać */
  patch(): void {}

  take(): Done[] {
    const d = this.done;
    this.done = [];
    return d;
  }

  destroy(): void {}
}

/** wiadomości do workera (q brak: dom) */
export type ToWorker =
  | { t: 'scene'; gen: number; q?: number; sc: ChunkScene }
  | { t: 'draw'; gen: number; k: number; s: number; v: number; cut?: boolean; q?: number }
  | { t: 'patch'; gen: number; p: ScenePatch }
  | { t: 'drop'; gen: number; q: number };

/** wiadomości od workera */
export type FromWorker =
  | { t: 'ready'; ok: boolean }
  | { t: 'done'; gen: number; k: number; s: number; v: number; cut?: boolean; q?: number; bmp: ImageBitmap; ms: number }
  | { t: 'fail'; err: string };

/** to, czego pula potrzebuje od workera (w testach podróbka) */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: ToWorker, opts?: StructuredSerializeOptions): void;
  terminate(): void;
}

/** ile scen (dom i kwadraty) trzyma jeden worker naraz: dom i ośmiu sąsiadów, dalsze wypierają najdawniej użyte */
export const MAX_SCEN_WORKERA = 9;

const key = (q: number, k: number, s: number, cut?: boolean) => ((q * 4096 + k) * 64 + s) * 2 + (cut ? 1 : 0);

interface Hand {
  w: WorkerLike;
  ready: boolean;
  /** klucz rysowanego zamówienia albo −1 */
  job: number;
  /** numery scen, które worker ma, od najdawniej do ostatnio użytej */
  sceny: number[];
}

/**
 * Pula workerów. Każdy dostaje scenę domu raz, potem po jednym zamówieniu naraz: następne zaraz po oddaniu
 * poprzedniego, zawsze najważniejsze z najświeższej listy. Dzięki temu anulowanie jest proste: czego nie ma na nowej
 * liście, nie pójdzie do workera. Kawałek, który worker już rysuje, dochodzi do końca i trafia do pamięci (limit
 * bliskich i tak go wyrzuci pierwszego). Scena kwadratu obok domu idzie do workera tuż przed jego pierwszym
 * zamówieniem z tego kwadratu; worker trzyma najwyżej MAX_SCEN_WORKERA scen, a gdy dojdzie następna, wypada najdawniej
 * użyta (wiadomość `drop`) i wraca przy następnym zamówieniu. Pamięć scen pilnuje więc wątek gry, nie worker.
 */
export class WorkerPainter implements ChunkPainter {
  readonly kind: string;
  failed = false;
  /** milisekundy rysowania w workerach (suma, do pomiarów) */
  workMs = 0;
  private hands: Hand[] = [];
  private queue: Order[] = [];
  private busy = new Set<number>();
  private done: Done[] = [];
  private gen = 0;
  /** sceny wątku gry: dom (0) i kwadraty obok; z nich powstają kopie dla workerów */
  private scenes = new Map<number, Scene>();

  constructor(spawn: () => WorkerLike, count: number) {
    this.kind = `worker ×${count}`;
    try {
      for (let i = 0; i < count; i++) {
        const h: Hand = { w: spawn(), ready: false, job: -1, sceny: [] };
        h.w.onmessage = (e) => this.onMessage(h, e.data as FromWorker);
        h.w.onerror = (e) => {
          e.preventDefault();
          this.fail(e.message || 'nie dało się uruchomić workera');
        };
        this.hands.push(h);
      }
    } catch (err) {
      this.fail(String(err));
    }
  }

  setScene(sc: Scene): void {
    if (this.failed) return;
    this.gen++;
    this.queue = [];
    this.busy.clear();
    for (const d of this.done) (d.src as ImageBitmap).close();
    this.done = [];
    this.scenes.clear();
    this.scenes.set(0, sc);
    // każdy worker dostaje własną kopię: tablice terenu i budynków są potrzebne też symulacji
    const msg: ToWorker = { t: 'scene', gen: this.gen, sc: chunkSceneOf(sc) };
    try {
      for (const h of this.hands) {
        h.sceny = [0];
        h.w.postMessage(msg);
      }
    } catch (err) {
      this.fail(String(err));
    }
  }

  dodajScene(q: number, sc: Scene): void {
    if (this.failed) return;
    this.scenes.set(q, sc);
    // worker, który miał poprzednią scenę o tym numerze, dostanie nową przy następnym zamówieniu
    for (const h of this.hands) {
      const i = h.sceny.indexOf(q);
      if (i >= 0) {
        h.sceny.splice(i, 1);
        h.w.postMessage({ t: 'drop', gen: this.gen, q });
      }
    }
  }

  order(list: readonly Order[]): void {
    this.queue = list.filter((o) => !this.busy.has(key(o.q ?? 0, o.k, o.s, o.cut)));
    this.pump();
  }

  take(): Done[] {
    const d = this.done;
    this.done = [];
    return d;
  }

  patch(p: ScenePatch): void {
    if (this.failed) return;
    const q = p.q ?? 0;
    for (const h of this.hands) if (h.sceny.includes(q)) h.w.postMessage({ t: 'patch', gen: this.gen, p });
  }

  destroy(): void {
    for (const h of this.hands) h.w.terminate();
    this.hands = [];
  }

  /** scena o numerze q jest w workerze: jeśli jej nie ma, idzie przed zamówieniem, a najdawniej użyta ponad limit wypada */
  private zapewnijScene(h: Hand, q: number, sc: Scene): void {
    const i = h.sceny.indexOf(q);
    if (i >= 0) {
      h.sceny.splice(i, 1);
      h.sceny.push(q);
      return;
    }
    h.w.postMessage({ t: 'scene', gen: this.gen, ...(q ? { q } : {}), sc: chunkSceneOf(sc) });
    h.sceny.push(q);
    while (h.sceny.length > MAX_SCEN_WORKERA) {
      const stara = h.sceny.shift() as number;
      h.w.postMessage({ t: 'drop', gen: this.gen, q: stara });
    }
  }

  /** wolne workery dostają najważniejsze zamówienia z kolejki */
  private pump(): void {
    for (const h of this.hands) {
      if (!h.ready || h.job >= 0) continue;
      let o = this.queue.shift();
      // zamówienie z kwadratu, którego już nie ma (nowa gra), przepada
      while (o && !this.scenes.has(o.q ?? 0)) o = this.queue.shift();
      if (!o) return;
      const q = o.q ?? 0;
      try {
        this.zapewnijScene(h, q, this.scenes.get(q) as Scene);
      } catch (err) {
        this.fail(String(err));
        return;
      }
      h.job = key(q, o.k, o.s, o.cut);
      this.busy.add(h.job);
      h.w.postMessage({ t: 'draw', gen: this.gen, k: o.k, s: o.s, v: o.v, cut: o.cut, ...(q ? { q } : {}) });
    }
  }

  private onMessage(h: Hand, m: FromWorker): void {
    if (m.t === 'fail') {
      this.fail(m.err);
      return;
    }
    if (m.t === 'ready') {
      if (!m.ok) {
        this.fail('w workerze nie ma OffscreenCanvas z kontekstem 2D');
        return;
      }
      h.ready = true;
    } else {
      h.job = -1;
      if (m.gen === this.gen) {
        this.busy.delete(key(m.q ?? 0, m.k, m.s, m.cut));
        this.done.push({ k: m.k, s: m.s, v: m.v, cut: m.cut, ...(m.q ? { q: m.q } : {}), src: m.bmp });
        this.workMs += m.ms;
      } else m.bmp.close(); // kawałek poprzedniej sceny
    }
    this.pump();
  }

  private fail(why: string): void {
    if (this.failed) return;
    this.failed = true;
    console.warn(`Kawałki mapy rysuje główny wątek, bo worker nie działa: ${why}`);
    this.destroy();
  }
}

/** czy przeglądarka w ogóle ma to, czego potrzebuje rysowanie w workerze */
export function workersAvailable(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  );
}

/** ile workerów: jeden rdzeń zostaje dla gry, na telefonie najwyżej dwa (każdy trzyma kopię sceny) */
export function poolSize(cores: number, phone: boolean): number {
  return Math.max(1, Math.min(phone ? 2 : 3, cores - 1));
}

export const spawnChunkWorker = (): WorkerLike =>
  new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module', name: 'kawałki mapy' });
