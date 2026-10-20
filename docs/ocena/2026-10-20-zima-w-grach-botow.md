<!-- Raport nocnego integratora z 20.10.2026 (badanie zimna i głodu w grach botów; poprawka kozy z beczki to zimno-rano a524c0f). Skrypty pomiarowe z sekcji 9 leżały w notatkach sesji i nie trafiły do repo. -->

# Zimno i głód rano od 9. dnia: raport

Status: zrobione. Przyczyna ustalona pomiarem. Zimno rano to koszt zimy plus luka bota, nie błąd ognia ani liczenia ciepła.
Przy okazji znalazłem i poprawiłem jeden prawdziwy błąd w ścieżce palenisk z badań (koza z beczki zasłonięta meblami nie
dostawała drewna).

Gałąź `zimno-rano` od 4b2f7f2, commit `a524c0f` w drzewie
`/Users/mpawelczuk/Post-pixel/.claude/worktrees/agent-ae289ede3f49d9955`. Nic nie wypchnięte, bez `git stash`, bez subagentów,
`docs/POSTEP.md` nie ruszałem (żeby nie robić konfliktu w dzienniku; zaparkowane pomysły są na końcu raportu).

## Przyczyna w trzech zdaniach

1. Cały zarząd (4, potem do 14 osób) śpi w jedynym pokoju mieszkania zarządu. Koza stoi w kuchni, a kuchnia łączy się z pokojem
   przez przedpokój, więc przez każde drzwi idzie połowa ocieplenia: kuchnia +16°C ponad pogodę, przedpokój +8, pokój +4.
   Sypialnia ma więc najwyżej dwór + 2 (izolacja) + 4 = dwór + 6°C, i to przy kozie palącej się całą noc.
2. Śpiący traci ciepło o (18 − (temperatura pokoju + 6)) punktów na godzinę (`src/sim/needs.ts:135`), więc przy sypialni poniżej
   około 4,5°C, czyli przy dworze poniżej około −1,5°C (od dnia 10), nawet wypoczęty zarząd o 6:00 ma ciepło poniżej 40. Od dnia
   10 zmarzniętych jest 100%, to daje +6 wkurzenia na dobę (`src/gov/uchwaly.ts:78`), a głód dokłada +2.
3. Gaśnięcie kozy około 1:00 i brak drewna nie mają z tym wiele wspólnego: z kozą palącą się całą noc zarząd i tak jest odwołany
   w tych samych dniach (14–16), a z sypialnią utrzymaną na 14°C trzy z pięciu gier trwają do dnia 24, a dwie kończą się w dniach
   23 i 24. Wszystkie te zmiany są w sekcji 3.2.

## 1. Odtworzenie

Gra z briefu: `playWithGov` + `m2Player({ search: true, furniture: true })`, Przymorze, ziarno 11, polityka `zawsze-warta`,
bez dodatkowych poleceń, przełącznik „za siatkę” w domyślnym stanie trybu zwykłego (włączony). Skrypt
`zimno/godziny.ts` wpina się jako `PlayOpts.player` (co sekundę przy ekranie, po oknach zarządu) i niczego nie zmienia: skrót
stanu gry jest ten sam z nim i bez niego (`zimno/skrot.ts`: 59d86f89 dla ziarna 11 i 3893ea92 dla 12 po 18 dniach, oba razy).

Wynik: odwołanie w dniu 16, zaufanie 68, wkurzenie 100, skrót 59d86f89 po 18 dniach. Zgadza się z rozpoznaniem (ziarno 11:
dzień 16, zaufanie 68). Ziarna 11–15 dają dni 16, 15, 13, 16, 16, jak w rozpoznaniu.

Pełny dziennik godzinowy dni 1–18: `zimno/wyniki/godziny-baza-11-pelny.log` (5354 wierszy: co godzinę dwór, kuchnia, wszystkie
pokoje naszych mieszkań, ogień kozy, kto ją zajmuje, `kozaWanted`, drewno w składzie, luzem i w rękach, jedzenie, każdy z zarządu
z pokojem i temperaturą pod nogami, zajęciem, ciepłem, najedzeniem, siłami, zdrowiem; do tego zdarzenia co sekundę: dołożenie
do kozy z imieniem, zgaśnięcie, rozpalenie, każdy posiłek). Dni 8–16 osobno: `godziny-baza-11.log`.

### Poranki 6:00 (ziarno 11, rdzeń = liczba osób zarządu, zimni = ciepło < 40, głodni = najedzenie < 25)

