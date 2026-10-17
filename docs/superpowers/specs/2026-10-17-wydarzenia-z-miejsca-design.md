# Wydarzenia z miejsca: projekt

Stan: projekt do przeczytania przez Mateusza, 17.10.2026. Nic z tego nie jest jeszcze zbudowane.

Źródła: uwagi Mateusza po graniu 17.10.2026, analiza puli wydarzeń na trzech demach i na domu w Zamościu (notatka `wydarzenia.md` w folderze notatek sesji, skrypt `wydarzenia-demo.ts` obok niej), sekcja Lore w `docs/GDD.md`, projekt mieszkańców z adresu (`docs/superpowers/specs/2026-10-17-mieszkancy-z-adresu-design.md` na gałęzi `mieszkancy-z-adresu`), zasady w `CLAUDE.md`.

Oznaczenia: „Mateusz” przy decyzji znaczy, że ustalił to Mateusz. „Moja decyzja” znaczy, że to założenie projektującego, które Mateusz może zmienić. Reszta wynika z kodu albo z zasad repo.

## Po co

Mateusz po graniu: „ta wspólnota jest taka trochę naciągana. Zacząłem w domu, nagle jakieś wydarzenie z automatem mi się odpala”. I zaraz potem o domu w Zamościu: „mam trochę za bardzo vibe blokowiska, da się to wypośrodkować?”.

Dziś 32 wydarzenia zarządu (19 z 0.3 i 13 nowych) losują się tylko według pory dnia. Dom w Zielonkach i dom w Zamościu dostają ten sam zestaw co falowiec na Przymorzu: pani z trzeciego piętra, wesele na klatce, automat przy pawilonie, którego na mapie nie ma, czynsz dla spółdzielni. W domu mniej więcej połowa wydarzeń z pierwszych 15 minut wprost nie pasuje, jedna trzecia potrzebuje zmiany słowa, a bez zmian pasuje jedno na siedem. Przy tempie 1× pierwsze wydarzenie zawsze wpada w samouczek, kiedy gracz czeka, aż kuchnia się nagrzeje.

## Cele

- Wydarzenie mówi tylko o tym, co gracz może zobaczyć na mapie: blok obok tylko tam, gdzie stoi blok, sklep tylko tam, gdzie jest sklep, sąsiedzi z klatki tylko w bloku z mieszkańcami.
- Start w domu jednorodzinnym ma klimat ulicy domów, a nie blokowiska: dom, ogród, płot, garaże, sąsiedzi zza płotu.
- Pierwszy dzień uczy gry bez przypadkowych przerywników; wydarzenia wynikają z sytuacji.
- W bloku gra zostaje taka, jak jest, z poprawką oczywistych błędów.

## Poza zakresem

- Pliki innych sesji fali 1: `src/sim`, `src/render`, `src/ui`, `src/main.ts`. Teksty i liczby stamtąd są na liście dla koordynatora na końcu.
- Sąsiedzi jako pionki w innych domach i spotkania z obcymi w innych budynkach: sesja „Włamania do sąsiednich budynków i wspólny płot”. Wydarzenia z obcymi mogą z niej później brać.
- Ludzie z adresu, rodziny, kronika osiedla i filtr nazw miejsc z imieniem i nazwiskiem: sesja „mieszkańcy z adresu”. Wydarzenia mogą później brać z niej ludzi i miejsca.
- Prawdziwe nazwy sklepów i miejsc z OSM w tekstach wydarzeń. Wymagają filtra nazw z osobą (`nazwaMiejsca` w `src/mieszkancy/kronika.ts` na gałęzi mieszkańców), więc na razie wydarzenia mówią o kategorii: sklep, przychodnia, garaże.
- Zmiana częstotliwości wydarzeń po pierwszym dniu (moja decyzja): zostaje jak jest, co 38–56 s przez pierwsze 10 minut, potem co 100–180 s.

## Czego nie chcemy, nawet jeśli działa

- Wydarzenie o czymś, czego na mapie nie ma (pawilon w Batowicach, blok obok domu w szczerym polu).
- Pierwszy dzień bez żadnej decyzji przez ponad minutę.
- Zmiana choćby bajtu w treści 0.3 w `src/content` (pilnuje jej test zgodności z 0.3 w node:vm).
- Teksty, które przypinają postać do piętra albo numeru mieszkania (zasada RODO z projektu mieszkańców: tylko klatka).

