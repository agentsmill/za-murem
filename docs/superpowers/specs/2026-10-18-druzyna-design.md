# Własna drużyna zarządu: projekt

Projekt z rozmowy z Mateuszem 18.10.2026. Jego słowa: tworzenie swojej drużyny do 5 osób na mieszkanie albo dom w panelu, gdzie wpisuje się adres, do tego wybór losowy i określenie liczby. Przy osobie: podstawowe statystyki, umiejętności, cechy pozytywne i negatywne, imię i historia do napisania albo wygenerowania. Przeciw drużynie samych mistrzów: limit punktów, zamknięta lista umiejętności wychodząca z zawodu i losowane cechy, które można losować od nowa, mogą wypaść dobre i złe, ale nigdy dwie dobre. Układ A z makiety: wszystko na karcie startowej pod adresem. Mniej osób niczego nie zmienia poza tym, że jest trudniej. Reszta to moje decyzje, zebrane na końcu w sekcji „Moje decyzje do przejrzenia”.

## Po co

Gracz wchodzi do gry ze swoim adresem, a ludzie w siedzibie są dziś przypadkowi. Własna drużyna daje przywiązanie do postaci od pierwszej minuty (to moja osoba, ja ją wymyśliłem) i wybór trudności bez osobnego ustawienia: jedna osoba to gra na twardo, pięć to wygodniej.

## Cele

- Na karcie startowej sekcja „Wasz zarząd”: liczba osób od 1 do 5 i rząd osób, kliknięta osoba rozwija się do edycji (układ A z makiety).
- Każdą osobę da się ułożyć: imię i nazwisko, płeć, wiek, zawód, umiejętności w limicie punktów, cechy z losowania, historia.
- Wszystko da się wylosować: historię, cechy, całą osobę, całą drużynę.
- Bez ruszania czegokolwiek gra działa jak dziś: zarząd z ziarna adresu, tylko w wybranej liczbie.
- Drużyna trafia do stanu symulacji i do zapisu gry. Symulacja zostaje deterministyczna i działa w Node bez przeglądarki.

## Nie-cele

- Wybór broni na starcie, wygląd postaci (twarz, ubranie), portrety z PixelLab.
- Wybór mieszkania albo budynku, w którym drużyna zaczyna. Zarząd zaczyna w mieszkaniu siedziby jak dziś.
- Relacje między osobami z drużyny (para, rodzeństwo).
- Historie generowane przez model AI. Gra stoi na GitHub Pages bez serwera.
- Zmiana liczby zwykłych mieszkańców siedziby, broni w magazynie czy jedzenia na start zależnie od liczby osób.

## Anty-cele (porażka, nawet jeśli działa)

- Karta startowa, przez którą trzeba się przeklikać, zanim się zagra. Kto chce od razu grać, wpisuje adres i klika „Wczytaj osiedle”, jak dziś.
- Na telefonie formularz adresu spada pod pierwszy ekran. Sekcja zarządu jest zwinięta, dopóki gracz jej nie otworzy (scenariusz zrzutów `start-telefon` musi dalej pokazywać pole adresu).
- Pięciu lekarzy-komandosów. Limit punktów i zamknięta lista mają realnie wymuszać wybór.
- Zmiana przebiegu gry dla kogoś, kto nie ruszał drużyny: bot (`npm run bot`, `npm run bot:zombie`) daje ten sam skrót co przed zmianą.

## Jak to działa

### Liczba osób

Przełącznik 1, 2, 3, 4, 5, domyślnie 4. Działa w obu trybach panelu (z adresu i własny). Przy mniejszej liczbie niż 4 dzisiejsza pętla w `createSim` robi po prostu mniej osób (pierwsze dziedziny z kolejności ciepło, budowa, medycyna, uprawa), przy 5 piąta osoba dostaje znowu ciepło, bo pętla idzie po `need[k % 4]`.

Łóżek w mieszkaniu siedziby jest 3 lub 4 i tak zostaje, bo wnętrze wynika tylko ze świata i ziarna (decyzja z 17.10.2026). Piąta osoba śpi w wolnym łóżku albo w cudzym; dzisiejszy wybór łóżka w `Sim` już to obsługuje (własne, potem wolne, potem cudze). Budujący sprawdza, że nikt nie stoi całą noc bez spania.

