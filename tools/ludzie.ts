/* Czyste funkcje do składania atlasu animacji postaci z paczek PixelLab (tools/atlasy.ts): przycinanie klatki do
   sylwetki, kotwica stóp animacji, wybór klatek i kierunków. Kierunki pionka w grze to 0 południe, 1 północ,
   2 zachód, 3 wschód; paczka PixelLab ma je pod nazwami south, north, west, east. */

/** obraz RGBA (4 bajty na piksel) */
export interface Plansza {
  w: number;
  h: number;
  rgba: Uint8Array;
}

/** klatka przycięta do widocznych pikseli: (x, y) to jej lewy górny róg w klatce źródłowej */
export interface Przycieta extends Plansza {
  x: number;
  y: number;
}

/** nazwy kierunków PixelLab w kolejności kierunków pionka */
export const KIERUNKI_PL = ['south', 'north', 'west', 'east'] as const;

/** najmniejszy prostokąt widocznych pikseli (alfa większa od 0); pusta klatka daje 0×0 */
export function przytnij(k: Plansza): Przycieta {
  let x0 = k.w;
  let y0 = k.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < k.h; y++)
    for (let x = 0; x < k.w; x++)
      if (k.rgba[(y * k.w + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0, rgba: new Uint8Array(0) };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(k.rgba.subarray(((y0 + y) * k.w + x0) * 4, ((y0 + y) * k.w + x0 + w) * 4), y * w * 4);
  return { x: x0, y: y0, w, h, rgba };
}

/**
 * Stopy statycznej postaci względem środka płótna: wiersz pod jej najniższym widocznym pikselem minus połowa
 * wysokości. PixelLab stawia postać na środku płótna każdej animacji (48 px szablonu, 64 albo 68 px animacji z opisu,
 * każdy kierunek może mieć inne), więc w każdym płótnie jej stopy leżą tyle samo pod środkiem.
 */
export function stopyWzgledne(stat: Plansza): number {
  for (let y = stat.h - 1; y >= 0; y--)
    for (let x = 0; x < stat.w; x++) if (stat.rgba[(y * stat.w + x) * 4 + 3]) return y + 1 - (stat.h >> 1);
  return stat.h - (stat.h >> 1);
}

/**
 * Kotwica klatki: wiersz stóp w klatce przyciętej od wiersza y płótna o wysokości plotnoH. Domyślnie stopy statycznej
 * postaci (rel) przeniesione na środek tego płótna, więc rekwizyt wystający pod stopy (siekiera w ziemi, garnek,
 * gwóźdź) nie podnosi postaci. Tryb 'dol' (klęczenie: stopy się podnoszą, gdy postać przykuca) kładzie najniższy piksel
 * klatki w kotwicy: kotwica to wtedy wysokość przyciętej klatki.
 */
export function kotwicaKlatki(
  rel: number,
  plotnoH: number,
  y: number,
  tryb: 'srodek' | 'dol' = 'srodek',
  wysokoscKlatki = 0,
): number {
  return tryb === 'dol' ? wysokoscKlatki : rel + (plotnoH >> 1) - y;
}

/**
 * Kolory ubrania do przemalowania: z kandydatów (z manifestu albo zgadniętych) te, których co najmniej `prog` pikseli
 * w statycznych postaciach (wszystkie kierunki razem) leży na tułowiu, w wierszach [od, do) płótna. Kolor dzielony
 * z włosami, butami albo obrysem zostaje, bo przemalowanie nie rozróżnia części ciała, a pozy (przysiad, klęczenie,
 * siedzenie) przesuwają ciało względem pasa o stałej wysokości, więc pas nie nadaje się do klatek animacji.
 */
export function koloryUbrania(
  statyczne: readonly Plansza[],
  kandydaci: readonly string[],
  wiersze: readonly [number, number],
  prog = 0.5,
): string[] {
  const wTulowiu = new Map<string, number>();
  const razem = new Map<string, number>();
  for (const s of statyczne)
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const i = (y * s.w + x) * 4;
        if (!s.rgba[i + 3]) continue;
        const c = `#${((1 << 24) | (s.rgba[i] << 16) | (s.rgba[i + 1] << 8) | s.rgba[i + 2]).toString(16).slice(1)}`;
        razem.set(c, (razem.get(c) ?? 0) + 1);
        if (y >= wiersze[0] && y < wiersze[1]) wTulowiu.set(c, (wTulowiu.get(c) ?? 0) + 1);
      }
  return kandydaci.filter((c) => (razem.get(c) ?? 0) > 0 && (wTulowiu.get(c) ?? 0) / razem.get(c)! >= prog);
}

/**
 * Klatki animacji z listy plików paczki (już po kolei). Animacja z opisu (pixminimax), zamówiona z klatką
 * referencyjną, ma jedną klatkę więcej niż zamówiono (pierwsza to poza wyjściowa): z `bezReferencji` ją pomijamy.
 */
export function klatkiAnimacji<T>(pliki: readonly T[], opcje: { bezReferencji?: boolean }): T[] {
  return opcje.bezReferencji && pliki.length === 5 ? pliki.slice(1) : [...pliki];
}

/**
 * Klatki po kierunkach pionka (południe, północ, zachód, wschód) z klatek po nazwach PixelLab. Wschód bez własnych
 * klatek to odbicie zachodu (w wyniku numer kierunku 2). Bez północy albo zachodu animacji nie da się złożyć (null),
 * a kierunki o różnej liczbie klatek to błąd.
 */
export function kierunkiAnimacji<T>(po: Partial<Record<(typeof KIERUNKI_PL)[number], T[]>>): (T[] | number)[] | null {
  if (!po.south || !po.north || !po.west) return null;
  const n = po.south.length;
  for (const [k, v] of Object.entries(po))
    if (v && v.length !== n) throw new Error(`${k} ma ${v.length} klatek, south ${n}`);
  return [po.south, po.north, po.west, po.east ?? 2];
}
