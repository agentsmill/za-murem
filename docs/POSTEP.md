# Dziennik postępu

Prowadzi Claude Code. Na końcu każdej sesji: co zrobione, co dalej, jakie decyzje zapadły i co odłożone.

## Zrobione

### Sesja 1, 16.10.2026 (gałąź `m0-fundament`, nic nie wypchnięte)

Ocena 0.3. Uruchomiłem 0.3 (przykład Przymorza) i 0.2 w Playwright. Zgadzam się z `docs/OCENA-v03.md`: w 0.3 przez 20 s na 4× mija 11 godzin gry i nikogo nie widać, a w 0.2 klikam Marka, klikam szopę i on idzie. Dopisuję trzy rzeczy. Bota `tools/simtest.js` nie ma w repo ani w historii, więc wzorzec balansu trzeba było odtworzyć. Symulacja 0.3 losuje przez `Math.random`, więc nie jest powtarzalna. Wersja 0.2 nie miała doctype ani deklaracji kodowania, dlatego poza artefaktem pokazywała krzaki zamiast polskich liter i zawieszoną nakładkę (tak samo na zrzucie `docs/ocena/06`). Dopisałem doctype, kodowanie i jedną regułę CSS, teraz `stare/za-murem-v02.html` działa samodzielnie.

M0 (fundament):
- Vite 8.3, TypeScript 7.0, PixiJS 8.22, Vitest 5, Playwright 1.64, Biome 2.5. Skrypty: `dev`, `build`, `test`, `lint`, `bot`, `bot:v03`, `shots`, `perf`, `demos`.
- Wersja 0.3 przeniesiona (`git mv`, historia zostaje) do `public/v03/`, działa pod `/v03/` także po buildzie (zrzut `v03`).
- Treść z `js/data.js` i 24 wydarzenia z `js/sim.js` jako moduły TypeScript (`src/content`). Test ładuje oryginalne pliki 0.3 do `node:vm` z podmienionym `Math.random` i porównuje dane, generator ludzi (300 ziaren) oraz każde wydarzenie z każdym wyborem na czterech stanach gry. Celowo wprowadzone błędy (liczba, tekst, prawdopodobieństwo) test łapie.
- `mvt.js` i `osm.js` przeniesione (`src/world`), z testami na kafelkach offline trzech adresów: dekoder i geometria identyczne z 0.3, klasy budynków jak w 0.3, sklejanie budynków na granicy kafelków (test łapie wyłączone sklejanie), Overpass, osiedle zapasowe.
- GitHub Actions: `ci.yml` (lint, testy, build na gałęziach) i `pages.yml` (build i wdrożenie z main). Czekają na OK.
- Dema offline (`public/demo/*.json`, 38–184 KB) i zrzuty pustej mapy 1 m dla trzech adresów (`npm run shots`).

Prototyp M1:
- Obrót mapy do kierunku ścian (histogram kątów krawędzi) i prostowanie budynków prawie równoległych do siatki. Siatka 384×384 m: teren, chodniki wzdłuż ulic, jezdnie z krawężnikami, budynki, drzewa, siedziba pod adresem, wejścia do klatek od strony chodnika. Świat buduje się w 9–29 ms.
- Grafika zapasowa w PixiJS: kawałki 32×32 m w dwóch poziomach szczegółów (32 i 8 px na metr), dachy z papy z kominami wentylacyjnymi, wyłazami i antenami, dachy z dachówki z kominem, fasady z oknami, balkonami i drzwiami, cienie, jesienne drzewa, ludzie w 16 wyglądach i 4 kierunkach.
- Symulacja ze stałym krokiem (20 kroków na sekundę przy 1×, godzina gry 40 s) i ziarnem. A* 8-kierunkowy bez ścinania narożników, regiony (spójne obszary). Rdzeń 4 osób z generatora 0.3, tłum z prostym spacerem.
- Sterowanie: klik zaznacza, ramka zaznacza kilku, prawy przycisk to „idź tu”, prawy lub środkowy przycisk z przeciąganiem przesuwa mapę, kółko przybliża, WASD, spacja, 1–3. Dotyk: stuknięcie zaznacza, stuknięcie w teren wysyła, jeden palec przesuwa, dwa przybliżają i przesuwają. Sprawdzone w Chromium: mysz (zrzut `ruch`) i dotyk w emulacji telefonu (zrzut `dotyk`).
- Noc na razie jako przyciemnienie ekranu.

Liczby:
- Testy: 189 zielonych. Build: 583 KB JS w 9 plikach (180 KB po gzip), z tego wejściowy 312 KB (100 KB); reszta to doładowywane części PixiJS.
- Wydajność (`npm run perf`, 150 pionków + 4 z rdzenia, Przymorze, zoom 1, Chromium z GPU Apple M5):

| urządzenie | kamera | 1× | 6× |
|---|---|---|---|
| laptop | stoi | 59,9 kl/s, najgorsza klatka 17 ms | 59,9 kl/s, 17 ms |
| laptop | jedzie | 58,8 kl/s, 50 ms | 58,8 kl/s, 50 ms |
| telefon (CPU 4×, 390×844) | stoi | 59,9 kl/s, 17 ms | 59,9 kl/s, 17 ms |
| telefon (CPU 4×, 390×844) | jedzie | 56,7 kl/s, 167 ms | 56,4 kl/s, 167 ms |

  Pomiar po poprawkach z przeglądu (regiony, przejścia przez budynki). Cel z planu (50 i 30 kl/s) spełniony. Jedyne przycięcia to rysowanie nowego kawałka w głównym wątku przy jeździe kamerą (około 40 ms bez dławienia, 160 ms przy CPU 4×). Dławienie CPU nie udaje słabego GPU telefonu, więc prawdziwy telefon trzeba sprawdzić na urządzeniu.
- Bot nowej symulacji (`npm run bot`, 4 + 40 pionków): około 2570 ścieżek dziennie, 0 nieudanych, 3–14 celów dziennie (średnio 7,5) zamienionych na najbliższy osiągalny kafelek (kieszonki między budynkami), około 1100 węzłów A* na ścieżkę, 0,3 s procesora na dzień gry, skrót stanu po 45 dniach `6f1b43a8` (powtarzalny). Przed regionami było 24% nieudanych i 5 s na dzień; po wycięciu przejść ścieżki są dłuższe, bo tłum chodzi na drugą stronę falowca.
- Wzorzec 0.3 (`npm run bot:v03`, przykład Przymorza z Overpass): 5 z 5 ziaren przechodzi 45 dni. Ziarno 1: jedynym trudnym okresem jest pierwsza zima (dni 11–20: jedzenie spada do 0, wkurzenie do 39), potem gospodarka się rozpędza (dzień 45: 222 osoby, jedzenie 582, zaufanie 100, wkurzenie 1, zero zgonów).

Przegląd końcowy (osobny agent, model Opus, cała gałąź) i poprawki. Pięć pierwszych ma test, który przed poprawką się wywracał; drobne sprawdzone zrzutami i testami, które już były:
- Krytyczne: po wyrzuceniu bliskich kawałków z pamięci dalekie rysowały się w 1/4 rozmiaru z czarnymi dziurami. Scenariusz `pamiec-kawalkow` w `npm run shots`: przed poprawką 24 złe kawałki, po niej 0.
- Mapa bez budynków mieszkalnych (strefa przemysłowa) dawała czarny ekran. Teraz siedzibą jest najbliższy budynek, a mapa bez budynków daje czytelny błąd na ekranie startowym.
- Falowiec ciął Przymorze na dwie części: z siedziby dało się dojść do 57% mapy. Teraz przejścia przez budynki z OSM (tunele piesze i serwisowe, `building_passage`) są wycinane, a zapasowo brama przez najcieńszą ścianę łączy odcięte obszary. Test na trzech adresach: z drzwi siedziby co najmniej 95% mapy i 95% wejść mieszkalnych.
- Grupa z kilku osób szła na jeden kafelek (a przy prawej krawędzi ktoś na drugi koniec mapy). Teraz każdy dostaje inny kafelek wokół kliknięcia.
- Liczniki ścieżek wyszły ze stanu gry, więc skrót stanu nie zależy od wnętrza A*.
- Drobne: limit pamięci kawałków na telefonie (16 zamiast 48), dymki z opisem cech, spacja na ekranie startowym, link do 0.3 w trybie dev, przesuwanie dwoma palcami, kod wyjścia `shots` przy błędach strony, flaga Metal tylko na Macu, uruchamianie `bot:v03` w ścieżkach z polskimi literami, scenariusz dotykowy w `shots`.

### Wdrożenie, 17.10.2026 (po OK Mateusza)

Gałąź `m0-fundament` wypchnięta i połączona z main (przewinięcie, bez wymuszania). Pages przełączone z trybu „legacy” na GitHub Actions. CI na gałęzi i workflow Pages na main przeszły (instalacja, lint, testy, build, wdrożenie w 11 s). Na żywo pod agentsmill.github.io/za-murem: od wpisania adresu „Obrońców Wybrzeża 4, Gdańsk” do gry 2,8 s, siedziba „Obrońców Wybrzeża 4B”, 61 budynków, bez błędów w konsoli. Wersja 0.3 działa pod `/v03/`.

