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

/** kolory z palety interfejsu (src/style.css): płyta, szew, linia, tusz przygaszony */
const KOLOR = { mgla: 0x1b1f22, szraf: 0x2c3236, krawedz: 0x454c51, znak: 0xa3a7a2, cien: 0x101214 };

export class MglaLayer {
  readonly container = new Container();
  private readonly tlo = new Graphics();
  private znaki: Text[] = [];
  private pola: PoleMgly[] = [];
  private zoom = 0;

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
    const g = this.tlo;
    g.clear();
    for (const p of this.pola) {
      const x = p.sx * px;
      const y = p.sy * px;
      g.rect(x, y, px, px).fill({ color: KOLOR.mgla, alpha: 0.96 });
      // ukośny szraf co 8 m: kreski w poprzek kwadratu, wycięte do jego prostokąta
      const krok = 8 * TILE * 2;
      for (let c = krok; c < 2 * px; c += krok) {
        const od = c <= px ? [x, y + c] : [x + c - px, y + px];
        const doo = c <= px ? [x + c, y] : [x + px, y + c - px];
        g.moveTo(od[0], od[1]).lineTo(doo[0], doo[1]);
      }
      g.stroke({ width: 10, color: KOLOR.szraf, alpha: 0.55 });
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
    for (const t of this.znaki) t.destroy();
    this.znaki = [];
    if (typeof document === 'undefined') return;
    for (const p of this.pola) {
      const znak = new Text({
        text: p.brakDanych ? `?\n${L('brak danych', 'no data')}` : '?',
        style: {
          fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
          fontSize: 64,
          fontWeight: '700',
          fill: KOLOR.znak,
          align: 'center',
          lineHeight: 70,
        },
      });
      znak.anchor.set(0.5);
      znak.position.set(p.sx * px + px / 2, p.sy * px + px / 2);
      znak.alpha = p.brakDanych ? 0.9 : 0.7;
      this.container.addChild(znak);
      this.znaki.push(znak);
    }
    this.zoom = 0;
  }

  /** co klatkę: znaki mają stałą wielkość na ekranie */
  update(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    for (const t of this.znaki) t.scale.set(1 / zoom);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
