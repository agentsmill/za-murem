# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Za Murem

Pikselowa gra przeglądarkowa: wpisujesz prawdziwy adres, gra pobiera dane OpenStreetMap i robi z nich twoje osiedle po upadku cywilizacji w 2051 roku. Grasz jako zarząd spółdzielni mieszkaniowej. Mieszanka RimWorlda (ludzie na mapie, polecenia, potrzeby) i Frostpunka (uchwały, zaufanie, wkurzenie). Projekt hobbystyczny Mateusza („na jaja”), ale ma wyglądać i grać się porządnie.

Repo: github.com/agentsmill/za-murem (publiczne), strona: agentsmill.github.io/za-murem.

## Najpierw przeczytaj

- `docs/GDD.md`: jaka ma być gra.
- `docs/OCENA-v03.md`: co już jest, co zostaje, co do wymiany.
- `docs/PIXELLAB.md`: grafika z PixelLab przez MCP.
- `PROMPT-DLA-CLAUDE-CODE.md`: plan etapów i zasady przejęcia.
- `docs/POSTEP.md`: dziennik postępu. Prowadzisz go sam, na końcu każdej sesji dopisujesz, co zrobione i co dalej.
- `docs/M1-wycinek.md`: zakres M1 i kontrakt wnętrza budynku, na którym stoją świat, symulacja i rysowanie.
- `docs/superpowers/specs/` i `docs/superpowers/plans/`: projekty i plany większych funkcji (tryb zombie, mieszkańcy z adresu). Nagłówki modułów się do nich odwołują.

## Jak rozmawiać z Mateuszem

- Po polsku, krótko, zwykłymi zdaniami. Bez pogrubień co drugie słowo, bez list na siłę, bez pauz-myślników, bez teatralnych wstępów.
- Jedno pytanie na raz. Pytaj tylko o to, czego nie da się sensownie założyć.
- Mówi często głosem, więc literówki i przekręcone słowa zgaduj z kontekstu („Rimbord” to RimWorld, „Pixel Laps” to PixelLab, „Tree JS” to Three.js).
- Na końcu odpowiedzi jeden konkretny następny krok, nie plan na tydzień.
- Nowy pomysł w trakcie pracy zapisz jednym zdaniem w sekcji „Zaparkowane” w `docs/POSTEP.md` i wróć do roboty.
- Nie zmyślaj nazwisk, numerów ani cen. Jeśli czegoś brakuje, powiedz czego i skąd to wziąć.

## Twarde zasady

- Nic nie idzie na zewnątrz bez wyraźnego OK Mateusza: push do GitHuba, deploy, publiczne posty, zamówienia w PixelLab ponad ustalony budżet. Lokalne commity rób swobodnie.
- Tokenów i kluczy nigdy nie zapisuj w repo. PixelLab jest podłączony przez `claude mcp add` w zakresie local.
- Lore: rok 2051, prezydent USA z dziesiątej kadencji bez imienia, żadnych nazwisk prawdziwych polityków, satyra na dzisiejszą technologię i ekologię. Bez Wielkiego Mrozu. Gra otwarta, zakończenia ze ścieżek uchwał. Upadek przez bakterię od miedzi, rok zero 2026, szczegóły w sekcji Lore w `docs/GDD.md`.
- Mieszkańcy z adresu są zawsze zmyśleni (RODO). Z prawdziwego świata bierzemy tylko miejsca z OSM i statystyki zbiorcze. Nigdy nie robimy postaci z nazw firm (jednoosobowe mają imię i nazwisko właściciela). Postaci przypinamy do klatki, nie do numeru mieszkania.
- Atrybucja map zawsze widoczna: © współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles.
- Symulacja jest oddzielona od rysowania i deterministyczna. Musi dać się puścić w Node bez przeglądarki.
- Po każdej zmianie wizualnej zrób zrzut ekranu w Playwright i obejrzyj go, zanim powiesz, że działa.
- Nie mów „gotowe”, dopóki nie przejdą testy, bot symulacji i zrzuty.
- Stara wersja 0.3 ma zostać grywalna pod `/v03/`, dopóki nowa jej nie przegoni.

