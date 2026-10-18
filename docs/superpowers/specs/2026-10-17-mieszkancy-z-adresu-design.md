# Mieszkańcy z adresu: projekt

Stan: projekt do przeczytania przez Mateusza, 17.10.2026. Nic z tego nie jest jeszcze zbudowane.

Źródła: rozmowa z Mateuszem z 17.10.2026, raport `reports/Dane do generatora mieszkańców.md` (liczby, identyfikatory zmiennych, licencje), notatki w `research_notes/Dane do generatora mieszkańców/`, sekcje Lore i „Dwie warstwy ludzi” w `docs/GDD.md`, zasady RODO w `CLAUDE.md`. Surowe pobrane pliki leżą lokalnie w `dane-surowe/` (poza repo, w `.gitignore`).

Oznaczenia: „Mateusz” przy decyzji znaczy, że ustalił to Mateusz. „Moja decyzja” znaczy, że to założenie projektującego, które Mateusz może zmienić. Reszta wynika z danych albo z zasad repo.

## Po co

Gracz wpisuje swój adres i ma poczuć, że w grze żyją jego sąsiedzi, a przynajmniej ludzie, jacy mogliby tu mieszkać. Dziś `makePerson` losuje imię z 20 męskich i 20 żeńskich, nazwisko z 20 najczęstszych w kraju i zawód z listy. Przymorze i Zielonki dostają tych samych Kowalskich.

Generator ma wziąć to, co statystycznie typowe dla tego miejsca w 2026 roku: jakie rodziny mieszkają w tym typie budynku, w jakim są wieku, jakie nazwiska są w regionie. Potem przesuwa ich o 25 lat do 2051 (Mateusz) i pyta, kim są ich dzieci, ile mają własnych, kto wrócił opiekować się rodzicami, a kto zestarzał się i siedzi sam (Mateusz). Ludzie w 2051 to dzieci i wnuki dzisiejszych lokatorów, a nie oni sami (Mateusz, rok zero 2026 w lore). Dzisiejsze osiedle gracza jest dla nich „dawnymi czasami”.

## Cele

- Mieszkańcy różnią się między miejscami tak, jak różnią się w danych: falowiec na Przymorzu to samotne wdowy i wnuki na wynajmie, Zielonki to duże rodziny w domach, Ursynów to dawni przyjezdni i ich dorosłe dzieci.
- Każda osoba ma rodzinę, wiek pasujący do rocznika, imię typowe dla rocznika i nazwisko pasujące do regionu.
- Każde gospodarstwo ma dwie, trzy linijki historii z prawdziwymi miejscami z okolicy i z latami upadku.
- Gracz może zmienić imię każdej postaci, w której kogoś rozpoznaje, a gra odmienia je poprawnie (Mateusz). Reszta zostaje losowa (Mateusz).
- Ten sam adres zawsze daje tych samych ludzi, w przeglądarce i w Node.

## Poza zakresem

- Prawdziwi ludzie w jakiejkolwiek postaci. Żadnych danych osobowych, żadnych postaci z nazw firm.
- Modele językowe. Historie powstają z szablonów i zdarzeń symulacji.
- Zapytania do API GUS z przeglądarki gracza. Wszystko liczymy offline.
- Wysyłanie imion wpisanych przez gracza gdziekolwiek poza jego urządzenie.
- Zmiana tablic treści przeniesionych z 0.3 (`NAMES`, `SURN`, `PROFS` w `src/content/data.ts`). Zostają dla testu zgodności z 0.3. Generator ma własne tabele.
- Pełna symulacja życia krewnych, którzy wyjechali. Zostają jako wpis w historii („syn w Niemczech, bez kontaktu od 2034”).

## Czego nie chcemy, nawet jeśli działa

- Ktoś czyta w grze opis, który pasuje do jego prawdziwej sąsiadki z numerem mieszkania, i to w złym świetle.
- Mieszkańcy wyglądają jak losowanie z list: wszyscy Kowalscy, wiek bez związku z budynkiem, osiemdziesięcioletni Nikodem.
- Historie łamią polszczyznę („mieszka z Marek”).
- Repo puchnie od surowych danych, a strona ładuje megabajty dla jednego adresu.
- Symulacja daje inny wynik w Safari niż w Node.

