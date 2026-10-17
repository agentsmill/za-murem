/* Fachy na 2051 i dawne zawody mieszkańców. Generator (generuj.ts) wywołuje `nadajFachy` po `postarz` i po imionach,
   więc osoby mają już rocznik i stan, a brakuje im tylko dwóch pól: `dawnyZawod` (linijka historii i satyra, np. „dawniej
   prompt engineer”) oraz `fach` (to, co ktoś umie robić na osiedlu w 2051, razem z umiejętnościami w dziedzinach z 0.3).
   Tabela fachów jest własna, nie bierze się z tablicy zawodów z wersji 0.3: tamta zostaje nietknięta dla testu zgodności,
   a w 2051 nikt nie ma pracy z umowy, tylko rzemiosło potrzebne osiedlu. Losowanie na liczbach całkowitych przez los.ts,
   ziarno budynku podaje wywołujący (`losDla('fachy', klucz budynku)`), osoby przeglądamy w kolejności `w.osoby`.

   Dawny zawód (`dawnyZawod`) mają osoby urodzone do 2009 roku, czyli dorosłe przed upadkiem, także nieobecne i zmarłe.
   Waga zawodu zależy od wieku w roku zero (2026): każdy zawód ma przedział wieku i wagę, zawody ery cyfrowej (programista,
   prompt engineer, influencer) mają górną granicę wieku, więc seniorzy ich nie dostają, a „emeryt” ma wagę zależną od
   rocznika: urodzeni do 1959 roku (67 lat i więcej w 2026) są nim w około 55% przypadków, urodzeni w latach 1960-1964
   w około 25%, młodsi nigdy. Zawody satyryczne mają `satyra: true`; żadnych prawdziwych marek ani osób.

   Fach (`fach`) mają obecni (`stan: 'tu'`) od 16 lat w roku stanu wyniku (`w.rok`, w grze 2051; wiek w grze to rok
   stanu minus rocznik, bo nikt nie ma rocznika z roku stanu). Losowanie w dwóch krokach. Najpierw, jeśli dawny zawód ma powiązania (`POWIAZANIA_ZAWODOW`, np. hydraulik
   do zduna i instalatora, pielęgniarka do felczerki, programista do opiekuna serwera), z szansą `SZANSA_Z_ZAWODU` fach
   pochodzi z ich wag. Inaczej, albo gdy z powiązań nic nie zostało po cięciu wiekiem, fach pochodzi z puli ogólnej
   (`baza` fachu). Wiek tnie wagi: fach nie trafia do osoby młodszej niż `odWieku`, a ciężka praca (`ciezar`) słabnie po
   60. roku życia i znika po 70., więc najstarsi robią przetwory, hodują kury, liczą racje i opiekują się chorymi. W osobie
   `fach` to stabilne id z tabeli (`IdFachu`, np. 'felczer'), więc zmiana nazwy w tabeli nie zrywa zapisanych wartości: nazwę
   w formie płci daje `nazwaFachu(id, plec)`, a pełny wpis z umiejętnościami `fachOsoby(o)` (szukanie po id, nie po
   nazwie). `dawnyZawod` to napis w formie płci osoby, gotowy do tekstu (nie jest kluczem do niczego); `zawodOsoby` oddaje
   jego wpis (`satyra`).

   `nadajFachy` zmienia osoby w miejscu: wolno ją wywołać tylko na wyniku, który wywołujący sam stworzył, np. z `postarz`
   (kopiuje osoby), jak robi to `generujBudynek`. Zmienia tylko `dawnyZawod` i `fach`, nigdy innych pól. */

import type { Dom } from '../content/data.ts';
import type { Rng } from '../core/rng.ts';
import { szansa, wazony } from './los.ts';
import type { Osoba, Plec, WynikBudynku } from './typy.ts';

/** Fach na 2051. `umiejetnosci` w skali 1-4 jak zawody z 0.3 (lekarz rodzinny ma `med: 4`), `odWieku` to najmniejszy wiek.
    `id` to stabilne ASCII; to ono ląduje w `Osoba.fach`. */
export interface Fach {
  id: IdFachu;
  m: string;
  k: string;
  umiejetnosci: Partial<Record<Dom, number>>;
  odWieku: number;
}
/** Zawód sprzed upadku: tylko linijka historii i satyra. */
export interface DawnyZawod {
  m: string;
  k: string;
  satyra: boolean;
}

