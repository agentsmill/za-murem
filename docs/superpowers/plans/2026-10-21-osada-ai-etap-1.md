# Osada AI, etap 1: silnik decyzji — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Silnik decyzji, który sam prowadzi pełną grę Za Murem (te same polecenia i te same odpowiedzi w oknach zarządu co gracz) i przeżywa 45 dni w co najmniej 4 z 5 ziaren na każdym z trzech dem.

**Architecture:** Nowy katalog `src/ai/`. `gra.ts` to gra prowadzona przez decydenta: symulacja, zarząd i pętla krok w krok jak w botach (`playWithGov` z `tests/unit/gov-play.ts`), „ręce gry” jako jedyna droga działania i zapis w JSON. `silnik.ts` składa decydenta z warstw: zima (`zima.ts`), jedzenie (`jedzenie.ts`), rozwój (`rozwoj.ts`), okna zarządu (`okna.ts`). Uprząż `tools/bot-osada.ts` (`npm run bot:osada`) mierzy przeżycie i wzrost na 5 ziarnach × 3 demach w procesach równoległych. Istniejący kod gry, testy i boty się nie zmieniają. Odejście od projektu (decyzja planu): polityki botów z `tests/unit/*-play.ts` nie są przenoszone, bo inne gałęzie wciąż zmieniają `tests/unit/gov-play.ts`; silnik podstawowy odtwarza `playWithGov` i tej równoważności pilnuje test, a nowe warstwy są pisane od zera w `src/ai/`.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`, importy z `.ts`), Node 25 bez kompilacji, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-20-osada-ai-design.md` (sekcje „Silnik decyzji”, „Kolejność budowy” punkt 1, „Bramka”); przyczyny końca gier botów: `docs/ocena/2026-10-19-osada-ai-rozpoznanie.md` (rozdział 1) i `docs/ocena/2026-10-20-zima-w-grach-botow.md` (sekcje 3 i 7).

## Global Constraints

- Etap zmienia tylko silnik, nie zasady gry: bez zmian w `src/sim/`, `src/gov/`, `src/world/`, `src/content/`, `src/render/`, `src/ui/`, `src/main.ts`, w istniejących `tests/unit/*-play.ts` i w istniejących `tools/bot*.ts`. Skróty botów bez zmian: `npm run bot` 6e21928c (po 3 dobach 701b05aa), `npm run bot:zombie` 147d305b i ec24546e.
- Silnik działa tylko przez ręce gry (`Rece` z `src/ai/gra.ts`), nie zmienia `SimState` ani `GovState` wprost i czyta tylko stan swojej gry.
- Determinizm: w `src/ai/` bez `Math.random`, `Date` i `performance`; pamięć silnika to zwykły JSON w `GraAi.pamiec` (żadnego stanu w zamknięciach ani na poziomie modułu); ten sam przebieg z zapisem i wczytaniem w połowie daje te same skróty.
- `src/ai/` nie importuje DOM ani modułów Node (`fs`, `path`, `child_process`, `os`) i nie importuje niczego z `tests/` ani `tools/`, bo w etapie 2 chodzi w przeglądarce.
- Tryb zwykły (`'zwykly'`); tryb zombie jest poza etapem.
- Warstwy silnika poza oknami zarządu (zima, jedzenie, rozwój) idą każda najwyżej raz na 30 sekund przy ekranie (600 ticków); odpowiedzi na okna idą od razu.
- Komentarze po polsku; każdy nowy plik zaczyna się komentarzem z kontraktem modułu; nazwy nowych modułów, typów i funkcji po polsku bez polskich liter, jak w `src/gov`.
- Testy w Node na prawdziwej symulacji: dema przez `demoWorld('przymorze' | 'lanciego' | 'zielonki')` z `tests/unit/sasiedzi-pomoc.ts`.
- Cel kontrolny etapu: przeżycie 45 dni (bez `gov.over`) w co najmniej 4 z 5 ziaren 11–15 na każdym demie; pierwszy kamień ludności (10 osób) między 8. a 15. dniem; co najmniej jedna budowla na trzy dni gry (na koniec przebiegu liczba stojących budowli co najmniej `floor(dni / 3)`), każde w co najmniej 4 z 5 przebiegów na demie.
- Reguła stopu: zadania 6 i 7 to strojenie. Jeśli po zadaniu 7 cel nie jest osiągnięty, budowa staje: raport z liczbami idzie do Mateusza razem z możliwościami zimy z badania (więcej ciepła przez drzwi, `heatBoost` w `src/sim/house.ts`), a zasad gry w tym etapie się nie zmienia.
- Gałąź `osada-ai` od `noc-integracja`; commity po polsku ze stopką `Co-Authored-By`.

## Review Focus

