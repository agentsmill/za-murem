# Piętra: przekrój na wybranej wysokości, klatka i strop (eksperyment)

Rozmowa z Mateuszem 18 i 19.10.2026. Dokument opisuje, co ma powstać i dlaczego, tak żeby dało się z niego zrobić plan bez dopytywania. Słowa Mateusza są w cudzysłowie (pisownia z jego wiadomości), rozstrzygnięcia oznaczone „(moje)” to moje wybory do przejrzenia. Kod dopiero po akceptacji dokumentu przez Mateusza. Całość jest eksperymentalna i siedzi za flagą.

Rama dla etapów, których nie budujemy teraz, jest w sekcji „Plan dalszych etapów”. Do budowy teraz jest tylko etap 1 (widok pięter).

## Po co

Dziś piętra to jedna liczba (`levels` w `WorldBuilding`, z OSM albo zgadnięta w `levelsOf`, `src/world/classify.ts`). Liczba służy do wysokości fasady i cienia (`src/render/art/scene.ts`), do rodzaju wieżowiec albo blok (`src/gov/miejsce.ts`), do liczby gospodarstw w generatorze mieszkańców i do abstrakcyjnego „Przeszukać piętro” z fali 2 (`pietraBudynku` w `src/sim/sasiedzi.ts`). Wnętrze (`buildInterior`, `src/world/interior.ts`) ma tylko parter. Schody w klatce są narysowane i nigdzie nie prowadzą. Dom jednorodzinny też ma tylko parter.

Mateusz zapytał, czy mamy mechanikę pięter w domach i szczególnie w blokach (18.10.2026), a odpowiedź brzmiała: nie. Na pytanie, kiedy pomyślał „tu powinny być piętra”, odpowiedział: „Kiedy miałbym grać w określonym bloku to ma to znaczenie jakie piętra są ale to ciężko będzie przydzielić prawidłowo. Kolejne piętra tylko zaplanujemy i niech będzie eksperymentalne.”

Dlaczego trudno: dane OSM i kafelki znają liczbę kondygnacji i klatek, ale nie wiedzą, kto mieszka na którym piętrze, a generator mieszkańców celowo przypina rodziny do klatki, nie do mieszkania ani piętra (RODO, `docs/superpowers/specs/2026-10-17-mieszkancy-z-adresu-design.md`). Każdy rozkład po piętrach będzie więc wymyślony. Dlatego pierwszy krok to oglądanie, a nie życie na piętrach.

## Co zostało rozstrzygnięte z Mateuszem

1. Zakres: nie tylko siedziba. „Nie tylko też w blokach i budynkach wielopiętrowych.” Piętra dotyczą każdego budynku z więcej niż jedną kondygnacją.
2. Przełącznik wysokości w pasku u góry po prawej, obok „Budowa” i „Menu”: wariant B z makiety, czyli kafelek „Piętro” z numerem, a po kliknięciu lista pięter. Mateusz: „B i 2”.
3. Co widać (jego opis): „mozemy wybrać po prawej stronie obok buduj i menu wysokosc kondygnacji, jesli budynek ma wyzsza to mozemy ja zobaczyc/zpenetrowac jesli drzwi sa zmakniete czyli bede widzial klatke schodwoa ale nie zobacze co jest w meiszkanich bedzie ‘strop’ cos innego kolory niz dach jesli budynek nie ma wyzszego pietra to widze tylko dach powyzej ostatniego pietra”.
4. Wysokość wybiera się raz dla całej mapy: wszystkie budynki tną się na tym samym piętrze, a niższe pokazują dach. Mateusz po moim odczytaniu: „tak tak wybieram”.
5. Wygląd stropu: „Ciepły tynk” (wariant 2 makiety), zatwierdzony 19.10.2026 z poprawką koloru (beżowszy, rzadsze i drobniejsze szare plamy). Asset z PixelLab: wpis `strop-tynk` w `assets/manifest.json` (grupa `pietra`), opis i pomiary w `docs/PIXELLAB.md`, sekcja „Strop pięter” (szczegóły w „Co widać na piętrze”).
6. Liczba pięter budynku wynika z danych o wysokości, które mamy. „Wysokosc powinna zalezec od informacjo o wysokosci ktora mamy o budynkach dla zabudoway jednorodzinnej załóż ze conajmniej 50% mam drugi pietro.”
7. Start: „W bloku moge zaczac na innym pietrze niz parter w mieszkaniu w domu jednorodzinnym to zawsze parter na poczatku.” To etap 3 (niżej), nie etap 1.
8. Całość eksperymentalna, kolejne piętra tylko zaplanowane (cytat w „Po co”).
9. Pokoje i ściany na piętrach mają mieć sens. Mateusz 19.10.2026: „Tylko pamietajmy o pokojach na tych pietrach, czyli sciany i rozkład tez jakiś sensowny pownien być.” Zapisane przez sesję stropu w „Zaparkowanych” (`docs/POSTEP.md` na `m3-strop`); kontrakt w sekcji „Piętra z pokojami i ścianami”.

