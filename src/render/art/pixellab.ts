/* Grafika z PixelLab (kotwica stylu zatwierdzona 18.10.2026): opis atlasów z public/assets (składa je
   tools/atlasy.ts z assets/raw) i czyste funkcje, które rysują z nich teren i bloki w kawałkach mapy, a dla ludzi
   wybierają postać po płci i wieku osoby i przemalowują ubranie na rampy palety. Działa w głównym wątku, w workerze
   i w Node. Bez atlasów gra rysuje wszystko kodem jak dawniej. */

import { T } from '../../world/terrain.ts';
import type { Sprite } from './bryly.ts';
import { h2 } from './hash.ts';
import type { LookBudynku } from './lookBudynku.ts';
import { type ThingSpec, thingSprite } from './rzeczy.ts';

/** wersja formatu grafika.json; gra nie bierze atlasów w innej wersji */
export const WERSJA_GRAFIKI = 3;

/** klatka animacji w atlasie ludzi: prostokąt [x, y, szerokość, wysokość] i kotwica [ax, ay] (stopy postaci, środek
    korpusu) w pikselach klatki */
export type KlatkaLudzi = [x: number, y: number, w: number, h: number, ax: number, ay: number];

/** klatki animacji po kierunkach pionka (0 południe, 1 północ, 2 zachód, 3 wschód): klatki po kolei albo numer
    kierunku, którego klatki idą odbite poziomo (brak własnych) */
export type KierunkiLudzi = (KlatkaLudzi[] | number)[];

/** pasy wierszy atlasu ludzi [od, do): klatki mieszkańców (z nich gra robi przemalowane wersje) i klatki zarządu */
export interface PostacRegiony {
  mieszkancy: [number, number];
  zarzad: [number, number];
}

export interface PostacLudzi {
  id: string;
  co: string;
  zarzad: boolean;
  /** płeć postaci (m, k) i przedział wieku, w którym pasuje do osoby z gry (z assets/manifest.json) */
  plec: 'm' | 'k';
  wiek: [number, number];
  /** animacje po kluczu pracy (chod, stanie, klekanie, niesienie, rabanie, ...); brak klucza: tej pracy z PixelLab
      nie ma, rysuje ją kod */
  animacje: Record<string, { kierunki: KierunkiLudzi }>;
  /** ubranie do przemalowania na inną rampę: kolory z palety i zakres wysokości nad stopami (od, do] w pikselach */
  przemalowanie: { kolory: string[] };
}

/** prostokąt w pikselach atlasu: [x, y, szerokość, wysokość] */
export type Prostokat = [x: number, y: number, w: number, h: number];

/**
 * Jeden z 11 wyglądów budynków (kamienica, ratusz, muzeum…) w budynki.png. Fasada to złożone moduły jak w blok.png
 * (kolumny: wejście z drzwiami, przęsła, profil krawędzi dachu; wiersze: gzyms z górnym piętrem, środkowe piętro,
 * parter), a jej wiersze i kolumny (jak w opisie bloku) liczą się względem prostokąta `fasada`. Dach to próbka do
 * powtarzania albo null (papa z dach.png jak w blokach), ozdoba to element jednorazowy na osi budynku (wieża ratusza,
 * kopuła teatru…) z przezroczystym tłem, kotwicą [ax, ay] w pikselach prostokąta i podstawą na linii gzymsu fasady.
 */
