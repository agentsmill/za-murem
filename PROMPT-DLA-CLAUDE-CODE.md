# Prompt dla Claude Code: przejęcie gry „Za Murem”

Jak użyć: otwórz terminal, wejdź do folderu `~/Post-pixel`, uruchom `claude` i wklej wszystko poniżej linii jako pierwszą wiadomość. W kolejnych sesjach wystarczy napisać „Czytaj CLAUDE.md i docs/POSTEP.md, jedziemy dalej”.

---

Przejmujesz grę „Za Murem”. Jesteś w tym projekcie głównym programistą, projektantem rozgrywki i grafikiem technicznym naraz. Mateusz jest właścicielem i testerem: decyduje o kierunku, smaku i budżecie, ty o wszystkim, co techniczne. Piszesz z nim po polsku, krótko i zwykłymi zdaniami (szczegóły w `CLAUDE.md`).

## O co chodzi

Gracz wpisuje prawdziwy adres. Gra pobiera dane OpenStreetMap i robi z nich jego osiedle albo ulicę domków w pikselach, rok 2051, po upadku cywilizacji. Gracz jest zarządem spółdzielni mieszkaniowej. Ma widzieć swoich ludzi na mapie, wydawać im polecenia jak w RimWorld, a jako zarząd uchwalać prawa dla całego osiedla jak we Frostpunku. Całość to satyra na dzisiejszy świat oglądana z przyszłości.

Wersja 0.3 ma świetny hak (adres → mapa w 2-3 s), dobrą treść i działającą symulację, ale świat jest martwy: ludzie to liczby w panelu, mapa wygląda jak plan, nie da się nikomu nic kazać. Mateusz chce gry, która wygląda i rusza się jak RimWorld, z prawdziwym poczuciem zarządzania swoim domem i osiedlem. Wersja 0.2 miała to, co lubił najbardziej: zaznaczasz człowieka, klikasz cel, człowiek idzie i robi. To wraca, w większej skali.

## Przeczytaj, zanim napiszesz pierwszą linię

W tej kolejności:

1. `CLAUDE.md`: zasady projektu i współpracy.
2. `docs/OCENA-v03.md`: uczciwa ocena tego, co jest. Obejrzyj każdy zrzut w `docs/ocena/` (otwórz pliki PNG, nie zgaduj z nazw).
3. `docs/GDD.md`: kierunek gry. To jest twoja specyfikacja.
4. `docs/PIXELLAB.md`: grafika przez MCP PixelLab, styl, budżet, lista assetów.
5. Kod 0.3: `js/sim.js` (symulacja, wydarzenia, klasyfikacja budynków), `js/data.js` (cała treść i liczby), `js/mvt.js` i `js/osm.js` (pobieranie map), `js/main.js`, `js/ui.js`, `js/art.js`.
6. `stare/za-murem-v02.html`: zobacz, jak działało sterowanie ludźmi (funkcje `bfs`, `select`, `lotClick`, `sendBuild`, paski potrzeb, przekrój domu).

Potem sam uruchom obie wersje (`python3 -m http.server 8000` w folderze, v0.2 jako plik) w Playwright, zrób zrzuty i zagraj chwilę. Napisz Mateuszowi w 2-3 zdaniach, czy zgadzasz się z oceną. Jeśli w czymś się nie zgadzasz, powiedz w czym i dlaczego. To jest ważniejsze niż grzeczne przytakiwanie.

## Decyzje już podjęte

Nie otwieraj ich na nowo bez dobrego powodu popartego testem:

- Świat 2D w stylu RimWorld, nie 3D. TypeScript, Vite, PixiJS 8. Interfejs w HTML i CSS nad płótnem.
- 1 kafelek = 1 m, 32 px na kafelek, widok low top-down. Mapa obrócona do dominującego kierunku ścian bloków.
- Dwie warstwy ludzi: rdzeń (3 do około 20 pionków z imieniem i pełną symulacją, sterowany ręcznie) i tłum (reszta lokatorów liczona per klatka, widoczna jako pionki tła, praca przez dyżury).
- Przekrój budynków: nasz budynek z bliska traci dach i pokazuje parter z wnętrzem generowanym z obrysu. Wyższe piętra są uproszczone.
- Na osiedlu domków budynek spod adresu jest zawsze siedzibą i zawsze nasz.
- Mapa z kafelków OpenFreeMap, Overpass zapasowo, geokodowanie Nominatim. Zero backendu, wszystko statyczne na GitHub Pages.
- Grafika z PixelLab przez MCP, z kotwicą stylu i jedną paletą. Każdy obiekt ma też grafikę zapasową rysowaną kodem.
- Treść 0.3 (wydarzenia, ogłoszenia, lore, uchwały, technologie, zawody, cechy, zakończenia) przenosisz, a nie piszesz od nowa. Nowe rzeczy dopisujesz w tym samym tonie.
- Zegar jak w RimWorld: godzina gry około 40 s przy 1×, ruch pionków szybki niezależnie od zegara. Wszystkie tempa z `sim.js` są liczone na godzinę gry, więc przenoszą się wprost, ale balans sprawdź botem.

