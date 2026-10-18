# M2, fala 2: sąsiednie budynki, ich lokatorzy i wspólny płot

Cel: za siatką jest coś więcej niż drewno. Zarząd idzie do sąsiednich budynków, wchodzi przez drzwi albo je wyważa, przeszukuje i szabruje mieszkania, natyka się na ludzi, którzy tam mieszkają, a budynek, który chce zatrzymać, otacza wspólnym płotem.

Mateusz 17.10.2026: „Chce chodzić do sąsiednich budynków i próbować się do nich włamać. Dopóki nie otoczy ich wspólnym płotem, w nocy może tam wejść ktoś inny. W innych budynkach mogą być lokatorzy, o których wiadomo albo nie, spotykani w dzień albo w nocy, z różnymi intencjami i emocjami.” Mateusz 18.10.2026, w trybie zombie: „nie widzę w ogóle żadnej możliwości, żeby przeszukać mieszkania obok (…). Klikam, ale zarząd tylko tam idzie.”

Dziś wnętrze ma tylko siedziba (`World.interior`), a każdy inny budynek jest bryłą zablokowaną razem z drzwiami, więc zarząd dochodzi pod ścianę i staje. Generator wnętrz działa dla każdego budynku (`buildInterior(w, bid)`), generator mieszkańców daje osoby dla każdego budynku mieszkalnego (`generujBudynek`), a hałas szwendacze już słyszą (`st.noise`). Na tym stoi fala 2.

Rozstrzygnięcia w tym dokumencie są moje (sesja fali 2), spójne z CLAUDE.md, GDD i kierunkiem rozwoju (`docs/superpowers/specs/2026-10-18-kierunek-rozwoju-design.md`, projekt 4), do zmiany przez Mateusza. Zasady fali 1 (`docs/M2-fala-1.md`) obowiązują.

## Pętla fali 2

- Dzień: zaznaczasz jedną albo dwie osoby, prawy przycisk na drzwiach sąsiedniego bloku albo domu. Pukasz albo próbujesz otworzyć, a zamknięte na klucz wyważasz, co trwa i hałasuje.
- W środku: przekrój jak w siedzibie. Puste mieszkania przeszukujesz pokój po pokoju (łup jak w fali 1), meble rozbierasz po przeszukaniu, zamieszkane mają zamknięte drzwi i ludzi w środku.
- Spotkanie: lokatorzy wychodzą do was przy pukaniu albo przy wejściu do ich mieszkania. Gra staje i pokazuje kartę: kto to jest, jak się zachowuje, czego chce, i wybory (porozmawiać, dać jedzenie, zaprosić do siebie, zabrać zapasy, odejść).
- Łup leży w stertach w cudzym budynku, więc trzeba go donieść do siedziby. Droga przez ulicę to ryzyko, zwłaszcza w trybie zombie.
- Noc: do otwartego i niezabezpieczonego budynku może wejść ktoś inny. Drzwi zabite deskami albo wspólny płot chronią to, co zostało w środku.

## Które budynki

- Każdy budynek z wejściem poza siedzibą: bloki, domy i budynki usługowe (pawilon, szkoła, przychodnia, garaż, hala, kościół). Mieszkalne mają mieszkania i lokatorów, usługowe sale, hale i zaplecza z łupem według rodzaju budynku, bez lokatorów.
- Cała mapa 384 m, bez limitu odległości. Daleki budynek to długa droga z łupem, i tyle.
- Inne klatki siedziby to nasz budynek, nie sąsiedzi: ich puste mieszkania przeszukuje się jak w fali 1, a zamieszkane należą do mieszkańców spółdzielni, którymi zajmie się projekt pracy ludzi (lokatorzy całej klatki jako liczby). Kod siedziby zostaje bez zmian.
- Budynek przy podwórku: siatka siedziby już dziś wciąga do podwórka kafelki przed drzwiami innych budynków (`buildFence`). Takie drzwi są po naszej stronie. Pozostałe drzwi tego budynku (od ulicy) są na start zawsze zamknięte na klucz, nigdy wyważone, więc otwarcie budynku od podwórka nie robi dziury w obwodzie. Kto otworzy drzwi od ulicy, łączy przez wnętrze ulicę z podwórkiem: menu ostrzega („Te drzwi otwierają drogę z ulicy na podwórko”), a zabicie ich deskami zamyka drogę.
- Drzwi klatek zajętych w grze sieciowej przez inne drużyny są zamknięte na stałe (sekcja o grze sieciowej).

## Drzwi i wejście

Drzwi to kafelek: wejścia budynku (`b.entrances[j]`: blok ma ich tyle, ile klatek, dom i reszta po jednym), drzwi na zewnątrz, które generator wnętrza dokłada sam (pomieszczenie bez innego połączenia), i drzwi wejściowe mieszkań w środku. Każde ma stan:

