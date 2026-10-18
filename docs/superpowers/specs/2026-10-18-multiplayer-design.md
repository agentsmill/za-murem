# Gra sieciowa (multiplayer): projekt

Projekt z prośby Mateusza z 18.10.2026, 1:30. Jego słowa: „marzy mi się taki multiplayer, gdzie ludzie mogą założyć sobie swoje konto, zacząć grę w swoim domu i zajmują kolejne. Jeśli ktoś zaloguje się na ten adres, ale będzie to już zajęte, to on i jego drużyna będą bez domu na początku. Będą musieli go znaleźć szybko. To znaczy, że ktoś już zajął ich klatkę.” To zmienia wcześniejszą decyzję „bez backendu i kont” (Mateusz sam o to prosi). Wszystko inne poniżej to moje decyzje; te, które powinien przejrzeć Mateusz, są zebrane na końcu w sekcji „Decyzje do przejrzenia przez Mateusza”.

Etap 1 (ta noc, gałąź `mp-serwer`): ten projekt, klucze budynków i klatek wspólne dla graczy, serwer z kontami, zajętymi klatkami i zapisem w chmurze, klient API. Gra jeszcze z tego nie korzysta. Etap 2: spięcie z grą na połączonej gałęzi (ekran startowy, start bez domu, „Zajmij klatkę”, znaczniki zajętych).

## Po co

Gra stoi na prawdziwych adresach, więc sąsiedzi naprawdę grają na tej samej mapie. Wspólna mapa zajętych klatek robi z tego wyścig o osiedle bez kosztów gry w czasie rzeczywistym: ktoś z twojego bloku był pierwszy, więc zaczynasz na ulicy i musisz przed nocą znaleźć sobie inną klatkę. Konto daje też zapis w chmurze, czyli tę samą grę na telefonie i na komputerze.

## Cele

- Konto: nick i hasło, nic więcej. Logowanie na ekranie startowym, gra bez konta działa jak dziś.
- Start na adresie: klatka z drzwiami siedziby wolna, więc zostaje siedzibą drużyny; zajęta, więc drużyna zaczyna bez domu i szuka wolnej klatki.
- Zajmowanie kolejnych klatek w swojej okolicy, a inni widzą je jako zajęte.
- Jedna klatka ma jeden klucz u wszystkich graczy, niezależnie od tego, z jakiego adresu ktoś ją ogląda i jak obrócona jest jego siatka.
- Zapis gry w chmurze, jeden na konto.
- Symulacja zostaje deterministyczna i działa w Node bez przeglądarki i bez sieci.
- Gra na GitHub Pages i dema offline działają bez serwera, tak jak dziś.

## Nie-cele (na teraz)

- Gra w czasie rzeczywistym: cudzych ludzi na mapie, wspólnej symulacji, walki i handlu między drużynami nie ma.
- Czat, znajomi, sojusze, ranking.
- E-mail, odzyskiwanie hasła, logowanie przez Google i podobne.
- Zajmowanie całego osiedla jednym kliknięciem: klatki zajmuje się po kolei, w grze.

## Anty-cele (porażka, nawet jeśli działa)

- Gracz widzi cudzy nick przy zajętej klatce albo da się z serwera wyciągnąć, kto mieszka gdzie. Inni widzą tylko „zajęte przez inną drużynę”.
- Odpowiedź serwera zmienia przebieg gry w środku kroku symulacji albo gra przestaje działać bez sieci.
- Dwóch graczy patrzy na ten sam blok i ich gry nie zgadzają się, czy klatka jest zajęta.
- Gra na Pages pokazuje błędy sieci, bo serwera tam nie ma.

## Jak to działa

### Model asynchroniczny

Każdy gracz gra swoją deterministyczną symulacją w przeglądarce, tak jak dziś. Serwer nie symuluje niczego. Trzyma konta, sesje, zajęte klatki i zapisy. Inne drużyny istnieją w mojej grze tylko jako zajęte klatki: zamknięte drzwi, światło w oknach nocą, napis „zajęte przez inną drużynę”. Drużyny nie spotykają się na mapie.

