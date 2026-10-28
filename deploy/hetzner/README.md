# Wdrożenie na Hetznera

Gra (pliki z `dist/`) i serwer gry sieciowej (`server/`, kontenery `api` i `api-prod`) w Dockerze, w katalogu `/srv/za-murem` na serwerze. Skrypt `deploy/hetzner/wdroz.sh` buduje grę (z `VITE_SIEC=1`: na serwerze testowym gra jest sieciowa bez `?siec=1`), kopiuje pliki i źródła serwera, odświeża w `.env` adres strony, IP i sieć (sekretów w `.env` nie rusza) i podnosi kontenery gry (`www`) i serwera testowego (`api`). Serwer produkcji (`api-prod`) wdraża tylko osobny tryb `ZM_PROD=1` z czystego `main` (niżej, „Wdrożenie `api-prod` i blok Caddy”).

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
| kod i wdrożenie | źródła w `serwer-zrodla`, każde zwykłe wdrożenie z dowolnej gałęzi | źródła w osobnym `serwer-prod`, profil `prod` w compose, wdrożenie tylko z `main` (`ZM_PROD=1`) |

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
- Zwykłe wdrożenie (test, nocna integracja) nie wymaga żadnego z tych wpisów: gdy w `.env` brakuje `ZM_PROXY_SEKRET_TEST` albo `ZM_KONTAKT`, `wdroz.sh` ostrzega nazwą zmiennej (nigdy wartością) i idzie dalej, a serwer testowy wstaje jak dotąd (pusta wartość znaczy: nieustawiona, więc limity liczą adres Vercela, a User-Agent jest bez kontaktu). Wdrożenie produkcji (`ZM_PROD=1`) wymaga `ZM_PROXY_SEKRET_PROD`, `ZM_LICZNIKI_TOKEN` i `ZM_KONTAKT` oraz `SITE` i `ZM_SIEC` (te dwa zapisuje zwykłe wdrożenie) i staje przed jakąkolwiek zmianą na serwerze, jeśli któregoś brakuje albo jest pusty.
- W `.env` nie ustawiamy `COMPOSE_PROFILES`: profil `prod` włącza wyłącznie wdrożenie produkcji.
- Docker Compose bierze `${ZM_PROXY_SEKRET_TEST}` i pozostałe właśnie z tego `.env`. Sprawdzenie składni na przykładowym pliku (z wymyślonymi wartościami, bez demona): `docker compose -f deploy/hetzner/compose.obok.yml --env-file <przykład.env> config`.

### Wdrożenie `api-prod` i blok Caddy

Wdrożenie, zmiana Caddyfile cergo i założenie projektu na Vercelu wymagają wyraźnego OK Mateusza (`CLAUDE.md`, „Twarde zasady”).

**Dlaczego produkcja ma osobne wdrożenie.** Zwykłe wdrożenie (`docker compose up -d --build`) buduje wszystko z jednego katalogu źródeł i przy okazji uruchamia migracje bazy. Gdyby `api-prod` budował się razem z `api`, każde wdrożenie testowe, także nocnej integracji z gałęzi roboczej, podmieniłoby kod i schemat bazy produkcji. Dlatego `api-prod` ma w compose profil `prod` (zwykłe wdrożenie go nie buduje, nie startuje, nie zatrzymuje i nie restartuje) i własny katalog źródeł `serwer-prod`, a `wdroz.sh` w trybie `ZM_PROD=1` wdraża tylko jego i tylko z lokalnej gałęzi `main` z czystym drzewem.

Kolejność, gdy jest OK:

0. **Krok 0, przed wszystkim innym: zanim serwer z gałęzi `wyjscie-na-swiat` (albo z jakiejkolwiek gałęzi, która ją zawiera) trafi na serwer testowy, każda gałąź wdrażana na serwer testowy (`pelna-gra`, `noc-integracja` i każda inna, także te wdrażane nocą) musi zawierać zmiany z `wyjscie-na-swiat`** (nowy `wdroz.sh` i `compose.obok.yml` z profilem `prod`). Powody są trzy:
   - **schemat bazy.** Sam serwer z tej gałęzi na serwerze testowym podnosi schemat bazy testowej (`PRAGMA user_version`) do wersji 3, a `pelna-gra` i `main` znają tylko wersję 1 (`server/baza.ts` odmawia nowszej bazy). Następne nocne wdrożenie starszej gałęzi kończy się więc pętlą restartów kontenera `za-murem-api` z błędem „Baza ma schemat w wersji 3, a serwer zna najwyżej 1.”;
   - **`.env`.** Stary `wdroz.sh` nadpisuje `.env` jednym `printf` i kasuje sekrety;
   - **sierota.** Stary `compose.obok.yml` nie zna `api-prod`, więc jego `up --remove-orphans` usuwa działający kontener `za-murem-api-prod` jako sierotę.

   Sprawdzenie na gałęzi: `grep -q ZM_PROD deploy/hetzner/wdroz.sh && grep -q 'profiles: \["prod"\]' deploy/hetzner/compose.obok.yml` (oba muszą się zgadzać).

   **Wycofanie**, gdy starsza gałąź mimo to wstała na bazie w wersji 3: (a) `cd /srv/za-murem && docker compose stop api` (kończy pętlę restartów; gra `www` stoi dalej); (b) przywrócić bazę testową z kopii sprzed wdrożenia (schemat w wersji 1; kopie z `ZM_KOPIE=/dane/kopie` powstają codziennie o 3:00 UTC i zostaje ich 7) krok po kroku według `server/README.md`, „Przywracanie z kopii” (usługa `api`, wolumen `dane`); (c) `docker compose start api`. Konta i klatki założone na serwerze testowym po wykonaniu tej kopii przepadają (to baza testowa). Jeśli serwer testowy nie miał jeszcze `ZM_KOPIE` (niżej, „Restart planowy i kopie bazy”), pierwsza kopia powstałaby już po migracji do wersji 3 i do cofnięcia się nie nadaje, więc przed pierwszym wdrożeniem z tej gałęzi trzeba zrobić kopię ręczną (`VACUUM INTO`, `server/README.md`, „Kopie bazy”). Nadpisany przez stary `wdroz.sh` plik `.env` trzeba uzupełnić od nowa, a usunięty `api-prod` wstaje z powrotem z `ZM_PROD=1` z `main` (jego wolumen `dane_prod` zostaje).
1. **OK Mateusza** (`CLAUDE.md`, „Twarde zasady”) na to, co dotyczy testów: założenie projektu na Vercelu, zmienne podglądów (Preview) i serwer testowy (zwykłe wdrożenie z `.env` z sekretami testu). Na tym etapie nie ma jeszcze `api-prod` ani bloku Caddy (punkt 5); zmienne Production ustawiamy przy zakładaniu projektu (punkt 4).
2. Uzupełnić `.env` na serwerze (wyżej) o wpisy testu, `ZM_PROXY_SEKRET_TEST` i `ZM_KONTAKT`, dopiero po kroku 0. Sekrety produkcji dochodzą w punkcie 5.
3. Zwykłe wdrożenie jak dotąd: `ZM_IP=$(hcloud --context cergo-rw server ip cergo-rw-prod) ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh`. Buduje grę z `VITE_SIEC=1`, zapisze w `.env` `SITE`, `IP` i `ZM_SIEC` (potrzebne produkcji) i podniesie grę oraz serwer testowy `api`, który dostanie nowe zmienne (`ZM_PROXY_SEKRET`, `ZM_KONTAKT`, wzór podglądów w `ZM_ZRODLA`), więc zrestartuje się na chwilę. `api-prod` nie rusza.
4. Projekt na Vercelu ze zmiennymi Preview i Production (niżej, „Projekt na Vercelu”) oraz sprawdzenie podglądu gałęzi (niżej, „Sprawdzenie podglądu gałęzi”). Production od początku ma `ZM_API` (adres przyszłego `api-prod`) i `ZM_PROXY_SEKRET` (sekret produkcji wygenerowany teraz; tę samą wartość wpisujemy potem do `.env` na serwerze jako `ZM_PROXY_SEKRET_PROD`, punkt 5), ale nie ma `VITE_SIEC`, więc produkcyjna gra nie woła `/api`, dopóki informacja o danych osobowych nie jest zatwierdzona i `api-prod` nie stoi.
5. **`api-prod` dopiero po zatwierdzeniu informacji o danych osobowych.** Mateusz wypełnia w `public/prywatnosc.html` i `public/regulamin.html` miejsca na dane firmy, podstawy prawne i kraj serwera i zdejmuje `noindex`. Do tego czasu na stronach są miejsca do wypełnienia w [nawiasach kwadratowych], a gdy `api-prod` już stoi, `?siec=1` na `zamurem.vercel.app` zakłada prawdziwe drużyny w bazie produkcji przy takim tekście. Po zatwierdzeniu, z osobnym OK Mateusza: sekrety produkcji w `.env` (`ZM_PROXY_SEKRET_PROD` o wartości już wpisanej w Vercelu w punkcie 4, `ZM_LICZNIKI_TOKEN`), blok Caddy (niżej), a potem produkcja, z lokalnego `main`, czystego drzewa i dokładnie równego `origin/main`: `ZM_PROD=1 ZM_IP=$(hcloud --context cergo-rw server ip cergo-rw-prod) ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh`. Skrypt odmawia (komunikat i kod 1, nic nie idzie na serwer) z innej gałęzi, z brudnego drzewa, bez `ZM_SIEC` albo gdy po `git fetch origin main` lokalny `main` różni się od `origin/main`: będąc za nim, wdrożyłby stary kod (który może nie wstać na nowszym schemacie bazy, bo `server/baza.ts` odmawia nowszej wersji), a przed nim niezrecenzowane commity z migracjami, których nie da się cofnąć (po scaleniu zrób `git pull --ff-only` na `main`; commity przed `origin/main` trzeba najpierw wypchnąć i zrecenzować). Potem sprawdza w `.env` na serwerze same nazwy `ZM_PROXY_SEKRET_PROD`, `ZM_LICZNIKI_TOKEN`, `ZM_KONTAKT`, `SITE`, `ZM_SIEC` (odczyt, bez zmian) i dopiero wtedy kopiuje `compose.obok.yml` oraz źródła z `main` do `serwer-prod` i uruchamia na serwerze wyłącznie `docker compose --profile prod up -d --build api-prod`. Gry (`www`), serwera testowego, Caddy i `.env` nie rusza. Baza produkcji (`dane_prod`) dostaje migracje tylko z kodu `main`.
6. Po postawieniu `api-prod` jedno zwykłe wdrożenie i `docker ps`: `za-murem-api-prod` ma dalej działać (ostatnie z czterech dodatkowych sprawdzeń w „Sprawdzenie podglądu gałęzi”).

