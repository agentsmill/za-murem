# Warunki zwycięstwa, etap 1 (rama i droga ludnościowa): plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pięć dróg do zwycięstwa widocznych w grze, droga ludnościowa grywalna do końca z epilogiem i „Graj dalej”, teren do pierwszego kamienia, reszta jako „Wkrótce: …”.

**Architecture:** Czysta logika w `src/gov/zwyciestwo.ts` liczona w kroku zarządu z `GovInput` i `GovState` (bez importu `src/sim`), stan `GovState.zwyciestwo` włączany opcją jak `wlaczMiasto`, okno epilogu przez `pending()` jako nowy rodzaj `Prompt`, ekran dróg i epilog w `src/ui/zwyciestwo.ts` jako `Sheet` jak reszta okien.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest, Playwright (`tools/shots.ts`), Biome.

**Spec:** `docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md` (sekcje „Zasady wspólne”, „4. Ludnościowa”, „Stan, odczyt i okna”, „Kolejność budowy” punkt 1).

Plan zatwierdził nocny integrator 19.10.2026 w zastępstwie Mateusza (zlecenie „Dodasz warunki zwycięstwa”, potem „działasz sam”). Wykonanie: subagenci (Sonnet) zadanie po zadaniu, recenzja całej gałęzi na końcu (Opus).

## Global Constraints

- Praca tylko w worktree `/Users/mpawelczuk/Post-pixel/.claude/worktrees/warunki-zwyciestwa` (gałąź `warunki-zwyciestwa`), nic nie wypychać.
- Determinizm: bez `Math.random`, bez `sort(() => rng() - 0.5)`; etap 1 nie losuje wcale.
- Bez opcji zwycięstwa (`newGov` bez `wlaczZwyciestwo`, boty bez `--zwyciestwo`) skróty bez zmian: `npm run bot` da4b24e0 i dad44c81, `npm run bot:zombie` 18b03936 i e8b7d9d5; istniejące testy z przypiętymi skrótami zarządu przechodzą bez zmiany liczb.
- `src/gov` nie importuje `src/sim`. Odczyt symulacji idzie przez `govInput()` w `src/sim/gov.ts`.
- Każdy napis gry w obu językach przez `tx()`/`L()` z `src/core/jezyk.ts`; angielski według `docs/SLOWNICZEK-EN.md` (zarząd „the board”, osiedle „the estate”, klatka „stairwell”, wyprawa „run”), bez polskich liter. Tytuł „Za Murem” bez tłumaczenia.
- Liczby w tekstach przez `src/ui/tekst.ts` (przecinek dziesiętny, prawdziwy minus).
- Importy z rozszerzeniem `.ts`, `import type` dla typów, bez enumów i przestrzeni nazw. Nowy plik zaczyna się komentarzem o tym, co robi moduł i jaki ma kontrakt.
- Satyra na dziś oglądana z 2051 roku, bez nazwisk prawdziwych osób i nazw prawdziwych firm.
- Po każdej zmianie wizualnej zrzut w Playwright obejrzany; „gotowe” dopiero po testach, botach i zrzutach.

## Review Focus

1. Wczytany stary zapis bez `zwyciestwo`: gra włącza drogi, a kamienie, które stan już spełnia (np. 30 osób), zapisują się raz, bez lawiny wpisów co sekundę i bez epilogu wstecz za stary stan.
2. Kamień raz zaliczony nie znika, gdy ludność spadnie; zwycięstwo tej samej drogi nie wraca drugi raz.
3. Po „Graj dalej” epilog nie wyskakuje ponownie, gra rusza w tempie sprzed epilogu, zapis zostaje; zwycięstwo innej drogi później pokazuje własny epilog.
4. Cel ludności: tryb zombie, brak danych 2021 i skrajne liczby nigdy nie dają 0, NaN ani celu poza przedziałem.
5. Licznik „7 dni bez głodu” zeruje się rano, gdy ktoś z zarządu jest głodny albo zaufanie spadło poniżej 50, i liczy doby gry, nie sekundy przy ekranie.
6. Zmiana języka przy otwartym ekranie dróg albo epilogu rysuje okno od nowa w nowym języku (wzorzec `sheetAgain`).

