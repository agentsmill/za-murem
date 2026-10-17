/* Narzędzie mieszkańców: dla każdego dema z public/demo/index.json obszar z generatora (src/mieszkancy/generuj.ts)
   w trzech chwilach: spis 2021, koniec 2025 (krok „2026”, bez upadku) i 1 stycznia 2051 (po upadku). Wypisuje
   piramidy wieku M/K w grupach 5-letnich, ludność, udziały 65+ i 80+, typy gospodarstw, wielopokoleniowe, samotnych
   75+, puste mieszkania i czas generowania. Na końcu test wsteczny 2021→2025 dla gmin dem: każdy rejon gminy
   obsadzony na spis (`obsadzRejon`, tyle gospodarstw, ile ma rejon), postarzony bez upadku do końca 2025 i porównany
   z ludnością GUS na 31.12.2025 (P2137, `wiek2025`): udziały 0-14, 15-64, 65+ i 80+ w granicach 2 pp, inaczej kod
   wyjścia 1.
   Wiek w roku stanu `rok` to `rok - 1 - rocznik` (wiek ukończony na koniec poprzedniego roku), tak jak w silniku:
   spis w skali `2020 - rocznik`, krok „2026” to stan na koniec 2025, a „2051” na 1 stycznia 2051.
   Gminę dema wskazuje `rejonDla` dla punktu adresu (`geo.c`) po wszystkich tabelach gmin z repo; TERYT z listy
   ZAPAS_TERYT idzie w ruch tylko wtedy, gdy punkt nie trafi w żadną z nich.
   Uruchomienie: npm run mieszkancy [-- demo …] [--historie] */

import fs from 'node:fs';
import path from 'node:path';
import { obszarGminy, postarz } from '../src/mieszkancy/czas.ts';
import { generujObszar, ROK_GRY } from '../src/mieszkancy/generuj.ts';
import { marginesyDla, rejonDla } from '../src/mieszkancy/rejon.ts';
import { obsadzBudynek, obsadzRejon } from '../src/mieszkancy/spis.ts';
import type { TabeleGminy, TabeleKraju } from '../src/mieszkancy/tabele.ts';
import type { Osiedle, Osoba, WynikBudynku } from '../src/mieszkancy/typy.ts';
import { wczytajGmine, wczytajKraj } from '../src/mieszkancy/wczytaj.ts';
import type { Geo } from '../src/world/geo.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
const ARGS = process.argv.slice(2);
const HISTORIE = ARGS.includes('--historie');
const WYBRANE = ARGS.filter((a) => !a.startsWith('--'));

/** Zapas na wypadek, gdyby punkt adresu dema nie trafił w żaden obrys z tabel gmin: TERYT gminy dema. */
const ZAPAS_TERYT: Record<string, string> = { przymorze: '2261011', lanciego: '1465138', zielonki: '1206172' };
const PROG_PP = 2;
const CEL_MS = 200;
/** Szerokość słupka piramidy dla największej grupy (w znakach). */
const SZEROKOSC = 22;
const GRUPY = 18;
const ETYKIETY = Array.from({ length: GRUPY }, (_, i) => (i === GRUPY - 1 ? '85+' : `${5 * i}-${5 * i + 4}`));
/** Grupy testu wstecznego jako przedziały indeksów grup 5-letnich. */
const SZEROKIE: [string, number, number][] = [
  ['0-14', 0, 2],
  ['15-64', 3, 12],
  ['65+', 13, 17],
  ['80+', 16, 17],
];

/** `fetch` dla wczytaj.ts: pliki z public/, brak pliku to 404. */
const zPliku: typeof fetch = async (adres) => {
  const plik = path.join(PUBLIC, String(adres));
  return fs.existsSync(plik) ? new Response(fs.readFileSync(plik)) : new Response(null, { status: 404 });
};

// ---------------------------------------------------------------- formaty

