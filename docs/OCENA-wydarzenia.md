# Wydarzenia: ocena i propozycja

Stan: analiza z 19.10.2026 na `pelna-gra` (7ca3bf8, gałąź, z której idzie serwer testowy: M2, mieszkańcy z adresu, obcy, fala 2, mapa miasta, badania, drogi zwycięstwa). Nic z propozycji nie jest zbudowane. Projekt do budowy powstanie po rozmowie z Mateuszem w `docs/superpowers/specs/2026-10-19-wydarzenia-design.md`. Pierwsza wersja tej analizy powstała na starej gałęzi `tryb-zombie` i część jej ustaleń już nie obowiązuje; ta wersja jest sprawdzona na `pelna-gra` (karty wydarzeń i obcy w symulacji są tu tacy sami jak na `main` b424828, a spis na obu daje te same liczby).

Prośba Mateusza: wydarzenia mają być bogate, niestandardowe, za każdym razem inne, w jakiś sposób generatywne i związane z prawdziwymi mechanikami i postaciami. Jego słowa: „Nie chcę mieć tak, że ktoś przychodzi, mogę go przyjąć, a tak naprawdę nic nikogo nie ma”. Ustalone 19.10.2026: generatywne to klocki składane przez samą grę, bez modelu AI w trakcie gry.

## Jak to działa dziś

W grze są dwa osobne światy ludzi spoza zarządu.

Symulacja ma prawdziwych obcych, czyli pionki na mapie: handlarza z wózkiem pod bramą (`src/sim/handlarz.ts`, od drugiego dnia co 2–3 dni, w trybie zombie rzadko), wędrowców, którzy przystają przy siatce za dnia i dają wieść ze świata, obce ekipy przy wrakach (`src/sim/wedrowcy.ts`), ludzi handlarza po napaści, lokatorów sąsiednich budynków ze spotkaniem w oknie z pauzą i szansami na wybory oraz nocnych gości w otwartych budynkach (`src/sim/sasiedzi.ts`). Napaść ma cenę i się niesie (`src/gov/wiesci.ts`, zła sława u handlarzy). Mieszkańcy siedziby mają osoby z generatora mieszkańców: imię, wiek, zawód, historię (`src/sim/lokatorzy.ts`, `src/sim/osiedle.ts`).

Zarząd ma karty wydarzeń (`src/gov/wydarzenia.ts`): 19 z 0.3 z nakładkami według miejsca (`src/gov/warianty.ts`), 13 nowych (`src/gov/tresc.ts`) i 7 wydarzeń ulicy domów (`src/gov/ulica.ts`). Losują się z wag według pory dnia i miejsca (dom albo blok, jacy sąsiedzi), pierwszy dzień jest cichy do ciepłej kuchni, potem co 38–56 s przez pierwsze 10 minut i co 100–180 s dalej. Zarząd dostaje z symulacji coraz więcej (miejsca z mapy miasta do wypraw, badania, wiedzę, znalezione książki i odkrycia do kroniki), ale karta nie zna pionków obcych ani mieszkańców: `GovInput` dostaje tylko liczbę mieszkańców, a ich osoby idą do kart w interfejsie (`snapshot().lokatorzy`, z dopiskiem „Zarząd ich nie widzi”). Ludzi z kart do symulacji przenosi `applyGov`: nowa osoba zarządu staje przed drzwiami siedziby (`addCore`), przyjęci mieszkańcy czekają za bramą i wchodzą gęsiego (`addResidents` z przyjściem), a ubywający znikają (`removeResidents`, `removeCore`).

Liczby niżej pochodzą ze spisu na `pelna-gra`: gra jak w przeglądarce (mieszkańcy z generatora, obcy włączeni, zarząd z 4 osób), 10 ziaren po 5 dób na Przymorzu, 5 ziaren na domu w Zielonkach i 5 ziaren w trybie zombie na Przymorzu. Przy każdej karcie losowa dostępna odpowiedź, liczone pionki zarządu i mieszkańców przed wyborem i minutę gry po nim, a obok obcy, którzy przeszli przez mapę. Skrypt i wyniki leżą poza repo (`spis-wydarzen-main.ts` i `pg-*.txt` w notatkach sesji).

## Co już poprawiono

Część tego, co psuło wydarzenia w M1, jest już naprawiona i zostaje:

- uchodźcy: karta mówi, ile jest wolnych miejsc, a do wyboru jest „tylu, ilu się zmieści” albo „wszyscy, część na podłodze”; przyjęci czekają za bramą i wchodzą (w spisie 3 przyjętych to 3 pionki, 11 to 11);
- influencerka to jeden pionek, „Niech idzie” zabiera tylko tę osobę, aktywiści grzeją się do rana i odchodzą zamiast się wprowadzać;
- przymrozek przychodzi tylko przy mrozie na dworze (raz w 10 grach jesienią), krzyk tylko tam, gdzie są sąsiedzi, wydarzenia mówią o tym, co jest na mapie (dom albo blok, sklep, garaże), a w domu jest ulica i komitet zamiast spółdzielni;
- pierwszy dzień jest cichy, aż kuchnia się nagrzeje, a pierwszy gość przychodzi, bo zobaczył dym.

