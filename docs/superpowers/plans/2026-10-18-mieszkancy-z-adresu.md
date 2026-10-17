# Mieszkańcy z adresu: plan wdrożenia (kroki 1–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Czysty moduł `src/mieszkancy/`, który z mapy osiedla i małych tabel danych publicznych robi zmyślonych mieszkańców w październiku 2051: gospodarstwa per budynek i klatka, imiona, nazwiska, odmianę, fachy, kronikę osiedla i historie. Bez zmian w grze (krok 5 to osobny plan, po uzgodnieniu z sesją koordynującą).

**Architecture:** Skrypty w `tools/` czytają surowe pliki z katalogu `dane-surowe/` (poza repo) i zapisują małe tabele JSON do `public/data/mieszkancy/`. Moduł `src/mieszkancy/` czyta tylko te tabele i `Geo` z `src/world/geo.ts`, nie importuje nic z `src/sim`, `src/ui`, `src/render`. Każdy budynek ma własne ziarno, więc wynik budynku nie zależy od reszty obszaru. Narzędzie `npm run mieszkancy` pokazuje piramidy wieku i historie dla trzech dem oraz robi test wsteczny 2021→2025.

**Tech Stack:** TypeScript 7 (składnia wymazywalna, bez enumów), Node ≥22.18 uruchamiający `.ts` wprost, Vitest, Biome. Bez nowych zależności: ZIP przez `node:zlib`, XLSX, SHP i DBF własnymi czytnikami.

**Spec:** `docs/superpowers/specs/2026-10-17-mieszkancy-z-adresu-design.md`. Liczby, identyfikatory zmiennych i licencje: `reports/Dane do generatora mieszkańców.md` i `research_notes/Dane do generatora mieszkańców/*.md`.

## Global Constraints

- Praca w worktree `/Users/mpawelczuk/Post-pixel/.claude/worktrees/mieszkancy`, gałąź `mieszkancy-z-adresu`. Commity tylko lokalne, bez push. Łączy sesja koordynująca przez PR.
- Surowe dane: katalog z env `ZM_SUROWE`, domyślnie `/Users/mpawelczuk/Post-pixel/dane-surowe`. Nic z niego nie trafia do repo. Pobranych plików nie uruchamiamy, tylko czytamy.
- Pomocnicze skrypty z badań (Python, tylko do podglądu logiki): `/Users/mpawelczuk/Post-pixel/dane-surowe/skrypty-badan/` (`reguly.py`, `nazwiska.py`, `wyciagnij_sgjp.py`, `punkt_w_rejonie.py`, `wyciag_rejony.py`).
- Testy, które potrzebują surowych danych, używają `it.skipIf(!fs.existsSync(SUROWE))`. CI ich nie ma i muszą przejść bez nich. Testy na tabelach w `public/data/mieszkancy/` chodzą zawsze.
- `src/mieszkancy/` nie importuje z `src/sim`, `src/ui`, `src/render`, `src/gov`. Wolno: `src/core/rng.ts`, `src/content/people.ts` (`g`, `wiek`), typy z `src/world/geo.ts`, `classify` i `levelsOf` z `src/world/classify.ts`, typ `Dom` z `src/content/data.ts`.
- Nie zmieniamy `NAMES`, `SURN`, `PROFS`, `TRAITS`, `makePerson` ani strumienia `st.rng` (test zgodności z 0.3).
- Decyzje losowe na liczbach całkowitych: szanse jako liczby na 10 000 (`p10k`), umieralność na 100 000. Porównanie zawsze `Math.floor(r() * N) < p`. W module zakazane `Math.sin`, `Math.cos`, `Math.exp`, `Math.log`, `Math.pow`, `Math.hypot` poza jednym miejscem: przeliczeniem metrów na stopnie w `budynki.ts` (wynik zaokrąglany do 5 miejsc).
- Rok gry: migawka na 1 października 2051. Spis: 31 marca 2021. Kroki: 2021→2026 bez upadku, potem 2026→2031→…→2051 z dźwigniami.
- RODO (CLAUDE.md): postaci zmyślone; generator pracuje na rejonach, nigdy na obwodach; żadnych numerów mieszkań ani pięter w tekstach; żadnych postaci ani imion z nazw firm; blokada nazwisk polityków.
- Lore: rok zero 2026, odkrycie około 2029, rozpad w latach 30. i 40., gra w 2051. Żadnych nazwisk prawdziwych polityków.
- Teksty po polsku, z poprawną odmianą. Bez pauz-myślników w tekstach dla gracza.
- Atrybucja: `public/data/mieszkancy/LICENCJE.md` z notą BSD SGJP (kopiowaną z nagłówka `sgjp-20260823.tab.gz`) i listą źródeł z licencjami (tabela licencji z raportu).
- Budżet: tabele trzech gmin z dem i tabele krajowe razem do 3 MB w repo. Generowanie całego obszaru dema do 200 ms w Node.
- Bramka każdego kroku (1–4): `npm test`, `npm run lint`, `npm run build`, `npm run bot`, `npm run mieszkancy`. Raport po kroku do sesji koordynującej (`SendMessage` do `local_4b3c8c3f-bb7b-458b-a205-7bf613220340`) i wpis w `docs/POSTEP.md`.

## Review Focus

- Środek budynku poza każdym wielokątem rejonu (woda, luka w BREC, budynek na granicy gminy): ma zadziałać zapas, najbliższy rejon w gminie, a gdy gminy nie ma, szablon krajowy. Test w Task 5.
- Rejon z zerami i pustymi kategoriami (brak wiersza w pliku GUS) albo rejon z kilkudziesięcioma osobami: IPF nie może dać `NaN` ani gospodarstw o ujemnej liczbie. Test w Task 8.
- Ogromny obrys oznaczony jako blok (hala, galeria, zły tag): limit mieszkań na budynek i brak gospodarstw w budynkach niemieszkalnych. Test w Task 7.
- Imię spoza słownika (Nikola, Mia, Dżesika, Leo, Oleksandr, „X Æ A-12”): zgadywacz nie rzuca wyjątku, zwraca formy z `pewne: false`. Test w Task 13.
- Ten sam budynek liczony samodzielnie i w całym obszarze, w Node dwa razy: identyczny wynik co do bajtu. Test w Task 10.

---

## Krok 1: dane offline dla trzech gmin z dem

### Task 1: Czytnik ZIP i XLSX

**Files:**
- Create: `tools/dane/zip.ts`, `tools/dane/xlsx.ts`, `tools/dane/sciezki.ts`
- Create: `tests/fixtures/mieszkancy/probka.xlsx`, `tests/fixtures/mieszkancy/README.md`
- Test: `tests/unit/dane-xlsx.test.ts`

