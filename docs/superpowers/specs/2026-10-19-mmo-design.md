# Gra sieciowa w czasie rzeczywistym: ocena stanu i projekt

Stan: ocena i projekt z 19.10.2026 (noc). Nocny integrator (w zastępstwie Mateusza, po niezależnej recenzji) przyjął go jako kierunek; prędkość świata, miejsce startu drużyny i zamarzanie światów nieobecnych zostają do decyzji Mateusza. Etap 0 można budować. Spisany w sesji „Odkrywanie mapy i multiplayer” na gałęzi `claude/map-exploration-multiplayer-fccdf2`. Mateusz śpi i zostawił decyzje nocnemu integratorowi (sesja „Nocna integracja projektu”), więc etap 0 akceptuje integrator, a resztę Mateusz przegląda rano. Przed oddaniem dokument przeczytał recenzent w roli budującego.

Źródło: rozmowa z Mateuszem w nocy z 18 na 19.10.2026 i projekt kierunku rozwoju z 18.10.2026. Jego słowa są w cudzysłowie (mówił głosem, powtórzenia wycięte). Reszta to moje rozstrzygnięcia, oznaczone „(moje)”, zebrane na końcu.

## Po co

Pierwsza prośba: „postawić serwer, który będzie się restartował co 48 godzin sam albo w trakcie deploymentu tyle razy, ile trzeba będzie. Albo bez tego restartu na razie, ale tak, żeby to było tak spięte, żeby ten Hetzner dawał nam możliwość zakładania kont użytkownika i gry sieciowej. To jest już rozbudowane, więc to musimy ocenić na takim etapie.”

Potem wizja: „Multiplayer będzie o tyle ciężki, że mamy z jednej strony możliwość grania, tak że ludzie będą sobie wysyłali wiadomości i będą mogli prowadzić dyplomację na mapie świata, a z drugiej potrzebujemy serwera, który pozwoli grać na uśrednionej prędkości bez aktywnej pauzy wszystkim ludziom, tak już rzeczywiście, gdzie ich ruchy będą zsynchronizowane jak w MMO.”

I o restarcie: „Świat trwa bez końca, restart co 48 godzin tylko odświeża serwer i nic nie kasuje.”

Z 18.10.2026 (projekt kierunku rozwoju): „Kusi mnie, żeby to była gra na jednej planszy, gdzie robimy trochę MMO pixelartowe, ale to chyba już wymaga innego podejścia.” O nocy w grze sieciowej: „Pracują zautomatyzowani i bronią terenu zgodnie z rozporządzeniem władz, część śpi.” Wśród anty-celów tamtego dokumentu: „Gra sieciowa karze za sen” i „Gra zdradza innym graczom, kto gdzie mieszka”.

## Ocena: co już jest

Projekt etapu 1 i 2: `docs/superpowers/specs/2026-10-18-multiplayer-design.md`. Stan na `main` b424828:

- Serwer (`server/`): Node 24 bez zależności z npm, `node:http` i `node:sqlite` w trybie WAL. Konta z nickiem i hasłem (scrypt), sesja w ciasteczku HttpOnly ze skrótem w bazie, zajęte klatki z kluczami wspólnymi dla graczy, zapis w chmurze z wersją, usunięcie konta kaskadą, limity prób, ochrona przed CSRF (Origin, JSON). Zamyka się czysto na SIGTERM i SIGINT.
- Wdrożenie: kontenery `za-murem-www` i `za-murem-api` na `cergo-rw-prod`, obok produkcyjnego stosu cergo, za jego Caddy, z `restart: unless-stopped`. Wdraża się ręcznie skryptem `deploy/hetzner/wdroz.sh` z komputera Mateusza (build, rsync, `docker compose up --build`). CI wdraża tylko GitHub Pages.
- Gra: model asynchroniczny. Każdy gra swoją symulacją w przeglądarce, serwer trzyma konta, klatki i zapisy. Start w swojej klatce, start bez domu, gdy ktoś ją zajął, zajmowanie kolejnych klatek, znaczniki, zapis w chmurze. Wszystko za przełącznikiem `?siec=1`, bo brakuje informacji o danych osobowych z firmą Mateusza jako administratorem.
- Symulacja jest deterministyczna, trzyma kolejkę poleceń w stanie i chodzi w Node, więc serwer może ją liczyć sam. W decyzjach są `Math.hypot`, `sin` i `cos` (31 miejsc z `Math.hypot` w `src/sim/sim.ts`), które w różnych silnikach JS mogą dawać inny ostatni bit, i nikt jeszcze nie sprawdził, czy Chrome, Firefox i Safari liczą tę samą grę tak samo.
- Zarząd liczy się co sekundę przy ekranie, bez pauzy i bez otwartego okna, a karta nocy czeka na decyzję gracza. Na świat bez pauzy to się nie nadaje.