## Twarde ograniczenia

- RODO (CLAUDE.md): postaci są zmyślone; z prawdziwego świata bierzemy tylko miejsca z OSM i statystyki zbiorcze; nie robimy postaci z nazw firm, bo jednoosobowe firmy mają imię i nazwisko właściciela; postaci przypinamy do klatki, nie do numeru mieszkania.
- Lore: żadnych nazwisk prawdziwych polityków. Rok zero bakterii 2026, odkrycie około 2029, rozpad w latach trzydziestych i czterdziestych, gra w 2051.
- Symulacja oddzielona od rysowania, deterministyczna, uruchamialna w Node.
- Generator nie rusza strumienia losowań przeniesionego z 0.3 (`st.rng` w `src/sim/sim.ts`). Ma własne ziarna.
- Statyczna strona na GitHub Pages, bez backendu. Publiczne repo, więc dane w repo muszą mieć licencję pozwalającą na publikację (tabela licencji w raporcie).
- Atrybucja map zostaje widoczna. Dochodzi atrybucja danych demograficznych i nota BSD słownika SGJP.

## Jak to działa w skrócie

Raz, offline, skrypty w `tools/` przerabiają surowe pliki z `dane-surowe/` na małe tabele w repo. W grze, po wczytaniu mapy:

1. Środek mapy (`geo.c`) wskazuje rejon statystyczny NSP 2021, gminę i województwo.
2. Każdy budynek mieszkalny w obszarze gry dostaje epokę budowy, liczbę mieszkań i rozdział mieszkań na klatki.
3. Generator obsadza mieszkania gospodarstwami ze stanu na spis 2021, zgodnymi z rozkładami rejonu.
4. Ten sam silnik postarza ich do 2026 w świecie bez upadku (to jest też test przeciw prawdziwym danym z 2025), a potem w pięciu krokach po 5 lat do 2051, już z upadkiem.
5. Osoby dostają imiona według rocznika, nazwiska według województwa i odmianę.
6. Powstaje kronika osiedla (wspólne zdarzenia lokalne z lat 2026–2051), a z dziennika zdarzeń każdej rodziny dwie, trzy linijki historii.
7. Rdzeń zarządu bierze się z mieszkańców siedziby, a pionki tłumu z mieszkańców swoich klatek.

## 1. Dane offline

Skrypty w `tools/` (TypeScript uruchamiany wprost przez Node, jak reszta narzędzi) czytają `dane-surowe/` i zapisują tabele do katalogu z danymi gry, np. `public/data/mieszkancy/`. Lista tabel, źródeł i identyfikatorów zmiennych BDL jest w raporcie, w sekcji „Kilkanaście małych tabel”. W skrócie:

| Tabela | Poziom | Do czego |
|---|---|---|
| rejony: gospodarstwa wg wielkości i składu, rodziny wg typu i liczby dzieci, płeć × wiek 10-letni (NSP 2021) | rejon, plik na gminę | rozkłady brzegowe obsadzania |
| obrysy rejonów BREC 2021, uproszczone | plik na gminę | punkt w wielokącie |
| gminy z BDL: 5-latki, stan cywilny, wiek reprezentanta gospodarstwa, metraż, mieszkania wg okresu budowy z ludnością (P4386), struktura wieku na 31.12.2025 (P2137) | gmina, dzielnica | epoki budynków, wielkość mieszkań, test 2021→2025 |
| szablon krajowy: wielkość × skład × obecność osób 60+, skład pokoleniowy | Polska, miasta, wieś | łączenie rozkładów (IPF) |
| prognoza GUS 2023–2060 | gmina (10-latki), powiat (roczniki) | punkt odniesienia dla świata bez upadku |
| umieralność: qx 0–100, Tablica A 2025 | Polska, M/K, miasta i wieś | zgony |
| płodność wg wieku, kolejność urodzeń, bezdzietność kohort, TFR podregionów | Polska z mnożnikiem lokalnym | urodzenia |
| przejścia: przeprowadzki wg wieku, emigracja, powroty, wyprowadzka z domu, samotna starość, opieka | Polska | szanse na krok |
| imiona: roczne od 2000, pięć koszyków wieku przed 2000, trend po 2026, osobna pula przyjezdnych | Polska | imiona wg rocznika |
| nazwiska: 200–300 na województwo plus pula lokalna z udziałem | 16 województw | nazwiska wg regionu |
| odmiana: 7 przypadków l. poj. z SGJP, l. mn. dla nazwisk, indeks końcówek dla zgadywacza | wybrane imiona i nazwiska | odmiana |
| lista zakazanych nazwisk i połączeń | Polska | RODO i lore |

