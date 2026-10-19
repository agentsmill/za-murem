# Serwer gry Za Murem

Małe API pod `/api` dla gry sieciowej: konta (nick i hasło), sesje, zajęte klatki i zapis gry w chmurze. Gra dalej liczy się w przeglądarce, serwer pilnuje tylko, kto ma którą klatkę. Projekt: `docs/superpowers/specs/2026-10-18-multiplayer-design.md`. Lista adresów API jest w nagłówku `server/app.ts`, typy i kody błędów w `src/net/protokol.ts`.

Node 24 (działa od 22.18) bez zależności z npm: TypeScript uruchamiany wprost, `node:http`, `node:sqlite`, `node:crypto`, `node:zlib`. Gra na GitHub Pages i dema offline działają bez serwera.

## Lokalnie

Z głównego katalogu repozytorium:

```bash
ZM_BAZA=./za-murem.db ZM_CIASTECZKO_SECURE=0 node --disable-warning=ExperimentalWarning server/main.ts
curl http://127.0.0.1:8787/api/zdrowie
```

`ZM_CIASTECZKO_SECURE=0` jest potrzebne tylko przy zwykłym http, kiedy przeglądarka nie przyjmuje ciasteczka z atrybutem Secure. Gra jeszcze nie woła API (to etap 2); klient jest w `src/net/api.ts`. Testy serwera i klienta: `npm test -- serwer api-klient`.

## Zmienne środowiskowe

| zmienna | domyślnie | co robi |
|---|---|---|
| `PORT` | 8787 | port HTTP |
| `HOST` | 127.0.0.1 (w kontenerze 0.0.0.0) | adres nasłuchu |
| `ZM_BAZA` | `./za-murem.db` (w kontenerze `/dane/za-murem.db`) | plik SQLite; `:memory:` na próbę |
| `ZM_ZRODLA` | puste | dozwolone nagłówki Origin po przecinku, np. `https://twoja.domena`; puste: ta sama strona co nagłówek Host |
| `ZM_ZAUFANE_PROXY` | 0 (w kontenerze 1) | 1: adres klienta z ostatniego wpisu X-Forwarded-For; tylko za własnym proxy |
| `ZM_CIASTECZKO_SECURE` | 1 | 0: ciasteczko sesji bez Secure (lokalnie po http) |
| `ZM_LIMIT_ZAPISU` | 3145728 | największy zapis gry w bajtach JSON |
| `ZM_LIMIT_KLATEK` | 60 | najwięcej klatek na konto |
| `ZM_PROMIEN_M` | 600 | najdalej od siedziby drużyny w metrach |
| `ZM_RESTART_H` | brak (w compose 48) | po tylu godzinach serwer kończy się czysto, a Docker podnosi go od nowa; brak albo 0: bez restartu planowego |
| `ZM_KOPIE` | brak (w compose `/dane/kopie`) | katalog codziennych kopii bazy; brak: bez kopii |
| `ZM_KOPIE_DNI` | 7 | ile ostatnich dni kopii zostaje (z dzisiejszą); kopia sprzed tylu dni znika |
| `ZM_KOPIA_GODZINA` | 3 | godzina UTC (0–23), o której robi się kopię; kontener ma UTC, ale godzina nie zależy od strefy procesu |

## W kontenerze

```bash
docker build -f server/Dockerfile -t za-murem-serwer .
docker volume create za-murem-dane
docker run -d --name za-murem-serwer --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v za-murem-dane:/dane \
  -e ZM_ZRODLA=https://twoja.domena -e ZM_RESTART_H=48 -e ZM_KOPIE=/dane/kopie za-murem-serwer
```

Dwie ostatnie zmienne włączają restart co 48 godzin i codzienne kopie bazy (niżej); bez nich serwer działa jak dotąd. W compose z `deploy/hetzner` obie są ustawione, a kontener nazywa się `za-murem-api`.

