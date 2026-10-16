# Za Murem: dokument projektowy (kierunek od wersji 0.4)

Ten plik opisuje, jaka ma być gra. Co jest już zrobione, opisuje `docs/OCENA-v03.md`. Jak do tego dojść, opisuje `PROMPT-DLA-CLAUDE-CODE.md`.

## Jedno zdanie

Wpisujesz swój adres, widzisz swój prawdziwy blok albo dom w pikselach, w środku twoich ludzi z imionami, którzy marzną, gotują i kłócą się, mówisz im, co mają robić, a jako zarząd spółdzielni uchwalasz, jak przetrwa całe osiedle.

## Filary

1. To jest moje osiedle. Prawdziwy adres, rozpoznawalne kształty bloków, prawdziwe nazwy sklepów, ulic i szkoły z OpenStreetMap. Ktoś z sąsiedztwa ma powiedzieć „o, to nasz pawilon”.
2. Widzę swoich ludzi. Każdy z zarządu i każdy fachowiec chodzi po mapie, je, śpi, marznie, ma potrzeby i nastrój. Pozostali lokatorzy też są widoczni jako tłum: kolejka do kuchni, ludzie przy ognisku, dzieci przy trzepaku.
3. Mówię im, co robić. Zaznaczam człowieka, klikam cel, idzie. Tak jak w 0.2 i w RimWorld. Do tego priorytety pracy, żeby nie trzeba było klikać wszystkiego.
4. Zarząd decyduje o wszystkich. Uchwały, zaufanie, wkurzenie, przyłączanie sąsiednich bloków. To jest warstwa Frostpunka nad warstwą RimWorlda.
5. Satyra na dziś oglądana z 2051 roku. Technologia, ekologia, abonamenty, influencerzy, ESG, AI. Bez nazwisk prawdziwych polityków. Prezydent USA z dziesiątej kadencji zostaje bez imienia.

## Lore (ustalone, nie zmieniać bez Mateusza)

Rok 2051. Wszystko zaczęło się sypać, kiedy prezydent Stanów Zjednoczonych zaczął dziesiątą kadencję po zmianie konstytucji, a dolar przeszedł na abonament. Potem padła chmura, sieci, łańcuchy dostaw. Jedyna instytucja, która przetrwała, to spółdzielnia mieszkaniowa. Zarząd to teraz wy. Nie ma Wielkiego Mrozu ani jednego kataklizmu na koniec. Gra jest otwarta, toczy się przez pory roku, a kończy się zakończeniem ścieżki uchwał albo porażką (odwołanie zarządu, exodus, pustka).

## Dwie warstwy ludzi

To rozwiązuje problem stu mieszkańców.

Ekipa zarządu, czyli rdzeń. Od 3 do około 20 osób z imieniem, wiekiem, zawodem, cechami, umiejętnościami i relacjami. Każda jest pionkiem z pełną symulacją potrzeb i można jej wydawać polecenia. Na start: zarząd (3-4 osoby) i fachowcy z waszych klatek. Rdzeń rośnie, gdy ktoś z tłumu ujawni fach (wydarzenie „przyznał się przy ognisku, że był kiedyś elektrykiem”), przyjdzie uchodźca z wiedzą albo przyłączycie blok.

Lokatorzy, czyli tłum. Reszta mieszkańców liczona per klatka i per budynek, tak jak teraz w `sim.js`. Na mapie widać ich jako pionki tła z prostym zachowaniem: wychodzą z klatki, stoją w kolejce do kuchni, grzeją się przy ognisku, wieszają pranie, wracają na noc. Nie wydaje się im poleceń pojedynczo. Dają siłę roboczą przez dyżury: klatka B wystawia 4 osoby do kuchni, klatka C dwie na wartę. To jest frostpunkowe „przydziel robotników”. Ich nastrój składa się na zaufanie i wkurzenie.

## Skala świata

- 1 kafelek = 1 metr, jak w RimWorld. Człowiek ma mniej więcej jeden kafelek szerokości.
- Obszar gry to kwadrat wokół adresu. Cel 384 × 384 m, minimum 256 × 256 m, ostatecznie dobrać po teście wydajności na telefonie.
- Mapę obracamy tak, żeby dominujący kierunek ścian bloków leżał wzdłuż osi siatki. Liczymy histogram kątów krawędzi obrysów i bierzemy szczyt. Dzięki temu bloki z wielkiej płyty mają proste ściany zamiast schodków.
- Sklepy, apteki i szkoły dalej niż obszar gry (do około 700 m) są celami wypraw poza mapą, jak teraz.

