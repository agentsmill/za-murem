/* Wczytywanie surowych plików PESEL (katalog imiona-nazwiska/ w ZM_SUROWE) do struktur z imiona.ts i budowa
   wszystkich tabel imion i nazwisk. Osobno od imiona.ts, żeby czytniki i reguły dało się testować bez plików, a
   `npm run dane:imiona` i test powtarzalności korzystały z tego samego kodu. Każdy plik jest sprawdzany: brak pliku,
   zmieniony nagłówek albo niezgodna płeć zatrzymują budowę z opisem, zamiast po cichu dać złe tabele. */

import fs from 'node:fs';
import path from 'node:path';
import type { TabeleImion, TabeleNazwisk } from '../../src/mieszkancy/tabele.ts';
import {
  type DaneImion,
  type DaneNazwisk,
  type DiagnostykaNazwisk,
  type Licznik,
  nazwiskaZakazane,
  OSTATNI_ROK,
  PIERWSZY_ROK,
  type Plec,
  parsujCsv,
  polaczeniaZakazane,
  tabeleImion,
  tabeleNazwisk,
  type WierszImienia,
  wierszeImion,
} from './imiona.ts';
import { arkusze, type Komorka, wiersze } from './xlsx.ts';

const PLCIE: readonly Plec[] = ['M', 'K'];
const PRZYROSTNIK: Record<Plec, string> = { M: 'meskie', K: 'zenskie' };
const PIERWSZA_LITERA: Record<Plec, string> = { M: 'm', K: 'k' };

const dodaj = (l: Licznik, n: string, v: number): void => {
  l.set(n, (l.get(n) ?? 0) + v);
};

function czytajXlsx(plik: string): Komorka[][] {
  if (!fs.existsSync(plik)) throw new Error(`Brak pliku ${plik} (katalog surowych danych: ZM_SUROWE)`);
  const buf = fs.readFileSync(plik);
  return wiersze(buf, arkusze(buf)[0]);
}

function czytajCsv(plik: string): string[][] {
  if (!fs.existsSync(plik)) throw new Error(`Brak pliku ${plik} (katalog surowych danych: ZM_SUROWE)`);
  return parsujCsv(fs.readFileSync(plik, 'utf8'));
}

/** Licznik imion z pliku jednej płci; wiersz z inną płcią niż oczekiwana zatrzymuje budowę. */
function licznikPlci(w: WierszImienia[], plec: Plec, plik: string): Licznik {
  const wynik: Licznik = new Map();
  for (const r of w) {
    if (r.plec !== undefined && r.plec !== plec)
      throw new Error(`${plik}: imię ${r.imie} ma płeć ${r.plec}, oczekiwano ${plec}`);
    dodaj(wynik, r.imie, r.liczba);
  }
  return wynik;
}

function wczytajDaneImion(katalog: string): DaneImion {
  const urodzenia: DaneImion['urodzenia'] = {};
  for (let rok = PIERWSZY_ROK; rok <= OSTATNI_ROK + 1; rok++) urodzenia[rok] = { M: new Map(), K: new Map() };

  // 2000-2019: jeden plik zbiorczy z rokiem i płcią w wierszu
  const zbiorczy = path.join(katalog, 'imiona-nadane-dzieciom/imiona_pierwsze_dzieci_2000-2019.csv');
  const lata = new Set<number>();
  for (const r of wierszeImion(czytajCsv(zbiorczy))) {
    if (r.rok === undefined || r.plec === undefined || r.rok < PIERWSZY_ROK || r.rok > 2019) {
      throw new Error(`${zbiorczy}: wiersz ${r.imie} bez roku 2000-2019 albo płci`);
    }
    dodaj(urodzenia[r.rok][r.plec], r.imie, r.liczba);
    lata.add(r.rok);
  }
  if (lata.size !== 20) throw new Error(`${zbiorczy}: lata ${[...lata].sort().join(', ')}, oczekiwano 2000-2019`);

  // 2020-2025: pliki roczne osobno dla chłopców i dziewcząt
  for (let rok = 2020; rok <= OSTATNI_ROK; rok++) {
    for (const plec of PLCIE) {
      const plik = path.join(katalog, `imiona-nadane-dzieciom/${PIERWSZA_LITERA[plec]}_pierwsze_${rok}.xlsx`);
      urodzenia[rok][plec] = licznikPlci(wierszeImion(czytajXlsx(plik)), plec, plik);
    }
  }

  // 2026: pierwsza połowa roku, jeden plik z płcią w wierszu
  const polowa = path.join(katalog, 'imiona-nadane-dzieciom/pierwsze_I_polowa_2026.csv');
  for (const r of wierszeImion(czytajCsv(polowa))) {
    if (r.plec === undefined) throw new Error(`${polowa}: wiersz ${r.imie} bez płci`);
    dodaj(urodzenia[2026][r.plec], r.imie, r.liczba);
  }

  const wgPlci = (plik: (p: Plec) => string, csv: boolean): Record<Plec, Licznik> => {
    const wynik = {} as Record<Plec, Licznik>;
    for (const plec of PLCIE) {
      const sciezka = path.join(katalog, plik(plec));
      wynik[plec] = licznikPlci(wierszeImion(csv ? czytajCsv(sciezka) : czytajXlsx(sciezka)), plec, sciezka);
    }
    return wynik;
  };
  return {
    urodzenia,
    zyjacy: wgPlci((p) => `pesel-imiona-zyjacy/imiona_${PRZYROSTNIK[p]}_pierwsze_zyjacy_2026-01-20.xlsx`, false),
    razem: wgPlci((p) => `pesel-imiona-z-zmarlymi/imiona_${PRZYROSTNIK[p]}_pierwsze_z_zmarlymi_2026-01-20.xlsx`, false),
    zyjacy2019: wgPlci((p) => `pesel-imiona-zyjacy-2019/imiona_${PRZYROSTNIK[p]}_pierwsze_zyjacy_2019-07-18.csv`, true),
  };
}