### Lore z bakterią od miedzi, 17.10.2026 (po OK Mateusza)

Nowa przyczyna upadku: model AI ekologicznego startupu zaprojektował bakterię do odzysku miedzi z elektrośmieci, szczep uciekł i zjada kable. Zasada świata „przetrwało to, co szczelne” tłumaczy, czemu działa generator, panele i model z dysków banku. Wpisane do sekcji Lore w `docs/GDD.md` razem z nową sekcją „Prąd i bakteria” (propozycje mechaniki, nic nieustalone). Nowy tekst na ekranie startowym (`LORE` w `src/content/data.ts`). Testy 188/188, build, Biome na `src`, `tests` i `tools` czyste, zrzuty ekranu startowego na komputerze i telefonie obejrzane (formularz mieści się na pierwszym ekranie telefonu).

Tego samego dnia ustalone z Mateuszem i wpisane do sekcji „Prąd i bakteria” w GDD: szczep jest słaby (gotowanie, chlor, spirytus, słońce), na mapie widać tylko znane ogniska, szczep da się przynieść z wyprawy bez myjki przy bramie, a bakteriofag ma dwie drogi: ze ścieków dla Wspólnoty i od modelu AI dla Technokracji.

Potem oś czasu: rok zero bakterii to 2026, odkrycie około 2029, ćwierć wieku powolnego rozpadu, gra dalej w 2051. Nowa kolejność w tekście na ekranie startowym (najpierw bakteria, potem dziesiąta kadencja i dolar na abonament). Testy 188/188, build i Biome czyste, zrzuty obejrzane. Na telefonie 390×844 formularz kończy się na 709 px, więc tekst startowy nie powinien już rosnąć.

### Dane do generatora mieszkańców, 17.10.2026

Przegląd publicznych danych pod mieszkańców z adresu: raport w `reports/Dane do generatora mieszkańców.md`, notatki z pięciu tematów w `research_notes/Dane do generatora mieszkańców/`. Surowe pobrania (1,3 GB) leżą w `dane-surowe/`, który jest w `.gitignore`. Najważniejsze: NSP 2021 ma gospodarstwa i wiek dla rejonów statystycznych (granice BREC 2021), tablica trwania życia 2025, prognoza GUS dla gmin do 2060, imiona i nazwiska z PESEL na CC0 (nazwiska według województw), odmiana z SGJP na BSD-2. Luki: brak otwartych imion według rocznika sprzed 2000 i brak roku budowy budynków (zastępczo zbiór budynków z map z lat 80., Szubert i in. 2024, jeszcze niepobrany).

### Sesja 2, 17.10.2026: kawałki mapy w workerach (gałąź `worker-kawalki`)

Rysowanie kawałków mapy przeniesione do Web Workerów z OffscreenCanvas, żeby przesuwanie mapy nie przycinało klatek.

- `drawChunk` i drzewa rysują na dowolnym płótnie: w oknie na `<canvas>`, w workerze na `OffscreenCanvas` (`src/render/art/canvas.ts`). Sam kod rysowania się nie zmienił.
- `src/render/chunkWorker.ts`: worker dostaje scenę raz (`chunkSceneOf`: siatki terenu i budynków, cienie, style budynków, drzwi i drzewa, bez reszty świata), potem zamówienia po jednym. Gotowy kawałek wraca jako `ImageBitmap` przekazany bez kopiowania, a widok robi z niego teksturę PixiJS.
- `src/render/chunks.ts`: plan zamówień i pula workerów, bez zależności od PixiJS. Co klatkę widok układa listę od środka ekranu: najpierw szybkie dalekie kawałki dla widocznych miejsc bez żadnej tekstury, potem bliskie widoczne, na końcu reszta dalekich w tle. Nowa lista zastępuje starą, więc zamówienie dla kawałka, który wyszedł z ekranu, zanim trafił do workera, przepada. Każdy worker rysuje jeden kawałek naraz, czyli przy trzech workerach są trzy zamówienia w toku.
- Poziomy szczegółów, limit pamięci bliskich kawałków i kolejność od środka zostały w `view.ts` jak były. Wyrzucany kawałek od razu zamyka swój `ImageBitmap`.
- Zapas: gdy w workerze nie ma OffscreenCanvas z kontekstem 2D (sprawdzane w oknie i w samym workerze) albo worker się nie załaduje lub zgłosi błąd, gra rysuje w głównym wątku w limicie czasu na klatkę, jak dawniej. Wymuszenie: `?worker=0` w adresie, `npm run perf -- --no-worker`.
- `npm run shots`: nowy scenariusz `worker-zgodnosc` rysuje Przymorze z workerami i bez nich (zoom 1, zoom 0,6 i całe osiedle) i porównuje zrzuty piksel w piksel, z zasłoniętym licznikiem klatek. Sprawdzone, że łapie zmianę 3×3 piksele w jednym kawałku. `tools/png.ts` umie teraz też czytać PNG.
- Poprawka narzędzi: `waitIdle` po `setCam` czytał `complete` z ostatniej klatki, jeszcze dla starej kamery, i wracał od razu. Przez to stary zrzut `adres-offline` miał jeden kawałek rozmyty (daleki zamiast bliskiego), a `pamiec-kawalkow` nie czekał na dorysowanie kolejnych pozycji. Teraz `waitIdle` najpierw czeka dwie klatki. Wyszło na jaw dzięki workerom: dalekie kawałki są gotowe szybciej, więc wyścig zaczął wygrywać częściej.

Liczby:
- Testy: 203 zielone na aktualnym main (15 nowych: plan zamówień, pula z podróbką workera, przejście sceny przez `structuredClone`). Pięć celowo wprowadzonych błędów (brak anulowania, podwójne zamówienie, przyjęty wynik starej sceny, zamówienie przed gotowością workera, brak dalekich zaślepek) łapie każdy swój test.
- Zrzuty: stary kod (`m0-fundament`) i nowy, oba z poprawionym `waitIdle`, porównane piksel w piksel. Wszystkie zrzuty map identyczne poza cyframi licznika klatek; w `ruch` i `v03` różni się tylko to, co zależy od zegara (godzina, dymek, losowanie w 0.3). Obejrzane `przymorze-siedziba`, `przymorze-blisko` i `pamiec-kawalkow`. `npm run shots -- --dist` bez błędów, w zbudowanej wersji też rysują workery.
- Build: 599 KB JS w 10 plikach (186 KB po gzip), z tego wejściowy 318 KB (103 KB) i worker 13 KB (6 KB).
- Wydajność (`npm run perf` jak w sesji 1, tempo 1×). Stary i nowy kod mierzone jeden po drugim, bo ta sama wersja daje różne liczby w różnych chwilach: pierwszy pomiar starego kodu w tej sesji dał 67 i 150 ms, trzy następne stabilnie 83 i 300–317 ms.

| urządzenie | kamera | przed (główny wątek) | po (workery) |
|---|---|---|---|
| laptop | stoi | 60,0 kl/s, najgorsza klatka 17 ms | 60,0 kl/s, 17 ms |
| laptop | jedzie (9 nowych kawałków) | 57,0 kl/s, 83 ms, 9 klatek ponad 33 ms | 59,9 kl/s, 17 ms, 0 |
| telefon (CPU 4×, 390×844) | stoi | 60,0 kl/s, 17 ms | 60,0 kl/s, 17 ms |
| telefon (CPU 4×, 390×844) | jedzie (4 nowe kawałki) | 53,3 kl/s, 300–317 ms, 4 klatki ponad 33 ms | 59,9 kl/s, 17–33 ms, 0 |

  Cztery przebiegi z workerami przy CPU 4× i jeździe kamerą: najgorsza klatka 17, 33, 17 i 17 ms. Próba ostrzejsza, poza `perf`: 10 s jazdy przy zoomie 0,5 i CPU 4×. Z workerami 56–65 nowych bliskich kawałków i najgorsza klatka 17 ms; w głównym wątku 31–32 kawałki, 333–350 ms i 30 klatek ponad 33 ms. Prawdziwego telefonu to nie zastępuje.
- Kopia sceny dla workera: 3,5 MB tablic, `structuredClone` 1,5–2,4 ms na worker, raz przy wczytaniu.

Wdrożenie (po OK Mateusza): gałąź przeniesiona na aktualny main (lore z bakterią; konflikty tylko w tym dzienniku), main przewinięty i wypchnięty (`2102c65..7bf8617`). Workflow Pages przeszedł w minutę: lint, testy, build, wdrożenie. Na żywo pod agentsmill.github.io/za-murem na komputerze rysują 3 workery, na telefonie (emulacja 390×844) 2, plik workera się pobiera, w konsoli nie ma błędów ani ostrzeżeń. 10 s jazdy kamerą przy CPU 4×: najgorsza klatka 17 ms (komputer 9 nowych kawałków, telefon 4), z `?worker=0` 300 ms. Przy przenoszeniu wyszedł błąd w nowym scenariuszu `worker-zgodnosc`: zasłona Playwrighta na liczniku klatek ma szerokość tekstu, więc „4 kl/s” i „52 kl/s” dawały 84 różne piksele w pasku u góry. Licznik jest teraz ukrywany przez CSS, a scenariusz dalej łapie zmianę 3×3 piksele.