const liczba = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const procent = (x: number): string => (Number.isFinite(x) ? `${(100 * x).toFixed(1).replace('.', ',')}%` : 'brak');
/** Różnica w punktach procentowych z dwoma miejscami, bo próg testu wstecznego to pełne 2 pp. */
const punkty = (pp: number): string => `${pp >= 0 ? '+' : '-'}${Math.abs(pp).toFixed(2).replace('.', ',')} pp`;
/** Liczba z rzeczownikiem w dobrej formie: 1 osoba, 2-4 osoby (bez 12-14), 5 osób. */
function ile(n: number, formy: readonly [string, string, string]): string {
  const j = n % 10;
  const d = n % 100;
  const forma = n === 1 ? formy[0] : j >= 2 && j <= 4 && (d < 12 || d > 14) ? formy[1] : formy[2];
  return `${liczba(n)} ${forma}`;
}
const OSOBY = ['osoba', 'osoby', 'osób'] as const;
const suma = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0);
const mediana = (a: readonly number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

// ---------------------------------------------------------------- liczby z wyników

const wiekW = (rok: number, o: Osoba): number => Math.max(0, rok - 1 - o.rocznik);
const grupa = (wiek: number): number => Math.min(GRUPY - 1, Math.floor(wiek / 5));

interface Chwila {
  rok: number;
  opis: string;
  wyniki: WynikBudynku[];
}

interface Liczby {
  M: number[];
  K: number[];
  ludnosc: number;
  gospodarstwa: number;
  typy: number[];
  trzyGus: number;
  zRodzicem: number;
  osob75: number;
  samotni75: number;
  pusteBloki: number;
  mieszkaniaBloki: number;
  pusteDomy: number;
  mieszkaniaDomy: number;
}

const TYPY = [
  'jednoosobowe',
  'para bez dzieci',
  'para z dziećmi',
  'samotny rodzic z dziećmi',
  'trzy pokolenia krewnych',
  'inne wieloosobowe',
] as const;

/** Typ gospodarstwa z więzi w nim (indeks w TYPY). Trzy pokolenia: ktoś ma tu i rodzica, i dziecko. Para z dziećmi:
    jedyni bez rodzica w gospodarstwie to para, reszta to ich dzieci w każdym wieku. Inne: rodzeństwo, dwie rodziny
    bez wnuków (np. matka, córka i jej partner), osoby niespokrewnione. */
function typGospodarstwa(cz: readonly Osoba[]): number {
  if (cz.length === 1) return 0;
  const tu = new Set(cz.map((o) => o.id));
  const rodziceTu = (o: Osoba): string[] =>
    [o.matka, o.ojciec].filter((id): id is string => id !== undefined && tu.has(id));
  const zRodzicem = new Set(cz.filter((o) => rodziceTu(o).length > 0).map((o) => o.id));
  const zDzieckiem = new Set(cz.flatMap(rodziceTu));
  if ([...zRodzicem].some((id) => zDzieckiem.has(id))) return 4;
  const bezRodzica = cz.filter((o) => !zRodzicem.has(o.id));
  const wParze = (o: Osoba): boolean => o.partner !== undefined && tu.has(o.partner);
  if (bezRodzica.length === 2 && bezRodzica.every(wParze) && bezRodzica[0].partner === bezRodzica[1].id) {
    return cz.length === 2 ? 1 : 2;
  }
  if (bezRodzica.length === 1 && !cz.some(wParze)) return 3;
  return 5;
}

/** Trzy pokolenia według definicji GUS (NSP 2021, `k.trojpokoleniowe`): razem osoba do 29 lat, w wieku 30-59
    i od 60 lat. */
function trzyPokoleniaGus(cz: readonly Osoba[], rok: number): boolean {
  let mlodzi = false;
  let srodek = false;
  let starsi = false;
  for (const o of cz) {
    const w = wiekW(rok, o);
    if (w <= 29) mlodzi = true;
    else if (w <= 59) srodek = true;
    else starsi = true;
  }
  return mlodzi && srodek && starsi;
}

function policz({ rok, wyniki }: Chwila): Liczby {
  const l: Liczby = {
    M: new Array(GRUPY).fill(0),
    K: new Array(GRUPY).fill(0),
    ludnosc: 0,
    gospodarstwa: 0,
    typy: new Array(TYPY.length).fill(0),
    trzyGus: 0,
    zRodzicem: 0,
    osob75: 0,
    samotni75: 0,
    pusteBloki: 0,
    mieszkaniaBloki: 0,
    pusteDomy: 0,
    mieszkaniaDomy: 0,
  };
  for (const w of wyniki) {
    const wg = new Map(w.osoby.map((o) => [o.id, o]));
    for (const o of w.osoby) {
      if (o.stan !== 'tu') continue;
      l.ludnosc++;
      l[o.plec][grupa(wiekW(rok, o))]++;
      if (wiekW(rok, o) >= 75) l.osob75++;
    }
    for (const g of w.gospodarstwa) {
      const cz = g.czlonkowie.map((id) => wg.get(id)!);
      l.gospodarstwa++;
      l.typy[typGospodarstwa(cz)]++;
      if (trzyPokoleniaGus(cz, rok)) l.trzyGus++;
      const dom = new Set(g.czlonkowie);
      const dorosleZRodzicem = cz.some(
        (o) => wiekW(rok, o) >= 25 && [o.matka, o.ojciec].some((id) => id !== undefined && dom.has(id)),
      );
      if (dorosleZRodzicem) l.zRodzicem++;
      if (cz.length === 1 && wiekW(rok, cz[0]) >= 75) l.samotni75++;
    }
    const mieszkania = w.budynek.mieszkania ?? 0;
    if (w.budynek.typ === 'blok') {
      l.pusteBloki += w.puste;
      l.mieszkaniaBloki += mieszkania;
    } else {
      l.pusteDomy += w.puste;
      l.mieszkaniaDomy += mieszkania;
    }
  }
  return l;
}

const udzial = (l: Liczby, od: number, doGrupy: number): number =>
  (suma(l.M.slice(od, doGrupy + 1)) + suma(l.K.slice(od, doGrupy + 1))) / l.ludnosc;

// ---------------------------------------------------------------- wypisywanie

function pasek(n: number, najwiecej: number, lewy: boolean): string {
  const polowki = najwiecej > 0 ? Math.round((n / najwiecej) * SZEROKOSC * 2) : 0;
  const pelne = '█'.repeat(polowki >> 1);
  if (lewy) return ((polowki & 1 ? '▐' : '') + pelne).padStart(SZEROKOSC);
  return (pelne + (polowki & 1 ? '▌' : '')).padEnd(SZEROKOSC);
}

function piramida(ch: Chwila, l: Liczby, najwiecej: number): string[] {
  const wiersze = [`  Piramida ${ch.rok} (${ch.opis}): ${ile(l.ludnosc, OSOBY)}`];
  // kolumny wiersza: 3 spacje, wiek na 5 znakach, spacja, liczba na 6, spacja, słupek, potem kreska środka
  wiersze.push(`    wiek${'mężczyźni '.padStart(SZEROKOSC + 8)}│ kobiety`);
  for (let i = GRUPY - 1; i >= 0; i--) {
    const m = l.M[i];
    const k = l.K[i];
    wiersze.push(
      `   ${ETYKIETY[i].padStart(5)} ${liczba(m).padStart(6)} ${pasek(m, najwiecej, true)}│${pasek(k, najwiecej, false)} ${liczba(k)}`,
    );
  }
  return wiersze;
}

/** Wiersze tabeli: opis i wartość w jednej chwili (pusta funkcja to nagłówek grupy). */
const WIERSZE: [string, ((x: Liczby) => string) | null][] = [
  ['ludność', (x) => liczba(x.ludnosc)],
  ['gospodarstwa', (x) => liczba(x.gospodarstwa)],
  ['0-14 lat', (x) => procent(udzial(x, 0, 2))],
  ['65 lat i więcej', (x) => procent(udzial(x, 13, GRUPY - 1))],
  ['80 lat i więcej', (x) => procent(udzial(x, 16, GRUPY - 1))],
  ['puste mieszkania w blokach', (x) => procent(x.pusteBloki / x.mieszkaniaBloki)],
  ['puste mieszkania w domach', (x) => procent(x.pusteDomy / x.mieszkaniaDomy)],
  ['samotni wśród osób od 75 lat', (x) => procent(x.samotni75 / x.osob75)],
  ['gospodarstwa wielopokoleniowe:', null],
  ['  trzy pokolenia wg GUS (do 29, 30-59, 60+)', (x) => procent(x.trzyGus / x.gospodarstwa)],
  ['  dorosłe dziecko (25+) z rodzicem', (x) => procent(x.zRodzicem / x.gospodarstwa)],
  ['typy gospodarstw:', null],
  ...TYPY.map((t, i): [string, (x: Liczby) => string] => [`  ${t}`, (x) => procent(x.typy[i] / x.gospodarstwa)]),
];

function tabela(ch: readonly Chwila[], l: readonly Liczby[]): string[] {
  const wiersz = (opis: string, wartosci: readonly string[]): string =>
    `  ${opis.padEnd(44)}${wartosci.map((v) => v.padStart(9)).join('')}`.trimEnd();
  return [
    wiersz(
      '',
      ch.map((c) => String(c.rok)),
    ),
    ...WIERSZE.map(([opis, f]) => wiersz(opis, f ? l.map(f) : [])),
  ];
}

// ---------------------------------------------------------------- gmina dema

interface Gmina {
  g: TabeleGminy | null;
  jak: string;
}

function gminaDema(klucz: string, geo: Geo, gminy: readonly TabeleGminy[]): Gmina {
  const [lat, lon] = geo.c;
  let blisko: Gmina | undefined;
  for (const g of gminy) {
    const r = rejonDla(g, lat, lon);
    if (r.zapas === 'brak') return { g, jak: `adres w rejonie ${r.rejon}` };
    if (r.zapas === 'najblizszy' && !blisko) blisko = { g, jak: `adres do 1 km od rejonu ${r.rejon}` };
  }
  if (blisko) return blisko;
  const zapas = gminy.find((g) => g.teryt === ZAPAS_TERYT[klucz]);
  if (zapas) return { g: zapas, jak: 'adres poza obrysami, TERYT z listy zapasowej' };
  return { g: null, jak: 'brak tabeli gminy, szablon krajowy' };
}

// ---------------------------------------------------------------- demo

interface Demo {
  key: string;
  name: string;
  addr: string;
  geo: Geo;
}

function wypiszDemo(d: Demo, gm: Gmina, k: TabeleKraju): void {
  const { g } = gm;
  console.log(`\n=== ${d.name}, ${d.addr} ===`);
  console.log(`  gmina: ${g ? `${g.nazwa} (${g.teryt}), ${gm.jak}` : gm.jak}`);

  const czasy: number[] = [];
  let osiedle: Osiedle | undefined;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    osiedle = generujObszar(d.geo, g, k);
    czasy.push(performance.now() - t0);
  }
  const wyniki2051 = osiedle!.budynki;
  const bloki = wyniki2051.filter((w) => w.budynek.typ === 'blok');
  console.log(
    `  obszar 384 m: ${ile(wyniki2051.length, ['budynek', 'budynki', 'budynków'])} (bloki ${bloki.length}, domy ${wyniki2051.length - bloki.length}), mieszkań ${liczba(suma(wyniki2051.map((w) => w.budynek.mieszkania ?? 0)))}`,
  );
  const ms = mediana(czasy);
  console.log(
    `  czas generowania: ${Math.round(ms)} ms (mediana z 3, pierwszy przebieg ${Math.round(czasy[0])} ms)${ms > CEL_MS ? `  UWAGA: ponad ${CEL_MS} ms` : ''}`,
  );

  const obszar = obszarGminy(g);
  const spis = wyniki2051.map((w) => obsadzBudynek(w.budynek, g ? marginesyDla(g, w.budynek.rejon) : k.polska, g, k));
  const chwile: Chwila[] = [
    { rok: 2021, opis: 'spis', wyniki: spis },
    { rok: 2026, opis: 'koniec 2025', wyniki: spis.map((w) => postarz(w, 2026, k, obszar, false)) },
    { rok: ROK_GRY, opis: '1 stycznia, po upadku', wyniki: wyniki2051 },
  ];
  const liczby = chwile.map(policz);
  const najwiecej = Math.max(...liczby.flatMap((l) => [...l.M, ...l.K]));
  for (const [i, ch] of chwile.entries()) {
    console.log('');
    for (const w of piramida(ch, liczby[i], najwiecej)) console.log(w);
  }
  console.log('');
  for (const w of tabela(chwile, liczby)) console.log(w);
  const puste = liczby[2].pusteBloki / liczby[2].mieszkaniaBloki;
  if (Number.isFinite(puste) && (puste < 0.4 || puste > 0.6)) {
    console.log(`  UWAGA: puste mieszkania w blokach w 2051 poza celem 40-60%`);
  }
}