1. Zapis wczytany w połowie gry: silnik po wczytaniu decyduje tak samo jak bez przerwy (cała pamięć w JSON). Test w zadaniu 1.
2. Mapa z domami (Zielonki, siedziba w domu jednorodzinnym, bez klatki): koza z beczki staje w pokoju, w którym śpi zarząd, a warstwy nie zakładają klatki ani bloku. Test w zadaniu 3.
3. Okno zarządu nowego rodzaju (inne gałęzie dokładają karty i rodzaje okien): każde okno dostaje odpowiedź, a żadne nie czeka dłużej niż 5 sekund przy ekranie, także gdy decydent go nie zamknie. Test w zadaniu 1.
4. Koniec gry (`gov.over`): `krokGry` nie rzuca, nie przesuwa czasu i nie woła decydenta, a uprząż zapisuje dzień i przyczynę. Test w zadaniu 1, zapis przyczyny w zadaniu 2.
5. Koszt na telefonie w etapie 2: warstwy najwyżej raz na 30 sekund przy ekranie. Test w zadaniu 5.

---

### Task 1: Gra prowadzona przez decydenta i silnik podstawowy

Gra w `src/ai/gra.ts` odtwarza pętlę `playWithGov` (krok symulacji; co `TICKS_PER_SECOND` ticków `govUpdate` z wejściem i `applyGov`; potem do pięciu okien zarządu; potem tura gracza), ale decyzje oddaje decydentowi. Silnik podstawowy w `src/ai/silnik.ts` robi dokładnie to, co dziś `playWithGov(w, seed, 'zawsze-warta', dni, 4)` bez opcji, więc obie pętle dają ten sam skrót.

**Files:**
- Create: `src/ai/gra.ts`, `src/ai/silnik.ts`
- Test: `tests/unit/ai-gra.test.ts`

**Interfaces:**
- Consumes: `createSim`, `Sim`, `Command`, `SimOpts`, `trunkOf` (`src/sim/sim.ts`); `govInput`, `applyGov`, `lawsFrom` (`src/sim/gov.ts`); `newGov`, `govUpdate`, `pending`, `ackReport`, `signLaw`, `setNight`, `confirmNight`, `chooseEvent`, `lawEffects` (`src/gov/zarzad.ts`); `grajDalej`, `wlaczZwyciestwo` (`src/gov/zwyciestwo.ts`); `wlaczMiasto` (`src/gov/wyprawy.ts`); `wyslijWyprawe` (`src/gov/dzienne.ts`); `TICKS_PER_SECOND`, `hourOf` (`src/sim/clock.ts`); `snapshot` (`src/sim/snapshot.ts`); `dryTreeOf` (`src/sim/house.ts`); `commandFor` (`src/sim/orders.ts`); `hashString` (`src/core/rng.ts`).
- Produces:

```ts
// src/ai/gra.ts
export interface OpcjeGryAi {
  core?: number; // domyślnie 4
  mode?: GameMode; // domyślnie 'zwykly'
  obcy?: boolean; // SimOpts.obcy
  mieszkancy?: SimOpts['mieszkancy'];
  okolica?: readonly Miejsce[]; // z nią wlaczMiasto i GovInput.okolica w każdym wejściu
  ludnosc2021?: number; // z nią wlaczZwyciestwo i GovInput.ludnosc2021 w każdym wejściu
  dziennik?: boolean; // zapisywać ruchy rąk w GraAi.dziennik
}
export type RuchRak =
  | { s: number; t: 'polecenie'; c: Command }
  | { s: number; t: 'raport' }
  | { s: number; t: 'uchwala'; id: string | null }
  | { s: number; t: 'noc'; osoba: string; klucz: string }
  | { s: number; t: 'zatwierdz' }
  | { s: number; t: 'wydarzenie'; k: number }
  | { s: number; t: 'dalej' }
  | { s: number; t: 'wyprawa'; cel: Cel; ids: string[] };
/** jedyne działania decydenta; każde wpisuje się do dziennika (gdy włączony), skutki zarządu idą przez applyGov */
export interface Rece {
  polecenie(c: Command): void; // sim.push
  potwierdzRaport(): void; // ackReport
  podpisz(id: string | null): void; // signLaw, applyGov, sim.setLaws(lawsFrom(lawEffects(gov)))
  przydziel(osoba: string, klucz: string): boolean; // setNight
  zatwierdzNoc(): void; // confirmNight, applyGov
  wybierz(k: number): void; // chooseEvent, applyGov
  grajDalej(): void; // grajDalej
  wyslij(cel: Cel, ids: string[]): boolean; // wyslijWyprawe; przy ok applyGov(fx)
}
export interface Decydent {
  /** raz, przed pierwszym krokiem gry (tick 0) */
  start?(g: GraAi, r: Rece): void;
  /** odpowiedź na jedno okno zarządu; powinna je zamknąć rękami */
  okno(g: GraAi, p: Prompt, r: Rece): void;
  /** raz na sekundę przy ekranie, po oknach */
  tura(g: GraAi, r: Rece): void;
}
export interface GraAi {
  readonly w: World;
  readonly seed: number;
  readonly opts: OpcjeGryAi;
  readonly sim: Sim;
  readonly gov: GovState;
  pamiec: PamiecSilnika; // z src/ai/silnik.ts, zwykły JSON
  dziennik?: RuchRak[];
}
export function nowaGraAi(w: World, seed: number, opts?: OpcjeGryAi): GraAi;
export function wejscie(g: GraAi): GovInput; // govInput(st, w, s) z okolicą i ludnością 2021 jak w playWithGov
export function krokGry(g: GraAi, d: Decydent): void;
export function grajDo(g: GraAi, d: Decydent, tick: number): void; // do ticku albo do gov.over
export interface ZapisGryAi { v: 1; seed: number; opts: OpcjeGryAi; sim: SimState; gov: GovState; pamiec: PamiecSilnika }
export function zapiszGre(g: GraAi): ZapisGryAi; // głęboka kopia (JSON)
export function wczytajGre(w: World, z: ZapisGryAi): GraAi;
export function skrotGry(g: GraAi): string; // hashString(sim.hash() + JSON gov + JSON pamiec)

// src/ai/silnik.ts
export interface PamiecSilnika { v: 1; pominieteDrzewa: number[]; zlecone: number } // warstwy dopisują swoje pola
export function nowaPamiec(): PamiecSilnika;
export const silnikPodstawowy: Decydent;
/** decydent, którego używa uprząż; w zadaniu 1 równy silnikPodstawowy, zadania 3–5 składają go z warstw (edycją źródła) */
export const silnik: Decydent;
```

- [ ] **Step 1: Write the failing tests** (`tests/unit/ai-gra.test.ts`)

```ts
it('silnik podstawowy daje ten sam skrót co playWithGov zawsze-warta przez 3 dni', () => {
  const w = demoWorld('przymorze');
  const g = nowaGraAi(w, 11);
  grajDo(g, silnikPodstawowy, 3 * TICKS_PER_DAY);
  expect(g.sim.hash()).toBe(playWithGov(w, 11, 'zawsze-warta', 3, 4).hash);
});
it('dwie gry przeplatane krok po kroku mają te same skróty co każda osobno', () => {
  // Przymorze ziarno 11 i Zielonki ziarno 12, jedna doba; skrotGry po przeplocie === skrotGry solo
});
it('zapis i wczytanie w połowie nie zmieniają przebiegu', () => {
  // doba, zapiszGre, JSON.parse(JSON.stringify(...)), wczytajGre, druga doba === dwie doby bez przerwy (skrotGry)
});
it('odtworzenie ruchów rąk z dziennika na świeżej grze daje ten sam stan', () => {
  // gra z { dziennik: true } przez 2 doby silnikiem podstawowym; decydent, który wykonuje wpisy dziennika
  // w tej samej sekundzie, na nowej grze: sim.hash() i JSON gov równe
});
it('okno, którego decydent nie zamknie, dostaje odpowiedź domyślną w ciągu 5 sekund przy ekranie', () => {
  // decydent z pustym okno(); doba; żadne okno pending (to samo k i ten sam identyfikator) dłużej niż 5 s;
  // karta nocy zatwierdzona każdej nocy (gov.night.confirmed po 20:00)
});
it('po końcu gry krokGry nic nie robi', () => {
  // gra, gov.over ustawione w teście; krokGry nie rzuca, tick bez zmian, decydent niewołany (licznik wywołań 0)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ai-gra.test.ts`
Expected: FAIL (moduły `src/ai/gra.ts` i `src/ai/silnik.ts` nie istnieją)

- [ ] **Step 3: Implement `src/ai/gra.ts`**

`krokGry`: przy `gov.over` wraca od razu; przy ticku 0 przed pierwszym krokiem woła `d.start`; potem `sim.step()`, a w pełnej sekundzie `govUpdate` + `applyGov`, do pięciu okien (`pending`), dla każdego `d.okno`, a jeśli po nim `pending` zwraca to samo okno (to samo `k`, ten sam `id`, `day` albo `card.day`), odpowiedź domyślna rękami: raport potwierdzić, uchwała pierwsza z `s === 'ok'` albo `null`, karta zatwierdzić, zwycięstwo grać dalej, wydarzenie pierwszy wybór `ok` (indeks 0, gdy żadnego), nieznany rodzaj tak jak wydarzenie; na koniec `d.tura`.

