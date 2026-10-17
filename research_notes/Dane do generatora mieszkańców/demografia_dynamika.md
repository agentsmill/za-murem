# Dynamika demograficzna Polski 2026–2051: dane do starzenia wygenerowanych mieszkańców

Notatki do generatora mieszkańców gry „Za Murem”. Stan wiedzy na 17.10.2026. Wszystkie surowe pliki leżą w `/Users/mpawelczuk/Post-pixel/dane-surowe/demografia/`, każde źródło w osobnym katalogu (pełna tabela plików w ostatniej sekcji). Liczby podaję z rokiem odniesienia i datą publikacji. Wszystko to są agregaty (bez danych osobowych).

## 1. Umieralność: tablice trwania życia GUS

### Takeaway
Najnowsza jest „Tablica trwania życia w 2025 r.” (GUS, opublikowana 27.07.2026): qx dla pojedynczych lat wieku 0–100, osobno mężczyźni i kobiety, Polska ogółem, miasta i wieś. Dla województw i podregionów GUS daje tylko e(x) w wieku 0, 15, 30, 45, 60, nie qx. Rzeczywiste trwanie życia w 2025 r. (M 75,37, K 82,48) jest już na poziomie, który średni scenariusz prognozy zakładał dopiero na 2030 r.

### Cited Findings
- Publikacja „Trwanie życia w 2025 r.” ukazała się 27.07.2026; zawiera Tablicę A (tablica trwania życia wg płci i wieku, osobno miasta i wieś), Tablicę B (e(x) wg województw), Tablicę C (e(x) wg podregionów), Tablicę D (obie płcie łącznie). ([GUS, Trwanie życia w 2025 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/trwanie-zycia/trwanie-zycia-w-2025-r-,2,20.html))
- Tablica A ma kolumny x, qx, lx, dx, Lx, Tx, ex, dla wieku 0–100, w sześciu arkuszach: mężczyźni ogółem, kobiety ogółem, miasta M, miasta K, wieś M, wieś K. ([plik XLSX](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5470/2/20/1/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx))
- Przeciętne trwanie życia noworodka w 2025 r.: mężczyźni 75,37, kobiety 82,48; miasta M 75,67, K 82,50; wieś M 74,88, K 82,39; obie płcie 78,82. ([GUS, Tablica A i D 2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/trwanie-zycia/trwanie-zycia-w-2025-r-,2,20.html))
- Prawdopodobieństwo zgonu w ciągu roku qx w 2025 r. (z Tablicy A, zaokrąglone do 4 miejsc):

| wiek | M ogółem | K ogółem | M miasta | K miasta | M wieś | K wieś |
|---|---|---|---|---|---|---|
| 0 | 0,0033 | 0,0032 | 0,0031 | 0,0033 | 0,0037 | 0,0029 |
| 30 | 0,0012 | 0,0004 | 0,0011 | 0,0004 | 0,0013 | 0,0003 |
| 50 | 0,0053 | 0,0020 | 0,0053 | 0,0021 | 0,0053 | 0,0018 |
| 60 | 0,0131 | 0,0054 | 0,0129 | 0,0056 | 0,0134 | 0,0052 |
| 65 | 0,0210 | 0,0092 | 0,0206 | 0,0094 | 0,0216 | 0,0088 |
| 70 | 0,0308 | 0,0148 | 0,0301 | 0,0149 | 0,0319 | 0,0146 |
| 75 | 0,0439 | 0,0244 | 0,0427 | 0,0241 | 0,0463 | 0,0251 |
| 80 | 0,0663 | 0,0420 | 0,0635 | 0,0408 | 0,0717 | 0,0446 |
| 85 | 0,1079 | 0,0773 | 0,1024 | 0,0738 | 0,1189 | 0,0845 |
| 90 | 0,1690 | 0,1382 | 0,1605 | 0,1309 | 0,1867 | 0,1531 |
| 95 | 0,2412 | 0,2197 | 0,2300 | 0,2084 | 0,2644 | 0,2425 |
| 100 | 0,3216 | 0,3147 | 0,3093 | 0,3012 | 0,3461 | 0,3404 |

([GUS, Tablica A 2025](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5470/2/20/1/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx))

- Prawdopodobieństwo zgonu w ciągu 5 lat (5qx = 1 − l(x+5)/l(x)), policzone przeze mnie z kolumny lx Tablicy A 2025, Polska ogółem:

| grupa wieku | M | K |
|---|---|---|
| 0–4 | 0,0041 | 0,0037 |
| 15–19 | 0,0018 | 0,0008 |
| 20–24 | 0,0034 | 0,0012 |
| 25–29 | 0,0047 | 0,0015 |
| 30–34 | 0,0068 | 0,0023 |
| 35–39 | 0,0102 | 0,0034 |
| 40–44 | 0,0142 | 0,0048 |
| 45–49 | 0,0203 | 0,0074 |
| 50–54 | 0,0319 | 0,0121 |
| 55–59 | 0,0498 | 0,0200 |
| 60–64 | 0,0775 | 0,0335 |
| 65–69 | 0,1183 | 0,0548 |
| 70–74 | 0,1656 | 0,0876 |
| 75–79 | 0,2336 | 0,1439 |
| 80–84 | 0,3445 | 0,2430 |
| 85–89 | 0,5061 | 0,4098 |
| 90–94 | 0,6665 | 0,6048 |
| 95–99 | 0,7976 | 0,7748 |

Dla wsi 5qx w starszym wieku jest wyższe niż w miastach, np. M 80–84: wieś 0,3709, miasta 0,3307; K 85–89: wieś 0,4423, miasta 0,3933. ([GUS, Tablica A 2025](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5470/2/20/1/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx))