## Poziomy i przekrój budynków

- Teren: podwórka, trawniki, chodniki, ulice, parkingi, garaże, drzewa.
- Budynek z zewnątrz: dach widoczny z góry i krótki front ściany w rzucie ukośnym (low top-down). Wysokość bloku widać po długości cienia i po pasku fasady, w którym jest tyle rzędów okien, ile pięter (np. 4-6 px na piętro). Falowiec ma wyglądać na wysoki i długi.
- Przekrój: gdy budynek jest nasz i kamera jest blisko albo budynek jest zaznaczony, dach znika i widać parter jak w RimWorld i Prison Architect. Przełącznik pięter pokazuje piwnicę, parter i jedno „typowe piętro”.
- Wyższe piętra są uproszczone: mieszkania z przypisanymi rodzinami, ogrzewaniem i obłożeniem. Pionki wchodzą do klatki i znikają na górze. Widok piętra na żądanie pokazuje ten sam rzut z innymi rodzinami.

Generowanie wnętrz z obrysu:

- Blok: klatki co 15-25 m wzdłuż dłuższej osi (z Overpass da się wziąć prawdziwe wejścia, tagi `entrance`). Każda klatka ma korytarz, schody i 2-4 mieszkania na piętrze. Piwnica: komórki lokatorskie, suszarnia, pralnia, węzeł cieplny. Parter niektórych bloków to lokale usługowe, jeśli są w nim punkty POI.
- Dom jednorodzinny: 3-6 pomieszczeń, kuchnia, łazienka, garaż, ogród, płot z furtką. Na osiedlu domków budynek spod adresu jest zawsze siedzibą i zawsze nasz, a osada sąsiedzka to 8-12 najbliższych domów.
- Pawilon, szkoła, przychodnia: proste wnętrza z regałami, ławkami, gabinetami. Są celami przeszukiwania.

## Pętla gry

Minuty. Ludzie mają potrzeby (głód, ciepło, sen, zdrowie, nastrój). Potrzeby rodzą zadania: gotowanie, opał, naprawy, noszenie, warta, leczenie. Zadania dają zasoby. Za zasoby stawia się stanowiska i urządzenia w konkretnych miejscach: kozę w mieszkaniu z rurą przez okno, ognisko na podwórku, kuchnię społeczną w suszarni, ogródki na trawniku, warsztat w komórkach lokatorskich, generator w piwnicy, panele na dachu.

Doba. Za dnia wyprawy: ekipa wychodzi bramą, idzie do pawilonu na mapie albo znika na krawędzi mapy i wraca z łupem, z ranami albo wcale. Wieczorem kuchnia, ognisko, rozmowy, wydarzenia. W nocy zimno i najazdy: obcy wchodzą od krawędzi mapy i idą do magazynu.

Pora roku. Jesień to zapasy, zima testuje ogrzewanie, wiosna to sadzenie, lato to upał, susza i choroby.

Długo. Przyłączanie sąsiednich bloków (zaufanie plus jedzenie i opał na start), uchwały i ścieżki (Porządek, Wspólnota, Technokracja), badania z fachowców i książek, zakończenia.

## Sterowanie

- Lewy przycisk zaznacza człowieka, przeciąganie ramką zaznacza kilku.
- Prawy przycisk na celu otwiera menu kontekstowe z poleceniami, które mają sens: „Ściąć”, „Przynieść do magazynu”, „Gotować tutaj”, „Przeszukać”, „Pilnować”, „Idź tu”. Pojedyncza oczywista akcja wykonuje się od razu.
- Zakładka Praca: tabela ludzie × rodzaje pracy z priorytetami 1-4, jak w RimWorld. Ludzie bez poleceń biorą zadania sami.
- Alarm: wszyscy z rdzenia zdolni do walki zbierają się, sterowanie jak w RTS do końca najazdu.
- Spacja to pauza, klawisze 1-3 to tempo, WASD albo przeciąganie przesuwa mapę, kółko przybliża.
- Telefon: stuknięcie zaznacza, stuknięcie celu wydaje domyślne polecenie, przytrzymanie otwiera menu.

