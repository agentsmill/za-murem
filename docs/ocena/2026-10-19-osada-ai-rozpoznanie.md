<!-- Raport nocnego integratora z 19.10.2026 (rozpoznanie przed projektem docs/superpowers/specs/2026-10-20-osada-ai-design.md). Skrypty pomiarowe z aneksu leżały w notatkach sesji i nie trafiły do repo. -->

# Osada prowadzona przez silnik gry: rekonesans i ocena pracy

Pomysł Mateusza z 19.10.2026 (wieczór): osada na nieodkrytym kwadracie miasta, którą prowadzi silnik gry, nie model językowy, z optymalnymi decyzjami, i która sama się rozwija; do testów mamy boty. Ten dokument zbiera fakty z kodu i dokumentów i ocenia pracę dla wariantów A, B i C z briefu (`osada-ai-rekonesans-brief.md`). Tylko odczyt: w repozytorium niczego nie zmieniłem ani nie commitowałem.

## Podstawa pomiarów i zastrzeżenia

- Kod: drzewo `/Users/mpawelczuk/Post-pixel/.claude/worktrees/noc-integracja`. Gałęzie `noc-integracja` i `pelna-gra` wskazują na ten sam commit. Zacząłem na 5ede74b. W trakcie pracy integrator scalił `praca-ludzi` i `zmeczenie-d` (67e9cf3), potem poprawił `tools/bot.ts` i dziennik (4b2f7f2, obecny HEAD). Między 67e9cf3 a 4b2f7f2 `git diff` pokazuje zmiany tylko w `tools/bot.ts` i `docs/POSTEP.md`, więc `src/` i moduły polityk botów są te same.
- Żeby nie czytać drzewa w trakcie scalania, zrobiłem trzy zamrożone kopie przez `git archive` w katalogu skryptów: `migawka-5ede74b` (przed pracą ludzi), `migawka-67e9cf3` i `migawka-4b2f7f2`. Numery linii i liczby są z 4b2f7f2 (dla `src/` to samo co 67e9cf3), chyba że napisano inaczej. 5ede74b podaję jako „przed pracą ludzi” tam, gdzie różnica jest ważna.
- Skrypty i logi: `/private/tmp/claude-501/-Users-mpawelczuk-Post-pixel/459a51a3-cfb2-459b-ae88-222f98950c4c/scratchpad/osada-ai/` (logi w `wyniki/` dla 5ede74b i `wyniki2/` dla 67e9cf3 i 4b2f7f2). Powtórzenie: `ZM_KOD=<katalog migawki> node <skrypt>.ts`, lista w aneksie.
- Czasy są orientacyjne. Maszyna była obciążona innymi bramkami (load average od 3 do 23), a ten sam przebieg bota trwał raz 30 s, raz 7 s. Porównania „przed i po” robiłem naprzemiennie, w tych samych warunkach. Rozmiary stanu, skróty, dni końca gry i zgodności są deterministyczne i od obciążenia nie zależą.

## Najkrócej

1. Boty są uprzężą testową, nie graczami. Cztery moduły polityk w `tests/unit/` (`gov-play`, `m2-play`, `sasiedzi-play`, `miasto-play`, razem 1 315 linii) nie mają żadnej zależności od Node. Zmierzone: ten sam 10-dniowy przebieg w headless Chromium 156 i w Node daje ten sam skrót stanu (`fe2553ba`). Do Node są przywiązane dopiero skrypty `tools/bot*.ts`.
2. Żaden bot nie przeżywa pierwszej zimy. W ponad 70 grach botów (zwykły i zombie, z mieszkańcami z adresu i bez, z jedzeniem z niczego i bez, na atrapie zarządu) zarząd zostaje odwołany (raz pustka) między dniem 9 a 29, najczęściej w dniach 13 do 17. Nikt nie dożywa dnia 45. Jedyny bot, który gra 45 dni dobrze, to bot starego silnika 0.3 (ludność z 103 do 222, zgony 0), a to inny, liczbowy silnik. Silnika decyzji nie ma. Trzeba go zbudować, nie wyciągnąć z botów.
3. Dwie i więcej symulacji w jednym procesie działa dziś. Trzy gry przeplatane krok po kroku (także w proporcji 7:1:3) dają te same skróty co każda osobno. Koszt jednej: około 10 MB i 7 do 13 µs na krok. Po scaleniu pracy ludzi krok jest około 2 razy droższy (1,8 do 2,6 razy w dwóch pomiarach).
4. Zarząd (`src/gov`) liczy się dla dowolnej liczby osad bez okien: to czysty JSON, który dostaje `GovInput` i oddaje `GovEffects`. Założenie „jedna osada gracza” siedzi w `src/main.ts` (singletony `sim`, `gov`, `loaded`…) i w stanie miasta (`GovState.miasto`), a nie w `src/gov`.
5. Kwadrat obok domu ma dziś teren, budynki z wejściami, drzewa, wraki i miejsca, ale nie ma siedziby, wnętrza, siatki ani mieszkań, a `createSim` na nim pada. Pełny świat z siedzibą da się jednak zbudować dla każdego sąsiada z istniejących danych dem bez zmian w `src/` (20 z 20 kwadratów trzech dem, 22 do 141 ms), tylko jako osobną mapę z własnym obrotem. Odkrywania i chodzenia po kwadratach nie ma: z planu etapu 2 (10 zadań) zrobione jest jedno, a etap 3 nie ma planu.
6. Zapis to jeden obiekt w localStorage (dziś 0,1 do 0,5 MB), kodu IndexedDB nie ma, a błąd zapisu jest cichy. Stan jednej osady-bota to około 40 KB na starcie i 100 do 380 KB JSON po 45 dniach (gzip do 46 KB).
7. Serwer gry nie liczy żadnej symulacji (konta, zajęte klatki, zapis w chmurze), a obraz kontenera nie zawiera `src/sim`. Z etapu 0 gry sieciowej jest bramka determinizmu (dziś kod wyjścia 1), pomiar pojemności, restart i kopie bazy. Brakuje światów na serwerze i silnika „rozporządzeń” dla nieobecnego gracza, czyli tego samego, czego brakuje wariantowi B.
8. W dokumentach nie ma projektu obcych osad. Jest szkic „obca ekipa” (klan w budynku obok, prowadzony przez bota tą samą drogą poleceń co gracz) i zasada z kierunku rozwoju: każda mechanika sieciowa ma najpierw wersję z NPC.
9. Ocena pracy w zadaniach planu (styl `docs/superpowers/plans/`, największe plany w repo mają 16 do 17 zadań): A 6 do 8, B 14 do 24 (typowo 19), C 21 do 32 (typowo 26; wycinek bez zdalnego podglądu około 15). A jest najtańszy, ale reguły wzrostu trzeba zaprojektować, bo boty nie dają krzywych po dniu 16.

---

## 1. Boty

### Co istnieje

| plik | linie | co robi | zależności od Node |
|---|---|---|---|
| `tests/unit/gov-play.ts` | 595 | `playWithGov` (`:278`): pętla gry, zarząd co sekundę przy ekranie, `answer()` (`:193`) odpowiada na okna według polityki `zawsze-warta` albo `nigdy-warty`, samouczek, ścinanie drzew na opał, opcjonalnie dyżur przy kozie; `playLaws` (`:515`) | brak; `tally` na poziomie modułu (`:183`) |
| `tests/unit/m2-play.ts` | 320 | `m2Player` (`:73`): kolejka budowy, naprawy, przeszukiwanie, rozbiórka, zajęcie mieszkań, z opcją `badania` polityka badań | brak |
| `tests/unit/sasiedzi-play.ts` | 244 | `sasiedziPlayer` (`:46`): drzwi sąsiadów (otwórz albo wyważ), przeszukiwanie pomieszczeń i pięter, wybory w spotkaniach | brak |
| `tests/unit/miasto-play.ts` | 156 | `miastoPlayer` (`:119`): wyprawy dzienne po braku jedzenia, drewna albo co trzeci dzień do szkoły | brak |
| `tools/bot.ts` | 843 | uprząż: 45 dni losowych ruchów, samouczek, noce z wartą i bez, noc przy kozie, uchwały o jedzeniu, fala 1 M2, flagi `--mieszkancy --sasiedzi --miasto --zwyciestwo --badania` | `node:fs`, `node:path`, `process.argv`, `process.exit` |
| `tools/bot-zombie.ts` | 390 | polityka trybu zombie wbudowana w skrypt (nie moduł) | `node:fs`, `node:path`, `process` |
| `tools/bot-badania.ts` | 347 | pomiar tempa badań z polityką i bez | `node:fs`, `node:path` |
| `tools/bot-surowce.ts` | 204 | raport: wraki i warsztat (deski z drewna, części ze złomu) | `node:fs`, `node:path` |
| `tools/bot-praca.ts` | 400 | „zarząd bez gracza”: co robi sam automat pracy ludzi | `node:fs` |
| `tools/bot-v03.ts` + `tools/v03.ts` | 234 + 52 | bot starego silnika 0.3 (kolejka budowy, obsada, badania, uchwały, wyprawy, przyłączanie sąsiadów) | `node:vm`, `node:fs` |
| `tools/bot-mieszkancy.ts` | 160 | wspólne flagi i świat z mieszkańcami z generatora (tabele z dysku) | `node:fs`, `node:path`, `process` |
| `tools/bot-zombie-siatka.ts` | 138 | równoległe procesy bota zombie | `node:child_process` |
| `tests/unit/gov-atrapa.ts` + `tools/trzy-noce.ts` | 379 + 72 | zarząd na atrapie symulacji (kilka liczb na godzinę) z politykami `zawsze-warta`, `nigdy-warty`, `losowo` | brak |
| `tools/determinizm/przebieg.ts` | 198 | czysty scenariusz (świat, `Sim`, zarząd, polityka `zawsze-warta`) bez `node:`, DOM i zegara | brak |

