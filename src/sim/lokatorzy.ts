/* Osoby i mieszkania siedziby z generatora mieszkańców (krok 5; spec §9, akapit o pustych mieszkaniach w §5, §10).
   Klej między czystym generatorem (src/mieszkancy) a grą: budynek siedziby z generatora daje zarząd (osoby, które
   pokrywają potrzebne dziedziny), lokatorów zamieszkanych mieszkań parteru siedziby (całe gospodarstwa) i stany
   wszystkich mieszkań parteru (zarząd, mieszkańcy, puste z powodem i rokiem z dziennika budynku). Stany idą do
   `settleApts(world, stany)`, osoby do `createSim` (opcja `mieszkancy`).

   Generujemy tylko budynek siedziby, nie całe osiedle: każdy budynek ma własne ziarna, więc wynik jest ten sam co
   w `generujObszar`. Lista budynków obszaru jest potrzebna tylko do kroniki osiedla (`kronikaObszaru`) i do
   odszukania budynku siedziby po tagu `zm:bud` (oznacz.ts), który świat niesie w `WorldBuilding.tags`. Gdy siedziba
   tagu nie ma (świat wymusza siedzibę mieszkalną z budynku, którego generator nie uważa za mieszkalny, jak na
   demach Przymorza i Lanciego), budynek zapasowy powstaje ze świata (`budynekZapasowy`).

   Puste mieszkania. Ich liczba to udział pustych w całym budynku przyłożony do mieszkań parteru. Jak w `settleApts`
   (kontrakt M2): gdy z podwórka da się dojść do co najmniej dwóch mieszkań, jedno z nich stoi puste do przeszukania,
   reszta pustych jest dalej, a co najmniej jedno mieszkanie przy podwórku zostaje zamieszkane. Powód i rok biorą
   się z wpisów `opuszczone` dziennika budynku (`powodyPustych`). Silnik zajmuje wolne mieszkania od najwcześniej
   zwolnionych, więc puste w 2051 to raczej te opuszczone najpóźniej: pulą jest ostatnie `puste` wpisów, rosnąco po
   roku, a z niej bierzemy wpisy równo rozłożone, żeby puste mieszkania parteru pokazały całe 25 lat, a nie jeden
   rok. Ostatni członek odszedł przez zgon: wymarcie, inaczej wyjazd; od 2033 puste mieszkanie mogło potem zostać
   splądrowane, zalane albo spalone (szanse w `LOSY_UPADKU`, decyzja gry, nie dane).

   Lokatorzy. Mieszkania przy podwórku dostają pierwsze gospodarstwa z najwięcej obecnymi (1-4 osoby), bo z nich
   symulacja robi pionki mieszkańców, a reszta mieszkań kolejne gospodarstwa budynku. Mieszkanie, dla którego
   gospodarstwa zabrakło, też stoi puste (powód i rok losuje `settleApts`); tylko gdy budynek nie ma żadnego
   gospodarstwa do rozdania, jedno mieszkanie przy podwórku zostaje zamieszkane bez osób.

   Czyste i deterministyczne: bez DOM, sieci, zegara i Math.random, losowanie z `losDla` po kluczach. Nie zmienia
   świata, mapy ani danych. */

import type { Dom } from '../content/data.ts';
import { losujCechy, POTRZEBNE } from '../content/druzyna.ts';
import type { Person } from '../content/people.ts';
import type { Rng } from '../core/rng.ts';
import { rokZDaty } from '../mieszkancy/budynki.ts';
import { fachOsoby, nazwaFachu } from '../mieszkancy/fachy.ts';
import { budynkiObszaru, generujBudynek, kronikaObszaru, ROK_GRY } from '../mieszkancy/generuj.ts';
import { pokrewienstwo } from '../mieszkancy/historie.ts';
import type { WpisKroniki } from '../mieszkancy/kronika.ts';
import { losDla } from '../mieszkancy/los.ts';
import { TAG_BUDYNKU } from '../mieszkancy/oznacz.ts';
import { rejonDla } from '../mieszkancy/rejon.ts';
import { KREWNI, type Krewny } from '../mieszkancy/szablony.ts';
import type { TabeleGminy } from '../mieszkancy/tabele.ts';
import type { Budynek, Gospodarstwo, Osoba, Wpis, WynikBudynku } from '../mieszkancy/typy.ts';
import type { DaneMieszkancow } from '../mieszkancy/wczytaj.ts';
import { type AptState, type AptWhy, reachable } from '../world/apts.ts';
import type { Geo } from '../world/geo.ts';
import type { World, WorldBuilding } from '../world/world.ts';
import { houseOf } from './house.ts';