/** Rok zero (początek bakterii): od niego liczymy wiek, w którym ktoś miał dawny zawód. Rok stanu bierzemy z wyniku. */
const ROK_ZERO = 2026;
/** Dorosły przed upadkiem: urodzony do tego roku włącznie (18 lat w 2027). */
const OSTATNI_ROCZNIK_DAWNEGO_ZAWODU = 2009;
/** Od tylu lat w roku stanu wyniku obecny mieszkaniec ma fach. */
const WIEK_FACHU = 16;
/** Wiek w 2026, od którego emerytura jest zwykła (urodzeni do 1959), i od którego bywa wczesna (urodzeni 1960-1964). */
const WIEK_EMERYTURY = 67;
const WIEK_WCZESNEJ_EMERYTURY = 62;
/** Szansa na 10 000, że osoba z powiązaniami dawnego zawodu zostaje przy pokrewnym fachu. */
const SZANSA_Z_ZAWODU = 6500;
/** Wiek (2051), od którego seniorskie fachy dostają potrójną wagę. */
const WIEK_SENIORA = 65;
const MNOZNIK_SENIORA = 3;

type Ciezar = 0 | 1 | 2;
/** Fach z danymi losowania. `baza`: waga w puli ogólnej. `ciezar`: 0 praca siedząca albo lekka, 1 średnia, 2 ciężka
    (słabnie od 60., znika od 70. roku życia). `seniorski`: po 65. roku życia fach ma potrójną wagę. */
interface DefFachu {
  id: string;
  m: string;
  k: string;
  umiejetnosci: Partial<Record<Dom, number>>;
  odWieku: number;
  baza: number;
  ciezar: Ciezar;
  seniorski: boolean;
}
/** Jeden wiersz tabeli fachów: id, forma męska i żeńska, umiejętności, najmniejszy wiek, baza, ciężar, (seniorski). */
const fach = <const I extends string>(
  id: I,
  m: string,
  k: string,
  umiejetnosci: Partial<Record<Dom, number>>,
  odWieku: number,
  baza: number,
  ciezar: Ciezar,
  seniorski = false,
) => ({ id, m, k, umiejetnosci, odWieku, baza, ciezar, seniorski });

/* Nazwy z życia osiedla 2051 i z drzewka technologii z GDD (gazogenerator na drewno, panele z dachów galerii, sieć
   mesh, hydroponika na dachach, serwer z odzysku, lokalny model językowy). Grupy po dziedzinie, w której fach jest
   najsilniejszy. Skromne i mieszane fachy (pomocnik, opiekun chorych, kurier pieszy) są po to, żeby nie każdy był
   ekspertem; umiejętność 4 mają tylko lekarz i majster budowlany. */