Broń ze startu (`START_KIT[tryb].core`) dostaje tylu z zarządu, ile jest broni na liście, po kolei; jeśli osób jest mniej niż broni na liście, reszta tej broni trafia do magazynu. Dziś przy 4 osobach nic się nie zmienia.

### Dwa tryby panelu

- Z adresu (domyślny): rząd pokazuje N miejsc z napisem „losowo z adresu”, bo ziarno bierze się z adresu znalezionego przez geokoder, czyli dopiero po wczytaniu. Gra robi zarząd jak dziś, w liczbie N.
- Własny: po kliknięciu „Stwórz własny zarząd” albo którejkolwiek osoby panel losuje drużynę N osób i pokazuje ich imiona w rzędzie. Od tej chwili każdą osobę da się edytować. Przycisk „Wróć do losowania z adresu” przełącza z powrotem (bez kasowania własnej drużyny z pamięci przeglądarki).

Przeglądarka pamięta wybraną liczbę, tryb i własną drużynę (`localStorage`, osobny klucz od zapisu gry). Przy następnej grze panel otwiera się tak, jak go zostawiono.

### Osoba

Pola i ich granice:

- Imię i nazwisko: tekst, razem do 40 znaków, nie może być pusty. Imię to pierwsze słowo (gra używa `first` w zdaniach). Odmiana imienia wpisanego przez gracza nie jest częścią tego projektu (jest w projekcie mieszkańców z adresu).
- Płeć: K albo M. Zmienia formę zawodu (`PROFS` ma formę męską i żeńską) i odmianę w tekstach (`g()`).
- Wiek: liczba w widełkach zawodu z `PROFS`. Zmiana zawodu przycina wiek do nowych widełek.
- Zawód: lista z `PROFS` (22 zawody z 0.3, w formie zgodnej z płcią).
- Umiejętności: tylko dziedziny z listy zawodu, poziom 0 do maksimum dla tej dziedziny w tym zawodzie, suma najwyżej 6 punktów. Licznik „zostało X z 6”. Zmiana zawodu zeruje umiejętności i wstawia poziomy z `PROFS` dla nowego zawodu.
- Cechy: tylko losowanie, bez wybierania z listy. Przycisk „Losuj” losuje od nowa, ile razy gracz chce.
- Historia: pole tekstowe do 400 znaków i przycisk „Wylosuj historię”.

### Zamknięta lista umiejętności z zawodu

Każdy zawód dostaje listę 2 lub 3 dziedzin z maksymalnym poziomem dla każdej. Zasady dla tabeli:

- Dziedziny i poziomy z `PROFS` zawsze są na liście, a maksimum jest co najmniej tak wysokie jak dzisiejszy poziom.
- Do tego jedna albo dwie dziedziny pokrewne z niższym maksimum (np. hydraulik: ciepło do 4, budowa do 2, prąd do 1).
- Zawody-żarty zostają słabe przez niskie maksima, a nie przez mniejszy budżet: doradca ds. ESG, prompt engineer, kurier i kucharz nie wydadzą wszystkich 6 punktów. Satyra zostaje.
- Poziom 4 tylko w głównej dziedzinie zawodu.

Tabelę pisze budujący w `src/content/` obok `PROFS` (bez ruszania samego `PROFS`, który sprawdza test zgodności z 0.3). Mateusz ją czyta przed wejściem do gry.

### Cechy z losowania

Pule z `TRAITS` (0.3):

- dobre: pracowity, lubiany, odważny, optymista, Mistrz Excela, twardy,
- złe: leniwy, kłótliwy, tchórzliwy, hipochondryk,
- obojętna: gaduła.