| dzień | dwór | kuchnia | sypialnia | koza zgasła | drewno skład+luzem | jedzenie | rdzeń | zimni | głodni |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 9,7 | 20,5 | 15,8 | 23:04 | 0+0 | 35 | 4 | 25% | 25% |
| 3 | 8,4 | 15,1 | 13,2 | 22:07 | 20+3 | 80 | 4 | 25% | 100% |
| 4 | 4,8 | 21,0 | 13,5 | 01:36 | 10+7 | 71 | 6 | 67% | 67% |
| 5 | 5,4 | 14,6 | 11,0 | 00:06 | 20+19 | 53 | 7 | 86% | 57% |
| 6 | 3,3 | 13,6 | 8,8 | 01:04 | 20+19 | 47 | 8 | 50% | 62% |
| 7 | 4,6 | 15,1 | 10,6 | 01:04 | 20+24 | 31 | 9 | 33% | 67% |
| 8 | 1,7 | 18,2 | 10,7 | 01:04 | 19+37 | 21 | 10 | 20% | 90% |
| 9 | −0,1 | 14,1 | 7,9 | 23:16 | 20+31 | 6 | 11 | 36% | 55% |
| 10 | −0,3 | 10,4 | 5,7 | 00:07 | 20+38 | 0 | 11 | 100% | 100% |
| 11 | −3,6 | 13,4 | 5,8 | 00:54 | 20+40 | 2 | 11 | 82% | 91% |
| 12 | −6,0 | 5,7 | 0,4 | 01:54 | 20+15 | 0 | 11 | 100% | 100% |
| 13 | −7,6 | 3,7 | −1,2 | 01:04 | 20+56 | 0 | 12 | 100% | 100% |
| 14 | −9,8 | 1,4 | −3,5 | 01:04 | 20+35 | 1 | 14 | 100% | 100% |
| 15 | −10,7 | 6,2 | −1,6 | 01:04 | 20+28 | 0 | 14 | 93% | 100% |
| 16 | −9,7 | 1,5 | −3,6 | 01:36 | 20+62 | 3 | 14 | 100% | 100% |

(Dane z `godziny-baza-11-pelny.log`, tabela: `wyniki/tabela-dni-baza-11.txt`. „Skład” to pełne 20 sztuk na dwóch kafelkach
składu, reszta leży luzem na podwórku.) Skok zimnych z 36% do 100% między dniem 9 i 10 to próg, nie nagła zmiana pogody:
przy sypialni 5,7°C sen kosztuje około 50 punktów, więc ten, kto kładł się ze 90, budzi się z 40.

## 2. Przebieg godzina po godzinie (skrót): doba zimy, dzień 12 6:00 do dnia 13 8:00

Kolumna „kuchnia/sypialnia/dwór/inne” to ilu z zarządu stoi w kuchni, w sypialni, na dworze, gdzie indziej. Pełne dane z
imionami: dziennik godzinowy.

```
czas      | dwór  | kuchnia | sypialnia | koza (h) | drewno skł+luz | jedz | kuchnia/sypialnia/dwór/inne | śr. ciepło | zimni
D12 06:00 |  -6.0 |    5.7 |      0.4 |     0.0 |  20+15        |   0  |  0/11/ 0/ 0                |      0     | 11/11
D12 07:00 |  -5.4 |    9.2 |      2.5 |     3.1 |  20+11        |   0  |  1/ 0/10/ 0                |      3     | 11/11
D12 09:00 |  -3.9 |   12.6 |      4.9 |     1.1 |  20+19        |   0  |  3/ 0/ 8/ 0                |     15     | 9/11
D12 12:00 |  -2.3 |   15.1 |      7.1 |     1.1 |  20+70        |   0  |  4/ 0/ 7/ 0                |     37     | 7/11
D12 15:00 |  -2.1 |   15.9 |      7.9 |     1.1 |  20+67        |   0  |  7/ 0/ 4/ 0                |     61     | 3/11
D12 18:00 |  -3.7 |   15.0 |      7.0 |     1.1 |  20+64        |   0  |  5/ 0/ 6/ 0                |     57     | 3/11
D12 21:00 |  -6.1 |   12.9 |      4.9 |     1.1 |  20+61        |   0  |  7/ 0/ 5/ 0                |     62     | 5/12
D12 23:00 |  -7.5 |   11.4 |      3.4 |     2.1 |  20+58        |   0  |  0/12/ 0/ 0                |     44     | 5/12
D13 00:00 |  -8.0 |   10.7 |      2.7 |     1.1 |  20+58        |   0  |  0/10/ 2/ 0                |     36     | 5/12
D13 01:00 |  -8.5 |   10.2 |      2.2 |     0.1 |  20+58        |   0  |  0/12/ 0/ 0                |     28     | 9/12   <- koza zgasła 01:04
D13 03:00 |  -8.7 |    7.2 |      0.6 |     0.0 |  20+58        |   0  |  0/12/ 0/ 0                |     11     | 12/12
D13 06:00 |  -7.6 |    3.7 |     -1.2 |     0.0 |  20+56        |   0  |  0/12/ 0/ 0                |      0     | 12/12
D13 07:00 |  -7.0 |    7.4 |      0.9 |     3.1 |  20+52        |   0  |  1/ 2/ 9/ 0                |      3     | 12/12
```

