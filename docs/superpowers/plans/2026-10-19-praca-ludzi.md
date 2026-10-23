# Praca ludzi i werbunek: plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bezczynny zarząd sam pracuje według tabeli priorytetów, stałego zajęcia i progów zapasów, zawód przyspiesza pracę, a wędrowca da się zwerbować.

**Architecture:** Nowy moduł `src/sim/praca.ts` trzyma czyste dane i funkcje (rodzaje, priorytety, progi, tempo, bramka pierwszego dnia). `Sim.think()` w `src/sim/sim.ts` po potrzebach pyta rodzaje po kolei i woła istniejące `start*` z `order = false`. Ustawienia gracza idą poleceniami przez `st.cmds` do opcjonalnego `st.praca`. Interfejs (panel Pracy, karta osoby) czyta odczyt z `snapshot`, bez PixiJS w logice.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`: importy z `.ts`, `import type`, bez enumów), Vitest, Biome, Playwright (`npm run shots`), skrypty `tools/*.ts` w Node 22.18+ bez kompilacji.

**Spec:** `docs/superpowers/specs/2026-10-19-praca-ludzi-design.md` (gałąź `praca-ludzi`). Przeczytaj go całego przed pierwszym zadaniem, razem z `CLAUDE.md`.

## Global Constraints

- Symulacja deterministyczna, w `src/` bez `Math.random`; losowanie tylko z `st.rng` (`nextRandom`, `rngOf`) albo z ziarna liczonego z `hashString`/`mulberry` (`src/core/rng.ts`). W decyzjach bez `Math.hypot`, `sin`, `cos`; odległość w liczbach całkowitych, remis po indeksie.
- Nowe pola `SimState` opcjonalne, bez losowania; stary zapis bez nich daje ustawienia domyślne. Wersja stanu (`v: 3`) i zapisu (`SAVE_VERSION`) bez zmian.
- Pamięć podręczna („czy jest robota”) w `Sim` poza `SimState`, żeby `sim.hash()` zależał tylko od stanu.
- Zmiany ustawień tylko przez `sim.push(...)` i kolejkę `st.cmds`, działają od następnego kroku.
- Rodzaje w kolejności kolumn: `ogien`, `kuchnia`, `budowa`, `naprawy`, `drwal`, `noszenie`, `warsztat`, `szaber`, `badania`. Priorytet `0` znaczy „nie robi”, `1` najważniejszy, `4` najmniej.
- Domyślne priorytety: `ogien` 1 dla każdego; rodzaj z umiejętnością 3–4 → 1, 1–2 → 2, bez → 3; `noszenie` i `szaber` 3 dla każdego; `badania` 0, dopóki `widoczny` daje `false`.
- Umiejętność rodzaju: `ogien` i `drwal` → `cieplo`; `kuchnia` → `uprawa`; `budowa` i `naprawy` → `bud`; `warsztat` → wyższa z `elek` i `it`; `noszenie` i `szaber` → brak; `badania` → z wpisu (kontrakt z gałęzią `badania`).
- `tempoPracy(st, p, rodzaj) = 1 + 0,1 · poziom` (`TEMPO_KROK = 0.1`), przed pierwszym rankiem zawsze 1 (pierwszy dzień gry bez zmian). Dzieli czas ścinania, budowy, łatania, napraw, warsztatu, dzidy i gotowania; noszenia, szabru i dokładania nie.
- Bramka nowych rodzajów (`drwal`, `naprawy`, `noszenie`, `warsztat`, `szaber`, `badania`, dokańczanie planu płotu): od dnia 2, 6:00, gdy samouczek skończony (`st.tut.step === TUT_STEPS.length` albo `-1`); od dnia 3, 6:00 bez względu na samouczek.
- Sama praca za dnia (`!night()`, 6–22); nocą bez polecenia tylko `ogien` w obrębie siatki i `kuchnia`.
- Za siatką bez polecenia tylko osoba z `zaSiatke` i tylko za dnia. „W obrębie siatki” = `insideAt(tile)` albo kafelek budynku z `st.plot.bids`.
- Progi domyślne: drewno 30, deski 20, części 10, dzidy 0 (tryb zombie: 12). Próg 0 wyłącza robienie.
- `ZARZAD_MAX = 12`. Zwerbowani ponad limit tylko do wolnego łóżka mieszkańców; bez niego opcji nie ma.
- Id zwerbowanych osób: `w1`, `w2`, … (licznik w `st.obcy`), nigdy z liczników `s…`.
- Napisy w obu językach przez `tx()`/`tr()` (`src/core/jezyk.ts`), angielski według `docs/SLOWNICZEK-EN.md`; nazwy rodzajów EN: Fire, Kitchen, Build, Repair, Woodcutting, Hauling, Workshop, Scavenging, Research.
- Klawisz panelu: `KeyP` (M zajęte przez mapę miasta, T przez badania). Przycisk „Praca” / „Work” w `header#top` obok `#btnBuild`.
- Każdy plik zaczyna się komentarzem o tym, co robi moduł i jaki ma kontrakt; komentarze po polsku. Liczby w tekstach przez `src/ui/tekst.ts`.
- Lint: `npx biome check src tests tools server index.html` (nie `npm run lint`).
- Nic nie wypychać. Lokalne commity po każdym zadaniu, z linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Dwie osoby nie biorą tego samego zlecenia (to samo drzewo, ta sama dziura, to samo pomieszczenie): rezerwacja przez `job.target` innych pionków. Test w zadaniu 4.
- Zlecenie bez materiału albo bez drogi nie kręci się co sekundę w kółko (start, porażka, start): bezczynny z jedyną robotą, której nie da się zacząć, czeka `THINK_EVERY` i nie liczy nowych dróg A* bez końca. Test w zadaniu 4.
- Polecenie gracza w trakcie pracy z automatu zastępuje ją od razu, a po jego końcu osoba wraca do priorytetów. Test w zadaniu 3.
- Osoba ze wszystkimi rodzajami na 0 dalej je, śpi i się grzeje, a poza tym stoi. Test w zadaniu 3.
- Ustawienia zmarłej albo odeszłej osoby (`removeCore`) nie przechodzą na nikogo innego, a nowa osoba dostaje domyślne. Test w zadaniu 2.

---

### Task 0: Łańcuch wspólnego płotu w symulacji

**Files:**
- Create: `tests/unit/plot-lancuch.test.ts`

**Interfaces:**
- Consumes: `plotDla`, `kosztPlotu`, `drzwiBudynku` z `src/sim/sasiedzi.ts`; `gateTiles` z `src/sim/perimeter.ts`; pomocniki `core`, `until` z `tests/unit/sasiedzi-pomoc.ts`; wzór `graZPlotem` i `buduj` z `tests/unit/plot.test.ts` (świeży świat przez `buildWorld`, nie `demoWorld`, bo otoczenie zmienia świat).
- Produces: nic dla innych zadań.

- [ ] **Step 1: Napisz test `'Lanciego: 10F, potem 10H, obwód szczelny po każdym, zapis i wczytanie'`**

Dla każdego budynku po kolei (`'Blok nr 10F'`, `'Blok nr 10H'`): otworzyć drzwi (`open`, potem `force` łomem, z ponawianiem polecenia za dnia, gdy osoba nie ma pracy `'door'`), dosypać materiał z `kosztPlotu(r).need` na wolne kafelki podwórka, zbudować (`enclose`). Asercje po każdym budynku:

```ts
expect(sim.st.plot?.bids).toContain(b.id);
expect(drogaZUlicyNaPodworko(w, sim)).toBe(false); // BFS po !w.blocked bez kafelków siatki, dziur i bramy
```

Na końcu `expect(sim.st.plot?.bids).toEqual([id10F, id10H])`, a kopia stanu na świeżym świecie (`new Sim(swiezy('lanciego'), JSON.parse(JSON.stringify(sim.st)))`) ma tę samą `w.fence.tiles` i po 400 krokach ten sam `hash()`.

- [ ] **Step 2: Uruchom**

Run: `npm test -- plot-lancuch`
Expected: PASS. Jeśli 10H nie da się otoczyć mimo otwartych drzwi i materiału, to błąd gry: opisz przyczynę w raporcie zadania (plik, linia, co się dzieje) i oznacz test `it.fails` z komentarzem, bez poprawiania gry w tym zadaniu.

- [ ] **Step 3: Commit** `Test łańcucha wspólnego płotu: 10F i 10H na Lanciego`

---

### Task 1: Moduł pracy: rodzaje, priorytety, progi, tempo, bramka

**Files:**
- Create: `src/sim/praca.ts`
- Create: `tests/unit/praca.test.ts`

**Interfaces:**
- Consumes: `Person`, `Dom` z `src/content/people.ts` / `src/content/data.ts`; `SimState` (typ) z `src/sim/sim.ts`; `TUT_STEPS` z `src/sim/tutorial.ts`; `dayOf`, `hourOf`, `TICKS_PER_DAY` z `src/sim/clock.ts`; `modeOf` z `src/sim/tryb.ts`.
- Produces (używają zadania 2–7):
  - `type RodzajPracy = 'ogien' | 'kuchnia' | 'budowa' | 'naprawy' | 'drwal' | 'noszenie' | 'warsztat' | 'szaber' | 'badania'`
  - `const RODZAJE: readonly RodzajPracy[]` (kolejność kolumn)
  - `const NOWE: ReadonlySet<RodzajPracy>` (`drwal`, `naprawy`, `noszenie`, `warsztat`, `szaber`, `badania`)
  - `type Priorytet = 0 | 1 | 2 | 3 | 4`
  - `interface UstawieniaOsoby { prio?: Partial<Record<RodzajPracy, Priorytet>>; stale?: RodzajPracy; zaSiatke?: true }`
  - `interface Progi { drewno: number; deski: number; czesci: number; dzidy: number }`
  - `interface PracaStan { osoby?: Record<number, UstawieniaOsoby>; progi?: Partial<Progi> }` (klucz osoby: indeks w `st.people`)
  - `interface WpisRodzaju { umiejetnosc(st: SimState, o: Person): number; widoczny(st: SimState): boolean; znajdz?(sim: { startResearch(p: Pawn): boolean }, p: Pawn): boolean }` i `const WPISY: Record<RodzajPracy, WpisRodzaju>`; wpis `badania`: `umiejetnosc` 0, `widoczny` false, bez `znajdz` (kontrakt z gałęzią `badania` w specu, sekcja „Rodzaje pracy”)
  - `function domyslnyPriorytet(st: SimState, o: Person, r: RodzajPracy): Priorytet`
  - `function priorytet(st: SimState, osoba: number, r: RodzajPracy): Priorytet` (zmiana gracza albo domyślny)
  - `function staleZajecie(st: SimState, osoba: number): RodzajPracy | null`
  - `function zaSiatke(st: SimState, osoba: number): boolean`
  - `function progi(st: SimState): Progi` (domyślne z trybem, nadpisane `st.praca.progi`)
  - `const PROGI_DOMYSLNE: Progi = { drewno: 30, deski: 20, czesci: 10, dzidy: 0 }`, `const DZIDY_ZOMBIE = 12`
  - `const TEMPO_KROK = 0.1`, `function tempoPoziomu(poziom: number): number` (`1 + TEMPO_KROK * poziom`), `function tempoPracy(st: SimState, p: Pawn, r: RodzajPracy): number` (osoba z `st.people[p.person]`; 1 przed `automatRusza`, 1 bez osoby)
  - `function automatRusza(st: SimState): boolean` (bramka z Global Constraints)
  - `const ZARZAD_MAX = 12`
  - `function kolejnoscOsoby(st: SimState, osoba: number): RodzajPracy[]` (stałe zajęcie pierwsze, potem priorytety 1→4, remis po `RODZAJE`, bez zer i bez niewidocznych)

- [ ] **Step 1: Napisz testy**

```ts
it('domyślne priorytety z umiejętności', () => {
  const o = { skills: { cieplo: 3, bud: 1 }, traits: [] } as unknown as Person;
  expect(domyslnyPriorytet(st, o, 'ogien')).toBe(1);
  expect(domyslnyPriorytet(st, o, 'drwal')).toBe(1);   // cieplo 3
  expect(domyslnyPriorytet(st, o, 'budowa')).toBe(2);  // bud 1
  expect(domyslnyPriorytet(st, o, 'kuchnia')).toBe(3); // bez uprawa
  expect(domyslnyPriorytet(st, o, 'noszenie')).toBe(3);
  expect(domyslnyPriorytet(st, o, 'badania')).toBe(0); // niewidoczne
});
it('warsztat liczy wyższą z elek i it', ...)            // { elek: 1, it: 4 } → 1
it('kolejność: stałe zajęcie, potem 1→4, remis po kolumnach, bez zer', () => {
  st.praca = { osoby: { 0: { prio: { kuchnia: 1, ogien: 2, budowa: 0 }, stale: 'szaber' } } };
  expect(kolejnoscOsoby(st, 0).slice(0, 3)).toEqual(['szaber', 'kuchnia', 'ogien']);
  expect(kolejnoscOsoby(st, 0)).not.toContain('budowa');
});
it('stary stan bez st.praca: domyślne, progi domyślne, nic nie powstaje w stanie', ...) // JSON stanu bez zmian po wywołaniach
it('progi: zombie ma dzidy 12, zwykły 0, nadpisanie z st.praca.progi', ...)
it('tempo: 1 przed pierwszym rankiem, potem 1 + 0,1 · poziom', () => {
  // tick dnia 1 → 1; dzień 2, 6:00, samouczek skończony, cieplo 4, 'drwal' → 1.4; 'noszenie' → 1
});
it('bramka: dzień 2 6:00 po samouczku, dzień 3 6:00 bez samouczka, -1 bez samouczka', ...)
```

Stan do testów: `createSim(demoWorld('przymorze'), 5, { core: 4 })` z `tests/unit/sasiedzi-pomoc.ts`, z ręcznie ustawionym `st.tick` i `st.tut`.

- [ ] **Step 2: Uruchom, ma paść** — Run: `npm test -- tests/unit/praca.test.ts` → FAIL (brak modułu)
- [ ] **Step 3: Napisz `src/sim/praca.ts` według Interfaces** (czyste funkcje, bez importu wartości z `sim.ts`, tylko typy)
- [ ] **Step 4: Uruchom** — Run: `npm test -- tests/unit/praca.test.ts` → PASS
- [ ] **Step 5: Commit** `Moduł pracy: rodzaje, priorytety, progi, tempo, bramka pierwszego dnia`

---

### Task 2: Stan i polecenia ustawień

**Files:**
- Modify: `src/sim/sim.ts` (`SimState` około 815: pole `praca?: PracaStan`; `Command` około 651; `apply()` około 2405)
- Create: `tests/unit/praca-polecenia.test.ts`

**Interfaces:**
- Consumes: typy i funkcje z zadania 1.
- Produces:
  - `| { t: 'prio'; ids: number[]; osoba: number; rodzaj: RodzajPracy; prio: Priorytet }`
  - `| { t: 'stale'; ids: number[]; osoba: number; rodzaj: RodzajPracy | null }`
  - `| { t: 'zasiatke'; ids: number[]; osoba: number; on: boolean }`
  - `| { t: 'prog'; ids: number[]; co: keyof Progi; n: number }` (`n` obcięte do 0–999, całkowite)
  - `st.praca` powstaje przy pierwszym poleceniu; ustawienie równe domyślnemu usuwa wpis (stan wraca do kształtu bez pola, gdy nic nie zostało).

- [ ] **Step 1: Testy**

```ts
it('polecenie prio działa od następnego kroku i trafia do st.praca', () => {
  sim.push({ t: 'prio', ids: [], osoba: 0, rodzaj: 'drwal', prio: 4 });
  expect(priorytet(sim.st, 0, 'drwal')).not.toBe(4);
  sim.step();
  expect(priorytet(sim.st, 0, 'drwal')).toBe(4);
});
it('powrót do domyślnego usuwa wpis; bez zmian st.praca znika', ...)  // expect('praca' in sim.st).toBe(false)
it('stale i zasiatke; prog obcięty do 0–999', ...)
it('osoba spoza st.people albo nie z zarządu: polecenie ignorowane', ...)
it('ustawienia odeszłej osoby nie przechodzą na nowych (removeCore, addCore)', () => {
  // ustaw osobie 0 stale 'drwal', removeCore(st, st.people[0].id, w), addCore(...) nowej osoby
  // nowa osoba (indeks st.people.length - 1) ma staleZajecie null i domyślne priorytety
});
it('zapis i wczytanie z ustawieniami dają ten sam skrót', ...)
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- praca-polecenia` → FAIL
- [ ] **Step 3: Pola, polecenia i obsługa w `apply()`**
- [ ] **Step 4: Uruchom** — `npm test -- praca-polecenia` → PASS; `npm test -- sim.test druzyna-sim` → PASS (stan bez poleceń bez zmian)
- [ ] **Step 5: Commit** `Praca: stan i polecenia ustawień`

---

### Task 3: Szkielet automatu w think(): kolejność, potrzeby, zimno, przerwania

**Files:**
- Modify: `src/sim/sim.ts` (`think()` około 3773; `work()` około 3168, zbiór `M2_JOBS` około 319; `startAnyBuild` około 4432; `startRefuel`, `startHaul`, `startCook`)
- Create: `tests/unit/praca-sim.test.ts`, `tests/unit/praca-pomoc.ts`

**Interfaces:**
- Consumes: `kolejnoscOsoby`, `automatRusza`, `NOWE` z zadania 1; polecenia z zadania 2.
- Produces:
  - `private znajdzPrace(p: Pawn, r: RodzajPracy): boolean` w `Sim`: `ogien` → `startRefuel(p, false) || startHaul(p)`; `kuchnia` → `shouldCook() && startCook(p, false)`; `budowa` → `!night() && startAnyBuild(p)`; rodzaje z `NOWE` → `false` w tym zadaniu (zadania 4–5 dopisują ciała); `badania` → `WPISY.badania.znajdz?.(this, p) ?? false`.
  - `const AUTO_JOBS = new Set<JobKind>(['chop', 'patch', 'craft', 'haul'])`: praca z tego zbioru bez polecenia (`!j.order`) przerywa się w `work()` jak `M2_JOBS` (pilna potrzeba, noc, wróg na podwórku); `haul` nocą tylko wtedy, gdy jej sterta jest poza siatką. Prace z polecenia jak dziś.
  - `tests/unit/praca-pomoc.ts`: `wylaczAutomat(sim: Sim): void` (wszystkim z zarządu rodzaje z `NOWE` na 0 przez polecenia i krok), `doRana(sim: Sim, dzien: number): void` (kroki do `dzien`, 6:00), `skonczSamouczek(sim: Sim): void`.

Nowa kolejność `think()` po dzisiejszych gałęziach zombie i wroga na podwórku, po odniesieniu niesionego drewna i po śnie i jedzeniu (te zostają jak są):
1. ciepło poniżej 10 (`n.warm < 10`): `startRefuel(p, false)` przy kozie, która gaśnie, inaczej `startWarm(p)`; gdy się uda, koniec;
2. koza gaśnie (ogień mniej niż `BURN_TICKS`): `startRefuel(p, false)`;
3. `for (const r of kolejnoscOsoby(st, p.person))`: pomiń `NOWE`, gdy `!automatRusza(st)`; nocą pomiń wszystko poza `ogien` i `kuchnia`; `if (this.znajdzPrace(p, r)) return`;
4. `n.warm < COLD && startWarm(p)` jak dziś;
5. `p.wait = st.tick + THINK_EVERY`.

- [ ] **Step 1: Testy**

```ts
it('osoba bez umiejętności: koza, kuchnia, budowa w tej samej kolejności co przed zmianą', ...)
// trzy demo, 4 osoby, bez poleceń: skrót stanu o dniu 2, 5:59 równy skrótowi z pelna-gra przed zmianą
// (przed pierwszym krokiem implementacji policz go na czystym checkoucie i wpisz stałą w teście)
it('pierwsza doba bez poleceń ma ten sam skrót co przed zmianą (Przymorze, Lanciego, Zielonki)', ...)
it('zimno poniżej 10 przy czekającym planie budowy: najpierw ciepło, bez pętli budowa–przerwanie', () => {
  // plan budowy z materiałem, osoba z needs.warm = 8, koza się pali: w ciągu 200 kroków job.t to 'warm' albo
  // 'refuel', a liczba rozpoczętych prac 'build' (licznik z setJob podglądany przez spy) najwyżej 1
});
it('polecenie gracza w trakcie pracy z automatu wygrywa od razu i po końcu wraca automat', ...) // Review Focus
it('wszystkie rodzaje na 0: je, śpi i grzeje się, poza tym stoi', ...)                         // Review Focus
it('praca bez polecenia z AUTO_JOBS przerywa się nocą i przy wrogu na podwórku; z polecenia nie', ...)
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- praca-sim` → FAIL
- [ ] **Step 3: Zmień `think()`, `work()` i dopisz `znajdzPrace`**
- [ ] **Step 4: Uruchom** — `npm test -- praca-sim` → PASS; potem pełne `npm test`. Testy, które padną, bo zakładały, że bezczynny zarząd robi tylko to co dziś, poprawiaj przez `wylaczAutomat(sim)` na ich początku, a nie przez zmianę asercji; każdą taką poprawkę wypisz w raporcie zadania.
- [ ] **Step 5: Commit** `Praca: automat w think() z kolejnością, zimnem przed pracą i przerwaniami`

---

### Task 4: Rodzaje Drwal, Naprawy, Noszenie i reguły za siatką

**Files:**
- Modify: `src/sim/sim.ts` (`znajdzPrace`; `startHaul` i `pileFor` około 3010 i 4160; praca `chop` około 3190 i `fell` około 3125; `startPatch` około 4260; naprawy około 4737; `startCarry` około 4928)
- Create: `tests/unit/praca-rodzaje.test.ts`

**Interfaces:**
- Consumes: `progi`, `zaSiatke`, `priorytet` z zadania 1; `znajdzPrace` z zadania 3.
- Produces:
  - `private naszTeren(tile: number): boolean` = `insideAt(tile) || st.plot?.bids.includes(w.bid[tile])`
  - `private mozeTam(p: Pawn, tile: number): boolean` = `naszTeren(tile) || (zaSiatke(st, p.person) && !night())`
  - `private szwendaczBlisko(tile: number, r = 10): boolean` (tryb zombie, żywy `kind === 'zombie'`, `max(|dx|, |dy|) < r`)
  - `private przySiatce(tile: number): boolean` (do 3 kafelków od kafelka `w.fence.tiles`)
  - `private zapasDrewna(): number` (drewno w obrębie siatki: skład, luźne na naszym terenie, w kozie; bez drewna na ulicy)
  - `startPatch(p, hole, order = true)`, `startCarry(p, id, order = true)` i polecenie `chop` z parametrem `order`; prace z `order = false` mają `j.order === false`.
  - `drwal`: `zapasDrewna() < progi(st).drewno`, najbliższe niezajęte drzewo (`st.felled` bez niego, żaden inny pionek nie ma `job.t === 'chop' && job.target === k`), nie suche drzewo przed końcem kroku `sciete` samouczka, nie drzewo na linii obwodu (pień zamienia się w kafelek siatki, `fell` około 3125), cel `mozeTam`.
  - `naprawy`: otwarta dziura (`st.fence.holes`) z materiałem `PATCH_COST` na naszym terenie, potem uszkodzenie (`st.damage`) w naszym mieszkaniu (`apt.ours`); nie wzmacnianie (`brace`).
  - `noszenie`: rzecz z `CARRY_MATS` leżąca poza podwórkiem (na ulicy albo w otoczonym budynku), niezajęta, cel `mozeTam`; łup w nieotoczonych cudzych budynkach tylko z `zaSiatke`.
  - Ogień: `startHaul` bierze stertę spoza siatki tylko przy `mozeTam`; ścinanie z polecenia za siatką kończy się wniesieniem całego drewna z tego drzewa przez tę samą osobę (sterty do 4 kafelków od pnia, `pileFor(p, 'outside', stand)`, kolejne prace `haul` z `order = true`).
  - Tryb zombie: `naprawy` i każda praca bez polecenia z celem `przySiatce(tile)` pomijane, gdy `szwendaczBlisko(tile)`.
  - Czas pracy dzielony przez `tempoPracy` w `chop` (`chopTicks`), `patch` (`PATCH_TICKS`) i naprawach: `Math.round(base / tempo)` przy starcie pracy.

- [ ] **Step 1: Testy** (prawdziwe mapy, `skonczSamouczek` i `doRana(sim, 2)` z zadania 3)

```ts
it('drwal ścina poniżej progu i przestaje nad progiem', ...)          // Lanciego, próg 30
it('dwóch drwali nie bierze tego samego drzewa', ...)                // Review Focus
it('drwal nie ścina drzewa na linii obwodu ani suchego drzewa przed samouczkiem', ...)
it('naprawy łatają dziurę, gdy jest materiał; bez materiału nie kręcą się', () => {
  // dziura bez desek i złomu: przez godzinę gry sim.stats.paths rośnie najwyżej o 4  (Review Focus)
});
it('noszenie wnosi łup z otoczonego budynku; z nieotoczonego tylko z przełącznikiem', ...)
it('bez przełącznika nikt sam nie wychodzi za siatkę, także po drewno; z przełącznikiem tylko za dnia', ...)
it('ścięcie na polecenie za siatką: ta sama osoba wnosi całe drewno z drzewa', ...)
it('próg drewna liczy tylko drewno w obrębie siatki', ...)
it('zombie: automat nie łata dziury, gdy szwendacz jest bliżej niż 10 m', ...)
it('tempo: drwal z cieplo 4 ścina w Math.round(chopTicks / 1.4), przed pierwszym rankiem w chopTicks', ...)
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- praca-rodzaje` → FAIL
- [ ] **Step 3: Zaimplementuj według Interfaces**
- [ ] **Step 4: Uruchom** — `npm test -- praca-rodzaje praca-sim` → PASS; pełne `npm test` z poprawkami jak w zadaniu 3
- [ ] **Step 5: Commit** `Praca: drwal, naprawy, noszenie i reguły za siatką`

---

### Task 5: Rodzaje Warsztat, Szaber, Budowa (płot) i tempo reszty prac

**Files:**
- Modify: `src/sim/sim.ts` (`znajdzPrace`; `startSaw` około 5050; `orderCraft` około 6884 i praca `craft`; `startSearch` około 4559; `startWreck` około 4821; plan płotu `st.plot.plan`; budowa `b.work += 1` około 4470; gotowanie)
- Create: `tests/unit/praca-warsztat.test.ts`

**Interfaces:**
- Consumes: zadania 1–4.
- Produces:
  - `startSaw(p, what, n, order = true)`, `startSearch(p, room, order = true)`, `startWreck(p, tile, how, order = true)`, `startCraft(p, order)` (wydzielone z `orderCraft`).
  - `private rezerwaZlomu(): number` = brak złomu otwartych planów (`need − have`) + `PATCH_COST` · liczba otwartych dziur.
  - `warsztat` (tylko przy postawionym warsztacie): deski, gdy deski < `progi.deski` i drewno ponad `progi.drewno` o co najmniej `RECIPES.deski.n`; części, gdy części < `progi.czesci` i złom ponad `rezerwaZlomu()` o co najmniej `RECIPES.czesci.n`; dzida, gdy `bezBroni − dzidyWMagazynie > 0` i `dzidyWMagazynie < progi.dzidy` i materiał `SPEAR_BOARDS`/`SPEAR_SCRAP`. Po jednej sztuce (`n = 1`) na pracę.
  - `szaber`: nieprzeszukane pomieszczenie pustego mieszkania w siedzibie i w otoczonych budynkach (`mieszkania` ze stanem `'puste'`, nigdy z lokatorami), potem wraki (`wrecksOf`) i pomieszczenia otwartych cudzych budynków tylko przy `mozeTam`; nigdy nie otwiera ani nie wyważa drzwi.
  - `budowa`: po `startAnyBuild` dokańcza istniejący `st.plot.plan` (praca `'plot'`), tylko gdy `automatRusza(st)`.
  - Tempo: budowa dodaje `tempoPracy` zamiast 1 do `b.work`; `saw`, `craft`, gotowanie i naprawy dzielą czas przez `tempoPracy`.

- [ ] **Step 1: Testy**

```ts
it('warsztat robi deski do progu tylko z nadwyżki drewna ponad próg', ...)
it('części ze złomu nie zjadają rezerwy na łaty i plany', ...)
it('dzida tylko dla nieuzbrojonych ponad dzidy w magazynie; w zwykłym trybie domyślnie wcale', ...)
it('szaber przeszukuje puste pomieszczenie w otoczonym budynku, nigdy mieszkania z lokatorami ani cudzych drzwi', ...)
it('budowa dokańcza plan wspólnego płotu od pierwszego rana', ...)
it('budowa z bud 3 idzie 1,3 raza szybciej', ...)
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- praca-warsztat` → FAIL
- [ ] **Step 3: Zaimplementuj**
- [ ] **Step 4: Uruchom** — `npm test -- praca-warsztat praca-rodzaje praca-sim` → PASS; pełne `npm test`
- [ ] **Step 5: Commit** `Praca: warsztat, szaber, dokańczanie płotu i tempo z umiejętności`

---

### Task 6: Werbunek wędrowców

**Files:**
- Modify: `src/sim/wedrowcy.ts`, `src/sim/sim.ts` (`JobKind`, `Command`, `talkWork` około 5758, nowa praca), `src/sim/orders.ts` (menu wędrowca około 196–215, `jobText` około 767), `src/content/napisy-*.ts` albo `NAPISY` w `wedrowcy.ts` (wzór: `OBCY`)
- Create: `tests/unit/werbunek.test.ts`

**Interfaces:**
- Consumes: `ZARZAD_MAX` z zadania 1; `addCore`, `aptFor`, `capOf`, `bedsIn` z `sim.ts`; `UKRYTY_UGRYZIONY` z `src/sim/sasiedzi.ts`; `makePerson` z `src/content/people.ts`.
- Produces:
  - w `wedrowcy.ts`: `osobaWedrowca(seed: number, nr: number): Person` (ziarno `hashString(\`${seed}:wedrowiec:${nr}\`)`, bez `st.rng`); `celWedrowca(seed, nr): boolean` (połowa ma cel); `ugryzienieWedrowca(seed, nr): boolean` (z `UKRYTY_UGRYZIONY`); `szansaWerbunku(o: { jedzenieNaGlowe: number; wolneLozko: boolean; napadDwieDoby: boolean; maCel: boolean }): number` = `clamp(0.30 + (j ≥ 2 ? 0.20 : 0) + (łóżko ? 0.15 : 0) − (napad ? 0.30 : 0), 0.05, 0.85)`, przy celu połowa.
  - `st.obcy.rozmowa?: { id: number; osoba: Person; cel: boolean; ugryziony: boolean; pytali?: true }` (ustawiane na końcu `talkWork`, jeden wędrowiec naraz) i `st.obcy.werbunek?: number` (licznik id `w…`).
  - Polecenia `| { t: 'zapros'; ids: number[]; target: number }`, `| { t: 'reka'; ids: number[]; target: number }`; praca `'zapros'` (`j.what` `'zapros'` albo `'reka'`, 2 minuty przy siatce jak `talk`, potem losowanie z `st.rng`).
  - Skutek: zarząd poniżej `ZARZAD_MAX` → wędrowiec staje się osobą zarządu w swoim miejscu i ze swoim wyglądem (`Person.id = 'w' + n`), wchodzi bramą, kronika i nastrój „Nowa osoba w zarządzie”; zarząd pełny i wolne łóżko mieszkańców → mieszkaniec z pracą `arrive` do mieszkania z wolnym łóżkiem; ugryziony bez pytania → `p.bite` od chwili przyjęcia; „reka” u ugryzionego → odchodzi, bez werbunku; porażka → idzie dalej.
  - Menu (`commandsAt`): po rozmowie „Zaprosić do nas (N% szans)” albo „Zaprosić do nas jako mieszkańca (N%)”; bez miejsca wyszarzone z napisem „Brak miejsca”; w trybie zombie „Zapytać o rękę” przed zaproszeniem.

- [ ] **Step 1: Testy**

```ts
it('szansa: 0,30 bazowo, +0,20 jedzenie, +0,15 łóżko, −0,30 napad, zakres 0,05–0,85, cel połowa', () => {
  expect(szansaWerbunku({ jedzenieNaGlowe: 2, wolneLozko: true, napadDwieDoby: false, maCel: false })).toBeCloseTo(0.65);
  expect(szansaWerbunku({ jedzenieNaGlowe: 0, wolneLozko: false, napadDwieDoby: true, maCel: true })).toBeCloseTo(0.025);
});
it('osoba wędrowca z ziarna świata i numeru, ta sama przy powtórce', ...)
it('udane zaproszenie: osoba zarządu z id w1, domyślne priorytety, przy bramie', ...)
it('pełny zarząd: zwerbowany zostaje mieszkańcem w wolnym łóżku; bez łóżka opcji nie ma', ...)
it('dom jednorodzinny przy pełnym zarządzie: opcji nie ma', ...)        // Zielonki
it('zombie: ukryte ugryzienie bez pytania daje gorączkę, z pytaniem wędrowiec odchodzi', ...)
it('gra bez rozmów z wędrowcem: ten sam skrót co przed zmianą', ...)    // opcja obcy, 3 doby
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- werbunek` → FAIL
- [ ] **Step 3: Zaimplementuj**
- [ ] **Step 4: Uruchom** — `npm test -- werbunek wedrowcy` → PASS; pełne `npm test`
- [ ] **Step 5: Commit** `Werbunek wędrowców do zarządu i do wolnych łóżek`

---

### Task 7: Odczyt dla interfejsu i ludność

**Files:**
- Modify: `src/sim/snapshot.ts` (`SimPerson`, `SimSnapshot`, `snapshot` około 276), `src/sim/sim.ts` (publiczne `ileZlecen(r: RodzajPracy): number`)
- Create: `tests/unit/praca-odczyt.test.ts`

**Interfaces:**
- Consumes: zadania 1–6.
- Produces:
  - `export function populacja(st: SimState): { zarzad: number; mieszkancy: number; razem: number }` (pionki `core`, także `away`, i `resident`; bez `sasiad` i gości)
  - `SimPerson` dostaje `osoba: number` (indeks w `st.people`), `sam: boolean` (praca bez polecenia), `praca: { prio: Priorytet[]; stale: RodzajPracy | null; zaSiatke: boolean }` (kolejność `RODZAJE`)
  - `SimSnapshot` dostaje `praca: { progi: Progi; widoczne: RodzajPracy[] }`
  - `sim.ileZlecen(r)`: ile zleceń rodzaju czeka (dla nagłówka kolumny), liczone na żądanie, poza stanem

- [ ] **Step 1: Testy**

```ts
it('populacja: zarząd z wyprawą, mieszkańcy, bez sąsiadów i gości', ...)
it('odczyt: priorytety w kolejności RODZAJE, stałe zajęcie, przełącznik, sam', ...)
it('odczyt nie zmienia stanu (skrót przed i po snapshot)', ...)
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- praca-odczyt` → FAIL
- [ ] **Step 3: Zaimplementuj według Interfaces**
- [ ] **Step 4: Uruchom** — `npm test -- praca-odczyt` → PASS; pełne `npm test`
- [ ] **Step 5: Commit** `Praca: odczyt dla interfejsu i funkcja populacji`

---

### Task 8: Panel Pracy, karta osoby, menu wędrowca

**Files:**
- Create: `src/ui/praca.ts` (czysta funkcja `pracaPanelHtml(v: WidokPracy, en: boolean): string` i `type WidokPracy`), `src/ui/panelpracy.ts` (klasa `PracaPanel` jak `BuildPanel` w `src/ui/panelbudowy.ts`: `stateKey`, delegacja kliknięć, `#app.praca-open`)
- Modify: `index.html` (przycisk `#btnPraca` w `header#top` przed `#btnBuild`), `src/ui/jezyk.ts` (`STATYCZNE`), `src/ui/karta.ts` (`personCard`: wybór stałego zajęcia `data-card="stale"`, przełącznik `data-card="zasiatke"`, dopisek „(sam)” / „(sama)” / „(on own)” przy `sam`), `src/main.ts` (przycisk, `KeyP`, hooki panelu wysyłające polecenia z zadania 2, obsługa nowych `data-card`), `src/style.css`
- Create: `tests/unit/praca-ui.test.ts`

**Interfaces:**
- Consumes: odczyt z zadania 7, polecenia z zadania 2.
- Produces: atrybuty DOM dla zrzutów: komórka `data-prio="<osoba>:<rodzaj>"` z cyfrą albo pustą treścią, `data-prog="<co>:<+n|-n>"`, `data-zasiatke="<osoba>"`, nagłówek `data-kol="<rodzaj>"`.

Zachowanie: klik w komórkę 1 → 2 → 3 → 4 → 0 → 1, prawy przycisk w drugą stronę; stuknięcie na telefonie jak klik. Progi: drewno, deski i części (minus, liczba, plus po 5; dzidy tylko w trybie zombie). Kolumna `badania` tylko, gdy w `widoczne`. Na telefonie 390×844 arkusz od dołu na całą szerokość, dziewięć kolumn po 30 px, nagłówek przyklejony, przewijanie w pionie. W trybie zombie przy włączaniu `zasiatke` ostrzeżenie o szwendaczach (jedno zdanie w karcie).

- [ ] **Step 1: Testy w Node** (HTML jako tekst, bez DOM)

```ts
it('panel: wiersz na osobę, kolumny w kolejności RODZAJE, cyfry i puste komórki', ...)
it('panel po angielsku bez polskich słów (poza imionami)', ...)
it('Badania ukryte, gdy nie ma ich w widoczne', ...)
it('karta: wybór stałego zajęcia i przełącznik; dopisek sam/sama/on own', ...)
```

- [ ] **Step 2: Uruchom, ma paść** — `npm test -- praca-ui` → FAIL
- [ ] **Step 3: Zaimplementuj panel, kartę, przycisk i klawisz**
- [ ] **Step 4: Uruchom** — `npm test -- praca-ui karta` → PASS; pełne `npm test`
- [ ] **Step 5: Zrzuty** w `tools/shots.ts`: `praca-panel`, `praca-panel-telefon`, `en-praca-panel`, `praca-karta`, `wedrowiec-zapros`, `pasek-telefon` (390×844, wszystkie przyciski paska widoczne bez nachodzenia). Run: `npm run shots -- praca` i `npm run shots -- pasek-telefon` → bez błędów; obejrzyj każdy PNG z `shots/` i opisz w raporcie, co widać.
- [ ] **Step 6: Commit** `Panel Pracy, karta osoby i zaproszenie wędrowca w interfejsie`

---

### Task 9: Boty, wydajność, skróty i dziennik

**Files:**
- Create: `tools/bot-praca.ts`
- Modify: `package.json` (`"bot:praca": "node tools/bot-praca.ts"`), `tools/perf.ts` (flaga `--zarzad=N`, liczba osób zarządu w `createSim`), `tests/unit/druzyna-sim.test.ts` (przypięte skróty, jeśli się zmieniły), `docs/POSTEP.md`

**Interfaces:**
- Consumes: wszystko powyżej; `playWithGov` z `tests/unit/gov-play.ts`.

`tools/bot-praca.ts [ziarno] [--werbunek]`:
- „zarząd bez gracza”: Przymorze, Lanciego, Zielonki, oba tryby, 3 doby, tylko karta nocy (`playWithGov`) i jedno polecenie samouczka (ścięcie suchego drzewa). Na koniec każdego dnia jedna linijka: drewno, deski, części (w obrębie siatki), łaty, przeszukane pomieszczenia, wyjścia za siatkę bez polecenia (ma być 0), średnie ciepło i nastrój zarządu, ludność (`populacja`).
- `--werbunek`: Przymorze, opcja `obcy`, 10 dni, rozmowa i zaproszenie z każdym wędrowcem; ilu do zarządu, ilu jako mieszkańcy, ludność po dniach.

- [ ] **Step 1:** `npm run bot:praca` i `npm run bot:praca -- 1 --werbunek`; wynik do dziennika. Cel werbunku 2–5 do zarządu w 10 dni; jeśli wyjdzie poza, zmień tylko stałe w `szansaWerbunku` i opisz.
- [ ] **Step 2:** `npm run bot`, `npm run bot:zombie`, `npm run bot:surowce`: nowe skróty i liczby przed i po (zgony, siatka, drewno, jedzenie; deski i złom po 5 dniach i dzień, w którym stać na najtańszy płot na Lanciego, 65 desek i 65 złomu). Przypięte skróty w `tests/unit/druzyna-sim.test.ts` poprawić tylko, jeśli zmieniły się przez ten projekt, z komentarzem.
- [ ] **Step 3:** `npm run perf -- 150 1 --zarzad=12` i z `--zombie`: laptop i telefon (CPU 4×), co najmniej 60 kl/s i najgorsza klatka jak w dzienniku.
- [ ] **Step 4: Bramka:** `npm test`, `npx biome check src tests tools server index.html`, `npm run build`, pełne `npm run shots` bez błędów.
- [ ] **Step 5:** Wpis w `docs/POSTEP.md` (sekcja „Zrobione”, nad „Następne”): co zrobione, liczby z botów, nowe skróty bazowe, poprawione testy z zadań 3–5, co zostaje.
- [ ] **Step 6: Commit** `Praca ludzi: boty, wydajność, skróty i dziennik`

---

### Task 10: Ludność w GovInput (po wejściu ramy zwycięstwa do pelna-gra)

Zadanie czeka, aż `git log pelna-gra` ma scalenie gałęzi `warunki-zwyciestwa` (`src/gov/zwyciestwo.ts` z `ludnoscOf`). Wtedy `git merge pelna-gra` na tej gałęzi (konflikty w dzienniku: obie strony).

**Files:**
- Modify: `src/sim/gov.ts` (`govInput`: `ludnosc` z `populacja(st).razem` zamiast obecnego wyrażenia), wydarzenia zarządu (`EventHost.pop()`)
- Create: `tests/unit/ludnosc.test.ts`

- [ ] **Step 1: Test** `'GovInput.ludnosc równe populacja(st).razem na trzech demach i po przyjęciu uchodźców'` i `'EventHost.pop() przez ludnoscOf daje to samo co dziś'` (jeśli nie daje, `pop()` zostaje bez zmian, a różnica idzie do dziennika).
- [ ] **Step 2: Uruchom, ma paść** — `npm test -- ludnosc` → FAIL
- [ ] **Step 3: Podmień wyrażenie w `govInput` i `pop()`**
- [ ] **Step 4: Uruchom** — `npm test`; `npm run bot` i `npm run bot:zombie` z tymi samymi skrótami co po zadaniu 9
- [ ] **Step 5: Commit** `Ludność dla zarządu z populacja(st)`

---

Kolejność scalania (spec, akcept punkt 9): ta gałąź wchodzi do `pelna-gra` po gałęziach `badania`, ramy zwycięstwa i pięter etap 1. Przy scaleniu z `badania` wpis `badania` w `WPISY` dostaje ciało z kontraktu (`znajdz` = `sim.startResearch(p)`, `umiejetnosc` = poziom z `badaniaDom(st)`, `widoczny` = `badaniaWidoczne(st)`), a `krzywaUmiejetnosci` z `src/sim/badania.ts` ustępuje `tempoPoziomu`.