export interface BudynekOpis {
  id: string;
  fasada: Prostokat;
  gora: [number, number];
  srodek: [number, number];
  dol: [number, number];
  wejscie: [number, number];
  drzwi: number;
  przesla: [number, number];
  attyka: [number, number];
  dach: Prostokat | null;
  ozdoba: {
    prostokat: Prostokat;
    ax: number;
    ay: number;
    /** na czym stoi podstawa: gzyms fasady (korona nad dachem: wieża, kopuła, fronton) albo ziemia (portyk, ganek) */
    kotwica: 'gzyms' | 'ziemia';
    /** gdzie: przy głównym wejściu (bez wejścia na osi budynku) albo na końcu południowej ściany (wieża remizy) */
    polozenie: 'wejscie' | 'prawo' | 'lewo';
  } | null;
  /** liczba pięter fasady na obrazku PixelLab: tyle, gdy dane nie podają pięter budynku */
  pietra: number;
  /** fasada ma zawsze `pietra` pięter, bez względu na dane (kościół, remiza) */
  stalePietra: boolean;
}

/** opis atlasów w public/assets/grafika.json (prostokąty w pikselach plików atlasów) */
export interface OpisGrafiki {
  wersja: number;
  zrodlo: string;
  /** 16 kafelków Wanga 4×4: kafelek o narożnikach NW NE SW SE (bity od najstarszego, 1 = trawnik) o numerze k
      leży w kolumnie k % 4 i wierszu k >> 2 */
  teren: { id: string; plik: string; kafel: number };
  /** moduły bloku: wiersze [y, h] gzymsu z górnym piętrem, środkowego piętra (powtarzane) i parteru z cokołem,
      kolumny [x, w] wejścia (drzwi w kolumnie drzwi) i przęseł, profil attyki [x, n] od zewnątrz do środka */
  blok: {
    id: string;
    plik: string;
    gora: [number, number];
    srodek: [number, number];
    dol: [number, number];
    wejscie: [number, number];
    drzwi: number;
    przesla: [number, number];
    attyka: [number, number];
  };
  /** papa: tło z szumem (ciemne i jasne piksele) i szwami co szwy [x, y] px, rzadkie naklejki naklejka × naklejka
      w jednym rzędzie (gestosc: część kafelków dachu z naklejką) */
  dach: {
    id: string;
    plik: string;
    tlo: string;
    ciemny: string;
    jasny: string;
    szwy: [number, number];
    naklejka: number;
    naklejek: number;
    gestosc: number;
  };
  /** trzepak od frontu: stopy to wiersz pod stopami, podstawa to wiersz kafelka, na którym stoją stopy */
  trzepak: { id: string; plik: string; stopy: number; podstawa: number };
  /** wyglądy budynków publicznych i zabytkowych (kamienica, ratusz, muzeum, kościół, urząd, teatr, hotel, dworzec,
      willa, remiza, szpital) w jednym atlasie */
  budynki: { plik: string; typy: Record<LookBudynku, BudynekOpis> };
  /** obsada: animacje postaci w jednym atlasie (klatki przycięte do sylwetki i spakowane), rampy palety do przemalowań */
  ludzie: {
    plik: string;
    regiony: PostacRegiony;
    postacie: PostacLudzi[];
    rampy: Record<string, string[]>;
  };
}

/** obraz z atlasu: piksele jak w ImageData czytanym przez Uint32Array (0xAABBGGRR), alfa tylko 0 albo 255 */
export interface Obraz {
  w: number;
  h: number;
  px: Uint32Array;
}

export interface Teren {
  img: Obraz;
}

export type Blok = Omit<OpisGrafiki['blok'], 'id' | 'plik'> & { img: Obraz };

export interface Dach {
  img: Obraz;
  /** kolory 0xRRGGBB */
  tlo: number;
  ciemny: number;
  jasny: number;
  szwy: [number, number];
  /** bok naklejki i ile ich jest w rzędzie */
  size: number;
  n: number;
  gestosc: number;
}

export interface Trzepak {
  img: Obraz;
  stopy: number;
  podstawa: number;
}

/** grafika do kawałków mapy (idzie do workerów razem ze sceną) */
export interface GrafikaKawalkow {
  teren: Teren | null;
  blok: Blok | null;
  dach: Dach | null;
}

/** animacje ludzi: opis postaci i klatek oraz atlas ludzie.png (tylko główny wątek, workery go nie dostają) */
export interface LudzieGrafika {
  opis: OpisGrafiki['ludzie'];
  img: Obraz;
}

