# Odmiana imion i nazwisk przez siedem przypadków dla generatora mieszkańców „Za Murem”

Notatki z 17.10.2026. Wszystkie liczby oznaczone jako „obliczenia własne” policzyłem skryptami Pythona na pobranych plikach (skrypty w `/private/tmp/claude-501/-Users-mpawelczuk-Post-pixel/e4b9c9ed-c717-4ee7-985e-bc3026b5fc04/scratchpad/skrypty/`: `wyciagnij_sgjp.py`, `pokaz.py`, `reguly.py`, `nazwiska.py`, `analiza.py`, `zapisz_wyciag.py`). Źródłem danych dla tych liczb jest wskazany plik.

## 1. SGJP: czy ma imiona i nazwiska z pełnymi paradygmatami, licencja, format, rozmiar, jak wyciągnąć

### Takeaway
Dane fleksyjne SGJP w postaci pliku `sgjp-20260823.tab.gz` (42,7 MB) mają pełne paradygmaty 3181 imion i 95 349 nazwisk, oznaczone w osobnej kolumnie jako `imię` i `nazwisko`, i są na dwuklauzulowej licencji BSD, więc wyciąg można trzymać w publicznym repo pod warunkiem zachowania noty copyrightowej. Wyciąg liczby pojedynczej wszystkich imion to 735 KB JSON (89 KB po gzip) i obejmuje wszystkie 15 imion i nazwisk testowych.

