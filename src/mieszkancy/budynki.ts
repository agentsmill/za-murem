/* Budynki dla generatora mieszkańców: z mapy (`Geo`) do listy budynków mieszkalnych z rejonem, typem, wymiarami,
   klatkami, epoką budowy i liczbą mieszkań. Bez trygonometrii poza jednym miejscem (przeliczenie metrów na stopnie),
   bez pierwiastków poza `Math.sqrt` w obrys.ts, więc wynik jest taki sam w każdej przeglądarce i w Node. Losowanie
   idzie z ziaren po kluczu budynku (`losDla`), więc nie zależy od kolejności budynków ani od tego, który adres
   w okolicy wpisał gracz. */

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
const WAGI_KRAJOWE: Record<Epoka, number> = {
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

/** Epoka budynku, w kolejności: `startDate`; wielka płyta z wymiarów (blok 10-12 kondygnacji i szerokość do 14,5 m;
    blok 5 kondygnacji, ta szerokość i długość co najmniej 3 razy większa; w próbce z OSM precyzja 24 na 24 i 0,95
    dla lat 1945-1989, bierzemy `plyta` jako częstszą); reszta losowana z mieszkań gminy według epok (P4386)
    z ziarnem po kluczu budynku. Wagi to sumy epok, nie „ogółem” z GUS: mieszkania o nieznanym okresie budowy
    (około 2%) nie należą do żadnej epoki. Gmina bez tabeli albo z samymi zerami: wagi krajowe. */
export function epokaBudynku(b: Budynek, g: TabeleGminy | null): Epoka {
  if (b.startDate !== undefined) return epokaZRoku(b.startDate);
  if (b.typ === 'blok' && b.szerokosc <= MAX_SZEROKOSC_PLYTY) {
    if (b.kondygnacje >= 10 && b.kondygnacje <= 12) return 'plyta';
    if (b.kondygnacje === 5 && b.dlugosc >= 3 * b.szerokosc) return 'plyta';
  }
  const wagi = g ? EPOKI.map((e) => g.epoki[e].mieszkania) : [];
  let i = wazony(losDla('epoka', b.klucz), wagi); // brak tabeli albo same zera: -1, bez losowania
  if (i < 0) i = wazony(losDla('epoka', b.klucz), WAGI_KRAJOWE_TAB);
  return EPOKI[i];
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

interface Obiekt {
  /** Numer w `geo.b`. */
  i: number;
  b: GeoBuilding;
  ob: Pierscienie;
  ramka: Ramka;
  pole: number;
}
interface Segment extends Obiekt {
  typ: 'dom' | 'blok';
  /** Kondygnacje z tagu albo zgadnięte jak w grze (`levelsOf`). */
  poziomy: number;
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
    if (p >= MIN_POLE) obiekty.push({ i, b, ob, ramka: ramka(ob), pole: p });
  });
  const kat = kategorie(geo, obiekty);
  const wynik: Segment[] = [];
  for (const o of obiekty) {
    const cls = classify(o.b, o.pole, kat.get(o.i) ?? []);
    if (cls === 'blok' || cls === 'dom') wynik.push({ ...o, typ: cls, poziomy: levelsOf(o.b, cls, o.pole) });
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

/** Klatki bloku: tyle, ile sklejonych segmentów, a pojedynczy obrys ma jedną klatkę na każde 20 m długości. */
const klatkiBloku = (segmenty: number, dlugosc: number): number =>
  segmenty > 1 ? segmenty : Math.max(1, Math.round(dlugosc / DLUGOSC_KLATKI));

/** Segment o największym polu spośród tych, które spełniają warunek (remis: wcześniejszy na mapie). */
function najwiekszy(s: readonly Segment[], ma: (x: Segment) => boolean): Segment | undefined {
  let wynik: Segment | undefined;
  for (const x of s) {
    if (ma(x) && (!wynik || x.pole > wynik.pole)) wynik = x;
  }
  return wynik;
}

/** Budynki mieszkalne (bloki i domy) z mapy, w kolejności mapy. `g` to tabele gminy (albo `null` bez nich), `k`
    tabele krajowe (udział gospodarstw trzypokoleniowych). Każdy budynek ma rejon środka obrysu, wymiary najmniejszego
    obróconego prostokąta, klatki, epokę i liczbę mieszkań. Segmenty bloków jednej wysokości, które się stykają albo
    są bliżej niż metr, tworzą jeden budynek (klatki = liczba segmentów); pojedynczy blok ma `max(1, round(długość /
    20))` klatek, a dom jedną. Klucz to `osm:<id>`, gdy mapa niesie tag `id` (największy segment), inaczej
    `g:<szerokość>,<długość>,<pole>` ze środka obrysu w stopniach z 5 miejscami, więc nie zależy od adresu gracza. */
export function budynkiZGeo(geo: Geo, g: TabeleGminy | null, k: TabeleKraju): Budynek[] {
  const segmenty = segmentyMieszkalne(geo);
  const korzenie = grupy(segmenty.length, parySasiadow(segmenty));
  const [lat0, lon0] = geo.c;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;

  // grupy w kolejności mapy: pierwszy członek to najmniejsza pozycja
  const czlonkowie = new Map<number, Segment[]>();
  segmenty.forEach((s, pozycja) => {
    const lista = czlonkowie.get(korzenie[pozycja]) ?? [];
    lista.push(s);
    czlonkowie.set(korzenie[pozycja], lista);
  });

  const wynik: Budynek[] = [];
  const uzyte = new Set<string>();
  for (const grupa of czlonkowie.values()) {
    const ob: Pierscienie = grupa.flatMap((s) => s.ob);
    const sumaPol = grupa.reduce((suma, s) => suma + s.pole, 0);
    const [cx, cy] = srodek(ob);
    const lat = zaokr5(lat0 - cy / ky);
    const lon = zaokr5(lon0 + cx / kx);
    const wymiary = najmniejszyProstokat(ob);
    const typ = grupa[0].typ;
    const poleBudynku = Math.round(sumaPol);

    const zId = najwiekszy(grupa, (s) => Boolean(s.b.t.id));
    const podstawa = zId ? `osm:${zId.b.t.id}` : `g:${lat.toFixed(5)},${lon.toFixed(5)},${poleBudynku}`;
    let klucz = podstawa;
    for (let n = 2; uzyte.has(klucz); n++) klucz = `${podstawa}#${n}`;
    uzyte.add(klucz);

    const zDaty = najwiekszy(grupa, (s) => rokZDaty(s.b.t.start_date ?? '') !== undefined);
    const rok = zDaty ? rokZDaty(zDaty.b.t.start_date ?? '') : undefined;
    const budynek: Budynek = {
      klucz,
      lat,
      lon,
      rejon: g ? rejonDla(g, lat, lon).rejon : '',
      typ,
      kondygnacje: Math.max(1, Math.round(grupa.reduce((suma, s) => suma + s.pole * s.poziomy, 0) / sumaPol)),
      pole: poleBudynku,
      szerokosc: wymiary.szerokosc,
      dlugosc: wymiary.dlugosc,
      klatki: typ === 'dom' ? 1 : klatkiBloku(grupa.length, wymiary.dlugosc),
    };
    if (rok !== undefined) budynek.startDate = rok;
    budynek.epoka = epokaBudynku(budynek, g);
    budynek.mieszkania = mieszkaniaBudynku(budynek, g, k);
    wynik.push(budynek);
  }
  return wynik;
}
