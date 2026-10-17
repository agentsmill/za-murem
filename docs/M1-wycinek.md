# M1: pierwsza noc za siatką

Projekt techniczny i plan pracy M1. Rano 17.10.2026 był to wycinek „pierwsze trzy minuty”. Po playteście tej samej nocy Mateusz poszerzył kierunek (niżej), więc M1 kończy się pierwszą nocą, a nie rozpaloną kozą.

## Kierunek (Mateusz, noc z 17 na 18.10.2026)

- Mieszanka: trochę RimWorlda (ludzie na mapie, potrzeby, prace, wnętrza z życiem), trochę pierwszej wersji z jednym domem za dziurawą siatką (0.1 i 0.2: za dnia praca, o 20:00 decyzja o nocy, nocne napady), trochę RTS (bezpośrednie sterowanie, obrona), trochę Cywilizacji (drzewko technologii, rozrost, ścieżki i zakończenia). Lore: bakteria od miedzi. Tryb zombie, w którym obrona osady jest priorytetem, korzysta z tej samej obrony.
- Klimat postapo, a nie dzisiejsze osiedle. Żadnego tłumu obcych biegających po okolicy. Mieszkańcy siedzą w mieszkaniach i na podwórku za siatką, chodzą z konkretnym celem, nocą chowają się do środka. Obcy są rzadcy i podejrzani: szabrownicy, wędrowcy.
- Psychologia dopasowana do upadku: strach, zimno, głód, zmęczenie, żałoba, a do radzenia sobie ogień, wspólnota, warta i światło.
- Start z podstawową, dziurawą siatką wokół podwórka i siedziby, z bramą. Trzeba się chronić przed szabrownikami.
- Budowanie przemyślane: co, gdzie i dlaczego (zasady niżej).
- Przekrój wnętrza z życiem: w mieszkaniach siedziby mieszkają ludzie i widać, co robią.
- Wspólnota to ludzie, którzy radzą sobie, kiedy świat się sypie, a nie wierne odbicie dzisiejszego blokowiska.

## Co gracz robi w M1 (około 10 minut przy 1×)

1. Rano, samouczek: dach znika, w mieszkaniu 9°C, koza zimna. Gracz zaznacza kogoś z zarządu, ścina suche drzewo przy trzepaku, drewno trafia do składu, koza grzeje.
2. Dzień: koza zjada drewno, suchych drzew jest mało, w siatce są dziury, na podwórku leży gruz. Gracz wybiera, czym się zająć: drewno, łatanie siatki, gotowanie z zapasów, ognisko.
3. O 20:00 karta nocy jak w 0.1 i 0.2: kto śpi, kto trzyma wartę przy bramie, kto idzie po opał albo części (wyprawa poza mapę, z ryzykiem). Do tego pierwsza uchwała zarządu z treści 0.3, z zaufaniem i wkurzeniem.
4. Noc: prawdziwa ciemność, światło z kozy, okien i ogniska. Szabrownicy podchodzą pod najsłabsze miejsce siatki. Warta ze światłem ich płoszy, a bez warty giną zapasy i rośnie strach.
5. Rano: podsumowanie nocy na kartce, skutki dla potrzeb i nastroju, nowy dzień.

Decyzja z konsekwencją ma wypadać co najmniej raz na minutę gry przy ekranie.

## Budowanie: zasady

- Najpierw przerabia się to, co stoi. Stanowiska stawia się w pomieszczeniach, które do nich pasują: koza przy oknie (rura przez okno), kuchnia społeczna w suszarni albo w kuchni, warsztat w piwnicy albo garażu, magazyn w piwnicy, nocleg w mieszkaniu.
- Na podwórku za siatką: ognisko, skład drewna, ogródki, wiata, warta przy bramie.
- Na obwodzie: siatka (łatanie dziur), potem zasieki, potem mur. Brama jest jedynym przejściem.
- Każda budowla ma miejsce (pomieszczenie, podwórko albo obwód), koszt w materiałach z odzysku (drewno, gruz, złom, części) i pracę, którą wykonuje pionek. Tryb budowy: wybór z menu, podświetlone dozwolone miejsca, plan stawiany na mapie, pionek przychodzi i buduje.
- W M1 z budowania jest tylko łatanie siatki i ognisko. Reszta przychodzi w M2 razem z systemami z 0.3.

