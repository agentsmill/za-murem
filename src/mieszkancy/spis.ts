/* Gospodarstwa na spis 2021 (31 marca): budynek albo cały rejon obsadzony ludźmi zgodnie z rozkładami rejonu.
   Po kolei: typ gospodarstwa (wielkość, skład, osoba 60+) z rozkładu IPF rejonu (ipf.ts) z trzecim brzegiem
   „gospodarstwa z osobą 60+” oszacowanym z wieku rejonu, przesuniętego według epoki budynku tak, żeby średnia liczba
   osób zmieniała się jak ludność na mieszkanie w gminie (P4386); liczba osób; rodzina dopasowana do typów rodzin
   i liczby dzieci rejonu; które dzieci są małoletnie; na końcu wiek z puli rejonu (osoby.ts). Każdy budynek ma
   własne ziarno, a wszystko, co liczymy raz na rejon, ma stałe ziarna, więc wynik budynku nie zależy od reszty
   obszaru ani od kolejności. Bez trygonometrii, potęg i logarytmów; losowanie tylko przez los.ts. */

import { epokaBudynku, epokaZRoku, mieszkaniaBudynku } from './budynki.ts';
import { type Obecnosc60, rozkladGospodarstw, rozkladGospodarstw60, SKLADY, srednia5Rejonu, WIELKOSCI } from './ipf.ts';
import { losDla, szansa, wazony } from './los.ts';
import {
  type CelWieku,
  celWieku,
  MAX_OSOB,
  MAX_WIEK,
  mozliweMaloletnie,
  type OpcjeJedno,
  opcjeJedno,
  osobyZeSzkicu,
  oznaczMaloletnich,
  Pula,
  ROK_WIEKU,
  type Szkic,
  szkicGospodarstwa,
  udzialWieku,
  type WagiRodzin,
  wagiRodzin,
} from './osoby.ts';
import type { Epoka, Marginesy, Sklad, TabeleGminy, TabeleKraju, Wielkosc } from './tabele.ts';
import {
  type Budynek,
  type Gospodarstwo,
  type Osoba,
  WERSJA_GENERATORA,
  type Wpis,
  type WynikBudynku,
} from './typy.ts';

/** Bez tabeli gminy: tyle gospodarstw na 10 000 mieszkań (w Gdańsku z tabel wychodzi 0,967, w Zielonkach 0,975). */
const OBSADZENIE_BEZ_GMINY = 9500;
/** Rok oddania bloku, gdy nie ma `startDate`: środek okresu epoki (1945-1970 i 1971-1988, reguła R11). */
const SRODEK_EPOKI: Partial<Record<Epoka, number>> = { powojenna: 1958, plyta: 1980 };
/** Głowa w tym wieku w roku oddania bloku mogła dostać przydział i mieszka tu od początku. */
const PRZYDZIAL_OD = 22;
const PRZYDZIAL_DO = 40;
/** Przesunięcie wielkości według epoki mnoży wagi najwyżej tyle razy. */
const MAX_MNOZNIK_EPOKI = 4;
/** Dom jednorodzinny: wagi gospodarstw 4 i 5+ osób razy 1,5 (decyzja planu). */
const MNOZNIK_DOMU = 1.5;
const DUZE: readonly Wielkosc[] = ['4', '5+'];
const MALE: readonly Wielkosc[] = ['1', '2'];

interface Archetyp {
  wielkosc: Wielkosc;
  sklad: Sklad;
  f60: boolean;
  /** Promile z IPF. */
  promile: number;
}

/** Wszystko, co obsadzanie liczy raz na rejon (i tabelę gminy, bo z niej są proporcje wieku i miasto albo wieś). */
interface Rejon {
  archetypy: Archetyp[];
  /** Szansa na 10 000, że gospodarstwo 5+ ma o osobę więcej (do 10 osób). */
  dalej5: number;
  cel: CelWieku;
  /** Udział małoletnich w `cel`. */
  maloletni: number;
  rodziny: WagiRodzin;
  jedno: OpcjeJedno[];
  /** Wagi archetypów dla epoki i typu budynku (klucz `${teryt}|${epoka}|${typ}`, dla rejonu bez budynku `rejon`)
      z wzorcem: ile osób i ile dzieci mogących być małoletnimi daje `WZORZEC` gospodarstw z tymi wagami. */
  wagi: Map<string, Wagi>;
}

