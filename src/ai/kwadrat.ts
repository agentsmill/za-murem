/* Gdzie staje osada AI: wybór kwadratu i świat osady, etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 2). Osada to druga, pełna gra na sąsiednim kwadracie miasta (src/world/kwadraty.ts): ma własny świat zbudowany
   zwykłym `buildWorld` z geo tego kwadratu przesuniętego tak, że jej siedziba wypada w środku świata (rozpoznanie
   docs/ocena/2026-10-19-osada-ai-rozpoznanie.md, „Pełny świat z siedzibą dla sąsiada”: osobna mapa z własnym obrotem, bez
   szwu z domem; sklejony z domem widok kwadratu to osobna sprawa, zadanie 5). Same czyste funkcje danych: bez sieci, zegara,
   DOM i losowania poza ziarnem; dane kwadratów podaje wołający (dema z public/demo, prawdziwy adres z kafelków).

   Reguła miejsca (Mateusz, 24.10.2026). Kandydaci to osiem kwadratów wokół domu w kolejności z ziarna gry (`kandydaciOsady`,
   Fisher–Yates z `rngOf`). Kwadrat spełnia regułę, gdy ma siedzibę, mieszkańców i jedzenie:
   - siedziba (`szukajSiedziby`): budynki mieszkalne kwadratu (te, które generator mieszkańców uznaje za bloki i domy:
     `budynkiZCzlonkami`, więc to samo co dostanie tag `zm:bud`) o środku w promieniu `PROMIEN_SIEDZIBY_M` (120 m) od środka
     kwadratu, malejąco po polu obrysu; dla kolejnych (najwyżej `PROBY_SIEDZIBY` = 4) geo przesuwa się tak, że punkt wewnątrz
     obrysu wypada w (0, 0), i buduje świat (siedzibą zostaje budynek najbliżej środka, nie zawsze ten sam, który wybrano);
     pierwszy, który ma co najmniej `MIN_POKOI_SIEDZIBY` (3) pokoje w całym wnętrzu, pokój w mieszkaniu zarządu i suche drzewo
     w świecie, wygrywa, i na nim kończą się próby. Dwa ostatnie warunki są dodatkiem do reguły z decyzji, żeby osada miała jak
     wystartować: bez pokoju zarządu `pokojZarzadu` (src/ai/miejsca.ts) daje −1 i silnik nie postawi kozy z beczki, a bez
     suchego drzewa (świat bez podwórka, Przymorze (1,0): podwórko 8 kafelków) nie ma pierwszego drewna i zarząd marznie od
     drugiej doby, w grze od dnia 13 do odwołania;
   - mieszkańcy: generator mieszkańców (`mieszkancyNowejGry`) daje wynik dla tej siedziby i jest w niej co najmniej
     `MIN_LOKATORZY_SIEDZIBY` osób poza zarządem (blok z lokatorami; dom z jednym mieszkaniem ich nie ma). Bez tabel
     mieszkańców (`dane` null) żaden kwadrat nie spełnia reguły, bo reguła ich wymaga;
   - jedzenie: w zasięgu `MAX_OKOLICA_M` (720 m) od siedziby co najmniej `PROG_JEDZENIA_OSADY` (300) porcji
     (`jedzenieWZasiegu`: zapas miejsca razy udział jedzenia w jego łupie, bez miejsc na mapie lokalnej, bo wyprawa tam nie
     idzie; to miara z raportu etapu 1: Przymorze 855, Lanciego 1167, Zielonki 17).
   Pierwszy kandydat, który spełnia całość, wygrywa (`wybierzOsade`); żaden: gra idzie bez osady. Powód odrzucenia jednego
   kwadratu to pierwszy z kolei: siedziba, jedzenie, mieszkańcy (jedzenie liczy się przed generatorem, bo jest tańsze).

   Etapy reguły (`szukajSiedziby`, `okolicaOsady`, `policzMieszkancow`) są osobnymi, eksportowanymi funkcjami: `swiatOsady`
   składa je po kolei i staje na pierwszym powodzie odrzucenia, a narzędzie `tools/osada-kwadraty.ts` składa te same etapy bez
   zatrzymywania się, żeby w tabeli pokazać wszystkie kolumny (pełny pomiar nie wchodzi do ścieżki produkcyjnej).

   Błędy nie są połykane. Wyjątek generatora mieszkańców albo budowy świata (uszkodzone geo) idzie do wołającego; zadanie 3
   łapie go w kroku osady i zapisuje „brak: blad”. Rzuca więc to, co jest błędem danych albo kodu, a „siedziba” w odrzuceniu
   znaczy zawsze, że kwadrat naprawdę nie ma dobrej siedziby (generator ostrzega w konsoli sam, gdy nie umie oznaczyć mapy).

   Układ domu (`Uklad`: adres i kąt obrotu domu) jest argumentem `swiatOsady` i `wybierzOsade`, bo środek kwadratu w geo
   (w metrach od adresu, bez obrotu) zależy od kąta domu (`srodekKwadratu`), a geo sąsiada tego kąta nie zna. Wołający ma go z
   `ukladDomu(geo, world)` albo `ukladZGeo(geo)`.

   Widok ich kwadratu (zadanie 5) buduje kwadrat obok domu z geo kwadratu SPRZED przesunięcia, a zapis trzyma tylko geo przesunięte:
   `przesuniecieOsady` odczytuje przesunięcie z `c` obu geo (`przesunGeo` przesuwa środek geograficznie o tyle samo co punkty, a `c`
   kwadratu to środek układu domu), `geoKwadratuOsady` oddaje z niego geo kwadratu punkt w punkt (współrzędne na siatce 0,5 m
   wracają co do wartości, minus zero jako zero), bez zmiany formatu zapisu.

   Geo osady (`SwiatOsady.geo`) to geo kwadratu przesunięte o punkt siedziby zaokrąglony do 0,5 m (zapis zostaje zwarty, a
   współrzędne na siatce, na której je podano), ze środkiem `c` przesuniętym geograficznie o tyle samo (generator
   mieszkańców liczy z `c` szerokość i długość budynków, a klucze miejsc są bezwzględne), bez tagów generatora. Zapis gry
   osady trzyma to geo i ziarno, a świat odtwarza `swiatZGeo` (tagi `zm:bud` i `buildWorld` z ziarnem `ziarnoOsady`), czyli
   tą samą drogą co `swiatOsady`. Stany mieszkań siedziby z generatora (`mieszkancyNowejGry`) świat dostaje przy wyborze, a
   przy wczytaniu zapisu `mieszkancyZapisu` ze stanu gry.

   Nazwa osady (`nazwaOsady`) to opis kierunku od domu do kwadratu (`kierunekOsady`, z numerów kwadratu w układzie świata
   gry, bez trygonometrii): „Osada na północy”, „z osady na północy”. Nazw ulic z OSM w niej nie ma i nie będzie: spec każe
   zmyślić nazwę osady, a zasada projektu zabrania prawdziwych nazw ulic w tekstach z generatora (src/mieszkancy/kronika.ts:
   ulice noszą nazwiska, także polityków, a filtr nie rozpozna odmienionej formy). Zmyślona nazwa osady to decyzja do
   przejrzenia w zadaniu 6. Strona świata jest taka, jaką widać na ekranie, gdzie siatka kwadratów leży wzdłuż ścian domu, a
   nie na geograficznej północy (tak samo gra mówi o dziurach w siatce: „od północy” w src/ui/siatka.ts to góra ekranu); kąt
   domu jest do 45° od północy, więc na mapie miasta (północ u góry) osada może wypaść o jedną stronę świata dalej. Obie formy
   nazwy są gotowymi zdaniami: `nazwa` („Osada na północy”) i `nazwaZ` („z osady na północy”). */

