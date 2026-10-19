# Miasto z kwadratów: odkrywanie i chodzenie po całym mieście

Stan: projekt z 19.10.2026 (noc). Nocny integrator (w zastępstwie Mateusza, po niezależnej recenzji) zaakceptował go z poprawkami, które są już w tekście (dom wygrywa na szwie, kafelki w promieniu 720 m, kontrakt terenu, droga ponad limit aktywnych kwadratów, limit 16 kwadratów). Budowa: zadania 1–5 etapu 1 i zadanie 1 etapu 2 od razu, reszta po scaleniach podanych w planach. Spisany w sesji „Odkrywanie mapy i multiplayer” na gałęzi `claude/map-exploration-multiplayer-fccdf2` (od `main` b424828). Budowa idzie od `pelna-gra` po scaleniu `mapa-miasta`. Mateusz poszedł spać i zostawił decyzje nocnemu integratorowi (sesja „Nocna integracja projektu”), więc projekt akceptuje integrator, a Mateusz przegląda rano. Przed oddaniem dokument przeczytał recenzent w roli budującego.

Źródło: rozmowa z Mateuszem w nocy z 18 na 19.10.2026. Jego słowa są w cudzysłowie (mówił głosem, powtórzenia wycięte). Reszta to moje rozstrzygnięcia, oznaczone „(moje)”, zebrane na końcu do przejrzenia.

## Po co

Mateusz: „odkrywanie dalszych części map, tak żeby można było wysłać ekspedycję na krawędź mapy (…) nie ma kogoś 24 godziny, jeśli wróci bez przypału, to odkrywa kolejny kawałek mapy, tej samej wielkości kwadrat. Także można sobie odkryć całe miasto. (…) generowane z OpenStreetMapu, z naszymi assetami, zgodnie z tym, jak wygląda mapa”.

O tym, co potem: „mogę tam wysłać kogoś do eksploracji, to robi się szersza mapa i mogę robić wszystko to, co normalnie w grze na mapie, łącznie z przyłączaniem terenu, jeśli moje imperium jest już tak duże”, „mówię o budowaniu wspólnego płotu”.

O skali, po pytaniu, czy na start wystarczy osiem kwadratów wokół domu: „Chcę od razu całe miasto do chodzenia, nawet jeśli budowa potrwa dłużej.”

Gra dostaje więc drugi wymiar wzrostu. Dziś osada rośnie w kwadracie 384 m (wspólny płot, klatki sąsiadów). Teraz rośnie też znany teren: zwiad za zwiadem odsłania prawdziwe miasto, po którym chodzi się tak samo jak po osiedlu. Ten sam model świata jest potrzebny grze sieciowej w czasie rzeczywistym (projekt `2026-10-19-mmo-design.md`), bo serwer świata też ma liczyć tylko tam, gdzie ktoś gra.

## Co jest dziś

Stan z przeglądu kodu na `main` b424828 i na gałęzi `mapa-miasta` 53166fc.

- Świat to jedna siatka 384×384 (1 kafelek = 1 m) wyśrodkowana na adresie i obrócona do szczytu histogramu kątów ścian, najwyżej o 45° (`buildWorld`, `dominantAngle`, `rotateGeo`, `straighten`). Rastrowanie przycina do [0, 384), więc to, co dalej niż 192 m od środka (w obróconym układzie), ginie. Rozmiar jest parametrem (`opts.size`), a symulacja i rysowanie czytają go z `w.size`.
- Dane: gra pobiera kafelki z=14 w promieniu 720 m (zwykle 2×2 kafelki, każdy ma 1,4 do 1,6 km), `toGeoT` trzyma obrysy budynków do ±318 m od adresu, ulice i obszary w pobliżu, miejsca do 720 m. `geo` siedzi w zapisie (świeża gra: 45 do 205 KB całego zapisu, z czego geo 40 do 189 KB). Kafelki testowe (`tests/fixtures/mvt`, 3 adresy po 4 kafelki) i dema (`public/demo/*.json`) pokrywają mniej więcej ±700 m.
- Symulacja: jedna `Sim` to jeden `World` i jeden `SimState`. Pionki mają współrzędne `x, y` w kafelkach (ułamkowe), ścieżki, prace, polecenia i wiele pól stanu trzymają numery kafelków `i = y·size + x`, numery budynków, drzew, ścian siatki. Tablice na każdy kafelek (przejście dla kilku rodzajów pionków, obszary, A*, maski siatki i podwórka, pole odległości do siatki) to około 7 do 9 MB na mapę; `rebuild` po wielu zdarzeniach (brama, ścięte drzewo, łata, ognisko, zasieki, przerwanie siatki) robi pięć przejść po całej mapie. W stałym rytmie nie ma pracy proporcjonalnej do pola mapy. Pionków i rzeczy szuka się liniowo po `st.pawns` i `st.things`.
- Obcy (szabrownicy, handlarz, wędrowcy, ekipy) pojawiają się na ulicach w odległości mierzonej po ulicach od bramy (`farFrom`), a szwendacze wokół siatki (`band`, `ring`); krawędź mapy to tylko zapas (`edges`).
- Rysowanie: jedna scena na widok, 144 kawałki 32×32 m, wszystkie dalekie kawałki (8 px/m, razem 36 MiB) rysują się od razu, bliskie (32 px/m, 4 MiB każdy) na żądanie, najwyżej 16 na telefonie i 48 na komputerze. Każdy worker ma kopię całej sceny. Kawałek przy brzegu mapy widzi tylko swój teren.
- Wyprawy: karta nocy i (na `mapa-miasta`) wyprawy dzienne do prawdziwych sklepów i usług z OSM. Ludzie wychodzą bramą (`away`), wracają bramą (`back`), wynik liczy zarząd (`src/gov/wyprawy.ts`, `dzienne.ts`, `rozliczWyprawe`).
- Wspólny płot (fala 2): najwyżej 120 m na plan, korytarz nie wchodzi na chodnik przy ulicy (bloki za jezdnią się nie dadzą), obszar dotykający brzegu mapy jest odrzucany (`wspolnyPlot` w `src/world/plot.ts`).

