<!-- Raport końca etapu 1 osady AI z 24.10.2026 (zadanie 7, krok 3 planu: stop, bo bramka przeżycia nie przechodzi). Skrypty pomiarowe, sondy i surowe wyniki leżały w notatkach sesji i nie trafiły do repo; komendy do powtórzenia głównych liczb są w rozdziale 10. -->

# Osada AI, etap 1: silnik gra, bramka przeżycia nie przechodzi

Status: stop z planu. Silnik decyzji jest zbudowany i gra pełną grę. Cel kontrolny etapu (przeżycie 45 dni w 4 z 5 ziaren na każdym z trzech dem, kamień ludności, budowle) nie jest osiągnięty, więc budowa staje, a decyzja należy do Mateusza. Cztery decyzje z rekomendacjami są w rozdziale 9.

Gałąź `osada-ai`, kod i bramka na 0219928 (ten raport to następny commit, sam dokument), na `pelna-gra` po scaleniu etapów 4–5 wydarzeń (da7dbfe). Nic nie wypchnięte. Zasad gry nie zmieniałem: etap zmienia tylko `src/ai/`, uprząż `tools/bot-osada.ts` (jedna zmiana: łańcuchy kart w konfiguracji „jak w przeglądarce”), testy `tests/unit/ai-*` i ten raport.

Tabele pochodzą z oficjalnej uprzęży (`npm run bot:osada`), która gra z łańcuchami kart tak, jak gra w przeglądarce. Liczby bez łańcuchów (uprząż z commitu 5e64828, taka była do decyzji koordynatora) stoją obok jako porównanie.

## 1. Najkrócej

1. Silnik prowadzi grę od pierwszej minuty do końca tymi samymi rękami co gracz: polecenia w grze i odpowiedzi w oknach zarządu. Ma warstwy zimy, jedzenia, rozwoju i okien, pamięć w zwykłym JSON, nie losuje i nie zna zegara ani DOM. W `src/ai/` jest 1800 linii, w testach `tests/unit/ai-*` 5500 linii (354 testy, wszystkie zielone).
2. Na 120 przebiegach oficjalnej uprzęży (ziarna 11–50, gra z łańcuchami kart jak w przeglądarce) 45. dnia dożywają: Przymorze 33 z 40 (82%), Lanciego 18 z 40 (45%), Zielonki 0 z 40. Wymagane jest 80% na każdym demie. Bez łańcuchów (porównanie) było 27, 13 i 0 z 40.
3. Kamień ludności jest w terminie na Przymorzu (40 z 40) i Lanciego (39 z 40), na Zielonkach w 9 z 40. Budowli na koniec jest średnio 4,2 na Przymorzu, 1,3 na Lanciego i 1,3 na Zielonkach, wymaganych jest 15.
4. Wszystkie 149 przegranych gier ze 240 przebiegów (ziarna 11–50, z łańcuchami i bez) kończy odwołanie zarządu (wkurzenie 100), ani razu pustka czy exodus. Zielonki: głód w 40 z 40 grach. Lanciego: głód w 18 z 22 przegranych. Przymorze: w 5 z 7 przegranych głodu nie ma, wkurzenie robią napady szabrowników i dryf z potrzeb.
5. Nowe wydarzenia z etapów 4–5 (narrator, odstęp kart 110–200 s, dwanaście łańcuchów) niczego w silniku nie zepsuły. Na 13 tysiącach okien z 60 gier żadne nie zostało otwarte po odpowiedzi silnika, wybór nie zależy od ukrytych rzutów, a na przeżycie nowe wydarzenia nie wpływają (+0,3 ± 0,7 dnia na 120 parach).
6. Dwóch przyczyn silnik sam nie usunie. Zielonki mają w zasięgu 17 porcji jedzenia w jednym sklepie: z okolicą Przymorza żyją o 7,7 dnia dłużej, ale każda przegrana gra dalej kończy się głodem. Deski: ze 300 deskami na starcie budowli jest 10, 8 i 6 zamiast 4, 1 i 1, a przeżycie na blokach bez zmian; 15 budowli nie wychodzi nawet wtedy.
7. Uprząż grała najpierw bez łańcuchów kart, choć gra w przeglądarce ma je domyślnie. Po decyzji koordynatora `przygotujGre` włącza je w konfiguracji „jak w przeglądarce” (opcja `lancuchy` w grze decydenta; `--prosto` zostaje gołą grą), więc oficjalne liczby są z łańcuchami. Testy przebiegów zmierzyłem ponownie na nowej trajektorii: wszystkie zielone, jedna granica zmieniona (rozdział 4.4).
8. Rekomendacja: ruszać z etapem 2 na tym silniku, zmienić miary bramki na takie, które pytają o to, czego potrzebuje gra, wybór kwadratu dla osady AI uzależnić od jedzenia w zasięgu i nie zmieniać zasad gry pod silnik.

## 2. Bramka

### 2.1 Komendy (na 0219928)

| komenda | kod | wynik |
| --- | --- | --- |
| `npm run bot:osada` | 1 | werdykt NIE PRZECHODZI (niżej), 62 s; z `--bez-progu` kod 0 i ta sama tabela |
| `npm test` | 0 | 280 plików, 6603 zdane, 1 oczekiwana porażka, 8 pominiętych, 1 todo (149 s) |
| `npx biome check src tests tools index.html` | 0 | 614 plików, czysto |
| `npx tsc -p . --noEmit` | 0 | czysto |
| `npm run build` | 0 | typy i build |
| `npm run bot` | 0 | skrót stanu d3ad7f01, po 3 dobach 701b05aa |
| `npm run bot:zombie` | 0 | warta-dzidy 0c2b02dd, bez-warty 7fd3bed5 |
| `npx vitest run tests/unit/ai-` | 0 | 8 plików, 354 zdane, 1 todo |

