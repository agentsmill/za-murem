/* Imiona i nazwiska mieszkańców. Generator (generuj.ts) wywołuje `nadajImiona` po `postarz`, więc osoby mają już
   rocznik, rodziców, partnerów i dziennik, a brakuje im tylko imienia i nazwiska. Losowanie na liczbach całkowitych
   przez los.ts (wagi to liczebności z tabel), bez trygonometrii, potęg i logarytmów; ziarno budynku podaje
   wywołujący (`losDla('imiona', klucz budynku)`), więc wynik budynku nie zależy od reszty obszaru.

   Imię (`imieDla`) zależy od rocznika:
   - 2000-2025: lista imion nadanych w tym roku (PESEL, zbiór 219);
   - przed 2000: koszyk wieku (tabele.ts, `koszyki`) z udziałami żyjących nosicieli. Osoby urodzone przed 1990 nie
     dostają imion z czołówki lat 2020 (pięć pierwszych miejsc każdej listy rocznej 2020-2025) poza siedmioma
     imionami z dwiema falami mody (`IMIONA_DWUFALOWE`): koszyki mają je z miękkiego członkostwa (Zuzanna ma 0,5%
     koszyka z 1946 r.), a w grze 80-latka o imieniu z czołówki dzieci z 2025 r. wyglądałaby na błąd;
   - 2026-2030: lista 2025 z wygaszanym trendem. Udział imienia w liście 2025 przez udział w liście 2020 daje zmianę
     w pięć lat (obcinaną do 1/4 … 4×); jej piąty pierwiastek to roczna zmiana, którą w każdym kolejnym roku liczymy
     o połowę słabszą (pierwszy rok pełna, potem 1/2, 1/4, …), więc rosnące imiona rosną, malejące maleją, a trend
     gaśnie do 2030 r. Piąty pierwiastek liczy iteracja Newtona na `+ - * /`, bez `Math.pow`;
   - od 2031: 30% losowań z imion powracających (imiona pradziadków, wagi od miejsca na liście), reszta z listy 2030.
     Z tej listy wypadają imiona przebrzmiałe, czyli te, których nadano w 2025 r. co najmniej dziesięć razy mniej niż
     w 2000 r. (Patryk, Kamil, Paulina, Klaudia: lata 90. brzmią w 2040 r. jak dziś Grażyna i Zbigniew).
   Osoba z wpisem `wprowadzka` po 2022 r. (przyjezdny) ma 15% szansy na imię z puli przyjezdnych (Oleksandr, Tetiana…).

   Nazwiska (`nadajImiona`). Nazwisko rodziny to para form, męska i żeńska (Kowalski, Kowalska; Nowak, Nowak), losowana
   przez `nazwiskoRodziny`: z szansą `udzialLokalnych` z puli lokalnej, inaczej z nazwisk „ogólnych” bez lokalnych
   (żeby udział lokalnych nie wzrósł ponad dane). Krótka pula lokalna (opolskie ma 4 nazwiska, zachodniopomorskie 1)
   nie dostaje pełnego udziału z danych, tylko swój udział w masie nazwisk (R38, `efektywnyUdzialLokalnych`). Osoby przeglądamy w kolejności `w.osoby`, a nazwisko każdej wynika z jej
   rodziców i partnera, także gdy zmarła albo wyjechała:
   - dziecko ma nazwisko ojca, a gdy ojca nie ma w budynku, nazwisko, które nosi matka (syn dostaje jego formę męską);
   - osoba bez rodziców w budynku jest początkiem linii. Mężczyzna, którego partnerka też nie ma rodziców w budynku,
     kobieta bez partnera i kobieta, do której wprowadził się partner, dostają nazwisko rodziny swojego gospodarstwa:
     każde gospodarstwo losuje je raz, także gospodarstwa przyjezdnych, niezależnie od reszty budynku. Zmarły albo
     nieobecny przodek bierze nazwisko gospodarstwa partnera lub dziecka;
   - partner z zewnątrz (wpis `zwiazek`), mąż córki i żona mężczyzny bez rodziców w budynku mają nazwisko z puli
     „ogólnych” (`nazwiskoPartnera`), razem z lokalnymi, z ich naturalną częstością;
   - kobieta z partnerem w 85% przypadków nosi nazwisko męża, w pozostałych swoje.
   Dwoje niespokrewnionych w jednym gospodarstwie bez rodziców i partnera dzieli więc nazwisko gospodarstwa (dane nie
   mówią, czy to krewni, czy współlokatorzy).

   `nadajImiona` zmienia osoby w miejscu: wolno ją wywołać tylko na wyniku, który wywołujący sam stworzył, np. z `postarz`
   (kopiuje osoby), jak robi to `generujBudynek`. Nie podawaj jej obiektu, który należy do kogoś innego. Zmienia tylko
   `imie` i `nazwisko`, nigdy innych pól. */