### Cited Findings
- Serwer `download.sgjp.pl/morfeusz/` udostępnia wydania od 01.07.2019 do 23.08.2026; katalog `current/` wskazuje wydanie 20260823 z plikami `sgjp-20260823.tab.gz` (41M), `polimorf-20260823.tab.gz` (45M), słownikami binarnymi `morfeusz2-dictionary-sgjp-20260823.tgz` (7M) i `morfeusz2-dictionary-polimorf-20260823.tgz` (8M) oraz źródłami programu ([listing download.sgjp.pl/morfeusz/current/](http://download.sgjp.pl/morfeusz/current/)).
- Licencja: autorami i właścicielami praw do danych fleksyjnych SGJP są Zygmunt Saloni, Włodzimierz Gruszczyński, Marcin Woliński, Robert Wołosz i Danuta Skowrońska; program i zawarte w nim dane fleksyjne udostępniono „na tzw. dwuklauzulowej licencji BSD”. Redystrybucja kodu źródłowego musi zawierać notę copyrightową, listę warunków i wyłączenie odpowiedzialności, a redystrybucja postaci wykonawczej to samo w dokumentacji lub materiałach dołączonych ([Morfeusz 2, Licencja](https://morfeusz.sgjp.pl/doc/license/)).
- Na BSD nie jest cały słownik SGJP, tylko dane potrzebne do analizy morfologicznej, czyli lista form fleksyjnych; pełny SGJP „być może kiedyś” zostanie udostępniony bez określonego terminu ([Morfeusz 2, Licencja, FAQ](https://morfeusz.sgjp.pl/doc/license/)).
- Nagłówek samego pliku `sgjp-20260823.tab.gz` ma identyfikator `pl.sgjp.sgjp-2026.08.24` i notę: „Copyright © 2007–2026 Marcin Woliński, Zbigniew Bronk, Włodzimierz Gruszczyński, Witold Kieraś, Zygmunt Saloni, Danuta Skowrońska, Robert Wołosz” z pełnym tekstem BSD-2 ([sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)). Lista autorów w pliku jest dłuższa niż na stronie licencji; do repo warto skopiować notę z pliku.
- Format: jeden wiersz to jedna forma, 5 kolumn rozdzielonych tabulatorem: forma, lemat (identyfikator leksemu), znacznik morfosyntaktyczny, klasyfikacja nazw własnych, kwalifikatory rozdzielone pałką `|`; ostatnia kolumna jest opcjonalna ([Morfeusz2.pdf, rozdz. 7.1](http://download.sgjp.pl/morfeusz/Morfeusz2.pdf)). Instrukcja prosi też, by słowniki rozpowszechniane po zmianach miały własny identyfikator i notę wyjaśniającą pochodzenie danych (tamże).
- Przykładowe wiersze z pliku (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)): `Marka	Marek:Sm1	subst:sg:gen.acc:m1	imię|nazwisko`, `Mai	Maja:Sf	subst:pl:gen:f	imię	hom.`, `Kowalski	Kowalski:Sf	subst:sg.pl:nom.gen.dat.acc.inst.loc.voc:f	nazwisko`. Kropka w znaczniku łączy warianty (np. `gen.acc` to jedna forma dla dwóch przypadków), a sufiks lematu po dwukropku rozróżnia homonimy (`Kuba:Sm1` imię, `Kuba:Sf` nazwa geograficzna) i warianty odmiany (`Hugo:Sm1~ga~o~ona`).
- Rozmiar: 42 691 113 B spakowany, 415 364 934 B po rozpakowaniu, 7 458 548 wierszy (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)).
- Wartości kolumny 4 (liczba wierszy): pusta 4 823 696, `nazwa_pospolita` 1 526 616, `nazwisko` 825 594, `nazwa_geograficzna` 216 467, `imię` 32 169, `imię|nazwisko` 4 806, `imię|nazwa_geograficzna` 701, `imię|nazwa_geograficzna|nazwisko` 88, `nazwisko_(odmężowskie)` 286, `nazwisko_(odojcowskie)` 286, `przydomek` 181, `pseudonim` 170 (obliczenia własne, tamże).
- Po zgrupowaniu po lemacie: 3181 leksemów z klasą `imię` (m1: 2019, f: 1146, m2: 14, m3: 2) oraz 95 349 leksemów z klasą `nazwisko` (m1: 47 844, f: 47 505); 27 302 żeńskie nazwiska są nieodmienne, tzn. wszystkie przypadki równe mianownikowi (obliczenia własne, tamże).
- Kwalifikatory przy formach odróżniają formy normatywne od potocznych i błędnych, np. `Hugo`: D. `Hugona`, `Huga [pot.]`, `Hugo [niepopr.]`; `Maja`: W. `Majo` i `Maju` bez kwalifikatora (obliczenia własne, tamże). Pełna lista kwalifikatorów form (m.in. `pot.`, `niepopr.`, `rzad.`, `char.`, `hom.`, `daw.`) jest w konfiguracji strony [sgjp.pl](http://sgjp.pl/).
- Strona SGJP ma w wyszukiwarce osobne słowniki „miejscowości”, „nazwiska” i „SGJP”, klasyfikację „pospolitości” z kategoriami `imię`, `nazwisko`, `nazwisko (odmężowskie)`, `nazwisko (odojcowskie)` oraz poziomy frekwencji leksemów od „300 najczęstszych” do „150 000 najczęstszych” ([sgjp.pl](http://sgjp.pl/)). Pliku `.tab` z frekwencją nie znalazłem.
- Pokrycie popularnych imion: wszystkie 100 imion z list „50 najpopularniejszych żeńskich i męskich” z repo taurit są w SGJP; z 1707 imion listy kalendarzowej z repo printu w SGJP jest 1516, brakuje 191, głównie rzadkich i staropolskich (Aisza, Ariel, Axel, Będzimir, Dalia…) (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz), [taurit/PolishNameFlection](https://github.com/taurit/PolishNameFlection), [printu/vocative-polish-firstname](https://github.com/printu/vocative-polish-firstname)).
- W SGJP brakuje m.in. imion Nikola, Mia, Dżesika (nie ma ich też w PoliMorfie), Antonia, José, Nicole, Inez (są w PoliMorfie albo nigdzie) (obliczenia własne, tamże i [polimorf-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/polimorf-20260823.tab.gz)).
- Pokrycie nazwisk: z 287 najczęstszych nazwisk z listy w repo taurit w SGJP jest 284 form męskich i 282 żeńskich; brakuje Nehri, Dimitrescu, Korwin-Piotrowski/a oraz żeńskich Zola i Picasso (obliczenia własne).
- Wyciąg: filtr „kolumna 4 zawiera `imię` lub `nazwisko`” i „znacznik zaczyna się od `subst:`”, rozbicie list liczb i przypadków po kropce, grupowanie po kolumnie 2; przebieg trwa ok. 7 s w Pythonie. Wynik dla wszystkich imion (l. poj.): 735 008 B JSON, 88 780 B po `gzip -9`; dla 287 najczęstszych nazwisk (obie płcie, 574 leksemy z homonimami): 138 234 B, 15 266 B po gzip; wszystkie nazwiska SGJP: 18,8 MB JSON, 2,2 MB po gzip (obliczenia własne).

#### Paradygmaty testowe z SGJP (liczba pojedyncza)

Źródło: [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz), wyciąg własny (kopia w `dane-surowe/odmiana/wyciag-sgjp/paradygmaty_testowe.md`).

| lemat (id SGJP) | rodz. | klasa | M. | D. | C. | B. | N. | Ms. | W. |
|---|---|---|---|---|---|---|---|---|---|
| Halina | f | imię | Halina | Haliny | Halinie | Halinę | Haliną | Halinie | Halino |
| Kinga | f | imię | Kinga | Kingi | Kindze | Kingę | Kingą | Kindze | Kingo |
| Ola | f | imię | Ola | Oli | Oli | Olę | Olą | Oli | Olu |
| Natalia | f | imię, nazwa_geograficzna | Natalia | Natalii | Natalii | Natalię | Natalią | Natalii | Natalio |
| Maja:Sf | f | imię | Maja | Mai | Mai | Maję | Mają | Mai | Majo / Maju |
| Marek:Sm1 | m1 | imię, nazwisko | Marek | Marka | Markowi | Marka | Markiem | Marku | Marku |
| Marek:Sf | f | nazwisko | Marek | Marek | Marek | Marek | Marek | Marek | Marek |
| Paweł | m1 | imię | Paweł | Pawła | Pawłowi | Pawła | Pawłem | Pawle | Pawle |
| Henryk:Sm1 | m1 | imię | Henryk | Henryka | Henrykowi | Henryka | Henrykiem | Henryku | Henryku |
| Kuba:Sm1 | m1 | imię, nazwisko | Kuba | Kuby | Kubie | Kubę | Kubą | Kubie | Kubo |
| Jakub | m1 | imię | Jakub | Jakuba | Jakubowi | Jakuba | Jakubem | Jakubie | Jakubie |
| Zbigniew | m1 | imię | Zbigniew | Zbigniewa | Zbigniewowi | Zbigniewa | Zbigniewem | Zbigniewie | Zbigniewie |
| Igor | m1 | imię | Igor | Igora | Igorowi | Igora | Igorem | Igorze | Igorze |
| Kowalski:Sm1 | m1 | nazwisko | Kowalski | Kowalskiego | Kowalskiemu | Kowalskiego | Kowalskim | Kowalskim | Kowalski |
| Kowalski:Sf | f | nazwisko | Kowalski | Kowalski | Kowalski | Kowalski | Kowalski | Kowalski | Kowalski |
| Kowalska | f | nazwisko | Kowalska | Kowalskiej | Kowalskiej | Kowalską | Kowalską | Kowalskiej | Kowalska |
| Nowak:Sm1 | m1 | nazwisko | Nowak | Nowaka | Nowakowi | Nowaka | Nowakiem | Nowaku | Nowaku |
| Nowak:Sf | f | nazwisko | Nowak | Nowak | Nowak | Nowak | Nowak | Nowak | Nowak |

Dodatkowe przypadki brzegowe z tego samego pliku (wybór): Jerzy → Jerzego, Jerzemu, Jerzym, W. Jerzy; Antoni → Antoniego, Antonim; Bruno → Brunona (pot. Bruna), W. Bruno/Brunonie; Aleksander → Aleksandra, Aleksandrze; Kacper → Kacpra; Ania → Ani, W. Aniu; Ksenia → Kseni, W. Ksenio/Kseniu; Eugenia → Eugenii, W. Eugenio; Jessica → Jessiki, Jessice; Rut, Miriam, Carmen, Noemi, Beatrycze nieodmienne; René nieodmienne; Wiesiek → Wieśka; Zdzisiek → Zdziśka; Staś → Stasia, Stasiu; Oleg → Olegiem, Olegu; Ernest → Erneście; Bonawentura → Bonawentury, Bonawenturze, W. Bonawenturo.

#### Tabela pobranych plików

Wszystko pobrane 17.10.2026 do `/Users/mpawelczuk/Post-pixel/dane-surowe/odmiana/`. Repozytoria GitHub sklonowane `git clone --depth 1` (z katalogiem `.git`). Nic nie było instalowane ani uruchamiane.

| lokalna ścieżka | źródło | rozmiar | licencja | zawartość |
|---|---|---|---|---|
| `sgjp/sgjp-20260823.tab.gz` | http://download.sgjp.pl/morfeusz/current/sgjp-20260823.tab.gz (= `/20260823/`) | 42 691 113 B | BSD-2-Clause (nota w nagłówku pliku) | lista form fleksyjnych SGJP, 7,46 mln wierszy, z klasą imię/nazwisko i kwalifikatorami |
| `polimorf/polimorf-20260823.tab.gz` | http://download.sgjp.pl/morfeusz/current/polimorf-20260823.tab.gz | 47 390 207 B | BSD-2-Clause (nota w nagłówku) | słownik PoliMorf w tym samym formacie, 8,51 mln wierszy |
| `morfeusz-doc/Morfeusz2.pdf` | http://download.sgjp.pl/morfeusz/Morfeusz2.pdf | 159 261 B | nie podano; © IPI PAN; trzymać lokalnie, nie wrzucać do repo | instrukcja Morfeusza 2, opis formatu `.tab` |
| `github-codecalm_odmiana-imion/repo/` (`regexes.json` 764 B, `README.md` 317 B, `LICENSE` 1068 B) | https://github.com/codecalm/odmiana-imion, commit 6fc851b z 14.01.2020 | 2 149 B (+124 KB `.git`) | MIT, © 2018 Paweł Kuna | 31 wyrażeń regularnych na wołacz imion |
| `github-printu_vocative-polish-firstname/repo/` (m.in. `src/VocativePolishFirstName.php` 12 566 B, `test/imiona.csv` 44 135 B, `test/test_results.html` 288 789 B) | https://github.com/printu/vocative-polish-firstname, commit d691208 z 12.06.2017 | 355 589 B w 9 plikach (+160 KB `.git`) | MIT, © 2015 ECBOX Sp. z o.o. | komponent PHP do wołacza; lista 1707 imion z płcią i wołaczem |
| `github-taurit_PolishNameFlection/repo/` (m.in. `.../Data/KnownFamilyNames.csv` 13 110 B, `KnownNames-vocative.csv` 51 270 B, `KnownNames.csv` 2 402 B, `PopularFemaleNamesNominative.csv` 386 B, `PopularMaleNamesNominative.csv` 380 B, `PolishNameFlectionHelper.cs` 12 079 B) | https://github.com/taurit/PolishNameFlection, commit 5e38430 z 21.05.2016, repo zarchiwizowane | 174 040 B w 56 plikach (+180 KB `.git`) | MIT, © 2016 buli | biblioteka .NET (tylko dopełniacz); 287 najczęstszych nazwisk z liczbą nosicieli i dopełniaczem; 50+50 popularnych imion (kodowanie cp1250) |
| `github-MihalMakulski_odmiana-imion-w-polsce/readme.md` | https://raw.githubusercontent.com/MihalMakulski/odmiana-imion-w-polsce/main/readme.md | 1 423 B | brak licencji | tylko opis; pliku JSON (865 284 B) celowo nie pobrałem |
| `wyciag-sgjp/imiona_sg.json` | wyciąg własny z `sgjp-20260823.tab.gz` | 735 008 B (88 780 B gzip) | BSD-2-Clause (nota w polu `_nota`) | 3181 imion, l. poj., 7 przypadków, z kwalifikatorami |
| `wyciag-sgjp/nazwiska_top_sg.json` | wyciąg własny z `sgjp-20260823.tab.gz` | 138 234 B (15 266 B gzip) | BSD-2-Clause | 574 leksemy nazwisk z listy 287 najczęstszych (obie płcie) |
| `wyciag-sgjp/paradygmaty_testowe.md` | wyciąg własny | 1 912 B | BSD-2-Clause (dane SGJP) | tabela paradygmatów testowych jak wyżej |

Nie pobrane (świadomie): `plwiktionary-latest-pages-articles.xml.bz2`, 163 984 727 B, zrzut z 01.10.2026 ([dumps.wikimedia.org/plwiktionary/latest/](https://dumps.wikimedia.org/plwiktionary/latest/)), bo SGJP pokrywa potrzebę na luźniejszej licencji; słowniki binarne Morfeusza (7–8 MB, potrzebne tylko do programu Morfeusz); `odmieniacz.js` i `morfeusz2-node-bindings` z npm (natywne, tylko Node). Żaden plik nie przekroczył progu 300 MB.

### Inferences
- Dla części (a) najlepszy jest wyciąg z `sgjp-20260823.tab.gz`: pełne, normatywne paradygmaty, kwalifikatory pozwalają odrzucić formy potoczne i błędne, a licencja BSD-2 pozwala na publiczne repo. Kilkaset popularnych imion i kilkaset nazwisk to w JSON pełnych form kilkadziesiąt KB przed kompresją.
- BSD-2 wymaga przy dystrybucji zbudowanej gry noty w „dokumentacji lub innych materiałach”, więc notę trzeba dać i w repo (np. plik z licencjami zewnętrznymi), i w grze (ekran „O grze” obok atrybucji OSM).
- Z SGJP do generatora warto brać tylko formy bez kwalifikatora albo z `rzad.`; formy `pot.`, `niepopr.`, `char.` odrzucać. Przy kilku formach bez kwalifikatora (Majo/Maju, Ksenio/Kseniu) wybrać jedną i trzymać się jej.
- Katalog `dane-surowe/` jest nieśledzony i nie ma go w `.gitignore`; ma ok. 90 MB surowych plików i trzy zagnieżdżone katalogi `.git`, więc przed pierwszym commitem trzeba go dopisać do `.gitignore`, a do repo przenieść tylko mały wyciąg.

### Gaps
- Nie sprawdziłem, czy SGJP udostępnia gdzieś plik z frekwencją leksemów (strona ma poziomy frekwencji, plik `.tab` nie). Do wyboru „najczęstszych” imion trzeba innego źródła, np. list z rejestru PESEL na dane.gov.pl (zob. pkt 3).
- Pochodzenie liczb nosicieli w `KnownFamilyNames.csv` (taurit) nie jest opisane w repo; licencja repo to MIT, ale źródło liczb jest nieznane.

## 2. PoliMorf i dane Morfeusza 2: licencja, format, oznaczenie nazw własnych, rozmiar, wyciąganie

### Takeaway
PoliMorf ma ten sam format i tę samą licencję BSD-2 co SGJP i o 966 lematów imion więcej, ale nazwiska żeńskie ma opisane szczątkowo (14 406 leksemów, tylko 9 nieodmiennych), więc do nazwisk lepszy jest SGJP, a PoliMorf przydaje się jako uzupełnienie imion obcych.

### Cited Findings
- Właścicielem praw do danych fleksyjnych Polimorf jest Instytut Podstaw Informatyki PAN; dane są na tej samej dwuklauzulowej licencji BSD co program ([Morfeusz 2, Licencja](https://morfeusz.sgjp.pl/doc/license/)).
- Morfeusz 2 jest dystrybuowany z dwoma słownikami: domyślnym SGJP i Polimorfem; interpretacja zawiera formę, lemat, znacznik, listę informacji o „pospolitości” (np. nazwa pospolita, marka, nazwisko) i listę kwalifikatorów stylistycznych i dziedzinowych ([Morfeusz2.pdf](http://download.sgjp.pl/morfeusz/Morfeusz2.pdf)).
- Nagłówek `polimorf-20260823.tab.gz` ma identyfikator `pl.waw.ipipan.polimorf-2026.08.24` i trzy noty: © 2011 Marek Futrega, Piotr Gackiewicz, Mirosław Prywata, Włodzimierz Macewicz, Marcin Miłkowski; © 2007–2026 autorzy SGJP; © 2011–2026 Instytut Podstaw Informatyki PAN; tekst BSD-2 ([polimorf-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/polimorf-20260823.tab.gz)).
- Rozmiar: 47 390 207 B spakowany, 8 505 685 wierszy; kolumna 4: `nazwa_pospolita` 1 753 702, `nazwisko` 1 016 513, `nazwa_geograficzna` 302 596, `imię` 47 336, `nazwa_własna_osoby` 11 302, `imię|nazwisko` 1 827 wierszy (obliczenia własne, tamże).
- Po zgrupowaniu: 4150 leksemów `imię` (m1 2751, f 1376) i 64 012 leksemów `nazwisko` (m1 49 602, f 14 406, w tym tylko 9 żeńskich nieodmiennych); 966 lematów imion jest tylko w PoliMorfie, m.in. Antonia (Antonii, W. Antonio), Brajan, Jose (nieodmienne), Nicole (żeńskie nieodmienne) (obliczenia własne, tamże).
- Ten sam skrypt wyciągający działa bez zmian na obu plikach, bo format kolumn jest identyczny (obliczenia własne).
- Pakiet `morfeusz2` na PyPI (wersja 1.99.15) to wiązania Pythona do Morfeusza 2 z odsyłaczem licencyjnym do strony licencji Morfeusza ([PyPI morfeusz2](https://pypi.org/pypi/morfeusz2/json)); Morfeusz ma moduł generowania form, nie tylko analizy ([Morfeusz2.pdf](http://download.sgjp.pl/morfeusz/Morfeusz2.pdf)).

### Inferences
- Do statycznej gry nie trzeba uruchamiać Morfeusza: plik `.tab` daje gotowe formy, a generator form (Morfeusz `generate`) przydałby się tylko w narzędziu offline, które i tak można zastąpić prostym filtrowaniem `.tab`.
- PoliMorf ma inną, mniej spójną klasyfikację nazwisk (dużo męskich, mało żeńskich), więc łącząc źródła lepiej brać SGJP jako główne i PoliMorf tylko dla lematów, których SGJP nie ma.

### Gaps
- Nie znalazłem w tej sesji wpisu PoliMorfu w repozytorium CLARIN-PL; licencję potwierdza strona Morfeusza i nagłówek pliku.
- Nie oceniałem jakości 966 dodatkowych imion z PoliMorfu (część pochodzi z dawnych słowników ze współautorstwem spoza IPI PAN).

## 3. Inne zbiory i biblioteki: npm, GitHub, Python, Wikisłownik, poradnie

### Takeaway
Nie ma gotowej, utrzymywanej biblioteki JS do pełnej odmiany imion działającej w przeglądarce: znalezione projekty robią tylko wołacz (PHP, regexy) albo tylko dopełniacz (.NET), a jedyny pakiet npm z pełną odmianą opiera się na natywnym Morfeuszu i działa tylko w Node. Wikisłownik ma tabele odmiany imion, ale na CC BY-SA, więc SGJP jest lepszym źródłem.

### Cited Findings
- `odmieniacz.js` (npm, 0.1.2, 04.05.2026, MIT) daje `dative()`, `vocative()`, `cases()` dla pojedynczych słów, ale według README jest „heavy (native Morfeusz2 + dictionary)” i przeznaczony do Node po stronie serwera, nie do przeglądarki; zależy od `morfeusz2-node-bindings` ([npm odmieniacz.js](https://www.npmjs.com/package/odmieniacz.js)).
- `morfeusz2-node-bindings` (npm, 0.1.4, 04.05.2026) to synchroniczne wiązania N-API do Morfeusza 2; w metadanych npm pole licencji jest puste ([npm morfeusz2-node-bindings](https://www.npmjs.com/package/morfeusz2-node-bindings)).
- Inne trafienia npm dla zapytań „polish declension”, „odmiana”, „polish vocative” to pakiety do liczby mnogiej przy liczebnikach (`polish-plurals`, `pl-declension`, `pluralize-pl`) albo do innych języków (`shevchenko` dla ukraińskiego, `czech-vocative`, `vocative-cz`) ([wyszukiwarka npm](https://registry.npmjs.org/-/v1/search?text=polish%20declension&size=15)).
- `codecalm/odmiana-imion`: MIT, ostatni push 14.01.2020, 31 reguł regex tylko na wołacz ([GitHub codecalm/odmiana-imion](https://github.com/codecalm/odmiana-imion)). Porównanie z SGJP: wołacz zgodny dla 2607 z 3153 imion (82,7%); błędy np. Abel → Abelu (SGJP Ablu), Adaś → Adaś (Adasiu), Alberto → Albercie (Alberto), Aleksy → Aleksie (Aleksy) (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)).
- `printu/vocative-polish-firstname`: komponent PHP do wołacza z listą wyjątków i rozpoznaniem płci, MIT, ostatni push 08.05.2019 ([GitHub printu/vocative-polish-firstname](https://github.com/printu/vocative-polish-firstname)). Jego `test/imiona.csv` (1707 imion) zgadza się z wołaczem SGJP w 1517 z 1528 wspólnych imion (99,3%); rozbieżności np. Abel → Able, Pola → Polo (SGJP Polu), Sewer → Sewerze (SGJP Sewrze) (obliczenia własne).
- `taurit/PolishNameFlection`: .NET, MIT, zarchiwizowane 12.02.2022; README: jedyną obsługiwaną zmianą jest mianownik na dopełniacz ([GitHub taurit/PolishNameFlection](https://github.com/taurit/PolishNameFlection)). Jego `KnownNames-vocative.csv` zgadza się z SGJP w 1380 z 1519 imion (90,8%) i zawiera literówki (Adam → „Admie”, Ananiasz → „Amaniaszu'';l”) (obliczenia własne).
- `MihalMakulski/odmiana-imion-w-polsce`: JSON z odmianą imion występujących w PESEL co najmniej 1000 razy (stan ze stycznia 2024), odmiana pobrana z serwisu odmiana.net; repo bez licencji ([readme](https://github.com/MihalMakulski/odmiana-imion-w-polsce)).
- `morfologik/morfologik-stemming` ma licencję BSD-3-Clause według API GitHuba, ostatni push 10.06.2026 ([GitHub morfologik-stemming](https://github.com/morfologik/morfologik-stemming)).
- Wikisłownik: hasło „Halina” ma szablon `odmiana-rzeczownik-polski` z 14 formami (7 przypadków w l. poj. i mn.) ([pl.wiktionary.org, Halina](https://pl.wiktionary.org/wiki/Halina)); zrzut `plwiktionary-latest-pages-articles.xml.bz2` ma 163 984 727 B, data 01.10.2026 ([dumps.wikimedia.org](https://dumps.wikimedia.org/plwiktionary/latest/)); tekst zrzutów jest na GFDL i CC BY-SA 4.0 ([Wikimedia dumps, legal](https://dumps.wikimedia.org/legal.html)).
- Poradnie: strony Rady Języka Polskiego mają stopkę „2026 © Copyright by Rada Języka Polskiego PAN” bez osobnych warunków ponownego użycia ([RJP, Czy odmieniać nazwiska?](https://rjp.pan.pl/czy-odmieniac-nazwiska/)); strony SJP/Poradni PWN mają stopkę „(©) 1997 - 2026 PWN” ([PWN, zasady §63](https://sjp.pwn.pl/zasady/241-63-Odmiana-i-pisownia-nazwisk-zenskich;629613.html)).
- Listy imion i nazwisk z rejestru PESEL publikuje Ministerstwo Cyfryzacji na portalu dane.gov.pl ([gov.pl, „Nowak znowu pierwszy”](https://www.gov.pl/web/cyfryzacja/nowak-znowu-pierwszy)).

### Inferences
- Pisanie własnego modułu w TS (słownik + reguły albo zgadywacz końcówkowy, pkt 4) jest prostsze i lżejsze niż przenoszenie którejkolwiek z tych bibliotek; repozytoria printu i taurit przydają się głównie jako dodatkowe listy testowe.
- Danych z odmiana.net (przez repo MihalMakulski) nie wolno brać do publicznego repo: brak licencji repo i nieznane prawa do źródła.
- Wikisłownik nadaje się najwyżej do ręcznego sprawdzania pojedynczych imion; wyciąg tabel w repo byłby objęty CC BY-SA (share-alike), a SGJP daje to samo na BSD.
- Porady RJP i PWN są chronione prawem autorskim, więc w repo i w grze można korzystać z reguł (fakty), ale nie kopiować tekstu porad.

### Gaps
- Nie sprawdziłem, czy słownik Morfologika (`polish.dict`) ma znaczniki imion i nazwisk ani skąd dokładnie pochodzą jego dane.
- Nie znalazłem portu Morfeusza do WebAssembly; wyszukiwarka npm dla „morfeusz” zwraca tylko dwa pakiety natywne.
- Nie pobierałem list PESEL (dane.gov.pl nie było na liście dozwolonych źródeł pobierania); nie sprawdzałem ich licencji ani formatu.

## 4. Reguły odmiany imion: zwarty algorytm, wyjątki, jak często zawodzi

### Takeaway
Zestaw kilkunastu reguł opartych na zakończeniu imienia i płci postaci daje poprawny cały paradygmat dla 95,4% z 3161 imion SGJP, a z sześcioma krótkimi listami wyjątków 97,8% i 100% dla 100 najpopularniejszych imion. Zgadywacz uczony na SGJP (najdłuższy wspólny sufiks, 75 wzorców odmiany) daje 96,5% w teście leave-one-out i myli się w innych miejscach niż reguły, więc zgodność obu metod jest dobrym sygnałem pewności.

### Cited Findings
- Algorytm (implementacja w `reguly.py`, wejście: imię w mianowniku i płeć postaci). Kolejność sprawdzania:
  - Kobieta, imię nie na `-a`: nieodmienne. W SGJP tak są opisane Rut, Miriam, Carmen, Noemi, Beatrycze ([sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)), a w PoliMorfie Nicole ([polimorf-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/polimorf-20260823.tab.gz)).
  - Imię na `-a` (kobiety oraz mężczyźni typu Kuba, Barnaba, Kosma, Bonawentura odmieniani w l. poj. tak samo, SGJP): temat T = imię bez `-a`; B. = T+ę, N. = T+ą zawsze.
    - `-ia` po n, s, z, c (Ania, Basia, Zosia, Madzia, Sonia): D.=C.=Ms. = T (Ani), W. = T+u (Aniu). Wyjątek: dłuższe imiona z listy (Stefania, Eugenia, Melania, Apolonia, Leonia, Antonia, Sydonia, Wirginia, Ifigenia, Epifania, Herminia, Milenia, Petronia, Polihymnia) mają D. -nii, W. -nio. W SGJP 38 imion na `-nia` ma D. `-ni`, 13 ma `-nii` (Leonia ma oba).
    - `-ia` po innej spółgłosce (Natalia, Julia, Klaudia, Lidia, Wiktoria, Oliwia): D.=C.=Ms. = T+i (Natalii), W. = T+o.
    - `-ea` (Lea, Salomea, Amadea): D.=C.=Ms. = T+i (Lei), W. T+o.
    - `-ja` po samogłosce (Maja, Zoja): D.=C.=Ms. = T bez j + i (Mai), W. Majo (SGJP też Maju); `-ja` po spółgłosce (Lucja, Alicja): Lucji, W. Lucjo.
    - `-la`: D.=C.=Ms. = T+i (Oli, Urszuli); W. `-u` dla krótkich zdrobnień (Olu, Alu, Elu), `-o` dla pełnych imion (Urszulo, Kamilo). W SGJP 54 imiona na `-la` mają W. `-o`, 21 `-u`; heurystyka „do 4 liter → -u” myli się dla Poli, Fabioli, Lucjoli.
    - `-ka`, `-ga`: D. T+i (Kingi, Agnieszki), C.=Ms. z wymianą k→ce, g→dze (Kindze, Agnieszce, Oldze, Jadwidze), W. T+o.
    - po cz, sz, rz, ż, c, dz, dż: D.=C.=Ms. = T+y (Zawiszy), W. T+o.
    - pozostałe (twarde): D. T+y (Haliny, Marty), C.=Ms. z wymianą: t→cie (Marcie, Danucie), d→dzie (Magdzie), r→rze (Aleksandrze), ł→le, st→ście, zd→ździe, sł→śle, sn→śnie, inaczej +ie (Halinie, Ewie, Izie, Teresie); W. T+o.
  - Mężczyzna na `-y`/`-i` po spółgłosce (Jerzy, Antoni, Ignacy, Ksawery, Bazyli): odmiana przymiotnikowa: D.=B. Jerzego, Antoniego, Bazylego; C. -emu; N.=Ms. = imię+m (Jerzym, Antonim); W. = M.
  - Mężczyzna na `-o`: lista „+n” (Bruno, Hugo, Iwo, Otto, Gwido, Cycero, Kato, Plato) → Brunona, Brunonowi, Brunonem, Brunonie, W. Bruno; `-io` (Franio, Kazio) → Frania, Franiowi, Franiem, Franiu; `-ko` (Mieszko, Zbyszko) → Mieszka, Mieszkowi, Mieszkiem, Mieszku, W. Mieszku; reszta (Diego, Alberto, Ado) → temat bez `-o` (Ada, Adowi, Adzie), W. = M. W SGJP 99 ze 109 męskich imion na `-o` ma D. „bez -o + a”, 8 ma „+na”, 2 są nieodmienne.
  - Mężczyzna na inną samogłoskę: nieodmienne (René, Jose); wyjątki przymiotnikowe Noe, Jozue, Rene, Charlie (Noego, Noemu, Noem). W SGJP 19 takich imion dzieli się na: 7 przymiotnikowych, 6 nieodmiennych, 6 z apostrofem (George'a, Pierre'a).
  - Mężczyzna na spółgłoskę: temat O = imię z poprawkami:
    - e ruchome w `-ek` (od 5 liter): Marek → Mark-, Jacek, Leszek, Franek, Antek; jeśli przed `-ek` stoi si/zi/ci/ni/dzi, to ś/ź/ć/ń/dź: Wiesiek → Wieśka, Zdzisiek → Zdziśka, Heniek → Heńka. W SGJP 187 z 204 imion na `-ek` ma e ruchome, pozostałe 17 to warianty ze zmiękczeniem (Adasiek → Adaśka, Krzysiek → Krzyśka), które reguła też obsługuje.
    - `-eł` → `-ł` (Paweł → Pawła, Gaweł).
    - `-er`: e ruchome tylko z listy (Aleksander, Kacper, Kasper, Leander, Sewer, Sylwester); w SGJP 27 imion na spółgłoskę+er go nie ma (Oliwer, Walter, Peter, Roger, Homer, Prosper).
    - `-niec` → `-ńc` (Wawrzyniec → Wawrzyńca); Lew → Lwa.
    - ó → o przed ostatnią spółgłoską w staropolskich imionach (Mściwój → Mściwoja, Chwalibóg → Chwaliboga).
    - końcowe ś, ć, ź, ń, dź → si, ci, zi, ni, dzi przed końcówką (Staś → Stasia, Stasiowi, Stasiem, Stasiu).
    - Końcówki: D.=B. O+a (Marka, Pawła), C. O+owi, N. O+em, a po k/g O+iem (Markiem, Olegiem); Ms. po k, g, ch, h i spółgłoskach funkcjonalnie miękkich (sz, cz, rz, ż, c, dz, dż, l, j, i) = O+u (Marku, Henryku, Wojciechu, Tomaszu, Grzegorzu, Kamilu, Macieju); po twardych wymiana + e: t→cie (Robercie), d→dzie (Dawidzie, Ryszardzie), r→rze (Igorze, Piotrze), ł→le (Pawle, Michale), st→ście (Erneście), inaczej +ie (Adamie, Jakubie, Zbigniewie, Janie, Józefie, Feliksie); W. = Ms.
  Wszystkie przykłady i liczby powyżej: obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz).
- Wołacz imion żeńskich: „Imiona żeńskie mogą w wołaczu mieć końcówki -o lub -u”; `-u` dostają zdrobnienia o temacie na spółgłoskę miękką oraz l (Zosiu, Madziu, Jolu), inne `-o` (Dario, Sylwio) (dr Jan Grzenia, [Poradnia PWN, „wołacz od imion żeńskich”](https://sjp.pwn.pl/poradnia/haslo/wolacz-od-imion-zenskich;10706.html)).
- Współcześnie wołacz imienia jest silnie wypierany przez mianownik („Cześć, Kasia”), ale po „pan/pani” wołacz jest wymagany („pani Aniu”) (dr hab. Adam Wolański, [Poradnia PWN, „Imiona w wołaczu”](https://sjp.pwn.pl/poradnia/haslo/imiona-w-wolaczu;22802.html)).
- Skuteczność reguł bez list wyjątków (pierwsza wersja), na 3161 jednowyrazowych imionach SGJP (m1 2017, f 1144): cały paradygmat poprawny 95,4% (kobiety 97,5%, mężczyźni 94,3%); per przypadek: D. 96,6%, C. 96,3%, B. 97,3%, N. 97,4%, Ms. 96,2%, W. 97,3%. Na 100 najpopularniejszych imionach: 99/100 (błąd: Stefania). Na 1516 imionach z listy printu obecnych w SGJP: 97,5%. Najczęstsze zakończenia błędów: `-ia` f (13), `-lo` m (12), `-ko` m (11), `-ek` m (8), `-la` f (7) (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)).
- Z listami wyjątków (druga wersja, jak w algorytmie wyżej): 97,8% całych paradygmatów (kobiety 99,0%, mężczyźni 97,1%), 100/100 popularnych, 99,5% z 1516 imion listy printu. Pozostałe błędy to głównie obce imiona: zakończenia `-ek` (8), `-la` f (7), `-ua` (5), `-lo`, `-co`, `-eo`, `-th`, `-el` (Abel → SGJP Abla) (obliczenia własne, tamże). Listy wyjątków dobierałem na tych samych danych, więc dla imion spoza SGJP realny wynik będzie bliżej pierwszej wersji.
- Zgadywacz końcówkowy (dla każdego imienia z SGJP zapisany wzorzec: ile liter uciąć i co dokleić w każdym z 7 przypadków; dla nowego imienia szukany najdłuższy wspólny sufiks do 6 liter wśród imion tej samej płci i wybierany najczęstszy wzorzec): 75 różnych wzorców; test leave-one-out 96,5% całych paradygmatów (D. 97,5%, C. 97,3%, B. 98,3%, N. 98,6%, Ms. 97,5%, W. 97,7%); 100/100 popularnych; 97,8% z listy printu. Po przycięciu sufiksów, które nie zmieniają decyzji względem krótszego sufiksu, indeks ma 146 wpisów dla mężczyzn i 78 dla kobiet (obliczenia własne, tamże).
- Reguły (druga wersja) i zgadywacz mylą się w innych imionach: oba źle w 31 z 3161, tylko reguły dobrze w 80, tylko zgadywacz dobrze w 39 (obliczenia własne, tamże).

### Inferences
- Dla części (b) proponuję: najpierw słownik (wyciąg SGJP), potem reguły; gdy reguły i zgadywacz dają ten sam paradygmat, przyjąć go bez pytania (błąd nie większy niż ok. 1% według powyższych liczb), a gdy się różnią, pokazać graczowi tabelkę z wynikiem reguł i wariantem zgadywacza do poprawienia.
- Najwięcej niepewności generują: imiona obce (szczególnie męskie na `-o`, `-e`, `-y` i żeńskie na spółgłoskę), wołacz na `-la` (Olu/Kamilo), `-nia` (Ani/Stefanii) i męskie `-er` (Kacpra/Oliwera). W UI korekty warto pokazywać przede wszystkim D. i W., bo z nich wynika reszta.
- Gra zna płeć postaci, a od niej zależy cała ścieżka; imię wpisane bez płci (np. Kuba, Nikola, Sasha) trzeba rozstrzygać płcią postaci, nie zakończeniem.
- Ponieważ wołacz bywa zastępowany mianownikiem, szablony typu „pani Halino!” powinny brać wołacz (po „pani” jest wymagany), a dialogi potoczne mogą mieć mianownik.
- Zgadywacz to kilka KB danych (224 przycięte sufiksy + 75 wzorców) i da się go wygenerować skryptem z SGJP przy buildzie; reguły to ok. 150 linii kodu. Obie rzeczy są deterministyczne i nadają się do symulacji w Node.

### Gaps
- Nie mierzyłem skuteczności na imionach ważonych częstością nadawania (brak listy PESEL z liczbami w pobranych danych); lista 100 popularnych z repo taurit nie ma liczb ani opisu źródła.
- Nie znalazłem źródła normatywnego opisującego cały algorytm dla imion; reguły są wyprowadzone z danych SGJP, a normatywnie potwierdzony jest tylko wołacz żeński i tendencja do mianownika (Poradnia PWN).
- Nie badałem liczby mnogiej („państwo Kowalscy”, „Nowakowie”); dane SGJP ją mają, wyciąg na razie ją pomija.

## 5. Reguły odmiany nazwisk (-ski/-ska, -ak, -ek, Nowak, Kowal, żeńskie spółgłoskowe)

### Takeaway
Nazwiska odmienia się prościej niż imiona: męskie przymiotnikowe (-ski, -cki, -y) i rzeczownikowe na spółgłoskę według tych samych reguł co imiona, żeńskie na -a przymiotnikowo albo jak rzeczownik, a żeńskie na spółgłoskę nie odmieniają się wcale. Reguły dają 97,9% (m) i 98,1% (f) poprawnych paradygmatów na 95 tys. nazwisk SGJP, a zgadywacz końcówkowy 99,1% i 99,2%; największe ryzyko to e ruchome i wymiany w pojedynczych nazwiskach (Wróbel → Wróbla, Mróz → Mroza, Marzec → Marca).

### Cited Findings
- „Odmieniają się tylko nazwiska kobiet zakończone na -a”; nazwiska na -ewa, -owa, -ová, -tna odmieniają się jak przymiotniki (Cwietajewej, Navrátilovej, Novotnej), a pozostałe żeńskie na -a jak rzeczowniki pospolite o podobnym zakończeniu (Masina → Masinie, jak kalina; Fonda → Fondzie, jak sonda) ([PWN, Zasady pisowni §63](https://sjp.pwn.pl/zasady/241-63-Odmiana-i-pisownia-nazwisk-zenskich;629613.html)).
- Rada Języka Polskiego: nazwiska należy odmieniać; nazwiska żeńskie spółgłoskowe się nie odmieniają; męskie na -o, -e, -y, -i (ale nie -ski, -cki, -dzki) przy imieniu lub tytule mogą w mniej starannej odmianie zostać w mianowniku („Zaprosił ministra Kołodko”), choć odmiana też jest poprawna ([RJP, „Czy odmieniać nazwiska?”](https://rjp.pan.pl/czy-odmieniac-nazwiska/)).
- SGJP opisuje nazwiska parami: Kowalski m1 przymiotnikowo (Kowalskiego, Kowalskiemu, Kowalskim, W. Kowalski), Kowalska f przymiotnikowo (Kowalskiej, Kowalską, W. Kowalska), Nowak m1 rzeczownikowo (Nowaka, Nowakowi, Nowakiem, Nowaku), a żeńskie Nowak, Marek, Wróbel, Kowalczyk, Stępień jako nieodmienne; istnieje też żeńskie nieodmienne „Kowalski” (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)).
- Inne częste nazwiska w SGJP: Kaczmarek → Kaczmarka, Kaczmarkiem, Kaczmarku; Wieczorek → Wieczorka; Wójcik → Wójcika, Wójciku; Mazur → Mazura, Mazurze; Zając → Zająca, Zającu; Król → Króla (bez wymiany ó); Mróz → Mroza (z wymianą); Wróbel → Wróbla, Wróblu; Kozieł → Kozieła (bez e ruchomego); Kopeć → Kopcia; Kwiecień → Kwietnia; Marzec → Marca; Niemiec → Niemca; Lange → Langego (przymiotnikowo); Dubois nieodmienne; Picasso → Picassa (obliczenia własne, tamże).
- Reguły nazwisk (implementacja w `nazwiska.py`):
  - mężczyzna: `-ski/-cki/-dzki` i `-y/-i` po spółgłosce przymiotnikowo (Kowalskiego, Białego, Przychodniego); `-e` po spółgłosce przymiotnikowo (Lange → Langego, Handke → Handkego); `-a` jak rzeczownik na -a (Sikora → Sikory, Sikorze; Kania → Kani); `-o` jak rzeczownik na -a z W. = M. (w SGJP: Kościuszko → Kościuszki, Kościuszce, Kościuszkę; Fredro → Fredry, Fredrze; Matejko → Matejki; żeńskie Kościuszko, Fredro nieodmienne); `-io` → temat bez -o (Kusio → Kusia); `-iec` → e ruchome ze zmiękczeniem (Niemiec → Niemca, Misiec → Miśca); spółgłoska jak imiona męskie, w tym e ruchome w `-ek` (Kaczmarek → Kaczmarka), ale bez wymiany ó → o;
  - kobieta: `-ska/-cka/-dzka` i długie `-owa/-ewa` przymiotnikowo (Kowalskiej, Kowalską, W. Kowalska); inne `-a` jak rzeczownik (Sowa → Sowy, Sowie); wszystko inne nieodmienne (Nowak).
- Skuteczność reguł na jednowyrazowych nazwiskach SGJP: mężczyźni 46 773 z 47 767 (97,9%), kobiety 46 478 z 47 400 (98,1%). Pierwsza, prostsza wersja reguł (bez `-e`, `-iec`, `-io`) dawała u mężczyzn 96,6%. Najczęstsze zakończenia błędów: męskie `-ia` (156, głównie W. Kanio/Kaniu), `-ów` (112, wymiana ó), `-el` (53, e ruchome), `-tz`, `-la`, `-ec`; żeńskie `-na` (372, przymiotnikowe typu Konieczna, Zawrotna), `-ia` (161), `-ka` (150), `-ta`, `-ła`, `-wa` (obliczenia własne, tamże).
- Na 287 najczęstszych nazwiskach z listy taurit (z liczbą nosicieli, np. Nowak 220 217, Kowalski 131 940, Wiśniewski 104 418, Dąbrowski 92 945 ([KnownFamilyNames.csv](https://github.com/taurit/PolishNameFlection))): reguły poprawne dla 272 z 284 form męskich (95,8%; ważone liczbą nosicieli 97,9%) i 280 z 282 żeńskich (99,3%; ważone 99,5%). Błędy męskie: Wróbel, Mróz, Kania (W.), Kopeć, Kozieł, Kwiecień, Marzec, Zola (W.), Picasso, Dubois, Hugo, Łesiów; żeńskie: Kania (W.), Konieczna (obliczenia własne na [sgjp-20260823.tab.gz](http://download.sgjp.pl/morfeusz/20260823/sgjp-20260823.tab.gz)).
- Zgadywacz końcówkowy na nazwiskach SGJP (leave-one-out): mężczyźni 99,1%, kobiety 99,2%; 164 wzorce męskie i 27 żeńskich; po przycięciu indeks ma 619 sufiksów męskich i 411 żeńskich (obliczenia własne, tamże).

### Inferences
- W generatorze nazwisko rodziny najlepiej losować w formie męskiej i z niej wyprowadzać żeńską (Kowalski → Kowalska, Konieczny → Konieczna, Nowak → Nowak nieodmienne); wtedy typ odmiany żeńskiej jest znany i znika główne źródło błędów (`-na`, `-ta`, `-ła`).
- Dla kilkuset najczęstszych nazwisk wystarczy wyciąg słownikowy (15 KB po gzip dla 287 nazwisk w obu płciach); reguły lub zgadywacz są potrzebne tylko dla nazwisk wpisanych przez gracza.
- Przy nazwisku wpisanym przez gracza warto zapytać o płeć i, dla kobiety z nazwiskiem na `-na/-ta/-ła/-wa`, pokazać od razu oba warianty (Konieczna → Koniecznej albo Koniecznie), bo bez formy męskiej nie da się tego rozstrzygnąć.
- Męskie nazwiska na `-o/-e/-y/-i` można w razie wątpliwości zostawić w mianowniku po imieniu („u Jana Kołodko”), co RJP uznaje za dopuszczalne w mniej starannej odmianie; dla -ski/-cki nie wolno.

### Gaps
- Nie sprawdzałem nazwisk dwuczłonowych (Korwin-Piotrowski). Według streszczenia wyszukiwarki artykuł na prawo.pl podaje, że spółgłoskowy człon żeńskiego nazwiska dwuczłonowego zostaje nieodmienny (Załuskiej-Broniarz), ale nie czytałem go w całości ani nie znalazłem tego w źródle normatywnym.
- Lista taurit ma 287 nazwisk; do większej listy z liczbami (np. 1000 najczęstszych) potrzebne są dane PESEL z dane.gov.pl, których nie pobierałem.
- Nie badałem form „państwo Kowalscy”, „Nowakowie”, „u Kowalskich” (liczba mnoga), choć SGJP je ma (np. Kowalscy, Nowakowie, Kubowie w pliku).