Losowanie: jedna cecha albo dwie (dwie z szansą 45%, jak w 0.3), nigdy dwie dobre, nigdy para wykluczająca się z `TRAIT_PAIRS`. Gaduła jest obojętna: może wypaść obok dobrej albo złej. W 0.4 działają dziś: lubiany, kłótliwy, optymista (zaufanie i wkurzenie) oraz odważny i tchórzliwy (siła warty w karcie nocy i ryzyko wypraw w zarządzie; walka w symulacji patrzy tylko na `obrona`). Pozostałe dostaną działanie razem z systemami z 0.3; na karcie mają opis z 0.3 jak dziś.

Cechy nie dają ani nie zabierają punktów umiejętności.

### Zawody w 2051

Mateusz zostawił to mojej wyobraźni z jednym założeniem: AI było wszędzie, a potem nagle padły wszystkie serwery, bo bakteria już w nich siedziała. Na tym stoi cała reszta.

Wielkie Wylogowanie (propozycja do lore, do przejrzenia przez Mateusza, bo GDD mówi „nie zmieniać bez Mateusza”). Po odkryciu bakterii w 2029 ludzie jeszcze przez kilka lat oddawali modelom AI wszystko: pisanie, liczenie, diagnozy, projekty, wychowanie dzieci. Serwerownie wyglądały na bezpieczne, bo stały w betonie. Tyle że chłodzenie odparowujące trzymało w nich wilgoć, a bakteria siedziała w tych instalacjach od lat. W 2034 roku centra danych gasły jedno po drugim w ciągu kilku tygodni. Ostatnie, co ludzie zobaczyli od swoich asystentów, to „Przepraszam, coś poszło nie tak. Spróbuj ponownie później”. Przetrwała tylko sucha, klimatyzowana serwerownia banku z GDD i lokalne modele z jej dysków. Rok 2034 pasuje do przykładu z projektu mieszkańców („bez kontaktu od 2034”).

Zawód to fach, z którego osoba jest znana w spółdzielni w 2051, a nie etat. Nazwy i widełki wieku z `PROFS` zostają bez zmian, a historia mówi, skąd fach się wziął. Rozstrzyga rok urodzenia (2051 minus wiek):

- Pamiętający, urodzeni przed 1996 (56+ lat): w 2026 mieli już zawód. Fachowcy od rzeczy fizycznych (hydraulik, lekarz, murarz, inżynier) są dziś na wagę złota, bo umieli to bez asystenta. Biurowi noszą starą nazwę jak stopień wojskowy.
- Pokolenie asystenta, urodzeni 1996–2015 (36–55 lat): szkoła albo pierwsza praca przypadła na dekadę, w której AI robiło wszystko. Wylogowanie złapało ich w połowie kariery, bez umiejętności, które przez lata wykonywał za nich model. Uczyli się od nowa z papieru i od starszych.
- Dzieci Wylogowania, urodzeni od 2016 (do 35 lat): w 2034 mieli najwyżej 18 lat. Fach mają z terminu u starszego sąsiada albo z książek z piwnicy. Stare nazwy zawodów to dla nich nazwy fachów, których sens się przesunął.

Co znaczy każdy zawód w 2051 (punkt wyjścia dla historii i dla listy umiejętności):

