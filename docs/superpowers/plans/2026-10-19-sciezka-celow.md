# Ścieżka celów: plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cele prowadzą gracza od drugiego dnia do dróg do zwycięstwa: rozdziały R1–R8 po kolei (R3 z gałęzią `praca-ludzi`), okazje O1–O7 na zdarzenia w grze, po ostatnim rozdziale postęp dróg; do tego poprawki dzisiejszych celów, „Jak grać” i dróg do zwycięstwa.

**Architecture:** Ścieżka to czysty moduł interfejsu `src/ui/sciezka.ts`: definicje rozdziałów i okazji, krok (`krokSciezki`) i widok (`widokSciezki`) liczone z odczytu stanu gry (symulacja, odczyt `snapshot()`, stan zarządu, `govInput()`), bez DOM i bez zmian w symulacji i zarządzie. Stan ścieżki (`StanSciezki`) leży w zapisie interfejsu (`Save.cele` w `src/ui/zapis.ts`). `src/main.ts` woła krok co klatkę w `renderGoals`, rysuje okienko z widoku, zapisuje stan razem z grą i zgłasza zdarzenia interfejsu (lista ludzi, karta mieszkańca, karta budynku, ekran dróg). Pierwszy dzień zostaje w `goalsOf` (`src/ui/cele.ts`), a ścieżka bierze go jako R0.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`, importy z `.ts`), Vitest, Biome, Playwright przez `npm run shots`.

**Spec:** `docs/superpowers/specs/2026-10-19-sciezka-celow-design.md` (rozdziały, okazje, teksty, warunki, usterki U1–U17, pytania). Plan zakłada odpowiedzi z rekomendacji projektu; inna odpowiedź Mateusza zmienia tylko zadanie, którego dotyczy.

## Global Constraints

- Gałąź `sciezka-celow` od `pelna-gra` (na dziś 715df48; przed budową scalić aktualną `pelna-gra`). Commity lokalne po każdym zadaniu, nic nie wypychać.
- Symulacja i zarząd tylko czytane. Wyjątki: zadanie 3 dokłada pole wejścia `GovInput.teren.mozliwe` (zarząd tylko je czyta, stan zarządu się nie zmienia) i zadanie 14 (karta „Ślady”, po decyzji Mateusza). Poza zadaniem 14 skróty botów bez zmian: `npm run bot` da4b24e0 i po 3 dobach 3f3c816a, `npm run bot:zombie` c2eebe8d i 953b0a39 (skróty bazowe z dziennika na 19.10.2026; po scaleniu `praca-ludzi` i `wydarzenia` obowiązują te, które ogłoszą).
- `src/gov` nie importuje `src/sim`. Ścieżka może importować oba (jak `src/ui/cele.ts`).
- Stan ścieżki tylko w `Save.cele`; nowe pole opcjonalne, zły kształt to brak pola, `SAVE_VERSION` bez zmian. Bez `localStorage` poza zapisem gry.
- Każdy napis w obu językach (`L()`, `tx()`), angielski według `docs/SLOWNICZEK-EN.md` (planks, scrap, shambler, the board, the committee, stove watch, Night orders, supply run, Build, Work, Research board). Słowa miejsca ze słownika (`Words`, `WordsEn`): w domu komitet, furtka, dom; testy sprawdzają `FORBIDDEN_DOM` z `tests/unit/miejsce-pomoc.ts`. Liczby przez `src/ui/tekst.ts`. Bez pauz-myślników w tekstach.
- Komentarze po polsku, nagłówek każdego nowego pliku z kontraktem modułu; przy zmianie zachowania poprawić nagłówek starego.
- Testy w Node na prawdziwej symulacji: dema z `public/demo/` ze światem z ziarna adresu (`demoWorld` z `tests/unit/sasiedzi-pomoc.ts`), a tam, gdzie liczą się mieszkańcy z adresu, `swiatMieszkancow` z `tools/bot-mieszkancy.ts`. Każdy warunek celu sprawdzony dwa razy: fałsz przed czynnością, prawda po niej.
- Bramka zadania: `npm test -- <pliki zadania>`, `npx biome check src tests tools index.html`. Bramka zadań z interfejsem: zrzuty obejrzane w Chromium.

## Review Focus

1. Cel nie zalicza się sam z siebie: każdy warunek ma test „przed” i „po”, a cele z liczników „od otwarcia” nie łapią stanu sprzed otwarcia rozdziału.
2. Termin mają tylko R0 `drewno`, R1 `drewno2` i R1 `dyzur`; żaden inny cel nie przepada, żadna okazja nie przepada.
3. Każdy rozdział da się skończyć na trzech demach w obu trybach (bot ścieżki, zadanie 11); cel, którego na mapie nie ma (teren na Przymorzu, karta mieszkańca w domu bez mieszkańców), nie wchodzi do listy.
4. Zapis i wczytanie w środku rozdziału i w trakcie okazji dają ten sam widok; stary zapis bez `cele` rusza od R0 albo R1.
5. Zmiana języka przy otwartym okienku celów i przy linii celu w oknie rysuje wszystko od nowa, bez polskich liter po angielsku.
6. Okienko celów nie nachodzi na pasek, listę ludzi, kartę osoby i panel budowy (dzisiejsze sprawdzenia układu w `tools/shots.ts` i `tools/shots-lista.ts`), także z blokiem okazji na telefonie 390×844.

---

## Zadania, które nie zależą od innych gałęzi

### Task 1: Poprawki celów pierwszego i drugiego dnia

Usterki U1, U2, U3, U4, U5, U9, U10 z projektu.

**Files:**
- Modify: `src/ui/cele.ts` (teksty kroku `koza`, cel `drewno`, nocny tekst `noc` w zombie, lista najtańszych budowli, „a barricade”, helper drzewa w obrębie siatki)
- Modify: `src/gov/miejsce.ts` (`szukanie.jak` po polsku i po angielsku, dla bloku i domu)
- Modify: `src/main.ts` (`goalsOf` dostaje świat)
- Test: `tests/unit/cele-poprawki.test.ts` (nowy), poprawione przypięte teksty w `tests/unit/interfejs.test.ts`, `tests/unit/interfejs-a-en.test.ts`, `tests/unit/teksty-miejsca.test.ts`, `tests/unit/teksty-miejsca-en.test.ts`, `tests/unit/budowa-ui.test.ts`, `tests/unit/spotkanie-ui.test.ts`

**Interfaces:**
- Produces: `export function drzewoWObwodzie(st: SimState, w: World): boolean` (nieścięte drzewo, nie krzak i nie suche drzewo w trakcie samouczka, którego pień sąsiaduje z kafelkiem `w.fence.yard`); `goalsOf(st, gov, o)` z `o.w?: World` (bez świata podpowiedź jak dziś w zwykłym trybie); `najtanszeBudowle(st, n = 2): BuildKind[]` (odblokowane `isUnlocked`, z wolnym limitem `limitWhy` null, posortowane po sumie kosztu, remis po kolejności w `BUILDS`).
- Consumes: `isUnlocked`, `limitWhy`, `BUILDS` z `src/sim/budowle.ts`; `modeOf` z `src/sim/tryb.ts`; `trunkOf` z `src/sim/sim.ts`.

- [ ] **Step 1: Napisz testy w `tests/unit/cele-poprawki.test.ts`** na `demoWorld('przymorze' | 'lanciego' | 'zielonki')` w obu trybach:
  - podpowiedź `budowla` (dzisiejsze `goalsDay2`) nie zawiera nazwy żadnej budowli z `tech` i bez badań mówi „zasieki (złom 10) i ogródek (deski 14)”; po dopisaniu `t_grzyby` do `st.techDone` pieczarkarnia wchodzi do listy; `najtanszeBudowle(st, 5)` ma pracownię przed jej postawieniem, a po postawieniu (limit 1) już nie;
  - nocny tekst `noc` (godzina 22) w trybie zombie nie ma „Szabrownicy” ani „Looters”, ma „Stado” i „herd”; w zwykłym bez zmian;
  - tekst `drewno` to „Przygotujcie drewno na wieczór.” / “Get wood in for the evening.”, podpowiedź mówi „ogień do snu” i „najpierw do kozy”; w zombie na Przymorzu i na Lanciego po samouczku (suche drzewo ścięte) podpowiedź ma „Spalić” i nie ma „Ściąć drzewo”, w Zielonkach (drugie drzewo w ogrodzie) ma „Ściąć drzewo”; `drzewoWObwodzie` daje to samo;
  - podpowiedź przeszukania (blok i dom, mysz i dotyk, PL i EN) zaczyna się od zaznaczenia osoby („Zaznaczcie kogoś”, „Stuknijcie kogoś”, “Select someone”, “Tap someone”) i ma „Przeszukać …” / “Search the …”;
  - angielski cel obwodu ma „a barricade”, nie „a Barricade”;
  - krok `koza` kończy się „Kto ma drewno, dołoży też sam.” / “Whoever has wood will also feed it on their own.”.
- [ ] **Step 2: Uruchom `npm test -- tests/unit/cele-poprawki.test.ts`.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj** teksty z projektu (sekcje „R0”, „Przegląd” U1–U5, U9, U10). `goalsDay2` dostaje listę z `najtanszeBudowle`. Przypięte teksty w sześciu starych testach popraw tak, żeby sprawdzały nowe brzmienie (nie usuwaj asercji).
- [ ] **Step 4: `npm test`, `npx biome check src tests tools index.html`.** Oczekiwane: PASS; skróty botów bez zmian (`npm run bot -- 1 3` szybki przebieg: ten sam skrót co na bazie).
- [ ] **Step 5: Commit** `git add src/ui/cele.ts src/gov/miejsce.ts src/main.ts tests/unit/cele-poprawki.test.ts tests/unit/interfejs.test.ts tests/unit/interfejs-a-en.test.ts tests/unit/teksty-miejsca.test.ts tests/unit/teksty-miejsca-en.test.ts tests/unit/budowa-ui.test.ts tests/unit/spotkanie-ui.test.ts && git commit -m "Cele: budowle bez badań, noc zombie ze stadem, drewno na wieczór, przeszukanie od zaznaczenia"`.

### Task 2: „Jak grać” bez sprzeczności i drobne napisy

Usterki U11, U12, U16 (bez pary „Zapytać o rękę”, która jest w zadaniu 12) i U17.

**Files:**
- Modify: `src/ui/okna.ts` (`helpSheet`: liczba osób, siatka w zombie, broń w zwykłym trybie, „Na razie”, sekcje „Poza siatką” i „Badania”)
- Modify: `src/main.ts` (`helpSheet` dostaje liczbę osób zarządu na starcie gry: pionki `core` z `st.people` sprzed pierwszego przyjęcia, czyli `opcje.core` albo długość drużyny)
- Modify: `src/ui/wyprawa.ts:129` („Send a supply run” jak na karcie miejsca), `src/ui/karta.ts:58-64` (ugryzienie bez „w rękę” albo „w rękę albo nogę”), `docs/SLOWNICZEK-EN.md` (zakładki budowy „Home, Yard, Perimeter”, jak w grze)
- Test: `tests/unit/pomoc.test.ts` (nowy), poprawione `tests/unit/teksty-miejsca.test.ts` i `tests/unit/teksty-miejsca-en.test.ts` (zdanie „W wersji 0.4 są …”), `tests/unit/interfejs-zombie.test.ts`, `tests/unit/karta.test.ts`, testy okna planu wyprawy (`tests/unit/` z „wyprawa” w nazwie)

**Interfaces:**
- Produces: `helpSheet(touch, zombie, words, e, opts?: { osob?: number })`; bez `opts` „cztery osoby” jak dziś, żeby stare wywołania w testach działały.
- Consumes: `START_KIT` z `src/sim/bron.ts` (co ma kto na starcie, żeby zdanie o broni nie rozjechało się z danymi).

- [ ] **Step 1: Testy w `tests/unit/pomoc.test.ts`:** przy `osob` 1, 3 i 5 zdanie o zarządzie ma tę liczbę słownie z odmianą („Jedna osoba”, „Trzy osoby”, „Pięć osób” / “One person”, “Three people”, “Five people”); w trybie zombie nie ma „dziurawa siatka” ani “full of holes”; w zwykłym zdanie o broni wymienia siekierę w rękach i nóż i łom w magazynie zgodnie z `START_KIT.zwykly` (test czyta `START_KIT`, nie wpisuje nazw na sztywno); „Na razie” nie mówi, że badań i zimy nie ma; są „Mapa miasta” z klawiszem M, „Badania” z klawiszem T, sąsiedzi („Zapukać”), handlarz, wędrowiec („Zagadać”) i „Drogi do zwycięstwa”; po angielsku żadnej polskiej litery; w domu bez słów z `FORBIDDEN_DOM`. Do tego: przycisk w oknie planu wyprawy ma to samo angielskie brzmienie co na karcie miejsca; karta osoby ugryzionej w kończynę (`limb`; symulacja nie odróżnia ręki od nogi) mówi „w rękę albo nogę” / “on an arm or a leg”.
- [ ] **Step 2: `npm test -- tests/unit/pomoc.test.ts`.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.** Nowe zdania krótkie, po jednym na mechanikę, etykiety jak w menu. „Na razie”: „W wersji 0.4 są noce za siatką, budowa, {szukanie.wersja}, sąsiedzi, mapa miasta, badania w pracowni, drogi do zwycięstwa i tryb zombie. Prąd w erach 3–6 i reszta gospodarki przyjdą później.” / “Version 0.4 has nights behind the fence, building, {searching}, neighbours, the city map, research, roads to victory and Zombie mode. Power in eras 3–6 and the rest of the economy will come later.”
- [ ] **Step 4: `npm test`, Biome.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** (pliki jawnie) `git commit -m "Jak grać: liczba osób z gry, siatka w zombie, broń na starcie, mapa, sąsiedzi i badania; drobne napisy"`.

### Task 3: Drogi do zwycięstwa bez niemożliwego „co dalej”

Usterka U14; to samo pole daje zapasowy warunek celu R8 `teren`.

**Files:**
- Create: nic; helper w `src/sim/sasiedzi.ts` (obok `plotDla`)
- Modify: `src/gov/typy.ts` (`GovInput.teren.mozliwe?: number`), `src/sim/gov.ts` (`govInput` wypełnia `teren.mozliwe`), `src/gov/zwyciestwo.ts` (`wkrotceDrogi`, `DALEJ_TEREN`, `DALEJ_TECHNOLOGIA` ze słowem miejsca)
- Test: `tests/unit/zwyciestwo-odczyt.test.ts`, `tests/unit/zwyciestwo.test.ts`, `tests/unit/zwyciestwo-ui.test.ts`

**Interfaces:**
- Produces: `export function doOtoczenia(w: World): number` w `src/sim/sasiedzi.ts`: ile budynków z drzwiami na zewnątrz do 150 m od pierwszych drzwi siedziby da się otoczyć wspólnym płotem (`wspolnyPlot(w, w.fenceBaza ?? w.fence, drzwi, new Set()).ok`), liczone raz na świat (`WeakMap`), bez losowania; `GovInput.teren = { przylaczone, mozliwe }`.
- Consumes: `drzwiBudynku`, `wspolnyPlot`.

- [ ] **Step 1: Testy:** `doOtoczenia` na demach daje Przymorze 0, Lanciego 4, Zielonki 5 (liczby z projektu, sondą na 715df48; jeśli generator świata zmienił się po scaleniu, test pisze się na aktualne liczby, ale Przymorze ma zostać 0, a dwa pozostałe więcej niż 0); `ocenDrogi` przy `teren: { przylaczone: 0, mozliwe: 0 }` daje dla terenu `dalej` null i „Wkrótce: wspólny płot przez jezdnię.” / “Coming soon: a shared fence across the road.”; przy `mozliwe` 4 jak dziś; `DALEJ_TECHNOLOGIA` w domu mówi „w pokoju waszego domu”, w bloku jak dziś; drugie wywołanie `doOtoczenia` na tym samym świecie nie liczy od nowa (licznik wywołań `wspolnyPlot` w atrapie albo czas).
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.** Zdania dróg w obu językach, słowo miejsca z `wordsOf(placeIn(i)).lokal.d`. Kamień terenu liczy się dalej z `przylaczone`.
- [ ] **Step 4: `npm test`, Biome, `npm run bot` i `npm run bot:zombie`.** Oczekiwane: PASS, skróty bez zmian (zarząd tylko czyta nowe pole).
- [ ] **Step 5: Commit** `git commit -m "Drogi do zwycięstwa: teren bez „co dalej” tam, gdzie każdy sąsiad stoi za jezdnią"`.

### Task 4: Stan ścieżki w zapisie

Usterka U6 i fundament ścieżki.

**Files:**
- Create: `src/ui/sciezka.ts` (na razie typy, stan na start, odczyt z zapisu, zdarzenia interfejsu)
- Modify: `src/ui/zapis.ts` (`Save.cele?`, `readSave` sprawdza kształt), `src/main.ts` (zmienna stanu, zapis, wczytanie, nowa gra, `woodReady` i `woodReady2` przeniesione do stanu)
- Test: `tests/unit/sciezka-zapis.test.ts`, uzupełnione testy zapisu w `tests/unit/interfejs.test.ts` i `tests/unit/pietra-zapis.test.ts` (kształt `Save` z nowym polem)

**Interfaces:**
- Produces: `export type KluczRozdzialu = 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6' | 'r7' | 'r8' | 'koniec'`; `export type KluczOkazji = 'o1' | 'o2' | 'o3' | 'o4' | 'o5' | 'o6' | 'o7'`; `export interface StanSciezki` (pola jak w projekcie, sekcja „Stan i zapis”); `export function nowyStanSciezki(): StanSciezki`; `export function stanZZapisu(raw: unknown, st: SimState, gov: GovState | null): StanSciezki` (zły kształt albo brak: R0 bez raportu, inaczej R1 od `st.tick`); `export function zdarzenieUi(s: StanSciezki, k: 'lista' | 'mieszkaniec' | 'budynek' | 'drogi', tick: number): StanSciezki`; `export function zalicz(s: StanSciezki, klucz: string, tick: number): StanSciezki`.
- Consumes: `Save` z `src/ui/zapis.ts`.