const DEF = [
  // budowa
  fach('murarz', 'murarz', 'murarka', { bud: 3 }, 18, 6, 2),
  fach('majster', 'majster budowlany', 'majsterka budowlana', { bud: 4 }, 30, 2, 1),
  fach('pomocnikBud', 'pomocnik budowlany', 'pomocnica budowlana', { bud: 1 }, 16, 8, 2),
  fach('uszczelniacz', 'uszczelniacz okien', 'uszczelniaczka okien', { bud: 2, cieplo: 1 }, 16, 6, 1),
  fach('spawacz', 'spawacz z akumulatorów', 'spawaczka z akumulatorów', { bud: 2, elek: 1 }, 20, 4, 1),
  fach('barykadnik', 'budowniczy barykad', 'budowniczka barykad', { bud: 2, obrona: 2 }, 18, 3, 2),
  // ciepło
  fach('zdun', 'zdun', 'zdunka', { cieplo: 3, bud: 1 }, 20, 4, 1),
  fach('instalator', 'instalator', 'instalatorka', { cieplo: 3 }, 18, 5, 1),
  fach('palacz', 'palacz węzła', 'palaczka węzła', { cieplo: 2 }, 18, 6, 1),
  fach('kozowy', 'monter kóz', 'monterka kóz', { cieplo: 2, bud: 1 }, 16, 6, 1),
  fach('drwal', 'drwal', 'drwalka', { cieplo: 2, obrona: 1 }, 18, 5, 2),
  fach('pompiarz', 'monter pomp ciepła', 'monterka pomp ciepła', { cieplo: 3, elek: 2 }, 22, 1, 1),
  // prąd
  fach('elektryk', 'elektryk', 'elektryczka', { elek: 3, bud: 1 }, 18, 3, 1),
  fach('lataczKabli', 'łatacz kabli', 'łataczka kabli', { elek: 3 }, 18, 4, 1),
  fach('panelowy', 'opiekun paneli', 'opiekunka paneli', { elek: 2, bud: 1 }, 16, 5, 1),
  fach('krotkofalowiec', 'krótkofalowiec', 'krótkofalowczyni', { elek: 2, it: 1 }, 16, 3, 0),
  fach('gazogenerator', 'operator gazogeneratora', 'operatorka gazogeneratora', { elek: 2, cieplo: 2 }, 20, 2, 1),
  fach('akumulatory', 'serwisant akumulatorów', 'serwisantka akumulatorów', { elek: 2 }, 16, 5, 1),
  // medycyna
  fach('felczer', 'felczer', 'felczerka', { med: 3 }, 20, 2, 0),
  fach('lekarz', 'lekarz', 'lekarka', { med: 4 }, 26, 1, 0),
  fach('pielegniarz', 'pielęgniarz', 'pielęgniarka', { med: 3 }, 18, 2, 1),
  fach('zielarz', 'zielarz', 'zielarka', { med: 2, uprawa: 2 }, 16, 4, 0),
  fach('sanitariusz', 'sanitariusz', 'sanitariuszka', { med: 2, obrona: 1 }, 16, 4, 1),
  fach('polozny', 'położny', 'położna', { med: 3 }, 22, 1, 0),
  fach('opiekunChorych', 'opiekun chorych', 'opiekunka chorych', { med: 1 }, 16, 7, 0),
  fach('lowcaFagow', 'łowca fagów', 'łowczyni fagów', { med: 3, uprawa: 1 }, 20, 1, 1),
  // uprawy
  fach('ogrodnik', 'ogrodnik', 'ogrodniczka', { uprawa: 3 }, 16, 4, 1),
  fach('ogrodDach', 'ogrodnik z dachu', 'ogrodniczka z dachu', { uprawa: 3, elek: 1 }, 18, 3, 1),
  fach('dzialkowiec', 'działkowiec', 'działkowiczka', { uprawa: 2, bud: 1 }, 16, 8, 0),
  fach('pieczarkarz', 'pieczarkarz', 'pieczarkarka', { uprawa: 2 }, 16, 5, 0),
  fach('hodowcaKur', 'hodowca kur', 'hodowczyni kur', { uprawa: 2 }, 16, 5, 0),
  fach('szklarniarz', 'szklarniarz', 'szklarniarka', { uprawa: 2, bud: 1 }, 16, 4, 1),
  fach('kucharz', 'kucharz z kuchni społecznej', 'kucharka z kuchni społecznej', { uprawa: 1 }, 16, 6, 0),
  fach('przetwory', 'senior od przetworów', 'seniorka od przetworów', { uprawa: 1 }, 60, 6, 0, true),
  // informatyka
  fach('serwerOlej', 'opiekun serwera w oleju', 'opiekunka serwera w oleju', { it: 3, elek: 1 }, 20, 1, 0),
  fach('mesh', 'technik sieci mesh', 'techniczka sieci mesh', { it: 2, elek: 1 }, 18, 2, 1),
  fach('dron', 'pilot drona', 'pilotka drona', { it: 2, obrona: 1 }, 16, 3, 0),
  fach('odzysk', 'informatyk z odzysku', 'informatyczka z odzysku', { it: 2 }, 18, 2, 0),
  fach('szeptacz', 'szeptacz do modelu', 'szeptaczka do modelu', { it: 2 }, 18, 1, 0),
  fach('ksiegowy', 'księgowy od racji', 'księgowa od racji', { it: 1 }, 16, 4, 0),
  // obrona
  fach('wartownik', 'wartownik', 'wartowniczka', { obrona: 2 }, 16, 7, 1),
  fach('straznik', 'strażnik osiedlowy', 'strażniczka osiedlowa', { obrona: 3 }, 20, 3, 2),
  fach('zwiadowca', 'zwiadowca z wypraw', 'zwiadowczyni z wypraw', { obrona: 2 }, 18, 4, 2),
  fach('kurierPieszy', 'kurier pieszy', 'kurierka piesza', { obrona: 1 }, 16, 6, 2),
] as const satisfies readonly DefFachu[];

