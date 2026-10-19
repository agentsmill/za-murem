# Miasto z kwadratów, etap 2: chodzenie po wielu kwadratach — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Symulacja liczy świat z wielu kwadratów 384 m: ludzie przechodzą przez granice, pracują w innym kwadracie i noszą łup do domu, a kwadraty bez powodu śpią; gra z samym domem liczy się bit w bit jak dziś.

**Architecture:** Globalny numer kafelka g = k·147 456 + i (dom k = 0, więc dzisiejsze numery znaczą to samo), budynki i drzewa analogicznie z mnożnikiem 65 536. Pionki i rzeczy mają współrzędne globalne. Tablice na kafelek (przejście, obszary, maski) żyją w środowisku kwadratu; A* zostaje lokalny, a drogę przez granice składa trasa po kwadratach przez przejścia na granicach. Najpierw przepisanie bez zmiany zachowania (wyrocznią są skróty botów), potem wiele kwadratów na syntetycznych światach.

**Tech Stack:** TypeScript 7 (Node od 22.18 wprost z `.ts`), Vitest, boty w `tools/`, Biome.

**Spec:** `docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md` (etap 2, sekcje „Stan gry: globalne numery”, „Aktywne i uśpione kwadraty”, „Ruch przez granice i drogi”).

**Kolejność (decyzja nocnego integratora, 19.10.2026):** teraz tylko zadanie 1 (`src/sim/kafelki.ts`), na osobnej małej gałęzi od `noc-integracja` fe13220, żeby weszło do `pelna-gra` od razu. Zadania 2–10 dopiero po scaleniu badań i pracy ludzi, bo przepisują `src/sim/sim.ts`; koordynator powie kiedy.

## Global Constraints

- Gałąź od `noc-integracja` fe13220 (zadanie 1), potem od `pelna-gra` wskazanej przez koordynatora, w osobnym drzewie roboczym. Lokalne commity swobodnie; nic na GitHub ani na serwer bez OK Mateusza (scala koordynator). Etap 1 (kwadraty na mapie) idzie równolegle w innej sesji: tego etapu nie ruszają pliki `src/world/world.ts`, `src/world/raster.ts`, `src/world/mvt.ts` ani `src/render/*`.
- Wyrocznia: `npm run bot`, `npm run bot -- --mieszkancy`, `npm run bot -- --sasiedzi`, `npm run bot:zombie`, `npm run bot:zombie -- --mieszkancy` i `npm test` dają po każdym zadaniu 1–4 te same skróty i wyniki co na starcie gałęzi. Skrót, który się zmienił, to błąd przepisania, nie „nowy wzorzec”. Gdy w trakcie etapu wciągasz nowszą `pelna-gra` (inne sesje też zmieniają `src/sim`, na przykład praca ludzi), najpierw policz wyrocznię na tej `pelna-gra`, potem wciągnij ją, przepisz nowy kod na numery globalne i sprawdź, że skróty zgadzają się z nią.
- Zaraz po zadaniu 1 daj znać koordynatorowi (wpis w `docs/POSTEP.md` i wiadomość do sesji koordynatora, jeśli jest), że `src/sim/kafelki.ts` z testem może wejść do `pelna-gra` od razu, żeby nowy kod innych sesji w `src/sim` liczył numery przez `gid`, `gxy` i `sasiadKafelka`, a nie przez `size`.
- Stałe: `N_KW = 147456` (384·384), `BOK = 384`, `B_KW = 65536` (mnożnik numerów budynków i drzew). Dom ma k = 0 i kwadrat (0, 0). Kwadrat (sx, sy) zajmuje globalne kafelki od sx·384 do sx·384 + 383 (tak samo y).
- `sim.hash()` to skrót z `JSON.stringify(st)`, więc nowe pola `SimState` są nieobecne, dopóki nie są potrzebne (gdy jest więcej kwadratów niż dom). Konstruktor `Sim` ich nie dopisuje: żadnego `??=` dla nowych pól, kod czyta je jako opcjonalne (`st.kwadraty ?? []`, `st.kwSen?.[k]`).
- W `src/` bez `Math.random`; w nowym kodzie decyzji bez `Math.hypot`, `sin`, `cos` (odległość przez `Math.sqrt`). Kolejność, w której decyzje losują, zostaje według numerów pionków i rzeczy.
- Tablice na kafelek dalej mają rozmiar 384·384 na kwadrat; A* (`PathFinder`) jest jeden i liczy w obrębie jednego kwadratu naraz.
- Ten sam zapis musi dać ten sam przebieg na każdym urządzeniu: reguła aktywności kwadratów i jej limit nie zależą od urządzenia.
- `verbatimModuleSyntax`, `erasableSyntaxOnly`, komentarze po polsku, nagłówki modułów poprawione przy zmianie kontraktu. Lint: `npx biome check src tests tools server index.html`.

