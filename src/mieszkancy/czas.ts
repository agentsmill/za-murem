/* Dwadzieścia pięć lat: budynek obsadzony na spis 2021 (spis.ts) postarzany krokami po 5 lat, do 2026 bez upadku i
   do 2051 z upadkiem (specyfikacja, rozdział 5). Kroki kończą się 1 stycznia 2026, 2031, …, 2051 i obejmują lata
   kalendarzowe 2021-2025, 2026-2030, …, 2046-2050. Spis ma wiek w skali `2020 - rocznik` (osoby.ts), czyli stan na
   przełom 2020 i 2021 roku, więc pierwszy krok to pełne 5 lat w tej skali, choć od dnia spisu (31.03.2021) mija 4,75
   roku; wynik „2026” to stan na koniec 2025 roku (jak tablica P2137 z 31.12.2025 w teście wstecznym). Wynik „2051” to
   stan na 1 stycznia 2051: miesięcy od stycznia do migawki gry (1 października 2051) nie symulujemy, więc nikt nie ma
   rocznika 2051, a wiek w grze liczy się z rocznika.

   W kroku najpierw rok po roku zgony i urodzenia, potem zdarzenia z szansą na cały krok (czas-ruch.ts). Ziarno kroku
   `losDla('czas', klucz budynku, rok końca kroku)`, więc kroki się składają: 2021→2026→2051 daje to samo co
   2021→2051, a krok zależy tylko od stanu budynku. Wejście zostaje nietknięte. Osoby, które wyjechały, zostają
   z `stan: 'wyjechal'` i `dokad` bez dalszej symulacji, zmarli ze `stan: 'zmarl'`. Losowanie na liczbach
   całkowitych (zgon na 100 000, reszta na 10 000), bez trygonometrii, potęg i logarytmów. */

import type { Rng } from '../core/rng.ts';
import type { Obszar } from './czas-dokad.ts';
import { emigracje, type Kontekst, powroty, przeprowadzki, wyprowadzki, zasiedlenie, zwiazki } from './czas-ruch.ts';
import {
  koniecKroku,
  LATA_KROKU,
  nowaOsoba,
  partnerTu,
  poczatekKroku,
  przyjmij,
  type Stan,
  sieroty,
  stanZ,
  usun,
  wpis,
  wynikZ,
} from './czas-stan.ts';
import { DZWIGNIE, PRZEJSCIA } from './dzwignie.ts';
import { losDla, szansa } from './los.ts';
import type { KluczQx, TabeleGminy, TabeleKraju } from './tabele.ts';
import type { Osoba, WynikBudynku } from './typy.ts';

export type { Obszar } from './czas-dokad.ts';

export const ROK_SPISU = 2021;
/** Lata końca kroków: pierwszy bez upadku, pięć kolejnych z dźwigniami. */
export const KROKI = [2026, 2031, 2036, 2041, 2046, 2051] as const;
const MIASTO_100K = 100000;
/** Dzielnice Warszawy mają w tabelach własne kody TERYT 1465xxx, ale to wciąż miasto 100 tys.+. */
const WARSZAWA = '1465';
const PLODNOSC_OD = 15;
const PLODNOSC_DO = 49;

/** Obszar do płodności, umieralności i kierunków wyjazdów: miasto 100 tys.+ (gmina z ludnością od 100 000 według
    sumy rejonów, a także dzielnica Warszawy), inne miasto, wieś (`miejska === false`). Bez gminy: inne miasto. */
export function obszarGminy(g: TabeleGminy | null): Obszar {
  if (!g) return 'miasto';
  if (!g.miejska) return 'wies';
  let ludnosc = 0;
  for (const plec of ['M', 'K'] as const) for (const v of Object.values(g.gmina.wiek[plec])) ludnosc += v;
  return ludnosc >= MIASTO_100K || g.teryt.startsWith(WARSZAWA) ? 'miasto100k' : 'miasto';
}

// ---------------------------------------------------------------- zgony i urodzenia

const pamiecZgonow = new WeakMap<TabeleKraju, Map<string, Int32Array>>();

/** Szansa zgonu w roku `rok` na 100 000 według wieku osiągniętego w tym roku (A = rok - rocznik, od 1 do
    `maxWiek`). Na początku roku osoba ma A - 1 lat i w ciągu roku przechodzi przez pół przedziału [A - 1, A] i pół
    [A, A + 1], więc bierzemy średnią qx(A - 1) i qx(A) (powyżej 100 lat qx(100)). Do tego poprawa umieralności
    z `PRZEJSCIA` (po upadku tylko do `DZWIGNIE.poprawaUmieralnosciDo`) i dźwignia 75+. Od `maxWiek` pewny zgon. */
function zgonyWRoku(k: TabeleKraju, klucz: KluczQx, rok: number, upadek: boolean): Int32Array {
  let wgKraju = pamiecZgonow.get(k);
  if (!wgKraju) pamiecZgonow.set(k, (wgKraju = new Map()));
  const id = `${klucz}|${rok}|${upadek ? 1 : 0}`;
  const gotowe = wgKraju.get(id);
  if (gotowe) return gotowe;
  const qx = k.qx[klucz];
  const ostatni = qx.length - 1;
  const lata = (upadek ? Math.min(rok, DZWIGNIE.poprawaUmieralnosciDo) : rok) - PRZEJSCIA.rokTablicy;
  const krok = PRZEJSCIA.poprawaUmieralnosci / 10000;
  let poprawa = 1;
  for (let i = 0; i < lata; i++) poprawa *= krok;
  for (let i = 0; i > lata; i--) poprawa /= krok;
  const d = DZWIGNIE.umieralnosc75;
  const wynik = new Int32Array(PRZEJSCIA.maxWiek + 1);
  for (let a = 1; a <= PRZEJSCIA.maxWiek; a++) {
    if (a >= PRZEJSCIA.maxWiek) {
      wynik[a] = 100000;
      continue;
    }
    let q = ((qx[Math.min(a - 1, ostatni)] + qx[Math.min(a, ostatni)]) / 2) * poprawa;
    if (upadek && rok >= d.od && rok <= d.do && a >= d.odWieku) q = (q * d.mnoznik) / 10000;
    wynik[a] = Math.min(100000, Math.round(q));
  }
  wgKraju.set(id, wynik);
  return wynik;
}

