# Praca ludzi i werbunek

Pierwszy projekt z `docs/superpowers/specs/2026-10-18-kierunek-rozwoju-design.md` (sekcja „Praca ludzi i rozporządzenia”, punkt 1 kolejności), w zakresie z prośby Mateusza z 19.10.2026, plus werbunek wędrowców i sprawdzenie wspólnego płotu. Rozporządzenia, dyżury klatek i przejmowanie lokatorów idą osobnym projektem (sekcja „Poza zakresem”).

Projekt zaakceptował nocny integrator w zastępstwie Mateusza 19.10.2026 po niezależnej recenzji, z dziewięcioma zmianami, które są już wpisane (sekcja „Decyzje”, „Akcept”). Słowa Mateusza są w cudzysłowie. Decyzje nocnego integratora (sesja „Nocna integracja projektu”, której Mateusz zostawił decyzje na noc z 18 na 19.10.2026) są oznaczone „(integrator)” i spisane w sekcji „Decyzje”, do przejrzenia przez Mateusza rano; jeśli Mateusz powie inaczej, jego słowo wygrywa. Moje propozycje i rozstrzygnięcia są oznaczone „(moje)”.

## Po co

Mateusz, 19.10.2026: chodzi o to, „żeby ludzie wykonywali pracę, po prostu coś robili ze sobą, kiedy ich nie oznaczamy”, żeby „w swoich ustawieniach” mogli „mieć na przykład ustawione automatyczne wykonywanie jakiegoś zadania”, i o „całe menu pracy, gdzie będziemy mogli ustalić, jakie zawody wykonują poszczególni członkowie naszej kolonii”. Do tego „system dołączania ludzi i tego, co możemy na przykład robić z przechodniami, którzy przychodzą, nakłaniać ich do nas, werbować, jak może przyrastać nam kolonia”, i wspólny płot: „Myślę, że to działa. Warto zweryfikować.”

Dziś każdą pracę poza jedzeniem, snem, kozą, kuchnią i budową trzeba wyklikać, a z każdym nowym człowiekiem klikania przybywa. Przyrost ludzi nic nie daje, bo nowi albo są mieszkańcami, którzy nic nie robią, albo zarządem, któremu trzeba wszystko zlecać. Ten projekt robi z zarządu ludzi, którzy sami pracują według ustawień gracza, i daje drugą, codzienną drogę przyrostu: werbunek przechodniów.

## Stan dziś (pelna-gra 8bf5efb)

Praca:
- Jedna praca na pionek (`p.job`), bez kolejki i priorytetów. Polecenia przyjmuje tylko zarząd (`kind === 'core'`).
- Bezczynny zarząd decyduje w `think()` (`src/sim/sim.ts`, około linii 3773). Kolejność: schronienie i dobijanie w trybie zombie, ostrożność przy wrogu na podwórku, odniesienie niesionego drewna, sen, jedzenie, dokładanie do kozy (`startRefuel`) i noszenie drewna do składu (`startHaul`), gotowanie (`shouldCook`, `startCook`), za dnia budowa najstarszego planu (`startAnyBuild`), na końcu ogrzanie się (`startWarm`, przy cieple poniżej `COLD`). Nic więcej sam nie robi: nie ścina, nie łata, nie naprawia, nie nosi łupu ani materiałów, nie przeszukuje, nie pracuje w warsztacie.
- `startHaul` bierze najbliższą stertę drewna z całego obszaru zarządu, także za bramą, także nocą i w trybie zombie.
- „Za dnia” to `!night()`, czyli 6:00–22:00. Prace M2 bez polecenia przerywają się nocą, przy pilnych potrzebach (`urgent`: ciepło poniżej 10, jedzenie poniżej 10, sen poniżej 5) i przy wrogu na podwórku (`M2_JOBS`).
- Umiejętności (`bud`, `cieplo`, `elek`, `med`, `uprawa`, `it`, `obrona`, wartości 1–4 z zawodu) zmieniają tylko celność, amputację i liczby zarządu (wartość warty, ryzyko wyprawy). Szybkość żadnej pracy od nich nie zależy.
- Mieszkańcy (`kind === 'resident'`) mają plan dnia (`plan()`), nie pracują, nie słuchają poleceń i nie głodnieją. Przejęcia lokatora w kodzie nie ma.

Przyrost:
- Ludzie dochodzą z wydarzeń zarządu (uchodźcy jako mieszkańcy, fachowiec i influencerka do zarządu przez `fx.join` i `addCore`) i z „Zaprosić do nas” w spotkaniu z sąsiadami (`przyjmijGospodarstwo`: gospodarstwo zostaje mieszkańcami).
- Wędrowców (`src/sim/wedrowcy.ts`, tylko z opcją `SimOpts.obcy`, w grze domyślnie włączoną) można tylko zagadać albo napaść. Projekt wędrowców wyłączył przyjmowanie wprost („Poza zakresem”).
- Błąd: w domu jednorodzinnym przyjęci uchodźcy nie pojawiają się wcale. `addResidents(…, arrive = true)` nie znajduje mieszkania przy podwórku ani klatki i zwraca 0, choć kronika i nastroje mówią, że przyszli (zmierzone na Zielonkach).
- Nie ma twardego limitu ludzi. Mieszkańcy nic nie kosztują.
- Zaufanie i wkurzenie są tylko w stanie zarządu (`GovState`), symulacja ich nie zna.

## Sprawdzenie wspólnego płotu (19.10.2026)

Wynik: płot działa tam, gdzie się da go postawić, ale na typowym blokowisku nie da się go postawić wcale, a jego koszt jest daleko poza tym, co gra daje w pierwszych dniach.

