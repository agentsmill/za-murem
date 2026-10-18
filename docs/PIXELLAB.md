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
- `public/assets/`: atlasy i arkusze sprite'ów zrobione skryptem z `assets/raw`: `npm run atlasy` (`tools/atlasy.ts`) bierze tylko assety ze statusem `zatwierdzony` i pisze `teren.png` (16 kafelków Wanga w kolejności narożników), `blok.png` (moduły kawałka bloku: gzyms z górnym piętrem, środkowe piętro, parter, wejście, przęsła, profil attyki), `dach.png` (naklejki papy bez tła), `trzepak.png`, `ludzie.png` (animacje 24 postaci z `assets/raw/<id>/Idle/animations`: chód i stanie wszystkich, 14 prac zarządu; klatki po palecie, przycięte do sylwetki, spakowane w dwa pasy wierszy: mieszkańcy i zarząd) i opis `grafika.json`. Pliki są w repo, bo build ich nie robi; test `tests/unit/grafika-atlasy.test.ts` pilnuje, że odpowiadają `assets/raw` (po zmianie w surowych plikach albo w manifeście: `npm run atlasy`, sprawdzenie bez zapisu: `npm run atlasy -- --sprawdz`).
- Każdy typ obiektu ma też grafikę zapasową rysowaną kodem, żeby gra działała bez assetów i żeby można było budować mechanikę przed grafiką.
- Przed każdą większą paczką zamówień policzyć koszt z manifestu i zapytać Mateusza. Budżet na etap ustala Mateusz.

## Kotwica w grze (M3, 18.10.2026)

Gra wczytuje `public/assets/grafika.json` i atlasy przy starcie (`src/render/grafika.ts`), a rysuje z nich `src/render/art/pixellab.ts`. Bez plików, w innej wersji opisu albo bez sieci rysuje kod jak dawniej; bez jednego obrazka tylko ta część. `?grafika=kod` wyłącza grafikę z PixelLab (do porównań).

