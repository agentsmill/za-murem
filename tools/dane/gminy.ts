/* Czyste funkcje narzędzia `dane-gminy`: kody TERYT, tablice gospodarstw i rodzin z XLSX GUS, ludność rejonów,
   odpowiedzi BDL (P4386, P4253, P2137) i podział płci w grupach wieku. Bez dostępu do plików, żeby dało się je
   testować na małych danych. Kolejność kluczy w zerowych obiektach jest taka jak w typach (JSON ma ją zachować). */

import type { Epoka, GrupaWieku, Marginesy, TabeleGminy } from '../../src/mieszkancy/tabele.ts';
import type { Komorka } from './xlsx.ts';

export const GRUPY_WIEKU: GrupaWieku[] = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
export const EPOKI: Epoka[] = ['przedwojenna', 'powojenna', 'plyta', 'transformacja', 'nowa'];

// ---------------------------------------------------------------- TERYT

const WOJEWODZTWA: Record<string, string> = {
  '02': 'dolnośląskie',
  '04': 'kujawsko-pomorskie',
  '06': 'lubelskie',
  '08': 'lubuskie',
  '10': 'łódzkie',
  '12': 'małopolskie',
  '14': 'mazowieckie',
  '16': 'opolskie',
  '18': 'podkarpackie',
  '20': 'podlaskie',
  '22': 'pomorskie',
  '24': 'śląskie',
  '26': 'świętokrzyskie',
  '28': 'warmińsko-mazurskie',
  '30': 'wielkopolskie',
  '32': 'zachodniopomorskie',
};

/** 12-cyfrowy identyfikator jednostki BDL → 7-cyfrowy kod z plików NSP: cyfry 3-4, 8-9 i 10-12. */
export function terytZBdl(id: string): string {
  if (!/^\d{12}$/.test(id)) throw new Error(`Identyfikator BDL musi mieć 12 cyfr, jest „${id}”`);
  return id.slice(2, 4) + id.slice(7, 9) + id.slice(9, 12);
}

/** Nazwa województwa małymi literami (jak w plikach PESEL) z dwóch pierwszych cyfr TERYT. */
export function wojewodztwo(teryt: string): string {
  const nazwa = WOJEWODZTWA[teryt.slice(0, 2)];
  if (!nazwa) throw new Error(`Kod TERYT ${teryt} nie wskazuje żadnego województwa`);
  return nazwa;
}

/** Ostatnia cyfra TERYT to rodzaj jednostki: 1 gmina miejska, 2 wiejska, 3 miejsko-wiejska, 4 miasto i 5 obszar
    wiejski w gminie miejsko-wiejskiej, 8 dzielnica Warszawy, 9 delegatura i dzielnice innych miast. Cała gmina
    miejsko-wiejska (3) jest i miastem, i wsią, więc kodem się nie rozstrzyga (null). */
export function czyMiejska(teryt: string): boolean | null {
  switch (teryt.slice(-1)) {
    case '1':
    case '4':
    case '8':
    case '9':
      return true;
    case '2':
    case '5':
      return false;
    case '3':
      return null;
    default:
      throw new Error(`Kod TERYT ${teryt} ma nieznany rodzaj jednostki`);
  }
}

/** „gm. m. Gdańsk” → „Gdańsk”, „dz. Warszawa-Ursynów” → „Warszawa-Ursynów”. */
export function skrocNazwe(nazwa: string): string {
  return nazwa.replace(/^(?:gm\.\s+[a-zA-Z-]+\.|dz\.|del\.|d\.|m\.|w\.)\s+/, '');
}

// ---------------------------------------------------------------- geometria

/** Punkt w wielokącie, reguła parzystości po wszystkich pierścieniach (dziury działają same). Pierścienie to
    pary [x, y] w tej samej kolejności i układzie co punkt (PUWG: x wschód; obrysy w grze: [lat, lon]). */
export function wWielokacie(x: number, y: number, pierscienie: readonly (readonly (readonly number[])[])[]): boolean {
  let wewnatrz = false;
  for (const p of pierscienie) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0];
      const yi = p[i][1];
      const xj = p[j][0];
      const yj = p[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) wewnatrz = !wewnatrz;
    }
  }
  return wewnatrz;
}

// ---------------------------------------------------------------- tablice gospodarstw i rodzin (XLSX)

export type Pole = 'gospodarstwa' | 'sklad' | 'rodziny' | 'dzieci';

