# Mapa miasta i wyprawy do prawdziwych miejsc: plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wyprawy zarządu idą do prawdziwych sklepów i usług z OSM wybieranych na mapie miasta (minimapa + okno mapy), z łupem według kategorii i miejscami, które się wyczerpują.

**Architecture:** Miejsce to punkt `poi` z kluczem „poi:X:Y” (globalny piksel z=14). Wyprawy zostają w zarządzie (`src/gov`): wspólne rozliczenie dla karty nocy i wypraw dziennych, stan miejsc w `GovState.miasto`, opcja włączana jak `SimOpts.obcy`. Mapa i minimapa to DOM i płótno 2D nad grą (`Modal` dla okna), dane dalekich miejsc doczytują się z kafelków w tle i nie trafiają do zapisu.

**Tech Stack:** TypeScript 7 (`erasableSyntaxOnly`), Vitest, Biome, Playwright (`npm run shots`), kafelki OpenFreeMap (`src/world/mvt.ts`), PixiJS tylko w istniejących warstwach (nowy kod bez PixiJS).

**Spec:** `docs/superpowers/specs/2026-10-18-mapa-miasta-design.md` (przyjęty przez Mateusza 18.10.2026, z jego decyzją: celem są tylko sklepy i usługi). Czytaj razem z `CLAUDE.md`.

## Global Constraints

- Pracujesz w worktree `.claude/worktrees/mapa-miasta` (gałąź `mapa-miasta` od `pelna-gra` ba0479f). Commity lokalne, po polsku, z linią Co-Authored-By wymaganą przez sesję. Bez pushu i wdrożenia bez OK Mateusza.
- Symulacja i zarząd deterministyczne, w Node, bez `Math.random`. W nowym kodzie bez `Math.hypot`, `sin`, `cos` (odległość przez `Math.sqrt(x * x + y * y)`). Nowe pola stanu mają wartości domyślne, `GOV_VERSION` bez zmian.
- `src/gov` nie importuje `src/sim`. `src/world/miasto.ts` i `src/world/miastoKafelki.ts` nie importują PixiJS ani `src/gov`.
- Treść 0.3 w `src/content` (w tym `POICAT`) bez zmiany ani bajta; angielskie nazwy kategorii tylko w nowym `src/content/miejsca.en.ts`. `poiCat` w `src/world/osm.ts` bez zmian (zasila `buildWorld`).
- Napisy od razu po polsku i angielsku (`tx()`, `L()`, `tr()` z `src/core/jezyk.ts`), słowa z `docs/SLOWNICZEK-EN.md`. Nazwy miejsc w tekstach tylko po `nazwaMiejsca` (filtr imion). Komentarze po polsku, nagłówek pliku z kontraktem, importy z `.ts`, `import type`, bez enumów.
- Wartości z projektu: odległość od punktu adresu; najdalej 5000 m w jedną stronę; „blisko” do 300 m; mapa lokalna to koło 192 m (miejsca w nim nie są celami); łup z `POICAT` razy 0,5; ryzyko `POICAT.risk × (1 + odl / 900)`; udźwig 6 sztuk na osobę; droga 3 km/h razy 1,4; przeszukanie 60–180 min; powrót po 20:00 przesuwa się na 6:00 następnego dnia; atrybucja „© współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles” widoczna przy mapie i minimapie.
- Bramka każdego zadania: `npm test`, `npx biome check src tests tools index.html`. Boty bez flagi `--miasto` mają te same skróty co baza z zadania 1. Po zmianie wizualnej zrzut w Chromium obejrzany (`npm run shots -- <filtr>`). Telefon 390×844.

## Review Focus

Nie wynika z żadnego zadania samo z siebie, więc każda linia ma test w zadaniu w nawiasie:

1. Ten sam sklep z dwóch różnych środków mapy (zaokrąglenie do 0,5 m) ma ten sam klucz (zad. 1).
2. Świat bez kluczy i bez miejsc (Overpass, demo sprzed pola, pusty `poi`): karta nocy spada na `TARGETS` bez wyjątku (zad. 4).
3. Osoba na wyprawie dziennej o 20:00 nie dostaje warty ani wyprawy na karcie; wyprawa w drodze po zapisie i wczytaniu wraca raz (zad. 4, 5).
4. Miejsce z zapasem 0 albo wybrane do cna: brak propozycji na karcie, wysyłka odmawia, łup nigdy ujemny, drugi wyjazd do miejsca, do którego ktoś już idzie, odmawia (zad. 3, 5).
5. Brak sieci przy doczytywaniu kafelków albo szerokość 390 px: okno mapy działa na okolicy, bez wyjątku i bez poziomego przewijania (zad. 7, 8).

---

### Task 1: Klucz punktu i miejsca z `geo.poi`

**Files:**
- Modify: `src/world/geo.ts` (`GeoPoi`), `src/world/mvt.ts` (gałąź `poi` w `toGeoT`, ok. l. 548–564), `src/world/osm.ts` (węzły ok. l. 183–187 i środki obrysów ok. l. 217–225)
- Create: `src/world/miasto.ts`
- Test: `tests/unit/miasto.test.ts`