- [ ] **Step 4: Implement `silnikPodstawowy` in `src/ai/silnik.ts`**

Odpowiedzi jak `answer()` z `tests/unit/gov-play.ts` dla `'zawsze-warta'` (uchwała `u_warty`, inaczej pierwsza dozwolona; na wartę tylko zdrowie co najmniej 40, a gdy nikt nie stoi, najbardziej wypoczęty zdrowy na pierwszy posterunek; wydarzenie pierwszy dozwolony wybór), `start` jak samouczek w `playWithGov` (zaznaczenie i ścięcie suchego drzewa), `tura` jak ścinanie drzewa na opał w `playWithGov` (co 10 sekund przy ekranie od 7:00 do 21:00, drewno poniżej 6, najbliższe drzewo do drzwi siedziby, pominięte drzewa w `pamiec.pominieteDrzewa`). Kolejność wywołań i rąk taka sama jak w `playWithGov`, bo test porównuje skróty.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ai-gra.test.ts`
Expected: PASS (6 testów)

- [ ] **Step 6: Lint, typy, skróty botów**

Run: `npx biome check src tests tools index.html && npx tsc -p . --noEmit && npm run bot | grep "skrót stanu"`
Expected: czysto; skróty 6e21928c i 701b05aa

- [ ] **Step 7: Commit**

```bash
git add src/ai/gra.ts src/ai/silnik.ts tests/unit/ai-gra.test.ts
git commit -m "Osada AI: gra prowadzona przez decydenta i silnik podstawowy jak bot zawsze-warta"
```

### Task 2: Uprząż `npm run bot:osada`

**Files:**
- Create: `tools/bot-osada.ts` (główny skrypt, procesy równoległe jak `tools/bot-zombie-siatka.ts`), `tools/osada-ocena.ts` (czyste funkcje oceny)
- Modify: `package.json` (skrypt `"bot:osada": "node tools/bot-osada.ts"`)
- Test: `tests/unit/ai-ocena.test.ts`

**Interfaces:**
- Consumes: `nowaGraAi`, `grajDo`, `krokGry`, `GraAi` (zadanie 1); decydent `silnik` z `src/ai/silnik.ts` (zadanie 1); `swiatMieszkancow` (`tools/bot-mieszkancy.ts`), `okolicaZGeo` (`tests/unit/miasto-play.ts`), `populacja` (`src/sim/snapshot.ts`).
- Produces:

```ts
// tools/osada-ocena.ts
export interface DzienPrzebiegu {
  dzien: number; ludnosc: number; zarzad: number; budowle: number; badania: number;
  jedzenie: number; drewno: number; zimni: number; glodni: number; zaufanie: number; wkurzenie: number;
}
export interface Przebieg {
  demo: string; ziarno: number; dni: number;
  koniec: { dzien: number; przyczyna: string } | null; // null: dożył końca
  poranki: DzienPrzebiegu[]; // o 6:00 każdego dnia
}
export interface Progi { przezyc: number; zZiaren: number; kamien: [number, number]; budowlaNaDni: number }
export const PROGI: Progi; // { przezyc: 4, zZiaren: 5, kamien: [8, 15], budowlaNaDni: 3 }
export function werdykt(p: readonly Przebieg[], progi?: Progi): { ok: boolean; bledy: string[] };
```

Uprząż: `node tools/bot-osada.ts [--ziarna=11-15] [--dni=45] [--demo=przymorze,lanciego,zielonki] [--prosto] [--bez-progu]`. Domyślnie jak gra w przeglądarce: `obcy: true`, mieszkańcy z adresu (`swiatMieszkancow`), okolica z geo dema (`okolicaZGeo`) i `ludnosc2021`, gdy demo ją ma; `--prosto` bez nich. Jedna gra na proces, procesów tyle, ile rdzeni bez jednego. Wynik: tabela na demo (ziarno, dzień końca albo „żyje”, przyczyna, ludność w dniach 10, 20, 30 i 45, dzień pierwszego kamienia, budowle na koniec, czas), linia „przeżyło x z 5” na demo, werdykt i kod wyjścia 1, gdy werdykt nie przechodzi (bez `--bez-progu`).

- [ ] **Step 1: Write the failing tests** (`tests/unit/ai-ocena.test.ts`)

```ts
it('pięć przebiegów, cztery dożyły, kamień w 12. dniu, budowle wystarczą: ok', () => {
  expect(werdykt(przebiegi({ dozyly: 4, kamien: 12, budowle: 16, dni: 45 })).ok).toBe(true);
});
it('tylko trzy z pięciu dożyły: błąd z nazwą dema', () => {
  const w = werdykt(przebiegi({ dozyly: 3, kamien: 12, budowle: 16, dni: 45 }));
  expect(w.ok).toBe(false);
  expect(w.bledy.join(' ')).toContain('przymorze');
});
it('kamień ludności w 16. dniu w dwóch przebiegach: błąd', () => { /* … */ });
it('za mało budowli (14 przy 45 dniach): błąd', () => { /* … */ });
```

(`przebiegi(...)` to pomocnik testu, który składa pięć syntetycznych przebiegów dema `przymorze`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ai-ocena.test.ts`
Expected: FAIL (brak `tools/osada-ocena.ts`)