Sztuczne światy z wnętrzem (`tests/unit/interior-mock.ts`, 395 linii) bot `tools/bot.ts` bierze tylko wtedy, gdy świat dema nie ma prawdziwego wnętrza siedziby; dziś go ma, więc atrapa nie jest potrzebna. Moduły polityk i atrapy importuje 60 z 244 plików testów, więc są pod stałą kontrolą `npm test`.

### Jakie decyzje podejmują

- Karta nocy (`answer()`, `gov-play.ts:193`): chorych (zdrowie poniżej 40) nie wystawia na wartę; przy `zawsze-warta`, gdy nikt nie stoi na warcie, stawia najbardziej wypoczętego zdrowego; propozycje zarządu (sen, wyprawa blisko) zostają. Dyżur przy kozie tylko z opcją `koza` (polecenie `guard` z posterunkiem `koza`).
- Uchwały: `u_warty`, w polityce `nigdy-warty` `u_meble` albo `u_kociol`, w razie braku pierwsza dostępna. Wydarzenia: zawsze pierwszy wybór oznaczony `ok`. Raport: przeczytany. Epilog zwycięstwa: „Graj dalej”.
- Kolejka budowy (`m2-play.ts:60`): warsztat, zasieki, łóżka piętrowe, ogródek, magazyn, kuchnia społeczna; z `badania` na początku pracownia, a na końcu budowle z technologii (koza z beczki, pieczarkarnia, kocioł, szklarnia, wieża, barykada). Miejsce: pierwsze, które przepuszcza `canPlace`.
- Przeszukiwanie, rozbiórka śmieci i zepsutych mebli (całych tylko gdy brakuje materiałów), naprawy w zajętych mieszkaniach, zajęcie przeszukanych pustych mieszkań (`m2Player`).
- Drewno: gdy zapasu jest mniej niż 6, polecenie ścięcia najbliższego drzewa (`gov-play.ts`); w `bot-zombie.ts` tylko przy czystej bramie. Po scaleniu pracy ludzi robi to też sam automat (Drwal, próg 30).
- Badania: najtańsza kartka „do wzięcia”, za dnia jedna wolna osoba z najlepszym tempem przy stole (`m2Player` z `badania`).
- Wyprawy dzienne (`miastoPlayer`): kategoria braku (jedzenie poniżej 2 porcji na osobę, drewno poniżej 4, co trzeci dzień szkoła), najbliższe niewyczerpane miejsce 192 do 2000 m, dwie najzdrowsze osoby, od dnia 2 między 7:00 a 17:00, jedna wyprawa naraz.
- Sąsiedzi (`sasiedziPlayer`): najbliższy budynek mieszkalny albo usługowy, drzwi, pomieszczenia, piętra, wybór w spotkaniu (obrona, ucieczka, rozmowa, przegonienie, odejście).
- Zombie (`bot-zombie.ts`): warta z dzidami (najwyżej dwie osoby, zdrowie co najmniej 45), łatanie i wzmacnianie siatki, robienie dzid, dźganie przez siatkę, palenie mebli, amputacja, dobijanie.
- Stary bot 0.3 (`bot-v03.ts`): jedyny, który ma listy ważności (kolejność badań, uchwał i obsady stanowisk) i prognozę zapasów (`forecast`) przy wyprawach.

Czego żaden bot nie robi: handlu z handlarzem, wspólnego płotu, bramy i alarmu, wyboru wydarzeń według skutków, prognozy jedzenia i opału na zimę, polityki przyjęć i werbunku (poza `bot-praca --werbunek`), ustawiania tabeli Pracy. Polityki z `tests/unit/` są dla trybu zwykłego: `m2Player` w trybie zombie kończy grę w 3 do 10 dni, bo nie zna szwendaczy.

### Jak grają

Przymorze, ziarna 11 do 15, polityka karty nocy `zawsze-warta`, `playWithGov`. „Koniec” to dzień odwołania zarządu (wkurzenie 100).

| konfiguracja | wynik |
|---|---|
| zwykły, `m2Player`, 30 dni, 67e9cf3 (5 ziaren) | koniec w dniach 13 do 16, ludność w chwili końca 21 do 42, zaufanie 57 do 70, zgony 0, jedzenie 0 od dnia około 10, głodny 75 do 86% czasu |
| to samo + sąsiedzi + miasto | koniec w dniach 14 do 16, ludność 13 do 25, zgony 0 do 1, głodny 55 do 78% czasu |
| to samo z wyłączonym przełącznikiem „za siatkę” (jak sekcja M2 w `bot.ts` po 66d774e) | koniec w dniach 15 do 17 |
| to samo z opcją `obcy` (handlarz, wędrowcy, ekipy; gra ją włącza, boty nie) | koniec w dniach 14 do 16 |
| to samo na 5ede74b (przed pracą ludzi) | koniec w dniach 15 do 17; z sąsiadami i miastem 16 do 19 |
| oficjalny `node tools/bot.ts --zwyciestwo`, 30 dni | ludzie średnio 23,8 (16 do 42) przy celu 500, zwycięstw 0, rano brakło jedzenia w 113 z 150 poranków, głodny 81% czasu (5ede74b: 28,0, 111 z 150, 81%) |
| zombie, `bot-zombie.ts`, ziarno 1, 30 nocy | koniec w dniach 13 (warta z dzidami) i 16 (bez warty); ziarna 1 do 3 na 5ede74b: dni 9 do 16, raz pustka |
| atrapa zarządu (liczby), 45 dni, 3 polityki × 3 ziarna | odwołanie w dniach 12 do 16 |
| jedzenie z niczego + badania + sąsiedzi (jak flagi pomiaru badań), Przymorze z generatorem mieszkańców i bez, Lanciego, Zielonki | koniec w dniach 16 do 28 (67e9cf3, 9 gier) i 15 do 29 (5ede74b, 9 gier) |
| próby polityk (20 gier, niżej) | koniec w dniach 14 do 18 |
| bot starego silnika 0.3, 45 dni | ludność z 103 do 222, zgony 0, zaufanie 100, wkurzenie 1, jedzenie 582, 20 technologii, 7 uchwał; 1,8 s razem z ładowaniem |

Odpowiedź na „ludność po 45 dniach”: w nowym silniku takiej liczby nie ma, bo gra kończy się wcześniej (w chwili końca ludność wynosi 13 do 49 osób). W starym silniku 0.3 to 222.

Co ustaliłem o przyczynie (67e9cf3, 5 ziaren, 15 dni, `wkurzenie-zrodla.ts` i `poranki.ts`): poranny krok zarządu o 6:00 dał w sumie +407 punktów wkurzenia (71 poranków, średnio +5,7 na poranek), a wszystkie źródła razem netto +400. To dzienny dryf `dailyDrift` (`src/gov/uchwaly.ts:78`): +6 razy udział zmarzniętych (ciepło poniżej 40), +2 razy udział głodnych (najedzenie poniżej 25), minus udział najedzonych. Okna wydarzeń dają prawie nic (obserwacja +36, uchwały +10, kradzież −24, kłótnia −9). Rano od dnia 9 zmarznięte jest 86 do 100% zarządu, głodnych 60 do 100%. Kuchnia ma 21°C w dniu 2 i 0 do 8°C w dniach 12 do 15, choć drewna w zapasie jest 22 do 78 sztuk (po pracy ludzi; przed nią 7 do 10). Jedzenie w zapasie spada do zera około dnia 11.