**Interfaces:**
- Produces: `SUROWE: string` (z `ZM_SUROWE` albo domyślna ścieżka) i `wyjscie(...czesci: string[]): string` (ścieżka w `public/data/mieszkancy/`) w `sciezki.ts`; `wpisyZip(buf: Buffer): Map<string, Buffer>` (metody 0 i 8, `inflateRawSync`); `arkusze(buf: Buffer): string[]`; `wiersze(buf: Buffer, arkusz: string): (string | number | null)[][]` (pierwszy wiersz to nagłówek, puste komórki `null`, liczby jako `number`, współdzielone i inline stringi jako `string`).

- [ ] **Step 1:** Zrób `probka.xlsx` jednorazowo przez `python3 -I` i `zipfile` z `ZIP_DEFLATED`: arkusz „Dane - rejony statystyczne” (nagłówek `Kod TERYT gminy | Nazwa gminy | Numer rejonu statystycznego | kategoria | liczba`, dwa wiersze ze stringami ze `sharedStrings.xml`) i arkusz „Inny” z liczbą inline i pustą komórką w środku wiersza. Komendę zapisz w `README.md` fixture'a.
- [ ] **Step 2:** Napisz test `dane-xlsx.test.ts`: `arkusze()` zwraca `['Dane - rejony statystyczne', 'Inny']`; `wiersze(buf, 'Dane - rejony statystyczne')[1]` równa się `['2261011', 'Gdańsk', '182350', '1', 512]`; w arkuszu „Inny” pusta komórka to `null` na właściwej pozycji kolumny (z atrybutu `r`, np. `C2`). Drugi test `it.skipIf(!fs.existsSync(SUROWE))`: plik `gus/nsp2021-gospodarstwa-rejony/gospodarstwa_w_rejonach_i_obwodach_wg_liczby_osob_nsp2021.xlsx` ma arkusz „Dane - rejony statystyczne” z ponad 170 000 wierszy.
- [ ] **Step 3:** `npx vitest run tests/unit/dane-xlsx.test.ts`, oczekiwane FAIL (brak modułów).
- [ ] **Step 4:** Zaimplementuj. ZIP: czytaj centralny katalog od końca (EOCD), nie lokalne nagłówki. XLSX: `xl/workbook.xml` i `xl/_rels/workbook.xml.rels` dla nazw arkuszy, prosty parser XML na wyrażeniach regularnych dla `<c r=… t=…><v>…</v></c>` i `<is><t>`, dekodowanie encji `&amp; &lt; &gt; &quot; &apos;`.
- [ ] **Step 5:** Test PASS, `npm run lint` czysto.
- [ ] **Step 6:** Commit: `Czytniki ZIP i XLSX do danych mieszkańców`.

### Task 2: Czytnik SHP i DBF, PUWG 1992 → WGS84, upraszczanie

**Files:**
- Create: `tools/dane/shp.ts`, `tools/dane/puwg.ts`
- Test: `tests/unit/dane-shp.test.ts`

**Interfaces:**
- Consumes: `wpisyZip` z Task 1.
- Produces: `wielokaty(shp: Buffer): number[][][][]` (rekordy → pierścienie → punkty `[x, y]`), `rekordyDbf(dbf: Buffer): Record<string, string>[]`, `doWgs84(x: number, y: number): [lat: number, lon: number]` i `zWgs84(lat: number, lon: number): [x: number, y: number]` dla EPSG:2180 (GRS80, południk 19°, k0 0,9993, przesunięcie 500 000 / −5 300 000), `uprosc(pierscien: [number, number][], tolerancjaM: number): [number, number][]` (Douglas–Peucker).

- [ ] **Step 1:** Testy: `zWgs84(52, 19)[0]` równa się 500 000 ±0,001; `doWgs84(...zWgs84(54.4093, 18.5991))` wraca do punktu z dokładnością 1e-7°; `uprosc` kwadratu z dodatkowymi punktami współliniowymi zostawia 5 punktów; test ze `skipIf`: z `gus/brec2021-granice-rejonow-obwodow/SU_BREC_2021_REJ.zip` jest 35 039 rekordów, a DBF ma pola `GMINA` i `REJ`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Zaimplementuj (format SHP: nagłówek 100 B, typ 5 Polygon; DBF: nagłówek, deskryptory pól, rekordy stałej długości, kodowanie z pliku `.cpg`, domyślnie UTF-8). Rzutowanie odwrotne z szeregów Krügera albo iteracyjnie; to kod tylko offline, trygonometria wolna.
- [ ] **Step 4:** PASS, lint.
- [ ] **Step 5:** Commit: `Czytnik SHP i DBF, rzutowanie PUWG 1992`.

### Task 3: Tabele gmin z dem

**Files:**
- Create: `src/mieszkancy/tabele.ts` (same typy i stałe, bez logiki)
- Create: `tools/dane-gminy.ts`
- Create: `public/data/mieszkancy/gminy/<teryt>.json` (trzy pliki, wynik narzędzia)
- Modify: `package.json` (skrypt `"dane:gminy": "node tools/dane-gminy.ts"`)
- Test: `tests/unit/mieszkancy-tabele.test.ts`

**Interfaces:**
- Produces w `tabele.ts`:

```ts
export const WERSJA_TABEL = 1;
export type Wielkosc = '1' | '2' | '3' | '4' | '5+';
export type Sklad = 'jedno' | 'dwu' | 'trzy+' | 'nier1' | 'nier+';      // jednorodzinne, dwurodzinne, trzy i więcej, nierodzinne jedno- i wieloosobowe
export type TypRodziny = 'malzBez' | 'malzZ' | 'zwBez' | 'zwZ' | 'matka' | 'ojciec';
export type GrupaWieku = '0-9' | '10-19' | '20-29' | '30-39' | '40-49' | '50-59' | '60-69' | '70-79' | '80+';
export interface Marginesy {
  gospodarstwa: Record<Wielkosc, number>;
  sklad: Record<Sklad, number>;
  rodziny: Record<TypRodziny, number>;
  dzieci: Record<'0' | '1' | '2' | '3' | '4+', number>;
  wiek: { M: Record<GrupaWieku, number>; K: Record<GrupaWieku, number> };
}
export type Epoka = 'przedwojenna' | 'powojenna' | 'plyta' | 'transformacja' | 'nowa'; // <1945, 1945–1970, 1971–1989, 1990–2010, 2011+
export interface TabeleGminy {
  wersja: number;
  teryt: string;          // 7 cyfr, jak w plikach NSP
  nazwa: string;
  woj: string;            // nazwa województwa małymi literami, jak w plikach PESEL
  miejska: boolean;
  rejony: Record<string, Marginesy>;              // klucz: 6-cyfrowy numer rejonu
  obrysy: Record<string, [number, number][][]>;   // rejon → pierścienie [lat, lon], 5 miejsc po przecinku
  gmina: Marginesy;                               // suma rejonów, zapas
  epoki: Record<Epoka, { mieszkania: number; osoby: number }>; // P4386 złożone z 9 okresów GUS
  metraz: Record<Epoka, number>;                  // średni metraż mieszkania, m²
  wiek2021: { M: number[]; K: number[] };         // 5-latki 0–4 … 85+ (18 grup), P4253
  wiek2025: { M: number[]; K: number[] };         // 5-latki na 31.12.2025, P2137 (18 grup)
}
```

