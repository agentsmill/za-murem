/* Szablon pliku public/data/mieszkancy/LICENCJE.md: źródła, z których powstają tabele mieszkańców, ich licencje
   i to, co każda z nich nakazuje zrobić. Lista pochodzi z tabeli licencji w raporcie „Dane do generatora mieszkańców”
   i obejmuje tylko źródła, które zasilają tabele (albo, jak PESEL i SGJP, tabele imion i nazwisk). Gdy tabele zaczną
   korzystać z kolejnego źródła z raportu (OECD Family Database, Szubert, Kaim i Kozak 2024, Otwarty Gdańsk), dopisz
   je tutaj, w tabeli źródeł. Nota SGJP jest kopią z nagłówka pliku słownika i nie wolno jej zmieniać. */

const GUS_ZRODLO = 'Dozwolone z podaniem źródła ([GUS, Copyright](https://stat.gov.pl/copyright))';

/** Tekst LICENCJE.md. `nota` to nagłówek COPYRIGHT słownika SGJP, `idSlownika` jego identyfikator. */
export function tekstLicencji(sgjp: { idSlownika: string; nota: string }): string {
  return `# Licencje i źródła danych

Tabele w katalogu \`public/data/mieszkancy/\` to przeliczone agregaty z otwartych źródeł. Mieszkańcy w grze „Za Murem” są wymyśleni: gra losuje ich z rozkładów statystycznych i nie pokazuje prawdziwych osób ani prawdziwych mieszkańców wpisanego adresu. Ten plik powstaje przy \`npm run dane:kraj\` z szablonu w \`tools/dane/licencje.ts\`, więc nie edytuj go ręcznie.

## Co zrobiliśmy z danymi

Informacja o przetworzeniu, której wymaga CC BY 4.0 i dobry zwyczaj przy danych GUS: dane zostały przeliczone na małe tablice JSON. Współczynniki są zaokrąglone do liczb całkowitych (umieralność na 100 000, płodność na 10 000). Tablice rejonów statystycznych NSP 2021 są zsumowane do gmin i do kraju, z plików obwodów spisowych nie korzystamy. Granice rejonów są uproszczone do 5 metrów. Struktura wieku jest złożona w 10-letnie grupy. Mnożniki płodności są przeliczone tak, żeby krzywa Eurostatu dawała dzietność GUS dla miast i wsi, a udziały kolejności urodzeń przeskalowane do 100% wśród urodzeń o znanej kolejności. Dzietność w latach 2021-2023 to trend z Eurostatu dopasowany do poziomu GUS z 2024 r. Wartości w tabelach nie są oficjalnymi publikacjami GUS ani Eurostatu i nie wolno ich tak cytować.

## Źródła i warunki

| Źródło | Co z niego bierzemy | Licencja | Co trzeba zrobić |
|---|---|---|---|
| GUS, Narodowy Spis Powszechny 2021 (NSP 2021): tablice gospodarstw, rodzin i ludności w rejonach statystycznych, aneks „Rodziny w Polsce w świetle wyników NSP 2021” | wielkość i skład gospodarstw, typy rodzin, liczba dzieci, płeć i wiek w rejonach, szablon gospodarstw wg obecności osób 60+, skład pokoleniowy | ${GUS_ZRODLO} | atrybucja GUS |
| GUS, Trwanie życia w 2025 r. (Tablica A) | prawdopodobieństwo zgonu wg wieku, płci, miast i wsi | ${GUS_ZRODLO} | atrybucja GUS |
| GUS, Prognoza ludności na lata 2023-2060 (Tabl. 1) | ludność Polski wg płci i wieku w 2022 r. | ${GUS_ZRODLO} | atrybucja GUS |
| GUS, Rocznik Demograficzny 2025 (tabl. 57, 76, 78) | współczynnik dzietności miast, wsi i miast 100 tys.+, kolejność urodzeń | ${GUS_ZRODLO} | atrybucja GUS |
| GUS, Sytuacja demograficzna Polski do 2025 r. (tabl. 2B) | współczynnik dzietności Polski w 2025 r. | ${GUS_ZRODLO} | atrybucja GUS |
| BDL, Bank Danych Lokalnych GUS | ludność wg wieku (NSP 2021 i 31.12.2025), mieszkania wg epoki budowy | CC BY 4.0 ([Portal API BDL](https://api.stat.gov.pl/Home/BdlApi)) | atrybucja i informacja o przetworzeniu |
| BREC 2021, granice rejonów statystycznych | obrysy rejonów | brak warunków i ograniczeń ([regulamin Portalu Geostatystycznego](https://portal.geo.stat.gov.pl/regulamin/)) | atrybucja z dobrego zwyczaju |
| Eurostat, demo_frate i demo_find | współczynniki płodności wg pojedynczych lat wieku, Polska 2024; trend dzietności Polski 2021-2024 | CC BY 4.0 ([Eurostat, Copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice)) | źródło i zaznaczenie zmian |
| Rejestr PESEL, Ministerstwo Cyfryzacji, dane.gov.pl | częstość imion i nazwisk | CC0 1.0 ([zbiór 1667](https://api.dane.gov.pl/1.4/datasets/1667,lista-imion-wystepujacych-w-rejestrze-pesel-osoby-zyjace)) | atrybucja nieobowiązkowa, ale ją podajemy |
| SGJP, Słownik gramatyczny języka polskiego (Morfeusz 2), plik \`sgjp-20260823.tab.gz\` | odmiana imion i nazwisk (lista form liczby pojedynczej) | BSD-2, dwuklauzulowa licencja BSD ([Morfeusz 2, licencja](https://morfeusz.sgjp.pl/doc/license/)) | nota Copyright poniżej w repozytorium i w ekranie „O grze” |

Atrybucja map (© współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles) jest osobno, zawsze widoczna na ekranie gry.

## Linia do ekranu „O grze”

Dane demograficzne: GUS (NSP 2021, BDL na CC BY 4.0, BREC 2021, tablice trwania życia 2025, Prognoza ludności 2023-2060, Rocznik Demograficzny 2025, Sytuacja demograficzna Polski do 2025 r.) i Eurostat (CC BY 4.0), przetworzone na wymyślonych mieszkańców; imiona i nazwiska: rejestr PESEL, Ministerstwo Cyfryzacji, dane.gov.pl (CC0); odmiana: SGJP (BSD-2, pełna nota w repozytorium).

## Nota SGJP (BSD-2)

Identyfikator słownika: \`${sgjp.idSlownika}\`. Licencja obejmuje listę form, nie cały słownik. Wyciąg form użyty w grze pochodzi z pliku \`sgjp-20260823.tab.gz\`. Poniżej nota skopiowana bez zmian z nagłówka tego pliku.

\`\`\`text
${sgjp.nota}
\`\`\`
`;
}