Dwie próby prostych reguł (`polityka-v0.ts`, 5 ziaren, 20 gier): dyżur przy kozie co noc (opcja `warta:koza` z karty, gdy drewna starcza) plus uchwały `u_zebrania` i `u_kociol` dały koniec w dniach 15 do 16 (baza 14 do 15); z dodatkiem jedzenia z niczego 15 do 18; samo jedzenie z niczego 14 do 17. Pojedyncze reguły dokładają więc dzień lub dwa. Nie ustaliłem, dlaczego zimno rano zostaje mimo zapasu drewna i dyżuru przy kozie, ani dlaczego rano większość zarządu ma najedzenie poniżej 25 mimo jedzenia z niczego (posiłki są o 13 i 19). To pierwsze miejsca do zbadania przy budowie silnika.

### Czy da się je puścić w przeglądarce

Tak, moduły polityk. Sprawdziłem na trzy sposoby.
- Statycznie: `tests/unit/{gov-play,m2-play,sasiedzi-play,miasto-play}.ts` i `tools/determinizm/przebieg.ts` importują wyłącznie `src/` i siebie nawzajem. W żadnym nie ma `node:`, `process`, `fs`, `vitest` ani zegara.
- Bundlem: rolldown składa te pięć plików do paczki dla przeglądarki (1,0 MB nieminifikowana, razem z całą symulacją i zarządem) bez ostrzeżeń i bez jednego importu `node:`.
- Uruchomieniem: ta sama paczka w headless Chromium 156 (strona z `setContent`, bez Node), `playWithGov` + `m2Player`, 10 dni, ziarno 11: skrót stanu `fe2553ba`, zaufanie 62,16, wkurzenie 61,05, 27 pionków. Identyczne jak w Node 25.2.1. Kroków na sekundę w Chromium nie porównuję z Node, bo maszyna była mocno obciążona. Na 5ede74b to samo dało skrót `4fb6b134` w obu środowiskach.

Do Node są przywiązane tylko skrypty: `tools/bot*.ts` (`fs`, `path`, `process.argv`, `process.exit`, wypisywanie), `tools/v03.ts` (`node:vm`) i `tools/bot-mieszkancy.ts` (tabele mieszkańców z dysku; gra czyta je przez `fetch`, a `wczytajDaneMieszkancow` przyjmuje funkcję pobierającą). Do użycia w grze trzeba przepisać pętlę `playWithGov` na obiekt z metodą `krok()` (jak `Gra` w `gra-krokowa.ts`), bo dziś jest to jedna synchroniczna funkcja do końca gry, a `answer()` jest prywatne. `gov-play.ts` ma stan na poziomie modułu (`tally`, `:183`), który przy dwóch grach naraz trzeba wynieść do obiektu gry.

## 2. Dwie symulacje naraz

### Stan na poziomie modułu

W `src/sim`, `src/gov`, `src/world`, `src/core` nie ma `static`, `globalThis`, `window`, zegara ani `Math.random`. Wspólne są tylko te pamięci:

| gdzie | co | klucz | skutek dla dwóch gier |
|---|---|---|---|
| `src/sim/path.ts:136` | `finders`, `PathFinder` po rozmiarze mapy | rozmiar | używa go `findPath` tylko przy budowie świata (`src/world/heaps.ts:85`); `Sim` ma własny `PathFinder` (`sim.ts:2573`) |
| `src/sim/sasiedzi.ts:230,231,324,420,516,1180` | wnętrza i drzwi budynków, pamięci obliczeń | obiekt `World` (WeakMap) | czysta funkcja świata, bezpieczne |
| `src/sim/gov.ts:153` | strony świata dla kart | obiekt `World` (WeakMap) | j.w. |
| `src/gov/miejsce.ts:49` | opis miejsca siedziby | obiekt `World` (WeakMap) | j.w. |
| `src/mieszkancy/*` | pamięci wag i tabel | stałe tabele, napisy | czyste funkcje stałych danych |
| `src/sim/wedrowcy.ts:209` | słownik tłumaczeń wieści | brak | czysty |
| `src/core/jezyk.ts:46` | bieżący język | brak | symulacja go nie czyta; zarząd trzyma teksty w obu językach (`Tx`) |
| `tests/unit/gov-play.ts:183` | `tally` przyjęć | brak | tylko bot, synchroniczny |

Jedyny wspólny stan, który się zmienia, to sam obiekt `World`: `ustawSiatke` (`sim.ts:1194`, wołana w konstruktorze `Sim` na `:2550` i przy wspólnym płocie) zmienia `w.blocked`, `w.fence` i `w.fenceBaza`. Dwie gry na jednym `World` zepsułyby się, gdyby któraś budowała wspólny płot (z lektury kodu, nie wykonane). Każda gra powinna mieć własny `World`.

### Próba izolacji (`dwie-sim.ts`, na 5ede74b i 67e9cf3, wyniki te same)

Trzy gry: Przymorze/ziarno 11, Lanciego/12, Zielonki/13, każda ze swoim `World`, `Sim`, zarządem i botem `m2Player`, 3 dni = 57 600 kroków na grę. Skróty stanu symulacji i zarządu po 57 600 krokach:
- solo i przeplatane po jednym kroku (A, B, C na zmianę): wszystkie trzy zgodne;
- przeplatane nierówno (7 kroków B i 3 kroki C na 1 krok A): zgodne;
- bliźniak A na osobnym `World` (to samo ziarno i dane): zgodny z solo i z A;
- dwie gry (ziarna gry 11 i 21) na tym samym obiekcie `World`: obie zgodne z solo, `World` bez zmian (bez wspólnego płotu).

### Pamięć

Na grę (świat 384×384, stan, `Sim`, zarząd): 10,0 MB na starcie i 11,0 MB po 10 dniach (4 gry, 67e9cf3); 9,9 i 10,1 MB na 5ede74b. Raport MMO podaje 8,6 do 9,5 MB. Specyfikacja miasta liczy aktywny kwadrat na około 1 MB świata i 4,5 MB tablic symulacji, do tego 3,7 MB sceny, gdy jest rysowany.

### Koszt kroku (kroki na sekundę, z czasów botów)

| pomiar | wynik |
|---|---|
| `tools/bot.ts`, 45 dni losowych ruchów, bez zarządu | 5ede74b: 46 do 118 ms na dobę gry, średnio 65 ms (około 295 tys. kroków/s); 67e9cf3: średnio 157 ms (122 tys.) |
| ten sam przebieg, 20 dni, naprzemiennie na tej samej, mocno obciążonej maszynie (`krok-ruch.ts`) | 5ede74b: 222 ms na dobę; 67e9cf3: 499 do 581 ms. Po scaleniu pracy ludzi krok kosztuje 2,2 do 2,6 razy więcej |
| `playWithGov` + `m2Player`, 5 ziaren do dnia 45 | 5ede74b: 29 do 142 tys. kroków/s; 67e9cf3: 16 do 61 tys. (maszyna obciążona) |
| średni krok po 10 dniach, 20 000 kroków z zarządem co 20. (`pamiec-sim.ts`, `rollout.ts`) | 7,1 µs (5ede74b), 12,8 µs (67e9cf3) |
| pojemność z raportu MMO (24 h gry, bez tłumu) | 1,4 do 5,3 µs średnio; z tłumem 150 pionków 13 do 74 µs |
| odczyt zarządu | `snapshot` 0,012 do 0,017 ms, `govInput` 0,017 do 0,023 ms, `govUpdate` z klonem stanu 0,17 do 0,18 ms |

Potrzeba na żywo: 20 kroków na sekundę przy 1×, 160 przy 8×. Jedna osada-bot przy 8× to 160 × 12,8 µs ≈ 2 ms na sekundę, czyli 0,2% rdzenia. Kilka osad naraz nie jest problemem procesora, o ile ludność nie urośnie (z tłumem 150 krok kosztuje 13 do 74 µs).

Doganianie (odkrycie osady po 45 dniach gry gracza) to 864 000 kroków: w moich przebiegach 7 do 11 s przed pracą ludzi (jeden przebieg 29 s pod obciążeniem) i 16 do 38 s po niej; bez obciążenia raczej 11 s przy 12,8 µs. Tego nie robi się w jednej klatce: potrzebny worker albo budżet kroków na klatkę.

### Rozmiar SimState i GovState w JSON

Przymorze, `playWithGov` + `m2Player`, ziarna 11 do 15 (`stan-rozmiar.ts`). „Bez oszustwa” kończy się odwołaniem w dniach 13 do 17, a symulacja chodzi dalej bez zarządu. „Żywy” to ta sama gra z jedzeniem z niczego, badaniami i sąsiadami, jedyny sposób, żeby stan rósł jak w rozwiniętej osadzie.

