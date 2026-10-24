<!-- Raport nocnego integratora z 24.10.2026 (głód zarządu przy pełnej spiżarni w grach silnika osady AI i zwykłego bota; skutek: silnik osady nie podpisuje racji, opis uchwały „Racje głodowe” mówi o koszcie). Skrypty pomiarowe i łatki z rozdziałów 7, 8a i 11 leżały w notatkach sesji i nie trafiły do repo. -->

# Głód przy zapasie jedzenia: raport

Status: zrobione. Przyczyna ustalona pomiarem. To luka silnika (podpisuje uchwałę „Racje głodowe” jako pierwszą dozwoloną), a nie błąd w drodze jedzenia w grze.
Racje przy dwóch posiłkach na dobę i braku posiłków w nocy z samej arytmetyki zostawiają zarząd na najedzeniu 0–10, także w grze bez silnika i bez botów (4.7), więc dotyczy to graczy, którzy tę uchwałę podpiszą.

Gałąź `glod-przy-zapasie` założona od `pelna-gra` (66f060c) w drzewie `.claude/worktrees/agent-a4682d10f77ceb36d`.
Bez commita: w grze nie znalazłem błędu, więc nic w niej nie zmieniałem. Nic nie wypchnięte, bez `git stash`, bez subagentów, w cudzych drzewach nic nie edytowałem.
Poprawka silnika (kilka linii i test) leży jako łatka na kod z 5:26: `scratchpad/glod/engine-bez-racji.patch`. Drzewo `osada-ai` zmieniło się od tej pory
(zadanie 5, rozdział 10), więc łatka nie zastosuje się bez zmian, ale pomysł jest ten sam i dalej działa: nie podpisywać `u_racje`.

## 1. Przyczyna w pięciu zdaniach

1. W oknach uchwał silnik podpisuje „pierwszą dozwoloną” (`oknoPodstawowe` w `src/ai/silnik.ts`: `u_warty`, a dalej `mozna[0]`; zwykły bot robi to samo w
   `tests/unit/gov-play.ts:214`). Wieczorem dnia 5 w oknie są tylko `u_racje` i `u_meble`, więc idą „Racje głodowe”. Dzień 1: `u_warty`, dzień 3: `u_brama`, dzień 7: `u_meble`.
2. Racje (`src/sim/sim.ts:3433` `wantsMeal`, `RATION_MEALS` 762, `RATION_HUNGRY` 766, `hungerRate` 760, `STARVING` 764): posiłek dopiero poniżej 25 i najwyżej dwa na dobę od 6:00,
   trzeci tylko z głodu poniżej 10, głód o 10% szybszy. Zużycie jedzenia to 88 punktów na dobę przy ośmiu godzinach snu i 105,6 przy całej dobie na nogach (wartownik), a dwa ciepłe posiłki
   dają najwyżej 90 (dwa zimne 60). Zarząd jest więc strukturalnie na minusie, a jedyna siatka bezpieczeństwa, trzeci posiłek poniżej 10, nie działa w nocy.
3. W nocy nikt nie je: śpiący i wartownik nie reagują na głód (`sim.ts:4319-4323` budzi tylko za dnia, `sim.ts:4371-4375` wartownik schodzi tylko przy zdrowiu poniżej 30, a w `think` sen idzie przed jedzeniem,
   `sim.ts:5032-5038`). W dniach 12–17 tylko 1 z 71 posiłków skończył się w nocy. Najedzenie schodzi do 0–10 i zostaje tam do rana.
4. To nie brak jedzenia: w 100% godzin głodu (najedzenie poniżej 10) garnek albo zapas były pod ręką (`mealFor` prawdziwe). Zapas 27–30 porcji to 1,7–2,2 porcji na głowę policzonych
   z 10 mieszkańcami, którzy z niego nie jedzą: silnik trzyma go na progu 2 na głowę (`MIN_NA_GLOWE` w `src/ai/jedzenie.ts`), czyli to nie obfitość, tylko jego własny punkt regulacji.
5. Dowód przez usunięcie przyczyny: ta sama gra, w której okno uchwał nie zawiera racji, ma 6,4 raza mniej godzin głodu, średnie najedzenie 30 zamiast 15 i dłuższe życie
   (Przymorze 31,6 dnia zamiast 23,2). Zwykły bot bez silnika pokazuje ten sam objaw i tę samą poprawę, bo ma tę samą regułę podpisywania uchwał.

Zdrowie spada głównie od zimna, nie od głodu: w dniach 14–17 utrata zdrowia zespołu to średnio 207 punktów od zimna i 67 od głodu (24%), po usunięciu racji 213 i 10.

## 2. Odtworzenie