## Twarde ograniczenia

- Symulacja i zarząd deterministyczne, uruchamialne w Node. Zarząd nie importuje `src/sim`.
- Treść 0.3 zostaje bajt w bajt; przeróbki są w warstwie zarządu (`src/gov`).
- Zapis gry zarządu ma wersję 1; nowe pola w stanie są opcjonalne, stary zapis się wczytuje.
- Bramka: `npm test`, `npm run lint`, `npm run build`, `npm run bot`, `npm run shots`, zrzuty obejrzane.
- Adres domu w Zamościu nie trafia do repo ani do commitowanych zrzutów. W dokumentach „dom w Zamościu”.

## Ustalone z Mateuszem (17.10.2026)

1. Nazwa wspólnoty: w domu ulica zamiast spółdzielni i komitet ulicy zamiast zarządu. W bloku wszystko po staremu, spółdzielnia i zarząd (Mateusz: „tak tak ma być”).
2. Pierwszy dzień: dopóki kuchnia się nie nagrzeje, bez losowych wydarzeń. Zamiast nich jedno z sytuacji: koza się rozpala, ktoś widzi dym i przychodzi (w bloku sąsiadka z klatki, w domu sąsiadka zza płotu). Do wieczora pierwszego dnia tylko wydarzenia o siatce i nadchodzącej nocy, satyra na technikę od drugiego dnia (Mateusz: „Tak, pierwszy dzień ma tak wyglądać”).

## 1. Opis miejsca

Zarząd dostaje opis miejsca policzony raz ze świata (`src/gov/miejsce.ts`, funkcja `placeOf(world)` z pamięcią na obiekt świata, bez importu kodu z `src/world`, tylko typów):

| Pole | Skąd | Do czego |
|---|---|---|
| `kind: 'dom' \| 'blok'` | siedziba z klasą `dom` albo z jednym mieszkaniem we wnętrzu to dom, reszta to blok | słownik wspólnoty, warianty tekstów |
| `blocks`, `houses`, `near: 'bloki' \| 'domy' \| 'nikt'` | bloki i domy w promieniu 120 m od środka siedziby; `near` to rodzaj, którego jest więcej (przy remisie według siedziby), a `nikt`, gdy w promieniu nie ma żadnego budynku mieszkalnego | „blok obok” czy „dom obok”; przy `nikt` wydarzenia z sąsiadami, także dym z komina, nie przychodzą (moja decyzja: samotny dom w polu nie ma sąsiada zza płotu) |
| `shop` | odległość do najbliższego sklepu: budynek klasy `sklep` albo punkt z kategorią handlową, do 300 m; `null`, gdy brak | automat paczkowy i podobne |
| `garages` | najbliższe garaże do 150 m albo `null` | „za garażami” czy „za płotem” |
| `clinic` | przychodnia albo apteka do 300 m albo `null` | wydarzenie o przychodni |
| `tower` | najwyższy budynek do 200 m, z którego widać siedzibę: blok od 5 pięter („z dachu bloku naprzeciwko”, od 9 pięter „z dachu wieżowca”), szkoła, kościół („z wieży kościoła”), hala, sklep od 1000 m² („z dachu marketu”), albo `null` | „Ktoś was obserwuje” |

Odległości na liczbach całkowitych (kwadrat odległości zamiast `Math.hypot`), żeby wynik był ten sam w każdej przeglądarce (moja decyzja, za uwagą w `docs/POSTEP.md`).

Liczby na czterech miejscach z analizy: Przymorze i Lanciego to blok z blokami obok, sklepem, garażami i szkołą; Zielonki to dom z domami obok, garażem i przychodnią, bez sklepu w zasięgu; dom w Zamościu to dom z domami obok (47 domów i jeden niski blok w promieniu 120 m, więc sąsiedzi to domy), sklepem 68 m i przychodnią 40 m.

Wejście: nowe opcjonalne pole `GovInput.place`. Bez niego zarząd zakłada blok z blokami obok, sklepem i garażami, czyli dzisiejsze zachowanie (atrapa w testach, stare zapisy). W grze pole wypełnia `govInput()` w `src/sim/gov.ts`: `place: placeOf(w)`. Koordynator się zgodził (17.10.2026): na tej gałęzi w tym pliku tylko import i to jedno pole, nic więcej; `govInput` woła też bot w Node. Ilu ludzi zarząd wie już dziś (`people`, `residents`, `cap`).

