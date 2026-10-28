#!/usr/bin/env bash
# Build gry i wdrożenie na serwer Hetznera (Docker: gra i serwer gry sieciowej, katalog /srv/za-murem).
# Własny serwer:  ZM_IP=1.2.3.4 deploy/hetzner/wdroz.sh   (Caddy z HTTPS na 80/443, adres <ip z kreskami>.sslip.io)
# Obok innej aplikacji: ZM_IP=1.2.3.4 ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh
#   (bez własnego Caddy: gra i API w sieci Dockera tamtej aplikacji, adres za-murem.<ip z kreskami>.sslip.io,
#   blok dla tamtego Caddy w deploy/hetzner/README.md). Inny adres strony: ZM_SITE.
set -euo pipefail

IP="${ZM_IP:?podaj ZM_IP, adres serwera}"
SIEC="${ZM_SIEC:-}"
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

# .env na serwerze trzyma też sekrety (ZM_PROXY_SEKRET_TEST, ZM_PROXY_SEKRET_PROD, ZM_LICZNIKI_TOKEN, ZM_KONTAKT; opis
# w deploy/hetzner/README.md): skrypt odświeża tylko własne trzy linie (SITE, IP, ZM_SIEC), resztę zostawia, plik ma 0600.
ODSWIEZ_ENV="touch .env && { grep -v -E '^(SITE|IP|ZM_SIEC)=' .env || true; printf 'SITE=%s\nIP=%s\nZM_SIEC=%s\n' '$SITE' '$IP' '$SIEC'; } > .env.nowy && mv .env.nowy .env"
# obok innej aplikacji compose.obok.yml bierze sekrety z .env: bez nich serwery wstałyby bez sekretu proxy (limity
# liczyłyby adresy Vercela zamiast graczy), bez tokenu liczników i bez kontaktu dla Nominatim, więc wdrożenie staje
SPRAWDZ_ENV='for z in ZM_PROXY_SEKRET_TEST ZM_PROXY_SEKRET_PROD ZM_LICZNIKI_TOKEN ZM_KONTAKT; do grep -q "^$z=." .env || { echo "brak $z w .env na serwerze" >&2; exit 1; }; done'

npm run build
ssh "root@$IP" "mkdir -p $DIR/www && cd $DIR && (umask 077; $ODSWIEZ_ENV)"
if [ -n "$SIEC" ]; then ssh "root@$IP" "cd $DIR && $SPRAWDZ_ENV"; fi
rsync -az --delete dist/ "root@$IP:$DIR/www/"
rsync -az "deploy/hetzner/$COMPOSE" "root@$IP:$DIR/compose.yml"
rsync -az --delete "deploy/hetzner/$CONF/" "root@$IP:$DIR/$CONF/"
# źródła serwera gry sieciowej: tylko to, co bierze server/Dockerfile (kontekst budowania jak w repozytorium)
rsync -azR --delete server/Dockerfile server/Dockerfile.dockerignore server/*.ts src/net/protokol.ts "root@$IP:$DIR/serwer-zrodla/"
ssh "root@$IP" "cd $DIR && docker compose up -d --build --remove-orphans && (docker compose exec -T $CADDY caddy reload --config /etc/caddy/Caddyfile || docker compose restart $CADDY)"
echo "Gra: https://$SITE/"
