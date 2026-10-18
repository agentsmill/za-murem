/* Przekrój otwartych sąsiednich budynków (M2 fala 2, docs/M2-fala-2.md). Ze stanu sąsiadów (st.sasiedzi) liczy
   kawałki przekroju do dołożenia (czescPrzekroju z section.ts) i wygląd drzwi sąsiadów (wyważone, zabite deskami,
   zwykłe). Pamięta, co już dołożył i jak wyglądały drzwi, więc oddaje tylko nowości: widok woła to po każdej zmianie
   wersji sąsiadów w symulacji i przekazuje wynik do redraw (łatka sceny dla workerów). Pomieszczenia i mieszkania
   sąsiadów dostają w przekroju kolejne wolne numery po siedzibie, w kolejności otwierania, tak samo w głównym wątku
   i w każdym workerze. Wnętrza bierze z pamięci wnętrz świata (wnetrze z src/sim/sasiedzi.ts), wspólnej z symulacją.
   Czyste funkcje bez PixiJS: działa w Node. */

import { drzwiBudynku, type Sasiedzi, wnetrze } from '../sim/sasiedzi.ts';
import type { World } from '../world/world.ts';
import { czescPrzekroju, type DoorLook, type SectionPart, type SectionScene } from './section.ts';

export interface ZmianyPrzekroju {
  wnetrze: SectionPart[];
  drzwi: DoorLook[];
}

const lookOf = (s: string): DoorLook['look'] => (s === 'zabite' ? 'zabite' : s === 'wywazone' ? 'wywazone' : 'zwykle');

export class PrzekrojSasiadow {
  /** budynki już dołożone do przekroju */
  private dolozone = new Set<number>();
  /** ostatnio wysłany wygląd drzwi (bez wpisu: zwykłe) */
  private wyglad = new Map<number, DoorLook['look']>();
  /** następne wolne numery pomieszczeń i mieszkań przekroju (−1: jeszcze nie liczone) */
  private room = -1;
  private apt = -1;

  /** nowe kawałki i zmienione drzwi od ostatniego wywołania; null, gdy nic się nie zmieniło */
  zmiany(w: World, sec: SectionScene, sas: Sasiedzi | undefined): ZmianyPrzekroju | null {
    if (!sas) return null;
    if (this.room < 0) {
      this.room = sec.kinds.length;
      this.apt = (sec.roomApt ?? []).reduce((m, a) => Math.max(m, a ?? -1), -1) + 1;
    }
    const czesci: SectionPart[] = [];
    const drzwi: DoorLook[] = [];
    for (const b of sas.budynki) {
      if (!b.otwarty) continue;
      if (!this.dolozone.has(b.bid)) {
        this.dolozone.add(b.bid);
        const it = wnetrze(w, b.bid);
        const why = b.mieszkania.filter((m) => m.stan === 'puste' && m.why).map((m) => [m.apt, m.why!] as const);
        const zewn = drzwiBudynku(w, b.bid).zewn.map((d) => d.tile);
        czesci.push(czescPrzekroju(w, it, this.room, this.apt, why, b.slady, zewn));
        this.room += it.rooms.length;
        this.apt += Math.max(-1, ...it.rooms.map((r) => r.apt)) + 1;
      }
      for (const d of b.drzwi) {
        const look = lookOf(d.s);
        if ((this.wyglad.get(d.t) ?? 'zwykle') === look) continue;
        this.wyglad.set(d.t, look);
        drzwi.push({ tile: d.t, look });
      }
    }
    return czesci.length || drzwi.length ? { wnetrze: czesci, drzwi } : null;
  }
}