## Wersje i gałęzie

Wersja 0.4 (Vite 8, TypeScript 7, PixiJS 8, Vitest, Playwright, Biome) jest na `main` i na Pages od 17.10.2026. Wersja 0.3 (vanilla JS bez bundlera: `index.html`, `style.css`, `js/*.js`, `data/sample.js`) leży w `public/v03/`, a Vite kopiuje `public/` do `dist/`, więc po buildzie działa pod `/v03/`. Surowe dane Przymorza z Overpass są w `tests/fixtures/overpass/`. `tools/simtest.js` nigdy nie trafił do repo; wzorzec balansu odtwarza `npm run bot:v03`.

Pełna gra po nocy z 17 na 18.10.2026 to gałąź `pelna-gra`: `main`, tryb zombie, fala 1 M2, mieszkańcy z adresu, własna drużyna i gra z sąsiadami za `?siec=1`. Jest na origin, ale nie na `main`. Od 18.10.2026 stoi na serwerze Hetznera `cergo-rw-prod` (kontekst `cergo-rw` w `hcloud`) obok produkcyjnej aplikacji cergo, pod https://za-murem.5-75-147-27.sslip.io/: kontenery gry i serwera gry sieciowej w sieci Dockera cergo, ruch przez Caddy cergo (`deploy/hetzner/README.md`). Stos cergo zostaje nietknięty: zmieniamy tylko `/srv/za-murem` i nasz blok na końcu jego Caddyfile.

Praca idzie na gałęziach tematycznych, często w kilku równoległych sesjach w `.claude/worktrees/`, rozdzielonych po plikach (podział i kontrakty spisuje dokument etapu, jak `docs/M1-wycinek.md`). Co leży na której gałęzi i co czeka na OK Mateusza: `docs/POSTEP.md`, sekcje „Następne” i „Decyzje”. `main` ma być zawsze grywalny, PR-y do `main` scala Mateusz.

CI (`.github/workflows/ci.yml`, Node 24) puszcza lint, testy i build na każdym pushu poza `main` i na PR-ach. Push na `main` buduje i wdraża Pages (`pages.yml`), czyli od razu idzie na żywo.

## Komendy

