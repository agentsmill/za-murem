#!/usr/bin/env bash
# UWAGA (README, krok 0): zanim serwer z gałęzi wyjscie-na-swiat (albo z gałęzi, która ją zawiera) trafi na serwer testowy,
# każda gałąź wdrażana tam (pelna-gra, noc-integracja i inne) musi zawierać tę zmianę, bo sam ten serwer podnosi schemat
# bazy testowej do wersji 3, której starsze gałęzie nie znają (pętla restartów), a ich wdroz.sh nadpisuje .env jednym
# printf i usuwa api-prod jako sierotę; wycofanie z kopii bazy (ZM_KOPIE) jest w tym samym kroku 0.
# Build gry i wdrożenie na serwer Hetznera (Docker: gra i serwer gry sieciowej, katalog /srv/za-murem).
# Dwa tryby, drugi tylko obok innej aplikacji (compose.obok.yml):
#
# 1. Zwykłe wdrożenie (test, gałęzie, nocna integracja):
#    Własny serwer:  ZM_IP=1.2.3.4 deploy/hetzner/wdroz.sh   (Caddy z HTTPS na 80/443, adres <ip z kreskami>.sslip.io)
#    Obok innej aplikacji: ZM_IP=1.2.3.4 ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh
#      (bez własnego Caddy: gra i API w sieci Dockera tamtej aplikacji, adres za-murem.<ip z kreskami>.sslip.io,
#      blok dla tamtego Caddy w deploy/hetzner/README.md). Inny adres strony: ZM_SITE.
#    Buduje grę z VITE_SIEC=1 (gra z sąsiadami bez ?siec=1; ten przełącznik znika najpierw na serwerze testowym, a na
#    produkcji na Vercelu dopiero po zatwierdzeniu informacji o danych osobowych) i podnosi grę (www) oraz serwer
#    testowy (api). Serwer produkcji (api-prod) leży w profilu `prod`, więc to wdrożenie go nie buduje, nie startuje,
#    nie zatrzymuje i nie restartuje, z jakiejkolwiek gałęzi by szło.
#    Sekrety w .env na serwerze nie są warunkiem: gdy brakuje ZM_PROXY_SEKRET_TEST albo ZM_KONTAKT, skrypt ostrzega
#    (sama nazwa zmiennej, nigdy wartość) i idzie dalej, a serwer traktuje puste wartości jak nieustawione.
#
# 2. Wdrożenie produkcji: ZM_PROD=1 ZM_IP=1.2.3.4 ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh
#    Nie buduje gry (gra produkcyjna stoi na Vercelu i buduje się tam bez VITE_SIEC), wdraża tylko serwer API.
#    Tylko z lokalnej gałęzi `main`, z czystym drzewem i dokładnie równej origin/main (skrypt sam robi
#    `git fetch origin main`; inaczej komunikat i kod 1, zanim cokolwiek pójdzie na serwer). Wymaga w .env na serwerze: ZM_PROXY_SEKRET_PROD, ZM_LICZNIKI_TOKEN, ZM_KONTAKT (oraz SITE i ZM_SIEC z
#    wcześniejszego zwykłego wdrożenia); bez nich staje przed jakąkolwiek zmianą na serwerze (sprawdzenie .env to
#    sam odczyt). Kopiuje compose i źródła serwera do osobnego katalogu serwer-prod (kontekst budowania api-prod,
#    niezależny od zwykłych wdrożeń) i uruchamia tylko `docker compose --profile prod up -d --build api-prod`:
#    www, api i Caddy nie są ruszane, .env też nie. Baza produkcji (wolumen dane_prod) dostaje więc migracje wyłącznie
#    z kodu `main`. Cofnięcie: `docker compose --profile prod stop api-prod` (zostaje zatrzymany, bo zwykłe
#    wdrożenia go nie startują).
set -euo pipefail

IP="${ZM_IP:?podaj ZM_IP, adres serwera}"
SIEC="${ZM_SIEC:-}"
PROD=0
if [ "${ZM_PROD:-}" = 1 ]; then PROD=1; fi
if [ -n "$SIEC" ]; then
  SITE="${ZM_SITE:-za-murem.${IP//./-}.sslip.io}"
  COMPOSE=compose.obok.yml
  CONF=conf-obok
  CADDY=www
else
  SITE="${ZM_SITE:-${IP//./-}.sslip.io}"
  COMPOSE=compose.yml
  CONF=conf
  CADDY=caddy
fi
DIR=/srv/za-murem
cd "$(dirname "$0")/../.."

# Wypisuje (po jednej w linii) nazwy wpisów, których w .env na serwerze brakuje albo są puste. Tylko odczyt, nigdy wartości.
# Błąd ssh przerywa skrypt (przypisanie z $(...) pod set -e).
brakuje_w_env() {
  ssh "root@$IP" "cd $DIR && for z in $*; do grep -q \"^\$z=.\" .env 2>/dev/null || echo \$z; done"
}

