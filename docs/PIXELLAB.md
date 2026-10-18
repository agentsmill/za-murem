# PixelLab: jak go używamy

PixelLab (pixellab.ai) generuje pixel art: postacie w 4 albo 8 kierunkach z animacjami, kafelki terenu z przejściami, obiekty na mapę, moduły budynków, elementy interfejsu. Ma serwer MCP, więc Claude Code woła jego narzędzia bezpośrednio, bez pisania klienta API.

Stan wiedzy z 16.10.2026, z dokumentacji MCP (api.pixellab.ai/mcp/docs), opisu API v2 (api.pixellab.ai/v2/llms.txt) i strony cennika API (pixellab.ai/pixellab-api). Przed większym zamówieniem sprawdź, czy coś się nie zmieniło.

## Podłączenie do Claude Code

1. Mateusz bierze token z https://api.pixellab.ai/mcp (konto PixelLab).
2. W terminalu, w folderze projektu:

```bash
claude mcp add --transport http pixellab https://api.pixellab.ai/mcp --header "Authorization: Bearer TU_TOKEN"
```

3. W Claude Code `/mcp` i sprawdzić, czy przy `pixellab` jest ptaszek. Z terminala: `claude mcp list`.

Domyślny zakres to `local`, konfiguracja ląduje w `~/.claude.json`, a nie w repo. Tak ma zostać, bo repo jest publiczne. Tokena nigdy nie zapisujemy w plikach projektu ani w `.mcp.json`.

Jeśli narzędzi PixelLab nie widać, trzeba powiedzieć Mateuszowi, że MCP nie jest podłączony. Dokumentacja PixelLab wprost prosi, żeby wtedy nie obchodzić tego przez curl albo API v2.

## Co jest do dyspozycji (wybór)

Postacie
- `create_character`: tryby standard, pro i v3; 4 albo 8 kierunków; widok `low top-down` (około 20°, klasyczne 3/4 RPG), `high top-down` (około 35°), `side`, `oblique` (beta, tylko 4 kierunki). Rozmiar do 128 px (standard i pro) albo 256 px (v3).
- `animate_character`: animacje z szablonów (np. `walking-8-frames`, `running-6-frames`, `breathing-idle`, `crouched-walking`) albo z opisu tekstem (v3: 4 do 16 klatek, parzyście). Animacja z szablonu kosztuje 1 generację na kierunek.
- `create_character_state`: wariant istniejącej postaci (inne ubranie, ranna, w zimowej kurtce).
- Spójny styl postaci: `style_character_id` (tylko tryb pro, postać wzorcowa musi mieć 8 kierunków).

Teren
- `create_topdown_tileset`: kafelki Wanga z przejściem między dwoma terenami, 16 albo 32 px (64 w pro). Kolejne zestawy łączy się przez `lower_base_tile_id` i `upper_base_tile_id`, żeby przejścia pasowały do siebie.
- `create_tiles_pro`: kafelki 16-128 px, typy `square_topdown`, `oblique`, `isometric`, hex; `tile_feature: "tileset"` daje łączący się teren; `style_images` dopasowuje styl do wzorca.
- `create_path_tiles`: ścieżki i chodniki, dla `square_topdown` dokładnie 32 px.

Budynki
- `create_building_kit`: zestaw modułów budynku. `tile_type` może być `square_topdown`, `oblique` (kwadratowy dach i ściany ścięte w dół w prawo) albo `isometric`; `tile_size` 16-96; `wall_tiles` 1-3 (wysokość ściany w kafelkach); `layout: materials` daje bardziej spójne kawałki. To jest klucz do składania bloków z obrysów OSM z modułów zamiast rysowania każdego budynku osobno.

Obiekty
- `create_map_object`: obiekt na mapę, widok `low top-down`, `high top-down` (domyślny) albo `side`, opcjonalnie dopasowany do tła.
- `create_1_direction_object` (16-256 px) i `create_8_direction_object` (24-168 px), `animate_object`, `create_object_state` (np. koza zimna i koza rozpalona). Spójny styl przez `style_object_id` albo `style_image_base64`.

Inne
- `create_ui_asset` (panele 192-688 px), `create_font`, `create_portrait_character` (portrety do kart ludzi), obrazy pixflux, pixen i pro, edycja, inpainting.
- Większość narzędzi przyjmuje `palette`, `palette_name` i `max_colors`. Tego używamy, żeby wszystko miało jedną paletę.

Praca jest asynchroniczna: narzędzie oddaje identyfikator od razu, wynik jest po około 2-5 minutach (kafelki około 100 s), stan sprawdza się odpowiednim `get_*`. Pliki do pobrania nie wymagają logowania. Animacje można kolejkować zaraz po utworzeniu postaci.