Dokładanie do kozy tej doby (dziennik zdarzeń): 6:04 (+4 sztuki, Grzegorz), 9:06 (+3, Grzegorz), 12:37 (+3, Tomasz), 15:06,
18:06, 21:06 (po +3, Tomasz), potem nic do 6:04 następnego dnia. Dokłada ten, kto akurat jest bezczynny, gdy w kozie zostaje
mniej niż godzina ognia; sztuka pali się godzinę, koza mieści 4 (`KOZA_CAP`, `src/sim/sim.ts:384`), więc po dołożeniu o 21:06
ogień starcza do około 1:00. Nikt nie budzi się sam (sen w nocy trwa do rana: `case 'sleep'`, `src/sim/sim.ts:4140`, `return true`
przez całą noc, bez względu na zimno i głód); budzą tylko wydarzenia, które posyłają kogoś z latarką na kwadrans (zajęcie
`sprawdz`), a wartownik stoi przy bramie i nie dokłada. Raport zarządu mówi to samo wprost: „Nikt nie dokładał do kozy i zgasła
w nocy. Rano w kuchni zimno, 4°C.” (dzień 13).

Jedzenia w tej dobie nie ma (zapas 0 od dnia 10), nikt nie je. W dniach 3–8 (zapas 21–80) jedzą dwa razy dziennie, około
6:30 po przebudzeniu i około 13:00–14:00, a wieczorem nikt, bo próg to najedzenie poniżej 35 (`HUNGRY`, `src/sim/needs.ts:75`),
więc o 6:00, po 8 godzinach snu (−2/h) albo nocy na nogach (−4/h), najedzenie wynosi 12–27 średnio, a pomiar wkurzenia przypada
dokładnie na ten dołek.

## 3. Mechanizm z dowodem

### 3.1 Koza: pali się dzień, gaśnie w nocy, i nie to decyduje

Pomiar `zimno/zgasla.ts` (co sekundę przy ekranie, dni 8–16, ziarno 11): koza zimna jest 0% sekund między 7:00 a 22:59 i 22–100%
sekund między 0:00 a 5:59 (80% o 1:00, 100% o 2:00, 95% o 3:00, 70% o 4:00, 56% o 5:00), razem około 4,3 godziny na dobę.
Powód zimnej kozy w tych sekundach to nigdy brak drewna (skład jest pełny) ani `kozaWanted` równe fałsz.

`kozaWanted` (`src/sim/sim.ts:5364`, progi `KOZA_WARM` 60, `KOZA_MIN` 12, `KOZA_EVENING` 18) jest prawdziwe w 100% sekund dni
3–16 (ziarna 11 i 12, `zimno/chce.ts`): ktoś ma ciepło poniżej 60 w 92–97% sekund (dni 3–8 i 3–16), pokój mieszkania zarządu
jest poniżej 12°C w 61–84%, a sam warunek zajętych pustych mieszkań (zawsze zimnych) decyduje w 2–4%. „Koza z głową” więc
nigdzie nie gasi ognia, który jest potrzebny, ani nie wstrzymuje dokładania.

Dyżur przy kozie nie ratuje gry. Idealny dyżurny (hak: nocą dokłada sztukę, gdy koza ma mniej niż 2, `NOC=1`) daje końce gry
16, 14, 14, 15, 16 przy bazie 16, 15, 13, 16, 16. Oficjalna opcja `koza: true` z `playWithGov` daje 16, 15, 15, 15, 17 i trzyma
ogień całą noc tylko w części nocy (100%, 100%, 38%, 100%, 38%, 75%, 76%, 37% nocy 7–14). Powód zmierzony na ziarnie 11
(`zimno/dyzurny2.ts`): w nocach po dniach 9, 11 i 12 wyznaczony dyżurny miał zdrowie 27, 0 i 0, a zajęcie `guard` kończy się, gdy
zdrowie jest poniżej 30 (`src/sim/sim.ts`, `case 'guard'`, `p.needs.health < 30`), więc od razu zostawał bez zajęcia i szedł
spać z resztą. To luka bota (opcja `koza: true` wybiera dyżurnego po siłach, bez sprawdzenia zdrowia; karta nocy bota
zawsze-warta sprawdza zdrowie tylko dla warty z karty), nie błąd gry.

