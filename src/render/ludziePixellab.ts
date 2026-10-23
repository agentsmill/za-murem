/* Postacie z PixelLab w grze, część bez PixiJS (testy w Node): która postać z obsady gra dany pionek (płeć i wiek
   osoby z gry), w jakiej wersji kolorystycznej (ubranie przemalowane na rampę palety, z jednej postaci robi to kilka
   osób), który prostokąt atlasu ludzie.png rysuje daną pozę i czy klatka jest odbita. Pionek, któremu obsada nie ma
   postaci albo pracy, zostaje z kodu (null). Tekstury z tych prostokątów robi warstwa (ludzieLayer.ts). Wybór
   postaci, numer klatki i przemalowanie to czyste funkcje (art/pixellab.ts, art/animacjePozy.ts), tu jest ich
   zestawienie z pamięcią podręczną. Leżenie i zwłoki (komórki z klatki stania przodem, art/lezenie.ts) mają tu własny
   wybór postaci i pamięć komórek. Przejścia między staniem a leżeniem (upadek przy śmierci, kładzenie się, wstawanie:
   art/animacjePozy.ts, PRZEJSCIA) wybierają klatkę z czasu od startu przejścia; start i kierunek zna widok
   (przejscia.ts), a ostatnia klatka upadku to leżenie zwłok. Pies i kot nie dostają tu postaci (null): mają własny atlas
   rysowany kodem (art/zwierzeta.ts). */