## Teksty (jedno źródło dla zadań 1 i 3)

Drogi (`DROGI` w `src/gov/zwyciestwo.ts`), nazwa i kamienie, PL / EN:
- `technologia`: „Prąd bez miedzi” / „Power without copper”; kamienie: „Pracownia postawiona” / „Research room built”, „Pierwsze badanie” / „First research”, „Era 3” / „Era 3”, „Era 5” / „Era 5”, „Sieć bez miedzi” / „Copper-free grid”. Wkrótce: „Wkrótce: badania w pracowni i sieć bez miedzi.” / „Coming soon: research and a copper-free grid.” (Etap 1 drogi technologii, 19.10.2026: sześć kamieni, „Pracownia postawiona”, „Pierwsze badanie”, „Era 3”, „Sieć bez miedzi”, „Generator fuzji”, „Fabryka ruszyła”; plan `2026-10-19-warunki-zwyciestwa-technologia.md`.)
- `teren`: „Za Murem” / „Za Murem”; kamienie: „Pierwszy sąsiad za płotem” / „First neighbour behind the fence”, „Kwadrat domu za obwodem” / „Home square enclosed”, „Pierwszy sąsiedni kwadrat” / „First neighbouring square”, „Pięć kwadratów” / „Five squares”, „Dziewięć kwadratów za murem” / „Nine squares behind the wall”. Wkrótce (po pierwszym kamieniu): „Wkrótce: sąsiednie kwadraty i mur.” / „Coming soon: neighbouring squares and the wall.”
- `lek`: zwykły tryb „Wyłącznik z pakietu premium” / „The premium-tier kill switch”, zombie „Lek” / „The cure”; kamienie: „Trop” / „A lead”, „Pierwsza wyprawa daleka” / „First long run”, „Laboratorium w mieście wojewódzkim” / „The lab in the regional capital”, „Warszawa” / „Warsaw”, „Lek w domu” / „The cure at home”. Wkrótce: „Wkrótce: dalekie wyprawy po lek.” / „Coming soon: long runs for the cure.”
- `ludnosc`: „Nowe osiedle” / „A new estate”; kamienie: „10 osób” / „10 people”, „25 osób” / „25 people”, „50 osób” / „50 people”, „Połowa celu” / „Halfway there”, „Cel przez 7 dni” / „Target held for 7 days”.
- `cuda`: „Cuda” / „Wonders”; kamienie: „Pierwszy cud” / „First wonder”, „Drugi cud” / „Second wonder”, „Trzeci cud” / „Third wonder”. Wkrótce: „Wkrótce: cuda z późnych badań.” / „Coming soon: wonders from late research.”

Kamień w kronice (`logGov`, `big: true`): „Droga „{nazwa drogi}”: {kamień}.” / „{nazwa drogi}: {kamień}.”

Epilog ludności, tekst: „Na podwórku znowu jest gwarno. Na klatkach wiszą grafiki dyżurów, dzieci mają swoją bandę, a ktoś już pisze regulamin trzepaka. Mieszka tu {ludzi} osób, a w 2021 roku, kiedy wszyscy zamawiali jedzenie przez aplikację, mieszkało {spis} (bez danych spisu: „Mieszka tu {ludzi} osób i nikt już nie zamawia jedzenia przez aplikację.”; liczebniki z odmianą).” / „The yard is noisy again. Rotas hang in the stairwells, the kids have their own gang, and someone is already drafting rules for the carpet rack. {people} people live here now; in 2021, back when everyone ordered food through an app, there were {census} (without census data: “{people} people live here now, and nobody orders food through an app any more.”).”

