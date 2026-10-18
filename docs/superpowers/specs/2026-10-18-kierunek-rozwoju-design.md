# Kierunek rozwoju: od osiedla do społeczeństwa

Wizja z rozmowy z Mateuszem 18.10.2026 („przemyślmy jak eksperci branży gier”). To rama dla kilku kolejnych projektów, a nie jeden projekt do zbudowania: każdy punkt z sekcji „Kolejność” dostanie własny dokument w `docs/superpowers/specs/`, własną rozmowę o szczegółach i własny plan. Słowa Mateusza są w cudzysłowie. Reszta to moje propozycje, oznaczone „(moje)”.

Po akceptacji ustalenia przejdą do `docs/GDD.md`, a etapy M2–M5 w `PROMPT-DLA-CLAUDE-CODE.md` dostaną odnośnik do kolejności stąd (moje).

## Po co

Dziś gra ma pierwsze noce za siatką, budowę, tryb zombie, mieszkańców z adresu, własną drużynę i zaczątek gry sieciowej. Brakuje tego, co trzyma przy grze przez dziesiątki dni: pracy ludzi z priorytetami, badań i gospodarki z 0.3, prawdziwej zimy i celów na późną grę (etap M2 w `PROMPT-DLA-CLAUDE-CODE.md`, „Następne” w `docs/POSTEP.md`).

Mateusz chce „po tych 50 dniach obserwować rosnące społeczeństwo i to, jak się rozwijamy i rozbudowujemy, trochę bardziej z perspektywy strategicznej już większej osady, trochę jak RimWorld, trochę jak Manor Lords”. Najpierw ma wciągać gra jednoosobowa: „Tematy multiplayer też już mogą być na moment, kiedy sama gra nawet w singlu będzie zajmująca.”

## Serce gry

Gra rośnie razem z osadą. Na początku to RimWorld: kilka osób z imionami, każdą prowadzisz sam, liczą się ciepło, jedzenie i pierwsze noce. Po kilkudziesięciu dniach patrzysz jak w Manor Lords: przybywają rodziny, przyłączacie klatki i bloki, rozbudowujecie produkcję, a ty myślisz o potrzebach osady, a nie o tym, kto niesie deskę.

Duża osada według Mateusza: „Dalej możemy nimi kierować, ale głównie steruje nimi generatywny silnik w tle, który kontroluje, żeby społeczeństwo się optymalizowało, ale też jest miejsce na random. Wtedy już zaczynamy zarządzać społeczeństwem.” I dynamika: „solo drużyna jest też w stanie zasiać zamęt, taka partyzantka w społeczeństwie. Gracz kontrolujący setki osób też może poświęcić się na ręczne przesuwanie postaci w celu powstrzymania dywersji czy buntu, ale wtedy umyka mu całość obrazka.”

Z tego wynikają trzy skale sterowania jednym mechanizmem (moje): przy kilku osobach ręczne polecenia, przy setkach zasady (rozporządzenia) wykonywane przez silnik, a pod nieobecność gracza w grze sieciowej same zasady. Zamknięta gra jednoosobowa stoi jak dziś. To, kogo przy setkach ludzi da się przejąć ręcznie, czeka na decyzję Mateusza (sekcja „Praca ludzi i rozporządzenia”).

## Dwa scenariusze, jeden silnik

Mateusz: „Mam teraz grę w dwóch lore: jeden to bakteria zjadająca miedź, a drugi to zombie.” W scenariuszu z bakterią „rozwój to próba odtworzenia cywilizacji pomimo tego, że elektronika i elektryka mają problemy”. W scenariuszu z zombie to „bardziej survival i obrona przed zombie i innymi graczami, zarówno NPC, ale też przeciwnikami ludzkimi, którzy mogą robić najazdy”.

Moje:

- Jeden silnik, jedna mapa i jedna gospodarka, scenariusz wybierany na ekranie startowym jak dziś tryb gry. Każda nowa mechanika działa w obu scenariuszach, nie robimy dwóch gier. Pień technologii jest wspólny (jedzenie, ciepło, budowa, medycyna), do tego gałęzie tylko dla jednego scenariusza.
- Każdy scenariusz nakłada na technikę inny podatek. Z bakterią technika gnije: miedź znika, kable trzeba chronić i naprawiać, a przetrwało to, co szczelne (zasada świata z GDD). Z zombie technika hałasuje i świeci: generator, radio i strzał ściągają stado, bo szwendacze już dziś idą za hałasem. To samo drzewko daje wtedy w każdym scenariuszu inne decyzje.
- Szczyty drzewka z bakterią wynikają z lore: własny model AI z tego, co bakteria oszczędziła w serwerowni banku (ironia ścieżki Technokracji z GDD), bakteriofag (GDD, „Prąd i bakteria”) i stacja naziemna do satelitów, które przetrwały, bo na orbicie nie ma wilgoci ani bakterii. Stacja otwiera mapę kraju (niżej).
- W trybie zombie będą też ludzie-wrogowie z najazdami, jak chce Mateusz. To zmienia decyzję z nocy 17/18.10.2026 („w trybie zombie nie ma szabrowników”) i zdejmuje z „Zaparkowanych” punkt o ludziach-wrogach w trybie zombie. Przyczyna zombie zostaje nieznana.

Futurystyka. Mateusz: „Mam nadzieję, że w ramach rozwoju technologii będziemy mieli jakieś futurystyczne rzeczy?” Z bakterią wynika to ze świata (moje): technika bez miedzi, czyli światłowód zamiast kabla, aluminium, ogniwa zalane szkłem, elektronika w żywicy, a na szczycie ujarzmienie samej bakterii (bioogniwo, kontrolowany odzysk miedzi) i własna AI. Futurystyka w trybie zombie zostaje do projektu gospodarki.

## Praca ludzi i rozporządzenia

Mateusz o tym, co dzieje się z osiedlem, kiedy gracz zamyka grę na noc: „Pracują zautomatyzowani i bronią terenu zgodnie z rozporządzeniem władz, część śpi.” O tym, czym jest rozporządzenie: „Na początku zestaw reguł i zasad, które mogę odpalić, widzę rozwój w stronę dekalogu pisanego językiem naturalnym, ale to chyba na przyszłość.”

Podstawa jest już w GDD: zakładka Praca (ludzie razy rodzaje pracy, priorytety 1–4 jak w RimWorldzie), ludzie bez poleceń biorą zadania sami, a lokatorzy dają siłę roboczą przez dyżury klatek (sekcja „Dwie warstwy ludzi”).

Kto pracuje i kto słucha (moje, na podstawie GDD):

- Lokatorzy to liczby w klatkach, jak w GDD i w 0.3. Każda klatka ma swoich ludzi: gospodarstwa z generatora mieszkańców dla wszystkich mieszkań klatki, a nie tylko parteru, jak dziś w `src/sim/lokatorzy.ts`. Na mapie widać ich przez ograniczoną liczbę pionków tła. Dyżur to liczba: klatka B wystawia czterech ludzi do kuchni. To ten sam model co obsada stanowisk w 0.3 (`Sim.available` i `Sim.ratio` w `public/v03/js/sim.js`: obsada razy udział wolnych rąk), więc projekt gospodarki przeniesie liczby z 0.3 na ten model.
- Na start osada to zarząd i lokatorzy klatki siedziby, czyli w bloku kilkadziesiąt osób, a w domu jedna rodzina. Kolejne klatki i budynki dochodzą przez przyłączanie i zajmowanie klatek. Klatka jest też jednostką gry sieciowej, a cały budynek siedziby jako start dałby na falowcu tysiące ludzi.
- Odstępstwa lokatorów liczą się grupowo („klatka C nie wystawiła dwóch ludzi na wartę”), ale komunikat może nazwać konkretną osobę z generatora.
- Zarząd i fachowcy zawsze wykonują polecenia gracza. Rozporządzenia łamią lokatorzy, a ludzie z zarządu zawodzą tylko przez własne potrzeby i nastrój, jak dziś. Dzięki temu zostaje filar z GDD „mówię im, co robić”.
- W grze jednoosobowej rozporządzenie przejmuje rutynę tylko wtedy, gdy gracz to włączy (na przykład „karta nocy według rozporządzenia”). Domyślnie karta nocy zostaje główną decyzją wieczoru, więc bramki M1 i M2 („decyzja co minutę przy ekranie”) dalej obowiązują.