### Klucze budynków i klatek (`src/world/klucze.ts`)

Numer budynku w świecie, kafelki i drzwi zależą od środka mapy (adresu), obrotu siatki do kierunku ścian i zaokrągleń geometrii do pół metra, więc dwóch graczy z różnych adresów ma ten sam blok pod innym numerem i w trochę innym miejscu siatki. Identyfikator OSM też nie wystarczy: kafelki OpenFreeMap sklejają budynki o tych samych atrybutach w jeden obiekt bez numeru, więc na kafelkach testowych numer ma mniej niż połowa budynków (Przymorze 25 z 64, Zielonki 8 z 42).

Klucz liczymy więc z obrysu w globalnych pikselach kafelków (poziom 14, 4096 pikseli na kafelek, około 0,35 m). Wierzchołki z kafelków są tam liczbami całkowitymi, takimi samymi u każdego, kto pobrał te kafelki. `toGeoT` (kafelki) i `toGeo` (Overpass, z wierzchołkami zaokrąglonymi do tej samej siatki) liczą przed zaokrągleniem do pół metra dwa tagi budynku:

- `zm:klucz` = „px:X:Y:DX:DY”: najwyższy wierzchołek obrysu (przy remisie najbardziej zachodni) i przesunięcie do najniższego (przy remisie najbardziej wschodniego). Dwa różne budynki o tych samych skrajnych wierzchołkach musiałyby na siebie nachodzić.
- `zm:os` = oś klatek „x1,y1,x2,y2”: dłuższa oś najmniejszego prostokąta opisanego na obrysie, przez jego środek, od zachodu na wschód.

Rachunek używa tylko dodawania, mnożenia, dzielenia i pierwiastka, a wynik idzie przez `toFixed`, więc każdy silnik JS daje ten sam napis.

Klatki: każdy budynek ma max(1, round(długość osi / 20 m)) klatek równej długości (20 m jak w `findEntrances`), niezależnie od typu budynku w świecie, bo typ zależy od rastra i u dwóch graczy potrafi wyjść inny (na kafelkach testowych około 3% budynków). Klucz klatki to „klucz budynku/numer”, od 1 od zachodniego końca osi. Pozycja klatki to środek jej odcinka osi w stopniach; ta sama u wszystkich, więc serwer może po niej odpowiadać na pytania o prostokąt.

Drzwi ze świata (`Entrance`) dostają klucz klatki, w której leży ich rzut na oś (obrót siatki cofamy jak w `rotateGeo`). Test (`tests/unit/klucze.test.ts`) buduje świat trzech adresów z kafelków testowych z prawdziwego środka i z trzech przesuniętych o 110–160 m, także z siatką obróconą o 16,7° względem pierwszej:

- klucz budynku: ten sam dla każdej pary tych samych budynków, także uciętych brzegiem mapy,
- lista klatek z pozycjami: ta sama,
- klucze drzwi: te same, kiedy oba światy postawiły w budynku tyle drzwi, ile ma klatek. Dziś tak jest w 86–95% budynków stojących w całości na obu mapach (wszystkie domy, większość bloków). Reszta to sklepy, szkoły i hale z jednymi drzwiami na kilka klatek i bloki, w których `findEntrances` zaokrągla długość z rastra inaczej niż oś. Tam dwoje drzwi trafia czasem do jednej klatki, a klatka bywa bez drzwi.

Ten sam budynek z Overpass ma ten sam klucz co z kafelków w 39 z 40 budynków Przymorza (oś w 36 z 40); kafelki bywają uproszczone o piksel. Overpass to zapas, gdy kafelki nie odpowiadają, więc wystarczy dopasowanie po pozycji klatki (niżej).

Znane słabe miejsca, rzadkie: budynek przecięty granicą kafelków daleko od jednego z graczy (ten gracz nie ma drugiej części), zmiana obrysu w OSM (nowy klucz po aktualizacji kafelków), demo i zapisy sprzed kluczy (bez tagów, więc bez klucza: gra sieciowa tylko na prawdziwym adresie).

