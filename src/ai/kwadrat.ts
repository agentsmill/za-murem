/* Gdzie staje osada AI: wybór kwadratu i świat osady, etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 2). Osada to druga, pełna gra na sąsiednim kwadracie miasta (src/world/kwadraty.ts): ma własny świat zbudowany
   zwykłym `buildWorld` z geo tego kwadratu przesuniętego tak, że jej siedziba wypada w środku świata (rozpoznanie
   docs/ocena/2026-10-19-osada-ai-rozpoznanie.md, „Pełny świat z siedzibą dla sąsiada”: osobna mapa z własnym obrotem, bez
   szwu z domem; sklejony z domem widok kwadratu to osobna sprawa, zadanie 5). Same czyste funkcje danych: bez sieci, zegara,
   DOM i losowania poza ziarnem; dane kwadratów podaje wołający (dema z public/demo, prawdziwy adres z kafelków).

   Reguła miejsca (Mateusz, 24.10.2026). Kandydaci to osiem kwadratów wokół domu w kolejności z ziarna gry (`kandydaciOsady`,
   Fisher–Yates z `rngOf`). Kwadrat spełnia regułę, gdy ma siedzibę, mieszkańców i jedzenie:
   - siedziba: budynki mieszkalne kwadratu (te, które generator mieszkańców uznaje za bloki i domy: `budynkiZCzlonkami`, więc
     to samo co dostanie tag `zm:bud`) o środku w promieniu `PROMIEN_SIEDZIBY_M` (120 m) od środka kwadratu, malejąco po polu
     obrysu; dla kolejnych (najwyżej `PROBY_SIEDZIBY` = 4) geo przesuwa się tak, że punkt wewnątrz obrysu wypada w (0, 0), i
     buduje świat (siedzibą zostaje budynek najbliżej środka, nie zawsze ten sam, który wybrano); pierwszy, który ma co najmniej
     `MIN_POKOI_SIEDZIBY` (3) pokoje w całym wnętrzu, pokój w mieszkaniu zarządu i suche drzewo w świecie, wygrywa, i na nim kończą się
     próby. Dwa ostatnie warunki są dodatkiem do reguły z decyzji, żeby osada miała jak wystartować: bez pokoju zarządu
     `pokojZarzadu` (src/ai/miejsca.ts) daje −1 i silnik nie postawi kozy z beczki, a bez suchego drzewa (świat bez podwórka,
     Przymorze (1,0): podwórko 8 kafelków) nie ma pierwszego drewna i zarząd marznie od drugiej doby, w grze od dnia 13 do odwołania;
   - mieszkańcy: generator mieszkańców (`mieszkancyNowejGry`) daje wynik dla tej siedziby i jest w niej co najmniej
     `MIN_LOKATORZY_SIEDZIBY` osób poza zarządem (blok z lokatorami; dom z jednym mieszkaniem ich nie ma). Bez tabel
     mieszkańców (`dane` null) żaden kwadrat nie spełnia reguły, bo reguła ich wymaga;
   - jedzenie: w zasięgu `MAX_OKOLICA_M` (720 m) od siedziby co najmniej `PROG_JEDZENIA_OSADY` (300) porcji
     (`jedzenieWZasiegu`: zapas miejsca razy udział jedzenia w jego łupie, bez miejsc na mapie lokalnej, bo wyprawa tam nie
     idzie; to miara z raportu etapu 1: Przymorze 855, Lanciego 1167, Zielonki 17).
   Pierwszy kandydat, który spełnia całość, wygrywa (`wybierzOsade`); żaden: gra idzie bez osady. Powód odrzucenia jednego
   kwadratu to pierwszy z kolei: siedziba, jedzenie, mieszkańcy (jedzenie liczy się przed generatorem, bo jest tańsze).

   Układ domu (`Uklad`: adres i kąt obrotu domu) jest argumentem `swiatOsady` i `wybierzOsade`, bo środek kwadratu w geo
   (w metrach od adresu, bez obrotu) zależy od kąta domu (`srodekKwadratu`), a geo sąsiada tego kąta nie zna. Wołający ma go z
   `ukladDomu(geo, world)` albo `ukladZGeo(geo)`.

   Geo osady (`SwiatOsady.geo`) to geo kwadratu przesunięte o punkt siedziby zaokrąglony do 0,5 m (zapis zostaje zwarty, a
   współrzędne na siatce, na której je podano), ze środkiem `c` przesuniętym geograficznie o tyle samo (generator
   mieszkańców liczy z `c` szerokość i długość budynków, a klucze miejsc są bezwzględne), bez tagów generatora. Zapis gry
   osady trzyma to geo i ziarno, a świat odtwarza `swiatZGeo` (tagi `zm:bud` i `buildWorld` z ziarnem `ziarnoOsady`), czyli
   tą samą drogą co `swiatOsady`. Stany mieszkań siedziby z generatora (`mieszkancyNowejGry`) świat dostaje przy wyborze, a
   przy wczytaniu zapisu `mieszkancyZapisu` ze stanu gry.

   Nazwa osady (`nazwaOsady`) idzie z ulicy siedziby (tag `addr:street`; kafelki i dema jej nie niosą, Overpass tak), inaczej z
   kierunku od domu do kwadratu (`kierunekOsady`, z numerów kwadratu w układzie świata gry, bez trygonometrii). To strona
   świata, jaką widać na ekranie, gdzie siatka kwadratów leży wzdłuż ścian domu, a nie na geograficznej północy (tak samo
   gra mówi o dziurach w siatce: „od północy” w src/ui/siatka.ts to góra ekranu); kąt domu jest do 45° od północy, więc na
   mapie miasta (północ u góry) osada może wypaść o jedną stronę świata dalej. Obie formy nazwy są gotowymi zdaniami:
   `nazwa` („Osada przy ul. Lanciego”) i `nazwaZ` („z osady przy ul. Lanciego”). */