## Cele

1. Gracz wybiera wysokość i widzi, które budynki mają to piętro: klatkę schodową i strop nad mieszkaniami, a niższe budynki z dachem.
2. Liczba pięter jest wiarygodniejsza, zwłaszcza dla domów jednorodzinnych (dziś w Zielonkach wszystkie 33 domy mają jedną kondygnację).
3. Z flagą wyłączoną gra jest taka sama jak dziś: te same wysokości budynków, te same skróty botów i zapisy, ten sam obraz.
4. Dalsze etapy (ruch po schodach, siedziba na piętrze, piwnica, piętro domu) da się dołożyć bez przebudowy etapu 1.

## Nie-cele (etap 1)

- Ludzie na piętrach: pionki chodzące po schodach, przeszukiwanie widocznych pięter, spotkania na piętrach.
- Start zarządu na piętrze, zajmowanie mieszkań wyżej, ogrzewanie i obłożenie pięter, warta z okna.
- Piwnica (komórki, schron, węzeł cieplny). W przełączniku nie ma jej pozycji, dopóki nie ma po co do niej wchodzić.
- Wnętrze drugiego piętra domu jednorodzinnego.
- Budowa na piętrach. Budowle zostają na parterze i podwórku jak dziś.
- Zmiana „Przeszukać piętro” z fali 2. Zostaje, jak jest.
- Prawdziwy rozkład mieszkań i rodzin po piętrach prawdziwego bloku (nie da się go wziąć z danych).

## Anty-cele (porażka, nawet jeśli działa)

- Z flagą wyłączoną cokolwiek się zmienia (wysokość budynku, skrót bota, zapis, klatka rysowania).
- Gra udaje, że zna rozkład pięter w prawdziwym bloku: tekst „mieszka na trzecim piętrze”, numery mieszkań, piętra przy osobach. To łamie zasadę RODO z projektu generatora mieszkańców („żadnych numerów mieszkań i pięter w tekstach, tylko klatka”).
- Strop wygląda jak podłoga albo dach: gracz nie odróżnia „tu jest mieszkanie, nie mam wstępu” od „tu jest wnętrze” albo „tu jest dach”.
- Wybór piętra nie ma widocznego skutku przy zwykłym zbliżeniu (gracz klika i nic się nie dzieje).
- Pozycja w przełączniku, do której nie ma po co wchodzić (ślepa uliczka, jak w anty-celach menu budowy).
- Osoby i rzeczy, które stoją pod stropem, znikają, a gracz nie wie gdzie (zarząd w siedzibie na parterze znika po wyborze piętra 2 bez żadnej wskazówki).
- Setki wnętrz w pamięci dla osiedla z kilkudziesięcioma blokami (Przymorze: 51 bloków, do 17 kondygnacji).

## Ograniczenia

- Twarde zasady z `CLAUDE.md`: symulacja deterministyczna i oddzielona od rysowania, bez `Math.random`; mieszkańcy zmyśleni (RODO); atrybucja map; nic na zewnątrz bez OK Mateusza; zrzut ekranu w Playwright obejrzany po każdej zmianie wizualnej; „gotowe” dopiero po testach, bocie i zrzutach.
- Etap 1 nie dotyka symulacji: wybór piętra to stan widoku (`View`), nie `SimState`, więc `sim.hash()` i skróty botów (da4b24e0, dad44c81, 1f6eef9b, 3e000211) zostają.
- Flaga domyślnie wyłączona: `?pietra=1` w adresie, jak `?siec=1` (`startUrl()` w `src/main.ts` ją zachowuje, jak `siec` i `lang`). Flaga to ustawienie nowej gry. Trafia do zapisu jako opcjonalne pole najwyższego poziomu `Save` (`pietra: true`, nieobecne przy wyłączonej), więc wczytany zapis zachowuje to, z czym go zaczęto, niezależnie od adresu. Nie wchodzi do `worldKey` (`src/ui/zapis.ts`, liczy tylko liczebności i nie widzi opcji budowy), a klucz przy wyłączonej fladze musi zostać co do bitu taki sam jak dziś, bo inaczej każdy istniejący zapis zostałby po cichu odrzucony (moje, po recenzji budującego).
- Gra działa na Pages i w demach bez serwera, a także w Node (czyste funkcje bez DOM).
- Grafika: strop z PixelLab (`strop-tynk`) plus wersja rysowana kodem, która działa bez atlasów (`?grafika=kod`, brak plików). Dach niższych budynków to dach, który gra rysuje dziś.
- Telefon 390×844: przełącznik musi być osiągalny jednym dotknięciem, układ paska nie może się rozjechać.
- Menu budowy (`docs/superpowers/specs/2026-10-18-menu-budowy-design.md` na gałęzi `menu-budowy`, panel po prawej z zakładkami Dom, Podwórko, Obwód): panel i lista pięter nie mogą się zasłaniać.
- Nowe pola stanu mają wartości domyślne albo są opcjonalne i nieobecne, żeby skróty się nie zmieniły (zasada z menu budowy). W etapie 1 nowych pól stanu nie ma.

