# Osada AI: rywal na sąsiednim kwadracie

Stan: projekt do przeczytania przez Mateusza, 20.10.2026. Nic z tego nie jest zbudowane. Źródło: rozmowa Mateusza
z nocnym integratorem 19.10.2026 wieczorem i 20.10.2026 (pytania po kolei, słowa Mateusza w cudzysłowie, mówił głosem,
literówki poprawione) oraz szkic „obca ekipa” z projektu mapy miasta (`2026-10-18-mapa-miasta-design.md`, sekcja
„Następny projekt”), na który Mateusz odpowiedział „Tak”. Reszta to moje decyzje, oznaczone jako moje. Projekt przeczytał
recenzent w roli budowniczego; jego pytania są rozstrzygnięte niżej.

## Po co

„Dodajemy w ogóle osadę zarządzaną przez AI? Najlepiej niech będzie na jakimś nieodkrytym kafelku, który dopiero
odkryjemy, i oni tam się rozwijają.” „To silnik, a nie model językowy ma tym zarządzać, optymalne decyzje.”

„Możemy wejść w interakcje, handlować albo napaść, są jak NPC jak my. W dyplomację wchodzimy przez kliknięcie na ich
budynki. A opcje rozmowy, ataku itp. klikając na ich człowieka. Atakujemy przez np. włamanie albo zniszczenie drzwi.”

Rola w grze: „Przeszkadza osiągnąć cele wielkości osady i ilości ludzi, bo konkuruje, do tego jest zagrożeniem samym
w sobie.” Koniec: „Jeśli możemy, to przejmujemy jej teren, a jak nie, to po prostu przestaje istnieć. Może być też tak,
że częściowo ją zniszczymy, też nie musimy iść na wojnę całkowitą.” Liczba: „Jedna osada AI oprócz naszej.”

Najgorzej by było: „Że przeciwnicy nie byliby w stanie wchodzić w interakcję. I byliby niewyważeni.”

Wcześniej (projekt mapy miasta, „Tak” Mateusza): inny klan gra według tych samych zasad co gracz, rozbudowuje się,
prowadzi go bot, a bot wydaje polecenia tą samą drogą co gracz, więc kiedyś na jego miejscu usiądzie człowiek. Wyprawy
klanu zabierają z tych samych miejsc w mieście co nasze, a karta miejsca pokazuje wtedy „ktoś tu był przed wami”.

Mateusz zgodził się na odegrany obraz („Wszystko ok”): osada to spółdzielnia jak nasza, z zarządem, mieszkańcami,
siatką i budowlami; przeszukuje, buduje, bada i rośnie z dnia na dzień; po odkryciu może przyjść do nas z handlem albo
z napadem i pamięta, co jej zrobiliśmy.

### Co jest dziś

- Kontakt z sąsiadami (fala 2 M2, `src/sim/sasiedzi.ts`, menu w `src/sim/orders.ts` `sasiedziAt`): drzwi w pięciu
  stanach (`StanDrzwi`: zamknięte, na klucz, otwarte, wyważone, zabite), polecenia „Otworzyć drzwi”, „Zapukać”,
  „Wyważyć drzwi” (40 minut, hałas 25 m, z łomem połowa), „Zabić drzwi deskami”, karta spotkania z wyborami
  „Porozmawiać”, „Dać jedzenie”, „Zaprosić do nas”, „Zabrać im zapasy”, „Odejść” i pamięcią gospodarstwa (`rel` od −100
  do 100, zamiar, nastrój). Walka w spotkaniu jest liczbowa, bez pionków.
- Obcy (`SimOpts.obcy`): handlarz z menu „Dać X za Y” i napadem, wędrowcy z „Zagadać” i „Zaprosić do nas” (werbunek),
  obce ekipy, które przeszukują wraki przed nami, mściciele `zbir`. Szabrownicy nocą z karty nocy (`raidChance`
  w `src/gov/noc.ts`, w trybie zombie ich nie ma).
- Walka pionków (`startFight`, `fightTick`, `hostileStrike` w `src/sim/sim.ts`): atakować można tylko wroga
  (`isEnemy`: szabrownik, szwendacz, `wrogi`); sąsiad, mieszkaniec, wędrowiec i obcy nie mają polecenia ataku.
