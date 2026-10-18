# Menu budowy: panel z boku, zakładki, miniatury i blokady technologią

Rozmowa z Mateuszem 18.10.2026. Dokument opisuje, co ma powstać i dlaczego, tak żeby dało się z niego zrobić plan bez dopytywania. Słowa Mateusza są w cudzysłowie, rozstrzygnięcia oznaczone „(moje)” to moje wybory do przejrzenia.

## Po co

Dziś „Budowa” (przycisk albo klawisz B) otwiera okno modalne na pół ekranu, które zasłania mapę. Mateusz: „widzę coś takiego zasłaniającego cały ekran, a to powinien być panel z boku po prawej, który się wysuwa albo coś podobnego”. Na liście jest też tylko sześć budowli, bez obrazków, w trzech grupach wynikających z miejsca (pomieszczenie, podwórko, obwód).

Gra ma mieć w późniejszych etapach „mnogość budynków możliwych do budowy dzięki rozwojowi technologii”. W 0.3 było ich kilkanaście za bramkami z drzewka z 24 badań, a nowa wersja dostanie je razem z gospodarką i badaniami. Menu, które dziś mieści sześć wpisów, musi się wtedy nie rozpaść przy kilkudziesięciu.

## Co zostało rozstrzygnięte z Mateuszem

- Układ A z podglądu: panel po prawej, który nie zasłania mapy; u góry zakładki kategorii, pod nimi siatka kafelków z miniaturami, na dole opis wybranej budowli (rozmiar, koszt z zaznaczonym brakiem, czas pracy, miejsce) i przycisk „Postaw”.
- Budowle zablokowane technologią mają być wyszarzone z kłódką i nazwą badania, a świeżo odblokowane oznaczone „NOWE” (pokazane na podglądzie, Mateusz wybrał układ razem z tym).
- Badania nie wchodzą w tym kroku: „Badania pójdą z gospodarką”. Menu ma tylko być na nie gotowe.
- Do badań będzie potrzebne miejsce do zbudowania: „jakiś warsztat”. W 0.3 to „Świetlica-pracownia” (pokój w budynku, obsada, kierownik znający dziedzinę). To pierwsza budowla projektu badań, nie tego projektu; menu zostawia jej miejsce w zakładce Dom.

## Cele

1. Menu budowy to panel po prawej bez okna modalnego: mapa zostaje widoczna i klikalna, kiedy panel jest otwarty.
2. Zakładki kategorii i siatka kafelków z miniaturami; wybór kafelka pokazuje szczegóły i przycisk „Postaw”.
3. Miniatury to rysunek tej samej budowli co na mapie, brany z tego samego źródła (`buildSprite` w `src/render/art/budowle.ts`). Kiedy grafika zastępcza zostanie wymieniona na PixelLab, miniatury zmienią się razem z nią, bez osobnej roboty.
4. Mechanizm blokad technologią w danych i w stanie symulacji, zdolny obsłużyć kilkadziesiąt budowli i kilka kategorii bez zmiany układu.
5. Panel czytelny na telefonie (pointer coarse, do 640 px) i po polsku oraz angielsku (`L()`, `tx()`).

## Nie-cele

- Nowe budowle, nowe koszty i czasy, zmiana zasad budowy (miejsca, `canPlace`, plan, duch na mapie, pasek stawiania). Zostają jak są.
- Badania: drzewko, praca ludzi przy badaniu, postęp, świetlica-pracownia. Przychodzą z projektem gospodarki (`docs/superpowers/specs/2026-10-18-kierunek-rozwoju-design.md`, projekt 2).
- Znaczek „NOWE”: potrzebuje stanu „co gracz już widział”, a dziś nic się nie odblokowuje. Wchodzi razem z badaniami (moje).
- Rysunki z PixelLab. Miniatury z grafiki zastępczej wystarczą.

## Anty-cele (porażka, nawet jeśli działa)

- Panel zasłania mapę albo kłóci się z innymi elementami (zoom po prawej, karta osoby, cele, podpowiedź, pasek stawiania).
- Menu, w którym widać budowlę, której nie da się w żaden sposób postawić ani odblokować („ślepa uliczka”, gracz uzna ją za błąd).
- Odświeżanie panelu psuje płynność (przeliczanie miejsc dla wszystkich budowli co sekundę).
- Zmiana w symulacji, która zmienia przebieg gry albo skróty stanu dla istniejących zapisów.

## Ograniczenia

- `docs/M2-fala-1.md` i kod z gałęzi `pelna-gra` (`src/ui/budowa.ts`, `src/sim/budowle.ts`, `src/render/art/budowle.ts`, `src/main.ts` od `openBuild`): menu czyta `BUILDS`, `canPlace`, `snapshot()`; interfejs nie zmienia symulacji poza jednym polem opisanym niżej.
- Symulacja deterministyczna i w Node; `sim.hash()` istniejących stanów się nie zmienia (dlatego `techDone` jest opcjonalne i nieobecne, patrz „Dane i stan”), bez podbijania wersji zapisu.
- Interfejs w HTML i CSS (nie PixiJS), napisy po polsku i angielsku z `tx()`/`L()`, liczby przez `src/ui/tekst.ts`.
- Zmiana wizualna: zrzut w Playwright obejrzany przed „gotowe” (CLAUDE.md), na komputerze i na telefonie.
- `main` ma zostać grywalny; praca na gałęzi `menu-budowy` odbitej od `pelna-gra`.