# Źródła serwera gry sieciowej: tylko to, co bierze server/Dockerfile (kontekst budowania jak w repozytorium).
# Zwykłe wdrożenie wysyła je do serwer-zrodla (api), produkcja do serwer-prod (api-prod).
wyslij_zrodla() {
  rsync -azR --delete server/Dockerfile server/Dockerfile.dockerignore server/*.ts src/net/protokol.ts "root@$IP:$DIR/$1/"
}

if [ "$PROD" = 1 ]; then
  [ -n "$SIEC" ] || { echo "ZM_PROD=1 działa tylko obok innej aplikacji: podaj ZM_SIEC (compose.obok.yml)" >&2; exit 1; }
  GALAZ="$(git rev-parse --abbrev-ref HEAD)"
  [ "$GALAZ" = main ] || { echo "Produkcja idzie tylko z gałęzi main, a tu jest '$GALAZ'. Nic nie wysłano." >&2; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo "Drzewo robocze nie jest czyste (zmiany albo nowe pliki): produkcja idzie tylko z czystej gałęzi main. Nic nie wysłano." >&2; exit 1; }
  # Lokalny main musi być dokładnie origin/main. Za nim wdrożylibyśmy stary kod (który może nie znać nowszego schematu
  # bazy i nie wstać), przed nim niezrecenzowane commity i migracje, których nie da się cofnąć.
  git fetch -q origin main || { echo "Nie udało się pobrać origin/main (git fetch origin main). Nic nie wysłano." >&2; exit 1; }
  ZDALNY="$(git rev-parse --verify -q origin/main)" || { echo "Po pobraniu nie ma origin/main. Nic nie wysłano." >&2; exit 1; }
  if [ "$(git rev-parse HEAD)" != "$ZDALNY" ]; then
    PRZED="$(git rev-list --count origin/main..HEAD)"
    ZA="$(git rev-list --count HEAD..origin/main)"
    if [ "$ZA" = 0 ]; then
      echo "Lokalny main wyprzedza origin/main (niewypchnięte commity: $PRZED): produkcja idzie tylko z tego, co jest na origin/main. Nic nie wysłano." >&2
    elif [ "$PRZED" = 0 ]; then
      echo "Lokalny main jest za origin/main (brakuje commitów: $ZA): zrób git pull --ff-only i spróbuj jeszcze raz. Nic nie wysłano." >&2
    else
      echo "Lokalny main i origin/main się rozeszły (tylko lokalnie: $PRZED, tylko na origin/main: $ZA): produkcja idzie tylko z origin/main. Nic nie wysłano." >&2
    fi
    exit 1
  fi
  BRAK="$(brakuje_w_env ZM_PROXY_SEKRET_PROD ZM_LICZNIKI_TOKEN ZM_KONTAKT SITE ZM_SIEC)"
  if [ -n "$BRAK" ]; then
    echo "Brakuje w .env na serwerze (sprawdzone tylko nazwy): ${BRAK//$'\n'/ }. Uzupełnij je w .env (SITE i ZM_SIEC zapisuje zwykłe wdrożenie, opis: deploy/hetzner/README.md). Nic nie zmieniono." >&2
    exit 1
  fi
  rsync -az "deploy/hetzner/$COMPOSE" "root@$IP:$DIR/compose.yml"
  wyslij_zrodla serwer-prod
  ssh "root@$IP" "cd $DIR && docker compose --profile prod up -d --build api-prod"
  echo "Produkcja (api-prod) wdrożona z gałęzi main, commit $(git rev-parse --short HEAD). Kontrola: deploy/hetzner/README.md"
  exit 0
fi

# .env na serwerze trzyma też sekrety (ZM_PROXY_SEKRET_TEST, ZM_PROXY_SEKRET_PROD, ZM_LICZNIKI_TOKEN, ZM_KONTAKT; opis
# w deploy/hetzner/README.md): skrypt odświeża tylko własne trzy linie (SITE, IP, ZM_SIEC), resztę zostawia, plik ma 0600.
ODSWIEZ_ENV="touch .env && { grep -v -E '^(SITE|IP|ZM_SIEC)=' .env || true; printf 'SITE=%s\nIP=%s\nZM_SIEC=%s\n' '$SITE' '$IP' '$SIEC'; } > .env.nowy && mv .env.nowy .env"

# gra z sąsiadami bez ?siec=1 na serwerze testowym (tryb ZM_PROD=1 gry nie buduje)
VITE_SIEC=1 npm run build
ssh "root@$IP" "mkdir -p $DIR/www && cd $DIR && (umask 077; $ODSWIEZ_ENV)"
if [ -n "$SIEC" ]; then
  # serwer testowy z compose.obok.yml bierze te dwie wartości z .env; bez nich wstaje jak dziś (puste = nieustawione)
  BRAK="$(brakuje_w_env ZM_PROXY_SEKRET_TEST ZM_KONTAKT)"
  for z in $BRAK; do
    echo "UWAGA: w .env na serwerze brak $z, serwer testowy wstanie bez tej wartości (opis: deploy/hetzner/README.md)" >&2
  done
fi
rsync -az --delete dist/ "root@$IP:$DIR/www/"
rsync -az "deploy/hetzner/$COMPOSE" "root@$IP:$DIR/compose.yml"
rsync -az --delete "deploy/hetzner/$CONF/" "root@$IP:$DIR/$CONF/"
wyslij_zrodla serwer-zrodla
ssh "root@$IP" "cd $DIR && docker compose up -d --build --remove-orphans && (docker compose exec -T $CADDY caddy reload --config /etc/caddy/Caddyfile || docker compose restart $CADDY)"
echo "Gra: https://$SITE/"