- `tests/unit/plot.test.ts`: 14 z 14.
- Prawdziwa symulacja na Lanciego, ziarno 7, w obu trybach: 10F otwarty, materiał dosypany, płot 65 m gotowy po 5,6 godziny gry jedną osobą. Obwód szczelny (z ulicy na podwórko nie ma drogi poza bramą i dziurami), zapis i wczytanie na świeżym świecie dają tę samą siatkę i ten sam skrót. W trybie zombie dwie kolejne noce bez szwendacza na podwórku.
- Kształt łańcuchem (najkrótszy możliwy płot, budynek po budynku, czysta funkcja `wspolnyPlot` z `ustawSiatke`): na Lanciego 10 budynków (razem 528 m nowego płotu, podwórko z 71 do 1058 m²), w Zielonkach 8 budynków (449 m, z 378 do 1086 m²).
- Na Przymorzu z 19 budynków do 150 m od siedziby nie da się otoczyć żadnego: każdy stoi za jezdnią (`why: 'jezdnia'`). Na Lanciego da się 4 z 25 (17 za jezdnią, 4 za długie), w Zielonkach 5 z 20.
- Koszt: najtańszy płot na Lanciego to 65 desek i 65 złomu (albo 130 sztuk jednego materiału). `npm run bot:surowce` (Przymorze, 5 ziaren, 5 dni) kończy z 9–17 deskami i 42–56 złomu, bo resztę zjadają budowle.
- Nie sprawdziłem drugiego budynku łańcucha w prawdziwej symulacji: mój skrypt nie umiał otworzyć 10H po otoczeniu 10F (osoba szła spać, a ponawiane polecenia przerywały pracę). Kształt łańcucha z czystej funkcji jest sprawdzony, przebieg w symulacji nie. Budujący dopisuje test łańcucha dwóch budynków (sekcja „Testy”).

Płot przez jezdnię idzie osobnym projektem zaraz po tym (integrator: potrzebny do warunku zwycięstwa z terytorium), koszt płotu zostaje do pomiaru po tym projekcie (sekcja „Poza zakresem”).

## Cele

- Bezczynny zarząd sam robi to, co da się zrobić bez decyzji gracza: dokłada, gotuje, buduje plany, rąbie, łata, naprawia, nosi, pracuje w warsztacie i przeszukuje to, co nasze.
- Gracz ustala w jednej tabeli, kto robi co i w jakiej kolejności, a na karcie osoby może dać jej stałe zajęcie.
- Gracz mówi, ile czego chce mieć w zapasie, i zarząd pracuje do tego progu, a potem przestaje.
- Zawód coś znaczy: ktoś z umiejętnością robi swoją pracę szybciej.
- Przechodnia da się zwerbować, a nowy człowiek od razu jest kimś, kto pracuje i je.
- Jedna funkcja liczy populację (pod warunek zwycięstwa integratora).

## Nie-cele

- Rozporządzenia, zmiany, dyżury klatek, posłuszeństwo od zaufania, przejmowanie lokatorów (osobny projekt, sekcja „Poza zakresem”).
- Mieszkańcy w tabeli Pracy i ich potrzeby (głód, zimno).
- Gospodarka i badania z 0.3 (Badania jako rodzaj pracy tak, sama pracownia i drzewko w sesji „Technologia i Gospodarka”).
- Płot przez jezdnię i nowy koszt płotu.

## Anty-cele (porażka, nawet jeśli działa)

- Gra gra za gracza. Sama praca bierze mozół (kolejny kurs z drewnem, kolejna łata), a nie decyzje: karta nocy, uchwały, wyprawy, spotkania, otwieranie i wyważanie cudzych drzwi, napaść, wyjście za siatkę w trybie zombie, wspólny płot i walka zostają przy graczu.
- Bezczynni sami wychodzą za siatkę na szwendaczy albo szabrowników.
- Samouczek pierwszego dnia robi się sam, zanim gracz kliknie.
- Ludzie zjadają cały materiał na rzeczy, których gracz nie chciał (sto desek z drewna na opał, dzidy dla nikogo, wzmacnianie każdego metra siatki).
- Polecenie gracza przegrywa z ustawieniami: osoba z poleceniem robi polecenie.
- Tabela, której nie da się obsłużyć na telefonie 390×844.

## Część A: praca

### Rodzaje pracy (moje, z Badaniami od integratora)

Dziewięć rodzajów w tej kolejności kolumn (ta sama kolejność rozstrzyga remis priorytetów, jak w RimWorldzie):

| rodzaj | co robi sam (istniejące prace w `sim.ts`) | umiejętność | zlecenia za siatką |
|---|---|---|---|
| Ogień | dokłada do kozy i ogniska, nosi drewno do składu (`refuel`, `haul`) | `cieplo` | drewno na ulicy |
| Kuchnia | gotuje, kiedy `shouldCook` (`cook`) | `uprawa` | nie |
| Budowa | buduje plany z menu budowy i dokańcza zlecony wspólny płot (`build`, `plot`) | `bud` | nie |
| Naprawy | łata dziury w siatce, naprawia uszkodzenia w naszych mieszkaniach (`patch`, `repair`) | `bud` | nie |
| Drwal | ścina drzewa, kiedy drewna jest mniej niż próg (`chop`) | `cieplo` | drzewa za siatką |
| Noszenie | nosi łup, materiały i sterty na podwórko (`carry`) | brak | łup i sterty na ulicy, u sąsiadów poza płotem |
| Warsztat | robi deski i części do progów, dzidy dla nieuzbrojonych (`saw`, `craft`) | wyższa z `elek` i `it` | nie |
| Szaber | przeszukuje nieprzeszukane puste mieszkania i pomieszczenia (`search`, `wreck`) | brak | wraki, pomieszczenia sąsiadów poza płotem |
| Badania | praca w pracowni z sesji „Technologia i Gospodarka” | według badania | nie |

Czego nie ma w automacie (moje, po przeglądzie): wzmacniania siatki (`brace`: siatka startuje z 45–75 wytrzymałości, więc zleceniem byłby prawie każdy metr po 2 sztuki materiału; zostaje poleceniem), drzew na linii obwodu (ścięty pień zamienia się w zwykły kafelek siatki, który da się przebić), przeszukiwania mieszkań z lokatorami (spada stosunek do −100 i robi się wrogość), otwierania, pukania i wyważania drzwi, napraw w niezajętych mieszkaniach (kosztują deski, a miejsca przybywa tylko w naszych). Warta nie jest rodzajem pracy: zostaje przy karcie nocy, menu i „Do broni!”. Walka (`react`), dobijanie i ucieczka działają jak dziś, przed wszystkim.