```bash
npm install
npm run dev          # serwer deweloperski, http://localhost:5173 (?demo=przymorze|lanciego|zielonki, &worker=0 bez workerów, &grafika=kod bez grafiki z PixelLab, &pietra=1 widok pięter: kafelek „Piętro” w pasku i przekrój wybranego piętra ze stropem, tylko do oglądania, domyślnie wyłączony, &kwadraty=3x3 kwadraty miasta obok domu do oglądania)
npm test             # testy jednostkowe (Vitest), m.in. porównanie z oryginałem 0.3 w node:vm
npm test -- tests/unit/sim.test.ts        # jeden plik
npm test -- zarzad -t "ten sam przebieg"  # fragment ścieżki pliku i nazwy testu
npx biome check src tests tools server index.html  # lint zamiast npm run lint (niżej); z --write poprawia i formatuje
npm run build        # typy (tsc z TypeScript 7) + build do dist/ (z dist/v03/)
npm run bot          # nowa symulacja 45 dni bez przeglądarki [-- ziarno [dni [tłum]]]
npm run bot -- --mieszkancy         # to samo z zarządem i mieszkańcami siedziby z generatora (tabele z public/data/mieszkancy/)
npm run bot -- --miasto             # na końcu mapa miasta: od dnia 2 za dnia dwie osoby idą do miejsc z okolicy (gracz z tests/unit/miasto-play.ts); bez flagi wyjście i skróty bez zmian
npm run bot -- --zwyciestwo         # na końcu warunki zwycięstwa: 30 dni gracza fali 1 z włączonymi drogami, po dniach ludność, cel (z tabel mieszkańców, bez nich 250, nagłówek mówi który) i kamienie dróg; bez flagi wyjście i skróty bez zmian
npm run bot -- --badania [ziarno [dni]] [--mieszkancy] [--demo=NAZWA] [--jedzenie]  # pomiar tempa badań (sam pomiar zamiast reszty bota): pracownia, technologie, pierwsza zima z badaniami i bez; --jedzenie: zapas jedzenia nie spada, jakby głodu nie było (bot głoduje od dnia 7–10 i badania stoją)
npm run bot:zombie   # tryb zombie: noce z wartą z dzidami i bez warty [-- ziarno [noce [osoby zarządu 1–5]]] [--demo=przymorze|lanciego|zielonki] [--opal]
npm run bot:zombie -- --mieszkancy  # tryb zombie z mieszkańcami z generatora (flaga w dowolnym miejscu argumentów)
npm run bot:zombie:siatka  # miara siatki: bot zombie na trzech osiedlach, z mieszkańcami i bez, w której nocy siatka puszcza pierwszy raz [-- 1-6 [noce]] [--opal]
npm run bot:v03      # wzorzec balansu na oryginale 0.3 [-- ziarno [dni]]
npm run bot:surowce  # raport gospodarki: wraki i warsztat z graczem fali 1 i bez nich, 5 dni [-- ziarno [dni]]
npm run bot:praca     # praca ludzi: zarząd bez gracza (3 demka, oba tryby, 3 doby) [-- ziarno] [--werbunek] [--dni=N] [--przelacznik]
npm run shots        # zrzuty w Chromium do shots/ [-- filtr] [--dist] [--kod] [--dalej: padły scenariusz dostaje drugą próbę, przebieg idzie dalej]
npm run perf         # klatki ze 150 pionkami [-- pionki [tempo 1-4]] [--no-worker] [--noc] [--zombie] [--zoom=0.5] [--demo=lanciego|atrapa-budynki] [--kod] [--pietro=2] [--kwadraty=3x3|5x5] [--zarzad=12]
npm run determinizm  # bramka determinizmu silników JS: ten sam przebieg gry w Chromium, Firefoksie i WebKicie (Playwright), systemowym jsc z macOS i Node 24, skróty co godzinę gry [-- --demo=przymorze|lanciego|zielonki] [--godziny=24] [--zombie|--zwykly] [--seed=12345,2] [--silniki=node,node24,chromium,firefox,webkit,jsc] [--nagraj[=godzina]] [--psuj=silnik:funkcja] [--latka=mat] [--bez-swiata] [--json=plik]; kod wyjścia 0 zgodne, 1 rozbieżność albo padnięty silnik, 2 brak silnika docelowego albo żadnego z wybranych (nic nie pobiera, wiersz „brak (polecenie)”)
ZM_LATKA=ulp:hypot node --import ./tools/determinizm/latka-boty.ts tools/bot.ts  # bot z podmienioną funkcją Math (próba wrażliwości; wartości w tools/determinizm/latka.ts)
node tools/pojemnosc.ts  # pomiar pojemności serwera świata: pamięć na wczytany świat, czas kroku, zapis i wczytanie stanu, szybkość doliczania kroków [--demo=...] [--godziny=24] [--json=plik]
npm run demos        # dema offline public/demo/ z tests/fixtures/mvt: dokłada <klucz>-kwadraty.json (sąsiedzi domu); dem osiedli nie przepisuje, żeby zmiana importera nie zmieniała ich po cichu (przegenerowane 19.10.2026: mają klucze budynków i miejsc oraz rodzaje punktów; skróty botów z `--mieszkancy` i wyglądy budynków zmieniają się wtedy razem z nimi), robi to dopiero `-- --przegeneruj`
npm run atlasy       # atlasy grafiki z PixelLab do public/assets/ z assets/raw (tylko zatwierdzone): [-- --sprawdz]
npm run animacje     # pobiera animacje postaci z PixelLab do assets/raw (zamówienia idą przez MCP): [-- id ...], potem npm run atlasy
node tools/trzy-noce.ts        # trzy pierwsze noce zarządu na atrapie symulacji [ziarno] [--n liczba_ziaren]
node tools/arkusz-wnetrza.ts   # arkusz grafiki zastępczej do shots/ (podobnie arkusz-wraki.ts)
node tools/dlonie.ts           # pomiar dłoni w klatkach ciosu z PixelLab i tabela korekt nakładki broni (src/render/art/bronPixellab.ts)
ZM_BAZA=./za-murem.db ZM_CIASTECZKO_SECURE=0 node server/main.ts  # serwer gry sieciowej na :8787 (server/README.md; ZM_RESTART_H=48 restart planowy, ZM_KOPIE=./kopie codzienne kopie bazy)
ZM_IP=$(hcloud --context cergo-rw server ip cergo-rw-prod) ZM_SIEC=cergo_default deploy/hetzner/wdroz.sh  # build i wdrożenie (gra i /api)
```

