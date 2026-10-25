/* Mgła wokół domu w grze z osadą (`GameView.ustawMgleDomu`, src/render/view.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 5): dopóki ich kwadrat nie jest odkryty, ośmiu sąsiadów domu leży pod mgłą „?”, więc nie widać, który kryje osadę;
   kamera dalej mieści sam dom, a kliknięcie w mgłę jest ignorowane jak kliknięcie poza domem przy kwadratach z `?kwadraty=`. Po
   odkryciu (`dodajKwadrat`) mgła liczy się już z kwadratów, a bez flagi widok jest taki jak dawniej (bez mgły, kliknięcie poza
   mapą trafia w brzeg). Widok bez przeglądarki jak w kwadraty-widok.test.ts; wygląd mgły sprawdzają zrzuty `osada-mgla` i
   `osada-widok`. */

import type { Application } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { GameView } from '../../src/render/view.ts';
import { malaScena } from './kwadraty-pomoc.ts';

const MALY = 64;

function widok(w = 1440, h = 900): GameView {
  const v = new GameView();
  v.app = { screen: { width: w, height: h } } as unknown as Application;
  return v;
}

/** klucze kwadratów pod mgłą, wierszami od północy */
const mgla = (v: GameView): string[] => v.mgla.kwadraty.map((p) => `${p.sx},${p.sy}`);

describe('GameView.ustawMgleDomu: mgła wokół samego domu', () => {
  it('bez flagi widok jest taki jak dawniej: bez mgły, kliknięcie poza mapą trafia w brzeg', () => {
    const v = widok();
    v.setScene(malaScena(1, MALY));
    expect(v.maKwadraty).toBe(false);
    expect(v.mgla.liczba).toBe(0);
    Object.assign(v.cam, { x: 0, y: 0, zoom: 1 });
    expect(v.tileAt(-300, -300)).toBe(0);
  });

  it('włączona: ośmiu sąsiadów domu pod mgłą bez „braku danych”, żadnego kwadratu obok', () => {
    const v = widok();
    v.setScene(malaScena(1, MALY));
    v.ustawMgleDomu(true);
    expect(mgla(v)).toEqual(['-1,-1', '0,-1', '1,-1', '-1,0', '1,0', '-1,1', '0,1', '1,1']);
    expect(v.mgla.kwadraty.some((p) => p.brakDanych)).toBe(false);
    expect(v.kwadratyObok()).toEqual([]);
    expect(v.maKwadraty).toBe(true);
  });

  it('kliknięcie poza domem (w mgłę) nie trafia w żaden kafelek, a w domu trafia', () => {
    const v = widok();
    v.setScene(malaScena(1, MALY));
    v.ustawMgleDomu(true);
    Object.assign(v.cam, { x: 0, y: 0, zoom: 1 });
    // środek ekranu to róg domu (0, 0): na lewo i w górę jest mgła, w prawo i w dół dom
    expect(v.tileAt(720 - 300, 450 - 300)).toBe(-1);
    expect(v.tileAt(720 - 300, 450 + 100)).toBe(-1);
    expect(v.tileAt(720 + 100, 450 + 100)).toBeGreaterThanOrEqual(0);
  });

  it('kamera mieści sam dom: zakres i najmniejsze przybliżenie takie same jak bez mgły', () => {
    const bez = widok();
    bez.setScene(malaScena(1, MALY));
    const z = widok();
    z.setScene(malaScena(1, MALY));
    z.ustawMgleDomu(true);
    expect(z.minZoom).toBe(bez.minZoom);
    expect(z.srodek).toEqual(bez.srodek);
  });

  it('wyłączona wraca do widoku bez mgły; włączanie dwa razy nic nie psuje', () => {
    const v = widok();
    v.setScene(malaScena(1, MALY));
    v.ustawMgleDomu(true);
    v.ustawMgleDomu(true);
    expect(v.mgla.liczba).toBe(8);
    v.ustawMgleDomu(false);
    expect(v.mgla.liczba).toBe(0);
    expect(v.maKwadraty).toBe(false);
  });

  it('nowa scena zaczyna bez mgły (mgła należy do gry, nie do widoku)', () => {
    const v = widok();
    v.setScene(malaScena(1, MALY));
    v.ustawMgleDomu(true);
    v.setScene(malaScena(2, MALY));
    expect(v.mgla.liczba).toBe(0);
    expect(v.maKwadraty).toBe(false);
  });

  it('po odkryciu osady (dodajKwadrat) mgła liczy się z odkrytych kwadratów: dom i osada, bez ich wspólnych sąsiadów', () => {
    const v = widok();
    v.setScene(malaScena(1, MALY));
    v.ustawMgleDomu(true);
    v.dodajKwadrat(-1, 0, malaScena(2, MALY));
    // prostokąt 3 × 4 (kolumny −2…1, wiersze −1…1) bez domu i osady
    expect(v.mgla.liczba).toBe(10);
    expect(mgla(v)).not.toContain('0,0');
    expect(mgla(v)).not.toContain('-1,0');
    // zakres kamery obejmuje już oba kwadraty, a mgła nie zależy od flagi domu
    v.ustawMgleDomu(false);
    expect(v.mgla.liczba).toBe(10);
    expect(v.maKwadraty).toBe(true);
    expect(v.kwadratyObok()).toEqual([{ q: 1, sx: -1, sy: 0 }]);
  });
});
