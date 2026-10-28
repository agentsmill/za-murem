# Serwer gry Za Murem

Małe API pod `/api` dla gry sieciowej: konta (nick i hasło), drużyny anonimowe z kodem powrotu, sesje, zajęte klatki, zapis gry w chmurze, anonimowe liczniki zdarzeń i wyszukiwanie adresu. Gra dalej liczy się w przeglądarce, serwer pilnuje tylko, kto ma którą klatkę. Projekt: `docs/superpowers/specs/2026-10-18-multiplayer-design.md`. Lista adresów API jest w nagłówku `server/app.ts`, typy i kody błędów w `src/net/protokol.ts`.

Node 24 (działa od 22.18) bez zależności z npm: TypeScript uruchamiany wprost, `node:http`, `node:sqlite`, `node:crypto`, `node:zlib`. Gra na GitHub Pages i dema offline działają bez serwera.

## Lokalnie

Z głównego katalogu repozytorium:

```bash
ZM_BAZA=./za-murem.db ZM_CIASTECZKO_SECURE=0 node --disable-warning=ExperimentalWarning server/main.ts
curl http://127.0.0.1:8787/api/zdrowie
```

`ZM_CIASTECZKO_SECURE=0` jest potrzebne tylko przy zwykłym http, kiedy przeglądarka nie przyjmuje ciasteczka z atrybutem Secure. Gra jeszcze nie woła API (to etap 2); klient jest w `src/net/api.ts`. Testy serwera i klienta: `npm test -- serwer api-klient`.

## Drużyna anonimowa i kod powrotu

Gracz nie musi niczego wypełniać: `POST /api/druzyna` zakłada drużynę bez nicku i hasła i od razu loguje (201 i ciasteczko sesji; `Ja` ma `nick: null`, `anonimowe: true` i `znak` w postaci `#12`). Z ważną sesją to samo wywołanie oddaje konto tej sesji (200), nie zakłada nowego. Nowych drużyn jest najwyżej 30 na IP na godzinę (żądanie z ważną sesją się nie liczy), więc akademik albo sieć komórkowa za jednym adresem wystarczy dla dwudziestu osób w kwadrans.

Kod powrotu pozwala wejść do tej samej drużyny z innej przeglądarki (aplikacja Reddita, karta prywatna, drugi telefon):