Zdanie ścieżki uchwał (`laws.path`), dopisane po tekście drogi: Porządek „Brama zamyka się o dwudziestej, a straż zna każdego nowego z imienia.” / „The gate shuts at eight and the watch knows every newcomer by name.”; Wspólnota „Każda klatka ma swoje zebranie i swoją kłótnię o grafik, ale nikt nie chce się wyprowadzać.” / „Every stairwell has its own meeting and its own row over the rota, but nobody wants to move out.”; Technokracja „Model z dysków banku układa grafiki co do minuty. Nikt nie pyta, kto go kontroluje.” / „The model from the bank’s disks plans the rotas to the minute. Nobody asks who controls it.”; bez ścieżki „Zarząd dalej się spiera, czy to już osada, czy jeszcze spółdzielnia.” / „The board is still arguing whether this is a settlement now or still a housing co-op.”

Okna: Menu „Drogi do zwycięstwa” / „Roads to victory”; tytuł ekranu dróg to samo; epilog kicker „Zwycięstwo” / „Victory”; przyciski „Graj dalej” / „Keep playing” i „Nowa gra” / „New game”; statystyki epilogu: „Dzień {n}”, „Ludzi: {n}”, „Zmarli: {n}”, „Uchwały: {n}” / „Day {n}”, „People: {n}”, „Deaths: {n}”, „Resolutions: {n}”.

---

### Task 1: Logika dróg i stan zwycięstwa w zarządzie

**Files:**
- Create: `src/gov/zwyciestwo.ts`
- Modify: `src/gov/typy.ts` (`GovState.zwyciestwo?`, `GovInput.ludnosc?`, `GovInput.ludnosc2021?`, `GovInput.teren?`, nowy wariant `Prompt`)
- Modify: `src/gov/zarzad.ts` (`govUpdate` woła krok zwycięstwa po `checkOver`; `pending` zwraca epilog przed raportem)
- Test: `tests/unit/zwyciestwo.test.ts`

**Interfaces:**
- Produces (dla zadań 2 i 3):
  - `export type Droga = 'technologia' | 'teren' | 'lek' | 'ludnosc' | 'cuda'`
  - `export interface StanZwyciestwa { kamienie: Partial<Record<Droga, number>>; wygrane: { droga: Droga; dzien: number; godzina: number }[]; dniCelu: number; ostatniDzien: number; epilog: Droga | null }`
  - `export interface PostepDrogi { droga: Droga; nazwa: Tx; kamienie: Tx[]; zaliczone: number; wkrotce: Tx | null; postep: { ile: number; cel: number } | null }`
  - `export function wlaczZwyciestwo(st: GovState): void` (idempotentne, `st.zwyciestwo ??= { kamienie: {}, wygrane: [], dniCelu: 0, ostatniDzien: 0, epilog: null }`)
  - `export function celLudnosci(i: Pick<GovInput, 'ludnosc2021'>, mode: GameMode): number`
  - `export function ludnoscOf(i: GovInput): number` (`i.ludnosc ?? i.people.length + (i.residents ?? 0)`)
  - `export function ocenDrogi(st: GovState, i: GovInput): PostepDrogi[]` (czysta, pięć wpisów w kolejności `technologia, teren, lek, ludnosc, cuda`)
  - `export function krokZwyciestwa(st: GovState, i: GovInput, fx: GovEffects): void` (nic, gdy `!st.zwyciestwo`)
  - `export function grajDalej(st: GovState): void` (`st.zwyciestwo.epilog = null`)
  - `GovInput.ludnosc?: number`, `GovInput.ludnosc2021?: number`, `GovInput.teren?: { przylaczone: number }`
  - `Prompt` dostaje `| { k: 'zwyciestwo'; droga: Droga }`
- Consumes: `logGov(st, i, txt, big, fx)` z `src/gov/wspolne.ts`, `tx` z `src/core/jezyk.ts`, `GameMode` z `src/gov/typy.ts`.

