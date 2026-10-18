/* Atlasy grafiki z PixelLab do public/assets/ (npm run atlasy). Z assets/raw bierze tylko assety ze statusem
   „zatwierdzony” w assets/manifest.json i składa je tak, jak ich potrzebuje gra: kafelki Wanga terenu w kolejności
   narożników, moduły bloku z wybranego kawałka bloku (pas fasady, przęsła, wejście, profil attyki), naklejki dachu
   bez tła papy, trzepak i animacje postaci: klatki po palecie, przycięte do sylwetki, w dwóch pasach wierszy
   (mieszkańcy i zarząd), z kotwicą stóp i kolorami ubrania do przemalowania w grze. Opis w grafika.json.
   Do tego budynki.png: 11 wyglądów budynków publicznych i zabytkowych (kamienica, ratusz, muzeum, kościół, urząd, teatr,
   hotel, dworzec, willa, remiza, szpital) składanych tak samo jak blok (pas fasady z piętrami, przęsła, wejście, profil
   krawędzi dachu), z próbką dachu do powtarzania i elementem jednorazowym na osi budynku (wieża, kopuła, portyk).
   npm run atlasy -- --sprawdz: tylko sprawdza, czy public/assets jest aktualne (kod wyjścia 1, jeśli nie). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOKI, type LookBudynku } from '../src/render/art/lookBudynku.ts';
import {
  type BudynekOpis,
  type KierunkiLudzi,
  type KlatkaLudzi,
  type OpisGrafiki,
  type PostacLudzi,
  type PostacRegiony,
  type Prostokat,
  WERSJA_GRAFIKI,
} from '../src/render/art/pixellab.ts';
import { animacjePostaci, type Metadane } from './animacje.ts';
import {
  KIERUNKI_PL,
  kierunkiAnimacji,
  klatkiAnimacji,
  koloryUbrania,
  kotwicaKlatki,
  przytnij,
  stopyWzgledne,
} from './ludzie.ts';
import { pakuj } from './pakuj.ts';
import { dociagnijDoPalety } from './paleta.ts';
import { decodePng, encodePng } from './png.ts';

export type { OpisGrafiki } from '../src/render/art/pixellab.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
export const WYJSCIE = 'public/assets';

/** obraz RGBA: w*h*4 bajtów */
export interface Atlas {
  w: number;
  h: number;
  rgba: Uint8Array;
}

/** jak z kawałka bloku albo budynku składać fasady (manifest, moduly), prostokąty w pikselach pliku */
interface Moduly {
  attyka: [number, number, number, number];
  fasada: { y: number; gora: number; pietro: [number, number]; dol: [number, number] };
  przesla: [number, number];
  /** x przęsła osobno dla pasa górnego, środkowego i dolnego, gdy w jednym miejscu nie wszystkie piętra są czyste */
  przeslaPasow?: { gora?: number; pietro?: number; dol?: number };
  /** pierwszy wiersz w pliku, z którego moduł wejścia bierze dany pas, gdy ma wyglądać inaczej niż przęsło (np. okna
      łukowe zamiast drzwi w środkowych piętrach) */
  wejsciePasow?: { gora?: number; pietro?: number; dol?: number };
  wejscie: [number, number];
  drzwi: number;
  /** płaski kolor tła kadru (do wycięcia przy elementach jednorazowych); brak, gdy kadr ma własne podłoże */
  tlo?: string | string[];
  /** dach budynku: papa z dach.png jak w blokach (domyślnie) albo próbka do powtarzania */
  dach?: 'papa' | Prostokat;
  /**
   * element jednorazowy (wieża, kopuła, portyk, ganek): prostokąt w pliku, x jego osi i y podstawy; kotwica mówi, na czym
   * stoi podstawa (gzyms fasady albo ziemia przed budynkiem), polozenie gdzie (przy wejściu, domyślnie, albo na końcu
   * budynku); tlo (kolor albo lista kolorów) i zalew nadpisują wycinanie tła (zalew z prostokąta zamiast z brzegu całego
   * obrazu, gdy tłem jest też dach wokół wieży, a nie tylko kolor kadru)
   */
  ozdoba?: {
    prostokat: Prostokat;
    os: number;
    podstawa: number;
    kotwica: 'gzyms' | 'ziemia';
    polozenie?: 'wejscie' | 'prawo' | 'lewo';
    tlo?: string | string[];
    zalew?: 'obraz' | 'prostokat';
    /** wielokąty (współrzędne w pliku), których wnętrze znika z ozdoby: ręczna maska tam, gdzie zalew po kolorach zjadłby
        kamień budynku (np. dach wokół frontonu portyku) */
    wytnij?: [number, number][][];
  };
  /** ile pięter ma fasada na obrazku */
  pietra?: number;
  /** fasada ma zawsze tyle pięter, ile na obrazku, bez względu na dane (kościół, remiza: „piętra” z map nic nie znaczą) */
  stalePietra?: boolean;
}

