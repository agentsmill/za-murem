/* Dane pochodne do rysowania świata: liczone raz na mapę (w kilkanaście milisekund).
   - dla każdego kafelka budynku: odległość od dolnej (południowej) krawędzi w kolumnie,
   - styl każdego budynku (kolor ściany, wysokość fasady, rodzaj dachu); bloki z grafiką z PixelLab składają się
     z modułów kawałka bloku (13 px na piętro zamiast 9), a ratusze, muzea, kamienice i inne z modułów swojego
     wyglądu (lookBudynku.ts),
   - maska cieni w oczkach 8 px (4 na kafelek), drzewa pogrupowane w kawałki 32×32.
   Kwadraty miasta obok domu (src/world/kwadraty.ts) mają własne sceny. Scena kwadratu zna swój początek w układzie
   miasta (`poczatek`: szum i wzory liczą się od współrzędnych miasta, więc łączą się przez szew) i brzegi sąsiadów
   (`brzeg`: pasy terenu za krawędziami i ciągi budynków przecinanych szwem, zob. szew.ts). Bez nich (dom, gra bez
   kwadratów) scena i rysowanie są takie jak zawsze. */

import type { Pt } from '../../world/geo.ts';
import { fillRing } from '../../world/raster.ts';
import { type Dir, T, type Tree, type World, type WorldBuilding } from '../../world/world.ts';
import type { SectionScene } from '../section.ts';
import { h2 } from './hash.ts';
import { kontekstyLookow, type LookBudynku, type LookKontekst, lookBudynku } from './lookBudynku.ts';
import { C, HOUSE_WALLS, shade, WALLS } from './palette.ts';
import { type Blok, type Grafika, type GrafikaKawalkow, pasFasady, pietraWygladu } from './pixellab.ts';

export const TILE = 32; // pikseli grafiki na metr
export const CHUNK = 32; // kafelków w boku kawałka
export const SUB = 4; // oczek maski cieni na kafelek

export type RoofKind = 'tar' | 'gravel' | 'tiles' | 'metal';

export interface BStyle {
  kind: WorldBuilding['cls'];
  roof: RoofKind;
  wall: number;
  /** wysokość fasady w pikselach grafiki */
  facade: number;
  floorH: number;
  base: number;
  levels: number;
  seed: number;
  /** grzbiet dachu dwuspadowego: 'h' poziomy, 'v' pionowy, null płaski */
  ridge: 'h' | 'v' | null;
  /** położenie grzbietu w pikselach grafiki (y dla 'h', x dla 'v') */
  ridgeAt: number;
  balconies: boolean;
  /** kolor balustrad */
  accent: number;
  /** budynek z modułów grafiki z PixelLab (pas fasady, przęsła, wejście, dach z attyką) zamiast rysowanego kodem: blok
      albo jeden z 11 wyglądów (look) */
  mod?: boolean;
  /** wygląd budynku z PixelLab (kamienica, ratusz, muzeum…), gdy ma go grafika (mod jest wtedy prawdą) */
  look?: LookBudynku;
  /** liczba pięter fasady z modułów wyglądu (z danych budynku albo typowa dla wyglądu); bloki jej nie mają */
  vis?: number;
}

/** budynek w zakresie, którego potrzebuje rysowanie kawałków (`levels` bez limitu stylu: do wyboru pięter) */
export type ArtBuilding = Pick<WorldBuilding, 'id' | 'cls' | 'x0' | 'y0' | 'x1' | 'y1' | 'entrances' | 'levels'>;