- [ ] **Step 1: Napisz testy `tests/unit/zwyciestwo.test.ts`**, na atrapie z `tests/unit/gov-atrapa.ts` (wejście z ludźmi i mieszkańcami):
  - `celLudnosci({}, 'zwykly') === 250`; `celLudnosci({ ludnosc2021: 1000 }, 'zwykly') === 500`; `({ ludnosc2021: 100 })` daje 120; `({ ludnosc2021: 600 })` daje 300; w `'zombie'` połowa po przycięciu (250 → 125, 120 → 60); dla `ludnosc2021: 0`, ujemnej i `NaN` wynik jak bez danych.
  - `ocenDrogi` bez `st.zwyciestwo` zwraca pięć dróg z `zaliczone` 0; `technologia`, `lek` i `cuda` mają `wkrotce` niepuste, `ludnosc` ma `postep: { ile, cel }`.
  - Bez `wlaczZwyciestwo` sto wywołań `govUpdate` nie tworzy `st.zwyciestwo` (skróty zarządu bez zmian).
  - Po `wlaczZwyciestwo`: przy 12 osobach krok zapisuje `kamienie.ludnosc = 1` i jeden wpis w `st.log` z tekstem kamienia; drugi krok przy tych samych danych nie dopisuje nic; przy 60 osobach zapisuje od razu 3 i jeden wpis na każdy nowy kamień; spadek do 5 osób nie zmniejsza `kamienie.ludnosc`.
  - Teren: `teren: { przylaczone: 1 }` zalicza `kamienie.teren = 1`; `wkrotce` terenu jest puste przed pierwszym kamieniem i niepuste po nim.
  - Licznik celu: przy ludności równej celowi zmiana dnia (`i.day` +1 przy `hour` ≥ 6) z nikim z `needs.food < 25` i `st.trust >= 50` zwiększa `dniCelu` o 1, raz na dobę; głodna osoba albo zaufanie 49 zeruje licznik; siódma doba ustawia `kamienie.ludnosc = 5`, dopisuje `wygrane` z dniem i godziną i `epilog = 'ludnosc'`.
  - `pending` z `epilog` zwraca `{ k: 'zwyciestwo', droga: 'ludnosc' }` przed raportem; po `grajDalej` zwraca to, co bez epilogu; kolejne kroki nie ustawiają epilogu tej samej drogi drugi raz.
  - Zapis i wczytanie (JSON w obie strony) w połowie licznika daje ten sam stan po kolejnych krokach.
- [ ] **Step 2: Uruchom `npm test -- tests/unit/zwyciestwo.test.ts`.** Oczekiwane: FAIL (brak modułu).
- [ ] **Step 3: Zaimplementuj `src/gov/zwyciestwo.ts` i zmiany w `typy.ts` i `zarzad.ts`.** Teksty z sekcji „Teksty”. Kamienie ludności: progi 10, 25, 50, `Math.ceil(cel / 2)`, a piąty to licznik `dniCelu` równy 7. Dzień gry liczy się raz na zmianę `i.day` (pole `ostatniDzien`), rano od 6:00. W `zarzad.ts` krok zwycięstwa po `checkOver` w `govUpdate`, tylko gdy `!st.over`; w `pending` epilog jako pierwszy warunek.
- [ ] **Step 4: Uruchom `npm test -- zwyciestwo`, potem `npm test` w całości i `npx biome check src tests tools index.html`.** Oczekiwane: PASS, istniejące skróty zarządu bez zmian.
- [ ] **Step 5: Commit** `git add src/gov/zwyciestwo.ts src/gov/typy.ts src/gov/zarzad.ts tests/unit/zwyciestwo.test.ts && git commit -m "Zwycięstwo: drogi, kamienie i droga ludnościowa w zarządzie"`.

### Task 2: Odczyt ludności i terenu z symulacji

**Files:**
- Modify: `src/sim/gov.ts` (`govInput()` wypełnia `ludnosc` i `teren`)
- Modify: `src/main.ts` tylko jeśli dane 2021 są pod ręką (opis w kroku 3)
- Test: `tests/unit/zwyciestwo-odczyt.test.ts`