import type { Rng } from '../core/rng.ts';
import { szansa, wazony } from './los.ts';
import {
  type ImieZLiczba,
  KOSZYKI_IMION,
  type KoszykImion,
  PLIK_WOJEWODZTWA,
  type TabeleGminy,
  type TabeleImion,
  type TabeleNazwisk,
} from './tabele.ts';
import type { Gospodarstwo, Osoba, Plec, WynikBudynku } from './typy.ts';

/** Imiona z dwiema falami mody (tabele.ts, `koszyki`): wolno je mieć osobom z dawnych roczników, choć są w czołówce
    lat 2020. */
export const IMIONA_DWUFALOWE = ['Zofia', 'Antoni', 'Julia', 'Jan', 'Stanisław', 'Helena', 'Franciszek'] as const;

/** Rok, w którym zaczynają się roczne listy imion, i rok ostatniej listy. */
const ROK_LIST_OD = 2000;
const ROK_LISTY = 2025;
/** Rok listy, z którą porównujemy 2025, żeby znać trend (pięć lat wstecz). */
const ROK_BAZY_TRENDU = 2020;
/** Ostatni rok, w którym trend jeszcze się zmienia; od następnego pula jest stała. */
const ROK_KONCA_TRENDU = 2030;
/** Czołówka lat 2020: pierwsze miejsca list rocznych od 2020 do 2025. */
const CZOLOWKA_MIEJSC = 5;
/** Przed tym rocznikiem czołówka lat 2020 jest wyłączona z koszyków. */
const ROK_NOWEJ_MODY = 1990;
/** Imię jest przebrzmiałe, gdy w 2025 r. nadano go co najmniej tyle razy mniej niż w 2000 r. */
const KROTNOSC_SPADKU = 10;
/** Granice zmiany udziału imienia w pięć lat (2020 → 2025), żeby skrajne imiona nie rosły bez końca. */
const ZMIANA_MIN = 0.25;
const ZMIANA_MAX = 4;
/** Szanse na 10 000. */
const SZANSA_POWRACAJACYCH = 3000;
const SZANSA_PRZYJEZDNEGO = 1500;
const SZANSA_ZONY_BIERZE = 8500;
/** Wpis `wprowadzka` po tym roku robi z osoby przyjezdnego. */
const ROK_PRZYJEZDNYCH = 2022;
/** Ile razy losujemy imię, żeby rodzeństwo go nie dzieliło; po ostatnim losowaniu imię przyjmujemy. */
const PROBY_IMIENIA = 10;
/** Tabela nazwisk, której używa wywołujący bez tabel gminy (R35). */
const WOJ_ZAPASOWE = 'mazowieckie';

// ---------------------------------------------------------------- pule losowania

interface Pula {
  imiona: readonly string[];
  wagi: readonly number[];
}
const PUSTA: Pula = { imiona: [], wagi: [] };

/** Pule policzone raz na tabelę (tabele są niezmienne), bo losowanie woła je tysiące razy. */
const pamiec = new WeakMap<object, Map<string, Pula>>();
function zPamieci(t: object, klucz: string, buduj: () => Pula): Pula {
  let m = pamiec.get(t);
  if (!m) pamiec.set(t, (m = new Map()));
  let p = m.get(klucz);
  if (!p) m.set(klucz, (p = buduj()));
  return p;
}