/** Arkusz z rejonami statystycznymi w czterech plikach NSP (drugi arkusz to obwody spisowe, których nie czytamy). */
export const ARKUSZ_REJONOW = 'Dane - rejony statystyczne';

/** Które pole `Marginesy` z którego pliku katalogu gus/nsp2021-gospodarstwa-rejony (kolejność ma znaczenie:
    pierwsza tablica ustala listę rejonów). */
export const PLIKI_TABLIC = [
  ['gospodarstwa', 'gospodarstwa_w_rejonach_i_obwodach_wg_liczby_osob_nsp2021.xlsx'],
  ['sklad', 'gospodarstwa_w_rejonach_i_obwodach_wg_skladu_rodzinnego_nsp2021_2.xlsx'],
  ['rodziny', 'rodziny_w_rejonach_i_obwodach_wg_typow_nsp2021.xlsx'],
  ['dzieci', 'rodziny_w_rejonach_i_obwodach_wg_liczby_dzieci_nsp2021.xlsx'],
] as const satisfies readonly (readonly [Pole, string])[];

export const ETYKIETY_WIELKOSCI: Record<string, keyof Marginesy['gospodarstwa']> = {
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5 i więcej': '5+',
};
const ETYKIETY_SKLADU: Record<string, keyof Marginesy['sklad']> = {
  jednorodzinne: 'jedno',
  dwurodzinne: 'dwu',
  'trzy i więcej rodzinne': 'trzy+',
  'nierodzinne - jednoosobowe': 'nier1',
  'nierodzinne - wieloosobowe': 'nier+',
};
const ETYKIETY_RODZIN: Record<string, keyof Marginesy['rodziny']> = {
  'małżeństwa bez dzieci': 'malzBez',
  'małżeństwa z dziećmi': 'malzZ',
  'związki niesformalizowane bez dzieci': 'zwBez',
  'związki niesformalizowane z dziećmi': 'zwZ',
  'samotne matki z dziećmi': 'matka',
  'samotni ojcowie z dziećmi': 'ojciec',
};
const ETYKIETY_DZIECI: Record<string, keyof Marginesy['dzieci']> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4 i więcej': '4+',
};

const TABLICE: Record<Pole, { kolumna: string; etykiety: Record<string, string> }> = {
  gospodarstwa: { kolumna: 'Liczba osób w gospodarstwie', etykiety: ETYKIETY_WIELKOSCI },
  sklad: { kolumna: 'Skład rodzinny gospodarstwa', etykiety: ETYKIETY_SKLADU },
  rodziny: { kolumna: 'Typ rodziny biologicznej', etykiety: ETYKIETY_RODZIN },
  dzieci: { kolumna: 'Liczba dzieci w rodzinie', etykiety: ETYKIETY_DZIECI },
};

function zera<K extends string>(klucze: K[]): Record<K, number> {
  return Object.fromEntries(klucze.map((k) => [k, 0])) as Record<K, number>;
}

/** Marginesy z samymi zerami, klucze w kolejności z typów. */
export function pustyMarginesy(): Marginesy {
  return {
    gospodarstwa: zera(['1', '2', '3', '4', '5+']),
    sklad: zera(['jedno', 'dwu', 'trzy+', 'nier1', 'nier+']),
    rodziny: zera(['malzBez', 'malzZ', 'zwBez', 'zwZ', 'matka', 'ojciec']),
    dzieci: zera(['0', '1', '2', '3', '4+']),
    wiek: { M: zera(GRUPY_WIEKU), K: zera(GRUPY_WIEKU) },
  };
}

const pad = (v: Komorka, n: number): string => String(v ?? '').padStart(n, '0');

function sprawdzNaglowek(w: Komorka[][], pole: Pole): void {
  const { kolumna } = TABLICE[pole];
  const n = w[0] ?? [];
  if (n[0] !== 'Kod TERYT gminy' || n[2] !== 'Numer rejonu statystycznego' || n[3] !== kolumna) {
    throw new Error(
      `Tablica „${pole}”: nieoczekiwany nagłówek ${JSON.stringify(n.slice(0, 5))}, oczekiwano kolumny „${kolumna}”`,
    );
  }
}

