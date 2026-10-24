# Ścieżka celów: projekt

Stan: projekt z przeglądu 19.10.2026 wieczorem, gałąź `sciezka-celow` od `pelna-gra` 715df48, bez kodu. Zlecenie Mateusza: „żeby te zadania, takie nasze questy, które dostajemy, są fajnie skrojone, żeby poprowadzić nas po wszystkich mechanikach gry po kolei. Wszystkie detale gry są spójne i dopracowane.”

Oznaczenia: „Mateusz” przy decyzji znaczy jego słowo, „moja decyzja” to założenie projektującego do przejrzenia (sekcja „Pytania do Mateusza”), reszta wynika z kodu. Liczby i zdania o grze sprawdzone w kodzie albo sondami w Node na prawdziwej symulacji: świat z ziarna adresu, mieszkańcy z generatora, obcy włączeni, 4 osoby zarządu, krok zarządu co sekundę przy ekranie, tak jak w `src/main.ts` (skrypty leżą poza repo, opis w sekcji „Jak sprawdzono”).

## Po co

Dziś cele są tylko przez dwa dni. Pierwszy dzień to samouczek z drewnem na wieczór i pierwszą nocą, drugi dzień to przeszukanie, pierwsza budowla, obwód (w zombie dzida) i drewno. W sondach cele drugiego dnia kończą się w zwykłym trybie po południu (Przymorze 15:58, Lanciego 16:52, Zielonki 11:43), a w zombie o 20:00, kiedy przepada drewno na noc, i od tej chwili okienko celów znika na resztę gry. Gra ma tymczasem 79 mechanik, z których cele uczą 14. Reszty gracz dowiaduje się z „Jak grać”, z dymków na dole ekranu albo wcale.

Ścieżka celów ma poprowadzić od drugiego dnia do dróg do zwycięstwa: po jednym rozdziale na mniej więcej dobę gry, każdy cel uczy jednej rzeczy wtedy, gdy staje się potrzebna, a rzeczy, które przychodzą same (handlarz, wędrowiec, napad, stado, ugryzienie), uczy w chwili, gdy się dzieją.

## Wynik przeglądu w liczbach

- Mechanik w grze (`pelna-gra` 715df48 plus `praca-ludzi` i `wydarzenia`): 79 (tabela niżej).
- Cele uczą dziś 14 z nich (polecenie albo klawisz w podpowiedzi celu) i wspominają 3 kolejne (dyżur przy kozie, uchwała, raport).
- Ścieżka z tego projektu uczy celem 57 (w tym 5 z gałęzi `praca-ludzi`), 11 kolejnych podpowiedzią celu, a 11 zostaje świadomie poza celami (automat, ekran startowy, flagi adresu, rzecz niedostępna, rzeczy, które same się tłumaczą).
- Usterek w dzisiejszych celach, podpowiedziach i oknach: 17 (sekcja „Przegląd”). 14 z nich to poprawki od razu (11 punktów listy; punkt 8 czeka na decyzję Mateusza, bo zmienia skróty botów), 2 robi sama ścieżka, 1 robi gałąź `wydarzenia`.

## Spis mechanik i pokrycie

Kolumna „Dziś” mówi, skąd gracz dowiaduje się dziś: cel, dymek (podpowiedź na dole ekranu, `say()` w `src/main.ts`), karta (okno albo karta osoby), „Jak grać” (Menu), nigdzie. Kolumna „Ścieżka” to rozdział i cel z tego projektu (R… główna ścieżka, O… okazje), „poza” znaczy świadomie bez celu. Gałęzie oznaczone w nawiasie kwadratowym.

| Nr | Mechanika | Wejście (PL / EN) | Kod | Tryb | Dziś | Ścieżka |
|---|---|---|---|---|---|---|
| M01 | Zaznaczenie osoby | klik albo stuknięcie w człowieka / click, tap | `src/main.ts` `endPointer`, `selectedChanged` | oba | cel R0 `zaznacz`, „Jak grać” | R0 |
| M02 | Zaznaczenie ramką | Shift i przeciąganie / Shift-drag | `src/main.ts` `endPointer` | oba | „Jak grać” | poza |
| M03 | Lista ludzi pod paskiem | klik w portret, drugi klik śledzi, Shift dokłada, Q i E / click, Q and E | `src/ui/lista.ts`, `src/ui/kameraListy.ts` | oba | „Jak grać” | R2 `sily` |
| M04 | Menu poleceń | prawy przycisk, przytrzymanie palca, Ctrl+klik / right-click, press and hold | `src/ui/menu.ts`, `commandsAt` w `src/sim/orders.ts:169` | oba | cel R0 `rozkaz` | R0 |
| M05 | Idź tu | „Idź tu” / “Go here” | `src/sim/orders.ts:480` | oba | „Jak grać” | poza (sama się tłumaczy) |
| M06 | Tempo | Pauza, 1×, 3×, 6×, 8×, Spacja, 1–4 / Pause | `index.html` `#speed`, `src/main.ts:3355` | oba | cele R0 `sciete`, `cieplo` | R0 |
| M07 | Kamera i minimapa | przeciąganie, WASD, kółko, + − ⌂, minimapa / drag, scroll | `src/main.ts`, `src/ui/minimapa.ts` | oba | dymek startowy, „Jak grać” | poza |
| M08 | Karta osoby | potrzeby, nastroje, co robi, historia / Fed, Warmth, Energy | `src/ui/karta.ts` | oba | „Jak grać” | R2 `sily` |
| M09 | Pasek u góry | dwór, kuchnia, koza, drewno, deski, złom, części, jedzenie, zaufanie, wkurzenie; w zombie siatka i stado | `src/ui/pasek.ts`, `src/ui/jezyk.ts:122` | oba | „Jak grać” (koza) | R1 `drewno2`, R4 `wkurzenie` |
| M10 | Menu, język, zapis | „Menu”, „Zapisz i wróć do ekranu startowego”, EN/PL | `src/ui/okna.ts:484`, `src/ui/zapis.ts` | oba | ekran | poza |
| M11 | Ścinanie drzew | „Ściąć drzewo” / “Chop down the tree” | `src/sim/orders.ts:384` | oba | cele R0 `rozkaz`, `drewno` | R0, R1 `drewno2` |
| M12 | Skład drewna | „Zanieść do składu” / “Carry to the woodpile” | `src/sim/orders.ts:250` | oba | cel R0 `sklad` | R0 |
| M13 | Koza | „Dołożyć do kozy” / “Feed the stove” | `src/sim/orders.ts:258` | oba | cel R0 `koza` | R0 |
| M14 | Ciepło w kuchni | 18°C (`WARM_ENOUGH`), pole „kuchnia” | `src/sim/tutorial.ts`, ciepło w `src/sim/sim.ts` | oba | cel R0 `cieplo` | R0 |
| M15 | Dyżur przy kozie | menu „Czuwać przy kozie” / “Keep watch by the stove”; karta nocy „Czuwa przy kozie” / “Watches the stove” | `src/sim/orders.ts:266`, `src/gov/noc.ts:379` | oba | wzmianka w celu drugiego dnia `drewno2`, karta nocy („Koza w nocy”), „Jak grać” | R1 `dyzur` |
| M16 | Palenie mebli | „Spalić …” / “Burn the …”, okno „Spalić” / „Zostawić” | `src/sim/orders.ts:395`, `burnSheet` w `src/ui/okna.ts:440` | oba | cel R0 `drewno`, „Jak grać” | R0, R1 `drewno2` (zombie) |
| M17 | Ognisko | „Rozpalić ognisko tutaj” / “Light a campfire here”, „Dołożyć do ogniska” | `src/sim/orders.ts:477`, `:284` | oba | nigdzie | R2 `ognisko` |
| M18 | Gotowanie | „Gotować” / “Cook”, zarząd gotuje sam | `src/sim/orders.ts:388` | oba | „Jak grać” | poza (automat) |
| M19 | Łatanie dziur | „Załatać dziurę” / “Patch the hole” (3 deski albo 3 złomu) | `src/sim/orders.ts:295`, `PATCH_COST` w `src/sim/sim.ts:362` | zwykły | cel drugiego dnia `obwod` | R1 `obwod` |
| M20 | Zasieki | Budowa, zakładka Obwód / Build, Perimeter | `src/sim/budowle.ts` | oba | cele drugiego dnia `budowla`, `obwod` | R1 |
| M21 | Wzmocnienie siatki | „Wzmocnić siatkę” / “Shore up the fence” | `src/sim/orders.ts:317` | oba | „Jak grać” (zombie) | O4 (podpowiedź) |
| M22 | Brama | „Pilnować bramy”, „Zamknąć bramę” / „Otworzyć bramę” (w domu furtka) | `src/sim/orders.ts:343`, `:349` | oba | nigdzie | R2 `ognisko` (lampa warty), O3 (podpowiedź) |
| M23 | Warta z menu | „Pilnować tutaj” / “Keep watch here”, „Pilnować przy siatce” / “Keep watch at the fence” | `src/sim/orders.ts:300`, `:323` | oba | nigdzie | O3, O4 (podpowiedź) |
| M24 | Warta na karcie nocy | posterunki, najsłabsze miejsce, „Jak radzi zarząd” | `src/gov/noc.ts`, `nightSheet` w `src/ui/okna.ts:255` | oba | cel R0 `noc`, „Jak grać” | R2 `uzbrojeni`, `dzidy` |
| M25 | Broń | „Zmień” / “Swap” na karcie osoby, magazyn, amunicja | `src/ui/karta.ts:76`, `src/main.ts:2225` | oba | „Jak grać” | R2 `uzbrojeni`, `dzidy` |
| M26 | Atak | „Atakuj szabrownika” / “Attack the looter”, „Atakuj szwendacza” / “Attack the shambler” | `src/sim/orders.ts:184` | oba | „Jak grać” | R2 `dzgnij`, O3 |
| M27 | Alarm | „Do broni!” / “To arms!”, „Odwołaj” / “Stand down” | `src/main.ts:2151` | oba | „Jak grać” (zombie), dymek | O3, O4 |
| M28 | Napad szabrowników | 23:00–4:00, warta, światło | `src/gov/noc.ts`, `watchRaid` w `src/main.ts:1626` | zwykły | cel R0 `noc`, dymki warty | O3 |
| M29 | Światło przy siatce | ognisko, lampa warty przy bramie | `raidChance`, `deterrence` w `src/gov/noc.ts:180`, `:222` | zwykły | dymek „Światło przy siatce pokazałoby…” | R2 `ognisko` |
| M30 | Karta nocy | „Śpi”, „Warta …”, „Czuwa przy kozie”, „Wyprawa …”, „Jak radzi zarząd”, „Zacznijcie noc” / Night orders, “Start the night” | `nightSheet` w `src/ui/okna.ts:255`, `src/gov/noc.ts` | oba | cel R0 `noc`, „Jak grać” | R0, R1 `dyzur`, R2 |
| M31 | Uchwały | zebranie 19:30, „Podpisać” / “Sign”, „Nic dziś nie uchwalamy”, drogi Porządek i Wspólnota, 36 h odnowienia | `lawSheet` w `src/ui/okna.ts:336`, `src/gov/uchwaly.ts` | oba | wzmianka w R0 `noc`, „Jak grać” | R4 `uchwala` |
| M32 | Zaufanie i wkurzenie | pasek, raport, koniec gry | `dailyDrift` w `src/gov/uchwaly.ts:76`, `mood` w `src/gov/wspolne.ts:59` | oba | „Jak grać”, raport | R4 `wkurzenie` |
| M33 | Karty wydarzeń | wybory z kosztem i skutkiem | `src/gov/wydarzenia.ts`, `src/gov/tresc.ts`, `eventSheet` | oba | same karty | R4 `nowi` |
| M34 | Raport rano | „Nowy dzień” / “New day” | `reportSheet` w `src/ui/okna.ts:396` | oba | wzmianka w R0 `noc` | R0 |
| M35 | Wyprawa nocna | „Wyprawa blisko: …”, „Wyprawa daleko: …” / “Short run”, “Long run” | `src/gov/noc.ts:427` | oba | „Jak grać” | R5 (podpowiedź) |
| M36 | Koniec gry | odwołanie, exodus, pustka | `checkOver` w `src/gov/zarzad.ts` | oba | „Jak grać” | R4 `wkurzenie` (podpowiedź) |
| M37 | Przeszukiwanie i karta mieszkania | „Przeszukać …” / “Search the …”, klik w mieszkanie bez zaznaczenia | `src/sim/orders.ts:433`, `src/ui/mieszkania.ts` | oba | cel drugiego dnia `przeszukaj`, „Jak grać” | R1 `przeszukaj` |
| M38 | Rozbiórka | „Rozebrać …” / “Take apart …”, śmieci i gruz „Clear the …” | `src/sim/orders.ts:408` | oba | „Jak grać” (skąd materiał) | R1 `budowla` (podpowiedź) |
| M39 | Naprawy | „Naprawić …” / “Fix the …” | `src/sim/orders.ts:422` | oba | „Jak grać” | poza (karta mieszkania) |
| M40 | Zajęcie mieszkania | „Zająć mieszkanie” / “Claim the flat” | `src/sim/orders.ts:439` | blok | „Jak grać” | poza (karta mieszkania) |
| M41 | Budowa | „Budowa” / “Build” (B), zakładki Dom, Podwórko, Obwód / Home, Yard, Perimeter, plan: lewy klik, R, Shift, prawy klik albo Esc, „Obróć”, „Anuluj” | `src/ui/budowa.ts`, `src/ui/panelbudowy.ts` | oba | cel drugiego dnia `budowla`, „Jak grać” | R1 `budowla` |
| M42 | Warsztat | „Piłować deskę z drewna” / “Saw wood into a plank”, „Zrobić część ze złomu” / “Make a part from scrap” | `src/sim/orders.ts:452`, `src/sim/surowce.ts` | oba | opis budowli | R6 `pracownia` (podpowiedź) |
| M43 | Wraki | „Przeszukać …” / “Search …”, „Rozebrać …” / “Strip …”, „Zanieść na podwórko” / “Carry into the yard” | `src/sim/orders.ts:356`, `:446` | oba | wieść o obcych przy aucie | O7 |
| M44 | Budowle podwórka i domu | ogródek, kuchnia społeczna, magazyn, łóżka piętrowe | `src/sim/budowle.ts` | oba | panel Budowa | R5 `ogrodek` |
| M45 | Jedzenie | porcje, garnek, zapasy na pasku | `src/sim/sim.ts`, `src/gov/noc.ts` | oba | „Jak grać” (częściowo) | R5 |
| M46 | Cudze drzwi | „Otworzyć drzwi”, „Zapukać”, „Wyważyć drzwi”, „Wejść”, „Zabić drzwi deskami”, „Odbić deski” / “Open the door”, “Knock”, “Force the door”, “Go in”, “Nail planks over the door” | `sasiedziAt` w `src/sim/orders.ts:508`, `src/content/napisy-sasiedzi.ts:80` | oba | nigdzie | R7 `pukanie`, `wejscie` |
| M47 | Spotkanie z lokatorami | okno: „Porozmawiać”, „Dać jedzenie (2 porcje)”, „Zaprosić do nas (… szans)”, „Zabrać im zapasy”, „Odejść” / “Talk”, “Give them 2 food”, “Invite them to join you” | `src/ui/spotkanie.ts:46`, `src/sim/sasiedzi.ts` | oba | nigdzie | R7 `spotkanie` |
| M48 | Szaber u sąsiadów | „Przeszukać …”, „Przeszukać piętro (zostało N)”, „Okraść mieszkanie (lokatorów nie ma)” | `src/sim/orders.ts:550`, `:566` | oba | nigdzie | R7 `szaber` |
| M49 | Karta budynku sąsiada | klik w cudzy budynek bez zaznaczenia | `src/ui/budynek.ts:115` | oba | nigdzie | R4 `ludzie` (dom) |
| M50 | Wspólny płot | „Otoczyć wspólnym płotem (…)” / “Put up a shared fence (…)”, „Budować wspólny płot dalej” | `src/sim/orders.ts:577`, `plotDla` w `src/sim/sasiedzi.ts:1264` | oba | „co dalej” drogi terenu | R8 `teren` |
| M51 | Handlarz | „Dać … za …” / “Give … for …”, „Napaść na handlarza” / “Rob the trader” | `src/sim/orders.ts:195`, `src/sim/handlarz.ts` | oba (zombie od dnia 4) | dymek „Pod bramą stoi handlarz z wózkiem.” | O2 |
| M52 | Wędrowiec | „Zagadać” / “Talk to the wanderer”, „Napaść na wędrowca” | `src/sim/orders.ts:224`, `src/sim/wedrowcy.ts` | oba (w zombie ocaleni) | wieść na dole ekranu | O1 |
| M53 | Obca ekipa | „Przegonić” / “Chase them off” | `src/sim/orders.ts:233` | oba | wieść | O7 (podpowiedź) |
| M54 | Przybysze | komunikat „N osób idzie od bramy”, „Pokaż” / “Show” | `src/ui/przybycie.ts` | oba | komunikat | R4 `nowi` |
| M55 | Mapa miasta | „Mapa miasta” / “City map” (M, minimapa), karta miejsca, „Wyślij wyprawę” / “Send a supply run”, plan wyprawy | `src/ui/miasto.ts:380`, `src/ui/wyprawa.ts`, `src/gov/dzienne.ts` | oba | dymek przycisku | R5 `wyprawa`, `lup` |
| M56 | Pracownia | Budowa, zakładka Dom: Pracownia (deski 14, części 4) | `src/sim/budowle.ts` | oba | „co dalej” drogi technologii, dymek przy T | R6 `pracownia` |
| M57 | Tablica badań | „Badania” / “Research” (T), sama się otwiera, „Badać” / “Research” | `src/ui/badania.ts`, `openBadania` w `src/main.ts:1358` | oba | samo otwarcie | R6 `badanie` |
| M58 | Praca przy stole | „Badać: …” / “Research: …”, „Tablica badań”, „Wybrać badanie” | `pracowniaItems` w `src/sim/orders.ts:488` | oba | „co dalej” drogi technologii | R6 `stol` |
| M59 | Odkrycie i książki | karta „Odkrycie” / “Discovery”, NOWE w Budowie, „Znaleźli książkę…” | `src/ui/badania.ts`, `src/ui/nowe.ts` | oba | karta, dymek | R6 `odkrycie` |
| M60 | Ery na tablicy | kolumny er, wymagania (nitki) | `ERY` w `src/sim/badania.ts:234` | oba | tablica | R6 `era2` |
| M61 | Budowle z badań | koza z beczki, kocioł, pieczarkarnia, szklarnia, barykada, wieża i „Warta na wieży” | `src/sim/budowle.ts`, `src/gov/noc.ts:515` | oba | NOWE w Budowie | R6 `odkrycie` (podpowiedź) |
| M62 | Sieć bez miedzi | „Włączyć sieć” / “Switch on the grid” | `src/sim/orders.ts:467` | oba | nigdzie (ery 3–6 odwrócone) | poza (niedostępna) |
| M63 | Mieszkańcy z adresu | karta mieszkańca (klik bez zaznaczenia), rodzina, historia, „Zmień imię” / “Rename” | `src/ui/karta.ts`, `src/ui/imiona.ts`, `src/main.ts:3253` | oba | linia w Menu | R4 `ludzie` |
| M64 | Własna drużyna | „Wasz zarząd” na ekranie startowym, 1–5 osób | `src/ui/druzyna.ts` | oba | ekran startowy | poza |
| M65 | [praca-ludzi] Panel Pracy | „Praca” / “Work” (P), priorytety 1–4, 9 rodzajów | `src/ui/praca.ts`, `src/ui/panelpracy.ts` | oba | „Jak grać” (gałąź) | R3 `priorytet` |
| M66 | [praca-ludzi] Stałe zajęcie | „Stałe zajęcie” / “Fixed job” na karcie osoby | `src/ui/karta.ts` (gałąź) | oba | „Jak grać” (gałąź) | R3 `stale` |
| M67 | [praca-ludzi] Zapasy | „Trzymać w zapasie” / “Keep in stock”: drewno, deski, części, dzidy | `src/ui/praca.ts` (gałąź) | oba | „Jak grać” (gałąź) | R3 `zapas` |
| M68 | [praca-ludzi] Za siatką | „Może wychodzić za siatkę” / “Can go outside the fence” | `src/ui/karta.ts` (gałąź) | oba, zombie z ostrzeżeniem | „Jak grać” (gałąź) | R3 `zasiatke` (zwykły) |
| M69 | [praca-ludzi] Werbunek | „Zaprosić do nas (N% szans)” / “Invite to join us (N% chance)”, „Zapytać o rękę” / “Ask to see their arm” | `src/sim/wedrowcy.ts:360` (gałąź) | oba | nigdzie | O1 `reka`, `zapros` |
| M70 | Drogi do zwycięstwa | Menu, „Drogi do zwycięstwa” / “Roads to victory”, kamienie, „co dalej”, epilog „Graj dalej” | `src/gov/zwyciestwo.ts`, `src/ui/zwyciestwo.ts:113` | oba | Menu | R8 |
| M71 | Szwendacze i stado | stado od 21:00 do 1:00, napór od 16 w jednym miejscu, pasek „siatka” i „stado” | `src/sim/zombie.ts` | zombie | dymek startowy, „Jak grać”, karta nocy | O4 |
| M72 | Dzida | „Zrobić dzidę” / “Make a spear” (2 deski, 1 złom) | `src/sim/orders.ts:333` | oba, głównie zombie | cel drugiego dnia `dzida`, „Jak grać” | R1 `dzida` |
| M73 | Warta z dzidą | karta nocy „Warta przy siatce” / “Watch at the fence” | `src/gov/noc.ts:395` | zombie | karta nocy, „Jak grać” | R2 `dzidy` |
| M74 | Ugryzienie i amputacja | „Amputować” / “Amputate” na karcie, 2 h | `src/ui/karta.ts:52` | zombie | „Jak grać” | O5 |
| M75 | Dobijanie zmarłych | „Dobić” / “Finish off the body” | `src/sim/orders.ts:239` | zombie | „Jak grać” | O6 |
| M76 | Strzał ściąga stado | hałas, broń palna | hałas w `src/sim/sim.ts` | zombie | dymek startowy, „Jak grać” | R2 `dzgnij` (podpowiedź) |
| M77 | Kwadraty miasta | `?kwadraty=` | `src/render/kwadratyWidok.ts` | oba | nigdzie (flaga) | poza (flaga) |
| M78 | Piętra | `?pietra=1`: kafelek „Piętro”, PageUp, PageDown | `src/ui/pietra.ts` | oba | dymek | poza (flaga) |
| M79 | [wydarzenia] Ludzie z kart na mapie | „Pokaż” na karcie, goście pod bramą, awans, wyjście bramą, pogrzeb, pies i kot | gałąź `wydarzenia` | oba | (gałąź) | R4 `nowi` (podpowiedź po scaleniu) |

