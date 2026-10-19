# Warunki zwycięstwa: projekt

Stan: projekt do przeczytania przez Mateusza, 19.10.2026 w nocy. Nic z tego nie jest jeszcze zbudowane. Gałąź `warunki-zwyciestwa` od `noc-integracja` 9539c4d (`pelna-gra` 3d3fcd0 z mapą miasta i stropem).

Źródło: wiadomość Mateusza do nocnego integratora 19.10.2026 około 1:20, potem „idę spać, działasz sam”. Jego słowa są w cudzysłowie (mówił głosem, powtórzenia wycięte). Reszta to decyzje nocnego integratora w zastępstwie, oznaczone „(moje)”, do zmiany przez Mateusza.

## Po co

„Dodasz warunki zwycięstwa. Jednym będzie zwycięstwo technologiczne, drugim będzie zwycięstwo terytorialne: jeśli ktoś będzie miał bazę wielkości swojego całego terytorium i kafelków dookoła, czyli dziewięciu łącznie kafelków, i całość będzie otoczona murem. (…) Odnalezienie leku na zombie, ale żeby się nie mieszało z technologicznym, to bardziej questy, wyprawy do Warszawy, z Polski, do stolic, do jakichś laboratoriów. Taki quest fabularny. I leku na tę bakterię w naszym lore bez zombie. (…) Jakieś osiągnięcie dużej populacji. Też mogło być takie cywilizacyjne, związane z budowlami, jakieś cuda świata, które moglibyśmy budować za bardzo dużo surowców, jak już będziemy mieli ogromną produkcję. Bo zakładam, że jak będziemy już mieli teren połączony, to będziemy mogli budować budowle bardziej skomplikowane w oparciu o technologię, która będzie teraz rozwijana w innej sesji.”

Kierunek rozwoju (`2026-10-18-kierunek-rozwoju-design.md`) wskazał tę samą lukę: grze brakuje celów na późną grę, po 50. dniu cele mają być „na poziomie osady”.

### Co jest dziś

- Wygranej nie ma. Grę kończą tylko trzy porażki z `checkOver` w `src/gov/zarzad.ts`: pustka (nie ma nikogo z zarządu), odwołanie (wkurzenie 100) i exodus (zaufanie 0). Ekran końca (`showEnd` w `src/main.ts`, `endSheet` w `src/ui/okna.ts`) zawsze mówi „Koniec gry”, kasuje zapis i ma jeden przycisk „Od nowa”.
- Trzy zakończenia ścieżek uchwał z 0.3 (`ENDINGS`: twierdza, wspólnota, technokracja) są w `src/content/data.ts`, ale żadna uchwała w grze do nich nie prowadzi (w grze jest sześć uchwał bez `final`).
- 0.3 miała okno „Zakończenie” ze statystykami i przyciskiem „Grać dalej” (`public/v03/js/ui.js`).
- GDD: „Gra jest otwarta (…), a kończy się zakończeniem ścieżki uchwał albo porażką”. Bakteria to przyczyna upadku z przeszłości, a nie zagrożenie, które kończy grę. Wyłącznik bezpieczeństwa szczepu „był w pakiecie premium”. Bakteriofag ma dwie drogi: Wspólnota łowi go ze ścieków, Technokracja dostaje go od własnego modelu.
- Badań w grze nie ma (24 badania 0.3 w pięciu erach leżą w `TECH`, `techDone` nikt nie ustawia). Muru nie ma. Wypraw kilkudniowych i mapy kraju nie ma (mapa miasta: najwyżej 5 km, jeden dzień). Populacja to zarząd (`GovInput.people`) i mieszkańcy (`residents`), pustka liczy tylko zarząd.

## Miejsce wśród innych projektów

Zwycięstwo jest zwornikiem, więc prawie każda droga stoi na projekcie, który właśnie powstaje w innej sesji:

| Droga | Na czym stoi | Sesja |
|---|---|---|
| Technologiczna | drzewo badań, pracownia i tablica korkowa | „Technologia i Gospodarka” (gałąź `badania`) |
| Terytorialna „Za Murem” | świat z kwadratów 384 m, całe miasto do chodzenia; płot przez jezdnię; mur | „Eksploracja mapy i multiplayer”, po niej mały projekt płotu przez jezdnię |
| Fabularna: lek | wyprawy kilkudniowe i mapa kraju (rozszerzenie mapy miasta) | do zlecenia po mapie miasta |
| Ludnościowa | werbunek, przyjmowanie, praca ludzi | „System pracy i rekrutacji kolonii” (gałąź `praca-ludzi`) |
| Cywilizacyjna: cuda | badania z późnych er, gospodarka, połączony teren | badania i gospodarka |

