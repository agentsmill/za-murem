# Surowce i gospodarka na mapie: wraki, noszenie łupu, warsztat

Projekt sesji „Surowce” z 18.10.2026, na gałęzi `m2-surowce` od `pelna-gra` (c110956). Mateusz zgodził się na kierunek w rozmowie, ale tego dokumentu jeszcze nie czytał: kolejność kawałków przekazała sesja „Pilnowanie agentów”, kiedy był na spacerze. Rozstrzygnięcia są moje, do zmiany przez niego. Wszystko zostaje lokalnie, bez pusha.

## Po co

Mateusz 18.10.2026: „na razie to mogę iść i kosić drzewo, ale nic więcej nie mogę zrobić”. Chce, żeby za dnia ludzie przeszukiwali samochody i budynki, zbierali surowce i przerabiali obiekty na surowce, „by rzeczywiście dało się tę ekonomię napędzać”, a do tego handlarza i obcych, których widać na mapie, nie da się nimi sterować, ale można z nimi coś zrobić albo ich zaatakować.

Na `pelna-gra` fala 1 M2 dała już przeszukiwanie pustych mieszkań siedziby, rozbiórkę mebli i śmieci, budowle i przybyszów. Brakuje dwóch rzeczy:

- Za siatką poza drzewami nic się nie da zrobić. Wraki maluchów i polonezów to dekoracja.
- Nie ma przeróbki. Warsztat tylko przyspiesza łaty i daje więcej z rozbiórki. Drewno idzie wyłącznie do kozy, złom nie zamienia się w części, więc kuchnia społeczna (10 części) zależy od szczęścia przy przeszukiwaniu.

Sąsiednie budynki robi fala 2 (gałąź `m2-fala-2`, `docs/M2-fala-2.md`), więc tu ich nie ma.

## Cele

- Wrak da się przeszukać, a potem rozebrać. Przeszukanie jest krótkie i daje drobiazgi, rozbiórka trwa, hałasuje i daje dużo złomu. Z rozebranego zostaje szkielet.
- Łup spoza siatki trzeba donieść na podwórko. Przeszukujący robi to sam, kurs za kursem.
- Warsztat przerabia drewno na deski i złom na części. To pierwszy wybór między ciepłem dziś a budową jutro.
- Sterty części i leków są widoczne na mapie (dziś leżą w stanie, ale się nie rysują).

## Poza zakresem

- Sąsiednie budynki, drzwi, lokatorzy, wspólny płot: fala 2.
- Handlarz i obcy w dzień: następny kawałek tej sesji, z osobnym projektem.
- Nowe obiekty w świecie (hulajnogi, rowery, paczkomaty, Tesla z blokadą subskrypcji): etap 1c niżej, tylko jeśli starczy czasu po bramce 1a i 1b.
- Priorytety pracy i zlecenia, które bezczynny zarząd bierze sam: zakładka Praca z planu M2.

## Czego nie wolno

- Zmiany przebiegu gry bez nowych funkcji. `npm run bot` i `npm run bot:zombie` mają dać te same skróty co `pelna-gra`. Dlatego żadnych nowych blokujących rzeczy w świecie, bezczynny zarząd nie dostaje nowych zajęć, a nowe pole stanu powstaje dopiero przy pierwszym użyciu.
- Losowania z `st.rng`. Łup z wraku liczy się z ziarna gry i kafelka wraku, tak jak łup z pomieszczenia w fali 1, więc nie przesuwa innych losowań.
- Rozjazdu z falą 2. Sterty to `Thing` z `kind` równym `Mat` z `src/sim/budowle.ts`, noszenie ma kształt polecenia z planu fali 2 (`{ t: 'carry'; ids; thing }`).

## Wraki

Świat bez zmian: `World.props` z `kind: 'wrak'`, `model: 'maluch' | 'polonez'`, podstawa 3×2 albo 4×2, blokuje przejście. Na trzech adresach testowych stoi ich 4–5, do 33 m od drzwi siedziby.

