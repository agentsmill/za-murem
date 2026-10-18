/* Budynki dla generatora mieszkańców: z mapy (`Geo`) do listy budynków mieszkalnych z rejonem, typem, wymiarami,
   klatkami, epoką budowy i liczbą mieszkań. Bez trygonometrii poza jednym miejscem (przeliczenie metrów na stopnie),
   bez pierwiastków poza `Math.sqrt` w obrys.ts, więc wynik jest taki sam w każdej przeglądarce i w Node. Losowanie
   idzie z ziaren po kluczu budynku (`losDla`), więc nie zależy od kolejności budynków na mapie.
   Od adresu gracza zależy: importery mapy (src/world) zaokrąglają wierzchołki do 0,5 m względem środka mapy `geo.c`,
   więc ten sam budynek wczytany z innego adresu ma trochę inny środek i pole. Klucz `g:…`, a z nim epoka i
   mieszkania, jest stały tylko w obrębie jednego wczytania mapy. Klucz `osm:<id>` jest stały także między adresami,
   ale mieszkania (z pola) i reguły epoki z wymiarów mogą się przesunąć o drgnięcie pola. Na kafelkach z
   tests/fixtures/mvt, dla adresu i punktu 40 m na północny wschód, z 40 budynków do 150 m od adresu ten sam klucz w
   obu wczytaniach mają 3 (test `it.fails` w mieszkancy-budynki.test.ts); zdejmuje się go, gdy importer zacznie
   dawać poniższe tagi.

   Kanoniczne tagi budynku z importera (krok 5), oba formaty stałe niezależnie od adresu:
   - `zm:klucz`: `px:X:Y:DX:DY:S`, obrys w pikselach globalnych siatki z=14 (X, Y to najwyższy wierzchołek, DX, DY
     przesunięcie do najniższego, S strona cięciwy między nimi, po której leży budynek; src/world/klucze.ts). Gdy
     segment go ma, jest kluczem budynku (przed `osm:` i `g:`). W sklejonym budynku klucz bierze się z największego
     segmentu, który ma ten tag, tak samo jak dziś `id`.
   - `zm:pole`: pole obrysu segmentu w m², liczba całkowita dodatnia do 6 cyfr ("1180").
   - `zm:wym`: wymiary obrysu segmentu w metrach, `szer,dl` ("11.6,59.4"; kolejność wymusza min i max), każdy do 4 cyfr
     i 3 miejsc po przecinku.
   Gdy KAŻDY segment budynku ma poprawne oba tagi `zm:pole` i `zm:wym`, pole budynku to suma `zm:pole`, szerokość to
   mediana szerokości segmentów z `zm:wym` (ta sama idzie do reguł płyty), a długość to suma długości z `zm:wym`: tak
   samo jak z obrysu rząd sklejonych segmentów ma długość rzędu. Suma przecenia długość budynku w literę L, w literę U
   i ze skrzydłami równoległymi (tagi nie mówią o kątach ani o układzie segmentów), a to wpływa tylko na regułę płyty
   5 kondygnacji: sklejony budynek ma klatki z liczby segmentów, nie z długości. Segment ocenia się wtedy (typ
   budynku, zgadywane kondygnacje) po `zm:pole`. Wystarczy, że jeden segment nie ma któregoś z tagów albo ma go
   zepsutego, a pole i wymiary całego budynku idą z obrysu jak dotąd: z tagów segmentów nie
   da się złożyć obrysu całości, a mieszanie źródeł dałoby niespójny budynek. Środek (`lat`, `lon`, a z nich rejon)
   zawsze idzie z obrysu. Dema nie mają tagów `zm:*`, więc ich wynik się nie zmienia. Tag `zm:bud` (klucz budynku
   generatora na każdym członku) dopisuje oznacz.ts. */

import { classify, levelsOf } from '../world/classify.ts';
import type { Geo, GeoBuilding } from '../world/geo.ts';
import { losDla, szansa, wazony } from './los.ts';
import {
  blizejNiz,
  najmniejszyProstokat,
  odlegloscPunktuKw,
  type Pierscienie,
  pierscienieBudynku,
  pole,
  type Ramka,
  ramka,
  ramkiBlisko,
  srodek,
  wObrysie,
} from './obrys.ts';
import { rejonDla } from './rejon.ts';
import type { Epoka, TabeleGminy, TabeleKraju } from './tabele.ts';
import type { Budynek } from './typy.ts';

