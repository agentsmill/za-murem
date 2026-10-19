/* Mgła nad nieodkrytymi kwadratami (projekt miasta z kwadratów, „Jak to wygląda dla gracza”): ciemne prostokąty nad
   kwadratami sąsiadującymi z odkrytymi, z wyraźną krawędzią od strony odkrytego terenu, ukośnym szrafem i znakiem zapytania
   w środku. Kwadrat, o który poproszono (?kwadraty=), a którego danych nie ma (prawdziwy adres, brzeg danych dema), ma pod
   znakiem napis „brak danych”. Znaki mają stałą wielkość na ekranie: skala 1 / zoom co klatkę. Wszystko leży w układzie
   miasta w pikselach grafiki (kwadrat (sx, sy) zaczyna się w (sx·bok, sy·bok)). Warstwa jest statyczna: geometria
   przelicza się tylko przy zmianie zbioru kwadratów (`ustaw`), a nad mapą rysuje się przed nocą, więc noc ją ściemnia.
   Atrybucja map jest w DOM (index.html) i stoi nad całą grą, także nad mgłą. polaMgly jest czysta (bez PixiJS). */

import { Container, Graphics, Text } from 'pixi.js';
import { L } from '../core/jezyk.ts';
import { TILE } from './art/scene.ts';

/** kwadrat pod mgłą: położenie w kwadratach od domu i czy poproszono o niego bez danych */
export interface PoleMgly {
  sx: number;
  sy: number;
  brakDanych: boolean;
}

/** klucz kwadratu „sx,sy” (jak kluczKwadratu w src/world/kwadraty.ts, tu bez importu świata) */
const klucz = (sx: number, sy: number) => `${sx},${sy}`;

/**
 * Kwadraty pod mgłą: każdy sąsiad (osiem kierunków) odkrytego albo wymienionego kwadratu, który sam nie jest odkryty,
 * oraz wszystkie wymienione bez danych (z napisem). Kolejność stała: wierszami od północy. odkryte to klucze kwadratów
 * z danymi (z domem), brak to klucze kwadratów, o które poproszono, a danych nie ma.
 */
export function polaMgly(odkryte: ReadonlySet<string>, brak: ReadonlySet<string>): PoleMgly[] {
  const out = new Map<string, PoleMgly>();
  const dodaj = (sx: number, sy: number, brakDanych: boolean) => {
    const k = klucz(sx, sy);
    if (odkryte.has(k)) return;
    const stare = out.get(k);
    if (!stare || brakDanych) out.set(k, { sx, sy, brakDanych: brakDanych || !!stare?.brakDanych });
  };
  for (const k of [...odkryte, ...brak]) {
    const [sx, sy] = k.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) dodaj(sx + dx, sy + dy, false);
  }
  for (const k of brak) {
    const [sx, sy] = k.split(',').map(Number);
    dodaj(sx, sy, true);
  }
  return [...out.values()].sort((a, b) => a.sy - b.sy || a.sx - b.sx);
}

/** kolory z palety interfejsu (src/style.css): płyta, szew, linia, tusz przygaszony; mgła jaśniejsza od tła gry (#16181a),
    żeby nieodkryty kwadrat było widać jako kwadrat */
const KOLOR = { mgla: 0x20262a, szraf: 0x343c42, krawedz: 0x4a5258, obrys: 0x2b3236, znak: 0xa3a7a2, cien: 0x14171a };
/** największa część boku kwadratu na ekranie, jaką zajmuje znak zapytania i napis */
const UDZIAL_ZNAKU = 0.34;
const UDZIAL_NAPISU = 0.8;

/** znak zapytania albo napis na kwadracie: tekst, jego szerokość przy skali 1, największy udział boku kwadratu na ekranie
    i przesunięcie w pionie od środka kwadratu w pikselach ekranu */
interface Znak {
  tekst: Text;
  szer: number;
  udzial: number;
  dy: number;
  srodekY: number;
}

export class MglaLayer {
  readonly container = new Container();
  private readonly tlo = new Graphics();
  private znaki: Znak[] = [];
  private pola: PoleMgly[] = [];
  private zoom = 0;
  /** bok kwadratu w pikselach grafiki (z ostatniego ustaw) */
  private bokPx = 0;

  constructor() {
    this.container.addChild(this.tlo);
  }

  /** ile kwadratów jest pod mgłą (do testów) */
  get liczba(): number {
    return this.pola.length;
  }

  /** kwadraty pod mgłą w tej chwili */
  get kwadraty(): readonly PoleMgly[] {
    return this.pola;
  }

