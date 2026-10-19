# Badania: pracownia i tablica technologii

Drugi projekt z `docs/superpowers/specs/2026-10-18-kierunek-rozwoju-design.md` (sekcja „Kolejność”, punkt 2, „Gospodarka i technologia”), w zakresie badań. Mateusz zamienił kolejność: najpierw gospodarka i technologia, potem praca ludzi („Najpierw gospodarka i technologia. Zacznij projekt badań od pracowni i przeniesienia drzewka z 0.3.”, 19.10.2026). Projekt pracy ludzi idzie równolegle w innej sesji (gałąź `praca-ludzi`), styk opisuje sekcja „Styk z pracą ludzi”.

Słowa Mateusza są w cudzysłowie. Moje propozycje, które Mateusz przyjął w rozmowie („jest super”, „jest spoko”), są oznaczone „(przyjęte)”. Moje rozstrzygnięcia, których nie widział, są oznaczone „(moje)”. Decyzje nocnego integratora (sesja „Nocna integracja projektu”, której Mateusz zostawił decyzje na noc z 18 na 19.10.2026, zanim poszedł spać: „Masz to wykonać bez dalszych pytań, przekazać do Sonnetu i wykonać zadanie”) są oznaczone „(integrator)”. Wszystko poza cudzysłowem jest do przejrzenia przez Mateusza rano.

## Po co

Mateusz, 19.10.2026: „Ktoś siada w pracowni, wtedy przesuwa się progres na drzewku technologii, drzewku, czyli coś wychodzi z czegoś […], wtedy ktoś wybiera sobie tech, i jak siada w pracowni jakiś mieszkaniec, to w zależności od zawodu i atrybutów zaczyna pracować nad technologią. Jak skończy, to odblokowuje się budynek albo coś innego namacalnego, ewentualnie jakiś mocny perk dla kolonii.”

Dziś gra ma pierwsze noce, budowę, surowce i sąsiadów, ale nic, co trzyma przez dziesiątki dni. Badania dają cel na kolejne dni i powód, żeby zbierać ludzi z fachem i książki. Menu budowy jest na nie gotowe od 18.10.2026 (blokady technologią w danych, ukryte kłódki), a treść 0.3 (24 technologie w pięciu erach) leży w `src/content/data.ts` nieużywana.

Kierunek na później, Mateusz: „później ma wjechać więcej sci-fi, to w końcu 2051, więc technologia poszła naprzód, zwycięstwo technologiczne powinno być spektakularne”. Sekcja „Szczyt drzewka (kierunek, nie w tym projekcie)”.

## Stan dziś (pelna-gra e54aede)

- Menu budowy (`src/ui/budowa.ts`, `src/ui/panelbudowy.ts`) ma sześć budowli z `src/sim/budowle.ts`: warsztat, kuchnia społeczna, magazyn, łóżka piętrowe, ogródek, zasieki. `BuildDef.tech` istnieje, ale żadna budowla go nie ma. `SimState.techDone?` istnieje i celowo nie powstaje w stanie, dopóki nic nie jest odblokowane (skrót stanu `sim.hash()` liczy się z całego JSON-a). Kłódki są ukryte flagą `BUILD_MENU.showLocked = false`, nazwy badań do napisu „Wymaga badania” mają przyjść z projektu badań.
- Treść 0.3: `TECH` (24 technologie: nazwa, era, dziedzina, poziom, koszt, wymagania, opis), `ERAS`, `BOOKS` (tytuły książek w dziedzinach), `FAC` (budowle 0.3) w `src/content/data.ts`. Test różnicowy `tests/unit/content.test.ts` porównuje je z oryginałem 0.3, więc tych stałych się nie zmienia.
- Umiejętności (`bud`, `cieplo`, `elek`, `med`, `uprawa`, `it`, `obrona`, 1–4) wynikają z zawodu i dziś zmieniają tylko walkę (`hitChance`), amputację i liczby zarządu (`src/gov/noc.ts`). Cechy pracowity, leniwy i Mistrz Excela nie mają dziś żadnego skutku; ich opisy w `TRAITS` mówią jeszcze o „kierowniku świetlicy” z 0.3, więc pasują do badań.
- Zarząd ma osobę z umiejętnościami i cechami zawsze (losowanie w `createSim`, generator mieszkańców albo własna drużyna z `src/content/druzyna.ts`). Lokator (`resident`) ma osobę z umiejętnościami tylko w grze z mieszkańcami z adresu (`giveResidents`, `osobaZ` w `src/sim/lokatorzy.ts`); ludzie przyjęci później osoby nie mają. Lokatorzy nie wykonują prac, mają plan dnia `plan()` w `src/sim/sim.ts` i są na podwórku od `laws.workStart` do 18:00.
- Książki są dziś tylko w zarządzie: `GovState.books` (`src/gov/typy.ts`), `know(d)` i `addBook` w `src/gov/wydarzenia.ts`, wydarzenie „książki” z 0.3 i jego wariant M2 (`src/gov/warianty.ts`). Interfejs ich nie pokazuje. `EventHost.tech` zwraca zawsze `false`, więc wydarzenia zależne od technologii nie wypadają.
- Tabele łupu przeszukiwania (`LOOT` w `src/sim/mieszkania.ts`, łup sąsiadów w `src/sim/sasiedzi.ts`, wraki w `src/sim/surowce.ts`) mają typ `Mat`, czyli materiał leżący na mapie jako sterta.
- Okna z pauzą prowadzi `src/main.ts` (`pending()`, `showPrompt`, `pauseGame` i `resumeGame`, `Modal` z `src/ui/okno.ts`, kształt `Sheet` z `src/ui/okna.ts`, szerokość do 560 px). Pełnoekranowego okna nie ma. Wzorzec okna wywoływanego stanem symulacji to `watchSasiedzi` i `showMeet`.
- Jest: zegar z porami roku i zimą, temperatura pokojów i koza, ogródek z plonem zależnym od pory roku, warsztat z przepisami (deski, części), wraki, przeszukiwanie mieszkań i sąsiadów, zdrowie, warta, siatka z łatami i zasiekami, tryb zombie.
- Nie ma: prądu, piwnic, chorób, ambulatorium.