function pulaZListy(lista: readonly ImieZLiczba[], pomin?: ReadonlySet<string>): Pula {
  const imiona: string[] = [];
  const wagi: number[] = [];
  for (const [imie, liczba] of lista) {
    if (pomin?.has(imie)) continue;
    imiona.push(imie);
    wagi.push(liczba);
  }
  return { imiona, wagi };
}

function losuj(r: Rng, p: Pula): string {
  const i = wazony(r, p.wagi);
  return i < 0 ? '' : p.imiona[i];
}

const listaRoku = (t: TabeleImion, rok: number, plec: Plec): readonly ImieZLiczba[] =>
  t.lata[String(rok)]?.[plec] ?? [];
const sumaLiczb = (lista: readonly ImieZLiczba[]): number => lista.reduce((n, x) => n + x[1], 0);

/** Koszyk dla rocznika: ostatni, który zaczyna się nie później niż rocznik (starsze niż 1920 idą do pierwszego). */
function koszykDla(rocznik: number): KoszykImion {
  let wynik: KoszykImion = KOSZYKI_IMION[0];
  for (const k of KOSZYKI_IMION) if (rocznik >= Number(k.slice(0, 4))) wynik = k;
  return wynik;
}

/** Imiona z czołówki lat 2020-2025 bez dwufalowych. */
function czolowkaLat2020(t: TabeleImion, plec: Plec): Set<string> {
  const s = new Set<string>();
  for (let rok = ROK_BAZY_TRENDU; rok <= ROK_LISTY; rok++) {
    for (const [imie] of listaRoku(t, rok, plec).slice(0, CZOLOWKA_MIEJSC)) s.add(imie);
  }
  for (const imie of IMIONA_DWUFALOWE) s.delete(imie);
  return s;
}

/** Imiona z listy 2025, których w 2025 r. nadano co najmniej `KROTNOSC_SPADKU` razy mniej niż w 2000 r. */
function przebrzmiale(t: TabeleImion, plec: Plec): Set<string> {
  const z2000 = new Map(listaRoku(t, ROK_LIST_OD, plec));
  const wynik = new Set<string>();
  for (const [imie, liczba] of listaRoku(t, ROK_LISTY, plec)) {
    const dawniej = z2000.get(imie);
    if (dawniej !== undefined && dawniej >= KROTNOSC_SPADKU * liczba) wynik.add(imie);
  }
  return wynik;
}

function pulaKoszyka(t: TabeleImion, koszyk: KoszykImion, plec: Plec, bezCzolowki: boolean): Pula {
  return zPamieci(t, `koszyk|${koszyk}|${plec}|${bezCzolowki ? 1 : 0}`, () => {
    const lista = t.koszyki[koszyk]?.[plec] ?? [];
    if (!bezCzolowki) return pulaZListy(lista);
    const p = pulaZListy(lista, czolowkaLat2020(t, plec));
    return p.imiona.length > 0 ? p : pulaZListy(lista);
  });
}

/** Piąty pierwiastek z liczby dodatniej, iteracją Newtona (`y ← (4y + x / y⁴) / 5`), bez `Math.pow`. */
function piatyPierwiastek(x: number): number {
  let y = 1 + (x - 1) / 5;
  for (let i = 0; i < 8; i++) {
    const y2 = y * y;
    y = (4 * y + x / (y2 * y2)) / 5;
  }
  return y;
}

/** Mnożnik wagi imienia po `lata` latach wygaszanego trendu: udział w liście 2025 przez udział w liście 2020 to
    zmiana w pięć lat; jej piąty pierwiastek minus 1 to roczna stopa, która co rok słabnie o połowę. */
function mnoznikTrendu(udzial2025: number, udzial2020: number, lata: number): number {
  const zmiana = Math.min(ZMIANA_MAX, Math.max(ZMIANA_MIN, udzial2025 / udzial2020));
  let stopa = piatyPierwiastek(zmiana) - 1;
  let mnoznik = 1;
  for (let i = 0; i < lata; i++) {
    mnoznik *= 1 + stopa;
    stopa /= 2;
  }
  return mnoznik;
}

