# Za Murem

Pikselowa gra przeglądarkowa: wpisujesz prawdziwy adres, gra pobiera dane OpenStreetMap i robi z nich twoje osiedle po upadku cywilizacji w 2051 roku. Grasz jako zarząd spółdzielni mieszkaniowej. Mieszanka RimWorlda (ludzie na mapie, polecenia, potrzeby) i Frostpunka (uchwały, zaufanie, wkurzenie). Projekt hobbystyczny Mateusza („na jaja”), ale ma wyglądać i grać się porządnie.

Repo: github.com/agentsmill/za-murem (publiczne), strona: agentsmill.github.io/za-murem.

## Najpierw przeczytaj

- `docs/GDD.md`: jaka ma być gra.
- `docs/OCENA-v03.md`: co już jest, co zostaje, co do wymiany.
- `docs/PIXELLAB.md`: grafika z PixelLab przez MCP.
- `PROMPT-DLA-CLAUDE-CODE.md`: plan etapów i zasady przejęcia.
- `docs/POSTEP.md`: dziennik postępu. Prowadzisz go sam, na końcu każdej sesji dopisujesz, co zrobione i co dalej.

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

## Stan na 16.10.2026

Wersja 0.3: vanilla JS bez bundlera, przeniesiona do `public/v03/` (`index.html`, `style.css`, `js/*.js`, `data/sample.js`); po buildzie działa pod `/v03/`. Surowe dane Przymorza z Overpass są w `tests/fixtures/overpass/`. `tools/simtest.js` nigdy nie trafił do repo; wzorzec balansu odtwarza `npm run bot:v03`.

Wersja 0.4 (gałąź `m0-fundament`): Vite 8, TypeScript 7, PixiJS 8, Vitest, Playwright, Biome. Postęp i decyzje w `docs/POSTEP.md`.

## Komendy (wersja 0.4)

```bash
npm install
npm run dev          # serwer deweloperski, http://localhost:5173 (?demo=przymorze|lanciego|zielonki, &worker=0 bez workerów)
npm test             # testy jednostkowe (Vitest), m.in. porównanie z oryginałem 0.3 w node:vm
npm run lint         # Biome
npm run build        # typy + build do dist/ (z dist/v03/)
npm run bot          # nowa symulacja 45 dni bez przeglądarki
npm run bot:v03      # wzorzec balansu na oryginale 0.3: [-- ziarno [dni]]
npm run shots        # zrzuty w Chromium do shots/: [-- filtr] [--dist]
npm run perf         # klatki ze 150 pionkami: [-- pionki [tempo 1-3]] [--no-worker]
npm run demos        # dema offline public/demo/ z tests/fixtures/mvt
```

Skrypty w `tools/` to TypeScript uruchamiany wprost przez Node (bez kompilacji), więc importy mają rozszerzenie `.ts`, a kod używa tylko składni wymazywalnej (bez enumów i przestrzeni nazw).