Poza celami (11): M02, M05, M07, M10, M18, M39, M40, M62, M64, M77, M78. Tylko w podpowiedziach celów (11): M21, M22, M23, M35, M36, M38, M42, M53, M61, M76, M79. Automatu (gotowanie, sen, jedzenie) cele nie uczą, bo dzieje się sam; flag adresu (kwadraty, piętra) nie, bo zwykła gra ich nie ma; sieci nie, bo do ery 6 dziś się nie dochodzi; naprawy i zajęcie mieszkania pokazuje karta mieszkania z celu R1.1.

## Przegląd dzisiejszych celów i okien

Każdy punkt ma plik i linię oraz poprawkę. „Od razu” znaczy: w zadaniach 1–4 planu, przed ścieżką (karta „Ślady” osobno, w zadaniu 14).

U1. Podpowiedź pierwszej budowli poleca budowle zamknięte za badaniem (od razu). `src/ui/cele.ts:207-212` bierze dwie najtańsze ze wszystkich `BUILDS`, także z `tech`, więc na trzech demach i w obu trybach mówi „Najmniej materiału biorą pieczarkarnia (deski 8) i koza z beczki (złom 8, części 1)”. Obie wymagają badań (`t_grzyby`, `t_kozy`), a menu budowy ukrywa je do postawienia pracowni (`src/ui/budowa.ts:321`). Test `tests/unit/budowa-ui.test.ts:682` powtarza ten sam błąd. Poprawka: tylko budowle odblokowane (`isUnlocked`) z wolnym limitem (`limitWhy` null); dziś wychodzi „zasieki (złom 10) i ogródek (deski 14)”.

U2. Noc w trybie zombie straszy szabrownikami (od razu). `src/ui/cele.ts:142-146`: nocą cel „Przetrwajcie pierwszą noc” mówi „Szabrownicy przychodzą po dwudziestej trzeciej”, a w trybie zombie szabrowników nie ma (`src/gov/noc.ts:724`). Stado wychodzi z okolicy od 21:00 do 1:00 i rozchodzi się o 6:00 (`HORDE_FROM`, `DISPERSE` w `src/sim/zombie.ts:59`). Poprawka: wariant zombie „Stado wychodzi z okolicy od 21:00 i do rana napiera na siatkę. Rano [zarząd] dostanie raport.” / “The herd comes out of the area from 21:00 and presses on the fence until morning. In the morning [the board] gets a report.”

U3. Drewno na wieczór w trybie zombie wysyła pod szwendaczy (od razu). `src/ui/cele.ts:124-127`. Na Przymorzu i na Lanciego jedynym drzewem w obrębie siatki jest suche drzewo z samouczka, w Zielonkach są dwa (sonda). Polecenie „Ściąć drzewo” na drzewie za siatką przy zamkniętej bramie: na Przymorzu i na Lanciego osoba wychodzi za siatkę i po 3 h gry drzewo dalej stoi, w Zielonkach drzewo pada po 1,1 h, ale drwal jest ugryziony. W sondzie z graczem, który ścina tylko w obrębie siatki, cel przepada w trybie zombie na obu blokach. Poprawka: w trybie zombie, gdy w obrębie siatki nie ma już drzewa, podpowiedź poleca mebel z pustego mieszkania (w domu jednorodzinnym własny) i ostrzega przed drzewami za siatką; gdy drzewo w obrębie siatki jest, poleca je.

U4. „Drewno na noc” pierwszego dnia to naprawdę drewno na wieczór (od razu). `src/ui/cele.ts:30` i `:121`: cel „Przygotujcie drewno na noc.” zalicza się przy 3 sztukach (`NIGHT_WOOD`, ogień do snu), a karta nocy o 20:00 mówi „noc zje 10”. Do tego „W ostateczności spalcie mebel”: spalony mebel idzie najpierw do kozy (`src/sim/sim.ts:4034`, koza mieści 4 sztuki), a licznik celu kozy nie liczy, więc stół (3 sztuki) dał w sondzie +3 na Przymorzu, ale +1 na Lanciego. Poprawka: „Przygotujcie drewno na wieczór.” / “Get wood in for the evening.”, w podpowiedzi „3 to ogień do snu” i „spalony mebel trafia najpierw do kozy, reszta na skład”.

U5. Podpowiedź przeszukania prowadzi w ślepą uliczkę (od razu). `src/gov/miejsce.ts:222`, `:224`, `:276`, `:278` i angielskie `:393`, `:395`, `:444`, `:446`: „Kliknijcie mieszkanie w siedzibie: karta pokaże… Potem prawy przycisk w nim: „Przeszukać””. Lewy klik w puste miejsce zdejmuje zaznaczenie (`src/main.ts:3266-3268`, `selected.clear()` przed `focusTile`), więc prawy przycisk po nim daje tylko „Najpierw zaznaczcie kogoś z zarządu.” (`src/main.ts:2680`); na dotyku stuknięcie bez zaznaczenia pokazuje kartę, a przytrzymanie daje to samo „Najpierw stuknijcie kogoś…”. Etykieta w menu to „Przeszukać pokój”, „Przeszukać kuchnię” (`src/sim/orders.ts:433`), a nie samo „Przeszukać”. Poprawka w sekcji R1 `przeszukaj`: najpierw osoba, potem prawy przycisk; karta mieszkania jako sposób, żeby znaleźć puste.

