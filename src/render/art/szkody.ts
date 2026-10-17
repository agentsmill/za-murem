/* Ślady w pustych mieszkaniach i uszkodzenia na posadzce (M2, fala 1) jako nakładka na kolor wnętrza
   w przekroju. Przyczyna opuszczenia (AptWhy) zostawia ślad na posadzce całego mieszkania: spalenizna
   po pożarze, zacieki po zalaniu, kurz po wymarciu i wyjeździe, śmieci po splądrowaniu. Uszkodzenia
   z kafelkiem posadzki: uszkodzona podłoga (po zalaniu kałuża, po pożarze zwęglone deski, poza tym
   wyrwane deski), kałuża pod cieknącą rurą przy ścianie, okopcony piec (kafelek kuchenki: sadza pod nią
   i obwódka na posadzce obok, samą kuchenkę rysuje widok jako zepsutą). Wybite okno i wyważone drzwi
   rysuje wnetrze.ts (broken). Czyste funkcje, ten sam wynik w workerze i w oknie. */

import type { AptWhy, DamageKind } from '../../world/apts.ts';
import { h2, vnoise } from './hash.ts';
import { mix, shade } from './palette.ts';
import { type InteriorTile, NB } from './wnetrze.ts';

const SOOT = 0x1f1b18;
const ASH = 0x3a332d;
const WATER = 0x3c5563;
const WATER_HI = 0x9cbcc8;
const STAIN = 0x5a5040;
const DUST = 0xbab5a8;
const PIPE = 0x6f7479;
const RUST = 0x7a4a2e;
const LITTER = [0xd8d4c4, 0x9fb3b9, 0x8f6643, 0x6a8a52, 0xa8342c] as const;
const CHAR_GAP = 0x120f0d;
const SCORCH = 0x4a3524;
const VOID = 0x15120f;
const JOIST = 0x5c4630;
const RUBBLE = 0x6a645c;

/** odległość od środka plamy (1 = brzeg), z poszarpanym brzegiem */
function blob(dx: number, dy: number, r: number, ax: number, ay: number, s: number): number {
  return Math.hypot(dx, dy * 1.25) / r + (vnoise(ax, ay, 4, s) - 0.5) * 0.45;
}

/**
 * Kolor piksela wnętrza z nakładką: why to przyczyna opuszczenia mieszkania (ślad na posadzce),
 * dmg uszkodzenie na tym kafelku. ax, ay piksel świata, px, py piksel w kafelku, s ziarno. wet to
 * sąsiedzi z uszkodzoną podłogą, soot sąsiedzi z okopconym piecem (bity N 1, E 2, S 4, W 8):
 * uszkodzenia sąsiadów łączą się w jedno, a sadza od pieca wchodzi na posadzkę obok.
 */