const EPOKI: readonly Epoka[] = ['przedwojenna', 'powojenna', 'plyta', 'transformacja', 'nowa'];

/** Bez tabeli gminy zakładamy miasto, jak przy gospodarstwach trzypokoleniowych: mieszkania zamieszkane w miastach
    Polski według okresu budowy budynku. GUS, „Warunki mieszkaniowe w Polsce w świetle wyników NSP 2021”, tablice
    XLSX, tabl. 14 (wiersz Miasta). Okresy złożone w epoki jak w tabelach gmin: przedwojenna = przed 1918 i
    1918-1944 (609 766 + 695 121), powojenna = 1945-1970, plyta = 1971-1978 i 1979-1988 (1 315 794 + 1 541 768),
    transformacja = 1989-2002 i 2003-2011 (1 228 348 + 814 837), nowa = 2012-2016 i 2017-2021 z budynkami w budowie
    (431 551 + 459 042 + 11 986), tak jak w P4386. */
export const WAGI_KRAJOWE: Record<Epoka, number> = {
  przedwojenna: 1_304_887,
  powojenna: 1_841_703,
  plyta: 2_857_562,
  transformacja: 2_043_185,
  nowa: 902_579,
};
const WAGI_KRAJOWE_TAB: readonly number[] = EPOKI.map((e) => WAGI_KRAJOWE[e]);
/** Średni metraż mieszkania w epoce, m², bez tabeli gminy: tabl. 16 (przeciętna powierzchnia użytkowa 1 mieszkania,
    wiersze Miasta), średnia ważona liczbą mieszkań z tabl. 14 w obrębie epoki, zaokrąglona do całych m². */
const METRAZ_KRAJOWY: Record<Epoka, number> = {
  przedwojenna: 61,
  powojenna: 54,
  plyta: 60,
  transformacja: 82,
  nowa: 76,
};

/** Powierzchnia użytkowa mieszkań jako część powierzchni obrysu × kondygnacje (ściany, klatki, strychy). */
const WSPOLCZYNNIK_UZYTKOWY = 0.72;
const MIN_MIESZKAN_BLOKU = 2;
/** Górna granica: obrys oznaczony jako blok bywa halą albo galerią, a falowiec ma i tak mniej niż 2 000. */
const MAX_MIESZKAN_BLOKU = 400;
/** Wielka płyta z szerokością traktu: do 14,5 m (mediana próbki 13,9 m). */
const MAX_SZEROKOSC_PLYTY = 14.5;
/** Segmenty bloku jednej wysokości (różnica do 1 kondygnacji) bliżej niż 1 m to jeden budynek. */
const MAX_ROZNICA_KONDYGNACJI = 1;
const MAX_SZCZELINA = 1;
/** Długość jednej klatki bloku z jednego obrysu, m (falowiec w OSM bywa pocięty na klatki, ale nie zawsze). */
const DLUGOSC_KLATKI = 20;
/** Mniejsze obrysy `world.ts` odrzuca (mniej niż 3 kafelki). */
const MIN_POLE = 3;
/** Punkt zainteresowania przypisuje się do budynku, w którym leży, a gdy leży poza, do najbliższego w tym promieniu, m. */
const ZASIEG_PUNKTU = 6.5;

// ---------------------------------------------------------------- data budowy i epoka

/** Rok z wartości `start_date`: „1975”, „1975-06”, „~1975”, „1970s” (dekada to jej pierwszy rok), „1974..1976”
    (pierwszy rok). Nieczytelna wartość daje `undefined`. */
export function rokZDaty(s: string): number | undefined {
  const m = /(?:^|\D)(1[5-9]\d\d|20\d\d)(?!\d)/.exec(s);
  return m ? Number(m[1]) : undefined;
}

/** Epoka dla roku, na granicach okresów GUS z tabel: przed 1945, 1945-1970, 1971-1988, 1989-2011, od 2012. */
export function epokaZRoku(rok: number): Epoka {
  if (rok < 1945) return 'przedwojenna';
  if (rok <= 1970) return 'powojenna';
  if (rok <= 1988) return 'plyta';
  if (rok <= 2011) return 'transformacja';
  return 'nowa';
}