Port wystawiamy tylko na `127.0.0.1`: kontener ufa X-Forwarded-For (`ZM_ZAUFANE_PROXY=1`), więc wystawiony na świat pozwoliłby obejść limity prób podrobionym nagłówkiem. Przed serwerem stoi Caddy z HTTPS na tej samej domenie co gra, na przykład:

```
twoja.domena {
  handle /api/* {
    request_body {
      max_size 4MB
    }
    reverse_proxy 127.0.0.1:8787
  }
  handle {
    root * /srv/za-murem/dist
    file_server
  }
}
```

Serwer bierze adres klienta z ostatniego wpisu X-Forwarded-For, czyli z tego, który dopisał Caddy (bez `trusted_proxies` Caddy nie przepuszcza tego nagłówka od klienta; warto to sprawdzić na wdrożonej wersji). Bezczynne połączenia Caddy trzyma do serwera 2 minuty, a serwer 130 s, żeby nie zamykał połączenia, które Caddy właśnie bierze na kolejne żądanie. Logi dostępu Caddy z adresami IP lepiej wyłączyć albo trzymać krótko (RODO).

## Restart planowy

Z `ZM_RESTART_H=48` serwer po 48 godzinach od startu sam kończy się czysto (kod 0, w dzienniku „restart planowy po 48 h”), a `restart: unless-stopped` w compose podnosi go od nowa na tej samej bazie. To nie awaria i nic nie kasuje: konta, klatki i zapisy leżą w bazie na wolumenie, więc odświeża się sam proces. Zamknięcie jest to samo co przy wdrożeniu i SIGTERM: serwer przestaje przyjmować nowe połączenia, żądania w toku (zapis w chmurze, logowanie w kolejce scrypt) mają do 5 sekund na dokończenie, potem zamyka bazę i wychodzi. Połączenia keep-alive zamykają się, gdy tylko skończy się ich ostatnie żądanie, więc zamknięcie trwa tyle, co najdłuższe żądanie w toku (najwyżej 5 sekund). Gracz traci połączenie na kilka sekund. Klient nie ponawia przerwanego zapisu od razu: następny zapis w chmurze idzie przy najbliższym zapisie w przeglądarce, najwcześniej minutę po poprzednim. Gdyby serwer zdążył zatwierdzić zapis, a klient nie dostał potwierdzenia, ten następny zapis dostanie 409 (konflikt wersji), a klient wstrzyma zapisy w chmurze do następnego wczytania gry (zapis w przeglądarce zostaje). To rzadki przypadek, bo żądania w toku mają 5 sekund na dokończenie.

Bez nadzorcy procesu (Docker z polityką restartu, systemd z `Restart=always`) restart planowy oznacza po prostu koniec serwera, więc lokalnie przy `node server/main.ts` zmiennej nie ustawiamy. `HEALTHCHECK` z `server/Dockerfile` bez orkiestratora tylko oznacza kontener jako niezdrowy i go nie restartuje: zawieszony serwer złapie dopiero kolejny restart planowy albo ręczny `docker compose restart api`.

## Kopie bazy

Z `ZM_KOPIE=/dane/kopie` serwer robi kopię raz na dobę o `ZM_KOPIA_GODZINA` (domyślnie 3:00 UTC) i od razu po starcie, gdy ta godzina dzisiaj już minęła, a dzisiejszej kopii jeszcze nie ma (restarty co 48 godzin i wdrożenia mogą się zdarzyć o tej porze). Kopia to `VACUUM INTO` na działającej bazie: spójny obraz z tej chwili razem z tym, co leży jeszcze w pliku WAL, bez zatrzymywania serwera i bez blokowania cudzych zapisów (na czas kopii proces serwera stoi, zwykle ułamek sekundy). Plik `za-murem-RRRR-MM-DD.db` (data w UTC) powstaje jako `.tmp`, jest sprawdzany (`quick_check`, wersja schematu) i dopiero potem podmienia kopię z tego dnia, więc w katalogu nie ma połowicznej kopii pod nazwą kopii. Plik ma prawa 0600 od chwili utworzenia, a katalog założony przez serwer 0700 (istniejącego katalogu, na przykład wolumenu, serwer nie rusza). Kopie starsze niż `ZM_KOPIE_DNI` dni znikają po każdej udanej nowej (zostaje dokładnie tyle dni, ile w zmiennej, razem z dzisiejszym), a pliki o innych nazwach nigdy nie są ruszane. Błąd kopii (brak katalogu, pełny dysk) idzie do dziennika, serwer działa dalej, a stare kopie zostają.