## Review Focus

- Stary zapis bez pola kwadratów wczytuje się i liczy dokładnie jak dziś (także zapis w połowie wyprawy i z otwartym sąsiednim budynkiem). Test w zadaniu 5.
- Zapis i wczytanie, gdy pionek stoi dokładnie na kafelku granicy albo jest w połowie odcinka drogi między kwadratami. Test w zadaniu 6.
- Polecenia z interfejsu z numerami kafelków domu (dzisiejsze) i z numerami w innym kwadracie: `commandFor` w `src/sim/orders.ts` musi zamieniać kliknięte miejsce na numer globalny. Test w zadaniu 7.
- Tryb zombie z innym kwadratem w świecie: stado i dosypywanie wokół siatki domu (`band`, `ring`) liczą się jak dziś i nie wychodzą poza aktywne kwadraty. Test w zadaniu 9.
- Zmiana w jednym kwadracie (ścięte drzewo, otwarte drzwi) przebudowuje przejście tylko w nim i w sąsiadach przy granicy, a nie we wszystkich. Test w zadaniu 4.

---

### Task 1: Przeliczenia numerów globalnych

**Files:**
- Create: `src/sim/kafelki.ts`
- Test: `tests/unit/kafelki.test.ts`

**Interfaces:**
- Produces:
  - `N_KW`, `BOK`, `B_KW` (stałe jak wyżej)
  - `interface MapaKwadratow { lista: { sx: number; sy: number }[]; poKluczu: Map<string, number> }` (indeks na liście to k; `lista[0]` to `{ sx: 0, sy: 0 }`)
  - `mapaDomu(): MapaKwadratow`, `mapaZListy(dodane: { sx: number; sy: number }[]): MapaKwadratow`
  - `kwNumeru(g: number): number`, `lokalnyNumer(g: number): number`, `numerGlobalny(k: number, i: number): number`
  - `gxy(m: MapaKwadratow, g: number): [number, number]` i `gid(m: MapaKwadratow, gx: number, gy: number): number` (−1 poza odkrytymi)
  - `sasiadKafelka(m: MapaKwadratow, g: number, dx: number, dy: number): number` (−1 poza odkrytymi)
  - `bGlob(k: number, b: number): number`, `bKw(b: number): number`, `bLok(b: number): number` (te same dla drzew)

- [ ] **Step 1: Zapisz wyrocznię**

Run: `npm run bot | tail -3; npm run bot -- --mieszkancy | tail -3; npm run bot -- --sasiedzi | tail -4; npm run bot:zombie | tail -5; npm run bot:zombie -- --mieszkancy | tail -5`
Expected: skróty stanu; wpisz je do wpisu tej gałęzi w `docs/POSTEP.md` jako „wyrocznia etapu 2”.

- [ ] **Step 2: Write the failing tests**