Budżet (moja decyzja): całe tabele w repo do około 60 MB, pobranie dla jednego adresu do około 500 KB. Budujący mierzy po pierwszym przebiegu i, jeśli trzeba, upraszcza obrysy albo łączy pliki.

Najpierw tabele dla trzech gmin z dem (Gdańsk, Warszawa z Ursynowem, Zielonki), potem cała Polska. Skrypty są powtarzalne, bo GUS i PESEL odświeżają dane co rok.

## 2. Gdzie jesteśmy

Środek mapy daje rejon statystyczny przez punkt w wielokącie BREC 2021 (test z raportu trafił we wszystkie trzy dema). Gmina i województwo wynikają z numeru TERYT rejonu. Gdy rejonu nie ma (adres za granicą, brak danych), generator schodzi na rozkłady gminy, a gdy i ich nie ma, na szablon krajowy i krajowe pule imion i nazwisk.

Jeden rejon obejmuje do około 2 700 osób, więc obszar gry 384 m zwykle zahacza o kilka. Moja decyzja: rejon wyznaczamy dla każdego budynku osobno, ze środka jego obrysu we współrzędnych geograficznych (przed obrotem mapy). Dzięki temu ten sam blok ma tych samych mieszkańców niezależnie od tego, który sąsiad wpisał swój adres, a dwie osoby z sąsiednich bloków mogą porównać swoich ludzi.

## 3. Budynki: epoka, mieszkania, klatki

Epoka (pięć koszyków: przed 1945, 1945–1970, 1971–1989 wielka płyta, 1990–2010, po 2010) w trzech warstwach, jak w raporcie:

1. `start_date` z OSM, gdy jest. Trzeba go dopisać do tagów zostawianych przy imporcie (`KEEP` w `src/world/osm.ts`). Kafelki OpenFreeMap go nie niosą, więc zadziała tylko przy Overpass i w demach.
2. Reguły z kondygnacji i szerokości: 10–12 kondygnacji i szerokość do 14,5 m to wielka płyta (precyzja 24 na 24 w próbce), 5 kondygnacji, wąski i długi to lata 1945–1989. Segmenty długich bloków pociętych na klatki trzeba najpierw skleić.
3. Gdzie reguły nie rozstrzygają: losowanie z rozkładu mieszkań według okresu budowy dla gminy (P4386), z ziarnem z budynku.

Zbiór budynków z map z lat 80. (Szubert, Kaim, Kozak 2024) to możliwa czwarta warstwa. Plik ma 1,33 GB i nikt jeszcze nie sprawdził, jak jego punkty pasują do obrysów OSM. Moja decyzja: to osobny, późniejszy krok z własnym testem na Przymorzu i Ursynowie, a nie warunek startu.

Liczba mieszkań (moja decyzja co do wzoru, liczby do kalibracji): dom jednorodzinny to jedno mieszkanie, czasem dwa (dom dwupokoleniowy). Blok: pole obrysu × kondygnacje × współczynnik powierzchni użytkowej ÷ średni metraż mieszkania w gminie dla danej epoki. Mieszkania dzielą się po równo na klatki z `entrances`. Część mieszkań stoi pusta: stosunek gospodarstw do mieszkań zamieszkanych z NSP dla gminy (w Gdańsku około 0,95).

## 4. Gospodarstwa na spis 2021