**Interfaces:**
- Produces (`src/world/geo.ts`): `GeoPoi` dostaje `k?: string`, klucz „poi:X:Y”.
- Produces (`src/world/miasto.ts`):
  - `PROMIEN_MAPY_LOKALNEJ = 192`
  - `interface Miejsce { klucz: string; kat: string; x: number; y: number; odl: number; nazwa: string }` (`kat` to `GeoPoi.c`, `x`/`y` metry od adresu, `odl` w metrach)
  - `kluczPunktu(px: number, py: number): string` (globalne piksele z=14, zaokrąglone do całych)
  - `kluczZMetrow(c: LatLon, x: number, y: number): string`
  - `uzupelnijKlucze(geo: Pick<Geo, 'c' | 'poi'>): void` (dopisuje `k` tylko tam, gdzie go brak)
  - `miejscaZPoi(pois: readonly GeoPoi[], nazwa: (p: GeoPoi) => string): Miejsce[]` (wymaga `k`, pomija punkty bez niego, bez powtórzeń klucza, posortowane po `odl` i `klucz`)
  - `naMapieLokalnej(m: Pick<Miejsce, 'x' | 'y'>): boolean`

- [ ] **Step 1: Baza** W worktree `npm ci`. Zapisz skróty botów: `npm run bot` i `npm run bot:zombie` (oczekiwane: da4b24e0, dad44c81 oraz 1f6eef9b, 3e000211; inne wartości zapisz jako bazę zadań 3–5 i 11). `npm test` zielone.
- [ ] **Step 2: Napisz testy `tests/unit/miasto.test.ts`, uruchom (FAIL: brak modułu)**
  - `kluczPunktu` zwraca „poi:X:Y” z całkowitymi X i Y; `kluczPunktu(1.4, 2.6)` to `'poi:1:3'`.
  - Dla każdego adresu z `ADDRESSES` (`tests/unit/fixtures.ts`): `toGeoT(decodedTiles(a), a.lat, a.lon, R)` daje każdemu `geo.poi` pole `k`. Ten sam adres z środkiem przesuniętym o 130 m na wschód (tak jak w `tests/unit/klucze.test.ts`): każdy punkt z pierwszej mapy leżący najwyżej 250 m od obu środków ma w drugiej punkt z tym samym `k` i tą samą kategorią `c` (review focus 1).
  - `toGeo(overpassJson(), …)` (Overpass, Przymorze) daje `k` wszystkim punktom.
  - `kluczZMetrow(c, p.x, p.y)` różni się od `p.k` najwyżej o 2 piksele w obu osiach dla punktów z kafelków; `uzupelnijKlucze` nie nadpisuje istniejącego `k` i dopisuje brakujące.
  - `miejscaZPoi`: pomija punkty bez `k`, scala duplikaty klucza, sortuje po `odl` (`odl = Math.sqrt(x*x + y*y)`), wstawia `nazwa(p)`; `naMapieLokalnej({x: 192, y: 0})` prawda, `{x: 193, y: 0}` fałsz, `{x: 140, y: 140}` fałsz.
- [ ] **Step 3: Zaimplementuj.** W `toGeoT` klucz liczy się z surowych współrzędnych kafelka przed zaokrągleniem do 0,5 m: `kluczPunktu(T.x * KAFEL_PX + q[0] * KAFEL_PX / E, T.y * KAFEL_PX + q[1] * KAFEL_PX / E)` (`q` to punkt z kafelka, `E` extent warstwy, `KAFEL_PX` już zaimportowane z `klucze.ts`). W `osm.ts` klucz z `pikselZ(lat, lon)` węzła, dla obrysu ze środka (lat, lon) wierzchołków.
- [ ] **Step 4: Uruchom `npm test -- tests/unit/miasto.test.ts` (PASS), `npm test` (cały zestaw zielony, `worldKey` i skróty botów bez zmian), Biome. Commit** `git add src/world tests/unit/miasto.test.ts && git commit -m "Klucze punktów miejsc i lista miejsc z geo.poi"`.

### Task 2: Cel wyprawy, stan miasta w zarządzie, ryzyko, czas i łup

**Files:**
- Create: `src/gov/wyprawy.ts`, `src/content/miejsca.en.ts`
- Modify: `src/gov/typy.ts`, `src/gov/tresc.ts` (tylko eksport `ExpTarget`, jeśli brak)
- Test: `tests/unit/wyprawy.test.ts`

**Interfaces:**
- Consumes: `Miejsce` (zad. 1), `POICAT` z `src/content/data.ts`, `ExpTarget`, `LootKey`, `StockDelta`.
- Produces (`src/gov/typy.ts`):
  - `GovPerson.away?: boolean`; `GovInput.okolica?: readonly Miejsce[]` (typ importowany z `src/world/miasto.ts`)
  - `GovState.miasto?: StanMiasta` z `StanMiasta = { zabrano: Record<string, number>; wizyty: Record<string, number>; ostatnia: Record<string, number> }` (klucz miejsca → sztuki, liczba wizyt, dzień ostatniej)
  - `GovState.wyprawy?: Wyprawa[]` z `Wyprawa = { id: number; cel: Cel; ids: string[]; wyjscie: number; powrot: number }` (minuty gry)
  - `NightOption.cel?: Cel`; element `NightPlan.exp` dostaje `cel?: Cel`