Co z prośby już działa: konta na Hetznerze i gra sieciowa asynchroniczna (za przełącznikiem). Restart po awarii robi Docker. Czego brakuje: wspólnego świata w czasie rzeczywistym, wiadomości i dyplomacji, życia drużyny pod nieobecność gracza, restartu bez utraty stanu świata (dziś nie ma czego tracić, bo świata na serwerze nie ma), kopii bazy, osobnej maszyny pod liczenie świata, informacji o danych osobowych i nowego logowania (e-mail i magic link, o które Mateusz prosił 18.10 rano).

## Cele

- Trwały świat na serwerze, który biegnie bez pauzy ze wspólną prędkością dla wszystkich. Gracze w nim są zsynchronizowani.
- Restart serwera co 48 godzin i przy każdym wdrożeniu bez utraty czegokolwiek; gracz traci połączenie na kilka sekund i wraca do tej samej chwili świata.
- Drużyna żyje dalej, kiedy gracz śpi: pracuje i broni się według rozporządzeń, a gra nie karze za sen.
- Wiadomości i dyplomacja między drużynami na mapie miasta.
- Konta na serwerze, gra wymaga konta tylko w świecie sieciowym.
- Gra jednoosobowa zostaje taka, jaka jest: pauza, własne tempo, Pages, dema, gra bez sieci.

## Nie-cele (na teraz)

- Ranking, sezony, czyszczenie świata (świat trwa bez końca).
- Wolny czat bez moderacji.
- Kilka serwerów świata naraz i przenoszenie drużyn między nimi.
- Gra sieciowa na telefonie bez połączenia.

## Anty-cele (porażka, nawet jeśli działa)

- Gracz wraca rano i nie ma czego ratować.
- Gra zdradza innym graczom, kto gdzie mieszka (anty-cel z kierunku rozwoju).
- Restart albo wdrożenie kasuje albo cofa świat.
- Klient i serwer widzą inny świat i nikt tego nie wykrywa.
- Gra jednoosobowa traci pauzę albo własne tempo.
- Liczenie świata spowalnia produkcyjny cergo na tej samej maszynie.

## Model (moje)

### Dwa tryby

Gra jednoosobowa zostaje bez zmian. Świat sieciowy to osobny tryb na ekranie startowym: wymaga konta, nie ma pauzy ani przyspieszania, liczy go serwer. To samo `src/sim` i ten sam zarząd w obu trybach.

### Kto liczy: serwer i klienci krok w krok

Serwer liczy symulację świata (ten sam kod w Node) w stałym rytmie i jest jej właścicielem. Klient dostaje przy wejściu stan świata, a potem strumień poleceń z numerem kroku, w którym mają zadziałać, i liczy u siebie te same kroki z małym opóźnieniem (około pół sekundy), żeby rysowanie było płynne. Polecenia gracza idą do serwera, który sprawdza, czy gracz może nimi rządzić (tylko swoją drużyną), nadaje im numer kroku i rozsyła. Co kilka sekund serwer wysyła skrót stanu, a klient z innym skrótem doczytuje stan od nowa.

Dlaczego nie przesyłanie stanu: symulacja już jest deterministyczna i oparta na poleceniach w stanie, więc krok w krok wykorzystuje to, co jest, a przesyłanie stanu wymagałoby nowego protokołu dla całego `SimState` i rysowania częściowego stanu. Ryzyko to determinizm między silnikami JS, dlatego etap 0 go mierzy, a poprawki wchodzą przed etapem 1.