### M1, 17.10.2026: podział na sesje (gałąź `m1-pierwsze-minuty`)

Projekt techniczny wycinka „pierwsze trzy minuty” jest w `docs/M1-wycinek.md`: wnętrze siedziby, rzeczy, prace, ciepło, potrzeby, rysowanie i sprawdzanie. Pierwsza tura idzie równolegle w trzech sesjach, każda na własnej gałęzi z main (2102c65). Świat (`m1-swiat`) robi generator wnętrz, suche drzewo i trzepak. Symulacja (`claude/m1-symulacja-ccd058`) robi rzeczy, prace, polecenia, ciepło, potrzeby i stan samouczka. Grafika zastępcza (`claude/m1-grafika-7e0158`) robi kafelki wnętrza i meble jako czyste funkcje z arkuszem podglądu. Pliki się nie pokrywają, a kontrakt wnętrza jest w projekcie. Czerwony test wnętrza (`tests/unit/interior.test.ts`) przejęła sesja świata.

Gałąź `m1-pierwsze-minuty` przeniesiona na main z workerem kawałków (adcf075, po OK Mateusza). Na niej testy 203/203, Biome, build, bot 45 dni (skrót stanu 6f1b43a8) i wszystkie zrzuty bez błędów, w `worker-zgodnosc` 0 różnych pikseli. Obejrzane `przymorze-siedziba` i `przymorze-blisko`.

### M1 tura 1, noc 17/18.10.2026: połączone świat, grafika i noc

Do `m1-pierwsze-minuty` weszły lokalnie, bez konfliktów, trzy gałęzie sesji (szczegóły w ich notatkach):
- `m1-swiat`: `buildInterior(w, bid, { home })` dla dowolnego budynku (blok i dom z mieszkaniami, sklep, szkoła i inne z salą i zapleczem, garaż i hala), `applyInterior` z regionami, wnętrze siedziby w `w.interior`, suche drzewo i trzepak w zasięgu przyszłego podwórka (Przymorze dostało nowe drzewo 8 m przed wejściem). Jeden budynek średnio 0,39 ms, falowiec 3,9 ms.
- `claude/m1-grafika-7e0158`: czyste funkcje do bufora: kafelki wnętrza (posadzki, ściany z frontem, drzwi, okna dzienne i nocne, schody) i sprite'y rzeczy (meble w czterech ustawieniach, koza z ogniem, drewno, jedzenie, pień, suche drzewo, trzepak, siatka z dziurą i łatą, brama, ognisko, gruz, deski, złom, budka, fotel, lampa). Arkusz: `node tools/arkusz-wnetrza.ts`.
- `m1-rysowanie-nocy`: mapa światła z godziny gry (`view.lights`, `?godzina=22&swiatla=test`), przerysowanie kawałków pod zmianą (`view.redraw`, `view.syncFelled`), szkielet przekroju od zoomu 0,6 jako wariant kawałka w workerach (na razie atrapa wnętrza i płaskie kolory, `?wnetrze=atrapa`).

Na połączonej gałęzi: testy 260/260, Biome, build, bot 45 dni (skrót 7a031373, 0 nieudanych ścieżek), wszystkie zrzuty bez błędów; obejrzane `przymorze-siedziba` i `przekroj-noc`. Stan przejściowy: pionki wchodzą do siedziby pod dachem, a przekrój nie jest jeszcze podpięty do prawdziwego wnętrza i grafiki. Plamy światła wyglądają topornie i za zielono na trawie, do poprawy przy podpinaniu.

### M1 tura 2, noc 17/18.10.2026: symulacja, siatka, przekrój i zarząd

Do `m1-pierwsze-minuty` weszły lokalnie, bez konfliktów, cztery gałęzie:
- `claude/m1-symulacja-ccd058`: rzeczy w stanie gry (meble z wnętrza, drewno, jedzenie, posiłki, pnie), prace zarządu (ścinanie, noszenie, dokładanie, gotowanie, jedzenie, sen, grzanie się, palenie mebli), koza zjada drewno, ciepło w pomieszczeniach, potrzeby z bezpieczeństwem i nastrojami, menu pod prawym przyciskiem (`commandsAt`), opisy prac (`jobText`), stan samouczka, odczyt `snapshot` dla zarządu. Start o 15:00.
- `m1-siatka`: `World.fence` (siatka z 2–4 dziurami, brama od ulicy, podwórko) według kontraktu; przy zamkniętej bramie bez dziur podwórko jest odcięte.
- `m1-przekroj`: przekrój na prawdziwym wnętrzu z grafiką zastępczą (domyślnie od zoomu 0,6), meble, suche drzewo, trzepak, siatka i brama jako sprite'y, cieplejsze i drobniejsze światło.
- `m1-zarzad`: `src/gov`: karta nocy, uchwały z zaufaniem i wkurzeniem, wydarzenia w tempie przy ekranie, `node tools/trzy-noce.ts`.

Na połączonej gałęzi: testy 371/371, Biome, build, bot (skrót 0842047d), wszystkie zrzuty bez błędów. Obejrzane `przymorze-siedziba` (przekrój w dzień: zarząd w kuchni z kozą, łazienka, klatka z lastrykiem, pokoje z łóżkami, suche drzewo z trzepakiem, siatka) i `przymorze-przekroj-noc`. Bot pokazuje presję: pierwszego wieczoru opał kończy się o 18:49, bot pali meblościankę, a bez gracza od drugiego dnia koza nie grzeje i nastrój spada do 30. Jeszcze nie połączone ze sobą: rzeczy z symulacji w rysowaniu, zarząd z symulacją, karta osoby i okna decyzji w interfejsie.

### M1 tura 3, część 1, noc 17/18.10.2026: materiały i rysowanie stanu gry

Do `m1-pierwsze-minuty` weszły lokalnie, bez konfliktów:
- `m1-materialy`: 3–6 stert gruzu, desek i złomu w `World.props` (`src/world/heaps.ts`), przechodnie, poza ścieżkami do bramy i suchego drzewa. Deski i złom starczają na 1–2 łaty.
- `m1-rysowanie-gry`: `view.syncGame(sim)` co klatkę (rzeczy ze stanu gry, ścięte drzewa, światła z kozy, okien ogrzanych pomieszczeń i ogniska, siatka ze stanu `sim.blocked`), obcy widoczni nocą tylko w świetle, lekki pas postapo na terenie.

Na połączonej gałęzi: testy 386/386, Biome, build, bot (skróty 0842047d i b1759110 bez zmian), 41 zrzutów bez błędów; obejrzane `noc-gra` (koza ze stanu gry świeci w kuchni, ciepła plama za oknem) i `przymorze-calosc`. Jeszcze nie rysowane: sterty materiałów i garnek z posiłkiem.

### M1 tura 3, część 2, noc 17/18.10.2026: interfejs i wraki

Do `m1-pierwsze-minuty` weszły lokalnie:
- `m1-wraki-swiat`: 4–10 wraków maluchów i polonezów w `World.props` do 100 m od siedziby, poza siatką, przy jezdni (3 m przejazdu) albo na parkingach, bez rozcinania osiedla.
- `m1-wraki`: sterty ze świata i ze stanu gry, garnek z posiłkiem na stole, wraki w czterech ustawieniach (rdza, bez kół, wybite szyby).
- `m1-interfejs`: zarząd spięty z grą w main.ts (krok co sekundę przy ekranie, pauza przy decyzji), karta osoby z paskami potrzeb i nastrojami, menu pod prawym przyciskiem z potwierdzeniem palenia mebli, karta nocy o 20:00 (ryzyko wejścia z wartą i bez, co zabiorą, przydział do dziur i bramy, rada zarządu), okna uchwały, wydarzenia i porannego raportu, cele pierwszego dnia ze znacznikiem suchego drzewa, pasek z temperaturą, drewnem, jedzeniem, zaufaniem i wkurzeniem, własne Menu, zapis w przeglądarce. Skutki zarządu stosuje na razie adapter z interfejsu (zapasy, potrzeby, nastroje); prawdziwe `applyGov` przyjdzie z symulacją nocy.

Przy łączeniu interfejsu rozwiązałem konflikt w main.ts (krok zarządu z interfejsu, rysowanie stanu przez `view.syncGame`, bez tymczasowego malowania, które gubiło obrót wraków) i w tools/shots.ts (scenariusze z obu gałęzi). Scenariusz `sterty` liczył po dołączeniu wraków wszystkie props poza trzepakiem; teraz tylko gruz, deski i złom. Na połączonej gałęzi: testy 417/417, Biome, build, bot (skróty 175d3cc8 i d342966e), 61 zrzutów bez błędów; obejrzane `m1-karta-nocy` i `m1-karta-osoby`.

### M1 tura 3, część 3, rano 18.10.2026: noc w symulacji, dym, playtest i spięcie