## 2. Słownik wspólnoty

`wordsOf(place)` w `src/gov/miejsce.ts`, obok `placeOf`, daje słowa według miejsca. To kontrakt także dla innych sesji (prośba koordynatora z 17.10.2026): po połączeniu tej gałęzi sesje fali 1 zamienią swoje teksty z listy na końcu na ten słownik, a do tego czasu ich nie ruszam. Bez opisu miejsca słownik daje blok.

| Klucz | blok | dom | Przykład użycia |
|---|---|---|---|
| `wspolnota` (M, D, w czym) | spółdzielnia, spółdzielni, w spółdzielni | ulica, ulicy, na ulicy | „Sprawy spółdzielni”, „w spółdzielni zmieści się więcej ludzi” |
| `zarzad` (M, D, N, krótko) | zarząd, zarządu, zarządem, zarząd | komitet ulicy, komitetu ulicy, komitetem ulicy, komitet | „Prowadzicie zarząd spółdzielni”, „Zebranie zarządu, dzień 2”, „To wasz zarząd” |
| `Zarzad` (wielką literą, M) | Zarząd | Komitet ulicy | „Zarząd odłożył uchwałę na później.” |
| `walne` (M) | walne | zebranie ulicy | „walne odwoła zarząd” |
| `naglowek` | Na osiedlu | Na ulicy | nagłówek okna wydarzenia |
| `mieszkancy` (M, D) | mieszkańcy, mieszkańców | sąsiedzi, sąsiadów | „Wkurzenie mieszkańców (0–100)” |
| `sasiad` (skąd) | z waszej klatki, z bloku obok | zza płotu, z domu obok | wydarzenia z sąsiadami |

Dokładne nazwy pól w kodzie zostają budującemu; tabela mówi, jakie słowa i formy słownik musi mieć. Z niego korzystają też teksty zarządu: kronika („Zebranie zarządu przy kozie: pierwsza uchwała.”, „Zarząd odłożył uchwałę na później.”, „Uchwała zarządu: …”), karta nocy („Zarząd nie zdążył się naradzić…”), opisy uchwał („klucz ma tylko zarząd”) i wydarzenia.

## 3. Tempo pierwszego dnia (Mateusz)

- Cisza: pierwszego dnia, dopóki kuchnia pierwszy raz nie dojdzie do 18°C, nie ma losowych wydarzeń. Zarząd rozpoznaje to sam z `kitchen` w wejściu. Bez kuchni (świat bez wnętrza, `kitchen` równe `null`) ciszy nie ma. Najpóźniej o 18:00 pierwszego dnia cisza się kończy, nawet jeśli kuchnia jest zimna (moja decyzja).
- Dym z komina: kiedy koza pierwszy raz się pali (`kozaLit`), po 20 s przy ekranie przychodzi wydarzenie „Dym z komina”. Raz na grę. To dawne „Słoik od sąsiadki” z nowym początkiem i z tymi samymi wyborami i skutkami: przy 1× wypada około 60 s, w środku czekania na ciepło (moja decyzja co do 20 s, po pomiarze na czterech miejscach: tak od poleceń samouczka do dymu i od dymu do pierwszego wydarzenia po ciszy mija najwyżej około minuty).
- Po ciszy pierwszego dnia, aż do pierwszego raportu rano, tylko wydarzenia pierwszej nocy: o siatce, o obcych za płotem i o nocy. Pierwsze po ciszy najwcześniej 10 s po nagrzaniu kuchni i 20 s po poprzedniej decyzji (moja decyzja, żeby nie zderzyło się z nowym celem samouczka).
- Od drugiego dnia cała pula z warunkami miejsca.

Wydarzenia pierwszej nocy (moja decyzja, z regułą Mateusza): ślady przy siatce, latarka na korbkę, ktoś was obserwuje, wędrowiec, pies, hałas, krzyk, bezsenność, światło w oknie, kot, ulewa, przymrozek, a w nocy także pożar od kozy i kradzież z piwnicy (tylko z mieszkańcami). Te dwa były w M1 od początku; bez nich noc przy tempie 1× nie dawała decyzji w każdej minucie (bramka M1). Satyra na technikę i ludzie spod bramy od drugiego dnia.

