# Mieszkańcy z adresu, krok 5: wpięcie w grę — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zarząd i mieszkańcy siedziby w grze pochodzą z gospodarstw wygenerowanych dla adresu: mają imiona, rodzinę, historię, kartę, zmianę imienia z odmianą i napis o fikcji, a puste mieszkania siedziby mają rok i powód opuszczenia z historii budynku.

**Architecture:** `src/mieszkancy/` zostaje czystym modułem. Nowy klej `src/sim/lokatorzy.ts` zamienia wynik generatora dla budynku siedziby na osoby gry i stany mieszkań. `createSim` dostaje opcjonalne `mieszkancy` (jak `team`); bez opcji stan jest identyczny jak dziś, więc boty i testy z przypiętymi skrótami się nie zmieniają. `main.ts` wczytuje tabele asynchronicznie przed `buildWorld`, a gdy się nie uda, gra idzie starą ścieżką `makePerson`.

**Tech Stack:** TypeScript 7 (składnia wymazywalna), Vite 8, PixiJS 8, Vitest, Playwright (`npm run shots`), Biome.

**Spec:** `docs/superpowers/specs/2026-10-17-mieszkancy-z-adresu-design.md` (§7 zmiana imienia, §9 połączenie z grą, §10 RODO, §11 atrybucja, akapit o stanie pustych mieszkań w §5). Mapa miejsc wpięcia z kodu na 14326cd: `docs/superpowers/plans/2026-10-18-mieszkancy-krok-5-mapa.md`.

## Global Constraints

- Gałąź `mieszkancy-krok-5` od bazy wskazanej przez nocnego integratora (`pelna-gra` ≥ 14326cd), we własnym worktree. Commity tylko lokalne, bez push; scala integrator.
- `createSim` bez opcji `mieszkancy` daje stan identyczny jak dziś: `tests/unit/druzyna-sim.test.ts` (`PRZED`), `tests/unit/sim.test.ts`, `npm run bot`, `npm run bot:zombie` przechodzą bez zmian skrótów.
- `src/mieszkancy/` nie importuje z `src/sim`, `src/ui`, `src/render`, `src/gov`; zostaje deterministyczny (dozwolone `+ - * /`, porównania, `Math.floor/round/abs/min/max/sqrt`, jedno udokumentowane `Math.cos` w `budynki.ts`).
- Złote skróty generatora (`tests/unit/mieszkancy-generuj.test.ts`) się nie zmieniają, chyba że zmiana dotyczy budynków z tagiem `zm:klucz` (dema go nie mają).
- RODO (CLAUDE.md, spec §10): postaci zmyślone; w tekstach dla gracza żadnych numerów mieszkań ani pięter (regex `/\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i` nie trafia); napis o fikcji widoczny na karcie każdej osoby z generatora, także na telefonie i na zrzucie; zmienione imiona zostają w `localStorage` gracza i nigdzie nie są wysyłane.
- Atrybucja map zostaje widoczna; obok niej link do danych mieszkańców.
- Rok gry 1.10.2051: wiek osoby = `2051 - rocznik`.
- Po każdej zmianie wizualnej zrzut w Playwright (`npm run shots -- <filtr>`) obejrzany przed raportem.
- Pierwsza doba gry z mieszkańcami z generatora bez błędu w trybie zwykłym i zombie.
- Bramka końcowa: `npm test` dwa razy, `npm run lint`, `npm run build`, `npm run bot`, `npm run bot:zombie`, oba boty z `--mieszkancy`, `npm run shots`, `npm run mieszkancy`.

## Review Focus

- Adres poza trzema gminami z tabel (`gmina = null`): gra startuje z mieszkańcami z rozkładów krajowych. Test w Task 2 i Task 3.
- Tabele niedostępne (offline, 404, serwer dev oddaje HTML ze statusem 200): gra startuje starą ścieżką bez błędu. Test w Task 2; zrzut w Task 7.
- Siedziba bez dopasowanego budynku generatora (świat wymusza blok/dom, segment nie sklejony): zapasowy `Budynek` ze świata. Test w Task 3.
- Wznowienie zapisu sprzed kroku 5 (mieszkańcy z `person = -1`): gra się wczytuje, mieszkańcy bez kart, bez błędu. Test w Task 4.
- Zmienione imię osoby, której po aktualizacji danych już nie ma: jeden komunikat „wyprowadził się/wyprowadziła się” i usunięcie wpisu. Test w Task 6.