U6. Zapas drewna zaliczony przed przeładowaniem może po nim przepaść (od razu, razem ze stanem ścieżki). `src/main.ts:1920-1921`, `:1943`, `:1958`: `woodReady` i `woodReady2` żyją tylko w pamięci strony. Kto zebrał 3 sztuki, a potem przeładował grę przed 20:00, gdy koza zjadła część zapasu, dostaje przy karcie nocy „przepadł”. Poprawka: zaliczenia celów w zapisie interfejsu (`Save.cele`, sekcja „Stan i zapis”).

U7. Drewno na drugą noc liczy inaczej niż karta nocy (w R1). `src/ui/cele.ts:163` i `:255-256`: `DAY2_WOOD` 8 to noc 22–6 bez drewna w kozie, a cel zalicza się w dowolnej chwili dnia (w sondzie o 7:54), choć karta nocy o 20:00 liczy razem z kozą i od 20:00 (10 sztuk przy jednej kozie, więcej z kozą z beczki i kotłem). Gracz ma ptaszek rano i „drewna starczy do 2:00” wieczorem. Poprawka: cel R1 `drewno2` liczy te same liczby co karta nocy i rozstrzyga się na karcie.

U8. Po drugim dniu nie ma celów (ścieżka). `src/main.ts:1970-1974` chowa okienko, gdy oba dni są zrobione. W sondach cele drugiego dnia kończą się między 11:43 a 20:00 drugiego dnia.

U9. Literówka w angielskim celu obwodu (od razu). `src/ui/cele.ts:245`: „a Barricade in place of a stretch of fence”. Poprawka: „a barricade”.

U10. Krok „Rozpalcie kozę” robi się sam (od razu, tylko tekst). `src/ui/cele.ts:72-73`: podpowiedź każe dołożyć z menu, a w trakcie samouczka zarząd sam dokłada, gdy drewno dojdzie do składu (`kozaWanted`, `src/sim/sim.ts:4499`); w sondzie koza paliła się 10 minut gry po kroku „skład” bez żadnego polecenia. Poprawka tekstu: „… Kto ma drewno, dołoży też sam.” Bez zmiany w symulacji (moja decyzja, pytanie 3).

U11. „Jak grać” przeczy startowi (od razu). `src/ui/okna.ts:597-598`: „Czterech ludzi… dziurawa siatka” (drużyna ma 1–5 osób, `src/ui/druzyna.ts:2`; w trybie zombie siatka jest cała), „Każdy z zarządu ma jedną broń” (w zwykłym trybie jedna osoba ma siekierę, a nóż i łom leżą w magazynie, `START_KIT` w `src/sim/bron.ts:105`).

U12. „Jak grać” mówi, że badań i zimy nie ma (od razu). `src/ui/okna.ts:600-601`: „Badania, zima i reszta gospodarki przyjdą w kolejnych wersjach.” Pracownia i tablica badań są w grze, zima przychodzi w 11. dniu. Pomoc nie mówi też nic o mapie miasta (M), tablicy badań (T), sąsiadach, handlarzu, wędrowcach i drogach do zwycięstwa.

U13. Karta „Ślady przy siatce” łata taniej niż menu (osobno, po decyzji Mateusza, bo zmienia skróty botów). `src/gov/tresc.ts:409-414`: „Załatać przed nocą (Złom 2)” i wpis „Dziura załatana deskami i drutem.”, a menu łata za 3 sztuki jednego materiału (`PATCH_COST` w `src/sim/sim.ts:362`). Poprawka: 3 złomu i „Dziura załatana złomem i drutem.”; liczba z `src/gov` nie może importować symulacji, więc stała obok z testem zgodności (jak `WOOD_PER_HOUR` i `BURN_TICKS`). Zmienia przebieg botów, które wybierają tę opcję (pytanie 4).

U14. Drogi do zwycięstwa każą robić niemożliwe (od razu). `src/gov/zwyciestwo.ts:204`: „Otoczcie wspólnym płotem pierwszy sąsiedni budynek.” także na Przymorzu, gdzie każdy z 17 budynków do 150 m stoi za jezdnią (`why: 'jezdnia'`; Lanciego 4 do otoczenia, Zielonki 5). `:213`: „w pokoju waszego mieszkania” także w domu jednorodzinnym. Poprawka: `GovInput.teren.mozliwe` (ile budynków w okolicy da się otoczyć, liczone raz na świat), przy zerze „Wkrótce: wspólny płot przez jezdnię.”; drugie zdanie ze słownika miejsca (`lokal.d`).

U15. Karty, które wiedzą o ludziach, których nie ma (znane, robi je `wydarzenia` etap 1). W sondach w trybie zombie wypadła karta „Obserwacja” o szabrownikach i karta „Handlarz” trzeciego dnia (prawdziwy handlarz przychodzi w zombie czwartego), a w obu trybach „Wędrowiec” o 20:30 bez nikogo pod bramą. Tu bez poprawek, żeby nie dublować gałęzi.

U16. Drobne rozjazdy angielskich słów (przy okazji). Karta miejsca „Send a supply run” (`src/ui/miasto.ts:382`) i okno planu „Send the supply run” (`src/ui/wyprawa.ts:129`). Słowniczek mówi o zakładkach budowy „Indoors, Yard, Perimeter”, a gra i pomoc mają „Home” (`src/ui/budowa.ts:305`, `docs/SLOWNICZEK-EN.md`). W `praca-ludzi` wędrowiec ma „Ask to see their arm”, a spotkanie z sąsiadami „Ask about the hand” (`src/content/napisy-sasiedzi.ts:332`). Poprawka: jedno słowo w każdej parze, decyzja przy scaleniu `praca-ludzi`.

U17. Karta ugryzionej osoby zawsze mówi o ręce (przy okazji). `src/ui/karta.ts:58-64`: „Ugryziona w rękę” i „Bitten on the arm”, choć symulacja zna tylko ugryzienie „w kończynę” (`limb`, `src/sim/sim.ts:736`), a pomoc mówi „w rękę albo nogę”. Poprawka: „w rękę albo nogę” / “on an arm or a leg”.

Sprawdzone i zgodne: etykiety menu w krokach samouczka („Ściąć drzewo”, „Dołożyć do kozy”), 18°C i pole „kuchnia”, `NIGHT_WOOD` 3 z napisem „z 3”, godzina zebrania 19:30 (`LAW_HOUR`, `LAW_MINUTE`) i karty nocy 20:00 (`CARD_HOUR`), napady 23:00–4:00, koszt dzidy „(2 deski i 1 złom)” (`SPEAR_BOARDS`, `SPEAR_SCRAP`), koszt zasieków (złom 10), słowa domu i bloku w celach (komitet, furtka, dom, ogród). Pierwszy dzień przechodzi samouczek na trzech demach w obu trybach (koniec około 17:36–17:45), a drugi dzień kończy się na wszystkich sześciu (sondą: gracz fali 1, drewno, dzida), przy czym w trybie zombie gracz, który nie wychodzi za siatkę i nie pali mebli, nie zbiera drewna na noc (U3, R1.4).

## Poprawki od razu

1. Budowle w podpowiedzi pierwszej budowli tylko odblokowane i z wolnym limitem (U1).
2. Noc zombie bez szabrowników, ze stadem (U2).
3. Drewno na wieczór: tytuł, „ogień do snu”, mebel najpierw do kozy, wariant zombie z meblem albo drzewem w obrębie siatki (U3, U4).
4. Przeszukanie: najpierw osoba, potem prawy przycisk w mieszkaniu, etykieta „Przeszukać …” (U5).
5. „a barricade” (U9).
6. Koza w samouczku: „Kto ma drewno, dołoży też sam.” (U10).
7. „Jak grać”: liczba osób z gry, siatka w zombie, broń w zwykłym trybie, „Na razie” bez badań i zimy, krótka sekcja „Poza siatką” (mapa miasta, sąsiedzi, handlarz, wędrowcy) i „Badania” (U11, U12).
8. Karta „Ślady przy siatce”: 3 złomu i złom w opisie (U13). Osobne zadanie po decyzji Mateusza i po scaleniu `praca-ludzi` i `wydarzenia`, bo zmienia skróty botów i przypięte skróty w testach, które tamte gałęzie i tak przeliczają.
9. Drogi do zwycięstwa: teren bez „co dalej”, gdy na mapie nie da się otoczyć sąsiada; pracownia w domu jednorodzinnym w „waszym domu” (U14).
10. Zaliczenia celów w zapisie (U6), razem z zadaniem stanu ścieżki.
11. Angielskie pary słów i ugryzienie w nogę (U16, U17), w zadaniu 2 planu; para „Zapytać o rękę” w zadaniu 12, przy scaleniu `praca-ludzi`.

U7 i U8 to sama ścieżka (rozdziały niżej), U15 robi gałąź `wydarzenia`.

## Zasady ścieżki

Dwa tory w jednym okienku celów:

- Główna ścieżka: rozdziały R0–R8 po kolei. Rozdział ma 3–5 celów, odsłania się, kiedy poprzedni jest skończony (każdy cel zrobiony albo przepadł). Wyjątek to R1, który otwiera się po zamknięciu pierwszego raportu, jak dziś drugi dzień. R3 (Praca) istnieje dopiero po scaleniu `praca-ludzi`; bez niej ścieżka idzie z R2 do R4.
- Okazje: krótkie rozdziały O1–O7 (1–3 cele), które otwierają się na zdarzenie w grze (przybysz, napad, stado, ugryzienie, zwłoki, obcy przy aucie) i stoją nad rozdziałem ścieżki, dopóki zdarzenie trwa. Nie przepadają: cel niezrobiony czeka na następną taką okazję, zrobiony nie wraca. Okazje ruszają dopiero po krokach samouczka (`st.tut.step` równe `TUT_STEPS.length` albo −1), żeby nie przeszkadzać w pierwszych minutach.

Cele w rozdziale:

- Lista pokazuje wszystkie cele rozdziału, które istnieją w tym trybie i na tej mapie; cel bez sensu na mapie (wspólny płot na Przymorzu, karta mieszkańca w domu bez mieszkańców, za siatką w zombie) nie wchodzi do listy, a w jego miejscu stoi zapasowy, jeśli go opisano.
- Bieżący cel to pierwszy niezrobiony, który nie czeka. Cel czeka, kiedy teraz nie da się go ruszyć (przed kartą nocy, przed zebraniem, przed rankiem); wtedy jest przyciemniony z dopiskiem „czeka do 20:00” / “waiting for 20:00” albo podobnym, a bieżący jest następny.
- Cel z terminem przepada, kiedy termin minie bez zaliczenia (dziś tak działa drewno na wieczór). Terminy mają tylko cele jednej nocy: R0 `drewno`, R1 `drewno2` i `dyzur`. Reszta celów nie ma terminu i da się ją zrobić później.
- Warunki z napisem „od otwarcia” liczą tylko to, co stało się po otwarciu rozdziału (liczniki w `StanSciezki.start`). Warunki ze stanem gry, który już jest spełniony, zaliczają cel od razu przy otwarciu (pracownia postawiona wcześniej to od razu ptaszek).
- Zaliczenie jest trwałe: cel raz zaliczony nie cofa się, także po wczytaniu zapisu.
- Cel, którego warunek to chwilowy stan (praca w toku, oferta przyjęta w czasie wizyty, alarm), zalicza się, gdy interfejs ten stan zobaczy, póki cel jest na liście; potem trzyma go zapis.
- Okno, które zasłania okienko celów (karta nocy, uchwała, tablica badań, spotkanie z sąsiadami), dostaje pod nagłówkiem jedną linię „Cel: …” / “Goal: …”, gdy bieżący cel dotyczy tego okna (pole `okno` celu).

Liczby w tekstach celów przez `src/ui/tekst.ts`, słowa miejsca ze słownika (`Words`, `WordsEn` z `src/gov/miejsce.ts`). W tekstach niżej słowo w nawiasie kwadratowym bierze się ze słownika: [zarząd] to w domu „komitet”, [brama] to „furtka”, [mieszkanie] to „dom”, [blok] to „dom”. „Mysz” i „dotyk” różnią się zawsze tak samo: „Kliknijcie” ↔ „Stuknijcie”, „prawy przycisk na …” ↔ „przytrzymajcie palec na …”, „(przycisk u góry albo B)” ↔ „(przycisk u góry)”, po angielsku “Click” ↔ “Tap”, “right-click …” ↔ “press and hold on …”; niżej wypisane są tylko podpowiedzi myszy, poza miejscami, gdzie dotyk różni się czymś więcej.

## R0. Pierwszy dzień

Samouczek zostaje, jak jest (`goalsOf` w `src/ui/cele.ts`, kroki `TUT_STEPS`): `zaznacz`, `rozkaz`, `sciete`, `sklad`, `koza`, `cieplo`, `drewno`, `noc`. Tytuł „Pierwszy dzień” / “Day one”. Zmiany tylko z poprawek: tekst kroku `koza` (U10), cel `drewno` (U3, U4) i nocny tekst celu `noc` w trybie zombie (U2). Zaliczenie `drewno` trzyma zapis (U6). R0 kończy się z celem `noc`, czyli z pierwszym raportem; ścieżka idzie dalej po jego zamknięciu.