- [ ] **Step 3: Implement `werdykt` and `PROGI` in `tools/osada-ocena.ts`, then `tools/bot-osada.ts` and the script in `package.json`**

Przyczyna końca to `gov.over` (pustka, odwołanie, exodus); poranek liczony przy pierwszym kroku o 6:00.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ai-ocena.test.ts`
Expected: PASS

- [ ] **Step 5: Zmierz bazę**

Run: `npm run bot:osada -- --bez-progu`
Expected: tabela dla trzech dem; z silnikiem podstawowym gry kończą się odwołaniem mniej więcej w dniach 13–17 (jak boty w rozpoznaniu). Tabelę wpisz do raportu zadania jako bazę.

- [ ] **Step 6: Commit**

```bash
git add tools/bot-osada.ts tools/osada-ocena.ts tests/unit/ai-ocena.test.ts package.json
git commit -m "Osada AI: uprząż npm run bot:osada z werdyktem przeżycia i wzrostu"
```

### Task 3: Warstwa zimy

Przyczyna końca gier botów zimą to zimna sypialnia: koza w kuchni grzeje pokój zarządu tylko przez drzwi, a ogrzana sypialnia daje 5–12 dni więcej (badanie zimy, sekcje 3.2 i 7). Warstwa prowadzi do kozy z beczki w pokoju, w którym śpi zarząd, trzyma drewno na noc i wystawia dyżur przy kozie.

**Files:**
- Create: `src/ai/zima.ts`, `src/ai/miejsca.ts`
- Modify: `src/ai/silnik.ts` (`silnik` = podstawowy + warstwa zimy; pola pamięci warstwy, opcjonalne, z wartością domyślną przy pierwszym użyciu)
- Test: `tests/unit/ai-zima.test.ts`

**Interfaces:**
- Consumes: `Decydent`, `Rece`, `GraAi`, `PamiecSilnika` (zadanie 1); `BUILDS`, `PLACE_ROOMS`, `canPlace`, `isUnlocked`, `limitWhy` (`src/sim/budowle.ts`); `houseOf` (`src/sim/house.ts`); `WOOD_PER_HOUR`, `KOZA` (`src/gov/noc.ts`); `GovInput.paleniska`.
- Produces:

```ts
// src/ai/miejsca.ts
/** pokój (indeks w houseOf(w).rooms), w którym śpi najwięcej osób zarządu (łóżka z owner zarządu); -1: nie wiadomo */
export function pokojZarzadu(st: SimState, w: World): number;
/** pierwsze miejsce dla budowli: w pokoju `pokoj`, gdy podany, inaczej jak placeFor z tests/unit/m2-play.ts */
export function miejsceNa(st: SimState, w: World, kind: BuildKind, pokoj?: number): { x: number; y: number; rot: number } | null;

// src/ai/zima.ts
/** drewno na noc tak jak na karcie nocy: WOOD_PER_HOUR × 10 × liczba palenisk */
export function drewnoNaNoc(i: GovInput): number;
export function turaZimy(g: GraAi, r: Rece): void; // co 30 s przy ekranie
export function dyzurNaKarcie(g: GraAi, p: Extract<Prompt, { k: 'karta' }>, r: Rece): void;