Gra: `przygotujGre('przymorze', 11, false)`, decydent `silnik`, tempo przeglądarki, jak w briefie. Drzewo `osada-ai` zmienia się w trakcie mojej pracy (po godzinie 5:37 ktoś dopisuje
`okna.ts` i `rozwoj.ts` i zmienia `silnik.ts`, `zima.ts`, `gra.ts`, najpewniej zadanie 5), więc wszystkie liczby biorę z kopii kodu z 5:26 (`glod/kopia`, silnik z warstwą jedzenia). Skrót gry po 18 dobach
423c7f9b, ten sam w oryginale i w kopii. Skróty blobów plików silnika w kopii (do odszukania w historii `osada-ai` przez `git log --find-object`): silnik.ts a57210df, gra.ts 372dd2a5, jedzenie.ts 3d49bfd6, miejsca.ts 8c47c2bd, zima.ts 39bc786b, bot-osada.ts 604aec08.
W kopii zmieniłem tylko przełączniki doświadczalne (`GL_*`, domyślnie wyłączone, skrót ten sam 423c7f9b), kod gry jest ten z `osada-ai`.

Poranki 6:00 (Przymorze, ziarno 11) zgadzają się z briefem:

| dzień | jedzenie (surowe+garnek) | zarząd | śr. najedzenie | śr. ciepło | śr. zdrowie |
| --- | --- | --- | --- | --- | --- |
| 12 | 35 | 6 | 14 | 81 | 80 |
| 13 | 30 | 6 | 16 | 73 | 79 |
| 14 | 29 | 6 | 7 | 60 | 60 |
| 15 | 28 | 6 | 12 | 55 | 51 |
| 16 | 30 | 6 | 10 | 46 | 35 |
| 17 | 27 | 6 | 14 | 55 | 21 |