/** to, czego potrzebuje rysowanie kawałków: bez reszty świata, więc da się to wysłać do workera */
export interface ChunkScene {
  w: Pick<World, 'size' | 'terr' | 'bid' | 'trees'> & { buildings: ArtBuilding[] };
  /** dla kafelka budynku: ile kafelków budynku jest pod nim w tej samej kolumnie (0 = dolny) */
  south: Int16Array;
  /** długość pionowego ciągu kafelków budynku, do którego należy kafelek */
  run: Int16Array;
  styles: BStyle[];
  /** cień: 1 = zacienione oczko (rozmiar size*SUB na bok) */
  shadow: Uint8Array;
  /** drzwi: kafelek → kierunek */
  doors: Map<number, Dir>;
  /** numery drzew (w w.trees) w kawałkach, z zapasem na koronę i cień; indeks cy*n + cx */
  treesBy: number[][];
  /** 1 = drzewa już nie ma (ścięte), kawałki rysują się bez niego */
  treeGone: Uint8Array;
  /** suche drzewo (bez liści) albo −1 */
  dryTree: number;
  /** wnętrze budynku do przekroju (w M1 siedziba) albo null */
  section: SectionScene | null;
  chunks: number;
  /** grafika z PixelLab do terenu i bloków albo null (wszystko z kodu) */
  art: GrafikaKawalkow | null;
  /** scena typowego piętra całej mapy (src/render/pietro.ts) albo null, gdy widoku pięter nie ma */
  pietra: SectionScene | null;
  /** piętro, które rysuje przekrój: 0 to parter (obraz jak zawsze), od 1 sc.pietra zamiast sc.section */
  pietro: number;
  /** początek kwadratu w pikselach grafiki układu miasta (kwadrat (sx, sy): sx·rozmiar·TILE, sy·rozmiar·TILE): szum
      (trawa, asfalt, okna, papa) liczy się od współrzędnych miasta, więc wzór łączy się przez szew; brak: dom (0, 0) */
  poczatek?: { x: number; y: number };
  /** pasy sąsiadów za krawędziami kwadratu; brak: nikogo obok (rysowanie jak zawsze, krawędź kwadratu to brzeg mapy) */
  brzeg?: Brzeg;
}

/**
 * Brzeg kwadratu: to, co rysowanie kawałków przy krawędzi wie o sąsiadach. Pasy (długość size) to kody terenu kafelków
 * sąsiada tuż za krawędzią (n: wiersz sąsiada na północy, e: jego kolumna na wschodzie i tak dalej), narożniki to kod
 * kafelka za rogiem. kontN i kontS mówią, ile kafelków tego samego budynku ciągnie się dalej za krawędzią północną i
 * południową w danej kolumnie (0: budynek się tam kończy), więc fasada i dach przeciętego budynku nie kończą się na
 * szwie. Brak pola oznacza, że sąsiada po tej stronie nie ma (rysowanie jak na brzegu mapy).
 */
export interface Brzeg {
  n?: Uint8Array;
  e?: Uint8Array;
  s?: Uint8Array;
  w?: Uint8Array;
  nw?: number;
  ne?: number;
  sw?: number;
  se?: number;
  kontN?: Uint8Array;
  kontS?: Uint8Array;
}

export interface Scene extends ChunkScene {
  w: World;
}

/** wyciąg ze sceny do workera: same dane rysowania, bez nazw, tagów i siatek symulacji */
export function chunkSceneOf(sc: Scene): ChunkScene {
  const { size, terr, bid, trees, buildings } = sc.w;
  return {
    w: {
      size,
      terr,
      bid,
      trees,
      buildings: buildings.map(({ id, cls, x0, y0, x1, y1, entrances, levels }) => ({
        id,
        cls,
        x0,
        y0,
        x1,
        y1,
        entrances,
        levels,
      })),
    },
    south: sc.south,
    run: sc.run,
    styles: sc.styles,
    shadow: sc.shadow,
    doors: sc.doors,
    treesBy: sc.treesBy,
    treeGone: sc.treeGone,
    dryTree: sc.dryTree,
    section: sc.section,
    chunks: sc.chunks,
    art: sc.art,
    pietra: sc.pietra,
    pietro: sc.pietro,
    ...(sc.poczatek ? { poczatek: sc.poczatek } : {}),
    ...(sc.brzeg ? { brzeg: sc.brzeg } : {}),
  };
}