| gra | dzień | SimState KB (gzip) | GovState KB (gzip) |
|---|---|---|---|
| bez oszustwa, 67e9cf3, 5 ziaren | 1 | 26 do 30 (4 do 5) | 8 do 9 (3) |
| | 10 | 32 do 37 (5 do 6) | 42 do 46 (8) |
| | 45 | 44 do 54 (7 do 8) | 50 do 59 (9 do 10) |
| bez oszustwa, 5ede74b | 1 / 10 / 45 | 25 do 29 / 28 do 36 / 40 do 51 | 8 do 9 / 43 do 44 / 54 do 58 |
| z mieszkańcami z generatora, 5ede74b, 3 ziarna | 1 / 10 / 45 | 32 do 35 / 34 do 37 / 42 do 47 | jak wyżej |
| żywy, 67e9cf3, Przymorze, 3 ziarna | 1 | 33 do 34 (6) | 8 (3) |
| | 10 | 91 do 94 (14 do 15) | 44 do 48 (9 do 10) |
| | 25 | 150 do 176 (23 do 25) | 58 do 88 (8 do 13) |
| | 45 | 172 do 217 (24 do 29) | 58 do 88 (8 do 13) |
| żywy, 67e9cf3, z mieszkańcami z generatora, 3 ziarna | 45 | 174 do 196 (24 do 28) | 57 do 58 (10) |
| żywy, 67e9cf3, Lanciego / Zielonki | 45 | 291 (33) / 125 (21) | 59 (10) / 59 (10) |

Stan zarządu rośnie do około 60 KB i tam się zatrzymuje (kronika ma limit 300 wpisów), z jednym wyjątkiem (88 KB). Stan symulacji rośnie z rzeczami, pionkami i zapisem zmarłych. Jedna osada-bot to więc około 35 do 50 KB na starcie i 100 do 380 KB (gzip do 46 KB) po 45 dniach. Raport MMO mierzył pierwsze 24 godziny (7 do 29 KB) i słusznie zastrzegał, że późniejsza gra będzie większa.

### Próbne przebiegi (planowanie przez symulację)

`rollout.ts` na grze po 10 dniach: `structuredClone(SimState)` 0,13 do 0,15 ms, `structuredClone(GovState)` 0,16 do 0,20 ms, nowy `Sim` ze sklonowanego stanu 5,5 do 7,8 ms, próbny przebieg 8 godzin gry (6 400 kroków, z zarządem) 87 do 111 ms, doba 131 do 241 ms. Ocena kilkunastu wariantów karty nocy to więc około sekundy na dobę gry, na osadę. Uwaga: klon niesie ziarno losowania, więc próbny przebieg „zna przyszłość”; trzeba mu przestawić ziarno, żeby nie oszukiwał.

## 3. Zarząd dla drugiej osady

Da się, bez okien interfejsu, tak jak w botach. Sprawdzone przez trzy zarządy w jednym procesie ze zgodnością skrótów (wyżej).

- API: `newGov(seed, mode)` (`src/gov/zarzad.ts:42`), `govInput(st, w, screen)` (`src/sim/gov.ts:235`), `govUpdate(gov, i)` (`zarzad.ts:79`), `pending(gov, i)` (`:187`), odpowiedzi `setNight`/`confirmNight`/`signLaw`/`chooseEvent`/`ackReport`, skutki do symulacji przez `applyGov` (`src/sim/gov.ts:459`). `src/gov` nie importuje `src/sim`. Stan zarządu to zwykły JSON z własnym ziarnem.
- Prompty: pięć rodzajów (`zwyciestwo`, `raport`, `uchwala`, `karta`, `wydarzenie`). Nieodpowiedziane wydarzenie blokuje następne (`wydarzenia.ts:535`, bez limitu czasu); karta nocy zatwierdza się sama po `CARD_DEADLINE`; czekający raport też wstrzymuje wydarzenia. Osada bez polityki się nie psuje, ale nie ma wydarzeń. `bot-zombie.ts` ma wyczerpujące sprawdzenie typu (`never`), więc nowy rodzaj okna wymusza poprawkę we wszystkich botach.
- Koszt: `govInput` 0,02 ms, `govUpdate` poniżej 0,2 ms, raz na 20 kroków (1×).

Co zakłada jedną osadę gracza:
1. `src/main.ts` (3 680 linii): singletony `sim`, `gov`, `loaded`, `seed`, `hqName`, `okolica`, `ludnosc2021`, `words`, `screen` (linie 288 do 305 i 386 do 394); `input()` składa `GovInput` z jednej symulacji, `save()` zapisuje jedną grę i nie zapisuje, gdy `gov.over`. To sterownik interfejsu, nie zarząd.
2. Stan miasta: `GovState.miasto` (`typy.ts:599`) trzyma, co zabrano z miejsc, osobno dla każdego zarządu. Dwie osady odwiedzające ten sam sklep widziałyby pełny zapas (projekt mapy miasta i szkic „obca ekipa” zakładają stan wspólny: w grze sieciowej „serwer trzyma, co zabrano w mieście”).
3. `GovInput.okolica` i `ludnosc2021` dokłada gospodarz; odległości miejsc liczą się od środka geo, więc drugiej osadzie trzeba policzyć własną okolicę.
4. Drogi do zwycięstwa (`wlaczZwyciestwo`) są opt-in; dla osady-bota zostawić wyłączone.
5. Tempo wydarzeń liczy się w sekundach przy ekranie (`i.screen`, `typy.ts:167`, `wydarzenia.ts:524` i dalej). Dla osady poza ekranem sensowne jest `tick / 20`, jak w botach. Projekt MMO chce zarządu w czasie gry i to jest ten sam wymóg.
6. `GovState.over` (pustka, odwołanie, exodus) kończy grę gracza; dla osady-bota trzeba zdecydować, co znaczy upadek (ruina, nowy zarząd, osada znika).
7. Wiele pól `GovInput` jest opcjonalnych i ma sens tylko dla domu (`badania`, `teren`, `strony`, `lokatorzy`); bez nich zarząd zakłada prostszą grę.

## 4. Kwadraty miasta

### Co jest dziś

- `?kwadraty=3x3|5x5|7x7` albo lista par `1,0;0,-1` (`src/world/kwadraty.ts:153`, najwyżej 48 kwadratów i 16 od domu) dokłada do widoku kwadraty obok domu, tylko do oglądania. `src/main.ts:917` (`dodajKwadraty`) buduje dla każdego świat `buildKwadrat` i scenę, `view.dodajKwadrat` (`view.ts:535`) rysuje; kwadrat bez danych to mgła z napisem „brak danych” (`mglaLayer.ts`, `dodajBrakDanych`). Dane sąsiadów są tylko w demach: `public/demo/<klucz>-kwadraty.json` (Przymorze 1 145 KB, 8 kwadratów; Zielonki 339 KB, 8; Lanciego 850 KB, 4 boczne). Dla prawdziwego adresu nic się nie pobiera, więc stoi tam mgła.
- Symulacja ich nie zna. Polecenie i kliknięcie poza domem gra ignoruje (`main.ts:2796`, `:3377`). Nagłówek `view.ts` (linia 19): „pionki, rzeczy, światła i budowa są tylko w domu”.
- Numery globalne: `src/sim/kafelki.ts` (145 linii: `gid`, `gxy`, `sasiadKafelka`, `bGlob`…) jest gotowy i nieużywany; importuje go tylko własny test. W `src/sim/sim.ts` (11 346 linii) słowo `size` występuje 582 razy.
- Nie ma stanu „odkryte kwadraty”, zwiadu, wyprawy na krawędź ani zapisu kwadratów. W `src/` słowo „zwiad” występuje tylko jako zawód.

### Czy kwadrat obok domu ma pełny `World`

Częściowo. `buildKwadrat` (`src/world/world.ts:775`; 12 do 31 ms po rozgrzaniu) buduje teren, budynki z wejściami (nie na brzegu), drzewa z ziarna kwadratu, wraki i miejsca. Zmierzone na ośmiu sąsiadach Przymorza (`kwadrat-swiat.ts`): 24 do 154 budynków (22 do 154 z wejściem, 16 do 96 mieszkalnych), 478 do 2 567 drzew, 85 do 237 miejsc, 13 do 23 wraków. Dom ma 64 budynki, 541 drzew, 190 miejsc.

Nie ma w nim siedziby (`hq = -1`), wnętrza (`interior.cell` i `room` mają długość 0), siatki z bramą (`pustaSiatka`), suchego drzewa, stert, mieszkań i uszkodzeń (`world.ts:115`, `:752`, `:765`). Wnętrza cudzych budynków powstają na żądanie w `sasiedzi.ts::wnetrze(w, bid)` i działają też dla budynków kwadratu (40 budynków w 28 do 37 ms, 31 mieszkalnych), ale to nie jest część `World`.