/** Stabilne id fachu (ASCII, camelCase): wartość `Osoba.fach`. */
export type IdFachu = (typeof DEF)[number]['id'];
const DEF_FACHOW: readonly DefFachu[] = DEF;

export const FACHY: readonly Fach[] = DEF.map((d) => ({
  id: d.id,
  m: d.m,
  k: d.k,
  umiejetnosci: { ...d.umiejetnosci },
  odWieku: d.odWieku,
}));

/** Zawód sprzed upadku z wagami. `wiekOd` i `wiekDo` to wiek w 2026 (rok zero), w którym zawód wchodzi w grę; `waga`
    w losowaniu zawodu; `fachy` to powiązania z fachami (id → waga), puste, gdy zawód niczego nie sugeruje. */
interface DefZawodu extends DawnyZawod {
  wiekOd: number;
  wiekDo: number;
  waga: number;
  fachy: Partial<Record<IdFachu, number>>;
}
type Powiazania = Partial<Record<IdFachu, number>>;
/** Wiersz zwykłego zawodu: forma męska i żeńska, przedział wieku w 2026, waga, powiązania z fachami. */
const zwykly = (m: string, k: string, wiekOd: number, wiekDo: number, waga: number, fachy: Powiazania): DefZawodu => ({
  m,
  k,
  satyra: false,
  wiekOd,
  wiekDo,
  waga,
  fachy,
});
/** Wiersz zawodu satyrycznego. */
const satyra = (m: string, k: string, wiekOd: number, wiekDo: number, waga: number, fachy: Powiazania): DefZawodu => ({
  ...zwykly(m, k, wiekOd, wiekDo, waga, fachy),
  satyra: true,
});
/** Górna granica wieku zawodów, które nie wygasają. */
const DO_KONCA = 130;

/* Zwykłe zawody i satyra w stylu 0.3 (influencer, doradca ds. ESG, prompt engineer, lodówki na abonament, NFT z kotem,
   kredyty węglowe). Wagi względne; emeryt ma wagę policzoną z rocznika (`wagiZawodow`). */