„Zlecenia za siatką” bierze sama tylko osoba z włączonym „Może wychodzić za siatkę” (integrator, punkt 7). Budynki otoczone wspólnym płotem i ich pomieszczenia są w środku (integrator). Pomieszczenia sąsiadów poza płotem są za siatką i tylko w budynkach już otwartych.

Badania (integrator, punkt 2): kolumna ukryta, dopóki gałąź `badania` sesji „Technologia i Gospodarka” nie wejdzie. Kontrakt uzgodniony z tamtą sesją 19.10.2026:
- `src/sim/praca.ts` (ten projekt) trzyma listę rodzajów jako wpisy `{ id, umiejetnosc(st, p), widoczny(st), znajdz(sim, p) }`. Wpis `'badania'` jest dziewiąty; do scalenia `widoczny()` zwraca `false`.
- Gałąź `badania` wystawia w `sim.ts` metodę `startResearch(p): boolean` (wolne miejsce w pracowni, praca `'research'`) i w `src/sim/badania.ts` czyste `badaniaDom(st): Dom | null` (dziedzina bieżącego badania, `null` bez badania) i `badaniaWidoczne(st): boolean` (jest pracownia albo badanie).
- Kto scala drugi, podpina je w ciało wpisu: `znajdz` to `sim.startResearch(p)`, `umiejetnosc` to `badaniaDom(st)`, `widoczny` to `badaniaWidoczne(st)`. Bez wybranego badania nikt nie siada.
- Gałąź `badania` ma własną kopię krzywej (`krzywaUmiejetnosci`, od 19.10.2026 `1 + 0,1 · poziom` z `TEMPO_BAZOWE = 1,0`), którą przy scaleniu zastępuje `tempoPoziomu` z tego projektu (bez bramki pierwszego dnia, którą ma `tempoPracy`); cechy z 0.3 (pracowity +10%, leniwy −10%, Mistrz Excela +5%) nakłada raz, w badaniach.
- Tamta gałąź nie rusza `think()`: bez tego projektu zarząd bada tylko na polecenie. Mieszkańcy znający dziedzinę siadają sami przez zaczep w `plan()`, poza tabelą Pracy (decyzja Mateusza przyjęta w tamtej sesji). Wiersza mieszkańca w tabeli tamta sesja nie potrzebuje.
- Wspólne miejsca w `sim.ts` to dopiski (`JobKind`, unia poleceń, konstruktor z `??=`), w `snapshot.ts` też; przy scaleniu bierze się oba.

### Priorytety (integrator, punkt 3; szczegóły moje)

- Każda osoba z zarządu ma dla każdego rodzaju priorytet 1–4 albo „nie robi”. 1 jest najważniejszy.
- Bezczynna osoba szuka najpierw zleceń ze stałego zajęcia (niżej), potem z rodzajów z priorytetem 1 w kolejności kolumn, potem 2, 3 i 4. W obrębie rodzaju bierze najbliższe zlecenie, które może wziąć.
- Domyślne priorytety liczy czysta funkcja z umiejętności osoby, bez losowania: Ogień 1 dla każdego (tak jak dziś każdy dokłada przed innymi pracami); rodzaj z umiejętnością 3–4 dostaje 1, z umiejętnością 1–2 dostaje 2, bez umiejętności 3; Noszenie i Szaber 3 dla każdego. U osoby bez umiejętności kolejność dzisiejszych prac (koza, kuchnia, budowa) się nie zmienia, a fachowiec dostaje swoją pracę wyżej.
- Stan trzyma tylko zmiany gracza względem domyślnych. Bez zmian pole w stanie nie powstaje, więc stary zapis dostaje domyślne priorytety bez migracji (integrator, punkt 10: `??=` w konstruktorze, gdy pole jest potrzebne).

### Stałe zajęcie (integrator, punkt 4; szczegóły moje)

To jest odczytanie „automatycznego wykonywania jakiegoś zadania w ustawieniach osoby”. Na karcie osoby wybór „Stałe zajęcie: brak / jeden z rodzajów”. Osoba ze stałym zajęciem bierze zlecenia tego rodzaju przed wszystkimi innymi, także przed rodzajami z priorytetem 1, i robi je, dopóki są. Kiedy nie ma, wraca do priorytetów. Stałe zajęcie włącza ten rodzaj, nawet jeśli w tabeli był wyłączony. W tabeli osoba ze stałym zajęciem ma przy imieniu znak tego rodzaju.

Przykład: Marek z „Stałe zajęcie: Drwal” i „Może wychodzić za siatkę” ścina drzewa, aż drewna jest ponad próg, potem nosi i dokłada jak inni.

Jeżeli Mateusz miał na myśli co innego (na przykład plan godzinowy osoby), stałe zajęcie przerabia się na karcie osoby, a priorytety i progi zostają.

### Progi zapasów (integrator, punkt 4; liczby moje)

W zakładce Praca nad tabelą: „Trzymać w zapasie”. Drewno (domyślnie 30), deski (20), części (10), dzidy (w zwykłym trybie domyślnie 0, w trybie zombie tyle, ilu w zarządzie jest bez broni). Zlecenia Drwala i Warsztatu powstają tylko poniżej progu i gasną po jego osiągnięciu, jak rachunki w RimWorldzie „rób, aż będzie X”. Próg zero wyłącza robienie.

Warsztat nie zjada materiału, który ma inne przeznaczenie (integrator, akcept punkt 8):
- deski z drewna tylko z nadwyżki ponad próg drewna (bot surowców robi dziś tak samo: ponad 20 sztuk);
- części ze złomu tylko z nadwyżki ponad rezerwę na łaty i plany: złom, którego potrzebują otwarte plany budowy (brak `need − have`) i łaty wszystkich otwartych dziur;
- dzidy trafiają do magazynu broni (`st.store.arms`), więc zlecenie dzidy liczy „ilu w zarządzie jest bez broni minus dzidy w magazynie” i powstaje tylko wtedy, gdy to więcej niż zero i dzid w magazynie jest mniej niż próg.