- Klik w cudzy budynek bez zaznaczenia daje kartę tylko do czytania (`kartaBudynku` w `src/ui/budynek.ts`); dyplomacji
  nie ma. Klik w cudzego człowieka daje kartę bez działań.
- Wspólny płot (`wspolnyPlot`, `plotDla`) przyłącza sąsiedni budynek; `GovInput.teren` liczy przyłączone; droga
  terenu ma pięć kamieni, ostatni to dziewięć kwadratów za murem bez wrogiej grupy w środku (projekt warunków
  zwycięstwa). Droga ludności liczy zarząd i mieszkańców siedziby (`populacja`).
- Nic w stanie nie zna drugiej drużyny: magazyn, siatka, budowle, uchwały, mieszkania, płot i napady są w `SimState`
  pojedyncze. Gra sieciowa ma tylko „klatkę zajętą przez inną drużynę” (`SimState.zajete`).
- Dane sąsiednich kwadratów są tylko w demach (`public/demo/<klucz>-kwadraty.json`, ładowane przy `?kwadraty=`); dla
  prawdziwego adresu nic się nie pobiera, a kafelki miasta (`KafelkiMiasta`) idą dopiero przy oglądaniu mapy miasta.
- Rozpoznanie (`docs/ocena/2026-10-19-osada-ai-rozpoznanie.md`): dwie i trzy symulacje w jednym procesie dają te same
  skróty co każda osobno (także przeplatane nierówno); jedna kosztuje około 10 MB i 7–13 µs na krok (przy 8× około 0,2%
  rdzenia); pełny świat z siedzibą da się zbudować dla każdego z 20 sąsiednich kwadratów trzech dem (22–141 ms) i bot na
  nim gra; żaden bot nie przeżywa pierwszej zimy (odwołanie zarządu w dniach 13–17). Badanie zimy
  (`docs/ocena/2026-10-20-zima-w-grach-botow.md`): przyczyną jest zimna sypialnia, a koza z beczki w pokoju zarządu
  daje 5–12 dni więcej; potem grę kończy głód.

## Miejsce wśród innych projektów

- Miasto z kwadratów: etap 1 (kwadraty na mapie, mgła) zrobiony; etap 2 (chodzenie, jedna symulacja z numerami
  globalnymi) ma plan na 10 zadań, zrobione jedno; etap 3 (zwiad i odkrywanie) nie ma planu; etap 4 (teren przez
  kwadraty) też nie. Ten projekt nie czeka na etap 2 (architektura niżej), a odkrycie bierze ze zwiadu etapu 3, gdy
  powstanie, do tego czasu z pierwszego kontaktu.
- Gra sieciowa (`2026-10-19-mmo-design.md`): niezależne światy drużyn, dyplomacja w etapie 2. Osada AI to pierwsza
  „drużyna” poza graczem, zgodnie z zasadą z kierunku rozwoju: każda mechanika sieciowa ma najpierw wersję z NPC.
- Warunki zwycięstwa: osada blokuje kamień „Dziewięć kwadratów za murem” (wroga grupa w środku) i konkuruje o ludzi
  na drodze ludności. Dyplomatyczna „Federacja osiedli” zostaje na później.
- Zima: decyzja o łagodniejszej zimie dla wszystkich (więcej ciepła przez drzwi) czeka na Mateusza w dzienniku. Ten
  projekt jej nie przesądza (etap 1 zmienia tylko silnik, nie zasady).
- Miejsce na ludzi (Mateusz pytał, czy przy dużej liczbie osób nie zabraknie miejsca): osobny projekt (mieszkania na
  piętrach, płot przez jezdnię, kolejne kwadraty). Osada AI ma te same limity co my (zarząd do 12 osób, mieszkańcy
  według łóżek), więc nie rośnie ponad to, na co gra pozwala nam.

## Cele