Dwie pułapki: `createSim` pada na takim świecie (`sim.ts:1389`, odczyt `.entrances` z `buildings[-1]`), a `houseOf(w)` zwraca pusty obiekt zamiast `null` (`house.ts:63`), więc kod sprawdzający `if (house)` uzna, że siedziba jest.

### Pełny świat z siedzibą dla sąsiada: próba bez zmian w `src/`

`swiat-sasiada.ts`: geo sąsiada przesunięte do środka kwadratu (`srodekKwadratu`) i zwykłe `buildWorld`. Wynik: 20 z 20 sąsiednich kwadratów trzech dem (Przymorze 8, Zielonki 8, Lanciego 4) daje świat z siedzibą, wnętrzem, siatką i mieszkaniami w 22 do 51 ms (z generatorem mieszkańców 43 do 141 ms), `createSim` działa, bot gra 5 do 10 dni bez błędu. Generator mieszkańców też działa (8 z 8 na Przymorzu).

Ograniczenia tej drogi:
- To osobna mapa, nie kwadrat sklejony z domem: `buildWorld` liczy własny kąt obrotu, w większości kwadratów różny od domowego, do 0,29 rad, czyli 17° (Przymorze (0,1): −0,006 wobec 0,285; Zielonki (1,1): 0,456 wobec 0,314; Lanciego (0,−1): 0,673 wobec 0,434). Szwu z domem i z innymi kwadratami nie ma. Wersja sklejona wymaga okna i kąta jako parametrów `buildWorld` (kroki 8 i 11 do 16 na oknie `buildKwadrat`).
- Siedziba to najbliższy środka budynek, bez progu wielkości: w Przymorzu blok o 149 do 1 416 kafelkach i 2 do 12 mieszkaniach, w Lanciego do 4 371 kafelków i 17 mieszkań, w Zielonkach domy o 69 do 248 kafelkach z jednym mieszkaniem, a w Zielonkach (0,1) siedziba ma 6 kafelków i 0 pokoi. Potrzebna reguła wyboru.
- Rozstrzygnięcie projektowe: „osobna mapa” (zgodne z niezależnymi światami drużyn w grze sieciowej, etapy 1 i 2) kontra „jedna `Sim` z wieloma kwadratami” (plan miasta, etap 2).

### Co jest w planach etapów 2 i 3 i co zbudowane

| etap | plan | stan |
|---|---|---|
| 1 kwadraty na mapie | 8 zadań | zrobione i scalone (świat, geo, szwy, rysowanie, mgła, `?kwadraty=`, 25 zrzutów `kwadraty-*`) |
| 2 chodzenie | 10 zadań (`2026-10-19-miasto-etap-2-chodzenie.md`) | zrobione zadanie 1 (`kafelki.ts`, niewołany). Zadania 2 do 10 (syntetyczne światy, numery globalne w `sim.ts`, środowisko kwadratu, dostawca światów, granice, praca w innym kwadracie, aktywne i uśpione, zombie i obcy, bot) czekały na scalenie badań i pracy ludzi; oba weszły, więc mogą ruszać |
| 2b chodzenie na ekranie | brak planu | nie zaczęte (warstwy ruchu, rzeczy, światła, przekroje w układzie globalnym) |
| 3 zwiad i odkrywanie | brak planu | nie zaczęte (wyprawa zwiadu 24 h, pobieranie geo, polecenie dodania kwadratu, IndexedDB, kronika, bot, który odkrywa) |
| 4 teren przez kwadraty, 5 skala | brak planów | nie zaczęte |

Spec wymienia jako nie-cel „życie uśpionych kwadratów”: uśpiony kwadrat stoi, nic tam nie przybywa. Osada, która rozwija się na nieodkrytym kwadracie, jest więc wyjątkiem od tej zasady i wymaga leniwego doganiania (wariant B) albo liczenia na liczbach (wariant A).

## 5. Zapis

- `src/ui/zapis.ts`: jeden obiekt `Save` pod kluczem `za-murem-0.4-zapis` w localStorage (`writeSave :76`, `readSave :88`, `SAVE_VERSION = 1`, `sim.v === 3`, `gov.v === 1`). Zawiera `data: Loaded` (geo domu: 52 do 214 KB w demach, 40 do 189 KB w prawdziwych adresach według specyfikacji miasta), `sim`, `gov`, kamerę, odcisk świata `worldKey` i pola sieci. Dziś całość to około 0,1 do 0,5 MB.
- Zapis co godzinę gry (`main.ts:1803`) oraz przy `pagehide` i `visibilitychange` (`:1287`). Każdy zapis to `JSON.stringify` całego obiektu na głównym wątku.
- Limity: localStorage około 5 MB; zapis w chmurze 3 MiB (`ZM_LIMIT_ZAPISU`, `server/main.ts:43`). `writeSave` zwraca `false` przy błędzie, ale `save()` (`main.ts:1267`) jest wołane bez sprawdzania wyniku, więc przekroczenie limitu kończy się jedynie `console.warn`. Gdy `gov.over`, gra w ogóle nie zapisuje.
- IndexedDB: nie ma ani linii kodu (`indexedDB` i `CompressionStream` nie występują w `src/`, `server/`, `tools/`; `DecompressionStream` jest w `mvt.ts` dla kafelków).
- Plan dla kwadratów (`2026-10-19-miasto-z-kwadratow-design.md`, „Zapis”): gra bez odkrytych kwadratów zostaje w localStorage; od pierwszego odkrycia cały `Save` razem z geo kwadratów idzie do IndexedDB, skompresowany (`CompressionStream('gzip')`), a localStorage trzyma tylko znacznik; start czyta asynchronicznie; bez IndexedDB gra działa jak dziś, ale zwiad mówi, że zapis odkrytego miasta jest niedostępny; każdy kwadrat ma odcisk świata i numer wersji generatora; zapis w chmurze niesie geo skompresowane, limit serwera trzeba podnieść. To etap 3 miasta, bez planu zadań.
- Co dokłada osada: stan jednej osady-bota to 35 do 380 KB JSON, a geo ośmiu sąsiednich kwadratów to 0,3 do 1,1 MB w demach (prawdziwe adresy: 40 do 189 KB na kwadrat). Kilka osad plus geo wchodzi w pasmo 1,5 do 3 MB, czyli blisko limitu, a przekroczenie jest ciche. Dla wariantu A (liczby) to setki bajtów na osadę.

## 6. Gra sieciowa

### Co mówi projekt (`2026-10-19-mmo-design.md`)

- Serwer liczy świat drużyny (ten sam kod w Node) w stałym rytmie, klienci liczą krok w krok przez SSE i `POST`, skróty co kilka sekund, doczytanie stanu po rozjeździe. Rekomendowana prędkość: 5 kroków na sekundę (doba w około 64 minuty).
- Leniwe liczenie światów nieobecnych drużyn: świat drużyny bez gracza można zdjąć z pamięci i doliczyć przy powrocie, wynik jest bit w bit taki jak na żywo. Zamarzanie po 7 dniach to decyzja Mateusza.
- Pod nieobecność gracza drużyna „działa według rozporządzeń” (warta, koza, racje), a karta nocy i wydarzenia idą po czasie według nich. Projekt mówi wprost, że rozporządzenia to osobny projekt, którego jeszcze nie ma. Etap 1 wymaga go, decyzji o prędkości i zielonej bramki determinizmu.
- Etapy: 0 fundament (zrobiony), 1 świat drużyny na serwerze, 2 dyplomacja (pseudonimy, propozycje: sojusz, nieagresja, handel jako wyprawa z czasem dojścia, wojna), 3 wspólne kwadraty z kilkoma drużynami.

### Czy świat drużyny na serwerze mógłby prowadzić bot zamiast gracza

Technicznie tak. Bot z rozporządzeniami po czasie to dokładnie ten mechanizm, którego projekt wymaga dla gracza, który śpi. Zalążek istnieje: `tools/determinizm/przebieg.ts` (198 linii, czysty moduł) liczy świat, `Sim`, zarząd i politykę bez Node, a `tools/pojemnosc.ts` (357 linii) zmierzył taki świat: 8,6 do 9,5 MB, 1 do 5 µs na krok, doliczanie 8 godzin nieobecności w 0,2 do 0,8 s przy 5 krokach na sekundę, 10 światów to około 90 MB i poniżej 0,4% rdzenia. Moje pomiary potwierdzają to co do rzędu (10 MB i 7 do 13 µs na krok), z zastrzeżeniem, że to pierwsze dni gry.

### Co z etapu 0 już jest (`mmo-fundament`, scalone)