Nowe brzmienie `drewno`:
- Tekst: „Przygotujcie drewno na wieczór.” / “Get wood in for the evening.”
- Jak (zwykły i zombie z drzewem w obrębie siatki): „Drewna na zapas: {n} z 3, czyli ogień do snu. Prawy przycisk na drzewie: „Ściąć drzewo”. W ostateczności spalcie mebel: trafi najpierw do kozy, reszta na skład.” / “Wood stocked: {n} of 3, enough fire to last till bedtime. Right-click a tree: “Chop down the tree”. If all else fails, burn some furniture: it goes into the stove first, the rest onto the woodpile.”
- Jak (zombie bez drzewa w obrębie siatki): „Drewna na zapas: {n} z 3, czyli ogień do snu. Drzewa za siatką stoją wśród szwendaczy: prawy przycisk na meblu w pustym [mieszkaniu]: „Spalić …”. Trafi najpierw do kozy, reszta na skład.” / “Wood stocked: {n} of 3, enough fire to last till bedtime. The trees outside the fence are among the shamblers: right-click a piece of furniture in an empty flat: “Burn the …”. It goes into the stove first, the rest onto the woodpile.” (w domu jednorodzinnym „w domu” / “in the house”).
- Warunek bez zmian (zapas w składzie, luzem i w rękach co najmniej `NIGHT_WOOD` po samouczku; przepada z kartą nocy).

## R1. Drugi dzień

Tytuł „Drugi dzień” / “Day two”. Otwiera się po zamknięciu pierwszego raportu (`gov.reports.length >= 1` i `!gov.report`). Pięć celów; w sondach pierwsze trzy schodzą do popołudnia, dwa ostatnie rozstrzyga karta nocy.

R1.1 `przeszukaj`: „Przeszukajcie puste mieszkanie.” / “Search an empty flat.” (dom: „Przeszukajcie dom.” / “Search the house.”)
- Jak (blok): „Zaznaczcie kogoś z zarządu i prawy przycisk w pustym mieszkaniu: „Przeszukać …”. Które mieszkanie jest puste, pokaże jego karta: klik w mieszkanie, kiedy nikt nie jest zaznaczony.” / “Select someone from the board and right-click inside an empty flat: “Search the …”. To see which flats are empty, click a flat while nobody is selected and read its card.”
- Jak (dom): „Zaznaczcie kogoś z komitetu i prawy przycisk w pokoju domu: „Przeszukać …”. Co już przeszukane, pokaże karta domu: klik w dom, kiedy nikt nie jest zaznaczony.” / “Select someone from the committee and right-click inside a room of the house: “Search the …”. To see what has been searched, click the house while nobody is selected and read its card.”
- Warunek: jak dziś (`st.apts[].searched` niepuste albo pomieszczenie u sąsiadów w `st.sasiedzi`). Z `praca-ludzi` Szaber może go zaliczyć sam od 6:00; to zgodne z projektem pracy („cele drugiego dnia stają się wskazówką”), a R3 tłumaczy automat.
- Uczy M37, nowy element: karta mieszkania. Oba tryby.

R1.2 `budowla`: „Postawcie pierwszą budowlę.” / “Put up your first structure.”
- Jak: „Budowa (przycisk u góry albo B): dowolna budowla. Najmniej materiału biorą {A} ({koszt A}) i {B} ({koszt B}). [Zarząd] sam przyniesie materiały i zbuduje. Materiał daje przeszukiwanie i rozbiórka.” / “Build (button at the top, or B): any structure will do. The cheapest are {the A} ({cost A}) and {the B} ({cost B}). [The board] will fetch the materials and do the building. Searching and taking things apart give you materials.” A i B: dwie najtańsze budowle odblokowane z wolnym limitem (U1); dziś „zasieki (złom 10) i ogródek (deski 14)”. Gdy jedną z nich są zasieki, w zwykłym trybie dopisek „Zasieki liczą się też do obwodu.” / “A barricade also counts for the perimeter.” W domu jednorodzinnym, gdzie dom przeszukuje się w godzinę, dopisek „Deski i złom mają też sąsiednie domy: prawy przycisk na ich drzwiach.” / “The houses next door have planks and scrap too: right-click their door.” (pytanie 6).
- Warunek: jak dziś (gotowa budowla z `BUILDS` w `st.things`).
- Uczy M41 (podpowiedzią M38), nowy element: panel Budowa. Oba tryby.

R1.3a `obwod` (zwykły): „Wzmocnijcie obwód.” / “Strengthen the perimeter.”
- Jak: „Budowa, zakładka Obwód: Zasieki w miejscu odcinka siatki ({koszt}) albo łatanie: prawy przycisk na dziurze, „Załatać dziurę” (3 deski albo 3 złomu na łatę). Otwartych dziur: {n}.” / “Build, Perimeter tab: a barricade in place of a stretch of fence ({cost}), or patch the holes: right-click a hole, “Patch the hole” (3 planks or 3 scrap a patch). Open holes: {n}.”
- Warunek: jak dziś (zasieki stoją albo żadna dziura nie jest otwarta).
- Uczy M19, M20. Bez nowego elementu.

R1.3b `dzida` (zombie): bez zmian względem dziś („Zróbcie dzidę dla warty.” / “Make a spear for the watch.”, warunek: dzid w rękach zarządu i w magazynie więcej niż na starcie). Uczy M72.

R1.4 `drewno2`: „Zbierzcie drewno na całą noc.” / “Get in enough wood for the whole night.”
- Jak (zwykły): „Drewna {n} z {potrzeba}, razem z tym w kozie: tyle zje noc od 20:00 do 6:00 przy dyżurze, sztuka na godzinę. Prawy przycisk na drzewie: „Ściąć drzewo”; za dnia [brama] stoi otwarta.” / “Wood: {n} of {need}, counting what’s in the stove: that’s what the night from 20:00 to 6:00 burns with a stove watch, one piece an hour. Right-click a tree: “Chop down the tree”; the gate stays open by day.”
- Jak (zombie): „Drewna {n} z {potrzeba}, razem z tym w kozie. Za siatką są szwendacze: spalcie meble z pustego [mieszkania] („Spalić …”) albo idźcie po drzewo za dnia z dzidą, kiedy pod siatką jest pusto.” / “Wood: {n} of {need}, counting what’s in the stove. There are shamblers outside the fence: burn furniture from an empty flat (“Burn the …”), or go for a tree by day with a spear when nobody is at the fence.”
- {n} to `Math.floor(snap.stock.wood)`, {potrzeba} to `WOOD_PER_HOUR` razy 10 godzin razy liczba palenisk (`GovInput.paleniska`), czyli to samo, co karta nocy pokaże o 20:00 (`nightWood` w `src/gov/noc.ts:96`).
- Warunek: przy karcie nocy po otwarciu rozdziału `gov.night.card.wood.have >= gov.night.card.wood.need` (zaliczony, gdy karta się pokaże). Przepada: karta zatwierdzona bez tego. Uczy M11, M09 (pole „drewno”), w zombie M16.

R1.5 `dyzur`: „Dajcie komuś dyżur przy kozie.” / “Put someone on stove watch.”
- Jak: „Na karcie nocy o 20:00 wybierzcie przy jednej osobie „Czuwa przy kozie”. Bez dyżuru koza gaśnie, kiedy wszyscy zasną.” / “On the Night orders at 20:00, pick “Watches the stove” for one person. Without a stove watch the fire goes out once everyone is asleep.”
- Warunek: karta nocy zatwierdzona po otwarciu rozdziału z przydziałem `warta:koza` (`KOZA_KEY`) w `gov.night.assign`. Czeka do karty nocy. Przepada: karta zatwierdzona bez dyżuru. Okno: karta nocy.
- Uczy M15 (M30). Oba tryby; przy jednej osobie w zarządzie ta osoba nie śpi, co karta nocy już pokazuje.

## R2. Ludzie i noc

Tytuł „Ludzie i noc” / “People and the night”. Otwiera się po R1 (zwykle o 20:00 drugiego dnia albo rano trzeciego). Trzy cele: siły ludzi, światło albo dzida przez siatkę, uzbrojona warta.

R2.1 `sily`: „Sprawdźcie, kto ma siły na noc.” / “Check who has the energy for tonight.”
- Jak (mysz): „Kliknijcie portret na liście pod paskiem: karta pokaże siły tej osoby. Klawisze Q i E przełączają ludzi po kolei.” / “Click a portrait in the row under the top bar: the card shows that person’s Energy. Keys Q and E step through your people.”
- Jak (dotyk): „Stuknijcie portret na liście pod paskiem: karta pokaże siły tej osoby.” / “Tap a portrait in the row under the top bar: the card shows that person’s Energy.”
- Warunek: zdarzenie interfejsu `lista` (wybór z listy klikiem albo Q i E) od otwarcia rozdziału.
- Uczy M03, M08, nowy element: lista ludzi. Oba tryby.

R2.2a `ognisko` (zwykły): „Rozpalcie ognisko na podwórku.” / “Light a campfire in the yard.”
- Jak: „Prawy przycisk na wolnym miejscu podwórka: „Rozpalić ognisko tutaj” (2 drewna). Światło przy siatce płoszy szabrowników i pomaga warcie ich zobaczyć, a wieczór przy ogniu łagodzi wkurzenie. Warta przy [bramie] też ma lampę. Liczy się ognisko, które płonie wieczorem.” / “Right-click a free spot in the yard: “Light a campfire here” (2 wood). Light by the fence scares looters off and helps the watch see them, and an evening by the fire takes the edge off the anger. A guard at the gate carries a lamp too. It counts when the fire is burning in the evening.”
- Warunek: `gov.evening.campfire` prawdziwe (ognisko płonie po 18:00) od otwarcia rozdziału.
- Uczy M17, M29 (M22). Bez nowego elementu.

R2.2b `dzgnij` (zombie): „Dźgnijcie szwendacza przez siatkę.” / “Spear a shambler through the fence.”
- Jak: „Zaznaczcie osobę z dzidą i prawy przycisk na szwendaczu przy siatce: „Atakuj szwendacza”. Dzida sięga przez siatkę; strzał zabija od razu, ale ściąga następnych.” / “Select someone with a spear and right-click a shambler at the fence: “Attack the shambler”. A spear reaches through the fence; a shot kills outright but draws more of them.”
- Warunek: pionek zarządu z pracą `fight` z polecenia (`job.order`, polecenie `attack` zakłada ją w `orderAttack`, `src/sim/sim.ts:6703`) na pionku `zombie`, zobaczony od otwarcia rozdziału.
- Uczy M26, M76.

R2.3a `uzbrojeni` (zwykły): „Dajcie broń drugiej osobie.” / “Arm a second person.”
- Jak: „Na karcie osoby bez broni kliknijcie „Zmień”: weźmie nóż albo łom z magazynu. Uzbrojona warta broni się lepiej i karta nocy to liczy.” / “On the card of someone without a weapon, click “Swap”: they take the knife or the crowbar from the storeroom. An armed watch holds out better, and the Night orders count it.”
- Warunek: w zarządzie co najmniej `min(2, osób zarządu)` osób z bronią (`SimPerson.weapon` nie null).
- Uczy M25 (M24), nowy element: przycisk „Zmień” na karcie.

R2.3b `dzidy` (zombie): „Postawcie na noc dwie dzidy przy siatce.” / “Put two spears on watch at the fence tonight.”
- Jak: „Na karcie nocy wybierzcie „Warta przy siatce” dwóm osobom z dzidą. Drugą dzidę da „Zmień” na karcie osoby (zapasowa z magazynu) albo „Zrobić dzidę”.” / “On the Night orders, pick “Watch at the fence” for two people with spears. A second spear comes from “Swap” on a person’s card (the spare in the storeroom) or from “Make a spear”.”
- Warunek: karta nocy zatwierdzona od otwarcia rozdziału z co najmniej `min(2, osób zarządu)` przydziałami `warta:siatka` u osób, które przy zatwierdzeniu mają dzidę. Czeka do karty nocy; bez terminu, próba co noc. Okno: karta nocy.
- Uczy M73, M25.

## R3. Praca [praca-ludzi]

Tytuł „Praca” / “Work”. Tylko po scaleniu `praca-ludzi`. Otwiera się po R2, zwykle rano trzeciego dnia, czyli po dniu, w którym gracz zrobił wszystko ręcznie, a automat już działa (od 6:00 drugiego dnia po samouczku).

R3.1 `priorytet`: „Ustawcie, kto czym zajmuje się sam.” / “Set who does what on their own.”
- Jak: „Praca (przycisk u góry albo P): klik w komórkę zmienia priorytet, 1 to najpierw, puste: nie robi. Bez rozkazów ludzie biorą prace z tej tabeli po kolei, a polecenie zawsze wygrywa.” / “Work (button at the top, or P): click a cell to change the priority; 1 goes first, blank means they won’t do it. With no orders, people take jobs from this table in turn, and an order always comes first.”
- Warunek: `st.praca.osoby` ma choć jedną zmianę priorytetu (pole powstaje przy pierwszej zmianie gracza).
- Uczy M65, nowy element: panel Pracy.

R3.2 `stale`: „Dajcie komuś stałe zajęcie.” / “Give someone a fixed job.”
- Jak: „Na karcie osoby wybierzcie „Stałe zajęcie”, na przykład Drwal albo Szaber: te zlecenia weźmie przed wszystkimi innymi.” / “On a person’s card pick a “Fixed job”, for example Woodcutting or Scavenging: they take those jobs before anything else.”
- Warunek: któraś osoba ma `stale` w `st.praca.osoby`.
- Uczy M66, nowy element: wybór na karcie.

R3.3 `zapas`: „Ustawcie, ile czego trzymać w zapasie.” / “Set how much to keep in stock.”
- Jak: „Praca, „Trzymać w zapasie”: plus i minus przy drewnie, deskach i częściach (w trybie zombie też dzidach). Drwal i warsztat pracują do tego progu.” / “Work, “Keep in stock”: plus and minus beside wood, planks and parts (in Zombie mode, spears too). Woodcutters and the workshop work up to that level.”
- Warunek: `st.praca.progi` ma choć jedną zmianę.
- Uczy M67.