Silniki od startu świata sieciowego: Chromium (Chrome, Edge), WebKit (Safari, w tym każda przeglądarka na iPhonie) i Firefox (moje). Etap 1 rusza, gdy narzędzie z etapu 0 przechodzi we wszystkich trzech i w Node 24; rozbieżność w którymś to najpierw poprawka w `src/sim`, a doczytanie stanu po rozjeździe jest tylko siatką bezpieczeństwa (w pomiarze rzadziej niż raz na 10 minut gry na klienta). Próba recenzenta z 19.10 w nocy: JavaScriptCore z macOS i Node (V8) dały te same skróty przez około 115 dni gry na trzech demach, choć same `Math.hypot`, `atan2`, `exp`, `cos`, `sin` i `log` różnią się w 2–37% wywołań; Firefox niesprawdzony.

Narzędzie z etapu 0 zostaje stałą bramką (`npm run determinizm` z kodem wyjścia), bo miasto z kwadratów zaraz przepisuje `src/sim`; od etapu 2 miasta z kwadratów wchodzi do jego bramki.

Transport: strumień zdarzeń serwera (SSE, `text/event-stream`) do klienta i zwykłe `POST` z poleceniami. Bez zależności z npm, działa przez Caddy, sam się wznawia po zerwaniu. WebSocket dopiero, jeśli opóźnienie poleceń okaże się za duże.

Przy wielu drużynach w jednym świecie (etap 3) klient nie zmieści całego miasta. Wtedy liczy krok w krok tylko kwadraty w swoim zasięgu, a stan kwadratu wchodzącego w zasięg doczytuje od serwera. To wymaga, żeby kwadraty były od siebie możliwie niezależne (projekt miasta z kwadratów, przejścia przez granice tylko krokiem pionka) i zostaje do projektu etapu 3.

### Czas świata

Prędkość jest jedna i ustawiona w konfiguracji świata. Rekomendacja: 5 kroków na sekundę zamiast 20 przy 1×, czyli doba gry w około 64 minuty realne, a ludzie idą wtedy około 1 m/s, prawie jak naprawdę (moje, do decyzji). Od tej liczby zależy balans głodu i zimna na godzinę realną, więc trzeba ją ustalić przed strojeniem.

Restart i wdrożenie: serwer zapisuje stan świata do bazy co 5 minut realnych i przy zamknięciu, a po starcie wczytuje go i dolicza kroki, które minęły w czasie przerwy (kilkanaście sekund to kilkadziesiąt kroków, liczone w ułamku sekundy). Świat nie stoi i niczego nie traci. Restart co 48 godzin to zmienna środowiskowa, po której serwer kończy się czysto, a Docker podnosi go od nowa.

Leniwe liczenie (moje): w etapach 1 i 2 światy drużyn są od siebie niezależne i deterministyczne, więc świat drużyny, której gracza nie ma, serwer może zdjąć z pamięci i przy powrocie gracza albo przy zdarzeniu od innej drużyny (wiadomość, handel) doliczyć brakujące kroki od zapisanego stanu. Wynik jest bit w bit taki sam jak przy liczeniu na żywo, a koszt zależy od graczy obecnych, nie od zapisanych. Próba recenzenta: około 16 MB pamięci na wczytany świat, ułamek milisekundy na krok, doliczanie 7 do 20 tysięcy kroków na sekundę (8 godzin nieobecności przy 5 krokach na sekundę to 7 do 25 sekund). Doliczanie idzie w tle po wylogowaniu i w spokojnych chwilach serwera, żeby powrót był szybki. Świat drużyny nieobecnej dłużej niż 7 dni zamarza i rusza od tej chwili, gdy gracz wróci (do decyzji Mateusza, z progiem w konfiguracji: to wyjątek od „świat trwa bez końca”, ale bez niego powrót po miesiącu to 11 do 31 minut doliczania przy 7 do 20 tysiącach kroków na sekundę). W etapie 3 (wspólne kwadraty) aktywne kwadraty liczą się na żywo.

### Co dziś zatrzymuje grę

W świecie sieciowym nic z tego nie może zatrzymać świata; okna stają się nakładkami, a decyzje zarządu czekają do ustalonego czasu. Dziś w `src/main.ts` grę zatrzymują (`pauseGame`): okna zarządu (karta nocy o 20:00, uchwały, wydarzenia, raport poranny), spotkanie z lokatorami, Menu, potwierdzenia z menu poleceń, pytanie o spalenie mebla, mapa miasta (decyzja 8 jej projektu), koniec gry; do tego przycisk pauzy i przyspieszanie do 8×. Zarząd liczy się tylko przy ekranie, bez pauzy i bez otwartego okna.

