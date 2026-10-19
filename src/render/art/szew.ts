/* Szwy między kwadratami miasta w rysowaniu (docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md, „Rysowanie
   wielu kwadratów”). Każdy kwadrat ma własną scenę (scene.ts) i rysuje kawałki tylko ze swoich danych, więc przy
   wspólnej krawędzi brakuje mu tego, co leży po drugiej stronie: terenu (krawężnik, brzeg wody i kafelki Wanga patrzą na
   sąsiada), reszty przeciętego budynku (fasada i attyka nie mogą kończyć się na szwie) i cieni, które sąsiad rzuca
   na ten kwadrat (cień pada w górę i w prawo, więc przychodzi od południa, zachodu i południowego zachodu).
   Dane szwu (`DaneSzwu`) to czysty wynik liczony ze światów i stylów obu scen (`daneSzwu`), niewielki, więc idzie do
   workerów jako część łatki sceny; `nalozSzew` stosuje go do sceny (w głównym wątku i w workerze tak samo).
   Wynik nie zależy od kolejności dodawania kwadratów: dane szwu dwóch kwadratów to funkcja ich światów, a nakładanie
   jest idempotentne (pasy się podmieniają, cienie sumują). `kawalkiSzwu` mówi, które kawałki sceny trzeba przerysować
   po nałożeniu: tylko te przy wspólnej krawędzi. Moduł nie zależy od PixiJS ani od DOM. */

import { T } from '../../world/terrain.ts';
import { type BrylaCienia, type ChunkScene, obliczKolumny, rzucCienie, SUB } from './scene.ts';

/** strona kwadratu, po której leży sąsiad (y rośnie na południe) */
export type Strona = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const STRONY: readonly Strona[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** o ile kwadratów (dx, dy) leży sąsiad po danej stronie */
export const PRZESUNIECIE: Readonly<Record<Strona, readonly [number, number]>> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};

/** strona, po której leży sąsiad przesunięty o (dx, dy) kwadratów (każde z dx i dy to −1, 0 albo 1, nie oba zera) */
export function stronaZPrzesuniecia(dx: number, dy: number): Strona {
  const strona = STRONY.find((s) => PRZESUNIECIE[s][0] === dx && PRZESUNIECIE[s][1] === dy);
  if (!strona) throw new Error(`zły szew: (${dx}, ${dy})`);
  return strona;
}

/** strona, po której kwadrat leży względem sąsiada, który leży po stronie `s` względem niego */
export const PRZECIWNA: Readonly<Record<Strona, Strona>> = {
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
  nw: 'se',
};

/** prostokąt maski cieni sceny (oczka SUB na kafelek): x, y, w, h w oczkach, dane wierszami (1 = cień) */
export interface ProstokatMaski {
  x: number;
  y: number;
  w: number;
  h: number;
  dane: Uint8Array;
}

/** to, co scena dostaje od sąsiada leżącego po stronie `strona` */
export interface DaneSzwu {
  strona: Strona;
  /** kody terenu sąsiada tuż za krawędzią: pas długości size (n, e, s, w) albo jeden kod za rogiem (narożniki) */
  teren: Uint8Array;
  /** n i s: w kolumnach, w których budynek sąsiada ciągnie dalej budynek tego kwadratu, ile kafelków (najwyżej MAX_KONT);
      brak, gdy żaden budynek nie przechodzi przez szew */
  kont?: Uint8Array;
  /** cień, który budynki sąsiada rzucają na ten kwadrat (s, w, sw); brak, gdy żaden nie sięga */
  sombra?: ProstokatMaski;
}

/** najdłuższy ciąg budynku za szwem, który ma znaczenie (Uint8; fasada ma najwyżej kilka kafelków) */
export const MAX_KONT = 255;
/** zasięg cienia najwyższego budynku (16 kondygnacji): na północ ok. 10,1 m, na wschód ok. 5,1 m; w oczkach z zapasem */
const CIEN_PN = 12 * SUB;
const CIEN_WS = 6 * SUB;

type Zrodlo = Pick<ChunkScene, 'w' | 'styles'>;

/** kolumna (x = 0 albo size − 1) i wiersz (y = 0 albo size − 1) terenu jako pas */
function pas(terr: Uint8Array, size: number, os: 'wiersz' | 'kolumna', nr: number): Uint8Array {
  if (os === 'wiersz') return terr.slice(nr * size, (nr + 1) * size);
  const out = new Uint8Array(size);
  for (let y = 0; y < size; y++) out[y] = terr[y * size + nr];
  return out;
}

/** Kontynuacje budynków przez szew poziomy: w kolumnie x, gdzie budynek a dotyka krawędzi (a.bid[rzadA] ≥ 0) i budynek b
    dotyka jej od drugiej strony, długość ciągu budynku b od jego krawędzi (kolejne kafelki tego samego numeru). */
function kontynuacje(a: Zrodlo, b: Zrodlo, doDolu: boolean): Uint8Array | undefined {
  const size = a.w.size;
  const wierszA = doDolu ? size - 1 : 0;
  const wierszB = doDolu ? 0 : size - 1;
  const krok = doDolu ? 1 : -1;
  const out = new Uint8Array(size);
  let jakis = false;
  for (let x = 0; x < size; x++) {
    if (a.w.bid[wierszA * size + x] < 0) continue;
    const nr = b.w.bid[wierszB * size + x];
    if (nr < 0) continue;
    let k = 0;
    while (k < size && k < MAX_KONT && b.w.bid[(wierszB + krok * k) * size + x] === nr) k++;
    out[x] = k;
    jakis = true;
  }
  return jakis ? out : undefined;
}

