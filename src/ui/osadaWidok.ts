/* Ich kwadrat w widoku (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 5): po odkryciu osady jej kwadrat staje obok
   domu jak kwadrat z `?kwadraty=` (`buildKwadrat` z geo kwadratu SPRZED przesunięcia do siedziby, `geoKwadratuOsady` z
   src/ai/kwadrat.ts, sklejony z domem), a w jego świecie trzeba znaleźć siedzibę osady: nad nią stoi etykieta z nazwą i jej
   obrys otwiera kartę osady po kliknięciu. Czyste funkcje bez PixiJS i DOM (testy w Node, tests/unit/osada-widok.test.ts); układ
   miasta ten sam co w widoku: kwadrat (sx, sy) zaczyna się w kafelku (sx·bok, sy·bok), x na wschód, y na południe.

   Siedziba. Świat kwadratu z `buildKwadrat` to inny świat niż gra osady (osobny obrót, ziarno, bez wnętrza), więc budynek siedziby
   znajduje się w nim po kluczu budynku (`zm:klucz`, src/world/klucze.ts: ten sam klucz w geo kwadratu i w świecie osady; gdy
   obrys przecina granicę okna, kawałek z największym obrysem), a gdy klucza nie ma (stare dane) albo nic go nie niesie, po
   punkcie, który po przesunięciu geo wypada w środku świata osady (`przesuniecieOsady`): budynek najbliższy temu punktowi
   w promieniu `PROMIEN_SZUKANIA` kafelków (obrys po prostowaniu może się o kafelek rozjechać z punktem). Bez żadnego z nich null:
   kwadrat jest, siedziby w nim nie ma, więc nie ma etykiety i kliknięcia, a reszta działa.

   Etykieta stoi nad środkiem górnej krawędzi obrysu (kafelek górnego rzędu w środku tego rzędu), czyli zawsze nad samym
   budynkiem, także wtedy, gdy jego obrys to długi ukośny schodek, którego środek ramki leży na trawie. Jej położenie na ekranie
   (`polozenieEtykiety`: wyśrodkowana nad kotwicą, przy brzegu ekranu przesunięta do środka) i ustępowanie nakładkom
   (`zaslaniaNakladki`: pasek, cele, lista ludzi, karta, podpowiedź, przyciski, atrybucja; etykieta wtedy znika) to też czyste
   funkcje, żeby dało się je sprawdzić bez przeglądarki; `placeOsadaMark` w src/main.ts tylko mierzy nakładki i ustawia element.
   `wProstokacie` rozstrzyga klik w napis etykiety (etykieta przepuszcza wskaźnik do mapy). `obrysKwadratu` daje rogi kwadratu osady dla
   mapy miasta. Prostokąty ekranu mają kształt `DOMRect` (`Prostokat` z src/ui/pietra.ts:
   left, top, right, bottom), więc nakładki idą prosto z `getBoundingClientRect()`. */

import type { Pt } from '../world/geo.ts';
import { kluczBudynku } from '../world/klucze.ts';
import { srodekKwadratu, type Uklad } from '../world/kwadraty.ts';
import type { World } from '../world/world.ts';
import type { Prostokat } from './pietra.ts';

/** Siedziba osady w jej kwadracie w widoku. Współrzędne w kafelkach układu miasta (kwadrat (sx, sy) zaczyna się w (sx·bok, sy·bok)). */
export interface SiedzibaWidoku {
  /** numer budynku siedziby w świecie kwadratu (nie w świecie gry osady) */
  bid: number;
  /** kotwica etykiety: środek górnej krawędzi obrysu */
  etykieta: { x: number; y: number };
  /** po czym znaleziono budynek: klucz budynku albo punkt przesunięcia */
  skad: 'klucz' | 'punkt';
}

/** jak daleko od punktu przesunięcia (kafelki) szuka się budynku, gdy siedziby nie da się znaleźć po kluczu */
export const PROMIEN_SZUKANIA = 6;