### Pod nieobecność gracza

Drużyna działa według rozporządzeń (warta, koza, racje, nocą wszyscy za siatką). Rozporządzenia to osobny projekt, którego jeszcze nie ma: projekt pracy ludzi ich nie obejmuje. Karta nocy i wydarzenia zarządu czekają na gracza do ustalonego czasu, a potem idą według rozporządzeń. Po kilku godzinach nieobecności drużyna przechodzi w tryb obronny: bez wypraw, wszyscy w obrębie siatki, a napór szwendaczy i napadów na nieobecnych jest słabszy (na start połowa, do strojenia). Zarząd liczy się w świecie sieciowym w czasie gry, a nie w sekundach przy ekranie.

### Dyplomacja i wiadomości

- Drużyny widzą się na mapie miasta (z projektu mapy miasta), ale tylko w kwadratach, które same odkryły, i pod pseudonimem drużyny, nie nickiem.
- Na start gotowe propozycje zamiast wolnego tekstu: sojusz, nieagresja, handel (wymiana zapasów jako wyprawa z czasem dojścia), wojna, zgoda, odmowa i kilka gotowych zdań. Wolny tekst dopiero razem z informacją o danych, zgłaszaniem, blokowaniem i czasem przechowywania.
- Wiadomości to dane osobowe nadawcy i odbiorcy, więc ten etap nie wychodzi na serwer bez informacji o danych osobowych i decyzji o tym, gdzie drużyna zaczyna (niżej).

### Prywatność: gdzie drużyna zaczyna

Dziś drużyna zaczyna pod adresem gracza, a inni widzą tylko „zajęte przez inną drużynę”. W świecie z dyplomacją inni widzą drużynę, jej pseudonim i teren, czyli zwykle okolicę domu gracza. Dwie możliwości do decyzji Mateusza przy informacji o danych:

- drużyna zaczyna pod adresem domu jak dziś, z wyraźną informacją przy wejściu do świata, że inni zobaczą teren drużyny pod jej pseudonimem;
- w świecie sieciowym drużyna zaczyna w wybranym albo przydzielonym miejscu swojego miasta, a pod domem gra się tylko w grze jednoosobowej (rekomendacja, bo spełnia anty-cel bez wyjątków).

### Wspólna siatka

Wspólny świat wymaga jednej siatki kwadratów dla całego miasta, a gra jednoosobowa ma mapę wyśrodkowaną na adresie i obróconą do ścian domu. Świat sieciowy dostaje układ miasta (stały punkt odniesienia i jeden obrót, na przykład z globalnej siatki pikseli kafelków z `src/world/klucze.ts`), a model kwadratów bierze układ jako parametr (projekt miasta z kwadratów). Cena: w części dzielnic ściany będą ukośne, bo obrót nie pasuje do każdego osiedla.

### Serwer świata

- Osobny proces i kontener od API kont (`za-murem-swiat`), żeby liczenie świata nie spowalniało logowania i zapisów. Wspólne konta przez tabelę sesji albo wewnętrzne zapytanie do API (do wyboru w etapie 1).
- Osobna mała maszyna na Hetznerze przed wdrożeniem etapu 1, nie `cergo-rw-prod` (rodzaj, architektura i cena do sprawdzenia przed zakupem, zgoda Mateusza). Cel etapu 1 do pomiaru: 50 drużyn zapisanych, 10 graczy naraz (moje). Wzorcem jest Node 24 na architekturze tej maszyny; pomiary na Macu są orientacyjne.
- Kopie bazy codziennie (`VACUUM INTO`) na tym samym wolumenie, z przechowywaniem kilku dni: chronią przed pomyłką, nie przed utratą dysku albo maszyny. Kopia poza maszyną (miejsce, dostęp, koszt) to decyzja Mateusza. Usunięcie konta znika z kopii po czasie przechowywania, co trzeba napisać w informacji o danych.
- Sprawdzanie zdrowia jest już w `server/Dockerfile` (`HEALTHCHECK`). Sam Docker bez orkiestratora tylko oznacza kontener jako niezdrowy i go nie restartuje; zawieszony serwer łapie dopiero restart co 48 godzin albo osobny strażnik, którego na razie nie robimy.
- Wdrożenie dalej skryptem; automatyczne wdrażanie z GitHub Actions wymaga klucza w ustawieniach repozytorium, więc tylko po decyzji Mateusza.

