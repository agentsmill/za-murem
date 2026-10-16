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

## Następne

1. M1: rysowanie kawałków w Web Workerze (`OffscreenCanvas`), żeby zniknęły przycięcia przy przesuwaniu mapy. W toku w osobnej sesji, gałąź `worker-kawalki`.
2. M1: przekrój siedziby. Dach znika z bliska albo po zaznaczeniu, parter z klatką, mieszkaniami, kuchnią i kozą z szablonów.
3. M1: potrzeby (głód, ciepło, sen, nastrój) i dwa łańcuchy z planu: drzewo → rąbanie → drewno → skład → koza → ciepło; zapasy → gotowanie → posiłek.
4. M1: tłum z planem dnia, noc z prawdziwą ciemnością i światłem kozy i ogniska, pierwsze trzy minuty z GDD.
5. M1: drzewa jako sprite'y sortowane z pionkami (teraz pionek wchodzi „na” koronę), miękkie cienie, ukośne ściany rysowane z wielokąta zamiast schodków.

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
- Zegar: 20 kroków na sekundę przy 1×, 800 kroków na godzinę gry (40 s). Tempa 1×, 3× i 6× jak w GDD.
- Sterowanie myszą jak w RimWorld (prawy przycisk to polecenie), na dotyku jak w 0.2 (stuknięcie celu). Do potwierdzenia przez Mateusza: w 0.2 polecenie szło lewym kliknięciem w cel.
- Ścieżki: regiony liczone raz na mapę, cel z innego regionu zamieniany na najbliższy osiągalny kafelek.
- Tekst `LORE` celowo odchodzi od 0.3 i wypadł z testu zgodności w `tests/unit/content.test.ts`. Wersja pod `/v03/` zostaje ze starym tekstem.
- Siedziba: budynek pod adresem (do 4 m), inaczej najbliższy mieszkalny. Zawsze mieszkalna, nazwa z ulicy z geokodera i numeru z mapy.
- Wzorzec 0.3 liczony moją polityką bota (opisana w `tools/bot-v03.ts`), bo oryginalnego `simtest.js` nie ma. Bramka M3 („balans zbliżony do 0.3”) musi używać tej samej polityki.
- Przegląd końcowy: uwagi przeważone według skutku dla gracza w pierwszych 10 minutach. Poprawione wszystkie krytyczne i ważne oraz tanie drobne, które gracz albo narzędzia odczują (lista wyżej).
- Odłożone drobne z przeglądu (koszt, jeśli to błąd: tylko przy funkcjach, których jeszcze nie ma):
  - kolejka poleceń jest poza stanem i bez numeru kroku; przed zapisami gry przenieść ją do stanu i dodać log poleceń do odtwarzania,
  - `setScene` nie zeruje liczników i pionków; dziś scena ładuje się raz na stronę,
  - `pointercancel` traktowany jak puszczenie palca; rzadkie, bo plansza ma `touch-action: none`,
  - tasowanie przez `sort` i `Math.hypot`/`sin`/`cos` mogą dawać różne wyniki w różnych przeglądarkach; ważne, gdy zapisy będą przechodzić między przeglądarkami.

## Zaparkowane

- GitHub Actions ostrzega: `actions/checkout@v4` i `actions/setup-node@v4` celują w wycofywany Node 20 (GitHub uruchamia je na 24), a `ubuntu-latest` przechodzi na Ubuntu 26 od 19.10.2026. Podbić wersje akcji przy najbliższej zmianie workflow.
- Tryb zombie do wyboru w menu (pomysł Mateusza, 17.10.2026): apokalipsa zombie, start z jednego chronionego budynku, teren powiększany budową zasieków.
- Własny serwer, np. VPS na Hetznerze (pytanie Mateusza, 17.10.2026): konta i zapisy w chmurze, pocztówki z PixelLab na żądanie, pamięć geokodowania i kafelków, z czasem multiplayer asynchroniczny (sąsiednie osiedla innych graczy). Gra dalej statyczna na Pages, serwer jako małe API obok. Zmienia decyzję „bez backendu i kont”, wrócić po M1.
- Pocztówka z osiedla: mapa znaczeń 1 px = 1 m już jest (`src/world/semantic.ts`), gotowa jako obraz startowy do PixelLab. Stan konta PixelLab z 17.10.2026 (sprawdzony przez MCP, nic nie zamówione): abonament Tier 1 „Pixel Apprentice”, 2000 generacji do 16.11.2026, 0 USD kredytów. Tier 1 to według `docs/PIXELLAB.md` mapy do 320×320 px, a nie 400×400, więc pocztówka 384 m w skali 1 px na metr się nie zmieści. Albo skala 1,2 m na piksel, albo wyższy plan.
- Falowiec na Przymorzu ma około 860 m, w kwadracie 384 m widać tylko jego część. Rozważyć przesunięcie kwadratu tak, żeby siedziba mieściła się cała.
- Automatyczne chodniki na wsi wyglądają miejsko. Pomijać je tam, gdzie przeważają domy.
- Późna gra w 0.3 jest za łatwa (bot w 45. dniu ma 582 jedzenia i zaufanie 100). W M3 celem balansu jest pierwsza zima i dalsze wyzwania.
- Ursynów: siedziba „Lanciego 10G” to duży budynek o ukośnej ścianie, która wychodzi schodkami. Rysować ukośne ściany z wielokąta.
- Mieszkańcy z adresu (rozmowa z Mateuszem, 17.10.2026): dziś `makePerson` losuje z ogólnopolskich list, bez historii i bez związku z miejscem. Pomysł: ludzie z 2051 jako następcy dzisiejszych sąsiadów (wiek budynku daje rocznik pierwszych lokatorów, dalej spadki i przeprowadzki), prawdziwe sklepy, szkoła i działki z OSM jako ich miejsca, a dzisiejsze osiedle jako ich „dawne czasy”. Losować z osobnego ziarna z adresu, żeby nie ruszyć zgodności z 0.3.
