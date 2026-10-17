# Tryb zombie i broń: projekt

Projekt z rozmowy z Mateuszem 17.10.2026 wieczorem. Jego słowa: tryb zombie wybierany na ekranie startowym, siatka wzmocniona dookoła, za siatką chodzą zombie, nocą duża intensyfikacja zombie za płotem, wyjście jest niebezpieczne, mamy broń, a broń ma być w całej grze do obrony i do ataku. Wzorem jest serial The Walking Dead, „bierz Walking Dead max i jedziesz z implementacją”. Wszystko, co niżej nie jest jego słowami, to moje decyzje (oznaczone w sekcji „Moje decyzje do przejrzenia”).

## Po co

Gra po M1 się dłuży i „niewiele można robić”. Tryb zombie daje stałe napięcie i pracę za dnia (wzmacnianie siatki, dzidy, sprzątanie przy siatce, ryzykowne wyprawy) i noc, w której naprawdę walczy się o siatkę. Broń w obu trybach zamienia nocną wartę z liczby w karcie nocy w coś, co widać i czym się steruje.

## Cele

- Wybór trybu na ekranie startowym: zwykły albo zombie. Ten sam adres, ta sama mapa, ten sam zarząd.
- W trybie zombie: siatka od startu cała i wzmocniona, brama zamknięta, za siatką snują się szwendacze, nocą przychodzi stado, które napiera na siatkę i może ją przerwać.
- Walking Dead: wolni i głupi, groźni w kupie; idą za hałasem i za tym, co widzą; giną od ciosu w głowę; ugryzienie to gorączka i śmierć; każdy, kto umrze, wstaje; dobija się nożem w głowę; amputacja tuż po ugryzieniu może uratować; strzał zwabia stado; przez siatkę dźga się dzidą.
- Broń w całej grze: każdy z zarządu ma jedną broń (albo gołe ręce), zapasowa broń i amunicja leżą w magazynie. Warta broni się sama, gracz może kazać atakować („Atakuj”). W zwykłym trybie broń pomaga przeciw szabrownikom w nocy i na wyprawach.
- Symulacja deterministyczna, bez przeglądarki, z botem dla trybu zombie.

## Nie-cele (na teraz)

- Ludzie-wrogowie w trybie zombie (Zbawcy, inne grupy). Szabrownicy w trybie zombie nie przychodzą.
- Pękanie bramy, pułapki, wieże, mur. Brama jest wzmocniona i nie puszcza.
- Grafika z PixelLab. Wszystko rysowane kodem jak reszta grafiki zastępczej.
- Zmiana lore świata zwykłego trybu.

## Anty-cele (porażka, nawet jeśli działa)

- Zombie, które biegają szybciej od ludzi albo zabijają w jedną sekundę. Mają być wolne i straszne tłumem.
- Tryb, w którym nocą nic nie widać i nic nie da się zrobić poza patrzeniem. Warta musi walczyć, gracz musi mieć decyzje.
- Zwykły tryb, który przez broń i śmierć gra się inaczej bez walki. Ludzie nie umierają od samego zimna ani głodu (tak jak dziś), tylko od ran i gorączki.
- Spadek klatek przy stadzie: 60 szwendaczy i 150 pionków tła ma trzymać 50 kl/s na laptopie.

## Jak to działa

### Broń (`src/sim/bron.ts`)

Każda broń ma zasięg w metrach, obrażenia, czas między ciosami w krokach, hałas w metrach, celność, amunicję i to, czy sięga przez siatkę.

| broń | zasięg | obrażenia | co ile kroków | hałas | celność | amunicja | przez siatkę |
|---|---|---|---|---|---|---|---|
| gołe ręce | 1,3 | 6 | 24 | 0 | 0,6 | | nie |
| nóż | 1,3 | 34 | 18 | 0 | 0,75 | | nie |
| siekiera | 1,5 | 50 | 30 | 4 | 0,7 | | nie |
| łom | 1,5 | 42 | 26 | 5 | 0,75 | | nie |
| kij z gwoździami | 1,6 | 38 | 22 | 5 | 0,75 | | nie |
| dzida | 2,6 | 36 | 24 | 1 | 0,7 | | tak |
| kusza | 12 | 70 | 70 | 2 | 0,75 | bełty | tak |
| rewolwer | 14 | 75 | 20 | 40 | 0,65 | naboje | tak |
| strzelba | 8 | 100 | 40 | 50 | 0,8 | loftki | tak |

