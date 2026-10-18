# Handlarz pod bramą

Drugi kawałek sesji „Surowce” z 18.10.2026, na gałęzi `m2-surowce` po wrakach i warsztacie (`docs/superpowers/specs/2026-10-18-surowce-design.md`). Kierunek z rozmowy z Mateuszem, rozstrzygnięcia moje, do zmiany przez niego. Ruszyć kazała sesja „Pilnowanie agentów”, kiedy Mateusz był na spacerze.

## Po co

Mateusz 18.10.2026: „niech przychodzi handlarz w ciągu dnia, z którym można handlować, ale też są widoczne po prostu jak przesuwające się postacie, którymi nie steruję, ale na przykład mogę je zaatakować albo wejść w interakcję”.

Dziś handlarz jest tylko kartą wydarzenia z 0.3 („facet z wózkiem z marketu”). Po wrakach złomu jest za dużo (bot: 42 po pięciu dniach bez wraków), a deski i jedzenie są wąskim gardłem. Handlarz zamienia nadmiar na to, czego brakuje, i jest pierwszym obcym, którego widać za dnia.

## Cele

- Handlarz przychodzi za dnia z krawędzi mapy, staje z wózkiem za bramą, czeka kilka godzin i odchodzi. Widać go, nie da się nim sterować.
- Prawy przycisk na handlarzu albo jego wózku: jego towar w menu. Oferty, na które nas nie stać, są widoczne, ale wyszarzone z powodem („brakuje 2 złomu”).
- Można na niego napaść: rzuca wózek i ucieka, towar zostaje, a handlarz więcej nie przychodzi.

## Poza zakresem

- Wędrowcy i obce ekipy, które szabrują te same wraki: następny kawałek (2b), na tym samym szkielecie.
- Rozmowa z handlarzem (plotki, prośby), ceny zależne od zaufania, targowanie się.
- Handlarz w trybie zombie.
- Karta wydarzenia „Handlarz z wózkiem” z 0.3 zostaje bez zmian (treść 0.3 pilnuje test różnicowy).

## Czego nie wolno

- Zmiany przebiegu botów bez nowych funkcji. Handlarz chodzi tylko w grze z opcją `SimOpts.obcy` (gra ją włącza, boty nie), więc `npm run bot` i `npm run bot:zombie` dają te same skróty co `pelna-gra`. Stary zapis włącza go poleceniem `{ t: 'obcy' }`.
- Losowania poza stanem. Termin wizyty, oferty i wygląd losuje `st.rng`, ale tylko wtedy, gdy handlarz jest włączony.

## Wizyty

- Pierwsza wizyta drugiego dnia, przyjście między 10:00 a 12:00; potem co dwa albo trzy dni, przyjście między 9:00 a 13:00.
- Przychodzi z krawędzi mapy (jak szabrownicy: daleko od bramy), staje na kafelku ulicy najbliżej bramy, dwa metry od niej, z wózkiem obok. Czeka 3 godziny gry, najpóźniej do 18:00, potem odchodzi tą samą drogą i znika.
- Gdy nie ma dokąd dojść (świat bez siatki i bramy), wizyta przepada i następna jest za dwa dni.

## Towar

- Trzy oferty na wizytę, każda najwyżej dwa razy. Pierwsza zawsze kupuje złom, dwie pozostałe z reszty tabeli razem z niewylosowanymi ofertami na złom, więc złom może iść we wszystkich trzech (tasowanie Fishera-Yatesa ze `st.rng`). To moja decyzja po recenzji: złomu jest za dużo, więc im więcej ofert na złom, tym lepiej.

| oferta | dajemy | dostajemy |
|---|---|---|
| złom na deski | 6 złomu | 3 deski |
| złom na jedzenie | 4 złomu | 3 jedzenia |
| złom na części | 8 złomu | 3 części |
| części na leki | 3 części | 2 leki |
| leki na jedzenie | 2 leki | 5 jedzenia |
| drewno na jedzenie | 8 drewna | 4 jedzenia |
| jedzenie na deski | 4 jedzenia | 3 deski |