Blok Caddy (punkt 5) dopisujemy raz: skrypt poniżej sprawdza, czy blok już jest, robi kopię Caddyfile i dopisuje blok dopiero po sprawdzeniu, że kopia jest wierna (`cmp`); jeśli kopii nie da się zrobić, Caddyfile zostaje nietknięty (cergo nie może zostać bez ważnego Caddyfile). Plik jest montowany pojedynczo, więc przepisujemy w miejscu. A gdy sprawdzenie albo przeładowanie się nie uda, przywraca kopię, przeładowuje stary Caddyfile i kończy się błędem (kod różny od 0). Uruchomić na serwerze jako root, w bash:

```bash
CF=/opt/cergo/Caddyfile
HOST=za-murem-api.5-75-147-27.sslip.io
CADDY="docker exec cergo-caddy-1 caddy"
if grep -qF "$HOST {" "$CF"; then
  echo "Blok $HOST już jest w Caddyfile, nic nie dopisano"
else
  KOPIA="$CF.przed-za-murem-api-prod-$(date +%F-%H%M)"
  if ! { cp "$CF" "$KOPIA" && cmp -s "$CF" "$KOPIA"; }; then
    echo "Nie udało się zrobić wiernej kopii $KOPIA: Caddyfile nietknięty, nic nie dopisano" >&2
    false
  else
    cat >> "$CF" <<'EOF'

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
    $CADDY validate --config /etc/caddy/Caddyfile --adapter caddyfile \
      && $CADDY reload --config /etc/caddy/Caddyfile --adapter caddyfile \
      || { echo "Caddy odrzucił nowy blok: przywracam $KOPIA" >&2; cat "$KOPIA" > "$CF"; $CADDY reload --config /etc/caddy/Caddyfile --adapter caddyfile; false; }
  fi
fi
```

Pierwsze żądanie na nowy adres zamawia certyfikat (kilka sekund), a sslip.io rozwiązuje `za-murem-api.5-75-147-27.sslip.io` na 5.75.147.27 bez wpisów DNS. Stos cergo i reszta jej Caddyfile zostają bez zmian.

Cofnięcie produkcji: `cd /srv/za-murem && docker compose --profile prod stop api-prod`. Kontener zostaje zatrzymany, bo zwykłe wdrożenia go nie startują (do ponownego uruchomienia służy `ZM_PROD=1` albo `docker compose --profile prod start api-prod`). Bloku Caddy nie trzeba cofać; gdyby jednak, przepisać wybraną kopię w miejscu (`cat /opt/cergo/Caddyfile.przed-za-murem-api-prod-<data> > /opt/cergo/Caddyfile`) i przeładować Caddy. Wolumen `dane_prod` zostaje (to dane osobowe, więc usuwamy go świadomie, nie przy cofaniu).

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

Zmienne Production ustawiamy od razu przy zakładaniu projektu, także `ZM_API` i `ZM_PROXY_SEKRET` (żeby `${ZM_API}` z `vercel.json` miało wartość w każdym wdrożeniu), ale bez `VITE_SIEC`, więc produkcyjna gra nie woła `/api`, dopóki informacja o danych osobowych nie jest zatwierdzona i `api-prod` nie stoi. Produkcja buduje się bez `VITE_SIEC`, dopóki Mateusz nie zatwierdzi informacji o danych osobowych: gra na `zamurem.vercel.app` działa wtedy bez sieci i nie woła API, a podglądy gałęzi od razu testują grę z siecią. Włączenie sieci na produkcji to osobna decyzja: dopisać `VITE_SIEC=1` w Production i wdrożyć ponownie.