import { cudzyslowy, type Tx, tx } from '../core/jezyk.ts';
import { hashString, type RngState, rngOf } from '../core/rng.ts';
import { type Cel, celZMiejsca, MAX_OKOLICA_M } from '../gov/wyprawy.ts';
import { budynkiZCzlonkami, metryNaStopien } from '../mieszkancy/budynki.ts';
import { nazwaDoOkolicyZDanych } from '../mieszkancy/kronika.ts';
import { TAG_BUDYNKU } from '../mieszkancy/oznacz.ts';
import type { DaneMieszkancow } from '../mieszkancy/wczytaj.ts';
import { houseOf } from '../sim/house.ts';
import { ludnoscSpisu2021, mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../sim/osiedle.ts';
import { type Geo, type Pt, pip, polyArea } from '../world/geo.ts';
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
/** nazwa ulicy w nazwie osady jest ucinana do tylu znaków */
const MAX_ULICY = 40;

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
// Przesunięcie geo i siedziba
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

type Pierscienie = readonly (readonly Pt[])[];

/** Środek obrysu: środek ciężkości pierścieni ważony polem (pierścień bez pola: średnia wierzchołków wszystkich). */
function srodekObrysu(pierscienie: Pierscienie): Pt {
  // podwojone pole i sumy do wzoru na środek ciężkości wielokąta, każdy pierścień z dodatnim polem niezależnie od kierunku
  let pole2 = 0;
  let cx = 0;
  let cy = 0;
  for (const r of pierscienie) {
    let a = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f;
      sx += (r[j][0] + r[i][0]) * f;
      sy += (r[j][1] + r[i][1]) * f;
    }
    const znak = a < 0 ? -1 : 1;
    pole2 += znak * a;
    cx += znak * sx;
    cy += znak * sy;
  }
  if (pole2 > 1e-9) return [cx / (3 * pole2), cy / (3 * pole2)];
  let n = 0;
  let mx = 0;
  let my = 0;
  for (const r of pierscienie)
    for (const [x, y] of r) {
      mx += x;
      my += y;
      n++;
    }
  return n ? [mx / n, my / n] : [0, 0];
}

