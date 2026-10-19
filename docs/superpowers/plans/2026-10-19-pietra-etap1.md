# Piętra, etap 1 (widok pięter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Z flagą `?pietra=1` gracz wybiera piętro w pasku u góry, a budynki z takim piętrem pokazują klatkę schodową, ściany i zamknięte drzwi oraz strop „Ciepły tynk” nad mieszkaniami (niższe budynki zostają z dachem), a co najmniej połowa domów dostaje drugą kondygnację.

**Architecture:** Wybór piętra to stan widoku (`GameView`), nie symulacji. Jedna funkcja `sectionPietra(w)` składa z `buildInterior` jedną scenę „typowego piętra” dla całej mapy (szkielet parteru, drzwi zewnętrzne jako okna, drzwi wewnętrzne zamknięte), a `drawChunk` w trybie piętra bierze z niej kafelki budynków z `levels > L` i rysuje strop (tło z kodu plus naklejki z atlasu PixelLab). Flaga jest opcją budowy świata i opcjonalnym polem zapisu.

**Tech Stack:** TypeScript (Node uruchamia pliki `.ts` wprost), PixiJS 8, Vite, Vitest, Playwright (`tools/shots.ts`), Biome.

**Spec:** `docs/superpowers/specs/2026-10-18-pietra-design.md` (czytaj w całości, sekcje „Etap 1”, „Piętra z pokojami i ścianami”, „Decyzje do przejrzenia”). Ten plan wykonuje tylko etap 1. Etapy 2 do 5 z projektu nie wchodzą.

## Global Constraints

Wartości z projektu, każde zadanie je zakłada.

- Flaga: `?pietra=1` w adresie, domyślnie wyłączona. Przy wyłączonej fladze gra jest taka sama jak dziś: te same `levels`, te same skróty botów (`da4b24e0`, `dad44c81`, `1f6eef9b`, `3e000211`, bot:surowce `98f89ee7`, `6a4b5169`, `9bca62d5`, o ile nie zmieniły się na bazie; zapisz skróty na czystej bazie przed pierwszą zmianą i porównuj), te same zapisy i ten sam obraz.
- Zapis: flaga to opcjonalne pole najwyższego poziomu `Save` (`pietra: true`, nieobecne przy wyłączonej), nie wchodzi do `worldKey`, a klucz przy wyłączonej fladze zostaje co do bitu taki sam. Wczytanie czyta pole z zapisu, nie z adresu. `startUrl()` w `src/main.ts` zachowuje `pietra`.
- Wybór piętra jest stanem widoku. Nie wchodzi do `SimState`, nie trafia do zapisu, wraca na 0 przy nowej grze, przy „⌂” (`#zHome`) i przy „Postaw” na piętrze wyższym niż 0.
- Numeracja: 0 to parter, piętro L istnieje w budynku, gdy `levels > L`. `levels` to liczba kondygnacji razem z parterem.
- Awans domów: `cls === 'dom'` i `area >= 60` (m²). Jeśli liczba takich domów z `levels >= 2` jest mniejsza niż połowa wszystkich takich domów zaokrąglona w górę, awansuj domy z `levels === 1` na 2, w kolejności rosnącego skrótu z ziarna świata i numeru budynku (remis po `id`), aż do tej połowy. Bez `Math.random`, bez `sort(() => r() - 0.5)`.
- Piętra widać tylko z bliska (jak przekrój dziś: `CUT_ON` 0,6, `CUT_OFF` 0,55 w `src/render/view.ts`; próg dla L co najmniej 1 wolno obniżyć najwyżej do 0,5). Z daleka dach i podpowiedź „Przybliż, żeby zajrzeć na piętro”.
- Strop „Ciepły tynk”: baza `#e0b48c`, ziarno (kurz `#cac6bc` 28% pikseli po pikselu, `#b7b2a6` 5% polem z kratą 3, `#9a958a` 1% polem z kratą 2, brąz `#765e42` 2% po pikselu), średnio `#d6b798` (214, 183, 152), szwy płyt 96 × 64 px kolor `#b07a55` grubość 1 px, naklejki #3 plama, #4 rysa, #5 łata, #6 pleśń, `gestosc` 0,12, klucz przezroczystości `#e3b79a`. Źródło prawdy: `uzycie` wpisu `strop-tynk` w `assets/manifest.json` (status `zatwierdzony`). Bez atlasu (`?grafika=kod`) strop z kodu bez naklejek.
- RODO: układ pięter jest zmyślony z ziarna. Teksty i karty nie podają pięter osób ani numerów mieszkań.
- Teksty UI po polsku i angielsku (`tx()` dla stałych, `L()` w funkcjach, statyczne napisy `index.html` przez `STATYCZNE` w `src/ui/jezyk.ts`; `index.html` jest po angielsku).
- Telefon 390 × 844: kafelek i lista osiągalne jednym dotknięciem, układ paska się nie rozjeżdża.
- Zasady `CLAUDE.md`: symulacja deterministyczna i oddzielona od rysowania; czyste funkcje działają w Node; zrzut Playwright obejrzany po każdej zmianie wizualnej; „gotowe” dopiero po testach, botach i zrzutach; nic nie wypychaj; lint lokalnie `npx biome check src tests tools server index.html` (`npm run lint` pada na `biome.json` z drzew sesji).
- Baza: gałąź `m4-pietra` utworzona z `projekt-pieter` (`git switch -c m4-pietra projekt-pieter`): ma w sobie `noc-integracja` 9539c4d (strop w manifeście, panel budowy, minimapę) oraz projekt i plan.

## Review Focus

Wejścia i warunki, których projekt nie testuje wprost, a które najpewniej ugryzą. Każde ma test w zadaniu, które jest jego właścicielem.

