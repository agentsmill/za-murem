/* Cel wyprawy, stan miasta w zarządzie, ryzyko, czas drogi i łup (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md,
   „Miejsca” i „Wyprawa”). Czyste funkcje bez symulacji, bez sieci i bez losowania ze stanu: karta nocy, wysyłanie
   wyprawy z mapy miasta i rozliczenie powrotu korzystają z nich wspólnie.

   Cel (`Cel`) to opis miejsca, do którego idzie wyprawa, zapisany w stanie zarządu w całości (klucz, nazwa w obu
   językach, kategoria, położenie, ryzyko, łup, zapas), więc powrót i łup liczą się bez kafelków miasta, a zapis
   i wczytanie niczego nie dociągają. Dwa źródła celu: miejsce z OSM (`celZMiejsca`, z `POICAT` z 0.3 przeliczonego na
   zapasy zarządu) albo dzisiejszy zmyślony cel z `TARGETS` (`celZTarget`, `zapas: null`, czyli bez końca, jak dotąd).

   Jednostki. Odległość w metrach w linii prostej od adresu przychodzi z `Miejsce.odl` (liczone przez `Math.sqrt`);
   ten moduł jej nie liczy, a nowy kod zarządu nie używa hypot, sin i cos (zapisy przechodzą między
   przeglądarkami). `Cel.powrot` to GODZINA powrotu z karty nocy (1 albo 5), a `Wyprawa.powrot`
   z typy.ts to MINUTA GRY od północy pierwszego dnia (jak `gameMin`), liczona przez `powrotMin`. Czasy w minutach gry.

   Zapas miejsca (`zapasStartowy`) zależy tylko od klucza i kategorii (skrót klucza), nie od ziarna gry ani świata,
   więc ten sam sklep ma ten sam zapas u każdego gracza w mieście. Co zabrano, trzyma `GovState.miasto`; pole pojawia się
   dopiero po `wlaczMiasto` (opcja `miasto`), a `newGov` bez opcji go nie ma, więc skróty botów bez flagi nie drgną.

   Wybór celów karty nocy (`wybierzCeleNocy`): „blisko” to najbliższe niewyczerpane miejsce z okolicy poza mapą lokalną
   (do 300 m, a gdy takiego nie ma, najbliższe do 720 m), „daleko” to miejsce o największym braku jedzenia, leków
   i części. Bez stanu miasta (`GovState.miasto`) albo bez miejsc do wyboru karta ma dzisiejsze cele z TARGETS
   (`celeZTargets`, wybór według liczby wizyt), więc bot i testy bez opcji `miasto` grają jak dotąd.

   Kategorie miejsc to klucze `KAT_EN` (src/content/miejsca.en.ts), czyli `POICAT` bez `mieszkania`. Każda inna
   kategoria (także `mieszkania`, które jest celem z 0.3, nie punktem z OSM) liczy się jak `POICAT.sklep`.

   Wyprawy dzienne w drodze (`GovState.wyprawy`, src/gov/dzienne.ts) czyta stąd `wDrodze`, żeby karta nocy (noc.ts)
   i wysyłka widziały je bez cyklu importów.

   Wskazówki (`GovState.wskazowki`, wiadomość od gościa, src/gov/wizyta.ts): klucz miejsca z okolicy albo id celu
   z TARGETS (`Cel.klucz`) → dzień gry. Następna wyprawa do tego miejsca ma ryzyko razy `WSKAZOWKA_RYZYKO` (karta nocy
   i podgląd wyprawy dziennej pokazują już zmniejszone, `maWskazowke` tylko czyta) i łup razy `WSKAZOWKA_LUP`;
   rozliczenie (`rozliczWyprawe`) zużywa ją przez `wskazowka`, więc każda wskazówka działa na jedną wyprawę. */

import { POICAT, type Res } from '../content/data.ts';
import { KAT_EN } from '../content/miejsca.en.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { hashString, mulberry } from '../core/rng.ts';
import { type Miejsce, naMapieLokalnej } from '../world/miasto.ts';
import { placeIn } from './miejsce.ts';
import { type ExpTarget, TARGETS, targetNameTx } from './tresc.ts';
import type { GovInput, GovPlace, GovState, LootKey, StockDelta } from './typy.ts';
import { atHour, STOCK_KEYS, zeroStock } from './wspolne.ts';