- [ ] **Step 1: Testy:** zapis z `cele` przechodzi przez `writeSave` i `readSave` bez zmian; zapis bez `cele` wczytuje się jak dziś; `cele` o złym kształcie (liczba, tablica, `zrobione` z wartością tekstową) daje zapis bez pola, nie odrzuca całego zapisu; `stanZZapisu` bez pola daje R0 przy `gov.reports.length === 0` i R1 przy jednym raporcie; `zdarzenieUi` i `zalicz` nie zmieniają wejścia (zwracają nowy obiekt); zaliczenie drewna na wieczór trzyma się po wczytaniu zapisu, w którym zapasu drewna już nie ma (dzisiejszy błąd U6: test na prawdziwej symulacji Przymorza, zapas 3 po samouczku, zapis, koza zjada drewno, wczytanie, cel dalej zaliczony).
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.** W `main.ts` stan ścieżki obok `gov`: nowy przy nowej grze, z zapisu przy wznowieniu, do `Save.cele` w `save()`. `goalsOf` dostaje `woodReady` z `s.zrobione['r0.drewno']`.
- [ ] **Step 4: `npm test`, Biome, `npm run build`.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** `git commit -m "Ścieżka celów: stan w zapisie interfejsu, drewno na wieczór nie przepada po przeładowaniu"`.

