/* Kamera za osobą z listy ludzi (src/ui/lista.ts): jeden krok wygładzania ku celowi, rozpoznanie, że kamerę ruszył ktoś
   inny, i klasa `KameraZaOsoba`, która z tego składa lot do osoby i śledzenie jej. Kliknięcie osoby na liście zawozi
   kamerę do niej tym samym krokiem, który potem prowadzi ją za nią, gdy gracz kliknie drugi raz. Bez DOM i bez widoku
   (kamerę i położenie osób dostaje przez `WejscieKamery`), żeby dało się to sprawdzić w Node.

   Wygładzanie jest wykładnicze i zależy od czasu, nie od liczby klatek: dwie klatki po 16 ms dają tę samą drogę co
   jedna klatka 32 ms (przy 8× i na wolnym telefonie klatki są nierówne). Kamera to punkt w pikselach świata. */

export interface Punkt {
  x: number;
  y: number;
}

/** stała czasu wygładzania w ms: tyle trwa pokonanie 63% drogi do celu (lot na drugi koniec osiedla to około sekundy,
    a za idącą osobą kamera spóźnia się o kilka pikseli) */
export const TAU_MS = 170;
/** bliżej celu niż tyle pikseli kamera staje dokładnie na nim: bez drgań ułamków piksela i bez nieskończonego dojazdu */
export const PRZYCIAGANIE = 0.5;
/** o tyle pikseli kamera musi odejść od miejsca, które ustawiliśmy jej sami, żeby uznać, że ruszył ją gracz (przeciąganie,
    WASD, kółko, lot z alarmu) */
export const RUCH_GRACZA = 0.75;

/** jeden krok kamery z `cam` ku `cel` po `dtMs` milisekundach; `doszla`, gdy stoi na celu */
export function krokKamery(cam: Punkt, cel: Punkt, dtMs: number): Punkt & { doszla: boolean } {
  const a = 1 - Math.exp(-Math.max(0, dtMs) / TAU_MS);
  const x = cam.x + (cel.x - cam.x) * a;
  const y = cam.y + (cel.y - cam.y) * a;
  if (Math.hypot(cel.x - x, cel.y - y) < PRZYCIAGANIE) return { x: cel.x, y: cel.y, doszla: true };
  return { x, y, doszla: false };
}

/** czy kamera jest gdzie indziej, niż ją ostatnio ustawiliśmy (null: nic jeszcze nie ustawialiśmy) */
export function kameraRuszona(ostatnia: Punkt | null, cam: Punkt): boolean {
  return !!ostatnia && (Math.abs(cam.x - ostatnia.x) > RUCH_GRACZA || Math.abs(cam.y - ostatnia.y) > RUCH_GRACZA);
}

/** o ile kafelka kamera leży wyżej niż stopy osoby: środek postaci, nie jej cień */
export const SRODEK_POSTACI = 0.4;
/** kamera, która utknęła przy brzegu mapy, przesuwa się o mniej niż tyle pikseli na klatkę: lot się kończy */
const UTKNELA = 0.01;

/** to, czego kamera za osobą potrzebuje od gry (main.ts podaje to samo, co widok i symulacja) */
export interface WejscieKamery {
  /** kamera widoku: piksele świata (środek ekranu) i przybliżenie; klasa zmienia tylko x i y */
  kamera: Punkt & { zoom: number };
  /** przycina kamerę do mapy (`view.clampCam`) */
  przytnij: () => void;
  /** piksele świata na kafelek */
  kafelek: number;
  /** miejsce osoby na mapie w kafelkach; null, gdy jej tam nie ma (wyprawa, śmierć) */
  pozycja: (pawn: number) => Punkt | null;
  /** czy trwa lot kamery zlecony przez kogoś innego (main.ts: `flyTo`) i jego przerwanie */
  lotTrwa: () => boolean;
  przerwijLot: () => void;
}

/**
 * Jazda kamery do osoby i śledzenie jej. `jedz` zaczyna lot (albo śledzenie), `krok` woła pętla gry co klatkę po ruchu
 * kamery klawiaturą i przycięciu jej do mapy. Kamerę, którą sami ustawiliśmy w poprzedniej klatce, pamiętamy: inna pozycja
 * to ruch gracza (przeciąganie, WASD, gładzik) albo lot z innego powodu, i kończy lot lub śledzenie. Przybliżenie kółkiem
 * przesuwa środek kamery razem ze zmianą zoomu, więc przy zmianie zoomu różnicy pozycji nie liczymy: kamera wraca do osoby.
 */
export class KameraZaOsoba {
  /** pionek, do którego jedzie kamera (null: nic nie robi) */
  cel: number | null = null;
  /** po dojechaniu kamera zostaje przy osobie */
  sledzi = false;
  private readonly o: WejscieKamery;
  private ostatnia: Punkt | null = null;
  private ostatniZoom = 0;

  constructor(o: WejscieKamery) {
    this.o = o;
  }

  /** zaczyna lot do osoby (`sledz`: potem za nią chodzi); osoby, której nie ma na mapie, nie rusza i kończy to, co trwało */
  jedz(pawn: number, sledz: boolean): void {
    if (!this.o.pozycja(pawn)) {
      this.zatrzymaj();
      return;
    }
    this.cel = pawn;
    this.sledzi = sledz;
    this.ostatnia = null;
    this.o.przerwijLot();
  }

  zatrzymaj(): void {
    this.cel = null;
    this.sledzi = false;
    this.ostatnia = null;
  }

  /** jeden krok po `dtMs` milisekundach od poprzedniej klatki */
  krok(dtMs: number): void {
    if (this.cel === null) return;
    const p = this.o.pozycja(this.cel);
    const kam = this.o.kamera;
    // osoby nie ma na mapie, albo kamerę ruszył ktoś inny: lot z innego powodu albo gracz
    if (
      !p ||
      (this.ostatnia && this.o.lotTrwa()) ||
      (kam.zoom === this.ostatniZoom && kameraRuszona(this.ostatnia, kam))
    ) {
      this.zatrzymaj();
      return;
    }
    const t = this.o.kafelek;
    const x0 = kam.x;
    const y0 = kam.y;
    const k = krokKamery(kam, { x: p.x * t, y: (p.y - SRODEK_POSTACI) * t }, dtMs);
    kam.x = k.x;
    kam.y = k.y;
    this.o.przytnij();
    this.ostatnia = { x: kam.x, y: kam.y };
    this.ostatniZoom = kam.zoom;
    // lot kończy się na osobie albo przy brzegu mapy, którego nie przekroczy; śledzenie trwa
    if (!this.sledzi && (k.doszla || Math.hypot(kam.x - x0, kam.y - y0) < UTKNELA)) this.zatrzymaj();
  }
}
