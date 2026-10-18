# Menu budowy: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamienić okno modalne „Budowa” na panel po prawej z zakładkami, miniaturami i mechanizmem blokad technologią, bez zmian zasad budowy.

**Architecture:** Dane budowli dostają `cat` i opcjonalne `tech`; symulacja zna `techDone?` i odrzuca zablokowane budowle w `canPlace`. Menu jako czyste funkcje (`buildMenu`, `buildPanelHtml`) w `src/ui/budowa.ts`, miniatury z `rzeczSprite` w `src/ui/miniatura.ts`, panel jako klasa DOM w `src/ui/panelbudowy.ts` podpięta w `src/main.ts` zamiast `modal.show(buildSheet…)`.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`: importy z `.ts`, `import type`, bez enumów), Vitest, Playwright (`tools/shots.ts`), Biome. Gałąź `menu-budowy` w `.claude/worktrees/menu-budowy`.

**Spec:** `docs/superpowers/specs/2026-10-18-menu-budowy-design.md`

## Global Constraints

- `sim.hash()` i skróty przypięte w testach (`druzyna-sim.test.ts`, `apts.test.ts`) oraz wyniki `npm run bot` i `npm run bot:zombie` nie mogą się zmienić: `techDone` jest opcjonalne i nieobecne w stanie, dopóki ktoś go nie ustawi (bez `??=` w konstruktorze `Sim`).
- Napisy po polsku i angielsku przez `tx()`, `L()`, `tr()`; EN w `src/ui/budowa.en.ts` i `src/sim/budowle.en.ts`. Liczby przez `src/ui/tekst.ts`.
- Symulacja bez zmian poza `techDone` i odrzuceniem zablokowanej budowli w `canPlace`; koszty, czasy i miejsca budowli bez zmian.
- Panel jest nie-modalny: mapa pod nim klikalna. Układ dolnej szuflady od `max-width: 640px`, zamykanie po „Postaw” od `touchUI` (`pointer: coarse`).
- Kłódki ukryte (`BUILD_MENU.showLocked = false`); widok z kłódkami włącza tylko flaga i parametr adresu `budowa=klodki` do zrzutów.
- Zmiany wizualne: zrzut w Playwright obejrzany przed „gotowe” (komputer, telefon, tablet). Nic nie idzie na zewnątrz (push, deploy) bez OK Mateusza; commity lokalne na `menu-budowy`.
- Biome na katalogach (`npx biome check src tests tools index.html`), nie `npm run lint`.

## Review Focus

1. Wybrana budowla znika z menu (flaga kłódek wyłączona po wyborze, pusta zakładka): wybór wraca do pierwszej budowli zakładki, a gdy menu jest zupełnie puste, panel pokazuje komunikat i nie rzuca.
2. Zmiana języka przy otwartym panelu: napisy się odświeżają i w EN nie ma polskich słów (istniejący test `polskieSlowa`).
3. Kolejność Esc: najpierw anuluje stawianie, dopiero drugi zamyka panel; klawisz B przełącza panel i nie zamyka stawiania.
4. Nowa gra albo wczytanie zapisu przy otwartym panelu: panel zamknięty, wybór i tryb stawiania wyzerowane.
5. Odświeżanie panelu bez zmian stanu nie dotyka DOM (zero mutacji w 60 klatkach) i nie liczy `allowedAnchors` na każdej klatce.

---

### Task 1: Dane i symulacja: `cat`, `tech`, `techDone`, `isUnlocked`

**Files:**
- Modify: `src/sim/budowle.ts` (typy, `BUILDS`, `canPlace`), `src/sim/sim.ts` (interfejs `SimState`)
- Test: `tests/unit/budowle-tech.test.ts` (nowy)

**Interfaces:**
- Produces: `type BuildCat = 'dom' | 'podworko' | 'obwod'`; `const BUILD_CATS: readonly BuildCat[]` (kolejność zakładek); `BuildDef.cat: BuildCat`; `BuildDef.tech?: string`; `SimState.techDone?: string[]`; `function isUnlocked(st: Pick<SimState, 'techDone'>, kind: BuildKind): boolean`.

- [ ] **Step 1: Write the failing test** w `tests/unit/budowle-tech.test.ts`: (a) `BUILDS` ma `cat`: warsztat, kuchnia_spoleczna, magazyn, lozka_pietrowe → `'dom'`, ogrodek → `'podworko'`, zasieki → `'obwod'`; (b) `isUnlocked` jest prawdą dla każdej budowli bez `tech`; (c) po `BUILDS.warsztat.tech = 't_test'` (przywrócone w `afterEach`) `isUnlocked({}, 'warsztat')` jest fałszem, a `isUnlocked({ techDone: ['t_test'] }, 'warsztat')` prawdą; (d) `canPlace` na `przymorze` z zablokowanym warsztatem na kafelku z `allowedAnchors` zwraca `{ ok: false }` z niepustym `why`, a po dodaniu `techDone` `ok: true`; (e) `'techDone' in createSim(world, seed, { core: 4 })` jest fałszem i `JSON.stringify` stanu nie zawiera `techDone` (świeży `Sim` po `new Sim(world, st)` też).
- [ ] **Step 2: Run** `npm test -- budowle-tech` → FAIL (brak `cat`, `isUnlocked`).
- [ ] **Step 3: Implement** typy i pola w `src/sim/budowle.ts` (`cat` przy każdej budowli według punktu (a)), `isUnlocked`, odrzucenie w `canPlace` na samym początku (`why`: `L('Wymaga badania.', 'Needs research.')`) i `techDone?: string[]` w `SimState` z komentarzem, że pole jest celowo nieobecne do pierwszego odblokowania (skróty stanu).
- [ ] **Step 4: Run** `npm test -- budowle-tech druzyna-sim apts budowa` → PASS (skróty przypięte bez zmian).
- [ ] **Step 5: Commit** `git add src/sim tests/unit/budowle-tech.test.ts && git commit -m "Budowle: kategoria, wymagane badanie i odblokowania w stanie"` (z linią `Co-Authored-By` z przypomnienia o atrybucji).

### Task 2: Menu jako dane: kategorie z `cat`, puste zakładki ukryte, blokady

**Files:**
- Modify: `src/ui/budowa.ts` (`buildMenu`, `BuildCategory`, `BuildItem`), `src/ui/budowa.en.ts` (tytuły kategorii, jeśli tam leżą)
- Test: `tests/unit/budowa-ui.test.ts`, `tests/unit/interfejs-a-en.test.ts`

**Interfaces:**
- Consumes: `BUILD_CATS`, `BuildDef.cat`, `isUnlocked` (Task 1).
- Produces: `BuildCategory.key: BuildCat`; tytuły `tx('Dom','Home')`, `tx('Podwórko','Yard')`, `tx('Obwód','Perimeter')`; `BuildItem.locked?: string` (tekst „Wymaga badania: …”); `export const BUILD_MENU: { showLocked: boolean }` (domyślnie `false`); `export const TECH_NAMES: Record<string, Tx>` (dziś pusty) i `techName(id: string): string`; `buildMenu(have, room, words?, en?, opts?: { st?: Pick<SimState,'techDone'>; showLocked?: boolean }): BuildCategory[]` (zakładki bez pozycji pomijane; zablokowane pomijane, chyba że `showLocked`, wtedy `ok: false`, `locked` i `why` równe `locked`).

- [ ] **Step 1: Write the failing tests**: w `budowa-ui.test.ts` zmienić oczekiwane tytuły na `['Dom', 'Podwórko', 'Obwód']` i dodać: zablokowany warsztat (przez `BUILDS.warsztat.tech`, przywracane) jest nieobecny w `buildMenu(…, { st: {} })`; z `showLocked: true` jest obecny z `ok: false`, `locked` zaczynającym się od `Wymaga badania:` i `why` równym `locked`; gdy wszystkie budowle zakładki są zablokowane, zakładka znika; w `interfejs-a-en.test.ts` tytuły `['Home', 'Yard', 'Perimeter']` i `locked` po angielsku (`Needs research:`).
- [ ] **Step 2: Run** `npm test -- budowa-ui interfejs-a-en` → FAIL.
- [ ] **Step 3: Implement** `CATEGORIES` z `BUILD_CATS` i `BUILDS[k].cat` (zamiast `places`), filtr zablokowanych i pustych zakładek, `TECH_NAMES`/`techName` (`tr(TECH_NAMES[id]) ?? id`), `BUILD_MENU`.
- [ ] **Step 4: Run** te same testy → PASS.
- [ ] **Step 5: Commit** „Menu budowy: zakładki z danych, blokady technologią i ukryte puste zakładki”.

### Task 3: Miniatury z tego samego sprite'a co mapa

**Files:**
- Create: `src/ui/miniatura.ts`
- Test: `tests/unit/miniatura.test.ts` (nowy)

**Interfaces:**
- Consumes: `rzeczSprite(spec: ThingSpec, g: Grafika | null): Sprite` z `src/render/art/pixellab.ts`; `Sprite` z `src/render/art/bryly.ts`.
- Produces: `function thumbPixels(sp: Sprite, box: number): { w: number; h: number; data: Uint8ClampedArray } | null` (czysta, bez DOM: przycina do prostokąta pikseli o alfa > 0, skaluje najbliższym sąsiadem tak, żeby dłuższy bok miał `box`, zachowuje proporcje, `null` dla pustego sprite'a); `function thumbUrl(kind: BuildKind, g: Grafika | null, box?: number): string` (domyślnie 56; `data:` URL z `<canvas>`, pamięć podręczna po rodzaju i `g`); `function clearThumbs(): void`.

- [ ] **Step 1: Write the failing test**: dla każdego `BUILD_KINDS` `thumbPixels(rzeczSprite({ kind, rot: 0, seed: 1 }, null), 56)` zwraca obraz, którego dłuższy bok to dokładnie 56, `data.length === w * h * 4`, ma piksel z alfa 255 i stosunek `w/h` zgodny z przyciętym sprite'em z dokładnością do 1 px; sprite z samych zer daje `null`; kolejność bajtów: piksel `rgba(0xff8040)` z `palette.ts` ląduje jako `[0xff, 0x80, 0x40, 0xff]`.
- [ ] **Step 2: Run** `npm test -- miniatura` → FAIL.
- [ ] **Step 3: Implement** `thumbPixels` (widok bajtowy `Uint32Array` jest w kolejności RGBA na platformach little-endian, jak w `view.ts:1100`), `thumbUrl` (`newCanvas`/`ctx2d` z `src/render/art/canvas.ts`, `putImageData`, `toDataURL`, `Map` po `kind` i referencji `g`), `clearThumbs`.
- [ ] **Step 4: Run** `npm test -- miniatura` → PASS.
- [ ] **Step 5: Commit** „Miniatury budowli z rzeczSprite”.

### Task 4: Znaczniki panelu i klasa `BuildPanel`

**Files:**
- Modify: `src/ui/budowa.ts` (usunąć `buildSheet`, dodać `buildPanelHtml`), `src/style.css` (usunąć `.bcat*`, `.build*`, dodać style panelu), `index.html` (`aside#buildPanel`)
- Create: `src/ui/panelbudowy.ts`
- Test: `tests/unit/budowa-ui.test.ts`, `tests/unit/interfejs-a-en.test.ts`, `tests/unit/teksty-miejsca-en.test.ts` (przepiąć z `buildSheet(...).body` na `buildPanelHtml`)

