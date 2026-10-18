# Mapa miasta i wyprawy do prawdziwych miejsc: projekt

Stan: projekt do przeczytania przez Mateusza, 18.10.2026 wieczorem. Nic z tego nie jest jeszcze zbudowane. Gałąź `mapa-miasta` od `pelna-gra` ba0479f (z falą 2 M2 i surowcami). Przed oddaniem przeczytał go recenzent w roli budującego; jego uwagi o kodzie są już w tekście.

Źródło: rozmowa z Mateuszem 18.10.2026 wieczorem (sesja „Deployment platform dla gry”), zaczęta od pytania, gdzie wdrażać grę z myślą o grze sieciowej. Słowa Mateusza są w cudzysłowie (mówił głosem, powtórzenia z dyktowania wycięte). Reszta to moje propozycje, oznaczone „(moje)”, do zmiany przez Mateusza.

## Po co

Mateusz chce mieć na mapie drugą ekipę, z którą da się wejść w interakcję, a w dalszej perspektywie prawdziwą grę sieciową z innymi graczami w tym samym mieście. Na pytanie, od czego zacząć: „Na razie skupiamy się, żeby single player był dostatecznie dobry, ale wszystko ma być otwarte na multi w przyszłości.”

O mapie: „Docelowo będziemy chcieli, żeby było widoczne całe miasto albo przynajmniej od razu mini mapa miasta, tak żebyśmy mogli wysyłać odpowiednią ekspedycję już dzisiaj. (…) żeby mógł sobie wskazać na minimapie budynek z OpenStreetMap, będzie wiadomo, co tam jest, i wysyłam ekspedycję, a [to, co tam jest,] jest generowane: w sklepie (…), w sklepie z narzędziami i tak dalej.” I czego nie chce teraz: „nie skupiajmy się na razie na innych regionach i eksploracji aż tak dalekiej, żeby coś odsłaniać”.

Kolejność: najpierw ten projekt, zaraz po nim obca ekipa prowadzona przez bota (Mateusz: „ok, dobry plan”), a wszystko „spójne z całą grą i skoordynowane z innymi agentami”.

### Co jest dziś

- Wyprawa to wybór na karcie nocy spośród pięciu zmyślonych celów (`TARGETS` w `src/gov/tresc.ts`: „opuszczone mieszkania w bloku obok”, „garaże za trzepakiem”, „pawilon handlowy”, „stacja paliw przy obwodnicy”, „apteka przy przystanku”). Ludzie znikają za bramą (`GovEffects.away`, polecenie `away`) i wracają o 1:00 albo o świcie (`back`). Łup idzie przez zapasy zarządu (`GovEffects.stock`: `wood`, `supplies`, `scrap`, `parts`, `meds`) i maleje z liczbą wizyt (`visits`, `lootMult`). Kłopoty z wyprawy to rana, ugryzienie w trybie zombie, zły nastrój i znaleziska broni i amunicji (`returnExp` w `src/gov/noc.ts`). Nikt nie ginie ani nie przepada.
- Wersja 0.3 miała wyprawy do prawdziwych miejsc z mapy: ekipy szły do sklepów, aptek i szkół z OSM w promieniu 720 m, z ryzykiem rosnącym z odległością (`risk × (1 + d/900)`) i z liczbą wizyt (`public/v03/js/sim.js`, wzorzec bota w `tools/bot-v03.ts`). Kategorie i tabele przeszły do 0.4 bez zmian: `poiCat` w `src/world/osm.ts` (spożywczy, apteka, przychodnia, budowlany, elektronika, ubrania, ogrodnik, sklep, szkoła, biblioteka, bank, stacja, kościół, urząd) i `POICAT` w `src/content/data.ts` (nazwa, ryzyko, łup, szansa na książkę). Port zamienił je na `TARGETS`.
- Gra przy starcie pobiera wszystkie kafelki z=14 w kwadracie wokół 720 m od adresu (`load` w `src/world/mvt.ts`). Sklepy i usługi z tego obszaru trafiają do `geo.poi` jako punkt, kategoria `poiCat` i nazwa, z kafelków i z Overpass. `geo` siedzi w zapisie gry (`data` w `src/ui/zapis.ts`) i w demach (`public/demo/*.json`). Obrysy budynków są w `geo` tylko do około 318 m.
- Mapa gry to kwadrat 384 m.