### Task 5: Silnik ścieżki, R0 i R1

**Files:**
- Modify: `src/ui/sciezka.ts` (definicje, krok, widok, R0 z `goalsOf`, R1)
- Modify: `src/ui/cele.ts` (zostaje `goalsOf`, `currentGoal`, `markTree`, `NIGHT_WOOD`; `goalsDay2`, `isDay2` i `DAY2_WOOD` przechodzą do R1 i znikają)
- Modify: `src/main.ts` (`renderGoals` z widoku ścieżki, na razie bez okazji i bez linii w oknach)
- Test: `tests/unit/sciezka.test.ts` (zasady na stanie z atrapy), `tests/unit/sciezka-r1.test.ts` (R1 na demach w obu trybach), przeniesione testy drugiego dnia z `tests/unit/budowa-ui.test.ts`, `tests/unit/styk-m2-zombie.test.ts`, `tests/unit/spotkanie-ui.test.ts`, `tests/unit/teksty-miejsca.test.ts`, `tests/unit/teksty-miejsca-en.test.ts`, `tests/unit/interfejs-a-en.test.ts`; `tests/unit/zarzad.test.ts:522` sprawdza teraz, że R1 liczy potrzebę jak `nightWood`
- Create: `tests/unit/sciezka-pomoc.ts` (gra demo, odczyt, kroki z zarządem co sekundę i odpowiedziami na okna)