1. Jedna osada AI w grze, na kwadracie sąsiadującym z naszym (moje: jeden z ośmiu wokół domu, kolejność kandydatów
   z ziarna gry, pierwszy, na którym da się postawić siedzibę), nieodkryta na starcie. Żyje od pierwszej minuty gry, tym
   samym tempem co my, także zanim ją odkryjemy.
2. Ta sama gra po tamtej stronie: jej osada to pełna symulacja z tymi samymi zasadami (zima, głód, koszty, badania,
   zarząd, wydarzenia), a decyzje podejmuje silnik decyzji, który wydaje te same polecenia co gracz.
3. Kontakt w obie strony. My: klik w ich budynek otwiera dyplomację, klik w ich człowieka daje rozmowę, handel,
   zaproszenie i atak, a do środka wchodzimy włamaniem albo wyważeniem drzwi. Oni: przychodzą handlować, wysyłają posła
   z propozycją, werbują wędrowców, przeszukują te same miejsca w mieście i nocą napadają, gdy mają powód.
4. Rywalizacja: zabierają ludzi i miejsca, które mogłyby być nasze, i dopóki istnieją, nie da się zamknąć dziewięciu
   kwadratów za murem.
5. Wojna ze stopniami: można ich okraść, poranić i zniszczyć część budowli, a osada dalej żyje słabsza i pamięta; można
   ich pokonać do końca, a wtedy przejmujemy teren, jeśli gra już na to pozwala, albo osada przestaje istnieć.
6. Wyważenie mierzone botami (niżej, „Bramka”).

## Nie-cele (na teraz)

- Więcej niż jedna osada AI; federacja osiedli; osada AI w grze sieciowej.
- Model językowy w pętli gry (silnik decyzji jest deterministyczny, z ziarna).
- Tryb zombie w pierwszej wersji (moje): osada AI jest w trybie zwykłym, tryb zombie dostaje ją osobnym etapem po
  pierwszej wersji (potrzebna polityka obrony przed stadem, dziś skrypt w `tools/bot-zombie.ts`).
- Wygrana osady AI (moje): jej postęp widać, ale osada nie kończy naszej gry, kiedy osiągnie którąś drogę.
- Przyłączenie osady bez walki, umową (moje): wraca z federacją osiedli. Współistnienie bez wojny (handel, pakt) jest
  w tej wersji.
- Chodzenie naszych ludzi po wszystkich kwadratach miasta (etap 2 miasta) i teren przez kwadraty (etap 4); osada
  korzysta z nich, gdy powstaną.
- Mur i kolejne kwadraty dla osady AI (rośnie w swoim kwadracie, jak my dziś).

## Anty-cele (porażka, nawet jeśli działa)

- Osada jest dekoracją: odkrywamy ją i nic się nie dzieje, dopóki sami czegoś nie zrobimy. (Mateusz: „nie byliby
  w stanie wchodzić w interakcję”.)
- Osada jest niewyważona: oszukuje (darmowe zasoby, wiedza o naszym stanie, której nie mogłaby mieć), niszczy biernego
  gracza przed połową gry, ginie sama w pierwszą zimę albo daje się pokonać jednym napadem. (Mateusz: „byliby
  niewyważeni”.)
- Ten sam zapis i to samo ziarno dają inną osadę (determinizm), albo gra bez osady ma inny skrót niż dziś.
- Start gry czeka na dane osady albo gra przestaje działać bez sieci.
- Telefon traci płynność przez drugą symulację.
- Ich ludzie mają prawdziwe nazwiska albo nazwy firm (RODO, zasady projektu).

## Jak to wygląda dla gracza (moje)

- Przed odkryciem: kwadrat pod mgłą. Od kilku dni gry pojawiają się ślady (moje: światła nocą w stronę mgły, wieść od
  wędrowca, wrak przeszukany przed nami, „ktoś tu był przed wami” na mapie miasta).
- Odkrycie: zwiad (etap 3 miasta) odsłania kwadrat i pokazuje ich siedzibę z siatką i nazwę osady. Do czasu zwiadu
  pierwszy kontakt w dniach 4–6 (z ziarna; ich handlarz albo poseł przy naszej bramie) odsłania kwadrat tak samo.