**Interfaces:**
- Consumes: `GovInput.ludnosc`, `GovInput.teren`, `GovInput.ludnosc2021` z zadania 1.
- Produces: `govInput(sim)` z `ludnosc` = zarząd plus mieszkańcy pod zarządem (dziś: `people.length + residents`, ta sama liczba co `ludnoscOf` bez pola) i `teren.przylaczone` = liczba budynków, które wspólny płot dołączył do naszego obwodu (`SimState.plot`, stan z fali 2, opis w `docs/M2-fala-2.md` „Wspólny płot”).

- [ ] **Step 1: Napisz test** na `demoWorld('lanciego')` (jak testy płotu w `tests/unit/plot.test.ts`): przed płotem `govInput(sim).teren.przylaczone === 0`; po zbudowaniu wspólnego płotu wokół 10F (tym samym przebiegiem, co test płotu) `=== 1`; `ludnosc` równa `people.length + residents` z tego samego odczytu.
- [ ] **Step 2: Uruchom test.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj w `src/sim/gov.ts`.** Liczba przyłączonych budynków z istniejącego stanu płotu, bez nowych pól w `SimState`. `ludnosc2021`: przeszukaj `src/mieszkancy/` (gospodarstwa i osoby z 2021 roku na budynek); jeśli jest funkcja dająca osoby z 2021 dla budynków świata bez nowego pobierania, `main.ts` liczy sumę po budynkach mieszkalnych świata raz po starcie i podaje ją w `input()`; jeśli takiej nie ma, pole zostaje puste (cel 250) i wpis idzie do dziennika w zadaniu 4.
- [ ] **Step 4: `npm test`, `npm run bot` i `npm run bot:zombie`** (skróty z „Global Constraints”), Biome. Oczekiwane: PASS, skróty bez zmian.
- [ ] **Step 5: Commit** `git commit -m "Zwycięstwo: ludność i przyłączone budynki w odczycie dla zarządu"` (pliki jawnie).

### Task 3: Ekran dróg, epilog i włączenie w grze

**Files:**
- Create: `src/ui/zwyciestwo.ts`, `src/ui/zwyciestwo.css` (import jak `src/ui/miasto.css`)
- Modify: `src/ui/okna.ts` (`menuSheet`: przycisk `menu-zwyciestwo` pod „Jak grać”)
- Modify: `src/main.ts` (`wlaczZwyciestwo(gov)` obok `wlaczMiasto(gov)` dla nowej gry i wczytanego zapisu; `showPrompt` obsługuje `k: 'zwyciestwo'`; Menu otwiera ekran dróg; `window.zm.zwyciestwo()` zwraca `ocenDrogi(gov, input())`, a `window.zm.wygraj(droga)` ustawia w stanie wygraną i epilog tej drogi, tylko dla zrzutów)
- Test: `tests/unit/zwyciestwo-ui.test.ts`

**Interfaces:**
- Consumes: `PostepDrogi`, `ocenDrogi`, `grajDalej`, `Droga` z zadania 1; `Sheet`, `btn`, `esc` z `src/ui/okna.ts`.
- Produces: `export function drogiSheet(p: PostepDrogi[]): Sheet` i `export function epilogSheet(droga: Droga, path: LawPath | null, mode: GameMode, staty: { dzien: number; ludzi: number; zmarli: number; uchwaly: number }): Sheet`; przyciski `zw-dalej` i `zw-nowa`.

