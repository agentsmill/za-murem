/* Numery globalne kafelków, budynków i drzew przy wielu kwadratach (miasto z kwadratów, etap 2, zadanie 1;
   docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md, sekcje „Stan gry: globalne numery” i „Umowa
   o współrzędnych”, plan docs/superpowers/plans/2026-10-19-miasto-etap-2-chodzenie.md). Czyste funkcje i typy, bez
   zależności od reszty gry. Ma być jedynym miejscem, które zna układ numerów: kod w src/sim liczy numery kafelków
   przez gid, gxy i sasiadKafelka, a nie przez size, numery budynków i drzew przez bGlob, bKw i bLok.

   Umowa.
   - Kwadrat (sx, sy) ma bok BOK = 384 kafelki (1 kafelek = 1 m) i zajmuje kafelki globalne od sx·384 do sx·384 + 383
     w poziomie, tak samo w pionie (y rośnie na południe). Dom stoi w kwadracie (0, 0), więc w nim współrzędne
     globalne są lokalnymi; na zachód i na północ od domu są ujemne.
   - Odkryte kwadraty leżą na liście w kolejności odkrycia (MapaKwadratow). Indeks na liście to numer kwadratu k, dom
     jest zawsze pierwszy, więc ma k = 0.
   - Numer globalny kafelka to g = k·N_KW + i, gdzie N_KW = 147 456 (384·384), a i = ly·384 + lx to numer kafelka
     w kwadracie. Dla samego domu g = i = ly·384 + lx, czyli dzisiejszy numer kafelka: wszystko, co dziś trzyma numery
     kafelków (stan, polecenia, zapisy), znaczy to samo. Zakres Int32 starcza na 14 563 kwadraty (k do 14 562).
   - Numer budynku albo drzewa to b = k·B_KW + numer w świecie kwadratu, B_KW = 65 536 (świat 384×384 ma ich setki).
     Dla domu bez zmian.
   - Brak (−1) zostaje brakiem w obie strony. kwNumeru, lokalnyNumer, bKw i bLok dają z −1 znów −1 (z samej
     arytmetyki: podłoga z −1 / N_KW to −1, a −1 % N_KW to −1), a numerGlobalny i bGlob z −1 na wejściu oddają −1 dla
     każdego k. Dla k > 0 samo k·N_KW − 1 byłoby już prawdziwym kafelkiem poprzedniego kwadratu (na przykład
     nearestFree bez wyniku w kwadracie 5 nie może zamienić się w numer z kwadratu 4), więc te dwie funkcje pilnują
     tego same.
   - gid daje −1 dla kafelka poza odkrytymi kwadratami, tak jak dziś brzeg mapy; sasiadKafelka też (sąsiad za
     granicą odkrytego terenu, a dla −1 na wejściu oddaje −1). gxy rzuca RangeError dla numeru spoza odkrytych
     kwadratów (także dla −1: brak nie ma współrzędnych), sasiadKafelka dla numeru z kwadratu, którego nie odkryto.
     To błąd wołającego, a nie brzeg mapy.
   - Współrzędne kafelka gx, gy są całkowite (kafelek, nie punkt: pionek na x = 12,7 stoi na kafelku 12).

   Mapa kwadratów po zbudowaniu jest tylko do odczytu. Przy odkryciu kwadratu buduje się nową z listy zapisanej w stanie
   gry (mapaZListy), a lista w stanie to kolejność odkrycia bez domu, więc ta sama lista daje te same numery w każdej
   przeglądarce i po wczytaniu zapisu. Dla samego domu gid i gxy to kilka porównań i mnożeń bez dotykania mapy kluczy;
   dla innych kwadratów gid szuka jednego klucza „sx,sy” w Map. */

/** bok kwadratu w kafelkach (1 kafelek = 1 m) */
export const BOK = 384;
/** liczba kafelków kwadratu: numer globalny kafelka to k·N_KW + numer w kwadracie */
export const N_KW = BOK * BOK;
/** mnożnik numerów budynków i drzew: numer globalny to k·B_KW + numer w świecie kwadratu */
export const B_KW = 65536;
/** tyle kwadratów (razem z domem) mieści się w numerach kafelków typu Int32 */
const MAX_KW = Math.floor(2 ** 31 / N_KW);

export interface MapaKwadratow {
  /** odkryte kwadraty w kolejności odkrycia; indeks to numer kwadratu k, a lista[0] to dom { sx: 0, sy: 0 } */
  lista: { sx: number; sy: number }[];
  /** numer kwadratu k po kluczu „sx,sy” (kluczKw) */
  poKluczu: Map<string, number>;
}

/** klucz kwadratu: napis „sx,sy”, ten sam co w projekcie miasta z kwadratów */
export const kluczKw = (sx: number, sy: number): string => `${sx},${sy}`;

/** mapa z samym domem (k = 0): numer globalny kafelka to dzisiejszy numer */
export const mapaDomu = (): MapaKwadratow => mapaZListy([]);

/** mapa z domem i kwadratami z listy w stanie gry (bez domu, w kolejności odkrycia: pierwszy ma k = 1). Zła lista to
    błąd (zepsuty zapis): kwadrat dwa razy, dom na liście, współrzędne niecałkowite albo więcej kwadratów, niż mieści
    się w Int32. Mapa nie trzyma obiektów z listy, więc późniejsza zmiana listy jej nie rusza. */