- Liczby to moje liczby na start. Złom jest walutą, bo jest go za dużo; części za złom wychodzą u handlarza gorzej niż w warsztacie (8 na 3 zamiast 8 na 4), ale bez pracy.

## Wymiana

- Menu na handlarzu albo wózku: jedna pozycja na ofertę, „Dać 6 złomu za 3 deski”. Wyprzedanej nie ma. Na którą nie starcza, jest wyszarzona z powodem.
- Polecenie `{ t: 'trade'; ids; offer }`: jedna osoba z zarządu idzie na podwórko na kafelek najbliżej handlarza (albo do niego, gdy stoi po tej samej stronie siatki), targuje się 5 minut gry i wymienia. Nasz materiał schodzi ze stert (jak w warsztacie, z całego zapasu), towar handlarza ląduje na podwórku od bramy w głąb (jak łup z wraku).
- Gdy w chwili wymiany materiału już nie starcza albo handlarz poszedł, nic się nie dzieje, a opis pracy kończy się.

## Napaść (pierwsza wersja, zastąpiona niżej przez walkę)

- Menu: „Napaść na handlarza” (z potwierdzeniem, jak palenie mebli). Jedna osoba idzie do niego za bramę. Na miejscu cios (efekt `cios`), handlarz rzuca wózek i ucieka do krawędzi mapy.
- Cały towar, jaki miał (wszystkie oferty razy to, co zostało), leży przy wózku za siatką. Nosi się go poleceniem „Zanieść na podwórko”.
- Nastrój: napastnik „Napadliśmy na handlarza” −6 na dobę, reszta zarządu −3 na dobę. Handlarz już nigdy nie przychodzi (wieść się niesie).
- Zaufanie i wkurzenie osiedla po napaści (kierunek z pierwszego projektu: „kosztuje zaufanie”) to następny krok. Zaufanie liczy zarząd w `src/gov`, który nie importuje symulacji, więc trzeba by przeprowadzić napaść przez `snapshot()` i `GovInput`. W tym kawałku napaść kosztuje nastroje i handlarza na zawsze; moja decyzja po recenzji.
- Wózek zostaje jako rzecz za siatką. W tym kawałku nic się z nim nie robi.

## Rysowanie i interfejs

- Pionek `handlarz` (obcy: nocą widać go tylko w świetle, ale przychodzi za dnia), wygląd ze zwykłych wyglądów ludzi, losowany przy wizycie.
- Wózek z marketu: sprite 1×1, stalowy koszyk na kółkach z towarem (pełny przy wizycie, pusty i przewrócony po napaści).
- Przy przyjściu napis na dole ekranu: „Pod bramą stoi handlarz z wózkiem.” (jak inne podpowiedzi w `main.ts`), w domu „Pod furtką” ze słownika miejsca.
- Stary zapis w zwykłym trybie włącza handlarza poleceniem `{ t: 'obcy' }` przy wczytaniu.
- Pozycja menu może mieć powód, dla którego jest nieaktywna (`MenuItem.off`): menu rysuje ją wyszarzoną z powodem i jej nie wybiera.
- Napisy po polsku i angielsku w nowym module.

## Kontrakt

- `src/sim/handlarz.ts`, czyste dane i funkcje: tabela ofert, losowanie ofert ze stanu losowania, terminy wizyt, napisy.
- Stan: `SimState.obcy?: { next: number; offers: { give; take; left }[]; trader: number; napad: number; wizyty: number }` (tick następnej wizyty albo −1, oferty bieżącej wizyty, id pionka handlarza albo −1, tick napaści albo −1, licznik wizyt). Pole jest tylko z opcją `obcy`.
- Pionek: `PawnKind` dostaje `'handlarz'`, praca `trader` (0 idzie pod bramę, 1 czeka, 2 odchodzi, 3 ucieka, 4 zniknął). Zarząd: praca `trade` i `rob`.
- Polecenia: `{ t: 'obcy' }` (włącza handlarza w starym zapisie), `{ t: 'trade'; ids; offer: number }`, `{ t: 'rob'; ids }`.
- `isEnemy` się nie zmienia: handlarz nie jest wrogiem, więc zarząd go nie bije odruchowo.