/** Lista 2025 z wagami po wygaszanym trendzie do roku `rok` (2026-2030). Imię, którego nie było w liście 2020,
    liczy się jak najrzadsze imię tej listy. Bez listy 2020 waga zostaje taka jak w 2025. */
function pulaTrendu(t: TabeleImion, plec: Plec, rok: number, bezPrzebrzmialych: boolean): Pula {
  return zPamieci(t, `trend|${plec}|${rok}|${bezPrzebrzmialych ? 1 : 0}`, () => {
    const l2025 = listaRoku(t, ROK_LISTY, plec);
    if (l2025.length === 0) return PUSTA;
    const l2020 = listaRoku(t, ROK_BAZY_TRENDU, plec);
    const suma2025 = sumaLiczb(l2025);
    const suma2020 = sumaLiczb(l2020);
    const z2020 = new Map(l2020);
    const najrzadsze2020 = l2020.length > 0 ? l2020[l2020.length - 1][1] : 0;
    const pomin = bezPrzebrzmialych ? przebrzmiale(t, plec) : undefined;
    const lata = Math.min(rok, ROK_KONCA_TRENDU) - ROK_LISTY;
    const imiona: string[] = [];
    const wagi: number[] = [];
    for (const [imie, liczba] of l2025) {
      if (pomin?.has(imie)) continue;
      const w2020 = z2020.get(imie) ?? najrzadsze2020;
      const waga =
        suma2025 > 0 && suma2020 > 0 && w2020 > 0
          ? Math.round(liczba * mnoznikTrendu(liczba / suma2025, w2020 / suma2020, lata))
          : liczba;
      if (waga <= 0) continue;
      imiona.push(imie);
      wagi.push(waga);
    }
    return { imiona, wagi };
  });
}

/** Powracające imiona z wagami od miejsca na liście (pierwsze `n`, ostatnie 1), bo tabela nie podaje liczebności. */
const pulaPowracajacych = (t: TabeleImion, plec: Plec): Pula =>
  zPamieci(t, `powracajace|${plec}`, () => {
    const lista = t.powracajace?.[plec] ?? [];
    return { imiona: lista, wagi: lista.map((_, i) => lista.length - i) };
  });

const pulaPrzyjezdnych = (t: TabeleImion, plec: Plec): Pula =>
  zPamieci(t, `przyjezdni|${plec}`, () => pulaZListy(t.przyjezdni?.[plec] ?? []));

/** Imię dla osoby z rocznika `rocznik` (zasady w nagłówku pliku). `przyjezdny` daje 15% szansy na imię z puli
    przyjezdnych. Pusty napis tylko wtedy, gdy tabela nie ma żadnego imienia dla tego rocznika i płci. */
export function imieDla(rocznik: number, plec: Plec, t: TabeleImion, r: Rng, przyjezdny = false): string {
  if (przyjezdny && szansa(r, SZANSA_PRZYJEZDNEGO)) {
    const imie = losuj(r, pulaPrzyjezdnych(t, plec));
    if (imie !== '') return imie;
  }
  if (rocznik > ROK_KONCA_TRENDU) {
    if (szansa(r, SZANSA_POWRACAJACYCH)) {
      const imie = losuj(r, pulaPowracajacych(t, plec));
      if (imie !== '') return imie;
    }
    return losuj(r, pulaTrendu(t, plec, ROK_KONCA_TRENDU, true));
  }
  if (rocznik > ROK_LISTY) return losuj(r, pulaTrendu(t, plec, rocznik, false));
  if (rocznik >= ROK_LIST_OD) {
    return losuj(
      r,
      zPamieci(t, `rok|${rocznik}|${plec}`, () => pulaZListy(listaRoku(t, rocznik, plec))),
    );
  }
  return losuj(r, pulaKoszyka(t, koszykDla(rocznik), plec, rocznik < ROK_NOWEJ_MODY));
}

// ---------------------------------------------------------------- pule nazwisk

/** Nazwisko rodziny: forma męska i żeńska. */
export type ParaNazwisk = [string, string];