Do `m1-pierwsze-minuty` weszły lokalnie, bez konfliktów:
- `m1-noc-symulacja`: mieszkańcy siedziby zamiast tłumu (3–8, plan dnia, nocą w domu), stan siatki (wytrzymałość, dziury, łaty, brama otwarta albo zamknięta), prace: warta z lampą, łatanie dziury deskami i złomem ze stert, ognisko na podwórku, wyprawy bramą; szabrownicy podchodzą pod najsłabsze miejsce, warta ze światłem ich płoszy, bez warty kradną; `applyGov` i `govInput` w src/sim/gov.ts. Po niezależnym przeglądzie kodu poprawione trzy błędy z testami (m.in. ognisko na progu zamykało dom na zawsze). Bot z zarządem: 1,7 decyzji na minutę przy zawsze obsadzonej warcie; 30 nocy, 7 napadów (2 odparte, 5 wtargnięć).
- `m1-dym`: dym z rury kozy (przez okno) i z ogniska, widoczny z daleka i nocą; pozy pracy pionków (rąbanie, naręcze drewna, dokładanie, sen, siedzenie, warta z lampą).
- `m1-playtest`: playtest pierwszych minut jak nowy gracz (Playwright, komputer i telefon): przy 1× od wjazdu do porannego raportu 291 s, 2,5 decyzji na minutę przy ekranie (było 1,9), wydarzeń w pierwszą noc 1 zamiast 8. Noc po karcie biegnie w 6×, po decyzji 20 s ciszy, cel „Przygotujcie drewno na noc”, ostrzeżenie o zimnej kozie. Nagranie 2:08 (1440×900): `.claude/worktrees/m1-grafika-7e0158/shots/m1-nagranie.mp4` i `.webm` (poza repo, sprzed spięcia z nocą w symulacji).

Spięcie (koordynator): main.ts bierze `applyGov` i `govInput` z symulacji zamiast adaptera interfejsu; nazwy dziur z interfejsu, stan ze stanu gry; uchwały do symulacji po podpisaniu (nie przy wczytaniu, bo `setLaws` wstawia polecenie do stanu i zapis przestawał się zgadzać); w grze bez tłumu obcych; etykiety nowych poleceń; zapis ze stanem w wersji 3; w rysowaniu warta to `'guard'` jak w symulacji, ludzi na wyprawie nie rysujemy. Dwa scenariusze zrzutów z gałęzi rysowania (sterty z gry, pozy) poprawione pod prawdziwą symulację. Na połączonej gałęzi: testy 466/466, Biome, build, bot (skrót 7bdadd8c), 70 zrzutów bez błędów; obejrzane `warta-noc` i `dym-dzien`.

### M1 tura 4, rano 18.10.2026: dyżur przy kozie, drzewa z pionkami, noc gracza

Do `m1-pierwsze-minuty` weszły lokalnie:
- `m1-noc-poprawki`: dyżur przy kozie jako warta z posterunkiem `'koza'` (czuwający dokłada w nocy). Bot: z dyżurem kuchnia o 6:00 średnio 21,0°C i koza pali się przez całą noc 22–6, bez dyżuru 14,6°C i 17% nocy. Samouczek nie czeka już na marsz do składu.
- `m1-drzewa`: z bliska drzewa jako sprite'y sortowane po y z pionkami (pionek za koroną się chowa, przed nią stoi), korona nad kimś z zarządu półprzezroczysta, miękkie cienie; z daleka drzewa dalej w kawałkach.
- `m1-noc-gracz`: w zarządzie jawny wynik napadu, siła napadu i warta z menu liczona w obronie (pola opcjonalne); noc zwalnia do 1×, gdy warta widzi szabrowników w świetle. Playtest na spiętej grze: przy 1× 2,69 decyzji na minutę, najdłuższy przestój w dzień 35 s (było 57 s); raport napadu zgodny z tym, co odegrała symulacja. Nowe nagranie w `.claude/worktrees/m1-grafika-7e0158/shots/`.

Konflikt w tools/shots.ts (scenariusze drzew i napadu w tym samym miejscu): zostały oba. Na połączonej gałęzi: testy 474/474, Biome, build, bot, 77 zrzutów; obejrzane `m1-napad-w-swietle` i `drzewa-zarzad`. Znany błąd rysowania: mapa światła rozciąga się po przybliżeniu (`LightLayer.update` zmienia `tex.frame` bez `tex.orig`), do poprawy. Karta nocy nie ma jeszcze opcji dyżuru przy kozie (jest w menu kozy), a symulacja nie czyta jeszcze nowych pól zarządu.

### M1 tura 5, rano 18.10.2026: dyżur w karcie nocy, napad z zarządu, światło po przybliżeniu

Do `m1-pierwsze-minuty` weszły lokalnie:
- `m1-napad-api`: symulacja bierze wynik napadu z zarządu (`raidResult`), liczbę szabrowników z planu, a wartownicy, którzy zasnęli według zarządu, przysypiają na posterunku; `govInput` daje wartę, która stoi (z karty, z menu i przy kozie). Bot: z wartą 30 nocy, 8 napadów (5 odpartych, 3 wtargnięcia), bez warty 17 napadów (7 i 10); raport zgadza się z tym, co odegrali szabrownicy.
- `m1-swiatlo-zoom`: mapa światła po przybliżeniu już się nie rozciąga (tekstury mapy światła dynamiczne; scenariusz `swiatlo-po-przyblizeniu` łapał błąd przed poprawką), poza czuwającego przy kozie (klęczy przy ogniu, bez latarni), zarys osoby z zarządu za koroną drzewa zamiast półprzezroczystej korony.
- `m1-karta-koza`: w karcie nocy opcja „Czuwa przy kozie” z pasem „Koza w nocy” (kto czuwa, drewno, ile zje noc), rada zarządu i poranny raport o kuchni.

Konflikt w tools/shots.ts (scenariusze w tym samym miejscu): zostały wszystkie. Na połączonej gałęzi: testy 488/488, Biome, build, bot, 83 zrzuty; obejrzane `m1-karta-koza-karta` i `czuwanie-koza`.

### M1 tura 6, rano 18.10.2026: uchwały o jedzeniu, przegląd wizualny, ekran startowy