- Ich kwadrat oglądamy na żywo tylko wtedy, gdy jest tam ktoś z naszych (osobny widok z ich mapą, ich budynkami,
  siatką, światłami i ludźmi; przycisk na mapie miasta i na krawędzi mgły). Bez naszych ludzi na miejscu karta osady
  pokazuje to, co widzieliśmy ostatnio. Silnik osady wie o nas tylko tyle, ile widzieli jej ludzie. Żadna strona nie
  widzi więcej niż jej ludzie.
- Nasz człowiek idzie do nich jak na wyprawę: znika z naszej mapy, po czasie drogi pojawia się na ulicy przy ich
  kwadracie, a wraca z tym, co niesie. Ich ludzie przychodzą do nas tak samo.
- Klik w ich budynek (siedziba albo budynek przyłączony ich płotem): karta osady z nazwą, stosunkiem do nas, tym, co
  o nich wiemy (ludność, budowle, siła, z ostatniego kontaktu), umowami i przyciskami dyplomacji (moje: „Wysłać posła”,
  „Zaproponować wymianę”, „Zaproponować pakt o nieagresji”, „Zażądać daniny”, gdy jesteśmy silniejsi).
- Klik w ich człowieka przy zaznaczonym naszym: „Zagadać”, „Handlować” (ich oferty z ich prawdziwych zapasów),
  „Zaprosić do nas” (szansa jak przy werbunku, wyższa, gdy u nich głód albo niski nastrój), „Zaatakować”.
- Atak na osadę: „Włamać się” (moje: nocą, cicho, wolniej, z łomem, z szansą, że ich warta zauważy) albo „Wyważyć
  drzwi” (głośno, budzi ich i ich obronę). W środku walczymy z ich obroną na pionkach, zabieramy z ich magazynu,
  możemy zniszczyć ich budowlę (moje: „Zniszczyć warsztat”), a oni odpowiadają według pamięci.
- Ich ruchy wobec nas (Mateusz: „są jak NPC jak my”): handlarz z ich nadwyżką, poseł z propozycją albo żądaniem,
  wędrowiec, z którym rozmawialiśmy i którego nie zaprosiliśmy, idzie do nich, ich poseł namawia naszego niezadowolonego
  mieszkańca (moje), nocny napad, gdy mają powód (wrogi stosunek, głód, nasza słabość), wyprawy do tych samych miejsc
  w mieście.
- Szkody działają w obie strony tak samo (moje): ich napad może okraść, poranić, zabić i zniszczyć budowlę, tak jak
  nasz u nich.
- Drogi do zwycięstwa pokazują, że wroga osada blokuje dziewięć kwadratów, i (moje) ich postęp obok naszego.
- Koniec: osada pokonana do końca (moje: nikt z ich zarządu nie broni siedziby albo się poddają) daje wybór
  „Przejąć ich teren”, gdy gra ma już teren przez kwadraty (etap 4 miasta), a do tego czasu osada przestaje istnieć:
  budynki zostają puste, z tym, co w nich zostało, ich ludzie odchodzą albo (moje) część prosi o przyjęcie.

## Architektura (moje)

### Druga gra obok naszej

Osada AI to osobna, pełna gra na osobnym świecie: własny `World` z jej kwadratu (geo kwadratu przesunięte do środka
i zwykłe `buildWorld`, jak w rozpoznaniu), własny `SimState`, własny zarząd (`GovState`) z własnym ziarnem i silnik
decyzji zamiast gracza. Obie gry idą krok w krok w jednej pętli (przeplatanie zmierzone: te same skróty co osobno).

Dlaczego tak, a nie druga drużyna w naszej symulacji: wszystko w `SimState` jest pojedyncze (magazyn, siatka,
budowle, uchwały, mieszkania, płot, napady), a `src/sim/sim.ts` ma ponad 11 tysięcy linii pisanych pod jedną osadę.
Osobna gra dostaje te same zasady za darmo (to ten sam kod), bot wydaje te same polecenia co gracz (`sim.push`), więc
kiedyś usiądzie tam człowiek, a to ten sam kształt co niezależne światy drużyn z gry sieciowej. Nasze kwadraty
(etap 2 miasta, jedna symulacja) i obce kwadraty (osobne gry) to dwa modele, ale o wyraźnej granicy: nasz teren kontra
cudzy.