## Cele

- Pracownia to pierwsza budowla badań. Kto w niej siedzi, ten bada.
- Tablica badań jak tablica korkowa w pracowni, na pełnym ekranie z pauzą, pokazuje całe drzewko, z czego co wychodzi i co jest w toku.
- Wybór badania jest decyzją gracza. Postęp robią ludzie, a zawód i cechy zmieniają tempo.
- Dwie pierwsze ery z 0.3 (11 technologii) działają naprawdę: każda daje budowlę albo odczuwalną premię w tym, co gra już ma.
- Ukończone badanie widać od razu: karta „Odkrycie”, nowa budowla ze znaczkiem NOWE w menu budowy.
- Książki z przeszukiwania podnoszą wiedzę osady, jak w 0.3.
- Gra bez pracowni i bez znalezionych książek biegnie jak dziś (ten sam skrót stanu w botach).

## Nie-cele

- Prąd i działające ery 3–5 (13 technologii). Zostają do projektu prądu (GDD, „Prąd i bakteria”).
- Szczyt drzewka, ery sci-fi, zwycięstwo technologiczne, gałęzie tylko dla jednego trybu.
- Uchwały zależne od technologii (w 0.3 `LAW.tech`), ścieżka Technokracji.
- Tabela Pracy i dyżury: to projekt pracy ludzi.
- Grafika z PixelLab (bez wydatków; wszystko rysowane kodem, jak reszta budowli).

## Anty-cele (porażka, nawet jeśli działa)

- Ślepa uliczka: kartka, która wygląda na możliwą do zbadania, a nie da się jej zbadać. Kartki z ery prądu są wyraźnie odwrócone i mówią dlaczego.
- Tablica wyskakuje w złym momencie: w nocy przy napadzie, przy stadzie pod siatką, na innym oknie zarządu.
- Badania robią z pierwszej zimy spacer. Bramka M2 mówi „pierwsza zima jest trudna”, więc do zimy da się mieć tylko część pierwszej ery i jedną, dwie technologie drugiej.
- Badanie bez decyzji: postęp, którego nie widać i na który nic nie wpływa.
- Tablica, której nie da się obsłużyć na telefonie 390×844.

## Pętla (przyjęte)

1. Gracz stawia pracownię (menu budowy, zakładka Dom).
2. Kiedy pracownia stoi, a żadne badanie nie jest wybrane, tablica otwiera się sama z pauzą. Gracz wybiera kartkę i „Badać”.
3. Ktoś siada przy stole w pracowni: zarząd na polecenie, lokator z wiedzą w dziedzinie badania sam w godzinach pracy.
4. Postęp rośnie, kiedy ktoś siedzi. Tempo zależy od umiejętności siedzącego w dziedzinie badania i od jego cech.
5. Po skończeniu: karta „Odkrycie” z pauzą, to, co doszło (budowla albo premia), wpis w kronice. Tablica proponuje następne badanie.

Naraz trwa jedno badanie, jak w 0.3. Zmiana badania nie kasuje postępu poprzedniego (w 0.3 `S.techs.saved`).

## Pracownia (przyjęte, liczby moje)

- Nowa budowla `pracownia`: zakładka Dom, miejsce `pokoj` w naszym mieszkaniu, 2×1 kafelka, stół z lampą i półką na książki. Koszt 16 desek i 4 części, praca około półtorej godziny gry jednej osoby. Bot może zmienić liczby.
- Najwyżej jedna pracownia (moje). `canPlace` dostaje powód „Pracownia już stoi”. Druga pracownia, większe stoły i szybsze badania mogą przyjść z technologią w późniejszym projekcie.
- Dwa miejsca przy stole (przyjęte): dwie osoby badają naraz, każda dodaje swój postęp.
- Rozbiórka pracowni (polecenie `unbuild`) nie kasuje postępu ani zbadanych technologii.

## Kto bada (przyjęte)

- Zarząd na polecenie. Prawy przycisk na pracowni z zaznaczoną osobą: „Badać: <nazwa badania>”. Bez wybranego badania „Wybrać badanie” otwiera tablicę. Praca działa jak dzisiejsza praca w warsztacie (`saw`: polecenie w unii `Command`, `newJob`, gałąź w `work()`, faza dojścia, praca w tickach), jest na liście `M2_JOBS`, więc przerywają ją pilne potrzeby, noc i wróg na podwórku jak inne prace M2 (moje). Kiedy badanie się skończy, osoba wstaje. Napis „co robi” w `jobText` (`src/sim/orders.ts`), pozycje menu w `commandsAt`.
- Lokatorzy sami. Lokator siedziby (pionek `resident`), który ma osobę z umiejętnością co najmniej 1 w dziedzinie bieżącego badania, w swoich godzinach na podwórku (od `st.laws.workStart` do 18:00, jak dziś w `plan()`) siada na wolnym miejscu w pracowni zamiast podwórka. Lokator bez osoby (przyjęty później, gra bez mieszkańców z adresu) nie siada. Sąsiedzi (`sasiad`) i szabrownicy nie. Gdy miejsca są zajęte, lokator robi to co dziś.
- Bez wybranego badania nikt nie siada.

