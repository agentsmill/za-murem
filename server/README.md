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

## W kontenerze

```bash
docker build -f server/Dockerfile -t za-murem-serwer .
docker volume create za-murem-dane
docker run -d --name za-murem-serwer --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v za-murem-dane:/dane \
  -e ZM_ZRODLA=https://twoja.domena za-murem-serwer
```

Port wystawiamy tylko na `127.0.0.1`: kontener ufa X-Forwarded-For (`ZM_ZAUFANE_PROXY=1`), więc wystawiony na świat pozwoliłby obejść limity prób podrobionym nagłówkiem. Przed serwerem stoi Caddy z HTTPS na tej samej domenie co gra, na przykład:

```
twoja.domena {
  handle /api/* {
    reverse_proxy 127.0.0.1:8787
  }
  handle {
    root * /srv/za-murem/dist
    file_server
  }
}
```

Kopia bazy bez zatrzymywania serwera (SQLite w trybie WAL):

```bash
docker exec za-murem-serwer node -e "new (require('node:sqlite').DatabaseSync)('/dane/za-murem.db').exec(\"VACUUM INTO '/dane/kopia.db'\")"
```

Kopia ma te same dane osobowe co baza (nicki, pozycje zajętych klatek, zapisy gier), więc trzymamy ją tak samo ostrożnie i kasujemy stare.