/** Wiersze arkusza po sprawdzeniu nagłówka: kolumny muszą zaczynać się od podanych słów (bez wielkości liter). */
function bezNaglowka(w: Komorka[][], plik: string, kolumny: string[]): Komorka[][] {
  const naglowek = (w[0] ?? []).map((c) => String(c ?? '').toLowerCase());
  kolumny.forEach((k, i) => {
    if (!naglowek[i]?.startsWith(k))
      throw new Error(`${plik}: kolumna ${i + 1} to „${naglowek[i]}”, oczekiwano „${k}…”`);
  });
  return w.slice(1);
}

function wczytajDaneNazwisk(katalog: string, plikZakazanych: string): DaneNazwisk {
  const woj = {} as DaneNazwisk['woj'];
  const kraj = {} as DaneNazwisk['kraj'];
  for (const plec of PLCIE) {
    const plikWoj = path.join(
      katalog,
      `pesel-nazwiska-wojewodztwa/nazwiska_${PRZYROSTNIK[plec]}_wg_woj_2026-01-20.xlsx`,
    );
    woj[plec] = new Map();
    for (const r of bezNaglowka(czytajXlsx(plikWoj), plikWoj, ['wojew', 'nazwisko', 'liczba'])) {
      const [w, n, c] = r;
      if (typeof w !== 'string' || typeof n !== 'string' || typeof c !== 'number') continue;
      let mapa = woj[plec].get(w);
      if (!mapa) woj[plec].set(w, (mapa = new Map()));
      dodaj(mapa, n, c);
    }
    const plikKraj = path.join(katalog, `pesel-nazwiska-zyjacy/nazwiska_${PRZYROSTNIK[plec]}_zyjacy_2026-01-20.xlsx`);
    kraj[plec] = new Map();
    for (const r of bezNaglowka(czytajXlsx(plikKraj), plikKraj, ['nazwisko', 'liczba'])) {
      const [n, c] = r;
      if (typeof n === 'string' && typeof c === 'number') dodaj(kraj[plec], n, c);
    }
  }
  if (!fs.existsSync(plikZakazanych)) throw new Error(`Brak pliku z zakazanymi nazwiskami ${plikZakazanych}`);
  return { woj, kraj, zakazane: nazwiskaZakazane(fs.readFileSync(plikZakazanych, 'utf8')) };
}

export interface WynikBudowy {
  imiona: TabeleImion;
  nazwiska: TabeleNazwisk[];
  diagnostykaNazwisk: DiagnostykaNazwisk[];
  /** Wczytane dane, do kontroli w narzędziu. */
  daneImion: DaneImion;
}

/** Wszystkie tabele z surowych plików. `katalog` to imiona-nazwiska/ w katalogu surowych danych, `plikZakazanych`
    lista nazwisk, których gra nie używa, a `plikPolaczen` lista zakazanych połączeń imienia z nazwiskiem
    (`polaczeniaZakazane`), która idzie do imiona.json jako `zakazanePolaczenia`. */
export function zbudujZPlikow(katalog: string, plikZakazanych: string, plikPolaczen: string): WynikBudowy {
  const daneImion = wczytajDaneImion(katalog);
  const { tabele, diagnostyka } = tabeleNazwisk(wczytajDaneNazwisk(katalog, plikZakazanych));
  if (!fs.existsSync(plikPolaczen)) throw new Error(`Brak pliku z zakazanymi połączeniami ${plikPolaczen}`);
  const imiona: TabeleImion = {
    ...tabeleImion(daneImion),
    zakazanePolaczenia: polaczeniaZakazane(fs.readFileSync(plikPolaczen, 'utf8')),
  };
  return { imiona, nazwiska: tabele, diagnostykaNazwisk: diagnostyka, daneImion };
}
