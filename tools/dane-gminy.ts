/* Tabele gmin dla generatora mieszkańców: z surowych plików GUS (poza repozytorium, katalog ZM_SUROWE) robi małe
   JSON-y `public/data/mieszkancy/gminy/<teryt>.json`, które czyta gra. Dla każdego punktu `lat,lon` (domyślnie
   trzy adresy dema z tests/unit/fixtures.ts) znajduje w granicach BREC 2021 jego rejon i gminę (dzielnicę), potem
   zbiera wszystkie rejony tej gminy:
   - gospodarstwa i rodziny: cztery tablice XLSX, arkusz „Dane - rejony statystyczne” (obwodów nie czytamy),
   - płeć i wiek: XLSX ludności, arkusz województwa, wiersze „rejon statystyczny”,
   - obrysy: SHP z BREC, uproszczone do 5 m i przeliczone na WGS84,
   - epoki i metraż (P4386), wiek 2021 (P4253) i 2025 (P2137): odpowiedzi BDL zapisane w gus/bdl-api/dane-przyklady.
   Cały plik BREC w pamięci to ok. 1,75 GB, więc czytamy go raz i zostawiamy tylko rejony potrzebnych gmin.
   Na końcu składa `gminy/indeks.json` (prostokąty gmin, `indeksGmin`) ze wszystkich plików gmin w katalogu, także
   tych sprzed tego uruchomienia. Sam indeks, bez surowych plików, odtwarza `--indeks`.
   Uruchomienie: npm run dane:gminy [-- lat,lon ...]    albo    npm run dane:gminy -- --indeks */

import fs from 'node:fs';
import path from 'node:path';
import { type Marginesy, type TabeleGminy, WERSJA_TABEL } from '../src/mieszkancy/tabele.ts';
import { ADDRESSES } from '../tests/unit/fixtures.ts';
import {
  ARKUSZ_REJONOW,
  czyMiejska,
  dodajTabele,
  epokiZBdl,
  GRUPY_WIEKU,
  indeksGmin,
  ludnoscRejonow,
  type MetaBdl,
  type OdpowiedzBdl,
  PLIKI_TABLIC,
  rozbijWiek,
  skrocNazwe,
  sumaMarginesow,
  terytZBdl,
  wartosciBdl,
  wiek2021ZBdl,
  wiek2025ZBdl,
  wojewodztwo,
  wWielokacie,
  zlozWiek10,
} from './dane/gminy.ts';
import { doWgs84, zWgs84 } from './dane/puwg.ts';
import { SUROWE, wyjscie } from './dane/sciezki.ts';
import { kodowanieZCpg, rekordyDbf, uprosc, wielokaty } from './dane/shp.ts';
import { wiersze } from './dane/xlsx.ts';
import { wpisZip } from './dane/zip.ts';

const GUS = path.join(SUROWE, 'gus');
const BREC = path.join(GUS, 'brec2021-granice-rejonow-obwodow/SU_BREC_2021_REJ.zip');
const GOSPODARSTWA = path.join(GUS, 'nsp2021-gospodarstwa-rejony');
const LUDNOSC = path.join(
  GUS,
  'nsp2021-ludnosc-rejony/ludnosc_w_rejonach_statystycznych_i_obwodach_spisowych_nsp_2021.xlsx',
);
const BDL_DANE = path.join(GUS, 'bdl-api/dane-przyklady');
const BDL_META = path.join(GUS, 'bdl-api/metadane-zmiennych');
const TOLERANCJA_M = 5;

type Pierscienie = number[][][];

// ---------------------------------------------------------------- punkty i BREC

function punktyZArgumentow(args: string[]): { lat: number; lon: number }[] {
  if (args.length === 0) return ADDRESSES.map((a) => ({ lat: a.lat, lon: a.lon }));
  return args.map((a) => {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(a);
    if (!m) throw new Error(`Punkt „${a}” ma mieć postać lat,lon (np. 54.4093,18.5991)`);
    return { lat: Number(m[1]), lon: Number(m[2]) };
  });
}