```ts
it('dla samego domu numer globalny to dzisiejszy numer', () => {
  const m = mapaDomu();
  for (const [x, y] of [[0, 0], [383, 0], [17, 200], [383, 383]]) {
    expect(gid(m, x, y)).toBe(y * 384 + x);
    expect(gxy(m, y * 384 + x)).toEqual([x, y]);
  }
  expect(gid(m, 384, 0)).toBe(-1);
  expect(gid(m, -1, 5)).toBe(-1);
});
it('sąsiad przez granicę i ujemne współrzędne', () => {
  const m = mapaZListy([{ sx: 1, sy: 0 }, { sx: -1, sy: 0 }]);
  const brzeg = gid(m, 383, 10);
  expect(gxy(m, sasiadKafelka(m, brzeg, 1, 0))).toEqual([384, 10]);
  expect(kwNumeru(sasiadKafelka(m, brzeg, 1, 0))).toBe(1);
  expect(gxy(m, gid(m, -1, 10))).toEqual([-1, 10]);
  expect(kwNumeru(gid(m, -1, 10))).toBe(2);
  expect(sasiadKafelka(m, gid(m, 0, 0), 0, -1)).toBe(-1);
});
it('numery budynków i drzew', () => {
  expect(bGlob(0, 41)).toBe(41);
  expect(bKw(bGlob(3, 41))).toBe(3);
  expect(bLok(bGlob(3, 41))).toBe(41);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/kafelki.test.ts`
Expected: FAIL (brak modułu).

- [ ] **Step 4: Implement `src/sim/kafelki.ts`**

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/kafelki.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sim/kafelki.ts tests/unit/kafelki.test.ts docs/POSTEP.md
git commit -m "Miasto z kwadratów etap 2: numery globalne kafelków, budynków i drzew"
```

### Task 2: Syntetyczne kwadraty do testów

**Files:**
- Create: `tests/unit/swiaty-syntetyczne.ts`
- Test: `tests/unit/swiaty-syntetyczne.test.ts`

**Interfaces:**
- Produces:
  - `swiatSyntetyczny(sx: number, sy: number, seed?: number): World` — kwadrat 384×384 bez siedziby (`hq = -1`, pusta siatka i wnętrze, jak `buildKwadrat` z etapu 1): trawa, siatka ulic co 96 m (jezdnia 6 m z chodnikami), kilka bloków z drzwiami na ulicę, kilkanaście drzew i dwa wraki; deterministyczny
  - `domTestowy(): { w: World; geo: Geo }` — dom z kafelków testowych Zielonek przez `buildWorld` (najmniejszy z trzech adresów)

- [ ] **Step 1: Write the failing test**

```ts
it('syntetyczny kwadrat jest deterministyczny, ma drzewa, budynki z drzwiami i przejście na każdej krawędzi', () => {
  const a = swiatSyntetyczny(1, 0, 5);
  const b = swiatSyntetyczny(1, 0, 5);
  expect(a.terr).toEqual(b.terr);
  expect(a.trees.length).toBeGreaterThan(10);
  expect(a.buildings.every((x) => x.entrances.length > 0)).toBe(true);
  for (const krawedz of ['N', 'E', 'S', 'W']) expect(przechodnieNaKrawedzi(a, krawedz)).toBeGreaterThan(100);
});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/swiaty-syntetyczne.test.ts` (FAIL), napisz generator, uruchom ponownie (PASS).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/swiaty-syntetyczne.ts tests/unit/swiaty-syntetyczne.test.ts
git commit -m "Miasto z kwadratów etap 2: syntetyczne kwadraty do testów"
```

### Task 3: Numery globalne w symulacji bez zmiany zachowania

To największe zadanie. Robi się je kawałkami, a po każdym kawałku wyrocznia z zadania 1 musi się zgadzać. Kawałek, po którym skrót się zmienia, cofa się i dzieli na mniejsze.

**Files:**
- Modify: `src/sim/sim.ts` (wszystkie przeliczenia `i % size`, `(i / size) | 0`, `(i - x) / size`, `y * size + x`, `tileOf`, granice `x < size` i podobne), `src/sim/path.ts` (bez zmian w algorytmach, tylko podpisy przyjmujące lokalne tablice), `src/sim/zombie.ts`, `src/sim/sasiedzi.ts`, `src/sim/orders.ts`, `src/sim/gov.ts`, `src/sim/snapshot.ts`, `src/sim/house.ts`, `src/sim/perimeter.ts`, `src/sim/surowce.ts`, przeliczenia numerów w `src/world/plot.ts` i `src/world/fence.ts`
- Test: wyrocznia + `npm test`