- Teren w kawałkach mapy (także w workerach): trawnik, park, chodnik i ścieżka z kafelków Wanga na podwójnej siatce (narożnik kafelka Wanga w środku kafelka świata, granica terenów na krawędzi kafelka). Narożnik liczy się jako trawnik dla trawy, parku i lasu, a jako chodnik dla całej reszty, więc trawnik przy jezdni, budynku albo wodzie ma krawężnik, a przy parku przechodzi bez krawężnika. Las, jezdnia, parking, woda, piaskownica, boisko i działki zostają z kodu. Jednolite kafelki są odbite według miejsca. Chodnik przy jezdni ma krawężnik z kodu, a cały teren ciemnieje przy ścianach i w cieniu budynków jak dawniej.
- Bloki (`cls === 'blok'`) z modułów: pas fasady z tyloma piętrami, ile ma budynek (13 px na piętro, `floorH` w stylu budynku), przęsła po x świata, nad drzwiami od południa moduł wejścia, na dachu papa z naklejkami i szwami i attyka od północy, zachodu i wschodu. Dach bez maszynowni, kominów i anten z kodu (jak w zatwierdzonym kadrze). Domy, garaże, pawilony i reszta budynków zostają z kodu, z dawną fasadą 9 px na piętro.
- Trzepak od frontu (3×1) z PixelLab, ze stopami w tym samym wierszu kafelka co betonowe stopy trzepaka z kodu. Trzepak bokiem (1×3) zostaje z kodu, bo PixelLab dał tylko widok od frontu.
- Postacie w grze (animacje z PixelLab): atlas `ludzie.png` i opis `postacie` w `grafika.json`. Pionek bierze postać z obsady po płci i wieku swojej osoby (`plec` i przedział `wiek` w manifeście): zarząd z czterech postaci zarządu (emeryt i emerytka od 58 i 52 lat, złota rączka i młoda poniżej), mieszkańcy z pozostałych dwudziestu, pionek bez osoby (przybysz, tłum) po numerze wyglądu. Ta sama osoba zawsze wygląda tak samo. Pozę z gry (`poseOf` w `src/render/poses.ts`) zamienia na animację `kluczAnimacji` i `numerKlatki` (`src/render/art/animacjePozy.ts`): chód i stanie, a u zarządu niesienie, rąbanie, klękanie, gotowanie, siedzenie (też drzemka), wartę, cios, celowanie, przeszukiwanie, młotek, deski i złom. Kierunek bez własnych klatek to odbity zachód. Szwendacze i brakująca praca zostają z kodu, a leżenie (sen, zwłoki) to komórka z klatki stania, z przejściami z PixelLab dla zarządu (niżej).
- Kolory: z jednej postaci robi się pięć wersji (oryginał i ubranie przemalowane na cztery rampy palety), więc 20 mieszkańców to 100 wyglądów. Przemalowanie robi gra w locie przy pierwszym użyciu wersji (`atlasWersji`, kopia pasa wierszy atlasu), a kolory ubrania są przy postaci w `grafika.json`: te kolory kandydatów (z manifestu albo zgadnięte), które w statycznej postaci leżą w większości na tułowiu (`koloryUbrania`). Pasa wysokości nad stopami nie ma, bo pozy przysiadu, klęczenia i siedzenia przesuwają ciało względem niego (czapka i broda zmieniały kolor razem z pozą); kolor dzielony z włosami, butami albo obrysem zostaje jak był. Zarząd ma wersje dla dubli: pierwszy pionek z danej postaci jest w oryginale, następne na rampach od najdalszej od jej ubrania (`rampyOdNajdalszej`), żeby nie były kopiami.
- Kotwica stóp: PixelLab stawia postać na środku płótna każdej animacji (48 px szablony, 64 albo 68 px animacje z opisu, każdy kierunek może mieć inne), więc stopy statycznej postaci względem środka (`stopyWzgledne`) są kotwicą wszystkich jej klatek. Najniższy piksel klatki odpada, bo siekiera wbita w ziemię, garnek albo gwóźdź podnosiłyby postać nad ziemię (klękanie, w którym stopy się podnoszą, stoi dolną krawędzią sylwetki).
- Broń: nakładka z kodu zostaje przy trzymaniu i ciosie. Przy celowaniu postać z PixelLab ma już pistolet w rękach, więc nakładki nie ma, a dzida (pchnięcie) bije klatkami ciosu z nakładką dzidy. Dłoń z `handOf` jest policzona dla postaci z kodu, więc w klatkach ciosu z PixelLab nakładka odstawała (pomiar `node tools/dlonie.ts`, plamy skóry poza głową: mediana błędu 8 px, w zamachu do 13 px; przy trzymaniu do 3 px, bez korekty). Tabela korekt `src/render/art/bronPixellab.ts` ma tylko wpisy, na które zgadza się pięć z sześciu wariantów próbki koloru skóry (detektor jest szumny, mediana zależy od próbki, czasem nawet znak): zamach z przodu i z tyłu, dokończenie z boku i pchnięcie dzidą. Po zmianie postaci albo ciosu przelicz ją tym narzędziem. Pełne rozwiązanie to prace z konkretną bronią w ręku (kij, siekiera, dzida, nóż, łom), czyli generacje na broń i kierunek.
- Leżenie i zwłoki bez generacji (19.10.2026): komórka leżenia powstaje z klatki stania przodem (kierunek południowy, klatka 0), obróconej ćwiartkami (`src/render/art/lezenie.ts`). Na podłodze cała sylwetka na lekkim cieniu i zawsze poziomo (głową do góry wygląda jak stojąca), w łóżku głowa z karkiem i półprzezroczysty koc, a łóżko z własnym kocem rysuje rzecz pod spodem. Zwłoki zarządu mają postać zmarłego, inne to dorosły mieszkaniec po wyglądzie. Tego, czego obrót nie da (kładzenie się, upadek, wstawanie), dają od 19.10.2026 animacje z PixelLab dla czterech postaci zarządu (następny punkt); mieszkańcy dalej leżą z komórki.
- Przejścia między staniem a leżeniem (19.10.2026): upadek przy śmierci (klucz `smierc`, szablon `falling-back-death`, 7 klatek, południe, północ i zachód, wschód to lustro zachodu) i wstawanie (`wstawanie`, szablon `getting-up`, 5 klatek, tylko zachód z lustrem). Kładzenie się to wstawanie od tyłu. Widok sam wykrywa zmianę stanu (`src/render/przejscia.ts`, stan tylko w widoku, nigdy w `SimState`): pionek, który zaczyna leżeć na podłodze, kładzie się, kto przestaje, wstaje, a zwłoki członka zarządu, który zginął podczas gry, upadają w kierunku, w którym patrzył (pionek znika w tym samym ticku, więc widok pamięta jego ostatni kierunek) i zostają na ostatniej klatce upadku. Zwłoki z wczytanej gry i ktoś, kto zginął we śnie, leżą od razu. Czas animacji to czas gry (8 klatek na sekundę wstawania, 10 upadku), więc na pauzie stoi, a z tempem gry przyspiesza. Na podłodze strona głowy idzie z kierunku pionka (`STRONA_PODLOGI`: południe w lewo, północ i zachód w prawo, wschód w lewo), tak kończy się upadek w danym kierunku, więc kładzenie, komórka leżenia i wstawanie stoją po tej samej stronie. W łóżku przejść nie ma (łóżko ma własną komórkę z głową i kocem, a ciało poziomo nie leży). Pobudka: pionek rusza z miejsca, w którym leżał, i dogania prawdziwe położenie do końca animacji (na początku powoli, na końcu szybciej), bo symulacja po pobudce od razu puszcza go ścieżką.
- Kotwica klatek przejść: PixelLab wyśrodkowuje ciało w płótnie, więc stojąca klatka ma stopy nisko, a leżąca środek ciała w środku płótna. Kotwica schodzi liniowo od dolnej krawędzi sylwetki (stoi) do jej środka 2 px nad punktem pionka (leży, tak samo jak komórka leżenia z kodu): `kotwicaPrzejscia` w `tools/ludzie.ts`, `SRODEK_LEZACEGO` w `animacjePozy.ts`, a test w `animacje-pozy.test.ts` pilnuje, że to ten sam środek co w `poseOf`. Dzięki temu ostatnia klatka upadku i pierwsza wstawania stoją tam, gdzie zaczyna się leżenie, bez skoku.