Czego kopie nie dają: leżą na tym samym wolumenie co baza, więc chronią przed pomyłką (usunięte konto, zły zapis, zepsuty schemat po wdrożeniu), a nie przed utratą dysku albo maszyny. Kopia poza maszyną (miejsce, dostęp, koszt) to osobna decyzja. Kopie mają te same dane osobowe co baza (nicki, pozycje zajętych klatek, zapisy gier), więc trzymamy je tak samo ostrożnie. Konto usunięte w grze znika z kopii dopiero po `ZM_KOPIE_DNI` dniach; ten czas trzeba wpisać do informacji o danych osobowych.

Dodatkowa kopia ręczna bez zatrzymywania serwera (pod inną nazwą, żeby nie wpadła w czyszczenie; w compose kontener to `za-murem-api`):

```bash
docker exec za-murem-serwer node -e "new (require('node:sqlite').DatabaseSync)('/dane/za-murem.db').exec(\"VACUUM INTO '/dane/reczna.db'\")"
```

### Przywracanie z kopii

Serwer stoi na czas przywracania. Pliki `-wal` i `-shm` starej bazy trzeba usunąć razem z plikiem bazy: inaczej SQLite nałożyłby stary dziennik na przywrócony plik. Kolejność jest bezpieczna na literówkę: najpierw sprawdzamy, że wybrana kopia istnieje, i kopiujemy ją obok jako `za-murem.db.nowa`, dopiero potem odkładamy starą bazę i podmieniamy plik. Zła nazwa kopii zatrzymuje skrypt, zanim cokolwiek ruszy, więc `/dane` nigdy nie zostaje bez bazy (a `docker compose start api` bez bazy założyłby pustą). Na serwerze z compose (`/srv/za-murem`):

```bash
cd /srv/za-murem
docker compose stop api
docker compose run --rm --no-deps --entrypoint sh api -c 'ls -l /dane /dane/kopie'      # wybierz kopię
docker compose run --rm --no-deps --entrypoint sh api -c '
  set -e
  cd /dane
  KOPIA=kopie/za-murem-2026-10-18.db     # nazwa wybranej kopii
  [ -f "$KOPIA" ]                         # literówka zatrzymuje skrypt tutaj, nic jeszcze nie ruszone
  cp "$KOPIA" za-murem.db.nowa            # kopia obok, stara baza dalej na miejscu
  mkdir -p przed-przywroceniem
  for f in za-murem.db za-murem.db-wal za-murem.db-shm; do
    if [ -e "$f" ]; then mv "$f" przed-przywroceniem/; fi
  done
  mv za-murem.db.nowa za-murem.db
'
docker compose start api
curl -s https://<adres gry>/api/zdrowie
```

Przy kontenerze z `docker run` te same polecenia idą przez `docker run --rm -v za-murem-dane:/dane --entrypoint sh za-murem-serwer -c '…'` po `docker stop za-murem-serwer`. Lokalnie to samo: zatrzymać `node server/main.ts`, przenieść `za-murem.db`, `za-murem.db-wal` i `za-murem.db-shm` w bezpieczne miejsce, skopiować wybraną kopię jako `za-murem.db`, uruchomić serwer. Po sprawdzeniu, że konta działają, katalog `przed-przywroceniem` można skasować (to też dane osobowe). Test w `tests/unit/serwer-kopie.test.ts` otwiera kopię serwerem jak zwykłą bazę i widzi te same konta.