- Produces (`src/gov/wyprawy.ts`): `SKALA_LUPU = 0.5`, `MAX_DROGA_M = 5000`, `UDZWIG_NA_OSOBE = 6`, `BLISKO_DO_M = 300`, `LUP_03`, oraz
  - `interface Cel { klucz: string; nazwa: Tx; kat: string | null; x: number; y: number; odl: number; range: 'blisko' | 'daleko'; ryzyko: number; lup: Partial<Record<LootKey, [number, number]>>; powrot: number; zapas: number | null }` (`zapas: null` to cel z `TARGETS`; `powrot` to godzina powrotu z karty nocy, 1 albo 5)
  - `celZTarget(t: ExpTarget): Cel`, `celZMiejsca(m: Miejsce): Cel`, `zapasStartowy(klucz: string, kat: string): number`
  - `wlaczMiasto(st: GovState): void` (idempotentne, bez losowania), `zostaloZMiejsca(st: GovState, cel: Cel): number`
  - `czasWyprawyMin(odl: number, osob: number): number`, `powrotMin(wyjscie: number, odl: number, osob: number): number`
  - `ograniczLup(got: StockDelta, pojemnosc: number): StockDelta`, `ryzykoSlowem(r: number): Tx`, `nazwaKategorii(kat: string): Tx`

- [ ] **Step 1: Napisz testy `tests/unit/wyprawy.test.ts`, uruchom (FAIL)**
  - `celZMiejsca` dla `{kat: 'spozywczy', odl: 450}`: `ryzyko` 0,38, `lup` `{ supplies: [3, 7] }`, `range` „daleko”, `powrot` 5; dla `{kat: 'apteka', odl: 100}`: `ryzyko` 0,33, `lup` `{ meds: [1, 3] }`, „blisko”, `powrot` 1; nieznana kategoria bierze `POICAT.sklep`.
  - `czasWyprawyMin(450, 2)` to 145, `(0, 3)` to 60, `(5000, 1)` to 460. `powrotMin(atHour(3, 15), 450, 2)` to `atHour(3, 15) + 145`; `powrotMin(atHour(3, 19), 450, 2)` to `atHour(4, 6)`.
  - `ograniczLup({wood: 6, supplies: 6, scrap: 0, parts: 0, meds: 0}, 6)` daje `wood: 3, supplies: 3`; przy pojemności ≥ sumy bez zmian; nie schodzi poniżej 0; deterministyczne (`Math.floor`).
  - `zapasStartowy`: ten sam wynik dla tego samego (klucz, kat); dla 200 kluczy „poi:i:i” wszystkie całkowite w 0–60, co najmniej jedno 0 i co najmniej 100 większych od 0.
  - `ryzykoSlowem`: poniżej 0,15 „spokojnie”, poniżej 0,3 „niepewnie”, reszta „groźnie” (oba języki).
  - `wlaczMiasto`: `newGov(1).miasto` jest `undefined`; po wywołaniu `{ zabrano: {}, wizyty: {}, ostatnia: {} }`; drugie wywołanie nic nie zmienia; `JSON.parse(JSON.stringify(st))` równe `st`; `newGov` bez opcji nie dostaje nowych kluczy (skrót `JSON.stringify` jak przed zadaniem).
  - `zostaloZMiejsca`: `zapas - zabrano`, nigdy poniżej 0; dla `zapas: null` zwraca `Infinity`.
- [ ] **Step 2: Zaimplementuj** według sygnatur. Wzory: `lup` = przedziały z `POICAT[kat].loot` przemapowane przez `LUP_03` (jedzenie→supplies, opal→wood, leki→meds, zlom→scrap, czesci→parts), `Math.round(a * SKALA_LUPU)` i `Math.round(b * SKALA_LUPU)`, pary `[0, 0]` pomijane; `ryzyko = round2(risk * (1 + odl / 900))`; `range = odl > BLISKO_DO_M ? 'daleko' : 'blisko'`; `czasWyprawyMin = Math.round(2 * odl * 1.4 / 50) + Math.max(60, 180 - 60 * (osob - 1))`; `zapasStartowy`: `r = mulberry(parseInt(hashString(klucz), 16))`, pierwszy los poniżej 0,25 daje 0, inaczej `Math.min(60, Math.round(Σ((a + b) / 2) po przedziałach lup × (3 + 3 * r())))`; `ograniczLup` skaluje każdy rodzaj przez `Math.floor(v * pojemnosc / suma)`. Angielskie nazwy kategorii w `KAT_EN` (po jednej na klucz `POICAT` bez `mieszkania`, według słowniczka).
- [ ] **Step 3: `npm test -- tests/unit/wyprawy.test.ts` PASS, pełny `npm test`, Biome. Commit** `git commit -m "Cel wyprawy i stan miasta w zarządzie"` (pliki jawnie).