/** Numer budynku najbliższego punktowi `punkt` (metry od adresu, układ geo bez obrotu) w świecie kwadratu (sx, sy) albo −1:
    punkt obracany o `kat` jak geo przy budowie świata (`rotateGeo`) i przeliczony na kafelki okna kwadratu; kafelki budynków
    w promieniu `PROMIEN_SZUKANIA`, najbliższy środkiem kafelka (przy remisie pierwszy od północy i zachodu). */
function budynekPrzyPunkcie(kw: Pick<World, 'size' | 'bid'>, sx: number, sy: number, punkt: Pt, kat: number): number {
  const { size, bid } = kw;
  const c = Math.cos(kat);
  const s = Math.sin(kat);
  // kafelek (i, j) ma środek w (i − size/2 + ½ + sx·size, ...) w układzie obróconym, więc punkt leży w kafelku floor(x_obr + size/2 − sx·size)
  const px = punkt[0] * c - punkt[1] * s + size / 2 - sx * size;
  const py = punkt[0] * s + punkt[1] * c + size / 2 - sy * size;
  const tx = Math.floor(px);
  const ty = Math.floor(py);
  let najlepszy = -1;
  let odl = Number.POSITIVE_INFINITY;
  for (let y = ty - PROMIEN_SZUKANIA; y <= ty + PROMIEN_SZUKANIA; y++) {
    if (y < 0 || y >= size) continue;
    for (let x = tx - PROMIEN_SZUKANIA; x <= tx + PROMIEN_SZUKANIA; x++) {
      if (x < 0 || x >= size) continue;
      const id = bid[y * size + x];
      if (id < 0) continue;
      const d = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
      if (d < odl) {
        odl = d;
        najlepszy = id;
      }
    }
  }
  return najlepszy;
}

/** Siedziba osady w świecie jej kwadratu (patrz nagłówek modułu): `klucz` to klucz budynku siedziby w świecie osady (null, gdy go nie
    ma), `punkt` przesunięcie geo osady (`przesuniecieOsady`), `kat` kąt układu domu (`Uklad.kat`). Null, gdy nie znaleziono budynku. */
export function siedzibaWKwadracie(
  kw: Pick<World, 'size' | 'bid' | 'buildings'>,
  o: { klucz: string | null; sx: number; sy: number; punkt: Pt },
  kat: number,
): SiedzibaWidoku | null {
  const { size, bid, buildings } = kw;
  let id = -1;
  let skad: SiedzibaWidoku['skad'] = 'klucz';
  if (o.klucz)
    for (let i = 0; i < buildings.length; i++)
      if (kluczBudynku(buildings[i]) === o.klucz && (id < 0 || buildings[i].tiles > buildings[id].tiles)) id = i;
  if (id < 0) {
    skad = 'punkt';
    id = budynekPrzyPunkcie(kw, o.sx, o.sy, o.punkt, kat);
  }
  if (id < 0) return null;
  // jeden przebieg po ramce budynku: górny rząd obrysu, którego środek to kotwica etykiety
  const b = buildings[id];
  let gora = -1;
  const wGorze: number[] = [];
  for (let y = Math.max(0, b.y0); y <= Math.min(size - 1, b.y1); y++)
    for (let x = Math.max(0, b.x0); x <= Math.min(size - 1, b.x1); x++) {
      if (bid[y * size + x] !== id) continue;
      if (gora < 0) gora = y;
      if (y === gora) wGorze.push(x);
    }
  if (gora < 0) return null;
  const ox = o.sx * size;
  const oy = o.sy * size;
  return { bid: id, etykieta: { x: ox + wGorze[(wGorze.length - 1) >> 1] + 0.5, y: oy + gora }, skad };
}

/** Czy punkt (x, y) w kafelkach układu miasta leży na obrysie siedziby `bid` w świecie kwadratu (sx, sy): kafelek pod punktem w jego
    oknie ma ten numer budynku. Inny kwadrat, poza oknem i inny budynek to nie. */