Zapas do progu liczy tylko to, co jest w obrębie siatki (podwórko, siedziba, otoczone budynki). Pasek u góry (`snapshot`) liczy też drewno leżące na ulicy, więc bez tego Drwal stanąłby przy „pełnym” zapasie, którego nikt nie wniesie.

Pozostałe rodzaje nie mają progów: Ogień pilnuje kozy, Kuchnia ma `shouldCook`, Budowa i Naprawy biorą to, co zlecone albo zepsute, Noszenie i Szaber to, co leży i czeka.

### Kiedy pracują

- Potrzeby: sen i jedzenie przed pracą, jak dziś.
- Zimno (integrator, akcept punkt 6): przy cieple poniżej 10 ogrzanie albo dołożenie do kozy idzie przed każdą pracą, także przed stałym zajęciem i budową planów. Dziś `startAnyBuild` tego nie sprawdza: zmarznięta osoba zaczyna budowę, `urgent` ją przerywa, `think()` daje ją znowu, i tak w pętli. To istniejący błąd, poprawiany w tym projekcie, z testem pętli. Przy cieple od 10 do `COLD` ogrzanie zostaje po pracy, jak dziś; jeśli pomiar „zarząd bez gracza” pokaże spadek ciepła albo nastroju, budujący przesuwa je przed rodzaje z priorytetem 3 i 4.
- Gasnąca koza (moje, z uwag integratora): dołożenie do kozy, w której zostało mniej niż `BURN_TICKS` ognia, idzie przed stałym zajęciem, tak jak dziś przed budową.
- Przerwania (integrator, akcept punkt 5): każda praca podjęta bez polecenia przerywa się jak prace M2 (`M2_JOBS`: noc, pilna potrzeba, wróg na podwórku). Do zbioru dochodzą `chop`, `patch`, `craft`, `saw`, `haul`, `search` i `carry` (na gałęzi `badania` tak samo `research`). Praca z polecenia przerywa się jak dziś.
- Tryb zombie (integrator, akcept punkt 5): automat nie łata i nie pracuje przy siatce (cel pracy do 3 m od kafelka siatki), kiedy szwendacz jest bliżej niż 10 m od celu; z polecenia gracz może.
- Godziny: sama praca za dnia, czyli 6:00–22:00 (`!night()`), jak dziś budowa i prace M2 bez polecenia; nocą tylko koza i kuchnia; polecenie gracza o każdej porze (integrator, punkt 6).
- Przy wrogu na podwórku, w trybie zombie za siatką i przy pilnych potrzebach wszystko jak dziś: te gałęzie `think()` stoją przed pracą.
- Polecenie gracza zawsze wygrywa i nie wraca do priorytetów, dopóki się nie skończy (`order: true`).
- Drewno zza siatki (integrator, punkt 9): ścinanie na polecenie obejmuje wniesienie całego drewna z tego drzewa przez tę samą osobę, tak jak wrak przechodzi w noszenie (`carryOn`). Bezczynni wnoszą drewno zza siatki tylko za dnia i tylko z przełącznikiem „Może wychodzić za siatkę”. Drewno w obrębie siatki noszą jak dziś, także nocą. To zmienia dzisiejsze `startHaul`, które bierze najbliższą stertę z całego obszaru, także zza bramy.

### Pierwszy dzień (integrator, punkt 9)

To, co zarząd robi sam już dziś (koza, kuchnia, noszenie drewna w obrębie siatki, budowa planów), zostaje od początku gry bez zmian. Nowe rodzaje (Drwal, Naprawy, Noszenie, Warsztat, Szaber, Badania) ruszają od pierwszego rana (dzień 2, 6:00) i dopiero po skończonym samouczku (`st.tut.step` równe `TUT_STEPS.length`, albo −1 w świecie bez samouczka). Rozumienie „po celach pierwszego dnia” jako „od pierwszego rana po samouczku” jest moje, bo cele pierwszego dnia (samouczek, drewno na noc, przetrwać noc) kończą się rano.

Wyjście awaryjne (integrator, akcept punkt 7): od dnia 3, 6:00 nowe rodzaje ruszają także bez skończonego samouczka (na przykład gdy gracz nie ściął suchego drzewa). W pomiarze „zarząd bez gracza” bot wydaje jedno polecenie z samouczka (ścięcie suchego drzewa), żeby samouczek się skończył jak u gracza.

Skutek uboczny: część celów drugiego dnia (przeszukać dom, drewno na drugą noc) zarząd może zrobić sam, jeśli gracz zostawi domyślne priorytety. Przyjmuję to: cele drugiego dnia stają się wskazówką, co warto mieć.

### Umiejętności (integrator, punkt 8 i akcept punkt 4)

Czas pracy rodzaju z umiejętnością dzieli się przez mnożnik `1 + 0,1 · poziom`: bez umiejętności dzisiejsze tempo (1,0), umiejętność tylko przyspiesza (poziom 2 daje 1,2, poziom 4 daje 1,4). Mnożnik działa od pierwszego rana, tak samo jak nowe rodzaje (przed nim zawsze 1), więc pierwszy dzień gry naprawdę jest bez zmian także u osób z umiejętnością (moje, po akcepcie: z umiejętnością od początku gotowanie i budowa szły szybciej już pierwszego dnia). Dotyczy ścinania, budowy, łatania, napraw, warsztatu, gotowania i badań; noszenia, szabru i dokładania nie. To samo działa przy poleceniu gracza. Jedna funkcja `tempoPracy(st, p, rodzaj)` w `src/sim/praca.ts` daje mnożnik wszystkim pracom. Liczbę 0,1 może zmienić bot, zasada „bez umiejętności 1” zostaje.

Krzywa jest wspólna z badaniami (uzgodnione z sesją „Technologia i Gospodarka” 19.10.2026): sama krzywa to `tempoPoziomu(poziom) = 1 + 0,1 · poziom` w `src/sim/praca.ts`, a `tempoPracy` dokłada do niej bramkę pierwszego dnia. Gałąź `badania` bierze tę samą krzywą (`krzywaUmiejetnosci`) z `TEMPO_BAZOWE = 1,0` (badacz z umiejętnością 2 bez zmian, 1,2 punktu na godzinę), stroi `TEMPO_BAZOWE` swoim botem i przy scaleniu oddaje krzywą `tempoPoziomu`.