/** łup z POICAT (jednostki 0.3) razy tyle daje łup w jednostkach zarządu; skalę stroi bot */
export const SKALA_LUPU = 0.5;
/** najdalej tyle metrów w jedną stronę: dalej nie da się wrócić tego samego dnia */
export const MAX_DROGA_M = 5000;
/** ile sztuk łupu niesie jedna osoba */
export const UDZWIG_NA_OSOBE = 6;
/** do tylu metrów wyprawa jest „blisko” (wraca o 1:00), dalej „daleko” (o świcie) */
export const BLISKO_DO_M = 300;
/** najdalej tyle metrów od adresu leży miejsce, do którego karta nocy proponuje wyprawę (zasięg `geo.poi`) */
export const MAX_OKOLICA_M = 720;
/** jednostki łupu z 0.3 (Res) na zapasy zarządu; prądu z miejsc się nie wynosi */
export const LUP_03: Readonly<Partial<Record<Res, LootKey>>> = {
  jedzenie: 'supplies',
  opal: 'wood',
  leki: 'meds',
  zlom: 'scrap',
  czesci: 'parts',
};

/** 3 km/h w metrach na minutę */
export const METROW_NA_MIN = 50;
/** ulice są dłuższe niż linia prosta */
export const KRZYWIZNA_ULIC = 1.4;
/** przeszukanie: jedna osoba 3 godziny, każda następna godzinę mniej, najkrócej godzina */
export const PRZESZUKANIE_MIN = 180;
export const PRZESZUKANIE_KROK_MIN = 60;
export const PRZESZUKANIE_NAJKROCEJ_MIN = 60;
/** wyprawa, która wraca po 20:00, wraca o 6:00 następnego dnia */
const GODZINA_ZMIERZCHU = 20;
const GODZINA_SWITU = 6;
/** ryzyko rośnie z odległością: razy (1 + odl / tyle) */
export const RYZYKO_ODL_M = 900;
/** zapas startowy: ułamek miejsc pustych, mnożnik łupu (od, rozstęp) i górna granica */
export const PUSTE_MIEJSCA = 0.25;
export const ZAPAS_MNOZNIK_OD = 3;
export const ZAPAS_MNOZNIK_ROZSTEP = 3;
export const ZAPAS_MAX = 60;