export function mapaZListy(dodane: readonly { sx: number; sy: number }[]): MapaKwadratow {
  if (dodane.length + 1 > MAX_KW) {
    throw new RangeError(`Za dużo kwadratów (${dodane.length + 1}): numery kafelków mieszczą ich najwyżej ${MAX_KW}`);
  }
  const lista = [{ sx: 0, sy: 0 }];
  const poKluczu = new Map([[kluczKw(0, 0), 0]]);
  for (const { sx, sy } of dodane) {
    if (!Number.isInteger(sx) || !Number.isInteger(sy)) {
      throw new RangeError(`Kwadrat (${sx}, ${sy}) nie ma całkowitych współrzędnych`);
    }
    const klucz = kluczKw(sx, sy);
    if (poKluczu.has(klucz)) throw new RangeError(`Kwadrat ${klucz} jest na liście drugi raz albo to dom`);
    poKluczu.set(klucz, lista.length);
    lista.push({ sx, sy });
  }
  return { lista, poKluczu };
}

/** numer kwadratu, w którym leży kafelek o numerze globalnym g; brak (−1) zostaje brakiem (podłoga z −1 / N_KW) */
export const kwNumeru = (g: number): number => Math.floor(g / N_KW);

/** numer kafelka w jego kwadracie (ly·384 + lx); brak (−1) zostaje brakiem (−1 % N_KW to −1) */
export const lokalnyNumer = (g: number): number => g % N_KW;

/** numer globalny kafelka o numerze i w kwadracie k; brak (−1 w k albo w i) zostaje brakiem */
export const numerGlobalny = (k: number, i: number): number => (k < 0 || i < 0 ? -1 : k * N_KW + i);

/** numer kwadratu kafelka g; RangeError, gdy tego kwadratu nie odkryto */
function odkrytyKw(m: MapaKwadratow, g: number): number {
  const k = kwNumeru(g);
  if (m.lista[k] === undefined) throw new RangeError(`Kafelek ${g} nie leży w odkrytym kwadracie`);
  return k;
}

/** współrzędne globalne [gx, gy] kafelka o numerze globalnym g; RangeError dla numeru spoza odkrytych kwadratów */
export function gxy(m: MapaKwadratow, g: number): [number, number] {
  const k = odkrytyKw(m, g);
  const kw = m.lista[k];
  const i = g - k * N_KW;
  const ly = Math.floor(i / BOK);
  return [kw.sx * BOK + (i - ly * BOK), kw.sy * BOK + ly];
}

/** kafelek (gx, gy) poza domem: numer kwadratu z mapy kluczy, −1, gdy go nie odkryto. Osobna funkcja, żeby gid z
    samą ścieżką domu była mała i silnik wstawiał ją w gorące pętle (w pomiarze wyraźnie szybciej niż z jedną dużą
    funkcją, a z Math.floor na wejściu prawie jak dzisiejsze y * size + x). */
function gidPozaDomem(m: MapaKwadratow, gx: number, gy: number): number {
  const sx = Math.floor(gx / BOK);
  const sy = Math.floor(gy / BOK);
  const k = m.poKluczu.get(kluczKw(sx, sy));
  return k === undefined ? -1 : k * N_KW + (gy - sy * BOK) * BOK + (gx - sx * BOK);
}

/** numer globalny kafelka o współrzędnych globalnych (gx, gy); −1 poza odkrytymi kwadratami */
export function gid(m: MapaKwadratow, gx: number, gy: number): number {
  // dom (k = 0): numer globalny to dzisiejszy numer, bez mapy kluczy
  if (gx >= 0 && gx < BOK && gy >= 0 && gy < BOK) return gy * BOK + gx;
  return gidPozaDomem(m, gx, gy);
}

/** numer globalny kafelka o (dx, dy) od kafelka g, także przez granicę kwadratu i po przekątnej przez róg; −1, gdy
    ten kafelek leży poza odkrytymi kwadratami albo g to brak (−1); RangeError dla g spoza odkrytych kwadratów */
export function sasiadKafelka(m: MapaKwadratow, g: number, dx: number, dy: number): number {
  if (g < 0) return -1;
  const k = odkrytyKw(m, g);
  const kw = m.lista[k];
  const i = g - k * N_KW;
  const lx = (i % BOK) + dx;
  const ly = Math.floor(i / BOK) + dy;
  // w obrębie tego samego kwadratu to zwykłe przesunięcie, bez mapy kluczy
  if (lx >= 0 && lx < BOK && ly >= 0 && ly < BOK) return k * N_KW + ly * BOK + lx;
  return gid(m, kw.sx * BOK + lx, kw.sy * BOK + ly);
}

/** numer globalny budynku albo drzewa o numerze b w świecie kwadratu k (dla domu b); brak (−1) zostaje brakiem.
    RangeError, gdy b nie mieści się w kwadracie (wszedłby w numery następnego). */
export function bGlob(k: number, b: number): number {
  if (k < 0 || b < 0) return -1;
  if (b >= B_KW) throw new RangeError(`Numer ${b} w świecie kwadratu nie mieści się w ${B_KW}`);
  return k * B_KW + b;
}

/** numer kwadratu budynku albo drzewa o numerze globalnym b; brak (−1) zostaje brakiem */
export const bKw = (b: number): number => Math.floor(b / B_KW);

/** numer budynku albo drzewa w świecie jego kwadratu; brak (−1) zostaje brakiem */
export const bLok = (b: number): number => b % B_KW;