- `npm run lint` (`biome check .`) pada w tym katalogu, bo Biome trafia na `biome.json` z drzew sesji w `.claude/worktrees/*`. Lokalnie Biome na katalogach jak wyżej; CI na czystym checkoucie puszcza `npm run lint`.
- `npm run shots` sam stawia serwer Vite w procesie (wolny port) i Chromium z Playwright, więc `npm run dev` nie jest potrzebny. Filtr to fragment nazwy zrzutu z listy w `tools/shots.ts`, wynik ląduje w `shots/<nazwa>.png` (poza repo). `--dist` zrzuca zbudowaną wersję, więc najpierw `npm run build`. `--kod` puszcza te same scenariusze z `?grafika=kod` (teren, bloki, trzepak i postacie rysuje kod, bez grafiki z PixelLab), wynik w `shots/kod/`, do porównań przed i po. Scenariusze `budynki-*` (`npm run shots -- budynki`) biorą atrapę mapy z `tests/unit/atrapa-budynki.ts` z każdym z 11 wyglądów budynków z PixelLab, bo dema ich nie mają; Playwright podstawia ją pod `?demo=atrapa-budynki` (`tools/atrapa-trasa.ts`). Scenariusze `kwadraty-*` (`npm run shots -- kwadraty`, też z `--kod`) pokazują kwadraty miasta obok domu: 3×3 trzech dem, szwy z bliska i w rogu, daleko, mgłę „brak danych”, noc, telefon, piętra i kliknięcie poza domem; każdy sprawdza stan (liczbę kwadratów, budżety tekstur, atrybucję map), nie tylko robi zrzut.
- Parametry adresu gry do zrzutów i prób ręcznych (`src/main.ts`): `demo`, `tryb=zombie`, `seed`, `godzina=22` (z ułamkiem: 18.5 to 18:30), `cam=x,y,zoom` w kafelkach albo `cam=hq,zoom` i `cam=all`, `speed` (indeks tempa: 0 pauza, 1 to 1×, 2 to 3×, 3 to 6×, 4 to 8×), `stado=N` (w trybie zombie N szwendaczy pod siatką), `swiatla=test`, `przekroj=0` (dach zamiast wnętrza), `perf=N` (tłum do pomiarów), `zarzad=N` (liczba osób zarządu do pomiarów, także ponad 5 z panelu, najwyżej 12), `worker=0`, `handlarz=0` (gra bez handlarza pod bramą, do porównań), `pietra=1` (widok pięter; w zrzutach i testach piętro wybiera `window.zm.pietro(L)`, a stan podaje `window.zm.pietra()`), `kwadraty=3x3` (też `5x5`, `7x7` albo lista par `1,0;0,-1`: kwadraty miasta 384 m obok domu z danych dema `public/demo/<klucz>-kwadraty.json`, tylko do oglądania; tam, gdzie danych nie ma (prawdziwy adres nic nie pobiera, Lanciego ma cztery boczne), stoi mgła z napisem „brak danych”; symulacja i polecenia znają sam dom, kliknięcie poza domem gra ignoruje, `cam=all` obejmuje wszystkie kwadraty, a `window.zm.kwadraty` podaje czasy budowy świata i sceny każdego), `miasto=0` (bez mapy miasta: karta nocy gra na celach ze słownika, bez przycisku „Mapa miasta” i minimapy, stary zapis kończy wyprawę po staremu), `siec=1` (gra z sąsiadami: blok logowania i start przez serwer gry, tylko gdy `/api` odpowiada; lokalnie `npm run dev` przekazuje `/api` do `node server/main.ts`).

