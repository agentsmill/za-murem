# Determinizm silników JS: pomiar z etapu 0 gry sieciowej

Stan: 19.10.2026 (noc), gałąź `mmo-fundament` od `noc-integracja` 10709d3. Projekt: `docs/superpowers/specs/2026-10-19-mmo-design.md` („Kto liczy”, „Etapy”, „Bramka etapu 0”), plan: `docs/superpowers/plans/2026-10-19-mmo-etap-0-fundament.md`. Narzędzie: `npm run determinizm` (`tools/determinizm.ts`), pojemność: `node tools/pojemnosc.ts`. Etap 0 nie zmienia `src/`, więc poprawki poniżej to lista, a nie zmiany w kodzie gry; sprawdziłem je tylko na prototypie `tools/determinizm/mat-proba.ts`, na podmianie funkcji Math w procesie botów i na kopii drzewa poza repozytorium.

## Wynik w skrócie

- Skróty stanu gry (`sim.hash()` co godzinę gry) zgadzają się we wszystkich dostępnych silnikach: Node 25, Node 24, Chromium i JavaScriptCore z macOS (jsc). Sprawdzone na trzech demach w obu trybach: 6 scenariuszy po 24 h, 18 po 72 h (trzy ziarna) i 6 po 720 h (30 dni gry). Każdy silnik liczy każdy scenariusz dwa razy w jednym procesie i za każdym razem to samo.
- Mimo to bramka daje dziś kod wyjścia **1**, bo znalazła prawdziwą rozbieżność w świecie: w Chromium `buildWorld` dla Lanciego zamienia numery dwóch garaży (40 kafelków `bid` z 147 456), więc klient w Chrome i serwer w Node widziałyby ten sam budynek pod innym numerem. Przyczyna to jedno wywołanie `Math.cos` kąta obrotu mapy (`src/world/rotate.ts:117`), które w Chromium różni się o ostatni bit, i sortowanie budynków po polu obrysu (`src/world/world.ts:221`), w którym bliźniacze garaże mają równe pola, a remis rozstrzyga szum. Skróty stanu gry przez 30 dni się od tego nie rozjechały (garaże leżą ponad 200 m od siedziby).
- Na poziomie funkcji Math różnice są duże: `hypot` w jsc różni się od V8 w 33% wywołań z gry, `atan2` w Chromium i jsc w 17%, `cos` w Chromium do 5%, `sin` do 2%. Node 24 i Node 25 liczą identycznie. Komentarz w `src/sim/house.ts:136` („Node i Chrome to ten sam V8”) nie sprawdza się dla `atan2`, `sin` i `cos`.
- Boty są wrażliwe tylko na `hypot`: błąd ostatniego bitu w każdym wywołaniu `hypot` zmienia wszystkie cztery skróty botów, a w `atan2`, `cos`, `sin`, `exp` i `log` żadnego. Zastąpienie `hypot` przez `sqrt(dx² + dy²)` w całej grze **nie zmienia żadnego z czterech skrótów botów** i zgadza V8 z jsc na kratce gry.
- Prototyp poprawki `mat-proba` (hypot jako `sqrt(dx² + dy²)`, `atan2`, `sin`, `cos` z algorytmów fdlibm na samych działaniach IEEE) z flagą `--latka=mat`: Node 24, Node 25, Chromium i jsc zgadzają się wtedy co do **całego świata** (także Lanciego) i wszystkich skrótów godzinowych w przebiegu 24 h (sześć scenariuszy), te skróty są takie same jak natywne w Node, a skróty botów się nie zmieniają.
- Firefox i WebKit z Playwright: brak (nie pobieraliśmy). Bez nich kod wyjścia przy zgodności byłby 2. Node 24 był już na maszynie (nvm), więc jest policzony naprawdę.
- Pojemność (Apple M5, maszyna obciążona przez inne sesje): świat drużyny to 9 MB pamięci, krok kosztuje średnio 1 do 5 µs (z tłumem 150 pionków 13 do 74 µs), doliczenie 8 godzin nieobecności przy 5 krokach na sekundę trwa od 0,2 do 0,8 s (z tłumem do 11 s), stan po 24 h gry to 7 do 29 KB (gzip 2 do 5 KB). Cel etapu 1 (50 drużyn zapisanych, 10 graczy naraz) mieści się z bardzo dużym zapasem: 10 światów to około 90 MB i ułamek procenta jednego rdzenia.