**Interfaces:**
- Consumes: `BuildCategory[]` (Task 2), `thumbUrl` (Task 3).
- Produces:
  - `type PanelView = { tab: BuildCat | null; kind: BuildKind | null }`.
  - `function buildPanelHtml(menu: BuildCategory[], view: PanelView, touch: boolean, words?: Words, en?: WordsEn, thumb?: (kind: BuildKind) => string): { kicker: string; title: string; html: string; view: PanelView }` — `html` zawiera `role="tablist"` z `<button role="tab" data-tab>`, na aktywnej zakładce siatkę `<button class="tile" data-kind>` z `<img>` miniatury, nazwą i napisem rozmiaru, oraz po jednym bloku szczegółów `<section class="bd" data-kind>` dla każdej pozycji (widoczny tylko wybrany; wybór niedostępny albo nieistniejący wraca do pierwszej pozycji aktywnej zakładki, a przy pustym menu `html` ma komunikat „Na razie nic nie można zbudować.” / „Nothing can be built yet.”). Szczegóły: nazwa, rozmiar, działanie, koszt, czas, miejsce, przycisk `data-act="build" data-arg="<kind>"` tylko dla `ok`, w przeciwnym razie `<p class="build-why">`. Teksty prowadzące (`Lewy klik stawia plan, R obraca, prawy klik albo Esc anuluje.` / `Stuknięcie stawia plan…`) jak dotychczas w `lead`.
  - `class BuildPanel { constructor(el: HTMLElement, hooks: { menu(): BuildCategory[]; stateKey(): string; thumb(kind: BuildKind): string; touch: boolean; onPlace(kind: BuildKind): void; onClose(): void }); get open(): boolean; show(): void; hide(): void; toggle(): void; refresh(force?: boolean): void; relocalize(): void }` — deleguje kliknięcia (`data-tab`, `data-kind`, `data-act="build"`, `data-act="build-close"`), strzałki między zakładkami (`role="tablist"`) i kafelkami, ustawia `hidden` i klasę `build-open` na `#app` (stąd CSS przesuwa `.mapctl` i `.placebar`), pamięta `PanelView` do końca sesji; `refresh()` przebudowuje DOM tylko, gdy zmieni się `stateKey()` albo `force`.
  - CSS: `aside#buildPanel` ok. 310 px od `--top-h` do nad atrybucją, `.app.build-open .mapctl { right: calc(var(--build-w, 310px) + 8px) }`, `.app.build-open .placebar { left: calc((100% - var(--build-w, 310px)) / 2) }`, do 640 px szuflada od dołu do ok. połowy wysokości; animacja wysuwania wyłączona przy `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing tests**: (a) `buildPanelHtml` dla `buildMenu({ deski: 999, zlom: 999, czesci: 999 }, () => true)` zawiera trzy `data-tab` (`dom`, `podworko`, `obwod`) i dla aktywnej zakładki wszystkie jej kafelki; (b) przy zapasie dokładnie na warsztat zawiera `data-act="build" data-arg="warsztat"`, nie zawiera `data-arg="magazyn"` i zawiera `Brakuje: ${missing('magazyn', have)}.` (jak dotąd, w blokach szczegółów); (c) `lead` z klawiszami dla `touch = false`, ze stuknięciem dla `true`; (d) wybór nieobecnej budowli wraca do pierwszej pozycji aktywnej zakładki, a pusty `menu` daje komunikat bez wyjątku; (e) w `en` żaden tekst panelu nie przechodzi `polskieSlowa` (jak w `interfejs-a-en.test.ts`), a w słowach domu (`teksty-miejsca-en.test.ts`) zdanie „Sleeps two, so there is room for more people in the house.” jest w szczegółach łóżek.
- [ ] **Step 2: Run** `npm test -- budowa-ui interfejs-a-en teksty-miejsca-en` → FAIL.
- [ ] **Step 3: Implement** `buildPanelHtml`, usunąć `buildSheet`, dodać `aside#buildPanel` w `index.html` obok `#card` (z `hidden`, `role="complementary"`, `aria-label`), napisać `BuildPanel` i style.
- [ ] **Step 4: Run** te testy plus `npx biome check src tests tools index.html` → PASS.
- [ ] **Step 5: Commit** „Panel budowy: znaczniki, klasa BuildPanel i style”.

