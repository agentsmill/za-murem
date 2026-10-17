# Wydarzenia z miejsca: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wydarzenia zarządu, uchwały, karta nocy i kronika pasują do miejsca (dom albo blok, co jest w okolicy, ile jest miejsc) i do chwili (pierwszy dzień bez losowych wydarzeń, dym z komina).

**Architecture:** Nowy moduł `src/gov/miejsce.ts` liczy raz ze świata opis miejsca (`GovPlace`) i słownik słów (`wordsOf`); `govInput()` w symulacji podaje go zarządowi w polu `place`. Zarząd wybiera warianty tekstów i warunki wydarzeń według tego opisu; treść 0.3 zostaje bajt w bajt, a przeróbki leżą w nakładkach (`src/gov/warianty.ts`) i w nowych wydarzeniach (`src/gov/ulica.ts`). Harmonogram w `src/gov/wydarzenia.ts` dostaje ciszę pierwszego dnia, dym z komina i zbiór wydarzeń pierwszej nocy.

**Tech Stack:** TypeScript 7 (składnia wymazywalna), Vitest, Biome, Playwright (`tools/shots.ts`), Node bez kompilacji dla narzędzi.

**Spec:** `docs/superpowers/specs/2026-10-17-wydarzenia-z-miejsca-design.md`

## Global Constraints

- Treść 0.3 w `src/content` zostaje bajt w bajt (test zgodności z 0.3 w node:vm, `tests/unit/events.test.ts`, `tests/unit/content.test.ts`).
- `src/gov` nie importuje kodu z `src/sim`; z `src/world` tylko typy (`import type`).
- W `src/sim/gov.ts` wolno dopisać tylko import `placeOf` i pole `place: placeOf(w)` w `govInput()`. Nie ruszać `src/render`, `src/ui`, `src/main.ts`; liczenia łupu w `src/gov/noc.ts` nie przepisywać.
- Zapis zarządu zostaje w wersji 1 (`GOV_VERSION`); nowe pola stanu są opcjonalne, stary zapis się wczytuje.
- Odległości na liczbach całkowitych (kwadrat odległości, `Math.sqrt` tylko do podania liczby), bez `Math.hypot`, `sin`, `cos`.
- Teksty po polsku, bez pauz-myślników, bez nazwisk polityków; przy ludziach tylko klatka, bez pięter i numerów mieszkań.
- Adres domu w Zamościu nie trafia do repo ani do commitowanych zrzutów; w tekstach „dom w Zamościu”.
- Bramka: `npm test`, `npm run lint`, `npm run build`, `npm run bot`, `npm run shots`; zrzuty obejrzane; commity lokalne, bez push.

## Review Focus

1. Stary zapis (stan zarządu bez `ev.lit` i `ev.warm`), wczytany drugiego dnia: wydarzenia przychodzą jak zwykle, cisza nie wraca. Test w zadaniu 3.
2. Świat bez wnętrza (`kitchen: null`, koza nigdy się nie pali): bez ciszy i bez dymu, pierwszego dnia wydarzenia pierwszej nocy. Test w zadaniu 3.
3. Gracz nie rozpala kozy pierwszego dnia: cisza kończy się o 18:00 i przed uchwałą o 19:30 przychodzi wydarzenie. Test w zadaniu 3.
4. Koza rozpalona pierwszy raz między 6:00 a 8:00 (pora bez wydarzeń): dym czeka do 8:00, nie przychodzi w porze bez puli. Test w zadaniu 3.
5. Dom bez sąsiadów (`near: 'nikt'`) i blok bez mieszkańców: w samotnym domu nie ma dymu ani wydarzeń z sąsiadem, w bloku bez mieszkańców sąsiadka przychodzi „z bloku obok”. Testy w zadaniach 3 i 4.

---

### Task 1: Opis miejsca, słownik i pole w wejściu zarządu

**Files:**
- Create: `src/gov/miejsce.ts`
- Modify: `src/gov/typy.ts` (typ `GovPlace`, pole `GovInput.place?`, pola `GovState.ev.lit?` i `ev.warm?`)
- Modify: `src/sim/gov.ts` (import i `place: placeOf(w)` w `govInput()`)
- Test: `tests/unit/miejsce.test.ts`

