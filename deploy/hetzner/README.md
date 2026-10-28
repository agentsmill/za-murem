# Wdrożenie na Hetznera

Gra (pliki z `dist/`) i serwer gry sieciowej (`server/`, kontenery `api` i `api-prod`) w Dockerze, w katalogu `/srv/za-murem` na serwerze. Skrypt `deploy/hetzner/wdroz.sh` buduje grę, kopiuje pliki i źródła serwera, odświeża w `.env` adres strony, IP i sieć (sekretów w `.env` nie rusza) i podnosi kontenery.

Docelowo grę serwuje Vercel (`zamurem.vercel.app`, plik `vercel.json` w korzeniu repozytorium), a Hetzner trzyma serwery API, do których Vercel przekazuje `/api/*` (niżej, „Vercel i dwa serwery API”). Kontener `za-murem-www` z kopią gry dalej stoi pod adresem testowym.

## Obok innej aplikacji (dziś: cergo-rw-prod)

Od 18.10.2026 gra stoi na `cergo-rw-prod` (kontekst `cergo-rw` w `hcloud`) obok produkcyjnego stosu cergo, pod https://za-murem.5-75-147-27.sslip.io/. Porty 80 i 443 trzyma Caddy cergo, więc gra nie ma własnego: kontenery `za-murem-www` (pliki gry, http w sieci Dockera) i `za-murem-api` stoją w sieci `cergo_default`, a Caddy cergo przekazuje do nich ruch dla adresu gry.

```bash
ZM_IP=$(hcloud --context cergo-rw server ip cergo-rw-prod) ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh
```

Jednorazowo, na końcu `/opt/cergo/Caddyfile` (plik montowany pojedynczo, więc dopisywać w miejscu, na przykład `cat >>`), potem sprawdzenie i przeładowanie bez restartu:

```
za-murem.5-75-147-27.sslip.io {
	handle /api/* {
		request_body {
			max_size 4MB
		}
		reverse_proxy za-murem-api:8787
	}
	handle {
		reverse_proxy za-murem-www:80
	}
}
```