### 3.2 Sypialnia: to ona decyduje

Układ mieszkania zarządu sprawdziłem na wszystkich trzech demach (`zimno/mieszkanie.ts`): kuchnia z kozą, przedpokój w środku,
pokój(e) i łazienka za przedpokojem. Ocieplenie z kozy przy −5°C (liczone przez `heatBoost`, `src/sim/house.ts:170`): kuchnia 16,
przedpokój 8, pokój 4 (w Lanciego dalsze pokoje 2 i 1). Przymorze ma jeden pokój do spania, Zielonki dwa, Lanciego cztery.
Zarząd śpi tylko w łóżkach i na podłodze pokoi swojego mieszkania (`startSleep`, `src/sim/sim.ts:5167`, podłoga w rodzaju `pokoj`,
`src/sim/sim.ts:5202`), a łóżka można stawiać tylko w pokojach (`PLACE_ROOMS`, `src/sim/budowle.ts:50`).

Wynik w grze: temperatura sypialni zgadza się z wzorem dwór + 6 (dzień 9 18:00: dwór 2,7, sypialnia 9,2, wzór 8,7; dzień 13
6:00: dwór −7,6, wzór −1,6, w grze −1,2, bo koza zgasła o 1:04 i pokój stygnie wolno). Ciepło liczy się jak w kodzie
(`stepNeeds`: `dw = t − 18`, gdzie `t = temperatura + 6` we śnie, a ogień +40 tylko w promieniu 3 m od palącej się kozy w tym
samym pokoju):

| dwór | sypialnia przy kozie palącej całą noc | ciepło śpiącego na godzinę | po 8 godzinach snu |
| --- | --- | --- | --- |
| +5°C | 11°C | −1 | −8 |
| 0°C | 6°C | −6 | −48 |
| −2°C | 4°C | −8 | −64 |
| −5°C | 1°C | −11 | −88 |
| −10°C | −4°C | −16 | −128 |

Projekt zakłada, że śpiącym wystarcza 12°C (komentarz przy `KOZA_WARM`/`KOZA_MIN`), a to wymaga dworu co najmniej 6°C. Od dnia
5 (dwór 5,4) sypialnia jest już poniżej tego progu mimo palącej się kozy. Kuchnia też ma sufit: `KOZA_MAX` 16 (komentarz w kodzie
mówi wprost „w mrozie do 21°C nie dojdzie”), więc przy −10°C najwyżej 8°C.

Dowód z eksperymentów kontrolowanych (końce gry na ziarnach 11–15, baza 16, 15, 13, 16, 16):

| wariant | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- |
| sypialnia nigdy poniżej 14°C (hak, `SYPIALNIA=14`) | brak końca do dnia 24 | brak | 23 | brak | 24 |
| ta sama sypialnia + idealny dyżurny przy kozie | brak | 21 | 22 | brak | brak |
| idealny dyżurny przy kozie (koza pali całą noc) | 16 | 14 | 14 | 15 | 16 |
| oficjalny dyżur przy kozie (`koza: true`) | 16 | 15 | 15 | 15 | 17 |
| jedzenie z niczego (zapas ≥ 30) | 16 | 17 | 15 | 16 | 16 |
| zmarznięci bezczynni na dworze idą do kuchni | 16 | 15 | 14 | 15 | 16 |
| zmarznięty budzi się w nocy i idzie do kozy (kopia kodu) | 17 | 15 | 14 | 16 | 16 |
| zarząd nie przyjmuje nikogo, zostaje 4 osoby (kopia kodu) | 17 | 18 | 15 | 16 | 15 |
| przełącznik „za siatkę” wyłączony wszystkim (jak `bot` w fali 1) | 17 | 17 | 15 | 16 | 17 |
| śpi w kuchni przy kozie, gdy sypialnia poniżej 16°C (kopia kodu) | 16 | 16 | 15 | 16 | 16 |
| `KOZA_CAP` 8 (kopia kodu) | 17 | 17 | 13 | 15 | 16 |
| ciepło przez drzwi 75% zamiast 50% (kopia kodu) | 17 | 18 | 16 | 18 | 18 |
| ciepła sypialnia + dyżur + jedzenie + bezczynni do kuchni | brak | brak | brak | brak | brak |

