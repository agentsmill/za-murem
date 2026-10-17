# M1, wycinek „pierwsze trzy minuty”: projekt techniczny

Co ma zobaczyć gracz (z GDD): dach siedziby znika, w mieszkaniu jest 9°C, koza stoi zimna. Zaznacza kogoś z zarządu i klika suche drzewo przy trzepaku. Ta osoba idzie, rąbie, drewno ląduje na ziemi, ktoś zanosi je do składu przy kozie, koza się rozpala, w mieszkaniu robi się ciepło, nocą w oknie świeci, ludzie zbierają się przy kozie.

## Wnętrze siedziby (świat, `src/world/interior.ts`)

- W M1 wnętrze ma tylko siedziba, reszta budynków zostaje bryłą z dachem. Generator działa jednak dla każdego budynku, bo później przy zbliżeniu widać wnętrze każdego zajętego budynku (decyzja Mateusza z 17.10.2026). Wnętrze wynika tylko ze świata, numeru budynku i ziarna, więc nie trafia do zapisu gry; przeróbki zarządu zapiszemy jako zmiany względem niego.
- Ściany mają grubość jednego kafelka (jak w RimWorld). Brzeg obrysu to ściana zewnętrzna, wejścia z `entrances` to drzwi frontowe.
- Blok: jedna sekcja na każdą klatkę (granice w połowie między wejściami). W sekcji trzon klatki schodowej szerokości 3 m przez całą głębokość (posadzka z lastryka, schody w głębi), po obu stronach mieszkanie. Mieszkanie dzielone pasami: pokój od strony przeciwległej fasady, przedpokój 2 m, kuchnia i łazienka od strony wejścia; drzwi z klatki do przedpokoju, z przedpokoju do pozostałych pomieszczeń.
- Dom: te same pasy bez klatki: przedpokój od wejścia, pokój, kuchnia, łazienka.
- Szablony z losowością z ziarna świata, nie losowy podział. Za płytki budynek dostaje prostszy układ (bez przedpokoju).
- Meble z reguł: w kuchni koza przy ścianie zewnętrznej z oknem, stół z krzesłami, kuchenka, lodówka na abonament (martwa); w pokoju łóżka, wersalka, meblościanka; w łazience wanna. Meble nie zastawiają drzwi.
- Mieszkanie zarządu: najbliższe pierwszym drzwiom frontowym. Tam stoi koza, a obok niej pole składu drewna.

## Rzeczy, prace i potrzeby (symulacja)

- Stan gry dostaje rzeczy (meble, drewno, koza z opałem), ścięte drzewa, temperatury pomieszczeń i postęp samouczka. Wszystko jako zwykły JSON, deterministycznie.
- Prace pionków: idź, ścinaj drzewo, zanieś drewno do składu, dołóż do kozy, grzej się przy kozie, jedz przy stole, śpij. Polecenia gracza: prawy przycisk na drzewie ścina, na drewnie zanosi, na kozie dokłada, gdzie indziej idzie. Bezczynny rdzeń sam dokłada do kozy, zanosi drewno, je, śpi i grzeje się, kiedy mu zimno.
- Ścięte drzewo zostawia pień i drewno (więcej z większego drzewa), zwalnia kafelek; regiony liczone od nowa.
- Temperatura na zewnątrz jak w 0.3 (pory roku po 10 dni, dobowy cykl). Pomieszczenie dąży do temperatury zewnętrznej plus izolacja; pomieszczenie z palącą się kozą do około 20°C, sąsiednie przez drzwi połowę tego. Start: 9°C w mieszkaniach.
- Potrzeby rdzenia: najedzenie, ciepło, siły, nastrój (0–100). Ciepło zależy od temperatury pod nogami, nastrój od pozostałych.

## Rysowanie

- Przekrój: przy zoomie od około 0,6 nad zajętymi budynkami (w M1 nad siedzibą) zamiast dachu wnętrze (posadzki, ściany z krótkim frontem, drzwi, okna, schody). Meble, drewno i pionki jako sprite'y sortowane po y.
- Ścięte drzewa znikają z kawałków mapy (przerysowanie kawałka), suche drzewo bez liści, przy nim trzepak.
- Noc: mapa światła (ciemność mnożona przez obraz), światło kozy w pomieszczeniu i z okien pomieszczeń z ogrzaniem.
- Karta osoby: paski potrzeb i co robi. Podpowiedź samouczka i znacznik na suchym drzewie.

## Sprawdzanie

- Testy: wnętrze na trzech adresach (każde pomieszczenie osiągalne z drzwi frontowych, koza w kuchni przy oknie, meble nie zastawiają drzwi), łańcuch drewna w symulacji od polecenia do ciepła w pokoju, determinizm z pracami, zapis i wczytanie.
- Zrzuty: przekrój w dzień i w nocy z kozą, samouczek. Nagranie 2–3 minut gry na bramkę M1.

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

Druga tura przychodzi po połączeniu, na gałęzi z workerem kawałków (jest na main od adcf075). Najpierw rysowanie przekroju: warstwa wnętrza przy zbliżeniu, meble i rzeczy jako sprite'y sortowane po y z pionkami, ścięte drzewa znikają z kawałków, noc i światło. Potem karta osoby, polecenia prawym przyciskiem i samouczek na ekranie. Na koniec zrzuty i nagranie na bramkę M1.
