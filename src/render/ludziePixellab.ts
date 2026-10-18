/* Postacie z PixelLab w grze, część bez PixiJS (testy w Node): która postać z obsady gra dany pionek (płeć i wiek
   osoby z gry), w jakiej wersji kolorystycznej (ubranie przemalowane na rampę palety, z jednej postaci robi to kilka
   osób), który prostokąt atlasu ludzie.png rysuje daną pozę i czy klatka jest odbita. Pionek, któremu obsada nie ma
   postaci albo pracy, zostaje z kodu (null). Tekstury z tych prostokątów robi warstwa (ludzieLayer.ts). Wybór
   postaci, numer klatki i przemalowanie to czyste funkcje (art/pixellab.ts, art/animacjePozy.ts), tu jest ich
   zestawienie z pamięcią podręczną. */

import { kluczAnimacji, numerKlatki } from './art/animacjePozy.ts';
import {
  atlasWersji,
  type LudzieGrafika,
  type PostacLudzi,
  postacDlaOsoby,
  postacDlaWygladu,
  rampyOdNajdalszej,
} from './art/pixellab.ts';
import type { PoseView } from './poses.ts';

/** to, czego wybór postaci potrzebuje z pionka (Pawn z symulacji pasuje bez zmian) */
export interface PionekLudzi {
  id: number;
  kind: string;
  /** indeks w osobach gry albo −1 */
  person: number;
  look: number;
}

export interface OsobaLudzi {
  f: boolean;
  age: number;
}

/**
 * Klatka do narysowania: prostokąt w obrazie wersji (x, y, w, h; w kopii pasa wersji y liczy się od początku pasa),
 * punkt stóp w klatce (anchor = ax / w, ay / h) i lustro poziome. `wersja` 0 to atlas, dalej przemalowana kopia pasa
 * mieszkańców albo zarządu (`zarzad`). `zastepcza`: poza, której postać nie ma, gra stanie (nakładka broni jak przy kodzie).
 */
export interface KlatkaPionka {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  flip: boolean;
  wersja: number;
  zarzad: boolean;
  zastepcza: boolean;
}

/** liczba całkowita z indeksu osoby: ta sama osoba zawsze dostaje tę samą postać, bez losowania w widoku */
function skrot(n: number): number {
  let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return (h ^ (h >>> 13)) >>> 0;
}

export class LudziePixellab {
  /** postacie, które mają chód i stanie: tylko one grają pionki (brakujące zostają z kodu) */
  private readonly pula: PostacLudzi[];
  private readonly zarzad: boolean;
  private readonly mieszkancy: boolean;
  private readonly grafika: LudzieGrafika;
  private readonly rampy: string[][];
  private readonly postacie = new Map<number, PostacLudzi | null>();
  /** wersje pionków zarządu z ostatniego przypiszZarzad */
  private readonly wersjeZarzadu = new Map<number, number>();
  /** numery ramp postaci od najdalszej od jej ubrania (wersja = numer rampy + 1), liczone przy pierwszym dublu */
  private readonly rampyDublow = new Map<string, number[]>();
  /** przemalowane kopie pasów atlasu: klucz wersja × 2 + (zarząd ? 1 : 0), robione przy pierwszym użyciu */
  private readonly kopie = new Map<number, Uint32Array>();
  /** jedna odpowiedź na wszystkie wywołania klatka(): wołający zużywa ją od razu (bez śmieci co klatkę) */
  private readonly wynik: KlatkaPionka = {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    ax: 0,
    ay: 0,
    flip: false,
    wersja: 0,
    zarzad: false,
    zastepcza: false,
  };

  constructor(grafika: LudzieGrafika) {
    this.grafika = grafika;
    this.rampy = Object.values(grafika.opis.rampy);
    this.pula = grafika.opis.postacie.filter((p) => p.animacje.chod && p.animacje.stanie);
    this.zarzad = this.pula.some((p) => p.zarzad);
    this.mieszkancy = this.pula.some((p) => !p.zarzad);
  }

  /** postać pionka: zarząd z czterech postaci zarządu, reszta z mieszkańców, po płci i wieku osoby; pionek bez osoby
      (przybysz, tłum) po numerze wyglądu z gry, tylko dorosły. Wybór zostaje na stałe, dopóki pionek jest w grze. */
  postacPionka(p: PionekLudzi, osoby: readonly OsobaLudzi[]): PostacLudzi | null {
    const znana = this.postacie.get(p.id);
    if (znana !== undefined) return znana;
    const zarzad = p.kind === 'core';
    const osoba = p.person >= 0 ? osoby[p.person] : undefined;
    let postac: PostacLudzi | null = null;
    if (osoba && (zarzad ? this.zarzad : this.mieszkancy))
      postac = postacDlaOsoby(this.pula, { f: osoba.f, age: osoba.age, zarzad }, skrot(p.person));
    else if (!zarzad && this.mieszkancy) postac = postacDlaWygladu(this.pula, p.look);
    this.postacie.set(p.id, postac);
    return postac;
  }