Skróty botów zgadzają się z podanymi dla tej bazy. W `src/ai/` nie ma `Math.random`, zegara, DOM, modułów Node ani importów z `tests/` i `tools/` (grep).

### 2.2 Cel kontrolny na demach

Cel: przeżycie 45 dni w 4 z 5 ziaren (80%), pierwszy kamień ludności (10 osób) najpóźniej w dniu 15 w 4 z 5, na koniec co najmniej `floor(45 / 3)` = 15 stojących budowli (bez zasieków i barykady) w 4 z 5.

| demo, kryterium | oficjalna uprząż (z łańcuchami), ziarna 11–15 | oficjalna uprząż, 40 gier (ziarna 11–50) | bez łańcuchów (porównanie), ziarna 11–15 | bez łańcuchów (porównanie), 40 gier |
| --- | --- | --- | --- | --- |
| Przymorze, przeżycie | 5 z 5 | 33 z 40 (82%) | 3 z 5 | 27 z 40 (68%) |
| Przymorze, kamień w terminie | 5 z 5 | 40 z 40 | 5 z 5 | 40 z 40 |
| Przymorze, budowle | 4–5 (0 z 5 przebiegów spełnia) | średnio 4,2 | 4–5 (0 z 5) | średnio 4,1 |
| Lanciego, przeżycie | 4 z 5 | 18 z 40 (45%) | 2 z 5 | 13 z 40 (33%) |
| Lanciego, kamień w terminie | 5 z 5 | 39 z 40 | 5 z 5 | 40 z 40 |
| Lanciego, budowle | 1–2 (0 z 5) | średnio 1,3 | 1–2 (0 z 5) | średnio 1,4 |
| Zielonki, przeżycie | 0 z 5 | 0 z 40 | 0 z 5 | 0 z 40 |
| Zielonki, kamień w terminie | 1 z 5 | 9 z 40 | 0 z 5 | 8 z 40 |
| Zielonki, budowle | 2 (0 z 5) | średnio 1,3 | 2 (0 z 5) | średnio 1,3 |

Dwie uwagi o liczbach. Piętnaście przebiegów to szum rzędu ±2 dni: seria 11–15 dała 5 z 5 na Przymorzu i 4 z 5 na Lanciego, a 40 gier daje 82% i 45%. Decyzje opieram na 120 przebiegach. Druga uwaga: przebieg, który kończy się odwołaniem w dniu 45 przed 15:00 (Przymorze 11 bez łańcuchów), liczy się jako nieprzeżyty, bo gra dożywa 45 dób dopiero o 15:00 dnia 46.

Dni końca gier w serii 11–15 (żyje = dożył 45 dób):

| demo | część A (fabc8b7) | nowa baza, oficjalna uprząż (z łańcuchami) | nowa baza bez łańcuchów (porównanie) |
| --- | --- | --- | --- |
| Przymorze | żyje, żyje, żyje, 24, żyje (śr. 40,8; 4 żyje) | żyje ×5 (45,0; 5) | 45, żyje, 37, żyje, żyje (43,4; 3) |
| Lanciego | żyje, 27, 28, 35, 27 (32,4; 1) | żyje ×4, 29 (41,8; 4) | 35, 25, żyje, żyje, 32 (36,4; 2) |
| Zielonki | 25, 21, 21, 23, 27 (23,4; 0) | 25, 26, 27, 30, 26 (26,8; 0) | 30, 23, 21, 26, 22 (24,4; 0) |
| razem | 32,20; 5 z 15 | 37,87; 9 z 15 | 34,73; 5 z 15 |

## 3. Droga strojenia: tabele z zadań 2–7

Średni dzień końca gry na 15 przebiegach (ziarna 11–15, przebieg, który dożył 45 dni, liczony jako 45). Baza gry zmieniała się przy scaleniach z `noc-integracja`, więc wiersze nie porównują się co do dnia, tylko co do kierunku; porównania parami na tym samym kodzie gry są w rozdziałach 4 i 7.

| zadanie | co dołożyło | 15 przebiegów | żyje |
| --- | --- | --- | --- |
| 2 | uprząż `bot:osada` i silnik podstawowy (jak bot `zawsze-warta`) | 16,5 (Przymorze 15,4, Lanciego 17,6, Zielonki 16,6) | 0 z 15 |
| 3 | warstwa zimy: koza z beczki w pokoju zarządu, drewno na noce, dyżur przy kozie | 18,6 (18,8, 17,0, 20,0) | 0 |
| 4 | warstwa jedzenia: wyprawy po jedzenie, ogródek | 20,5 (23,2, 18,4, 20,0) | 0 |
| 5 | okna zarządu (ocena skutków na kopiach, kocioł w pierwszym oknie, bez racji), rozwój (badania, budowy, Praca, werbunek) | 28,3 (Przymorze 35,2, Lanciego 24,8, Zielonki 24,8) | 1 |
| 6 | ocena wyboru bez znajomości losu; `t_ambu` na końcu kolejki badań | 25,5 → 27,4 po scaleniu znajomych, zwierząt i ścieżki (Przymorze 29,4 → 35,2, Lanciego 24,2, Zielonki 22,8) | 0 |
| 7, część A | po scaleniu nocnego posiłku: baza → reguła uczciwości → werbunek według zasad gry | 29,4 → 31,7 → 32,2 (po werbunku Przymorze 40,8, Lanciego 32,4, Zielonki 23,4) | 1 → 3 → 5 |
| 7, część B | po scaleniu wydarzeń etapów 4–5: oficjalna uprząż z łańcuchami / bez łańcuchów (porównanie) | 37,9 / 34,7 | 9 / 5 |