## Wiedza (przyjęte, jak w 0.3)

- Wiedza osady w dziedzinie = najwyższa umiejętność w tej dziedzinie wśród żywych osób zarządu i lokatorów siedziby, które są na miejscu (nie na wyprawie), plus najwyżej 2 książki z tej dziedziny. To wzór `Sim.know` z 0.3, rozszerzony o lokatorów.
- Technologię wolno zacząć, gdy jej wymagania są zbadane, a wiedza w jej dziedzinie jest co najmniej równa jej poziomowi. Zaczęte badanie, któremu wiedza spadnie (fachowiec zginął, wyszedł), staje: postęp zostaje, nikt nie robi kroku dalej, a kartka mówi, czego brakuje (moje).
- Badać może każdy, także bez umiejętności w dziedzinie. Próg dotyczy osady, nie siedzącego.

## Tempo (moje, liczby do strojenia botem)

- Postęp na godzinę gry na jedną siedzącą osobę = `TEMPO_BAZOWE · (1 + 0,1 · umiejętność w dziedzinie badania) · cechy` (integrator i sesja pracy ludzi, 19.10.2026: bez umiejętności dzisiejsze tempo, umiejętność tylko przyspiesza). Cechy z 0.3: pracowity ×1,1, leniwy ×0,9, Mistrz Excela ×1,05. Krzywa umiejętności jest ta sama co w projekcie pracy ludzi (`tempoPoziomu`), żeby zawód działał wszędzie tak samo.
- Koszt technologii to koszt z 0.3 (12–35 w erach 1–2) razy mnożnik ery `KOSZT_ERY[era]` (moje, po pytaniu recenzenta), żeby późniejsze ery były droższe bez ruszania liczb z 0.3.
- Wzorcem jest prawdziwa gra, czyli z mieszkańcami z adresu (moje, po pytaniu recenzenta): `src/main.ts` wczytuje ich przy każdym starcie z mapy, a większość lokatorów ma fach, więc dwa miejsca przy stole bywają zajęte przez lokatorów przez cały dzień. Bot z badaniami chodzi z `--mieszkancy`. `TEMPO_BAZOWE` i `KOSZT_ERY` dobiera bot tak, żeby:
  - pierwsza technologia była gotowa w pierwszej dobie po postawieniu pracowni przy typowej obsadzie (to, co lokatorzy zrobią sami, plus jedna osoba zarządu przez kilka godzin);
  - do początku zimy (dzień 11) gracz, który stawia pracownię drugiego albo trzeciego dnia, miał 4–6 technologii;
  - cała era 2 była w zasięgu w połowie zimy (dzień 15–16), a nie przed nią.
- Gra bez mieszkańców z adresu bada wolniej, bo siada tylko zarząd. To jest przyjęty koszt: taka gra zdarza się tylko przy błędzie wczytania tabel. Po scaleniu pracy ludzi zarząd bada też sam z tabeli Pracy, więc tempo trzeba będzie zmierzyć jeszcze raz (zapis w dzienniku przy scaleniu).
- Postęp liczy symulacja w stałym kroku, w tickach pracy, bez losowania.

## Tablica badań (przyjęte: wariant C ze szkiców)

Szkice z rozmowy: `.superpowers/brainstorm/23560-1792364926/content/ekran-badan-v3.html` (poza repo), zrzuty w `.superpowers/brainstorm/23560-1792364926/zrzuty/`. Mateusz wybrał C: „tablica korkowa w pracowni, pełny ekran z pauzą”.

- Pełny ekran nad mapą, gra stoi, Esc i przycisk „Wróć do gry” zamykają. Interfejs w HTML i CSS jak reszta okien (GDD), bez PixiJS. Treść robi czysta funkcja z odczytu stanu do HTML, z testem w Node, jak `buildPanelHtml`.
- Wygląd: korek, kartki z papieru na pinezkach, lekko przekrzywione, czerwony sznurek od wymagania do kartki, nagłówki er na paskach papieru, pieczątka „ZROBIONE” na zbadanych. Kolumna na erę, od lewej, w kolejności z `ERAS`.
- Stany kartki: zbadana (pieczątka), w toku (żółta, pasek postępu ołówkiem, „14 / 25”), do wzięcia, „nikt się nie zna” (wyblakła, „Ciepło 2, macie 1”), „najpierw: <nazwa>” (szara), odwrócona (ery 3–5: tylko tytuł i „Do tego trzeba prądu”). Kartka, która odblokowuje budowlę, ma mały dopisek „budowla”.
- Kliknięta kartka powiększa się z boku tablicy: nazwa, opis działania w nowej grze, dziedzina i poziom, wymagania, koszt i szacowany czas przy obecnej obsadzie pracowni, kto w osadzie zna dziedzinę, przycisk „Badać” albo „Zmień na to badanie”.
- Pasek na dole: kto siedzi w pracowni (imię, zawód, umiejętność w dziedzinie), bieżące badanie, postęp, szacowany czas do końca.
- Otwieranie: (1) samo, z pauzą, raz, kiedy pracownia stanie, a badanie nie jest wybrane; (2) z karty „Odkrycie” przyciskiem „Następne badanie”; (3) przycisk „Badania” / „Research” w górnym pasku za przyciskiem „Praca” z projektu pracy ludzi, widoczny od chwili, gdy jest pracownia, i klawisz T (uzgodnione z sesją pracy ludzi, która bierze P); (4) prawy przycisk na pracowni: „Tablica badań”.
- Samo otwarcie czeka, aż nie ma innego okna (karta nocy, uchwała, wydarzenie, raport, spotkanie), nie ma napadu w toku i nie trwa „Do broni!”, tak jak kolejka okien zarządu (`pending()`).
- Telefon 390×844: tablica przewija się w poziomie po erach albo układa ery jedna pod drugą, a szczegóły kartki wysuwają się od dołu. Wybór układu zostaje budującemu, byle zrzut z telefonu był czytelny.