/** kawałki, w których rysuje się drzewo (korona sięga w górę, cień w górę i w prawo) */
export function treeChunks(t: Tree, chunks: number): number[] {
  const m = t.r + 2;
  const cx0 = Math.max(0, Math.floor((t.x - m) / CHUNK));
  const cx1 = Math.min(chunks - 1, Math.floor((t.x + m) / CHUNK));
  const cy0 = Math.max(0, Math.floor((t.y - m - 2) / CHUNK));
  const cy1 = Math.min(chunks - 1, Math.floor((t.y + 1) / CHUNK));
  const out: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push(cy * chunks + cx);
  return out;
}

export const heightM = (levels: number) => levels * 2.8 + 1;

function styleOf(
  b: WorldBuilding,
  w: World,
  art: GrafikaKawalkow | null,
  ctx: LookKontekst | undefined,
  ziarno?: number,
): BStyle {
  const blok: Blok | null = art?.blok ?? null;
  // ziarno stylu: z numeru budynku w świecie (dom), a w kwadracie obok domu z klucza budynku (opcje sceny)
  const seed = ziarno ?? (h2(b.id, b.x0 * 7 + b.y0, w.seed) * 1e9) | 0;
  const r = (k: number) => h2(seed, k, 77);
  const depthPx = (b.y1 - b.y0 + 1) * TILE;
  let roof: RoofKind = 'tar';
  let wall: number = shade(WALLS[Math.floor(r(1) * WALLS.length)], 0.86);
  let floorH = 9;
  let base = 5;
  let ridge: BStyle['ridge'] = null;
  let ridgeAt = 0;
  let balconies = false;
  switch (b.cls) {
    case 'blok':
      balconies = r(2) < 0.75;
      break;
    case 'dom': {
      roof = 'tiles';
      wall = HOUSE_WALLS[Math.floor(r(3) * HOUSE_WALLS.length)];
      floorH = 10;
      base = 4;
      break;
    }
    case 'garaz':
      roof = 'metal';
      wall = C.metal2;
      floorH = 9;
      base = 2;
      break;
    case 'hala':
      roof = 'metal';
      wall = 0xa9aaa4;
      break;
    case 'sklep':
      roof = 'gravel';
      wall = r(4) < 0.5 ? 0xd8d4c8 : 0xb9c2c4;
      break;
    case 'szkola':
      wall = C.brick0;
      break;
    case 'kosciol':
      roof = 'tiles';
      wall = 0xd6d0c2;
      floorH = 12;
      break;
    case 'przychodnia':
      wall = 0xdddbd2;
      break;
    default:
      wall = 0xb3aea3;
  }
  const levels = Math.max(1, Math.min(b.levels, 16));
  // wygląd z PixelLab (kamienica, ratusz, muzeum…): z rodzajów punktów, nazwy i zabudowy, tylko gdy grafika go ma
  const look = art?.budynki ? lookBudynku(b, ctx) : null;
  const lg = look ? art?.budynki?.[look] : undefined;
  // budynek z modułów: fasada to pas modułów (u bloku piętro jak w module kotwicy, około 13 px)
  const mod = !!lg || (b.cls === 'blok' && blok !== null);
  const vis = lg ? pietraWygladu(lg, levels, Number.parseInt(b.tags['building:levels'], 10) > 0) : 0;
  const modul: Blok | null = lg ? lg.fasada : mod ? blok : null;
  if (modul) floorH = modul.srodek[1];
  let facade = modul ? pasFasady(modul, lg ? vis : levels).length : base + levels * floorH + 2;
  facade = Math.min(facade, Math.max(10, depthPx - 12));
  if (roof === 'tiles') {
    const wpx = (b.x1 - b.x0 + 1) * TILE;
    const roofTop = b.y0 * TILE;
    const roofBottom = (b.y1 + 1) * TILE - facade;
    if (wpx >= roofBottom - roofTop) {
      ridge = 'h';
      ridgeAt = Math.round((roofTop + roofBottom) / 2);
    } else {
      ridge = 'v';
      ridgeAt = Math.round(((b.x0 + b.x1 + 1) * TILE) / 2);
    }
  }
  const accent = [0x8a8f86, 0x9a5b3c, 0x5f7a8c, 0xb8a86a, 0x6e8a5a, 0xc7c2b6][Math.floor(r(9) * 6)];
  const st: BStyle = { kind: b.cls, roof, wall, facade, floorH, base, levels, seed, ridge, ridgeAt, balconies, accent };
  if (mod) st.mod = true;
  if (lg && look) {
    st.look = look;
    st.vis = vis;
  }
  return st;
}

