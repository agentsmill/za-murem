/* Codzienne kopie bazy serwera gry (MMO, etap 0: docs/superpowers/specs/2026-10-19-mmo-design.md, „Serwer świata”).
   Kopia to `VACUUM INTO` na działającej bazie (SQLite w trybie WAL): spójny obraz z chwili wywołania razem z tym, co leży
   jeszcze w pliku WAL, bez zatrzymywania serwera i bez blokowania cudzych zapisów. Plik `za-murem-RRRR-MM-DD.db` z datą
   w UTC (kontener ma UTC, ale data nie zależy od strefy procesu) powstaje najpierw jako `.tmp`, jest sprawdzany
   (quick_check i wersja schematu) i dopiero potem podmieniany, więc w katalogu nie ma niedokończonej kopii pod nazwą
   kopii, a druga kopia tego samego dnia zastępuje pierwszą. Kopie leżą na tym samym wolumenie co baza: chronią przed
   pomyłką (usunięte konto, zły zapis), nie przed utratą dysku albo maszyny. Zawierają te same dane osobowe co baza
   (nicki, pozycje zajętych klatek, zapisy gier), więc plik ma prawa 0600 od chwili utworzenia (VACUUM INTO pisze do
   pustego pliku z 0600, który przygotowujemy, bo sam SQLite tworzyłby go z 0644 do czasu chmod), a katalog założony
   przez serwer 0700. Kopie znikają po `dni` dniach, ale stare kasuje się dopiero po udanej nowej: usunięte konto znika
   z kopii po tym czasie, o ile kopie się udają; gdy przestaną powstawać (pełny dysk, zły katalog), zostają ostatnie
   dobre, także starsze niż `dni` dni (do informacji o danych osobowych).

   Zmienne w server/main.ts: ZM_KOPIE (katalog; brak: kopie wyłączone), ZM_KOPIE_DNI (ile ostatnich dni zostaje,
   domyślnie 7), ZM_KOPIA_GODZINA (godzina UTC, domyślnie 3). Błąd kopii (brak katalogu, pełny dysk) trafia do dziennika
   i nie wywraca serwera. */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Baza } from './baza.ts';

/** nazwa kopii (także niedokończonej, z .tmp); tylko takie pliki wolno usuwać */
const WZOR = /^za-murem-(\d{4})-(\d{2})-(\d{2})\.db(?:\.tmp)?$/;
const DOBA_MS = 86_400_000;

