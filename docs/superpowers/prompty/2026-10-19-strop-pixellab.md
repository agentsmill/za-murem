# Prompt dla sesji PixelLab: strop pięter (ciepły tynk)

Do wklejenia w nową sesję Claude Code w repo za-murem. Napisany 19.10.2026 w sesji projektu pięter (gałąź `projekt-pieter`). Wybór wyglądu to decyzja Mateusza z makiety „Jak wygląda piętro, do którego nie masz wejścia”, wariant 2 „Ciepły tynk”.

---

Jesteś sesją od assetów PixelLab w grze Za Murem. Zamów i zarejestruj kafelki stropu, czyli wygląd zamkniętych mieszkań na piętrach widzianych z góry. Praca to tylko assety i dokumenty: nie ruszasz `src/`, `tools/` ani `tests/`, niczego nie podpinasz do gry i nie wypychasz gałęzi.

## Po co to jest

Gra dostanie piętra. Przełącznik pięter w pasku u góry (obok „Budowa” i „Menu”) tnie wszystkie budynki na wybranej wysokości. Na takim piętrze klatka schodowa jest widoczna, a mieszkania za zamkniętymi drzwiami zasłania strop. Budynek niższy niż wybrane piętro pokazuje po prostu dach. Strop musi więc wyraźnie różnić się od dachu, od lastryko klatki obok niego i od podłóg mieszkań, które gracz już otworzył. Mateusz (18.10.2026): „bedzie ‘strop’ cos innego kolory niz dach”. Z makiety wybrał „Ciepły tynk” (beż jak sufit w mieszkaniu).

## Przeczytaj najpierw

1. `CLAUDE.md` (zasady Mateusza: po polsku, krótko, jedno pytanie na raz, nic na zewnątrz bez jego OK, żadnych tokenów w repo).
2. `docs/PIXELLAB.md` w całości, szczególnie „Czego nauczyła kotwica stylu” (akapit o dachu: jasna ramka kafelków z `create_tiles_pro`, więc tło w kolorze plus rzadkie naklejki) i „Jak trzymać assety w repo”.
3. W `assets/manifest.json` wpisy `kotwica-blok` i `kotwica-blok-dach` (jak wygląda wpis, pole `uzycie`), oraz `assets/palette.json` i `assets/wejscia/paleta-32.png`.
4. Makieta stropu: `/Users/mpawelczuk/Post-pixel/.claude/worktrees/hopeful-herschel-f73fa2/.superpowers/brainstorm/86200-1792362367/content/pieter-makiety.html` (druga połowa strony, wariant 2). To szkic Mateusza, nie wzorzec pikseli. Zrzutu `przymorze-przekroj.png` użyj z `npm run shots -- przymorze-przekroj` (katalog `shots/` jest poza gitem).

## Gałąź

Od aktualnej `pelna-gra` (`git switch -c m3-strop pelna-gra`, sprawdź wcześniej `git log -1 pelna-gra`). Commity lokalne, po polsku. Nie wypychaj.

## Co ma wyglądać jak co

Dane z kodu, żeby strop dało się odróżnić:

- Dach z PixelLab (zatwierdzony, zostaje bez zmian): papa, tło `#313336`, ciemny `#1a1c22`, jasny `#46484a`, szwy co 96 × 64 px (3 × 2 m).
- Dachy z kodu (`src/render/art/palette.ts`): papa `#4e4a47` do `#625e59`, żwir `#9a968d`, dachówka `#98472f` do `#ab573d`, blacha `#767c81`.
- Lastryko klatki (`src/render/art/wnetrze.ts`), sąsiaduje ze stropem w tym samym kadrze: `#8f8a80` do `#a5a094`.
- Panele w otwartych mieszkaniach: `#a07850`, `#8e6944`, `#af875b`, wytarte `#c4a47c`. Linoleum w kuchni kremowe `#cdbf9b`.

Wymagania wyglądu stropu (twarde, sprawdź i zmierz):

1. Ciepły jasny tynk. Średni kolor kafelka tła około `#cdb08c` (RGB 205, 176, 140), każdy kanał w granicach plus minus 14. Kolory z palety `Za Murem 2051`: baza `#e0b48c` i `#cac6bc`, światła `#e3e0d6`, cienie `#b07a55` i `#9a958a`.
2. Luminancja względna średniego koloru tła co najmniej 2,5 razy większa niż dachu `#313336`. Dodatkowo odcień ciepły, a dach i lastryko klatki są neutralne szare. Zmierz i wpisz liczby (luminancja, RGB średnie) do manifestu.
3. Ma wyglądać jak płyta stropowa pod tynkiem, widziana z góry, nie jak podłoga: równa matowa powierzchnia z delikatnym szumem (3 do 4 odcieni z palety), bez deseczek, bez płytek, bez mebli, bez perspektywy, bez rzucanych cieni, bez obrysu.
4. Kafelek 32 px = 1 m, widok z góry. Kafelki mają łączyć się bez szwu: złóż w skrypcie pomocniczym tło 4 × 4 (z odbiciami jak w grze) i sprawdź, czy nie widać ramki ani powtórzeń. Jeśli PixelLab znów da jasną ramkę, jak przy dachu, zrób jak przy dachu: tło w kolorze z szumem rysowane z pól `uzycie`, a w kafelkach zostaje tylko wnętrze (prostokąt `wnetrze` bez ramki, na dachu `[3, 3, 26, 26]`) jako rzadkie naklejki.
5. Szwy płyt stropowych i naklejki to dodatki, nie podstawa. Naklejki (plama zalania, rysa, łata tynku, plamki pleśni w rogu) w najwyżej 15 procentach kafelków (`gestosc` 0,15 albo mniej), żeby cały strop nie wyglądał na zalany.