/** dach z kafelków papy (kotwica-blok-dach.uzycie) */
interface Dach {
  tlo: string;
  szwy: [number, number];
  naklejki: number[];
  wnetrze: [number, number, number, number];
  gestosc: number;
}

/** kolory ubrania postaci do przemalowania i wiersze, w których leżą */
interface Przemalowanie {
  kolory: string[];
  wiersze: [number, number];
}

interface Asset {
  id: string;
  co: string;
  status: string;
  wybrany?: string;
  moduly?: Moduly;
  uzycie?: Dach;
  przemalowanie?: Przemalowanie;
  plec?: 'm' | 'k';
  wiek?: [number, number];
}

interface Manifest {
  zarzad: string[];
  mieszkancy: string[];
  assety: Asset[];
}

interface Paleta {
  kolory: string[];
  rampy: Record<string, string[]>;
}

interface WangTile {
  corners: Record<'NW' | 'NE' | 'SW' | 'SE', 'upper' | 'lower'>;
  bounding_box: { x: number; y: number };
}

/** szerokość atlasu ludzi (klatki pakowane półkami; wysokość wychodzi z pakowania) */
const SZEROKOSC_LUDZI = 2048;
/** odstęp między klatkami w atlasie ludzi */
const ODSTEP_LUDZI = 2;

/**
 * Prace w grze (klucz) i animacje PixelLab, z których powstają. bezReferencji: animacja z opisu (pixminimax)
 * zamówiona z klatką referencyjną ma pierwszą klatkę z pozą wyjściową, której nie bierzemy.
 */
export const PRACE: Record<string, { zrodlo: string; bezReferencji?: boolean; kotwica?: 'dol' }> = {
  chod: { zrodlo: 'chod' },
  stanie: { zrodlo: 'stanie' },
  klekanie: { zrodlo: 'klekanie', kotwica: 'dol' },
  niesienie: { zrodlo: 'niesienie-px', bezReferencji: true },
  rabanie: { zrodlo: 'rabanie-px', bezReferencji: true },
  gotowanie: { zrodlo: 'gotowanie-px', bezReferencji: true },
  siedzenie: { zrodlo: 'siedzenie-px', bezReferencji: true },
  warta: { zrodlo: 'warta-px', bezReferencji: true },
  cios: { zrodlo: 'cios' },
  celowanie: { zrodlo: 'celowanie-px', bezReferencji: true },
  przeszukiwanie: { zrodlo: 'przeszukiwanie-px', bezReferencji: true },
  mlotek: { zrodlo: 'mlotek-px', bezReferencji: true },
  deski: { zrodlo: 'deski-px', bezReferencji: true },
  zlom: { zrodlo: 'zlom-px', bezReferencji: true },
};

/** mieszkańcy z PixelLab mają tylko chód i stanie, prace wykonuje zarząd */
export const PRACE_MIESZKANCOW = ['chod', 'stanie'];

const file = (rel: string) => fs.readFileSync(path.join(ROOT, rel));
const json = <T>(rel: string) => JSON.parse(file(rel).toString('utf8')) as T;

function wczytaj(rel: string): Atlas {
  const { width, height, rgba } = decodePng(file(rel));
  return { w: width, h: height, rgba };
}

const pusty = (w: number, h: number): Atlas => ({ w, h, rgba: new Uint8Array(w * h * 4) });