// src/ai/silnik.ts
// `silnik` (zadanie 1) od tego zadania to podstawowy + zima (zadania 4 i 5 dokładają warstwy)
```

Kolejność warstwy: bez pracowni plan pracowni (`miejsceNa(..., 'pracownia')`); z pracownią i bez bieżącego badania `{ t: 'research', ids: [], tech: 't_kozy' }`; po `t_kozy` i bez kozy z beczki w `pokojZarzadu` plan `koza_beczka` w tym pokoju; drewno: gdy zapas poniżej `2 × drewnoNaNoc(i)`, polecenie ścinania jak w silniku podstawowym (nie tylko poniżej 6); na karcie nocy, gdy drewna starcza na noc, dyżur `warta:koza` dla najbardziej wypoczętej osoby ze zdrowiem co najmniej 40 (gdy karta nie ma tej opcji, polecenie `{ t: 'guard', ids: [id], post: 'koza' }`).

- [ ] **Step 1: Write the failing tests** (`tests/unit/ai-zima.test.ts`)

```ts
it('Przymorze, ziarno 11: do 9. dnia koza z beczki stoi w pokoju, w którym śpi zarząd', () => {
  const w = demoWorld('przymorze');
  const g = nowaGraAi(w, 11);
  grajDo(g, silnik, 1 * TICKS_PER_DAY);
  expect(kozaWPokoju(g)).toBe(false);
  grajDo(g, silnik, 9 * TICKS_PER_DAY);
  expect(g.sim.st.techDone).toContain('t_kozy');
  expect(kozaWPokoju(g)).toBe(true);
});
it('Zielonki (dom jednorodzinny), ziarno 12: tak samo do 9. dnia', () => { /* … */ });
it('od 6. nocy przy drewnie na noc ktoś ma dyżur przy kozie', () => {
  // noce 6–8 Przymorza: o 21:00, gdy zapas drewna >= drewnoNaNoc, istnieje pionek zarządu z job guard i post 'koza'
});
it('drewnoNaNoc liczy jak karta nocy', () => {
  // dla wejścia z paleniska 2 wynik równy WOOD_PER_HOUR * 10 * 2
});
```

(`kozaWPokoju(g)` to pomocnik testu: rzecz `koza_beczka` z kafelkiem w pokoju `pokojZarzadu(g.sim.st, g.w)`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ai-zima.test.ts`
Expected: FAIL (brak `src/ai/zima.ts`)

- [ ] **Step 3: Implement `src/ai/miejsca.ts`, `src/ai/zima.ts` and `silnik` in `src/ai/silnik.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ai-zima.test.ts tests/unit/ai-gra.test.ts`
Expected: PASS (test równoważności z zadania 1 dalej dotyczy `silnikPodstawowy`)

- [ ] **Step 5: Zmierz**

Run: `npm run bot:osada -- --bez-progu --demo=przymorze`
Expected: dzień końca na ziarnach 11–15 później niż w bazie z zadania 2, w co najmniej 4 z 5 co najmniej 19. dzień (badanie zimy: 19–25 z kozą w sypialni). Tabele przed i po do raportu.

- [ ] **Step 6: Commit**

```bash
git add src/ai/zima.ts src/ai/miejsca.ts src/ai/silnik.ts tests/unit/ai-zima.test.ts
git commit -m "Osada AI: warstwa zimy (koza z beczki w pokoju zarządu, drewno na noc, dyżur przy kozie)"
```

### Task 4: Warstwa jedzenia

Po ogrzanej sypialni gry kończy głód (dni 19–29, badanie zimy sekcja 7 punkt 4). Warstwa pilnuje zapasu jedzenia na głowę: wyprawy dzienne po jedzenie, ogródek i kuchnia, uchwała o wspólnym kotle, przyjęcia tylko przy zapasie.

**Files:**
- Create: `src/ai/jedzenie.ts`
- Modify: `src/ai/silnik.ts` (warstwa jedzenia w `silnik`)
- Test: `tests/unit/ai-jedzenie.test.ts`

**Interfaces:**
- Consumes: `Rece.wyslij`, `GraAi`, `wejscie` (zadanie 1); `miejsceNa` (zadanie 3); `zostaloZMiejsca`, `celZMiejsca` (`src/gov/wyprawy.ts`); `GovInput.okolica`, `GovInput.stock`, `GovInput.people`.
- Produces:

```ts
// src/ai/jedzenie.ts
/** porcje surowe i ugotowane w zapasie na osobę zarządu i mieszkańca */
export function jedzenieNaGlowe(i: GovInput): number;
/** czy przyjąć n nowych osób: po przyjęciu co najmniej 2 porcje na głowę */
export function stacNaPrzyjecie(i: GovInput, n: number): boolean;
export function turaJedzenia(g: GraAi, r: Rece): void; // co 30 s przy ekranie
```

Zasady warstwy: od 2. dnia ogródek na podwórku, gdy go nie ma; przy `jedzenieNaGlowe < 2` za dnia (8:00–15:00) wyprawa dzienna do najbliższego miejsca z jedzeniem, które ma jeszcze zapas (`zostaloZMiejsca > 0`), z dwiema najzdrowszymi osobami, gdy nikt nie jest w drodze; przy `jedzenieNaGlowe < 1` silnik woli uchwałę `u_kociol` w najbliższym oknie uchwały (zadanie 5 czyta `stacNaPrzyjecie` przy wydarzeniach z przyjęciem).

- [ ] **Step 1: Write the failing tests** (`tests/unit/ai-jedzenie.test.ts`)

