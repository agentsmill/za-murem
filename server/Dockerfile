# Serwer gry Za Murem (multiplayer, etap 1): Node 24 bez zależności z npm, TypeScript uruchamiany wprost.
# Budowanie z głównego katalogu repozytorium, bo serwer bierze też src/net/protokol.ts:
#   docker build -f server/Dockerfile -t za-murem-serwer .
# Uruchomienie: baza w wolumenie, port tylko na localhost, przed serwerem Caddy z HTTPS (server/README.md):
#   docker run -d --name za-murem-serwer --restart unless-stopped \
#     -p 127.0.0.1:8787:8787 -v za-murem-dane:/dane -e ZM_ZRODLA=https://twoja.domena za-murem-serwer
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    ZM_BAZA=/dane/za-murem.db \
    ZM_ZAUFANE_PROXY=1

# pliki .ts to moduły ES: package.json z "type": "module", żeby Node nie zgadywał rodzaju modułu
RUN printf '{"name":"za-murem-serwer","private":true,"type":"module"}\n' > package.json \
 && mkdir -p /dane \
 && chown node:node /dane
COPY server/*.ts ./server/
COPY src/net/protokol.ts ./src/net/protokol.ts

USER node
VOLUME ["/dane"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1:8787/api/zdrowie || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