Celność rośnie o 0,05 za każdy punkt umiejętności `obrona` i spada o 0,15, gdy siły są poniżej 20. Broń palna bez amunicji bije jak gołe ręce. Bełt z kuszy wraca do magazynu w połowie przypadków. Szwendacz ma 60 życia, szabrownik 70, człowiek z zarządu i mieszkaniec tyle, ile ma zdrowia.

Start w zwykłym trybie: pierwsza osoba z zarządu ma siekierę, w magazynie nóż i łom. Start w trybie zombie: rewolwer, dzida, łom i nóż dla czterech osób z zarządu, w magazynie dzida i kij z gwoździami, 12 naboi.

Dzidę robi się na podwórku z 2 desek i 1 złomu (godzina gry pracy).

### Walka (`src/sim/walka.ts`, wołana z `Sim`)

- Praca `fight`: idzie na odległość ciosu i bije, póki cel żyje. Polecenie „Atakuj” na szwendaczu albo szabrowniku. Cel za siatką da się bić tylko bronią, która sięga przez siatkę.
- Warta na posterunku bije sama każdego wroga w zasięgu swojej broni, bez schodzenia z posterunku.
- Ktoś z zarządu, kto nic nie robi albo pracuje na podwórku, a wróg jest w promieniu 6 m po tej samej stronie siatki: z bronią i zdrowiem powyżej 40 walczy, inaczej ucieka do siedziby. Mieszkańcy zawsze uciekają do domu.
- Każdy cios i strzał robi hałas. Hałas trwa 2 sekundy gry i ściąga szwendaczy z promienia hałasu.
- Śmierć człowieka tylko od ciosów i gorączki. Zostają zwłoki, a wszyscy dostają zły nastrój na dobę. W zwykłym trybie zwłoki nie wstają.

### Szwendacze (`src/sim/zombie.ts`)

- Rodzaj pionka `zombie`. Chodzą z 0,35 prędkości człowieka, a za widzianą ofiarą z 0,5.
- Widzą człowieka z 10 m za dnia i z 5 m nocą (z 10 m, jeśli człowiek stoi w świetle). Słyszą hałas w jego promieniu.
- Nie wchodzą do budynków (drzwi są zamknięte). Przez otwartą dziurę wchodzą na podwórko, przez zamkniętą bramę nie.
- Za dnia po stronie ulicy snuje się min(30, 6 + 2 × dzień) szwendaczy. O 21:00 zaczyna się stado: min(60, 8 + 6 × (dzień − 1)) szwendaczy wychodzi z krawędzi mapy do 1:00 w grupach i idzie do siatki. O 6:00 ci, którzy nie napierają, rozchodzą się. Najwyżej 80 szwendaczy naraz.
- Do siatki prowadzi ich pole odległości liczone od kafelków tuż za siatką (BFS po stronie ulicy, liczone przy każdej zmianie przechodniości), a do widzianej ofiary albo hałasu A* z limitem 3 wyszukiwań na krok.
- Napór: szwendacz, który stoi przy kafelku siatki, zdejmuje mu 0,004 wytrzymałości na krok (3,2 na godzinę gry). Kafelek z wytrzymałością 0 staje się nową dziurą, którą da się załatać jak dziś.
- Ugryzienie: zasięg 1,1 m, co 30 kroków, 15 obrażeń, 35% szans na zakażenie przy trafieniu. Zakażony słabnie liniowo do śmierci po 18 godzinach gry. W 60% ugryzień trafienie jest w rękę albo nogę i przez 2 godziny gry od ugryzienia da się amputować: ktoś z zarządu idzie do chorego, pół godziny pracy, szansa 0,5 + 0,15 × umiejętność `med` (+0,15 z lekiem z magazynu), najwyżej 0,9. Udana amputacja usuwa zakażenie, zdejmuje 35 zdrowia (zostaje co najmniej 10) i zostawia kikut (gorsza celność o 0,15). Nieudana zabija.
- Wstawanie: zwłoki w trybie zombie wstają po godzinie gry. „Dobić” (nóż w głowę, sekunda pracy) sprawia, że nie wstaną. Martwy szwendacz zostaje jako trup na dobę.