Stan: `SimState.wraki?: { t: number; s: 1 | 2; w?: number }[]`, gdzie `t` to lewy górny kafelek wraku, `s` 1 przeszukany, 2 rozebrany, `w` praca przy rozbiórce w tickach (z łomem tick liczy się podwójnie), rosnąco po `t`. Pola nie ma, dopóki ktoś nie skończy pierwszego przeszukania.

Polecenia w menu pod prawym przyciskiem na kafelku wraku albo tuż obok (tylko zarząd):

| polecenie | kiedy | czas | hałas | łup |
|---|---|---|---|---|
| Przeszukać wrak | nieprzeszukany | 30 min gry | 3 m | z tabeli niżej |
| Rozebrać wrak | przeszukany | maluch 2 h, polonez 2,5 h, z łomem w rękach o połowę krócej | 20 m co 2 s | maluch 6 złomu i 1 część, polonez 8 złomu i 1 część, z warsztatem półtora raza więcej jak przy meblach |

- „Przeszukać wrak” jest domyślnym poleceniem na samym aucie. Na kafelku tuż obok jest w menu, ale kliknięcie znaczy tam „Idź tu”, żeby chodzenie obok auta nie zamieniało się w przeszukanie. „Rozebrać wrak” tylko z menu, bo trwa długo i hałasuje.
- Przerwana rozbiórka pamięta postęp (`w`), jak plany budowy, i po następnym poleceniu idzie dalej.
- Łup z przeszukania: maluch części 1 (60%), złom 1–2 (50%), leki 1 (15%, apteczka w schowku), jedzenie 1–2 (10%, konserwy w bagażniku); polonez części 1–2 (70%), złom 1–2 (60%), leki 1 (15%), jedzenie 1–2 (15%). Części, bo przetrwało to, co szczelne: alternator i rozrusznik pod lakierem.
- Rozebrany wrak zostaje na mapie jako szkielet i dalej blokuje, więc przechodniość się nie zmienia.
- Pracuje się z kafelka obok wraku, który zarząd osiąga. Tylko jedna osoba na wraku naraz.
- W trybie zombie hałas rozbiórki ściąga szwendaczy, tak jak strzał. To jest cena złomu.

## Noszenie łupu

- Łup z wraku spada w sterty obok wraku (jak `dropMat`). Przeszukujący od razu niesie go na podwórko: bierze do 6 sztuk jednego materiału, idzie na wolny kafelek podwórka najbliżej bramy, kładzie, wraca po resztę, aż przy wraku nic nie zostanie.
- Polecenie „Zanieść na podwórko” na każdej stercie materiału za siatką robi to samo dla sterty i jej sąsiadów do 3 m. Domyślne polecenie na takiej stercie.
- Przerwanie (nowe polecenie albo pilna potrzeba: głód, zimno, zmęczenie) zostawia resztę tam, gdzie leży. To, co w rękach, upada pod nogi, jak przy innych pracach. Jak wszystkie prace z polecenia gracza, wrak, noszenie i warsztat nie przerywają się same nocą ani przy wrogu na podwórku: w trybie zombie nocna rozbiórka to ryzyko gracza.
- Łup kładzie się na podwórku od bramy w głąb, z dala od kafelków przy bramie, dziurach, drzwiach i wejściach, na sterty tego samego rodzaju (do 10 sztuk) albo na wolne kafelki.
- Drewno ma już swoje noszenie do składu (`haul`), więc „Zanieść na podwórko” dotyczy desek, złomu, części, leków i jedzenia.
- Sterty za siatką liczą się do zapasów jak dziś drewno za siatką. Fala 2 doda swoją regułę dla stert we wnętrzach sąsiadów.

## Warsztat

Na zbudowanym warsztacie (`Thing` z `kind: 'warsztat'`) menu ma cztery polecenia:

| polecenie | wejście | wyjście | czas za sztukę |
|---|---|---|---|
| Piłować deskę | 2 drewna | 1 deska | 20 min gry |
| Piłować 5 desek | to samo pięć razy | | |
| Zrobić część ze złomu | 2 złomu | 1 część | 1 h gry |
| Zrobić 5 części | to samo pięć razy | | |