/** Cel wyprawy: miejsce z OSM albo cel z TARGETS. Siedzi w stanie zarządu (JSON), więc same liczby i napisy Tx. */
export interface Cel {
  /** klucz miejsca „poi:X:Y” albo id z TARGETS */
  klucz: string;
  nazwa: Tx;
  /** kategoria miejsca (klucz POICAT); null dla celu z TARGETS */
  kat: string | null;
  /** metry od adresu: x na wschód, y na południe (0, 0 dla celu z TARGETS) */
  x: number;
  y: number;
  /** odległość od adresu w metrach (0 dla celu z TARGETS) */
  odl: number;
  range: 'blisko' | 'daleko';
  /** współczynnik kłopotów: `POICAT.risk` razy (1 + odl / 900), od 0,08 przy adresie po około 2,3 przy 5 km
      (`MAX_DROGA_M`), więc może przekraczać 1; to nie prawdopodobieństwo, `expRisk` mnoży go przez cechy osoby i ucina
      do 0,9. Cel z TARGETS ma ryzyko z `ExpTarget.risk` (0–1) */
  ryzyko: number;
  /** spodziewany łup (od, do) na wyprawę, w zapasach zarządu */
  lup: Partial<Record<LootKey, [number, number]>>;
  /** GODZINA powrotu z karty nocy (1 albo 5); wyprawa dzienna ma minutę powrotu w `Wyprawa.powrot` */
  powrot: number;
  /** ile łącznie da się z miejsca wynieść; null: cel z TARGETS, bez końca */
  zapas: number | null;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** kategoria miejsca: znana z KAT_EN albo sklep. hasOwn, żeby „constructor” i podobne nie trafiły do POICAT. */
const kategoria = (kat: string): string => (Object.hasOwn(KAT_EN, kat) ? kat : 'sklep');

/** Nazwa kategorii w obu językach: polska z POICAT, angielska z KAT_EN; nieznana kategoria to sklep. */
export function nazwaKategorii(kat: string): Tx {
  const k = kategoria(kat);
  return tx(POICAT[k].name, KAT_EN[k]);
}

/** Łup kategorii w zapasach zarządu: przedziały z POICAT[kat].loot przez LUP_03, oba końce razy SKALA_LUPU
    i zaokrąglone; pary [0, 0] odpadają. */
function lupKategorii(kat: string): Cel['lup'] {
  const lup: Cel['lup'] = {};
  for (const [res, [a, b]] of Object.entries(POICAT[kategoria(kat)].loot) as [Res, [number, number]][]) {
    const klucz = LUP_03[res];
    if (!klucz) continue;
    const od = Math.round(a * SKALA_LUPU);
    const doMax = Math.round(b * SKALA_LUPU);
    if (od === 0 && doMax === 0) continue;
    lup[klucz] = [od, doMax];
  }
  return lup;
}

/** Zapas z klucza i łupu: pierwszy los poniżej PUSTE_MIEJSCA to miejsce wybrane od lat (0), inaczej średni łup
    razy 3–6, najwyżej ZAPAS_MAX. Generator z samego skrótu klucza. */
function zapasZLupu(klucz: string, lup: Cel['lup']): number {
  const r = mulberry(parseInt(hashString(klucz), 16));
  if (r() < PUSTE_MIEJSCA) return 0;
  let srednia = 0;
  for (const [a, b] of Object.values(lup)) srednia += (a + b) / 2;
  return Math.min(ZAPAS_MAX, Math.round(srednia * (ZAPAS_MNOZNIK_OD + ZAPAS_MNOZNIK_ROZSTEP * r())));
}

/** Zapas startowy miejsca: ten sam dla tego samego klucza i kategorii u każdego gracza, bez ziarna gry (0–60). */
export function zapasStartowy(klucz: string, kat: string): number {
  return zapasZLupu(klucz, lupKategorii(kat));
}

/** Nazwa celu z miejsca: kategoria, a z niepustą nazwą (po filtrze nazw wywołującego) kategoria z nazwą w nawiasie.
    Nazwa równa kategorii w którymkolwiek języku nie powtarza się. */
function nazwaCelu(kat: string, wlasna: string): Tx {
  const k = nazwaKategorii(kat);
  const n = wlasna.trim();
  if (!n || n.toLowerCase() === k.pl.toLowerCase() || n.toLowerCase() === k.en.toLowerCase()) return k;
  return tx(`${k.pl} (${n})`, `${k.en} (${n})`);
}

/** Cel z miejsca z OSM: ryzyko POICAT.risk razy (1 + odl / 900), łup z POICAT razy SKALA_LUPU, zapas z klucza.
    „Daleko” powyżej BLISKO_DO_M (wraca o świcie, 5), „blisko” do niej włącznie (wraca o 1:00). */
export function celZMiejsca(m: Miejsce): Cel {
  const kat = kategoria(m.kat);
  const lup = lupKategorii(kat);
  const range = m.odl > BLISKO_DO_M ? 'daleko' : 'blisko';
  return {
    klucz: m.klucz,
    nazwa: nazwaCelu(kat, m.nazwa),
    kat: m.kat,
    x: m.x,
    y: m.y,
    odl: m.odl,
    range,
    ryzyko: round2(POICAT[kat].risk * (1 + m.odl / RYZYKO_ODL_M)),
    lup,
    powrot: range === 'daleko' ? 5 : 1,
    zapas: zapasZLupu(m.klucz, lup),
  };
}

/** Cel z dzisiejszych TARGETS (zmyślone miejsca poza mapą): wszystko z `t`, nazwa według miejsca siedziby jak na karcie
    nocy (`targetNameTx`), bez położenia i bez końca zapasu. Łup kopiowany, żeby stan nie dzielił tablic z TARGETS. */
export function celZTarget(t: ExpTarget, p: GovPlace): Cel {
  const lup: Cel['lup'] = {};
  for (const [k, [a, b]] of Object.entries(t.loot) as [LootKey, [number, number]][]) lup[k] = [a, b];
  return {
    klucz: t.id,
    nazwa: targetNameTx(t, p),
    kat: null,
    x: 0,
    y: 0,
    odl: 0,
    range: t.range,
    ryzyko: t.risk,
    lup,
    powrot: t.back,
    zapas: null,
  };
}

/** Włącza mapę miasta w stanie zarządu: dokłada puste liczniki miejsc. Idempotentne, bez losowania; wołają to gra przy
    nowej grze i przy wczytaniu starego zapisu. `newGov` bez opcji tego nie robi. */
export function wlaczMiasto(st: GovState): void {
  st.miasto ??= { zabrano: {}, wizyty: {}, ostatnia: {} };
}

/** wyprawa z wskazówką od gościa: ryzyko razy tyle, łup razy tyle */
export const WSKAZOWKA_RYZYKO = 0.5;
export const WSKAZOWKA_LUP = 1.5;

/** Czy zarząd ma wskazówkę na miejsce (klucz z okolicy albo id celu z TARGETS); nic nie zużywa. */
export const maWskazowke = (st: Pick<GovState, 'wskazowki'>, klucz: string | undefined): boolean =>
  klucz !== undefined && !!st.wskazowki?.[klucz];

/** Zużywa wskazówkę na miejsce: true, gdy była (wtedy wyprawa ma ryzyko ×0,5 i łup ×1,5, co liczy wywołujący), false,
    gdy jej nie było. Po zużyciu pole `wskazowki` zostaje, ale bez tego klucza. */
export function wskazowka(st: Pick<GovState, 'wskazowki'>, klucz: string): boolean {
  if (!maWskazowke(st, klucz)) return false;
  delete st.wskazowki![klucz];
  return true;
}

/** Czy osoba jest w którejś wyprawie dziennej w drodze (`GovState.wyprawy`). Sama flaga `away` z wejścia nie wystarcza:
    w symulacji pionek dostaje ją dopiero przy bramie, więc wyprawa wysłana tuż przed 20:00 jeszcze wygląda na „w domu”.
    Karta nocy i wysyłka wypraw liczą „poza domem” jako `away` albo `wDrodze`. */
export function wDrodze(st: Pick<GovState, 'wyprawy'>, id: string): boolean {
  return !!st.wyprawy?.some((w) => w.ids.includes(id));
}

/** Ile sztuk łupu zostało w miejscu: zapas minus to, co zabrano, nigdy poniżej 0. Cel z TARGETS (zapas null) nie
    kończy się nigdy. Bez `st.miasto` nic jeszcze nie zabrano. */
export function zostaloZMiejsca(st: GovState, cel: Cel): number {
  if (cel.zapas === null) return Infinity;
  return Math.max(0, cel.zapas - (st.miasto?.zabrano[cel.klucz] ?? 0));
}

/** Czas wyprawy w minutach: droga tam i z powrotem (linia prosta razy 1,4 przy 3 km/h) plus przeszukanie, od trzech
    godzin dla jednej osoby do godziny dla trzech i więcej. */
export function czasWyprawyMin(odl: number, osob: number): number {
  const ludzie = Math.max(1, osob);
  const droga = Math.round((2 * odl * KRZYWIZNA_ULIC) / METROW_NA_MIN);
  return droga + Math.max(PRZESZUKANIE_NAJKROCEJ_MIN, PRZESZUKANIE_MIN - PRZESZUKANIE_KROK_MIN * (ludzie - 1));
}

/** Minuta gry powrotu wyprawy, która wyszła w minucie `wyjscie`. Powrót po 20:00 dnia wyjścia (dokładnie 20:00 jeszcze
    nie) przesuwa się na 6:00 następnego dnia, ale nie przed koniec drogi (wyjście późnym wieczorem na daleki cel). */
export function powrotMin(wyjscie: number, odl: number, osob: number): number {
  const wraca = wyjscie + czasWyprawyMin(odl, osob);
  const dzien = Math.floor(wyjscie / 1440) + 1;
  if (wraca <= atHour(dzien, GODZINA_ZMIERZCHU)) return wraca;
  return Math.max(wraca, atHour(dzien + 1, GODZINA_SWITU));
}

/** Ogranicza łup do udźwigu: przy sumie powyżej pojemności każdy rodzaj skaluje się w dół przez Math.floor, inaczej
    zostaje bez zmian. Ujemne wartości i pojemność liczą się jak 0; wejścia nie zmienia. */
export function ograniczLup(got: StockDelta, pojemnosc: number): StockDelta {
  const miesci = Math.max(0, pojemnosc);
  const out = zeroStock();
  let suma = 0;
  for (const k of STOCK_KEYS) suma += Math.max(0, got[k] || 0);
  for (const k of STOCK_KEYS) {
    const v = Math.max(0, got[k] || 0);
    out[k] = suma <= miesci ? v : Math.floor((v * miesci) / suma);
  }
  return out;
}

/** Ryzyko słowem do karty miejsca i karty nocy: poniżej 0,15 spokojnie, poniżej 0,3 niepewnie, reszta groźnie. */
export function ryzykoSlowem(r: number): Tx {
  if (r < 0.15) return tx('spokojnie', 'calm');
  if (r < 0.3) return tx('niepewnie', 'uncertain');
  return tx('groźnie', 'dangerous');
}

/** Dwa dzisiejsze cele karty nocy z TARGETS: blisko i daleko, w każdym zasięgu ten z najmniejszą liczbą wizyt
    (przy remisie pierwszy z listy). Nazwy według miejsca siedziby `p`, `zapas: null`. */
export function celeZTargets(st: GovState, p: GovPlace): [Cel, Cel] {
  const najmniejOdwiedzany = (r: ExpTarget['range']): ExpTarget =>
    TARGETS.filter((t) => t.range === r).sort((a, b) => (st.visits[a.id] ?? 0) - (st.visits[b.id] ?? 0))[0];
  return [celZTarget(najmniejOdwiedzany('blisko'), p), celZTarget(najmniejOdwiedzany('daleko'), p)];
}

/** Braki, które „daleko” próbuje załatać: jedzenie, leki i części (drewno i złom nie liczą się do wyboru). */
const BRAKI: readonly LootKey[] = ['supplies', 'meds', 'parts'];

/** Brak, który miejsce zaspokaja: dla jedzenia, leków i części suma (środek przedziału łupu) / (1 + zapas w magazynie
    tego rodzaju). Im mniej mamy, tym więcej warte to samo przyniesione. */
function brakZaspokojony(cel: Cel, stock: GovInput['stock']): number {
  let suma = 0;
  for (const k of BRAKI) {
    const przedzial = cel.lup[k];
    if (przedzial) suma += (przedzial[0] + przedzial[1]) / 2 / (1 + Math.max(0, stock[k] ?? 0));
  }
  return suma;
}

/** Od najbliższego, przy równej odległości po kluczu (kolejność, w jakiej rozstrzygają się remisy). */
const poOdleglosci = (a: Cel, b: Cel): number => a.odl - b.odl || (a.klucz < b.klucz ? -1 : a.klucz > b.klucz ? 1 : 0);

/** Cele nocnych wypraw na karcie: [blisko, daleko]. Kandydaci to miejsca z `i.okolica` poza mapą lokalną, do
    `MAX_OKOLICA_M`, z czymś jeszcze w zapasie (`zostaloZMiejsca`) i bez wyprawy dziennej w drodze do tego miejsca (jej
    łup liczy się dopiero po powrocie, więc dwie wyprawy dzieliłyby jeden zapas); mapa lokalna ma własną mapę gry,
    więc jej miejsca nigdy nie są propozycją. „Blisko”: najbliższy kandydat do `BLISKO_DO_M`, a gdy go nie ma, po
    prostu najbliższy. „Daleko”: spośród pozostałych kandydat o największym `brakZaspokojony`, przy remisie mniejsza
    odległość, potem klucz. Bez `st.miasto`, bez kandydatów albo (dla „daleko”) bez drugiego kandydata miejsce zajmuje
    dzisiejszy cel z TARGETS (`celeZTargets`), więc bez mapy miasta wynik jest taki sam jak przed nią. */
export function wybierzCeleNocy(st: GovState, i: GovInput): [Cel, Cel] {
  const zTargets = celeZTargets(st, placeIn(i));
  if (!st.miasto || !i.okolica?.length) return zTargets;
  const kandydaci = i.okolica
    .filter((m) => !naMapieLokalnej(m) && m.odl <= MAX_OKOLICA_M && !st.wyprawy?.some((w) => w.cel.klucz === m.klucz))
    .map((m) => celZMiejsca(m))
    .filter((c) => zostaloZMiejsca(st, c) > 0)
    .sort(poOdleglosci);
  if (!kandydaci.length) return zTargets;
  const blisko = kandydaci.find((c) => c.odl <= BLISKO_DO_M) ?? kandydaci[0];
  let daleko: Cel | undefined;
  let najwiekszyBrak = 0;
  // kandydaci są posortowani, więc przy równym braku zostaje pierwszy: bliższy, a potem o mniejszym kluczu
  for (const c of kandydaci) {
    if (c === blisko) continue;
    const brak = brakZaspokojony(c, i.stock);
    if (!daleko || brak > najwiekszyBrak) {
      daleko = c;
      najwiekszyBrak = brak;
    }
  }
  return [blisko, daleko ?? zTargets[1]];
}