**Interfaces:**
- Consumes: `src/sim/kafelki.ts` (zadanie 1).
- Produces: `Sim.mapa: MapaKwadratow` (na razie zawsze `mapaDomu()`); `Sim.tileOf(p)` zwraca `gid(this.mapa, Math.floor(p.x), Math.floor(p.y))`; każde przeliczenie współrzędnych na numer i z powrotem idzie przez `gid`/`gxy`, a każdy krok do sąsiedniego kafelka przez `sasiadKafelka` albo przez jawne sprawdzenie, że numer jest w tym samym kwadracie.

- [ ] **Step 1: Pomocnicze funkcje modułu i `composeLayers` (sim.ts linie około 1–1864)**

Przepisz przeliczenia w funkcjach modułu (`createSim`, mieszkańcy, `composeLayers`, `exitOf`) na `gid`/`gxy`.
Run: wyrocznia z zadania 1 i `npm test -- sim zarzad`
Expected: te same skróty; commit `Etap 2: numery globalne w pomocniczych funkcjach symulacji`.

- [ ] **Step 2: Rdzeń (`constructor`, `rebuild`, drogi, `step`, około 1946–2503)**

Jak krok 1; commit po zgodnej wyroczni.

- [ ] **Step 3: Polecenia i prace (około 2504–3651)**

Jak krok 1; commit po zgodnej wyroczni.

- [ ] **Step 4: Potrzeby, ciepło, budowa, wyprawy, mieszkania, surowce (około 3652–5084 i 7370–7519)**

Jak krok 1; commit po zgodnej wyroczni.

- [ ] **Step 5: Handlarz, wędrowcy, ekipy, walka, szwendacze, rzemiosło, napady (około 5085–7369)**

Jak krok 1; commit po zgodnej wyroczni.

- [ ] **Step 6: Sąsiedzi z fali 2 (około 7520–8769) i pozostałe moduły z listy plików**

Jak krok 1; commit po zgodnej wyroczni.

- [ ] **Step 7: Kontrola, że nic nie zostało**

Run: `grep -nE "% size|/ size|\* size|\bsize \*" src/sim/*.ts src/world/plot.ts src/world/fence.ts`
Expected: zostają tylko rozmiary tablic kwadratu (`size * size` przy alokacji) i pętle po kafelkach jednego kwadratu z komentarzem, że są lokalne. Wyrocznia zgodna, commit.

### Task 4: Środowisko kwadratu i przebudowa przejścia po kwadracie

**Files:**
- Create: `src/sim/kwadratySim.ts`
- Modify: `src/sim/sim.ts` (pola na kafelek przechodzą do środowiska kwadratu)
- Test: `tests/unit/kwadraty-sim.test.ts`

**Interfaces:**
- Produces:
  - `type Warstwa = 'core' | 'resident' | 'szabrownik' | 'zombie' | 'outside'` (warstwy przejścia jak w dzisiejszym `layerOf`: `core` to `coreBlocked` z `reg`, reszta z `lay`; `crowd` i `sasiad` dalej korzystają z cudzych warstw)
  - `interface KwadratRt { k: number; w: World; blocked: Uint8Array; coreBlocked: Uint8Array; reg: Int32Array; lay: Record<Exclude<Warstwa, 'core'>, { blocked: Uint8Array; reg: Int32Array }> }` (pola domowe: maski siatki, podwórka, pokoi i `flow` zostają przy domu)
  - `Sim.rt(k: number): KwadratRt` i `Sim.rebuild(k?: number)` (bez argumentu jak dziś dla domu; z numerem tylko ten kwadrat)
  - przy zmianie leżącej do 1 kafelka od granicy kwadratu przebudowa obejmuje też sąsiada po tej stronie

- [ ] **Step 1: Write the failing test**

```ts
it('ścięte drzewo w kwadracie (1,0) przebudowuje tylko ten kwadrat', () => {
  // świat: domTestowy + swiatSyntetyczny(1,0) przez dostawcę (zadanie 5); licznik przebudów na kwadrat w Sim.stats
  // ścinamy drzewo z dala od granicy: przebudowa k = 1, dom bez przebudowy
});
```