import { type Tx, tx } from '../core/jezyk.ts';
import { hashString, type RngState, rngOf } from '../core/rng.ts';
import { type Cel, celZMiejsca, MAX_OKOLICA_M } from '../gov/wyprawy.ts';
import { budynkiZCzlonkami, metryNaStopien } from '../mieszkancy/budynki.ts';
import { nazwaDoOkolicyZDanych } from '../mieszkancy/kronika.ts';
import {
  type Pierscienie,
  pierscienieBudynku,
  pole,
  ramka,
  srodek as srodekObrysu,
  wObrysie,
} from '../mieszkancy/obrys.ts';
import { TAG_BUDYNKU } from '../mieszkancy/oznacz.ts';
import type { DaneMieszkancow } from '../mieszkancy/wczytaj.ts';
import { dryTreeOf, houseOf } from '../sim/house.ts';
import type { LokatorzyGry } from '../sim/lokatorzy.ts';
import { ludnoscSpisu2021, mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../sim/osiedle.ts';
import type { Geo, Pt } from '../world/geo.ts';
import { kluczKwadratu, sasiedzi8, srodekKwadratu, type Uklad } from '../world/kwadraty.ts';
import { type Miejsce, miejscaZPoi, naMapieLokalnej, uzupelnijKlucze } from '../world/miasto.ts';
import { buildWorld, type World } from '../world/world.ts';
import type { OpcjeGryAi } from './gra.ts';

/** co najmniej tyle porcji jedzenia w zasięgu 720 m od siedziby osady (punkt wyjścia z raportu etapu 1: 855, 1167 i 17) */
export const PROG_JEDZENIA_OSADY = 300;
/** siedziba osady leży najdalej tyle metrów od środka kwadratu (środek budynku) */
export const PROMIEN_SIEDZIBY_M = 120;
/** tylu największych budynków mieszkalnych najwyżej sprawdza wybór siedziby (każdy to jedna budowa świata) */
export const PROBY_SIEDZIBY = 4;
/** siedziba ma mieć co najmniej tyle pokoi (pomieszczeń rodzaju „pokój” w całym wnętrzu) */
export const MIN_POKOI_SIEDZIBY = 3;
/** w siedzibie ma mieszkać co najmniej tyle osób poza zarządem (z generatora mieszkańców) */
export const MIN_LOKATORZY_SIEDZIBY = 1;
/** osoby zarządu osady */
export const ZARZAD_OSADY = 4;

// ---------------------------------------------------------------------------------------------------------------------
// Jedzenie w zasięgu, kolejność kandydatów, ziarno
// ---------------------------------------------------------------------------------------------------------------------

/** środek przedziału łupu (0 bez wpisu) */
const srodekLupu = (p: readonly [number, number] | undefined): number => (p ? (p[0] + p[1]) / 2 : 0);

/** Udział jedzenia w łupie miejsca: środek przedziału łupu jedzenia przez sumę środków wszystkich rodzajów łupu (0 bez łupu). */
function udzialJedzenia(lup: Cel['lup']): number {
  let suma = 0;
  for (const p of Object.values(lup)) suma += srodekLupu(p);
  return suma > 0 ? srodekLupu(lup.supplies) / suma : 0;
}

/** Porcje jedzenia w miejscach okolicy do `promien` metrów od siedziby (włącznie): zapas miejsca z celu wyprawy
    (`celZMiejsca`) razy udział jedzenia w jego łupie. Miejsca na mapie lokalnej (do 192 m) nie liczą się, bo wyprawa tam
    nie idzie (mapa lokalna ma własną mapę gry), tak jak w wyborze celów karty nocy i warstwie jedzenia silnika. Suma w
    kolejności `miejsca`, same mnożenia i dzielenia, więc wynik jest taki sam w każdym silniku JS. */
export function jedzenieWZasiegu(miejsca: readonly Miejsce[], promien: number = MAX_OKOLICA_M): number {
  let porcje = 0;
  for (const m of miejsca) {
    if (naMapieLokalnej(m) || m.odl > promien) continue;
    const cel = celZMiejsca(m);
    porcje += (cel.zapas ?? 0) * udzialJedzenia(cel.lup);
  }
  return porcje;
}

/** Osiem kwadratów wokół domu (0, 0) w kolejności z ziarna gry: Fisher–Yates z generatora zasianego skrótem ziarna (nigdy
    sort z losowym porównaniem, którego kolejność zależy od silnika JS). Ta sama liczba daje tę samą kolejność. */
export function kandydaciOsady(seed: number): [number, number][] {
  const st: RngState = { s: Number.parseInt(hashString(`osada-kolejnosc:${seed}`), 16) | 0 };
  const rng = rngOf(st);
  const a = sasiedzi8(0, 0);
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

/** Ziarno gry osady z ziarna naszej gry i kwadratu: skrót z prefiksem „osada” (liczba całkowita bez znaku), inny niż ziarno
    kwadratu (`seedKwadratu`), którym kwadrat obok domu sadzi drzewa i wraki. Jest też ziarnem świata osady. */
export function ziarnoOsady(seed: number, sx: number, sy: number): number {
  return Number.parseInt(hashString(`osada:${seed}:${sx}:${sy}`), 16);
}

// ---------------------------------------------------------------------------------------------------------------------
// Przesunięcie geo i kandydaci na siedzibę
// ---------------------------------------------------------------------------------------------------------------------

/** Kopia geo, w której początek układu leży w punkcie (dx, dy) starego układu (metry: x na wschód, y na południe): każdy
    punkt budynków (obrysy i części), dróg, terenów, wód, przejść, miejsc i rodzajów punktów traci (dx, dy), a środek geo `c`
    przesuwa się geograficznie o tyle samo (przeliczenie metrów na stopnie jak w generatorze mieszkańców, `metryNaStopien`),
    więc bezwzględne położenia i klucze miejsc zostają. Przesunięcie o wielokrotność 0,5 m zostawia współrzędne na siatce
    0,5 m. Wejście zostaje nietknięte; tagi i pozostałe pola bez zmian. */
export function przesunGeo(geo: Geo, dx: number, dy: number): Geo {
  const pt = ([x, y]: Pt): Pt => [x - dx, y - dy];
  const linia = (l: readonly Pt[]): Pt[] => l.map(pt);
  const { kx, ky } = metryNaStopien(geo.c[0]);
  return {
    ...geo,
    c: [geo.c[0] - dy / ky, geo.c[1] + dx / kx],
    b: geo.b.map((b) => ({ ...b, p: linia(b.p), ...(b.pp ? { pp: b.pp.map(linia) } : {}) })),
    r: geo.r.map((r) => ({ ...r, l: linia(r.l) })),
    a: geo.a.map((a) => ({ ...a, p: linia(a.p) })),
    w: geo.w.map((w) => ({ ...w, l: linia(w.l) })),
    poi: geo.poi.map((p) => ({ ...p, x: p.x - dx, y: p.y - dy })),
    ...(geo.rodzaje ? { rodzaje: geo.rodzaje.map((p) => ({ ...p, x: p.x - dx, y: p.y - dy })) } : {}),
    ...(geo.pass ? { pass: geo.pass.map((r) => ({ ...r, l: linia(r.l) })) } : {}),
  };
}

const naPolmetry = (v: number): number => Math.round(v * 2) / 2;

/** bez minus zera (wyniki trafiają do porównań) */
const nz = (v: number): number => (v === 0 ? 0 : v);

/** Przesunięcie, o które `przesunGeo` przesunęło geo kwadratu do siedziby (punkt siedziby w metrach od adresu w układzie geo, bez
    obrotu, na siatce 0,5 m): wynika z `c`, bo `przesunGeo` przesuwa geograficznie środek geo o tyle samo co punkty, a `c` geo
    kwadratu to środek układu domu (`uklad.c`, `geoKwadratu` i dema liczą je od adresu). Tak zapis osady, który trzyma tylko geo
    już przesunięte, oddaje przesunięcie bez zmiany formatu. Odwrotność: `przesunGeo(geoKwadratu, ...przesuniecieOsady(...))`. */
export function przesuniecieOsady(geoOsady: Pick<Geo, 'c'>, uklad: Pick<Uklad, 'c'>): Pt {
  const { kx, ky } = metryNaStopien(uklad.c[0]);
  return [nz(naPolmetry((geoOsady.c[1] - uklad.c[1]) * kx)), nz(naPolmetry((uklad.c[0] - geoOsady.c[0]) * ky))];
}

/** Geo kwadratu osady SPRZED przesunięcia do siedziby (metry od adresu w układzie domu, bez obrotu, `c` układu domu): to, z czego
    widok buduje jej kwadrat obok domu (`buildKwadrat`, jak kwadrat z `?kwadraty=`), a zapis osady go nie trzyma (ma geo
    przesunięte, `SwiatOsady.geo`). Odwrotność `przesunGeo` o `przesuniecieOsady`: współrzędne na siatce 0,5 m wracają co do wartości
    (minus zero jako zero).
    Klucze miejsc dopisane do geo osady przy wyborze zostają. Wejście zostaje nietknięte. */
export function geoKwadratuOsady(geoOsady: Geo, uklad: Pick<Uklad, 'c'>): Geo {
  const [dx, dy] = przesuniecieOsady(geoOsady, uklad);
  return { ...przesunGeo(geoOsady, -dx, -dy), c: [uklad.c[0], uklad.c[1]] };
}

/** Punkt na siatce 0,5 m wewnątrz obrysu (w którymkolwiek pierścieniu), najbliżej `cel` (pierwszy w kolejności x, y przy
    remisie): zaokrąglony środek, jeśli leży w obrysie, inaczej najbliższy punkt siatki w ramce obrysu. null, gdy obrys nie ma
    żadnego (zdegenerowany). */
function punktWewnatrz(p: Pierscienie, cel: Pt): Pt | null {
  const [zx, zy] = [naPolmetry(cel[0]), naPolmetry(cel[1])];
  if (wObrysie(zx, zy, p)) return [zx, zy];
  const r = ramka(p);
  let najlepszy: Pt | null = null;
  let odl = Number.POSITIVE_INFINITY;
  for (let x = Math.ceil(r.x0 * 2) / 2; x <= r.x1; x += 0.5)
    for (let y = Math.ceil(r.y0 * 2) / 2; y <= r.y1; y += 0.5) {
      const d = (x - cel[0]) * (x - cel[0]) + (y - cel[1]) * (y - cel[1]);
      if (d < odl && wObrysie(x, y, p)) {
        odl = d;
        najlepszy = [x, y];
      }
    }
  return najlepszy;
}

/** Kandydat na siedzibę: budynek mieszkalny geo kwadratu. */
export interface KandydatSiedziby {
  /** numer budynku w `geo.b` */
  indeks: number;
  /** pole obrysu w m² (obrys i części), jak `WorldBuilding.area` bez minimum z kafelków */
  pole: number;
  /** odległość środka obrysu od środka kwadratu w metrach */
  odl: number;
  /** punkt wewnątrz obrysu na siatce 0,5 m, który po przesunięciu geo wypada w środku świata */
  punkt: Pt;
}

/** Budynki mieszkalne geo (bloki i domy według generatora mieszkańców: ten sam zbiór, który dostaje tag `zm:bud`) o środku
    obrysu najdalej `PROMIEN_SIEDZIBY_M` od `srodek` (metry od adresu, układ geo), malejąco po polu, przy remisie bliższy
    środkowi, potem niższy numer. Budynek bez punktu wewnątrz obrysu odpada. `dane` tylko przez tabele gminy i kraju.
    Geometria (pole, środek ciężkości, ramka, punkt w obrysie) z src/mieszkancy/obrys.ts, tak jak w generatorze. */
export function kandydaciSiedziby(
  geo: Geo,
  srodek: Pt,
  dane: Pick<DaneMieszkancow, 'gmina' | 'kraj'>,
): KandydatSiedziby[] {
  const out: KandydatSiedziby[] = [];
  for (const { czlonkowie } of budynkiZCzlonkami(geo, dane.gmina, dane.kraj)) {
    for (const indeks of czlonkowie) {
      const obrys = pierscienieBudynku(geo.b[indeks]);
      const c = srodekObrysu(obrys);
      const odl = Math.sqrt((c[0] - srodek[0]) * (c[0] - srodek[0]) + (c[1] - srodek[1]) * (c[1] - srodek[1]));
      if (!(odl <= PROMIEN_SIEDZIBY_M)) continue;
      const punkt = punktWewnatrz(obrys, c);
      if (!punkt) continue;
      out.push({ indeks, pole: pole(obrys), odl, punkt });
    }
  }
  return out.sort((a, b) => b.pole - a.pole || a.odl - b.odl || a.indeks - b.indeks);
}

// ---------------------------------------------------------------------------------------------------------------------
// Kierunek i nazwa
// ---------------------------------------------------------------------------------------------------------------------

/** strona świata: kierunek („na północ”), miejscownik („na północy”) i angielskie „to the north” */
const STRONY: Record<string, readonly [string, string, string]> = {
  N: ['na północ', 'na północy', 'to the north'],
  NE: ['na północny wschód', 'na północnym wschodzie', 'to the north-east'],
  E: ['na wschód', 'na wschodzie', 'to the east'],
  SE: ['na południowy wschód', 'na południowym wschodzie', 'to the south-east'],
  S: ['na południe', 'na południu', 'to the south'],
  SW: ['na południowy zachód', 'na południowym zachodzie', 'to the south-west'],
  W: ['na zachód', 'na zachodzie', 'to the west'],
  NW: ['na północny zachód', 'na północnym zachodzie', 'to the north-west'],
};

/** Strona świata od domu do kwadratu (sx, sy) w układzie świata gry (y rośnie na południe): „na północ” dla (0, −1), przekątne
    dla ośmiu sąsiadów, a dalej przewaga jednej osi co najmniej dwa razy wybiera stronę prostą, inaczej przekątną. Bez
    trygonometrii. Dom (0, 0) nie ma strony („tutaj”). `miejscownik` to forma do nazwy („Osada na północy”). */
export function kierunekOsady(sx: number, sy: number): { kierunek: Tx; miejscownik: Tx } {
  if (sx === 0 && sy === 0) {
    const tutaj = tx('tutaj', 'here');
    return { kierunek: tutaj, miejscownik: tutaj };
  }
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  const ns = sy < 0 ? 'N' : 'S';
  const ew = sx > 0 ? 'E' : 'W';
  const strona = ax === 0 || ax * 2 <= ay ? ns : ay === 0 || ay * 2 <= ax ? ew : ns + ew;
  const [kierunek, miejscownik, en] = STRONY[strona];
  return { kierunek: tx(kierunek, en), miejscownik: tx(miejscownik, en) };
}

/** Nazwa osady i forma „z osady …” w obu językach, tylko z kierunku od domu do kwadratu: „Osada na północy” / “Settlement to
    the north” i „z osady na północy” / “from the settlement to the north”. Bez nazw ulic (nagłówek modułu). */
export function nazwaOsady(sx: number, sy: number): { nazwa: Tx; nazwaZ: Tx } {
  const { miejscownik } = kierunekOsady(sx, sy);
  return {
    nazwa: tx(`Osada ${miejscownik.pl}`, `Settlement ${miejscownik.en}`),
    nazwaZ: tx(`z osady ${miejscownik.pl}`, `from the settlement ${miejscownik.en}`),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Świat osady
// ---------------------------------------------------------------------------------------------------------------------

/** Świat z geo: tagi `zm:bud` generatora mieszkańców (`mapaMieszkancow`; bez tabel to samo geo) i `buildWorld` z ziarnem gry
    osady. Droga wspólna dla wyboru osady i wczytania zapisu: zapis trzyma geo (bez tagów) i ziarno, a świat wychodzi taki
    sam. Zwraca też geo z tagami (dla generatora, który czyta tagi). `buildWorld` rzuca, gdy w geo nie ma budynku. */
export function swiatZGeo(geo: Geo, ziarno: number, dane: DaneMieszkancow | null): { geo: Geo; world: World } {
  const oznaczone = mapaMieszkancow(geo, dane);
  return { geo: oznaczone, world: buildWorld(oznaczone, { seed: ziarno }) };
}

/** Pomiar kwadratu z reguły miejsca (do tabeli narzędzia i do zapisu powodu odrzucenia). */
export interface PomiarKwadratu {
  /** ile budynków mieszkalnych leży w promieniu wyboru siedziby */
  kandydatow: number;
  /** ile światów zbudowano przy szukaniu siedziby (najwyżej `PROBY_SIEDZIBY`) */
  proby: number;
  /** pole obrysu siedziby w m² (0: żadnej próby) */
  pole: number;
  /** pokoje całego wnętrza siedziby */
  pokoje: number;
  /** pokoje w mieszkaniu zarządu */
  pokojeZarzadu: number;
  /** osoby siedziby z generatora (zarząd i lokatorzy); null: nie liczono (odrzucenie przed generatorem) */
  osoby: number | null;
  /** osoby poza zarządem (lokatorzy); null: nie liczono */
  lokatorzy: number | null;
  /** porcje jedzenia w zasięgu 720 m od siedziby; null: nie liczono */
  jedzenie: number | null;
}

export type PowodOdrzucenia = 'siedziba' | 'mieszkancy' | 'jedzenie';

/** Kwadrat, który nie spełnia reguły: pierwszy powód (siedziba, jedzenie, mieszkańcy) i to, co zdążono zmierzyć. */
export interface OdrzucenieOsady {
  odrzucony: PowodOdrzucenia;
  pomiar: PomiarKwadratu;
}

export interface SwiatOsady {
  /** klucz kwadratu „sx,sy” */
  klucz: string;
  sx: number;
  sy: number;
  /** geo kwadratu przesunięte tak, że siedziba wypada w środku świata; bez tagów generatora (to geo idzie do zapisu) */
  geo: Geo;
  /** świat osady, ze stanami mieszkań siedziby z generatora */
  world: World;
  /** opcje gry osady: cztery osoby zarządu, obcy, mieszkańcy z generatora, okolica i ludność 2021 z jej kwadratu, tempo
      przeglądarki, bez łańcuchów kart, odpowiedź na każde okno zarządu */
  opcje: OpcjeGryAi;
  /** nazwa osady do kart i mapy: „Osada na północy” (z kierunku od domu) */
  nazwa: Tx;
  /** forma „z osady …” do zdań („Poseł z osady na północy”) */
  nazwaZ: Tx;
  /** kierunek od domu do kwadratu: „na północ”, „to the north” */
  kierunek: Tx;
  /** porcje jedzenia w zasięgu 720 m od siedziby */
  jedzenie: number;
  pomiar: PomiarKwadratu;
}

/** Siedziba świata: pole obrysu, pokoje całego wnętrza, pokoje mieszkania zarządu, to, czy generator mieszkańców zna ten
    budynek (ma tag `zm:bud`, czyli jest blokiem albo domem według niego), i to, czy świat ma suche drzewo (pierwsze drewno). */
export interface OpisSiedziby {
  pole: number;
  pokoje: number;
  pokojeZarzadu: number;
  mieszkalna: boolean;
  sucheDrzewo: boolean;
}

/** Opis siedziby świata (`World.hq`); świat bez wnętrza albo siedziby to same zera. Suche drzewo liczy się tak jak w silniku
    (`dryTreeOf`: numer w granicach drzew świata). */
export function opiszSiedzibe(w: World): OpisSiedziby {
  const h = houseOf(w);
  if (!h || w.hq < 0) return { pole: 0, pokoje: 0, pokojeZarzadu: 0, mieszkalna: false, sucheDrzewo: false };
  const hq = w.buildings[w.hq];
  const pokoje = h.rooms.filter((r) => r.kind === 'pokoj');
  return {
    pole: hq.area,
    pokoje: pokoje.length,
    pokojeZarzadu: pokoje.filter((r) => r.apt === h.home).length,
    mieszkalna: TAG_BUDYNKU in hq.tags,
    sucheDrzewo: dryTreeOf(w) >= 0,
  };
}

/** Czy siedziba spełnia regułę: budynek mieszkalny według generatora, co najmniej `MIN_POKOI_SIEDZIBY` pokoi w całym wnętrzu,
    pokój w mieszkaniu zarządu i suche drzewo w świecie (z niego idzie pierwsze drewno). */
export const siedzibaWystarcza = (s: OpisSiedziby): boolean =>
  s.mieszkalna && s.pokoje >= MIN_POKOI_SIEDZIBY && s.pokojeZarzadu >= 1 && s.sucheDrzewo;

/** Zwycięska próba szukania siedziby. */
export interface WygranaSiedziba {
  /** geo kwadratu przesunięte do siedziby, bez tagów generatora (to geo idzie do zapisu) */
  geo: Geo;
  /** to samo geo z tagami `zm:bud` (czyta je generator mieszkańców) */
  oznaczone: Geo;
  /** świat bez stanów mieszkań z generatora (te dokłada `mieszkancyNowejGry`) */
  world: World;
  opis: OpisSiedziby;
}

/** Wynik szukania siedziby w kwadracie. */
export interface SzukanieSiedziby {
  /** ile budynków mieszkalnych leży w promieniu wyboru siedziby */
  kandydatow: number;
  /** ile światów zbudowano (najwyżej `PROBY_SIEDZIBY`) */
  proby: number;
  /** opis wygranej próby, a bez wygranej najlepszej (najwięcej pokoi, przy remisie wcześniejszej); null bez prób */
  opis: OpisSiedziby | null;
  /** wygrana próba albo null (kwadrat bez siedziby) */
  siedziba: WygranaSiedziba | null;
  /** geo przesunięte do pierwszego kandydata (do pomiaru jedzenia w kwadracie bez siedziby); null bez kandydatów */
  pierwszaPrzesunieta: Geo | null;
}

/** Szukanie siedziby w kwadracie: do `PROBY_SIEDZIBY` największych budynków mieszkalnych (`kandydaciSiedziby`) po kolei, dla
    każdego geo przesunięte do jego punktu, świat z ziarnem `ziarno` (`swiatZGeo`) i `siedzibaWystarcza`; pierwszy, który
    spełnia, wygrywa i kończy próby. Wyjątki generatora i `buildWorld` idą do wołającego. `srodek` to środek kwadratu w geo
    (`srodekKwadratu`). Nie zmienia wejścia. */
export function szukajSiedziby(geoKwadratu: Geo, srodek: Pt, dane: DaneMieszkancow, ziarno: number): SzukanieSiedziby {
  const kandydaci = kandydaciSiedziby(geoKwadratu, srodek, dane);
  const wynik: SzukanieSiedziby = {
    kandydatow: kandydaci.length,
    proby: 0,
    opis: null,
    siedziba: null,
    pierwszaPrzesunieta: null,
  };
  for (const k of kandydaci.slice(0, PROBY_SIEDZIBY)) {
    const przesunieta = przesunGeo(geoKwadratu, k.punkt[0], k.punkt[1]);
    uzupelnijKlucze(przesunieta);
    wynik.pierwszaPrzesunieta ??= przesunieta;
    wynik.proby++;
    const z = swiatZGeo(przesunieta, ziarno, dane);
    const opis = opiszSiedzibe(z.world);
    if (siedzibaWystarcza(opis)) {
      wynik.opis = opis;
      wynik.siedziba = { geo: przesunieta, oznaczone: z.geo, world: z.world, opis };
      break;
    }
    if (!wynik.opis || opis.pokoje > wynik.opis.pokoje) wynik.opis = opis;
  }
  return wynik;
}

/** Pomiar z wyniku szukania siedziby: kandydaci, próby, pole i pokoje; osoby, lokatorzy i jedzenie jeszcze nie policzone
    (null). Bez szukania (null, np. bez tabel mieszkańców) same zera. Nowy obiekt przy każdym wywołaniu. */
export function pomiarSiedziby(s: SzukanieSiedziby | null): PomiarKwadratu {
  return {
    kandydatow: s?.kandydatow ?? 0,
    proby: s?.proby ?? 0,
    pole: s?.opis?.pole ?? 0,
    pokoje: s?.opis?.pokoje ?? 0,
    pokojeZarzadu: s?.opis?.pokojeZarzadu ?? 0,
    osoby: null,
    lokatorzy: null,
    jedzenie: null,
  };
}

/** Miejsca okolicy osady z geo przesuniętego do jej siedziby (odległości od siedziby), z nazwami przez filtr z
    `nazwaDoOkolicyZDanych` (RODO: bez tabel gminy same kategorie). */
export function okolicaOsady(geoPrzesuniete: Geo, dane: DaneMieszkancow): Miejsce[] {
  return miejscaZPoi(geoPrzesuniete.poi, nazwaDoOkolicyZDanych(dane));
}

/** Osoby siedziby z wyniku generatora: zarząd i lokatorzy razem oraz sami lokatorzy (osoby w mieszkaniach poza zarządem);
    bez wyniku generatora (null) obie liczby null. */
export function policzMieszkancow(l: LokatorzyGry | null): { osoby: number | null; lokatorzy: number | null } {
  if (!l) return { osoby: null, lokatorzy: null };
  const lokatorzy = l.lokatorzy.reduce((a, m) => a + m.osoby.length, 0);
  return { osoby: l.zarzad.length + lokatorzy, lokatorzy };
}

/** Świat osady dla jednego kandydata albo powód odrzucenia (siedziba, jedzenie, mieszkańcy: pierwszy z kolei). `geoKwadratu`
    to geo kwadratu (sx, sy) w układzie domu (metry od adresu, bez obrotu: dema `*-kwadraty.json`, `geoKwadratu` z
    kafelków), `uklad` to układ domu, `seed` ziarno naszej gry. Siedziba (`szukajSiedziby`): do `PROBY_SIEDZIBY` największych
    budynków mieszkalnych w `PROMIEN_SIEDZIBY_M` od środka kwadratu, pierwszy z `MIN_POKOI_SIEDZIBY` pokojami, pokojem zarządu
    i suchym drzewem w świecie wygrywa. Potem jedzenie w zasięgu (`PROG_JEDZENIA_OSADY`), potem lokatorzy z generatora;
    na pierwszym powodzie funkcja staje, a `pomiar` ma to, co do tej pory policzono. `dane` null: odrzucone od razu jako
    „mieszkancy”. Dla (0, 0) kandydatem jest sam dom (reguła miejsca dla jego geo, do oceny dema). Wyjątki generatora i
    `buildWorld` nie są łapane. Nie zmienia wejścia. */
export function swiatOsady(
  geoKwadratu: Geo,
  sx: number,
  sy: number,
  dane: DaneMieszkancow | null,
  seed: number,
  uklad: Uklad,
): SwiatOsady | OdrzucenieOsady {
  if (!dane) return { odrzucony: 'mieszkancy', pomiar: pomiarSiedziby(null) };
  const szukanie = szukajSiedziby(geoKwadratu, srodekKwadratu(uklad, sx, sy), dane, ziarnoOsady(seed, sx, sy));
  const pomiar = pomiarSiedziby(szukanie);
  const siedziba = szukanie.siedziba;
  if (!siedziba) return { odrzucony: 'siedziba', pomiar };

  // jedzenie w zasięgu 720 m od siedziby
  const okolica = okolicaOsady(siedziba.geo, dane);
  pomiar.jedzenie = jedzenieWZasiegu(okolica);
  if (pomiar.jedzenie < PROG_JEDZENIA_OSADY) return { odrzucony: 'jedzenie', pomiar };

  // mieszkańcy z generatora w siedzibie (stany mieszkań idą od razu na świat)
  const l = mieszkancyNowejGry(siedziba.world, siedziba.oznaczone, dane, ZARZAD_OSADY);
  Object.assign(pomiar, policzMieszkancow(l));
  if (!l || (pomiar.lokatorzy ?? 0) < MIN_LOKATORZY_SIEDZIBY) return { odrzucony: 'mieszkancy', pomiar };

  const { nazwa, nazwaZ } = nazwaOsady(sx, sy);
  const ludnosc = ludnoscSpisu2021(siedziba.oznaczone, dane);
  const opcjeGry: OpcjeGryAi = {
    core: ZARZAD_OSADY,
    obcy: true,
    mieszkancy: opcjaMieszkancow(l),
    okolica,
    ...(ludnosc !== undefined ? { ludnosc2021: ludnosc } : {}),
    tempoPrzegladarki: true,
    lancuchy: false,
    odpowiedzNaNieznane: true,
  };
  return {
    klucz: kluczKwadratu(sx, sy),
    sx,
    sy,
    geo: siedziba.geo,
    world: siedziba.world,
    opcje: opcjeGry,
    nazwa,
    nazwaZ,
    kierunek: kierunekOsady(sx, sy).kierunek,
    jedzenie: pomiar.jedzenie,
    pomiar,
  };
}

/** Pierwszy kandydat w kolejności z ziarna gry (`kandydaciOsady`), który spełnia regułę miejsca, albo null (gra bez osady).
    `kandydaci` to geo kwadratów po kluczu „sx,sy”; kwadrat bez geo jest pomijany (dema mają osiem sąsiadów, Lanciego cztery
    boczne, prawdziwy adres tylko te, które się pobrały), więc wołający wybiera, kiedy dane są kompletne. Bez tabel mieszkańców
    (`dane` null) null od razu. Wyjątek z jednego kwadratu (uszkodzone geo) przerywa wybór i idzie do wołającego. */
export function wybierzOsade(
  seed: number,
  kandydaci: Readonly<Record<string, Geo>>,
  dane: DaneMieszkancow | null,
  uklad: Uklad,
): SwiatOsady | null {
  if (!dane) return null;
  for (const [sx, sy] of kandydaciOsady(seed)) {
    const geo = kandydaci[kluczKwadratu(sx, sy)];
    if (!geo) continue;
    const r = swiatOsady(geo, sx, sy, dane, seed, uklad);
    if (!('odrzucony' in r)) return r;
  }
  return null;
}