### Task 3: Wspólne rozliczenie wyprawy (noc i dzień) z zapasem miejsca

**Files:**
- Modify: `src/gov/noc.ts` (`expRisk`, `canGo`, `expGain`, `lootMult`, `returnExp` ok. l. 235–264 i 617–686), `src/gov/wspolne.ts` (jeśli potrzebny pomocnik)
- Test: `tests/unit/wyprawy-noc.test.ts`

**Interfaces:**
- Consumes: `Cel`, `ograniczLup`, `zostaloZMiejsca`, `UDZWIG_NA_OSOBE` (zad. 2).
- Produces (`src/gov/noc.ts`): `export function rozliczWyprawe(st: GovState, i: GovInput, fx: GovEffects, cel: Cel, ppl: GovPerson[]): { lines: Tx[]; hurt: { id: string; d: number } | null }`. `expRisk` i `canGo` przyjmują `Pick<Cel, 'ryzyko'>` i `Pick<Cel, 'range'>`.

- [ ] **Step 1: Test regresji i nowe testy `tests/unit/wyprawy-noc.test.ts`, uruchom (FAIL na nowych)**
  - Dla `celZTarget(TARGETS[0])` rozliczenie robi to co dotychczasowe `returnExp`: te same wywołania `rnd` w tej samej kolejności (porównaj `st.rng.s` po rozliczeniu ze stanem sprzed refaktoru, zapisanym jako stała w teście przez uruchomienie na bazie z zad. 1), `st.visits[id]` rośnie, łup maleje z wizytami.
  - Dla celu z `zapas: 12` (`celZMiejsca`) i dwóch osób: łup nie przekracza `min(zostalo, 12)`, `st.miasto.zabrano[klucz]` rośnie o sumę łupu, `wizyty` i `ostatnia` się zapisują; drugie rozliczenie do tego samego miejsca przynosi najwyżej to, co zostało; przy `zostalo` 0 łup zerowy, brak wartości ujemnych (review focus 4).
  - `lines` w obu językach niepuste, `hurt` ustawione tylko przy kłopotach.
- [ ] **Step 2: Zaimplementuj.** Wyodrębnij ciało `returnExp` do `rozliczWyprawe` (kolejność losowań dla `zapas === null` nietknięta), `returnExp` woła je i dopisuje `lines` do `n.lines`, `hurt` do `n.hurt`. Gałąź `zapas !== null`: łup z przedziałów razy 1,6 przy więcej niż jednej osobie, przy kłopotach pół (jak dziś), potem `ograniczLup(got, min(zostaloZMiejsca, UDZWIG_NA_OSOBE * ppl.length))`. Po rozliczeniu `fx.back` i spadek sił jak dziś (`range`).
- [ ] **Step 3: Pełny `npm test`, `npm run bot` i `npm run bot:zombie` (skróty jak baza), Biome. Commit** `git commit -m "Wspólne rozliczenie wyprawy dla nocy i dnia"`.

### Task 4: Karta nocy z miejscami z okolicy

**Files:**
- Modify: `src/gov/noc.ts` (`tonightTargets` ok. l. 229, `makeCard`, `propose`, potwierdzenie ok. l. 536–560, `far` ok. l. 879, `nightTick` ok. l. 958), `src/gov/wyprawy.ts`
- Test: `tests/unit/wyprawy-noc.test.ts` (rozszerzenie), `tests/unit/gov-atrapa.ts` (pole `okolica` kopiowane do wejścia i `away` w `GovPerson`)

**Interfaces:**
- Consumes: `Cel`, `Miejsce`, `naMapieLokalnej`, `zostaloZMiejsca`.
- Produces (`src/gov/wyprawy.ts`): `wybierzCeleNocy(st: GovState, i: GovInput): [Cel, Cel]`. Bez `st.miasto` albo bez miejsc spoza mapy lokalnej z zapasem zwraca dwa cele z `celZTarget` (dzisiejsze `tonightTargets`). `NightOption.target = cel.klucz`, `NightOption.cel = cel`, grupa `n.exp` kopiuje `cel`; stare grupy bez `cel` szukają w `TARGETS`.

- [ ] **Step 1: Testy (FAIL)**
  - Okolica z `Miejsce`: apteka 250 m, sklep spożywczy 500 m, apteka 600 m, szkoła 100 m (mapa lokalna). „Blisko” to apteka 250 m (najbliższe poza koło 192 m, do 300 m), szkoła nigdy nie jest propozycją. „Daleko” wybiera spośród pozostałych w 192–720 m miejsce o największym `Σ środek przedziału łupu / (1 + zapas w magazynie danego rodzaju)`, remis rozstrzyga mniejszy `odl`, potem `klucz`: przy `supplies: 0, meds: 50` spożywczy, przy `supplies: 50, meds: 0` apteka 600 m.
  - Bez okolicy, bez `st.miasto`, z miejscami wyłącznie na mapie lokalnej albo z samym zerowym zapasem: karta ma dzisiejsze `TARGETS`, bez wyjątku (review focus 2).
  - Pełny przebieg Atrapy z `miasto` i okolicą: zatwierdzona wyprawa wraca o `cel.powrot`, raport mówi o miejscu po nazwie kategorii w obu językach, `st.miasto.zabrano` rośnie.
  - Osoba z `away: true` na karcie ma tylko „sen” (notatka „na wyprawie”) i nie trafia do `propose` jako wartownik ani wyprawowicz (review focus 3).
  - Stan zarządu z grupą `n.exp` bez `cel` (zapis sprzed zmiany) kończy wyprawę po staremu.