import { jestZwierzeciem } from '../sim/zwierzeta.ts';
import {
  kluczAnimacji,
  numerKlatki,
  numerKlatkiPrzejscia,
  PRZEJSCIA,
  type RodzajPrzejscia,
} from './art/animacjePozy.ts';
import { type KomorkaLezenia, komorkaLezenia, wytnij } from './art/lezenie.ts';
import type { Lie } from './art/people.ts';
import {
  atlasWersji,
  type KierunkiLudzi,
  type KlatkaLudzi,
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
  /** komórki leżenia (klucz: postać, wersja, strona głowy, rodzaj), robione przy pierwszym użyciu; null: postać nie ma
      klatki stania przodem */
  private readonly komorki = new Map<string, KomorkaLezenia | null>();
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

  /** postać osoby z gry (zarząd albo mieszkaniec), z jej płci i wieku: ta sama, którą gra pionek z tą osobą. null poza
      listą osób albo bez postaci tej grupy w obsadzie. Przydaje się bez pionka (zwłoki członka zarządu). */
  postacOsoby(person: number, osoby: readonly OsobaLudzi[], zarzad: boolean): PostacLudzi | null {
    const osoba = osoby[person];
    if (!osoba || !(zarzad ? this.zarzad : this.mieszkancy)) return null;
    return postacDlaOsoby(this.pula, { f: osoba.f, age: osoba.age, zarzad }, skrot(person));
  }

  /** postać pionka: zarząd z czterech postaci zarządu, reszta z mieszkańców, po płci i wieku osoby; pionek bez osoby
      (przybysz, tłum) po numerze wyglądu z gry, tylko dorosły. Wybór zostaje na stałe, dopóki pionek jest w grze. */
  postacPionka(p: PionekLudzi, osoby: readonly OsobaLudzi[]): PostacLudzi | null {
    // pies i kot mają własny atlas (art/zwierzeta.ts): pionek bez osoby dostałby tu człowieka z wyglądu
    if (jestZwierzeciem(p.kind)) return null;
    const znana = this.postacie.get(p.id);
    if (znana !== undefined) return znana;
    const zarzad = p.kind === 'core';
    let postac = this.postacOsoby(p.person, osoby, zarzad);
    if (!postac && !zarzad && this.mieszkancy && !osoby[p.person]) postac = postacDlaWygladu(this.pula, p.look);
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
    const kier = this.klatkiKierunku(an.kierunki, pv.dir);
    if (!kier) return null;
    return this.prostokat(
      postac,
      kier.klatki[numerKlatki(pose, frame, w, tt, kier.klatki.length)],
      kier.flip,
      wersja,
      zastepcza,
    );
  }

  /** klatki animacji w danym kierunku pionka i czy idą odbite poziomo (w opisie numer kierunku zamiast klatek); null, gdy
      kierunek nie ma klatek */
  private klatkiKierunku(kierunki: KierunkiLudzi, dir: number): { klatki: KlatkaLudzi[]; flip: boolean } | null {
    let kier = kierunki[dir & 3];
    let flip = false;
    if (typeof kier === 'number') {
      flip = true;
      kier = kierunki[kier];
    }
    if (typeof kier === 'number' || !kier?.length) return null;
    return { klatki: kier, flip };
  }

  /** klatka z opisu jako prostokąt do narysowania w wersji kolorystycznej `wersja` (jedna współdzielona odpowiedź) */
  private prostokat(
    postac: PostacLudzi,
    kl: KlatkaLudzi,
    flip: boolean,
    wersja: number,
    zastepcza: boolean,
  ): KlatkaPionka {
    const [x, y, sz, h, ax, ay] = kl;
    const wer = this.wersjaPostaci(postac, wersja);
    const r = this.wynik;
    r.x = x;
    r.y = this.yKlatki(postac, wer, y);
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

  /** czy postać ma animację tego przejścia (upadek, wstawanie, kładzenie się); bez niej przejścia nie ma, a leżenie i
      zwłoki rysuje komórka leżenia z klatki stania albo kod */
  maPrzejscie(postac: PostacLudzi, rodzaj: RodzajPrzejscia): boolean {
    return !!postac.animacje[PRZEJSCIA[rodzaj].klucz];
  }

  /** ile klatek ma animacja przejścia (0, gdy postać jej nie ma): wszystkie kierunki mają tyle samo, więc liczy się z
      zachodu; z czasem trwania (czasPrzejscia) to postęp przejścia */
  klatekPrzejscia(postac: PostacLudzi, rodzaj: RodzajPrzejscia): number {
    const an = postac.animacje[PRZEJSCIA[rodzaj].klucz];
    return (an && this.klatkiKierunku(an.kierunki, 2)?.klatki.length) || 0;
  }

  /**
   * Klatka przejścia po `czas` sekundach od jego startu, w kierunku dir (0 południe, 1 północ, 2 zachód, 3 wschód:
   * klatki odbite, gdy kierunek ma w opisie tylko odbicie zachodu) i wersji kolorystycznej `wersja`. null, gdy postać nie
   * ma tej animacji albo przejście już się skończyło. Wynik jest współdzielony jak w klatka().
   */
  przejscie(postac: PostacLudzi, rodzaj: RodzajPrzejscia, dir: number, czas: number, wersja = 0): KlatkaPionka | null {
    const an = postac.animacje[PRZEJSCIA[rodzaj].klucz];
    if (!an) return null;
    const kier = this.klatkiKierunku(an.kierunki, dir);
    if (!kier) return null;
    const i = numerKlatkiPrzejscia(rodzaj, czas, kier.klatki.length);
    return i === null ? null : this.prostokat(postac, kier.klatki[i], kier.flip, wersja, false);
  }

  /** ostatnia klatka upadku w kierunku dir: tak leżą zwłoki (kończy ją upadek, który zaczyna ta sama klatka); null, gdy
      postać nie ma upadku. Wynik jest współdzielony jak w klatka(). */
  klatkaZwlok(postac: PostacLudzi, dir: number, wersja = 0): KlatkaPionka | null {
    const an = postac.animacje[PRZEJSCIA.smierc.klucz];
    const kier = an && this.klatkiKierunku(an.kierunki, dir);
    return kier ? this.prostokat(postac, kier.klatki[kier.klatki.length - 1], kier.flip, wersja, false) : null;
  }

  /** wersja, w której postać naprawdę jest rysowana: postać bez ubrania do przemalowania (czarny strój w kolorze obrysu)
      ma jedną wersję */
  private wersjaPostaci(postac: PostacLudzi, wersja: number): number {
    return postac.przemalowanie.kolory.length > 0 ? wersja : 0;
  }

  /** współrzędna y klatki w obrazie wersji: kopie wersji mają pas wierszy od jego początku, więc klatki zarządu leżą w
      nich od pierwszego wiersza */
  private yKlatki(postac: PostacLudzi, wer: number, y: number): number {
    return wer > 0 && postac.zarzad ? y - this.grafika.opis.regiony.zarzad[0] : y;
  }

  /** postać zwłok: rzecz `zwloki` zna tylko wygląd z gry, więc jak pionek bez osoby: dorosły mieszkaniec po wyglądzie;
      obsada bez mieszkańców daje null (zwłoki rysuje kod) */
  postacZwlok(look: number): PostacLudzi | null {
    return this.mieszkancy ? postacDlaWygladu(this.pula, look) : null;
  }

  /**
   * Komórka leżenia postaci w wersji kolorystycznej `wersja` (strona głowy o, rodzaj: łóżko albo podłoga), z klatki
   * stania przodem (kierunek 0, klatka 0), więc bez własnych generacji. Na podłodze postać leży zawsze poziomo (o 0 i 2
   * schodzą na 1 i 3): sylwetka przodem głową do góry wyglądałaby jak stojąca, w łóżku ten sam widok czyni czytelnym
   * koc. null, gdy postać nie ma klatki stania przodem (leżenie rysuje wtedy kod). Ta sama komórka za każdym razem jest
   * tym samym obiektem.
   */
  lezenie(postac: PostacLudzi, wersja: number, o: number, rodzaj: Lie): KomorkaLezenia | null {
    const wer = this.wersjaPostaci(postac, wersja);
    const strona = rodzaj === 'floor' && !(o & 1) ? (o & 3) + 1 : o & 3;
    const klucz = `${postac.id}|${wer}|${strona}|${rodzaj}`;
    let k = this.komorki.get(klucz);
    if (k === undefined) {
      const kier = postac.animacje.stanie?.kierunki[0];
      const klatka = Array.isArray(kier) ? kier[0] : undefined;
      if (klatka) {
        const [x, y, w, h, ax] = klatka;
        const zrodlo = wer > 0 ? this.pikseleWersji(postac.zarzad, wer) : this.grafika.img;
        k = komorkaLezenia(wytnij(zrodlo, x, this.yKlatki(postac, wer, y), w, h), ax, rodzaj, strona);
      } else k = null;
      this.komorki.set(klucz, k);
    }
    return k;
  }
}