const ZAWODY: readonly DefZawodu[] = [
  // zwykłe
  zwykly('student', 'studentka', 17, 25, 6, {}),
  zwykly('uczeń technikum', 'uczennica technikum', 17, 19, 5, {}),
  zwykly('student biotechnologii', 'studentka biotechnologii', 19, 26, 2, {
    lowcaFagow: 8,
    zielarz: 6,
    pieczarkarz: 4,
    felczer: 3,
  }),
  zwykly('sprzedawca', 'sprzedawczyni', 18, DO_KONCA, 8, {}),
  zwykly('kasjer', 'kasjerka', 18, DO_KONCA, 6, { ksiegowy: 6, kucharz: 4, wartownik: 3, kurierPieszy: 3 }),
  zwykly('kucharz', 'kucharka', 18, DO_KONCA, 4, {
    kucharz: 14,
    przetwory: 6,
    hodowcaKur: 4,
    pieczarkarz: 4,
    zielarz: 2,
  }),
  zwykly('kurier', 'kurierka', 18, 50, 3, { kurierPieszy: 12, zwiadowca: 6, dron: 3 }),
  zwykly('fryzjer', 'fryzjerka', 18, DO_KONCA, 3, { opiekunChorych: 4, zielarz: 3, kucharz: 3 }),
  zwykly('ochroniarz', 'ochroniarka', 20, DO_KONCA, 4, { wartownik: 12, straznik: 10, zwiadowca: 4, barykadnik: 3 }),
  zwykly('murarz', 'murarka', 19, DO_KONCA, 3, {
    murarz: 12,
    uszczelniacz: 6,
    zdun: 6,
    majster: 4,
    barykadnik: 4,
    pomocnikBud: 3,
  }),
  zwykly('spawacz', 'spawaczka', 20, DO_KONCA, 2, {
    spawacz: 12,
    barykadnik: 6,
    murarz: 3,
    akumulatory: 3,
    uszczelniacz: 3,
  }),
  zwykly('mechanik samochodowy', 'mechaniczka samochodowa', 20, DO_KONCA, 4, {
    akumulatory: 10,
    spawacz: 8,
    gazogenerator: 6,
    kozowy: 4,
    panelowy: 3,
    barykadnik: 3,
  }),
  zwykly('hydraulik', 'hydrauliczka', 20, DO_KONCA, 4, { instalator: 12, zdun: 8, palacz: 6, kozowy: 4, pompiarz: 2 }),
  zwykly('elektryk', 'elektryczka', 20, DO_KONCA, 4, {
    elektryk: 14,
    lataczKabli: 12,
    panelowy: 8,
    akumulatory: 6,
    gazogenerator: 4,
    krotkofalowiec: 3,
    pompiarz: 1,
  }),
  zwykly('monter klimatyzacji', 'monterka klimatyzacji', 22, 60, 2, {
    pompiarz: 8,
    kozowy: 8,
    elektryk: 4,
    instalator: 4,
  }),
  zwykly('magazynier', 'magazynierka', 19, DO_KONCA, 4, {
    kurierPieszy: 6,
    wartownik: 4,
    pomocnikBud: 4,
    akumulatory: 3,
    ksiegowy: 3,
  }),
  zwykly('listonosz', 'listonoszka', 20, DO_KONCA, 2, { kurierPieszy: 12, zwiadowca: 6, wartownik: 3 }),
  zwykly('rolnik', 'rolniczka', 20, DO_KONCA, 2, {
    ogrodnik: 8,
    hodowcaKur: 8,
    dzialkowiec: 6,
    szklarniarz: 4,
    pieczarkarz: 3,
    drwal: 3,
    ogrodDach: 2,
  }),
  zwykly('ogrodnik', 'ogrodniczka', 20, DO_KONCA, 2, {
    ogrodnik: 12,
    ogrodDach: 8,
    szklarniarz: 6,
    dzialkowiec: 5,
    zielarz: 4,
  }),
  zwykly('dozorca', 'dozorczyni', 30, DO_KONCA, 2, {
    palacz: 8,
    uszczelniacz: 6,
    wartownik: 5,
    kozowy: 5,
    panelowy: 3,
    murarz: 3,
    akumulatory: 3,
  }),
  zwykly('strażak', 'strażaczka', 22, 62, 1, {
    straznik: 6,
    sanitariusz: 5,
    wartownik: 4,
    barykadnik: 4,
    uszczelniacz: 3,
  }),
  zwykly('policjant', 'policjantka', 22, 62, 2, { straznik: 12, wartownik: 8, zwiadowca: 4 }),
  zwykly('programista', 'programistka', 22, 55, 5, {
    serwerOlej: 10,
    odzysk: 8,
    mesh: 6,
    dron: 4,
    szeptacz: 3,
    krotkofalowiec: 3,
  }),
  zwykly('kierowca autobusu', 'kierowczyni autobusu', 25, DO_KONCA, 4, { zwiadowca: 6, akumulatory: 4, straznik: 3 }),
  zwykly('kierowca ciężarówki', 'kierowczyni ciężarówki', 25, DO_KONCA, 3, {
    zwiadowca: 8,
    akumulatory: 4,
    kurierPieszy: 3,
    spawacz: 2,
  }),
  zwykly('nauczyciel', 'nauczycielka', 24, DO_KONCA, 6, {
    ksiegowy: 3,
    krotkofalowiec: 3,
    opiekunChorych: 3,
    dzialkowiec: 3,
    odzysk: 2,
  }),
  zwykly('księgowy', 'księgowa', 24, DO_KONCA, 6, { ksiegowy: 14, kucharz: 3, odzysk: 3, dzialkowiec: 2 }),
  zwykly('urzędnik', 'urzędniczka', 22, DO_KONCA, 6, { ksiegowy: 6, opiekunChorych: 3, odzysk: 3, wartownik: 2 }),
  zwykly('bibliotekarz', 'bibliotekarka', 24, DO_KONCA, 1, {
    ksiegowy: 5,
    opiekunChorych: 4,
    przetwory: 3,
    szeptacz: 1,
  }),
  zwykly('pielęgniarz', 'pielęgniarka', 23, DO_KONCA, 4, {
    pielegniarz: 12,
    felczer: 6,
    opiekunChorych: 6,
    sanitariusz: 5,
    polozny: 2,
  }),
  zwykly('ratownik medyczny', 'ratowniczka medyczna', 22, 60, 2, {
    sanitariusz: 12,
    felczer: 8,
    pielegniarz: 5,
    wartownik: 3,
    straznik: 3,
  }),
  zwykly('lekarz', 'lekarka', 28, DO_KONCA, 2, { lekarz: 14, felczer: 8, polozny: 3, lowcaFagow: 3, zielarz: 3 }),
  zwykly('farmaceuta', 'farmaceutka', 25, DO_KONCA, 2, {
    zielarz: 10,
    felczer: 8,
    pielegniarz: 4,
    lowcaFagow: 3,
    polozny: 2,
  }),
  zwykly('weterynarz', 'weterynarka', 28, DO_KONCA, 1, { felczer: 8, hodowcaKur: 4, zielarz: 4, lekarz: 3 }),
  zwykly('emeryt', 'emerytka', WIEK_WCZESNEJ_EMERYTURY, DO_KONCA, 0, {
    przetwory: 8,
    dzialkowiec: 8,
    hodowcaKur: 5,
    opiekunChorych: 5,
    kucharz: 4,
    ksiegowy: 3,
  }),
  // satyra
  satyra('stażysta w startupie', 'stażystka w startupie', 18, 26, 3, {
    kurierPieszy: 5,
    dron: 3,
    pomocnikBud: 4,
    akumulatory: 3,
  }),
  satyra('kurier z hulajnogą', 'kurierka z hulajnogą', 18, 36, 3, {
    kurierPieszy: 12,
    zwiadowca: 8,
    akumulatory: 4,
    dron: 3,
  }),
  satyra('influencer', 'influencerka', 18, 38, 3, {
    zwiadowca: 8,
    kurierPieszy: 5,
    dron: 5,
    wartownik: 4,
    ogrodDach: 2,
  }),
  satyra('prompt engineer', 'prompt engineerka', 22, 40, 3, {
    szeptacz: 14,
    odzysk: 6,
    serwerOlej: 4,
    ksiegowy: 3,
    mesh: 2,
  }),
  satyra('tester lodówek na abonament', 'testerka lodówek na abonament', 22, 50, 2, {
    akumulatory: 6,
    uszczelniacz: 4,
    kozowy: 4,
    lataczKabli: 3,
  }),
  satyra('twórca NFT', 'twórczyni NFT', 22, 45, 2, {
    ksiegowy: 4,
    szeptacz: 3,
    odzysk: 3,
    kurierPieszy: 3,
    hodowcaKur: 2,
  }),
  satyra('projektant aplikacji do segregacji śmieci', 'projektantka aplikacji do segregacji śmieci', 24, 50, 2, {
    akumulatory: 6,
    spawacz: 4,
    lataczKabli: 4,
    odzysk: 3,
  }),
  satyra('coach mindfulness', 'coachka mindfulness', 25, 55, 2, {
    opiekunChorych: 8,
    zielarz: 5,
    przetwory: 3,
    kucharz: 3,
  }),
  satyra('doradca ds. ESG', 'doradczyni ds. ESG', 27, 55, 3, {
    ksiegowy: 8,
    kucharz: 6,
    ogrodDach: 5,
    dzialkowiec: 4,
    palacz: 3,
    hodowcaKur: 3,
  }),
  satyra('scrum master', 'scrum masterka', 27, 50, 3, { ksiegowy: 6, wartownik: 3, mesh: 3 }),
  satyra('pośrednik w handlu gruntami w metawersum', 'pośredniczka w handlu gruntami w metawersum', 25, 55, 2, {
    dzialkowiec: 8,
    ogrodnik: 4,
    murarz: 3,
    ksiegowy: 3,
  }),
  satyra('sprzedawca kredytów węglowych', 'sprzedawczyni kredytów węglowych', 27, 55, 2, {
    drwal: 6,
    palacz: 6,
    ksiegowy: 5,
  }),
  satyra('menedżer ds. doświadczeń klienta', 'menedżerka ds. doświadczeń klienta', 26, 55, 2, {
    ksiegowy: 5,
    kucharz: 4,
    wartownik: 3,
    opiekunChorych: 3,
  }),
  satyra('specjalista ds. rezygnacji z subskrypcji', 'specjalistka ds. rezygnacji z subskrypcji', 25, 55, 2, {
    ksiegowy: 5,
    wartownik: 3,
    odzysk: 3,
    lataczKabli: 3,
  }),
];