Do decyzji Mateusza: czy przy setkach ludzi gracz może ręcznie przejąć dowolnego lokatora, czy polecenia zostają tylko dla zarządu i fachowców. Dziś mówił: „Dalej możemy nimi kierować” i o „ręcznym przesuwaniu postaci” przy setkach osób. W „Decyzjach” w `docs/POSTEP.md` stoi: „Polecenia przyjmuje tylko zarząd, tłum to tło”, a z rozmowy z 17.10.2026 o tym, jak nie być kopią RimWorlda: „sterowanie tylko zarządem (reszta osiedla słucha uchwał albo nie)”. Przejęcie mogłoby wyglądać tak: lokator na chwilę staje się pionkiem z generatora, słucha poleceń, a po puszczeniu wraca pod rozporządzenia. Od odpowiedzi zależą symulacja lokatorów, zaznaczanie i menu poleceń w projekcie 1.

Moje:

- Rozporządzenie to zestaw reguł, które zarząd włącza i wyłącza. Działają od następnego kroku przez kolejkę poleceń w stanie, tak jak dziś warta i łatanie. Przykłady rodzajów reguł, do wyboru w projekcie: zmiany (kto śpi, kto trzyma wartę, o której zmiana), postawa warty (gdzie, z czym, kiedy podnieść alarm), priorytety pracy dla grup, racje, cisza i zaciemnienie nocą, godzina policyjna, higiena przy bramie (myjka z GDD), co robić przy zagrożeniu.
- Uchwała i rozporządzenie to dwie różne rzeczy. Uchwała to prawo z trwałymi skutkami, które prowadzi ścieżką (Porządek, Wspólnota, Technokracja) i przychodzi wieczorem. Rozporządzenie to bieżąca zasada, którą zmienia się w każdej chwili. Ścieżki odblokowują rodzaje reguł, na przykład godzinę policyjną na ścieżce Porządku.
- Zalążek już jest: na karcie nocy zarząd sam proponuje, kto śpi, kto trzyma wartę i kto idzie na wyprawę, a gracz tylko zatwierdza (`src/gov/noc.ts`). Rozporządzenie to zasada, według której zarząd układa propozycję, plus zgoda na zatwierdzanie jej bez gracza.
- Ludzie nie zawsze słuchają. Szansa złamania reguły rośnie przy niskim zaufaniu i wysokim wkurzeniu, które zarząd już liczy, a każde odstępstwo ma widoczną przyczynę („zszedł z warty, bo trzeci dzień bez ciepłego posiłku”). Bunt jest rachunkiem za rozporządzenia, a nie rzutem kostką. To ta sama myśl co w „Zaparkowanych” w `docs/POSTEP.md`: „reszta osiedla słucha uchwał albo nie”.
- Dekalog w języku naturalnym (później): tekst gracza zamienia się raz, przy pisaniu, w te same reguły i trafia do stanu jako reguły. Symulacja nigdy nie pyta modelu językowego, więc determinizm, zapis i boty w Node zostają. W lore bakterii przykazania tłumaczy lokalny model z dysków banku, czasem po swojemu, co jest gotową satyrą.

## Klimat i surowce z miejsca