- [ ] **Step 1:** Test na tabelach w repo: dla rejonu 182350 w pliku Gdańska udział gospodarstw jednoosobowych to 39,6% ±0,1 pp, a udział osób 80+ to 9,5% ±0,1 pp; dla rejonu 398600 w pliku Zielonek jednoosobowe 11,7% ±0,1 pp; suma `gmina.gospodarstwa` Gdańska równa się sumie po rejonach; każdy rejon z `rejony` ma obrys; rozmiar wszystkich trzech plików razem poniżej 1,5 MB. Test ze `skipIf`: suma gospodarstw po rejonach Gdańska równa się wartości gminnej z `gus/bdl-api/dane-przyklady/gdansk_042214361011__nsp2021_gospodarstwa_rodziny.json` (raport: zgodność co do sztuki).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Napisz `tools/dane-gminy.ts`: argumenty to punkty `lat,lon` (domyślnie trzy punkty dem z `tests/unit/fixtures.ts` `ADDRESSES`); dla każdego punktu znajdź rejon w BREC (punkt w wielokącie po `zWgs84`), weź jego `GMINA`, wyciągnij wszystkie rejony tej gminy z czterech XLSX gospodarstw i rodzin oraz z XLSX ludności (arkusze per województwo, wiersze typu „rejon statystyczny”; obwodów nie czytaj), uprość obrysy do 5 m, złóż epoki z P4386 (1971–1978 i 1979–1988 to `plyta`, rok 1989 do `plyta`, 2011 do `nowa`; reszta jak w raporcie, sekcja o wieku budynków), metraż z P4369, wiek z P4253 i P2137 z plików w `gus/bdl-api/dane-przyklady/`. Literówki w etykietach wieku GUS są w notatkach. Gdy w tabeli brak wiersza kategorii, wstaw 0.
- [ ] **Step 4:** `npm run dane:gminy`, potem test PASS.
- [ ] **Step 5:** Commit: `Tabele mieszkańców dla trzech gmin z dem`.

### Task 4: Tabele krajowe

**Files:**
- Modify: `src/mieszkancy/tabele.ts` (typ `TabeleKraju`)
- Create: `tools/dane-kraj.ts`, `public/data/mieszkancy/kraj.json`, `public/data/mieszkancy/LICENCJE.md`
- Modify: `package.json` (`"dane:kraj": "node tools/dane-kraj.ts"`)
- Test: `tests/unit/mieszkancy-kraj.test.ts`

**Interfaces:**
- Produces:

```ts
export interface TabeleKraju {
  wersja: number;
  qx: Record<'miastaM' | 'miastaK' | 'wiesM' | 'wiesK' | 'polskaM' | 'polskaK', number[]>; // wiek 0–100, na 100 000, Tablica A 2025
  plodnosc: number[];            // urodzenia na 10 000 kobiet rocznie, wiek 15–49 (35 wartości), Eurostat demo_frate 2024
  mnoznikPlodnosci: { miasto100k: number; miasto: number; wies: number }; // na 10 000, TFR obszaru / TFR kraju (raport: 1,00 / 1,069 / 1,149 wobec 1,099)
  kolejnosc: [number, number, number, number]; // 44,1 / 33,9 / 12,4 / 6,1 % (na 10 000, reszta do 3+)
  szablonGospodarstw: { miasta: Record<string, number>; wies: Record<string, number> }; // klucz `${Wielkosc}|${Sklad}|${'60+' | 'bez60'}`, aneks „Rodzin w Polsce” tabl. 4 i 5
  trojpokoleniowe: { miasta: number; wies: number };   // 9,9 % i 24,3 % (na 10 000)
}
```

- [ ] **Step 1:** Testy: e(0) policzone z `qx.miastaM` równa się 75,67 ±0,05, z `qx.polskaK` 82,48 ±0,05; przeżycie 25 lat od 60 do 85 z `polskaM` to 0,341 ±0,005, z `polskaK` 0,540 ±0,005; suma `plodnosc` / 10 000 to 1,14 ±0,02 (TFR Eurostatu 2024); `LICENCJE.md` zawiera słowa „Copyright” i „BSD” oraz każde źródło z tabeli licencji raportu, które trafia do tabel (GUS, BDL CC BY 4.0, BREC 2021, Eurostat CC BY 4.0, PESEL CC0, SGJP BSD-2).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `tools/dane-kraj.ts`: qx z `demografia/gus-trwanie-zycia-2025/` (Tablica A, sześć arkuszy, kolumna `qx` × 100 000, zaokrąglenie), płodność z `demografia/eurostat/demo_frate*.csv` (PL, 2024, wiek 15–49), szablon z `gus/nsp2021-rodziny/aneks_tabelaryczny_do_publikacji_2.xlsx`. Liczby, których nie da się wyciągnąć z plików (mnożniki, kolejność urodzeń, odsetki trzypokoleniowe), wpisz jako stałe z adresem źródła w komentarzu, wartości z raportu. `LICENCJE.md` pisze się z szablonu w skrypcie, notę SGJP czyta z nagłówka pliku `odmiana/sgjp/sgjp-20260823.tab.gz`.
- [ ] **Step 4:** `npm run dane:kraj`, PASS.
- [ ] **Step 5:** Commit: `Tabele krajowe: umieralność, płodność, szablon gospodarstw, licencje`.

### Task 5: Rejon dla punktu i wczytywanie tabel w grze

**Files:**
- Create: `src/mieszkancy/rejon.ts`, `src/mieszkancy/wczytaj.ts`
- Test: `tests/unit/mieszkancy-rejon.test.ts`