/** przenosi prostokąt w×h z (sx, sy) obrazu src do (dx, dy) obrazu dst */
function kopiuj(src: Atlas, sx: number, sy: number, w: number, h: number, dst: Atlas, dx: number, dy: number) {
  for (let y = 0; y < h; y++) {
    const i = ((sy + y) * src.w + sx) * 4;
    dst.rgba.set(src.rgba.subarray(i, i + w * 4), ((dy + y) * dst.w + dx) * 4);
  }
}

/** wiersz pod najniższym nieprzezroczystym pikselem */
function stopy(a: Atlas): number {
  for (let y = a.h - 1; y >= 0; y--) for (let x = 0; x < a.w; x++) if (a.rgba[(y * a.w + x) * 4 + 3]) return y + 1;
  return a.h;
}

const hex = (c: string) => Number.parseInt(c.slice(1), 16);

/** kolory skóry, których przemalowanie nie rusza */
const SKORA = new Set(['#1a1c22', '#e0b48c', '#e3b79a']);

/**
 * Ubranie postaci bez opisu w manifeście: najczęstsze kolory tułowia (od 30 do 66% wysokości sylwetki w widoku
 * od południa) bez obrysu, skóry i kolorów głowy (włosy, czapka, cień twarzy), najwyżej cztery.
 */