/** grafika z PixelLab w grze; każda część osobno może jej nie mieć (wtedy ta część jest z kodu) */
export interface Grafika extends GrafikaKawalkow {
  trzepak: Trzepak | null;
  ludzie: LudzieGrafika | null;
}

const hex = (c: string) => Number.parseInt(c.slice(1), 16);

/** grafika z opisu i obrazków (obraz(plik) albo null, gdy pliku nie ma); w innej wersji opisu null */
export function grafikaZ(opis: OpisGrafiki, obraz: (plik: string) => Obraz | null): Grafika | null {
  if (opis.wersja !== WERSJA_GRAFIKI) return null;
  const teren = obraz(opis.teren.plik);
  const blok = obraz(opis.blok.plik);
  const dach = obraz(opis.dach.plik);
  const trzepak = obraz(opis.trzepak.plik);
  const ludzie = obraz(opis.ludzie.plik);
  const { id: _b, plik: _p, ...moduly } = opis.blok;
  const d = opis.dach;
  return {
    teren: teren && { img: teren },
    blok: blok && { ...moduly, img: blok },
    dach: dach && {
      img: dach,
      tlo: hex(d.tlo),
      ciemny: hex(d.ciemny),
      jasny: hex(d.jasny),
      szwy: d.szwy,
      size: d.naklejka,
      n: d.naklejek,
      gestosc: d.gestosc,
    },
    trzepak: trzepak && { img: trzepak, stopy: opis.trzepak.stopy, podstawa: opis.trzepak.podstawa },
    ludzie: ludzie && { opis: opis.ludzie, img: ludzie },
  };
}

/** kolor 0xRRGGBB piksela obrazu */
function rgbAt(o: Obraz, x: number, y: number): number {
  const p = o.px[y * o.w + x];
  return ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff);
}

// ---------------------------------------------------------------- teren

/** klasa terenu w narożniku kafelka Wanga: 1 trawnik (trawa, park, las), 0 chodnik i cała reszta (jezdnia,
    budynek, woda); poza mapą jak na jej brzegu */
export function wangKlasa(terr: ArrayLike<number>, size: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= size ? size - 1 : x;
  const cy = y < 0 ? 0 : y >= size ? size - 1 : y;
  const t = terr[cy * size + cx];
  return t === T.GRASS || t === T.PARK || t === T.WOOD ? 1 : 0;
}

/** czy teren o tym kodzie rysuje się z kafelków Wanga (trawnik, park, chodnik, ścieżka); reszta zostaje z kodu */
export const wangRysuje = (t: number): boolean => t === T.GRASS || t === T.PARK || t === T.SIDEWALK || t === T.PATH;

/** numer kafelka Wanga o narożniku NW w środku kafelka świata (x, y): narożniki NW NE SW SE od najstarszego bitu */
function wangNumer(terr: ArrayLike<number>, size: number, x: number, y: number): number {
  return (
    (wangKlasa(terr, size, x, y) << 3) |
    (wangKlasa(terr, size, x + 1, y) << 2) |
    (wangKlasa(terr, size, x, y + 1) << 1) |
    wangKlasa(terr, size, x + 1, y + 1)
  );
}

/**
 * Cztery kafelki Wanga nad kafelkiem świata (x, y), po ćwiartkach NW NE SW SE: numer | odbicie << 4. Kafelki Wanga
 * leżą na podwójnej siatce, przesunięte o pół kafelka: ich narożniki wypadają w środkach kafelków świata, więc
 * granica terenów leży na krawędzi kafelka świata. Jednolity kafelek (sam trawnik albo sam chodnik) jest odbity
 * w poziomie (bit 1) i w pionie (bit 2) według miejsca, żeby nie było widać powtórzeń.
 */