## Miejsce wśród innych projektów

- Kierunek rozwoju (`docs/superpowers/specs/2026-10-18-kierunek-rozwoju-design.md`) stawiał mapę miasta na piątym miejscu, po pracy ludzi, gospodarce, klimacie i rosnącej osadzie, z zasięgiem rosnącym razem z łącznością. Mateusz przesuwa ją teraz na początek. Projekty 1–3 czekają (nikt ich jeszcze nie zaczął). Zasięg z łącznością zostaje na później, ale od miasta wzwyż (moje): miasto widać od początku, bo ludzie znają swoje miasto, a łączność kiedyś otworzy kraj.
- Fala 2 M2 (`docs/M2-fala-2.md`) robi wszystko, co jest pieszo na mapie 384 m: cudze drzwi, wnętrza, łup według rodzaju budynku (`lupUslug`), lokatorów i spotkania. Ten projekt robi to, co leży dalej. Miejsca na mapie lokalnej nie są celami wypraw, bo tam się chodzi (moje).
- Gra sieciowa (`docs/superpowers/specs/2026-10-18-multiplayer-design.md`) ma konta, zajęte klatki, zapis w chmurze i klucze wspólne dla wszystkich graczy, liczone z globalnych pikseli kafelków z=14 (`src/world/klucze.ts`). Klucze miejsc w tym projekcie stoją na tej samej siatce pikseli.
- Zasada z kierunku rozwoju: każda mechanika sieciowa ma najpierw wersję z NPC. Obca ekipa (następny projekt, szkic niżej) jest właśnie tą wersją dla „innej drużyny w moim mieście”.
- Szansa na książkę z `POICAT` czeka na projekt gospodarki i technologii (badania z książek). Ten projekt jej nie używa.

## Cele

- Mapa miasta od pierwszej minuty gry: całe miasto jako tło, a z bliska prawdziwe budynki i miejsca z OSM z rodzajem (sklep spożywczy, sklep budowlany, apteka, przychodnia, stacja paliw, szkoła i reszta kategorii z 0.3).
- Minimapa w rogu ekranu, z której jednym stuknięciem otwiera się mapa miasta.
- Wskazujesz miejsce, widzisz, co tam zwykle jest, jak daleko i jak groźnie, i wysyłasz tam ludzi.
- Łup wynika z kategorii miejsca i z ziarna, a miejsca się wyczerpują.
- Karta nocy proponuje wyprawy do prawdziwych miejsc zamiast zmyślonych.
- Gra działa jak dziś na Pages, w demach offline i w Node (testy i boty).
- Wszystko jest otwarte na obcą ekipę i grę sieciową: miejsca mają klucze wspólne dla graczy, a stan miejsca to dane, które później może trzymać serwer.

## Nie-cele (na teraz)

- Chodzenie po mieście na ekranie. Wyprawa znika za bramą i wraca jak dziś.
- Odkrywanie mapy, mgła wojny, inne miasta, regiony i mapa kraju.
- Wyprawy kilkudniowe, obozy w mieście, przejmowanie budynków w mieście.
- Nowe kłopoty na wyprawie, w tym śmierć i zaginięcie. Zostają te, które są dziś.
- Książki i badania z wypraw (projekt gospodarki).
- Obca ekipa (następny projekt) i gra sieciowa na żywo.
- Grafika z PixelLab. Ikony i mapa są rysowane kodem, jak reszta grafiki zastępczej.

## Anty-cele (porażka, nawet jeśli działa)