export const DAWNE_ZAWODY: readonly DawnyZawod[] = ZAWODY.map((z) => ({ m: z.m, k: z.k, satyra: z.satyra }));

/** Powiązania dawnych zawodów z fachami: klucz to męska forma zawodu, wartość to id fachu z wagą. Zawody bez powiązań
    (sprzedawca, student) nie mają wpisu; ich fach pochodzi z puli ogólnej. */
export const POWIAZANIA_ZAWODOW: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.fromEntries(
  ZAWODY.flatMap((z) => {
    const wagi = Object.entries(z.fachy).filter((e): e is [string, number] => e[1] !== undefined);
    return wagi.length > 0 ? [[z.m, Object.fromEntries(wagi)]] : [];
  }),
);

// ---------------------------------------------------------------- wyszukiwanie wpisu osoby

const FACH_PO_ID = new Map<string, Fach>();
for (const f of FACHY) FACH_PO_ID.set(f.id, f);
const ZAWOD_PO_NAZWIE = new Map<string, DawnyZawod>();
for (const z of DAWNE_ZAWODY) {
  ZAWOD_PO_NAZWIE.set(z.m, z);
  ZAWOD_PO_NAZWIE.set(z.k, z);
}

/** Wpis tabeli fachów dla osoby (umiejętności, nazwy), szukany po id z `Osoba.fach`; `undefined`, gdy osoba nie ma fachu
    albo jej `fach` nie jest id z tabeli (nazwa wyświetlana nie działa jako klucz). */