Rozkłady rejonu są jednowymiarowe: osobno wielkość gospodarstw, osobno skład, osobno typy rodzin i wiek. Offline skrypt łączy je metodą IPF z krajowym szablonem „wielkość × skład × osoby 60+” w łączny rozkład typów gospodarstw dla rejonu, rozpisany na typ i epokę budynku. Jedyna gminna krzyżówka gospodarstw z budynkami to ludność na mieszkanie według okresu budowy (P4386), i to ona ustawia wielkość rodzin w blokach z różnych lat. W grze każdy budynek losuje swoje gospodarstwa niezależnie, z rozkładu swojego rejonu, typu i epoki, bez wspólnej puli z innymi budynkami (moja decyzja, bo tego wymaga stałość budynku widzianego z różnych adresów). Suma po budynkach zgadza się z rejonem tylko w przybliżeniu, i to wystarczy.

Domyślne skłonności (moja decyzja, do strojenia botem):

- dom w starej zabudowie: para albo wdowa po sześćdziesiątce, dorosłe dzieci często poza domem, częściej trzy pokolenia (na wsi 24% gospodarstw jest trzypokoleniowych);
- dom na podmiejskim osiedlu z lat 2000–2020: para po trzydziestce i czterdziestce z jednym, dwojgiem dzieci;
- blok z wielkiej płyty: mieszanka pierwszych lokatorów z przydziału (dziś po siedemdziesiątce, często sami), ich dzieci i wnuków, najemców;
- blok po 2010: przyjezdni koło trzydziestki, pary bez dzieci i z małymi dziećmi.

Wiek osób w gospodarstwie musi się zgadzać z rozkładem płci i wieku rejonu, a wiek osoby reprezentującej gospodarstwo z rozkładem gminy (P4462). W blokach z danej epoki część najstarszych gospodarstw dostaje znacznik „mieszkają od oddania bloku”. Z niego wynikają historie o przydziale (Mateusz: „ktoś nie wyjechał ze swojego miasta”).

Dla każdej osoby powstaje też dawne zajęcie z 2021 roku, dobrane do wieku i okolicy, np. pielęgniarka przy przychodni z mapy. Służy tylko historii.

## 5. Dwadzieścia pięć lat

Jeden silnik, kroki po 5 lat. Pierwszy krok, od spisu do 2026, idzie bez upadku. Pięć kolejnych, od 2026 do 2051, idzie z dźwigniami upadku. Zdarzenia w kroku, w tej kolejności (moja decyzja):

| Zdarzenie | Skąd szanse |
|---|---|
| zgon | qx z Tablicy A 2025 (miasta albo wieś), co krok lekko obniżane, tak żeby e(0) szło między ścieżką średnią a wysoką GUS |
| urodzenie | płodność według wieku matki × mnożnik lokalny (TFR podregionu do krajowego); kolejność urodzeń 44/34/12/6% z 2024 |
| wyprowadzka z domu rodziców | średni wiek 26,8; 51% osób w wieku 25–34 mieszka z rodzicami |
| związek | samotni dorośli 25–39 łączą się w pary z pewną szansą na krok; partner przychodzi z zewnątrz jako nowa osoba w podobnym wieku (moja decyzja, danych nie badaliśmy) |
| przeprowadzka poza obszar | około 13% osób w wieku 25–34 na 5 lat, około 2% po 65. roku życia; kierunek z danych o migracjach (miasto, przedmieścia, wieś) |
| emigracja | około 5–6% na 5 lat w wieku 25–39 |
| powrót | do 25–30% emigrantów na 5 lat (górne przybliżenie); powrót do opieki uruchamia rodzic 75+ mieszkający sam |
| wolne mieszkanie | zajmują przyjezdni z puli regionu albo krewni |

Kto wyjechał, nie znika z historii. Zostaje jako krewny z miejscem i rokiem, bez dalszej symulacji.

Kto z dzisiejszych dorosłych dożyje, zostaje (moja decyzja). Z dzisiejszych trzydziestolatków dożywa 2051 ponad 90%, więc w 2051 mieszkają i oni, po pięćdziesiątce i sześćdziesiątce, i ich dzieci. Zasada „dzieci i wnuki, a nie oni sami” chroniła przed rozpoznaniem prawdziwych sąsiadów. To zapewnia już fikcyjność wszystkich postaci, klatka zamiast numeru i 25 lat przesunięcia, a nie usuwanie ocalałych. Historie tych, którzy mieszkają od dawna, i tak idą przez pokolenia: „mieszka w mieszkaniu po babci, która dostała przydział w 1978”.

