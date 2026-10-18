# Wędrowcy, obce ekipy i cena napaści

Trzeci kawałek sesji „Surowce” z 18.10.2026, na gałęzi `m2-surowce` (równej `pelna-gra` 35ded9d), po wrakach (`2026-10-18-surowce-design.md`) i handlarzu (`2026-10-18-handlarz-design.md`). Ruszyć kazała sesja „Pilnowanie agentów”, kiedy Mateusz był poza domem. Kierunek przyjął Mateusz w rozmowie („jest ok” na opis: obcy w dzień, których widać, nie da się nimi sterować, można ich zaatakować albo wejść w interakcję; atak ma cenę, spada zaufanie, wieść się niesie). Liczby i reszta rozstrzygnięć są moje, do przejrzenia.

## Cele

- Napaść kosztuje zaufanie osiedla, a nie tylko nastroje zarządu. Zarząd dowiaduje się o niej od razu i zapisuje to w kronice.
- Wędrowcy: za dnia ktoś przechodzi ulicą przez mapę i przystaje przy siatce. Można zagadać (wieść ze świata) albo napaść (worek z drobiazgami).
- Obce ekipy: co kilka dni dwie osoby z łomami przychodzą do nieprzeszukanego wraku za siatką i same go przeszukują. Łup przepada, wrak jest przeszukany. Można je przegonić, zanim skończą. Okolica wyczerpuje się więc także bez gracza.

## Poza zakresem

- Przyjmowanie wędrowców do siedziby (przyjęcia są dziś decyzją zarządu w wydarzeniach), handel z wędrowcem, walka z ekipą (przegonienie wystarcza), wędrowcy i ekipy w trybie zombie.

## Czego nie wolno

- Zmiany przebiegu botów: wszystko chodzi tylko z opcją `SimOpts.obcy` (jak handlarz). Zarząd dostaje nowe pole wejścia i stanu dopiero po pierwszej napaści, więc gry bez napaści mają ten sam stan zarządu.
- Importów z `src/sim` w `src/gov`.

## Cena napaści

| na kogo | zaufanie | wkurzenie | kronika |
|---|---|---|---|
| handlarz | −6 | +4 | „Wieść się niesie: zarząd napadł na handlarza pod bramą. Ludzie pytają, kto będzie następny.” |
| wędrowiec | −3 | +2 | „Wieść się niesie: zarząd napadł na wędrowca. Ludzie kręcą głowami.” |
| przegonienie ekipy | 0 | 0 | brak |

- Symulacja dopisuje napaść do `st.obcy.napady` (kto, tick). `GovInput.napady` to ta lista (bez pola, gdy jej nie ma), a zarząd liczy nowe po `GovState.napadN`, tak jak zgony po `deadN`. W domu zamiast „zarząd” idzie słowo ze słownika miejsca.
- Nastroje zarządu z handlarza zostają (−6 napastnik, −3 reszta). Za wędrowca −4 i −2.

## Wędrowcy

- Od drugiego dnia, między 8:00 a 17:00, jeden naraz: następny po 3–8 godzinach od przyjścia poprzedniego, a gdy termin wypadnie po 17:00, następnego dnia rano.
- Przychodzi z daleka ulicą (70 kroków), idzie na losowy kafelek ulicy tuż przy siatce, przystaje 20–40 minut gry, potem idzie w inną stronę (znowu daleko) i znika. Chodzi trochę wolniej od zarządu (plecak), więc da się go dogonić.
- Menu na wędrowcu: „Zagadać” (tylko gdy przystanął) i „Napaść na wędrowca” (z potwierdzeniem, gdy nie ucieka).
- Zagadać: osoba z zarządu idzie na podwórko na kafelek najbliżej niego (rozmowa przez siatkę, jak handel). Na miejscu wędrowiec zostaje jeszcze 10 minut, rozmawiający ma nastrój „Wieści ze świata” +3 na 6 godzin, a na dole ekranu pokazuje się wieść. Wieść losuje się z czterech rodzajów: kiedy przyjdzie handlarz („pojutrze”), ile aut przy ulicy nikt jeszcze nie przeszukał, że po okolicy chodzą ludzie z łomami (gdy ekipy są w grze), ogłoszenie ze słupa (ogłoszenia z 0.3, `ADS`). Raz zagadany wędrowiec drugi raz nic nowego nie powie.
- Napaść: osoba idzie do niego za siatkę i poprawia drogę za każdym razem, gdy dojdzie, a on jest dalej (najwyżej pół godziny gry pościgu). Na miejscu cios, wędrowiec rzuca worek i ucieka. Zawartość worka (1–3 porcje jedzenia, czasem część albo lek, losowane przy napaści) leży luzem w stertach po stronie ulicy, jak towar z wózka handlarza; sam worek nie jest rzeczą. Nosi się to „Zanieść na podwórko”.

