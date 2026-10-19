/* Który z 11 wyglądów budynków z PixelLab (kamienica, ratusz, muzeum, kościół, urząd, teatr, hotel, dworzec, willa,
   remiza OSP, szpital) dostaje budynek, albo null: wtedy zostaje dawny wygląd z kodu. Rozpoznanie jest po stronie
   rysowania: czyste funkcje bez zmiany classify(), klas budynków (`cls`) i symulacji.

   Sygnały, od najpewniejszych: rodzaj punktu w budynku (muzeum, teatr, hotel, dworzec, remiza, szpital, kościół z map,
   src/world/rodzaje.ts), klasa kościoła, tagi OSM samego budynku (Overpass), nazwa z OSM, a dopiero potem nazwa
   z punktu w środku i kategoria punktów (`cats`). Urząd, poczta, biblioteka i willa bywają lokatorami innych
   budynków (poczta w parterze bloku), więc jako słabe sygnały działają tylko w budynku z najwyżej dwiema kategoriami
   sklepów i usług. Kamienicę poznaje się po zabudowie: kilka budynków obok siebie ścianami, różnej szerokości (sekcje
   bloku z wielkiej płyty są niemal równe), z frontem przy jezdni i znaną liczbą pięter od 3 do 6. */

import type { BuildingClass } from '../../content/data.ts';
import { PRIORYTET_RODZAJOW, type RodzajPunktu, rodzajZNazwy, rodzajZTagow } from '../../world/rodzaje.ts';
import { T } from '../../world/terrain.ts';
import type { WorldBuilding } from '../../world/world.ts';

export const LOOKI = [
  'kamienica',
  'ratusz',
  'muzeum',
  'kosciol',
  'urzad',
  'teatr',
  'hotel',
  'dworzec',
  'willa',
  'remiza',
  'szpital',
] as const;
export type LookBudynku = (typeof LOOKI)[number];

/** to, czego rozpoznanie potrzebuje od budynku świata */
export type LookWejscie = Pick<
  WorldBuilding,
  'cls' | 'levels' | 'name' | 'area' | 'cats' | 'tags' | 'startDate' | 'rodzaje'
>;

/** sąsiedztwo budynku w siatce świata (kontekstyLookow), potrzebne tylko do kamienic */
export interface LookKontekst {
  /** ile budynków tworzy ciąg stykający się ścianami z tym budynkiem (z nim samym), w poziomie albo w pionie, zależnie
      od tego, gdzie ciąg jest dłuższy; 1: stoi osobno */
  rzad: number;
  /** odchylenie standardowe szerokości budynków ciągu podzielone przez ich średnią; 0 dla ciągu jednego budynku */
  nieregularnosc: number;
  /** ułamek wolnych kafelków przy najbardziej „ulicznym” boku budynku, za którymi do 4 kafelków dalej jest jezdnia */
  przyUlicy: number;
  /** rozmiar tego budynku wzdłuż ciągu w metrach (szerokość dla rzędu poziomego, głębokość dla pionowego) */
  front: number;
  /** jaka część pozostałych budynków ciągu ma pole w granicach 10% pola tego budynku (0 dla ciągu jednego budynku):
      sekcje bloku z wielkiej płyty są dla siebie bliźniakami, kamienice prawie nigdy */
  blizniaki: number;
}

/** ograniczenia wyglądu: pole obrysu w m² i liczba pięter (piętra tylko, gdy znamy je z danych, bo inaczej to zgadnięte) */
interface Warunki {
  minPole: number;
  maxPole?: number;
  minPietra?: number;
  maxPietra?: number;
}

const WARUNKI: Record<LookBudynku, Warunki> = {
  szpital: { minPole: 250, minPietra: 2 },
  ratusz: { minPole: 150, maxPietra: 5 },
  teatr: { minPole: 150, maxPietra: 5 },
  muzeum: { minPole: 120, maxPietra: 4 },
  dworzec: { minPole: 120, maxPietra: 4 },
  remiza: { minPole: 80, maxPietra: 3 },
  kosciol: { minPole: 80, maxPietra: 4 },
  hotel: { minPole: 150, minPietra: 2 },
  urzad: { minPole: 100, maxPietra: 6 },
  willa: { minPole: 60, maxPole: 500, maxPietra: 3 },
  kamienica: { minPole: 120, maxPole: 900, minPietra: 3, maxPietra: 6 },
};

/** wygląd dla rodzaju punktu */
const WYGLAD: Record<RodzajPunktu, LookBudynku> = {
  ratusz: 'ratusz',
  urzad: 'urzad',
  muzeum: 'muzeum',
  teatr: 'teatr',
  hotel: 'hotel',
  dworzec: 'dworzec',
  remiza: 'remiza',
  szpital: 'szpital',
  kosciol: 'kosciol',
  willa: 'willa',
};