Koszt animacji obsady (18.10.2026, ostatecznie): szablon (`walking-4-frames`, `breathing-idle`, `crouching`, `cross-punch`) to 1 generacja na kierunek, animacja z opisu w trybie `pixminimax` (4 klatki, płótno 64 albo 68 px) też 1 na kierunek. Chód i stanie wszystkich 24 postaci w 4 kierunkach to 192 generacje, zarząd dostał do tego klękanie (4 kierunki) i 12 prac z opisu albo ciosu w trzech kierunkach (wschód to odbity zachód): 37 na postać, razem 148. W atlasie jest 340 generacji animacji, odrzucone próby i poprawki (pilotaże v3, drzemka, trzy podejścia do warty, pierwsze celowanie emeryta) dołożyły 17: 357 z uzgodnionych 400, wszystko z abonamentu (0 USD kredytów).

Koszt przejść i poprawek (19.10.2026): 24 generacje, wszystko z abonamentu, 0 USD kredytów (limit z zadania: najwyżej 43 z 400 uzgodnionych). Przejścia to 18: upadek (`falling-back-death`) w trzech kierunkach dla czterech postaci zarządu 12, wstawanie (`getting-up`) na zachód dla czterech 4 i pilot wstawania emeryta na południe i północ 2 (odrzucony). Poprawki to 6: warta emeryta na zachód 1 i gotowanie na zachód 5 (po jednej generacji dla emerytki, złotej rączki i młodej, dwie dla emeryta: próba w osobnej grupie, a potem to samo w grupie właściwej, bo identyczne zamówienie PixelLab uznał za to samo ujęcie). Szablony na płótnie 48 px kosztują 1 generację na kierunek (potwierdzone na rachunku zamówienia) i schodzą w 50 do 100 sekund. Zastąpione wersje zachodu (warta emeryta, gotowanie czterech) są w manifeście w `odrzucone` z kosztem. `get_balance` przed pilotem pokazywał 1339 generacji (w zleceniu było 1504, różnica nie jest z tego zamówienia), po wszystkich zamówieniach 1295 (ubyło 44, z czego moje 24 według rachunków zamówień, resztę wydała w tym czasie inna sesja), a kredytów USD cały czas 0. Przy równoległych sesjach liczą się więc rachunki zamówień, nie różnica salda. Z uzgodnionych 400 zostało 19 (357 + 24).