### Osoby, polecenia i stan (moje)

- Ustawienia (priorytety, stałe zajęcie, przełącznik za siatkę) przypina się do osoby przez jej indeks w `st.people`, który się nie zmienia (osoby nie znikają z listy, także po śmierci i odejściu). Nie przez `Person.id`: symulacja numeruje osoby od `s1` (mieszkańcy, lokatorzy sąsiadów), a zarząd od `s100`, więc w bloku z wieloma lokatorami liczniki się spotkają.
- Zwerbowani wędrowcy dostają id z własnym przedrostkiem (`w1`, `w2`, …), żeby nie wejść w żaden z tych liczników.
- Kolizja liczników `s…` to istniejący błąd (przy kolizji `applyGov` nie doda fachowca z wydarzenia, bo `pawnOf` znajdzie tego samego id). Poza tym projektem: zgłoszony integratorowi do osobnej poprawki.
- Zmiany ustawień idą przez kolejkę poleceń w stanie (`sim.push`), jak inne polecenia, i działają od następnego kroku: priorytet osoby dla rodzaju, stałe zajęcie, „może wychodzić za siatkę”, próg zapasu.
- Nowe pola stanu są opcjonalne i powstają przy pierwszej zmianie gracza; stan bez nich daje domyślne ustawienia (zasada z CLAUDE.md). Wersja stanu się nie zmienia, bo stary zapis działa bez migracji.
- Wyszukiwanie zleceń nie może rozdmuchać kosztu kroku przy 12 osobach: `think()` woła się co sekundę na osobę (`THINK_EVERY`), a każdy rodzaj ma tanie „czy w ogóle jest robota” przed szukaniem najbliższej. Pamięć „czy jest robota” trzyma `Sim` poza `SimState`, jak bufor A* i statystyki, żeby skrót stanu od niej nie zależał. Budujący mierzy `npm run perf` z 12 osobami w zarządzie.
- „Najbliższe zlecenie” to najmniejsza odległość w liczbach całkowitych (długość drogi albo suma |dx| + |dy|), remis po indeksie zlecenia w stanie. Bez `Math.hypot`, `sin` i `cos` w decyzjach (zasada z dziennika: różne silniki JS mogą dać różne wyniki).

### Populacja (integrator, punkt 14)

Jedna czysta funkcja `populacja(st)` w `src/sim/snapshot.ts`: zarząd żywy (także na wyprawie) i mieszkańcy żywi, osobno i razem. Bez lokatorów sąsiednich budynków, którzy nie są nasi (także w budynkach otoczonych wspólnym płotem: przyłączanie ich lokatorów to dalszy projekt, `docs/M2-fala-2.md`), i bez gości (wędrowców, handlarza, obcych).

Kontrakt z projektem warunków zwycięstwa (integrator, gałąź `warunki-zwyciestwa`, `docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md`, sekcja „4. Ludnościowa”; akcept punkt 1): `GovInput.ludnosc` już tam jest (`src/gov/typy.ts`), wypełniane w `govInput()` jako liczba osób zarządu plus mieszkańców, a `ludnoscOf()` w `src/gov/zwyciestwo.ts` ma zapas, gdy pola brak. Ten projekt tylko podmienia to wyrażenie na `populacja(st).razem` i dodaje test, że obie liczby są równe na trzech demach; bez nowego typu i bez pól w atrapach. Tę część buduje się na `pelna-gra` po wejściu ramy zwycięstwa (integrator: tej nocy).

Cel zwycięstwa tam to połowa ludności kwadratu domu z NSP 2021, od 120 do 500 osób, utrzymana 7 dni bez głodu; ten projekt nie liczy celu, tylko daje ludność. Koniec gry „pustką” dalej liczy tylko zarząd (akcept punkt 2). Licznik „7 dni bez głodu” sprawdza dziś tylko zarząd i zostaje tak do projektu gospodarki (akcept punkt 3).

`EventHost.pop()` w wydarzeniach zarządu bierze `ludnoscOf`, jeśli na trzech demach daje tę samą liczbę co dziś (test); jeśli nie, zostaje, a różnica idzie do dziennika (moje, z uwag integratora).

### Interfejs (moje)

- Przycisk „Praca” / „Work” w górnym pasku obok „Buduj” / „Build”, klawisz P (wolny: zajęte są spacja, 1–4, WASD, B, R, Escape, plus i minus).
- Panel jak panel budowy (`src/ui/panelbudowy.ts`): nie-modalny, z prawej, mapa pod nim klikalna; na telefonie arkusz na całą szerokość od dołu. Treść robi czysta funkcja do HTML z odczytu symulacji, bez DOM, z testem w Node, jak `buildPanelHtml`.
- Na górze „Trzymać w zapasie” z trzema liczbami (drewno, deski, części: minus, liczba, plus). Pod spodem tabela: wiersz na osobę (imię, zawód, znak stałego zajęcia, przełącznik „za siatkę”), kolumna na rodzaj z krótką nazwą i dymkiem. W komórce cyfra 1–4 albo pusto. Klik albo stuknięcie przestawia 1 → 2 → 3 → 4 → pusto → 1; prawy przycisk w drugą stronę. Kliknięty nagłówek kolumny pokazuje, ile zleceń tego rodzaju czeka.
- Na telefonie 390×844 tabela mieści dziewięć kolumn po 30 px i kolumnę imion; przy 12 osobach przewija się w pionie, nagłówek stoi.
- Karta osoby: „Stałe zajęcie” (wybór) i „Może wychodzić za siatkę” (przełącznik). W trybie zombie przy włączeniu przełącznika ostrzeżenie, że za siatką są szwendacze (integrator, punkt 7). Wiersz „co robi” dostaje dopisek „(sama)” albo „(sam)” / „(on own)” przy pracy wziętej bez polecenia, żeby było widać, że to ustawienia, a nie rozkaz.
- Wszystkie napisy przez warstwę języka (`tr()`), oba języki, angielski według `docs/SLOWNICZEK-EN.md`. Nazwy rodzajów po angielsku ustala budujący ze słowniczkiem (propozycja: Fire, Kitchen, Build, Repair, Woodcutting, Hauling, Workshop, Scavenging, Research).

