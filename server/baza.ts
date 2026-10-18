/* Baza serwera gry: SQLite przez node:sqlite (DatabaseSync, bez zależności z npm). Schemat i zapytania w jednym
   miejscu; reszta serwera woła tylko funkcje stąd.

   Co jest w bazie (RODO, docs/superpowers/specs/2026-10-18-multiplayer-design.md):
   - konta: nick (i jego postać do porównań), skrót hasła, dzień założenia i ostatniej wizyty; bez e-maila, imion,
     adresu ani IP,
   - sesje: skrót SHA-256 tokenu, konto, termin ważności,
   - klatki: klucz klatki i budynku (src/world/klucze.ts), środek klatki (stopnie zaokrąglone do 1e-5, około 1 m),
     konto, czy to siedziba drużyny, chwila zajęcia,
   - zapisy: jeden zapis gry na konto (JSON skompresowany gzipem, bez tekstu adresu), wersja i chwila zmiany.
   Usunięcie konta kasuje kaskadą jego sesje, klatki i zapis (klucze obce z ON DELETE CASCADE).
   Wersja schematu w PRAGMA user_version; nowa wersja to nowy wpis w MIGRACJE. */

import { DatabaseSync } from 'node:sqlite';

const MIGRACJE: string[] = [
  `CREATE TABLE konta (
     id INTEGER PRIMARY KEY,
     nick TEXT NOT NULL,
     nick_klucz TEXT NOT NULL UNIQUE,
     haslo TEXT NOT NULL,
     utworzone INTEGER NOT NULL,
     ostatnio INTEGER NOT NULL
   ) STRICT;
   CREATE TABLE sesje (
     skrot TEXT PRIMARY KEY,
     konto INTEGER NOT NULL REFERENCES konta(id) ON DELETE CASCADE,
     utworzona INTEGER NOT NULL,
     wygasa INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX sesje_konto ON sesje(konto);
   CREATE TABLE klatki (
     klucz TEXT PRIMARY KEY,
     budynek TEXT NOT NULL,
     konto INTEGER NOT NULL REFERENCES konta(id) ON DELETE CASCADE,
     lat REAL NOT NULL,
     lon REAL NOT NULL,
     siedziba INTEGER NOT NULL DEFAULT 0,
     zajeta INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX klatki_konto ON klatki(konto);
   CREATE INDEX klatki_poz ON klatki(lat, lon);
   CREATE TABLE zapisy (
     konto INTEGER PRIMARY KEY REFERENCES konta(id) ON DELETE CASCADE,
     dane BLOB NOT NULL,
     rozmiar INTEGER NOT NULL,
     wersja INTEGER NOT NULL,
     zmieniony INTEGER NOT NULL
   ) STRICT;`,
];

export interface Konto {
  id: number;
  nick: string;
  haslo: string;
  utworzone: number;
  ostatnio: number;
}

export interface Klatka {
  klucz: string;
  budynek: string;
  konto: number;
  lat: number;
  lon: number;
  siedziba: boolean;
  zajeta: number;
}

export interface Zapis {
  dane: Uint8Array;
  rozmiar: number;
  wersja: number;
  zmieniony: number;
}

export interface Baza {
  readonly db: DatabaseSync;
  /** nowe konto; null, gdy nick (bez względu na wielkość liter) jest zajęty */
  dodajKonto(nick: string, nickKlucz: string, haslo: string, teraz: number): Konto | null;
  kontoPoNicku(nickKlucz: string): Konto | null;
  konto(id: number): Konto | null;
  /** dzień ostatniej wizyty (ms od 1970, z dokładnością do doby) */
  dotknijKonta(id: number, dzien: number): void;
  usunKonto(id: number): void;

  dodajSesje(skrot: string, konto: number, teraz: number, wygasa: number): void;
  /** sesja z kontem; wygasła sesja znika i daje null */
  sesja(skrot: string, teraz: number): { konto: Konto; wygasa: number } | null;
  przedluzSesje(skrot: string, wygasa: number): void;
  usunSesje(skrot: string): void;
  /** zostawia najwyżej `ile` najnowszych sesji konta */
  przytnijSesje(konto: number, ile: number): void;
  usunWygasleSesje(teraz: number): number;

  klatka(klucz: string): Klatka | null;
  klatkiKonta(konto: number): Klatka[];
  liczbaKlatek(konto: number): number;
  siedziba(konto: number): Klatka | null;
  klatkiWProstokacie(s: number, w: number, n: number, e: number, limit: number): Klatka[];
  /** wstawia klatkę; false, gdy ktoś (ktokolwiek) już ją ma */
  dodajKlatke(k: Klatka): boolean;
  /** zwalnia klatkę konta; siedziba przechodzi na najstarszą z pozostałych; false, gdy to nie jego klatka */
  zwolnijKlatke(konto: number, klucz: string): boolean;
  zwolnijKlatkiKonta(konto: number): number;