/** Szansa urodzenia dziecka w roku na 10 000 kobiet według wieku osiągniętego w tym roku (15-49): krzywa `plodnosc`
    × mnożnik obszaru, po upadku × spadek urodzeń w latach 2030-2035. */
function urodzeniaWRoku(k: TabeleKraju, obszar: Obszar, rok: number, upadek: boolean): number[] {
  const d = DZWIGNIE.urodzeniaSpadek;
  const dzwignia = upadek && rok >= d.od && rok <= d.do ? d.mnoznik : 10000;
  const m = k.mnoznikPlodnosci[obszar];
  return k.plodnosc.map((f) => Math.round((f * m * dzwignia) / 1e8));
}

function zgon(s: Stan, o: Osoba, rok: number): void {
  const p = partnerTu(s, o);
  o.stan = 'zmarl';
  wpis(s, { rok, typ: 'zgon', kto: o.id });
  if (p) wpis(s, { rok, typ: 'owdowienie', kto: p.id, z: o.id });
  sieroty(s, usun(s, o, rok), rok);
}

/** Noworodek w gospodarstwie matki; ojciec to jej partner z tego gospodarstwa, jeśli jest. */
function urodzenie(s: Stan, r: Rng, matka: Osoba, rok: number): void {
  const dom = s.dom.get(matka.id)!;
  const p = partnerTu(s, matka);
  const ojciec = p && p.plec === 'M' && s.dom.get(p.id) === dom ? p : undefined;
  const d = nowaOsoba(s, szansa(r, PRZEJSCIA.chlopcy) ? 'M' : 'K', rok, matka, ojciec);
  przyjmij(s, d, dom);
  wpis(s, { rok, typ: 'urodzenie', kto: d.id, z: matka.id });
}

/** Jeden rok kalendarzowy: każdy mieszkaniec (urodzony przed tym rokiem) losuje zgon, potem każda kobieta w wieku
    15-49 lat losuje urodzenie. Noworodki z tego roku nie losują już niczego. */
function rokZycia(s: Stan, r: Rng, rok: number, kt: Kontekst): void {
  const q = zgonyWRoku(kt.k, kt.obszar === 'wies' ? 'wiesM' : 'miastaM', rok, kt.upadek);
  const qK = zgonyWRoku(kt.k, kt.obszar === 'wies' ? 'wiesK' : 'miastaK', rok, kt.upadek);
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    if (o.stan !== 'tu' || o.rocznik >= rok) continue;
    const a = Math.min(PRZEJSCIA.maxWiek, rok - o.rocznik);
    if (Math.floor(r() * 100000) < (o.plec === 'M' ? q : qK)[a]) zgon(s, o, rok);
  }
  const f = urodzeniaWRoku(kt.k, kt.obszar, rok, kt.upadek);
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    if (o.stan !== 'tu' || o.plec !== 'K') continue;
    const a = rok - o.rocznik;
    if (a >= PLODNOSC_OD && a <= PLODNOSC_DO && szansa(r, f[a - PLODNOSC_OD])) urodzenie(s, r, o, rok);
  }
}

// ---------------------------------------------------------------- krok i całość

function krok(s: Stan, doRoku: number, kt: Kontekst): void {
  const poczatek = doRoku - LATA_KROKU;
  poczatekKroku(s, poczatek);
  const r = losDla('czas', s.budynek.klucz, doRoku);
  for (let rok = poczatek; rok < doRoku; rok++) rokZycia(s, r, rok, kt);
  wyprowadzki(s, r, kt);
  zwiazki(s, r);
  przeprowadzki(s, r, kt);
  emigracje(s, r, kt);
  powroty(s, r, kt);
  zasiedlenie(s, r, kt);
  koniecKroku(s);
}

/** Budynek postarzony do `doRoku` (2026 albo 2051) krokami po 5 lat. `w` to wynik spisu (obsadzBudynek,
    obsadzRejon) albo wcześniejszego `postarz` (`w.rok`); dalszy rok niż `doRoku` to RangeError. `obszar` z
    `obszarGminy(g)` wybiera tablicę trwania życia (miasta albo wieś), mnożnik płodności i kierunki wyjazdów.
    `upadek` włącza dźwignie upadku (dzwignie.ts) od kroku 2026→2031; krok 2021→2026 jest zawsze bez upadku. */
export function postarz(
  w: WynikBudynku,
  doRoku: 2026 | 2051,
  k: TabeleKraju,
  obszar: Obszar,
  upadek: boolean,
): WynikBudynku {
  const od = w.rok ?? ROK_SPISU;
  if (od > doRoku)
    throw new RangeError(`budynek ${w.budynek.klucz} jest już w roku ${od}, nie cofniemy go do ${doRoku}`);
  const s = stanZ(w);
  for (const cel of KROKI) {
    if (cel <= od || cel > doRoku) continue;
    krok(s, cel, { k, obszar, upadek: upadek && cel > KROKI[0] });
  }
  return wynikZ(s, doRoku);
}
