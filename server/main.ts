/* Start serwera gry: konfiguracja ze zmiennych środowiskowych, serwer HTTP, sprzątanie co minutę (wygasłe sesje i
   limity, a co godzinę klatki drużyn bez gry i konta bez wizyty), zamknięcie po SIGTERM i SIGINT. Uruchomienie:
   node server/main.ts (Node 24, TypeScript bez kompilacji). Opis zmiennych i wdrożenia w server/README.md.

   PORT                 port HTTP (domyślnie 8787)
   HOST                 adres nasłuchu (domyślnie 127.0.0.1; w kontenerze 0.0.0.0)
   ZM_BAZA              ścieżka pliku SQLite (domyślnie ./za-murem.db; ':memory:' na próbę)
   ZM_ZRODLA            dozwolone nagłówki Origin, po przecinku (np. https://zamurem.example); wzór może mieć
                        gwiazdkę za jeden kawałek nazwy hosta (https://zamurem-*-konto.vercel.app: podglądy gałęzi
                        na Vercelu); puste: ten sam Host
   ZM_ZAUFANE_PROXY     1: adres klienta z X-Forwarded-For (tylko za własnym Caddy)
   ZM_PROXY_SEKRET      sekret, który Vercel wysyła w nagłówku x-zm-proxy; żądanie z dobrym sekretem ma adres
                        klienta z nagłówka ZM_PROXY_IP; brak: bez tej ścieżki (tylko w .env na serwerze)
   ZM_PROXY_IP          nagłówek z adresem klienta przy dobrym sekrecie (domyślnie x-real-ip)
   ZM_LICZNIKI_TOKEN    token odczytu GET /api/liczniki (Authorization: Bearer); brak: trasy nie ma (404); tylko w .env
                        na serwerze, nigdy w repo ani w logach
   ZM_KONTAKT           adres kontaktowy (e-mail albo strona) do User-Agent, którym serwer przedstawia się Nominatim
                        przy wyszukiwaniu adresów (polityka Nominatim tego wymaga); brak: User-Agent bez kontaktu
   ZM_CIASTECZKO_SECURE 0: ciasteczko bez Secure (lokalnie po http); domyślnie 1
   ZM_LIMIT_ZAPISU      największy zapis gry w bajtach (domyślnie 3 MiB)
   ZM_LIMIT_KLATEK      najwięcej klatek na konto (domyślnie 60)
   ZM_PROMIEN_M         najdalej od siedziby drużyny w metrach (domyślnie 600)
   ZM_KLATKI_DNI        po ilu dniach bez gry klatki drużyny wracają do wolnych (domyślnie 14)
   ZM_KONTA_DNI         po ilu dniach bez gry konto znika z sesjami, klatkami i zapisem (domyślnie 180)
   ZM_RESTART_H         po tylu godzinach serwer kończy się czysto, a Docker (restart: unless-stopped) podnosi go od
                        nowa na tej samej bazie; brak albo 0: bez restartu planowego (server/restart.ts)
   ZM_KOPIE             katalog codziennych kopii bazy (w kontenerze /dane/kopie); brak: bez kopii (server/kopie.ts)
   ZM_KOPIE_DNI         ile ostatnich dni kopii zostaje (domyślnie 7)
   ZM_KOPIA_GODZINA     godzina UTC, o której robi się kopię (domyślnie 3) */

import { createServer } from 'node:http';
import { KLATKI_DNI, KONTA_DNI } from '../src/net/protokol.ts';
import { stworzSerwer } from './app.ts';
import { planujKopie, ustawieniaKopii } from './kopie.ts';
import { godzinyRestartu, planujRestart, zamknijPlynnie } from './restart.ts';

const env = process.env;
const liczba = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : d;
};

const port = liczba(env.PORT, 8787);
const host = env.HOST || '127.0.0.1';
const sciezka = env.ZM_BAZA || './za-murem.db';

const klatkiDni = liczba(env.ZM_KLATKI_DNI, KLATKI_DNI);
const kontaDni = liczba(env.ZM_KONTA_DNI, KONTA_DNI);

const gra = stworzSerwer({
  baza: sciezka,
  zrodla: (env.ZM_ZRODLA ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  zaufaneProxy: env.ZM_ZAUFANE_PROXY === '1',
  proxySekret: env.ZM_PROXY_SEKRET || undefined,
  proxyNaglowekIp: env.ZM_PROXY_IP || 'x-real-ip',
  tokenLicznikow: env.ZM_LICZNIKI_TOKEN || undefined,
  adres: { kontakt: env.ZM_KONTAKT || undefined },
  bezpieczneCiasteczko: env.ZM_CIASTECZKO_SECURE !== '0',
  limitZapisu: liczba(env.ZM_LIMIT_ZAPISU, 3 * 1024 * 1024),
  limitKlatek: liczba(env.ZM_LIMIT_KLATEK, 60),
  promienM: liczba(env.ZM_PROMIEN_M, 600),
  klatkiDni,
  kontaDni,
});

// keepAliveTimeout dłuższy niż 2 minuty, przez które Caddy trzyma bezczynne połączenie do serwera: inaczej Node
// zamykałby połączenie, które Caddy właśnie bierze na następne żądanie (502); powolnych klientów pilnuje Caddy
const serwer = createServer(
  { requestTimeout: 150_000, headersTimeout: 140_000, keepAliveTimeout: 130_000, maxHeaderSize: 16 * 1024 },
  (req, res) => gra.obsluz(req, res),
);
serwer.listen(port, host, () => {
  console.log(`Za Murem: serwer gry na http://${host}:${port}/api (baza: ${sciezka})`);
  console.log(`Za Murem: wygasanie bez wizyty (dni): klatki ${klatkiDni}, konta ${kontaDni}`);
});

// wygasłe sesje i wpisy limitów (okno żądań na IP trwa minutę); klatki i konta bez wizyty liczy sprzataj() najwyżej
// raz na godzinę
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

// kopie bazy: raz na dobę (VACUUM INTO) na tym samym wolumenie, z przechowywaniem kilku dni
const kopie = ustawieniaKopii(env);
for (const o of kopie.ostrzezenia) console.error(`Za Murem: ${o}`);
if (kopie.katalog) {
  planujKopie({
    baza: gra.baza,
    katalog: kopie.katalog,
    dni: kopie.dni,
    godzina: kopie.godzina,
    dziennik: (w) => console.error(`Za Murem: ${w}`),
    info: (w) => console.log(`Za Murem: ${w}`),
  });
  console.log(
    `Za Murem: kopie bazy codziennie o ${kopie.godzina}:00 UTC do ${kopie.katalog}, zostaje ${kopie.dni} dni`,
  );
}