## Generowanie map (Mateusz ma wyższy plan od 16.10.2026)

PixelLab ma narzędzie Create map (model Pixflux): mapa w widoku z góry albo z boku z opisu tekstem, z obrazem startowym (init image) i z paletą. Limit powierzchni płótna zależy od planu: darmowy 200×200, tier 1 320×320, tier 2 i wyżej 400×400 px. W MCP odpowiada temu `create_image_pixflux` z `init_image_url` (obraz musi mieć dokładnie zadany rozmiar, `init_image_strength` 150 to już prawdziwa edycja). Są też narzędzia do rozszerzania mapy (Extend map) w edytorze. Sprawdź w `search_help`, które z nich są dostępne przez MCP.

Do czego tego używamy:
- Pocztówka z osiedla. Rysujemy własny układ osiedla gracza w skali 1 px na metr (384 m to 384×384 px, mieści się w limicie) z kolorami jako mapą znaczeń: bloki, ulice, zieleń, woda. Podajemy to jako obraz startowy i dostajemy pikselową mapę „twoje osiedle w 2051”. Na ekran startowy, do gazetki i do udostępniania. To mocny element wiralowy, bo każdy dostaje obrazek swojego prawdziwego osiedla.
- Widok całego osiedla po maksymalnym oddaleniu kamery, jeśli wygląda lepiej niż pomniejszone kafelki.
- Grafiki koncepcyjne przy ustalaniu kotwicy stylu.

Do czego nie:
- Do grywalnego świata 1 m. Przy 32 px na metr obszar 384 m to ponad 12 tysięcy pikseli w bok, czyli setki osobnych obrazów, które nie trzymałyby jednego stylu i nie dałyby się zmieniać w trakcie gry (ścięte drzewo, nowa grządka, zbita szyba). Świat gry składamy z kafelków, modułów budynków i obiektów.

Pocztówki generuje gra na żywo dla każdego gracza? Nie. Klucz API nie może trafić do przeglądarki, a backendu nie mamy. Na start pocztówki robimy dla przykładowych osiedli i do materiałów. Pocztówka na żądanie dla każdego adresu wymagałaby małego serwera pośredniczącego i zgody Mateusza na koszty.

## Koszty jednostkowe (szacunki PixelLab, USD)

- Postać 8 kierunków 64×64: około 0,017 (v2), 0,041 (v3 64×64), 0,08-0,15 (pro).
- Animacja na kierunek: v3 4 klatki 64×64 około 0,013; szablon 64×64 około 0,032.
- Zestaw kafelków top-down 32 px: około 0,01.
- Kafelki pro: 0,08-0,15.

Pierwsza fala z listy niżej to według tych stawek rząd 15-40 USD z poprawkami. To mój szacunek, nie cena PixelLab. Abonament i limity generacji sprawdzić na pixellab.ai przed startem.

Koszt w generacjach abonamentu, zmierzony na koncie przy kotwicy stylu 18.10.2026 (Tier 1: 2000 generacji na miesiąc, kredyty USD idą dopiero po wyczerpaniu generacji, a przy 0 USD nic ponad abonament nie przejdzie):

- `create_map_object` 96×64: 1. `create_image_pixflux`: 1. `reduce_colors`: 0,1.
- `create_character` v3, płótno 48 albo 64: 2.
- `create_object_pro_flash` 96×64: 5.
- `create_topdown_tileset` 32 px: standard 4, pro 15.
- `create_building_kit` 32 px, `create_tiles_pro` 32 px, `edit_image` 160×128: po 10.
- Z cennika w opisie narzędzi (jeszcze niezmierzone): `animate_character` z szablonu 1 na kierunek, z opisu przy postaci 48 px około 1 na kierunek; `create_character_state` 10–25.
- `create_image_pro` 160×128 (cztery propozycje w jednym zamówieniu): 15.

## Licencja

Regulamin PixelLab (pixellab.ai/termsofservice, sprawdzony 18.10.2026): wygenerowana grafika jest nasza (pkt 1.3), wolno jej używać komercyjnie i niekomercyjnie, zmieniać ją i rozpowszechniać (pkt 3.3), bez obowiązku podpisu. Jedno ograniczenie: nie wolno trenować na niej własnych modeli bez zgody PixelLab (pkt 1.2 i 3.3). Do tego obowiązuje licencja Open RAIL-M modelu (pkt 4.1). Surowe pliki mogą więc leżeć w publicznym repo.

## Zasady stylu