/** Osoba z generatora w kształcie osoby gry (pola `Person`) z odnośnikiem do `Osoba.id` i linijką rodziny. */
export type OsobaGry = Pick<Person, 'first' | 'name' | 'f' | 'prof' | 'skills' | 'age' | 'traits' | 'story'> & {
  ref: string;
  rodzina: string;
};

export interface LokatorzyGry {
  /** wynik generatora dla budynku siedziby (wszystkie osoby, gospodarstwa i dziennik) */
  siedziba: WynikBudynku;
  /** kronika osiedla, z której powstały historie */
  kronika: WpisKroniki[];
  /** najwyżej `core` osób, w kolejności miejsc zarządu */
  zarzad: OsobaGry[];
  /** zamieszkane mieszkania parteru siedziby poza mieszkaniem z kozą, rosnąco po numerze, każde z gospodarstwem;
      pustą listę ma tylko jedno mieszkanie przy podwórku, gdy budynek nie ma żadnego gospodarstwa do rozdania */
  lokatorzy: { apt: number; osoby: OsobaGry[] }[];
  /** stany wszystkich mieszkań parteru siedziby, rosnąco po numerze, do `settleApts(world, stany)` */
  stany: AptState[];
}

/** Zarząd: dorośli w tym przedziale wieku (2051). */
const ZARZAD_OD = 18;
const ZARZAD_DO = 75;
/** Młodsi niż tyle lat to „dziecko” (od 16 lat generator daje fach). */
const DZIECKO_DO = 16;
/** Gospodarstwa z najwyżej tyloma obecnymi idą do mieszkań parteru pierwsze. */
const MALE_GOSPODARSTWO = 4;
/** Najdłuższa historia osoby w znakach (całe zdania). */
const MAX_HISTORII = 700;
/** Teksty dla gracza bez numerów mieszkań i pięter (spec §10). */
const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
/** Rok opuszczenia pustego mieszkania w grze. */
const PUSTE_OD = 2029;
const PUSTE_DO = 2051;
/** Od tego roku puste mieszkanie mogło potem paść ofiarą upadku: szanse na 10 000, sprawdzane po kolei jednym
    losowaniem (decyzja gry, nie dane). */
const UPADEK_OD = 2033;
const LOSY_UPADKU: readonly (readonly [AptWhy, number])[] = [
  ['splądrowanie', 3000],
  ['zalanie', 1500],
  ['pozar', 1000],
];
/** Kolejność krewnych w linijce rodziny; w obrębie jednej grupy starsi pierwsi. */
const KOLEJNOSC_KREWNYCH: Record<Krewny, number> = {
  maz: 0,
  zona: 0,
  matka: 1,
  ojciec: 2,
  rodzice: 2,
  syn: 3,
  corka: 3,
  brat: 4,
  siostra: 4,
  babcia: 5,
  dziadek: 5,
  wnuk: 6,
  wnuczka: 6,
};