## Co mierzyliśmy

Jeden ustalony przebieg gry (`tools/determinizm/przebieg.ts`, czysty moduł bez `node:*` i DOM): świat z dema (`public/demo/*.json`), symulacja z zarządem 4 osób i handlarzem jak w grze, zarząd z polityką „zawsze warta” (zebranie, karta nocy z jedną osobą na warcie, wydarzenia), w kroku 0 ścięcie suchego drzewa, w drugiej dobie od 8:00 przeszukanie pierwszego pomieszczenia. Po każdej pełnej godzinie gry `sim.hash()`; osobno skrót świata zaraz po zbudowaniu (`skrotSwiata`), bo skrót stanu świata nie obejmuje, a części świata (`czesciSwiata`: kafelki, budynki, drzewa, kąt obrotu, reszta) mówią, co się rozjechało.

Nogi porównania, na maszynie Apple M5 (10 rdzeni, 32 GB), macOS 26.5, arm64:

| noga | wersja | uwagi |
|---|---|---|
| Node (bieżący) | 25.2.1, V8 14.1.146.11-node.14 | osobny proces, silnik dodatkowy |
| Node 24 | 24.16.0, V8 13.6.233.17-node.49 | z nvm (było na maszynie), wzorzec CI i obrazu serwera |
| Chromium | 156.0.8078.4 | Chrome for Testing z pamięci podręcznej Playwright 1.64.1, headless; strona `tools/determinizm/strona.html` z serwera Vite w procesie |
| jsc | JavaScriptCore z macOS 26.5 | systemowy `jsc`, ten sam silnik co Safari 26.5; przebieg zbudowany w jeden plik ES przez Vite |
| Firefox | brak | `npx playwright install firefox` (firefox-1555) |
| WebKit | brak | `npx playwright install webkit` (webkit-2370) |

Niemierzone osie: Linux (glibc i musl z `node:24-alpine`), x86_64 (serwer na Hetznerze może nie być arm64), Windows, Android. Demon Dockera nie działał, a obrazów nie pobieramy. Wyniki z Maca są więc orientacyjne dla serwera na innej architekturze; skoro Chromium i Node różnią się na tym samym Macu, platforma to prawdopodobnie nie jedyne ryzyko.

Kod wyjścia: 0 przy zgodności wszystkich silników docelowych (Chromium, Firefox, WebKit, Node 24), 1 przy rozbieżności albo niepowtarzalnym silniku, 2 przy braku silnika docelowego, 64 przy złych argumentach. Jsc i bieżący Node są silnikami dodatkowymi: liczą się do zgodności, ale ich brak nie daje kodu 2. Samotest: `--psuj=silnik:funkcja` zwiększa w jednej nodze każdy wynik funkcji o jeden bit i bramka musi to zauważyć (kod 1, funkcja, argumenty i `plik:linia`); pilnuje tego test `tests/unit/determinizm-nagrywanie.test.ts`.

## Wyniki zgodności

| zakres | scenariuszy | skróty godzinowe | świat | powtarzalność |
|---|---|---|---|---|
| 24 h, 3 dema × 2 tryby, ziarno 12345 | 6 | zgodne we wszystkich 4 silnikach | Lanciego w Chromium inny | każdy silnik 2 razy to samo |
| 72 h, 3 dema × 2 tryby × ziarna 12345, 1, 2 | 18 | zgodne | Lanciego w Chromium inny (wszystkie 3 ziarna) | tak |
| 720 h, 3 dema × 2 tryby, ziarno 12345 | 6 | zgodne | Lanciego w Chromium inny | tak |

Czas pracy bramki przy domyślnych 24 h to około 30 s (z nagrywaniem przy rozbieżności), przy 720 h około 3,5 minuty na maszynie obciążonej innymi sesjami. Skróty świata i stanu po 720 h (Node 24, ziarno 12345):