  zapis(konto: number): Zapis | null;
  /** zapisuje, gdy wersja na serwerze to `poprzednia` (albo zawsze, gdy undefined); zwraca nową wersję albo null */
  ustawZapis(konto: number, dane: Uint8Array, rozmiar: number, teraz: number, poprzednia?: number): number | null;
  usunZapis(konto: number): boolean;
  wersjaZapisu(konto: number): number;

  /** wykonuje fn w jednej transakcji (BEGIN IMMEDIATE … COMMIT, przy błędzie ROLLBACK) */
  transakcja<T>(fn: () => T): T;
  zamknij(): void;
}

type Wiersz = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const str = (v: unknown) => String(v);

const kontoZ = (r: Wiersz): Konto => ({
  id: num(r.id),
  nick: str(r.nick),
  haslo: str(r.haslo),
  utworzone: num(r.utworzone),
  ostatnio: num(r.ostatnio),
});
const klatkaZ = (r: Wiersz): Klatka => ({
  klucz: str(r.klucz),
  budynek: str(r.budynek),
  konto: num(r.konto),
  lat: num(r.lat),
  lon: num(r.lon),
  siedziba: num(r.siedziba) === 1,
  zajeta: num(r.zajeta),
});

/** Otwiera (i w razie potrzeby zakłada) bazę: ścieżka do pliku albo ':memory:' w testach. */
export function otworzBaze(sciezka: string): Baza {
  const db = new DatabaseSync(sciezka, { enableForeignKeyConstraints: true });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (sciezka !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const wersja = num((db.prepare('PRAGMA user_version').get() as Wiersz).user_version);
  if (wersja > MIGRACJE.length)
    throw new Error(`Baza ma schemat w wersji ${wersja}, a serwer zna najwyżej ${MIGRACJE.length}.`);
  for (let v = wersja; v < MIGRACJE.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRACJE[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const q = {
    dodajKonto: db.prepare(
      'INSERT INTO konta (nick, nick_klucz, haslo, utworzone, ostatnio) VALUES (?, ?, ?, ?, ?) ON CONFLICT(nick_klucz) DO NOTHING',
    ),
    kontoPoNicku: db.prepare('SELECT * FROM konta WHERE nick_klucz = ?'),
    konto: db.prepare('SELECT * FROM konta WHERE id = ?'),
    dotknij: db.prepare('UPDATE konta SET ostatnio = ? WHERE id = ? AND ostatnio < ?'),
    usunKonto: db.prepare('DELETE FROM konta WHERE id = ?'),
    dodajSesje: db.prepare('INSERT INTO sesje (skrot, konto, utworzona, wygasa) VALUES (?, ?, ?, ?)'),
    sesja: db.prepare('SELECT konto, wygasa FROM sesje WHERE skrot = ?'),
    przedluz: db.prepare('UPDATE sesje SET wygasa = ? WHERE skrot = ?'),
    usunSesje: db.prepare('DELETE FROM sesje WHERE skrot = ?'),
    przytnij: db.prepare(
      'DELETE FROM sesje WHERE konto = ? AND skrot NOT IN (SELECT skrot FROM sesje WHERE konto = ? ORDER BY utworzona DESC, skrot LIMIT ?)',
    ),
    wygasle: db.prepare('DELETE FROM sesje WHERE wygasa <= ?'),
    klatka: db.prepare('SELECT * FROM klatki WHERE klucz = ?'),
    klatkiKonta: db.prepare('SELECT * FROM klatki WHERE konto = ? ORDER BY zajeta, klucz'),
    liczbaKlatek: db.prepare('SELECT COUNT(*) AS n FROM klatki WHERE konto = ?'),
    siedziba: db.prepare('SELECT * FROM klatki WHERE konto = ? AND siedziba = 1'),
    prostokat: db.prepare(
      'SELECT * FROM klatki WHERE lat >= ? AND lat <= ? AND lon >= ? AND lon <= ? ORDER BY klucz LIMIT ?',
    ),
    dodajKlatke: db.prepare(
      'INSERT INTO klatki (klucz, budynek, konto, lat, lon, siedziba, zajeta) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(klucz) DO NOTHING',
    ),
    usunKlatke: db.prepare('DELETE FROM klatki WHERE konto = ? AND klucz = ?'),
    najstarsza: db.prepare('SELECT klucz FROM klatki WHERE konto = ? ORDER BY zajeta, klucz LIMIT 1'),
    ustawSiedzibe: db.prepare('UPDATE klatki SET siedziba = 1 WHERE klucz = ?'),
    usunKlatkiKonta: db.prepare('DELETE FROM klatki WHERE konto = ?'),
    zapis: db.prepare('SELECT dane, rozmiar, wersja, zmieniony FROM zapisy WHERE konto = ?'),
    wersjaZapisu: db.prepare('SELECT wersja FROM zapisy WHERE konto = ?'),
    wstawZapis: db.prepare(
      `INSERT INTO zapisy (konto, dane, rozmiar, wersja, zmieniony) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(konto) DO UPDATE SET dane = excluded.dane, rozmiar = excluded.rozmiar, wersja = excluded.wersja,
       zmieniony = excluded.zmieniony`,
    ),
    usunZapis: db.prepare('DELETE FROM zapisy WHERE konto = ?'),
  };

  let otwarta = true;
  const transakcja = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const wersjaZapisu = (konto: number) => {
    const r = q.wersjaZapisu.get(konto) as Wiersz | undefined;
    return r ? num(r.wersja) : 0;
  };

  return {
    db,
    dodajKonto(nick, nickKlucz, haslo, teraz) {
      const r = q.dodajKonto.run(nick, nickKlucz, haslo, teraz, teraz);
      if (!r.changes) return null;
      return { id: num(r.lastInsertRowid), nick, haslo, utworzone: teraz, ostatnio: teraz };
    },
    kontoPoNicku(nickKlucz) {
      const r = q.kontoPoNicku.get(nickKlucz) as Wiersz | undefined;
      return r ? kontoZ(r) : null;
    },
    konto(id) {
      const r = q.konto.get(id) as Wiersz | undefined;
      return r ? kontoZ(r) : null;
    },
    dotknijKonta(id, dzien) {
      q.dotknij.run(dzien, id, dzien);
    },
    usunKonto(id) {
      q.usunKonto.run(id);
    },
    dodajSesje(skrot, konto, teraz, wygasa) {
      q.dodajSesje.run(skrot, konto, teraz, wygasa);
    },
    sesja(skrot, teraz) {
      const r = q.sesja.get(skrot) as Wiersz | undefined;
      if (!r) return null;
      if (num(r.wygasa) <= teraz) {
        q.usunSesje.run(skrot);
        return null;
      }
      const k = q.konto.get(num(r.konto)) as Wiersz | undefined;
      return k ? { konto: kontoZ(k), wygasa: num(r.wygasa) } : null;
    },
    przedluzSesje(skrot, wygasa) {
      q.przedluz.run(wygasa, skrot);
    },
    usunSesje(skrot) {
      q.usunSesje.run(skrot);
    },
    przytnijSesje(konto, ile) {
      q.przytnij.run(konto, konto, ile);
    },
    usunWygasleSesje(teraz) {
      return num(q.wygasle.run(teraz).changes);
    },
    klatka(klucz) {
      const r = q.klatka.get(klucz) as Wiersz | undefined;
      return r ? klatkaZ(r) : null;
    },
    klatkiKonta(konto) {
      return (q.klatkiKonta.all(konto) as Wiersz[]).map(klatkaZ);
    },
    liczbaKlatek(konto) {
      return num((q.liczbaKlatek.get(konto) as Wiersz).n);
    },
    siedziba(konto) {
      const r = q.siedziba.get(konto) as Wiersz | undefined;
      return r ? klatkaZ(r) : null;
    },
    klatkiWProstokacie(s, w, n, e, limit) {
      return (q.prostokat.all(s, n, w, e, limit) as Wiersz[]).map(klatkaZ);
    },
    dodajKlatke(k) {
      const r = q.dodajKlatke.run(k.klucz, k.budynek, k.konto, k.lat, k.lon, k.siedziba ? 1 : 0, k.zajeta);
      return r.changes > 0;
    },
    zwolnijKlatke(konto, klucz) {
      return transakcja(() => {
        const r = q.usunKlatke.run(konto, klucz);
        if (!r.changes) return false;
        if (!q.siedziba.get(konto)) {
          const n = q.najstarsza.get(konto) as Wiersz | undefined;
          if (n) q.ustawSiedzibe.run(str(n.klucz));
        }
        return true;
      });
    },
    zwolnijKlatkiKonta(konto) {
      return num(q.usunKlatkiKonta.run(konto).changes);
    },
    zapis(konto) {
      const r = q.zapis.get(konto) as Wiersz | undefined;
      if (!r) return null;
      return {
        dane: r.dane as Uint8Array,
        rozmiar: num(r.rozmiar),
        wersja: num(r.wersja),
        zmieniony: num(r.zmieniony),
      };
    },
    ustawZapis(konto, dane, rozmiar, teraz, poprzednia) {
      return transakcja(() => {
        const obecna = wersjaZapisu(konto);
        if (poprzednia !== undefined && poprzednia !== obecna) return null;
        q.wstawZapis.run(konto, dane, rozmiar, obecna + 1, teraz);
        return obecna + 1;
      });
    },
    usunZapis(konto) {
      return q.usunZapis.run(konto).changes > 0;
    },
    wersjaZapisu,
    transakcja,
    zamknij() {
      if (otwarta) db.close();
      otwarta = false;
    },
  };
}