---

### Task 1: Członkowie budynków i kanoniczne tagi w generatorze

**Files:**
- Modify: `src/mieszkancy/typy.ts` (`Budynek.czlonkowie: number[]`), `src/mieszkancy/budynki.ts`
- Create: `src/mieszkancy/oznacz.ts`
- Test: `tests/unit/mieszkancy-oznacz.test.ts`, `tests/unit/mieszkancy-budynki.test.ts`

**Interfaces:**
- Produces: `Budynek.czlonkowie: number[]` (indeksy `geo.b` sklejonych segmentów, rosnąco); `oznaczGeo(geo: Geo, budynki: readonly Budynek[]): Geo` (kopia `geo` z tagiem `zm:bud` = `Budynek.klucz` na każdym członku; wejście nietknięte); `budynkiZGeo` bierze klucz w kolejności `zm:klucz` (format `px:…` z gałęzi multiplayera) → `osm:` → `g:`, a gdy segment ma tagi `zm:pole` (m², liczba całkowita) i `zm:wym` (`"szer,dl"` w metrach), liczy pole i wymiary z nich zamiast z obrysu.

- [ ] **Step 1:** Testy: na demach każdy indeks `geo.b` budynku mieszkalnego występuje w `czlonkowie` dokładnie jednego `Budynek`; falowiec na Przymorzu ma ≥2 członków; `oznaczGeo` nie zmienia wejścia (`structuredClone` przed i po równe) i ustawia `zm:bud` tylko członkom; syntetyczne `geo` z tagami `zm:klucz`, `zm:pole`, `zm:wym` przesunięte o 40 m (dwa środki) daje ten sam klucz, `mieszkania` i `epoka`; złote skróty demo bez zmian.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj (w `budynki.ts` wystaw już liczony `Segment.i`; klucz z największego segmentu jak dziś). **Step 4:** PASS, lint.
- [ ] **Step 5:** Commit: `Mieszkańcy: członkowie budynków, tag zm:bud, klucz z zm:klucz`.

### Task 2: Wczytywanie danych mieszkańców dla punktu

**Files:**
- Modify: `tools/dane-gminy.ts` (zapis `public/data/mieszkancy/gminy/indeks.json`), `src/mieszkancy/wczytaj.ts`, `src/mieszkancy/tabele.ts` (typ `IndeksGmin`)
- Test: `tests/unit/mieszkancy-wczytaj-dane.test.ts`

**Interfaces:**
- Produces: `interface IndeksGmin { wersja: number; gminy: { teryt: string; bbox: [number, number, number, number] }[] }` (bbox `[latMin, lonMin, latMax, lonMax]` z obrysów rejonów); `interface DaneMieszkancow { kraj: TabeleKraju; gmina: TabeleGminy | null; imiona: TabeleImion; nazwiska: TabeleNazwisk; odmiana: Odmiana }`; `wczytajDaneMieszkancow(lat: number, lon: number, fetchFn?: typeof fetch): Promise<DaneMieszkancow | null>` (równolegle kraj, imiona, odmiana, końcówki, indeks; gmina = pierwsza z indeksu, której bbox zawiera punkt i dla której `rejonDla` nie daje `zapas: 'gmina'`; nazwiska przez `wczytajNazwiskaDlaGminy`; nigdy nie rzuca; `null`, gdy brak kraju, imion, odmiany albo nazwisk).

