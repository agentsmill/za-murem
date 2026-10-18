# Imiona i nazwiska z rejestru PESEL i innych źródeł: dane do generatora mieszkańców „Za Murem”

Stan wiedzy na 17.10.2026. Wszystkie pliki pobrano 17.10.2026 przez API dane.gov.pl (`https://api.dane.gov.pl/resources/{id}/file`). Liczby w próbkach to obliczenia własne na pobranych plikach (skrypty w `/private/tmp/claude-501/-Users-mpawelczuk-Post-pixel/e4b9c9ed-c717-4ee7-985e-bc3026b5fc04/scratchpad/skrypty/`, uruchamiane `python3 -I`, ścieżki jako argumenty). Katalog główny pobrań: `/Users/mpawelczuk/Post-pixel/dane-surowe/imiona-nazwiska/`.

## 1. Zbiory PESEL na dane.gov.pl: co jest, adresy, identyfikatory, formaty, daty, licencja

### Takeaway
Ministerstwo Cyfryzacji publikuje na dane.gov.pl pięć zbiorów z PESEL (imiona żyjących, imiona z zmarłymi, imiona nadane dzieciom, nazwiska żyjących, nazwiska z zmarłymi), wszystkie na licencji CC0 1.0 i odświeżane co roku w styczniu. Imiona dzieci są rocznie od 2000 r., także według województw (od 2019 r.) i według USC/gminy (2024, 2025), a nazwiska żyjących mają podział na województwo zameldowania (stan na 20.01.2026). Podziału nazwisk na powiat lub gminę w otwartych danych nie ma.

### Cited Findings

#### Zbiory (metadane z API dane.gov.pl, odczyt 17.10.2026)

| ID | Tytuł | Licencja | Utworzony / ost. zmiana / ost. weryfikacja | Zasobów | Opis i próg |
|---|---|---|---|---|---|
| 219 | Imiona nadawane dzieciom w Polsce | CC0 1.0 | 2015-06-24 / 2026-07-17 / 2026-08-19, „Rocznie” | 84 | Imiona pierwsze i drugie wg płci; „Do roku 2012 imiona z liczbą wystąpień poniżej 5 nie były umieszczane na liście, od 2013 r. granicą tą jest liczba 2” |
| 1667 | Lista imion występujących w rejestrze PESEL (osoby żyjące) | CC0 1.0 | 2019-07-19 / 2024-06-19 / 2026-01-30 | 34 | „Pojedyncze wystąpienia oraz dane dot. osób zmarłych nie zostały umieszczone na liście” |
| 1501 | Lista imion … z uwzględnieniem imion osób zmarłych | CC0 1.0 | 2019-04-08 / 2024-06-19 / 2026-01-30 | 34 | Żyjący + zmarli; pojedyncze wystąpienia usunięte |
| 1681 | Nazwiska występujące w rejestrze PESEL (osoby żyjące) | CC0 1.0 | 2019-08-13 / 2024-06-19 / 2026-01-28 | 21 | Wg pola „nazwisko aktualne”; nazwiska z pojedynczym wystąpieniem i zmarli pominięci |
| 568 | Nazwiska … z uwzględnieniem nazwisk osób zmarłych | CC0 1.0 | 2018-02-12 / 2024-06-19 / 2026-01-29 | 25 | Żyjący + zmarli; pojedyncze wystąpienia usunięte; podział na województwa tylko dla stanu 31.12.2017 |
| 1811 | Częstość imion nadawanych w Gdańsku (Otwarty Gdańsk, import z CKAN miasta) | CC BY 4.0 | 2017-11-23 / 2026-06-18 | 4 | Imiona dzieci urodzonych 2015–2018 zameldowanych w Gdańsku; warunek: „prosimy o poinformowanie swoich użytkowników o źródle oraz czasie pozyskania informacji” |