| stan | znaczy | kto przejdzie |
|---|---|---|
| `zamkniete` | zamknięte, nie wiadomo, czy na klucz | nikt |
| `na_klucz` | sprawdzone: zamknięte na klucz albo zabarykadowane | nikt |
| `otwarte` | otwarte klamką albo otworzone przez lokatorów | wszyscy |
| `wywazone` | wyważone przez nas albo kogoś wcześniej, zostaje przejściem | wszyscy |
| `zabite` | zabite przez nas deskami | nikt |

Stan domyślny liczy czysta funkcja z ziarna świata, budynku i kafelka drzwi (bez `st.rng`), a stan gry trzyma tylko drzwi zmienione. Domyślnie drzwi są `zamkniete` albo już `wywazone` przez kogoś wcześniej, a to, czy zamknięte są na klucz, wychodzi dopiero przy próbie otwarcia. Budynek z ludźmi: drzwi klatki na klucz w 70%. Budynek bez nikogo: 35% wyważone, 35% na klucz, reszta otwiera się klamką. W trybie zombie drzwi budynku z ocalałymi są zawsze zabarykadowane, a martwego 50% wyważone, 30% na klucz. Drzwi pustych mieszkań w środku są otwarte, zamieszkanych na klucz, a w trybie zombie mieszkanie, w którym czeka szwendacz, ma drzwi tylko zamknięte.

Polecenia na drzwiach (menu pod prawym przyciskiem na kafelku drzwi albo tuż przed nimi, tylko dla zarządu):

| polecenie | kiedy | czas pracy | hałas (promień) |
|---|---|---|---|
| Otworzyć | `zamkniete`, `otwarte` | 2 min gry | 3 m |
| Zapukać | `zamkniete`, `na_klucz`, budynek mieszkalny | 2 min | 6 m |
| Wyważyć drzwi | `zamkniete`, `na_klucz` | klatka i dom 40 min, mieszkanie 20 min; z łomem w rękach o połowę krócej | 25 m, z łomem 12 m; mieszkanie 15 m i 8 m |
| Zabić deskami | `otwarte`, `wywazone`; 2 deski ze stert | 20 min | 10 m |
| Odbić deski | `zabite` | 5 min | 3 m |

- „Otworzyć” jest domyślnym poleceniem drzwi (stuknięcie na telefonie, pierwsze w menu). Przy zamku kończy się napisem „Zamknięte na klucz” i stanem `na_klucz`; domyślne staje się wtedy „Zapukać”. Wyważanie jest tylko z menu.
- Pukanie coś mówi: „Nikt nie otwiera”, „Ktoś jest w środku, ale nie otwiera”, w trybie zombie „Zza drzwi słychać szuranie i charczenie” (szwendacz w mieszkaniu), albo zaczyna spotkanie.
- Hałas idzie przez `st.noise` co 2 sekundy pracy, więc w trybie zombie szwendacze w promieniu idą pod drzwi. W zwykłym trybie hałas słyszą lokatorzy tego budynku: kto jest w domu, czeka na was przestraszony albo zły.
- Polecenia idą przez kolejkę jak wszystkie, a koniec pracy przy drzwiach liczy przechodniość od nowa, tak jak koniec łatania. Zabite drzwi blokują także nas; odbicie desek jest ciche i krótkie.

## Wnętrze po otwarciu

- Pierwsze otwarte albo wyważone drzwi budynku dołączają jego wnętrze do mapy: `buildInterior(w, bid)` jak dla siedziby (bez mieszkania zarządu i kozy), ściany i schody blokują, posadzki przechodzą, drzwi według stanu. Każda klatka bloku ma własne wejście, więc druga klatka wymaga drugich drzwi.
- Wnętrza nie ma w zapisie: zapis trzyma listę budynków po kolei i zmiany (stany drzwi, przeszukane pomieszczenia, rzeczy), a wnętrze odtwarza się ze świata. Symulacja trzyma wszystkie wnętrza sąsiadów w jednej nakładce wielkości mapy (komórka, pomieszczenie), a nie po tablicy na budynek, bo każde wnętrze to dziś 0,44 MB. Generator wnętrza liczy blok w 1–20 ms, największe bloki demo do 100 ms, więc otwarcie budynku to jednorazowa chwila, a wczytanie zapisu z dziesięcioma otwartymi budynkami najwyżej pół sekundy dłużej.
- Stany mieszkań: z generatora mieszkańców, gdy gra ma tabele (gospodarstwa budynku na mieszkania parteru, powody i lata pustych z dziennika budynku, jak dla siedziby w `lokatorzyGry`). Bez tabel z ziarna budynku jak w `settleApts`: mniej więcej połowa pustych z powodem i rokiem, bez reguły podwórka. Zawartość pustych (zepsute meble, śmieci, uszkodzenia) z tych samych przepisów co w siedzibie. Uszkodzeń w cudzych budynkach się nie naprawia (to praca przy zajmowaniu mieszkań, które w fali 2 dotyczy tylko siedziby); wyważone drzwi i wybite okna widać.
- W trybie zombie z gospodarstw generatora przeżyło mniej więcej co czwarte. Reszta to puste mieszkania z wymarcia, a w co drugim z nich czeka szwendacz za zamkniętymi drzwiami mieszkania. Pojawia się na mapie dopiero przy otwarciu tych drzwi, w limicie 80 szwendaczy.
- Przekrój: otwarty budynek przy zbliżeniu traci dach jak siedziba, z wyważonymi drzwiami (sprite z fali 1), zabitymi (nowy sprite) i śladami pustych mieszkań. Przy oddaleniu pionki w jego środku chowają się pod dachem jak w siedzibie.