### Przepływ startu

1. Ekran startowy pyta `GET /api/zdrowie`. Bez odpowiedzi (Pages, offline) nie ma sekcji gry sieciowej i wszystko jest jak dziś.
2. Z serwerem: „Graj z sąsiadami” z polami nick i hasło (załóż albo zaloguj). Można też grać bez konta.
3. Gracz wpisuje adres, gra buduje świat jak dziś (`buildWorld(geo, { seed })`, bez wiedzy o zajętych klatkach), liczy klucze (`kluczeSwiata`) i pyta o zajęte klatki w prostokącie mapy (`prostokatMapy`, z zapasem 150 m na klatki uciętych budynków).
4. Klatka z pierwszymi drzwiami siedziby (`w.buildings[w.hq].entrances[0]`) wolna: `POST /api/klatki` i drużyna zaczyna w siedzibie jak dziś. Ta klatka zostaje siedzibą drużyny na serwerze.
5. Zajęta przez inną drużynę (409 albo w odpowiedzi z prostokąta): drużyna zaczyna bez domu. Zarząd stoi na ulicy przed bramą swojego podwórka, które jest teraz cudze (brama zamknięta, drzwi siedziby zamknięte). Start jak dziś o 15:00, więc do karty nocy o 20:00 jest 5 godzin gry, przy 1× około 3 minuty. Cel na pasku: „Znajdźcie wolną klatkę przed zmrokiem”, wolne klatki w pobliżu mają znacznik. Noc bez dachu boli: zimno, szabrownicy, w trybie zombie stado. To jest to „szybko” z wizji.
6. Zajmowanie (pierwszej i kolejnych): gracz zaznacza ludzi, prawy przycisk na drzwiach wolnej klatki, „Zajmij klatkę”. Klient najpierw rezerwuje ją na serwerze (`POST /api/klatki`). Dopiero po 201 wysyła polecenie do symulacji; ludzie idą, wyważają drzwi i sprzątają (kilkanaście minut gry), klatka dostaje wnętrze i jest ich. Przy 409 drzwi dostają znacznik „zajęte przez inną drużynę” i nic się w grze nie dzieje. Pierwsza klatka drużyny jest siedzibą, kolejne muszą leżeć najwyżej 600 m od niej (cała mapa ma przekątną około 543 m).
7. Nowa gra (inny adres albo od nowa) zwalnia wszystkie klatki konta (`DELETE /api/klatki/moje`) przed zajęciem nowej siedziby. Wczytanie zapisu sprawdza `GET /api/klatki/moje` i porównuje z klatkami w stanie gry.
8. Co dwie minuty przy ekranie i przed każdym zajęciem gra odświeża zajęte w prostokącie mapy. Nowe cudze klatki wchodzą do gry poleceniem w kolejce.

Dopasowanie: klatka zajęta, gdy jej klucz jest na liście z serwera. Gdy klucza brak (inne źródło mapy, zmiana obrysu w OSM), zostaje pozycja: zajęta klatka z serwera, której środek leży do 6 m od środka mojej klatki, też liczy się jako zajęta.

### Determinizm

- Świat dalej wynika tylko z danych osiedla i ziarna. Zajęte klatki nie zmieniają `buildWorld`; klucze to czysta funkcja świata i tagów.
- Zajęte klatki wchodzą do symulacji tylko na dwa sposoby: jako jawne wejście startu (`createSim(w, seed, { siec: { bezDomu, obce } })`, zapisane w `SimState`) i jako polecenie w kolejce stanu (`sim.push(...)`: „zajmij klatkę” po odpowiedzi 201, „klatkę zajęła inna drużyna” po odświeżeniu), które działa od następnego kroku, tak jak dziś warta czy łatanie. Klient zamienia klucze na numery budynków i drzwi swojego świata, zanim cokolwiek trafi do symulacji.
- Symulacja nie importuje `src/net` i nigdy nie czeka na sieć. Bez serwera gra toczy się dalej; zajmowanie nowych klatek czeka wtedy na połączenie.
- Zapis gry ma w stanie wejście startu i wykonane polecenia, więc wczytanie i powtórka dają ten sam przebieg i ten sam `sim.hash()`. Boty i testy mogą podać zajęte klatki z pliku.
- To, co tylko widać (światło w cudzych oknach, napisy), trzyma rysowanie poza `SimState`.
- Wnętrze zajętej klatki wynika ze świata, numeru budynku i ziarna (`buildInterior`), więc w stanie wystarczy lista zajętych drzwi; wnętrza odtwarzają się przy wczytaniu.