Gra sieciowa w czasie rzeczywistym (decyzja Mateusza z 19.10.2026 w sesji odkrywania) dokłada sąsiadów-graczy w tym samym mieście, więc zwycięstwa liczą się dla każdego gracza osobno, a teren i cuda mogą się z sąsiadami zderzyć (moje).

## Cele

1. Pięć dróg do zwycięstwa od pierwszego dnia widać w grze i każda daje kierunek na kilkanaście godzin grania.
2. Każda droga ma kamienie milowe, pierwszy osiągalny w pierwszych dniach, żeby gracz od razu wiedział, dokąd idzie.
3. Zwycięstwo to wydarzenie z epilogiem, a nie koniec: gra toczy się dalej, zapis zostaje.
4. Epilog mówi o tym, jakie osiedle zbudowaliście: drogą i ścieżką uchwał (zakończenia ścieżek z GDD stają się odcieniem epilogu).
5. Wszystko liczy się z odczytu symulacji i stanu zarządu czystymi funkcjami, testowalnie w Node.

## Nie-cele (na teraz)

- Ranking i porównywanie graczy (kierunek rozwoju: ranking to nie-cel).
- Zwycięstwo dyplomatyczne (federacja osiedli): wraca razem z dyplomacją gry sieciowej, nazwa zarezerwowana niżej.
- Nowe porażki. Pustka dalej liczy tylko zarząd (do decyzji przy werbunku, bo mieszkańców będzie dużo więcej).

## Anty-cele (porażka, nawet jeśli działa)

- Zwycięstwo kasuje zapis albo zamyka grę.
- Lek wymaga badań (Mateusz: „żeby się nie mieszało z technologicznym”).
- Jedna droga jest warunkiem innej (cuda nie są potrzebne do terenu, teren nie jest potrzebny do leku).
- Prawdziwe firmy, instytucje albo nazwiska w fabule. Miasta i miejsca z OSM tak, instytucje i startup zmyślone (zasady z `CLAUDE.md`).

## Jak to działa

### Zasady wspólne (moje)

- Zwycięstwo zatrzymuje grę i pokazuje epilog na cały ekran, jak okno „Zakończenie” z 0.3: tytuł, tekst drogi z odcieniem ścieżki uchwał, statystyki (dzień, najwięcej ludzi, kwadraty, cuda, wyprawy, zmarli), przyciski „Graj dalej” i „Nowa gra”. Zapis zostaje. Kolejne zwycięstwa w tej samej grze też się liczą i trafiają do kroniki.
- Ekran „Drogi do zwycięstwa” w Menu: pięć dróg z kamieniami milowymi (zaliczone, następny z jednym zdaniem „co dalej”, reszta szara). Drogi bez gotowej podstawy (badania, odkrywanie, wyprawy dalekie) pokazują „wymaga: …” zamiast liczb. Na telefonie lista jedna pod drugą.
- Kamień milowy zaliczony w trakcie gry: wpis w kronice i podpowiedź, a rano linijka w raporcie. Mała nagroda tylko tam, gdzie wynika z fabuły (zaufanie +2 przy pierwszym kamieniu drogi, moje); żadnych bonusów do balansu na start.
- Odcień ścieżki uchwał: epilog drogi ma trzy warianty zdania końcowego (Porządek, Wspólnota, Technokracja) i neutralny, gdy ścieżki nie ma. Teksty `ENDINGS` z 0.3 (twierdza, wspólnota, technokracja) są punktem wyjścia, satyra na dziś oglądana z 2051 roku, bez nazwisk.
- Tryby: drogi te same w zwykłym i w zombie, różni się treść drogi fabularnej (lek na bakterię albo lek na zombie) i część liczb.

### 1. Technologiczna: „Prąd bez miedzi” (nazwa moja)