## Przeszukanie, szaber i łup

- Pokoje pustych mieszkań: „Przeszukać [pokój]” jak w siedzibie, łup `lootOf` z fali 1 według powodu opuszczenia i rodzaju pomieszczenia, raz na pomieszczenie, z ziarna świata, budynku i pomieszczenia (inne niż w siedzibie, więc numery pomieszczeń się nie zderzają). Meble rozbiera się po przeszukaniu, jak w fali 1.
- Sale, hale i zaplecza budynków usługowych mają własne tabele według rodzaju budynku: pawilon głównie jedzenie i części, przychodnia leki, szkoła deski i części, garaż i hala złom i części, kościół deski i trochę jedzenia. Liczby stroi bot.
- Tryb zombie: jedzenie przychodzi dziś tylko z wydarzeń, a najedzenie zarządu w bocie spada do zera około szóstej doby (sesja szlifu zombie). Mieszkania z wymarcia w tym trybie są świeże, ludzie zmarli niedawno, więc w kuchniach zostały konserwy i słoiki: łup jedzenia z nich jest dwa razy większy niż w tabeli fali 1. Szaber u sąsiadów jest wtedy głównym źródłem jedzenia, a bot `--sasiedzi` w trybie zombie sprawdza, czy zarząd przy szabrowaniu dociąga do siódmej doby bez głodu.
- Szaber zamieszkanego mieszkania: zapasy gospodarstwa (jedzenie, czasem leki, części i deski, według liczby osób; w trybie zombie mniej jedzenia). Do wzięcia tylko wtedy, gdy nikogo nie ma w domu (w zwykłym trybie część gospodarstw wychodzi za dnia) albo gdy spotkanie skończy się zabraniem zapasów lub wyjściem lokatorów. Okradzeni to wrogowie na zawsze, a nasi ludzie mają gorszy nastrój („Okradliśmy sąsiadów”).
- Łup leży w stertach w pomieszczeniu. „Zanieść do siedziby” na stercie w cudzym budynku (domyślne polecenie) każe nosić po 6 sztuk, kurs za kursem, aż w tym budynku nie zostanie nic, na podwórko przy bramie.
- Łup w cudzym budynku nie jest nasz, dopóki nie trafi za siatkę. Sterty we wnętrzu nieotoczonego sąsiada nie liczą się do zapasów na pasku i w zarządzie (karta nocy, napad), nie je się z nich, nie gotuje i nie bierze na budowy ani naprawy. Widać je na karcie budynku, a nosi się je tylko poleceniem „Zanieść do siedziby”. Reguła dotyczy tylko wnętrz sąsiadów, więc drewno ze ściętych drzew za siatką działa jak dziś.
- Piętra (etap 2): na klatce ze schodami „Przeszukać piętro”. Osoba znika na schodach na godzinę gry na piętro i wraca z łupem z pustych mieszkań tego piętra, tyle pięter, ile ma budynek (`levels`). Na górze może spotkać lokatorów z wyższych pięter, a w trybie zombie szwendacza (rana, ugryzienie jak na wyprawie). Rysujemy tylko parter, jak w GDD.

## Lokatorzy i spotkania

Kto. Gospodarstwa budynku z generatora mieszkańców (zmyśleni, przypięci do klatki, w tekstach bez numerów mieszkań i pięter), a bez tabel osoby z ziarna budynku jak w 0.3 (1–4 osoby). Stan trzyma tylko gospodarstwa parteru; gospodarstwa wyższych pięter powstają z tego samego źródła dopiero, gdy ktoś tam wejdzie (etap 2), bo falowiec ma ich setki. Gospodarstwo ma osoby, klatkę, mieszkanie na parterze albo „wyżej”, zapasy, a do tego:

- znani albo nie: w zwykłym trybie zarząd zna z imienia gospodarstwa trzech najbliższych budynków mieszkalnych do 120 m od drzwi siedziby (na Przymorzu najbliższe bloki stoją 61–88 m od drzwi, w Batowicach domy 26–53 m), a karta budynku je wymienia; resztę poznaje dopiero przy spotkaniu. W trybie zombie nikt nie jest znany, bo wszyscy się chowają;
- w domu albo nie: nocą zawsze w domu; za dnia w zwykłym trybie każde gospodarstwo z szansą 40% jest poza domem (woda, drewno, handel), w trybie zombie nikt nie wychodzi;
- zamiar: życzliwi, nieufni, wrodzy, zdesperowani. Z cech osoby, która mówi za gospodarstwo (lubiany i optymista życzliwi, kłótliwy nieufny, kłótliwy i odważny wrogi), z głodu (małe zapasy i dzieci: zdesperowani) i z trybu (w zombie strach na start, a co siódme gospodarstwo to rabusie, wrogowie);
- nastrój: spokój, strach, gniew, żal (ktoś bliski zmarł niedawno, z dziennika generatora), nadzieja. Zależy od zamiaru i od tego, jak przyszliście: pukanie za dnia uspokaja, wyważanie nocą straszy albo złości;
- relacja z zarządem od −100 do 100: znani zaczynają od 15 (znani wrodzy od −15, bo znamy ich od złej strony), rozmowa daje +10, jedzenie +25, wyważenie ich drzwi −20, kradzież −80.

Spotkanie zaczyna się, gdy lokatorzy są w domu i: ktoś puka do ich klatki albo mieszkania, wchodzi do ich mieszkania (po wyważeniu), albo hałasuje pod ich drzwiami i wrodzy wychodzą sami. Członkowie gospodarstwa stają się wtedy pionkami (rodzaj `sasiad`, wygląd z osoby) w drzwiach albo w mieszkaniu, nasza osoba czeka, a gra pauzuje i pokazuje kartę spotkania. Karta mówi, kto to jest (imię, wiek, z kim mieszka), jak się zachowuje (nastrój) i czego chce (zamiar), na przykład: „W drzwiach staje Halina Zając, 71 lat, za nią wnuk. Trzyma kij od szczotki i patrzy na was ze strachem. Pyta, czy przyszliście kraść.”

Wybory (dostępne według sytuacji, przy każdym krótko, co z tego może być):

| wybór | kiedy | skutek |
|---|---|---|
| Porozmawiać | zawsze | relacja +10; mówią coś przydatnego: kto jeszcze tu mieszka (poznajecie inne gospodarstwo), które mieszkanie stoi puste, w trybie zombie, gdzie coś łazi |
| Dać jedzenie (2 porcje) | są 2 porcje w zapasach | relacja +25, nastrój nadzieja, zdesperowani stają się życzliwi |
| Zaprosić do siedziby | relacja co najmniej 20 albo życzliwi lub zdesperowani | zgoda z szansą z relacji, zamiaru i nastroju (karta mówi „chętnie”, „może”, „raczej nie”). Przyjęci idą zza bramy jak przybysze z fali 1, z osobami z generatora, a ich mieszkanie zostaje puste z zapasami do zabrania |
| Zabrać zapasy | zawsze poza ucieczką | bez oporu: sterty ich zapasów w mieszkaniu, relacja −80, wrogowie; opór z szansą z zamiaru, mniejszą przy uzbrojonym zarządzie: szarpanina (widać ciosy), rana naszej osoby albo któregoś z nich, czasem śmierć; potem uciekają albo zostają przy swoim |
| Odejść | zawsze | koniec spotkania; po wyważeniu ich drzwi relacja −5 |

Wrodzy po wyważeniu nocą od razu się rzucają: karta ma wtedy „Bronić się”, „Uspokoić” (szansa z relacji i z tego, czy wasza osoba jest lubiana albo gadatliwa) i „Uciekać” (osoba wraca do siedziby, relacja −10). Wynik każdego wyboru losuje się z ziarna gry (`st.rng`) dopiero przy wyborze, więc gra bez spotkań losuje tak samo jak dziś. Walka z lokatorami w fali 2 rozstrzyga się liczbowo przy wyborze (jak napad w zarządzie), z krótką szarpaniną na mapie; lokatorzy nie dostają własnej sztucznej inteligencji walki (to partyzantka NPC z projektu 4).

Po spotkaniu lokatorzy zostają w swoim mieszkaniu, dopóki ktoś z zarządu jest w budynku, potem znikają z mapy i wracają do liczb gospodarstwa. Przyjęci przechodzą do mieszkańców siedziby i nie wracają.

Ugryziony w ukryciu (etap 2, tryb zombie). Co piąte gospodarstwo ocalałych ukrywa ugryzioną osobę. Karta daje wskazówkę („Jeden z nich ma obandażowaną rękę i trzyma się z tyłu”) i dodatkowy wybór „Zapytać o rękę”: przyznają się (relacja −5), a zaproszenie idzie wtedy bez ugryzionego. Zaproszeni bez pytania przychodzą razem z nim: ugryziony ma gorączkę od kilku godzin, więc umrze i wstanie jeszcze tej doby, chyba że ktoś go dobije albo amputacja zdąży.