Na 60 przebiegach (ziarna 11–30): zadanie 6 dało 27,03 → 28,65; zadanie 7, część A: 30,32 → 30,78 (uczciwość) → 33,72 (werbunek; 24 z 60 żyje); część B: 34,55 (27 z 60) w oficjalnej uprzęży z łańcuchami i 33,00 (20 z 60) bez łańcuchów (porównanie).

Co dawała każda zmiana, z błędem średniej:

| zmiana | skutek | pomiar |
| --- | --- | --- |
| zima (zadanie 3) | Przymorze +3,4 dnia, Zielonki +3,4, Lanciego bez zysku (sypialnie bez okna, koza z beczki tam nie stanie) | 15 przebiegów |
| jedzenie (zadanie 4) | Przymorze +4,4, Lanciego +1,4, Zielonki 0 (17 porcji w zasięgu) | 15 przebiegów |
| okna i rozwój (zadanie 5) | 22,9 (odpowiedź domyślna na wydarzenia) → 27,7 dnia; osobno: uchwały tylko według potrzeb (kocioł, nigdy racje) +2,8, warstwa rozwoju +2,2, waga pożaru +1,1, waga łaty +0,9 (błąd średniej ±1,5 dnia) | 30 przebiegów |
| `t_ambu` (zadanie 6) | +2,54 ± 0,67 dnia (Przymorze +4,2, Lanciego +3,4, Zielonki +0,1) | 120 par |
| reguła uczciwości (zadanie 7A) | +0,47 ± 1,09: silnik przestał znać ukryte rzuty bez straty wyniku | 60 par |
| werbunek wędrowców (zadanie 7A) | +2,44 ± 0,76 na ziarnach strojenia, +1,67 ± 0,77 poza nimi (ziarna 31–65) | 120 i 105 par |
| nocny posiłek w grze (scalenie 64aee1f) | +1,67 ± 1,08 dnia (Lanciego +4,55 ± 2,20) | 60 par |

## 4. Nowe wydarzenia z etapów 4–5 a silnik

### 4.1 Czy silnik odpowiada na każde okno

Rodzaje okien zarządu (`Prompt.k`) się nie zmieniły: raport, uchwała, karta nocy, wydarzenie i epilog zwycięstwa. Kroki dwunastu łańcuchów są zwykłymi oknami `wydarzenie` z własnym id (`swiatlo_1`, `szczekanie_2`…), więc idą tą samą drogą co karty z puli. W grach zwykłego trybu kroki nie mają wyborów „zostaje”, czyli okien wieloetapowych nie ma.

Okna w jednej długiej grze na demo (ziarno 11, 45 dni, z łańcuchami) i w przeglądzie 60 gier (3 dema × ziarna 11–30, 25 dni, 19 gier skończyło się wcześniej):

| gra | wydarzenie | uchwała | karta nocy | raport | wieloetapowe | otwarte po odpowiedzi silnika | zawieszone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Przymorze 11 (żyje 45 dni) | 285 | 44 | 45 | 45 | 0 | 0 | 0 |
| Lanciego 11 (żyje 45 dni) | 289 | 44 | 45 | 45 | 0 | 0 | 0 |
| Zielonki 11 (odwołanie w dniu 25) | 150 | 23 | 24 | 23 | 0 | 0 | 0 |
| 60 gier po 25 dni | 9178 | 1361 | 1421 | 1402 | 0 | 0 | 0 |

W przeglądzie wątkami sezonu było wszystkie dziewięć łańcuchów trybu zwykłego (`szczekanie` w 38 grach, `swiatlo` 28, `aktywistka` 24, `ostrzega` 20, `list` 18, `pluca` 16, `dlug` 15, `woda` 15, `puszki` 6) i silnik odpowiedział na wszystkie 24 ich kroki, razem 453 razy. Trzy łańcuchy tylko dla zombie (`dach`, `dobicie`, `glos`) nie wchodzą do trybu zwykłego i są sprawdzone na atrapie (rozdział 4.2). Czas silnika na okno wydarzenia: mediana 1,7–2,6 ms, p95 do 15 ms, najdłuższe 43 ms (maszyna z obciążeniem 14–20, więc to raczej górna granica).

### 4.2 Uczciwość

Reguła uczciwości z części A (silnik nie zna ukrytych rzutów kart: haczyk gościa, `halas.cat`, `krzyk.help`) obejmuje łańcuchy bez zmian w kodzie. Treść łańcuchów nie ma nowych ukrytych rzutów: jej losowania to wygląd i płeć osób, a gość z karty ma haczyk „prawda” albo ugryzienie zapisane w skrypcie kroku. Sprawdzone trzema drogami:

- Audyt w prawdziwych grach z łańcuchami (4 gry po 20 dni, 493 okna, plus test w repo na 12 dni): w każdym oknie przerzucone po kolei wszystkie pola logiczne i liczbowe danych karty, które nie zmieniają tego, co widać, i podstawiony każdy możliwy haczyk gościa (265 podstawień). Wybór silnika zmienił się 0 razy. Audyt widzi znane ukryte rzuty (`halas.cat`, `krzyk.help`), więc nie przechodzi na pustym warunku; mutant bez przelosowania ukrytych rzutów łamie test (15 zmian wyboru).
- Test na atrapie (`tests/unit/ai-lancuchy.test.ts`, 25 scenariuszy: blok, dom, zwykły, zombie): silnik odpowiada na każdy krok każdego łańcucha dozwolonym wyborem, okno się zamyka, wybór nie zależy od prawdziwego generatora ani od ziarna zarządu (imiona, twarze, płeć).
- Dwa testy równoważności z botem (`playWithGov`) przestały trafiać w gałąź przydziału warty z karty nocy po zmianie kolejności kart (odstęp 110–200 s i narrator); dostały nowe ziarna (Lanciego 18, Zielonki 14), a do tego jest test równoważności z łańcuchami.

Granice, które zostają. W trybie zombie kroki `dach` i `dobicie` mają w skrypcie ukryte ugryzienie, które kopia zarządu zna (to skrypt, nie rzut, ale silnik nie powinien go znać; tryb zombie jest poza etapem 1). Wagi haczyka gościa w silniku nie znają narratora (po dobie spokoju haczyki inne niż „prawda” mają wagę ×1,5), więc ocena jest trochę za ufna wobec gości po spokoju; to trafność, nie uczciwość.

### 4.3 Wpływ na przeżycie

Pary na tych samych demach i ziarnach (ziarna 11–50, 120 par; przebieg, który dożył 45 dni, liczony jako 45):

| porównanie | dzień przed | dzień po | różnica | żyje (z 120) |
| --- | --- | --- | --- | --- |
| część A → nowa baza bez łańcuchów (narrator i odstęp kart) | 33,62 | 33,27 | −0,35 ± 0,73 | 45 → 40 |
| nowa baza bez łańcuchów → z łańcuchami | 33,27 | 33,89 | +0,62 ± 0,78 | 40 → 51 |
| część A → nowa baza z łańcuchami (oficjalna uprząż, razem) | 33,62 | 33,89 | +0,27 ± 0,73 | 45 → 51 |

Razem według dem: Przymorze −0,38 ± 0,92, Lanciego +0,70 ± 1,86, Zielonki +0,47 ± 0,72. Nowe wydarzenia nie zmieniły mierzalnie siły silnika. Ten wynik pozwala wyłączyć łańcuchy w grze osady AI (rozdział 8) bez straty siły.

### 4.4 Uprząż gra teraz z łańcuchami, testy przebiegów zmierzone ponownie

Do pierwszej wersji tego raportu `tools/bot-osada.ts` składał grę bez opcji łańcuchów, więc `npm run bot:osada` grał bez nich, choć nagłówek uprzęży mówił „gra jak w przeglądarce”. Tabele z zadań 2–7A nie są przez to fałszywe: łańcuchów nie było wtedy w kodzie gry (weszły ze scaleniem etapów 4–5 wydarzeń). Koordynator rozstrzygnął, że oficjalna uprząż ma mierzyć grę, jaką widzi gracz, a nowa gra w przeglądarce ma łańcuchy domyślnie. Dlatego `przygotujGre` ustawia `lancuchy: true` w konfiguracji „jak w przeglądarce”, a `--prosto` zostaje gołą grą. Opcja `lancuchy` w `nowaGraAi` robi to samo co `newGov(seed, mode, true)` w `src/main.ts`. Wynik oficjalnej uprzęży jest bit w bit taki jak wcześniejszy pomiar na kopii z jedną dopisaną linią (skróty 15, 60 i 60 przebiegów z ziaren 31–50 identyczne).

Testy, które grają przez `przygotujGre(…, false)`, poszły na nowej trajektorii. Wszystkie 354 testy zostały zielone, ale liczby w ich komentarzach pochodziły z gry bez łańcuchów (i częściowo sprzed nocnego posiłku), więc zmierzyłem je ponownie. Przebieg Przymorza 11 i Zielonki 11, 12 i 14, z łańcuchami (w nawiasie bez łańcuchów):

| co mierzy test | zmierzone | granica w teście |
| --- | --- | --- |
| zapas o 6:00 w dniach 2–15, najmniej | 11 porcji w dniu 11 (8 w dniu 8); bez warstwy jedzenia 0 | co najmniej 5, bez zmian |
| zdrowie zarządu rano 12. dnia | 92,9 (84,8); bez warstwy 35,7 | co najmniej 70, bez zmian |
| najedzenie rano w dniach 15–18, średnio | 59,3: 64,4, 62,5, 50,3, 60,0 (50,4); bez warstwy 0 | z 8 na 30 |
| najedzenie rano w dniach 15–25, średnio | 58,5, najgorszy dzień 36,7 (57,7 i 42,6) | co najmniej 25 (cel planu), bez zmian |
| dni z głodem zapasu, w których musi wyjść wyprawa | 11 dni (9–15, 17–20), w każdym wyprawa (9 dni) | co najmniej 5 dni, bez zmian |
| zaproszenia wędrowców do 10. dnia i zarząd rano 10. dnia | 6 zaproszeń, 9 osób (3 i 8) | co najmniej 2 i 8, bez zmian |
| pierwszy kamień ludności | dzień 4 (3) | najpóźniej dzień 5, bez zmian (margines z dwóch dni na jeden) |
| `t_ambu` i reszta badań | wszystkie siedem rano 9. dnia (9) | do rana 13. dnia, bez zmian |
| Zielonki 11, 12, 14: pracownia, `t_kozy`, koza z beczki | tak samo jak bez łańcuchów | bez zmian |