/** Od tylu kondygnacji losowana epoka nie bywa przedwojenna, a od drugiej liczby także powojenna. Decyzja
    generatora z przeglądu gałęzi, nie dane: losowanie z samych wag gminy dawało na mapie Przymorza 4 przedwojenne
    bloki z 10 od 13 kondygnacji. Bloki 9-12 kondygnacji bez dozwolonej wagi to płyta. */
const KONDYGNACJE_BEZ_PRZEDWOJENNEJ = 7;
const KONDYGNACJE_BEZ_POWOJENNEJ = 13;
const PLYTA_OD = 9;
const PLYTA_DO = 12;

const dozwolona = (e: Epoka, kondygnacje: number): boolean =>
  !(
    (e === 'przedwojenna' && kondygnacje >= KONDYGNACJE_BEZ_PRZEDWOJENNEJ) ||
    (e === 'powojenna' && kondygnacje >= KONDYGNACJE_BEZ_POWOJENNEJ)
  );
const suma = (w: readonly number[]): number => w.reduce((s, v) => s + v, 0);

/** Epoka budynku, w kolejności: `startDate`; wielka płyta z wymiarów (blok 10-12 kondygnacji i szerokość do 14,5 m;
    blok 5 kondygnacji, ta szerokość i długość co najmniej 3 razy większa; w próbce z OSM precyzja 24 na 24 i 0,95
    dla lat 1945-1989, bierzemy `plyta` jako częstszą); reszta losowana z mieszkań gminy według epok (P4386)
    z ziarnem po kluczu budynku. Wagi to sumy epok, nie „ogółem” z GUS: mieszkania o nieznanym okresie budowy
    (około 2%) nie należą do żadnej epoki. Gmina bez tabeli albo z samymi zerami: wagi krajowe.
    Wysokość ogranicza losowanie: od 7 kondygnacji waga `przedwojenna` to 0, od 13 także `powojenna`, a reszta wag
    zostaje (losowanie idzie za nimi proporcjonalnie). Gdy gmina ma mieszkania tylko w epokach wykluczonych, blok
    9-12 kondygnacji to `plyta`, od 13 losuje `transformacja` albo `nowa` z wag krajowych, a 7-8 kondygnacji losuje
    z wag krajowych bez wykluczonych. `szerokoscSegmentu` to szerokość do reguł płyty: w sklejonym bloku mediana
    szerokości segmentów (`budynkiZGeo`), bo obrys całości (litera L, rząd z poprzecznym skrzydłem) jest szerszy niż
    trakt; domyślnie `b.szerokosc`. */
export function epokaBudynku(b: Budynek, g: TabeleGminy | null, szerokoscSegmentu = b.szerokosc): Epoka {
  if (b.startDate !== undefined) return epokaZRoku(b.startDate);
  if (b.typ === 'blok' && szerokoscSegmentu <= MAX_SZEROKOSC_PLYTY) {
    if (b.kondygnacje >= 10 && b.kondygnacje <= 12) return 'plyta';
    if (b.kondygnacje === 5 && b.dlugosc >= 3 * szerokoscSegmentu) return 'plyta';
  }
  const k = b.kondygnacje;
  const bezWykluczonych = (w: readonly number[]): number[] => w.map((v, i) => (dozwolona(EPOKI[i], k) ? v : 0));
  const zGminy = g ? EPOKI.map((e) => g.epoki[e].mieszkania) : [];
  // brak tabeli albo same zera: wagi krajowe, jak bez ograniczenia wysokości
  let wagi = bezWykluczonych(suma(zGminy) > 0 ? zGminy : WAGI_KRAJOWE_TAB);
  if (suma(wagi) === 0) {
    // gmina ma mieszkania tylko w epokach wykluczonych dla tej wysokości
    if (k >= PLYTA_OD && k <= PLYTA_DO) return 'plyta';
    wagi =
      k > PLYTA_DO
        ? EPOKI.map((e, i) => (e === 'transformacja' || e === 'nowa' ? WAGI_KRAJOWE_TAB[i] : 0))
        : bezWykluczonych(WAGI_KRAJOWE_TAB);
  }
  return EPOKI[wazony(losDla('epoka', b.klucz), wagi)];
}