### Siatka w trybie zombie

Wszystkie dziury ze świata załatane na start (łata 100), każdy kafelek siatki 100, brama zamknięta. Polecenie „Wzmocnić siatkę” na uszkodzonym kafelku: 2 deski albo 2 złom ze sterty, 20 minut gry pracy, +50 wytrzymałości.

### Zarząd w trybie zombie

- Bez szabrowników. Karta nocy zamiast szansy napadu pokazuje prognozę stada i stan siatki. Posterunki: „przy siatce” (warta staje tam, gdzie napierają najmocniej, i przechodzi, gdy stado się przesunie), brama i otwarte dziury.
- Wyprawy groźniejsze (ryzyko × 1,6). Kłopoty na wyprawie to ugryzienie w 35% przypadków.
- Broń liczy się w obu trybach: wartość warty × 1,25 z bronią do walki wręcz, × 1,4 z dzidą, × 1,5 z bronią palną z amunicją. Uzbrojeni na wyprawie mają mniejsze ryzyko (× 0,85 wręcz, × 0,75 broń palna).
- Na wyprawach można znaleźć amunicję i broń (w zombie częściej).
- Raport rano: ilu szwendaczy było przy siatce, ilu zabitych, ile razy siatka puściła, kto ugryziony, kto nie żyje. Śmierć kogoś z zarządu: zaufanie −5, wkurzenie +8.

### Interfejs

- Ekran startowy: przełącznik „Zwykły / Zombie” w wierszu nad polem adresu, bez dokładania wysokości na telefonie. W trybie zombie inny tekst wstępu. Przykładowe osiedla też biorą wybrany tryb. Adres w pasku `?tryb=zombie`.
- Pasek u góry w trybie zombie: wytrzymałość siatki i liczba szwendaczy przy siatce.
- Przycisk „Do broni!”: cały zdolny zarząd na wartę przy siatce (w zwykłym trybie przy bramie).
- Karta osoby: broń z przyciskiem zmiany, stan ugryzienia z czasem i przyciskiem „Amputować”.
- Menu pod prawym przyciskiem: „Atakuj”, „Dobić”, „Zrobić dzidę”, „Wzmocnić siatkę”.

### Rysowanie

Szwendacze w atlasie ludzi (szarozielona skóra, podarte ubranie z plamami, ręce przed siebie, chwiejny chód, rzut z ugryzieniem), pozy ciosu i celowania dla ludzi, broń w ręce jako osobny sprite, zwłoki i trupy, błysk wystrzału jako krótkie światło, krew, krąg hałasu po strzale, paski życia w walce, deski na wzmocnionej siatce. Nocą szwendaczy widać tylko w świetle, tak jak szabrowników.

## Ograniczenia

- Symulacja deterministyczna, bez `Math.random`, działa w Node. Zapis z wersji bez trybu zombie wczytuje się jako tryb zwykły.
- Bot zwykłego trybu ma grać jak dotąd poza tym, co zmienia broń (siekiera na start, wartość warty).
- Telefon 390×844: formularz adresu dalej na pierwszym ekranie.
- Bez nazw z serialu poza słowem „szwendacze”, które jest zwykłym polskim słowem.

## Moje decyzje do przejrzenia

- Skąd zombie: tekst wstępu trybu zombie mówi, że nikt nie wie, skąd się wzięło, wiadomo tylko, że nosi to każdy. Lore świata zwykłego trybu bez zmian.
- Liczby z tabel wyżej (siła broni, liczebność stada, napór) to pierwszy balans do strojenia botem i playtestem.
- Brama nie pęka, szabrowników w trybie zombie nie ma.
- Ludzie umierają tylko od ran i gorączki, nie od zimna i głodu.