Źródła metadanych: [API 219](https://api.dane.gov.pl/1.4/datasets/219,imiona-nadawane-dzieciom-w-polsce), [API 1667](https://api.dane.gov.pl/1.4/datasets/1667,lista-imion-wystepujacych-w-rejestrze-pesel-osoby-zyjace), [API 1501](https://api.dane.gov.pl/1.4/datasets/1501,lista-imion-wystepujacych-w-rejestrze-pesel), [API 1681](https://api.dane.gov.pl/1.4/datasets/1681,nazwiska-osob-zyjacych-wystepujace-w-rejestrze-pesel), [API 568](https://api.dane.gov.pl/1.4/datasets/568,nazwiska-wystepujace-w-rejestrze-pesel), [API 1811](https://api.dane.gov.pl/1.4/datasets/1811,czestosc-imion-nadawanych-w-gdansku). Wydawca zbiorów PESEL w API to instytucja nr 333 „Ministerstwo Cyfryzacji” — [API instytucji](https://api.dane.gov.pl/1.4/institutions/333,ministerstwo-cyfryzacji).

#### Co dokładnie jest w zbiorze 219 (imiona dzieci)
- Jeden zbiorczy plik 2000–2019, imię pierwsze (CSV 21457, 440 085 B; XLSX 21458, 557 737 B), kolumny `Rok, Imię, Liczba, Płeć` (M/K), 24 461 wierszy, wszystkie lata 2000–2019 — [zasób 21457](https://api.dane.gov.pl/resources/21457/file).
- Rocznie od 2019 osobne pliki: żeńskie/męskie × imię pierwsze/drugie × kraj/województwa (np. 2025: 1159536, 1159538, 1159541, 1159548, 1159552, 1159559, 1159607, 1159613, wszystkie z 2026-01-20) — [API zasobów 219](https://api.dane.gov.pl/1.4/datasets/219/resources?per_page=100).
- Według USC (kod USC, województwo, powiat, gmina): 2024 (zasób 63936, 846 396 B) i 2025 (zasób 1187350, 802 899 B, 25 864 wiersze, 326 kodów USC z danymi) — [zasób 1187350](https://api.dane.gov.pl/resources/1187350/file).
- Półroczne: I połowa 2019–2026 (2026: zasób 2474883 imię pierwsze, 2474886 imię drugie, data 2026-07-27, CSV z BOM, separator `;`, płeć K/M) — [zasób 2474883](https://api.dane.gov.pl/resources/2474883/file).
- Wcześniejsze lata niż 2000 nie występują w zbiorze — [API zasobów 219](https://api.dane.gov.pl/1.4/datasets/219/resources?per_page=100).
- Ministerstwo ogłasza wyniki dwa razy w roku na gov.pl, np. dla 2025 r. ([gov.pl, wg województw](https://www.gov.pl/web/cyfryzacja/najpopularniejsze-imiona-dzieci-w-polsce-wedlug-wojewodztw): Zofia najpopularniejsza w 7 województwach, Nikodem w 8, strona z 09.02.2026 wg wyszukiwarki; [gov.pl 2024](https://www.gov.pl/web/cyfryzacja/najpopularniejsze-imiona-nadawane-dzieciom-w-2024-roku)).

#### Co jest w zbiorach 1667/1501 (imiona w rejestrze)
- Migawki: 31.12.2018 (tylko 1501), 18.07.2019, 21.01.2020, 31.01.2021, 24.01.2022, 31.01.2023, 19.01.2024, 22.01.2025, 20.01.2026; imię pierwsze i drugie, osobno M/K; od 2021 tylko XLSX — [API zasobów 1667](https://api.dane.gov.pl/1.4/datasets/1667/resources?per_page=100), [API zasobów 1501](https://api.dane.gov.pl/1.4/datasets/1501/resources?per_page=100).
- Kolumny: `IMIĘ_PIERWSZE | PŁEĆ | LICZBA_WYSTĄPIEŃ`; brak roku urodzenia, brak regionu — [zasób 1159669](https://api.dane.gov.pl/resources/1159669/file).
- Stan 20.01.2026, osoby żyjące: 46 202 imion męskich (suma 21 462 794 osób) i 28 786 żeńskich (suma 22 589 659); z zmarłymi: 47 406 M (29 644 169) i 30 090 K (29 859 203); minimalna liczba w pliku = 2 — obliczenia na [1159669](https://api.dane.gov.pl/resources/1159669/file), [1159670](https://api.dane.gov.pl/resources/1159670/file), [1159637](https://api.dane.gov.pl/resources/1159637/file), [1159639](https://api.dane.gov.pl/resources/1159639/file).

#### Co jest w zbiorach 1681/568 (nazwiska)
- Żyjący, kraj: migawki 2019-06-30 … 2026-01-20; od 2025 dodatkowo pliki „wg województwa zameldowania na pobyt stały” (2025-02-24: zasoby 65049 M, 65090 K; 2026-01-20: 1148786 M 12 159 696 B, 1148790 K 13 158 936 B) — [API zasobów 1681](https://api.dane.gov.pl/1.4/datasets/1681/resources?per_page=100).
- Z zmarłymi: migawki 2017-12-31 … 2026-01-20; województwa tylko 2017-12-31 (CSV 8162 M 18,6 MB, 8155 K 19,6 MB; XLSX 8159, 8157) — [API zasobów 568](https://api.dane.gov.pl/1.4/datasets/568/resources?per_page=100).
- Stan 20.01.2026, kraj, żyjący: 408 182 nazwiska męskie (suma 21 197 537) i 420 082 żeńskie (suma 21 560 302), kolumny `Nazwisko aktualne | Liczba`, min. 2 — obliczenia na [1148808](https://api.dane.gov.pl/resources/1148808/file), [1148811](https://api.dane.gov.pl/resources/1148811/file).
- Stan 20.01.2026, województwa: 16 województw, kolumny `Województwo zameldowania na pobyt stały | Nazwisko aktualne | Liczba`, 646 052 wierszy M (suma 16 590 111, 188 413 różnych nazwisk) i 694 553 wierszy K (suma 17 296 363, 206 804 nazwisk); min. liczba w wierszu 2, brak jedynek — obliczenia na [1148786](https://api.dane.gov.pl/resources/1148786/file), [1148790](https://api.dane.gov.pl/resources/1148790/file).
- Formy nazwisk są rodzajowe (KOWALSKI/KOWALSKA w osobnych plikach M/K) — [1148808](https://api.dane.gov.pl/resources/1148808/file), [1148811](https://api.dane.gov.pl/resources/1148811/file).

#### Tabela pobranych plików (pobrane 17.10.2026, nic nie przekroczyło 300 MB)

Ścieżki względem `/Users/mpawelczuk/Post-pixel/dane-surowe/imiona-nazwiska/`. Źródło: `https://api.dane.gov.pl/resources/{ID}/file`.

| Plik lokalny | ID zasobu | Rozmiar (B) | Licencja | Stan danych | Zawartość |
|---|---|---|---|---|---|
| pesel-imiona-zyjacy/imiona_meskie_pierwsze_zyjacy_2026-01-20.xlsx | [1159669](https://api.dane.gov.pl/resources/1159669/file) | 968 212 | CC0 1.0 | 20.01.2026 | Imię pierwsze, mężczyźni żyjący, 46 202 imion |
| pesel-imiona-zyjacy/imiona_zenskie_pierwsze_zyjacy_2026-01-20.xlsx | [1159670](https://api.dane.gov.pl/resources/1159670/file) | 623 835 | CC0 1.0 | 20.01.2026 | Imię pierwsze, kobiety żyjące, 28 786 imion |
| pesel-imiona-zyjacy/imiona_meskie_drugie_zyjacy_2026-01-20.xlsx | [1159921](https://api.dane.gov.pl/resources/1159921/file) | 352 246 | CC0 1.0 | 20.01.2026 | Imię drugie, M, 16 055 imion, suma 10 833 041 |
| pesel-imiona-zyjacy/imiona_zenskie_drugie_zyjacy_2026-01-20.xlsx | [1159922](https://api.dane.gov.pl/resources/1159922/file) | 270 225 | CC0 1.0 | 20.01.2026 | Imię drugie, K, 12 029 imion, suma 11 586 278 |
| pesel-imiona-z-zmarlymi/imiona_meskie_pierwsze_z_zmarlymi_2026-01-20.xlsx | [1159637](https://api.dane.gov.pl/resources/1159637/file) | 1 029 274 | CC0 1.0 | 20.01.2026 | Imię pierwsze M, żyjący + zmarli |
| pesel-imiona-z-zmarlymi/imiona_zenskie_pierwsze_z_zmarlymi_2026-01-20.xlsx | [1159639](https://api.dane.gov.pl/resources/1159639/file) | 651 591 | CC0 1.0 | 20.01.2026 | Imię pierwsze K, żyjący + zmarli |
| pesel-imiona-zyjacy-2019/imiona_meskie_pierwsze_zyjacy_2019-07-18.csv | [18607](https://api.dane.gov.pl/resources/18607/file) | 219 183 | CC0 1.0 | 18.07.2019 | Imię pierwsze M żyjący (do porównania zgonów 2019–2026), 19 994 imion |
| pesel-imiona-zyjacy-2019/imiona_zenskie_pierwsze_zyjacy_2019-07-18.csv | [18609](https://api.dane.gov.pl/resources/18609/file) | 171 554 | CC0 1.0 | 18.07.2019 | j.w. K, 15 636 imion |
| imiona-nadane-dzieciom/imiona_pierwsze_dzieci_2000-2019.csv | [21457](https://api.dane.gov.pl/resources/21457/file) | 440 085 | CC0 1.0 | 2000–2019 | Rok, imię, liczba, płeć; cała Polska |
| imiona-nadane-dzieciom/{m,k}_pierwsze_2020.xlsx | [28020](https://api.dane.gov.pl/resources/28020/file), [28021](https://api.dane.gov.pl/resources/28021/file) | 25 420; 25 162 | CC0 1.0 | 2020 | Imię pierwsze dzieci M/K |
| imiona-nadane-dzieciom/{m,k}_pierwsze_2021.xlsx | [36393](https://api.dane.gov.pl/resources/36393/file), [36394](https://api.dane.gov.pl/resources/36394/file) | 26 432; 27 836 | CC0 1.0 | 2021 | j.w. |
| imiona-nadane-dzieciom/{m,k}_pierwsze_2022.xlsx | [44825](https://api.dane.gov.pl/resources/44825/file), [44824](https://api.dane.gov.pl/resources/44824/file) | 30 036; 29 150 | CC0 1.0 | 2022 | j.w. |
| imiona-nadane-dzieciom/{m,k}_pierwsze_2023.xlsx | [54099](https://api.dane.gov.pl/resources/54099/file), [54100](https://api.dane.gov.pl/resources/54100/file) | 30 498; 30 140 | CC0 1.0 | 2023 | j.w. |
| imiona-nadane-dzieciom/{m,k}_pierwsze_2024.xlsx | [63900](https://api.dane.gov.pl/resources/63900/file), [63899](https://api.dane.gov.pl/resources/63899/file) | 30 212; 38 061 | CC0 1.0 | 2024 | j.w. |
| imiona-nadane-dzieciom/{m,k}_pierwsze_2025.xlsx | [1159536](https://api.dane.gov.pl/resources/1159536/file), [1159538](https://api.dane.gov.pl/resources/1159538/file) | 30 176; 37 679 | CC0 1.0 | 2025 (pub. 20.01.2026) | j.w. |
| imiona-nadane-dzieciom/pierwsze_I_polowa_2026.csv | [2474883](https://api.dane.gov.pl/resources/2474883/file) | 14 697 | CC0 1.0 | I poł. 2026 (27.07.2026) | `IMIĘ_1;PŁEĆ;LICZBA`, M i K razem |
| imiona-nadane-dzieciom-wojewodztwa/{m,k}_pierwsze_woj_2019.xlsx | [21449](https://api.dane.gov.pl/resources/21449/file), [21451](https://api.dane.gov.pl/resources/21451/file) | 95 874; 98 746 | CC0 1.0 | 2019 | `WOJ, WOJEWÓDZTWO, IMIĘ_PIERWSZE, PŁEĆ, LICZBA_WYSTĄPIEŃ` |
| imiona-nadane-dzieciom-wojewodztwa/{m,k}_pierwsze_woj_2025.xlsx | [1159541](https://api.dane.gov.pl/resources/1159541/file), [1159548](https://api.dane.gov.pl/resources/1159548/file) | 108 610; 113 894 | CC0 1.0 | 2025 | j.w.; 16 województw + wiersze z pustym województwem (2025: 278 K, 322 M); w pliku 2019 ta kategoria nazywa się „Brak województwa rejestracji urodzenia”, więc podział jest wg województwa rejestracji urodzenia |
| imiona-nadane-dzieciom-usc/pierwsze_wg_usc_2025.xlsx | [1187350](https://api.dane.gov.pl/resources/1187350/file) | 802 899 | CC0 1.0 | 2025 (pub. 04.02.2026) | `KT_USC, WOJEWÓDZTWO, POWIAT, GMINA, IMIĘ_PIERWSZE, PŁEĆ, LICZBA_WYSTĄPIEŃ` |
| pesel-nazwiska-zyjacy/nazwiska_meskie_zyjacy_2026-01-20.xlsx | [1148808](https://api.dane.gov.pl/resources/1148808/file) | 7 621 712 | CC0 1.0 | 20.01.2026 | 408 182 nazwisk męskich, kraj |
| pesel-nazwiska-zyjacy/nazwiska_zenskie_zyjacy_2026-01-20.xlsx | [1148811](https://api.dane.gov.pl/resources/1148811/file) | 7 972 934 | CC0 1.0 | 20.01.2026 | 420 082 nazwisk żeńskich, kraj |
| pesel-nazwiska-wojewodztwa/nazwiska_meskie_wg_woj_2026-01-20.xlsx | [1148786](https://api.dane.gov.pl/resources/1148786/file) | 12 159 696 | CC0 1.0 | 20.01.2026 | Nazwiska M × 16 woj. zameldowania na pobyt stały |
| pesel-nazwiska-wojewodztwa/nazwiska_zenskie_wg_woj_2026-01-20.xlsx | [1148790](https://api.dane.gov.pl/resources/1148790/file) | 13 158 936 | CC0 1.0 | 20.01.2026 | Nazwiska K × 16 woj. |
| gdansk-imiona-dzieci/gdansk_imiona_dzieci_2015-2018.xlsx | [22111](https://api.dane.gov.pl/resources/22111/file) | 61 164 | CC BY 4.0 (Otwarty Gdańsk) | 2015–2018 (pub. 17.08.2018) | Arkusze 2015–2018: imię żeńskie/męskie + liczba; dzieci zameldowane w Gdańsku |

Razem około 47 MB. Nie pobrano (dostępne, wszystkie poniżej 300 MB): nazwiska wg województw 31.12.2017 z zmarłymi ([8162](https://api.dane.gov.pl/resources/8162/file) CSV 18 609 520 B, [8155](https://api.dane.gov.pl/resources/8155/file) CSV 19 625 765 B), nazwiska z zmarłymi 2026 ([1148815](https://api.dane.gov.pl/resources/1148815/file) 8 382 176 B i M odpowiednik w zbiorze 568), imiona wg USC 2024 ([63936](https://api.dane.gov.pl/resources/63936/file), 846 396 B), imiona drugie dzieci 2019–2025 (np. [1159552](https://api.dane.gov.pl/resources/1159552/file), [1159559](https://api.dane.gov.pl/resources/1159559/file)), imiona drugie z zmarłymi ([1159889](https://api.dane.gov.pl/resources/1159889/file), [1159892](https://api.dane.gov.pl/resources/1159892/file)).

#### Próbki: imiona w rejestrze PESEL, stan 20.01.2026
- TOP 15 imion pierwszych, mężczyźni żyjący: Piotr 682 516, Krzysztof 631 898, Tomasz 533 217, Andrzej 513 749, Paweł 502 076, Michał 492 326, Jan 462 503, Marcin 447 274, Jakub 433 692, Adam 400 572, Łukasz 382 274, Mateusz 377 592, Grzegorz 369 675, Marek 369 240, Stanisław 348 827 — [1159669](https://api.dane.gov.pl/resources/1159669/file).
- TOP 15 kobiety żyjące: Anna 1 063 756, Katarzyna 602 474, Małgorzata 572 067, Maria 566 902, Agnieszka 544 968, Ewa 469 822, Barbara 467 697, Magdalena 434 117, Elżbieta 404 679, Joanna 401 861, Aleksandra 390 147, Krystyna 383 140, Monika 376 767, Zofia 360 466, Natalia 320 219 — [1159670](https://api.dane.gov.pl/resources/1159670/file).
- Zmarli (różnica „z zmarłymi” minus „żyjący”), TOP 10 M: Jan 644 426, Stanisław 612 421, Józef 503 955, Tadeusz 297 342, Kazimierz 255 035, Henryk 254 750, Władysław 251 836, Andrzej 231 266, Jerzy 229 759, Marian 222 183; K: Maria 453 655, Janina 381 783, Zofia 371 464, Helena 352 045, Marianna 341 390, Anna 309 428, Stanisława 259 782, Jadwiga 235 903, Krystyna 224 629, Irena 206 320 — obliczenia na [1159637](https://api.dane.gov.pl/resources/1159637/file)/[1159669](https://api.dane.gov.pl/resources/1159669/file) i [1159639](https://api.dane.gov.pl/resources/1159639/file)/[1159670](https://api.dane.gov.pl/resources/1159670/file).
- Imiona drugie żyjących, TOP 5 M: Jan 634 330, Piotr 602 066, Stanisław 442 251, Andrzej 403 006, Paweł 397 738; K: Maria 1 463 775, Anna 896 075, Katarzyna 417 253, Barbara 400 538, Ewa 371 367 — [1159921](https://api.dane.gov.pl/resources/1159921/file), [1159922](https://api.dane.gov.pl/resources/1159922/file).
- Rejestr żyjących obejmuje też cudzoziemców z numerem PESEL: między 18.07.2019 a 20.01.2026 najbardziej przybyło imion Oleksandr (+95 200), Andrii (+58 305), Serhii (+56 423), Dmytro (+51 616), Tetiana (+81 684), Nataliia (+76 640), Olena (+72 277), Iryna (+69 181) — obliczenia na [18607](https://api.dane.gov.pl/resources/18607/file)/[18609](https://api.dane.gov.pl/resources/18609/file) i [1159669](https://api.dane.gov.pl/resources/1159669/file)/[1159670](https://api.dane.gov.pl/resources/1159670/file).

### Inferences
- Suma żyjących w listach imion (ok. 44,05 mln) jest wyraźnie wyższa niż liczba mieszkańców Polski, więc lista obejmuje także emigrantów z aktywnym PESEL i cudzoziemców (m.in. Ukraińców z PESEL po 2022 r.). Generator „rdzennych” mieszkańców powinien odfiltrować transliteracje ukraińskie (końcówki -II, -IIA, Oleksandr, Tetiana itd.) albo trzymać je w osobnej, sterowanej puli „przyjezdnych”. Liczbę mieszkańców wg GUS trzeba wziąć z notatek demograficznych, tu jej nie weryfikowałem.
- Plik nazwisk wg województw sumuje się do ok. 33,9 mln (M+K) wobec ok. 42,8 mln w pliku krajowym, bo obejmuje tylko osoby zameldowane na pobyt stały i wycina wiersze z liczbą 1 w danym województwie. Do generatora to bez znaczenia (liczą się proporcje), ale rzadkie nazwiska lokalne są w nim niedoszacowane.
- CC0 nie wymaga atrybucji, ale warto w stopce/kredytach dopisać „Imiona i nazwiska: rejestr PESEL, Ministerstwo Cyfryzacji, dane.gov.pl (CC0)”. Plik z Gdańska (CC BY 4.0) wymaga podania źródła i daty pozyskania, jeśli trafi do gry.
- Katalog `dane-surowe/` nie jest w `.gitignore` projektu (ok. 47 MB samych plików z imionami i nazwiskami), więc przed commitem trzeba zdecydować, czy surowe dane idą do repo, czy tylko przetworzone tabele.

### Gaps
- Województwo w plikach imion dzieci to województwo rejestracji urodzenia (wynika z etykiety „Brak województwa rejestracji urodzenia” w pliku 2019, [21451](https://api.dane.gov.pl/resources/21451/file)), a nie zamieszkania rodziców; opis zbioru tego nie mówi wprost. Plik wg USC też odzwierciedla miejsce rejestracji (zwykle gmina ze szpitalem), więc małe gminy bez porodówki będą w nim puste, a miasta z dużymi szpitalami zawyżone. To wniosek z nazw kolumn, nie z dokumentacji.

## 2. Imiona według roku urodzenia (kohorty) i rekonstrukcja dla urodzonych ok. 1930–2000

### Takeaway
Otwartych danych „imię × rok urodzenia” dla osób żyjących nie ma; dokładne roczne listy zaczynają się w 2000 r. Taki przekrój istnieje jednak w samym PESEL (IJP PAN dostał mikrodane imię, płeć, rok urodzenia, gmina rejestracji 1901–2010 do badań), więc najlepsza droga to wniosek do Ministerstwa Cyfryzacji o zagregowane TOP-100 na rok urodzenia; do tego czasu kohorty da się dość wiarygodnie zrekonstruować z różnicy list „żyjący / z zmarłymi / żyjący 2019” i dokładnych list dzieci 2000–2026.

### Cited Findings
- Zbiór 1667 i 1501 nie mają kolumny roku urodzenia ani wieku (tylko imię, płeć, liczba) — [1159669](https://api.dane.gov.pl/resources/1159669/file), [API 1667](https://api.dane.gov.pl/1.4/datasets/1667,lista-imion-wystepujacych-w-rejestrze-pesel-osoby-zyjace).
- Lista imion dzieci zaczyna się od 2000 r. (plik zbiorczy 2000–2019, potem roczne) — [API zasobów 219](https://api.dane.gov.pl/1.4/datasets/219/resources?per_page=100), [21457](https://api.dane.gov.pl/resources/21457/file).
- Paweł Swoboda (IJP PAN), Onomastica LXI/2 (2017), „Akcja i reakcja. Zmiany w imiennictwie Polaków w czasie drugiej wojny światowej”: materiał „pochodzi z Powszechnego Elektronicznego Systemu Ewidencji Ludności (PESEL)” i obejmuje imię, płeć, rok urodzenia i siedmiocyfrowy kod TERYT miejsca rejestracji urodzenia, tylko obywatele polscy; analizuje listę 100 najczęstszych imion w latach 1901–2010 i wymianę 13 imion męskich i 11 żeńskich w TOP-100 między 1944 a 1945 — [Onomastica, DOI 10.17651/ONOMAST.61.2.17](https://onomastica.ijppan.pl/index.php/ONOM/article/download/180/120).
- Ten sam autor: „Imiona częste w Polsce w latach 1995-2010 oraz ich zróżnicowanie w czasie i przestrzeni”, Onomastica 57 (2013), s. 19–69 (nie czytałem treści) — [bazhum, strona autora](https://bazhum.muzhp.pl/authors/23234).
- Kazimierz Rymut, „Słownik imion współcześnie w Polsce używanych” (IJP PAN, Kraków 1995) obejmuje imiona wszystkich obywateli żyjących w Polsce w kwietniu 1994 r.; wg wyszukiwarki dostępny cyfrowo w RCIN (nie weryfikowałem licencji ani tego, czy ma podział na roczniki) — streszczenie wyników wyszukiwania wskazujące na [Onomastica, art. 533](https://onomastica.ijp.pan.pl/index.php/ONOM/article/view/533/730).
- Ranking dwóch najczęstszych imion na rocznik 1970–2012 „ze statystyk MSW” publikuje portal Eska (źródło wtórne, bez wskazania publikacji MSW), np. 1970–71: Beata, Anna / Piotr, Krzysztof; 1977–80: Agnieszka, Anna / Tomasz, Marcin; 1983–86: Anna, Katarzyna / Łukasz, Marcin; 1990–91: Katarzyna, Anna / Mateusz, Łukasz; 1995: Karolina, Aleksandra / Mateusz, Michał; 1998–2000: Aleksandra, Natalia / Mateusz, Jakub — [Eska](https://www.eska.pl/news/imiona_najpopularniejsze_na_przestrzeni_lat_ktore_krolowaly_w_roku_twojego_urodzenia/152348). Dla 2000 r. zgadza się to z oficjalnymi danymi tylko częściowo: w pliku MC prowadzą Natalia (6,2%) i Aleksandra (5,8%) oraz Jakub (7,3%) i Mateusz (5,8%) — [21457](https://api.dane.gov.pl/resources/21457/file).
- Prof. Marian Jurkowski w Wprost: do późnych lat 50. nadawano te same imiona co przed wojną, a lata 70. przyniosły modę na imiona apostołów (według streszczenia wyszukiwarki, artykułu nie czytałem w całości) — [Wprost](https://www.wprost.pl/6516).
- Badania lokalne oparte na księgach parafialnych, nie na PESEL: Ilnicka 2022, imiona chłopców w parafii częstochowskiej 1950–1955 i 1980–1985 — [PDF, ZBC UZ](https://www.zbc.uz.zgora.pl//Content/70221/9_Ilnicka_imiona.pdf); parafia w Tczycy 1946–1951 vs 2016–2021, 228 imion na 723 ochrzczonych — [Repozytorium UŁ](https://repozytorium.uni.lodz.pl/handle/11089/52275).

#### Próbka: sygnał wieku w danych PESEL (obliczenia własne)
„Żyjący sprzed 2000” = żyjący 20.01.2026 minus suma nadań 2000–2025; „% zmarłych” = zmarli / (zmarli + żyjący sprzed 2000). Zmarli to osoby z PESEL zmarłe od uruchomienia rejestru, więc ten wskaźnik rośnie z wiekiem kohorty — [1159669](https://api.dane.gov.pl/resources/1159669/file), [1159637](https://api.dane.gov.pl/resources/1159637/file), [1159670](https://api.dane.gov.pl/resources/1159670/file), [1159639](https://api.dane.gov.pl/resources/1159639/file), [21457](https://api.dane.gov.pl/resources/21457/file).

| Imię (K) | żyjący „sprzed 2000” | zmarli | % zmarłych | Imię (M) | żyjący „sprzed 2000” | zmarli | % zmarłych |
|---|---|---|---|---|---|---|---|
| Janina | 195 991 | 381 783 | 66% | Józef | 180 957 | 503 955 | 74% |
| Krystyna | 380 569 | 224 629 | 37% | Stanisław | 281 017 | 612 421 | 69% |
| Halina | 225 993 | 132 988 | 37% | Kazimierz | 126 014 | 255 035 | 67% |
| Teresa | 310 078 | 161 967 | 34% | Jerzy | 215 217 | 229 759 | 52% |
| Danuta | 284 679 | 101 645 | 26% | Zbigniew | 248 211 | 147 985 | 37% |
| Elżbieta | 400 541 | 114 937 | 22% | Andrzej | 504 607 | 231 266 | 31% |
| Grażyna | 222 772 | 39 331 | 15% | Piotr | 578 430 | 137 154 | 19% |
| Bożena | 194 208 | 32 928 | 14% | Krzysztof | 572 170 | 106 639 | 16% |
| Agnieszka | 526 480 | 50 741 | 9% | Tomasz | 476 093 | 50 621 | 10% |
| Renata | 185 048 | 16 782 | 8% | Marcin | 411 821 | 28 593 | 6% |
| Magdalena | 371 988 | 21 586 | 5% | Łukasz | 340 618 | 15 446 | 4% |
| Beata | 274 714 | 12 295 | 4% | Mateusz | 228 715 | 9 691 | 4% |

Kolumny: imię, żyjący urodzeni przed 2000 (żyjący 2026 minus suma urodzeń 2000–2025), zmarli, odsetek zmarłych. Kolejność dobrze oddaje znane fale mody (Janina/Józef najstarsze, Beata/Łukasz najmłodsze). Najbardziej „stare” imiona (≥100 tys. nosicieli, udział zmarłych): Bronisława 83%, Władysława 79%, Józefa 79%, Stefania 79%, Marianna 76%, Genowefa 75%; Władysław 80%, Stefan 75%, Józef 73%, Czesław 72%, Zygmunt 71%, Mieczysław 69%. Największe spadki żyjących 2019→2026 (czyli zgony, głównie roczniki przedwojenne i wojenne): Janina −69 769, Krystyna −68 101, Maria −58 451, Teresa −52 213; Stanisław −65 320, Andrzej −64 606, Józef −63 735, Jan −54 096, Jerzy −50 538 — obliczenia na [1159669](https://api.dane.gov.pl/resources/1159669/file), [1159670](https://api.dane.gov.pl/resources/1159670/file), [1159637](https://api.dane.gov.pl/resources/1159637/file), [1159639](https://api.dane.gov.pl/resources/1159639/file), [18607](https://api.dane.gov.pl/resources/18607/file), [18609](https://api.dane.gov.pl/resources/18609/file), [21457](https://api.dane.gov.pl/resources/21457/file) i plikach rocznych 2020–2025.

TOP 12 imion wg dekad urodzenia z oficjalnych danych (udział w dekadzie):
- 2000–2009 K: Julia 7,2%, Wiktoria 5,8%, Natalia 4,9%, Aleksandra 4,6%, Oliwia 3,8%, Zuzanna 3,8%, Weronika 3,2%, Martyna 2,8%, Karolina 2,8%, Maja 2,6%, Klaudia 2,3%, Anna 2,3%; M: Jakub 8,1%, Kacper 5,5%, Mateusz 4,9%, Michał 3,7%, Szymon 3,3%, Dawid 3,1%, Bartosz 2,9%, Patryk 2,6%, Piotr 2,5%, Kamil 2,5%, Filip 2,4%, Maciej 2,2% — [21457](https://api.dane.gov.pl/resources/21457/file).
- 2010–2019 K: Julia 5,4%, Lena 4,7%, Zuzanna 4,6%, Maja 4,6%, Zofia 3,5%, Hanna 3,3%, Amelia 3,2%, Aleksandra 2,8%, Wiktoria 2,8%, Oliwia 2,8%, Natalia 2,6%, Alicja 2,6%; M: Jakub 4,9%, Szymon 3,8%, Filip 3,6%, Antoni 3,5%, Jan 3,4%, Kacper 3,4%, Aleksander 2,7%, Wojciech 2,6%, Michał 2,6%, Franciszek 2,5%, Mikołaj 2,5%, Adam 2,5% — [21457](https://api.dane.gov.pl/resources/21457/file).
- 2020–2025 K: Zofia 3,7%, Zuzanna 3,7%, Maja 3,4%, Hanna 3,4%, Julia 3,3%, Laura 3,2%, Oliwia 2,8%, Alicja 2,7%, Pola 2,5%, Lena 2,4%, Maria 2,4%, Emilia 2,1%; M: Antoni 4,2%, Jan 4,0%, Aleksander 3,8%, Nikodem 3,6%, Franciszek 3,6%, Jakub 3,3%, Leon 3,2%, Mikołaj 2,8%, Stanisław 2,7%, Ignacy 2,7%, Filip 2,5%, Szymon 2,5% — pliki roczne 2020–2025, np. [1159536](https://api.dane.gov.pl/resources/1159536/file), [1159538](https://api.dane.gov.pl/resources/1159538/file).
- Sumy roczne w listach dzieci (≈ liczba zarejestrowanych urodzeń): 2000 384 405, 2010 445 855, 2020 363 419, 2023 284 015, 2024 260 770, 2025 246 192, I poł. 2026 113 493 — obliczenia na [21457](https://api.dane.gov.pl/resources/21457/file) i plikach rocznych.

### Inferences
- Rekonstrukcja kohort 1920–1999 (propozycja): dla każdego imienia przyjąć rozkład roku urodzenia (np. log-normalny lub mieszanina dwóch dla imion „wracających” jak Zofia, Antoni, Julia) i dopasować go do trzech liczb z PESEL: żyjący 2026 sprzed 2000, zmarli (rejestr od 1979), spadek żyjących 2019→2026. Wagi kohort brać z liczby urodzeń GUS i tablic trwania życia (prawdopodobieństwo przeżycia do 2026 i zgonu po 1979). Dla 2000–2026 używać list oficjalnych wprost. Ograniczenie: suma udziałów imion w każdym roczniku = 1. Jako punkty kontrolne wziąć ranking z Eski (z zastrzeżeniem, że to źródło wtórne) i wnioski Swobody.
- Prostsza wersja do gry: podzielić imiona sprzed 2000 na 4–5 koszyków wieku wg odsetka zmarłych (np. >60% → roczniki 1920–1945, 30–60% → 1940–1960, 12–30% → 1950–1970, 5–12% → 1965–1985, <5% → 1975–1999), a w koszyku losować proporcjonalnie do liczby żyjących. To da kobiecie z 1958 r. Krystynę, Teresę, Danutę, Halinę, Elżbietę czy Barbarę, a z 1985 r. Agnieszkę, Katarzynę, Magdalenę, Joannę. Imiona z dwoma szczytami (Zofia, Antoni, Julia, Stanisław, Jan) wymagają ręcznego rozdzielenia na „starą” i „nową” falę, bo sam odsetek zmarłych je myli (Zofia 62%, Julia 43%, Antoni 75% mimo boomu po 2010).
- Najczystsze rozwiązanie: wniosek do Ministerstwa Cyfryzacji o ponowne wykorzystanie / udostępnienie zagregowanego zestawienia „TOP-100 imion pierwszych wg roku urodzenia i płci, 1920–1999, osoby żyjące i zmarłe”. Skoro taki przekrój został wydany IJP PAN do badań, technicznie istnieje. Liczby zagregowane z progiem są mało ryzykowne pod RODO.

### Gaps
- Nie znalazłem żadnej oficjalnej, otwartej tabeli imion wg roku urodzenia przed 2000 r. ani pierwotnej publikacji MSW z rankingiem 1970–2012 (jest tylko wtórna Eska).
- Nie czytałem artykułu Swobody z 2013 r. ani słownika imion Rymuta (1995); nie wiem, czy podają rozkłady wg roczników w formie tabel, ani na jakiej licencji jest wersja w RCIN.
- Nie mam w tych notatkach danych GUS o urodzeniach 1920–1999 i tablic trwania życia potrzebnych do rekonstrukcji (powinny być w notatkach demograficznych).

## 3. Regionalny rozkład nazwisk: dane województw, źródła historyczne, co wolno wykorzystać

### Takeaway
Do regionalizacji nazwisk wystarczą pliki PESEL „wg województwa zameldowania na pobyt stały” (20.01.2026, CC0): bardzo wyraźnie pokazują nazwiska kaszubskie w pomorskim, śląskie (w tym cieszyńskie) w śląskim, „-ak/-iak” w wielkopolskim i „-uk” w lubelskim. Niższego poziomu (powiat, gmina) w danych otwartych nie ma; słownik Rymuta (PESEL 1990, 49 dawnych województw) i ISNP IJP PAN nie mają otwartej licencji, a moikrewni.pl przekierowuje dziś na komercyjny MyHeritage.

### Cited Findings
#### Próbki z pliku województw (mężczyźni, 20.01.2026, obliczenia własne)
- TOP 12 pomorskie: Wiśniewski 3 407, Kamiński 3 171, Lewandowski 3 145, Kowalski 3 084, Jankowski 2 837, Nowak 2 780, Zieliński 2 622, Szymański 2 586, Dąbrowski 2 376, Grabowski 2 120, Kwiatkowski 1 965, Kozłowski 1 908 — [1148786](https://api.dane.gov.pl/resources/1148786/file).
- TOP 12 śląskie: Nowak 12 756, Kowalski 4 848, Wójcik 4 586, Wieczorek 4 194, Krawczyk 3 949, Sikora 3 781, Mazur 3 755, Wróbel 3 696, Kowalczyk 3 627, Kamiński 3 345, Duda 3 256, Dudek 3 247 — [1148786](https://api.dane.gov.pl/resources/1148786/file).
- TOP 12 wielkopolskie: Nowak 16 077, Kaczmarek 11 056, Woźniak 5 922, Wojciechowski 5 845, Kowalski 5 838, Szymański 5 672, Ratajczak 5 104, Wiśniewski 4 966, Michalak 4 940, Pawlak 4 796, Kubiak 4 792, Marciniak 4 768 — [1148786](https://api.dane.gov.pl/resources/1148786/file).
- TOP 15 kraj (M): Nowak 98 387, Kowalski 66 589, Wiśniewski 53 079, Wójcik 47 734, Kowalczyk 46 994, Kamiński 45 818, Lewandowski 44 466, Zieliński 43 931, Woźniak 42 550, Szymański 42 412, Dąbrowski 41 552, Kozłowski 36 244, Mazur 34 576, Jankowski 33 109, Kwiatkowski 31 900 — [1148808](https://api.dane.gov.pl/resources/1148808/file).
- Nazwiska wyróżniające (procent wszystkich nosicieli z pliku województw mieszkający w danym województwie, w nawiasie liczba w województwie):
  - Pomorskie (kaszubskie i pomorskie; n≥800): Kwidziński 94% (1 222), Miotk 93% (1 229), Formela 92% (1 687), Stenka 92%, Formella 91%, Labuda 90% (1 526), Wenta 90%, Mielewczyk 90% (1 530), Richert 90%, Potrykus 88%, Konkel 88%, Pobłocki 87%, Kreft 86% (1 786), Treder 85%, Płotka 79%, Konkol 76%, Okrój 75%; przy n≥300 także Damps 96%, Lademann 96%, Klinkosz 96%, Walkusz 95%, Hinca 95%, Wittbrodt 94%, Dettlaff 93%, Dampc 93%, Naczk 93%, Białk 93%, Ellwart 93%.
  - Śląskie (n≥400): Kuśka 96%, Juroszek 96%, Marcol 94%, Konsek 94%, Faruga 94%, Waleczek 93%, Karwot 93%, Rduch 93%, Szołtysek 92%, Nowok 92%, Fojcik 92% (856), Krzempek 91%, Bujok 91%, Herok 90%, Cieślar 88% (1 244), Chrobok 87%, Sobik 86%; większe: Musioł 78% (1 372), Kubica 68% (2 472), Polok 79%, Poloczek 83%, Kuczera 68%, Mrowiec 65%.
  - Wielkopolskie: Bartkowiak 69% (3 583), Wojtkowiak 69%, Jankowiak 68%, Grześkowiak 67%, Ratajczak 66% (5 104), Szymkowiak 66%, Frąckowiak 65%, Stachowiak 63% (3 814), Maćkowiak 61%, Napierała 63%, Dolata 60%.
  - Małopolskie: Bodziony 72%, Batko 72%, Rapacz 71%, Suder 69%, Gucwa 63%, Poręba 56%, Tokarczyk 55%, Chowaniec 50%, Oleksy 49%.
  - Podkarpackie: Pociask 81%, Pelczar 68%, Kuźniar 64%, Szmyd 61%, Kielar 58%, Ziobro 56%, Sudoł 50%, Pelc 49%.
  - Lubelskie: Sulowski 67%, Mitura 57%, Stachyra 53%, Semeniuk 44%, Mielniczuk 43%, Adamczuk 43%, Maksymiuk 40%, Panasiuk 37%, Flis 36%.
  - Podlaskie: Zajkowski 49%, Perkowski 48%, Roszkowski 48%, Łapiński 47% (1 959), Chojnowski 33%, Modzelewski 33%, Kulesza 24%.
  - Mazowieckie: Roguski 74%, Zawadka 72%, Dmowski 68%, Krasnodębski 68%, Kalbarczyk 57%, Napiórkowski 54%.
  - Opolskie (małe, n≥250): Kampa 55%, Mateja 19%, Baron 13%, Kokot 12%, Wolny 12%.
  - Zachodniopomorskie (n≥150): najwyżej Bodnar 25%, Rynkiewicz 16%, Wojtkiewicz 15%, Czerniawski 13%, czyli brak nazwisk naprawdę lokalnych.
  - Źródło dla całej listy: obliczenia na [1148786](https://api.dane.gov.pl/resources/1148786/file); wyniki dla kobiet (plik [1148790](https://api.dane.gov.pl/resources/1148790/file)) są niemal identyczne (Kwidzińska, Miotk, Formela, Labuda, Kreft…; Fojcik, Cieślar, Sobik, Tkocz, Polok…).
- Udział mężczyzn noszących nazwisko „lokalne” (≥50% krajowych nosicieli w tym województwie, n_kraj≥20): małopolskie 20,5%, pomorskie 20,2%, śląskie 19,8%, wielkopolskie 18,1%, podlaskie 17,2%, podkarpackie 17,0%, mazowieckie 13,1%, lubelskie 12,8%, łódzkie 7,8%, kujawsko-pomorskie 7,1%, świętokrzyskie 6,1%, opolskie 5,3%, warmińsko-mazurskie 3,0%, dolnośląskie 2,9%, lubuskie 1,6%, zachodniopomorskie 1,1% — obliczenia na [1148786](https://api.dane.gov.pl/resources/1148786/file).
- Nazwiska z dawnym podziałem: zbiór 568 ma pliki wg województw tylko dla stanu 31.12.2017 (z zmarłymi) — [API zasobów 568](https://api.dane.gov.pl/1.4/datasets/568/resources?per_page=100).

#### Źródła historyczne i inne serwisy
- „Słownik nazwisk współcześnie w Polsce używanych” K. Rymuta (10 tomów, IJP PAN 1992–1994) oparty na bazie PESEL z 1990 r. (ok. 94% ludności), z liczbą nosicieli w kraju i w każdym z 49 województw z lat 1975–1998; wersja online udostępniona przez Ośrodek Dokumentacji Wychodźstwa Polskiego w Pułtusku pod herby.com.pl; tekst JRI-Poland (2002) nie podaje licencji — [JRI-Poland](https://jri-poland.org/blog/slownik-nazwisk-online/).
- Według przeglądu w Onomastice słownik Rymuta podaje dane z 1990 r. dla 405 670 nazwisk, które autorzy uznają za częściowo nieaktualne — streszczenie wyszukiwarki dla [Onomastica, art. 533](https://onomastica.ijp.pan.pl/index.php/ONOM/article/view/533/730).
- Internetowy Słownik Nazwisk w Polsce (ISNP, IJP PAN): ok. 30 tys. najczęstszych nazwisk (75–80% obywateli), w hasłach 16 województw oraz 16 powiatów i 16 gmin o największej frekwencji; teraz „wersja 2.0 (2025-2030)”, stopka „© 2026 - Instytut Języka Polskiego PAN”, bez licencji ani regulaminu na stronie głównej — [ISNP](https://nazwiska.ijppan.pl/); opis zakresu wg wyników wyszukiwania (m.in. [instalki.pl](https://www.instalki.pl/news/internet/internetowy-slownik-nazwisk-w-polsce-sprawdz-pochodzenie-i-znaczenie-swojego-nazwiska/)).
- moikrewni.pl 17.10.2026 odpowiada przekierowaniem 302 na www.myheritage.pl (serwis komercyjny) — sprawdzone bezpośrednio przy pobraniu https://moikrewni.pl/.

### Inferences
- Legalnie i bez kłopotu do gry nadają się tylko pliki PESEL z dane.gov.pl (CC0). Rymut 1990 na herby.com.pl, ISNP i MyHeritage/moikrewni mogą służyć najwyżej do ręcznego sprawdzenia, nie do kopiowania tabel.
- Pomysł na tabelę w grze: dla każdego województwa 200–300 nazwisk M i K ważonych liczbą, w tym ok. 50–100 o najwyższym wskaźniku lokalności, plus wspólna pula krajowa. Losowanie: z prawdopodobieństwem równym udziałowi „lokalnych” (np. ok. 20% w pomorskim, ok. 1% w zachodniopomorskim) nazwisko z puli lokalnej, w pozostałych przypadkach z rozkładu województwa. Gdańsk/Przymorze dostaje wtedy Formelę, Labudę i Krefta obok Wiśniewskich, a Szczecin prawie same nazwiska ogólnopolskie i kresowe „-wicz”, co zgadza się z powojennym zasiedleniem ziem zachodnich (to ostatnie to wniosek, nie liczba z danych).
- Lore zakazuje nazwisk prawdziwych polityków. Lista „wyróżniających” zawiera m.in. Tusk (pomorskie, 316 mężczyzn), Ziobro (podkarpackie), Sasin (mazowieckie), a pula krajowa Dudę, Kaczmarka itd. Rzadkie nazwiska rozpoznawalnych polityków trzeba wyciąć z puli całkiem, a przy częstych (Duda, Nowak) blokować tylko połączenia imię+nazwisko znanych osób.
- Ryzyko „trafienia” w prawdziwą osobę rośnie przy rzadkich nazwiskach lokalnych (np. 300 nosicieli w jednym województwie). Bezpieczniej brać do gry nazwiska z co najmniej kilkuset nosicielami w kraju i nie łączyć ich z prawdziwym adresem w sposób sugerujący konkretną rodzinę.

### Gaps
- Nie ma otwartych danych nazwisk na poziomie powiatu ani gminy; nie sprawdzałem, czy Ministerstwo wyda je na wniosek.
- Nie przeczytałem regulaminu MyHeritage ani ewentualnej podstrony „o słowniku” w ISNP (`/info/oslowniku`), więc nie wiem, czy IJP PAN dopuszcza jakiekolwiek ponowne wykorzystanie.
- Nie zweryfikowałem, czy herby.com.pl nadal hostuje dane Rymuta i na jakich warunkach.

## 4. Trendy imion do generowania dzieci urodzonych 2026–2050

### Takeaway
Na 2026 r. są już dane z I półrocza (Zofia i Nikodem na czele). Trend od 2015 r. to powrót imion pradziadków (Antoni, Franciszek, Stanisław, Ignacy, Zofia, Helena, Jadwiga, Wanda, Stefania), krótkie imiona międzynarodowe (Leon, Leo, Liam, Milan, Laura, Pola, Nel) i szybki zanik imion z lat 80. i 90.; to dobra baza do ekstrapolacji na lata 2026–2035, a dalej do kontrolowanego losowania w duchu satyry.

### Cited Findings
- TOP 10 imion dziewczynek: 2000 Natalia 6,2%, Aleksandra 5,8%, Wiktoria 5,4%, Julia 5,4%, Weronika 5,2%, Karolina, Klaudia, Paulina, Patrycja, Katarzyna; 2010 Julia 7,1%, Maja 5,7%, Zuzanna 4,7%, Lena 4,0%, Wiktoria, Amelia, Oliwia, Aleksandra, Natalia, Zofia; 2015 Zuzanna 4,8%, Lena 4,7%, Julia 4,6%, Maja 4,3%, Zofia, Hanna, Amelia, Aleksandra, Alicja, Natalia; 2025 Zofia 3,7%, Zuzanna 3,2%, Maja 3,2%, Laura 3,2%, Hanna 2,9%, Julia 2,7%, Oliwia 2,6%, Pola 2,3%, Alicja 2,3%, Emilia 2,1%; I poł. 2026 Zofia 3,9%, Zuzanna 3,3%, Maja 3,3%, Hanna 3,0%, Laura 3,0%, Oliwia 2,5%, Pola 2,5%, Julia 2,4%, Alicja 2,3%, Antonina 2,2% — [21457](https://api.dane.gov.pl/resources/21457/file), [1159538](https://api.dane.gov.pl/resources/1159538/file), [2474883](https://api.dane.gov.pl/resources/2474883/file).
- TOP 10 chłopców: 2000 Jakub 7,3%, Mateusz 5,8%, Kacper 4,5%, Michał 4,3%, Patryk 3,9%, Dawid, Kamil, Piotr, Szymon, Paweł; 2010 Jakub 6,0%, Szymon 4,5%, Kacper 3,9%, Filip 3,8%, Michał, Mateusz, Bartosz, Adam, Wojciech, Wiktor; 2015 Jakub 4,4%, Antoni 4,0%, Szymon 3,7%, Jan 3,6%, Filip, Kacper, Aleksander, Franciszek, Mikołaj, Wojciech; 2025 Nikodem 4,6%, Antoni 4,2%, Leon 4,0%, Jan 4,0%, Aleksander 3,7%, Franciszek 3,6%, Ignacy 3,3%, Stanisław 2,8%, Jakub 2,7%, Mikołaj 2,5%; I poł. 2026 Nikodem 4,6%, Antoni 4,4%, Jan 4,1%, Leon 4,0%, Franciszek 3,9%, Aleksander 3,7%, Ignacy 3,7%, Stanisław 3,2%, Jakub 2,5%, Mikołaj 2,4% — [21457](https://api.dane.gov.pl/resources/21457/file), [1159536](https://api.dane.gov.pl/resources/1159536/file), [2474883](https://api.dane.gov.pl/resources/2474883/file).
- Liczby z komunikatów MC zgadzają się z plikami (portal opisuje je jako „drugą połowę 2025”, ale to wartości z pliku całorocznego 2025): 2025 Zofia 4 415, Zuzanna 3 881, Maja 3 873, Laura 3 821; Nikodem 5 772, Antoni 5 253, Leon 5 079; I poł. 2026 Zofia 2 166, Nikodem 2 665 — [xyz.pl, cytuje MC](https://xyz.pl/dzieje-sie/zofia-i-nikodem-poznalismy-najpopularniejsze-imiona-nadawane-w-drugiej-polowie-2025-r-4008) i obliczenia na [1159538](https://api.dane.gov.pl/resources/1159538/file), [1159536](https://api.dane.gov.pl/resources/1159536/file), [2474883](https://api.dane.gov.pl/resources/2474883/file).
- Najszybciej rosnące 2020→2025 (zmiana udziału, n2025≥200), dziewczynki: Emiliia 26,8× (10→200), Adelina 14,8× (24→250), Jaśmina 8,8× (160→964), Sofiia 8,0×, Felicja 4,3× (131→384), Nel 3,8× (191→496), Milana 3,5×, Sofia 3,5×, Aurelia 3,2× (588→1 268), Rozalia 3,1× (867→1 814), Wanda 2,5×, Zoja 2,5×, Stefania 2,2×, Emma 2,1×, Róża 2,0×, Jadwiga 1,7×. Chłopcy: Liam 6,6× (70→317), Mark 5,6× (136→521), Teodor 3,7× (488→1 221), David 3,0×, Leo 2,6×, Milan 2,5×, Florian 2,3×, Beniamin 2,3×, Feliks 2,2×, Henryk 2,1× (703→985), Nikodem 2,0× (4 171→5 772), Leonard 1,8×, Tadeusz 1,8× (876→1 050), Gabriel 1,7×, Józef 1,6×, Kazimierz 1,6×, Ignacy 1,6× — obliczenia na plikach 2020 ([28020](https://api.dane.gov.pl/resources/28020/file), [28021](https://api.dane.gov.pl/resources/28021/file)) i 2025 ([1159536](https://api.dane.gov.pl/resources/1159536/file), [1159538](https://api.dane.gov.pl/resources/1159538/file)).
- Najmocniej spadające 2020→2025: Martyna 0,46×, Natalia 0,50×, Lena 0,50× (5 446→1 845), Paulina 0,50×, Aleksandra 0,56×; Patryk 0,41×, Alan 0,43×, Sebastian 0,47×, Mateusz 0,48×, Bartosz 0,49×, Tomasz 0,49×, Szymon 0,52× (6 083→2 145). Imiona z czołówki 2000 r. prawie znikły do 2025: Angelika 2 065→18, Patrycja 5 841→125, Klaudia 6 992→166, Patryk 7 743→234, Mateusz 11 454→619, Kamil 6 842→357 — te same źródła oraz [21457](https://api.dane.gov.pl/resources/21457/file).
- Regionalnie w 2025 różnice są małe (TOP 8 prawie wszędzie te same): pomorskie K Zofia 301, Zuzanna 244, Maja 240, Laura 213; M Jan 362, Leon 359, Antoni 356, Nikodem 322; śląskie K Maja 416, Zofia 409, Emilia 399; M Leon 541, Nikodem 524, Antoni 517 — [1159548](https://api.dane.gov.pl/resources/1159548/file), [1159541](https://api.dane.gov.pl/resources/1159541/file).
- USC 2025: Gdańsk (kod 2261011) K Zofia 118, Julia 86, Maja 81, Laura 77, Maria 76; M Jan 142, Leon 120, Antoni 111, Stanisław 106, Aleksander 100, Franciszek 100, Maksymilian 87; Kartuzy K Zofia 33, Klara 28, Maja 25, Antonina 24, Rozalia 23; Katowice M Antoni 95, Jan 85, Leon 82, Nikodem 74 — [1187350](https://api.dane.gov.pl/resources/1187350/file).
- Gdańsk 2018 (dzieci zameldowane): K Hanna 102, Zofia 97, Zuzanna 96, Maja 88, Julia 85; M Jan 113, Jakub 95, Aleksander 88, Szymon 88, Mikołaj 75 — [22111](https://api.dane.gov.pl/resources/22111/file).
- Różnorodność rośnie: 2000 r. 414 imion żeńskich na liście (próg 5), 2015 r. 1 003 (próg 2), 2025 r. 939; udział lidera spadł z 7–8% (Jakub, Julia ok. 2005) do ok. 4% (Nikodem, Zofia) — obliczenia na [21457](https://api.dane.gov.pl/resources/21457/file) i plikach rocznych.

### Inferences
- Część wzrostów (Emiliia, Sofiia, Milana, Mark, David, Liam) to najpewniej dzieci rodzin ukraińskich urodzone w Polsce; generator może je trzymać w puli „przyjezdnych”.
- Projekcja do gry: 2026–2030 ekstrapolacja log-liniowa udziałów z lat 2020–2026 z tłumieniem (np. połowa trendu rocznie); 2031–2050 losowy dryf udziałów plus pula „odrodzeń”, czyli imiona o wysokim odsetku zmarłych i dziś rzadkie (Henryk, Tadeusz, Kazimierz, Józef, Stefania, Wanda, Jadwiga, Bronisława, Czesław), plus pula krótkich międzynarodowych (Leo, Liam, Nel, Mia, Milan). Imiona z lat 80./90. (Patryk, Kamil, Paulina, Klaudia) powinny w 2040 brzmieć jak dzisiejsze „Grażyna/Zbigniew”. Satyryczne imiona technologiczne i ekologiczne to decyzja projektowa GDD, nie dane.
- Imiona drugie mają dużo węższy, bardziej „tradycyjny” rozkład (Maria, Anna; Jan, Piotr, Stanisław), więc do generowania drugiego imienia wystarczy krótka lista z [1159921](https://api.dane.gov.pl/resources/1159921/file)/[1159922](https://api.dane.gov.pl/resources/1159922/file) albo z plików imion drugich dzieci.

### Gaps
- Brak oficjalnych prognoz popularności imion; każda projekcja po 2026 r. to założenie projektowe.
- Nie analizowałem imion drugich nadawanych dzieciom ani pełnych list USC 2024.

## 5. RODO i progi anonimizacji

### Takeaway
Wszystkie zbiory to agregaty z progami: brak pojedynczych wystąpień w listach imion i nazwisk z rejestru, imiona dzieci z progiem 5 do 2012 r. i 2 od 2013 r.; w grze ryzyko RODO pojawia się dopiero wtedy, gdy wygenerowane osoby zbyt dokładnie odtwarzają prawdziwe rzadkie kombinacje.

### Cited Findings
- Imiona żyjących: „Pojedyncze wystąpienia oraz dane dot. osób zmarłych nie zostały umieszczone na liście” — [API 1667](https://api.dane.gov.pl/1.4/datasets/1667,lista-imion-wystepujacych-w-rejestrze-pesel-osoby-zyjace); z zmarłymi: „Pojedyncze wystąpienia nie zostały umieszczone na liście” — [API 1501](https://api.dane.gov.pl/1.4/datasets/1501,lista-imion-wystepujacych-w-rejestrze-pesel).
- Imiona dzieci: do 2012 r. bez imion z liczbą poniżej 5, od 2013 r. poniżej 2 — [API 219](https://api.dane.gov.pl/1.4/datasets/219,imiona-nadawane-dzieciom-w-polsce); potwierdzone w danych: minimum 5 w latach 2000–2012 i 2 od 2013 r. (np. 2012: 495 imion K, 2013: 993) — obliczenia na [21457](https://api.dane.gov.pl/resources/21457/file).
- Nazwiska: nazwiska z pojedynczą liczbą wystąpień (i zmarli, w zbiorze 1681) pominięte — [API 1681](https://api.dane.gov.pl/1.4/datasets/1681,nazwiska-osob-zyjacych-wystepujace-w-rejestrze-pesel), [API 568](https://api.dane.gov.pl/1.4/datasets/568,nazwiska-wystepujace-w-rejestrze-pesel); w pliku województw minimum w wierszu też wynosi 2 — obliczenia na [1148786](https://api.dane.gov.pl/resources/1148786/file), [1148790](https://api.dane.gov.pl/resources/1148790/file).
- Pliki wg USC i województw mają minimum 2 na komórkę (USC × imię × płeć) — obliczenia na [1187350](https://api.dane.gov.pl/resources/1187350/file), [1159548](https://api.dane.gov.pl/resources/1159548/file).
- Plik Gdańska 2015–2018 zawiera imiona z liczbą 1 (brak progu) — obliczenia na [22111](https://api.dane.gov.pl/resources/22111/file).
- Badania IJP PAN korzystały z mikrodanych PESEL (imię, płeć, rok urodzenia, TERYT rejestracji urodzenia) — [Swoboda 2017](https://onomastica.ijppan.pl/index.php/ONOM/article/download/180/120).

### Inferences
- Imię lub nazwisko samo w sobie, w agregacie z progiem ≥2, nie identyfikuje osoby; problem robi się przy połączeniu rzadkiego nazwiska, rzadkiego imienia, rocznika i prawdziwego adresu (a gra startuje od prawdziwego adresu). Bezpieczne reguły dla generatora: nie używać imion z plików USC poniżej np. 10 wystąpień, nazwisk poniżej np. 200–500 nosicieli w kraju, nie publikować w repo surowych list gminnych w formie, która sugeruje „kto tu mieszka”, i trzymać blokadę znanych osób (patrz pkt 3).
- Do repo publicznego wystarczą przetworzone tabele (TOP-N z wagami); surowe pliki można trzymać poza gitem i odtwarzać skryptem z dane.gov.pl.

### Gaps
- Nie znalazłem oficjalnego opisu metody anonimizacji ministerstwa poza zdaniami w opisach zbiorów (np. czy progi stosuje się przed czy po podziale na województwa).
- Nie sprawdzałem warunków ponownego wykorzystania danych na wniosek (ustawa o otwartych danych) dla ewentualnego zestawienia imion wg roku urodzenia.