## Wnętrze (świat, `src/world/interior.ts`)

- W M1 przekrój ma tylko siedziba, reszta budynków zostaje bryłą z dachem. Generator działa jednak dla każdego budynku, bo później przy zbliżeniu widać wnętrze każdego zajętego budynku (decyzja Mateusza z 17.10.2026). Wnętrze wynika tylko ze świata, numeru budynku i ziarna, więc nie trafia do zapisu gry; przeróbki zarządu zapiszemy jako zmiany względem niego.
- Ściany mają grubość jednego kafelka (jak w RimWorld). Brzeg obrysu to ściana zewnętrzna, wejścia z `entrances` to drzwi frontowe.
- Blok: jedna sekcja na każdą klatkę (granice w połowie między wejściami). W sekcji trzon klatki schodowej szerokości 3 m przez całą głębokość (posadzka z lastryka, schody w głębi), po obu stronach mieszkanie. Mieszkanie dzielone pasami: pokój od strony przeciwległej fasady, przedpokój 2 m, kuchnia i łazienka od strony wejścia; drzwi z klatki do przedpokoju, z przedpokoju do pozostałych pomieszczeń.
- Dom: te same pasy bez klatki: przedpokój od wejścia, pokój, kuchnia, łazienka.
- Szablony z losowością z ziarna świata, nie losowy podział. Za płytki budynek dostaje prostszy układ (bez przedpokoju).
- Meble z reguł: w kuchni koza przy ścianie zewnętrznej z oknem, stół z krzesłami, kuchenka, lodówka na abonament (martwa); w pokoju łóżka, wersalka, meblościanka; w łazience wanna. Meble nie zastawiają drzwi.
- Mieszkanie zarządu: najbliższe pierwszym drzwiom frontowym. Tam stoi koza, a obok niej pole składu drewna. Pozostałe mieszkania siedziby to domy mieszkańców.

## Siatka i podwórko (świat, tura 2)

- Siatka obejmuje siedzibę i podwórko: obwód z odcinków, na starcie z 2–4 dziurami, i jedna brama od strony ulicy albo chodnika. Suche drzewo i trzepak są w środku.
- Podwórko to strefa za siatką, w której wolno stawiać rzeczy (ognisko, skład, ogródki, warta).
- Odcinek siatki ma wytrzymałość. Dziura przepuszcza szabrownika, a łatanie zużywa materiał i pracę.

## Rzeczy, prace i potrzeby (symulacja)

- Stan gry dostaje rzeczy (meble, drewno, koza z opałem, zapasy), ścięte drzewa, temperatury pomieszczeń i postęp samouczka. Wszystko jako zwykły JSON, deterministycznie.
- Prace pionków: idź, ścinaj drzewo, zanieś drewno do składu, dołóż do kozy, grzej się przy kozie, gotuj, jedz przy stole, śpij. Polecenia gracza: prawy przycisk na drzewie ścina, na drewnie zanosi, na kozie dokłada, gdzie indziej idzie. Bezczynny rdzeń sam dokłada do kozy, zanosi drewno, je, śpi i grzeje się, kiedy mu zimno.
- Ścięte drzewo zostawia pień i drewno (więcej z większego drzewa), zwalnia kafelek; regiony liczone od nowa.
- Koza zjada drewno. Meble z wnętrza można spalić: ciepło od razu, gorszy nastrój (szczególnie właściciela mebla).
- Temperatura na zewnątrz jak w 0.3 (pory roku po 10 dni, dobowy cykl). Pomieszczenie dąży do temperatury zewnętrznej plus izolacja; pomieszczenie z palącą się kozą do około 20°C, sąsiednie przez drzwi mniej. Start: 9°C w mieszkaniach.
- Potrzeby rdzenia: najedzenie, ciepło, siły, bezpieczeństwo, nastrój (0–100). Ciepło zależy od temperatury pod nogami. Bezpieczeństwo spada nocą na zewnątrz, w ciemności, przy obcych za siatką i przy dziurach w siatce; rośnie w środku, przy ogniu, przy innych ludziach i gdy ktoś trzyma wartę. Nastrój wynika z pozostałych.
- Mieszkańcy zamiast tłumu (tura 2): 3–8 osób w mieszkaniach siedziby z planem dnia (praca na podwórku, kolejka do kozy, sen), nocą w środku, bez biegania po całej mapie. Obcy tylko jako wydarzenie (szabrownicy, wędrowiec u bramy).
- Noc (tura 2): warta przy bramie albo przy dziurze, szabrownicy idą do najsłabszego miejsca, światło i warta ich płoszą, bez warty kradną z podwórka i składu.