Generator robi jedną migawkę na start gry, w październiku 2051. Potem o zgonach, urodzeniach i przybyszach decydują systemy gry (M3), a ludzie tylko starzeją się z kalendarzem gry (moja decyzja). Stan gry przechowuje osoby, które są w grze (rdzeń, tłum na mapie, ludzie przyłączonych budynków). Resztę mieszkańców obszaru da się odtworzyć z ziaren w każdej chwili, więc nie trafia do stanu ani do skrótu stanu.

Dźwignie upadku to decyzje gry, nie dane, i każda jest jedną liczbą w tabeli strojonej botem. Wartości startowe (moja decyzja):

- od 2029 do około 2036 fala powrotów: emigranci wracają, bo za granicą też zjadło kable, a z dużych miast ludzie jadą do rodzinnych domów z ogródkiem;
- od około 2035 emigracja prawie zero;
- spadek urodzeń w latach 2030–2035;
- wyższa umieralność 75+ w latach 2035–2045 (zimno, brak leków);
- wyższa szansa, że dorosłe dzieci wracają do rodziców albo biorą ich do siebie, więc gospodarstwa wielopokoleniowe stają się normą (Mateusz: „jedno z dwojga dzieci wróciło opiekować się rodzicami”).

Uczciwa linia bazowa bez upadku już daje w 2051 osiedle starych ludzi: dzietność 2025 (1,068) jest poniżej najczarniejszego scenariusza GUS, a z kobiet z rocznika 1975 co piąta jest bezdzietna. Dźwignie dodają głównie powroty i wspólne mieszkanie, a nie dodatkową śmierć.

Stan pustych mieszkań (pomysł Mateusza z 18.10.2026: „W tych mieszkaniach to w sumie powinny być śmieci często do odzyskania albo coś do naprawienia.”). Generator wie, dlaczego mieszkanie opustoszało, więc każde puste mieszkanie dostaje z historii swój stan: klatkę, rok opuszczenia i rodzaj, np. rodzina wyjechała i zostawiła meble, lokatorzy wymarli, mieszkanie splądrowano, zalało je, był pożar. Rodzaj wynika z dziennika (wyjazd, zgon, wyludnienie) i z losowania z ziarna budynku dla zdarzeń z lat upadku. Zawartość wnętrza, śmieci do odzysku i rzeczy do naprawy robi z tego stanu M2 (wnętrza i symulacja); generator daje tylko stan.

## 6. Imiona i nazwiska

Imiona według rocznika:

- urodzeni od 2000: roczne listy imion nadanych dzieciom (PESEL, CC0);
- urodzeni przed 2000: pięć koszyków wieku z udziału zmarłych wśród nosicieli imienia (Janina 66% zmarłych, Agnieszka 9%), losowanie w koszyku proporcjonalnie do liczby żyjących; imiona z dwiema falami mody (Zofia, Antoni, Julia, Jan, Stanisław) rozdzielone ręcznie;
- urodzeni od 2026: wygaszana ekstrapolacja trendu do około 2030, potem dryf i pula imion powracających.

Listy żyjących obejmują cudzoziemców z PESEL. Transliteracje ukraińskie i rosyjskie idą do osobnej puli przyjezdnych, z udziałem sterowanym liczbą, a nie przypadkiem. Imiona drugie są w danych, ale moja decyzja: na razie ich nie używamy.

Nazwiska: dla województwa 200–300 nazwisk ważonych liczbą i pula lokalna (kaszubskie na Pomorzu, śląskie na Śląsku) losowana z udziałem z danych (20% w pomorskim, 1% w zachodniopomorskim). Nazwisko rodziny losujemy w formie męskiej, a żeńską z niej wyprowadzamy (Kowalski → Kowalska, Nowak → Nowak). Dzieci dziedziczą nazwisko ojca, a u samotnej matki nazwisko matki. Partner z zewnątrz może mieć nazwisko z puli innego województwa (moja decyzja).

Progi i blokady: nazwiska od kilkuset nosicieli w kraju, imiona od kilkunastu wystąpień w plikach rocznych. Lista zakazanych nazwisk rozpoznawalnych polityków (lista nazwisk lokalnych ma kilka takich) i zakazanych połączeń imię plus nazwisko znanych osób. Listę trzyma repo i sprawdza test.