## Odkrycie (przyjęte)

- Karta z pauzą, w stylu kartki z tablicy: „Odkrycie: <nazwa>”, jedno zdanie, co daje, i co odblokowuje.
- Przyciski: „Postaw <budowla>” (tylko gdy odblokowuje budowlę: otwiera menu budowy na tej budowli), „Następne badanie” (tablica), „Dalej”.
- Wpis w kronice. Zaufanie +1 przez most zarządu, jak `mood(S, 1, 0)` w 0.3 (moje).
- Znaczek NOWE na kafelku nowej budowli w menu budowy, dopóki gracz jej nie postawi albo nie otworzy jej szczegółów. To stan interfejsu, nie symulacji: nie trafia do `SimState` (moje; budujący decyduje, czy idzie do zapisu gry, czy do pamięci przeglądarki).
- Kłódki w menu budowy włączone (`BUILD_MENU.showLocked = true`): budowle z technologii widać wyszarzone z napisem „Wymaga badania: <nazwa>”, od chwili, gdy jest pracownia (moje: wcześniej nie, żeby pierwsze dni nie pokazywały rzeczy nie do zdobycia).

## Książki (przyjęte, liczby z 0.3)

- Książka ma dziedzinę i tytuł z `BOOKS`. Każda dodaje 1 do wiedzy osady w swojej dziedzinie, najwyżej 2 na dziedzinę. Trzecia z tej samej dziedziny idzie na podpałkę (+1 drewna), jak w 0.3.
- Skąd: przeszukanie pomieszczenia w pustym mieszkaniu siedziby i u sąsiadów (`searchDone`, `lupPokoju` w `src/sim/sim.ts`), z szansą jak opuszczone mieszkania w 0.3 (`POICAT.mieszkania.book = 0,12`; w szkole u sąsiadów więcej, liczba budującego), dziedzina losowana ze wszystkich sześciu. Do tego wydarzenie zarządu „książki” z 0.3. Losowanie z osobnego generatora z ziarna gry i pomieszczenia, jak łup wraku (`wreckRng`), a nie z `st.rng`, żeby przeszukanie nie przesuwało innych losowań (moje).
- Książka nie jest materiałem (`Mat`) ani stertą na mapie (moje: nowy `Mat` pociągnąłby zmiany w stertach, noszeniu i rysowaniu bez zysku). Przeszukanie dorzuca ją osobnym kanałem od razu do zapasów osady, z napisem „Znaleźli książkę „<tytuł>” (Uprawa +1)” w miejscu, gdzie dziś pokazuje się łup, i wpisem w kronice.
- Książki liczą się do wiedzy zawsze, ale tablicę widać dopiero z pracownią. Półka w pracowni pokazuje, ile ich jest (moje).
- Jedno źródło prawdy o książkach (moje): właścicielem jest symulacja (nowe opcjonalne pole stanu). Zarząd czyta je przez `govInput()` (jego `know()` w wydarzeniach liczy wtedy książki z symulacji), a wydarzenie „książki” dodaje je przez `GovEffects` i `applyGov()`. Pole `GovState.books` zostaje w typie dla starych zapisów: przy pierwszym kroku zarządu jego zawartość przechodzi do symulacji, a dalej pole jest puste. Wersja stanu zarządu się nie zmienia.
- `EventHost.tech` zaczyna odpowiadać według `techDone` z symulacji (przez `govInput()`), więc wydarzenia 0.3 zależne od technologii mogą wypaść, kiedy technologia jest zbadana (moje).
- Wiedza osady to jedna funkcja dla tablicy i dla zarządu. `know()` w wydarzeniach zarządu liczy więc od teraz także lokatorów i książki z symulacji. W grze z mieszkańcami część wydarzeń 0.3 z progiem wiedzy (lodówka z Elektryką 2, fachowiec) zachowa się inaczej niż dziś, nawet bez pracowni. To jest zamierzone: jedna wiedza, ta sama na tablicy i w wydarzeniach (moje).
- Książki powstają także bez pracowni (z przeszukania i z wydarzenia), więc przebieg, w którym pojawi się książka, ma inny skrót stanu niż dziś. Bramka „ten sam skrót” dotyczy przebiegów bez książek i bez pracowni; każdą zmianę skrótu w botach budujący wyjaśnia w dzienniku (które pole i od którego dnia) (moje, po pytaniu recenzenta).