export function wangKafel(terr: ArrayLike<number>, size: number, x: number, y: number): Int32Array {
  const q = new Int32Array(4);
  for (let k = 0; k < 4; k++) {
    const wx = x - 1 + (k & 1);
    const wy = y - 1 + (k >> 1);
    const n = wangNumer(terr, size, wx, wy);
    const f = n === 0 || n === 15 ? Math.floor(h2(wx, wy, 4242) * 4) : 0;
    q[k] = n | (f << 4);
  }
  return q;
}

/** kolor 0xRRGGBB terenu w punkcie (px, py) kafelka świata z jego kafelkami Wanga (wangKafel) */
export function wangPiksel(t: Teren, q: Int32Array, px: number, py: number): number {
  const k = (px < 16 ? 0 : 1) | (py < 16 ? 0 : 2);
  const n = q[k] & 15;
  const f = q[k] >> 4;
  const u = px < 16 ? px + 16 : px - 16;
  const v = py < 16 ? py + 16 : py - 16;
  return rgbAt(t.img, (n & 3) * 32 + (f & 1 ? 31 - u : u), (n >> 2) * 32 + (f & 2 ? 31 - v : v));
}

/** kolor terenu z kafelków Wanga w punkcie (px, py) kafelka świata (x, y) */
export const wangKolor = (
  t: Teren,
  terr: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  px: number,
  py: number,
): number => wangPiksel(t, wangKafel(terr, size, x, y), px, py);

// ---------------------------------------------------------------- blok z modułów

/** wiersze atlasu bloku od góry do dołu pasa fasady o tylu piętrach: gzyms z górnym piętrem, środkowe piętra,
    parter z cokołem; parterowy ma sam gzyms nad parterem */
export function pasFasady(b: Blok, levels: number): number[] {
  const rows: number[] = [];
  const take = (y0: number, n: number) => {
    for (let r = 0; r < n; r++) rows.push(y0 + r);
  };
  take(b.gora[0], levels > 1 ? b.gora[1] : b.gora[1] - b.srodek[1]);
  for (let n = 0; n < levels - 2; n++) take(b.srodek[0], b.srodek[1]);
  take(b.dol[0], b.dol[1]);
  return rows;
}

/** kolumna atlasu bloku w punkcie ax fasady (piksele świata): moduł wejścia, gdy ax leży nad drzwiami o środku
    doorX (NaN: bez drzwi), inaczej przęsło powtarzane po x świata */
export function kolumnaFasady(b: Blok, ax: number, doorX: number): number {
  const d = ax - (doorX - b.drzwi);
  if (d >= 0 && d < b.wejscie[1]) return b.wejscie[0] + d;
  const w = b.przesla[1];
  return b.przesla[0] + (((ax % w) + w) % w);
}

/** kolor 0xRRGGBB modułu bloku w kolumnie i wierszu atlasu */
export const blokKolor = (b: Blok, x: number, y: number): number => rgbAt(b.img, x, y);

/** kolor attyki w odległości e od krawędzi dachu (0 = sama krawędź, mniej niż b.attyka[1]) */
export const attykaKolor = (b: Blok, e: number): number => rgbAt(b.img, b.attyka[0], e);

/** kolor 0xRRGGBB papy w punkcie dachu (piksele świata): rzadka naklejka w kafelku 32 px (miejsce i rodzaj
    z kafelka), szwy arkuszy, poza nimi tło z rzadkimi ciemnymi i jasnymi pikselami */
export function papaKolor(d: Dach, ax: number, ay: number): number {
  const cx = ax >> 5;
  const cy = ay >> 5;
  if (h2(cx, cy, 2) < d.gestosc) {
    const room = 32 - d.size + 1;
    const qx = (ax & 31) - Math.floor(h2(cx, cy, 4) * room);
    const qy = (ay & 31) - Math.floor(h2(cx, cy, 5) * room);
    if (qx >= 0 && qy >= 0 && qx < d.size && qy < d.size) {
      const x = Math.floor(h2(cx, cy, 3) * d.n) * d.size + qx;
      if (d.img.px[qy * d.img.w + x] >>> 24) return rgbAt(d.img, x, qy);
    }
  }
  if (ax % d.szwy[0] === 0 || ay % d.szwy[1] === 0) return d.ciemny;
  const r = h2(ax, ay, 6);
  return r < 0.025 ? d.ciemny : r < 0.05 ? d.jasny : d.tlo;
}