## Etap 1: widok pięter

### Słownik

- `levels` to liczba kondygnacji razem z parterem. Piętra numerujemy od 0: 0 to parter, 1 to pierwsze piętro nad parterem. Budynek z `levels` równym 4 ma piętra 0, 1, 2, 3. Piętro L istnieje w budynku, gdy `levels > L`.
- Wybrane piętro L to jedna liczba na całą mapę. Domyślnie 0.

### Wysokości budynków

Reguła działa tylko z flagą włączoną i tylko na `WorldBuilding.levels` (po zbudowaniu świata, jedno przejście po budynkach). Nie zmienia tagów w danych geo. Główna ścieżka generatora mieszkańców czyta surowe tagi przez własne `levelsOf` (`src/mieszkancy/budynki.ts`), nie `WorldBuilding.levels`, więc gospodarstwa i kroniki budynków z danych zostają te same.

- Dane o wysokości zostają, jeśli są wiarygodne. Dziś źródłem są kafelki OpenFreeMap: `render_height` podzielone przez 3,5 m, zaokrąglone, minimum 1 (`src/world/mvt.ts`). Dla bloków to zwykle dobre dane (w danych geo Przymorza 133 budynki po 5 kondygnacji, kilka po 12 do 17; w zbudowanym świecie jest z nich 51 bloków). Dla domów słabe: w Zielonkach wszystkie 33 domy w świecie mają jedną kondygnację, na Lanciego 8 z jedną, 1 z dwiema i 16 z trzema. Nie odróżnimy domyślnej jedynki od prawdziwej, i tak ma być: ta niepewność jest powodem zasady Mateusza.
- Zasada Mateusza: co najmniej połowa domów jednorodzinnych ma drugie piętro. Moje odczytanie: druga kondygnacja, czyli `levels` co najmniej 2 (parter i jedno piętro, bez poddasza). Dom z danymi `levels` co najmniej 2 zostaje, jaki jest.
- Które budynki to „domy” (moje, po recenzji budującego): `cls === 'dom'` z pola co najmniej 60 m². Przy danych z kafelków `classify` oddaje `dom` każdemu budynkowi 40 do 400 m², który nie jest sklepem ani szkołą, więc pod tą klasą siedzą też szopy i komórki. Budynki `dom` poniżej 60 m² zostają z `levels` z danych i nie liczą się do połowy.
- Przepis (moje): niech H będzie liczbą tak rozumianych domów na mapie, T liczbą z nich z `levels` co najmniej 2. Jeśli T jest mniejsze niż połowa H zaokrąglona w górę, awansujemy domy z `levels` równym 1 na 2, w kolejności rosnącej wartości skrótu z ziarna świata i numeru budynku (`hashString` albo `mulberry` z `src/core/rng.ts`), aż T dojdzie do tej połowy. Deterministycznie: ten sam dom ma zawsze to samo piętro, a gwarancja „co najmniej 50%” jest ścisła, nie tylko średnia. Przykłady z dem przed zastosowaniem progu 60 m² (budujący policzy je od nowa): Zielonki 17 z 33 awansuje, Przymorze 1 z 2, Lanciego nic (17 z 25 już ma).
- Awansowana wartość `levels` jest wspólna dla wszystkich (moje, po recenzji budującego): rysowanie, przełącznik, symulacja i generator zapasowy widzą dom jako dwukondygnacyjny, bo dom, który wygląda na piętrowy, a zachowuje się jak parterowy, to niespójność gorsza niż kilka skutków ubocznych. Skutki: `pietraBudynku` (`src/sim/sasiedzi.ts`) daje awansowanemu domowi jedno piętro do przeszukania, ale polecenie „Przeszukać piętro” wymaga schodów w klatce (`orders.ts`), których dom nie ma, więc wiersz „piętra n z z” na karcie otwartego budynku (`src/ui/budynek.ts`) pokazywałby piętro, do którego nie da się wejść: budujący ukrywa ten wiersz dla budynków bez schodów. `budynekZapasowy` (`src/sim/lokatorzy.ts`) kopiuje `levels` do `kondygnacje`, a stamtąd idą progi szablonów historii (`src/mieszkancy/historie.ts`): dotyczy tylko siedziby w domu, którą generator zna tylko jako budynek zapasowy, a próg typu blok to 3 kondygnacje albo 300 m², więc typ zostaje `dom`. `miejsce.ts` zostaje przy `dom` (`cls === 'dom'`). Skróty światów dem z flagą są nowymi, osobnymi liczbami w dzienniku; testem sprawdzamy, że gospodarstwa dem z flagą i bez są identyczne dla budynków z danych.
- Domy w siedzibie: siedziba w domu jednorodzinnym też może dostać drugą kondygnację (ma piętro nad parterem do obejrzenia), ale gra zaczyna zawsze na parterze (decyzja Mateusza, punkt 7).
- Awansowany dom wygląda na wyższy (fasada i cień z `levels`). Zrzuty dem to pokażą.
- Bloki i reszta budynków: bez zmian względem danych.