| zawód | w 2051 |
|---|---|
| emerytowany inżynier | Projektował jeszcze przed AI i pamięta, jak się liczy na kartce. Wszyscy przychodzą do niego z rysunkiem na odwrocie kalendarza. |
| hydraulik | Najbardziej poszukiwany fach. Młodzi uczyli się u starych, kozy i rury to dziś to samo. |
| elektryk | Najbardziej tragiczny fach: łata krótkie odcinki kabla, które bakteria zjada od nowa. Nosi lakier i taśmę jak różaniec. |
| lekarz rodzinny | Starsi studiowali przed Wylogowaniem, młodsi na uczelni przeniesionej do piwnicy, z podręczników. Wciąż mówią „wypiszę e-receptę” i nikt się nie śmieje. |
| pielęgniarz | Robi to samo co zawsze, tylko bez aparatury. |
| ratownik medyczny | Karetek nie ma, biega. |
| ogrodnik | Ktoś, kto umie, żeby coś urosło na balkonie i na trawniku. |
| działkowiec | Ogródki działkowe wygrały historię. Działkowiec to dziś rolnik. |
| nauczyciel fizyki | Uczy dzieci na klatce schodowej. Wie, jak działa prądnica, i to wystarcza, żeby był ważny. |
| programista | Pamiętający i pokolenie asystenta pisali kod z modelem i bez niego stanęli. Dzieci Wylogowania nazywają tak tych, którzy na papierze rozpisują, jak uruchomić sterownik w kotłowni albo stary model z dysków banku. |
| prompt engineer | Starsi pisali prompty zawodowo kilka lat przed Wylogowaniem. Młodsi to zaklinacze: rozmawiają z ocalałym modelem z banku albo próbują przekonać martwą lodówkę na abonament, żeby się otworzyła. Kult cargo AI. |
| mechanik samochodowy | Auta stoją na abonamencie, więc naprawia rowery, wózki i agregaty. |
| kucharz | Gotuje z niczego, na ogniu. |
| ochroniarz z galerii | Galerie to puste skorupy, w których jest targ i skład złomu. Młodzi pilnują galerii, w której nigdy nie było sklepów. |
| kurier | Goniec między osiedlami, bo nie ma łączności. Paczkomaty stoją pełne i zamknięte. |
| doradca ds. ESG | Liczy ślad węglowy ogniska i prowadzi rejestr opału. Robi raport kwartalny, którego nikt nie czyta, i nikt nie wie, po co go trzymają. |
| influencer survivalowy | Opowiada przy ognisku o przetrwaniu, a na koniec mówi „zostawcie suba”, choć młodzi nie wiedzą, co to znaczy. Ten od nastroju. |
| student biotechnologii | Bada bakterię u lekarki albo w piwnicznej pracowni. Umie zrobić posiew (GDD: wiedza o ogniskach bakterii). |
| monter klimatyzacji | Pompy ciepła na subskrypcję stoją, więc stawia kozy i kominy. Zna się na cieple. |
| informatyk z urzędu | Urzędy wróciły do papieru. On wie, gdzie są stare druki i jak zrestartować to, co zostało. |
| murarz | Murarz jak zawsze, tylko materiał z rozbiórki. |
| weterynarz | Leczy kozy, kury i ludzi, kiedy lekarki nie ma. |

Ta tabela odpowiada też na otwarte pytanie 2 z projektu mieszkańców z adresu (`2026-10-17-mieszkancy-z-adresu-design.md`), tam do przeniesienia przy budowie generatora.

### Historia

Generator składa 2 lub 3 zdania z gotowych kawałków: skąd osoba ma fach (zawód i pokolenie z sekcji „Zawody w 2051”), jedna rzecz z cechy i jeden szczegół satyryczny w tonie lore (technika, która stoi obok i nie działa, abonamenty, ESG, Wylogowanie). Odmiana przez płeć przez `g()`. Bez prawdziwych nazwisk, firm i miejsc. Generator jest deterministyczny przy danym ziarnie (do testów), a w panelu dostaje świeże ziarno przy każdym kliknięciu.

Pierwszy zestaw kawałków pisze budujący, a Mateusz czyta ton, zanim wejdzie do gry (tak jak ustalono przy historiach mieszkańców). Pisze się tak, żeby później dało się te kawałki przenieść do generatora mieszkańców z adresu.

Historia jest tylko dla klimatu: na karcie osoby w grze, pod zawodem i wiekiem, zwinięta do jednej linijki z rozwinięciem po kliknięciu. Na symulację nie wpływa.

### Losowanie osoby i drużyny

„Losuj całą osobę” losuje płeć, imię i nazwisko z list gry, zawód, wiek w widełkach, umiejętności (poziomy z `PROFS`, a resztę budżetu rozkłada losowo w granicach listy zawodu), cechy i historię. „Losuj wszystkich” robi to dla każdej osoby, pilnując, żeby imiona się nie powtarzały i żeby drużyna od 4 osób w górę miała kogoś z ciepłem, budową, medycyną i uprawą (jak dziś zarząd z adresu). Losowanie w panelu nie musi być powtarzalne, ale idzie przez `src/core/rng.ts` z ziarnem, żeby testy mogły je powtórzyć.

### Połączenie z symulacją

