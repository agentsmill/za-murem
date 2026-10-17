/* Tabele krajowe dla generatora mieszkańców: z surowych plików GUS i Eurostatu (poza repozytorium, katalog
   ZM_SUROWE) robi `public/data/mieszkancy/kraj.json` i `LICENCJE.md`. Źródła:
   - umieralność: GUS, Tablica A trwania życia w 2025 r., sześć arkuszy (miasta, wieś, Polska × M, K),
   - płodność: Eurostat demo_frate, Polska 2024, pojedyncze lata wieku 15-49,
   - dzietność według roku 2021-2025: GUS (2024, 2025) i trend z Eurostatu demo_find (2021-2023),
   - szablon gospodarstw i dane do `polska`: aneks „Rodziny w Polsce”, tabl. 4 i 5, oraz cztery tablice NSP 2021
     z rejonami (arkusz „Dane - rejony statystyczne”) zsumowane po całym kraju,
   - struktura wieku do `polska.wiek`: prognoza ludności GUS, Tabl. 1, rok 2022 (ostatni empiryczny),
   - nota SGJP w LICENCJE.md: nagłówek pliku sgjp-20260823.tab.gz.
   Liczb, których nie ma w plikach, nie wymyślamy: stałe poniżej mają adres źródła w komentarzu.
   Pamięć: cztery pliki NSP czytane po kolei dają szczyt ok. 650 MB, więc zwykłe `node` wystarcza.
   Uruchomienie: npm run dane:kraj */

import fs from 'node:fs';
import path from 'node:path';
import { type KluczQx, type TabeleKraju, WERSJA_TABEL } from '../src/mieszkancy/tabele.ts';
import { ARKUSZ_REJONOW, PLIKI_TABLIC, type Pole, pustyMarginesy, sumaTablicy } from './dane/gminy.ts';
import {
  ARKUSZE_QX,
  e0ZQx,
  mnoznikTfr,
  normalizujDo,
  notaSgjp,
  plodnoscZCsv,
  przezycieZQx,
  qxZArkusza,
  szablonZAneksu,
  tfrRoczny,
  tfrZDemoFind,
  wiekZPrognozy,
} from './dane/kraj.ts';
import { tekstLicencji } from './dane/licencje.ts';
import { SUROWE, wyjscie } from './dane/sciezki.ts';
import { wiersze } from './dane/xlsx.ts';

const UMIERALNOSC = path.join(
  SUROWE,
  'demografia/gus-trwanie-zycia-2025/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx',
);
const PLODNOSC = path.join(SUROWE, 'demografia/eurostat/demo_frate.csv');
const DZIETNOSC = path.join(SUROWE, 'demografia/eurostat/demo_find.csv');
const ANEKS = path.join(SUROWE, 'gus/nsp2021-rodziny/aneks_tabelaryczny_do_publikacji_2.xlsx');
const NSP_REJONY = path.join(SUROWE, 'gus/nsp2021-gospodarstwa-rejony');
const PROGNOZA = path.join(SUROWE, 'demografia/gus-prognoza-ludnosci-2023-2060/2-wyniki_polska.xlsx');
const SGJP = path.join(SUROWE, 'odmiana/sgjp/sgjp-20260823.tab.gz');
/** Tyle początku skompresowanego pliku SGJP wystarcza na nagłówek (blok COPYRIGHT ma ok. 2 KB tekstu). */
const POCZATEK_SGJP = 32 * 1024;

// ---------------------------------------------------------------- stałe spoza plików

/** TFR 2024 według GUS w tysięcznych, żeby liczyć na liczbach całkowitych: miasta 100 tys.+ 1,000, miasta 1,069,
    wieś 1,149 (Polska 1,099, ale mnożniki nie są liczone wobec niego, patrz `mnoznikTfr`). GUS, Rocznik
    Demograficzny 2025, tabl. 76 i 78
    (https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5515/3/19/1/rocznik_demograficzny_2025_tablice.zip),
    zebrane w research_notes/Dane do generatora mieszkańców/demografia_dynamika.md. */