| demo | świat | skrót stanu po 720 h, zwykły | po 720 h, zombie |
|---|---|---|---|
| Przymorze | 8868a387 | 628a5992 | 22c00a7b |
| Lanciego | 79ba3f98 (Chromium: 9825877d) | aa58cb0a | f342c38c |
| Zielonki | 1603fcd6 | c85a410a | 6dd91e89 |

## Rozbieżność: świat Lanciego w Chromium

`npm run determinizm -- --demo=lanciego` w Chromium daje skrót świata 9825877d, w Node 24, Node 25 i jsc 79ba3f98. Różne części: kafelki, budynki i reszta (kąt obrotu i drzewa takie same). Tablice kafelków: `terr` i `blocked` takie same, `bid` różni się na 40 z 147 456 kafelków: 20 kafelków budynku 62 (garaż w (14..18, 70..73)) ma w Chromium numer 63, a 20 kafelków budynku 63 (garaż w (49..52, 335..340)) numer 62, czyli dwa garaże zamieniły się numerami. Siedziba stoi w (171..213, 171..205), garaże leżą 211 m i 206 m od jej środka.

Przyczyna, krok po kroku:

1. Nagranie wywołań Math z budowy świata (36 756 wywołań) pokazuje pierwszą różną wartość w Chromium w `atan2(-11, 8)` (`src/world/rotate.ts:23`, `dominantAngle`): Node daje -0.9420000403794637, Chromium -0.9420000403794636. Takich wywołań jest 697 z 4 189, ale same w sobie świata nie zmieniają.
2. Podstawiłem do Node wyniki Chromium z nagrania, po jednej funkcji: `atan2` (472 różne wywołania), `sin` (0) i `hypot` (0) nie zmieniają świata Node; **jedno** różne wywołanie `cos` zmienia go tak, że tablice kafelków i reszta są już takie jak w Chromium (zostają różne tylko pola budynków); `atan2` razem z `cos` (725 różnych wywołań) odtwarzają świat Chromium co do skrótu (9825877d). Tym jednym wywołaniem jest `Math.cos(0.43429909860511895)` w `rotateGeo` (`rotate.ts:117`), czyli cosinus kąta obrotu całej mapy: Chromium zwraca 0.9071651866575549, Node 0.9071651866575547.
3. Różnica w macierzy obrotu zmienia współrzędne wszystkich wierzchołków o rząd 1e-14, a przez to pola obrysów o rząd 1e-12. Budynki dostają numery według malejącego pola obrysu po obrocie (`src/world/world.ts:219-221`, `sort((p, q) => q.area - p.area || p.k - q.k)`), a bliźniacze budynki mają pola matematycznie równe, więc ich kolejność rozstrzyga szum. W próbie na samych polach (217 budynków w `geo` Lanciego, wyniki Chromium podstawione do Node) pięć par o równych polach zmienia kolejność: 723,5, 77, 72,125, 71,5 i 20,5 m², np. dwa budynki o polu 723,5 m² mają w Node pola 723.5 i 723.4999999999995, a po podstawieniu wyników Chromium 723.5000000000005 i 723.5000000000013, czyli odwrotną kolejność; do świata (okno 384 m) trafiła z nich para garaży 20,5 m². Numer budynku trafia do `bid`, do `buildings[id]` i do wszystkiego, co się do nich odwołuje.
4. Skróty stanu się nie rozjechały w żadnej z 720 godzin, bo oba garaże są daleko od siedziby. To sprawa szczęścia: polecenie z klienta, które mówi „budynek 62” albo „budynek 63”, znaczyłoby co innego u klienta i na serwerze.

Sprawdzone na kopii drzewa poza repozytorium (samo `src/world/world.ts:221` z porównaniem pól co do 1e-4 m²): tablice kafelków Chromium zgadzają się wtedy z Node, ale `budynki` i `reszta` dalej różnią się w polach zmiennoprzecinkowych (pole obrysu i pochodne), więc sama poprawka sortowania nie wystarcza do „świat taki sam bit w bit”. Wystarcza dopiero deterministyczna matematyka (niżej).

## Różnice na poziomie Math