/** Wiersze arkusza „Dane - rejony statystyczne” jednej z czterech tablic (długi format: gmina, nazwa, rejon,
    kategoria, liczba) → liczby w `rejony` dla jednej gminy. Brak wiersza kategorii to zero. `utworz` dla pierwszej
    tablicy (wielkość gospodarstw) zakłada rejony; w pozostałych rejon spoza pierwszej tablicy to błąd. Zwraca
    nazwę gminy z pliku (np. „gm. m. Gdańsk”). */
export function dodajTabele(
  w: Komorka[][],
  pole: Pole,
  gmina: string,
  rejony: Map<string, Marginesy>,
  utworz: boolean,
): string | undefined {
  const { etykiety } = TABLICE[pole];
  sprawdzNaglowek(w, pole);
  const widziane = new Set<string>();
  let nazwa: string | undefined;
  for (let i = 1; i < w.length; i++) {
    const r = w[i];
    if (pad(r[0], 7) !== gmina) continue;
    nazwa ??= String(r[1]);
    const rejon = pad(r[2], 6);
    const klucz = etykiety[String(r[3])];
    if (klucz === undefined) throw new Error(`Tablica „${pole}”: nieznana kategoria „${r[3]}” (rejon ${rejon})`);
    if (typeof r[4] !== 'number') throw new Error(`Tablica „${pole}”: rejon ${rejon}, „${r[3]}” nie ma liczby`);
    let m = rejony.get(rejon);
    if (!m) {
      if (!utworz)
        throw new Error(
          `Tablica „${pole}”: rejon ${rejon} gminy ${gmina} nie występuje w tablicy wielkości gospodarstw`,
        );
      m = pustyMarginesy();
      rejony.set(rejon, m);
    }
    const wpis = `${rejon}|${klucz}`;
    if (widziane.has(wpis)) throw new Error(`Tablica „${pole}”: rejon ${rejon}, „${r[3]}” występuje dwa razy`);
    widziane.add(wpis);
    (m[pole] as Record<string, number>)[klucz] = r[4];
  }
  return nazwa;
}

/** Suma jednej z czterech tablic po wszystkich rejonach wszystkich gmin pliku (cała Polska). Te same etykiety,
    nagłówek i zasady co `dodajTabele`: brak wiersza kategorii to zero, brak liczby, nieznana kategoria i powtórzony
    wiersz (gmina, rejon, kategoria) to błąd. Klucze w kolejności z typów. */
export function sumaTablicy<P extends Pole>(w: Komorka[][], pole: P): Marginesy[P] {
  const { etykiety } = TABLICE[pole];
  sprawdzNaglowek(w, pole);
  const suma = pustyMarginesy()[pole] as Record<string, number>;
  const widziane = new Set<string>();
  for (let i = 1; i < w.length; i++) {
    const r = w[i];
    const klucz = etykiety[String(r[3])];
    if (klucz === undefined) throw new Error(`Tablica „${pole}”: nieznana kategoria „${r[3]}” (rejon ${r[2]})`);
    if (typeof r[4] !== 'number') throw new Error(`Tablica „${pole}”: rejon ${r[2]}, „${r[3]}” nie ma liczby`);
    const wpis = `${r[0]}|${r[2]}|${klucz}`;
    if (widziane.has(wpis)) throw new Error(`Tablica „${pole}”: rejon ${r[2]}, „${r[3]}” występuje dwa razy`);
    widziane.add(wpis);
    suma[klucz] += r[4];
  }
  return suma as Marginesy[P];
}

/** Suma marginesów (rejony → gmina). */
export function sumaMarginesow(lista: Iterable<Marginesy>): Marginesy {
  const s = pustyMarginesy();
  for (const m of lista) {
    for (const pole of ['gospodarstwa', 'sklad', 'rodziny', 'dzieci'] as const) {
      for (const [k, v] of Object.entries(m[pole])) (s[pole] as Record<string, number>)[k] += v;
    }
    for (const plec of ['M', 'K'] as const) {
      for (const g of GRUPY_WIEKU) s.wiek[plec][g] += m.wiek[plec][g];
    }
  }
  return s;
}

// ---------------------------------------------------------------- ludność rejonów (XLSX, arkusz województwa)

export interface LudnoscRejonu {
  /** Kod jednostki nad rejonem w arkuszu (gmina, dzielnica, miasto albo obszar wiejski), 7 cyfr. */
  jednostka: string;
  mezczyzni: number;
  kobiety: number;
  /** Ogółem w 10-letnich grupach 0-9 … 70-79, 80+ (płeć i wiek nie są w pliku skrzyżowane). */
  grupy: number[];
}