type Dziennik = (wpis: string) => void;
const naKonsole: Dziennik = (w) => console.error(w);
const opis = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** kopia ma schemat tej samej wersji i przechodzi quick_check; inaczej błąd (nie podmieniamy dobrej kopii złą) */
function sprawdzKopie(sciezka: string, wersjaSchematu: number): void {
  const kopia = new DatabaseSync(sciezka, { readOnly: true });
  try {
    const wynik = kopia.prepare('PRAGMA quick_check').get() as { quick_check: string };
    if (wynik.quick_check !== 'ok') throw new Error(`quick_check: ${wynik.quick_check}`);
    const wersja = Number((kopia.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (wersja !== wersjaSchematu) throw new Error(`wersja schematu kopii ${wersja}, bazy ${wersjaSchematu}`);
  } finally {
    kopia.close();
  }
}

/** Kopia bazy do `katalog/za-murem-RRRR-MM-DD.db` (data w UTC); zwraca ścieżkę albo null i wpis w dzienniku. Katalog
    musi istnieć (zakłada go planujKopie). */
export function zrobKopie(baza: Baza, katalog: string, teraz: Date, dziennik: Dziennik = naKonsole): string | null {
  let tymczasowa = '';
  try {
    const cel = path.join(katalog, `za-murem-${teraz.toISOString().slice(0, 10)}.db`);
    tymczasowa = `${cel}.tmp`;
    // niedokończona kopia z przerwanej próby; VACUUM INTO nie nadpisuje niepustego pliku
    fs.rmSync(tymczasowa, { force: true });
    // VACUUM INTO dopuszcza pusty plik, a ten ma 0600 od początku (nowy plik SQLite miałby 0644 do czasu chmod)
    fs.writeFileSync(tymczasowa, '', { mode: 0o600 });
    const wersja = Number((baza.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    baza.db.exec(`VACUUM INTO '${tymczasowa.replaceAll("'", "''")}'`);
    sprawdzKopie(tymczasowa, wersja);
    fs.chmodSync(tymczasowa, 0o600);
    fs.renameSync(tymczasowa, cel);
    return cel;
  } catch (e) {
    dziennik(`kopia bazy nie powiodła się: ${opis(e)}`);
    if (tymczasowa) {
      try {
        fs.rmSync(tymczasowa, { force: true });
      } catch {}
    }
    return null;
  }
}

/** Usuwa kopie (i niedokończone .tmp) z datą w nazwie sprzed `dni` lub więcej dni (liczonych w dniach UTC): zostaje
    `dni` ostatnich dni, razem z dzisiejszym. Obcych plików, katalogów o takiej nazwie i dat z przyszłości nie rusza; przy
    `dni` mniejszym od 1 nie robi nic. Zwraca ścieżki usuniętych plików. */
export function usunStare(katalog: string, dni: number, teraz: Date, dziennik: Dziennik = naKonsole): string[] {
  if (!Number.isFinite(dni) || dni < 1) return [];
  const dzis = Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate());
  if (Number.isNaN(dzis)) return [];
  let nazwy: string[];
  try {
    nazwy = fs.readdirSync(katalog);
  } catch {
    return [];
  }
  const usuniete: string[] = [];
  for (const nazwa of nazwy) {
    const m = WZOR.exec(nazwa);
    if (!m) continue;
    const wiek = (dzis - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / DOBA_MS;
    if (!(wiek >= dni)) continue;
    const sciezka = path.join(katalog, nazwa);
    try {
      if (!fs.lstatSync(sciezka).isFile()) continue;
      fs.rmSync(sciezka);
      usuniete.push(sciezka);
    } catch (e) {
      dziennik(`nie udało się usunąć starej kopii ${nazwa}: ${opis(e)}`);
    }
  }
  return usuniete;
}

export interface OpcjeKopii {
  baza: Baza;
  katalog: string;
  /** ile ostatnich dni kopii zostaje (domyślnie 7) */
  dni?: number;
  /** godzina UTC, o której robi się kopię (domyślnie 3) */
  godzina?: number;
  /** zegar (testy) */
  teraz?: () => Date;
  /** błędy kopii (domyślnie console.error) */
  dziennik?: Dziennik;
  /** udane kopie i usunięte stare (domyślnie nic) */
  info?: Dziennik;
}

/** Kopia raz na dobę o `godzina:00` UTC. Po starcie, gdy ta godzina dzisiaj już minęła, a dzisiejszej kopii jeszcze nie
    ma (serwer stał o tej porze, bo restartuje się co 48 godzin albo był wdrażany), robi ją od razu. Katalog zakłada sama.
    Timer nie trzyma procesu przy życiu. */
export function planujKopie(op: OpcjeKopii): { zatrzymaj(): void } {
  const teraz = op.teraz ?? (() => new Date());
  const dziennik = op.dziennik ?? naKonsole;
  const info = op.info ?? (() => {});
  const dni = op.dni ?? 7;
  const godzina =
    Number.isInteger(op.godzina) && (op.godzina as number) >= 0 && (op.godzina as number) <= 23
      ? (op.godzina as number)
      : 3;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const zrob = () => {
    const t = teraz();
    try {
      fs.mkdirSync(op.katalog, { recursive: true, mode: 0o700 });
    } catch (e) {
      dziennik(`kopia bazy nie powiodła się: katalog ${op.katalog}: ${opis(e)}`);
      return;
    }
    const sciezka = zrobKopie(op.baza, op.katalog, t, dziennik);
    if (!sciezka) return;
    info(`kopia bazy: ${path.basename(sciezka)}`);
    for (const stara of usunStare(op.katalog, dni, t, dziennik)) info(`usunięta stara kopia: ${path.basename(stara)}`);
  };
  /** ms do najbliższej godziny kopii po `od` (ściśle później) */
  const doNastepnej = (od: Date) => {
    const dzis = Date.UTC(od.getUTCFullYear(), od.getUTCMonth(), od.getUTCDate(), godzina);
    return (dzis > od.getTime() ? dzis : dzis + DOBA_MS) - od.getTime();
  };
  /** nic z kopii nie może wywrócić serwera: ani w terminie, ani przy starcie (także wyjątek z funkcji dziennika) */
  const bezpiecznie = () => {
    try {
      zrob();
    } catch (e) {
      try {
        dziennik(`kopia bazy nie powiodła się: ${opis(e)}`);
      } catch {}
    }
  };
  const czekaj = () => {
    timer = setTimeout(() => {
      bezpiecznie();
      czekaj();
    }, doNastepnej(teraz()));
    timer.unref();
  };

  const start = teraz();
  const dzisiejsza = path.join(op.katalog, `za-murem-${start.toISOString().slice(0, 10)}.db`);
  if (start.getUTCHours() >= godzina && !fs.existsSync(dzisiejsza)) bezpiecznie();
  czekaj();
  return { zatrzymaj: () => clearTimeout(timer) };
}

export interface UstawieniaKopii {
  /** katalog kopii albo null: kopie wyłączone */
  katalog: string | null;
  dni: number;
  godzina: number;
  /** złe wartości zmiennych zastąpione domyślnymi: serwer pisze je do dziennika przy starcie */
  ostrzezenia: string[];
}

/** ZM_KOPIE, ZM_KOPIE_DNI (liczba całkowita od 1, domyślnie 7) i ZM_KOPIA_GODZINA (godzina UTC 0–23, domyślnie 3);
    zła wartość nie wyłącza kopii, tylko wraca do domyślnej z ostrzeżeniem */
export function ustawieniaKopii(env: Record<string, string | undefined>): UstawieniaKopii {
  const ostrzezenia: string[] = [];
  const liczba = (nazwa: string, domyslna: number, min: number, max: number, opis: string): number => {
    const v = env[nazwa];
    if (v === undefined || v.trim() === '') return domyslna;
    const n = Number(v);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    ostrzezenia.push(`${nazwa}=„${v}” to nie ${opis}, kopie używają ${domyslna}`);
    return domyslna;
  };
  return {
    katalog: env.ZM_KOPIE?.trim() ? env.ZM_KOPIE.trim() : null,
    dni: liczba('ZM_KOPIE_DNI', 7, 1, 36_500, 'liczba dni od 1'),
    godzina: liczba('ZM_KOPIA_GODZINA', 3, 0, 23, 'godzina UTC od 0 do 23'),
    ostrzezenia,
  };
}
