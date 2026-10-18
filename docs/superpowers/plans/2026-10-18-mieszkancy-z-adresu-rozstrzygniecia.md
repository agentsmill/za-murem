# Mieszkańcy z adresu: rozstrzygnięcia z wykonania planu (kroki 1–4)

Decyzje, które podjąłem w trakcie wykonania planu `2026-10-18-mieszkancy-z-adresu.md` bez pytania Mateusza, z kosztem, jeśli są złe. Numery R odpowiadają dziennikowi wykonania. Mateusz potwierdził osobno tylko wyludnienie i fachy na 2051 (18.10.2026).

| Nr | Decyzja | Koszt, jeśli zła |
|---|---|---|
| R1 | Budynki z mapy od razu dostają epokę i liczbę mieszkań. | brak |
| R2 | Bez tabel gminy generator bierze rozkłady całej Polski (`polska` w `kraj.json`). | narzędzie danych czyta duże pliki jeszcze raz |
| R3 | `obsadzRejon` przyjmuje liczbę gospodarstw, nie mieszkań. | brak |
| R4 | Dźwignie upadku stroi zadanie silnika; test wsteczny może ruszać tylko wartości bez upadku. | możliwa druga runda strojenia |
| R5 | Progi testów czasu podniesione, później zastąpione przez R40 i R52. | – |
| R6 | Tolerancja e(0) liczonego z qx to ±0,3 roku. | słabszy test e(0) |
| R7 | Grupy 85-89 i 90+ złączone w 85+. | brak |
| R8 | W rzutowaniu PUWG 1992 x to wschód, y to północ. | brak |
| R9 | `Gospodarstwo.historia` jest opcjonalne. | odbiorcy obsługują brak |
| R10 | Testy na surowych danych pomijane, gdy brakuje konkretnego pliku. | brak |
| R11 | Okresy budowy GUS liczone całymi przedziałami: płyta 1971–1988, transformacja 1989–2011, nowe od 2012. | przesunięcie o rok na brzegach epok |
| R12 | Commity wykonawców mają podpis modelu, który je zrobił. | mieszane podpisy |
| R13 | Metraż mieszkań według epoki z P4386. | brak |
| R14 | Obłożenie mieszkań to gospodarstwa przez mieszkania ogółem (około 0,95). | to nie jest ścisły wskaźnik mieszkań zamieszkanych |
| R15 | `start_date` zamienia się na epokę według tych samych granic co R11. | jak R11 |
| R16 | Przy nakładających się obrysach rejonów wygrywa niższy numer. | arbitralne na granicach |
| R17 | Mnożniki płodności dopasowane do dzietności GUS (krzywa Eurostatu dawała o 3,5% za dużo urodzeń). | brak |
| R18 | Kolejność urodzeń znormalizowana do 100%. | brak |
| R19 | „Najbliższy rejon” mierzony do krawędzi obrysu, nie do środka. | trochę więcej rachunków |
| R20 | Kroki 1–4 nie ruszają `src/world`. | id i daty budynków dopiero w kroku 5 |
| R21 | `Math.sqrt` dozwolony w module (jest dokładny w każdej przeglądarce). | brak |
| R22 | Obszar generatora to kwadrat 384 m bez obrotu mapy, do kroku 5. | kilka budynków na brzegu inaczej niż w grze |
| R23 | Limit 400 mieszkań na budynek z planu zostaje. | falowiec ma około trzy razy mniej gospodarstw niż w rzeczywistości |
| R24 | Krok 5 musi wnieść do importu mapy `id` i `start_date` budynków. | do tego czasu klucze z geometrii i epoki z reguł |
| R25 | Spis 2021 rozszerzony o IPF z osobą 60+, rodzinami i dziećmi z rejonu. | bardziej złożony kod |
| R26 | Skłonności budynków: stary dom ma więcej osób 60+, nowy blok przyjezdnych 25–39; udział trzech pokoleń z NSP. | wartości to zgadywanie do strojenia botem |
| R27 | `postarz` przyjmuje rodzaj obszaru (duże miasto, miasto, wieś) zamiast tak/nie. | inne wywołanie niż w planie |
| R28 | Rodzice ze spisu dostają dorosłe dzieci mieszkające gdzie indziej, które mogą wrócić do opieki; powrót do opieki nie wcześniej niż samotność rodzica. | więcej rekordów osób |
| R29 | „Przyjezdni z puli regionu” to regionalne pule nazwisk, nie skład gospodarstw. | słabszy sygnał regionu wśród przyjezdnych w 2051 |
| R30 | Płodność 2021–2025 rok po roku; w teście wstecznym próg ±3,5 pp dla gmin rosnących z opisem. | luźniejszy próg dla przedmieść |
| R31 | Gmina rosnąca to co najmniej 5% więcej mieszkań i 5% więcej ludności od spisu. | brak |
| R32 | Pliki nazwisk mają nazwy województw bez polskich liter. | jedna stała mapująca |
| R33 | Koszyki imion przed 2000: progi z notatek, miękki podział między sąsiednie koszyki, lata 90. pół na pół z listą z 2000 r., żadne imię ponad 25% koszyka. | to szacunek, nie dane kohortowe |
| R34 | Imiona w obcej pisowni wyłączone z koszyków niezależnie od przyrostu. | brak |
| R35 | Bez tabel gminy nazwiska z mazowieckiego, bez puli lokalnej. | lekkie przechylenie ku Mazowszu |
| R36 | Generator przyjmuje opcjonalny pakiet nazw; bez niego imiona są puste. | dwie ścieżki do kroku 5 |
| R37 | Dodatkowe reguły imion: przed 1990 bez czołówki 2020–2025, po 2031 bez imion w zaniku. | około 3–4% list wyłączone |
| R38 | Udział nazwisk lokalnych ograniczony masą puli lokalnej. | krótkie pule dają mniej nazwisk lokalnych |
| R39 | Przyjęte niższe udziały nazwisk lokalnych poza Pomorzem (Małopolska 14% zamiast 20%). | słabszy smak regionu; to jedna stała |
| R40 | Testy czasu z progiem 1 500 ms; później przeniesione za `ZM_PERF=1` (R52). | testy łapią tylko duże spowolnienia |
| R41 | Plik odmiany zapisany w formie spakowanej, rozpakowywanej przy wczytaniu. | czytelnicy surowego JSON muszą rozpakować |
| R42 | Fachy na razie bez wag od okolicy (przychodnia, działki). | fachy nie zależą od mapy |
| R43 | `Osoba.fach` trzyma stałe id fachu, nazwę daje `nazwaFachu`. | wyświetlanie przez funkcję |
| R44 | Ogólny opis sklepu to „zakład usługowy na rogu”; patron po „im.” wycinany z nazw. | szkoły tracą patrona |
| R45 | Kronika nigdy nie używa prawdziwych nazw ulic. | mniej lokalności z ulic |
| R46 | Filtr nazw miejsc łapie tytuł z nazwiskiem (dr, lek., mgr, prof., inż.), z wyjątkiem sieci. | kilka aptek z nazwiskiem lekarza staje się „apteką” |
| R47 | Co najmniej 5 wpisów kroniki z miejscem, gdy na mapie jest choć jedno nazwane miejsce. | powtórzenia jednego miejsca na ubogich mapach |
| R48 | Jedno miejsce nie ma dwóch zdarzeń w tym samym roku; filtr łapie „mgr farm.”, „Dr.Nowak”, „Dr Max Kowalski”. | brak |
| R49 | Kronika liczona raz na obszar i podawana budynkom. | sąsiednie adresy mogą mieć różne kroniki |
| R50 | Adresy w nazwach miejsc zastępowane opisem; nazwisko rodziny tylko wspólne co najmniej dwóm osobom; przychodnia w historiach do 2043; bez opisów śmierci nieletnich. | kilka marek z „na” w nazwie traci nazwę |
| R51 | Końcowe poprawki: ojciec 18–50 lat starszy, zakaz połączeń imię i nazwisko znanych osób, filtr bez lookbehind (stare Safari), epoka zależna od wysokości, złote skróty wyniku, uczciwy opis stałości klucza budynku. | wyniki demo zmieniły się raz, są przypięte skrótami |
| R52 | Drobne: Rakowski na liście, komentarze w liście, domownicy bez wspólnego imienia, windy od 5 kondygnacji, wiersze licencji, testy czasu za `ZM_PERF`. | brak |
| R53 | Reguła wysokości: bez epoki przedwojennej od 7 kondygnacji, bez powojennej od 13. | blok 11–12-piętrowy może dostać epokę powojenną |
| R54 | Trzaskowski, Grodzki, Kołodziejczak i Bodnar na liście zakazanych nazwisk. | brak |
| – | Liczba „966 lematów” w dzienniku uznana za źródłową (notatki o odmianie, raport). | brak |

Do sprawdzenia przez Mateusza: lista zakazanych nazwisk i połączeń (pisana z pamięci), ton szablonów historii, kroniki i fachów, udział nazwisk lokalnych (R39).