export function fachOsoby(o: Pick<Osoba, 'fach'>): Fach | undefined {
  return o.fach === undefined ? undefined : FACH_PO_ID.get(o.fach);
}
/** Nazwa fachu w formie płci: `m` dla mężczyzny, `k` dla kobiety. Nieznane id (obejście typu) to `RangeError`. */
export function nazwaFachu(id: IdFachu, plec: Plec): string {
  const f = FACH_PO_ID.get(id);
  if (!f) throw new RangeError(`nieznany fach: ${id}`);
  return nazwaDla(f, plec);
}
/** Wpis tabeli dawnych zawodów dla osoby (w tym `satyra`), albo `undefined`, gdy osoba nie ma dawnego zawodu. */
export function zawodOsoby(o: Pick<Osoba, 'dawnyZawod'>): DawnyZawod | undefined {
  return o.dawnyZawod === undefined ? undefined : ZAWOD_PO_NAZWIE.get(o.dawnyZawod);
}

// ---------------------------------------------------------------- wagi

const IDX_EMERYTA = ZAWODY.findIndex((z) => z.m === 'emeryt');

/** Wagi policzone raz na wiek i zawód (są czystą funkcją stałych tabel), bo losowanie woła je tysiące razy. Tablic
    z pamięci nie wolno zmieniać. */
const pamiec = new Map<string, readonly number[]>();
function zPamieci(klucz: string, buduj: () => number[]): readonly number[] {
  let w = pamiec.get(klucz);
  if (!w) pamiec.set(klucz, (w = buduj()));
  return w;
}

/** Wagi zawodów dla osoby, która w 2026 roku miała `wiek` lat. Emeryt: 6/5 sumy wag pozostałych zawodów od 67 lat
    (około 55%), 1/3 od 62 lat (około 25%), poniżej zero. */