## Diagnoza

### 1. Karty pokazują ludzi obok prawdziwych pionków

Karta „Handlarz” („pod bramą stoi facet z wózkiem z marketu”) wypadła 28 razy w 10 grach, a prawdziwy handlarz z wózkiem przyszedł w tych grach po 2–3 razy. Pod bramą, kiedy jest karta, nikogo nie ma. W trybie zombie karta „Handlarz” wypadła 11 razy w 5 grach, choć prawdziwy handlarz w tych pięciu dobach nie przyszedł ani razu (w tym trybie pierwszy raz czwartego dnia i często nie dochodzi).

Karta „Wędrowiec pod bramą” wieczorem i w nocy wypadła 15 razy w 10 grach, z „Wpuścić na noc” i wersją ze złodziejem, a pod bramą nikogo nie ma. Prawdziwi wędrowcy chodzą tylko za dnia, po 7–11 na grę, i dają się tylko zagadać albo napaść.

To dziś główne źródło wrażenia „ktoś przychodzi, a nikogo nie ma”: gracz widzi na mapie handlarza i wędrowców, więc karta o handlarzu bez handlarza kłuje bardziej niż w M1.

### 2. Mieszkańcy mają twarze, ale karty ich nie widzą

Generator daje mieszkańcom siedziby imiona, wiek i historię, a karta osoby je pokazuje. Zarząd dostaje tylko ich liczbę, więc:

- „Słoik od sąsiadki” i „Latarka na korbkę” dalej mówią o wymyślonej pani Krysi i pani Halinie, a nie o kimś z klatki, kogo da się kliknąć;
- „Ktoś się na czymś zna” w bloku zabiera jednego mieszkańca z generatora (z imieniem i historią) i stawia przed drzwiami siedziby nową, losową osobę o innym imieniu (w spisie za każdym z 8 razy w bloku: ubywa mieszkańca, a przybywa ktoś o innym imieniu);
- „Kradzież z piwnicy” wypadła 26 razy w 10 grach w bloku i 17 razy w 5 grach zombie. „Wyrzucić sprawcę” usuwa ostatniego mieszkańca z listy: znika bez wyjścia bramą i bez imienia (w spisie 15 wyrzuceń w 10 grach, za każdym razem jeden mieszkaniec mniej), a kradzież nie bierze się z głodu, tylko z tego, że jedzenia jest więcej niż 10;
- przyjęci do zarządu (influencerka, fachowiec, ktoś z uchodźców) stają przed drzwiami siedziby, a nie wchodzą bramą jak przyjęci mieszkańcy.

Najlepiej działają karty, które biorą prawdziwych ludzi z zarządu: bezsenność, kłótnia o grafik (wesele jest wyłączone do czasu par z generatora).

### 3. Ta sama gra za każdym razem

W spisie gra ma około 35 kart w 5 dobach, zarówno w bloku, jak i w domu, przy puli 31–34 kart. W 10 grach w bloku w każdej wypadły: ślady przy siatce, wędrowiec, krzyk, pies, hałas, kradzież, sygnał, handlarz i czynsz; w 9 z 10: kot, dym, automat, bezsenność i latarka. Najczęstsze: krzyk z bloku obok 32 razy, handlarz 28, kradzież 26, hałas za garażami 25. Teksty są stałe, a losuje się drobiazg (dokąd idzie wędrowiec, skąd uchodźcy). Po drugiej grze gracz zna całą pulę.

### 4. Losowanie z wag zamiast z sytuacji

Przymrozek już patrzy na temperaturę, ale reszta dalej losuje się z wag: kradzież przy zapasach powyżej 10 zamiast przy głodnym mieszkańcu, kłótnia dla losowej pary zamiast dla dwojga w najgorszym nastroju, ulewa przy drewnie w zapasie, a nie przy deszczu (pogody z deszczem nie ma), krzyk „z bloku obok” bez konkretnego budynku z mapy.

### 5. Tryb zombie dostaje karty zwykłego trybu

Tryb zombie wyklucza tylko wydarzenia ulicy. W spisie zombie wypadły: handlarz 11 razy, kradzież 17, uchodźcy, aktywiści protestujący przeciw dymowi z kozy, influencerka, czynsz za 2047, tokeny i ślady przy siatce, w których „udawać, że nic nie widać” podbija szansę napadu szabrowników, których w tym trybie nie ma. Prawdziwi obcy w trybie zombie są już w klimacie The Walking Dead (ocaleni uciekają przed szwendaczami, ukryci ugryzieni u sąsiadów), a karty nie.