Nagrane wywołania z gry (`--nagraj=0`, `--nagraj=30`, `--nagraj=60` na sześciu scenariuszach 72 h: budowa świata i godziny gry 0, 30 i 60; tam, gdzie świat Lanciego się rozjechał, nagrywana jest sama budowa świata) policzone od nowa w każdej nodze z tymi samymi argumentami; liczby to wywołania z innym wynikiem niż u wzorca (Node 24) bit w bit:

| funkcja | wywołań | Node 25 | Chromium | jsc |
|---|---|---|---|---|
| `hypot` | 522 252 | 0 | 0 | 174 660 (33,44%) |
| `atan2` | 30 442 | 0 | 5 202 (17,09%) | 5 192 (17,06%) |
| `cos` | 3 028 | 0 | 60 (1,98%) | 30 (0,99%) |
| `sin` | 3 192 | 0 | 30 (0,94%) | 2 (0,06%) |

W samej symulacji (godziny 30 i 60) wołane są tylko `hypot` (od około 700 do 40 000 razy na godzinę gry zależnie od osiedla i trybu) i `cos` (`outdoorTemp`, `src/sim/clock.ts:58`, 120 razy na godzinę w przebiegu bramki): Chromium różni się w `cos` w 5% wywołań, jsc w `hypot` w 25 do 33%. `atan2`, `sin` i reszta pojawiają się w budowie świata (`rotate.ts`, `world.ts`).

Pierwsze różne wywołania i ich miejsca (`plik:linia`): Chromium `atan2` w `src/world/rotate.ts:23` (`dominantAngle`) przy budowie świata i `cos` w `src/sim/clock.ts:58` (`outdoorTemp`, wołane z `snapshot.ts:330` przez `govInput`) w symulacji; jsc `hypot` w `rotate.ts:21` przy budowie i w `src/sim/sim.ts:7501` (`needCtx`, liczenie towarzystwa w promieniu 4 kafelków) w symulacji.

Mikro-próba `tools/determinizm/proba-matematyki.js` (2 mln liczb, `node tools/determinizm/proba-matematyki.js` albo `jsc` ze ścieżką skryptu), te same wyniki w Node 25, Node 24 i Chromium, osobne w jsc:

| próba | V8 (Node, Chromium) | jsc |
|---|---|---|
| `x ** 2` różne od `x * x` (kratka i losowe) | 0 | 0 |
| `Math.pow(x, 2)` różne od `x * x` (kratka) | 0 | 0 |
| `hypot(dx, dy)` różne od `sqrt(dx² + dy²)`, połówki całkowite w ±200 | 703 274 (35%) | 0 |
| tak samo na losowych liczbach | 761 112 (38%) | 114 675 (5,7%) |
| odległości na kratce, które są liczbą całkowitą (osie, trójki pitagorejskie) | 6 274 | 6 274 |
| z nich `hypot` nie zwraca tej liczby | **343 (5,5%)** | 0 |

Wniosek: `**` z wykładnikiem 2 jest bezpieczne w obu silnikach (V8 i jsc), natomiast `Math.hypot` w V8 jest niedokładny o ostatni bit w jednej trzeciej wywołań na kratce gry i nie zwraca nawet liczby całkowitej tam, gdzie odległość jest liczbą całkowitą (5,5% takich przypadków). Porównanie `hypot(dx, dy) <= próg` z progiem całkowitym daje więc w V8 inny wynik niż w jsc dokładnie na granicy progu, a stan gry leży na kratce, więc takie granice istnieją. W jsc `hypot` na kratce to dokładnie `sqrt(dx² + dy²)`.

## Wrażliwość stanu gry na błąd ostatniego bitu

`ZM_LATKA` w preloadzie (`node --import`) podmienia funkcję w całym procesie bota; skróty: `npm run bot` (45 dni: „Koniec” i „po 3 dobach”) i `npm run bot:zombie` (dwie polityki).