- Start gry czeka na miasto albo mapa miasta zamula telefon.
- Gra przestaje działać offline, na Pages albo w demach, albo przebieg gry zależy od tego, czy kafelki miasta zdążyły się pobrać.
- Wyprawa bez decyzji: zawsze opłaca się ten sam najbliższy cel.
- Jedno miejsce karmi osadę w nieskończoność.
- Mapa pokazuje imię i nazwisko z nazwy jednoosobowej firmy (RODO z CLAUDE.md).
- Gra pobiera z OpenFreeMap więcej, niż pobrałby człowiek oglądający mapę.

## Jak to działa

### Dwie warstwy danych miasta (moje)

Okolica to miejsca z `geo.poi`, czyli sklepy i usługi do 720 m, które gra ma już dziś przy starcie, w zapisie i w demach, z kafelków albo z Overpass. Z niej karta nocy wybiera propozycje. Wynika tylko z danych osiedla zapisanych razem z grą, więc zarząd zostaje deterministyczny, a wczytanie zapisu nie potrzebuje sieci.

Reszta miasta doczytuje się dopiero przy oglądaniu mapy miasta, jak na każdej mapie w przeglądarce. Tło całego miasta (woda, zieleń, główne drogi, nazwy dzielnic) idzie z kafelków niższego poziomu, kilka sztuk na całe miasto. Budynki i miejsca z bliska idą z kafelków z=14, pobieranych dla tego, co gracz akurat ogląda przy dużym przybliżeniu. Pobrane kafelki gra trzyma w pamięci przeglądarki na czas sesji i pobiera po kilka naraz. Które warstwy dają niższe poziomy OpenFreeMap, sprawdzi budujący. Granic administracyjnych nie liczymy: miasto to koło wokół adresu, a przy granicy miasta widać też sąsiednią gminę. Dalekie miejsca z doczytanych kafelków nie trafiają do zapisu; trafia do niego tylko opis celu wysłanej wyprawy (niżej).

Na Pages i offline bez sieci mapa miasta pokazuje tylko okolicę z zapisu, z napisem, że reszta się nie wczytała. Wyprawy do okolicy działają zawsze.

### Miejsca (moje)

Celem wyprawy jest miejsce, czyli punkt sklepu albo usługi z OSM (`poi`), a nie budynek. Budynek z dwoma sklepami to dwa miejsca. Kafelki OpenFreeMap nie niosą rodzaju budynku, więc zwykłe bloki, domy, garaże i hale poza mapą lokalną nie są celami; na mapie miasta widać je jako budynki bez karty miejsca. To jedno pytanie zostaje do Mateusza (decyzja 9).

`Miejsce` to czysty obiekt danych liczony w nowym module `src/world/miasto.ts` (bez sieci, z testami w Node):

- `klucz`: „poi:X:Y”, globalny piksel z=14 punktu (4096 pikseli na kafelek, jak w `src/world/klucze.ts`). Punkt leży w jednym kafelku, więc klucz nie zależy od tego, które kafelki gracz pobrał ani gdzie ma środek mapy. Punkty z Overpass przeliczamy na tę samą siatkę z zaokrągleniem; gdyby wyszedł inny piksel, w grze sieciowej wystarczy dopasowanie po położeniu w promieniu kilku metrów, jak przy klatkach. `geo.poi` dostaje opcjonalne pole z kluczem liczone przy pobieraniu; stary zapis bez niego liczy klucz z położenia.
- `kategoria`: `poiCat`, bez zmian. `poiCat` zasila też klasy budynków w `buildWorld`, więc nie wolno go ruszać; gdyby budujący potrzebował drobniejszego rodzaju (na przykład do nazwy na karcie), dokłada osobne pole, a nie zmienia `poiCat`.
- położenie w metrach względem adresu i nazwa: tylko taka, która przejdzie filtr nazw z osobą (`nazwaMiejsca` w `src/mieszkancy/kronika.ts`). Inaczej sama kategoria („Sklep budowlany”).