```ts
it('przy jedzeniu poniżej 2 porcji na głowę za dnia wychodzi wyprawa po jedzenie', () => {
  // Przymorze 11, jak gra (okolica z geo dema), dziennik włączony: w każdym dniu 3–20, w którym o 9:00
  // jedzenieNaGlowe < 2 i dwie osoby mają zdrowie >= 60, do 15:00 jest wpis 'wyprawa'
});
it('do 25. dnia zarząd rano nie głoduje', () => {
  // średnie najedzenie zarządu o 6:00 w dniach 15–25 co najmniej 25 (dziś boty: 60–100% głodnych)
});
it('stacNaPrzyjecie: 8 porcji, 3 osoby, przyjęcie 1: tak; przyjęcie 2: nie', () => { /* … */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ai-jedzenie.test.ts`
Expected: FAIL (brak `src/ai/jedzenie.ts`)

- [ ] **Step 3: Implement `src/ai/jedzenie.ts` and wire it into `silnik`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ai-jedzenie.test.ts tests/unit/ai-zima.test.ts tests/unit/ai-gra.test.ts`
Expected: PASS

- [ ] **Step 5: Zmierz**

Run: `npm run bot:osada -- --bez-progu`
Expected: na każdym demie co najmniej 4 z 5 przebiegów dłużej niż 30 dni. Tabele do raportu.

- [ ] **Step 6: Commit**

```bash
git add src/ai/jedzenie.ts src/ai/silnik.ts tests/unit/ai-jedzenie.test.ts
git commit -m "Osada AI: warstwa jedzenia (wyprawy po jedzenie, ogródek, przyjęcia według zapasu)"
```

### Task 5: Warstwa rozwoju i okna zarządu

**Files:**
- Create: `src/ai/rozwoj.ts`, `src/ai/okna.ts`
- Modify: `src/ai/silnik.ts` (warstwa rozwoju i okna w `silnik`; licznik wywołań warstw w pamięci)
- Test: `tests/unit/ai-rozwoj.test.ts`

**Interfaces:**
- Consumes: zadania 1, 3 i 4 (`miejsceNa`, `pokojZarzadu`, `jedzenieNaGlowe`, `stacNaPrzyjecie`, `drewnoNaNoc`); `commandsAt` (`src/sim/orders.ts`) dla wędrowców (`{ t: 'talk', ids, target }`, potem `{ t: 'zapros', ids, target }`); polecenia pracy `prio` i `prog` (`src/sim/sim.ts`).
- Produces:

```ts
// src/ai/okna.ts
/** ocena skutków wyboru: zapasy (jedzenie ×3, drewno ×1, reszta ×0,5), zaufanie +2, wkurzenie −2, rany −10,
    zgony −50, przyjęcia +4 na osobę, gdy stacNaPrzyjecie, inaczej −4 */
export function ocenSkutki(fx: GovEffects, po: GovState, i: GovInput): number;
/** wybór w wydarzeniu: każdy dozwolony wybór na kopii zarządu (structuredClone), najlepsza ocena, przy remisie
    niższy indeks; prawdziwy zarząd bez zmian */
export function wyborWydarzenia(gov: GovState, i: GovInput, p: Extract<Prompt, { k: 'wydarzenie' }>): number;
/** uchwała według potrzeb: głód → u_kociol, poza tym u_warty, potem pierwsza dozwolona */
export function wyborUchwaly(i: GovInput, p: Extract<Prompt, { k: 'uchwala' }>): string | null;