## Miejsce wśród innych projektów

- Mapa miasta (`docs/superpowers/specs/2026-10-18-mapa-miasta-design.md`, bramka przeszła, scalanie do `pelna-gra` w toku): miasto widać od startu, wyprawy dzienne idą do prawdziwych miejsc, jest minimapa i wspólna pamięć kafelków (`KafelkiMiasta`). Ten projekt zmienia jej nie-cel „odkrywanie mapy, mgła wojny” w cel, z woli Mateusza. Mapa miasta zostaje (decyzja 3 niżej), a ten projekt korzysta z jej pamięci kafelków, minimapy i wypraw w zarządzie.
- Praca ludzi i rozporządzenia (osobna sesja): nie jest potrzebna do odkrywania; przyda się grze sieciowej pod nieobecność gracza.
- Płot przez jezdnię (osobny mały projekt zaraz po pracy ludzi, według integratora): bez niego teren nie urośnie za ulicę, na Przymorzu wcale. Tu tylko zależność.
- Warunki zwycięstwa (`docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md`, gałąź `warunki-zwyciestwa`, projekt integratora): zwycięstwo terytorialne „Za Murem” to kwadrat domu i osiem sąsiednich, każdy w co najmniej 80% za zamkniętym obwodem z muru, ścian budynków i wody, bez wrogiej grupy w środku. Ten projekt daje do tego odczyt `terenKwadratow` (etap 4) i przewiduje mur jako rodzaj obwodu.
- Gra sieciowa w czasie rzeczywistym (`2026-10-19-mmo-design.md`): ten sam model kwadratów z układem siatki jako parametrem.
- Fala 2 (sąsiednie budynki, lokatorzy, wspólny płot) działa na każdym budynku, więc w nowych kwadratach też.

## Cele

- Całe miasto do odkrycia i do chodzenia, w kwadratach 384 m na jednej siatce wokół domu, bez górnego limitu poza wydajnością.
- Zwiad: od jednej do trzech osób z zarządu idzie pieszo na krawędź znanego terenu, znika na 24 godziny gry, a po powrocie bez przypału kwadrat za tą krawędzią staje się częścią mapy.
- Odkryty kwadrat to zwykła mapa z OSM w grafice gry: budynki, ulice, chodniki, drzewa, woda, wraki, sterty, drzwi i wnętrza sąsiadów, w trybie zombie szwendacze. Działa każde polecenie.
- Ludzie przechodzą przez granice kwadratów bez szwów na ekranie i bez ekranów ładowania (najwyżej krótka chwila przy wejściu do kwadratu, który długo spał).
- Wspólny płot przyłącza budynki także w sąsiednich kwadratach (za jezdnię razem z osobnym projektem).
- Odczyty pod warunek zwycięstwa: teren w każdym kwadracie i zamknięcie obwodu wokół zbioru kwadratów.
- Pamięć i klatki rosną z liczbą aktywnych kwadratów, a nie odkrytych. Telefon 390×844 daje radę.
- Symulacja deterministyczna w Node. Gra, w której nic nie odkryto, ma te same skróty stanu co dziś, a stare zapisy działają.
- Gotowe pod grę sieciową: układ siatki jako parametr, nowe dane kwadratów bez wiązania z drużyną.
- Odkrywać można do 16 kwadratów od domu w każdą stronę (około 6 km, jak zasięg mapy miasta); dalej to już inne miasto (moje; w Warszawie to nie całe miasto, decyzja 12).

## Nie-cele (na teraz)

- Gra sieciowa w czasie rzeczywistym i kilka drużyn w jednym świecie (projekt MMO).
- Mgła na mapie miasta i odkrywanie sklepów do wypraw dziennych (mapa miasta zostaje widoczna, decyzja 3).
- Inne miasta, kraj, łączność.
- Płot przez jezdnię i same warunki zwycięstwa (osobne projekty); tu tylko odczyty.
- Nowe zamówienia grafiki w PixelLab. Kwadraty używają tego, co już jest, a resztę rysuje kod.
- Życie uśpionych kwadratów: uśpiony kwadrat stoi, nic tam nie przybywa ani nie gnije.

## Anty-cele (porażka, nawet jeśli działa)

- Gra bez odkrywania zmienia przebieg (inne skróty botów) albo stary zapis przestaje się wczytywać.
- Widać szwy: urwany krawężnik, ucięty budynek bez ściany, drzwi w ścianie cięcia, inny kolor terenu po drugiej stronie granicy.
- Klatki albo pamięć telefonu spadają z liczbą odkrytych kwadratów.
- Przebieg gry zależy od tego, jak szybko przyszły kafelki albo zbudował się świat kwadratu.
- Ten sam zapis daje inny przebieg na telefonie i na komputerze (na przykład przez inny budżet aktywnych kwadratów).
- Zapis znika, bo nie mieści się w localStorage.
- Zwiad bez decyzji: zawsze się opłaca albo nigdy.
- Gra pobiera z OpenFreeMap więcej, niż pobrałby człowiek oglądający mapę.

## Jak to wygląda dla gracza (moje)