const JEDNOSTKI_7_CYFR = new Set([
  'gmina miejska',
  'gmina wiejska',
  'gmina miejsko-wiejska',
  'miasto',
  'obszar wiejski',
  'dzielnica',
  'delegatura',
]);

/** Wiersze „rejon statystyczny” z arkusza województwa, tylko z jednostek (gmina, dzielnica, miasto, obszar
    wiejski) o podanych kodach. Rejon należy do ostatniej jednostki nad nim. Obwodów spisowych nie czyta. */
export function ludnoscRejonow(w: Komorka[][], jednostki: ReadonlySet<string>): Map<string, LudnoscRejonu> {
  const grupy = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80'];
  const naglowek = w[2] ?? [];
  if (
    w[1]?.[3] !== 'Struktura' ||
    naglowek[6] !== 'mężczyźni' ||
    naglowek[7] !== 'kobiety' ||
    grupy.some((g, i) => !String(naglowek[13 + i]).startsWith(g))
  ) {
    throw new Error('Ludność rejonów: nieoczekiwany nagłówek arkusza (płeć w kolumnach 7-8, grupy wieku w 14-22)');
  }
  const wynik = new Map<string, LudnoscRejonu>();
  let jednostka: string | null = null;
  for (let i = 4; i < w.length; i++) {
    const r = w[i];
    const struktura = String(r[3]);
    if (JEDNOSTKI_7_CYFR.has(struktura)) jednostka = pad(r[4], 7);
    else if (struktura !== 'rejon statystyczny' && struktura !== 'obwód spisowy') jednostka = null;
    if (struktura !== 'rejon statystyczny' || !jednostka || !jednostki.has(jednostka)) continue;
    const rejon = pad(r[4], 6);
    const liczby = r.slice(5, 22).map((x) => (x === '-' ? 0 : x)); // „-” to zero (zjawisko nie wystąpiło)
    if (liczby.length !== 17 || liczby.some((x) => typeof x !== 'number')) {
      throw new Error(`Ludność rejonów: rejon ${rejon} ma niepełny wiersz ${JSON.stringify(r.slice(5, 22))}`);
    }
    const [ogolem, mezczyzni, kobiety] = liczby as number[];
    const wiek = (liczby as number[]).slice(8);
    const razemGrup = wiek.reduce((a, b) => a + b, 0);
    if (ogolem !== mezczyzni + kobiety || ogolem !== razemGrup) {
      throw new Error(
        `Ludność rejonów: rejon ${rejon}, ogółem ${ogolem}, płeć ${mezczyzni}+${kobiety}, grupy wieku ${razemGrup}`,
      );
    }
    if (wynik.has(rejon)) throw new Error(`Ludność rejonów: rejon ${rejon} występuje dwa razy`);
    wynik.set(rejon, { jednostka, mezczyzni, kobiety, grupy: wiek });
  }
  return wynik;
}

// ---------------------------------------------------------------- podział płci w grupach wieku (IPF)

/** 18 grup 5-letnich (0-4 … 80-84, 85+) → 9 grup 10-letnich (0-9 … 70-79, 80+). */
export function zlozWiek10(wiek5: readonly number[]): number[] {
  if (wiek5.length !== 18) throw new Error(`zlozWiek10: oczekiwano 18 grup 5-letnich, jest ${wiek5.length}`);
  const wynik: number[] = [];
  for (let i = 0; i < 8; i++) wynik.push(wiek5[2 * i] + wiek5[2 * i + 1]);
  wynik.push(wiek5[16] + wiek5[17]);
  return wynik;
}

const sumuj = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

/** Płeć w grupach wieku rejonu. Plik GUS podaje osobno ogółem w grupach wieku i osobno sumy płci, a nie ich
    skrzyżowanie, więc rozkład płci w grupach bierzemy z szablonu gminy (`ziarnoM`, `ziarnoK`: ludność gminy
    w tych samych grupach) i dopasowujemy go metodą IPF do obu sum brzegowych rejonu. Potem zaokrąglamy tak, żeby
    M[g] + K[g] = grupy[g] w każdej grupie i sumy M oraz K zgadzały się z płcią rejonu co do osoby. */