const naPolmetry = (v: number): number => Math.round(v * 2) / 2;

/** Punkt na siatce 0,5 m wewnątrz obrysu (w którymkolwiek pierścieniu), najbliżej `cel` (pierwszy w kolejności x, y przy
    remisie): zaokrąglony środek, jeśli leży w obrysie, inaczej najbliższy punkt siatki w ramce obrysu. null, gdy obrys nie ma
    żadnego (zdegenerowany). */
function punktWewnatrz(pierscienie: Pierscienie, cel: Pt): Pt | null {
  const w = (x: number, y: number): boolean => pierscienie.some((r) => pip(x, y, r));
  const [zx, zy] = [naPolmetry(cel[0]), naPolmetry(cel[1])];
  if (w(zx, zy)) return [zx, zy];
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of pierscienie)
    for (const [x, y] of r) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  let najlepszy: Pt | null = null;
  let odl = Number.POSITIVE_INFINITY;
  for (let x = Math.ceil(x0 * 2) / 2; x <= x1; x += 0.5)
    for (let y = Math.ceil(y0 * 2) / 2; y <= y1; y += 0.5) {
      const d = (x - cel[0]) * (x - cel[0]) + (y - cel[1]) * (y - cel[1]);
      if (d < odl && w(x, y)) {
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
    środkowi, potem niższy numer. Budynek bez punktu wewnątrz obrysu odpada. `dane` tylko przez tabele gminy i kraju. */
export function kandydaciSiedziby(
  geo: Geo,
  srodek: Pt,
  dane: Pick<DaneMieszkancow, 'gmina' | 'kraj'>,
): KandydatSiedziby[] {
  const out: KandydatSiedziby[] = [];
  for (const { czlonkowie } of budynkiZCzlonkami(geo, dane.gmina, dane.kraj)) {
    for (const indeks of czlonkowie) {
      const b = geo.b[indeks];
      const pierscienie: Pierscienie = [b.p, ...(b.pp ?? [])];
      const c = srodekObrysu(pierscienie);
      const odl = Math.sqrt((c[0] - srodek[0]) * (c[0] - srodek[0]) + (c[1] - srodek[1]) * (c[1] - srodek[1]));
      if (!(odl <= PROMIEN_SIEDZIBY_M)) continue;
      const punkt = punktWewnatrz(pierscienie, c);
      if (!punkt) continue;
      out.push({ indeks, pole: pierscienie.reduce((s, r) => s + polyArea(r), 0), odl, punkt });
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

/** nazwa ulicy zaczyna się od rodzaju (aleja, plac…): „przy ul.” przed nią byłoby błędem */
const RODZAJ_ULICY =
  /^(?:aleja|aleje|al\.|plac|pl\.|rondo|skwer|bulwar|osiedle|os\.|droga|trakt|szosa|park|ulica|ul\.)(?:\s|$)/i;

/** Nazwa osady i forma „z osady …” w obu językach. Z ulicy siedziby: „Osada przy ul. Lanciego”, „Lanciego settlement” (nazwa
    ulicy z rodzajem w środku, np. „Aleja Grunwaldzka”, idzie w cudzysłowie: „Osada „Aleja Grunwaldzka””); biały znak ściśnięty,
    napis ucięty do `MAX_ULICY` znaków. Bez ulicy (pusta, biała, brak) z kierunku od domu: „Osada na północy”, „Settlement to
    the north”. */
export function nazwaOsady(ulica: string | undefined, sx: number, sy: number): { nazwa: Tx; nazwaZ: Tx } {
  const u = (ulica ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ULICY).trim();
  if (u) {
    const pl = cudzyslowy(u, 'pl');
    const en = cudzyslowy(u, 'en');
    const polska = RODZAJ_ULICY.test(u) ? `„${pl}”` : `przy ul. ${pl}`;
    return {
      nazwa: tx(`Osada ${polska}`, `${en} settlement`),
      nazwaZ: tx(`z osady ${polska}`, `from the ${en} settlement`),
    };
  }
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
  /** nazwa osady do kart i mapy: „Osada przy ul. Lanciego” albo „Osada na północy” */
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

/** Opis siedziby świata (`World.hq`); świat bez wnętrza albo siedziby to same zera. */
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
    sucheDrzewo: w.dryTree >= 0,
  };
}

/** Czy siedziba spełnia regułę: budynek mieszkalny według generatora, co najmniej `MIN_POKOI_SIEDZIBY` pokoi w całym wnętrzu,
    pokój w mieszkaniu zarządu i suche drzewo w świecie (z niego idzie pierwsze drewno). */
export const siedzibaWystarcza = (s: OpisSiedziby): boolean =>
  s.mieszkalna && s.pokoje >= MIN_POKOI_SIEDZIBY && s.pokojeZarzadu >= 1 && s.sucheDrzewo;

/** Świat osady dla jednego kandydata albo powód odrzucenia (siedziba, jedzenie, mieszkańcy: pierwszy z kolei). `geoKwadratu`
    to geo kwadratu (sx, sy) w układzie domu (metry od adresu, bez obrotu: dema `*-kwadraty.json`, `geoKwadratu` z
    kafelków), `uklad` to układ domu, `seed` ziarno naszej gry. Siedziba: do `PROBY_SIEDZIBY` największych budynków
    mieszkalnych w `PROMIEN_SIEDZIBY_M` od środka kwadratu, pierwszy z `MIN_POKOI_SIEDZIBY` pokojami i pokojem zarządu wygrywa.
    `dane` null: odrzucone od razu jako „mieszkancy”. Dla (0, 0) kandydatem jest sam dom (reguła miejsca dla jego geo, do oceny
    dema). Z `pelny` pomiar liczy wszystko także po pierwszym powodzie (tabela narzędzia: jedzenie nawet bez siedziby, z
    punktu pierwszego kandydata albo ze środka kwadratu), powód i wynik zostają te same. Nie zmienia wejścia. */
export function swiatOsady(
  geoKwadratu: Geo,
  sx: number,
  sy: number,
  dane: DaneMieszkancow | null,
  seed: number,
  uklad: Uklad,
  opcje: { pelny?: boolean } = {},
): SwiatOsady | OdrzucenieOsady {
  const pomiar: PomiarKwadratu = {
    kandydatow: 0,
    proby: 0,
    pole: 0,
    pokoje: 0,
    pokojeZarzadu: 0,
    osoby: null,
    lokatorzy: null,
    jedzenie: null,
  };
  const odrzuc = (odrzucony: PowodOdrzucenia): OdrzucenieOsady => ({ odrzucony, pomiar });
  if (!dane) return odrzuc('mieszkancy');
  const pelny = opcje.pelny === true;
  const ziarno = ziarnoOsady(seed, sx, sy);
  const srodek = srodekKwadratu(uklad, sx, sy);
  let kandydaci: KandydatSiedziby[];
  try {
    kandydaci = kandydaciSiedziby(geoKwadratu, srodek, dane);
  } catch {
    kandydaci = [];
  }
  pomiar.kandydatow = kandydaci.length;

  // siedziba: pierwszy z największych budynków, który ma pokoje
  let wybrana: { geo: Geo; z: { geo: Geo; world: World } } | null = null;
  let pierwszaPrzesunieta: Geo | null = null;
  let najlepsze = -1;
  for (const k of kandydaci.slice(0, PROBY_SIEDZIBY)) {
    const przesunieta = przesunGeo(geoKwadratu, k.punkt[0], k.punkt[1]);
    uzupelnijKlucze(przesunieta);
    pierwszaPrzesunieta ??= przesunieta;
    pomiar.proby++;
    let z: { geo: Geo; world: World };
    try {
      z = swiatZGeo(przesunieta, ziarno, dane);
    } catch {
      continue;
    }
    const s = opiszSiedzibe(z.world);
    // w pomiarze zostaje najlepsza próba (najwięcej pokoi, przy remisie wcześniejsza), a przy sukcesie ta, która wygrała
    if (s.pokoje > najlepsze) {
      najlepsze = s.pokoje;
      Object.assign(pomiar, { pole: s.pole, pokoje: s.pokoje, pokojeZarzadu: s.pokojeZarzadu });
    }
    if (siedzibaWystarcza(s)) {
      Object.assign(pomiar, { pole: s.pole, pokoje: s.pokoje, pokojeZarzadu: s.pokojeZarzadu });
      wybrana = { geo: przesunieta, z };
      break;
    }
  }

  // jedzenie w zasięgu 720 m od siedziby (z pelnym pomiarem także bez siedziby: z punktu pierwszego kandydata albo ze środka kwadratu)
  const nazwaOkolicy = nazwaDoOkolicyZDanych(dane);
  let okolica: Miejsce[] | null = null;
  if (wybrana || pelny) {
    const geoOkolicy =
      wybrana?.geo ??
      pierwszaPrzesunieta ??
      (() => {
        const g = przesunGeo(geoKwadratu, naPolmetry(srodek[0]), naPolmetry(srodek[1]));
        uzupelnijKlucze(g);
        return g;
      })();
    okolica = miejscaZPoi(geoOkolicy.poi, nazwaOkolicy);
    pomiar.jedzenie = jedzenieWZasiegu(okolica);
  }
  if (!wybrana) return odrzuc('siedziba');
  const zaMalo = (pomiar.jedzenie ?? 0) < PROG_JEDZENIA_OSADY;
  if (zaMalo && !pelny) return odrzuc('jedzenie');

  // mieszkańcy z generatora w siedzibie (stany mieszkań idą od razu na świat)
  const { geo: oznaczone, world } = wybrana.z;
  const l = mieszkancyNowejGry(world, oznaczone, dane, ZARZAD_OSADY);
  if (l) {
    const lokatorzy = l.lokatorzy.reduce((a, m) => a + m.osoby.length, 0);
    pomiar.lokatorzy = lokatorzy;
    pomiar.osoby = l.zarzad.length + lokatorzy;
  }
  if (zaMalo) return odrzuc('jedzenie');
  if (!l || (pomiar.lokatorzy ?? 0) < MIN_LOKATORZY_SIEDZIBY) return odrzuc('mieszkancy');

  const hq = world.buildings[world.hq];
  const { nazwa, nazwaZ } = nazwaOsady(hq.tags['addr:street'], sx, sy);
  const ludnosc = ludnoscSpisu2021(oznaczone, dane);
  const opcjeGry: OpcjeGryAi = {
    core: ZARZAD_OSADY,
    obcy: true,
    mieszkancy: opcjaMieszkancow(l),
    okolica: okolica!,
    ...(ludnosc !== undefined ? { ludnosc2021: ludnosc } : {}),
    tempoPrzegladarki: true,
    lancuchy: false,
    odpowiedzNaNieznane: true,
  };
  return {
    klucz: kluczKwadratu(sx, sy),
    sx,
    sy,
    geo: wybrana.geo,
    world,
    opcje: opcjeGry,
    nazwa,
    nazwaZ,
    kierunek: kierunekOsady(sx, sy).kierunek,
    jedzenie: pomiar.jedzenie ?? 0,
    pomiar,
  };
}

/** Pierwszy kandydat w kolejności z ziarna gry (`kandydaciOsady`), który spełnia regułę miejsca, albo null (gra bez osady).
    `kandydaci` to geo kwadratów po kluczu „sx,sy”; kwadrat bez geo jest pomijany (dema mają osiem sąsiadów, Lanciego cztery
    boczne, prawdziwy adres tylko te, które się pobrały), więc wołający wybiera, kiedy dane są kompletne. Bez tabel mieszkańców
    (`dane` null) null od razu. */
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