## Obce ekipy

- Od drugiego dnia co dwa albo trzy dni, przyjście między 9:00 a 14:00, tylko gdy jest nieprzeszukany wrak, którego nie przeszukuje nikt z zarządu. Wrak losowy spośród takich.
- Dwie osoby przychodzą z daleka, stają przy wraku i przeszukują go godzinę gry (ostrożnie, więc dwa razy dłużej niż zarząd). Potem wrak jest przeszukany (`st.wraki`, stan 1), łup przepada, a na dole ekranu: „Obcy przeszukali malucha przy ulicy.” Odchodzą tam, skąd przyszli. Gdy w chwili przyjścia wrak jest już przeszukany, od razu odchodzą.
- Menu na każdym z nich: „Przegonić”. Osoba z zarządu idzie do nich; kiedy jest do 3 m, obaj uciekają, a wrak zostaje taki, jaki był. Przegonienie nic nie kosztuje.
- Dopóki ekipa idzie do wraku albo go przeszukuje, „Przeszukać” na tym wraku jest wyszarzone z powodem „przy aucie są obcy” i zarząd go nie zacznie. Do łupu prowadzi więc przegonienie (decyzja po recenzji: inaczej zarząd w pół godziny zawsze wygrywałby wyścig z ekipą i przeganianie byłoby zbędne).

## Stan, polecenia, prace

- Stary zapis, w którym handlarz był już napadnięty (bez listy `napady`), nie dostaje tej napaści wstecz: zaufanie liczy się od napaści po tej zmianie (decyzja po recenzji, takie zapisy są tylko z gałęzi testowej).
- `Obcy` dostaje pola opcjonalne: `wnext` (tick następnego wędrowca), `enext` (tick następnej ekipy), `napady` (lista `{ kto: 'handlarz' | 'wedrowiec'; tick }`), `wiesc` (`{ tick; text }`, ostatnia wieść do pokazania). Stary zapis z handlarzem dostaje `wnext` i `enext` w konstruktorze `Sim` bez losowania (jutro 9:00 i pojutrze 10:00).
- Pionki `wedrowiec` i `obcy` (obie nazwy są już w liście obcych rysowania), chodzą po stronie ulicy. Prace `wander` (0 idzie pod siatkę, 1 przystanął, 2 odchodzi, 3 ucieka, 4 zniknął) i `scavenge` (0 idzie do wraku, 1 przeszukuje, 2 odchodzi, 3 ucieka, 4 zniknął). Żaden nie jest wrogiem w `isEnemy`.
- Polecenia: `{ t: 'talk'; ids; target }`, `{ t: 'mug'; ids; target }` (napaść na wędrowca), `{ t: 'shoo'; ids; target }` (przegonić ekipę). Prace zarządu `talk`, `mug`, `shoo`.

## Testy i bramka

- `tests/unit/wedrowcy.test.ts`: wędrowiec przychodzi, przystaje, odchodzi; zagadanie daje wieść i nastrój; napaść daje worek i ucieczkę; ekipa przeszukuje wrak i łup przepada; przegonienie przed końcem zostawia wrak nieprzeszukany; zarząd po napaści na handlarza i wędrowca obniża zaufanie raz na napaść, z linią w kronice; bez opcji brak pól; zapis i wczytanie w trakcie dają ten sam skrót.
- Boty bez zmian skrótów, testy, Biome, build, zrzuty (wędrowiec przy siatce z menu, ekipa przy wraku, wieść na dole ekranu), wpis w dzienniku, lokalny commit.