### Task 5: Podpięcie w `src/main.ts`

**Files:**
- Modify: `src/main.ts` (`openBuild`, `startPlacing`, `cancelPlacing`, skróty klawiszy, `hud`, zmiana języka, `start`, `view.setGrafika`, parametr `budowa=klodki`)

**Interfaces:**
- Consumes: `BuildPanel`, `buildPanelHtml`, `buildMenu` z `availableOf(...)`/`allowedAnchors`, `thumbUrl`, `clearThumbs`.
- Produces: `const buildPanel = new BuildPanel($('buildPanel'), { … })` w `main.ts`; `window.zm.buildPanel(): { open: boolean; tab: string | null; kind: string | null }` do zrzutów.

- [ ] **Step 1: Wire**: `openBuild()` przełącza panel zamiast `modal.show`; `onPlace(kind)` woła `startPlacing(kind)` i `nextPrompt()`, a na dotyku (`touchUI`) dodatkowo `hide()`; na komputerze panel zostaje otwarty. `Esc`: stawianie → anuluje, w przeciwnym razie otwarty panel → zamyka, w przeciwnym razie dotychczasowe czyszczenie zaznaczenia. `KeyB` i `btnBuild` przełączają panel. `stateKey()` to skrót z `availableOf`-owych liczb (zapas minus rezerwacje), `st.builds.length`, `st.things.length`, `st.apts` ze znacznikiem `ours` i `st.techDone?.length`; miejsca (`room`) liczone z pamięcią podręczną pod tym samym kluczem i tylko dla widocznej zakładki. `refresh()` wołane z `hud()`.
- [ ] **Step 2: Wire the rest**: zmiana języka woła `buildPanel.relocalize()` (zamiast `sheetAgain` dla budowy); `start()` i wczytanie zapisu zamykają panel i zerują wybór; `view.setGrafika(art)` poprzedzone `clearThumbs()` i `buildPanel.refresh(true)`; parametr `budowa=klodki` ustawia `BUILD_MENU.showLocked = true`, `BUILDS.magazyn.tech = 't_test'`, `BUILDS.ogrodek.tech = 't_test'` i wpis `TECH_NAMES.t_test` („Badanie testowe” / „Test research”).
- [ ] **Step 3: Run** `npm test` (całość), `npx biome check src tests tools index.html`, `npm run build` → bez błędów.
- [ ] **Step 4: Commit** „Menu budowy: panel zamiast okna w main.ts”.