**Interfaces:**
- Produces (w `src/gov/typy.ts`):
  ```ts
  export interface GovPlace {
    kind: 'dom' | 'blok';
    blocks: number;              // bloki w promieniu 120 m (bez siedziby)
    houses: number;              // domy w promieniu 120 m
    near: 'bloki' | 'domy' | 'nikt';
    shop: number | null;         // m do najbliższego sklepu do 300 m
    garages: number | null;      // m do garaży do 150 m
    clinic: number | null;       // m do przychodni albo apteki do 300 m
    tower: 'wiezowiec' | 'blok' | 'szkola' | 'kosciol' | 'hala' | 'market' | null;
  }
  // GovInput: place?: GovPlace
  // GovState.ev: lit?: number (sekunda przy ekranie, gdy koza pierwszy raz się paliła); warm?: number (koniec ciszy)
  ```
- Produces (w `src/gov/miejsce.ts`): `BLOK: GovPlace`, `placeOf(w: PlaceWorld): GovPlace` (pamięć w `WeakMap` na obiekt świata), `placeIn(i: Pick<GovInput, 'place'>): GovPlace` (`i.place ?? BLOK`), `wordsOf(p: GovPlace): Words`, `freePlaces(i: Pick<GovInput, 'cap' | 'residents'>): number`, typy `PlaceWorld = Pick<World, 'buildings' | 'hq' | 'pois' | 'apts'>` i `Words`:
  ```ts
  export interface Words {
    wspolnota: { m: string; d: string; w: string };          // spółdzielnia, spółdzielni, w spółdzielni | ulica, ulicy, na ulicy
    zarzad: { m: string; d: string; n: string; krotko: string }; // zarząd, zarządu, zarządem, zarząd | komitet ulicy, komitetu ulicy, komitetem ulicy, komitet
    Zarzad: string;                                            // Zarząd | Komitet ulicy
    walne: string;                                             // walne | zebranie ulicy
    naglowek: string;                                          // Na osiedlu | Na ulicy
    mieszkancy: { m: string; d: string };                      // mieszkańcy, mieszkańców | sąsiedzi, sąsiadów
    sasiad: string;                                            // z bloku obok | zza płotu
  }
  ```