/** rodzaje, które są samym budynkiem (punkt muzeum czy szpitala stoi w muzeum i szpitalu); urząd i willa to słabe */
const MOCNE: ReadonlySet<RodzajPunktu> = new Set([
  'ratusz',
  'muzeum',
  'teatr',
  'hotel',
  'dworzec',
  'remiza',
  'szpital',
  'kosciol',
]);

/** klasy, z których bywa kamienica (bez szkół, kościołów, garaży, hal i przychodni) */
const KLASY_KAMIENICY: ReadonlySet<BuildingClass> = new Set(['blok', 'dom', 'sklep', 'inne']);
/** willa to dom, a przy zwykłym tagu building=yes i polu 45–350 m² Overpass daje klasę inne */
const KLASY_WILLI: ReadonlySet<BuildingClass> = new Set(['dom', 'inne']);

/** od tylu kategorii punktów budynek jest handlowo-usługowy (lokatorzy), a nie urzędem czy biblioteką */
const MIESZANE_OD = 3;

/** progi kamienicy */
const KAMIENICA = { rzad: 3, nieregularnosc: 0.12, przyUlicy: 0.5, front: 22, blizniaki: 0.5 } as const;
/** pole bliźniaka: różnica do tylu własnego pola */
const BLIZNIAK = 0.1;
/** od tego roku budowy budynek to już nie kamienica */
const KAMIENICA_DO_ROKU = 1950;

const znanePietra = (b: LookWejscie): boolean => Number.parseInt(b.tags['building:levels'], 10) > 0;

/** rok z daty budowy OSM („1975”, „1970s”, „~1965”, „C19”): pierwsza liczba czterocyfrowa albo null */
function rokBudowy(data: string | undefined): number | null {
  const m = data ? /\d{4}/.exec(data) : null;
  return m ? Number(m[0]) : null;
}

/** czy budynek mieści się w ograniczeniach wyglądu */
function spelnia(look: LookBudynku, b: LookWejscie): boolean {
  const w = WARUNKI[look];
  if (b.area < w.minPole || (w.maxPole !== undefined && b.area > w.maxPole)) return false;
  if (look === 'willa' && !KLASY_WILLI.has(b.cls)) return false;
  if (znanePietra(b)) {
    if (w.minPietra !== undefined && b.levels < w.minPietra) return false;
    if (w.maxPietra !== undefined && b.levels > w.maxPietra) return false;
  }
  return true;
}

/** rodzaje z budynku: mocne (to on sam) i słabe (może być lokatorem albo trafem w nazwie z punktu) */
function rodzajeBudynku(b: LookWejscie): { mocne: Set<RodzajPunktu>; slabe: Set<RodzajPunktu> } {
  const mocne = new Set<RodzajPunktu>();
  const slabe = new Set<RodzajPunktu>();
  const dodaj = (k: RodzajPunktu | null, pewny = true) => {
    if (k) (pewny && MOCNE.has(k) ? mocne : slabe).add(k);
  };
  for (const k of b.rodzaje ?? []) dodaj(k);
  if (b.cls === 'kosciol') mocne.add('kosciol');
  for (const c of b.cats) {
    if (c === 'kosciol') slabe.add('kosciol');
    else if (c === 'biblioteka') slabe.add('urzad');
  }
  dodaj(rodzajZTagow(b.tags));
  // nazwa z OSM jest nazwą budynku; nazwa bez niej pochodzi z punktu w środku (albo z gry), więc to tylko słaby sygnał
  if (b.tags.name) dodaj(rodzajZNazwy(b.tags.name));
  else dodaj(rodzajZNazwy(b.name), false);
  return { mocne, slabe };
}

/** kamienica: zabudowa pierzejowa o kilku piętrach, z kontekstu świata */
function kamienica(b: LookWejscie, ctx: LookKontekst): boolean {
  if (!KLASY_KAMIENICY.has(b.cls) || !znanePietra(b) || !spelnia('kamienica', b)) return false;
  const rok = rokBudowy(b.startDate);
  if (rok !== null && rok >= KAMIENICA_DO_ROKU) return false;
  return (
    ctx.rzad >= KAMIENICA.rzad &&
    ctx.nieregularnosc >= KAMIENICA.nieregularnosc &&
    ctx.przyUlicy >= KAMIENICA.przyUlicy &&
    ctx.front <= KAMIENICA.front &&
    ctx.blizniaki <= KAMIENICA.blizniaki
  );
}

/**
 * Wygląd budynku albo null (dawny wygląd z kodu). Najpierw rodzaje (w kolejności PRIORYTET_RODZAJOW), każdy tylko jeśli
 * budynek mieści się w jego ograniczeniach (pole i piętra), na końcu kamienica z kontekstu świata (bez niego nie ma
 * kamienic).
 */