| wariant | bot | zombie |
|---|---|---|
| bez łatki | da4b24e0, dad44c81 | 18b03936, e8b7d9d5 |
| `hypot` = `sqrt(dx² + dy²)` | bez zmian | bez zmian |
| `hypot` + 1 bit w każdym wyniku | b7d1872a, 4df1c8bf (zmienione) | 3252f929, 28667a7d (zmienione) |
| `atan2`, `cos`, `sin`, `exp` albo `log` + 1 bit | bez zmian | bez zmian |
| wszystkie funkcje + 1 bit | te same co sam `hypot` | te same co sam `hypot` |
| łatka `mat` (hypot, atan2, sin, cos z `mat-proba.ts`) | bez zmian | bez zmian |

Czyli stan gry reaguje na błąd ostatniego bitu tylko tam, gdzie odległość wypada dokładnie na progu porównania (na kratce to zdarza się, jak pokazuje mikro-próba), a funkcje trygonometryczne i `exp`/`log` w botach (świat Przymorza) niczego nie zmieniają. Samotest `--psuj=…:hypot` (1 bit w każdym wyniku) rozjeżdża skróty po 1 do 3 godzinach gry w trzech z czterech sprawdzonych scenariuszy 6 h (Przymorze w obu trybach, Zielonki zombie), a w czwartym (Zielonki, tryb zwykły) nie; `cos` i `sin` w żadnym.

## Lista poprawek (uporządkowana)

Kolejność to ryzyko dla gry sieciowej podzielone przez koszt; wprowadzi je etap 2 miasta z kwadratów albo sesja zaraz po nim, bo w tym czasie `src/sim` i `src/world` przerabiają inne prace. Miejsca liczy `node tools/determinizm/spis-miejsc.ts` z drzewa składni (bez komentarzy i napisów).