## Technologie ery 1 i 2 (przyjęte, przeróbki moje)

Nazwy, poziomy, koszty i wymagania z 0.3 bez zmian. „Działanie” to opis do nowej gry (nowy tekst w obu językach; opis z 0.3 zostaje w `data.ts` dla testu zgodności).

| id | nazwa | dziedzina, poziom, koszt | wymaga | rodzaj | działanie w nowej grze |
|---|---|---|---|---|---|
| t_kozy | Kozy w mieszkaniach | Ciepło 1, 14 | — | budowla | Koza z beczki do postawienia w pokoju, kuchni albo przedpokoju naszego mieszkania, blisko okna (rura przez okno). Grzeje pokój jak koza w kuchni i tak samo pali drewno. Zarząd dokłada do niej sam (niżej, „Dokładanie”). |
| t_okna | Folia i koce w oknach | Budowa 1, 12 | — | premia | +3°C w pomieszczeniach naszych mieszkań, za darmo. |
| t_konserwy | Słoiki i suszarnie | Uprawa 1, 12 | — | premia | +20% plonu ogródków, szklarni i pieczarkarni. |
| t_zielarstwo | Zielarstwo z działek | Medycyna 1, 12 | — | premia | Ogródek przy plonie daje czasem leki (moje: 1 lek z szansą 1/3, z ziarna ogródka i plonu). |
| t_wieza | Wieże z rusztowań | Budowa 1, 15 | — | budowla | Wieża na podwórku i nowy posterunek „Warta na wieży” na karcie nocy: stojący tam dokłada połowę swojej warty do obrony każdego innego posterunku (niżej, „Wieża”). |
| t_spawanie | Spawanie z akumulatorów | Budowa 2, 25 | t_okna | premia | Warsztat robi części 1,5× szybciej. |
| t_barykady | Barykady z wraków | Budowa 2, 22 | t_wieza | budowla | Barykada na odcinku siatki, mocniejsza od zasieków. Koszt głównie w złomie, bo dziś złomu jest za dużo (moje: 16 złomu i 2 deski). |
| t_wezel | Rozruch węzła cieplnego | Ciepło 2, 35 | t_kozy | budowla | Węzła i piwnic w grze nie ma, więc (moje): kocioł na klatce siedziby (w domu w przedpokoju). Grzeje naraz wszystkie nasze mieszkania, ale pali dużo drewna. Zarząd dokłada do niego sam. |
| t_szklarnia | Szklarnie z folii | Uprawa 2, 30 | t_konserwy | budowla | Szklarnia na podwórku: jak ogródek, ale zimą rodzi jak jesienią. |
| t_grzyby | Pieczarki w piwnicach | Uprawa 2, 25 | t_konserwy | budowla | Piwnic nie ma, więc (moje): pieczarkarnia w łazience naszego mieszkania. Plon mniejszy niż w ogródku wiosną i latem, ale taki sam przez cały rok, także zimą (ogródek zimą nie rodzi). |
| t_ambu | Ambulatorium polowe | Medycyna 2, 30 | t_zielarstwo | premia | Zdrowie wraca 1,6× szybciej (rany po walce, wychłodzenie, głód). |

### Wieża (moje, po pytaniu recenzenta)

W zwykłej grze napad rozstrzyga zarząd (`decideRaid` oddaje wynik, a liczy go `src/gov/noc.ts`: `defenseAt`, `guardValue` z posterunków), więc zasięg lampy w symulacji nic by nie zmienił. Dlatego wieża to nowy posterunek na karcie nocy:
- „Warta na wieży” (`warta:wieza`, obok bramy, dziur, siatki i dyżuru przy kozie), dostępna, gdy wieża stoi. Kto tam stoi, widzi całe podwórko: do obrony każdego innego posterunku dochodzi połowa jego wartości warty (`guardValue`). Karta nocy pokazuje to jak inne posterunki, z wpływem na szansę napadu.
- Pionek wartownika stoi nocą na wieży (widać go na mapie).
- Bez zarządu (testy, boty bez zarządu): wartownik na wieży płoszy z zasięgiem lampy ×1,5.
- Tryb zombie: wartownik na wieży z bronią dystansową (kusza, rewolwer, strzelba) strzela z zasięgiem ×1,5 do szwendaczy pod siatką. Z dzidą nie sięga siatki, więc karta mówi, że na wieżę trzeba broni dystansowej.

### Dokładanie do nowych źródeł ciepła (moje, po pytaniu recenzenta)

Bez dokładania koza w pokoju i kocioł nic by nie dawały nocą. Dziś zarząd sam dokłada tylko do kozy zarządu (`startRefuel` bierze `this.koza()`).
- `startRefuel` wybiera spośród wszystkich palenisk w naszych mieszkaniach (koza zarządu, nowe kozy, kocioł) to, któremu zostało najmniej ognia, z kozą zarządu przy remisie. Zmiana jest w wyborze celu w `startRefuel`, a nie w `think()`, więc nie gryzie się z projektem pracy ludzi, który owija dokładanie w rodzaj „Ogień”.
- Dyżur przy kozie na karcie nocy (`warta:koza`) dokłada do wszystkich palenisk w siedzibie, a wyliczenie drewna na noc (`nightWood` w `src/gov/noc.ts`) liczy każde palenisko, kocioł jako kilka koz (liczba budującego).
- To zmienia bilans drewna w pierwszej zimie, więc bot z badaniami mierzy drewno i temperatury z kozami i kotłem.