- Mapa pokazuje odkryte kwadraty. Poza nimi jest ciemna mgła z wyraźną krawędzią, a przy krawędzi znak zapytania nad każdym sąsiednim nieodkrytym kwadratem.
- Zwiad: zaznaczasz od jednej do trzech osób z zarządu, prawy przycisk (na telefonie przytrzymanie) na mgle za krawędzią albo na kwadracie w minimapie i „Wyślij zwiad (24 h)”. Karta pokazuje, kto idzie, ryzyko słowem („spokojnie”, „niepewnie”, „groźnie”) i kiedy wrócą.
- Zwiadowcy idą pieszo przez odkryty teren do krawędzi i tam znikają. Minimapa pokazuje ich znacznik przy kwadracie celu.
- Po 24 godzinach gry pojawiają się tam, skąd wyszli, i idą do domu. Bez przypału mgła schodzi z nowego kwadratu, a kronika zapisuje, co znaleźli. Z przypałem ktoś wraca ranny albo, w trybie zombie, ugryziony, a kwadrat zostaje pod mgłą.
- W odkrytym kwadracie wszystko działa jak na osiedlu: drzewa, wraki, sterty, cudze drzwi, wnętrza, lokatorzy, łup noszony na podwórko.
- Mapa miasta zaznacza odkryte kwadraty jako „wasza mapa”. Sklep w odkrytym kwadracie nie jest już celem wyprawy, bo tam się chodzi.
- Im dalej od domu, tym groźniej, więc dalekie miasto to decyzja.

## Architektura (moje)

### Układ i siatka kwadratów

- `Uklad { c: [lat, lon], kat, bok: 384 }` (`c` w tej samej postaci co `geo.c`). W grze jednoosobowej `c` to adres, a `kat` to kąt domu liczony jak dziś (`dominantAngle` po budynkach w kwadracie domu). Kwadrat (sx, sy) obejmuje w obróconym układzie metry od sx·384 − 192 do sx·384 + 192 w poziomie i tak samo w pionie (y na południe). Kwadrat (0, 0) to dzisiejsza mapa, bit w bit.
- Współrzędne globalne kafelka: gx = sx·384 + lx, gy = sy·384 + ly, gdzie lx, ly od 0 do 383 to położenie w kwadracie. Dla domu gx = lx, więc dzisiejsze współrzędne pionków i rzeczy nie zmieniają znaczenia. Na zachód i na północ od domu współrzędne są ujemne.
- Klucz kwadratu to napis „sx,sy”. Stan gry trzyma listę odkrytych kwadratów w kolejności odkrycia; numer na liście `k` (dom ma 0) wchodzi do numerów kafelków, budynków i drzew (niżej).
- Świat MMO poda kiedyś własny `Uklad` (wspólna siatka miasta, projekt MMO). Kod kwadratów nie zakłada nic o adresie poza tym, co jest w układzie.

### Dane kwadratu

- Kafelki z=14 w promieniu 720 m od środka kwadratu, tak samo jak dom pobiera je wokół adresu (wtedy klucze budynków liczą się z tych samych całych budowli), przez `KafelkiMiasta` z mapy miasta: wspólna pamięć, najwyżej kilka pobrań naraz, nieudane nie zostają w pamięci.
- `geoKwadratu(kafelki, uklad, sx, sy)`: to samo co `toGeoT`, ale z filtrem bliskości (`LOAD_RADIUS` + 30 m) wokół środka kwadratu zamiast adresu, a budynek, który ten filtr łapie, trafia do geo w całości (wszystkie kawałki z pobranych kafelków), żeby jego prostowanie było w każdym kwadracie takie samo. Współrzędne zostają w metrach od adresu i z tym samym zaokrągleniem do 0,5 m. Tagi `zm:klucz` i `zm:os` liczą się z całych budowli, jak dziś. Geo domu zostaje bez zmian (z samymi bliskimi kawałkami).
- Świat kwadratu wynika tylko z jego geo, układu, ziarna gry i (sx, sy), więc geo idzie do zapisu, a świat nie.
- Bez sieci zwiad może się udać, ale odsłonięcie czeka na dane: kwadrat jest „odkryty, czeka na mapę” i gra ponawia pobranie, gdy wróci sieć. Dema dostają dane ośmiu sąsiednich kwadratów z kafelków testowych (dalej napis „brak danych offline”). Testy w Node mają kafelki testowe dla 3×3 wokół trzech adresów, a do skali generator syntetycznego miasta (siatka ulic i bloków).

### Świat kwadratu

- `buildKwadrat(geo, { seed, uklad, sx, sy })` to ten sam generator co `buildWorld` z rastrowaniem przesuniętym o kwadrat (przesunięcie jako opcjonalny parametr funkcji w `src/world/raster.ts`, domyślnie 0). Bez siedziby, siatki z bramą, wnętrza siedziby, suchego drzewa z trzepakiem, mieszkań i uszkodzeń. Budynki z drzwiami (`findEntrances`), drzewa z OSM i z generatora, wraki, sterty i miejsca z ziarnem kwadratu `hashString(seed + ':' + sx + ':' + sy)`.
- Dom dalej buduje `buildWorld` bez zmian. Test pilnuje, że świat domu ma te same tablice i ten sam `worldKey` co przed zmianą.
- Szwy: każdy kwadrat rastruje całą geometrię ze swojego zapasu i przycina do siebie, więc jezdnie, chodniki, woda i obszary schodzą się bez przerwy. Budynek przecięty granicą to osobne części w każdym kwadracie, połączone tym samym `zm:klucz`. Drzwi nie stają na linii cięcia. Skrawek budynku mniejszy niż 3 kafelki zostaje budynkiem, jeśli cały budynek ma ich więcej (inaczej przy szwie byłyby dziury).
- Dom wygrywa na szwie, bit w bit (poprawka integratora): świat domu się nie zmienia, więc sąsiad dopasowuje się do niego. Budynek, który jest w świecie domu (ten sam `zm:klucz`), sąsiad bierze z prostowaniem z geo domu (dom ma tylko bliskie kawałki, więc długi blok przy brzegu bywa u niego wyprostowany inaczej niż z całej budowli). Inne budynki prostuje się z całej budowli, więc dwa sąsiednie kwadraty bez domu obracają je tak samo. Test szwu zna wyjątki (budynki, w których dom ma niepełny obrys) i wypisuje je z powodem.
- Rysowanie kawałka przy szwie dostaje pas terenu sąsiada, żeby krawężniki i przejścia kafelków (kafelki Wanga z PixelLab) schodziły się bez kreski.