1. Świat bez budynku z dwiema kondygnacjami (Zielonki bez flagi, mały syntetyczny świat): `listaPieter` zwraca `[0]`, `sectionPietra` zwraca `null`, kafelek nie zawiesza gry i nie ma pozycji bez celu (Zadania 1, 3, 8).
2. Budynek niższy niż wybrane piętro: jego kafelki są piksel w piksel takie same jak bez trybu piętra (dach nie zmienia się od samego wyboru piętra) (Zadanie 6).
3. Zapis z flagą wczytany pod adresem bez flagi i stary zapis bez pola `pietra` (flagę z adresu przy zapisie bez pola ignorujemy) (Zadanie 2).
4. Szybka zmiana piętra w trakcie rysowania i powrót na 0: ostatni wybór wygrywa, a po powrocie kawałki są piksel w piksel jak przed pierwszym wyborem (Zadania 6 i 7).
5. Zbliżenie poniżej progu przy wybranym L co najmniej 1: wszystkie budynki z dachem, klikanie działa jak dziś, podpowiedź „Przybliż…” widoczna; po zbliżeniu klikanie w obrys budynku nic nie robi (Zadania 7 i 8).
6. Siedziba w domu z dwiema kondygnacjami: na piętrze 1 jej pionki są ukryte i jest podpowiedź „Zarząd jest na parterze”, a klik w obrys nie wydaje poleceń (Zadanie 8).

## File Structure

| Plik | Odpowiedzialność |
| --- | --- |
| `src/world/pietra.ts` (nowy) | `awansujDomy`, `listaPieter`, stałe; czyste, Node |
| `src/world/world.ts` | `BuildOpts.pietra`, wywołanie `awansujDomy` przed `return world` |
| `src/ui/zapis.ts` | `Save.pietra?`, walidacja w `readSave`, `pietraWlaczone(saved, params)` |
| `src/render/pietro.ts` (nowy) | `sectionPietra(w)`: scena typowego piętra |
| `src/render/section.ts` | `SectionScene.pietro?`, `describeTile` dla stropu i zamkniętych drzwi |
| `src/render/art/wnetrze.ts` | warianty `strop` i `closed` w `InteriorTile`, kolory |
| `src/render/art/strop.ts` (nowy) | `Strop`, `STROP`, `stropKolor` (kod plus naklejki) |
| `src/render/art/pixellab.ts`, `src/render/grafika.ts`, `tools/atlasy.ts`, `public/assets/*` | opis i atlas stropu |
| `src/render/art/scene.ts`, `src/render/chunks.ts`, `src/render/art/chunkArt.ts` | `ChunkScene.pietra/pietro`, łatka, tryb piętra w `drawChunk` |
| `src/render/pietroWidok.ts` (nowy) | `chunkiPietra`, `widokPietra`; czyste |
| `src/render/view.ts` | `ustawPietro`, widoczność przez `wnetrza` zamiast `cutOn` |
| `src/ui/pietra.ts` (nowy) | lista, podpowiedź, klawisze, klasa `SelektorPieter` |
| `index.html`, `src/style.css`, `src/ui/jezyk.ts`, `src/main.ts` | kafelek, lista, flaga, klawisze, blokady |
| `tests/unit/pietra-pomoc.ts` (nowy) | `demoSwiat(key, pietra)` |
| `tests/unit/pietra-swiat.test.ts`, `pietra-zapis.test.ts`, `pietro-rzut.test.ts`, `grafika-strop.test.ts`, `pietro-rysowanie.test.ts`, `pietra-przelacznik.test.ts` (nowe) | testy zadań |
| `tools/shots.ts`, `docs/POSTEP.md`, `CLAUDE.md` | zrzuty `pietra-*`, dziennik, opis flagi |

---

### Task 0: Baza i skróty wyjściowe

**Files:**
- Create: `tests/unit/pietra-pomoc.ts`

**Interfaces:**
- Produces: `demoSwiat(key: 'przymorze' | 'lanciego' | 'zielonki', pietra: boolean): World` (własny cache per `key:pietra`; buduje jak `demoWorld` z `tests/unit/sasiedzi-pomoc.ts`, czyli ziarno `Number.parseInt(hashString(d.addr), 16) || 2051` i `street: d.street`, dodatkowo `pietra`). Do Zadania 1 `BuildOpts` nie ma jeszcze `pietra`, więc helper przekazuje `{ ...opts, ...(pietra ? { pietra: true } : {}) }` i typ pola dopisuje Zadanie 1.

- [ ] **Step 1: Utwórz gałąź i zapisz skróty wyjściowe**

Run: `git switch -c m4-pietra projekt-pieter && git log --oneline -1`
Expected: czubek to scalenie `noc-integracja` albo nowszy commit projektu.

Run: `npm test 2>&1 | tail -5; npm run bot 2>&1 | tail -3; npm run bot:zombie 2>&1 | tail -3; npm run bot:surowce 2>&1 | tail -3`
Expected: testy zielone (zapisz liczbę zdanych), a skróty botów zapisz w `docs/POSTEP.md` roboczo jako „skróty wyjściowe etapu 1 pięter”. Porównuj z nimi po każdym zadaniu, które dotyka `src/world`, `src/sim` albo `src/main.ts`.