### Konta

Dziś nick i hasło. Mateusz chciał e-mail, login i magic link, do czego potrzebny jest dostawca wysyłki poczty (wybór i konto po stronie Mateusza) i informacja o danych z danymi jego firmy. Rekomendacja: nick i hasło w etapach 0 i 1 (test za przełącznikiem), magic link jako osobne małe zadanie przed otwarciem świata dla wszystkich.

## Etapy (moje)

0. Fundament: stała bramka determinizmu (`npm run determinizm`) w Chromium, Firefoksie, WebKicie (także systemowy `jsc` na Macu, bez pobierania) i Node na tym samym przebiegu gry (skróty co godzinę gry, pierwsza rozbieżność, jaka funkcja ją daje), raport z uporządkowaną listą poprawek do `src/sim` (wprowadzi je etap 2 miasta z kwadratów albo sesja zaraz po nim, bo w tym czasie `src/sim` przerabia tamten etap) i z kosztem siatki bezpieczeństwa (rozmiar stanu, czas zapisu i skrótu); restart co zadaną liczbę godzin; codzienne kopie bazy z przechowywaniem; pomiar pamięci na wczytany świat, czasu kroku, zapisu i wczytania stanu oraz szybkości doliczania kroków. Bez wdrożenia.
1. Świat drużyny na serwerze: trwały świat jednej drużyny w stałym rytmie bez pauzy, klient krok w krok przez SSE i `POST`, skróty i doczytanie stanu, zapis stanu co 5 minut i dogonienie kroków po restarcie, leniwe liczenie światów nieobecnych z doliczaniem w tle i zamarzaniem po 7 dniach, zarząd w czasie gry z czekaniem na decyzję i rozporządzeniami po czasie, tryb obronny pod nieobecność. Wymaga projektu rozporządzeń (osobnego, jeszcze go nie ma), decyzji o prędkości i bramki determinizmu zielonej we wszystkich trzech silnikach i w Node 24.
2. Dyplomacja na mapie miasta: pseudonimy drużyn, widoczność w odkrytych kwadratach, gotowe propozycje, handel jako wyprawa, powiadomienia. Wymaga informacji o danych osobowych i decyzji o miejscu startu.
3. Wspólne kwadraty: kilka drużyn w jednym świecie z siatką miasta, stan drużyny oddzielony od stanu kwadratów, walka i napady między drużynami, klient liczący tylko kwadraty w zasięgu. Wymaga miasta z kwadratów (etapy 1 do 3 tamtego projektu).

## Ograniczenia

- Twarde zasady z `CLAUDE.md`: nic na zewnątrz bez OK Mateusza (wdrożenie, push na `main`, zakup maszyny), tokenów i kluczy nigdy w repo, stos cergo nietknięty (zmieniamy tylko `/srv/za-murem` i nasz blok w jego Caddyfile).
- Serwer bez zależności z npm, Node 24, SQLite.
- Symulacja deterministyczna, w Node, bez `Math.random`; sieć nigdy nie wchodzi w środek kroku, tylko jako polecenie z numerem kroku.
- Gra jednoosobowa, Pages i dema bez zmian.

## Kontrakt i podział pracy, etap 0

Pliki (moje): nowe `tools/determinizm.ts` i `tools/determinizm/` (przebieg gry w przeglądarkach przez Playwright, w systemowym `jsc` i w Node, porównanie skrótów, nagrywanie wywołań `Math`), strona testowa uruchamiana przez serwer Vite w procesie jak w `tools/shots.ts`, `tools/pojemnosc.ts`, raport `docs/ocena/determinizm-silnikow.md`; zmiany w `server/main.ts` (restart po zadanym czasie, harmonogram kopii), nowe `server/restart.ts` i `server/kopie.ts`, `deploy/hetzner/compose.yml` i `compose.obok.yml` (nowe zmienne), `server/README.md`, `deploy/hetzner/README.md`, `package.json` (skrypt `determinizm`), `CLAUDE.md` (komenda w sekcji „Komendy”), testy serwera. Bez zmian w `src/sim`, `src/render` i `src/world`, bo te pliki należą w tym czasie do etapów 1 i 2 miasta z kwadratów.