## Rzeczy do sprawdzenia na małym prototypie przed pełną decyzją

1. Wydajność: siatka 384 × 384 m po 1 m, teren w kawałkach (np. 32 × 32 kafelki w RenderTexture), 150 pionków z A* i animacją. Cel: co najmniej 50 klatek na sekundę na laptopie i 30 na telefonie (Playwright z dławieniem CPU 4×). Jeśli się nie da, zmniejsz obszar do 256 m albo uprość tłum, zanim zmienisz cokolwiek innego.
2. Bloki z modułów: czy `create_building_kit` (oblique, 32 px) da się poskładać na obróconych obrysach z OSM tak, żeby falowiec, punktowiec i dom wyglądały wiarygodnie. Do czasu assetów zrób to samo modułową grafiką zapasową.
3. Wnętrza: czy generowany parter wygląda jak klatka bloku z wielkiej płyty i jak dom jednorodzinny. Wzoruj się na prawdziwych rzutach, używaj szablonów z losowością, a nie czystego losowego podziału.

## Architektura

Propozycja, możesz poprawić, jeśli masz lepszy pomysł, ale opisz zmianę w `docs/POSTEP.md`:

```
src/
  core/      ziarno losowania, zegar, kolejka poleceń, zapis i wersje zapisu
  content/   dane z js/data.js i wydarzenia z js/sim.js jako typowane moduły
  world/     geokodowanie, kafelki MVT, Overpass, obrót mapy, siatka 1 m, generowanie wnętrz, regiony
  sim/       pionki, potrzeby, zadania i priorytety, ścieżki, tłum i dyżury, ciepło, jedzenie,
             zdrowie, zaufanie i wkurzenie, uchwały, badania, wyprawy, najazdy, wydarzenia
  render/    aplikacja Pixi, kamera, warstwy: teren, budynki, dachy i przekrój, obiekty,
             pionki, efekty (dym, pogoda), noc i światło
  ui/        pasek górny, zaznaczenie, menu kontekstowe, zakładka Praca, budowa, uchwały,
             badania, kronika, gazetka, start i samouczek
  assets/    ładowanie atlasów, grafika zapasowa
tools/       bot symulacji, zrzuty, narzędzia do manifestu PixelLab, przygotowanie przykładów
tests/       testy jednostkowe (vitest) i dymne z zrzutami (Playwright), dane testowe offline
```

Zasady:

- Stan symulacji to zwykły obiekt dający się zapisać jako JSON. Rysowanie tylko go czyta. Interfejs wysyła polecenia do kolejki, symulacja je wykonuje w swoim kroku. Dzięki temu działa determinizm, zapis i bot.
- Symulacja ma stały krok i ziarno. Ten sam adres, ziarno i polecenia dają ten sam stan.
- Ścieżki: A* na siatce z podziałem na klastry i pamięcią podręczną. Tłum może liczyć ścieżki rzadziej i prościej. Jeśli trzeba, Web Worker.
- Dane z sieci do testów zapisz raz w `tests/fixtures/` (kafelki MVT dla Przymorza, Ursynowa i domków w Zielonkach, przykład z Overpass), żeby testy działały bez sieci.

## Etapy i bramki

Każdy etap kończy się bramką. Nie przechodzisz dalej, dopóki bramka nie jest spełniona i Mateusz jej nie zobaczył.

### M0. Fundament