### Stan gry: globalne numery

- Globalny numer kafelka to g = k·N + i, gdzie N = 147 456, a i = ly·384 + lx to numer w kwadracie o numerze k. Dom ma k = 0, więc każdy numer kafelka w dzisiejszym stanie, w poleceniach i w zapisie znaczy to samo co dziś. Zakres Int32 starcza na ponad 14 tysięcy kwadratów.
- Numery budynków i drzew dostają ten sam zabieg: b = k·65 536 + numer w świecie kwadratu (tak samo drzewa). Dla domu bez zmian.
- Pionki i rzeczy trzymają współrzędne globalne. Ścieżki, prace, polecenia i pola stanu trzymają numery globalne. Pełna lista pól z numerami kafelków, budynków i drzew jest w raporcie z przeglądu kodu (do przepisania do planu etapu 2): między innymi `Pawn.path/home/want`, `Job.tile/target/from`, `st.cmds`, `felled`, `fence`, `raid`, `damage`, `builds`, `wraki`, `zajete`, `plot`, `sasiedzi`, `people[].home`.
- Każde czytanie siatki (teren, budynek, przejście, obszar) idzie przez kwadrat numeru. Sąsiad kafelka za granicą to kafelek sąsiedniego kwadratu, jeśli ten jest odkryty; jeśli nie, granica działa jak dziś brzeg mapy.
- Nowe pole stanu: lista odkrytych kwadratów bez domu. Nie ma go, dopóki nic nie odkryto, więc gra bez odkrywania ma ten sam stan i skrót co dziś. Zwiady w drodze trzyma stan zarządu, jak wyprawy dzienne.

### Aktywne i uśpione kwadraty

- Kwadrat jest aktywny, kiedy: to dom; stoi w nim albo idzie przez niego ktoś z naszych (zarząd, przejęty lokator, zwiad w drodze do krawędzi); leży w nim nasz teren (siatka, wspólny płot); albo sąsiaduje z kwadratem, w którym ktoś z naszych stoi bliżej niż 40 m od wspólnej granicy (żeby zagrożenie zza granicy reagowało).
- Uśpiony kwadrat nie robi kroków: jego pionki (szwendacze, obcy, lokatorzy) i rzeczy zostają w stanie, a jego tablice przejścia nie istnieją. Budzi się od kroku, w którym stał się aktywny, a zasypia po dwóch godzinach gry bez powodu do aktywności.
- Reguła aktywności zależy tylko od stanu, a górny limit aktywnych kwadratów jest jeden na każdym urządzeniu (na start 12; przy przekroczeniu deterministyczna kolejność: dom, teren, kwadraty z naszymi ludźmi według numeru osoby, sąsiedzi). Ten sam zapis daje ten sam przebieg na telefonie i komputerze.
- Droga ponad limit (poprawka integratora): gdy droga pionka wchodzi w kwadrat, który przekroczyłby limit, najpierw zasypiają sąsiedzi (najniższy priorytet). Gdy limit wypełniają same kwadraty z domem, terenem i naszymi ludźmi, polecenie nie przechodzi, a gra mówi, że ludzie są zbyt rozproszeni (bez drogi częściowej, żeby nikt nie utknął w połowie).
- Świat kwadratu dostarcza symulacji „dostawca światów”, zawsze synchronicznie. W Node buduje od razu. W przeglądarce gra buduje światy z wyprzedzeniem w workerze (kwadraty, do których ktoś idzie, i sąsiedzi aktywnych), a pętla gry nie robi następnego kroku, dopóki potrzebny świat nie jest gotowy (krótkie „Wczytuję okolicę…”). Przebieg nie zależy więc od czasu budowania.

### Ruch przez granice i drogi

- Pionek idzie po współrzędnych globalnych, więc wejście na kafelek sąsiedniego kwadratu to zwykły krok.
- A* zostaje w obrębie kwadratu, na tablicach 384×384 jak dziś (jedna wspólna instancja). Gdy cel leży w innym kwadracie: trasa po kwadratach przez przejścia na granicach (odcinki granicy przechodnie po obu stronach, liczone dla każdej warstwy przejścia: zarząd, mieszkańcy, szabrownicy, szwendacze, obcy), potem A* do przejścia najbliższego prostej do celu i dalej odcinek po odcinku. Ścieżka pionka to globalne numery, więc idzie bez zatrzymania.
- Obszary: etykiety w każdym kwadracie i sklejanie przez przejścia na granicach (znajdź-sumuj), żeby „cel w innym obszarze zamieniam na najbliższy osiągalny kafelek” działało przez granice.
- `rebuild` tylko w kwadracie, którego dotyczy zmiana, i w sąsiadach, gdy zmiana leży przy granicy.

### Systemy związane dziś z domem

- Siedziba, brama, wyjście wypraw, napady, handlarz, wędrowcy i ekipy liczą odległość od bramy po ulicach, więc na dużej mapie działają jak dziś, o ile przeszukiwanie widzi aktywne kwadraty.
- Tryb zombie: dosypywanie i stado wokół siatki jak dziś. Nowy kwadrat dostaje przy odkryciu tylko liczbę szwendaczy (im dalej od domu, tym więcej, moje), a pionki powstają z ziarna kwadratu przy jego pierwszym przebudzeniu, żeby nieodwiedzane kwadraty nie puchły w zapisie. Uśpieni stoją.
- Siatka, podwórko, maski i pole odległości do siatki przechodzą przez kwadraty w etapie 4.