Przejmowanie lokatorów z kierunku rozwoju (każdego lokatora da się prowadzić) to osobny projekt pracy ludzi. Fala 2 robi z lokatora pionek tylko na czas spotkania, tą samą drogą, którą pójdzie przejmowanie.

## Nocni goście (etap 2)

- O 2:00 każdy otwarty budynek, do którego obcy dojdą z ulicy (przechodniość obcych: otwarte albo wyważone drzwi od strony ulicy, poza naszą siatką), może dostać gościa: w zwykłym trybie z szansą 30% (40%, gdy leżą tam sterty łupu), w trybie zombie 45%. Budynek, do którego z ulicy nie da się wejść (zabite drzwi, drzwi tylko na podwórko, wspólny płot), jest bezpieczny.
- Zwykły tryb: szabrownicy zabierają do 10 sztuk ze stert w tym budynku i przeszukują do dwóch nieprzeszukanych pomieszczeń (łup przepada), a lokatorzy tego budynku są przestraszeni. W co trzecim takim budynku zostają na miejscu: przy następnym wejściu czeka spotkanie z dwoma albo trzema szabrownikami (wrodzy, gniew), rozstrzygane jak spotkanie z lokatorami, z dodatkowym wyborem „Przegonić”, który przy uzbrojonym zarządzie wygrywa częściej. Dopóki są, co noc biorą ze stert w tym budynku. Zombie: wchodzą 1–2 szwendacze i zostają w środku.
- Rano napis: „W nocy ktoś był w bloku przy Kołobrzeskiej 3. Zniknęły 4 deski.” To samo na karcie budynku.
- Zabite drzwi i wspólny płot chronią w pełni. To jest „dopóki nie otoczy ich wspólnym płotem” Mateusza.

## Wspólny płot (etap 3)

- Polecenie „Otoczyć wspólnym płotem” na otwartym budynku. Gra liczy nowy obwód z siatki siedziby: podwórko rośnie o wolne kafelki między podwórkiem a drzwiami tego budynku (pas jak w `buildFence`; chodnik można przeciąć, jezdni i kafelków tuż przy niej nie), płot staje na wolnych kafelkach tuż za nowym podwórkiem, brama zostaje, jeśli dalej stoi na obwodzie (inaczej staje nowa według zasad z `buildFence`), a odcinki starej siatki, które wypadły w środek, znikają. Czysta funkcja świata i listy otoczonych budynków.
- Obwód obejmuje kafelki przed wszystkimi drzwiami budynku, do których da się dojść bez jezdni. Drzwi, które zostają na obwodzie (od ulicy), plan zabija deskami w ramach budowy (po 2 deski), więc gotowy płot nie zostawia drogi z ulicy przez wnętrze. Gdy podwórko nie dojdzie do żadnych drzwi bez przejścia przez jezdnię albo nowego płotu byłoby ponad 120 m, polecenie mówi dlaczego się nie da („Między wami jest jezdnia”, „Za długi płot: 140 m, najwyżej 120 m”).
- Przed poleceniem okno pokazuje długość, koszt i czas: po 1 desce i 1 złomie na metr nowego płotu (albo 2 sztuki jednego z nich), 3 minuty pracy na metr. To jeden plan budowy jak w fali 1: zarząd donosi materiał i stawia, a stara siatka stoi do końca. Po ukończeniu siatka przechodzi na nowy kształt od następnego kroku (kolejka poleceń), nowe odcinki mają wytrzymałość świeżej łaty.
- Otoczony budynek nie dostaje nocnych gości, a w trybie zombie stado napiera na dłuższy obwód. To decyzja strategiczna: więcej miejsca i łupu za dłuższą siatkę do obrony.
- Zajmowanie mieszkań w otoczonym budynku i przyłączanie jego lokatorów to dalszy ciąg rosnącej osady (projekt 4), poza falą 2.

## Tryby

| | zwykły (bakteria) | zombie |
|---|---|---|
| lokatorzy | około połowy mieszkań zamieszkanych, znani sąsiedzi blisko siedziby | co czwarte gospodarstwo przeżyło, nikogo nie znamy z góry, wszyscy w strachu |
| w środku | puste mieszkania, ślady szabru, po nocnych gościach czasem szabrownicy na miejscu (etap 2) | szwendacze w mieszkaniach z wymarcia, zwłoki |
| hałas | słyszą lokatorzy budynku | ściąga szwendaczy z promienia, nocą stado |
| noc | szabrownicy w otwartym budynku | szwendacze w otwartym budynku |
| zamiary | życzliwi i nieufni częściej niż wrodzy | strach, rabusie co siódme gospodarstwo, ukrywanie ugryzionych (etap 2) |