## 7. Odmiana i zmiana imienia przez gracza

Imiona i nazwiska z pul gry mają odmianę wyciągniętą z SGJP: 7 przypadków liczby pojedynczej, bez form oznaczonych `pot.` i `niepopr.`, a dla nazwisk też liczba mnoga („państwo Kowalscy”, „Nowakowie”). Licencja BSD-2: nota z nagłówka pliku SGJP trafia do repo obok tabeli i do ekranu z informacjami o grze.

Imię wpisane przez gracza odmienia zgadywacz w TypeScripcie. To przepisane z raportu reguły końcówek i płci (97,8% pełnych paradygmatów na imionach SGJP) plus zgadywacz końcówkowy uczony na SGJP (96,5%). Kiedy obie metody się zgadzają, gra przyjmuje wynik bez pytania. Kiedy się różnią, zaznacza pola do sprawdzenia.

Zmiana imienia (Mateusz): na karcie osoby gracz wpisuje nowe imię. Obok widzi siedem pól z formami podpowiedzianymi przez zgadywacz, np. Halina, Haliny, Halinie, Halinę, Haliną, o Halinie, pani Halino, i może każde poprawić. Nazwisko zmienia się tak samo, osobno. Wiek, rodzina i historia zostają losowe (Mateusz: „musi być trochę random”). Zmiany zapisują się tylko w przeglądarce gracza, pod kluczem z adresu i identyfikatora osoby. Nie trafiają do zapisów wysyłanych gdziekolwiek ani do zrzutów udostępnianych z gry, dopóki Mateusz nie zdecyduje inaczej.

## 8. Historie

Dwa poziomy:

- Kronika osiedla: kilkanaście wspólnych zdarzeń lokalnych z lat 2026–2051, losowanych z ziarna rejonu i podpiętych pod prawdziwe miejsca z mapy. Przykłady: kiedy zgasły latarnie na ulicy, kiedy zamknięto przychodnię, kiedy bakteria zjadła kable w klatce B. Wiele postaci odwołuje się do tych samych zdarzeń, więc osiedle ma jedną, spójną przeszłość.
- Historia gospodarstwa: dziennik zdarzeń z symulacji (przydział, urodzenia, wyjazdy, powroty, owdowienie, opieka) zamieniany szablonami na dwie, trzy najważniejsze linijki. Przykład: „Agnieszka mieszka w mieszkaniu po babci, która dostała przydział w 1978. Wróciła z Wrocławia w 2031, kiedy ojciec przestał chodzić. Brat w Niemczech, bez kontaktu od 2034.”

Szablony mają miejsca na przypadki (`{osoba:dop}`, `{osoba:wol}`), rodzaj (`g(p, 'wrócił', 'wróciła')` z `src/content/people.ts`), wiek (`wiek()`), miejsca z mapy i lata z kroniki. Dawne czasy, czyli dzisiejszy świat gracza, wchodzą satyrą: hulajnogi na minuty, paczkomaty, lodówki na abonament, sklep na rogu z mapy.

Miejsca z OSM w historiach: szkoły, przychodnie, kościoły, ogródki działkowe, sklepy, ulice. Nazwa miejsca, która wygląda na imię i nazwisko (sprawdzenie z listą imion z PESEL), zamienia się na ogólny opis („zakład fryzjerski na rogu”). Nazwy sieci handlowych zostają, bo i tak widać je na mapie.

Ton historii i satyry ustala Mateusz. Budujący pisze pierwszy zestaw szablonów, a Mateusz go czyta przed wejściem do gry.

## 9. Połączenie z grą