## Czas

Zegar i ruch są rozjechane jak w RimWorld. Godzina gry trwa około 40 s przy 1×, pionek idzie około 4 kafelków na sekundę realną. Tempa 1×, 3×, 6× i dodatkowe szybkie, gdy wszyscy śpią. Długość pory roku (teraz 10 dni) dobrać po playteście, bo przy nowym zegarze to około 2,5 godziny gry przy 1×.

## Pierwsze trzy minuty

1. Wpisujesz adres. Kamera pokazuje całe osiedle z twoim adresem zaznaczonym i zjeżdża do twojego bloku albo domu.
2. Dach znika. W klatce albo w kuchni stoi zarząd: 3-4 osoby z imieniem. Jest październik 2051, w mieszkaniu 9°C, koza stoi zimna.
3. Pierwsze polecenie uczy sterowania w praktyce: „Zaznacz Marka i kliknij suche drzewo przy trzepaku”. Marek idzie, rąbie, niesie drewno, koza się rozpala, w oknie pojawia się ciepłe światło, ludzie się do niej zbierają.
4. Potem kuchnia społeczna w suszarni, pierwsza ekipa do pawilonu, wieczorem pierwsza uchwała. Tekst lore jest w gazetce, nie na ekranie startowym.

## Kierunek graficzny

- Czytelność jak w RimWorld, klimat polskiego blokowiska po upadku.
- 32 px na kafelek (1 m), postacie na płótnie 48 lub 64 px, 8 kierunków.
- Widok low top-down (około 20-30°), ściany z krótkim frontem.
- Ograniczona paleta, około 32 kolory: beż i szarość wielkiej płyty, rdza, zaniedbana zieleń trawników, pastele po termomodernizacji, ciepłe światło kóz i ognisk nocą.
- Animacje: chód, praca (rąbanie, noszenie, gotowanie), siedzenie przy ogniu, spanie; dym z rur kóz wystających z okien; pranie na balkonach; śnieg i deszcz; gołębie.
- Noc naprawdę ciemna: światło punktowe z ognisk, okien z kozą i latarek ekip.
- Interfejs zostaje w HTML i CSS (ostry tekst, emaliowana tabliczka z nazwą osiedla, beton, papier gazetki). Ikony i drobne elementy z PixelLab.

Obiekty, które robią klimat: trzepak, piaskownica, huśtawka, ławka, altana śmietnikowa, garaże blaszaki, kiosk, pawilon, maluch i polonez bez kół, gołębnik, kapliczka, latarnia. Do tego satyra: martwy paczkomat, porzucone hulajnogi, Tesla z blokadą subskrypcji, siłownia plenerowa, ławka z ładowarką USB, lodówka na abonament, panele na balkonie, anteny.

## Technologia

- TypeScript, Vite, PixiJS 8 (WebGL). Interfejs w HTML i CSS nad płótnem.
- Symulacja oddzielona od rysowania, deterministyczna (ziarno losowania, stały krok), da się ją puścić w Node bez przeglądarki.
- Ścieżki: A* z podziałem na klastry, żeby setki pionków nie zabiły procesora; ewentualnie Web Worker.
- Zapis w localStorage albo IndexedDB z numerem wersji formatu.
- Deploy na GitHub Pages przez GitHub Actions.

Dlaczego nie Three.js: wygląd RimWorld jest płaski i dwuwymiarowy, PixelLab daje dwuwymiarowe sprite'y, kafelki i moduły budynków, a PixiJS lepiej obsługuje tysiące sprite'ów, animacje i oświetlenie 2D przy pikselowym skalowaniu. Do Three.js wracamy tylko, jeśli kiedyś zechcemy obracaną kamerę i bryły bloków w 3D.

## Źródła danych

- Geokodowanie: Nominatim (OSM). Limit 1 zapytanie na sekundę, bez podpowiadania przy pisaniu. Przy ruchu wiralowym zapasowo Photon (komoot).
- Mapa: kafelki wektorowe OpenFreeMap (schemat OpenMapTiles, poziom 14), zapasowo Overpass.
- Atrybucja zawsze widoczna: © współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles.