// ---------------------------------------------------------------- trzepak

/** trzepak z PixelLab jako sprite rzeczy 3×1 (rzeczy.ts): kotwica w środku dolnej krawędzi podstawy, stopy
    w wierszu podstawy kafelka jak betonowe stopy trzepaka z kodu */
export function trzepakSprite(t: Trzepak): Sprite {
  const px = Uint32Array.from(t.img.px, (p) => (p >>> 24 ? p : 0));
  return { w: t.img.w, h: t.img.h, ax: t.img.w / 2, ay: t.stopy + 32 - t.podstawa, px };
}

/** sprite rzeczy na mapie: trzepak od frontu (3×1, rot 0 i 2) z PixelLab, gdy jest grafika; trzepak bokiem
    (1×3, PixelLab dał tylko widok od frontu) i wszystkie inne rzeczy z kodu (rzeczy.ts) */
export function rzeczSprite(spec: ThingSpec, g: Grafika | null): Sprite {
  if (spec.kind === 'trzepak' && g?.trzepak && !(spec.rot & 1)) return trzepakSprite(g.trzepak);
  return thingSprite(spec);
}

// ---------------------------------------------------------------- ludzie

/** jasność koloru 0xRRGGBB */
const jasnosc = (c: number): number => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);

/**
 * Mapa przemalowania ubrania na rampę palety (0xRRGGBB → 0xRRGGBB): najciemniejszy kolor ubrania idzie na pierwszy
 * kolor rampy, następny na drugi i tak dalej, nadmiar na ostatni. Z kilku postaci z PixelLab robi tłum bez
 * kolejnych generacji.
 */
export function mapaPrzemalowania(kolory: readonly string[], rampa: readonly string[]): Map<number, number> {
  const z = kolory.map(hex).sort((a, b) => jasnosc(a) - jasnosc(b));
  return new Map(z.map((c, i) => [c, hex(rampa[Math.min(i, rampa.length - 1)])]));
}

/**
 * Przemalowuje w miejscu piksele klatek w atlasie (piksele jak ImageData czytane przez Uint32Array, szerokość
 * atlasu szer): wszystkie piksele klatek o kolorze z mapy, w każdej pozie tak samo. Które kolory są ubraniem, wybiera
 * generator atlasu (kolory leżące w większości na tułowiu), bo stały pas wysokości nie pasuje do pozy przysiadu.
 */