- Wynik generatora to osoby zgodne z dzisiejszym `Person` (imię, nazwisko, płeć, zawód, umiejętności, wiek, cechy, dom), rozszerzone o rocznik, gospodarstwo, klatkę, krewnych, historię i formy odmiany. Fach na 2051 i umiejętności biorą się z własnej tabeli fachów generatora (dziedziny jak w 0.3), z wagami od wieku, dawnego zawodu i okolicy. Dawny zawód sprzed upadku jest tylko linijką historii. Cechy jak dziś z `TRAITS`.
- Rdzeń zarządu i mieszkańcy siedziby (w M1: 3–8 osób z planem dnia) pochodzą z gospodarstw siedziby, z klatką, rodziną i historią (GDD: „zarząd i fachowcy z waszych klatek”). Reszta osiedla zostaje jako gospodarstwa per klatka, bez pionków, na przyszłe zajmowanie budynków.
- Dotychczasowy rdzeń: `createSim` przestaje losować rdzeń przez `makePerson` i wybiera z gospodarstw siedziby cztery osoby, które pokrywają potrzebne dziedziny (ciepło, budowa, medycyna, uprawy), tak jak dziś. `makePerson` zostaje dla testów zgodności z 0.3.
- Pionki mieszkańców siedziby (od M1 zamiast tłumu) to konkretne osoby z gospodarstw siedziby, więc po kliknięciu pokazują kartę. Gdy wrócą pionki z innych klatek, zasada jest ta sama. Pionków jest mniej niż mieszkańców; resztę liczymy per klatka, jak w GDD.
- Karta osoby: imię, wiek, klatka, rodzina, historia, przycisk zmiany imienia. Karta klatki albo budynku: lista gospodarstw w jednej linijce każde. Bez numerów mieszkań i bez pięter. Przekrój budynku może umieszczać rodziny w mieszkaniach, ale bez etykiet.
- Determinizm: każdy budynek ma własne ziarno z identyfikatora rejonu, stałego klucza budynku i numeru wersji generatora. Klucz budynku to identyfikator OSM, jeśli źródło go daje, a inaczej skrót z zaokrąglonego środka i pola obrysu we współrzędnych geograficznych, nie po obrocie mapy; budujący sprawdza, co niosą kafelki i dema. Stan po krokach 1-4: skrót ze środka i pola jest stały tylko w obrębie jednego wczytania mapy, bo importery zaokrąglają wierzchołki względem środka mapy, więc ten sam budynek z innego adresu dostaje inny klucz; kanoniczne id i geometria budynku z importera to warunek kroku 5 (R51). Dzięki ziarnom na budynek nie ma znaczenia, czy budynki generujemy wszystkie na starcie, czy dopiero przy pierwszym kliknięciu.
- Trwałość (moja decyzja): ten sam adres daje tych samych ludzi w obrębie jednej wersji generatora i jednej edycji tabel. Tabele odświeżamy świadomie, najwyżej raz w roku, razem z podbiciem wersji i wpisem w dzienniku. Zapis gry (M5) przechowuje swoich ludzi, więc rozpoczęta gra po aktualizacji się nie zmienia; zmieniają się tylko nowe gry. Imię zmienione przez gracza, które po aktualizacji nie ma już swojej osoby, gra pokazuje raz z dopiskiem „wyprowadził się” albo „wyprowadziła się” i usuwa.
- Decyzje generatora liczymy na liczbach całkowitych (szanse w promilach lub dziesięciotysięcznych), bez `Math.sin`, `Math.hypot` i podobnych. POSTEP zapisuje, że te funkcje mogą dawać różne wyniki w różnych przeglądarkach.
- Wydajność: cały obszar 384 m to rząd kilku tysięcy osób. Cel (moja decyzja): generowanie do 200 ms na telefonie, poza wątkiem rysowania. Budujący mierzy w `npm run perf`.

## 10. RODO w praktyce

- Generator pracuje na rejonach, nigdy na obwodach spisowych (obwody bywają kilkugospodarstwowe).
- Żadnych numerów mieszkań i pięter w tekstach, tylko klatka.
- Progi dla rzadkich imion i nazwisk, blokada polityków i znanych połączeń, filtr imion i nazwisk w nazwach miejsc.
- Imiona wpisane przez gracza zostają na jego urządzeniu.
- Widoczny napis, że mieszkańcy są wymyśleni, na karcie osoby albo pod listą mieszkańców (moja decyzja co do miejsca). Ten sam adres zawsze daje tych samych ludzi, więc zrzut ekranu może krążyć w sieci, i napis ma być na zrzucie.

## 11. Atrybucja i licencje