Podglądy na Vercelu są domyślnie za logowaniem (Deployment Protection), więc test automatyczny albo osoba spoza zespołu ich nie otworzy; do prób bez logowania służy token obejścia, który ustawia Mateusz w projekcie. Adres podglądu gałęzi ma postać `https://zamurem-git-<gałąź>-mateuszs-projects-73382f2a.vercel.app`, a adres pojedynczego wdrożenia `https://zamurem-<skrót>-mateuszs-projects-73382f2a.vercel.app`; oba mieszczą się we wzorze `ZM_ZRODLA` serwera testowego.

### Sprawdzenie podglądu gałęzi

Po OK, gdy projekt na Vercelu ma zmienne Preview, a serwer testowy jest wdrożony (punkty 1–4 kolejności), na podglądzie gałęzi (adres wyżej; za Deployment Protection z tokenem obejścia ustawionym przez Mateusza):

1. `GET <podgląd>/api/zdrowie` daje `"ip": "proxy"`: nagłówek `x-zm-proxy` dociera i sekret się zgadza.
2. Playwright na podglądzie: karta startowa z blokiem `druzyna`, nowa gra na prawdziwym adresie startuje w sieci, kod powrotu działa w drugim kontekście przeglądarki, `/v03/` działa, w konsoli bez błędów; zrzuty obejrzane.
3. Podrobiony `X-Real-IP` nie obchodzi limitów: 301 razy `GET <podgląd>/api/zdrowie` w minutę, za każdym razem z innym `X-Real-IP` (adresy z zakresu dokumentacyjnego 198.51.100.x), daje 429 przy 301. zapytaniu. Gdyby Vercel nie nadpisywał nagłówka, każde zapytanie liczyłoby się osobno i 429 by nie przyszło.
4. Zapis gry 2–3 MB przechodzi przez podgląd: `PUT <podgląd>/api/zapis` z ciałem JSON o takim rozmiarze (limit serwera to 3 MiB, Caddy ma `max_size 4MB`) daje 200, nie 413 od Vercela; zapis i drużynę próbną potem usunąć (`DELETE /api/zapis`, `DELETE /api/konto`).
5. `GET <podgląd>/api/adres?q=Obrońców Wybrzeża 4, Gdańsk` (zakodowane) dochodzi na serwer z parametrem `q` i daje 200 z `lat` i `lon`, a nie 400 „Podajcie adres”.
6. Po postawieniu `api-prod` (punkt 5 kolejności) jedno zwykłe wdrożenie (`wdroz.sh` bez `ZM_PROD`) i `docker ps` na serwerze: `za-murem-api-prod` dalej działa (status Up), a `za-murem-api` zrestartował się z nowym kodem.

### Czego tu nie robić

- Nie rozszerzać `ZM_ZRODLA` do `https://*.vercel.app`. Gwiazdka ma zostać w nazwach naszego projektu (`https://zamurem-*-mateuszs-projects-73382f2a.vercel.app`): wzór na całe `vercel.app` uznałby za dozwolone źródło strony z dowolnego cudzego projektu. Wzór pasuje tylko do jednego kawałka nazwy hosta (bez kropki), a `tests/unit/vercel-json.test.ts` pilnuje, żeby `compose.obok.yml` nie dostał szerszego.
- Nie wdrażać produkcji z gałęzi roboczej ani ręcznym `docker compose --profile prod up` z innego katalogu niż `serwer-prod`: tylko `ZM_PROD=1` z czystego `main`. Zwykłe `wdroz.sh` (bez `ZM_PROD`) niczego produkcyjnego nie dotyka i tak ma zostać; `tests/unit/wdroz.test.ts` sprawdza to na atrapach.
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

Obie zmienne wejdą na serwer przy najbliższym wdrożeniu (`wdroz.sh` kopiuje compose), po OK Mateusza: do tego czasu działający serwer na `cergo-rw-prod` jest bez restartu planowego i bez kopii. Wdrożenie musi iść z gałęzi po kroku 0 (inaczej stary `wdroz.sh` nadpisze `.env` i usunie `api-prod`). Stos cergo zmienia się tylko o osobny blok Caddy dla `api-prod` (punkt 5 kolejności, z osobnym OK Mateusza).

## Bez logów dostępu

Caddy gry nie zapisuje logów dostępu (adresy IP to dane osobowe). Kopie bazy gry sieciowej: `server/README.md`.