### Start osady i dane kwadratu

- Kandydaci: osiem kwadratów wokół domu w kolejności z ziarna gry; osada staje na pierwszym, który ma siedzibę według
  reguły: największy budynek mieszkalny blisko środka kwadratu, z co najmniej trzema pokojami.
- Dema: dane kwadratów są w repo. Prawdziwy adres: geo kandydata pobiera się w tle po starcie gry, kolejno, aż któryś
  się nada (kafelki z=14 w większości pokrywają się z kafelkami domu). Start gry nie czeka.
- Osada powstaje w stałym punkcie gry, o 6:00 drugiego dnia, i od razu liczy swoją grę od pierwszej minuty do tej
  chwili (około 19 tysięcy kroków, rzędu ćwierć sekundy). Przed tym punktem nic nie łączy obu gier (pierwszy kontakt
  najwcześniej w 4. dniu), więc przebieg nie zależy od tego, kiedy przyszły dane.
- Jeśli o 6:00 drugiego dnia danych nie ma (bez sieci), zapis dostaje „bez osady” i gra idzie dalej bez niej.
- Geo kwadratu osady trafia do zapisu (jak geo domu w `Save.data`), żeby wczytanie nie pobierało go od nowa: nowe dane
  zmieniłyby świat po cichu, bo `worldKey` liczy tylko liczniki.

### Silnik decyzji

Moduł w `src/ai/` (moje), bez zależności od przeglądarki: polityki z dzisiejszych botów (`tests/unit/gov-play.ts`,
`m2-play.ts`, `sasiedzi-play.ts`, `miasto-play.ts`) przeniesione bez zmiany zachowania, a nad nimi warstwa celów:
przeżyć zimę (ogrzana sypialnia, drewno na noc, jedzenie), rosnąć (przyjęcia według zapasów, łóżka, budowle),
bronić się (warta, siatka), rywalizować (werbunek, miejsca w mieście, płot) i wybierać wobec gracza (handel, pakt,
żądanie, napad) według stosunku, siły i potrzeb. „Optymalne decyzje” rozumiem jako wybór najlepszego ruchu z listy po
ocenie skutków na kilka godzin naprzód (wybór na klonie stanu zarządu kosztuje około 0,2 ms), nie jako idealną grę.
Silnik widzi tylko swój stan i to, co jego ludzie widzieli u nas.

Charakter osady z ziarna (moje: kupcy, obrońcy, łupieżcy) przesuwa wagi celów, żeby dwie gry nie były takie same.

### Ludzie między grami

- Ich ludzie u nas to pionki ze skryptem, jak dziś handlarz i szabrownik: handlarz osady, poseł, werbownik i napastnicy
  (walczą jak `zbir`, `hostileStrike`). Silnik decyduje, kto idzie, kiedy i z jaką siłą; u nas zachowują się według
  skryptu, a kto zginie, zostanie ranny albo coś niesie, wraca do ich gry z tym wynikiem.
- Nasi ludzie u nich to goście nowego rodzaju (moje): z osobą i potrzebami, prowadzeni naszymi poleceniami
  z ograniczonej listy: iść, zapukać, otworzyć, wyważyć, włamać się, przeszukać, nieść, zaatakować, zagadać, handlować,
  zaprosić, wrócić. W ich grze nie są ich ludnością ani zarządem; dla nich są obcy albo wrogowie według stosunku.
- Przejście w obie strony idzie przez kolejkę poleceń obu gier w stałym miejscu kroku, żeby kolejność nie zależała od
  klatek.

### Kontakt na istniejących mechanikach

- Drzwi, wyważenie, hałas, spotkanie: fala 2 M2 działa w ich grze dla naszego gościa tak jak u nas dla nas.
  „Włamać się” to nowe polecenie obok „Wyważyć drzwi”.
- Walka: ich obrońcy i nasi goście walczą pionkami (`startFight`, `hostileStrike`); dla obu stron druga strona staje
  się wrogiem, gdy ktoś zaatakuje albo gdy obowiązuje wojna (moje: stosunek poniżej progu).