Decyzja co minutę w pierwszych 10 minutach zostaje: przy 1× polecenia samouczka w pierwszych sekundach i rozpalenie kozy około 40 s, dym około 70 s, pierwsze wydarzenie po ciszy około 115 s (w Zamościu, gdzie kuchnia grzeje się dłużej, około 135 s), następne około 160 s, uchwała 180 s, karta 200 s, w nocy jedno, dwa, raport około 267 s, potem dzień drugi z wydarzeniem co 38–56 s. Sprawdzamy to na prawdziwej symulacji (pomiar na czterech miejscach: najdłuższa przerwa bez decyzji w pierwszych 10 minutach przy 1×) i testem z kuchnią, która grzeje się stopniowo. Atrapa w `tests/unit/gov-atrapa.ts` zostaje bez zmian (zapala kozę i ma 18°C w tej samej chwili, o 17:00), a test „decyzja zarządu w każdej minucie od drugiej do dziesiątej” na niej zostaje.

## 4. Jak powstają warianty

Wydarzenia z 0.3 biorą z `src/content/events.ts` losowanie danych, wybory i skutki, jak dziś. Zarząd nakłada na nie w `src/gov` (moja decyzja co do mechanizmu):

- warunek miejsca i dnia (np. automat tylko ze sklepem, od drugiego dnia);
- własny tytuł i tekst dla domu, czasem także dla bloku;
- własne napisy na przyciskach wyborów (po numerze wyboru; skutki zostają z 0.3);
- zamianę zwrotów we wpisach do kroniki z tego wydarzenia (np. „w świetlicy” na „na półce przy kozie”);
- dwie poprawki dla wszystkich miejsc: „Opał N” z 0.3 na „Drewno N”, jak w reszcie gry, i „ognisko” na „kozę”, kiedy ogniska jeszcze nie ma.

Gdzie skutek z 0.3 nie ma w domu sensu (dokwaterowanie czterech aktywistów do domu bez wolnych mieszkań), wariant dla domu ma własny skutek bez dokładania ludzi. Nowe wydarzenia M1 z `src/gov/tresc.ts` dostają warianty wprost w swoich funkcjach tekstu.

## 5. Pula: co z każdym wydarzeniem

„Pierwsza noc” to wydarzenia dozwolone pierwszego dnia po ciszy i pierwszej nocy. Reszta od drugiego dnia. Słowa o własnym budynku (klatka, mieszkanie, świetlica, spółdzielnia) biorą się z rodzaju siedziby, a słowa o sąsiadach (blok obok, dom obok, zza płotu) z tego, jakich sąsiadów jest więcej (`near`), więc kolumna „Blok” opisuje blok wśród bloków, a „Dom” dom wśród domów. Sąsiedzi „z waszej klatki” tylko w bloku z mieszkańcami; w bloku bez nich przychodzą z bloku obok (moja decyzja).