### 6. Brak pamięci i dalszego ciągu w kartach

Symulacja już pamięta: zła sława u handlarzy po napaści, wieść o napaści niesie się po osiedlu, ludzie handlarza wracają w nocy. Karty zarządu nie pamiętają nic: wybory kończą się zmianą zaufania o 1, wpisem w kronice i czasem linijką w porannym raporcie. Nakarmiony wędrowiec nie wraca, wyrzucony złodziej nie pojawia się z szabrownikami, odprawiona influencerka znika.

### 7. Zwierzęta to flagi

Pies Abonament dodaje obronę przy bramie i obniża szansę napadu, ale na mapie go nie ma. Kot Algorytm daje nastrój na dobę i tyle.

### Co działa i zostaje

- Maszyneria obcych w symulacji: wędrowiec z workiem i wieścią, handlarz z towarem, ceną napaści i złą sławą, spotkanie z lokatorami w oknie z pauzą i szansami. To gotowy fundament dla gości z kart.
- Osoby z generatora mieszkańców w siedzibie i u sąsiadów.
- Kronika odkryć i znalezionych książek (`src/gov/znaleziska.ts`): wpis bierze się z tego, co naprawdę zaszło w symulacji. To wzór dla kart z sytuacji.
- Nakładki według miejsca, wieść, która się niesie, `later()` na rano, pora dnia, odstęp powtórek.
- Wzór napadu: zarząd planuje, symulacja odgrywa pionkami, wynik wraca do zarządu.
- Determinizm z ziarna, stan w JSON, ton tekstów (satyra na abonamenty, influencerów i tokeny).

## Propozycja

Zasada: najpierw człowiek, potem karta. Jedna obsada ludzi dla symulacji i kart: każda postać z karty jest pionkiem na mapie, zanim karta się otworzy, i zostaje na mapie tak długo, jak trwa jej historia. Cztery warstwy, od fundamentu.

### A. Jedna obsada

Karty o obcych przestają wymyślać ludzi i biorą ich z symulacji. Karta „Handlarz” znika, a jej wymiana zostaje przy prawdziwym handlarzu. Wędrowiec z karty to prawdziwy wędrowiec przy siatce: karta otwiera się, kiedy on stoi pod bramą, z przyciskiem „Pokaż”, a „Wpuścić na noc” prowadzi go bramą do ogniska. Wędrowiec-złodziej w nocy naprawdę idzie do kuchni i warta może go złapać. Most jest jak przy napadzie: zarząd planuje wizytę albo prosi symulację o gościa, symulacja go wystawia, a co się z nim dzieje, wraca do zarządu.

Mieszkańcy z generatora trafiają do zarządu: `GovInput` dostaje ich osoby (imię, wiek, zawód, cechy, potrzeby, mieszkanie albo klatka). Wtedy pani Krysia to ktoś z klatki, kogo da się kliknąć, „Ktoś się na czymś zna” to awans tego samego mieszkańca do zarządu (ten sam pionek, to samo imię), a sprawca kradzieży to konkretny głodny mieszkaniec, którego wyrzucenie widać jako wyjście bramą.

Przyjęci do zarządu wchodzą bramą jak przyjęci mieszkańcy, nikt nie pojawia się z powietrza przed drzwiami.

Zwierzęta są pionkami: pies śpi przy bramie i szczeka na szabrowników i szwendaczy (w trybie zombie szczekanie może ściągać stado, to koszt do decyzji), kot śpi na kozie.

### B. Wydarzenia z sytuacji

Każda karta ma warunek na prawdziwy stan zamiast samej wagi: kradzież wtedy, gdy ktoś konkretny jest głodny od kilku godzin, kłótnia między dwiema osobami w najgorszym nastroju albo ze sprzecznymi cechami, pogrzeb po prawdziwej śmierci, ślady przy największej dziurze, krzyk z konkretnego budynku z mapy, w którym ktoś mieszka.

Narrator z krzywą napięcia, jak w RimWorldzie: liczy, ile ostatnio się działo (napad, rany, głód, zgony, wizyty), po ciężkiej nocy daje spokojniejszy dzień, a po kilku spokojnych coś ostrego.

Osobna pula dla trybu zombie: bez handlarza z karty, kradzieży o tokeny i czynszu, za to ocaleni z ukrytym ugryzieniem, szwendacz zaplątany w siatkę, ktoś, kto prosi o dobicie bliskiego.

### C. Generatywność z klocków

Gość składa się z klocków, a każdy klocek niesie mechanikę, nie tylko tekst. Siedzi na prawdziwym wędrowcu z symulacji i na spotkaniu w oknie z pauzą, które już jest.