1. **Świat nie może zależeć od szumu ostatniego bitu** (najwyższy priorytet: bez tego klient i serwer mogą widzieć ten sam budynek pod innym numerem). `src/world/rotate.ts` (`atan2` ×2, `sin` ×3, `cos` ×2, `hypot` ×3), `src/world/world.ts` (`hypot` ×7, sortowanie po polu l. 221), `fence.ts`, `geo.ts`, `wrecks.ts` (`hypot` po jednym). Dwie warstwy: (a) moduł `src/core/mat.ts` z `hyp`, `atan2`, `sin`, `cos` na samych działaniach IEEE, jak `tools/determinizm/mat-proba.ts` (sprawdzony: z łatką wszystkie silniki zgadzają się co do świata i skrótów, skróty botów bez zmian); (b) porównanie pól obrysu w sortowaniu co do 1e-4 m², żeby remis nie zależał od szumu (samo to zgadza tablice kafelków, ale pola zmiennoprzecinkowe budynków dalej się różnią, więc bez (a) nie ma równości bit w bit). W świecie sieciowym i tak lepiej, żeby klient nie budował świata sam: tablice kafelków (864 KB, 14 do 21 KB gzip) razem z resztą świata (23 do 31 KB gzip) to 40 do 50 KB gzip na świat, tyle co dane wejściowe `geo` (10 do 46 KB gzip), a klient i serwer mają wtedy ten sam świat z definicji. Dziś bramka bierze gotowe `geo` z `public/demo`, więc nie widzi różnic z wczytania kafelków (`toGeoT`: `cos`, `sin`, `log`, `atan`, `sinh`, `hypot` w `src/world/mvt.ts`, `osm.ts`); to kolejny scenariusz bramki do dodania (patrz niżej).
2. **`hypot` w symulacji** (40 miejsc: `sim.ts` 31, `orders.ts` 6, `gov.ts` 2, `snapshot.ts` 1). Porównania z progiem przez kwadrat odległości (`dx * dx + dy * dy <= próg * próg`, dokładne na kratce i szybsze), sortowania po odległości (`sim.ts:6845`, `gov.ts:147`) przez porównanie kwadratów, a gdzie potrzebna sama odległość `Math.sqrt(dx * dx + dy * dy)`. Wpływ na skróty botów: zero (4 z 4 bez zmian przy `hypot` = `sqrt(dx² + dy²)`); zbliża V8 do jsc na kratce (jsc daje tak samo). Zmiana mechaniczna, 40 miejsc.
3. **`outdoorTemp`** (`src/sim/clock.ts:52-58`, `sin` ×2, `cos` ×1): pogoda liczy się przy każdym odczycie stanu dla zarządu (`snapshot`, co sekundę), a Chromium różni się w `cos` w 5% wywołań. Wynik zaokrągla się do 0,1 °C, więc różnica znika poza granicą zaokrąglenia (prawdopodobieństwo rzędu 1e-15 na wywołanie), ale można to zamknąć tablicą 144 wartości doby (co 10 minut) albo `mat.cos`. Wpływ na boty: zero (1 bit w `cos` i `sin` nie zmienia skrótów). Niski priorytet.
4. **Operator `**`** (`src/sim` 33 miejsca, same kwadraty; `src/world` 6 i `src/core` 1 to `2 ** z` i `10 ** cyfry` z wykładnikiem całkowitym): w V8 i jsc daje dokładnie to co mnożenie (0 różnic na 2 mln liczb), więc ryzyko jest tylko w nieprzebadanych Firefoksie i WebKicie. Zamiana kwadratów na `x * x` jest tania i zamyka pytanie. Priorytet niski, razem z poprawką 2.
5. **Reszta w `src/world`** (wczytanie kafelków i Overpass: `mvt.ts`, `osm.ts`, `miasto.ts`, `miastoKafelki.ts`, `klucze.ts`: `sin`/`cos`/`log`/`atan`/`sinh`): klucze z kafelków są całkowite i liczone samymi działaniami dokładnymi (opis w nagłówku `klucze.ts`), ale `pikselZ` (`sin`, `log`) liczy klucze budynków i punktów z Overpass (`osm.ts:203, 217, 255`) i punktów miasta (`miasto.ts:55`); zaokrąglenie do całych pikseli (liczby rzędu 1e8) maskuje szum, więc ryzyko jest rzędu 1e-8 na wierzchołek i dotyczy tylko ścieżki zapasowej. Reszta wpływa na `Geo` w przeglądarce, czyli na to, co dostaje `buildWorld`; sprawdzić nową nogą bramki (poniżej), a poprawić razem z 1.
6. **Komentarz w `src/sim/house.ts:136`** („Node i Chrome to ten sam V8”) poprawić: Node i Chromium różnią się w `atan2`, `sin` i `cos`.
7. **Nie robić**: zaokrąglania wyników funkcji Math do 1e-9 jako „tarczy” (prawdopodobieństwo trafienia różnicy ostatniego bitu w granicę zaokrąglenia ~1e-7 na wywołanie, a w świecie jest ich dziesiątki tysięcy), ani rozwiązań, które dalej wołają natywne funkcje przestępne w ścieżce decyzji.

Dalsze rozszerzenia bramki (poza zakresem etapu 0): scenariusz „wczytanie osiedla z kafelków” (`toGeoT` z `tests/fixtures/mvt` w każdym silniku, skrót `Geo` i kluczy `zm:klucz`), uruchomienie na Linuksie w CI (`npx playwright install --with-deps chromium firefox webkit`, Node 24 z obrazu CI) i na docelowej architekturze serwera, a po wprowadzeniu `mat.ts` przestawienie testów na tę samą funkcję w grze i w bramce.

## Siatka bezpieczeństwa: koszt doczytania stanu

Z `tools/pojemnosc.ts`, stan po 24 h gry, Przymorze / Lanciego / Zielonki (tryb zwykły i zombie): JSON 7 do 29 KB, gzip 2 do 5 KB, `JSON.stringify` 0,01 do 0,06 ms, gzip 0,04 do 0,14 ms, gunzip 0,01 do 0,02 ms, `JSON.parse` 0,01 do 0,06 ms, nowy `Sim` z wczytanego stanu 4 do 6 ms, skrót stanu (`sim.hash()`, czyli `JSON.stringify` i FNV) 0,02 do 0,09 ms. Stan nie rośnie w czasie (po 1, 24 i 72 godzinach ten sam rząd). Z tłumem 150 pionków (najgorszy przypadek): JSON 68 do 131 KB, gzip 18 do 30 KB, `JSON.stringify` 0,13 do 0,22 ms, gzip 0,6 do 1,3 ms, `JSON.parse` 0,1 do 0,2 ms, `sim.hash()` 0,2 do 0,35 ms. Doczytanie stanu po rozjeździe to więc kilka kilobajtów i ułamek milisekundy po stronie serwera, a po stronie klienta kilka milisekund na odtworzenie `Sim`.