function ubranie(a: Atlas): Przemalowanie {
  let top = a.h;
  let bottom = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++)
      if (a.rgba[(y * a.w + x) * 4 + 3]) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
  const h = bottom - top;
  const liczby = (y0: number, y1: number) => {
    const n = new Map<string, number>();
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4;
        if (!a.rgba[i + 3]) continue;
        const c = `#${[a.rgba[i], a.rgba[i + 1], a.rgba[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        n.set(c, (n.get(c) ?? 0) + 1);
      }
    return n;
  };
  const glowa = liczby(top, top + Math.round(h * 0.22));
  const kolory = [...liczby(top + Math.round(h * 0.3), top + Math.round(h * 0.66))]
    .filter(([c, n]) => n >= 8 && !SKORA.has(c) && (glowa.get(c) ?? 0) <= 3)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([c]) => c);
  return { kolory, wiersze: [top + Math.round(h * 0.27), top + Math.round(h * 0.75)] };
}

/**
 * Moduły fasady z kawałka budynku: kolumny wejście (z drzwiami), przęsła i na końcu jedna kolumna profilu krawędzi
 * dachu (od góry), wiersze gzyms z górnym piętrem, środkowe piętro i parter, jak w blok.png.
 */
function zlozModuly(kawalek: Atlas, M: Moduly): Atlas {
  const [wx, ww] = M.wejscie;
  const [px, pw] = M.przesla;
  const f = M.fasada;
  const pasy: [number, number, number, number][] = [
    [f.y, f.gora, M.przeslaPasow?.gora ?? px, M.wejsciePasow?.gora ?? f.y],
    [f.pietro[0], f.pietro[1], M.przeslaPasow?.pietro ?? px, M.wejsciePasow?.pietro ?? f.pietro[0]],
    [f.dol[0], f.dol[1], M.przeslaPasow?.dol ?? px, M.wejsciePasow?.dol ?? f.dol[0]],
  ];
  const wys = pasy.reduce((s, [, h]) => s + h, 0);
  const moduly = pusty(ww + pw + 1, Math.max(wys, M.attyka[3]));
  let y = 0;
  for (const [sy, h, bx, wy] of pasy) {
    kopiuj(kawalek, wx, wy, ww, h, moduly, 0, y);
    kopiuj(kawalek, bx, sy, pw, h, moduly, ww, y);
    y += h;
  }
  kopiuj(kawalek, M.attyka[0], M.attyka[1], 1, M.attyka[3], moduly, ww + pw, 0);
  return moduly;
}

/** wycinek obrazu jako osobny obraz */
function wytnij(a: Atlas, [x, y, w, h]: Prostokat): Atlas {
  const o = pusty(w, h);
  kopiuj(a, x, y, w, h, o, 0, 0);
  return o;
}

/**
 * Wycinek z przezroczystym tłem: piksele koloru tła, do których da się dojść od brzegu całego obrazu (czwórkowo),
 * stają się przezroczyste, a kolory tła w środku budynku zostają. Tło zewnętrzne to płaski kolor kadru. Z `zalew`
 * równym „prostokat” zalewa się od brzegu samego wycinka (do napisu na dachu, gdzie tłem jest kolor dachu).
 */
function wytnijBezTla(
  a: Atlas,
  r: Prostokat,
  tlo: readonly number[],
  zalew: 'obraz' | 'prostokat' = 'obraz',
  maska: readonly (readonly [number, number][])[] = [],
): Atlas {
  const tloZewn = new Uint8Array(a.w * a.h);
  const stos: number[] = [];
  const kolor = (i: number) => (a.rgba[i * 4] << 16) | (a.rgba[i * 4 + 1] << 8) | a.rgba[i * 4 + 2];
  const dodaj = (x: number, y: number) => {
    const i = y * a.w + x;
    if (!tloZewn[i] && tlo.includes(kolor(i))) {
      tloZewn[i] = 1;
      stos.push(i);
    }
  };
  const [rx, ry, rw, rh] = zalew === 'obraz' ? [0, 0, a.w, a.h] : r;
  for (let x = rx; x < rx + rw; x++) {
    dodaj(x, ry);
    dodaj(x, ry + rh - 1);
  }
  for (let y = ry; y < ry + rh; y++) {
    dodaj(rx, y);
    dodaj(rx + rw - 1, y);
  }
  while (stos.length) {
    const i = stos.pop() as number;
    const x = i % a.w;
    const y = (i - x) / a.w;
    if (x > rx) dodaj(x - 1, y);
    if (x < rx + rw - 1) dodaj(x + 1, y);
    if (y > ry) dodaj(x, y - 1);
    if (y < ry + rh - 1) dodaj(x, y + 1);
  }
  const o = wytnij(a, r);
  const [, , rw2, rh2] = r;
  for (let y = 0; y < rh2; y++)
    for (let x = 0; x < rw2; x++)
      if (tloZewn[(r[1] + y) * a.w + r[0] + x]) o.rgba.fill(0, (y * rw2 + x) * 4, (y * rw2 + x) * 4 + 4);
  // ręczna maska: wnętrza wielokątów (środki pikseli, parzystość przecięć)
  for (const w of maska)
    for (let y = 0; y < rh2; y++)
      for (let x = 0; x < rw2; x++) {
        const px = r[0] + x + 0.5;
        const py = r[1] + y + 0.5;
        let w1 = false;
        for (let i = 0, j = w.length - 1; i < w.length; j = i++) {
          const [xi, yi] = w[i];
          const [xj, yj] = w[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) w1 = !w1;
        }
        if (w1) o.rgba.fill(0, (y * rw2 + x) * 4, (y * rw2 + x) * 4 + 4);
      }
  // wolne linie: poziome i pionowe ciągi co najmniej 10 pikseli, obok których z obu stron nic nie ma (obrys i szwy dachu
  // przecinające kadr wieży), znikają; krótkie kreski (ramiona krzyża, igła iglicy) zostają
  const jest = (x: number, y: number) => x >= 0 && y >= 0 && x < rw2 && y < rh2 && o.rgba[(y * rw2 + x) * 4 + 3] > 0;
  const czysc = (poziomo: boolean) => {
    const dl = poziomo ? rw2 : rh2;
    const szer = poziomo ? rh2 : rw2;
    const pt = (i: number, j: number): [number, number] => (poziomo ? [i, j] : [j, i]);
    const wolny = (i: number, j: number) => {
      const [x, y] = pt(i, j);
      const [ax, ay] = poziomo ? [x, y - 1] : [x - 1, y];
      const [bx, by] = poziomo ? [x, y + 1] : [x + 1, y];
      return jest(x, y) && !jest(ax, ay) && !jest(bx, by);
    };
    for (let j = 0; j < szer; j++) {
      let i = 0;
      while (i < dl) {
        if (!wolny(i, j)) {
          i++;
          continue;
        }
        let k = i;
        while (k < dl && wolny(k, j)) k++;
        if (k - i >= 10)
          for (let c = i; c < k; c++) {
            const [x, y] = pt(c, j);
            o.rgba.fill(0, (y * rw2 + x) * 4, (y * rw2 + x) * 4 + 4);
          }
        i = k;
      }
    }
  };
  czysc(true);
  czysc(false);
  return o;
}

/** id assetów wyglądów budynków w manifeście */
export const ASSET_LOOKA: Record<LookBudynku, string> = {
  kamienica: 'budynek-kamienica',
  ratusz: 'budynek-ratusz',
  muzeum: 'budynek-muzeum',
  kosciol: 'budynek-kosciol',
  urzad: 'budynek-urzad',
  teatr: 'budynek-teatr',
  hotel: 'budynek-hotel',
  dworzec: 'budynek-dworzec',
  willa: 'budynek-willa',
  remiza: 'budynek-remiza',
  szpital: 'budynek-szpital',
};

/** szerokość atlasu budynków i odstęp między kawałkami */
const SZEROKOSC_BUDYNKOW = 512;
const ODSTEP_BUDYNKOW = 1;

/** wszystkie wyglądy budynków w jednym atlasie (budynki.png) i ich opis */
function budynki(asset: (id: string) => Asset): { atlas: Atlas; opis: OpisGrafiki['budynki'] } {
  interface Kawalki {
    look: LookBudynku;
    a: Asset;
    M: Moduly;
    fasada: Atlas;
    dach: Atlas | null;
    ozdoba: Atlas | null;
  }
  const kawalki: Kawalki[] = LOOKI.map((look) => {
    const a = asset(ASSET_LOOKA[look]);
    const M = a.moduly;
    if (!M || !a.wybrany) throw new Error(`atlasy: ${a.id} nie ma modułów w manifeście`);
    const obraz = wczytaj(a.wybrany);
    const tloOzdoby = M.ozdoba?.tlo ?? M.tlo;
    if (M.ozdoba && !tloOzdoby) throw new Error(`atlasy: ${a.id} ma ozdobę, ale nie ma tła do wycięcia (tlo)`);
    return {
      look,
      a,
      M,
      fasada: zlozModuly(obraz, M),
      dach: Array.isArray(M.dach) ? wytnij(obraz, M.dach) : null,
      ozdoba: M.ozdoba
        ? wytnijBezTla(
            obraz,
            M.ozdoba.prostokat,
            [tloOzdoby as string | string[]].flat().map(hex),
            M.ozdoba.zalew,
            M.ozdoba.wytnij,
          )
        : null,
    };
  });
  const czesci = kawalki.flatMap((k) => [k.fasada, k.dach, k.ozdoba].filter((c): c is Atlas => c !== null));
  const { miejsca, wysokosc } = pakuj(czesci, SZEROKOSC_BUDYNKOW, ODSTEP_BUDYNKOW);
  const atlas = pusty(SZEROKOSC_BUDYNKOW, wysokosc);
  for (const [i, c] of czesci.entries()) kopiuj(c, 0, 0, c.w, c.h, atlas, miejsca[i].x, miejsca[i].y);
  let nr = 0;
  const miejsce = (c: Atlas): Prostokat => {
    const m = miejsca[nr++];
    return [m.x, m.y, c.w, c.h];
  };
  const typy = {} as Record<LookBudynku, BudynekOpis>;
  for (const k of kawalki) {
    const { M } = k;
    const f = M.fasada;
    const fasada = miejsce(k.fasada);
    const dach = k.dach ? miejsce(k.dach) : null;
    const oz = k.ozdoba && M.ozdoba ? miejsce(k.ozdoba) : null;
    const [, ww] = M.wejscie;
    const [, pw] = M.przesla;
    typy[k.look] = {
      id: k.a.id,
      fasada,
      gora: [0, f.gora],
      srodek: [f.gora, f.pietro[1]],
      dol: [f.gora + f.pietro[1], f.dol[1]],
      wejscie: [0, ww],
      drzwi: M.drzwi,
      przesla: [ww, pw],
      attyka: [ww + pw, M.attyka[3]],
      dach,
      ozdoba:
        oz && M.ozdoba
          ? {
              prostokat: oz,
              ax: M.ozdoba.os - M.ozdoba.prostokat[0],
              ay: M.ozdoba.podstawa - M.ozdoba.prostokat[1],
              kotwica: M.ozdoba.kotwica,
              polozenie: M.ozdoba.polozenie ?? 'wejscie',
            }
          : null,
      pietra: M.pietra ?? 3,
      stalePietra: M.stalePietra ?? false,
    };
  }
  return { atlas, opis: { plik: 'budynki.png', typy } };
}

/** wszystkie pliki atlasów: nazwa w public/assets → obraz albo opis (grafika.json) */
export function atlasy(): Map<string, Atlas | OpisGrafiki> {
  const m = json<Manifest>('assets/manifest.json');
  const pal = json<Paleta>('assets/palette.json');
  const asset = (id: string) => {
    const a = m.assety.find((q) => q.id === id);
    if (!a) throw new Error(`atlasy: brak ${id} w manifeście`);
    if (a.status !== 'zatwierdzony') throw new Error(`atlasy: ${id} ma status „${a.status}”, a nie „zatwierdzony”`);
    return a;
  };
  const out = new Map<string, Atlas | OpisGrafiki>();

  // teren: 16 kafelków Wanga 4×4 w kolejności narożników NW NE SW SE (1 = trawnik)
  const teren = asset('kotwica-chodnik-trawa');
  const arkusz = wczytaj('assets/raw/kotwica-chodnik-trawa/tileset.png');
  const meta = json<{ tileset_data: { tiles: WangTile[] } }>('assets/raw/kotwica-chodnik-trawa/metadata.json');
  const kafle = pusty(128, 128);
  const numery = new Set<number>();
  for (const t of meta.tileset_data.tiles) {
    const n = (['NW', 'NE', 'SW', 'SE'] as const).reduce((s, q) => s * 2 + (t.corners[q] === 'upper' ? 1 : 0), 0);
    numery.add(n);
    kopiuj(arkusz, t.bounding_box.x, t.bounding_box.y, 32, 32, kafle, (n % 4) * 32, (n >> 2) * 32);
  }
  if (numery.size !== 16) throw new Error(`atlasy: ${numery.size} różnych kafelków Wanga zamiast 16`);
  out.set('teren.png', kafle);

  // blok: wejście i przęsła obok siebie, pod sobą wiersze gzymsu z górnym piętrem, środkowego piętra i parteru,
  // w ostatniej kolumnie profil attyki
  const blok = asset('kotwica-blok');
  const M = blok.moduly!;
  const [, ww] = M.wejscie;
  const [, pw] = M.przesla;
  const f = M.fasada;
  out.set('blok.png', zlozModuly(wczytaj(blok.wybrany!), M));

  // dach: środki wybranych kafelków papy jako naklejki w jednym rzędzie, piksele w kolorze tła przezroczyste
  const dach = asset('kotwica-blok-dach');
  const D = dach.uzycie!;
  const dir = 'assets/raw/kotwica-blok-dach';
  const nr = (s: string) => Number(/(\d+)\.png$/.exec(s)![1]);
  const dachowki = fs
    .readdirSync(path.join(ROOT, dir))
    .filter((s) => s.endsWith('.png'))
    .sort((a, b) => nr(a) - nr(b));
  const [nx, ny, nw, nh] = D.wnetrze;
  if (nw !== nh) throw new Error('atlasy: naklejka dachu powinna być kwadratowa');
  const naklejki = pusty(nw * D.naklejki.length, nh);
  D.naklejki.forEach((k, i) => {
    kopiuj(wczytaj(`${dir}/${dachowki[k]}`), nx, ny, nw, nh, naklejki, i * nw, 0);
  });
  const tlo = hex(D.tlo);
  for (let i = 0; i < naklejki.rgba.length; i += 4) {
    const r = naklejki.rgba;
    if (((r[i] << 16) | (r[i + 1] << 8) | r[i + 2]) === tlo) r.fill(0, i, i + 4);
  }
  out.set('dach.png', naklejki);

  // trzepak tak, jak przyszedł
  const trzepak = asset('kotwica-trzepak');
  const tz = wczytaj('assets/raw/kotwica-trzepak/trzepak.png');
  out.set('trzepak.png', tz);

  // budynki publiczne i zabytkowe: 11 wyglądów w jednym atlasie
  const wyglady = budynki(asset);
  out.set('budynki.png', wyglady.atlas);

  // ludzie: animacje wszystkich postaci w jednym atlasie, klatki po palecie przycięte do sylwetki i spakowane
  const ids = [...m.zarzad, ...m.mieszkancy];
  const rozmiary: { w: number; h: number }[] = [];
  const obrazy: Uint8Array[] = [];
  const wpisy: { wpis: KlatkaLudzi; idx: number; zarzad: boolean }[] = [];
  const postacie: PostacLudzi[] = ids.map((id) => {
    const a = asset(id);
    const zarzad = m.zarzad.includes(id);
    const meta = json<Metadane>(`assets/raw/${id}/metadata.json`);
    const dostepne = new Map(animacjePostaci(meta).map((x) => [x.nazwa, x]));
    const animacje: PostacLudzi['animacje'] = {};
    // statyczna postać od południa: jej stopy względem środka płótna to kotwica klatek wszystkich animacji, a ubranie
    // do przemalowania z manifestu albo zgadnięte, z zakresem liczonym od stóp
    const stat = wczytaj(`assets/raw/${id}/paleta/south.png`);
    const rel = stopyWzgledne(stat);
    for (const [klucz, spec] of Object.entries(PRACE)) {
      if (!zarzad && !PRACE_MIESZKANCOW.includes(klucz)) continue;
      const an = dostepne.get(spec.zrodlo);
      if (!an) continue;
      const po: Partial<Record<(typeof KIERUNKI_PL)[number], string[]>> = {};
      for (const k of KIERUNKI_PL) if (an.kierunki[k]) po[k] = klatkiAnimacji(an.kierunki[k], spec);
      const kier = kierunkiAnimacji(po);
      if (!kier) continue;
      const obraz = (plik: string) => {
        const z = wczytaj(`assets/raw/${id}/${plik}`);
        return { w: z.w, h: z.h, rgba: dociagnijDoPalety(z.rgba, pal.kolory) };
      };
      const klatki = kier.map((k) => (Array.isArray(k) ? k.map(obraz) : k));
      const kierunki: KierunkiLudzi = klatki.map((k) =>
        Array.isArray(k)
          ? k.map((fr) => {
              const p = przytnij(fr);
              const wpis: KlatkaLudzi = [
                0,
                0,
                p.w,
                p.h,
                (fr.w >> 1) - p.x,
                kotwicaKlatki(rel, fr.h, p.y, spec.kotwica, p.h),
              ];
              wpisy.push({ wpis, idx: rozmiary.length, zarzad });
              rozmiary.push({ w: p.w, h: p.h });
              obrazy.push(p.rgba);
              return wpis;
            })
          : k,
      );
      animacje[klucz] = { kierunki };
    }
    // kolory ubrania: kandydaci z manifestu albo zgadnięci, bez tych, które w statycznej postaci (4 kierunki) leżą
    // w większości poza tułowiem (włosy, buty, obrys); gra przemalowuje je w każdej klatce bez pasa wysokości
    const p = a.przemalowanie ?? ubranie(stat);
    const statyczne = KIERUNKI_PL.map((k) => wczytaj(`assets/raw/${id}/paleta/${k}.png`));
    if (!a.plec || !a.wiek) throw new Error(`${id}: w manifeście brakuje pola plec albo wiek`);
    return {
      id,
      co: a.co,
      zarzad,
      plec: a.plec,
      wiek: a.wiek,
      animacje,
      przemalowanie: { kolory: koloryUbrania(statyczne, p.kolory, p.wiersze) },
    };
  });
  // dwa pasy wierszy: najpierw klatki mieszkańców (gra robi z nich w locie przemalowane wersje, więc leżą razem),
  // pod nimi klatki zarządu; między pasami ten sam odstęp co między klatkami
  const regiony: PostacRegiony = { mieszkancy: [0, 0], zarzad: [0, 0] };
  const miejsca = new Map<(typeof wpisy)[number], { x: number; y: number }>();
  let y0 = 0;
  for (const zarzad of [false, true]) {
    const grupa = wpisy.filter((w) => w.zarzad === zarzad);
    const pakowanie = pakuj(
      grupa.map((w) => rozmiary[w.idx]),
      SZEROKOSC_LUDZI,
      ODSTEP_LUDZI,
    );
    grupa.forEach((w, i) => {
      miejsca.set(w, { x: pakowanie.miejsca[i].x, y: y0 + pakowanie.miejsca[i].y });
    });
    regiony[zarzad ? 'zarzad' : 'mieszkancy'] = [y0, y0 + pakowanie.wysokosc];
    y0 += pakowanie.wysokosc + ODSTEP_LUDZI;
  }
  const ludzie = pusty(SZEROKOSC_LUDZI, regiony.zarzad[1]);
  for (const w of wpisy) {
    const { x, y } = miejsca.get(w)!;
    w.wpis[0] = x;
    w.wpis[1] = y;
    const { w: sz, h } = rozmiary[w.idx];
    for (let r = 0; r < h; r++)
      ludzie.rgba.set(obrazy[w.idx].subarray(r * sz * 4, (r + 1) * sz * 4), ((y + r) * ludzie.w + x) * 4);
  }
  out.set('ludzie.png', ludzie);

  const opis: OpisGrafiki = {
    wersja: WERSJA_GRAFIKI,
    zrodlo:
      'PixelLab, kotwica stylu zatwierdzona 18.10.2026: assety ze statusem zatwierdzony z assets/manifest.json, złożone przez tools/atlasy.ts (npm run atlasy)',
    teren: { id: teren.id, plik: 'teren.png', kafel: 32 },
    blok: {
      id: blok.id,
      plik: 'blok.png',
      gora: [0, f.gora],
      srodek: [f.gora, f.pietro[1]],
      dol: [f.gora + f.pietro[1], f.dol[1]],
      wejscie: [0, ww],
      drzwi: M.drzwi,
      przesla: [ww, pw],
      attyka: [ww + pw, M.attyka[3]],
    },
    dach: {
      id: dach.id,
      plik: 'dach.png',
      tlo: D.tlo,
      ciemny: pal.kolory[0],
      jasny: pal.kolory[2],
      szwy: D.szwy,
      naklejka: nw,
      naklejek: D.naklejki.length,
      gestosc: D.gestosc,
    },
    trzepak: { id: trzepak.id, plik: 'trzepak.png', stopy: stopy(tz), podstawa: 20 },
    budynki: wyglady.opis,
    ludzie: { plik: 'ludzie.png', regiony, postacie, rampy: pal.rampy },
  };
  out.set('grafika.json', opis);
  return out;
}

const tekst = (o: OpisGrafiki) => `${JSON.stringify(o, null, 2)}\n`;

/** pliki, których w public/assets brakuje albo które różnią się od świeżo złożonych */
function nieaktualne(wynik: Map<string, Atlas | OpisGrafiki>): string[] {
  const zle: string[] = [];
  for (const [nazwa, dane] of wynik) {
    const p = path.join(ROOT, WYJSCIE, nazwa);
    if (!fs.existsSync(p)) zle.push(nazwa);
    else if (nazwa.endsWith('.json')) {
      if (fs.readFileSync(p, 'utf8') !== tekst(dane as OpisGrafiki)) zle.push(nazwa);
    } else {
      const a = dane as Atlas;
      const b = decodePng(fs.readFileSync(p));
      if (b.width !== a.w || b.height !== a.h || !Buffer.from(b.rgba).equals(Buffer.from(a.rgba))) zle.push(nazwa);
    }
  }
  return zle;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wynik = atlasy();
  if (process.argv.includes('--sprawdz')) {
    const zle = nieaktualne(wynik);
    if (zle.length) {
      console.error(`public/assets nieaktualne (${zle.join(', ')}): npm run atlasy`);
      process.exitCode = 1;
    } else console.log('public/assets aktualne');
  } else {
    fs.mkdirSync(path.join(ROOT, WYJSCIE), { recursive: true });
    for (const [nazwa, dane] of wynik) {
      const p = path.join(ROOT, WYJSCIE, nazwa);
      if (nazwa.endsWith('.json')) fs.writeFileSync(p, tekst(dane as OpisGrafiki));
      else {
        const a = dane as Atlas;
        fs.writeFileSync(p, encodePng(a.w, a.h, a.rgba));
      }
      console.log(`${WYJSCIE}/${nazwa}: ${fs.statSync(p).size} B`);
    }
  }
}