**Interfaces:**
- Produces:
  - `export interface OdczytCelow { st: SimState; w: World; snap: SimSnapshot; gov: GovState | null; input: GovInput | null; touch: boolean; words: Words; wordsEn: WordsEn }`
  - `export interface DefCelu { key: string; jest?(o): boolean; tekst(o): string; jak(o): string; zrobiony(o, s: StanSciezki): boolean; czeka?(o): string | null; przepadl?(o, s): boolean; okno?: 'karta' | 'uchwala' | 'tablica' | 'spotkanie' }`
  - `export interface DefRozdzialu { k: KluczRozdzialu; tytul(o): string; jest?(o): boolean; cele: readonly DefCelu[] }`, `export const ROZDZIALY: readonly DefRozdzialu[]`
  - `export interface Cel { key: string; text: string; how: string; done: boolean; missed?: boolean; czeka?: string; okno?: DefCelu['okno'] }`
  - `export interface WidokSciezki { okazja: { tytul: string; cele: Cel[]; biezacy: Cel | null } | null; rozdzial: { k: KluczRozdzialu; tytul: string; cele: Cel[]; biezacy: Cel | null } | null; drogi: { nazwa: string; dalej: string; postep: string | null }[] | null }`
  - `export function krokSciezki(s: StanSciezki, o: OdczytCelow): StanSciezki` (zalicza i oznacza przepadłe cele widocznego rozdziału, otwiera następny rozdział z licznikami `start`, nie zmienia wejścia)
  - `export function widokSciezki(s: StanSciezki, o: OdczytCelow): WidokSciezki`
- Consumes: `goalsOf`, `currentGoal` z `src/ui/cele.ts`; `KOZA_KEY`, `WOOD_PER_HOUR` z `src/gov/noc.ts`; `snapshot`, `govInput`.