Opisy prac zarządu do powtórzenia (tryb `pixminimax`, `frame_count` 4, `keep_first_frame` false, kierunki `south`, `north`, `west`, `animation_name` jak w pierwszej kolumnie; `subject_description` to jedno zdanie o postaci, np. „a stocky handyman with stubble in a dark grey knitted beanie, navy blue work overalls over a grey hoodie and a tool belt”; klękanie to szablon `crouching` w czterech kierunkach, cios `cross-punch` w trzech):
- `niesienie-px`: walking forward while carrying a big bundle of three thick firewood logs against the chest with both arms, the logs clearly visible
- `rabanie-px`: chopping firewood: raising an axe high above the head with both hands, then swinging it down hard in front of the body
- `gotowanie-px`: stirring a pot with a long wooden spoon: standing and leaning slightly forward, the right arm moving the spoon in circles in front of the body
- `siedzenie-px`: sitting down on a chair and then staying seated, thighs horizontal, knees bent at a right angle, hands resting on the knees
- `warta-px`: standing guard with a small oil lantern hanging from the right hand down at the side near the hip, the arm relaxed, the lantern swaying gently while the head turns slowly to look around
- `celowanie-px`: standing in a shooting stance with both arms stretched straight forward holding a pistol, aiming and recoiling slightly
- `przeszukiwanie-px`: kneeling down on both knees and rummaging through a pile of junk on the ground with both hands
- `mlotek-px`: hammering: raising a hammer high in the right hand and bringing it down hard, driving a nail in front of the body, the left hand holding the nail
- `deski-px`: walking forward while carrying a stack of long wooden planks held in both hands at waist height, the planks clearly visible and wider than the shoulders
- `zlom-px`: walking forward while carrying a heavy box full of rusty scrap metal pieces against the belly with both arms, leaning slightly backwards, the scrap clearly visible
(Emeryt dostał pierwsze cztery kierunki prac z dłuższymi opisami i `initial_pose` z kierunkiem, wynik jest podobny. Nazwy `-px` odróżniają je od słabszych prób v3.)

Czego nauczyły animacje (18.10.2026):
- `animate_character` w trybie `pixminimax` z `keep_first_frame: false` daje dokładnie `frame_count` klatek, bez klatki referencyjnej. Opis bez kierunku wystarcza (obraz startowy to obrót postaci w danym kierunku), jedno wywołanie może zamówić trzy kierunki (`directions`) w jednej grupie. Kolejne kierunki albo poprawki doklada się do grupy przez `animation_group_id` z `animation_name` tak samo jak w grupie (inaczej grupa zmienia nazwę), a zła grupa (`delete_animation` z id grupy) znika w całości, nie po kierunku.
- Tier 1 przyjmuje najwyżej 8 zadań naraz (wywołanie, które się nie mieści, odpowiada błędem i nic nie zamawia). Zadanie trwa 1 do 4 minut, w zapchanej kolejce eta pokazuje 7 do 15 minut, ale i tak schodzi w kilka. Paczka postaci (ZIP) odpowiada 423, dopóki jakaś jej animacja się generuje, a `tools/animacje.ts` ponawia pobieranie.
- Płótno animacji z opisu zależy od sylwetki w danym kierunku (64 albo 68 px, w jednej animacji bywa różne), a szablony mają 48 px. Gotowanie bez garnka, celowanie bokiem w kierunku południowym i północnym (model nie umie wycelować do patrzącego) i warta bez latarni w kierunku zachodnim to ograniczenia, z którymi gra żyje. Warta: opis z „no fire” i „no glow” daje płaszcz w płomieniach, a latarnia „hanging from the right hand down at the side near the hip” daje czystą klatkę.
- Prace z opisu w wersji v3 wyszły słabsze niż w `pixminimax` za ten sam koszt, a `crouching` jest przysiadem, w którym stopy się podnoszą (klęczenie przy kozie ma tylko taką wersję).