// src/ai/rozwoj.ts
export const KOLEJKA_BADAN: readonly string[]; // ['t_kozy', 't_okna', 't_konserwy', 't_grzyby', 't_zielarstwo', 't_szklarnia']
export function turaRozwoju(g: GraAi, r: Rece): void; // co 30 s przy ekranie
```

Zasady rozwoju: budowa z kolejki (łóżka piętrowe, gdy łóżek mniej niż osób; magazyn przy pełnym składzie; warsztat; zasieki) tylko z odblokowanych (`isUnlocked`) i bez limitu (`limitWhy`), najwyżej jeden plan naraz; badania z `KOLEJKA_BADAN` po kolei, gdy nic się nie bada; w tabeli Pracy priorytet 1 Badań dla osoby z największą umiejętnością w dziedzinie bieżącego badania i próg drewna `2 × drewnoNaNoc`; z obcymi wędrowiec pod bramą: zagadać, a gdy `stacNaPrzyjecie(i, 1)` i jest wolne łóżko, zaprosić.

- [ ] **Step 1: Write the failing tests** (`tests/unit/ai-rozwoj.test.ts`)

```ts
it('wyborWydarzenia wybiera najlepszą ocenę i nie zmienia prawdziwego zarządu', () => {
  // gra Przymorze 11 do pierwszego okna wydarzenia; JSON gov przed === po; wynik równy indeksowi z najwyższym
  // ocenSkutki po chooseEvent na kopiach (porównanie z pełnym przeglądem w teście)
});
it('pierwszy kamień ludności (10 osób) do 15. dnia', () => {
  // Przymorze 11, jak gra (obcy, mieszkańcy z adresu, okolica): pierwszy poranek z populacja(st).razem >= 10 <= dzień 15
});
it('co najmniej jedna budowla na trzy dni do 30. dnia', () => { /* stojące budowle w dniu 30 >= 10 */ });
it('warstwy najwyżej raz na 30 sekund przy ekranie', () => {
  // doba gry: licznik wywołań każdej z warstw (zima, jedzenie, rozwój) w pamięci <= 33
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ai-rozwoj.test.ts`
Expected: FAIL (brak `src/ai/okna.ts` i `src/ai/rozwoj.ts`)

- [ ] **Step 3: Implement `src/ai/okna.ts`, `src/ai/rozwoj.ts` and wire them into `silnik`**

- [ ] **Step 4: Run all `ai-` tests**

Run: `npx vitest run tests/unit/ai-`
Expected: PASS

- [ ] **Step 5: Zmierz**

Run: `npm run bot:osada`
Expected: tabela i werdykt; kod wyjścia może być jeszcze 1 (strojenie w zadaniach 6–7). Tabele do raportu.

- [ ] **Step 6: Commit**

```bash
git add src/ai/okna.ts src/ai/rozwoj.ts src/ai/silnik.ts tests/unit/ai-rozwoj.test.ts
git commit -m "Osada AI: warstwa rozwoju (budowy, badania, praca, werbunek) i wybór w oknach zarządu na kopii"
```

### Task 6: Strojenie, runda 1

**Files:**
- Modify: tylko `src/ai/*.ts` i `tests/unit/ai-*.test.ts`
- Test: istniejące testy `ai-` plus jeden nowy test na każdą zmienioną regułę

- [ ] **Step 1: Pełny pomiar**

Run: `npm run bot:osada -- --bez-progu`
Expected: tabela 15 przebiegów; przy każdym przebiegu bez przeżycia przyczyna i poranki ostatnich pięciu dni (zimni, głodni, zaufanie, wkurzenie).

- [ ] **Step 2: Najczęstsza przyczyna końca z dowodem**

Dla przebiegów, które nie przeżyły, wskaż regułę silnika, której zabrakło (przykład: wkurzenie z dryfu przy zimnych rankach, głód po przyjęciach, brak drewna na noc), z liczbami z poranków. Zapisz w raporcie zadania.

- [ ] **Step 3: Test na tę regułę (czerwony), zmiana w silniku, test zielony**

Run: `npx vitest run tests/unit/ai-`
Expected: PASS

- [ ] **Step 4: Pomiar po zmianie**

Run: `npm run bot:osada -- --bez-progu`
Expected: lepszy wynik niż w kroku 1 (więcej przeżyć albo późniejsze końce); tabela przed i po w raporcie.

- [ ] **Step 5: Commit**

```bash
git add src/ai tests/unit/ai-*.test.ts
git commit -m "Osada AI: strojenie 1 (<reguła>)"
```

### Task 7: Strojenie, runda 2 i bramka etapu

**Files:**
- Modify: tylko `src/ai/*.ts`, `tests/unit/ai-*.test.ts`, `docs/POSTEP.md`
- Create (tylko przy stopie): `docs/ocena/2026-10-2x-osada-ai-etap-1.md`

- [ ] **Step 1: Jak zadanie 6, kroki 1–4**

- [ ] **Step 2: Bramka etapu**

Run: `npm run bot:osada && npm test && npx biome check src tests tools index.html && npm run build && npm run bot | grep "skrót stanu" && npm run bot:zombie | grep skrót`
Expected: `bot:osada` z kodem 0 (cel kontrolny z Global Constraints), testy zielone, skróty botów 6e21928c, 701b05aa, 147d305b, ec24546e.

- [ ] **Step 3: Gdy bramka nie przechodzi: stop**

Raport `docs/ocena/2026-10-2x-osada-ai-etap-1.md`: tabele z zadań 2–7, przyczyny końca, co by pomogło po stronie zasad (z badania zimy), bez zmian zasad. Etap stoi do decyzji Mateusza.

- [ ] **Step 4: Dziennik i commit**

Wpis w `docs/POSTEP.md` (co zrobione, liczby z bramki, co dalej: etap 2 projektu).

```bash
git add src/ai tests/unit/ai-*.test.ts docs/POSTEP.md
git commit -m "Osada AI: etap 1 (silnik decyzji) z bramką przeżycia 45 dni"
```