interface PulaPar {
  pary: readonly ParaNazwisk[];
  wagi: readonly number[];
}
interface PuleNazwisk {
  /** Udział losowań z puli lokalnej na 10 000 po ograniczeniu przez masę puli (R38). */
  udzial: number;
  ogolne: PulaPar;
  /** „Ogólne” bez nazwisk, które są też w puli lokalnej (porównanie po formie męskiej). */
  bezLokalnych: PulaPar;
  lokalne: PulaPar;
}

function parZListy(lista: readonly [string, string, number][], pomin?: ReadonlySet<string>): PulaPar {
  const pary: ParaNazwisk[] = [];
  const wagi: number[] = [];
  for (const [m, f, liczba] of lista) {
    if (pomin?.has(m)) continue;
    pary.push([m, f]);
    wagi.push(liczba);
  }
  return { pary, wagi };
}

const sumaWag = (p: PulaPar): number => p.wagi.reduce((n, w) => n + w, 0);

const pamiecNazwisk = new WeakMap<TabeleNazwisk, PuleNazwisk>();
function pule(t: TabeleNazwisk): PuleNazwisk {
  let p = pamiecNazwisk.get(t);
  if (!p) {
    const lokalneMeskie = new Set(t.lokalne.map((x) => x[0]));
    const ogolne = parZListy(t.ogolne);
    const bezLokalnych = parZListy(t.ogolne, lokalneMeskie);
    const lokalne = parZListy(t.lokalne);
    // R38: pula lokalna nie może mieć większego udziału niż jej masa wśród nazwisk (lokalne i „ogólne” bez nich);
    // pełna pula (pomorskie) trzyma udział z danych, krótka (opolskie, zachodniopomorskie) swoją częstość
    const masaLokalnych = sumaWag(lokalne);
    const masaCalosci = masaLokalnych + sumaWag(bezLokalnych);
    const udzialMasy = masaCalosci > 0 ? Math.round((10000 * masaLokalnych) / masaCalosci) : 0;
    const udzial = lokalne.pary.length > 0 ? Math.min(t.udzialLokalnych, udzialMasy) : 0;
    p = { udzial, ogolne, bezLokalnych, lokalne };
    pamiecNazwisk.set(t, p);
  }
  return p;
}

/** Udział losowań z puli lokalnej na 10 000, jakiego naprawdę używa `nazwiskoRodziny` (R38): mniejszy z `udzialLokalnych`
    i udziału masy puli lokalnej (suma liczebności) w masie „ogólnych” bez lokalnych razem z lokalnymi, zaokrąglonego.
    Pełna pula (pomorskie) trzyma udział z danych, krótka daje swoją częstość, pusta (lubuskie) 0. */
export function efektywnyUdzialLokalnych(t: TabeleNazwisk): number {
  return pule(t).udzial;
}

function losujPare(r: Rng, p: PulaPar): ParaNazwisk {
  const i = wazony(r, p.wagi);
  return i < 0 ? ['', ''] : [p.pary[i][0], p.pary[i][1]];
}

/** Nazwisko rodziny (męska i żeńska forma): z szansą `efektywnyUdzialLokalnych` na 10 000 (nie więcej niż
    `udzialLokalnych` i nie więcej niż masa puli lokalnej, R38) z puli lokalnej, inaczej z nazwisk „ogólnych” bez tych
    z puli lokalnej; wagi to liczebności. Zawsze zużywa jedno losowanie na szansę. Pusta pula lokalna to samo co
    nieudane losowanie lokalne. Tabela bez żadnego nazwiska daje `['', '']`. */
export function nazwiskoRodziny(t: TabeleNazwisk, r: Rng): ParaNazwisk {
  const p = pule(t);
  if (szansa(r, p.udzial)) return losujPare(r, p.lokalne);
  return losujPare(r, p.bezLokalnych.pary.length > 0 ? p.bezLokalnych : p.ogolne);
}

/** Nazwisko partnera z zewnątrz: z puli „ogólnych” razem z lokalnymi, bez losowania lokalnego. */
export function nazwiskoPartnera(t: TabeleNazwisk, r: Rng): ParaNazwisk {
  return losujPare(r, pule(t).ogolne);
}

