# Gra sieciowa w czasie rzeczywistym, etap 0: fundament — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stała bramka mówi, czy Chrome, Firefox, Safari (WebKit) i Node liczą tę samą grę bit w bit, raport podaje listę poprawek i liczby pojemności, a serwer gry umie się restartować co zadaną liczbę godzin i robi codzienne kopie bazy; nic nie jest wdrożone.

**Architecture:** Jeden czysty moduł przebiegu (`tools/determinizm/przebieg.ts`) liczy ustalony scenariusz gry i zwraca skróty stanu co godzinę gry; ten sam moduł chodzi w Node, na stronie testowej w przeglądarkach Playwright i, zbudowany w jeden plik, w systemowym `jsc` (JavaScriptCore z macOS, bez pobierania). Przy rozbieżności drugi przebieg z nagrywaniem wywołań `Math` wskazuje funkcję i argumenty. Serwer dostaje planowany restart przez czyste zamknięcie (Docker podnosi go od nowa) i moduł kopii bazy przez `VACUUM INTO`.

**Tech Stack:** Node 24 bez zależności z npm po stronie serwera (`node:sqlite`, `node:http`), Vite w procesie i Playwright (Chromium, Firefox, WebKit) jak w `tools/browser.ts`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-mmo-design.md` (sekcje „Etapy”, „Kontrakt i podział pracy, etap 0”, „Bramka etapu 0”).

## Global Constraints

- Gałąź od `pelna-gra`, w osobnym drzewie roboczym. Lokalne commity swobodnie; nic na GitHub ani na serwer bez OK Mateusza.
- Bez zmian w `src/sim`, `src/render`, `src/world` (należą w tym czasie do etapów 1 i 2 miasta z kwadratów). Poprawki determinizmu tylko jako lista w raporcie.
- Serwer bez zależności z npm, Node 24, SQLite. Nowe zmienne środowiskowe są opcjonalne: bez nich serwer działa dokładnie jak dziś.
- Pobranie przeglądarek Firefox i WebKit dla Playwright (`npx playwright install firefox webkit`, kilkaset MB) oraz Node 24 (lokalnie albo obraz `node:24-alpine` przy uruchomionym Dockerze) tylko po zgodzie Mateusza; do tego czasu narzędzie liczy Chromium, `jsc` i lokalny Node (dziś 25) i mówi, czego brakuje. Wzorcem jest Node 24 (CI i obraz serwera); wyniki z Maca są orientacyjne dla serwera na innej architekturze.
- Silniki docelowe: Chromium, WebKit, Firefox i Node 24. Bramka zostaje na stałe (miasto z kwadratów zaraz przepisuje `src/sim`).
- Stos cergo nietknięty; w `deploy/hetzner` zmieniamy tylko nasze pliki compose i opisy.
- Komentarze po polsku, nagłówki modułów z kontraktem, `verbatimModuleSyntax`, lint: `npx biome check src tests tools server index.html`.

## Review Focus

- Ten sam silnik dwa razy z rzędu daje te same skróty (inaczej rozbieżność między silnikami nic nie znaczy). Test w zadaniu 2.
- Planowany restart w chwili, gdy trwa wysyłanie zapisu w chmurze albo kolejka scrypt jest pełna: istniejące zamknięcie kończy żądania w toku (do 5 s), a nowy proces wstaje z tą samą bazą. Test w zadaniu 4.
- Kopia bazy w trakcie zapisów (tryb WAL): kopia jest spójna i otwiera się jako baza z tymi samymi kontami. Test w zadaniu 5.
- Brak katalogu kopii albo pełny dysk: serwer działa dalej i pisze błąd w dzienniku, bez wyjątku na zewnątrz. Test w zadaniu 5.
- Strefa czasu w kontenerze (UTC): godzina kopii jest w UTC i tak opisana. Test w zadaniu 5.

---

### Task 1: Przebieg gry jako czysty moduł

**Files:**
- Create: `tools/determinizm/przebieg.ts`
- Test: `tests/unit/determinizm-przebieg.test.ts`

**Interfaces:**
- Produces:
  - `interface DanePrzebiegu { geo: Geo; seed: number; godziny: number; tryb: 'zwykly' | 'zombie' }`
  - `przebieg(d: DanePrzebiegu): string[]` — buduje świat (`buildWorld`), stan (`createSim`), zarząd (`newGov` i polityka „zawsze warta” jak w `tests/unit/gov-play.ts`), stałe polecenia w ustalonych krokach (ścięcie suchego drzewa w pierwszej godzinie, przeszukanie mieszkania w drugiej dobie), liczy `godziny` godzin gry i zwraca `sim.hash()` po każdej pełnej godzinie gry
  - moduł nie importuje nic z `node:*` ani z DOM, żeby szedł w przeglądarce i w Node

- [ ] **Step 1: Write the failing test**

```ts
it('przebieg w Node jest powtarzalny i ma skrót na każdą godzinę', () => {
  const geo = JSON.parse(fs.readFileSync('public/demo/przymorze.json', 'utf8')).geo;
  const a = przebieg({ geo, seed: 12345, godziny: 24, tryb: 'zwykly' });
  const b = przebieg({ geo, seed: 12345, godziny: 24, tryb: 'zwykly' });
  expect(a).toHaveLength(24);
  expect(a).toEqual(b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/determinizm-przebieg.test.ts`
Expected: FAIL (brak modułu).

- [ ] **Step 3: Implement `tools/determinizm/przebieg.ts`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/determinizm-przebieg.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/determinizm/przebieg.ts tests/unit/determinizm-przebieg.test.ts
git commit -m "MMO etap 0: przebieg gry jako czysty moduł do porównań silników"
```

### Task 2: Strona testowa i porównanie silników

**Files:**
- Create: `tools/determinizm/strona.html`, `tools/determinizm/strona.ts` (pobiera `demo/<klucz>.json`, woła `przebieg`, wystawia wynik w `window.wynik`)
- Create: `tools/determinizm.ts` (serwer Vite w procesie jak `openSession` w `tools/browser.ts`, `chromium`, `firefox`, `webkit` z `@playwright/test`, Node; porównanie)
- Modify: `package.json` (skrypt `"determinizm": "node tools/determinizm.ts"`)
- Test: `tests/unit/determinizm-porownanie.test.ts`

**Interfaces:**
- Produces:
  - `porownaj(wyniki: Record<string, string[]>): { zgodne: boolean; pierwsza: { godzina: number; silniki: Record<string, string> } | null }` (w `tools/determinizm/porownanie.ts`, czysta funkcja)
  - CLI: `npm run determinizm [-- --demo=przymorze|lanciego|zielonki] [--godziny=72] [--zombie]`; bez `--demo` liczy trzy dema po 24 godziny w obu trybach w budżecie kilku minut; wypisuje tabelę silnik × zgodność i pierwszą rozbieżną godzinę; kod wyjścia 0 przy zgodzie wszystkich dostępnych silników, 1 przy rozbieżności, 2, gdy brakuje któregoś silnika docelowego (wiersz „brak (npx playwright install …)”)
  - noga `jsc`: `tools/determinizm/przebieg.ts` zbudowany w jeden plik ES (Vite w trybie biblioteki do katalogu tymczasowego) i uruchomiony systemowym `jsc` z macOS z geo dema wstawionym do pliku; gdy `jsc` nie ma (inny system), wiersz „brak”

- [ ] **Step 1: Write the failing test**

```ts
it('porownaj znajduje pierwszą rozbieżną godzinę', () => {
  expect(porownaj({ node: ['a', 'b', 'c'], chromium: ['a', 'b', 'c'] })).toEqual({ zgodne: true, pierwsza: null });
  expect(porownaj({ node: ['a', 'b', 'c'], webkit: ['a', 'x', 'y'] }).pierwsza).toEqual({
    godzina: 1,
    silniki: { node: 'b', webkit: 'x' },
  });
});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/determinizm-porownanie.test.ts` (FAIL), implementacja, (PASS).

- [ ] **Step 3: Uruchom porównanie**

Run: `npm run determinizm -- --godziny=72` i `npm run determinizm -- --godziny=72 --zombie` dla trzech dem; każdy silnik dwa razy (powtarzalność w obrębie silnika)
Expected: tabela; jeśli brakuje Firefoksa albo WebKita, zapytaj Mateusza o `npx playwright install firefox webkit` i uruchom ponownie po zgodzie.

- [ ] **Step 4: Commit**

```bash
git add tools/determinizm.ts tools/determinizm package.json tests/unit/determinizm-porownanie.test.ts
git commit -m "MMO etap 0: porównanie przebiegu w Chromium, Firefoksie, WebKicie i Node"
```

### Task 3: Nagrywanie wywołań Math i raport

**Files:**
- Create: `tools/determinizm/nagrywanie.ts` (podmiana `Math.hypot`, `sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `cbrt` na wersje zapisujące `[nazwa, argumenty, wynik]` w zadanym przedziale kroków; `sqrt` pomijamy, bo IEEE wymaga dokładnego wyniku)
- Modify: `tools/determinizm.ts` (`--nagraj`: po rozbieżności przebieg od ostatniej zgodnej godziny z nagrywaniem w każdym silniku i porównanie pierwszego różnego wywołania)
- Create: `docs/ocena/determinizm-silnikow.md`
- Test: `tests/unit/determinizm-nagrywanie.test.ts`

**Interfaces:**
- Produces: `nagrywaj(od: number, do: number): { zatrzymaj(): Wywolanie[] }`, `type Wywolanie = [string, number[], number]`; `pierwszaRoznica(a: Wywolanie[], b: Wywolanie[]): { i: number; a: Wywolanie; b: Wywolanie } | null`

- [ ] **Step 1: Write the failing test**

```ts
it('pierwszaRoznica wskazuje pierwsze wywołanie z innym wynikiem', () => {
  const a: Wywolanie[] = [['sin', [1], 0.8414709848078965], ['hypot', [3, 4], 5]];
  const b: Wywolanie[] = [['sin', [1], 0.8414709848078965], ['hypot', [3, 4], 5.000000000000001]];
  expect(pierwszaRoznica(a, b)?.i).toBe(1);
});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/determinizm-nagrywanie.test.ts` (FAIL), implementacja, (PASS).

- [ ] **Step 3: Raport**

`docs/ocena/determinizm-silnikow.md`: wersje silników, wyniki dla trzech dem i obu trybów, każda rozbieżność z godziną, funkcją, argumentami i miejscem w kodzie (`plik:linia` z `src/sim` albo `src/gov`), lista proponowanych poprawek (na przykład moduł `src/core/mat.ts` z odległością przez `Math.sqrt` i sinusem z tablicy albo wielomianu) z oceną wpływu na skróty botów. Poprawek nie wprowadzamy (patrz Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add tools/determinizm docs/ocena/determinizm-silnikow.md tests/unit/determinizm-nagrywanie.test.ts
git commit -m "MMO etap 0: nagrywanie wywołań Math i raport determinizmu silników"
```

### Task 4: Planowany restart serwera

**Files:**
- Modify: `server/main.ts`
- Create: `server/restart.ts`
- Test: `tests/unit/serwer-restart.test.ts`

**Interfaces:**
- Produces: `planujRestart(godziny: number, zakoncz: (powod: string) => void): { anuluj(): void } | null` (null, gdy `godziny` nie jest liczbą większą od 0; timer z `.unref()`); w `server/main.ts` zmienna `ZM_RESTART_H` (brak albo 0: wyłączone), powód w dzienniku „restart planowy po N h”

- [ ] **Step 1: Write the failing test**

```ts
it('planujRestart woła zakoncz po zadanej liczbie godzin i nie wcześniej', () => {
  vi.useFakeTimers();
  const zakoncz = vi.fn();
  planujRestart(48, zakoncz);
  vi.advanceTimersByTime(48 * 3600_000 - 1);
  expect(zakoncz).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(zakoncz).toHaveBeenCalledWith('restart planowy po 48 h');
  vi.useRealTimers();
});
it('bez godzin restartu nie ma', () => {
  expect(planujRestart(0, vi.fn())).toBeNull();
  expect(planujRestart(Number.NaN, vi.fn())).toBeNull();
});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/serwer-restart.test.ts` (FAIL), implementacja, (PASS), potem `npm test -- serwer api-klient` (bez zmian).

- [ ] **Step 3: Restart w trakcie żądania**

Test w `tests/unit/serwer-restart.test.ts`: serwer z `stworzSerwer` na bazie w katalogu tymczasowym, rozpoczęte wysyłanie zapisu w chmurze, wywołanie zamknięcia; zapis kończy się 200 albo jest odrzucony bez uszkodzenia bazy, a nowy serwer na tym samym pliku widzi konto i zapis.

- [ ] **Step 4: Commit**

```bash
git add server/main.ts server/restart.ts tests/unit/serwer-restart.test.ts
git commit -m "Serwer: planowany restart co ZM_RESTART_H godzin"
```

### Task 5: Codzienne kopie bazy

**Files:**
- Create: `server/kopie.ts`
- Modify: `server/main.ts` (harmonogram), `server/baza.ts` (dostęp do bazy dla kopii, jeśli potrzebny)
- Test: `tests/unit/serwer-kopie.test.ts`

**Interfaces:**
- Produces:
  - `zrobKopie(baza: Baza, katalog: string, teraz: Date): string | null` (plik `za-murem-RRRR-MM-DD.db` przez `VACUUM INTO`, data w UTC; null i wpis w dzienniku przy błędzie)
  - `usunStare(katalog: string, dni: number, teraz: Date): string[]` (usuwa tylko pliki o wzorcu kopii starsze niż `dni`, zwraca usunięte)
  - zmienne: `ZM_KOPIE` (katalog; brak: kopie wyłączone; w kontenerze `/dane/kopie`), `ZM_KOPIE_DNI` (domyślnie 7), `ZM_KOPIA_GODZINA` (godzina UTC, domyślnie 3)

- [ ] **Step 1: Write the failing tests**

```ts
it('kopia jest spójną bazą z tymi samymi kontami, także w trakcie zapisów', () => {
  // baza tymczasowa z kontem, równoległe zapisy, zrobKopie; otworzBaze(kopia) widzi konto
});
it('usunStare usuwa tylko stare pliki kopii', () => {
  // pliki z datami 1, 6, 8, 30 dni temu i obcy plik: przy dni=7 znikają 8 i 30, obcy zostaje
});
it('brak katalogu albo błąd zapisu nie rzuca wyjątku', () => {
  expect(zrobKopie(baza, '/nie/ma/takiego/katalogu', new Date())).toBeNull();
});
it('nazwa kopii z datą w UTC', () => {
  // teraz = 2026-10-19T23:30:00-02:00 → plik za-murem-2026-10-20.db
});
```

- [ ] **Step 2: Run, implement, run again**

Run: `npm test -- tests/unit/serwer-kopie.test.ts` (FAIL), implementacja, (PASS).

- [ ] **Step 3: Commit**

```bash
git add server/kopie.ts server/main.ts server/baza.ts tests/unit/serwer-kopie.test.ts
git commit -m "Serwer: codzienne kopie bazy z przechowywaniem ZM_KOPIE_DNI dni"
```

### Task 6: Zmienne w compose, opisy i pomiar pojemności

**Files:**
- Modify: `deploy/hetzner/compose.yml`, `deploy/hetzner/compose.obok.yml` (zmienne `ZM_RESTART_H=48`, `ZM_KOPIE=/dane/kopie` dla `api`; sprawdzanie zdrowia zostaje w `server/Dockerfile`, bez drugiego w compose)
- Modify: `server/README.md`, `deploy/hetzner/README.md` (nowe zmienne, restart, kopie na tym samym wolumenie i przed czym nie chronią, przywracanie z kopii krok po kroku, uwaga, że Docker bez orkiestratora tylko oznacza kontener jako niezdrowy)
- Modify: `CLAUDE.md` (komenda `npm run determinizm` w sekcji „Komendy”)
- Create: `tools/pojemnosc.ts` (dla trzech dem, z tłumem 150 pionków i bez: pamięć RSS na wczytany świat z `Sim`, czas kroku p50, p99 i najgorszy, czas zapisu stanu do JSON z gzip i wczytania z powrotem, szybkość doliczania kroków na sekundę; bez progu zaliczenia, z porównaniem do celu etapu 1: 50 drużyn, 10 graczy naraz, przy leniwym liczeniu nieobecnych)
- Modify: `docs/ocena/determinizm-silnikow.md` (sekcja „Pojemność”), `docs/POSTEP.md`

- [ ] **Step 1: Compose i opisy**

Run: `docker compose -f deploy/hetzner/compose.obok.yml config` (jeśli działa Docker; jeśli nie, sprawdź składnię YAML testem w Node)
Expected: poprawna konfiguracja z nowymi zmiennymi.

- [ ] **Step 2: Pomiar pojemności**

Run: `node tools/pojemnosc.ts`
Expected: tabela liczb dla każdego dema; wpisz do raportu razem z maszyną, systemem i wersją Node, na których mierzono.

- [ ] **Step 3: Bramka**

Run: `npm test && npx biome check src tests tools server index.html && npm run build && npm run bot | tail -3 && npm run bot:zombie | tail -5`
Expected: wszystko zielone, skróty botów jak na `pelna-gra` (etap nie rusza gry). Nic nie wdrożone.

- [ ] **Step 4: Dziennik i commit**

```bash
git add deploy/hetzner server/README.md CLAUDE.md tools/pojemnosc.ts docs/ocena/determinizm-silnikow.md docs/POSTEP.md
git commit -m "MMO etap 0: zmienne serwera w compose, opisy wdrożenia i pomiar pojemności"
```
