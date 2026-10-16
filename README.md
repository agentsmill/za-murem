# Za Murem: spółdzielnia po upadku

Pikselowa gra przeglądarkowa. Wpisujesz adres swojego osiedla, gra pobiera budynki z OpenStreetMap i rysuje z nich pikselową mapę. Prowadzisz zarząd spółdzielni mieszkaniowej po upadku cywilizacji: urządzasz budynki, przydzielasz ludzi, wysyłasz ekipy po zapasy i książki, badasz technologie i podpisujesz uchwały. Walne może was odwołać.

## Jak uruchomić lokalnie

Najprościej przez mały serwer, bo wtedy działa też pobieranie map:

    cd Post-pixel
    python3 -m http.server 8000

i wejść na http://localhost:8000. Samo otwarcie `index.html` z dysku też działa.

## Pliki

- `index.html`, `style.css` – strona gry
- `js/data.js` – budynki, technologie, uchwały, ludzie, ogłoszenia
- `js/osm.js` – adres → Nominatim, budynki → Overpass, rasteryzacja do siatki 4 m
- `js/art.js` – pikselowa grafika mapy
- `js/sim.js` – symulacja: ciepło, jedzenie, choroby, zaufanie i wkurzenie, badania, uchwały, ekipy, wydarzenia
- `js/ui.js` – mapa (przesuwanie, zoom), panele, arkusze
- `js/gazetka.js` – „Głos Klatki”, gazetka jako obrazek do udostępnienia
- `js/main.js` – start, pętla gry, zapis w przeglądarce
- `data/sample.js` – przykładowe osiedle (Przymorze, Gdańsk) do gry bez sieci
- `data/przymorze.json`, `data/overpass-zapytanie.txt` – surowe dane i zapytanie
- `tools/make-sample.js` – zamiana danych z Overpass na `sample.js`
- `stare/` – wcześniejsze prototypy

## Dane

Mapa: © współtwórcy OpenStreetMap, licencja ODbL. Przy większym ruchu trzeba będzie mieć własny geokoder albo cache, bo publiczny Nominatim ma limit jednego zapytania na sekundę.

## Do sprawdzenia

- czy pierwsza zima jest do przejścia bez kombinowania
- czy złom, opał i jedzenie się bilansują
- jak mapa wygląda na różnych osiedlach (bloki, domy, centrum miasta)