Kategorie, ryzyko i łup idą z `POICAT` (0.3) bez zmiany liczb w `src/content`. Łup z jednostek 0.3 przelicza nowy moduł na zapasy zarządu: jedzenie na `supplies`, opał na `wood`, leki na `meds`, złom na `scrap`, części na `parts`, w skali podobnej do dzisiejszych `TARGETS` (na przykład `TARGETS.pawilon` daje 3–7 jedzenia, a `POICAT.spozywczy` 6–14). Skalę stroi bot.

Zapas miejsca (ile łącznie da się z niego wynieść) liczy czysta funkcja z klucza i kategorii (`hashString(klucz)`), bez ziarna gry i bez ziarna świata, żeby ten sam sklep miał ten sam zapas u każdego gracza w mieście (moje, pod grę sieciową). Część miejsc jest pusta od lat, bo to 2051.

### Mapa miasta i minimapa na ekranie (moje)

- Minimapa: mały kwadrat w rogu ekranu z okolicą osiedla, ramką mapy lokalnej 384 m i ikonami miejsc. Na telefonie (390×844) zwija się do przycisku. Gry nie zatrzymuje. Stuknięcie otwiera mapę miasta.
- Mapa miasta: okno na cały ekran w DOM nad płótnem gry (`src/ui/miasto.ts`, płótno 2D, bez PixiJS), przesuwanie i przybliżanie myszą, kółkiem i palcami jak na mapie gry. Styl płaski z palety gry (`src/render/art/palette.ts`): woda, zieleń, drogi, szare budynki, osiedle gracza wyróżnione, ikony kategorii rysowane kodem. Atrybucja widoczna w oknie i przy minimapie: © współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles.
- Otwarta mapa miasta zatrzymuje grę jak inne okna (`pauseGame()` w `src/main.ts`), a zarząd przy otwartym oknie nie liczy czasu, tak jak dziś. Karta nocy i powrót wyprawy nie przerywają więc planowania.
- Stuknięcie w miejsce otwiera kartę miejsca: kategoria (i nazwa po filtrze), odległość i czas drogi, ryzyko słowem („spokojnie”, „niepewnie”, „groźnie”), co tam zwykle jest, ile zostało („nietknięte”, „ktoś tu był”, „wybrane do cna”), kiedy byliście ostatnio, i przycisk „Wyślij wyprawę”.
- Wysłanie: wybór osób z zarządu z ich siłami, zdrowiem i bronią (zaznaczeni na mapie gry są wybrani od razu), podsumowanie (wyjście, spodziewany powrót, ryzyko, ile uniosą) i potwierdzenie. Osoby na wyprawie mają znacznik na minimapie w miejscu celu.
- Wszystkie napisy przez warstwę języka (`tr()`, angielski domyślnie, słowa z `docs/SLOWNICZEK-EN.md`). Nazwy kategorii po angielsku dochodzą obok `POICAT`, bez zmiany treści 0.3.

### Wyprawa (moje)

Wyprawy zostają w zarządzie (`src/gov`), tak jak dziś: zarząd planuje wyjście i powrót (`GovEffects.away` i `back`), a symulacja tylko wyprowadza i przyprowadza ludzi bramą. Nowy moduł `src/gov/wyprawy.ts` ma czyste funkcje czasu, ryzyka, łupu i wyczerpania oraz wywołanie „wyślij wyprawę”, a karta nocy i mapa miasta korzystają z nich obu.