**Interfaces:**
- Consumes: `TabeleGminy`, `TabeleKraju`.
- Produces: `rejonDla(g: TabeleGminy, lat: number, lon: number): { rejon: string; zapas: 'brak' | 'najblizszy' | 'gmina' }` (punkt w wielokącie na samych `+ - * /`; poza wszystkimi: najbliższy rejon po odległości do środka obrysu, jeśli bliżej niż 1 km, inaczej `'gmina'` i `rejon: ''`), `marginesyDla(g: TabeleGminy, rejon: string): Marginesy`; `wczytajGmine(teryt: string, fetchFn?: typeof fetch): Promise<TabeleGminy | null>` i `wczytajKraj(fetchFn?): Promise<TabeleKraju>` (ścieżki względne `data/mieszkancy/...`, w Node test podaje własne `fetchFn` czytające pliki). Gdy gminy nie ma, `null`; generator wtedy używa szablonu krajowego.

- [ ] **Step 1:** Testy: punkty dem dają rejony 182350 (Przymorze), 002193 (Lanciego), 398600 (Zielonki) z `zapas: 'brak'`; punkt w Zatoce Gdańskiej 300 m od brzegu przy Przymorzu daje `zapas: 'najblizszy'`; punkt 20 km w morze daje `'gmina'`; `marginesyDla(g, '')` zwraca `g.gmina`.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS, lint, build.
- [ ] **Step 5:** Commit: `Rejon statystyczny dla punktu i wczytywanie tabel`.
- [ ] **Step 6 (bramka kroku 1):** pełna bramka z Global Constraints (bez `npm run mieszkancy`, który powstaje w Task 10), wpis w `docs/POSTEP.md`, raport do sesji koordynującej, commit `Dziennik: dane mieszkańców dla trzech dem`.

## Krok 2: silnik gospodarstw do 2051

### Task 6: Typy osiedla i losowanie całkowite

**Files:**
- Create: `src/mieszkancy/typy.ts`, `src/mieszkancy/los.ts`
- Test: `tests/unit/mieszkancy-los.test.ts`

**Interfaces:**
- Produces w `typy.ts`:

```ts
export type Plec = 'M' | 'K';
export type TypWpisu = 'przydzial' | 'wprowadzka' | 'urodzenie' | 'zgon' | 'wyprowadzka' | 'emigracja'
  | 'powrot' | 'powrotOpieka' | 'zwiazek' | 'owdowienie' | 'opuszczone';
export interface Wpis { rok: number; typ: TypWpisu; kto: string; z?: string; dokad?: string }
export interface Osoba {
  id: string; plec: Plec; rocznik: number;
  imie: string; nazwisko: string;             // puste do Task 12
  matka?: string; ojciec?: string; partner?: string;
  stan: 'tu' | 'wyjechal' | 'zmarl'; dokad?: string; // 'Kraków', 'Niemcy', 'wieś pod miastem'
  dawnyZawod?: string; fach?: string;          // puste do Task 14
}
export interface Gospodarstwo { id: string; budynek: string; klatka: number; czlonkowie: string[]; odOddania: boolean }
export interface Budynek {
  klucz: string; lat: number; lon: number; rejon: string;
  typ: 'dom' | 'blok'; kondygnacje: number; pole: number; szerokosc: number; dlugosc: number;
  klatki: number; startDate?: number; epoka?: Epoka; mieszkania?: number;
}
export interface WynikBudynku { budynek: Budynek; osoby: Osoba[]; gospodarstwa: Gospodarstwo[]; dziennik: Wpis[]; puste: number }
export interface Osiedle { wersja: number; rok: number; teryt: string; budynki: WynikBudynku[] }
export const WERSJA_GENERATORA = 1;
```

- `los.ts`: `losDla(...klucze: (string | number)[]): Rng` (`hashString` z `src/core/rng.ts` → 32 bity → `mulberry`), `szansa(r: Rng, p10k: number): boolean`, `wazony(r: Rng, wagi: readonly number[]): number` (wagi całkowite ≥0; suma 0 → `-1`), `calkowita(r: Rng, od: number, doW: number): number`.