Czego nauczyły przejścia (19.10.2026):
- Szablon `falling-back-death` daje czytelny upadek w każdym z trzech kierunków i zawsze kończy leżeniem poziomo: zachód i północ głową w prawo, południe głową w lewo (z podkurczonymi nogami). Postać idzie, przewraca się do tyłu i leży na plecach z uniesioną ręką, 7 klatek. Wszystkie cztery postacie wyszły spójnie (ubranie, czapka, włosy bez zmian), za pierwszym razem, bez poprawek.
- Szablon `getting-up` zaczyna się z leżenia półsiadem (tułów podparty, nogi wyciągnięte) i kończy staniem twarzą na zachód, 5 klatek, głowa leżącego w prawo. Na zachodzie działa, ale południe zaczyna się od przysiadu, a północ od czworaków i traci czapkę (odrzucone u emeryta, 2 generacje), więc wstawanie jest tylko na zachód, a lustro daje wschód. Upadek i wstawanie nie łączą się klatka w klatkę (upadek kończy płasko, wstawanie zaczyna półsiadem), ale po śmierci nikt nie wstaje, a kładzenie się do snu kończy komórka leżenia (jedno przejście od półsiadu do płaskiego leżenia).
- Szablony nie zmieniają kolorów postaci, więc przemalowanie ubrania na rampy (wersje kolorystyczne) działa na ich klatkach bez zmian.
- Poprawka warty emeryta na zachód: przy patrzeniu na zachód widać lewy bok postaci, a prawa ręka (z niej wisiała latarnia) jest za ciałem. Ten sam opis z lampą w lewej ręce dał lampę widoczną przy biodrze za pierwszym razem (u pozostałych trzech postaci lampa na zachodzie była już widoczna).
- Poprawka gotowania na zachód: bez słowa o garnku na ziemi model rysował w widoku z boku samą łyżkę (na południu i północy garnek się rysował). Opis „stirring a big cooking pot standing on the ground right in front of the feet with a long wooden spoon: leaning slightly forward, the left arm moving the spoon in circles inside the pot, the pot clearly visible” dał duży garnek u wszystkich czterech postaci; u emerytki garnek stoi po drugiej stronie, niż patrzy (postać odwrócona do widza w trzech czwartych), u pozostałej trójki przed nią.
- Podmiana kierunku w grupie: `delete_animation` z `animation_group_id` i `direction`, potem `animate_character` z tą samą grupą i `animation_name`. Identyczne zamówienie (ten sam opis i opis postaci) PixelLab uznaje za to samo ujęcie: odpowiada „already queued or complete”, nie liczy i nie dopina go do innej grupy, więc na świeże ujęcie trzeba zmienić słowa opisu. Identyfikatory grup są w `get_character` (nie ma ich w `metadata.json` z paczki).


## Budynki publiczne i zabytkowe (18/19.10.2026)