## Pojemność

Maszyna: Apple M5, 10 rdzeni, 32 GB, macOS 26.5 (Darwin 25.5.0), arm64, Node 25.2.1 (V8 14.1.146.11-node.14). **W czasie pomiaru maszyna była obciążona przez inne sesje** (średnie obciążenie 8 do 14 na 10 rdzeni; pierwszy pomiar przy 11 do 20 dał gorsze czasy i te same pamięci), więc czasy to raczej górna granica; każdy pomiar to najkrótszy z 5 przebiegów po 24 h gry. Serwer świata stanie na innej maszynie i architekturze (Node 24 w Dockerze), więc to rząd wielkości. Scenariusz: ten sam co w bramce, ziarno 12345, zarząd 4 osoby, od 15:00 dnia 1; tłum to 150 pionków za siatką (jak `?perf=150` w grze, najgorszy przypadek).

Pamięć na wczytany świat (świat, stan, `Sim`; nachylenie prostej `sterta + external` po GC dla 0 do 8 światów naraz, więc koszt stały nie wchodzi do wyniku): **8,6 do 8,8 MB w trybie zwykłym i 9,1 do 9,5 MB w trybie zombie**, w każdym demie, z tłumem i bez (świat to 384 × 384 kafelki, a większość pamięci to tablice po kafelkach w `Sim`). Budowa świata i stanu po rozgrzewce: 20 do 34 ms.

Krok symulacji z zarządem co 20. krok (tryb zwykły / zombie; p50 i p99 dotyczą kroków bez zarządu i bez skrótu; „doliczanie” to kroki na sekundę bez skrótów godzinowych, czyli prędkość leniwego doliczania świata nieobecnej drużyny):

| świat | średni krok, µs | p50 i p99 zwykłego kroku, µs | najgorszy krok | doliczanie, kroków/s |
|---|---|---|---|---|
| Przymorze | 2,7 / 5,3 | 0,25 i 13 / 2,1 i 30 | 3,8 do 4,5 ms | 367 000 / 189 000 |
| Lanciego | 2,5 / 4,9 | 0,25 i 12 / 2,2 i 24 | 4,0 do 4,4 ms | 404 000 / 204 000 |
| Zielonki | 1,4 / 2,9 | 0,13 i 3,3 / 1,2 i 7,8 | 3,7 do 5,2 ms | 738 000 / 342 000 |
| Przymorze + tłum 150 | 59 / 74 | 4,2 i 997 / 21 i 978 | 3,8 do 4,6 ms | 17 100 / 13 500 |
| Lanciego + tłum 150 | 32 / 49 | 4,3 i 404 / 21 i 420 | 3,7 do 5,2 ms | 31 600 / 20 300 |
| Zielonki + tłum 150 | 13 / 27 | 5,1 i 100 / 18 i 110 | 4,2 do 6,3 ms | 76 400 / 36 500 |

Najgorsze kroki (kilka milisekund, w każdym wierszu podobne) to pojedyncze skoki, prawdopodobnie kompilacja JIT i odśmiecanie albo obciążenie maszyny; nie sprawdzałem ich osobno. Dla porównania ze specyfikacją („około 16 MB, ułamek milisekundy na krok, 7 do 20 tysięcy kroków na sekundę”): pamięć wyszła mniejsza, a doliczanie od 13 500 (tłum 150, najcięższy) do ponad 700 000 kroków na sekundę. To jednak scenariusz pierwszych 24 godzin z zarządem czterech osób, a późniejsza gra z większą osadą, hordami i budowlami będzie droższa; liczby trzeba powtórzyć na stanie z końca gry (na przykład z bota po 45 dniach) i na maszynie docelowej.

Przeliczenie na cel etapu 1 (50 drużyn zapisanych, 10 graczy naraz, 5 kroków na sekundę świata, rekomendacja ze specyfikacji; światy nieobecnych drużyn zdjęte z pamięci i doliczane przy powrocie; w komórkach tryb zwykły / zombie):