- [ ] **Step 1: Testy zasad (`tests/unit/sciezka.test.ts`):** rozdział otwiera się dopiero po zrobieniu albo przepadnięciu wszystkich celów poprzedniego; R1 otwiera się po zamknięciu pierwszego raportu, nie przy samym raporcie; bieżący cel to pierwszy niezrobiony, który nie czeka; cel czekający ma dopisek i nie jest bieżący; cel z terminem przepada, inne nie; zaliczenie jest trwałe (warunek wraca do fałszu, cel zostaje); cel z `jest` fałszywym nie wchodzi do listy i nie blokuje rozdziału; liczniki `start` zapisują się przy otwarciu.
- [ ] **Step 2: Testy R1 (`tests/unit/sciezka-r1.test.ts`)** na Przymorzu, Lanciego i Zielonkach w obu trybach, z graczem w pomocniku (zaznaczenie i suche drzewo, odpowiedzi na okna jak `answer` w `tests/unit/gov-play.ts`):
  - po pierwszym raporcie R1 ma w zwykłym trybie klucze `przeszukaj`, `budowla`, `obwod`, `drewno2`, `dyzur`, a w zombie `dzida` zamiast `obwod`;
  - `przeszukaj` fałsz przed poleceniem `search` i prawda po przeszukanym pomieszczeniu; to samo po pomieszczeniu u sąsiada (dzisiejszy test ze `spotkanie-ui`);
  - `budowla` po gotowych zasiekach; `obwod` po zasiekach albo przy zerze dziur; `dzida` po `craft`;
  - `drewno2` przy karcie nocy: zapas równy potrzebie z karty (`gov.night.card.wood`) zalicza, o jedną sztukę mniej daje „przepadł” po zatwierdzeniu; postęp przed kartą pokazuje „{n} z {potrzeba}” z tą samą potrzebą, którą karta pokaże o 20:00 (także z kozą z beczki: dwa paleniska, potrzeba 20);
  - `dyzur` czeka do 20:00, zalicza się przy zatwierdzeniu karty z `warta:koza`, przepada przy zatwierdzeniu bez niego;
  - teksty bez polskich liter po angielsku i bez słów z `FORBIDDEN_DOM` w domu.
- [ ] **Step 3: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 4: Zaimplementuj** silnik i R0, R1 z projektu. R0 to `goalsOf` opakowany w rozdział (zaliczenia `drewno` w stanie ścieżki). `renderGoals` w `main.ts` buduje `OdczytCelow`, woła `krokSciezki`, rysuje rozdział tak jak dziś dzień (nagłówek z tytułem i licznikiem, lista, podpowiedź pod bieżącym, `missed` przekreślony) i dopisek celu czekającego.
- [ ] **Step 5: `npm test`, Biome, `npm run build`, `npm run shots -- m1-cele m1-drewno-na-noc wydarzenia-dom-dzien2`.** Oczekiwane: PASS, zrzuty obejrzane (pierwszy dzień bez zmian w wyglądzie, drugi dzień z pięcioma celami).
- [ ] **Step 6: Commit** `git commit -m "Ścieżka celów: silnik rozdziałów, pierwszy i drugi dzień z drewnem i dyżurem jak na karcie nocy"`.

### Task 6: Okienko celów, okazje w interfejsie i linia celu w oknach

**Files:**
- Modify: `src/ui/sciezka.ts` (czysta funkcja HTML okienka: `celeHtml(widok, { otwarte, touch })`)
- Modify: `src/main.ts` (`renderGoals` z `celeHtml`; zdarzenia interfejsu: `wybierz` listy ludzi i klawisze Q, E, `residentFocus`, `budFocus`, `showDrogi`; linia celu w oknach; `window.zm.cele()` i `window.zm.rozdzial(k)`)
- Modify: `src/ui/okno.ts` (`Sheet.cel?: string` rysowane pod tytułem), `src/ui/okna.ts` (typ `Sheet`), `src/ui/badania.ts` (linia celu w nagłówku tablicy), `src/style.css` (blok okazji, cel czekający, linia celu)
- Test: `tests/unit/sciezka-ui.test.ts`

**Interfaces:**
- Produces: `export function celeHtml(v: WidokSciezki, o: { otwarte: boolean; touch: boolean }): string`; `export function celWOknie(v: WidokSciezki, okno: 'karta' | 'uchwala' | 'tablica' | 'spotkanie'): string | null` (tekst bieżącego celu okazji albo rozdziału z tym `okno`); `Sheet.cel?: string`.
- Consumes: `WidokSciezki` z zadania 5.

- [ ] **Step 1: Testy HTML (Node, bez DOM):** blok okazji stoi przed nagłówkiem rozdziału i ma „Teraz:” / “Now:”; cel czekający ma klasę i dopisek; zwinięte na telefonie pokazuje bieżący cel okazji, a bez okazji bieżący cel rozdziału; widok `drogi` (po R8) to wiersze „{nazwa}: {dalej}” z postępem; `celWOknie` daje tekst tylko dla celu z pasującym `okno`; po angielsku bez polskich liter; atrybuty i teksty przez ucieczkę HTML.
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.** Linia celu: `nightSheet`, `lawSheet`, `spotkanieSheet` dostają ją przez `Sheet.cel` w `main.ts` (bez zmian w ich sygnaturach), tablica badań w nagłówku obok „Gra stoi”. Zdarzenia interfejsu idą przez `zdarzenieUi` z tickiem symulacji.
- [ ] **Step 4: `npm test`, Biome, `npm run build`, `npm run shots -- lista m1-cele`.** Oczekiwane: PASS, sprawdzenia układu listy ludzi i celów bez zmian.
- [ ] **Step 5: Commit** `git commit -m "Okienko celów: okazje nad rozdziałem, cele czekające, linia celu w oknach"`.

### Task 7: Rozdziały R2, R4 i R5

**Files:**
- Modify: `src/ui/sciezka.ts` (R2 `sily`, `ognisko` albo `dzgnij`, `uzbrojeni` albo `dzidy`; R4 `uchwala`, `wkurzenie`, `nowi`, `ludzie`; R5 `wyprawa`, `lup`, `ogrodek`)
- Test: `tests/unit/sciezka-r2-r5.test.ts`

**Interfaces:**
- Consumes: `ludnoscOf` z `src/gov/zwyciestwo.ts`; `gov.evening.campfire`, `gov.laws.signed`, `gov.reports[].dAnger`, `gov.wyprawy`, `gov.miasto.zabrano`; `snap.people[].weapon`, `snap.lokatorzy`; `job.t === 'fight'` z `job.order` na pionku `zombie`; zdarzenia `lista`, `mieszkaniec`, `budynek`; `wyslijWyprawe` z `src/gov/dzienne.ts` i `okolicaZGeo` z `tests/unit/miasto-play.ts` w testach.