Linia do ekranu z informacjami o grze, obok atrybucji map, jest w raporcie. Do repo trafia plik z notą BSD SGJP i listą źródeł danych z licencjami. Przed publikacją danych pochodnych z BDOT10k albo EGiB trzeba potwierdzić ich licencję. Na razie ich nie używamy. Pliki CBOS i CMR UW nie trafiają do repo, tylko liczby ze źródłem.

## 12. Jak sprawdzamy

- Test wsteczny: silnik postarza rejony z 2021 do końca 2025, a wynik dla gminy porównujemy ze strukturą wieku z BDL (P2137). Moja decyzja co do progu: udziały grup 0–14, 15–64, 65+ i 80+ w granicach 2 punktów procentowych dla trzech gmin z dem.
- Testy jednostkowe: ten sam adres daje tych samych ludzi; brak nazwisk z listy zakazanych; brak imion i nazwisk z nazw firm; odmiana z SGJP zgodna z tabelą dla zestawu testowego z raportu; zgadywacz co najmniej 95% pełnych paradygmatów na odłożonej części SGJP; nikt urodzony przed 1990 nie nosi imienia z czołówki lat 2020.
- Bot: komenda w stylu `npm run mieszkancy -- demo` wypisuje dla trzech dem piramidę wieku w 2021, 2026 i 2051, rozkład typów gospodarstw, udział gospodarstw wielopokoleniowych i samotnych 75+ oraz kilka przykładowych historii. Na tym stroimy dźwignie upadku.
- Zrzuty kart osoby, klatki i edytora imienia w Playwright, po każdej zmianie wizualnej (CLAUDE.md).

## Kolejność budowy

Moja propozycja, każdy krok z bramką i zrzutami tam, gdzie coś widać:

1. Dane dla trzech gmin z dem: skrypty, tabele, rejon z punktu, test wsteczny 2021→2025. Bez gry.
2. Silnik gospodarstw i 25 lat w Node, bot z piramidami i typami gospodarstw. Bez gry.
3. Imiona, nazwiska, odmiana, zgadywacz.
4. Kronika osiedla i historie, przegląd tonu przez Mateusza.
5. W grze: rdzeń z siedziby, tłum z tożsamością, karty, zmiana imienia z odmianą, napis o fikcji, atrybucja.
6. Cała Polska w tabelach, pomiar rozmiarów.
7. Później: punkty budynków z lat 80. jako czwarta warstwa epok, rejony sąsiednie.

## Co zostaje dla budującego

Formaty plików i podział na pliki, szczegóły IPF, konkretne wartości parametrów (stroi bot), brzmienie pierwszych szablonów (czyta Mateusz), układ kart w interfejsie (sprawdza się zrzutami), sposób sklejania segmentów bloków, nazwy komend i modułów.

## Rozstrzygnięte pytania z przeglądu

Oba pytania rozstrzygnęła 18.10.2026 sesja koordynująca prace przy grze („Analiza folderu i realizacja planu”), z kierunku, który Mateusz dał w nocy: „świat upada i trzeba sobie radzić”, a wspólnota nie musi być wiernym odbiciem dzisiejszego blokowiska. Oba potwierdzone przez Mateusza 18.10.2026: „Tak, zostaw oba rozstrzygnięcia: połowa mieszkań pusta i fachy na 2051.”

1. Wyludnienie: mocne. W 2051 stoi pusta mniej więcej połowa mieszkań. To dźwignia w silniku strojona botem (ludzie wyjechali na wieś po jedzenie, umarli w zimach lat trzydziestych). Puste mieszkania stają się celami przeszukiwania jako „Opuszczone mieszkania”. Spółdzielnia na start to siedziba, reszta osiedla to gospodarstwa per klatka na przyszłe zajmowanie budynków.
2. Zawód: generator ma własne fachy na 2051, czyli to, co ktoś umie dziś robić na osiedlu, z dziedzinami umiejętności z 0.3 (`bud`, `cieplo`, `elek`, `med`, `uprawa`, `it`, `obrona`). Zawód sprzed upadku zostaje jako linijka historii i satyra („dawniej prompt engineer”). `PROFS` z 0.3 zostaje nietknięty dla testu zgodności.
