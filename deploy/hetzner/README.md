# Wdrożenie na Hetznera

Gra (pliki z `dist/`) i serwer gry sieciowej (`server/`, kontener `api`) w Dockerze, w katalogu `/srv/za-murem` na serwerze. Skrypt `deploy/hetzner/wdroz.sh` buduje grę, kopiuje pliki i źródła serwera, zapisuje `.env` (adres strony, IP, sieć) i podnosi kontenery.

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

## Własny serwer

Na serwerze tylko dla gry: Caddy z HTTPS na 80 i 443 (`compose.yml`, `conf/Caddyfile`), adres `<ip z kreskami>.sslip.io`.

```bash
ZM_IP=1.2.3.4 deploy/hetzner/wdroz.sh
```

Tak gra stała w nocy z 17 na 18.10.2026 na serwerze `za-murem` (kontekst `phpbotbot`, dawny `phpbotbot-staging`); od rana ten serwer tylko przekierowuje stary adres na nowy, a jego kontener `api` jest zatrzymany.

## Restart planowy i kopie bazy

Oba pliki compose ustawiają serwerowi gry (`api`) dwie zmienne, opisane w `server/README.md`:

- `ZM_RESTART_H=48`: co 48 godzin serwer kończy się czysto, a `restart: unless-stopped` podnosi go od nowa na tej samej bazie. Odświeża się proces, nic nie ginie; gracz traci połączenie na kilka sekund. Docker bez orkiestratora tylko oznacza kontener jako niezdrowy (`HEALTHCHECK` z `server/Dockerfile`, bez drugiego w compose) i go nie restartuje, więc zawieszony serwer złapie dopiero ten restart albo ręczny `docker compose restart api`.
- `ZM_KOPIE=/dane/kopie`: codziennie o 3:00 UTC (i po starcie, gdy tej godziny jeszcze nie było) kopia bazy na tym samym wolumenie `dane`, zostaje 7 ostatnich dni (`ZM_KOPIE_DNI`, `ZM_KOPIA_GODZINA`). Kopie chronią przed pomyłką (usunięte konto, zepsute wdrożenie), nie przed utratą dysku albo maszyny; kopia poza maszyną to osobna decyzja (miejsce, dostęp, koszt). Usunięte konto znika z kopii po 7 dniach. Przywracanie krok po kroku: `server/README.md`, „Przywracanie z kopii”.

Obie zmienne wejdą na serwer przy najbliższym wdrożeniu (`wdroz.sh` kopiuje compose), po OK Mateusza: do tego czasu działający serwer na `cergo-rw-prod` jest bez restartu planowego i bez kopii. Skrypt wdrożenia i stos cergo bez zmian.

## Bez logów dostępu

Caddy gry nie zapisuje logów dostępu (adresy IP to dane osobowe). Kopie bazy gry sieciowej: `server/README.md`.