- `npm run determinizm` (`tools/determinizm.ts` + `tools/determinizm/`, około 2 550 linii, 14 plików testów): ten sam przebieg w Node 25, Node 24, Chromium i systemowym jsc. Skróty stanu zgodne we wszystkich silnikach przez 720 godzin gry, ale bramka daje kod 1: w Chromium świat Lanciego ma zamienione numery dwóch garaży (jedno `Math.cos` kąta obrotu, `rotate.ts:117`, i sortowanie po polu obrysu, `world.ts:221`). Firefoksa i WebKita nie sprawdzano.
- Lista poprawek determinizmu nie jest wprowadzona: `src/core/mat.ts` nie istnieje, `Math.hypot` jest nadal w 44 miejscach `src/sim`, 2 w `src/gov` i 18 w `src/world`. Skróty botów reagują tylko na `hypot`, a zamiana na `sqrt(dx² + dy²)` ich nie zmienia.
- Serwer: `restart.ts` (restart co 48 h) i `kopie.ts` (kopie bazy), pomiar pojemności.
- Serwer nie liczy symulacji: `server/` to 1 636 linii (konta, sesje, zajęte klatki, zapis w chmurze), a `server/Dockerfile` kopiuje tylko `server/*.ts` i `src/net/protokol.ts`, czyli kod symulacji nie trafia do obrazu. Inne drużyny istnieją w grze wyłącznie jako zajęte klatki.

Czego brakuje do świata drużyny prowadzonego przez bota: proces i kontener świata, magazyn stanu w bazie z zapisem co 5 minut i doganianiem po restarcie, harmonogram (tykanie i leniwe doliczanie), źródło geo po stronie serwera, API i protokół, podgląd zdalnego świata w kliencie, silnik decyzji, i decyzje Mateusza (prędkość świata, zamarzanie, osobna maszyna, kopia poza maszyną, informacja o danych osobowych). Świat zbudowany przez klienta może się różnić od świata serwera (przypadek Lanciego w Chromium), więc albo poprawki z listy, albo wysyłanie tablic świata (40 do 50 KB gzip).

## 7. Dokumenty o obcych osadach, rywalach, handlu

- `docs/GDD.md`: nic o rywalach. „Osada sąsiedzka” to 8 do 12 najbliższych domów przyłączanych przez gracza. Dwie warstwy ludzi: rdzeń pod pełnym sterowaniem i lokatorzy liczeni zbiorczo.
- `2026-10-18-kierunek-rozwoju-design.md`, „Rosnąca osada i silnik w tle”: silnik w tle to deterministyczny zarządca (przydział pracy według priorytetów i rozporządzeń, pilnowanie potrzeb) z losowością z ziarna; „model językowy może wejść najwyżej przy pisaniu dekalogu”. „Partyzantka”: mała drużyna sieje zamęt w dużej osadzie, najpierw jako NPC. Zasada: „każda mechanika sieciowa ma najpierw wersję z NPC, żeby gra jednoosobowa była pełna, a boty mogły ją sprawdzić”. Mapa miasta jest najpierw funkcją gry jednoosobowej: „osady NPC, hordy, karawany i cele wypraw”.
- `2026-10-18-mapa-miasta-design.md`, „Następny projekt: obca ekipa (szkic)”: na mapie lokalnej mieszka inny klan, oznaczony na minimapie, z oporem przy próbie wejścia; gra według tych samych zasad co gracz i na razie prowadzi go bot, żeby „przetestować mechanikę, że jest ktoś niezależny na mapie”; zajmuje klatkę w sąsiednim budynku, ma pionki, magazyn, wyprawy do tych samych miejsc w mieście, może handlować albo napaść; bot wydaje polecenia tą samą drogą co gracz, więc kiedyś usiądzie na jego miejscu człowiek. Ludzie klanu stoją na tych samych rodzajach pionków co obcy z `src/sim/wedrowcy.ts` i `handlarz.ts`. Decyzja 1 specyfikacji: zaraz po mapie miasta obca ekipa. Projektu nie ma; w „Zaparkowanych” dziennika jest wpis „obca ekipa w mieście (następny projekt)”.
- `2026-10-19-warunki-zwyciestwa-design.md`: warunek terytorialny wymaga braku „wrogiej grupy w środku” (rabusie, obca ekipa, cudza klatka); „Na później: dyplomatyczna Federacja osiedli”: pakty z kilkoma sąsiednimi osiedlami, „gracze albo ekipy prowadzone przez bota”, razem z dyplomacją gry sieciowej; cud w grze sieciowej jest jeden na miasto.
- `2026-10-19-mmo-design.md`: dyplomacja jako etap 2 (propozycje, handel jako wyprawa, pseudonimy drużyn w odkrytych kwadratach); „rozporządzenia” jako brakujący projekt.
- `2026-10-18-multiplayer-design.md`: inne drużyny istnieją w grze tylko jako zajęte klatki; walki i handlu między drużynami nie ma (nie-cel).
- `2026-10-19-miasto-z-kwadratow-design.md`: „życie uśpionych kwadratów” jako nie-cel; fala 2 działa na każdym budynku, więc w nowych kwadratach też; szwendacze w nowym kwadracie przybywają z odległością od domu.
- `2026-10-18-wedrowcy-design.md`, `2026-10-18-handlarz-design.md`: istniejące postacie obce (handlarz pod bramą, wędrowcy, ekipy szabrujące wraki) jako pionki w jednej symulacji; handel to dziś wyłącznie handlarz-NPC i żaden bot go nie używa.
- `docs/POSTEP.md`, „Zaparkowane”: „obca ekipa w mieście (następny projekt)”, „Własny serwer… z czasem multiplayer asynchroniczny (sąsiednie osiedla innych graczy)”.

Nic w dokumentach nie opisuje osady-bota rosnącej na nieodkrytym kwadracie ani handlu między osadami poza handlarzem-NPC i „handlem jako wyprawą” w dyplomacji gry sieciowej.

---

## Ocena pracy: trzy warianty

Skala odniesienia: plany w repo mają 3 do 17 zadań (wydarzenia 17, mieszkańcy z adresu 16, badania 12, miasto etap 2 10, miasto etap 1 8, MMO etap 0 6). Zadanie to jednostka z plików, testów i bramki (skróty botów bez zmian, `npm test`, Biome, build, zrzuty).

### Wspólne wnioski

- Wszystko, co nowe, musi być opt-in (jak `SimOpts.obcy`, `wlaczMiasto`, `wlaczZwyciestwo`), żeby skróty botów i stare zapisy zostały.
- Silnika decyzji nie ma, a bot go nie zastępuje (rozdział 1). Praca ludzi automatyzuje u bezczynnego zarządu dziewięć rodzajów pracy (ogień, kuchnia, budowa planów, naprawy, drwal, noszenie, warsztat, szaber, badania), więc silnik ma do decydowania mniej. Zostają: karta nocy, uchwały, wydarzenia, plany budowli, wybór badania, wyprawy, sąsiedzi (drzwi, spotkania), przyjęcia i werbunek, wspólny płot.
- Uprząż do strojenia jest atutem: 45 dni gry bota trwa kilkanaście do kilkudziesięciu sekund na ziarno, jest deterministyczna, ma 60 plików testów wokół helperów i procesy równoległe (`bot-zombie-siatka.ts`).
- Dla prawdziwych adresów dane sąsiednich kwadratów nie są ładowane (tylko dema); trzeba loadera z etapu 3 miasta (części są: `kafelkiKwadratu`, `geoKwadratu`, `KafelkiMiasta`).

### Wariant A: osada jako liczby

Stan w `GovState` (opcjonalne pole `osady`, włączane jak `wlaczMiasto`), liczony leniwie raz na dobę gry z ziarna osady i czasu, bez `Sim`, świata i rysowania poza znacznikiem i kartą. Skróty botów się nie zmieniają. Atrapa zarządu (`gov-atrapa.ts`, 379 linii) pokazuje, że zarząd pracuje na samych liczbach.