## Część B: werbunek i przyrost

### Zaprosić wędrowca (integrator, punkty 11 i 12; szczegóły moje)

- Po rozmowie z wędrowcem („Zagadać”) w jego menu jest „Zaprosić do nas (N% szans)”, raz na wędrowca. Rozmowa mówi też, kim był (zawód), żeby było wiadomo, kogo się zaprasza.
- Osoba wędrowca (imię, wiek, zawód, umiejętności) powstaje przy rozmowie z ziarna liczonego z ziarna świata i numeru wędrowca, a nie z `st.rng`, żeby gry bez rozmów biegły jak dziś. Generator ten sam co dla przybyszów z wydarzeń (`makePerson`).
- Szansa (moje, liczby do strojenia botem): 0,30, +0,20 gdy jedzenia jest co najmniej 2 porcje na osobę w zarządzie, +0,15 gdy jest wolne łóżko, −0,30 gdy w ciągu ostatnich dwóch dób była napaść na wędrowca albo handlarza (`st.obcy.napady`); w zakresie 0,05–0,85. Połowa wędrowców ma swój cel („idzie do rodziny”, z ziarna wędrowca) i szansę o połowę mniejszą, co rozmowa mówi wprost. Zaufania we wzorze nie ma, bo symulacja go nie zna (moje, po przeglądzie; integrator przyjął wzór z zaufaniem, zanim to wyszło). Most zaufania do symulacji zrobi projekt rozporządzeń, bo posłuszeństwo i tak go potrzebuje; wtedy zaufanie może wejść do wzoru.
- Udane zaproszenie: wędrowiec przechodzi bramą i staje się osobą zarządu (pionek `core` z osobą, jak `addCore`, z jego wyglądem i z miejsca, w którym stoi), z domyślnymi priorytetami, linią w kronice i nastrojem „Nowa osoba w zarządzie” dla reszty. Nieudane: dziękuje, idzie dalej, bez kary.
- Tryb zombie: co piąty wędrowiec ukrywa ugryzienie, jak gospodarstwa sąsiadów (`UKRYTY_UGRYZIONY`). „Zapytać o rękę” przed zaproszeniem ujawnia je, a przyjęty bez pytania dostaje gorączkę od chwili ugryzienia. Ten sam kod co przy sąsiadach.
- Limit: zwerbowani idą do zarządu, dopóki ma mniej niż 12 osób (jedna stała, integrator, punkt 12). Przy pełnym zarządzie zwerbowany zostaje mieszkańcem, ale tylko do wolnego łóżka (akcept punkt 3): dostaje mieszkanie z wolnym łóżkiem, idzie tam pracą `arrive` i żyje planem dnia, jak przyjęte gospodarstwo sąsiadów. Łóżek przybywa z łóżek piętrowych z menu budowy, z zajętych i naprawionych mieszkań (`capOf`). Bez wolnego łóżka albo ponad pojemność (`capOf`) zaproszenie jest wyszarzone (napis „Brak miejsca”, po angielsku „No room”). Menu przy pełnym zarządzie mówi, że przyjdzie jako mieszkaniec. W domu jednorodzinnym mieszkańcy dziś nie mają łóżek ani wstępu (Decyzje, punkt 15), więc tam przy pełnym zarządzie opcji nie ma, aż do osobnej poprawki. Limit dotyczy tylko werbunku: wydarzenia dokładają jak dziś. Zmienia „Poza zakresem” z `docs/superpowers/specs/2026-10-18-wedrowcy-design.md`.

### Przyrost ma koszt (moje)

Zwerbowany je i grzeje się jak każdy z zarządu, więc kolejna osoba to więcej rąk i więcej jedzenia. Mieszkańcy dalej nic nie kosztują i nic nie robią (Nie-cele); to zostaje do projektu rozporządzeń i gospodarki.

### Uchodźcy w domu jednorodzinnym

Poza tym projektem, osobną poprawką (integrator, punkt 15). To nie jest poprawka jednej funkcji: warstwa przechodniości mieszkańców blokuje całe mieszkanie zarządu (`homeMask` w `src/sim/house.ts`), a w domu to cały dom, więc mieszkańcy nie mają gdzie wejść ani spać, a `plan()` i `homeSpot` nie mają ich gdzie posłać. Ten projekt tylko nie pogarsza sprawy: w domu przy pełnym zarządzie zaproszenia wędrowca nie ma.

## Testy i bramka