Mateusz: „Sama pogoda i ciężkość zimy powinny być uzależnione od lokalizacji i pogody, jaka tam występuje. W ciepłych krajach będzie łatwiej, ale na północy mamy surowce itp.”

Moje:

- Rozumiem to jako klimat miejsca (typowa pogoda z wieloletnich średnich), a nie pogodę na żywo z internetu. Doba gry trwa kilkanaście minut, więc dzisiejsza pogoda nie pasowałaby do zegara gry, a dane z sieci w środku gry zepsułyby grę offline i determinizm.
- Średnie miesięczne dla współrzędnych adresu biorą się z małego pliku danych dołączonego do gry, bez serwera, więc działają na Pages, w demach i w testach w Node. Źródło i licencję danych wybieramy w projekcie klimatu. Pogoda dnia jest losowana z ziarna wokół tych średnich.
- Pory roku wynikają z miejsca. Gra zaczyna się w październiku 2051 (GDD), a na półkuli południowej październik to wiosna. Propozycja: start zawsze jesienią w danym miejscu, żeby pierwsza zima była sprawdzianem.
- Tam, gdzie zimy nie ma, wyzwaniem są upał, susza i choroby (GDD, „Pętla gry”). Łatwiej, ale nie bez zagrożeń.
- Surowce z mapy OSM wokół adresu: las daje drewno, działki i pola jedzenie, tereny przemysłowe złom i części, woda wodę i ryby. Co dokładnie znaczą „surowce na północy”, zostaje do projektu klimatu (moje zgadywanie: więcej lasu i opału oraz chłód, który przechowuje jedzenie).

## Rosnąca osada i silnik w tle

Moje:

- Dwie warstwy ludzi z GDD łączą RimWorlda z Manor Lords. Zarząd i fachowcy to pionki pod pełnym sterowaniem, lokatorzy to rodziny przypisane do klatek i miejsc pracy. Z każdym przyłączonym blokiem więcej ludzi trafia do warstwy, którą prowadzi silnik według rozporządzeń.
- Silnik w tle to deterministyczny zarządca (przydział pracy według priorytetów i rozporządzeń, pilnowanie potrzeb) z losowością z ziarna i z ludzi (posłuszeństwo zależne od zaufania), a wydarzenia zarządu robią za narratora. Słowo „generatywny” rozumiem jako „sam układa życie osady”, a nie jako model językowy w pętli gry; model językowy może wejść najwyżej przy pisaniu dekalogu.
- W lore bakterii silnik ma twarz: lokalny model językowy z dysków banku (GDD) zarządza spółdzielnią, przypadek to jego halucynacje, a partyzant może mu odciąć prąd. Do rozważenia twarz zależna od ścieżki: na Technokracji algorytm, na Porządku urzędnicy i straż, na Wspólnocie rady klatek. Mechanika zostaje ta sama, zmieniają się wygląd i słabości.
- Partyzantka: mała drużyna pod pełnym sterowaniem sieje zamęt w dużej osadzie: dywersja, kradzież, podpalenie, podburzanie lokatorów. Najpierw jako NPC w grze jednoosobowej (drużyny bez domu, szabrownicy, skłócona frakcja lokatorów przy niskim zaufaniu), dużo później jako inni gracze. Zasada (moje): każda mechanika sieciowa ma najpierw wersję z NPC, żeby gra jednoosobowa była pełna, a boty mogły ją sprawdzić.
- Skala mapy: dziś kwadrat 384 m. Rosnącej osadzie wystarczy na początek przyłączanie bloków w tym kwadracie (M4). Większa albo druga mapa zależy od wydajności na telefonie i zostaje do projektu.
- Uwaga jako zasób działa tylko wtedy, gdy czas płynie. Z pauzą ręczne gaszenie dywersji nic nie kosztuje, bo gracz zatrzymuje grę i klika. Do rozstrzygnięcia w projekcie: czy w grze jednoosobowej alarm ma ograniczać pauzę, czy ten koszt zostaje tylko w grze sieciowej na żywo. Dziś pauza działa zawsze (anty-cele niżej).