// ---------------------------------------------------------------- test wsteczny

interface Wsteczny {
  g: TabeleGminy;
  model: number[];
  gus: number[];
  spis: number;
  ms: number;
}

function testWsteczny(g: TabeleGminy, k: TabeleKraju): Wsteczny {
  const t0 = performance.now();
  const obszar = obszarGminy(g);
  const model = new Array(GRUPY).fill(0);
  let spis = 0;
  for (const [rejon, m] of Object.entries(g.rejony)) {
    const w = obsadzRejon(m, suma(Object.values(m.gospodarstwa)), k, `test-wsteczny/${g.teryt}/${rejon}`, g);
    spis += w.osoby.length;
    for (const o of postarz(w, 2026, k, obszar, false).osoby) if (o.stan === 'tu') model[grupa(wiekW(2026, o))]++;
  }
  const gus = g.wiek2025.M.map((v, i) => v + g.wiek2025.K[i]);
  return { g, model, gus, spis, ms: performance.now() - t0 };
}

function wypiszWsteczne(testy: readonly Wsteczny[]): boolean {
  console.log(`\n=== Test wsteczny 2021→2025, próg ±${PROG_PP} pp ===`);
  console.log(
    '  Rejony gminy obsadzone na spis, postarzone bez upadku do końca 2025, wobec GUS na 31.12.2025 (P2137).',
  );
  console.log(
    `  ${'gmina'.padEnd(30)}${'grupa'.padEnd(7)}${'model'.padStart(8)}${'GUS'.padStart(8)}${'różnica'.padStart(11)}`,
  );
  let dobrze = true;
  for (const t of testy) {
    for (const [i, [nazwa, od, doGrupy]] of SZEROKIE.entries()) {
      const m = suma(t.model.slice(od, doGrupy + 1)) / suma(t.model);
      const r = suma(t.gus.slice(od, doGrupy + 1)) / suma(t.gus);
      const pp = 100 * (m - r);
      const przekroczony = Math.abs(pp) > PROG_PP;
      if (przekroczony) dobrze = false;
      const gmina = i === 0 ? `${t.g.nazwa} (${t.g.teryt})` : '';
      console.log(
        `  ${gmina.padEnd(30)}${nazwa.padEnd(7)}${procent(m).padStart(8)}${procent(r).padStart(8)}${punkty(pp).padStart(11)}${przekroczony ? '  PRZEKROCZONY' : ''}`,
      );
    }
    console.log(
      `  ${''.padEnd(30)}ludność: spis ${liczba(t.spis)}, model 2025 ${liczba(suma(t.model))}, GUS 2025 ${liczba(suma(t.gus))}; ${Math.round(t.ms)} ms`,
    );
  }
  console.log(dobrze ? '  Wynik: wszystkie udziały w progu.' : `  Wynik: przekroczony próg ±${PROG_PP} pp.`);
  return dobrze;
}