| świat | pamięć 10 światów | CPU 10 światów | 50 zapisów (gzip) | doliczenie 8 h | doliczenie 7 dni |
|---|---|---|---|---|---|
| Przymorze | 88 / 91 MB | 0,01% / 0,03% rdzenia | 0,2 MB | 0,4 s / 0,8 s | 0,1 min / 0,3 min |
| Lanciego | 86 / 93 MB | 0,01% / 0,02% | 0,2 MB | 0,4 s / 0,7 s | 0,1 min / 0,2 min |
| Zielonki | 87 / 95 MB | 0,01% / 0,01% | 0,1 MB | 0,2 s / 0,4 s | 0,1 min / 0,1 min |
| z tłumem 150 (najgorszy przypadek) | 87 do 95 MB | 0,07 do 0,37% | 0,9 do 1,5 MB | 1,9 do 10,7 s | 0,7 do 3,7 min |

(CPU: 10 światów × 5 kroków na sekundę × średni koszt kroku; doliczanie: kroki nieobecności ÷ szybkość doliczania; zapis: stan po 24 h gry.) Wniosek: przy tej wielkości świata i tej liczbie graczy ograniczeniem nie jest ani procesor (ułamek procenta jednego rdzenia na 10 graczy, nawet z tłumem poniżej 0,4%), ani pamięć (około 9 MB na wczytany świat, 10 światów to 90 MB), ani dysk (50 zapisów to 0,1 do 1,5 MB, kopie bazy na 7 dni to kilka MB). Ograniczenia leżą gdzie indziej: determinizm między silnikami (ten raport) i moc przerobowa przy znacznie większych światach i hordach (pomiar jest z pierwszych 24 godzin).

## Czego nie sprawdziliśmy i jak to uzupełnić

- Firefox i WebKit: `npx playwright install firefox webkit` (kilkaset MB, zgoda Mateusza), potem `npm run determinizm`; kod wyjścia 2 zniknie, jeśli zgodzą się z resztą. SpiderMonkey ma własną implementację `Math.hypot` i funkcji przestępnych (nie V8, nie JavaScriptCore), więc tu rozbieżności są prawdopodobne.
- Linux i x86_64: `docker run --rm -v "$PWD":/app -w /app node:24-alpine node tools/determinizm/noga-node.ts --demo=lanciego --godziny=720 --tryb=zwykly --powtorz=1` (po pobraniu obrazu i uruchomieniu Dockera), ostatni element `skroty` powinien być aa58cb0a, a `swiat` 79ba3f98 (tabela wyżej); na CI `npm run determinizm` z Chromium, Firefoksem i WebKitem na Ubuntu.
- Wczytanie osiedla z kafelków (`toGeoT`) i klucze `zm:klucz` w każdym silniku (patrz lista poprawek, punkt 5).
- Późna gra: przebieg ma 720 godzin (30 dni, trzy pory roku), ale polityka gracza jest prosta; boty z `tools/bot*.ts` chodzą na samym Przymorzu w Node.

## Odtwarzanie

```bash
npm run determinizm                                   # trzy dema, oba tryby, 24 h; kod 0/1/2
npm run determinizm -- --godziny=72 --seed=12345,1,2  # więcej ziaren
npm run determinizm -- --nagraj=30                    # także godzina 30 gry z nagraniem Math i spisem różnic
npm run determinizm -- --latka=mat                    # z prototypem poprawki (Node, Chromium i jsc zgodne)
npm run determinizm -- --psuj=jsc:hypot --demo=zielonki --zombie --godziny=3   # samotest bramki, kod 1
npm run determinizm -- --bez-swiata                   # tylko skróty stanu
node tools/determinizm/spis-miejsc.ts --szczegoly     # miejsca z Math i ** w kodzie gry
node tools/determinizm/proba-matematyki.js            # mikro-próba ** i hypot (też: jsc ścieżka)
node tools/pojemnosc.ts --powtorz=5 [--zombie]        # pamięć, krok, zapis i wczytanie stanu, doliczanie
```