(Test zostaje oznaczony `it.todo`, dopóki zadanie 5 nie da dostawcy światów; w tym zadaniu wyrocznia z zadania 1.)

- [ ] **Step 2: Implement and verify the oracle**

Przenieś `blocked`, `coreBlocked`, `reg`, `lay` do `KwadratRt` domu, dostęp przez `this.rt(kwNumeru(g))` i lokalny numer.
Run: wyrocznia z zadania 1 i `npm test`
Expected: te same skróty.

- [ ] **Step 3: Commit**

```bash
git add src/sim/kwadratySim.ts src/sim/sim.ts tests/unit/kwadraty-sim.test.ts
git commit -m "Miasto z kwadratów etap 2: środowisko kwadratu w symulacji"
```

### Task 5: Kwadraty w stanie gry i dostawca światów

**Files:**
- Modify: `src/sim/sim.ts` (`SimState.kwadraty`, polecenie `kwadrat`, trzeci argument konstruktora)
- Test: `tests/unit/kwadraty-sim.test.ts`

**Interfaces:**
- Produces:
  - `SimState.kwadraty?: { sx: number; sy: number }[]` (dodane kwadraty bez domu, w kolejności; brak = sam dom)
  - polecenie `{ t: 'kwadrat'; ids: []; sx: number; sy: number }`: dopisuje kwadrat od następnego kroku, drugi raz ten sam nic nie robi
  - `new Sim(w: World, st: SimState, opts?: { swiatKwadratu?: (k: number, sx: number, sy: number) => World })` (dostawca synchroniczny; bez niego istnieje tylko dom, a polecenie `kwadrat` czeka w stanie, aż dostawca będzie)

- [ ] **Step 1: Write the failing tests**

```ts
it('gra bez kwadratów ma stan bez pola kwadraty i ten sam skrót', () => {
  // createSim jak w sim.test.ts, 2 doby: 'kwadraty' in st === false, skrót jak przed zmianą (stała z zadania 1)
});
it('polecenie kwadrat dodaje kwadrat od następnego kroku i przeżywa zapis', () => {
  // push({t:'kwadrat', ids:[], sx:1, sy:0}); przed step() brak; po step() st.kwadraty = [{sx:1,sy:0}];
  // JSON.parse(JSON.stringify(st)) + new Sim(w, st2, {swiatKwadratu}) liczy dalej ten sam skrót co bez zapisu
});
it('stary zapis bez pola kwadraty wczytuje się i liczy jak dziś', () => {
  // zapis z pelna-gra (stan po 3 dobach z otwartym sąsiednim budynkiem, zapisany jako plik w tests/fixtures) daje ten sam skrót
});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/kwadraty-sim.test.ts` (FAIL), implementacja, (PASS), wyrocznia z zadania 1.

- [ ] **Step 3: Commit**

```bash
git add src/sim/sim.ts tests/unit/kwadraty-sim.test.ts tests/fixtures
git commit -m "Miasto z kwadratów etap 2: kwadraty w stanie i dostawca światów"
```

### Task 6: Przejście przez granicę, drogi i obszary przez granice

**Files:**
- Modify: `src/sim/kwadratySim.ts` (przejścia na granicach, sklejanie obszarów), `src/sim/sim.ts` (`goalFor`, `routeTo`, `go`, ruch pionka)
- Test: `tests/unit/kwadraty-drogi.test.ts`

**Interfaces:**
- Produces:
  - `przejscia(sim, kA: number, kB: number, warstwa: Warstwa): number[][]` (odcinki granicy przechodnie po obu stronach, jako pary globalnych numerów kafelków)
  - `skladowa(sim, g: number, warstwa: Warstwa): number` (numer obszaru sklejonego przez granice, znajdź-sumuj po parach (k, etykieta))
  - `goalFor` i `routeTo` dla celu w innym kwadracie: trasa po kwadratach (BFS po odkrytych kwadratach z co najmniej jednym przejściem), A* w bieżącym kwadracie do kafelka przejścia najbliższego prostej do celu, dalej odcinek po odcinku; `p.path` to numery globalne całej znanej części drogi, kolejny odcinek liczy się po dojściu do granicy