| Wydarzenie | Warunek | Blok | Dom |
|---|---|---|---|
| handlarz | od 2. dnia | „pod bramą” zamiast „pod szlabanem”, drewno | to samo |
| dzieci | od 2. dnia | bez zmian, gdy sąsiedzi to bloki | gdy sąsiedzi to domy: „z sąsiednich domów… taczkę blach i rur z rozbiórki szopy” |
| lodówka na abonament | od 2. dnia | bez zmian | „W domu obok, u sąsiadów, którzy wyjechali w 2048 roku…” |
| dron | od 2. dnia | bez zmian | „Nad ulicą…”, bez garaży „spadł w ogrodzie sąsiadów”, „maskotką ulicy” |
| automat paczkowy | od 2. dnia, sklep w okolicy | bez zmian | „przy sklepie”, „zbiega się pół ulicy”, „Zabrać do szopy komitetu” |
| auto na aktualizację | od 2. dnia | bez zmian | „Na podjeździe u sąsiadów…” |
| czynsz za 2047 | od 2. dnia | „Spalić list w kozie” | rata kredytu: „list z banku: zaległa rata kredytu za dom z 2047 roku plus odsetki i opłata za upomnienie. Sąsiedzi pytają, czy komitet ulicy też będzie zbierał składki”; wybory „Ogłosić, że komitet składek nie zbiera” i „Spalić list w kozie”, skutki jak w czynszu |
| tokeny | od 2. dnia | bez zmian, drewno | gdy sąsiedzi to domy: „Sąsiad zza płotu…” |
| karton z książkami | od 2. dnia | bez zmian | „Na strychu…”, „Na półkę przy kozie” |
| protest przeciw kozom | od 2. dnia | „Zaprosić do ciepła” bez dokwaterowania (punkt 5a) | „z sąsiedniej ulicy… przeciw dymowi z waszego komina”; tak samo bez dokwaterowania |
| influencerka | od 2. dnia | dołącza do zarządu bez dodatkowego mieszkańca | „Przyjąć do domu” |
| ludzie pod bramą | od 2. dnia, waga według wolnych miejsc (punkt 5a) | „pod bramą”, „Wolnych miejsc w bloku: N”, przyciski z liczbą na podłodze | rodzina 2–4 osób spod furtki, „W domu nie ma wolnych łóżek…”, rzadko |
| ktoś się na czymś zna | od 2. dnia, w bloku tylko z mieszkańcami | „przy kozie” zamiast „przy ognisku”; mieszkaniec przechodzi do zarządu | „Sąsiad zza płotu… przyznał przy kozie…”, dołącza do domowników |
| kłótnia o grafik | od 2. dnia | bez zmian | „Reszta domu słucha zza ściany”, „Mediacja przy stole”, „wyprowadził się na inną ulicę” |
| pożar od kozy | pierwsza noc, koza się pali | bez zmian | „zajęła się podłoga w kuchni, dym idzie na cały dom”, „Uciekać do ogrodu” |
| kradzież z piwnicy | pierwsza noc, tylko z mieszkańcami | bez zmian | nie ma (bez mieszkańców złodziejem byłby ktoś z domowników) |
| wesele na klatce | wyjęte z M1 | nie ma | nie ma; wróci z parami z generatora mieszkańców |
| ktoś chce odejść | od 2. dnia, zaufanie poniżej 35 | bez zmian | „na sąsiedniej ulicy jest lepiej”, „wyprowadził się z ulicy” |
| ktoś was obserwuje | od 13:00, pierwsza noc | z dachu najwyższego budynku z opisu miejsca, „na wasz blok” | to samo, „na wasz dom”; bez wysokiego budynku „zza krzaków na końcu ulicy” |
| wędrowiec | pierwsza noc | bez zmian | bez zmian (klucz ma komitet) |
| ślady przy siatce | pierwsza noc | bez zmian | bez zmian |
| pies | pierwsza noc | bez zmian | bez zmian |
| hałas | pierwsza noc | za garażami, gdy są garaże, inaczej za płotem | to samo |
| krzyk | pierwsza noc | z bloku obok, gdy sąsiedzi to bloki | gdy sąsiedzi to domy: „Krzyk z domu obok… w oknie na piętrze” |
| bezsenność | pierwsza noc | bez zmian | „kroki na strychu” |
| światło w oknie | pierwsza noc | bez zmian, gdy sąsiedzi to bloki | gdy sąsiedzi to domy: „W domu naprzeciwko, w oknie na poddaszu…” |
| kot | pierwsza noc | „Algorytm ma nowy dom” zamiast „Kot z ogłoszenia się znalazł” | „Z szopy…”, „łapie myszy w szopie” |
| ulewa | pierwsza noc | bez zmian | bez zmian |
| przymrozek | pierwsza noc, tylko przy temperaturze na dworze do 1°C | „Sąsiadka z waszej klatki” zamiast „z drugiego piętra” | „Sąsiadka zza płotu… u niej w domu” |
| latarka na korbkę | pierwsza noc | „Pani Halina z waszej klatki” | „Pani Halina zza płotu”, „po ciemnych piwnicach i garażach” |
| domofon | od 2. dnia | bez zmian | „Wideodomofon przy furtce…”, „Bezpieczny Dom” |
| słoik od sąsiadki | staje się dymem z komina | „pani Krysia z waszej klatki” | „pani Krysia zza płotu… u niej w domu” |

## 5a. Przyjęcia i wolne miejsca

Po połączeniu symulacji fali 1 przyjęci przychodzą zza bramy i nie znikają, a kto nie ma łóżka, śpi na podłodze z karą do sił i nastroju. Wydarzenia przyjmowały bez patrzenia na miejsca: w grze z zarządem po 6 dniach było 16–20 mieszkańców przy 6 miejscach (prośba koordynatora z 17.10.2026). W domu miejsc dla mieszkańców nie ma wcale (`cap` 0), więc każdy przyjęty śpi na podłodze.