- [ ] **Step 1:** Testy z `fetchFn` czytającym `public/`: punkt Przymorza daje `gmina.teryt === '2261011'`; punkt w Krakowie (50.0614, 19.9366) daje `gmina === null` i pełne pozostałe dane; 404 na `kraj.json` daje `null`; odpowiedź HTML ze statusem 200 na `imiona.json` daje `null`; brak `indeks.json` daje dane z `gmina === null`.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj; `npm run dane:gminy` zapisuje `indeks.json` (zwarty JSON, w `LICENCJE.md` bez zmian). **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Mieszkańcy: indeks gmin i wczytanie danych dla punktu`.

### Task 3: Osoby i mieszkania siedziby z generatora

**Files:**
- Create: `src/sim/lokatorzy.ts`
- Modify: `src/world/apts.ts` (eksport `reachable` bez zmiany zachowania), `src/content/people.ts` (`Person.ref?: string`, `Person.rodzina?: string`)
- Test: `tests/unit/lokatorzy.test.ts`

**Interfaces:**
- Consumes: `DaneMieszkancow` (Task 2), `oznaczGeo`, `Budynek.czlonkowie` (Task 1), `budynkiObszaru`, `kronikaObszaru`, `generujBudynek` (`src/mieszkancy/generuj.ts`), `pokrewienstwo`, `historiaGospodarstwa` (`src/mieszkancy/historie.ts`), `fachOsoby`, `nazwaFachu` (`fachy.ts`), `losujCechy` (`src/content/druzyna.ts`), `losDla` (`los.ts`), `AptState`, `reachable` (`src/world/apts.ts`).
- Produces:

```ts
export type OsobaGry = Pick<Person, 'first' | 'name' | 'f' | 'prof' | 'skills' | 'age' | 'traits' | 'story'> & { ref: string; rodzina: string };
export interface LokatorzyGry {
  siedziba: WynikBudynku; kronika: WpisKroniki[];
  zarzad: OsobaGry[];                                   // najwyżej `core`, w kolejności miejsc zarządu
  lokatorzy: { apt: number; osoby: OsobaGry[] }[];      // zamieszkane mieszkania parteru siedziby poza mieszkaniem z kozą
  stany: AptState[];                                    // do settleApts(world, stany)
}
export function lokatorzyGry(world: World, geo: Geo, dane: DaneMieszkancow, opts: { core: number }): LokatorzyGry | null;
export function osobaGry(o: Osoba, w: WynikBudynku, historia: readonly string[]): OsobaGry;
```

- Reguły (decyzje planu):
  - Budynek siedziby: `world.buildings[world.hq].tags['zm:bud']` wskazuje `Budynek` z `budynkiObszaru(geo, ...)`; gdy brak, zapasowy `Budynek` ze świata: klucz `hq:<lat5>,<lon5>` z `geo.c`, `typ` blok gdy `levels ≥ 3` albo `area ≥ 300`, `kondygnacje = levels`, `pole = area`, `klatki = max(1, entrances.length)`, rejon z `rejonDla`.
  - Zarząd: osoby `stan === 'tu'`, wiek 18–75, z `fach`; dla każdej dziedziny z `POTRZEBNE` po kolei osoba z najwyższym poziomem tej dziedziny spośród jeszcze niewybranych (remis: kolejność z `losDla('zarzad', klucz)`), potem dopełnienie najwyższą sumą umiejętności, najwyżej `core` osób.
  - Mieszkania parteru: lista `apt` z `world.interior` bez mieszkania z kozą (`house.home`, to zostaje `zarzad`); liczba pustych `round(n × puste / mieszkania)` z wyniku budynku; puste wybierane z `losDla('mieszkania-gry', klucz)`, najpierw spoza `reachable`; co najmniej jedno mieszkanie z `reachable` zamieszkane, gdy jakieś istnieje.
  - Powód i rok pustego: kolejne wpisy `opuszczone` z dziennika budynku rosnąco po roku: wszyscy członkowie `zmarl` → `wymarcie`, inaczej `wyjazd`; dla lat ≥ 2033 z szansą 3 000 `splądrowanie`, 1 500 `zalanie`, 1 000 `pozar` na 10 000 (decyzja gry, nie dane); rok przycięty do [2029, 2051]; gdy wpisów zabraknie, `settleApts` losuje sam (brak `why`).
  - Zamieszkane mieszkania dostają po kolei gospodarstwa budynku z co najmniej jedną obecną osobą, bez gospodarstw osób z zarządu, najpierw 1–4 obecnych.
  - `osobaGry`: `first = imie`, `name = imie + ' ' + nazwisko`, `f = plec === 'K'`, `prof` = `nazwaFachu(fach, plec)` albo dawny zawód albo „dziecko” (<16), `skills` z `fachOsoby`, `age = 2051 - rocznik`, `traits = losujCechy(losDla('cechy', o.id))`, `story` = linijka osobista („Dawniej X, dziś Y.” gdy oba są) + `historia` gospodarstwa, `ref = o.id`, `rodzina` = obecni krewni z `pokrewienstwo` w formie „mąż Marek (54), córka Agnieszka (23)”, bez numerów i pięter.

- [ ] **Step 1:** Testy na trzech demach (świat z `buildWorld(oznaczGeo(...))`): zarząd Przymorza pokrywa co najmniej 3 z 4 dziedzin; każda `OsobaGry` ma niepuste `first` i `name`; `stany` obejmują wszystkie mieszkania parteru, mieszkanie z kozą ma `zarzad`; co najmniej jedno mieszkanie z `reachable` jest zamieszkane; każde `puste` z `why` ma `year` w [2029, 2051]; dwa wywołania dają ten sam wynik; żaden tekst (`story`, `rodzina`) nie trafia w regex RODO; po usunięciu tagu `zm:bud` z siedziby wynik powstaje z zapasowego budynku; dane z `gmina = null` też dają wynik.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS; czas `lokatorzyGry` dla dema poniżej 60 ms (wypisać w raporcie; test za `ZM_PERF=1`).
- [ ] **Step 5:** Commit: `Gra: osoby i mieszkania siedziby z generatora mieszkańców`.

### Task 4: Opcja `mieszkancy` w `createSim`

**Files:**
- Modify: `src/sim/sim.ts` (`SimOpts`, pętla zarządu, `addResidents`), `src/sim/snapshot.ts` (`SimPerson.ref?`, `SimPerson.rodzina?`, `SimSnapshot.lokatorzy: SimPerson[]`)
- Test: `tests/unit/lokatorzy-sim.test.ts`

**Interfaces:**
- Consumes: `OsobaGry`, `LokatorzyGry` (Task 3).
- Produces: `SimOpts.mieszkancy?: { zarzad: readonly OsobaGry[]; lokatorzy: readonly { apt: number; osoby: readonly OsobaGry[] }[] }`. Zarząd: po zwykłej pętli `makePerson` (losowania bez zmian) `Object.assign(st.people[k], zarzad[k])` dla `k < min(core, zarzad.length)`, przed nadpisaniem przez `team` (drużyna wygrywa). Mieszkańcy: domyślna liczba `min(8, suma osób w lokatorzy, dotychczasowy wzór)`; po `addResidents` każdy pionek mieszkańca z `apt = a` dostaje kolejną osobę z listy tego mieszkania jako nowy `Person` (`id = 's' + nextId++`, `home = w.hq`, reszta pól jak w `makePerson`) i `pawn.person` = jej indeks. Przybysze z uchwał zostają anonimowi.

- [ ] **Step 1:** Testy: bez opcji istniejące `druzyna-sim.test.ts` i `sim.test.ts` przechodzą bez zmian (uruchomić); z opcją z Task 3 na trzech demach w trybie `zwykly` i `zombie` jedna doba (`TICKS_PER_DAY` kroków) bez wyjątku; zarząd ma imiona z generatora; każdy mieszkaniec z osobą ma `ref`; `snapshot(...).lokatorzy` ma ich `SimPerson`; zabity mieszkaniec z osobą ma imię we wpisie zgonu; `team` nadpisuje osoby zarządu z generatora; stan zapisany przed krokiem 5 (pionki mieszkańców z `person = -1`) wczytuje się przez `new Sim` bez błędu.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj; tam, gdzie kod zakłada `people[pawn.person]` tylko dla zarządu (`sim/gov.ts:87,121`, `sim.ts` 1141 i 5153 na 14326cd), sprawdź `pawn.kind === 'core'`. **Step 4:** PASS, `npm run bot` i `npm run bot:zombie` z tymi samymi skrótami.
- [ ] **Step 5:** Commit: `Symulacja: opcja mieszkancy, zarząd i mieszkańcy siedziby z osobami`.

### Task 5: Karta mieszkańca i wybór mieszkańca kliknięciem

**Files:**
- Modify: `src/render/view.ts` (`pickResident(st: SimState, sx: number, sy: number): Pawn | null`, tylko pionki `resident` z `person ≥ 0`), `src/main.ts` (kliknięcie bez trafienia w zarząd pokazuje kartę mieszkańca, bez dodania do zaznaczenia i bez poleceń), `src/ui/karta.ts` (`personCard`: wiersz `rodzina` pod `.sub`; dla osób z `ref` napis `<p class="fikcja">Mieszkańcy są wymyśleni na podstawie danych GUS i PESEL.</p>` i przycisk `data-card="imie"` „Zmień imię”), `src/ui/druzyna.css` (historia widoczna zwinięta także do 640 px), `src/style.css` (`.fikcja`)
- Test: `tests/unit/karta.test.ts`

**Interfaces:**
- Consumes: `SimSnapshot.lokatorzy`, `SimPerson.ref`, `SimPerson.rodzina` (Task 4).

- [ ] **Step 1:** Testy `personCard`: osoba z `ref` ma napis o fikcji i przycisk zmiany imienia, osoba bez `ref` nie ma; wiersz rodziny jest, gdy `rodzina` niepusta; HTML karty nie trafia w regex RODO.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS; `npm run shots -- karta` z nowymi scenariuszami: karta członka zarządu i mieszkańca na komputerze i telefonie (390×844), obejrzane.
- [ ] **Step 5:** Commit: `Karta mieszkańca: rodzina, historia na telefonie, napis o fikcji`.

### Task 6: Zmiana imienia z odmianą

**Files:**
- Create: `src/ui/imiona.ts`
- Modify: `src/mieszkancy/historie.ts` (`Odmiana.nadpisane?: ReadonlyMap<string, Formy>` po `Osoba.id`, używane przy wstawianiu imion), `src/sim/lokatorzy.ts` (`historieZeZmianami(l: LokatorzyGry, dane: DaneMieszkancow, zmiany: Record<string, ZmianaImienia>): Map<string, string[]>`), `src/main.ts` (obsługa `data-card="imie"`)
- Test: `tests/unit/imiona-zmiana.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ZmianaImienia { imie: string; formy: Formy }
export const IMIONA_KEY = 'za-murem-0.4-imiona';
export function wczytajZmiany(adres: string, mag?: Storage): Record<string, ZmianaImienia>;   // klucz adresu: hashString(adres); try/catch
export function zapiszZmiane(adres: string, ref: string, z: ZmianaImienia | null, mag?: Storage): void;
export function edytorImienia(o: { ref: string; first: string; f: boolean }, odm: Odmiana): string;   // 7 pól z odmien(); pola z pewne=false z klasą "niepewne"
export function sieroty(zmiany: Record<string, ZmianaImienia>, refs: ReadonlySet<string>): string[];
```

- Zmiana podmienia `first` i pierwszą część `name` osoby w `st.people` (zapis gry ją niesie), przelicza historie gospodarstw z `historieZeZmianami` i podmienia `story` osób siedziby. Wpis bez osoby: jeden komunikat w dzienniku gry („Halina wyprowadziła się.” przez `g()`) i usunięcie z pamięci.

- [ ] **Step 1:** Testy: `edytorImienia` dla „Halina” ma 7 pól z „Haliny”, „Halinie”, „Halinę”, „Haliną”, „Halinie”, „Halino”; dla „Xyz” pola z klasą „niepewne”; `wczytajZmiany`/`zapiszZmiane` na atrapie `Storage` zachowują i usuwają wpis, a uszkodzony JSON daje `{}`; `historieZeZmianami` po zmianie imienia na „Bożenka” z formą narzędnika „Bożenką” daje zdanie z „Bożenką” tam, gdzie wcześniej stała nowa forma starego imienia; `sieroty` zwraca wpisy spoza zbioru.
- [ ] **Step 2:** FAIL. **Step 3:** Zaimplementuj. **Step 4:** PASS; zrzut edytora na komputerze i telefonie, obejrzany.
- [ ] **Step 5:** Commit: `Zmiana imienia z odmianą, pamięć w przeglądarce`.

### Task 7: Wpięcie w `main.ts`, panel zarządu i atrybucja

**Files:**
- Modify: `src/main.ts` (`start`: po `await get()` status „Liczę mieszkańców…” i `await wczytajDaneMieszkancow(geo.c[0], geo.c[1])`; `enter`: `oznaczGeo` przed `buildWorld`, `lokatorzyGry`, `applyApts(world, settleApts(world, stany))`, `createSim(world, seed, { ...druzyna.opcje(), mieszkancy })`; przy wznowieniu tylko `applyApts` i historie, bez nowego `createSim`), `src/ui/druzyna.ts` (podsumowanie trybu „z adresu”: „N osoby z siedziby pod adresem”), `index.html` (w `.attrib`: `· <a href="data/mieszkancy/LICENCJE.md">mieszkańcy: GUS, PESEL, SGJP</a>`), `src/ui/okna.ts` (w arkuszu Menu linia danych z `LICENCJE.md`, sekcja „Linia do ekranu O grze”)
- Test: `tests/unit/druzyna-panel.test.ts` (nowy tekst podsumowania), `tools/shots.ts` (scenariusze)

**Interfaces:**
- Consumes: Task 2, 3, 4, 6.

- [ ] **Step 1:** Test panelu z nowym tekstem podsumowania (FAIL, potem PASS po zmianie).
- [ ] **Step 2:** Zaimplementuj wpięcie; brak danych (`null`) albo wyjątek w `lokatorzyGry` (złapany, `console.warn`) daje starą ścieżkę.
- [ ] **Step 3:** Zrzuty: `start`, `start-telefon` (atrybucja mapy dalej mieści się na pierwszym ekranie), gra na trzech demach z kartą zarządu i mieszkańca, gra z wymuszonym brakiem tabel (scenariusz z `?bezMieszkancow=1` albo przechwyceniem `fetch` w Playwright) — obejrzane.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 5:** Commit: `Gra: mieszkańcy z adresu w siedzibie, panel zarządu, atrybucja danych`.

### Task 8: Boty, bramka, dziennik

**Files:**
- Modify: `tools/bot.ts`, `tools/bot-zombie.ts` (flaga `--mieszkancy`: dane z `public/` przez `fs`, `oznaczGeo`, `lokatorzyGry`, `applyApts`, `createSim` z opcją), `docs/POSTEP.md`
- Test: uruchomienia botów

- [ ] **Step 1:** `npm run bot` i `npm run bot:zombie` bez flagi: skróty jak przed krokiem 5.
- [ ] **Step 2:** `npm run bot -- --mieszkancy` i `npm run bot:zombie -- --mieszkancy`: pierwsza doba bez błędu w obu trybach; nowe skróty wypisane i wpisane do POSTEP.
- [ ] **Step 3:** Bramka z Global Constraints; wpis w `docs/POSTEP.md` (co weszło, czasy, zrzuty, co zostaje: klucze `zm:pole` z importu, jeśli nie weszły); raport do integratora.
- [ ] **Step 4:** Commit: `Boty z mieszkańcami z adresu, dziennik kroku 5`.

## Poza tym planem

Stan pustych mieszkań poza siedzibą (inne budynki nie mają wnętrz), mieszkańcy innych klatek jako pionki, cała Polska w tabelach (krok 6), wagi fachów od okolicy (R42).