/** Gminy punktów i obrysy (PUWG) wszystkich rejonów tych gmin. Duże tablice żyją tylko w tej funkcji. */
function wczytajBrec(punkty: { lat: number; lon: number }[]): {
  trafienia: { gmina: string; rejon: string }[];
  obrysy: Map<string, Map<string, Pierscienie>>;
} {
  const zip = fs.readFileSync(BREC);
  const shp = wpisZip(zip, 'SU_BREC_2021_REJ.shp');
  const dbf = wpisZip(zip, 'SU_BREC_2021_REJ.dbf');
  if (!shp || !dbf) throw new Error(`BREC: w ${BREC} brakuje SU_BREC_2021_REJ.shp albo .dbf`);
  const rekordy = rekordyDbf(dbf, kodowanieZCpg(wpisZip(zip, 'SU_BREC_2021_REJ.cpg')));
  const ksztalty = wielokaty(shp);
  if (rekordy.length !== ksztalty.length) {
    throw new Error(`BREC: SHP ma ${ksztalty.length} rekordów, a DBF ${rekordy.length}, indeksy by się rozjechały`);
  }
  const trafienia = punkty.map((p) => {
    const [x, y] = zWgs84(p.lat, p.lon);
    const idx = ksztalty.flatMap((k, i) => (wWielokacie(x, y, k) ? [i] : []));
    if (idx.length !== 1)
      throw new Error(`Punkt ${p.lat},${p.lon} leży w ${idx.length} rejonach BREC, oczekiwano jednego`);
    const { GMINA, REJ } = rekordy[idx[0]];
    if (!/^\d{7}$/.test(GMINA) || !/^\d{6}$/.test(REJ))
      throw new Error(`BREC: rejon „${REJ}” w gminie „${GMINA}” ma zły kod`);
    return { gmina: GMINA, rejon: REJ };
  });
  const gminy = new Set(trafienia.map((t) => t.gmina));
  const obrysy = new Map<string, Map<string, Pierscienie>>([...gminy].map((g) => [g, new Map()]));
  rekordy.forEach((r, i) => {
    const cel = obrysy.get(r.GMINA);
    if (!cel) return;
    if (cel.has(r.REJ)) throw new Error(`BREC: rejon ${r.REJ} występuje dwa razy`);
    cel.set(r.REJ, ksztalty[i]);
  });
  return { trafienia, obrysy };
}

const piec = (v: number): number => Math.round(v * 1e5) / 1e5;

/** Pierścienie PUWG → uproszczone do 5 m → [lat, lon] z 5 miejscami po przecinku, bez powtórzonych punktów. */
function obrysWgs84(pierscienie: Pierscienie): [number, number][][] {
  const wynik: [number, number][][] = [];
  for (const p of pierscienie) {
    const out: [number, number][] = [];
    for (const [x, y] of uprosc(p as [number, number][], TOLERANCJA_M)) {
      const [lat, lon] = doWgs84(x, y);
      const a: [number, number] = [piec(lat), piec(lon)];
      const ost = out[out.length - 1];
      if (!ost || ost[0] !== a[0] || ost[1] !== a[1]) out.push(a);
    }
    if (out.length >= 4) wynik.push(out);
  }
  return wynik;
}

// ---------------------------------------------------------------- BDL

function plikBdl(teryt: string, koniec: string): string {
  const pliki = fs.readdirSync(BDL_DANE).filter((n) => {
    const m = /_(\d{12})__(.+)\.json$/.exec(n);
    return m !== null && terytZBdl(m[1]) === teryt && m[2] === koniec;
  });
  if (pliki.length !== 1) {
    throw new Error(`Brak jednego pliku „*_${koniec}.json” dla gminy ${teryt} w ${BDL_DANE} (jest ${pliki.length})`);
  }
  return path.join(BDL_DANE, pliki[0]);
}