export function lookBudynku(b: LookWejscie, ctx?: LookKontekst | null): LookBudynku | null {
  const { mocne, slabe } = rodzajeBudynku(b);
  const mieszane = b.cats.length >= MIESZANE_OD;
  for (const k of PRIORYTET_RODZAJOW) {
    if (!mocne.has(k) && (mieszane || !slabe.has(k))) continue;
    const look = WYGLAD[k];
    if (spelnia(look, b)) return look;
  }
  return ctx && kamienica(b, ctx) ? 'kamienica' : null;
}

/** to, czego kontekst potrzebuje od świata: siatka budynków i terenu oraz prostokąty budynków */
export interface SwiatLookow {
  size: number;
  bid: Int32Array;
  terr: Uint8Array;
  buildings: readonly Pick<WorldBuilding, 'id' | 'x0' | 'y0' | 'x1' | 'y1' | 'area'>[];
}

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
/** jak daleko od ściany szuka się jezdni (w kafelkach): chodnik z ulicy ma 2 m, a kamienice stoją przy chodniku */
const ZASIEG_ULICY = 4;
/** mniej wolnych kafelków przy boku to nie front */
const MIN_BOK = 4;

function zbiory(n: number) {
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (par[i] !== i) {
      par[i] = par[par[i]];
      i = par[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const x = find(a);
    const y = find(b);
    if (x !== y) par[y] = x;
  };
  return { find, union };
}

/** budynki po składowych zbioru: numer korzenia → numery budynków */
function skladowe(n: number, find: (i: number) => number): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const lista = m.get(r);
    if (lista) lista.push(i);
    else m.set(r, [i]);
  }
  return m;
}

/**
 * Kontekst wszystkich budynków świata: ciągi budynków stykających się ścianami (osobno w poziomie i w pionie, bo
 * rząd kamienic idzie wzdłuż ulicy w którąkolwiek stronę), nieregularność ich szerokości i to, czy któryś bok budynku
 * jest przy jezdni. Jedno przejście po siatce, bez zależności od identyfikatorów budynków poza numerem w tablicy.
 */
export function kontekstyLookow(w: SwiatLookow): LookKontekst[] {
  const { size, bid, terr, buildings } = w;
  const n = buildings.length;
  const poziomo = zbiory(n);
  const pionowo = zbiory(n);
  const licz = new Int32Array(n * 4);
  const trafione = new Int32Array(n * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const a = bid[i];
      if (a < 0) continue;
      if (x + 1 < size) {
        const b = bid[i + 1];
        if (b >= 0 && b !== a) poziomo.union(a, b);
      }
      if (y + 1 < size) {
        const b = bid[i + size];
        if (b >= 0 && b !== a) pionowo.union(a, b);
      }
      // wolne kafelki przy bokach (N, S, W, E) i jezdnia w zasięgu za nimi; ściana wspólna z sąsiadem to nie bok
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || bid[ny * size + nx] >= 0) continue;
        licz[a * 4 + d]++;
        for (let k = 0; k < ZASIEG_ULICY; k++) {
          const cx = nx + DX[d] * k;
          const cy = ny + DY[d] * k;
          if (cx < 0 || cy < 0 || cx >= size || cy >= size) break;
          const j = cy * size + cx;
          if (bid[j] >= 0) break;
          if (terr[j] === T.ROAD) {
            trafione[a * 4 + d]++;
            break;
          }
        }
      }
    }
  const szer = (i: number) => buildings[i].x1 - buildings[i].x0 + 1;
  const gleb = (i: number) => buildings[i].y1 - buildings[i].y0 + 1;
  const wPoziomie = skladowe(n, poziomo.find);
  const wPionie = skladowe(n, pionowo.find);
  return buildings.map((b, i) => {
    const wp = wPoziomie.get(poziomo.find(i)) as number[];
    const wn = wPionie.get(pionowo.find(i)) as number[];
    const poziomy = wp.length >= wn.length;
    const czlonkowie = poziomy ? wp : wn;
    const rozmiar = poziomy ? szer : gleb;
    let suma = 0;
    let sumaKw = 0;
    for (const j of czlonkowie) {
      suma += rozmiar(j);
      sumaKw += rozmiar(j) ** 2;
    }
    const srednia = suma / czlonkowie.length;
    const odchylenie = Math.sqrt(Math.max(0, sumaKw / czlonkowie.length - srednia * srednia));
    const inni = czlonkowie.filter((j) => j !== i);
    const blizniaki = inni.filter((j) => Math.abs(buildings[j].area - b.area) <= BLIZNIAK * b.area).length;
    let przyUlicy = 0;
    for (let d = 0; d < 4; d++)
      if (licz[i * 4 + d] >= MIN_BOK) przyUlicy = Math.max(przyUlicy, trafione[i * 4 + d] / licz[i * 4 + d]);
    return {
      rzad: czlonkowie.length,
      nieregularnosc: czlonkowie.length > 1 ? odchylenie / srednia : 0,
      przyUlicy,
      front: rozmiar(i),
      blizniaki: inni.length ? blizniaki / inni.length : 0,
    };
  });
}