function wagiZawodow(wiek: number): readonly number[] {
  return zPamieci(`z${wiek}`, () => {
    const wagi = ZAWODY.map((z, i) => (i !== IDX_EMERYTA && wiek >= z.wiekOd && wiek <= z.wiekDo ? z.waga : 0));
    const suma = wagi.reduce((s, w) => s + w, 0);
    wagi[IDX_EMERYTA] =
      wiek >= WIEK_EMERYTURY ? Math.floor((suma * 6) / 5) : wiek >= WIEK_WCZESNEJ_EMERYTURY ? Math.floor(suma / 3) : 0;
    return wagi;
  });
}

/** Ile z wagi fachu zostaje w danym wieku (0-4): ciężka praca słabnie po 60. roku życia i znika po 70., średnia znika po
    80., praca siedząca zostaje do końca. */
function mnoznikWieku(ciezar: Ciezar, wiek: number): number {
  if (wiek < 60) return 4;
  if (wiek < 70) return ciezar === 0 ? 4 : ciezar === 1 ? 3 : 1;
  if (ciezar === 0) return 4;
  return ciezar === 1 && wiek < 80 ? 1 : 0;
}

/** Wagi fachów dla osoby w wieku `wiek` (2051). Z `iZawodu` (indeks w `ZAWODY`) waga fachu to jego waga z powiązań
    zawodu, bez niego `baza`. Fach młodszej osoby niż `odWieku` ma wagę 0. */
function wagiFachow(wiek: number, iZawodu = -1): readonly number[] {
  return zPamieci(`f${iZawodu}:${wiek}`, () => {
    const powiazania: Readonly<Partial<Record<string, number>>> | undefined = ZAWODY[iZawodu]?.fachy;
    return DEF_FACHOW.map((f) => {
      if (wiek < f.odWieku) return 0;
      const waga = powiazania ? (powiazania[f.id] ?? 0) : f.baza;
      return waga * (f.seniorski && wiek >= WIEK_SENIORA ? MNOZNIK_SENIORA : 1) * mnoznikWieku(f.ciezar, wiek);
    });
  });
}

const nazwaDla = (x: { m: string; k: string }, plec: Plec): string => (plec === 'K' ? x.k : x.m);

/** Fach osoby w wieku `wiek` (w roku stanu wyniku): z powiązań dawnego zawodu `iZawodu` z szansą `SZANSA_Z_ZAWODU`, inaczej (albo gdy
    po cięciu wiekiem nic z powiązań nie zostało) z puli ogólnej. */
function losujFach(wiek: number, iZawodu: number, r: Rng): Fach {
  let i = -1;
  if (iZawodu >= 0 && Object.keys(ZAWODY[iZawodu].fachy).length > 0 && szansa(r, SZANSA_Z_ZAWODU)) {
    i = wazony(r, wagiFachow(wiek, iZawodu));
  }
  if (i < 0) i = wazony(r, wagiFachow(wiek));
  if (i < 0) throw new RangeError(`brak fachu dla wieku ${wiek}`); // nieosiągalne: lekkie fachy od 16 lat mają wagę > 0
  return FACHY[i];
}

/** Dawny zawód (urodzeni do 2009, jako nazwa w formie płci) i fach (obecni od 16 lat w roku stanu `w.rok`, jako id)
    osobom budynku, w kolejności `w.osoby`. Zmienia tylko te dwa pola w osobach `w` (patrz nagłówek: tylko na wyniku
    stworzonym przez wywołującego). Wynik bez `rok` (spis 2021, nie wynik `postarz`) to `RangeError`: bez roku stanu nie
    ma wieku. */
export function nadajFachy(w: WynikBudynku, r: Rng): void {
  const rok = w.rok;
  if (rok === undefined) throw new RangeError('nadajFachy: wynik bez roku stanu (rok), to nie wynik postarz');
  for (const o of w.osoby) {
    // indeks dawnego zawodu z wag zależnych od wieku w 2026; -1 dla urodzonych po 2009
    const iZawodu = o.rocznik <= OSTATNI_ROCZNIK_DAWNEGO_ZAWODU ? wazony(r, wagiZawodow(ROK_ZERO - o.rocznik)) : -1;
    if (iZawodu >= 0) o.dawnyZawod = nazwaDla(ZAWODY[iZawodu], o.plec);
    const wiek = rok - o.rocznik;
    if (o.stan === 'tu' && wiek >= WIEK_FACHU) o.fach = losujFach(wiek, iZawodu, r).id;
  }
}