export function rozbijWiek(
  grupy: readonly number[],
  mezczyzni: number,
  kobiety: number,
  ziarnoM: readonly number[],
  ziarnoK: readonly number[],
): { M: number[]; K: number[] } {
  const n = grupy.length;
  const razem = sumuj(grupy);
  if (razem !== mezczyzni + kobiety) {
    throw new Error(`rozbijWiek: suma grup wieku ${razem} różni się od sumy płci ${mezczyzni}+${kobiety}`);
  }
  if (ziarnoM.length !== n || ziarnoK.length !== n)
    throw new Error('rozbijWiek: szablon ma inną liczbę grup niż rejon');
  if (razem === 0) return { M: new Array(n).fill(0), K: new Array(n).fill(0) };
  // 0,5 na komórkę, żeby szablon z zerem nie blokował dopasowania
  const xM = ziarnoM.map((s) => Math.max(0, s) + 0.5);
  const xK = ziarnoK.map((s) => Math.max(0, s) + 0.5);
  for (let iter = 0; iter < 1000; iter++) {
    let odchylenie = 0;
    for (let g = 0; g < n; g++) {
      const f = grupy[g] === 0 ? 0 : grupy[g] / (xM[g] + xK[g]); // grupa pusta zostaje zerem (bez 0/0)
      xM[g] *= f;
      xK[g] *= f;
    }
    const fm = mezczyzni / sumuj(xM);
    const fk = kobiety / sumuj(xK);
    for (let g = 0; g < n; g++) {
      xM[g] *= fm;
      xK[g] *= fk;
      odchylenie = Math.max(odchylenie, Math.abs(xM[g] + xK[g] - grupy[g]));
    }
    if (odchylenie < 1e-9) break;
  }
  // zaokrąglenie: części całkowite, a brakujące osoby (suma M = mezczyzni) do grup z największą resztą
  const M = xM.map((v, g) => Math.min(grupy[g], Math.max(0, Math.floor(v + 1e-9))));
  const reszta = xM.map((v, g) => v - M[g]);
  const malejaco = [...reszta.keys()].sort((a, b) => reszta[b] - reszta[a] || a - b);
  let brak = mezczyzni - sumuj(M);
  while (brak !== 0) {
    let zmiana = false;
    for (const g of brak > 0 ? malejaco : [...malejaco].reverse()) {
      if (brak === 0) break;
      if (brak > 0 && M[g] < grupy[g]) {
        M[g]++;
        brak--;
        zmiana = true;
      } else if (brak < 0 && M[g] > 0) {
        M[g]--;
        brak++;
        zmiana = true;
      }
    }
    if (!zmiana) throw new Error('rozbijWiek: nie da się zaokrąglić z zachowaniem sum');
  }
  return { M, K: grupy.map((t, g) => t - M[g]) };
}

// ---------------------------------------------------------------- odpowiedzi BDL

export interface OdpowiedzBdl {
  results: { id: number; values: { year: string; val?: number | null }[] }[];
}
export interface MetaBdl {
  results: { id: number; n1?: string; n2?: string }[];
}

/** Wartości z odpowiedzi BDL na dany rok pod kluczem `n1|n2` z metadanych zmiennych (etykiety zamiast
    numerów zmiennych). Zmienne bez wartości w tym roku (np. utajnione) są pomijane; funkcje poniżej zgłaszają
    brak tylko tych, których potrzebują. Zmienne spoza metadanych (inna tablica w tej samej odpowiedzi) też. */
export function wartosciBdl(odp: OdpowiedzBdl, meta: MetaBdl, rok: string): Map<string, number> {
  const etykiety = new Map(meta.results.map((r) => [r.id, `${r.n1 ?? ''}|${r.n2 ?? ''}`]));
  const wynik = new Map<string, number>();
  for (const x of odp.results) {
    const klucz = etykiety.get(x.id);
    if (klucz === undefined) continue;
    const val = x.values.find((v) => v.year === rok)?.val;
    if (typeof val !== 'number') continue;
    if (wynik.has(klucz)) throw new Error(`BDL: etykieta „${klucz}” występuje dwa razy`);
    wynik.set(klucz, val);
  }
  return wynik;
}

function potrzebna(w: ReadonlyMap<string, number>, klucz: string): number {
  const v = w.get(klucz);
  if (v === undefined) throw new Error(`BDL: brak wartości „${klucz}”`);
  return v;
}