// ---------------------------------------------------------------- mieszkania

/** Liczba mieszkań. Dom: jedno, a z szansą równą udziałowi gospodarstw trzypokoleniowych (miasta albo wieś według
    gminy, bez gminy miasta) dwa. Blok: pole obrysu × kondygnacje × 0,72 / średni metraż mieszkania w epoce budowy,
    zaokrąglone i przycięte do [2, 400]. Metraż bierze się z tabeli gminy, a bez niej albo przy zerze z krajowego.
    Epoka z `b.epoka`, a gdy jej nie ma, z `epokaBudynku`. `k` daje udziały trzypokoleniowych. */
export function mieszkaniaBudynku(b: Budynek, g: TabeleGminy | null, k: TabeleKraju): number {
  if (b.typ === 'dom') {
    const p = (g?.miejska ?? true) ? k.trojpokoleniowe.miasta : k.trojpokoleniowe.wies;
    return szansa(losDla('mieszkania', b.klucz), p) ? 2 : 1;
  }
  const epoka = b.epoka ?? epokaBudynku(b, g);
  const zTabeli = g?.metraz[epoka];
  const metraz = zTabeli !== undefined && zTabeli > 0 ? zTabeli : METRAZ_KRAJOWY[epoka];
  const n = Math.round((b.pole * b.kondygnacje * WSPOLCZYNNIK_UZYTKOWY) / metraz);
  return Math.max(MIN_MIESZKAN_BLOKU, Math.min(MAX_MIESZKAN_BLOKU, n));
}

// ---------------------------------------------------------------- segmenty z mapy

/** Kanoniczne pole i wymiary segmentu z tagów `zm:pole` i `zm:wym` (opis w nagłówku pliku). */
interface Kanon {
  pole: number;
  szerokosc: number;
  dlugosc: number;
}
interface Obiekt {
  /** Numer w `geo.b`. */
  i: number;
  b: GeoBuilding;
  ob: Pierscienie;
  ramka: Ramka;
  pole: number;
  /** Tylko gdy segment ma poprawne `zm:pole` i `zm:wym`. */
  kanon?: Kanon;
}
interface Segment extends Obiekt {
  typ: 'dom' | 'blok';
  /** Kondygnacje z tagu albo zgadnięte jak w grze (`levelsOf`). */
  poziomy: number;
}

/** Granice cyfr chronią przed liczbami nieskończonymi: pole do 999 999 m², wymiar do 9999,999 m. */
const WZOR_POLA_TAGU = /^\d{1,6}$/;
const WZOR_WYMIARU_TAGU = /^(\d{1,4}(?:\.\d{1,3})?),(\d{1,4}(?:\.\d{1,3})?)$/;

/** Pole i wymiary z tagów `zm:pole` ("1180") i `zm:wym` ("szer,dl" w metrach). Brak któregokolwiek albo zły zapis
    (ułamek, minus, zero, inna liczba pól, za wiele cyfr) daje `undefined`, a segment liczy się wtedy z obrysu. */
function kanonZTagow(t: Readonly<Record<string, string>>): Kanon | undefined {
  const poleTag = t['zm:pole'];
  const wymTag = t['zm:wym'];
  if (poleTag === undefined || wymTag === undefined || !WZOR_POLA_TAGU.test(poleTag)) return undefined;
  const wym = WZOR_WYMIARU_TAGU.exec(wymTag);
  if (!wym) return undefined;
  const poleM2 = Number(poleTag);
  const a = Number(wym[1]);
  const b = Number(wym[2]);
  if (!(Number.isFinite(poleM2) && Number.isFinite(a) && Number.isFinite(b))) return undefined;
  if (poleM2 <= 0 || a <= 0 || b <= 0) return undefined;
  return { pole: poleM2, szerokosc: Math.min(a, b), dlugosc: Math.max(a, b) };
}

/** Kategorie punktów w budynkach, jak w kroku 6 `buildWorld`: punkt należy do budynku, w którym leży (przy
    nakładaniu się większy wygrywa), a poza budynkiem do najbliższego w promieniu 6,5 m. */