## Testy i bramka

- `tests/unit/handlarz.test.ts`: bez opcji nie ma pola `obcy` i skrót jak przed zmianą; z opcją handlarz przychodzi drugiego dnia, staje przy bramie, czeka i odchodzi; oferty te same przy tym samym ziarnie, pierwsza kupuje złom; wymiana zabiera nasz materiał i kładzie towar na podwórku, oferta schodzi; wyszarzona pozycja z powodem; napaść: towar za siatką, ucieczka, nastroje, więcej nie przychodzi; zapis i wczytanie w trakcie wizyty dają ten sam skrót.
- Boty bez zmian skrótów, testy, Biome, build, zrzuty: handlarz z wózkiem pod bramą, menu z ofertami (z wyszarzoną), po napaści. Lokalny commit, bez pusha.

## Napaść po zmianie Mateusza (18.10.2026, wieczór)

Mateusz (przez sesję „Pilnowanie agentów”): „Napaść na handlarza powoduje ciężką walkę bo handlarz umie się bronić a jeśli ucieknie to może wrócić z posiłkami i da znać innym handlarzom = wyższe ceny, mniej handlarzy”. To zastępuje „rzuca wózek i ucieka, więcej nie przychodzi”. Liczby są moje, do przejrzenia.

- Walka. Napastnik zadaje pierwszy cios, handlarz rzuca wózek (towar zostaje przy nim za siatką, jak dotąd) i staje do walki z siekierą: jest wrogiem (`isEnemy`), więc zarząd z bronią w pobliżu sam się włącza, a „Atakuj handlarza” jest w menu. Handlarz ma 140 życia, bije najbliższego z zarządu do 10 m (cios siekierą: 60% obrażeń broni, celność 90% broni), goni go po stronie ulicy, a przez zamkniętą bramę nie wejdzie. Poniżej 50 życia ucieka szybciej niż człowiek. Gdy przez godzinę gry nie ma kogo bić, odchodzi.
- Ten sam rozum dostają posiłki: prosty wróg, który podchodzi, bije, ucieka ranny i odchodzi. Wrogowie bijący zarząd to nowość: szabrownicy dalej nie oddają.
- Zabity handlarz: towar jest nasz, nikt nie zanosi wieści, ale nowy handlarz przejmuje trasę dopiero 3 dni później niż zwykle. Zabójca ma nastrój „Zabiłem człowieka” jak przy szabrowniku.
- Handlarz przeżył (uciekł albo odszedł po walce): wieść idzie do innych handlarzy (`st.obcy.slawa`, poziom 1–3): ceny razy 1 + 0,5 × poziom (zaokrąglone w górę), wizyty o 2 × poziom dni rzadziej. Poziom spada o jeden po 15 dniach bez nowej napaści. Do tego z szansą 60% posiłki: najbliższej nocy między 22:00 a 1:00 przychodzi 3–4 ludzi handlarza z pałkami, łomami i nożami (90 życia), stają pod siatką przy bramie i biją każdego z zarządu w zasięgu. Przez zamkniętą bramę i łaty nie przejdą, dziurą tak. Odchodzą o 4:00 albo po dwóch godzinach.
- Koszt w zaufaniu i wkurzeniu (−6 i +4) zostaje, liczy się w chwili napaści.
- Zabity obcy (handlarz, ludzie handlarza, wędrowiec, ekipa) liczy się jak zabity szabrownik, a nie jak zgon sąsiada.