- [ ] **Step 1: Write the failing tests** (`tests/unit/miejsce.test.ts`, światy demo jak w `tests/unit/interfejs.test.ts`: `buildWorld(demo.geo, { seed: hashString(addr), street })`):
  - `placeOf: Przymorze i Lanciego to blok wśród bloków ze sklepem i garażami`: `kind === 'blok'`, `near === 'bloki'`, `shop !== null`, `garages !== null`.
  - `placeOf: Zielonki to dom wśród domów, bez sklepu, z garażem i przychodnią`: `kind === 'dom'`, `near === 'domy'`, `blocks === 0`, `shop === null`, `garages !== null`, `clinic !== null`.
  - `placeOf: samotny dom bez budynków mieszkalnych w 120 m ma near 'nikt'` (świat z jednym budynkiem `dom` i garażem 50 m dalej).
  - `placeOf: wieża to najwyższy budynek do 200 m` (blok 12 pięter → `'wiezowiec'`, blok 6 → `'blok'`, tylko sklep 1500 m² → `'market'`, nic → `null`).
  - `placeOf pamięta wynik dla tego samego świata`: dwa wywołania zwracają ten sam obiekt.
  - `wordsOf: w domu komitet ulicy, w bloku zarząd`: `wordsOf(dom).zarzad.m === 'komitet ulicy'`, `.naglowek === 'Na ulicy'`, `.walne === 'zebranie ulicy'`, `.wspolnota.w === 'na ulicy'`; `wordsOf(BLOK).Zarzad === 'Zarząd'`, `.naglowek === 'Na osiedlu'`.
  - `freePlaces`: `{ cap: 8, residents: 7 } → 1`, `{ cap: 6, residents: 9 } → 0`, `{} → 4` (bez danych jak dziś: miejsca na czterech).
  - `govInput podaje opis miejsca`: `govInput(createSim(w, seed), w, 0).place` równa się `placeOf(w)`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/miejsce.test.ts` — Expected: FAIL (brak modułu `src/gov/miejsce.ts`).

- [ ] **Step 3: Implement** w `src/gov/miejsce.ts`. Środek siedziby `((x0 + x1) / 2, (y0 + y1) / 2)` w kafelkach (1 m), środki innych budynków tak samo, punkty `w.pois` wprost. Dom: `hq.cls === 'dom'` albo (`w.apts.length <= 1` i `hq.levels <= 2`). Sąsiedzi: budynki klasy `blok` i `dom` w 120 m bez siedziby; `near` to rodzaj liczniejszy, przy remisie według `kind` siedziby, `'nikt'` przy zerze. Sklep: budynek `sklep` albo punkt kategorii `spozywczy`, `sklep`, `budowlany`, `elektronika`, `ubrania`, `ogrodnik`. Przychodnia: budynek `przychodnia` albo punkt `przychodnia`, `apteka`. Garaże: budynek `garaz` bez siedziby. Wieża: kandydaci do 200 m: `blok` od 5 pięter (od 9: `'wiezowiec'`), `szkola`, `kosciol`, `hala`, `sklep` od 1000 m² (`'market'`); wygrywa więcej pięter, potem większe pole, potem bliżej. `BLOK = { kind: 'blok', blocks: 4, houses: 0, near: 'bloki', shop: 150, garages: 100, clinic: 250, tower: 'blok' }`. W `src/gov/typy.ts` typ i pola z bloku Interfaces. W `src/sim/gov.ts` import `placeOf` i pole `place: placeOf(w)` w obiekcie zwracanym przez `govInput()`; nic więcej w tym pliku.

- [ ] **Step 4: Run** `npx vitest run tests/unit/miejsce.test.ts` — Expected: PASS. Potem `npm test` — Expected: wszystko zielone (bez `place` zarząd działa jak dotąd).

- [ ] **Step 5: Commit** `git add src/gov/miejsce.ts src/gov/typy.ts src/sim/gov.ts tests/unit/miejsce.test.ts && git commit -m "Opis miejsca i słownik wspólnoty dla zarządu"`

### Task 2: Słownik w uchwałach, karcie nocy, wyprawach, dziurach, kronice i zakończeniach

**Files:**
- Modify: `src/gov/tresc.ts` (warianty uchwał, nazwy celów wypraw, zapasowe nazwy dziur dla domu, `KONIEC_DOM`)
- Modify: `src/gov/uchwaly.ts` (`lawState`, `sign`), `src/gov/noc.ts` (etykieta wyprawy, linie powrotu, „Zarząd nie zdążył…”), `src/gov/zarzad.ts` (kronika zebrania i odłożonej uchwały), `src/gov/wspolne.ts` (`fenceOf`: zapasowe nazwy według miejsca)
- Test: `tests/unit/miejsce-teksty.test.ts`, pomocnik `tests/unit/miejsce-pomoc.ts`

**Interfaces:**
- Consumes: `placeIn`, `wordsOf` (zadanie 1).
- Produces: `lawName(id: string, p: GovPlace): string`, `lawDesc(id: string, p: GovPlace): string` w `src/gov/tresc.ts`; `targetName(t: ExpTarget, p: GovPlace): string` w `src/gov/tresc.ts`; `KONIEC_DOM: Record<'odwolanie' | 'exodus' | 'pustka', { title: string; text: string }>` w `src/gov/tresc.ts`; stała `FORBIDDEN_DOM = /klatk|piętr|spółdziel|pawilon|szlaban|świetlic|czynsz|blok|mieszkani/i` i światy demo (`demoWorld(key)`) w pomocniku `tests/unit/miejsce-pomoc.ts` (nie w pliku testu, żeby import nie uruchamiał cudzych testów).

- [ ] **Step 1: Write the failing tests** (dom to `placeOf(zielonki)`, blok to brak `place`):
  - `uchwały w domu`: nazwy z `lawOptions` zawierają `'Warty przy furtce'`, `'Zebrania przy kozie'`, `'Furtka na kłódkę od 20:00'`; żadna nazwa ani opis nie pasuje do `FORBIDDEN_DOM`; opis furtki zawiera `'klucz ma tylko komitet'`.
  - `uchwały w bloku bez zmian`: `'Warty na klatkach'`, `'Brama na kłódkę od 20:00'`, opisy identyczne z dzisiejszymi.
  - `kronika w domu`: po pierwszym zebraniu ostatni wpis to `'Zebranie komitetu przy kozie: pierwsza uchwała.'`, po `signLaw(…, null)` `'Komitet ulicy odłożył uchwałę na później.'`, po podpisie `'Uchwała komitetu: Warty przy furtce.'`; w bloku dzisiejsze teksty.
  - `karta nocy w domu`: etykiety wypraw nie pasują do `/blok|trzepak|pawilon/`; z garażami jest `'garaże obok'`, bez garaży `'szopy w ogrodach obok'`; daleka wyprawa `'sklep przy głównej drodze'`; automatyczne zatwierdzenie zaczyna wpis od `'Komitet ulicy nie zdążył się naradzić'`.
  - `zapasowe nazwy dziur w domu bez bloku`: `fenceOf({ ...input, place: dom, fence: { holes: [{ id: 5, size: 0.5 }], durability: 0.5 } }).holes[0].name` nie pasuje do `/blok/`.
  - `zakończenia w domu`: `KONIEC_DOM.odwolanie.title === 'Zebranie ulicy odwołało komitet'`, teksty z projektu (punkt 7) bez `FORBIDDEN_DOM`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/miejsce-teksty.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** `M1Law` dostaje `dom?: { name?: string; desc?: string }`; teksty dla domu: `u_warty` „Warty przy furtce”, opis „Co noc przy furtce stoi ktoś z domowników, a warta komitetu pilnuje lepiej. Obrona przy furtce +1,5, warta mocniejsza o ćwierć, szansa napadu −5 punktów.”; `u_brama` „Furtka na kłódkę od 20:00”, opis jak dziś z „furtka”, „klucz ma tylko komitet”, „wędrowców spod furtki”; `u_zebrania` „Zebrania przy kozie”; `u_meble` opis „Meble idą do kozy bez pytania domowników o zgodę. Palenie mebli boli połowę mniej, ale wkurzenie +2 od razu i +0,1 dziennie.” `ExpTarget` dostaje `dom?: string`, a `targetName` wybiera: `mieszkania` z `near !== 'bloki'` → „opuszczony dom obok”; `garaze` w domu → „garaże obok” albo bez garaży „szopy w ogrodach obok”; `pawilon` w domu → „sklep przy głównej drodze”; reszta bez zmian. Zapasowe nazwy dziur w domu: `['przy garażu', 'za szopą', 'od ulicy', 'przy kompostowniku', 'od strony domu obok']`. Kronika i „nie zdążył się naradzić” ze słownika (`Zarzad`, `zarzad.d`). `KONIEC_DOM` z tekstami z projektu (punkt 7, trzy zakończenia). Łup wypraw i napadów bez zmian.

- [ ] **Step 4: Run** `npx vitest run tests/unit/miejsce-teksty.test.ts` i `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Słownik wspólnoty w uchwałach, karcie nocy i kronice zarządu"` (z nowym plikiem testu dodanym przez `git add`).