R3.4 `zasiatke` (zwykły): „Pozwólcie drwalowi wychodzić za siatkę.” / “Let a woodcutter go outside the fence.”
- Jak: „Na karcie osoby włączcie „Może wychodzić za siatkę”: za dnia sama zetnie drzewo za siatką i wniesie drewno. Bez tego nikt sam nie wychodzi, a na blokowisku drzewa stoją za siatką.” / “On a person’s card, switch on “Can go outside the fence”: by day they’ll chop trees outside the fence and bring the wood in. Without it nobody goes out on their own, and on a block estate the trees are outside the fence.”
- Warunek: któraś osoba ma `zaSiatke`.
- Uczy M68. W trybie zombie celu nie ma (ostrzeżenie zostaje na karcie, pytanie 9).

## R4. Zarząd

Tytuł „Zarząd” / “The board” (dom: „Komitet” / “The committee”). Otwiera się po R3 (bez `praca-ludzi` po R2). Zebrania przychodzą co półtorej doby: pierwsze pierwszego wieczoru, drugie trzeciego o 19:30, więc ten rozdział trafia zwykle w wieczór trzeciego dnia i ranek czwartego.

R4.1 `uchwala`: „Podpiszcie kolejną uchwałę.” / “Pass another resolution.”
- Jak: „Zebranie [zarządu] o 19:30, kiedy minie półtorej doby od poprzedniej uchwały. Drogi porządku i wspólnoty się wykluczają: pierwsza uchwała z jednej zamyka drugą.” / “[The board] meets at 19:30 once a day and a half has passed since the last resolution. The Order and Community paths rule each other out: the first resolution on one closes the other.”
- Warunek: podpisanych uchwał (`Object.keys(gov.laws.signed)`) więcej niż przy otwarciu rozdziału. Czeka, dopóki nie trwa zebranie (`gov.lawPending`). Okno: uchwała.
- Uczy M31.
- Zmiana integratora 24.10.2026: zebranie zarząd zwołuje tylko wtedy, gdy któraś uchwała jest do podpisania, a z jednej drogi da się podpisać najwyżej cztery z sześciu, więc cel nie istnieje (nie wchodzi do listy i nie blokuje rozdziału), gdy żadna uchwała nie jest `ok` ani `cd` w `lawOptions`; cel zaliczony zostaje na liście. Liczba podpisanych liczona jak w `licznikiStartu` (`Object.values(...).filter(Boolean)`), nie `Object.keys`: w grze to to samo.

R4.2 `wkurzenie`: „Sprawdźcie rano w raporcie, jak zmieniło się wkurzenie.” / “Check in the Morning report how the anger moved.”
- Jak: „Raport rano pokazuje, jak zmieniło się zaufanie i wkurzenie. Wkurzenie spada, gdy ludzie są najedzeni i w cieple, a wieczorem pali się ognisko; rośnie od zimna, głodu, palenia mebli, napadów i zgonów. Przy pełnym wkurzeniu [walne] odwoła [zarząd].” / “The Morning report shows how trust and anger moved. Anger drops when people are fed and warm and a campfire burns in the evening; it rises with cold, hunger, burnt furniture, raids and deaths. At full anger the general meeting votes [the board] out.” W trybie zombie bez fragmentu o ognisku („, a wieczorem pali się ognisko” / “ and a campfire burns in the evening”): R2 każe tam unikać światła nocą.
- Warunek: poranny raport po otwarciu rozdziału, jakkolwiek zmieniło się wkurzenie (obserwacja jak R2.1). Raport po otwarciu rozpoznaje się po dniu nocy (raport za noc d powstaje o 6:00 dnia d + 1 i liczy się, gdy ta minuta jest ściśle po minucie otwarcia), a nie po numerze na liście: `gov.reports` ma najwyżej 10 wpisów. Czeka do ranka i nie bywa bieżący, więc jego podpowiedź się nie pokazuje; lekcję niesie dopisek czekania: „Raport rano. Wkurzenie spada, gdy ludzie są najedzeni i w cieple.” / “Morning report. Anger drops when people are fed and warm.” (ten sam w trybie zombie, bez ogniska).
- Uczy M32 (M09, M34, M36).
- Zmiana integratora 24.10.2026: wkurzenie o 6:00 rośnie prawie każdej nocy także przy graczu z podpowiedzią, cel uczy odczytu raportu (do przejrzenia przez Mateusza).

R4.3 `nowi`: „Przyjmijcie kogoś nowego.” / “Take someone new in.”
- Jak: „Ludzi przyprowadzają karty wydarzeń: „Przyjąć wszystkich”, „Wciągnąć do roboty”. Przyjęci idą od [bramy], a „Pokaż” w komunikacie pokaże ich na mapie. Każdy nowy to ręce do pracy i usta do wykarmienia.” / “Event cards bring people to you: “Take everyone in”, “Put him to work”. Newcomers walk in from the gate, and “Show” on the notice points them out on the map. Every newcomer is a pair of hands and another mouth to feed.” Po scaleniu `wydarzenia`: „Gość pod [bramą] ma kartę z „Pokaż”: „Przyjąć do spółdzielni”.” (zadanie 13 planu).
- Warunek: ludność (zarząd i mieszkańcy, `ludnoscOf(govInput)`) większa niż przy otwarciu rozdziału. Zgon w międzyczasie tylko opóźnia cel.
- Uczy M33, M54. W sondach (tydzień, bot bez sąsiadów i bez werbunku) ludność rosła w pięciu z sześciu przebiegów między 3. a 6. dniem (karty „Fachowiec”, „Influencer”, uchodźcy); w szóstym (Lanciego, zombie) bot tracił ludzi przez ugryzienia. Z „Zaprosić do nas” u sąsiadów i u wędrowców przychodzi szybciej.

R4.4 `ludzie`: w bloku z mieszkańcami „Poznajcie mieszkańców siedziby.” / “Meet the residents of your block.”; w domu jednorodzinnym i w siedzibie bez mieszkańców „Poznajcie sąsiadów zza płotu.” / “Get to know the neighbours over the fence.”
- Jak (blok): „Kliknijcie mieszkańca na podwórku albo w mieszkaniu, kiedy nikt nie jest zaznaczony: karta powie, kim jest i z kim mieszka. Mieszkańcy są wymyśleni.” / “Click a resident in the yard or in a flat while nobody is selected: the card tells you who they are and who they live with. The residents are made up.”
- Jak (dom): „Kliknijcie sąsiedni dom, kiedy nikt nie jest zaznaczony: karta powie, kogo z nich znacie i jak się do nich dostać.” / “Click a house next door while nobody is selected: the card tells you which neighbours you know and how to get in.”
- Warunek: zdarzenie interfejsu `mieszkaniec` (karta mieszkańca) albo `budynek` (karta cudzego budynku) od otwarcia rozdziału. Wariant bloku, gdy `snap.lokatorzy` niepuste; inaczej wariant domu.
- Uczy M63 albo M49, nowy element: karta mieszkańca albo karta budynku.

## R5. Jedzenie

Tytuł „Jedzenie” / “Food”. Otwiera się po R4, zwykle czwartego dnia. W sondach jedzenie zarządu kończy się między 5. a 7. dniem (Przymorze 0 w 7. dniu, Zielonki w 6., Lanciego 7 porcji w 7.), więc to ostatni dobry moment.

R5.1 `wyprawa`: „Wyślijcie wyprawę z mapy miasta.” / “Send a supply run from the city map.”
- Jak: „Mapa miasta (przycisk u góry albo M): klik w miejsce, na jego karcie „Wyślij wyprawę”, wybierzcie osoby i potwierdźcie. Tylko za dnia, od 6:00 do 20:00; ryzyko i łup widać przed wyjściem.” / “City map (button at the top, or M): click a place, then “Send a supply run” on its card, pick the people and confirm. By day only, from 6:00 to 20:00; you see the risk and the haul before they leave.” W trybie zombie dopisek: „Za siatką są szwendacze: ryzyko jest większe, a kłopoty bywają ugryzieniem.” / “There are shamblers out there: the risk is higher, and trouble can mean a bite.”
- Warunek: wyprawa dzienna w drodze (`gov.wyprawy` niepuste) zobaczona od otwarcia rozdziału.
- Uczy M55, nowy element: okno mapy miasta (z kartą miejsca i oknem planu). Na trzech demach są miejsca poza mapą osiedla (Przymorze 160, Lanciego 263, Zielonki 2; najbliższe 194–423 m, około 131–144 min drogi z powrotem).
- Zmiana integratora 24.10.2026: `wyprawa` i `lup` istnieją tylko w grze z oknem mapy miasta (flaga `OdczytCelow.mapaMiasta` z `mapaMiasta` w `src/main.ts`; okna nie ma z `?miasto=0` ani na osiedlu zapasowym bez położenia, choć `gov.miasto` istnieje); bez nich R5 kończy się samym ogródkiem.

R5.2 `lup`: „Przynieście łup z wyprawy.” / “Bring back loot from a run.”
- Jak: „Wyprawa wraca sama o godzinie z karty miejsca. Ranni wracają z ranami, więc posyłajcie wypoczętych i uzbrojonych. Na karcie nocy wyprawa idzie po zmroku: „Wyprawa blisko” jest bezpieczniejsza, „daleko” przynosi więcej.” / “The run comes back on its own at the time shown on the place card. The hurt come back hurt, so send rested, armed people. On the Night orders a run goes out after dark: a short run is safer, a long one brings back more.”
- Warunek: łupu zabranego z miejsc z mapy (`Σ gov.miasto.zabrano`) więcej niż przy otwarciu rozdziału; liczy też wyprawy nocne do miejsc z mapy.
- Uczy M55, M35.

R5.3 `ogrodek`: „Postawcie ogródek.” / “Put in a vegetable patch.”
- Jak: „Budowa, zakładka Podwórko: Ogródek ({koszt}) na wolnym kawałku podwórka. Po kilku dniach daje jedzenie, jesienią mało.” / “Build, Yard tab: Vegetable patch ({cost}) on a free bit of the yard. It grows food after a few days; not much in autumn.”
- Warunek: gotowy `ogrodek` w `st.things` (postawiony wcześniej zalicza od razu).
- Uczy M44, M45.

## R6. Badania

Tytuł „Badania” / “Research”. Otwiera się po R5. Bot z badaniami stawia pracownię średnio w 3,2. dniu i bada pierwszą technologię w dobę (dziennik, wpis „Badania”), a zima przychodzi w 11. dniu, więc rozdział trafia w 4.–6. dzień, z zapasem na erę 1 przed zimą.

Zmiana integratora 24.10.2026: cele badań istnieją tylko tam, gdzie osada ma dość wiedzy, żeby je zrobić. `badanie`, `stol` i `odkrycie` są na liście, gdy któraś kartka ery 1 jest do wzięcia (wiedza osady w jej dziedzinie co najmniej `lvl`, czyli 1), `era2` gdy któraś kartka ery 2 (wiedza 2). Wiedzę liczy `wiedza` z `src/sim/badania.ts` razem z osobami na wyprawie (inaczej wyprawa jedynej osoby z fachem chowałaby cele i mogła zamknąć rozdział). Własny zarząd z samych programistów i kurierów, bez książek i lokatorów z wiedzą, ma więc w R6 tylko pracownię, a ścieżka idzie dalej; cel zaliczony albo z już prawdziwym warunkiem zostaje na liście, choćby wiedza potem spadła. Domyślny zarząd (cztery osoby z generatora) ma wiedzę na wszystkich sześciu przebiegach.

R6.1 `pracownia`: „Postawcie pracownię.” / “Build a research room.”
- Jak: „Budowa, zakładka Dom: Pracownia ({koszt}) w pokoju [naszego mieszkania]. Części dają przeszukiwanie i warsztat („Zrobić część ze złomu”).” / “Build, Home tab: Research room ({cost}) in a room of the board’s flat. Parts come from searching and from the workshop (“Make a part from scrap”).” (dom: „waszego domu” / “your house”). W kodzie w obu wariantach „waszego mieszkania” / „waszego domu” i “your flat” / “your house” (słownik `lokal`, jak zdanie „co dalej” drogi technologii; jedna funkcja `waszeLokum` z `src/gov/miejsce.ts` dla obu), bo cele mówią do zarządu na „wy".
- Dopisek w domu jednorodzinnym z domami obok (Zielonki). Zmiana integratora 24.10.2026: pracownia bierze 14 desek i 4 części, a taki dom zbiera z własnych pomieszczeń za mało desek (na początku drugiego dnia ma 4, po przeszukaniu i rozbiórce około 10, z automatem pracy ludzi 7 do 8 w sześć dób; bot badań na ziarnach 5, 1 i 2 nie postawił pracowni w dziewięć dób, a z łupem od sąsiadów stała w dniu 3,0 do 3,4), więc zdanie na końcu podpowiedzi odsyła do sąsiednich domów: „Deski i części mają też sąsiednie domy: prawy przycisk na ich drzwiach.” (dotyk: „przytrzymajcie palec na ich drzwiach”) / “The houses next door have planks and parts too: right-click their door.” (dotyk: “press and hold on their door”). Tylko tam, gdzie słownik ma `szukanie.obok` (siedziba to dom) i sąsiedzi to domy (`sasiedzi` równe „domy”); w samotnym domu i w domu wśród bloków zdania o sąsiadach nie ma. W trybie zombie to wyjście za siatkę, więc zdanie ma ten sam dopisek co pukanie (R7.1): „Za siatką są szwendacze: idźcie za dnia, z dzidą.” / “There are shamblers out there: go by day, with a spear.” (jeden tekst w kodzie, `ZA_SIATKA`, dla R6.1 i R7.1). Wzór: zdanie `szukanie.obok` z celu „Postawcie pierwszą budowlę” (R1.2), z częściami zamiast złomu. Test bez prezentów (`dajMaterial`): gra z automatem pracy ludzi, plan budowy i gracz-bot sąsiadów, pracownia stoi w dniu 3,5 (ziarno 5), 4,3 (1) i 3,5 (2); bez wyjścia do sąsiadów nie stanie w sześć dób.
- Dopisek w bloku (obie wersje trybu). Zmiana integratora 24.10.2026: sam automat pracy ludzi nie rozbiera mebli, a bez nich deski nie starczają: na mapach blokowych w zombie staje na około 12 z 14 desek do dnia 8, a osiedle zapasowe (ziarno 2) w zwykłym trybie też potrzebuje więcej, niż daje automat. Gracz dochodzi do 14 rozbierając meble w pustych mieszkaniach, więc podpowiedź kończy zdanie: „Deski i części dają też meble z przeszukanych pustych mieszkań: prawy przycisk na meblu, „Rozebrać …”.” (dotyk: „przytrzymajcie palec na meblu”) / “Furniture from searched empty flats gives planks and parts too: right-click a piece, “Take apart the …”.” (dotyk: “press and hold on a piece”). Napis „Rozebrać …” / “Take apart the …” jest z menu meblu (`commandsAt` w `src/sim/orders.ts`: `Rozebrać ${THING_ACC[rodzaj]}` i `Take apart the {rzecz}`); meble pustego mieszkania da się rozebrać dopiero po przeszukaniu jego pomieszczenia (`dismantlable`), stąd „przeszukanych”. Deski dają stoły, krzesła, łóżka i meblościanki, części lodówka. Rozbiórka jest w środku, więc bez dopisku o szwendaczach. Koszty i ekonomia bez zmian.
- Warunek: stoi `pracownia`.
- Uczy M56 (M42).