/** Tabela nazwisk dla gminy (R35): województwo gminy, nazwa jego pliku (`PLIK_WOJEWODZTWA`, bez polskich liter) i czy
    wolno losować z puli lokalnej. Bez tabel gminy (albo gdy jej województwo nie ma pliku) tabela jest z
    `mazowieckie.json`, bez losowania lokalnego, bo nie wiemy, gdzie jest adres. Plik wczytuje wywołujący
    (`wczytajNazwiska`) i przy `lokalne: false` przepuszcza przez `bezPuliLokalnej`; robi to za niego
    `wczytajNazwiskaDlaGminy`. To jedyne miejsce z tą regułą. */
export function nazwiskaDlaGminy(g: TabeleGminy | null): { woj: string; plik: string; lokalne: boolean } {
  if (g && Object.hasOwn(PLIK_WOJEWODZTWA, g.woj)) return { woj: g.woj, plik: PLIK_WOJEWODZTWA[g.woj], lokalne: true };
  return { woj: WOJ_ZAPASOWE, plik: PLIK_WOJEWODZTWA[WOJ_ZAPASOWE], lokalne: false };
}

/** Kopia tabeli bez losowania lokalnego: udział 0 i pusta pula lokalna. Pustą pulę trzeba dać razem z udziałem 0,
    inaczej nazwiska lokalne zniknęłyby także z puli „ogólnych”, choć są tam z naturalną częstością. Wejścia nie
    zmienia; zrób to raz i używaj wyniku, bo pule liczą się raz na obiekt tabeli. */
export function bezPuliLokalnej(t: TabeleNazwisk): TabeleNazwisk {
  return { ...t, lokalne: [], udzialLokalnych: 0 };
}

// ---------------------------------------------------------------- nadawanie w budynku

type Para = Readonly<ParaNazwisk>;

/** Imiona i nazwiska wszystkim osobom budynku (także zmarłym i tym, którzy wyjechali), w kolejności `w.osoby`.
    Zmienia tylko `imie` i `nazwisko` w osobach `w` (patrz nagłówek: tylko na wyniku stworzonym przez wywołującego). */