Jedna granica się zmieniła: średnie najedzenie w dniach 15–18 z 8 na 30. Stara stała przy 14,1 sprzed nocnego posiłku przy wielkim głodzie (po nim zarząd nie nocuje już głodny), a przy 59 nie łapałaby połowicznego cofnięcia warstwy; 30 leży w środku między warstwą a bazą. Pozostałe granice zostają, bo nadal leżą między warstwą a bazą (żadna nie została poluzowana). Mutanty na nowej trajektorii: silnik jak baza (`ZM_JAK_BAZA=1`) łamie siedem testów przebiegu jedzenia (zapas 0 w dniu 10, zdrowie 35,7, najedzenie 0, koniec w 22. dniu); brak `t_ambu` w kolejce łamie test badań; brak werbunku łamie test zaproszeń. Test kamienia przeżywa brak werbunku, bo wzrost do 10 osób bierze się z wyboru wydarzeń, jak pisał test od zadania 5. Test konfiguracji `przygotujGre` (domyślnie `lancuchy`, `--prosto` bez) był czerwony bez linii w uprzęży, a test audytu ukrytych rzutów gra teraz grą z uprzęży.

## 5. Dlaczego kończą się gry

Przyczyna końca przebiegu bez przeżycia z ostatnich pięciu poranków (jedzenie w spiżarni do 3 porcji i co najmniej połowa zarządu głodna: głód; co najmniej połowa zimna: zimno; inaczej wkurzenie z innych źródeł). 120 przebiegów z łańcuchami:

| demo | bez przeżycia | głód | wkurzenie bez głodu i zimna | zimno | mediana dnia końca tych gier |
| --- | --- | --- | --- | --- | --- |
| Przymorze | 7 z 40 | 2 | 5 | 0 | 34 |
| Lanciego | 22 z 40 | 18 | 3 | 1 | 27 |
| Zielonki | 40 z 40 | 40 | 0 | 0 | 23 |

Rozkład dnia końca (z łańcuchami): Przymorze żyje 45 dni w 82,5%, dożywa dnia 30 w 95%, Lanciego w 45% i 57,5%, Zielonki w 0% i 10% (dzień 25 dożywa 35%).

Zielonki. Jedzenie w zasięgu jest skończone i na tym demie prawie go nie ma: 17 porcji w jednym sklepie 630 m od adresu (demo ma 3 miejsca). Zarząd je około 9 porcji na dobę, spiżarnia schodzi do zera w 10.–12. dniu, zdrowie spada, wyprawy stają, a odwołanie przychodzi średnio w 23. dniu. Do tego start z 4 osób bez mieszkańców: kamień ludności w 9 z 40 grach.

Lanciego. Jedzenia jest dużo (około 1170 porcji w 116 miejscach), ale głód i tak przegrywa 18 z 22 przegranych gier. Mechanizm z zadania 6: zdrowie zarządu spada (pożary od kozy po około −20, rany z wypraw −20…−35, napady, zimno), zdrowie poniżej 45 zatrzymuje dalekie wyprawy po jedzenie, spiżarnia schodzi do zera, wszyscy są głodni, a wkurzenie rośnie o około 5 na dobę. Na Lanciego dochodzi zimno, bo sypialnie nie mają okna i koza z beczki tam nie stanie.

Przymorze. Większość przegranych gier kończą tu napady i dryf, nie głód. Dziesięć gier z sondy wkurzenia (z łańcuchami):

| gra | koniec | wtargnięcia szabrowników | wkurzenie z nich ponad cichą noc | dryf z potrzeb przez 6:00 | wybory w oknach |
| --- | --- | --- | --- | --- | --- |
| Przymorze 11 | żyje | 10 | +36,6 | +10,1 | −18 |
| Przymorze 12 | żyje | 14 | +53,5 | +34,1 | −21 |
| Przymorze 13 | żyje | 15 | +60,3 | +22,5 | −13 |
| Przymorze 21 | dzień 40 | 11 | +35,2 | +54,3 | −11 |
| Przymorze 24 | dzień 35 | 11 | +42,9 | +45,5 | −8 |
| Przymorze 29 | dzień 33 | 12 | +44,7 | +45,8 | −12 |
| Przymorze 42 | dzień 34 | 12 | +37,3 | +40,5 | −6 |
| Przymorze 50 | dzień 42 | 14 | +54,4 | +32,7 | −7 |
| Lanciego 16 | dzień 44 | 15 | +56,5 | +33,3 | −3 |
| Lanciego 23 | dzień 29 | 9 | +28,2 | +44,9 | +1 |

Odczyt: wtargnięcia są stałym podatkiem, 9–15 na grę, każda noc z wtargnięciem dodaje średnio 4,6 punktu wkurzenia (około 3,6 ponad cichą noc), czyli 28–60 punktów z 80 do odwołania (start 20, odwołanie 100), także w grach, które przeżywają. O odwołaniu decyduje reszta: dryf z głodu i zimna o 6:00 (10–34 punktów w grach, które przeżywają, 33–54 w odwołanych) i karty, które wkurzenie obniżają (od −13 do −21 w grach, które przeżywają, od −12 do +1 w odwołanych). Rachunek jest przybliżony (cicha noc też coś dodaje).

## 6. Co silnik już robi