### Task 3: Pierwszy dzień: cisza, dym z komina, wydarzenia pierwszej nocy

**Files:**
- Modify: `src/gov/tresc.ts` (`GEventDef.first?: boolean`; `GovHost` dostaje `place()`, `words()`, `neighbour()`; flagi `first` w nowych wydarzeniach; `sasiadka` zastąpiona przez `dym`)
- Modify: `src/gov/wydarzenia.ts` (`makeHost`: nowe metody; `eventTick`: cisza, dym, filtr pierwszej nocy; stałe)
- Modify: `tests/unit/zarzad.test.ts` (test „pierwsze po około 70 s…”), `tests/unit/interfejs.test.ts` (w teście RETRY dopisać `gov.ev.warm = 0`, bo 16:00 pierwszego dnia z zimną kuchnią to teraz cisza)
- Test: `tests/unit/pierwszy-dzien.test.ts`

**Interfaces:**
- Consumes: `placeIn`, `wordsOf` (zadanie 1).
- Produces: w `src/gov/wydarzenia.ts` stałe `DYM_DELAY = 30`, `AFTER_WARM = 10`, `CALM_END = 18`, `WARM_KITCHEN = 18`, funkcje `calm(st: GovState, i: GovInput): boolean` i `firstNight(i: Pick<GovInput, 'day' | 'hour'>): boolean` (`day === 1 || (day === 2 && hour < 8)`); w `GovHost`: `place(): GovPlace`, `words(): Words`, `neighbour(): string | null` („z waszej klatki” w bloku z mieszkańcami, inaczej „z bloku obok” albo „zza płotu” według `near`, `null` przy `near === 'nikt'`); wydarzenie `dym` w `NEW_EVENTS` (`once: true`, `w: () => 0`, wybory i skutki jak dawna `sasiadka`).

