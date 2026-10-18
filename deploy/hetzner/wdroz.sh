#!/usr/bin/env bash
# Build gry i wdrożenie na serwer Hetznera (Docker: Caddy z grą i serwer gry sieciowej, katalog /srv/za-murem).
# Użycie: ZM_IP=1.2.3.4 deploy/hetzner/wdroz.sh   (adres strony: ZM_SITE, domyślnie <ip z kreskami>.sslip.io)
set -euo pipefail

IP="${ZM_IP:?podaj ZM_IP, adres serwera}"
SITE="${ZM_SITE:-${IP//./-}.sslip.io}"
DIR=/srv/za-murem
cd "$(dirname "$0")/../.."

npm run build
ssh "root@$IP" "mkdir -p $DIR/www && printf 'SITE=%s\nIP=%s\n' '$SITE' '$IP' > $DIR/.env"
rsync -az --delete dist/ "root@$IP:$DIR/www/"
rsync -az deploy/hetzner/compose.yml "root@$IP:$DIR/"
rsync -az --delete deploy/hetzner/conf/ "root@$IP:$DIR/conf/"
# źródła serwera gry sieciowej: tylko to, co bierze server/Dockerfile (kontekst budowania jak w repozytorium)
rsync -azR --delete server/Dockerfile server/Dockerfile.dockerignore server/*.ts src/net/protokol.ts "root@$IP:$DIR/serwer-zrodla/"
ssh "root@$IP" "cd $DIR && docker compose up -d --build --remove-orphans && (docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || docker compose restart caddy)"
echo "Gra: https://$SITE/"