- Wolne miejsca to `cap − residents` z wejścia zarządu.
- Tekst wydarzenia z przyjęciem zawsze mówi, ile jest wolnych miejsc, a przycisk mówi wprost, ilu będzie spać na podłodze: „Przyjąć tylu, ilu się zmieści (3)” i „Przyjąć wszystkich (5 będzie spać na podłodze)”. W domu: „W domu nie ma wolnych łóżek, spaliby na podłodze w kuchni”.
- Mniej takich wydarzeń, kiedy jest ciasno: waga razy 1 przy co najmniej 4 wolnych miejscach, razy 0,5 przy 1–3, razy 0,15 bez wolnych miejsc (moja decyzja co do liczb).
- Ludzie pod bramą: w bloku grupa 4–12 osób jak w 0.3; w domu rodzina 2–4 osób spod furtki, rzadko, bo dom zawsze jest pełny. To zastępuje wcześniejsze „w domu nie ma”.
- Protest przeciw kozom: „Zaprosić do ciepła” znaczy, że aktywiści grzeją się do rana i odchodzą, bez dokwaterowania czterech osób (moja decyzja, mniej źródeł przyjęć).
- Poprawka podwójnego liczenia: osoba, która dołącza do rdzenia (influencerka, fachowiec wśród ludzi spod bramy), nie dokłada jeszcze jednego mieszkańca. „Ktoś się na czymś zna” w bloku to mieszkaniec, który przechodzi do zarządu (mieszkańców o jednego mniej), w domu sąsiad zza płotu, który dołącza do domowników.
- Liczenia łupu z napadu w `src/gov/noc.ts` nie ruszam (koordynator rozdzieli magazyn z symulacją później).

## 6. Nowe wydarzenia

Teksty to pierwszy zestaw do przeczytania przez Mateusza (ton satyry ustala on). Wszystkie od drugiego dnia, raz na grę, chyba że zaznaczone inaczej. Skutki w jednostkach zarządu.

- Dym z komina (oba miejsca, z sytuacji, opis w punkcie 3). Blok: „Nad kuchnią idzie dym z rury wystawionej przez okno. Ktoś go zobaczył: puka pani Krysia z waszej klatki, ze słoikiem powideł z 2049 roku. Pyta, czy może posiedzieć przy kozie, bo u niej w mieszkaniu jest sześć stopni.” Dom: „Nad dachem idzie dym z komina. Ktoś go zobaczył: do drzwi puka pani Krysia zza płotu, ze słoikiem powideł z 2049 roku. Pyta, czy może posiedzieć przy kozie, bo u niej w domu jest sześć stopni.” W bloku bez mieszkańców sąsiadka przychodzi z bloku obok.
- Jabłka (oba, tylko jesienią, w dzień). Dom: „Dom za płotem stoi pusty od lat, a jabłonie w jego ogrodzie uginają się od antonówek.” Blok: „Na skwerze między blokami stare jabłonie uginają się od antonówek. Nikt ich nie zbiera.” Wybory: „Zebrać, ile się da” (jedzenie 4, ktoś traci siły), „Podzielić się z sąsiadami” (jedzenie 2, zaufanie +2).
- Kury sąsiadów (dom, gdy jest dziura w siatce): „Przez dziurę {gdzie} weszły do ogrodu trzy kury sąsiadów. Jedna zniosła jajko pod schodami.” Wybory: „Odnieść kury i jajko” (zaufanie +2), „Zatrzymać jajko” (jedzenie 1, wkurzenie +1), „Załatać dziurę (Złom 2)”.
- Robot koszący (dom): „W ogrodzie obok od 2048 roku jeździ robot koszący. Trawnik ma równy jak w reklamie, ale co godzinę piszczy, że trzeba zaktualizować mapę ogrodu.” Wybory: „Rozebrać na części” (części 2; „W środku silnik pod lakierem, cały, i akumulator w żywicy. Reszta kabli zielona od bakterii.”), „Niech kosi” (zaufanie +1, wkurzenie −1).
- Szopa po sąsiedzie (dom): „W szopie w ogrodzie obok wiszą narzędzia i leży stos suchych desek. Sąsiad wyjechał do syna w 2034 roku i już nie wrócił.” Wybory: „Zabrać deski na opał” (drewno 3), „Zabrać narzędzia na złom” (złom 3), „Zostawić, to nie nasze” (zaufanie +1).
- Spór o płot (dom, gdy są domy obok): „Sąsiad zza płotu przyszedł z mapą z geodezji z 2019 roku. Mówi, że wasza siatka stoi metr na jego działce, i chce ją przesunąć jeszcze dziś.” Wybory: „Przesunąć siatkę o metr” (zaufanie +1, wkurzenie +1), „Dać mu drewno na zgodę (Drewno 2)” (zaufanie +2), „Powiedzieć, że geodeta już nie przyjedzie” (zaufanie −1, wkurzenie −1).
- Panele u sąsiada (dom): „Na dachu domu obok panele dalej łapią słońce, bo ogniwa zalane szkłem przeżyły bakterię. W garażu falownik miga na czerwono: «Wymagana aktywna subskrypcja».” Wybory: „Rozkręcić falownik na części” (części 2), „Zostawić, przyda się, kiedy znajdzie się elektryk” (zaufanie +1; „Na drzwiach garażu kartka: «Nie ruszać. Prąd będzie.»”).
- Kartka na przychodni (oba, gdy w okolicy jest przychodnia albo apteka): „Na drzwiach przychodni wisi kartka: «Rejestracja tylko przez aplikację». Od 2041 roku nikt jej nie zdjął, a w środku podobno zostały apteczki.” Wybory: „Wysłać kogoś po apteczki” (leki 1, ktoś traci siły), „Nie ryzykować”.