Mateusz: gra ma muzea, ratusze, kamienice i podobne obiekty, więc potrzebują własnych wizualizacji. Pierwsza partia to kamienica, ratusz, muzeum, kościół i budynek publiczny z lat 60. (urząd, poczta, biblioteka), po cztery propozycje (`assets/raw/budynek-*`, zestawienia `docs/postep/m3-budynki-zestawienie.png` i `m3-budynki-kandydaci.png`), 75 generacji. Druga partia po „Generuj” Mateusza: teatr, hotel z lat 70., dworzec, willa, remiza OSP i szpital (`m3-budynki-zestawienie-2.png` i `m3-budynki-kandydaci-2.png`), 90 generacji. Razem 11 typów i 165 generacji z abonamentu, 0 USD. Remiza i szpital dołożone dlatego, że gra już rozpoznaje te punkty z map (`fire_station`, `hospital`). Mateusz zatwierdził polecane wersje wszystkich 11 typów (19.10.2026: „Bierzemy polecane wersje wszystkich 11 budynków”): kamienica #0, ratusz #0, muzeum #1, kościół #2, urząd #0, teatr #0, hotel #2 (z napisem HOTEL), dworzec #1, willa #0, remiza #0 i szpital #0. W manifeście mają status `zatwierdzony` i pole `wybrany`, a pozostałe propozycje zostają w `assets/raw/budynek-*` jako warianty bez statusu (do urozmaicenia ulicy). Gra ich jeszcze nie używa: `npm run atlasy` bierze tylko assety, dla których ma kod składania, więc atlasy się nie zmieniły.

Jak powstały: `create_image_pro` 160×128, ratusz i kościół 160×160 (mają wieże; powyżej 170 px zamówienie daje jednego kandydata zamiast czterech), 15 generacji za cztery propozycje, paleta `Za Murem 2051`. Kawałek bloku z kotwicy (`assets/raw/kotwica-blok/1.png`) idzie jako wzorzec rzutu, skali i stylu, z dopiskiem, że architektura ma być zupełnie inna. Wzorzec trzeba wgrać przez `get_upload_url`: adres pobrania wyniku wcześniejszego zamówienia po kilku godzinach odpowiada 404.

Czego nauczyły:
- Rzut z dachem na górze i pasem fasady pod spodem trzyma się przy opisie „the roof is seen from above in the upper part, the short front facade strip below”. Wyjątek to kościół: dwie z czterech propozycji wyszły izometrycznie jak sześcian. Przy kolejnych kościołach dopisać wprost „seen straight from the front”.
- Kondygnacje wychodzą po około 19 px (kamienica) i 18 px (urząd), a nie 13 px jak w bloku, co pasuje do wyższych pięter budynków zabytkowych. Okna co około 25 px, czyli gęściej niż w prawdziwych kamienicach, to ta sama umowność co w bloku z kotwicy.
- Każdy obraz używa 9–13 kolorów z palety. Tło to płaski kolor, różny dla typu (`#b7b2a6`, `#6f6b64`, `#9a958a`, `#7c796f`), do wycięcia wypełnieniem od brzegu.
- Z czterech propozycji jedna do dwóch jest w miarę nienaruszona, reszta to warianty zarośnięte bluszczem albo zrujnowane, więc ulica kamienic nie musi powtarzać jednego wyglądu.

- Nie wpisywać nazw marek w opisach: „Orbis style” w opisie hotelu dało napis ORBIS na dachu w trzech z czterech propozycji (wersja z napisem HOTEL jest polecana).
- Tło bywa płaskie (kamienica, ratusz, muzeum, kościół, urząd, dworzec, remiza) albo jest kawałkiem otoczenia w kadrze (hotel, willa, szpital: ulica, ogród z płotem, trawa i gruz), wtedy kadr zostaje prostokątem. Napisy na tablicach (TEATR, OSP, SZPITAL, HOTEL) wychodzą czytelnie, na szyldach stacji nie.

Czego brakuje, żeby gra to pokazała:
1. Rozpoznanie typu. Kafelki wektorowe nie mają typu budynku, a `classify()` zgaduje po wysokości, powierzchni i punktach w środku: kamienica z czterema piętrami wychodzi jako blok z balkonami, ratusz i biblioteka jako sklep (kategorie punktów `urzad` i `biblioteka` są, ale `BuildingClass` ich nie ma), a muzeum nie ma żadnej kategorii (w `AMEN` w `src/world/mvt.ts` są `library` i `townhall`, brak `museum`). Potrzebne nowe klasy i reguły zgadywania. Demo (Przymorze, Lanciego, Zielonki) nie mają takich budynków, ale nowe reguły mogą zmienić klasę innych, więc skróty botów trzeba sprawdzić.
2. Moduły jak dla bloku (pas fasady z piętrami, przęsła, wejście, gzyms) i elementy jednorazowe na osi środkowej: wieża ratusza, portyk muzeum, wieża kościoła.
3. Warianty i przemalowania tynku, żeby sąsiednie kamienice się nie powtarzały.