Do `m1-pierwsze-minuty` weszły lokalnie:
- `m1-uchwaly-racje`: racje, wspólny kocioł i wspólne posiłki działają w symulacji przez `setLaws`. Bot po 3 dniach: przy racjach zapasy starczają, ale najedzenie spada do około 38; przy kotle najedzenie i nastrój wyżej, a jedzenie kończy się czwartego dnia w 5 z 5 przebiegów.
- `m1-przeglad-wizualny`: przegląd trzech adresów w dzień, w nocy i na telefonie, cztery poprawki rysowania (łącznik siatki w narożniku, zaznaczenie nocą nad mapą światła, latarnia na zasięg warty z symulacji, przygaszony dym nad przekrojem).
- `m1-karta-koza` (drugi commit): alarm napadu z widoczności rysowania, krótszy wstęp karty nocy. Nowe nagranie 2:48 w `.claude/worktrees/m1-grafika-7e0158/shots/m1-nagranie.mp4` (25 MB).
- `start-wersja-03` (ekran startowy z PR #1) z tekstem pod M1: „pierwszy dzień i pierwsza noc za siatką”, pełna gospodarka z budową, badaniami i zimą na razie w 0.3.

Na połączonej gałęzi: testy 495/495, Biome, build, bot (skrót 8b3f7206), 87 zrzutów; na telefonie formularz adresu kończy się na 826 px z 844.

Z przeglądu zostało dla świata, interfejsu i symulacji: na Przymorzu suche drzewo stoi tuż za bramą i jego korona ją zasłania, a etykieta „SUCHE DRZEWO” leży na bramie; siatka przecina chodniki (Przymorze 22 kafelki, Zielonki 20); wraki stoją w połowie na chodniku; Zielonki (dom jednorodzinny) nie mają mieszkańców.

### M1 poprawki z przeglądu, rano 18.10.2026

Do `m1-pierwsze-minuty` weszła `m1-brama-chodniki` (przewinięcie): suche drzewo co najmniej 5 m od bramy i z dala od przejścia, siatka obok chodników zamiast w poprzek (Przymorze 22 kafelki na chodniku → 2, Lanciego i Zielonki 0), wraki całe na jezdni. Testy 498/498, Biome, build, bot (skrót a5336d7c), wszystkie zrzuty.

Gałąź `m1-etykieta` (etykieta „Suche drzewo” z boku korony) powstała równolegle na starym położeniu drzewa i po połączeniu z poprawką świata 7 jej testów i scenariusz zrzutów padały (wybierała stronę, pod którą teraz jest siatka). Scalenie cofnąłem lokalnie przed wypchnięciem; etykietę dopasuje jej autorka na nowej gałęzi M1.

Potem weszła `m1-etykieta-2`: etykieta „Suche drzewo” szuka wolnego miejsca wokół korony (w razie potrzeby z kreską do drzewa) i nie zasłania bramy, siatki, rzeczy, budynków ani ludzi; testy i zrzuty sprawdzają te własności na trzech adresach w dzień, w nocy i na telefonie, a nie konkretną stronę. Testy 506/506, Biome, build, bot, wszystkie zrzuty; obejrzane `m1-etykieta-przymorze-noc`.

### CI na PR #2: tasowanie zależne od silnika JS, 18.10.2026

CI (Node 24) padało na teście zarządu „plan ma siłę i liczbę szabrowników…”: napad przychodził pod bramę zamiast pod zaplanowaną dziurę, a lokalnie (Node 25) test przechodził. Przyczyna: trzy wydarzenia z 0.3 tasują listy przez `sort(() => h.rng() - 0.5)`, a kolejność wywołań porównania zależy od wersji silnika, więc ten sam stan i ziarno dawały inną noc w Node 24 i 25 (i dawałyby w różnych przeglądarkach). Poprawka: `EventHost.shuffle` (opcjonalne); zarząd daje tasowanie Fishera-Yatesa ze swojego ziarna, a bez `shuffle` (adapter testu zgodności z 0.3) zostaje stare zachowanie, więc zgodność z 0.3 się nie zmienia. Lokalnie: testy 506/506, Biome, build, bot, wszystkie zrzuty.

### Mieszkańcy z adresu, krok 1: dane dla trzech dem, 18.10.2026 (gałąź `mieszkancy-z-adresu`, nic nie wypchnięte)

Krok 1 planu generatora zmyślonych mieszkańców kończy się na danych. Narzędzia offline w `tools/dane/` (czytniki ZIP, XLSX, SHP i DBF, rzutowanie PUWG 1992) składają z oficjalnych tablic GUS tabele trzech gmin z dem (Gdańsk, Warszawa-Ursynów, Zielonki) i tabele krajowe (trwanie życia, płodność, szablon gospodarstw, marginesy całej Polski). Do tego `public/data/mieszkancy/LICENCJE.md` z notą BSD SGJP i listą źródeł z licencjami. Po stronie gry jest `src/mieszkancy/`: typy tabel, `rejonDla` (rejon statystyczny dla punktu), `marginesyDla` i `wczytajGmine` z `wczytajKraj`.

`rejonDla` działa na samych działaniach `+ - * /`, bez trygonometrii. Punkt w obrysie daje rejon z zapasem „brak”. Przy nakładce kilku obrysów (do 5 m po uproszczeniu) wygrywa najniższy numer w porządku napisów. Poza obrysami wygrywa rejon o najbliższym obrysie, jeśli jest bliżej niż 1 km (długość liczona ze stałą 0,6), z zapasem „najblizszy”; dalej jest „gmina” z pustym numerem, a `marginesyDla(g, '')` daje sumy gminy. Odległość liczę do brzegu obrysu, nie do jego środka (plan mówił o środku), bo środek zależy od wielkości rejonu: w dużym rejonie wiejskim punkt 300 m od jego brzegu miałby środek kilka kilometrów dalej i dostałby zapas gminy. Rejon 183540 w Gdańsku (43 osoby, bez gospodarstw prywatnych, wąski pas ok. 35 m szerokości i 210 m długości) nie ma tabeli, więc punkt w nim trafia do sąsiedniego rejonu (test na punkcie wziętym ze środka jego wielokąta z BREC). `wczytajGmine` oddaje `null` przy 404, błędzie sieci, złej wersji albo odpowiedzi, która nie jest JSON-em; `wczytajKraj` w takich razach rzuca wyjątek.

Bramka kroku 1: `npm test` 652/652 (37 plików, w tym 24 nowe testy rejonu i wczytywania), Biome czysty, `npm run build` bez błędów, `npm run bot` przechodzi ze skrótem stanu a5336d7c, jak przed zmianami. `npm run mieszkancy` jeszcze nie istnieje, powstaje w zadaniu 10.

Rozmiary tabel w repo: Gdańsk 491 584 B (492 rejony), Warszawa-Ursynów 111 308 B (132), Zielonki 39 314 B (14), razem 642 206 B; `kraj.json` 4 585 B, `LICENCJE.md` 5 751 B. Wszystko razem 652 542 B, czyli 0,62 MB przy budżecie 3 MB. Po gzipie gminy mają razem 132 126 B.

Szacunek dla całej Polski: trzy pliki mają 642 206 B na 638 rejonów, czyli średnio 1007 B na rejon (Gdańsk 999, Ursynów 843, Zielonki 2808, bo wiejskie obrysy mają prawie trzy razy więcej bajtów). Razy około 35 000 rejonów w kraju wychodzi ok. 35 MB surowego JSON-a, a po gzipie (207 B na rejon) ok. 7 MB. To rząd wielkości z trzech próbek, nie pomiar; jest w nim już narzut na plik gminy (epoki, wiek 2021 i 2025), ale rozrzut między miastem a wsią jest duży. Gra pobiera jedną gminę naraz, więc przeglądarka nie dostanie tego na raz, ale w repo (budżet 3 MB) cała Polska się nie zmieści i trzeba by ją wystawiać osobno.

### Mieszkańcy z adresu, krok 2: gospodarstwa i 25 lat, 18.10.2026 (gałąź `mieszkancy-z-adresu`, nic nie wypchnięte)

Krok 2 daje silnik mieszkańców w Node, jeszcze bez gry. Budynki z mapy dostają rejon, epokę budowy, liczbę mieszkań i klatki (`budynki.ts`). Spis 2021 obsadza je gospodarstwami z rozkładów rejonu: wielkość, skład, rodzina, osoba 60+ i wiek, z przechyłem według typu i epoki budynku i z udziałem trzech pokoleń z NSP (`spis.ts`). Silnik 25 lat (`czas.ts`) postarza budynek krokami po 5 lat: zgony i urodzenia rok po roku, potem wyprowadzki od rodziców, związki, przeprowadzki, emigracja, powroty (także do opieki nad rodzicem 75+) i przyjezdni do wolnych mieszkań. Krok 2021→2026 jest bez upadku, dalsze kroki do 2051 idą z dźwigniami upadku (`dzwignie.ts`). `generujBudynek` i `generujObszar` (`generuj.ts`) składają to w jedno wejście. Obszar to na razie budynki ze środkiem obrysu w kwadracie 384 m wokół adresu, bez obrotu mapy; w kroku 5 generator weźmie listę budynków świata gry. `npm run mieszkancy [-- demo]` wypisuje dla każdego dema piramidy wieku 2021, 2026 i 2051, typy gospodarstw, puste mieszkania, czas generowania i test wsteczny. Flaga `--historie` na razie tylko zapowiada historie z kroku 4.

Płodność idzie według roku (R30): krzywa Eurostatu z 2024 roku razy dzietność danego roku przez dzietność 2024. Lata 2021-2023 to trend z Eurostatu (demo_find: 1,33, 1,29, 1,20 wobec 1,14 w 2024) dopasowany do poziomu GUS 1,099 z 2024, a 2025 to 1,068 z GUS („Sytuacja demograficzna Polski do 2025 r.”, tabl. 2B). Od 2026 zostaje poziom 2025, a dźwignia urodzeń po upadku działa na nim. Liczby są w `kraj.json` jako `tfrRoczny` z `npm run dane:kraj`. W 2021 urodzeń jest dzięki temu o 17% więcej niż z samej krzywej 2024, w 2025 o 3% mniej.

Bramka kroku 2: `npm test` 806/806 (42 pliki), Biome czysty, `npm run build` bez błędów, `npm run bot` ze skrótem stanu a5336d7c, jak w kroku 1, `npm run mieszkancy` kończy się kodem 0.

Liczby z narzędzia. Wiek to wiek ukończony na koniec poprzedniego roku: 2026 oznacza koniec 2025 bez upadku, 2051 to 1 stycznia po upadku.

| | Przymorze | Ursynów, Lanciego | Batowice |
|---|---|---|---|
| budynki w kwadracie (bloki, domy), mieszkania | 11 (9, 2), 1 324 | 54 (25, 29), 1 830 | 37 (0, 37), 45 |
| ludność 2021 / 2026 / 2051 | 2 710 / 2 746 / 1 662 | 4 296 / 4 268 / 2 170 | 166 / 157 / 132 |
| 65+ w 2021 / 2026 / 2051 | 20,0 / 19,8 / 22,3% | 16,0 / 18,8 / 27,2% | 16,3 / 22,9 / 31,1% |
| 80+ w 2021 / 2026 / 2051 | 6,1 / 5,9 / 5,7% | 2,2 / 2,6 / 4,1% | 2,4 / 2,5 / 5,3% |
| puste mieszkania w blokach w 2051 | 48,6% | 53,0% | bez bloków |
| trzy pokolenia wg GUS 2021 / 2026 / 2051 | 10,1 / 4,2 / 9,1% | 11,4 / 6,4 / 11,7% | 29,5 / 17,8 / 15,8% |
| dorosłe dziecko (25+) z rodzicem w 2051 | 28,0% | 33,3% | 55,3% |
| samotni wśród osób 75+ 2021 / 2026 / 2051 | 39,0 / 37,3 / 29,9% | 32,8 / 35,1 / 26,3% | 0 / 27,3 / 11,8% |
| czas generowania obszaru (mediana z 3) | 30 ms | 37 ms | 4 ms |

Batowice to 166 osób, więc ich udziały skaczą. W całym wczytanym promieniu (test silnika) puste mieszkania w blokach w 2051 to 50,9% na Przymorzu i 50,4% na Ursynowie.

Test wsteczny 2021→2025: każdy rejon gminy obsadzony na spis (tyle gospodarstw, ile ma rejon), postarzony bez upadku do końca 2025 i porównany z ludnością GUS na 31.12.2025 (P2137). Różnice w punktach procentowych przed płodnością według roku i po niej.

| gmina | 0-14 | 15-64 | 65+ | 80+ | ludność 2025: model / GUS | próg |
|---|---|---|---|---|---|---|
| Gdańsk, przed | -1,01 | +0,35 | +0,66 | -0,06 | 467 258 / 489 328 | ±2 |
| Gdańsk, po | -0,84 | +0,22 | +0,62 | -0,06 | 468 423 / 489 328 | ±2 |
| Warszawa-Ursynów, przed | -0,69 | +0,83 | -0,13 | -0,24 | 147 081 / 148 690 | ±2 |
| Warszawa-Ursynów, po | -0,52 | +0,71 | -0,19 | -0,29 | 147 417 / 148 690 | ±2 |
| Zielonki, przed | -2,74 | +1,99 | +0,75 | -0,01 | 25 250 / 28 255 | ±2 |
| Zielonki, po | -2,76 | +2,08 | +0,67 | -0,02 | 25 215 / 28 255 | ±3,5 |

Zielonki mieszczą się dopiero w progu dla gminy rosnącej (R30). To gmina podmiejska: mieszkań od końca 2020 do końca 2025 przybyło 7,3% (z 9 394 do 10 084, BDL P2166), a ludności od spisu 7,6%, i w nowych domach mieszkają rodziny z dziećmi. Roczniki 2011-2020 (5-14 lat w 2025) według GUS urosły o 13%, w modelu spadły o 8%. Silnik ma stałą liczbę mieszkań, a przyjezdni zajmują tylko zwolnione, więc napływu do nowych domów nie odda. Dźwignie bez upadku tego nie naprawiły: nawet bez żadnych przeprowadzek, emigracji i powrotów 0-14 zostawało na -2,20 pp, a z samymi rodzinami z dziećmi wśród przyjezdnych i pełnym zasiedleniem na -2,02 pp. `DZWIGNIE` i `PRZEJSCIA` zostały bez zmian poza rokiem krzywej płodności. Narzędzie uznaje gminę za rosnącą, gdy przybyło co najmniej 5% mieszkań i 5% ludności, i wtedy daje próg ±3,5 pp z dopiskiem „gmina rosnąca: nowe mieszkania nie są modelowane”. Sam przyrost mieszkań nie wystarcza, bo w Gdańsku mieszkań przybyło 12,8%, a ludności tylko 2,5%, i Gdańsk zostaje przy ±2 pp. Liczby mieszkań z BDL są stałą w narzędziu ze źródłem; dla Ursynowa plik ma dane do końca 2024 (+2,5%).

Znane wejścia, bez poprawek w tym kroku. W spisie mało młodych dorosłych mieszka z rodzicami, a udział trzech pokoleń wg GUS spada w pierwszym kroku mniej więcej o połowę (Przymorze z 10,1 do 4,2%, Ursynów z 11,4 do 6,4%). Samotnych wśród osób 75+ jest w 2026 35-37%. Dzieci 0-4 na koniec 2025 model ma po zmianie płodności o 21% mniej niż GUS w Gdańsku, o 4% w Ursynowie i o 36% w Zielonkach; reszta to napływ młodych rodzin. Spis źle dzieli 10-letnie grupy wieku na 5-letnie: w Zielonkach 10-14 lat to 49% grupy 10-19 wobec 56% w P4253, a 60-64 lat to 65% grupy 60-69 wobec 52%. W teście wstecznym 0-14, 15-64 i 65+ w 2025 to całe grupy 10-letnie ze spisu (albo urodzenia), więc ten podział rusza tylko 80+.

Rozstrzygnięcia o wyludnieniu (około połowy mieszkań pustych w 2051) i o fachach na 2051 potwierdził Mateusz 18.10.2026: „Tak, zostaw oba rozstrzygnięcia: połowa mieszkań pusta i fachy na 2051.” Projekt ma je teraz zapisane jako potwierdzone.

### Mieszkańcy z adresu, krok 3: imiona, nazwiska i odmiana, 18.10.2026 (gałąź `mieszkancy-z-adresu`, nic nie wypchnięte)

Krok 3 daje zmyślonym mieszkańcom imiona i nazwiska i uczy grę je odmieniać. Imiona to jedna tabela `imiona.json` z rejestru PESEL: dla urodzonych w latach 2000-2025 po 200 najczęściej nadanych imion na płeć i rok, dla urodzonych wcześniej pięć koszyków wieku z wagą żyjących nosicieli, do tego imiona powracające po pradziadkach i imiona przyjezdnych (Oleksandr, Tetiana). `nadajImiona` (`imiona.ts`) losuje imię według rocznika osoby: od 2026 do 2030 trend z listy 2025 gaśnie, od 2031 część dzieci dostaje imiona pradziadków, a przyjezdny po 2022 roku ma 15% szansy na imię z puli przyjezdnych. Nazwiska to 16 tabel, po jednej na województwo: 300 najczęstszych i do 100 nazwisk lokalnych, czyli takich, których co najmniej połowa nosicieli w kraju mieszka w tym województwie. Udział nazwisk lokalnych wśród mężczyzn jest w danych od 109 na 10 000 (zachodniopomorskie) do 2 045 (małopolskie), w pomorskim 2 020. Lubuskie nie ma nazwisk lokalnych, zachodniopomorskie ma jedno, opolskie cztery, więc ich udział ogranicza masa puli (R38). Nazwisko to para form, męska i żeńska; dziecko dostaje nazwisko ojca, a kobieta z partnerem w 85% przypadków nazwisko męża. Wszystko dzieje się na gotowych tabelach i na liczbach całkowitych, więc wynik jest taki sam w Node i w przeglądarce.

Odmiana (`odmiana.ts`) bierze formy z trzech źródeł. Pierwsze to słownik SGJP (Morfeusz 2, BSD-2): `npm run dane:odmiana` wyciąga z `sgjp-20260823.tab.gz` pełne paradygmaty liczby pojedynczej imion z tabel imion i nazwisk z tabel nazwisk, odrzuca formy potoczne i niepoprawne (Hugo ma Hugona, nie Huga) i dla nazwisk dokłada formę żeńską i mianownik liczby mnogiej do „państwa X” (Kowalscy, Nowakowie). Pokrywa 502 z 845 imion z tabel, ale 94,0% nadań chłopców i 93,1% dziewcząt (reszta to ukraińska i angielska pisownia, której SGJP nie zna), oraz 2 159 z 2 163 nazwisk (brakuje Buriak, Butenko, Filipek, Prodan). Drugie źródło to reguły z badań (zakończenie i płeć, krótkie listy wyjątków), trzecie tablica końcówek uczona na wszystkich 3 161 imionach i 47 823 nazwiskach męskich SGJP: najdłuższy pasujący sufiks z wzorcem odmiany. `odmien(imię, płeć)` bierze słownik, a gdy imienia w nim nie ma, odmienia regułami i porównuje z końcówkami: `pewne` znaczy, że oba dały ten sam pełny paradygmat. Gdy się różnią, formy są z reguł, a `pewne` jest `false`, co później pozwoli graczowi poprawić odmianę przy zmianie imienia. Funkcje nie rzucają: napis z cyframi albo pusty wraca w siedmiu jednakowych formach. Imię i nazwisko dwuczłonowe odmienia się człon po członie. Nota SGJP jest w `LICENCJE.md` i w polu `_nota` pliku `odmiana.json`.

Dokładność, na imionach SGJP, gdzie poprawna jest każda forma bez kwalifikatora „pot.” i „niepopr.”. Reguły dają pełny paradygmat dla 97,8% z 3 161 imion (3 092), ale listy wyjątków dobrałem na tych samych imionach (bez nich badania dawały 95,4%), więc dla obcych imion spoza SGJP będzie gorzej. Końcówki uczone bez co dziesiątego imienia i sprawdzone na odłożonych 316 imionach: 97,8% (309), reguły na tych samych 98,4% (311). Reguły i końcówki dają ten sam paradygmat dla 310 z 316 imion i w 307 z nich jest on poprawny, więc `pewne: true` ma dokładność 99,0%. Nazwiska: reguły męskie 97,9%, żeńskie 99,2%, liczba mnoga 98,1% (na 47 823 nazwiskach SGJP), końcówki na odłożonych nazwiskach męskie 99,0% i żeńskie 99,2%. Spoza słownika zostaje 343 imion z tabel (obce pisownie); dla 247 reguły i końcówki się zgadzają, dla 96 nie i tak oznaczone imiona (Olha, Anatolii) są do sprawdzenia. Zapis ukraińskich imion na -iia i -ya (Mariia, Yuliya) reguły traktują jak Maria i Maja (Marii, Mariio), bo reguły z badań robiły z nich formy typu Ameliiy. To moja decyzja dla pisowni, której SGJP nie opisuje.

Bramka kroku 3: `npm test` 1047/1047 (45 plików) dwa razy z rzędu, Biome czysty, `npm run build` bez błędów, `npm run bot` ze skrótem stanu a5336d7c, jak w krokach 1 i 2, `npm run mieszkancy` kończy się kodem 0. Jeden wcześniejszy przebieg testów padł na czterech testach w czterech plikach (progi czasu generatora i odtwarzanie tabel imion), gdy komputer był obciążony innymi sesjami; każdy z nich przechodzi osobno i w dwóch kolejnych przebiegach.

Rozmiary tabel w repo: `imiona.json` 172 729 B, 16 plików `nazwiska/` razem 161 882 B, `odmiana.json` 75 121 B (zwarty zapis wzorców odmiany, 83 wzorce), `odmiana-koncowki.json` 169 220 B (1 277 sufiksów, w tym 1 073 dla nazwisk), czyli oba pliki odmiany razem 244 341 B przy limicie 400 KB. Z tabelami gmin (642 206 B), `kraj.json` i `LICENCJE.md` wszystko w `public/data/mieszkancy/` ma 1 231 957 B, czyli 1,18 MB przy budżecie 3 MB. Czytanie SGJP (415 MB po rozpakowaniu) w narzędziu trwa kilka sekund i szczytowo zajmuje ok. 1,6 GB pamięci, a `npm run dane:odmiana` daje bajt w bajt te same pliki przy każdym uruchomieniu (test odtwarza je z surowego pliku, a bez niego jest pomijany).

Dwa gospodarstwa z Przymorza w 2051 roku z tabelami imion i nazwisk (wiek na 1 stycznia). W bloku mieszkają cztery pokolenia jednej rodziny: Elżbieta Kwidzińska (89 lat), jej córka Kamila (57), wnuczka Alicja (28) i prawnuk Leonard (2). W innym gospodarstwie Rafał (53) i Natalia (55) Pietrzakowie mieszkają z córką Hanną (35), synem Jakubem (24) i wnukiem Adamem (5). Gdy to jest tekst historii, odmiana daje „Elżbieta Kwidzińska mieszka z córką Kamilą, wnuczką Alicją i prawnukiem Leonardem”, „pani Elżbieto”, „u Rafała Pietrzaka” i „państwo Pietrzakowie”, wszystko ze słownika, więc pewne.

## Następne

1. Sprawdzić rysowanie w workerach na prawdziwym telefonie. Safari ma OffscreenCanvas 2D w workerze od 16.4, starsze przejdą na główny wątek.
2. Bramka M1: Mateusz gra na swoim adresie i mówi, czy chce dalej. Przed tym nowe nagranie po spięciu (noc z wartą, szabrownikami i dymem) i bramka w minutach przy ekranie.
3. Z playtestu dla symulacji: warta może nocą dokładać do kozy (teraz koza gaśnie około północy), krok „zanieść drewno do składu” przy 1× czeka kilka sekund na polecenie. Propozycje API zarządu od symulacji: jawny wynik napadu, siła napadu, warta spoza karty nocy.
4. PR agentsmill/za-murem#2 (M1, z ekranem startowym z #1) czeka na scalenie przez Mateusza; #1 można scalić wcześniej albo zamknąć.
5. Z przeglądu wizualnego zostało: mieszkańcy w domach jednorodzinnych (Zielonki ich nie mają, decyzja dla Mateusza).
5. Przy okazji: drzewa jako sprite'y sortowane z pionkami (teraz pionek wchodzi „na” koronę), miękkie cienie, ukośne ściany rysowane z wielokąta zamiast schodków.
6. Mieszkańcy z adresu: krok 4 (fachy, kronika osiedla i historie).

## Decyzje

- Narzędzia: Biome zamiast ESLint (jedno narzędzie, formatowanie pilnowane w CI). TypeScript 7 (natywny). Skrypty w `tools/` uruchamiane przez Node wprost z `.ts` (wymazywanie typów), bez tsx.
- Treść przeniesiona skryptem, który zostawia literały bajt w bajt. Poprawność sprawdza test różnicowy z oryginałem w `node:vm`, a nie ręcznie spisane oczekiwania.
- Wydarzenia rozmawiają ze stanem przez interfejs `EventHost`. W testach implementuje go adapter na stanie 0.3, w M3 zrobi to nowa symulacja. Kolejność losowań zostaje jak w 0.3, łącznie z tasowaniem przez `sort(() => rng() - 0.5)`. Wymienię je w M3, kiedy wzorcem przestanie być 0.3. Koszt pomyłki: inne losowania niż w 0.3, nic więcej.
- 0.3 przeniesiona, nie skopiowana, żeby nie było dwóch kopii kodu. Root to teraz wejście Vite. Push bez przełączenia Pages na Actions zepsułby więc stronę na żywo i trzeba to zrobić razem.
- Dokumenty i kafelki testowe zatwierdzone na main (lokalnie), kod na gałęzi `m0-fundament`.
- Obszar gry 384 m, dane pobierane w promieniu 288 m (zapas na obrót o 45°). Obrót do szczytu histogramu kątów krawędzi, najwyżej o 45° od północy.
- Prostowanie budynków: obrót wokół środka budynku, jeśli żaden punkt nie przesunie się o więcej niż 3,5 m, a kąt nie przekracza 8° (20° dla budynków o promieniu do 12 m). Koszt pomyłki: końce długich bloków przesunięte o 1–3 m, domy obrócone do 20° względem ulicy. Na wsi część budynków zostaje ukośna (Zielonki: 8 z 10 największych prostych).
- Chodniki 2 m dodawane automatycznie wzdłuż ulic osiedlowych i wyższych, bez dróg serwisowych.
- Fasada mieści się w obrysie budynku (dolny pas), światło od południa, cień na północ i lekko w prawo. Pionki nigdy nie chodzą po budynkach, więc nie ma sortowania głębi z budynkami.
- Kawałki terenu 32×32 m: z bliska 32 px na metr (robione na żądanie, najwyżej 48 w pamięci), z daleka 8 px na metr (wszystkie, liczone na starcie). Zmiana przy zoomie 0,5.
- Kawałki mapy rysuje pula workerów: 3 na komputerze, 2 na telefonie, nie więcej niż liczba rdzeni minus jeden. Każdy dostaje własną kopię sceny, bo siatki terenu i budynków potrzebuje też symulacja w głównym wątku, a resztę sceny zapasowe rysowanie; pamięć współdzielona (`SharedArrayBuffer`) wymaga nagłówków COOP/COEP, których GitHub Pages nie ustawia. Bez kopiowania wraca to, co duże i częste: gotowe kawałki (bliski to 4 MB). Koszt pomyłki: 3,5 MB pamięci na worker.
- Jedno zamówienie naraz na worker, kolejka w głównym wątku, co klatkę zastępowana nową. Anulowanie to brak zamówienia na nowej liście. Kawałka, który worker już rysuje, nie da się przerwać (rysowanie jest synchroniczne), więc dochodzi do końca i trafia do pamięci, a limit bliskich wyrzuca go pierwszego. Koszt: między zamówieniami worker czeka najwyżej klatkę.
- Najpierw szybkie dalekie kawałki dla widocznych miejsc bez tekstury, potem bliskie. Wcześniej daleki dla widocznego miejsca rysował się tylko wtedy, gdy po bliskim zostało czasu w klatce. Zmienia się tylko to, co widać przez pierwsze ułamki sekundy (rozmyty kawałek zamiast dziury); obraz po dorysowaniu jest ten sam.
- Tekstury z `ImageBitmap` mają w PixiJS włączone automatyczne zwalnianie z GPU. Wyłączyłem je, żeby jak przy płótnach pamięcią rządził limit bliskich kawałków; inaczej dalekie kawałki niewidziane przez dłuższą chwilę wgrywałyby się do GPU od nowa przy oddaleniu.
- Zegar: 20 kroków na sekundę przy 1×, 800 kroków na godzinę gry (40 s). Tempa 1×, 3× i 6× jak w GDD.
- Sterowanie myszą jak w RimWorld (prawy przycisk to polecenie), na dotyku jak w 0.2 (stuknięcie celu). Do potwierdzenia przez Mateusza: w 0.2 polecenie szło lewym kliknięciem w cel.
- Ścieżki: regiony liczone raz na mapę, cel z innego regionu zamieniany na najbliższy osiągalny kafelek.
- Tekst `LORE` celowo odchodzi od 0.3 i wypadł z testu zgodności w `tests/unit/content.test.ts`. Wersja pod `/v03/` zostaje ze starym tekstem.
- Siedziba: budynek pod adresem (do 4 m), inaczej najbliższy mieszkalny. Zawsze mieszkalna, nazwa z ulicy z geokodera i numeru z mapy.
- Wzorzec 0.3 liczony moją polityką bota (opisana w `tools/bot-v03.ts`), bo oryginalnego `simtest.js` nie ma. Bramka M3 („balans zbliżony do 0.3”) musi używać tej samej polityki.
- Przegląd końcowy: uwagi przeważone według skutku dla gracza w pierwszych 10 minutach. Poprawione wszystkie krytyczne i ważne oraz tanie drobne, które gracz albo narzędzia odczują (lista wyżej).
- M1 robią równoległe sesje z rozdzielonymi plikami, a kontrakt wnętrza spisany jest w `docs/M1-wycinek.md`. Łączy je koordynator po bramce. Koszt pomyłki: rozjazd z kontraktem do poprawienia przy łączeniu.
- Generator wnętrz działa dla każdego budynku, bo przy zbliżeniu ma być widać wnętrza wszystkich zajętych budynków (Mateusz, 17.10.2026). Wnętrze wynika tylko ze świata, numeru budynku i ziarna, więc nie trafia do zapisu gry; przeróbki zarządu pójdą do zapisu jako zmiany.
- Polecenia przyjmuje tylko zarząd, tłum to tło (GDD).
- M1 stoi na main z workerem kawałków (OK Mateusza, 17.10.2026).
- Kierunek po playteście (Mateusz, noc z 17 na 18.10.2026): trochę RimWorlda, trochę pierwszej wersji z jednym domem za dziurawą siatką, trochę RTS i Cywilizacji, klimat postapo, start z siatką wokół podwórka, szabrownicy, przemyślane budowanie, wnętrza z życiem. Szczegóły w `docs/M1-wycinek.md`.
- M1 to teraz „Pierwsza noc za siatką”: kończy się nocą z decyzją (karta nocy o 20:00, warta, szabrownicy, pierwsza uchwała), a nie rozpaloną kozą. Koszt pomyłki: dłuższe M1, ale bez niego bramka „Mateusz chce dalej” by nie przeszła.
- M2 i M3 zamienione: najpierw systemy z 0.3 na nowym świecie, potem grafika z PixelLab. Kotwica stylu może iść wcześniej.
- Tłum obcych zastąpią mieszkańcy siedziby z planem dnia. Obcy pojawiają się tylko jako wydarzenie.
- Bramki liczone w minutach przy ekranie: w M1 decyzja co najmniej raz na minutę, w M2 trudna pierwsza zima zamiast balansu jak w 0.3.
- Na noc z 17 na 18.10.2026 Mateusz zostawił decyzje koordynatorowi, bez pytań do rana. Bez wydatków w PixelLab.
- Potem tej samej nocy Mateusz napisał: „Rób PR i merguj też automatycznie”. PR-y otwiera koordynator. Scalenie do main zablokował klasyfikator trybu auto („Merge Without Review”), a automatyczne scalanie jest wyłączone w ustawieniach repozytorium; tych ustawień nie zmieniam. Dlatego PR-y do main czekają na scalenie przez Mateusza (albo na regułę uprawnień dla `gh pr merge`), a prace sesji koordynator łączy lokalnie w `m1-pierwsze-minuty` i wypycha tę gałąź do szkicowego PR-a M1.
- Ekran startowy: ramka „To podgląd wersji 0.4” z przyciskiem „Zagraj w pełną wersję 0.3”, na telefonie krótsza, żeby formularz adresu został na pierwszym ekranie (nowy scenariusz zrzutów `start-telefon`). PR agentsmill/za-murem#1 czeka na scalenie.
- Odłożone drobne z przeglądu (koszt, jeśli to błąd: tylko przy funkcjach, których jeszcze nie ma):
  - kolejka poleceń jest poza stanem i bez numeru kroku; przed zapisami gry przenieść ją do stanu i dodać log poleceń do odtwarzania,
  - `setScene` nie zeruje liczników i pionków; dziś scena ładuje się raz na stronę,
  - `pointercancel` traktowany jak puszczenie palca; rzadkie, bo plansza ma `touch-action: none`,
  - tasowanie przez `sort` i `Math.hypot`/`sin`/`cos` mogą dawać różne wyniki w różnych przeglądarkach; ważne, gdy zapisy będą przechodzić między przeglądarkami. Tasowanie w wydarzeniach zarządu poprawione 18.10.2026 (CI na Node 24); `Math.hypot`/`sin`/`cos` w decyzjach symulacji do sprawdzenia.

## Zaparkowane

- Stan pustych mieszkań (pomysł Mateusza, 18.10.2026): każde puste mieszkanie dostaje z historii generatora rok i rodzaj opuszczenia (wyjazd z meblami, wymarcie, splądrowanie, zalanie, pożar), a M2 zamieni to na śmieci do odzysku i rzeczy do naprawy. Zapis stanu w generatorze trafi do planu kroku 5.
- GitHub Actions ostrzega: `actions/checkout@v4` i `actions/setup-node@v4` celują w wycofywany Node 20 (GitHub uruchamia je na 24), a `ubuntu-latest` przechodzi na Ubuntu 26 od 19.10.2026. Podbić wersje akcji przy najbliższej zmianie workflow.
- Tryb zombie do wyboru w menu (pomysł Mateusza, 17.10.2026): apokalipsa zombie, start z jednego chronionego budynku, teren powiększany budową zasieków. Od nocy 17/18.10 w planie M4, na tej samej obronie co noc z szabrownikami w M1.
- Własny serwer, np. VPS na Hetznerze (pytanie Mateusza, 17.10.2026, przypomniane tego samego dnia: „coś bardziej dewowego niż GitHub”): konta i zapisy w chmurze, pocztówki z PixelLab na żądanie, pamięć geokodowania i kafelków, z czasem multiplayer asynchroniczny (sąsiednie osiedla innych graczy). Gra dalej statyczna na Pages, serwer jako małe API obok. Opcje do porównania przy wyborze (ceny sprawdzić u dostawców): Cloudflare Workers z bazą i magazynem plików (lekkie API, pamięć podręczna, bez utrzymywania maszyny); VPS na Hetznerze z Dockerem albo Coolify (pełna kontrola, multiplayer w czasie rzeczywistym, ale utrzymanie i bezpieczeństwo po naszej stronie); hosting kontenerów typu Fly.io. Zmienia decyzję „bez backendu i kont”, wrócić po M1.
- Pocztówka z osiedla: mapa znaczeń 1 px = 1 m już jest (`src/world/semantic.ts`), gotowa jako obraz startowy do PixelLab. Stan konta PixelLab z 17.10.2026 (sprawdzony przez MCP, nic nie zamówione): abonament Tier 1 „Pixel Apprentice”, 2000 generacji do 16.11.2026, 0 USD kredytów. Tier 1 to według `docs/PIXELLAB.md` mapy do 320×320 px, a nie 400×400, więc pocztówka 384 m w skali 1 px na metr się nie zmieści. Albo skala 1,2 m na piksel, albo wyższy plan.
- Falowiec na Przymorzu ma około 860 m, w kwadracie 384 m widać tylko jego część. Rozważyć przesunięcie kwadratu tak, żeby siedziba mieściła się cała.
- Automatyczne chodniki na wsi wyglądają miejsko. Pomijać je tam, gdzie przeważają domy.
- Późna gra w 0.3 jest za łatwa (bot w 45. dniu ma 582 jedzenia i zaufanie 100). W M3 celem balansu jest pierwsza zima i dalsze wyzwania.
- Ursynów: siedziba „Lanciego 10G” to duży budynek o ukośnej ścianie, która wychodzi schodkami. Rysować ukośne ściany z wielokąta.
- Mieszkańcy z adresu (rozmowa z Mateuszem, 17.10.2026): dziś `makePerson` losuje z ogólnopolskich list, bez historii i bez związku z miejscem. Pomysł: ludzie z 2051 jako następcy dzisiejszych sąsiadów (wiek budynku daje rocznik pierwszych lokatorów, dalej spadki i przeprowadzki), prawdziwe sklepy, szkoła i działki z OSM jako ich miejsca, a dzisiejsze osiedle jako ich „dawne czasy”. Losować z osobnego ziarna z adresu, żeby nie ruszyć zgodności z 0.3. Ustalone 17.10.2026: rok zero bakterii to 2026, więc mieszkańcy w 2051 to dzieci i wnuki dzisiejszych lokatorów. Zasady RODO w CLAUDE.md (postaci zmyślone, nie z nazw firm, przypięte do klatki). Po kierunku z nocy 17/18.10 niżej w kolejce: wspólnota ma radzić sobie z upadkiem, a nie odwzorowywać dzisiejsze blokowisko.
- Nowe mieszkania na rosnących przedmieściach (rodziny, które wprowadzają się do domów zbudowanych po spisie) nie są w silniku mieszkańców modelowane; pomysł na później, wtedy test wsteczny Zielonek wróci do progu ±2 pp.
- Jak nie być kopią RimWorlda (rozmowa z Mateuszem, 17.10.2026): prawdziwa ulica zamiast losowej mapy, przerabianie zajętych mieszkań zamiast stawiania ścian od zera, sterowanie tylko zarządem (reszta osiedla słucha uchwał albo nie), technika, która stoi obok i nie działa. Część weszła do kierunku z nocy 17/18.10. Całość wpisać do GDD razem z tym kierunkiem, kiedy Mateusz go przejrzy.