- [ ] **Step 1:** Testy: `losDla('a', 1)` daje ten sam ciąg przy dwóch wywołaniach i inny niż `losDla('a', 2)`; `szansa(r, 0)` zawsze false, `szansa(r, 10000)` zawsze true; `wazony` z wagami `[0, 3, 1]` na 40 000 losowaniach daje indeks 1 w 75% ±1 pp i nigdy 0; `wazony(r, [0, 0])` daje `-1`.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Typy osiedla i losowanie na liczbach całkowitych`.

### Task 7: Budynki z mapy: epoka, mieszkania, klatki

**Files:**
- Create: `src/mieszkancy/budynki.ts`
- Test: `tests/unit/mieszkancy-budynki.test.ts`

**Interfaces:**
- Consumes: `Geo` z `src/world/geo.ts` (metry względem `geo.c = [lat0, lon0]`, x na wschód, y na południe, `kx = 111320 · cos(lat0)`, `ky = 110574`), `classify`/`levelsOf` z `src/world/classify.ts` (tylko odczyt), `rejonDla`, `losDla`, `wazony`.
- Produces: `budynkiZGeo(geo: Geo, g: TabeleGminy | null): Budynek[]` (tylko klasy `blok` i `dom`; sklejone segmenty: obrysy dzielące krawędź albo bliżej niż 1 m, z tą samą wysokością, to jeden budynek; `klucz` to `osm:<id>` gdy jest tag `id`, inaczej `g:<lat5>,<lon5>,<pole>`; `klatki` = liczba segmentów albo `max(1, round(dlugosc / 20))`), `epokaBudynku(b: Budynek, g: TabeleGminy | null): Epoka`, `mieszkaniaBudynku(b: Budynek, g: TabeleGminy | null): number`.
- Reguły epoki w tej kolejności: `startDate` → przedział; `blok`, 10–12 kondygnacji i szerokość ≤14,5 m → `plyta`; `blok`, 5 kondygnacji, szerokość ≤14,5 m i długość ≥3 × szerokość → `plyta` (raport: precyzja 0,95 dla 1945–1989, bierzemy `plyta` jako częstszą); reszta: `wazony` z `g.epoki[*].mieszkania` z ziarnem `losDla('epoka', b.klucz)`; bez gminy: wagi krajowe stałe w kodzie z tablicy NSP (raport).
- Mieszkania: `dom` → 1, a z szansą równą udziałowi trzypokoleniowych dla miast albo wsi → 2. `blok` → `round(pole × kondygnacje × 0,72 / metraz[epoka])`, przycięte do [2, 400].

- [ ] **Step 1:** Testy na demach (`public/demo/*.json`): w Przymorzu żaden budynek mieszkalny nie ma 0 mieszkań, a największy blok ma ≥150 mieszkań; w Zielonkach ponad 80% budynków to `dom` z 1 albo 2 mieszkaniami; sztuczny blok 11 kondygnacji, szerokość 12 m → `plyta`; sztuczny obrys 20 000 m² z tagiem `building=apartments` i 3 kondygnacjami ma ≤400 mieszkań; budynek `retail` nie trafia do wyniku; dwa wywołania `budynkiZGeo` dają te same klucze i epoki.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Budynki dla mieszkańców: epoka, mieszkania, klatki`.

### Task 8: Gospodarstwa na spis 2021

**Files:**
- Create: `src/mieszkancy/ipf.ts`, `src/mieszkancy/spis.ts`
- Test: `tests/unit/mieszkancy-spis.test.ts`

**Interfaces:**
- Consumes: `Marginesy`, `TabeleKraju`, `Budynek`, `losDla`, `wazony`, `szansa`.
- Produces: `rozkladGospodarstw(m: Marginesy, k: TabeleKraju, miejska: boolean): Map<string, number>` (IPF szablonu krajowego `Wielkosc|Sklad|60+` do brzegów `gospodarstwa` i `sklad` rejonu, najwyżej 50 iteracji, komórka z zerowym brzegiem zostaje 0, wynik w promilach, cache na rejon); `obsadzBudynek(b: Budynek, m: Marginesy, g: TabeleGminy | null, k: TabeleKraju): WynikBudynku` (rok 2021, ziarno `losDla('spis', b.rejon, b.klucz, WERSJA_GENERATORA)`); `obsadzRejon(m: Marginesy, liczba: number, k: TabeleKraju, ziarno: string): WynikBudynku` (bez budynku, do testu wstecznego).
- Algorytm obsadzania (decyzja planu, bo specyfikacja zostawia szczegóły):
  1. Liczba gospodarstw: `mieszkania × (suma gospodarstw rejonu / suma mieszkań zamieszkanych gminy)`, reszta mieszkań pusta.
  2. Dla każdego gospodarstwa archetyp z `rozkladGospodarstw`, z wagą epoki: wielkość przesunięta tak, żeby średnia osób na mieszkanie zgadzała się z `g.epoki[epoka].osoby / mieszkania` (mnożnik wag wielkości 4 i 5+ albo 1 i 2, liczony raz na epokę); `dom` dodatkowo ×1,5 dla 4 i 5+.
  3. Osoby: głowa gospodarstwa wiekiem z `wiek` rejonu (20+), partner ±0–5 lat, dzieci z wiekiem matki w 18–42 w chwili urodzenia, osoby 60+ zgodnie z archetypem, trzecie pokolenie dla `dwu` i `trzy+`. Wiek w grupach 10-letnich rejonu, rocznik losowo w grupie.
  4. `odOddania = true`, gdy epoka to `plyta` albo `powojenna`, a głowa miała w roku oddania budynku (środek przedziału epoki) 22–40 lat; wtedy wpis `przydzial` z tym rokiem.

- [ ] **Step 1:** Testy: dla rejonu 182350 obsadź 2 000 sztucznych mieszkań przez `obsadzRejon`, a udział jednoosobowych wyjdzie 39,6% ±3 pp, osób 80+ 9,5% ±2 pp; dla 398600 jednoosobowych 11,7% ±3 pp; `rozkladGospodarstw` dla marginesów z zerami w `dwu` i `trzy+` nie ma `NaN` ani wartości ujemnych, a komórki `dwu|*` i `trzy+|*` są 0; rejon z 40 osobami daje wynik bez wyjątku; średnia wielkość gospodarstwa w domach Zielonek jest większa niż w blokach Przymorza; każde dziecko ma matkę starszą o 18–42 lata; żaden `odOddania` przy epoce `nowa`.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Gospodarstwa na spis 2021 z rozkładów rejonu`.

### Task 9: Dwadzieścia pięć lat i dźwignie upadku

**Files:**
- Create: `src/mieszkancy/dzwignie.ts`, `src/mieszkancy/czas.ts`
- Test: `tests/unit/mieszkancy-czas.test.ts`

**Interfaces:**
- Consumes: `WynikBudynku`, `TabeleKraju`, `losDla`, `szansa`, `wazony`.
- Produces: `DZWIGNIE` (stałe, każda z komentarzem „decyzja gry, nie dane”) i `postarz(w: WynikBudynku, doRoku: 2026 | 2051, k: TabeleKraju, miejska: boolean, upadek: boolean): WynikBudynku` (kroki po 5 lat; z 2021 do 2026 zawsze bez upadku; ziarno kroku `losDla('czas', w.budynek.klucz, rok)`).
- Kolejność zdarzeń w kroku jak w specyfikacji, rozdział 5: zgon (qx z `miastaM/K` albo `wiesM/K`, 5 lat jako 5 rocznych prób, poprawa umieralności −1% rocznie), urodzenie (plodnosc × mnożnik), wyprowadzka z domu (od 25 lat, tak żeby w wieku 25–34 zostawało z rodzicami około 51%), związek (samotni 25–39, partner z zewnątrz ±3 lata), przeprowadzka poza obszar (szanse 5-letnie z raportu: 25–34 około 13%, 65+ około 2%), emigracja (25–39 około 5,5% na 5 lat), powrót (z `stan: 'wyjechal'` do 25% na 5 lat; rodzic 75+ sam w mieszkaniu → dorosłe dziecko wraca z szansą `DZWIGNIE.powrotOpieka`), wolne mieszkania (nowi z zewnątrz z szansą `DZWIGNIE.zasiedlenie`).
- Wartości startowe dźwigni (od 2029, strojone botem w Task 10): `falaPowrotow` 2029–2036 ×3 dla powrotów; `emigracjaPo2035` 0; `urodzeniaSpadek` 2030–2035 ×0,6; `umieralnosc75` 2035–2045 ×1,3; `powrotOpieka` 3 000 na 10 000 bez upadku i 6 000 z upadkiem; `wyludnienie`: dodatkowe wyjazdy całych gospodarstw na wieś i niskie `zasiedlenie` po 2031, tak żeby w 2051 pustych było 40–60% mieszkań w blokach.
- Każde zdarzenie dopisuje `Wpis` do `w.dziennik`. Mieszkanie, z którego wszyscy odeszli, dostaje wpis `opuszczone`.

- [ ] **Step 1:** Testy: na 20 000 osób z `obsadzRejon` bez upadku przeżycie 60-latków (M) przez 5 lat zgadza się z `5qx` z tabeli ±1,5 pp; z upadkiem w 2051 udział pustych mieszkań w blokach trzech dem jest w [40%, 60%] (budynki z Task 7); nikt nie ma >110 lat; każde dziecko urodzone w symulacji ma matkę w wieku 15–49; nikt urodzony po 2021 nie ma wpisu `przydzial`; `postarz` dwa razy daje identyczny JSON.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Silnik 25 lat z dźwigniami upadku`.

### Task 10: Generator obszaru i narzędzie z piramidami

**Files:**
- Create: `src/mieszkancy/generuj.ts`, `tools/mieszkancy.ts`
- Modify: `package.json` (`"mieszkancy": "node tools/mieszkancy.ts"`)
- Test: `tests/unit/mieszkancy-generuj.test.ts`

**Interfaces:**
- Consumes: wszystko z Task 5–9.
- Produces: `generujBudynek(b: Budynek, g: TabeleGminy | null, k: TabeleKraju): WynikBudynku` (spis 2021 → 2026 → 2051 z upadkiem) i `generujObszar(geo: Geo, g: TabeleGminy | null, k: TabeleKraju): Osiedle`; w `tools/mieszkancy.ts` dla każdego dema: piramida 5-letnia M/K w 2021, 2026 i 2051 (tekstowe słupki), typy gospodarstw w 2051, udział wielopokoleniowych, samotnych 75+, pustych mieszkań, czas generowania; test wsteczny: dla gminy dema `obsadzRejon` dla wszystkich rejonów, `postarz` do końca 2025 bez upadku, porównanie udziałów 0–14, 15–64, 65+, 80+ z `wiek2025` (próg ±2 pp, przy przekroczeniu kod wyjścia 1); argument `--historie` dopisze przykłady po Task 16.

- [ ] **Step 1:** Testy: `generujObszar` dla Przymorza dwa razy daje ten sam skrót JSON; wynik `generujBudynek` dla jednego budynku jest identyczny z tym budynkiem w `generujObszar`; `generujObszar` dla dema trwa w Node poniżej 200 ms (pomiar `performance.now()`, mediana z 3 przebiegów); `generujObszar(geo, null, k)` (brak gminy) daje wynik bez wyjątku.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj generator i narzędzie. Dostrój `DZWIGNIE` tak, żeby test wsteczny przechodził dla trzech gmin, a udział pustych mieszkań w blokach był w [40%, 60%].
- [ ] **Step 4:** PASS; `npm run mieszkancy` kończy się kodem 0.
- [ ] **Step 5:** Commit: `Generator obszaru i narzędzie z piramidami`.
- [ ] **Step 6 (bramka kroku 2):** pełna bramka, wynik `npm run mieszkancy` (piramidy, test wsteczny) wklejony do `docs/POSTEP.md`, raport do sesji koordynującej, commit `Dziennik: silnik mieszkańców do 2051`.

## Krok 3: imiona, nazwiska, odmiana

### Task 11: Tabele imion i nazwisk

**Files:**
- Create: `tools/dane-imiona.ts`, `tools/dane/zakazane-nazwiska.txt`
- Create: `public/data/mieszkancy/imiona.json`, `public/data/mieszkancy/nazwiska/<woj>.json` (16 plików)
- Modify: `src/mieszkancy/tabele.ts` (typy `TabeleImion`, `TabeleNazwisk`), `package.json` (`"dane:imiona"`)
- Test: `tests/unit/mieszkancy-imiona-tabele.test.ts`

**Interfaces:**
- Produces:

```ts
export interface TabeleImion {
  wersja: number;
  lata: Record<string, { M: [string, number][]; K: [string, number][] }>;      // 2000–2025, po 200 imion, PESEL 219
  koszyki: Record<'1920-1945' | '1946-1959' | '1960-1974' | '1975-1989' | '1990-1999', { M: [string, number][]; K: [string, number][] }>;
  powracajace: { M: string[]; K: string[] };    // rosnące w 2019–2026 imiona pradziadków
  przyjezdni: { M: [string, number][]; K: [string, number][] }; // transliteracje ukraińskie i rosyjskie
}
export interface TabeleNazwisk {
  wersja: number; woj: string;
  ogolne: [string, string, number][];   // [męskie, żeńskie, liczba], 300 najczęstszych w województwie
  lokalne: [string, string, number][];  // ≥50% krajowych nosicieli w tym województwie, najwyżej 100
  udzialLokalnych: number;              // na 10 000
}
```

- Koszyki przed 2000: metoda z notatek (`imiona_nazwiska_pesel.md`, sekcja o kohortach): udział zmarłych = (razem ze zmarłymi − żyjący) / razem ze zmarłymi, żyjący urodzeni przed 2000 = żyjący 2026 − suma nadań 2000–2025; progi udziału zmarłych na koszyki: ≥60% → `1920-1945`, 40–60% → `1946-1959`, 20–40% → `1960-1974`, 5–20% → `1975-1989`, <5% → `1990-1999`. Imiona dwufalowe (Zofia, Antoni, Julia, Jan, Stanisław, Helena, Franciszek) wpisane ręcznie do koszyka starszego z wagą z udziału zmarłych.
- Progi: imiona z ≥10 wystąpieniami w roku; nazwiska z ≥300 nosicielami w kraju. `zakazane-nazwiska.txt`: po jednym nazwisku w linii, co najmniej nazwiska prezydentów i premierów Polski od 1989, liderów partii w Sejmie kadencji 2023–2027 oraz Tusk, Ziobro, Sasin z notatek. Nazwiska z listy są usuwane z `ogolne` i `lokalne`.
- Pula przyjezdnych: imiona żyjących, których przybyło od migawki 2019 o ≥5 000 i które mają litery albo końcówki typowe dla transliteracji (`ii` na końcu, `Oleksandr`, `Tetiana`, `Serhii`, `Yuliia` itp.); te same imiona wyrzucone z `lata` i `koszyki`.

- [ ] **Step 1:** Testy: `koszyki['1920-1945'].K` zawiera Janinę, a nie zawiera Agnieszki; `koszyki['1975-1989'].K` zawiera Agnieszkę; `lata['2024'].M` zawiera Nikodema, a żaden koszyk przed 1990 go nie ma; w `pomorskie.json` `lokalne` zawiera Formelę, Labudę i Kreft, `udzialLokalnych` to 2 020 ±150; w `zachodniopomorskie.json` 110 ±60; żadne nazwisko z `zakazane-nazwiska.txt` nie występuje w żadnym pliku; Oleksandr jest w `przyjezdni.M`, a nie ma go w `lata`.
- [ ] **Step 2:** FAIL. **Step 3:** Napisz narzędzie (wejście: katalogi `imiona-nazwiska/*` z `ZM_SUROWE`; CSV z BOM i separatorem `;` albo `,`, wykrywanie po nagłówku). **Step 4:** `npm run dane:imiona`, PASS, rozmiar 17 plików razem poniżej 600 KB.
- [ ] **Step 5:** Commit: `Tabele imion według rocznika i nazwisk według województw`.

### Task 12: Nadawanie imion i nazwisk

**Files:**
- Create: `src/mieszkancy/imiona.ts`
- Modify: `src/mieszkancy/generuj.ts` (nadawanie po `postarz`)
- Test: `tests/unit/mieszkancy-imiona.test.ts`

**Interfaces:**
- Consumes: `TabeleImion`, `TabeleNazwisk`, `Osoba`, `losDla`, `wazony`.
- Produces: `imieDla(rocznik: number, plec: Plec, t: TabeleImion, r: Rng, przyjezdny?: boolean): string` (rocznik ≥2026: lista 2025 z wygaszaniem trendu do 2030, potem 70% z listy 2025, 30% z `powracajace`), `nazwiskoRodziny(t: TabeleNazwisk, r: Rng): [string, string]` (najpierw `szansa(r, udzialLokalnych)` → lokalne, inaczej ogólne), `nadajImiona(w: WynikBudynku, t: TabeleImion, n: TabeleNazwisk, r: Rng): void` (gospodarstwo dostaje nazwisko w formie męskiej i żeńskiej; dzieci po ojcu, u samotnej matki po matce; partner z zewnątrz ma nazwisko z `ogolne`; żona przyjmuje nazwisko męża w 85% przypadków; przyjezdni z wpisem `wprowadzka` po 2022 dostają imię z `przyjezdni` z szansą 1 500 na 10 000).

- [ ] **Step 1:** Testy: 10 000 losowań `imieDla(1950, 'K', …)` nie daje żadnego imienia z czołówki 2020–2025 poza imionami dwufalowymi; dla rocznika 2040 nie daje Patryka ani Angeliki; udział nazwisk lokalnych w 10 000 rodzin pomorskich to 20,2% ±1,5 pp; w Osiedlu Przymorza każda osoba ma niepuste imię i nazwisko, kobieta z nazwiskiem na `-ski` ma formę na `-ska`, a dzieci tej samej pary mają to samo nazwisko co ojciec.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj (ziarno `losDla('imiona', budynek.klucz)`). **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Imiona według rocznika i nazwiska z regionu`.

### Task 13: Odmiana i zgadywacz

**Files:**
- Create: `tools/dane-odmiana.ts`, `public/data/mieszkancy/odmiana.json`, `public/data/mieszkancy/odmiana-koncowki.json`
- Create: `src/mieszkancy/odmiana.ts`
- Modify: `package.json` (`"dane:odmiana"`)
- Test: `tests/unit/mieszkancy-odmiana.test.ts`

**Interfaces:**
- Produces:

```ts
export type Przypadek = 'mian' | 'dop' | 'cel' | 'bier' | 'narz' | 'msc' | 'wol';
export type Formy = Record<Przypadek, string>;
export interface FormyNazwiska { m: Formy; k: Formy; mnoga: string } // mnoga: „Kowalscy”, „Nowakowie”
export function formyImienia(imie: string, plec: Plec, t: TabelaOdmiany): Formy | null;     // ze słownika
export function zgadnijImie(imie: string, plec: Plec, k: TabelaKoncowek): { formy: Formy; pewne: boolean };
export function formyNazwiska(meskie: string, t: TabelaOdmiany, k: TabelaKoncowek): { formy: FormyNazwiska; pewne: boolean };
export function odmien(imie: string, plec: Plec, t: TabelaOdmiany, k: TabelaKoncowek): { formy: Formy; pewne: boolean }; // słownik, a gdy brak, zgadywacz
export interface TabelaOdmiany { wersja: number; imiona: Record<string, { M?: Formy; K?: Formy }>; nazwiska: Record<string, FormyNazwiska> } // klucz: mianownik (nazwiska: forma męska)
export interface TabelaKoncowek { wersja: number; wzorce: { sufiks: string; plec: Plec; ucinek: number; koncowki: Record<Przypadek, string> }[] } // forma = mianownik bez `ucinek` znaków + końcówka
```

- Narzędzie czyta `odmiana/sgjp/sgjp-20260823.tab.gz` (`node:zlib` `gunzipSync`, 5 kolumn TSV, klasa w kolumnie 4), bierze imiona i nazwiska z tabel Task 11 (plus wszystkie imiona SGJP do treningu końcówek), odrzuca formy z kwalifikatorem `pot.` i `niepopr.`, dla nazwisk dokłada mianownik liczby mnogiej. Zgadywacz: reguły końcówek i płci (logika z `dane-surowe/skrypty-badan/reguly.py` i `nazwiska.py`, notatki `odmiana_imion.md` sekcja 4) plus tablica końcówek uczona na SGJP (najdłuższy pasujący sufiks z wzorcem odmiany). `pewne` = obie metody dają ten sam paradygmat.

- [ ] **Step 1:** Testy: dokładne paradygmaty z `dane-surowe/odmiana/wyciag-sgjp/paradygmaty_testowe.md` dla Haliny, Kingi, Oli, Natalii, Mai, Marka, Pawła, Henryka, Kuby, Jakuba, Zbigniewa, Igora i nazwisk Kowalski/Kowalska/Nowak (przepisane do testu jako stałe), w tym: Halina → `dop` Haliny, `narz` Haliną, `wol` Halino; Marek → `dop` Marka, `msc` Marku, `narz` Markiem; Paweł → `dop` Pawła, `msc` Pawle; Kowalski → `mnoga` Kowalscy, Nowak → `mnoga` Nowakowie, żeńskie Nowak nieodmienne. Zgadywacz na co dziesiątym imieniu SGJP odłożonym z treningu daje ≥95% pełnych paradygmatów. `odmien` dla „Nikola”, „Mia”, „Dżesika”, „Leo”, „Oleksandr”, „X Æ A-12” nie rzuca i zwraca 7 niepustych form; dla imienia, gdzie reguły i końcówki się różnią, `pewne` jest false.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj narzędzie i moduł. **Step 4:** `npm run dane:odmiana`, PASS; `odmiana.json` + `odmiana-koncowki.json` razem poniżej 400 KB.
- [ ] **Step 5:** Commit: `Odmiana imion i nazwisk z SGJP i zgadywacz`.
- [ ] **Step 6 (bramka kroku 3):** pełna bramka, wpis w POSTEP, raport do sesji koordynującej, commit `Dziennik: imiona, nazwiska i odmiana`.

## Krok 4: fachy, kronika osiedla i historie

### Task 14: Fachy na 2051 i dawne zawody

**Files:**
- Create: `src/mieszkancy/fachy.ts`
- Modify: `src/mieszkancy/generuj.ts`
- Test: `tests/unit/mieszkancy-fachy.test.ts`

**Interfaces:**
- Consumes: `Osoba`, `Dom` z `src/content/data.ts` (tylko typ).
- Produces: `FACHY: { id: string; m: string; k: string; umiejetnosci: Partial<Record<Dom, number>>; odWieku: number }[]` (co najmniej 16 fachów pokrywających wszystkie 7 dziedzin, nazwy z życia osiedla 2051, np. „zduński”, „łatacz kabli”, „ogrodniczka z dachu”, „felczer”); `DAWNE_ZAWODY: { m: string; k: string; satyra: boolean }[]` (co najmniej 30, w tym prompt engineer, doradca ds. ESG, kurier, influencer, pielęgniarka, hydraulik); `nadajFachy(w: WynikBudynku, r: Rng): void` (dawny zawód tylko dla urodzonych ≤2009, czyli dorosłych przed upadkiem; fach dla wszystkich ≥16 lat w 2051, wagi zależą od dawnego zawodu, np. hydraulik → zduński; dzieci <16 bez fachu).

- [ ] **Step 1:** Testy: każda dziedzina z `Dom` ma co najmniej dwa fachy; każdy mieszkaniec Przymorza w wieku ≥16 ma `fach`, a <16 nie ma; nikt urodzony po 2009 nie ma `dawnyZawod`; `PROFS` z `src/content/data.ts` nie jest importowany w `src/mieszkancy/` (test czyta pliki modułu i szuka `PROFS`).
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Fachy na 2051 i dawne zawody`.

### Task 15: Kronika osiedla i filtr nazw miejsc

**Files:**
- Create: `src/mieszkancy/kronika.ts`
- Test: `tests/unit/mieszkancy-kronika.test.ts`

**Interfaces:**
- Consumes: `GeoPoi` z `src/world/geo.ts` (`{ x, y, c: kategoria, n: nazwa }`), nazwy ulic z tagów `addr:street` budynków (`GeoRoad` nie ma nazw), `TabeleImion` (zbiór imion do filtra), `Budynek`.
- Produces: `nazwaMiejsca(poi: GeoPoi, imiona: ReadonlySet<string>): string` (nazwa, w której po imieniu z listy stoi słowo wielką literą, zamienia się na opis kategorii, np. „zakład fryzjerski na rogu”; nazwy bez takiej pary zostają), `kronika(geo: Geo, budynki: Budynek[], imiona: ReadonlySet<string>, ziarno: string): { rok: number; tekst: string; miejsce?: string }[]` (12–16 zdarzeń z lat 2026–2051, posortowane, co najmniej trzy związane z bakterią i kablami, co najmniej pięć przypiętych do prawdziwych miejsc z mapy, ziarno `rejon` budynku siedziby albo pierwszego budynku).

- [ ] **Step 1:** Testy: „Usługi Remontowe Jan Nowak” → opis bez „Jan” i „Nowak”; „Szkoła Podstawowa nr 12” zostaje; „Żabka” zostaje; „Apteka Pod Lwem” zostaje; kronika Przymorza ma 12–16 wpisów w [2026, 2051], rosnąco, ≥3 o kablach, ≥5 z `miejsce`; dwa wywołania dają to samo.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Kronika osiedla z prawdziwych miejsc`.

### Task 16: Szablony i historie gospodarstw

**Files:**
- Create: `src/mieszkancy/szablony.ts`, `src/mieszkancy/historie.ts`
- Modify: `src/mieszkancy/generuj.ts`, `src/mieszkancy/typy.ts` (`Gospodarstwo.historia: string[]`), `tools/mieszkancy.ts` (`--historie`)
- Test: `tests/unit/mieszkancy-historie.test.ts`

**Interfaces:**
- Consumes: `Wpis`, `Osoba`, `odmien`, `formyNazwiska`, kronika z Task 15, `g` i `wiek` z `src/content/people.ts`.
- Produces: `interface KontekstSzablonu { glowna: Osoba & { formy: Formy }; powiazana?: Osoba & { formy: Formy }; rodzina?: string; rok?: number; dokad?: string; miejsce?: string }` i `wypelnij(szablon: string, kontekst: KontekstSzablonu): string` ze slotami `{o:przypadek}` (imię osoby głównej w przypadku), `{p:przypadek}` (osoba powiązana), `{rodzina}` (mianownik l. mn. nazwiska), `{g:męska|żeńska}` (forma po płci osoby głównej), `{rok}`, `{dokad}`, `{miejsce}`; nierozpoznany slot rzuca wyjątek w testach. `historiaGospodarstwa(gosp: Gospodarstwo, w: WynikBudynku, kronika: ..., odm: ..., r: Rng): string[]` (2–3 zdania; wybór według wagi zdarzeń: `powrotOpieka` > `owdowienie` > `przydzial` > `emigracja` > `powrot` > reszta; co najmniej jedno zdanie z kroniki albo dawnych czasów, gdy gospodarstwo istniało przed 2029). Co najmniej 40 szablonów, po kilka na typ wpisu, plus 10 o dawnych czasach (hulajnogi na minuty, paczkomaty, lodówki na abonament, sklep z mapy).

- [ ] **Step 1:** Testy: `wypelnij('mieszka z {p:narz}', …)` z Haliną daje „mieszka z Haliną”; `{g:wrócił|wróciła}` dla kobiety daje „wróciła”; wszystkie gospodarstwa trzech dem mają 2–3 zdania; żadne zdanie nie zawiera `{` ani `}`; żadne nie pasuje do `/\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i`; żadne nie zawiera pauzy `—` ani ` – `; dwa wywołania dają te same historie.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj; `npm run mieszkancy -- --historie` wypisuje po pięć gospodarstw z każdego dema.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Historie gospodarstw z szablonów`.
- [ ] **Step 6 (bramka kroku 4):** pełna bramka; przykładowe historie z trzech dem do `docs/POSTEP.md` i do raportu dla sesji koordynującej z prośbą o przegląd tonu przez Mateusza; commit `Dziennik: kronika i historie mieszkańców`.

## Krok 5

Integracja z M1 (zarząd i mieszkańcy siedziby z gospodarstw siedziby, karta osoby z rodziną, historią, zmianą imienia z odmianą i napisem o fikcji, atrybucja) to osobny plan. Powstaje po kroku 4, po uzgodnieniu z sesją koordynującą, bo rusza `src/sim/sim.ts` i `src/ui`, gdzie idą prace M2. Cała Polska w tabelach (krok 6 specyfikacji) też osobno, bo pobranie BDL dla 2 477 gmin wymaga obejścia limitów API.