- Start: samouczek (zaznaczenie kogoś z zarządu, ścięcie suchego drzewa) i drewno na opał z zapasem na dwie noce; ścinanie nie zabiera osoby, która ma od karty nocy wartę, dyżur albo wyprawę.
- Zima (`zima.ts`): pracownia, badanie kozy, koza z beczki w pokoju zarządu (miejsce z dostępem do stania, z dala od okna pracowni), rozbiórka gruzu na deski, dyżur przy kozie na karcie nocy tylko przy zimnie poniżej 8°C i drewnie na noc.
- Jedzenie (`jedzenie.ts`): wyprawy dzienne po jedzenie przez mapę miasta jak gracz (dwie najzdrowsze osoby, ostatnia zdrowa zostaje na dyżur), ogródek po pracowni, wspólny kocioł w pierwszym oknie uchwały, nigdy racje, miary zapasu na osobę zarządu.
- Rozwój (`rozwoj.ts`): kolejka budowy według materiałów (łóżka piętrowe, magazyn, warsztat, pieczarkarnia, szklarnia, zasieki na dziurze), kolejka siedmiu badań (`t_ambu` na końcu), tabela Pracy (priorytet Badań dla znawcy, próg drewna), werbunek wędrowców: rozmowa i zaproszenie według zapasu na osobę zarządu, także bez wolnego łóżka.
- Okna (`okna.ts`): ocena skutków każdego wyboru na trzech kopiach zarządu z ziarnami pochodnymi, z przelosowaniem ukrytych rzutów, okna wieloetapowe do czterech kroków, uchwały według potrzeby, karta nocy z dyżurem i wartą przy siatce.
- Granice kontraktu: silnik czyta tylko stan swojej gry i działa tylko przez ręce; cała pamięć jest w `GraAi.pamiec`; zapis i wczytanie w połowie gry dają te same skróty; warstwy idą najwyżej raz na 30 sekund przy ekranie; okno bez odpowiedzi silnika dostaje odpowiedź domyślną, a gdy i ta go nie zamknie, trafia do `zawieszone` (uprząż pokazuje to jako błąd przebiegu).

## 7. Co by pomogło po stronie zasad

Niczego z tej listy nie zmieniałem. Zmiany liczb zrobiłem tylko w kopiach pomiarowych (60 przebiegów, ziarna 11–30, oficjalna uprząż z łańcuchami; baza 34,55 dnia, 27 z 60 żyje), żeby wiedzieć, co jest warte rozmowy o balansie.

| zmiana w kopii pomiarowej | średni dzień końca | różnica parami | żyje (z 60) |
| --- | --- | --- | --- |
| bez zmian | 34,55 | | 27 |
| 300 desek na starcie w składzie | 35,17 | +0,62 ± 1,14 (Zielonki +3,05 ± 1,06) | 23 |
| ciepło przez drzwi 0,75 zamiast 0,5 (`heatBoost`) | 36,25 | +1,70 ± 0,92 (Lanciego +4,25 ± 2,13, Zielonki +1,95 ± 0,83, Przymorze −1,10 ± 1,39) | 29 |
| wtargnięcie szabrowników +3 wkurzenia zamiast +4 | 36,35 | +1,80 ± 0,36 (Przymorze +1,10 ± 0,57, Lanciego +2,10 ± 0,85, Zielonki +2,20 ± 0,31) | 29 |
| Zielonki z okolicą Przymorza (20 przebiegów) | 31,05 wobec 23,35 | +7,70 ± 1,23 | 2 z 20 wobec 0 |

### 7.1 Zima

Sypialnia zarządu ma najwyżej temperaturę dworu plus 6°C: koza stoi w kuchni, przez każde drzwi idzie połowa ocieplenia (`heatBoost` w `src/sim/house.ts`), kuchnia ma sufit `KOZA_MAX` 16°C ponad pogodę, a ciepło +40 na godzinę daje tylko piec w promieniu około 3 m od śpiącego. W grach silnika o 6:00 zimnych było średnio 1,1 z 6 osób przy 0…8°C na dworze, 2,1 przy −5…0°C i 3,2 poniżej −5°C. Badanie zimy (2026-10-20) mierzyło sypialnię trzymaną na 14°C: koniec gry przesuwał się o 8–12 dni na wszystkich demach (granica górna). Silnik stawia kozę z beczki tam, gdzie pozwala jej miejsce, ale na Lanciego sypialnie nie mają okna, a na Przymorzu miejsca stoją 5–6 m od łóżek, poza zasięgiem pieca. Pomiar na obecnym silniku: ciepło przez drzwi 0,75 zamiast 0,5 daje +1,70 ± 0,92 dnia, a na Lanciego +4,25 ± 2,13 (16 z 20 gier dożywa 45 dni zamiast 11); na Zielonkach +1,95 ± 0,83, na Przymorzu −1,10 ± 1,39 (tu zimno nie jest ograniczeniem).
Opcje po stronie zasad: koza z beczki bez okna albo druga koza przy łóżkach, folia w oknach (`t_okna`) i kocioł w nowej kolejce badań, ciepło przez drzwi. Boiler w tej wersji silnika nie pomaga (wariant z `t_wezel` i budową kotła: −7,2 dnia, bo pali 3 sztuki drewna na godzinę).

### 7.2 Głód przy zapasie i nocny posiłek

Badanie głodu przy pełnej spiżarni (2026-10-24) ustaliło, że przyczyną były racje głodowe podpisywane jako „pierwsza dozwolona” uchwała: silnik ich nie podpisuje. Nocny posiłek wszedł do gry (głodny śpiący przy wielkim głodzie wstaje i je): na silniku +1,67 ± 1,08 dnia na 60 parach, Lanciego +4,55 ± 2,20. Racje oszczędzają teraz około 7% porcji. Na Lanciego głód zostaje, bo zaczyna się od zdrowia (rany z wypraw 20–35 punktów, jedna wyprawa na cztery z kłopotami), a nie od braku jedzenia w zasięgu. Opcje: koszt i ryzyko wypraw, tempo leczenia (wymaga ciepła powyżej 50 i najedzenia powyżej 30).