Pobieranie: Firefox i WebKit dla Playwright oraz Node 24 (lokalnie albo obraz `node:24-alpine` z uruchomionym Dockerem) wymagają zgody Mateusza. Do tego czasu bramka liczy Chromium, `jsc` i lokalny Node, a raport mówi, czego brakuje.

## Bramka etapu 0

- `npm test`, Biome na `src tests tools server index.html`, `npm run build`, boty z tymi samymi skrótami co na `pelna-gra` (etap 0 nie rusza gry).
- `npm run determinizm` kończy się kodem 0 przy zgodzie, 1 przy rozbieżności (z numerem godziny i funkcją w raporcie), 2 przy braku silnika, w budżecie kilku minut; każdy silnik dwa razy daje te same skróty.
- Testy serwera: restart po zadanym czasie (z udawanym zegarem), kopia bazy i usuwanie starych kopii (w katalogu tymczasowym), serwer bez nowych zmiennych działa jak dziś.
- Raport z liczbami pojemności (bez progu zaliczenia, cel do porównania: 50 drużyn, 10 graczy naraz) i z listą poprawek determinizmu.
- Nic nie wdrożone.

## Decyzje do przejrzenia

1. Świat trwa bez końca, restart co 48 godzin tylko odświeża serwer (Mateusz).
2. Drużyna pod nieobecność gracza pracuje i broni się według rozporządzeń (Mateusz, 18.10; rozporządzenia to osobny projekt, jeszcze go nie ma); tryb obronny i słabszy napór na nieobecnych (moje, liczby do strojenia).
3. Gra jednoosobowa zostaje, świat sieciowy to osobny tryb z kontem.
4. Serwer liczy świat, klienci krok w krok przez SSE i `POST`, skróty i doczytanie stanu po rozjeździe.
5. Prędkość świata: 5 kroków na sekundę, doba w około 64 minuty (do decyzji integratora, potem Mateusza).
6. Kolejność etapów 0 do 3.
7. Dyplomacja najpierw z gotowymi propozycjami, wolny tekst później.
8. Miejsce startu w świecie sieciowym: rekomendacja „wybrane albo przydzielone miejsce w mieście”, decyzja Mateusza przy informacji o danych.
9. Świat sieciowy na siatce miasta, gra jednoosobowa na siatce domu.
10. Osobny kontener i osobna maszyna na liczenie świata, kopie bazy z przechowywaniem kilku dni.
11. Konta: nick i hasło do czasu informacji o danych, magic link osobnym zadaniem.
12. Silniki od startu: Chromium, WebKit i Firefox; etap 1 rusza dopiero przy zielonej bramce determinizmu we wszystkich trzech i w Node 24, doczytanie stanu to tylko siatka bezpieczeństwa.
13. Leniwe liczenie światów nieobecnych drużyn w etapach 1 i 2 (ten sam wynik co na żywo), doliczanie w tle; świat drużyny nieobecnej ponad 7 dni zamarza do jej powrotu (do decyzji Mateusza).
14. Zapis stanu świata co 5 minut realnych i przy zamknięciu; cel pomiarów etapu 1: 50 drużyn, 10 graczy naraz.
15. Kopie bazy na tym samym wolumenie chronią przed pomyłką; kopia poza maszyną to decyzja Mateusza (miejsce, dostęp, koszt). Sprawdzanie zdrowia zostaje w `server/Dockerfile`, bez strażnika restartującego zawieszony serwer.

## Zostawione budującemu

- Szczegóły protokołu strumienia (format zdarzeń, co ile skrót, jak duże opóźnienie bufora) w etapie 1.
- Jak strona testowa etapu 0 uruchamia symulację bez rysowania w przeglądarce i jak duży przebieg wystarczy, żeby pomiar coś znaczył.
- Godzina kopii i liczba dni przechowywania (domyślnie 7).