/** Okresy budowy z P4386 → epoki. Całe okresy GUS, bez dzielenia lat (ustalenie R11). Mieszkania z nieznanym
    okresem budowy GUS liczy tylko w „ogółem”, więc nie trafiają do żadnej epoki. */
const OKRESY: Record<string, Epoka> = {
  'przed 1918': 'przedwojenna',
  '1918-1944': 'przedwojenna',
  '1945-1970': 'powojenna',
  '1971-1978': 'plyta',
  '1979-1988': 'plyta',
  '1989-2002': 'transformacja',
  '2003-2011': 'transformacja',
  '2012-2016': 'nowa',
  '2017-2021 (łącznie z budynkami będącymi w budowie)': 'nowa',
};
const MIESZKANIA = 'mieszkania ogółem';
const POWIERZCHNIA = 'powierzchnia użytkowa mieszkania ogółem';
const LUDNOSC = 'ludność w mieszkaniach zamieszkanych';

export function epokiZBdl(w: ReadonlyMap<string, number>): {
  epoki: TabeleGminy['epoki'];
  metraz: TabeleGminy['metraz'];
} {
  for (const klucz of w.keys()) {
    const okres = klucz.split('|')[0];
    if (okres !== 'ogółem' && !(okres in OKRESY)) throw new Error(`BDL: nieznany okres budowy „${okres}” (P4386)`);
  }
  const epoki = Object.fromEntries(EPOKI.map((e) => [e, { mieszkania: 0, osoby: 0 }])) as TabeleGminy['epoki'];
  const powierzchnia = zera(EPOKI);
  for (const [okres, epoka] of Object.entries(OKRESY)) {
    epoki[epoka].mieszkania += potrzebna(w, `${okres}|${MIESZKANIA}`);
    epoki[epoka].osoby += potrzebna(w, `${okres}|${LUDNOSC}`);
    powierzchnia[epoka] += potrzebna(w, `${okres}|${POWIERZCHNIA}`);
  }
  const sredniaGminy = potrzebna(w, `ogółem|${POWIERZCHNIA}`) / potrzebna(w, `ogółem|${MIESZKANIA}`);
  const metraz = zera(EPOKI);
  for (const e of EPOKI) {
    metraz[e] = Math.round(epoki[e].mieszkania > 0 ? powierzchnia[e] / epoki[e].mieszkania : sredniaGminy);
  }
  return { epoki, metraz };
}

const WIEK_P4253 = [
  '0-4',
  '5-9',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80-84',
  '85-89',
  '90 i więcej',
];
const WIEK_P2137 = [
  '0-4',
  '5-9',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80-84',
  '85 i więcej',
];

function sprawdzSume(grupy: number[], ogolem: number, co: string): void {
  if (sumuj(grupy) !== ogolem)
    throw new Error(`BDL: suma grup wieku (${sumuj(grupy)}) różni się od ogółem (${ogolem}), ${co}`);
}

/** P4253 (spis 2021, ludność rezydująca): 85-89 i 90+ razem jako 85+, więc 18 grup jak w P2137 (ustalenie R7). */
export function wiek2021ZBdl(w: ReadonlyMap<string, number>): TabeleGminy['wiek2021'] {
  const wynik = { M: [] as number[], K: [] as number[] };
  for (const [plec, pole] of [
    ['mężczyźni', 'M'],
    ['kobiety', 'K'],
  ] as const) {
    const g = WIEK_P4253.map((e) => potrzebna(w, `${plec}|${e}`));
    sprawdzSume(g, potrzebna(w, `${plec}|ogółem`), `P4253 ${plec}`);
    wynik[pole] = [...g.slice(0, 17), g[17] + g[18]];
  }
  return wynik;
}

/** P2137 (31.12.2025): 18 grup 5-letnich do „85 i więcej”; grup zbiorczych („70 i więcej”, „0-14”) nie bierzemy. */
export function wiek2025ZBdl(w: ReadonlyMap<string, number>): TabeleGminy['wiek2025'] {
  const wynik = { M: [] as number[], K: [] as number[] };
  for (const [plec, pole] of [
    ['mężczyźni', 'M'],
    ['kobiety', 'K'],
  ] as const) {
    const g = WIEK_P2137.map((e) => potrzebna(w, `${e}|${plec}`));
    sprawdzSume(g, potrzebna(w, `ogółem|${plec}`), `P2137 ${plec}`);
    wynik[pole] = g;
  }
  return wynik;
}