„Brak” to zarząd nie odwołany do końca przebiegu (24 dni). Ostatni wiersz: wszystkie pięć gier trwa dłużej niż 24 dni, wkurzenie
na końcu 62, 76, 89, 78, 73. Na pozostałych dwóch demach ta
sama sypialnia (ziarna 11, 12, 13) przesuwa koniec: Lanciego z 17, 16, 16 na 29, 28, 21, Zielonki z 16, 15, 14 na 26, 26, 21.
Sypialnia 14°C to górna granica efektu ogrzewania (hak podnosi temperaturę co sekundę, także za dnia); prawdziwa koza z beczki
w sypialni daje mniej (sekcja 5).

### 3.3 Głód rano

Dni 3–8: zapas jest (21–80 porcji), a o 6:00 głodnych jest 55–100% z powodu reguł jedzenia (próg 35, brak posiłku w nocy,
pomiar w dołku dnia), nie braku jedzenia. Od dnia 9–13 zapas kończy się: rdzeń rośnie z 4 do 14 (10 przyrostów w dniach 3–13, `zimno/rdzen.ts`: osiem razy „Ktoś się na czymś zna: Wciągnąć do
roboty”, raz „Influencerka survivalu: Przyjąć do spółdzielni”, raz „Ludzie pod bramą”; bot bierze zawsze pierwszą dozwoloną opcję),
a źródeł jedzenia nie ma poza startowymi 40, znalezionymi konserwami i ogródkiem (2 porcje na 3 doby jesienią, 0 zimą,
`GARDEN_YIELD`). Zarząd, który nikogo nie przyjmuje (4 osoby), ma jedzenie do dnia 13 zamiast 10 i też jest odwołany w dniach
15–18, bo zimno robi to samo. Jedzenie wpływa na wkurzenie słabiej niż zimno (+2 przy 100% głodnych, +6 przy 100% zmarzniętych). Przy rozwiązanym zimnie
grę kończy głód, w dniach 19–29 (rano zimnych jest wtedy 5–28%, a głodnych 70–100%; to wniosek z udziałów, nie osobny pomiar
składników). `dailyDrift` mierzy oba o 6:00, w dołku obu potrzeb.

### 3.4 Czy objaw był już wcześniej

Tak, w obu starszych bazach, tym samym botem (końce gry na ziarnach 11–15, skrypt `zimno/eksperyment.ts`, kod z `git archive`):

| baza | 11 | 12 | 13 | 14 | 15 | średnio |
| --- | --- | --- | --- | --- | --- | --- |
| 19045b0 (przed kozą z głową) | 18 | 16 | 16 | 17 | 17 | 16,8 |
| 5ede74b (przed pracą ludzi) | 16 | 17 | 16 | 16 | 15 | 16,0 |
| 4b2f7f2 (teraz) | 16 | 15 | 13 | 16 | 16 | 15,2 |

Sypialnia, gaśnięcie kozy i zimni rano wyglądają tak samo w 19045b0 (w tej bazie brakowało jeszcze drewna, w składzie i luzem
0–9 sztuk, a koza paliła się półgodzinnymi sztukami; sypialnia 5,8°C w dniu 9 i zimni 57% rano, 100% od dnia 11). Od 19045b0 do
4b2f7f2 koniec przesunął się średnio o 1,6 dnia (16,8 → 15,2), ale między tymi commitami weszło wiele zmian, więc nie
przypisuję tego jednej z nich. Pomiar z wyłączonym przełącznikiem „za siatkę” (jak w fali 1 `tools/bot.ts`) daje 17, 17, 15, 16, 17
(średnio 16,4 zamiast 15,2), czyli praca ludzi kosztuje około dnia, bo osoby z przełącznikiem ścinają drzewa na mrozie.

## 4. Rozstrzygnięcie

Zimno rano: koszt zimy plus luka bota (nie ogrzewa sypialni). Fizyka jest zamierzona w kodzie (izolacja, połowa ocieplenia przez
drzwi, `KOZA_MAX`: komentarze w `house.ts` mówią to wprost, GDD: „zima testuje ogrzewanie”, spec badań: „pierwsza zima jest trudna”);
czy ma być aż tak trudna bez grzania sypialni, to decyzja balansu dla Mateusza (sekcja 7). Nie znalazłem błędu w ogniu, ciepłu
ani w `kozaWanted`:

- koza nie pali się mimo drewna tylko w nocy, głównie od 1:00 do 6:00, bo mieści 4 sztuki, a nikt nie czuwa (zamierzone: do tego jest dyżur);
- ciepło liczy się zgodnie z kodem i wzorem (sprawdzone na danych);
- nikt nie „zabiera drewna gdzie indziej”: skład pełny, luzem 15–70 sztuk;
- automat pracy i koza z głową nie gaszą ognia, gdy jest potrzebny (`kozaWanted` prawdziwe w 100% sekund).

Czego rozsądny gracz by zrobił, a bot nie robi: koza z beczki w sypialni (badanie `t_kozy`, 8 złomu i 1 część; bot z badaniami
stawia ją w dniu 4–5 na pierwszym wolnym kafelku, co wypada w sypialni zarządu w ziarnach 11 i 12, w kuchni zarządu w 13 i 15, a w 14
w kuchni obcego, zajętego mieszkania), dyżur przy kozie ze sprawdzeniem zdrowia dyżurnego, wyprawy po jedzenie, odmowa
przyjmowania ludzi, gdy zapas jest mały.

Głód: reguły jedzenia plus wyczerpanie zapasu (4 → 14 osób bez źródła jedzenia), też luka bota i koszt trybu.

Błąd gry, który znalazłem w tej ścieżce: sekcja 5.

## 5. Błąd: koza z beczki zasłonięta meblami nie dostaje drewna

Dowód (gra bota z badaniami, ziarno 11, `zimno/beczka.ts`): koza z beczki #344 stoi w sypialni w (80,191) od dnia 5 i pali się
tylko w 2 dniach z 25. Od dnia 6 8:00 `kozaStand` (`src/sim/sim.ts:3843`) zwraca −1 dla każdego z zarządu. Wokół beczki:
ściana z zachodu, pracownia z północy (80,190) i (81,190), wersalka z południa (80,192) i magazyn z południowego wschodu i
wschodu (81,191) i (81,192), który bot postawił w dniu 6 o 8:00. `beside` wyklucza kafelki z meblem, `frontOf` dziedziczy to
ograniczenie, więc żaden kafelek nie został, `startRefuel` kończył się `false` w każdej sekundzie (`doDolozenia` prawdziwe, drewno
w składzie, `kozaWanted` prawdziwe, nikt nie miał skąd dołożyć). Pokój zimny, zarząd zimny, koniec w dniu 19. Reguła w `canPlace`
(`src/sim/budowle.ts:384`) pilnuje tylko, żeby koza z beczki nie stanęła na kafelku przed kozą zarządu; nic nie pilnuje dojścia
do samej kozy z beczki, a magazyn, pracownia i łóżka piętrowe (miejsce `pokoj`) konkurują o kafelki tego samego pokoju.

Poprawka (najmniejsza): `kozaStand` próbuje jak dotąd frontu i wolnego kafelka obok, a gdy ich nie ma, staje na najbliższym
przechodnim kafelku z meblem obok kozy (`beside(p, koza, true)`; pionek i tak przechodzi przez meble: sypialnia, krzesła,
łóżka). 13 dodanych i 6 usuniętych wierszy w `src/sim/sim.ts` razem z komentarzami i zdaniem w nagłówku modułu. Gdy wolny
kafelek jest, nic się nie zmienia.

Test na prawdziwej symulacji: `tests/unit/koza-dojscie.test.ts` (atrapa bloku jak `praca-koza.test.ts`, trzy testy):
kontrola bez mebli (zimna koza z beczki dostaje drewno w ciągu godziny gry), `kozaStand` zasłoniętej kozy wskazuje przechodni kafelek
obok niej, oraz zasłonięta ze wszystkich stron koza z beczki ma w ciągu godziny gry ogień. Na kodzie 4b2f7f2 dwa ostatnie są
czerwone (`expected -1 to be greater than or equal to 0`, `expected 0 to be greater than 0`; log:
`wyniki/test-koza-dojscie-na-bazie-4b2f7f2.log`), po poprawce wszystkie zielone
(`wyniki/test-koza-dojscie-po-poprawce.log`).

Bramka na drzewie z poprawką:

- `npm test`: 245 plików, 4636 zdanych (w tym 3 nowe), 1 oczekiwana porażka, 8 pominiętych, kod 0.
- `npx biome check src tests tools index.html`: czysto. `npx tsc --noEmit`: czysto.
- `npm run bot`: `Koniec: dzień 46 15:00, skrót stanu 6e21928c`, po 3 dobach `701b05aa`; tabela dzienna bez zmian poza kolumną czasu.
- `npm run bot:zombie`: warta-dzidy `147d305b`, bez-warty `ec24546e`, obie gra trwa. Skróty przed i po te same.
- `node tools/bot.ts --badania` (ziarna 1–5, 21 dni): skróty z badaniami 872a8e73, 90471c62, 60b1baae, 1445ad6b, ef1946d9 i bez badań
  87ff223f, e7a7a681, a8f59f0e, ca4fa92e, 37dd301e, przed i po te same (w tych pięciu grach żadna koza z beczki nie została zamurowana).
