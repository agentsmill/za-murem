# Osada AI, etap 2: druga gra na sąsiednim kwadracie — plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Osada AI żyje w grze jako druga, pełna gra na sąsiednim kwadracie: powstaje o 6:00 drugiego dnia, idzie krok w krok z naszą, trafia do zapisu, odsłania się przy pierwszym kontakcie i widać jej kwadrat z kartą osady.

**Architecture:** Silnik z etapu 1 (`src/ai/gra.ts`, `silnik`) prowadzi osobną grę (`GraAi`) na własnym świecie z geo sąsiedniego kwadratu (geo przesunięte do siedziby i zwykłe `buildWorld`, jak w rozpoznaniu). Wybór kwadratu i świat osady to czyste funkcje w `src/ai/kwadrat.ts`; przeglądarkową stronę (dane kandydatów, start, krok, zapis) trzyma `src/ui/osada.ts` bez PixiJS; zarząd poznaje osadę tylko przez pole wejścia i odpowiada skutkiem „odkryj”, więc `src/gov` dalej nie importuje symulacji. Wszystko za flagą `?osada=1`.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 8, PixiJS 8 (tylko `src/render/view.ts` i warstwy), Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-10-20-osada-ai-design.md` (rozdziały „Jak to wygląda dla gracza”, „Architektura”, „Kolejność budowy” punkt 2, „Bramka”), raport etapu 1 `docs/ocena/2026-10-24-osada-ai-etap-1.md` (rozdział 9) i decyzja Mateusza z 24.10.2026 w `docs/POSTEP.md` (podsekcja „Osada AI, etap 1”).

## Global Constraints

- Flaga: nowa gra z `?osada=1` dostaje osadę; zapis pamięta to, z czym grę zaczęto (jak `pietra`). Bez flagi gra jest bajt w bajt dzisiejsza: skróty `npm run bot` d3ad7f01 (po 3 dobach 701b05aa), `npm run bot -- --mieszkancy` cde4a7d4 / 8b2da769, `npm run bot:zombie` 0c2b02dd / 7fd3bed5, a zapis bez flagi nie ma pola `osada`.
- Tryb zwykły: w trybie zombie osady nie ma (spec, „Nie-cele”).
- Start osady w stałym punkcie: tick `tickAt(2, 6)` (6:00 drugiego dnia, `src/sim/handlarz.ts`); w tej chwili gra osady liczy się od swojego ticka 0 do tego ticka (nadrabianie), potem idzie krok w krok z naszą. Brak danych kwadratu do tej chwili: zapis dostaje „bez osady” i gra idzie dalej bez niej.
- Reguła miejsca (Mateusz, 24.10.2026): kandydaci to osiem kwadratów wokół domu w kolejności z ziarna gry; siedziba to największy budynek mieszkalny blisko środka kwadratu z co najmniej trzema pokojami, blok z mieszkańcami z generatora i co najmniej `PROG_JEDZENIA_OSADY = 300` porcji jedzenia w zasięgu 720 m (`MAX_OKOLICA_M`); pierwszy kandydat, który spełnia, wygrywa; żaden: gra bez rywala.
- Zarząd osady: bez łańcuchów kart (`lancuchy: false`), z tempem przeglądarki (`tempoPrzegladarki: true`), obcy, okolica i ludność 2021 z jej kwadratu, cztery osoby zarządu.
- Determinizm: losowanie tylko z ziaren obu gier; ziarno osady z ziarna gry i kwadratu; ten sam przebieg z zapisem i wczytaniem w połowie daje te same skróty obu gier; przebieg nie zależy od chwili, w której przyszły dane kwadratu (byle przed startem).
- Granica etapu: bez ludzi między grami, dyplomacji, handlu, napadów i żywego widoku ich pionków (etap 3); kontakt to karta zarządu, a widok kwadratu pokazuje to, co widzieliśmy. Zasad gry nie zmieniamy (decyzja 4).
- `src/ai/` bez DOM, modułów Node, `Math.random`, `Date`, `performance` i importów z `tests/` i `tools/`; `src/gov/` nie importuje `src/sim/` ani `src/ai/`; PixiJS tylko w `src/render/view.ts` i `*Layer.ts`.
- Teksty po polsku i angielsku, liczby przez `src/ui/tekst.ts`, komentarze po polsku, nagłówek każdego pliku opisuje kontrakt; commity po polsku ze stopką `Co-Authored-By`.

## Review Focus

1. Zapis zrobiony przed 6:00 drugiego dnia (osada „czeka”) i wczytany po tej godzinie: osada ma powstać tak samo jak bez przeładowania (test w zadaniu 3).
2. Tempo 8× z limitem 40 kroków na klatkę: gra osady robi dokładnie tyle kroków co nasza, także gdy pętla zrzuca zaległość (`acc = 0`) (test w zadaniu 3).
3. Prawdziwy adres bez sieci albo z wolnym pobieraniem: ekran startowy i pętla nie czekają, po 6:00 drugiego dnia jest „bez osady”, konsola bez lawiny błędów (test w zadaniu 3).
4. Dwie gry w jednym zapisie a limit localStorage: zapis po 45 dniach z osadą mieści się w ustalonym rozmiarze, a nieudany zapis nie kasuje poprzedniego (test w zadaniu 3).
5. Przewijanie `zm.ff` i `govTick` (zrzuty, testy) prowadzą osadę tak jak pętla klatek (test w zadaniu 3).

---

### Task 1: Silnik gotowy na grę w przeglądarce (uwagi przeglądu końcowego etapu 1)

**Files:**
- Modify: `src/ai/gra.ts` (izolacja błędów decydenta, limit dziennika zawieszonych, odpowiedź na nieznane okna jako opcja)
- Modify: `tools/bot-osada.ts`, `tools/osada-ocena.ts` (flaga `--bez-lancuchow`)
- Create: `tests/unit/ai-czystosc.test.ts`
- Modify: `tests/unit/ai-gra.test.ts`, `tests/unit/ai-pomoc.ts` i najwolniejsze `tests/unit/ai-*.test.ts` (wspólna gra na plik)

**Interfaces:**
- Produces: `OpcjeGryAi.odpowiedzNaNieznane?: boolean` (bez opcji okno nieznanego rodzaju zostaje i idzie do `zawieszone`; z opcją dostaje pierwszy dozwolony wybór jak dziś); `GraAi.bledy: { s: number; gdzie: 'start' | 'okno' | 'tura'; tekst: string }[]` (najwyżej `MAX_BLEDOW = 50`, poza zapisem i skrótem); `GraAi.zawieszone` trzyma najwyżej `MAX_ZAWIESZONYCH = 100` ostatnich wpisów, a `GraAi.zawieszonychRazem: number` liczy wszystkie.

- [ ] **Step 1: Testy (czerwone):**
  - `ai-czystosc.test.ts`: każdy plik `src/ai/*.ts` czytany jako tekst nie ma importu spoza `src/` ani z `tests/`, `tools/`, `node:`, `fs`, `path`, nie ma słów `Math.random`, `Date.`, `performance.`, `window.`, `document.`, `localStorage`.
  - `ai-gra.test.ts` „decydent rzuca w `okno` i w `tura`: gra idzie dalej, okno zamyka odpowiedź domyślna, `bledy` ma wpis z `gdzie` i sekundą, skrót gry równy grze z decydentem, który nie rzuca, ale zamiast rzutu nic nie robi”.
  - „nieznany rodzaj okna bez `odpowiedzNaNieznane` zostaje i trafia do `zawieszone`; z opcją dostaje wybór 0” (okno podstawione hakiem testowym, jak dziś w testach okien).
  - „1000 sekund z zawieszonym oknem: `zawieszone.length` równa się 100, `zawieszonychRazem` 1000”.
- [ ] **Step 2:** `npx vitest run tests/unit/ai-gra.test.ts tests/unit/ai-czystosc.test.ts` — FAIL.
- [ ] **Step 3:** Zmiany w `src/ai/gra.ts` (try/catch wokół `d.start`, `d.okno`, `d.tura` w `krokGry`; tekst błędu bez stosu; nagłówek modułu o obu nowych zasadach). Uprząż: `przygotujGre` przyjmuje `lancuchy` z flagi `--bez-lancuchow` (domyślnie jak dziś: z łańcuchami), wiersz nagłówka wyjścia mówi, jak grano; `--bez-lancuchow` przekazuje też `odpowiedzNaNieznane: false`, a domyślny przebieg uprzęży jawnie `false`, żeby nowy rodzaj okna z innej gałęzi był widać jako błąd przebiegu.
- [ ] **Step 4:** Testy `ai-` szybciej: gry-prefiksy (ten sam dem, ziarno i liczba dni w kilku testach jednego pliku) liczone raz na plik przez `zapiszGre`/`wczytajGre` w `tests/unit/ai-pomoc.ts` (`graPoDniach(demo, ziarno, dni): GraAi`, pamięć w obrębie procesu). Cel: `npx vitest run tests/unit/ai-` na spokojnej maszynie najwyżej 35 s (dziś 53 s); zmierz przed i po.
- [ ] **Step 5:** `npx vitest run tests/unit/ai-`, `npm test`, `npx biome check src tests tools index.html`, `npx tsc -p . --noEmit`, `npm run bot` (d3ad7f01 / 701b05aa), `node tools/bot-osada.ts --bez-progu` (tabela bez zmian względem 898e016 co do skrótów przebiegów). PASS.
- [ ] **Step 6: Commit** `Osada AI: silnik odporny na błąd decydenta, czystość src/ai pilnowana testem, szybsze testy silnika`.

### Task 2: Gdzie staje osada i nowa miara bramki

**Files:**
- Create: `src/ai/kwadrat.ts`, `tests/unit/ai-kwadrat.test.ts`, `tools/osada-kwadraty.ts`
- Modify: `tools/osada-ocena.ts`, `tools/bot-osada.ts` (miara bramki z decyzji 2 i wykluczenie dem, które nie spełniają reguły miejsca)

**Interfaces:**
- Consumes: `buildWorld` (`src/world/world.ts`), `srodekKwadratu`, `sasiedzi8`, `ukladDomu`/`ukladZGeo`, `kluczKwadratu` (`src/world/kwadraty.ts`), `mapaMieszkancow`, `ludnoscSpisu2021` i `mieszkancyNowejGry`, `opcjaMieszkancow` (`src/sim/osiedle.ts`), `miejscaZPoi` (`src/world/miasto.ts`), `celZMiejsca`, `MAX_OKOLICA_M` (`src/gov/wyprawy.ts`), `rngOf`/`hashString` (`src/core/rng.ts`).
- Produces (wszystko w `src/ai/kwadrat.ts`):

```ts
export const PROG_JEDZENIA_OSADY = 300;
/** porcje jedzenia w miejscach okolicy do `promien` metrów od siedziby, liczone jak zapas miejsca razy udział jedzenia w łupie */
export function jedzenieWZasiegu(miejsca: readonly Miejsce[], promien?: number): number;
/** osiem kwadratów wokół domu (0, 0) w kolejności z ziarna gry (Fisher–Yates z rngOf, nigdy sort z losowaniem) */
export function kandydaciOsady(seed: number): [number, number][];
/** ziarno gry osady z ziarna naszej gry i kwadratu (hashString z prefiksem „osada”), różne od seedKwadratu */
export function ziarnoOsady(seed: number, sx: number, sy: number): number;
export interface SwiatOsady {
  klucz: string; sx: number; sy: number;
  /** geo kwadratu przesunięte tak, że siedziba wypada w środku świata (to geo idzie do zapisu) */
  geo: Geo;
  world: World;
  opcje: OpcjeGryAi; // core 4, obcy, mieszkancy, okolica, ludnosc2021, tempoPrzegladarki, lancuchy false, odpowiedzNaNieznane true
  nazwa: Tx; // nazwa osady do kart i mapy (z ulicy siedziby, inaczej „Osada na północy/…” z kierunku od domu)
  kierunek: Tx; // kierunek od domu do kwadratu („na północ”, “to the north”…), do karty posła i karty osady
  jedzenie: number;
}
/** świat osady dla jednego kandydata albo powód odrzucenia */
export function swiatOsady(geoKwadratu: Geo, sx: number, sy: number, dane: DaneMieszkancow | null, seed: number):
  SwiatOsady | { odrzucony: 'siedziba' | 'mieszkancy' | 'jedzenie' };
