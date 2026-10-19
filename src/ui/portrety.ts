/* Portrety osób na liście ludzi w przeglądarce: obrazy `data:` z tej samej klatki sprite'a, którą rysuje mapa (postać
   z PixelLab w tej wersji kolorystycznej, w której gra pionek, a bez grafiki z PixelLab wygląd rysowany kodem). Piksele
   wycina czysta część z portret.ts, tu jest tylko wybór źródła, pamięć podręczna i zamiana na obraz na płótnie. */

import { frameRect, LOOKS, makePeopleAtlas } from '../render/art/people.ts';
import type { Obraz } from '../render/art/pixellab.ts';
import type { LudziePixellab, OsobaLudzi, PionekLudzi } from '../render/ludziePixellab.ts';
import { BOK_PORTRETU, portretPikseli, portretPixellab } from './portret.ts';

export interface ZrodloPortretow {
  /** postacie z PixelLab z widoku mapy i ich atlas; null, gdy gra rysuje ludzi kodem */
  ludzie: () => { dane: LudziePixellab; img: Obraz } | null;
  /** pionek (z numerem wyglądu rysowanego kodem) albo undefined, gdy go już nie ma */
  pionek: (pawn: number) => (PionekLudzi & { look: number }) | undefined;
  /** osoby gry (`st.people`) */
  osoby: () => readonly OsobaLudzi[];
}

/** piksele (Uint32Array 0xAABBGGRR, bok × bok) jako adres `data:` obrazu PNG */
function naAdres(px: Uint32Array, bok: number): string {
  const c = document.createElement('canvas');
  c.width = bok;
  c.height = bok;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer), bok, bok), 0, 0);
  return c.toDataURL();
}

export class Portrety {
  private readonly zrodlo: ZrodloPortretow;
  private readonly pamiec = new Map<string, string>();
  /** atlas wyglądów rysowanych kodem, zrobiony dopiero przy pierwszym pionku bez postaci z PixelLab */
  private kod: HTMLCanvasElement | null = null;

  constructor(zrodlo: ZrodloPortretow) {
    this.zrodlo = zrodlo;
  }

  /** adres obrazu portretu pionka; pusty napis, gdy pionka nie ma. Gotowe obrazy są w pamięci po postaci i wersji, więc
      wołanie co 200 ms dla kilkunastu osób nic nie kosztuje. */
  url(pawn: number): string {
    const p = this.zrodlo.pionek(pawn);
    if (!p) return '';
    const pl = this.zrodlo.ludzie();
    const r = pl ? portretPixellab(pl.dane, pl.img, p, this.zrodlo.osoby()) : null;
    const klucz = r ? `pl|${r.klucz}` : `kod|${p.look % LOOKS}`;
    let url = this.pamiec.get(klucz);
    if (url === undefined) {
      const px = r ? r.px : this.zKodu(p.look % LOOKS);
      url = px ? naAdres(px, BOK_PORTRETU) : '';
      this.pamiec.set(klucz, url);
    }
    return url;
  }

  /** zapomina gotowe obrazy (nowa gra, inna grafika) */
  reset(): void {
    this.pamiec.clear();
  }

  /** portret wyglądu rysowanego kodem: stanie przodem z atlasu ludzi */
  private zKodu(look: number): Uint32Array | null {
    this.kod ??= makePeopleAtlas();
    const [x, y, w, h] = frameRect(look, 'walk', 0, 0);
    const d = this.kod.getContext('2d')?.getImageData(x, y, w, h);
    return d ? portretPikseli(new Uint32Array(d.data.buffer as ArrayBuffer), w, [0, 0, w, h], false) : null;
  }
}