function kategorie(geo: Geo, obiekty: readonly Obiekt[]): Map<number, string[]> {
  const wynik = new Map<number, string[]>();
  const kolejnosc = [...obiekty].sort((a, b) => b.pole - a.pole || a.i - b.i);
  const zasiegKw = ZASIEG_PUNKTU * ZASIEG_PUNKTU;
  for (const p of geo.poi) {
    let trafiony: Obiekt | undefined;
    for (const s of kolejnosc) {
      const r = s.ramka;
      if (p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1) continue;
      if (wObrysie(p.x, p.y, s.ob)) {
        trafiony = s;
        break;
      }
    }
    if (!trafiony) {
      let najmniej = zasiegKw;
      for (const s of kolejnosc) {
        const r = s.ramka;
        if (p.x < r.x0 - ZASIEG_PUNKTU || p.x > r.x1 + ZASIEG_PUNKTU) continue;
        if (p.y < r.y0 - ZASIEG_PUNKTU || p.y > r.y1 + ZASIEG_PUNKTU) continue;
        const d = odlegloscPunktuKw(p.x, p.y, s.ob);
        if (d < najmniej) {
          najmniej = d;
          trafiony = s;
        }
      }
    }
    if (!trafiony) continue;
    const lista = wynik.get(trafiony.i) ?? [];
    if (!lista.includes(p.c)) lista.push(p.c);
    wynik.set(trafiony.i, lista);
  }
  return wynik;
}

/** Segmenty mieszkalne (klasy blok i dom według `classify`) z pozycji `geo.b`, w kolejności mapy. */
function segmentyMieszkalne(geo: Geo): Segment[] {
  const obiekty: Obiekt[] = [];
  geo.b.forEach((b, i) => {
    const ob = pierscienieBudynku(b);
    const p = pole(ob);
    if (p >= MIN_POLE) {
      const kanon = kanonZTagow(b.t);
      obiekty.push(kanon ? { i, b, ob, ramka: ramka(ob), pole: p, kanon } : { i, b, ob, ramka: ramka(ob), pole: p });
    }
  });
  const kat = kategorie(geo, obiekty);
  const wynik: Segment[] = [];
  for (const o of obiekty) {
    // z kanonicznym polem typ i zgadywane kondygnacje nie zależą od zaokrąglenia obrysu do 0,5 m
    const poleOceny = o.kanon?.pole ?? o.pole;
    const cls = classify(o.b, poleOceny, kat.get(o.i) ?? []);
    if (cls === 'blok' || cls === 'dom') wynik.push({ ...o, typ: cls, poziomy: levelsOf(o.b, cls, poleOceny) });
  }
  return wynik;
}