### Rysowanie wielu kwadratów

- Widok trzyma sceny wielu kwadratów. Kawałek mapy ma klucz (k, numer kawałka), a sprite'y stoją w globalnym układzie pikseli. Kamera mieści się w prostokącie odkrytych kwadratów.
- Dalekie kawałki rysują się na żądanie dla widocznych, w budżecie pamięci, a nie wszystkie od razu. Dochodzi poziom „bardzo daleko” (2 px/m) przy dużym oddaleniu (etap 1), a przy oddaleniu do skali miasta tłem może być rysunek wektorowy z mapy miasta (etap 3, razem z resztą interfejsu odkrywania).
- Workery dostają scenę kwadratu przy pierwszym zamówieniu i trzymają kilka ostatnich.
- Mgła nad nieodkrytymi kwadratami i znak zapytania zwiadu przy krawędzi to osobna warstwa.

### Zapis

- Gra bez odkrytych kwadratów zapisuje się jak dziś do localStorage. Od pierwszego odkrycia cały `Save` razem z geo kwadratów przechodzi do IndexedDB, skompresowany (`CompressionStream('gzip')`), bo localStorage ma około 5 MB, a duże miasto z ludźmi i rzeczami w wielu kwadratach to więcej. Wczytanie na starcie robi się wtedy asynchronicznie (start i tak czeka na dane osiedla); localStorage trzyma tylko znacznik, że zapis jest w IndexedDB.
- Bez IndexedDB (niektóre tryby prywatne) gra działa jak dziś, a zwiad mówi, że zapis odkrytego miasta jest niedostępny.
- Każdy kwadrat ma odcisk świata jak `worldKey`, a generator kwadratów ma numer wersji. Niezgodność przy wczytaniu kończy się jak dziś: komunikat i nowa gra.
- Zapis w chmurze (gra sieciowa) niesie geo kwadratów skompresowane. Limit serwera trzeba będzie podnieść (`ZM_LIMIT_ZAPISU`).

### Zwiad

- Zwiad to wyprawa zarządu jak wyprawy dzienne z mapy miasta (`src/gov/wyprawy.ts`, `src/gov/dzienne.ts`), z celem „kwadrat (sx, sy)” i czasem 24 godzin gry poza mapą. Idzie od jednej do trzech osób z zarządu, z regułami `canGo`. Od chwili wysłania zarząd liczy ich jako „na zwiadzie”, więc karta nocy nie stawia ich na wartę ani na wyprawę (moje).
- Droga na krawędź i z powrotem jest prawdziwa: zwiadowcy idą pieszo przez odkryte kwadraty i podlegają zwykłym zasadom gry (mogą zostać ranni, ugryzieni, a w walce zginąć jak każdy za siatką). Bezpieczne jest tylko 24 godziny poza mapą. Ludzie chodzą około 160 m na godzinę gry, więc kwadrat to około 2,4 godziny drogi, a krawędź trzy kwadraty dalej to ponad 6 godzin w jedną stronę. Karta wysyłania pokazuje, o której dojdą do krawędzi i o której wrócą, i ostrzega, gdy któraś z tych chwil wypada po zmroku. Wysłać można o każdej porze (moje).
- Powrót: po 24 godzinach poza mapą zwiadowcy pojawiają się na kafelku, z którego wyszli. Gdy ta chwila wypada między 20:00 a 6:00, pojawiają się o 6:00, jak wyprawy dzienne wracające o świcie (moje).
- Udany zwiad nie przynosi łupu; nagrodą jest kwadrat, a kronika mówi, co w nim widać (sklepy z mapy miasta, budynki, woda, w trybie zombie „dużo szwendaczy” albo „spokojnie”) (moje).
- Polecenie `away` dostaje opcjonalny kafelek wyjścia na krawędzi znanego terenu od strony celu, a `back` kafelek powrotu. Bez kafelka zachowanie jak dziś (brama).
- Ryzyko: `expRisk` jak dziś (zmęczenie, zdrowie, cechy, broń, latarka, liczba osób) razy 1 + 0,15 na każdy kwadrat odległości od domu, razy 1,6 w trybie zombie (moje, do strojenia botem). Przypał to rana albo ugryzienie jak w `returnExp`, a kwadrat zostaje nieodkryty. Nikt nie ginie.
- Sukces: zarząd zwraca efekt „odkryj (sx, sy)”. Gra pobiera dane, zapisuje geo i wysyła symulacji polecenie dodania kwadratu, które działa od następnego kroku. Gdy danych nie ma, zarząd trzyma odkrycie jako oczekujące.
- Kronika po polsku i po angielsku przez warstwę języka (`tx()`), słowa ze `docs/SLOWNICZEK-EN.md` (zwiad po angielsku „scouting run”, mgła „the unknown”, moje).

### Teren przez kwadraty i odczyty pod zwycięstwo