- [ ] **Step 1: Write the failing tests** (`tests/unit/pierwszy-dzien.test.ts`, wejście jak `input()` z `tests/unit/zarzad.test.ts`, kolejne sekundy przy ekranie z godziną liczoną jak przy 1×: 40 s na godzinę gry od 15:00):
  - `cisza: przy zimnej kuchni pierwszego dnia nie ma losowych wydarzeń` — `ev.next = 0`, sekundy 1–100, `kitchen: 9`, `kozaLit: false` → `ev.active` cały czas `null`.
  - `dym 30 s po pierwszym rozpaleniu kozy, raz na grę` — koza od 40 s → w 69 s brak, w 70 s `ev.active.id === 'dym'`; po wyborze i zgaszeniu oraz ponownym rozpaleniu kozy dym już nie wraca.
  - `po ciszy pierwsze wydarzenie najwcześniej 10 s po nagrzaniu kuchni i 20 s po dymie` — kuchnia 18°C od 105 s → żadnego losowego przed 115 s.
  - `pierwszego dnia i pierwszej nocy tylko wydarzenia pierwszej nocy` — przebieg na atrapie do 8:00 drugiego dnia; każde wydarzenie ma `first` albo jest dymem; drugiego dnia przychodzi choć jedno bez `first`.
  - `bez kuchni nie ma ciszy ani dymu` — `kitchen: null`, 16:00 → wydarzenie z flagą `first` przychodzi.
  - `zimna kuchnia: cisza kończy się o 18:00` — `kitchen: 9`, od 18:00 wydarzenie przed 19:30.
  - `koza rozpalona o 6:30: dym dopiero od 8:00`.
  - `stary zapis bez ev.lit i ev.warm drugiego dnia działa jak dotąd` — `delete st.ev.lit; delete st.ev.warm`, dzień 2, 10:00, `ev.next = 0` → wydarzenie przychodzi.
  - `samotny dom: bez dymu` (`place.near === 'nikt'`) i `blok bez mieszkańców: sąsiadka z bloku obok` (`residents: 0`, tekst dymu zawiera „z bloku obok”).
  - `rytm przy 1×: decyzja w każdej minucie od pierwszej do dziesiątej` — kuchnia rośnie liniowo od 9°C (40 s) do 18°C (105 s), okna odpowiadane od razu: każde okno 60 s w [60, 600) ma decyzję zarządu.
- W `tests/unit/zarzad.test.ts` test „pierwsze po około 70 s…” zmienia oczekiwania: pierwsze to `dym` w 110 s (atrapa zapala kozę o 17:00, 80 s), następne co najmniej 20 s po dymie, kolejne co najmniej 38 s po sobie; reszta asercji (pora dnia, brak wydarzeń przy czekającej decyzji) bez zmian.