/** Zbiór rozłączny na pozycjach segmentów: dla każdej pozycji korzeń jej grupy, czyli najmniejsza pozycja w grupie. */
function grupy(n: number, polaczone: readonly [number, number][]): number[] {
  const rodzic = Array.from({ length: n }, (_, i) => i);
  const korzen = (x: number): number => {
    let r = x;
    while (rodzic[r] !== r) r = rodzic[r];
    return r;
  };
  for (const [a, b] of polaczone) {
    const ra = korzen(a);
    const rb = korzen(b);
    if (ra !== rb) rodzic[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  return rodzic.map((_, i) => korzen(i));
}

/** Pary segmentów bloków, które są jednym budynkiem: wysokość różni się o najwyżej kondygnację, a obrysy dzielą
    krawędź, nakładają się albo są bliżej niż metr. Domy się nie sklejają: szeregówka to osobne gospodarstwa. */
function parySasiadow(segmenty: readonly Segment[]): [number, number][] {
  const pary: [number, number][] = [];
  const bloki = segmenty.map((s, k) => [s, k] as const).filter(([s]) => s.typ === 'blok');
  for (let a = 0; a < bloki.length; a++) {
    for (let c = a + 1; c < bloki.length; c++) {
      const [sa, ka] = bloki[a];
      const [sb, kb] = bloki[c];
      if (Math.abs(sa.poziomy - sb.poziomy) > MAX_ROZNICA_KONDYGNACJI) continue;
      if (!ramkiBlisko(sa.ramka, sb.ramka, MAX_SZCZELINA)) continue;
      if (blizejNiz(sa.ob, sb.ob, MAX_SZCZELINA)) pary.push([ka, kb]);
    }
  }
  return pary;
}

// ---------------------------------------------------------------- budynki

const zaokr5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/** Metry na stopień długości (`kx`) i szerokości (`ky`) geograficznej przy szerokości `lat0` (środek mapy `geo.c`).
    Jedyne miejsce z trygonometrią w module: z niego budynki dostają szerokość i długość geograficzną, a generuj.ts
    liczy z nich z powrotem środek budynku w metrach mapy. */
export function metryNaStopien(lat0: number): { kx: number; ky: number } {
  return { kx: 111320 * Math.cos((lat0 * Math.PI) / 180), ky: 110574 };
}

/** Klatki bloku: tyle, ile sklejonych segmentów, a pojedynczy obrys ma jedną klatkę na każde 20 m długości. */
const klatkiBloku = (segmenty: number, dlugosc: number): number =>
  segmenty > 1 ? segmenty : Math.max(1, Math.round(dlugosc / DLUGOSC_KLATKI));

/** Mediana liczb (przy parzystej liczbie średnia dwóch środkowych). */
function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const pol = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[pol] : (s[pol - 1] + s[pol]) / 2;
}

/** Segment o największym polu (`poleSegmentu`) spośród tych, które spełniają warunek (remis: wcześniejszy na mapie). */
function najwiekszy(
  s: readonly Segment[],
  ma: (x: Segment) => boolean,
  poleSegmentu: (x: Segment) => number,
): Segment | undefined {
  let wynik: Segment | undefined;
  for (const x of s) {
    if (ma(x) && (!wynik || poleSegmentu(x) > poleSegmentu(wynik))) wynik = x;
  }
  return wynik;
}

const tysieczne = (v: number): number => Math.round(v * 1000) / 1000;

/** Wymiary budynku z `zm:wym` wszystkich jego segmentów: szerokość to mediana szerokości, długość to suma długości
    (pojedynczy segment: jego własne wymiary). */
function wymiaryZTagow(kanony: readonly Kanon[]): { szerokosc: number; dlugosc: number } {
  return {
    szerokosc: tysieczne(mediana(kanony.map((x) => x.szerokosc))),
    dlugosc: tysieczne(kanony.reduce((suma, x) => suma + x.dlugosc, 0)),
  };
}

/** Budynek z mapy razem z numerami jego segmentów w `geo.b`. */
export interface BudynekZCzlonkami {
  budynek: Budynek;
  /** Indeksy w `geo.b` sklejonych segmentów budynku, rosnąco (dom i pojedynczy blok mają jeden). */
  czlonkowie: number[];
}

/** Budynki mieszkalne (bloki i domy) z mapy, w kolejności mapy, każdy z indeksami swoich segmentów w `geo.b`. `g` to
    tabele gminy (albo `null` bez nich), `k` tabele krajowe (udział gospodarstw trzypokoleniowych). Każdy budynek ma
    rejon środka obrysu, wymiary najmniejszego obróconego prostokąta, klatki, epokę i liczbę mieszkań. Segmenty bloków
    jednej wysokości, które się stykają albo są bliżej niż metr, tworzą jeden budynek (klatki = liczba segmentów);
    pojedynczy blok ma `max(1, round(długość / 20))` klatek, a dom jedną. Klucz to `zm:klucz` największego segmentu,
    który go ma, a bez niego `osm:<id>`, gdy mapa niesie tag `id` (największy segment), inaczej
    `g:<szerokość>,<długość>,<pole>` ze środka obrysu w stopniach z 5 miejscami. Pole i wymiary idą z tagów `zm:pole`
    i `zm:wym`, gdy mają je wszystkie segmenty budynku (pole i długość to sumy, szerokość to mediana szerokości
    segmentów; nagłówek pliku). Klucz `g:…` jest stały w obrębie jednego
    wczytania mapy, ale nie między adresami; `osm:<id>` jest stały, choć pole może drgnąć; `zm:klucz` z `zm:pole`
    i `zm:wym` jest stały także z pola i wymiarów. */
export function budynkiZCzlonkami(geo: Geo, g: TabeleGminy | null, k: TabeleKraju): BudynekZCzlonkami[] {
  const segmenty = segmentyMieszkalne(geo);
  const korzenie = grupy(segmenty.length, parySasiadow(segmenty));
  const [lat0, lon0] = geo.c;
  const { kx, ky } = metryNaStopien(lat0);

  // grupy w kolejności mapy: pierwszy członek to najmniejsza pozycja
  const czlonkowie = new Map<number, Segment[]>();
  segmenty.forEach((s, pozycja) => {
    const lista = czlonkowie.get(korzenie[pozycja]) ?? [];
    lista.push(s);
    czlonkowie.set(korzenie[pozycja], lista);
  });

  const wynik: BudynekZCzlonkami[] = [];
  const uzyte = new Set<string>();
  for (const grupa of czlonkowie.values()) {
    // tagi zm:pole i zm:wym liczą się tylko, gdy ma je każdy segment; inaczej cały budynek idzie z obrysu
    const kanony = grupa.flatMap((s) => (s.kanon ? [s.kanon] : []));
    const zTagow = kanony.length === grupa.length;
    const poleSegmentu = (s: Segment): number => (zTagow && s.kanon ? s.kanon.pole : s.pole);
    const ob: Pierscienie = grupa.flatMap((s) => s.ob);
    const sumaPol = grupa.reduce((suma, s) => suma + poleSegmentu(s), 0);
    const [cx, cy] = srodek(ob);
    const lat = zaokr5(lat0 - cy / ky);
    const lon = zaokr5(lon0 + cx / kx);
    const wymiary = zTagow ? wymiaryZTagow(kanony) : najmniejszyProstokat(ob);
    const szerokoscSegmentu =
      grupa.length > 1 && !zTagow ? mediana(grupa.map((x) => najmniejszyProstokat(x.ob).szerokosc)) : wymiary.szerokosc;
    const typ = grupa[0].typ;
    const poleBudynku = Math.round(sumaPol);

    const zKlucza = najwiekszy(grupa, (s) => Boolean(s.b.t['zm:klucz']), poleSegmentu);
    const zId = najwiekszy(grupa, (s) => Boolean(s.b.t.id), poleSegmentu);
    const podstawa = zKlucza
      ? zKlucza.b.t['zm:klucz']
      : zId
        ? `osm:${zId.b.t.id}`
        : `g:${lat.toFixed(5)},${lon.toFixed(5)},${poleBudynku}`;
    let klucz = podstawa;
    for (let n = 2; uzyte.has(klucz); n++) klucz = `${podstawa}#${n}`;
    uzyte.add(klucz);

    const zDaty = najwiekszy(grupa, (s) => rokZDaty(s.b.t.start_date ?? '') !== undefined, poleSegmentu);
    const rok = zDaty ? rokZDaty(zDaty.b.t.start_date ?? '') : undefined;
    const budynek: Budynek = {
      klucz,
      lat,
      lon,
      rejon: g ? rejonDla(g, lat, lon).rejon : '',
      typ,
      kondygnacje: Math.max(1, Math.round(grupa.reduce((suma, s) => suma + poleSegmentu(s) * s.poziomy, 0) / sumaPol)),
      pole: poleBudynku,
      szerokosc: wymiary.szerokosc,
      dlugosc: wymiary.dlugosc,
      klatki: typ === 'dom' ? 1 : klatkiBloku(grupa.length, wymiary.dlugosc),
    };
    if (rok !== undefined) budynek.startDate = rok;
    budynek.epoka = epokaBudynku(budynek, g, szerokoscSegmentu);
    budynek.mieszkania = mieszkaniaBudynku(budynek, g, k);
    wynik.push({ budynek, czlonkowie: grupa.map((s) => s.i) });
  }
  return wynik;
}

/** Budynki mieszkalne z mapy bez indeksów segmentów, w kolejności mapy: to samo co `budynkiZCzlonkami`, pole po polu. */
export function budynkiZGeo(geo: Geo, g: TabeleGminy | null, k: TabeleKraju): Budynek[] {
  return budynkiZCzlonkami(geo, g, k).map((x) => x.budynek);
}