const TFR_GUS_2024 = { miasto100k: 1000, miasto: 1069, wies: 1149 };

/** Dzietność Polski według GUS na 10 000: 2024 to 1,099 (Rocznik Demograficzny 2025, tabl. 76, jak wyżej), 2025 to
    1,068 („Sytuacja demograficzna Polski do 2025 r.”, tabl. 2B, wiersz POLSKA, plik
    demografia/gus-sytuacja-demograficzna-2025/sytuacjademograficznapolskido2025.xlsx w surowych danych). Lata
    2021-2023 dają trend z Eurostatu (demo_find) względem 2024, decyzja koordynatora R30. */
const TFR_GUS_POLSKA: Record<string, number> = { '2024': 10990, '2025': 10680 };
const LATA_TFR = [2021, 2022, 2023, 2024, 2025];
const ROK_BAZY_TFR = 2024;

/** Urodzenia według kolejności w 2024: pierwsze 44,1%, drugie 33,9%, trzecie 12,4%, czwarte i dalsze 6,1% (w setnych
    procenta: 4410, 3390, 1240, 610). Razem 96,5%, bo urodzenia o nieustalonej kolejności GUS zostawia poza tą
    strukturą; do tabeli idą udziały wśród urodzeń o znanej kolejności, normalizowane do dokładnie 10 000. GUS,
    Rocznik Demograficzny 2025, tabl. 57
    (https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html). */
const KOLEJNOSC_URODZEN_GUS = [4410, 3390, 1240, 610];

/** Gospodarstwa trzypokoleniowe (osoby młode, w średnim wieku i starsze razem), NSP 2021: miasta 9,9%, wieś 24,3%,
    na 10 000. GUS, Rodziny w Polsce w świetle wyników NSP 2021, tabl. 3.6, s. 34
    (https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/6536/7/2/1/rodziny_w_polsce_w_swietle_wynikow_nsp2021.pdf);
    liczby sprawdzone w pliku PDF z surowych danych. */
const TROJPOKOLENIOWE: TabeleKraju['trojpokoleniowe'] = { miasta: 990, wies: 2430 };

// ---------------------------------------------------------------- odczyt

function wczytajQx(): Record<KluczQx, number[]> {
  const buf = fs.readFileSync(UMIERALNOSC);
  const qx = {} as Record<KluczQx, number[]>;
  for (const [arkusz, klucz] of Object.entries(ARKUSZE_QX)) {
    const tablica = qxZArkusza(wiersze(buf, arkusz));
    qx[klucz] = tablica.qx;
    console.log(
      `  qx ${klucz}: e(0) z qx ${e0ZQx(tablica.qx).toFixed(2)}, w pliku ${tablica.ex0}; przeżycie 60→85 ${przezycieZQx(tablica.qx, 60, 85).toFixed(3)}`,
    );
  }
  return qx;
}

function wczytajPolske(): TabeleKraju['polska'] {
  const polska = pustyMarginesy();
  const dodaj = <P extends Pole>(pole: P, plik: string): void => {
    polska[pole] = sumaTablicy(wiersze(fs.readFileSync(path.join(NSP_REJONY, plik)), ARKUSZ_REJONOW), pole);
    const razem = Object.values(polska[pole] as Record<string, number>).reduce((a, b) => a + b, 0);
    console.log(`  polska.${pole}: ${razem} (suma rejonów z ${plik.slice(0, 32)}…)`);
  };
  for (const [pole, plik] of PLIKI_TABLIC) dodaj(pole, plik);
  polska.wiek = wiekZPrognozy(wiersze(fs.readFileSync(PROGNOZA), 'Tabl. 1'), '2022*');
  return polska;
}