### Przełącznik

- Kafelek „Piętro” w pasku `header.top` (`index.html`), po prawej, na lewo od „Budowa” i „Menu”, w stylu kafelków statystyk (mały podpis, pod nim duża liczba). Pokazuje wybrane piętro: „0” dla parteru.
- Kliknięcie otwiera listę pod kafelkiem (wygląd jak menu kontekstowe `#ctx`): od najwyższego piętra w dół do parteru, wybrane na pomarańczowo (kolor przycisku „Budowa”), przy parterze napis „parter”. Wybór zamyka listę. Lista sięga do najwyższego piętra, jakie ma którykolwiek budynek na mapie (`levels` maksymalne minus 1), najwyżej 20 pozycji z przewijaniem. Pozycji bez żadnego budynku nie ma.
- Piwnicy na liście nie ma w etapie 1 (nie-cel).
- Dodatkowo klawisze PageUp i PageDown zmieniają piętro o jedno (moje; budujący sprawdza, czy nie kolidują z istniejącymi skrótami).
- Wybór jest stanem widoku. Nie trafia do zapisu i wraca na 0 przy nowej grze (moje). Kliknięcie „⌂” (powrót do siedziby, `#zHome`) wraca też na parter (moje), bo siedziba jest na parterze.
- Gdy menu budowy jest otwarte, a gracz klika „Postaw” na piętrze wyższym niż 0, widok wraca na parter (moje: budowle są dziś tylko na parterze i podwórku, więc powód jest oczywisty). Panel budowy nie dostaje własnego przełącznika ani zakładki pięter w etapie 1, bo byłby to drugi przełącznik tej samej rzeczy.
- Układ na telefonie (pasek ma ograniczone miejsce): zostawiony budującemu, z warunkiem: jedno dotknięcie, bez przewijania paska w bok.

### Co widać na piętrze L (L co najmniej 1)

- Przekrój piętra wchodzi tam, gdzie wchodzi dziś przekrój: przy zbliżeniu (`CUT_ON` w `src/render/view.ts`, dziś 0,6, wyłączenie od `CUT_OFF` 0,55). Kafelki przekroju istnieją dziś tylko w trybie bliskim rysowania (od zoomu 0,5, `chunks.ts` nie zamawia przekroju z daleka), więc piętra widać tylko z bliska (moje, po recenzji budującego). Nowego rysowania przekroju z daleka w etapie 1 nie ma. Budujący może obniżyć próg dla L co najmniej 1 najwyżej do 0,5.
- Z daleka (poniżej progu) wszystkie budynki mają dach jak dziś. Żeby wybór piętra nie wyglądał na zepsuty (anty-cel „klikam i nic się nie dzieje”), kafelek „Piętro” przy wyborze co najmniej 1 i zbyt dalekim zbliżeniu pokazuje podpowiedź „Przybliż, żeby zajrzeć na piętro” (napis przez `tx()`/`L()`).
- Dla L równego 0 wszystko działa jak dziś: siedziba z przekrojem parteru, otwarte budynki sąsiadów (fala 2) z przekrojem, reszta z dachem. Niezamieszkane i nieotwarte budynki nie pokazują wnętrza.
- Dla L co najmniej 1 i budynku z `levels > L` (każdego w zasięgu rysowania, siedziby, sąsiadów otwartych i zamkniętych, bez różnicy):
  - blok (`cls === 'blok'`): rzut jest ten sam co parter, bo typowe piętro bloku ma ten sam układ klatek i mieszkań (GDD: „ten sam rzut z innymi rodzinami”). Klatka schodowa (pomieszczenia `klatka`, schody, ściany klatki) jest rysowana jak na parterze, z posadzką lastryko. Drzwi do mieszkań w ścianie klatki są zamknięte. Wszystkie pomieszczenia mieszkań (`Room.apt` co najmniej 0) razem z ścianami działowymi zakrywa strop. Ściany zewnętrzne i okna zostają jak w przekroju.
  - dom i reszta budynków (`cls` inny niż blok), z `levels > L`: cały obrys zakrywa strop, bez wnętrza (generator nie robi dla nich klatki ani schodów; wnętrze piętra domu jest w etapie 5).