1. Najpierw kotwica stylu: jeden kafelek trawy z chodnikiem, jeden obiekt (trzepak), jedna postać (emeryt w kurtce), jeden kawałek bloku z modułów. Pokazać Mateuszowi, poprawić, zatwierdzić. Zatwierdzona przez Mateusza 18.10.2026 („Biorę kotwicę stylu z tą obsadą i fasadą 13 px na piętro”, gałąź `kotwica-stylu`): chodnik z trawnikiem, trzepak, 24 postacie (zarząd i mieszkańcy), kawałek bloku z modułów i warianty papy na dach. W manifeście mają status `zatwierdzony`. Ustalenia z akceptacji: fasada bloku ma 13 px na piętro, czyli `floorH` 13 zamiast 9 przy podpinaniu bloków; tłum to 24 postacie z PixelLab, a różne wyglądy daje kod, który przemalowuje ubrania na rampy z `assets/palette.json`; każdy obiekt zostaje też w wersji rysowanej kodem.
2. Z kotwicy zapisać paletę (około 32 kolory) w `assets/palette.json` i podawać ją do każdego kolejnego zamówienia. Zapisana 18.10.2026, razem z rampami do przemalowań ubrań.
3. Kafelek 32 px = 1 m. Widok `low top-down` dla wszystkiego, co stoi na mapie. Postacie na płótnie 48 albo 64 px, 8 kierunków.
4. Każdy następny asset z referencją stylu (`style_images`, `style_object_id`, `style_character_id`) do zatwierdzonej kotwicy. Postacie: `create_character` v3 z tymi samymi ustawieniami (płótno 48, dzieci 36–40, `low top-down`, `single color outline`, `medium detail`), a w trybie pro `style_character_id` emeryta (6cef90c9-22a6-496a-b24d-9bf4df154bd3). Obiekty: `create_object_pro_flash` z paletą, wzorzec stylu trzepak. Teren: zestawy dowiązane przez base tile id chodnika i trawy (manifest, `kotwica-chodnik-trawa`). Budynki: `create_image_pro` ze wzorcem kawałka bloku (`assets/raw/kotwica-blok/1.png`).
5. Warianty pór roku przez `create_object_state` i osobne zestawy kafelków (śnieg), nie przez filtr koloru.

## Czego nauczyła kotwica stylu (18.10.2026)

Szczegóły, prompty i koszty każdej próby są w `assets/manifest.json`, zestawienie w zrzutach `kotwica-stylu` i `kotwica-arkusz` (`npm run shots -- kotwica`).

- Paleta: `create_topdown_tileset` i `create_character` przyjmują `palette` tylko w trybie pro (standard i v3 odmawiają, choć pomoc PixelLab twierdzi inaczej), `create_map_object` nie ma jej wcale. Wtedy zamawiamy bez palety i dociągamy wynik przez `reduce_colors` z paskiem palety (`assets/wejscia/paleta-32.png`), wszystkie kierunki postaci w jednym wywołaniu.
- Obrazki do narzędzi idą przez `get_upload_url` i `curl -F`, a nie jako base64 w argumencie (klient potrafi je uciąć). Do zamówień, które biorą obrazek z adresu, wystarczy też adres pobrania wyniku z PixelLab.
- Trzepak i inne obiekty: `create_map_object` rysuje po swojemu (ukośnie, z kępą trawy), `create_object_pro_flash` z paletą trzyma opis i rzut od frontu.
- Teren: zestaw pro z paletą wyszedł dobrze, standard był jaskrawy. Kolejny zestaw dowiązany przez `lower_base_tile_id` zostawia ten sam chodnik. Trawnik trzeba opisywać jako spokojny i o niskim kontraście, bo „kilka liści” daje łąkę z makami. Jednolite kafelki da się odbijać w poziomie i pionie, żeby nie było widać powtórzeń. Teren gry jest zapisany per kafelek, a kafelki Wanga patrzą na narożniki, więc rysujemy je na podwójnej siatce: narożnik kafelka Wanga to środek kafelka świata, a granica terenów wypada wtedy na krawędzi kafelka.
- Postać v3 wypełnia całe płótno: 64 px to 63 px wzrostu, czyli około 2 m i olbrzym przy ludziach z gry (45 px). Płótno 48 daje 47 px, tyle co dziś.
- Paczki postaci: Tier 1 przyjmuje najwyżej 8 zadań naraz (dalej odpowiada 429), więc większe paczki idą falami po 8. Płótno v3 musi być wielokrotnością 4. Dzieci na mniejszym płótnie (36–40 px), bo v3 rysuje postać na całą wysokość płótna. Zadanie, które stanie po stronie PixelLab, nie jest liczone, wystarczy zamówić jeszcze raz. `reduce_colors` bierze klatki jednego rozmiaru, razem do 512×512 px (14 postaci 48 px po 8 kierunków na wywołanie, 0,1 generacji).
- Różne postacie: każda nowa postać v3 w tych samych ustawieniach (płótno 48, `low top-down`, `single color outline`, `medium detail`) wychodzi w tym samym stylu bez wzorca, za 2 generacje. Kolory ubrań dla tłumu przemalowuje kod (`przemalowanie` przy postaci i `rampy` w palecie w manifeście), bo stany postaci kosztują 10–25 generacji. Pełna obsada, 12 postaci z chodem i pięcioma pracami, to według cennika około 310 generacji w 4 kierunkach albo 600 w 8.
- Blok: `create_building_kit` w `square_topdown` skraca ziemię do 32×24 (gra ma 32×32 z góry), a ściany dwukafelkowe mają okna co około 21 px, bez balkonów. Do sprawdzenia `tile_view_angle` 90 z niskim `wall_angle`. Modele pro (`create_image_pro`, `edit_image`) rysują fasadę w naturalnej skali około 13 px na piętro. Przy 9 px na piętro, jak dziś w grze (`floorH` w `src/render/art/scene.ts`), da się tylko przemalować wycinek przez img2img. Kawałek bloku z `create_image_pro` składamy w moduły: profil attyki, pas fasady (gzyms z górnym piętrem, środkowe piętro powtarzane, parter z cokołem), przęsła wzdłuż ściany, wejście nad drzwiami. Prostokąty są w manifeście.
- Dach: `create_tiles_pro` ze wzorcem stylu daje 16 wariantów papy, ale każdy z jasną ramką, więc obok siebie wyglądają jak posadzka. Dach to tło w kolorze papy z szumem i szwami, a środki kafelków (kałuża, mech, odpływ, gruz, spękania, żwir) są rzadkimi naklejkami.