/** pierwszy kandydat w kolejności z ziarna, który spełnia regułę, albo null */
export function wybierzOsade(seed: number, kandydaci: Readonly<Record<string, Geo>>, dane: DaneMieszkancow | null):
  SwiatOsady | null;
```

- [ ] **Step 1: Testy (czerwone)** w `tests/unit/ai-kwadrat.test.ts`:
  - `jedzenieWZasiegu` na okolicy domów trzech dem (geo z `public/demo`, odległość od adresu): Przymorze 855 ± 3%, Lanciego 1167 ± 3%, Zielonki 17 ± 3 (liczby z raportu etapu 1, rozdział 6).
  - `kandydaciOsady(11)` zawiera dokładnie osiem par z `sasiedzi8(0, 0)`, dwa wywołania dają to samo, ziarna 11 i 12 dają różną kolejność.
  - `swiatOsady` dla domu Zielonek (przesunięty jak kandydat) odrzuca z powodem `jedzenie` albo `mieszkancy`; dla kandydata Przymorza, który spełnia regułę w pomiarze z kroku 3, daje świat, na którym `createSim` działa, siedziba ma co najmniej 3 pokoje i mieszkańców z generatora, a `nazwa` ma obie wersje językowe.
  - `wybierzOsade` bez danych mieszkańców (`dane` null) zwraca null (reguła wymaga mieszkańców).
- [ ] **Step 2:** `npx vitest run tests/unit/ai-kwadrat.test.ts` — FAIL.
- [ ] **Step 3: Zaimplementuj `src/ai/kwadrat.ts`.** Siedziba: budynki mieszkalne geo kwadratu w promieniu 120 m od środka posortowane malejąco po polu; dla kolejnych geo przesuwa się tak, że środek budynku wypada w (0, 0), i `buildWorld` (siedzibą zostaje najbliższy budynek, rozpoznanie: `docs/ocena/2026-10-19-osada-ai-rozpoznanie.md`, „Pełny świat z siedzibą dla sąsiada”); pierwszy z co najmniej 3 pokojami wygrywa, najwyżej 4 próby. Mieszkańcy przez `mapaMieszkancow` i `mieszkancyNowejGry` na tym świecie; okolica przez `miejscaZPoi` z geo osady (odległości od jej środka).
- [ ] **Step 4: Narzędzie `tools/osada-kwadraty.ts`:** dla 20 sąsiednich kwadratów trzech dem (`public/demo/*-kwadraty.json`) tabela: klucz, siedziba (pole, pokoje), mieszkańcy, jedzenie w zasięgu, wynik reguły; na końcu, ile kwadratów spełnia regułę na demo i który wybiera `wybierzOsade` dla ziaren 11–15. Wynik wklej do raportu zadania (próg 300 sprawdzony na 20 kwadratach, jak chce raport etapu 1).
- [ ] **Step 5: Nowa miara bramki (decyzja 2) w `tools/osada-ocena.ts`:** przeżycie zaliczone, gdy pierwsze odwołanie zarządu przychodzi nie wcześniej niż w 30. dniu (albo go nie ma) w co najmniej 4 z 5 ziaren; budowle zostają w tabeli, ale nie w werdykcie; demo, którego dom nie spełnia reguły miejsca (`swiatOsady` z geo domu), jest w tabeli z dopiskiem „poza regułą miejsca” i nie wchodzi do werdyktu. Test w `tests/unit/ai-ocena.test.ts` (albo istniejącym pliku testów oceny): przebieg z pierwszym odwołaniem w dniu 29 nie zalicza, w 30 zalicza; budowle 0 nie psują werdyktu; demo poza regułą nie liczy się do werdyktu.
- [ ] **Step 6:** `npx vitest run tests/unit/ai-`, `npm test`, Biome, tsc, `node tools/osada-kwadraty.ts`, `npm run bot:osada` (kod wyjścia i werdykt w raporcie: Przymorze i Lanciego według nowej miary, Zielonki poza regułą).
- [ ] **Step 7: Commit** `Osada AI: wybór kwadratu osady (siedziba, mieszkańcy, jedzenie w zasięgu) i miara bramki z decyzji Mateusza`.

### Task 3: Druga gra w przeglądarce: start, krok w krok, zapis

**Files:**
- Create: `src/ui/osada.ts` (bez PixiJS i bez DOM poza `fetch` przekazanym z zewnątrz), `tests/unit/osada-gra.test.ts`
- Modify: `src/ui/zapis.ts` (`Save.osada`, kontrola kształtu w `readSave`), `src/main.ts` (flaga, dane kandydatów, krok w `frame`, `zm.ff`, `zm.govTick`, zapis i wczytanie, `window.zm.osada`), `src/world/load.ts` (`geoKwadratu(uklad, sx, sy): Promise<Geo>` dla prawdziwego adresu, tymi samymi kafelkami co dom: `kafelkiKwadratu`)

**Interfaces:**
- Consumes: `wybierzOsade`, `ziarnoOsady`, `SwiatOsady` (zadanie 2); `nowaGraAi`, `grajDo`, `krokGry`, `zapiszGre`, `wczytajGre`, `ZapisGryAi`, `GraAi` (`src/ai/gra.ts`); `silnik` (`src/ai/silnik.ts`); `tickAt` (`src/sim/handlarz.ts`); `loadDemoKwadraty` (`src/world/load.ts`).
- Produces (`src/ui/osada.ts`):

```ts
export const TICK_STARTU_OSADY: number; // tickAt(2, 6)
export type StanOsady =
  | { v: 1; stan: 'czeka' }
  | { v: 1; stan: 'brak'; powod: 'dane' | 'regula' | 'blad' }
  | { v: 1; stan: 'jest'; klucz: string; geo: Geo; world: string; gra: ZapisGryAi; odkryta: boolean;
      kontakt?: { dzien: number; ludnosc: number; budowle: number } };
export interface OsadaGry {
  /** dane kandydatów: wołane raz po starcie gry (demo od razu, prawdziwy adres w tle); po starcie osady bez skutku */
  dane(kandydaci: Readonly<Record<string, Geo>>): void;
  /** krok po kroku naszej symulacji, z naszym tickiem po kroku: przed startem nic, w ticku startu wybór i nadrabianie, potem krokGry */
  krok(nasz: number): void;
  readonly gra: GraAi | null;
  readonly swiat: SwiatOsady | null;
  odkryj(kontakt: { dzien: number; ludnosc: number; budowle: number }): void;
  zapisz(): StanOsady;
}
export function nowaOsadaGry(seed: number, dane: DaneMieszkancow | null): OsadaGry;
/** wczytanie: stan 'jest' odbudowuje świat z zapisanego geo przez `buildWorld` i stany mieszkań przez `mieszkancyZapisu`
    na zapisanym stanie symulacji osady, tak jak `enter()` robi to dla naszej gry; odcisk `world` (worldKey) musi się
    zgadzać, inaczej 'brak' z powodem 'blad' */