## Jak to ma działać

Układ i zachowanie (podgląd: układ A).

- Klawisz B i przycisk „Budowa” przełączają panel. Panel to `aside` obok `#card`, nie `#modal`. Szerokość ok. 310 px, od dolnej krawędzi paska u góry do dolnej krawędzi nad atrybucją map. Wysuwa się z prawej (przesunięcie CSS, bez animacji przy `prefers-reduced-motion`).
- Przycisk zoomu (`.mapctl`) przesuwa się w lewo o szerokość panelu, kiedy panel jest otwarty. Pozostałe elementy (karta osoby, cele po lewej) nie kolidują.
- Zakładki: ustalone w danych (`cat` w definicji budowli); zakładka bez widocznych budowli się nie pokazuje (moje). Dziś trzy: Dom (warsztat, kuchnia społeczna, magazyn, łóżka piętrowe), Podwórko (ogródek), Obwód (zasieki). Kolejne (Jedzenie, Prąd, Obrona z podglądu) dochodzą razem z budowlami, które do nich należą.
- Kafelek: miniatura w pudełku ok. 38 px (skala całkowita, `image-rendering: pixelated`), nazwa. Brak surowców: kafelek przygaszony, szczegóły mówią, czego brakuje i skąd to wziąć (jak dziś w `why`). Brak miejsca: ten sam powód co dziś.
- Szczegóły wybranej budowli na dole: nazwa, rozmiar, jedno zdanie działania, koszt (z zaznaczonym brakiem), czas pracy, miejsce, przycisk „Postaw”.
- „Postaw” uruchamia istniejące `startPlacing`. Na komputerze panel zostaje otwarty, a zaznaczony kafelek podświetlony, więc można stawiać kolejne plany; Esc albo prawy przycisk anuluje stawianie, drugi Esc zamyka panel (moje). Na telefonie panel (od dołu, do ok. połowy wysokości) zamyka się po „Postaw”, a „Budowa” otwiera go z powrotem (moje). Dwa warunki, nie jeden (moje): układ dolnej szuflady wynika z szerokości (`max-width: 640px`, więc wąskie okno komputera z myszą też ją dostaje), a zamykanie po „Postaw” z dotyku (`touchUI`, `pointer: coarse`, bo stawianie dotykiem celuje celownikiem na środku ekranu). Tablet z dotykiem i szerokim ekranem dostaje panel z prawej, który zamyka się po „Postaw”. Macierz zrzutów: komputer, telefon i tablet.
- Panel odświeża się, kiedy zmieni się zapas albo plany (materiały i „brakuje” mają być na bieżąco), bez przebudowy całego DOM, kiedy nic się nie zmieniło. Wybrana zakładka i kafelek są pamiętane do końca sesji.
- Dostępność: `role="tablist"` i `tabpanel`, strzałki między zakładkami i kafelkami, fokus po otwarciu na wybranym kafelku, Esc zamyka.

Dane i stan.

- Definicja budowli (`BuildDef` w `src/sim/budowle.ts`) dostaje `cat` (zakładka) i opcjonalne `tech` (identyfikator badania, które ją odblokowuje). Dziś żadna budowla nie ma `tech`.
- `SimState` dostaje opcjonalne `techDone?: string[]` (lista odblokowanych badań), nieobecne, dopóki projekt badań nie odblokuje pierwszego badania. Pole celowo nie ma wartości domyślnej w konstruktorze `Sim`: `sim.hash()` to skrót z `JSON.stringify(st)`, więc zawsze obecne `techDone: []` zmieniłoby każdy skrót, w tym przypięte w testach (`druzyna-sim.test.ts`, `apts.test.ts`) i w botach, którymi `docs/POSTEP.md` dowodzi, że symulacja się nie zmieniła. To świadomy wyjątek od zasady „nowe pole z wartością domyślną” z CLAUDE.md: tu pole dodaje dopiero ten, kto pierwszy coś odblokuje (moje). Zwykły JSON, bez losowania.
- Funkcja `isUnlocked(st, kind)` (czyste, w `src/sim/budowle.ts`): prawda, gdy budowla nie ma `tech` albo `st.techDone?.includes(tech)`. Symulacja odrzuca polecenie `build` na zablokowaną budowlę (przez `canPlace` z powodem), żeby boty i testy nie obchodziły blokady.
- Widok z kłódkami jest wyłączony flagą w danych (`BUILD_MENU.showLocked = false`, moje na prośbę sesji pilnującej, niżej). Przy fladze włączonej zablokowane budowle są w siatce wyszarzone z kłódką i napisem „Wymaga badania: …” w szczegółach; przy wyłączonej menu pokazuje tylko to, co wolno postawić. Nazwy badań idą z danych badań, których tu jeszcze nie ma, więc menu bierze je z opcjonalnego słownika `TECH_NAMES` (dziś pustego, po polsku i angielsku).