### 7.3 Jedzenie w zasięgu (Zielonki)

W zasięgu 720 m od adresu jest: Przymorze około 855 porcji w 69 miejscach, Lanciego około 1167 w 116, Zielonki około 17 w jednym sklepie. To dane dema, nie zasady. Pomiar w kopii, gdzie Zielonki dostają okolicę Przymorza: 23,35 → 31,05 dnia (+7,70 ± 1,23), 2 z 20 dożywają, a 18 przegranych dalej kończy głód. Samo jedzenie w zasięgu nie wystarcza dla domu bez mieszkańców, startującego z 4 osób.
Opcje: dane dema (więcej miejsc z jedzeniem), własne źródło jedzenia osady (gospodarstwo, ogródek zimą), albo reguła wyboru kwadratu dla osady AI (decyzja 3).

### 7.4 Deski

Budowli jest za mało, bo brakuje desek: pracownia kosztuje 14 desek, ogródek 14, warsztat 20 (i 10 złomu), łóżka piętrowe 20, magazyn 30, a deski dają głównie rozbiórki, gruz i warsztat, który sam kosztuje 20 desek. Z 300 deskami na starcie budowli na koniec jest średnio 9,8 na Przymorzu (było 4,2), 8,2 na Lanciego (1,3) i 5,8 na Zielonkach (1,2), przeżycie bez zmian na blokach (+0,6 ± 1,5 i −1,8 ± 2,8), a na Zielonkach +3,05 ± 1,06 dnia. Cel 15 budowli nie wychodzi nawet wtedy (najwięcej 10 na Przymorzu). Budowle są miarą rozwoju i zasobu desek, nie przeżycia.
Opcje: tańszy pierwszy warsztat albo ręczne piłowanie desek z drewna bez warsztatu; w bramce inna miara rozwoju (decyzja 2).

### 7.5 Wkurzenie z napadów

Wtargnięcie szabrowników daje zaufanie −2 i wkurzenie +4 (odparty napad: +2 i −1), do tego bezpieczeństwo −25 u wszystkich i kradzież. Szansa napadu to 0,35 + 0,05 × dzień (do 6. dnia) + 0,06 za dziurę w siatce + poprawka za wytrzymałość, minus 0,05 za lampę i ognisko, 0,03 za psa, 0,05 za `u_warty` i 0,08 za `u_brama` (zablokowane po kotle z pierwszego okna), od 0,05 do 0,85; siła napadu rośnie o 0,55 na dobę (2 + losowo × (2 + 0,55 × dzień)). W grach silnika zdarza się 9–15 wtargnięć na grę, w grach wygranych tyle samo. Pomiar na kopii z wkurzeniem +3 zamiast +4: +1,80 ± 0,36 dnia (Przymorze +1,10 ± 0,57, Lanciego +2,10 ± 0,85, Zielonki +2,20 ± 0,31), 29 z 60 gier dożywa 45 dni zamiast 27. Jeden punkt wkurzenia na wtargnięcie to prawie dwa dni gry.
Opcje: wkurzenie z wtargnięcia, siła napadu w czasie, ochrona zapasów (magazyn za 30 desek, wieża za 24 deski), druga warta przy siatce (w silniku wyszła gorzej: 28,1 wobec 29,5 dnia w zadaniu 6).

## 8. Czego potrzebuje etap 2

1. Silnik w pętli drugiej gry. `Decydent` i `Rece` żyją dziś w `src/ai/gra.ts` z pętlą `krokGry` dla Node; osada AI w przeglądarce potrzebuje tej samej pętli obok gry gracza (przeplatanie dwóch i trzech gier ma te same skróty co osobno, rozpoznanie z 19.10). Silnik nie ma zależności od DOM ani Node.
2. Zarząd osady AI bez łańcuchów (`lancuchy` wyłączone, narrator może zostać): łańcuchy nie zmieniają siły silnika (+0,3 ± 0,7 dnia), a kosztują czas okna i stan zarządu.
3. Zapis. Pamięć silnika jest zwykłym JSON (`GraAi.pamiec`), zapis i wczytanie w połowie dają te same skróty (testy), stan jednej gry 40–380 KB po 45 dniach. Do dopisania: geo kwadratu osady i odcisk świata (projekt).
4. Reguła wyboru kwadratu: jedzenie w zasięgu i mieszkańcy (decyzja 3), bo na Zielonkach silnik w 65% gier nie dożywa nawet 25. dnia.
5. Koszt na telefonie: warstwy 32 razy na dobę gry, okno wydarzenia 2,5 ms mediany i 15 ms p95 na obciążonej maszynie; pomiar `npm run perf` z osadą w tle jest w bramce etapu 2.
6. Uprząż i miary: oficjalna uprząż gra już z łańcuchami (rozdział 4.4), ale gra samej osady AI ma być bez nich (punkt 2), więc do bramki etapu 2 potrzebna jest flaga `--bez-lancuchow`; liczby bez łańcuchów są w tym raporcie jako porównanie (+0,3 ± 0,7 dnia różnicy). Do tego nowe miary bramki (decyzja 2).
7. Kontakt (etap 3): nowe rodzaje okien i poleceń dla dyplomacji. Silnik odpowiada na nieznane okno odpowiedzią domyślną, a gdy to nie wystarczy, zgłasza `zawieszone`, więc brak odpowiedzi jest widoczny w uprzęży, ale odpowiedzi na dyplomację trzeba napisać.
8. Tryb zombie osobno: polityka obrony przed stadem (dziś skrypt w `tools/bot-zombie.ts`), okna wieloetapowe z „Obejrzeć ręce”, wiedza o ukrytym ugryzieniu w krokach `dach` i `dobicie`.