| Klocek | Przykłady | Co robi w grze |
|---|---|---|
| kto | wędrowiec, rodzina z dziećmi, dezerter z ochrony zamkniętego osiedla, uciekinier z sąsiedniej spółdzielni, chory, samotne dziecko, ktoś, kto zna kogoś z zarządu | wiek, fach i cechy z generatora, wygląd pionka |
| czego chce | nocleg, jedzenie, leki, wymiana, dołączyć, przechować coś, wiadomość | odpowiedzi w oknie |
| co ma | fach, rzecz, wiadomość o miejscu z mapy, ostrzeżenie | umiejętności po przyjęciu, rzecz w magazynie, nowy cel wyprawy, wiedza o napadzie |
| haczyk | mówi prawdę, kłamie, jest chory, ktoś za nim idzie, w trybie zombie ugryziony | kradzież w nocy, choroba w siedzibie, napad następnej nocy, przemiana |
| skąd | prawdziwe miejsce z OSM w okolicy | kierunek, z którego wchodzi na mapę, i nazwa w tekście; nazwa, która wygląda na imię i nazwisko, zamienia się na opis (RODO, filtr z generatora mieszkańców) |
| satyra | abonament, paczkomat, hulajnoga na minuty, token | jedna linijka koloru |

Tekst powstaje z szablonów z rodzajem i odmianą (jak historie w generatorze mieszkańców), w obu językach. Już kilka archetypów, potrzeb, ofert i haczyków razy miejsca z mapy daje setki różnych gości, a każdy jest spójny, bo haczyk i oferta zmieniają grę.

Pamięć o ludziach: spis znajomych, czyli kto przyszedł, jak go potraktowano i co o was myśli, wspólny dla kart i dla obcych z symulacji (zła sława handlarzy to jego zaczątek). Znajomi wracają: nakarmiony wędrowiec przychodzi z bratem i workiem ziemniaków, wyrzucony złodziej stoi wśród szabrowników, a raport rano mówi, że był wśród nich ten od słoików.

Łańcuchy: karta może zostawić w stanie zarządu hak, a kolejna ma ten hak w warunku. Przykład: światło w oknie naprzeciwko, odmigaliście, rano pod bramą chłopak z babcią; dwie doby później babcia choruje i chłopak prosi o leki; daliście, to mówi, gdzie jest nieruszona apteka (nowy cel wyprawy); nie daliście, to znika, a kiedyś stoi wśród szabrowników.

Wątki sezonu: na start gry ziarno wybiera kilka łańcuchów z większej puli, na przykład 3 z 12, a reszta w tej grze nie wypadnie. Druga gra na tym samym adresie ma inne historie, a karty jednorazowe przestają być pewniakami.

Treść piszemy offline: klocki i łańcuchy powstają paczkami w sesjach Claude, Mateusz czyta ton przed wejściem do gry.

### D. Skutek widać

Każdy wybór zostawia coś na mapie: osobę, rzecz albo ślad. Słoik od sąsiadki stoi w kuchni, latarka wisi przy bramie, puszki z kamykami na siatce, łata w dziurze. Wpis w kronice ma „Pokaż”, tak jak karta.

## Kolejność

1. Karty, które kłamią, bez nowych systemów: bez karty „Handlarz”, karta wędrowca tylko przy prawdziwym wędrowcu, osobna pula trybu zombie bez kart zwykłego trybu, kradzież rzadziej i z głodu, przyjęci do zarządu wchodzą bramą. Mała zmiana.
2. Mieszkańcy z generatora w `GovInput`: awans fachowca, sprawca kradzieży z imieniem i wyjściem bramą, sąsiadki z klatki zamiast pani Krysi i pani Haliny.
3. Gość z klocków na prawdziwym wędrowcu i w oknie spotkania. Pies jako pionek.
4. Pamięć o znajomych, wspólna dla kart i obcych z symulacji.
5. Łańcuchy, wątki sezonu i narrator.

Każdy etap z testem determinizmu (ten sam skrót stanu, zapis w połowie nie zmienia przebiegu), botem, spisem kart i zrzutami, w obu językach. Nowe pola stanu z wartością domyślną, żeby stare zapisy działały.

## Podpatrzone gdzie indziej

- RimWorld: goście, karawany i uchodźcy to pionki, które wchodzą z krawędzi mapy; narrator dobiera wydarzenia do stanu kolonii i do napięcia.
- Wildermyth: historie z szablonów z rolami, które obsadza się ludźmi z drużyny.
- Crusader Kings: wydarzenia obsadzane postaciami z cechami i relacjami.
- Fallen London i storylety: krótkie sceny z warunkami na stan i skutkami w stanie, które same układają się w łańcuchy.