### Serwer (`server/`)

Node 24 bez zależności z npm, TypeScript uruchamiany wprost jak `tools/`: `node:http`, `node:sqlite` (`DatabaseSync`), `node:crypto`, `node:zlib`. Kontener `node:24-alpine`, baza SQLite w wolumenie, przed nim Caddy z HTTPS na tej samej domenie co gra (gra jako pliki statyczne, `/api/*` do serwera). Uruchomienie i zmienne środowiskowe w `server/README.md`.

API pod `/api` (typy w `src/net/protokol.ts`, wspólnym dla serwera i klienta):

| metoda i ścieżka | co robi |
|---|---|
| `GET /api/zdrowie` | czy serwer żyje |
| `POST /api/konto` | załóż konto `{nick, haslo}` i zaloguj |
| `GET /api/konto` | kim jestem |
| `DELETE /api/konto` | usuń konto `{haslo}` razem z klatkami i zapisem |
| `POST /api/sesja`, `DELETE /api/sesja` | zaloguj, wyloguj |
| `GET /api/klatki?s=&w=&n=&e=` | zajęte klatki w prostokącie (cudze bez nicku: `moja: false`) |
| `POST /api/klatki` | zajmij `{klucz, budynek, lat, lon}`; 409, gdy zajęta |
| `GET /api/klatki/moje`, `DELETE /api/klatki/moje` | moje klatki, zwolnij wszystkie |
| `DELETE /api/klatki/:klucz` | zwolnij jedną |
| `GET`, `PUT`, `DELETE /api/zapis` | zapis gry w chmurze z wersją |

Baza: `konta` (nick, nick do porównań, skrót hasła, chwila założenia, dzień ostatniej wizyty), `sesje` (skrót tokenu, konto, termin), `klatki` (klucz klatki i budynku, środek klatki z dokładnością około 1 m, konto, czy siedziba, chwila zajęcia), `zapisy` (gzip JSON, rozmiar, wersja, chwila). Klucze obce z `ON DELETE CASCADE`.

Zapis w chmurze to ten sam obiekt co w localStorage, bez `data.addr` i `data.street`: klient je usuwa, a serwer odrzuca zapis, który je ma. `PUT` z wersją, którą klient ostatnio widział: nieaktualna daje 409, żeby telefon nie nadpisał nowszej gry z komputera. Limit 3 MiB JSON. Gra wysyła zapis co 5 minut przy ekranie i z Menu, nie co godzinę gry jak do localStorage.

Klient (`src/net/api.ts`): `fetch` do `/api` tej samej domeny z ciasteczkiem (`credentials: 'same-origin'`), wynik zawsze `{ok, dane}` albo `{ok: false, blad, komunikat}`, bez wyjątków. `serwerDostepny()` daje false na Pages, offline, po czasie i przy obcym serwerze.

### RODO

