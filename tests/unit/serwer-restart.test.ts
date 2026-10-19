import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type OpcjeSerwera, stworzSerwer } from '../../server/app.ts';
import { godzinyRestartu, planujRestart, zamknijPlynnie } from '../../server/restart.ts';
import { przegladarka } from './serwer-pomoc.ts';

describe('planowany restart serwera', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('planujRestart woła zakoncz po zadanej liczbie godzin i nie wcześniej', () => {
    vi.useFakeTimers();
    const zakoncz = vi.fn();
    planujRestart(48, zakoncz);
    vi.advanceTimersByTime(48 * 3600_000 - 1);
    expect(zakoncz).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(zakoncz).toHaveBeenCalledWith('restart planowy po 48 h');
    expect(zakoncz).toHaveBeenCalledTimes(1);
  });

  it('bez godzin restartu nie ma', () => {
    expect(planujRestart(0, vi.fn())).toBeNull();
    expect(planujRestart(Number.NaN, vi.fn())).toBeNull();
    expect(planujRestart(-5, vi.fn())).toBeNull();
    expect(planujRestart(Number.POSITIVE_INFINITY, vi.fn())).toBeNull();
  });

  it('czas dłuższy niż limit setTimeout (24,8 doby) nie odpala restartu od razu', () => {
    vi.useFakeTimers();
    const zakoncz = vi.fn();
    const godziny = 30 * 24;
    planujRestart(godziny, zakoncz);
    vi.advanceTimersByTime(25 * 24 * 3600_000);
    expect(zakoncz).not.toHaveBeenCalled();
    vi.advanceTimersByTime(godziny * 3600_000 - 25 * 24 * 3600_000 - 1);
    expect(zakoncz).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(zakoncz).toHaveBeenCalledWith('restart planowy po 720 h');
  });

  it('anuluj wyłącza restart', () => {
    vi.useFakeTimers();
    const zakoncz = vi.fn();
    planujRestart(1, zakoncz)?.anuluj();
    vi.advanceTimersByTime(2 * 3600_000);
    expect(zakoncz).not.toHaveBeenCalled();
  });

  it('timer nie trzyma procesu przy życiu (unref): proces z restartem za godzinę kończy się od razu', () => {
    const t0 = Date.now();
    execFileSync(
      process.execPath,
      ['-e', "import('./server/restart.ts').then((m) => { m.planujRestart(1, () => {}); })"],
      { timeout: 20_000, cwd: path.resolve(import.meta.dirname, '../..') },
    );
    expect(Date.now() - t0).toBeLessThan(20_000);
  });

  it('ZM_RESTART_H: brak, pusta wartość i 0 wyłączają restart, liczba dodatnia go włącza, śmieci dają ostrzeżenie', () => {
    expect(godzinyRestartu(undefined)).toEqual({ godziny: null });
    expect(godzinyRestartu('')).toEqual({ godziny: null });
    expect(godzinyRestartu('0')).toEqual({ godziny: null });
    expect(godzinyRestartu('48')).toEqual({ godziny: 48 });
    expect(godzinyRestartu('0.5')).toEqual({ godziny: 0.5 });
    expect(godzinyRestartu('abc').godziny).toBeNull();
    expect(godzinyRestartu('abc').ostrzezenie).toMatch(/ZM_RESTART_H/);
    expect(godzinyRestartu('-3').ostrzezenie).toMatch(/ZM_RESTART_H/);
  });
});