- Siatka i wspólny płot na globalnych numerach. Podwórko i maski w każdym kwadracie, którego dotyczą. Pole odległości do siatki w trybie zombie na aktywnych kwadratach.
- `wspolnyPlot` odrzuca dziś obszar dotykający brzegu mapy. Brzegiem staje się granica odkrytego terenu.
- Obwód to w stanie gry lista kafelków z rodzajem, na globalnych numerach i w dowolnym kwadracie: siatka domu (dziś `st.fence`), wspólny płot (dziś `st.plot`), a w przyszłości mur, który projekt warunków zwycięstwa (`docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md`, „2. Terytorialna”) wprowadza jako nowy, najmocniejszy rodzaj obwodu z bramami. Model kwadratów nie buduje muru, ale nie zakłada, że obwód to tylko siatka i płot.
- Odczyt dla projektu zwycięstwa (kontrakt z nocnym integratorem, z jego poprawkami), czysta funkcja na stanie i światach kwadratów, bez rysowania: `terenKwadratow(sim)` w `src/sim/teren.ts` zwraca `{ zamkniety, kwadraty: { [klucz]: { udzial } }, obwod: { mur, siatka, plot, budynek, woda, brama }, wrogowie }`.
  - Zewnątrz to wszystko, do czego da się dojść zalewaniem od brzegu znanego terenu po kafelkach przechodnich, razem ze zwartymi grupami kafelków zablokowanych (budynek, woda, drzewa), które stykają się tylko z zewnątrz. „Za obwodem” to dopełnienie: region siedziby, to, co on otacza (budynki w środku), i sam obwód. Bramy liczą się jako zamknięte.
  - `zamkniety`: podwórko siedziby nie leży na zewnątrz (nie da się do niego dojść od brzegu znanego terenu ani przez dziurę w siatce).
  - `udzial` kwadratu: kafelki za obwodem podzielone przez kafelki lądu kwadratu (woda poza mianownikiem). Przy otwartym obwodzie 0.
  - `obwod`: tylko granica zewnętrzna, czyli kafelki obwodu stykające się z zewnątrz, według rodzaju (mur, siatka, płot, ściany budynków, woda, bramy); warunek „mur, ściany budynków i woda, bez siatki i płotu” sprawdza zarząd.
  - `wrogowie`: wrodzy ludzie i szwendacze za obwodem (warunek „bez wrogiej grupy w środku” ocenia projekt zwycięstwa).
  - Mur nie ma właściciela: to element świata jak budynek, nie własność drużyny (ważne w grze sieciowej).
  - Liczy się też dla uśpionych kwadratów, na zwięzłej mapie (przejście i rodzaj obwodu na kafelek) z geo i stanu. Wynik jest pamiętany po liczniku zmian obwodu (licznik w obiekcie `Sim`, poza stanem, rośnie przy każdej zmianie kafelków obwodu, bramy, dziury albo budynku na granicy), więc liczy się od nowa tylko po zmianie.
  - `GovInput.teren` już istnieje w projekcie zwycięstwa jako `{ przylaczone }` (rama zwycięstwa wchodzi do `pelna-gra` w nocy z 18 na 19.10.2026); ten odczyt go rozszerza o pokrycie dziewięciu kwadratów i skład granicy zewnętrznej, niczego nie podmienia. Zarząd dostaje go przez `govInput()` w `src/sim/gov.ts`.
  - Kamienie drogi terytorialnej (`src/gov/zwyciestwo.ts`) zaliczają się dziś tylko po kolei. W tym etapie kamienie 2–5 zaliczają też wcześniejsze (na przykład pokrycie kwadratu domu zalicza „pierwszy sąsiedni budynek za wspólnym płotem”), żeby gracz, który otoczy murem kwadrat domu bez płotu z sąsiadem, nie został na zerze, a wpis `WKROTCE.teren` w `src/gov/zwyciestwo.ts` znika (uwaga z recenzji końcowej integratora).

### Wydajność i pamięć

- Aktywny kwadrat kosztuje około 1 MB świata, 4,5 MB tablic symulacji i 3,7 MB sceny do rysowania, do tego tekstury w budżecie. Uśpiony kosztuje tylko geo (kilkadziesiąt KB w IndexedDB) i swoje wpisy w stanie.
- Liniowe przeszukiwania `st.pawns` i `st.things` dostają indeks po kwadratach poza stanem, żeby uśpione kwadraty nic nie kosztowały. Kolejność, w której decyzje losują, zostaje według numerów, jak dziś.
- Wnętrza budynków (dziś tablice wielkości całej mapy na każdy otwarty budynek) kurczą się do prostokąta budynku.

### Gotowe pod grę sieciową

- Układ siatki jest parametrem.
- Nowe dane kwadratów (lista kwadratów, sen, liczby szwendaczy) są kluczowane kwadratem i nie wiążą się z drużyną. Przebudowy `SimState` na stan drużyny i stan kwadratów tu nie ma, bo zmieniłaby każdy skrót; robi ją etap 3 gry sieciowej (kilka drużyn w jednym świecie).

## Etapy (moje)

Każdy etap kończy się bramką i scaleniem do `pelna-gra` przez koordynatora. Etapy 1 i 2 mogą iść równolegle w dwóch sesjach, bo dzielą tylko umowę o współrzędnych (niżej) i nie ruszają tych samych plików poza `src/main.ts`.