## 9. Decyzje dla Mateusza

1. Ruszać z etapem 2 na tym silniku, czy stroić etap 1 dalej? Rekomendacja: ruszać. Druga gra, start osady, zapis i widok nie zależą od siły silnika, a strojenie wraca w etapie 5 (wyważenie w obie strony), gdzie siłę rywala i tak trzeba będzie ustawić względem gracza. Silnik na bloku z jedzeniem w zasięgu (Przymorze) dożywa 45 dni w 82% gier, a po odwołaniu zarządu osada w projekcie żyje dalej z nowym zarządem (decyzja 10 projektu), więc „przeżycie bez odwołania do 45 dnia” jest ostrzejsze niż to, czego potrzebuje gra. Koszt pomyłki: jeśli silnik jest za słaby, rywal w miejscach jak Lanciego upada w połowie gry (mediana dnia końca tych gier 27, 20% przed dniem 25), czyli łamie anty-cel „ginie sama w pierwszą zimę”; naprawa to dalsze strojenie, które i tak byłoby potrzebne, bez przebudowy etapu 2. Koszt czekania z etapem 2 na bramkę: kolejne rundy strojenia dawały około +2 dni na rundę, a luka na Lanciego to 35 punktów procentowych, więc bramka nie przeszłaby szybko.
2. Jakie miary bramki zamiast dzisiejszych? Rekomendacja: przeżycie jako „pierwsze odwołanie zarządu nie wcześniej niż w dniu 30 w co najmniej 4 z 5 ziaren” na demach, na których osada może powstać (dziś spełnia to Przymorze, 95%; Lanciego 57,5%, więc zostaje do strojenia w etapie 5; Zielonki 10% wypadają z reguły z decyzji 3); budowle usunąć z bramki etapu 1, bo mierzą zasób desek, nie silnik (ze 300 deskami 10, 8 i 6 zamiast 4, 1 i 1, a 15 nie wychodzi nigdzie; projekt sam mówił, że pasmo ma wyjść z pierwszych przebiegów); kamień ludności bez zmian. Koszt pomyłki: jedna linia w `PROGI` w `tools/osada-ocena.ts` i test; ryzyko to obniżenie poprzeczki pod wynik, a bez miary budowli regres budowania nie zapali bramki (pilnują go testy rozwoju), dlatego decyzja jest produktowa, a nie moja.
3. Reguła wyboru kwadratu dla osady AI. Rekomendacja: dopisać do reguły „największy budynek mieszkalny z trzema pokojami” wymóg siedziby z mieszkańcami (blok) i co najmniej około 300 porcji jedzenia w zasięgu 720 m (punkt wyjścia z trzech dem: 855, 1167 i 17 porcji; próg sprawdzić na 20 kwadratach sąsiednich z `*-kwadraty.json`); gdy kandydat nie spełnia, następny, a gdy żaden, gra idzie bez osady jak bez sieci. Koszt pomyłki: za ostra reguła daje gry bez rywala (projekt to dopuszcza); za słaba daje rywala, który głoduje w trzy tygodnie (Zielonki 0 z 40, mediana dnia końca 23).
4. Czy zmienić zasady gry, żeby osada AI lepiej przeżywała? Rekomendacja: nie teraz. Dwie liczby ruszają przeżycie najbardziej (rozdział 7): wkurzenie z wtargnięcia 4 → 3 daje +1,8 dnia na każdym demie, ciepło przez drzwi 0,5 → 0,75 daje +1,7 dnia i ratuje Lanciego (+4,3), ale oba zmieniają też grę ludzi i obniżają jej trudność o około dwa dni. Bramka po decyzji 2 ich nie wymaga. Wrócić do nich po etapie 2, gdy widać, jak silnik gra obok gracza; tańsza i bezpieczniejsza jest zmiana wkurzenia (jedna liczba w `src/gov/noc.ts`), a ciepło przez drzwi zmienia fizykę zimy na wszystkich demach. Koszt pomyłki: zmiana któregokolwiek stałego zmienia skróty botów i złote testy do przepięcia; brak zmiany zostawia silnik na 45–82% w blokach, co strojenie w etapie 5 może nadrobić po stronie silnika.

## 10. Jak powtórzyć

Komendy w drzewie `osada-ai`:

```
npm run bot:osada                                    # oficjalna uprząż z łańcuchami (jak gra w przeglądarce), kod 1 przy werdykcie NIE PRZECHODZI
node tools/bot-osada.ts --bez-progu --ziarna=11-30   # sam pomiar, 60 przebiegów (ok. 5 minut na 9 procesach)
npx vitest run tests/unit/ai-                        # 354 testy silnika
```

Liczby bez łańcuchów (porównanie) powstały ze starą uprzężą z commitu 5e64828 (`git archive 5e64828`); flagi do tego w uprzęży jeszcze nie ma. Pary i sumy liczył skrypt `porownaj.py` na liniach postępu uprzęży (dzień końca, skrót), sondy okien, uczciwości i wkurzenia to osobne skrypty z notatek sesji. Zmiany zasad w rozdziale 7 to jedna linia w kopii: desek `deski` 300 w składzie siedziby (`houseOf(world).sklad[0]`), `boost[a] * 0.75` w `heatBoost`, `mood(st, -2, 3)` przy wtargnięciu, okolica Przymorza w `opts.okolica` dla Zielonek.