R6.2 `badanie`: „Wybierzcie pierwsze badanie.” / “Pick your first research.”
- Jak: „Tablica badań otwiera się sama, kiedy pracownia stanie, potem pod przyciskiem Badania albo T. Klik w kartkę, potem „Badać”.” / “The Research board opens by itself once the research room stands; later it’s under the Research button, or T. Click a card, then “Research”.”
- Warunek: `st.research.cur` nie null albo coś już zbadane. Okno: tablica badań.
- Uczy M57, nowy element: tablica badań.

R6.3 `stol`: „Posadźcie kogoś przy stole pracowni.” / “Sit someone at the research table.”
- Jak: „Zaznaczcie osobę i prawy przycisk na pracowni: „Badać: {nazwa}”. Najszybciej bada ktoś, kto zna dziedzinę kartki; przy stole są dwa miejsca, a mieszkańcy z wiedzą siadają sami.” / “Select a person and right-click the research room: “Research: {name}”. Someone who knows the card’s field is fastest; the table has two seats, and residents who know the field sit down on their own.” Słowo „mieszkańcy” / “residents” idzie ze słownika (w domu „sąsiedzi” / “neighbours”). Bez wybranego badania w miejscu nazwy wielokropek.
- Warunek: postęp jakiegokolwiek badania w `st.research.prog` większy od zera.
- Uczy M58.

R6.4 `odkrycie`: „Zbadajcie pierwszą technologię.” / “Finish your first research.”
- Jak: „Karta „Odkrycie” powie, co daje; nowe budowle mają w Budowie znaczek NOWE. Książki znalezione przy przeszukiwaniu dokładają wiedzy.” / “The Discovery card tells you what it gives you; new structures are marked NEW in Build. Books found while searching add to what you know.”
- Warunek: `st.research.at` ma choć jeden wpis.
- Uczy M59, M61, nowy element: karta „Odkrycie” (przychodzi sama).

R6.5 `era2`: „Zacznijcie badanie z ery 2.” / “Start a research from era 2.”
- Jak: „Kolumny tablicy to ery. Kartka z ery 2 da się wziąć, kiedy zbadacie technologię, której wymaga (nitka na tablicy). Ery 3–6 czekają na prąd.” / “The board’s columns are eras. An era 2 card can be taken once you finish the technology it needs (the thread on the board). Eras 3–6 are waiting for power.”
- Warunek: postęp albo ukończenie dowolnej technologii z `TECH_BY[id].era === 2`. Każda z pięciu technologii ery 1 otwiera co najmniej jedną z ery 2 (`t_okna` → `t_spawanie`, `t_wieza` → `t_barykady`, `t_kozy` → `t_wezel`, `t_konserwy` → `t_szklarnia` i `t_grzyby`, `t_zielarstwo` → `t_ambu`), więc cel jest zawsze osiągalny po R6.4.
- Uczy M60.

## R7. Sąsiedzi

Tytuł „Sąsiedzi” / “Neighbours”. Otwiera się po R6. Zmiana integratora 24.10.2026: rozdziału nie ma tam, gdzie w 120 m od siedziby nie stoi ani blok, ani dom (`GovPlace.near` równe „nikt”): nie ma do kogo pukać, więc ścieżka idzie z R6 prosto do R8. Słowa „blok” i „dom” w tekstach idą według sąsiadów, jak `Words.sasiad` (okolica z domów to „sąsiedniego domu”, także z siedzibą w bloku). Wariant domu nie ma słów z bloku (`FORBIDDEN_DOM`): w `wejscie` zamiast „budynek albo mieszkanie bez lokatorów” jest „Pusty dom”, a w `szaber` nie ma zdania o schodach i piętrze (piętro zostaje w menu gry, zdanie tylko w wariancie bloku). Na trzech demach zawsze jest do kogo iść: Przymorze ma najbliższe drzwi bloków 61–75 m od siedziby (wszystkie zamieszkane), Lanciego blok 23 m, Zielonki puste domy 31–46 m i zamieszkane od 53 m.

R7.1 `pukanie`: „Zapukajcie do sąsiadów.” / “Knock on the neighbours’ door.”
- Jak: „Zaznaczcie kogoś i prawy przycisk na drzwiach sąsiedniego [bloku]: „Zapukać”. Za dnia ludzie bywają w domu, nocą otwierają niechętnie.” / “Select someone and right-click the door of the block next door: “Knock”. By day people tend to be in; at night they’re slow to open.” W trybie zombie dopisek: „Za siatką są szwendacze: idźcie za dnia, z dzidą.” / “There are shamblers out there: go by day, with a spear.”
- Warunek: pionek zarządu z pracą `door` i `job.what === 'knock'` (`orderDoor`, `src/sim/sim.ts:8622`) zobaczony od otwarcia rozdziału albo spotkanie (`st.sasiedzi.nr` większe niż przy otwarciu). Zmiana integratora 24.10.2026: krótką pracę przy drzwiach (osoba stoi już pod drzwiami, szybkie tempo) okienko mogłoby ominąć między klatkami, więc liczy się też trwały ślad pukania w stanie: napis z wynikiem próby, który zostaje do następnego napisu (`st.sasiedzi.napis.co` równe „nikt”, „ktos” albo „szuranie”, czyli „Nikt nie otwiera.”, „Nikt nie otwiera, ale za drzwiami coś szura.” i „Ktoś jest w środku, ale nie otwiera.”), pokazany nie wcześniej niż otwarcie rozdziału (`napis.tick` nie mniejsze niż `StanSciezki.od`). Inne napisy sąsiadów (zamek, ostrzeżenie, wynik spotkania) pukaniem nie są.
- Uczy M46.

R7.2 `spotkanie`: „Porozmawiajcie z lokatorami.” / “Talk to the residents next door.” (dom: „Porozmawiajcie z sąsiadami.” / “Talk to the neighbours.”)
- Jak: „Kiedy ktoś otworzy, okno spotkania pokaże, kto stoi w drzwiach i co o was myśli: „Porozmawiać”, „Dać jedzenie (2 porcje)”, „Zaprosić do nas (… szans)”. Kto was zna, chętniej pomoże.” / “When someone opens up, the meeting window shows who is at the door and what they think of you: “Talk”, “Give them 2 food”, “Invite them to join you (… chance)”. People who know you are more willing to help.”
- Warunek: spotkanie od otwarcia rozdziału (`st.sasiedzi.nr` większe niż przy otwarciu) i skończone (`st.sasiedzi.spotkanie` puste). Okno: spotkanie. Zmiana integratora 24.10.2026: licznik rośnie w chwili, gdy zaczyna się spotkanie, więc cel zaliczony po samym liczniku byłby zrobiony, zanim otworzy się okno spotkania, i linia „Cel: …” nigdy by się w nim nie pokazała; zalicza się dopiero po zakończeniu spotkania (gracz wybrał, okno zniknęło). `pukanie` zalicza się za to już przy początku spotkania.
- Uczy M47, nowy element: okno spotkania.

R7.3 `wejscie`: „Wejdźcie do zamkniętego budynku.” / “Get into a closed-up building.”
- Jak: „Prawy przycisk na drzwiach: „Otworzyć drzwi”, a zamknięte na klucz „Wyważyć drzwi” (głośno; w trybie zombie ściąga szwendaczy). Pusty budynek albo mieszkanie bez lokatorów to łup bez awantury.” / “Right-click a door: “Open the door”, and if it’s locked, “Force the door” (loud; in Zombie mode it draws shamblers). An empty building, or a flat with nobody home, means loot without a row.” W kodzie klauzula o trybie zombie jest przypisana do trybu: zwykła gra „(głośno)” / “(loud)”, zombie „(głośno i ściąga szwendaczy)” / “(loud, and it draws shamblers)”.
- Warunek: któryś budynek sąsiada `otwarty` w `st.sasiedzi.budynki`.
- Uczy M46.

R7.4 `szaber`: „Przeszukajcie pomieszczenie u sąsiadów.” / “Search a room next door.”
- Jak: „W otwartym budynku prawy przycisk w pomieszczeniu: „Przeszukać …”, a na schodach „Przeszukać piętro”. Łup zanieście na podwórko („Zanieść na podwórko”), a drzwi od ulicy możecie potem zabić deskami.” / “Inside an open building, right-click a room: “Search the …”, or on the stairs “Search a floor upstairs”. Carry the loot home (“Carry into the yard”); you can nail planks over the street door afterwards.”
- Warunek: u sąsiadów przeszukane pomieszczenie (`przeszukane`, `mieszkania[].przeszukane`) albo piętro (`pietra`).
- Uczy M48 (M46: zabijanie drzwi).

## R8. Drogi do zwycięstwa

Tytuł „Drogi do zwycięstwa” / “Roads to victory”. Otwiera się po R7. Dwa ostatnie cele są długie: trwają dni i pokazują postęp liczbą.

R8.1 `drogi`: „Zajrzyjcie do dróg do zwycięstwa.” / “Have a look at the roads to victory.”
- Jak: „Menu, „Drogi do zwycięstwa”: pięć dróg z kamieniami milowymi; każda kończy się innym epilogiem.” / “Menu, “Roads to victory”: five roads with milestones; each ends in a different epilogue.”
- Warunek: zdarzenie interfejsu `drogi` (otwarcie ekranu dróg) od otwarcia rozdziału.
- Uczy M70, nowy element: ekran dróg.

R8.2 `ludnosc`: tekst to „co dalej” drogi ludnościowej (`PostepDrogi.dalej` z `ocenDrogi`), na przykład „Zbierzcie 25 osób pod zarządem.” / “Get 25 people under the board.” Zmiana integratora 24.10.2026: tekst jest „co dalej” z chwili otwarcia rozdziału (z liczbą kamieni z `StanSciezki.start.kamienLudnosci`), a nie z bieżącej, bo zaliczony cel pokazywałby inaczej zdanie o następnym progu; silnik w tym celu podaje stan ścieżki także do `tekst` i `jak`. Cel nie istnieje bez włączonych dróg i gdy droga ludnościowa jest przebyta do końca.
- Jak: „Nowe osiedle: {ile} z {cel}. Ludzie przychodzą z kart wydarzeń i od sąsiadów („Zaprosić do nas”).” / “A new estate: {n} of {target}. People come from event cards and from next door (“Invite them to join you”).” Po scaleniu `praca-ludzi` dopisek „…i spośród wędrowców” / “…and from wanderers”.
- Warunek: zaliczonych kamieni ludności (`gov.zwyciestwo.kamienie.ludnosc`) więcej niż przy otwarciu rozdziału.
- Uczy M70.

R8.3 `teren`: „Otoczcie wspólnym płotem pierwszy sąsiedni budynek.” / “Put a shared fence round the first building next door.”
- Jak: „Prawy przycisk na drzwiach otwartego budynku obok: „Otoczyć wspólnym płotem (…)”, z kosztem i czasem w menu. Między wami nie może być jezdni.” / “Right-click the door of an open building next door: “Put up a shared fence (…)”, with the cost and time in the menu. There can’t be a road between you.”
- Warunek: `gov.zwyciestwo.kamienie.teren >= 1`. Tylko na mapie, gdzie da się otoczyć choć jeden budynek (`GovInput.teren.mozliwe > 0`, poprawka 9): Lanciego i Zielonki tak, Przymorze nie (tam cel nie wchodzi do listy). Zmiana integratora 24.10.2026: ten sam predykat, `terenMozliwy` z `src/gov/zwyciestwo.ts` (brak pola `mozliwe` znaczy „da się”), czyta ekran dróg, więc lista celów i ekran nie mogą się rozjechać; osiedle zapasowe (`genProc`) ma płot albo nie zależnie od ziarna (ziarno 2 trzy budynki, ziarno 1 żadnego). Bez wejścia zarządu (`OdczytCelow.input` równe null, czego w grze nie ma, gdy jest zarząd) cel nie wchodzi do listy, jak `ludnosc` (R8.2): nie ma jak ocenić, czy płot dosięga; zaliczony zostaje.
- Uczy M50.

## Okazje

Każda okazja ma wyzwalacz, tytuł z „Teraz:” / “Now:” i 1–3 cele. Wyzwalacze czyta interfejs ze stanu gry co klatkę; okazja zamyka się, gdy wyzwalacz zgaśnie albo wszystkie jej cele są zrobione.