- [ ] **Step 1: Testy** na demach (R4 `ludzie` w bloku na świecie z mieszkańcami z `swiatMieszkancow`), dla każdego celu fałsz przed i prawda po:
  - R2: `sily` po `zdarzenieUi('lista')` od otwarcia rozdziału (zdarzenie sprzed otwarcia nie liczy się); `ognisko` po poleceniu `campfire` i godzinie 18:00 (zwykły), w zombie celu nie ma; `dzgnij` po poleceniu `attack` na szwendaczu przez siatkę osobą z dzidą (zombie, `?stado` z `sim.spawnAtFence`); `uzbrojeni` po poleceniu `arm` z nożem; przy jednej osobie w zarządzie od razu; `dzidy` po karcie nocy z dwoma przydziałami `warta:siatka` u osób z dzidą (druga dzida przez `arm`), z jedną dzidą nie;
  - R4: `uchwala` czeka do 19:30 i zalicza się po podpisie; podpis sprzed otwarcia rozdziału się nie liczy; `wkurzenie` po raporcie z `dAnger < 0`, raport z `dAnger >= 0` nie zalicza; `nowi` po przyjęciu przez kartę wydarzenia (`fx.join` albo `fx.residents` z `applyGov`) i po zaproszeniu sąsiadów; `ludzie` w bloku z mieszkańcami po `mieszkaniec`, w Zielonkach (bez mieszkańców) wariant z kartą budynku po `budynek`;
  - R5: `wyprawa` po `wyslijWyprawe` do miejsca z okolicy o 9:00 (Przymorze, Lanciego, Zielonki: miejsca poza mapą osiedla), `lup` po powrocie z łupem; `ogrodek` po gotowym ogródku; w trybie zombie podpowiedź wyprawy ma dopisek o szwendaczach.
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj** definicje z projektu, teksty w obu językach, słowa miejsca.
- [ ] **Step 4: `npm test`, Biome.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** `git commit -m "Ścieżka celów: ludzie i noc, zarząd, jedzenie i wyprawy"`.

### Task 8: Rozdziały R6, R7, R8 i widok po ostatnim rozdziale

**Files:**
- Modify: `src/ui/sciezka.ts` (R6 `pracownia`, `badanie`, `stol`, `odkrycie`, `era2`; R7 `pukanie`, `spotkanie`, `wejscie`, `szaber`; R8 `drogi`, `ludnosc`, `teren`; widok `drogi` po R8)
- Test: `tests/unit/sciezka-r6-r8.test.ts`

**Interfaces:**
- Consumes: `st.research` (`cur`, `prog`, `at`), `TECH_BY` z `src/sim/badania.ts`; `st.sasiedzi` (`nr`, `budynki[].otwarty`, `przeszukane`, `mieszkania[].przeszukane`, `pietra`), praca `door` z `what === 'knock'`; `ocenDrogi` z `src/gov/zwyciestwo.ts`, `gov.zwyciestwo.kamienie`, `GovInput.teren.mozliwe` z zadania 3; `doorWhere` z `tests/unit/sasiedzi-pomoc.ts` w testach.

- [ ] **Step 1: Testy** na demach:
  - R6: `pracownia` po gotowej pracowni (postawiona przed otwarciem rozdziału zalicza od razu); `badanie` po poleceniu `research`; `stol` po `study` i godzinie przy stole; `odkrycie` po ukończeniu technologii; `era2` po postępie w technologii z ery 2 (po `t_okna` dostępne `t_spawanie`); linia celu `badanie` na tablicy;
  - R7: `pukanie` po poleceniu `knock` na najbliższych drzwiach (`doorWhere`) na trzech demach; `spotkanie` po spotkaniu (`st.sasiedzi.nr` rośnie); `wejscie` po otwartych albo wyważonych drzwiach budynku; `szaber` po `loot` w otwartym budynku; w trybie zombie podpowiedzi mają dopisek o szwendaczach i hałasie;
  - R8: `drogi` po `zdarzenieUi('drogi')`; `ludnosc` mówi to samo co `ocenDrogi` (`dalej`, `postep`) i zalicza się po kolejnym kamieniu; `teren` jest na liście w Lanciego i w Zielonkach, a na Przymorzu go nie ma; po R8 widok `drogi` ma ludność (i teren tam, gdzie można), bez technologii z „Wkrótce”, a gdy żadna droga nie ma `dalej`, widok jest pusty.
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.**
- [ ] **Step 4: `npm test`, Biome.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** `git commit -m "Ścieżka celów: badania, sąsiedzi, drogi do zwycięstwa i postęp dróg po ostatnim rozdziale"`.

### Task 9: Okazje O1.1 i O2–O7

**Files:**
- Modify: `src/ui/sciezka.ts` (`OKAZJE`, otwieranie i zamykanie okazji w `krokSciezki`, okazja w `widokSciezki`)
- Test: `tests/unit/sciezka-okazje.test.ts`

**Interfaces:**
- Produces: `export interface DefOkazji { k: KluczOkazji; tytul(o): string; trwa(o, s): boolean; cel?(o): number; cele: readonly DefCelu[] }`, `export const OKAZJE: readonly DefOkazji[]`; w stanie `StanSciezki.okazja` (klucz, tick otwarcia, zabici przy otwarciu, pionek albo rzecz).
- Consumes: pionki `wedrowiec` (faza 1, `what === 'zagadany'`), `st.obcy` (`trader`, `offers[].left`, `OFFER_TIMES` z `src/sim/handlarz.ts`), `snap.raid` (`phase`, `outcome`), `alarmOn` z `src/sim/sim.ts`, `snap.zombies.pressing`, `st.tally.killed`, `snap.people[].bite` i `maimed`, rzeczy `zwloki` (`fuel`), pionki `obcy` z pracą `scavenge`, praca `wreck`.

