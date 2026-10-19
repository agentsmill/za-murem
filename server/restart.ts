/* Planowany restart serwera gry (MMO, etap 0: docs/superpowers/specs/2026-10-19-mmo-design.md, „Serwer świata”) i
   czyste zamknięcie, którym kończy się on, SIGTERM i SIGINT. Restart co ZM_RESTART_H godzin to nie awaria: serwer
   kończy się czysto (kod 0), a Docker z `restart: unless-stopped` podnosi go od nowa na tej samej bazie, więc odświeża się
   proces, a nic z kont, klatek i zapisów nie ginie. Bez nadzorcy procesu (Docker, systemd) restart planowy oznacza po
   prostu koniec serwera. Moduł nie czyta środowiska ani nie woła process.exit: zegar, wyjście i serwer HTTP podaje
   server/main.ts (w testach: tests/unit/serwer-restart.test.ts). */

import type { Server } from 'node:http';

const GODZINA_MS = 3_600_000;
/** setTimeout przyjmuje najwyżej 2^31−1 ms (około 24,8 doby); dłuższy czas to łańcuch krótszych timerów */
const MAKS_TIMER_MS = 2 ** 31 - 1;

/** Planuje wołanie `zakoncz('restart planowy po N h')` za `godziny` godzin; null, gdy to nie liczba większa od 0.
    Timer nie trzyma procesu przy życiu (unref), a `anuluj` go wyłącza. */
export function planujRestart(godziny: number, zakoncz: (powod: string) => void): { anuluj(): void } | null {
  if (!Number.isFinite(godziny) || godziny <= 0) return null;
  const powod = `restart planowy po ${godziny} h`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const czekaj = (ms: number) => {
    const teraz = Math.min(ms, MAKS_TIMER_MS);
    timer = setTimeout(() => (ms > teraz ? czekaj(ms - teraz) : zakoncz(powod)), teraz);
    timer.unref();
  };
  czekaj(godziny * GODZINA_MS);
  return { anuluj: () => clearTimeout(timer) };
}

/** ZM_RESTART_H: brak, pusta wartość i 0 wyłączają restart; liczba większa od 0 to godziny; resztę (tekst, liczba
    ujemna) serwer ignoruje z ostrzeżeniem, żeby literówka w konfiguracji nie wyłączyła go po cichu */
export function godzinyRestartu(wartosc: string | undefined): { godziny: number | null; ostrzezenie?: string } {
  if (wartosc === undefined || wartosc.trim() === '') return { godziny: null };
  const n = Number(wartosc);
  if (n === 0) return { godziny: null };
  if (Number.isFinite(n) && n > 0) return { godziny: n };
  return {
    godziny: null,
    ostrzezenie: `ZM_RESTART_H=„${wartosc}” to nie liczba godzin większa od 0, restart planowy wyłączony`,
  };
}

/** Czyste zamknięcie: serwer HTTP przestaje przyjmować połączenia, żądania w toku (zapis w chmurze, logowanie w kolejce
    scrypt) mają czas się skończyć, potem baza się zamyka i wołamy `wyjdz(0)`. Połączenia keep-alive i żądania, które
    nie skończą się w `limitMs` (domyślnie 5 s), nie blokują zamknięcia: po limicie baza zamyka się i proces wychodzi.
    Przerwane żądanie nie uszkadza bazy (WAL, każdy zapis w transakcji); klient dostaje zerwane połączenie i ponawia. */
export function zamknijPlynnie(
  serwer: Server,
  gra: { zamknij(): void },
  wyjdz: (kod: number) => void,
  limitMs = 5000,
): void {
  let wyszedl = false;
  const wyjdzRaz = () => {
    if (wyszedl) return;
    wyszedl = true;
    gra.zamknij();
    wyjdz(0);
  };
  serwer.close(wyjdzRaz);
  setTimeout(wyjdzRaz, limitMs).unref();
  serwer.closeIdleConnections();
}
