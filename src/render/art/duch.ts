/* Rysunek planu (duch) ze sprite'a rysowanego kodem: każdy kryjący piksel w błękicie, ciemny ciemniejszym odcieniem,
   jasny prawie białym, a półprzezroczysty cień znika. Odcień w PixiJS tylko przyciemnia, więc ciemna rzecz (siatka
   widziana z boku) zostałaby ciemna i udawała gotową; rysunek planu jest jasny zawsze. Czysta funkcja bez DOM, nowy
   sprite (oryginał bez zmian); pierwszy użytkownik: duch planu wspólnego płotu (plotLayer.ts). */

import type { Sprite } from './bryly.ts';
import { mix, rgba } from './palette.ts';

/** ciemne i jasne miejsca rysunku planu */
const CIEMNY = 0x5f93e6;
const JASNY = 0xdcecff;
/** słabiej kryjące piksele (cień) nie wchodzą do rysunku */
const KRYJE = 0xc0;

export function duchSprite(sp: Sprite): Sprite {
  const px = new Uint32Array(sp.px.length);
  for (let i = 0; i < px.length; i++) {
    const c = sp.px[i];
    if (c >>> 24 < KRYJE) continue;
    const l = (0.299 * (c & 0xff) + 0.587 * ((c >>> 8) & 0xff) + 0.114 * ((c >>> 16) & 0xff)) / 255;
    px[i] = rgba(mix(CIEMNY, JASNY, l));
  }
  return { ...sp, px };
}