  /**
   * Wersje kolorystyczne pionków zarządu, raz na klatkę przed rysowaniem (pionki z `st.pawns`, także te na wyprawie i
   * leżące). Z danej postaci pierwszy pionek (wg numeru osoby) jest w oryginale, następni na rampach od najdalszej od
   * jej ubrania, żeby dwóch takich samych ludzi nie było kopiami. Wersja zależy tylko od składu zarządu, nie od
   * kolejności rysowania ani od wypraw.
   */
  przypiszZarzad(pionki: readonly PionekLudzi[], osoby: readonly OsobaLudzi[]): void {
    this.wersjeZarzadu.clear();
    const grupy = new Map<string, { postac: PostacLudzi; lista: PionekLudzi[] }>();
    for (const p of pionki) {
      if (p.kind !== 'core') continue;
      const postac = this.postacPionka(p, osoby);
      if (!postac) continue;
      const g = grupy.get(postac.id);
      if (g) g.lista.push(p);
      else grupy.set(postac.id, { postac, lista: [p] });
    }
    for (const { postac, lista } of grupy.values()) {
      lista.sort((a, b) => a.person - b.person || a.id - b.id);
      lista.forEach((p, r) => {
        this.wersjeZarzadu.set(p.id, r === 0 ? 0 : this.wersjaDubla(postac, r));
      });
    }
  }

  /** wersja kolejnego (r-tego od zera) egzemplarza postaci zarządu */
  private wersjaDubla(postac: PostacLudzi, r: number): number {
    let rampy = this.rampyDublow.get(postac.id);
    if (!rampy) {
      rampy = rampyOdNajdalszej(postac.przemalowanie.kolory, this.rampy);
      this.rampyDublow.set(postac.id, rampy);
    }
    return rampy.length ? 1 + rampy[(r - 1) % rampy.length] : 0;
  }

  /** wersja kolorystyczna pionka: 0 oryginał, dalej ubranie na kolejnych rampach palety. Zarząd ma ją z przypiszZarzad,
      mieszkańcy po osobie (pionek bez osoby po numerze pionka). */
  wersjaPionka(p: PionekLudzi, postac: PostacLudzi): number {
    if (postac.zarzad) return this.wersjeZarzadu.get(p.id) ?? 0;
    return skrot((p.person >= 0 ? p.person : p.id + 7919) ^ 0x2f6b) % (this.rampy.length + 1);
  }

  /** pionek zniknął z gry albo wrócił z wyprawy */
  zapomnij(id: number): void {
    this.postacie.delete(id);
  }

  /** wszystkie wybory postaci od nowa (zrzuty zmieniają osoby po pierwszej klatce) */
  zapomnijWszystko(): void {
    this.postacie.clear();
    this.wersjeZarzadu.clear();
  }

  /** piksele przemalowanej wersji (od 1) pasa mieszkańców albo zarządu, zrobione przy pierwszym użyciu */
  pikseleWersji(zarzad: boolean, wersja: number): { px: Uint32Array; w: number; h: number } {
    const { img, opis } = this.grafika;
    const pas = zarzad ? opis.regiony.zarzad : opis.regiony.mieszkancy;
    const klucz = wersja * 2 + (zarzad ? 1 : 0);
    let px = this.kopie.get(klucz);
    if (!px) {
      px = atlasWersji(
        img.px,
        img.w,
        pas,
        opis.postacie.filter((q) => q.zarzad === zarzad),
        this.rampy[wersja - 1],
      );
      this.kopie.set(klucz, px);
    }
    return { px, w: img.w, h: pas[1] - pas[0] };
  }

  /** klatka pozy pv postaci w wersji kolorystycznej `wersja` (idzie: pionek w drodze, tt: jego czas w sekundach gry),
      null gdy postać nie ma tej pracy; cios i celowanie postaci bez nich zastępuje stanie */
  klatka(postac: PostacLudzi, pv: PoseView, idzie: boolean, tt: number, wersja = 0): KlatkaPionka | null {
    let an = postac.animacje[kluczAnimacji(pv.pose, idzie)];
    let pose = pv.pose;
    let frame = pv.frame;
    let w = idzie;
    let zastepcza = false;
    if (!an && (pv.pose === 'swing' || pv.pose === 'aim')) {
      // zbir albo napadnięty handlarz bije po ciosie krótko w pozie ciosu: stoi w swojej postaci, bez zmiany stylu na kod
      an = postac.animacje.stanie;
      pose = 'walk';
      frame = 0;
      w = false;
      zastepcza = true;
    }
    if (!an) return null;
    let kier = an.kierunki[pv.dir & 3];
    let flip = false;
    if (typeof kier === 'number') {
      flip = true;
      kier = an.kierunki[kier];
    }
    if (typeof kier === 'number' || !kier?.length) return null;
    const [x, y, sz, h, ax, ay] = kier[numerKlatki(pose, frame, w, tt, kier.length)];
    // postać bez ubrania do przemalowania (czarny strój w kolorze obrysu) ma jedną wersję
    const wer = postac.przemalowanie.kolory.length > 0 ? wersja : 0;
    const r = this.wynik;
    r.x = x;
    // kopie wersji mają pas wierszy od jego początku: klatki zarządu leżą w nich od pierwszego wiersza
    r.y = wer > 0 && postac.zarzad ? y - this.grafika.opis.regiony.zarzad[0] : y;
    r.w = sz;
    r.h = h;
    r.ax = ax;
    r.ay = ay;
    r.flip = flip;
    r.wersja = wer;
    r.zarzad = postac.zarzad;
    r.zastepcza = zastepcza;
    return r;
  }
}