function bdl(teryt: string, koniec: string, zmienna: string, rok: string): Map<string, number> {
  const odp = JSON.parse(fs.readFileSync(plikBdl(teryt, koniec), 'utf8')) as OdpowiedzBdl;
  const meta = JSON.parse(fs.readFileSync(path.join(BDL_META, `${zmienna}.json`), 'utf8')) as MetaBdl;
  return wartosciBdl(odp, meta, rok);
}

// ---------------------------------------------------------------- tabele

function zbierzMarginesy(gminy: string[]): { rejony: Map<string, Map<string, Marginesy>>; nazwy: Map<string, string> } {
  const rejony = new Map<string, Map<string, Marginesy>>(gminy.map((g) => [g, new Map()]));
  const nazwy = new Map<string, string>();
  for (const [pole, plik] of PLIKI_TABLIC) {
    const w = wiersze(fs.readFileSync(path.join(GOSPODARSTWA, plik)), ARKUSZ_REJONOW);
    for (const g of gminy) {
      const nazwa = dodajTabele(w, pole, g, rejony.get(g)!, pole === 'gospodarstwa');
      if (nazwa !== undefined && !nazwy.has(g)) nazwy.set(g, nazwa);
    }
  }
  for (const [g, r] of rejony) {
    if (r.size === 0) throw new Error(`Gmina ${g} nie występuje w tablicach gospodarstw GUS`);
  }
  return { rejony, nazwy };
}

type LudnoscWojewodztwa = ReturnType<typeof ludnoscRejonow>;

/** Ludność rejonów gmin z arkuszy ich województw (każdy arkusz czytany raz). */
function wczytajLudnosc(gminy: string[]): Map<string, LudnoscWojewodztwa> {
  const plik = fs.readFileSync(LUDNOSC);
  const wynik = new Map<string, LudnoscWojewodztwa>();
  for (const woj of new Set(gminy.map(wojewodztwo))) {
    const arkusz = woj[0].toUpperCase() + woj.slice(1);
    wynik.set(woj, ludnoscRejonow(wiersze(plik, arkusz), new Set(gminy.filter((g) => wojewodztwo(g) === woj))));
  }
  return wynik;
}

/** Jedna gmina: marginesy z tablic GUS + płeć w grupach wieku + obrysy + dane z BDL. */
function zbudujTabele(
  teryt: string,
  nazwaGus: string,
  marginesy: Map<string, Marginesy>,
  ludnosc: LudnoscWojewodztwa,
  ksztalty: Map<string, Pierscienie>,
): TabeleGminy {
  const wiek2021 = wiek2021ZBdl(bdl(teryt, 'nsp2021_ludnosc_wiek_stan_cywilny', 'P4253', '2021'));
  const wiek2025 = wiek2025ZBdl(bdl(teryt, 'biezace_ludnosc_wg_wieku_P2137', 'P2137', '2025'));
  const { epoki, metraz } = epokiZBdl(bdl(teryt, 'nsp2021_mieszkania_budynki', 'P4386', '2021'));
  const szablonM = zlozWiek10(wiek2021.M);
  const szablonK = zlozWiek10(wiek2021.K);

  const lud = new Map([...ludnosc].filter(([, l]) => l.jednostka === teryt));
  const bezLudnosci = [...marginesy.keys()].filter((r) => !lud.has(r));
  if (bezLudnosci.length > 0) {
    throw new Error(`Gmina ${teryt}: rejony z gospodarstwami bez wiersza w pliku ludności: ${bezLudnosci.join(', ')}`);
  }
  // rejon z samą ludnością zbiorową (akademik, zakład karny) nie ma gospodarstw, więc nie ma czego losować
  const bezGospodarstw = [...lud.keys()].filter((r) => !marginesy.has(r));
  if (bezGospodarstw.length > 0) {
    const osob = bezGospodarstw.reduce((a, r) => a + lud.get(r)!.mezczyzni + lud.get(r)!.kobiety, 0);
    console.log(`  ${teryt}: pomijam rejony bez gospodarstw (${bezGospodarstw.join(', ')}), razem ${osob} osób`);
  }

  const rejony: TabeleGminy['rejony'] = {};
  const obrysy: TabeleGminy['obrysy'] = {};
  for (const rej of [...marginesy.keys()].sort()) {
    const l = lud.get(rej)!;
    const { M, K } = rozbijWiek(l.grupy, l.mezczyzni, l.kobiety, szablonM, szablonK);
    const marg = marginesy.get(rej)!;
    GRUPY_WIEKU.forEach((g, i) => {
      marg.wiek.M[g] = M[i];
      marg.wiek.K[g] = K[i];
    });
    rejony[rej] = marg;
    const ksztalt = ksztalty.get(rej);
    if (!ksztalt) throw new Error(`Gmina ${teryt}: rejon ${rej} nie ma obrysu w BREC (pole GMINA puste albo inne)`);
    obrysy[rej] = obrysWgs84(ksztalt);
    if (obrysy[rej].length === 0) throw new Error(`Gmina ${teryt}: obrys rejonu ${rej} zniknął po uproszczeniu`);
  }

  let miejska = czyMiejska(teryt);
  if (miejska === null) {
    console.warn(`Uwaga: ${teryt} to cała gmina miejsko-wiejska, przyjmuję miejska = false`);
    miejska = false;
  }
  return {
    wersja: WERSJA_TABEL,
    teryt,
    nazwa: skrocNazwe(nazwaGus),
    woj: wojewodztwo(teryt),
    miejska,
    rejony,
    obrysy,
    gmina: sumaMarginesow(Object.values(rejony)),
    epoki,
    metraz,
    wiek2021,
    wiek2025,
  };
}