- Vite, TypeScript, PixiJS 8, vitest, Playwright, ESLint albo Biome. Skrypty `dev`, `build`, `test`, `bot`, `shots`.
- Przeniesiona treść z `js/data.js` i wydarzeń z `js/sim.js` bez zmiany liczb i tekstów.
- Przeniesione `mvt.js` i `osm.js` z testami na danych offline (liczba budynków, klasy budynków, sklejanie budynków na granicy kafelków).
- GitHub Actions budują i wdrażają na Pages. Wersja 0.3 skopiowana do `public/v03/` i dalej działa.
- Bramka: testy zielone, build działa, `/v03/` działa lokalnie, zrzuty pustej mapy 1 m dla trzech adresów testowych. Push i przełączenie Pages na Actions dopiero po OK Mateusza.

### M1. Wycinek: mój dom i podwórko

Najważniejszy etap. Ma powstać coś, w co chce się grać przez 10 minut, nawet na grafice zapasowej.

- Mapa 1 m z obrotem, teren, ulice, chodniki, drzewa, budynki z modułowej grafiki zapasowej, która już wygląda jak blok i jak dom (balkony, klatki, okna, dachy).
- Siedziba z przekrojem: parter, klatka albo pokoje, kuchnia, koza.
- Rdzeń: 4 osoby z imionami i zawodami z obecnych generatorów. Chodzą, śpią, jedzą, marzną. Potrzeby: głód, ciepło, sen, nastrój.
- Sterowanie: zaznaczanie kliknięciem i ramką, menu pod prawym przyciskiem, domyślne polecenie na telefonie, pauza i tempa.
- Jeden pełny łańcuch: suche drzewo → rąbanie → drewno na ziemi → noszenie do składu → palenie w kozie → ciepło w mieszkaniu → lepszy nastrój. Drugi łańcuch: jedzenie z zapasów → gotowanie → posiłek przy stole.
- Tłum: 20 do 40 pionków tła z prostym planem dnia.
- Dzień i noc z prawdziwą ciemnością i światłem z kozy i ogniska.
- Pierwsze trzy minuty jak w GDD.
- Bramka: nagranie wideo z Playwright (2-3 minuty gry) i zrzuty dla Mateusza. Mateusz gra na swoim adresie i mówi, że chce dalej. Wydajność w granicach z prototypu.

### M2. Grafika z PixelLab

- Sprawdź `/mcp`. Jeśli PixelLab nie jest podłączony, podaj Mateuszowi komendę z `docs/PIXELLAB.md` i poczekaj.
- Kotwica stylu (4 assety), akceptacja Mateusza, zapis palety, potem pierwsza fala z `docs/PIXELLAB.md`.
- Manifest z kosztami. Przed każdą paczką powyżej 5 USD pytasz o zgodę. Budżet na etap ustala Mateusz.
- Atlasy, animacje postaci, stany obiektów (koza zimna i rozpalona, drzewo zdrowe i ścięte), zima, dym, pranie, noc.
- Mateusz ma wyższy plan PixelLab z generowaniem map (do 400×400 px). Użyj go do pocztówki z osiedla: nasz układ w skali 1 px na metr jako obraz startowy, wynik na ekran startowy i do gazetki. Szczegóły i granice w `docs/PIXELLAB.md`, sekcja „Generowanie map”. Świata gry z tego nie składamy.
- Bramka: zrzuty przed i po w tych samych miejscach, Mateusz akceptuje wygląd.

### M3. Systemy z 0.3 na nowym świecie

- Zasoby jako przedmioty na ziemi i w strefach składowania. Stanowiska jako obiekty w konkretnych pomieszczeniach.
- Dyżury tłumu per klatka, zakładka Praca z priorytetami.
- Badania z wiedzy fachowców i książek, uchwały w stylu Frostpunka z odnowieniem, zaufanie i wkurzenie, zakończenia.
- Wydarzenia z 0.3 podpięte pod miejsca na mapie, tam gdzie to ma sens (influencerka nagrywa pod bramą, dron dostawczy spada na trawnik). Reszta zostaje tekstowa.
- Gazetka „Głos Klatki” z wycinkiem mapy waszego osiedla.
- Bramka: bot gra 45 dni bez błędu, balans zbliżony do 0.3, każdy system ma test.

### M4. Skala osiedla

- Przyłączanie sąsiednich bloków, wyprawy widoczne na mapie (wyjście bramą, powrót z łupem), cele poza mapą, nocne najazdy z trybem Alarm, przełącznik pięter, osada domków.
- Bramka: trzy typy adresów grywalne (wielka płyta, falowiec, domki). Najazd da się obronić ręcznie.

### M5. Szlif i wiralowość