- Dla budynku z `levels` co najmniej 1 i nie większym niż L: dach, jak dziś, bo nie ma tam takiego piętra („widze tylko dach powyzej ostatniego pietra”).
- Strop: ciepły tynk (punkt 5), zatwierdzony przez Mateusza 19.10.2026 z poprawką: „tło bardziej beżowe niż łososiowe i szare plamy rzadsze i drobniejsze”. Poprawka i status `zatwierdzony` są na gałęzi `m3-strop` (commit 17b6cdc, w chwili pisania jeszcze nie w `pelna-gra`, scala ją sesja integrująca; budujący bierze pola `uzycie` ze scalonego manifestu). Tło rysuje kod: baza `#e0b48c` z drobnym ziarnem (kurz `#cac6bc` 28% pikseli, szare plamy `#b7b2a6` 5% i `#9a958a` 1%, brąz `#765e42` 2%), średnio `#d6b798`, wzór liczony od współrzędnych świata, żeby łączył się między kafelkami. Szwy płyt 96 × 64 px (3 × 2 m, kolor `#b07a55`, 1 px). Na to rzadkie naklejki z PixelLab (#3 plama zalania, #4 rysa, #5 łata tynku, #6 pleśń) z gęstością 0,12. Wszystkie pola są w `uzycie` wpisu `strop-tynk`, a podpięcie robi się jak dach i bloki: `src/render/art/pixellab.ts` (rysowanie z opisu) i `tools/atlasy.ts` (atlasy biorą tylko assety, dla których mają kod składania, więc kod składania stropu jest częścią etapu 1; `npm run atlasy` buduje atlas, a test `tests/unit/grafika-atlasy.test.ts` pilnuje zgodności). Bez atlasu (`?grafika=kod`, brak plików) strop z kodu: sama baza, ziarno i szwy, bez naklejek.
- Słabe miejsce stropu: kolor bliski linoleum kuchni (ΔE 7,5) i wytartym panelom (ΔE 8,9). Dlatego strop ma opcjonalną ciemniejszą krawędź na granicy mieszkania (ściana do klatki i ściany zewnętrzne), włączaną jedną stałą w kodzie, jeśli na zrzutach strop myli się z podłogą otwartego mieszkania (moje, na prośbę sesji integrującej). Propozycja z manifestu (`uzycie.krawedz`): kolor `#765e42`, grubość 2 px. W etapie 1 otwartych mieszkań na piętrach nie ma, więc krawędź jest zabezpieczeniem na etap 2.
- Wysokość fasady i cień budynku zostają bez zmian w etapie 1 (moje). Przycięcie fasady do L pięter to szlif po akceptacji, bo zmienia rysowanie kawałków bez wpływu na grywalność.
- Osoby, rzeczy, światła i plany budowy leżące w obrysie budynku pokazywanego na piętrze L co najmniej 1 są ukryte (to parter pod stropem). Poza obrysem (podwórko, ulica) nic się nie zmienia. Żeby gracz nie szukał zarządu, który „zniknął”: kafelek „Piętro” przy wyborze co najmniej 1 pokazuje podpowiedź „Zarząd jest na parterze” (napis `tx()`/`L()`, po polsku i angielsku), gdy jakikolwiek pionek zarządu stoi w obrysie budynku zakrytego stropem albo pokazanego z dachem (siedziba z `levels` nie większym niż L ma wtedy dach i też chowa pionki) (moje). Wybór parteru ją zdejmuje. Podpowiedzi nie ma dla ukrytych lokatorów, tylko dla zarządu.
- Klikanie w ukryte (moje, po recenzji budującego): dopóki wybrane piętro jest co najmniej 1, kafelki w obrysie budynku zakrytego stropem albo dachem nie przyjmują poleceń, menu kontekstowego ani zaznaczania osób (`pawnAt` i tak sprawdza `cutOn` i `underRoof`), bo gracz kliknąłby w niewidoczny parter. Kliknięcie w taki obrys pokazuje tę samą podpowiedź i nic nie robi. Poza obrysami wszystko działa jak dziś.
- Strop i klatka nie zmieniają przechodniości, zapisu ani symulacji. To tylko rysunek.

### Piętra z pokojami i ścianami

Wymaganie Mateusza z punktu 9 dotyczy rzutu piętra, nie tylko stropu: strop kończy się na ścianach rzutu, więc ściany muszą być te właściwe, zanim strop zostanie podpięty. Kontrakt (moje):

- Jedna funkcja świata układa piętro: `buildInterior(w, id, { floor })` albo osobna `buildFloor(w, id, floor)` w `src/world/interior.ts` (budujący wybiera). Z tego samego szablonu co parter, deterministycznie z ziarna świata, numeru budynku i numeru piętra, bez zapisu, jak parter dziś. Maska `pietroOf` z etapu 1 jest widokiem tego samego rzutu, a nie osobną logiką.
- Blok: ten sam szkielet co parter. Trzon klatki, schody, ściany do klatki, granice sekcji i ściany zewnętrzne leżą w tych samych kafelkach co na parterze, bo tak jest w wielkiej płycie i bo schody mają się łączyć z piętra na piętro. Układ mieszkań na piętrze jest taki sam jak na parterze („typowe piętro”, GDD), różnią się stany i zawartość (z generatora mieszkańców i z ziarna piętra). Różnice względem parteru: klatka nie ma wejścia, więc drzwi frontowe klatki są na piętrze oknem klatki (okno schodowe), a drzwi zewnętrzne, które generator dokłada pomieszczeniom bez innego połączenia, też są oknami. Na ostatnim piętrze schody się kończą.
- Dom z piętrem: sypialnie i łazienka nad pomieszczeniami parteru, schody w przedpokoju. To wymaga dołożenia schodów do parteru domu z dwiema kondygnacjami, a to zmienia jego układ i przechodniość, więc idzie w etapie 5, nie w etapie 1.
- Pozostałe budynki (sklep, szkoła, przychodnia, hala): piętra jako sale z tego samego szablonu, w etapie 1 pod stropem.
- Rozkład jest zmyślony, nie prawdziwy. Kod i teksty nie twierdzą, że tak wygląda wnętrze tego prawdziwego bloku (RODO i „nie udajemy, że znamy rozkład”, anty-cel).

Co z tego widać w etapie 1: ściany zewnętrzne i okna (na piętrach okno zamiast drzwi klatki), klatkę ze schodami i ścianami, zamknięte drzwi mieszkań w ścianie klatki. Wnętrza mieszkań są pod stropem, więc pokoje i ściany działowe nie są jeszcze widoczne. Pokoje staną się widoczne w etapie 2 (fizyczne wejście i otwarte mieszkania) oraz dla piętra własnego domu w etapie 5. Test w Node na światach dem: szkielet piętra (klatka, schody, ściany zewnętrzne, ściany do klatki) jest identyczny z parterem poza drzwiami wejściowymi, a rzut piętra jest taki sam przy każdym wywołaniu.

### Rysowanie i pamięć

Rzut piętra potrzebuje wnętrza budynku (`buildInterior`: 1 do 20 ms dla bloku, do 100 ms dla największych, 0,44 MB na wnętrze). Przymorze ma 51 bloków, więc nie wolno trzymać wszystkich wnętrz. Propozycja (moje, budujący może zmienić): czysta funkcja świata, np. `pietroOf(w, bid)` w `src/world/`, zwraca zwartą maskę piętra (obrys, klatka i schody, zakryte mieszkania, drzwi), liczoną leniwie dla budynków w zasięgu rysowania i trzymaną w pamięci podręcznej z limitem (najdawniej widziane odpadają), w Node tak samo jak w przeglądarce. Do workerów rysowania idzie sama maska, nie całe wnętrze, tak jak dziś kawałki przekroju sąsiadów (`czescPrzekroju`, `PrzekrojSasiadow`). Zmiana piętra przerysowuje kawałki z przekrojem (`cutChunks` w `src/render/view.ts`). `npm run perf` bez regresji dla pięter 0 i 2 na Przymorzu.

### Dane, stan, zapis

- Świat: `WorldBuilding.levels` z przepisu wyżej tylko z flagą, wartość wspólna dla wszystkich czytelników. Flaga jest opcją zbudowania świata (nowy argument opcji, np. `buildWorld(..., { pietra: true })`), a w zapisie opcjonalnym polem najwyższego poziomu `Save` (opis w „Ograniczeniach”). Klucz `worldKey` bez zmian. Wczytanie zapisu czyta pole `pietra` z zapisu, a nie z adresu: zapis bez pola odtwarza świat sprzed zmiany, zapis z polem ten sam świat z awansowanymi domami (do sprawdzenia testem: zapis i wczytanie na demie z flagą i bez; istniejące zapisy dalej się wczytują).
- Symulacja: bez nowych pól i bez zmian przy wyłączonej fladze. Wybór piętra nie jest w `SimState`. Przy włączonej fladze symulacja widzi awansowane `levels` (opis wyżej).

### Testy i weryfikacja

- Testy jednostkowe w Node: przepis awansu domów (co najmniej połowa, determinizm dla tego samego ziarna, domy z danymi co najmniej 2 nietknięte, tylko `cls === 'dom'`, bloki bez zmian, flaga wyłączona daje `levels` identyczne jak dziś dla dem), `pietroOf` (klatka widoczna, mieszkania pod stropem, dom cały pod stropem, budynek bez piętra L bez maski), lista pięter przełącznika (od najwyższego, bez pozycji bez budynku, najwyżej 20), stan przełącznika wraca na 0.
- Skróty botów (`npm run bot`, `bot:zombie`, `bot:surowce`) bez zmian bez flagi. Skróty światów dem z flagą zapisane jako osobne, nowe liczby w dzienniku.
- Zrzuty (Playwright, obejrzane): Przymorze i Lanciego na piętrze 2 (klatka widoczna, strop nad mieszkaniami, niższe budynki z dachem), wysoki blok na piętrze 11 (tylko najwyższe budynki mają przekrój), Zielonki z awansowanym domem na piętrze 1 (cały pod stropem), lista pięter na komputerze i na telefonie 390×844, wskazówka „Zarząd jest na parterze”, strop z `?grafika=kod` (bez naklejek). Zrzut menu budowy otwartego razem z listą pięter.
- Biome, `npm test`, `npm run build`, `npm run perf`.
- Wpis w `docs/POSTEP.md` z liczbami i decyzjami.

## Plan dalszych etapów (zaplanowane, niezbudowane, eksperyment za tą samą flagą)

Kolejność jest moja, każdy etap dostaje własny projekt i zgodę Mateusza przed kodem. Etap 1 zostawia im to, co trzeba: `levels` w świecie i rzut piętra z jednej funkcji świata.

Etap 2: ludzie na schodach. Pionek ma opcjonalne `level` (brak oznacza 0, więc skróty się nie zmieniają). Schody w klatce łączą ten sam kafelek na kolejnych piętrach, droga po piętrach ma koszt czasu. Pionek, który wchodzi na piętro, którego gracz nie ogląda, znika w klatce (GDD: „pionki wchodzą do klatki i znikają na górze”), a na wybranym piętrze jest widoczny. „Przeszukać piętro” z fali 2 dostaje drugą drogę: fizyczne wejście na piętro i przeszukiwanie pomieszczeń jak na parterze (rzut z funkcji piętra z sekcji „Piętra z pokojami i ścianami”, stany pustych mieszkań z generatora, łup, drzwi do wyważenia). Szybka wersja abstrakcyjna (godzina w tle) zostaje dla pięter, których gracz nie chce oglądać, bo falowiec ma setki mieszkań (moje).

Etap 3: siedziba na piętrze i życie pięter. Mateusz: w bloku można zacząć na innym piętrze niż parter, w domu zawsze na parterze. Piętro startu wybiera gracz na ekranie startowym, bo z adresu go nie znamy (moje, lista od 0 do `levels` minus 1, tylko dla budynku-bloku, domyślnie parter). Zapis jako opcjonalne pole stanu (brak oznacza parter). Do rozstrzygnięcia w osobnym projekcie: mieszkanie zarządu na piętrze N (rzut jak na parterze, wybór mieszkania po klatce wejścia), droga na podwórko schodami (czas), zimno i koza na piętrze (rura przez okno), warta z okna, zajmowanie pustych mieszkań wyżej, ogrzewanie i obłożenie pięter z liczb klatki (kierunek rozwoju: lokatorzy całej klatki jako liczby, `docs/superpowers/specs/2026-10-18-kierunek-rozwoju-design.md`).

Etap 4: piwnica. Komórki lokatorskie, suszarnia, pralnia, węzeł cieplny (GDD), schron i magazyn. Dochodzi pozycja „−1” w przełączniku, dopiero gdy jest co oglądać i do czego schodzić.

Etap 5: dom jednorodzinny z piętrem. Schody w przedpokoju, wnętrze piętra (sypialnie, łazienka), w etapie 2 grywalne tak jak piętra bloku.

Przejmowanie lokatorów (kierunek rozwoju: „każdego lokatora da się przejąć”) a piętra: lokator z wyższego piętra staje się pionkiem przy wejściu do swojej klatki na parterze. Jego piętra nie podajemy w tekstach ani na karcie (RODO), a w przekroju etapu 3 rodziny mogą stać w mieszkaniach bez etykiet (generator: „przekrój budynku może umieszczać rodziny w mieszkaniach, ale bez etykiet”).

Menu budowy a piętra: od etapu 2 `canPlace` dostaje piętro, a zakładka Dom filtruje budowle według wybranego piętra (budowle w pomieszczeniach tylko na piętrze z wnętrzem), Podwórko i Obwód zostają tylko na parterze. Panel nie dostaje własnego przełącznika, a źródłem jest kafelek „Piętro” w pasku.

## Decyzje do przejrzenia przez Mateusza

Jego rozstrzygnięcia są w sekcji „Co zostało rozstrzygnięte”. Moje do przejrzenia:

1. „Drugie piętro” w domu rozumiem jako drugą kondygnację (`levels` co najmniej 2, bez poddasza).
2. Awans domów jest ścisłym minimum 50% z kolejności po skrócie z ziarna, a nie losowaniem na budynek. Dom z danymi co najmniej 2 zostaje.
3. Flaga `?pietra=1`, domyślnie wyłączona, zapisana w zapisie jako opcjonalne pole (nie w `worldKey`).
4. Etap 1 to sam widok, bez żadnej zmiany symulacji. Ludzie na schodach, start na piętrze i piwnica to etapy 2 do 4.
5. Przełącznik: PageUp i PageDown, powrót na parter przy „⌂” i przy „Postaw”, wskazówka „Zarząd jest na parterze”, brak piwnicy w liście.
6. Dom i budynki inne niż blok na piętrze L są cały pod stropem (bez klatki, bo generator jej dla nich nie robi).
7. Fasada i cień bez zmian w etapie 1.
8. Wybór piętra startu w etapie 3 na ekranie startowym.
9. Po wprowadzeniu pięter „Przeszukać piętro” zostaje abstrakcyjne jako szybka droga obok fizycznego wejścia (etap 2).
10. Opcjonalna ciemniejsza krawędź stropu na prośbę sesji integrującej (kolor bliski panelom i linoleum).
11. Piętra widać tylko z bliska (od zbliżenia, przy którym dziś jest przekrój, najniżej od zoomu 0,5). Z daleka dach i podpowiedź „Przybliż, żeby zajrzeć na piętro”. Widok całego osiedla na jednym piętrze z daleka wymagałby nowego rysowania przekroju z daleka i jest poza etapem 1.
12. Awansowane `levels` widzą wszyscy (rysowanie, symulacja, generator zapasowy), a nie tylko rysowanie.
13. Za „dom” do reguły 50% liczy się `cls === 'dom'` z polem co najmniej 60 m².
14. Pod stropem lub dachem nie da się klikać ani wydawać poleceń (podpowiedź zamiast tego).
15. Strop w etapie 1 jest z kodu i z naklejek PixelLab (asset zatwierdzony przez Mateusza 19.10.2026), z kodem składania stropu w `tools/atlasy.ts` jako częścią etapu 1.
16. Kontrakt „Piętra z pokojami i ścianami”: jedna funkcja świata układa piętro z szablonu parteru, w etapie 1 widać z niej tylko szkielet (klatka, ściany zewnętrzne, okna zamiast drzwi klatki).
17. Piętro własnego domu (siedziba w domu z dwiema kondygnacjami) jest w etapie 1 pod stropem jak inne domy, a jego pokoje widać dopiero w etapie 5. Rekomendacja: tak zostawić, bo pokazanie pokoi wymaga schodów w parterze domu, czyli zmiany układu i przechodniości parteru. Koszt pomyłki: Mateusz zobaczy własne piętro jako strop do etapu 5; kontrakt z punktu 16 zostawia wolną drogę, żeby ten etap przesunąć wcześniej.

## Zostawione budującemu

Układ paska na telefonie, dokładny wygląd listy pięter (odstępy, ikony), próg zbliżenia dla pięter co najmniej 1, nazwy plików i funkcji (`pietroOf` to propozycja), sposób podziału pamięci podręcznej masek i jej limit, rysowanie klatki na piętrze (te same sprite'y co parter), wygląd zamkniętych drzwi mieszkań na piętrze, kolejność przerysowania kawałków po zmianie piętra, wygląd i położenie wskazówki „Zarząd jest na parterze”.
