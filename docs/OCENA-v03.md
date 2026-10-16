# Ocena wersji 0.3 „Za Murem: spółdzielnia po upadku”

Data: 16.10.2026. Ocena robiona przed przejściem do Claude Code.

## Krótko

W tej formie bym w to nie grał. Wpisałbym adres, poszukał swojego bloku, przeczytał gazetkę i po pięciu minutach zamknął kartę. Hak jest świetny, treść jest śmieszna, symulacja trzyma się kupy. Ale świat jest martwy: patrzę na plan osiedla i klikam przyciski w panelu. Nie widzę swoich ludzi i nie mogę im nic kazać.

## Jak to sprawdziłem

- Strona na żywo (agentsmill.github.io/za-murem) w Chromium 1440×900, adres „Obrońców Wybrzeża 4, Gdańsk”. Mapa wczytała się w 2,4 s z kafelków OpenFreeMap.
- Gra puszczona na 4× przez 25 s, potem noc i panele. Zrzuty w `docs/ocena/`.
- Zrzut Mateusza z osiedla domków (`05-domki-zrzut-mateusza.png`).
- Wersja 0.2 (`stare/za-murem-v02.html`) dla porównania sterowania.

## Co działa i zostaje

1. Hak z adresem. Wpisujesz swoją ulicę i za 2-3 sekundy grasz na swoim osiedlu. Kafelki OpenFreeMap są główną drogą, Overpass zapasową. To najmocniejsza rzecz w projekcie i powód, dla którego ktoś to komuś wyśle.
2. Ton i treść. 24 wydarzenia (lodówka na abonament, auto czekające na aktualizację, czynsz za 2047, influencerka survivalowa), drobne ogłoszenia, gazetka „Głos Klatki”, lore 2051. Satyra jest celna i nie przegina.
3. Szkielet symulacji. Pory roku po 10 dni, temperatura i ogrzewanie (kozy, węzeł), jedzenie, choroby, zaufanie i wkurzenie, uchwały z wykluczającymi się ścieżkami (Porządek, Wspólnota, Technokracja), wiedza od fachowców i z książek, 6 zakończeń. Bot przechodzi 26 do 45 dni bez rozjazdu.
4. Gazetka jako obrazek PNG do udostępnienia.
5. Fachowcy z zawodem, cechami i umiejętnościami (zrzut 07). Gotowy materiał na postacie.

## Co nie działa

1. Nie ma na co patrzeć. Mieszkańcy to liczby: „Mieszkańców 78, do pracy 48, wolnych 48”. Na mapie rusza się tylko dym i kropki ekip. W RimWorld połowa przyjemności to oglądanie, jak ludzie żyją. Tu tego nie ma wcale.
2. Fachowcy istnieją tylko w panelu. Ryszard Nowak, elektryk z bloku 51K, ma cechy i umiejętności, ale nie da się go zobaczyć, znaleźć na mapie ani wysłać ręką do roboty (zrzut 07).
3. Brak bezpośredniego sterowania. Każda decyzja to przycisk z kosztem. W 0.2 zaznaczało się człowieka, klikało stertę gruzu i on szedł ją rozbierać (zrzut 06). Mateusz właśnie tego brak czuje najbardziej.
4. Mapa wygląda jak plan, nie jak miejsce. Kafelek ma 4 m, więc blok to szary prostokąt z paskiem fasady, a dom to czerwona plama (zrzuty 02 i 05). Nie ma klatek, balkonów, trzepaka, garaży, ławek ani śmietnika. Bloki ustawione ukośnie mają schodkowe krawędzie. Ulice wyglądają jak ciemne rzeki.
5. Przybliżenie prawie nic nie daje. Grafika jest narysowana w jednej skali, więc z bliska widać te same plamy, tylko większe (zrzut 03).
6. Nie widać dnia i nocy. O 22:00 mapa jest odrobinę ciemniejsza i tyle (zrzut 04). Noc nie zmienia tego, co dzieje się na ekranie.
7. Słaby początek. Najpierw ściana tekstu, potem lista „pierwszych kroków” do odhaczenia. Brakuje od razu ludzkiego problemu pokazanego na mapie: zimno w mieszkaniu, ktoś głodny, ktoś puka do bramy.
8. Skala ludzi. Na osiedlu jest 78 do 140 osób. W RimWorld jest 3 do 20 pionków. Sto pionków sterowanych ręcznie to męczarnia, sto liczb w panelu to arkusz kalkulacyjny. Potrzebne są dwie warstwy ludzi (opis w GDD).
9. Czas jest za szybki na pionki. Teraz godzina gry trwa 2,5 s przy 1×. Przy ludziach chodzących po mapie trzeba zegar zwolnić mniej więcej piętnastokrotnie.

## Co wziąć z kodu (3072 linie, vanilla JS, bez bundlera)

| Plik | Linie | Co z nim zrobić |
|---|---|---|
| `js/mvt.js` | 320 | Przenieść prawie bez zmian. Dekoder kafelków wektorowych, sklejanie budynków przeciętych granicą kafelka, zgadywanie typu budynku. |
| `js/osm.js` | 254 | Przenieść geokodowanie (Nominatim), Overpass jako zapas, kategorie POI, osiedle losowe. Rasteryzację napisać od nowa na 1 m. |
| `js/data.js` | 214 | Przenieść jako dane: zasoby, budowle, 24 technologie, 20 uchwał, zakończenia, zawody (22), cechy (11), ogłoszenia, lore. |
| `js/sim.js` | 1020 | Przenieść kawałkami: czas, pory roku, temperatura, ciepło, jedzenie, choroby, zaufanie i wkurzenie, uchwały, badania, 24 wydarzenia, klasyfikacja budynków. Do wymiany: ekipy jako kropki, praca jako „ratio” zamiast ludzi przy stanowiskach. |
| `js/gazetka.js` | 99 | Zostawić. |
| `js/art.js` | 296 | Nie jako docelowa grafika. Zostawić jako grafikę zapasową, gdy nie ma assetów. |
| `js/ui.js` | 533 | Przepisać. Zakładki uchwał, badań i kroniki są dobrym wzorem treści. |
| `stare/za-murem-v02.html` | 1 plik | Wzór sterowania: wybór człowieka, cel na mapie, BFS, paski potrzeb, przekrój domu z pokojami. |
| `data/sample.js` | | Przykład Przymorza z Overpass, przydatny do testów bez sieci. |
| `tools/simtest.js` | | Bot do testów balansu. Przenieść i rozbudować. |

## Werdykt

Zachować hak z adresem, dane, treść i symulację. Wymienić świat: skalę, grafikę, ludzi i sterowanie. Chodzi o przejście z „zarządzam tabelką osiedla” na „widzę swój blok, swoich ludzi i mówię im, co robić”, a zarząd spółdzielni z uchwałami zostaje warstwą nad tym. Kierunek opisany w `docs/GDD.md`, plan pracy w `PROMPT-DLA-CLAUDE-CODE.md`.