export function nadajImiona(w: WynikBudynku, t: TabeleImion, n: TabeleNazwisk, r: Rng): void {
  const wg = new Map<string, Osoba>();
  for (const o of w.osoby) wg.set(o.id, o);
  const dom = new Map<string, Gospodarstwo>();
  for (const g of w.gospodarstwa) for (const id of g.czlonkowie) dom.set(id, g);
  const dzieci = new Map<string, Osoba[]>();
  for (const o of w.osoby) {
    for (const rodzic of [o.matka, o.ojciec]) {
      if (rodzic === undefined) continue;
      const lista = dzieci.get(rodzic);
      if (lista) lista.push(o);
      else dzieci.set(rodzic, [o]);
    }
  }
  /** Partnerzy, którzy wprowadzili się do mieszkańca (wpis `zwiazek`: `z` to ten partner), i przyjezdni. */
  const zewnetrzni = new Set<string>();
  const przyjezdni = new Set<string>();
  for (const d of w.dziennik) {
    if (d.typ === 'zwiazek' && d.z !== undefined) zewnetrzni.add(d.z);
    if (d.typ === 'wprowadzka' && d.rok > ROK_PRZYJEZDNYCH) przyjezdni.add(d.kto);
  }

  const znajdz = (id: string | undefined): Osoba | undefined => (id === undefined ? undefined : wg.get(id));
  const maRodzicow = (o: Osoba): boolean => znajdz(o.ojciec) !== undefined || znajdz(o.matka) !== undefined;

  const wlasne = new Map<string, Para>();
  const obecne = new Map<string, Para>();
  const domowe = new Map<string, Para>();
  const wToku = new Set<string>();

  /** Gospodarstwo osoby, a dla nieobecnej (zmarłej, która wyjechała) gospodarstwo jej partnera albo dziecka. */
  const gospodarstwoRodziny = (o: Osoba): Gospodarstwo | undefined => {
    const swoje = dom.get(o.id);
    if (swoje) return swoje;
    const partner = znajdz(o.partner);
    const uPartnera = partner && dom.get(partner.id);
    if (uPartnera) return uPartnera;
    for (const d of dzieci.get(o.id) ?? []) {
      const uDziecka = dom.get(d.id);
      if (uDziecka) return uDziecka;
    }
    return undefined;
  };

  /** Nazwisko rodziny gospodarstwa osoby, losowane raz; bez gospodarstwa osobne losowanie. */
  const rodzinne = (o: Osoba): Para => {
    const g = gospodarstwoRodziny(o);
    if (!g) return nazwiskoRodziny(n, r);
    let p = domowe.get(g.id);
    if (!p) domowe.set(g.id, (p = nazwiskoRodziny(n, r)));
    return p;
  };

  /** Nazwisko osoby bez rodziców w budynku: początek linii rodziny albo osoba z zewnątrz. */
  const zKorzenia = (o: Osoba): Para => {
    if (zewnetrzni.has(o.id)) return nazwiskoPartnera(n, r);
    const partner = znajdz(o.partner);
    if (!partner) return rodzinne(o);
    const partnerZewnetrzny = zewnetrzni.has(partner.id);
    if (o.plec === 'M') return !partnerZewnetrzny && maRodzicow(partner) ? nazwiskoPartnera(n, r) : rodzinne(o);
    return partnerZewnetrzny ? rodzinne(o) : nazwiskoPartnera(n, r);
  };

  /** Nazwisko, z którym osoba przyszła na świat albo które ma po swojej linii: po ojcu, bez ojca po matce (takie,
      jakie ona nosi), bez rodziców z korzenia rodziny. */
  const wlasna = (o: Osoba): Para => {
    const gotowe = wlasne.get(o.id);
    if (gotowe) return gotowe;
    if (wToku.has(o.id)) return nazwiskoRodziny(n, r); // cykl w danych: osobne losowanie
    wToku.add(o.id);
    const ojciec = znajdz(o.ojciec);
    const matka = znajdz(o.matka);
    const p = ojciec ? wlasna(ojciec) : matka ? obecna(matka) : zKorzenia(o);
    wToku.delete(o.id);
    wlasne.set(o.id, p);
    return p;
  };

  /** Nazwisko, które osoba nosi: mężczyzna swoje, kobieta z partnerem w 85% nazwisko partnera. */
  const obecna = (o: Osoba): Para => {
    if (o.plec === 'M') return wlasna(o);
    const gotowe = obecne.get(o.id);
    if (gotowe) return gotowe;
    const maz = znajdz(o.partner);
    const p = maz && maz.plec === 'M' && szansa(r, SZANSA_ZONY_BIERZE) ? wlasna(maz) : wlasna(o);
    obecne.set(o.id, p);
    return p;
  };

  /** Imiona dzieci każdej matki i ojca: rodzeństwo (także przyrodnie i nieobecne) nie ma wspólnego imienia. */
  const imionaDzieci = new Map<string, Set<string>>();
  const imie = (o: Osoba): string => {
    const rodzice = [o.matka, o.ojciec].filter((id): id is string => id !== undefined);
    const zajete = rodzice.map((id) => imionaDzieci.get(id)).filter((s): s is Set<string> => s !== undefined);
    let wybrane = '';
    for (let i = 0; i < PROBY_IMIENIA; i++) {
      wybrane = imieDla(o.rocznik, o.plec, t, r, przyjezdni.has(o.id));
      if (!zajete.some((s) => s.has(wybrane))) break;
    }
    if (wybrane !== '') {
      for (const id of rodzice) {
        const s = imionaDzieci.get(id);
        if (s) s.add(wybrane);
        else imionaDzieci.set(id, new Set([wybrane]));
      }
    }
    return wybrane;
  };

  for (const o of w.osoby) {
    const nazwisko = obecna(o);
    o.nazwisko = o.plec === 'M' ? nazwisko[0] : nazwisko[1];
    o.imie = imie(o);
  }
}