- `createSim` przyjmuje opcję z drużyną: lista osób (imię i nazwisko, płeć, wiek, zawód, umiejętności, cechy, historia). Bez tej opcji wszystko jak dziś, łącznie z kolejnością losowań, więc zwykli mieszkańcy i reszta stanu przy tym samym ziarnie się nie zmieniają, a bot daje ten sam skrót.
- Z opcją: dla każdej osoby `createSim` dalej wywołuje dzisiejsze losowania w tej samej kolejności (żeby mieszkańcy i miejsca startowe zostali tacy sami jak bez opcji przy tej samej liczbie osób), a potem nadpisuje pola osoby danymi z drużyny. Identyfikatory osób zostają z `nextId`.
- `Person` dostaje pole `story` (opcjonalne). Odczyt dla interfejsu (`SimPerson` w `snapshot.ts`) też.
- Symulacja sprawdza dane z drużyny jeszcze raz (limit punktów, lista zawodu, wiek w widełkach, najwyżej 5 osób, najwyżej jedna dobra cecha), bo zapis w przeglądarce można ręcznie zmienić. Złe dane: osoba wraca do wartości z losowania z adresu, a w konsoli jest ostrzeżenie. Te same zasady w jednym module, z którego korzysta i panel, i symulacja.
- Zapis gry ma osoby w stanie, więc drużyna przechodzi przez zapis bez zmian w `zapis.ts` poza nowym polem.

## Jak sprawdzamy

- Testy jednostkowe zasad: budżet, maksima z listy zawodu, wiek w widełkach, nigdy dwie dobre cechy ani para z `TRAIT_PAIRS` (np. 10 000 losowań), losowanie drużyny pokrywa cztery dziedziny od 4 osób w górę, imiona bez powtórzeń, historia nie jest pusta i ma właściwą formę płci.
- Testy symulacji: bez drużyny stan identyczny jak dziś (porównanie skrótów stanu dla trzech dem); z drużyną 1, 3 i 5 osób gra przechodzi pierwszą dobę w obu trybach bez błędu; złe dane z drużyny są poprawiane.
- Bot: `npm run bot` i `npm run bot:zombie` z tym samym skrótem co przed zmianą. Do bota zombie opcja z liczbą osób (np. 1 i 5), żeby zobaczyć, jak trudność rośnie przy mniejszej drużynie.
- Zrzuty w Playwright: karta startowa ze zwiniętą sekcją, z rozwiniętym edytorem na komputerze i na telefonie (`start-telefon` dalej z polem adresu na pierwszym ekranie), karta osoby w grze z historią.

## Co zostaje dla budującego

Nazwy plików i modułów, dokładny wygląd i kolejność pól w edytorze (sprawdza się zrzutami), brzmienie pierwszych kawałków historii (czyta Mateusz), tabela dziedzin i maksimów dla 22 zawodów (czyta Mateusz), klucz w `localStorage`, obsługa klawiatury w edytorze.

## Moje decyzje do przejrzenia

1. Budżet 6 punktów na osobę, skala 0–4 jak dziś. 6 to o jeden więcej niż najlepszy zawód z 0.3 (emerytowany inżynier ma 5), więc własna osoba jest trochę lepsza od losowej z adresu.
2. Zawody-żarty słabe przez niskie maksima, nie przez mniejszy budżet.
3. Cechy nie wpływają na punkty.
4. Jedna albo dwie cechy z losowania, jak w 0.3, z regułą „nigdy dwie dobre”.
5. Domyślnie zarząd z adresu, tak jak dziś, a własny po kliknięciu. Przeglądarka pamięta ostatni wybór.
6. Historia tylko dla klimatu, na karcie osoby w grze.
7. Piąta osoba bez własnego łóżka, wnętrze się nie zmienia.
8. Broń ze startu po kolei, nadmiar do magazynu.
9. Wielkie Wylogowanie w 2034 jako nowy kawałek lore (do wpisania w GDD dopiero po OK Mateusza).
10. Zawód to fach w 2051, trzy pokolenia według roku urodzenia, widełki wieku z `PROFS` bez zmian.