/** Opcje sceny kwadratu miasta obok domu (dom nie potrzebuje żadnej). */
export interface OpcjeSceny {
  /** początek kwadratu w pikselach grafiki układu miasta (zob. ChunkScene.poczatek) */
  poczatek?: { x: number; y: number };
  /** ziarno stylu budynku (kolor ściany, szum dachu, zapalone okna): w kwadracie z klucza budynku, żeby kawałki jednego
      budynku po dwóch stronach szwu wyglądały tak samo; undefined: z numeru budynku w świecie jak w domu */
  ziarnoStylu?: (b: WorldBuilding) => number | undefined;
  /** gotowy styl budynku, gdy kawałek budynku domu leży w tym kwadracie: dom wygrywa na szwie (patrz przesunStyl) */
  stylDomu?: (b: WorldBuilding) => BStyle | undefined;
}

/** Styl budynku domu w układzie kwadratu, którego początek leży o (dx, dy) pikseli od początku domu: grzbiet dachu
    (jedyna współrzędna w stylu) przesuwa się o tyle samo, reszta bez zmian. */
export function przesunStyl(st: BStyle, dx: number, dy: number): BStyle {
  const przesuniecie = st.ridge === 'h' ? dy : st.ridge === 'v' ? dx : 0;
  return { ...st, ridgeAt: st.ridgeAt - przesuniecie };
}

/**
 * south i run kafelków budynków (zob. ChunkScene): ciągi kafelków jednego budynku w kolumnie liczone od dołu. kontN i
 * kontS (zob. Brzeg) przedłużają ciąg dotykający górnej i dolnej krawędzi o kafelki sąsiada, więc `south` liczy się
 * od dołu całego budynku, a `run` jest jego pełną długością (fasada ma dość miejsca, szew jej nie obcina). Bez nich
 * wynik jest taki jak zawsze.
 */
export function obliczKolumny(
  w: Pick<World, 'size' | 'bid'>,
  south: Int16Array,
  run: Int16Array,
  kontN?: Uint8Array,
  kontS?: Uint8Array,
): void {
  const size = w.size;
  south.fill(-1);
  run.fill(0);
  for (let x = 0; x < size; x++) {
    let y = size - 1;
    while (y >= 0) {
      const b = w.bid[y * size + x];
      if (b < 0) {
        y--;
        continue;
      }
      // ciąg kafelków tego samego budynku w górę od y
      let k = 0;
      while (y - k >= 0 && w.bid[(y - k) * size + x] === b) k++;
      const pod = y === size - 1 && kontS ? kontS[x] : 0;
      const nad = y - k + 1 === 0 && kontN ? kontN[x] : 0;
      for (let j = 0; j < k; j++) {
        south[(y - j) * size + x] = j + pod;
        run[(y - j) * size + x] = k + pod + nad;
      }
      y -= k;
    }
  }
}

/** budynek tyle, ile potrzeba do rzucenia cienia: numer i ramka kafelków */
export type BrylaCienia = Pick<WorldBuilding, 'id' | 'x0' | 'y0' | 'x1' | 'y1'>;

/**
 * Cienie budynków w oczkach maski (SUB na kafelek): każdy poziomy ciąg kafelków budynku przesunięty w stronę światła
 * (w górę i w prawo). cb dostaje numer oczka w oknie maski o boku size·SUB, przesuniętym o (ox, oy) oczek względem
 * świata budynków (0, 0: ta sama mapa; dla cienia sąsiada okno kwadratu leży o (różnica kwadratów)·size·SUB oczek);
 * poza oknem oczka są pomijane. poziomy(id) to liczba kondygnacji budynku, filtr (opcjonalny) pomija budynki, które
 * nie mogą sięgnąć okna.
 */
