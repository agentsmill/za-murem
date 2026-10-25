/* Napisy nad zwierzętami (PixiJS): „Hau!” nad psem, który właśnie szczeka (src/sim/zwierzeta.ts, SimState.szczek). Napis
   jest w bieżącym języku (tr z NAPIS_SZCZEKU), ma stałą wielkość na ekranie (skala 1/zoom, jak znaki mgły), niknie pod
   koniec trwania i nie pokazuje się, gdy kamera jest bardzo daleko. Sam tekst PixiJS rysuje przez płótno DOM, więc w Node
   (testy, boty) warstwa nic nie tworzy. Kontrakt: `update(wpisy, zoom)` co klatkę, `destroy()` przy zamknięciu widoku. */

import { Container, Text } from 'pixi.js';

/** napis do pokazania: pionek, miejsce nad nim (piksele świata), tekst i krycie 0–1 */
export interface NapisZwierzecia {
  id: number;
  x: number;
  y: number;
  tekst: string;
  alpha: number;
}

/** poniżej tego zbliżenia napis się nie pokazuje (z daleka byłby plamą) */
const MIN_ZOOM = 0.3;
/** wielkość napisu na ekranie (px) */
const ROZMIAR = 15;

export class ZwierzetaLayer {
  readonly container = new Container();
  private teksty = new Map<number, Text>();

  update(wpisy: readonly NapisZwierzecia[], zoom: number): void {
    const widziane = new Set<number>();
    if (typeof document !== 'undefined' && zoom >= MIN_ZOOM)
      for (const w of wpisy) {
        widziane.add(w.id);
        let t = this.teksty.get(w.id);
        if (!t || t.text !== w.tekst) {
          t?.destroy();
          t = new Text({
            text: w.tekst,
            style: {
              fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
              fontSize: ROZMIAR,
              fontWeight: '700',
              fill: 0xfff4d6,
              stroke: { color: 0x14100e, width: 4 },
              align: 'center',
            },
          });
          t.anchor.set(0.5, 1);
          this.container.addChild(t);
          this.teksty.set(w.id, t);
        }
        t.scale.set(1 / zoom);
        t.position.set(Math.round(w.x), Math.round(w.y));
        t.alpha = w.alpha;
      }
    for (const [id, t] of this.teksty)
      if (!widziane.has(id)) {
        t.destroy();
        this.teksty.delete(id);
      }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.teksty.clear();
  }
}