- [ ] **Step 2: Run** `npx vitest run tests/unit/pierwszy-dzien.test.ts tests/unit/zarzad.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** W `eventTick`, przed dzisiejszym losowaniem: zapisz `st.ev.lit = i.screen` przy pierwszym `kozaLit`; ustaw `st.ev.warm = i.screen`, gdy cisza się kończy (pierwszy raz `kitchen >= WARM_KITCHEN`, albo `kitchen === null`, albo `hour >= CALM_END` pierwszego dnia, albo dzień ≥ 2); dym przychodzi, gdy `lit` jest, `dym` jeszcze nie był, minęło `DYM_DELAY`, `poraOf(hour)` nie jest `null`, nic nie czeka i `neighbour() !== null`; dopóki dym czeka (koza paliła się, dymu nie było, sąsiad jest), losowych wydarzeń nie ma; w ciszy losowych nie ma; po ciszy najwcześniej `warm + AFTER_WARM`; w `pickGovEvent` przy `firstNight(i)` tylko wydarzenia z `first`. Flaga `first`: `slady`, `latarka`, `wedrowiec`, `pies`, `halas`, `krzyk`, `bezsennosc`, `sygnal`, `kot`, `ulewa`, `przymrozek` i z 0.3 `obserwacja`. Tekst dymu z projektu (punkt 6) z sąsiadem z `neighbour()`; w domu „u niej w domu”, w bloku „u niej w mieszkaniu”; kronika wyborów jak w `sasiadka`, w domu „jak wyglądała ulica, kiedy jeszcze jeździły autobusy” i „Pani Krysia wróciła do zimnego domu. Cała ulica już o tym wie.”

- [ ] **Step 4: Run** `npx vitest run tests/unit/pierwszy-dzien.test.ts tests/unit/zarzad.test.ts tests/unit/interfejs.test.ts` i `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Pierwszy dzień bez losowych wydarzeń: cisza do ciepłej kuchni i dym z komina"`

### Task 4: Nakładki na wydarzenia z 0.3 i przyjęcia według wolnych miejsc

**Files:**
- Create: `src/gov/warianty.ts` (tablica `OLD_EVENTS` z nakładkami dla 19 wydarzeń 0.3; `tresc.ts` ją reeksportuje, żeby importy w testach się nie zmieniły)
- Modify: `src/gov/tresc.ts` (typ nakładki `OldEvent`, reeksport), `src/gov/wydarzenia.ts` (składanie `M1_EVENTS` z nakładek, `GovHost`: `free()`, `residents()`, `outdoor()`, `campfire()`; przepisywanie kroniki: „Opał” → „Drewno” i zwroty wydarzenia)
- Test: `tests/unit/wydarzenia-miejsce.test.ts`

**Interfaces:**
- Consumes: `GovHost.place/words/neighbour` (zadanie 3), `freePlaces` (zadanie 1), `FORBIDDEN_DOM` (zadanie 2).
- Produces:
  ```ts
  export interface OldEvent {
    id: string;
    when: readonly Pora[];
    first?: boolean;
    w?: (h: GovHost) => number;                       // zastępuje wagę 0.3 (warunki miejsca w środku)
    make?: (h: GovHost) => unknown;                   // własne dane (np. rodzina 2–4 w domu)
    title?: (h: GovHost, d: any) => string | null;    // null: z 0.3
    text?: (h: GovHost, d: any) => string | null;
    labels?: (h: GovHost, d: any) => (string | null)[];
    choices?: (h: GovHost, d: any) => EventChoice[];  // własne wybory zamiast 0.3
    log?: (h: GovHost) => Record<string, string> | null; // zwroty do podmiany w kronice tego wydarzenia
  }
  ```
  `drewno(s: string): string` (zamiana „Opał” na „Drewno”) i `admitWeight(free: number): number` (1 przy co najmniej 4, 0,5 przy 1–3, 0,15 przy 0) w `src/gov/warianty.ts`; `osobyNaPodlodze(n: number): string` („1 osoba będzie”, „2 osoby będą”, „5 osób będzie”, „22 osoby będą”, „12 osób będzie”).