- Wzór jak przy dzidzie: osoba idzie do warsztatu i pracuje, a materiał zużywa się dopiero na końcu każdej sztuki ze stert, do których dojdzie. Przerwana praca niczego nie zjada. Gotowa sztuka spada obok warsztatu.
- Liczy się cały materiał, także sterty, które ktoś właśnie niesie do składu. Drewno bierze najpierw z wolnych stert spoza składu, potem ze składu. Gdy materiał jest akurat w czyichś rękach w drodze do składu, piłujący czeka przy warsztacie. Gdy materiału zabraknie, praca się kończy.
- Pierwsze polecenie robi jedną sztukę, drugie tyle, na ile starczy materiału, najwyżej 5 („Piłować 4 deski”, „Zrobić 3 części ze złomu”). Polecenia widać tylko przy materiale na co najmniej jedną sztukę, drugie przy materiale na dwie.
- Proporcje to moje liczby na start (złom na części jak w 0.3, dwa do jednego).

## Rysowanie

- Wrak w trzech stanach: cały (jak dziś), przeszukany (zdjęte obie pokrywy, widać komorę silnika i pusty bagażnik), szkielet (rdzawa rama, bez szyb, drzwi, zderzaków i bloku silnika). Rozmiar i kotwica sprite'a nie zależą od stanu. Widok bierze stan z `st.wraki` (`ThingLike.stage`).
- Sterty części (alternator, przy większej akumulator z klemami i rozrusznik) i leków (czerwona apteczka samochodowa, pudełka z krzyżem, karton z apteki) w trzech wielkościach jak inne sterty. Przed tą zmianą `czesci` i `leki` z przeszukiwania mieszkań leżały w stanie, ale się nie rysowały.
- Pozy: przeszukanie wraku na kolanach, rozbiórka i warsztat z młotkiem, noszenie łupu jak noszenie materiału na budowę.

## Interfejs

- Tylko przez `commandsAt` i `jobText` w `src/sim/orders.ts`, które interfejs już pokazuje, i podpowiedzi po poleceniu w `src/main.ts`. Opisy prac: „Przeszukuje wrak.”, „Rozbiera wrak.”, „Idzie po łup.”, „Niesie łup na podwórko.”, „Piłuje deski (jeszcze 3).”, „Robi części ze złomu (jeszcze 2).”.
- Nowe napisy w nowym module `src/sim/surowce.ts` w obu językach (`{ pl, en }`), a do menu idzie na razie `pl`, bo warstwę tłumaczeń robi sesja angielska.

## Kontrakt

- `src/sim/surowce.ts`, czyste dane i funkcje: tabele łupu wraków (`wreckLoot(model, rnd)`, `wreckRng(seed, tile)`), czasy i łup rozbiórki, przepisy warsztatu (`RECIPES: Record<'deski' | 'czesci', { from: Mat; n: number; work: number }>`), napisy (`NAPISY`), `wrecksOf(w)`, `wreckAt(w, tile)` (wrak pod kafelkiem albo obok), `wreckTile(r, size)`, `wreckStage(st.wraki, t)`.
- Polecenia: `{ t: 'wreck'; ids; tile: number; how: 'szukaj' | 'rozbierz' }`, `{ t: 'carry'; ids; thing: number }`, `{ t: 'saw'; ids; what: 'deski' | 'czesci'; n: number }`.
- Prace: `wreck` (cel: lewy górny kafelek wraku, `what`: sposób), `carry` (cel: sterta, `from`: kafelek, przy którym zbiera sterty, `n` i `what`: w rękach), `saw` (cel: warsztat, `what`: produkt, `from`: ile sztuk zostało, `n` zawsze 0, żeby nic nie upadło przy przerwaniu). Wszystkie trzy przerywa pilna potrzeba jak prace fali 1.
- `carry` ma kształt z planu fali 2 (Task 4) i jest do wzięcia przez nią: fala 2 może wołać `carryOn` z kafelkiem w cudzym budynku, a regułę „sterta u sąsiada nie jest nasza” dołożyć w `lootNear`.
- Stan: `SimState.wraki?` jak wyżej. Bez nowych pól w `Pawn` i `Thing`.