export function rzucCienie(
  w: { size: number; bid: Int32Array; buildings: readonly BrylaCienia[] },
  poziomy: (id: number) => number,
  cb: (i: number) => void,
  ox = 0,
  oy = 0,
  filtr?: (b: BrylaCienia) => boolean,
): void {
  const size = w.size;
  const S = size * SUB;
  for (const b of w.buildings) {
    if (filtr && !filtr(b)) continue;
    const L = heightM(poziomy(b.id)) * 0.22;
    const ax = L * 0.5;
    for (let y = b.y0; y <= b.y1; y++) {
      let x = b.x0;
      while (x <= b.x1) {
        if (w.bid[y * size + x] !== b.id) {
          x++;
          continue;
        }
        let xe = x;
        while (xe + 1 <= b.x1 && w.bid[y * size + xe + 1] === b.id) xe++;
        // sześciokąt: ciąg [x, xe+1]×[y, y+1] przesunięty o (ax, −L), w oczkach maski
        const poly: Pt[] = [
          [x, y + 1],
          [x, y],
          [x + ax, y - L],
          [xe + 1 + ax, y - L],
          [xe + 1 + ax, y + 1 - L],
          [xe + 1, y + 1],
          [x, y + 1],
        ].map(([px, py]) => [px * SUB - S / 2, py * SUB - S / 2] as Pt);
        fillRing(poly, S, cb, ox, oy);
        x = xe + 1;
      }
    }
  }
}

/** scena do rysowania świata; art: grafika z PixelLab (teren, bloki, wyglądy budynków), bez niej wszystko rysuje kod;
    opcje: kwadrat miasta obok domu (początek w układzie miasta, ziarno stylu z klucza budynku, styl domu na szwie) */
export function buildScene(w: World, art: Grafika | null = null, opcje: OpcjeSceny = {}): Scene {
  const size = w.size;
  const N = size * size;
  const south = new Int16Array(N);
  const run = new Int16Array(N);
  obliczKolumny(w, south, run);
  // kontekst zabudowy (rząd kamienic) tylko wtedy, gdy grafika ma wyglądy budynków
  const konteksty = art?.budynki ? kontekstyLookow(w) : null;
  const styles = w.buildings.map(
    (b, i) => opcje.stylDomu?.(b) ?? styleOf(b, w, art, konteksty?.[i], opcje.ziarnoStylu?.(b)),
  );
  const doors = new Map<number, Dir>();
  for (const b of w.buildings) for (const e of b.entrances) doors.set(e.tile, e.dir);

  // cienie budynków: każdy poziomy ciąg kafelków przesunięty w stronę światła (w górę i w prawo)
  const S = size * SUB;
  const shadow = new Uint8Array(S * S);
  rzucCienie(
    w,
    (id) => styles[id].levels,
    (i) => {
      shadow[i] = 1;
    },
  );
  // cień nie leży na dachach
  for (let i = 0; i < N; i++) {
    if (w.terr[i] !== T.BUILDING) continue;
    const x = i % size;
    const y = (i - x) / size;
    for (let dy = 0; dy < SUB; dy++) for (let dx = 0; dx < SUB; dx++) shadow[(y * SUB + dy) * S + x * SUB + dx] = 0;
  }

  const chunks = Math.ceil(size / CHUNK);
  const treesBy: number[][] = Array.from({ length: chunks * chunks }, () => []);
  w.trees.forEach((t, k) => {
    for (const c of treeChunks(t, chunks)) treesBy[c].push(k);
  });
  const tr = w.trees;
  for (const list of treesBy) list.sort((a, b) => tr[a].y - tr[b].y || tr[a].x - tr[b].x);
  const treeGone = new Uint8Array(w.trees.length);
  const chunkArt = art && { teren: art.teren, blok: art.blok, dach: art.dach, budynki: art.budynki, strop: art.strop };
  return {
    w,
    south,
    run,
    styles,
    shadow,
    doors,
    treesBy,
    treeGone,
    dryTree: w.dryTree,
    section: null,
    chunks,
    art: chunkArt,
    pietra: null,
    pietro: 0,
    ...(opcje.poczatek ? { poczatek: opcje.poczatek } : {}),
  };
}