Zmiana z zadania 9 (24.10.2026), zasady okazji w kodzie (`krokOkazji` w `src/ui/sciezka.ts`, definicje w `src/ui/sciezka-okazje.ts`):
- Otwarta jest najwyżej jedna, w kolejności ważności O5, O6, O4, O3, O8, O2, O1, O7 (życie, potem zima, potem goście). Ważniejsza wypiera otwartą niższą w tym samym kroku, a wyparta wraca ze świeżym stanem otwarcia (nowy tick, licznik zabitych i pionek z chwili powrotu), gdy ważniejsza się skończy, o ile jej wyzwalacz dalej trwa.
- Tytuł niesie „Teraz:” / “Now:” sam (`celeHtml` niczego nie dopisuje).
- Cele okazji nie mają terminu. Niezrobiony czeka na następną taką okazję, zrobiony nie wraca, a okazja bez niezrobionych celów w ogóle się nie otwiera. Cel, którego warunek jest już prawdziwy przy otwarciu, zalicza się od razu.
- Cele liczą się przed zamknięciem, na tym samym odczycie gry: zdarzenie, które mija razem ze skutkiem celu (udana amputacja zdejmuje ugryzienie, dobicie zdejmuje czas wstania), cel zalicza. Wyzwalacz otwarcia i trwania mogą się różnić, jeśli próg ma histerezę (O4).
- Okazja, która dotyczy jednego pionka albo jednej rzeczy (wędrowiec, handlarz, ugryziony, zwłoki), trzyma jej id w `StanSciezki.okazja.cel`; licznik zabitych przy otwarciu (`zabici`) zapisuje się zawsze, czyta go tylko O4.
- Przed końcem kroków samouczka (`st.tut.step` inne niż `TUT_STEPS.length` i −1) okazji nie ma, a otwarta zamyka się.

O1. „Teraz: wędrowiec przy siatce” / “Now: a wanderer at the fence” (zombie: „ocalały” / “survivor”). Wyzwalacz: pionek `wedrowiec` w fazie 1 (przystanął przy siatce, `src/sim/wedrowcy.ts`). Pierwszy przychodzi drugiego dnia między 8:00 a 12:00, potem codziennie (w sondach 1–2 razy na dobę).
- O1.1 `zagadaj`: „Zagadajcie wędrowca.” / “Talk to the wanderer.” Jak: „Zaznaczcie kogoś i prawy przycisk na wędrowcu: „Zagadać”. Rozmowa przez siatkę przynosi wieść: o handlarzu, o autach do przeszukania.” / “Select someone and right-click the wanderer: “Talk to the wanderer”. A chat through the fence brings news: about the trader, about cars worth searching.” Warunek: wędrowiec z `job.what === 'zagadany'` zobaczony. Uczy M52. Zmiana z zadania 9: okazja pilnuje tego wędrowca, który ją otworzył (id w `cel`), a w trybie zombie tekst celu i podpowiedzi mówią „ocalałego” / “the survivor” (menu zostaje „Zagadać” / “Talk to the wanderer”).
- O1.2 `reka` [praca-ludzi, zombie]: „Zapytajcie ocalałego o rękę.” / “Ask the survivor to show their arm.” Jak: „Po rozmowie prawy przycisk na ocalałym: „Zapytać o rękę”. Co piąty ukrywa ugryzienie.” / “After the chat, right-click the survivor: “Ask to see their arm”. One in five is hiding a bite.” Warunek: praca `zapros` z `what === 'reka'` zobaczona (`startZapros` w gałęzi). Uczy M69.
- O1.3 `zapros` [praca-ludzi]: „Zaproście wędrowca do siebie.” / “Invite the wanderer to stay.” Jak: „Po rozmowie prawy przycisk na wędrowcu: „Zaprosić do nas (N% szans)”. Szanse rosną z jedzeniem w zapasie i wolnym łóżkiem, spadają po napaści na obcych.” / “After the chat, right-click the wanderer: “Invite to join us (N% chance)”. The odds go up with food in stock and a free bed, and down after you rob strangers.” Warunek: praca `zapros` z `what === 'zapros'` zobaczona (liczy się próba, nie szczęście). Uczy M69.

O2. „Teraz: handlarz pod [bramą]” / “Now: the trader at the gate”. Wyzwalacz: `st.obcy.trader >= 0` i handlarz w fazie 1 (czeka do 3 h, najdłużej do 18:00). Zwykły tryb: drugi dzień 10:00–12:00, zombie: od czwartego dnia, rzadko.
- O2.1 `wymiana`: „Wymieńcie coś z handlarzem.” / “Trade with the trader.” Jak: „Zaznaczcie kogoś i prawy przycisk na handlarzu albo wózku: „Dać … za …”. Złom jest tu walutą. Napaść też jest w menu, ale wieść pójdzie do innych handlarzy.” / “Select someone and right-click the trader or his cart: “Give … for …”. Scrap is the currency here. Robbing him is on the menu too, but word will reach the other traders.” Warunek: w czasie wizyty któraś oferta ma `left` mniejsze niż `OFFER_TIMES`. Uczy M51.

O3. „Teraz: szabrownicy za siatką” / “Now: looters at the fence” (zwykły). Wyzwalacz: napad w fazie 1 albo 2 (`snap.raid.phase`).
- O3.1 `alarm`: „Ogłoście alarm.” / “Sound the alarm.” Jak: „Przycisk „Do broni!” u góry: wszyscy zdolni idą na wartę [przy bramie]. Po wszystkim „Odwołaj”. Prawy przycisk na szabrowniku: „Atakuj szabrownika”.” / “The “To arms!” button at the top: everyone who can stand goes on watch at the gate. Afterwards, “Stand down”. Right-click a looter: “Attack the looter”.” Warunek: `alarmOn(st)` w czasie okazji. Uczy M27, M26, nowy element: przycisk „Do broni!”.
- O3.2 `odparty`: „Odeprzyjcie napad.” / “Fight off the raid.” Jak: „Liczy się warta, która nie śpi, światło przy siatce i broń. Na noc można też zamknąć [bramę]: prawy przycisk na niej, „Zamknąć [bramę]”.” / “What counts is a watch that’s awake, light by the fence and weapons. You can also shut the gate for the night: right-click it, “Close the gate”.” Warunek: napad tej okazji skończony z `snap.raid.outcome === 'odparty'`. Uczy M28, M22. Zmiana z zadania 9: rozstrzygnięcie liczy się, gdy okienko je zobaczy w fazie 1, 2 albo w kroku, w którym napad kończy się (faza 3), przed zamknięciem okazji; wtargnięcie nie zalicza. W trybie zombie O3 nie istnieje (szabrowników tam nie ma).

O4. „Teraz: stado pod siatką” / “Now: the herd at the fence” (zombie). Wyzwalacz: noc (21:00–6:00) i co najmniej 3 napierających (`snap.zombies.pressing`).
- O4.1 `alarm`: „Ogłoście alarm.” / “Sound the alarm.” Jak: „„Do broni!” u góry: wszyscy zdolni idą na wartę przy siatce. Dźgajcie napierających, zanim w jednym miejscu zbierze się ich {FENCE_BEARS}.” / “The “To arms!” button: everyone who can stand goes on watch at the fence. Spear the ones pressing in before {FENCE_BEARS} of them bunch up in one spot.” Warunek: `alarmOn(st)` w czasie okazji. Uczy M27, M71.
- O4.2 `zabici`: „Zabijcie trzech napierających.” / “Kill three of the ones pressing in.” Jak: „Warta z dzidą bije sama; prawy przycisk na szwendaczu: „Atakuj szwendacza”. Rano wzmocnijcie zużytą siatkę: prawy przycisk na niej, „Wzmocnić siatkę”.” / “A guard with a spear fights on their own; right-click a shambler: “Attack the shambler”. In the morning shore up the worn fence: right-click it, “Shore up the fence”.” Warunek: `st.tally.killed` większe o 3 niż przy otwarciu okazji. Uczy M71, M21. Zmiana z zadania 9: histereza. Okazja otwiera się od trzech napierających, ale trwa, dopóki napiera choć jeden (i do 6:00), bo cel „zabijcie trzech” sam zmniejsza stado: bez niej okazja gasłaby po drugim zabitym. Noc to od `HORDE_FROM` (21:00) do `DISPERSE` (6:00).

O5. „Teraz: ugryzienie” / “Now: a bite” (zombie). Wyzwalacz: ktoś z zarządu ugryziony w kończynę, amputacja jeszcze możliwa (`SimPerson.bite.limb` i `bite.amputate`).
- O5.1 `amputacja`: „Ratujcie: {imię} potrzebuje amputacji.” / “Save {name}: amputate.” Jak: „Na karcie ugryzionej osoby „Amputować”: zrobi to ktoś z medycyną, pół godziny, nie zawsze się udaje. Po dwóch godzinach jest za późno.” / “On the bitten person’s card, “Amputate”: someone with Medicine does it, half an hour, and it doesn’t always work. After two hours it’s too late.” Warunek: ta osoba `maimed`. Uczy M74, nowy element: przycisk „Amputować”. Zmiana z zadania 9: okazja otwiera się tylko wtedy, gdy jest komu amputować (ktoś inny z zarządu, na miejscu i ze zdrowiem ponad 20, jak w przycisku na karcie osoby: bez niego karta mówi „Nie ma komu amputować.”, a cel byłby nie do zrobienia); otwarta trwa do końca okna amputacji (dwie godziny od ugryzienia), choćby chirurg wyszedł. Cel jest zrobiony, gdy osoba ma kikut i nie ma już ugryzienia (kto miał kikut wcześniej, a został ugryziony znowu, nie zalicza celu sam).

O6. „Teraz: zmarły wstanie” / “Now: the dead will rise” (zombie). Wyzwalacz: zwłoki z `fuel > 0` (wstaną).
- O6.1 `dobic`: „Dobijcie ciało, zanim wstanie.” / “Finish off the body before it gets up.” Jak: „Prawy przycisk na ciele: „Dobić”. Każdy zmarły wstaje po godzinie; wolny z [zarządu] dobije też sam.” / “Right-click the body: “Finish off the body”. Everyone who dies gets back up an hour later; a free board member will also do it on their own.” Warunek: te zwłoki mają `fuel === 0` (dobite; zwłoki, które wstały, znikają). Uczy M75. Zmiana z zadania 9: zalicza także dobicie przez wolnego z zarządu (automat „sam dobije”), bo warunek to stan zwłok, a nie polecenie; okazja pilnuje tych zwłok, które ją otworzyły (id w `cel`).

O7. „Teraz: obcy przy aucie” / “Now: strangers at a car”. Wyzwalacz: obca ekipa przeszukuje wrak (pionek `obcy` z pracą `scavenge` w fazie poniżej 2). Zwykły tryb: od 3.–4. dnia, zombie: od 3.–5.
- O7.1 `wrak`: „Przeszukajcie wrak przy ulicy.” / “Search a wreck by the road.” Jak: „Prawy przycisk na aucie: „Przeszukać …”, a po przeszukaniu „Rozebrać …” na złom i części. Obcych od auta odgoni „Przegonić”.” / “Right-click a car: “Search …”, and once it’s searched, “Strip …” for scrap and parts. “Chase them off” sends the strangers away from the car.” Warunek: pionek zarządu z pracą `wreck` zobaczony (oznaczenia w `st.wraki` stawia też ekipa, więc nie wystarczą). Uczy M43, M53.