- Handel: oferty z ich zapasów, tym samym menu co u handlarza (`Dać X za Y`), z cenami zależnymi od stosunku.
- Werbunek: szanse jak u wędrowców (`szansaWerbunku`), dla ich ludzi z ich nastroju i jedzenia.
- Napad nocą: ich silnik planuje napad w ich grze, a w naszej pojawiają się jako wrogowie przy siatce; karta nocy
  pokazuje zagrożenie od nich obok szabrowników.
- Pamięć: stosunek do nas i dziennik zdarzeń (napady, kradzieże, zabici, pomoc, umowy) w stanie ich zarządu, czytany
  przez silnik i pokazywany w karcie osady.

### Co dzielą obie gry

- Miejsca w mieście (projekt mapy miasta): jeden stan miejsc, w stanie naszego zarządu (`GovState.miasto`). Wyprawy
  osady zabierają z tych samych miejsc w stałym miejscu kroku, a karta miejsca pokazuje „ktoś tu był przed wami”.
- Wędrowcy chodzą w naszej grze; ten, z którym rozmawialiśmy i którego nie zaprosiliśmy, może przy odejściu iść do nich
  i zostać ich człowiekiem (wieść o tym w kronice).
- Dzisiejszy handlarz, obce ekipy i szabrownicy zostają niezależni od osady (moje).

### Koniec osady

- Odwołanie ich zarządu (wkurzenie 100) daje nowy zarząd, a osada żyje dalej słabsza; pustka albo exodus kończą osadę
  jak porażka bez przejęcia. W bramce to porażka silnika.
- Pokonanie przez nas: jak wyżej w „Jak to wygląda dla gracza”.

### Stan, zapis, determinizm

- Wszystko opt-in (moje: `SimOpts.osada` i flaga adresu w czasie budowy, potem domyślnie włączone), więc gra bez osady
  ma dzisiejsze skróty i stare zapisy działają.
- Zapis: stan ich gry i zarządu w zapisie gry (moje: skompresowany; 35–380 KB po 45 dniach, gzip do 46 KB), geo ich
  kwadratu i odcisk ich świata jak `worldKey`. Do czasu IndexedDB z etapu 3 miasta jeden obcy stan to rozsądny limit.
- Losowanie tylko z ziaren obu gier; ich ziarno wynika z ziarna naszej gry i numeru kwadratu.
- Wydajność: krok ich gry co krok naszej (przy 8× około 2 ms na sekundę); ich rysowanie tylko w widoku ich kwadratu.

## Kolejność budowy (moje)

Każdy etap kończy się grą, w którą da się zagrać, i bramką. Baza: `pelna-gra` przez `noc-integracja`.

1. Silnik decyzji na naszej mapie: polityki do `src/ai/`, gra prowadzona przez silnik, uprząż `npm run bot:osada`.
   Etap zmienia tylko silnik, nie zasady gry. Cel kontrolny: przeżycie 45 dni w co najmniej 4 z 5 ziaren na trzech
   demach. Na strojenie są dwa zadania; jeśli po nich cel nie jest osiągnięty, budowa staje i wynik idzie do Mateusza
   razem z możliwościami zimy z badania. Ten etap nie dotyka `src/sim/sim.ts`, więc może ruszyć od razu.
2. Druga gra: start osady i dane kwadratu, gra w tle, zapis, widok ich kwadratu, odkrycie przez pierwszy kontakt.
3. Kontakt: ludzie między grami, karta osady (dyplomacja), menu na ich człowieku, włamanie i wyważenie, walka, łup,
   zniszczenie budowli, ich ruchy wobec nas.
4. Rywalizacja i koniec: drogi do zwycięstwa, wspólne miejsca i wędrowcy, pokonanie, przejęcie albo koniec osady.
5. Wyważenie w obie strony, angielski, telefon, wydajność. Potem osobno tryb zombie.