- Kto: osoby z zarządu (później także przejęty lokator, z kierunku rozwoju). Zasady z `canGo`: nie ugryziony, dość sił i zdrowia, na daleką drogę więcej.
- Kiedy: za dnia z mapy miasta, a wieczorem z karty nocy.
- Czas wyprawy za dnia: droga w obie strony to odległość w linii prostej razy 1,4 (ulice) przy 3 km/h, do tego przeszukanie od godziny do trzech, zależnie od liczby osób. Najdalej 5 km w jedną stronę, bo dalej nie da się wrócić tego samego dnia; dalsze miejsca karta pokazuje jako „za daleko na jeden dzień”. Wyprawa, która wróciłaby po 20:00, wraca o świcie, jak nocna.
- Wyprawa z karty nocy wraca jak dziś: blisko o 1:00, daleko o świcie. Noc poza domem to koszt nocnej wyprawy (warta albo wyprawa), więc tego nie ruszamy.
- Ryzyko: `POICAT.risk × (1 + d/900)` jak w 0.3, potem jak dziś `expRisk`: zmęczenie, zdrowie, cechy, obrona, latarka, broń, kilka osób razem, tryb zombie ×1,6. Kłopoty te same co dziś (`returnExp`): rana, ugryzienie w trybie zombie, zły nastrój, znaleziska broni i amunicji.
- Łup: z zapasu miejsca, najwyżej tyle, ile uniosą (po 6 sztuk na osobę, jak przy noszeniu), więc więcej ludzi to więcej łupu i dłuższa nieobecność. Po powrocie łup idzie przez zapasy zarządu jak dziś.
- Wyczerpanie: stan zarządu trzyma dla każdego odwiedzonego klucza, co zabrano, ile było wizyt i kiedy ostatnia. Miejsca się nie odnawiają. Z czasem trzeba chodzić dalej, a dalej jest groźniej, więc wybór celu to decyzja.

### Karta nocy (moje)

Karta dalej proponuje wyprawę blisko i daleko, ale z okolicy: blisko to najbliższe niewyczerpane miejsce poza mapą lokalną, daleko to miejsce z kategorii największego braku (jedzenie, leki, części) do 720 m. Nazwa na karcie to kategoria i odległość („sklep budowlany, 450 m”). Gdy okolica nie ma miejsc albo wyprawy do miejsc są wyłączone (niżej), karta bierze dzisiejsze `TARGETS`.

### Włączenie, boty i stare zapisy (moje)

Tak jak handlarz z wędrowcami (`SimOpts.obcy`): opcja zarządu `miasto`, którą gra włącza w każdej nowej grze w obu trybach. Stary zapis dostaje ją przy wczytaniu, bez losowania, a wyprawa z karty nocy, która jest akurat w drodze, kończy się po staremu. Boty i testy bez opcji grają na `TARGETS` jak dziś, z tymi samymi skrótami, a bot z flagą `--miasto` gra z miejscami. Klucz w `geo.poi` nie zmienia świata ani zarządu bez opcji, więc dema dostają go od razu, a skróty botów bez flagi zostają (budujący to sprawdzi po przebudowaniu dem).

### Determinizm i zapis

- Miejsca z okolicy są w `geo` w zapisie, dalekie miejsca wynikają z kafelków i do zapisu nie trafiają. Mapa miasta nie zmienia `buildWorld` ani `worldKey`.
- Wysłanie wyprawy to wywołanie zarządu z gotowym opisem celu (klucz, kategoria, odległość, zapas startowy), zapisanym w stanie zarządu. Powrót i łup liczą się z tego opisu i z ziarna zarządu, więc wczytanie zapisu i powtórka nie potrzebują kafelków miasta.
- Nowe pola stanu zarządu (opcja, wyprawy w drodze, stan miejsc) dostają wartości domyślne.
- W nowym kodzie zarządu bez `Math.hypot`, `sin` i `cos` (odległość przez `Math.sqrt`), bo zapisy z chmury przechodzą między przeglądarkami (wpis w „Decyzjach” w `docs/POSTEP.md`).

### Otwarte na obcą ekipę i grę sieciową (moje)

- Klucze miejsc są wspólne dla graczy, a zapas startowy zależy tylko od klucza.
- Stan miejsc to mapa klucz → co zabrano. W grze jednoosobowej trzyma go stan zarządu. Obca ekipa wysyła wyprawy tym samym wywołaniem i zabiera z tych samych miejsc, a karta miejsca pokazuje wtedy „ktoś tu był przed wami”. W grze sieciowej serwer trzyma, co zabrano w mieście, a klient wnosi zmiany do zarządu jawnym wejściem, tak jak zajęte klatki wchodzą do symulacji poleceniem `zajete`, więc gra nigdy nie czeka na sieć.
- Serwer z gry sieciowej (Node i SQLite za Caddy na Hetznerze, dziś `cergo-rw-prod`) może później trzymać pamięć kafelków miasta, co zdejmuje ruch z OpenFreeMap (z „Zaparkowanych”).