function wczytajNoteSgjp(): { idSlownika: string; nota: string } {
  const fd = fs.openSync(SGJP, 'r');
  try {
    const poczatek = Buffer.alloc(POCZATEK_SGJP);
    const n = fs.readSync(fd, poczatek, 0, poczatek.length, 0);
    return notaSgjp(poczatek.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}

function main(): void {
  for (const plik of [UMIERALNOSC, PLODNOSC, DZIETNOSC, ANEKS, PROGNOZA, SGJP]) {
    if (!fs.existsSync(plik)) throw new Error(`Brak pliku ${plik} (katalog surowych danych: ZM_SUROWE=${SUROWE})`);
  }
  console.log('Umieralność (Tablica A GUS 2025):');
  const qx = wczytajQx();

  const plodnosc = plodnoscZCsv(fs.readFileSync(PLODNOSC, 'utf8'));
  console.log(`Płodność (Eurostat 2024): TFR ${(plodnosc.reduce((a, b) => a + b, 0) / 10000).toFixed(4)}`);
  const eurostatTfr = tfrZDemoFind(fs.readFileSync(DZIETNOSC, 'utf8'), [...LATA_TFR.slice(0, 3), ROK_BAZY_TFR]);
  const dzietnosc = tfrRoczny(eurostatTfr, TFR_GUS_POLSKA, ROK_BAZY_TFR, LATA_TFR);
  console.log(
    `Dzietność według roku (Eurostat w setnych ${JSON.stringify(eurostatTfr)}): ${JSON.stringify(dzietnosc)}`,
  );

  const aneks = fs.readFileSync(ANEKS);
  const szablonGospodarstw = szablonZAneksu(wiersze(aneks, 'TABL. 4'), wiersze(aneks, 'TABL. 5'));

  console.log('Polska (NSP 2021 i prognoza GUS):');
  const polska = wczytajPolske();
  const gospodarstwSzablonu = [szablonGospodarstw.miasta, szablonGospodarstw.wies]
    .flatMap((o) => Object.values(o))
    .reduce((a, b) => a + b, 0);
  const gospodarstwRejonow = Object.values(polska.gospodarstwa).reduce((a, b) => a + b, 0);
  if (gospodarstwSzablonu !== gospodarstwRejonow) {
    throw new Error(`Szablon z aneksu ma ${gospodarstwSzablonu} gospodarstw, a suma rejonów ${gospodarstwRejonow}`);
  }

  const kraj: TabeleKraju = {
    wersja: WERSJA_TABEL,
    qx,
    plodnosc,
    mnoznikPlodnosci: {
      miasto100k: mnoznikTfr(TFR_GUS_2024.miasto100k, plodnosc),
      miasto: mnoznikTfr(TFR_GUS_2024.miasto, plodnosc),
      wies: mnoznikTfr(TFR_GUS_2024.wies, plodnosc),
    },
    tfrRoczny: dzietnosc,
    kolejnosc: normalizujDo(KOLEJNOSC_URODZEN_GUS, 10000) as TabeleKraju['kolejnosc'],
    szablonGospodarstw,
    trojpokoleniowe: TROJPOKOLENIOWE,
    polska,
  };

  fs.mkdirSync(wyjscie(), { recursive: true });
  const tekst = `${JSON.stringify(kraj)}\n`;
  fs.writeFileSync(wyjscie('kraj.json'), tekst);
  const licencje = tekstLicencji(wczytajNoteSgjp());
  fs.writeFileSync(wyjscie('LICENCJE.md'), licencje);
  console.log(
    `kraj.json: ${(Buffer.byteLength(tekst) / 1024).toFixed(1)} KB, ${Object.keys(szablonGospodarstw.miasta).length + Object.keys(szablonGospodarstw.wies).length} kluczy szablonu, ` +
      `mnożniki płodności ${JSON.stringify(kraj.mnoznikPlodnosci)}; LICENCJE.md: ${(Buffer.byteLength(licencje) / 1024).toFixed(1)} KB`,
  );
}

main();