## Zarząd (osobny moduł `src/gov`)

- Karta nocy o 20:00 jak w 0.1 i 0.2: przydział ludzi do snu, warty i wypraw poza mapę, wynik rano.
- Uchwały, zaufanie i wkurzenie z treści 0.3 (`src/content`), pierwsza uchwała wieczorem pierwszego dnia.
- Wydarzenia z 0.3 w tempie dobranym do nowego zegara: liczonym w minutach przy ekranie, a nie w godzinach gry.
- Moduł bez rysowania i bez zależności od wnętrza symulacji. Rozmawia z nią przez wąski interfejs (ludzie i ich potrzeby, zapasy, stan siatki, czas), a do symulacji wpina go koordynator przy łączeniu.

## Rysowanie

- Przekrój: przy zoomie od około 0,6 nad zajętymi budynkami (w M1 nad siedzibą) zamiast dachu wnętrze (posadzki, ściany z krótkim frontem, drzwi, okna, schody). Meble, drewno i pionki jako sprite'y sortowane po y. W mieszkaniach widać ludzi przy ich zajęciach.
- Ścięte drzewa znikają z kawałków mapy (przerysowanie kawałka), suche drzewo bez liści, przy nim trzepak.
- Siatka z dziurami, brama, ognisko i gruz.
- Noc: mapa światła (ciemność mnożona przez obraz), światło kozy w pomieszczeniu, z okien ogrzanych pomieszczeń i z ogniska. Szabrownicy widoczni dopiero w świetle.
- Karta osoby: paski potrzeb i co robi. Podpowiedź samouczka i znacznik na suchym drzewie. Karta nocy, uchwała i lista celów na pierwszy dzień.

## Sprawdzanie

- Testy: wnętrze na trzech adresach (każde pomieszczenie osiągalne z drzwi frontowych, koza w kuchni przy oknie, meble nie zastawiają drzwi), łańcuch drewna w symulacji od polecenia do ciepła w pokoju, determinizm z pracami, zapis i wczytanie.
- Bot mierzy minuty przy ekranie między decyzjami gracza i gra noc z wartą i bez niej.
- Zrzuty: przekrój w dzień i w nocy z kozą, siatka z bramą, karta nocy, samouczek. Nagranie 2–3 minut gry na bramkę M1.

## Podział na sesje (17.10.2026)

Pierwsza tura idzie równolegle w trzech sesjach, każda na własnej gałęzi z main (2102c65). Pliki się nie pokrywają. Koordynator łączy gałęzie w `m1-pierwsze-minuty` po bramce: testy, bot, zrzuty.

| Sesja | Gałąź | Pliki | Oddaje |
|---|---|---|---|
| Wnętrze siedziby, suche drzewo i trzepak | `m1-swiat` | `src/world/**`, testy świata | `src/world/interior.ts`, `World.interior`, `dryTree`, `props` |
| Symulacja drewna, kozy, ciepła i potrzeb | `claude/m1-symulacja-ccd058` | `src/sim/**`, `tools/bot.ts`, testy symulacji | rzeczy, prace, polecenia, ciepło, potrzeby, stan samouczka |
| Grafika zastępcza wnętrza i mebli | `claude/m1-grafika-7e0158` | nowe pliki w `src/render/art/` i `tools/` | kafelki wnętrza i sprite'y rzeczy jako czyste funkcje, arkusz podglądu |