## Strop pięter (19.10.2026)

Gra dostanie piętra: przełącznik w pasku u góry tnie budynki na wybranej wysokości, klatka schodowa jest widoczna, a mieszkania za zamkniętymi drzwiami zasłania strop. Mateusz: „bedzie ‘strop’ cos innego kolory niz dach”, z makiety wybrał „Ciepły tynk” (beż jak sufit w mieszkaniu, w makiecie `#cdb08c`). Zamówione dwa razy `create_tiles_pro` 32 px (po 10 generacji, razem 20 z abonamentu, 0 USD, saldo po obu 1301 z 2000): `strop-tynk-v1` (odrzucone, szare) i `strop-tynk` (poprawka, `zatwierdzony` 19.10.2026, `assets/raw/strop-tynk/`). Po 16 kafelków, czyli po dwa na każdy z ośmiu opisów (numer i oraz i+8). Zestawienia: `docs/postep/pietra-strop-arkusz.png` (kafelki, tło 4 × 4 z odbiciami, strop z oboma wariantami szwów, obok dach, lastryko, panele i linoleum) i `docs/postep/pietra-strop-kadr.png` (prawdziwy zrzut Przymorza z `npm run shots -- przymorze-przekroj` ze stropem nałożonym w skrypcie pomocniczym na mieszkania, klatki i ściany zostają). Gra stropu nie używa: czeka na podpięcie po projekcie pięter.