- Gra z punktu 1 (18 dni, standardowy bot) na ziarnach 11–15, przed i po: te same skróty 59d86f89, 3893ea92, b2ef8823, fc438bf1,
  800f6626 i te same dni końca 16, 15, 13, 16, 16 (to samo w wersji 24-dniowej: 954731a8, 337e0928, 0341b253, 8fc4849b, b1323140),
  bo ta gra nie ma kozy z beczki.

Nowe skróty: brak (żaden skrót z bramki się nie zmienił). Zmienia się tylko gra bota z badaniami na ziarnie 11 (30 dni, harness
`zimno/eksperyment.ts`): skrót 3284f7a9 → 397a4307, koniec gry z dnia 19 na dzień 25, zmarznięci rano w dniach 9–12 z 32% na 18%.
Ziarna 12–15 z badaniami: te same skróty co przed (49d01e46, 22bc74da, e2a2f123, 47afc71f).

## 6. Dzień końca gier przed i po

| gra | ziarna 11–15 przed | po |
| --- | --- | --- |
| standardowy bot (punkt 1 briefu) | 16, 15, 13, 16, 16 | bez zmian |
| bot z badaniami (`m2Player` z `badania`) | 19, 21, 15, 16, 15 | 25, 21, 15, 16, 15 |
| bot z badaniami, koza z beczki postawiona w sypialni (eksperyment, kopia kodu z poprawką) | n/d | 25, 21, 19, 24, 19 |

Bot z badaniami stawia kozę z beczki na pierwszym wolnym kafelku (`placeFor` w `tests/unit/m2-play.ts`): w sypialni zarządu w
ziarnach 11 i 12, w kuchni zarządu w 13 i 15 (obok kozy, sypialni nie grzeje) i w kuchni obcego mieszkania w 14. Dlatego końce 15,
16, 15 w ziarnach 13–15 nie zmieniają się ani z poprawką, ani bez niej. Z kozą w sypialni we wszystkich pięciu ziarnach zimni
rano w dniach 9–12 spadają do 7–28%, a koniec gry (19–25) wynika już głównie z głodu (głodnych rano 88–98%).

## 7. Co by pomogło w balansie (liczb nie zmieniałem)

Zmierzone (kopie kodu, ziarna 11–15, standardowy bot, końce gry; baza 16, 15, 13, 16, 16):

1. Ogrzewanie sypialni jest jedynym pojedynczym składnikiem, który coś zmienia: koniec gry przesuwa się co najmniej o 5 dni,
   zwykle o 8–12, na wszystkich trzech demach (granica górna, bo hak daje stałe 14°C). W grze to koza z beczki w pokoju zarządu
   (działa po poprawce z sekcji 5), kocioł albo folia w oknach (`t_okna`; kotła i okien nie mierzyłem). Bot z badaniami i kozą
   w sypialni kończy w dniach 19–25 zamiast 15–21.
2. Ciepło przez drzwi 0,75 zamiast 0,5 (`heatBoost`, `src/sim/house.ts:170`): +1…+3 dni, zimni rano w dniach 9–12 z 69–85% na
   40–60%. Za mało samo, ale pasuje do mieszkania z kozą w kuchni i jednym pokojem.
3. Nie pomagają same: większy zbiornik kozy (`KOZA_CAP` 8), dyżur przy kozie, spanie w kuchni (kuchnia zimą ma i tak tylko 8–13°C),
   budzenie z zimna, powrót bezczynnych do środka, jedzenie z niczego. Dopiero razem z ciepłą sypialnią robią różnicę (końce
   >24 dni).
4. Po rozwiązaniu zimna grę kończy głód (dni 19–29): źródło jedzenia innego niż start i konserwy, albo wyprawy po jedzenie w bocie.

Niezmierzone, tylko hipotezy do rozważenia: przesunięcie pomiaru `dailyDrift` z 6:00 (dołek ciepła i najedzenia) na środek dnia
albo średnia z doby; łóżka także w kuchni (`PLACE_ROOMS`, `src/sim/budowle.ts:50`) albo domyślna preferencja ciepłego pokoju przy
spaniu na podłodze; więcej miejsc do grzania przy kozie (są 1–2 na Przymorzu, 3–5 w Lanciego, 2 w Zielonkach, więc przy 10 osobach
zarządu grzeje się naraz najwyżej dwie).