- [ ] **Step 2: Utwórz `tests/unit/pietra-pomoc.ts`** z `demoSwiat` (sygnatura wyżej).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/pietra-pomoc.ts && git commit -m "Piętra, etap 1: pomocnik testów światów dem z flagą"
```

---

### Task 1: Awans domów i lista pięter

**Files:**
- Create: `src/world/pietra.ts`
- Modify: `src/world/world.ts` (`BuildOpts` w `:160-169`, wywołanie tuż przed `return world`, po `applyApts`)
- Test: `tests/unit/pietra-swiat.test.ts`

**Interfaces:**
- Produces: `DOM_MIN_POLE = 60`, `DOM_MIN_UDZIAL = 0.5`, `PIETER_MAX = 20`; `awansujDomy(w: Pick<World, 'buildings' | 'seed'>): number` (zwraca liczbę awansowanych, mutuje `levels`); `listaPieter(w: Pick<World, 'buildings'>): number[]` (rosnąco od 0 do `max(levels) - 1`, najwyżej `PIETER_MAX` pozycji; `[0]`, gdy żaden budynek nie ma `levels >= 2`); `BuildOpts.pietra?: boolean`.
- Consumes: `hashString(s: string): string` z `src/core/rng.ts` (klucz: `Number.parseInt(hashString(\`${w.seed}:pietra:${b.id}\`), 16)`).

- [ ] **Step 1: Napisz testy** w `tests/unit/pietra-swiat.test.ts` (importuj `demoSwiat`, `buildWorld`, `worldKey` z `src/ui/zapis.ts`):
  - `awansuje co najmniej połowę domów od 60 m²`: dla `zielonki` z flagą: `domy = buildings.filter(b => b.cls === 'dom' && b.area >= 60)`, `domy.filter(b => b.levels >= 2).length >= Math.ceil(domy.length / 2)`.
  - `zmienia tylko domy z jedną kondygnacją o jeden`: dla trzech dem porównaj `levels` ze światem bez flagi po `id`: różnica jest 0 albo (`cls === 'dom'`, `area >= 60`, było 1, jest 2); bloki bez zmian.
  - `domy z danymi co najmniej 2 zostają`: `lanciego`: każdy dom z `levels >= 2` bez flagi ma tę samą wartość z flagą.
  - `deterministyczny`: dwa światy z flagą mają identyczne tablice `levels`.
  - `wyłączona flaga nic nie zmienia`: świat bez opcji i z `pietra: false` mają równe `levels` i równe `worldKey`.
  - `worldKey z flagą i bez jest taki sam`.
  - `lista pięter`: `przymorze` bez flagi `listaPieter(w)` ma 17 pozycji i zaczyna się od 0; `zielonki` bez flagi to `[0]`, z flagą `[0, 1]`; syntetyczne `buildings` z `levels: 30` daje dokładnie `PIETER_MAX` pozycji.

- [ ] **Step 2: Run** `npx vitest run tests/unit/pietra-swiat.test.ts` - Expected: FAIL (brak `src/world/pietra.ts`).

- [ ] **Step 3: Zaimplementuj `awansujDomy` i `listaPieter`** w `src/world/pietra.ts` według sygnatur; dodaj `pietra?: boolean` do `BuildOpts` i `if (opts.pietra) awansujDomy(world);` przed `return world` w `buildWorld`. Nagłówek pliku po polsku, jak w sąsiednich modułach `src/world`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/pietra-swiat.test.ts` - Expected: PASS.

- [ ] **Step 5: Bramka i commit**

Run: `npx biome check src tests tools server index.html && npm test 2>&1 | tail -4 && npm run bot 2>&1 | tail -2` - skróty botów jak wyjściowe.

```bash
git add src/world/pietra.ts src/world/world.ts tests/unit/pietra-swiat.test.ts && git commit -m "Piętra, etap 1: awans domów i lista pięter za flagą"
```

---

### Task 2: Flaga w adresie i w zapisie

**Files:**
- Modify: `src/ui/zapis.ts` (`Save` `:17`, `readSave` `:80`), `src/main.ts` (`enter()` ~`:441`, domknięcie `buildWorld` ~`:461`, `save()` ~`:876`, `startUrl` ~`:293`)
- Test: `tests/unit/pietra-zapis.test.ts`

**Interfaces:**
- Produces: `Save.pietra?: true`; `pietraWlaczone(saved: Pick<Save, 'pietra'> | null, params: URLSearchParams): boolean` w `src/ui/zapis.ts`: zapis wygrywa (`saved ? saved.pietra === true : params.get('pietra') === '1'`).
- Consumes: `BuildOpts.pietra` (Zadanie 1).

- [ ] **Step 1: Napisz testy** (wzorzec: `tests/unit/interfejs.test.ts:481-530`, pamięć atrapa z `getItem/setItem/removeItem`):
  - `zapis bez pola pietra wczytuje się`: `readSave(store)` zwraca obiekt, `pietra` jest `undefined`.
  - `zapis z pietra: true wczytuje się`.
  - `pietra różne od true odrzuca zapis`: `false`, `1`, `'1'` dają `null`.
  - `pietraWlaczone`: brak zapisu i `?pietra=1` daje `true`; brak zapisu bez parametru `false`; zapis z `pietra: true` bez parametru `true`; zapis bez pola z `?pietra=1` daje `false` (zapis wygrywa).

- [ ] **Step 2: Run** `npx vitest run tests/unit/pietra-zapis.test.ts` - Expected: FAIL.

- [ ] **Step 3: Zaimplementuj** pole i walidację (jak `siec`), `pietraWlaczone`. W `src/main.ts`: `const pietra = pietraWlaczone(saved, params)` w `enter()`, zmienna modułu dla `save()`, `buildWorld(..., { ..., pietra })` w domknięciu przekazanym do `siec.przygotuj`, `save()` dopisuje `...(pietra ? { pietra: true } : {})` (przy wyłączonej fladze zapis bajt w bajt jak dziś), `startUrl` zachowuje `pietra=1`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/pietra-zapis.test.ts tests/unit/interfejs.test.ts` - Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "Piętra, etap 1: flaga ?pietra=1 w adresie i w zapisie"`

---

### Task 3: Scena typowego piętra

**Files:**
- Create: `src/render/pietro.ts`
- Modify: `src/render/section.ts` (pole `SectionScene.pietro?: true`)
- Test: `tests/unit/pietro-rzut.test.ts`

**Interfaces:**
- Produces: `sectionPietra(w: InteriorWorld): SectionScene | null` (`InteriorWorld` z `src/world/interior.ts`; `null`, gdy żaden budynek nie ma `levels >= 2`). Wynik: `cell` i `room` o rozmiarze `w.size * w.size`, `building: -1`, `pietro: true`, `otwarte` = zbiór numerów budynków z `levels >= 2`, `entrances` i `lit` puste, `windows` jako zbiór, `seed: w.seed | 0`, bez `damage`, `why`, `roomApt`. Numery pomieszczeń rosną po budynkach (`base` = suma `rooms.length` poprzednich).
- Reguły składania budynku `b` z `levels >= 2` (rosnąco po `id`): `it = buildInterior(w, b.id)` (bez `home`); kopiuj komórki tylko tam, gdzie `w.bid[i] === b.id`; drzwi na brzegu obrysu (sąsiad spoza budynku albo poza mapą) zamień na `IN.WALL` i dodaj do `windows`; dla `b.cls` innego niż `blok` i `dom` komórki ścian i drzwi we wnętrzu (nie na brzegu) zamień na `IN.FLOOR` z `room = -1`; schody i klatka zostają.
- Consumes: `buildInterior(w: InteriorWorld, id: number, opts?): Interior`, `IN`.

- [ ] **Step 1: Napisz testy** (`demoSwiat` z Zadania 0):
  - `null dla świata bez budynków z dwiema kondygnacjami`: `zielonki` bez flagi.
  - `szkielet piętra bloku jest taki sam jak parteru`: `lanciego`, budynek siedziby (`w.hq`, 4 kondygnacje): dla każdego kafelka budynku `scena.cell[i]` równa `buildInterior(w, hq).cell[i]`, z wyjątkiem brzegowych drzwi (wtedy `IN.WALL`); lista różnic jest podzbiorem brzegowych drzwi.
  - `siedziba z home i bez home ma ten sam szkielet`: tablice `cell` z `w.interior` i z `buildInterior(w, w.hq)` równe. Jeśli test się nie zgadza, to znalezisko: zapisz różnice w dzienniku i wybierz wariant bez `home` jako wzorzec rzutu (rzut piętra ma nie zawierać mieszkania zarządu).
  - `drzwi zewnętrzne to okna`: żaden kafelek `IN.DOOR` w scenie nie ma sąsiada spoza budynku, a każdy zamieniony kafelek jest w `windows`.
  - `dom: ściany działowe zostają`: `zielonki` z flagą, dom z `levels >= 2`: w scenie jest co najmniej jeden `IN.WALL` niebrzegowy, a `kinds` nie zawiera `'klatka'` dla pomieszczeń domu.
  - `budynek inny niż blok i dom nie ma ścian działowych`: syntetyczny świat (`emptyGeo()` i `rect()` z `tests/unit/world.test.ts` albo `geoWith` z `tests/unit/interior-mock.ts`) z jednym budynkiem `building: 'retail'`, `building:levels: '2'`: w scenie nie ma niebrzegowego `IN.WALL` ani `IN.DOOR`.
  - `deterministyczna`: dwa wywołania dają równe `cell` i `room` (`Buffer.compare` równy 0).
  - `numery pomieszczeń nie nachodzą na siebie`: zbiory numerów pomieszczeń różnych budynków są rozłączne.

- [ ] **Step 2: Run** `npx vitest run tests/unit/pietro-rzut.test.ts` - Expected: FAIL.

- [ ] **Step 3: Zaimplementuj `sectionPietra`** w `src/render/pietro.ts` według reguł wyżej. Dopisz `pietro?: true` do `SectionScene` (opis w komentarzu: scena typowego piętra, rysowana tylko w trybie piętra).

- [ ] **Step 4: Run** `npx vitest run tests/unit/pietro-rzut.test.ts` - Expected: PASS. Zmierz czas `sectionPietra(demoSwiat('przymorze', false))` w Node (`console.time` w jednorazowym skrypcie) i wpisz do dziennika roboczo; użyje go Zadanie 9.

- [ ] **Step 5: Commit** `git add -A && git commit -m "Piętra, etap 1: scena typowego piętra z szablonu parteru"`

---

### Task 4: Strop: kolor z kodu i atlas naklejek

**Files:**
- Create: `src/render/art/strop.ts`
- Modify: `src/render/art/pixellab.ts` (`OpisGrafiki`, `Grafika`, `GrafikaKawalkow`, `grafikaZ`; podbij `WERSJA_GRAFIKI` o jeden), `src/render/grafika.ts` (`:29`, lista plików), `src/render/art/scene.ts` (`:264`, obiekt `art`), `tools/atlasy.ts` (blok jak dla `dach`, `:235-255` i `:355-384`), `public/assets/strop.png` i `public/assets/grafika.json` (generowane przez `npm run atlasy`)
- Test: `tests/unit/grafika-strop.test.ts`; aktualizacje pinów w `tests/unit/grafika-atlasy.test.ts`, `tests/unit/grafika-rysowanie.test.ts:255` (`Object.keys(cs.art)` staje się `['blok', 'dach', 'strop', 'teren']`), `tests/unit/grafika-wczytanie.test.ts` (lista plików)

**Interfaces:**
- Produces: w `src/render/art/strop.ts`: `interface Strop { img: Obraz | null; naklejka: number; naklejek: number; gestosc: number }` (`Obraz` z `pixellab.ts`; typ importowany tylko jako `import type`, żeby nie było cyklu), `const STROP` ze stałymi z Global Constraints, `stropKolor(s: Strop | null, ax: number, ay: number): number` (0xRRGGBB, `ax`, `ay` to piksele świata). `OpisGrafiki.strop: { id: string; plik: string; naklejka: number; naklejek: number; gestosc: number }`, `GrafikaKawalkow.strop: Strop | null`.
- Kolejność w `stropKolor` jak w `papaKolor`: naklejka (kafelek 32 px: `h2(cx, cy, 2) < gestosc`, wariant z `h2(cx, cy, 3)`, przesunięcie z `h2(cx, cy, 4)` i `h2(cx, cy, 5)`, piksel z `alfa 0` przepuszcza), potem szew (`ax % 96 === 0 || ay % 64 === 0` daje `szwyKolor`), potem ziarno (warstwy od spodu: kurz, `#b7b2a6`, `#9a958a`, brąz; późniejsza przykrywa wcześniejszą; „po pikselu” to `h2(ax, ay, salt) < udzial`, „pole” to szum wartościowy z `vnoise` w `src/render/art/hash.ts` o kracie 3 albo 2 px plus drugie pole 2,2 raza drobniejsze z wagą 0,3, piksele z najniższych wartości dostają kolor; zakalibruj progi tak, żeby udziały wyszły jak w Global Constraints).

- [ ] **Step 1: Napisz testy** w `tests/unit/grafika-strop.test.ts`:
  - `średni kolor stropu z kodu`: średnia RGB `stropKolor(null, ax, ay)` po obszarze 256 × 256 px równa (214, 183, 152) z tolerancją 4 na kanał.
  - `udziały kolorów ziarna`: poza kolumnami i wierszami szwów kurz `#cac6bc` w granicach 0,28 plus minus 0,03, `#b7b2a6` 0,05 plus minus 0,02, `#9a958a` 0,01 plus minus 0,01, `#765e42` 0,02 plus minus 0,01.
  - `szwy co 96 × 64`: piksele z `ax % 96 === 0` i z `ay % 64 === 0` mają `#b07a55`.
  - `ciągłość między kafelkami`: wartość w `(ax, ay)` zależy tylko od współrzędnych świata (te same współrzędne, to samo; brak zależności od kafelka).
  - `strop jest co najmniej 2,5 razy jaśniejszy od dachu #313336` (luminancja względna WCAG).
  - `naklejki z atlasu`: z `Strop` z obrazem czterech naklejek (obraz syntetyczny w teście, jedna naklejka cała nieprzezroczysta w znanym kolorze) i `gestosc: 1` piksele naklejki przykrywają tło w kafelku, a piksele przezroczyste przepuszczają tło.
  - `atlas jest zgodny z manifestem`: istniejący test w `grafika-atlasy.test.ts` rozszerz o `opis.strop.id` zatwierdzony i o to, że `strop.png` leży w `public/assets`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/grafika-strop.test.ts` - Expected: FAIL.

- [ ] **Step 3: Zaimplementuj** `src/render/art/strop.ts` i podpięcie w `pixellab.ts` (`grafikaZ` buduje `strop` z obrazu `opis.strop.plik`, brak obrazu daje `img: null`, a kolor z kodu zostaje). W `tools/atlasy.ts` dodaj składanie: `asset('strop-tynk')`, cztery naklejki (numery z `uzycie.naklejki`) przycięte do `uzycie.wnetrze_wariantu[n]`, ustawione każda w komórce 32 × 32 px od lewego górnego rogu, piksele w kolorze `uzycie.klucz` (`#e3b79a`) przezroczyste, zapis `public/assets/strop.png` i `grafika.json.strop`. W `src/render/grafika.ts` dopisz plik do listy ładowanych. W `scene.ts` `art` dostaje `strop`.

- [ ] **Step 4: Wygeneruj atlas i uruchom testy**

Run: `npm run atlasy && npm run atlasy -- --sprawdz && npx vitest run tests/unit/grafika-strop.test.ts tests/unit/grafika-atlasy.test.ts tests/unit/grafika-rysowanie.test.ts tests/unit/grafika-wczytanie.test.ts`
Expected: PASS (zaktualizuj piny w pozostałych plikach zgodnie z listą wyżej). Jeśli inna gałąź zmieniła `WERSJA_GRAFIKI` w międzyczasie, scal ręcznie i podbij o jeden.

- [ ] **Step 5: Commit** `git add -A && git commit -m "Piętra, etap 1: strop Ciepły tynk z kodu i atlasu PixelLab"`

---

### Task 5: Warianty kafelka: strop i zamknięte drzwi

**Files:**
- Modify: `src/render/art/wnetrze.ts` (`InteriorTile` `:47-61`, `interiorColor` `:696`, `doorColor` `:459-535`), `src/render/section.ts` (`describeTile` `:226`)
- Test: `tests/unit/pietro-rysowanie.test.ts` (część opisu kafelka)

**Interfaces:**
- Produces: `InteriorTile` dostaje `{ kind: 'strop'; walls?: number }` i `closed?: boolean` w wariancie `door`. `describeTile(sec, i, size, facade)` dla `sec.pietro === true`: kafelek `IN.FLOOR`, którego pomieszczenie ma rodzaj inny niż `'klatka'` (albo `room < 0`), daje `strop` (z `walls` jak dla `floor`); `IN.DOOR` daje `door` z `closed: true` i `entrance: false`; reszta (klatka, schody, ściany, okna) jak dla przekroju. `interiorColor` dla `strop` zwraca `stropKolor(null, tx * 32 + px, ty * 32 + py)`.

- [ ] **Step 1: Napisz testy** (w `tests/unit/pietro-rysowanie.test.ts`, scena z `sectionPietra(demoSwiat('lanciego', false))`):
  - `kafelek mieszkania to strop, klatki to posadzka`: dla pierwszego kafelka `IN.FLOOR` z pomieszczeniem rodzaju innego niż `klatka` `describeTile(...)` ma `kind === 'strop'`; dla kafelka klatki `kind === 'floor'` z `room === 'klatka'`.
  - `drzwi we wnętrzu są zamknięte`: każdy `IN.DOOR` ma `closed === true`.
  - `schody zostają`: kafelek `IN.STAIRS` ma `kind === 'stairs'`.
  - `bez flagi pietro describeTile działa jak dziś`: dla sceny `sectionOf(w)` (bez `pietro`) opisy kafelków nie zawierają `strop` ani `closed`.
  - `zamknięte drzwi wyglądają inaczej niż otwarte`: `drawInteriorTile` zamkniętych drzwi poziomych różni się od otwartych w co najmniej 20 procentach pikseli; poziome różnią się od pionowych.
  - `kolor stropu z interiorColor to stropKolor(null, ...)` dla kilku współrzędnych.

- [ ] **Step 2: Run** `npx vitest run tests/unit/pietro-rysowanie.test.ts` - Expected: FAIL.

- [ ] **Step 3: Zaimplementuj** warianty. W `doorColor` dla `closed`: narysuj skrzydło zamkniętych drzwi zamiast progu (wzorzec: wczesny powrót jak w `boards()` `:539`), bez zmiany wyglądu drzwi w przekroju.

- [ ] **Step 4: Run** `npx vitest run tests/unit/pietro-rysowanie.test.ts tests/unit/section.test.ts tests/unit/wnetrze-rzeczy.test.ts tests/unit/interior.test.ts` - Expected: PASS (istniejące testy `section` i `wnetrze` bez zmian).

- [ ] **Step 5: Commit** `git add -A && git commit -m "Piętra, etap 1: kafelki stropu i zamkniętych drzwi"`

---

### Task 6: Tryb piętra w `drawChunk` i łatka sceny

**Files:**
- Modify: `src/render/art/scene.ts` (`ChunkScene` `:46-68`, `chunkSceneOf` `:75-97`), `src/render/chunks.ts` (`MapChange`, `ScenePatch` `:133-142`, `scenePatchOf` `:144`, `applyScenePatch` `:157`), `src/render/art/chunkArt.ts` (`drawChunk` `:440`, `open` `:558`)
- Test: `tests/unit/pietro-rysowanie.test.ts` (część rysowania), `tests/unit/chunks.test.ts` (nowe pola)

**Interfaces:**
- Produces: `ChunkScene.pietra: SectionScene | null` i `ChunkScene.pietro: number` (domyślnie `null` i `0`; `chunkSceneOf` ustawia je tak, nie zmieniając kluczy `cs.w` ani `cs.art`, które testy przypinają); `MapChange.pietro?: number` i `MapChange.pietra?: SectionScene`; `ScenePatch.pietro?: number` i `ScenePatch.pietra?: SectionScene`; `applyScenePatch` ustawia oba pola na kopii sceny.
- Zachowanie `drawChunk(sc, cx, cy, s, canvas, cut)`: gdy `cut && sc.pietro >= 1 && sc.pietra`, `sec = sc.pietra` zamiast `sc.section`; kafelek jest `inner` tylko wtedy, gdy `sec.cell[i] !== IN.NONE` i `sc.styles[bid].levels > sc.pietro` (inne budynki rysują się jak bez przekroju, czyli dach); `facade` liczy się bez `styles[sec.building]`, gdy `sec.building < 0` (użyj `0`); `open` jest prawdą dla budynku, tylko gdy jego `levels > sc.pietro` i jest w `sec.otwarte`; kafelek `strop` rysuje `stropKolor(sc.art?.strop ?? null, ax, ay)` zamiast `interiorColor`; zużycie i ślady (`dmg`, `why`, `soot`) nie występują, bo scena piętra ich nie ma. Przy `sc.pietro === 0` albo `cut === false` obraz jest piksel w piksel taki sam jak dziś.

- [ ] **Step 1: Zapisz skrót wyjściowy** (zanim ruszysz `drawChunk`): w teście `pietro-rysowanie.test.ts` policz skrót pikseli kawałka z siedzibą dla `lanciego` w trybie `cut = true` i `cut = false` na kodzie sprzed zmiany (użyj sposobu wzorcowego z `tests/unit/grafika-rysowanie.test.ts`: `buildScene(world, art)`, atrapa płótna z `src/render/atrapy.ts`), wpisz oba skróty jako stałe `BAZA_CUT` i `BAZA_BEZ_CUT`.

- [ ] **Step 2: Napisz testy** rysowania (to samo `lanciego`, scena z `sc.pietra = sectionPietra(world)`, `sc.pietro = 2`, `cut = true`):
  - `strop nad mieszkaniem`: piksel w środku kafelka `strop` równa się `stropKolor(null, ax, ay)` (grafika zastępcza: `art = null`).
  - `klatka widoczna`: piksel kafelka klatki równa się `interiorColor({ kind: 'floor', room: 'klatka', ... }, ...)`.
  - `budynek niższy niż piętro ma dach jak bez piętra` (Review Focus 2): dla budynku z `levels === 1` kafelki w jego obrębie w obrazie z `pietro = 2` i `cut = true` są równe obrazowi z `pietro = 0` i `cut = false`.
  - `pietro 0 nie zmienia obrazu`: kawałek siedziby z `sc.pietra` ustawionym i `pietro = 0` równy `BAZA_CUT`; z `cut = false` równy `BAZA_BEZ_CUT`.
  - `powrót na 0 przywraca obraz` (Review Focus 4): po kolei `pietro = 2`, `pietro = 0`: skrót równy `BAZA_CUT`.
  - `łatka`: `scenePatchOf(sc, { pietro: 2, pietra })` niesie oba pola, a `applyScenePatch` na kopii sceny ustawia je; w `chunks.test.ts` zaktualizuj piny kształtu sceny, jeśli istnieją.

- [ ] **Step 3: Run** `npx vitest run tests/unit/pietro-rysowanie.test.ts tests/unit/chunks.test.ts` - Expected: FAIL.

- [ ] **Step 4: Zaimplementuj** pola sceny i łatki oraz tryb piętra w `drawChunk` według zachowania wyżej.

- [ ] **Step 5: Run** `npx vitest run tests/unit/pietro-rysowanie.test.ts tests/unit/chunks.test.ts tests/unit/grafika-rysowanie.test.ts && npm test` - Expected: PASS (zgodność rysowania w workerze i w głównym wątku sprawdza później scenariusz zrzutów `worker-zgodnosc` w Zadaniu 9).

- [ ] **Step 6: Commit** `git add -A && git commit -m "Piętra, etap 1: tryb piętra w drawChunk i łatka sceny"`

---

### Task 7: Widok: wybór piętra, kawałki z przekrojem i widoczność

**Files:**
- Create: `src/render/pietroWidok.ts`
- Modify: `src/render/view.ts` (`cutOn` `:203`, `setScene` `:340-395`, `redraw` `:381`, `underRoof` `:615`, widoczność przy `:556`, `:588`, `:786`, `:797-806`, `:866`, `:935-941`, `:1057`, `:1156-1167`)
- Test: `tests/unit/pietra-przelacznik.test.ts` (część widoku)

**Interfaces:**
- Produces: `chunkiPietra(sc: Pick<ChunkScene, 'w' | 'styles' | 'chunks'>, L: number): Set<number>` (numery kawałków `cy * sc.chunks + cx`, które dotyka jakikolwiek budynek z `styles[id].levels > L`; pusty zbiór dla `L < 1`); `widokPietra(cutOn: boolean, L: number): { wnetrza: boolean; aktywne: boolean }` (`wnetrza = cutOn && L === 0`, `aktywne = cutOn && L >= 1`). `GameView.ustawPietro(L: number, sec: SectionScene | null): void`; `GameView.pietro: number`; `GameView.pietroAktywne(): boolean`; `GameView.wnetrza: boolean`.
- Zachowanie `ustawPietro`: ustawia `this.pietro`; wysyła łatkę `{ pietro: L, pietra: sec }` przez `painter.patch` i nakłada ją na lokalną scenę; liczy nowy `cutChunks` (dla L co najmniej 1: `chunkiPietra`; dla L równego 0: jak dziś zbiór siedziby i sąsiadów); dla sumy starego i nowego zbioru zwiększa `ver` i ustawia tylko `CUT_BIT` w `stale` (nie `NEAR_BIT` ani `FAR_BIT`); odświeża pamięć podręczną `e.inside`. W miejscach widoczności rzeczy, pionków, zwłok, świateł, planów budowy, dymu i `pickResident` zastąp `this.cutOn` przez `this.wnetrza` (ukrycie osób i rzeczy w obrysie na piętrze co najmniej 1 wynika z tego, że `underRoof` dla siedziby i otwartych sąsiadów jest prawdą, a `wnetrza` fałszem); `pick` dostaje to samo sprawdzenie widoczności co `pickResident`.

- [ ] **Step 1: Napisz testy** czystych funkcji:
  - `chunkiPietra`: `lanciego`, `L = 1`: zawiera kawałek siedziby i każdy kawałek dotknięty budynkiem z `levels > 1`; nie zawiera kawałka, w którym są wyłącznie budynki z `levels === 1`; dla `L` równego największemu `levels` zbiór jest pusty; dla `L = 0` pusty.
  - `widokPietra`: cztery kombinacje `cutOn` i `L` (Review Focus 5): bez `cutOn` żadne z dwóch pól nie jest prawdą; z `cutOn` i `L = 0` `wnetrza` prawda; z `cutOn` i `L = 2` `aktywne` prawda, `wnetrza` fałsz.

- [ ] **Step 2: Run** `npx vitest run tests/unit/pietra-przelacznik.test.ts` - Expected: FAIL.

- [ ] **Step 3: Zaimplementuj** `src/render/pietroWidok.ts` i zmiany w `view.ts` według zachowania wyżej. Zmiana piętra w trakcie rysowania: wynik zamówienia z poprzednią `ver` jest odrzucany przez istniejące `install` (`d.v !== s.ver`), więc ostatni wybór wygrywa (Review Focus 4); nic poza `CUT_BIT` nie staje się nieaktualne.

- [ ] **Step 4: Run** `npx vitest run tests/unit/pietra-przelacznik.test.ts tests/unit/game.test.ts tests/unit/chunks.test.ts` - Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "Piętra, etap 1: wybór piętra w widoku i widoczność pod stropem"`

---

### Task 8: Kafelek „Piętro”, lista, podpowiedzi, klawisze i blokady

**Files:**
- Create: `src/ui/pietra.ts`
- Modify: `index.html` (w `header.top` po `.fps`, przed `#btnMiasto`; nic nie wstawiaj między `#btnMiasto` a `#btnBuild`), `src/style.css`, `src/ui/jezyk.ts` (`STATYCZNE`), `src/main.ts` (klawisze `:2619-2657`, `#zHome` `:1426`, `hud()` `:1151`, `orderAt` `:1978`, `focusTile` `:2056`, `endPointer` `:2477`, przytrzymanie `:2431`, `placeClick` i start stawiania, nowa gra), `tests/unit/jezyk-ui.test.ts` (sprawdza się sam przez `STATYCZNE`)
- Test: `tests/unit/pietra-przelacznik.test.ts` (część UI)

**Interfaces:**
- Produces w `src/ui/pietra.ts`: `interface PozycjaListy { pietro: number; podpis: Tx; wybrane: boolean }`; `pozycjeListy(lista: number[], wybrane: number): PozycjaListy[]` (od najwyższego w dół; podpis „parter”/„ground floor” dla 0, „piętro”/„floor” dla reszty); `podpowiedz(o: { pietro: number; cutOn: boolean; zarzadUkryty: boolean }): Tx | null` (`'Przybliż, żeby zajrzeć na piętro'` dla `pietro >= 1 && !cutOn`; `'Zarząd jest na parterze'` dla `pietro >= 1 && cutOn && zarzadUkryty`; inaczej `null`); `nastepnePietro(lista: number[], obecne: number, krok: 1 | -1): number` (zaciska do `lista`); `class SelektorPieter { constructor(el: { btn: HTMLButtonElement; list: HTMLElement; note: HTMLElement }, wybor: (L: number) => void); odswiez(lista: number[], wybrane: number, podpowiedz: Tx | null): void }`. Kafelek: `<button type="button" class="stat floor" id="btnFloor" hidden>` z `small.stat-k` i `b.stat-v`; lista: element z klasami `.ctx` i `.ctx-item` (jak `#ctx`), `position: absolute; top: 100%; z-index: 6` pod kafelkiem; notka: `role="status"`.
- Zachowanie w `main.ts`: kafelek jest widoczny tylko z flagą; klawisze PageUp (wyżej) i PageDown (niżej) obsługiwane przy tych samych wyjątkach co inne klawisze (brak `sim`, ukryty `#app`, otwarty modal, pola tekstowe, otwarte `ctx`), tylko z flagą; `#zHome` i start stawiania (`Postaw`) wołają `view.ustawPietro(0, ...)`; nowa gra zeruje; `sectionPietra(world)` liczone leniwie przy pierwszym wyborze piętra co najmniej 1 i trzymane w zmiennej (wynik przekazywany do `ustawPietro`); `zarzadUkryty` liczone co 200 ms w `hud()`: któryś pionek `core` stoi na kafelku z `world.bid[tile] >= 0` przy `view.pietroAktywne()` albo przy wybranym piętrze co najmniej 1 i siedzibie z `levels <= L` (dach); blokada klików: gdy `view.pietroAktywne()` i `world.bid[tile] >= 0`, `orderAt`, `focusTile`, `endPointer` (gałąź `pick` i `pickResident`), ramka Shift i przytrzymanie nie robią nic poza pokazaniem podpowiedzi „Zarząd jest na parterze”; poza obrysami budynków wszystko jak dziś.

- [ ] **Step 1: Napisz testy** czystych funkcji w `pietra-przelacznik.test.ts`:
  - `pozycjeListy`: lista `[0, 1, 2, 3]` z wybranym 2 daje pozycje 3, 2, 1, 0, wybrana tylko jedna, podpisy poprawne; lista `[0]` daje jedną pozycję (Review Focus 1: kafelek nie ma pozycji bez celu).
  - `podpowiedz`: `{ pietro: 0, ... }` daje `null`; `{ pietro: 2, cutOn: false, ... }` daje „Przybliż…”; `{ pietro: 2, cutOn: true, zarzadUkryty: true }` daje „Zarząd jest na parterze”; `{ pietro: 2, cutOn: true, zarzadUkryty: false }` daje `null` (Review Focus 5 i 6).
  - `nastepnePietro`: krok w górę na najwyższym zostaje, krok w dół na 0 zostaje.
  - `index.html` ma `id="btnFloor"` i angielski napis kafelka; `tests/unit/jezyk-ui.test.ts` przechodzi z nowym wpisem `STATYCZNE` (`...stat('btnFloor', tx('piętro', 'floor'), tx('Piętro', 'Floor'))`).

- [ ] **Step 2: Run** `npx vitest run tests/unit/pietra-przelacznik.test.ts tests/unit/jezyk-ui.test.ts` - Expected: FAIL.

- [ ] **Step 3: Zaimplementuj** `src/ui/pietra.ts`, kafelek i CSS (pulpit i telefon: `@media (max-width: 640px)`; warunek: przy 390 × 844 kafelek i lista osiągalne jednym dotknięciem, wysokość `.top` nie rośnie o więcej niż jeden wiersz), wpis `STATYCZNE`, podpięcie w `main.ts` według zachowania wyżej. Lista przerysowuje się w `poZmianieJezyka`. Lista pięter to `listaPieter(world)`, a kafelek jest ukryty z flagą wyłączoną.

- [ ] **Step 4: Run** `npx vitest run tests/unit/pietra-przelacznik.test.ts tests/unit/jezyk-ui.test.ts tests/unit/interfejs.test.ts && npx biome check src tests tools server index.html` - Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "Piętra, etap 1: kafelek Piętro, lista, podpowiedzi, klawisze i blokada klików"`

---

### Task 9: Zrzuty, wydajność, boty i dziennik

**Files:**
- Modify: `tools/shots.ts` (lista `SHOTS`, wpisy `pietra-*`), `docs/POSTEP.md` (wpis tuż przed „Następne”), `CLAUDE.md` (jedna linia o fladze `?pietra=1` w „Komendy” albo w opisie dem)

**Interfaces:**
- Consumes: `window.zm` (haki gry w przeglądarce; dopisz do niego `pietro(L)` i `pietra()` w `src/main.ts`, jeśli ich brakuje, żeby scenariusze mogły wybrać piętro bez klikania w listę).

- [ ] **Step 1: Dodaj scenariusze** `pietra-przymorze-p2` (`demo=przymorze&pietra=1&speed=0&cam=hq,0.75`, wybór piętra 2), `pietra-lanciego-p1`, `pietra-wysoki-blok-p11` (kamera na najwyższym bloku Przymorza, piętro 11: tylko najwyższe budynki z przekrojem, reszta z dachem), `pietra-zielonki-dom-p1` (dom z awansem, piętro 1, cały pod stropem ze ścianami), `pietra-lista-pulpit` i `pietra-lista-telefon` (390 × 844, otwarta lista), `pietra-zarzad-parter` (podpowiedź „Zarząd jest na parterze” po wyborze piętra 1 przy siedzibie), `pietra-daleko` (piętro 2 przy zoomie poniżej progu: dachy i podpowiedź „Przybliż…”), `pietra-kod` (to samo co `pietra-przymorze-p2` z `grafika=kod`: strop bez naklejek), `pietra-panel-budowy` (otwarty panel budowy i lista pięter jednocześnie).

- [ ] **Step 2: Uruchom i obejrzyj zrzuty**

Run: `npm run shots -- pietra`
Expected: wszystkie scenariusze bez błędów konsoli; obejrzyj każdy zrzut (narzędzie `Read` na PNG w `shots/`) i sprawdź: klatka widoczna, strop beżowy i inny niż dach, ściany działowe i zamknięte drzwi narysowane, okno zamiast drzwi klatki, niższe budynki z dachem, kafelek i lista czytelne na pulpicie i na telefonie. Jeśli strop myli się z linoleum albo panelami przy otwartych mieszkaniach (nie ma ich na piętrach w etapie 1), tylko to odnotuj.

- [ ] **Step 3: Zmierz koszt pierwszego wyboru piętra**

Zmierz `performance.now()` wokół pierwszego `sectionPietra(world)` na Przymorzu w przeglądarce (Playwright, hak w `window.zm`). Jeśli skok przekracza 250 ms, rozbij składanie na partie po 8 budynków na klatkę (`requestAnimationFrame`) i pokaż „…” w kafelku do końca; opisz decyzję w dzienniku. Uruchom `npm run perf -- 150 1 --demo=przymorze` i `npm run perf -- 150 1 --demo=lanciego` (z flagą wyłączoną; wynik bez regresji względem wyjściowego).

- [ ] **Step 4: Pełna bramka**

Run: `npx biome check src tests tools server index.html && npm test && npm run build && npm run atlasy -- --sprawdz && npm run bot && npm run bot:zombie && npm run bot:surowce`
Expected: testy zielone, skróty botów jak wyjściowe z Zadania 0, atlas aktualny. Pełne `npm run shots -- --dalej` bez nowych błędów (istniejące niestabilne scenariusze: `dotyk`, `worker-zgodnosc`, opisane w „Zaparkowanych”).

- [ ] **Step 5: Dziennik i commit**

Wpis w `docs/POSTEP.md` z liczbami (testy, skróty botów, koszt wyboru piętra, zrzuty) i listą decyzji do przejrzenia przez Mateusza; linia o fladze w `CLAUDE.md`.

```bash
git add -A && git commit -m "Piętra, etap 1: zrzuty, wydajność i dziennik"
```

Nic nie wypychaj. Raport do sesji nocnego integratora (`local_a3da1e21-296a-4878-b0cc-48ad2da67976`): gałąź i commit w pierwszym zdaniu, potem liczby i to, co odbiega od projektu.

---

## Self-Review (spec coverage)

- Zakres i flaga: Zadania 1, 2. Wysokości i awans domów: Zadanie 1. Lista pięter: Zadania 1 i 8.
- Przełącznik wariant B, klawisze, reset przy „⌂” i „Postaw”, podpowiedzi, telefon: Zadanie 8.
- Klatka, ściany działowe i zamknięte drzwi na stropie, okno zamiast drzwi klatki, dom i reszta budynków: Zadania 3, 5, 6.
- Strop Ciepły tynk z kodu i naklejek, atlas, `?grafika=kod`: Zadanie 4 (zrzut `pietra-kod`: Zadanie 9).
- Piętra tylko z bliska: Zadanie 7 (`widokPietra`), Zadanie 8 (`podpowiedz`).
- Widoczność i klikanie pod stropem: Zadania 7 i 8. Zapis i `worldKey`: Zadanie 2.
- Poza zakresem etapu 1 (celowo bez zadań): krawędź stropu (`uzycie.krawedz`, zabezpieczenie na etap 2, nie ma otwartych mieszkań na piętrach), przycięcie fasady i cienia do L, piwnica, schody i ruch po piętrach, schody domu.
- Typy zgodne między zadaniami: `awansujDomy`, `listaPieter`, `pietraWlaczone`, `sectionPietra`, `SectionScene.pietro`, `InteriorTile` `strop` i `closed`, `stropKolor`, `ChunkScene.pietra` i `pietro`, `chunkiPietra`, `widokPietra`, `GameView.ustawPietro`, `SelektorPieter`.