  /** Przelicza mgłę dla zbioru kwadratów; bok to bok kwadratu w kafelkach (384). */
  ustaw(odkryte: ReadonlySet<string>, brak: ReadonlySet<string>, bok: number): void {
    this.pola = polaMgly(odkryte, brak);
    const px = bok * TILE;
    this.bokPx = px;
    const g = this.tlo;
    g.clear();
    for (const p of this.pola) {
      const x = p.sx * px;
      const y = p.sy * px;
      g.rect(x, y, px, px).fill({ color: KOLOR.mgla, alpha: 0.97 });
      g.rect(x, y, px, px).stroke({ width: 14, color: KOLOR.obrys, alpha: 0.9 });
      // ukośny szraf co 8 m: kreski w poprzek kwadratu, wycięte do jego prostokąta
      const krok = 8 * TILE * 2;
      for (let c = krok; c < 2 * px; c += krok) {
        const od = c <= px ? [x, y + c] : [x + c - px, y + px];
        const doo = c <= px ? [x + c, y] : [x + px, y + c - px];
        g.moveTo(od[0], od[1]).lineTo(doo[0], doo[1]);
      }
      g.stroke({ width: 14, color: KOLOR.szraf, alpha: 0.8 });
      // krawędź od strony odkrytego terenu: wyraźna linia i trzy pasy miękko gasnące w głąb mgły
      const stoi = (dx: number, dy: number) => odkryte.has(klucz(p.sx + dx, p.sy + dy));
      const pasy = [
        { w: 12 * TILE, a: 0.5 },
        { w: 8 * TILE, a: 0.3 },
        { w: 4 * TILE, a: 0.2 },
      ];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        if (!stoi(dx, dy)) continue;
        for (const { w, a } of pasy) {
          const rx = dx === 0 ? x : dx > 0 ? x + px - w : x;
          const ry = dy === 0 ? y : dy > 0 ? y + px - w : y;
          g.rect(rx, ry, dx === 0 ? px : w, dy === 0 ? px : w).fill({ color: KOLOR.cien, alpha: a });
        }
        const lx = dx === 0 ? x : dx > 0 ? x + px : x;
        const ly = dy === 0 ? y : dy > 0 ? y + px : y;
        g.moveTo(lx, ly)
          .lineTo(dx === 0 ? lx + px : lx, dy === 0 ? ly + px : ly)
          .stroke({ width: 18, color: KOLOR.krawedz, alpha: 0.95 });
      }
    }
    this.napisy(px);
  }

  /** znaki zapytania i napisy: tylko w przeglądarce (PixiJS rysuje tekst przez płótno DOM) */
  private napisy(px: number): void {
    for (const z of this.znaki) z.tekst.destroy();
    this.znaki = [];
    if (typeof document === 'undefined') return;
    const font = '"Barlow Condensed", "Arial Narrow", sans-serif';
    for (const p of this.pola) {
      const srodekX = p.sx * px + px / 2;
      const srodekY = p.sy * px + px / 2;
      const dodaj = (text: string, fontSize: number, udzial: number, dy: number, alpha: number) => {
        const tekst = new Text({
          text,
          style: { fontFamily: font, fontSize, fontWeight: '700', fill: KOLOR.znak, align: 'center' },
        });
        tekst.anchor.set(0.5);
        tekst.position.set(srodekX, srodekY);
        tekst.alpha = alpha;
        this.container.addChild(tekst);
        this.znaki.push({ tekst, szer: tekst.width, udzial, dy, srodekY });
      };
      // znak zapytania nad napisem, gdy kwadrat jest „bez danych”, inaczej na środku
      dodaj('?', 64, UDZIAL_ZNAKU, p.brakDanych ? -26 : 0, p.brakDanych ? 0.9 : 0.7);
      if (p.brakDanych) dodaj(L('brak danych', 'no data'), 22, UDZIAL_NAPISU, 30, 0.9);
    }
    this.zoom = 0;
  }

  /** co klatkę: znaki mają stałą wielkość na ekranie, ale nie większą niż ich część boku kwadratu */
  update(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    for (const z of this.znaki) {
      // skala w pikselach grafiki: 1/zoom daje wielkość z ekranu, ale tekst nie może zająć więcej niż udział boku kwadratu
      const skala = Math.min(1 / zoom, (this.bokPx * z.udzial) / z.szer);
      z.tekst.scale.set(skala);
      z.tekst.position.y = z.srodekY + z.dy * skala;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
