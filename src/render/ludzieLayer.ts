/* Postacie z PixelLab w widoku: tekstury Pixi z atlasu ludzie.png i jego przemalowanych kopii dla klatek, które wybiera
   część bez PixiJS (ludziePixellab.ts: postać, wersja kolorystyczna, prostokąt i lustro). Warstwa trzyma źródła tekstur
   i po jednej teksturze na klatkę; pionek, któremu obsada nie ma pracy, zostaje z kodu (null). Komórki leżenia i zwłok
   (art/lezenie.ts) mają własne małe źródła, po jednym na komórkę. */

import { BufferImageSource, Rectangle, Texture, type TextureSource } from 'pixi.js';
import type { KomorkaLezenia } from './art/lezenie.ts';
import type { Lie } from './art/people.ts';
import type { LudzieGrafika, PostacLudzi } from './art/pixellab.ts';
import { LudziePixellab } from './ludziePixellab.ts';
import type { PoseView } from './poses.ts';

/** klatka do narysowania: tekstura, punkt stóp w teksturze (anchor = ax / w, ay / h; przy leżeniu środek głowy), lustro
    poziome i znacznik klatki zastępczej (poza, której postać nie ma, gra stanie, więc nakładka broni rysuje się jak przy
    kodzie) */
export interface KlatkaTekstury {
  tex: Texture;
  ax: number;
  ay: number;
  w: number;
  h: number;
  flip: boolean;
  zastepcza: boolean;
}

/** źródło tekstury z pikseli (alfa prosta, nie mnożona: wgranie ją mnoży), bez wygładzania */
function zrodloPikseli(px: Uint32Array, w: number, h: number): TextureSource {
  return new BufferImageSource({
    resource: new Uint8Array(px.buffer, px.byteOffset, px.byteLength),
    width: w,
    height: h,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    autoGarbageCollect: false,
  });
}

export class LudzieLayer {
  /** wybór postaci i klatek (bez PixiJS) */
  readonly dane: LudziePixellab;
  private readonly zrodlo: TextureSource;
  private readonly zrodlaWersji = new Map<number, TextureSource>();
  private readonly tekstury = new Map<number, Texture>();
  /** tekstury komórek leżenia, po obiekcie komórki (ludziePixellab trzyma jedną komórkę na postać, wersję, stronę i rodzaj) */
  private readonly teksturyLezenia = new Map<KomorkaLezenia, Texture>();
  /** jedna odpowiedź na wszystkie wywołania klatka(): wołający zużywa ją od razu (bez śmieci co klatkę) */
  private readonly wynik: KlatkaTekstury = {
    tex: Texture.EMPTY,
    ax: 0,
    ay: 0,
    w: 1,
    h: 1,
    flip: false,
    zastepcza: false,
  };

  constructor(grafika: LudzieGrafika) {
    this.dane = new LudziePixellab(grafika);
    this.zrodlo = zrodloPikseli(grafika.img.px, grafika.img.w, grafika.img.h);
  }

  /** klatka pozy pv postaci w wersji kolorystycznej `wersja`, null gdy postać nie ma tej pracy */
  klatka(postac: PostacLudzi, pv: PoseView, idzie: boolean, tt: number, wersja = 0): KlatkaTekstury | null {
    const k = this.dane.klatka(postac, pv, idzie, tt, wersja);
    if (!k) return null;
    // x i y mieszczą się w 4096, wersja i pas zarządu w górnych bitach
    const klucz = ((k.wersja * 2 + (k.zarzad ? 1 : 0)) * 4096 + k.y) * 4096 + k.x;
    let tex = this.tekstury.get(klucz);
    if (!tex) {
      tex = new Texture({
        source: k.wersja > 0 ? this.zrodloWersji(k.zarzad, k.wersja) : this.zrodlo,
        frame: new Rectangle(k.x, k.y, k.w, k.h),
      });
      this.tekstury.set(klucz, tex);
    }
    const r = this.wynik;
    r.tex = tex;
    r.ax = k.ax;
    r.ay = k.ay;
    r.w = k.w;
    r.h = k.h;
    r.flip = k.flip;
    r.zastepcza = k.zastepcza;
    return r;
  }

  /** komórka leżenia postaci (strona głowy o, rodzaj: łóżko albo podłoga) w wersji kolorystycznej `wersja`: kotwica to
      środek głowy; null, gdy postać nie ma klatki stania przodem (leżenie rysuje wtedy kod) */
  lezenie(postac: PostacLudzi, wersja: number, o: number, rodzaj: Lie): KlatkaTekstury | null {
    const k = this.dane.lezenie(postac, wersja, o, rodzaj);
    if (!k) return null;
    let tex = this.teksturyLezenia.get(k);
    if (!tex) {
      tex = new Texture({ source: zrodloPikseli(k.px, k.w, k.h) });
      this.teksturyLezenia.set(k, tex);
    }
    const r = this.wynik;
    r.tex = tex;
    r.ax = k.hx;
    r.ay = k.hy;
    r.w = k.w;
    r.h = k.h;
    r.flip = false;
    r.zastepcza = false;
    return r;
  }

  /** źródło tekstury przemalowanej kopii pasa mieszkańców albo zarządu, zrobione przy pierwszym użyciu */
  private zrodloWersji(zarzad: boolean, wersja: number): TextureSource {
    const klucz = wersja * 2 + (zarzad ? 1 : 0);
    let z = this.zrodlaWersji.get(klucz);
    if (!z) {
      const { px, w, h } = this.dane.pikseleWersji(zarzad, wersja);
      z = zrodloPikseli(px, w, h);
      this.zrodlaWersji.set(klucz, z);
    }
    return z;
  }

  /** wszystkie wybory postaci od nowa (zrzuty zmieniają osoby po pierwszej klatce) */
  zapomnijWszystko(): void {
    this.dane.zapomnijWszystko();
  }

  destroy(): void {
    for (const t of this.tekstury.values()) t.destroy(false);
    this.tekstury.clear();
    for (const t of this.teksturyLezenia.values()) t.destroy(true);
    this.teksturyLezenia.clear();
    for (const z of this.zrodlaWersji.values()) z.destroy();
    this.zrodlaWersji.clear();
    this.zrodlo.destroy();
  }
}