Gdzie leży jedzenie (o 6:00, dni 12–17): surowe 24–30 porcji, z tego 18–24 w stertach w innych mieszkaniach tego samego bloku (największa, #221 w (135,194), ma do 20 porcji i leży 55 kafelków od kuchni zarządu),
5 na podwórku, 1 w klatce. W kuchni zarządu i w składzie surowego jedzenia 0, poza siatką 0. Ugotowane: 0–5 porcji w garnku w kuchni. Powód: pierwotna sterta 40 porcji w kuchni skończyła się w dniu 5 o 12:51,
a zostały sterty znalezione w innych mieszkaniach bloku w dniach 2–3 (szaber) oraz przybytek z wypraw, który dokłada się do pierwszej istniejącej sterty jedzenia, gdziekolwiek leży (`src/sim/gov.ts:515`). Dla gry to bez znaczenia,
bo jedzenie i gotowanie biorą z dowolnej sterty naszego terenu bez chodzenia do niej (`food()` `sim.ts:3814`, `eat` 4286, `cook` 4333). W mieszkaniu zarządu nie ma kuchenki z gazem
(`gaz=brak` w 145 z 145 godzin, układ: koza, stół, cztery krzesła), gotuje się na kozie, która paliła się w 144 z 145 godzin.

## 3. Przebieg godzina po godzinie (skrót)

Pełne dzienniki: `glod/wyniki/godziny-silnik-11.log` (145 godzin, dni 12–17, zapas z podziałem na miejsca, kuchenka, koza, każda osoba z zajęciem, potrzebami, `wantsMeal`, `mealFor`),
`zdarzenia-silnik-11.log` (strumień zdarzeń na tickach: zmiany zajęć, posiłki, gotowania, zmiany zapasu, wyprawy). To samo bez racji: `godziny-bezracji-11.log`, `zdarzenia-bezracji-11.log`.

Doby (silnik, baza):

| dzień | zapas 6:00 | najedz. 6:00 | zdrowie 6:00 | godz. głodu<10 (noc/dzień) | Δ zdrowia: głód / zimno | posiłki ciepłe/zimne | gotowań | wypraw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | 35 | 14 | 80 | 5,2 (3,9/1,2) | −5,2 / −13,9 | 12/0 | 2 | 1 |
| 13 | 30 | 16 | 79 | 6,0 (4,8/1,2) | −6,0 / −25,8 | 7/4 | 2 | 3 |
| 14 | 29 | 7 | 60 | 11,1 (8,4/2,7) | −11,1 / −37,8 | 12/0 | 1 | 1 |
| 15 | 28 | 12 | 51 | 21,3 (11,3/10,1) | −21,3 / −59,6 | 3/10 | 2 | 3 |
| 16 | 30 | 10 | 35 | 25,3 (17,2/8,2) | −25,3 / −61,7 | 8/4 | 2 | 2 |
| 17 | 27 | 14 | 21 | 20,0 (17,7/2,3) | −20,0 / −43,5 | 10/1 | 2 | 2 |

(Godziny głodu to osobogodziny całego zarządu. Ciepły posiłek +45 najedzenia, zimna konserwa +30.)

Dlaczego dopiero od 14. dnia: średnie najedzenie przed posiłkiem spada z 26,8 (dzień 5, uchwała podpisana wieczorem) przez 20,0, 16,1, 17,2, 17,2, 17,1, 15,9, 14,8, 14,6 do 12,3 (dzień 14)
i 9,8 (dzień 15). Racje dają mniej, niż zarząd zużywa, więc deficyt narasta przez dziewięć dób, aż najedzenie wchodzi w pasmo poniżej 10. Do tego od dnia 14 mróz sięga −10°C i pogarsza posiłki
(w dniu 15 pierwszy garnek stanął dopiero o 15:04, bo kucharkę o 14:15 zabrała wyprawa, i 10 z 13 posiłków było zimnych).

Doba 15 co godzinę (zajęcie, najedzenie/zdrowie, liczba posiłków od 6:00; `WYPR` to osoba na wyprawie, jej potrzeby stoją):

```
godz  dwór  zapas | Maks | Marl | Hann | Agni | Ewel | Rena
00:00 -12.0  28+0  | sleep  25/28 a2 | guard  23/55 a2 | sleep  40/78 a2 | sleep  31/67 a2 | guard  18/41 a2 | sleep  29/60 a2
02:00 -12.3  28+0  | sleep  21/28 a2 | guard  14/55 a2 | sleep  35/79 a2 | sleep  27/64 a2 | guard   9/38 a2 | sleep  25/60 a2
04:00 -11.8  28+0  | sleep  16/28 a2 | guard   6/54 a2 | sleep  31/80 a2 | sleep  22/61 a2 | guard   0/33 a2 | sleep  20/60 a2
06:00 -10.7  28+0  | sleep  12/28 a2 | guard   0/52 a2 | -      23/81 a2 | sleep  18/58 a2 | sleep   0/27 a2 | sleep  16/60 a2
07:00  -9.9  26+0  | haul   38/29 a1 | sleep  29/51 a1 | haul   19/81 a0 | warm   14/58 a0 | sleep  29/25 a1 | haul   11/59 a0
09:00  -8.2  25+0  | chop   29/29 a1 | sleep  24/51 a1 | WYPR   10/81 a0 | WYPR   36/58 a1 | sleep  25/22 a1 | haul   33/55 a1
11:00  -6.8  28+0  | chop   20/27 a1 | sleep  49/51 a2 | eat     8/80 a0 | haul   34/58 a1 | sleep  49/20 a2 | WYPR   25/53 a1
13:00  -5.9  27+0  | haul   11/24 a1 | haul   42/52 a2 | warm   29/78 a1 | haul   25/56 a1 | haul   41/17 a2 | WYPR   25/53 a1
15:00  -5.8  31+0  | eat     2/20 a1 | cook   33/53 a2 | WYPR   23/78 a1 | WYPR   19/55 a1 | -      32/17 a2 | warm   20/52 a1
16:00  -6.1  28+2  | warm   29/17 a2 | -      28/53 a2 | WYPR   23/78 a1 | WYPR   19/55 a1 | -      28/17 a2 | -      60/52 a2
17:00  -6.5  30+2  | haul   24/17 a2 | haul   24/53 a2 | eat    21/78 a1 | eat    17/55 a1 | haul   23/17 a2 | haul   56/53 a2
19:00  -7.7  30+0  | warm   15/16 a2 | -      15/53 a2 | chop   57/78 a2 | warm   53/54 a2 | chop   14/17 a2 | -      47/54 a2
21:00  -9.1  30+0  | -      37/16 a3 | guard   6/52 a2 | warm   48/55 a2 | -      44/54 a2 | warm    6/14 a2 | guard  38/55 a2
23:00 -10.4  30+0  | sleep  30/17 a3 | guard   0/50 a2 | sleep  42/55 a2 | sleep  37/55 a2 | sleep   0/12 a2 | guard  29/55 a2
```

Kto co jadł w dobie 15: Marlena 6:30 zimna (0→30), 10:45 zimna (19→49), potem nic aż do 6:30 następnej doby i noc na warcie; Maksym 6:34 zimna (9→39), 15:40 zimna (0→30), 20:47 zimna (7→37);
Ewelina 6:34 (0→30), 10:44 (19→49), potem noc bez jedzenia; Agnieszka 7:34 zimna, 17:12 ciepła; Renata 8:49 zimna, 15:40 ciepła; Hanna 11:12 zimna, 17:12 ciepła. Maksym od 7:00 do 14:20
ścina i nosi drewno bez przerwy (najedzenie 38→5), bo rozkaz ścinania z silnika (`turaDrewna`) trafia zawsze do pierwszej wolnej osoby, a rozkazanego ścinania głód nie przerywa (`AUTO_JOBS`,
`sim.ts:547`, warunek w `work()`); w dniach 12–17 zaczął 29 z 49 ścięć.

## 4. Mechanizm z dowodem

### 4.1 Jaką uchwałę podpisuje silnik

Dziennik rąk (`g.dziennik`) i okna uchwał (`glod/okna-uchwal.ts`), Przymorze/11: dzień 1 okno `u_warty u_kociol u_meble` → `u_warty`; dzień 3 `u_brama u_racje u_meble` → `u_brama`; dzień 5 `u_racje u_meble` → `u_racje`;
dzień 7 `u_meble` → `u_meble`. Po tym `sim.st.laws.foodMult` to 0,75. Zwykły bot `playWithGov` podpisuje w tych samych oknach dokładnie to samo (dni 1, 3, 5, 7).

### 4.2 Arytmetyka racji

Najedzenie spada o 2 punkty na godzinę we śnie i 4 na nogach, przy racjach razy 1,1 (`src/sim/needs.ts:131`, `hungerRate`). Doba: 8 h snu i 16 h na nogach to 17,6 + 70,4 = 88,0 punktów (bez racji 80,0),
wartownik na nogach całą dobę 105,6. Posiłek daje 45 (ciepły) albo 30 (zimny), racje nie zmieniają siły posiłku (`satiety`). Dwa posiłki na dobę to 90 przy samych ciepłych i 60 przy zimnych. W dniach 12–17 zarząd
jadł 1,97 posiłku na osobodobę (limit), z czego 73% ciepłych, czyli średnio ok. 81 punktów przychodu na 88 rozchodu. Bez racji: 1,70 posiłku na osobodobę, bo jedzą poniżej 35 bez limitu, a w noc wchodzą na
średnio 48 (o 22:00; z racjami 31) i do 6:00 dochodzą do 31 (z racjami 12). Trzeci posiłek przy racjach (poniżej 10) zdarzył się 2 razy w 71 posiłkach, bo głód poniżej 10 łapie zarząd zwykle w nocy.

### 4.3 Co robią głodni (przebieg z racjami, 5 ziaren × dni 14–17, osobogodziny z najedzeniem poniżej 10, średnio na przebieg 66,9)

Śpiący w nocy 25,3 (38%), wartownik i dyżurny w nocy 22,6 (34%), w trakcie jedzenia za dnia 10,2 (15%: między zejściem poniżej 10 a końcem posiłku, droga do stołu i pół godziny jedzenia), noszenie 3,7, ścinanie 1,8, reszta 3,3.
W 100% tych godzin `mealFor` zwracał posiłek. Do tego 72,1 osobogodziny z najedzeniem poniżej 25, w których zarząd nie ma prawa jeść (limit dwóch posiłków), i 5,7 godziny oczekiwania na garnek
(chce jeść, najedzenie 15–25, jest ogień, nie ma garnka). Bez racji: godziny głodu 10,4 (noc, wartownik 7,5; jedzenie 2,5; ścinanie 0,3), limit nie istnieje (0,0), oczekiwanie na garnek 7,7.

### 4.4 Kontrola: ta sama gra bez racji (wariant `bez-racji`: okno uchwał dostaje listę bez `u_racje`, silnik bierze następną dozwoloną)

Przymorze, ziarna 11–15, dni 14–17, średnio na przebieg (żyje wszystkie pięć):

| wariant | śr. najedzenie 6:00 | zdrowie 6:00 dnia 17 | godz. głodu<10 (noc/dzień) | godz. zimna<15 | Δ zdrowia: głód / zimno / leczenie |
| --- | --- | --- | --- | --- | --- |
| baza (racje podpisane) | 14,8 | 31 | 66,9 (48,7/18,1) | 137,8 | −66,9 / −206,7 / +98,9 |
| bez racji | 30,4 | 56 | 10,4 (7,5/2,9) | 141,9 | −10,4 / −212,8 / +142,1 |

Inne dema (ziarna 11–13, dni 10–14): Lanciego głód 43,4 → 9,3, najedzenie 16,7 → 30,2, zdrowie 32 → 51. Zielonki to prawdziwy niedobór (zapas 0–5 od dnia 10, głód 559 → 599 godzin), tam racje nic nie zmieniają.

Przeżycie do 45 dni (koniec gry, `odwolanie`, ziarna 11–15): Przymorze 20, 28, 21, 24, 23 (śr. 23,2) → 31, 35, 36, 30, 26 (śr. 31,6); Lanciego 18, 18, 18, 18, 20 → 21, 20, 19, 18, 21 (18,4 → 19,8);
Zielonki 22, 20, 19, 18, 21 → 21, 20, 19, 19, 20 (20,0 → 19,8).

### 4.5 Zwykła gra bez silnika (bot `playWithGov` zawsze-warta, ta sama konfiguracja świata, gracz wypraw dziennych z `miasto-play.ts`)

Przymorze, ziarna 11–15, dni 8–16, zapas o 6:00 zwykle 12–22 porcje (skrajnie 6 i 30) przy 5–6 osobach zarządu. Z racjami: najedzenie 22,0, zdrowie dnia 16 równe 29, godziny głodu 49,8 (noc 37,9, dzień 11,9).
Bez racji: 36,8, 37, 10,6 (8,2/2,5). Ten sam objaw i ta sama poprawa, więc to nie jest cecha silnika, tylko wspólnej reguły „pierwsza dozwolona uchwała”. Dopiero w ziarnie 11 (dzień 17) zapas zwykłego bota schodzi do zera
i zaczyna się prawdziwy głód (118 godzin na dobę); do tego dnia zapas jest, a godziny głodu wynoszą 4–10 na dobę.

### 4.6 Związek z wcześniejszym badaniem zimy

Sekcja 3.3 badania z 20.10 („rano większość ma najedzenie poniżej 25 mimo jedzenia”) dotyczyła tego samego bota `zawsze-warta`, który (4.1) podpisuje racje w dniu 5. Pomiar o 6:00 trafia w dołek dnia (po 8 godzinach snu najedzenie
jest o 16–18 niższe niż wieczorem), więc część niskich poranków jest zwykłą regułą, ale głód poniżej 10 i utrata zdrowia pochodzą z racji.

### 4.7 Same reguły, bez botów i silnika

Skrypt `glod/regula.ts` (kod `pelna-gra`, atrapa bloku z `tests/unit/interior-mock.ts`, 4 osoby, ziarno 3, 14 dób): co rano dokładam drewno w składzie i jedzenie do 100 porcji, więc zapas nie jest żadnym ograniczeniem;
wartę przy bramie (od 20:00) wystawiam co noc jednej osobie albo nikomu; jedyna różnica to uchwała. Osobogodziny z najedzeniem poniżej 10 w dobach 2–14 (z 1248 możliwych), średnie najedzenie, o 6:00, najniższe:

| scenariusz | godz. głodu (z tego noc) | śr. najedzenie | o 6:00 | min |
| --- | --- | --- | --- | --- |
| bez uchwały, bez warty | 0,0 | 50,6 | 36,8 | 18 |
| racje, bez warty | 137,9 (114,2; śpiący 111,7) | 33,4 | 13,6 | 0 |
| bez uchwały, warta co noc | 10,9 (7,9; wartownik) | 49,0 | 30,4 | 0 |
| racje, warta co noc | 133,5 (113,6; śpiący 71,1, wartownik 41,2) | 34,2 | 12,8 | 0 |

Czyli samo prawo „Racje głodowe” zostawia śpiących z najedzeniem poniżej 10 przez ok. 9% czasu przy zapasie 100 porcji. Kontrakt z testu racji („nikt nie głoduje do zera”) trzyma w dobach 2 i 3 (minimum najedzenia 7 i 5)
i pęka w dobie 4 (minimum 0, 27,8 godziny głodu); godziny głodu na dobę w dobach 2–14: 4,6, 3,7, 27,8, 5,0, 9,9, 12,1, 6,1, 24,9, 9,9, 18,7, 6,3, 5,1, 3,9. Test racji tego nie widzi, bo patrzy na trzy doby.
Ten sam scenariusz z przełącznikami doświadczalnymi na kopii: głodny śpiący wstaje w nocy i je: racje bez warty 11,9 godziny (11,4 to czas samego jedzenia), racje z wartą 51,1; do tego głodny wartownik schodzi na posiłek:
racje z wartą 9,3, bez uchwały z wartą 3,4.

## 5. Hipotezy z briefu i wynik

| hipoteza | wynik |
| --- | --- |
| jedzenie wymaga gotowania, a kuchenka stoi | nie: koza paliła się w 144 z 145 godzin, ugotowano 10 z 11 rozpoczętych garnków (gotowały Ewelina 4 razy, Agnieszka, Hanna i Renata po 2, Marlena raz; 5 gotowań zaczęło się o 6–7 rano, 4 o 13–15), ciepłe posiłki to 73%; kuchenki z gazem w mieszkaniu zarządu nie ma w ogóle |
| porcje poza zasięgiem albo w składzie, do którego nikt nie idzie | nie: sterty leżą w innych mieszkaniach bloku i na podwórku, ale jedzenie i gotowanie biorą z dowolnej sterty bez chodzenia; rozliczenie 86 zmian zapasu w dniach 12–17: 75 ma przyczynę w tym samym ticku (posiłek zarządu, koniec gotowania, powrót z łupem), a 11 spadków (łącznie 13 porcji) bez posiłku zdarzyło się zawsze przy gościach stojących pod bramą, czyli to koszty wydarzeń zarządu |
| zimno albo choroba blokuje jedzenie | nie: w `think` jedzenie jest przed ogrzewaniem i pracą; choroba to jednorazowe −20 zdrowia z wydarzenia (`sicken` w `src/sim/gov.ts`), jedzenia nie rusza; zimno daje 76% utraty zdrowia (zimno i głód razem), ale jedzenia nie blokuje |
| posiłki tylko o 13 i 19, a najedzenie spada szybciej | nie: wspólny kocioł nie jest podpisany (`sharedMeals` fałsz); posiłki są pojedyncze, pierwszy mediana 6:36, drugi 14:30, 38% posiłków kończy się o 6:xx; limit dwóch na dobę wynika z racji |
| wyprawa zabiera ludzi w porze posiłku | prawie nie: 12 wypraw w sześć dób, potrzeby osoby na wyprawie stoją, po powrocie je od razu; raz wyprawa zabrała kucharkę (dzień 15, 14:15) i garnek spóźnił się o godzinę |
| jedzą mieszkańcy, a nie zarząd | nie: mieszkańcy nie mają głodu w symulacji i nie ruszają zapasu; spadki zapasu poza posiłkami zarządu to 13 porcji w sześć dób (koszty wydarzeń, patrz wyżej) |

## 6. Rozstrzygnięcie

Luka silnika, wzmocniona kosztem zasad. Czego rozsądny gracz by nie zrobił: nie podpisałby „Racji głodowych” (nazwa mówi, co robią) przy zapasie, który sam utrzymuje wyprawami na 2 porcje na głowę. Silnik robi to z reguły
„pierwsza dozwolona”, którą odziedziczył po bocie. Dotyczy to graczy tylko wtedy, gdy podpiszą tę uchwałę; bez niej głód zarządu jest rzadki (10 osobogodzin na 4 doby i 6 osób). Nie znalazłem błędu w drodze jedzenia
(gotowanie, zasięg zapasu, rozliczanie porcji, wyprawy), więc czerwonego testu na grze nie ma i nic w niej nie poprawiałem.

Koszt zasad, który zostaje do decyzji Mateusza: w nocy nikt nie je, nawet z wielkiego głodu, choć komentarz przy `wantsMeal` (`sim.ts:3431`) mówi „z wielkiego głodu zawsze”, a test racji (`tests/unit/racje.test.ts:83`)
zakłada, że „nikt nie głoduje do zera” (na 3 dobach bez wart). Przy racjach i nocnych wartach ta obietnica nie zachodzi, i to bez udziału silnika (4.7: przy 100 porcjach w zapasie śpiący są poniżej 10 przez ok. 9% czasu).
Nie poprawiałem tego w grze, bo to zmiana zachowania snu i wart, a koszt zdrowotny racji jest zamierzony (opis z 0.3: „Wkurzenie +0,4 dziennie i więcej chorych”). Spróbowałem najmniejszej poprawki dla śpiących (rozdział 8a):
działa, ale łamie test racji, bo racje oszczędzają jedzenie właśnie dlatego, że głodzą. Wybór między poprawą snu i warty a liczbami racji (rozdział 8) jest projektowy.

Opis uchwały w nowej grze (`src/gov/tresc.ts:99`) pomija główny koszt: „Jedzenie schodzi o 25% wolniej. Wkurzenie +0,4 dziennie.” W 0.3 było jeszcze „i więcej chorych” (`src/content/data.ts:546`). Zmierzone
oszczędności to ok. 15% porcji (8,9 porcji na dobę wobec 10,5), nie 25%, bo zarząd je częściej (11,8 posiłku na dobę wobec 10,5).

## 7. Poprawka

Gra: brak zmian. Bramka dla niezmienionej gałęzi: `npm run bot` skrót 6e21928c (45 dni) i 701b05aa (3 doby), `npm run bot:zombie` e8b827a5 (warta-dzidy) i f28b3642 (bez-warty), czyli te same, co w briefie.

Silnik (do zastosowania w drzewie `osada-ai`, ścieżka łatki wyżej): w `oknoSilnika` przy oknie uchwały pominąć `u_racje` na liście, którą dostaje `oknoPodstawowe` (`silnikPodstawowy` bez zmian, żeby zostać równoważny
z `playWithGov`). Test `tests/unit/ai-uchwaly.test.ts` w łatce: na silniku sprzed zmiany czerwony („expected true to be falsy”: `u_racje` podpisane), po zmianie zielony; drugi test pilnuje, że silnik podstawowy dalej bierze
pierwszą dozwoloną (racje). Wszystkie testy `ai-*` na kopii z łatką: 5 plików, 159 zdanych, 1 do zrobienia. Łatka daje dokładnie ten sam przebieg co wariant `bez-racji` z 4.4 (skrót gry po 25 dobach 444b6d30 w obu), więc liczby przeżycia z 4.4 to jej skutek. Uprząż silnika (`node tools/bot-osada.ts --ziarna=11-15 --dni=45 --bez-progu`)
na kopii bez łatki i z łatką (logi `glod/wyniki/bot-osada-baza.log` i `bot-osada-lataka.log`): Przymorze koniec w dniach 20, 28, 21, 24, 23 → 31, 35, 36, 30, 26; Lanciego 18, 18, 18, 18, 20 → 21, 20, 19, 18, 21;
Zielonki 22, 20, 19, 18, 21 → 21, 20, 19, 19, 20. Werdykt uprzęży dalej „nie przechodzi” (0 z 5 przeżyło 45 dni na każdym demie), więc łatka usuwa jedną przyczynę skrócenia gier, nie wszystkie (reszta to zimno).

## 8. Co by pomogło w balansie (liczb w grze nie zmieniałem)

Pomiar na silniku z racjami (kopia z przełącznikami `GL_*`), Przymorze, ziarna 11–15, dni 14–17, średnio na przebieg:

| zmiana | najedz. 6:00 | zdrowie 6:00 dnia 17 | godz. głodu<10 (noc/dzień) |
| --- | --- | --- | --- |
| baza (racje: limit 2, próg 25, głód ×1,1) | 14,8 | 31 | 66,9 (48,7/18,1) |
| silnik nie podpisuje racji | 30,4 | 56 | 10,4 (7,5/2,9) |
| racje z limitem 3 posiłków | 19,6 | 39 | 24,8 (18,2/6,6) |
| racje z progiem 35 | 20,5 | 35 | 36,9 (26,6/10,3) |
| racje bez przyspieszenia głodu ×1,1 | 20,6 | 32 | 41,5 (24,6/16,9) |
| głodny śpiący wstaje w nocy i je (poniżej 10) | 20,9 | 49 | 31,9 (20,2/11,7) |
| to samo i głodny wartownik schodzi na posiłek | 35,0 | 62 | 7,8 (5,4/2,4) |

Pojedyncze liczby (limit 3, próg 35, brak ×1,1) tylko łagodzą, bo ruszają część mechanizmu. Rozstrzyga noc: gdy głodny może zjeść w nocy, także na warcie, racje przestają głodzić nawet z limitem 2 (7,8 godziny wobec 66,9). Koszt ostatniego wiersza:
wartownik opuszcza posterunek (nie sprawdzałem skutków dla napadów). Ciągle zostaje pytanie, czy racje mają coś dawać: oszczędność ok. 15% porcji za 6-krotnie więcej godzin głodu i brak leczenia
(leczenie wymaga najedzenia powyżej 30) wygląda na zły interes, a opis uchwały tego nie mówi.

Po stronie silnika poza racjami (nie robiłem): karta nocy wystawia wartownika i dyżurnego według sił i zdrowia, bez najedzenia (`wartaPrzySiatce` w `src/ai/silnik.ts`, `dyzurNaKarcie` w `src/ai/zima.ts`),
więc na noc idą ludzie z najedzeniem 6–11; `turaDrewna` posyła do ścinania zawsze pierwszego wolnego (Maksym 59% ścięć, jego zdrowie 87→17 w dniach 12–16); `jedzenieNaGlowe` liczy 10 mieszkańców, którzy z zapasu nie jedzą,
więc silnik uważa 28 porcji (4,7 na osobę zarządu) za granicę niedoboru.

## 8a. Próba poprawki w grze (zbadana i cofnięta, bez commita)

Najmniejsza zmiana, jaką znalazłem: głodny śpiący (najedzenie poniżej `STARVING`) wstaje w nocy i je, a w `think` z wielkiego głodu najpierw je, potem śpi. Dwa miejsca w `src/sim/sim.ts` (sen, `think`), razem 11 dodanych i 2 usunięte linie z komentarzami.
Łatka: `glod/gra-noc-glod.patch`, test: `glod/gra-noc-glod.test.ts` (miał być nowym plikiem `tests/unit/glod-w-nocy.test.ts`: atrapa bloku, racje, pełna spiżarnia; śpiący z najedzeniem 6 wstaje i je, najedzony śpi dalej,
pięć dób bez śpiących z najedzeniem poniżej 10). Przed zmianą 2 z 3 czerwone (śpiący nie je przez dwie godziny; 46,3 osobogodziny śpiących z najedzeniem poniżej 10 w pięć dób), po zmianie wszystkie zielone.

Cały zestaw po zmianie: 262 pliki, 5896 zdanych, 1 padł, 1 oczekiwana porażka, 8 pominiętych. Pada jedyny test, `tests/unit/racje.test.ts:86` („racje: zjedzone co najmniej o 15% mniej”): z poprawką zarząd zjada w 3 doby 13 porcji
wobec 14 bez uchwały (wymagane najwyżej 11,9), czyli oszczędność racji spada z co najmniej 15% (tego pilnuje test) do ok. 7%. Racje oszczędzają jedzenie dlatego, że zostawiają ludzi głodnych, więc poprawka psuje ich jedyną zaletę, a to już decyzja o balansie,
nie naprawa błędu. Skróty bota po zmianie: `npm run bot` 45 dni d3ad7f01 (było 6e21928c), 3 doby 701b05aa (bez zmian), `npm run bot:zombie` e8b827a5 i f28b3642 (bez zmian). Pomiar na silniku z racjami (przełączniki `GL_NOC_JEDZENIE`,
tabela w rozdziale 8): godziny głodu 66,9 → 31,9, zdrowie dnia 17 31 → 49. Zmianę cofnąłem, gałąź jest bez zmian i bez commita.

## 9. Czego nie sprawdziłem

Skutków dla obrony, gdyby wartownik schodził na posiłek. Zielonek poza stwierdzeniem, że tam zapas kończy się około dnia 10 i racje niczego nie zmieniają. Dnia 18 i dalej (po dniu 17 zdrowie jest już bliskie zera
i wyniki zależą od zimna). Trybu zombie. Zachowania ludzi pod prawdziwym interfejsem (czy gracz mógłby rozkazem przerwać głodującemu wartę), bo uprząż działa przez te same polecenia, ale nie klika. Wpływu `u_meble`
podpisanego w dniu 5 zamiast racji: w wariancie `bez-racji` silnik bierze wtedy `u_meble`, a wyniki głodu wychodzą takie same jak w wariancie, w którym nie podpisuje nic.

## 10. Postscriptum: drzewo `osada-ai` po zmianach zadania 5 (snapshot z 6:13–6:20, drzewo jest w trakcie edycji)

Bieżące `src/ai/okna.ts` (nowy plik) wybiera uchwały inaczej: w pierwszym oknie `u_kociol`, przy głodzie (poniżej 1 porcji na głowę) kocioł albo racje (`RACJE` w liniach 72 i 174, komentarz: „racje zmniejszają zjadanie o ćwierć”),
a bez potrzeby pierwszą dozwoloną. W grze Przymorze/11 daje to dzień 1 `u_kociol`, 3 `u_zebrania`, 5 `u_racje`, 7 `u_meble` (`foodMult` 0,825, wspólne posiłki o 13 i 19). Racje wchodzą więc dalej, z reguły „pierwsza dozwolona”
w dniu 5, i nadal pogarszają głód, tylko słabiej, bo posiłki są wspólne, limit dwóch na dobę nie działa (w `wantsMeal` gałąź kotła jest przed racjami), a racje odbierają kotłowi większą porcję (1,1 → 0,825, syci jak 1,0) i dodają głód ×1,07.
Pomiar wariantu `bez-racji` na tym snapshocie (Przymorze, ziarna 11–15, dni 14–17, średnio na przebieg): najedzenie o 6:00 38,3 → 50,6, godziny głodu poniżej 10 49,0 (24,1/24,9) → 24,5 (11,4/13,1), zdrowie dnia 17 49 → 51;
przeżycie do 45 dni Przymorze 26, 34, 25, 25, 27 → 29, żyje, 32, 29, 32; Lanciego 21, 22, 25, 30, 20 → 26, 21, 26, 27, 24; Zielonki 19, 19, 19, 25, 26 → 18, 18, 19, 22, 31. Głód przy zapasie zostaje w tym
snapshocie także bez racji (24,5 godziny poniżej 10 w dniach 14–17, w tym 53,4 osobogodziny z najedzeniem poniżej 25, w których wspólne posiłki nie pozwalają jeść), a w grze z racjami nasila się od dnia 16 (najedzenie rano 25 i 15
w dniach 16 i 17 przy zapasie 39–44 porcje); tych przyczyn nie rozbijałem.
Wniosek dla zadania 5: wyrzucić `RACJE` z `naGlod` i z zapasowego `mozna[0]` w `wyborUchwaly` (łatka z rozdziału 7 dotyczy starszego `oknoSilnika` i nie zastosuje się bez zmian, idea ta sama); test z `ai-uchwaly.test.ts` da się przenieść
jako „silnik nie podpisuje `u_racje` do dnia 8”.

## 11. Jak powtórzyć

Wszystko w `scratchpad/glod/` (uruchamiać z katalogu drzewa roboczego, domyślny kod to `kopia/`):

```
node poranki.ts 11 19                      # poranki 6:00 (tabela z briefu)
node godziny.ts 11 12 17 godziny.log zdarzenia.log   # dziennik godzinowy i zdarzeń; WARIANT=bez-racji dla gry bez racji
node eksp.ts baza 11 12 17                 # tabela dobowa, głód, zimno, zdrowie (wariant bez-racji też)
node regula.ts 14 3                        # same reguły w atrapie bloku (DOBY=1 wypisuje doby; DRZEWO=.../kopia GL_NOC_JEDZENIE=1 dla przełączników)
node macierz.ts baza,bez-racji 11-15 14 17 przymorze      # macierz ziaren (GL_RATION_MEALS=3, GL_RATION_HUNGRY=35, GL_BEZ_HUNGER_RATE=1,
                                                          #  GL_NOC_JEDZENIE=1, GL_WARTA_JE=1 działają na kopii)
node przezycie.ts 45 11-15 przymorze,lanciego,zielonki baza,bez-racji   # przeżycie, procesy równolegle
KOD=.../kopia node baza-macierz.ts 11-15 22 8 16 przymorze  # zwykły bot z racjami i bez (GL_BEZ_RACJI w kopii gov-play.ts)
python3 -I kompakt2.py wyniki/godziny-silnik-11.log 15       # widok doby; posilki.py, zapas.py liczą posiłki i rozliczają zapas
```

Wszystkie pomiary deterministyczne (bez `Math.random`), na zamrożonej kopii kodu.