### Nowe budowle

Nowe budowle razem z pracownią: 7, więc menu budowy rośnie z 6 do 13. Budowle z technologii mają `tech` w `BuildDef`; dla kotła i pieczarkarni dochodzą nowe miejsca `BuildPlace` (klatka albo przedpokój domu, łazienka). Koszty, rozmiary i czasy pracy nowych budowli dobiera budujący w skali istniejących (warsztat 20 desek i 10 złomu, ogródek 14 desek) i stroi botem.

Premie i budowle działają tylko po zbadaniu, więc gra bez badań ma te same liczby i ten sam skrót co dziś.

## Ery 3–5 (przyjęte)

13 technologii od ery „Prąd” i technologia końcowa z ery 6 wiszą na tablicy jako odwrócone kartki: tytuł i dopisek „Do tego trzeba prądu”. Sznurki do nich są narysowane, żeby było widać, z czego wyjdą. Nie da się ich wybrać. Odwrócenie wynika z danych (technologia bez działania w nowej grze), a nie z numeru ery, żeby projekt prądu odwracał kartki przez dopisanie działania.

## Dane (moje)

- Nowy moduł z technologiami nowej gry (np. `src/sim/badania.ts` albo dane w `src/content/`): dla każdej technologii z 0.3 identyfikator, wpis z `TECH` (nazwa, era, dziedzina, poziom, koszt, wymagania) i to, czego `TECH` nie ma: czy działa w nowej grze, co odblokowuje (`BuildKind[]`), opis działania w obu językach, opcjonalnie tryb gry (`'zwykly' | 'zombie'`, brak: oba).
- Ery i kolumny tablicy biorą się z danych, a nie z liczby 5, żeby projekt szczytu dopisał ery 6+ bez zmiany tablicy. Era to epoka technologii, a poziom (`lvl` z 0.3) to próg wiedzy w dziedzinie; oba pola zostają w danych (integrator).
- Technologia końcowa (integrator, kontrakt z `docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md` na gałęzi `warunki-zwyciestwa`, sekcja „1. Technologiczna”): jedna technologia z flagą `koncowa: true`, do której prowadzą wszystkie ery. W tym projekcie to jedna odwrócona kartka w nowej, szóstej erze („Bez miedzi” / „Without copper”, moje), z nazwą roboczą z projektu zwycięstwa „Sieć bez miedzi” (aluminium, światłowód, ogniwa w żywicy; w trybie zombie opis mówi, że sieć jest cicha). Wymaga końców gałęzi z 0.3: `t_model`, `t_pompy`, `t_hydro`, `t_druk`, `t_drony` (moje). Nie da się jej zbadać, dopóki nie ma prądu, jak reszty ery 3+. Kartka ma wyróżnienie (np. złota pinezka i dopisek „Cel”), żeby od pierwszego otwarcia tablicy było widać, dokąd prowadzi drzewko. Nazwa i opis to dane, więc projekt zwycięstwa może je zmienić bez ruszania tablicy.
- Odczyt dla zarządu (integrator): `GovInput` dostaje opcjonalne `badania?: { era: number; koncowa: boolean }`, gdzie `era` to najwyższa era wśród zbadanych technologii (0: nic), a `koncowa` mówi, czy technologia końcowa jest zbadana. Ta gałąź dopisuje pole do typu i wypełnia je w `govInput()`. Akcję „Włączenie sieci” w pracowni i epilog robi projekt zwycięstwa; ten daje tylko stan.
- Wymaganiem technologii może być nie tylko inna technologia, ale też postawiona budowla, czyli cud (np. `wymagaBudowli?: BuildKind[]`), bo cuda odblokowują technologie (integrator). Stan kartki „najpierw: <budowla>” działa wtedy tak samo jak dla technologii. W tym projekcie żadna technologia tego nie używa, ale funkcja stanu kartki i test to obsługują.
- Cuda (integrator, sekcja „5. Cywilizacyjna” projektu zwycięstwa): bardzo drogie budowle końcowe z późnych er, odblokowywane badaniami, wymagające połączonego terenu i dużej produkcji, budowane przez kilka dni. W menu budowy dochodzi kategoria `cuda` („Cuda” / „Wonders”) w `BUILD_CATS`, ostatnia. Pusta zakładka jest ukryta (zasada menu budowy), więc w tym projekcie jej nie widać. Koszt cudów jest wielokrotnie wyższy niż zwykłych budowli; czas pracy w tickach (`BuildDef.work`) i plan budowy w stanie (`st.builds`) już dziś przeżywają noc i zapis, więc budowa wielodniowa nie wymaga nowego mechanizmu. Warunek postawienia (teren, produkcja) to pole w definicji budowli, które dopisze projekt zwycięstwa. Ten projekt nie dodaje żadnego cudu.
- Lek na bakterię i lek na zombie to osobny wątek fabularny z wypraw, nie technologia, więc w drzewie ich nie ma (integrator). Dotyczy to też bakteriofaga z GDD („Prąd i bakteria”): zostaje wątkiem fabularnym, nie kartką na tablicy.
- Angielskie nazwy technologii i er według `docs/SLOWNICZEK-EN.md` (jeśli `src/content/data.en.ts` ich nie ma, budujący je dopisuje).

## Stan, polecenia, determinizm (moje)