- [ ] **Step 2: Zaimplementuj** `wybierzCeleNocy`, podmień trzy wyszukania `TARGETS.find` na `gr.cel ?? celZTarget(TARGETS.find(...)!)`, a nazwę na karcie na `cel.nazwa` z odległością („sklep budowlany, 450 m”). Dla celu z `TARGETS` nazwa zostaje z `targetNameTx`.
- [ ] **Step 3: Pełny `npm test`, skróty botów bez flagi jak baza, Biome. Commit** `git commit -m "Karta nocy proponuje wyprawy do miejsc z okolicy"`.

### Task 5: Wyprawa dzienna

**Files:**
- Create: `src/gov/dzienne.ts`
- Modify: `src/gov/zarzad.ts` (`govUpdate` woła `wyprawyTick`)
- Test: `tests/unit/wyprawy-dzienne.test.ts`

**Interfaces:**
- Consumes: `Cel`, `rozliczWyprawe`, `powrotMin`, `czasWyprawyMin`, `canGo`, `zostaloZMiejsca`.
- Produces (`src/gov/dzienne.ts`):
  - `type WynikWysylki = { ok: true; fx: GovEffects; powrot: number } | { ok: false; why: Tx }`
  - `wyslijWyprawe(st: GovState, i: GovInput, cel: Cel, ids: string[]): WynikWysylki`
  - `podgladWyprawy(st: GovState, i: GovInput, cel: Cel, ids: string[]): { czasMin: number; powrot: number; ryzyko: number; unosza: number; zostalo: number | null }`
  - `wyprawyTick(st: GovState, i: GovInput, fx: GovEffects): void`

- [ ] **Step 1: Testy (FAIL)** (Atrapa z `miasto`)
  - Odmowy z powodem w obu językach: brak `st.miasto`, noc (godzina < 6 albo ≥ 20), `cel.odl` powyżej `MAX_DROGA_M`, `zostaloZMiejsca` 0, pusta lista osób, osoba `away`, ugryziona albo niezdolna (`!canGo`), osoba już w `st.wyprawy`, drugie wyjście do klucza, do którego ktoś już idzie (review focus 4).
  - Udane wyjście o 10:00: `fx.away` z osobami, `st.wyprawy` ma wpis z `powrot = powrotMin(...)`, wpis w kronice.
  - `wyprawyTick` o minucie powrotu daje `fx.back` z osobami dokładnie raz, łup w `fx.stock`, `st.miasto.zabrano` rośnie, wpis usunięty z `st.wyprawy`, linie rozliczenia w `st.log`.
  - Zapis w połowie: sklonowany przez `JSON` stan, puszczony do końca, daje ten sam `JSON.stringify` co oryginał (review focus 3).
  - Wyprawa wysłana o 19:00 wraca o 6:00 następnego dnia i nie psuje karty nocy o 20:00 (osoba bez warty, bez wyprawy nocnej).
- [ ] **Step 2: Zaimplementuj.** `wyprawyTick` woła się na początku `govUpdate` (przed nocą); używa `rozliczWyprawe` i nie dotyka `st.night`.
- [ ] **Step 3: Pełny `npm test`, skróty botów bez flagi jak baza, Biome. Commit** `git commit -m "Wyprawa dzienna z mapy miasta w zarządzie"`.

### Task 6: Okolica i opcja w grze

**Files:**
- Modify: `src/main.ts` (`start` ok. l. 355–490, `input()` ok. l. 640), `src/sim/gov.ts` (tylko `away` w `GovPerson`, jeśli `govInput` go nie przepuszcza), `tools/shots.ts`
- Test: scenariusz `miasto-start` w `tools/shots.ts` (wzór: `m2f2-karta-budynku`) i `window.zm.okolica`

**Interfaces:**
- Consumes: `uzupelnijKlucze`, `miejscaZPoi`, `wlaczMiasto`, `nazwaMiejsca`, `zbiorImion`.
- Produces: `window.zm.okolica: Miejsce[]` (tylko do zrzutów i testów) i opcja `?miasto=0` wyłączająca całość.