- Samouczek w trzech minutach, telefon, udostępnianie (gazetka i zrzut osiedla z nazwą), zapisy z migracją wersji, wydajność, Photon jako zapasowe geokodowanie, pamięć podręczna wyników geokodowania i kafelków.
- Bramka: osoba, która nie zna gry, przechodzi start bez pomocy.

## Pierwsza sesja, dokładnie to

1. Przeczytaj pliki z listy wyżej.
2. Uruchom 0.3 i 0.2, zrób zrzuty, napisz Mateuszowi 2-3 zdania o ocenie.
3. Zrób M0.
4. Zrób mały prototyp z M1: Przymorze z danych offline, siatka 1 m z obrotem, grafika zapasowa terenu i bloków, jeden pionek, który idzie tam, gdzie klikniesz. Zmierz wydajność z 150 pionkami.
5. Załóż `docs/POSTEP.md` z sekcjami: Zrobione, Następne, Decyzje, Zaparkowane.
6. Wyślij Mateuszowi raport: co zrobione, 2-3 zrzuty, liczby z wydajności, jedno pytanie, jeśli coś naprawdę blokuje.

## Jak sprawdzasz swoją pracę

- `npm test`: determinizm (ten sam adres, ziarno i polecenia dają ten sam skrót stanu po 10 dniach), ścieżki, obrót i rasteryzacja, klasyfikacja budynków, generowanie wnętrz.
- `npm run bot`: bot gra 45 dni bez przeglądarki i wypisuje dzienne liczby jak `tools/simtest.js`.
- `npm run shots`: Playwright otwiera mapy testowe, ustawia kamerę i porę dnia (dzień, noc, zima) i zapisuje zrzuty do `shots/`. Każdy zrzut oglądasz sam przed zgłoszeniem zmiany.
- Wydajność: Playwright z dławieniem CPU, pomiar klatek przez 10 s.
- jsdom nie nadaje się do oceny wyglądu. Do wyglądu tylko prawdziwy Chromium.

## Czego nie robić

- Nie pisz treści gry od nowa. Przenoś i dopisuj w tym samym tonie.
- Nie buduj silnika ogólnego przeznaczenia. Robisz tę jedną grę.
- Bez backendu, kont, analityki i reklam.
- Nie zamawiaj assetów hurtem przed akceptacją kotwicy stylu.
- Nie kopiuj grafik, interfejsu ani postaci z RimWorld, Frostpunka ani innych gier. To inspiracja, nie kopia.
- Bez nazwisk prawdziwych polityków i prawdziwych osób.
- Main ma być zawsze grywalny. Pracuj na gałęziach, łącz po bramce.
- Nic na zewnątrz bez OK Mateusza: push, deploy, zamówienia ponad budżet.

## Ton gry

Czarny humor, bez złośliwości wobec zwykłych ludzi. Śmiejemy się z abonamentów na wszystko, z AI w lodówce, z ESG, z influencerów, z aplikacji, które przestały działać, z termomodernizacji w pastelach. Ludzie z osiedla są sympatyczni, nawet gdy są dziwni. Przykłady tonu są w wydarzeniach w `js/sim.js` i ogłoszeniach w `js/data.js`. Teksty w grze piszesz jak człowiek z osiedla, a nie jak korporacja albo chatbot.

## Ryzyka i co z nimi robić

- Wydajność na telefonie: teren w kawałkach, pomijanie tego, czego nie widać, rzadsze aktualizacje tłumu, pamięć ścieżek, w ostateczności mniejszy obszar.
- Bałagan w obrysach OSM: obrót mapy, uproszczenie obrysów, minimalne rozmiary, prostokąt zastępczy dla dziwnych kształtów.
- Rozjeżdżający się styl z PixelLab: kotwica, jedna paleta, referencje stylu, odrzucanie i ponowne generowanie, manifest.
- Rozlewający się zakres: najpierw wycinek M1, potem reszta. Bramka z Mateuszem przed każdym etapem.
- Limity Nominatim: jedno zapytanie na sekundę, pamięć podręczna wyników w przeglądarce, Photon jako zapas.

## Dostępy

- GitHub: konto `agentsmill`, `gh` zalogowane na Macu Mateusza. Repo `agentsmill/za-murem` jest publiczne, Pages włączone z gałęzi main.
- PixelLab: przez MCP, komenda w `docs/PIXELLAB.md`, token podaje Mateusz.
- Mapy: OpenFreeMap, Nominatim i Overpass nie wymagają kluczy.

Zacznij od punktu 1 z pierwszej sesji.