### Task 6: Zrzuty, weryfikacja w Chromium, dziennik

**Files:**
- Modify: `tools/shots.ts` (scenariusze `m2-menu-budowy` i `m2-stawianie`, nowe `panel-budowy`, `panel-budowy-telefon`, `panel-budowy-tablet`, `panel-budowy-klodki`), `docs/POSTEP.md`, `docs/superpowers/specs/2026-10-18-menu-budowy-design.md` (jeśli plan coś zmienił)

**Interfaces:**
- Consumes: `window.zm.buildPanel()`, `#buildPanel`, `.tile[data-kind]`, `[data-act="build"]`, `[data-tab]`.

- [ ] **Step 1: Przepisać** `m2-menu-budowy` na panel (zakładki `Dom|Podwórko|Obwód`, 6 budowli łącznie po przejściu zakładek, koszt/czas z `BUILDS`, powód przy niedostępnych, Esc zamyka, mapa klikalna przy otwartym panelu) i w `m2-stawianie` zamienić `choose(kind)` na: `b`, klik w `.tile[data-kind=…]`, klik w `[data-act="build"]`.
- [ ] **Step 2: Dodać** scenariusze `panel-budowy` (komputer 1280×800, zrzut `shots/panel-budowy.png`, sprawdzenie przesunięcia `.mapctl` i braku nakładania na `#card` i `.placebar`), `panel-budowy-telefon` (390×844, szuflada od dołu, zamyka się po „Postaw”), `panel-budowy-tablet` (1024×768 z dotykiem: panel z prawej, zamyka się po „Postaw”), `panel-budowy-klodki` (`budowa=klodki`: kłódki i „Wymaga badania: Badanie testowe”), asercja MutationObserver: 60 klatek bez zmian stanu = 0 mutacji w `#buildPanel`; kolejność Esc; nowa gra przy otwartym panelu zamyka go.
- [ ] **Step 3: Run** `npm run shots -- budowy`, `npm run shots -- stawianie`, następnie `npm run shots -- panel-budowy`, obejrzeć każdy zrzut w `shots/` (Read) i poprawić CSS, aż miniatury, zakładki i szczegóły są czytelne.
- [ ] **Step 4: Run** `npm test`, `npx biome check src tests tools index.html`, `npm run build`, `npm run bot` i `npm run bot:zombie` (wyniki identyczne ze stanem sprzed zmian: porównać z `git stash`-owanym baseline przez uruchomienie na `pelna-gra` w `/Users/mpawelczuk/Post-pixel` albo z liczbami z `docs/POSTEP.md`), `npm run perf`.
- [ ] **Step 5: Dopisać** w `docs/POSTEP.md` wpis „Menu budowy: panel z boku (gałąź `menu-budowy`, lokalnie)” z listą decyzji do przejrzenia ze spec, a w „Zaparkowane”: znaczek NOWE, pracownia jako pierwsza budowla projektu badań, widok z kłódkami po badaniach; **Commit** „Menu budowy: zrzuty, dziennik”.