## Jak trzymać assety w repo

- `assets/manifest.json`: każdy asset ma id, narzędzie, prompt, parametry, identyfikator PixelLab, koszt, status (zamówiony, gotowy, zatwierdzony, odrzucony), ścieżkę pliku.
- `assets/raw/<id>/`: pliki dokładnie tak, jak przyszły z PixelLab. Nie edytować ręcznie. Biome ich nie sprawdza.
- `assets/wejscia/`: nasze obrazki dla PixelLab (obraz startowy, pasek palety), żeby zamówienie dało się powtórzyć.
- `public/assets/`: atlasy i arkusze sprite'ów zrobione skryptem z `assets/raw`: `npm run atlasy` (`tools/atlasy.ts`) bierze tylko assety ze statusem `zatwierdzony` i pisze `teren.png` (16 kafelków Wanga w kolejności narożników), `blok.png` (moduły kawałka bloku: gzyms z górnym piętrem, środkowe piętro, parter, wejście, przęsła, profil attyki), `dach.png` (naklejki papy bez tła), `trzepak.png`, `ludzie.png` (24 postacie po 5 wersji: oryginał i 4 przemalowania z ramp palety, po 8 kierunków, klatki 48 px) i opis `grafika.json`. Pliki są w repo, bo build ich nie robi; test `tests/unit/grafika-atlasy.test.ts` pilnuje, że odpowiadają `assets/raw` (po zmianie w surowych plikach albo w manifeście: `npm run atlasy`, sprawdzenie bez zapisu: `npm run atlasy -- --sprawdz`).
- Każdy typ obiektu ma też grafikę zapasową rysowaną kodem, żeby gra działała bez assetów i żeby można było budować mechanikę przed grafiką.
- Przed każdą większą paczką zamówień policzyć koszt z manifestu i zapytać Mateusza. Budżet na etap ustala Mateusz.

## Kotwica w grze (M3, 18.10.2026)

Gra wczytuje `public/assets/grafika.json` i atlasy przy starcie (`src/render/grafika.ts`), a rysuje z nich `src/render/art/pixellab.ts`. Bez plików, w innej wersji opisu albo bez sieci rysuje kod jak dawniej; bez jednego obrazka tylko ta część. `?grafika=kod` wyłącza grafikę z PixelLab (do porównań).