Mateusz zatwierdził wariant 19.10.2026 (słowa przekazane przez sesję „Kafelki stropu PixelLab”): „Bierzemy polecany (tło z kodu, szwy 96×64, naklejki #3–#6, gęstość 0,12), ale tło bardziej beżowe niż łososiowe i szare plamy rzadsze i drobniejsze. Poprawka tylko w polach uzycie, bez nowego zamówienia.” Poprawka zrobiona w polach `uzycie`, bez nowych generacji (patrz niżej, „Poprawka tła”).

Czego nauczyły:
- Na fasadzie bloku z kotwicy nie ma okna 32 × 32 bez okien i szwów (płyta między oknami ma najwyżej 12 × 5 px), więc wzorzec stylu to 32 × 32 w kolorze płyty fasady `#9a958a` (`assets/wejscia/strop-wzorzec-32.png`), a nie wycinek. Współrzędne źródła są w manifeście.
- `create_tiles_pro` ze wzorcem stylu kopiuje jego kolory mimo `palette`. Pierwsze zamówienie wyszło więc szare (`#b7b2a6`, o 22 za mało czerwieni i 26 za dużo niebieskiego względem `#cdb08c`). Pomogło `style_options` z `color_palette: false` i dopisek „sandy peach beige colour” w opisie.
- Kafelek w kolorze `#cdb08c` z tej palety nie powstanie: najbliższy beż to `#e0b48c`, a PixelLab wybrał `#e3b79a` („skóra”, 227,183,154, o 22 za dużo czerwieni). Średnią w granicach ±14 daje dopiero tło z kodu.
- Kafelki są płaskie (1 do 3 kolorów), więc „very faint grain” szumu nie daje. Tło rysuje kod od współrzędnych świata (przepis w `uzycie` w manifeście), a z kafelków zostają naklejki: rysa (#4), plama zalania (#3), łata jaśniejszego tynku (#5) i pleśń (#6), z kluczem przezroczystości `#e3b79a`. Gęstość 0,12 daje około 6 naklejek na 54 kafelki.
- Jasnej ramki jak na dachu tym razem nie ma (jedyny wyjątek to ciemna obwódka w #8), ale naklejki #5 i #6 mają pasy przy krawędzi, więc `wnetrze_wariantu` przycina je osobno. Surowe kafelki odbite 4 × 4 pokazują powtórzenia (rysa układa się w girlandę, narożniki #11 w kwiatki), więc surowych nie kładziemy jako tła.
- Opis „plain uniform” i „faded and lighter” dają prawie biały `#e3e0d6`, opis „darker and dustier” szary `#9a958a`. Plama zalania wyszła szara, pleśń to ciemne kropki.
- Szwy (kod, 1 px `#b07a55`): 96 × 64 (płyty 3 × 2 m, jak na dachu). Co 32 px (1 m) wygląda jak płytki i dubluje szwy lastryko w klatce.

Poprawka tła (19.10.2026, po uwagach Mateusza „za łososiowe, za duże szare plamy”). Pierwsza wersja tła (baza `#e0b48c`, plamy `#b7b2a6` 14% przy kracie 6, `#9a958a` 3% przy kracie 5 i `#e3b79a` 12% przy kracie 7) miała średnią `#d9b391` (217,179,145, R−G 37,6) i duże szare plamy jak kamuflaż. Nowa: baza `#e0b48c` z ziarnem `#cac6bc` po pojedynczym pikselu (28%), które zlewa się optycznie z bazą w beż, rzadkie drobne plamy `#b7b2a6` (5%, krata 3 px) i `#9a958a` (1%, krata 2 px) oraz 2% pikseli `#765e42`, które obniżają czerwień i błękit. Średnia `#d6b798` (214,183,152), czyli +9, +7, +12 względem `#cdb08c` (w granicach ±14), R−G 31,0. Dalej w stronę beżu się nie da: R−G 30 wymaga już +14 w błękicie, czyli granicy ±14, a ziarno `#cac6bc` podnosi błękit najmocniej, więc wybrałem wariant z zapasem 1,9 w błękicie. Przepis (kolory, udziały, rodzaj i krata) jest w `uzycie.szum`, poprzedni zapis w `uzycie.szum.poprzednio`.

Pomiary po poprawce (skrypt pomocniczy poza repo, tło 512 × 512 px z przepisu, luminancja względna WCAG, ΔE CIE76 do średnich kolorów powierzchni z kodu i zrzutów):

| powierzchnia | średni kolor | strop jaśniejszy razy | ΔE po | ΔE przed |
| --- | --- | --- | --- | --- |
| dach z PixelLab (papa) | `#313336` | 15,3 | 59,6 | 60,4 |
| dach z kodu: papa | `#585450` | 5,6 | 43,9 | 44,8 |
| dach z kodu: żwir | `#9a968d` | 1,6 | 21,2 | 23,6 |
| dach z kodu: dachówka | `#a24f36` | 3,7 | 42,8 | 40,4 |
| dach z kodu: blacha | `#767c81` | 2,5 | 34,6 | 36,7 |
| lastryko klatki | `#9a958a` | 1,7 | 20,6 | 22,9 |
| panele | `#9f7850` | 2,4 | 24,5 | 22,7 |
| panele wytarte | `#c4a47c` | 1,3 | 8,9 | 7,2 |
| linoleum kuchni | `#cdbf9b` | 0,9 | 7,5 | 10,1 |

Warunek z zamówienia (co najmniej 2,5 razy jaśniejszy od dachu `#313336`) spełniony z zapasem, 15,3 razy; różnica ciepła: R−B strop 61 (było 72), dach −5, lastryko 16. Słabe miejsce to linoleum kuchni i wytarte panele: po zbeżowieniu ΔE do linoleum spadło z 10,1 do 7,5, a do wytartych paneli wzrosło z 7,2 do 8,9, więc strop odróżnia od nich głównie siatka szwów 3 × 2 m, a nie kolor (makieta Mateusza też to zaznaczała). Dlatego w `uzycie.krawedz` jest propozycja ciemniejszej krawędzi stropu na granicy mieszkania (2 px `#765e42`, podgląd w arkuszu); gra jej nie używa, decyzja przy podpinaniu pięter.

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