// ---------------------------------------------------------------- start

const k = await wczytajKraj(zPliku);
const katalog = path.join(PUBLIC, 'data/mieszkancy/gminy');
const gminy: TabeleGminy[] = [];
for (const plik of fs.readdirSync(katalog).sort()) {
  const m = /^(\d{7})\.json$/.exec(plik);
  const g = m ? await wczytajGmine(m[1], zPliku) : null;
  if (g) gminy.push(g);
}
const indeks = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo/index.json'), 'utf8')) as { key: string }[];
const dema = indeks
  .map((x) => x.key)
  .filter((key) => WYBRANE.length === 0 || WYBRANE.includes(key))
  .map((key) => JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${key}.json`), 'utf8')) as Demo);
if (dema.length === 0) {
  console.error(`Nie ma takiego dema: ${WYBRANE.join(', ')}. Są: ${indeks.map((x) => x.key).join(', ')}.`);
  process.exit(1);
}

console.log(
  `Mieszkańcy z adresu: ${ile(dema.length, ['demo', 'dema', 'dem'])}, tabele gmin ${gminy.map((g) => g.teryt).join(', ')}`,
);
const doTestu = new Map<string, TabeleGminy>();
for (const d of dema) {
  const gm = gminaDema(d.key, d.geo, gminy);
  wypiszDemo(d, gm, k);
  if (gm.g) doTestu.set(gm.g.teryt, gm.g);
}
if (HISTORIE) console.log('\n--historie: przykładowe historie gospodarstw dojdą w kroku 4 (kronika i historie).');
const dobrze = wypiszWsteczne([...doTestu.values()].map((g) => testWsteczny(g, k)));
if (!dobrze) process.exitCode = 1;
