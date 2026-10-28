# Wyjście na świat: projekt

Stan: projekt z rozmowy z Mateuszem 28.10.2026, gałąź `wyjscie-na-swiat` od `main` bebf5391, bez kodu. Słowa Mateusza są w cudzysłowie (mówił głosem, literówki poprawione). Reszta to moje rozstrzygnięcia, oznaczone „(moje)” i zebrane na końcu w „Rozstrzygnięciach do przejrzenia”.

Projekt obejmuje pięć wątków, które razem dają premierę: zarabianie, sieć od pierwszego wejścia, hosting, samouczek i film na Reddita. Są od siebie zależne (film pokazuje sieć, samouczek uczy sieci, sieć potrzebuje hostingu z jednym adresem), więc idą jednym dokumentem z kolejnością budowy na końcu.

## Po co

Mateusz: „Pora wypchnąć tą moją grę na świat i zacząć na niej zarabiać.” Gra stoi dziś na GitHub Pages (wersja 1.0 z PR #11 i #12) i na serwerze testowym na `cergo-rw-prod` (https://za-murem.5-75-147-27.sslip.io/). Gra sieciowa (konta, zajmowanie klatek, start bez domu, zapis w chmurze) jest zbudowana według `docs/superpowers/specs/2026-10-18-multiplayer-design.md`, ale schowana za `?siec=1`, bo brakuje informacji o danych osobowych z firmą Mateusza jako administratorem.

Sukces po pierwszym miesiącu: „Gra w to powiedzmy 50-100 osób i wpada mi jakieś 100 dolarów. To jest sensowne, ale im więcej, tym lepiej.” Na start jednak bez płatności: „Zacznijmy od totalnego free to play i zobaczymy, czy w ogóle ktoś będzie chciał grać w to za darmo.” Pierwszy miesiąc mierzymy więc liczbą graczy i powrotów, a pieniądze to następny projekt.

## Cele

- Gra jest sieciowa od pierwszego wejścia, bez przełącznika `?siec=1` i bez zakładania konta.
- Zajęta klatka należy do drużyny, która ją zajęła. Mateusz: „jak ktoś sobie rezerwuje dany lokal, to to jest jego lokal”.
- Gracze widzą się na mapie całego miasta, asynchronicznie. Mateusz: „na razie niech gracze mogą widzieć się ze sobą na mapie miasta”, „może to być asynchroniczne”.
- Od razu wiadomości i handel między drużynami. Mateusz: „Fajnie, jakby ludzie mogli już do siebie wysyłać wiadomości i handlować od razu.” Wiadomości to gotowe zwroty, nie wolny tekst (Mateusz wybrał „Gotowe zwroty”). Wiadomości i handel działają z każdą drużyną na świecie, nie tylko z mapy miasta (Mateusz wybrał „Z całym światem”), bo przy kilkudziesięciu graczach rozsianych po świecie prawie nikt nie miałby nikogo w zasięgu mapy.
- Gra pod ładnym adresem bez kupowania czegokolwiek. Mateusz: „domena jest tam lipna”, „nie chcę się nic kupować”. Nazwa zostaje „Za Murem” w obu językach (Mateusz: „Zostaje Za Murem”), adres `zamurem.vercel.app` albo najbliższy wolny.
- Samouczek, o którym wiadomo, że jest dopracowany. Mateusz: „ja w sumie to sobie radzę, tylko tak, żeby to było pewne, że jest to dopracowane.” Sprawdza go agent na ślepo i licznik po premierze, bez testów z ludźmi (Mateusz: „Bez ludzi”).
- Nowy film na Reddita, który zaczyna się od ulicy (Mateusz: „Tak, ulica na start”) i pokazuje to, co Mateusz wymienił: „możliwość grania na mapie, gdzie są jeszcze inni ludzie, zajmowania terenu, walki z zombie albo z bakterią i dynamicznych rozgrywek, drzewka rozwoju, badań i może sneak peek z finału gry, jak wygląda właśnie ścieżki zwycięstwa”.
- Liczenie graczy, żeby wiedzieć, czy cel z „Po co” się spełnia.

## Nie-cele (na teraz)

- Płatności, wsparcie, sklep, Steam, itch.io jako sklep.
- Gra w czasie rzeczywistym, wspólna symulacja na serwerze, MMORTS. Mateusz: „ciężko będzie synchronizować aktywną pauzę”, „ludzie muszą spać, więc nie chciałbym przekombinować na tym etapie gry”. Projekt `docs/superpowers/specs/2026-10-19-mmo-design.md` i etap 0 na `mmo-fundament` czekają.
- Wolny tekst w wiadomościach i wolne nazwy drużyn (moje: obie rzeczy wymagają moderacji).
- Własna domena, Cloudflare, przenoszenie serwera kont na Vercel.
- Logowanie e-mailem i magic linkiem (prośba Mateusza z 18.10.2026 rano; moje: odkładam, uzasadnienie w części 2).
- Polska wersja filmu i muzyka w filmie (już w Zaparkowanych z 25.10.2026).
- Testy samouczka z ludźmi.

## Anty-cele (porażka, nawet jeśli działa)

- Z gry, z serwera albo z odpowiedzi API da się powiązać osobę (nick, konto) z budynkiem, zobaczyć czyjś nick przy klatce lub na mapie, albo zebrać zajęte klatki z całego miasta. Że jakaś anonimowa drużyna gra z danej klatki, sąsiad może się domyślić, bo na tym stoi zajmowanie klatek (moje, szczegóły w części 3).
- Człowiek z Reddita musi wypełnić formularz, zanim zobaczy swoje osiedle.
- Ktoś, kto zagrał raz z ciekawości, blokuje sąsiadom klatkę na zawsze.
- Na starcie mapa miasta jest pusta i gra wygląda na martwą.
- Fala z Reddita kończy się blokadą wyszukiwania adresów przez Nominatim albo przeciążeniem maszyny, na której stoi produkcja cergo.
- Pojawia się jakikolwiek płatny serwis albo rachunek bez OK Mateusza.
- Gra bez sieci (serwer leży, brak internetu po wczytaniu, dema) przestaje działać albo pokazuje błędy.
- Film obiecuje coś, czego gracz z linku nie znajdzie w grze.

## Ograniczenia

- Twarde zasady z `CLAUDE.md`: nic na zewnątrz bez OK Mateusza (push na `main`, wdrożenia, posty, podpięcie Vercela do repo, założenie projektu na Vercelu), żadnych tokenów w repo, atrybucja map zawsze widoczna, mieszkańcy zmyśleni, symulacja deterministyczna i chodząca w Node, nowe pola `SimState` z domyślną wartością w konstruktorze `Sim`, zrzuty w Playwright przed „działa”, `/v03/` dalej działa.
- Stos cergo nietknięty: zmieniamy tylko nasze kontenery i nasz blok w jego Caddyfile, jak w `deploy/hetzner/README.md`.
- Serwer zostaje taki, jaki jest: Node 24 bez zależności z npm, `node:sqlite`, nowa wersja schematu to nowy wpis w `MIGRACJE` w `server/baza.ts`.
- Zmiany w symulacji z zewnątrz (towar od kuriera, zajęcie klatki) idą przez kolejkę poleceń w stanie i działają od następnego kroku.
- Darmowy plan Vercela (Hobby) jest według regulaminu Vercela tylko do użytku niekomercyjnego. Póki gra nic nie sprzedaje, to wystarcza; przy płatnościach trzeba będzie przejść na płatny plan albo gdzie indziej (sprawdzić ceny i regulamin wtedy, nie teraz).

## Część 1: hosting

Mateusz o Vercelu: „Nie wiem, czy cokolwiek da. To też może być spoko.” Vercel daje tu jedną konkretną rzecz za darmo: ładny adres i przekazywanie `/api` do naszego serwera, więc gra i serwer to dla przeglądarki jedna witryna. Same Pages tego nie umieją, a ciasteczko sesji (`HttpOnly`) między dwiema witrynami Safari i coraz częściej Chrome blokują; anonimowa drużyna z części 2 stoi na tym samym ciasteczku. Mateusz ma już konto na Vercelu (zespół „Mateusz's projects”).

- Pliki gry (wynik `npm run build`, razem z `dist/v03/`) na Vercelu, projekt `zamurem`, wdrożenie produkcyjne z `main`, podgląd dla każdej gałęzi (moje).
- `vercel.json` przekazuje `/api/*` na serwer na Hetznerze (rewrite do zewnętrznego adresu). Projekty Vercela założone po 6.04.2026 domyślnie zapamiętują w CDN odpowiedzi z takiego przekazania, jeśli serwer ich nie zabroni, więc każda odpowiedź `/api` dostaje `Cache-Control: no-store` (po stronie serwera, niezależnie od Vercela).
- Serwer za Vercelem widzi adresy Vercela. Limity prób i ochrona przed CSRF muszą dostać prawdziwy adres klienta i nowe źródło: Vercel dokleja do przekazanych zapytań tajny nagłówek, a serwer ufa nagłówkowi z adresem klienta tylko z tym sekretem. Sekret nie trafia do repo: `vercel.json` ma przekierowanie w `routes` z przekształceniem `request.headers` (operacja `set`), którego wartość Vercel bierze ze zmiennej środowiskowej podanej w polu `env` (tak opisuje to dokumentacja Vercela, rozdział o rewrites; sprawdzić przy budowie). Zapytania prosto na adres sslip.io bez sekretu liczą się po adresie połączenia, jak dziś. `ZM_ZRODLA` dostaje adres produkcyjny Vercela. Dziś `ZM_ZAUFANE_PROXY=1` bierze ostatni wpis X-Forwarded-For, czyli za Vercelem i Caddy byłby to adres Vercela. Funkcje i middleware Vercela nie są potrzebne; gdyby jednak były, budujący pyta Mateusza.
- Produkcja i podglądy idą na różne serwery API bez osobnych plików: przekierowanie na serwer produkcyjny ma warunek `has` na host produkcyjny, reszta trafia na testowy (moje; albo zmienne środowiskowe osobne dla Production i Preview, jeśli Vercel je tu podstawia).
- Dwa serwery API na tej samej maszynie (moje): produkcyjny dla `main` i testowy dla podglądów gałęzi i dla dzisiejszego adresu testowego, każdy z własną bazą. Podglądy gałęzi nie mogą zajmować klatek ani handlować w bazie prawdziwych graczy.
- Wyszukiwanie adresu przez nasz serwer (moje): `/api/adres` pyta Nominatim z własnym User-Agent z adresem kontaktowym, pilnuje jednego zapytania na sekundę, pamięta wyniki, a przy kolejce albo błędzie pyta Photon (komoot), tak jak przewiduje GDD. Bez serwera (dema, offline) gra pyta jak dziś. Kafelki OpenFreeMap zostają pobierane wprost z przeglądarki.
- GitHub Pages: strona przekierowuje na nowy adres (moje). Workflow Pages zostaje albo znika, do decyzji budującego, byle `agentsmill.github.io/za-murem` nie zostało martwym linkiem.
- Serwer testowy i `deploy/hetzner/wdroz.sh` zostają dla API. Kontener `za-murem-www` może zostać jako adres testowy.

## Część 2: sieć od pierwszego wejścia

Bazą jest model asynchroniczny z `2026-10-18-multiplayer-design.md`: każdy gra swoją symulacją w przeglądarce, serwer trzyma konta, klatki, zapisy, a teraz też wiadomości i oferty handlu. Wszystko z tamtego projektu zostaje (klucze klatek, start bez domu, zajmowanie kolejnych klatek do 600 m, odświeżanie co dwie minuty), z tymi zmianami:

- Bez `?siec=1`. Gra z serwerem jest sieciowa od pierwszego wejścia. Gra bez serwera (dema bez sieci, serwer leży) działa jak dziś, bez komunikatów o błędach.
- Anonimowa drużyna (moje). Przy pierwszym wejściu serwer zakłada konto bez nicku i hasła i daje długą sesję w ciasteczku. Tabela `konta` dziś wymaga nicku i hasła, więc migracja musi to rozluźnić.
- Kod powrotu zamiast nicku i hasła (moje, zmiana względem rozmowy). Ciasteczko ginie częściej, niż się wydaje: przeglądarka w aplikacji Reddita i karta prywatna mają własne, a gracz na starcie nie wie, że powinien coś ustawić. Gra pokazuje więc kod powrotu drużyny w Menu i sama proponuje go zapisać po pierwszej nocy. Kod wpisany na karcie startowej w innej przeglądarce wraca do tej samej drużyny, klatek i zapisu. Konta z nickiem i hasłem sprzed premiery działają dalej.
- Usunięcie drużyny z Menu, z potwierdzeniem, bez hasła (dziś `DELETE /api/konto` wymaga hasła, którego konto anonimowe nie ma).
- Konto bez gry przez 180 dni znika razem z klatkami i zapisem (moje). Ten okres wchodzi do informacji o danych osobowych.
- Logowanie e-mailem i magic linkiem odkładam (moje): bez e-maili gra zbiera mniej danych osobowych, nie potrzebuje dostawcy poczty i nie ma formularza przed graniem. Wraca, gdy będą płatności.
- Klatka wygasa po 14 dniach bez gry (moje): serwer zwalnia klatki konta, którego `ostatnio` jest starsze niż 14 dni. Gdy drużyna wraca po wygaśnięciu, jej zapis wczytuje się jak przy zajętej klatce (start bez domu albo zajęcie od nowa, jeśli wolna); szczegóły powrotu zostawiam budującemu, byle gra nie stawała.
- Tryby: klatki, mapa miasta, wiadomości i handel są wspólne dla trybu zwykłego i zombie (moje). Znacznik drużyny pokazuje tryb. Klatki dotyczą prawdziwych budynków, więc nie ma sensu, żeby ten sam blok był wolny w jednym trybie i zajęty w drugim.
- Informacja o danych osobowych i regulamin gry z firmą Mateusza jako administratorem, dostępne z karty startowej i z Menu. Budujący pisze szkic z miejscami na dane firmy (moje). Mateusz podaje dane firmy (pełna nazwa, adres, NIP, e-mail do spraw danych) i zatwierdza tekst; czy sprawdza go prawnik, decyduje Mateusz.
- Przełącznik `?siec=1` znika najpierw na serwerze testowym (zmienna środowiskowa w buildzie), więc części 3–6 można budować i sprawdzać, zanim przyjdą dane firmy. Na produkcji przełącznik znika dopiero po zatwierdzeniu informacji o danych (moje).

## Część 3: drużyny na mapie miasta

Mateusz: „mamy z jednej strony jakby naszą mapę miasta, a z drugiej strony możemy przejść do mapy całego miasta jako szerszego zakresu geograficznego. Więc na tym mogą się widzieć gracze.” Mapa miasta (`src/ui/miasto.ts`) ma dziś okolicę 720 m z miejscami do wypraw i tło całego miasta z kafelków niższego poziomu.

- Na mapie całego miasta są znaczniki drużyn. Znacznik nie stoi na budynku, tylko na środku kwadratu stałej siatki globalnej o boku około 400 m, takiej samej dla wszystkich graczy (moje; budujący wybiera siatkę, np. kafelki Web Mercator z=16 albo siatkę metrową od stałego punktu). Kilka drużyn w jednym kwadracie to jeden znacznik z listą.
- Zaokrąglenie robi serwer, zanim cokolwiek wyśle. Dokładne `lat` i `lon` cudzych klatek nie wychodzą z serwera do mapy miasta.
- Dziś `GET /api/klatki` oddaje dokładne pozycje zajętych klatek w dowolnym prostokącie, byle z sesją, a przy anonimowych kontach sesję ma każdy. Serwer zawęża więc to zapytanie do okolicy własnej siedziby (mapa 384 m z zapasem, który gra już bierze na klatki uciętych budynków), a drużynie bez siedziby do okolicy punktu startu nowej gry, z limitem zmian punktu startu na dobę (moje). Kto chce zebrać zajęte klatki z całego miasta, musiałby zakładać konta i grać w każdym miejscu.
- Przy znaczniku: nazwa drużyny, tryb, ile dni gry drużyna przetrwała. Nic więcej. Nicku nie pokazujemy nigdy.
- Nazwa drużyny składana z gotowych kawałków w klimacie gry, po polsku i po angielsku, z przyciskiem „losuj od nowa” (moje). W rozmowie zaproponowałem nazwy wymyślane przez gracza, ale to wolny tekst widoczny dla wszystkich, czyli to samo, czego unikamy w wiadomościach.
- Świadomie zostaje to, co jest dziś: sąsiad widzi, że klatka jest zajęta przez jakąś drużynę, i przy jednej drużynie w kwadracie może zgadnąć jej klatkę. Nie wie jednak, kto to jest, bo nazwa jest wylosowana, nicku nie ma, a wiadomości to gotowe zwroty.
- Mapa nie może być pusta na starcie. W rozmowie powiedziałem, że zaludnią ją osady AI. Dziś osada AI działa tylko za `?osada=1`, w grze bez sieci i bez trybu zombie, więc to wymaga pracy. Budujący wybiera, czym wypełnić mapę (osada AI, obce ekipy z gry, inne NPC), byle NPC były wyraźnie oznaczone jako NPC. NPC są na mapie tylko znacznikami: nie odpowiadają na wiadomości i nie handlują (Mateusz wybrał handel z całym światem zamiast odpowiadających NPC).
- Okolica 720 m dalej pokazuje miejsca do wypraw; znaczniki drużyn mogą tam być, ale z tym samym zaokrągleniem.

## Część 4: krótkofalówka (wiadomości)

- Wiadomość to gotowy zwrot w klimacie gry, wysyłany przez krótkofalówkę do dowolnej drużyny na świecie. Drużynę wybiera się ze znacznika na mapie miasta albo z listy „w eterze”: wszystkie drużyny posortowane po odległości, z nazwą, trybem, dniami przetrwania i odległością w przedziałach (w okolicy, w mieście, do 50 km, dalej), bez nazwy miasta ani kraju (moje). Zwroty składane z kawałków: komu, co, opcjonalnie rzecz i liczba. Kilkadziesiąt zwrotów, po polsku i po angielsku; odbiorca widzi zwrot w swoim języku (moje).
- Przykłady kierunku: „Stado idzie od wschodu”, „Mamy nadmiar desek”, „Dzięki za pomoc”, „Szukamy leków”, „Uwaga na szabrowników”. Zwroty o stadzie dostaje tylko drużyna w trybie zombie (moje).
- Asynchronicznie: wiadomość czeka na serwerze i przychodzi, kiedy odbiorca gra, jako zdarzenie w grze (dymek albo okno krótkofalówki z historią).
- Limit wysyłek na dzień i wyciszenie drużyny przez odbiorcę (moje). Gotowe zwroty nie wymagają zgłaszania treści.

## Część 5: handel

- Drużyna wystawia ofertę dowolnej drużynie na świecie, wybranej z mapy miasta albo z listy „w eterze” (część 4): tyle tej rzeczy za tyle tamtej. Rzeczy z magazynu zarządu (drewno, deski, złom, części, jedzenie, leki i to, co budujący uzna za sensowne); bez ludzi i bez broni na start (moje).
- Towar znika z magazynu wystawiającego w chwili wystawienia (polecenie w kolejce symulacji) i czeka na serwerze, więc nie da się obiecać czegoś, czego się nie ma.
- Odbiorca przyjmuje albo odrzuca, kiedy zagra. Przy przyjęciu jego towar też znika poleceniem.
- Towar przynosi pod bramę kurier, ta sama postać co handlarz pod bramą z `m2-surowce`, z inną treścią okna. Droga trwa w czasie gry tego, kto odbiera: dzień w okolicy i w mieście, dwa dni do 50 km, trzy dni dalej (moje). Zapłata wraca do wystawiającego tak samo przy jego najbliższej grze.
- Oferta bez odpowiedzi wraca po 3 dniach prawdziwego czasu. Limit otwartych ofert i wielkości oferty (moje).
- Symulacja liczy się w przeglądarce, więc da się dopisać sobie towar i wysłać go dalej. W darmowej grze psuje to tylko równowagę; limity wystarczą. Pełna ochrona przyjdzie dopiero z serwerem, który sam liczy świat.
- Stare zapisy i gra bez sieci działają bez zmian (nowe pola stanu z domyślną wartością).

## Część 6: liczenie

- Serwer liczy dzienne sumy bez ciasteczek śledzących i bez danych osobowych (moje): starty gry (tryb, język, telefon albo komputer), dojście do każdego kroku ścieżki celów, pierwsza przeżyta noc, dzień 3 i dzień 7. Zapis jako licznik „zdarzenie, dzień”, bez identyfikatora gracza.
- Powroty bez nowych danych o graczu (moje): przy pierwszej aktywności konta w danym dniu (dzień z `ostatnio` sprzed aktualizacji jest wcześniejszy niż dziś) serwer dopisuje jedynkę do licznika „dzień założenia, ile dni od założenia”. Wychodzą z tego dokładne powroty po 1, 3 i 7 dniach, a w bazie nie przybywa nic o konkretnym koncie poza tym, co już jest w `konta`.
- Odczyt dla Mateusza prosty, do decyzji budującego (adres API z tokenem ze zmiennej środowiskowej albo skrypt przez ssh).

## Część 7: samouczek

Ścieżka celów jest zbudowana: R0 do R8 i okazje O1 do O8 (`src/ui/sciezka.ts`, `src/ui/sciezka-rozdzialy.ts`, `src/ui/sciezka-okazje.ts`), wiki w grze, bot `npm run bot:cele`.

- Nowe okazje dla sieci (moje): start bez domu (szukanie wolnej klatki przed zmrokiem), pierwsza wiadomość z krótkofalówki, pierwsza oferta handlu, pierwsze otwarcie mapy całego miasta. Po polsku i po angielsku, z testami jak reszta ścieżki.
- Ślepy test przed premierą (moje): agent gra jak nowy gracz, bez dostępu do kodu, tylko przez ekran w Playwright. Po angielsku, na komputerze i na telefonie (390×844), w trybie zwykłym i zombie. Od wejścia z linku przez wpisanie prawdziwego adresu i pierwszą noc do trzeciego dnia gry. Zapisuje każde zawahanie: podpowiedź o czymś, czego nie widać, przycisk niewidoczny na telefonie, cel bez jasnego powodu.
- Miara „dopracowane” (moje): pierwsze sensowne kliknięcie najdalej 30 s od pokazania mapy, pierwsza noc najdalej po 5 minutach przy 1×, zero miejsc, w których agent nie wie, co zrobić. Poprawki i powtórka testu, aż przejdzie czysto. Wynik do `docs/ocena/`.
- Po premierze licznik z części 6 pokazuje, na którym kroku ścieżki ludzie odpadają.

## Część 8: film na Reddita

Narzędzie `tools/promo.ts` jest na gałęzi `promo-film` (dwa commity, nie na `main`): nagrywa prawdziwą grę klatka po klatce na zatrzymanym zegarze Playwrighta, z napisami i planszami jako nakładką w stronie, w 16:9 i 9:16. Dzisiejszy film (49 s) zaczyna się od matki z ugryzionym synem; widok osiedla z lotu ptaka przychodzi w 15. sekundzie, a sieci, terenu, badań i dróg zwycięstwa nie ma.

Nowy montaż (moje, poza pierwszymi sekundami, które ustalił Mateusz):

- 0–3 s: płaska mapa ulicy zamienia się w pikselowe osiedle, kamera zjeżdża do bloku, napis w stylu „I typed in my address”.
- 3–10 s: życie osiedla w ujęciach po około 2 s: rąbanie, koza, ciepłe okno nocą.
- 10–25 s: lista Mateusza: mapa miasta z innymi drużynami, zajęcie klatki (w stylu „Claim your stairwell before your neighbour does”), wiadomość z krótkofalówki, stado pod siatką, tablica badań.
- 25–38 s: zajawka końcówki: ekran dróg zwycięstwa i ujęcie z późnej gry (stan np. z `npm run bot:cele`, który dochodzi do R8 w 10 dniach gry).
- 38–45 s: plansza z nowym adresem gry, „Free, in your browser, no sign-up” i atrybucją map.
- Formaty: około 45 s w 16:9 na Reddita i YouTube, około 20 s w 9:16 na TikToka, Reels i Shorts, pętla 6–8 s (sam adres zamieniający się w osiedle) na r/WebGames i r/pixelart, osobny film około 15 s z matką pod bramą na TikToka.
- Karty z gęstym tekstem tylko na ułamek sekundy albo powiększone; napisy czytelne na telefonie w 9:16.
- Nagrywamy po częściach 1–5. Ujęcia z innymi drużynami na serwerze testowym z drużynami testowymi; wszystko, co film pokazuje, musi być w grze pod linkiem.
- Nowe teksty postów w miejsce `posty.md` z `promo-film`, z nowym adresem. Posty wrzuca Mateusz sam.

## Kolejność budowy

1. Hosting (część 1). Podpięcie Vercela do repo i założenie projektu dopiero po OK Mateusza.
2. Informacja o danych osobowych (czeka na dane firmy od Mateusza), anonimowa drużyna, wygasanie klatek, zdjęcie `?siec=1`, liczenie (części 2 i 6).
3. Drużyny na mapie miasta (część 3).
4. Krótkofalówka i handel (części 4 i 5), mogą iść równolegle, jeśli nie ruszają tych samych plików.
5. Samouczek: nowe okazje i ślepy test do skutku (część 7).
6. Film i posty (część 8).
7. Premiera: PR do `main` scala Mateusz, wpis w „Następnych” w `docs/POSTEP.md`, Mateusz wrzuca posty.

## Co zostaje budującemu

Schematy tabel i adresy API, dokładna siatka znaczników, listy zwrotów i kawałków nazw drużyn, liczby limitów, czas trwania sesji anonimowej, wygląd okien krótkofalówki i handlu, czym wypełnić mapę na starcie (byle NPC były oznaczone), sposób odczytu liczników, co z workflow Pages, dokładna lista ujęć i napisów filmu.

## Rozstrzygnięcia do przejrzenia przez Mateusza

1. Anonimowa drużyna zamiast obowiązkowego konta; do przeniesienia gry kod powrotu zamiast nicku i hasła (zmiana względem rozmowy); konto bez gry przez 180 dni znika.
2. Magic link e-mailem odłożony do płatności.
3. Klatka wygasa po 14 dniach bez gry.
4. Znacznik na kwadracie około 400 m, z nazwą drużyny, trybem i dniami przetrwania; zapytanie o zajęte klatki tylko w okolicy własnej siedziby albo punktu startu.
5. Nazwy drużyn składane z gotowych kawałków zamiast wymyślanych (zmiana względem tego, co zaproponowałem w rozmowie).
6. Klatki, mapa, wiadomości i handel wspólne dla obu trybów.
7. Handel bez ludzi i broni na start; kurier pod bramę po 1–3 dniach gry zależnie od odległości; lista „w eterze” z odległością w przedziałach, bez nazwy miasta.
8. Dwa serwery API (produkcyjny i testowy) na jednej maszynie.
9. Wyszukiwanie adresów przez nasz serwer z pamięcią i Photonem w zapasie.
10. Liczenie dziennych sum bez identyfikatora gracza, powroty z licznika przy pierwszej aktywności dnia.
11. Kolejność ujęć filmu po pierwszych trzech sekundach i dodatkowe formaty.
12. Szkic informacji o danych i regulaminu pisze budujący; `?siec=1` znika najpierw na serwerze testowym, na produkcji po zatwierdzeniu tekstu.