## Architektura

Świat: adres → `src/world/load.ts` (Nominatim, kafelki wektorowe OpenFreeMap z=14, zapasowo Overpass; albo gotowe demo z `public/demo/`) → `Geo` w metrach względem adresu → `buildWorld` z `src/world/world.ts`: siatka 1 m o boku 384 m (dane z promienia 288 m, zapas na obrót), obrót do dominującego kierunku ścian, teren, budynki, drzewa, wnętrze siedziby, siatka z bramą wokół podwórka. Świat wynika tylko z danych osiedla i ziarna, więc nie trafia do zapisu.

Miasto z kwadratów (projekt `docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md`, etap 1: świat kwadratu, rysowanie wielu kwadratów i `?kwadraty=`; symulacja jeszcze o kwadratach nie wie, to etap 2): `src/world/kwadraty.ts` to układ kwadratów 384 m na jednej siatce wokół domu (`Uklad`: adres, kąt obrotu domu, bok; klucz „sx,sy”; środek kwadratu w metrach od adresu przed obrotem; kafelki z=14 w promieniu 720 m od środka; ziarno kwadratu), `src/world/geoKwadratu.ts` składa geo kwadratu z kafelków (`toGeoT` z opcjami `srodek` i `caleBudynki`: budowla złapana przez filtr wchodzi w całości), a `buildKwadrat` w `src/world/world.ts` buduje z niego świat bez siedziby, siatki i wnętrza na tym samym rdzeniu terenu co dom (`rastrujTeren` na oknie przesuniętym o `sx·384`, `sy·384`; skrawek budynku przy granicy zostaje, gdy cały budynek ma co najmniej 3 kafelki). Dom wygrywa na szwie: jego świat jest bit w bit jak dawniej (`tests/unit/kwadraty-dom.test.ts` trzyma odciski z nietkniętego kodu i musi przechodzić po każdej zmianie w `src/world`), a budynki wspólne z domem prostują się jak w domu (`straightenZDomem`, dopasowanie po tych samych pierścieniach, więc `buildKwadrat` dostaje SUROWE geo domu w `geoDomu`). Dema mają sąsiadów w `public/demo/<klucz>-kwadraty.json` (`loadDemoKwadraty`). Z `pietra` buildKwadrat awansuje domy po kluczu budynku (`awansujDomyKwadratu`: dwa kawałki jednego budynku decydują tak samo), a kawałek przy szwie z domem ma poziomy budynku domu (`budynkiZDomem`, `uzgodnijPietraZDomem`).

Symulacja (`src/sim/`): `createSim(world, seed, opts)` zwraca `SimState`, zwykły obiekt JSON z ziarnem i kolejką poleceń w środku. `new Sim(world, st)` dokłada to, czego w stanie nie ma (przechodniość dla każdego rodzaju pionka, regiony, A*, statystyki), a `sim.step()` robi jeden stały krok: 20 na sekundę przy 1×, 800 na godzinę gry. Interfejs i boty wysyłają polecenia przez `sim.push(...)`. `sim.ts` ma ponad 4500 linii (pionki wszystkich rodzajów, rzeczy, prace, ciepło, potrzeby, walka, szwendacze); moduły obok to w większości czyste funkcje.

Zarząd (`src/gov/`: karta nocy, uchwały, zaufanie i wkurzenie, wydarzenia) nie importuje `src/sim`. Most to `src/sim/gov.ts`: `govInput()` buduje `GovInput` (odczyt w kształcie `snapshot()` z `src/sim/snapshot.ts`), `govUpdate()` oddaje `GovEffects`, a `applyGov()` stosuje je w symulacji. Zarząd ma własny stan JSON z własnym ziarnem i liczy się co sekundę przy ekranie (bez pauzy i bez otwartego okna), a nie co tick: karta nocy wypada o 20:00 czasu gry, ale tempo wydarzeń i bramki etapów mierzy się w minutach przy ekranie. `pending()` mówi, które okno czeka: epilog zwycięstwa, raport, uchwała, karta nocy albo wydarzenie (w tej kolejności). Drogi do zwycięstwa (`src/gov/zwyciestwo.ts`: kamienie milowe, licznik celu ludności, kolejka epilogów i „Graj dalej”) włącza `wlaczZwyciestwo` (gra przy nowej grze i wczytanym zapisie), a okna rysuje `src/ui/zwyciestwo.ts`; zwycięstwo nie kończy gry ani nie kasuje zapisu.