- [ ] **Step 1: Scenariusz `miasto-start`** (demo przymorze, tempo 0): po starcie `zm.gov.miasto` jest zdefiniowane, `zm.okolica.length > 0`, każdy wpis ma `klucz` i nazwę przefiltrowaną; z `?miasto=0` `zm.gov.miasto` jest `undefined`. Uruchom `npm run shots -- miasto-start` (FAIL).
- [ ] **Step 2: Zaimplementuj.** W `start` przed `mapaMieszkancow`: `uzupelnijKlucze(data.geo)`. Po zbudowaniu świata: `okolica = miejscaZPoi(world.pois, (p) => nazwaMiejsca(p, imiona))` (zbiór imion z `zbiorImion` na tabelach imion, jak w `mieszkancy/kronika.ts`; bez tabel pusty zbiór). Po `newGov` albo wczytaniu zapisu: `if (opcjaMiasto) wlaczMiasto(gov)`. W `input()` po `govInput`: `i.okolica = okolica`.
- [ ] **Step 3: `npm run shots -- miasto-start` PASS, `npm test`, Biome, build. Commit** `git commit -m "Okolica i opcja miasto w grze"`.

### Task 7: Kafelki miasta i miejsca spoza okolicy

**Files:**
- Create: `src/world/miastoKafelki.ts`
- Modify: `src/world/mvt.ts` (eksport `poiTags`, `getTile` i tego, czego potrzeba)
- Test: `tests/unit/miasto-kafelki.test.ts`

**Interfaces:**
- Consumes: `DecodedTile`, `decode`, `WANT`, `kluczPunktu`, `Miejsce`.
- Produces:
  - `poiZKafelkow(tiles: readonly DecodedTile[], c: LatLon): GeoPoi[]` (warstwa `poi`, `poiTags` i `poiCat`, bez limitu promienia, z `k`)
  - `kafelkiWokol(c: LatLon, promienM: number, z: number): [number, number][]`
  - `class KafelkiMiasta { constructor(pobierz: (z: number, x: number, y: number) => Promise<Uint8Array | null>); daj(z: number, x: number, y: number): Promise<DecodedTile | null>; dajObszar(c: LatLon, promienM: number, z: number): Promise<{ tiles: DecodedTile[]; brak: number }> }` (pamięć na sesję, najwyżej 6 pobrań naraz, błąd to `null`, nie wyjątek)
  - `zKafelka(mNaPiksel: number): number` (powyżej 8 m/px zwraca 12, inaczej 14)

- [ ] **Step 1: Testy (FAIL)**
  - Dla każdego adresu: `poiZKafelkow(decodedTiles(a), a)` zawiera każde `k` z `toGeoT(...).poi` (zgodność z zad. 1), a przy `a` przesuniętym o 5 km nie rzuca.
  - `KafelkiMiasta` ze sztucznym `pobierz`: drugie `daj` tego samego kafelka nie pobiera ponownie; `null` z pobrania daje `null` i `brak` w `dajObszar`; jednocześnie nie więcej niż 6 wywołań.
  - `kafelkiWokol` dla promienia 0 zwraca kafelek zawierający punkt; dla 720 m kwadrat pokrywający koło.
- [ ] **Step 2: Zaimplementuj.** `pobierz` w grze używa `getTile` z adresu szablonu `tileUrl` jak `load` w `mvt.ts`.
- [ ] **Step 3: Testy PASS, pełny `npm test`, Biome. Commit** `git commit -m "Kafelki miasta i miejsca spoza okolicy"`.

### Task 8: Okno mapy miasta i karta miejsca

**Files:**
- Create: `src/ui/miasto.ts`, `src/ui/miasto.css`
- Modify: `src/ui/okna.ts` (`Sheet['tone']` dostaje `'miasto'`), `src/main.ts`, `index.html` (przycisk `#btnMiasto` w pasku obok „Build”, import CSS), `src/style.css` tylko jeśli konieczne
- Test: `tests/unit/miasto-ui.test.ts`

**Interfaces:**
- Consumes: `KafelkiMiasta`, `Miejsce`, `Cel`, `celZMiejsca`, `ryzykoSlowem`, `nazwaKategorii`, `zostaloZMiejsca`.
- Produces (`src/ui/miasto.ts`):
  - `interface Widok { cx: number; cy: number; mNaPiksel: number }` (środek w metrach od adresu)
  - `rzut(w: Widok, szer: number, wys: number, x: number, y: number): [number, number]`, `odwrotnie(w: Widok, szer: number, wys: number, px: number, py: number): [number, number]`, `przybliz(w: Widok, czynnik: number, px: number, py: number, szer: number, wys: number): Widok` (zakres 0,5–40 m/px, punkt pod kursorem stoi w miejscu), `trafiony(miejsca: readonly Miejsce[], w: Widok, szer: number, wys: number, px: number, py: number, promienPx: number): Miejsce | null`
  - `kartaMiejsca(m: Miejsce, st: GovState, i: GovInput): { tytul: Tx; linie: Tx[]; mozna: boolean; powod?: Tx }` (kategoria i nazwa po filtrze, odległość i czas drogi, ryzyko słowem, stan „nietknięte” / „ktoś tu był” / „wybrane do cna”, dzień ostatniej wizyty)
  - `mapaMiastaSheet(…): Sheet` z `tone: 'miasto'`, `closable: true`, atrybucją w stopce

