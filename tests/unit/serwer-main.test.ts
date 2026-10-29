import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Dymny test spięcia server/main.ts: prawdziwy proces serwera ze zmiennymi środowiska (ZM_RESTART_H, ZM_KOPIE, …), bo
   main.ts to skrypt, którego nie da się zaimportować, a reszta modułów ma własne testy. Sprawdza to, czego one nie
   widzą: że zmienne dochodzą do restart.ts i kopie.ts, że bez nich serwer działa jak dotąd i że złe wartości dają
   ostrzeżenie zamiast cichej zmiany zachowania. */

const KORZEN = path.resolve(import.meta.dirname, '../..');
let katalog = '';
const dzieci: ChildProcess[] = [];
beforeEach(() => {
  katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-main-'));
});
afterEach(() => {
  for (const d of dzieci.splice(0)) d.kill('SIGKILL');
  fs.rmSync(katalog, { recursive: true, force: true });
});

async function wolnyPort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  const port = (s.address() as AddressInfo).port;
  await new Promise((ok) => s.close(ok));
  return port;
}

async function uruchom(env: Record<string, string>) {
  const port = await wolnyPort();
  const dziecko = spawn(process.execPath, [path.join(KORZEN, 'server/main.ts')], {
    env: {
      PATH: process.env.PATH ?? '',
      PORT: String(port),
      HOST: '127.0.0.1',
      ZM_BAZA: path.join(katalog, 'za-murem.db'),
      ZM_CIASTECZKO_SECURE: '0',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  dzieci.push(dziecko);
  let stdout = '';
  let stderr = '';
  dziecko.stdout?.on('data', (d) => {
    stdout += d;
  });
  dziecko.stderr?.on('data', (d) => {
    stderr += d;
  });
  const wyszedl = new Promise<number | null>((ok) => dziecko.on('exit', (kod) => ok(kod)));
  await vi.waitFor(() => expect(stdout).toContain('serwer gry na'), { timeout: 15_000, interval: 20 });
  return { dziecko, port, wyszedl, stdout: () => stdout, stderr: () => stderr };
}

describe('server/main.ts jako proces', () => {
  it('bez nowych zmiennych działa jak dotąd: odpowiada, nie planuje restartu ani kopii, SIGTERM kończy kodem 0', async () => {
    const s = await uruchom({});
    expect((await fetch(`http://127.0.0.1:${s.port}/api/zdrowie`)).status).toBe(200);
    // bez ZM_LICZNIKI_TOKEN trasy odczytu liczników nie ma, nawet z nagłówkiem
    const bezTokenu = await fetch(`http://127.0.0.1:${s.port}/api/liczniki`, {
      headers: { Authorization: 'Bearer x' },
    });
    expect(bezTokenu.status).toBe(404);
    expect(s.stdout()).not.toContain('restart planowy');
    expect(s.stdout()).not.toContain('kopie bazy');
    expect(s.stderr()).not.toContain('ZM_');
    s.dziecko.kill('SIGTERM');
    expect(await s.wyszedl).toBe(0);
    expect(s.stdout()).toContain('SIGTERM, zamykam serwer');
  }, 30_000);

  it('ZM_KLATKI_DNI i ZM_KONTA_DNI dochodzą do serwera, a bez nich albo ze złą wartością obowiązuje 14 i 180', async () => {
    const domyslne = await uruchom({});
    expect(domyslne.stdout()).toContain('wygasanie bez wizyty (dni): klatki 14, konta 180');
    domyslne.dziecko.kill('SIGTERM');
    expect(await domyslne.wyszedl).toBe(0);

    const s = await uruchom({ ZM_KLATKI_DNI: '3', ZM_KONTA_DNI: 'abc' });
    expect(s.stdout()).toContain('wygasanie bez wizyty (dni): klatki 3, konta 180');
    s.dziecko.kill('SIGTERM');
    expect(await s.wyszedl).toBe(0);
  }, 30_000);

  it('ZM_RESTART_H i ZM_KOPIE: pierwsza kopia przy starcie (plik 0600 w katalogu 0700, spójna baza), potem restart planowy kodem 0', async () => {
    const kopie = path.join(katalog, 'kopie');
    // godzina 0: kopia "dzisiejsza" jest już po terminie, więc powstaje od razu przy starcie, niezależnie od pory dnia
    const s = await uruchom({ ZM_RESTART_H: '0.0005', ZM_KOPIE: kopie, ZM_KOPIA_GODZINA: '0', ZM_KOPIE_DNI: '3' });
    expect(s.stdout()).toContain('restart planowy za 0.0005 h');
    expect(s.stdout()).toContain('kopie bazy codziennie o 0:00 UTC');
    expect(s.stdout()).toContain('zostaje 3 dni');
    await vi.waitFor(() => expect(fs.readdirSync(kopie)).toHaveLength(1), { timeout: 10_000, interval: 20 });
    const [plik] = fs.readdirSync(kopie);
    expect(plik).toMatch(/^za-murem-\d{4}-\d{2}-\d{2}\.db$/);
    expect(fs.statSync(path.join(kopie, plik)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(kopie).mode & 0o777).toBe(0o700);
    const baza = new DatabaseSync(path.join(kopie, plik), { readOnly: true });
    expect(baza.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    baza.close();
    // 0,0005 h to 1,8 s: proces kończy się sam, czysto
    expect(await s.wyszedl).toBe(0);
    expect(s.stdout()).toContain('restart planowy po 0.0005 h, zamykam serwer');
  }, 30_000);

  it('ZM_LICZNIKI_TOKEN dochodzi do serwera: odczyt liczników tylko z tokenem, a token nie ląduje w dzienniku', async () => {
    const token = 'token-z-testu-main-0123456789abcdef';
    const s = await uruchom({ ZM_LICZNIKI_TOKEN: token });
    const adres = `http://127.0.0.1:${s.port}/api`;
    expect((await fetch(`${adres}/liczniki`)).status).toBe(401);
    const post = await fetch(`${adres}/zdarzenie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ z: 'dzien:2' }),
    });
    expect(post.status).toBe(204);
    const odczyt = await fetch(`${adres}/liczniki`, { headers: { Authorization: `Bearer ${token}` } });
    expect(odczyt.status).toBe(200);
    expect(((await odczyt.json()) as { liczniki: { zdarzenie: string; n: number }[] }).liczniki).toMatchObject([
      { zdarzenie: 'dzien:2', n: 1 },
    ]);
    s.dziecko.kill('SIGTERM');
    expect(await s.wyszedl).toBe(0);
    expect(s.stdout() + s.stderr()).not.toContain(token);
  }, 30_000);

  it('złe wartości zmiennych dają ostrzeżenie w dzienniku, a serwer startuje z domyślnymi', async () => {
    const s = await uruchom({
      ZM_RESTART_H: 'abc',
      ZM_KOPIE: path.join(katalog, 'kopie'),
      ZM_KOPIE_DNI: 'zero',
      ZM_KOPIA_GODZINA: '99',
    });
    expect((await fetch(`http://127.0.0.1:${s.port}/api/zdrowie`)).status).toBe(200);
    expect(s.stderr()).toContain('ZM_RESTART_H');
    expect(s.stderr()).toContain('ZM_KOPIE_DNI');
    expect(s.stderr()).toContain('ZM_KOPIA_GODZINA');
    expect(s.stdout()).not.toContain('restart planowy za');
    expect(s.stdout()).toContain('zostaje 7 dni');
    s.dziecko.kill('SIGTERM');
    expect(await s.wyszedl).toBe(0);
  }, 30_000);
});