Rata kredytu jest wariantem czynszu dla domu (tabela wyżej), a nie osobnym wydarzeniem.

## 7. Uchwały, wyprawy i kronika w domu

- Uchwały (opisy z `src/gov/tresc.ts`, nazwy części z 0.3): w domu „Warty przy furtce” zamiast „Warty na klatkach”, „Zebrania przy kozie” zamiast „Zebrania na klatkach”, „Furtka na kłódkę od 20:00” zamiast bramy, „klucz ma tylko komitet”, „Meble idą do kozy bez pytania domowników” zamiast „Meble z pustych mieszkań”. W bloku bez zmian. Liczby uchwał bez zmian.
- Cele wypraw na karcie nocy: „opuszczone mieszkania w bloku obok” tylko z blokami obok, w domu „opuszczony dom obok”; „garaże za trzepakiem” jako „garaże obok” albo w domu bez garaży „szopy w ogrodach obok”; „pawilon handlowy” w domu jako „sklep przy głównej drodze”. Ryzyko i łup bez zmian.
- Zapasowe nazwy dziur w siatce bez „bloku obok” w domu.
- Kronika według słownika z punktu 2.
- Zakończenia gry, które M1 może dać (odwołanie, exodus, pustka), są w 0.3 o walnym, klatkach, świetlicy i czynszu. Zarząd wystawia ich wersje dla domu (moja decyzja co do tekstu, do przeczytania przez Mateusza): „Zebranie ulicy odwołało komitet. Wkurzenie przelało się przez płoty. Sąsiedzi zebrali się przy furtce i odwołali was przez aklamację. Nowy komitet zaczął od wymiany kłódki.”; „Ulica opustoszała. Ludzie przestali wierzyć, że z wami przetrwają. Dom po domu odchodzili na inne ulice. Zostały puste ogrody i list z banku o racie kredytu z 2047 roku.”; „Nikt nie przeżył. Ostatni domownik zgasił kozę. Ulica stoi pusta, a dron dostawczy dalej krąży nad dachem.” Okno końca gry jest w `src/ui/okna.ts`, więc podpięcie idzie na listę dla koordynatora.

## 8. Zapis, determinizm, wydajność

- Nowe pola stanu zarządu, opcjonalne: kiedy kuchnia pierwszy raz się nagrzała, kiedy koza pierwszy raz się paliła. Stary zapis bez nich działa jak gra, w której cisza się skończyła. Wersja zapisu zostaje 1.
- Opis miejsca nie trafia do zapisu: liczy się ze świata, który odtwarza się z danych osiedla.
- `placeOf` przegląda budynki i punkty raz na świat (pamięć w `WeakMap`), więc wołanie co sekundę nic nie kosztuje.

## 9. Jak sprawdzamy