const wiek = (o: Osoba): number => ROK_GRY - o.rocznik;
const zaokr5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/** Tasowanie Fishera-Yatesa w miejscu; zwraca tę samą tablicę. */
function tasuj<T>(a: T[], r: Rng): T[] {
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

// ---------------------------------------------------------------- osoba

/** Zawód na karcie: fach w formie płci, a bez fachu dawny zawód, dziecko albo mieszkaniec. */
function zawodGry(o: Osoba): string {
  const fach = fachOsoby(o);
  if (fach) return nazwaFachu(fach.id, o.plec);
  if (o.dawnyZawod) return o.dawnyZawod;
  if (wiek(o) < DZIECKO_DO) return 'dziecko';
  return o.plec === 'K' ? 'mieszkanka' : 'mieszkaniec';
}

/** Historia osoby: linijka „Dawniej X, dziś Y.” (gdy ma dawny zawód i fach, a żadne zdanie historii gospodarstwa nie
    ma już jej imienia razem z oboma zawodami) i zdania historii gospodarstwa. Zdania z numerem mieszkania albo
    piętrem odpadają; całość do 700 znaków, ucinana całymi zdaniami od końca. Bez zdań: `undefined`. */
function historiaOsoby(o: Osoba, historia: readonly string[]): string | undefined {
  const zdania = historia.filter((z) => z.trim() !== '' && !RODO.test(z));
  const fach = fachOsoby(o);
  if (fach && o.dawnyZawod) {
    const dzis = nazwaFachu(fach.id, o.plec);
    const dawny = o.dawnyZawod;
    // zdanie generatora o tej osobie („Michał: kiedyś doradca ds. ESG, dziś pieczarkarz.”), nie o kimś z tym samym fachem
    const juzJest = zdania.some((z) => z.includes(o.imie) && z.includes(dawny) && z.includes(dzis));
    if (!juzJest) zdania.unshift(`Dawniej ${dawny}, dziś ${dzis}.`);
  }
  while (zdania.length > 0 && zdania.join(' ').length > MAX_HISTORII) zdania.pop();
  return zdania.length > 0 ? zdania.join(' ') : undefined;
}

/** Obecni krewni osoby w budynku: „mąż Marek (54), córka Agnieszka (23)”; pusty napis, gdy nikogo. */
function rodzinaOsoby(o: Osoba, osoby: readonly Osoba[], wg: ReadonlyMap<string, Osoba>): string {
  const krewni: { k: Krewny; p: Osoba; i: number }[] = [];
  osoby.forEach((p, i) => {
    if (p.stan !== 'tu') return;
    const k = pokrewienstwo(o, p, wg);
    if (k) krewni.push({ k, p, i });
  });
  krewni.sort((a, b) => KOLEJNOSC_KREWNYCH[a.k] - KOLEJNOSC_KREWNYCH[b.k] || a.p.rocznik - b.p.rocznik || a.i - b.i);
  return krewni.map(({ k, p }) => `${KREWNI[k].mian} ${p.imie} (${wiek(p)})`).join(', ');
}

function osobaZ(
  o: Osoba,
  osoby: readonly Osoba[],
  wg: ReadonlyMap<string, Osoba>,
  historia: readonly string[],
): OsobaGry {
  const fach = fachOsoby(o);
  const story = historiaOsoby(o, historia);
  const skills: Partial<Record<Dom, number>> = { ...(fach?.umiejetnosci ?? {}) };
  const wynik: OsobaGry = {
    first: o.imie,
    name: o.nazwisko ? `${o.imie} ${o.nazwisko}` : o.imie,
    f: o.plec === 'K',
    prof: zawodGry(o),
    skills,
    age: wiek(o),
    traits: losujCechy(losDla('cechy', o.id)),
    ref: o.id,
    rodzina: rodzinaOsoby(o, osoby, wg),
  };
  if (story) wynik.story = story;
  return wynik;
}

/** Osoba generatora jako osoba gry. `w` to wynik budynku osoby (krewni z `pokrewienstwo`), `historia` to zdania
    historii jej gospodarstwa (`Gospodarstwo.historia`). Imię `first`, `name` z nazwiskiem, płeć, wiek 2051 - rocznik,
    zawód z fachu (w formie płci), umiejętności fachu, cechy z ziarna `losDla('cechy', id osoby)`, `ref` = id osoby,
    `rodzina` z obecnych krewnych. Nie zmienia wejścia. */
export function osobaGry(o: Osoba, w: WynikBudynku, historia: readonly string[]): OsobaGry {
  return osobaZ(o, w.osoby, new Map(w.osoby.map((p) => [p.id, p])), historia);
}

// ---------------------------------------------------------------- budynek siedziby

/** Budynek zapasowy ze świata, gdy siedziba nie ma budynku generatora: klucz i rejon z punktu adresu (`geo.c`),
    blok od 3 kondygnacji albo 300 m², kondygnacje i pole ze świata, wymiary z prostokąta kafelków (metr na kafelek),
    klatki z wejść. Epokę i mieszkania dopisze generator. */
function budynekZapasowy(hq: WorldBuilding, geo: Geo, g: TabeleGminy | null): Budynek {
  const [lat0, lon0] = geo.c;
  const lat = zaokr5(lat0);
  const lon = zaokr5(lon0);
  const bokX = hq.x1 - hq.x0 + 1;
  const bokY = hq.y1 - hq.y0 + 1;
  const b: Budynek = {
    klucz: `hq:${lat0.toFixed(5)},${lon0.toFixed(5)}`,
    lat,
    lon,
    rejon: g ? rejonDla(g, lat, lon).rejon : '',
    typ: hq.levels >= 3 || hq.area >= 300 ? 'blok' : 'dom',
    kondygnacje: Math.max(1, hq.levels),
    pole: Math.max(1, Math.round(hq.area)),
    szerokosc: Math.min(bokX, bokY),
    dlugosc: Math.max(bokX, bokY),
    klatki: Math.max(1, hq.entrances.length),
  };
  const rok = hq.startDate === undefined ? undefined : rokZDaty(hq.startDate);
  if (rok !== undefined) b.startDate = rok;
  return b;
}

// ---------------------------------------------------------------- zarząd

/** Zarząd: obecni w wieku 18-75 lat z fachem. Dla każdej dziedziny z `POTRZEBNE` po kolei osoba z najwyższym
    poziomem tej dziedziny spośród niewybranych (gdy ktoś ją ma), potem dopełnienie najwyższą sumą umiejętności,
    najwyżej `core` osób. Remis: kolejność z `losDla('zarzad', klucz budynku)`. */
function wybierzZarzad(w: WynikBudynku, core: number): Osoba[] {
  const kandydaci = tasuj(
    w.osoby.filter((o) => o.stan === 'tu' && wiek(o) >= ZARZAD_OD && wiek(o) <= ZARZAD_DO && fachOsoby(o)),
    losDla('zarzad', w.budynek.klucz),
  );
  const umiejetnosci = (o: Osoba): Partial<Record<Dom, number>> => fachOsoby(o)?.umiejetnosci ?? {};
  const wybrani: Osoba[] = [];
  /** Niewybrany z najwyższą oceną powyżej `ponad` (pierwszy w kolejności przy remisie). */
  const najlepszy = (ocena: (o: Osoba) => number, ponad: number): Osoba | undefined => {
    let wynik: Osoba | undefined;
    let najwiecej = ponad;
    for (const o of kandydaci) {
      if (wybrani.includes(o)) continue;
      const v = ocena(o);
      if (v > najwiecej) {
        wynik = o;
        najwiecej = v;
      }
    }
    return wynik;
  };
  for (const d of POTRZEBNE) {
    if (wybrani.length >= core) break;
    const o = najlepszy((x) => umiejetnosci(x)[d] ?? 0, 0);
    if (o) wybrani.push(o);
  }
  const suma = (o: Osoba): number => Object.values(umiejetnosci(o)).reduce((s, v) => s + (v ?? 0), 0);
  while (wybrani.length < core) {
    const o = najlepszy(suma, -1);
    if (!o) break;
    wybrani.push(o);
  }
  return wybrani;
}

// ---------------------------------------------------------------- puste mieszkania

/** Powód i rok dla `ile` pustych mieszkań, rosnąco po roku (opis w nagłówku pliku): z ostatnich `w.puste` wpisów
    `opuszczone` dziennika `ile` równo rozłożonych, rok przycięty do [2029, 2051], wymarcie, gdy ostatni członek
    (`Wpis.z`) zmarł najpóźniej w roku opuszczenia, inaczej wyjazd, a od 2033 jedno losowanie
    `losDla('mieszkania-gry', id gospodarstwa)` na szaber, zalanie albo pożar. Mniej wpisów niż pustych: lista jest
    krótsza, a reszta pustych dostaje powód i rok od `settleApts`. */
export function powodyPustych(
  w: Pick<WynikBudynku, 'dziennik' | 'puste'>,
  ile: number,
): { why: AptWhy; year: number }[] {
  const opuszczone = w.dziennik.filter((d) => d.typ === 'opuszczone');
  const pula = opuszczone.slice(Math.max(0, opuszczone.length - w.puste)).sort((a, b) => a.rok - b.rok);
  if (ile <= 0 || pula.length === 0) return [];
  const wybrane: Wpis[] =
    ile >= pula.length
      ? pula
      : Array.from({ length: ile }, (_, i) => pula[Math.floor(((2 * i + 1) * pula.length) / (2 * ile))]);
  const zgony = new Map<string, number>();
  for (const d of w.dziennik) if (d.typ === 'zgon') zgony.set(d.kto, d.rok);
  return wybrane.map((d) => {
    const year = Math.max(PUSTE_OD, Math.min(PUSTE_DO, d.rok));
    // ostatni członek odszedł przez zgon (zgon nie później niż opuszczenie), inaczej przez wyjazd
    const zgon = d.z === undefined ? undefined : zgony.get(d.z);
    let why: AptWhy = zgon !== undefined && zgon <= d.rok ? 'wymarcie' : 'wyjazd';
    if (year >= UPADEK_OD) {
      const los = Math.floor(losDla('mieszkania-gry', d.kto)() * 10000);
      let prog = 0;
      for (const [powod, p10k] of LOSY_UPADKU) {
        prog += p10k;
        if (los < prog) {
          why = powod;
          break;
        }
      }
    }
    return { why, year };
  });
}

// ---------------------------------------------------------------- całość

/** Zarząd, lokatorzy parteru i stany mieszkań siedziby z generatora mieszkańców. `geo` to mapa z tagami `zm:bud`
    (`oznaczGeo`), z której zbudowano `world`; `dane` z `wczytajDaneMieszkancow`. `null` tylko wtedy, gdy świat nie ma
    siedziby. Reguły:
    - budynek siedziby: `world.buildings[world.hq].tags['zm:bud']` wskazuje budynek z `budynkiObszaru`, inaczej
      budynek zapasowy ze świata;
    - zarząd: `wybierzZarzad`, najwyżej `opts.core` osób;
    - mieszkania parteru poza mieszkaniem z kozą: pustych `round(n × puste / mieszkania)` budynku, wybieranych
      z `losDla('mieszkania-gry', klucz)`: przy co najmniej dwóch mieszkaniach osiągalnych z podwórka (`reachable`)
      najpierw jedno z nich, potem spoza, na końcu reszta osiągalnych, a jedno osiągalne zostaje zamieszkane, gdy
      jakieś jest; powód i rok z `powodyPustych`, przypisane rosnąco po numerze;
    - gospodarstwa budynku z obecnymi, bez gospodarstw zarządu: zamieszkane mieszkania przy podwórku (rosnąco)
      dostają najpierw te z 1-4 obecnymi od najliczniejszych, pozostałe mieszkania (rosnąco) kolejne gospodarstwa
      w kolejności budynku, najpierw te z 1-4 obecnymi;
    - mieszkanie, dla którego gospodarstwa zabrakło, jest puste bez powodu i roku (losuje `settleApts`) i nie ma go
      w `lokatorzy`; gdy gospodarstw nie ma wcale, pierwsze zamieszkane przy podwórku zostaje z pustą listą osób. */
export function lokatorzyGry(
  world: World,
  geo: Geo,
  dane: DaneMieszkancow,
  opts: { core: number },
): LokatorzyGry | null {
  const hq = world.hq >= 0 ? world.buildings[world.hq] : undefined;
  if (!hq) return null;
  const { kraj, gmina, imiona, nazwiska, odmiana } = dane;
  const budynki = budynkiObszaru(geo, gmina, kraj);
  const kronika = kronikaObszaru(geo, budynki, imiona);
  const klucz = hq.tags[TAG_BUDYNKU];
  const budynek =
    (klucz === undefined ? undefined : budynki.find((b) => b.klucz === klucz)) ?? budynekZapasowy(hq, geo, gmina);
  const siedziba = generujBudynek(budynek, gmina, kraj, { imiona, nazwiska, odmiana, kronika });

  const wg = new Map(siedziba.osoby.map((o) => [o.id, o]));
  const domOsoby = new Map<string, Gospodarstwo>();
  for (const g of siedziba.gospodarstwa) for (const id of g.czlonkowie) domOsoby.set(id, g);
  const gra = (o: Osoba): OsobaGry => osobaZ(o, siedziba.osoby, wg, domOsoby.get(o.id)?.historia ?? []);

  const wybrani = wybierzZarzad(siedziba, Math.max(0, Math.floor(opts.core)));
  const zarzad = wybrani.map(gra);

  const house = houseOf(world);
  const stany: AptState[] = [];
  const lokatorzy: LokatorzyGry['lokatorzy'] = [];
  if (house) {
    const k = siedziba.budynek.klucz;
    const n = house.rooms.reduce((m, r) => Math.max(m, r.apt + 1), 0);
    const inne = [...Array(n).keys()].filter((a) => a !== house.home);
    const blisko = reachable(world);
    const r = losDla('mieszkania-gry', k);
    const daleko = tasuj(
      inne.filter((a) => !blisko.has(a)),
      r,
    );
    const przy = tasuj(
      inne.filter((a) => blisko.has(a)),
      r,
    );
    const mieszkania = Math.max(1, siedziba.budynek.mieszkania ?? siedziba.gospodarstwa.length + siedziba.puste);
    const chciane = Math.round((inne.length * siedziba.puste) / mieszkania);
    const ile = Math.max(0, Math.min(chciane, inne.length - (przy.length > 0 ? 1 : 0)));
    // jak settleApts (M2): przy podwórku jedno puste do przeszukania, gdy są tam co najmniej dwa, potem puste dalej;
    // ostatnie mieszkanie przy podwórku nigdy nie trafia do pustych (limit `ile` wyżej)
    const kolejnoscPustych = przy.length >= 2 ? [przy[0], ...daleko, ...przy.slice(1)] : [...daleko, ...przy];
    const puste = new Set(kolejnoscPustych.slice(0, ile));

    const pusteRosnaco = inne.filter((a) => puste.has(a));
    const powody = powodyPustych(siedziba, pusteRosnaco.length);
    const powodMieszkania = new Map(pusteRosnaco.map((a, i) => [a, powody[i]]));

    // gospodarstwa do mieszkań: z obecnymi, bez rodzin zarządu
    const domyZarzadu = new Set(wybrani.map((o) => domOsoby.get(o.id)?.id));
    const obecni = (g: Gospodarstwo): Osoba[] =>
      g.czlonkowie.flatMap((id) => {
        const o = wg.get(id);
        return o?.stan === 'tu' ? [o] : [];
      });
    const kolejka = siedziba.gospodarstwa
      .filter((g) => !domyZarzadu.has(g.id))
      .map((g) => ({ g, osoby: obecni(g) }))
      .filter((x) => x.osoby.length > 0);
    const male = kolejka.filter((x) => x.osoby.length <= MALE_GOSPODARSTWO);
    const duze = kolejka.filter((x) => x.osoby.length > MALE_GOSPODARSTWO);
    // przy podwórku (z tych mieszkań są pionki mieszkańców) najpierw małe gospodarstwa z najwięcej obecnymi, stabilnie
    const dlaPrzy = [...[...male].sort((a, b) => b.osoby.length - a.osoby.length), ...duze];
    const zamieszkane = inne.filter((a) => !puste.has(a));
    const zamPrzy = zamieszkane.filter((a) => blisko.has(a));
    const przydzial = new Map<number, (typeof kolejka)[number]>();
    zamPrzy.forEach((a, i) => {
      if (dlaPrzy[i]) przydzial.set(a, dlaPrzy[i]);
    });
    // reszta mieszkań: kolejne gospodarstwa budynku, najpierw te z 1-4 obecnymi
    const uzyte = new Set([...przydzial.values()].map((x) => x.g.id));
    const reszta = [...male, ...duze].filter((x) => !uzyte.has(x.g.id));
    zamieszkane
      .filter((a) => !blisko.has(a))
      .forEach((a, i) => {
        if (reszta[i]) przydzial.set(a, reszta[i]);
      });
    // bez gospodarstwa mieszkanie stoi puste; bez żadnego gospodarstwa jedno przy podwórku zostaje bez osób
    const bezOsob = kolejka.length === 0 ? zamPrzy[0] : undefined;
    const opuszczone = new Set(zamieszkane.filter((a) => !przydzial.has(a) && a !== bezOsob));
    for (const a of zamieszkane) {
      if (opuszczone.has(a)) continue;
      lokatorzy.push({ apt: a, osoby: przydzial.get(a)?.osoby.map(gra) ?? [] });
    }

    for (let a = 0; a < n; a++) {
      const powod = powodMieszkania.get(a);
      if (a === house.home) stany.push({ bid: world.hq, apt: a, state: 'zarzad' });
      else if (puste.has(a) && powod) stany.push({ bid: world.hq, apt: a, state: 'puste', ...powod });
      else if (puste.has(a) || opuszczone.has(a)) stany.push({ bid: world.hq, apt: a, state: 'puste' });
      else stany.push({ bid: world.hq, apt: a, state: 'mieszkancy' });
    }
  }
  return { siedziba, kronika, zarzad, lokatorzy, stany };
}