## Gra sieciowa

- Drzwi klatek zajętych przez inne drużyny są zamknięte na stałe: menu pokazuje tylko „Klatka zajęta przez inną drużynę” (jak dziś `siec.menu`), a symulacja nie otwiera ich żadnym poleceniem. Lokatorów tych klatek gra nie tworzy, bo to cudzy dom.
- Symulacja dostaje te drzwi jako kafelki wejść, zgodnie z zasadą z projektu gry sieciowej (tylko wejście startu albo polecenie w kolejce): `SimOpts.zajete` na starcie i polecenie `{ t: 'zajete', ids: [], drzwi }` po odświeżeniu listy. Klucze klatek zamienia na kafelki klient (`kluczeSwiata`).
- Budynek z zajętą klatką można otworzyć przez inne, wolne klatki. Pomieszczenia zajętej klatki zostają zamknięte także wtedy, gdy przez wnętrze dałoby się do nich dojść.

## Kontrakt

Stan po budowie (18.10.2026). Tam, gdzie budowa odeszła od pierwszej wersji projektu, opis niżej jest aktualny.

Świat (`src/world`):

- `buildInterior(w, bid)` bez zmian.
- `settleAptsOf(w, it, given?)`: stany i zawartość mieszkań dowolnego budynku (bez reguły podwórka, bez mieszkania zarządu), na tych samych przepisach i ziarnach mieszkań co `settleApts`. `settleApts` siedziby daje ten sam wynik co przedtem (test ze skrótami trzech dem).

Symulacja (`src/sim`):

- `src/sim/sasiedzi.ts`, czyste funkcje: typy stanu, wnętrza z pamięcią na świat (`wnetrze`), rodzaje drzwi (`drzwiBudynku`), stan drzwi na start, mieszkania za drzwiami, znani sąsiedzi, łup usług i mieszkań, zapasy gospodarstw, lokatorzy zapasowi, zamiar i nastrój, wybory spotkania i ich skutki, a z etapu 2 piętra (`pietraBudynku`, `pietro`, `domWyzej`), nocni goście (`nocnyGosc`, `zostaja`, `szabrownicy`) i ukryty ugryziony (`ukrytyUgryziony`, `ugryzionyOd`), z gry sieciowej `zaDrzwiami`, `kafelkiZajete`, `pokojeZajete`. Losują tylko z ziarna świata, budynku, kafelka, mieszkania, piętra albo dnia; skutki wyborów w spotkaniu i rany na piętrze z ziarna gry (`st.rng`), dopiero przy wyborze.
- Stan: `SimState.sasiedzi?: Sasiedzi` powstaje przy pierwszych cudzych drzwiach, `SimState.zajete?: number[]` tylko w grze sieciowej. Bez nich stan, skróty botów i stare zapisy są jak przed falą 2.

```ts
type StanDrzwi = 'zamkniete' | 'na_klucz' | 'otwarte' | 'wywazone' | 'zabite';
interface Sasiedzi {
  budynki: SasiedniBudynek[];          // po kolei, jak zarząd ich dotknął
  spotkanie: Spotkanie | null;
  nr: number;                          // licznik spotkań
  napis: Napis | null;                 // ostatni napis dla interfejsu (wynik spotkania, zamek, nocni goście...)
  n: number;                           // licznik napisów: interfejs pokazuje każdy raz
}
interface SasiedniBudynek {
  bid: number;
  drzwi: { t: number; s: StanDrzwi; k?: true }[]; // wszystkie drzwi na zewnątrz i mieszkań, liczone przy pierwszym
                                                  // dotknięciu; k: ukryty zamek, wychodzi przy próbie otwarcia
  otwarty: boolean;
  ludzie: boolean;
  mieszkania: { apt; stan: 'mieszkancy' | 'puste'; why?; year?; dom; zombie?; przeszukane: number[] }[];
  przeszukane: number[];               // sale, hale, zaplecza, klatki
  domy: Gospodarstwo[];
  pietra: number;                      // przeszukane piętra
  slady: { t: number; k: DamageKind }[];
  zawartosc?: { zepsute: number[]; smieci: [x, y, n][] };  // do położenia przy otwarciu
  noc?: { tick; kto: 'szabrownicy' | 'szwendacze'; zabrali; pokazane? };
}
interface Gospodarstwo {
  osoby: OsobaSasiada[]; apt: number; klatka: number; znani: boolean;
  zamiar: 'zyczliwi' | 'nieufni' | 'wrodzy' | 'zdesperowani';
  nastroj: 'spokoj' | 'strach' | 'gniew' | 'zal' | 'nadzieja';
  rel: number; zapasy; gdzie: 'u_siebie' | 'odeszli' | 'u_nas' | 'nie_zyja';
  zal?; ludzie?: number[]; pionki?: number[];
  szabrownicy?: true; ugryziony?: number; pytali?: true;  // etap 2
}
interface Spotkanie { nr; b; dom; my: number[]; oni: number[]; gdzie: 'drzwi' | 'mieszkanie' | 'pietro'; tick; atak: boolean; wywazone: boolean; runda?: number }
```