- Nowe pola `SimState` są opcjonalne i powstają przy pierwszym użyciu, jak `techDone?`: bieżące badanie i zapisany postęp każdego zaczętego badania (np. `research?: { cur: string | null; prog: Record<string, number> }`), książki. Stan bez nich to gra bez badań. Wersja stanu się nie zmienia.
- Wybór badania, „Badać” zarządu i zmiana badania idą przez kolejkę poleceń w stanie (`sim.push`) i działają od następnego kroku.
- Ukończenie liczy symulacja w kroku: postęp ≥ koszt, technologia trafia do `techDone`, odczyt (`snapshot()`) mówi interfejsowi o odkryciu (np. lista odkryć od ticku, którą interfejs zamienia na kartę).
- Bez `Math.random` i bez tasowania przez `sort`. Losowanie książek z generatora z ziarna i pomieszczenia.
- Zapis i wczytanie w połowie badania nie zmieniają przebiegu. `worldKey` się nie zmienia (badania nie ruszają świata).

## Styk z pracą ludzi (uzgodnione z sesją „System pracy i rekrutacji kolonii”, 19.10.2026)

- Projekt pracy ludzi (gałąź `praca-ludzi`, `src/sim/praca.ts`) ma tabelę rodzajów pracy. Rodzaj „Badania” będzie tam dziewiątą kolumną, ukrytą, dopóki ta gałąź nie wejdzie.
- Ta gałąź wystawia: w `sim.ts` metodę `startResearch(p): boolean` (szuka wolnego miejsca w pracowni i zaczyna pracę badania), a w module badań czyste `badaniaDom(st): Dom | null` (dziedzina bieżącego badania) i `badaniaWidoczne(st): boolean` (jest pracownia albo badanie). Kto scala drugi, podpina je w wpis „Badania”.
- Krzywa umiejętności `1 + 0,1 · poziom` jest u mnie kopią `tempoPoziomu` z projektu pracy. Przy scaleniu kopia ustępuje oryginałowi. Cechy nakładam tylko w badaniach, raz.
- Ta gałąź nie rusza `think()` zarządu. Zarząd bada na polecenie, lokatorzy przez zaczep w planie dnia. W `sim.ts` obie gałęzie dopisują po wpisie do `JobKind`, unii poleceń i konstruktora `Sim`.
- Jedyna zmiana w zachowaniu bezczynnego zarządu to wybór paleniska w `startRefuel` (sekcja „Dokładanie”). Rodzaj „Ogień” z projektu pracy ludzi woła `startRefuel`, więc dostaje nowe paleniska bez zmian po swojej stronie.

## Szczyt drzewka (kierunek, nie w tym projekcie)

Mateusz, 19.10.2026, o ostatniej minucie zwycięstwa technologicznego: „Mam generator fuzji podłączony do super serwera AI obsługującego fabrykę humanoidalnych żołnierzy w wersji zombie, z bakterią to podobnie, ale zamiast fabryki humanoidów to bioroboty odporne na bakterię miedzi”. Po drodze więcej sci-fi.

Z kierunku rozwoju: technika bez miedzi (światłowód, aluminium, ogniwa zalane szkłem, elektronika w żywicy), bioogniwo i kontrolowany odzysk miedzi, własny model AI z dysków banku, stacja naziemna do satelitów. Wspólny pień i gałęzie trybów. Lek na bakterię i na zombie to wątek fabularny z wypraw, nie technologia (integrator). Warunki zwycięstwa i cuda spisuje nocny integrator w osobnym projekcie. Ten projekt zostawia mu miejsce: ery z danych, technologie z polem trybu gry i oznaczeniem „końcowa”, wymagania w postaci budowli (cudu), zakładka „Cuda” w menu budowy, tablica bez założenia o pięciu kolumnach.

## Testy i bramka

Testy w Node (nowe pliki w `tests/unit/`), każdy sprawdzony celowo wprowadzonym błędem:
- wiedza osady: najwyższa umiejętność zarządu i lokatorów, książki do 2, osoba na wyprawie się nie liczy;
- stan kartki: zbadana, w toku, do wzięcia, brak wiedzy, brak wymagań, odwrócona;
- tempo: ta sama praca szybciej z umiejętnością i z cechą pracowity, wolniej z leniwym;
- pełny przebieg na prawdziwej mapie (Przymorze albo Lanciego): postawić pracownię, wybrać technologię, zarząd bada, technologia trafia do `techDone`, budowla się odblokowuje i da się ją postawić;
- lokator z wiedzą sam siada w godzinach pracy, bez wiedzy nie, nocą nie;
- zmiana badania zachowuje postęp; utrata wiedzy zatrzymuje postęp;
- każda z 11 technologii zmienia to, co obiecuje (temperatura, plon, przepis, zdrowie, zasięg warty, budowla);
- książki: przeszukanie daje książkę z ziarna, trzecia idzie na podpałkę, gra bez przeszukań ma ten sam skrót;
- determinizm: gra bez pracowni ma ten sam skrót co przed zmianą; ten sam skrót po kilku dobach badań; zapis i wczytanie w połowie badania nie zmieniają przebiegu; stary zapis bez pól badań wczytuje się bez zmian;
- tablica i karta Odkrycie jako czysta funkcja do HTML: stany kartek, sznurki, odwrócone kartki, napisy w obu językach;
- menu budowy: kłódki z nazwami badań, NOWE po odkryciu.