O8. „Teraz: zima idzie” / “Now: winter is coming”. Dodane przez integratora 19.10.2026 (badanie zimy), do przejrzenia przez Mateusza. Podstawa: `docs/ocena/2026-10-20-zima-w-grach-botow.md`. Koza stoi w kuchni i grzeje sypialnię tylko przez drzwi (połowa ocieplenia na każde: sypialnia ma przy kozie palącej całą noc najwyżej dwór + 6°C), od dnia 10 zarząd wstaje zmarznięty, a wkurzenie rośnie o 6 na dobę; tylko ogrzana sypialnia daje zarządowi 5–12 dni zimy więcej, a gracz nie ma skąd tego wiedzieć. Wyzwalacz: od ósmego dnia roku (trzy dni przed zimą, która zaczyna się jedenastego; rok to cztery pory po 10 dni, więc też od dnia 48, 88…) do końca zimy (dzień 20 roku), gdy w żadnym pokoju do spania naszego mieszkania (rodzaj `pokoj`: tylko w nich zarząd śpi w łóżkach i na podłodze) nie stoi ogrzewanie (koza albo koza z beczki w tym pokoju, albo kocioł, który grzeje wszystkie nasze mieszkania; liczy się to, co stoi, nie to, czy się pali). Okazja istnieje tylko tam, gdzie da się ją zrobić: osada może zbadać kozę z beczki (ktoś zna się na cieple, także na wyprawie, albo jest książka z tej dziedziny, albo koza jest już zbadana) i któryś pokój do spania ma kafelek, na którym koza z beczki może stanąć (w zasięgu okna własnego pomieszczenia, poza składem drewna i kafelkiem przed kozą zarządu; meble i plany liczą się osobno, bo gracz może je usunąć). Mija z końcem zimy, a zrobiony cel nie wraca (w następnym roku wraca tylko niezrobiony).
- O8.1 `kozy`: „Zbadajcie kozę z beczki.” / “Research the barrel stove.” Jak: „Zima idzie, a koza w kuchni nie dogrzeje sypialni: ciepło dochodzi do niej tylko przez drzwi, więc w mrozie ludzie wstają zmarznięci i rośnie wkurzenie. Koza z beczki grzeje pokój, w którym stoi. Tablica badań (przycisk Badania u góry albo T): klik w kartkę z kozami, potem „Badać”.” / “Winter is coming, and the stove in the kitchen won’t warm the bedroom: the heat only reaches it through the door, so in a hard frost people wake up frozen and tempers rise. A barrel stove heats the room it stands in. The Research board (Research button at the top, or T): click the card with the stoves, then “Research”.” Bez pracowni zamiast ostatniego zdania: „Najpierw pracownia: Budowa, zakładka Dom: Pracownia (deski 14, części 4) w pokoju waszego mieszkania. Potem tablica badań: kartka z kozami, „Badać”.” (dom: „waszego domu”; kartki nie nazywam z nazwy, bo „Kozy w mieszkaniach” ma słowo z bloku). Warunek: `t_kozy` w `st.techDone`. Okno: tablica badań (linia „Cel: …” na tablicy, dopóki badanie jest do zrobienia). Uczy M57 i M61.
- O8.2 `beczka`: „Postawcie kozę z beczki w pokoju, w którym śpicie.” / “Put a barrel stove in the room where you sleep.” Czeka na badanie („czeka na badanie” / “waiting for the research”). Jak: „Koza z beczki grzeje pokój, w którym stoi; koza w kuchni sypialni zimą nie dogrzeje. Budowa, zakładka Dom: Koza z beczki (złom 8, części 1) w pokoju, w którym śpicie, najwyżej 2 m od okna, bo rura idzie przez okno.” / “A barrel stove heats the room it stands in; the stove in the kitchen won’t warm the bedroom in winter. Build, Home tab: Barrel stove (scrap 8, parts 1) in the room where you sleep, within 2 m of a window, because the flue goes out through the window.” Dopiski: gdy któryś pokój do spania nie ma okna w zasięgu, „Pokój bez okna odpada: postawcie Łóżka piętrowe (deski 20) w pokoju z oknem i kozę tam.” / “A room with no window won’t do: put up Bunk beds (planks 20) in a room with a window and the stove there.”; gdy przy oknach nie ma teraz wolnego kafelka (meble), „Przy oknie brak miejsca? Prawy przycisk na meblu: „Spalić …”.” / “No space by the window? Right-click a piece of furniture: “Burn the …”.” (meble zarządu można spalić, nie rozebrać). Warunek: koza z beczki stoi w pokoju do spania (w kuchni albo przedpokoju nie liczy się). Uczy M61, M44.
- Dowód, że da się ją zrobić na każdej mapie albo jej nie ma (tests/unit/sciezka-okazje.test.ts, prawdziwa symulacja, samymi poleceniami gracza): Przymorze (jeden pokój do spania, 8 kafelków w zasięgu okna, 6 wolnych od mebli), Zielonki (dwa pokoje po 8 kafelków), osiedle zapasowe w obu ziarnach (16 kafelków w jednym pokoju albo 8 i 6 w dwóch, z których drugi jest zastawiony meblami) mają okazję i da się ją skończyć: pracownia, `research`, stół, `build` kozy w pokoju, praca zarządu. Lanciego nie ma okazji: żaden z czterech pokoi do spania nie ma okna w zasięgu (okna mają tam tylko kuchnia i łazienka), koza z beczki stanęłaby tylko w kuchni, a łóżka piętrowe wolno stawiać wyłącznie w pokojach (miejsce `pokoj`), więc droga „łóżka piętrowe w pokoju z oknem i koza tam” nie istnieje; zdanie o łóżkach piętrowych pojawia się więc tylko na mapach, gdzie część pokoi ma okno, a część nie. Skutek dla balansu: na Lanciego zima dalej nie ma tej dźwigni (kocioł z ery 2, folia w oknach z `t_okna`).

## Po ostatnim rozdziale

Po R8 okienko pokazuje drogi do zwycięstwa, na które gra ma dziś następny krok: dla każdej drogi z `PostepDrogi.dalej` jeden wiersz „{nazwa}: {dalej}” z postępem („{ile} z {cel}”), a bieżący to pierwsza niezaliczona. Teren tylko tam, gdzie `teren.mozliwe > 0`. Technologia po dwóch pierwszych kamieniach ma „Wkrótce” i znika z okienka (zostaje na ekranie dróg), lek i cuda nie wchodzą wcale. Gdy żadna droga nie ma następnego kroku, okienko się chowa. Nagłówek zwija i rozwija okienko jak dziś na telefonie, także na komputerze. Wiersze liczy `wierszeDrog` (src/ui/sciezka-rozdzialy.ts) wprost z `ocenDrogi`, więc o tym, co odpada (teren bez sąsiada do otoczenia, technologia po dwóch kamieniach, lek, cuda), rozstrzyga sama ocena; w kodzie wiersz niesie nazwę drogi, „co dalej” i, dla ludności, postęp „{ile} z {cel}”. Bez włączonych dróg (`GovState.zwyciestwo`) albo wejścia zarządu widok nie ma wierszy (okienko się chowa).

## Stan i zapis

Nowe pole jest tylko w zapisie interfejsu: `Save.cele?: StanSciezki` w `src/ui/zapis.ts`. Symulacja, zarząd, ich skróty i boty się nie zmieniają (wyjątek to poprawka 8, opisana osobno). Stary zapis bez pola dostaje stan na start (`stanZZapisu`): R0 bez raportu, inaczej R1 otwarty w chwili wczytania; cele, które stan już spełnia, zaliczają się od razu. Zły kształt pola to brak pola. `SAVE_VERSION` bez zmian.

```ts
interface StanSciezki {
  v: 1;
  /** bieżący rozdział głównej ścieżki i tick jego otwarcia */
  rozdzial: 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6' | 'r7' | 'r8' | 'koniec';
  od: number;
  /** liczniki z chwili otwarcia rozdziału do warunków „od otwarcia” */
  start: { uchwaly: number; raporty: number; ludnosc: number; lup: number; spotkania: number; kamienLudnosci: number };
  /** zaliczone cele głównej ścieżki i okazji: klucz ('r1.przeszukaj', 'o2.wymiana') → tick zaliczenia */
  zrobione: Record<string, number>;
  /** cele, które przepadły (termin minął) */
  przepadle: string[];
  /** zdarzenia interfejsu bez śladu w stanie gry: 'lista', 'mieszkaniec', 'budynek', 'drogi' → tick ostatniego */
  ui: Record<string, number>;
  /** otwarta okazja: klucz, tick otwarcia, licznik zabitych przy otwarciu, pionek albo rzecz, której dotyczy */
  okazja?: { k: 'o1' | 'o2' | 'o3' | 'o4' | 'o5' | 'o6' | 'o7' | 'o8'; od: number; zabici?: number; cel?: number };
}
```

Dzisiejsze `woodReady` i `woodReady2` z `src/main.ts` przechodzą do `zrobione` (U6). Zapis idzie z resztą gry (co godzinę gry, przy ukryciu karty i przy wyjściu ze strony), więc zaliczenie chwilowego stanu nie ginie przy przeładowaniu.

Determinizm: ścieżka niczego nie zmienia w symulacji ani w zarządzie, tylko czyta ich stan, więc zasady stałego kroku jej nie dotyczą. Funkcje ścieżki są czyste (stan ścieżki i odczyt na wejściu, nowy stan na wyjściu), co pozwala testować je w Node na prawdziwej symulacji jak dzisiejsze testy celów.

## Interfejs okienka celów

- `#goals` zostaje w tym samym miejscu i rozmiarze (`src/style.css:702`). Okazja to blok nad nagłówkiem rozdziału: tytuł „Teraz: …” i jej cele z podpowiedzią bieżącego. Rozdział pod spodem jak dziś: nagłówek z tytułem i licznikiem, lista, podpowiedź pod bieżącym.
- Cel czekający jest przyciemniony z krótkim dopiskiem („czeka do 20:00”, „czeka do zebrania”, „czeka do rana” / “waiting for 20:00”, “waiting for the meeting”, “waiting for morning”).
- Na telefonie zwinięte okienko pokazuje bieżący cel okazji, a bez okazji bieżący cel rozdziału (dziś: bieżący cel dnia).
- Linia „Cel: …” w oknach karty nocy, uchwały, tablicy badań i spotkania, gdy bieżący cel ma `okno` tego okna.
- `window.zm.cele()` zwraca widok ścieżki, a `window.zm.rozdzial(k)` ustawia rozdział (tylko do zrzutów, jak `zm.wygraj`).
- Zdarzenia interfejsu do `StanSciezki.ui`: wybór z listy ludzi (`wybierz` w `src/main.ts:420` i klawisze Q, E), karta mieszkańca (`residentFocus` w `src/main.ts:3253`, `:3260`), karta budynku (`budFocus` w `focusTile`, `src/main.ts:2755`), ekran dróg (`showDrogi`, `src/main.ts:1222`).

## Styk z gałęziami

`praca-ludzi`:
- R3 i O1.2, O1.3 powstają dopiero po scaleniu; czytają `st.praca` i prace `zapros`, `reka`.
- Automat może sam zaliczyć R1 `przeszukaj` i R1 `obwod` (Szaber, Naprawy od 6:00 drugiego dnia po samouczku). To zgodne z projektem pracy i nie psuje ścieżki: R3 mówi, że ludzie pracują sami.
- Automat nie ścina suchego drzewa przed końcem samouczka (`startDrwal` pomija je do kroku „ścięte”), więc samouczek nie utknie.
- Dopisek o wędrowcach w R8 `ludnosc` i sekcja „Praca” w „Jak grać” (gałąź ją ma).

`wydarzenia`:
- Etap 1 usuwa karty bez ludzi (U15) i dokłada kartę „Szwendacz w siatce”; ścieżka tego nie wymaga.
- Etap 3 (goście z klocków) zmienia drogę nowych ludzi: R4 `nowi` dostaje zdanie o gościu pod bramą i „Pokaż”; warunek (ludność) zostaje.
- Etap 2 (awans, wyjście bramą) zmienia ludność w obie strony; R4 `nowi` liczy ludność, więc wyrzucenie kogoś opóźnia cel, co jest uczciwe.

## Jak sprawdzono

Skrypty w Node 25 bez kompilacji, na `src/` z 715df48 (poza repo, w notatniku sesji): stan startu i teksty celów na trzech demach w obu trybach (także po angielsku i na dotyku); dwa dni grane botem jak w grze z zapisem, kiedy cel staje się bieżący i kiedy jest zaliczony; drewno po samouczku, palenie stołu i ścięcie drzewa za siatką w zombie; drzewa i meble w obrębie siatki; sąsiedzi do 150 m z drzwiami, mieszkańcami i wspólnym płotem; miejsca z mapy miasta i wyprawa dzienna o 9:00 drugiego dnia; tydzień gry botem (ludność, zaufanie, wkurzenie, uchwały, wydarzenia, handlarz, wędrowcy, ugryzienia). Bez Chromium: wszystko dało się sprawdzić w kodzie i w Node.

## Jak sprawdzamy budowę

- Vitest na prawdziwej symulacji (dema z `public/demo`, świat z ziarna adresu jak w testach sąsiadów): każdy cel zalicza się dokładnie wtedy, gdy zrobi się to, co mówi podpowiedź, i nie wcześniej; cele przepadają tylko z terminem; okazje otwierają się i zamykają z wyzwalaczem; stan ścieżki przechodzi przez zapis i wczytanie; po angielsku bez polskich liter, w domu bez słów z bloku.
- Bot ścieżki (`npm run bot:cele`): trzy dema w obu trybach przez 10 dni, gracz robi to, co mówią podpowiedzi; drukuje dzień i godzinę otwarcia i końca każdego rozdziału, cele przepadłe i cele okazji. Każdy rozdział ma się kończyć na każdym z sześciu przebiegów.
- Zrzuty w Chromium (`npm run shots -- cele`): drugi dzień na komputerze i telefonie, w domu i w bloku, linia celu na karcie nocy, okazja z handlarzem, ugryzienie w trybie zombie, okienko dróg po ostatnim rozdziale, po angielsku.
- Boty gry (`npm run bot`, `npm run bot:zombie`) bez zmian skrótów poza poprawką 8, która ma własny wpis w dzienniku.

## Pytania do Mateusza

1. Czy rozdział ma czekać do skutku? Rekomendacja: tak. Termin mają tylko cele jednej nocy (drewno, dyżur), reszta czeka, bo każdy cel da się zrobić na każdej mapie; na wypadek znudzenia nagłówek okienka da się zwinąć.
2. Okazje (wędrowiec, handlarz, napad, stado, ugryzienie, zwłoki, obcy przy aucie) jako blok nad rozdziałem, który nie przepada i nie wraca po zrobieniu? Rekomendacja: tak.
3. Samo dokładanie do kozy w samouczku zostawić i poprawić tylko tekst? Rekomendacja: tak, bez zmian w symulacji i skrótach botów.
4. Karta „Ślady przy siatce” łata za 2 złomu, menu za 3. Wyrównać do 3, choć zmieni to skróty botów? Rekomendacja: tak, ale osobnym zadaniem po scaleniu `praca-ludzi` i `wydarzenia`, które i tak ogłaszają nowe skróty bazowe.
5. Czy ścieżka ma uczyć napaści (handlarz, wędrowiec, okradanie mieszkań sąsiadów)? Rekomendacja: nie; zostają w menu z ceną w podpowiedziach, a cele uczą drogi bez przemocy.
6. Jedna kolejność rozdziałów na wszystkie mapy, choć w domu jednorodzinnym materiału brakuje wcześniej? Rekomendacja: tak; w domu podpowiedź pierwszej budowli dopisuje sąsiednie domy jako źródło desek.
7. Po ostatnim rozdziale okienko z drogami do zwycięstwa, które da się dziś grać? Rekomendacja: tak, a bez następnego kroku okienko się chowa.
8. W trybie zombie druga noc: „dwie dzidy przy siatce” zamiast ogniska i uzbrojenia? Rekomendacja: tak, bo światło nocą przyciąga szwendaczy, a dzida to sedno obrony.
9. „Może wychodzić za siatkę” jako cel tylko w zwykłym trybie? Rekomendacja: tak; w zombie zostaje ostrzeżenie na karcie, bez zachęty w celach.

## Poza zakresem

- Zmiany symulacji i zarządu poza poprawkami 8 i 9 (zarząd czyta `teren.mozliwe`).
- Gra z sąsiadami (`?siec=1`): cele „Bez domu” zostają jak są, po zajęciu klatki ścieżka rusza od R1.
- Kwadraty i piętra za flagami adresu.
- Karty wydarzeń o ludziach, których nie ma (gałąź `wydarzenia`).
- Okno kroniki i historia zaliczonych rozdziałów.