- Teren w kawałkach mapy (także w workerach): trawnik, park, chodnik i ścieżka z kafelków Wanga na podwójnej siatce (narożnik kafelka Wanga w środku kafelka świata, granica terenów na krawędzi kafelka). Narożnik liczy się jako trawnik dla trawy, parku i lasu, a jako chodnik dla całej reszty, więc trawnik przy jezdni, budynku albo wodzie ma krawężnik, a przy parku przechodzi bez krawężnika. Las, jezdnia, parking, woda, piaskownica, boisko i działki zostają z kodu. Jednolite kafelki są odbite według miejsca. Chodnik przy jezdni ma krawężnik z kodu, a cały teren ciemnieje przy ścianach i w cieniu budynków jak dawniej.
- Bloki (`cls === 'blok'`) z modułów: pas fasady z tyloma piętrami, ile ma budynek (13 px na piętro, `floorH` w stylu budynku), przęsła po x świata, nad drzwiami od południa moduł wejścia, na dachu papa z naklejkami i szwami i attyka od północy, zachodu i wschodu. Dach bez maszynowni, kominów i anten z kodu (jak w zatwierdzonym kadrze). Domy, garaże, pawilony i reszta budynków zostają z kodu, z dawną fasadą 9 px na piętro.
- Trzepak od frontu (3×1) z PixelLab, ze stopami w tym samym wierszu kafelka co betonowe stopy trzepaka z kodu. Trzepak bokiem (1×3) zostaje z kodu, bo PixelLab dał tylko widok od frontu.
- Postacie czekają na animacje: atlas `ludzie.png` jest gotowy, ale pionki rysuje dalej kod. Zrzut `kotwica-tlum` stawia obsadę z atlasu w miejscu pionków tylko na czas zrzutu.

Koszt animacji obsady (cennik `animate_character` z opisu narzędzia, 18.10.2026): szablon (`walking-*`, `breathing-idle`, `crouching`, `picking-up`) to 1 generacja na kierunek, animacja z opisu (v3) to `ceil(płótno² · klatki / 65536)` na kierunek liczone na płótnie po wzroście sylwetki, przy postaci 48 px (płótno około 64 px) też 1 na kierunek. Prace z `POSES` w `src/render/art/people.ts`: niesienie drewna, rąbanie, klęczenie przy kozie, gotowanie, siedzenie, warta z lampą, cios, celowanie, przeszukiwanie, młotek, deski, złom i drzemka (13), do tego chód i stanie. Zarząd (4 postacie) ze wszystkim i mieszkańcy (20) z chodem i staniem to 4 · 15 + 20 · 2 = 100 animacji: 400 generacji w 4 kierunkach albo 800 w 8, bez poprawek. Tier 1 przyjmuje najwyżej 8 zadań naraz.

## Pierwsza fala assetów (wycinek pionowy)

Teren (zestawy Wanga 32 px, połączone ze sobą):
trawa / ubita ziemia; trawa / asfalt; asfalt / chodnik z płyt; trawa / piasek (piaskownica); ziemia / grządki; trawa / woda; wersje zimowe ze śniegiem.

Budynki (`create_building_kit`, oblique, 32 px):
wielka płyta szara z balkonami; wielka płyta po termomodernizacji w pastelach; dom jednorodzinny (tynk i dachówka); garaż blaszak; pawilon handlowy. Wnętrza (`create_tiles_pro`, square_topdown, 32 px): lastryko z klatki, panele, linoleum z PRL, beton piwnicy, płytki w łazience, ściany działowe, drzwi, okna.

Obiekty na zewnątrz:
trzepak, ławka, altana śmietnikowa, piaskownica, huśtawka, latarnia, drzewo liściaste (lato, jesień, zima, suche), sosna, krzak, ognisko (animowane), beczka z ogniem (animowana), stos drewna, stos złomu, barykada, grządka (etapy wzrostu), maluch bez kół, polonez, garaż otwarty, gołębnik, kapliczka. Satyra: martwy paczkomat, hulajnoga, Tesla z blokadą, siłownia plenerowa, ławka z ładowarką USB, panele na balkonie, antena satelitarna, pranie na sznurku (animowane).

Obiekty we wnętrzach:
koza (zimna i rozpalona) z rurą, wersalka, łóżko, meblościanka, stół z krzesłami, kuchenka, lodówka na abonament (martwa), wanna, regał, skrzynia, warsztat z imadłem, generator, radio, serwer.

Postacie (`create_character` v3, 8 kierunków, low top-down):
emerytka, emeryt, złota rączka, pielęgniarka, informatyk w bluzie, licealistka, dziecko, dresiarz, kucharka, influencer survivalowy, prompt engineer, doradca ESG, ochroniarz, pies (czworonóg). Warianty ubrań przez `create_character_state`.

Animacje dla każdej postaci rdzenia:
chód (8 kierunków), stanie (breathing-idle), rąbanie, noszenie skrzyni, gotowanie przy kuchni, siedzenie przy ogniu, spanie, ranny na ziemi. Dla tłumu wystarczy chód i stanie.