Boty:
- `npm run bot` i `npm run bot:zombie` bez badań: te same skróty co przed zmianą, poza przebiegami, w których pojawi się książka albo wiedza lokatorów zmieni wydarzenie zarządu; każda zmiana skrótu wyjaśniona w dzienniku.
- Nowa polityka bota z badaniami (flaga albo osobny skrypt, z `--mieszkancy`): stawia pracownię drugiego dnia, wybiera najtańszą dostępną technologię, sadza jedną osobę zarządu za dnia, a lokatorzy siadają sami. Wynik do dziennika: ile technologii w dniu 11 i 16, którego dnia każda, zgony, jedzenie, drewno i temperatury w pierwszej zimie z badaniami i bez. Ten sam pomiar bez `--mieszkancy` dla porównania.
- Bot warty: noc z wartownikiem na wieży i bez, na trzech demach; zmiana szansy i wyniku napadu.

Zrzuty (`npm run shots`, obejrzane w Chromium): tablica z kartkami we wszystkich stanach na komputerze i telefonie, po polsku i po angielsku; karta Odkrycie; pracownia na mapie z osobą przy stole; menu budowy z kłódkami i znaczkiem NOWE; każda z 6 nowych budowli na mapie. Wydajność: `npm run perf` bez regresji.

Bramka: testy, Biome na `src tests tools index.html`, build, boty, zrzuty i wydajność jak wyżej, wpis w `docs/POSTEP.md`.

## Kolejność budowy (moje)

1. Dane technologii nowej gry, stan badań, wiedza, tempo, polecenia, praca badania zarządu, ukończenie, testy.
2. Pracownia, lokatorzy przy stole, książki, testy.
3. Premie i 6 budowli z technologii, testy, bot z badaniami i strojenie tempa.
4. Interfejs: tablica korkowa, karta Odkrycie, przycisk i klawisz, kłódki i NOWE w menu budowy, rysunki budowli kodem, napisy w obu językach, zrzuty.
5. Wydajność, bramka, dziennik.

## Decyzje

Po przeglądzie projektu przez recenzenta w roli budującego (19.10.2026) rozstrzygnąłem cztery pytania sam i wysłałem je nocnemu integratorowi z rekomendacją i kosztem pomyłki. Jeśli integrator zdecyduje inaczej, wpis tutaj i w sekcji, której dotyczy, zmienia się na „(integrator)”.

1. Wzorcem tempa jest gra z mieszkańcami z adresu, a tempo i mnożnik kosztu ery stroi bot z `--mieszkancy` (sekcja „Tempo”). Koszt pomyłki: tylko liczby, a gra bez mieszkańców bada wolniej.
2. Wieża to posterunek na karcie nocy, który dokłada połowę warty do każdego innego posterunku (sekcja „Wieża”). Koszt pomyłki: średni, bo rusza kartę nocy i `src/gov/noc.ts`; bierna premia byłaby mniejszą zmianą, ale bez decyzji „kto idzie na wieżę”.
3. Zarząd sam dokłada do wszystkich palenisk, a dyżur przy kozie i drewno na noc liczą każde (sekcja „Dokładanie”). Koszt pomyłki: bilans drewna pierwszej zimy, mierzony botem.
4. Skrót stanu może się zmienić, kiedy pojawi się książka albo wiedza lokatorów zmieni wydarzenie; każda zmiana wyjaśniona w dzienniku (sekcja „Książki”). Koszt pomyłki: tylko bramka botów.

Wcześniejsze rozstrzygnięcia integratora: technologia końcowa, odczyt `badania` dla zarządu, zakładka „Cuda”, brak leku i bakteriofaga w drzewie (sekcja „Dane”).

## Zostaje budującemu

- Dokładna postać pól stanu, poleceń i odczytu, nazwy funkcji, podział między moduł badań a `sim.ts`.
- Koszty, rozmiary i czasy pracy nowych budowli, `TEMPO_BAZOWE` i liczby premii, jeśli bot pokaże, że trzeba je zmienić (zasady zostają).
- Wygląd tablicy w ramach wariantu C i stylu gry, układ na telefonie, klawisz skrótu.
- Rysunki budowli kodem w `src/render/art/budowle.ts` (miniatury w menu biorą się z nich same). Uwaga z rozpoznania: ten plik ma własną kopię listy rodzajów (`BuildKind`, `BUILD_KINDS`, `BUILD_BASE`), a gałąź `default` w `buildSprite` rysuje zasieki, więc nowy rodzaj bez własnego przypadku wyjdzie jako drut kolczasty. Nowy rodzaj trzeba dopisać też w `ThingSpec` i `thingSprite` (`src/render/art/rzeczy.ts`), `specOf` (`src/render/section.ts`), miniaturach (`src/ui/miniatura.ts`) i duchach planów (`src/render/buildLayer.ts`), a napisy w `BUILDS_EN` i `BUILD_ACC`.
- Postać tablicy na ekranie: osobna warstwa pełnoekranowa obok `Modal` albo jego wariant. Karta „Odkrycie” może być zwykłym `Sheet` z nowym odcieniem (odcienie to zamknięta lista z CSS w `src/style.css`), wywoływanym ze stanu symulacji jak `watchSasiedzi`.
- Test `tests/unit/budowle-tech.test.ts` pilnuje, że `techDone` nie powstaje bez odblokowania; to samo dotyczy nowych pól badań i książek. Zrzut `?budowa=klodki` (budowla testowa `t_test`) ma dalej działać.