## Następny projekt: obca ekipa (szkic, osobny dokument)

Z rozmowy: na mapie lokalnej mieszka inny klan, „oznaczony na minimapie jako inny klan”, a przy próbie wejścia do jego budynku „należy spodziewać się oporu”. Gra według tych samych zasad co gracz (Mateusz: „Tak”), rozbudowuje się i na razie prowadzi go bot, żeby „przetestować mechanikę, że jest ktoś niezależny na mapie”. Moje rozumienie: klan zajmuje klatkę w sąsiednim budynku (jak cudza drużyna w grze sieciowej), ma swoich ludzi jako pionki, swój magazyn i swoje wyprawy do tych samych miejsc w mieście, broni drzwi mechaniką fali 2 i może handlować albo napaść. Bot wydaje polecenia tą samą drogą co gracz, więc kiedyś na jego miejscu usiądzie człowiek. Szczegóły w osobnej rozmowie po tym projekcie.

## Ograniczenia

- Twarde zasady z CLAUDE.md: symulacja i zarząd deterministyczne, w Node, bez `Math.random`; atrybucja map zawsze widoczna; mieszkańcy zmyśleni, bez postaci z nazw firm; nic na zewnątrz bez OK Mateusza; zrzut ekranu po każdej zmianie wizualnej.
- Treść 0.3 w `src/content` zostaje bajt w bajt (test zgodności z 0.3 w `node:vm`).
- Zarząd nie importuje `src/sim`, a `src/world/miasto.ts` nie importuje PixiJS ani nie pobiera niczego sam (pobieranie w osobnym module, testy na kafelkach z `tests/fixtures`).
- Telefon 390×844: mapa miasta i karta miejsca mieszczą się na ekranie, minimapa nie zasłania paska ani poleceń. Wydajność gry co najmniej jak dziś (`npm run perf`), a otwarta mapa miasta płynna na telefonie.
- Pages, dema i gra bez sieci działają.

## Kontrakt i podział pracy

Pliki (moje):

- `src/world/miasto.ts`: typ `Miejsce`, klucz z piksela, miejsca z `geo.poi` i z doczytanych kafelków, zapas startowy z klucza. Czyste funkcje.
- `src/world/miastoKafelki.ts`: doczytywanie kafelków miasta w przeglądarce (z=14 przy przybliżeniu, tło z niższych poziomów), pamięć na sesję, kilka pobrań naraz.
- `src/content/miejsca.en.ts`: angielskie nazwy kategorii i opisy (`POICAT` bez zmian).
- `src/gov/wyprawy.ts`: przeliczenie łupu 0.3 na zapasy, czas, ryzyko, wyczerpanie, wywołanie „wyślij wyprawę”; zmiany w `src/gov/noc.ts` (propozycje z okolicy) i w typach stanu zarządu.
- `src/ui/miasto.ts`, `src/ui/minimapa.ts` z CSS: okno mapy, karta miejsca, wysyłanie, minimapa.
- Drobne wpięcia: `src/world/mvt.ts` i `src/world/osm.ts` (klucz punktu w `geo.poi`), `src/main.ts` (minimapa, okno, doczytywanie w tle, opcja), `tools/demos`, `tools/shots.ts` (nowe zrzuty), bot z flagą `--miasto`.

Etapy (moje): 1) miejsca z kluczami z testami; 2) wyprawy w zarządzie i karta nocy z botem; 3) mapa miasta i minimapa z doczytywaniem i zrzutami; 4) angielski, telefon, wydajność, dema. Etap 3 może iść równolegle z 2, kiedy typ `Miejsce` i wywołanie „wyślij wyprawę” są ustalone w etapie 1.

