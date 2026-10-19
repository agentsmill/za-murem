/* Start serwera gry: konfiguracja ze zmiennych środowiskowych, serwer HTTP, sprzątanie co godzinę, zamknięcie
   po SIGTERM i SIGINT. Uruchomienie: node server/main.ts (Node 24, TypeScript bez kompilacji). Opis zmiennych
   i wdrożenia w server/README.md.

   PORT                 port HTTP (domyślnie 8787)
   HOST                 adres nasłuchu (domyślnie 127.0.0.1; w kontenerze 0.0.0.0)
   ZM_BAZA              ścieżka pliku SQLite (domyślnie ./za-murem.db; ':memory:' na próbę)
   ZM_ZRODLA            dozwolone nagłówki Origin, po przecinku (np. https://zamurem.example); puste: ten sam Host
   ZM_ZAUFANE_PROXY     1: adres klienta z X-Forwarded-For (tylko za własnym Caddy)
   ZM_CIASTECZKO_SECURE 0: ciasteczko bez Secure (lokalnie po http); domyślnie 1
   ZM_LIMIT_ZAPISU      największy zapis gry w bajtach (domyślnie 3 MiB)
   ZM_LIMIT_KLATEK      najwięcej klatek na konto (domyślnie 60)
   ZM_PROMIEN_M         najdalej od siedziby drużyny w metrach (domyślnie 600)
   ZM_RESTART_H         po tylu godzinach serwer kończy się czysto, a Docker (restart: unless-stopped) podnosi go od
                        nowa na tej samej bazie; brak albo 0: bez restartu planowego (server/restart.ts) */

import { createServer } from 'node:http';
import { stworzSerwer } from './app.ts';
import { godzinyRestartu, planujRestart, zamknijPlynnie } from './restart.ts';

const env = process.env;
const liczba = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : d;
};

const port = liczba(env.PORT, 8787);
const host = env.HOST || '127.0.0.1';
const sciezka = env.ZM_BAZA || './za-murem.db';

const gra = stworzSerwer({
  baza: sciezka,
  zrodla: (env.ZM_ZRODLA ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  zaufaneProxy: env.ZM_ZAUFANE_PROXY === '1',
  bezpieczneCiasteczko: env.ZM_CIASTECZKO_SECURE !== '0',
  limitZapisu: liczba(env.ZM_LIMIT_ZAPISU, 3 * 1024 * 1024),
  limitKlatek: liczba(env.ZM_LIMIT_KLATEK, 60),
  promienM: liczba(env.ZM_PROMIEN_M, 600),
});

// keepAliveTimeout dłuższy niż 2 minuty, przez które Caddy trzyma bezczynne połączenie do serwera: inaczej Node
// zamykałby połączenie, które Caddy właśnie bierze na następne żądanie (502); powolnych klientów pilnuje Caddy
const serwer = createServer(
  { requestTimeout: 150_000, headersTimeout: 140_000, keepAliveTimeout: 130_000, maxHeaderSize: 16 * 1024 },
  (req, res) => gra.obsluz(req, res),
);
serwer.listen(port, host, () => {
  console.log(`Za Murem: serwer gry na http://${host}:${port}/api (baza: ${sciezka})`);
});

// wygasłe sesje i wpisy limitów (okno żądań na IP trwa minutę)
const sprzatanie = setInterval(() => gra.sprzataj(), 60 * 1000);
sprzatanie.unref();

let konczy = false;
const zakoncz = (powod: string) => {
  if (konczy) return;
  konczy = true;
  console.log(`Za Murem: ${powod}, zamykam serwer.`);
  clearInterval(sprzatanie);
  // żądania w toku mają kilka sekund, połączenia keep-alive nie blokują zamknięcia (server/restart.ts)
  zamknijPlynnie(serwer, gra, (kod) => process.exit(kod));
};
process.on('SIGTERM', () => zakoncz('SIGTERM'));
process.on('SIGINT', () => zakoncz('SIGINT'));

// restart planowy: odświeża proces, nic nie kasuje (baza zostaje, Docker podnosi serwer od nowa)
const restart = godzinyRestartu(env.ZM_RESTART_H);
if (restart.ostrzezenie) console.error(`Za Murem: ${restart.ostrzezenie}`);
if (restart.godziny !== null && planujRestart(restart.godziny, zakoncz))
  console.log(`Za Murem: restart planowy za ${restart.godziny} h`);