1. Kwadraty na mapie (widoczne, jeszcze bez chodzenia): `Uklad`, dane i geo kwadratu, `buildKwadrat` ze szwami, rysowanie wielu kwadratów z dalekimi kawałkami na żądanie, poziomem „bardzo daleko” i mgłą, dane sąsiadów w demach, parametr `?kwadraty=` do zrzutów (odsłania podane kwadraty), pomiar wydajności z 9 i 25 widocznymi kwadratami.
2. Chodzenie po wielu kwadratach: globalne numery w symulacji (najpierw bez zmiany zachowania, potem wiele kwadratów), dostawca światów, aktywne i uśpione kwadraty, przejścia przez granice, drogi i obszary przez granice, praca w innym kwadracie z noszeniem łupu do domu. Testy na syntetycznych światach 2×2, bo etap 1 może jeszcze nie być scalony. Pierwsze zadanie etapu (`src/sim/kafelki.ts`) może wejść do `pelna-gra` od razu, żeby nowy kod innych sesji w `src/sim` liczył numery przez nie, a nie przez `size`.
2b. Chodzenie na ekranie (po scaleniu 1 i 2): `?kwadraty=` dodaje kwadraty także do symulacji, warstwy rysowania z ruchem i zmianami (ludzie, drzewa, rzeczy, światło, dym, przekrój i wnętrza sąsiadów, znaczniki) w globalnym układzie, kliknięcie i menu poleceń na kafelku innego kwadratu, `window.zm` dla zrzutów. Działa chodzenie, ścinanie, noszenie łupu, przeszukiwanie, drzwi i wnętrza w innym kwadracie; menu budowy i wspólny płot w innym kwadracie dopiero w etapie 4. Zrzuty: pionek przechodzi granicę, ścina w sąsiednim kwadracie, niesie łup do domu, otwiera drzwi.
3. Zwiad i odkrywanie (po 2b): wyprawa zwiadu w zarządzie z prawdziwą drogą na krawędź, `away` i `back` z kafelkiem, pobieranie geo, cały zapis w IndexedDB od pierwszego odkrycia, oczekujące odkrycia, polecenie dodania kwadratu, mgła i znaki zwiadu w interfejsie, minimapa i mapa miasta z odkrytymi kwadratami (także tło mapy miasta przy oddaleniu), szwendacze w nowych kwadratach tworzone przy pierwszym przebudzeniu, limit 16 kwadratów od domu, kronika w dwóch językach, zapis w chmurze z geo kwadratów (limit serwera podniesiony przy najbliższym wdrożeniu za zgodą Mateusza), bot, który odkrywa.
4. Teren przez kwadraty: obwód jako lista kafelków z rodzajem w dowolnym kwadracie, siatka, wspólny płot, podwórko i pole odległości przez granice, brzeg znanego terenu w `wspolnyPlot`, odczyt `terenKwadratow` dla zwycięstwa. Razem z płotem przez jezdnię i murem z projektu zwycięstwa (kolejność ustali koordynator).
5. Skala: syntetyczne miasto 15×15 odkrytych kwadratów, indeksy po kwadratach, wnętrza w prostokącie budynku, budżety tekstur, rozmiar zapisu, pomiary na telefonie.

Umowa o współrzędnych dla etapów 1 i 2: kwadrat (sx, sy) zajmuje globalne kafelki od sx·384 do sx·384 + 383 (tak samo y), kwadrat domu ma numer 0, globalny numer kafelka to k·147 456 + ly·384 + lx, świat kwadratu to zwykły `World` o `size` 384. Moduł z typem `Uklad`, kluczami i przeliczeniami robi etap 1 (`src/world/kwadraty.ts`); etap 2 ma własne przeliczenia numerów w symulacji (`src/sim/kafelki.ts`) i bierze z etapu 1 tylko typy, gdy ten będzie scalony.

## Ograniczenia

- Twarde zasady z `CLAUDE.md`: symulacja oddzielona od rysowania i deterministyczna, w Node bez przeglądarki, bez `Math.random`; atrybucja map zawsze widoczna (także na mgle i w nowych kwadratach); mieszkańcy zmyśleni; nic na zewnątrz bez OK Mateusza; zrzut ekranu po każdej zmianie wizualnej; „gotowe” dopiero po testach, botach i zrzutach.
- `sim.hash()` to skrót z `JSON.stringify` całego stanu, więc nowe pola stanu są nieobecne, dopóki nie są potrzebne (konstruktor `Sim` ich nie dopisuje, kod czyta je jako opcjonalne, na przykład `st.kwadraty ?? []`); niezgodna zmiana podbija wersję.
- W nowym kodzie decyzji symulacji i zarządu bez `Math.hypot`, `sin` i `cos` (odległości przez `Math.sqrt`), bo zapisy przechodzą między przeglądarkami, a gra sieciowa będzie liczona krok w krok w różnych silnikach.
- Pages, dema i gra bez sieci działają. Gra bez odkrywania wygląda i gra się jak dziś.
- Telefon 390×844: wydajność co najmniej jak dziś przy jednym kwadracie, a przy pełnym budżecie aktywnych kwadratów nie mniej niż 50 kl/s z procesorem spowolnionym 4× (`npm run perf`).
- Treść 0.3 w `src/content` bez zmian (test różnicowy).

## Kontrakt i podział pracy

Pliki (moje), etap 1:
- nowe: `src/world/kwadraty.ts` (układ, klucze, przeliczenia, prostokąt kafelków kwadratu), `src/world/geoKwadratu.ts` (geo kwadratu z kafelków), testy `tests/unit/kwadraty*.test.ts`;
- zmiany: `src/world/world.ts` (`buildKwadrat` obok `buildWorld`), `src/world/raster.ts` (przesunięcie), `src/world/mvt.ts` (filtr bliskości wokół dowolnego punktu), `src/render/view.ts`, `src/render/chunks.ts`, `src/render/art/scene.ts`, `src/render/chunkWorker.ts` (wiele scen, klucz kawałka z numerem kwadratu, pas sąsiada przy szwie, poziom „bardzo daleko”, mgła), `src/main.ts` (parametr `?kwadraty=`), `tools/make-demos.ts`, `tools/shots.ts`, `tools/perf.ts`.

Etap 2:
- nowe: `src/sim/kafelki.ts` (numery globalne, kwadrat numeru, sąsiedzi przez granice), `src/sim/kwadratySim.ts` (tablice na kwadrat, aktywność, przejścia, sklejanie obszarów), testy `tests/unit/kwadraty-sim*.test.ts` i syntetyczne światy w `tests/unit/`;
- zmiany: `src/sim/sim.ts`, `src/sim/path.ts`, `src/sim/zombie.ts`, `src/sim/sasiedzi.ts`, `src/sim/orders.ts`, `src/sim/gov.ts`, `src/sim/snapshot.ts`, `src/sim/house.ts`, `src/sim/perimeter.ts`, `src/sim/surowce.ts`, przeliczenia numerów w `src/world/plot.ts` i `src/world/fence.ts`, dostawca światów w `src/main.ts`, boty w `tools/`.