```bash
docker exec cergo-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec cergo-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Cofnięcie: kopia sprzed zmiany to `/opt/cergo/Caddyfile.przed-za-murem-2026-10-18` (przepisać ją w miejscu, na przykład `cat kopia > /opt/cergo/Caddyfile`, i przeładować), potem `cd /srv/za-murem && docker compose down`.

Jeśli cergo kiedyś przebuduje swój stos tak, że zmieni się nazwa sieci, kontenery gry trzeba podłączyć do nowej (`ZM_SIEC`) i wdrożyć ponownie.

## Vercel i dwa serwery API

Gra na Vercelu woła `/api/*` na własnym adresie, a `vercel.json` przekazuje to dalej na serwer API z Hetznera i dokłada sekret w nagłówku `x-zm-proxy`. Po sekrecie serwer wie, że żądanie przyszło z naszego projektu na Vercelu, i dopiero wtedy bierze adres gracza z nagłówka `x-real-ip` (bez tego limity liczyłyby wszystkich graczy jako jeden adres Vercela). Serwery są dwa, żeby podglądy gałęzi nie dotykały bazy produkcji:

| | serwer testowy | serwer produkcji |
|---|---|---|
| usługa i kontener | `api`, `za-murem-api` | `api-prod`, `za-murem-api-prod` |
| baza | wolumen `dane` | osobny wolumen `dane_prod` |
| adres | `za-murem.5-75-147-27.sslip.io/api/` (ten sam blok Caddy co gra) | `za-murem-api.5-75-147-27.sslip.io/api/` (osobny blok, niżej) |
| kto go woła | podglądy gałęzi na Vercelu (Preview) i adres testowy | produkcja na Vercelu (`zamurem.vercel.app`) |
| `ZM_ZRODLA` | adres testowy i wzór podglądów projektu | tylko `https://zamurem.vercel.app` |
| sekret proxy | `ZM_PROXY_SEKRET_TEST` | `ZM_PROXY_SEKRET_PROD` |
| token liczników | brak (`/api/liczniki` odpowiada 404) | `ZM_LICZNIKI_TOKEN` |

### `.env` na serwerze

Plik `/srv/za-murem/.env` (prawa 0600, tylko root) ma cztery wpisy z sekretami obok trzech, które odświeża `wdroz.sh` (`SITE`, `IP`, `ZM_SIEC`). Sekrety nigdy nie trafiają do repozytorium, do logów ani do czatu; w repozytorium są tylko miejsca na wartości.

```
ZM_PROXY_SEKRET_TEST=<sekret testu>
ZM_PROXY_SEKRET_PROD=<sekret produkcji>
ZM_LICZNIKI_TOKEN=<token liczników>
ZM_KONTAKT=<e-mail albo strona z formularzem>
```

- Sekrety i token generujemy poleceniem `openssl rand -hex 32`, każdy osobno (dwa sekrety proxy muszą się różnić). Te same wartości wpisujemy w zmiennych projektu na Vercelu (niżej), tam jako zmienne wrażliwe (Sensitive).
- `ZM_KONTAKT` musi być ustawiony na produkcji: polityka użycia Nominatim wymaga w User-Agent prawdziwego kontaktu, a serwer przedstawia się nim przy wyszukiwaniu adresów. Wartość (e-mail albo strona z formularzem) podaje Mateusz; bez niej Nominatim ma prawo zablokować serwer przy większym ruchu.
- Wpisy dopisujemy w edytorze na serwerze (`nano /srv/za-murem/.env`), nie w poleceniu z wartością, żeby sekret nie został w historii powłoki.
- `wdroz.sh` w trybie „obok” staje przed kopiowaniem plików, jeśli któregoś z czterech wpisów brakuje albo jest pusty: serwery wstałyby bez sekretu proxy (limity liczyłyby adresy Vercela zamiast graczy), bez tokenu liczników albo bez kontaktu dla Nominatim. Dlatego `.env` trzeba uzupełnić przed pierwszym wdrożeniem po tej zmianie.
- Docker Compose bierze `${ZM_PROXY_SEKRET_TEST}` i pozostałe właśnie z tego `.env`. Sprawdzenie składni na przykładowym pliku (z wymyślonymi wartościami, bez demona): `docker compose -f deploy/hetzner/compose.obok.yml --env-file <przykład.env> config`.

### Wdrożenie `api-prod` i blok Caddy

Wdrożenie, zmiana Caddyfile cergo i założenie projektu na Vercelu wymagają wyraźnego OK Mateusza (`CLAUDE.md`, „Twarde zasady”). Kolejność, gdy je ma:

1. Uzupełnić `.env` na serwerze (wyżej).
2. Wdrożyć jak dotąd: `ZM_IP=$(hcloud --context cergo-rw server ip cergo-rw-prod) ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh`. Skrypt podniesie też `api-prod` i wolumen `dane_prod`; serwer testowy dostanie przy tym nowe zmienne (`ZM_PROXY_SEKRET`, `ZM_KONTAKT`, wzór podglądów w `ZM_ZRODLA`), więc zrestartuje się na chwilę.
3. Kopia Caddyfile przed zmianą, potem dopisanie bloku w miejscu (plik jest montowany pojedynczo, więc `cat >>`), sprawdzenie i przeładowanie bez restartu:

```bash
cp /opt/cergo/Caddyfile /opt/cergo/Caddyfile.przed-za-murem-api-prod-$(date +%F)
cat >> /opt/cergo/Caddyfile <<'EOF'

za-murem-api.5-75-147-27.sslip.io {
	handle /api/* {
		request_body {
			max_size 4MB
		}
		reverse_proxy za-murem-api-prod:8787
	}
	handle {
		respond 404
	}
}
EOF
docker exec cergo-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec cergo-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Pierwsze żądanie na nowy adres zamawia certyfikat (kilka sekund), a sslip.io rozwiązuje `za-murem-api.5-75-147-27.sslip.io` na 5.75.147.27 bez wpisów DNS. Stos cergo i reszta jej Caddyfile zostają bez zmian. Cofnięcie: przepisać kopię w miejscu (`cat /opt/cergo/Caddyfile.przed-za-murem-api-prod-<data> > /opt/cergo/Caddyfile`), przeładować Caddy, potem `cd /srv/za-murem && docker compose stop api-prod`. Wolumen `dane_prod` zostaje (to dane osobowe, więc usuwamy go świadomie, nie przy cofaniu).

Kontrola po wdrożeniu, bez sekretów w poleceniu:

```bash
curl -s https://za-murem-api.5-75-147-27.sslip.io/api/zdrowie     # "ip": "xff" (bez sekretu liczy się adres z Caddy)
curl -s -o /dev/null -w '%{http_code}\n' https://za-murem-api.5-75-147-27.sslip.io/api/liczniki   # 401 bez tokenu
curl -s -o /dev/null -w '%{http_code}\n' https://za-murem-api.5-75-147-27.sslip.io/               # 404: poza /api nic nie stoi
```

`"ip": "proxy"` zobaczymy dopiero przez Vercel (`<adres gry>/api/zdrowie`): to dowód, że nagłówek `x-zm-proxy` dociera i sekret się zgadza.

### Projekt na Vercelu

Jednorazowo, po OK Mateusza: zespół „Mateusz's projects”, nowy projekt `zamurem` z repozytorium `agentsmill/za-murem`, gałąź produkcyjna `main`. Przed założeniem sprawdzić, że `zamurem.vercel.app` jest wolny; jeśli nie, wybrać inną nazwę i poprawić `ZM_ZRODLA` w `compose.obok.yml` (oba serwery), w tabeli wyżej i w tym pliku. `vercel.json` ustawia komendę budowy (`npm run build`), katalog `dist` i trasy; wersję Node ustawiamy w projekcie (Settings, General, Node.js Version: 24).

Zmienne środowiskowe projektu (bez przedrostka `VITE_`, więc nie trafiają do kodu w przeglądarce):

| zmienna | Production | Preview |
|---|---|---|
| `ZM_API` | `https://za-murem-api.5-75-147-27.sslip.io` | `https://za-murem.5-75-147-27.sslip.io` |
| `ZM_PROXY_SEKRET` | `<sekret produkcji>` (jak `ZM_PROXY_SEKRET_PROD` na serwerze) | `<sekret testu>` (jak `ZM_PROXY_SEKRET_TEST`) |
| `VITE_SIEC` | brak | `1` |

Produkcja buduje się bez `VITE_SIEC`, dopóki Mateusz nie zatwierdzi informacji o danych osobowych: gra na `zamurem.vercel.app` działa wtedy bez sieci i nie woła API, a podglądy gałęzi od razu testują grę z siecią. Włączenie sieci na produkcji to osobna decyzja: dopisać `VITE_SIEC=1` w Production i wdrożyć ponownie.

Podglądy na Vercelu są domyślnie za logowaniem (Deployment Protection), więc test automatyczny albo osoba spoza zespołu ich nie otworzy; do prób bez logowania służy token obejścia, który ustawia Mateusz w projekcie. Adres podglądu gałęzi ma postać `https://zamurem-git-<gałąź>-mateuszs-projects-73382f2a.vercel.app`, a adres pojedynczego wdrożenia `https://zamurem-<skrót>-mateuszs-projects-73382f2a.vercel.app`; oba mieszczą się we wzorze `ZM_ZRODLA` serwera testowego.

### Czego tu nie robić

- Nie rozszerzać `ZM_ZRODLA` do `https://*.vercel.app`. Gwiazdka ma zostać w nazwach naszego projektu (`https://zamurem-*-mateuszs-projects-73382f2a.vercel.app`): wzór na całe `vercel.app` uznałby za dozwolone źródło strony z dowolnego cudzego projektu. Wzór pasuje tylko do jednego kawałka nazwy hosta (bez kropki), a `tests/unit/vercel-json.test.ts` pilnuje, żeby `compose.obok.yml` nie dostał szerszego.
- Nie wpisywać adresów serwerów ani sekretów do `vercel.json`: adres to `${ZM_API}`, sekret `$ZM_PROXY_SEKRET`, a test sprawdza, że w pliku nie ma `sslip.io`.
- Nie łączyć `routes` z `rewrites`, `headers` ani `redirects` w `vercel.json`: Vercel na to nie pozwala, dlatego nagłówki pamięci podręcznej (jak w `conf-obok/Caddyfile`) są trasami z `continue`.

### Dzienniki Vercela i dane osobowe

Wpisany adres gracza jedzie w adresie żądania: `/api/adres?q=<adres>` przechodzi przez serwery Vercela, więc dzienniki żądań Vercela (Runtime Logs, ewentualne drenaże dzienników) mogą zawierać tekst wpisanego adresu, a Vercel widzi też adres IP gracza. Nasz serwer tekstu zapytania nie zapisuje (`server/README.md`, „Wyszukiwanie adresu”), ale Vercel jest tu dodatkowym odbiorcą danych i trzeba go wymienić w informacji o danych osobowych (`public/prywatnosc.html`) jako podmiot przetwarzający. Drenaży dzienników nie podpinamy do zewnętrznych usług bez decyzji Mateusza.

## Przełączenie GitHub Pages na przekierowanie

Plik `deploy/pages/index.html` to samodzielna strona (bez skryptów i zewnętrznych zasobów) z `meta refresh` po 3 sekundach i widocznym odnośnikiem do `https://zamurem.vercel.app/`, po polsku i po angielsku. Nie jest podpięta do żadnego workflow: dziś Pages dalej serwuje grę z `dist/`.

Kiedy: dopiero gdy produkcja na Vercelu działa (`/api/zdrowie` przez Vercel daje `"ip": "proxy"`, nowa gra startuje, `/v03/` działa) i po OK Mateusza. Pages wdraża się z `main` (`.github/workflows/pages.yml`), więc zmiana workflow na `main` od razu wchodzi na żywo.

Jak: w zadaniu `build` workflow zastąpić budowę gry kopiowaniem strony i wskazać ją jako artefakt:

```yaml
      - run: cp deploy/pages/index.html deploy/pages/404.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: deploy/pages
```

Kopia jako `404.html` sprawia, że stare adresy w głębi (`/za-murem/v03/` i inne) też przekierują na nowy adres zamiast pokazać błąd GitHuba. Czego przekierowanie nie przeniesie: parametrów adresu (na przykład `?demo=`), bo to statyczny `meta refresh`, oraz zapisów gry w przeglądarce (`localStorage` jest osobny dla każdego adresu, a gra nie ma eksportu zapisu), więc gracze ze starego adresu zaczynają od nowa. Cofnięcie: przywrócić poprzedni `pages.yml` (budowa `dist`) i wypchnąć na `main`.

## Własny serwer

Na serwerze tylko dla gry: Caddy z HTTPS na 80 i 443 (`compose.yml`, `conf/Caddyfile`), adres `<ip z kreskami>.sslip.io`.

```bash
ZM_IP=1.2.3.4 deploy/hetzner/wdroz.sh
```

Tak gra stała w nocy z 17 na 18.10.2026 na serwerze `za-murem` (kontekst `phpbotbot`, dawny `phpbotbot-staging`); od rana ten serwer tylko przekierowuje stary adres na nowy, a jego kontener `api` jest zatrzymany.

## Restart planowy i kopie bazy

Oba pliki compose ustawiają serwerowi gry (`api`, a w `compose.obok.yml` także `api-prod`) dwie zmienne, opisane w `server/README.md`:

- `ZM_RESTART_H=48`: co 48 godzin serwer kończy się czysto, a `restart: unless-stopped` podnosi go od nowa na tej samej bazie. Odświeża się proces, nic nie ginie; gracz traci połączenie na kilka sekund. Docker bez orkiestratora tylko oznacza kontener jako niezdrowy (`HEALTHCHECK` z `server/Dockerfile`, bez drugiego w compose) i go nie restartuje, więc zawieszony serwer złapie dopiero ten restart albo ręczny `docker compose restart api`.
- `ZM_KOPIE=/dane/kopie`: codziennie o 3:00 UTC (i po starcie, gdy tej godziny jeszcze nie było) kopia bazy na tym samym wolumenie `dane`, zostaje 7 ostatnich dni (`ZM_KOPIE_DNI`, `ZM_KOPIA_GODZINA`). Kopie chronią przed pomyłką (usunięte konto, zepsute wdrożenie), nie przed utratą dysku albo maszyny; kopia poza maszyną to osobna decyzja (miejsce, dostęp, koszt). Usunięte konto znika z kopii po 7 dniach. Przywracanie krok po kroku: `server/README.md`, „Przywracanie z kopii” (dla produkcji usługa `api-prod` zamiast `api`; jej baza i kopie leżą w wolumenie `dane_prod`).

Obie zmienne wejdą na serwer przy najbliższym wdrożeniu (`wdroz.sh` kopiuje compose), po OK Mateusza: do tego czasu działający serwer na `cergo-rw-prod` jest bez restartu planowego i bez kopii. Skrypt wdrożenia i stos cergo bez zmian.

## Bez logów dostępu

Caddy gry nie zapisuje logów dostępu (adresy IP to dane osobowe). Kopie bazy gry sieciowej: `server/README.md`.
