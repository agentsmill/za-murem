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
- Lore: rok 2051, prezydent USA z dziesiątej kadencji bez imienia, żadnych nazwisk prawdziwych polityków, satyra na dzisiejszą technologię i ekologię. Bez Wielkiego Mrozu. Gra otwarta, zakończenia ze ścieżek uchwał.
- Atrybucja map zawsze widoczna: © współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles.
- Symulacja jest oddzielona od rysowania i deterministyczna. Musi dać się puścić w Node bez przeglądarki.
- Po każdej zmianie wizualnej zrób zrzut ekranu w Playwright i obejrzyj go, zanim powiesz, że działa.
- Nie mów „gotowe”, dopóki nie przejdą testy, bot symulacji i zrzuty.
- Stara wersja 0.3 ma zostać grywalna pod `/v03/`, dopóki nowa jej nie przegoni.

## Stan na 16.10.2026

Wersja 0.3: vanilla JS bez bundlera, pliki `index.html`, `style.css`, `js/*.js` (data, osm, mvt, art, sim, gazetka, ui, main), `data/sample.js` (Przymorze z Overpass), `tools/simtest.js`, `tools/make-sample.js`. Pages serwuje gałąź main z katalogu głównego. Uruchomienie lokalne: `python3 -m http.server 8000`.

Komendy dla nowej wersji dopisz tutaj, gdy powstaną (dev, test, build, zrzuty, bot).