Koordynacja: scalenia robi koordynator (sesja „Pilnowanie agentów”) do `pelna-gra`. Pliki wspólne z innymi sesjami to głównie `src/main.ts`, `src/gov/noc.ts`, `tools/shots.ts` i `docs/POSTEP.md`. Dziś równolegle pracują sesje „Wspólny płot: duch planu na mapie” (fala 2, mapa lokalna) i „Podpięcie kotwicy stylu PixelLab do gry” (rysowanie); żadna nie dotyka wypraw ani nowych plików z listy.

## Bramka

- Testy w Node: miejsca z kafelków testowych dla trzech adresów (kategorie, ten sam klucz z dwóch różnych środków mapy i po doczytaniu sąsiedniego kafelka, filtr nazw), zapas startowy z samego klucza, czas i ryzyko wyprawy, łup nie większy niż zapas i udźwig, wyczerpanie, karta nocy z propozycjami z okolicy i bez miejsc (`TARGETS`), zapis i wczytanie w trakcie wyprawy dają ten sam skrót, stary zapis wczytuje się z opcją i kończy wyprawę w drodze po staremu, treść 0.3 bez zmian.
- Boty: `npm run bot` i `npm run bot:zombie` bez flagi z tymi samymi skrótami co na `pelna-gra`; `npm run bot -- --miasto` (wzorzec wyboru celu z `tools/bot-v03.ts`): bot wysyła wyprawę przy braku, do najbliższego miejsca potrzebnej kategorii, a raport mówi, ile było wypraw, ile łupu, ile ran i ugryzień, jak daleko chodzono w kolejnych dniach i czy jedzenie po dziesięciu dniach jest podobne jak dziś.
- Zrzuty w Chromium, obejrzane: minimapa, mapa miasta przy oddaleniu i z bliska, karta miejsca, wysyłanie, powrót z łupem, na komputerze i na telefonie, po angielsku i po polsku, w trybie zwykłym i zombie.
- `npm run perf` bez pogorszenia.

## Decyzje do przejrzenia przez Mateusza

1. Mapa miasta idzie przed pracą ludzi, gospodarką i klimatem z „Kierunku rozwoju”, a zaraz po niej obca ekipa.
2. Miasto widać od początku, bez odkrywania. Łączność kiedyś rozszerzy zasięg do kraju.
3. Wyprawa znika za bramą i wraca po czasie wyliczonym z odległości; nikt nie chodzi po mieście na ekranie.
4. Całe miasto jako tło od razu, budynki i miejsca z bliska doczytywane przy oglądaniu. Bez sieci tylko okolica 720 m.
5. Najdalej 5 km w jedną stronę, wyprawy jednodniowe. Nocne wyprawy z karty wracają jak dziś.
6. Miejsca się nie odnawiają, a zapas sklepu jest taki sam dla wszystkich graczy w mieście.
7. Kategorie, ryzyko i łup z 0.3 (`POICAT`), przeliczone na zapasy zarządu. Na wyprawie nikt nie ginie, kłopoty jak dziś.
8. Mapa pokazuje kategorię miejsca, a nazwę tylko po filtrze nazw z osobą. Otwarta mapa zatrzymuje grę jak inne okna.
9. Celem wyprawy są sklepy i usługi z OSM. Zwykłe bloki, domy i garaże w mieście nie są celami, a te na mapie lokalnej przeszukuje się pieszo (fala 2). Do potwierdzenia przez Mateusza.

## Zostawione budującemu

- Które warstwy i poziomy OpenFreeMap dają tło całego miasta i jak duże jest „całe miasto” (promień tła).
- Dokładna skala łupu w zapasach zarządu, czas przeszukania i rozkład zapasu startowego, strojone botem.
- Ikony kategorii i wygląd mapy w palecie gry, zgodne z kotwicą stylu, jeśli Mateusz ją przyjmie.
- Ile kafelków naraz i jak długo trzymać je w pamięci, żeby nie przekroczyć zwykłego ruchu przeglądarki z mapą.