Zadania (6 do 8):
1. Model osady i reguły wzrostu: czyste funkcje (`src/gov/osady.ts`): ludność, zapasy, budowle po rodzajach, techDone, nastawienie wobec gracza, stan (rośnie, trzyma się, upada); krok dobowy z własnego ziarna (zasady: ziarno zarządu, `Math.sqrt`, bez `hypot`); test, że doganianie równa się życiu na żywo.
2. Krzywe i parametry: tabela z przebiegów (nowy bot `--osady` drukuje po dniach ludność, zapasy, budowle, technologie na N ziarnach trzech dem) i z projektu. Tu jest największa niewiadoma, bo boty nie dają krzywych po dniu 16. Krzywe trzeba zaprojektować, a wzorzec mogą dać bot 0.3 (103 do 222 w 45 dni) i stałe z `sim.ts` (zużycie, plon ogródka).
3. Stan w zarządzie: `wlaczOsady(gov)`, krok w `govUpdate`, wpisy kroniki po polsku i angielsku, zapis bez podbijania wersji, zgodność starych zapisów.
4. Odkrywanie: wyzwalacz i lista odkrytych (do czasu zwiadu z etapu 3 miasta: wyprawa dzienna do miejsca w kwadracie albo wieść wędrowca); później podmieniany na zwiad.
5. Znacznik i karta osady: minimapa i mapa miasta (`src/ui/minimapa.ts`, `src/ui/miasto.ts`), karta z liczbami i nastawieniem, telefon 390×844, angielski, zrzuty.
6. Styk z grą (minimum jedno zadanie, dwa z napadem i handlem): wieść o osadzie (`wiesci.ts`), szansa napadu zależna od nastawienia (`raidChance` dostaje nowe wejście), handel jako wyprawa do osady (`Cel`).
7. Bramka: bot, perf, dokumentacja.

Ryzyka:
- Brak źródła reguł: „reguły z przebiegów botów” nie istnieją, bo boty giną w dniach 13 do 17. Reguły są projektowane, nie wyprowadzone, i łatwo o osadę, która wygląda na losową albo za łatwą.
- Zależność od odkrywania, którego nie ma; trzeba prowizorki, potem przeróbki.
- Luka wierności: nie da się wejść do takiej osady ani zobaczyć jej ludzi. Jeśli Mateusz chce ją oglądać żywą, A tego nie da i jest wstępem do B. Stan trzeba projektować jako skrót, z którego da się później zbudować `SimState`.
- Bez zdefiniowanego styku osady są dekoracją; zbyt mocny styk (napady) wymaga strojenia balansu.

Zalety: najmniej kodu, zero kosztu CPU i zapisu (setki bajtów na osadę), nie dotyka `sim.ts`, działa też na prawdziwych adresach (znacznik z samego `srodekKwadratu`, bez geo sąsiada).

Wariant A2 (zamiast zadań 1 i 2): liczbowy silnik 0.3 jako gotowy model osady. Jest w `public/v03/js/sim.js` (1 020 linii JS ze stanem globalnym), ma bota `playV03` (234 linie) i tabele już przeniesione do `src/content/data.ts`; 45 dni gry razem z botem to 0,8 do 2 s w `node:vm` (`v03-czas.ts`), czyli kilka do kilkunastu razy szybciej niż nowy silnik (10 do 38 s). Przepisanie na TypeScript z ziarnem i testem różnicowym wobec oryginału to szacunkowo 2 do 3 zadań (testy różnicowe `node:vm` w repo już są). Cena: model jest za łatwy (zaufanie 100, zgony 0 w 45 dni), nie zna nowych mechanik, a jego liczby (osada od 103 ludzi) nie pasują do osiedla z kilkunastoma osobami.

### Wariant B: druga pełna symulacja bez rysowania, prowadzona przez silnik decyzji, rysowana na żądanie

Co już jest: izolacja dwóch `Sim` (zmierzona), pełny świat z siedzibą dla sąsiada bez zmian w `src/` (rozdział 4), polityki działające w przeglądarce, tani odczyt zarządu, klony i próbne przebiegi, uprząż botów.

Zadania (14 do 24, typowo 19):
1. Polityki z `tests/unit/` do `src/ai/` jako moduł z interfejsem polityki, bez zmiany zachowania (skróty botów i 60 plików testów bez zmian; `tally` do obiektu gry; `answer()` publiczne). 1 do 2 zadań.
2. `GraAi`: gra krok po kroku (`Sim`, zarząd, polityka) z `krok()`, `zapisz()`, `wczytaj()`, `dogon(doTick, budzet)`; test izolacji (kilka gier w procesie, skróty jak solo), test zapisu w połowie. 1 zadanie.
3. Świat osady na kwadracie: `swiatOsady(geo, uklad, sx, sy, seed)`: wariant osobnej mapy (przesunięte geo i `buildWorld`, działa dziś) z regułą wyboru siedziby (największy mieszkalny blisko środka, minimum pokoi). Wariant ze szwem (okno i kąt domu w `buildWorld`) to dodatkowe zadanie. 1 do 2 zadań.
4. Polityka zarządu: prognoza zapasów i temperatury, wybór uchwał, wydarzenia przez wybór 1-ply na klonie `GovState`, karta nocy z dyżurem przy kozie i wyprawą po jedzenie, przyjęcia według zapasów. Cel: przeżycie pierwszej zimy. 1 do 2 zadań.
5. Polityka gospodarki: kolejka budowy z progami, badania (kolejność jak `TECH_ORDER` w bocie 0.3), tabela Pracy (priorytety i progi), werbunek. 1 do 2 zadań.
6. Polityka wypraw i sąsiadów (z `miastoPlayer`, `sasiedziPlayer` plus prognoza). 1 zadanie. W trybie zombie dodatkowo polityka obrony z `bot-zombie.ts`: 1 zadanie (opcjonalne).
7. Uprząż strojenia: `npm run bot:osady` (N ziaren × 3 dema × 45 dni, procesy równoległe), progi bramki (przeżycie 45 dni w co najmniej 4 z 5 ziaren), raport. 1 zadanie.
8. Katalog osad i cykl życia: lista osad per kwadrat z ziarnem, tworzenie przy starcie albo odkryciu, krok razem z grą gracza (tempo, pauza), leniwe doganianie z budżetem kroków na klatkę albo w workerze, limit jednocześnie żywych osad, stan końcowy osady. 2 zadania.
9. Zapis: `Save.osady` (stan i zarząd skompresowane), wersja, odcisk świata osady, zachowanie przy braku miejsca (dziś ciche); do czasu IndexedDB z etapu 3 miasta limit liczby osad. 1 zadanie.
10. Odkrycie: wyzwalacz i lista odkrytych (jak w A), kronika po polsku i angielsku. 1 zadanie.
11. Podgląd: tryb oglądania osady w widoku (zamiana sceny i `syncGame` albo drugi `GameView`; pełne warstwy ruchu dopiero z etapem 2b miasta), blokada poleceń (precedens: kwadraty obok), znacznik, karta, telefon, zrzuty. 2 do 4 zadań.
12. Styk z grą gracza: napad z osady jako plan napadu w karcie nocy, handlarz z osady, wyprawa-wymiana; skutki po stronie osady przez `applyGov` i kolejkę poleceń. 0 w wersji minimalnej, 2 do 3 z interakcjami (to jest sens „rywali”).
13. Wydajność i bramka: budżet klatek telefonu z N osadami, `npm run perf`, determinizm silników, skróty botów, dokumenty. 1 zadanie.

Ryzyka:
- Silnik decyzji jest nieznanym kosztem. Pojedyncze reguły dały dzień lub dwa, a przyczyn zimna i głodu rano nie ustaliłem. Strojenie jest tanie w maszynie (45 dni to kilkanaście do kilkudziesięciu sekund), ale droższe w pomysłach; ryzyka to silnik, który nigdy nie dojdzie albo wyzyskuje błędy balansu. Pomagają: wybór 1-ply na klonie zarządu (0,2 ms) i próbne przebiegi (doba 130 do 240 ms) z przestawianym ziarnem.
- Koszt CPU rośnie z ludnością (krok 7 do 13 µs po pracy ludzi, 13 do 74 µs z tłumem 150) i z liczbą osad; doganianie 45 dni to 7 do 38 s, więc worker albo budżet. Telefon 390×844 wymaga pomiaru.
- Zapis: 35 do 380 KB na osadę, cichy błąd przy limicie, IndexedDB nie istnieje.
- Rysowanie: warstwy symulacji są tylko w domu. Podgląd przez zamianę sceny jest tani, ale to nie „ludzie chodzą na mapie obok”; to dopiero etap 2b miasta.
- Architektura: osobna `Sim` na osadę pasuje do niezależnych światów drużyn z gry sieciowej, a nie do planu miasta etap 2 (jedna `Sim`, numery globalne). Jeśli później ludzie gracza mają chodzić do osady, powstają dwa modele.
- Determinizm między silnikami: 46 `Math.hypot` w `src/sim` i `src/gov`, 18 w `src/world`. Zapis z chmury przechodzi między przeglądarkami, a stan osady jest jego częścią; ryzyko anty-celu „ten sam zapis inaczej na telefonie i komputerze”.
- Siedziba zdegenerowana (6 kafelków, 0 pokoi) i kąt obrotu różny od domu.
- `Prompt` rośnie z nowymi funkcjami gry; każda polityka musi nadążać (kompilator wymusza to tylko w `bot-zombie.ts`).
- Dane dla prawdziwych adresów: loader kwadratów z etapu 3.