- [ ] **Step 1: Napisz testy** (Node, bez DOM, na samym HTML z `Sheet.body` i `Sheet.foot`): ekran dróg ma pięć wierszy w kolejności z zadania 1, przy drodze z `wkrotce` napis „Wkrótce: …”, przy ludności „{ile} z {cel}”; zaliczone kamienie mają klasę zaliczonego; epilog ludności ma tekst drogi i zdanie ścieżki dla każdej z czterech wartości `path`, statystyki i dwa przyciski; po angielsku (`ustawJezyk('en')`) żadnej polskiej litery w HTML.
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.** „Graj dalej”: `grajDalej(gov)`, potem `decided()` (zapis i następne okno). „Nowa gra”: `confirmSheet` jak przy usuwaniu zapisu, potem `startUrl()`; zapis zostaje. Ekran dróg zatrzymuje grę jak Menu, a zamknięcie wraca przez `nextPrompt`; `sheetAgain` rysuje oba okna od nowa po zmianie języka. Na telefonie (do 640 px) wiersze jeden pod drugim.
- [ ] **Step 4: `npm test`, Biome, `npm run build`.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** `git commit -m "Zwycięstwo: ekran dróg w Menu i epilog z „Graj dalej”"` (pliki jawnie).

### Task 4: Zrzuty, bot, dziennik i bramka

**Files:**
- Modify: `tools/shots.ts` (scenariusze), `tools/bot.ts` (flaga `--zwyciestwo`), `docs/POSTEP.md`

**Interfaces:**
- Consumes: `window.zm.zwyciestwo()`, `window.zm.wygraj(droga)` z zadania 3; `ocenDrogi`, `krokZwyciestwa`, `wlaczZwyciestwo` z zadania 1.

- [ ] **Step 1: Scenariusze w `tools/shots.ts`:** `zwyciestwo-drogi` (Przymorze, Menu, „Drogi do zwycięstwa”: pięć wierszy, ludność z liczbą), `zwyciestwo-drogi-telefon` (390×844, bez poziomego przewijania), `en-zwyciestwo-drogi` (bez polskich liter), `zwyciestwo-epilog` (`zm.wygraj('ludnosc')`, epilog, „Graj dalej” wraca do gry w tempie sprzed epilogu, epilog nie wraca po 2 s gry), `en-zwyciestwo-epilog-telefon`. Uruchom `npm run shots -- zwyciestwo` i obejrzyj każdy zrzut.
- [ ] **Step 2: Bot `--zwyciestwo`** (wzór: `--miasto` w `tools/bot.ts`): gracz fali 1 z `wlaczZwyciestwo` na 30 dni i ziarnach `GOV_SEEDS`, drukuje po dniach ludność, cel i zaliczone kamienie każdej drogi. Bez flagi skróty jak w „Global Constraints”.
- [ ] **Step 3: Pełna bramka:** `npm test`, `npm run lint` (w tym worktree działa jak w CI), `npm run build`, `npm run bot`, `npm run bot:zombie`, `npm run bot -- --zwyciestwo`, `npm run shots -- --dalej`.
- [ ] **Step 4: Dziennik.** Wpis w `docs/POSTEP.md` w „Zrobione” (co zbudowane, liczby bramki, co obejrzane, czy `ludnosc2021` jest z danych), decyzje z planu do przejrzenia w „Decyzjach”, w „Zaparkowanych” etapy 2–5 z projektu. Commit `git commit -m "Zwycięstwo, etap 1: dziennik i bramka"`.

## Self-review

- Pokrycie projektu (etap 1): zasady wspólne (epilog, „Graj dalej”, zapis zostaje, kronika) w zadaniach 1 i 3; ekran dróg z „Wkrótce” w zadaniu 3; droga ludnościowa z celem z danych 2021 albo 250, zombie połowa, 7 dni bez głodu przy zaufaniu 50 w zadaniach 1 i 2; teren do pierwszego kamienia w zadaniu 2; odcień ścieżki uchwał w zadaniu 3; bot i zrzuty w zadaniu 4. Etapy 2–5 projektu są poza tym planem.
- Nazwy spójne między zadaniami: `Droga`, `StanZwyciestwa`, `PostepDrogi`, `ocenDrogi`, `krokZwyciestwa`, `wlaczZwyciestwo`, `grajDalej`, `celLudnosci`, `ludnoscOf`, `drogiSheet`, `epilogSheet`, `zw-dalej`, `zw-nowa`, `menu-zwyciestwo`, `window.zm.zwyciestwo`, `window.zm.wygraj`.