- Konto to nick i hasło. Bez e-maila, imienia, nazwiska, telefonu. Hasło tylko jako skrót scrypt.
- W bazie nie ma tekstu adresu: ani tego, co gracz wpisał, ani etykiety z geokodera, ani ulicy. Są natomiast pozycje zajętych klatek i w zapisie gry mapa okolicy z punktem adresu jako środkiem. To dane o miejscu, zwykle o domu gracza, powiązane z nickiem, więc traktujemy je jak dane osobowe: nikomu ich nie pokazujemy, nie udostępniamy i kasujemy na żądanie.
- Inni gracze widzą tylko, że klatka jest zajęta („zajęte przez inną drużynę”): bez nicku, numeru konta i daty. Zapytanie o prostokąt wymaga zalogowania i ma limit wielkości.
- Usunięcie konta (z hasłem) od razu kasuje konto, sesje, klatki i zapis. Klatki wracają do wolnych.
- Serwer nie zapisuje adresów IP ani w bazie, ani w dzienniku. Limity prób trzymają IP tylko w pamięci, a wpis znika po końcu okna (od minuty do godziny), najpóźniej przy cogodzinnym sprzątaniu.
- Nicków nikt poza właścicielem nie widzi, więc nie trzeba ich moderować.
- Kopie bazy zawierają te same dane, więc trzymamy je tak samo i kasujemy stare.

### Bezpieczeństwo

- Hasła: scrypt (N = 2^15, r = 8, p = 1, 32 MiB na jedno liczenie), sól 16 bajtów, porównanie w stałym czasie. Dla nieznanego nicku serwer liczy scrypt na atrapie, więc odpowiedź „Zły nick albo hasło” przychodzi w tym samym czasie i nie zdradza, które nicki istnieją. Hasło od 8 do 200 znaków i nie takie jak nick. Nick od 3 do 24 znaków: litery (także polskie), cyfry, kropka, podkreślnik, myślnik; bez względu na wielkość liter.
- Sesje: 32 losowe bajty w ciasteczku `zm_sesja` (HttpOnly, Secure, SameSite=Lax, Path=/api), w bazie tylko SHA-256. Ważna 30 dni, przedłuża się przy używaniu, najwyżej 10 sesji na konto, wylogowanie kasuje ją w bazie.
- CSRF: obok SameSite=Lax żądania zmieniające stan z danymi muszą mieć `application/json` (formularz z innej strony tego nie wyśle), a nagłówek Origin, jeśli jest, musi być z tej samej strony albo z listy `ZM_ZRODLA`. Serwer nie wysyła nagłówków CORS.
- Limity: ciało żądania 4 KiB (zapis gry 3 MiB), 10 nieudanych logowań na IP w 15 minut, 5 nowych kont na IP na godzinę, 300 żądań na IP na minutę, 60 zapisów na konto na godzinę, 60 klatek na konto, 600 m od siedziby, prostokąt najwyżej 0,05° na 0,08° i 2000 klatek w odpowiedzi.
- Tylko zapytania z parametrami (bez sklejania SQL). Odpowiedzi to JSON z `Cache-Control: no-store`, `nosniff` i CSP `default-src 'none'`. Gra pokaże nick przez `textContent`.
- Kontener jako użytkownik `node`, port tylko na `127.0.0.1`, X-Forwarded-For brany pod uwagę tylko za własnym Caddy. Brak zależności z npm, więc nie ma czego podmienić w łańcuchu dostaw.
- Klientowi ufamy co do przebiegu gry (to jego symulacja). Przerobiony klient może zająć klatkę bez chodzenia do niej, ale tylko w promieniu 600 m od swojej siedziby i najwyżej 60.

### Etap 2: spięcie z grą

Na połączonej gałęzi, po scaleniu M2 i trybu zombie:

- Ekran startowy: sekcja gry sieciowej (logowanie, zakładanie konta, wylogowanie, usunięcie konta, krótka informacja o danych), na telefonie zwinięta, żeby formularz adresu został na pierwszym ekranie (`start-telefon`).
- `vite.config.ts`: pośrednik `/api` do `127.0.0.1:8787` przy `npm run dev`.
- Symulacja: start bez domu (zarząd przy bramie, siedziba zamknięta), polecenia „zajmij klatkę” i „klatkę zajęła inna drużyna”, dom drużyny jako lista zajętych drzwi zamiast jednej siedziby (`houseOf`), wnętrze zajętej klatki z `buildInterior`. To największa część etapu 2, bo dziś symulacja zakłada, że dom to zawsze `w.hq`.
- Rysowanie: znacznik zajętych klatek, światło w cudzych oknach nocą, znaczniki wolnych klatek przy starcie bez domu.
- Zapis w chmurze w Menu i co 5 minut.
- Drzwi bloków w miejscach klatek z kluczy (`findEntrances` bierze liczbę i pozycje klatek z `zm:os`), żeby każde drzwi miały swoją klatkę u każdego gracza. Zmienia światy, więc stare zapisy zaczną się od nowa (zmienia się wnętrze siedziby, a z nim `worldKey`).
- Zrzuty w Playwright: logowanie, start bez domu, znaczniki zajętych, telefon.