- [ ] **Step 1: Testy (FAIL)**: `rzut` i `odwrotnie` są wzajemnie odwrotne (do 1e-9); `przybliz` trzyma punkt pod kursorem i ucina zakres; `trafiony` wybiera najbliższy w promieniu i `null` poza nim; `kartaMiejsca` dla miejsca poza `MAX_DROGA_M` ma `mozna: false` z powodem „za daleko na jeden dzień”, dla `zostalo` 0 „wybrane do cna”, dla nietkniętego zapasu „nietknięte”; wszystkie napisy w obu językach; atrybucja w HTML okna.
- [ ] **Step 2: Zaimplementuj.** Okno to `modal.show` z płótnem 2D (tło z `KafelkiMiasta`: woda, zieleń, drogi, budynki w palecie `src/render/art/palette.ts`; z=12 przy oddaleniu, 14 przy zbliżeniu), ikony kategorii rysowane kodem, osiedle gracza (koło 192 m) wyróżnione, przesuwanie myszą i palcem, kółko i szczypanie, Esc zamyka. Otwarcie woła `pauseGame()`, zamknięcie `nextPrompt()`. Błąd pobrania kafelków: napis „Reszta miasta się nie wczytała”, mapa rysuje to, co ma (review focus 5). Miejsca spoza okolicy z `poiZKafelkow` dołączane i deduplikowane po kluczu.
- [ ] **Step 3: `npm test`, Biome, build; zrzuty `miasto-mapa`, `miasto-mapa-blisko`, `miasto-mapa-telefon` (390×844, bez poziomego przewijania) obejrzane. Commit** `git commit -m "Okno mapy miasta i karta miejsca"`.

### Task 9: Wysyłanie wyprawy z mapy

**Files:**
- Modify: `src/ui/miasto.ts`, `src/ui/okna.ts`, `src/main.ts`
- Test: `tests/unit/miasto-ui.test.ts` (rozszerzenie)

**Interfaces:**
- Consumes: `podgladWyprawy`, `wyslijWyprawe`, `GovPerson`.
- Produces (`src/ui/miasto.ts`): `planWyprawySheet(cel: Cel, i: GovInput, st: GovState, wybrani: ReadonlySet<string>): Sheet` z listą osób (siły, zdrowie, broń; niezdolne wyszarzone z powodem), podsumowaniem z `podgladWyprawy` (wyjście, powrót, ryzyko słowem, ile uniosą, ile zostało) i przyciskiem `data-act="wyslij"`.

- [ ] **Step 1: Testy (FAIL)**: osoby z zaznaczenia gry są od razu wybrane; osoba niezdolna ma `disabled` i powód; przycisk „Wyślij” jest `disabled` bez wybranych; podsumowanie zmienia się z liczbą osób (więcej osób, krócej przeszukują, więcej unoszą); napisy w obu językach.
- [ ] **Step 2: Zaimplementuj.** Potwierdzenie woła `wyslijWyprawe`, wynik przez `applyFx`, podpowiedź `say(...)`, zamyka okno i `nextPrompt()`; odmowa pokazuje `why` w oknie. Zapis po wysłaniu (`save()`).
- [ ] **Step 3: `npm test`, Biome, build; zrzuty `miasto-wysylanie`, `miasto-wysylanie-telefon`, `miasto-powrot` (po przewinięciu `zm.ff`, linie w kronice) obejrzane. Commit** `git commit -m "Wysyłanie wyprawy z mapy miasta"`.

### Task 10: Minimapa

**Files:**
- Create: `src/ui/minimapa.ts`
- Modify: `index.html`, `src/ui/miasto.css`, `src/main.ts`
- Test: `tests/unit/miasto-ui.test.ts` (rozszerzenie)

**Interfaces:**
- Produces: `punktyMinimapy(okolica: readonly Miejsce[], wyprawy: readonly { x: number; y: number }[], bok: number, zasiegM: number): { ikony: { px: number; py: number; kat: string }[]; wyprawy: { px: number; py: number }[]; mapaLokalna: { px: number; py: number; r: number } }`

- [ ] **Step 1: Testy (FAIL)**: miejsca poza `zasiegM` odpadają; punkt (0, 0) leży w środku kwadratu; promień koła mapy lokalnej to `192 * bok / (2 * zasiegM)`; znaczniki wypraw biorą `Cel.x/y` z `st.wyprawy` i z `n.exp` nocy.
- [ ] **Step 2: Zaimplementuj.** Kwadrat w rogu ekranu (nie zasłania paska i poleceń), odświeżany co 500 ms z `drawState`, atrybucja pod spodem; stuknięcie otwiera okno mapy; poniżej 600 px szerokości zwija się do przycisku `#btnMiasto`.
- [ ] **Step 3: `npm test`, Biome, build; zrzut `miasto-minimapa` (komputer) i `miasto-minimapa-telefon` obejrzane; `npm run perf` bez pogorszenia (60 klatek). Commit** `git commit -m "Minimapa miasta"`.

### Task 11: Bot `--miasto`