/** Cień budynków sąsiada b (leży po stronie s, w, sw kwadratu a) w oknie maski kwadratu a. */
function cienZSasiada(a: Zrodlo, b: Zrodlo, strona: Strona): ProstokatMaski | undefined {
  const size = a.w.size;
  const S = size * SUB;
  const [dx, dy] = PRZESUNIECIE[strona];
  const rx = 0;
  const rw = dx < 0 ? CIEN_WS : S;
  const ry = dy > 0 ? S - CIEN_PN : 0;
  const rh = dy > 0 ? CIEN_PN : S;
  const dane = new Uint8Array(rw * rh);
  // budynki sąsiada, które mogą sięgnąć okna: przy szwie poziomym najwyżej CIEN_PN/SUB wierszy od jego górnej krawędzi,
  // przy pionowym kilka ostatnich kolumn
  const blisko = (bd: BrylaCienia) =>
    (dy <= 0 || bd.y0 <= CIEN_PN / SUB) && (dx >= 0 || bd.x1 >= size - CIEN_WS / SUB - 1);
  let jakis = false;
  rzucCienie(
    b.w,
    (id) => b.styles[id].levels,
    (i) => {
      const cx = i % S;
      const cy = (i - cx) / S;
      if (cx < rx || cx >= rx + rw || cy < ry || cy >= ry + rh) return;
      // cień nie leży na dachach kwadratu a
      if (a.w.terr[(cy >> 2) * size + (cx >> 2)] === T.BUILDING) return;
      dane[(cy - ry) * rw + (cx - rx)] = 1;
      jakis = true;
    },
    -dx * S,
    -dy * S,
    blisko,
  );
  return jakis ? { x: rx, y: ry, w: rw, h: rh, dane } : undefined;
}

/**
 * Dane szwu: co kwadrat a (jego scena) dostaje od sąsiada b, który leży po stronie `strona` kwadratu a. Sceny muszą
 * mieć ten sam rozmiar. Czysta funkcja światów i stylów (poziomy budynków sąsiada) obu scen.
 */
export function daneSzwu(a: Zrodlo, b: Zrodlo, strona: Strona): DaneSzwu {
  const size = a.w.size;
  const bt = b.w.terr;
  switch (strona) {
    case 'n':
      return { strona, teren: pas(bt, size, 'wiersz', size - 1), kont: kontynuacje(a, b, false) };
    case 's':
      return {
        strona,
        teren: pas(bt, size, 'wiersz', 0),
        kont: kontynuacje(a, b, true),
        sombra: cienZSasiada(a, b, strona),
      };
    case 'w':
      return { strona, teren: pas(bt, size, 'kolumna', size - 1), sombra: cienZSasiada(a, b, strona) };
    case 'e':
      return { strona, teren: pas(bt, size, 'kolumna', 0) };
    case 'nw':
      return { strona, teren: Uint8Array.of(bt[size * size - 1]) };
    case 'ne':
      return { strona, teren: Uint8Array.of(bt[(size - 1) * size]) };
    case 'sw':
      return { strona, teren: Uint8Array.of(bt[size - 1]), sombra: cienZSasiada(a, b, strona) };
    case 'se':
      return { strona, teren: Uint8Array.of(bt[0]) };
  }
}

/** Nakłada dane szwu na scenę (w głównym wątku i w workerze): pas terenu, ciągi budynków (south i run kolumn liczą się
    od nowa) i cień sąsiada. Dane tej samej strony nałożone drugi raz dają ten sam wynik. */
export function nalozSzew(sc: ChunkScene, d: DaneSzwu): void {
  const br = (sc.brzeg ??= {});
  switch (d.strona) {
    case 'n':
      br.n = d.teren;
      br.kontN = d.kont;
      break;
    case 's':
      br.s = d.teren;
      br.kontS = d.kont;
      break;
    case 'e':
      br.e = d.teren;
      break;
    case 'w':
      br.w = d.teren;
      break;
    case 'nw':
      br.nw = d.teren[0];
      break;
    case 'ne':
      br.ne = d.teren[0];
      break;
    case 'sw':
      br.sw = d.teren[0];
      break;
    case 'se':
      br.se = d.teren[0];
      break;
  }
  if (d.strona === 'n' || d.strona === 's') obliczKolumny(sc.w, sc.south, sc.run, br.kontN, br.kontS);
  const m = d.sombra;
  if (m) {
    const S = sc.w.size * SUB;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) if (m.dane[y * m.w + x]) sc.shadow[(m.y + y) * S + m.x + x] = 1;
  }
}

/** Kawałki sceny (numer cy·chunks + cx), które zmienia szew po stronie `strona`: te przy wspólnej krawędzi, dla
    narożnika jeden. Cień sąsiada i pasy terenu sięgają co najwyżej kilkunastu metrów w głąb, czyli nie dalej niż kawałek. */
export function kawalkiSzwu(chunks: number, strona: Strona): number[] {
  const [dx, dy] = PRZESUNIECIE[strona];
  const out: number[] = [];
  const os = (d: number) => (d < 0 ? [0] : d > 0 ? [chunks - 1] : Array.from({ length: chunks }, (_, k) => k));
  for (const cy of os(dy)) for (const cx of os(dx)) out.push(cy * chunks + cx);
  return out;
}