### Wariant C: osada jako świat drużyny na serwerze gry, prowadzony przez bota

To wariant B bez kawałka „w kliencie” plus platforma serwerowa z MMO etap 1. Silnik decyzji jest ten sam i jest tym samym artefaktem co brakujące „rozporządzenia” z projektu gry sieciowej.

Zadania (21 do 32, typowo 26; wycinek „bot liczy osady na serwerze, klient pokazuje liczby i znacznik” około 15):
1. Silnik decyzji w `src/ai/` jak w B: zadania 1, 2, 4, 5, 6, 7 z listy B. 6 do 9 zadań.
2. Poprawki determinizmu z raportu etapu 0: `src/core/mat.ts`, świat niezależny od ostatniego bitu, `hypot` w 64 miejscach. 2 do 3 zadań (potrzebne, jeśli klient buduje świat sam albo zapisy przechodzą między silnikami; przy samych migawkach ze świata serwera można odłożyć, wysyłając tablice świata).
3. Proces i kontener świata (`za-murem-swiat`): obraz z `src/`, konfiguracja, wspólne konta. 1 do 2 zadań.
4. Magazyn światów: tabele w SQLite (stan gz, geo, wersja, tick), zapis co 5 minut i przy zamknięciu, dogonienie po restarcie. 2 zadania.
5. Harmonogram: tykanie w stałym tempie, leniwe doliczanie nieobecnych, zamrażanie, `worker_threads`. 2 zadania.
6. Źródło geo po stronie serwera (zapisy klientów albo kafelki z pamięcią podręczną). 1 do 2 zadań.
7. API i protokół: lista osad w odkrytych kwadratach, migawka stanu, interakcje, strumień. 2 do 3 zadań.
8. Klient: podgląd zdalnego świata z migawek (jak podgląd z B, ale źródło sieciowe). 2 do 3 zadań.
9. Asynchroniczne interakcje między światem gracza a osadą: handel jako wyprawa, napad, wiadomość; czasy się różnią (świat serwera 5 kroków na sekundę, gra gracza z pauzą i do 8×). 2 do 4 zadań.
10. Operacje: osobna maszyna, wdrożenie, kopie poza maszyną, informacja o danych osobowych. 1 do 2 zadań plus decyzje.

Ryzyka:
- Wszystko z B (silnik, strojenie, podgląd) plus platforma, której dziś nie ma: serwer nie liczy symulacji, obraz kontenera nie ma `src/sim`.
- Decyzje Mateusza z projektu MMO: prędkość świata (rekomendacja 5 kroków na sekundę), zamarzanie nieobecnych, osobna maszyna na Hetznerze (zakup), kopia poza maszyną, informacja o danych osobowych, miejsce startu drużyny. Nic nie idzie na zewnątrz bez jego OK.
- Dwa zegary: osada na serwerze żyje w czasie rzeczywistym, gra jednoosobowa ma pauzę i tempa; styk jest asynchroniczny, więc „osada tuż obok” znaczy co innego niż w B.
- Świat serwera i świat klienta mogą się różnić (przypadek Lanciego w Chromium); bez poprawek determinizmu trzeba wysyłać tablice świata.
- Największy koszt koordynacji: jeden wdrażający i rozbudowane bramki.

### Porównanie

| | A liczby | B druga symulacja | C świat na serwerze |
|---|---|---|---|
| zadania planu | 6 do 8 | 14 do 24 (typowo 19) | 21 do 32 (typowo 26; wycinek około 15) |
| nowy silnik decyzji | nie (reguły wzrostu) | tak, główna niewiadoma | tak, ten sam |
| dotyka `sim.ts` | nie | nie (osobna `Sim`) | nie |
| zależy od odkrywania | tak (prowizorka) | tak (prowizorka) | tak i od sieci |
| zapis | setki bajtów | 35 do 380 KB na osadę | na serwerze |
| widać żywych ludzi | nie | w trybie podglądu | w trybie podglądu przez sieć |
| decyzje Mateusza | małe | osobna mapa czy szew; czy żywa na odkryciu | cały zestaw z MMO |

Najtańszy jest A (około 6 do 8 zadań), bo nie potrzebuje drugiej symulacji ani silnika decyzji. Jego jedyna realna niewiadoma to skąd wziąć krzywe wzrostu, bo żaden bot w nowym silniku nie dożywa dnia 17.

Kolejność bez wyrzucania pracy: A albo od razu wspólny początek B i C, czyli zadania 1, 2, 4 i 7 z listy B (polityki do `src/ai/`, `GraAi`, polityka zarządu i uprząż przeżycia, 4 do 6 zadań). Cel kontrolny: przeżycie 45 dni w co najmniej 4 z 5 ziaren na trzech demach. Wynik rozstrzyga, czy B i C są w zasięgu, kosztuje niewiele (gra bota 45 dni to kilkanaście do kilkudziesięciu sekund) i jest tym samym artefaktem co „rozporządzenia” dla nieobecnego gracza z projektu MMO. A można zbudować równolegle, a jego stan zaprojektować jako skrót, z którego da się później zbudować `SimState`.

Do rozstrzygnięcia przed budową (po jednym pytaniu, kolejno): czy osada ma być oglądana na żywo (B) czy wystarczą liczby i karta (A); czy ma żyć bez odkrycia (doganianie) czy powstawać przy odkryciu; osobna mapa czy kwadrat sklejony z domem; czy osada ma kiedykolwiek współistnieć z ludźmi gracza na jednej mapie (wtedy plan miasta etap 2 i model „jedna `Sim`”).

## Aneks: skrypty, logi, powtórzenie

Katalog: `/private/tmp/claude-501/-Users-mpawelczuk-Post-pixel/459a51a3-cfb2-459b-ae88-222f98950c4c/scratchpad/osada-ai/`. Migawki kodu: `migawka-5ede74b`, `migawka-67e9cf3`, `migawka-4b2f7f2`. Zmienna `ZM_KOD` wskazuje migawkę.

- `stan-rozmiar.ts [demo] [ziarno] [mieszkancy]` (`ZM_DNI=1,10,45`, `ZM_ZYWY=1`): rozmiary stanu i koniec gry bota. Logi: `wyniki/stan-*.log`, `wyniki2/stan-*.log`.
- `bot-konce.ts [dni]`: koniec gry bota w trzech konfiguracjach. `bez-za-siatke.ts`, `z-obcymi.ts`: bez przełącznika „za siatkę” i z opcją `obcy`.
- `dwie-sim.ts [dni]`, `pamiec-sim.ts`, `gra-krokowa.ts` (klasa `Gra`): izolacja, pamięć, krok.
- `krok-ruch.ts`, `koszt-zarzadu.ts`, `rollout.ts`: koszt kroku, odczytu zarządu, klonu i próbnych przebiegów.
- `kwadrat-swiat.ts`, `swiat-sasiada.ts` (`MIESZK=1` z generatorem mieszkańców): świat kwadratu i świat z siedzibą dla sąsiada.
- `wkurzenie-zrodla.ts`, `poranki.ts`, `karta-opcje.ts`, `polityka-v0.ts`: diagnoza wkurzenia i próby polityk.
- `atrapa-45.ts`: atrapa zarządu przez 45 dni. `v03-czas.ts`: czas bota 0.3. `zbierz-stan.py`: zestawienie logów rozmiarów. `liczby-tresci.ts`: treść decyzji (M1_EVENTS 42 wydarzenia z 68 wyborami, NEW_EVENTS 16 z 23, STREET_EVENTS 7, OLD_EVENTS 19; uchwały M1 6; budowle 13; technologie 29, w tym 11 z działaniem; rodzajów poleceń symulacji 55).
- `bundle-test/` (`wejscie.ts`, `w-chromium.mjs`, `w-node.mjs`): paczka dla przeglądarki i próba w Chromium i Node.
- Oficjalne boty uruchamiałem z migawek: `node tools/bot.ts --zwyciestwo`, `node tools/bot-zombie.ts [ziarno [noce]]`, `node tools/bot-v03.ts 1 45`, `node tools/bot-praca.ts`; logi w `wyniki/` i `wyniki2/`.
- Uwaga dla integratora: na 67e9cf3 sekcja fali 1 M2 w `tools/bot.ts` wypisywała dwie linie BŁĄD (kod wyjścia 1), bo automat pracy szabruje sam i wariant „bez przeszukiwania” już niczego nie porównywał. Poprawiło to 66d774e (przełącznik „za siatkę” wyłączony w tej sekcji); poprawionej wersji nie uruchamiałem w całości.