## Testy i bramka

- Testy jednostkowe w `tests/unit/surowce.test.ts`: przeszukanie wraku raz i ten sam łup przy tym samym ziarnie; rozbiórka dopiero po przeszukaniu, szkielet blokuje dalej; łom skraca rozbiórkę o połowę; hałas rozbiórki w `st.noise`; łup trafia na podwórko; „Zanieść na podwórko” na stercie za siatką; warsztat robi deskę z dwóch drewien, przerwana praca nic nie zjada, bez materiału polecenia nie ma; zapis i wczytanie w trakcie rozbiórki dają ten sam skrót; bez nowych poleceń stan nie ma pola `wraki` i skrót jest jak przed zmianą.
- Boty bez flag z tymi samymi skrótami co `pelna-gra`. Do tego `npm run bot:surowce` (`tools/bot-surowce.ts`): pięć dni z graczem fali 1, z wrakami i warsztatem (jedna osoba z zarządu od dnia 2 na surowcach), to samo z rąbaniem drzew na deski i bez surowców. To raport, a nie bramka: recenzja projektu pokazała, że kuchnia społeczna i tak stoi w czwartej albo piątej dobie na samym przeszukiwaniu mieszkań, więc „do czwartej doby z wrakami, a bez nich nie” nie dało się sprawdzić bez ruszania liczb fali 1.
- Zrzuty: wrak w trzech stanach, sterty części i leków, menu wraku, menu warsztatu. Obejrzane w Chromium.
- Testy, Biome, build, oba boty, lokalny commit. Bez pusha.

## Co pokazał bot (18.10.2026, Przymorze, ziarna 11–15, 5 dni)

| wariant | budowle do dnia 5 | po 5 dniach deski | złom | części |
|---|---|---|---|---|
| bez surowców (gracz fali 1) | 5,0 (4–6) | 17,4 | 42,2 | 7,6 |
| wraki i warsztat, jedna osoba na surowcach | 5,4 (5–6) | 11,8 | 55,6 | 20,8 |
| to samo i drzewa na deski | 5,4 (5–6) | 9,2 | 44,0 | 13,8 |

- Wraki i warsztat dają prawie trzy razy więcej części i trochę szybszą budowę. Kuchnia społeczna nie wychodzi wcześniej, bo osoba przy wrakach nie przeszukuje wtedy mieszkań: wąskim gardłem są ludzie, a nie materiał.
- Złomu jest za dużo już bez wraków (42 po pięciu dniach), a rozbiórka wraku dokłada 6–8. Deski są wąskim gardłem. Do decyzji: mniej złomu z rozbiórki, więcej rzeczy, które zjadają złom (zasieki, barykady z wraków z badań 0.3), albo coś rzadszego z wraku (akumulator na prąd w M3).

## Etap 1c, jeśli starczy czasu

Porzucone hulajnogi elektryczne i rowery z wypożyczalni rozrzucone po chodnikach i trawnikach całej mapy, dalej niż 40 m od siatki, 12–24 sztuki, z własnego ziarna. Leżą, więc nie blokują i nie zmieniają dróg. „Rozebrać hulajnogę”: 20 min, 1 część i 1 złom (ogniwo w szczelnej obudowie przetrwało). „Rozebrać rower”: 20 min, 2 złomu. Znikają po rozebraniu. Dzięki nim okolica się wyczerpuje i z czasem trzeba chodzić dalej.

## Następny kawałek: obcy w dzień i handlarz

Kierunek z rozmowy, do osobnego projektu: za dnia po mapie chodzą postaci, którymi gracz nie steruje (handlarz, wędrowcy, inne ekipy szabrujące te same wraki). Z handlarzem można się wymienić przy bramie, każdego można zagadać albo zaatakować. Atak daje łup od razu, ale kosztuje zaufanie, a handlarz przestaje przychodzić. Stoi na szkielecie szabrownika (przyjście od krawędzi, podejście pod siatkę, ucieczka rannego, worek) i na nadmiarze, który daje ten kawałek.
