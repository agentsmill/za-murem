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

## Następne

1. Sprawdzić rysowanie w workerach na prawdziwym telefonie. Safari ma OffscreenCanvas 2D w workerze od 16.4, starsze przejdą na główny wątek.
2. M1, tura 1 (świat, symulacja, grafika) i 1b (zarząd w `src/gov`): po raportach sesji połączyć gałęzie w `m1-pierwsze-minuty`, podmienić w symulacji atrapę wnętrza na prawdziwe i puścić bramkę.
3. M1, tura 2: siatka z bramą i podwórko, mieszkańcy zamiast tłumu, noc z wartą, wyprawami i szabrownikami, łatanie siatki i ognisko, gotowanie, przekrój z życiem w mieszkaniach, noc i światło, ścięte drzewa znikają z kawałków.
4. M1, tura 3: karta osoby, menu pod prawym, karta nocy, uchwała, cele, samouczek, zrzuty, nagranie i bramka (decyzja co minutę przy ekranie).
5. Strona główna: duży przycisk do grywalnej 0.3, a 0.4 jako podgląd nowej wersji. Czeka na OK Mateusza, bo to zmiana publiczna.
6. Przy okazji: drzewa jako sprite'y sortowane z pionkami (teraz pionek wchodzi „na” koronę), miękkie cienie, ukośne ściany rysowane z wielokąta zamiast schodków.

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
  - tasowanie przez `sort` i `Math.hypot`/`sin`/`cos` mogą dawać różne wyniki w różnych przeglądarkach; ważne, gdy zapisy będą przechodzić między przeglądarkami.

## Zaparkowane

- GitHub Actions ostrzega: `actions/checkout@v4` i `actions/setup-node@v4` celują w wycofywany Node 20 (GitHub uruchamia je na 24), a `ubuntu-latest` przechodzi na Ubuntu 26 od 19.10.2026. Podbić wersje akcji przy najbliższej zmianie workflow.
- Tryb zombie do wyboru w menu (pomysł Mateusza, 17.10.2026): apokalipsa zombie, start z jednego chronionego budynku, teren powiększany budową zasieków. Od nocy 17/18.10 w planie M4, na tej samej obronie co noc z szabrownikami w M1.
- Własny serwer, np. VPS na Hetznerze (pytanie Mateusza, 17.10.2026, przypomniane tego samego dnia: „coś bardziej dewowego niż GitHub”): konta i zapisy w chmurze, pocztówki z PixelLab na żądanie, pamięć geokodowania i kafelków, z czasem multiplayer asynchroniczny (sąsiednie osiedla innych graczy). Gra dalej statyczna na Pages, serwer jako małe API obok. Opcje do porównania przy wyborze (ceny sprawdzić u dostawców): Cloudflare Workers z bazą i magazynem plików (lekkie API, pamięć podręczna, bez utrzymywania maszyny); VPS na Hetznerze z Dockerem albo Coolify (pełna kontrola, multiplayer w czasie rzeczywistym, ale utrzymanie i bezpieczeństwo po naszej stronie); hosting kontenerów typu Fly.io. Zmienia decyzję „bez backendu i kont”, wrócić po M1.
- Pocztówka z osiedla: mapa znaczeń 1 px = 1 m już jest (`src/world/semantic.ts`), gotowa jako obraz startowy do PixelLab. Stan konta PixelLab z 17.10.2026 (sprawdzony przez MCP, nic nie zamówione): abonament Tier 1 „Pixel Apprentice”, 2000 generacji do 16.11.2026, 0 USD kredytów. Tier 1 to według `docs/PIXELLAB.md` mapy do 320×320 px, a nie 400×400, więc pocztówka 384 m w skali 1 px na metr się nie zmieści. Albo skala 1,2 m na piksel, albo wyższy plan.
- Falowiec na Przymorzu ma około 860 m, w kwadracie 384 m widać tylko jego część. Rozważyć przesunięcie kwadratu tak, żeby siedziba mieściła się cała.
- Automatyczne chodniki na wsi wyglądają miejsko. Pomijać je tam, gdzie przeważają domy.
- Późna gra w 0.3 jest za łatwa (bot w 45. dniu ma 582 jedzenia i zaufanie 100). W M3 celem balansu jest pierwsza zima i dalsze wyzwania.
- Ursynów: siedziba „Lanciego 10G” to duży budynek o ukośnej ścianie, która wychodzi schodkami. Rysować ukośne ściany z wielokąta.
- Mieszkańcy z adresu (rozmowa z Mateuszem, 17.10.2026): dziś `makePerson` losuje z ogólnopolskich list, bez historii i bez związku z miejscem. Pomysł: ludzie z 2051 jako następcy dzisiejszych sąsiadów (wiek budynku daje rocznik pierwszych lokatorów, dalej spadki i przeprowadzki), prawdziwe sklepy, szkoła i działki z OSM jako ich miejsca, a dzisiejsze osiedle jako ich „dawne czasy”. Losować z osobnego ziarna z adresu, żeby nie ruszyć zgodności z 0.3. Ustalone 17.10.2026: rok zero bakterii to 2026, więc mieszkańcy w 2051 to dzieci i wnuki dzisiejszych lokatorów. Zasady RODO w CLAUDE.md (postaci zmyślone, nie z nazw firm, przypięte do klatki). Po kierunku z nocy 17/18.10 niżej w kolejce: wspólnota ma radzić sobie z upadkiem, a nie odwzorowywać dzisiejsze blokowisko.
- Jak nie być kopią RimWorlda (rozmowa z Mateuszem, 17.10.2026): prawdziwa ulica zamiast losowej mapy, przerabianie zajętych mieszkań zamiast stawiania ścian od zera, sterowanie tylko zarządem (reszta osiedla słucha uchwał albo nie), technika, która stoi obok i nie działa. Część weszła do kierunku z nocy 17/18.10. Całość wpisać do GDD razem z tym kierunkiem, kiedy Mateusz go przejrzy.