Etapy 2 i 3 zmieniają `sim.ts`, `orders.ts`, `sasiedzi.ts` i `main.ts`, więc ruszają po scaleniu etapów 3–5 wydarzeń.
Jeśli wcześniej wejdzie etap 2 miasta, nowy kod kafelków od początku używa globalnych numerów (`src/sim/kafelki.ts`).

Szacunek: około 22–28 zadań planu (etap 1: 5–7, etap 2: 4, etap 3: 7–9, etap 4: 3, etap 5: 2–3). Wymagania wstępne są
mniejsze niż w ocenie z 19.10.2026, bo osobna gra nie czeka na chodzenie po kwadratach (etap 2 miasta).

## Bramka

- Gra bez osady: dzisiejsze skróty botów, stare zapisy działają.
- `npm run bot:osada`, N ziaren × trzy dema × 45 dni, z liczbami do strojenia (moje, punkt wyjścia):
  - osada przeżywa 45 dni w co najmniej 4 z 5 ziaren (pustka, odwołanie bez nowego zarządu albo exodus to porażka);
  - osada rośnie jak sensowny gracz: pierwszy kamień ludności (10 osób) między 8. a 15. dniem i przynajmniej jedna
    budowla na trzy dni; dokładne pasmo z pierwszych przebiegów etapu 1;
  - od odkrycia osada sama zaczyna kontakt (handlarz, poseł, werbunek, napad albo wieść o jej ruchu) co najmniej raz
    na dwa dni gry;
  - bierny bot gracza (dzisiejszy `m2Player`) z osadą nie kończy gry przed 20. dniem wcześniej niż na tym samym
    ziarnie bez osady, a bot napastnika (nowa polityka z czterema uzbrojonymi osobami, etap 4) może ją pokonać przed
    40. dniem;
  - pierwszy napad nie wcześniej niż w 5. dniu, częstość napadów nie wyższa niż szabrowników przy tym samym stosunku
    siły.
- Determinizm: ten sam przebieg z zapisem i wczytaniem w połowie daje te same skróty obu gier; przebieg nie zależy od
  chwili, w której przyszły dane kwadratu.
- Zrzuty: widok ich kwadratu, karta osady, menu na ich człowieku, włamanie, napad u nas, telefon, angielski.
- Wydajność: `npm run perf` z osadą w tle bez spadku klatek na telefonie.

## Decyzje do przejrzenia przez Mateusza

Moje rozstrzygnięcia, każde do zmiany:

1. Osobna gra zamiast drugiej drużyny w naszej symulacji.
2. Pierwsza wersja bez trybu zombie; tryb zombie osobnym etapem po niej.
3. Osada AI nie wygrywa i nie kończy naszej gry; jej postęp tylko widać.
4. Kwadrat z ośmiu wokół domu; osada powstaje o 6:00 drugiego dnia, bez sieci gra idzie bez niej.
5. Odkrycie przez pierwszy kontakt w dniach 4–6, dopóki nie ma zwiadu.
6. Ich kwadrat na żywo tylko, gdy są tam nasi ludzie; silnik osady wie o nas tylko to, co widzieli jej ludzie.
7. „Włamać się” jako nowe ciche polecenie obok „Wyważyć drzwi”; dyplomacja z posłem, wymianą, paktem i żądaniem daniny.
8. Szkody w obie strony te same: ich napad może okraść, poranić, zabić i zniszczyć budowlę.
9. Wędrowiec, którego nie zaprosiliśmy, może pójść do nich; ich poseł może namówić naszego niezadowolonego mieszkańca.
10. Odwołanie ich zarządu daje nowy zarząd zamiast końca osady.
11. Charakter osady z ziarna; pasma wyważenia w bramce; dwa zadania strojenia w etapie 1, potem decyzja.

## Do budowniczego

Liczby (czasy, szanse, ceny, progi stosunku, pasma), wygląd karty osady i widoku ich kwadratu, oznaczenie ich ludzi
(moje: opaska w kolorze osady), nazwa osady i jej zarządu (zmyślone, generator imion, bez nazw firm; moje: osiedlowa
„wspólnota mieszkaniowa” jako satyryczny rywal spółdzielni), nazwy modułów i podział zadań, sposób kompresji zapisu,
reguła poddania się.