export function naSiedzibie(
  kw: Pick<World, 'size' | 'bid'>,
  sx: number,
  sy: number,
  bid: number,
  x: number,
  y: number,
): boolean {
  const lx = Math.floor(x - sx * kw.size);
  const ly = Math.floor(y - sy * kw.size);
  if (lx < 0 || ly < 0 || lx >= kw.size || ly >= kw.size) return false;
  return kw.bid[ly * kw.size + lx] === bid;
}

/** Rogi kwadratu (sx, sy) w metrach od adresu w układzie geo, bez obrotu (jak `Miejsce` i `Geo`): na mapie miasta z północą u góry to
    kwadrat obrócony o kąt domu. Kwadrat zajmuje w układzie obróconym [(sx−½)·bok, (sx+½)·bok] × [(sy−½)·bok, (sy+½)·bok], więc róg to
    „środek kwadratu” przesunięty o pół kwadratu (`srodekKwadratu` cofa ten sam obrót co `rotateGeo`): kolejno północny zachód,
    północny wschód, południowy wschód, południowy zachód. */
export function obrysKwadratu(uklad: Uklad, sx: number, sy: number): Pt[] {
  return [
    srodekKwadratu(uklad, sx - 0.5, sy - 0.5),
    srodekKwadratu(uklad, sx + 0.5, sy - 0.5),
    srodekKwadratu(uklad, sx + 0.5, sy + 0.5),
    srodekKwadratu(uklad, sx - 0.5, sy + 0.5),
  ];
}

/** odstęp dolnej krawędzi napisu etykiety od jej kotwicy w pikselach (w nim leży ogonek strzałki; jak `bottom: 10px` w `.treemark-t`) */
export const ODSTEP_ETYKIETY = 10;
/** najmniej tyle pikseli od brzegu ekranu zostaje napisowi etykiety */
export const MARGINES_ETYKIETY = 4;

/** Gdzie stoi napis etykiety nad kotwicą (ax, ay) na ekranie o szerokości `szerEkranu`: napis o rozmiarze `szer` × `wys` jest
    wyśrodkowany nad kotwicą, odsunięty od niej o `ODSTEP_ETYKIETY`, a gdy wystawałby za ekran (z `MARGINES_ETYKIETY` marginesu),
    przesuwa się płynnie do środka (`przesuniecie`, piksele; ogonek zostaje przy kotwicy). `rect` to prostokąt napisu po przesunięciu. */
export function polozenieEtykiety(
  ax: number,
  ay: number,
  szer: number,
  wys: number,
  szerEkranu: number,
): { przesuniecie: number; rect: Prostokat } {
  const x0 = ax - szer / 2;
  const przesuniecie = Math.max(MARGINES_ETYKIETY - x0, Math.min(0, szerEkranu - MARGINES_ETYKIETY - (x0 + szer)));
  const left = x0 + przesuniecie;
  return { przesuniecie, rect: { left, top: ay - ODSTEP_ETYKIETY - wys, right: left + szer, bottom: ay } };
}

/** Czy punkt (x, y) ekranu leży w prostokącie `r` (brzegi liczą się); `null` (etykiety nie widać) to nigdy. Etykieta osady przepuszcza
    wskaźnik do mapy (kółko, przeciąganie i szczypanie zaczęte na niej działają jak obok), więc to mapa rozstrzyga, czy klik trafił w
    jej napis: po prostokącie, który `polozenieEtykiety` podał przy ostatnim ustawieniu etykiety. */
export const wProstokacie = (r: Prostokat | null, x: number, y: number): boolean =>
  r !== null && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** Czy prostokąt etykiety (od jej napisu do kotwicy) nachodzi na którąś z nakładek; prostokąty, które się tylko stykają, nie nachodzą. */
export const zaslaniaNakladki = (etykieta: Prostokat, nakladki: readonly Prostokat[]): boolean =>
  nakladki.some(
    (n) => etykieta.left < n.right && etykieta.right > n.left && etykieta.top < n.bottom && etykieta.bottom > n.top,
  );