export function wearColor(
  c: number,
  t: InteriorTile,
  why: AptWhy | undefined,
  dmg: DamageKind | undefined,
  ax: number,
  ay: number,
  px: number,
  py: number,
  s: number,
  wet = 0,
  soot = 0,
): number {
  if (t.kind !== 'floor') return c;
  if (soot) {
    // obok okopconej kuchenki: sadza od jej strony, rzednie po kilku pikselach
    let d = 32;
    if (soot & 1) d = Math.min(d, py);
    if (soot & 2) d = Math.min(d, 31 - px);
    if (soot & 4) d = Math.min(d, 31 - py);
    if (soot & 8) d = Math.min(d, px);
    const k = 1 - d / 9 + (vnoise(ax, ay, 3, s + 735) - 0.5) * 0.7;
    if (k > 0) c = mix(c, SOOT, Math.min(0.8, k * 0.85));
  }
  if (dmg === 'podloga') {
    // plama prawie na cały kafelek; pas do każdego uszkodzonego sąsiada, więc kilka kafelków to jedna plama
    const wob = (vnoise(ax, ay, 4, s + 734) - 0.5) * 3;
    const bridge =
      (wet & 1 && py < 16 && Math.abs(px - 15.5) < 10 + wob) ||
      (wet & 4 && py >= 16 && Math.abs(px - 15.5) < 10 + wob) ||
      (wet & 2 && px >= 16 && Math.abs(py - 15.5) < 10 + wob) ||
      (wet & 8 && px < 16 && Math.abs(py - 15.5) < 10 + wob);
    const r = why === 'zalanie' ? 14 : why === 'pozar' ? 13 : 11;
    const e = bridge ? 0.6 : blob(px - 15.5, py - 15.5, r, ax, ay, s + 731);
    if (why === 'zalanie') {
      // zalana podłoga: kałuża z odblaskami, wokół ciemne mokre deski
      if (e < 1) return (px * 2 + py) % 13 === 0 || (e < 0.35 && (px + py) % 9 === 0) ? WATER_HI : mix(c, WATER, 0.72);
      if (e < 1.35) return shade(c, 0.68);
    } else if (why === 'pozar') {
      // zwęglone deski: czarne, ze szparami między deskami, spękaniami węgla i popiołem; wokół przypalony brąz
      if (e < 1) {
        if (h2(ax >> 1, ay >> 1, s + 736) < 0.06) return ASH;
        if ((py & 7) === 0 || (e < 0.8 && (px + (py >> 3) * 5) % 11 === 0)) return CHAR_GAP;
        return mix(c, SOOT, 0.82 - 0.1 * vnoise(ax, ay, 3, s + 737));
      }
      if (e < 1.35) return mix(c, SCORCH, 0.5);
    } else {
      // wyrwane deski: dziura z legarami i gruzem w głębi, jasny złamany brzeg, cień pod nim
      if (e < 1) {
        const jy = ay % 12;
        if (jy < 3) return jy === 0 ? shade(JOIST, 1.25) : JOIST;
        return h2(ax, ay, s + 739) < 0.05 ? RUBBLE : VOID;
      }
      if (e < 1.18) return shade(c, 1.18);
      if (e < 1.32) return shade(c, 0.8);
    }
  } else if (dmg === 'rura') {
    // cieknąca rura: odcinek wychodzący ze ściany (pierwszej z N, E, W, S), kropla i kałuża przed nim;
    // u biegnie wzdłuż ściany, v w głąb pomieszczenia
    const wl = t.walls ?? NB.N;
    const side = wl & NB.N ? 0 : wl & NB.E ? 1 : wl & NB.W ? 3 : wl & NB.S ? 2 : 0;
    const u = side === 0 || side === 2 ? px : py;
    const v = side === 0 ? py : side === 1 ? 31 - px : side === 2 ? 31 - py : px;
    if (v < 7 && u >= 13 && u <= 17) {
      if (v === 3) return RUST;
      return u === 13 ? shade(PIPE, 1.2) : u === 17 ? shade(PIPE, 0.72) : PIPE;
    }
    if (u === 15 && (v === 8 || v === 10)) return WATER_HI;
    const e = blob(u - 15, v - 20, 10, ax, ay, s + 732);
    if (e < 1) return (u + v * 3) % 11 === 0 ? WATER_HI : mix(c, WATER, 0.65);
    if (e < 1.3) return shade(c, 0.7);
  } else if (dmg === 'piec') {
    // pod okopconą kuchenką: czarna plama sadzy z jasnymi rysami pękniętych kafli (spod kuchenki widać brzegi)
    const e = blob(px - 15.5, py - 15.5, 13, ax, ay, s + 733);
    if (e < 1) {
      if ((px === 12 || py === 19) && e < 0.8) return 0x9a958a;
      return mix(c, SOOT, Math.min(0.9, 0.35 + (1 - e) * 0.6));
    }
  }
  switch (why) {
    case 'pozar': {
      // spalenizna: plamy sadzy i popiół
      const n = vnoise(ax, ay, 10, s + 741);
      let k = n < 0.48 ? (0.48 - n) * 1.6 : 0;
      if (h2(ax >> 1, ay >> 1, s + 742) < 0.025) return ASH;
      k = Math.min(0.75, k + 0.08);
      return mix(c, SOOT, k);
    }
    case 'zalanie': {
      // zacieki: linia wyschniętej wody i bure plamy
      const n = vnoise(ax, ay, 18, s + 743);
      if (Math.abs(n - 0.5) < 0.018) return shade(c, 0.62);
      return n < 0.42 ? mix(c, STAIN, 0.3) : c;
    }
    case 'wymarcie':
      // kurz i stęchlizna
      return mix(c, DUST, 0.13 + 0.06 * vnoise(ax, ay, 6, s + 744));
    case 'splądrowanie': {
      // śmieci: papiery, szkło, drzazgi, rozsypane rzeczy
      if (h2(ax >> 1, ay >> 1, s + 745) < 0.035) return LITTER[Math.floor(h2(ay, ax, s + 746) * LITTER.length)];
      return mix(c, DUST, 0.05);
    }
    case 'wyjazd':
      return mix(c, DUST, 0.06);
    default:
      return c;
  }
}