## 8. Obserwacje poza zakresem, do zaparkowania

- Miejsca do grzania przy kozie (`warmSpot`, `src/sim/sim.ts:3863`, promień 2,5 m, bez mebli i składu): 1–2 na Przymorzu. Zmarznięci
  bezczynni nie mają gdzie się grzać i stoją na dworze: w dniach 8–16 średnio 4–6 z 12 osób stoi bezczynnie na dworze w godzinach
  7–21 (`zimno/bezczynni.ts`). Wysłanie ich do kuchni (hak) nie zmienia dnia końca, więc to nie jest przyczyna odwołania.
- `gov-play.ts`, opcja `koza: true`: dyżurny wybierany po siłach, bez sprawdzenia zdrowia, więc często wypada (sekcja 3.1).
- Karta nocy bota zawsze-warta w dniach 11–12 nie wystawia nikogo na wartę, bo nikt z zarządu nie ma zdrowia ≥ 40 (zdrowie
  0–18 u wszystkich od dnia 11, od zimna i głodu); zgonów nie ma (rozpoznanie: zgony 0 we wszystkich grach), więc zdrowie 0 jest
  stanem trwałym.
- `m2Player.placeFor`: koza z beczki powinna iść do sypialni zarządu, jeśli bot ma mierzyć zimę z badaniami.
- Tryb zombie: `bot:zombie` (ziarna 1 i 2, 25 nocy) kończy odwołaniem w dniach 13, 16, 15, 15 (warta-dzidy i bez-warty na
  każdym ziarnie), a z `--opal` (opał z niczego) w dniach 17, 17, 17 i raz pustką w dniu 9. Tam najedzenie spada do 0 od nocy 5;
  nie badałem tego tak dokładnie jak trybu zwykłego. Zwykły bot z `mode: 'zombie'` w moim harnessie kończy pustką w dniach 3–7
  (inna porażka, nie badana), więc rozkład przyczyn z sekcji 3 dotyczy trybu zwykłego.

## 9. Jak powtórzyć

Wszystko w `/private/tmp/claude-501/-Users-mpawelczuk-Post-pixel/459a51a3-cfb2-459b-ae88-222f98950c4c/scratchpad/zimno/`. Kod do pomiarów
to wyciągi z `git archive` (nie drzewo noc-integracja, żeby wynik nie zależał od cudzych zmian): `baza` (4b2f7f2),
`baza-19045b0`, `baza-5ede74b`, a eksperymentalne kopie `baza-x-*` (drzwi 75%, spanie w kuchni, `KOZA_CAP` 8, budzenie z zimna,
nieprzyjmowanie ludzi, koza z beczki w sypialni). Zmienna `ZM_KOD` wybiera kod (np. drzewo agenta z poprawką).

```
node godziny.ts 11 18 1 18 > wyniki/godziny-baza-11-pelny.log       # dziennik godzinowy (ziarno dni od do)
python3 -I tabela_dni.py wyniki/godziny-baza-11-pelny.log 2 16       # poranki
python3 -I tabela_godzin.py wyniki/godziny-baza-11-pelny.log 12 6 13 8
CICHO=1 SYPIALNIA=14 node eksperyment.ts 11 24                      # poprawki: NOC, SYPIALNIA=N, SYCI, SCHRON, KOZA=1, BADANIA=1, BEZ_SIATKI=1, DEMO=nazwa
node zgasla.ts 11 17 8 16   node chce.ts 11 16 3 16   node bezczynni.ts 11 17 8 16
node miejsca.ts przymorze   node mieszkanie.ts przymorze   node beczka.ts 11 8 5   node rdzen.ts 11 16
node dyzurny2.ts 11 12   node skrot.ts 11 18
bash ek1.sh ... ek7.sh                                               # macierze po ziarnach 11–15 (ek2: bazy i poprawki, ek3: bot z
                                                                     # badaniami, ek4: kopie kodu, ek5: zombie, ek6: po poprawce, ek7: koza w sypialni)
```

Wyniki surowe: `wyniki/` (`ek2/`, `ek3-*/`, `ek4/`, `ek5/`, `ek6/`, logi godzinowe, `npm-test-*.log`, `bot-*.log`).

Dane z `node_modules`: sklonowałem (`cp -c`, bez zapisu w źródle) z drzewa noc-integracja do mojego drzewa, tylko do `npm test` i Biome;
nie jest w repozytorium (ignorowane). Innych plików w cudzych drzewach nie czytałem ani nie zmieniałem.