## Mapa miasta i gra sieciowa (później)

Mateusz: „Gracze grają na swoim osiedlu/mapie, mogą oglądać mapę miast, jak mają lepszą technologię komunikacji, np. z satelitami, to kraj.” I: „Kusi mnie, żeby to była gra na jednej planszy, gdzie robimy trochę MMO pixelartowe, ale to chyba już wymaga innego podejścia.” Gra sieciowa czeka, aż wciągnie gra jednoosobowa.

Moje:

- Zasięg mapy rośnie z łącznością: osiedle, dzielnica i miasto, a po stacji satelitarnej kraj. Kamera staje się nagrodą. Mapa miasta jest najpierw funkcją gry jednoosobowej: osady NPC, hordy, karawany i cele wypraw (dziś wyprawy idą poza mapę do prawdziwych miejsc z OSM).
- Jedna plansza dla wszystkich w czasie rzeczywistym zmieniłaby gatunek, bo wspólny czas zabiera pauzę i przyspieszanie, na których stoi gra w stylu RimWorlda i Frostpunka (bliżej byłoby do Traviana). Dlatego propozycja na projekt sieciowy to jedna plansza i dwa zegary. Mapa miasta i kraju jest wspólna, na serwerze, w prawdziwym czasie. Osiedle liczy się u gracza, z pauzą, ale bez wyprzedzania zegara świata, a pod nieobecność gracza żyje według rozporządzeń. Cena: we wspólnym świecie nie przewinie się pięciu dni w jeden wieczór, a tempo świata trzeba ustalić. Gra jednoosobowa zostaje z własnym tempem.
- Etapy sieci: najpierw wypady na osiedle prowadzone przez silnik (atakujący gra na żywo, obrońca broni się rozporządzeniami i układem osiedla jak baza w Clash of Clans, a rano ogląda powtórkę), dopiero potem obrońca na żywo (obaj w grze, wspólny zegar, polecenia przez serwer).
- Warunki techniczne, które warto mieć z tyłu głowy już w projektach 1–4: zarząd liczony w czasie gry, a nie w sekundach przy ekranie (`src/main.ts`), dziennik poleceń z numerem kroku do powtórek, ten sam wynik symulacji w każdym silniku JS (`Math.hypot`, `sin` i `cos` w decyzjach, wpis w „Decyzjach” w `docs/POSTEP.md`), wspólny układ współrzędnych z kluczy klatek (`src/world/klucze.ts`). Symulacja już dziś chodzi w Node, więc serwer będzie mógł sam przeliczyć wypad zamiast wierzyć przeglądarce.
- Prywatność: wypad pokazuje obcemu graczowi wnętrze cudzego osiedla, czyli prawdziwy blok i klatkę, zwykle czyjś dom. Przed jakimkolwiek PvP trzeba to rozstrzygnąć razem z RODO i bezpieczeństwem graczy.
- To, co już jest (konta, zajęte klatki, zapis w chmurze za `?siec=1`), zostaje bez zmian. Konto z e-mailem i magic linkiem oraz informacja o danych z firmą Mateusza jako administratorem czekają razem z resztą gry sieciowej (moje odczytanie słów Mateusza o multiplayerze).

## Oprawa: grafika z PixelLab i interfejs

Mateusz: „Grafika z PixelLab to by nam się przydało, musimy też bardzo dobrze podejść do kwestii wizualnej tego, jak wygląda UX/UI.”

Moje:

- Grafika idzie równolegle od teraz: kotwica stylu (cztery assety, M3 w `PROMPT-DLA-CLAUDE-CODE.md`, kierunek graficzny w GDD), akceptacja Mateusza, potem paczki pod kolejne projekty. Każdy projekt wypisuje, jakich grafik potrzebuje. Koszty według `docs/PIXELLAB.md` i CLAUDE.md (zgoda przed każdą paczką powyżej 5 USD), a każdy obiekt zachowuje wersję rysowaną kodem.
- Dużą osadą zarządza się patrzeniem, więc najważniejsze ekrany to przeglądy: stan osady na jedno spojrzenie, nakładki jak w RimWorldzie (ciepło, zaufanie w klatkach, pokrycie warty godzina po godzinie, czyli dziury w rozporządzeniu, ogniska bakterii), alarmy, które prowadzą do miejsca na mapie. Każda nowa mechanika dostaje ekran zaprojektowany od razu na telefon 390×844.
- Interfejs zostaje w HTML i CSS (GDD). Angielski domyślnie, polski do wyboru (Mateusz, 18.10 rano, osobna sesja), więc nowe teksty idą przez warstwę tłumaczeń, kiedy ta powstanie.

## Kolejność (moje)

1. Praca ludzi i rozporządzenia: zakładka Praca, dyżury klatek (lokatorzy całej klatki siedziby jako liczby), zmiany, reguły do włączania, posłuszeństwo zależne od zaufania. Pierwsze, bo to fundament skali i silnika, a przy każdym przybyszu oszczędza klikania. Reszta M2.
2. Gospodarka i technologia: badania z fachowców i książek, gospodarka z 0.3, ścieżki uchwał, wspólny pień i gałęzie scenariuszy, futurystyka. Daje cele na późną grę. Też reszta M2.
3. Klimat i surowce z miejsca: zima z prawdziwego miejsca, pory roku z półkuli, surowce z OSM. Mały projekt, który domyka bramkę M2 („pierwsza zima jest trudna”).
4. Rosnąca osada i silnik w tle: najpierw fala 2 M2, o którą Mateusz prosił 17.10.2026 (włamania do sąsiednich budynków, ich lokatorzy z różnymi zamiarami, wspólny płot; `docs/POSTEP.md`, „Granie na żywo”). Projektu `docs/M2-fala-2.md` jeszcze nie ma, a gałąź `claude/wlamania-plot-e7f6d3` nie ma żadnego commita. Potem przyłączanie klatek i bloków, silnik, partyzantka NPC, wyprawy widoczne na mapie, najazdy z Alarmem (M4). Falę 2 można wyciągnąć przed projekt 2 albo 3, bo stoi głównie na tym, co już jest: wnętrzach wszystkich budynków i budowie obwodu z fali 1.
5. Mapa miasta w grze jednoosobowej: osady NPC, hordy, karawany, zasięg z łączności.
6. Gra sieciowa na wspólnej mapie, dopiero gdy gra jednoosobowa wciąga (Mateusz).

Równolegle: kotwica stylu i grafika z PixelLab (M3), interfejs w każdym projekcie, angielski w osobnej sesji, a na końcu szlif i udostępnianie (M5).

Mateusz wymienił najpierw gospodarkę i technologię, potem pracę ludzi. Pracę stawiam pierwszą, bo gospodarka z 0.3 liczy produkcję z obsady stanowisk z puli wolnych ludzi. Bez modelu pracy projekt gospodarki musiałby go ustalić sam, a projekt pracy potem go przerabiać. Do tego bez priorytetów i dyżurów gospodarka z setką ludzi to setki kliknięć. Zamiana jest możliwa, ale nie za darmo.

## Cele

- Gra jednoosobowa wciąga przez ponad 50 dni w obu scenariuszach, a po 50. dniu dalej ma cele i decyzje, tylko na poziomie osady.
- Osada rośnie od kilku osób do setek bez klikania każdego człowieka.
- Miejsce na świecie zmienia trudność i gospodarkę.
- Technika prowadzi do rzeczy futurystycznych, które wynikają z lore.
- Każdy ekran działa na telefonie.

## Nie-cele (na teraz)