**Files:**
- Create: `tests/unit/miasto-play.ts`
- Modify: `tools/bot.ts` (flaga `--miasto`, wzór: `--sasiedzi` ok. l. 534)
- Test: `tests/unit/miasto-play.test.ts`

**Interfaces:**
- Produces: `miastoPlayer(): { krok(st, gov, i, push): void; log: MiastoLog }`, `MiastoLog = { wyprawy: number; lup: StockDelta; ranni: number; ugryzieni: number; maxOdl: number[] }` (maksymalna odległość na dzień).

- [ ] **Step 1: Test (FAIL)**: bot na `demoWorld('przymorze')` z `miasto` i okolicą: w 10 dniach wysyła co najmniej jedną wyprawę, wybiera zawsze kategorię według braku (`supplies < osoby * 2` spożywczy, `wood < 4` stacja, co trzeci dzień szkoła), bierze najbliższe niewyczerpane miejsce poza koło 192 m do 2000 m, wysyła dwie osoby o największym zdrowiu, a przebieg jest deterministyczny (dwa razy ten sam skrót).
- [ ] **Step 2: Zaimplementuj** i wypisz w raporcie bota: wyprawy, łup, ranni, ugryzieni, maksymalna odległość po dniach i jedzenie po 10 dniach obok wyniku bez flagi.
- [ ] **Step 3: `npm run bot -- 1 10 --miasto` kończy się bez błędu i drukuje raport; `npm run bot` i `npm run bot:zombie` bez flagi dają skróty z bazy; `npm test`, Biome. Commit** `git commit -m "Bot z wyprawami do miejsc z mapy miasta"`.

### Task 12: Angielski, dema, zrzuty, wydajność, dziennik

**Files:**
- Modify: `tools/make-demos.ts` (tylko jeśli dema potrzebują `k`), `public/demo/*.json` (wynik `npm run demos`), `tools/shots.ts`, `docs/POSTEP.md`
- Test: `tests/unit/miasto-en.test.ts` (wzór: `tests/unit/sasiedzi-en.test.ts`)

- [ ] **Step 1: Test `miasto-en.test.ts` (FAIL)**: każdy napis nowych modułów (`wyprawy`, `dzienne`, `miasto` UI, kategorie) po angielsku bez polskich liter i słów („Planks”, „Meds” itd. według `docs/SLOWNICZEK-EN.md`), po polsku bez zmian.
- [ ] **Step 2: Uzupełnij tłumaczenia, `npm run demos`** i sprawdź `git diff --stat public/demo`: zmiany tylko przez dopisane `k` w `geo.poi`, skróty botów bez flagi dalej jak baza.
- [ ] **Step 3: Pełna bramka.** `npm test`, `npx biome check src tests tools index.html`, `npm run build`, `npm run bot`, `npm run bot:zombie`, `npm run bot -- 1 10 --miasto`, pełne `npm run shots` (wszystkie scenariusze `miasto-*` po polsku i angielsku, zwykły i zombie, komputer i telefon obejrzane), `npm run perf` bez pogorszenia.
- [ ] **Step 4: Dziennik.** Wpis w `docs/POSTEP.md` („Zrobione”: co zbudowane, liczby bramki, co obejrzane; „Decyzje”: decyzje 1–9 ze specyfikacji do przejrzenia; „Zaparkowane”: odnawianie miejsc, wyprawy kilkudniowe, książki z `POICAT.book`). Commit `git commit -m "Mapa miasta: dziennik i bramka"`. Raport do koordynatora `pelna-gra` (SendMessage), gdy wiadomość nie dojdzie: sam wpis w dzienniku wystarczy.

---

## Self-review (wykonane po napisaniu)

- **Pokrycie specyfikacji:** dwie warstwy danych (zad. 1, 6, 7), miejsca i klucze (1), kategorie, łup, ryzyko, zapas (2), wyprawa i czas (2, 5), rozliczenie i wyczerpanie (3), karta nocy (4), włączenie i stare zapisy (4, 6), mapa, karta miejsca, wysyłanie, minimapa (8–10), pauza przy oknie (8), determinizm i zapis (2, 5), otwartość na obcą ekipę i sieć (klucze globalne w 1, stan miejsc jako dane w 2), bot (11), angielski, dema, zrzuty, wydajność, dziennik (12).
- **Spójność typów:** `Cel`, `Miejsce`, `StanMiasta`, `Wyprawa`, `rozliczWyprawe`, `wybierzCeleNocy`, `wyslijWyprawe` mają te same nazwy i sygnatury we wszystkich zadaniach, w których występują.
- **Świadomie poza planem:** odnawianie miejsc, wyprawy kilkudniowe, książki z `POICAT.book`, obca ekipa (osobny dokument).
- **Otwarte dla budującego (z projektu):** wybór warstw i poziomów tła miasta (zad. 8; reguła z=12 przy ponad 8 m/px jest punktem wyjścia), dokładne liczby łupu i zapasu (strojenie botem w zad. 11), ikony i wygląd mapy w palecie gry, liczba kafelków naraz i czas pamięci (zad. 7).