| wywołanie | co robi |
|---|---|
| `POST /api/druzyna/kod` (sesja) | nowy kod `XXXX-XXXX-XXXX`, 12 znaków z alfabetu `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bez 0, O, 1, I); poprzedni kod przestaje działać; najwyżej 10 razy na godzinę na drużynę. Dostaje go także konto z nickiem. |
| `POST /api/druzyna/powrot` `{ "kod": "…" }` | nowa sesja w tej drużynie (200 i ciasteczko, `Ja`); wielkość liter, spacje i myślniki bez znaczenia; zły kod to 401 `zly_kod`. Sesje na innych urządzeniach dalej działają. |
| `DELETE /api/konto` | drużyna anonimowa usuwa się bez hasła (razem z klatkami, zapisem i kodem); konto z nickiem dalej prosi o hasło. |

Kod widać tylko w odpowiedzi na `POST /api/druzyna/kod`; w bazie leży jego SHA-256 (kolumna `konta.kod`, unikalna), więc wyciek bazy nie daje kodów wprost, a serwer nie umie go pokazać drugi raz. Zły kod w `powrot` liczy się do tego samego limitu co złe hasło (10 nieudanych prób na IP w 15 minut, potem 429), dobry nie. Wszystkie `POST` niosą `Content-Type: application/json`, także te bez danych (`{}`). Drużyny anonimowej nie ma w logowaniu nickiem. Schemat: migracja 2 w `server/baza.ts` (kolumny `anonimowe` i `kod`), stare konta zostają zwykłymi kontami. Testy: `npm test -- serwer-druzyna`.

## Zajęte klatki tylko w swojej okolicy

`GET /api/klatki?s=&w=&n=&e=` oddaje pozycje zajętych klatek, więc nie może służyć do przeczesywania całego kraju. Każdy z czterech rogów prostokąta musi leżeć najwyżej 1500 m (`ZASIEG_ZAPYTAN_M` w `src/net/protokol.ts`) od siedziby drużyny, a drużyna bez siedziby (jeszcze nie zajęła klatki albo ją zwolniła) pyta wokół swojego punktu startu. Prostokąt mapy gry (384 m plus 150 m zapasu wokół adresu) ma rogi najwyżej około 700 m od środka, więc zwykłe zapytanie z gry mieści się z zapasem.

| wywołanie | co robi |
|---|---|
| `PUT /api/druzyna/start` `{ "lat": …, "lon": … }` (sesja) | zapamiętuje punkt startu drużyny w stopniach (204); złe współrzędne to 400 `zle_dane`; liczy się do limitu zmian okolicy (niżej), przy wyczerpanym 429 `za_duzo_prob` z `Retry-After`. |
| `GET /api/klatki?s=&w=&n=&e=` (sesja) | 403 `poza_okolica`, gdy któryś róg leży dalej niż 1500 m od siedziby drużyny, a bez siedziby od punktu startu; 409 `brak_startu`, gdy drużyna nie ma ani siedziby, ani punktu startu. Zły kształt prostokąta to dalej 400, sprawdzany wcześniej. |

**Limit zmian okolicy.** Okolica (siedziba albo punkt startu) zmienia się najwyżej 5 razy na dobę na konto, jedno okno (w pamięci procesu, więc restart je zeruje) dla wszystkich dróg, bo inaczej jedno konto przeczesałoby miasto, zajmując klatkę daleko i zwalniając wszystko albo idąc od klatki do klatki; zebranie całego miasta ma wymagać zakładania kont. Liczą się tylko przyjęte zmiany, a po wyczerpaniu okna serwer odpowiada 429 `za_duzo_prob` z `Retry-After` i niczego nie zmienia:

| zmiana okolicy | koszt |
|---|---|
| `PUT /api/druzyna/start` | 1 |
| `POST /api/klatki` przez drużynę bez siedziby (nowa siedziba, np. po `DELETE /api/klatki/moje`) | 1, chyba że klatka leży najwyżej 1500 m od jej punktu startu: wtedy 0, więc nowa gra (PUT start, potem zajęcie siedziby przy tym samym adresie) kosztuje jedną zmianę |
| `DELETE /api/klatki/:klucz` siedziby, gdy drużyna ma jeszcze inne klatki (siedziba przechodzi na najstarszą z nich) | 1; przy wyczerpanym oknie 429 przed zwolnieniem |
| zwolnienie zwykłej klatki, jedynej klatki, `DELETE /api/klatki/moje` | 0 (po nich drużyna albo ma tę samą siedzibę, albo żadnej, a okolicę wyznacza punkt startu) |

Siedziba ma pierwszeństwo: drużyna, która ją ma, pyta wokół siedziby i punkt startu jest jej niepotrzebny (zmiana punktu niczego wtedy nie zmienia). Punkt startu to w praktyce adres gracza, więc leży tylko w pamięci procesu: nie ma go w bazie, w kopiach ani w dzienniku, znika razem z kontem, a po restarcie serwera (także planowym, `ZM_RESTART_H`) klient podaje go od nowa i do tego czasu dostaje 409 `brak_startu`. Wpis, z którego nikt nie korzysta przez czas życia sesji (30 dni), sprząta `sprzataj()`. Testy: `npm test -- serwer-okolica`.

## Wygasanie klatek i kont

Klatka nie jest na zawsze: drużyna, która nie grała 14 dni, traci wszystkie klatki (wracają do puli wolnych), ale zachowuje konto, zapis w chmurze i kod powrotu. Po powrocie gra wczytuje zapis, a klient próbuje zająć siedzibę od nowa (`poWczytaniu` w `src/net/gra.ts`): wolną zajmuje po cichu, a jeśli w międzyczasie zajęła ją inna drużyna, mówi o tym jednym komunikatem i gra toczy się dalej u siebie. Konto bez gry przez 180 dni znika razem z sesjami, klatkami, zapisem i kodem (kaskada kluczy obcych), a jego nick wraca do puli; z kopii bazy znika dopiero po `ZM_KOPIE_DNI` dniach (to też trzeba wpisać do informacji o danych osobowych). Stałe `KLATKI_DNI` i `KONTA_DNI` leżą w `src/net/protokol.ts`.

Grą (wizytą) jest każde żądanie z ważną sesją drużyny i każde logowanie (hasłem, kodem powrotu, nowa drużyna). `konta.ostatnio` ma dokładność doby, a nowe konto zaczyna od chwili założenia, więc granica to początek doby sprzed N dni: drużyna zawsze dostaje pełne N dni od ostatniej wizyty (po wizycie w poniedziałek wieczorem klatki wracają do puli dopiero o północy UTC we wtorek, dwa tygodnie i dzień później). Wygasanie liczy `sprzataj()` najwyżej raz na godzinę (serwer woła je co minutę razem ze sprzątaniem sesji), więc zwolnienie może się spóźnić o godzinę. Błąd wygasania idzie do dziennika i nie przerywa sprzątania; następna próba jest za godzinę. Testy: `npm test -- serwer-wygasanie`.

## Liczniki i powroty

Serwer liczy, ilu ludzi gra, bez wiedzy, kto to jest: dzienne sumy zdarzeń i powroty kont, bez ciasteczek śledzących, identyfikatora gracza i adresu IP. Wszystko leży w dwóch tabelach (migracja 3 w `server/baza.ts`): `liczniki (dzien, zdarzenie, n)` i `powroty (zalozone, po_dniach, n)`; `dzien` i `zalozone` to początki dób UTC w milisekundach. Żadna z nich nie wskazuje konta, więc po usunięciu konta zostaje tylko suma.

| wywołanie | co robi |
|---|---|
| `POST /api/zdarzenie` `{ "z": "…" }` | dolicza jedynkę do pary (dzisiejsza doba UTC, zdarzenie); 204. Bez sesji: endpoint nie czyta ciasteczka i niczego nie zapisuje poza zdarzeniem. Zdarzenie musi pasować do `ZDARZENIE_WZOR` z `src/net/protokol.ts`, inaczej 400 `zle_dane`. |
| `GET /api/liczniki?od=<ms>` z `Authorization: Bearer <token>` | `{ "liczniki": [{ "dzien", "zdarzenie", "n" }], "powroty": [{ "zalozone", "poDniach", "n" }] }`; `od` (domyślnie 0) odcina doby liczników i kohorty powrotów założone przed tą chwilą. |

Zdarzenia to `start:<zwykly|zombie>:<pl|en>:<tel|komp>` (start gry: tryb, język, telefon albo komputer), `cel:<klucz celu>` (krok ścieżki celów, np. `cel:R0.zaznacz`) i `dzien:2`, `dzien:3`, `dzien:7`. Więcej niż 120 przyjętych zdarzeń z jednego adresu w godzinę to 429 (odrzucone nie zużywają limitu; okno żyje w pamięci procesu, tak jak inne limity, i nie zapisuje adresu na dysk). Różnych `cel:` na dobę baza przyjmie 300 (`ROZNYCH_CELOW_NA_DZIEN`): endpoint jest otwarty, więc to bezpiecznik przed zaśmieceniem tabeli, a nie ograniczenie dla gry (ścieżka ma kilkadziesiąt celów). Nowy cel ponad limit dostaje 204 i jest pomijany; starty i dni mają wzór z garstką wartości, więc ich limit nie dotyczy. Liczniki mogą nadal zawyżać albo zaniżać sumy (każdy może wysłać znane zdarzenie, a limit 120 na godzinę za jednym adresem sieci komórkowej może ściąć kilku graczy naraz): to zgrubna miara, nie rozliczenie.

Powrót to pierwsza wizyta konta w danej dobie po dobie założenia. Serwer dolicza go w tym samym miejscu, w którym przesuwa `konta.ostatnio` na początek doby (`wizyta` w `server/app.ts`): żądanie z ważną sesją albo logowanie (hasłem, kodem powrotu), które pierwsze w dobie zmieni `ostatnio`, dopisuje jedynkę do `powroty` pod `(doba założenia, ile dób po założeniu)`. Drugie żądanie tej samej doby niczego nie zmienia, więc powrót liczy się raz na konto na dobę bez względu na to, którą drogą wszedł gracz, a doby założenia nie liczy się nigdy (nowe konto ma `ostatnio` równe chwili założenia, czyli już po północy). Doba to doba UTC, a nie 24 godziny: konto założone o 23:59 wraca „po 1 dniu” już po północy. Z tabeli wychodzą powroty po 1, 3 i 7 dniach: `n` dla `po_dniach = 1` (3, 7) podzielone przez liczbę kont założonych w tej dobie, czyli przez `SELECT COUNT(*) FROM konta WHERE utworzone >= <zalozone> AND utworzone < <zalozone> + 86400000` (konta usunięte albo wygasłe znikają z tej liczby, a ich powroty zostają w `powroty`).

Odczyt jest tylko z tokenem z `ZM_LICZNIKI_TOKEN`, porównywanym w stałym czasie (skróty SHA-256, jak sekret proxy). Bez tej zmiennej trasa `GET /api/liczniki` odpowiada 404, jakby jej nie było; zły albo brakujący token to 401, a po 10 złych próbach z jednego adresu w kwadrans 429. Token wymyślamy długi i losowy (`openssl rand -hex 32`), trzymamy go tylko w `.env` na serwerze i u siebie, nigdy w repo ani w logach; podaje się go w nagłówku, nie w adresie (adresy lądują w logach proxy). Odczyt z konsoli:

```bash
curl -s -H "Authorization: Bearer $ZM_LICZNIKI_TOKEN" "https://<adres api>/api/liczniki?od=$(($(date +%s) * 1000 - 7 * 86400000))"
```

Testy: `npm test -- serwer-liczniki`.

## Wyszukiwanie adresu

`GET /api/adres?q=<adres>&j=pl|en` szuka adresu za gracza, żeby fala graczy (np. z Reddita) nie zablokowała nam publicznego Nominatim, który pozwala na jedno zapytanie na sekundę i wymaga User-Agent z kontaktem. Bez sesji i bez ciasteczka, `j` to język etykiety (domyślnie `pl`). Odpowiedź ma kształt `WynikAdresu` z `src/net/protokol.ts`, czyli wynik geokodera z `src/world/osm.ts`:

```json
{ "lat": 54.4153, "lon": 18.5748, "label": "4, Obrońców Wybrzeża, Przymorze Małe, …", "area": "Przymorze Małe", "street": "Obrońców Wybrzeża", "city": "Gdańsk" }
```

| odpowiedź | kiedy |
|---|---|
| 200 `WynikAdresu` | adres znaleziony (z pamięci, Nominatim albo Photona) |
| 404 `nie_ma` | Nominatim (albo Photon, gdy Nominatim nie mógł odpowiedzieć) nie zna takiego adresu |
| 400 `zle_dane` | puste zapytanie, dłuższe niż 200 znaków (`ADRES_MAX_ZNAKOW`) albo język inny niż `pl` i `en` |
| 429 `za_duzo_prob` | więcej niż 30 zapytań na minutę z jednego IP (liczą się też trafienia w pamięć i zapytania błędne); dwadzieścia w kwadrans z akademika przechodzi bez problemu |
| 503 `serwer_zajety` | zawiodły i Nominatim, i Photon; klient pyta wtedy Nominatim sam |

Jak serwer to robi (`server/adres.ts`):

- **Pamięć.** Wyniki leżą w pamięci procesu pod kluczem SHA-256 znormalizowanego zapytania z językiem (wielkość liter, nadmiarowe spacje i rozłożone znaki nie mają znaczenia, więc „Obrońców Wybrzeża 4, Gdańsk” i „  obrońców  wybrzeża 4,  GDAŃSK ” to jeden wpis). Najwyżej 5000 wpisów: najstarszy odpada, trafienie przenosi wpis na koniec. Wynik z Nominatim żyje 30 dni, brak wyniku i wszystko z Photona dobę; awarii nie pamiętamy. Dwa takie same zapytania naraz to jedno zapytanie na zewnątrz. Po restarcie serwera pamięć jest pusta. Nie ma jej na dysku ani w bazie.
- **Kolejka do Nominatim.** Zapytania startują co najmniej 1100 ms po sobie. Które musiałoby czekać dłużej niż 3 s, idzie od razu do Photona (komoot, `photon.komoot.io`, język `en`; polski bez `lang`, bo Photon go nie zna). Po 429 albo 403 od Nominatim (blokada) serwer nie pyta go przez minutę, tylko Photon. Zapytanie do dostawcy trwa najwyżej 6 s.
- **Photon w zapasie.** Błąd, 429, zła odpowiedź albo przekroczony czas Nominatim to zapytanie do Photona; jego wynik ma te same pola, a etykieta jest składana z ulicy, numeru, dzielnicy i miasta (Photon bywa mniej dokładny, dlatego jego wyniki pamiętamy tylko dobę).
- **User-Agent.** `ZaMurem/1.0 (+https://zamurem.vercel.app; <ZM_KONTAKT>)`; bez `ZM_KONTAKT` bez części po średniku. Polityka Nominatim wymaga prawdziwego kontaktu, więc na produkcji `ZM_KONTAKT` ustawiamy (adres e-mail Mateusza albo strona z formularzem).
- **Prywatność.** Tekst zapytania wychodzi tylko w adresie URL do dostawcy. Serwer nie zapisuje go ani adresu IP, także w dzienniku błędów: gdy zawiodą oba dostawcy, do dziennika idzie jedna linia z samymi powodami (`adres: wyszukiwanie niedostępne (Nominatim: http 429; Photon: czas)`), najwyżej raz na minutę. Dostawcy widzą zapytania z adresu IP serwera, nie gracza.

Testy bez sieci (udawany `fetch`, zegar i czekanie w kolejce): `npm test -- serwer-adres`.

## Zmienne środowiskowe

| zmienna | domyślnie | co robi |
|---|---|---|
| `PORT` | 8787 | port HTTP |
| `HOST` | 127.0.0.1 (w kontenerze 0.0.0.0) | adres nasłuchu |
| `ZM_BAZA` | `./za-murem.db` (w kontenerze `/dane/za-murem.db`) | plik SQLite; `:memory:` na próbę |
| `ZM_ZRODLA` | puste | dozwolone nagłówki Origin po przecinku, np. `https://twoja.domena`; wzór może mieć gwiazdkę za jeden kawałek nazwy hosta (`[a-z0-9-]+`, bez kropki), np. `https://zamurem-*-konto.vercel.app` dla podglądów gałęzi na Vercelu; puste: ta sama strona co nagłówek Host |
| `ZM_ZAUFANE_PROXY` | 0 (w kontenerze 1) | 1: adres klienta z ostatniego wpisu X-Forwarded-For; tylko za własnym proxy |
| `ZM_PROXY_SEKRET` | brak | sekret, który Vercel wysyła w nagłówku `x-zm-proxy`; żądanie z dobrym sekretem ma adres klienta z nagłówka `ZM_PROXY_IP`, bez sekretu albo ze złym ten nagłówek się nie liczy; wartość tylko w `.env` na serwerze i w zmiennych Vercela, nigdy w repo ani w logach |
| `ZM_PROXY_IP` | `x-real-ip` | nagłówek z adresem klienta, któremu serwer ufa przy dobrym `ZM_PROXY_SEKRET` |
| `ZM_LICZNIKI_TOKEN` | brak | token odczytu `GET /api/liczniki` (nagłówek `Authorization: Bearer`); bez niego trasa odpowiada 404; wartość tylko w `.env` na serwerze, nigdy w repo ani w logach |
| `ZM_KONTAKT` | brak | adres kontaktowy (e-mail albo strona) w User-Agent, którym serwer przedstawia się Nominatim przy wyszukiwaniu adresów; polityka Nominatim go wymaga; tylko w `.env` na serwerze i w zmiennych wdrożenia, nigdy w repo |
| `ZM_CIASTECZKO_SECURE` | 1 | 0: ciasteczko sesji bez Secure (lokalnie po http) |
| `ZM_LIMIT_ZAPISU` | 3145728 | największy zapis gry w bajtach JSON |
| `ZM_LIMIT_KLATEK` | 60 | najwięcej klatek na konto |
| `ZM_PROMIEN_M` | 600 | najdalej od siedziby drużyny w metrach |
| `ZM_KLATKI_DNI` | 14 | po ilu dniach bez gry klatki drużyny wracają do wolnych (konto, zapis i kod powrotu zostają) |
| `ZM_KONTA_DNI` | 180 | po ilu dniach bez gry konto znika razem z sesjami, klatkami i zapisem |
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

Za Vercelem (statyczna gra na Vercelu przekazuje `/api/*` na ten serwer) przez Caddy przychodzą adresy serwerów Vercela, a nie graczy, więc limity prób liczyłyby wszystkich graczy razem. Dlatego z `ZM_PROXY_SEKRET` serwer ufa nagłówkowi `ZM_PROXY_IP` (domyślnie `x-real-ip`) tylko wtedy, gdy żądanie ma nagłówek `x-zm-proxy` równy sekretowi (porównanie w stałym czasie). Bez sekretu albo ze złym nagłówek z adresem się nie liczy i działa dotychczasowa kolejność: `ZM_ZAUFANE_PROXY` (X-Forwarded-For), potem adres połączenia. `GET /api/zdrowie` w polu `ip` mówi, która ścieżka zadziałała (`proxy`, `xff` albo `polaczenie`), bez samego adresu; tak sprawdzamy po wdrożeniu, czy Vercel naprawdę przekazuje sekret. Podglądy gałęzi na Vercelu mają Origin w postaci `https://projekt-<gałąź>-<zespół>.vercel.app`, więc `ZM_ZRODLA` dostaje wzór z gwiazdką zamiast listy adresów.

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