Kontrakt wnętrza (`src/world/interior.ts`):

- `IN`: NONE, WALL, DOOR, STAIRS, FLOOR. Posadzka wynika z rodzaju pomieszczenia.
- `Room { id, kind, apt }`: id równe indeksowi w `rooms`, rodzaje klatka, przedpokoj, pokoj, kuchnia, lazienka, apt -1 dla klatki.
- `Furniture { kind, x, y, w, h, rot }`: rodzaje koza, stol, krzeslo, kuchenka, lodowka, lozko, wersalka, mebloscianka, wanna. `rot` to ściana, przy której mebel stoi (0 góra, 1 prawo, 2 dół, 3 lewo), w i h po obrocie.
- `Interior { building, cell, room, rooms, doors, windows, furniture, sklad, home }`: tablice size×size, `room` -1 poza pomieszczeniami, `windows` to kafelki ścian zewnętrznych z oknem, `home` to mieszkanie zarządu.
- `buildInterior(w, bid, opts)` dla dowolnego budynku. Koza, skład i mieszkanie zarządu tylko przy `home: true`.
- `World` dostaje `interior`, `dryTree` (indeks w `trees`) i `props` (trzepak 3×1 m). `blocked` wnętrza to 1 tylko dla ścian i schodów.

Do połączenia symulacja pracuje na atrapie wnętrza zgodnej z kontraktem, a grafika na nazwach z kontraktu. Polecenia przyjmuje tylko zarząd, tłum to tło (GDD).

Kontrakt siatki (tura 2, decyzja koordynatora z nocy 17/18.10, zgodna ze sprite'ami z `src/render/art/podworko.ts`):

- `World.fence: { tiles: number[]; hole: number[]; gate: { x, y, w, h, rot }; yard: number[] }`. `tiles` to kafelki siatki bez bramy (rosnąco), `hole` to kafelki z dziurą na starcie (podzbiór `tiles`, 2–4 sztuki, rozrzucone, nie przy bramie), `gate` to brama 2×1 albo 1×2 w linii siatki, a `rot` to strona otwierania skrzydeł, czyli w stronę podwórka. `yard` to kafelki podwórka za siatką bez budynków (rosnąco).
- Siatka obejmuje siedzibę i podwórko z suchym drzewem i trzepakiem. Brama stoi od strony ulicy albo chodnika przed pierwszym wejściem. Siatka może dochodzić do ścian budynków.
- `blocked`: kafelki siatki 1, dziury 0 (przełazi się), brama 0 (otwieranie i zamykanie trzyma symulacja w swojej kopii `blocked`).
- Stan zmienny (wytrzymałość, łaty, nowe dziury, otwarta brama) jest w stanie symulacji, nie w świecie. Rysowanie bierze `thingSprite({ kind: 'siatka', mask, state, post })`, gdzie maska to sąsiedzi N/E/S/W będący siatką, bramą albo ścianą budynku, a `state` to `'cala' | 'dziura' | 'lata'` ze stanu symulacji.
- Deterministycznie z ziarna świata.

Dalsze tury:

- Tura 1b (od nocy 17.10): zarząd w `src/gov` (karta nocy, uchwały, zaufanie, wkurzenie, wydarzenia) w osobnej sesji. Do sesji symulacji i grafiki dopisane: koza zjada drewno, palenie mebli, bezpieczeństwo; siatka, brama, ognisko i gruz w grafice.
- Tura 2 (po połączeniu tury 1, na gałęzi z workerem kawałków, który jest na main od adcf075): świat dostaje siatkę z bramą i strefę podwórka; symulacja mieszkańców zamiast tłumu, noc z wartą, wyprawami i szabrownikami, łatanie siatki i ognisko; rysowanie przekroju z życiem, nocy i światła.
- Tura 3: interfejs (karta osoby, menu pod prawym, karta nocy, uchwała, cele, samouczek), zrzuty, nagranie i bramka M1.