Bakteria zjadła miedź i z nią prąd, więc zwycięstwo technologiczne to sieć, której bakteria nie ruszy: aluminium, światłowód, ogniwa w żywicy (kierunek rozwoju wymienia je jako futurystykę). W trybie zombie ta sama sieć jest dodatkowo cicha, bo hałas ściąga stado (podatek od techniki z kierunku rozwoju).

- Warunek: zbadana technologia końcowa (jedna, oznaczona w drzewie, do której prowadzą wszystkie ery) i „Włączenie sieci” w pracowni. Tej nocy o 20:00 zapalają się okna w całym naszym terenie (mapa światła już jest), a potem epilog.
- Kamienie: pracownia postawiona; pierwsze badanie; era 3; era 5; sieć włączona.
- Kontrakt z sesją badań: w drzewie flaga `koncowa` i numer ery przy każdej technologii; odczyt dla zarządu `badania: { era: number; koncowa: boolean }`. Bakteriofaga i leku w drzewie nie ma (to fabuła).

### 2. Terytorialna: „Za Murem”

Tytuł gry staje się zwycięstwem: kwadrat domu i osiem sąsiednich (3 × 3 kwadraty po 384 m, 1152 × 1152 m) w całości za murem.

- Mur to nowy, najmocniejszy rodzaj obwodu: z gruzu i desek, z bramami, nie przewraca go napór stada poniżej wysokiego progu (moje; liczby z bota, punkt wyjścia: 3 gruzu i 1 deska na metr, 6 minut pracy na metr).
- Warunek: zamknięty obwód z muru, ścian budynków i wody (bez odcinków siatki i płotu; bramy wolno), który obejmuje co najmniej 80% powierzchni każdego z dziewięciu kwadratów, a w środku nie ma wrogiej grupy (rabusie, obca ekipa, cudza klatka w grze sieciowej). Próg 80% pozwala oprzeć mur o rzekę, tory i ściany budynków zamiast gonić każdy narożnik (moje).
- Kamienie: pierwszy sąsiedni budynek za wspólnym płotem; kwadrat domu za obwodem (80%); pierwszy sąsiedni kwadrat; pięć kwadratów; dziewięć kwadratów za murem.
- Kontrakt z sesją odkrywania: czysta funkcja na stanie, która dla kwadratu podaje, jaka część jego powierzchni leży w regionie siedziby za zamkniętym obwodem, i z jakich odcinków ten obwód się składa (mur, siatka, płot, budynek, woda). Bez płotu przez jezdnię teren na typowym blokowisku nie rośnie (sesja pracy ludzi: na Przymorzu 0 z 19 budynków do 150 m), więc ten mały projekt idzie zaraz po pracy ludzi.
- W trybie zombie to bezpieczna strefa jak w „The Walking Dead”: mur trzyma stado, za murem da się żyć.

### 3. Fabularna: lek

Łańcuch zadań z wyprawami dalekimi, bez badań. Zadanie ma kroki, każdy krok to trop (gdzie iść), wyprawa (kto, ile dni, z czym) i znalezisko (przedmiot fabularny). Kroki w mieście używają prawdziwych miejsc z OSM przez mapę miasta (szpital i przychodnia, bank, urząd, oczyszczalnia ścieków), kroki dalekie to prawdziwe miasta (miasto wojewódzkie najbliższe adresowi, Warszawa, stolica za granicą) z instytucjami zmyślonymi (moje).

Zwykły tryb, „Wyłącznik z pakietu premium” (nazwa moja). GDD mówi, że wyłącznik bezpieczeństwa szczepu był w pakiecie premium startupu. Lek istnieje, tylko leżał za płatną subskrypcją:
1. Trop w mieście: w banku albo urzędzie umowa ze startupem i nośnik z dokumentacją „pakietu premium”.
2. Laboratorium uczelni w mieście wojewódzkim: posiew i potwierdzenie (na wyprawie ktoś z fachem `med` albo `uprawa`).
3. Rozwidlenie według ścieżki uchwał. Wspólnota łowi faga ze ścieków (oczyszczalnia z OSM, kilka wypraw po próbki, wolno i losowo, jak w GDD). Technokracja przynosi dane z Warszawy, a własny model zarządu projektuje faga od ręki (model jest z fabuły, nie z drzewa badań). Bez ścieżki albo przy Porządku: wyprawa do Warszawy po klucz do pakietu premium.
4. Wylęgarnia w domu (budowla fabularna z przedmiotów z wypraw, nie z badań) i rozsianie faga: od tej chwili znane ogniska bakterii gasną, a epilog mówi o kablach, które przestały gnić.