Mapa miasta (projekt `docs/superpowers/specs/2026-10-18-mapa-miasta-design.md`): `src/world/miasto.ts` składa miejsca (`Miejsce`: sklepy i usługi z `geo.poi`, klucz „poi:X:Y” to piksel z=14) i liczy, które leżą na mapie lokalnej (koło 192 m), a `src/world/miastoKafelki.ts` doczytuje kafelki OpenFreeMap z=12 i 14 (tło miasta i miejsca spoza okolicy 720 m); żaden nie importuje PixiJS ani `src/gov`. Zarząd dostaje miejsca w `GovInput.okolica` (wypełnia ją `main.ts` z `geo.poi` przez filtr nazw `nazwaDoOkolicyZDanych`: bez tabel gminy same kategorie, RODO). `src/gov/wyprawy.ts` robi z miejsca `Cel` (ryzyko, łup z `POICAT`, zapas z klucza; co zabrano, trzyma `GovState.miasto`, który zakłada `wlaczMiasto`), `src/gov/dzienne.ts` wysyła wyprawy dzienne i rozlicza powroty (`powodOdmowy` to jedyne źródło zasad wysyłki, czyta je też karta miejsca), a powrót nocnej wyprawy z karty liczy ta sama `rozliczWyprawe` z `src/gov/noc.ts`. Bez `GovState.miasto` (`?miasto=0`, boty bez `--miasto`) zarząd gra na `TARGETS` jak przed mapą, więc skróty botów nie drgną. Interfejs: `src/ui/miasto.ts` (okno mapy i karta miejsca), `src/ui/wyprawa.ts` (plan wyprawy), `src/ui/minimapa.ts`.

Rysowanie (`src/render/`) tylko czyta stan. `GameView` w PixiJS 8 trzyma kawałki mapy 32×32 m w dwóch poziomach (32 i 8 px na metr), a rysuje je pula workerów na OffscreenCanvas (`chunks.ts`, `chunkWorker.ts`) albo główny wątek przy `worker=0`. PixiJS importują tylko `view.ts` i warstwy `*Layer.ts`; reszta (`chunks.ts`, `game.ts`, `section.ts`, `light.ts`, grafika zastępcza w `render/art/`) nie zależy od PixiJS i ma testy w Node. Noc to mapa światła mnożona przez obraz, przekrój to wnętrze zamiast dachu przy zbliżeniu. Przejścia między staniem a leżeniem (kładzenie się, wstawanie, upadek przy śmierci; animacje z PixelLab tylko dla czterech postaci zarządu) wykrywa i trzyma sam widok (`przejscia.ts`, bez PixiJS, testy w Node), nigdy `SimState`; ich czas to czas gry (`st.tick`), więc przy `speed=0` stoi, a scenariusze zrzutów przesuwają go pomocnikiem `przewin` w `tools/shots.ts`. Budynki z grafiką z PixelLab składają się z modułów: blok z modułów kotwicy, a kamienica, ratusz, muzeum, kościół, urząd, teatr, hotel, dworzec, willa, remiza i szpital z modułów swojego wyglądu (`lookBudynku.ts` wybiera wygląd z rodzajów punktów `Geo.rodzaje`, nazwy i zabudowy, a moduły są w manifeście i atlasie `budynki.png`); `?grafika=kod` i brak pliku dają dawny wygląd z kodu. Kwadraty miasta obok domu (`GameView.dodajKwadrat`, parametr `?kwadraty=` w `main.ts`) to osobne sceny: każda zna swój początek w układzie miasta (`poczatek`: szum i wzory fasad, dachów i terenu liczą się od współrzędnych miasta) i brzegi sąsiadów (`brzeg`; kwadraty na zachód i północ od domu mają ujemne współrzędne miasta, więc wzory z resztą z dzielenia liczą ją funkcją `mod` z `chunkArt.ts`, nie `%`), a `render/art/szew.ts` liczy dane szwu dwóch scen (pasy terenu, ciągi budynków przeciętych granicą, cień budynków i drzewa sąsiada) i nakłada je jako łatkę sceny w głównym wątku i w workerach, więc kawałki przy granicy rysują się tak, jakby oba kwadraty były jedną sceną (`tests/unit/kwadraty-szew*.test.ts` porównują piksele z jedną sceną złożoną). Zamówienia kawałków mają numer kwadratu (`Order.q`, dom to 0), plan zamówień mieści się w budżecie tekstur (`budzety` w `chunks.ts`: dalekie 432 na komputerze i 144 na telefonie, bliskie jak dotąd), poniżej zoomu 0,125 przy kilku kwadratach kawałki rysują się „bardzo daleko” (2 px na metr), a worker trzyma najwyżej dziewięć scen (scena kwadratu idzie do niego przy pierwszym zamówieniu). Mgła nad nieodkrytymi kwadratami to `mglaLayer.ts`; sam dom (bez `?kwadraty=`) rysuje się bajt w bajt jak dawniej.

