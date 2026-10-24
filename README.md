# Za Murem: spółdzielnia po upadku

Pikselowa gra przeglądarkowa. Wpisujesz adres swojego osiedla, gra pobiera budynki z OpenStreetMap i robi z nich twoje osiedle w 2051 roku, po upadku cywilizacji. Prowadzisz zarząd spółdzielni mieszkaniowej: widzisz swoich ludzi na mapie, mówisz im, co mają robić, i uchwalasz prawa dla całego osiedla.

Wersja 0.4 jest grywalna pod agentsmill.github.io/za-murem: świat 1 m, ludzie na mapie, sterowanie jak w RimWorld, tryb zwykły i tryb zombie. Poprzednia wersja 0.3 leży w `public/v03/` i po zbudowaniu jest pod `/v03/`.

## Jak uruchomić

Potrzebny Node 22.18 albo nowszy.

    npm install
    npm run dev

i wejść na http://localhost:5173. Przykłady bez sieci: `?demo=przymorze`, `?demo=lanciego`, `?demo=zielonki`.

## Komendy

- `npm run dev`: serwer deweloperski (Vite).
- `npm run build`: sprawdzenie typów i build do `dist/` (z wersją 0.3 w `dist/v03/`).
- `npm test`: testy jednostkowe (Vitest), w tym porównanie z oryginałem 0.3.
- `npm run lint`: Biome (lint i formatowanie).
- `npm run bot`: nowa symulacja przez 45 dni bez przeglądarki.
- `npm run bot:v03`: wzorzec balansu na oryginalnym kodzie 0.3.
- `npm run shots`: zrzuty ekranu w Chromium do `shots/` (`-- --dist` dla zbudowanej wersji).
- `npm run perf`: pomiar klatek ze 150 pionkami (laptop i telefon z procesorem zdławionym 4×); `-- --no-worker` rysuje kawałki mapy w głównym wątku, jak przeglądarka bez OffscreenCanvas w workerze.
- `npm run demos`: dema offline w `public/demo/` z kafelków testowych.

## Struktura

- `src/core`: losowość z ziarnem, skróty stanu, język (polski i angielski).
- `src/content`: treść z 0.3 (dane, ludzie, wydarzenia) jako moduły TypeScript.
- `src/world`: geokodowanie, kafelki wektorowe, Overpass, obrót mapy, siatka 1 m, klasy budynków, mapa miasta i kwadraty miasta.
- `src/sim`: zegar, symulacja pionków, ścieżki (A* i regiony), praca, badania, surowce.
- `src/gov`: zarząd (karta nocy, uchwały, wydarzenia, goście, drogi do zwycięstwa); nie importuje `src/sim`.
- `src/mieszkancy`: zmyśleni mieszkańcy siedziby z danych zbiorczych (GUS, rejestr imion), tabele w `public/data/mieszkancy/`.
- `src/ui`: DOM nad płótnem: okna, panele, ścieżka celów, zapis gry.
- `src/render`: PixiJS, kamera, grafika z PixelLab i zapasowa rysowana kodem; kawałki mapy rysują workery na OffscreenCanvas.
- `src/net` i `server`: gra z sąsiadami (`?siec=1`): klient i serwer Node z SQLite.
- `src/ai`: silnik decyzji osady AI, jeszcze niepodpięty do gry.
- `src/main.ts`: start, pętla gry, sterowanie.
- `tools`: boty, zrzuty, pomiar wydajności, dema, narzędzia danych.
- `tests`: testy jednostkowe i dane testowe offline (kafelki OpenFreeMap dla trzech adresów, odpowiedź Overpass).
- `deploy/hetzner`: wdrożenie na serwer testowy (Docker, Caddy).
- `docs`: GDD, ocena 0.3, PixelLab, dziennik postępu, projekty i plany w `docs/superpowers/`.
- `stare/`: wcześniejsze prototypy.

## Dane

Mapa: © współtwórcy OpenStreetMap, licencja ODbL. Kafelki: OpenFreeMap, schemat OpenMapTiles. Geokodowanie: Nominatim (limit jednego zapytania na sekundę).