Tryb zombie, „Lek”. Przyczyna zostaje nieznana (lore trybu), więc lek to śledztwo:
1. Trop: notatki lekarza z przychodni albo szpitala z OSM, albo wędrowiec, który zna kogoś z instytutu (moje).
2. Próbki: ze zwłok szwendaczy i od osoby ugryzionej, która się nie przemieniła (rzadka cecha z ziarna; do decyzji, czy taka osoba istnieje w grze, czy to tylko przedmiot z wyprawy).
3. Laboratorium w mieście wojewódzkim, potem instytut w Warszawie, a na końcu ostatnie czynne laboratorium w stolicy za granicą („z Polski do stolic”): najdłuższa wyprawa w grze.
4. Synteza w domu i szczepienie osiedla: od tej chwili ugryziony da się wyleczyć (to zostaje w „Graj dalej”).

- Kamienie: trop; pierwsza wyprawa daleka; laboratorium w mieście wojewódzkim; Warszawa (albo ścieki, albo model); lek w domu.
- Potrzebne wcześniej: wyprawy kilkudniowe i mapa kraju (rozszerzenie mapy miasta: mapa miasta odkłada je w „Nie-celach”, kierunek rozwoju wiąże kraj z łącznością). Wyprawa daleka trwa od kilku do kilkudziesięciu dni gry, zjada zapasy, ma zdarzenia po drodze (karty tekstowe) i może się nie udać. Treść zadań w obu językach.

### 4. Ludnościowa: „Nowe osiedle” (nazwa moja)

- Warunek: tylu ludzi pod naszym zarządem (zarząd i mieszkańcy naszych budynków), ilu mieszkało w kwadracie domu w 2021 roku według NSP, razy połowa, nie mniej niż 120 i nie więcej niż 500; utrzymane przez 7 dni bez głodu i przy zaufaniu co najmniej 50. Bez tabel mieszkańców cel to 250. W trybie zombie połowa celu (przeżyło co czwarte gospodarstwo). Liczby do strojenia botem i pomiarem klatek (moje).
- Cel z prawdziwej liczby ludności sprawia, że wieś ma inne zadanie niż falowiec: „przywróćcie osiedlu połowę ludzi sprzed upadku”.
- Kamienie: 10 osób; 25; 50; połowa celu; cel przez 7 dni.
- Kontrakt z sesją pracy ludzi: jedna funkcja licząca ludność (zarząd i mieszkańcy pod zarządem) w odczycie dla zarządu.

### 5. Cywilizacyjna: „Cuda” (nazwa Mateusza)

Bardzo drogie budowle końcowe, odblokowywane badaniami z późnych er, wymagające połączonego terenu (co najmniej 4 kwadraty) i dużej produkcji. Zwycięstwo: trzy cuda z siedmiu (moje), każdy raz na grę. Każdy cud daje trwały efekt.

Propozycje do wyboru i przeróbki (moje):
- Wieża ciśnień: woda z sieci w całym terenie, mniej chorób.
- Ogród na dachu falowca (na każdym adresie: na dachu najwyższego bloku): jedzenie dla setek.
- Rozgłośnia osiedlowa: wędrowcy i handlarze z całego miasta, wieści z kraju.
- Tramwaj konny: szybsze chodzenie między kwadratami.
- Biblioteka Ostatniego Internetu: ktoś wydrukował internet przed Wielkim Wylogowaniem; badania szybciej.
- Pomnik Nieznanego Admina: temu, kto trzymał serwerownię banku na sucho; nastroje i zaufanie.
- Hala targowa: handel bez złej sławy, lepsze ceny.

- Kamienie: pierwszy cud; drugi; trzeci.
- Kontrakt z badaniami i menu budowy: grupa albo zakładka „Cuda” w panelu budowy, koszt wielokrotnie wyższy niż zwykłych budowli, budowa wielodniowa.
- W grze sieciowej cud jest jeden na miasto: kto pierwszy, ten ma (do decyzji przy grze sieciowej, moje).

### Na później: dyplomatyczna „Federacja osiedli”