Gra sieciowa (projekt `docs/superpowers/specs/2026-10-18-multiplayer-design.md`, etap 1: gra jeszcze tego nie woła): `server/` to osobny serwer Node 24 bez zależności z npm (`node:http`, `node:sqlite`) z kontami, zajętymi klatkami i zapisem w chmurze, `src/net/protokol.ts` to typy wspólne z klientem `src/net/api.ts`. Klucze budynków i klatek wspólne dla graczy liczy `src/world/klucze.ts` z tagów `zm:klucz` i `zm:os`, które `toGeoT` i `toGeo` dopisują z dokładnego obrysu w pikselach kafelków; demo i stare zapisy ich nie mają. Zajęte klatki mają wchodzić do symulacji tylko jako wejście startu albo polecenie w kolejce, nigdy z sieci w środku kroku. Serwer sam kończy się czysto co `ZM_RESTART_H` godzin (w compose 48; Docker podnosi go od nowa na tej samej bazie) i robi codzienne kopie bazy (`VACUUM INTO`) do `ZM_KOPIE` z przechowywaniem `ZM_KOPIE_DNI` dni (`server/restart.ts`, `server/kopie.ts`, opis i przywracanie w `server/README.md`); obie zmienne wejdą na serwer przy najbliższym wdrożeniu.

`src/main.ts` spina całość: ekran startowy (z panelem „Wasz zarząd”, `src/ui/druzyna.ts`: liczba osób i własna drużyna, której zasady w `src/content/druzyna.ts` sprawdza też `createSim`), pętla z akumulatorem stałego kroku (najwyżej 40 kroków na klatkę), krok zarządu co sekundę przy ekranie, zapis co godzinę gry do localStorage (`src/ui/zapis.ts`). Wystawia też `window.zm` dla Playwright: `ready`, `sim`, `gov`, `view`, `setCam`, `idle`, `govTick`, `ff(minuty)`, które przewija grę i staje na pierwszej decyzji zarządu, oraz `okolica` (miejsca dla zarządu, puste z `miasto=0`), `mapa()` (mapa miasta, `null` z `miasto=0` i na osiedlu zapasowym), `minimapa()`, `zwyciestwo()` (drogi do zwycięstwa tak, jak je widzi ekran dróg: `ocenDrogi`) i `wygraj(droga)` (tylko do zrzutów: zwycięstwo drogi teraz, epilog od razu). Na tej furtce stoją zrzuty i pomiary. `src/ui/` to DOM nad płótnem, `src/content/` to treść 0.3 przeniesiona bez zmiany liczb i tekstów, `src/core/rng.ts` to mulberry32 jak w 0.3 plus `hashString` do skrótów stanu.