- [ ] **Step 1: Write the failing tests:**
  - `w domu wydarzenia z 0.3 nie mówią o bloku` — dla domu z Zielonek i domu ze sklepem obok (`{ ...placeOf(zielonki), shop: 70 }`), ziaren 1–6 i godzin 10, 16, 20, 23 (dzień 3): dla każdej nakładki z `w(h) > 0` tytuł, tekst, napisy i wpisy kroniki po każdym dostępnym wyborze nie pasują do `FORBIDDEN_DOM`.
  - `w bloku teksty 0.3 zostają` — `lodowka`, `dron`, `auto`, `influencer` w bloku: tekst identyczny z 0.3; `handlarz` mówi „Pod bramą”.
  - `nigdzie nie ma „Opał”` — napisy i kronika `handlarz`, `krypto`, `ksiazki`, `automat` w obu miejscach nie zawierają „Opał”.
  - `koza zamiast ogniska` — `fachowiec` i `czynsz` bez ogniska (`light.campfire === false`) mówią „przy kozie” i „Spalić list w kozie”.
  - `warunki` — `automat` ma wagę 0 bez sklepu; `kradziez` 0 bez mieszkańców; `wesele` zawsze 0; `obserwacja` w Zielonkach mówi „Z dachu hali” i „na wasz dom”; `dzieci` przy `near: 'domy'` mówi „z sąsiednich domów”.
  - `przyjęcia: ludzie pod bramą w bloku` — wolne 3, grupa 7: napisy `['Przyjąć tylu, ilu się zmieści (3)', 'Dać Jedzenie 3 na drogę', 'Przyjąć wszystkich (4 osoby będą spać na podłodze)', 'Odprawić']`; tekst zawiera „Wolnych miejsc w bloku: 3”; pierwszy wybór daje `fx.residents === 3` (z fachowcem w grupie `fx.residents === 2` i `fx.join.length === 1`); „Przyjąć wszystkich” przy braku miejsc daje wkurzenie +2.
  - `przyjęcia: waga spada przy ciasnocie` — waga przy 0, 2, 5 wolnych miejscach to 0,15, 0,5 i 1 razy waga bazowa.
  - `przyjęcia w domu` — grupa 2–4, tekst zawiera „W domu nie ma wolnych łóżek”.
  - `aktywiści bez dokwaterowania` — „Zaprosić do ciepła” daje `fx.residents === 0` i zaufanie +1.
  - `influencerka i fachowiec nie liczą się podwójnie` — influencerka: `fx.join.length === 1`, `fx.residents === 0`; fachowiec w bloku: `fx.join.length === 1`, `fx.residents === -1`; w domu `fx.residents === 0`.
  - `osobyNaPodlodze` dla 1, 2, 5, 12, 22.

- [ ] **Step 2: Run** `npx vitest run tests/unit/wydarzenia-miejsce.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Nakładki według tabeli w projekcie (punkt 5 i 5a); dla każdego wydarzenia z 0.3 tylko to, co tabela zmienia, reszta (losowanie, skutki, liczby) z `src/content/events.ts`. Wagi M1: dzisiejsze z `OLD_EVENTS` (np. `uchodzcy` 0,8 od drugiego dnia, `obserwacja` 1,2 od 13:00), razy `admitWeight(free)` dla `uchodzcy`. Grupa pod bramą w domu `ri(2, 4)`, skąd: `['z miasta, gdzie pękł wodociąg', 'ze wsi, gdzie skończyła się woda', 'z domu, któremu zawalił się dach', 'z osiedla za obwodnicą']`. Kolejność wyborów ludzi pod bramą jak w teście (bot bierze pierwszy dostępny). „Przyjąć wszystkich” przy braku miejsc: zaufanie +1, wkurzenie +2 (jak w 0.3 przy przepełnieniu). `M1_EVENTS` składa nakładkę z definicją 0.3: tytuł, tekst i napisy z nakładki albo z 0.3 przepuszczone przez `drewno`; kronika z wyborów przez `drewno` i zwroty z `log`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/wydarzenia-miejsce.test.ts tests/unit/events.test.ts tests/unit/content.test.ts` i `npm test` — Expected: PASS (test zgodności z 0.3 bez zmian).

- [ ] **Step 5: Commit** `git commit -m "Wydarzenia z 0.3 według miejsca i przyjęcia według wolnych miejsc"`

### Task 5: Warianty nowych wydarzeń M1 i wydarzenia ulicy domów

**Files:**
- Create: `src/gov/ulica.ts` (`jablka`, `kury`, `kosiarka`, `szopa`, `plot`, `panele`, `przychodnia`)
- Modify: `src/gov/tresc.ts` (warianty `wedrowiec`, `halas`, `krzyk`, `bezsennosc`, `sygnal`, `kot`, `przymrozek`, `latarka`, `domofon`), `src/gov/wydarzenia.ts` (nowe wydarzenia w `M1_EVENTS`)
- Test: `tests/unit/wydarzenia-miejsce.test.ts` (rozszerzony)