describe('zamknięcie serwera przy planowym restarcie', () => {
  let katalog = '';
  const otwarte: { srv: http.Server; zamknij: () => void }[] = [];
  beforeEach(() => {
    katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-restart-'));
  });
  afterEach(() => {
    for (const o of otwarte.splice(0)) o.zamknij();
    fs.rmSync(katalog, { recursive: true, force: true });
  });

  /** serwer HTTP z serwerem gry na pliku bazy, jak w server/main.ts */
  async function start(plik: string, op: Partial<OpcjeSerwera> = {}) {
    const gra = stworzSerwer({ baza: plik, hasla: { logN: 10, r: 8, p: 1 }, dziennik: () => {}, ...op });
    const srv = http.createServer((req, res) => gra.obsluz(req, res));
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    otwarte.push({
      srv,
      zamknij: () => {
        srv.closeAllConnections();
        srv.close();
        gra.zamknij();
      },
    });
    return { gra, srv, adres: `http://127.0.0.1:${(srv.address() as AddressInfo).port}` };
  }
  const DANE = { nick: 'Mateusz_test', haslo: 'bardzo-tajne-1' };

  it('żądanie w toku (zapis w chmurze) kończy się 200, a nowy serwer na tym samym pliku widzi konto i zapis', async () => {
    const plik = path.join(katalog, 'za-murem.db');
    const a = await start(plik);
    const p = przegladarka(a.adres);
    expect((await p.zadanie('POST', '/api/konto', DANE)).status).toBe(201);

    const kody: number[] = [];
    const zamkniete = new Promise<void>((ok) => {
      a.srv.on('request', (req) => {
        // zamknięcie w chwili, gdy zapis jest już w toku: serwer ma jeszcze przeczytać ciało, spakować i zapisać
        if (req.method === 'PUT')
          zamknijPlynnie(
            a.srv,
            a.gra,
            (kod) => {
              kody.push(kod);
              ok();
            },
            5000,
          );
      });
    });
    const dane = { v: 1, data: { name: 'Przymorze', notatki: 'abc '.repeat(100_000) } };
    const odpowiedz = await p.zadanie('PUT', '/api/zapis', { dane, wersja: 0 });
    expect(odpowiedz.status).toBe(200);
    await zamkniete;
    expect(kody).toEqual([0]);

    // nowy proces na tym samym pliku
    const b = await start(plik);
    const p2 = przegladarka(b.adres);
    expect((await p2.zadanie('POST', '/api/sesja', DANE)).status).toBe(200);
    const zapis = await p2.zadanie('GET', '/api/zapis');
    expect(zapis.status).toBe(200);
    expect(zapis.body.wersja).toBe(1);
    expect(zapis.body.dane).toEqual(dane);
  });

  it('po końcu żądania w toku zamyka połączenie keep-alive od razu, a nie dopiero po limicie czasu', async () => {
    // serwer, który odpowiada po 100 ms, i klient trzymający połączenie keep-alive po odpowiedzi
    const srv = http.createServer((_req, res) => {
      setTimeout(() => res.end('ok'), 100);
    });
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    const agent = new http.Agent({ keepAlive: true });
    try {
      const port = (srv.address() as AddressInfo).port;
      const status = new Promise<number>((ok, blad) => {
        http
          .get({ host: '127.0.0.1', port, agent }, (res) => {
            res.resume();
            res.on('end', () => ok(res.statusCode ?? 0));
          })
          .on('error', blad);
      });
      await new Promise((ok) => setTimeout(ok, 30)); // żądanie jest już u serwera
      const t0 = Date.now();
      const wyjscia: number[] = [];
      const gra = { zamknij: vi.fn() };
      const wyszedl = new Promise<void>((ok) =>
        zamknijPlynnie(
          srv,
          gra,
          (kod) => {
            wyjscia.push(kod);
            ok();
          },
          8000,
        ),
      );
      expect(await status).toBe(200);
      await wyszedl;
      // limit to 8 s; bez zamykania bezczynnych połączeń serwer czekałby na koniec keep-alive klienta
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(wyjscia).toEqual([0]);
      expect(gra.zamknij).toHaveBeenCalledTimes(1);
    } finally {
      agent.destroy();
      srv.closeAllConnections();
    }
  }, 15_000);

  it('wyjście woła się dokładnie raz, także gdy po zamknięciu serwera mija jeszcze limit czasu', async () => {
    const a = await start(path.join(katalog, 'za-murem.db'));
    const kody: number[] = [];
    zamknijPlynnie(a.srv, a.gra, (kod) => kody.push(kod), 20);
    await new Promise((ok) => setTimeout(ok, 120));
    expect(kody).toEqual([0]);
  });

  it('zamknięcie przy pełnej kolejce scrypt: najpierw nadmiarowe logowania dostają 503, potem wyjście kodem 0 mimo liczących się haseł, baza spójna, konto jest', async () => {
    const plik = path.join(katalog, 'za-murem.db');
    // jedno liczenie scrypt naraz i jedno miejsce w kolejce; koszt taki, żeby liczenie trwało dłużej niż odrzucenie z 503
    const a = await start(plik, { hasla: { logN: 15, r: 8, p: 1 }, scrypt: { naraz: 1, czeka: 1 } });
    expect((await przegladarka(a.adres).zadanie('POST', '/api/konto', DANE)).status).toBe(201);

    const statusy: number[] = [];
    const logowania = Array.from({ length: 6 }, () =>
      przegladarka(a.adres)
        .zadanie('POST', '/api/sesja', DANE)
        .then((r) => r.status)
        .catch(() => 0)
        .then((status) => {
          statusy.push(status);
          return status;
        }),
    );
    // odrzucenie z 503 wraca od razu, a liczenie hasła trwa: kolejka jest pełna, zanim zaczniemy zamykać
    await vi.waitFor(() => expect(statusy).toContain(503), { timeout: 10_000, interval: 5 });
    const przedZamknieciem = [...statusy];

    const kody: number[] = [];
    await new Promise<void>((ok) =>
      zamknijPlynnie(
        a.srv,
        a.gra,
        (kod) => {
          kody.push(kod);
          ok();
        },
        5,
      ),
    );
    const koncowe = await Promise.all(logowania);
    expect(kody).toEqual([0]);
    expect(przedZamknieciem).toContain(503);
    // reszta to liczone logowania (200) albo zerwane przez zamknięcie (0), ale nic innego niż 503 i 500 z zamkniętej bazy
    expect(
      koncowe.every((s) => [200, 0, 503, 500].includes(s)),
      `statusy: ${koncowe.join(', ')}`,
    ).toBe(true);

    const b = await start(plik);
    expect(b.gra.baza.db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect((await przegladarka(b.adres).zadanie('POST', '/api/sesja', DANE)).status).toBe(200);
  });
});