Etapy 2b do 5 dostaną plany po scaleniu poprzednich.

Koordynacja: gałęzie etapów scala do `pelna-gra` koordynator po bramce; na GitHub po bramce, na serwer testowy tylko po OK Mateusza. Pliki wspólne z innymi sesjami: `src/main.ts`, `tools/shots.ts`, `docs/POSTEP.md`, a w etapie 2 cała `src/sim`, więc w czasie etapu 2 inne sesje nie przerabiają `src/sim/sim.ts` szerzej niż punktowo (koordynator pilnuje kolejności scaleń).

## Bramka

Dla każdego etapu, poza jego własnymi testami:
- `npm test`, Biome na `src tests tools server index.html`, `npm run build`;
- boty bez odkrywania z tymi samymi skrótami co `pelna-gra` w chwili odbicia gałęzi (`npm run bot`, `npm run bot:zombie`, z `--mieszkancy` i bez);
- pełne `npm run shots -- --dalej` bez błędów, obejrzane nowe zrzuty;
- `npm run perf` bez pogorszenia przy jednym kwadracie.

Etap 1 dodatkowo: świat domu identyczny (tablice i `worldKey`), szwy niewidoczne na zrzutach 3×3 wokół trzech dem (z bliska i z daleka, z grafiką z PixelLab i z `?grafika=kod`), pomiar klatek i pamięci z 9 i 25 widocznymi kwadratami na laptopie i telefonie z procesorem 4×.

Etap 2 dodatkowo: test na syntetycznych 2×2 kwadratach, w którym zarząd przechodzi przez granicę, ścina drzewo w sąsiednim kwadracie i nosi drewno do domu, szwendacz goni przez granicę, a zapis i wczytanie w połowie przejścia dają ten sam skrót; test usypiania i budzenia (uśpiony kwadrat nie zmienia się, budzi się z tym samym stanem); bot z syntetycznym sąsiednim kwadratem z tym samym skrótem w dwóch przebiegach.

## Decyzje do przejrzenia

1. Całe miasto do chodzenia od razu, bez limitu ośmiu kwadratów (Mateusz).
2. Kwadraty po 384 m w układzie domu: wyśrodkowane na adresie i obrócone do ścian domu, jak dzisiejsza mapa; dom zostaje bit w bit.
3. Mapa miasta zostaje widoczna od startu, a wyprawy dzienne do sklepów działają jak w jej projekcie. Zwiad robi z kwadratu teren do chodzenia. Sklep w odkrytym kwadracie przestaje być celem wyprawy.
4. Zwiad: od jednej do trzech osób z zarządu, za dnia, 24 godziny gry, ryzyko rośnie o 15% na każdy kwadrat odległości. Przypał to rana albo ugryzienie, a kwadrat zostaje nieodkryty. Nikt nie ginie.
5. Symulowane są tylko aktywne kwadraty, z jednym limitem na każdym urządzeniu. Uśpiony kwadrat stoi.
6. Globalne numery kafelków, budynków i drzew z domem pod numerem 0, żeby stare zapisy i skróty zostały.
7. Geo kwadratów w IndexedDB. Bez IndexedDB gra działa, ale bez odkrywania.
8. W trybie zombie szwendaczy w nowym kwadracie przybywa z odległością od domu.
9. Etapy 1 i 2 równolegle w dwóch sesjach na Sonnecie, potem 2b, 3, 4 i 5 po kolei.
10. Droga zwiadu na krawędź jest prawdziwa i ma zwykłe zagrożenia (bezpieczne jest tylko 24 godziny poza mapą), powrót wypadający nocą przesuwa się na 6:00, udany zwiad nie przynosi łupu.
11. Chodzenie po mieście jest wolne w czasie gry (około 160 m na godzinę gry, kwadrat to około 2,4 godziny drogi), więc odległość jest kosztem; skrót dla dalekich dróg przez uśpione kwadraty (jak wyprawy dzienne) w etapie 3 (rekomendacja recenzenta integratora), a szybsze chodzenie daje też cud „tramwaj konny” z projektu zwycięstwa. Decyzja Mateusza rano.
12. Odkrywać można do 16 kwadratów od domu w każdą stronę, także kwadraty z samą wodą. Uwaga dla Mateusza: 16 kwadratów to około 6 km, w Warszawie to nie jest całe miasto; podniesienie limitu to sprawa wydajności i zapisu (etap 5).
13. Od pierwszego odkrycia cały zapis gry jest w IndexedDB, skompresowany; szwendacze nowego kwadratu powstają przy jego pierwszym przebudzeniu.
14. Przebudowy stanu na stan drużyny i stan kwadratów w tym projekcie nie ma (zmieniłaby skróty); nowe dane kwadratów tylko nie wiążą się z drużyną.

## Zostawione budującemu

- Dokładny zapas danych wokół kwadratu i to, które kafelki pobrać (z myślą o obrocie).
- Jak liczyć przejścia na granicach i trasę po kwadratach (najprostsze, co daje rozsądne drogi; jeśli ludzie idą wyraźnie naokoło, abstrakcyjny graf przejść jak w HPA*).
- Liczby: budżet tekstur, ile scen trzyma worker, kiedy rysować „bardzo daleko”, ile szwendaczy w nowym kwadracie, mnożnik ryzyka, czas zasypiania.
- Wygląd mgły, krawędzi i znaku zwiadu, w palecie gry i zgodny z kotwicą stylu.
- Jak podzielić przepisywanie numerów w `src/sim/sim.ts` na kroki tak, żeby po każdym kroku boty dawały ten sam skrót.