- Polecenia: `{ t: 'open' | 'knock' | 'force' | 'board' | 'unboard'; ids; door }`, `{ t: 'loot'; ids; bid; room }`, `{ t: 'meet'; ids: []; nr; choice }`, `{ t: 'upstairs'; ids; bid; tile }` (kafelek schodów), w grze sieciowej `{ t: 'zajete'; ids: []; drzwi }`. Łup u sąsiadów niesie wspólne noszenie z surowców: `{ t: 'carry'; ids; thing }` („Zanieść na podwórko”), a po przeszukaniu pokoju `carryOn`; reguła sąsiada siedzi w `lootNear` (z wnętrza sąsiedniego budynku zbiera cały łup z tego budynku).
- Prace: `door` (what: rodzaj), `loot` (target: numer pomieszczenia całej mapy `gid`), `meet` (czeka na wybór), `upstairs` (w fazie 1 osoba jest na górze i nie widać jej na mapie).
- Pionek `sasiad`: osoba w `st.people` od pierwszego spotkania, nie bierze poleceń; da się go kliknąć jak mieszkańca (karta osoby).
- Lokatorzy z generatora: `Sim.lokatorzy?: (bid) => LokatorzyBudynku | null`, źródło `zrodloLokatorow` z `src/sim/lokatorzy.ts`, ustawiane poza stanem. Wynik trafia do stanu przy pierwszym dotknięciu budynku. `Sim.budynekDoKarty(bid)` daje wpis z gry albo podgląd tego samego wpisu bez zapisu w stanie (karta budynku).
- Zegar: o 2:00 nocni goście, o 7:00 napis o nich; wszystko tylko przy `st.sasiedzi`.

Rysowanie (`src/render`):

- Jedna scena przekroju dla siedziby i otwartych budynków: `src/render/przekrojSasiadow.ts` liczy ze stanu nowe wnętrza (`SectionPart`) i wygląd drzwi (`DoorLook`), a widok wysyła je łatką sceny (`MapChange.wnetrze`, `MapChange.drzwi`) do głównego wątku i workerów; przy pierwszym dołożeniu przekrój dostaje własne kopie tablic, bo dzieli je z wnętrzem świata, które czyta symulacja. Drzwi zabite deskami mają własny wygląd, wyważone ten z fali 1.
- Pozy: wyważanie zamachem, deski i pukanie młotkiem, zamek i przeszukanie na kolanach.

Interfejs (`src/ui`, `src/main.ts`):

- Napisy fali 2 w obu językach w `src/content/napisy-sasiedzi.ts` (do gry idzie na razie polski, jak w surowcach).
- Karta spotkania `src/ui/spotkanie.ts` (pauza jak okna zarządu, odcienie `sasiedzi` i `napad`, wybór poleceniem `meet`, wynik napisem w podpowiedzi), karta budynku `src/ui/budynek.ts` (klik w cudzy budynek bez zaznaczenia).
- Cel drugiego dnia w domu rozwiązała osobna sesja („Przeszukajcie dom” z przeszukiwaniem domu komitetu, `pelna-gra`); od fali 2 cel przeszukania zalicza też pierwsze pomieszczenie przeszukane u sąsiadów.

Gra sieciowa (`src/net`): `drzwiObcych(w, srodek, klatki)` w `src/net/siec.ts`, a `GraSieciowa.klatka` wysyła polecenie `zajete` po każdej zmianie listy cudzych klatek.

Boty: `tests/unit/sasiedzi-play.ts` (gracz u sąsiadów), flaga `--sasiedzi` w `npm run bot` i `npm run bot:zombie`.

## Etapy

1. Wejście, przeszukanie i spotkanie (to, czego Mateuszowi zabrakło): stany drzwi, otwieranie, pukanie, wyważanie z hałasem, zabijanie deskami, wnętrze w symulacji i w przekroju, stany i zawartość mieszkań, przeszukanie i rozbiórka, łup usług, noszenie do siedziby, lokatorzy z generatora, spotkanie z kartą i pięcioma wyborami, szwendacze w mieszkaniach w trybie zombie, karta budynku.
2. Lokatorzy szerzej i noc: znani i nieznani na karcie budynku, za dnia poza domem, szaber pustego zamieszkanego mieszkania, wrodzy po wyważeniu, piętra, nocni goście, ukrywani ugryzieni w trybie zombie.
3. Wspólny płot.
4. Gra sieciowa (zajęte klatki), bot z sąsiadami, pełne zrzuty, tłumaczenia po scaleniu `pelna-gra`.