- Gra sieciowa w czasie rzeczywistym i wspólna plansza 1 m dla wszystkich graczy.
- Dekalog w języku naturalnym.
- Czat, sojusze, ranking (jak w projekcie gry sieciowej).
- Grafika trójwymiarowa (GDD).

## Anty-cele (porażka, nawet jeśli działa)

- Gra jednoosobowa traci pauzę albo własne tempo.
- Silnik gra za gracza: osada rośnie sama, a gracz nie ma decyzji. Silnik bierze na siebie mozół, nie decyzje.
- Bunt albo dywersja bez widocznej przyczyny.
- Dwie osobne gry zamiast dwóch scenariuszy.
- Gra sieciowa karze za sen: gracz wraca rano i nie ma czego ratować.
- Gra zdradza innym graczom, kto gdzie mieszka.
- Model językowy albo sieć w pętli symulacji, czyli koniec determinizmu, zapisów i botów.

## Ograniczenia

- Twarde zasady z CLAUDE.md: symulacja deterministyczna w Node, bez `Math.random`; mieszkańcy zmyśleni (RODO); atrybucja map; lore bez prawdziwych polityków i bez Wielkiego Mrozu, gra otwarta z zakończeniami ze ścieżek uchwał; nic na zewnątrz bez OK Mateusza; zrzut ekranu po każdej zmianie wizualnej.
- Nowe pola stanu dostają wartości domyślne, niezgodne zmiany podbijają wersję zapisu.
- Gra na Pages i dema działają bez serwera.
- Kod wersji 0.3 zostaje w repo i pod `/v03/`, bo stoją na nim testy różnicowe (`tools/v03.ts`), choć od 18.10.2026 gra już do niej nie odsyła.
- Telefon: wydajność i układ ekranów co najmniej jak dziś.

## Decyzje do przejrzenia przez Mateusza

Czeka na odpowiedź: kogo przy setkach ludzi gracz może przejąć ręcznie (sekcja „Praca ludzi i rozporządzenia”).

Moje rozstrzygnięcia, w tym te po pytaniach recenzenta, który czytał dokument w roli budującego:

1. Kolejność projektów, z pracą ludzi przed gospodarką.
2. Na start osada to zarząd i lokatorzy klatki siedziby jako liczby z dyżurami, jak w GDD. W bloku to kilkadziesiąt osób od pierwszego dnia.
3. Rozporządzenia łamią lokatorzy. Zarząd zawsze słucha poleceń gracza i zawodzi tylko przez własne potrzeby.
4. Zamknięta gra jednoosobowa stoi. Życie pod nieobecność gracza dotyczy tylko gry sieciowej. Karta nocy zostaje główną decyzją wieczoru, a rozporządzenie przejmuje ją tylko na życzenie gracza.
5. Klimat miejsca zamiast pogody na żywo, start zawsze jesienią w danym miejscu.
6. Silnik w tle bez modelu językowego w pętli gry. Dekalog później, zamieniany przy pisaniu na reguły.
7. Każdy scenariusz ma swój podatek od techniki: z bakterią technika gnije, z zombie hałasuje.
8. Fala 2 M2 (włamania i wspólny płot) otwiera projekt 4, chyba że Mateusz chce ją wcześniej.
9. Konto z e-mailem i magic linkiem czeka razem z resztą gry sieciowej.

## Co zostaje do rozstrzygnięcia w projektach

- Praca i rozporządzenia: lista reguł w pierwszej wersji, wzór posłuszeństwa, wygląd rozporządzenia na ekranie.
- Gospodarka i technologia: pełne drzewka, szczyty i futurystyka w trybie zombie, łańcuchy produkcji przy setkach ludzi.
- Klimat: źródło danych i licencja, „surowce na północy”, start jesienią, gra w tropikach.
- Rosnąca osada: koszt uwagi w grze jednoosobowej, wielkość mapy, twarz silnika na ścieżkach.
- Gra sieciowa: tempo świata, prywatność przy wypadach, model wypadów.