## Zamówienie

Jedno zamówienie `create_tiles_pro`: `square_topdown`, `tile_size` 32, `style_images` z wycinkiem 32 × 32 px najspokojniejszego jasnego tynku z `assets/raw/kotwica-blok/1.png` (wybierz kawałek ściany fasady bez okna, zapisz współrzędne w manifeście jak dla dachu), `palette` „Za Murem 2051” (jeśli PixelLab odmówi, zamów bez i dociągnij `reduce_colors` z `assets/wejscia/paleta-32.png`). Osiem opisów, w tej kolejności, każdy poprzedzony wspólnym początkiem:

Wspólny początek: `top-down view of a prefab concrete floor slab covered with warm beige plaster, Polish 1970s apartment block, seen from directly above, flat matte surface, no furniture, no objects, no perspective, no shadows, no outline, seamless tile, low detail, calm low contrast,`

1. `plain uniform warm beige plaster, very faint grain`
2. `plain warm beige plaster, slightly faded and lighter`
3. `warm beige plaster with one faint straight panel joint across the middle`
4. `warm beige plaster with a small pale brown water stain in one corner`
5. `warm beige plaster with a single thin hairline crack`
6. `warm beige plaster with a small patch of lighter repaired plaster`
7. `warm beige plaster with a few tiny dark specks of mold in one corner`
8. `plain warm beige plaster, slightly darker and dustier`

Szwy płyt (co 32 px albo co 96 × 64 px) rysuje kod z pól `uzycie`, jak szwy papy na dachu, więc ich nie zamawiasz. Zestawienie ma pokazać oba warianty.

Budżet: najwyżej dwa zamówienia (drugie tylko jako poprawka), razem najwyżej 30 generacji, 0 USD kredytów. Na starcie sprawdź `get_balance`. Jeśli coś pójdzie na więcej, zatrzymaj się i zapytaj Mateusza. Tier 1 przyjmuje najwyżej 8 zadań naraz. Jeśli narzędzi PixelLab nie widać w sesji, powiedz Mateuszowi, że MCP nie jest podłączony, i nie obchodź tego przez curl.

## Rejestracja w repo

- Pliki dokładnie takie, jak przyszły: `assets/raw/strop-tynk/` (bez ręcznych poprawek).
- Wpis w `assets/manifest.json`, grupa `pietra`, id `strop-tynk`, pola jak w sąsiednich wpisach: `co`, `narzedzie`, `prompt`, `parametry` (z `style_images` i współrzędnymi wycinka, `palette`), `pixellab` (identyfikator zamówienia), `koszt` (w generacjach), `status`: `gotowy` (NIE `zatwierdzony`, zatwierdza Mateusz), `pliki`, `uzycie` (`tlo`, `ciemny`, `jasny`, `szwy` jako propozycja, `naklejki` numerami wariantów, `wnetrze`, `gestosc`), `uwagi` z pomiarami kontrastu.
- Sekcja „Strop pięter” w `docs/PIXELLAB.md`: co zamówione, koszt, lekcje, pomiary kontrastu z dachem i lastryko.
- Wpis w `docs/POSTEP.md` tuż przed „Następne”.
- Nie ruszaj `public/assets/` ani `tools/atlasy.ts`. Gra nie używa tych plików, dopóki Mateusz nie zatwierdzi wersji i nie powstanie podpięcie. `npm run atlasy -- --sprawdz` ma zostać czyste.

## Zestawienia do obejrzenia

Zapisz w `docs/postep/` (PNG, sposób dowolny, np. skrypt z `tools/png.ts` poza repo albo Playwright):

1. `pietra-strop-arkusz.png`: kafelki stropu (osiem wariantów), złożone tło 4 × 4, strop z oboma wariantami szwów (co 32 px i 96 × 64 px), a obok dla porównania dach (`public/assets/dach.png` z tłem `#313336`), lastryko klatki i panele.
2. `pietra-strop-kadr.png`: prawdziwy zrzut Przymorza z `npm run shots -- przymorze-przekroj` z nałożonym stropem na wszystkie mieszkania (klatki schodowe zostają widoczne), jak w wariancie 2 makiety. Nakładka tylko w skrypcie pomocniczym, bez zmian w grze.

Obejrzyj oba obrazy, zanim cokolwiek powiesz (zasada z CLAUDE.md).

## Bramka

`npm run lint`, `npm test`, `npm run build`, `npm run atlasy -- --sprawdz`. Kod bez zmian, więc boty i zrzuty gry nie dotyczą.

## Raport

Pierwsze zdanie: gałąź i commit. Potem: pomiary kontrastu (liczby), koszt w generacjach i saldo konta, polecany wariant naklejek i szwów z uzasadnieniem, co odrzuciłeś. Na końcu jedno pytanie do Mateusza: „Który wariant stropu bierzemy?” Raport do Mateusza i do koordynatora `pelna-gra` (`local_0c00c1f6-f613-4ef0-b681-c5cbba8c755d`).

## Czego nie robisz

Nie zamawiasz dachu (zatwierdzony zostaje), wnętrz, mebli ani drzwi. Nie zmieniasz `classify()`, symulacji, zrzutów. Nie podpinasz stropu do gry, bo piętra czekają jeszcze na projekt i na akceptację Mateusza.