**Interfaces:**
- Consumes: `GovHost` z zadań 3 i 4.
- Produces: `STREET_EVENTS: GEventDef[]` w `src/gov/ulica.ts`, dołączone na końcu `M1_EVENTS`.

- [ ] **Step 1: Write the failing tests:**
  - `w domu żadne wydarzenie nie mówi o bloku` — test z zadania 4 rozszerzony na całe `M1_EVENTS` (także dym i nowe).
  - `nowe wydarzenia ulicy tylko w domu i od drugiego dnia` — `kury`, `kosiarka`, `szopa`, `plot`, `panele` mają wagę 0 w bloku i pierwszego dnia; `kury` 0 bez dziur w siatce; `plot` 0 przy `near !== 'domy'`; `jablka` 0 poza jesienią (`season !== 0`); `przychodnia` 0 bez przychodni.
  - `przymrozek tylko przy mrozie` — waga 0 przy `outdoor: 8`, dodatnia przy `outdoor: 0`.
  - `krzyk i światło w oknie według sąsiadów` — przy `near: 'domy'` tytuł „Krzyk z domu obok”, tekst światła zawiera „W domu naprzeciwko”.
  - `skutki nowych wydarzeń` — `szopa` „Zabrać deski na opał” daje drewno +3; `kury` „Załatać dziurę (Złom 2)” daje łatę; `panele` „Rozkręcić falownik na części” daje części +2.

- [ ] **Step 2: Run** `npx vitest run tests/unit/wydarzenia-miejsce.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** teksty i skutki z projektu (punkt 5 dla wariantów, punkt 6 dla nowych). Wagi nowych: 0,8, raz na grę (`once: true`), pora `['dzien']`; skutki przez dzisiejsze metody `GovHost` (`addRes`, `mood`, `needsOf(rested)`, `pay`, `patchHole`, `log`).

- [ ] **Step 4: Run** `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Wydarzenia ulicy domów i warianty nowych wydarzeń według sąsiadów"`

### Task 6: Pomiar, bot, zrzuty, notatka

**Files:**
- Modify: `tools/shots.ts` (scenariusze na końcu listy)
- Notatki poza repo: `wydarzenia.md` i `wydarzenia-demo.ts` w folderze notatek koordynatora

- [ ] **Step 1: Pomiar** skryptem z notatek na czterech miejscach, 100 gier, 1× i 3×: wydarzeń w 15 minutach, w samouczku (oczekiwane 0), odsetek tekstów z `FORBIDDEN_DOM` w domach (oczekiwane 0), najdłuższa przerwa bez decyzji zarządu w pierwszych 10 minutach przy 1× (oczekiwane do 60 s, w Zamościu też). Dane domu w Zamościu tylko ze scratchpadu.
- [ ] **Step 2: Bot** `npm run bot` — Expected: bez błędów; w linii przyjęć mieszkańców na koniec nie kilka razy więcej niż miejsc.
- [ ] **Step 3: Zrzuty.** Na końcu `SHOTS` w `tools/shots.ts`: `wydarzenia-blok-dym` (Przymorze, samouczek przez polecenie ścięcia suchego drzewa jak w `m1-drewno-na-noc`, przewijanie `zm.ff` do okna dymu, sprawdzenie tytułu „Dym z komina” i „z waszej klatki”), `wydarzenia-dom-dym` (Zielonki, „zza płotu”), `wydarzenia-dom-dzien2` (Zielonki, do raportu i dalej do pierwszego wydarzenia drugiego dnia; tekst bez `FORBIDDEN_DOM`), `wydarzenia-dom-karta` (Zielonki, karta nocy: etykiety wypraw bez bloku). Run `npm run shots -- wydarzenia` i `npm run shots -- m1-wydarzenie`, potem całe `npm run shots`; obejrzeć każdy nowy zrzut.
- [ ] **Step 4: Bramka** `npm test && npm run lint && npm run build && npm run bot && npm run shots` — Expected: wszystko bez błędów.
- [ ] **Step 5: Commit** `git commit -m "Zrzuty wydarzeń z miejsca"`; notatka `wydarzenia.md` z wynikami pomiaru i listą dla koordynatora; raport do koordynatora.