export function osadaZZapisu(s: StanOsady, seed: number, dane: DaneMieszkancow | null): OsadaGry;
/** do Save: undefined, gdy gra jest bez flagi (zapis bez pola, bajt w bajt dzisiejszy) */
```
- `Save.osada?: StanOsady` w `src/ui/zapis.ts`; `readSave` odrzuca zapis, w którym `osada` ma zły kształt (od niego zależy przebieg), a brak pola znaczy grę bez osady.
- `window.zm.osada: () => { stan: StanOsady['stan']; klucz?: string; odkryta?: boolean; skrot?: string; tick?: number } | null`.

- [ ] **Step 1: Testy (czerwone)** w `tests/unit/osada-gra.test.ts` (Node, prawdziwa symulacja Przymorza z danymi mieszkańców jak w testach generatora, nasza gra prowadzona `playWithGov`-owym krokiem przez wspólną funkcję testową):
  - „osada powstaje w ticku `TICK_STARTU_OSADY` i od tej chwili `gra.sim.st.tick` równa się naszemu tickowi” (krok w krok).
  - „dane podane w ticku 100 i w ticku `TICK_STARTU_OSADY - 1` dają ten sam skrót osady po 5 dniach”.
  - „bez danych do ticku startu: `zapisz()` daje `{ stan: 'brak', powod: 'dane' }`, dane podane później nic nie zmieniają”.
  - „zapis z `stan: 'czeka'` zrobiony o 5:00 drugiego dnia i wczytany: osada startuje o 6:00 tak samo jak bez przeładowania (skróty obu gier po 5 dniach równe)” (Review Focus 1).
  - „zapis i wczytanie w 4. dniu: skróty obu gier po 8 dniach równe przebiegowi bez przerwy” (spec, Bramka: determinizm).
  - „bez flagi: `save()` nie ma pola `osada`, skrót naszej gry po 3 dobach 701b05aa” (Global Constraints).
  - „zapis po 45 dniach z osadą: `JSON.stringify(save).length` najwyżej 4 000 000 znaków; zmierzona liczba w nazwie testu” (Review Focus 4; przy przekroczeniu stop i raport, kompresja to decyzja kontrolera).
  - „tryb zombie z flagą: osady nie ma (`brak`, powód `regula`)”.
- [ ] **Step 2:** `npx vitest run tests/unit/osada-gra.test.ts` — FAIL.
- [ ] **Step 3: Zaimplementuj `src/ui/osada.ts`** (wybór w ticku startu przez `wybierzOsade`, `nowaGraAi(swiat.world, ziarnoOsady(...), swiat.opcje)`, nadrabianie `grajDo(gra, silnik, TICK_STARTU_OSADY)`, potem `krokGry(gra, silnik)` raz na nasz krok) i pole w `src/ui/zapis.ts`.
- [ ] **Step 4: `src/main.ts`:** flaga `?osada=1` przy nowej grze (zapis wygrywa z adresem, jak `pietraWlaczone`); dane kandydatów: demo z `loadDemoKwadraty(key)`, prawdziwy adres przez `geoKwadratu` w tle po starcie, po kolei w kolejności `kandydaciOsady`, bez blokowania startu i bez powtórek po błędzie (jedno ostrzeżenie w konsoli); `osada.krok(sim.st.tick)` zaraz po każdym `sim.step()` w `frame` i w `zm.ff`/`govTick` (jedna funkcja kroku dla obu miejsc, Review Focus 2 i 5); `save()` dokłada `osada: osada.zapisz()`; `enter()` odbudowuje przez `osadaZZapisu`. Wpis parametru w nagłówku `src/main.ts` i w CLAUDE.md (lista parametrów adresu).
- [ ] **Step 5: Testy przeglądarkowe** (scenariusze w `tools/shots.ts` albo nowym `tools/shots-osada.ts`, wpięte jak `shots-cele.ts`): `osada-start` (`?demo=przymorze&osada=1`, `zm.ff` do 7:00 drugiego dnia: `zm.osada().stan === 'jest'`, tick osady równy naszemu); `osada-8x` (tempo 8× przez 60 s przy ekranie: ticki równe, Review Focus 2); `osada-bez-sieci` (adres nie-demo z przechwyconym `fetch` zwracającym błąd: gra startuje, po 6:00 drugiego dnia `brak`/`dane`, w konsoli najwyżej jedno ostrzeżenie, Review Focus 3).
- [ ] **Step 6:** `npm test`, Biome, tsc, `npm run build`, `npm run bot`, `npm run bot -- --mieszkancy`, `npm run bot:zombie` (skróty z Global Constraints), `npm run shots -- osada`.
- [ ] **Step 7: Commit** `Osada AI w grze: druga gra od 6:00 drugiego dnia krok w krok z naszą, w zapisie, za flagą ?osada=1`.

### Task 4: Pierwszy kontakt odsłania osadę

**Files:**
- Modify: `src/gov/typy.ts` (`GovInput.osada`, `GovEffects.odkryjOsade`), `src/gov/wydarzenia.ts` albo nowy `src/gov/kontakt.ts` (karta kontaktu), `src/gov/tresc.ts` i `src/gov/tresc.en.ts` (teksty), `src/main.ts` (`input()` dokłada `osada`, `applyFx` odsłania), `src/ui/osada.ts` (`odkryj`)
- Test: `tests/unit/osada-kontakt.test.ts`

**Interfaces:**
- Consumes: `OsadaGry.odkryj`, `StanOsady.kontakt` (zadanie 3).
- Produces: `GovInput.osada?: { nazwa: Tx; kierunek: Tx; odkryta: boolean; dzienKontaktu: number; ludnosc: number; budowle: number }` (gospodarz wypełnia z gry osady w chwili wejścia); `GovEffects.odkryjOsade?: true`; `dzienKontaktu = 4 + (ziarnoOsady(...) % 3)` (dni 4–6, z ziarna, spec „Jak to wygląda dla gracza”).

- [ ] **Step 1: Testy (czerwone):** karta „Poseł z osady …” / “An envoy from …” pojawia się raz, w dniu `dzienKontaktu` od 9:00, nigdy przed 4. dniem, tylko gdy `GovInput.osada` jest i `odkryta` fałsz; każdy wybór daje `odkryjOsade`; tekst podaje nazwę, kierunek i to, co poseł mówi o osadzie (ludność, budowle w chwili kontaktu, liczby przez `src/ui/tekst.ts`); bez `GovInput.osada` pula kart i losowania zarządu bez zmian (skrót `npm run bot` 701b05aa po 3 dobach i skrót zarządu z istniejącego testu determinizmu bez zmian); zapis w połowie (karta czeka) i wczytanie daje tę samą kartę.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Zaimplementuj** kartę na tych samych mechanizmach co inne karty zarządu (wybory, ok, tekst), bez nowego rodzaju okna (silnik osady i tak go nie zobaczy, a nasz interfejs zna karty). `main.ts`: `input()` dokłada `osada` z `osada.swiat` i `osada.gra` (ludność `populacja(st).razem`, budowle stojące), `applyFx` przy `odkryjOsade` woła `osada.odkryj(...)`, a widok odsłania kwadrat (zadanie 5).
- [ ] **Step 4:** `npm test`, Biome, tsc, boty (skróty bez zmian), zrzut `osada-kontakt` (karta posła na komputerze po polsku i na telefonie po angielsku) obejrzany.
- [ ] **Step 5: Commit** `Osada AI: pierwszy kontakt (poseł w dniach 4–6) odsłania osadę`.

### Task 5: Widok ich kwadratu i karta osady

**Files:**
- Create: `src/ui/kartaOsady.ts` (HTML karty, bez PixiJS), `tests/unit/karta-osady.test.ts`
- Modify: `src/main.ts` (kwadrat osady w widoku, klik w ich siedzibę, mapa miasta), `src/render/view.ts` (mgła „nieodkryte” obok istniejącej „brak danych”, jeśli potrzebna; etykieta nazwy nad budynkiem siedziby), `src/style.css`

**Interfaces:**
- Consumes: `buildKwadrat`, `opcjeSceny`, `buildScene`, `view.dodajKwadrat` (jak `dodajKwadraty` w `src/main.ts`), `OsadaGry.swiat` (klucz, geo, nazwa), `StanOsady.kontakt`, klucze budynków (`src/world/klucze.ts`) do znalezienia ich siedziby w świecie kwadratu sklejonym z domem.
- Produces: `kartaOsadyHtml(o: { nazwa: Tx; kierunek: Tx; kontakt: { dzien: number; ludnosc: number; budowle: number } }): string` (język bieżący przez `tr`/`L` z `src/core/jezyk.ts`, jak inne karty); `window.zm.osada()` z polem `kwadrat` (numer w widoku albo -1).

- [ ] **Step 1: Testy (czerwone):** `kartaOsadyHtml` po polsku i angielsku: nazwa, kierunek, „z ostatniego kontaktu (dzień N)”, ludność i budowle przez `tekst.ts`, bez przycisków dyplomacji (etap 3), bez polskich liter w wersji angielskiej poza nazwą własną; przed odkryciem kwadrat osady nie trafia do widoku jako kwadrat z budynkami (sprawdzenie przez `zm.osada().kwadrat === -1` w scenariuszu zrzutu).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Zaimplementuj:** po odkryciu (także po wczytaniu odkrytej osady) kwadrat osady buduje się jak kwadrat z `?kwadraty=` (`buildKwadrat` z geo kwadratu sprzed przesunięcia, sklejony z domem) i trafia do widoku; nad ich siedzibą etykieta z nazwą; klik w budynek siedziby otwiera kartę osady (zwykła karta jak karta budynku, przycisk zamknięcia, Esc); przed odkryciem kwadrat zostaje pod mgłą; mapa miasta pokazuje nazwę osady na jej kwadracie po odkryciu. Ich pionków nie rysujemy (etap 3: tylko gdy są tam nasi ludzie).
- [ ] **Step 4: Zrzuty** `osada-widok` (Przymorze, po kontakcie, `cam` na ich kwadrat, komputer PL), `osada-karta` (karta osady, komputer PL i telefon 390×844 EN), `osada-mgla` (przed kontaktem); obejrzane; atrybucja mapy widoczna na każdym.
- [ ] **Step 5:** `npm test`, Biome, tsc, `npm run build`, `npm run shots -- osada`, boty bez zmian skrótów.
- [ ] **Step 6: Commit** `Osada AI: widok ich kwadratu po odkryciu i karta osady`.

### Task 6: Bramka etapu i dziennik

**Files:**
- Modify: `tools/perf.ts` (flaga `--osada`), `docs/POSTEP.md` (wpis w „Zrobione”, decyzje do przejrzenia w „Decyzjach”), `CLAUDE.md` (parametr `osada=1`, `window.zm.osada`, akapit architektury o `src/ai` i `src/ui/osada.ts`)

- [ ] **Step 1:** `npm run perf -- --osada` (osada w tle, Przymorze, po 6:00 drugiego dnia) i bez flagi na tym samym HEAD: laptop i telefon (CPU 4×) bez spadku poniżej 55 kl/s i bez klatek ponad 33 ms; liczby do raportu.
- [ ] **Step 2: Pełna bramka:** `npm test`, `npx biome check src tests tools index.html`, `npm run build`, `npm run bot` i `npm run bot -- --mieszkancy` i `npm run bot:zombie` (skróty z Global Constraints), `npm run bot:osada` (werdykt według nowej miary), `npm run shots -- --dalej` (cały zestaw, kod 0) i obejrzane zrzuty `osada-*`.
- [ ] **Step 3: Dziennik i CLAUDE.md:** co zbudowane, liczby z bramki i z `tools/osada-kwadraty.ts` (ile kwadratów spełnia regułę na każdym demie), co dalej (etap 3: ludzie między grami, dyplomacja, napady), decyzje do przejrzenia (nazwa osady, dzień i forma pierwszego kontaktu, próg rozmiaru zapisu).
- [ ] **Step 4: Commit** `Osada AI: etap 2 (druga gra na sąsiednim kwadracie) z bramką`.