Testy w Node (nowe pliki w `tests/unit/`), każdy, który da się zepsuć, sprawdzony celowo wprowadzonym błędem:
- domyślne priorytety z umiejętności (czysta funkcja), stary zapis bez pól pracy daje domyślne;
- kolejność: stałe zajęcie przed priorytetem 1, 1 przed 2, remis według kolumn, polecenie gracza przed wszystkim, sen i jedzenie przed pracą;
- każdy rodzaj sam bierze swoją pracę na prawdziwej mapie (Przymorze albo Lanciego): Drwal ścina poniżej progu i przestaje nad progiem, Naprawy łatają dziurę z materiałem, Noszenie wnosi łup z otoczonego budynku, Warsztat robi deski do progu, Szaber przeszukuje puste pomieszczenie w otoczonym budynku;
- czego nie ma w automacie: nikt sam nie wzmacnia siatki, nie ścina drzewa na linii obwodu, nie przeszukuje mieszkania z lokatorami, nie otwiera cudzych drzwi;
- „za siatkę”: bez przełącznika nikt sam nie wychodzi za siatkę (żadna praca bez polecenia z celem za siatką, także noszenie drewna), z przełącznikiem wychodzi tylko osoba z przełącznikiem i tylko za dnia; ścinanie za siatką na polecenie kończy się wniesieniem całego drewna z drzewa przez tę samą osobę;
- pierwszy dzień: przed pierwszym rankiem i przed końcem samouczka nowe rodzaje nic nie robią, koza, kuchnia i budowa jak dziś;
- próg drewna liczy tylko drewno w obrębie siatki;
- mnożnik umiejętności: ta sama praca szybciej u osoby z umiejętnością;
- werbunek: szansa z jedzenia, łóżka, napaści i celu wędrowca; udane zaproszenie robi osobę zarządu z priorytetami i id `w…`; przy pełnym zarządzie zwerbowany zostaje mieszkańcem w wolnym łóżku, a bez wolnego łóżka opcji nie ma; w domu przy pełnym zarządzie opcji nie ma; ukryte ugryzienie w trybie zombie i „Zapytać o rękę”; gra bez rozmów z wędrowcem ma ten sam skrót co bez tej funkcji;
- `populacja(st)`: zarząd z wyprawą, mieszkańcy, bez sąsiadów i gości; `GovInput.ludnosc` równe `populacja(st).razem` na trzech demach;
- zimno: osoba z ciepłem poniżej 10 przy czekającym planie budowy i przy stałym zajęciu najpierw się grzeje albo dokłada (test, który dziś pada na pętli budowa, przerwanie, budowa);
- przerwania: każda praca bez polecenia przerywa się nocą, przy pilnej potrzebie i przy wrogu na podwórku; w trybie zombie automat nie łata i nie pracuje przy siatce przy szwendaczu bliżej niż 10 m;
- wyjście awaryjne samouczka: od dnia 3, 6:00 nowe rodzaje działają bez skończonego samouczka;
- progi warsztatu: części ze złomu nie zjadają rezerwy na łaty i plany; dzidy tylko dla nieuzbrojonych ponad dzidy w magazynie;
- łańcuch wspólnego płotu w symulacji, pierwszy w kolejności budowy (uwaga integratora): 10F, potem 10H na Lanciego, obwód szczelny po każdym, zapis i wczytanie z tym samym skrótem;
- determinizm: ten sam skrót po kilku dobach z pracą, zapis i wczytanie w połowie nie zmieniają przebiegu.

Boty:
- `npm run bot` i `npm run bot:zombie` dostaną nowe skróty (zarząd sam pracuje). Nowe skróty bazowe do dziennika, z porównaniem liczb przed i po (zgony, siatka, drewno, jedzenie), razem z przypiętymi skrótami w `tests/unit/druzyna-sim.test.ts`, jeśli się zmienią (integrator, punkt 10 i akcept punkt 9).
- Nowy pomiar „zarząd bez gracza”: trzy doby bez żadnego polecenia poza kartą nocy, na trzech demach i w obu trybach. Ile drewna, desek, części, załatanych dziur i przeszukanych pomieszczeń, ile razy ktoś sam wyszedł za siatkę (ma być 0 bez przełącznika), jak ciepło i nastrój zarządu.
- `npm run bot:surowce` po zmianie: ile desek i złomu jest po 5 dniach i którego dnia stać na najtańszy wspólny płot na Lanciego. To liczba do projektu kosztu płotu.
- Werbunek w bocie (z włączoną opcją `obcy`, której `bot.ts` i `bot-zombie.ts` dziś nie włączają): ilu zwerbowanych po 10 dniach przy rozmowie z każdym wędrowcem, ilu do zarządu, ilu jako mieszkańcy; cel (moje) 2–5 do zarządu w 10 dni. Bot drukuje ludność (`populacja(st)`: zarząd, mieszkańcy, razem) na koniec każdego dnia, bo z niej integrator ustawi tempo werbunku pod warunek ludnościowy.

Zrzuty (`npm run shots`, obejrzane w Chromium): górny pasek na telefonie 390×844 ze wszystkimi przyciskami po scaleniach (Praca, Badania, Mapa, Piętro; uwaga integratora), panel Pracy na komputerze i telefonie po polsku i po angielsku, karta osoby ze stałym zajęciem i przełącznikiem, menu wędrowca z zaproszeniem, nowa osoba w zarządzie przy bramie. Wydajność: `npm run perf` z 12 osobami w zarządzie, laptop i telefon (CPU 4×), co najmniej jak dziś.

Bramka: testy, Biome na `src tests tools server index.html`, build, boty, zrzuty i wydajność jak wyżej, wpis w `docs/POSTEP.md`.

## Kolejność budowy (moje)

0. Test łańcucha wspólnego płotu w symulacji (10F, potem 10H na Lanciego).
1. Model pracy w symulacji: `src/sim/praca.ts` z rodzajami, priorytetami, stałym zajęciem, progami, „za siatkę”, pierwszym dniem z wyjściem awaryjnym, mnożnikiem umiejętności, przerwaniami, zimnem przed pracą, poleceniami ustawień; wpięcie w `think()`; `populacja(st)`; testy, boty i nowe skróty.
2. Interfejs: panel Pracy, karta osoby, napisy w obu językach, zrzuty.
3. Werbunek wędrowców, testy, bot.
4. `GovInput.ludnosc` z `populacja(st)`, po wejściu ramy zwycięstwa do `pelna-gra`.
5. Pomiar kosztu płotu, wydajność, bramka i dziennik.

Kolejność scalania (akcept punkt 9): gałąź tego projektu wchodzi do `pelna-gra` po gałęziach `badania`, ramy zwycięstwa i pięter etap 1, które mają bramkę „skróty bez zmian”, i dopiero ona ogłasza w dzienniku nowe skróty bazowe.

## Poza zakresem

- Rozporządzenia, zmiany, dyżury klatek, posłuszeństwo od zaufania, przejmowanie lokatorów: osobny projekt (dalsza część punktu 1 z kierunku rozwoju). Ten projekt zostawia pod niego miejsce: rodzaje pracy i priorytety są tym, co rozporządzenie będzie ustawiać grupom. Przejęty lokator dostanie wiersz w tabeli, kiedy przejęcie powstanie (integrator, punkt 1).
- Mieszkańcy w tabeli Pracy, ich głód i zimno, koszt mieszkańców.
- Płot przez jezdnię: osobny projekt zaraz po tym (integrator, punkt 14), bo bez niego na Przymorzu terytorium nie rośnie wcale, a zmienia drogi handlarza, wędrowców i obcych ekip, które chodzą ulicą.
- Koszt wspólnego płotu: zostaje, dopóki bot surowców po tym projekcie nie pokaże przychodu desek i złomu przy samej pracy.
- Kolizja liczników `Person.id` (`s1…` z symulacji, `s100…` z zarządu): osobna poprawka.
- Uchodźcy w domu jednorodzinnym, którzy dziś nie przychodzą: osobna poprawka (integrator, punkt 15).
- Urodziny, przyłączanie klatek i bloków, silnik w tle.