Pakty z kilkoma sąsiednimi osiedlami (gracze albo ekipy prowadzone przez bota). Wraca z dyplomacją gry sieciowej.

### Stan, odczyt i okna (moje)

- `src/gov/zwyciestwo.ts`: drogi `technologia`, `teren`, `lek`, `ludnosc`, `cuda`; czysta funkcja `ocenDrogi(input, st)` (postęp i kamienie każdej drogi z odczytu i stanu zarządu) i krok zarządu, który zapisuje nowe kamienie i zgłasza zwycięstwo. Bez losowania, poza fabułą leku, która losuje z ziarna zarządu.
- `GovState.zwyciestwo` pojawia się dopiero przy pierwszym kamieniu (jak `miasto` po `wlaczMiasto`), więc stare zapisy i skróty zarządu w testach się nie zmieniają: `{ kamienie: Record<Droga, number>; wygrane: { droga; dzien; godzina }[]; lek?: StanZadania }`.
- `GovInput` dostaje odczyty od innych projektów: `ludnosc`, `teren` (pokrycie dziewięciu kwadratów i skład obwodu), `badania`, `cuda`. Każdy jest opcjonalny: brak znaczy „wymaga: …” na ekranie dróg.
- `pending()` dostaje okno `zwyciestwo` (epilog), z pierwszeństwem jak raport poranny.
- Interfejs: `src/ui/zwyciestwo.ts` (ekran dróg i epilog), przycisk w Menu, napisy w obu językach przez słowniczek.
- Bot: `npm run bot -- --zwyciestwo` drukuje kamienie każdej drogi po dniach; bez flagi skróty bez zmian.

### Determinizm i zapis

Kamienie i zwycięstwa liczą się z odczytu i stanu zarządu w kroku zarządu, nie z rysowania. Zapis i wczytanie w połowie zadania leku dają ten sam przebieg. Nowe pole stanu z domyślną wartością, bez podbijania wersji zapisu.

## Kolejność budowy (moje)

1. Rama, od razu: stan, ekran dróg, epilog z „Graj dalej”, kroniki i raport. Droga ludnościowa w całości (odczyt już jest: zarząd i mieszkańcy). Teren do pierwszego kamienia (wspólny płot już jest). Pozostałe drogi z „wymaga: …”. Zakończenia ścieżek uchwał jako odcień epilogu.
2. Teren, po świecie z kwadratów, płocie przez jezdnię i murze.
3. Technologia i cuda, po drzewie badań i gospodarce.
4. Lek, po wyprawach kilkudniowych i mapie kraju; treść zadań w obu językach.
5. Federacja, z grą sieciową.

## Bramka

Każdy etap: `npm test`, `npm run lint` na całym repo, build, boty bez flagi z tymi samymi skrótami, `npm run bot -- --zwyciestwo`, zrzuty ekranu dróg i epilogu (komputer i telefon, po polsku i po angielsku) obejrzane, pełne `npm run shots`.

## Decyzje do przejrzenia przez Mateusza

1. Zwycięstwo nie kończy gry: epilog, „Graj dalej”, zapis zostaje, kolejne zwycięstwa się liczą.
2. Pięć dróg teraz, federacja później.
3. Nazwy: „Prąd bez miedzi”, „Za Murem”, „Wyłącznik z pakietu premium” i „Lek”, „Nowe osiedle”, „Cuda”.
4. Technologiczne to sieć bez miedzi i noc, w której zapalają się okna.
5. Teren: mur jako nowy obwód, 80% każdego z dziewięciu kwadratów, bez wrogów w środku.
6. Lek w zwykłym trybie to wyłącznik z pakietu premium z rozwidleniem według ścieżki uchwał; w zombie śledztwo aż do stolicy za granicą; wylęgarnia i synteza to budowle fabularne, nie z badań.
7. Ludność: połowa ludności kwadratu z 2021 roku, od 120 do 500, przez 7 dni bez głodu; w zombie połowa celu.
8. Cuda: trzy z siedmiu, lista do przeróbki, w grze sieciowej jeden na miasto.
9. Ścieżki uchwał dają odcień epilogu zamiast osobnych zakończeń.
10. Kolejność: rama z ludnością teraz, reszta za projektami, na których stoi.
11. Do rozstrzygnięcia przy werbunku: czy pustka ma liczyć też mieszkańców.