- Szansa przeżycia 25 lat (2026→2051) przy stałej umieralności z 2025 r., l(x+25)/l(x), moje obliczenie: mężczyźni 20→45: 0,961; 30→55: 0,919; 40→65: 0,820; 50→75: 0,624; 55→80: 0,494; 60→85: 0,341; 65→90: 0,183; 70→95: 0,069; 75→100: 0,017. Kobiety: 20→45: 0,987; 30→55: 0,970; 40→65: 0,924; 50→75: 0,807; 55→80: 0,699; 60→85: 0,540; 65→90: 0,330; 70→95: 0,138; 75→100: 0,034. ([GUS, Tablica A 2025](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5470/2/20/1/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx))
- e(0) wg województw w 2025 r.: mężczyźni od 73,89 (łódzkie) do 77,06 (podkarpackie), kobiety od 81,36 (łódzkie) do 84,17 (podkarpackie); pomorskie M 75,93, K 82,23; mazowieckie M 75,66, K 82,79; śląskie M 74,87, K 81,77. ([GUS, Tablica B 2025](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5470/2/20/1/tablica_b_srednie_dalsze_trwanie_zycia_wedlug_wojewodztw_w_2025_r..xlsx))
- GUS publikuje też tablice historyczne: pełne tablice trwania życia 1990–2024, e(x) 1950–2024 i e(0) miasto/wieś 1990–2024 (aktualizacja 30.07.2025). ([GUS, Trwanie życia, tablice historyczne](https://stat.gov.pl/obszary-tematyczne/ludnosc/trwanie-zycia/trwanie-zycia-tablice-historyczne,1,3.html))
- Trend e(0): mężczyźni 2000: 69,7; 2010: 72,1; 2019: 74,07; 2021: 71,8 (COVID); 2023: 74,7; 2024: 74,93; 2025: 75,37. Kobiety 2000: 78,0; 2010: 80,6; 2019: 81,75; 2021: 79,7; 2024: 82,26; 2025: 82,48. Zgonów w 2025 r. było 405,7 tys. ([GUS, Sytuacja demograficzna Polski do 2025 r., tabl. 1A](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html); [GUS, Symulacja liczby ludności do 2060 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/symulacja-liczby-ludnosci-do-2060-r-opracowanie-eksperymentalne,17,1.html))
- Założenia prognozy GUS 2023–2060 co do e(0), scenariusz średni: M 2030: 75,16; 2040: 76,35; 2050: 77,55; 2060: 78,63. K: 82,49; 83,47; 84,34; 85,14. Wysoki: M 75,86 / 77,64 / 79,42 / 81,29; K 83,18 / 84,57 / 85,92 / 87,19. Niski: M 74,38 / 75,07 / 75,60 / 75,87; K 81,81 / 82,38 / 82,77 / 83,08. Żaden scenariusz nie zakłada spadku trwania życia. ([GUS, Prognoza ludności na lata 2023–2060, tabl. 3](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- GUS w listopadzie 2025 r. stwierdził, że trwanie życia przewyższyło wskaźniki założone w głównym scenariuszu prognozy, i w symulacji eksperymentalnej użył wysokiego wariantu e(0). ([GUS, Symulacja liczby ludności do 2060 r., 06.11.2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/symulacja-liczby-ludnosci-do-2060-r-opracowanie-eksperymentalne,17,1.html))
- Niespójność w danych GUS: w arkuszu „Tablica 1B, miasta” publikacji „Sytuacja demograficzna Polski do 2025 r.” e(0) mężczyzn w miastach w 2025 r. wynosi 72,95, a w Tablicy A trwania życia 2025 r. 75,67. Druga wartość pasuje do e(0) ogółem (75,37) i wsi (74,88), więc pierwsza wygląda na błąd w tabeli. ([GUS, Sytuacja demograficzna do 2025, XLSX](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5468/40/6/1/sytuacjademograficznapolskido2025.xlsx); [GUS, Tablica A 2025](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5470/2/20/1/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx))

### Inferences
- Do kroku 5-letniego najprościej wziąć 5qx z tabeli wyżej (wg płci, opcjonalnie miasto/wieś) i co krok obniżać je o stały procent, tak żeby e(0) szło ścieżką średniego albo wysokiego scenariusza GUS. Między 2025 a 2050 r. średni scenariusz daje mężczyznom około +2,2 roku e(0), kobietom około +1,9 roku; ponieważ rok 2025 już jest na poziomie scenariusza średniego z 2030, bazą „bez upadku” bliżej rzeczywistości jest ścieżka między średnim a wysokim.
- Dla mieszkańca, który w 2026 r. ma 60 lat, szansa dożycia 2051 r. wynosi około 34% u mężczyzn i 54% u kobiet (przy umieralności z 2025 r., bez poprawy). To główny powód, dla którego w 2051 r. na osiedlu będzie dużo samotnych wdów.
- Rozdzielenie miasto/wieś zmienia wyniki niewiele (e(0) różni się o 0,8 roku u mężczyzn i 0,1 roku u kobiet), różnica rośnie dopiero po 80. roku życia. Dla gry miejskiej (Przymorze, Gdańsk) wystarczą arkusze „Miasta M/K”.

### Gaps
- GUS nie publikuje qx dla pojedynczych lat wieku na poziomie województw, powiatów ani miast; jest tylko e(x) dla wybranych wieków. Gdańsk trzeba przybliżać tablicą dla miast albo przeskalować do e(0) pomorskiego.
- Prognoza GUS nie publikuje przyszłych tablic qx, tylko e(0) w wybranych latach; współczynniki poprawy umieralności według wieku trzeba założyć samemu.

## 2. Płodność, bezdzietność i wielkość rodzin

### Takeaway
Dzietność w Polsce spada szybciej, niż zakładał nawet niski scenariusz prognozy: TFR 2024 = 1,099, a 2025 = 1,068 (ponad 238 tys. urodzeń). Duże miasta mają TFR około 1,0 (Warszawa 0,99, Gdańsk 0,98), wieś około 1,15, a przedmieścia (powiat gdański, warszawskie obwarzanki) 1,25–1,40. Bezdzietność definitywna kobiet rośnie z 10,7% (rocznik 1960) do 19,9% (rocznik 1975); rozkładu 0/1/2/3+ dzieci według kohort nie udało się zdobyć z otwartego źródła.

### Cited Findings
- TFR wg GUS: 1990: 1,991; 2000: 1,367; 2005: 1,24; 2010: 1,376; 2015: 1,29; 2017: 1,45; 2020: 1,387; 2021: 1,33; 2022: 1,261; 2023: 1,16; 2024: 1,099; 2025: 1,068 (najniższy w historii). Minimum wcześniejsze: 1,22 w 2003 r. ([GUS, Rocznik Demograficzny 2025, tabl. 76](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html); [GUS, Sytuacja demograficzna Polski do 2025 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html); [GUS, Prognoza 2023–2060](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html); [GUS, Symulacja 2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/symulacja-liczby-ludnosci-do-2060-r-opracowanie-eksperymentalne,17,1.html))
- Urodzenia żywe: 2020: 355,3 tys.; 2022: 305,1 tys.; 2023: 272,5 tys.; 2024: 251,8 tys.; 2025: 238,3 tys. (w korekcie z 29.09.2026: „ponad 238 tys.”, o 13,5 tys. mniej niż rok wcześniej). ([GUS, Sytuacja demograficzna Polski do 2025 r., data publikacji 29.09.2026](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html))
- TFR miasto/wieś: 2024 miasta 1,069, wieś 1,149; 2025 miasta 1,045, wieś 1,108. W 1980 r. było to 1,928 i 2,908. W 2025 r. najwyższe TFR w województwach: mazowieckie 1,155, małopolskie 1,125, wielkopolskie 1,119, podlaskie 1,116, pomorskie 1,107; najniższe w świętokrzyskim i warmińsko-mazurskim. ([GUS, Sytuacja demograficzna Polski do 2025 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html); [GUS, Rocznik Demograficzny 2025, tabl. 76](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html))
- Cząstkowe współczynniki płodności 2024 (urodzenia na 1000 kobiet w grupie wieku), GUS:

| wiek matki | Polska | miasta | wieś | miasta 100 tys.+ |
|---|---|---|---|---|
| 15–19 | 5 | 5 | 4 | 4,1 |
| 20–24 | 28 | 29 | 27 | 24,8 |
| 25–29 | 76 | 70 | 85 | 60,4 |
| 30–34 | 72 | 70 | 75 | 68,7 |
| 35–39 | 32 | 32 | 31 | 34,9 |
| 40–44 | 7 | 7 | 6 | 7,8 |
| 45–49 | 0 | 1 | 0 | 0,6 |
| TFR | 1,099 | 1,069 | 1,149 | 1,000 |

([GUS, Rocznik Demograficzny 2025, tabl. 76 i 78](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5515/3/19/1/rocznik_demograficzny_2025_tablice.zip))
- ASFR 2024 dla pojedynczych lat wieku (Eurostat, na 1 kobietę, wartości szacunkowe): 20: 0,0167; 22: 0,0259; 24: 0,0439; 26: 0,0704; 28: 0,0873; 29: 0,0906; 30: 0,0905; 32: 0,0757; 34: 0,0595; 36: 0,0419; 38: 0,0259; 40: 0,0144; 42: 0,0061; 44: 0,0020. Eurostat liczy TFR 2024 dla Polski na 1,14 (flaga „ep”, szacunek wstępny), GUS na 1,099; różnica wynika z innej bazy ludnościowej. ([Eurostat, demo_frate i demo_find](https://ec.europa.eu/eurostat/databrowser/view/demo_frate/default/table))
- TFR w dużych miastach 2024 (GUS): Warszawa 0,986; Kraków 0,976; Gdańsk 0,978; Gdynia 0,903; Wrocław 0,920; Poznań 0,903; Łódź 1,019; Katowice 0,920; Lublin 1,055; Rzeszów 1,275 (najwyższy wśród miast 100 tys.+); średnio miasta 100 tys.+ 1,000. ([GUS, Rocznik Demograficzny 2025, tabl. 78](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html))
- TFR 2024 wg podregionów NUTS3 (Eurostat): Miasto Warszawa 0,98; warszawski wschodni 1,29; warszawski zachodni 1,27; Miasto Kraków 1,01; krakowski 1,30; nowosądecki 1,38; Trójmiejski 0,99; gdański 1,40; Miasto Poznań 0,93; poznański 1,28; Miasto Wrocław 0,94; wrocławski 1,25; Miasto Łódź 1,03; siedlecki 1,44 (najwyższy); jeleniogórski 0,93. W 2019 r. Trójmiejski miał 1,53, a gdański 1,86. ([Eurostat, demo_r_find3](https://ec.europa.eu/eurostat/databrowser/view/demo_r_find3/default/table))
- Wiek matki: średni wiek przy pierwszym urodzeniu (Eurostat) 2000: 24,5; 2010: 26,5; 2015: 27,0; 2020: 27,9; 2024: 28,7 (UE 29,9). Średni wiek przy każdym urodzeniu 2024: 30,3. Mediana wieku matki przy pierwszym dziecku (GUS) 2024: 29,1 (miasta 29,6, wieś 28,3; matki z wyższym wykształceniem 30,6, z zasadniczym zawodowym 25,0). GUS podaje dla 2025 r. 29,5 roku jako wiek przy pierwszym dziecku. Prognoza zakłada średni wiek rodzenia 30,9 w 2030 r., 31,6 w 2040 r., 31,9 w 2050 r. ([Eurostat, demo_find](https://ec.europa.eu/eurostat/databrowser/view/demo_find/default/table); [GUS, Rocznik Demograficzny 2025, tabl. 74](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html); [GUS, Sytuacja demograficzna do 2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html); [GUS, Prognoza 2023–2060, tabl. 2](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- Struktura urodzeń wg kolejności 2024 (GUS): pierwsze 44,1%, drugie 33,9%, trzecie 12,4%, czwarte i dalsze 6,1%; miasta: 47,6 / 32,4 / 10,6 / 5,3%; wieś: 39,2 / 36,1 / 15,0 / 7,1%. ([GUS, Rocznik Demograficzny 2025, tabl. 57](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html))
- Urodzenia pozamałżeńskie: 2000: 12,1%; 2010: 20,6%; 2024: 28,9% (UE 41,1%). ([Eurostat, demo_find](https://ec.europa.eu/eurostat/databrowser/view/demo_find/default/table))
- Bezdzietność definitywna kobiet wg rocznika urodzenia (OECD Family Database na podstawie Human Fertility Database): 1960: 10,7%; 1963: 13,6%; 1964: 13,4%; 1965: 13,4%; 1970: 16,2%; 1975: 19,9%. Dzietność kohortowa rocznika 1975: 1,671. ([OECD Family Database, SF2.5 Childlessness, XLSX z 09.2024](https://webfs.oecd.org/Els-com/Family_Database/SF_2-5-Childlessness.xlsx); [opis wskaźnika](https://webfs.oecd.org/Els-com/Family_Database/SF_2_5_Childlessness.pdf))
- Skumulowana dzietność kohortowa (GUS, obliczenia Tymicki, Zeman, Holzer-Żelażewska 2018): rocznik 1945 do 49 lat: 2,166; 1950: 2,198; 1955: 2,172; 1960: 2,166; 1965: 2,024; 1970 do 44 lat: 1,805; 1975 do 39 lat: 1,558; 1980 do 34 lat: 1,248. Rocznik 1964 był pierwszym poniżej zastępowalności. Pierwsze urodzenia odłożone są w dużej mierze „odrabiane”, drugie częściowo, trzecie prawie wcale (wskaźnik odrabiania dla rocznika 1974: 65% dla pierwszych i 42% dla drugich urodzeń). ([Tymicki, Zeman, Holzer-Żelażewska, Studia Demograficzne 2(174) 2018](https://econjournals.sgh.waw.pl/SD/article/view/1358))
- Ci sami autorzy ostrzegają, że przez emigrację wskaźniki płodności po 2000 r. mogą być zaniżone nawet o 10%, a wskaźniki dla kohort urodzonych po 1965 r. (zwłaszcza bezdzietność) trzeba traktować ostrożnie. ([Tymicki i in. 2018](https://econjournals.sgh.waw.pl/SD/article/download/1358/1210/2420))
- Prognoza GUS: kohortowy TFR kobiet urodzonych w 1970 r. 1,80; dla rocznika 2010 od 1,22 (niski) przez 1,48 (średni) do 1,74 (wysoki). Rocznik 1970 miał szczyt płodności w wieku 22 lat, rocznik 2010 ma go mieć w wieku 32 lat. Okresowy TFR w scenariuszu średnim: 2030: 1,39; 2040: 1,44; 2050: 1,47; 2060: 1,49; niski: 1,21 / 1,19 / 1,19 / 1,19; wysoki: 1,58 / 1,69 / 1,75 / 1,79. ([GUS, Prognoza 2023–2060, tabl. 1 i wykres 4](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- GUS w symulacji z 06.11.2025 r. przyjął wariant TFR = 1,10 (poziom 2024) do 2060 r. i stwierdził, że dzietność w ostatnich latach była wyraźnie niższa, niż zakładała prognoza z 2023 r. ([GUS, Symulacja liczby ludności do 2060 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/symulacja-liczby-ludnosci-do-2060-r-opracowanie-eksperymentalne,17,1.html))
- Human Fertility Database ma dla Polski dane kohortowe (w tym wg kolejności urodzenia), z zastrzeżeniem o zaniżeniu wskaźników dla roczników po 1965 r. przez emigrację; z mojej wiedzy pobranie danych wymaga darmowej rejestracji konta (nie weryfikowałem tego w tej sesji i konta nie zakładałem). ([HFD, Poland](https://www.humanfertility.org/Country/Country?cntr=POL))

### Inferences
- Dla rocznika 1975: przy TFR kohortowym 1,67 i 19,9% bezdzietnych matka ma średnio około 2,09 dziecka (1,671 / 0,801). To moje wyliczenie, nie gotowy rozkład.
- Przy ASFR z 2024 r. kobieta w wieku 25–29 lat ma w ciągu 5 lat średnio około 0,38 urodzenia (0,076 × 5), w wieku 30–34 około 0,36, w wieku 35–39 około 0,16. W dużym mieście dla 25–29 będzie to około 0,30. To gotowe wagi do losowania urodzeń co krok.
- Prosty generator: najpierw losować „czy w ogóle zostanie rodzicem” (bezdzietność około 20–25% dla roczników 1980–2000 w scenariuszu bez upadku, wyżej w dużym mieście), potem kolejność urodzeń wg rozkładu z 2024 r. (wśród urodzeń 44% pierwsze, 34% drugie, 12% trzecie, 6% dalsze). Liczby dla młodszych roczników są ekstrapolacją trendu z OECD/HFD, nie zmierzonym faktem.
- Rzeczywisty TFR 2025 (1,07) jest niższy niż niski scenariusz GUS (1,21 w 2030 r.), więc „bez upadku” w grze uczciwiej oprzeć na symulacji GUS z TFR 1,10 niż na scenariuszu średnim (1,39).

### Gaps
- Brak otwartego, aktualnego rozkładu kobiet wg liczby urodzonych dzieci (0/1/2/3+) wg rocznika. NSP 2021 nie opublikował takiej tablicy w znalezionych publikacjach; HFD/HFC wymagają rejestracji (konta nie zakładałem). Do zrobienia przez Mateusza: rejestracja w HFD i pobranie tablic kohortowych wg kolejności urodzeń.
- Brak danych o bezdzietności mężczyzn i o bezdzietności wg miasto/wieś lub wielkości miasta.
- Nie znalazłem TFR wg powiatów w otwartych tabelach (jest NUTS3 w Eurostacie i miasta 100 tys.+ w roczniku GUS).

## 3. Oficjalna prognoza GUS 2023–2060 (powiaty, gminy) i prognoza gospodarstw domowych

### Takeaway
Obowiązuje „Prognoza ludności na lata 2023–2060” z 31.08.2023 r. (nowszej oficjalnej prognozy do października 2026 r. nie ma). Po raz pierwszy liczona jest bezpośrednio dla powiatów: płeć × pojedynczy rok wieku × lata 2022–2060, plus urodzenia, zgony i migracje rocznie. Dla gmin (od 23.11.2023, po 2040 r. od 18.07.2024) są grupy 10-letnie. Podziału miasto/wieś w tej edycji nie znalazłem. Rzeczywistość 2025 r. odbiega od prognozy: urodzeń jest o około 19% mniej, zgonów mniej, trwanie życia dłuższe.

### Cited Findings
- Prognoza z 31.08.2023, trzy scenariusze (niski, średni, wysoki), średni wskazany jako główny; metoda kohortowo-składnikowa; nowością jest liczenie prognozy bezpośrednio na poziomie powiatów, spójnie z wynikami kraju. Aneks dla gmin 2023–2040 dodany 23.11.2023 (pierwszy raz status oficjalny), pliki dla gmin 2041–2060 dodane 18.07.2024. ([GUS, Prognoza ludności na lata 2023–2060](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- Pliki: PDF (14,9 MB), Polska XLSX, województwa ZIP (XLSX), powiaty ZIP (397 plików XLSX, po jednym na powiat, 33 MB), tabela zbiorcza XLSX (16 MB; długi format: TERYT powiatu, nazwa, płeć, wiek 0–89 i 90+, ludność 2022–2060, 69 160 wierszy), scenariusze alternatywne ZIP (129 MB, niski i wysoki dla powiatów), gminy ZIP (68 MB, 2 873 pozycje), gminy tablica zbiorcza XLSX (19 MB). Sprawdzone przeze mnie po pobraniu. ([GUS, Prognoza 2023–2060, pliki do pobrania](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- Plik powiatu ma arkusze: Tabl. 1 ludność wg płci i pojedynczych lat wieku (stan 31 XII, 2022 empirycznie, 2023–2060 prognoza), Tabl. 2 grupy 5-letnie, Tabl. 3 grupy ekonomiczne, Tabl. 4 urodzenia, zgony, napływ i odpływ wewnętrzny, imigracja i emigracja rocznie. Plik gminy: grupy 10-letnie wg płci i grupy ekonomiczne; tablica zbiorcza gmin rozróżnia części miejskie, wiejskie i miejsko-wiejskie gmin (kolumna „Typ”). Uwaga na literówki GUS w etykietach: „50-44” zamiast „50-54” (Polska, Tabl. 2) i „50-49” zamiast „50-59” (pliki gmin). ([GUS, pliki prognozy](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- Scenariusz średni, Polska: 37,77 mln (2022), 37,05 mln (2030), 35,26 mln (2040), 33,20 mln (2050), 30,93 mln (2060); 2026: 37,29 mln; 2051: 32,99 mln. Niski: 26,65 mln w 2060, wysoki: 34,80 mln. ([GUS, Prognoza 2023–2060, tabl. 5 i plik Polska](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- Struktura wieku Polski w scenariuszu średnim, moje wyliczenie z pliku Polska: 2026: 0–14: 14,3%; 15–29: 15,4%; 30–44: 21,8%; 45–64: 27,2%; 65–79: 16,8%; 80+: 4,5%. 2051: 13,0 / 13,6 / 18,2 / 25,0 / 21,2 / 9,0%. ([GUS, wyniki Polska XLSX](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5469/11/1/1/2-wyniki_polska.xlsx))
- Przykładowe powiaty 2026→2051 (scenariusz średni, moje wyliczenie z tabeli zbiorczej): m. Gdańsk 489 tys. → 481 tys. (−1,7%), udział 65+ 20,5% → 25,1%, 80+ 4,8% → 6,9%; m.st. Warszawa +1,5%, 65+ 19,4% → 25,3%; m. Kraków +2,6%; m. Poznań −15,5%; m. Częstochowa −27,1%, 65+ 27,2% → 37,2%; powiat gdański (przedmieścia) +15,9%, 65+ 15,0% → 25,0%; bieszczadzki −22,3%, 65+ 22,3% → 35,9%; janowski −25,3%; moniecki −23,9%. ([GUS, tabela zbiorcza](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5469/11/1/1/5-tabela_zbiorcza.xlsx))
- Ruch naturalny w scenariuszu średnim: urodzenia 2025: 294,2 tys.; 2030: 282,8 tys.; 2040: 278,0 tys.; 2050: 268,0 tys.; zgony 2025: 426,3 tys.; 2030: 446,5 tys.; 2045: 507,8 tys. Imigracja na pobyt stały skacze do 124,9 tys. (2027) i 161,6 tys. (2028), bo GUS zakłada, że część obywateli Ukrainy uzyska pobyt stały; potem 30–34 tys. rocznie; emigracja na pobyt stały 10–12 tys. rocznie. ([GUS, wyniki Polska, Tabl. 4](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5469/11/1/1/2-wyniki_polska.xlsx); [GUS, Prognoza 2023–2060, tabl. 4](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-na-lata-2023-2060,11,1.html))
- Rzeczywistość 2025 r.: 238,3 tys. urodzeń (prognoza 294,2 tys.), 405,7 tys. zgonów (prognoza 426,3 tys.), ludność 37,33 mln na 31.12.2025 (prognoza 37,41 mln). ([GUS, Sytuacja demograficzna Polski do 2025 r., tabl. 1A](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html))
- Symulacja eksperymentalna GUS (06.11.2025), modyfikacje scenariusza średniego: niska dzietność (TFR 1,10): 36,7 mln (2030), 34,2 (2040), 31,5 (2050), 28,4 (2060); podwyższone e(0): 37,2 / 35,8 / 34,2 / 32,3; oba naraz: 36,8 / 34,6 / 32,1 / 29,4. GUS zastrzega, że wyniki są eksperymentalne i nie zastępują oficjalnej prognozy. Jest tylko PDF dla Polski, bez powiatów. ([GUS, Symulacja liczby ludności do 2060 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/symulacja-liczby-ludnosci-do-2060-r-opracowanie-eksperymentalne,17,1.html))
- Prognoza ludności rezydującej 2023–2060 (poziom powiatów, 20.12.2023), założenia spójne ze scenariuszem głównym: 32,9 mln rezydentów w 2060 r., 65+ około 30%. Pliki: Polska XLSX, województwa ZIP, powiaty ZIP. ([GUS, Prognoza ludności rezydującej 2023–2060](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-ludnosci-rezydujacej-dla-polski-na-lata-2023-2060-poziom-powiaty,12,1.html))
- Prognoza gospodarstw domowych: najnowsza to „2016–2050” z 27.06.2016, dla Polski i województw z podziałem miasto/wieś, oparta na prognozie ludności 2014–2050. Zakładała 15,0 mln gospodarstw w 2025 r., 15,4 mln w 2030 r. i 13,5 mln w 2050 r.; średnią wielkość 2,50 osoby w 2025 r. i 2,50 w 2050 r. (miasta 2,24, wieś 2,92). ([GUS, Prognoza gospodarstw domowych na lata 2016–2050](https://stat.gov.pl/obszary-tematyczne/ludnosc/prognoza-ludnosci/prognoza-gospodarstw-domowych-na-lata-2016-2050,9,4.html))
- NSP 2021 policzył 12,5 mln gospodarstw domowych (12 516 459). ([GUS, Rodziny w Polsce w świetle wyników NSP 2021, tabl. 3.6](https://stat.gov.pl/spisy-powszechne/nsp-2021/nsp-2021-wyniki-ostateczne/rodziny-w-polsce-w-swietle-wynikow-nsp-2021,7,2.html))

### Inferences
- Dla generatora najwygodniejsza jest tabela zbiorcza powiatów (jeden arkusz, długi format), a dla konkretnego adresu tablica zbiorcza gmin (część miejska/wiejska, ale tylko grupy 10-letnie). Można z niej wziąć docelowe struktury wieku na 2031, 2036, …, 2051 i kalibrować do nich losowanie zgonów, urodzeń i migracji.
- Prognoza gospodarstw domowych z 2016 r. jest już nieaktualna (zakładała 14,5 mln gospodarstw w 2020 r., a spis 2021 policzył 12,5 mln), więc do składu gospodarstw lepiej używać NSP 2021 i EU-SILC (sekcja 5) niż tej prognozy.
- Ponieważ dzietność 2025 r. jest poniżej niskiego scenariusza, a umieralność zbliża się do wysokiego wariantu e(0), najbliższa „linii bazowej bez upadku” jest symulacja GUS „niska dzietność i podwyższone e(0)” (29,4 mln w 2060 r.); powiaty trzeba wtedy przeskalować samemu, bo symulacja nie ma rozbicia terytorialnego.

### Gaps
- Brak podziału miasto/wieś w prognozie 2023–2060 na poziomie powiatów i województw (w plikach są tylko ogółem, mężczyźni, kobiety). Częściowo zastępuje to tablica zbiorcza gmin z typem gminy.
- Brak nowszej prognozy gospodarstw domowych niż 2016–2050; nie znalazłem zapowiedzi nowej edycji.
- Symulacja z 2025 r. istnieje tylko jako PDF z kilkoma liczbami dla Polski.

## 4. Migracje wewnętrzne, emigracja i powroty

### Takeaway
Przeprowadzki są najczęstsze w wieku 25–34 lat (około 13% tej grupy w ciągu 5 lat zmienia meldunek na stały), a główny kierunek to przedmieścia: wieś zyskuje w migracjach wewnętrznych netto około 36–47 tys. osób rocznie (2023–2025), a duże miasta tracą na rzecz wsi, zyskując jednocześnie ludzi z mniejszych miast. Za granicą przebywa długookresowo około 1,51 mln mieszkańców Polski (koniec 2025 r.), szczyt w wieku 30–44 lat. Od 2024 r. widać przewagę powrotów nad wyjazdami w relacjach z Niemcami i Holandią.

### Cited Findings
- Migracje wewnętrzne na pobyt stały: 2023: 416–423 tys.; 2024: 430 tys.; 2025: 404 tys. Migracje międzywojewódzkie to tylko 24,1% przeprowadzek. Wieś ma dodatnie saldo migracji wewnętrznych: +36,1 tys. (2025), +42,4 tys. (2024); w 2024 r. napływ na wieś z miast 144,4 tys., odpływ ze wsi do miast 102,0 tys. Napływ netto do województw tylko w mazowieckim, pomorskim, małopolskim, dolnośląskim i wielkopolskim; największy odpływ z lubelskiego, podkarpackiego, świętokrzyskiego, warmińsko-mazurskiego i śląskiego. ([GUS, Sytuacja demograficzna Polski do 2025 r., rozdz. 2.5](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html); [GUS, Rocznik Demograficzny 2025, dział migracji wewnętrznych, tabl. 1](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html))
- Migracje na pobyt czasowy ponad 3 miesiące: 348,8 tys. w 2025 r. (403,7 tys. w 2022 r.), głównie do miast; saldo czasowe miast +47,1 tys. ([GUS, Sytuacja demograficzna Polski do 2025 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html))
- Migranci wewnętrzni 2024 wg wieku (pobyt stały, GUS): 0–4: 35 032; 20–24: 20 720; 25–29: 56 332; 30–34: 66 984; 35–39: 52 094; 40–44: 36 335; 45–49: 24 789; 50–54: 16 416; 60–64: 11 708; 65–69: 11 982; 70–74: 7 979; 80–84: 2 422; 85+: 3 313. Saldo miast jest dodatnie tylko w wieku 20–34 lat (np. 25–29: +7 152), w pozostałych grupach ujemne (35–39: −7 498, 0–4: −5 644). ([GUS, Rocznik Demograficzny 2025, migracje wewnętrzne tabl. 8](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5515/3/19/1/rocznik_demograficzny_2025_tablice.zip))
- Intensywność migracji wewnętrznych 2024 (moje wyliczenie: migranci wg wieku z rocznika GUS podzieleni przez ludność 2024 z prognozy GUS, więc przybliżenie): 0–4: 22‰ rocznie (około 10,5% w 5 lat); 15–19: 8‰ (4%); 20–24: 12‰ (6%); 25–29: 28‰ (13%); 30–34: 27‰ (13%); 35–39: 18‰ (9%); 40–44: 11‰ (6%); 45–49: 8‰ (4%); 50–59: 5–7‰ (3%); 60–69: 5‰ (2,5%); 70+: 3–4‰ (1,5–2%). ([GUS, Rocznik Demograficzny 2025](https://stat.gov.pl/obszary-tematyczne/roczniki-statystyczne/roczniki-statystyczne/rocznik-demograficzny-2025,3,19.html); [GUS, Prognoza 2023–2060, plik Polska](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5469/11/1/1/2-wyniki_polska.xlsx))
- Miasta 100 tys.+ w 2024 r.: saldo ogółem −8 511, w tym +11 908 z innych miast i −20 419 na rzecz wsi. Warszawa +2 533 (z miast +4 860, ze wsi −2 327), Kraków +2 130, Gdańsk +1 466 (z miast +2 302, ze wsi −836), Wrocław +352, Rzeszów +397; Poznań −1 481 (na wieś −2 633), Łódź −1 437, Bydgoszcz −1 162, Radom −1 105, Gdynia −316. ([GUS, Rocznik Demograficzny 2025, migracje wewnętrzne tabl. 12](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5515/3/19/1/rocznik_demograficzny_2025_tablice.zip))
- GUS udostępnia też serie migracji wewnętrznych wg województw 1974–2025 i wewnątrzwojewódzkich wg kierunków (miasto/wieś) 1998–2025. ([GUS, Migracje wewnętrzne wg województw 1974–2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/migracje-wewnetrzne-ludnosci/migracje-wewnetrzne-ludnosci-na-pobyt-staly-wedlug-wojewodztw-w-latach-1974-2025,3,1.html))
- Emigracja długookresowa (12+ miesięcy, zasób na koniec roku, GUS 12.08.2026): 2020: 1 562,8 tys.; 2023: 1 557,2 tys.; 2024: 1 534,2 tys.; 2025: 1 513,4 tys. (prognozowane). Kraje 2025: Wielka Brytania 412,4 tys., Niemcy 385,5 tys., Holandia 129,9 tys., Norwegia 76,0 tys., Irlandia 66,7 tys. Wg wieku (2025): 25–29: 146,8 tys.; 30–34: 199,0 tys.; 35–39: 236,5 tys.; 40–44: 191,6 tys.; 45–49: 126,4 tys.; 60–64: 41,6 tys.; 75+: 6,4 tys.; kobiety 779,4 tys., mężczyźni 733,9 tys. Emigrantów krótkookresowych (3–12 miesięcy) nieco poniżej 75 tys. GUS zastrzega, że szacunek pokazuje trend, a nie dokładne liczby. ([GUS, Informacja o rozmiarach i kierunkach czasowej emigracji z Polski w latach 2020–2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/migracje-zagraniczne-ludnosci/informacja-o-rozmiarach-i-kierunkach-czasowej-emigracji-z-polski-w-latach-2020-2025,18,4.html))
- Sprzeczność w źródłach GUS: raport „Sytuacja demograficzna Polski do 2025 r.” podaje 1 499 tys. emigrantów na koniec 2025 r., „o 22 tys. więcej niż w 2024 r.”, a raport o emigracji z 12.08.2026 r. 1 513,4 tys., „o blisko 21 tys. mniej”. Raport o emigracji jest nowszą rewizją i ma tabele. ([GUS, Sytuacja demograficzna do 2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html); [GUS, Emigracja 2020–2025](https://stat.gov.pl/obszary-tematyczne/ludnosc/migracje-zagraniczne-ludnosci/informacja-o-rozmiarach-i-kierunkach-czasowej-emigracji-z-polski-w-latach-2020-2025,18,4.html))
- Udział emigrantów wg województwa pochodzenia (2025, emigranci / ludność, moje wyliczenie z tabel GUS): opolskie 59,6 tys. / 0,92 mln, około 6,5%; podkarpackie 140,0 tys., około 6,8%; małopolskie 151,1 tys. / 3,43 mln, około 4,4%; pomorskie 93,3 tys., około 3,9%; mazowieckie 126,9 tys. / 5,51 mln, około 2,3%. ([GUS, Emigracja 2020–2025, tabl. 2](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5471/18/4/1/ludnosc_przebywajaca_powyzej_12_miesiecy_za_granica.xlsx); [GUS, Sytuacja demograficzna do 2025, tabl. 2A](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5468/40/6/1/sytuacjademograficznapolskido2025.xlsx))
- Migracje definitywne (meldunkowe) są małe: 2025 r. imigracja 21,1 tys., emigracja 10,2 tys., saldo +10,9 tys. (dziesiąty rok dodatni). ([GUS, Sytuacja demograficzna Polski do 2025 r.](https://stat.gov.pl/obszary-tematyczne/ludnosc/ludnosc/sytuacja-demograficzna-polski-do-2025-r-,40,6.html))
- Przepływy długookresowe (definicja Eurostatu, 12+ miesięcy), Polska 2024: emigracja 205 869 osób; imigracja ogółem 300 496, w tym obywateli Polski 88 687. Emigracja 2024 wg wieku: 25–29: 22,6 tys.; 30–34: 29,9 tys.; 35–39: 30,8 tys.; 40–44: 27,2 tys.; 50–54: 15,3 tys.; 65–69: 3,1 tys. Imigracja obywateli Polski 2024: 0–4: 4,0 tys.; 5–9: 6,4 tys.; 25–29: 9,3 tys.; 30–34: 12,1 tys.; 35–39: 12,6 tys.; 40–44: 10,5 tys.; 55–59: 2,5 tys.; 65–69: 1,1 tys. ([Eurostat, migr_emi2](https://ec.europa.eu/eurostat/databrowser/view/migr_emi2/default/table); [Eurostat, migr_imm2ctz](https://ec.europa.eu/eurostat/databrowser/view/migr_imm2ctz/default/table))
- Intensywność (moje wyliczenie: przepływy Eurostatu 2024 / ludność 2024 z prognozy GUS): emigracja 25–39 lat około 11–12‰ rocznie, 45–49 około 7‰, 60–64 około 2‰; imigracja obywateli Polski 25–39 lat około 4,5–5‰, 55–59 około 1‰, 65+ poniżej 0,5‰. ([Eurostat, migr_emi2, migr_imm2ctz](https://ec.europa.eu/eurostat/databrowser/view/migr_emi2/default/table))
- Raport CMR UW dla MRPiPS (opublikowany 15.01.2026): w 2024 r. z Niemiec do Polski wyjechało więcej Polaków (88 tys.) niż przyjechało (76 tys.), pierwszy raz w tym tysiącleciu (dane Destatis, pobyty 3+ miesiące); holenderski CBS po trzech kwartałach 2025 r. odnotował pierwsze ujemne dla Holandii saldo z Polską. Wracający z Europy kontynentalnej to głównie osoby 25–39 lat, w około 70% mężczyźni (Niemcy 2023), dzieci około 8,5%. Liczba zameldowań po przyjeździe z zagranicy wzrosła o ponad 15% między 2023 a 2024 r. Autorzy nie spodziewają się powrotu większości emigrantów w tej dekadzie. ([Pszczółkowska, Bojarczuk, CMR UW, „Powroty Polek i Polaków z migracji po 2015 r.”](https://www.gov.pl/web/rodzina/ekspertyza-powroty-polek-i-polakow-z-migracji-po-2015-r---szanse-i-wyzwania))
- Ten sam raport: wśród powodów powrotu na pierwszym miejscu są sprawy rodzinne, w tym dzieci i starzejący się rodzice w Polsce, którzy coraz częściej sami potrzebują wsparcia; decyzje bywają nagłe, np. po gwałtownym pogorszeniu zdrowia rodziców. To ustalenia jakościowe, bez odsetka. ([CMR UW, raport PDF](https://www.gov.pl/attachment/4b29feb2-ed08-4bc2-9a58-58867922b249))

### Inferences
- Krok 5-letni dla mieszkańca: szansa wyprowadzki z gminy około 13% w wieku 25–34, 9% w 35–39, 5% w 40–49, 3% w 50–64, 2% po 65 (dane meldunkowe zaniżają faktyczne przeprowadzki, bo wielu ludzi się nie przemeldowuje, więc w grze można je podnieść). Dla dzieci 0–9 przeprowadzka idzie razem z rodzicami.
- Kierunek dla mieszkańca Gdańska (miasto 100 tys.+): wyprowadzki raczej na przedmieścia (powiat gdański, Pruszcz, Kolbudy), napływ raczej z mniejszych miast; to zgadza się z prognozą GUS, w której powiat gdański rośnie o 16% do 2051 r., a Gdańsk stoi w miejscu.
- Emigracja za granicę w kroku 5-letnim: około 5–6% dla osób 25–39 lat, 3–4% dla 40–49, poniżej 1% po 60 (z przepływów Eurostatu); powrót: z zasobu 1,5 mln emigrantów wraca rocznie około 89 tys. obywateli (około 6%), czyli w 5 lat około 25–30% emigrantów, jeśli przyjąć że wszyscy imigranci-obywatele to powracający. To przybliżenie, bo wśród „obywateli Polski” są też dzieci urodzone za granicą.
- Mechanika „powrót do opieki nad rodzicami” ma oparcie jakościowe (CMR UW), ale nie ma liczby; można ją uzależnić od tego, czy rodzic ma 75+ lat i mieszka sam.

### Gaps
- Brak oficjalnych danych o przepływach między konkretnymi gminami wg wieku w pobranych plikach (BDL ma dane gminne o migracjach, nie pobierałem ich). Nie znalazłem tabeli „z małych miast do Warszawy/Krakowa/Gdańska wg wieku”.
- Brak oficjalnej stopy powrotów (odsetka emigrantów, którzy wracają w ciągu N lat) i liczby powrotów motywowanych opieką nad rodzicami.
- Eurostat `migr_imm1ctz` i `migr_emi1ctz` (szczegółowe obywatelstwa) API odesłało do kolejki asynchronicznej; nie pobrałem.

## 5. Dorosłe dzieci z rodzicami, gospodarstwa wielopokoleniowe, opieka i samotna starość

### Takeaway
Polska ma jeden z najwyższych w UE odsetków młodych dorosłych mieszkających z rodzicami: 51% osób w wieku 25–34 (UE 30%), a średni wiek wyprowadzki to 26,8 roku (mężczyźni 27,9, kobiety 25,7). Starsi rzadziej niż w UE mieszkają sami (22% osób 65+ wobec 32% w UE), a prawie połowa 65+ (47%) mieszka w gospodarstwach z innymi osobami niż sam partner, np. z dziećmi. Opiekę nad starszymi niosą głównie dzieci (69% pomagających), instytucje są marginalne.

### Cited Findings
- Średni szacowany wiek opuszczenia domu rodzinnego w Polsce (Eurostat, EU-SILC): 2005: 28,6; 2015: 28,3; 2019: 27,1; 2022: 28,2; 2023: 27,2; 2024: 26,7; 2025: 26,8 (mężczyźni 27,9, kobiety 25,7). UE 2025: 26,3 (M 27,2, K 25,5). ([Eurostat, yth_demo_030](https://ec.europa.eu/eurostat/databrowser/view/yth_demo_030/default/table))
- Odsetek młodych dorosłych mieszkających z rodzicami w Polsce, 2025 (Eurostat, EU-SILC): 18–24 lata: 93,9%; 25–29: 65,6% (M 72,1%, K 59,0%); 25–34: 51,0% (M 58,7%, K 43,0%); 18–34: 66,5%. UE 2025: 25–29: 41,8%; 25–34: 30,1%. Trend dla 25–34 w Polsce: 2005: 36,4%; 2015: 45,7%; 2020: 47,5%; 2024: 53,8%; 2025: 51,0%. ([Eurostat, ilc_lvps08](https://ec.europa.eu/eurostat/databrowser/view/ilc_lvps08/default/table))
- Osoby 65+ wg typu gospodarstwa w Polsce, 2025 (Eurostat, EU-SILC): samotnie 22,2% (mężczyźni 13,5%, kobiety 28,1%); para bez innych osób 30,4%; para z innymi osobami 25,6%; inne typy 21,8%. UE: samotnie 32,2%, para sama 46,7%, para z innymi 11,5%, inne 9,6%. Udział samotnych 65+ w Polsce spadł z 32,5% (2005) i 28,2% (2015). ([Eurostat, ilc_lvps30](https://ec.europa.eu/eurostat/databrowser/view/ilc_lvps30/default/table))
- Średnia wielkość gospodarstwa domowego (EU-SILC): Polska 2,8 (2025), UE 2,3. Gospodarstwa trzech i więcej dorosłych z dziećmi to 12,0% gospodarstw i 22,8% ludności Polski (2025). ([Eurostat, ilc_lvph01](https://ec.europa.eu/eurostat/databrowser/view/ilc_lvph01/default/table); [Eurostat, ilc_lvph02, ilc_lvps02](https://ec.europa.eu/eurostat/databrowser/view/ilc_lvps02/default/table))
- NSP 2021, skład pokoleniowy gospodarstw (młodzi 0–29, średni wiek 30–59, starsi 60+): gospodarstwa z młodymi, w średnim wieku i starszymi (trzy pokolenia) 14,6% wszystkich (miasta 9,9%, wieś 24,3%); wyłącznie starsi 22,3% (miasta 25,4%, wieś 15,7%; w 2011 r. 16,0%); młodzi i w średnim wieku 29,5%. Jednoosobowe gospodarstwa to 22,6% (2011: 25,5%), z nich 55,2% tworzą osoby 60+. ([GUS, Rodziny w Polsce w świetle wyników NSP 2021, tabl. 3.6](https://stat.gov.pl/spisy-powszechne/nsp-2021/nsp-2021-wyniki-ostateczne/rodziny-w-polsce-w-swietle-wynikow-nsp-2021,7,2.html))
- NSP 2021: 1 285,6 tys. gospodarstw jednoosobowych osób 65+ (10,3% wszystkich gospodarstw, ponad 45% gospodarstw jednoosobowych); gospodarstwa z osobą 65+: 5 148,8 tys. (41,1%). ([GUS, Starzenie się ludności Polski w świetle wyników NSP 2021](https://stat.gov.pl/spisy-powszechne/nsp-2021/nsp-2021-wyniki-ostateczne/starzenie-sie-ludnosci-polski-w-swietle-wynikow-narodowego-spisu-powszechnego-ludnosci-i-mieszkan-2021,3,1.html))
- Opieka nieformalna (Eurostat EHIS 2019, osoby 15+ pomagające co najmniej raz w tygodniu osobie starszej lub chorej): Polska 14,2% (11,6% krewnym), UE 17,0%. Wg wieku w Polsce: 25–34: 7,7%; 35–44: 13,9%; 45–54: 20,7%; 55–64: 23,1% (kobiety 26,4%, mężczyźni 19,4%); 65–74: 14,0%; 75+: 7,3%. ([Eurostat, hlth_ehis_ic1e](https://ec.europa.eu/eurostat/databrowser/view/hlth_ehis_ic1e/default/table))
- CBOS 2019 (N około 2 tys., CAPI): trudności z codziennymi czynnościami zgłasza 9% osób 55–64, 13% w wieku 65–74 i 22% w wieku 75+; 26% potrzebujących pomocy mieszka samotnie. Pomagają im: dzieci 69%, współmałżonek 47%, rodzeństwo 26%, sąsiedzi 26%, wnuki 22%, pielęgniarka środowiskowa 11%, opiekunka z ośrodka pomocy społecznej 10%, płatna opiekunka 2%; 94% może liczyć na rodzinę. ([CBOS, Komunikat 116/2019 „Jakiej pomocy potrzebują osoby starsze i kto im jej udziela?”](https://cbos.pl/SPISKOM.POL/2019/K_116_19.PDF))
- Opieka instytucjonalna: na koniec 2024 r. zakłady stacjonarne pomocy społecznej miały 134,1 tys. miejsc (w tym domy pomocy społecznej 84,3 tys.); na jedno miejsce przypadały 74 osoby w wieku 60+. ([GUS, Sytuacja osób starszych w Polsce w 2024 r., 18.12.2025](https://stat.gov.pl/obszary-tematyczne/osoby-starsze/osoby-starsze/sytuacja-osob-starszych-w-polsce-w-2024-r-,2,7.html))
- Badania SHARE z Polską (np. Fihel, Kalbarczyk, Nicińska, CMR UW 2019) pokazują, że rodzice mieszkający blisko dzieci korzystają prawie wyłącznie z pomocy rodziny, a pomoc spoza rodziny rośnie wraz z odległością; liczb dla Polski nie wyciągnąłem. ([CMR UW Working Paper 113/171](https://www.migracje.uw.edu.pl/wp-content/uploads/2019/04/WP113171a.pdf))

### Inferences
- W generatorze 2026 r.: osoba 25–29 lat mieszka z rodzicami z prawdopodobieństwem około 72% (mężczyzna) lub 59% (kobieta), 30–34 lat około 35–45% (różnica między 25–34 a 25–29). Wyprowadzkę z domu w kolejnych krokach można powiązać z wiekiem około 27 lat i z założeniem rodziny.
- W 2051 r. udział osób 80+ w Polsce wzrośnie do około 9% (prognoza), a przy 20% bezdzietności i emigracji części dzieci pula starszych bez dziecka na miejscu wyraźnie rośnie. Samotne mieszkanie 65+ (22%, kobiety 28%) jest dobrym punktem startu dla 2026 r.; do 2051 r. należy się spodziewać wzrostu w stronę poziomu UE (32%).
- Opiekunem rodzica najczęściej jest dziecko w wieku 45–64 lat, częściej córka (EHIS: kobiety 55–64 lat 26%). To naturalny wyzwalacz dla zdarzenia „powrót do rodziców” w grze.

### Gaps
- Nie znalazłem konkretnego odsetka dla Polski z SHARE (fala 8 lub 9) dotyczącego współzamieszkiwania z dorosłymi dziećmi lub odległości do najbliższego dziecka.
- Brak danych o odsetku 25–34 mieszkających z rodzicami wg miasto/wieś lub wielkości miasta; EU-SILC dla Polski tego w pobranych tabelach nie dzieli.
- Brak danych o samotnym mieszkaniu wg szczegółowego wieku (75+, 85+); Eurostat `ilc_lvps30` daje tylko 65+. Aneks XLS do „Starzenia się ludności” (NSP 2021) może to mieć, ale jest w starym formacie XLS i nie przeczytałem go (brak biblioteki xlrd).

## 6. Licencje i tabela pobranych plików

### Takeaway
Dane GUS i Eurostatu można używać w publicznej grze open source, o ile podaje się źródło (Eurostat: CC BY 4.0 plus oznaczenie zmian). Najbezpieczniej trzymać w repo tylko przetworzone, małe tabele z atrybucją, a surowe pliki poza repo. Katalog `dane-surowe/` (421 MB) nie jest teraz w `.gitignore`.

### Cited Findings
- GUS nie zgłasza zastrzeżeń do kopiowania plików i stron ani do używania ich we własnych opracowaniach, pod warunkiem podania źródła; dopuszcza też prezentowanie własnych opracowań na podstawie danych GUS (bez odpowiedzialności GUS za ich treść). ([GUS, Copyright](https://stat.gov.pl/copyright))
- Eurostat: treść redakcyjna należąca do UE jest na licencji CC BY 4.0; można jej używać pod warunkiem podania źródła i zaznaczenia zmian; podstawą jest decyzja Komisji 2011/833/UE; dane pochodzące od podmiotów trzecich mogą mieć ograniczenia. ([Eurostat, Copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice); [Eurostat, Copyright/licence policy](https://ec.europa.eu/eurostat/statistics-explained/index.php/Copyright/licence_policy))
- OECD: treści publikowane od 1.07.2024 r. są domyślnie na CC BY 4.0, wcześniejsze na zasadach zbliżonych do CC BY 4.0; plik SF2.5 jest z 09.2024 r., a dane dla Polski pochodzą z Human Fertility Database. ([OECD, Open by default policy](https://www.oecd.org/en/about/oecd-open-by-default-policy.html); [OECD SF2.5 PDF](https://webfs.oecd.org/Els-com/Family_Database/SF_2_5_Childlessness.pdf))
- Artykuł Tymicki, Zeman, Holzer-Żelażewska (Studia Demograficzne 2018) jest na licencji CC BY 4.0. ([Studia Demograficzne, strona artykułu](https://econjournals.sgh.waw.pl/SD/article/view/1358))

#### Tabela pobranych plików

Data pobrania wszystkich plików: 17.10.2026. Ścieżki względem `/Users/mpawelczuk/Post-pixel/dane-surowe/demografia/`. Prefiks URL GUS: `https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/`. Żaden plik nie przekroczył 300 MB (największy 128,8 MB), nic nie zostało pominięte z powodu rozmiaru.

| Ścieżka lokalna | URL źródła | Rozmiar | Licencja | Zawartość |
|---|---|---|---|---|
| gus-trwanie-zycia-2025/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx | GUS …/5470/2/20/1/tablica_a_tablica_trwania_zycia_w_2025_r..xlsx | 0,06 MB | GUS: użycie z podaniem źródła | Tablica trwania życia 2025, qx/lx/dx/Lx/Tx/ex wiek 0–100, M/K, ogółem, miasta, wieś |
| gus-trwanie-zycia-2025/tablica_b_srednie_dalsze_trwanie_zycia_wedlug_wojewodztw_w_2025_r..xlsx | GUS …/5470/2/20/1/tablica_b_… | 0,01 MB | GUS | e(x) w wieku 0, 15, 30, 45, 60 wg województw, ogółem/miasta/wieś |
| gus-trwanie-zycia-2025/tablica_c_srednie_dalsze_trwanie_zycia_wedlug_podregionow_w_2025_r..xlsx | GUS …/5470/2/20/1/tablica_c_… | 0,02 MB | GUS | e(x) wg podregionów |
| gus-trwanie-zycia-2025/tablica_d_tablica_trwania_zycia_dla_obu_plci_lacznie_w_2025_r..xlsx | GUS …/5470/2/20/1/tablica_d_… | 0,02 MB | GUS | Tablica trwania życia 2025, obie płcie |
| gus-trwanie-zycia-2025/trwanie_zycia_w_2025_roku.pdf | GUS …/5470/2/20/1/trwanie_zycia_w_2025_roku.pdf | 5,28 MB | GUS | Publikacja z komentarzem i metodą (27.07.2026) |
| gus-trwanie-zycia-historyczne/1._tablice_trwania_zycia_w_latach_1990-2024.xlsx | GUS …/5470/1/3/1/1._tablice_trwania_zycia_w_latach_1990-2024.xlsx | 0,50 MB | GUS | Pełne tablice trwania życia 1990–2024 |
| gus-trwanie-zycia-historyczne/2._przecietne_dalsze_trwanie_zycia_w_latach_1950-2024.xlsx | GUS …/5470/1/3/1/2._… | 0,02 MB | GUS | e(x) 1950–2024 |
| gus-trwanie-zycia-historyczne/3._przecietne_trwanie_zycia_noworodka_miasta_wies_w_latach_1990-2024.xlsx | GUS …/5470/1/3/1/3._… | 0,01 MB | GUS | e(0) miasta/wieś 1990–2024 |
| gus-prognoza-ludnosci-2023-2060/1-prognoza_ludnosci_na_lata_2023-2060_.pdf | GUS …/5469/11/1/1/1-prognoza_ludnosci_na_lata_2023-2060_.pdf | 14,94 MB | GUS | Publikacja prognozy, założenia (TFR, e0, migracje) |
| gus-prognoza-ludnosci-2023-2060/2-wyniki_polska.xlsx | GUS …/5469/11/1/1/2-wyniki_polska.xlsx | 0,15 MB | GUS | Polska: ludność wg płci i wieku 2022–2060, ruch naturalny i migracje |
| gus-prognoza-ludnosci-2023-2060/3-wojewodztwa.zip | GUS …/5469/11/1/1/3-wojewodztwa.zip | 2,25 MB | GUS | 17 XLSX: Polska i województwa, ten sam układ |
| gus-prognoza-ludnosci-2023-2060/4-powiaty.zip | GUS …/5469/11/1/1/4-powiaty.zip | 32,96 MB | GUS | 380 XLSX powiatów: płeć × pojedynczy wiek 2022–2060, ruch naturalny, migracje (nazwy plików w kodowaniu CP852) |
| gus-prognoza-ludnosci-2023-2060/5-tabela_zbiorcza.xlsx | GUS …/5469/11/1/1/5-tabela_zbiorcza.xlsx | 15,63 MB | GUS | Wszystkie powiaty w jednym arkuszu, wiek 0–89 i 90+ |
| gus-prognoza-ludnosci-2023-2060/6-scenariusze_alternatywne.zip | GUS …/5469/11/1/1/6-scenariusze_alternatywne.zip | 128,83 MB | GUS | Scenariusz niski i wysoki dla powiatów |
| gus-prognoza-ludnosci-2023-2060/7._aneks_prognoza_ludnosci_dla_gmin_na_lata_2023-2040_2.pdf | GUS …/5469/11/1/1/7._aneks_… | 0,17 MB | GUS | Opis prognozy dla gmin |
| gus-prognoza-ludnosci-2023-2060/8._prognoza_ludnosci_dla_gmin_na_lata_2023-2060_4.zip | GUS …/5469/11/1/1/8._prognoza_ludnosci_dla_gmin_na_lata_2023-2060_4.zip | 68,25 MB | GUS | XLSX gmin: płeć × grupy 10-letnie i ekonomiczne 2022–2060 |
| gus-prognoza-ludnosci-2023-2060/9._gminy_ludnosc_-_tablica_zbiorcza_6.xlsx | GUS …/5469/11/1/1/9._gminy_ludnosc_-_tablica_zbiorcza_6.xlsx | 18,82 MB | GUS | Wszystkie gminy (z typem miejska/wiejska/miejsko-wiejska), grupy wieku |
| gus-prognoza-ludnosci-rezydujacej-2023-2060/prognoza_ludnosci_rezydujacej_dla_polski_na_lata_2023-2060.pdf | GUS …/5469/12/1/1/prognoza_ludnosci_rezydujacej_dla_polski_na_lata_2023-2060.pdf | 0,40 MB | GUS | Informacja sygnalna o prognozie ludności rezydującej |
| gus-prognoza-ludnosci-rezydujacej-2023-2060/prognoza_ludnosci_rezydujacej_dla_polski_na_lata_2023-2060._polska.xlsx | GUS …/5469/12/1/1/…_polska.xlsx | 0,15 MB | GUS | Rezydenci, Polska |
| gus-prognoza-ludnosci-rezydujacej-2023-2060/prognoza_ludnosci_rezydujacej_dla_polski_na_lata_2023-2060._wojewodztwa.zip | GUS …/5469/12/1/1/…_wojewodztwa.zip | 2,01 MB | GUS | Rezydenci, województwa |
| gus-prognoza-ludnosci-rezydujacej-2023-2060/prognoza_ludnosci_rezydujacej_dla_polski_na_lata_2023-2060._powiaty.zip | GUS …/5469/12/1/1/…_powiaty.zip | 32,41 MB | GUS | Rezydenci, powiaty |
| gus-symulacja-ludnosci-2060/symulacja_liczby_ludnosci_do_2060_r_opracowanie_eksperymentalne.pdf | GUS …/5469/17/1/1/symulacja_liczby_ludnosci_do_2060_r_opracowanie_eksperymentalne.pdf | 0,33 MB | GUS | Symulacja eksperymentalna z 06.11.2025 (TFR 1,10, wysokie e0) |
| gus-prognoza-gospodarstw-2016-2050/prognoza_gospodarstw_domowych_na_lata_2016-2050_002.pdf | GUS …/5469/9/4/1/prognoza_gospodarstw_domowych_na_lata_2016-2050_002.pdf | 3,56 MB | GUS | Prognoza gospodarstw domowych (2016) |
| gus-prognoza-gospodarstw-2016-2050/prognoza_gospodarstw_domowych_na_lata_2016-2050_-_aneks_tabelaryczny_3.zip | GUS …/5469/9/4/1/…_aneks_tabelaryczny_3.zip | 1,68 MB | GUS | Aneks tabelaryczny: Polska i województwa, miasto/wieś |
| gus-prognoza-gospodarstw-2016-2050/prognoza_gospodarstw_domowych_na_lata_2016-2050_-_aneks_tabelaryczny_4_wariant_wysokiej_dzietnosci.xlsx | GUS …/5469/9/4/1/…_aneks_tabelaryczny_4_wariant_wysokiej_dzietnosci.xlsx | 0,37 MB | GUS | Wariant wysokiej dzietności (symulacja 500+) |
| gus-sytuacja-demograficzna-2025/sytuacja_demograficzna_polski_do_2025_2.pdf | GUS …/5468/40/6/1/sytuacja_demograficzna_polski_do_2025_2.pdf | 6,76 MB | GUS | Raport za 2025 r. (29.09.2026) |
| gus-sytuacja-demograficzna-2025/sytuacjademograficznapolskido2025.xlsx | GUS …/5468/40/6/1/sytuacjademograficznapolskido2025.xlsx | 0,07 MB | GUS | Szeregi 1950–2025 ogółem/miasta/wieś, wskaźniki wg województw |
| gus-rocznik-demograficzny-2025/rocznik_demograficzny_2025_pl.pdf | GUS …/5515/3/19/1/rocznik_demograficzny_2025_pl.pdf | 21,36 MB | GUS | Rocznik Demograficzny 2025 (dane za 2024, 24.11.2025) |
| gus-rocznik-demograficzny-2025/rocznik_demograficzny_2025_tablice.zip | GUS …/5515/3/19/1/rocznik_demograficzny_2025_tablice.zip | 1,88 MB | GUS | 15 plików tablic: urodzenia, płodność wg wieku, zgony, migracje wewnętrzne wg wieku i kierunku, migracje zagraniczne |
| gus-emigracja-czasowa-2020-2025/informacja_o_rozmiarach_i_kierunkach_czasowej_emigracji_z_polski_w_latach_2020-2025.pdf | GUS …/5471/18/4/1/informacja_o_…_2020-2025.pdf | 0,38 MB | GUS | Szacunek emigracji czasowej (12.08.2026) |
| gus-emigracja-czasowa-2020-2025/ludnosc_przebywajaca_powyzej_12_miesiecy_za_granica.xlsx | GUS …/5471/18/4/1/ludnosc_przebywajaca_powyzej_12_miesiecy_za_granica.xlsx | 0,02 MB | GUS | Emigranci 12+ mies. wg kraju, województwa, płci i wieku 2020–2025 |
| gus-emigracja-czasowa-2020-2025/ludnosc_przebywajaca_od_3_do_12_miesiecy_za_granica.xlsx | GUS …/5471/18/4/1/ludnosc_przebywajaca_od_3_do_12_miesiecy_za_granica.xlsx | 0,02 MB | GUS | Emigranci 3–12 mies. |
| gus-migracje-wewnetrzne-1998-2025/migracje_wewnetrzne_ludnosci_na_pobyt_staly_wg_wojewodztw_w_latach_1998-2025.xlsx | GUS …/6050/3/1/1/migracje_wewnetrzne_…_1998-2025.xlsx | 0,33 MB | GUS | Migracje wewnętrzne wg województw |
| gus-migracje-wewnetrzne-1998-2025/migracje_wewnetrzne_ludnosci_na_pobyt_staly_wg_wojewodztw_plci_migrantow_w_latach_1998-2025.xlsx | GUS …/6050/3/1/1/…_plci_migrantow_… | 0,45 MB | GUS | j.w. wg płci |
| gus-migracje-wewnetrzne-1998-2025/migracje_wewnatrzwojewodzkie_ludnosci_na_pobyt_staly_wg_kierunkow_w_latach_1998-2025.xlsx | GUS …/6050/3/1/1/migracje_wewnatrzwojewodzkie_… | 0,24 MB | GUS | Migracje wewnątrz województw wg kierunku miasto/wieś |
| gus-nsp2021-rodziny/rodziny_w_polsce_w_swietle_wynikow_nsp2021.pdf | GUS …/6536/7/2/1/rodziny_w_polsce_w_swietle_wynikow_nsp2021.pdf | 3,82 MB | GUS | NSP 2021: gospodarstwa domowe i rodziny, skład pokoleniowy |
| gus-nsp2021-rodziny/aneks_tabelaryczny_do_publikacji_2.xlsx | GUS …/6536/7/2/1/aneks_tabelaryczny_do_publikacji_2.xlsx | 0,21 MB | GUS | Tablice do powyższej (wersja po korektach z 2024 r.) |
| gus-nsp2021-starzenie/starzenie_sie_ludnosci_polski_nsp_2021.pdf | GUS …/6536/3/1/1/starzenie_sie_ludnosci_polski_nsp_2021.pdf | 4,56 MB | GUS | NSP 2021: starzenie się, gospodarstwa osób 65+ |
| gus-nsp2021-starzenie/aneks.xls | GUS …/6536/3/1/1/aneks.xls | 0,47 MB | GUS | Tablice do powyższej (format XLS) |
| gus-osoby-starsze-2024/sytuacja_osob_starszych_w_polsce_w_2024_r..pdf | GUS …/6002/2/7/1/sytuacja_osob_starszych_w_polsce_w_2024_r..pdf | 9,47 MB | GUS | Sytuacja osób starszych 2024 (18.12.2025) |
| eurostat/yth_demo_030.csv | Eurostat API SDMX 3.0, dataflow ESTAT/yth_demo_030, filtr geo=PL,EU27_2020 | 0,01 MB | CC BY 4.0 | Wiek opuszczenia domu rodzinnego 2002–2025 |
| eurostat/ilc_lvps08.csv | j.w., ilc_lvps08 | 0,06 MB | CC BY 4.0 | Odsetek 18–34 mieszkających z rodzicami wg wieku i płci 2005–2025 |
| eurostat/ilc_lvps30.csv | j.w., ilc_lvps30 | 0,03 MB | CC BY 4.0 | Osoby 65+ wg typu gospodarstwa 2005–2025 |
| eurostat/ilc_lvps01.csv | j.w., ilc_lvps01 | 0,10 MB | CC BY 4.0 | Rozkład ludności wg typu gospodarstwa i wieku |
| eurostat/ilc_lvps02.csv | j.w., ilc_lvps02 | 0,12 MB | CC BY 4.0 | Rozkład ludności wg typu gospodarstwa |
| eurostat/ilc_lvph01.csv | j.w., ilc_lvph01 | 0,00 MB | CC BY 4.0 | Średnia wielkość gospodarstwa |
| eurostat/ilc_lvph02.csv | j.w., ilc_lvph02 | 0,04 MB | CC BY 4.0 | Gospodarstwa wg składu |
| eurostat/hlth_ehis_ic1e.csv | j.w., hlth_ehis_ic1e | 0,19 MB | CC BY 4.0 | Opieka nieformalna EHIS 2014 i 2019 wg płci, wieku, wykształcenia |
| eurostat/demo_find.csv | j.w., demo_find | 0,04 MB | CC BY 4.0 | TFR, wiek matki, kolejność urodzeń, urodzenia pozamałżeńskie 1965–2024 |
| eurostat/demo_frate.csv | j.w., demo_frate | 0,18 MB | CC BY 4.0 | Współczynniki płodności wg pojedynczych lat wieku 1990–2024 |
| eurostat/demo_r_find3_full.tsv | Eurostat API SDMX 2.1, data/demo_r_find3, TSV, cała tabela | 0,53 MB | CC BY 4.0 | Wskaźniki płodności NUTS3 (cała UE) 2013–2024 |
| eurostat/migr_emi2.csv | Eurostat API SDMX 3.0, migr_emi2, geo=PL,EU27_2020 | 0,74 MB | CC BY 4.0 | Emigracja wg pojedynczych lat wieku i płci 1990–2024 |
| eurostat/migr_imm2ctz.csv | j.w., migr_imm2ctz, geo=PL | 2,54 MB | CC BY 4.0 | Imigracja wg wieku i grupy obywatelstwa (NAT = obywatele Polski) 1998–2024 |
| eurostat/migr_imm8.csv | j.w., migr_imm8, geo=PL | 0,83 MB | CC BY 4.0 | Imigracja wg wieku i płci 1990–2024 |
| oecd-family-database/SF_2-5-Childlessness.xlsx | https://webfs.oecd.org/Els-com/Family_Database/SF_2-5-Childlessness.xlsx | 0,06 MB | OECD, domyślnie CC BY 4.0 (dane HFD) | Bezdzietność definitywna wg kohort |
| oecd-family-database/SF_2_5_Childlessness.pdf | https://webfs.oecd.org/Els-com/Family_Database/SF_2_5_Childlessness.pdf | 0,28 MB | j.w. | Opis wskaźnika i źródeł |
| studia-demograficzne-tymicki-2018/tymicki_zeman_holzer_2018_cohort_fertility_PL.pdf | https://econjournals.sgh.waw.pl/SD/article/download/1358/1210/2420 | 0,38 MB | CC BY 4.0 | Artykuł o dzietności kohortowej 1945–2015 |
| cbos/CBOS_K_116_19_pomoc_osobom_starszym.pdf | https://cbos.pl/SPISKOM.POL/2019/K_116_19.PDF | 0,29 MB | nie sprawdziłem; cytować z podaniem źródła, nie publikować w repo | Komunikat CBOS 116/2019 o pomocy osobom starszym |
| cmr-uw-powroty-2025/pszczolkowska_bojarczuk_powroty_po_2015.pdf | https://www.gov.pl/attachment/4b29feb2-ed08-4bc2-9a58-58867922b249 | 1,45 MB | nie sprawdziłem; cytować z podaniem źródła, nie publikować w repo | Raport CMR UW dla MRPiPS o powrotach po 2015 r. (90 stron) |

Pełne adresy API Eurostatu miały postać `https://ec.europa.eu/eurostat/api/dissemination/sdmx/3.0/data/dataflow/ESTAT/{kod}/1.0/*?c[geo]=PL,EU27_2020&format=csvdata&formatVersion=2.0&compress=false`.

### Inferences
- Do atrybucji w grze wystarczy linia w stylu „Dane demograficzne: GUS (tablice trwania życia 2025, Prognoza ludności 2023–2060, Rocznik Demograficzny 2025), Eurostat (CC BY 4.0, przetworzone), OECD Family Database / HFD” obok obecnej atrybucji map.
- Przed pierwszym commitem trzeba dodać `dane-surowe/` do `.gitignore` (421 MB, w tym PDF-y CBOS i CMR o niesprawdzonej licencji), a do repo wrzucać tylko wyliczone tabele.

### Gaps
- Nie sprawdziłem warunków ponownego wykorzystania raportu CMR UW na gov.pl ani komunikatów CBOS.
- Human Fertility Database ma własną licencję i wymaga konta; nie pobierałem.