Miniatury.

- Sprite bierze się tą samą drogą co mapa: `rzeczSprite(spec, view.grafika)` z `src/render/art/pixellab.ts` (dziś dla budowli wpada w `thingSprite`, a ten w `buildSprite`). Wołanie `buildSprite` wprost ominęłoby przyszłą nakładkę z PixelLab i złamało cel 3. Budujący sprawdza, czy `ThingSpec` obsługuje rodzaje budowli, i dba o to, żeby miniatury przerysowały się, kiedy grafika dojdzie z opóźnieniem (`setGrafika`, atlasy ładują się w tle) (moje).
- `Sprite` to piksele `Uint32Array` z kotwicą. Nowa czysta funkcja zamienia go na dane obrazu (bez DOM, do testów w Node), a cienka warstwa DOM rysuje to na `<canvas>` i trzyma w pamięci podręcznej po rodzaju. Ustawienie `rot` 0, bez uszkodzenia i ognia, stałe ziarno.
- Skala: obraz budowli jest przycinany do prostokąta z pikselami i dopasowywany do pudełka ok. 56 px (kafelek w panelu 310 px ma ok. 90 px szerokości), każdy rodzaj do własnego pudełka z zachowaniem proporcji, `image-rendering: pixelated`. Sprite'y mają 32 px na metr (np. warsztat 66×64, magazyn 67×103, ogródek 100×88, zasieki 34×41), więc prawie wszystkie są większe niż pudełko i całkowita skala może je tylko zmniejszać; dopuszczam skalę ułamkową z najbliższym sąsiadem (moje, poprawka względem 38 px i „skali całkowitej” z podglądu, który był szkicem). Różnicę wielkości budowli mówi napis „3×2” obok nazwy, a nie rozmiar miniatury.

Pliki (propozycja do planu, builder może to poprawić).

- `src/ui/panelbudowy.ts` (nowy): panel jako klasa DOM, jak `ContextMenu` w `menu.ts`. Czyste funkcje danych zostają w `src/ui/budowa.ts` (`buildMenu`, `reservedOf`, `availableOf`, `allowedAnchors`), `buildSheet` i jego CSS (`.bcat*`, `.build*` w `src/style.css`) znikają.
- `index.html` dostaje `aside#buildPanel`, `src/main.ts` przełącza go zamiast `modal.show(buildSheet…)` w `openBuild`, a Esc i klawisz B obsługuje razem z trybem stawiania.
- `src/sim/budowle.ts`, `src/sim/sim.ts` (pole `techDone`), `src/sim/budowle.en.ts`, `src/ui/budowa.en.ts` (napisy kategorii i nowych tekstów).

## Testy i weryfikacja

- Rozszerzyć `tests/unit/budowa-ui.test.ts`: kategorie i widoczność pustych zakładek, powody braku (miejsce, materiały), `isUnlocked` i odrzucenie zablokowanej budowli przez symulację na syntetycznej definicji z `tech` (nie dostarczanej w grze), miniatury: dla każdego rodzaju niepusty obraz o ustalonym rozmiarze.
- Test determinizmu: istniejące skróty przypięte w testach i bot (`npm run bot`, `bot:zombie`) bez zmian, czyli bez przypinania na nowo; stan z ustawionym `techDone` zapisuje się i wczytuje bez zmiany przebiegu.
- Nowy scenariusz zrzutów (`tools/shots.ts`) „panel budowy” na komputerze, telefonie i tablecie, z otwartym panelem i z włączoną flagą kłódek na syntetycznej definicji. Zrzuty obejrzane.
- `npm run perf` bez regresji przy otwartym panelu (przeliczanie miejsc tylko dla aktywnej zakładki albo z pamięcią podręczną), Biome, testy i build.

## Decyzje do przejrzenia przez Mateusza

1. Kłódki dopiero od badań (propozycja sesji „Pilnowanie agentów” 18.10.2026, którą przyjąłem roboczo, a nie odpowiedź Mateusza). Uzasadnienie: zablokowana budowla, której nie da się odblokować, to ślepa uliczka. Mateusz pokazał na podglądzie kłódki i może wolić je od razu; zmiana to jedna flaga w danych.
2. Znaczek „NOWE” razem z badaniami, nie teraz (moje).
3. Na komputerze panel zostaje otwarty przy stawianiu; na telefonie zamyka się po „Postaw” (moje).
4. Zakładki ukryte, dopóki nie mają budowli (moje). Z sześciu zakładek z podglądu dziś będą trzy.
5. Pracownia (miejsce do badań) jest pierwszą budowlą projektu badań w zakładce Dom, a nie częścią tego kroku.

## Zostawione budującemu

Dokładne kolory i rozmiary w CSS, animacja wysuwania, sposób odświeżania panelu (zdarzenie albo tik co sekundę z porównaniem skrótu), pamięć podręczna miejsc dla `room()`, nazwy plików i podział funkcji, układ szczegółów na telefonie.