- [ ] **Step 1: Testy** (zwykły i zombie, Przymorze i Zielonki):
  - okazje nie otwierają się przed końcem kroków samouczka;
  - O1: wędrowiec pierwszego przyjścia (polecenie `obcy` i czas do drugiego dnia 8:00–12:00) otwiera okazję; `zagadaj` po `talk`; okazja zamyka się, gdy wędrowiec odchodzi; niezrobiony cel wraca z następnym wędrowcem, zrobiony nie;
  - O2: handlarz pod bramą drugiego dnia otwiera okazję, `wymiana` po `trade` z wystarczającym materiałem; w trybie zombie nie przed czwartym dniem;
  - O3: napad z polecenia `raid` (jak w `tests/unit/night.test.ts:459`) w fazie 1 otwiera okazję; `alarm` po poleceniu `alarm`; `odparty` po napadzie odpartym, przy wtargnięciu nie;
  - O4: noc i co najmniej trzech napierających (`spawnAtFence`) otwiera okazję; `alarm`; `zabici` po trzech zabitych od otwarcia (zabici wcześniej się nie liczą);
  - O5: ugryzienie w kończynę z możliwą amputacją otwiera okazję z imieniem; `amputacja` po udanym `amputate` (ziarno, przy którym się udaje); po upływie okna okazja się zamyka bez zaliczenia;
  - O6: zwłoki z `fuel > 0` otwierają; `dobic` po `finish`; zwłoki, które wstały, zamykają okazję bez zaliczenia;
  - O7: obca ekipa przy wraku otwiera; `wrak` po poleceniu `wreck` zarządu, a znacznik w `st.wraki` od ekipy nie zalicza;
  - dwie okazje naraz: widać jedną, w ustalonej kolejności (O5, O6, O4, O3, O2, O1, O7: najpierw życie, potem goście), druga czeka.
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.**
- [ ] **Step 4: `npm test`, Biome.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** `git commit -m "Ścieżka celów: okazje (wędrowiec, handlarz, napad, stado, ugryzienie, zwłoki, wrak)"`.

### Task 10: Zrzuty

**Files:**
- Create: `tools/shots-cele.ts` (scenariusze, jak `tools/shots-lista.ts`)
- Modify: `tools/shots.ts` (import i jedna linia w liście)

**Interfaces:**
- Consumes: `window.zm.cele()`, `window.zm.rozdzial(k)`, `window.zm.ff(minuty)`, `window.zm.sim` (ustawienie stanu do okazji, jak dzisiejsze scenariusze).

- [ ] **Step 1: Scenariusze** (każdy sam sprawdza tekst `#goals` i to, że okienko nie nachodzi na pasek, listę ludzi, kartę osoby i panel budowy): `cele-r1` (Przymorze, drugi dzień po raporcie, 1440×900), `cele-r1-dom` (Zielonki), `cele-r1-zombie`, `cele-karta-nocy` (linia celu „Dajcie komuś dyżur przy kozie” w oknie karty nocy), `cele-czeka` (cel czekający przyciemniony), `cele-okazja-handlarz` (zwykły, drugi dzień 11:00), `cele-okazja-ugryzienie` (zombie, ugryzienie w rękę ustawione w stanie), `cele-r6-tablica` (linia celu na tablicy badań), `cele-drogi` (`zm.rozdzial('koniec')`, wiersze dróg), `cele-telefon` (390×844, okazja i rozdział zwinięte), `en-cele-r1` (bez polskich liter).
- [ ] **Step 2: `npm run shots -- cele`** i obejrzyj każdy zrzut w `shots/`.
- [ ] **Step 3: Commit** `git commit -m "Zrzuty ścieżki celów"`.

### Task 11: Bot ścieżki

**Files:**
- Create: `tools/bot-cele.ts`
- Modify: `package.json` (`"bot:cele": "node tools/bot-cele.ts"`)

**Interfaces:**
- Consumes: `krokSciezki`, `widokSciezki`; `m2Player` (przeszukiwanie, budowa, badania) z `tests/unit/m2-play.ts`, `sasiedziPlayer` z `tests/unit/sasiedzi-play.ts`, `miastoPlayer` i `okolicaZGeo` z `tests/unit/miasto-play.ts`, `swiatMieszkancow` z `tools/bot-mieszkancy.ts`.

- [ ] **Step 1: Gracz według podpowiedzi:** bot czyta bieżący cel ścieżki i robi to, co mówi jego podpowiedź (polecenie z menu albo zdarzenie interfejsu), a przy oknach zarządu odpowiada jak `answer` z `tests/unit/gov-play.ts` z dyżurem przy kozie i dwiema dzidami, gdy cel o to prosi. W trybie zombie drewno tylko z mebli, z drzew w obrębie siatki i z wypraw.
- [ ] **Step 2: Wyjście:** dla każdego dema i trybu (sześć przebiegów, 10 dni, ziarno z adresu) dzień i godzina otwarcia i końca każdego rozdziału, cele przepadłe, cele okazji z godziną; na końcu tabela. Kod wyjścia 1, gdy któryś rozdział nie skończył się w 10 dniach (gra przegrana też się liczy jako niepowodzenie, z przyczyną w wyjściu).
- [ ] **Step 3: `npm run bot:cele`** i zapisz wynik w dzienniku (zadanie 15). Jeśli rozdział nie kończy się na którejś mapie, popraw cel albo zapasowy warunek w projekcie i w kodzie, nie bota.
- [ ] **Step 4: Commit** `git commit -m "Bot ścieżki celów na trzech demach w obu trybach"`.

---

## Zadania, które zależą od gałęzi `praca-ludzi`

Wykonać po scaleniu `praca-ludzi` do `pelna-gra` i scaleniu `pelna-gra` do tej gałęzi.

### Task 12: Rozdział R3 i werbunek w okazji wędrowca

