import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { otworzBaze } from '../../server/baza.ts';
import { planujKopie, ustawieniaKopii, usunStare, zrobKopie } from '../../server/kopie.ts';

let katalog = '';
beforeEach(() => {
  katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-kopie-'));
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(katalog, { recursive: true, force: true });
});

const DOBA = 24 * 3600_000;
/** pusty plik o nazwie kopii z datą (UTC) sprzed `dni` dni względem `teraz` */
function kopiaSprzed(dni: number, teraz: Date, koniec = '.db'): string {
  const data = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate()) - dni * DOBA);
  const nazwa = `za-murem-${data.toISOString().slice(0, 10)}${koniec}`;
  fs.writeFileSync(path.join(katalog, nazwa), 'x');
  return nazwa;
}
const pliki = () => fs.readdirSync(katalog).sort();

describe('kopie bazy serwera', () => {
  it('kopia jest spójną bazą z tymi samymi kontami, także gdy dane są jeszcze w WAL i w trakcie cudzego zapisu', () => {
    const plik = path.join(katalog, 'za-murem.db');
    const baza = otworzBaze(plik);
    const ja = baza.dodajKonto('Mateusz_test', 'mateusz_test', 'skrot-hasla', 1000);
    expect(ja).not.toBeNull();
    baza.dodajSesje('skrot-sesji', ja!.id, 1000, 9_999_999);
    // dane leżą jeszcze w pliku WAL, więc samo skopiowanie pliku bazy by ich nie zabrało
    expect(fs.statSync(`${plik}-wal`).size).toBeGreaterThan(0);

    // drugie połączenie zaczyna zapis i go nie kończy: kopia ma widzieć stan sprzed niego
    const inne = new DatabaseSync(plik);
    inne.exec('PRAGMA busy_timeout = 5000');
    inne.exec('BEGIN IMMEDIATE');
    inne
      .prepare("INSERT INTO konta (nick, nick_klucz, haslo, utworzone, ostatnio) VALUES ('Drugi', 'drugi', 'x', 1, 1)")
      .run();

    const kopiaDir = path.join(katalog, 'kopie');
    fs.mkdirSync(kopiaDir);
    const sciezka = zrobKopie(baza, kopiaDir, new Date('2026-10-19T03:00:00Z'));
    expect(sciezka).toBe(path.join(kopiaDir, 'za-murem-2026-10-19.db'));
    inne.exec('COMMIT');
    inne.close();

    const kopia = otworzBaze(sciezka!);
    expect(kopia.kontoPoNicku('mateusz_test')?.nick).toBe('Mateusz_test');
    expect(kopia.kontoPoNicku('drugi')).toBeNull();
    expect(kopia.sesja('skrot-sesji', 2000)?.konto.nick).toBe('Mateusz_test');
    expect(kopia.db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    kopia.zamknij();
    // oryginał dalej działa i ma już oba konta
    expect(baza.kontoPoNicku('drugi')?.nick).toBe('Drugi');
    baza.zamknij();
  });

  it('druga kopia tego samego dnia zastępuje pierwszą, a po drodze nie zostaje plik tymczasowy', () => {
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const kopiaDir = path.join(katalog, 'kopie');
    fs.mkdirSync(kopiaDir);
    const dzien = new Date('2026-10-19T03:00:00Z');
    zrobKopie(baza, kopiaDir, dzien);
    baza.dodajKonto('Pozniej', 'pozniej', 'x', 1);
    expect(zrobKopie(baza, kopiaDir, new Date('2026-10-19T21:00:00Z'))).not.toBeNull();
    expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db']);
    const kopia = otworzBaze(path.join(kopiaDir, 'za-murem-2026-10-19.db'));
    expect(kopia.kontoPoNicku('pozniej')).not.toBeNull();
    kopia.zamknij();
    baza.zamknij();
  });

  it('nazwa kopii z datą w UTC, a nie w strefie serwera ani w strefie podanej daty', () => {
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const kopiaDir = path.join(katalog, 'kopie');
    fs.mkdirSync(kopiaDir);
    // 23:30 w strefie −02:00 to już 01:30 UTC następnego dnia
    expect(zrobKopie(baza, kopiaDir, new Date('2026-10-19T23:30:00-02:00'))).toBe(
      path.join(kopiaDir, 'za-murem-2026-10-20.db'),
    );
    const staraStrefa = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    try {
      expect(zrobKopie(baza, kopiaDir, new Date('2026-10-19T23:30:00Z'))).toBe(
        path.join(kopiaDir, 'za-murem-2026-10-19.db'),
      );
    } finally {
      if (staraStrefa === undefined) delete process.env.TZ;
      else process.env.TZ = staraStrefa;
    }
    baza.zamknij();
  });

  it('brak katalogu albo błąd zapisu nie rzuca wyjątku: null i wpis w dzienniku', () => {
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const wpisy: string[] = [];
    const nieMa = path.join(katalog, 'nie', 'ma', 'takiego', 'katalogu');
    expect(zrobKopie(baza, nieMa, new Date(), (w) => wpisy.push(w))).toBeNull();
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatch(/kopia bazy/i);
    expect(fs.existsSync(nieMa)).toBe(false);
    // katalog, do którego nie wolno pisać (tu: plik zamiast katalogu)
    const plikZamiastKatalogu = path.join(katalog, 'plik');
    fs.writeFileSync(plikZamiastKatalogu, 'x');
    expect(zrobKopie(baza, plikZamiastKatalogu, new Date(), (w) => wpisy.push(w))).toBeNull();
    // baza już zamknięta
    baza.zamknij();
    fs.mkdirSync(path.join(katalog, 'kopie'));
    expect(zrobKopie(baza, path.join(katalog, 'kopie'), new Date(), (w) => wpisy.push(w))).toBeNull();
    expect(wpisy).toHaveLength(3);
    expect(fs.readdirSync(path.join(katalog, 'kopie'))).toEqual([]);
  });

  it('apostrof w ścieżce katalogu nie psuje polecenia SQL', () => {
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const dziwny = path.join(katalog, "kopie 'x'");
    fs.mkdirSync(dziwny);
    const sciezka = zrobKopie(baza, dziwny, new Date('2026-10-19T03:00:00Z'));
    expect(sciezka && fs.existsSync(sciezka)).toBe(true);
    baza.zamknij();
  });
});

describe('usuwanie starych kopii', () => {
  const teraz = new Date('2026-10-19T03:00:00Z');

  it('usunStare usuwa tylko stare pliki kopii, a obcych nie rusza', () => {
    const jeden = kopiaSprzed(1, teraz);
    const szesc = kopiaSprzed(6, teraz);
    const osiem = kopiaSprzed(8, teraz);
    const trzydziesci = kopiaSprzed(30, teraz);
    fs.writeFileSync(path.join(katalog, 'notatki.txt'), 'x');
    fs.writeFileSync(path.join(katalog, 'za-murem.db'), 'x');
    fs.writeFileSync(path.join(katalog, 'za-murem-2020-01-01.db.bak'), 'x');
    fs.mkdirSync(path.join(katalog, 'za-murem-2020-01-02.db'));
    const usuniete = usunStare(katalog, 7, teraz);
    expect(usuniete.map((p) => path.basename(p)).sort()).toEqual([osiem, trzydziesci].sort());
    expect(pliki()).toEqual(
      [jeden, szesc, 'notatki.txt', 'za-murem.db', 'za-murem-2020-01-01.db.bak', 'za-murem-2020-01-02.db'].sort(),
    );
  });

  it('zostaje dokładnie `dni` ostatnich dni: kopia sprzed `dni` dni już znika, a niedokończony plik .tmp też', () => {
    const szesc = kopiaSprzed(6, teraz);
    kopiaSprzed(7, teraz);
    kopiaSprzed(9, teraz, '.db.tmp');
    expect(
      usunStare(katalog, 7, teraz)
        .map((p) => path.basename(p))
        .sort(),
    ).toHaveLength(2);
    expect(pliki()).toEqual([szesc]);
  });

  it('nie kasuje niczego przy dni mniejszym od 1 ani z datą z przyszłości, a brak katalogu to pusta lista', () => {
    const dzis = kopiaSprzed(0, teraz);
    const przyszla = kopiaSprzed(-3, teraz);
    expect(usunStare(katalog, 0, teraz)).toEqual([]);
    expect(usunStare(katalog, Number.NaN, teraz)).toEqual([]);
    expect(usunStare(katalog, 7, teraz)).toEqual([]);
    expect(pliki()).toEqual([dzis, przyszla].sort());
    expect(usunStare(path.join(katalog, 'nie ma'), 7, teraz)).toEqual([]);
  });
});

describe('harmonogram kopii', () => {
  it('pierwsza kopia o zadanej godzinie UTC, potem codziennie, ze starymi usuwanymi po ZM_KOPIE_DNI dniach', () => {
    vi.useFakeTimers({ now: new Date('2026-10-19T01:00:00Z') });
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const kopiaDir = path.join(katalog, 'kopie');
    const wpisy: string[] = [];
    // przed godziną 3:00 UTC dzisiejszej kopii jeszcze nie ma i nie ma jej robić od razu
    const plan = planujKopie({ baza, katalog: kopiaDir, dni: 3, godzina: 3, dziennik: (w) => wpisy.push(w) });
    expect(fs.existsSync(kopiaDir) ? fs.readdirSync(kopiaDir) : []).toEqual([]);
    vi.advanceTimersByTime(2 * 3600_000 - 1);
    expect(fs.existsSync(kopiaDir) ? fs.readdirSync(kopiaDir) : []).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db']);
    vi.advanceTimersByTime(DOBA);
    expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db', 'za-murem-2026-10-20.db']);
    vi.advanceTimersByTime(2 * DOBA);
    // po 3 dniach od pierwszej: 19. wypada (wiek 3 >= 3), zostają 20., 21. i 22.
    expect(fs.readdirSync(kopiaDir)).toEqual([
      'za-murem-2026-10-20.db',
      'za-murem-2026-10-21.db',
      'za-murem-2026-10-22.db',
    ]);
    plan.zatrzymaj();
    vi.advanceTimersByTime(3 * DOBA);
    expect(fs.readdirSync(kopiaDir)).toHaveLength(3);
    expect(wpisy).toEqual([]);
    baza.zamknij();
  });

  it('po starcie po godzinie kopii, gdy dzisiejszej jeszcze nie ma, robi ją od razu; gdy jest, czeka do jutra', () => {
    vi.useFakeTimers({ now: new Date('2026-10-19T14:00:00Z') });
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const kopiaDir = path.join(katalog, 'kopie');
    const a = planujKopie({ baza, katalog: kopiaDir, dni: 7, godzina: 3, dziennik: () => {} });
    expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db']);
    // numer i-węzła zmienia się przy podmianie pliku (kopia robiona od nowa), więc to dowód, że plik nietknięty
    const inode = fs.statSync(path.join(kopiaDir, 'za-murem-2026-10-19.db')).ino;
    a.zatrzymaj();
    vi.advanceTimersByTime(1000);
    // drugi start tego samego dnia nie robi drugiej kopii
    const b = planujKopie({ baza, katalog: kopiaDir, dni: 7, godzina: 3, dziennik: () => {} });
    expect(fs.statSync(path.join(kopiaDir, 'za-murem-2026-10-19.db')).ino).toBe(inode);
    b.zatrzymaj();
    baza.zamknij();
  });

  it('wyjątek z funkcji dziennika albo informacji nie wywraca harmonogramu ani startu serwera', () => {
    vi.useFakeTimers({ now: new Date('2026-10-19T14:00:00Z') });
    const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
    const kopiaDir = path.join(katalog, 'kopie');
    const wpisy: string[] = [];
    // info rzuca przy starcie (kopia od razu) i w terminie; dziennik zbiera, co się da
    const plan = planujKopie({
      baza,
      katalog: kopiaDir,
      dni: 7,
      godzina: 3,
      dziennik: (w) => wpisy.push(w),
      info: () => {
        throw new Error('info padło');
      },
    });
    expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db']);
    expect(() => vi.advanceTimersByTime(13 * 3600_000)).not.toThrow();
    expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db', 'za-murem-2026-10-20.db']);
    expect(wpisy.length).toBeGreaterThan(0);
    plan.zatrzymaj();
    baza.zamknij();
  });

  it('godzina jest w UTC niezależnie od strefy procesu, a błąd kopii nie wywraca harmonogramu', () => {
    const staraStrefa = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    try {
      vi.useFakeTimers({ now: new Date('2026-10-19T02:59:00Z') });
      const baza = otworzBaze(path.join(katalog, 'za-murem.db'));
      const kopiaDir = path.join(katalog, 'kopie');
      const wpisy: string[] = [];
      // katalog kopii nie istnieje i nie da się go założyć (pod plikiem): błąd w dzienniku, harmonogram żyje dalej
      const plik = path.join(katalog, 'plik');
      fs.writeFileSync(plik, 'x');
      const zepsuty = planujKopie({
        baza,
        katalog: path.join(plik, 'kopie'),
        dni: 7,
        godzina: 3,
        dziennik: (w) => wpisy.push(w),
      });
      const dobry = planujKopie({ baza, katalog: kopiaDir, dni: 7, godzina: 3, dziennik: () => {} });
      vi.advanceTimersByTime(59_000);
      expect(fs.existsSync(kopiaDir)).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db']);
      expect(wpisy.length).toBeGreaterThan(0);
      vi.advanceTimersByTime(DOBA);
      expect(fs.readdirSync(kopiaDir)).toEqual(['za-murem-2026-10-19.db', 'za-murem-2026-10-20.db']);
      zepsuty.zatrzymaj();
      dobry.zatrzymaj();
      baza.zamknij();
    } finally {
      if (staraStrefa === undefined) delete process.env.TZ;
      else process.env.TZ = staraStrefa;
    }
  });
});

describe('zmienne środowiska kopii', () => {
  it('bez ZM_KOPIE kopie są wyłączone, z nim domyślnie 7 dni i godzina 3 UTC', () => {
    expect(ustawieniaKopii({})).toEqual({ katalog: null, dni: 7, godzina: 3, ostrzezenia: [] });
    expect(ustawieniaKopii({ ZM_KOPIE: '' }).katalog).toBeNull();
    expect(ustawieniaKopii({ ZM_KOPIE: '/dane/kopie' })).toEqual({
      katalog: '/dane/kopie',
      dni: 7,
      godzina: 3,
      ostrzezenia: [],
    });
  });

  it('ZM_KOPIE_DNI i ZM_KOPIA_GODZINA: poprawne wartości przechodzą (także godzina 0), złe dają domyślne i ostrzeżenie', () => {
    const ok = ustawieniaKopii({ ZM_KOPIE: '/k', ZM_KOPIE_DNI: '14', ZM_KOPIA_GODZINA: '0' });
    expect(ok).toMatchObject({ dni: 14, godzina: 0, ostrzezenia: [] });
    expect(ustawieniaKopii({ ZM_KOPIE: '/k', ZM_KOPIA_GODZINA: '23' }).godzina).toBe(23);
    for (const zle of ['24', '-1', '3.5', 'trzy']) {
      const r = ustawieniaKopii({ ZM_KOPIE: '/k', ZM_KOPIA_GODZINA: zle });
      expect(r.godzina, zle).toBe(3);
      expect(r.ostrzezenia.join(' '), zle).toMatch(/ZM_KOPIA_GODZINA/);
    }
    for (const zle of ['0', '-2', '1.5', 'tydzień']) {
      const r = ustawieniaKopii({ ZM_KOPIE: '/k', ZM_KOPIE_DNI: zle });
      expect(r.dni, zle).toBe(7);
      expect(r.ostrzezenia.join(' '), zle).toMatch(/ZM_KOPIE_DNI/);
    }
  });
});