- Przyjęcia: bot po 6 dniach nie ma już mieszkańców kilka razy ponad miejsca tylko z wydarzeń; test, że tekst i przyciski mówią o wolnych miejscach i o spaniu na podłodze, a waga spada przy ciasnocie.
- Testy jednostkowe: `placeOf` na trzech demach (Przymorze i Lanciego blok, Zielonki dom bez sklepu); w domu żaden tytuł, tekst, przycisk ani wpis kroniki z wydarzeń nie zawiera „klatk”, „piętr”, „blok”, „spółdziel”, „pawilon”, „szlaban”, „świetlic”, „czynsz” (przegląd wszystkich wydarzeń na wielu ziarnach i godzinach); w samouczku nie ma losowych wydarzeń; dym przychodzi raz po rozpaleniu kozy; pierwszego dnia i pierwszej nocy tylko wydarzenia pierwszej nocy; decyzja co minutę w pierwszych 10 minutach na atrapie; test zgodności 0.3 bez zmian.
- Pomiar: skrypt z analizy na czterech miejscach przed i po (ile wydarzeń w 15 minutach, ile w samouczku, ile nie pasuje do domu, najdłuższa przerwa bez decyzji w pierwszych 10 minutach). Skrypt zostaje w folderze notatek, a dane domu w Zamościu tylko w scratchpadzie sesji, poza repo (moja decyzja).
- Bot: `npm run bot` bez błędów.
- Zrzuty na końcu listy w `tools/shots.ts`: okno „Dym z komina” w bloku (Przymorze) i w domu (Zielonki), okno wydarzenia drugiego dnia w domu i karta nocy w domu z celami wypraw. Wymagają linijki z opisem miejsca w `govInput()`.

## Lista dla koordynatora: poza src/gov

Do zrobienia przez sesje fali 1 według ustalonej nazwy (w domu ulica i komitet ulicy, w bloku spółdzielnia i zarząd), ze słownikiem `wordsOf(place)` z punktu 2. Koordynator rozda to po połączeniu tej gałęzi. Pole `place: placeOf(w)` w `govInput()` dopisuję sam na tej gałęzi, za zgodą koordynatora. Rodzina domowników i sąsiedzi z ulicy jako ludzie w symulacji to decyzja koordynatora na później, razem z generatorem mieszkańców i sesją włamań.

- `src/sim/gov.ts`: powód nastroju „Sprawy spółdzielni”.
- `src/ui/cele.ts`: „Wyślijcie go do suchego drzewa przy trzepaku.” W domu bez trzepaka.
- Świat (`props`): trzepak przy suchym drzewie także w ogrodzie domu; w domu coś z ogrodu (sznur na pranie, kompostownik, psia buda, huśtawka).
- `src/ui/siatka.ts`: nazwa dziury „za trzepakiem”.
- `src/ui/okna.ts`: nagłówek okna wydarzenia „Na osiedlu” (w domu „Na ulicy”), „Zebranie zarządu, dzień N, 19:30”, pomoc „Prowadzicie zarząd spółdzielni w 2051 roku. Czterech ludzi…” i „walne odwoła zarząd”; okno końca gry w domu z tekstami zakończeń dla domu, które wystawi zarząd.
- `src/ui/pasek.ts`: „Wkurzenie mieszkańców (0–100). Przy stu walne odwoła zarząd.”
- `src/main.ts`: pierwsza podpowiedź „To wasz zarząd…”.
- `src/sim/budowle.ts`: „w spółdzielni zmieści się więcej ludzi”.
- `src/sim/sim.ts` (`createSim`): w domu zarząd to czterech obcych i zero mieszkańców. Propozycja: domownicy jako rodzina 3–5 osób (generator mieszkańców) i 4–8 sąsiadów z 2–3 najbliższych domów (sesja włamań i wspólnego płotu), reszta ulicy, 8–12 domów jak w GDD, liczona.
- `src/content` i świat: sklep w dzielnicy domów nazywa się „Pawilon nr…” (klasa `sklep` w `CLS`).
- `index.html`: „spółdzielnia po upadku”, „Adres twojego osiedla”, „Wczytaj osiedle”. Szyld całej gry; moim zdaniem zostaje.

## Co zostaje dla budującego

Podział na pliki w `src/gov`, kształt nakładek na wydarzenia z 0.3, dokładne progi odległości (do sprawdzenia na czterech miejscach), brzmienie drobnych zamian słów, układ testów i scenariuszy zrzutów.