**Files:**
- Modify: `src/ui/sciezka.ts` (R3 `priorytet`, `stale`, `zapas`, `zasiatke`; O1.2 `reka`, O1.3 `zapros`; dopisek o wędrowcach w R8 `ludnosc`)
- Modify: `src/main.ts` (zdarzenie interfejsu przy otwarciu panelu Pracy niepotrzebne: warunki czytają `st.praca`)
- Test: `tests/unit/sciezka-praca.test.ts`, uzupełniony `tests/unit/sciezka-okazje.test.ts`

**Interfaces:**
- Consumes: `st.praca` (`osoby[*].prio`, `stale`, `zaSiatke`, `progi`) i polecenia ustawień z `src/sim/praca.ts`; praca `zapros` z `what` `'zapros'` albo `'reka'`.

- [ ] **Step 1: Testy:** R3 jest na ścieżce tylko z modułem pracy (`RODZAJE`), między R2 a R4; każdy cel fałsz przed i prawda po poleceniu ustawienia z panelu Pracy albo z karty osoby; `zasiatke` tylko w zwykłym trybie; O1.2 tylko w zombie i przed O1.3; O1.3 po próbie zaproszenia, także nieudanej; R1 `przeszukaj` zaliczony przez Szaber (bez polecenia gracza) nie psuje rozdziału.
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.** Rozstrzygnij przy okazji jedną angielską parę dla „Zapytać o rękę” (wędrowiec i spotkanie z sąsiadami, U16) i wpisz ją do słowniczka.
- [ ] **Step 4: `npm test`, Biome, `npm run bot:cele`, `npm run shots -- cele praca`.** Oczekiwane: PASS, zrzut `cele-r3` (panel Pracy z celem) obejrzany.
- [ ] **Step 5: Commit** `git commit -m "Ścieżka celów: rozdział Praca i werbunek wędrowców"`.

## Zadania, które zależą od gałęzi `wydarzenia`

Wykonać po scaleniu etapu 3 `wydarzenia` (goście z klocków) do `pelna-gra`.

### Task 13: Goście pod bramą w celach

**Files:**
- Modify: `src/ui/sciezka.ts` (R4 `nowi`: zdanie o gościu pod bramą i „Pokaż”; okazje nie dublują karty gościa)
- Test: uzupełniony `tests/unit/sciezka-r2-r5.test.ts`

- [ ] **Step 1: Testy:** podpowiedź `nowi` po scaleniu mówi o gościu pod bramą i przycisku „Pokaż”, w trybie zombie o ocalałych; przyjęcie gościa do spółdzielni zalicza `nowi`; wyrzucenie mieszkańca bramą (etap 2) nie zalicza i nie cofa zaliczenia; karta gościa nie otwiera żadnej okazji (karta sama prowadzi decyzję).
- [ ] **Step 2: Uruchom testy.** Oczekiwane: FAIL.
- [ ] **Step 3: Zaimplementuj.**
- [ ] **Step 4: `npm test`, Biome, `npm run bot:cele`.** Oczekiwane: PASS.
- [ ] **Step 5: Commit** `git commit -m "Ścieżka celów: goście pod bramą w celu nowych ludzi"`.

## Zadanie po decyzji Mateusza

### Task 14: Karta „Ślady przy siatce” łata jak menu

Usterka U13. Tylko po „tak” Mateusza (pytanie 4) i po scaleniu `praca-ludzi` i `wydarzenia`.

**Files:**
- Modify: `src/gov/tresc.ts` (koszt i wpis), `src/gov/wspolne.ts` (stała łaty w zarządzie)
- Test: `tests/unit/zarzad.test.ts` (zgodność stałej z `PATCH_COST`, jak `WOOD_PER_HOUR` z `BURN_TICKS`), przeliczone przypięte skróty w testach, które je mają

- [ ] **Step 1: Test zgodności** stałej zarządu z `PATCH_COST` i testy karty (koszt 3, opis „złomem i drutem”, przy 2 złomu opcja wyłączona).
- [ ] **Step 2: Zaimplementuj**, przelicz skróty botów i przypiętych testów, opisz w dzienniku stare i nowe skróty z przyczyną.
- [ ] **Step 3: Commit** `git commit -m "Karta „Ślady przy siatce” łata za 3 złomu jak menu"`.

## Bramka

### Task 15: Bramka końcowa i dziennik

**Files:**
- Modify: `docs/POSTEP.md` (wpis w „Zrobione”, decyzje z pytań w „Decyzjach”, zaparkowane: kolejność rozdziałów do strojenia po graniu Mateusza)

- [ ] **Step 1: Pełna bramka:** `npm test`, `npx biome check src tests tools index.html`, `npm run build`, `npm run bot` i `npm run bot:zombie` (skróty bez zmian poza zadaniem 14), `npm run bot:cele` (każdy rozdział kończy się na sześciu przebiegach), `npm run shots -- --dalej` (cały zestaw, kod 0) i obejrzane zrzuty `cele-*`.
- [ ] **Step 2: Dziennik:** co zbudowane, wynik bota ścieżki (tabela dni rozdziałów), co obejrzane, które pytania z projektu rozstrzygnął Mateusz i jak.
- [ ] **Step 3: Commit** `git commit -m "Ścieżka celów: bramka i dziennik"`.

## Self-review

- Pokrycie projektu: poprawki od razu w zadaniach 1–4 i 14, silnik i R0–R1 w zadaniu 5, okienko i okna w 6, R2 i R4–R8 w 7 i 8, okazje w 9, R3 i werbunek w 12, goście w 13, sprawdzenie map i trybów w 11, wygląd w 10, bramka w 15.
- Zadania bez gałęzi (1–11) da się zbudować na dzisiejszej `pelna-gra`; R3 wchodzi bez przebudowy silnika, bo rozdział z `jest` fałszywym jest pomijany.
- Ryzyko: kolejność rozdziałów i liczba celów na dzień trzeba będzie stroić po graniu Mateusza; bot ścieżki pokaże godziny, ale nie powie, czy jest nudno.