/** Indeks gmin z plików `gminy/<teryt>.json` w repozytorium (surowe dane niepotrzebne): zwarty JSON jak same tabele. */
function zapiszIndeks(): void {
  const katalog = wyjscie('gminy');
  const tabele = fs
    .readdirSync(katalog)
    .filter((n) => /^\d{7}\.json$/.test(n))
    .sort()
    .map((n) => JSON.parse(fs.readFileSync(path.join(katalog, n), 'utf8')) as TabeleGminy);
  const indeks = indeksGmin(tabele);
  fs.writeFileSync(wyjscie('gminy', 'indeks.json'), `${JSON.stringify(indeks)}\n`);
  console.log(`indeks.json: ${indeks.gminy.map((g) => g.teryt).join(', ')}`);
}

function main(): void {
  if (process.argv.slice(2).includes('--indeks')) {
    zapiszIndeks();
    return;
  }
  const { trafienia, obrysy } = wczytajBrec(punktyZArgumentow(process.argv.slice(2)));
  const gminy = [...new Set(trafienia.map((t) => t.gmina))];
  console.log(`Punkty → rejony: ${trafienia.map((t) => `${t.gmina}/${t.rejon}`).join(', ')}`);
  const { rejony, nazwy } = zbierzMarginesy(gminy);
  const ludnosc = wczytajLudnosc(gminy);

  fs.mkdirSync(wyjscie('gminy'), { recursive: true });
  for (const teryt of gminy) {
    const t = zbudujTabele(
      teryt,
      nazwy.get(teryt) ?? teryt,
      rejony.get(teryt)!,
      ludnosc.get(wojewodztwo(teryt))!,
      obrysy.get(teryt)!,
    );
    const tekst = `${JSON.stringify(t)}\n`;
    fs.writeFileSync(wyjscie('gminy', `${teryt}.json`), tekst);
    const gospodarstw = Object.values(t.gmina.gospodarstwa).reduce((a, b) => a + b, 0);
    const punktow = Object.values(t.obrysy).reduce((a, r) => a + r.reduce((b, p) => b + p.length, 0), 0);
    console.log(
      `${teryt} ${t.nazwa} (${t.woj}, ${t.miejska ? 'miejska' : 'wiejska'}): ${Object.keys(t.rejony).length} rejonów, ` +
        `${gospodarstw} gospodarstw, ${punktow} punktów obrysów, ${(Buffer.byteLength(tekst) / 1024).toFixed(0)} KB`,
    );
  }
  zapiszIndeks();
}

main();