## Decyzje

Integrator, 19.10.2026 w nocy (do przejrzenia przez Mateusza):
1. W tabeli zarząd; przejęty lokator dostanie wiersz, kiedy przejęcie będzie w kodzie (dziś go nie ma), reszta mieszkańców później.
2. Osiem moich rodzajów plus dziewiąty, Badania, z kontraktem uzgodnionym z sesją „Technologia i Gospodarka” (sekcja „Rodzaje pracy”); do scalenia gałęzi `badania` ukryte.
3. Priorytety 1–4 i puste, domyślne z umiejętności zawodu.
4. Stałe zajęcie na karcie osoby plus progi zapasów w zakładce Pracy.
5. Potrzeby przed pracą.
6. Sama praca tylko za dnia, 6:00–22:00, jak dziś (najpierw padło „do 20:00” na mojej błędnej przesłance w pytaniu, potem integrator poprawił na 6–22).
7. Przełącznik „Może wychodzić za siatkę” domyślnie wyłączony, w trybie zombie z ostrzeżeniem; teren za wspólnym płotem nasz.
8. Mnożnik z umiejętności, liczby z bota.
9. Nowe rodzaje dopiero po celach pierwszego dnia; to, co zarząd robi sam dziś (koza, kuchnia, noszenie drewna), bez zmian, z jednym wyjątkiem: drewno zza siatki wnosi ten, kto ściął drzewo na polecenie, a bezczynni wychodzą po drewno za siatkę tylko za dnia i z przełącznikiem.
10. Nowe skróty botów z dopiskiem w dzienniku, stare zapisy z domyślnymi priorytetami.
11. Werbunek wędrowców tak.
12. Do zarządu, limit 12 jako jedna stała; ponad limit zwerbowani zostają mieszkańcami (tak brzmiała rekomendacja, którą integrator przyjął).
13. Uchodźców w domu naprawić tutaj; po przeglądzie zmienione w punkcie 15.
14. Płot przez jezdnię osobnym projektem zaraz po tym (warunek zwycięstwa terytorialnego); jedna funkcja populacji wystawiona w `GovInput` jako `ludnosc` dla warunku ludnościowego, bot drukuje ludność po dniach.
15. Uchodźcy w domu jednorodzinnym osobną poprawką, poza tym projektem.

Akcept integratora po niezależnej recenzji (19.10.2026, w zastępstwie Mateusza), dziewięć zmian wpisanych wyżej:
1. `GovInput.ludnosc` już jest na gałęzi ramy zwycięstwa; tu tylko `populacja(st).razem` i test równości.
2. Pustka dalej liczy tylko zarząd.
3. Zwerbowany ponad limit tylko do wolnego łóżka. Znana luka: przyjmowane gospodarstwa sąsiadów (`przyjmijGospodarstwo`) dostają mieszkanie najmniej zatłoczone, bez górnej granicy, więc przyrost przez sąsiadów dalej nie ma kosztu łóżka; zostaje do projektu gospodarki albo rozporządzeń. „7 dni bez głodu” sprawdza tylko zarząd.
4. Bez umiejętności tempo 1, umiejętność tylko przyspiesza (`1 + 0,1 · poziom`), krzywa wspólna z badaniami.
5. Każda praca bez polecenia przerywa się jak prace M2; w trybie zombie automat nie łata i nie pracuje przy siatce przy szwendaczu blisko.
6. Ciepło poniżej 10: ogrzanie albo dołożenie przed każdą pracą, z poprawką istniejącej pętli przy budowie.
7. Wyjście awaryjne samouczka od dnia 3, 6:00; bot wydaje polecenie z samouczka.
8. Progi dzid i części z rezerwą (sekcja „Progi zapasów”).
9. Kolejność scalania i ogłoszenie nowych skrótów.

Uwagi integratora rozstrzygnięte przeze mnie: zrzut paska na telefonie po wszystkich scaleniach tak; klawisz P zostaje (M zajęła mapa miasta); `EventHost.pop()` przez `ludnoscOf` tylko przy tej samej liczbie co dziś; dokładanie do gasnącej kozy przed stałym zajęciem tak; najbliższe zlecenie po całkowitej odległości z remisem po indeksie, bez `Math.hypot`; pamięć „czy jest robota” poza `SimState`; test łańcucha płotu na początek.

Pytanie do Mateusza (z uwag integratora, bez wpływu na budowę): czy lokatorzy budynków otoczonych wspólnym płotem mają się liczyć do ludności. Dziś nie są nasi (zostają „u siebie”), więc `populacja(st)` ich nie liczy; przyłączenie ich to dalszy projekt.

Moje rozstrzygnięcia po przeglądzie oczami budującego: wzmacnianie siatki, drzewa na linii obwodu, szaber u lokatorów, cudze drzwi i naprawy w niezajętych mieszkaniach poza automatem; ogrzanie tam, gdzie dziś, z pomiarem; ustawienia na indeksie osoby, zwerbowani z id `w…`; wzór werbunku bez zaufania; próg drewna tylko w obrębie siatki; bot werbunku z opcją `obcy`.

## Zostaje budującemu

- Dokładna postać pól stanu i poleceń, nazwy funkcji wyszukujących zlecenia, podział `think()` na rodzaje.
- Które zlecenia Naprawy i Noszenia mają pierwszeństwo w obrębie rodzaju, poza zasadą „najbliższe”.
- Liczby mnożnika umiejętności, szansy werbunku i progów domyślnych, jeśli boty pokażą, że trzeba je zmienić (zasady zostają).
- Wygląd panelu w ramach stylu gry (beton, emaliowana tabliczka, papier gazetki), z zaprojektowaniem od razu na telefon.