- [ ] **Step 1: Write the failing tests**

```ts
it('zarząd idzie z domu do kafelka w kwadracie (1,0)', () => {
  // dom + syntetyczny (1,0); polecenie move do gid(m, 384 + 50, 100); po N krokach pionek stoi na tym kafelku
});
it('droga po przekątnej przez dwa kwadraty', () => {
  // kwadraty (1,0), (1,1); cel w (1,1); pionek dochodzi
});
it('cel w odciętym miejscu innego kwadratu zamienia się na najbliższy osiągalny', () => {});
it('szwendacz goni przez granicę', () => {
  // tryb zombie, szwendacz w (1,0) 5 m od granicy, ofiara w domu 5 m od granicy: szwendacz przechodzi granicę
});
it('zapis i wczytanie z pionkiem na kafelku granicy i w połowie drogi daje ten sam skrót', () => {});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/kwadraty-drogi.test.ts` (FAIL), implementacja, (PASS), wyrocznia z zadania 1.

- [ ] **Step 3: Commit**

```bash
git add src/sim tests/unit/kwadraty-drogi.test.ts
git commit -m "Miasto z kwadratów etap 2: drogi i obszary przez granice"
```

### Task 7: Praca w innym kwadracie

**Files:**
- Modify: `src/sim/sim.ts`, `src/sim/orders.ts` (`commandFor` z kliknięcia na numer globalny), `src/sim/sasiedzi.ts`, `src/sim/surowce.ts`
- Test: `tests/unit/kwadraty-praca.test.ts`

**Interfaces:**
- Consumes: numery drzew i budynków przez `bGlob`/`bKw`/`bLok` (zadanie 1); `felled` i `chop.tree` trzymają globalne numery drzew.
- Produces: ścinanie, noszenie łupu, przeszukanie wraku i otwarcie drzwi sąsiedniego budynku działają w każdym aktywnym kwadracie.

- [ ] **Step 1: Write the failing tests**

```ts
it('ścięte drzewo w kwadracie (1,0) i drewno doniesione na podwórko domu', () => {});
it('przeszukanie wraku w kwadracie (1,0) i łup na podwórku', () => {});
it('otwarcie drzwi budynku w kwadracie (1,0) i przeszukanie pomieszczenia (fala 2)', () => {});
it('commandFor na kafelku kwadratu (1,0) daje polecenie z numerem globalnym', () => {});
it('zapis w połowie noszenia drewna przez granicę daje ten sam skrót', () => {});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/kwadraty-praca.test.ts` (FAIL), implementacja, (PASS), wyrocznia.

- [ ] **Step 3: Commit**

```bash
git add src/sim tests/unit/kwadraty-praca.test.ts
git commit -m "Miasto z kwadratów etap 2: praca i łup w innym kwadracie"
```

### Task 8: Aktywne i uśpione kwadraty

**Files:**
- Modify: `src/sim/kwadratySim.ts`, `src/sim/sim.ts` (`step` pomija pionki w uśpionych kwadratach)
- Test: `tests/unit/kwadraty-sen.test.ts`

**Interfaces:**
- Produces:
  - `aktywneKwadraty(sim): number[]` (rosnąco; reguła ze specyfikacji: dom; kwadraty, w których stoi albo przez które idzie ktoś z naszych, w tym przejęty lokator; kwadraty z naszym terenem; sąsiad kwadratu, w którym ktoś z naszych stoi bliżej niż 40 m od wspólnej granicy; najwyżej `MAX_AKTYWNYCH = 12` według kolejności: dom, teren, kwadraty z naszymi według numeru osoby, sąsiedzi)
  - `SimState.kwSen?: Record<number, number>` (krok, od którego kwadrat nie ma powodu do aktywności; usypia po `SEN_PO = 2 * TICKS_PER_HOUR`; pole tylko przy istniejących kwadratach)
  - `Sim.potrzebneKwadraty(): number[]` (kwadraty, których światy muszą być gotowe przed następnym krokiem; gra używa tego do budowania z wyprzedzeniem)

- [ ] **Step 1: Write the failing tests**