### Na później

Gra w czasie rzeczywistym i cudzy ludzie na mapie, handel i napady między drużynami, czat, ranking. Wygasanie klatek kont nieaktywnych (propozycja: po 60 dniach bez logowania) i usuwanie kont nieaktywnych przez rok. Kody odzyskiwania zamiast e-maila. Sprawdzanie na serwerze, czy w promieniu kilku metrów nie ma już cudzej klatki pod innym kluczem. Przeniesienie klatek, gdy po zmianie w OSM zmieni się klucz. Kilka instancji serwera (limity prób w pamięci liczyłyby się osobno). Pocztówki z PixelLab i pamięć kafelków na tym samym serwerze (z „Zaparkowanych”).

## Ograniczenia

- Symulacja deterministyczna, bez `Math.random`, w Node bez sieci; bot i testy jak dotąd.
- Gra na Pages, dema i zapisy sprzed kluczy działają jak dziś, tylko bez gry sieciowej.
- Telefon 390×844: formularz adresu dalej na pierwszym ekranie.
- Atrybucja map bez zmian, postaci dalej zmyślone (RODO z CLAUDE.md).
- Serwer bez zależności z npm, jeden proces, jedna baza SQLite.

## Decyzje do przejrzenia przez Mateusza

1. Gra asynchroniczna: każdy gra swoją symulacją, wspólne są tylko zajęte klatki i konta. Cudzych ludzi na mapie nie ma.
2. Jednostka zajęcia to klatka: w bloku co 20 m osi budynku, dom jednorodzinny, sklep czy garaż to jedna klatka. Klatki liczone z obrysu, a nie z drzwi, które dziś stawia świat. W etapie 2 drzwi bloków przejdą na miejsca klatek, co zmieni światy i zacznie stare zapisy od nowa.
3. Start bez domu: zarząd na ulicy przed swoim (teraz cudzym) podwórkiem o 15:00, cel „wolna klatka przed zmrokiem”, noc bez dachu boli jak noc na zewnątrz. Zajęcie wymaga zgody serwera, więc bez sieci nie zajmuje się nowych klatek (gra toczy się dalej).
4. Pierwsza klatka to siedziba; kolejne najwyżej 600 m od niej, najwyżej 60 na drużynę.
5. Nowa gra zwalnia wszystkie klatki konta. Klatki kont nieaktywnych na razie nie wygasają (propozycja: 60 dni).
6. Konto bez e-maila, więc zapomniane hasło to stracone konto. Na ekranie zakładania konta trzeba to powiedzieć wprost.
7. W bazie nie ma tekstu adresu, ale są pozycje zajętych klatek i mapa okolicy w zapisie w chmurze, czyli w praktyce miejsce, gdzie gracz gra (zwykle dom). Potrzebna krótka informacja o danych przy zakładaniu konta (kto je trzyma, co jest w bazie, jak usunąć konto). Treść i administratora danych musi podać Mateusz.
8. Inni nigdy nie widzą nicku, nawet po najechaniu na klatkę.
9. Gra sieciowa tylko na prawdziwym adresie i tylko na domenie z serwerem. Pages i dema zostają grą jednoosobową.
10. Zapis w chmurze wysyłany co 5 minut i z Menu (localStorage dalej co godzinę gry); jeden zapis na konto.
11. Serwer: Node 24 i SQLite w jednym kontenerze za Caddy na Hetznerze, zamiast porównywanych w „Zaparkowanych” Cloudflare Workers czy Fly.io; wybrane przy prośbie o własny serwer.