interface Wagi {
  wagi: number[];
  osob: number;
  mozliwe: number;
}

/** Tyle gospodarstw losujemy raz na rejon i typ budynku (bez wieku, z osobnym ziarnem), żeby wiedzieć, ile dzieci
    na osobę może być małoletnimi. Mały budynek sam tego nie oszacuje: dom bez dzieci nie odda swoich małoletnich
    sąsiadowi z dziećmi. */
const WZORZEC = 400;
/** Gospodarstwa z osobą 60+ w próbie, z której liczymy osoby 60+ na takie gospodarstwo, i liczba przybliżeń. */
const WZORZEC_60 = 300;
const PRZYBLIZENIA_60 = 2;

const suma = (o: Record<string, number>): number => Object.values(o).reduce((a, v) => a + (v > 0 ? v : 0), 0);

// ---------------------------------------------------------------- wielkość 5+

/** Średnia wielkość gospodarstwa 5+ przy szansie `q` na każdą kolejną osobę, od 5 do 10 osób. */
function srednia5(q: number): number {
  let s = 5;
  let qj = 1;
  for (let j = 1; j <= MAX_OSOB - 5; j++) {
    qj *= q;
    s += qj;
  }
  return s;
}

/** Szansa `q` (rzeczywista), dla której `srednia5(q)` daje `cel`: bisekcja, 40 kroków. */
function szansaDalej(cel: number): number {
  let lo = 0;
  let hi = 0.95;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (srednia5(mid) < cel) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function liczbaOsob(r: () => number, a: Archetyp, dalej5: number): number {
  if (a.wielkosc !== '5+') return Number(a.wielkosc);
  let n = 5;
  while (n < MAX_OSOB && szansa(r, dalej5)) n++;
  return a.sklad === 'trzy+' ? Math.max(6, n) : n; // trzy rodziny to co najmniej 6 osób
}

// ---------------------------------------------------------------- rejon

/** Archetypy z niezerowych komórek rozkładu, w stałej kolejności (wielkość, skład, 60+ przed bez60). */
function archetypyZ(rozklad: ReadonlyMap<string, number>): Archetyp[] {
  const wynik: Archetyp[] = [];
  for (const w of WIELKOSCI) {
    for (const s of SKLADY) {
      for (const f of ['60+', 'bez60'] as Obecnosc60[]) {
        const promile = rozklad.get(`${w}|${s}|${f}`) ?? 0;
        if (promile > 0) wynik.push({ wielkosc: w, sklad: s, f60: f === '60+', promile });
      }
    }
  }
  return wynik;
}

/** Oczekiwane gospodarstwa jednorodzinne według liczby osób (indeks 0-10), w promilach wszystkich gospodarstw. */
function jednorodzinneWgWielkosci(rejon: Rejon): number[] {
  const wynik = new Array<number>(MAX_OSOB + 1).fill(0);
  const q = rejon.dalej5 / 10000;
  for (const a of rejon.archetypy) {
    if (a.sklad !== 'jedno') continue;
    if (a.wielkosc !== '5+') {
      wynik[Number(a.wielkosc)] += a.promile;
      continue;
    }
    let p = 1;
    for (let n = 5; n < MAX_OSOB; n++) {
      wynik[n] += a.promile * p * (1 - q);
      p *= q;
    }
    wynik[MAX_OSOB] += a.promile * p;
  }
  return wynik;
}

/** Ile osób 60+ ma średnio gospodarstwo z osobą 60+ w tym generatorze: `WZORZEC_60` takich gospodarstw z osobnego
    ziarna, z wiekiem losowanym wprost z rozkładu rejonu (pula bez wyczerpania). Para po sześćdziesiątce to zwykle dwie
    osoby 60+, wdowa z dorosłym synem jedna. `NaN`, gdy rejon nie ma gospodarstw z 60+. */
function osob60NaGospodarstwo(rejon: Rejon): number {
  const r = losDla('spis', 'wzorzec60', WERSJA_GENERATORA);
  const wagi = rejon.archetypy.map((a) => (a.f60 ? a.promile : 0));
  const pula = new Pula(rejon.cel, 0, 1e12);
  let osoby = 0;
  for (const s of szkice(r, rejon, wagi, WZORZEC_60)) {
    for (const o of osobyZeSzkicu(r, pula, s, 'w', 0)) if (ROK_WIEKU - o.rocznik >= 60) osoby++;
  }
  return wagi.some((v) => v > 0) ? osoby / WZORZEC_60 : Number.NaN;
}

const pamiec = new WeakMap<TabeleKraju, WeakMap<Marginesy, Map<TabeleGminy | null, Rejon>>>();

/** Dane rejonu do obsadzania, z pamięci podręcznej na (tabele krajowe, marginesy, tabela gminy): archetypy z IPF
    (najpierw dwa brzegi, potem dwa przybliżenia z trzecim, gospodarstwami z osobą 60+), rozkład wieku, rodziny
    w gospodarstwach jednorodzinnych i wzorzec dla rejonu bez budynku. Część marginesów z samymi zerami (rejon bez
    gospodarstw, bez ludzi albo bez rodzin) zastępują marginesy Polski. */
function przygotuj(m: Marginesy, g: TabeleGminy | null, k: TabeleKraju): Rejon {
  let wgKraju = pamiec.get(k);
  if (!wgKraju) pamiec.set(k, (wgKraju = new WeakMap()));
  let wgMarg = wgKraju.get(m);
  if (!wgMarg) wgKraju.set(m, (wgMarg = new Map()));
  const gotowy = wgMarg.get(g);
  if (gotowy) return gotowy;

  const miejska = g?.miejska ?? true;
  let typy = suma(m.gospodarstwa) > 0 ? m : k.polska;
  let rozklad: ReadonlyMap<string, number> = rozkladGospodarstw(typy, k, miejska);
  if ([...rozklad.values()].every((v) => v === 0)) rozklad = rozkladGospodarstw((typy = k.polska), k, miejska);
  const cel = celWieku(m, g, k, miejska) ?? celWieku(k.polska, null, k, miejska)!;
  const rodziny = wagiRodzin(suma(m.rodziny) > 0 ? m : k.polska);
  const rejon: Rejon = {
    archetypy: archetypyZ(rozklad),
    dalej5: Math.round(szansaDalej(srednia5Rejonu(typy)) * 10000),
    cel,
    maloletni: udzialWieku(cel, 0, 17),
    rodziny,
    jedno: [],
    wagi: new Map(),
  };
  rejon.jedno = opcjeJedno(rodziny, jednorodzinneWgWielkosci(rejon));
  // Gospodarstwa z osobą 60+: tyle, ile trzeba, żeby osoby 60+ (udział z rozkładu wieku razy osoby w gospodarstwach)
  // zmieściły się przy liczbie osób 60+ na takie gospodarstwo, jaką daje sam generator. Dwa przybliżenia, bo ta
  // liczba zależy od rozkładu typów.
  const n = typy.gospodarstwa;
  const wGospodarstwach = n['1'] + 2 * n['2'] + 3 * n['3'] + 4 * n['4'] + srednia5(rejon.dalej5 / 10000) * n['5+'];
  const osoby60 = udzialWieku(cel, 60, MAX_WIEK) * wGospodarstwach;
  for (let i = 0; i < PRZYBLIZENIA_60; i++) {
    const naGospodarstwo = osob60NaGospodarstwo(rejon);
    if (!(naGospodarstwo > 0)) break;
    rejon.archetypy = archetypyZ(rozkladGospodarstw60(typy, k, miejska, osoby60 / naGospodarstwo));
  }
  rejon.wagi.set(
    'rejon',
    zWzorcem(
      rejon,
      rejon.archetypy.map((a) => a.promile * 1000),
    ),
  );
  wgMarg.set(g, rejon);
  return rejon;
}

// ---------------------------------------------------------------- epoka i typ budynku

const pamiecEpok = new WeakMap<TabeleGminy, Map<Epoka, { wielkosci: readonly Wielkosc[]; f: number }>>();

/** Mnożnik wag wielkości dla epoki, raz na gminę i epokę: średnia osób w gospodarstwie gminy (wielkości z sumy
    rejonów, 5+ z bilansu) ma się zmienić tak jak ludność na mieszkanie w epoce wobec całej gminy (P4386). Gdy epoka
    ma więcej osób na mieszkanie, mnożymy wagi 4 i 5+, gdy mniej, wagi 1 i 2, przy czym mnożnik f rozwiązuje
    (A + f B) / (C + f D) = cel i jest przycięty do [1, 4]. */
function mnoznikEpoki(g: TabeleGminy, epoka: Epoka): { wielkosci: readonly Wielkosc[]; f: number } {
  let wgEpoki = pamiecEpok.get(g);
  if (!wgEpoki) pamiecEpok.set(g, (wgEpoki = new Map()));
  const gotowy = wgEpoki.get(epoka);
  if (gotowy) return gotowy;

  let osoby = 0;
  let mieszkania = 0;
  for (const e of Object.values(g.epoki)) {
    osoby += e.osoby;
    mieszkania += e.mieszkania;
  }
  const e = g.epoki[epoka];
  const n = g.gmina.gospodarstwa;
  const sredniaPiatki = srednia5(szansaDalej(srednia5Rejonu(g.gmina)));
  const rozmiar = (w: Wielkosc): number => (w === '5+' ? sredniaPiatki : Number(w));
  const wszystkie = suma(n);
  let wynik = { wielkosci: DUZE, f: 1 };
  if (e && e.mieszkania > 0 && e.osoby > 0 && osoby > 0 && mieszkania > 0 && wszystkie > 0) {
    const srednia = WIELKOSCI.reduce((a, w) => a + n[w] * rozmiar(w), 0) / wszystkie;
    const cel = (srednia * (e.osoby / e.mieszkania)) / (osoby / mieszkania);
    const wielkosci = cel > srednia ? DUZE : MALE;
    let A = 0;
    let B = 0;
    let C = 0;
    let D = 0;
    for (const w of WIELKOSCI) {
      if (wielkosci.includes(w)) {
        B += n[w] * rozmiar(w);
        D += n[w];
      } else {
        A += n[w] * rozmiar(w);
        C += n[w];
      }
    }
    const licznik = cel * C - A;
    const mianownik = B - cel * D;
    const f = mianownik !== 0 && licznik / mianownik > 0 ? licznik / mianownik : MAX_MNOZNIK_EPOKI;
    wynik = { wielkosci, f: Math.max(1, Math.min(MAX_MNOZNIK_EPOKI, f)) };
  }
  wgEpoki.set(epoka, wynik);
  return wynik;
}

/** Szkice `liczba` gospodarstw z wag archetypów (typ, wielkość, rodziny), bez wieku. */
function szkice(r: () => number, rejon: Rejon, wagi: readonly number[], liczba: number): Szkic[][] {
  const wynik: Szkic[][] = [];
  for (let i = 0; i < liczba; i++) {
    const a = rejon.archetypy[Math.max(0, wazony(r, wagi))];
    const n = liczbaOsob(r, a, rejon.dalej5);
    wynik.push(szkicGospodarstwa(r, a.sklad, a.f60, n, rejon.rodziny, rejon.jedno[n]));
  }
  return wynik;
}

/** Wagi z wzorcem: `WZORZEC` gospodarstw z osobnego ziarna, policzone osoby i dzieci mogące być małoletnimi. */
function zWzorcem(rejon: Rejon, wagi: number[]): Wagi {
  const wzorzec = szkice(losDla('spis', 'wzorzec', WERSJA_GENERATORA), rejon, wagi, WZORZEC);
  let osob = 0;
  for (const s of wzorzec) osob += s.length;
  return { wagi, osob, mozliwe: mozliweMaloletnie(wzorzec) };
}

/** Wagi całkowite archetypów rejonu dla budynku: promile × mnożnik epoki (z tabelą gminy) × 1,5 dla 4 i 5+ w domu. */
function wagiBudynku(rejon: Rejon, g: TabeleGminy | null, epoka: Epoka, typ: Budynek['typ']): Wagi {
  const klucz = `${g ? g.teryt : '-'}|${epoka}|${typ}`;
  const gotowe = rejon.wagi.get(klucz);
  if (gotowe) return gotowe;
  const ep = g ? mnoznikEpoki(g, epoka) : { wielkosci: DUZE, f: 1 };
  const wagi = rejon.archetypy.map((a) => {
    const fEpoki = ep.wielkosci.includes(a.wielkosc) ? ep.f : 1;
    const fDomu = typ === 'dom' && DUZE.includes(a.wielkosc) ? MNOZNIK_DOMU : 1;
    return Math.round(a.promile * fEpoki * fDomu * 1000);
  });
  const wynik = zWzorcem(rejon, wagi);
  rejon.wagi.set(klucz, wynik);
  return wynik;
}

/** Gospodarstwa na 10 000 mieszkań: suma gospodarstw rejonów gminy przez sumę mieszkań w epokach (R14), najwyżej
    10 000; bez gminy 9 500. */
function obsadzenie(g: TabeleGminy | null): number {
  if (!g) return OBSADZENIE_BEZ_GMINY;
  let mieszkania = 0;
  for (const e of Object.values(g.epoki)) mieszkania += e.mieszkania;
  const gospodarstwa = suma(g.gmina.gospodarstwa);
  if (!(mieszkania > 0) || !(gospodarstwa > 0)) return OBSADZENIE_BEZ_GMINY;
  return Math.min(10000, Math.round((gospodarstwa / mieszkania) * 10000));
}

// ---------------------------------------------------------------- obsadzanie

/** Rdzeń: `liczba` gospodarstw z wag archetypów, małoletni wśród dzieci, potem wiek wszystkich z jednej puli
    budynku. Szansa na małoletnie dziecko to oczekiwani małoletni przez dzieci mogące nimi być, w budynku razem
    z wzorcem rejonu. */
function obsadz(
  r: () => number,
  rejon: Rejon,
  wagi: Wagi,
  liczba: number,
  budynek: Budynek,
  rokOddania: number | undefined,
): WynikBudynku {
  const budynekSzkice = szkice(r, rejon, wagi.wagi, liczba);
  let osob = 0;
  for (const s of budynekSzkice) osob += s.length;
  const mozliwe = mozliweMaloletnie(budynekSzkice) + wagi.mozliwe;
  const p10k = mozliwe > 0 ? Math.round(((rejon.maloletni * (osob + wagi.osob)) / mozliwe) * 10000) : 0;
  oznaczMaloletnich(r, budynekSzkice, Math.min(10000, p10k));
  const pula = new Pula(rejon.cel, osob);
  const osoby: Osoba[] = [];
  const gospodarstwa: Gospodarstwo[] = [];
  const dziennik: Wpis[] = [];
  const klatki = Math.max(1, budynek.klatki);
  budynekSzkice.forEach((s, i) => {
    const czlonkowie = osobyZeSzkicu(r, pula, s, budynek.klucz, osoby.length);
    const glowa = czlonkowie[0];
    const odOddania =
      rokOddania !== undefined &&
      rokOddania - glowa.rocznik >= PRZYDZIAL_OD &&
      rokOddania - glowa.rocznik <= PRZYDZIAL_DO;
    if (odOddania) dziennik.push({ rok: rokOddania, typ: 'przydzial', kto: glowa.id });
    gospodarstwa.push({
      id: `${budynek.klucz}/g${i}`,
      budynek: budynek.klucz,
      klatka: 1 + (i % klatki),
      czlonkowie: czlonkowie.map((o) => o.id),
      odOddania,
    });
    for (const o of czlonkowie) osoby.push(o);
  });
  return { budynek, osoby, gospodarstwa, dziennik, puste: Math.max(0, (budynek.mieszkania ?? liczba) - liczba) };
}

/** Rok oddania bloku z epoki powojennej albo płyty: `startDate`, gdy pasuje do epoki, inaczej środek epoki. */
function rokOddaniaBloku(b: Budynek, epoka: Epoka): number | undefined {
  const srodek = SRODEK_EPOKI[epoka];
  if (b.typ !== 'blok' || srodek === undefined) return undefined;
  return b.startDate !== undefined && epokaZRoku(b.startDate) === epoka ? b.startDate : srodek;
}

/** Budynek obsadzony na spis 2021. `m` to marginesy rejonu budynku (`marginesyDla(g, b.rejon)`, bez gminy
    `k.polska`), `g` tabela gminy albo `null`. Epoka i liczba mieszkań z budynku, a gdy ich nie ma, z budynki.ts.
    Gospodarstw jest `mieszkania × obsadzenie` (reszta ułamka losowana), reszta mieszkań stoi pusta (`puste`).
    Gospodarstwa idą na klatki po kolei (1, 2, …, 1, 2, …). W bloku z epoki powojennej albo płyty gospodarstwo,
    którego głowa miała w roku oddania 22-40 lat, mieszka tu od oddania (`odOddania`) i ma wpis `przydzial`. Ziarno
    `losDla('spis', b.rejon, b.klucz, WERSJA_GENERATORA)`. Budynek w wyniku to kopia z uzupełnioną epoką
    i mieszkaniami. */
export function obsadzBudynek(b: Budynek, m: Marginesy, g: TabeleGminy | null, k: TabeleKraju): WynikBudynku {
  const epoka = b.epoka ?? epokaBudynku(b, g);
  const mieszkania = b.mieszkania ?? mieszkaniaBudynku({ ...b, epoka }, g, k);
  const budynek: Budynek = { ...b, epoka, mieszkania };
  const r = losDla('spis', b.rejon, b.klucz, WERSJA_GENERATORA);
  const wszystkie = mieszkania * obsadzenie(g);
  const pewne = Math.floor(wszystkie / 10000);
  const liczba = Math.min(mieszkania, pewne + (szansa(r, wszystkie - pewne * 10000) ? 1 : 0));
  const rejon = przygotuj(m, g, k);
  return obsadz(r, rejon, wagiBudynku(rejon, g, epoka, b.typ), liczba, budynek, rokOddaniaBloku(budynek, epoka));
}

/** Rejon bez budynków, do testu wstecznego: `liczba` gospodarstw (bez pustych mieszkań) z rozkładów `m`, bez
    przesunięcia epoki i bez przydziałów. `g` (opcjonalnie) daje proporcje wieku w 5-latkach i miasto albo wieś;
    bez niego rozkład w grupach 10-letnich jest równy, a szablon miejski. Ziarno `losDla('spis', 'rejon', ziarno,
    WERSJA_GENERATORA)`, klucz sztucznego budynku `rejon:${ziarno}`. */
export function obsadzRejon(
  m: Marginesy,
  liczba: number,
  k: TabeleKraju,
  ziarno: string,
  g: TabeleGminy | null = null,
): WynikBudynku {
  const n = Math.max(0, Math.floor(liczba));
  const budynek: Budynek = {
    klucz: `rejon:${ziarno}`,
    lat: 0,
    lon: 0,
    rejon: '',
    typ: 'blok',
    kondygnacje: 0,
    pole: 0,
    szerokosc: 0,
    dlugosc: 0,
    klatki: 1,
    mieszkania: n,
  };
  const rejon = przygotuj(m, g, k);
  const r = losDla('spis', 'rejon', ziarno, WERSJA_GENERATORA);
  return obsadz(r, rejon, rejon.wagi.get('rejon')!, n, budynek, undefined);
}