## Determinizm, zapis i testy

- Losowanie tylko z ziarna w stanie (`nextRandom`, `rngOf` z `src/core/rng.ts`), w `src/` nie ma `Math.random`. Pamięć podręczną i statystyki trzymaj poza `SimState`, żeby `sim.hash()` zależał tylko od stanu.
- Nie tasuj przez `sort(() => rng() - 0.5)`: kolejność porównań zależy od silnika JS i raz już dała inną noc na Node 24 niż na 25. Tasowanie Fishera-Yatesa z ziarna, jak `EventHost.shuffle` w `src/gov/wydarzenia.ts`.
- Zmiany, które przeliczają przechodniość albo drogi (warta, wyprawa, łaty, brama), idą przez kolejkę poleceń w stanie i działają od następnego kroku.
- Nowe pole w `SimState` dostaje wartość domyślną w konstruktorze `Sim` (`??=`, bez losowania), żeby stare zapisy dalej działały. Niezgodna zmiana podbija wersję (`v` stanu symulacji, zarządu albo zapisu; sprawdza je `readSave` w `src/ui/zapis.ts`). `worldKey` to odcisk z samych liczników świata (rozmiar, siedziba, liczba budynków, drzew, kafelków siatki, pomieszczeń i mebli): zmiana generatora, która je rusza, każe zacząć stary zapis od nowa, a zmiana bez wpływu na te liczby przejdzie niezauważona i stary stan trafi na nowy świat.
- Testy chodzą w Node bez sieci, na kafelkach z `tests/fixtures/` (trzy adresy w `tests/unit/fixtures.ts`). Determinizmu pilnują m.in. `tests/unit/sim.test.ts` (ten sam skrót po 10 dniach, zapis i wczytanie w połowie nie zmieniają przebiegu) i `tests/unit/zarzad.test.ts`.
- Czy Chromium, Firefox, WebKit i Node 24 liczą grę bit w bit, sprawdza `npm run determinizm` (`tools/determinizm.ts`, przebieg w `tools/determinizm/przebieg.ts`); `src/sim`, `src/gov` i `src/world` mają zostać czyste w tym sensie, że przebieg chodzi w przeglądarce i w jsc bez `node:*`. Funkcje Math, których wynik może się różnić o ostatni bit między silnikami (`hypot`, `atan2`, `sin`, `cos`, `exp`, `log`, `pow`), i operator `**` są ryzykiem dla gry sieciowej; wyniki pomiarów, lista poprawek i pojemność serwera: `docs/ocena/determinizm-silnikow.md`.
- Zgodność z 0.3 sprawdzają testy różnicowe: `tools/v03.ts` ładuje oryginał do `node:vm` z `Math.random` podmienionym na ten sam generator, a testy porównują port z oryginałem zamiast spisanych oczekiwań. Jedyny świadomy wyjątek to tekst `LORE`.
- Atrapy z `tests/unit/` (`interior-mock.ts`, `gov-atrapa.ts`, `gov-play.ts`) importują też boty z `tools/`.
- Wygląd ocenia się tylko w prawdziwym Chromium (`npm run shots`), nie w jsdom.

## Konwencje

- Cały projekt ma `verbatimModuleSyntax` i `erasableSyntaxOnly`: importy z rozszerzeniem `.ts`, `import type` dla typów, bez enumów i przestrzeni nazw. Dzięki temu skrypty z `tools/` (razem z kodem `src/`, który importują) chodzą wprost w Node od 22.18, bez kompilacji.
- Komentarze po polsku, nowsze moduły mają też polskie nazwy (`zarzad`, `noc`, `siatka`, `okna`). Każdy plik zaczyna się komentarzem o tym, co robi moduł i jaki ma kontrakt; przy zmianie zachowania popraw też nagłówek. Liczby w tekstach gry idą przez `src/ui/tekst.ts` (przecinek dziesiętny, prawdziwy minus).
- Grafika jest na razie zastępcza, rysowana kodem (paleta w `src/render/art/palette.ts`). Docelowo PixelLab, ale każdy obiekt zachowuje wersję rysowaną kodem.