```ts
it('szwendacz w uśpionym kwadracie stoi, a po przebudzeniu rusza z tym samym stanem', () => {});
it('kwadrat zasypia po dwóch godzinach gry bez powodu i budzi się, gdy ktoś z naszych do niego idzie', () => {});
it('ten sam przebieg dwa razy daje ten sam skrót, także z zapisem w czasie snu kwadratu', () => {});
it('limit aktywnych nie zależy od niczego poza stanem', () => {});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/kwadraty-sen.test.ts` (FAIL), implementacja, (PASS), wyrocznia.

- [ ] **Step 3: Commit**

```bash
git add src/sim tests/unit/kwadraty-sen.test.ts
git commit -m "Miasto z kwadratów etap 2: aktywne i uśpione kwadraty"
```

### Task 9: Tryb zombie, obcy i gra z wieloma kwadratami

**Files:**
- Modify: `src/sim/sim.ts`, `src/sim/zombie.ts` (pola `band`, `ring`, `edges`, `farFrom` widzą aktywne kwadraty)
- Modify: `src/main.ts` (dostawca światów: jeśli etap 1 jest już w `pelna-gra`, `buildKwadrat` z danych dema albo z kafelków; jeśli nie, podłączenie zostaje koordynatorowi i wpisie w dzienniku)
- Test: `tests/unit/kwadraty-zombie.test.ts`

**Interfaces:**
- Produces: stado i dosypywanie liczą się jak dziś wokół siatki domu, przeszukiwania `farFrom` dla obcych obejmują aktywne kwadraty; pętla gry nie robi kroku, dopóki `sim.potrzebneKwadraty()` ma kwadrat bez gotowego świata (świat budowany od razu w głównym wątku, budowanie w workerze to etap 5).

- [ ] **Step 1: Write the failing tests**

```ts
it('stado w trybie zombie z kwadratem (1,0) w świecie przychodzi i odchodzi jak w grze z samym domem', () => {
  // bot zombie 2 noce z domem i z dodanym, uśpionym kwadratem: liczba szwendaczy przy siatce i przerwania jak bez kwadratu
});
it('handlarz i wędrowcy pojawiają się na ulicach aktywnych kwadratów', () => {});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/kwadraty-zombie.test.ts` (FAIL), implementacja, (PASS), wyrocznia.

- [ ] **Step 3: Commit**

```bash
git add src/sim src/main.ts tests/unit/kwadraty-zombie.test.ts
git commit -m "Miasto z kwadratów etap 2: tryb zombie i obcy przy wielu kwadratach"
```

### Task 10: Bot, pomiar i bramka

**Files:**
- Modify: `tools/bot.ts` (flaga `--kwadraty`)
- Modify: `docs/POSTEP.md`, nagłówki zmienionych modułów, `CLAUDE.md` (zdanie o numerach globalnych w sekcji „Determinizm, zapis i testy”)

- [ ] **Step 1: Bot z kwadratami**

`npm run bot -- --kwadraty`: dom testowy i syntetyczne (1,0), (0,1); od dnia 2 jedna osoba z zarządu idzie do (1,0), ścina dwa drzewa, nosi drewno do domu, przeszukuje wrak; wypisuje skrót, ile kroków granicy, ile przebudów na kwadrat i średni czas kroku z 1, 2 i 3 aktywnymi kwadratami. Bez flagi wyjście i skróty bez zmian.

Run: `npm run bot -- --kwadraty` dwa razy
Expected: ten sam skrót w obu przebiegach; czas kroku zapisany w dzienniku.

- [ ] **Step 2: Pełna bramka**

Run: `npm test && npx biome check src tests tools server index.html && npm run build && npm run shots -- --dalej && npm run perf`
Expected: wszystko zielone, wyrocznia z zadania 1 zgodna, zrzuty bez zmian (etap nie zmienia wyglądu), klatki bez pogorszenia.

- [ ] **Step 3: Dziennik i commit**

```bash
git add tools/bot.ts docs/POSTEP.md CLAUDE.md src
git commit -m "Miasto z kwadratów etap 2: bot z kwadratami, pomiary i bramka"
```