Każdy etap kończy się testami, botami, zrzutami i lokalnym commitem na `m2-fala-2`.

## Bramka fali 2

- Testy w Node: drzwi i przechodniość (zarząd wchodzi po otwarciu, szwendacze tylko przez wyważone i otwarte, zabite zamykają), łup deterministyczny i bez zderzeń z siedzibą, spotkanie od karty do skutku (przyjęci z osobami, kradzież, opór), nocni goście, wspólny płot (kształt obejmuje drzwi budynku, brama zostaje, wytrzymałość starych odcinków zostaje), zamknięte drzwi z gry sieciowej, zapis i wczytanie w trakcie spotkania i z otwartymi budynkami dają ten sam skrót, stary zapis bez `sasiedzi` wczytuje się bez zmian.
- Boty: `npm run bot` i `npm run bot:zombie` bez sąsiadów z tymi samymi skrótami co `pelna-gra`; z flagą `--sasiedzi` gracz-bot od dnia 2 otwiera najbliższy budynek, przeszukuje, nosi łup i rozmawia z lokatorami. Liczy łup z sąsiadów na dzień, spotkania, rany i ugryzienia przy wyważaniu.
- Zrzuty w Chromium, obejrzane: dom (Zielonki) i blok (Przymorze), oba tryby, komputer i telefon 390×844: menu drzwi, wyważanie z kręgiem hałasu, przekrój otwartego budynku, karta spotkania, karta budynku, szwendacz w mieszkaniu, w etapie 3 plan i gotowy wspólny płot.
- Wydajność (`npm run perf`) bez spadku przy kilku otwartych budynkach.

## Decyzje do przejrzenia przez Mateusza

1. Wejść można do każdego budynku z drzwiami na mapie, także usługowego, bez limitu odległości.
2. Pięć stanów drzwi. „Otworzyć” jest domyślne i ciche, wyważanie tylko z menu, długie i głośne, z łomem dwa razy krótsze i ciszej.
3. Wnętrze pojawia się po pierwszych otwartych drzwiach, każda klatka bloku osobno. Rysujemy i przeszukujemy parter, piętra przeszukuje się bez rysowania (etap 2).
4. W cudzych budynkach nie ma napraw ani zajmowania mieszkań; to przyjdzie z rosnącą osadą.
5. Lokatorzy z generatora mieszkańców, znani tylko z trzech najbliższych budynków mieszkalnych do 120 m od siedziby. Za dnia 40% gospodarstw poza domem, nocą wszyscy w domu, w trybie zombie nikt nie wychodzi.
6. Cztery zamiary i pięć nastrojów, relacja od −100 do 100. Spotkanie pauzuje grę kartą z pięcioma wyborami, wynik z ziarna gry dopiero przy wyborze.
7. Walka z lokatorami liczbowo przy wyborze, z krótką szarpaniną na mapie, bez nowej sztucznej inteligencji walki.
8. Zaproszeni idą zza bramy jak przybysze fali 1, także ponad liczbę łóżek (śpią na podłodze).
9. Kradzież u lokatorów robi z nich wrogów na zawsze i psuje nastrój naszym ludziom.
10. Nocni goście tylko w otwartym budynku poza siatką i bez zabitych drzwi.
11. Wspólny płot to jeden plan budowy z kosztem za metr; po ukończeniu siatka zmienia kształt, a stara znika w środku.
12. W trybie zombie przeżyło co czwarte gospodarstwo, w co drugim mieszkaniu z wymarcia czeka szwendacz, a hałas wyważania ściąga stado.
13. Zajęte klatki innych drużyn są zamknięte na stałe i bez lokatorów.
14. Inne klatki siedziby to nasz budynek: zostają jak w fali 1, ich lokatorami zajmie się projekt pracy ludzi.
15. Budynek z drzwiami na nasze podwórko ma drzwi od ulicy zawsze na klucz; otwarcie ich to świadoma dziura w obwodzie, z ostrzeżeniem.
16. Łup w nieotoczonym cudzym budynku nie jest nasz, dopóki nie trafi za siatkę (bez zapasów, jedzenia i budów).
17. Wspólny płot obejmuje wszystkie drzwi budynku albo je zabija, nie przechodzi przez jezdnię i ma najwyżej 120 m nowego płotu.
18. W trybie zombie co piąte gospodarstwo ocalałych ukrywa ugryzionego; w zwykłym po nocnych gościach w co trzecim budynku zostają szabrownicy do przegonienia.
19. W trybie zombie mieszkania z wymarcia dają dwa razy więcej jedzenia niż w tabeli fali 1, bo szaber ma być tam głównym źródłem jedzenia.
20. W domu jednorodzinnym cel dnia 2 to „Przeszukajcie pokój u sąsiadów”.