export function przemalujKlatki(
  px: Uint32Array,
  szer: number,
  klatki: readonly (readonly number[])[],
  mapa: ReadonlyMap<number, number>,
): void {
  if (!mapa.size) return;
  for (const [x, y, w, h] of klatki)
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const i = (y + r) * szer + x + c;
        const p = px[i];
        if (!(p >>> 24)) continue;
        const n = mapa.get(((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff));
        if (n !== undefined) px[i] = (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
      }
}

/**
 * Atlas przemalowanej wersji: kopia pasa wierszy [od, do) atlasu ludzi (szerokość szer), w której ubrania podanych
 * postaci mają kolory rampy. Klatki postaci leżą w tym pasie (regiony), więc kopia ma ich współrzędne przesunięte
 * o `od` w pionie. Atlas źródłowy zostaje bez zmian.
 */
export function atlasWersji(
  px: Uint32Array,
  szer: number,
  pas: readonly [number, number],
  postacie: readonly PostacLudzi[],
  rampa: readonly string[],
): Uint32Array {
  const kopia = px.slice(pas[0] * szer, pas[1] * szer);
  for (const p of postacie) {
    const mapa = mapaPrzemalowania(p.przemalowanie.kolory, rampa);
    if (!mapa.size) continue;
    const klatki: number[][] = [];
    for (const a of Object.values(p.animacje))
      for (const k of a.kierunki)
        if (Array.isArray(k)) for (const [x, y, w, h] of k) klatki.push([x, y - pas[0], w, h]);
    przemalujKlatki(kopia, szer, klatki, mapa);
  }
  return kopia;
}

/**
 * Numery ramp od najdalszej od kolorów ubrania do najbliższej (średnia odległość RGB koloru ubrania od najbliższego
 * koloru rampy, malejąco; remis zostaje w kolejności ramp). Kolejne egzemplarze tej samej postaci zarządu biorą ramy
 * po kolei, więc drugi różni się od pierwszego wyraźnie, a nie kopią (granatowe ubranie na rampie granat). Bez
 * kolorów ubrania kolejność ramp zostaje.
 */
export function rampyOdNajdalszej(kolory: readonly string[], rampy: readonly (readonly string[])[]): number[] {
  const rgb = (c: string) => {
    const n = hex(c);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  };
  const odl = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const ubranie = kolory.map(rgb);
  const daleko = rampy.map((r) => {
    if (ubranie.length === 0) return 0;
    const kr = r.map(rgb);
    return ubranie.reduce((s, c) => s + Math.min(...kr.map((k) => odl(c, k))), 0) / ubranie.length;
  });
  return rampy.map((_, i) => i).sort((a, b) => daleko[b] - daleko[a] || a - b);
}

/** odległość wieku od przedziału postaci: 0 w środku */
const odlegloscWieku = (wiek: number, [od, do_]: readonly [number, number]) =>
  wiek < od ? od - wiek : wiek > do_ ? wiek - do_ : 0;

/**
 * Postać dla osoby z gry: z zarządu albo z mieszkańców (zarząd ma cztery własne postaci, mieszkańcy resztę), tej
 * samej płci i o najbliższym przedziale wieku (w środku przedziału odległość jest zerowa). Gdy pasuje kilka, wybiera
 * `los` (liczba całkowita, np. skrót id osoby), więc ta sama osoba zawsze wygląda tak samo. Bez postaci o tej płci w grupie
 * bierze dowolną z grupy; pusta grupa to błąd.
 */
export function postacDlaOsoby(
  postacie: readonly PostacLudzi[],
  osoba: { f: boolean; age: number; zarzad: boolean },
  los: number,
): PostacLudzi {
  const grupa = postacie.filter((p) => p.zarzad === osoba.zarzad);
  if (grupa.length === 0) throw new Error(`brak postaci ${osoba.zarzad ? 'zarządu' : 'mieszkańców'}`);
  const tejPlci = grupa.filter((p) => p.plec === (osoba.f ? 'k' : 'm'));
  const kandydaci = tejPlci.length > 0 ? tejPlci : grupa;
  const odleglosci = kandydaci.map((p) => odlegloscWieku(osoba.age, p.wiek));
  const najblizsza = Math.min(...odleglosci);
  const pasujace = kandydaci.filter((_, i) => odleglosci[i] === najblizsza);
  return pasujace[(los >>> 0) % pasujace.length];
}

/**
 * Postać mieszkańca dla pionka bez osoby (przybysz, handlarz, zbir, wędrowiec, tłum): po numerze wyglądu z gry, po
 * kolei przez wszystkich dorosłych mieszkańców (zbir nie wygląda jak dziecko).
 */
export function postacDlaWygladu(postacie: readonly PostacLudzi[], look: number): PostacLudzi {
  const pula = postacie.filter((p) => !p.zarzad && p.wiek[1] >= 16);
  if (pula.length === 0) throw new Error('brak postaci mieszkańców');
  return pula[look % pula.length];
}
